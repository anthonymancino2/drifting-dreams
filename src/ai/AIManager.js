import RacerController from '../vehicles/RacerController.js';
import { getVehicleConfig, getDefaultVehicleId } from '../vehicles/VehicleConfigs.js';
import AIRacer, { AIPersonalities } from './AIRacer.js';
import RacingLine from './RacingLine.js';

const AI_COLORS = [0xff5b4d, 0xffb347, 0xffe14d, 0x4dff88, 0x4dd4ff, 0x9a6dff, 0xff6dc4, 0xc4ff4d, 0x4dffd4, 0xff8a4d, 0x8a4dff];

// Owns every AI-controlled racer: spawns them on the grid behind the player, feeds
// each one's AIRacer brain into its RacerController every fixed tick, and gives Game/
// PositionManager/effects a flat list to iterate - same shape as the player racer.
export default class AIManager {
    constructor({ scene, trackManager, count, totalLaps, startGridIndex = 1 }) {
        this.racingLine = new RacingLine(trackManager);
        const personalityKeys = Object.keys(AIPersonalities);
        this.entries = [];

        for (let i = 0; i < count; i++) {
            const personalityKey = personalityKeys[i % personalityKeys.length];
            const racer = new RacerController({
                scene,
                config: getVehicleConfig(getDefaultVehicleId()),
                trackManager,
                spawnGridIndex: startGridIndex + i,
                color: AI_COLORS[i % AI_COLORS.length],
                isPlayer: false,
                totalLaps
            });
            const brain = new AIRacer(this.racingLine, personalityKey, i * 97 + 13);
            this.entries.push({ racer, brain });
        }
    }

    update(dt, raceStarted, raceTime) {
        for (const { racer, brain } of this.entries) {
            const actions = brain.update(dt, racer.state);
            racer.update(dt, actions, raceStarted, raceTime);
        }
    }

    getRacers() {
        return this.entries.map(e => e.racer);
    }

    setNightLights(on) {
        for (const { racer } of this.entries) racer.setNightLights(on);
    }
}
