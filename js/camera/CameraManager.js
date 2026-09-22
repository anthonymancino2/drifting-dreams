import * as THREE from 'three';
import { angDelta } from '../core/MathUtils.js';

const CAMERA_NAMES = ['CHASE', 'HOOD'];

// Port of updateCamera (index.html:1011-1020), dropping mode 2 (360deg orbit)
// and the canvas pointer-drag handlers that used to force it (index.html:774)
// -- per the brief, keep third-person + POV, drop free orbit.
export class CameraManager {
  constructor(camera, config) {
    this.camera = camera;
    this.cfg = config.camera;
    this.mode = 0;
    this._camTarget = new THREE.Vector3();
    this._camDesired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  get modeName() { return CAMERA_NAMES[this.mode]; }

  cycle() {
    this.mode = (this.mode + 1) % CAMERA_NAMES.length;
    return this.modeName;
  }

  update(dt, player) {
    const speedAbs = Math.abs(player.speed);
    const cameraHeading = this.mode === 0
      ? player.heading + angDelta(player.heading, player.moveHeading) * .78
      : player.heading;
    const hs = Math.sin(cameraHeading), hc = Math.cos(cameraHeading), tx = hs, tz = hc, sx = -hc, sz = hs;
    this._camTarget.set(player.position.x, player.position.y + 1.15, player.position.z);

    if (this.mode === 1) { // HOOD / POV -- fixed rigid offset, no lerp needed on the offset itself
      const bh = Math.sin(player.heading), bc = Math.cos(player.heading);
      this._camDesired.set(
        player.position.x + bh * this.cfg.hoodOffset,
        player.position.y + this.cfg.hoodHeight,
        player.position.z + bc * this.cfg.hoodOffset
      );
      this._look.set(player.position.x + bh * 18, player.position.y + .7, player.position.z + bc * 18);
    } else { // CHASE
      const distance = this.cfg.chaseDist, height = this.cfg.chaseHeight;
      this._camDesired.set(
        this._camTarget.x - tx * distance,
        this._camTarget.y + height,
        this._camTarget.z - tz * distance
      );
      this._look.set(this._camTarget.x + tx * 4, this._camTarget.y, this._camTarget.z + tz * 4);
    }

    this.camera.position.lerp(this._camDesired, 1 - Math.exp(-dt * this.cfg.followLerpRate));
    this.camera.lookAt(this._look);

    // Widen FOV with how hard the player is actually sliding (not raw
    // speed) -- sells a big drift angle as more dramatic without the view
    // changing just because the car is going fast.
    const driftMag = player._driftActive ? Math.abs(angDelta(player.moveHeading, player.heading)) : 0;
    const fovTarget = this.cfg.baseFov + Math.min(driftMag * (this.cfg.driftFovBoost / 1.35), this.cfg.driftFovBoost);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fovTarget, dt * 5);
    this.camera.updateProjectionMatrix();

    return speedAbs;
  }
}
