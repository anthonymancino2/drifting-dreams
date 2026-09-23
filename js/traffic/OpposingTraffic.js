import * as THREE from 'three';
import { buildCarVisual, placeCarVisual } from '../vehicles/CarVisual.js';
import { statMultipliers, vehicleByAssetIndex, mphToMs } from '../vehicles/VehicleRegistry.js';
import { mulberry32 } from '../core/MathUtils.js';
import { RoadEdge } from '../road/RoadEdge.js';
import { MEDIAN_GAP, THEME_PALETTES } from '../road/roadThemes.js';

const POOL_SIZE = 14;
const SPAWN_AHEAD = 260;
const DESPAWN_BEHIND = 80;

// Builds a straight-line RoadEdge bridging two world points -- used to
// paper over the diamond's gap (see buildSkeleton below) with plain
// linear-interpolation samples, the same technique RoadNetwork itself
// uses for a 'straight' tile.
function makeBridgeEdge(id, fromPos, toPos, roadCfg) {
  const dx = toPos.x - fromPos.x, dz = toPos.z - fromPos.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const t = { x: dx / len, z: dz / len };
  const n = Math.max(1, Math.round(len / roadCfg.sampleGap));
  const pts = [];
  for (let i = 0; i <= n; i++) { const f = i / n; pts.push({ p: { x: fromPos.x + dx * f, y: 0, z: fromPos.z + dz * f }, t }); }
  return new RoadEdge(id, roadCfg).buildFromPoints(pts);
}

// The network's primary loop skips straight over the diamond (edge0 ends at
// the split, edge3 starts at the merge -- different world points, ~70m
// apart). Fine for gameplay (checkpoints/recycling only care about primary
// *progress*, not a continuous path), but opposing traffic needs an actual
// continuous curve to drive smoothly along, or a car's position would jump
// across that gap the instant its arc crossed it. So: walk network's
// primary cycle and splice in a straight bridge edge wherever two
// consecutive primary edges aren't actually node-adjacent (i.e. wherever a
// branch intervenes) -- exactly the "phantom straight edge connecting the
// pre-split node directly to the post-merge node" the plan called for.
function buildSkeleton(network, roadCfg) {
  const segs = [];
  const primary = network.primaryEdges;
  for (let i = 0; i < primary.length; i++) {
    segs.push(primary[i]);
    const next = primary[(i + 1) % primary.length];
    if (primary[i].endNodeId !== next.startNodeId) {
      const fromNode = network.getNode(primary[i].endNodeId);
      const toNode = network.getNode(next.startNodeId);
      segs.push(makeBridgeEdge(`oppBridge${i}`, fromNode.position, toNode.position, roadCfg));
    }
  }
  const offsets = []; let cum = 0;
  for (const e of segs) { offsets.push(cum); cum += e.length; }
  return { segs, offsets, totalLength: cum };
}

// Purely cosmetic opposing-direction traffic on a parallel carriageway,
// mirroring the divided-highway look real freeways have. Not part of
// gameplay -- no collision with the player, no lane-following/gap-checking,
// just a steady reverse-direction stream recycled the same wrap-aware way
// as the real TrafficManager, running along a reduced "skeleton" loop (see
// buildSkeleton) rather than the full branching network -- it never needs
// to represent the diamond's actual branch choice, only *a* continuous path
// roughly paralleling the main road.
export class OpposingTraffic {
  constructor(scene, network, roadCfg, carAssets, seed = 4242) {
    this.scene = scene;
    this.network = network;
    this.cfg = roadCfg;
    this.rand = mulberry32(seed);
    this.skeleton = buildSkeleton(network, roadCfg);
    this.oppCenterOffset = network.primaryEdges[0].halfWidth + MEDIAN_GAP + network.primaryEdges[0].roadHalfWidth;
    this.pool = this._buildPool(carAssets);
    this._buildVisual(scene);
  }

  get oppRoadHalfWidth() { return this.network.primaryEdges[0].roadHalfWidth; }
  get oppCenterLateral() { return this.oppCenterOffset; }

  _skeletonFrame(arc) {
    const { segs, offsets, totalLength } = this.skeleton;
    const a = ((arc % totalLength) + totalLength) % totalLength;
    for (let i = segs.length - 1; i >= 0; i--) if (a >= offsets[i]) return { edge: segs[i], localArc: a - offsets[i] };
    return { edge: segs[0], localArc: 0 };
  }

