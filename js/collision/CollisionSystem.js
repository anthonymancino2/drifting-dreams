// Player-vs-traffic collision handling, distinguished from the shoulder/
// guardrail scrape (handled entirely inside PlayerVehicle.update -- speed
// penalty only, no bad-rep) per the brief: "do not treat wall scrapes the
// same as hitting innocent traffic." Single-player only for phase 1; onHit's
// call shape is intentionally not hostile to adding other players' cars
// later (a future multiplayer phase can pass a peer id instead of assuming
// "the" local player).
//
// Detection is gated on longitudinal (along-road) and lateral (across-lane)
// gaps separately, not a single circular radius -- a plain radius can't tell
// "bumper-to-bumper in the same lane" (small longitudinal gap, should hit)
// apart from "side by side in the next lane" (small radius too, at the same
// arc position, should NOT hit). A single radius wide enough to reliably
// catch the former (~one car length, ~4m) is also wide enough to
// false-trigger on the latter, since lanes are only ~4.1m apart -- exactly
// why a generous single-radius threshold read as "driving through
// holograms" one moment and "too strict" the next.
export function checkPlayerTrafficCollisions(player, trafficManager, ring, config, onHit) {
  const cfg = config.collision;
  for (const car of trafficManager.activeCars) {
    if (car._hitCooldown > 0) continue;
    const arcGap = ring.wrapArc(car.arc - player.arc);
    const longGap = Math.min(arcGap, ring.length - arcGap);
    if (longGap > cfg.trafficHitLongGap) continue;

    const carInfo = ring.nearestSample(car.position, car._sampleHint);
    const lateralGap = Math.abs(carInfo.lateral - player.lateral);
    if (lateralGap > cfg.trafficHitLateralGap) continue;

    const dx = car.position.x - player.position.x, dz = car.position.z - player.position.z;
    const dist = Math.max(.001, Math.hypot(dx, dz));
    const nx = dx / dist, nz = dz / dist;
    player.speed *= .93;
    player.position.x -= nx * .12; player.position.z -= nz * .12;
    car.position.x += nx * .12; car.position.z += nz * .12;
    car._hitCooldown = cfg.hitCooldownSec;
    onHit(car);
  }
}
