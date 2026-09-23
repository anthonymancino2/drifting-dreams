// Central tuning object. Every gameplay constant lives here so values can be
// retuned without hunting through the rest of the codebase.
export const GAME_CONFIG = {
  road: {
    laneCount: 4,
    laneWidth: 6.0,             // exact fit for the modular kit's tile at TileCatalog's TILE_SCALE=2 (4 * 6.0 = 24.0, flush with the tile edge)
    shoulderWidth: 6,
    sampleGap: 5.4,
    speedLimitMph: 65,
    // Tuning for the branching tile network (RoadNetwork/RoadNode) -- see
    // js/road/RoadNetwork.js and RoadLayout.js for the graph itself.
    network: {
      decisionWindow: 45,     // meters from a 2-way node's end at which an uncommitted traffic car rolls its branch choice
      // Indexed to match RoadNode.outgoingEdges order, which is [shortcut, bypass]
      // (left/right physical sockets) for this layout -- shortcut gets the larger
      // share (0.65) so it actually lives up to its "heavier traffic" billing.
      branchWeights: [0.65, 0.35], // [shortcut, bypass]
      signDistance: 90,       // meters out that the HUD's junction sign starts showing
      nodeTransitionWindow: 15 // meters within a shared node where collision/checkpoint checks must consider adjacent edges
    }
  },
  player: {
    // Cut ~33%/31% from the old values -- not a top-speed cap (topMph per
    // vehicle is untouched, a hypercar still eventually hits 220), just a
    // longer ramp to get there. Most actual driving now happens at a
    // moderate, weave-friendly pace; full speed is for genuinely open
    // stretches, not the default state.
    accelGas: 12, accelNitro: 22, brakeDecel: 30,
    rollingDragBase: .65, rollingDragPerSpeed: .012,
    steerLerpRate: 14,
    yawResponse: 10.5, yawResponseRecover: 7.5,
    grip: 12.5,
    reverseSpeed: -8,
    nitro: { maxBoostMultiplier: 1.25, drainPerSec: .24, rechargePerSec: .004 },
    // Handbrake slide/handling feel only -- no boost tiers, no drift score,
    // that reward system stayed with the old circuit racer. This is purely
    // about how the car handles: rear grip drops so the car steps out and
    // holds an angle through a weave, at a small speed cost for the traction
    // loss (not a bonus -- there's no scoring tied to this anymore).
    drift: { minSpeed: 9, grip: 3.2, yawResponse: 6.5, dragBonus: .35, maxSlipAngle: 1.35 }
  },
  camera: {
    chaseDist: 6.4, chaseHeight: 2.35,
    hoodOffset: 1.1, hoodHeight: 1.22,
    followLerpRate: 7,
    baseFov: 65, driftFovBoost: 8
  },
  traffic: {
    laneChangeCooldownSec: 4,
    minFollowGap: 6,
    timeHeadwaySec: 1.1,
    cruiseSpeedMphRange: [45, 68],
    // Bumped again (36 -> 90) for the ~5x-longer modular track -- pool size
    // needs to scale with track length or density (and the "where did the
    // traffic go" feeling) drops proportionally; keeps roughly the same
    // spacing-between-cars as before on the bigger loop.
    pool: { maxActive: 90, spawnAheadDist: 320, despawnBehindDist: 100 },
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
    // Bumped from 2 -- paired with PlayerVehicle's harder edge-of-shoulder
    // clamp (kills outward velocity on contact, not just a gentle push
    // back), so running off-road now actually costs real speed and reads
    // as hitting a boundary, not gliding past an invisible line.
    shoulderSpeedPenaltyPerSec: 10,
    // Close call: passing a car within this band WITHOUT hitting it (wider
    // than the hit gaps above, still tight -- comfortably under half a lane
    // width so it never fires for a car just cruising in the next lane
    // over) rewards the actual skill of tight weaving, which otherwise gets
    // no feedback at all beyond "nothing bad happened."
    closeCall: {
      longGap: 7.5, lateralGap: 2.6,
      scoreBonus: 1, cooldownSec: 1.2,
      slowMoScale: .82, slowMoDurationSec: .28,
      fovKick: 6
    }
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
