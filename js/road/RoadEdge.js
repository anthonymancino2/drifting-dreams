import { clamp } from '../core/MathUtils.js';

// The de-wrapped evolution of FreewayRing.js for a branching network: same
// {p,t,side,arc} sample shape, same 8-step neighbor-walk in nearestSample,
// same lane-math formulas -- just OPEN (0..length, no modulo) instead of a
// closed loop. Every wrapArc/% in FreewayRing becomes a clamp; "walked past
// the last sample" is the signal RoadNetwork uses to trigger a node
// transition instead of wrapping around.
export class RoadEdge {
  constructor(id, roadCfg) {
    this.id = id;
    this.cfg = roadCfg;
    this.samples = [];
    this.length = 0;
    this.sampleCount = 0;
    this.isPrimary = false;
    // Set by RoadNetwork after all edges exist: {edgeId, laneOffset?}[] --
    // laneOffset lets a 2-in-1 merge edge know which of its lanes an
    // incoming edge feeds into, if ever needed; unused for the simple case.
    this.nextEdges = [];
    this.prevEdges = [];
    // The RoadNode id bounding each end, when that end is a real junction
    // (split/merge) rather than a plain edge-to-edge continuation -- lets a
    // caller that has walked off the end of this edge look up
    // node.chooseOutgoingEdge/chooseWeightedOutgoingEdge for a real branch
    // decision instead of just following a single nextEdges entry.
    this.startNodeId = null;
    this.endNodeId = null;
  }

  // samplePoints: array of {p:{x,y,z}, t:{x,z}} already walked at
  // roughly `sampleGap` spacing by the caller (RoadNetwork's tile-by-tile
  // analytic generation -- straight = lerp, curve = closed-form arc).
  buildFromPoints(samplePoints) {
    const up = { x: 0, y: 1, z: 0 };
    let acc = 0, prev = null;
    this.samples = samplePoints.map((sp, i) => {
      if (prev) acc += Math.hypot(sp.p.x - prev.x, sp.p.z - prev.z);
      prev = sp.p;
      const side = { x: sp.t.z, y: 0, z: -sp.t.x }; // cross(t, up), same convention as FreewayRing
      return { p: sp.p, t: sp.t, side, arc: acc };
    });
    this.sampleCount = this.samples.length - 1;
    this.length = this.samples[this.sampleCount].arc;
    return this;
  }

  frame(u) {
    const uu = clamp(u, 0, 1);
    const idx = clamp(Math.round(uu * this.sampleCount), 0, this.sampleCount);
    const s = this.samples[idx];
    return { p: s.p, t: s.t, side: s.side };
  }

  // Same 8-step neighbor walk as FreewayRing.nearestSample, clamped instead
  // of wrapped. Returns an extra `offEnd`/`offStart` flag when the walk hit
  // an edge boundary (the node-transition signal), which the old closed-loop
  // version never needed since it always wrapped instead of ending.
  _fullScan(pos) {
    const SAMPLES = this.samples, N = this.sampleCount;
    let best = Infinity, bi = 0;
    for (let i = 0; i <= N; i++) { const d = (SAMPLES[i].p.x - pos.x) ** 2 + (SAMPLES[i].p.z - pos.z) ** 2; if (d < best) { best = d; bi = i; } }
    return bi;
  }

  nearestSample(pos, hint) {
    const SAMPLES = this.samples, N = this.sampleCount;
    let bi;
    let offStart = false, offEnd = false;
    if (hint == null) {
      bi = this._fullScan(pos);
    } else {
      bi = clamp(hint, 0, N);
      let converged = false;
      for (let iter = 0; iter < 8; iter++) {
        const s = SAMPLES[bi];
        if (bi >= N) { offEnd = true; converged = true; break; }
        const ns = SAMPLES[bi + 1];
        const along = (pos.x - s.p.x) * s.t.x + (pos.z - s.p.z) * s.t.z;
        const segLen = Math.max(.0001, Math.hypot(ns.p.x - s.p.x, ns.p.z - s.p.z));
        if (along < 0) { if (bi === 0) { offStart = true; converged = true; break; } bi -= 1; continue; }
        if (along > segLen) { bi += 1; continue; }
        converged = true; break;
      }
      // The 8-step local walk assumes the car only moved a short distance
      // since the last hint -- true almost always, but a hard spinout or
      // collision knockback can occasionally move it further than that in
      // one frame, especially near a chicane where the path curves back
      // close to itself (the walk can "run out of steps" without ever
      // reaching the true nearest segment). Rather than silently keeping
      // whatever wrong-but-nearby-looking segment the walk stalled on --
      // which under-reports how far off the road the car actually is, the
      // exact way a shoulder clamp could fail to catch a real escape --
      // fall back to a full scan for the true nearest sample.
      if (!converged) { bi = this._fullScan(pos); offStart = offEnd = false; }
    }
    bi = clamp(bi, 0, N);
    const s = SAMPLES[bi];
    const dx = pos.x - s.p.x, dz = pos.z - s.p.z;
    // `arc`/`y` intentionally use the SAME "nearest sample's own stored
    // value" behavior as the original FreewayRing.nearestSample (not
    // continuously interpolated) -- callers that need sub-sample precision
    // (e.g. CollisionSystem) already use the tangent/side projection
    // technique instead of trusting `.arc` directly, exactly because this
    // quantization exists. `y` is interpolated toward whichever neighbor is
    // ahead, purely cosmetic (tiles are flat, ~0-0.5 units of relief).
    let ni;
    if (bi >= N) ni = N - 1;
    else if (bi <= 0) ni = Math.min(N, 1);
    else { const along = dx * s.t.x + dz * s.t.z; ni = clamp(bi + (along >= 0 ? 1 : -1), 0, N); }
    const ns = SAMPLES[ni];
    const segLen = Math.max(.0001, Math.hypot(ns.p.x - s.p.x, ns.p.z - s.p.z));
    const along = dx * s.t.x + dz * s.t.z;
    const frac = clamp(Math.abs(along) / segLen, 0, 1);
    const y = s.p.y + (ns.p.y - s.p.y) * frac;
    return {
      index: bi, arc: s.arc, y,
      lateral: dx * s.side.x + dz * s.side.z,
      tangent: s.t, side: s.side,
      offStart, offEnd
    };
  }

  pointAtArc(arc, lateral = 0) {
    const a = clamp(arc, 0, this.length);
    const bi = clamp(Math.floor((a / (this.length || 1)) * this.sampleCount), 0, this.sampleCount);
    const s = this.samples[bi];
    return { x: s.p.x + s.side.x * lateral, y: s.p.y + s.side.y * lateral, z: s.p.z + s.side.z * lateral };
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
