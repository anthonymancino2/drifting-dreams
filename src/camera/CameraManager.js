import ChaseCamera from './ChaseCamera.js';
import POVCamera from './POVCamera.js';

// Owns the single THREE.PerspectiveCamera and switches which controller drives it.
// Camera-change is edge-triggered upstream (InputManager.wasPressed), so holding the
// button never cycles views repeatedly.
export default class CameraManager {
    constructor(camera) {
        this.camera = camera;
        this.chase = new ChaseCamera(camera);
        this.pov = new POVCamera(camera);
        this.mode = 'chase';
    }

    toggleMode() {
        this.mode = this.mode === 'chase' ? 'pov' : 'chase';
        this.chase.reset();
    }

    update(racerState, dt, driftAngle, lookBack) {
        if (this.mode === 'chase') {
            this.chase.update(racerState, dt, driftAngle, lookBack);
        } else {
            this.pov.update(racerState, dt, lookBack);
        }
    }
}
