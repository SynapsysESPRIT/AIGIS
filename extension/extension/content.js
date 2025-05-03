// Global state
let isDeepfakeEnabled = false;  // Default to false initially
let activeAnalyses = new Map(); // Track active analyses for each video
const ANALYSIS_COOLDOWN = 1000;  // 1 second cooldown between analyses

// Function to convert video frame to base64
async function captureVideoFrame(video) {
    try {
        // Wait for video metadata to load
        if (video.readyState === 0) {
            await new Promise((resolve) => {
                video.addEventListener('loadedmetadata', resolve, { once: true });
            });
        }

        // Create canvas with video dimensions
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        const ctx = canvas.getContext('2d');
        // Flip the image if it's from a webcam
        if (video.srcObject) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 and ensure proper formatting
        const base64Data = canvas.toDataURL('image/jpeg', 0.95);
        return base64Data;
    } catch (error) {
        console.error('Error capturing video frame:', error);
        throw error;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to analyze video for deepfakes
async function analyzeVideo(video) {
    const videoId = video.dataset.videoId || Math.random().toString(36).substr(2, 9);
    video.dataset.videoId = videoId;

    if (!video.played.length || video.paused) {
        return; // Don't analyze if video hasn't played or is paused
    }

    const currentTime = Date.now();
    const lastAnalysisTime = activeAnalyses.get(videoId)?.lastAnalysisTime || 0;
    
    if (currentTime - lastAnalysisTime < ANALYSIS_COOLDOWN) {
        return; // Don't analyze if we're within the cooldown period
    }

    // Update analysis state for this video
    activeAnalyses.set(videoId, {
        isAnalyzing: true,
        lastAnalysisTime: currentTime
    });

    try {
        // Early return if deepfake detection is disabled
        if (!isDeepfakeEnabled) {
            const existingWarning = video.parentElement.querySelector('.deepfake-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
            return;
        }

        // Get the video URL
        const videoUrl = video.src || window.location.href;

        // Capture current frame
        const frameData = await captureVideoFrame(video);
        
        if (!frameData) {
            console.error('Failed to capture video frame');
            return;
        }

        console.log(`Sending frame for analysis (Video ID: ${videoId})...`);
        
        // Send frame to backend for analysis
        const response = await fetch('http://localhost:8000/deepfake/detect/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                video: frameData,
                url: videoUrl,
                videoId: videoId
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response error:', response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
        }

        const result = await response.json();
        console.log(`Deepfake analysis result for video ${videoId}:`, result);

        // Remove existing warning for this specific video
        const existingWarning = video.parentElement.querySelector('.deepfake-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        if (result.is_deepfake && isDeepfakeEnabled) {
            // Create warning overlay
            const overlay = document.createElement('div');
            overlay.className = 'deepfake-warning';
            overlay.dataset.videoId = videoId;
            overlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                background: rgba(255, 0, 0, 0.7);
                color: white;
                padding: 10px;
                text-align: center;
                z-index: 10000;
                font-weight: bold;
            `;
            overlay.innerHTML = `⚠️ WARNING: This video may be a deepfake (${Math.round(result.confidence * 100)}% confidence)`;
            
            // Position the overlay relative to the video
            const videoContainer = video.parentElement;
            if (!videoContainer.style.position) {
                videoContainer.style.position = 'relative';
            }
            videoContainer.appendChild(overlay);
        }
    } catch (error) {
        console.error(`Error analyzing video ${videoId}:`, error);
    } finally {
        // Update analysis state for this video
        activeAnalyses.set(videoId, {
            isAnalyzing: false,
            lastAnalysisTime: currentTime
        });
    }
}

// Debounced version of analyzeVideo
const debouncedAnalyzeVideo = debounce(analyzeVideo, 250);

// Function to handle individual video elements
function handleVideoElement(video) {
    // Skip if already processed
    if (video.dataset.deepfakeChecked) return;
    video.dataset.deepfakeChecked = 'true';

    // Create container if needed
    if (!video.parentElement.style.position) {
        video.parentElement.style.position = 'relative';
    }

    // Analyze video when it starts playing
    video.addEventListener('play', () => {
        if (isDeepfakeEnabled) {
            console.log('Video started playing, initiating analysis...');
            setTimeout(() => debouncedAnalyzeVideo(video), 1000);
        }
    });

    // Also analyze periodically during playback
    video.addEventListener('timeupdate', () => {
        if (isDeepfakeEnabled) {
            debouncedAnalyzeVideo(video);
        }
    });

    // Also analyze when video pauses
    video.addEventListener('pause', () => {
        const videoId = video.dataset.videoId;
        if (videoId) {
            const existingWarning = video.parentElement.querySelector(`.deepfake-warning[data-video-id="${videoId}"]`);
            if (existingWarning) {
                existingWarning.remove();
            }
        }
    });
}

// Function to observe video elements
function observeVideoElements() {
    // Create observer for dynamically added videos
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'VIDEO') {
                    handleVideoElement(node);
                }
            });
        });
    });

    // Observe document for added nodes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Handle existing videos
    document.querySelectorAll('video').forEach(handleVideoElement);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggleDeepfake') {
        isDeepfakeEnabled = message.enabled;
        
        // Remove all warnings if disabled
        if (!isDeepfakeEnabled) {
            document.querySelectorAll('.deepfake-warning').forEach(warning => {
                warning.remove();
            });
            activeAnalyses.clear();
        } else {
            // Re-analyze all videos if enabled
            document.querySelectorAll('video').forEach(video => {
                if (video.currentTime > 0) {  // Only analyze if video has started playing
                    debouncedAnalyzeVideo(video);
                }
            });
        }
    }
});

// Load initial state
chrome.storage.sync.get(['deepfakeEnabled'], function(result) {
    isDeepfakeEnabled = result.deepfakeEnabled === true;  // Default to false if not set
    
    // If enabled on load, start analyzing existing videos
    if (isDeepfakeEnabled) {
        document.querySelectorAll('video').forEach(video => {
            if (video.currentTime > 0) {  // Only analyze if video has started playing
                debouncedAnalyzeVideo(video);
            }
        });
    }
});

// Start observing when content script loads
observeVideoElements();

function showWarningBanner(confidence) {
    let banner = document.getElementById('deepfake-warning');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'deepfake-warning';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background-color: #ff0000;
            color: white;
            padding: 10px;
            text-align: center;
            z-index: 9999;
            font-weight: bold;
        `;
        document.body.appendChild(banner);
    }
    banner.textContent = `⚠️ WARNING: This video may be a deepfake (${(confidence * 100).toFixed(1)}% confidence)`;
}

function removeWarningBanner() {
    const banner = document.getElementById('deepfake-warning');
    if (banner) {
        banner.remove();
    }
} 