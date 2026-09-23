import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepShadows } from '../core/GltfUtils.js';

// Same fetch()+GLTFLoader.load(url) pattern as vehicles/AssetLoader.js.
const loader = new GLTFLoader();
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));

// manifest.json: { <tileTypeFile>: "assets/models/roadTiles/<file>.glb" }
// keyed by the .glb's base filename (e.g. "Road1"), not the TileCatalog's
// short type id (e.g. "straight") -- callers map catalog.file -> asset.
export async function loadRoadTileAssets(manifestUrl = 'assets/models/roadTiles/manifest.json') {
  const manifest = await fetch(manifestUrl).then(r => r.json());
  const entries = await Promise.all(Object.entries(manifest).map(async ([name, url]) => [name, await load(url)]));
  const assets = new Map(entries);
  for (const asset of assets.values()) prepShadows(asset);
  return assets;
}

// manifest.json: { <category>: { <propName>: "assets/models/props/<file>.glb" } }
export async function loadPropAssets(manifestUrl = 'assets/models/props/manifest.json') {
  const manifest = await fetch(manifestUrl).then(r => r.json());
  const assets = new Map();
  for (const category of Object.values(manifest)) {
    for (const [name, url] of Object.entries(category)) {
      assets.set(name, await load(url));
    }
  }
  for (const asset of assets.values()) prepShadows(asset);
  return assets;
}
