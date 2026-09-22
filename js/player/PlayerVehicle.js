import * as THREE from 'three';
import { clamp, lerp, angDamp, dampTowardZero } from '../core/MathUtils.js';
import { buildCarVisual, placeCarVisual } from '../vehicles/CarVisual.js';
import { statMultipliers, vehicleByAssetIndex, mphToMs } from '../vehicles/VehicleRegistry.js';

// Trimmed port of updatePlayer (index.html:783-964). The tiered handbrake-
// drift boost system, the drift-conditional yaw branch, drift-only speed
// terms, drift-driven scoring/skid-marks, and the circuit lap/position logic
// have all been deleted per the phase-1 brief ("avoid excessive drifting,
// precise lane-changing"). What's kept: steer smoothing, the base accel/
// brake/rolling-drag shape, nitro (now a plain hold-to-boost with no
// drift-earned bonus tiers), and the wall/shoulder clamp math -- retargeted
// from TRACK_W to the freeway ring's halfWidth, doubling as lane-departure/
// shoulder-scrape handling.
export class PlayerVehicle {
  constructor(scene, carAssets, assetIndex = 0) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.carAssets = carAssets;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.moveHeading = 0;
    this.speed = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.nitro = 1;
    this.arc = 0;
    this.lateral = 0;
    this._sampleHint = null;
    this._shoulderRecoverTimer = 0;
    this.rollVisual = 0;
    this.setVehicle(assetIndex);
  }

  setVehicle(assetIndex) {
    const visual = buildCarVisual(this.root, assetIndex, null, this.carAssets);
    this.model = visual.model;
    this.wheels = visual.wheels;
    this.groundLift = visual.groundLift;
    this.sirenLights = visual.sirenLights;
    this.assetIndex = assetIndex;
    const spec = vehicleByAssetIndex(assetIndex);
    this.statMods = spec ? statMultipliers(spec) : { topMs: mphToMs(150), accelMult: 1, handlingMult: 1 };
  }

  update(dt, input, ring, config) {
    const pc = config.player;
    const sm = this.statMods;

    const steerTarget = -(input.steerAxis ?? ((input.right ? 1 : 0) - (input.left ? 1 : 0)));
    const gasAmt = (input.throttleAxis != null && input.throttleAxis > .02) ? input.throttleAxis : (input.gas ? 1 : 0);
    const brakeAmt = (input.brakeAxis != null && input.brakeAxis > .02) ? input.brakeAxis : (input.brake ? 1 : 0);

    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-dt * pc.steerLerpRate));

    const nitroActive = !!(input.nitro && this.nitro > 0 && this.speed > 12);
    this.nitro = nitroActive
      ? Math.max(0, this.nitro - dt * pc.nitro.drainPerSec)
      : Math.min(1, this.nitro + dt * pc.nitro.rechargePerSec);

    const top = nitroActive ? sm.topMs * pc.nitro.maxBoostMultiplier : sm.topMs;
    const accel = gasAmt * (nitroActive ? pc.accelNitro : pc.accelGas) * sm.accelMult;
    const brake = brakeAmt * pc.brakeDecel;
    this.speed += (accel - brake) * dt;
    const drag = pc.rollingDragBase + Math.abs(this.speed) * pc.rollingDragPerSpeed;
    this.speed = dampTowardZero(this.speed, drag, dt);
    this.speed = clamp(this.speed, (brakeAmt > 0 && gasAmt <= 0) ? pc.reverseSpeed : 0, top);

    const speedAbs = Math.abs(this.speed);
    const speedFactor = clamp(speedAbs / 18, .2, 1);
    const dirSign = this.speed >= 0 ? 1 : -1;
    let desiredYaw = this.steer * (.6 + 1.05 * speedFactor) * sm.handlingMult * dirSign;
    desiredYaw = clamp(desiredYaw * clamp(speedAbs / 2, 0, 1), -2.25, 2.25);
    const yawResponse = this._shoulderRecoverTimer > 0 ? pc.yawResponseRecover : pc.yawResponse;
    this.yawRate = lerp(this.yawRate, desiredYaw, 1 - Math.exp(-dt * yawResponse));
    this.heading += this.yawRate * dt;
    this.moveHeading = angDamp(this.moveHeading, this.heading, pc.grip * sm.handlingMult, dt);

    this.position.x += Math.sin(this.moveHeading) * this.speed * dt;
    this.position.z += Math.cos(this.moveHeading) * this.speed * dt;

    const info = ring.nearestSample(this.position, this._sampleHint);
    this._sampleHint = info.index;
    this.arc = info.arc;
    this.lateral = info.lateral;
    this.position.y = lerp(this.position.y, info.y, 1 - Math.exp(-dt * 22));

    const absLat = Math.abs(info.lateral);
    let hitShoulder = false;
    if (absLat > ring.halfWidth) {
      hitShoulder = true;
      this.speed -= config.collision.shoulderSpeedPenaltyPerSec * dt;
      const dir = Math.sign(info.lateral), s = ring.samples[info.index];
      const dx = this.position.x - s.p.x, dz = this.position.z - s.p.z, along = dx * info.tangent.x + dz * info.tangent.z;
      this.position.x = s.p.x + info.tangent.x * along + info.side.x * ring.halfWidth * dir;
      this.position.z = s.p.z + info.tangent.z * along + info.side.z * ring.halfWidth * dir;
      const trackHeading = Math.atan2(info.tangent.x, info.tangent.z);
      this.moveHeading = angDamp(this.moveHeading, trackHeading, 5, dt);
      this._shoulderRecoverTimer = .3;
    }
    if (this._shoulderRecoverTimer > 0) this._shoulderRecoverTimer = Math.max(0, this._shoulderRecoverTimer - dt);

    return { hitShoulder };
  }

  placeVisual(dt, raceTime) {
    placeCarVisual(this, dt, raceTime);
  }
}
