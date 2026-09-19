import * as THREE from 'three';
import { clamp, shortestAngleDelta } from '../utils/MathUtils.js';
import { createEmptyActions } from '../input/InputActions.js';

// Driving-style presets (section 82). These tune behavior only - all AI currently
// share the one vehicle config (Phase 4 adds the other 11 vehicles), so personality
// is what makes bots feel different from each other in the meantime.
export const AIPersonalities = {
    balanced: { lookahead: 9, lateralOffset: 0, aggressiveness: 0.5, driftTendency: 0.45, boostTendency: 0.5, targetSpeedMax: 1.0, steerGain: 2.2 },
    aggressive: { lookahead: 11, lateralOffset: 1.6, aggressiveness: 0.85, driftTendency: 0.7, boostTendency: 0.8, targetSpeedMax: 1.05, steerGain: 2.4 },
    drifter: { lookahead: 8, lateralOffset: -1.2, aggressiveness: 0.6, driftTendency: 0.95, boostTendency: 0.5, targetSpeedMax: 0.95, steerGain: 2.1 },
    speedster: { lookahead: 13, lateralOffset: 0.6, aggressiveness: 0.7, driftTendency: 0.3, boostTendency: 0.9, targetSpeedMax: 1.1, steerGain: 2.0 },
    defensive: { lookahead: 7, lateralOffset: -1.8, aggressiveness: 0.35, driftTendency: 0.25, boostTendency: 0.3, targetSpeedMax: 0.85, steerGain: 2.3 },
    beginner: { lookahead: 6, lateralOffset: 0.3, aggressiveness: 0.2, driftTendency: 0.1, boostTendency: 0.2, targetSpeedMax: 0.75, steerGain: 1.9 }
};

const STUCK_SPEED_THRESHOLD = 1.4;
const STUCK_TIME_TO_RESPAWN = 2.5;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// One AI driver: reads a RacerController's live physics state and produces an
// InputActions-shaped object each tick, exactly like a human input device would.
// RacerController/VehiclePhysics can't tell the difference between this and a player.
export default class AIRacer {
    constructor(racingLine, personalityKey = 'balanced', seed = 1) {
        this.line = racingLine;
        this.personalityKey = AIPersonalities[personalityKey] ? personalityKey : 'balanced';
        this.personality = AIPersonalities[this.personalityKey];
        this.random = mulberry32(seed);
        this.actions = createEmptyActions();
        this.stuckTimer = 0;
        this._toTarget = new THREE.Vector3();
    }

    update(dt, state) {
        const cfg = state.config;
        const speed = state.speed;
        const speedAbs = Math.abs(speed);
        const p = this.personality;

        const pathInfo = this.line.getPathInfo(state.position);
        const lookaheadDist = p.lookahead + speedAbs * 0.35;
        const targetPoint = this.line.getPoint(pathInfo.arcLength + lookaheadDist, p.lateralOffset);

        this._toTarget.subVectors(targetPoint, state.position);
        const desiredHeading = Math.atan2(this._toTarget.x, this._toTarget.z);
        const headingError = shortestAngleDelta(state.heading, desiredHeading);
        const steer = clamp(headingError * p.steerGain, -1, 1);

        const curveAheadDist = 14 + speedAbs * 0.5;
        const curvature = this.line.getCurvatureAhead(pathInfo.arcLength, curveAheadDist);
        const curveFactor = clamp(1 - Math.abs(curvature) * 1.6, 0.3, 1) * p.targetSpeedMax;
        const targetSpeed = cfg.maxSpeed * curveFactor;

        let throttle = 0;
        let brake = 0;
        if (speedAbs < targetSpeed) throttle = 1;
        else if (speedAbs > targetSpeed * 1.12) brake = 0.6;

        const wantsDrift = Math.abs(steer) > 0.55 && speedAbs > cfg.driftMinSpeed * 1.1 && this.random() < p.driftTendency;
        const wantsBoost = Math.abs(curvature) < 0.06 && state.boostTimer <= 0 && this.random() < p.boostTendency * dt * 2;

        if (speedAbs < STUCK_SPEED_THRESHOLD && throttle > 0) this.stuckTimer += dt;
        else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
        const wantsRespawn = this.stuckTimer > STUCK_TIME_TO_RESPAWN;
        if (wantsRespawn) this.stuckTimer = 0;

        const a = this.actions;
        a.steer = steer;
        a.throttle = throttle;
        a.brake = brake;
        a.drift = wantsDrift;
        a.boost = wantsBoost;
        a.respawn = wantsRespawn;
        a.usePowerup = false;
        a.changeCamera = false;
        a.lookBack = false;
        a.pause = false;
        return a;
    }
}
