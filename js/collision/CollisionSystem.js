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
export function checkPlayerTrafficCollisions(player, trafficManager, ring, config, onHit) {
  const cfg = config.collision;
  const playerInfo = ring.nearestSample(player.position, player._sampleHint);

  for (const car of trafficManager.activeCars) {
    if (car._hitCooldown > 0) continue;
    const dx = car.position.x - player.position.x, dz = car.position.z - player.position.z;

    const longGap = Math.abs(dx * playerInfo.tangent.x + dz * playerInfo.tangent.z);
    if (longGap > cfg.trafficHitLongGap) continue;

    const lateralGap = Math.abs(dx * playerInfo.side.x + dz * playerInfo.side.z);
    if (lateralGap > cfg.trafficHitLateralGap) continue;

    const dist = Math.max(.001, Math.hypot(dx, dz));
    const nx = dx / dist, nz = dz / dist;
    player.speed *= .93;
    player.position.x -= nx * .12; player.position.z -= nz * .12;
    car.position.x += nx * .12; car.position.z += nz * .12;
    car._hitCooldown = cfg.hitCooldownSec;
    onHit(car);
  }
}
