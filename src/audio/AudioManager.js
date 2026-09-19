// Fully procedural (no external audio files yet) but genuinely functional Web Audio
// engine: real oscillator-driven engine hum + filtered-noise tire screech, not stubs.
// Swapping in recorded samples later (section 94) means adding buffers here without
// touching call sites in RacerController/HUD.
export default class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.unlocked = false;
        this.engineEnabled = false;

        this.settings = { master: 0.8, music: 0.5, effects: 0.9 };

        const unlock = () => this._ensureContext();
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
    }

    _ensureContext() {
        if (this.unlocked) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.settings.master;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.settings.effects;
        this.sfxGain.connect(this.masterGain);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.settings.music;
        this.musicGain.connect(this.masterGain);

        this._buildEngine();
        this._buildDriftNoise();
        this.unlocked = true;
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _buildEngine() {
        const ctx = this.ctx;
        this.engineOsc = ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineFilter = ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 800;
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0.0;

        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.sfxGain);
        this.engineOsc.frequency.value = 60;
        this.engineOsc.start();
    }

    _makeNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    _buildDriftNoise() {
        const ctx = this.ctx;
        this.noiseSource = ctx.createBufferSource();
        this.noiseSource.buffer = this._makeNoiseBuffer();
        this.noiseSource.loop = true;
        this.noiseFilter = ctx.createBiquadFilter();
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.value = 1800;
        this.noiseFilter.Q.value = 0.8;
        this.noiseGain = ctx.createGain();
        this.noiseGain.gain.value = 0;

        this.noiseSource.connect(this.noiseFilter);
        this.noiseFilter.connect(this.noiseGain);
        this.noiseGain.connect(this.sfxGain);
        this.noiseSource.start();
    }

    updateEngine(speedRatio, throttle, boosting) {
        if (!this.unlocked) return;
        const targetFreq = 55 + speedRatio * 210 + (boosting ? 40 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
        const targetGain = 0.05 + Math.max(throttle, speedRatio * 0.6) * 0.18;
        this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
        this.engineFilter.frequency.setTargetAtTime(500 + speedRatio * 2500, this.ctx.currentTime, 0.1);
    }

    setDrifting(active, intensity = 1) {
        if (!this.unlocked) return;
        this.noiseGain.gain.setTargetAtTime(active ? 0.06 * intensity : 0, this.ctx.currentTime, 0.05);
    }

    playBlip(frequency = 660, duration = 0.08, type = 'square') {
        if (!this.unlocked) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.value = 0.25;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCollisionThud() {
        if (!this.unlocked) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.15);
        gain.gain.value = 0.4;
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playCountdownBeep(isGo = false) {
        this.playBlip(isGo ? 880 : 520, isGo ? 0.3 : 0.12, 'square');
    }

    setVolumes({ master, music, effects }) {
        if (master !== undefined) { this.settings.master = master; if (this.masterGain) this.masterGain.gain.value = master; }
        if (music !== undefined) { this.settings.music = music; if (this.musicGain) this.musicGain.gain.value = music; }
        if (effects !== undefined) { this.settings.effects = effects; if (this.sfxGain) this.sfxGain.gain.value = effects; }
    }
}
