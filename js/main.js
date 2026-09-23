import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { GAME_CONFIG } from './config.js';
import { loadCarAssets } from './vehicles/AssetLoader.js';
import { VEHICLES } from './vehicles/VehicleRegistry.js';
import { getCarThumbnail } from './vehicles/CarThumbnail.js';
import { triggerHitFlash } from './vehicles/CarVisual.js';
import { RoadNetwork } from './road/RoadNetwork.js';
import { ROAD_LAYOUT } from './road/RoadLayout.js';
import { TILE_CATALOG } from './road/TileCatalog.js';
import { loadRoadTileAssets, loadPropAssets } from './road/TileAssetLoader.js';
import { buildTileRoad, scatterProps, buildGuardrails } from './road/TileRoadBuilder.js';
import { applyEnvironment, buildScenery, makeSkyTexture, THEME_PALETTES } from './road/roadThemes.js';
import { mulberry32 } from './core/MathUtils.js';
import { PlayerVehicle } from './player/PlayerVehicle.js';
import { TrafficManager } from './traffic/TrafficManager.js';
import { OpposingTraffic } from './traffic/OpposingTraffic.js';
import { CameraManager } from './camera/CameraManager.js';
import { RaceManager } from './race/RaceManager.js';
import { checkPlayerTrafficCollisions } from './collision/CollisionSystem.js';
import { InputManager } from './core/InputManager.js';
import { HUD, mpsToMph } from './hud/HUD.js';
import { SmokeSystem, SkidMarkSystem } from './effects/DriftEffects.js';

const $ = id => document.getElementById(id);
const canvas = $('game');

// --- Renderer / scene / lights (port of index.html:118-158) ---------------
const scene = new THREE.Scene();
scene.background = makeSkyTexture(THEME_PALETTES.us101.sky);
scene.fog = new THREE.FogExp2(THEME_PALETTES.us101.fog, THEME_PALETTES.us101.fogDensity);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.55;

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .08, 3200);
const clock = new THREE.Clock();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .22, .3, .97);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.setSize(innerWidth, innerHeight);

const hemi = new THREE.HemisphereLight(0xaf9aff, 0x4a2278, 2.8); scene.add(hemi);
const ambient = new THREE.AmbientLight(0xd68bff, 1.0); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffb0ec, 2.4);
sun.position.set(-140, 160, 90); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -180; sun.shadow.camera.right = sun.shadow.camera.top = 180; sun.shadow.camera.far = 600;
scene.add(sun);
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(38, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff2fd0 }));
sunBall.position.set(-200, 90, -480); scene.add(sunBall);

// Cyberpunk retro decor (port of index.html:153-158): scanline bars stacked
// behind the neon "sun", plus a wireframe magenta grid floor. Visibility is
// theme-driven via applyEnvironment/retroVisible, not hardcoded here.
const retroDecor = new THREE.Group(); scene.add(retroDecor);
const sunBarMat = new THREE.MeshBasicMaterial({ color: 0x160c33 });
for (let i = 0; i < 5; i++) {
  const bw = 76 - i * 4, bh = 2.6 + i * .9;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 4), sunBarMat);
  bar.position.set(-200, 66 + i * 7.2, -479);
  retroDecor.add(bar);
}
const grid = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000, 40, 40),
  new THREE.MeshBasicMaterial({ color: 0xff2fd0, wireframe: true, transparent: true, opacity: .22 })
);
grid.rotation.x = -Math.PI / 2; grid.position.y = -4.4; retroDecor.add(grid);

