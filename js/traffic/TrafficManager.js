import * as THREE from 'three';
import { clamp, lerp, angDamp, mulberry32 } from '../core/MathUtils.js';
import { buildCarVisual, placeCarVisual } from '../vehicles/CarVisual.js';
import { statMultipliers, vehicleByAssetIndex, mphToMs } from '../vehicles/VehicleRegistry.js';
import { TrafficVehicle } from './TrafficVehicle.js';

const CAR_LENGTH = 4.5;
const LANE_CHANGE_DURATION = 1.2;
const LOD_DISTANCE = 150;

// The single biggest net-new system in the freeway pivot -- the old game had
// zero AI-vs-AI collision avoidance (only player-vs-AI distance-check
// existed, index.html:1004). Builds a fixed pool of TrafficVehicle wrappers
// once, then every frame does per-lane leader lookup / car-following / a
// lightweight lane-change heuristic / distance-based LOD / recycling. Every
// random decision draws from a seeded PRNG (never bare Math.random()) so
// traffic generation can eventually be made deterministic across clients for
// synced multiplayer -- no networking code is built here, this is just the
// seam.
//
// Ported from a single closed-loop ring to the branching RoadNetwork: a car
// now carries {edgeId, arc} instead of one global arc, lane buckets are
// keyed per-edge (Map<edgeId, laneBuckets[]>) since two cars' `.arc` values
// only compare directly when they're on the SAME edge, and cars roll a
// weighted branch choice (road.network.branchWeights) once they're within
// road.network.decisionWindow of a split -- see TrafficVehicle's
// _committedNextEdgeId for why that has to happen before the node, not at it.
export class TrafficManager {
  constructor(scene, network, config, carAssets) {
    this.scene = scene;
    this.network = network;
    this.cfg = config;
    this.rand = mulberry32(config.traffic.seed);
    this.pool = this._buildPool(carAssets);
    this._laneBuckets = new Map(); // edgeId -> lane[] -> car[]
    this._frameCounter = 0;
  }

  _buildPool(carAssets) {
    const { maxActive, } = this.cfg.traffic.pool;
    const pool = [];
    for (let i = 0; i < maxActive; i++) {
      const assetIndex = this._pickAssetIndex();
      const root = new THREE.Group();
      this.scene.add(root);
      const visual = buildCarVisual(root, assetIndex, this._pickTint(), carAssets);
      const spec = vehicleByAssetIndex(assetIndex);
      const statMods = spec ? statMultipliers(spec) : { topMs: mphToMs(100), accelMult: 1, handlingMult: 1 };
      pool.push(new TrafficVehicle(root, visual, assetIndex, statMods));
    }
    return pool;
  }

  _pickAssetIndex() {
    const pool = this.cfg.traffic.assetPool;
    return pool[Math.floor(this.rand() * pool.length)];
  }

  _pickTint() {
    // Occasional recolor for variety among repeats of the same civilian model --
    // null lets the model keep its default paint most of the time.
    if (this.rand() > .55) return null;
    const palette = [0xffc400, 0xe73635, 0x178cff, 0x15cc87, 0xa754ee, 0xff6b1b, 0xf1f1f1, 0x8c8c8c];
    return palette[Math.floor(this.rand() * palette.length)];
  }

  _pickCruiseSpeedMs() {
    const [lo, hi] = this.cfg.traffic.cruiseSpeedMphRange;
    return mphToMs(lo + this.rand() * (hi - lo));
  }

  get activeCars() { return this.pool.filter(c => c.active); }

  spawnInitial(playerPrimaryArc) {
    const n = this.pool.length;
    const totalLen = this.network.totalPrimaryLength;
    for (let i = 0; i < n; i++) {
      const car = this.pool[i];
      const laneIndex = Math.floor(this.rand() * this.cfg.road.laneCount);
      const spacing = totalLen / n;
      const jitter = (this.rand() - .5) * spacing * .3;
      const primaryArc = this.network.wrapPrimaryArc(playerPrimaryArc + spacing * i + jitter + 20);
      const { edge, localArc } = this.network.primaryFrame(primaryArc);
      this._placeCar(car, edge.id, localArc, laneIndex);
      car.active = true;
    }
  }

