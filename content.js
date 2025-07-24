// content.js
// This script runs on web pages specified in manifest.json's "matches" array.

console.log('GuardianKey Content Script loaded on this page.');

// Example: Inject a small message into the page (uncomment to activate)
/*
const messageDiv = document.createElement('div');
messageDiv.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background-color: rgba(0, 122, 255, 0.8);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-family: 'Inter', sans-serif;
    font-size: 0.8em;
    z-index: 99999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
`;
messageDiv.textContent = 'GuardianKey Content Script Active!';
document.body.appendChild(messageDiv);
*/

// Example: Send a message to the background script
// chrome.runtime.sendMessage({ action: "logMessage", data: "Page loaded: " + window.location.href });

// You could add logic here to interact with forms, auto-fill passwords (with user permission),
// or analyze page content for sensitive information, but this requires careful design
// and additional permissions.