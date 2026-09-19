const STORAGE_KEY = 'driftingDreams.save.v1';

const DEFAULTS = {
    playerName: 'RACER',
    preferredVehicle: 'street_drift_car',
    bestTimes: {},       // trackId -> { bestLap, bestTotal }
    vehicleUnlocks: ['street_drift_car']
};

// Local progress/profile persistence (best times, unlocks, preferred vehicle).
export default class SaveManager {
    constructor() {
        this.data = { ...DEFAULTS, ...this._load() };
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch {
            // ignore - non-fatal if localStorage is unavailable
        }
    }

    recordLapResult(trackId, lapTime, totalTime) {
        const entry = this.data.bestTimes[trackId] || { bestLap: null, bestTotal: null };
        if (entry.bestLap === null || lapTime < entry.bestLap) entry.bestLap = lapTime;
        if (totalTime !== undefined && (entry.bestTotal === null || totalTime < entry.bestTotal)) entry.bestTotal = totalTime;
        this.data.bestTimes[trackId] = entry;
        this.save();
    }

    setPlayerName(name) {
        this.data.playerName = name;
        this.save();
    }

    setPreferredVehicle(id) {
        this.data.preferredVehicle = id;
        this.save();
    }
}
