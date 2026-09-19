import * as THREE from 'three';
import ParticlePool from './ParticlePool.js';

const SMOKE_COLOR = 0xf2f2f2;
const SPARK_COLORS = { blue: 0x5ecbff, purple: 0xb35bff, gold: 0xffd23c };

// Spawns drift smoke every frame while drifting, and a burst of colored sparks that
// matches the current drift-charge tier (see VehiclePhysics driftChargeThresholds) so
// the player gets clear visual feedback on when releasing drift pays off.
export default class DriftEffects {
    constructor(scene) {
        this.smokePool = new ParticlePool(scene, {
            count: 240,
            material: new THREE.MeshBasicMaterial({ color: SMOKE_COLOR, transparent: true, opacity: 0.35, depthWrite: false }),
            life: 1.1
        });
        this.sparkPool = new ParticlePool(scene, {
            count: 120,
            geometry: new THREE.PlaneGeometry(0.25, 0.25),
            material: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
            life: 0.4
        });
        this._smokeAccumulator = new Map();
    }

    // Per-racer spawn logic only - does NOT advance the shared pools. Call once for
    // every racer each frame, then call render() exactly once to advance/draw them.
    spawnForRacer(racer, dt) {
        const state = racer.state;
        if (state.drift.active && Math.abs(state.speed) > 3) {
            const rearOffset = new THREE.Vector3(Math.sin(state.heading + Math.PI), 0, Math.cos(state.heading + Math.PI)).multiplyScalar(1.6);
            for (const sideSign of [-1, 1]) {
                const side = new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading)).multiplyScalar(sideSign * 0.85);
                const pos = state.position.clone().add(rearOffset).add(side).add(new THREE.Vector3(0, 0.3, 0));
                this.smokePool.spawn(pos, new THREE.Vector3(0, 0.6, 0), { opacity: 0.3, scaleStart: 0.3, scaleEnd: 1.6 });
            }
        }

        if (racer._prevDriftActive && !state.drift.active && state.lastDriftBoost > 0) {
            const color = SPARK_COLORS[racer._prevChargeLevel] || SPARK_COLORS.blue;
            for (let i = 0; i < 10; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 4;
                const vel = new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 2, Math.sin(angle) * speed);
                this.sparkPool.spawn(state.position.clone().add(new THREE.Vector3(0, 0.4, 0)), vel, { opacity: 1, scaleStart: 0.15, scaleEnd: 0.05 });
            }
            this.sparkPool.mesh.material.color.setHex(color);
        }
        racer._prevDriftActive = state.drift.active;
        racer._prevChargeLevel = state.drift.chargeLevel;
    }

    // Advances and draws both pools. Call exactly once per rendered frame, after
    // spawnForRacer() has run for every racer.
    render(dt, camera) {
        this.smokePool.update(dt, camera);
        this.sparkPool.update(dt, camera);
    }
}
