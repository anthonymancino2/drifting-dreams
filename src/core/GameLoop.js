const FIXED_STEP = 1 / 60;
const MAX_FRAME_TIME = 0.25; // avoid a huge physics catch-up burst after a tab freeze

// Decouples physics from render rate: `onFixedUpdate(dt)` always runs at a stable
// 60Hz regardless of display refresh rate, `onRender(alpha, dt)` runs once per rAF.
// This is also what section 7 asks for so multiplayer prediction later has a
// deterministic step to reconcile against.
export default class GameLoop {
    constructor({ onFixedUpdate, onRender }) {
        this.onFixedUpdate = onFixedUpdate;
        this.onRender = onRender;
        this.accumulator = 0;
        this.lastTime = 0;
        this.running = false;
        this.paused = document.hidden;
        this.frameTimeMs = 0;
        this.fps = 0;
        this._fpsSmoothing = 0;

        document.addEventListener('visibilitychange', () => {
            this.paused = document.hidden;
            if (!this.paused) this.lastTime = performance.now();
        });
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this._tick.bind(this));
    }

    stop() {
        this.running = false;
    }

    _tick(now) {
        if (!this.running) return;
        requestAnimationFrame(this._tick.bind(this));
        if (this.paused) { this.lastTime = now; return; }

        let frameTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        frameTime = Math.min(frameTime, MAX_FRAME_TIME);
        this.frameTimeMs = frameTime * 1000;
        this._fpsSmoothing += (1 / Math.max(frameTime, 0.0001) - this._fpsSmoothing) * 0.1;
        this.fps = this._fpsSmoothing;

        this.accumulator += frameTime;
        let steps = 0;
        while (this.accumulator >= FIXED_STEP && steps < 8) {
            this.onFixedUpdate(FIXED_STEP);
            this.accumulator -= FIXED_STEP;
            steps++;
        }
        const alpha = this.accumulator / FIXED_STEP;
        this.onRender(alpha, frameTime);
    }
}
