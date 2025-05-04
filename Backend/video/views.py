from django.shortcuts import render
import base64
import io
import numpy as np
from PIL import Image
from rest_framework.decorators import api_view
from rest_framework.response import Response
import tensorflow as tf
import os
from keras.models import load_model  # ✅ Correct way for Keras 3.5.0 (.h5)
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
from .video_analyzer import VideoViolenceAnalyzer
import cv2
from .models import DeepfakeDetection
from tensorflow.keras.applications.xception import preprocess_input
from collections import deque

# Load your trained brainrot model (only once)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'brainrot_modelMobilenet.h5')

try:
    model = load_model(MODEL_PATH, compile=False)
    print("✅ Model loaded using keras.models.load_model")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None

# Feature extractor
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.models import Model
from tensorflow.keras.layers import GlobalAveragePooling2D

base_model = MobileNetV2(weights='imagenet', include_top=False, input_shape=(224, 224, 3))
feature_model = Model(inputs=base_model.input, outputs=GlobalAveragePooling2D()(base_model.output))

# Initialize the analyzer
analyzer = VideoViolenceAnalyzer()

# Deepfake detection model loading
MODEL_PATH_DEEPFAKE = os.path.join(BASE_DIR, 'models', 'deepfake_detection_xception_180k_14epochs.h5')
try:
    deepfake_model = load_model(MODEL_PATH_DEEPFAKE, compile=False)
    print("✅ Deepfake model loaded using keras.models.load_model")
except Exception as e:
    print(f"❌ Error loading deepfake model: {e}")
    deepfake_model = None

CONFIDENCE_THRESHOLD = 0.60
IMAGE_SIZE = 256
CONFIDENCE_HISTORY_SIZE = 5
MIN_CONFIDENCE_FOR_DEEPFAKE = 0.60
MAX_CONFIDENCE_FOR_REAL = 0.50
confidence_history = deque(maxlen=CONFIDENCE_HISTORY_SIZE)

def get_face_region(image):
    try:
        cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(cv_image, 1.1, 4)
        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
            margin = int(max(w, h) * 0.2)
            x = max(0, x - margin)
            y = max(0, y - margin)
            w = min(cv_image.shape[1] - x, w + 2 * margin)
            h = min(cv_image.shape[0] - y, h + 2 * margin)
            face_region = cv_image[y:y+h, x:x+w]
            return Image.fromarray(cv2.cvtColor(face_region, cv2.COLOR_BGR2RGB))
    except Exception as e:
        print(f"Face detection error: {str(e)}")
    return image

def smooth_confidence(current_confidence):
    confidence_history.append(current_confidence)
    if len(confidence_history) >= 3:
        weights = np.exp(np.linspace(-1, 0, len(confidence_history)))
        weights = weights / weights.sum()
        smoothed = np.average(confidence_history, weights=weights)
        return float(smoothed)
    return current_confidence

def make_deepfake_decision(confidence):
    if confidence > MIN_CONFIDENCE_FOR_DEEPFAKE:
        return True, confidence
    elif confidence < MAX_CONFIDENCE_FOR_REAL:
        return False, confidence
    else:
        if len(confidence_history) >= 3:
            avg_confidence = np.mean(list(confidence_history)[-3:])
            return avg_confidence > CONFIDENCE_THRESHOLD, avg_confidence
        return confidence > CONFIDENCE_THRESHOLD, confidence

def preprocess_frame_deepfake(frame_data):
    try:
        if ',' in frame_data:
            image_data = base64.b64decode(frame_data.split(',')[1])
        else:
            image_data = base64.b64decode(frame_data)
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        image = get_face_region(image)
        image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.LANCZOS)
        img_array = np.array(image)
        img_array = img_array.astype('float32')
        img_array = preprocess_input(img_array)
        img_array = np.expand_dims(img_array, axis=0)
        return img_array
    except Exception as e:
        print(f"Error in preprocess_frame: {str(e)}")
        raise

