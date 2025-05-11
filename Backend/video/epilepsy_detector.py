import numpy as np
import cv2
from typing import Tuple, Optional, Union
import matplotlib.pyplot as plt
from dataclasses import dataclass

@dataclass
class DetectionConfig:
    """Configuration parameters for epilepsy detection."""
    frame_rate: int = 30
    freq_min: float = 3.0  # Hz
    freq_max: float = 30.0  # Hz
    threshold: float = 1e5
    batch_size: int = 30  # Number of frames to process at once

class EpilepsyDetector:
    """
    A class for detecting potential epilepsy-triggering patterns in videos using FFT analysis.
    Analyzes brightness variations in the frequency domain to identify dangerous flicker patterns.
    """
    
    def __init__(self, config: Optional[DetectionConfig] = None):
        """
        Initialize the detector with optional configuration.
        
        Args:
            config: DetectionConfig object with analysis parameters
        """
        self.config = config or DetectionConfig()
        
    def extract_brightness(self, video_path: str) -> np.ndarray:
        """
        Extract brightness values from video frames using batch processing.
        
        Args:
            video_path: Path to the video file
            
        Returns:
            numpy.ndarray: Array of average brightness values per frame
        """
        video_capture = cv2.VideoCapture(video_path)
        brightness_list = []
        
        while video_capture.isOpened():
            frames = []
            # Read frames in batches
            for _ in range(self.config.batch_size):
                ret, frame = video_capture.read()
                if not ret:
                    break
                frames.append(frame)
            
            if not frames:
                break
                
            # Process batch
            gray_frames = [cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in frames]
            batch_brightness = [np.mean(gray) for gray in gray_frames]
            brightness_list.extend(batch_brightness)
            
        video_capture.release()
        return np.array(brightness_list)
    
    def preprocess_signal(self, brightness_signal: np.ndarray) -> np.ndarray:
        """
        Preprocess the brightness signal by removing DC component.
        
        Args:
            brightness_signal: Raw brightness values
            
        Returns:
            numpy.ndarray: Centered brightness signal
        """
        return brightness_signal - np.mean(brightness_signal)
    
    def compute_fft(self, brightness_signal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Compute FFT of the brightness signal.
        
        Args:
            brightness_signal: Preprocessed brightness values
            
        Returns:
            Tuple of (frequencies, amplitudes)
        """
        n = len(brightness_signal)
        fft_values = np.fft.fft(brightness_signal)
        freqs = np.fft.fftfreq(n, d=1/self.config.frame_rate)
        return freqs, np.abs(fft_values)
    
    def analyze_spectrum(self, freqs: np.ndarray, amplitudes: np.ndarray) -> float:
        """
        Analyze the frequency spectrum for potential epilepsy triggers.
        
        Args:
            freqs: Frequency values from FFT
            amplitudes: Amplitude values from FFT
            
        Returns:
            float: Critical energy in the target frequency band
        """
        mask = (freqs >= self.config.freq_min) & (freqs <= self.config.freq_max)
        return np.sum(amplitudes[mask]**2)
    
    def plot_spectrum(self, freqs: np.ndarray, amplitudes: np.ndarray, 
                     save_path: Optional[str] = None) -> None:
        """
        Plot the FFT amplitude spectrum with highlighted danger zone.
        
        Args:
            freqs: Frequency values from FFT
            amplitudes: Amplitude values from FFT
            save_path: Optional path to save the plot
        """
        plt.figure(figsize=(12, 6))
        plt.plot(freqs, amplitudes)
        plt.axvspan(self.config.freq_min, self.config.freq_max, 
                   color='red', alpha=0.2, label='Danger Zone')
        plt.xlabel('Frequency (Hz)')
        plt.ylabel('Amplitude')
        plt.title('FFT Amplitude Spectrum')
        plt.grid(True)
        plt.legend()
        
        if save_path:
            plt.savefig(save_path)
        plt.show()
    
    def check_epilepsy_trigger(self, video_path: str, 
                             plot: bool = False) -> Union[str, Tuple[str, np.ndarray, np.ndarray]]:
        """
        Check if a video contains potential epilepsy-triggering patterns.
        
        Args:
            video_path: Path to the video file
            plot: Whether to generate and return spectrum plot data
            
        Returns:
            str: Detection result ("Epilepsy Triggering" or "Safe")
            If plot=True, also returns (freqs, amplitudes) for plotting
        """
        brightness_signal = self.extract_brightness(video_path)
        if len(brightness_signal) == 0:
            return "Error: No frames extracted from video."
            
        processed_signal = self.preprocess_signal(brightness_signal)
        freqs, amplitudes = self.compute_fft(processed_signal)
        critical_energy = self.analyze_spectrum(freqs, amplitudes)
        
        result = "Epilepsy Triggering" if critical_energy > self.config.threshold else "Safe"
        
        if plot:
            return result, freqs, amplitudes
        return result

# Example usage
if __name__ == "__main__":
    # Create detector with custom configuration
    config = DetectionConfig(
        frame_rate=30,
        freq_min=3.0,
        freq_max=30.0,
        threshold=1e5,
        batch_size=30
    )
    detector = EpilepsyDetector(config)
    
    # Check video and optionally plot results
    result, freqs, amplitudes = detector.check_epilepsy_trigger(
        "path/to/video.mp4", 
        plot=True
    )
    print(f"Detection result: {result}")
    detector.plot_spectrum(freqs, amplitudes) 