// Fused Video Analysis Script: Brainrot, Violence, Deepfake, Epilepsy
console.log("🧠🔫🤖⚡ video analysis script loaded!");

// --- CONFIG ---
const BRAINROT_COOLDOWN = 20000; // ms
const VIOLENCE_COOLDOWN = 15000; // ms
const DEEPFAKE_COOLDOWN = 20000; // ms
const EPILEPSY_COOLDOWN = 20000; // ms
const ANALYSIS_INTERVAL = 2000; // ms (how often to try analyzing a frame)
const VIOLENCE_THRESHOLD = 0.5;

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
            .fused-badge-epilepsy { bottom: 10px; right: 10px; background: rgba(255,0,255,0.85); }
        `;
        document.head.appendChild(style);
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

function fetchDeepfake(frame, video) {
    return fetch("http://127.0.0.1:8000/video/deepfake/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: frame, url: video.src || window.location.href }),
    })
        .then(res => res.json())
        .then(data => ({
            is_deepfake: data.is_deepfake,
            confidence: data.confidence
        }))
        .catch(() => ({ is_deepfake: false, confidence: 0 }));
}

async function fetchEpilepsy(frame) {
    try {
        console.log('[Epilepsy] Sending frame for analysis');
        const response = await fetch('http://localhost:8000/video/epilepsy/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: frame })
        });

        console.log('[Epilepsy] Response status:', response.status);
        const data = await response.json();
        console.log('[Epilepsy] Response data:', data);

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return {
            is_epilepsy_trigger: data.is_epilepsy_trigger || false,
            result: data.result || 'Unknown',
            confidence: data.confidence || 0,
            energy: data.energy || 0,
            threshold: data.threshold || 0,
            status: data.status || 'error',
            frame_count: data.frame_count || 0
        };
    } catch (error) {
        console.error('[Epilepsy] Error:', error);
        return {
            is_epilepsy_trigger: false,
            result: `Error: ${error.message}`,
            confidence: 0,
            energy: 0,
            threshold: 0,
            status: 'error',
            frame_count: 0
        };
    }
}

// --- MAIN ANALYSIS LOOP (refactored) ---
function analyzeVideo(video) {
    if (!videoStates.has(video)) {
        videoStates.set(video, {
            lastBrainrot: 0, brainrotInFlight: false,
            lastViolence: 0, violenceInFlight: false,
            lastDeepfake: 0, deepfakeInFlight: false,
            lastEpilepsy: 0, epilepsyInFlight: false
        });
    }
    if (video.paused || video.ended || !isTabActiveAndVisible()) return;
    const frame = captureFrame(video);
    if (frame) {
        Promise.all([
            fetchBrainrot(frame),
            fetchViolence(frame),
            fetchDeepfake(frame, video),
            fetchEpilepsy(frame)
        ]).then(([brainrot, violence, deepfake, epilepsy]) => {
            console.log('[video_script.js] Sending VIDEO_ANALYSIS_RESULTS:', { brainrot, violence, deepfake, epilepsy });
            chrome.runtime.sendMessage({
                type: 'VIDEO_ANALYSIS_RESULTS',
                data: { brainrot, violence, deepfake, epilepsy }
            });
            
            // Update badges
            if (brainrot.is_brainrot) {
                overlayBadge(video, 'brainrot', '⚠️ Brainrot Detected');
            } else {
                removeBadge(video, 'brainrot');
            }
            if (violence.is_violence && violence.confidence > VIOLENCE_THRESHOLD) {
                overlayBadge(video, 'violence', '🔫 Violence Detected');
            } else {
                removeBadge(video, 'violence');
            }
            if (deepfake.is_deepfake) {
                overlayBadge(video, 'deepfake', `🤖 Deepfake (${Math.round(deepfake.confidence * 100)}%)`);
            } else {
                removeBadge(video, 'deepfake');
            }
            if (epilepsy.status === 'collecting') {
                overlayBadge(video, 'epilepsy', `⚡ ${epilepsy.result}`);
            } else if (epilepsy.status === 'error') {
                overlayBadge(video, 'epilepsy', `⚠️ ${epilepsy.result}`);
            } else if (epilepsy.is_epilepsy_trigger) {
                overlayBadge(video, 'epilepsy', `⚡ Epilepsy Trigger (${Math.round(epilepsy.confidence * 100)}%)`);
            } else {
                removeBadge(video, 'epilepsy');
            }
        });
    }
}

function startVideoAnalysis(video) {
    if (video.dataset.fusedChecked) return;
    video.dataset.fusedChecked = "true";
    let intervalId;
    function analysisLoop() {
        if (!video.paused && !video.ended && isTabActiveAndVisible()) {
            analyzeVideo(video);
        }
    }
    video.addEventListener("playing", () => {
        intervalId = setInterval(analysisLoop, ANALYSIS_INTERVAL);
    });
    video.addEventListener("pause", () => {
        clearInterval(intervalId);
        removeBadge(video, 'brainrot');
        removeBadge(video, 'violence');
        removeBadge(video, 'deepfake');
        removeBadge(video, 'epilepsy');
    });
    video.addEventListener("ended", () => {
        clearInterval(intervalId);
        removeBadge(video, 'brainrot');
        removeBadge(video, 'violence');
        removeBadge(video, 'deepfake');
        removeBadge(video, 'epilepsy');
    });
}

function scanVideos() {
    document.querySelectorAll("video").forEach(startVideoAnalysis);
}

// --- INIT ---
ensureBadgeCSS();
scanVideos();
const observer = new MutationObserver(() => scanVideos());
observer.observe(document.body, { childList: true, subtree: true }); 