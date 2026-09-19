export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
    return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function applyDeadZone(value, deadZone) {
    const absolute = Math.abs(value);
    if (absolute <= deadZone) return 0;
    const normalized = (absolute - deadZone) / (1 - deadZone);
    return Math.sign(value) * clamp(normalized, 0, 1);
}

export function responseCurve(value, exponent = 2) {
    return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

export function shortestAngleDelta(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

export function lerpAngle(from, to, t) {
    return from + shortestAngleDelta(from, to) * t;
}

export function dampAngle(current, target, lambda, dt) {
    const delta = shortestAngleDelta(current, target);
    return current + delta * (1 - Math.exp(-lambda * dt));
}
