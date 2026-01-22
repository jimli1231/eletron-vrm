import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// Scene setup
const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x333333); // Remove background color for transparency

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, 1.0, 5.0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); // Transparent clear color
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Important for VRM: sRGB encoding
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// --- CHAT UI START ---
const chatContainer = document.createElement('div');
chatContainer.style.position = 'absolute';
chatContainer.style.bottom = '20px';
chatContainer.style.left = '50%';
chatContainer.style.transform = 'translateX(-50%)';
chatContainer.style.display = 'flex';
chatContainer.style.flexDirection = 'column';
chatContainer.style.alignItems = 'center';
chatContainer.style.width = '300px';

const outputBox = document.createElement('div');
outputBox.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
outputBox.style.color = 'white';
outputBox.style.padding = '10px';
outputBox.style.borderRadius = '5px';
outputBox.style.marginBottom = '10px';
outputBox.style.width = '100%';
outputBox.style.minHeight = '20px';
outputBox.style.fontFamily = 'Arial, sans-serif';
outputBox.innerText = 'Listening...';
chatContainer.appendChild(outputBox);

const inputBox = document.createElement('input');
inputBox.type = 'text';
inputBox.placeholder = 'Say something...';
inputBox.style.width = '100%';
inputBox.style.padding = '8px';
inputBox.style.borderRadius = '5px';
inputBox.style.border = 'none';
inputBox.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';

// Ensure input captures mouse events
inputBox.addEventListener('mouseenter', () => {
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
});
inputBox.addEventListener('mouseleave', () => {
    // Only revert to passthrough if not hovering model (simplified logic, ideally check both)
    // For now, let's rely on the user moving mouse out of the box area
});

inputBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = inputBox.value;
        if (text && window.electronAPI) {
            window.electronAPI.sendChat(text);
            inputBox.value = '';
            outputBox.innerText = ''; // Clear prev output
        }
    }
});

chatContainer.appendChild(inputBox);
document.body.appendChild(chatContainer);

// --- TTS LOGIC START ---
const synth = window.speechSynthesis;
let voice = null;
let sentenceBuffer = "";

// Simple heuristic to split sentences
// Characters that likely end a sentence or pause
const PUNCTUATION = /[.。!！?？,，;；:\n]/;

function loadVoice() {
    // Try to find a good Chinese voice or fallback to default
    const voices = synth.getVoices();
    voice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN')) || voices[0];
    console.log('Selected Voice:', voice ? voice.name : 'Default');
}
loadVoice();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoice;
}

function speakText(text) {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;

    utterance.onstart = () => {
        if (window.setTalkingState) window.setTalkingState(true);
    };
    utterance.onend = () => {
        if (window.setTalkingState) window.setTalkingState(false);
    };

    synth.speak(utterance);
}

if (window.electronAPI) {
    window.electronAPI.onSpeechDelta((delta) => {
        outputBox.innerText += delta;

        // TTS Buffering
        for (const char of delta) {
            sentenceBuffer += char;
            if (PUNCTUATION.test(char)) {
                speakText(sentenceBuffer);
                sentenceBuffer = "";
            }
        }
    });
}
// --- TTS LOGIC END ---
// --- CHAT UI END ---

// Light
const light = new THREE.DirectionalLight(0xffffff, 1.0); // Converted intensity to 1.0 as standard
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// VRM Loader
const loader = new GLTFLoader();
loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
});

// Load local asset
// Note: In Vite dev, /src/assets/xi.vrm serves the file. In production, we might need adjustments.
const vrmUrl = './src/assets/xi.vrm';

