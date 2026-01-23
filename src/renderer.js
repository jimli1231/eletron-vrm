import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { AnimationController } from './AnimationController.js';

// Scene setup
const scene = new THREE.Scene();
// scene.background = new THREE.Color(0x333333); // Remove background color for transparency

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20.0);
camera.position.set(0.0, 1.0, 3.0); // 相机更近

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); // Transparent clear color
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Important for VRM: sRGB encoding
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
            outputBox.style.color = 'white';
        }
    }
});

// --- VOICE BUTTON START ---
const voiceBtn = document.createElement('button');
voiceBtn.innerText = '🎙️';
voiceBtn.style.marginLeft = '5px';
voiceBtn.style.padding = '8px';
voiceBtn.style.borderRadius = '5px';
voiceBtn.style.border = 'none';
voiceBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
voiceBtn.style.cursor = 'pointer';

// Mouse ignore logic
voiceBtn.addEventListener('mouseenter', () => {
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
});

// Speech Recognition Logic
let recognition = null;
if ('webkitSpeechRecognition' in window) {
    // eslint-disable-next-line no-undef
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceBtn.style.backgroundColor = '#ffcccc'; // Visual feedback
        outputBox.innerText = 'Listening...';
    };

    recognition.onend = () => {
        voiceBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
            inputBox.value = transcript;
            // Auto-send
            if (window.electronAPI) {
                window.electronAPI.sendChat(transcript);
                inputBox.value = '';
            }
        }
    };

    voiceBtn.addEventListener('mousedown', () => recognition.start());
    voiceBtn.addEventListener('mouseup', () => recognition.stop());
    // Also handle touch events for touchscreens
    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); recognition.start(); });
    voiceBtn.addEventListener('touchend', (e) => { e.preventDefault(); recognition.stop(); });

} else {
    voiceBtn.disabled = true;
    voiceBtn.title = "Speech recognition not supported";
}

// Wrap input and button in a row
const inputRow = document.createElement('div');
inputRow.style.display = 'flex';
inputRow.style.width = '100%';
inputRow.appendChild(inputBox);
inputRow.appendChild(voiceBtn);
chatContainer.appendChild(inputRow);
// --- VOICE BUTTON END ---

document.body.appendChild(chatContainer);

// --- CONTROL UI START ---
const controlContainer = document.createElement('div');
controlContainer.style.position = 'absolute';
controlContainer.style.top = '60px'; // Moved down to make room for toggle
controlContainer.style.right = '20px';
controlContainer.style.display = 'none'; // Default hidden as requested? "Hidden right button, button to open"
controlContainer.style.flexDirection = 'column';
controlContainer.style.gap = '5px';

const buttons = [
    { label: '对话', id: 'btn-talk' },
    { label: '模型对话', id: 'btn-model-talk' },
    { label: '打招呼', id: 'btn-greet' },
    { label: '开心', id: 'btn-happy' },
    { label: '生气', id: 'btn-angry' },
    { label: 'Idle', id: 'btn-idle' },
    { label: '双手', id: 'btn-hands' }
];

buttons.forEach(btn => {
    const button = document.createElement('button');
    button.innerText = btn.label;
    button.id = btn.id;
    button.style.padding = '5px 10px';
    button.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    button.style.border = 'none';
    button.style.borderRadius = '3px';
    button.style.cursor = 'pointer';

    // Ensure clicks work by disabling mouse ignore on hover
    button.addEventListener('mouseenter', () => {
        if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
    });

    controlContainer.appendChild(button);
});
document.body.appendChild(controlContainer);

// --- TOGGLE BUTTON START ---
const toggleBtn = document.createElement('button');
toggleBtn.innerText = '⚙️'; // Gear or Menu icon
toggleBtn.style.position = 'absolute';
toggleBtn.style.top = '20px';
toggleBtn.style.right = '20px';
toggleBtn.style.width = '30px';
toggleBtn.style.height = '30px';
toggleBtn.style.borderRadius = '50%';
toggleBtn.style.border = 'none';
toggleBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
toggleBtn.style.cursor = 'pointer';
toggleBtn.style.zIndex = '1000';

