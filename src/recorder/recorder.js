let micRecorder;
let sysRecorder;
let micStream;
let sysStream;

// Update status UI
function setStatus(msg, isRecording = false) {
    const el = document.getElementById('status');
    if (el) {
        el.innerText = msg;
        if (isRecording) el.classList.add('recording');
        else el.classList.remove('recording');
    }
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'recorder') return;

  if (message.type === 'START_CAPTURE') {
    await startCapture(message.data.streamId);
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(streamId) {
  try {
    setStatus("Initializing capture...");

    // 1. Get System Audio (from Desktop Capture)
    sysStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    });

    // 2. Get Microphone Audio
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // --- SYSTEM AUDIO SETUP ---
    const sysAudioTracks = sysStream.getAudioTracks();
    if (sysAudioTracks.length === 0) {
        throw new Error("System audio not shared. Please check 'Share system audio' in the picker.");
    }
    const sysAudioOnlyStream = new MediaStream(sysAudioTracks);

    // 3. Start Recording System Audio
    sysRecorder = new MediaRecorder(sysAudioOnlyStream, { mimeType: 'audio/webm' });
    sysRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const base64 = await blobToBase64(event.data);
        // Send as JSON string with source info
        const payload = JSON.stringify({
            source: 'sys',
            data: base64
        });
        chrome.runtime.sendMessage({
          type: 'AUDIO_DATA',
          data: payload
        });
      }
    };
    sysRecorder.start(1000);

    // --- MICROPHONE AUDIO SETUP ---
    // 4. Start Recording Microphone Audio
    micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
    micRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        const base64 = await blobToBase64(event.data);
        // Send as JSON string with source info
        const payload = JSON.stringify({
            source: 'mic',
            data: base64
        });
        chrome.runtime.sendMessage({
          type: 'AUDIO_DATA',
          data: payload
        });
      }
    };
    micRecorder.start(1000);

    setStatus("Recording in progress (Dual Stream)...", true);
    
    // Handle stream end (user stopped sharing)
    sysStream.getVideoTracks()[0].onended = () => {
        stopCapture();
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }); // Notify background
    };

  } catch (err) {
    console.error('Error starting capture:', err.name, err.message, err);
    setStatus("Error: " + err.message);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: err.name + ': ' + err.message
    });
  }
}

function stopCapture() {
  if (micRecorder && micRecorder.state !== 'inactive') micRecorder.stop();
  if (sysRecorder && sysRecorder.state !== 'inactive') sysRecorder.stop();
  
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (sysStream) sysStream.getTracks().forEach(t => t.stop());
  
  setStatus("Recording stopped.");
}

function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Notify background that we are ready
chrome.runtime.sendMessage({ type: 'RECORDER_READY' });
