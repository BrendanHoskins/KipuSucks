document.addEventListener('DOMContentLoaded', function() {
    const openBtn = document.getElementById('openBtn');
    const status = document.getElementById('status');

    // Load saved state
    chrome.storage.sync.get(['extensionState'], function(result) {
        if (result.extensionState) {
            status.textContent = 'Ready';
        }
    });

    // Open button click handler
    openBtn.addEventListener('click', function() {
        status.textContent = 'Opening extension...';
        
        // Create new tab with extension page
        chrome.tabs.create({
            url: chrome.runtime.getURL('pages/main.html')
        }, function(tab) {
            // Save state to chrome storage
            chrome.storage.sync.set({
                extensionState: true,
                lastOpened: new Date().toISOString(),
                mainTabId: tab.id
            });
            
            // Close popup
            window.close();
        });
    });
});
