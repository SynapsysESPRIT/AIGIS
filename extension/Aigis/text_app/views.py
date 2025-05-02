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

# Suppress unnecessary warnings
warnings.filterwarnings("ignore", category=FutureWarning)
transformers_logging.set_verbosity_error()

# Set up logging
logger = logging.getLogger(__name__)

class ModeleRoBERTa(nn.Module):
    def __init__(self):
        super(ModeleRoBERTa, self).__init__()
        # Load config first
        config = RobertaConfig.from_pretrained('roberta-base')
        # Initialize model with config
        self.roberta = RobertaModel(config)
        self.classification_head = nn.Linear(config.hidden_size, 3)  # 3 classes

    def forward(self, input_ids, attention_mask):
        # Create position_ids
        position_ids = torch.arange(input_ids.size(1), dtype=torch.long, device=input_ids.device)
        position_ids = position_ids.unsqueeze(0).expand_as(input_ids)
        
        outputs = self.roberta(
            input_ids=input_ids,
            attention_mask=attention_mask,
            position_ids=position_ids
        )
        logits = self.classification_head(outputs.pooler_output)
        return logits

# Global variables for model and tokenizer
model = None
tokenizer = None

def load_model_and_tokenizer():
    global model, tokenizer
    try:
        # Clear memory before loading
        gc.collect()
        torch.cuda.empty_cache() if torch.cuda.is_available() else None

        # Get the absolute path to the Aigis app directory
        aigis_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        logger.info(f"Aigis directory: {aigis_dir}")
        
        # Construct the model path - using the correct path from your workspace
        model_path = os.path.join(aigis_dir, 'models', 'modele_robertaya.pth')
        logger.info(f"Looking for model at: {model_path}")
        
        # Check if the model file exists
        if not os.path.exists(model_path):
            logger.error(f"Model file not found at: {model_path}")
            # Try alternative path
            alt_model_path = os.path.join(aigis_dir, 'models', 'modele_robertaya.pth')
            logger.info(f"Trying alternative path: {alt_model_path}")
            if os.path.exists(alt_model_path):
                model_path = alt_model_path
            else:
                raise FileNotFoundError(f"Model file not found at either {model_path} or {alt_model_path}")
        
        logger.info("Loading tokenizer...")
        # Load tokenizer with memory optimization
        tokenizer = RobertaTokenizer.from_pretrained(
            'roberta-base',
            local_files_only=True,
            cache_dir=os.path.join(aigis_dir, 'cache')
        )
        
        logger.info("Creating model...")
        # Create model with memory optimization
        model = ModeleRoBERTa()
        
        logger.info("Loading model weights...")
        # Load model weights with memory optimization
        state_dict = torch.load(model_path, map_location=torch.device('cpu'))
        
        # Handle missing keys
        model_state_dict = model.state_dict()
        for key in list(state_dict.keys()):
            if key not in model_state_dict:
                logger.warning(f"Removing unexpected key from state_dict: {key}")
                del state_dict[key]
        
        # Load the state dict
        model.load_state_dict(state_dict, strict=False)
        
        # Set model to evaluation mode
        model.eval()
        
        # Free up memory
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

# Load model and tokenizer when the module is imported
load_model_and_tokenizer()

# Create your views here.

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
        # Parse request body
        try:
            data = json.loads(request.body)
            text = data.get('text', '')
            logger.info(f"Received text for classification: {text[:100]}...")  # Log first 100 chars
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in request: {str(e)}")
            return JsonResponse({'error': 'Invalid JSON in request'}, status=400)
        
        if not text:
            logger.error("No text provided in request")
            return JsonResponse({'error': 'No text provided'}, status=400)
        
        # Split text into individual messages if it contains multiple lines
        messages = [msg.strip() for msg in text.split('\n') if msg.strip()]
        logger.info(f"Processing {len(messages)} messages")
        
        results = []
        for i, message in enumerate(messages):
            try:
                # Skip empty messages or messages that are just conversation headers
                if not message or message.startswith('--- Conversation'):
                    continue
                    
                # Tokenize the text
                tokens = tokenizer(message, padding='max_length', truncation=True, max_length=128, return_tensors='pt')
                
                # Get model predictions
                with torch.no_grad():
                    logits = model(tokens['input_ids'], tokens['attention_mask'])
                    predictions = torch.nn.functional.softmax(logits, dim=-1)
                    
                # Get the predicted class and confidence
                predicted_class = torch.argmax(predictions, dim=1).item()
                confidence = predictions[0][predicted_class].item()
                
                # Map the prediction to a meaningful label and explanation
                labels = ['Offensive', 'Hate', 'Safe']
                explanations = {
                    'Offensive': 'Contains offensive language, insults, or inappropriate content',
                    'Hate': 'Contains hate speech, discrimination, or harmful stereotypes',
                    'Safe': 'Appears to be appropriate and respectful communication'
                }
                
                # Get confidence level description
                confidence_level = "High" if confidence > 0.8 else "Medium" if confidence > 0.6 else "Low"
                
                # Get all class probabilities
                probabilities = {
                    'Offensive': predictions[0][0].item(),
                    'Hate': predictions[0][1].item(),
                    'Safe': predictions[0][2].item()
                }
                
                results.append({
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
                results.append({
                    'message': message,
                    'error': str(e),
                    'prediction': {
                        'label': 'Error',
                        'confidence': 0.0,
                        'confidence_level': 'Unknown',
                        'explanation': 'Failed to process this message'
                    }
                })
        
        return JsonResponse({
            'results': results,
            'total_messages': len(results),
            'summary': {
                'offensive_count': sum(1 for r in results if r.get('prediction', {}).get('label') == 'Offensive'),
                'hate_count': sum(1 for r in results if r.get('prediction', {}).get('label') == 'Hate'),
                'safe_count': sum(1 for r in results if r.get('prediction', {}).get('label') == 'Safe'),
                'error_count': sum(1 for r in results if r.get('prediction', {}).get('label') == 'Error')
            }
        })
        
    except Exception as e:
        logger.error(f"Unexpected error in classify_text: {str(e)}")
        logger.error(traceback.format_exc())
        return JsonResponse({
            'error': 'Internal server error',
            'details': str(e)
        }, status=500)
