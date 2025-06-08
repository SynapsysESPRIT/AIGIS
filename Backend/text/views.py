from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
import torch
from torch import nn
from transformers import RobertaTokenizer, RobertaModel, RobertaConfig
import os
import traceback
import logging
import gc
import warnings
from transformers import logging as transformers_logging
import requests  # Added for Gemini API call
import torch.nn.init as init # Added for weight initialization

# Suppress unnecessary warnings
warnings.filterwarnings("ignore", category=FutureWarning)
transformers_logging.set_verbosity_error()

# Set up logging
logger = logging.getLogger(__name__)

class ModeleRoBERTa(nn.Module):
    def __init__(self):
        super(ModeleRoBERTa, self).__init__()
        self.roberta = RobertaModel.from_pretrained('roberta-base')
        self.classification_head = nn.Linear(self.roberta.config.hidden_size, 3)  # 3 classes

        # Initialisation des poids pour correspondre à la référence
        init.xavier_uniform_(self.classification_head.weight)
        self.classification_head.bias.data.zero_()

    def forward(self, input_ids, attention_mask):
        # Simplification pour correspondre à la référence, en laissant RobertaModel gérer les position_ids
        outputs = self.roberta(input_ids=input_ids, attention_mask=attention_mask)
        logits = self.classification_head(outputs.pooler_output)
        return logits

model = None
tokenizer = None

def load_model_and_tokenizer():
    global model, tokenizer
    try:
        gc.collect()
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        aigis_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        logger.info(f"Aigis directory: {aigis_dir}")
        model_path = os.path.join(aigis_dir, 'models', 'modele_robertaya.pth')
        logger.info(f"Looking for model at: {model_path}")
        if not os.path.exists(model_path):
            logger.error(f"Model file not found at: {model_path}")
            # Attempt to find it in an alternative common location if needed, or raise error
            # For simplicity, assuming the primary path is the one to check thoroughly
            raise FileNotFoundError(f"Model file not found at {model_path}")

        logger.info("Loading tokenizer...")
        tokenizer = RobertaTokenizer.from_pretrained(
            'roberta-base',
            # Consider if local_files_only and cache_dir are strictly necessary or if default behavior is fine
            # local_files_only=True, 
            # cache_dir=os.path.join(aigis_dir, 'cache')
        )
        logger.info("Creating RoBERTa model instance...")
        model = ModeleRoBERTa()
        
        model_expected_keys = set(model.state_dict().keys())
        logger.info(f"Model architecture expects keys: {model_expected_keys}")

        logger.info(f"Loading state_dict from file: {model_path}...")
        state_dict_from_file = torch.load(model_path, map_location=torch.device('cpu'))
        loaded_file_keys = set(state_dict_from_file.keys())
        logger.info(f"Keys found in loaded state_dict from file: {loaded_file_keys}")

        # Detailed check for critical classification head keys
        critical_keys = ['classification_head.weight', 'classification_head.bias']
        for key in critical_keys:
            if key not in loaded_file_keys:
                logger.error(f"CRITICAL DIAGNOSTIC: Key '{key}' is MISSING from the loaded state_dict file ('{model_path}'). The model will use its initialized (untrained) weights for this part.")
            else:
                logger.info(f"CRITICAL DIAGNOSTIC: Key '{key}' is PRESENT in the loaded state_dict file.")
                expected_shape = model.state_dict().get(key).shape if model.state_dict().get(key) is not None else "N/A (key not in model arch)"
                actual_shape = state_dict_from_file[key].shape
                if str(expected_shape) == "N/A (key not in model arch)": # Should not happen if key is in critical_keys and model def
                     logger.error(f"CRITICAL DIAGNOSTIC: Key '{key}' defined as critical but not found in model architecture. Check ModeleRoBERTa class definition.")
                elif expected_shape != actual_shape:
                    logger.error(f"CRITICAL DIAGNOSTIC: Shape mismatch for key '{key}'. Model expects: {expected_shape}, File has: {actual_shape}. This key will likely be skipped or cause errors during loading.")
                else:
                    logger.info(f"CRITICAL DIAGNOSTIC: Shape match for key '{key}'. Model expects: {expected_shape}, File has: {actual_shape}. This key should load correctly if its values are valid.")

        # Filter state_dict from file to only include keys present in the model architecture and with matching shapes
        current_model_state_dict_keys = model.state_dict().keys() # Same as model_expected_keys
        filtered_state_dict_to_load = {}
        for key, value_from_file in state_dict_from_file.items():
            if key in current_model_state_dict_keys:
                model_param_shape = model.state_dict()[key].shape
                if value_from_file.shape == model_param_shape:
                    filtered_state_dict_to_load[key] = value_from_file
                else:
                    logger.warning(f"FILTERING: Shape mismatch for key '{key}'. Model expects {model_param_shape}, file has {value_from_file.shape}. Skipping this key for loading.")
            else:
                logger.warning(f"FILTERING: Unexpected key '{key}' found in state_dict file (not in current model architecture). This key will be ignored.")
        
        keys_actually_loading = set(filtered_state_dict_to_load.keys())
        logger.info(f"Keys that will be attempted for loading (present in model & file, shapes match): {keys_actually_loading}")

        missing_keys_for_final_load = model_expected_keys - keys_actually_loading
        if missing_keys_for_final_load:
            logger.warning(f"FINAL CHECK: Keys that will use initialized weights (because they were missing from file, had shape mismatches, or other issues): {missing_keys_for_final_load}")
        else:
            logger.info("FINAL CHECK: All expected model keys are present in the filtered state_dict to be loaded.")

        model.load_state_dict(filtered_state_dict_to_load, strict=True) # Use strict=True with the filtered dict
        # If strict=True fails here, it means there's a discrepancy even with the filtered_state_dict_to_load,
        # which would be unexpected if filtering is correct. Can revert to strict=False if issues arise from this change,
        # but strict=True on a carefully prepared dict is preferred.

        model.eval()
        del state_dict_from_file, filtered_state_dict_to_load # Clean up
        gc.collect()
        torch.cuda.empty_cache() if torch.cuda.is_available() else None
        logger.info("✅ Model and tokenizer loaded successfully")
        return True
    except MemoryError as e:
        logger.error(f"❌ Memory error loading model: {str(e)}")
        logger.error(traceback.format_exc())
        return False
    except Exception as e:
        logger.error(f"❌ Error loading model: {str(e)}")
        logger.error(traceback.format_exc())
        return False

