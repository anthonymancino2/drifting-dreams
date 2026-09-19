import * as THREE from 'three';
import Environment from './Environment.js';
import SettingsManager from './SettingsManager.js';
import SaveManager from './SaveManager.js';
import GameLoop from './GameLoop.js';
import InputManager from '../input/InputManager.js';
import TrackManager from '../tracks/TrackManager.js';
import { getTrackDefinition } from '../tracks/TrackDefinitions.js';
import RacerController from '../vehicles/RacerController.js';
import { getVehicleConfig, getDefaultVehicleId } from '../vehicles/VehicleConfigs.js';
import CameraManager from '../camera/CameraManager.js';
import HUD from '../ui/HUD.js';
import DriftEffects from '../effects/DriftEffects.js';
import AudioManager from '../audio/AudioManager.js';

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
const COUNTDOWN_STEP_TIME = 0.85;

function pickAutoQuality() {
    const cores = navigator.hardwareConcurrency || 4;
    const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 500;
    if (cores <= 4 || isSmallScreen) return 'medium';
    return 'high';
}

export default class Game {
    constructor() {
        this.settings = new SettingsManager();
        this.saveManager = new SaveManager();

        this._buildRenderer();
        this._buildScene();

        this.environment = new Environment(this.scene, this.renderer);
        this.environment.setMode(this.settings.get('dayNightMode'));

        const trackDef = getTrackDefinition('circuit_01');
        this.trackManager = new TrackManager(this.scene, this.environment, trackDef);

        this.cameraManager = new CameraManager(this.camera);
        this.inputManager = new InputManager(document.getElementById('touch-controls'));
        this.hud = new HUD(document.getElementById('hud-root'));
        this.driftEffects = new DriftEffects(this.scene);
        this.audio = new AudioManager();
        this.audio.setVolumes({
            master: this.settings.get('masterVolume'),
            music: this.settings.get('musicVolume'),
            effects: this.settings.get('effectsVolume')
        });

        this._applyGraphicsQuality(this.settings.get('graphicsQuality'));

        this.totalLaps = 3;
        this.player = new RacerController({
            scene: this.scene,
            config: getVehicleConfig(this.saveManager.data.preferredVehicle || getDefaultVehicleId()),
            trackManager: this.trackManager,
            spawnGridIndex: 0,
            color: 0x3d7cff,
            isPlayer: true,
            totalLaps: this.totalLaps
        });
        this.player.setNightLights(this.environment.mode === 'night');

        this.raceTime = 0;
        this.raceStarted = false;
        this.raceFinished = false;
        this._countdownTimer = 0;
        this._countdownIndex = -1;
        this._startCountdown();

        this._bindGlobalUI();

        this.gameLoop = new GameLoop({
            onFixedUpdate: (dt) => this._fixedUpdate(dt),
            onRender: (alpha, dt) => this._render(dt)
        });
        this.gameLoop.start();

        window.addEventListener('resize', () => this._onResize());
        this._onResize();
    }

