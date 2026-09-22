import * as THREE from 'three';
import { buildCarVisual, placeCarVisual } from '../vehicles/CarVisual.js';
import { statMultipliers, vehicleByAssetIndex, mphToMs } from '../vehicles/VehicleRegistry.js';
import { mulberry32 } from '../core/MathUtils.js';
import { MEDIAN_GAP } from '../road/roadThemes.js';

const POOL_SIZE = 14;
const SPAWN_AHEAD = 260;
const DESPAWN_BEHIND = 80;

// Purely cosmetic opposing-direction traffic on a parallel carriageway,
// mirroring the divided-highway look real freeways have. Not part of
// gameplay -- no collision with the player, no lane-following/gap-checking,
// just a steady reverse-direction stream on its own ribbon across the
// median, recycled the same wrap-aware way as the real TrafficManager.
export class OpposingTraffic {
  constructor(scene, ring, roadCfg, carAssets, seed = 4242) {
    this.scene = scene;
    this.ring = ring;
    this.cfg = roadCfg;
    this.rand = mulberry32(seed);
    this.oppCenterOffset = ring.halfWidth + MEDIAN_GAP + ring.roadHalfWidth;
    this.pool = this._buildPool(carAssets);
  }

  get oppRoadHalfWidth() { return this.ring.roadHalfWidth; }
  get oppCenterLateral() { return this.oppCenterOffset; }

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
    return this.oppCenterOffset - this.ring.roadHalfWidth + this.cfg.laneWidth * (laneIndex + .5);
  }

  _place(car, arc, laneIndex) {
    car.arc = arc; car.laneIndex = laneIndex;
    car.position.copy(this.ring.pointAtArc(arc, this._laneLateral(laneIndex)));
    const fr = this.ring.frame(arc / this.ring.length);
    // Facing the reverse of the ring tangent -- these travel toward
    // decreasing arc, opposite the player's own direction of travel.
    car.heading = Math.atan2(-fr.t.x, -fr.t.z);
    car.moveHeading = car.heading;
    car.speed = 20 + this.rand() * 10; // ~45-67mph, roughly matching main traffic's cruise feel
  }

  spawnInitial(playerArc) {
    const spacing = this.ring.length / this.pool.length;
    for (let i = 0; i < this.pool.length; i++) {
      const arc = this.ring.wrapArc(playerArc + i * spacing + this.rand() * spacing * .5);
      this._place(this.pool[i], arc, Math.floor(this.rand() * this.cfg.laneCount));
    }
  }

  update(dt, playerArc, raceTime) {
    for (const car of this.pool) {
      car.arc = this.ring.wrapArc(car.arc - car.speed * dt);
      car.position.copy(this.ring.pointAtArc(car.arc, this._laneLateral(car.laneIndex)));
      const fr = this.ring.frame(car.arc / this.ring.length);
      car.heading = Math.atan2(-fr.t.x, -fr.t.z);
      car.moveHeading = car.heading;
      placeCarVisual(car, dt, raceTime);

      // Same wrap-aware "has this fallen behind the player" check the real
      // TrafficManager uses -- see its _recycleIfBehind for why the naive
      // one-sided distance version is wrong on a closed loop.
      const aheadDist = this.ring.wrapArc(car.arc - playerArc);
      const behindAmount = this.ring.length - aheadDist;
      if (behindAmount > DESPAWN_BEHIND && behindAmount < this.ring.length / 2) {
        const arc = this.ring.wrapArc(playerArc + SPAWN_AHEAD + this.rand() * 80);
        this._place(car, arc, Math.floor(this.rand() * this.cfg.laneCount));
      }
    }
  }
}
