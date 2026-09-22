import * as THREE from 'three';
import { clamp } from '../core/MathUtils.js';

const up = new THREE.Vector3(0, 1, 0);
const vC = new THREE.Vector3();

// ES-module, lane-aware evolution of index.html's buildTougePoints/frame/
// buildTrackGeometry/SAMPLES/nearestSample/wrapArc/pointAtArc (index.html:192-286).
// Same technique (a closed CatmullRomCurve3 walked into an arc-length-indexed
// SAMPLES[] array of {p,t,side,arc}), same sample shape -- extended here with
// discrete lane lookups so traffic/player/camera code never touches SAMPLES
// directly, only ring.nearestSample()/ring.pointAtArc()/ring.laneCenterOffset().
export class FreewayRing {
  constructor(roadCfg) {
    this.cfg = roadCfg;
    this.points = [];
    this.curve = null;
    this.samples = [];
    this.sampleCount = 0;
    this.length = 0;
  }

  // Port of buildTougePoints (index.html:192-204), renamed -- same continuous
  // sine-wave-lateral-perturbation-around-an-ellipse technique, just tuned via
  // config for long straights/gentle curves instead of a technical circuit.
  static buildRingPoints(gen) {
    const { radiusX, radiusZ, waves, amp, numPoints, elevAmp } = gen;
    const pts = [];
    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * Math.PI * 2;
      const baseX = Math.cos(theta) * radiusX, baseZ = Math.sin(theta) * radiusZ;
      const tx = -Math.sin(theta) * radiusX, tz = Math.cos(theta) * radiusZ, tlen = Math.hypot(tx, tz);
      const nx = -tz / tlen, nz = tx / tlen, wave = Math.sin(theta * waves) * amp;
      const x = baseX + nx * wave, z = baseZ + nz * wave;
      const y = Math.max(2, 6 + Math.sin(theta * 3) * elevAmp * .4 + Math.cos(theta * waves * .5) * elevAmp * .6);
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }

  build() {
    this.points = FreewayRing.buildRingPoints(this.cfg.ring);
    this.curve = new THREE.CatmullRomCurve3(this.points, true, 'centripetal', .45);
    const trackLength = this.curve.getLength();
    const sampleN = Math.round(trackLength / this.cfg.sampleGap);
    this.sampleCount = sampleN;
    this.samples.length = 0;
    let acc = 0, prev = null;
    for (let i = 0; i <= sampleN; i++) {
      const u = i / sampleN, fr = this.frame(u);
      if (prev) acc += fr.p.distanceTo(prev);
      this.samples.push({ p: fr.p.clone(), t: fr.t.clone(), side: fr.side.clone(), arc: acc });
      prev = fr.p;
    }
    this.length = this.samples[sampleN].arc;
    return this;
  }

  frame(u) {
    const uu = (u % 1 + 1) % 1;
    const p = this.curve.getPointAt(uu);
    const t = this.curve.getTangentAt(uu).normalize();
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    return { p, t, side };
  }

  wrapArc(a) { return ((a % this.length) + this.length) % this.length; }

  nearestSample(pos, hint) {
    const { samples: SAMPLES, sampleCount: N } = this;
    let bi;
    if (hint == null) {
      let best = 1e9; bi = 0;
      for (let i = 0; i < N; i++) { const d = SAMPLES[i].p.distanceToSquared(pos); if (d < best) { best = d; bi = i; } }
    } else {
      bi = hint;
      for (let iter = 0; iter < 8; iter++) {
        const s = SAMPLES[bi], ns = SAMPLES[(bi + 1) % N];
        const along = (pos.x - s.p.x) * s.t.x + (pos.z - s.p.z) * s.t.z;
        const segLen = Math.max(.0001, Math.hypot(ns.p.x - s.p.x, ns.p.z - s.p.z));
        if (along < 0) { bi = (bi - 1 + N) % N; continue; }
        if (along > segLen) { bi = (bi + 1) % N; continue; }
        break;
      }
    }
    const s = SAMPLES[bi], dx = pos.x - s.p.x, dz = pos.z - s.p.z;
    const along = dx * s.t.x + dz * s.t.z, dir = along >= 0 ? 1 : -1, ni = (bi + dir + N) % N, ns = SAMPLES[ni];
    const segLen = Math.max(.0001, Math.hypot(ns.p.x - s.p.x, ns.p.z - s.p.z)), frac = clamp(Math.abs(along) / segLen, 0, 1);
    const u = (((bi + dir * frac) / N) % 1 + 1) % 1, preciseY = this.curve.getPointAt(u).y;
    return { index: bi, arc: s.arc, lateral: dx * s.side.x + dz * s.side.z, tangent: s.t, side: s.side, y: preciseY };
  }

  pointAtArc(arc, lateral = 0) {
    const a = this.wrapArc(arc);
    const bi = clamp(Math.floor(a / this.length * this.sampleCount), 0, this.sampleCount - 1);
    const s = this.samples[bi];
    return vC.set(s.p.x + s.side.x * lateral, s.p.y + s.side.y * lateral, s.p.z + s.side.z * lateral);
  }

  laneCenterOffset(laneIndex) {
    const total = this.cfg.laneCount * this.cfg.laneWidth;
    return -total / 2 + this.cfg.laneWidth * (laneIndex + 0.5);
  }

  laneIndexFromLateral(lateral) {
    const total = this.cfg.laneCount * this.cfg.laneWidth;
    return clamp(Math.floor((lateral + total / 2) / this.cfg.laneWidth), 0, this.cfg.laneCount - 1);
  }

  get halfWidth() { return this.cfg.laneCount * this.cfg.laneWidth / 2 + this.cfg.shoulderWidth; }
  get roadHalfWidth() { return this.cfg.laneCount * this.cfg.laneWidth / 2; }
}
