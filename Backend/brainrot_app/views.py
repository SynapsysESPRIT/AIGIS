import base64
import io
import numpy as np
from PIL import Image
from rest_framework.decorators import api_view
from rest_framework.response import Response
import tensorflow as tf
import os
from keras.models import load_model  # ✅ Correct way for Keras 3.5.0 (.h5)

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

def preprocess_frame(frame_data):
    image_data = base64.b64decode(frame_data.split(',')[1])
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    image = image.resize((224, 224))
    img_array = np.array(image) / 255.0
    return np.expand_dims(img_array, axis=0)

@api_view(['POST'])
def classify_video(request):
    frame_data = request.data.get('image')

    if model is None:
        return Response({"error": "Brainrot model not loaded."}, status=500)

    img = preprocess_frame(frame_data)
    features = feature_model.predict(img)
    prediction = model.predict(features)
    label = "Brainrot" if prediction[0][0] > 0.5 else "Not Brainrot"
    return Response({'label': label})
