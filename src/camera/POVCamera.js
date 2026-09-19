import * as THREE from 'three';

const BASE_FOV = 82;

// First-person camera roughly at driver head height. Full vehicle-specific mount
// points (motorcycle, horse, broom, etc.) are a config lookup added in Phase 4 -
// section 31 explicitly says detailed interiors aren't required initially.
export default class POVCamera {
    constructor(camera) {
        this.camera = camera;
        this.mountOffset = new THREE.Vector3(0, 1.15, 0.25);
    }

    update(racerState, dt, lookBack = false) {
        const yaw = racerState.heading + (lookBack ? Math.PI : 0);
        const forward = new THREE.Vector3(Math.sin(racerState.heading), 0, Math.cos(racerState.heading));
        const mountPos = racerState.position.clone()
            .add(new THREE.Vector3(0, this.mountOffset.y, 0))
            .addScaledVector(forward, this.mountOffset.z);

        this.camera.position.copy(mountPos);
        const lookTarget = mountPos.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)));
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(lookTarget);
        this.camera.fov = BASE_FOV;
        this.camera.updateProjectionMatrix();
    }
}
