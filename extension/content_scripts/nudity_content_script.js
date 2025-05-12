console.log("👁️ Nudity detection content script loaded!");

// Add request cooldown to prevent API call interruptions
const API_COOLDOWN = 1000; // 1 second between API calls
let lastApiCall = 0;

// Add CSS for blurring images
function addBlurStyles() {
    if (!document.getElementById('aigis-blur-styles')) {
        const style = document.createElement('style');
        style.id = 'aigis-blur-styles';
        style.textContent = `
            .aigis-blurred {
                filter: blur(40px) !important;
                transition: filter 0.3s ease !important;
            }
            .aigis-blurred:hover {
                filter: blur(10px) !important;
            }
        `;

        if (document.documentElement) {
            document.documentElement.appendChild(style);
        } else {
            setTimeout(addBlurStyles, 100);
        }
    }
}

// Initialize styles after document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBlurStyles);
} else {
    addBlurStyles();
}

function isTabActiveAndVisible() {
    return !document.hidden && document.visibilityState === 'visible';
}

async function fetchImageAsBlob(url) {
    try {
        const response = await fetch("http://127.0.0.1:8000/image/proxy/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error fetching image through proxy:", error);
        return null;
    }
}

async function processImage(img) {
    try {
        // Skip processing for emojis, SVGs, and data URLs
        if (img.src && (
            img.src.startsWith('data:') ||
            img.src.includes('svg') ||
            img.src.includes('emoji') ||
            img.src.includes('emoticons') ||
            img.src.includes('emoji.php') ||
            img.src.includes('emoji/') ||
            img.src.includes('emojis/') ||
            img.src.includes('emoji-') ||
            img.src.includes('emoticon') ||
            img.src.includes('smileys') ||
            img.src.includes('smiley') ||
            img.src.includes('sticker') ||
            img.src.includes('icon') ||
            img.src.includes('icons/') ||
            img.src.includes('static.xx.fbcdn.net') || // Facebook emoji CDN
            img.src.includes('emoji.discourse-cdn.com') || // Discourse emoji CDN
            img.src.includes('emoji-cdn') || // Common emoji CDN pattern
            img.src.includes('emoji-cdn.com') // Common emoji CDN pattern
        )) {
            return null; // Skip processing without showing any badge
        }

        // Always use the proxy for image processing
        if (img.src) {
            const imageData = await fetchImageAsBlob(img.src);
            if (imageData) {
                return imageData;
            } else {
                // If fetching fails, show error badge
                overlayResultBadge(img, "Error", "orange");
                return null;
            }
        }
        // If no src, show error badge
        overlayResultBadge(img, "Error", "orange");
        return null;
    } catch (error) {
        console.error("❌ Error processing image:", error);
        overlayResultBadge(img, "Error", "orange");
        return null;
    }
}

function overlayCORSBadge(img) {
    if (img.parentElement && !img.parentElement.querySelector('.aigis-cors-badge')) {
        const parent = img.parentElement;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        const badge = document.createElement('div');
        badge.className = 'aigis-cors-badge';
        badge.textContent = '⏳';
        badge.title = 'Processing image...';
        badge.style.position = 'absolute';
        badge.style.top = '4px';
        badge.style.left = '4px';
        badge.style.background = 'rgba(255,165,0,0.7)';
        badge.style.color = 'white';
        badge.style.fontSize = '18px';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.zIndex = '9999';
        badge.style.pointerEvents = 'none';
        parent.appendChild(badge);
    }
}

async function sendNudityToAPI(imageData, img) {
    if (!imageData || !isTabActiveAndVisible()) {
        overlayResultBadge(img, "Error", "orange");
        return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastApiCall < API_COOLDOWN) {
        await new Promise(resolve => setTimeout(resolve, API_COOLDOWN - (now - lastApiCall)));
    }
    lastApiCall = Date.now();

    try {
        console.log("\uD83D\uDCE4 Sending image to Django API...");
        const response = await fetch("http://127.0.0.1:8000/image/classify_nudity/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            throw new Error("Server did not return JSON");
        }

        const data = await response.json();

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
                }
            }
            if (img) overlayResultBadge(img, "NSFW", "red");
        } else {
            if (img) overlayResultBadge(img, "Safe", "green");
        }
        // Send to popup
        chrome.runtime.sendMessage({
            type: 'nudityDetectionResult',
            result: {
                label: data.label,
                url: img ? img.src : '',
                details: data
            }
        });
    } catch (err) {
        console.error("\u274C API error:", err);
        if (img) {
            overlayResultBadge(img, "Error", "orange");
        }
    }
}

async function scanImages() {
    try {
        const images = document.querySelectorAll("img");
        const imagePromises = [];

        images.forEach(img => {
            if (!img.dataset.nudityChecked) {
                img.dataset.nudityChecked = "true";
                overlayCORSBadge(img); // Show processing badge
                const processPromise = processImage(img)
                    .then(imageData => {
                        if (imageData) {
                            return sendNudityToAPI(imageData, img);
                        }
                    })
                    .catch(error => {
                        console.error("Error processing image:", error);
                        overlayResultBadge(img, "Error", "orange");
                    });
                imagePromises.push(processPromise);
            }
        });

        // Wait for all API calls to complete
        await Promise.allSettled(imagePromises);
    } catch (error) {
        console.error("Error in scanImages:", error);
    }
}

// Set up MutationObserver to detect new images
function setupImageObserver() {
    if (document.documentElement) {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeName === 'IMG' || node.querySelectorAll) {
                            shouldScan = true;
                        }
                    });
                }
            });
            if (shouldScan) {
                scanImages().catch(error => {
                    console.error("Error in observer-triggered scan:", error);
                });
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });
    } else {
        setTimeout(setupImageObserver, 100);
    }
}

// Initialize observer after document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupImageObserver);
} else {
    setupImageObserver();
}

// Initial scan
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        scanImages().catch(error => {
            console.error("Error in initial scan:", error);
        });
    });
} else {
    scanImages().catch(error => {
        console.error("Error in initial scan:", error);
    });
}

function overlayResultBadge(img, text, color) {
    if (img.parentElement) {
        // Remove processing badge if it exists
        const processingBadge = img.parentElement.querySelector('.aigis-cors-badge');
        if (processingBadge) {
            processingBadge.remove();
        }

        // Add result badge
        if (!img.parentElement.querySelector('.aigis-result-badge')) {
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
            badge.style.background = color === "red" ? 'rgba(255,0,0,0.7)' :
                color === "orange" ? 'rgba(255,165,0,0.7)' :
                    'rgba(0,128,0,0.7)';
            badge.style.color = 'white';
            badge.style.fontSize = '14px';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '4px';
            badge.style.zIndex = '9999';
            badge.style.pointerEvents = 'none';
            parent.appendChild(badge);
        }
    }
} 