toggleBtn.addEventListener('mouseenter', () => {
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
});

toggleBtn.addEventListener('click', () => {
    const isHidden = controlContainer.style.display === 'none';
    controlContainer.style.display = isHidden ? 'flex' : 'none';
});

document.body.appendChild(toggleBtn);
// --- TOGGLE BUTTON END ---

// --- CONTROL UI END ---

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
        outputBox.insertAdjacentText('beforeend', delta);

        // TTS Buffering
        for (const char of delta) {
            sentenceBuffer += char;
            if (PUNCTUATION.test(char)) {
                speakText(sentenceBuffer);
                sentenceBuffer = "";
            }
        }
    });

    window.electronAPI.onLLMError((err) => {
        outputBox.innerText = `Error: ${err}`;
        outputBox.style.color = 'red';
        // Reset color after a while or leave it? Leave it for visibility.
        // But we should reset it on next chat.
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

        // --- GHOST MODE: Raycaster Init ---
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        // Move pointer off-screen initially
        pointer.x = 1000;
        pointer.y = 1000;
        let isHovering = false;

        // Optimization: Throttle raycasting
        let lastRaycastTime = 0;
        const RAYCAST_INTERVAL = 0.1; // Check every 100ms

        window.addEventListener('mousemove', (event) => {
            pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
            pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        // ----------------------------------

        // --- ANIMATION CONTROLLER ---
        const controller = new AnimationController(vrm);
        // Load Static Pose
        controller.loadPose('/src/assets/pose/Standing.json');

        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            const deltaTime = clock.getDelta();
            const elapsedTime = clock.getElapsedTime();

            // 1. Update VRM (SpringBone, etc.)
            vrm.update(deltaTime);

            // 2. Update Animation Controller (Body Actions + Face)
            controller.update(deltaTime);

            // --- GHOST MODE: Check Intersection ---
            // Optimization: Only raycast every RAYCAST_INTERVAL seconds
            if (elapsedTime - lastRaycastTime > RAYCAST_INTERVAL) {
                lastRaycastTime = elapsedTime;

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
            }
            // --------------------------------------

            renderer.render(scene, camera);
        }
        animate();

        // --- BUTTON LISTENERS ---
        document.getElementById('btn-talk').addEventListener('click', () => {
            inputBox.focus();
        });
        document.getElementById('btn-model-talk').addEventListener('click', () => {
            // Mock response
            speakText("你好，很高兴见到你。");
            window.setTalkingState(true);
        });
        document.getElementById('btn-greet').addEventListener('click', () => {
            controller.setAction('GREET');
        });
        document.getElementById('btn-happy').addEventListener('click', () => {
            window.setEmotion('JOY');
        });
        document.getElementById('btn-angry').addEventListener('click', () => {
            window.setEmotion('ANGRY');
        });
        document.getElementById('btn-idle').addEventListener('click', () => {
            controller.setAction('IDLE');
            window.setEmotion('NEUTRAL');
        });
        document.getElementById('btn-hands').addEventListener('click', () => {
            // Simulate a request to use automation
            if (window.electronAPI) {
                window.electronAPI.sendChat("Adjust the brightness up, please.");
            }
        });
        // ------------------------

        // Helpers to hook into TTS
        window.setTalkingState = (state) => {
            controller.setTalking(state);
        };

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

            // 1. Set Facial Expression
            if (currentExpression && currentExpression !== exprName) {
                vrm.expressionManager.setValue(currentExpression, 0);
            }
            vrm.expressionManager.setValue(exprName, 1.0);
            currentExpression = exprName;

            // 2. Set Body Action (Simple Mapping)
            if (emotion === 'JOY' || emotion === 'FUN') {
                controller.setAction('HAPPY');
            } else if (emotion === 'ANGRY') {
                controller.setAction('ANGRY');
            } else if (emotion === 'NEUTRAL') {
                controller.setAction('IDLE');
            }
        };

        if (window.electronAPI) {
            window.electronAPI.onEmotion((emotion) => {
                window.setEmotion(emotion);
            });
        }
        // -------------------------------------

        // --- DRAG LOGIC ---
        let isDragging = false;
        let isWindowDragging = false; // Alt+拖动移动窗口
        let lastMouseX = 0;
        let lastMouseY = 0;
        let modelRotationY = Math.PI; // 初始旋转角度（模型面向摄像机）

        renderer.domElement.addEventListener('mousedown', (e) => {
            // Only start drag if hovering model
            if (isHovering) {
                if (e.altKey) {
                    // Alt+左键 = 移动窗口
                    isWindowDragging = true;
                } else {
                    // 普通左键 = 旋转模型
                    isDragging = true;
                }
                lastMouseX = e.screenX;
                lastMouseY = e.screenY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            const dx = e.screenX - lastMouseX;
            const dy = e.screenY - lastMouseY;

            if (isDragging) {
                // 旋转模型（水平拖动控制 Y 轴旋转）
                modelRotationY += dx * 0.01;
                vrm.scene.rotation.y = modelRotationY;
                lastMouseX = e.screenX;
                lastMouseY = e.screenY;
            } else if (isWindowDragging && window.electronAPI) {
                // 移动窗口
                window.electronAPI.moveWindow(dx, dy);
                lastMouseX = e.screenX;
                lastMouseY = e.screenY;
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            isWindowDragging = false;
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

// --- RESOLUTION UI START ---
const resModal = document.createElement('div');
resModal.style.position = 'absolute';
resModal.style.top = '50%';
resModal.style.left = '50%';
resModal.style.transform = 'translate(-50%, -50%)';
resModal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
resModal.style.padding = '20px';
resModal.style.borderRadius = '10px';
resModal.style.display = 'none'; // Hidden by default
resModal.style.flexDirection = 'column';
resModal.style.gap = '10px';
resModal.style.color = 'white';
resModal.style.zIndex = '2000';

const resTitle = document.createElement('h3');
resTitle.innerText = 'Select Resolution';
resModal.appendChild(resTitle);

const resolutions = [
    { w: 1920, h: 1080, label: '1920 x 1080' },
    { w: 1440, h: 900, label: '1440 x 900' },
    { w: 1280, h: 720, label: '1280 x 720' },
    { w: 1024, h: 768, label: '1024 x 768' }
];

resolutions.forEach(res => {
    const btn = document.createElement('button');
    btn.innerText = res.label;
    btn.style.padding = '8px';
    btn.style.cursor = 'pointer';
    btn.onclick = () => {
        if (window.electronAPI) {
            window.electronAPI.setResolution(res.w, res.h);
            resModal.style.display = 'none';
        }
    };
    // Mouse ignore
    btn.addEventListener('mouseenter', () => {
        if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
    });
    resModal.appendChild(btn);
});

// Close button
const closeBtn = document.createElement('button');
closeBtn.innerText = 'Cancel';
closeBtn.style.padding = '8px';
closeBtn.style.marginTop = '10px';
closeBtn.onclick = () => {
    resModal.style.display = 'none';
};
closeBtn.addEventListener('mouseenter', () => {
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
});
resModal.appendChild(closeBtn);

document.body.appendChild(resModal);

// Listener
if (window.electronAPI) {
    window.electronAPI.onAction((action) => {
        if (action.tool === 'open_resolution_settings') {
            resModal.style.display = 'flex';
            // Ensure mouse can click it
            window.electronAPI.setIgnoreMouseEvents(false);
        }
    });
}
// --- RESOLUTION UI END ---
