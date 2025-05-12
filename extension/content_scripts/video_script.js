// Fused Video Analysis Script: Brainrot, Violence, Deepfake, Flashing Lights
console.log("🧠🔫🤖⚡ video analysis script loaded!");

// --- CONFIG ---
const BRAINROT_COOLDOWN = 20000; // ms
const VIOLENCE_COOLDOWN = 15000; // ms
const DEEPFAKE_COOLDOWN = 20000; // ms
const ANALYSIS_INTERVAL = 2000; // ms (how often to try analyzing a frame)
const VIOLENCE_THRESHOLD = 0.5;
const FLASH_FRAME_INTERVAL = 5000; // ms (check for flashing lights every 5 seconds)
const FLASH_COOLDOWN = 5000; // ms (minimum time between flash detection requests)

// --- STATE ---
const videoStates = new WeakMap(); // video => { lastXRequestTime, XRequestInFlight }

function isTabActiveAndVisible() {
    return !document.hidden && document.visibilityState === 'visible';
}

function ensureBadgeCSS() {
    if (!document.getElementById('fused-badge-style')) {
        const style = document.createElement('style');
        style.id = 'fused-badge-style';
        style.textContent = `
            .fused-badge { position: absolute; z-index: 99999; font-weight: bold; border-radius: 6px; padding: 6px 12px; color: #fff; font-size: 1em; pointer-events: none; user-select: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
            .fused-badge-brainrot { top: 10px; left: 10px; background: rgba(255,0,0,0.85); }
            .fused-badge-violence { top: 10px; right: 10px; background: rgba(255,140,0,0.85); }
            .fused-badge-deepfake { bottom: 10px; left: 10px; background: rgba(128,0,255,0.85); }
            .fused-badge-flash { bottom: 10px; right: 10px; background: rgba(255,0,255,0.85); }
            .fused-video-blur { filter: blur(20px); transition: filter 0.3s ease-in-out; }
            .fused-video-red-filter { 
                position: relative;
            }
            .fused-video-red-filter::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 0, 0, 0.5);
                mix-blend-mode: multiply;
                pointer-events: none;
                transition: opacity 0.3s ease-in-out;
            }
        `;

        // Add style to document.documentElement instead of document.head
        document.documentElement.appendChild(style);
    }
}

function applyBlur(video, shouldBlur) {
    if (!video.parentElement) return;
    if (shouldBlur) {
        video.classList.add('fused-video-blur');
    } else {
        video.classList.remove('fused-video-blur');
    }
}

function applyRedFilter(video, shouldApply) {
    if (!video.parentElement) return;
    if (shouldApply) {
        video.classList.add('fused-video-red-filter');
    } else {
        video.classList.remove('fused-video-red-filter');
    }
}

function overlayBadge(video, type, text) {
    if (!video.parentElement) return;
    // Remove old badge of this type
    video.parentElement.querySelectorAll('.fused-badge-' + type).forEach(b => b.remove());
    // Add new badge
    const badge = document.createElement('div');
    badge.className = `fused-badge fused-badge-${type}`;
    badge.textContent = text;
    const parent = video.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(badge);
}

function removeBadge(video, type) {
    if (!video.parentElement) return;
    video.parentElement.querySelectorAll('.fused-badge-' + type).forEach(b => b.remove());
}

function captureFrame(video) {
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

// --- API CALLS (Promise-based) ---
function fetchBrainrot(frame) {
    return fetch("http://127.0.0.1:8000/video/brainrot/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: frame }),
    })
        .then(res => res.json())
        .then(data => ({
            is_brainrot: data.label === "Brainrot",
            confidence: data.confidence
        }))
        .catch(() => ({ is_brainrot: false, confidence: 0 }));
}

function fetchViolence(frame) {
    return fetch("http://127.0.0.1:8000/video/violence/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: frame }),
    })
        .then(res => res.json())
        .then(data => ({
            is_violence: data.is_violent,
            confidence: data.confidence
        }))
        .catch(() => ({ is_violence: false, confidence: 0 }));
}

