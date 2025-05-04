// Usage pattern analysis configuration
const ANALYSIS_INTERVAL = 300000; // 5 minutes
const VIOLENCE_THRESHOLD = 0.5; // Violence detection threshold
const DOOMSCROLL_THRESHOLD = 2; // Number of doomscroll warnings per interval

// Pattern tracking configuration
const PATTERN_INTERVAL = 300000; // 5 minutes
const MAX_PATTERNS = 10; // Keep last 10 patterns

// Track current session
let currentPattern = {
    doomscrollCount: 0,
    violenceCount: 0,
    totalViolenceScore: 0,
    startTime: Date.now()
};

// Function to calculate pattern metrics
function calculatePatternMetrics() {
    const duration = Math.max(1, (Date.now() - currentPattern.startTime) / 60000); // in minutes, minimum 1
    return {
        doomscrollRate: currentPattern.doomscrollCount / duration,
        violenceRate: currentPattern.violenceCount / duration,
        avgViolenceScore: currentPattern.violenceCount > 0 ? 
            currentPattern.totalViolenceScore / currentPattern.violenceCount : 0,
        timestamp: Date.now()
    };
}

// Function to compare patterns
function comparePatterns(current, previous) {
    if (!previous) return 'improving'; // First pattern is always improving
    
    const improvement = {
        doomscroll: current.doomscrollRate < previous.doomscrollRate,
        violence: current.violenceRate < previous.violenceRate,
        severity: current.avgViolenceScore < previous.avgViolenceScore
    };
    
    // Count improvements
    const improvements = Object.values(improvement).filter(Boolean).length;
    
    if (improvements >= 2) return 'improving';
    if (improvements <= 1) return 'worsening';
    return 'stable';
}

// Function to update pattern
function updatePattern(type, severity = 1) {
    console.log('Updating pattern for:', type, 'with severity:', severity);
    
    if (type === 'doomscroll') {
        currentPattern.doomscrollCount++;
    } else if (type === 'violence') {
        currentPattern.violenceCount++;
        currentPattern.totalViolenceScore += severity;
    }
    
    // Store current metrics
    const metrics = calculatePatternMetrics();
    chrome.storage.local.get(['patterns'], (result) => {
        const patterns = result.patterns || [];
        const previousPattern = patterns[patterns.length - 1];
        const status = comparePatterns(metrics, previousPattern);
        
        const pattern = {
            ...metrics,
            status,
            type: 'current'
        };
        
        // Update storage
        chrome.storage.local.set({ 
            currentPattern: pattern,
            patterns: [...patterns.slice(-MAX_PATTERNS), pattern]
        }, () => {
            console.log('Pattern updated:', pattern);
            try {
                chrome.runtime.sendMessage({
                    type: 'pattern_update',
                    data: pattern
                });
            } catch (error) {
                console.log('Error sending pattern update:', error);
            }
        });
    });
}

// Reset pattern periodically
setInterval(() => {
    const metrics = calculatePatternMetrics();
    chrome.storage.local.get(['patterns'], (result) => {
        const patterns = result.patterns || [];
        const previousPattern = patterns[patterns.length - 1];
        const status = comparePatterns(metrics, previousPattern);
        
        const pattern = {
            ...metrics,
            status,
            type: 'periodic'
        };
        
        // Store the pattern
        chrome.storage.local.set({ 
            currentPattern: pattern,
            patterns: [...patterns.slice(-MAX_PATTERNS), pattern]
        });
        
        // Reset current pattern
        currentPattern = {
            doomscrollCount: 0,
            violenceCount: 0,
            totalViolenceScore: 0,
            startTime: Date.now()
        };
    });
}, PATTERN_INTERVAL);

// Listen for events
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Usage analyzer received message:', message);
    
    if (message.type === 'behavior_warning') {
        console.log('Processing behavior warning:', message.data);
        if (message.data.type === 'rapid_scrolling' || 
            message.data.type === 'passive_consumption' || 
            message.data.type === 'reel_binge') {
            updatePattern('doomscroll', 1);
        }
    } else if (message.type === 'violenceResult') {
        console.log('Processing violence result:', message.data);
        if (message.data.is_violent && message.data.confidence > 0.5) {
            updatePattern('violence', message.data.confidence);
        }
    }
});

// Initialize with a normal pattern
updatePattern('normal', 0);

// Reset pattern after 1 minute
setInterval(() => {
    if (lastEvent && (Date.now() - lastEvent.timestamp > 60000)) {
        updatePattern('normal', 0);
    }
}, 10000); // Check every 10 seconds 