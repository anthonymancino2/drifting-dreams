// Central tuning object. Every gameplay constant lives here so values can be
// retuned without hunting through the rest of the codebase.
export const GAME_CONFIG = {
  road: {
    laneCount: 4,
    laneWidth: 4.1,             // matches the old game's traffic lateral slot spacing
    shoulderWidth: 3,
    sampleGap: 5.4,
    ring: { radiusX: 1400, radiusZ: 1150, waves: 6, amp: 70, numPoints: 260, elevAmp: 5 }, // starting guess, expect by-feel iteration
    speedLimitMph: 65
  },
  player: {
    accelGas: 18, accelNitro: 32, brakeDecel: 30,
    rollingDragBase: .65, rollingDragPerSpeed: .012,
    steerLerpRate: 14,
    yawResponse: 10.5, yawResponseRecover: 7.5,
    grip: 12.5,
    reverseSpeed: -8,
    nitro: { maxBoostMultiplier: 1.25, drainPerSec: .24, rechargePerSec: .004 }
  },
  camera: {
    chaseDist: 6.4, chaseHeight: 2.35,
    hoodOffset: 1.1, hoodHeight: 1.22,
    followLerpRate: 7
  },
  traffic: {
    laneChangeCooldownSec: 4,
    minFollowGap: 6,
    timeHeadwaySec: 1.3,
    cruiseSpeedMphRange: [45, 68],
    pool: { maxActive: 28, spawnAheadDist: 260, despawnBehindDist: 80 },
    assetPool: [3, 4, 5, 6, 18],   // City Cab / Trailblazer / Commuter / Sedan LX + Cargo Van(18) as box-truck placeholder
    seed: 1337
  },
  collision: {
    // Longitudinal (along-road) and lateral (across-lane) gaps checked
    // separately -- see CollisionSystem.js for why a single circular radius
    // doesn't work here. ~4.2 is roughly one car length (nose-to-tail
    // contact in the same lane); ~1.7 is roughly two cars' combined
    // half-widths (genuine side overlap, not just "in the next lane over").
    trafficHitLongGap: 4.2,
    trafficHitLateralGap: 1.7,
    trafficHitScorePenalty: 1,
    trafficHitBadRep: 1,
    hitCooldownSec: .5,
    shoulderSpeedPenaltyPerSec: 2
  },
  race: {
    checkpointCount: 6,
    targetPaceMph: 58,
    checkpointGraceSec: 3,
    checkpointBonus: 3,
    missedCheckpointPenalty: 0
  },
  // PLACEHOLDER ONLY -- reserved shape so a future police/wanted-star phase doesn't
  // require restructuring config. No PoliceManager exists yet; inert in phase 1.
  police: {
    maxStars: 3,
    detection: { radiusM: null, fovDeg: null, requiresLineOfSight: null },
    escape: { outOfFovDurationSec: null, exitPenaltySec: null }
  }
};