async function fetchDeepfake(frame, video) {
    try {
        // Get the auth token from storage
        const token = await new Promise((resolve) => {
            chrome.storage.local.get(['authToken'], (result) => {
                resolve(result.authToken);
            });
        });

        if (!token) {
            console.error('No authentication token found for deepfake detection');
            return { is_deepfake: false, confidence: 0 };
        }

        const response = await fetch("http://127.0.0.1:8000/video/deepfake/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${token}`
            },
            body: JSON.stringify({ video: frame, url: video.src || window.location.href }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
            is_deepfake: data.is_deepfake,
            confidence: data.confidence
        };
    } catch (error) {
        console.error("Error in deepfake detection:", error);
        return { is_deepfake: false, confidence: 0 };
    }
}

async function fetchFlashDetection(frame) {
    try {
        console.log('[Flash] Sending frame for analysis');
        const response = await fetch("http://127.0.0.1:8000/video/epilepsy/", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ image: frame })
        });

        console.log('[Flash] Response status:', response.status);
        const data = await response.json();
        console.log('[Flash] Response data:', data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return {
            is_flash_trigger: data.is_epilepsy_trigger || false,
            result: data.result || 'Unknown',
            confidence: data.confidence || 0,
            status: data.status || 'error',
            frame_count: data.frame_count || 0
        };
    } catch (error) {
        console.error('[Flash] Error:', error);
        if (error.message === 'Failed to fetch') {
            return {
                is_flash_trigger: false,
                result: 'Server connection error. Please ensure the server is running.',
                confidence: 0,
                status: 'error',
                frame_count: 0
            };
        }
        return {
            is_flash_trigger: false,
            result: `Error: ${error.message}`,
            confidence: 0,
            status: 'error',
            frame_count: 0
        };
    }
}

