document.addEventListener('DOMContentLoaded', function () {
    const violenceToggle = document.getElementById('violence-toggle');
    const nudityToggle = document.getElementById('nudity-toggle');
    const scanButton = document.getElementById('scan-page');
    const violenceResults = document.getElementById('violence-results');
    const nudityResults = document.getElementById('nudity-results');

    // Load saved settings
    chrome.storage.sync.get(['violenceEnabled', 'nudityEnabled'], function (data) {
        violenceToggle.checked = data.violenceEnabled !== false;
        nudityToggle.checked = data.nudityEnabled !== false;
    });

    // Save settings when changed
    violenceToggle.addEventListener('change', function () {
        chrome.storage.sync.set({ violenceEnabled: this.checked });
        updateStatus('violence', this.checked);
    });

    nudityToggle.addEventListener('change', function () {
        chrome.storage.sync.set({ nudityEnabled: this.checked });
        updateStatus('nudity', this.checked);
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
