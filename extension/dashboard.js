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
    let userCoins = 1000; // Default coins
    let unlockedBackgrounds = [];
    let unlockedMaterials = [];
    let currentBackground = null;
    let placedMaterials = [];

    async function loadCompanions() {
        try {
            // Create companion objects for each folder
            companions = [
                {
                    id: 'owl',
                    name: 'Owl',
                    price: 0, // Free companion
                    unlocked: true,
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
                    price: 100,
                    unlocked: false,
                    sprites: {
                        happy: 'sprites/cat/happy.gif',
                        sad: 'sprites/cat/sad.gif',
                        sleepy: 'sprites/cat/sleepy.gif',
                        touched: 'sprites/cat/touched.gif'
                    }
                }
            ];

            // Load user coins and unlocked companions from storage
            chrome.storage.local.get(['userCoins', 'unlockedCompanions'], (result) => {
                userCoins = result.userCoins || 1000;
                const unlockedCompanions = result.unlockedCompanions || ['owl'];
                
                // Update companion unlock status
                companions.forEach(companion => {
                    companion.unlocked = unlockedCompanions.includes(companion.id);
                });

                // Load current companion from storage
                chrome.storage.local.get(['currentCompanion'], (result) => {
                    currentCompanion = result.currentCompanion || companions[0];
                    updateCompanionDisplay();
                    updateCoinDisplay();
                });
            });
        } catch (error) {
            console.error('Error loading companions:', error);
            // Fallback to default companion
            companions = [{
                id: 'owl',
                name: 'Owl',
                price: 0,
                unlocked: true,
                sprites: {
                    happy: 'sprites/owl/happy.gif',
                    sad: 'sprites/owl/sad.gif',
                    sleepy: 'sprites/owl/sleepy.gif',
                    touched: 'sprites/owl/touched.gif'
                }
            }];
            currentCompanion = companions[0];
            updateCompanionDisplay();
            updateCoinDisplay();
        }
    }

    function updateCoinDisplay() {
        const coinDisplay = document.querySelector('.coin-display');
        if (coinDisplay) {
            coinDisplay.innerHTML = `
                <div class="coin-amount">
                    <span class="coin-icon">🪙</span>
                    <span class="coin-value">${userCoins}</span>
                </div>
            `;
        }
    }

    function initializeCompanionSettings() {
        const companionList = document.querySelector('.companion-list');
        const previewImage = document.querySelector('.companion-layer img');
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
                option.className = `companion-option ${companion.unlocked ? 'unlocked' : 'locked'}`;
                option.innerHTML = `
                    <div class="companion-preview">
                        <img src="${companion.sprites.happy}" alt="${companion.name}">
                        ${!companion.unlocked ? '<div class="lock-overlay">🔒</div>' : ''}
                    </div>
                    <div class="companion-info">
                        <div class="companion-name">${companion.name}</div>
                        <div class="companion-status ${currentCompanion?.id === companion.id ? 'selected' : ''}">
                            ${currentCompanion?.id === companion.id ? '✓ Selected' : 
                              companion.unlocked ? 'Click to select' : 
                              `🔒 ${companion.price} coins to unlock`}
                        </div>
                    </div>
                `;
                
                option.addEventListener('click', () => {
                    if (!companion.unlocked) {
                        if (userCoins >= companion.price) {
                            // Unlock companion
                            userCoins -= companion.price;
                            companion.unlocked = true;
                            
                            // Save to storage
                            chrome.storage.local.get(['unlockedCompanions'], (result) => {
                                const unlockedCompanions = result.unlockedCompanions || ['owl'];
                                unlockedCompanions.push(companion.id);
                                chrome.storage.local.set({ 
                                    unlockedCompanions,
                                    userCoins
                                });
                            });
                            
                            // Update display
                            updateCoinDisplay();
                            initializeCompanionSettings();
                        } else {
                            alert('Not enough coins to unlock this companion!');
                        }
                    } else {
                        // Set as current companion
                        currentCompanion = companion;
                        saveCompanionSettings();
                        
                        // Update preview image
                        previewImage.src = companion.sprites.happy;
                        
                        // Update selection status
                        document.querySelectorAll('.companion-status').forEach(status => {
                            status.textContent = 'Click to select';
                            status.classList.remove('selected');
                        });
                        option.querySelector('.companion-status').textContent = '✓ Selected';
                        option.querySelector('.companion-status').classList.add('selected');
                        
                        // Update companion option styling
                        document.querySelectorAll('.companion-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        option.classList.add('selected');
                    }
                });
                
                companionGrid.appendChild(option);
            });
            
            companionList.appendChild(companionGrid);

            // Preview buttons
            document.querySelectorAll('.preview-button').forEach(button => {
                button.addEventListener('click', () => {
                    const state = button.id.replace('preview-', '');
                    // Find the currently selected companion
                    const selectedCompanion = companions.find(c => c.id === currentCompanion.id);
                    if (selectedCompanion) {
                        previewImage.src = selectedCompanion.sprites[state];
                    }
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

    // Load playground data
    function loadPlaygroundData() {
        chrome.storage.local.get(['userCoins', 'unlockedBackgrounds', 'unlockedMaterials', 'currentBackground', 'placedMaterials'], (result) => {
            userCoins = result.userCoins || 1000;
            unlockedBackgrounds = result.unlockedBackgrounds || [];
            unlockedMaterials = result.unlockedMaterials || [];
            currentBackground = result.currentBackground || null;
            placedMaterials = result.placedMaterials || [];
            
            updateCoinDisplay();
            loadBackgrounds();
            loadMaterials();
            restorePlayground();
        });
    }

    // Load available backgrounds
    function loadBackgrounds() {
        const backgrounds = [
            { id: 'default', name: 'Default', price: 0, image: 'backgrounds/default.jpg' },
            { id: 'beach', name: 'Beach', price: 50, image: 'backgrounds/beach.jpg' },
            { id: 'forest', name: 'Forest', price: 75, image: 'backgrounds/forest.jpg' },
            // Add more backgrounds as needed
        ];

        const backgroundList = document.querySelector('.background-list');
        backgroundList.innerHTML = '';

        backgrounds.forEach(bg => {
            const item = document.createElement('div');
            item.className = `background-item ${unlockedBackgrounds.includes(bg.id) ? '' : 'locked'}`;
            item.innerHTML = `
                <img src="${bg.image}" alt="${bg.name}">
                <div class="price">${bg.price > 0 ? `${bg.price} coins` : 'Free'}</div>
            `;

            item.addEventListener('click', () => {
                if (!unlockedBackgrounds.includes(bg.id)) {
                    if (userCoins >= bg.price) {
                        // Unlock background
                        userCoins -= bg.price;
                        unlockedBackgrounds.push(bg.id);
                        chrome.storage.local.set({ 
                            userCoins,
                            unlockedBackgrounds
                        });
                        updateCoinDisplay();
                        loadBackgrounds();
                    } else {
                        alert('Not enough coins to unlock this background!');
                    }
                } else {
                    // Set as current background
                    currentBackground = bg;
                    chrome.storage.local.set({ currentBackground });
                    updateBackground();
                }
            });

            backgroundList.appendChild(item);
        });
    }

    // Load available materials
    function loadMaterials() {
        const materials = [
            { id: 'ball', name: 'Ball', price: 25, image: 'materials/ball.png' },
            { id: 'toy', name: 'Toy', price: 35, image: 'materials/toy.png' },
            { id: 'pillow', name: 'Pillow', price: 45, image: 'materials/pillow.png' },
            // Add more materials as needed
        ];

        const materialsList = document.querySelector('.materials-list');
        materialsList.innerHTML = '';

        materials.forEach(material => {
            const item = document.createElement('div');
            item.className = `material-item ${unlockedMaterials.includes(material.id) ? '' : 'locked'}`;
            item.innerHTML = `
                <img src="${material.image}" alt="${material.name}">
                <div class="price">${material.price} coins</div>
            `;

            item.addEventListener('click', () => {
                if (!unlockedMaterials.includes(material.id)) {
                    if (userCoins >= material.price) {
                        // Unlock material
                        userCoins -= material.price;
                        unlockedMaterials.push(material.id);
                        chrome.storage.local.set({ 
                            userCoins,
                            unlockedMaterials
                        });
                        updateCoinDisplay();
                        loadMaterials();
                    } else {
                        alert('Not enough coins to unlock this material!');
                    }
                } else {
                    // Add material to playground
                    addMaterialToPlayground(material);
                }
            });

            materialsList.appendChild(item);
        });
    }

    // Add material to playground
    function addMaterialToPlayground(material) {
        const materialsLayer = document.querySelector('.materials-layer');
        const materialElement = document.createElement('div');
        materialElement.className = 'draggable';
        materialElement.innerHTML = `<img src="${material.image}" alt="${material.name}">`;
        
        // Set initial position
        materialElement.style.left = '50%';
        materialElement.style.top = '50%';
        materialElement.style.transform = 'translate(-50%, -50%)';
        materialElement.style.width = '100px';
        materialElement.style.height = '100px';

        // Make draggable
        makeDraggable(materialElement);

        materialsLayer.appendChild(materialElement);
        placedMaterials.push({
            id: material.id,
            x: 50,
            y: 50,
            width: 100,
            height: 100
        });

        // Save to storage
        chrome.storage.local.set({ placedMaterials });
    }

    // Make element draggable
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            const playground = document.querySelector('.playground');
            const rect = playground.getBoundingClientRect();
            
            // Calculate new position
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;
            
            // Constrain to playground bounds
            newTop = Math.max(0, Math.min(newTop, rect.height - element.offsetHeight));
            newLeft = Math.max(0, Math.min(newLeft, rect.width - element.offsetWidth));
            
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";

            // Update stored position
            const index = Array.from(element.parentNode.children).indexOf(element);
            if (placedMaterials[index]) {
                placedMaterials[index].x = (newLeft / rect.width) * 100;
                placedMaterials[index].y = (newTop / rect.height) * 100;
                chrome.storage.local.set({ placedMaterials });
            }
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Update background
    function updateBackground() {
        const backgroundLayer = document.querySelector('.background-layer');
        if (currentBackground) {
            backgroundLayer.style.backgroundImage = `url(${currentBackground.image})`;
            backgroundLayer.style.backgroundSize = 'cover';
            backgroundLayer.style.backgroundPosition = 'center';
        } else {
            backgroundLayer.style.backgroundImage = 'none';
        }
    }

    // Restore playground state
    function restorePlayground() {
        updateBackground();
        
        const materialsLayer = document.querySelector('.materials-layer');
        materialsLayer.innerHTML = '';

        placedMaterials.forEach(material => {
            const materialElement = document.createElement('div');
            materialElement.className = 'draggable';
            materialElement.innerHTML = `<img src="materials/${material.id}.png" alt="${material.id}">`;
            
            materialElement.style.left = `${material.x}%`;
            materialElement.style.top = `${material.y}%`;
            materialElement.style.width = `${material.width}px`;
            materialElement.style.height = `${material.height}px`;
            materialElement.style.transform = 'translate(-50%, -50%)';

            makeDraggable(materialElement);
            materialsLayer.appendChild(materialElement);
        });
    }

    // Update the playground layers order
    function updatePlaygroundLayers() {
        const playground = document.querySelector('.playground');
        const backgroundLayer = document.querySelector('.background-layer');
        const materialsLayer = document.querySelector('.materials-layer');
        const companionLayer = document.querySelector('.companion-layer');

        // Remove all layers
        playground.innerHTML = '';

        // Add layers in correct order
        playground.appendChild(backgroundLayer);  // Bottom layer
        playground.appendChild(materialsLayer);   // Middle layer
        playground.appendChild(companionLayer);   // Top layer
    }

    // Initialize playground when the dashboard loads
    loadPlaygroundData();
    updatePlaygroundLayers();
}); 