// Player-vs-traffic collision handling, distinguished from the shoulder/
// guardrail scrape (handled entirely inside PlayerVehicle.update -- speed
// penalty only, no bad-rep) per the brief: "do not treat wall scrapes the
// same as hitting innocent traffic." Single-player only for phase 1; onHit's
// call shape is intentionally not hostile to adding other players' cars
// later (a future multiplayer phase can pass a peer id instead of assuming
// "the" local player).
export function checkPlayerTrafficCollisions(player, trafficManager, config, onHit) {
  for (const car of trafficManager.activeCars) {
    if (car._hitCooldown > 0) continue;
    const dx = car.position.x - player.position.x, dz = car.position.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < config.collision.trafficHitDistance && dist > .001) {
      const nx = dx / dist, nz = dz / dist;
      player.speed *= .93;
      player.position.x -= nx * .12; player.position.z -= nz * .12;
      car.position.x += nx * .12; car.position.z += nz * .12;
      car._hitCooldown = config.collision.hitCooldownSec;
      onHit(car);
    }
  }
}
