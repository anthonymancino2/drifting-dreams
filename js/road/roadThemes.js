import * as THREE from 'three';
import { cloneTint } from '../core/GltfUtils.js';

// New freeway-appropriate theme, alongside (not replacing) the palette-driven
// pattern from index.html:327-338 (THEME_PALETTES/applyEnvironment/
// buildScenery) -- same technique, one config object swaps sky/fog/lighting/
// scenery wholesale. Daytime NorCal palette: clear sky, light haze fog (long
// freeway sightlines need less murk than the old tracks' fog), dry grass/
// real asphalt colors, plain white/yellow lane markers instead of neon curbs.
export const THEME_PALETTES = {
  us101: {
    sky: ['#7fb8e8', '#a9d4f2', '#cfe8f7', '#e8f4fb', '#f5fbff'],
    fog: 0xcfe0e8, fogDensity: .00012,
    ground: 0x6b7d5a, shoulder: 0x8f8f92, road: 0x3c3c40,
    curbA: 0xffffff, curbB: 0xffd400, curbEmissive: 0,
    hemiSky: 0xbfe0ff, hemiGround: 0x7a8f5c, hemiIntensity: 1.6,
    ambient: 0xfff6e6, ambientIntensity: .5,
    sunColor: 0xfff2d6, sunIntensity: 2.0, sunPos: [140, 220, 90],
    sunBallColor: 0xfff6d0, sunBallPos: [200, 150, -480],
    retroVisible: false
  }
};

export function makeSkyTexture(stops) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 0, 256);
  const at = [0, .42, .72, .88, 1];
  stops.forEach((color, i) => g.addColorStop(at[i], color));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Port of applyEnvironment (index.html:447-456), taking the scene's light
// refs as a plain object instead of closing over module-level consts.
export function applyEnvironment(theme, env) {
  const pal = THEME_PALETTES[theme];
  env.scene.background = makeSkyTexture(pal.sky);
  env.scene.fog.color.setHex(pal.fog); env.scene.fog.density = pal.fogDensity;
  env.hemi.color.setHex(pal.hemiSky); env.hemi.groundColor.setHex(pal.hemiGround); env.hemi.intensity = pal.hemiIntensity;
  env.ambient.color.setHex(pal.ambient); env.ambient.intensity = pal.ambientIntensity;
  env.sun.color.setHex(pal.sunColor); env.sun.intensity = pal.sunIntensity; env.sun.position.set(...pal.sunPos);
  env.sunBall.material.color.setHex(pal.sunBallColor); env.sunBall.position.set(...pal.sunBallPos);
  env.retroDecor.visible = pal.retroVisible;
}

function ribbon(ring, scene, width, yOffset, material, segments = 720) {
  const pos = [], uv = [], idx = [];
  const vA = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, { p, side } = ring.frame(u);
    for (const x of [-1, 1]) {
      vA.copy(p).addScaledVector(side, width * x); vA.y += yOffset;
      pos.push(vA.x, vA.y, vA.z); uv.push((x + 1) / 2, u * 65);
    }
  }
  for (let i = 0; i < segments; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; scene.add(m);
  return m;
}

// Road surface: same ribbon/curb/guardrail technique as the old
// buildRoadSurface (index.html:345-368), generalized to discrete lanes --
// dashed markers sit at every INTERNAL lane boundary instead of two fixed
// offsets, and the two outer edges get solid edge lines instead of racing curbs.
export function buildRoadSurface(theme, ring, roadGroup, scene, ground) {
  roadGroup.clear();
  const pal = THEME_PALETTES[theme];
  ground.material.color.setHex(pal.ground);
  const groundRadius = Math.max(...ring.points.map(p => Math.hypot(p.x, p.z))) + 600;
  if (ground.geometry.parameters.radius !== groundRadius) { ground.geometry.dispose(); ground.geometry = new THREE.CircleGeometry(groundRadius, 96); }

  const roadHalf = ring.roadHalfWidth;
  roadGroup.add(ribbon(ring, scene, ring.halfWidth, -.18, new THREE.MeshStandardMaterial({ color: pal.shoulder, roughness: .85, side: THREE.DoubleSide })));
  roadGroup.add(ribbon(ring, scene, roadHalf, 0, new THREE.MeshStandardMaterial({ color: pal.road, roughness: .7, metalness: .15, side: THREE.DoubleSide })));

  const dashGeo = new THREE.BoxGeometry(.22, .045, 3.6);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0x000000, emissiveIntensity: 0 });
  const dashCount = Math.max(60, Math.round(ring.length / 12));
  const laneBoundaryOffsets = [];
  for (let i = 1; i < ring.cfg.laneCount; i++) laneBoundaryOffsets.push(-roadHalf + ring.cfg.laneWidth * i);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount * Math.max(1, laneBoundaryOffsets.length));
  const dummy = new THREE.Object3D(); let di = 0;
  for (let i = 0; i < dashCount; i++) {
    const u = i / dashCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    for (const lane of laneBoundaryOffsets) {
      dummy.position.copy(p).addScaledVector(side, lane); dummy.position.y += .09;
      dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); dashes.setMatrixAt(di++, dummy.matrix);
    }
  }
  dashes.count = di;
  dashes.receiveShadow = true; roadGroup.add(dashes);

  const curbGeo = new THREE.BoxGeometry(1.7, .24, 3);
  const curbMats = [
    new THREE.MeshStandardMaterial({ color: pal.curbA, emissive: pal.curbA, emissiveIntensity: pal.curbEmissive }),
    new THREE.MeshStandardMaterial({ color: pal.curbB, emissive: pal.curbB, emissiveIntensity: pal.curbEmissive })
  ];
  const curbCount = Math.max(80, Math.round(ring.length / 9));
  for (let i = 0; i < curbCount; i++) {
    const u = i / curbCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    for (const edge of [-1, 1]) {
      const m = new THREE.Mesh(curbGeo, curbMats[0]);
      m.position.copy(p).addScaledVector(side, edge * (roadHalf + .25)); m.position.y += .05; m.rotation.y = yaw;
      m.receiveShadow = true; roadGroup.add(m);
    }
  }

  const railMat = new THREE.MeshStandardMaterial({ color: 0xaebbc1, metalness: .75, roughness: .26 });
  const railGeo = new THREE.BoxGeometry(.18, .2, 5.3), postGeo = new THREE.BoxGeometry(.18, 1.05, .18);
  const railCount = Math.max(50, Math.round(ring.length / 12));
  for (let i = 0; i < railCount; i++) {
    const u = i / railCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    for (const edge of [-1, 1]) {
      const r = new THREE.Mesh(railGeo, railMat);
      r.position.copy(p).addScaledVector(side, edge * (ring.halfWidth + .5)); r.position.y += .78; r.rotation.y = yaw; r.castShadow = true;
      roadGroup.add(r);
      if (i % 2 === 0) { const post = new THREE.Mesh(postGeo, railMat); post.position.copy(r.position); post.position.y -= .42; roadGroup.add(post); }
    }
  }
}

