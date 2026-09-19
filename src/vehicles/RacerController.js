import * as THREE from 'three';
import { createVehicleState, stepVehiclePhysics, applyBoost, applyWallCollision, respawnAt } from './VehiclePhysics.js';
import VehicleVisual from './VehicleVisual.js';
import { createEmptyActions } from '../input/InputActions.js';
import CheckpointManager from '../race/CheckpointManager.js';
import LapManager from '../race/LapManager.js';

const RESPAWN_FADE_TIME = 0.6;
const BARRIER_RADIUS = 1.3;

// Glues together physics + visuals + track surface/collision queries for one racer.
// The `inputSource` just needs an `actions` object each frame - it can be InputManager
// (local player), an AI controller, or a network snapshot; RacerController doesn't care.
export default class RacerController {
    constructor({ scene, config, trackManager, spawnGridIndex = 0, color, isPlayer = false, totalLaps = 3 }) {
        this.trackManager = trackManager;
        const { position, heading } = trackManager.getStartTransform(spawnGridIndex);
        this.state = createVehicleState(config, position, heading);
        this.visual = new VehicleVisual(scene, color);
        this.isPlayer = isPlayer;

        this.respawnTimer = 0;
        this.isRespawning = false;
        this.lastGoodPathIndex = 0;
        this.driftAngle = 0;
        this.moveDir = new THREE.Vector3(0, 0, 1);

        this.checkpointManager = new CheckpointManager(trackManager);
        this.lapManager = new LapManager(this.checkpointManager, totalLaps);
    }

    update(dt, actions = createEmptyActions(), raceStarted = true, raceTime = 0) {
        if (!raceStarted) actions = { ...actions, throttle: 0, brake: 0 };

        if (this.isRespawning) {
            this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) this.isRespawning = false;
            this.visual.update(this.state, dt, this.driftAngle);
            return;
        }

        if (actions.boost && this.state.boostTimer <= 0) applyBoost(this.state);

        const pathInfoBefore = this.trackManager.getPathInfo(this.state.position);
        const surfaceInfo = { surface: pathInfoBefore.surface };
        const { driftAngle } = stepVehiclePhysics(this.state, actions, dt, surfaceInfo);
        this.driftAngle = driftAngle;

        this._handleBarrierCollisions();

        const pathInfo = this.trackManager.getPathInfo(this.state.position);
        if (!pathInfo.outOfBounds) this.lastGoodPathIndex = pathInfo.index;
        this.lapManager.update(pathInfo.arcLength, raceTime);

        if (pathInfo.outOfBounds || actions.respawn) {
            this.respawnToLastCheckpoint();
        }

        this.visual.update(this.state, dt, this.driftAngle);
    }

    _handleBarrierCollisions() {
        const colliders = this.trackManager.barrierColliders;
        if (!colliders) return;
        for (const barrier of colliders) {
            const dx = this.state.position.x - barrier.position.x;
            const dz = this.state.position.z - barrier.position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < BARRIER_RADIUS * BARRIER_RADIUS && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const pushOut = new THREE.Vector3(dx / dist, 0, dz / dist).multiplyScalar(BARRIER_RADIUS - dist);
                applyWallCollision(this.state, pushOut, this.state.config.wallBounceDamping);
            }
        }
    }

    respawnToLastCheckpoint() {
        if (this.isRespawning) return;
        const { position, heading } = this.trackManager.getRespawnTransform(this.lastGoodPathIndex);
        position.y = 0;
        respawnAt(this.state, position, heading);
        this.isRespawning = true;
        this.respawnTimer = RESPAWN_FADE_TIME;
    }

    getSpeedKmh() {
        return Math.abs(this.state.speed) * 3.6;
    }

    setNightLights(on) {
        this.visual.setNightLights(on);
    }

    dispose(scene) {
        this.visual.dispose(scene);
    }
}
