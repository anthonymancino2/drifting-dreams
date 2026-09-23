import { RoadEdge } from './RoadEdge.js';
import { RoadNode } from './RoadNode.js';
import { CELL_SIZE } from './TileCatalog.js';

// rot2/headingToDeg implement the SAME rotation convention validated by the
// in-browser tile-snapping test (empty rotation = identity; a tile's local
// (x,z) socket maps to world via rot2 then + anchor). Every tile's local
// `in` socket direction is always (0,1) ("forward" in its own frame), so
// solving "what rotationDeg makes this tile's local-forward match the
// current world heading" reduces to a single atan2.
function rot2(x, z, deg) {
  const rad = deg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  return [x * cos + z * sin, -x * sin + z * cos];
}
function headingToDeg(hx, hz) { return Math.atan2(hx, hz) * 180 / Math.PI; }

// Resolves one tile placement given the catalog def + the incoming
// position/heading. Returns the tile's world anchor/rotation plus each out
// socket's resulting world position/heading, so the caller can both
// generate visual samples and continue the walk.
//
// deg solves rot2(inSocket.dir, deg) == worldHeading. Every non-merge
// socket's local dir is (0,1) (localDeg 0), so this reduces to the simple
// atan2(heading) case for them; yMerge's `in` sockets are (0,-1) (a 180°-
// rotated use of the same mesh), and this generalization is what makes
// that placement resolve correctly instead of landing 180° off.
function resolvePlacement(def, pos, heading, inSocket) {
  const worldDeg = headingToDeg(heading[0], heading[1]);
  const localDeg = headingToDeg(inSocket.dir[0], inSocket.dir[1]);
  const deg = worldDeg - localDeg;
  const [inLx, inLz] = inSocket.local;
  const [rix, riz] = rot2(inLx, inLz, deg);
  const anchor = [pos[0] - rix, pos[1] - riz];
  const outs = def.sockets.out.map(o => {
    const [wx, wz] = rot2(o.local[0], o.local[1], deg);
    const [dx, dz] = rot2(o.dir[0], o.dir[1], deg);
    return { pos: [anchor[0] + wx, anchor[1] + wz], dir: [dx, dz] };
  });
  return { anchor, deg, outs };
}

// Analytic sample generation -- straight = linear interpolation, curve =
// closed-form circular arc -- at roughly `sampleGap` spacing, appended to
// `out` as {p:{x,y,z}, t:{x,z}}.
function emitStraightSamples(out, anchor, deg, inLocal, outLocal, sampleGap) {
  const [ix, iz] = rot2(inLocal[0], inLocal[1], deg);
  const [ox, oz] = rot2(outLocal[0], outLocal[1], deg);
  const wx0 = anchor[0] + ix, wz0 = anchor[1] + iz;
  const wx1 = anchor[0] + ox, wz1 = anchor[1] + oz;
  const len = Math.hypot(wx1 - wx0, wz1 - wz0);
  const n = Math.max(1, Math.round(len / sampleGap));
  const tdir = [(wx1 - wx0) / len, (wz1 - wz0) / len];
  const startI = out.length ? 1 : 0; // skip the first point if it duplicates the previous tile's last point
  for (let i = startI; i <= n; i++) {
    const t = i / n;
    out.push({ p: { x: wx0 + (wx1 - wx0) * t, y: 0, z: wz0 + (wz1 - wz0) * t }, t: { x: tdir[0], z: tdir[1] } });
  }
}

function emitArcSamples(out, anchor, deg, arcDef, sampleGap) {
  const { center, radius, startAngleDeg, sweepDeg } = arcDef;
  const [cx, cz] = rot2(center[0], center[1], deg);
  const wcx = anchor[0] + cx, wcz = anchor[1] + cz;
  const arcLen = radius * Math.abs(sweepDeg) * Math.PI / 180;
  const n = Math.max(2, Math.round(arcLen / sampleGap));
  const sweepSign = Math.sign(sweepDeg);
  const startI = out.length ? 1 : 0;
  for (let i = startI; i <= n; i++) {
    const t = i / n;
    const thetaLocalDeg = startAngleDeg + sweepDeg * t;
    const thetaLocal = thetaLocalDeg * Math.PI / 180;
    // Local point on the circle (in the tile's own pre-rotation frame),
    // then rotate the OFFSET-FROM-CENTER by `deg` and add the world center.
    const lox = Math.cos(thetaLocal) * radius, loz = Math.sin(thetaLocal) * radius;
    const [rox, roz] = rot2(lox, loz, deg);
    // Tangent: derivative of (cosθ,sinθ) is (-sinθ,cosθ); sweep sign flips
    // the direction of travel along increasing/decreasing θ.
    const ltx = -Math.sin(thetaLocal) * sweepSign, ltz = Math.cos(thetaLocal) * sweepSign;
    const [rtx, rtz] = rot2(ltx, ltz, deg);
    const tlen = Math.hypot(rtx, rtz) || 1;
    out.push({ p: { x: wcx + rox, y: 0, z: wcz + roz }, t: { x: rtx / tlen, z: rtz / tlen } });
  }
}