def preprocess_frame(frame_data):
    image_data = base64.b64decode(frame_data.split(',')[1])
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    image = image.resize((224, 224))
    img_array = np.array(image) / 255.0
    return np.expand_dims(img_array, axis=0)

def preprocess_image(img):
    img = img.resize((64, 64), Image.BICUBIC)
    img_array = np.array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = img_array / 255.0
    return img_array

@require_http_methods(["GET"])
def health_check(request):
    """
    Simple health check endpoint that returns the server status
    """
    return JsonResponse({
        'status': 'healthy',
        'message': 'Brainrot detection service is running'
    })

@csrf_exempt
@require_http_methods(["POST"])
def classify_video(request):
    try:
        # Parse JSON data from request body
        data = json.loads(request.body)
        if not data or 'image' not in data:
            return JsonResponse({'error': 'No image data provided'}, status=400)
        
        # Extract base64 data
        image_str = data['image']
        if not image_str.startswith('data:image/'):
            return JsonResponse({'error': 'Invalid image format'}, status=400)
            
        try:
            # Split and decode base64
            header, encoded = image_str.split(',', 1)
            image_data = base64.b64decode(encoded)
            
            # Create and verify image
            image = Image.open(io.BytesIO(image_data))
            image.verify()  # Verify it's a valid image
            
            # Reopen the image after verification
            image = Image.open(io.BytesIO(image_data)).convert('RGB')
            
            # Preprocess image
            image = image.resize((224, 224))
            img_array = np.array(image) / 255.0
            img_array = np.expand_dims(img_array, axis=0)
            
            # Extract features
            features = feature_model.predict(img_array)
            
            # Make prediction if model is loaded
            if model is not None:
                prediction = model.predict(features)
                label = "Brainrot" if prediction[0][0] > 0.5 else "Normal"
                confidence = float(prediction[0][0])
            else:
                label = "Normal"
                confidence = 0.95
            
            return JsonResponse({
                'label': label,
                'confidence': confidence
            })
            
        except (ValueError, IOError) as e:
            print(f"Image processing error: {str(e)}")
            return JsonResponse({'error': 'Invalid image data'}, status=400)
            
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        print(f"Error in classify_video: {str(e)}")
        return JsonResponse({'error': 'Internal server error'}, status=500)

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
                if ',' in image_data:
                    image_data = image_data.split(',')[1]
                image_bytes = base64.b64decode(image_data)
                img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                img_array = np.array(img)
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

@api_view(['POST'])
def detect_deepfake(request):
    try:
        if 'video' not in request.data:
            return Response({'error': 'No video data provided'}, status=400)
        video_data = request.data['video']
        video_url = request.data.get('url', '')
        try:
            processed_frame = preprocess_frame_deepfake(video_data)
            if deepfake_model is None:
                return Response({'error': 'Deepfake model not loaded'}, status=500)
            raw_prediction = float(deepfake_model.predict(processed_frame, verbose=0)[0][0])
            smoothed_confidence = smooth_confidence(raw_prediction)
            is_deepfake, final_confidence = make_deepfake_decision(smoothed_confidence)
            DeepfakeDetection.objects.create(
                is_deepfake=is_deepfake,
                confidence=final_confidence,
                video_url=video_url,
                model_used='xception'
            )
            print(f"Debug - Raw: {raw_prediction:.4f}, Smoothed: {smoothed_confidence:.4f}, Final: {final_confidence:.4f}, Is Deepfake: {is_deepfake}")
            return Response({
                'is_deepfake': bool(is_deepfake),
                'confidence': final_confidence,
                'raw_prediction': raw_prediction,
                'model': 'xception'
            })
        except ValueError as e:
            return Response({'error': f'Invalid base64 data: {str(e)}'}, status=400)
        except Exception as e:
            return Response({'error': f'Error processing image: {str(e)}'}, status=500)
    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
def get_deepfake_count(request):
    try:
        count = DeepfakeDetection.objects.filter(is_deepfake=True).count()
        return Response({'count': count})
    except Exception as e:
        return Response({'error': str(e)}, status=500)
