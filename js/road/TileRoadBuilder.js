import * as THREE from 'three';
import { TILE_SCALE } from './TileCatalog.js';
import { THEME_PALETTES } from './roadThemes.js';

// Places a plain clone (road tiles carry no paint-slot materials, so no
// tinting like CarVisual's cloneTint) per network.tilePlacements entry.
// anchor/deg come straight out of RoadNetwork's resolvePlacement -- the
// same rot2(x,z,deg) convention IS Three.js's own Y-axis rotation matrix
// (x'=x*cos+z*sin, z'=-x*sin+z*cos), and Three.js composes an object's
// matrix as scale-then-rotate-then-translate, so applying TILE_SCALE (and,
// for a mirrored tile, a negative X scale) BEFORE rotation.y here lines up
// exactly with TileCatalog's pre-scaled/pre-mirrored socket coordinates.
export function buildTileRoad(network, catalog, tileAssets, roadGroup) {
  let placed = 0, missing = 0;
  for (const { typeId, anchor, deg } of network.tilePlacements) {
    const def = catalog[typeId];
    const asset = tileAssets.get(def.file);
    if (!asset) { missing++; console.warn(`[TileRoadBuilder] missing tile asset "${def.file}" for type "${typeId}"`); continue; }
    const mesh = asset.clone(true);
    mesh.scale.set(def.mirror ? -TILE_SCALE : TILE_SCALE, TILE_SCALE, TILE_SCALE);
    if (def.mirror) {
      // A single-axis negative scale flips triangle winding, which can make
      // faces disappear under default backface culling -- DoubleSide keeps
      // the mirrored tile visible regardless of which way winding ended up.
      mesh.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.side = THREE.DoubleSide; });
    }
    mesh.position.set(anchor[0], 0, anchor[1]);
    mesh.rotation.y = deg * Math.PI / 180;
    roadGroup.add(mesh);
    placed++;
  }
  console.log(`[TileRoadBuilder] placed ${placed} tiles${missing ? `, ${missing} missing` : ''}`);
  return { placed, missing };
}

// A visible guardrail exactly at edge.halfWidth -- the same boundary
// PlayerVehicle's hardened shoulder clamp enforces physically. Without
// this, running off-road felt like "the road isn't really there" even
// though the collision boundary was working: nothing marked where it was,
// so hitting it read as an invisible, arbitrary line rather than a curb.
// Low metalness/high roughness on purpose -- a shiny rail throws sharp
// specular glints as each post passes the camera, which bloom turns into a
// rapid strobe effect while driving; matte reads as metal at night fine
// without the flashing (same reasoning as the original procedural road's
// guardrail, ported here per-edge instead of per-ring).
export function buildGuardrails(network, roadGroup, theme = 'us101') {
  const pal = THEME_PALETTES[theme];
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a7fb0, metalness: .2, roughness: .75 });
  const curbMats = [
    new THREE.MeshStandardMaterial({ color: pal.curbA, emissive: pal.curbA, emissiveIntensity: pal.curbEmissive }),
    new THREE.MeshStandardMaterial({ color: pal.curbB, emissive: pal.curbB, emissiveIntensity: pal.curbEmissive })
  ];
  const railGeo = new THREE.BoxGeometry(.4, .5, 5.3), postGeo = new THREE.BoxGeometry(.4, 1.3, .4);
  const curbGeo = new THREE.BoxGeometry(2, .3, 3);
  const stride = 12; // meters between rail segments/posts
  const skip = 0.06; // fraction of each edge's length left bare at both ends, so rails don't poke into split/merge tile geometry
  let rails = 0, curbs = 0;
  for (const edge of network.edges.values()) {
    const lo = edge.length * skip, hi = edge.length * (1 - skip), span = Math.max(1, hi - lo);
    const curbCount = Math.max(2, Math.round(span / (stride * .55)));
    const railCount = Math.max(2, Math.round(span / stride));
    for (let i = 0; i <= curbCount; i++) {
      const arc = lo + (i / curbCount) * span;
      const idx = Math.max(0, Math.min(edge.sampleCount, Math.round((arc / (edge.length || 1)) * edge.sampleCount)));
      const s = edge.samples[idx], yaw = Math.atan2(s.t.x, s.t.z);
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(curbGeo, curbMats[side < 0 ? 0 : 1]);
        m.position.set(s.p.x + s.side.x * edge.halfWidth * side, .15, s.p.z + s.side.z * edge.halfWidth * side);
        m.rotation.y = yaw; m.receiveShadow = true;
        roadGroup.add(m); curbs++;
      }
    }
    for (let i = 0; i <= railCount; i++) {
      const arc = lo + (i / railCount) * span;
      const idx = Math.max(0, Math.min(edge.sampleCount, Math.round((arc / (edge.length || 1)) * edge.sampleCount)));
      const s = edge.samples[idx], yaw = Math.atan2(s.t.x, s.t.z);
      for (const side of [-1, 1]) {
        const off = edge.halfWidth + .6;
        const r = new THREE.Mesh(railGeo, railMat);
        r.position.set(s.p.x + s.side.x * off * side, .95, s.p.z + s.side.z * off * side);
        r.rotation.y = yaw; r.castShadow = true;
        roadGroup.add(r); rails++;
        if (i % 2 === 0) {
          const post = new THREE.Mesh(postGeo, railMat);
          post.position.set(r.position.x, .5, r.position.z);
          roadGroup.add(post);
        }
      }
    }
  }
  console.log(`[TileRoadBuilder] guardrails: ${rails} rails, ${curbs} curbs`);
  return { rails, curbs };
}

