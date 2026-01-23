import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';

export class AnimationController {
    constructor(vrm) {
        this.vrm = vrm;
        this.currentAction = 'IDLE'; // IDLE, GREET, HAPPY, ANGRY
        this.actionTimer = 0;

        // Animation Mixer for FBX
        this.mixer = new THREE.AnimationMixer(this.vrm.scene);
        this.idleAction = null;

        // Blink State
        this.blinkTimer = 0;
        this.blinkInterval = 4.0;
        this.isBlinking = false;
        this.blinkClosing = true;

        // Talk State
        this.isTalking = false;
    }

    loadIdleAnimation(url) {
        const loader = new FBXLoader();
        console.log('Loading FBX from:', url);

        loader.load(
            url,
            (asset) => {
                try {
                    console.log('FBX loaded, animations:', asset.animations.length);
                    const clip = asset.animations[0];
                    if (!clip) {
                        console.warn('No animation clip found in FBX');
                        return;
                    }

                    // Retargeting
                    const tracks = [];
                    // Basic Mixamo -> VRM Map
                    // Note: VRM uses "humanoid" bone names, but the actual Scene Graph nodes might have different names
                    // HOWEVER, we can access the nodes via vrm.humanoid.getNormalizedBoneNode(vrmBoneName).name

                    const mixamoVRMRigMap = {
                        mixamorigHips: 'hips',
                        mixamorigSpine: 'spine',
                        mixamorigSpine1: 'chest',
                        mixamorigSpine2: 'upperChest',
                        mixamorigNeck: 'neck',
                        mixamorigHead: 'head',
                        mixamorigLeftShoulder: 'leftShoulder',
                        mixamorigLeftArm: 'leftUpperArm',
                        mixamorigLeftForeArm: 'leftLowerArm',
                        mixamorigLeftHand: 'leftHand',
                        mixamorigRightShoulder: 'rightShoulder',
                        mixamorigRightArm: 'rightUpperArm',
                        mixamorigRightForeArm: 'rightLowerArm',
                        mixamorigRightHand: 'rightHand',
                        mixamorigLeftUpLeg: 'leftUpperLeg',
                        mixamorigLeftLeg: 'leftLowerLeg',
                        mixamorigLeftFoot: 'leftFoot',
                        mixamorigLeftToeBase: 'leftToes',
                        mixamorigRightUpLeg: 'rightUpperLeg',
                        mixamorigRightLeg: 'rightLowerLeg',
                        mixamorigRightFoot: 'rightFoot',
                        mixamorigRightToeBase: 'rightToes',
                    };

                    console.log('FBX clip tracks:', clip.tracks.length);

                    clip.tracks.forEach((track) => {
                        // track.name is like "mixamorigHips.position" or "mixamorigHips.quaternion"
                        const trackSplits = track.name.split('.');
                        const boneName = trackSplits[0];
                        const property = trackSplits[1];

                        const vrmBoneName = mixamoVRMRigMap[boneName];
                        if (vrmBoneName) {
                            const vrmNode = this.vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
                            if (vrmNode) {
                                const newTrackName = `${vrmNode.name}.${property}`;

                                // If it's position, we generally usually only apply it to Hips for root motion.
                                // Other bones usually just rotate.
                                // Scaling Mixamo position to VRM scale might be needed if they differ drastically.
                                // For now, let's include all.
                                if (property === 'position' && vrmBoneName !== 'hips') return; // Valid optimization: ignore translation for non-root bones

                                // Create new track with mapped name
                                // We clone the track to avoid mutating original if needed, but here we just create a new one
                                // Actually, TypedKeyframeTrack clone is easiest
                                const newTrack = track.clone();
                                newTrack.name = newTrackName;
                                tracks.push(newTrack);
                            }
                        }
                    });

                    console.log('Retargeted tracks:', tracks.length);

                    if (tracks.length > 0) {
                        const newClip = new THREE.AnimationClip('Idle', clip.duration, tracks);
                        this.idleAction = this.mixer.clipAction(newClip);
                        this.idleAction.play();
                        console.log('Idle Animation Loaded & Playing');
                    } else {
                        console.warn('No tracks matched VRM bones');
                    }
                } catch (e) {
                    console.error('Error processing FBX animation:', e);
                }
            },
            (progress) => {
                console.log('FBX loading progress:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
            },
            (error) => {
                console.error('Error loading FBX:', error);
            }
        );
    }

    update(deltaTime) {
        this.actionTimer += deltaTime;

        // Update Mixer (FBX Animation)
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }

        // 1. Body Animation State Machine
        switch (this.currentAction) {
            case 'IDLE':
                this._animateIdle(deltaTime);
                break;
            case 'GREET':
                this._animateGreet(deltaTime);
                break;
            case 'HAPPY':
                this._animateHappy(deltaTime);
                break;
            case 'ANGRY':
                this._animateAngry(deltaTime);
                break;
            default:
                this._animateIdle(deltaTime);
                break;
        }

        // 2. Face Animation (Independent)
        this._updateBlink(deltaTime);
        this._updateLips(deltaTime);
    }

    setAction(action) {
        console.log(`Switching Action: ${this.currentAction} -> ${action}`);
        if (this.currentAction === action) return;

        // Clean transition: Reset bones that might be "stuck"
        this._resetBones();

        this.currentAction = action;
        this.actionTimer = 0;

        // Logic: specific actions might fade out the idle mixer?
        // For now, Greet, Happy, Angry are procedural overrides.
        // We leave the mixer running underneath. 
        // Ideally we'd crossfade if we had FBX for those too.
    }

    setTalking(talking) {
        this.isTalking = talking;
    }

