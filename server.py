import asyncio
import websockets
import json
import base64
import os
import numpy as np
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Load environment variables
load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("WARNING: OPENAI_API_KEY not found in .env file.")

client = AsyncOpenAI(api_key=api_key)

# System prompt for RAG/Recommendations
SYSTEM_PROMPT = """
You are an expert call center copilot. 
Your goal is to assist the AGENT in real-time during a call with a CUSTOMER.
Analyze the conversation provided (Agent vs Customer).
Provide immediate, short, and actionable advice to the Agent.
Focus on:
1. Handling objections.
2. Suggesting next steps.
3. Ensuring compliance or following script if implied.
4. Sentiment analysis (warn if customer is angry).
Keep your responses concise (bullet points or short sentences).
"""

class ConnectionHandler:
    def __init__(self, websocket):
        self.websocket = websocket
        # Buffers for separate streams
        self.mic_buffer = bytearray()
        self.sys_buffer = bytearray()
        
        # Headers for separate streams
        self.mic_header = None
        self.sys_header = None
        
        # Threshold
        self.buffer_limit = 50000 
        
    async def run(self):
        print("Client connected")
        try:
            async for message in self.websocket:
                # Message is now a JSON string: { "source": "mic"|"sys", "data": "base64..." }
                try:
                    data = json.loads(message)
                    source = data.get('source')
                    base64_audio = data.get('data')
                    
                    if not source or not base64_audio:
                        continue
                        
                    audio_bytes = base64.b64decode(base64_audio.split(',')[1] if ',' in base64_audio else base64_audio)
                    
                    if source == 'mic':
                        if self.mic_header is None:
                            self.mic_header = audio_bytes
                            self.mic_buffer.extend(audio_bytes)
                        else:
                            self.mic_buffer.extend(audio_bytes)
                            
                        if len(self.mic_buffer) > self.buffer_limit:
                            await self.transcribe_stream('mic')
                            
                    elif source == 'sys':
                        if self.sys_header is None:
                            self.sys_header = audio_bytes
                            self.sys_buffer.extend(audio_bytes)
                        else:
                            self.sys_buffer.extend(audio_bytes)
                            
                        if len(self.sys_buffer) > self.buffer_limit:
                            await self.transcribe_stream('sys')
                            
                except json.JSONDecodeError:
                    # Fallback for legacy messages or errors
                    pass
                except Exception as e:
                    print(f"Error processing message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            print("Client disconnected")
            
    async def transcribe_stream(self, source):
        buffer = self.mic_buffer if source == 'mic' else self.sys_buffer
        header = self.mic_header if source == 'mic' else self.sys_header
        
        if not buffer:
            return

        temp_filename = f"temp_{source}.webm"
        wav_filename = f"temp_{source}.wav"
        
        # Prepend header if needed
        data_to_write = buffer
        if header and not buffer.startswith(header[:10]):
             data_to_write = header + buffer

        with open(temp_filename, "wb") as f:
            f.write(data_to_write)
            
        # Clear buffer
        if source == 'mic':
            self.mic_buffer = bytearray()
        else:
            self.sys_buffer = bytearray()
        
        try:
            # Convert to WAV using ffmpeg
            # -y: overwrite output file
            # -i: input file
            # -ar 16000: set audio sample rate to 16kHz
            # -ac 1: set audio channels to 1 (mono)
            # -c:a pcm_s16le: set audio codec to PCM 16-bit little endian
            command = [
                "ffmpeg", "-y", "-i", temp_filename, 
                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", 
                wav_filename
            ]
            
            # Run ffmpeg synchronously (it's fast for small chunks) or use asyncio.create_subprocess_exec
            # For simplicity and since we are in an async function, let's use subprocess.run but be mindful it blocks.
            # Ideally use asyncio.create_subprocess_exec for non-blocking.
            
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr_data = await process.communicate()
            
            if process.returncode != 0:
                print(f"Error converting {source} to WAV. ffmpeg return code: {process.returncode}")
                if stderr_data:
                    print(f"ffmpeg stderr: {stderr_data.decode()}")
                return

            # Transcribe
            print(f"Transcribing {source}...")
            with open(wav_filename, "rb") as audio_file:
                transcription = await client.audio.transcriptions.create(
                    model="whisper-1", 
                    file=audio_file,
                    language="es" 
                )
            
            text = transcription.text.strip()
            if not text:
                return
                
            label = "Agent" if source == 'mic' else "Customer"
            formatted_text = f"[{label}]: {text}"
            print(formatted_text)
            
            # Send Transcript
            await self.websocket.send(json.dumps({
                "type": "transcript",
                "text": formatted_text
            }))
            
            # Get Recommendation (RAG)
            if len(text) > 5:
                response = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Latest interaction:\n{formatted_text}\n\nProvide a recommendation for the Agent:"}
                    ]
                )
                recommendation = response.choices[0].message.content
                
                await self.websocket.send(json.dumps({
                    "type": "recommendation",
                    "text": recommendation
                }))
                
        except Exception as e:
            print(f"Error transcribing {source}: {e}")

async def handler(websocket):
    handler_instance = ConnectionHandler(websocket)
    await handler_instance.run()

async def main():
    async with websockets.serve(handler, "localhost", 8000):
        print("WebSocket server started on ws://localhost:8000")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
