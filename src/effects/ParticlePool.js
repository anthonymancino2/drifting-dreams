import * as THREE from 'three';

const DUMMY = new THREE.Object3D();

// Fixed-size pool of instances reused round-robin - never allocates/frees THREE
// objects at runtime, which matters once 12 racers are all kicking up drift smoke.
export default class ParticlePool {
    constructor(scene, { count = 200, geometry, material, life = 0.9 } = {}) {
        this.count = count;
        this.life = life;
        this.mesh = new THREE.InstancedMesh(
            geometry || new THREE.PlaneGeometry(0.6, 0.6),
            material || new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false }),
            count
        );
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.particles = new Array(count).fill(null).map(() => ({
            active: false, age: 0, life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
            scaleStart: 0.4, scaleEnd: 1.4, opacity: 0.5
        }));
        this.cursor = 0;
        for (let i = 0; i < count; i++) this._hide(i);
        scene.add(this.mesh);
    }

    _hide(i) {
        DUMMY.position.set(0, -9999, 0);
        DUMMY.scale.setScalar(0.0001);
        DUMMY.updateMatrix();
        this.mesh.setMatrixAt(i, DUMMY.matrix);
    }

    spawn(position, velocity, opts = {}) {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.count;
        const p = this.particles[i];
        p.active = true;
        p.age = 0;
        p.life = opts.life ?? this.life;
        p.position.copy(position);
        p.velocity.copy(velocity);
        p.scaleStart = opts.scaleStart ?? 0.35;
        p.scaleEnd = opts.scaleEnd ?? 1.5;
        p.opacity = opts.opacity ?? 0.5;
        p.index = i;
    }

    update(dt, camera) {
        let anyVisible = false;
        for (const p of this.particles) {
            if (!p.active) continue;
            p.age += dt;
            if (p.age >= p.life) { p.active = false; this._hide(p.index); continue; }
            anyVisible = true;
            p.position.addScaledVector(p.velocity, dt);
            const t = p.age / p.life;
            const scale = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
            DUMMY.position.copy(p.position);
            DUMMY.scale.setScalar(scale);
            if (camera) DUMMY.quaternion.copy(camera.quaternion);
            DUMMY.updateMatrix();
            this.mesh.setMatrixAt(p.index, DUMMY.matrix);
        }
        if (anyVisible) this.mesh.instanceMatrix.needsUpdate = true;
    }
}
