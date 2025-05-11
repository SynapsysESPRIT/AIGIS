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
    energy_threshold: float = 1e5  # Matches Kaggle implementation
    min_frames: int = 10  # Minimum frames needed for analysis

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
        Add a frame to the buffer and analyze if enough frames are collected.
        
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
            
            # If we don't have enough frames yet, return status
            if len(self.brightness_list) < self.config.min_frames:
                return False, f"Collecting frames ({len(self.brightness_list)}/{self.config.min_frames})"
            
            # Analyze the signal
            return self.analyze_signal()
            
        except Exception as e:
            self.logger.error(f"Error in add_frame: {str(e)}")
            return False, f"Error: {str(e)}"
    
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
    
    def preprocess_signal(self, signal: np.ndarray) -> np.ndarray:
        """
        Preprocess the signal by removing the mean (detrending).
        Matches Kaggle implementation exactly.
        
        Args:
            signal: Raw brightness signal
            
        Returns:
            Preprocessed signal
        """
        try:
            return signal - np.mean(signal)
        except Exception as e:
            self.logger.error(f"Error in preprocess_signal: {str(e)}")
            return signal
    
    def compute_fft(self, signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Compute FFT of the signal.
        Matches Kaggle implementation exactly.
        
        Args:
            signal: Preprocessed signal
            
        Returns:
            Tuple of (frequencies, amplitudes)
        """
        try:
            n = len(signal)
            fft_values = np.fft.fft(signal)
            freqs = np.fft.fftfreq(n, d=1/self.config.frame_rate)
            return freqs, np.abs(fft_values)
        except Exception as e:
            self.logger.error(f"Error in compute_fft: {str(e)}")
            raise
    
    def analyze_spectrum(self, freqs: np.ndarray, amplitudes: np.ndarray) -> float:
        """
        Analyze the frequency spectrum for epilepsy triggers.
        Matches Kaggle implementation exactly.
        
        Args:
            freqs: Frequency array
            amplitudes: Amplitude array
            
        Returns:
            Critical energy in the target frequency band
        """
        try:
            mask = (freqs >= self.config.min_freq) & (freqs <= self.config.max_freq)
            return float(np.sum(amplitudes[mask]**2))
        except Exception as e:
            self.logger.error(f"Error in analyze_spectrum: {str(e)}")
            return 0.0
    
    def analyze_signal(self) -> Tuple[bool, Dict]:
        """
        Analyze the collected brightness signal using FFT.
        Matches Kaggle implementation exactly.
        
        Returns:
            Tuple of (is_trigger, result_dict)
        """
        try:
            # Convert to numpy array
            signal = np.array(self.brightness_list)
            
            # Preprocess signal
            processed_signal = self.preprocess_signal(signal)
            
            # Compute FFT
            freqs, amplitudes = self.compute_fft(processed_signal)
            
            # Analyze spectrum
            critical_energy = self.analyze_spectrum(freqs, amplitudes)
            
            # Check if energy exceeds threshold
            is_trigger = bool(critical_energy > self.config.energy_threshold)
            
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
            self.logger.error(f"Error in analyze_signal: {str(e)}")
            return False, {
                'status': f'Error: {str(e)}',
                'confidence': 0.0,
                'energy': 0.0,
                'threshold': float(self.config.energy_threshold),
                'frame_count': len(self.brightness_list)
            }
    
    def reset(self):
        """Reset the analyzer state"""
        self.brightness_list = []
        self.last_analysis_result = None 