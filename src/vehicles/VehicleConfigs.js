// Internal physics tuning per vehicle. Player-facing 1-10 stats (see section 34 of the
// design brief) are derived/display-only; these numbers are what physics actually reads.
// Phase 1 ships one fully playable vehicle; the other 11 slots are added in Phase 4
// without touching this shape.
export const VehicleConfigs = {
    street_drift_car: {
        id: 'street_drift_car',
        name: 'Street Drift Car',
        personality: 'Balanced Beginner Drift Car',
        displayStats: { speed: 7, acceleration: 7, handling: 8, drift: 9, grip: 6, boost: 7, weight: 6, offRoad: 4 },

        maxSpeed: 42,
        acceleration: 22,
        accelerationCurve: 1.0,
        reverseSpeed: 12,
        reverseAcceleration: 14,
        brakingPower: 30,
        engineBraking: 6,

        steeringStrength: 2.1,        // radians/sec max yaw rate at low speed
        steeringResponse: 9.0,        // how fast steer angle reaches target
        highSpeedSteeringFactor: 0.62, // multiplier applied to steering at max speed

        grip: 10.0,        // moveDirection->heading convergence rate, normal driving
        driftGrip: 2.2,    // convergence rate while drifting (lower = more slide)
        driftSteeringMultiplier: 1.25,
        driftRotationStrength: 1.5,
        driftMinSpeed: 8,
        driftChargeThresholds: { blue: 0.5, purple: 1.3, gold: 2.4 }, // seconds
        driftBoostPower: { blue: 6, purple: 11, gold: 18 },           // speed added on release

        mass: 1100,
        collisionResistance: 0.65,
        stability: 0.78,
        momentumRetention: 0.82,

        boostPower: 1.28,     // multiplier on maxSpeed/acceleration while boosting
        boostDuration: 1.7,

        offRoadSpeedFactor: 0.72,
        offRoadGripFactor: 0.65,
        airControl: 0.35,

        wallBounceDamping: 0.55
    }
};

export function getVehicleConfig(id) {
    const config = VehicleConfigs[id];
    if (!config) throw new Error(`Unknown vehicle id: ${id}`);
    return config;
}

export function getDefaultVehicleId() {
    return 'street_drift_car';
}
