import * as THREE from 'three';

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

// Freeway scenery: the near-road guardrail/wall/tree scatter is now the
// tile kit's own job (TileRoadBuilder.scatterProps, using its real prop
// meshes) -- this keeps only the background: a flat, wide, low hill
// silhouette plus a lit cyberpunk city skyline ringing the whole network at
// a fixed distance beyond its bounds. Overpass structures are explicitly
// skipped -- interchanges are a later phase.
export function buildScenery(theme, network, groups, ground) {
  const { roadBuildings, skyline } = groups;
  roadBuildings.clear(); skyline.clear();
  const pal = THEME_PALETTES[theme];
  const { minX, maxX, minZ, maxZ } = network.bounds;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const maxExtent = Math.max(maxX - minX, maxZ - minZ) / 2;

  ground.material.color.setHex(pal.ground);
  const groundRadius = maxExtent + 600;
  if (ground.geometry.parameters.radius !== groundRadius) { ground.geometry.dispose(); ground.geometry = new THREE.CircleGeometry(groundRadius, 96); }
  ground.position.set(cx, ground.position.y, cz);

  if (theme !== 'us101') return;
  const skylineRadius = maxExtent + 950;

  // Lit cyberpunk city skyline, near ring -- this is the primary background
  // element per the requested vibe, not an afterthought.
  const cityCount = 56;
  for (let i = 0; i < cityCount; i++) {
    const a = i / cityCount * Math.PI * 2 + (i * .37 % 1) * .06;
    const radius = skylineRadius + (i * 29 % 90);
    const width = 16 + (i * 13 % 24), depth = 16 + (i * 7 % 20), height = 55 + (i * 41 % 170);
    const b = makeNeonCityBuilding(width, height, depth, i);
    b.position.set(cx + Math.cos(a) * radius, 0, cz + Math.sin(a) * radius);
    b.rotation.y = i;
    skyline.add(b);
  }
  // Distant mountain silhouette, further ring behind the city, for depth.
  const hillCount = 24;
  for (let i = 0; i < hillCount; i++) {
    const a = i / hillCount * Math.PI * 2 + (i * .37 % 1) * .08;
    const radius = skylineRadius + 700 + (i * 41 % 300);
    const hill = makeHill(280 + (i * 53 % 260), 110 + (i * 37 % 170), i);
    hill.position.set(cx + Math.cos(a) * radius, 0, cz + Math.sin(a) * radius);
    skyline.add(hill);
  }
}
