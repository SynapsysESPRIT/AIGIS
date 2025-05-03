from django.shortcuts import render
import base64
import io
import numpy as np
from PIL import Image as pil_image, UnidentifiedImageError
from rest_framework.decorators import api_view
from rest_framework.response import Response
import onnxruntime
import os

# Load your trained nudity detection model (only once)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'Aigis', 'Models', 'nudity.onnx')

# Initialize ONNX Runtime session
session = onnxruntime.InferenceSession(MODEL_PATH)
input_name = session.get_inputs()[0].name

def preprocess_image(image_data):
    try:
        image_data = base64.b64decode(image_data.split(',')[1])
        image = pil_image.open(io.BytesIO(image_data)).convert("RGB")
        # Use LANCZOS interpolation if available, else default to BICUBIC
        interpolation = getattr(pil_image, "LANCZOS", pil_image.BICUBIC)
        image = image.resize((256, 256), interpolation)
        img_array = np.asarray(image, dtype="float32") / 255.0
        # Ensure shape is (1, 256, 256, 3)
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

    # Run inference with ONNX Runtime
    prediction = session.run(None, {input_name: img})[0]
    label = "Nudity" if prediction[0][0] > 0.5 else "Safe"
    confidence = float(prediction[0][0])
    return Response({
        'label': label,
        'confidence': confidence
    })
