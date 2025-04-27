console.log("👁️ Nudity detection content script loaded!");

// Add CSS for blurring images
const style = document.createElement('style');
style.textContent = `
    .aigis-blurred {
        filter: blur(40px) !important;
        transition: filter 0.3s ease !important;
    }
    .aigis-blurred:hover {
        filter: blur(10px) !important;
    }
`;
document.head.appendChild(style);

let warnedImageNotLoaded = false;

function processImage(img) {
    try {
        if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
            // Silently skip images that are not loaded or have no size
            return null;
        }
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg");
    } catch (error) {
        if (error.name === "SecurityError") {
            console.warn("⚠️ Skipping tainted/cross-origin image (CORS):", img.src);
            overlayCORSBadge(img);
        } else {
            console.error("❌ Error processing image:", error);
        }
        return null;
    }
}

function overlayCORSBadge(img) {
    // Avoid adding multiple badges
    if (img.parentElement && !img.parentElement.querySelector('.aigis-cors-badge')) {
        // Make sure the parent is positioned
        const parent = img.parentElement;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        // Create badge
        const badge = document.createElement('div');
        badge.className = 'aigis-cors-badge';
        badge.textContent = '🔒';
        badge.title = 'Cannot scan or blur this image due to browser security (CORS)';
        badge.style.position = 'absolute';
        badge.style.top = '4px';
        badge.style.left = '4px';
        badge.style.background = 'rgba(255,0,0,0.7)';
        badge.style.color = 'white';
        badge.style.fontSize = '18px';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.zIndex = '9999';
        badge.style.pointerEvents = 'none';
        parent.appendChild(badge);
    }
}

function sendNudityToAPI(imageData, img) {
    if (!imageData) return;
    console.log("\uD83D\uDCE4 Sending image to Django API...");
    fetch("http://127.0.0.1:8000/classify_nudity/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
    })
        .then(res => {
            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("Server did not return JSON");
            }
            return res.json();
        })
        .then(data => {
            if (img && typeof img.src !== 'undefined') {
                console.log("\u2705 Prediction:", data.label, "for", img.src);
            } else {
                console.log("\u2705 Prediction:", data.label, "for [image missing]");
            }
            if (data.label === "Nudity") {
                if (img && img.classList && !img.classList.contains("aigis-blurred")) {
                    img.classList.add("aigis-blurred");
                    if (img && typeof img.src !== 'undefined') {
                        console.log("\uD83D\uDD12 Image blurred due to nudity detection:", img.src);
                    } else {
                        console.log("\uD83D\uDD12 Image blurred due to nudity detection: [image missing]");
                    }
                }
                if (img) overlayResultBadge(img, "Nude", "red");
            } else {
                if (img) overlayResultBadge(img, "Safe", "green");
            }
        })
        .catch(err => {
            console.error("\u274C API error:", err);
        });
}

function scanImages() {
    const images = document.querySelectorAll("img");
    images.forEach(img => {
        if (!img.dataset.nudityChecked) {
            img.dataset.nudityChecked = "true";
            // Skip cross-origin images
            if (img.crossOrigin && img.crossOrigin !== "anonymous") {
                console.warn("⚠️ Skipping cross-origin image", img.src);
                return;
            }
            // Process image when it's loaded
            if (img.complete) {
                const imageData = processImage(img);
                if (imageData) {
                    sendNudityToAPI(imageData, img);
                }
            } else {
                img.addEventListener("load", () => {
                    const imageData = processImage(img);
                    if (imageData) {
                        sendNudityToAPI(imageData, img);
                    }
                });
            }
        }
    });
}

// Initial scan
scanImages();

// Set up MutationObserver to detect new images
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            scanImages();
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

function overlayResultBadge(img, text, color) {
    // Avoid adding multiple badges
    if (img.parentElement && !img.parentElement.querySelector('.aigis-result-badge')) {
        const parent = img.parentElement;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        const badge = document.createElement('div');
        badge.className = 'aigis-result-badge';
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
} 