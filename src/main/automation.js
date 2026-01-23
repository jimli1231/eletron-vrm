const { screen, mouse, keyboard, Key, centerOf, imageResource } = require('@nut-tree-fork/nut-js');

class AutomationService {
    constructor() {
        // Config defaults if needed
        keyboard.config.autoDelayMs = 10;
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
            const key = direction === 'up' ? Key.F2 : Key.F1;
            console.log(`Automation: Adjusting brightness ${direction} (Key: ${key})...`);
            await keyboard.pressKey(key);
            await keyboard.releaseKey(key);
            return true;
        } catch (error) {
            console.error('Automation Error (adjustBrightness):', error);
            return false;
        }
    }
}

module.exports = new AutomationService();
