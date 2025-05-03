document.addEventListener('DOMContentLoaded', function () {
    const deepfakeToggle = document.getElementById('deepfakeToggle');
    const violenceToggle = document.getElementById('violenceToggle');
    const nudityToggle = document.getElementById('nudityToggle');
    const scanButton = document.getElementById('scan-page');
    const violenceResults = document.getElementById('violence-results');
    const nudityResults = document.getElementById('nudity-results');

    // Load saved states
    chrome.storage.sync.get(['deepfakeEnabled', 'violenceEnabled', 'nudityEnabled'], function (result) {
        deepfakeToggle.checked = result.deepfakeEnabled === true;
        violenceToggle.checked = result.violenceEnabled === true;
        nudityToggle.checked = result.nudityEnabled === true;
    });

    // Handle deepfake toggle
    deepfakeToggle.addEventListener('change', function () {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ deepfakeEnabled: isEnabled });
        
        // Notify content script of the change
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'toggleDeepfake',
                enabled: isEnabled
            });
        });
    });

    // Handle violence toggle
    violenceToggle.addEventListener('change', function () {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ violenceEnabled: isEnabled });
        
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'toggleViolence',
                enabled: isEnabled
            });
        });
    });

    // Handle nudity toggle
    nudityToggle.addEventListener('change', function () {
        const isEnabled = this.checked;
        chrome.storage.sync.set({ nudityEnabled: isEnabled });
        
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'toggleNudity',
                enabled: isEnabled
            });
        });
    });

    // Handle scan button click
    scanButton.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "scan" });
        });
    });

    // Listen for detection results from content scripts
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.type === 'violenceResult') {
            updateViolenceResult(request.data);
        } else if (request.type === 'nudityResult') {
            updateNudityResult(request.data);
        }
    });

    function updateStatus(type, enabled) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "updateStatus",
                type: type,
                enabled: enabled
            });
        });
    }

    function updateViolenceResult(result) {
        let html = '';
        if (result.is_violent) {
            html = `
                <div class="result danger">
                    <span class="result-icon">⚠️</span>
                    <span>Violence detected (${(result.confidence * 100).toFixed(1)}% confidence)</span>
                </div>`;
        } else {
            html = `
                <div class="result safe">
                    <span class="result-icon">✅</span>
                    <span>No violence detected</span>
                </div>`;
        }
        violenceResults.innerHTML = html;
    }

    function updateNudityResult(result) {
        let html = '';
        if (result.label === 'Nudity') {
            html = `
                <div class="result danger">
                    <span class="result-icon">⚠️</span>
                    <span>Nudity detected (${(result.confidence * 100).toFixed(1)}% confidence)</span>
                </div>`;
        } else {
            html = `
                <div class="result safe">
                    <span class="result-icon">✅</span>
                    <span>No nudity detected</span>
                </div>`;
        }
        nudityResults.innerHTML = html;
    }
});
