// Content script - runs in the context of web pages
console.log('KipuSucks Extension content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'buttonClicked') {
        console.log('Button was clicked at:', request.timestamp);
        
        // Example: Add a notification to the page
        showNotification('Extension button was clicked!');
        
        sendResponse({status: 'success'});
    }
});

// Function to show a notification on the page
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'kipusucks-notification';
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Example: Monitor page changes
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        // React to page changes if needed
        // console.log('Page changed:', mutation);
    });
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});
