// background.js
// This script runs in the background as a Service Worker (Manifest V3)
// It's event-driven and wakes up only when needed.

console.log('GuardianKey Background Service Worker started.');

// Example: Listen for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    console.log('GuardianKey installed or updated.');
    // You could set initial settings here, or open an options page.
});

// Example: Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "logMessage") {
        console.log("Message from popup/content script:", message.data);
        sendResponse({ status: "received" });
    }
    // Add more background logic here as needed
});