export class RoadNetwork {
  constructor(roadCfg) {
    this.cfg = roadCfg;
    this.edges = new Map();
    this.nodes = new Map();
    this.tilePlacements = []; // [{typeId, anchor:[x,z], deg}] for the visual builder
    this.primaryEdges = [];
    this.bounds = null;
  }

  build(program, catalog) {
    const ctx = {
      pos: [0, 0], heading: [0, 1],
      samples: [], tiles: [],
      edgeCount: 0, nodeCount: 0,
      pendingIncoming: null // edgeId that should be linked as prevEdges of the next-created edge
    };
    this._walk(program, catalog, ctx, true);
    this._finalizeEdge(ctx, true); // close the final edge back to the start (loop closure)

    this._computeBounds();
    return this;
  }

  _newEdgeId() { return `edge${this.edges.size}`; }
  _newNodeId() { return `node${this.nodes.size}`; }

  _finalizeEdge(ctx, isLoopClosing = false) {
    if (ctx.samples.length < 2) return null;
    const id = this._newEdgeId();
    const edge = new RoadEdge(id, this.cfg).buildFromPoints(ctx.samples);
    edge.isPrimary = true;
    this.edges.set(id, edge);
    this.tilePlacements.push(...ctx.tiles);
    if (ctx.pendingIncoming) {
      for (const prevId of ctx.pendingIncoming) {
        edge.prevEdges.push({ edgeId: prevId });
        this.edges.get(prevId).nextEdges.push({ edgeId: id });
      }
    }
    if (ctx._pendingStartNodeId) {
      edge.startNodeId = ctx._pendingStartNodeId;
      this.nodes.get(ctx._pendingStartNodeId).outgoingEdges.push(id);
      delete ctx._pendingStartNodeId;
    }
    ctx.samples = []; ctx.tiles = [];
    ctx.pendingIncoming = [id];
    if (isLoopClosing && this._loopStartEdgeId) {
      const startEdge = this.edges.get(this._loopStartEdgeId);
      edge.nextEdges.push({ edgeId: this._loopStartEdgeId });
      startEdge.prevEdges.push({ edgeId: id });
    }
    if (!this._loopStartEdgeId) this._loopStartEdgeId = id;
    return id;
  }