const PROP_STRIDE = 19; // meters between prop placements along an edge
const PROP_SKIP_ENDS = 0.08; // fraction of an edge's length to leave clear near each node/junction

const TREE_NAMES = ['Tree3', 'Tree4', 'tree_1_a'];
const LAMP_NAMES = ['lamp_1', 'lamp_2'];
const BARRIER_NAMES = ['road_barier_2a', 'road_barier_2b', 'road_barrier_1'];

function placeProp(name, propAssets, pos, facingDeg, group) {
  const asset = propAssets.get(name);
  if (!asset) return;
  const mesh = asset.clone(true);
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.rotation.y = facingDeg * Math.PI / 180;
  group.add(mesh);
}

// Walks every edge's samples at a fixed stride, alternating a tree/lamp on
// one shoulder with a barrier on the other, skipping the fraction of each
// edge nearest its endpoints so junctions stay uncluttered.
export function scatterProps(network, propAssets, group, seededRand = Math.random) {
  let i = 0;
  for (const edge of network.edges.values()) {
    const clearArc = edge.length * PROP_SKIP_ENDS;
    for (let arc = clearArc; arc < edge.length - clearArc; arc += PROP_STRIDE) {
      const idx = Math.max(0, Math.min(edge.sampleCount, Math.round((arc / (edge.length || 1)) * edge.sampleCount)));
      const s = edge.samples[idx];
      const facingDeg = Math.atan2(s.t.x, s.t.z) * 180 / Math.PI;
      const off = edge.halfWidth + 3 + seededRand() * 2;

      const leftPos = { x: s.p.x - s.side.x * off, y: s.p.y, z: s.p.z - s.side.z * off };
      const rightPos = { x: s.p.x + s.side.x * off, y: s.p.y, z: s.p.z + s.side.z * off };

      if (i % 2 === 0) {
        placeProp(TREE_NAMES[i % TREE_NAMES.length], propAssets, leftPos, facingDeg, group);
        if (i % 4 === 0) placeProp(LAMP_NAMES[(i / 4) % LAMP_NAMES.length], propAssets, rightPos, facingDeg + 180, group);
      } else {
        placeProp(BARRIER_NAMES[i % BARRIER_NAMES.length], propAssets, rightPos, facingDeg, group);
      }
      i++;
    }
  }
  console.log(`[TileRoadBuilder] scattered ${i} props`);
  return i;
}