const ground = new THREE.Mesh(new THREE.CircleGeometry(720, 96), new THREE.MeshStandardMaterial({ color: 0x281c40, roughness: .95 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -4.5; ground.receiveShadow = true; scene.add(ground);

const roadGroup = new THREE.Group(); scene.add(roadGroup);
const roadBuildings = new THREE.Group(); scene.add(roadBuildings);
const skyline = new THREE.Group(); scene.add(skyline);

function resizeRenderer() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  composer.setSize(innerWidth, innerHeight); bloomPass.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resizeRenderer);
if (window.visualViewport) visualViewport.addEventListener('resize', resizeRenderer);

// --- Speed-streak overlay (port of index.html:1021-1047) -------------------
const fxCanvas = $('speedFx'), fxCtx = fxCanvas.getContext('2d');
function resizeFx() { fxCanvas.width = innerWidth * Math.min(devicePixelRatio, 1.6); fxCanvas.height = innerHeight * Math.min(devicePixelRatio, 1.6); }
resizeFx(); addEventListener('resize', resizeFx);
const speedStreaks = Array.from({ length: 46 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() }));
function updateSpeedFx(speedAbs) {
  const w = fxCanvas.width, h = fxCanvas.height;
  fxCtx.clearRect(0, 0, w, h);
  const t = THREE.MathUtils.clamp((speedAbs - 22) / 34, 0, 1);
  if (t <= 0) return;
  const cx = w / 2, cy = h * .56, maxR = Math.hypot(cx, cy);
  fxCtx.lineCap = 'round';
  for (const s of speedStreaks) {
    s.r += (0.018 + t * 0.05);
    if (s.r > 1) { s.r = Math.random() * 0.15; s.a = Math.random() * Math.PI * 2; }
    const cos = Math.cos(s.a), sin = Math.sin(s.a);
    const inner = s.r * maxR * 0.32, outer = inner + maxR * (0.35 + t * 0.85) * (0.5 + s.r * 0.5);
    fxCtx.strokeStyle = 'rgba(170,238,255,' + (0.04 + t * 0.24 * s.r).toFixed(3) + ')';
    fxCtx.lineWidth = 1 + t * 1.4;
    fxCtx.beginPath(); fxCtx.moveTo(cx + cos * inner, cy + sin * inner); fxCtx.lineTo(cx + cos * outer, cy + sin * outer); fxCtx.stroke();
  }
}

// --- Game state --------------------------------------------------------
let mode = 'attract';
let raceTime = 0, countdown = 3.7, paused = false;
let slowMoTimer = 0;
let vehiclePickIndex = 0;
let player, trafficManager, opposingTraffic, network, cameraManager, raceManager, hud, carAssets, driftEffects;
const SHOWCASE_POS = new THREE.Vector3(0, -4.3, 0);

function showScreen(id) {
  // A menu <button> keeps browser focus after being clicked even once its
  // screen is hidden -- without this, a later Space/Enter press natively
  // "clicks" that still-focused button again (e.g. re-triggering START
  // COMMUTE mid-race) since we never removed it from the DOM, just hid it.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}

async function boot() {
  const [assets, roadTileAssets, propAssets] = await Promise.all([
    loadCarAssets(), loadRoadTileAssets(), loadPropAssets()
  ]);
  carAssets = assets.carAssets;

  network = new RoadNetwork(GAME_CONFIG.road).build(ROAD_LAYOUT, TILE_CATALOG);
  applyEnvironment('us101', { scene, hemi, ambient, sun, sunBall, retroDecor });
  buildScenery('us101', network, { roadBuildings, skyline }, ground);
  buildTileRoad(network, TILE_CATALOG, roadTileAssets, roadGroup);
  buildGuardrails(network, roadGroup);
  scatterProps(network, propAssets, roadGroup, mulberry32(GAME_CONFIG.traffic.seed ^ 0x5eed));

  player = new PlayerVehicle(scene, carAssets, VEHICLES[vehiclePickIndex].assetIndex);
  player.position.copy(SHOWCASE_POS);

  trafficManager = new TrafficManager(scene, network, GAME_CONFIG, carAssets);
  trafficManager.spawnInitial(0);
  opposingTraffic = new OpposingTraffic(scene, network, GAME_CONFIG.road, carAssets);
  opposingTraffic.spawnInitial(0);

  cameraManager = new CameraManager(camera, GAME_CONFIG);
  raceManager = new RaceManager(network, GAME_CONFIG);
  hud = new HUD($);
  hud.buildMinimap(network, raceManager.checkpoints);
  driftEffects = { smoke: new SmokeSystem(scene), skid: new SkidMarkSystem(scene) };

  setupInput();
  renderVehicleRow();
  tick();
}

// --- Vehicle picker (port of index.html:1158-1167) -------------------------
function statBar(label, val) {
  let dots = '';
  for (let i = 1; i <= 5; i++) dots += '<span class="statDot' + (i <= val ? ' filled' : '') + '"></span>';
  return '<div class="statRow"><span class="statLabel">' + label + '</span><span class="statDots">' + dots + '</span></div>';
}
function renderVehicleRow() {
  const row = $('vehicleRow'); row.innerHTML = '';
  VEHICLES.forEach((v, idx) => {
    const card = document.createElement('div');
    card.className = 'pickCard' + (idx === vehiclePickIndex ? ' active' : '');
    card.innerHTML = '<img class="pickThumb" src="' + getCarThumbnail(renderer, carAssets, v.assetIndex) + '" alt="' + v.name + '"><b>' + v.name + '</b><small>' + v.tag + '</small><div class="statBlock">' + statBar('SPEED', v.speed) + statBar('ACCEL', v.accel) + statBar('GRIP', v.handling) + '</div>';
    card.onclick = () => { vehiclePickIndex = idx; player.setVehicle(v.assetIndex); renderVehicleRow(); };
    row.appendChild(card);
  });
}
function cycleVehiclePick(dir) {
  vehiclePickIndex = (vehiclePickIndex + dir + VEHICLES.length) % VEHICLES.length;
  player.setVehicle(VEHICLES[vehiclePickIndex].assetIndex);
  renderVehicleRow();
}

// --- Screen flow: attract -> vehicle select -> countdown -> race -----------
// (trackSelect is dropped entirely -- phase 1 has exactly one ring/theme)
function advanceFromAttract() {
  if (mode !== 'attract') return;
  mode = 'vehicleSelect'; input.setMode(mode);
  showScreen('vehicleSelect');
}
function confirmVehicle() { resetRace(); }

function resetRace() {
  raceTime = 0; countdown = 3.7; paused = false;
  const startEdge = network.primaryEdges[0];
  player.edgeId = startEdge.id;
  player.position.copy(startEdge.pointAtArc(0, startEdge.laneCenterOffset(Math.floor(GAME_CONFIG.road.laneCount / 2))));
  const fr = startEdge.frame(0);
  player.heading = Math.atan2(fr.t.x, fr.t.z); player.moveHeading = player.heading;
  player.speed = 0; player.steer = 0; player.yawRate = 0; player.nitro = 1;
  player._sampleHint = null; player._shoulderRecoverTimer = 0; player.arc = 0; player.primaryArc = 0;

  trafficManager.spawnInitial(0);
  opposingTraffic.spawnInitial(0);
  raceManager = new RaceManager(network, GAME_CONFIG);
  hud.buildMinimap(network, raceManager.checkpoints);
  cameraManager.mode = 0;

  mode = 'countdown'; input.setMode(mode);
  $('hud').classList.add('on'); $('touch').classList.add('show');
  showScreen(null);
}

// --- Input wiring ------------------------------------------------------
let input;
function setupInput() {
  input = new InputManager($);
  input.setHandlers({
    onCameraCycle: () => { const name = cameraManager.cycle(); $('camLabel').textContent = 'CAM: ' + name; },
    onPause: () => {
      if (mode !== 'race' && mode !== 'countdown') return;
      paused = !paused;
      $('banner').textContent = paused ? 'PAUSED' : (mode === 'countdown' ? (Math.ceil(countdown) > 0 ? String(Math.ceil(countdown)) : 'GO!') : '');
      $('banner').classList.toggle('show', paused);
    },
    onAdvanceAttract: advanceFromAttract,
    onMenuNav: dir => cycleVehiclePick(dir),
    onMenuConfirm: confirmVehicle,
    onRenderBindList: () => input.renderBindList($('bindList'))
  });
  input.setMode(mode);

  document.addEventListener('pointerdown', e => {
    if (mode !== 'attract') return;
    if (e.target.closest('#controlsBtn') || e.target.closest('#updateBtn')) return;
    advanceFromAttract();
  });

  $('vehicleNext').onclick = confirmVehicle;
  $('vehicleBack').onclick = () => { mode = 'attract'; input.setMode(mode); showScreen('attract'); };
  $('controlsBtn').onclick = () => { mode = 'controls'; input.setMode(mode); showScreen('controlsScreen'); input.renderBindList($('bindList')); };
  $('bindBack').onclick = () => { input.listeningFor = null; mode = 'attract'; input.setMode(mode); showScreen('attract'); };
  $('bindReset').onclick = () => { input.resetBinds(); input.renderBindList($('bindList')); };
  $('layoutBtn').onclick = () => {
    input.setLayoutEditing(true);
    $('touch').classList.add('show', 'forceShow');
    showScreen('touchLayoutScreen');
  };
  $('layoutResetBtn').onclick = () => input.resetTouchLayout();
  $('layoutDoneBtn').onclick = () => {
    input.setLayoutEditing(false);
    $('touch').classList.remove('forceShow');
    mode = 'controls'; input.setMode(mode); showScreen('controlsScreen');
  };
  $('updateBtn').onclick = () => {
    const btn = $('updateBtn'); btn.classList.add('checking'); btn.textContent = 'UPDATING…';
    const url = new URL(location.href); url.searchParams.set('_r', Date.now());
    setTimeout(() => { location.href = url.toString(); }, 250);
  };
}

// --- Showcase camera for attract/vehicle-select (parked car, slow orbit) ---
let orbitYaw = 0;
function updateShowcase(dt) {
  player.heading += dt * .5; player.moveHeading = player.heading;
  player.placeVisual(dt, raceTime);
  orbitYaw += dt * .22;
  const dist = 7.6, height = 2.5;
  const desired = new THREE.Vector3(
    player.position.x + Math.sin(orbitYaw) * dist,
    player.position.y + height,
    player.position.z + Math.cos(orbitYaw) * dist
  );
  camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
  camera.lookAt(player.position.x, player.position.y + .9, player.position.z);
  camera.fov = THREE.MathUtils.lerp(camera.fov, 50, dt * 3); camera.updateProjectionMatrix();
}

// --- Junction sign (RoadLayout's one split: left lanes -> shortcut, right
// lanes -> bypass -- see RoadLayout.js's own branch-order comment) ---------
function nextJunctionSignText() {
  if (!player.edgeId) return null;
  const edge = network.getEdge(player.edgeId);
  if (edge.nextEdges.length <= 1) return null;
  if (edge.length - player.arc > GAME_CONFIG.road.network.signDistance) return null;
  return 'AHEAD: KEEP LEFT → SHORTCUT (heavier) / KEEP RIGHT → BYPASS (lighter, longer)';
}

// --- Main loop -----------------------------------------------------------
function tick() {
  requestAnimationFrame(tick);
  let dt = Math.min(clock.getDelta(), .033);
  input.update();

  if (paused) { composer.render(); return; }

  if (mode === 'attract' || mode === 'controls' || mode === 'vehicleSelect') {
    raceTime += dt;
    trafficManager.update(dt, 0, raceTime);
    opposingTraffic.update(dt, 0, raceTime);
    updateShowcase(dt);
  } else if (mode === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    $('banner').textContent = n > 0 ? n : 'GO!';
    $('banner').classList.add('show');
    if (countdown <= 0) { mode = 'race'; input.setMode(mode); setTimeout(() => { if (!paused) $('banner').classList.remove('show'); }, 650); }
    trafficManager.update(dt, player.primaryArc, raceTime);
    opposingTraffic.update(dt, player.primaryArc, raceTime);
    cameraManager.update(dt, player);
    player.placeVisual(dt, raceTime);
    hud.update({
      player, raceTime, score: raceManager.score, badRep: raceManager.badRep,
      speedLimitMph: GAME_CONFIG.road.speedLimitMph,
      checkpointSecRemaining: raceManager.segmentTimeRemaining,
      checkpointEvent: null,
      trafficCars: trafficManager.activeCars,
      boosting: false
    });
  } else { // race
    // Close-call slow-mo: the timer itself always counts down in real time
    // (so its duration is consistent regardless of the dip), but everything
    // gameplay-affecting steps on the scaled gdt while it's active -- a
    // brief "did that really just happen" beat after a tight dodge.
    if (slowMoTimer > 0) slowMoTimer = Math.max(0, slowMoTimer - dt);
    const gdt = slowMoTimer > 0 ? dt * GAME_CONFIG.collision.closeCall.slowMoScale : dt;

    raceTime += gdt;
    player.update(gdt, input.input, network, GAME_CONFIG, driftEffects);
    trafficManager.update(gdt, player.primaryArc, raceTime);
    opposingTraffic.update(gdt, player.primaryArc, raceTime);
    checkPlayerTrafficCollisions(player, trafficManager, network, GAME_CONFIG,
      (car) => { raceManager.registerTrafficHit(); triggerHitFlash(car); },
      () => {
        raceManager.registerCloseCall();
        cameraManager.kick(GAME_CONFIG.collision.closeCall.fovKick);
        slowMoTimer = GAME_CONFIG.collision.closeCall.slowMoDurationSec;
      }
    );
    raceManager.update(gdt, player.primaryArc);
    const speedAbs = cameraManager.update(gdt, player);
    updateSpeedFx(speedAbs);
    driftEffects.smoke.update(gdt);
    driftEffects.skid.update(gdt);
    player.placeVisual(gdt, raceTime);

    const events = raceManager.consumeEvents();
    hud.update({
      player, raceTime, score: raceManager.score, badRep: raceManager.badRep,
      speedLimitMph: GAME_CONFIG.road.speedLimitMph,
      checkpointSecRemaining: raceManager.segmentTimeRemaining,
      checkpointEvent: events.checkpoint,
      closeCall: events.closeCall,
      trafficCars: trafficManager.activeCars,
      boosting: input.input.nitro && player.nitro > 0,
      nextJunctionText: nextJunctionSignText()
    });
  }

  composer.render();
}

boot();
