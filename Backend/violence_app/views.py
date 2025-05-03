from django.shortcuts import render
from django.http import JsonResponse
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
import numpy as np
import os
import base64
import io
from django.views.decorators.csrf import csrf_exempt
import json
from PIL import Image  # Ensure this import is present
import cv2
from .video_analyzer import VideoViolenceAnalyzer


# Initialize the analyzer
analyzer = VideoViolenceAnalyzer()

# Define image preprocessing function
def preprocess_image(img):
    # Resize to the expected input size for the model
    img = img.resize((64, 64), Image.BICUBIC)  # Resize to 64x64
    img_array = np.array(img)  # Convert image to array
    img_array = np.expand_dims(img_array, axis=0)  # Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)  # Add sequence dimension
    img_array = img_array / 255.0  # Normalize to [0, 1]
    return img_array

@csrf_exempt
def detect_violence(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            image_data = data.get('image')
        except Exception:
            image_data = None

        if image_data:
            try:
                # Handle base64 image data
                if ',' in image_data:
                    image_data = image_data.split(',')[1]
                image_bytes = base64.b64decode(image_data)
                img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                
                # Convert PIL Image to numpy array for OpenCV
                img_array = np.array(img)
                
                # Analyze the frame using our CLIP-based analyzer
                result = analyzer.analyze_frame(img_array)
                
                return JsonResponse({
                    'is_violent': result['is_violent'],
                    'confidence': result['violence_confidence'],
                    'top_label': result['top_label'],
                    'top_confidence': result['top_confidence'],
                    'full_probs': result['full_probs']
                })
            except Exception as e:
                return JsonResponse({'error': f'Image processing error: {str(e)}'}, status=400)
    return JsonResponse({'error': 'Invalid request'}, status=400)


def analyze_video(request):
    if request.method == 'POST' and request.FILES.get('video'):
        video = request.FILES['video']
        temp_path = 'temp_video.mp4'
        
        with open(temp_path, 'wb') as f:
            for chunk in video.chunks():
                f.write(chunk)
        
        result = analyze_video_frames(temp_path)
        os.remove(temp_path)
        
        return JsonResponse(result)
    
    return render(request, 'violence_app/analyze.html')


def analyze_video_frames(video_path, sample_rate=10):
    analyzer = VideoViolenceAnalyzer(sample_rate=sample_rate)
    return analyzer.analyze_video(video_path)