load_model_and_tokenizer()

# --- Gemini Classification Start ---
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")  # Ensure this environment variable is set

def classify_text_with_gemini(text_to_classify):
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not found in environment variables.")
        return {"error": "Gemini API key not configured"}

    if not text_to_classify or text_to_classify.strip() == "":
        logger.warn("No text provided for Gemini classification.")
        return {"error": "No text provided for classification"}

    prompt = (
        "Classify the following text based on these categories:\n"
        "- Manipulative\n"
        "- Potential suicide\n"
        "- Blackmail\n"
        "- Meeting attempt\n\n"
        "Text to classify:\n"
        f'"""{text_to_classify}"""\n\n'
        "Return the classification as a JSON object where keys are the categories and values are boolean (true if the category applies, false otherwise). "
        "For example:\n"
        "{\n"
        "  \"Manipulative\": false,\n"
        "  \"Potential_suicide\": true,\n"
        "  \"Blackmail\": false,\n"
        "  \"Meeting_attempt\": false\n"
        "}\n"
        "If multiple categories apply, set all relevant ones to true. If none apply, all should be false.\n"
        "Only return the JSON object."
    )

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    headers = {
        'Content-Type': 'application/json'
    }
    
    full_url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"

    try:
        response = requests.post(full_url, headers=headers, json=payload, timeout=30)  # Added timeout
        response.raise_for_status()  # Raises an HTTPError for bad responses (4XX or 5XX)
        
        result = response.json()
        
        if result.get("candidates") and result["candidates"][0].get("content") and result["candidates"][0]["content"].get("parts") and result["candidates"][0]["content"]["parts"][0].get("text"):
            classification_json_string = result["candidates"][0]["content"]["parts"][0]["text"]
            logger.info(f"Raw classification JSON string from Gemini: {classification_json_string}")
            try:
                # Attempt to clean the string if it's wrapped in markdown
                if classification_json_string.strip().startswith("```json"):
                    classification_json_string = classification_json_string.strip()[7:-3].strip()
                elif classification_json_string.strip().startswith("```"):
                    classification_json_string = classification_json_string.strip()[3:-3].strip()

                classification_result = json.loads(classification_json_string.strip())
                # Standardize keys to be consistent (e.g., lowercase with underscores)
                standardized_result = {
                    "manipulative": classification_result.get("Manipulative", classification_result.get("manipulative", False)),
                    "potential_suicide": classification_result.get("Potential suicide", classification_result.get("potential_suicide", classification_result.get("Potential_suicide", False))),
                    "blackmail": classification_result.get("Blackmail", classification_result.get("blackmail", False)),
                    "meeting_attempt": classification_result.get("Meeting attempt", classification_result.get("meeting_attempt", classification_result.get("Meeting_attempt", False))),
                }
                logger.info(f"Parsed and standardized Gemini classification result: {standardized_result}")
                return standardized_result
            except json.JSONDecodeError as parse_error:
                logger.error(f"Error parsing classification JSON from Gemini: {parse_error}, Raw string: {classification_json_string}")
                return {"error": "Failed to parse classification from Gemini", "raw_response": classification_json_string}
        else:
            logger.warn(f"No classification found in Gemini response: {result}")
            return {"error": "No classification data in Gemini response", "raw_response": result}
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling Gemini API: {e}")
        return {"error": f"Gemini API request failed: {str(e)}"}
    except Exception as e:
        logger.error(f"Unexpected error during Gemini classification: {e}")
        logger.error(traceback.format_exc())
        return {"error": f"Unexpected error in Gemini classification: {str(e)}"}

