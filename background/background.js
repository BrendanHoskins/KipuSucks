// Background script (Service Worker for Manifest V3)
console.log('KipuSucks Extension background script loaded');

// Handle extension installation
chrome.runtime.onInstalled.addListener(function(details) {
    console.log('Extension installed:', details.reason);
    
    if (details.reason === 'install') {
        // Set default values on install
        chrome.storage.sync.set({
            extensionState: false,
            installDate: new Date().toISOString()
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(function() {
    console.log('Extension started');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Message received in background:', request);
    
    if (request.action === 'getData') {
        // Example: Return some data
        sendResponse({
            data: 'Hello from background script',
            timestamp: new Date().toISOString()
        });
    }
    
    return true; // Keep message channel open for async response
});

// Handle browser action click (if no popup is defined)
chrome.action.onClicked.addListener(function(tab) {
    console.log('Extension icon clicked on tab:', tab.url);
    
    // Example: Inject content script dynamically
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function() {
            console.log('Injected script executed');
        }
    });
});

// Example: Listen for tab updates
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
        console.log('Tab updated:', tab.url);
        // Perform actions when page loads
    }
});

// Example: Handle alarms (for periodic tasks)
chrome.alarms.onAlarm.addListener(function(alarm) {
    console.log('Alarm triggered:', alarm.name);
    // Handle periodic tasks
});

// Set up a periodic alarm (optional)
chrome.alarms.create('periodicCheck', {
    delayInMinutes: 1,
    periodInMinutes: 60
});
