import * as THREE from 'three';
import { damp, dampAngle } from '../utils/MathUtils.js';

const BASE_DISTANCE = 7.5;
const BASE_HEIGHT = 2.6;
const MAX_DISTANCE_ADD = 2.5;
const BASE_FOV = 68;
const MAX_FOV_ADD = 12;

// Smooth third-person follow camera: pulls back and widens FOV with speed, lags
// slightly behind heading during drift for a sense of weight, and eases position/
// rotation instead of snapping so it never feels jittery.
export default class ChaseCamera {
    constructor(camera) {
        this.camera = camera;
        this.currentPosition = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();
        this.currentYaw = 0;
        this.initialized = false;
    }

    update(racerState, dt, driftAngle = 0, lookBack = false) {
        const cfg = racerState.config;
        const speedRatio = Math.min(Math.abs(racerState.speed) / cfg.maxSpeed, 1);
        const distance = BASE_DISTANCE + speedRatio * MAX_DISTANCE_ADD;
        const height = BASE_HEIGHT;

        const targetYaw = racerState.heading + (lookBack ? Math.PI : 0) - driftAngle * 0.25;
        this.currentYaw = this.initialized ? dampAngle(this.currentYaw, targetYaw, lookBack ? 20 : 6, dt) : targetYaw;

        const offset = new THREE.Vector3(Math.sin(this.currentYaw), 0, Math.cos(this.currentYaw)).multiplyScalar(-distance);
        const desiredPos = racerState.position.clone().add(offset).add(new THREE.Vector3(0, height, 0));
        const desiredLookAt = racerState.position.clone().add(new THREE.Vector3(0, 1.0, 0));

        if (!this.initialized) {
            this.currentPosition.copy(desiredPos);
            this.currentLookAt.copy(desiredLookAt);
            this.initialized = true;
        } else {
            this.currentPosition.x = damp(this.currentPosition.x, desiredPos.x, 8, dt);
            this.currentPosition.y = damp(this.currentPosition.y, desiredPos.y, 6, dt);
            this.currentPosition.z = damp(this.currentPosition.z, desiredPos.z, 8, dt);
            this.currentLookAt.lerp(desiredLookAt, Math.min(dt * 12, 1));
        }

        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.currentLookAt);
        this.camera.fov = BASE_FOV + speedRatio * MAX_FOV_ADD + (racerState.boostTimer > 0 ? 6 : 0);
        this.camera.updateProjectionMatrix();
    }

    reset() {
        this.initialized = false;
    }
}
