import * as THREE from 'three';

// Day/Night presets. Swapping is just re-targeting light color/intensity, fog and sky
// color, plus toggling emissive track lights - cheap enough to do instantly with no
// scene rebuild, which is what lets Settings and the quick-toggle button both call it.
const PRESETS = {
    day: {
        sky: 0x8fd0ff,
        fogColor: 0x9fdcff,
        fogNear: 60,
        fogFar: 340,
        hemiSky: 0xaee2ff,
        hemiGround: 0x4a7a3c,
        hemiIntensity: 0.9,
        sunColor: 0xfff4e0,
        sunIntensity: 1.35,
        sunPosition: [80, 120, 40],
        ambientIntensity: 0.35,
        trackLightsOn: false,
        exposure: 1.05
    },
    night: {
        sky: 0x02040f,
        fogColor: 0x04060f,
        fogNear: 40,
        fogFar: 260,
        hemiSky: 0x1a2340,
        hemiGround: 0x05070c,
        hemiIntensity: 0.35,
        sunColor: 0x8fa8ff,
        sunIntensity: 0.28,
        sunPosition: [-60, 90, -30],
        ambientIntensity: 0.12,
        trackLightsOn: true,
        exposure: 0.9
    }
};

export default class Environment {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.mode = 'day';
        this.modeChangeListeners = [];

        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(1024, 1024);
        this.sunLight.shadow.camera.left = -80;
        this.sunLight.shadow.camera.right = 80;
        this.sunLight.shadow.camera.top = 80;
        this.sunLight.shadow.camera.bottom = -80;
        this.sunLight.shadow.camera.far = 300;
        this.sunLight.shadow.bias = -0.0015;
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);

        this.scene.add(this.hemiLight, this.sunLight, this.ambientLight);
        this.scene.fog = new THREE.Fog(0x9fdcff, 60, 340);

        this.setMode('day');
    }

    onModeChange(callback) {
        this.modeChangeListeners.push(callback);
        callback(this.mode, PRESETS[this.mode]);
    }

    setMode(mode) {
        const preset = PRESETS[mode] || PRESETS.day;
        this.mode = PRESETS[mode] ? mode : 'day';

        this.scene.background = new THREE.Color(preset.sky);
        this.scene.fog.color.set(preset.fogColor);
        this.scene.fog.near = preset.fogNear;
        this.scene.fog.far = preset.fogFar;

        this.hemiLight.color.set(preset.hemiSky);
        this.hemiLight.groundColor.set(preset.hemiGround);
        this.hemiLight.intensity = preset.hemiIntensity;

        this.sunLight.color.set(preset.sunColor);
        this.sunLight.intensity = preset.sunIntensity;
        this.sunLight.position.set(...preset.sunPosition);

        this.ambientLight.intensity = preset.ambientIntensity;
        this.renderer.toneMappingExposure = preset.exposure;

        for (const cb of this.modeChangeListeners) cb(this.mode, preset);
    }

    toggle() {
        this.setMode(this.mode === 'day' ? 'night' : 'day');
        return this.mode;
    }
}
