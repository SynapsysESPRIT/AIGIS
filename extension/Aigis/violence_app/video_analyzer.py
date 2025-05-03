import cv2
import torch
import numpy as np
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import os
import time
from datetime import datetime

class VideoViolenceAnalyzer:
    def __init__(self, sample_rate=30, threshold=0.5):
        # Load CLIP model and processor
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        
        # Violence-related labels
        self.labels = [
            "a violent scene",
            "a peaceful scene",
            "graphic content",
            "normal image",
            "blood",
            "weapon",
            "gore"
        ]
        
        # Define which labels are violence-related
        self.violence_labels = [
            "a violent scene",
            "graphic content",
            "blood",
            "weapon",
            "gore"
        ]
        
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.results = []
        
    def analyze_frame(self, frame):
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame_rgb).convert("RGB")
        
        # Run CLIP classification
        inputs = self.processor(text=self.labels, images=image, return_tensors="pt", padding=True)
        outputs = self.model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]
        
        # Get probabilities for all labels
        full_probs = {label: round(prob.item(), 4) for label, prob in zip(self.labels, probs)}
        
        # Calculate violence probability as sum of violence-related labels
        violence_prob = sum(full_probs[label] for label in self.violence_labels)
        is_violent = violence_prob > self.threshold
        
        # Get top label and confidence
        top_label_idx = probs.argmax()
        top_label = self.labels[top_label_idx]
        top_confidence = probs[top_label_idx].item()
        
        return {
            'is_violent': is_violent,
            'violence_confidence': violence_prob,
            'top_label': top_label,
            'top_confidence': top_confidence,
            'full_probs': full_probs
        }
    
    def analyze_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")
            
        frame_count = 0
        self.results = []
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % self.sample_rate == 0:
                result = self.analyze_frame(frame)
                result['frame'] = frame_count
                self.results.append(result)
                
                print(f"Frame {frame_count}: {'VIOLENT' if result['is_violent'] else 'SAFE'} ({result['violence_confidence']:.2f})")
                
            frame_count += 1
                
        cap.release()
        return self.results
    
    def get_results(self):
        return self.results

def main():
    # Initialize analyzer
    analyzer = VideoViolenceAnalyzer()
    
    # Get video path from user
    video_path = input("Enter the path to the video file: ")
    
    try:
        # Analyze video
        results = analyzer.analyze_video(video_path)
        
        # Print summary
        print("\nAnalysis Results:")
        for result in results:
            print(f"Frame {result['frame']}:")
            print(f"  Violence: {'VIOLENT' if result['is_violent'] else 'SAFE'} ({result['violence_confidence']:.2f})")
            print(f"  Top Label: {result['top_label']} ({result['top_confidence']:.2f})")
            print("  Full Probabilities:")
            for label, prob in result['full_probs'].items():
                print(f"    {label}: {prob:.4f}")
            print()
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main() 