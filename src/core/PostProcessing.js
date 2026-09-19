import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Subtle bloom only - headlights, drift sparks, boost trails and night streetlights
// glow, but the threshold is high enough that ordinary lit surfaces don't wash out.
// This is what gives the "polished arcade portal game" look without a full grading
// pipeline. Kept in its own module so low-end devices can skip it entirely.
export default class PostProcessing {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.55,  // strength
            0.4,   // radius
            0.86   // threshold
        );
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(new OutputPass());

        this.enabled = true;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setSize(width, height) {
        this.composer.setSize(width, height);
        this.bloomPass.setSize(width, height);
    }

    render() {
        this.composer.render();
    }
}
