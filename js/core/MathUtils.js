// Small standalone math helpers shared across modules (ported from inline
// helpers in the original index.html, kept dependency-free of THREE where possible).

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }

export function angDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angDamp(cur, target, lambda, dt) {
  return cur + angDelta(cur, target) * (1 - Math.exp(-lambda * dt));
}

export function dampTowardZero(value, drag, dt) {
  if (value > 0) return Math.max(0, value - drag * dt);
  if (value < 0) return Math.min(0, value + drag * dt);
  return value;
}

// Deterministic PRNG (mulberry32) -- used anywhere traffic needs randomness so
// results can eventually be reproduced across clients for synced multiplayer
// traffic. Never use Math.random() in traffic/spawn code; use a seeded stream.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
