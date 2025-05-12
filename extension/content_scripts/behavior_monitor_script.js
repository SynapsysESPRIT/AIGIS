// Behavior monitoring thresholds
const SCROLL_FREQUENCY_THRESHOLD = 10; // scrolls per minute
const SCROLL_SPEED_THRESHOLD = 3000; // pixels per second for distracted state
const ENGAGEMENT_THRESHOLD = 30000; // 30 seconds minimum engagement
const PATTERN_UPDATE_INTERVAL = 30000; // 30 seconds

// State tracking
let scrollEvents = [];
let engagementSessions = [];
let currentEngagement = {
    startTime: Date.now(),
    type: 'page',
    content: null
};

// Track pattern metrics
let patternMetrics = {
    scrollFrequency: 0,
    averageScrollSpeed: 0,
    engagementDuration: 0,
    lastUpdate: Date.now()
};

console.log('Behavior monitoring initialized');

// Track scrolling behavior
window.addEventListener('scroll', () => {
    const currentTime = Date.now();
    const scrollEvent = {
        timestamp: currentTime,
        position: window.scrollY
    };

    scrollEvents.push(scrollEvent);

    // Keep only last 5 minutes of scroll events
    const fiveMinutesAgo = currentTime - 300000;
    scrollEvents = scrollEvents.filter(event => event.timestamp > fiveMinutesAgo);

    // Calculate scroll speed
    if (scrollEvents.length > 1) {
        const lastEvent = scrollEvents[scrollEvents.length - 2];
        const timeDiff = currentTime - lastEvent.timestamp;
        const distance = Math.abs(scrollEvent.position - lastEvent.position);
        const speed = timeDiff > 0 ? distance / (timeDiff / 1000) : 0;

        if (speed > SCROLL_SPEED_THRESHOLD) {
            updatePattern('rapid_scrolling');
        }
    }
});

// Track engagement with content
function trackEngagement(type, content) {
    const currentTime = Date.now();

    // End current engagement if type changed
    if (currentEngagement.type !== type) {
        if (currentTime - currentEngagement.startTime >= ENGAGEMENT_THRESHOLD) {
            engagementSessions.push({
                type: currentEngagement.type,
                content: currentEngagement.content,
                duration: currentTime - currentEngagement.startTime
            });
        }
        currentEngagement = {
            startTime: currentTime,
            type: type,
            content: content
        };
    }
}

// Monitor for reels/shorts
function setupReelObserver() {
    if (document.documentElement) {
        const reelObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    const reels = document.querySelectorAll('video[src*="reel"], video[src*="short"], [data-testid*="reel"], [data-testid*="short"]');
                    reels.forEach(reel => {
                        if (reel.paused === false) {
                            trackEngagement('reel', reel.src);
                        }
                    });
                }
            });
        });

        reelObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    } else {
        // If documentElement isn't ready, try again in a moment
        setTimeout(setupReelObserver, 100);
    }
}

// Initialize observer after document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupReelObserver);
} else {
    setupReelObserver();
}

// Track user interactions
['click', 'keydown', 'mousedown', 'touchstart'].forEach(eventType => {
    document.addEventListener(eventType, () => {
        trackEngagement('interaction', eventType);
    });
});

// Calculate pattern metrics
function calculatePatternMetrics() {
    const currentTime = Date.now();
    const timeWindow = currentTime - patternMetrics.lastUpdate;

    // Calculate scroll frequency (scrolls per minute)
    const recentScrolls = scrollEvents.filter(event =>
        event.timestamp > currentTime - timeWindow
    );
    const scrollFrequency = (recentScrolls.length / timeWindow) * 60000;

    // Calculate average scroll speed
    let totalSpeed = 0;
    let speedCount = 0;
    for (let i = 1; i < recentScrolls.length; i++) {
        const timeDiff = recentScrolls[i].timestamp - recentScrolls[i - 1].timestamp;
        const distance = Math.abs(recentScrolls[i].position - recentScrolls[i - 1].position);
        if (timeDiff > 0) {
            totalSpeed += distance / (timeDiff / 1000);
            speedCount++;
        }
    }
    const averageScrollSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

    // Calculate average engagement duration
    const recentEngagements = engagementSessions.filter(session =>
        session.duration > 0 && session.timestamp > currentTime - timeWindow
    );

    // Add current engagement if it exists
    let totalEngagement = 0;
    if (currentEngagement && currentEngagement.startTime) {
        const currentDuration = currentTime - currentEngagement.startTime;
        if (currentDuration >= ENGAGEMENT_THRESHOLD) {
            totalEngagement += currentDuration;
        }
    }

    // Add completed engagements
    totalEngagement += recentEngagements.reduce((sum, session) => sum + session.duration, 0);

    // Calculate average engagement duration
    const engagementCount = recentEngagements.length + (currentEngagement && currentEngagement.startTime ? 1 : 0);
    const averageEngagement = engagementCount > 0 ? totalEngagement / engagementCount : 0;

    return {
        scrollFrequency,
        averageScrollSpeed,
        engagementDuration: averageEngagement,
        timestamp: currentTime
    };
}

