console.log("🧠 Content script loaded!");

function captureFrame(video) {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        console.log("🎥 Frame captured.");
        return canvas.toDataURL("image/jpeg");
    } catch (error) {
        console.error("❌ Error capturing frame:", error);
        sendMessageToPopup({ type: "error", message: "Error capturing video frame." });
    }
}

function sendVideoToAPI(frame) {
    console.log("📤 Sending frame to Django API...");
    sendMessageToPopup({ type: "status", message: "Sending video frame to API..." });

    fetch("http://127.0.0.1:8000/brainrot/classify_video/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: frame }),
    })
    .then(res => res.json())
    .then(data => {
        console.log("✅ Prediction:", data.label);
        sendMessageToPopup({
            type: "video-detection",
            label: data.label,
        });

        if (data.label === "Brainrot") {
            alert("⚠️ Brainrot detected!");
        }
    })
    .catch(err => {
        console.error("❌ API error:", err);
        sendMessageToPopup({ type: "error", message: "API error during classification." });
    });
}

function sendMessageToPopup(data) {
    chrome.runtime.sendMessage(data);
}

function scanVideos() {
    const videos = document.querySelectorAll("video");
    videos.forEach(video => {
        if (!video.dataset.brainrotChecked) {
            video.dataset.brainrotChecked = "true";

            video.addEventListener("playing", () => {
                console.log("▶️ Video started.");
                sendMessageToPopup({ type: "status", message: "Video started playing." });
                const frame = captureFrame(video);
                if (frame) {
                    sendVideoToAPI(frame);
                }
            });
        }
    });
}

// Initial scan
scanVideos();

// Watch for added videos
const videoObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.addedNodes.length) {
            scanVideos();
        }
    });
});

videoObserver.observe(document.body, {
    childList: true,
    subtree: true
});
