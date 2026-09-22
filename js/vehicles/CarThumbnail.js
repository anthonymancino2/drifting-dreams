import * as THREE from 'three';
import { cloneTint } from '../core/GltfUtils.js';
import { CAR_SCALE } from './CarVisual.js';

// Port of getCarThumbnail (index.html:1108-1157) -- a one-time render-to-
// texture snapshot of each car for the vehicle-select picker, cached per
// assetIndex.
const cache = new Map();

export function getCarThumbnail(renderer, carAssets, assetIndex) {
  if (cache.has(assetIndex)) return cache.get(assetIndex);

  const size = 256, rt = new THREE.WebGLRenderTarget(size, size);
  const tScene = new THREE.Scene();
  tScene.add(new THREE.HemisphereLight(0x9db8ff, 0x201040, 2.4));
  const dir = new THREE.DirectionalLight(0xffffff, 2.6); dir.position.set(3, 5, 4); tScene.add(dir);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 3.2); rim.position.set(-3, 2.5, -4.5); tScene.add(rim);

  const model = cloneTint(carAssets[assetIndex], null);
  model.scale.setScalar(CAR_SCALE);
  model.traverse(x => {
    if (!x.isMesh) return;
    for (const m of Array.isArray(x.material) ? x.material : [x.material]) {
      if ('metalness' in m) m.metalness = Math.min(m.metalness, .35);
      if ('roughness' in m) m.roughness = Math.max(m.roughness, .35);
    }
  });
  const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
  model.position.sub(center); tScene.add(model);
  const dims = box.getSize(new THREE.Vector3()), maxDim = Math.max(dims.x, dims.y, dims.z, .1);
  const tCam = new THREE.PerspectiveCamera(32, 1, .05, 50);
  tCam.position.set(maxDim * 1.15, maxDim * .85, maxDim * 1.5); tCam.lookAt(0, 0, 0);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevToneMapping = renderer.toneMapping, prevExposure = renderer.toneMappingExposure;
  renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x33415e, 1); renderer.clear(); renderer.render(tScene, tCam);
  renderer.toneMapping = prevToneMapping; renderer.toneMappingExposure = prevExposure;

  const buffer = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buffer);
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha); rt.dispose();

  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const cctx = canvas.getContext('2d');
  const imgData = cctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const srcStart = (size - 1 - y) * size * 4;
    imgData.data.set(buffer.subarray(srcStart, srcStart + size * 4), y * size * 4);
  }
  cctx.putImageData(imgData, 0, 0);

  const url = canvas.toDataURL('image/png');
  cache.set(assetIndex, url);
  return url;
}
