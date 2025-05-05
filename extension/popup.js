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

    console.log('[popup.js] DOMContentLoaded - requesting latest video results');
    chrome.runtime.sendMessage({ type: 'GET_LATEST_VIDEO_RESULTS' }, (response) => {
        console.log('[popup.js] Received response from GET_LATEST_VIDEO_RESULTS:', response);
        if (response && response.data) {
            console.log('[popup.js] Calling updateVideoResults with:', response.data);
            updateVideoResults(response.data);
        }
    });

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

    // Function to read pattern history from file
    async function readPatternHistory() {
        try {
            const response = await fetch(chrome.runtime.getURL('pattern_history.txt'));
            const text = await response.text();
            const lines = text.split('\n').slice(1); // Skip header
            return lines.map(line => {
                const [timestamp, doomscrollRate, violenceRate, status] = line.split(',');
                return {
                    timestamp: parseInt(timestamp),
                    doomscrollRate: parseFloat(doomscrollRate),
                    violenceRate: parseFloat(violenceRate),
                    status
                };
            }).filter(pattern => !isNaN(pattern.timestamp));
        } catch (error) {
            console.error('Error reading pattern history:', error);
            return [];
        }
    }

    // Function to write pattern to file
    async function writePatternToFile(pattern) {
        try {
            const patterns = await readPatternHistory();
            const newLine = `${pattern.timestamp},${pattern.doomscrollRate},${pattern.violenceRate},${pattern.status}`;
            const newContent = 'timestamp,doomscrollRate,violenceRate,status\n' +
                [...patterns.slice(-9), pattern].map(p =>
                    `${p.timestamp},${p.doomscrollRate},${p.violenceRate},${p.status}`
                ).join('\n');

            // Create a blob and download it
            const blob = new Blob([newContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pattern_history.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error writing pattern to file:', error);
        }
    }

    // Function to compare patterns
    function comparePatterns(current, previous) {
        if (!previous) {
            // For the first pattern, only show improving if both rates are 0
            if (current.doomscrollRate === 0 && current.violenceRate === 0) {
                return 'improving';
            }
            return 'stable';
        }

        const improvement = {
            doomscroll: current.doomscrollRate < previous.doomscrollRate,
            violence: current.violenceRate < previous.violenceRate
        };

        // Count improvements and worsenings
        const improvements = Object.values(improvement).filter(Boolean).length;
        const worsenings = Object.values(improvement).filter(v => !v).length;

        // Only show improving if both metrics improved
        if (improvements === 2) return 'improving';
        // Show worsening if both metrics got worse
        if (worsenings === 2) return 'worsening';
        // Show stable if one improved and one worsened
        return 'stable';
    }

    // Track pattern metrics
    let patternMetrics = {
        doomscrollCount: 0,
        violenceCount: 0,
        totalViolenceScore: 0,
        startTime: Date.now()
    };

    // Function to calculate pattern metrics
    function calculatePatternMetrics() {
        const duration = Math.max(1, (Date.now() - patternMetrics.startTime) / 60000); // in minutes, minimum 1
        return {
            doomscrollRate: patternMetrics.doomscrollCount / duration,
            violenceRate: patternMetrics.violenceCount / duration,
            avgViolenceScore: patternMetrics.violenceCount > 0 ?
                patternMetrics.totalViolenceScore / patternMetrics.violenceCount : 0,
            timestamp: Date.now()
        };
    }

    // Function to update pattern status
    async function updatePatternStatus() {
        const patternDiv = document.getElementById('pattern-status');
        const companionSprite = document.getElementById('companion-sprite');
        if (!patternDiv || !companionSprite) return;

        try {
            // Get current pattern from storage
            chrome.storage.local.get(['currentPattern'], (result) => {
                const pattern = result.currentPattern;
                
                if (!pattern) {
                    // Initialize with a good pattern
                    const initialPattern = {
                        doomscrollRate: 0,
                        violenceRate: 0,
                        status: 'good',
                        timestamp: Date.now()
                    };
                    
                    // Store the initial pattern
                    chrome.storage.local.set({ currentPattern: initialPattern });
                    
                    patternDiv.innerHTML = `
                        <div class="result good">
                            <span class="result-icon">🌟</span>
                            <span>Starting to track your patterns...</span>
                        </div>
                    `;
                    companionSprite.src = 'sprites/happy.gif';
                    return;
                }

                console.log('Current pattern:', pattern);

                let message = '';
                let icon = '';
                let sprite = '';

                if (pattern.status === 'good') {
                    message = 'Your browsing patterns are good! 🌟';
                    icon = '🌟';
                    sprite = 'sprites/happy.gif';
                } else if (pattern.status === 'bad') {
                    message = '⚠️ Warning: Negative browsing patterns detected ⚠️';
                    icon = '⚠️';
                    sprite = 'sprites/sad.gif';
                } else {
                    message = 'Your browsing patterns are stable 📊';
                    icon = '📊';
                    sprite = 'sprites/sleepy.gif';
                }

                patternDiv.innerHTML = `
                    <div class="result ${pattern.status}">
                        <span class="result-icon">${icon}</span>
                        <span>${message}</span>
                        <div class="pattern-metrics">
                            <div>Doomscroll Rate: ${pattern.doomscrollRate.toFixed(2)}/min</div>
                            <div>Violence Rate: ${pattern.violenceRate.toFixed(2)}/min</div>
                        </div>
                    </div>
                `;

                companionSprite.src = sprite;
            });
        } catch (error) {
            console.error('Error updating pattern status:', error);
        }
    }

    // Check for pattern updates every 5 seconds
    setInterval(async () => {
        await updatePatternStatus();
    }, 5000);

    // Listen for pattern updates
    chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
        if (request.type === 'pattern_update') {
            console.log('Received pattern update:', request.data);
            await updatePatternStatus();
        }
    });

    // Initial update
    updatePatternStatus();

    // Listen for detection results from content scripts
    chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
        if (request.type === 'violenceResult') {
            updateViolenceResult(request.data);
            if (request.data.is_violent) {
                patternMetrics.violenceCount++;
                patternMetrics.totalViolenceScore += request.data.confidence || 1;
                console.log('Updated violence metrics:', patternMetrics);
                await updatePatternStatus();
            }
        } else if (request.type === 'nudityResult') {
            updateNudityResult(request.data);
        } else if (request.type === 'behavior_warning') {
            displayBehaviorWarning(request.data);
            patternMetrics.doomscrollCount++;
            console.log('Updated doomscroll metrics:', patternMetrics);
            await updatePatternStatus();
        }
    });

    // Reset pattern metrics every 5 minutes
    setInterval(async () => {
        const metrics = calculatePatternMetrics();
        const patterns = await readPatternHistory();
        const previousPattern = patterns[patterns.length - 1];
        const status = comparePatterns(metrics, previousPattern);

        // Create final pattern for this period
        const finalPattern = {
            ...metrics,
            status
        };

        // Write to file
        await writePatternToFile(finalPattern);

        // Reset metrics
        patternMetrics = {
            doomscrollCount: 0,
            violenceCount: 0,
            totalViolenceScore: 0,
            startTime: Date.now()
        };

        console.log('Pattern metrics reset:', patternMetrics);
        await updatePatternStatus();
    }, 300000);

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
        console.log('Popup received message:', message);
        if (message.type === 'textClassificationResults') {
            console.log('Received text classification results:', message.results);
            displayTextResults(message.results);
        } else if (message.type === 'behavior_warning') {
            console.log('Received behavior warning:', message.data);
            displayBehaviorWarning(message.data);
        } else if (message.type === 'usage_pattern_update') {
            console.log('Received usage pattern update:', message.data);
            displayUsagePattern(message.data);
        }
    });

    // Function to display behavior warnings
    function displayBehaviorWarning(warning) {
        console.log('Displaying behavior warning:', warning);
        const warningsDiv = document.getElementById('behavior-warnings');
        if (!warningsDiv) {
            console.error('Warning div not found!');
            return;
        }

        const warningElement = document.createElement('div');
        warningElement.className = 'result warning';
        warningElement.innerHTML = `
            <span class="result-icon">⚠️</span>
            <span>${warning.message}</span>
            <div class="warning-timestamp">${new Date(warning.timestamp).toLocaleTimeString()}</div>
        `;

        // Remove the safe state message if it exists
        const safeMessage = warningsDiv.querySelector('.result.safe');
        if (safeMessage) {
            console.log('Removing safe state message');
            safeMessage.remove();
        }

        warningsDiv.appendChild(warningElement);
        console.log('Warning element added to DOM');

        // Remove warning after 1 minute
        setTimeout(() => {
            warningElement.remove();
            console.log('Warning element removed from DOM');
            // If no warnings left, show safe state
            if (!warningsDiv.querySelector('.result')) {
                console.log('No warnings left, showing safe state');
                warningsDiv.innerHTML = `
                    <div class="result safe">
                        <span class="result-icon">✅</span>
                        <span>Normal browsing patterns detected</span>
                    </div>
                `;
            }
        }, 60000);
    }

    // Function to display usage pattern
    function displayUsagePattern(pattern) {
        console.log('Displaying usage pattern:', pattern);

        // Get all required elements
        const patternDiv = document.getElementById('usage-pattern');
        const statusDiv = patternDiv?.querySelector('.pattern-status');
        const patternText = patternDiv?.querySelector('.pattern-text');
        const doomscrollRate = document.getElementById('doomscroll-rate');
        const violenceRate = document.getElementById('violence-rate');
        const violenceScore = document.getElementById('violence-score');

        // Check if all elements exist
        if (!patternDiv || !statusDiv || !patternText || !doomscrollRate || !violenceRate || !violenceScore) {
            console.error('Required pattern elements not found!', {
                patternDiv: !!patternDiv,
                statusDiv: !!statusDiv,
                patternText: !!patternText,
                doomscrollRate: !!doomscrollRate,
                violenceRate: !!violenceRate,
                violenceScore: !!violenceScore
            });
            return;
        }

        // Update status
        statusDiv.className = `pattern-status ${pattern.status}`;

        // Set status text and emoji
        let statusText = '';
        let statusEmoji = '';
        switch (pattern.status) {
            case 'improving':
                statusText = 'Your browsing patterns are improving! 🌟';
                statusEmoji = '🌟';
                break;
            case 'worsening':
                statusText = 'Your browsing patterns need attention ⚠️';
                statusEmoji = '⚠️';
                break;
            default:
                statusText = 'Your browsing patterns are stable 📊';
                statusEmoji = '📊';
        }

        patternText.textContent = statusText;

        // Update metrics with actual values
        doomscrollRate.textContent = `${pattern.doomscrollRate.toFixed(2)}/min`;
        violenceRate.textContent = `${pattern.violenceRate.toFixed(2)}/min`;
        violenceScore.textContent = `${(pattern.avgViolenceScore * 100).toFixed(1)}%`;

        console.log('Pattern display updated:', pattern);
    }

    // Function to check for pattern updates
    function checkPatternUpdate() {
        chrome.storage.local.get(['currentPattern'], (result) => {
            if (result.currentPattern) {
                console.log('Found pattern update:', result.currentPattern);
                displayUsagePattern(result.currentPattern);
            } else {
                console.log('No pattern found in storage');
            }
        });
    }

    // Listen for pattern updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Popup received message:', message);

        if (message.type === 'pattern_update') {
            console.log('Received pattern update:', message.data);
            displayUsagePattern(message.data);
        } else if (message.type === 'behavior_warning') {
            console.log('Received behavior warning:', message.data);
            // Request pattern update when behavior warning is received
            checkPatternUpdate();
        }
    });

    // Load stored warnings when popup opens
    document.addEventListener('DOMContentLoaded', async function () {
        console.log('Popup loaded, loading stored data...');

        // Load stored warnings
        chrome.storage.local.get(['warnings'], (result) => {
            const warnings = result.warnings || [];
            console.log('Loaded stored warnings:', warnings);

            // Display all stored warnings
            warnings.forEach(warning => {
                displayBehaviorWarning(warning);
            });

            // Clear stored warnings after displaying
            chrome.storage.local.set({ warnings: [] });
        });

        // Load and display current pattern
        await updatePatternStatus();
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

    // Listen for brainrot detection updates from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'brainrot_update') {
            const { label, status, timestamp } = message.data;
            // Update the results section
            const resultsDiv = document.getElementById('brainrot-results');
            if (resultsDiv) {
                resultsDiv.innerHTML = '';
                let resultClass = 'safe';
                let icon = '✅';
                let text = 'No brainrot content detected';
                if (label === 'Brainrot') {
                    resultClass = 'danger';
                    icon = '⚠️';
                    text = 'Brainrot detected!';
                } else if (status === 'error') {
                    resultClass = 'warning';
                    icon = '❌';
                    text = 'Analysis failed';
                }
                resultsDiv.innerHTML = `
                    <div class="result ${resultClass}">
                        <span class="result-icon">${icon}</span>
                        <span>${text}</span>
                    </div>
                `;
            }
            // Update stats
            const lastCheck = document.getElementById('last-check-time');
            if (lastCheck) lastCheck.textContent = timestamp || '-';
            const statusSpan = document.getElementById('brainrot-status');
            if (statusSpan) statusSpan.textContent = status || '-';
            const serverStatus = document.getElementById('server-status');
            if (serverStatus) {
                serverStatus.textContent = (status === 'connected') ? 'Connected' :
                    (status === 'error') ? 'Error' :
                        (status === 'disconnected') ? 'Disconnected' : status;
                serverStatus.className = 'stat-value ' + (status || '');
            }
        }
    });

    function updateVideoResults(data) {
        console.log('[popup.js] updateVideoResults called with:', data);
        // Update Brainrot Results
        const brainrotResults = document.getElementById('brainrot-results');
        const lastCheckTime = document.getElementById('last-check-time');
        const brainrotConfidence = document.getElementById('brainrot-confidence');

        if (data.brainrot) {
            brainrotResults.innerHTML = `
                <div class="result ${data.brainrot.is_brainrot ? 'danger' : 'safe'}">
                    <span class="result-icon">${data.brainrot.is_brainrot ? '⚠️' : '✅'}</span>
                    <span>${data.brainrot.is_brainrot ? 'Brainrot content detected' : 'No brainrot content detected'}</span>
                </div>
            `;
            lastCheckTime.textContent = new Date().toLocaleTimeString();
            if (brainrotConfidence) brainrotConfidence.textContent = `${(data.brainrot.confidence * 100).toFixed(1)}%`;
        }

        // Update Violence Results
        const violenceResults = document.getElementById('violence-results');
        const violenceLastCheck = document.getElementById('violence-last-check');
        const violenceConfidence = document.getElementById('violence-confidence');

        if (data.violence) {
            violenceResults.innerHTML = `
                <div class="result ${data.violence.is_violence ? 'danger' : 'safe'}">
                    <span class="result-icon">${data.violence.is_violence ? '⚠️' : '✅'}</span>
                    <span>${data.violence.is_violence ? 'Violence detected' : 'No violence detected'}</span>
                </div>
            `;
            violenceLastCheck.textContent = new Date().toLocaleTimeString();
            violenceConfidence.textContent = `${(data.violence.confidence * 100).toFixed(1)}%`;
        }

        // Update Deepfake Results
        const deepfakeResults = document.getElementById('deepfake-results');
        const deepfakeLastCheck = document.getElementById('deepfake-last-check');
        const deepfakeConfidence = document.getElementById('deepfake-confidence');

        if (data.deepfake) {
            deepfakeResults.innerHTML = `
                <div class="result ${data.deepfake.is_deepfake ? 'danger' : 'safe'}">
                    <span class="result-icon">${data.deepfake.is_deepfake ? '⚠️' : '✅'}</span>
                    <span>${data.deepfake.is_deepfake ? 'Deepfake detected' : 'No deepfake detected'}</span>
                </div>
            `;
            deepfakeLastCheck.textContent = new Date().toLocaleTimeString();
            deepfakeConfidence.textContent = `${(data.deepfake.confidence * 100).toFixed(1)}%`;
        }
    }

    // Update the message listener to handle all video analysis types
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'VIDEO_ANALYSIS_RESULTS') {
            console.log('[popup.js] Received VIDEO_ANALYSIS_RESULTS:', request.data);
            updateVideoResults(request.data);
        }
    });

    // Handle companion click
    const companionSprite = document.getElementById('companion-sprite');
    if (companionSprite) {
        companionSprite.addEventListener('click', function() {
            // Store the current sprite
            const currentSprite = this.src;
            
            // Change to touched sprite
            this.src = 'sprites/touched.gif';
            
            // Change back after 1 second
            setTimeout(() => {
                this.src = currentSprite;
            }, 1000);
        });
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