function startVideoAnalysis(video) {
    if (video.dataset.fusedChecked) return;
    video.dataset.fusedChecked = "true";
    let analysisIntervalId;
    let flashIntervalId;
    let lastFlashCheck = 0;

    function analysisLoop() {
        if (!video.paused && !video.ended && isTabActiveAndVisible()) {
            const frame = captureFrame(video);
            if (frame) {
                // Run other analyses immediately
                Promise.all([
                    fetchBrainrot(frame),
                    fetchViolence(frame),
                    fetchDeepfake(frame, video)
                ]).then(([brainrot, violence, deepfake]) => {
                    console.log('[video_script.js] Sending VIDEO_ANALYSIS_RESULTS:', { brainrot, violence, deepfake });
                    chrome.runtime.sendMessage({
                        type: 'VIDEO_ANALYSIS_RESULTS',
                        data: { brainrot, violence, deepfake }
                    });

                    // Send detections to monitoring backend
                    sendDetectionToMonitoring('brainrot', brainrot);
                    sendDetectionToMonitoring('violence', violence);
                    sendDetectionToMonitoring('deepfake', deepfake);

                    // Update badges and effects
                    if (brainrot.is_brainrot) {
                        overlayBadge(video, 'brainrot', '⚠️ Brainrot Detected');
                    } else {
                        removeBadge(video, 'brainrot');
                    }

                    // Only apply blur for violence detection
                    if (violence.is_violence && violence.confidence > VIOLENCE_THRESHOLD) {
                        overlayBadge(video, 'violence', '🔫 Violence Detected');
                        applyBlur(video, true);
                    } else {
                        removeBadge(video, 'violence');
                        applyBlur(video, false);
                    }

                    if (deepfake.is_deepfake) {
                        overlayBadge(video, 'deepfake', `🤖 Deepfake (${Math.round(deepfake.confidence * 100)}%)`);
                    } else {
                        removeBadge(video, 'deepfake');
                    }
                });
            }
        }
    }

    function flashDetectionLoop() {
        if (!video.paused && !video.ended && isTabActiveAndVisible()) {
            const now = Date.now();
            // Only check for flashes if enough time has passed since last check
            if (now - lastFlashCheck >= FLASH_COOLDOWN) {
                const frame = captureFrame(video);
                if (frame) {
                    lastFlashCheck = now;
                    fetchFlashDetection(frame).then(flashData => {
                        // Only show badge for final results or errors
                        if (flashData.is_flash_trigger) {
                            overlayBadge(video, 'flash', `⚡ Flashing Lights Detected`);
                            applyRedFilter(video, true);
                        } else if (flashData.status === 'error') {
                            overlayBadge(video, 'flash', `⚠️ ${flashData.result}`);
                        } else {
                            removeBadge(video, 'flash');
                            applyRedFilter(video, false);
                        }

                        // Send results
                        chrome.runtime.sendMessage({
                            type: 'VIDEO_ANALYSIS_RESULTS',
                            data: { flash: flashData }
                        });
                    });
                }
            }
        }
    }

    video.addEventListener("playing", () => {
        analysisIntervalId = setInterval(analysisLoop, ANALYSIS_INTERVAL);
        flashIntervalId = setInterval(flashDetectionLoop, FLASH_FRAME_INTERVAL);
    });

    video.addEventListener("pause", () => {
        clearInterval(analysisIntervalId);
        clearInterval(flashIntervalId);
        removeBadge(video, 'brainrot');
        removeBadge(video, 'violence');
        removeBadge(video, 'deepfake');
        removeBadge(video, 'flash');
        applyBlur(video, false);
        applyRedFilter(video, false);
    });

    video.addEventListener("ended", () => {
        clearInterval(analysisIntervalId);
        clearInterval(flashIntervalId);
        removeBadge(video, 'brainrot');
        removeBadge(video, 'violence');
        removeBadge(video, 'deepfake');
        removeBadge(video, 'flash');
        applyBlur(video, false);
        applyRedFilter(video, false);
    });
}

function scanVideos() {
    document.querySelectorAll("video").forEach(startVideoAnalysis);
}

// Initial setup
ensureBadgeCSS();
scanVideos();

// Set up MutationObserver to detect new videos
function setupObserver() {
    if (document.documentElement) {
        const observer = new MutationObserver(() => scanVideos());
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    } else {
        // If documentElement isn't ready, try again in a moment
        setTimeout(setupObserver, 100);
    }
}

setupObserver();

async function sendDetectionToServer(detection) {
    try {
        // Get the auth token from storage
        const token = await new Promise((resolve) => {
            chrome.storage.local.get(['authToken'], (result) => {
                resolve(result.authToken);
            });
        });

        if (!token) {
            console.error('No authentication token found');
            return;
        }

        const response = await fetch('http://127.0.0.1:8000/video/deepfake/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`
            },
            body: JSON.stringify(detection)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Detection sent successfully:', result);
    } catch (error) {
        console.error('Error sending detection:', error);
    }
}

// Helper to send detection to monitoring backend
async function sendDetectionToMonitoring(type, result) {
    try {
        // Get the active child ID from storage (async)
        let activeChildId = 1; // fallback
        if (chrome && chrome.storage && chrome.storage.local) {
            const storage = await new Promise(resolve => chrome.storage.local.get('activeChildId', resolve));
            if (storage.activeChildId) activeChildId = storage.activeChildId;
        }
        const payload = {
            child_id: activeChildId,
            type: 'video',
            result: { [type]: result }
        };
        console.log('[video_script.js] Sending detection to /monitoring/log-detection/:', payload);
        const response = await fetch('http://127.0.0.1:8000/monitoring/log-detection/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log('[video_script.js] Monitoring log-detection response:', data);
    } catch (err) {
        console.error('[video_script.js] Error sending detection to monitoring:', err);
    }
} 