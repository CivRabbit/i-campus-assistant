const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();

const OpenAI = require('openai');
const { startWakeWordListener } = require('./wakeword');

let mainWindow = null;

// Use the API key from the environment OR fallback to a hardcoded one for builds
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-proj-...your-key-here..."
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

  startWakeWordListener(
    'Aj6DgB/tKnm+wPaNiCqAPyIFLttolGkGadeTELiCiO6sR1R8kUTXZQ==', // Replace with your actual key
    './resources/Hey-Iris_en_mac_v3_0_0.ppn',
    () => {
      if (mainWindow) {
        console.log("✅ Wake word detected, sending trigger to renderer.");
        mainWindow.webContents.send('trigger-voice-input');
      }
    }
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});