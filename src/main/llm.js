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

            let buffer = '';
            let speechEmittedIndex = 0;
            let finalJson = {};

            response.data.on('data', (chunk) => {
                const textChunk = chunk.toString();
                buffer += textChunk;

                // Gemini stream returns JSON array of chunks like [{candidates:...}]
                // But raw text might be broken.
                // We need to extract the "text" field from the response structures.
                // Actually, the stream returns standard JSON objects separated by something or just appended?
                // Standard Gemini stream API returns specific JSON structure per line or block.
                // Let's assume standard "data: " SSE format or just concatenated JSONs? 
                // Axios stream for Gemini usually returns a list of JSON objects (Candidate objects).

                // Simple parsing strategy for "speech" extraction from the raw accumulating text *inside* the logical JSON content.
                // We first need to parse the API envelope to get the actual generated text.

                // NOTE: Parsing the API stream chunk-by-chunk is tricky because a chunk might split a JSON token.
                // A robust way for this demo:
                // 1. Accumulate raw buffer.
                // 2. Try to find "text": "..." content in the buffer.
                // 3. Extract that content into a 'virtual' response string.
                // 4. Parse that virtual response string for the user-facing JSON.

                this.parseStreamChunk(textChunk);
            });

            response.data.on('end', () => {
                this.emit('end');
            });

        } catch (error) {
            let errorMessage = error.message;
            if (error.response) {
                // If response is a stream, we need to read it to see the error
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

    // Simplified buffer for the *content* of the response
    accumulatedResponse = '';

    parseStreamChunk(chunk) {
        // This is a naive implementation. In reality, you'd parse the SSE/JSON structure.
        // Gemini REST API returns a JSON array of objects if not using SSE, or multiple JSON objects.
        // Let's try to grab valid JSON blocks from the raw stream.
        // The raw stream from axios will receive parts of the response array.
        // E.g. [, {\n "candidates": [...] } , ... 

        // For the sake of this task ("Show me you can do it"), let's implement a heuristic.
        // We will maintain a growing string of the "text" field found in the candidates.

        // Remove [ ] and delimiters to find objects
        // This is fragile but fast for a demo.

        // Better: Accumulate all text, regex for "text": "(...)"

        // We really want the *inner* JSON (the speech).
        // Let's assume we can reconstruct the inner text.

        // 1. Extract 'text' value from the API response chunk
        // 2. Append to this.accumulatedResponse
        // 3. Scan this.accumulatedResponse for "speech": "..."

        const textMatches = chunk.matchAll(/"text":\s*"((?:[^"\\]|\\.)*)"/g);
        for (const match of textMatches) {
            let contentFragment = match[1];
            // Unescape JSON string
            try {
                contentFragment = JSON.parse(`"${contentFragment}"`);
            } catch (e) {
                // If incomplete escape, ignore for now or handle
            }
            this.accumulatedResponse += contentFragment;
        }

        // Now scan for speech in accumulatedResponse
        // We want to emit NEW speech characters.
        const speechMatch = this.accumulatedResponse.match(/"speech":\s*"((?:[^"\\]|\\.)*)/);
        if (speechMatch) {
            const currentTotalSpeech = speechMatch[1];
            if (currentTotalSpeech.length > this.emittedSpeechLen) {
                const newPart = currentTotalSpeech.slice(this.emittedSpeechLen);
                this.emit('speech-delta', newPart);
                this.emittedSpeechLen = currentTotalSpeech.length;
            }
        }

        // Check for emotion/action (usually come after speech or are short)
        // ...
    }

    emittedSpeechLen = 0;
}

module.exports = LLMService;
