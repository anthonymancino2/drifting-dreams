import { StandardGamepadBindings } from './InputActions.js';
import { applyDeadZone, responseCurve } from '../utils/MathUtils.js';

const STEER_DEADZONE = 0.12;
const TRIGGER_DEADZONE = 0.05;
const STEER_CURVE_EXPONENT = 1.8;

// Polls navigator.getGamepads() each frame. Works for PS4/PS5/Xbox/Switch Pro/generic
// controllers as long as the browser reports mapping === "standard" (button positions
// are then normalized the same way across brands).
export default class GamepadInput {
    constructor(bindings = StandardGamepadBindings) {
        this.bindings = bindings;
        this.gamepadIndex = null;
        this.lastActivityTime = 0;
        this.pressedLastFrame = new Set();
        this.deadZone = STEER_DEADZONE;
        this.triggerDeadZone = TRIGGER_DEADZONE;
        this.sensitivity = 1.0;
        this.invertSteering = false;
        this.vibrationEnabled = true;

        window.addEventListener('gamepadconnected', (e) => {
            if (this.gamepadIndex === null && e.gamepad.mapping === 'standard') {
                this.gamepadIndex = e.gamepad.index;
            }
            this.onConnected?.(e.gamepad);
        });
        window.addEventListener('gamepaddisconnected', (e) => {
            if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
            this.onDisconnected?.(e.gamepad);
        });
    }

    getActiveGamepad() {
        if (this.gamepadIndex === null) return null;
        const pads = navigator.getGamepads();
        return pads[this.gamepadIndex] || null;
    }

    isConnected() {
        return this.getActiveGamepad() !== null;
    }

    update(dt, actionsOut) {
        const pad = this.getActiveGamepad();
        if (!pad) {
            actionsOut.steer = 0;
            actionsOut.throttle = 0;
            actionsOut.brake = 0;
            return false;
        }

        const b = this.bindings;
        let rawSteer = applyDeadZone(pad.axes[b.steerAxis] || 0, this.deadZone);
        rawSteer = responseCurve(rawSteer, STEER_CURVE_EXPONENT) * this.sensitivity;
        if (this.invertSteering) rawSteer *= -1;

        const rawAccel = applyDeadZone(pad.buttons[b.accelerateButton]?.value || 0, this.triggerDeadZone);
        const rawBrake = applyDeadZone(pad.buttons[b.brakeButton]?.value || 0, this.triggerDeadZone);

        actionsOut.steer = rawSteer;
        actionsOut.throttle = rawAccel;
        actionsOut.brake = rawBrake;
        actionsOut.drift = !!pad.buttons[b.drift]?.pressed;
        actionsOut.boost = !!pad.buttons[b.boost]?.pressed;
        actionsOut.usePowerup = !!pad.buttons[b.usePowerup]?.pressed;
        actionsOut.changeCamera = !!pad.buttons[b.changeCamera]?.pressed;
        actionsOut.lookBack = !!pad.buttons[b.lookBack]?.pressed;
        actionsOut.secondaryAbility = !!pad.buttons[b.secondaryAbility]?.pressed;
        actionsOut.respawn = !!pad.buttons[b.respawn]?.pressed;
        actionsOut.pause = !!pad.buttons[b.pause]?.pressed;

        const meaningfulInput = Math.abs(rawSteer) > 0.02 || rawAccel > 0.02 || rawBrake > 0.02 ||
            actionsOut.drift || actionsOut.boost || actionsOut.usePowerup || actionsOut.changeCamera ||
            actionsOut.pause;
        if (meaningfulInput) this.lastActivityTime = performance.now();
        return true;
    }

    hasRecentActivity(withinMs) {
        return (performance.now() - this.lastActivityTime) < withinMs;
    }

    vibrate({ duration = 100, weakMagnitude = 0.3, strongMagnitude = 0.5 } = {}) {
        if (!this.vibrationEnabled) return;
        const pad = this.getActiveGamepad();
        pad?.vibrationActuator?.playEffect?.('dual-rumble', {
            duration, weakMagnitude, strongMagnitude, startDelay: 0
        }).catch(() => {});
    }

    getInfo() {
        const pad = this.getActiveGamepad();
        if (!pad) return null;
        return { id: pad.id, index: pad.index, mapping: pad.mapping, axes: [...pad.axes], buttons: pad.buttons.map(b => ({ pressed: b.pressed, value: b.value })) };
    }
}
