import * as THREE from 'three';
import { cloneTint } from '../core/GltfUtils.js';

// Gap between the main carriageway's shoulder and the opposing carriageway's
// shoulder -- shared with OpposingTraffic.js so the visual road and the cars
// driving on it agree on where it actually is.
export const MEDIAN_GAP = 10;

// New freeway-appropriate theme, alongside (not replacing) the palette-driven
// pattern from index.html:327-338 (THEME_PALETTES/applyEnvironment/
// buildScenery) -- same technique, one config object swaps sky/fog/lighting/
// scenery wholesale. Cyberpunk night palette: dark purple-to-magenta sky,
// neon cyan/magenta lane markers and sound-wall glow, a hot-pink "sun" low on
// the horizon, and the retro scanline-sun + wireframe grid floor from the
// original cyberpunk track brought back (retroVisible:true) -- freeway
// structure (lanes/guardrails/traffic) stays exactly the same, only the mood
// changes.
export const THEME_PALETTES = {
  us101: {
    sky: ['#05030f', '#170b3a', '#4a1568', '#c22fb0', '#ff7fd6'],
    fog: 0x2a1148, fogDensity: .00016,
    ground: 0x281c40, shoulder: 0x3f2e58, road: 0x352a4a,
    curbA: 0xd93fc0, curbB: 0x2fb8c4, curbEmissive: .12,
    hemiSky: 0xaf9aff, hemiGround: 0x4a2278, hemiIntensity: 2.8,
    ambient: 0xd68bff, ambientIntensity: 1.0,
    sunColor: 0xffb0ec, sunIntensity: 2.4, sunPos: [-140, 160, 90],
    sunBallColor: 0xff2fd0, sunBallPos: [-200, 90, -480],
    retroVisible: true
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

// centerOffset shifts the whole strip sideways from the ring's own
// centerline -- used to build the opposing carriageway as a second strip
// running parallel to the main one, on the same underlying curve.
function ribbon(ring, scene, halfWidth, yOffset, material, segments = 720, centerOffset = 0) {
  const pos = [], uv = [], idx = [];
  const vA = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, { p, side } = ring.frame(u);
    for (const x of [-1, 1]) {
      vA.copy(p).addScaledVector(side, centerOffset + halfWidth * x); vA.y += yOffset;
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

  // Plain reflective lane paint, not a light source -- a small emissive kick
  // (not a full neon glow) is enough to read as "lit road markings at night"
  // without turning the lanes into strobing light bars.
  const dashGeo = new THREE.BoxGeometry(.22, .045, 3.6);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8e6ea, emissive: 0x6fb8c2, emissiveIntensity: .25 });
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
  const curbCount = Math.max(60, Math.round(ring.length / 22));
  for (let i = 0; i < curbCount; i++) {
    const u = i / curbCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    for (const edge of [-1, 1]) {
      const m = new THREE.Mesh(curbGeo, curbMats[edge < 0 ? 0 : 1]);
      m.position.copy(p).addScaledVector(side, edge * (roadHalf + .25)); m.position.y += .05; m.rotation.y = yaw;
      m.receiveShadow = true; roadGroup.add(m);
    }
  }

  // Low metalness/high roughness on purpose -- a shiny rail throws sharp
  // specular glints as each post passes the camera, which bloom turns into a
  // rapid strobe effect while driving. Matte reads as metal at night just
  // fine without the flashing.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a7fb0, metalness: .2, roughness: .75 });
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

  // Opposing carriageway: a second parallel strip across the median, purely
  // visual (OpposingTraffic.js drives the cars on it) -- reuses the same
  // ring curve, just offset further out. The main carriageway's own +1-edge
  // guardrail (built above) already serves as the near-side median barrier;
  // this only needs the far-side one plus the opposing asphalt/shoulder/lane
  // markings mirroring the main road's.
  const oppCenter = ring.halfWidth + MEDIAN_GAP + roadHalf;
  roadGroup.add(ribbon(ring, scene, ring.halfWidth, -.18, new THREE.MeshStandardMaterial({ color: pal.shoulder, roughness: .85, side: THREE.DoubleSide }), 720, oppCenter));
  roadGroup.add(ribbon(ring, scene, roadHalf, 0, new THREE.MeshStandardMaterial({ color: pal.road, roughness: .7, metalness: .15, side: THREE.DoubleSide }), 720, oppCenter));

  const oppLaneBoundaryOffsets = laneBoundaryOffsets.map(o => o + oppCenter);
  const oppDashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount * Math.max(1, oppLaneBoundaryOffsets.length));
  let odi = 0;
  for (let i = 0; i < dashCount; i++) {
    const u = i / dashCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    for (const lane of oppLaneBoundaryOffsets) {
      dummy.position.copy(p).addScaledVector(side, lane); dummy.position.y += .09;
      dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); oppDashes.setMatrixAt(odi++, dummy.matrix);
    }
  }
  oppDashes.count = odi;
  oppDashes.receiveShadow = true; roadGroup.add(oppDashes);

  for (let i = 0; i < railCount; i++) {
    const u = i / railCount, { p, t, side } = ring.frame(u), yaw = Math.atan2(t.x, t.z);
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.copy(p).addScaledVector(side, oppCenter + ring.halfWidth + .5); r.position.y += .78; r.rotation.y = yaw; r.castShadow = true;
    roadGroup.add(r);
    if (i % 2 === 0) { const post = new THREE.Mesh(postGeo, railMat); post.position.copy(r.position); post.position.y -= .42; roadGroup.add(post); }
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
  // cloneTint's name-based PAINT regex only matches car paint slots, not
  // foliage materials, so re-tinting a tree needs the same color-heuristic
  // approach the old sakura tree used (detect "greenish" materials by value)
  // -- here shifting them to a dark violet silhouette instead of blossom pink,
  // so trees read as shapes against the neon night sky rather than daylight
  // roadside planting.
  const t = cloneTint(treeAsset, null);
  const hue = seed % 2 ? 0x1a1030 : 0x231640;
  t.traverse(x => {
    if (!x.isMesh) return;
    for (const m of Array.isArray(x.material) ? x.material : [x.material]) {
      if ('metalness' in m) m.metalness = Math.min(m.metalness, .1);
      if (!m.color) continue;
      const c = m.color;
      if (c.g > c.r * .9 && c.g > c.b * .9) { m.color.set(hue); if ('roughness' in m) m.roughness = Math.max(m.roughness, .7); }
    }
  });
  const scale = 2.0 + (seed % 5) * .4;
  t.scale.setScalar(scale); t.rotation.y = (seed * 2.4) % 6.28;
  return t;
}

