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

# Suppress unnecessary warnings
warnings.filterwarnings("ignore", category=FutureWarning)
transformers_logging.set_verbosity_error()

# Set up logging
logger = logging.getLogger(__name__)

class ModeleRoBERTa(nn.Module):
    def __init__(self):
        super(ModeleRoBERTa, self).__init__()
        config = RobertaConfig.from_pretrained('roberta-base')
        self.roberta = RobertaModel(config)
        self.classification_head = nn.Linear(config.hidden_size, 3)

    def forward(self, input_ids, attention_mask):
        position_ids = torch.arange(input_ids.size(1), dtype=torch.long, device=input_ids.device)
        position_ids = position_ids.unsqueeze(0).expand_as(input_ids)
        outputs = self.roberta(
            input_ids=input_ids,
            attention_mask=attention_mask,
            position_ids=position_ids
        )
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
            alt_model_path = os.path.join(aigis_dir, 'models', 'modele_robertaya.pth')
            logger.info(f"Trying alternative path: {alt_model_path}")
            if os.path.exists(alt_model_path):
                model_path = alt_model_path
            else:
                raise FileNotFoundError(f"Model file not found at either {model_path} or {alt_model_path}")
        logger.info("Loading tokenizer...")
        tokenizer = RobertaTokenizer.from_pretrained(
            'roberta-base',
            local_files_only=True,
            cache_dir=os.path.join(aigis_dir, 'cache')
        )
        logger.info("Creating model...")
        model = ModeleRoBERTa()
        logger.info("Loading model weights...")
        state_dict = torch.load(model_path, map_location=torch.device('cpu'))
        model_state_dict = model.state_dict()
        for key in list(state_dict.keys()):
            if key not in model_state_dict:
                logger.warning(f"Removing unexpected key from state_dict: {key}")
                del state_dict[key]
        model.load_state_dict(state_dict, strict=False)
        model.eval()
        del state_dict
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
        messages = [msg.strip() for msg in text.split('\n') if msg.strip()]
        logger.info(f"Processing {len(messages)} messages with RoBERTa")
        roberta_results = []
        for i, message in enumerate(messages):
            try:
                if not message or message.startswith('--- Conversation'):
                    roberta_results.append({
                        'message': message,
                        'prediction': {'label': 'Skipped', 'confidence': 0.0, 'confidence_level': 'N/A', 'explanation': 'Message skipped (e.g. conversation separator)'},
                        'probabilities': {}
                    })
                    continue
                tokens = tokenizer(message, padding='max_length', truncation=True, max_length=128, return_tensors='pt')
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
                    'Skipped': 'Message skipped (e.g. conversation separator)'
                }
                confidence_level = "High" if confidence > 0.8 else "Medium" if confidence > 0.6 else "Low"
                probabilities = {
                    'Offensive': predictions[0][0].item(),
                    'Hate': predictions[0][1].item(),
                    'Safe': predictions[0][2].item()
                }
                roberta_results.append({
                    'message': message,
                    'prediction': {
                        'label': labels[predicted_class],
                        'confidence': confidence,
                        'confidence_level': confidence_level,
                        'explanation': explanations[labels[predicted_class]]
                    },
                    'probabilities': probabilities
                })
                logger.info(f"Message {i+1} classified as {labels[predicted_class]} with {confidence_level} confidence ({confidence:.2f})")
            except Exception as e:
                logger.error(f"Error processing message {i+1}: {str(e)}")
                roberta_results.append({
                    'message': message,
                    'error': str(e),
                    'prediction': {
                        'label': 'Error',
                        'confidence': 0.0,
                        'confidence_level': 'Unknown',
                        'explanation': 'Failed to process this message'
                    }
                })
        
        # Perform Gemini classification on the whole input text
        logger.info("Performing classification with Gemini...")
        gemini_classification_result = classify_text_with_gemini(text)

        return JsonResponse({
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
            'gemini_classification': gemini_classification_result
        })
    except Exception as e:
        logger.error(f"Unexpected error in classify_text: {str(e)}")
        logger.error(traceback.format_exc())
        return JsonResponse({
            'error': 'Internal server error',
            'details': str(e)
        }, status=500)
