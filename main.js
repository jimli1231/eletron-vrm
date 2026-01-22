require('dotenv').config({ override: true })
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const LLMService = require('./src/main/llm')

// Init LLM
const llm = new LLMService(process.env.GEMINI_API_KEY)


const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true, // Keep character visible
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // Simplified security for local VRM loading example
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    // IPC for mouse passthrough
    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win.setIgnoreMouseEvents(ignore, { forward: true })
    })

    // IPC for Chat
    ipcMain.on('chat:send', (event, message) => {
        console.log('User:', message)
        llm.chat(message)
    })

    // LLM Events -> Renderer
    llm.on('speech-delta', (delta) => {
        win.webContents.send('llm:speech-delta', delta)
    })

    llm.on('error', (err) => {
        console.error(err)
    })

    // Load from Vite dev server
    win.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