// Determine behavior pattern
function determineBehaviorPattern(metrics) {
    const { scrollFrequency, averageScrollSpeed, engagementDuration } = metrics;

    // Distracted/Bored: Very high scroll speed
    if (averageScrollSpeed > SCROLL_SPEED_THRESHOLD) {
        return { pattern: 'distracted', sprite: 'sad' };
    }

    // Focused: Low scroll frequency, high engagement
    if (scrollFrequency < 5 && engagementDuration > 60000) {
        return { pattern: 'focused', sprite: 'happy' };
    }

    // Restless: High scroll speed but not quite distracted
    if (averageScrollSpeed > 800 && scrollFrequency > 10) {
        return { pattern: 'restless', sprite: 'sleepy' };
    }

    // Binge-consuming: Very high engagement, medium scroll frequency
    if (engagementDuration > 120000 && scrollFrequency > 8) {
        return { pattern: 'binge', sprite: 'sleepy' };
    }

    // Default to normal
    return { pattern: 'normal', sprite: 'happy' };
}

function sendUsagePatternToBackend(pattern) {
    try {
        chrome.storage.local.get(['activeChildId'], ({ activeChildId }) => {
            const payload = {
                child_id: activeChildId || 1, // fallback
                activity_type: 'usage_pattern',
                url: window.location.href,
                duration: pattern.engagementDuration,
                risk_level: 0, // or calculate if needed
                details: {
                    behavior: pattern.behavior,
                    // add other fields if needed
                }
            };
            fetch('http://127.0.0.1:8000/monitoring/log-activity/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(res => res.json())
                .then(data => console.log('[behavior_monitor_script.js] Usage pattern logged:', data))
                .catch(err => console.error('[behavior_monitor_script.js] Error logging usage pattern:', err));
        });
    } catch (err) {
        console.error('[behavior_monitor_script.js] Error in sendUsagePatternToBackend:', err);
    }
}

// Update pattern and notify
function updatePattern(type) {
    const metrics = calculatePatternMetrics();
    const behavior = determineBehaviorPattern(metrics);

    const pattern = {
        ...metrics,
        behavior: behavior.pattern,
        sprite: behavior.sprite,
        type: 'current'
    };

    // Update storage and trigger UI update
    chrome.storage.local.set({
        currentPattern: pattern
    }, () => {
        try {
            chrome.runtime.sendMessage({
                type: 'pattern_update',
                data: pattern
            });
            sendUsagePatternToBackend(pattern);
        } catch (error) {
            console.log('Error sending pattern update:', error);
        }
    });
}

// Reset metrics periodically
setInterval(() => {
    const metrics = calculatePatternMetrics();
    const behavior = determineBehaviorPattern(metrics);

    const pattern = {
        ...metrics,
        behavior: behavior.pattern,
        sprite: behavior.sprite,
        type: 'periodic'
    };

    // Store the pattern
    chrome.storage.local.set({
        currentPattern: pattern
    });

    // Send pattern reset to popup
    chrome.runtime.sendMessage({
        type: 'pattern_update',
        data: pattern
    });

    // Reset current metrics
    patternMetrics = {
        scrollFrequency: 0,
        averageScrollSpeed: 0,
        engagementDuration: 0,
        lastUpdate: Date.now()
    };

    // Clear old data
    scrollEvents = [];
    engagementSessions = [];

    console.log('Pattern reset:', pattern);
}, PATTERN_UPDATE_INTERVAL);

// Initialize with a normal pattern
updatePattern('normal'); 