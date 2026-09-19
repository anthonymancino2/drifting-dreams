import * as THREE from 'three';

const SAMPLE_COUNT = 260;

// Builds one closed-loop track from a TrackDefinition: road ribbon, grass, shoulders,
// guidance lines, barriers, and (for night mode) simple emissive marker lights.
// Also the single source of truth for "where is the road" - surface lookup for
// vehicle physics and checkpoint/arc-length progress for lap counting.
export default class TrackManager {
    constructor(scene, environment, definition) {
        this.scene = scene;
        this.environment = environment;
        this.definition = definition;
        this.group = new THREE.Group();
        scene.add(this.group);

        this._buildPath();
        this._buildRoadMesh();
        this._buildGroundAndShoulder();
        this._buildGuidanceLines();
        this._buildBarriers();
        this._buildTrackLights();
        this._buildCheckpointMarkers();
    }

    _buildPath() {
        const pts = this.definition.controlPoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
        this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
        this.samples = this.curve.getSpacedPoints(SAMPLE_COUNT);

        this.tangents = [];
        this.normals = [];
        this.arcLengths = [0];
        let total = 0;
        for (let i = 0; i < this.samples.length; i++) {
            const prev = this.samples[(i - 1 + this.samples.length) % this.samples.length];
            const next = this.samples[(i + 1) % this.samples.length];
            const tangent = next.clone().sub(prev).normalize();
            this.tangents.push(tangent);
            this.normals.push(new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize());
            if (i > 0) total += this.samples[i].distanceTo(this.samples[i - 1]);
            if (i > 0) this.arcLengths.push(total);
        }
        total += this.samples[0].distanceTo(this.samples[this.samples.length - 1]);
        this.totalLength = total;
    }

