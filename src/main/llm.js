const axios = require('axios');
const { EventEmitter } = require('events');

class LLMService extends EventEmitter {
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        this.model = 'gemini-2.0-flash-exp'; // Updated to 2.0 Flash as requested
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    async chat(userMessage) {
        if (!this.apiKey) {
            this.emit('error', 'Missing API Key');
            return;
        }

        const url = `${this.baseUrl}/${this.model}:streamGenerateContent?key=${this.apiKey}`;

        const systemInstruction = `
            You are a helpful and lively anime character assistant.
            You MUST respond in strict JSON format.
            The JSON object must have the following fields:
            - "speech": (string) The text you want to say to the user. Keep it natural and spoken.
            - "emotion": (string) One of ["NEUTRAL", "JOY", "ANGRY", "SORROW", "FUN"].
            - "action": (object, optional) { "tool": "string", "args": object }.

            Available Tools:
            - "adjust_brightness": args: { "direction": "up" | "down" } (Controls macOS brightness)
            - "type_text": args: { "text": "string" } (Types text using keyboard)
            - "click_image": args: { "template": "filename.png" } (Finds and clicks an image on screen)

            Example:
            { "speech": "Okay, adjusting brightness!", "emotion": "JOY", "action": { "tool": "adjust_brightness", "args": { "direction": "up" } } }
        `;

        const payload = {
            contents: [{
                role: 'user',
                parts: [{ text: userMessage }]
            }],
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        try {
            const response = await axios.post(url, payload, {
                responseType: 'stream'
            });

            this.rawBuffer = '';
            this.accumulatedResponse = '';
            this.emittedSpeechLen = 0;
            this.emittedEmotion = null;
            this.speechValueStartIndex = -1;
            this.emotionValueStartIndex = -1;

            response.data.on('data', (chunk) => {
                const textChunk = chunk.toString();
                this.rawBuffer += textChunk;
                this.processRawBuffer();
            });

            response.data.on('end', () => {
                try {
                    // Attempt to parse the full JSON to get the action
                    // Clean up potential markdown code blocks if Gemini adds them
                    const cleanJson = this.accumulatedResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.action) {
                        this.emit('action', parsed.action);
                    }
                } catch (e) {
                    console.error('Error parsing final JSON for action:', e);
                }
                this.emit('end');
                this.rawBuffer = '';
            });

        } catch (error) {
            let errorMessage = error.message;
            if (error.response) {
                if (error.response.data && typeof error.response.data.on === 'function') {
                    try {
                        const errorBody = await new Promise((resolve, reject) => {
                            let data = '';
                            error.response.data.on('data', chunk => data += chunk.toString());
                            error.response.data.on('end', () => resolve(data));
                            error.response.data.on('error', reject);
                        });
                        errorMessage = `API Error (${error.response.status}): ${errorBody}`;
                    } catch (readError) {
                        errorMessage = `API Error (${error.response.status}) - Could not read body`;
                    }
                } else {
                    errorMessage = `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`;
                }
            }
            console.error('LLM Error:', errorMessage);
            this.emit('error', errorMessage);
        }
    }

    // Buffer for raw API stream to handle split tokens
    rawBuffer = '';
    // Buffer for the *content* of the response
    accumulatedResponse = '';
    emittedSpeechLen = 0;
    speechValueStartIndex = -1;
    emotionValueStartIndex = -1;

    processRawBuffer() {
        // Regex to hunt for "text": "..." content
        // This is heuristic but works for Gemini's standard stream format
        const regex = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
        let match;
        let lastIndex = 0;

        while ((match = regex.exec(this.rawBuffer)) !== null) {
            let contentFragment = match[1];
            // Unescape JSON string
            try {
                // JSON.parse to handle escaped quotes/newlines correctly
                contentFragment = JSON.parse(`"${contentFragment}"`);
            } catch (e) {
                // Incomplete escape sequence? 
            }
            this.accumulatedResponse += contentFragment;
            lastIndex = regex.lastIndex;

            this.parseAccumulatedSpeech();
        }

        // Remove processed parts from buffer to keep memory low
        if (lastIndex > 0) {
            this.rawBuffer = this.rawBuffer.slice(lastIndex);
        }
    }

    parseAccumulatedSpeech() {
        // Optimize: Find start index of speech value once
        if (this.speechValueStartIndex === -1) {
            const speechPreamble = /"speech":\s*"/g;
            const match = speechPreamble.exec(this.accumulatedResponse);
            if (match) {
                this.speechValueStartIndex = speechPreamble.lastIndex;
            }
        }

        if (this.speechValueStartIndex !== -1) {
            // Use sticky regex to match content from the known position
            const contentRegex = /((?:[^"\\]|\\.)*)/y;
            contentRegex.lastIndex = this.speechValueStartIndex + this.emittedSpeechLen;
            const match = contentRegex.exec(this.accumulatedResponse);

            if (match) {
                const newPart = match[1];
                if (newPart.length > 0) {
                    this.emit('speech-delta', newPart);
                    this.emittedSpeechLen += newPart.length;
                }
            }
        }

        // Optimize: Find start index of emotion value once
        if (this.emotionValueStartIndex === -1) {
            const emotionPreamble = /"emotion":\s*"/g;
            const match = emotionPreamble.exec(this.accumulatedResponse);
            if (match) {
                this.emotionValueStartIndex = emotionPreamble.lastIndex;
            }
        }

        if (this.emotionValueStartIndex !== -1) {
            const emotionRegex = /([^"]+)/y;
            emotionRegex.lastIndex = this.emotionValueStartIndex;
            const match = emotionRegex.exec(this.accumulatedResponse);
            if (match && match[1] !== this.emittedEmotion) {
                this.emittedEmotion = match[1];
                this.emit('emotion', this.emittedEmotion);
            }
        }
    }

    emittedEmotion = null;
}

module.exports = LLMService;
