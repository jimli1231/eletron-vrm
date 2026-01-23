require('dotenv').config({ override: true })
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const LLMService = require('./src/main/llm')
const automation = require('./src/main/automation')

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

    ipcMain.on('move-window', (event, deltaX, deltaY) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        const [x, y] = win.getPosition()
        win.setPosition(x + deltaX, y + deltaY)
    })

    // IPC for Resolution Control
    ipcMain.on('set-resolution', (event, w, h) => {
        automation.setResolution(w, h)
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

    llm.on('action', async (action) => {
        console.log('LLM Action:', action)
        // Forward all actions to renderer (useful for UI triggers)
        win.webContents.send('llm:action', action)

        // Execute backend automation
        if (action.tool === 'adjust_brightness') {
            await automation.adjustBrightness(action.args.direction)
        } else if (action.tool === 'type_text') {
            await automation.typeText(action.args.text)
        } else if (action.tool === 'click_image') {
            await automation.clickImage(action.args.template)
        }
        // open_resolution_settings is handled by Renderer via the forwarded event
    })

    // Auto-test
    setTimeout(() => {
        console.log('\n--- Sending Auto-Test Message: "你好" ---');
        llm.chat('你好');
    }, 5000); // Wait 5s for app to settle

    llm.on('error', (err) => {
        console.error(err)
        win.webContents.send('llm:error', err.toString())
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