loader.load(
    vrmUrl,
    (gltf) => {
        const vrm = gltf.userData.vrm;

        // Disable frustum culling to prevent model disappearance
        vrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
        });

        scene.add(vrm.scene);
        console.log('VRM Loaded!');

        // Look straight ahead
        vrm.humanoid.getNormalizedBoneNode('neck').rotation.y = Math.PI;

        // --- GHOST MODE: Raycaster Init ---
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        // Move pointer off-screen initially
        pointer.x = 1000;
        pointer.y = 1000;
        let isHovering = false;

        window.addEventListener('mousemove', (event) => {
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        // ----------------------------------

        // --- ANIMATION STATE ---
        const clock = new THREE.Clock();

        // Blink State
        let blinkTimer = 0;
        let blinkInterval = 4.0; // Seconds between blinks
        let isBlinking = false;
        let blinkClosing = true;

        // Lip Sync State
        let isTalking = false;

        function animate() {
            requestAnimationFrame(animate);
            const deltaTime = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();

            // 1. Update VRM (SpringBone, etc.)
            vrm.update(deltaTime);

            // 2. BREATHING (Sine wave on chest/spine)
            // A subtle sine wave on curvature
            const s = Math.sin(elapsedTime * 1.0) * 0.05;
            vrm.humanoid.getNormalizedBoneNode('spine').rotation.x = s;
            vrm.humanoid.getNormalizedBoneNode('chest').rotation.x = s;

            // 3. BLINKING (Procedural)
            if (isBlinking) {
                // simple linear blink
                const blinkSpeed = 10.0 * deltaTime;
                if (blinkClosing) {
                    vrm.expressionManager.setValue('blink', Math.min(1.0, vrm.expressionManager.getValue('blink') + blinkSpeed));
                    if (vrm.expressionManager.getValue('blink') >= 1.0) blinkClosing = false;
                } else {
                    vrm.expressionManager.setValue('blink', Math.max(0.0, vrm.expressionManager.getValue('blink') - blinkSpeed));
                    if (vrm.expressionManager.getValue('blink') <= 0.0) {
                        isBlinking = false;
                        blinkTimer = 0;
                        blinkInterval = 2.0 + Math.random() * 4.0; // Random next blink
                    }
                }
            } else {
                blinkTimer += deltaTime;
                if (blinkTimer >= blinkInterval) {
                    isBlinking = true;
                    blinkClosing = true;
                }
            }

            // 4. LIP SYNC (Pseudo)
            if (isTalking) {
                // Talk loop: open/close mouth rapidly
                const talkValue = (Math.sin(elapsedTime * 20.0) + 1.0) * 0.5; // 0 to 1
                vrm.expressionManager.setValue('aa', talkValue);
                // vrm.expressionManager.setValue('ih', talkValue * 0.3);
            } else {
                // Smoothly close mouth
                const currentAa = vrm.expressionManager.getValue('aa');
                if (currentAa > 0) {
                    vrm.expressionManager.setValue('aa', Math.max(0, currentAa - deltaTime * 5.0));
                }
            }

            // --- GHOST MODE: Check Intersection ---
            raycaster.setFromCamera(pointer, camera);
            const intersects = raycaster.intersectObjects(vrm.scene.children, true);
            const currentlyHovering = intersects.length > 0;

            if (currentlyHovering !== isHovering) {
                isHovering = currentlyHovering;
                // Hovering = Interactive (ignoreMouse = false)
                // Not Hovering = Passthrough (ignoreMouse = true)
                if (window.electronAPI && window.electronAPI.setIgnoreMouseEvents) {
                    window.electronAPI.setIgnoreMouseEvents(!isHovering);
                }
            }
            // --------------------------------------

            renderer.render(scene, camera);
        }
        animate();

        // Helpers to hook into TTS
        // We override the global speakText to toggle isTalking
        // BUT speakText is defined outside this scope. 
        // We need to expose a setter or event logic.
        // A simple hack: Attach to window or use CustomEvent.
        window.setTalkingState = (state) => { isTalking = state; };

        // --- EMOTION -> EXPRESSION MAPPING ---
        const emotionToExpression = {
            'JOY': 'happy',
            'FUN': 'happy',
            'ANGRY': 'angry',
            'SORROW': 'sad',
            'NEUTRAL': 'relaxed'
        };
        let currentExpression = null;

        window.setEmotion = (emotion) => {
            const exprName = emotionToExpression[emotion] || 'neutral';
            if (currentExpression && currentExpression !== exprName) {
                vrm.expressionManager.setValue(currentExpression, 0);
            }
            vrm.expressionManager.setValue(exprName, 1.0);
            currentExpression = exprName;
        };

        if (window.electronAPI) {
            window.electronAPI.onEmotion((emotion) => {
                window.setEmotion(emotion);
            });
        }
        // -------------------------------------

        // --- DRAG LOGIC ---
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        renderer.domElement.addEventListener('mousedown', (e) => {
            // Only start drag if hovering model
            if (isHovering) {
                isDragging = true;
                lastMouseX = e.screenX;
                lastMouseY = e.screenY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging && window.electronAPI) {
                const dx = e.screenX - lastMouseX;
                const dy = e.screenY - lastMouseY;
                window.electronAPI.moveWindow(dx, dy);
                lastMouseX = e.screenX;
                lastMouseY = e.screenY;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
        // ------------------
    },
    (progress) => console.log('Loading...', 100.0 * (progress.loaded / progress.total), '%'),
    (error) => console.error('Error loading VRM:', error)
);

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
