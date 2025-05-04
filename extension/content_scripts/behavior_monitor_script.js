// Behavior monitoring thresholds
const SCROLL_SPEED_THRESHOLD = 500; // pixels per second (reduced from 1000)
const SCROLL_DURATION_THRESHOLD = 30000; // 30 seconds in milliseconds (reduced from 2 minutes)
const PAGE_TIME_THRESHOLD = 60000; // 1 minute in milliseconds (reduced from 10 minutes)
const INTERACTION_THRESHOLD = 30000; // 30 seconds without interaction (reduced from 5 minutes)
const REEL_COUNT_THRESHOLD = 3; // Number of reels to trigger warning

// State tracking
let lastScrollTime = 0;
let scrollStartTime = 0;
let pageStartTime = Date.now();
let lastInteractionTime = Date.now();
let isScrolling = false;
let scrollDistance = 0;
let warningShown = false;
let reelCount = 0;

// Track pattern metrics
let patternMetrics = {
    doomscrollCount: 0,
    violenceCount: 0,
    startTime: Date.now()
};

console.log('Behavior monitoring initialized');

// Track scrolling behavior
window.addEventListener('scroll', () => {
    const currentTime = Date.now();
    const timeSinceLastScroll = currentTime - lastScrollTime;
    const scrollSpeed = Math.abs(window.scrollY - scrollDistance) / (timeSinceLastScroll / 1000);
    
    console.log('Scroll speed:', scrollSpeed, 'pixels/second');
    
    if (scrollSpeed > 1000) { // High speed scrolling
        if (!isScrolling) {
            scrollStartTime = currentTime;
            isScrolling = true;
            console.log('Started tracking rapid scrolling');
        }
        
        if (currentTime - scrollStartTime > 2000) { // 2 seconds of rapid scrolling
            patternMetrics.doomscrollCount++;
            console.log('Doomscroll detected! Total count:', patternMetrics.doomscrollCount);
            isScrolling = false; // Reset to allow new doomscroll detection
        }
    } else {
        isScrolling = false;
    }
    
    lastScrollTime = currentTime;
    scrollDistance = window.scrollY;
});

// Track user interactions
['click', 'keydown', 'mousedown', 'touchstart'].forEach(eventType => {
    document.addEventListener(eventType, () => {
        lastInteractionTime = Date.now();
        console.log('User interaction detected:', eventType);
    });
});

// Monitor time spent on page
setInterval(() => {
    const currentTime = Date.now();
    const timeOnPage = currentTime - pageStartTime;
    const timeSinceLastInteraction = currentTime - lastInteractionTime;
    
    console.log('Time on page:', Math.floor(timeOnPage/1000), 'seconds');
    console.log('Time since last interaction:', Math.floor(timeSinceLastInteraction/1000), 'seconds');
    
    // Check if user has been on page too long without interaction
    if (timeOnPage > PAGE_TIME_THRESHOLD && timeSinceLastInteraction > INTERACTION_THRESHOLD) {
        console.log('Triggering passive consumption warning');
        triggerWarning('passive_consumption');
    }
}, 10000);

// Monitor for reels/shorts
const reelObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            // Check for common reel/short video selectors
            const reels = document.querySelectorAll('video[src*="reel"], video[src*="short"], [data-testid*="reel"], [data-testid*="short"]');
            console.log('Found reels/shorts:', reels.length);
            if (reels.length > reelCount) {
                reelCount = reels.length;
                console.log('Reel count increased to:', reelCount);
                if (reelCount >= REEL_COUNT_THRESHOLD) {
                    console.log('Triggering reel binge warning');
                    triggerWarning('reel_binge');
                }
            }
        }
    });
});

reelObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Function to trigger warnings
function triggerWarning(type) {
    if (warningShown) {
        console.log('Warning already shown, skipping');
        return;
    }
    
    const warning = {
        type: type,
        timestamp: new Date().toISOString(),
        message: getWarningMessage(type)
    };
    
    console.log('Storing warning:', warning);
    
    // Store warning in chrome.storage
    chrome.storage.local.get(['warnings'], (result) => {
        const warnings = result.warnings || [];
        warnings.push(warning);
        chrome.storage.local.set({ warnings }, () => {
            console.log('Warning stored successfully');
            
            // Try to send to popup if it's open
            chrome.runtime.sendMessage({
                type: 'behavior_warning',
                data: warning
            }).catch(error => {
                console.log('Popup not open, warning stored for later');
            });
        });
    });
    
    warningShown = true;
    
    // Reset warning after 1 minute
    setTimeout(() => {
        warningShown = false;
        console.log('Warning state reset');
    }, 60000);
}

