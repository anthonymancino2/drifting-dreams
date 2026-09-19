import { DefaultKeyboardBindings } from './InputActions.js';

const STEER_RAMP_UP = 6.0;     // units/sec toward full lock
const STEER_RETURN = 9.0;      // units/sec back toward center
const THROTTLE_RAMP = 8.0;
const BRAKE_RAMP = 10.0;

// Converts digital key presses into smoothed analog-ish output so keyboard driving
// feels closer to a controller than an instant on/off toggle.
export default class KeyboardInput {
    constructor(bindings = DefaultKeyboardBindings) {
        this.bindings = bindings;
        this.keysDown = new Set();
        this.steerValue = 0;
        this.throttleValue = 0;
        this.brakeValue = 0;
        this.lastActivityTime = 0;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    _preventBrowserDefaults(code) {
        const gameplayCodes = new Set([
            ...this.bindings.accelerate, ...this.bindings.brake,
            ...this.bindings.left, ...this.bindings.right,
            ...this.bindings.drift, ...this.bindings.boost,
            ...this.bindings.usePowerup, ...this.bindings.changeCamera,
            ...this.bindings.lookBack, ...this.bindings.respawn
        ]);
        return gameplayCodes.has(code);
    }

    _onKeyDown(e) {
        if (e.repeat) return;
        this.keysDown.add(e.code);
        this.lastActivityTime = performance.now();
        if (this._preventBrowserDefaults(e.code) && document.activeElement === document.body) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        this.keysDown.delete(e.code);
    }

    _anyDown(codes) {
        return codes.some(code => this.keysDown.has(code));
    }

    update(dt, actionsOut) {
        const left = this._anyDown(this.bindings.left);
        const right = this._anyDown(this.bindings.right);
        const accel = this._anyDown(this.bindings.accelerate);
        const brake = this._anyDown(this.bindings.brake);

        let steerTarget = 0;
        if (left && !right) steerTarget = -1;
        else if (right && !left) steerTarget = 1;

        const steerRate = steerTarget === 0 ? STEER_RETURN : STEER_RAMP_UP;
        this.steerValue += Math.sign(steerTarget - this.steerValue) *
            Math.min(Math.abs(steerTarget - this.steerValue), steerRate * dt);

        this.throttleValue += Math.sign((accel ? 1 : 0) - this.throttleValue) *
            Math.min(Math.abs((accel ? 1 : 0) - this.throttleValue), THROTTLE_RAMP * dt);

        this.brakeValue += Math.sign((brake ? 1 : 0) - this.brakeValue) *
            Math.min(Math.abs((brake ? 1 : 0) - this.brakeValue), BRAKE_RAMP * dt);

        actionsOut.steer = this.steerValue;
        actionsOut.throttle = this.throttleValue;
        actionsOut.brake = this.brakeValue;
        actionsOut.drift = this._anyDown(this.bindings.drift);
        actionsOut.boost = this._anyDown(this.bindings.boost);
        actionsOut.usePowerup = this._anyDown(this.bindings.usePowerup);
        actionsOut.changeCamera = this._anyDown(this.bindings.changeCamera);
        actionsOut.lookBack = this._anyDown(this.bindings.lookBack);
        actionsOut.respawn = this._anyDown(this.bindings.respawn);
        actionsOut.pause = this._anyDown(this.bindings.pause);
    }

    hasRecentActivity(withinMs) {
        return (performance.now() - this.lastActivityTime) < withinMs;
    }

    setBindings(bindings) {
        this.bindings = bindings;
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }
}
