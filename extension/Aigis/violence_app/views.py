from django.shortcuts import render
from django.http import JsonResponse
import torch
import cv2
import numpy as np
from PIL import Image
import torchvision.transforms as transforms
import os
from ultralytics.nn.tasks import DetectionModel

# Load the model
model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Aigis', 'Models', 'manedri ken behi wale.pt')
with torch.serialization.safe_globals([DetectionModel]):
    checkpoint = torch.load(model_path, weights_only=False)
    model = checkpoint['model']  # The model is already a DetectionModel instance
model.eval()

# Define image transformations
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def detect_violence(request):
    if request.method == 'POST' and request.FILES.get('image'):
        image = request.FILES['image']
        img = Image.open(image)
        img_tensor = transform(img).unsqueeze(0)
        
        with torch.no_grad():
            output = model(img_tensor)
            prediction = torch.sigmoid(output).item()
            
        is_violent = prediction > 0.5
        confidence = prediction if is_violent else 1 - prediction
        
        return JsonResponse({
            'is_violent': is_violent,
            'confidence': confidence
        })
    
    return render(request, 'violence_app/detect.html')

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
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps
    
    violent_frames = 0
    total_sampled_frames = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Sample frames based on sample_rate
        if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) % sample_rate == 0:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(frame_rgb)
            img_tensor = transform(img).unsqueeze(0)
            
            with torch.no_grad():
                output = model(img_tensor)
                prediction = torch.sigmoid(output).item()
                
            if prediction > 0.5:
                violent_frames += 1
            total_sampled_frames += 1
    
    cap.release()
    
    if total_sampled_frames == 0:
        return {
            'is_violent': False,
            'confidence': 0,
            'violent_percentage': 0,
            'duration': duration
        }
    
    violent_percentage = (violent_frames / total_sampled_frames) * 100
    is_violent = violent_percentage > 30  # Threshold of 30% violent frames
    
    return {
        'is_violent': is_violent,
        'confidence': violent_percentage / 100,
        'violent_percentage': violent_percentage,
        'duration': duration
    }
