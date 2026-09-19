import * as THREE from 'three';
import { clamp, dampAngle, damp, shortestAngleDelta } from '../utils/MathUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

// Arcade car model. Two angles are tracked separately:
//   heading      - which way the car is visually pointing (and turning toward)
//   moveHeading  - the direction it's actually traveling
// Under normal grip they converge almost instantly (no perceptible slide). While
// drifting, `driftGrip` is much lower, so moveHeading lags behind heading and the
// car visibly slides sideways relative to where it's pointed - a cheap, very
// controllable approximation of a slip-angle model that doesn't need real tire forces.
export function createVehicleState(config, spawnPosition, spawnHeading = 0) {
    return {
        config,
        position: spawnPosition.clone(),
        heading: spawnHeading,
        moveHeading: spawnHeading,
        speed: 0,
        steerAngle: 0,
        drift: { active: false, direction: 0, chargeTime: 0, chargeLevel: 'none' },
        boostTimer: 0,
        airborne: false,
        surface: 'asphalt',
        lastDriftBoost: 0,
        collisionFlashTimer: 0
    };
}

function surfaceSpeedFactor(config, surface) {
    if (surface === 'offroad') return config.offRoadSpeedFactor;
    return 1.0;
}

function surfaceGripFactor(config, surface) {
    if (surface === 'offroad') return config.offRoadGripFactor;
    return 1.0;
}

function accelerationCurveFactor(speedRatio, exponent) {
    // Slightly stronger acceleration at low speed, tapering near top speed.
    return 1.0 - Math.pow(clamp(speedRatio, 0, 1), exponent) * 0.5;
}

export function stepVehiclePhysics(state, actions, dt, surfaceInfo) {
    const cfg = state.config;
    state.surface = surfaceInfo.surface;
    const speedFactor = surfaceSpeedFactor(cfg, state.surface);
    const gripFactorSurface = surfaceGripFactor(cfg, state.surface);

    const boosting = state.boostTimer > 0;
    if (boosting) state.boostTimer = Math.max(0, state.boostTimer - dt);
    const boostMul = boosting ? cfg.boostPower : 1.0;

    const maxSpeed = cfg.maxSpeed * speedFactor * boostMul;
    const speedRatio = Math.abs(state.speed) / cfg.maxSpeed;

    // --- Throttle / brake / reverse ---
    if (actions.throttle > 0.01) {
        const accel = cfg.acceleration * speedFactor * boostMul *
            accelerationCurveFactor(speedRatio, cfg.accelerationCurve) * actions.throttle;
        state.speed += accel * dt;
    } else if (state.speed > 0) {
        state.speed -= cfg.engineBraking * dt;
    } else if (state.speed < 0) {
        state.speed += cfg.engineBraking * dt;
    }

    if (actions.brake > 0.01) {
        if (state.speed > 0.05) {
            state.speed -= cfg.brakingPower * actions.brake * dt;
        } else {
            state.speed -= cfg.reverseAcceleration * actions.brake * dt;
        }
    }

    state.speed = clamp(state.speed, -cfg.reverseSpeed, maxSpeed);
    if (Math.abs(state.speed) < 0.03 && actions.throttle < 0.01 && actions.brake < 0.01) state.speed = 0;

    // --- Drift state machine ---
    const canDrift = Math.abs(state.speed) > cfg.driftMinSpeed;
    const wantsDrift = actions.drift && canDrift && Math.abs(actions.steer) > 0.15;

    if (wantsDrift && !state.drift.active) {
        state.drift.active = true;
        state.drift.direction = Math.sign(actions.steer) || 1;
        state.drift.chargeTime = 0;
    } else if (!actions.drift && state.drift.active) {
        // Release: pay out accumulated drift boost.
        const t = state.drift.chargeThresholds || cfg.driftChargeThresholds;
        let boostAmount = 0;
        if (state.drift.chargeTime >= t.gold) boostAmount = cfg.driftBoostPower.gold;
        else if (state.drift.chargeTime >= t.purple) boostAmount = cfg.driftBoostPower.purple;
        else if (state.drift.chargeTime >= t.blue) boostAmount = cfg.driftBoostPower.blue;
        if (boostAmount > 0) {
            state.speed = clamp(state.speed + boostAmount, -cfg.reverseSpeed, cfg.maxSpeed * cfg.boostPower);
            state.boostTimer = Math.max(state.boostTimer, 0.6);
            state.lastDriftBoost = boostAmount;
        }
        state.drift.active = false;
        state.drift.chargeLevel = 'none';
        state.drift.chargeTime = 0;
    }

    if (state.drift.active) {
        state.drift.chargeTime += dt;
        const t = cfg.driftChargeThresholds;
        state.drift.chargeLevel = state.drift.chargeTime >= t.gold ? 'gold'
            : state.drift.chargeTime >= t.purple ? 'purple'
            : state.drift.chargeTime >= t.blue ? 'blue' : 'none';
    }

    // --- Steering ---
    const highSpeedBlend = clamp(speedRatio, 0, 1);
    const steerLimit = 1.0 - highSpeedBlend * (1.0 - cfg.highSpeedSteeringFactor);
    const steerMultiplier = state.drift.active ? cfg.driftSteeringMultiplier : 1.0;
    const targetSteer = clamp(actions.steer, -1, 1) * steerLimit * steerMultiplier;
    state.steerAngle = damp(state.steerAngle, targetSteer, cfg.steeringResponse, dt);

    // --- Yaw (heading) integration ---
    const directionSign = state.speed >= 0 ? 1 : -1;
    let yawRate = state.steerAngle * cfg.steeringStrength * clamp(Math.abs(state.speed) / 6, 0, 1) * directionSign;
    if (state.drift.active) {
        yawRate += cfg.driftRotationStrength * state.drift.direction * clamp(Math.abs(state.speed) / cfg.maxSpeed, 0.3, 1);
    }
    state.heading += yawRate * dt;

    // --- moveHeading lags behind heading based on grip (this produces the slide) ---
    const grip = (state.drift.active ? cfg.driftGrip : cfg.grip) * gripFactorSurface;
    state.moveHeading = dampAngle(state.moveHeading, state.heading, grip, dt);

    // --- Integrate position ---
    const moveDir = new THREE.Vector3(Math.sin(state.moveHeading), 0, Math.cos(state.moveHeading));
    state.position.addScaledVector(moveDir, state.speed * dt);

    if (state.collisionFlashTimer > 0) state.collisionFlashTimer -= dt;

    return {
        driftAngle: shortestAngleDelta(state.moveHeading, state.heading),
        moveDir
    };
}

export function applyBoost(state) {
    state.boostTimer = state.config.boostDuration;
}

export function applyWallCollision(state, pushOutVector, impactSpeedLoss) {
    state.position.add(pushOutVector);
    state.speed *= (1 - impactSpeedLoss);
    state.collisionFlashTimer = 0.15;
}

export function respawnAt(state, position, heading) {
    state.position.copy(position);
    state.heading = heading;
    state.moveHeading = heading;
    state.speed = 0;
    state.steerAngle = 0;
    state.drift.active = false;
    state.drift.chargeTime = 0;
    state.boostTimer = 0;
}
