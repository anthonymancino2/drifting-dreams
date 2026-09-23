// The concrete oval-with-one-diamond layout, authored as a relative
// "turtle walk" (RoadNetwork.build interprets this against TileCatalog),
// not absolute grid coordinates -- far less error-prone than hand-computing
// every tile's world position.
//
// Closure check (hand-verified, not just hopeful): a curve90's world
// displacement is rot2((18,18), entryHeadingDeg) -- entering the 4 corners
// at headings 0/90/180/270 in turn, those four displacements sum to exactly
// zero regardless of straight-segment lengths. So the loop closes as long
// as opposite sides carry equal forward-extent: left (3 straights = 36)
// balances right (3 straights = 36); the top side's total forward extent
// (lead-in 12 + split 24 + either branch's net 24 + merge 24 + lead-out 12
// = 96, i.e. 8 straight-tile-lengths) balances the bottom's 8 straights
// (96). Both branches were sized to contribute the same net-24 forward
// extent so they reconverge at the merge with matching anchors (see
// RoadNetwork.js's merge-handling comment) regardless of which one a car
// takes.
//
// Branch order is [left, right] physical sockets of ySplit, matching
// RoadNode's left-half-lane/right-half-lane convention (lanes 0-1 take
// branches[0], lanes 2-3 take branches[1]).
//
// The loop MUST be branches[1] (physically right), not branches[0]: a
// curve90 always turns the same fixed way (entering heading (0,1), its
// displacement is (+18,+18) -- it bulges toward +local-x). Hosting the
// 4-curve loop on the LEFT branch made it bulge back over and swallow the
// plain straight branch on the right (confirmed visually in
// test-network.html -- the loop's circle fully enclosed the other lane).
// Hosting it on the RIGHT branch instead makes it bulge further right,
// away from the other lane, with clean separation. Verified gap-free and
// non-overlapping in test-network.html after this swap.
export const ROAD_LAYOUT = [
  { cmd: 'straight', count: 3 },   // left side
  { cmd: 'curve90', count: 1 },    // corner 1

  { cmd: 'straight', count: 1 },   // top side: lead-in
  {
    cmd: 'split',
    branches: [
      {
        name: 'shortcut', // shorter, heavier traffic -- physically left
        program: [
          { cmd: 'straight', count: 2 }
        ]
      },
      {
        name: 'bypass', // longer, lighter traffic -- physically right; see the loop-direction note above
        program: [
          { cmd: 'straight', count: 1 },
          { cmd: 'curve90', count: 4 },
          { cmd: 'straight', count: 1 }
        ]
      }
    ]
  },
  { cmd: 'merge' },
  { cmd: 'straight', count: 1 },   // top side: lead-out
  { cmd: 'curve90', count: 1 },    // corner 2

  { cmd: 'straight', count: 3 },   // right side
  { cmd: 'curve90', count: 1 },    // corner 3

  { cmd: 'straight', count: 8 },   // bottom side
  { cmd: 'curve90', count: 1 }     // corner 4 -- closes the loop
];
