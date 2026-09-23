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

export const CELL_SIZE = 12;

export const TILE_CATALOG = {
  straight: {
    file: 'Road1', cells: { x: 1, z: 1 },
    sockets: {
      in: { local: [0, -6], dir: [0, 1] },
      out: [{ local: [0, 6], dir: [0, 1] }]
    }
  },
  // The only clean, symmetric quarter-turn in the pack (Curve1/2 are
  // irregular, Curve4 is a large 4x4 stretch-goal). Bbox X:[-6,18] Z:[-6,18]
  // -- consistent with a near cell centered at local origin (0,0) and a far
  // cell centered at local (12,12), i.e. a "north-in, east-out" right turn:
  // enters heading +Z on the near cell's south edge, sweeps through the
  // diagonal quadrant, exits heading +X on the far cell's east edge.
  // VERIFIED empirically: chained after 2 straights, the curve continues
  // with zero gap/overlap at rotation 0.
  curve90: {
    file: 'Road1_Curve3', cells: { x: 2, z: 2 },
    sockets: {
      in: { local: [0, -6], dir: [0, 1] },
      out: [{ local: [18, 12], dir: [1, 0] }]
    },
    // Closed-form arc description used by RoadEdge sample generation --
    // center of curvature + radius + start/sweep angle. Derived so the
    // radius is perpendicular to the tangent at BOTH sockets: the only
    // circle consistent with in=(0,-6) tangent (0,1) and out=(18,12)
    // tangent (1,0) is centered at (18,-6) with radius 18 (checked: distance
    // from that center to both socket points is exactly 18).
    arc: { center: [18, -6], radius: 18, startAngleDeg: 180, sweepDeg: -90 }
  },
  // Symmetric 3-way fork: one 12-wide entry, opens to a 24-wide far edge
  // carrying two diverging lanes side by side. VERIFIED empirically: a
  // lead-in straight connects flush into its entry at rotation 0.
  ySplit: {
    file: 'Road11_Y_Splitter', cells: { x: 2, z: 2 },
    sockets: {
      in: { local: [0, -6], dir: [0, 1] },
      out: [
        { local: [-6, 18], dir: [0, 1] }, // left branch
        { local: [6, 18], dir: [0, 1] }   // right branch
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
        { local: [-6, 18], dir: [0, -1] },
        { local: [6, 18], dir: [0, -1] }
      ],
      out: [{ local: [0, -6], dir: [0, -1] }]
    }
  }
};
