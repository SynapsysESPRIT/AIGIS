document.addEventListener('DOMContentLoaded', function () {
    const violenceToggle = document.getElementById('violence-toggle');
    const nudityToggle = document.getElementById('nudity-toggle');
    const scanButton = document.getElementById('scan-page');
    const violenceResults = document.getElementById('violence-results');
    const nudityResults = document.getElementById('nudity-results');
    const textResults = document.getElementById('text-results');
    const textSummary = document.getElementById('text-summary');
    const textToggle = document.getElementById('text-toggle');
    const processButton = document.getElementById('processButton');
    const downloadButton = document.getElementById('downloadButton');
    const statusDiv = document.getElementById('status');
    const toggleButton = document.getElementById('toggleCapture');
    let currentScreenshot = null;
    let isCapturing = false;

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

    // Function to create a probability bar
    function createProbabilityBar(probability, type) {
        const bar = document.createElement('div');
        bar.className = 'probability-bar';
        const fill = document.createElement('div');
        fill.className = `probability-fill ${type}`;
        fill.style.width = `${probability * 100}%`;
        bar.appendChild(fill);
        return bar;
    }

    // Function to display text classification results
    function displayTextResults(results) {
        // Clear previous results
        textResults.innerHTML = '';

        if (!results || !results.results) {
            textResults.innerHTML = '<div class="text-result">No results available</div>';
            return;
        }

        // Display each result
        results.results.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'text-result';

            // Add message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'text-message';
            messageDiv.textContent = result.message;
            resultDiv.appendChild(messageDiv);

            // Add prediction
            const predictionDiv = document.createElement('div');
            predictionDiv.className = 'text-prediction';
            const icon = document.createElement('span');
            icon.className = 'result-icon';

            // Set icon based on prediction
            if (result.prediction.label === 'Safe') {
                icon.textContent = '✅';
                predictionDiv.className += ' safe';
            } else if (result.prediction.label === 'Offensive') {
                icon.textContent = '⚠️';
                predictionDiv.className += ' warning';
            } else if (result.prediction.label === 'Hate') {
                icon.textContent = '🚫';
                predictionDiv.className += ' danger';
            }

            predictionDiv.appendChild(icon);
            predictionDiv.appendChild(document.createTextNode(result.prediction.label));
            resultDiv.appendChild(predictionDiv);

            // Add confidence
            const confidenceDiv = document.createElement('div');
            confidenceDiv.className = 'text-confidence';
            confidenceDiv.textContent = `${result.prediction.confidence_level} confidence (${(result.prediction.confidence * 100).toFixed(1)}%)`;
            resultDiv.appendChild(confidenceDiv);

            // Add explanation
            const explanationDiv = document.createElement('div');
            explanationDiv.className = 'text-explanation';
            explanationDiv.textContent = result.prediction.explanation;
            resultDiv.appendChild(explanationDiv);

            // Add probabilities
            const probabilitiesDiv = document.createElement('div');
            probabilitiesDiv.className = 'text-probabilities';

            Object.entries(result.probabilities).forEach(([type, prob]) => {
                const probDiv = document.createElement('div');
                probDiv.style.flex = '1';
                probDiv.appendChild(document.createTextNode(`${type}: ${(prob * 100).toFixed(1)}%`));
                probDiv.appendChild(createProbabilityBar(prob, type.toLowerCase()));
                probabilitiesDiv.appendChild(probDiv);
            });

            resultDiv.appendChild(probabilitiesDiv);
            textResults.appendChild(resultDiv);
        });

        // Display summary
        if (results.summary) {
            displaySummary(results.summary);
        }
    }

    // Function to display summary
    function displaySummary(summary) {
        textSummary.innerHTML = `
            <div class="summary-item">
                <span>Offensive Messages:</span>
                <span>${summary.offensive_count}</span>
            </div>
            <div class="summary-item">
                <span>Hate Speech:</span>
                <span>${summary.hate_count}</span>
            </div>
            <div class="summary-item">
                <span>Safe Messages:</span>
                <span>${summary.safe_count}</span>
            </div>
            <div class="summary-item">
                <span>Errors:</span>
                <span>${summary.error_count}</span>
            </div>
        `;
    }

    // Function to scan the current page
    async function scanPage() {
        if (!textToggle.checked) return;

        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Execute the text processing script
            const results = await chrome.tabs.sendMessage(tab.id, { action: 'processText' });

            if (results) {
                displayTextResults(results.results);
                displaySummary(results.summary);
            }
        } catch (error) {
            console.error('Error scanning page:', error);
        }
    }

    // Event listeners
    scanButton.addEventListener('click', scanPage);

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'textClassificationResults') {
            console.log('Received text classification results:', message.results);
            displayTextResults(message.results);
        }
    });

    // Initial scan when popup opens
    scanPage();

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

    processButton.addEventListener('click', async () => {
        try {
            statusDiv.textContent = 'Processing...';
            statusDiv.className = '';

            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Execute the screenshot script
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: takeScreenshot
            });

            if (results && results[0] && results[0].result) {
                currentScreenshot = results[0].result;
                downloadButton.style.display = 'block';
                statusDiv.textContent = 'Screenshot captured successfully!';
                statusDiv.className = 'success';
            } else {
                throw new Error('Failed to capture screenshot');
            }
        } catch (error) {
            console.error('Error:', error);
            statusDiv.textContent = 'Error: ' + error.message;
            statusDiv.className = 'error';
            downloadButton.style.display = 'none';
        }
    });

    downloadButton.addEventListener('click', () => {
        if (currentScreenshot) {
            // Create a download link
            const link = document.createElement('a');
            link.href = currentScreenshot;
            link.download = 'discord-screenshot-' + new Date().toISOString().slice(0, 10) + '.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    });

    // Check current capture status
    chrome.runtime.sendMessage({ action: "getStatus" }, function (response) {
        isCapturing = response.isCapturing;
        updateUI();
    });

    // Handle button click
    // Handle button click
toggleButton.addEventListener('click', function () {
    if (!isCapturing) {
        // Start capture
        chrome.runtime.sendMessage({ action: "startCapture" }, function (response) {
            if (response.success) {
                isCapturing = true;
                updateUI();
            } else {
                statusDiv.textContent = 'Failed to start capture: ' + (response.error || 'Unknown error');
                statusDiv.className = 'status inactive';
            }
        });
    } else {
        // Stop capture
        chrome.runtime.sendMessage({ action: "stopCapture" }, function (response) {
            if (response.success) {
                isCapturing = false;
                updateUI();
            } else {
                statusDiv.textContent = 'Failed to stop capture: ' + (response.error || 'Unknown error');
                statusDiv.className = 'status inactive';
            }
        });
    }
});


    function updateUI() {
        toggleButton.textContent = isCapturing ? 'Stop Capture' : 'Start Capture';
        statusDiv.textContent = isCapturing ? 'Capture active' : 'Capture inactive';
        statusDiv.className = 'status ' + (isCapturing ? 'active' : 'inactive');
    }
});

// Function to be executed in the content script context
function takeScreenshot() {
    return new Promise((resolve) => {
        html2canvas(document.documentElement, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            foreignObjectRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            backgroundColor: '#ffffff',
            scale: 1
        }).then(canvas => {
            resolve(canvas.toDataURL('image/png'));
        }).catch(error => {
            console.error('Error taking screenshot:', error);
            resolve(null);
        });
    });
}

