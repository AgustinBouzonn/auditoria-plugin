let recorder;
let data = [];
let audioContext;
let micStream;
let sysStream;
let mixedStream;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'START_CAPTURE') {
    await startCapture(message.data.streamId);
  } else if (message.type === 'STOP_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(streamId) {
  try {
    audioContext = new AudioContext();

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

    // We only need audio, so we can stop the video track immediately to save resources?
    // Actually, some implementations stop the audio if video is stopped. Let's keep it but ignore it.
    // Or just not add it to the mix.

    // 2. Get Microphone Audio
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // 3. Mix Streams
    const sysSource = audioContext.createMediaStreamSource(sysStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    sysSource.connect(destination);
    micSource.connect(destination);

    mixedStream = destination.stream;

    // 4. Start Recording
    recorder = new MediaRecorder(mixedStream, { mimeType: 'audio/webm' });

    recorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        // Convert Blob to ArrayBuffer to send over messaging
        const buffer = await event.data.arrayBuffer();
        // We need to send it as a base64 string or array of bytes because standard JSON messaging
        // might not handle raw ArrayBuffers well depending on the Chrome version, 
        // but modern Chrome handles it. Let's try sending as array for safety or base64.
        // Actually, let's try sending the ArrayBuffer directly, if it fails we'll convert.
        // To be safe for WebSocket, let's convert to Base64.
        const base64 = await blobToBase64(event.data);
        chrome.runtime.sendMessage({
          type: 'AUDIO_DATA',
          data: base64
        });
      }
    };

    recorder.start(1000); // Collect 1 second chunks
  } catch (err) {
    console.error('Error starting capture:', err.name, err.message, err);
    // Send error back to background to forward to popup
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: err.name + ': ' + err.message
    });
  }
}

function stopCapture() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (sysStream) sysStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
}

function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // This includes data:audio/webm;base64,...
    reader.readAsDataURL(blob);
  });
}
