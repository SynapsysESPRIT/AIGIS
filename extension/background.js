// Store active tab captures
const activeCaptures = new Map();
let isCapturing = false;

// Store the latest video analysis results
globalThis.lastVideoResults = null;

// Authentication state
let isAuthenticated = false;
let currentChildId = null;

// Check authentication status on startup
chrome.storage.local.get(['authToken', 'childId'], function (result) {
    if (result.authToken) {
        isAuthenticated = true;
        currentChildId = result.childId;
    }
});

// Login function
async function login(username, password) {
    console.log('[background.js] Attempting login with:', username);
    try {
        const response = await fetch('http://localhost:8000/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        console.log('[background.js] Login response status:', response.status);
        const data = await response.json();
        console.log('[background.js] Login response data:', data);
        if (response.ok && data.status === 'success') {
            isAuthenticated = true;
            chrome.storage.local.set({ authToken: true });
            return true;
        }
        return false;
    } catch (error) {
        console.error('[background.js] Login error:', error);
        return false;
    }
}

// Log activity function
async function logActivity(activityData) {
    if (!isAuthenticated || !currentChildId) return;

    try {
        const response = await fetch('http://localhost:8000/monitoring/log-activity/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                child_id: currentChildId,
                ...activityData
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Activity logging error:', error);
        return false;
    }
}

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

    if (message.type === 'LOGIN') {
        console.log('[background.js] Received LOGIN message:', message);
        login(message.username, message.password)
            .then(success => {
                console.log('[background.js] Login result:', success);
                sendResponse({ success });
            });
        return true;
    }

    if (message.type === 'SET_CHILD') {
        currentChildId = message.childId;
        chrome.storage.local.set({ childId: message.childId });
        sendResponse({ success: true });
        return true;
    }

    if (message.type === 'LOGOUT') {
        isAuthenticated = false;
        currentChildId = null;
        chrome.storage.local.remove(['authToken', 'childId']);
        sendResponse({ success: true });
        return true;
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
        monitorContent(tabId, tab.url, 'BROWSING');
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

// Enhanced content monitoring
function monitorContent(tabId, url, type) {
    if (!isAuthenticated || !currentChildId) return;

    // Determine risk level based on content type and URL
    let riskLevel = 0;
    const urlLower = url.toLowerCase();

    // Basic risk assessment
    if (urlLower.includes('adult') || urlLower.includes('gambling')) {
        riskLevel = 5;
    } else if (urlLower.includes('social') || urlLower.includes('chat')) {
        riskLevel = 3;
    }

    // Log the activity
    logActivity({
        activity_type: type,
        url: url,
        risk_level: riskLevel,
        details: {
            timestamp: new Date().toISOString(),
            tabId: tabId
        }
    });
}

// Monitor media content
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.type === 'media') {
            monitorContent(details.tabId, details.url, 'VIDEO');
        }
    },
    { urls: ['<all_urls>'] }
);
