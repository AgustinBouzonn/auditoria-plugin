importScripts("audioUtils.js")

let recorderTabId = null
let recorderReadyResolve = null

const RECORDER_URL = "src/recorder/recorder.html"

const SYSTEM_PROMPT = `You are an expert call center copilot. 
Your goal is to assist the AGENT in real-time during a call with a CUSTOMER.
Analyze the conversation provided (Agent vs Customer).
Provide immediate, short, and actionable advice to the Agent.
Focus on:
1. Handling objections.
2. Suggesting next steps.
3. Ensuring compliance or following script if implied.
4. Sentiment analysis (warn if customer is angry).
Keep your responses concise (bullet points or short sentences).`

let micBuffer = []
let sysBuffer = []
const BUFFER_LIMIT = 50000
const CHUNK_INTERVAL = 5000
let isProcessing = false

async function openRecorderTab() {
  if (recorderTabId) {
    try {
      const tab = await chrome.tabs.get(recorderTabId)
      if (tab) return recorderTabId
    } catch (e) {
      recorderTabId = null
    }
  }

  const tab = await chrome.tabs.create({
    url: RECORDER_URL,
    pinned: true,
    active: true,
  })
  recorderTabId = tab.id

  console.log("Waiting for recorder tab to be ready...")
  await new Promise(resolve => {
    recorderReadyResolve = resolve
    setTimeout(() => {
      if (recorderReadyResolve) {
        console.warn("Timeout waiting for recorder tab")
        resolve()
        recorderReadyResolve = null
      }
    }, 5000)
  })

  return recorderTabId
}

async function closeRecorderTab() {
  if (recorderTabId) {
    try {
      await chrome.tabs.remove(recorderTabId)
    } catch (e) {}
    recorderTabId = null
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_RECORDING") {
    startRecording()
      .then(sendResponse)
      .catch(err => {
        console.error("Start Recording Error:", err)
        sendResponse({ error: err.message })
      })
    return true
  } else if (message.type === "STOP_RECORDING") {
    stopRecording().then(sendResponse)
    return true
  } else if (message.type === "AUDIO_DATA") {
    handleAudioData(message.data)
  } else if (message.type === "RECORDER_READY") {
    console.log("Recorder Tab Ready")
    if (recorderReadyResolve) {
      recorderReadyResolve()
      recorderReadyResolve = null
    }
  }
})

async function startRecording() {
  const targetTabId = await openRecorderTab()

  return new Promise(async (resolve, reject) => {
    let targetTab = null
    try {
      targetTab = await chrome.tabs.get(targetTabId)
    } catch (err) {
      reject(new Error("Could not access recorder tab."))
      return
    }

    if (!targetTab) {
      reject(new Error("Recorder tab is null"))
      return
    }

    chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window", "audio"],
      targetTab,
      streamId => {
        if (!streamId) {
          closeRecorderTab()
          reject(new Error("Permission denied or cancelled"))
          return
        }

        chrome.tabs.sendMessage(
          targetTabId,
          {
            type: "START_CAPTURE",
            target: "recorder",
            data: { streamId },
          },
          response => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending START_CAPTURE:",
                chrome.runtime.lastError,
              )
            }
          },
        )

        startProcessingInterval()
        resolve({ success: true })
      },
    )
  })
}

async function stopRecording() {
  if (recorderTabId) {
    chrome.tabs.sendMessage(recorderTabId, {
      type: "STOP_CAPTURE",
      target: "recorder",
    })
  }

  clearInterval(processingInterval)

  await processBuffer("mic")
  await processBuffer("sys")

  micBuffer = []
  sysBuffer = []

  return { success: true }
}

function handleAudioData(data) {
  try {
    const message = JSON.parse(data)
    const source = message.source
    const base64Audio = message.data

    if (!source || !base64Audio) return

    const audioBytes = base64ToBlob(base64Audio)

    if (source === "mic") {
      micBuffer.push(audioBytes)
      if (getTotalSize(micBuffer) > BUFFER_LIMIT) {
        processBuffer("mic")
      }
    } else if (source === "sys") {
      sysBuffer.push(audioBytes)
      if (getTotalSize(sysBuffer) > BUFFER_LIMIT) {
        processBuffer("sys")
      }
    }
  } catch (err) {
    console.error("Error processing audio data:", err)
  }
}

let processingInterval

function startProcessingInterval() {
  processingInterval = setInterval(() => {
    processBuffer("mic")
    processBuffer("sys")
  }, CHUNK_INTERVAL)
}

async function processBuffer(source) {
  if (isProcessing) return

  const buffer = source === "mic" ? micBuffer : sysBuffer
  if (buffer.length === 0) return

  isProcessing = true
  const chunksToProcess = [...buffer]

  if (source === "mic") {
    micBuffer = []
  } else {
    sysBuffer = []
  }

  try {
    const combinedBlob = new Blob(chunksToProcess, { type: "audio/webm" })
    const wavBlob = await convertWebmToWav(combinedBlob)
    const wav16kBlob = await downsampleTo16k(wavBlob)

    await transcribeAndRecommend(wav16kBlob, source)
  } catch (err) {
    console.error(`Error processing ${source} buffer:`, err)
  } finally {
    isProcessing = false
  }
}

async function transcribeAndRecommend(audioBlob, source) {
  const result = await chrome.storage.local.get("apiKey")
  const apiKey = result.apiKey

  if (!apiKey) {
    console.error("API key not found. Please set it in the popup.")
    return
  }

  try {
    const formData = new FormData()
    formData.append("file", audioBlob, "audio.wav")
    formData.append("model", "whisper-1")
    formData.append("language", "es")

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    )

    if (!response.ok) {
      const error = await response.json()
      console.error("Whisper API error:", error)
      return
    }

    const data = await response.json()
    const text = data.text.trim()

    if (!text) return

    const label = source === "mic" ? "Agent" : "Customer"
    const formattedText = `[${label}]: ${text}`

    chrome.runtime.sendMessage({
      type: "TRANSCRIPT_UPDATE",
      text: formattedText,
    })

    if (text.length > 5) {
      await getRecommendation(formattedText, apiKey)
    }
  } catch (err) {
    console.error("Error transcribing audio:", err)
  }
}

async function getRecommendation(text, apiKey) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Latest interaction:\n${text}\n\nProvide a recommendation for the Agent:`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("GPT API error:", error)
      return
    }

    const data = await response.json()
    const recommendation = data.choices[0].message.content

    chrome.runtime.sendMessage({
      type: "RECOMMENDATION_UPDATE",
      text: recommendation,
    })
  } catch (err) {
    console.error("Error getting recommendation:", err)
  }
}

function base64ToBlob(base64Data) {
  const parts = base64Data.split(",")
  const mimeType = parts[0].match(/:(.*?);/)[1]
  const byteString = atob(parts[1])
  const arrayBuffer = new ArrayBuffer(byteString.length)
  const uint8Array = new Uint8Array(arrayBuffer)

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i)
  }

  return new Blob([arrayBuffer], { type: mimeType })
}

function getTotalSize(blobArray) {
  return blobArray.reduce((total, blob) => total + blob.size, 0)
}
