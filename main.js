require('dotenv').config({ override: true })
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const LLMService = require('./src/main/llm')

// Init LLM
console.log('Main Process API Key:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'UNDEFINED')
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

    // IPC for Drag Window
    ipcMain.on('start-drag', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        // Enable drag behavior on frameless window
        // Note: Actually moving the window requires mouse tracking. 
        // A simpler approach: use -webkit-app-region: drag in CSS for a specific element.
        // But for VRM click, we'll trigger a manual drag simulation here.
        // Actually, BrowserWindow doesn't have a startDrag method for window position.
        // We'll use win.setPosition() based on mouse delta in renderer. 
        // For now, let's expose a 'move-window' IPC.
    })

    ipcMain.on('move-window', (event, deltaX, deltaY) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const [x, y] = win.getPosition()
        win.setPosition(x + deltaX, y + deltaY)
    })

    // IPC for Chat
    ipcMain.on('chat:send', (event, message) => {
        console.log('User:', message)
        llm.chat(message)
    })

    // LLM Events -> Renderer
    llm.on('speech-delta', (delta) => {
        process.stdout.write(delta); // Print to terminal so we can see it
        win.webContents.send('llm:speech-delta', delta)
    })

    llm.on('emotion', (emotion) => {
        win.webContents.send('llm:emotion', emotion)
    })

    // Auto-test
    setTimeout(() => {
        console.log('\n--- Sending Auto-Test Message: "你好" ---');
        llm.chat('你好');
    }, 5000); // Wait 5s for app to settle

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
