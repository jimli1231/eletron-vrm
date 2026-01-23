import * as THREE from 'three';

export class AnimationController {
    constructor(vrm) {
        this.vrm = vrm;
        this.currentAction = 'IDLE'; // IDLE, GREET, HAPPY, ANGRY
        this.actionTimer = 0;

        // Blink State
        this.blinkTimer = 0;
        this.blinkInterval = 4.0;
        this.isBlinking = false;
        this.blinkClosing = true;

        // Talk State
        this.isTalking = false;
    }

    update(deltaTime) {
        this.actionTimer += deltaTime;

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
                // We don't snap to 0 immediately to avoid glitches?
                // Actually, for a simple reset, snapping is safer than blending from unknown state without a complex mixer.
                // But to be "less stiff", we might rely on the next frame's LERP to fix it.
                // However, if the new action DOESN'T touch this bone, it stays 0.
                // Example: Greet uses RightArm. Idle uses RightArm.
                // If we switch Greet->Idle, Idle will LERP it.
                // If we have an action that ignores arms, they snap to 0. That is acceptable.
                // node.rotation.set(0, 0, 0);
            }
        });
    }

    // --- Actions ---

    _animateIdle(dt) {
        // Breathing: Sine wave on spine/chest
        const s = Math.sin(this.actionTimer * 1.0) * 0.05;
        this._rotateBone('spine', s, 'x');
        this._rotateBone('chest', s, 'x');

        // Arms: Relaxed at sides (A-Poseish / Natural Stand)
        // Target: Z = -1.2 (Right), 1.2 (Left)
        // We use LERP for smooth entry into Idle
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
