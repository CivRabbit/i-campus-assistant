const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
require('dotenv').config();

const OpenAI = require('openai');
const { startWakeWordListener } = require('./wakeword');

let mainWindow = null;
let whisperProcess = null;

// Use the API key from the environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the built Vite index.html
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

function startWhisperServer() {
  const possiblePythonPaths = [
    path.join(__dirname, '.venv', 'bin', 'python'),
    path.join(__dirname, 'venv', 'bin', 'python'),
    'python3',
    'python'
  ];

  let pythonPath = 'python'; // Default fallback
  for (const p of possiblePythonPaths) {
    if (fs.existsSync(p)) {
      pythonPath = p;
      break;
    }
  }

  const scriptPath = path.join(__dirname, 'whisper-server', 'whisper_server.py');
  console.log(`Starting Whisper Server using: ${pythonPath} ${scriptPath}`);

  whisperProcess = spawn(pythonPath, [scriptPath]);

  whisperProcess.stdout.on('data', (data) => {
    console.log(`[Whisper]: ${data}`);
  });

  whisperProcess.stderr.on('data', (data) => {
    console.error(`[Whisper Error]: ${data}`);
  });

  whisperProcess.on('close', (code) => {
    console.log(`Whisper server exited with code ${code}`);
  });
}

ipcMain.handle('eleven-labs-tts', async (event, { text, voiceId }) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voice = voiceId || "1hlpeD1ydbI2ow0Tt3EW";

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.4, similarity_boost: 0.75 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API Error: ${response.status} ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return arrayBuffer;
  } catch (error) {
    console.error('ElevenLabs Handler Error:', error);
    throw error;
  }
});

ipcMain.handle('ask-gpt', async (event, prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Error:', error.response?.status, error.response?.data || error.message);
    return 'Sorry, I had trouble responding.';
  }
});

app.whenReady().then(() => {
  createWindow();
  startWhisperServer();

  startWakeWordListener(
    process.env.PORCUPINE_ACCESS_KEY,
    './resources/Hey-Iris_en_mac_v3_0_0.ppn',
    () => {
      if (mainWindow) {
        console.log("✅ Wake word detected, sending trigger to renderer.");
        mainWindow.webContents.send('trigger-voice-input');
      }
    }
  );
});

app.on('will-quit', () => {
  if (whisperProcess) {
    console.log('Killing Whisper Server...');
    whisperProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});