  _pointAtArc(arc, lateral) { const { edge, localArc } = this._skeletonFrame(arc); return edge.pointAtArc(localArc, lateral); }
  _frame(arc) { const { edge, localArc } = this._skeletonFrame(arc); return edge.frame(localArc / (edge.length || 1)); }
  _wrapArc(a) { const len = this.skeleton.totalLength; return ((a % len) + len) % len; }

  // Plain flat asphalt strip, no lane dashes/curbs/guardrails -- the
  // modular kit has no second-carriageway tile, so this is a deliberately
  // minimal stand-in just so the opposing cars have visible pavement under
  // them rather than driving on bare ground.
  _buildVisual(scene) {
    const pal = THEME_PALETTES.us101;
    const mat = new THREE.MeshStandardMaterial({ color: pal.road, roughness: .8, metalness: .1, side: THREE.DoubleSide });
    const roadHalf = this.oppRoadHalfWidth;
    for (const edge of this.skeleton.segs) {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= edge.sampleCount; i++) {
        const s = edge.samples[i];
        for (const x of [-1, 1]) {
          pos.push(s.p.x + s.side.x * (this.oppCenterOffset + roadHalf * x), -0.15, s.p.z + s.side.z * (this.oppCenterOffset + roadHalf * x));
          uv.push((x + 1) / 2, i / edge.sampleCount * 20);
        }
      }
      for (let i = 0; i < edge.sampleCount; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  _buildPool(carAssets) {
    const assetPool = [3, 4, 5, 6, 17, 18];
    const pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const assetIndex = assetPool[Math.floor(this.rand() * assetPool.length)];
      const root = new THREE.Group();
      this.scene.add(root);
      const visual = buildCarVisual(root, assetIndex, null, carAssets);
      const spec = vehicleByAssetIndex(assetIndex);
      const statMods = spec ? statMultipliers(spec) : { topMs: mphToMs(100), accelMult: 1, handlingMult: 1 };
      pool.push({
        root, model: visual.model, wheels: visual.wheels, groundLift: visual.groundLift,
        sirenLights: visual.sirenLights, statMods,
        position: new THREE.Vector3(), heading: 0, moveHeading: 0, steer: 0, speed: 0, rollVisual: 0,
        arc: 0, laneIndex: 0
      });
    }
    return pool;
  }

  _laneLateral(laneIndex) {
    return this.oppCenterOffset - this.oppRoadHalfWidth + this.cfg.laneWidth * (laneIndex + .5);
  }

  _place(car, arc, laneIndex) {
    car.arc = arc; car.laneIndex = laneIndex;
    car.position.copy(this._pointAtArc(arc, this._laneLateral(laneIndex)));
    const fr = this._frame(arc);
    // Facing the reverse of the skeleton's own tangent -- these travel
    // toward decreasing arc, opposite the player's own direction of travel.
    car.heading = Math.atan2(-fr.t.x, -fr.t.z);
    car.moveHeading = car.heading;
    car.speed = 20 + this.rand() * 10; // ~45-67mph, roughly matching main traffic's cruise feel
  }

  spawnInitial(playerPrimaryArc) {
    const spacing = this.skeleton.totalLength / this.pool.length;
    for (let i = 0; i < this.pool.length; i++) {
      const arc = this._wrapArc(playerPrimaryArc + i * spacing + this.rand() * spacing * .5);
      this._place(this.pool[i], arc, Math.floor(this.rand() * this.cfg.laneCount));
    }
  }

  update(dt, playerPrimaryArc, raceTime) {
    for (const car of this.pool) {
      car.arc = this._wrapArc(car.arc - car.speed * dt);
      car.position.copy(this._pointAtArc(car.arc, this._laneLateral(car.laneIndex)));
      const fr = this._frame(car.arc);
      car.heading = Math.atan2(-fr.t.x, -fr.t.z);
      car.moveHeading = car.heading;
      placeCarVisual(car, dt, raceTime);

      // Same wrap-aware "has this fallen behind the player" check the real
      // TrafficManager uses -- see its _recycleIfBehind for why the naive
      // one-sided distance version is wrong on a closed loop.
      const aheadDist = this._wrapArc(car.arc - playerPrimaryArc);
      const behindAmount = this.skeleton.totalLength - aheadDist;
      if (behindAmount > DESPAWN_BEHIND && behindAmount < this.skeleton.totalLength / 2) {
        const arc = this._wrapArc(playerPrimaryArc + SPAWN_AHEAD + this.rand() * 80);
        this._place(car, arc, Math.floor(this.rand() * this.cfg.laneCount));
      }
    }
  }
}
