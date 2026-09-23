// Grid-to-world placement data for the modular road kit. Every tile's local
// origin is defined at the CENTER of its "near" (entry) cell -- this is a
// derived convention, not documented anywhere by the kit itself (no README/
// LICENSE exists in the pack). VERIFIED empirically in-browser (a small test
// harness chaining straight->straight, straight->curve90, straight->ySplit)
// with zero corrections needed: all three connect gap-free. Placing a tile
// "at grid cell (col,row)" means its local (0,0,0) maps to world
// (col*CELL_SIZE + CELL_SIZE/2, row*CELL_SIZE + CELL_SIZE/2) -- this one
// rule works uniformly for 1x1 and 2x2 tiles alike, since every tile's near
// cell is exactly CELL_SIZE square centered on its own local origin.
//
// Socket convention: `dir` is the FORWARD TRAVEL direction at that socket
// (the direction you're heading as you cross it), same sense for `in` and
// `out` -- NOT an outward-facing normal. For a straight tile this means
// in.dir === out.dir (no direction change); for a turn they differ.
//
// TILE_SCALE: the raw .glb tiles are modeled at a 12-unit cell, giving a
// 12-unit-wide paved road -- too narrow for the "wider track" the game
// wants. Rather than non-uniformly stretching tile meshes (which would
// distort the curve tiles' circular arcs, breaking the closed-form sample
// math below), every socket/cell/arc coordinate is scaled up by this factor
// UNIFORMLY, and TileRoadBuilder applies the same factor as a uniform mesh
// scale -- geometry and visuals stay consistent, curves stay circular (just
// bigger-radius, which also makes them easier to hold a drift through at
// speed instead of demanding a near-stop for a tight radius-18 turn).
export const TILE_SCALE = 2;
export const CELL_SIZE = 12 * TILE_SCALE;

export const TILE_CATALOG = {
  straight: {
    file: 'Road1', cells: { x: 1, z: 1 },
    sockets: {
      in: { local: [0, -6 * TILE_SCALE], dir: [0, 1] },
      out: [{ local: [0, 6 * TILE_SCALE], dir: [0, 1] }]
    }
  },
  // The only clean, symmetric quarter-turn in the pack (Curve1/2 are
  // irregular, Curve4 is a large 4x4 stretch-goal). Bbox X:[-6,18] Z:[-6,18]
  // (pre-scale) -- consistent with a near cell centered at local origin
  // (0,0) and a far cell centered at local (12,12), i.e. a "north-in,
  // east-out" right turn: enters heading +Z on the near cell's south edge,
  // sweeps through the diagonal quadrant, exits heading +X on the far
  // cell's east edge. VERIFIED empirically: chained after 2 straights, the
  // curve continues with zero gap/overlap at rotation 0.
  curve90: {
    file: 'Road1_Curve3', cells: { x: 2, z: 2 },
    sockets: {
      in: { local: [0, -6 * TILE_SCALE], dir: [0, 1] },
      out: [{ local: [18 * TILE_SCALE, 12 * TILE_SCALE], dir: [1, 0] }]
    },
    // Closed-form arc description used by RoadEdge sample generation --
    // center of curvature + radius + start/sweep angle. Derived so the
    // radius is perpendicular to the tangent at BOTH sockets: the only
    // circle consistent with in=(0,-6) tangent (0,1) and out=(18,12)
    // tangent (1,0) is centered at (18,-6) with radius 18 (pre-scale;
    // checked: distance from that center to both socket points is exactly
    // 18), scaled by TILE_SCALE like everything else here.
    arc: { center: [18 * TILE_SCALE, -6 * TILE_SCALE], radius: 18 * TILE_SCALE, startAngleDeg: 180, sweepDeg: -90 }
  },
  // Mirror image of curve90 (same mesh, `mirror:true` tells TileRoadBuilder
  // to flip it with a negative-X scale) -- a LEFT-handed turn where curve90
  // is right-handed, needed for real S-curves/chicanes instead of a track
  // that only ever turns one way. Derived by mirroring curve90's geometry
  // across its own local Z axis (negate every X coordinate): a socket
  // position's X negates, a socket direction's X negates, and the arc's
  // center X negates with its radius unchanged. The sweep itself reverses
  // orientation under an X-mirror -- solving (cosθ,sinθ) -> (-cosθ,sinθ) for
  // θ(t)=startAngleDeg+sweepDeg*t gives mirroredθ(t) = (180-startAngleDeg) +
  // (-sweepDeg)*t, i.e. startAngleDeg'=180-180=0, sweepDeg'=-(-90)=90.
  // Verified algebraically against both mirrored socket points (both land
  // exactly on the circle at t=0 and t=1).
  curve90L: {
    file: 'Road1_Curve3', mirror: true, cells: { x: 2, z: 2 },
    sockets: {
      in: { local: [0, -6 * TILE_SCALE], dir: [0, 1] },
      out: [{ local: [-18 * TILE_SCALE, 12 * TILE_SCALE], dir: [-1, 0] }]
    },
    arc: { center: [-18 * TILE_SCALE, -6 * TILE_SCALE], radius: 18 * TILE_SCALE, startAngleDeg: 0, sweepDeg: 90 }
  },
  // Symmetric 3-way fork: one entry, opens to a far edge carrying two
  // diverging lanes side by side. VERIFIED empirically: a lead-in straight
  // connects flush into its entry at rotation 0.
  ySplit: {
    file: 'Road11_Y_Splitter', cells: { x: 2, z: 2 },
    sockets: {
      in: { local: [0, -6 * TILE_SCALE], dir: [0, 1] },
      out: [
        { local: [-6 * TILE_SCALE, 18 * TILE_SCALE], dir: [0, 1] }, // left branch
        { local: [6 * TILE_SCALE, 18 * TILE_SCALE], dir: [0, 1] }   // right branch
      ]
    }
  },
  // The SAME mesh/file as ySplit, used in reverse for the merge -- a
  // T-junction (Road2_T) would be the wrong shape for two lanes converging
  // to one; this splitter is already symmetric, and reversing/mirroring a
  // tile is a technique this kit's own Diagonal_Splitter_L/R pair already
  // uses. Two inputs (were ySplit's two outputs, direction negated since
  // flow now enters through them) merge into one output (was ySplit's
  // input, direction negated since flow now exits through it).
  yMerge: {
    file: 'Road11_Y_Splitter', cells: { x: 2, z: 2 },
    sockets: {
      in: [
        { local: [-6 * TILE_SCALE, 18 * TILE_SCALE], dir: [0, -1] },
        { local: [6 * TILE_SCALE, 18 * TILE_SCALE], dir: [0, -1] }
      ],
      out: [{ local: [0, -6 * TILE_SCALE], dir: [0, -1] }]
    }
  }
};
