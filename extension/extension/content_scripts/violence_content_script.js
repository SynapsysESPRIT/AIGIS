console.log("🔫 Violence detection content script loaded!");

// Add CSS for blurring videos
const violenceStyle = document.createElement('style');
violenceStyle.textContent = `
    .aigis-violence-blurred {
        filter: blur(40px) !important;
        transition: filter 0.3s ease !important;
    }
    .aigis-violence-blurred:hover {
        filter: blur(10px) !important;
    }
`;
document.head.appendChild(violenceStyle);

// Configuration
const VIOLENCE_FRAME_SAMPLE_RATE = 1; // Analyze every frame
const VIOLENCE_THRESHOLD = 0.5; // Confidence threshold for violence detection
let isViolenceDetectionEnabled = true;

// Function to capture a frame from video
function captureViolenceFrame(video) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg");
    } catch (error) {
        console.error("❌ Error capturing frame:", error);
        return null;
    }
}

// Function to send frame to violence detection API
function sendFrameToViolenceAPI(frame, video) {
    if (!isViolenceDetectionEnabled) return;

    fetch("http://127.0.0.1:8000/violence/detect/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: frame }),
    })
        .then(res => res.json())
        .then(data => {
            console.log("🔍 Violence prediction:", data);

            // Send result to popup
            chrome.runtime.sendMessage({
                type: 'violenceResult',
                data: data
            });

            // Handle violent content
            if (data.is_violent && data.confidence > VIOLENCE_THRESHOLD) {
                if (video && !video.classList.contains("aigis-violence-blurred")) {
                    video.classList.add("aigis-violence-blurred");
                    console.log("⚠️ Video blurred due to violence detection");
                }
                overlayViolenceResultBadge(video, "Violent", "red");
            } else {
                overlayViolenceResultBadge(video, "Safe", "green");
            }
        })
        .catch(err => {
            console.error("❌ Violence API error:", err);
        });
}

// Function to analyze video frames
function analyzeViolenceVideoFrames(video) {
    if (!video.dataset.violenceChecked) {
        video.dataset.violenceChecked = "true";
        let frameCount = 0;

        video.addEventListener("playing", () => {
            console.log("▶️ Video started, analyzing frames...");

            // Create a canvas for frame analysis
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // Function to analyze current frame
            function analyzeCurrentViolenceFrame() {
                if (video.paused || video.ended) return;

                try {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // Only analyze every VIOLENCE_FRAME_SAMPLE_RATE frame
                    if (frameCount % VIOLENCE_FRAME_SAMPLE_RATE === 0) {
                        const frameData = canvas.toDataURL("image/jpeg");
                        sendFrameToViolenceAPI(frameData, video);
                    }

                    frameCount++;
                    requestAnimationFrame(analyzeCurrentViolenceFrame);
                } catch (error) {
                    console.error("❌ Error analyzing frame:", error);
                }
            }

            // Start frame analysis
            requestAnimationFrame(analyzeCurrentViolenceFrame);
        });
    }
}

// Function to overlay result badge
function overlayViolenceResultBadge(video, text, color) {
    if (!video.parentElement || video.parentElement.querySelector('.aigis-violence-badge')) return;

    const parent = video.parentElement;
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    const badge = document.createElement('div');
    badge.className = 'aigis-violence-badge';
    badge.textContent = text;
    badge.style.position = 'absolute';
    badge.style.bottom = '4px';
    badge.style.left = '4px';
    badge.style.background = color === "red" ? 'rgba(255,0,0,0.7)' : 'rgba(0,128,0,0.7)';
    badge.style.color = 'white';
    badge.style.fontSize = '14px';
    badge.style.padding = '2px 8px';
    badge.style.borderRadius = '4px';
    badge.style.zIndex = '9999';
    badge.style.pointerEvents = 'none';
    parent.appendChild(badge);
}

// Function to scan for videos
function scanViolenceVideos() {
    const videos = document.querySelectorAll("video");
    videos.forEach(video => {
        analyzeViolenceVideoFrames(video);
    });
}

// Initial scan
scanViolenceVideos();

// Set up MutationObserver to detect new videos
const violenceObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            scanViolenceVideos();
        }
    });
});

violenceObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateStatus") {
        isViolenceDetectionEnabled = request.enabled;
    } else if (request.action === "scan") {
        scanViolenceVideos();
    }
}); 