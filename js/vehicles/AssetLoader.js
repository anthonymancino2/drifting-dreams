import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepShadows } from '../core/GltfUtils.js';

// Replaces the old inline-base64 GLTFLoader.parse() pattern
// (index.html:371-376) with real fetch()+GLTFLoader.load(url) calls against
// the extracted .glb binaries -- works identically under
// `python3 -m http.server` and GitHub Pages.
export async function loadCarAssets(manifestUrl = 'assets/models/manifest.json') {
  const manifest = await fetch(manifestUrl).then(r => r.json());
  const loader = new GLTFLoader();
  const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));

  const carAssets = await Promise.all(manifest.cars.map(entry => load(entry.file)));
  const [treeAsset, rockAsset, bushAsset] = await Promise.all(
    [manifest.tree, manifest.rock, manifest.bush].map(load)
  );

  [...carAssets, treeAsset, rockAsset, bushAsset].forEach(prepShadows);

  return { carAssets, treeAsset, rockAsset, bushAsset };
}
