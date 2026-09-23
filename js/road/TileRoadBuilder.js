import * as THREE from 'three';

// Places a plain clone (road tiles carry no paint-slot materials, so no
// tinting like CarVisual's cloneTint) per network.tilePlacements entry.
// anchor/deg come straight out of RoadNetwork's resolvePlacement -- the
// same rot2(x,z,deg) convention IS Three.js's own Y-axis rotation matrix
// (x'=x*cos+z*sin, z'=-x*sin+z*cos), so position+rotation.y here places the
// mesh exactly where the sample/socket math assumed it would be.
export function buildTileRoad(network, catalog, tileAssets, roadGroup) {
  let placed = 0, missing = 0;
  for (const { typeId, anchor, deg } of network.tilePlacements) {
    const def = catalog[typeId];
    const asset = tileAssets.get(def.file);
    if (!asset) { missing++; console.warn(`[TileRoadBuilder] missing tile asset "${def.file}" for type "${typeId}"`); continue; }
    const mesh = asset.clone(true);
    mesh.position.set(anchor[0], 0, anchor[1]);
    mesh.rotation.y = deg * Math.PI / 180;
    roadGroup.add(mesh);
    placed++;
  }
  console.log(`[TileRoadBuilder] placed ${placed} tiles${missing ? `, ${missing} missing` : ''}`);
  return { placed, missing };
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
