import KeyboardInput from './KeyboardInput.js';
import TouchInput from './TouchInput.js';
import GamepadInput from './GamepadInput.js';
import { createEmptyActions } from './InputActions.js';

const ACTIVITY_WINDOW_MS = 400;

// Single source of truth for "what is the player doing right now", regardless of
// device. RacerController and the UI only ever read `actions` from here.
export default class InputManager {
    constructor(touchRootElement) {
        this.keyboard = new KeyboardInput();
        this.touch = new TouchInput(touchRootElement);
        this.gamepad = new GamepadInput();

        this.actions = createEmptyActions();
        this.previousActions = createEmptyActions();
        this.activeDevice = 'keyboard'; // keyboard | touch | gamepad

        this.onDeviceChanged = null;
        this.gamepad.onConnected = (pad) => this.onGamepadConnected?.(pad);
        this.gamepad.onDisconnected = (pad) => this.onGamepadDisconnected?.(pad);
    }

    _pickActiveDevice() {
        const kb = this.keyboard.hasRecentActivity(ACTIVITY_WINDOW_MS);
        const touch = this.touch.hasRecentActivity(ACTIVITY_WINDOW_MS);
        const pad = this.gamepad.hasRecentActivity(ACTIVITY_WINDOW_MS);

        let newest = this.activeDevice;
        let newestTime = -Infinity;
        const candidates = [
            ['keyboard', this.keyboard.lastActivityTime],
            ['touch', this.touch.lastActivityTime],
            ['gamepad', this.gamepad.lastActivityTime]
        ];
        for (const [device, time] of candidates) {
            if (time > newestTime) { newestTime = time; newest = device; }
        }
        if ((kb || touch || pad) && newest !== this.activeDevice) {
            this.activeDevice = newest;
            this.onDeviceChanged?.(newest);
        }
    }

    update(dt) {
        Object.assign(this.previousActions, this.actions);

        this.keyboard.update(dt, this.actions);
        const gamepadActive = this.gamepad.update(dt, this._gamepadScratch ??= createEmptyActions());
        this.touch.update(dt, this._touchScratch ??= createEmptyActions());

        this._pickActiveDevice();

        // Merge: the currently active device drives analog axes; digital buttons are
        // OR'd across all devices so a quick tap on touch while holding a keyboard
        // steer still registers (useful for hybrid setups, harmless otherwise).
        const source = this.activeDevice === 'gamepad' ? this._gamepadScratch
            : this.activeDevice === 'touch' ? this._touchScratch
            : this.actions;

        this.actions.steer = source.steer;
        this.actions.throttle = source.throttle;
        this.actions.brake = source.brake;

        for (const key of ['drift', 'boost', 'usePowerup', 'changeCamera', 'lookBack', 'respawn', 'pause', 'secondaryAbility']) {
            this.actions[key] = this.actions[key] || this._gamepadScratch[key] || this._touchScratch[key];
        }
    }

    wasPressed(action) {
        return this.actions[action] && !this.previousActions[action];
    }

    wasReleased(action) {
        return !this.actions[action] && this.previousActions[action];
    }

    getGamepadDebugInfo() {
        return this.gamepad.getInfo();
    }
}
