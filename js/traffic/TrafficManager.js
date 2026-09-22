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
export class TrafficManager {
  constructor(scene, ring, config, carAssets) {
    this.scene = scene;
    this.ring = ring;
    this.cfg = config;
    this.rand = mulberry32(config.traffic.seed);
    this.pool = this._buildPool(carAssets);
    this._laneBuckets = Array.from({ length: config.road.laneCount }, () => []);
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

  spawnInitial(playerArc) {
    const n = this.pool.length;
    for (let i = 0; i < n; i++) {
      const car = this.pool[i];
      const laneIndex = Math.floor(this.rand() * this.cfg.road.laneCount);
      const spacing = this.ring.length / n;
      const jitter = (this.rand() - .5) * spacing * .3;
      const arc = this.ring.wrapArc(playerArc + spacing * i + jitter + 20);
      this._placeCar(car, arc, laneIndex);
      car.active = true;
    }
  }

  _placeCar(car, arc, laneIndex) {
    car.arc = arc;
    car.laneIndex = laneIndex;
    car.targetLaneIndex = laneIndex;
    car.laneBlendT = 1;
    car.cruiseSpeedMs = this._pickCruiseSpeedMs();
    car.speed = car.cruiseSpeedMs;
    car._sampleHint = null;
    car._laneChangeCooldown = this.rand() * this.cfg.traffic.laneChangeCooldownSec;
    car._hitCooldown = 0;
    car._closeCallCooldown = 0;
    const lateral = this.ring.laneCenterOffset(laneIndex);
    const p = this.ring.pointAtArc(arc, lateral);
    car.position.copy(p);
    const fr = this.ring.frame(arc / this.ring.length);
    car.heading = Math.atan2(fr.t.x, fr.t.z);
    car.moveHeading = car.heading;
  }

  update(dt, playerArc, raceTime) {
    this._frameCounter++;
    this._bucketByLane();

    for (const car of this.pool) {
      if (!car.active) continue;
      if (car._hitCooldown > 0) car._hitCooldown = Math.max(0, car._hitCooldown - dt);
      if (car._closeCallCooldown > 0) car._closeCallCooldown = Math.max(0, car._closeCallCooldown - dt);
      const distFromPlayer = this.ring.wrapArc(car.arc - playerArc);
      const isNear = Math.min(distFromPlayer, this.ring.length - distFromPlayer) < LOD_DISTANCE;

      this._updateLaneChange(car, dt);
      this._updateSpeed(car, dt);
      this._updateSteerAndHeading(car, dt, isNear);
      this._integratePosition(car, dt);
      this._clampToRoad(car);

      if (isNear || (this._frameCounter + car._lodFrameOffset) % 4 === 0) {
        placeCarVisual(car, isNear ? dt : dt * 4, raceTime);
      }

      this._recycleIfBehind(car, playerArc);
    }
  }

  _bucketByLane() {
    for (const bucket of this._laneBuckets) bucket.length = 0;
    for (const car of this.pool) {
      if (!car.active) continue;
      this._laneBuckets[car.targetLaneIndex].push(car);
    }
    for (const bucket of this._laneBuckets) bucket.sort((a, b) => a.arc - b.arc);
  }

  _leaderAndFollowerInLane(car) {
    const bucket = this._laneBuckets[car.targetLaneIndex];
    if (bucket.length <= 1) return { leader: null, follower: null };
    let leader = null, follower = null, bestAheadGap = Infinity, bestBehindGap = Infinity;
    for (const other of bucket) {
      if (other === car) continue;
      const aheadGap = this.ring.wrapArc(other.arc - car.arc);
      const behindGap = this.ring.wrapArc(car.arc - other.arc);
      if (aheadGap < bestAheadGap) { bestAheadGap = aheadGap; leader = other; }
      if (behindGap < bestBehindGap) { bestBehindGap = behindGap; follower = other; }
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
      const bucket = this._laneBuckets[candidateLane];
      let gapAhead = Infinity, gapBehind = Infinity;
      for (const other of bucket) {
        const ahead = this.ring.wrapArc(other.arc - car.arc);
        const behind = this.ring.wrapArc(car.arc - other.arc);
        if (ahead < gapAhead) gapAhead = ahead;
        if (behind < gapBehind) gapBehind = behind;
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
    const lookAhead = 9 + Math.abs(car.speed) * .35;
    const blendedLaneIndex = lerp(car.laneIndex, car.targetLaneIndex, isNear ? car.laneBlendT : 1);
    const lateralTarget = this.ring.laneCenterOffset(blendedLaneIndex);
    const info = this.ring.nearestSample(car.position, car._sampleHint);
    car._sampleHint = info.index;
    car.arc = info.arc;
    car.position.y = lerp(car.position.y, info.y, 1 - Math.exp(-dt * 22));

    const tp = this.ring.pointAtArc(info.arc + lookAhead, lateralTarget);
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

  _clampToRoad(car) {
    // Safety clamp only -- proper lane-following should rarely trigger this;
    // kept as a guard against lane-change math edge cases pushing a car past
    // the shoulder, same pattern as the old AI wall-clamp (index.html:989).
    const info = this.ring.nearestSample(car.position, car._sampleHint);
    const absLat = Math.abs(info.lateral);
    if (absLat > this.ring.halfWidth) {
      const dir = Math.sign(info.lateral), s = this.ring.samples[info.index];
      const dx = car.position.x - s.p.x, dz = car.position.z - s.p.z;
      const along = dx * info.tangent.x + dz * info.tangent.z;
      car.position.x = s.p.x + info.tangent.x * along + info.side.x * this.ring.halfWidth * dir;
      car.position.z = s.p.z + info.tangent.z * along + info.side.z * this.ring.halfWidth * dir;
      car.speed *= .85;
    }
  }

  _recycleIfBehind(car, playerArc) {
    // aheadDist: 0 = right at the player, growing = further ahead, wrapping
    // around toward `length` as the car falls behind. Converting to
    // behindAmount and bounding it above by half the ring length keeps this a
    // wrap-aware "shorter path" check, so a car on the far side of the loop
    // (ambiguous ahead-vs-behind) isn't misread as wildly ahead OR behind.
    const aheadDist = this.ring.wrapArc(car.arc - playerArc);
    const behindAmount = this.ring.length - aheadDist;
    if (behindAmount > this.cfg.traffic.pool.despawnBehindDist && behindAmount < this.ring.length / 2) {
      const jitter = (this.rand() - .5) * 40;
      const arc = this.ring.wrapArc(playerArc + this.cfg.traffic.pool.spawnAheadDist + jitter);
      const laneIndex = Math.floor(this.rand() * this.cfg.road.laneCount);
      this._placeCar(car, arc, laneIndex);
    }
  }
}
