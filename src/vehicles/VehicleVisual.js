import * as THREE from 'three';
import { damp } from '../utils/MathUtils.js';

// Procedural placeholder model - a recognizable low-poly car silhouette (body, cabin,
// four independently-rotating/steering wheels, lights) built from primitives. Swapping
// this for a real GLB later only touches this file (see section 91 of the design brief).
export default class VehicleVisual {
    constructor(scene, color = 0x3d7cff) {
        this.root = new THREE.Object3D();

        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.3, metalness: 0.1 });
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
        const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d6, emissive: 0xfff6d6, emissiveIntensity: 1.0 });
        const brakeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x550000, emissiveIntensity: 0.0 });
        this.brakeMat = brakeMat;
        this.headlightMat = headlightMat;

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.9), bodyMat);
        body.position.y = 0.55;
        body.castShadow = true;
        body.receiveShadow = true;

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 1.8), cabinMat);
        cabin.position.set(0, 0.98, -0.25);
        cabin.castShadow = true;

        const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.6), bodyMat);
        nose.position.set(0, 0.35, 1.9);
        nose.castShadow = true;

        const headlightGeo = new THREE.BoxGeometry(0.25, 0.15, 0.08);
        const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
        headlightL.position.set(0.65, 0.45, 2.18);
        const headlightR = headlightL.clone();
        headlightR.position.x = -0.65;

        const brakeGeo = new THREE.BoxGeometry(0.3, 0.15, 0.06);
        const brakeL = new THREE.Mesh(brakeGeo, brakeMat);
        brakeL.position.set(0.65, 0.55, -1.93);
        const brakeR = brakeL.clone();
        brakeR.position.x = -0.65;

        this.root.add(body, cabin, nose, headlightL, headlightR, brakeL, brakeR);

        this.wheelRadius = 0.42;
        const wheelGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.32, 14);
        wheelGeo.rotateZ(Math.PI / 2);

        const wheelPositions = {
            frontLeft: [0.95, 0.42, 1.25],
            frontRight: [-0.95, 0.42, 1.25],
            rearLeft: [0.95, 0.42, -1.25],
            rearRight: [-0.95, 0.42, -1.25]
        };
        this.wheels = {};
        for (const [key, pos] of Object.entries(wheelPositions)) {
            const pivot = new THREE.Object3D(); // steering pivot (front wheels only rotate this)
            pivot.position.set(pos[0], pos[1], pos[2]);
            const mesh = new THREE.Mesh(wheelGeo, wheelMat);
            mesh.castShadow = true;
            pivot.add(mesh);
            this.root.add(pivot);
            this.wheels[key] = { pivot, mesh, spin: 0 };
        }

        this.currentLean = 0;
        scene.add(this.root);
    }

    update(state, dt, driftAngle) {
        this.root.position.copy(state.position);
        this.root.position.y = 0;
        this.root.rotation.y = state.heading;

        // Body lean/roll into turns for a bit of visual weight.
        const targetLean = -state.steerAngle * 0.18 * Math.min(Math.abs(state.speed) / 15, 1);
        this.currentLean = damp(this.currentLean, targetLean, 10, dt);
        this.root.rotation.z = this.currentLean;

        const wheelSpinDelta = (state.speed * dt) / this.wheelRadius;
        for (const [key, wheel] of Object.entries(this.wheels)) {
            wheel.spin += wheelSpinDelta;
            wheel.mesh.rotation.x = wheel.spin;
            if (key.startsWith('front')) {
                wheel.pivot.rotation.y = state.steerAngle * 0.5;
            }
        }

        this.brakeMat.emissiveIntensity = state.speed > 0 && driftAngle !== undefined && state.drift?.active ? 1.2 : (state.collisionFlashTimer > 0 ? 0.2 : 0.0);
    }

    setNightLights(on) {
        this.headlightMat.emissiveIntensity = on ? 2.2 : 0.4;
    }

    dispose(scene) {
        scene.remove(this.root);
    }
}