  _placeCar(car, edgeId, arc, laneIndex) {
    const edge = this.network.getEdge(edgeId);
    car.edgeId = edgeId;
    car.arc = arc;
    car.laneIndex = laneIndex;
    car.targetLaneIndex = laneIndex;
    car.laneBlendT = 1;
    car._committedNextEdgeId = null;
    car.cruiseSpeedMs = this._pickCruiseSpeedMs();
    car.speed = car.cruiseSpeedMs;
    car._sampleHint = null;
    car._laneChangeCooldown = this.rand() * this.cfg.traffic.laneChangeCooldownSec;
    car._hitCooldown = 0;
    car._closeCallCooldown = 0;
    const lateral = edge.laneCenterOffset(laneIndex);
    const p = edge.pointAtArc(arc, lateral);
    car.position.copy(p);
    const fr = edge.frame(arc / (edge.length || 1));
    car.heading = Math.atan2(fr.t.x, fr.t.z);
    car.moveHeading = car.heading;
  }

  update(dt, playerPrimaryArc, raceTime) {
    this._frameCounter++;
    this._bucketByLane();

    for (const car of this.pool) {
      if (!car.active) continue;
      if (car._hitCooldown > 0) car._hitCooldown = Math.max(0, car._hitCooldown - dt);
      if (car._closeCallCooldown > 0) car._closeCallCooldown = Math.max(0, car._closeCallCooldown - dt);
      car.primaryArc = this.network.primaryArcFor(car.edgeId, car.arc);
      const distFromPlayer = this.network.wrapPrimaryArc(car.primaryArc - playerPrimaryArc);
      const isNear = Math.min(distFromPlayer, this.network.totalPrimaryLength - distFromPlayer) < LOD_DISTANCE;

      this._updateRouteCommitment(car);
      this._updateLaneChange(car, dt);
      this._updateSpeed(car, dt);
      this._updateSteerAndHeading(car, dt, isNear);
      this._integratePosition(car, dt);
      this._handleEdgeTransition(car);
      this._clampToRoad(car);

      if (isNear || (this._frameCounter + car._lodFrameOffset) % 4 === 0) {
        placeCarVisual(car, isNear ? dt : dt * 4, raceTime);
      }

      this._recycleIfBehind(car, playerPrimaryArc);
    }
  }

  // Rolls a car's branch choice once it's close enough to a split to commit,
  // so leader/follower lookups (below) can already treat that edge as a
  // real continuation instead of the lane going empty right at the seam.
  _updateRouteCommitment(car) {
    if (car._committedNextEdgeId) return;
    const edge = this.network.getEdge(car.edgeId);
    if (edge.nextEdges.length <= 1) return;
    if (edge.length - car.arc > this.cfg.road.network.decisionWindow) return;
    const node = this.network.getNode(edge.endNodeId);
    car._committedNextEdgeId = node.chooseWeightedOutgoingEdge(this.rand, this.cfg.road.network.branchWeights);
  }

  _bucketByLane() {
    this._laneBuckets.clear();
    for (const car of this.pool) {
      if (!car.active) continue;
      let buckets = this._laneBuckets.get(car.edgeId);
      if (!buckets) { buckets = Array.from({ length: this.cfg.road.laneCount }, () => []); this._laneBuckets.set(car.edgeId, buckets); }
      buckets[car.targetLaneIndex].push(car);
    }
    for (const buckets of this._laneBuckets.values()) for (const bucket of buckets) bucket.sort((a, b) => a.arc - b.arc);
  }

  _laneBucket(edgeId, laneIndex) { return this._laneBuckets.get(edgeId)?.[laneIndex] ?? []; }

