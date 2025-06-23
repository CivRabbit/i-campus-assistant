const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onWakeWord: (callback) => ipcRenderer.on('trigger-voice-input', callback)
});

contextBridge.exposeInMainWorld('api', {
  askGPT: (prompt) => ipcRenderer.invoke('ask-gpt', prompt)
});