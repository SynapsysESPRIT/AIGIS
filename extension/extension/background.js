// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'notification') {
        // Create notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: request.title || 'AIGIS Safety Alert',
            message: request.message
        });
    }
});