function placeClearOfRoad(ring, u, edge, baseDist, halfExtent) {
  const bi = Math.max(0, Math.min(ring.sampleCount - 1, Math.round(((u % 1 + 1) % 1) * ring.sampleCount)));
  const s = ring.samples[bi];
  let dist = baseDist;
  for (let tries = 0; tries < 40; tries++) {
    const pos = new THREE.Vector3(s.p.x + s.side.x * edge * dist, s.p.y, s.p.z + s.side.z * edge * dist);
    const info = ring.nearestSample(pos);
    if (Math.abs(info.lateral) - halfExtent - ring.halfWidth > 7) return pos;
    dist += 6;
  }
  return null;
}

function makeFreewayTree(seed, treeAsset) {
  const t = cloneTint(treeAsset, null); // no hue shift -- natural green, unlike sakura's blossom tint
  t.traverse(x => {
    if (!x.isMesh) return;
    for (const m of Array.isArray(x.material) ? x.material : [x.material]) {
      if ('metalness' in m) m.metalness = Math.min(m.metalness, .1);
    }
  });
  const scale = 2.0 + (seed % 5) * .4;
  t.scale.setScalar(scale); t.rotation.y = (seed * 2.4) % 6.28;
  return t;
}

function makeHill(radius, height, seed) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 7, 1),
    new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x8a9f6a : 0x97ab74, roughness: 1, flatShading: true })
  );
  cone.position.y = height / 2; cone.rotation.y = seed;
  return cone;
}

// Freeway scenery: reuses the guardrail/post loop already built for every
// theme by buildRoadSurface, adds sound-wall segments and sparse natural
// trees (much sparser than the old sakura theme's density) plus a flat, wide,
// low hill silhouette for the distant skyline instead of buildings/mountains/
// grandstands. Overpass structures are explicitly skipped -- interchanges are
// a later phase.
export function buildScenery(theme, ring, groups, assets) {
  const { roadBuildings, skyline } = groups;
  roadBuildings.clear(); skyline.clear();
  if (theme !== 'us101') return;

  const maxExtent = Math.max(...ring.points.map(p => Math.hypot(p.x, p.z)));
  const skylineRadius = maxExtent + 950;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb7b2a6, roughness: .9 });
  const wallGeo = new THREE.BoxGeometry(8, 4, .3);
  const wallCount = Math.max(40, Math.round(ring.length / 26));
  for (let i = 0; i < wallCount; i++) {
    const u = i / wallCount, edge = i % 2 ? 1 : -1;
    const pos = placeClearOfRoad(ring, u, edge, 10, 4);
    if (!pos) continue;
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.copy(pos); wall.position.y += 2;
    const s = ring.samples[Math.round((u % 1 + 1) % 1 * ring.sampleCount)];
    wall.rotation.y = Math.atan2(s.t.x, s.t.z);
    wall.castShadow = true; wall.receiveShadow = true;
    roadBuildings.add(wall);
  }

  const treeCount = Math.max(20, Math.round(ring.length / 70)); // much sparser than sakura's trackLength/22
  for (let i = 0; i < treeCount; i++) {
    const u = i / treeCount + .002 * Math.sin(i * 11), edge = i % 2 ? 1 : -1, halfExtent = 4;
    const pos = placeClearOfRoad(ring, u, edge, 16 + (i * 13 % 26), halfExtent);
    if (!pos) continue;
    const t = makeFreewayTree(i, assets.treeAsset);
    t.position.copy(pos);
    roadBuildings.add(t);
  }

  const hillCount = 36;
  for (let i = 0; i < hillCount; i++) {
    const a = i / hillCount * Math.PI * 2 + (i * .37 % 1) * .08;
    const radius = skylineRadius + (i * 41 % 160);
    const hill = makeHill(280 + (i * 53 % 260), 90 + (i * 37 % 140), i);
    hill.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    skyline.add(hill);
  }
}
