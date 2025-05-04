// Store active tab captures
const activeCaptures = new Map();
let isCapturing = false;

// Store the latest video analysis results
globalThis.lastVideoResults = null;

// Function to start tab capture
async function startTabCapture(tabId) {
    try {
        console.log('Starting tab capture for tab:', tabId);
        // Stop any existing capture for this tab
        if (activeCaptures.has(tabId)) {
            console.log('Stopping existing capture for tab:', tabId);
            const oldStream = activeCaptures.get(tabId);
            oldStream.getTracks().forEach(track => track.stop());
            activeCaptures.delete(tabId);
        }

        // Start new capture
        console.log('Requesting tab capture...');
        const stream = await new Promise((resolve, reject) => {
            chrome.tabCapture.capture({
                audio: true,
                video: false,
                audioConstraints: {
                    mandatory: {
                        chromeMediaSource: 'tab'
                    }
                }
            }, (stream) => {
                if (chrome.runtime.lastError) {
                    console.error('Tab capture error:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                    return;
                }
                console.log('Tab capture successful:', {
                    hasAudio: stream && stream.getAudioTracks().length > 0,
                    audioTracks: stream ? stream.getAudioTracks().length : 0
                });
                resolve(stream);
            });
        });

        // Store the stream
        activeCaptures.set(tabId, stream);
        isCapturing = true;
        return stream;
    } catch (error) {
        console.error('Error starting tab capture:', error);
        return null;
    }
}

// Function to stop tab capture
function stopTabCapture(tabId) {
    if (activeCaptures.has(tabId)) {
        const stream = activeCaptures.get(tabId);
        stream.getTracks().forEach(track => track.stop());
        activeCaptures.delete(tabId);
        isCapturing = false;
        return true;
    }
    return false;
}

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startCapture") {
        // Get the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs.length > 0) {
                const stream = await startTabCapture(tabs[0].id);
                sendResponse({ success: !!stream });

                // Notify content script
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "captureStarted",
                    success: !!stream
                });
            } else {
                sendResponse({ success: false, error: "No active tab found" });
            }
        });
        return true;
    }

    if (message.action === "stopCapture") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const success = stopTabCapture(tabs[0].id);
                sendResponse({ success });

                // Notify content script
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "captureStopped"
                });
            } else {
                sendResponse({ success: false });
            }
        });
        return true;
    }

    if (message.action === "getStatus") {
        sendResponse({ isCapturing });
        return true;
    }

    if (message.type === 'VIDEO_ANALYSIS_RESULTS') {
        console.log('[background.js] Received VIDEO_ANALYSIS_RESULTS:', message.data);
        globalThis.lastVideoResults = message.data;
        // Relay to popup if it's open
        chrome.runtime.sendMessage({
            type: 'VIDEO_ANALYSIS_RESULTS',
            data: globalThis.lastVideoResults
        });
        console.log('[background.js] Relayed VIDEO_ANALYSIS_RESULTS to popup:', globalThis.lastVideoResults);
    }
    if (message.type === 'GET_LATEST_VIDEO_RESULTS') {
        console.log('[background.js] Received GET_LATEST_VIDEO_RESULTS request');
        sendResponse({ data: globalThis.lastVideoResults });
        console.log('[background.js] Sent latest video results to popup:', globalThis.lastVideoResults);
    }
});

// Clean up function for when a tab is closed
function cleanupTab(tabId) {
    stopTabCapture(tabId);
}

// Listen for tab removal to clean up
chrome.tabs.onRemoved.addListener(cleanupTab);

// Listen for tab updates to detect video call windows
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if this is a video call URL
        if (tab.url.includes('facebook.com/messenger/room') ||
            tab.url.includes('facebook.com/call') ||
            tab.url.includes('messenger.com/call') ||
            tab.url.includes('facebook.com/groupcall/ROOM-') ||
            tab.url.includes('meet.google.com/')) {

            console.log('Video call detected:', tab.url);
            // Inject the audio extraction script into the call window
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['audio_extraction_script.js']
            });
        }
    }
});

// Listen for new windows to detect video call popups
chrome.windows.onCreated.addListener((window) => {
    // Get all tabs in the new window
    chrome.tabs.query({ windowId: window.id }, (tabs) => {
        tabs.forEach(tab => {
            if (tab.url && (tab.url.includes('facebook.com/messenger/room') ||
                tab.url.includes('facebook.com/call') ||
                tab.url.includes('messenger.com/call') ||
                tab.url.includes('facebook.com/groupcall/ROOM-') ||
                tab.url.includes('meet.google.com/'))) {

                console.log('Video call window detected:', tab.url);
                // Inject the audio extraction script into the call window
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['audio_extraction_script.js']
                });
            }
        });
    });
});
