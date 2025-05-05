document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard data
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

    // Load saved dashboard data
    chrome.storage.local.get(['dashboardData'], (result) => {
        if (result.dashboardData) {
            dashboardData = result.dashboardData;
            updateDashboard();
        }
    });

    // Update dashboard every hour
    setInterval(updateDashboard, 3600000);

    // Handle time range selection
    document.getElementById('time-range').addEventListener('change', function(e) {
        updateHistoricalData(parseInt(e.target.value));
    });

    // Handle export button
    document.getElementById('export-data').addEventListener('click', exportData);

    // Companion Settings
    let companions = [];
    let currentCompanion = null;

    async function loadCompanions() {
        try {
            // Create companion objects for each folder
            companions = [
                {
                    id: 'owl',
                    name: 'Owl',
                    sprites: {
                        happy: 'sprites/owl/happy.gif',
                        sad: 'sprites/owl/sad.gif',
                        sleepy: 'sprites/owl/sleepy.gif',
                        touched: 'sprites/owl/touched.gif'
                    }
                },
                {
                    id: 'cat',
                    name: 'Cat',
                    sprites: {
                        happy: 'sprites/cat/happy.gif',
                        sad: 'sprites/cat/sad.gif',
                        sleepy: 'sprites/cat/sleepy.gif',
                        touched: 'sprites/cat/touched.gif'
                    }
                }
            ];

            // Load current companion from storage
            chrome.storage.local.get(['currentCompanion'], (result) => {
                currentCompanion = result.currentCompanion || companions[0];
                updateCompanionDisplay();
            });
        } catch (error) {
            console.error('Error loading companions:', error);
            // Fallback to default companion
            companions = [{
                id: 'owl',
                name: 'Owl',
                sprites: {
                    happy: 'sprites/owl/happy.gif',
                    sad: 'sprites/owl/sad.gif',
                    sleepy: 'sprites/owl/sleepy.gif',
                    touched: 'sprites/owl/touched.gif'
                }
            }];
            currentCompanion = companions[0];
            updateCompanionDisplay();
        }
    }

    function initializeCompanionSettings() {
        const companionList = document.querySelector('.companion-list');
        const previewImage = document.querySelector('.companion-preview img');
        const currentCompanionInfo = document.querySelector('.current-companion');

        // Load companions and initialize display
        loadCompanions().then(() => {
            // Clear existing companion list
            companionList.innerHTML = '';
            
            // Create companion grid
            const companionGrid = document.createElement('div');
            companionGrid.className = 'companion-grid';
            
            // Populate companion grid
            companions.forEach(companion => {
                const option = document.createElement('div');
                option.className = 'companion-option';
                option.innerHTML = `
                    <div class="companion-preview">
                        <img src="${companion.sprites.happy}" alt="${companion.name}">
                    </div>
                    <div class="companion-info">
                        <div class="companion-name">${companion.name}</div>
                        <div class="companion-status ${currentCompanion?.id === companion.id ? 'selected' : ''}">
                            ${currentCompanion?.id === companion.id ? '✓ Selected' : 'Click to select'}
                        </div>
                    </div>
                `;
                
                option.addEventListener('click', () => {
                    currentCompanion = companion;
                    updateCompanionDisplay();
                    saveCompanionSettings();
                    
                    // Update selection status
                    document.querySelectorAll('.companion-status').forEach(status => {
                        status.textContent = 'Click to select';
                        status.classList.remove('selected');
                    });
                    option.querySelector('.companion-status').textContent = '✓ Selected';
                    option.querySelector('.companion-status').classList.add('selected');
                });
                
                companionGrid.appendChild(option);
            });
            
            companionList.appendChild(companionGrid);

            // Preview buttons
            document.querySelectorAll('.preview-button').forEach(button => {
                button.addEventListener('click', () => {
                    const state = button.id.replace('preview-', '');
                    previewImage.src = currentCompanion.sprites[state];
                });
            });
        });
    }

    function updateCompanionDisplay() {
        // Update preview image
        const previewImage = document.querySelector('.companion-preview img');
        previewImage.src = currentCompanion.sprites.happy;

        // Update companion list selection
        document.querySelectorAll('.companion-option').forEach(option => {
            const companionName = option.querySelector('.companion-name').textContent;
            option.classList.toggle('selected', companionName === currentCompanion.name);
        });

        // Update current companion info
        const currentCompanionInfo = document.querySelector('.current-companion');
        currentCompanionInfo.innerHTML = `
            <div class="companion-name">${currentCompanion.name}</div>
            <div class="companion-sprites">
                <div class="sprite-item">
                    <span>Happy:</span>
                    <span class="sprite-path">${currentCompanion.sprites.happy}</span>
                </div>
                <div class="sprite-item">
                    <span>Sad:</span>
                    <span class="sprite-path">${currentCompanion.sprites.sad}</span>
                </div>
                <div class="sprite-item">
                    <span>Sleepy:</span>
                    <span class="sprite-path">${currentCompanion.sprites.sleepy}</span>
                </div>
                <div class="sprite-item">
                    <span>Touched:</span>
                    <span class="sprite-path">${currentCompanion.sprites.touched}</span>
                </div>
            </div>
        `;
    }

    function saveCompanionSettings() {
        chrome.storage.local.set({ currentCompanion }, () => {
            // Notify popup about the change
            chrome.runtime.sendMessage({ type: 'companion_changed', companion: currentCompanion });
        });
    }

    // Initialize companion settings when the dashboard loads
    initializeCompanionSettings();

    // Function to update the entire dashboard
    function updateDashboard() {
        const now = new Date();
        const lastUpdate = document.getElementById('last-update-time');
        const nextUpdate = document.getElementById('next-update-time');

        // Update timestamps
        lastUpdate.textContent = now.toLocaleTimeString();
        nextUpdate.textContent = new Date(now.getTime() + 3600000).toLocaleTimeString();

        // Get current pattern
        chrome.storage.local.get(['currentPattern'], (result) => {
            const pattern = result.currentPattern;
            if (pattern) {
                updateCurrentStatus(pattern);
                updateDailySummary(pattern);
                updateHistoricalData(24); // Default to 24 hours
            }
        });
    }

    // Function to update current status
    function updateCurrentStatus(pattern) {
        const currentStatus = document.getElementById('current-status');
        currentStatus.className = `status-card status-${pattern.status}`;
        currentStatus.innerHTML = `
            <div class="timeline-status">
                <span class="result-icon">${pattern.status === 'good' ? '🌟' : 
                                        pattern.status === 'bad' ? '⚠️' : '📊'}</span>
                <span>${pattern.status === 'good' ? 'Good browsing patterns' : 
                        pattern.status === 'bad' ? 'Negative patterns detected' : 
                        'Stable browsing patterns'}</span>
            </div>
            <div class="pattern-metrics">
                <div>Doomscroll Rate: ${pattern.doomscrollRate.toFixed(2)}/min</div>
                <div>Violence Rate: ${pattern.violenceRate.toFixed(2)}/min</div>
            </div>
        `;
    }

    // Function to update daily summary
    function updateDailySummary(pattern) {
        // Update violence stats
        document.getElementById('total-violence').textContent = 
            dashboardData.dailySummary.totalViolence.toFixed(2);
        document.getElementById('avg-violence-rate').textContent = 
            (dashboardData.dailySummary.totalViolence / dashboardData.dailySummary.totalTime).toFixed(2) + '/min';

        // Update doomscroll stats
        document.getElementById('total-doomscroll').textContent = 
            dashboardData.dailySummary.totalDoomscroll.toFixed(2) + ' min';
        document.getElementById('avg-doomscroll-rate').textContent = 
            (dashboardData.dailySummary.totalDoomscroll / dashboardData.dailySummary.totalTime).toFixed(2) + '/min';

        // Update monitoring stats
        document.getElementById('total-monitoring').textContent = 
            dashboardData.dailySummary.totalTime + ' hours';
        document.getElementById('status-changes').textContent = 
            dashboardData.dailySummary.statusChanges.length;
    }

    // Function to update historical data
    function updateHistoricalData(hours) {
        const historicalData = document.getElementById('historical-data');
        const timeline = document.getElementById('timeline');
        
        // Filter data for selected time range
        const cutoffTime = new Date(Date.now() - hours * 3600000);
        const filteredData = dashboardData.historicalData.filter(item => 
            new Date(item.time) > cutoffTime
        );

        // Update timeline
        timeline.innerHTML = filteredData.map(item => `
            <div class="timeline-item">
                <div class="timeline-time">${new Date(item.time).toLocaleString()}</div>
                <div class="timeline-status">
                    <span class="result-icon">${item.pattern.status === 'good' ? '🌟' : 
                                            item.pattern.status === 'bad' ? '⚠️' : '📊'}</span>
                    <span>${item.pattern.status === 'good' ? 'Good' : 
                            item.pattern.status === 'bad' ? 'Bad' : 'Stable'}</span>
                    <span>Doomscroll: ${item.pattern.doomscrollRate.toFixed(2)}/min</span>
                    <span>Violence: ${item.pattern.violenceRate.toFixed(2)}/min</span>
                </div>
            </div>
        `).join('');
    }

    // Function to export data
    function exportData() {
        const data = {
            currentStatus: dashboardData.currentStatus,
            dailySummary: dashboardData.dailySummary,
            historicalData: dashboardData.historicalData
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aigis-dashboard-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}); 