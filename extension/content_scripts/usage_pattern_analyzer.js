// Usage pattern analysis configuration
const ANALYSIS_INTERVAL = 300000; // 5 minutes
const VIOLENCE_THRESHOLD = 0.5; // Violence detection threshold
const DOOMSCROLL_THRESHOLD = 2; // Doomscroll events per minute threshold

// Track current session
let currentPattern = {
    doomscrollCount: 0,
    violenceCount: 0,
    startTime: Date.now()
};

// Function to calculate pattern metrics
function calculatePatternMetrics() {
    const duration = Math.max(1, (Date.now() - currentPattern.startTime) / 60000); // in minutes, minimum 1
    return {
        doomscrollRate: currentPattern.doomscrollCount / duration,
        violenceRate: currentPattern.violenceCount / duration,
        timestamp: Date.now()
    };
}

// Function to determine status
function determineStatus(metrics) {
    console.log('Checking status with metrics:', metrics);
    
    // If either doomscrolling or violence is above threshold, status is bad
    if (metrics.doomscrollRate >= DOOMSCROLL_THRESHOLD || metrics.violenceRate >= VIOLENCE_THRESHOLD) {
        console.log('Status: bad (doomscroll:', metrics.doomscrollRate, 'violence:', metrics.violenceRate, ')');
        return 'bad';
    }
    console.log('Status: good (doomscroll:', metrics.doomscrollRate, 'violence:', metrics.violenceRate, ')');
    return 'good';
}

// Function to update pattern
function updatePattern(type) {
    console.log('Updating pattern for:', type);
    
    if (type === 'doomscroll') {
        currentPattern.doomscrollCount++;
        console.log('New doomscroll count:', currentPattern.doomscrollCount);
    } else if (type === 'violence') {
        currentPattern.violenceCount++;
        console.log('New violence count:', currentPattern.violenceCount);
    }
    
    // Calculate current metrics
    const metrics = calculatePatternMetrics();
    const status = determineStatus(metrics);
    
    const pattern = {
        ...metrics,
        status,
        type: 'current'
    };
    
    console.log('Pattern updated:', pattern);
    
    // Update storage and trigger UI update
    chrome.storage.local.set({ 
        currentPattern: pattern
    }, () => {
        try {
            chrome.runtime.sendMessage({
                type: 'pattern_update',
                data: pattern
            });
        } catch (error) {
            console.log('Error sending pattern update:', error);
        }
    });
}

// Reset pattern periodically
setInterval(() => {
    const metrics = calculatePatternMetrics();
    const status = determineStatus(metrics);
    
    const pattern = {
        ...metrics,
        status,
        type: 'periodic'
    };
    
    // Store the pattern
    chrome.storage.local.set({ 
        currentPattern: pattern
    });
    
    // Reset current pattern
    currentPattern = {
        doomscrollCount: 0,
        violenceCount: 0,
        startTime: Date.now()
    };
    
    console.log('Pattern reset:', pattern);
}, ANALYSIS_INTERVAL);

// Listen for events
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Usage analyzer received message:', message);
    
    if (message.type === 'behavior_warning') {
        console.log('Processing behavior warning:', message.data);
        if (message.data.type === 'rapid_scrolling' || 
            message.data.type === 'reel_binge' ||
            message.data.type === 'passive_consumption') {
            updatePattern('doomscroll');
        }
    } else if (message.type === 'violenceResult') {
        console.log('Processing violence result:', message.data);
        if (message.data.is_violent && message.data.confidence > 0.5) {
            updatePattern('violence');
        }
    }
});

// Initialize with a good pattern
updatePattern('normal'); 