  _walk(program, catalog, ctx, isPrimary) {
    for (const step of program) {
      const def = catalog[step.cmd];
      // Any single-in/single-out tile (straight, curve90, curve90L, and any
      // future addition) is handled generically here by whether it carries
      // an `arc` def -- only 'split'/'merge' (multi-socket junction tiles)
      // need bespoke handling below.
      if (def && def.sockets.out.length === 1 && !Array.isArray(def.sockets.in)) {
        for (let i = 0; i < (step.count ?? 1); i++) {
          const placed = resolvePlacement(def, ctx.pos, ctx.heading, def.sockets.in);
          ctx.tiles.push({ typeId: step.cmd, anchor: placed.anchor, deg: placed.deg });
          if (def.arc) emitArcSamples(ctx.samples, placed.anchor, placed.deg, def.arc, this.cfg.sampleGap);
          else emitStraightSamples(ctx.samples, placed.anchor, placed.deg, def.sockets.in.local, def.sockets.out[0].local, this.cfg.sampleGap);
          ctx.pos = placed.outs[0].pos; ctx.heading = placed.outs[0].dir;
        }
      } else if (step.cmd === 'split') {
        const def = catalog.ySplit;
        const placed = resolvePlacement(def, ctx.pos, ctx.heading, def.sockets.in);
        const priorEdgeId = this._finalizeEdge(ctx);
        const node = new RoadNode(this._newNodeId(), { x: ctx.pos[0], y: 0, z: ctx.pos[1] });
        if (priorEdgeId) {
          node.incomingEdges.push(priorEdgeId);
          this.edges.get(priorEdgeId).endNodeId = node.id;
        }
        this.tilePlacements.push({ typeId: 'ySplit', anchor: placed.anchor, deg: placed.deg });
        this.nodes.set(node.id, node);

        const branchEnds = [];
        for (const branch of step.branches) {
          const branchCtx = { pos: placed.outs[branchEnds.length].pos, heading: placed.outs[branchEnds.length].dir, samples: [], tiles: [], pendingIncoming: null };
          this._walk(branch.program, catalog, branchCtx, false);
          const edgeId = this._newEdgeId();
          const edge = new RoadEdge(edgeId, this.cfg).buildFromPoints(branchCtx.samples);
          edge.isPrimary = false;
          edge.startNodeId = node.id;
          this.edges.set(edgeId, edge);
          this.tilePlacements.push(...branchCtx.tiles);
          node.outgoingEdges.push(edgeId);
          // A split's next-edge list IS the branch choice -- populated here
          // (rather than left for _finalizeEdge, which only ever links a
          // single continuation) so PlayerVehicle/TrafficManager can treat
          // "walked off this edge's end" uniformly: look at edge.nextEdges,
          // length 1 means just continue, length >1 means ask the node.
          if (priorEdgeId) this.edges.get(priorEdgeId).nextEdges.push({ edgeId });
          edge.prevEdges.push({ edgeId: priorEdgeId });
          branchEnds.push({ edgeId, pos: branchCtx.pos, heading: branchCtx.heading, name: branch.name });
        }
        ctx._pendingBranchEnds = branchEnds; // consumed by the following 'merge' step
        ctx._splitNodeId = node.id;
      } else if (step.cmd === 'merge') {
        const branchEnds = ctx._pendingBranchEnds;
        if (!branchEnds || branchEnds.length !== 2) throw new Error('merge without a preceding split of exactly 2 branches');
        const def = catalog.yMerge;
        // yMerge is the ySplit mesh approached from the opposite direction,
        // which is a 180deg-rotated placement -- and a 180deg rotation
        // swaps local left/right. So branch 0 (world-left, "bypass") lands
        // on in[1] (the mesh's local-right in that rotation), and branch 1
        // (world-right, "shortcut") lands on in[0]. Verified algebraically:
        // this is the only pairing that gives both branches the same
        // anchor; the other pairing is off by a full tile-width in X.
        const placed = resolvePlacement(def, branchEnds[0].pos, branchEnds[0].heading, def.sockets.in[1]);
        const check = resolvePlacement(def, branchEnds[1].pos, branchEnds[1].heading, def.sockets.in[0]);
        const driftX = Math.abs(placed.anchor[0] - check.anchor[0]), driftZ = Math.abs(placed.anchor[1] - check.anchor[1]);
        if (driftX > 0.05 || driftZ > 0.05) {
          console.warn(`[RoadNetwork] merge branch mismatch: anchors differ by (${driftX.toFixed(3)}, ${driftZ.toFixed(3)}) -- branch lengths likely don't match`);
        }
        this.tilePlacements.push({ typeId: 'yMerge', anchor: placed.anchor, deg: placed.deg });
        const node = new RoadNode(this._newNodeId(), { x: branchEnds[0].pos[0], y: 0, z: branchEnds[0].pos[1] });
        node.incomingEdges.push(branchEnds[0].edgeId, branchEnds[1].edgeId);
        this.edges.get(branchEnds[0].edgeId).endNodeId = node.id;
        this.edges.get(branchEnds[1].edgeId).endNodeId = node.id;
        this.nodes.set(node.id, node);

        ctx.pos = placed.outs[0].pos; ctx.heading = placed.outs[0].dir;
        ctx.pendingIncoming = [branchEnds[0].edgeId, branchEnds[1].edgeId];
        ctx._pendingStartNodeId = node.id; // consumed by the next _finalizeEdge to link the post-merge edge back to this node
        delete ctx._pendingBranchEnds;
      } else {
        throw new Error(`unknown RoadLayout command: ${step.cmd}`);
      }
    }
  }

