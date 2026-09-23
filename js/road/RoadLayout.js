// The oval-with-one-diamond layout, authored as a relative "turtle walk"
// (RoadNetwork.build interprets this against TileCatalog), not absolute
// grid coordinates -- far less error-prone than hand-computing every
// tile's world position.
//
// Closure check (hand-verified, not just hopeful): a curve90/curve90L's
// world displacement is rot2((36,36) or (-36,36), entryHeadingDeg) at the
// current TILE_SCALE=2 (36 = 18*TILE_SCALE). Entering the 4 OUTER corners
// (all curve90, same handedness) at headings 0/90/180/270 in turn, those
// four displacements sum to exactly zero regardless of everything else in
// between -- the loop closes as long as opposite outer sides carry equal
// total forward-extent.
//
// "Chicane" building blocks add real direction changes for drifting
// (a plain rectangle only ever turns one way) WITHOUT breaking that
// closure math: a matched pair of opposite-handed 90s (e.g. R then L)
// returns heading to exactly what it was before the pair (net rotation
// zero) and contributes a FIXED displacement of (+-72, 72) relative to its
// own entry heading -- forward 72, lateral +-72. Following one such pair
// with the MIRROR pair (L then R, or R then L, whichever is opposite)
// cancels the lateral component exactly (+72 + -72 = 0) while the forward
// components add (72+72=144), so a 4-turn chicane behaves EXACTLY like 144
// extra units of straight for every closure calculation, contributing zero
// net sideways drift to the overall shape. This is what makes it safe to
// drop these anywhere along a straight without re-deriving the whole
// rectangle's balance.
const CHICANE_A = [{ cmd: 'curve90' }, { cmd: 'curve90L' }, { cmd: 'curve90L' }, { cmd: 'curve90' }]; // R,L,L,R
const CHICANE_B = [{ cmd: 'curve90L' }, { cmd: 'curve90' }, { cmd: 'curve90' }, { cmd: 'curve90L' }]; // L,R,R,L (mirror, same net-zero-lateral property)

// Forward-extent bookkeeping (all at TILE_SCALE=2): one straight tile = 24;
// one chicane (4 turns) = 144; the whole diamond (split 48 + a branch's own
// 48 + merge 48) = 144. Opposite outer sides must match:
//   LEFT  = 4*24 + 144(chicane) + 4*24            = 336
//   RIGHT = 4*24 + 144(chicane) + 4*24            = 336  (matches LEFT)
//   TOP   = 2*24 + 144(diamond) + 2*24 + 144(chicane) + 3*24 = 456
//   BOTTOM= 7*24 + 144(chicane) + 6*24            = 456  (matches TOP)
export const ROAD_LAYOUT = [
  // LEFT side
  { cmd: 'straight', count: 4 },
  ...CHICANE_A,
  { cmd: 'straight', count: 4 },
  { cmd: 'curve90', count: 1 },   // outer corner 1

  // TOP side (the diamond side)
  { cmd: 'straight', count: 2 },  // lead-in
  {
    cmd: 'split',
    branches: [
      {
        name: 'shortcut', // shorter, heavier traffic -- physically left
        program: [{ cmd: 'straight', count: 2 }]
      },
      {
        name: 'bypass', // longer, lighter traffic -- physically right; a single full loop for free extra distance
        program: [
          { cmd: 'straight', count: 1 },
          { cmd: 'curve90', count: 4 },
          { cmd: 'straight', count: 1 }
        ]
      }
    ]
  },
  { cmd: 'merge' },
  { cmd: 'straight', count: 2 },  // lead-out
  ...CHICANE_A,
  { cmd: 'straight', count: 3 },
  { cmd: 'curve90', count: 1 },   // outer corner 2

  // RIGHT side
  { cmd: 'straight', count: 4 },
  ...CHICANE_B,
  { cmd: 'straight', count: 4 },
  { cmd: 'curve90', count: 1 },   // outer corner 3

  // BOTTOM side
  { cmd: 'straight', count: 7 },
  ...CHICANE_A,
  { cmd: 'straight', count: 6 },
  { cmd: 'curve90', count: 1 }    // outer corner 4 -- closes the loop
];
