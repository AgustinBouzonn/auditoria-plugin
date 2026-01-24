// Content script to detect softphone calls
// This is a placeholder for specific "Eyebeam" web detection logic.
// Since I don't have the specific URL or DOM structure of "Eyebeam Web", 
// I will implement a generic observer that looks for common keywords.

const CALL_KEYWORDS = ['In Call', 'Connected', '00:', 'Hang Up', 'End Call'];

function checkForCall() {
  const bodyText = document.body.innerText;
  const found = CALL_KEYWORDS.some(keyword => bodyText.includes(keyword));
  
  if (found) {
    // Potential call detected
    // chrome.runtime.sendMessage({ type: 'POTENTIAL_CALL_DETECTED' });
  }
}

// Observe DOM changes
const observer = new MutationObserver(() => {
  checkForCall();
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// Also check URL if it changes (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    checkForCall();
  }
}).observe(document, { subtree: true, childList: true });

console.log('AuditorIA Content Script Loaded');
