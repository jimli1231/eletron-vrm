const { screen, mouse, keyboard, Key, centerOf, imageResource } = require('@nut-tree-fork/nut-js');
const os = require('os');

class AutomationService {
    constructor() {
        // Config defaults if needed
        keyboard.config.autoDelayMs = 10;
        this.platform = os.platform();
    }

    async clickImage(imagePath) {
        try {
            console.log(`Automation: Searching for image ${imagePath}...`);
            // Load imageResource. In nut.js v4+, this is the standard way.
            // We assume imagePath is absolute or relative to cwd.
            const target = await imageResource(imagePath);
            const region = await screen.find(target);
            await mouse.click(centerOf(region));
            console.log('Automation: Clicked image.');
            return true;
        } catch (error) {
            console.error('Automation Error (clickImage):', error);
            return false;
        }
    }

    async typeText(text) {
        try {
            console.log(`Automation: Typing text "${text}"...`);
            await keyboard.type(text);
            return true;
        } catch (error) {
            console.error('Automation Error (typeText):', error);
            return false;
        }
    }

    async adjustBrightness(direction) {
        try {
            console.log(`Automation: Adjusting brightness ${direction} on ${this.platform}...`);

            if (this.platform === 'darwin') {
                const key = direction === 'up' ? Key.F2 : Key.F1;
                await keyboard.pressKey(key);
                await keyboard.releaseKey(key);
            } else {
                console.warn('Brightness control not fully implemented for this OS via simple keys.');
                // Placeholder for Windows PowerShell WMI implementation
            }
            return true;
        } catch (error) {
            console.error('Automation Error (adjustBrightness):', error);
            return false;
        }
    }

    async setResolution(width, height) {
        try {
            console.log(`Automation: Setting resolution to ${width}x${height} on ${this.platform}...`);
            // Real implementation requires 'displayplacer' (Mac) or 'QRes' (Windows)
            // exec(`displayplacer "id:main res:${width}x${height}"`);
            return true;
        } catch (error) {
            console.error('Automation Error (setResolution):', error);
            return false;
        }
    }
}

module.exports = new AutomationService();
