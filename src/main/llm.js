const axios = require('axios');
const { EventEmitter } = require('events');

// Regex constants
const TEXT_REGEX = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
const SPEECH_REGEX = /"speech":\s*"((?:[^"\\]|\\.)*)/;
const EMOTION_REGEX = /"emotion":\s*"([^"]+)"/;

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

            Example:
            { "speech": "Hello! It's great to see you!", "emotion": "JOY" }
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

            response.data.on('data', (chunk) => {
                const textChunk = chunk.toString();
                this.rawBuffer += textChunk;
                this.processRawBuffer();
            });

            response.data.on('end', () => {
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

    processRawBuffer() {
        // Regex to hunt for "text": "..." content
        // This is heuristic but works for Gemini's standard stream format
        TEXT_REGEX.lastIndex = 0;
        let match;
        let lastIndex = 0;

        while ((match = TEXT_REGEX.exec(this.rawBuffer)) !== null) {
            let contentFragment = match[1];
            // Unescape JSON string
            try {
                // JSON.parse to handle escaped quotes/newlines correctly
                contentFragment = JSON.parse(`"${contentFragment}"`);
            } catch (e) {
                // Incomplete escape sequence? 
            }
            this.accumulatedResponse += contentFragment;
            lastIndex = TEXT_REGEX.lastIndex;

            this.parseAccumulatedSpeech();
        }

        // Remove processed parts from buffer to keep memory low
        if (lastIndex > 0) {
            this.rawBuffer = this.rawBuffer.slice(lastIndex);
        }
    }

    parseAccumulatedSpeech() {
        // Scan for speech in accumulatedResponse
        const speechMatch = this.accumulatedResponse.match(SPEECH_REGEX);
        if (speechMatch) {
            const currentTotalSpeech = speechMatch[1];
            if (currentTotalSpeech.length > this.emittedSpeechLen) {
                const newPart = currentTotalSpeech.slice(this.emittedSpeechLen);
                this.emit('speech-delta', newPart);
                this.emittedSpeechLen = currentTotalSpeech.length;
            }
        }

        // Scan for emotion
        const emotionMatch = this.accumulatedResponse.match(EMOTION_REGEX);
        if (emotionMatch && emotionMatch[1] !== this.emittedEmotion) {
            this.emittedEmotion = emotionMatch[1];
            this.emit('emotion', this.emittedEmotion);
        }
    }

    emittedEmotion = null;
}

module.exports = LLMService;