# --- Gemini Classification End ---

@csrf_exempt
@require_http_methods(["POST"])
def classify_text(request):
    global model, tokenizer
    if model is None or tokenizer is None:
        logger.error("Model or tokenizer not loaded, attempting to reload...")
        if not load_model_and_tokenizer():
            return JsonResponse({
                'error': 'Model not loaded properly',
                'details': 'Failed to load model and tokenizer'
            }, status=500)
    try:
        try:
            data = json.loads(request.body)
            text = data.get('text', '')
            logger.info(f"Received text for classification: {text[:100]}...")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in request: {str(e)}")
            return JsonResponse({'error': 'Invalid JSON in request'}, status=400)
        if not text:
            logger.error("No text provided in request")
            return JsonResponse({'error': 'No text provided'}, status=400)
        
        # Split the input text into individual messages for both RoBERTa and Gemini
        messages = [msg.strip() for msg in text.split('\n') if msg.strip() and not msg.startswith('--- Conversation')]
        if not messages:
             messages = [text.strip()] # If no newlines, treat the whole text as one message, unless it's a separator

        logger.info(f"Processing {len(messages)} messages individually.")

        roberta_results = []
        gemini_results_list = [] # To store individual Gemini results

        for i, message_text in enumerate(messages):
            # RoBERTa Classification for each message
            try:
                if not message_text: # Should not happen due to previous filtering but as a safeguard
                    roberta_results.append({
                        'message': message_text,
                        'prediction': {'label': 'Skipped', 'confidence': 0.0, 'confidence_level': 'N/A', 'explanation': 'Empty message skipped'},
                        'probabilities': {}
                    })
                    gemini_results_list.append({
                        'message': message_text,
                        'classification': {"error": "Empty message skipped"}
                    })
                    continue

                tokens = tokenizer(message_text, padding='max_length', truncation=True, max_length=128, return_tensors='pt')
                with torch.no_grad():
                    logits = model(tokens['input_ids'], tokens['attention_mask'])
                    predictions = torch.nn.functional.softmax(logits, dim=-1)
                predicted_class = torch.argmax(predictions, dim=1).item()
                confidence = predictions[0][predicted_class].item()
                labels = ['Offensive', 'Hate', 'Safe']
                explanations = {
                    'Offensive': 'Contains offensive language, insults, or inappropriate content',
                    'Hate': 'Contains hate speech, discrimination, or harmful stereotypes',
                    'Safe': 'Appears to be appropriate and respectful communication',
                    'Skipped': 'Message skipped'
                }
                confidence_level = "High" if confidence > 0.8 else "Medium" if confidence > 0.6 else "Low"
                probabilities = {
                    'Offensive': predictions[0][0].item(),
                    'Hate': predictions[0][1].item(),
                    'Safe': predictions[0][2].item()
                }
                roberta_results.append({
                    'message': message_text,
                    'prediction': {
                        'label': labels[predicted_class],
                        'confidence': confidence,
                        'confidence_level': confidence_level,
                        'explanation': explanations[labels[predicted_class]]
                    },
                    'probabilities': probabilities
                })
                logger.info(f"RoBERTa: Message {i+1} classified as {labels[predicted_class]} with {confidence_level} confidence ({confidence:.2f})")
            except Exception as e:
                logger.error(f"Error processing message {i+1} with RoBERTa: {str(e)}")
                roberta_results.append({
                    'message': message_text,
                    'error': str(e),
                    'prediction': {
                        'label': 'Error',
                        'confidence': 0.0,
                        'confidence_level': 'Unknown',
                        'explanation': 'Failed to process this message with RoBERTa'
                    }
                })
            
            # Gemini Classification for each message
            try:
                logger.info(f"Gemini: Classifying message {i+1}: {message_text[:50]}...")
                individual_gemini_result = classify_text_with_gemini(message_text)
                gemini_results_list.append({
                    'message': message_text,
                    'classification': individual_gemini_result
                })
                logger.info(f"Gemini: Message {i+1} classification result: {individual_gemini_result}")
            except Exception as e:
                logger.error(f"Error processing message {i+1} with Gemini: {str(e)}")
                gemini_results_list.append({
                    'message': message_text,
                    'classification': {"error": f"Failed to process this message with Gemini: {str(e)}"}
                })

        # Prepare result
        result = {
            'roberta_classification': {
                'results': roberta_results,
                'total_messages': len(roberta_results),
                'summary': {
                    'offensive_count': sum(1 for r in roberta_results if r.get('prediction', {}).get('label') == 'Offensive'),
                    'hate_count': sum(1 for r in roberta_results if r.get('prediction', {}).get('label') == 'Hate'),
                    'safe_count': sum(1 for r in roberta_results if r.get('prediction', {}).get('label') == 'Safe'),
                    'error_count': sum(1 for r in roberta_results if r.get('prediction', {}).get('label') == 'Error'),
                    'skipped_count': sum(1 for r in roberta_results if r.get('prediction', {}).get('label') == 'Skipped')
                }
            },
            'gemini_classification': {
                'results': gemini_results_list, # Now a list of individual classifications
                'total_messages': len(gemini_results_list)
            }
        }

        # --- Log detection in backend if child_id is provided ---
        child_id = data.get('child_id')
        if child_id:
            try:
                from monitoring.models import ChildProfile, DetectionLog
                from django.utils import timezone
                child = ChildProfile.objects.get(id=child_id)
                
                # Aggregate risk from both RoBERTa and individual Gemini results
                overall_risk_level = 0
                roberta_summary = result['roberta_classification'].get('summary', {})
                if roberta_summary.get('offensive_count', 0) > 0:
                    overall_risk_level = max(overall_risk_level, 3)
                if roberta_summary.get('hate_count', 0) > 0:
                    overall_risk_level = max(overall_risk_level, 4)

                # Check individual Gemini results for high-risk categories
                for gem_res in gemini_results_list:
                    class_data = gem_res.get('classification', {})
                    if not isinstance(class_data, dict) or class_data.get('error'): # Skip if error or not a dict
                        continue
                    if class_data.get('blackmail', False) or class_data.get('potential_suicide', False):
                        overall_risk_level = max(overall_risk_level, 5)
                    elif class_data.get('manipulative', False) or class_data.get('meeting_attempt', False):
                        overall_risk_level = max(overall_risk_level, 4)
                
                DetectionLog.objects.create(
                    child=child,
                    detection_type='text',
                    result=result, # Store the full structured result
                    confidence=1.0, # Confidence might need re-evaluation based on combined results
                    risk_level=overall_risk_level,
                    details={
                        'roberta_summary': roberta_summary,
                        'gemini_individual_analysis_summary': [
                            res.get('classification') for res in gemini_results_list
                        ]
                    },
                    timestamp=timezone.now()
                )
                logger.info(f"Logged text detection for child {child_id} with overall risk {overall_risk_level}")
            except Exception as e:
                logger.error(f"Failed to log text detection: {e}")
                logger.error(traceback.format_exc()) # Log full traceback for debugging

        return JsonResponse(result)
    except Exception as e:
        logger.error(f"Unexpected error in classify_text: {str(e)}")
        logger.error(traceback.format_exc())
        return JsonResponse({
            'error': 'Internal server error',
            'details': str(e)
        }, status=500)
