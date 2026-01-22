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

if (window.electronAPI) {
    window.electronAPI.onSpeechDelta((delta) => {
        outputBox.innerText += delta;
        // console.log('Speech Delta:', delta);
    });
}
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

        // Animation Loop
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);
            const deltaTime = clock.getDelta();
            vrm.update(deltaTime);

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