// Get appropriate warning message
function getWarningMessage(type) {
    switch (type) {
        case 'rapid_scrolling':
            return 'You\'ve been scrolling rapidly for an extended period. Consider taking a break.';
        case 'passive_consumption':
            return 'You\'ve been passively consuming content for a while. Try engaging with the content or taking a break.';
        case 'reel_binge':
            return `You've watched ${reelCount} reels/shorts. Consider taking a break.`;
        default:
            return 'Unusual browsing pattern detected. Consider taking a break.';
    }
}

// Listen for violence detection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    if (message.type === 'violenceResult' && message.data.is_violent) {
        patternMetrics.violenceCount++;
        console.log('Violence detected! Total count:', patternMetrics.violenceCount);
    }
});

// Function to calculate pattern metrics
function calculatePatternMetrics() {
    const duration = Math.max(1, (Date.now() - patternMetrics.startTime) / 60000); // in minutes
    const metrics = {
        timestamp: Date.now(),
        doomscrollRate: patternMetrics.doomscrollCount / duration,
        violenceRate: patternMetrics.violenceCount / duration,
        status: determineStatus()
    };
    console.log('Calculated metrics:', metrics);
    return metrics;
}

// Function to determine status based on current metrics
function determineStatus() {
    const duration = (Date.now() - patternMetrics.startTime) / 60000; // minutes
    const doomscrollRate = patternMetrics.doomscrollCount / duration;
    const violenceRate = patternMetrics.violenceCount / duration;

    console.log('Current rates - Doomscroll:', doomscrollRate, '/min, Violence:', violenceRate, '/min');

    // Thresholds for testing
    const DOOMSCROLL_THRESHOLD = 2; // 2 doomscrolls per minute
    const VIOLENCE_THRESHOLD = 1; // 1 violent content per minute

    if (doomscrollRate <= DOOMSCROLL_THRESHOLD && violenceRate <= VIOLENCE_THRESHOLD) {
        return 'improving';
    } else if (doomscrollRate > DOOMSCROLL_THRESHOLD * 2 || violenceRate > VIOLENCE_THRESHOLD * 2) {
        return 'worsening';
    } else {
        return 'stable';
    }
}

// Function to write pattern to file
async function writePatternToFile(pattern) {
    try {
        console.log('Writing pattern to file:', pattern);
        const response = await fetch(chrome.runtime.getURL('pattern_history.txt'));
        const text = await response.text();
        const lines = text.split('\n');
        const header = lines[0];
        const patterns = lines.slice(1).map(line => {
            const [timestamp, doomscrollRate, violenceRate, status] = line.split(',');
            return {
                timestamp: parseInt(timestamp),
                doomscrollRate: parseFloat(doomscrollRate),
                violenceRate: parseFloat(violenceRate),
                status
            };
        }).filter(p => !isNaN(p.timestamp));

        // Keep only last 10 patterns
        patterns.push(pattern);
        if (patterns.length > 10) {
            patterns.shift();
        }

        // Convert patterns back to CSV format
        const newContent = header + '\n' + patterns.map(p => 
            `${p.timestamp},${p.doomscrollRate},${p.violenceRate},${p.status}`
        ).join('\n');

        console.log('New pattern history content:', newContent);

        // Write to file using chrome.runtime.getPackageDirectoryEntry()
        chrome.runtime.getPackageDirectoryEntry(function(root) {
            root.getFile('pattern_history.txt', {create: true}, function(fileEntry) {
                fileEntry.createWriter(function(fileWriter) {
                    const blob = new Blob([newContent], {type: 'text/plain'});
                    fileWriter.write(blob);
                    console.log('Pattern history file updated');
                });
            });
        });
    } catch (error) {
        console.error('Error writing pattern to file:', error);
    }
}

// Update metrics and file every 5 minutes
setInterval(async () => {
    const metrics = calculatePatternMetrics();
    await writePatternToFile(metrics);
    
    // Reset metrics
    patternMetrics = {
        doomscrollCount: 0,
        violenceCount: 0,
        startTime: Date.now()
    };
    console.log('Pattern metrics reset');
}, 300000); 