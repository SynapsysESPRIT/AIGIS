import base64
import io
import numpy as np
from PIL import Image
from rest_framework.decorators import api_view
from rest_framework.response import Response
from tensorflow.keras.models import load_model
import os
import cv2
from tensorflow.keras.applications.xception import preprocess_input
from collections import deque
from .models import DeepfakeDetection

# Load the Xception model for deepfake detection
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'Aigis', 'Models', 'deepfake_detection_xception_180k_14epochs.h5')
model = load_model(MODEL_PATH)

# Configure detection parameters
CONFIDENCE_THRESHOLD = 0.60  # Slightly reduced threshold
IMAGE_SIZE = 256  # Xception model's expected input size
CONFIDENCE_HISTORY_SIZE = 5  # Number of frames to consider for smoothing
MIN_CONFIDENCE_FOR_DEEPFAKE = 0.60  # Minimum confidence to declare as deepfake
MAX_CONFIDENCE_FOR_REAL = 0.50  # Maximum confidence to declare as real

# Initialize confidence history
confidence_history = deque(maxlen=CONFIDENCE_HISTORY_SIZE)

def get_face_region(image):
    """Extract and return the face region from the image if a face is detected"""
    try:
        # Convert PIL Image to cv2 format
        cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Load face detection cascade
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        
        # Detect faces
        faces = face_cascade.detectMultiScale(cv_image, 1.1, 4)
        
        if len(faces) > 0:
            # Get the largest face
            x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
            
            # Add margin around face
            margin = int(max(w, h) * 0.2)
            x = max(0, x - margin)
            y = max(0, y - margin)
            w = min(cv_image.shape[1] - x, w + 2 * margin)
            h = min(cv_image.shape[0] - y, h + 2 * margin)
            
            # Extract face region
            face_region = cv_image[y:y+h, x:x+w]
            return Image.fromarray(cv2.cvtColor(face_region, cv2.COLOR_BGR2RGB))
    except Exception as e:
        print(f"Face detection error: {str(e)}")
    
    return image

def smooth_confidence(current_confidence):
    """Apply temporal smoothing to confidence scores"""
    confidence_history.append(current_confidence)
    
    if len(confidence_history) >= 3:
        # Apply weighted average (more weight to recent predictions)
        weights = np.exp(np.linspace(-1, 0, len(confidence_history)))
        weights = weights / weights.sum()
        smoothed = np.average(confidence_history, weights=weights)
        return float(smoothed)
    
    return current_confidence

def make_deepfake_decision(confidence):
    """Make a more nuanced decision about deepfake detection"""
    if confidence > MIN_CONFIDENCE_FOR_DEEPFAKE:
        return True, confidence
    elif confidence < MAX_CONFIDENCE_FOR_REAL:
        return False, confidence
    else:
        # For uncertain cases, consider recent history
        if len(confidence_history) >= 3:
            avg_confidence = np.mean(list(confidence_history)[-3:])
            return avg_confidence > CONFIDENCE_THRESHOLD, avg_confidence
        return confidence > CONFIDENCE_THRESHOLD, confidence

def preprocess_frame(frame_data):
    """Enhanced preprocessing for Xception-based deepfake detection"""
    try:
        # Handle both full data URI and raw base64
        if ',' in frame_data:
            image_data = base64.b64decode(frame_data.split(',')[1])
        else:
            image_data = base64.b64decode(frame_data)
        
        # Load and convert to RGB
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        
        # Extract face region if possible
        image = get_face_region(image)
        
        # Resize to expected input size
        image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.LANCZOS)
        
        # Convert to numpy array
        img_array = np.array(image)
        
        # Apply color normalization
        img_array = img_array.astype('float32')
        img_array = preprocess_input(img_array)
        
        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)
        
        return img_array
        
    except Exception as e:
        print(f"Error in preprocess_frame: {str(e)}")
        raise

@api_view(['POST'])
def detect_deepfake(request):
    try:
        if 'video' not in request.data:
            return Response({'error': 'No video data provided'}, status=400)

        video_data = request.data['video']
        video_url = request.data.get('url', '')

        try:
            # Process the frame
            processed_frame = preprocess_frame(video_data)
            
            # Make prediction
            raw_prediction = float(model.predict(processed_frame, verbose=0)[0][0])
            
            # Apply confidence smoothing
            smoothed_confidence = smooth_confidence(raw_prediction)
            
            # Make final decision
            is_deepfake, final_confidence = make_deepfake_decision(smoothed_confidence)
            
            # Save detection result
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