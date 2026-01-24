document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const apiKeyInput = document.getElementById('apiKey');
  const statusDiv = document.getElementById('status');
  const transcriptDiv = document.getElementById('transcript');
  const recommendationsDiv = document.getElementById('recommendations');

  // Load saved state
  chrome.storage.local.get(['isRecording', 'transcript', 'recommendations', 'apiKey'], (result) => {
    if (result.isRecording) {
      setRecordingState(true);
    }
    if (result.transcript) {
      transcriptDiv.innerText = result.transcript;
    }
    if (result.recommendations) {
      recommendationsDiv.innerText = result.recommendations;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
  });

  // Save API key
  saveKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ apiKey }, () => {
        statusDiv.innerText = 'API Key saved!';
        setTimeout(() => {
          if (!startBtn.disabled) statusDiv.innerText = 'Ready';
        }, 2000);
      });
    }
  });

  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_RECORDING' }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.innerText = 'Error: ' + chrome.runtime.lastError.message;
      } else {
        setRecordingState(true);
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      setRecordingState(false);
    });
  });

  function setRecordingState(isRecording) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    statusDiv.innerText = isRecording ? 'Recording...' : 'Ready';
    chrome.storage.local.set({ isRecording });
  }

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TRANSCRIPT_UPDATE') {
      transcriptDiv.innerText += message.text + '\n';
      // Auto-scroll
      transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
      // Save to storage (optional, for persistence)
      chrome.storage.local.get(['transcript'], (res) => {
        chrome.storage.local.set({ transcript: (res.transcript || '') + message.text + '\n' });
      });
    } else if (message.type === 'RECOMMENDATION_UPDATE') {
      recommendationsDiv.innerText = message.text;
      chrome.storage.local.set({ recommendations: message.text });
    }
  });
});