    _buildRenderer() {
        const canvas = document.getElementById('game-canvas');
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    _buildScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800);
    }

    _applyGraphicsQuality(quality) {
        const resolved = quality === 'auto' ? pickAutoQuality() : quality;
        this.resolvedQuality = resolved;
        if (resolved === 'low') {
            this.renderer.shadowMap.enabled = false;
            this.renderer.setPixelRatio(1);
        } else if (resolved === 'medium') {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        } else {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        }
    }

    _startCountdown() {
        this.raceStarted = false;
        this._countdownIndex = 0;
        this._countdownTimer = COUNTDOWN_STEP_TIME;
        this.hud.showCountdown(COUNTDOWN_STEPS[0]);
        this.audio.playCountdownBeep(false);
    }

    _bindGlobalUI() {
        this.inputManager.onDeviceChanged = (device) => this.hud.setActiveInputDevice(device);
        this.hud.setActiveInputDevice(this.inputManager.activeDevice);

        this.inputManager.onGamepadConnected = (pad) => {
            this.hud.showToast(`CONTROLLER CONNECTED\n${pad.id}`);
        };
        this.inputManager.onGamepadDisconnected = () => {
            this.hud.showToast('CONTROLLER DISCONNECTED');
        };

        const toggleDayNight = () => {
            const mode = this.environment.toggle();
            this.settings.set('dayNightMode', mode);
            this.hud.setDayNightIcon(mode);
            this.player.setNightLights(mode === 'night');
        };
        this.hud.dayNightToggleEl.addEventListener('click', toggleDayNight);
        this.hud.setDayNightIcon(this.environment.mode);
        window.addEventListener('keydown', (e) => { if (e.code === 'KeyN') toggleDayNight(); });
    }

    _fixedUpdate(dt) {
        this.inputManager.update(dt);
        const actions = this.inputManager.actions;

        if (this._countdownIndex >= 0) {
            this._countdownTimer -= dt;
            if (this._countdownTimer <= 0) {
                this._countdownIndex++;
                if (this._countdownIndex < COUNTDOWN_STEPS.length) {
                    this.hud.showCountdown(COUNTDOWN_STEPS[this._countdownIndex]);
                    this._countdownTimer = COUNTDOWN_STEP_TIME;
                    this.audio.playCountdownBeep(this._countdownIndex === COUNTDOWN_STEPS.length - 1);
                    if (this._countdownIndex === COUNTDOWN_STEPS.length - 1) this.raceStarted = true;
                } else {
                    this._countdownIndex = -1;
                    this.hud.clearCountdown();
                }
            }
        }

        if (this.raceStarted && !this.raceFinished) this.raceTime += dt;

        if (this.inputManager.wasPressed('changeCamera')) this.cameraManager.toggleMode();

        this.player.update(dt, actions, this.raceStarted, this.raceTime);

        if (!this.raceFinished && this.player.lapManager.finished) {
            this.raceFinished = true;
            this.hud.showToast('RACE FINISHED!', 4000);
        }

        this._updateAudio(actions);
    }

    _updateAudio(actions) {
        const state = this.player.state;
        const speedRatio = Math.abs(state.speed) / state.config.maxSpeed;
        this.audio.updateEngine(speedRatio, actions.throttle, state.boostTimer > 0);
        this.audio.setDrifting(state.drift.active, state.drift.chargeLevel === 'gold' ? 1.5 : 1);
        if (state.collisionFlashTimer > 0.1) this.audio.playCollisionThud();
    }

    _render(dt) {
        this.cameraManager.update(this.player.state, dt, this.player.driftAngle, this.inputManager.actions.lookBack);
        this.driftEffects.update(this.player, dt, this.camera);

        this.hud.update({
            speedKmh: this.player.getSpeedKmh(),
            lap: this.player.lapManager.lap,
            totalLaps: this.totalLaps,
            position: 1,
            totalRacers: 1,
            raceTime: this.raceTime,
            driftChargeLevel: this.player.state.drift.chargeLevel,
            driftChargeRatio: this.player.state.drift.chargeTime / this.player.state.config.driftChargeThresholds.gold,
            boostActive: this.player.state.boostTimer > 0,
            boostRatio: this.player.state.boostTimer / this.player.state.config.boostDuration
        });

        this._updateDebugOverlay();

        this.renderer.render(this.scene, this.camera);
    }

    _updateDebugOverlay() {
        if (!this.hud.debugVisible) return;
        const s = this.player.state;
        const gp = this.inputManager.getGamepadDebugInfo();
        this.hud.updateDebug([
            `FPS: ${this.gameLoop.fps.toFixed(0)}  Frame: ${this.gameLoop.frameTimeMs.toFixed(1)}ms`,
            `Draw calls: ${this.renderer.info.render.calls}  Tris: ${this.renderer.info.render.triangles}`,
            `Quality: ${this.resolvedQuality}`,
            `Position: ${s.position.x.toFixed(1)}, ${s.position.z.toFixed(1)}`,
            `Speed: ${s.speed.toFixed(2)} (${this.player.getSpeedKmh().toFixed(0)} km/h)`,
            `Surface: ${s.surface}  Drift: ${s.drift.active} (${s.drift.chargeLevel})`,
            `Checkpoint segment: ${this.player.lapManager.currentSegment}  Lap: ${this.player.lapManager.lap}/${this.totalLaps}`,
            `Active input: ${this.inputManager.activeDevice}`,
            gp ? `Gamepad: ${gp.id}` : 'Gamepad: none',
            gp ? `Mapping: ${gp.mapping}  Axis0: ${gp.axes[0]?.toFixed(2)}` : '',
            gp ? `R2: ${gp.buttons[7]?.value.toFixed(2)}  L2: ${gp.buttons[6]?.value.toFixed(2)}` : ''
        ].filter(Boolean));
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
