// Since we use contextIsolation: false for this demo, we can access ipcRenderer directly in renderer,
// but it's good practice to expose safe APIs or just keep this file simple.
// For this specific 'ghost mode' task, we will expose a helper on window if needed,
// but given contextIsolation: false, we can import ipcRenderer in renderer.js directly if we enable nodeIntegration.
// Let's stick to the plan: expose a simple valid bridge or just add it to window for clarity.

const { ipcRenderer } = require('electron')

window.electronAPI = {
    setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
    sendChat: (msg) => ipcRenderer.send('chat:send', msg),
    clearHistory: () => ipcRenderer.send('chat:clear-history'),
    onSpeechDelta: (callback) => ipcRenderer.on('llm:speech-delta', (event, delta) => callback(delta)),
    moveWindow: (dx, dy) => ipcRenderer.send('move-window', dx, dy),
    onEmotion: (callback) => ipcRenderer.on('llm:emotion', (event, emotion) => callback(emotion)),
    onLLMError: (callback) => ipcRenderer.on('llm:error', (event, err) => callback(err))
}

window.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
})
