import * as THREE from 'three';
import { clamp, lerp, angDamp, angDelta, dampTowardZero } from '../core/MathUtils.js';
import { buildCarVisual, placeCarVisual } from '../vehicles/CarVisual.js';
import { statMultipliers, vehicleByAssetIndex, mphToMs } from '../vehicles/VehicleRegistry.js';

// Trimmed port of updatePlayer (index.html:783-964), plus the handbrake
// slide brought back on request -- but as a handling mechanic only, not the
// old circuit racer's reward system. Gone for good: the tiered mini-turbo/
// delayed-auto-boost payout, the drift-only top-speed bonus and forward
// thrust, the drift score, and the circuit lap/position logic -- none of
// that fits a checkpoint-scored freeway commute. What's back: holding the
// handbrake above a speed threshold drops rear grip so the car steps out
// and holds a slide angle through a weave, at a small speed cost for the
// traction loss (a cost, not a bonus -- there's nothing left to reward it
// with). What's kept from the phase-1 trim throughout: steer smoothing, the
// base accel/brake/rolling-drag shape, nitro (plain hold-to-boost, no
// drift-earned tiers), and the wall/shoulder clamp math -- retargeted from
// TRACK_W to the freeway ring's halfWidth, doubling as lane-departure/
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
    this.edgeId = null; // set by the caller (main.js resetRace) before first update
    this.arc = 0;
    this.primaryArc = 0;
    this.lateral = 0;
    this._sampleHint = null;
    this._shoulderRecoverTimer = 0;
    this._driftActive = false;
    this._driftDir = 1;
    this._lastPuff = 0;
    this._skidAccum = 0;
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

    // Real headlights for the player only -- traffic gets the cheap unlit
    // glow meshes from buildCarVisual, but only one player exists, so a pair
    // of actual lights actually illuminating the road ahead is affordable
    // and directly helps night visibility (not just cosmetic).
    // buildCarVisual already cleared root's old children (including any
    // previous headlight/target objects), so these are recreated fresh here.
    const box = visual.box, lampX = (box.max.x - box.min.x) * .32, lampY = box.min.y + (box.max.y - box.min.y) * .3;
    this.headlights = [-1, 1].map(xSign => {
      const light = new THREE.SpotLight(0xfff2d0, 6, 55, Math.PI / 6.5, .55, 1.3);
      light.position.set(xSign * lampX, lampY, box.max.z);
      light.castShadow = false;
      const target = new THREE.Object3D();
      target.position.set(xSign * lampX * .4, lampY - 1.2, box.max.z + 30);
      light.target = target;
      this.root.add(light, target);
      return light;
    });
  }

  update(dt, input, network, config, effects) {
    const pc = config.player;
    const sm = this.statMods;

    const steerTarget = -(input.steerAxis ?? ((input.right ? 1 : 0) - (input.left ? 1 : 0)));
    const gasAmt = (input.throttleAxis != null && input.throttleAxis > .02) ? input.throttleAxis : (input.gas ? 1 : 0);
    const brakeAmt = (input.brakeAxis != null && input.brakeAxis > .02) ? input.brakeAxis : (input.brake ? 1 : 0);

    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-dt * pc.steerLerpRate));

    // Drift is gated on the PREVIOUS frame's speed (same pattern the old
    // circuit racer used) -- a car can't break traction standing still, and
    // this reads cleanly frame to frame without needing the speed update
    // below to happen first.
    const driftHeld = !!input.drift;
    const canDrift = driftHeld && Math.abs(this.speed) > pc.drift.minSpeed && Math.abs(steerTarget) > .1;
    if (canDrift) {
      if (!this._driftActive) this._driftDir = steerTarget !== 0 ? Math.sign(steerTarget) : this._driftDir;
      this._driftActive = true;
    } else {
      this._driftActive = false;
    }

    const nitroActive = !!(input.nitro && this.nitro > 0 && this.speed > 12);
    this.nitro = nitroActive
      ? Math.max(0, this.nitro - dt * pc.nitro.drainPerSec)
      : Math.min(1, this.nitro + dt * pc.nitro.rechargePerSec);

    const top = nitroActive ? sm.topMs * pc.nitro.maxBoostMultiplier : sm.topMs;
    const accel = gasAmt * (nitroActive ? pc.accelNitro : pc.accelGas) * sm.accelMult;
    const brake = brakeAmt * pc.brakeDecel;
    this.speed += (accel - brake) * dt;
    // Traction loss costs a little speed while sliding -- a cost, not a
    // bonus, since there's no drift score left to pay one out of.
    const drag = pc.rollingDragBase + Math.abs(this.speed) * pc.rollingDragPerSpeed + (this._driftActive ? pc.drift.dragBonus : 0);
    this.speed = dampTowardZero(this.speed, drag, dt);
    this.speed = clamp(this.speed, (brakeAmt > 0 && gasAmt <= 0) ? pc.reverseSpeed : 0, top);

    const speedAbs = Math.abs(this.speed);
    const speedFactor = clamp(speedAbs / 18, .2, 1);
    const dirSign = this.speed >= 0 ? 1 : -1;

    let desiredYaw;
    if (this._driftActive) {
      const same = Math.max(0, this.steer * this._driftDir);
      const targetSlip = this._driftDir * (.5 + .5 * same + .15 * speedFactor);
      const slideYaw = this._driftDir * (.65 + 1.0 * same) * (.55 + .45 * speedFactor);
      const slipNow = angDelta(this.moveHeading, this.heading);
      desiredYaw = slideYaw + (targetSlip - slipNow) * 2.0;
    } else {
      desiredYaw = this.steer * (.6 + 1.05 * speedFactor) * sm.handlingMult * dirSign;
    }
    desiredYaw = clamp(desiredYaw * clamp(speedAbs / 2, 0, 1), -2.25, 2.25);
    const yawResponse = this._driftActive ? pc.drift.yawResponse : (this._shoulderRecoverTimer > 0 ? pc.yawResponseRecover : pc.yawResponse);
    this.yawRate = lerp(this.yawRate, desiredYaw, 1 - Math.exp(-dt * yawResponse));
    this.heading += this.yawRate * dt;

    let grip = this._driftActive ? pc.drift.grip : (this._shoulderRecoverTimer > 0 ? 5.8 : pc.grip * sm.handlingMult);
    // Soft-catch band: extra grip kicks in as the slide approaches its max
    // angle so it settles there instead of spinning straight through it.
    const slipBeforeGrip = angDelta(this.moveHeading, this.heading);
    if (this._driftActive && Math.abs(slipBeforeGrip) > pc.drift.maxSlipAngle * .85) {
      grip += 7 * (Math.abs(slipBeforeGrip) - pc.drift.maxSlipAngle * .85) / .2;
    }
    this.moveHeading = angDamp(this.moveHeading, this.heading, grip, dt);
    const limitedSlip = angDelta(this.moveHeading, this.heading);
    if (this._driftActive && Math.abs(limitedSlip) > pc.drift.maxSlipAngle) {
      this.heading = this.moveHeading + Math.sign(limitedSlip) * pc.drift.maxSlipAngle;
      this.yawRate *= .7;
    }

    this.position.x += Math.sin(this.moveHeading) * this.speed * dt;
    this.position.z += Math.cos(this.moveHeading) * this.speed * dt;

    let edge = network.getEdge(this.edgeId);
    let info = edge.nearestSample(this.position, this._sampleHint);
    // Walked off this edge's end -- either just continue onto the single
    // next edge, or (at a split) resolve the branch from which half of the
    // lanes the player is currently in. Re-resolve nearestSample from
    // scratch (hint=null) on the new edge since the old hint/index means
    // nothing there.
    if (info.offEnd) {
      const { nextIds, node } = network.edgeTransitionOptions(this.edgeId);
      let nextId = nextIds[0];
      if (nextIds.length > 1 && node) {
        const laneIndex = edge.laneIndexFromLateral(info.lateral);
        nextId = node.chooseOutgoingEdge(laneIndex, config.road.laneCount);
      }
      if (nextId) {
        this.edgeId = nextId;
        edge = network.getEdge(this.edgeId);
        info = edge.nearestSample(this.position, null);
      }
    }
    this._sampleHint = info.index;
    this.arc = info.arc;
    this.primaryArc = network.primaryArcFor(this.edgeId, this.arc);
    this.position.y = lerp(this.position.y, info.y, 1 - Math.exp(-dt * 22));

    // A real boundary, not an invisible line the car can glide through:
    // reproject position back to the edge (as before), but ALSO kill the
    // component of velocity still pointing further out-of-bounds. Without
    // that second part, `speed` keeps building every frame gas is held and
    // the reprojection alone only ever undoes ONE frame's worth of outward
    // drift -- which reads as "the road isn't really there" even though
    // position is technically being clamped, because the car just keeps
    // sliding along past the boundary under its own momentum.
    const absLat = Math.abs(info.lateral);
    let hitShoulder = false;
    if (absLat > edge.halfWidth) {
      hitShoulder = true;
      const dir = Math.sign(info.lateral), s = edge.samples[info.index];
      const dx = this.position.x - s.p.x, dz = this.position.z - s.p.z, along = dx * info.tangent.x + dz * info.tangent.z;
      this.position.x = s.p.x + info.tangent.x * along + info.side.x * edge.halfWidth * dir;
      this.position.z = s.p.z + info.tangent.z * along + info.side.z * edge.halfWidth * dir;
      info.lateral = edge.halfWidth * dir;

      const velX = Math.sin(this.moveHeading) * this.speed, velZ = Math.cos(this.moveHeading) * this.speed;
      const outwardSpeed = (velX * info.side.x + velZ * info.side.z) * dir; // positive = still driving further out of bounds
      if (outwardSpeed > 0) {
        const tangentSpeed = velX * info.tangent.x + velZ * info.tangent.z;
        this.speed = tangentSpeed; // scrapes along the boundary instead of continuing to push through it
        this.moveHeading = Math.atan2(info.tangent.x, info.tangent.z);
      }
      this.speed -= config.collision.shoulderSpeedPenaltyPerSec * dt;
      const trackHeading = Math.atan2(info.tangent.x, info.tangent.z);
      this.moveHeading = angDamp(this.moveHeading, trackHeading, 5, dt);
      this._driftActive = false;
      this._shoulderRecoverTimer = .3;
    }
    this.lateral = info.lateral;
    if (this._shoulderRecoverTimer > 0) this._shoulderRecoverTimer = Math.max(0, this._shoulderRecoverTimer - dt);

    if (effects) {
      const driftAngle = angDelta(this.moveHeading, this.heading), driftMag = Math.abs(driftAngle);
      const sliding = this._driftActive && driftMag > .16 && speedAbs > 9;
      if (sliding) {
        const quality = clamp((driftMag - .15) / .45, .12, 1);
        const hs = Math.sin(this.heading), hc = Math.cos(this.heading);
        const bx = -hs * 1.65, bz = -hc * 1.65, sx = hc * .78, sz = -hs * .78;
        this._lastPuff -= dt;
        if (this._lastPuff <= 0) {
          const puffScale = 1 + quality * .8;
          effects.smoke?.puff({ x: this.position.x + bx - sx, y: this.position.y + .3, z: this.position.z + bz - sz }, puffScale);
          effects.smoke?.puff({ x: this.position.x + bx + sx, y: this.position.y + .3, z: this.position.z + bz + sz }, puffScale);
          this._lastPuff = .04;
        }
        this._skidAccum += speedAbs * dt;
        if (this._skidAccum > .72) {
          effects.skid?.drop({ x: this.position.x + bx - sx, y: this.position.y + .3, z: this.position.z + bz - sz }, this.moveHeading, Math.min(1, driftMag));
          effects.skid?.drop({ x: this.position.x + bx + sx, y: this.position.y + .3, z: this.position.z + bz + sz }, this.moveHeading, Math.min(1, driftMag));
          this._skidAccum = 0;
        }
      }
    }

    return { hitShoulder };
  }

  placeVisual(dt, raceTime) {
    placeCarVisual(this, dt, raceTime);
  }
}
