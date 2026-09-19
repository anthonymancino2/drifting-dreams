const BUTTON_PROMPTS = {
    keyboard: { drift: 'SPACE', boost: 'SHIFT', usePowerup: 'E', changeCamera: 'C' },
    gamepad: { drift: '✕', boost: '○', usePowerup: '□', changeCamera: '△' },
    touch: { drift: 'DRIFT', boost: 'BOOST', usePowerup: 'ITEM', changeCamera: 'CAM' }
};

// Race HUD (speed/lap/drift/boost/prompts) plus the F3 debug overlay. Pure DOM - kept
// separate from Three.js scene rendering entirely.
export default class HUD {
    constructor(rootElement) {
        this.root = rootElement;
        this.debugVisible = false;
        this._buildDOM();

        window.addEventListener('keydown', (e) => {
            if (e.code === 'F3') { e.preventDefault(); this.debugVisible = !this.debugVisible; this.debugEl.style.display = this.debugVisible ? 'block' : 'none'; }
        });
    }

    _buildDOM() {
        this.root.innerHTML = `
            <div id="hud-top-left">
                <div id="hud-speed"><span id="hud-speed-value">0</span><span id="hud-speed-unit">km/h</span></div>
            </div>
            <div id="hud-top-right">
                <div id="hud-lap">LAP <span id="hud-lap-value">1/3</span></div>
                <div id="hud-position">POS <span id="hud-position-value">1/1</span></div>
                <div id="hud-time"><span id="hud-time-value">00:00.00</span></div>
            </div>
            <div id="hud-bottom-left">
                <div id="hud-drift-bar"><div id="hud-drift-fill"></div></div>
                <div id="hud-boost-bar"><div id="hud-boost-fill"></div></div>
            </div>
            <div id="hud-prompts">
                <span class="prompt"><b id="prompt-drift">SPACE</b>DRIFT</span>
                <span class="prompt"><b id="prompt-boost">SHIFT</b>BOOST</span>
                <span class="prompt"><b id="prompt-power">E</b>ITEM</span>
                <span class="prompt"><b id="prompt-camera">C</b>CAM</span>
            </div>
            <div id="hud-toast"></div>
            <div id="hud-countdown"></div>
            <div id="hud-daynight-toggle" title="Toggle day/night (N)">☀</div>
            <div id="debug-overlay" style="display:none"></div>
        `;
        this.speedValueEl = this.root.querySelector('#hud-speed-value');
        this.lapValueEl = this.root.querySelector('#hud-lap-value');
        this.positionValueEl = this.root.querySelector('#hud-position-value');
        this.timeValueEl = this.root.querySelector('#hud-time-value');
        this.driftFillEl = this.root.querySelector('#hud-drift-fill');
        this.boostFillEl = this.root.querySelector('#hud-boost-fill');
        this.toastEl = this.root.querySelector('#hud-toast');
        this.countdownEl = this.root.querySelector('#hud-countdown');
        this.debugEl = this.root.querySelector('#debug-overlay');
        this.dayNightToggleEl = this.root.querySelector('#hud-daynight-toggle');
        this.promptEls = {
            drift: this.root.querySelector('#prompt-drift'),
            boost: this.root.querySelector('#prompt-boost'),
            usePowerup: this.root.querySelector('#prompt-power'),
            changeCamera: this.root.querySelector('#prompt-camera')
        };
    }

    setActiveInputDevice(device) {
        const prompts = BUTTON_PROMPTS[device] || BUTTON_PROMPTS.keyboard;
        for (const [action, el] of Object.entries(this.promptEls)) {
            el.textContent = prompts[action] || '';
        }
    }

    update({ speedKmh, lap, totalLaps, position, totalRacers, raceTime, driftChargeLevel, driftChargeRatio, boostActive, boostRatio }) {
        this.speedValueEl.textContent = Math.round(speedKmh);
        this.lapValueEl.textContent = `${Math.min(lap, totalLaps)}/${totalLaps}`;
        this.positionValueEl.textContent = `${position}/${totalRacers}`;
        this.timeValueEl.textContent = formatTime(raceTime);

        this.driftFillEl.style.width = `${Math.min(driftChargeRatio, 1) * 100}%`;
        this.driftFillEl.className = driftChargeLevel === 'none' ? '' : `charge-${driftChargeLevel}`;
        this.boostFillEl.style.width = `${Math.min(boostRatio, 1) * 100}%`;
        this.boostFillEl.classList.toggle('active', boostActive);
    }

    showToast(text, duration = 2000) {
        this.toastEl.textContent = text;
        this.toastEl.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), duration);
    }

    showCountdown(text) {
        this.countdownEl.textContent = text;
        this.countdownEl.classList.add('pulse');
        void this.countdownEl.offsetWidth;
        this.countdownEl.classList.remove('pulse');
    }

    clearCountdown() {
        this.countdownEl.textContent = '';
    }

    setDayNightIcon(mode) {
        this.dayNightToggleEl.textContent = mode === 'day' ? '☀' : '☽';
    }

    updateDebug(lines) {
        if (!this.debugVisible) return;
        this.debugEl.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