    _resetBones() {
        // Reset commonly manipulated bones to neutral (0,0,0)
        // This prevents "stiffness" where a bone stays rotated from a previous action
        const boneNames = [
            'rightUpperArm', 'rightLowerArm', 'leftUpperArm', 'leftLowerArm',
            'spine', 'chest', 'neck', 'head'
        ];

        boneNames.forEach(name => {
            const node = this.vrm.humanoid.getNormalizedBoneNode(name);
            if (node) {
                // node.rotation.set(0, 0, 0);
            }
        });
    }

    // --- Actions ---

    _animateIdle(dt) {
        // If FBX Idle is playing, we don't need the procedural breathing/arm sway
        if (this.idleAction && this.idleAction.isRunning()) {
            return;
        }

        // Breathing: Sine wave on spine/chest (Fallback)
        const s = Math.sin(this.actionTimer * 1.0) * 0.05;
        this._rotateBone('spine', s, 'x');
        this._rotateBone('chest', s, 'x');

        // Arms: Relaxed at sides (A-Poseish / Natural Stand)
        this._lerpBoneRotation('rightUpperArm', 'z', -1.2, dt * 5);
        this._lerpBoneRotation('leftUpperArm', 'z', 1.2, dt * 5);

        this._lerpBoneRotation('rightLowerArm', 'z', 0, dt * 5);
        this._lerpBoneRotation('leftLowerArm', 'z', 0, dt * 5);
    }

    _animateGreet(dt) {
        // Base: Idle-ish spine
        const s = Math.sin(this.actionTimer * 1.0) * 0.05;
        this._rotateBone('spine', s, 'x');

        // Right Arm: Wave
        const waveSpeed = 15.0;
        const wave = Math.sin(this.actionTimer * waveSpeed);

        // Raise Arm
        this._lerpBoneRotation('rightUpperArm', 'z', Math.PI * 0.85, dt * 10);
        this._lerpBoneRotation('rightUpperArm', 'x', 0.3, dt * 10); // Slight forward

        // Wave Forearm
        // Determine target rotation for forearm
        const targetForearmZ = Math.PI * 0.1 + wave * 0.3;
        // We can apply directly since wave is continuous
        const rForeArm = this.vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
        if (rForeArm) {
            rForeArm.rotation.z = targetForearmZ;
        }

        // Left Arm: Relaxed
        this._lerpBoneRotation('leftUpperArm', 'z', 1.2, dt * 5);

        // Auto-exit
        if (this.actionTimer > 3.0) {
            this.setAction('IDLE');
        }
    }

    _animateHappy(dt) {
        // Happy bounce
        const bounce = Math.abs(Math.sin(this.actionTimer * 8.0)) * 0.1;

        // Use Hips for position bounce if possible, but here we use rotation for simplicity
        // Spine tilt
        this._lerpBoneRotation('spine', 'x', bounce, dt * 10);

        // Arms up slightly?
        this._lerpBoneRotation('rightUpperArm', 'z', -2.5, dt * 5); // Raised side
        this._lerpBoneRotation('leftUpperArm', 'z', 2.5, dt * 5);

        this._lerpBoneRotation('rightLowerArm', 'z', -0.5, dt * 5);
        this._lerpBoneRotation('leftLowerArm', 'z', 0.5, dt * 5);

        // Auto-exit
        if (this.actionTimer > 3.0) {
            this.setAction('IDLE');
        }
    }

    _animateAngry(dt) {
        // Stiff spine
        this._lerpBoneRotation('spine', 'x', 0.2, dt * 5); // Leaning forward

        // Arms crossed-ish or stiff at sides
        this._lerpBoneRotation('rightUpperArm', 'z', -0.5, dt * 5);
        this._lerpBoneRotation('leftUpperArm', 'z', 0.5, dt * 5);

        // Hands fists? (No finger control yet, assumed default)

        if (this.actionTimer > 3.0) {
            this.setAction('IDLE');
        }
    }

    // --- Face Helpers ---

    _updateBlink(dt) {
        if (this.isBlinking) {
            const blinkSpeed = 10.0 * dt;
            if (this.blinkClosing) {
                const val = Math.min(1.0, this.vrm.expressionManager.getValue('blink') + blinkSpeed);
                this.vrm.expressionManager.setValue('blink', val);
                if (val >= 1.0) this.blinkClosing = false;
            } else {
                const val = Math.max(0.0, this.vrm.expressionManager.getValue('blink') - blinkSpeed);
                this.vrm.expressionManager.setValue('blink', val);
                if (val <= 0.0) {
                    this.isBlinking = false;
                    this.blinkTimer = 0;
                    this.blinkInterval = 2.0 + Math.random() * 4.0;
                }
            }
        } else {
            this.blinkTimer += dt;
            if (this.blinkTimer >= this.blinkInterval) {
                this.isBlinking = true;
                this.blinkClosing = true;
            }
        }
    }

    _updateLips(dt) {
        if (this.isTalking) {
            const talkValue = (Math.sin(this.actionTimer * 20.0) + 1.0) * 0.5;
            this.vrm.expressionManager.setValue('aa', talkValue);
        } else {
            const currentAa = this.vrm.expressionManager.getValue('aa');
            if (currentAa > 0) {
                this.vrm.expressionManager.setValue('aa', Math.max(0, currentAa - dt * 10.0));
            }
        }
    }

    // --- Bone Helpers ---

    _lerpBoneRotation(boneName, axis, targetVal, alpha) {
        const node = this.vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!node) return;
        node.rotation[axis] = THREE.MathUtils.lerp(node.rotation[axis], targetVal, alpha);
    }

    _rotateBone(boneName, value, axis = 'x') {
        const node = this.vrm.humanoid.getNormalizedBoneNode(boneName);
        if (node) {
            node.rotation[axis] = value;
        }
    }
}
