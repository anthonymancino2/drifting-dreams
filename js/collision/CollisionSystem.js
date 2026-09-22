// Player-vs-traffic collision handling, distinguished from the shoulder/
// guardrail scrape (handled entirely inside PlayerVehicle.update -- speed
// penalty only, no bad-rep) per the brief: "do not treat wall scrapes the
// same as hitting innocent traffic." Single-player only for phase 1; onHit's
// call shape is intentionally not hostile to adding other players' cars
// later (a future multiplayer phase can pass a peer id instead of assuming
// "the" local player).
//
// Detection projects the raw player->car position vector onto the player's
// own tangent/side directions to get longitudinal (along-road) and lateral
// (across-lane) gaps -- NOT by subtracting the two cars' `.arc`/`.lateral`
// fields. Those fields are only as precise as the ring's sample spacing
// (~5.4m): FreewayRing.nearestSample returns the nearest SAMPLE's stored
// arc-length, not a continuously interpolated one, so it can jump by a
// full sample gap between adjacent frames as the nearest-sample index
// flips near a boundary -- independently for the player and for each car.
// Subtracting two independently-quantized values made that noise band
// (~5.4m) larger than the entire longitudinal threshold, so the check
// flickered in and out right at the moment of contact and missed hits that
// clearly should have registered. Projecting the raw position delta onto
// the tangent/side vectors (which vary smoothly between adjacent samples,
// unlike the cumulative arc length) sidesteps that quantization entirely.
//
// Also detects close calls: passing within a wider (but still tight) band
// around a car WITHOUT hitting it. Skill-reward feedback for tight weaving,
// which otherwise gets no in-game recognition at all beyond "you didn't
// crash." Debounced per car, same pattern as the hit cooldown, and
// explicitly skipped on a frame that already registered a hit so one
// contact can't also fire a close-call bonus.
export function checkPlayerTrafficCollisions(player, trafficManager, ring, config, onHit, onCloseCall) {
  const cfg = config.collision;
  const playerInfo = ring.nearestSample(player.position, player._sampleHint);

  for (const car of trafficManager.activeCars) {
    const dx = car.position.x - player.position.x, dz = car.position.z - player.position.z;
    const longGap = Math.abs(dx * playerInfo.tangent.x + dz * playerInfo.tangent.z);
    const lateralGap = Math.abs(dx * playerInfo.side.x + dz * playerInfo.side.z);

    const isHit = longGap <= cfg.trafficHitLongGap && lateralGap <= cfg.trafficHitLateralGap;
    if (isHit && car._hitCooldown <= 0) {
      const dist = Math.max(.001, Math.hypot(dx, dz));
      const nx = dx / dist, nz = dz / dist;
      player.speed *= .93;
      player.position.x -= nx * .12; player.position.z -= nz * .12;
      car.position.x += nx * .12; car.position.z += nz * .12;
      car._hitCooldown = cfg.hitCooldownSec;
      car._closeCallCooldown = cfg.closeCall.cooldownSec;
      onHit(car);
      continue;
    }

    const isNear = longGap <= cfg.closeCall.longGap && lateralGap <= cfg.closeCall.lateralGap;
    if (isNear && !isHit && car._closeCallCooldown <= 0) {
      car._closeCallCooldown = cfg.closeCall.cooldownSec;
      onCloseCall?.(car);
    }
  }
}
