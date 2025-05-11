import numpy as np
from dataclasses import dataclass
from typing import List, Tuple, Union, Dict, Optional
import logging
import base64
from PIL import Image
import io

@dataclass
class DetectionConfig:
    frame_rate: float = 30.0
    min_freq: float = 3.0  # Hz
    max_freq: float = 30.0  # Hz
    energy_threshold: float = 1e5  # Matches Kaggle implementation exactly

class EpilepsyAnalyzer:
    def __init__(self, config: DetectionConfig = None):
        self.config = config or DetectionConfig()
        self.brightness_list: List[float] = []
        self.last_analysis_result = None
        self.logger = logging.getLogger(__name__)
    
    def _to_python_type(self, value):
        """Convert NumPy types to Python native types."""
        if isinstance(value, np.generic):
            return value.item()
        elif isinstance(value, np.ndarray):
            return value.tolist()
        return value
    
    def _convert_dict_types(self, d: Dict) -> Dict:
        """Convert all values in a dictionary to Python native types."""
        return {k: self._to_python_type(v) for k, v in d.items()}
        
    def add_frame(self, frame: Union[np.ndarray, str]) -> Tuple[bool, Union[str, Dict]]:
        """
        Add a frame to the buffer. Analysis is done when video ends.
        
        Args:
            frame: Either RGB image array or base64 encoded image string
            
        Returns:
            Tuple of (is_trigger, result)
            - is_trigger: bool indicating if epilepsy trigger detected
            - result: either a status string or analysis result dict
        """
        try:
            # Convert frame to numpy array if it's a base64 string
            if isinstance(frame, str):
                frame = self._decode_base64_image(frame)
            
            # Convert to grayscale if needed
            if len(frame.shape) == 3:
                gray = np.mean(frame, axis=2)
            else:
                gray = frame
                
            # Calculate average brightness
            brightness = float(np.mean(gray))
            self.brightness_list.append(brightness)
            
            # Return collecting status
            return False, f"Collecting frames ({len(self.brightness_list)})"
            
        except Exception as e:
            self.logger.error(f"Error in add_frame: {str(e)}")
            return False, f"Error: {str(e)}"
    
    def analyze_video(self) -> Tuple[bool, Dict]:
        """
        Analyze the complete video sequence.
        This should be called when the video ends.
        
        Returns:
            Tuple of (is_trigger, result_dict)
        """
        try:
            if not self.brightness_list:
                return False, {
                    'status': 'No frames collected',
                    'confidence': 0.0,
                    'energy': 0.0,
                    'threshold': float(self.config.energy_threshold),
                    'frame_count': 0
                }

            # Convert to numpy array
            signal = np.array(self.brightness_list)
            
            # Preprocess signal (exactly as in Kaggle notebook)
            processed_signal = signal - np.mean(signal)
            
            # Compute FFT (exactly as in Kaggle notebook)
            n = len(processed_signal)
            fft_values = np.fft.fft(processed_signal)
            freqs = np.fft.fftfreq(n, d=1/self.config.frame_rate)
            amplitudes = np.abs(fft_values)
            
            # Analyze spectrum (exactly as in Kaggle notebook)
            mask = (freqs >= self.config.min_freq) & (freqs <= self.config.max_freq)
            critical_energy = np.sum(amplitudes[mask]**2)
            
            # Check if energy exceeds threshold (exactly as in Kaggle notebook)
            is_trigger = bool(critical_energy > self.config.energy_threshold)
            
            # Log analysis details
            self.logger.info(f"Analysis results: energy={critical_energy:.6f}, threshold={self.config.energy_threshold}, is_trigger={is_trigger}")
            
            result = {
                'status': 'Epilepsy Triggering' if is_trigger else 'Safe',
                'confidence': float(critical_energy / self.config.energy_threshold),
                'energy': float(critical_energy),
                'threshold': float(self.config.energy_threshold),
                'frame_count': len(self.brightness_list)
            }
            
            # Convert all values to Python native types
            result = self._convert_dict_types(result)
            
            self.last_analysis_result = result
            return is_trigger, result
            
        except Exception as e:
            self.logger.error(f"Error in analyze_video: {str(e)}")
            return False, {
                'status': f'Error: {str(e)}',
                'confidence': 0.0,
                'energy': 0.0,
                'threshold': float(self.config.energy_threshold),
                'frame_count': len(self.brightness_list)
            }
    
    def _decode_base64_image(self, image_data: str) -> np.ndarray:
        """
        Decode base64 image data to numpy array.
        
        Args:
            image_data: Base64 encoded image string
            
        Returns:
            Decoded image as numpy array
        """
        try:
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            return np.array(img)
        except Exception as e:
            self.logger.error(f"Error decoding base64 image: {str(e)}")
            raise
    
    def reset(self):
        """Reset the analyzer state"""
        self.brightness_list = []
        self.last_analysis_result = None 