function makeHill(radius, height, seed) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 7, 1),
    new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x2a1a45 : 0x351f52, roughness: 1, flatShading: true })
  );
  cone.position.y = height / 2; cone.rotation.y = seed;
  return cone;
}

// Cyberpunk city skyline building, port of index.html:382-383's makeBuilding
// -- a boxy tower with a glowing neon rooftop cap and a few lit window
// panes per face. Windows/cap use MeshBasicMaterial at partial opacity
// (unlit, but soft, scattered small panes rather than one continuous strip)
// so the skyline reads as a lit-up city at a distance without the harsh
// continuous-glow strips that made the road itself hard to look at.
const CITY_BODY_COLORS = [0x1a1330, 0x211a3d, 0x150f28, 0x241c40, 0x1c1440];
const CITY_NEON_COLORS = [0x24f5ef, 0xff2fd0, 0xa64bff, 0xffd31d, 0xff8a3d];
function makeNeonCityBuilding(width, height, depth, seed) {
  const g = new THREE.Group();
  const bodyColor = CITY_BODY_COLORS[seed % CITY_BODY_COLORS.length];
  const neonColor = CITY_NEON_COLORS[(seed * 3 + 1) % CITY_NEON_COLORS.length];
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: .85, metalness: .2 }));
  body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
  const capH = 1.1 + height * .02;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, capH, depth * 1.04), new THREE.MeshBasicMaterial({ color: neonColor }));
  cap.position.y = height + capH / 2; g.add(cap);
  const winMat = new THREE.MeshBasicMaterial({ color: neonColor, transparent: true, opacity: .55, side: THREE.DoubleSide });
  const rows = Math.max(2, Math.floor(height / 10));
  for (let r = 0; r < rows; r++) {
    if ((seed * 7 + r * 13) % 10 < 3) continue;
    const wy = 5 + r * (height - 9) / Math.max(1, rows - 1);
    const winF = new THREE.Mesh(new THREE.PlaneGeometry(width * .62, .6), winMat); winF.position.set(0, wy, depth / 2 + .03); g.add(winF);
    const winB = new THREE.Mesh(new THREE.PlaneGeometry(width * .62, .6), winMat); winB.position.set(0, wy, -depth / 2 - .03); winB.rotation.y = Math.PI; g.add(winB);
  }
  return g;
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

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241a3a, roughness: .8 });
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

  // Lit cyberpunk city skyline, near ring -- this is the primary background
  // element per the requested vibe, not an afterthought.
  const cityCount = 56;
  for (let i = 0; i < cityCount; i++) {
    const a = i / cityCount * Math.PI * 2 + (i * .37 % 1) * .06;
    const radius = skylineRadius + (i * 29 % 90);
    const width = 16 + (i * 13 % 24), depth = 16 + (i * 7 % 20), height = 55 + (i * 41 % 170);
    const b = makeNeonCityBuilding(width, height, depth, i);
    b.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    b.rotation.y = i;
    skyline.add(b);
  }
  // Distant mountain silhouette, further ring behind the city, for depth.
  const hillCount = 24;
  for (let i = 0; i < hillCount; i++) {
    const a = i / hillCount * Math.PI * 2 + (i * .37 % 1) * .08;
    const radius = skylineRadius + 700 + (i * 41 % 300);
    const hill = makeHill(280 + (i * 53 % 260), 110 + (i * 37 % 170), i);
    hill.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    skyline.add(hill);
  }
}
