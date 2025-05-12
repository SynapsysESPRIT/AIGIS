from django.shortcuts import render
import base64
import io
import numpy as np
from PIL import Image as pil_image, UnidentifiedImageError
from rest_framework.decorators import api_view
from rest_framework.response import Response
import onnxruntime
import os
import json
import requests
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt

# Create your views here.

# Load your trained nudity detection model (only once)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'nudity.onnx')

# Initialize ONNX Runtime session
session = onnxruntime.InferenceSession(MODEL_PATH)
input_name = session.get_inputs()[0].name

def preprocess_image(image_data):
    try:
        image_data = base64.b64decode(image_data.split(',')[1])
        image = pil_image.open(io.BytesIO(image_data)).convert("RGB")
        interpolation = getattr(pil_image, "LANCZOS", pil_image.BICUBIC)
        image = image.resize((256, 256), interpolation)
        img_array = np.asarray(image, dtype="float32") / 255.0
        img_array = np.expand_dims(img_array, axis=0)
        return img_array
    except (IndexError, ValueError, UnidentifiedImageError, Exception) as e:
        print("Image decode error:", e)
        return None

@api_view(['POST'])
def classify_nudity(request):
    image_data = request.data.get('image')
    img = preprocess_image(image_data)
    if img is None:
        return Response({'error': 'Invalid image data'}, status=400)
    prediction = session.run(None, {input_name: img})[0]
    label = "Nudity" if prediction[0][0] > 0.5 else "Safe"
    confidence = float(prediction[0][0])
    return Response({
        'label': label,
        'confidence': confidence
    })

@csrf_exempt
def proxy_image(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            image_url = data.get('url')
            
            if not image_url:
                print("Error: No URL provided in request")
                return HttpResponse('No URL provided', status=400)
            
            print(f"Fetching image from URL: {image_url}")
            
            # Set a timeout and user agent
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            # Fetch the image with timeout
            response = requests.get(
                image_url, 
                stream=True, 
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            
            # Get content type
            content_type = response.headers.get('content-type', 'image/jpeg')
            print(f"Image content type: {content_type}")
            
            # Stream the response back
            return HttpResponse(
                response.iter_content(chunk_size=8192),
                content_type=content_type
            )
        except requests.exceptions.Timeout:
            print(f"Timeout error fetching image from: {image_url}")
            return HttpResponse('Request timeout', status=504)
        except requests.exceptions.RequestException as e:
            print(f"Request error fetching image from {image_url}: {str(e)}")
            return HttpResponse(f'Error fetching image: {str(e)}', status=500)
        except json.JSONDecodeError:
            print("Error: Invalid JSON in request body")
            return HttpResponse('Invalid JSON in request body', status=400)
        except Exception as e:
            print(f"Unexpected error in proxy_image: {str(e)}")
            return HttpResponse(f'Server error: {str(e)}', status=500)
    
    return HttpResponse('Method not allowed', status=405)