    _buildRoadMesh() {
        const halfWidth = this.definition.roadWidth / 2;
        const positions = [];
        const uvs = [];
        const n = this.samples.length;
        for (let i = 0; i <= n; i++) {
            const idx = i % n;
            const p = this.samples[idx];
            const normal = this.normals[idx];
            const left = p.clone().addScaledVector(normal, -halfWidth);
            const right = p.clone().addScaledVector(normal, halfWidth);
            positions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
            const v = this.arcLengths[idx] / this.totalLength * 40;
            uvs.push(0, v, 1, v);
        }
        const indices = [];
        for (let i = 0; i < n; i++) {
            const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
            indices.push(a, c, b, b, c, d);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ color: this.definition.roadColor, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.roadMesh = mesh;
    }

    _buildGroundAndShoulder() {
        const halfWidth = this.definition.roadWidth / 2;
        const shoulderOuter = halfWidth + this.definition.shoulderWidth;
        const n = this.samples.length;
        const positions = [];
        const indices = [];
        for (let i = 0; i <= n; i++) {
            const idx = i % n;
            const p = this.samples[idx];
            const normal = this.normals[idx];
            const left = p.clone().addScaledVector(normal, -shoulderOuter);
            const right = p.clone().addScaledVector(normal, shoulderOuter);
            positions.push(left.x, 0.01, left.z, right.x, 0.01, right.z);
        }
        for (let i = 0; i < n; i++) {
            const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
            indices.push(a, c, b, b, c, d);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: this.definition.shoulderColor, roughness: 1.0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        this.group.add(mesh);

        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        groundGeo.rotateX(-Math.PI / 2);
        const groundMat = new THREE.MeshStandardMaterial({ color: this.definition.groundColor, roughness: 1.0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.02;
        ground.receiveShadow = true;
        this.group.add(ground);
    }

    _buildGuidanceLines() {
        const halfWidth = this.definition.roadWidth / 2 - 0.6;
        const n = this.samples.length;
        for (const side of [-1, 1]) {
            const positions = [];
            const indices = [];
            for (let i = 0; i <= n; i++) {
                const idx = i % n;
                const p = this.samples[idx];
                const normal = this.normals[idx];
                const inner = p.clone().addScaledVector(normal, side * (halfWidth - 0.25));
                const outer = p.clone().addScaledVector(normal, side * (halfWidth + 0.25));
                positions.push(inner.x, 0.03, inner.z, outer.x, 0.03, outer.z);
            }
            for (let i = 0; i < n; i++) {
                const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
                indices.push(a, c, b, b, c, d);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            const material = new THREE.MeshBasicMaterial({ color: this.definition.lineColor, side: THREE.DoubleSide });
            this.group.add(new THREE.Mesh(geometry, material));
        }
    }

    _buildBarriers() {
        const halfWidth = this.definition.roadWidth / 2 + this.definition.shoulderWidth;
        const step = 5;
        const n = this.samples.length;
        const boxGeo = new THREE.BoxGeometry(1.2, 1.0, 2.4);
        const material = new THREE.MeshStandardMaterial({ color: 0xd8483a, roughness: 0.6 });
        const count = Math.ceil(n / step) * 2;
        const instanced = new THREE.InstancedMesh(boxGeo, material, count);
        instanced.castShadow = true;
        instanced.receiveShadow = true;
        this.barrierColliders = [];
        let idx = 0;
        const dummy = new THREE.Object3D();
        for (let i = 0; i < n; i += step) {
            const p = this.samples[i];
            const normal = this.normals[i];
            const tangentAngle = Math.atan2(this.tangents[i].x, this.tangents[i].z);
            for (const side of [-1, 1]) {
                const pos = p.clone().addScaledVector(normal, side * halfWidth);
                dummy.position.set(pos.x, 0.5, pos.z);
                dummy.rotation.y = tangentAngle;
                dummy.updateMatrix();
                instanced.setMatrixAt(idx, dummy.matrix);
                this.barrierColliders.push({ position: pos, normal: normal.clone().multiplyScalar(side) });
                idx++;
            }
        }
        this.group.add(instanced);
    }

    _buildTrackLights() {
        const halfWidth = this.definition.roadWidth / 2 + this.definition.shoulderWidth + 0.8;
        const step = 10;
        const n = this.samples.length;
        const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const lampGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xfff3c4, emissiveIntensity: 2.2 });

        const lightsGroup = new THREE.Group();
        this._lampMeshes = [];
        this._lightPoints = [];
        for (let i = 0; i < n; i += step) {
            const p = this.samples[i];
            const normal = this.normals[i];
            const pos = p.clone().addScaledVector(normal, halfWidth);
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(pos.x, 1.5, pos.z);
            pole.castShadow = true;
            const lamp = new THREE.Mesh(lampGeo, lampMat.clone());
            lamp.position.set(pos.x, 3.1, pos.z);
            const point = new THREE.PointLight(0xfff3c4, 0.0, 14, 2);
            point.position.set(pos.x, 3.1, pos.z);
            lightsGroup.add(pole, lamp, point);
            this._lampMeshes.push(lamp);
            this._lightPoints.push(point);
        }
        this.group.add(lightsGroup);
        this.environment.onModeChange((mode) => this.setNightLightIntensity(mode === 'night'));
    }

    _buildCheckpointMarkers() {
        this.checkpointArcLengths = [];
        const num = this.definition.numCheckpoints;
        for (let i = 0; i < num; i++) {
            this.checkpointArcLengths.push((i / num) * this.totalLength);
        }
    }

    setNightLightIntensity(on) {
        for (const p of this._lightPoints || []) p.intensity = on ? 1.2 : 0.0;
        for (const lamp of this._lampMeshes || []) lamp.material.emissiveIntensity = on ? 2.2 : 0.15;
    }

    getStartTransform(gridIndex = 0) {
        const p = this.samples[0].clone();
        const tangent = this.tangents[0];
        const normal = this.normals[0];
        const row = Math.floor(gridIndex / 2);
        const col = gridIndex % 2 === 0 ? -1 : 1;
        p.addScaledVector(normal, col * 2.4);
        p.addScaledVector(tangent, -row * 4.5);
        const heading = Math.atan2(tangent.x, tangent.z);
        return { position: p, heading };
    }

    // Closest-point-on-path lookup used for surface detection and lap/arc-length progress.
    getPathInfo(position) {
        let bestDistSq = Infinity;
        let bestIndex = 0;
        for (let i = 0; i < this.samples.length; i++) {
            const d = this.samples[i].distanceToSquared(position);
            if (d < bestDistSq) { bestDistSq = d; bestIndex = i; }
        }
        const p = this.samples[bestIndex];
        const normal = this.normals[bestIndex];
        const offset = position.clone().sub(p);
        const lateral = offset.dot(normal);
        const halfWidth = this.definition.roadWidth / 2;
        const shoulderOuter = halfWidth + this.definition.shoulderWidth;
        const absLateral = Math.abs(lateral);

        let surface = 'asphalt';
        if (absLateral > halfWidth) surface = 'offroad';
        const outOfBounds = absLateral > shoulderOuter + 3;

        return {
            index: bestIndex,
            arcLength: this.arcLengths[bestIndex],
            lateral,
            surface,
            outOfBounds,
            distance: Math.sqrt(bestDistSq)
        };
    }

    getCheckpointCount() {
        return this.definition.numCheckpoints;
    }

    getCheckpointSegmentForArcLength(arcLength) {
        const segLen = this.totalLength / this.definition.numCheckpoints;
        return Math.floor(arcLength / segLen) % this.definition.numCheckpoints;
    }

    getRespawnTransform(pathIndex) {
        const p = this.samples[pathIndex].clone();
        const tangent = this.tangents[pathIndex];
        p.y = 0;
        const heading = Math.atan2(tangent.x, tangent.z);
        return { position: p, heading };
    }
}
