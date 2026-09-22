// Shared GLTF helpers used by both car models (VehicleRegistry/CarVisual) and
// scenery models (roadThemes' trees) -- ported from index.html:376-378.

const PAINT = /^(Orange|DarkOrange|Blue|LightBlue|White|Yellow|Material\.007)$/i;

export function prepShadows(obj) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

// Clones an asset and, if a tint color is given, recolors any material whose
// name matches the known paint-slot pattern -- leaves everything else (glass,
// chrome, trim, foliage/bark on non-car assets) untouched.
export function cloneTint(asset, color) {
  const o = asset.clone(true);
  o.traverse(x => {
    if (!x.isMesh) return;
    const mats = Array.isArray(x.material) ? x.material : [x.material];
    const cloned = mats.map(m => {
      const c = m.clone();
      if (color && PAINT.test(c.name || '')) { c.color.set(color); c.metalness = .28; c.roughness = .32; }
      return c;
    });
    x.material = Array.isArray(x.material) ? cloned : cloned[0];
  });
  return o;
}
