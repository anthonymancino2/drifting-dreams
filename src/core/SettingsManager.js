const STORAGE_KEY = 'driftingDreams.settings.v1';

const DEFAULTS = {
    graphicsQuality: 'auto',   // auto | low | medium | high
    masterVolume: 0.8,
    musicVolume: 0.5,
    effectsVolume: 0.9,
    easyDrive: false,
    cameraPreference: 'chase',
    reducedCameraShake: false,
    reducedParticles: false,
    vibration: true,
    dayNightMode: 'day',
    steeringSensitivity: 1.0,
    controllerDeadZone: 0.12,
    invertSteering: false,
    powerupsEnabled: true,
    playerName: '',
    keyboardBindings: null,
    gamepadBindings: null
};

// Everything the player can tweak, persisted to localStorage. Never authoritative for
// multiplayer race state - see section 106.
export default class SettingsManager {
    constructor() {
        this.values = { ...DEFAULTS, ...this._load() };
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
        } catch {
            // localStorage unavailable (private mode, quota) - fail silently, keep in-memory values.
        }
    }

    get(key) {
        return this.values[key];
    }

    set(key, value) {
        this.values[key] = value;
        this.save();
    }

    getAll() {
        return { ...this.values };
    }
}
