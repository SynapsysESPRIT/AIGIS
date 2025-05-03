import cv2
import torch
import numpy as np
from PIL import Image
import torchvision.transforms as transforms
import os
import time
from datetime import datetime

class VideoViolenceAnalyzer:
    def __init__(self, model_path, sample_rate=10, threshold=0.5, min_violent_frames=30):
        self.model = torch.load(model_path)
        self.model.eval()
        
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.min_violent_frames = min_violent_frames
        self.violent_frames = 0
        self.total_frames = 0
        self.start_time = None
        
    def analyze_frame(self, frame):
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb)
        img_tensor = self.transform(img).unsqueeze(0)
        
        with torch.no_grad():
            output = self.model(img_tensor)
            prediction = torch.sigmoid(output).item()
            
        return prediction > self.threshold, prediction
    
    def analyze_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")
            
        self.start_time = time.time()
        self.violent_frames = 0
        self.total_frames = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) % self.sample_rate == 0:
                is_violent, confidence = self.analyze_frame(frame)
                if is_violent:
                    self.violent_frames += 1
                self.total_frames += 1
                
                # Draw results on frame
                self.draw_results(frame, is_violent, confidence)
                
                # Show frame
                cv2.imshow('Video Analysis', frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                    
        cap.release()
        cv2.destroyAllWindows()
        
        return self.get_results()
    
    def draw_results(self, frame, is_violent, confidence):
        # Draw frame count
        cv2.putText(frame, f'Frame: {self.total_frames}', (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Draw violent frame count
        cv2.putText(frame, f'Violent Frames: {self.violent_frames}', (10, 70),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Draw confidence
        cv2.putText(frame, f'Confidence: {confidence:.2f}', (10, 110),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Draw status
        status = 'VIOLENT' if is_violent else 'SAFE'
        color = (0, 0, 255) if is_violent else (0, 255, 0)
        cv2.putText(frame, status, (10, 150),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
    
    def get_results(self):
        if self.total_frames == 0:
            return {
                'is_violent': False,
                'confidence': 0,
                'violent_percentage': 0,
                'duration': 0
            }
            
        violent_percentage = (self.violent_frames / self.total_frames) * 100
        is_violent = violent_percentage > self.min_violent_frames
        duration = time.time() - self.start_time
        
        return {
            'is_violent': is_violent,
            'confidence': violent_percentage / 100,
            'violent_percentage': violent_percentage,
            'duration': duration
        }

def main():
    # Get the model path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(current_dir, '..', 'Aigis', 'Models', 'manedri ken behi wale.pt')
    
    # Initialize analyzer
    analyzer = VideoViolenceAnalyzer(model_path)
    
    # Get video path from user
    video_path = input("Enter the path to the video file: ")
    
    try:
        # Analyze video
        results = analyzer.analyze_video(video_path)
        
        # Print results
        print("\nAnalysis Results:")
        print(f"Video Duration: {results['duration']:.2f} seconds")
        print(f"Violent Content Percentage: {results['violent_percentage']:.2f}%")
        print(f"Confidence: {results['confidence']:.2f}")
        print(f"Classification: {'VIOLENT' if results['is_violent'] else 'SAFE'}")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main() 