  // Same-edge lane bucket, extended across a boundary the car is close to:
  // a leader is also searched for in whichever edge this car has already
  // committed to (or the edge's sole next edge, if uncommitted -- true for
  // every non-split boundary), positioned virtually at edge.length+arc past
  // the end of the current edge; a follower is searched for symmetrically
  // across every prevEdge, positioned virtually at -(prevEdge.length-arc).
  _leaderAndFollowerInLane(car) {
    const edge = this.network.getEdge(car.edgeId);
    let leader = null, follower = null, bestAheadGap = Infinity, bestBehindGap = Infinity;

    for (const other of this._laneBucket(car.edgeId, car.targetLaneIndex)) {
      if (other === car) continue;
      if (other.arc > car.arc) { const g = other.arc - car.arc; if (g < bestAheadGap) { bestAheadGap = g; leader = other; } }
      else { const g = car.arc - other.arc; if (g < bestBehindGap) { bestBehindGap = g; follower = other; } }
    }

    const aheadEdgeId = car._committedNextEdgeId ?? (edge.nextEdges.length === 1 ? edge.nextEdges[0].edgeId : null);
    if (aheadEdgeId) {
      for (const other of this._laneBucket(aheadEdgeId, car.targetLaneIndex)) {
        const g = (edge.length - car.arc) + other.arc;
        if (g < bestAheadGap) { bestAheadGap = g; leader = other; }
      }
    }
    for (const prev of edge.prevEdges) {
      const prevEdge = this.network.getEdge(prev.edgeId);
      for (const other of this._laneBucket(prev.edgeId, car.targetLaneIndex)) {
        const g = car.arc + (prevEdge.length - other.arc);
        if (g < bestBehindGap) { bestBehindGap = g; follower = other; }
      }
    }

    return { leader, follower, aheadGap: bestAheadGap, behindGap: bestBehindGap };
  }

  _updateSpeed(car, dt) {
    const { minFollowGap, timeHeadwaySec } = this.cfg.traffic;
    const { leader, aheadGap } = this._leaderAndFollowerInLane(car);
    const desiredGap = minFollowGap + car.speed * timeHeadwaySec;
    let targetSpeed = car.cruiseSpeedMs;
    if (leader) {
      const gap = aheadGap - CAR_LENGTH;
      if (gap < desiredGap) targetSpeed = leader.speed * clamp(gap / desiredGap, 0, 1);
    }
    car.speed = lerp(car.speed, targetSpeed, 1 - Math.exp(-dt * 1.2 * car.statMods.accelMult));
    car._desiredGap = desiredGap; // cached for the lane-change check below
  }

  _updateLaneChange(car, dt) {
    if (car._laneChangeCooldown > 0) car._laneChangeCooldown = Math.max(0, car._laneChangeCooldown - dt);

    if (car.laneBlendT < 1) {
      car.laneBlendT = Math.min(1, car.laneBlendT + dt / LANE_CHANGE_DURATION);
      if (car.laneBlendT >= 1) car.laneIndex = car.targetLaneIndex;
      return;
    }

    if (car._laneChangeCooldown > 0) return;
    const { leader, aheadGap } = this._leaderAndFollowerInLane(car);
    const desiredGap = car._desiredGap ?? this.cfg.traffic.minFollowGap;
    const blocked = leader && (aheadGap - CAR_LENGTH) < desiredGap;
    if (!blocked) return;

    // Small per-frame roll while blocked approximates natural hesitation before
    // committing to a merge, rather than every blocked car merging in lockstep
    // the instant a gap appears.
    if (this.rand() > .02) return;

    for (const delta of [-1, 1]) {
      const candidateLane = car.laneIndex + delta;
      if (candidateLane < 0 || candidateLane >= this.cfg.road.laneCount) continue;
      let gapAhead = Infinity, gapBehind = Infinity;
      for (const other of this._laneBucket(car.edgeId, candidateLane)) {
        if (other.arc > car.arc) gapAhead = Math.min(gapAhead, other.arc - car.arc);
        else gapBehind = Math.min(gapBehind, car.arc - other.arc);
      }
      if (gapAhead > desiredGap * 1.2 && gapBehind > this.cfg.traffic.minFollowGap * 1.5) {
        car.targetLaneIndex = candidateLane;
        car.laneBlendT = 0;
        car._laneChangeCooldown = this.cfg.traffic.laneChangeCooldownSec;
        break;
      }
    }
  }

