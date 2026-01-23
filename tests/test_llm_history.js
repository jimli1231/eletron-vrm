const axios = require('axios');
const EventEmitter = require('events');
const LLMService = require('../src/main/llm');

// Mock response stream
class MockStream extends EventEmitter {}

// Mock axios
let capturedPayloads = [];
axios.post = async (url, data, config) => {
    // Deep copy data to capture state at time of call
    capturedPayloads.push(JSON.parse(JSON.stringify(data)));

    const stream = new MockStream();

    // Simulate async stream with a slight delay
    setTimeout(() => {
        const responseObj = { speech: "I heard you", emotion: "NEUTRAL" };
        const jsonString = JSON.stringify(responseObj);
        const escapedJsonString = jsonString.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const chunk = `data: { "candidates": [ { "content": { "parts": [ { "text": "${escapedJsonString}" } ] } } ] }\r\n`;

        stream.emit('data', chunk);
        stream.emit('end');
    }, 50);

    return {
        data: stream
    };
};

async function runTest() {
    console.log('Initializing LLMService...');
    const llm = new LLMService('fake-key');

    console.log('\n--- Test 1: First Message "Hello" ---');
    const p1 = new Promise(resolve => llm.once('end', resolve));
    llm.chat('Hello');
    await p1;

    const payload1 = capturedPayloads[0];
    console.log('Payload 1 contents length:', payload1.contents.length);
    if (payload1.contents.length === 1 && payload1.contents[0].parts[0].text === 'Hello') {
        console.log('PASS: First message sent correctly.');
    } else {
        console.log('FAIL: First message payload unexpected:', JSON.stringify(payload1.contents, null, 2));
    }

    console.log('\n--- Test 2: Second Message "How are you?" ---');
    const p2 = new Promise(resolve => llm.once('end', resolve));
    llm.chat('How are you?');
    await p2;

    const payload2 = capturedPayloads[1];
    console.log('Payload 2 contents length:', payload2.contents.length);

    // Verify history structure:
    // 1. User: Hello
    // 2. Model: I heard you
    // 3. User: How are you?

    if (payload2.contents.length === 3) {
        const msg1 = payload2.contents[0];
        const msg2 = payload2.contents[1];
        const msg3 = payload2.contents[2];

        if (msg1.role === 'user' && msg1.parts[0].text === 'Hello' &&
            msg2.role === 'model' && msg2.parts[0].text === 'I heard you' &&
            msg3.role === 'user' && msg3.parts[0].text === 'How are you?') {
            console.log('PASS: History is preserved correctly.');
        } else {
            console.log('FAIL: Content mismatch:', JSON.stringify(payload2.contents, null, 2));
        }
    } else {
        console.log('FAIL: Expected length 3, got', payload2.contents.length);
        console.log(JSON.stringify(payload2.contents, null, 2));
    }

    // Test 3: Clear History
    console.log('\n--- Test 3: Clear History ---');
    if (typeof llm.clearHistory === 'function') {
        llm.clearHistory();
        console.log('Called clearHistory()');

        const p3 = new Promise(resolve => llm.once('end', resolve));
        llm.chat('New start');
        await p3;

        const payload3 = capturedPayloads[2];
        if (payload3.contents.length === 1 && payload3.contents[0].parts[0].text === 'New start') {
             console.log('PASS: History was cleared.');
        } else {
             console.log('FAIL: History not cleared. Length:', payload3.contents.length);
        }
    } else {
        console.log('FAIL: clearHistory method does NOT exist.');
    }
}

runTest().catch(err => {
    console.error('Test execution failed:', err);
});
