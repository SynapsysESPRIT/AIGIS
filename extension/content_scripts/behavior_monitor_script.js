// Behavior monitoring thresholds
const SCROLL_SPEED_THRESHOLD = 500; // pixels per second
const SCROLL_DURATION_THRESHOLD = 2000; // 2 seconds in milliseconds
const PAGE_TIME_THRESHOLD = 60000; // 1 minute in milliseconds
const INTERACTION_THRESHOLD = 30000; // 30 seconds without interaction
const REEL_COUNT_THRESHOLD = 3; // Number of reels to trigger warning
const WARNING_COOLDOWN = 30000; // 30 seconds cooldown between warnings

// State tracking
let lastScrollTime = 0;
let scrollStartTime = 0;
let pageStartTime = Date.now();
let lastInteractionTime = Date.now();
let isScrolling = false;
let scrollDistance = 0;
let lastWarningTime = 0;
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
    const scrollSpeed = timeSinceLastScroll > 10 ? 
        Math.abs(window.scrollY - scrollDistance) / (timeSinceLastScroll / 1000) : 0;
    
    if (scrollSpeed > SCROLL_SPEED_THRESHOLD) {
        if (!isScrolling) {
            scrollStartTime = currentTime;
            isScrolling = true;
        }
        
        if (currentTime - scrollStartTime > SCROLL_DURATION_THRESHOLD) {
            triggerWarning('rapid_scrolling');
            isScrolling = false;
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
    });
});

// Monitor time spent on page
setInterval(() => {
    const currentTime = Date.now();
    const timeOnPage = currentTime - pageStartTime;
    const timeSinceLastInteraction = currentTime - lastInteractionTime;
    
    if (timeOnPage > PAGE_TIME_THRESHOLD && timeSinceLastInteraction > INTERACTION_THRESHOLD) {
        triggerWarning('passive_consumption');
    }
}, 10000);

// Monitor for reels/shorts
const reelObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            const reels = document.querySelectorAll('video[src*="reel"], video[src*="short"], [data-testid*="reel"], [data-testid*="short"]');
            if (reels.length > reelCount) {
                reelCount = reels.length;
                if (reelCount >= REEL_COUNT_THRESHOLD) {
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
    const currentTime = Date.now();
    if (currentTime - lastWarningTime < WARNING_COOLDOWN) {
        return;
    }
    
    // Update pattern metrics
    patternMetrics.doomscrollCount++;
    console.log('Updated doomscroll count:', patternMetrics.doomscrollCount);
    
    // Send warning to background script
    chrome.runtime.sendMessage({
        type: 'behavior_warning',
        data: {
            type: type,
            message: getWarningMessage(type),
            timestamp: currentTime
        }
    });
    
    lastWarningTime = currentTime;
}

// Get appropriate warning message
function getWarningMessage(type) {
    switch (type) {
        case 'rapid_scrolling':
            return 'You\'ve been scrolling rapidly. Consider taking a break.';
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
    if (message.type === 'violenceResult' && message.data.is_violent) {
        patternMetrics.violenceCount++;
        console.log('Updated violence count:', patternMetrics.violenceCount);
    }
});

// Reset metrics every 5 minutes
setInterval(() => {
    patternMetrics = {
        doomscrollCount: 0,
        violenceCount: 0,
        startTime: Date.now()
    };
    console.log('Pattern metrics reset');
}, 300000); 