  _updateSteerAndHeading(car, dt, isNear) {
    const edge = this.network.getEdge(car.edgeId);
    const lookAhead = 9 + Math.abs(car.speed) * .35;
    const blendedLaneIndex = lerp(car.laneIndex, car.targetLaneIndex, isNear ? car.laneBlendT : 1);
    const lateralTarget = edge.laneCenterOffset(blendedLaneIndex);
    const info = edge.nearestSample(car.position, car._sampleHint);
    car._sampleHint = info.index;
    car.arc = info.arc;
    car.position.y = lerp(car.position.y, info.y, 1 - Math.exp(-dt * 22));

    // pointAtArc clamps internally, so a lookahead point past the edge's
    // own end just pins to the edge's last sample -- a one-frame-shallow
    // steer target right at a transition, not a crash; acceptable given
    // the transition itself (below) re-anchors heading on the new edge
    // immediately after.
    const tp = edge.pointAtArc(info.arc + lookAhead, lateralTarget);
    const dx = tp.x - car.position.x, dz = tp.z - car.position.z;
    const desiredHeading = Math.atan2(dx, dz);
    const err = ((desiredHeading - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    car.steer = clamp(err * 2.4, -1, 1);

    const speedFactor = clamp(Math.abs(car.speed) / 8, 0, 1);
    car.heading += car.steer * 2.8 * .85 * car.statMods.handlingMult * speedFactor * dt;
    car.moveHeading = angDamp(car.moveHeading, car.heading, 13 * car.statMods.handlingMult, dt);
  }

  _integratePosition(car, dt) {
    car.position.x += Math.sin(car.moveHeading) * car.speed * dt;
    car.position.z += Math.cos(car.moveHeading) * car.speed * dt;
  }

  // Walked off the current edge's end -- move to the committed choice (or
  // the sole next edge), falling back to a fresh commit roll if somehow
  // still uncommitted at a split (shouldn't normally happen: decisionWindow
  // is comfortably larger than one frame's travel distance).
  _handleEdgeTransition(car) {
    const edge = this.network.getEdge(car.edgeId);
    const info = edge.nearestSample(car.position, car._sampleHint);
    if (!info.offEnd) return;
    let nextId = car._committedNextEdgeId ?? edge.nextEdges[0]?.edgeId;
    if (!nextId && edge.nextEdges.length > 1) {
      const node = this.network.getNode(edge.endNodeId);
      nextId = node.chooseWeightedOutgoingEdge(this.rand, this.cfg.road.network.branchWeights);
    }
    if (!nextId) return;
    car.edgeId = nextId;
    car._committedNextEdgeId = null;
    car._sampleHint = null;
    // Lane index carries over as-is (both branch edges and the primary
    // loop share the same laneCount); a car that changed lanes mid-branch
    // just keeps whatever lane it landed in.
  }

  _clampToRoad(car) {
    // Safety clamp only -- proper lane-following should rarely trigger this;
    // kept as a guard against lane-change math edge cases pushing a car past
    // the shoulder, same pattern as the old AI wall-clamp (index.html:989).
    const edge = this.network.getEdge(car.edgeId);
    const info = edge.nearestSample(car.position, car._sampleHint);
    const absLat = Math.abs(info.lateral);
    if (absLat > edge.halfWidth) {
      const dir = Math.sign(info.lateral), s = edge.samples[info.index];
      const dx = car.position.x - s.p.x, dz = car.position.z - s.p.z;
      const along = dx * info.tangent.x + dz * info.tangent.z;
      car.position.x = s.p.x + info.tangent.x * along + info.side.x * edge.halfWidth * dir;
      car.position.z = s.p.z + info.tangent.z * along + info.side.z * edge.halfWidth * dir;
      car.speed *= .85;
    }
  }

  _recycleIfBehind(car, playerPrimaryArc) {
    // aheadDist: 0 = right at the player, growing = further ahead, wrapping
    // around toward `totalPrimaryLength` as the car falls behind. Converting
    // to behindAmount and bounding it above by half the primary length keeps
    // this a wrap-aware "shorter path" check, so a car on the far side of the
    // loop (ambiguous ahead-vs-behind) isn't misread as wildly ahead OR
    // behind. Respawns only ever land on a primary edge (never inside the
    // diamond) -- matches real highway traffic (you don't respawn deep
    // inside an off-ramp) and avoids needing true graph-shortest-path
    // distance every frame.
    const totalLen = this.network.totalPrimaryLength;
    const aheadDist = this.network.wrapPrimaryArc(car.primaryArc - playerPrimaryArc);
    const behindAmount = totalLen - aheadDist;
    if (behindAmount > this.cfg.traffic.pool.despawnBehindDist && behindAmount < totalLen / 2) {
      const jitter = (this.rand() - .5) * 40;
      const primaryArc = this.network.wrapPrimaryArc(playerPrimaryArc + this.cfg.traffic.pool.spawnAheadDist + jitter);
      const { edge, localArc } = this.network.primaryFrame(primaryArc);
      const laneIndex = Math.floor(this.rand() * this.cfg.road.laneCount);
      this._placeCar(car, edge.id, localArc, laneIndex);
    }
  }
}
