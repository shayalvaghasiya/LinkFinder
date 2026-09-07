/**
 * Background service worker
 */

console.log('[LinkFinder] Service worker loaded');

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'jobsExtracted') {
        console.log(`[LinkFinder] ${message.count} jobs available for extraction`);

        // Update badge
        chrome.action.setBadgeText({ text: String(message.count) });
        chrome.action.setBadgeBackgroundColor({ color: '#0073b1' });
    }

    if (message.action === 'postsExtracted') {
        console.log(`[LinkFinder] ${message.count} posts available for extraction`);

        // Update badge
        chrome.action.setBadgeText({ text: String(message.count) });
        chrome.action.setBadgeBackgroundColor({ color: '#057642' });
    }
});

// Clear badge when popup is opened
chrome.action.onClicked.addListener(() => {
    chrome.action.setBadgeText({ text: '' });
});
