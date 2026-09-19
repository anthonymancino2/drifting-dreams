// Virtual on-screen controls: a drag joystick on the left, action buttons on the right.
// Every touch is tracked by identifier so steering + throttle + drift/boost can be held
// simultaneously (multitouch), matching how a real controller behaves.
export default class TouchInput {
    constructor(rootElement) {
        this.root = rootElement;
        this.steerValue = 0;
        this.throttleHeld = false;
        this.brakeHeld = false;
        this.buttons = { drift: false, boost: false, usePowerup: false, changeCamera: false, lookBack: false };
        this.lastActivityTime = 0;
        this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        this.joystickTouchId = null;
        this.joystickCenter = { x: 0, y: 0 };
        this.joystickRadius = 55;

        if (this.enabled) this._buildDOM();
    }

    _buildDOM() {
        this.root.innerHTML = `
            <div id="touch-joystick-zone" class="touch-zone">
                <div id="touch-joystick-base">
                    <div id="touch-joystick-knob"></div>
                </div>
            </div>
            <div id="touch-action-zone" class="touch-zone">
                <button class="touch-btn touch-btn-throttle" data-action="throttle">GAS</button>
                <button class="touch-btn touch-btn-brake" data-action="brake">BRAKE</button>
                <button class="touch-btn touch-btn-drift" data-action="drift">DRIFT</button>
                <button class="touch-btn touch-btn-boost" data-action="boost">BOOST</button>
                <button class="touch-btn touch-btn-power" data-action="usePowerup">ITEM</button>
                <button class="touch-btn touch-btn-camera" data-action="changeCamera">CAM</button>
            </div>
        `;
        this.root.style.display = 'flex';

        this.joystickBase = this.root.querySelector('#touch-joystick-base');
        this.joystickKnob = this.root.querySelector('#touch-joystick-knob');
        this.joystickZone = this.root.querySelector('#touch-joystick-zone');

        this.joystickZone.addEventListener('touchstart', (e) => this._onJoystickStart(e), { passive: false });
        window.addEventListener('touchmove', (e) => this._onJoystickMove(e), { passive: false });
        window.addEventListener('touchend', (e) => this._onJoystickEnd(e), { passive: false });
        window.addEventListener('touchcancel', (e) => this._onJoystickEnd(e), { passive: false });

        this.root.querySelectorAll('.touch-btn').forEach(btn => {
            const action = btn.dataset.action;
            const setState = (held) => {
                this.lastActivityTime = performance.now();
                if (action === 'throttle') this.throttleHeld = held;
                else if (action === 'brake') this.brakeHeld = held;
                else this.buttons[action] = held;
            };
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); setState(true); }, { passive: false });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); setState(false); }, { passive: false });
            btn.addEventListener('touchcancel', (e) => { e.preventDefault(); setState(false); }, { passive: false });
            btn.addEventListener('contextmenu', (e) => e.preventDefault());
        });
    }

    _onJoystickStart(e) {
        e.preventDefault();
        if (this.joystickTouchId !== null) return;
        const touch = e.changedTouches[0];
        const rect = this.joystickBase.getBoundingClientRect();
        this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.joystickTouchId = touch.identifier;
        this.lastActivityTime = performance.now();
        this._updateJoystickFromTouch(touch);
    }

    _onJoystickMove(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouchId) {
                e.preventDefault();
                this._updateJoystickFromTouch(touch);
            }
        }
    }

    _updateJoystickFromTouch(touch) {
        const dx = touch.clientX - this.joystickCenter.x;
        const dy = touch.clientY - this.joystickCenter.y;
        const dist = Math.min(Math.hypot(dx, dy), this.joystickRadius);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * dist;
        const ky = Math.sin(angle) * dist;
        this.joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
        this.steerValue = Math.max(-1, Math.min(1, (dx / this.joystickRadius)));
        this.lastActivityTime = performance.now();
    }

    _onJoystickEnd(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === this.joystickTouchId) {
                this.joystickTouchId = null;
                this.steerValue = 0;
                this.joystickKnob.style.transform = 'translate(0px, 0px)';
            }
        }
    }

    update(dt, actionsOut) {
        if (!this.enabled) return false;
        actionsOut.steer = this.steerValue;
        actionsOut.throttle = this.throttleHeld ? 1 : 0;
        actionsOut.brake = this.brakeHeld ? 1 : 0;
        actionsOut.drift = this.buttons.drift;
        actionsOut.boost = this.buttons.boost;
        actionsOut.usePowerup = this.buttons.usePowerup;
        actionsOut.changeCamera = this.buttons.changeCamera;
        actionsOut.lookBack = this.buttons.lookBack;
        return true;
    }

    hasRecentActivity(withinMs) {
        return (performance.now() - this.lastActivityTime) < withinMs;
    }
}
