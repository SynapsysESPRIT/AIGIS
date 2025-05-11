document.addEventListener('DOMContentLoaded', function () {
    // Add message listener for text classification results
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Popup received message:', message);
        if (message.type === 'textClassificationResults') {
            console.log('Received textClassificationResults:', message.results);
            displayTextResults(message.results);
            sendResponse({ status: "Text results processed" });
            return true; // Indicates asynchronous response handling
        } else if (message.type === 'behavior_warning') {
            console.log('Received behavior warning:', message.data);
            displayBehaviorWarning(message.data);
        } else if (message.type === 'usage_pattern_update') {
            console.log('Received usage pattern update:', message.data);
            displayUsagePattern(message.data);
        }
    });

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
            // Get current pattern and companion from storage
            chrome.storage.local.get(['currentPattern', 'currentCompanion'], (result) => {
                const pattern = result.currentPattern;
                const companion = result.currentCompanion || {
                    id: 'owl',
                    name: 'Owl',
                    sprites: {
                        happy: 'sprites/owl/happy.gif',
                        sad: 'sprites/owl/sad.gif',
                        sleepy: 'sprites/owl/sleepy.gif',
                        touched: 'sprites/owl/touched.gif'
                    }
                };

                if (!pattern) {
                    // Initialize with a normal pattern
                    const initialPattern = {
                        scrollFrequency: 0,
                        averageScrollSpeed: 0,
                        engagementDuration: 0,
                        behavior: 'normal',
                        sprite: 'happy',
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
                    companionSprite.src = companion.sprites.happy;
                    return;
                }

                console.log('Current pattern:', pattern);

                // Update metrics display
                document.getElementById('scroll-frequency').textContent = 
                    `${pattern.scrollFrequency.toFixed(1)}/min`;
                document.getElementById('scroll-speed').textContent = 
                    `${pattern.averageScrollSpeed.toFixed(0)} px/s`;
                document.getElementById('engagement-duration').textContent = 
                    `${(pattern.engagementDuration / 1000).toFixed(0)}s`;
                document.getElementById('behavior-pattern').textContent = 
                    pattern.behavior.charAt(0).toUpperCase() + pattern.behavior.slice(1);

                let message = '';
                let icon = '';
                let resultClass = '';

                switch (pattern.behavior) {
                    case 'focused':
                        message = 'You\'re focused and engaged! 🌟';
                        icon = '🌟';
                        resultClass = 'good';
                        break;
                    case 'distracted':
                        message = 'You seem a bit distracted. Try focusing on one thing at a time.';
                        icon = '⚠️';
                        resultClass = 'warning';
                        break;
                    case 'restless':
                        message = 'You\'re scrolling quite rapidly. Maybe take a short break?';
                        icon = '⚡';
                        resultClass = 'warning';
                        break;
                    case 'binge':
                        message = 'You\'ve been consuming content for a while. Consider taking a break.';
                        icon = '😴';
                        resultClass = 'warning';
                        break;
                    default:
                        message = 'Your browsing patterns are normal.';
                        icon = '📊';
                        resultClass = 'good';
                }

                patternDiv.innerHTML = `
                    <div class="result ${resultClass}">
                        <span class="result-icon">${icon}</span>
                        <span>${message}</span>
                    </div>
                `;

                // Update companion sprite
                companionSprite.src = companion.sprites[pattern.sprite];
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

        if (!results) {
            textResults.innerHTML = '<div class="result safe"><span class="result-icon">ℹ️</span><span>No classification data available.</span></div>';
            textSummary.innerHTML = ''; // Clear summary too
            return;
        }

        // Display each result
        results.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'text-result';
            let classificationClass = 'safe';
            let icon = '✅';
            if (result.classification === 'Offensive') {
                classificationClass = 'danger';
                icon = '❗';
            } else if (result.classification === 'Hate') {
                classificationClass = 'warning';
                icon = '⚠️';
            }

            resultDiv.innerHTML = `
                <div class="text-message ${classificationClass}">${result.message}</div>
                <div class="text-prediction">
                    <span class="result-icon">${icon}</span>
                    <span>${result.classification} (Confidence: ${result.confidence || 'N/A'})</span>
                </div>
                ${result.details && result.details.explanation ? `<div class="text-explanation">${result.details.explanation}</div>` : ''}
            `;
            textResults.appendChild(resultDiv);
        });

        // Display summary if available
        if (results.summary) {
            displaySummary(results.summary);
        } else {
            textSummary.innerHTML = '';
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
        if (!textToggle.checked) {
            textResults.innerHTML = '<div class="result safe"><span class="result-icon">ℹ️</span><span>Text classification is disabled.</span></div>';
            textSummary.innerHTML = '';
            const geminiSummarySection = document.getElementById('gemini-summary-section');
            const geminiResultsDiv = document.getElementById('gemini-results');
            if (geminiResultsDiv) geminiResultsDiv.innerHTML = '';
            if (geminiSummarySection) geminiSummarySection.style.display = 'none';
            return;
        }

        textResults.innerHTML = '<div class="result safe"><span class="result-icon">⏳</span><span>Scanning page for text content...</span></div>';
        textSummary.innerHTML = '';

        const geminiResultsDiv = document.getElementById('gemini-results');
        const geminiSummarySection = document.getElementById('gemini-summary-section');
        if (geminiResultsDiv && geminiSummarySection) {
            geminiResultsDiv.innerHTML = '<div class="result safe"><span class="result-icon">⏳</span><span>Awaiting overall chat analysis...</span></div>';
            geminiSummarySection.style.display = 'block';
        }


        try {
            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Execute the text processing script
            const results = await chrome.tabs.sendMessage(tab.id, { action: 'processText' });

            if (results) {
                if (results.roberta_classification) {
                    displayTextResults(results.roberta_classification);
                } else {
                    displayTextResults(null);
                }

                if (results.gemini_classification) {
                    displayGeminiAnalysis(results.gemini_classification);
                } else {
                    displayGeminiAnalysis(null);
                }
            }
        } catch (error) {
            console.error('Error scanning page:', error);
        }
    }

    // Event listeners
    scanButton.addEventListener('click', scanPage);

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

    function displayGeminiAnalysis(geminiData) {
        const geminiResultsDiv = document.getElementById('gemini-results');
        const geminiSummarySection = document.getElementById('gemini-summary-section');

        if (!geminiResultsDiv || !geminiSummarySection) {
            console.error('Gemini results display elements not found.');
            return;
        }

        geminiResultsDiv.innerHTML = ''; // Clear previous results

        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return '';
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        if (!geminiData || Object.keys(geminiData).length === 0) {
            geminiResultsDiv.innerHTML = '<div class="result safe"><span class="result-icon">ℹ️</span><span>No overall chat analysis data available from Gemini.</span></div>';
            geminiSummarySection.style.display = 'block';
            return;
        }

        let htmlContent = '';
        let overallRiskLevel = 'safe'; // Default to safe

        if (geminiData.overall_conclusion) {
            const conclusionText = escapeHtml(geminiData.overall_conclusion.toLowerCase());
            if (conclusionText.includes('blackmail') || conclusionText.includes('potential suicide') || conclusionText.includes('self-harm')) {
                overallRiskLevel = 'danger';
            } else if (conclusionText.includes('manipulative') || conclusionText.includes('meeting attempt') || conclusionText.includes('caution') || conclusionText.includes('risky') || conclusionText.includes('grooming')) {
                overallRiskLevel = 'warning';
            }

            let icon = 'ℹ️';
            if (overallRiskLevel === 'danger') icon = '❗';
            else if (overallRiskLevel === 'warning') icon = '⚠️';

            htmlContent += `<div class="result ${overallRiskLevel}" style="margin-bottom: 10px;">
                                <span class="result-icon">${icon}</span>
                                <strong>Overall Conclusion:</strong> ${escapeHtml(geminiData.overall_conclusion)}
                            </div>`;
        }

        if (geminiData.themes_detected && geminiData.themes_detected.length > 0) {
            htmlContent += '<div style="margin-bottom: 10px;"><strong>Detected Themes:</strong><ul style="margin-top: 5px; padding-left: 20px;">';
            geminiData.themes_detected.forEach(theme => {
                htmlContent += `<li>${escapeHtml(theme)}</li>`;
            });
            htmlContent += '</ul></div>';
        } else if (geminiData.overall_conclusion) { // Only show "None" if there was a conclusion but no specific themes
            htmlContent += '<div><strong>Detected Themes:</strong> None explicitly listed.</div>';
        }


        if (geminiData.original_text) {
            htmlContent += `<div style="margin-top: 10px;">
                                <strong>Analyzed Text Snapshot:</strong>
                                <pre style="white-space: pre-wrap; word-wrap: break-word; background-color: #f8f9fa; color: #212529; padding: 10px; border: 1px solid #dee2e6; border-radius: 4px; max-height: 150px; overflow-y: auto; font-size: 0.85em; line-height: 1.4;">${escapeHtml(geminiData.original_text)}</pre>
                            </div>`;
        }

        geminiResultsDiv.innerHTML = htmlContent || '<div class="result safe"><span class="result-icon">ℹ️</span><span>Gemini analysis processed, but no specific details to display.</span></div>';
        geminiSummarySection.style.display = 'block';
    }

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

    // Handle companion changes
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'companion_changed') {
            updateCompanionSprite(message.companion);
        }
    });

    function updateCompanionSprite(companion) {
        const companionSprite = document.getElementById('companion-sprite');
        if (companionSprite) {
            // Get current pattern status
            chrome.storage.local.get(['currentPattern'], (result) => {
                const pattern = result.currentPattern;
                let spriteState = 'happy';

                if (pattern) {
                    if (pattern.doomscrollingRate > 0.5 || pattern.violenceRate > 0.5) {
                        spriteState = 'sad';
                    } else if (pattern.doomscrollingRate < 0.2 && pattern.violenceRate < 0.2) {
                        spriteState = 'sleepy';
                    }
                }

                companionSprite.src = companion.sprites[spriteState];
            });
        }
    }

    // Initialize companion sprite
    chrome.storage.local.get(['currentCompanion'], (result) => {
        const companion = result.currentCompanion || {
            sprites: {
                happy: 'sprites/owl/happy.gif',
                sad: 'sprites/owl/sad.gif',
                sleepy: 'sprites/owl/sleepy.gif',
                touched: 'sprites/owl/touched.gif'
            }
        };
        updateCompanionSprite(companion);
    });

    // Dashboard functionality
    let dashboardData = {
        lastUpdate: null,
        currentStatus: null,
        dailySummary: {
            totalViolence: 0,
            totalDoomscroll: 0,
            totalTime: 0,
            statusChanges: []
        },
        historicalData: []
    };

    // Initialize dashboard
    function initDashboard() {
        const dashboardToggle = document.getElementById('dashboard-toggle');
        const dashboardSection = document.getElementById('dashboard-section');

        dashboardToggle.addEventListener('click', () => {
            dashboardSection.style.display = dashboardSection.style.display === 'none' ? 'block' : 'none';
            if (dashboardSection.style.display === 'block') {
                updateDashboard();
            }
        });

        // Load saved dashboard data
        chrome.storage.local.get(['dashboardData'], (result) => {
            if (result.dashboardData) {
                dashboardData = result.dashboardData;
            }
        });

        // Update dashboard every hour
        setInterval(updateDashboard, 3600000);
    }

    // Update dashboard data
    function updateDashboard() {
        const now = new Date();
        const lastUpdate = document.getElementById('last-update-time');
        const nextUpdate = document.getElementById('next-update-time');
        const currentStatus = document.getElementById('current-status');
        const dailySummary = document.getElementById('daily-summary');
        const historicalData = document.getElementById('historical-data');

        // Update timestamps
        lastUpdate.textContent = now.toLocaleTimeString();
        nextUpdate.textContent = new Date(now.getTime() + 3600000).toLocaleTimeString();

        // Get current pattern
        chrome.storage.local.get(['currentPattern'], (result) => {
            const pattern = result.currentPattern;
            if (pattern) {
                // Update current status
                currentStatus.innerHTML = `
                    <div class="result ${pattern.status}">
                        <span class="result-icon">${pattern.status === 'good' ? '🌟' : pattern.status === 'bad' ? '⚠️' : '📊'}</span>
                        <span>${pattern.status === 'good' ? 'Good browsing patterns' :
                        pattern.status === 'bad' ? 'Negative patterns detected' :
                            'Stable browsing patterns'}</span>
                        <div class="pattern-metrics">
                            <div>Doomscroll Rate: ${pattern.doomscrollRate.toFixed(2)}/min</div>
                            <div>Violence Rate: ${pattern.violenceRate.toFixed(2)}/min</div>
                        </div>
                    </div>
                `;

                // Update daily summary
                dashboardData.dailySummary.totalViolence += pattern.violenceRate;
                dashboardData.dailySummary.totalDoomscroll += pattern.doomscrollRate;
                dashboardData.dailySummary.totalTime += 1;
                dashboardData.dailySummary.statusChanges.push({
                    time: now,
                    status: pattern.status
                });

                dailySummary.innerHTML = `
                    <div class="stat-item">
                        <span class="stat-label">Total Violence Incidents:</span>
                        <span class="stat-value">${dashboardData.dailySummary.totalViolence.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Doomscroll Time:</span>
                        <span class="stat-value">${dashboardData.dailySummary.totalDoomscroll.toFixed(2)} minutes</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Monitoring Time:</span>
                        <span class="stat-value">${dashboardData.dailySummary.totalTime} hours</span>
                    </div>
                `;

                // Update historical data
                dashboardData.historicalData.push({
                    time: now,
                    pattern: pattern
                });

                // Keep only last 24 hours of data
                const oneDayAgo = new Date(now.getTime() - 24 * 3600000);
                dashboardData.historicalData = dashboardData.historicalData.filter(item =>
                    new Date(item.time) > oneDayAgo
                );

                // Display historical data
                historicalData.innerHTML = dashboardData.historicalData.map(item => `
                    <div class="history-item">
                        <div class="history-time">${new Date(item.time).toLocaleTimeString()}</div>
                        <div class="history-status">
                            <span class="result-icon">${item.pattern.status === 'good' ? '🌟' :
                        item.pattern.status === 'bad' ? '⚠️' : '📊'}</span>
                            <span>${item.pattern.status === 'good' ? 'Good' :
                        item.pattern.status === 'bad' ? 'Bad' : 'Stable'}</span>
                        </div>
                    </div>
                `).join('');

                // Save updated dashboard data
                chrome.storage.local.set({ dashboardData });
            }
        });
    }

    // Initialize dashboard button
    function initDashboardButton() {
        const dashboardToggle = document.getElementById('dashboard-toggle');
        if (dashboardToggle) {
            dashboardToggle.addEventListener('click', () => {
                console.log('Opening dashboard...');
                chrome.tabs.create({
                    url: chrome.runtime.getURL('dashboard.html'),
                    active: true
                });
            });
        }
    }

    // Initialize when popup loads
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Popup loaded, initializing...');
        initDashboardButton();
        initDashboard();
        // ... rest of your existing initialization code ...
    });
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

