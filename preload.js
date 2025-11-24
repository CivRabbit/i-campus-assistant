const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onWakeWord: (callback) => ipcRenderer.on('trigger-voice-input', callback)
});

contextBridge.exposeInMainWorld('api', {
  askGPT: (prompt) => ipcRenderer.invoke('ask-gpt', prompt),
  elevenLabsTTS: (text, voiceId) => ipcRenderer.invoke('eleven-labs-tts', { text, voiceId })
});