  _computeBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const edge of this.edges.values()) {
      for (const s of edge.samples) {
        if (s.p.x < minX) minX = s.p.x; if (s.p.x > maxX) maxX = s.p.x;
        if (s.p.z < minZ) minZ = s.p.z; if (s.p.z > maxZ) maxZ = s.p.z;
      }
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    // Walk the primary cycle explicitly (starting from the first edge ever
    // created) rather than trusting Map insertion order, so this stays
    // correct even if a future layout creates primary edges out of visit
    // order. A primary edge's immediate nextEdges are the non-primary
    // branch edges at a split, not another primary edge directly -- BFS
    // through those (all branches reconverge before the next primary edge,
    // so which one we happen to walk through doesn't matter) to find it.
    const nextPrimaryEdgeId = (fromId) => {
      const seen = new Set([fromId]);
      let frontier = this.edges.get(fromId).nextEdges.map(e => e.edgeId);
      while (frontier.length) {
        const id = frontier.shift();
        if (seen.has(id)) continue;
        seen.add(id);
        const e = this.edges.get(id);
        if (e.isPrimary) return id;
        frontier.push(...e.nextEdges.map(n => n.edgeId));
      }
      return null;
    };
    this.primaryEdges = [];
    this._primaryEdgeOffsets = [];
    let cum = 0, id = this._loopStartEdgeId, guard = 0;
    while (id && guard++ <= this.edges.size) {
      const edge = this.edges.get(id);
      this.primaryEdges.push(edge);
      this._primaryEdgeOffsets.push(cum);
      cum += edge.length;
      const nextId = nextPrimaryEdgeId(id);
      id = nextId && nextId !== this._loopStartEdgeId ? nextId : null;
    }
    this._primaryTotalLength = cum;
  }

  getEdge(id) { return this.edges.get(id); }
  getNode(id) { return this.nodes.get(id); }

  // Node an edge ends/starts at, used for transition lookups.
  nextEdgeIds(edgeId) { return this.edges.get(edgeId)?.nextEdges.map(e => e.edgeId) ?? []; }
  prevEdgeIds(edgeId) { return this.edges.get(edgeId)?.prevEdges.map(e => e.edgeId) ?? []; }

  // What a caller who has walked off the end of `edgeId` should do next:
  // either a plain single continuation, or a real branch decision at the
  // node bounding that end (chooseOutgoingEdge for the player's lane,
  // chooseWeightedOutgoingEdge for traffic's seeded roll).
  edgeTransitionOptions(edgeId) {
    const edge = this.edges.get(edgeId);
    const nextIds = edge.nextEdges.map(e => e.edgeId);
    const node = edge.endNodeId ? this.nodes.get(edge.endNodeId) : null;
    return { nextIds, node };
  }

  get totalPrimaryLength() { return this._primaryTotalLength; }

  // Approximate single-scalar "how far around the primary loop" progress
  // for a car that might be anywhere in the graph, including inside a
  // branch. Exact for a car on a primary edge; for a car inside the
  // diamond (on the shortcut/bypass), pins the value to wherever the split
  // node sits on the primary loop -- the diamond is short, so this is only
  // ever off by, at most, the diamond's own length, which is fine for the
  // LOD/recycling/spawn-distance uses this feeds (none need sub-diamond
  // precision).
  primaryArcFor(edgeId, localArc) {
    const edge = this.edges.get(edgeId);
    const i = this.primaryEdges.indexOf(edge);
    if (i >= 0) return this._primaryEdgeOffsets[i] + localArc;
    // Not a primary edge -- walk backward from its start node to find which
    // primary edge feeds it, and use that edge's own end-of-loop position.
    for (let j = 0; j < this.primaryEdges.length; j++) {
      if (this.primaryEdges[j].endNodeId === edge.startNodeId) {
        return this._primaryEdgeOffsets[j] + this.primaryEdges[j].length;
      }
    }
    return 0;
  }

  // Maps a position on the PRIMARY LOOP ONLY (ignoring the diamond's
  // interior branches entirely) to a world point -- used for recycling and
  // checkpoints, which only ever care about primary-loop progress
  // regardless of which branch a car actually took through the diamond.
  primaryFrame(primaryArc) {
    const a = this.wrapPrimaryArc(primaryArc);
    for (let i = this.primaryEdges.length - 1; i >= 0; i--) {
      if (a >= this._primaryEdgeOffsets[i]) return { edge: this.primaryEdges[i], localArc: a - this._primaryEdgeOffsets[i] };
    }
    return { edge: this.primaryEdges[0], localArc: 0 };
  }

  primaryPointAtArc(primaryArc, lateral = 0) {
    const { edge, localArc } = this.primaryFrame(primaryArc);
    return edge.pointAtArc(localArc, lateral);
  }

  wrapPrimaryArc(a) {
    const len = this._primaryTotalLength;
    return ((a % len) + len) % len;
  }
}
