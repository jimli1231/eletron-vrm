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

                    // Bone name mapping: Mixamo -> VRM
                    // Flexible mapping that handles "mixamorig:" prefix or standard names
                    const mapBoneName = (name) => {
                        let cleanName = name.replace('mixamorig', '').replace(':', '').replace('_', '');
                        const boneMap = {
                            'Hips': 'hips',
                            'Spine': 'spine',
                            'Spine1': 'chest',
                            'Spine2': 'upperChest',
                            'Neck': 'neck',
                            'Head': 'head',
                            'LeftShoulder': 'leftShoulder',
                            'LeftArm': 'leftUpperArm',
                            'LeftForeArm': 'leftLowerArm',
                            'LeftHand': 'leftHand',
                            'RightShoulder': 'rightShoulder',
                            'RightArm': 'rightUpperArm',
                            'RightForeArm': 'rightLowerArm',
                            'RightHand': 'rightHand',
                            'LeftUpLeg': 'leftUpperLeg',
                            'LeftLeg': 'leftLowerLeg',
                            'LeftFoot': 'leftFoot',
                            'LeftToeBase': 'leftToes',
                            'RightUpLeg': 'rightUpperLeg',
                            'RightLeg': 'rightLowerLeg',
                            'RightFoot': 'rightFoot',
                            'RightToeBase': 'rightToes',
                        };
                        return boneMap[cleanName];
                    };

                    const tracks = [];

                    clip.tracks.forEach((track) => {
                        const trackSplits = track.name.split('.');
                        const boneName = trackSplits[0];
                        const property = trackSplits[1];

                        const vrmBoneName = mapBoneName(boneName);
                        if (vrmBoneName) {
                            const vrmNode = this.vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
                            if (vrmNode) {
                                const newTrackName = `${vrmNode.name}.${property}`;

                                // RETARGETING LOGIC

                                // 1. Rotation (Quaternion)
                                if (property === 'quaternion') {
                                    // For now, we apply rotation directly. 
                                    // If Mixamo is T-pose and VRM is T-pose, this usually works reasonably well.
                                    // If there are offset issues, we might need the "rest pose" compensation logic again.
                                    // Let's start with direct mapping as it's cleaner, but keep the track valid.
                                    const newTrack = track.clone();
                                    newTrack.name = newTrackName;
                                    tracks.push(newTrack);
                                }
                                // 2. Position (Vector3) - ONLY for Hips (Root)
                                else if (property === 'position' && vrmBoneName === 'hips') {
                                    // Scale Correction: Mixamo (cm) -> VRM (m)
                                    // Usually requires scaling by 0.01
                                    const scale = 0.01;
                                    const newValues = new Float32Array(track.values.length);
                                    for (let i = 0; i < track.values.length; i++) {
                                        newValues[i] = track.values[i] * scale;
                                    }
                                    const newTrack = new THREE.VectorKeyframeTrack(
                                        newTrackName,
                                        track.times,
                                        newValues
                                    );
                                    tracks.push(newTrack);
                                }
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
                // console.log('FBX loading progress:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
            },
            (error) => {
                console.error('Error loading FBX:', error);
            }
        );
    }

    loadPose(url) {
        console.log('Loading Pose from:', url);
        fetch(url)
            .then(res => res.json())
            .then(json => {
                if (!json.data) {
                    console.warn('Invalid pose file format');
                    return;
                }
                const poseData = json.data;
                // Apply rotations
                Object.keys(poseData).forEach(boneName => {
                    const node = this.vrm.humanoid.getNormalizedBoneNode(boneName);
                    if (node) {
                        const rot = poseData[boneName].rotation; // [x, y, z, w]
                        node.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
                    }
                });
                console.log('Pose applied:', json.name);
            })
            .catch(err => console.error('Error loading pose:', err));
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
        // Breathing: Sine wave on spine/chest
        // const s = Math.sin(this.actionTimer * 1.0) * 0.05;
        // this._rotateBone('spine', s, 'x');
        // this._rotateBone('chest', s, 'x');

        // // Arms: Relaxed at sides (A-Poseish / Natural Stand)
        // this._lerpBoneRotation('rightUpperArm', 'z', -1.2, dt * 5);
        // this._lerpBoneRotation('leftUpperArm', 'z', 1.2, dt * 5);

        // this._lerpBoneRotation('rightLowerArm', 'z', 0, dt * 5);
        // this._lerpBoneRotation('leftLowerArm', 'z', 0, dt * 5);
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
