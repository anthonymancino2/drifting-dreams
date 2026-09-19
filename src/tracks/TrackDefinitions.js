// Data-driven track definitions. Adding the other 5+ track styles (Phase 5+) means
// adding more entries here - TrackManager builds geometry generically from this shape,
// it never hardcodes "circuit_01".
export const TrackDefinitions = {
    circuit_01: {
        id: 'circuit_01',
        name: 'Dream Valley Circuit',
        theme: 'fantasy_countryside',
        roadWidth: 15,
        shoulderWidth: 5,
        groundColor: 0x3f8f3a,
        shoulderColor: 0x8a6a3f,
        roadColor: 0x35383f,
        lineColor: 0xf2e37b,
        numCheckpoints: 8,
        // Closed-loop control points (x, z) in world units: large rounded-rectangle
        // circuit with a top S-chicane. Corner cut distances and chicane amplitude are
        // kept well above (roadWidth/2 + shoulderWidth) so the ribbon geometry can't
        // pinch or overlap itself, and every consecutive turn stays gentle enough that
        // the Catmull-Rom spline can't overshoot into a self-intersecting loop.
        controlPoints: [
            [0, 0], [80, 0], [160, 0], [220, 15], [255, 55],
            [260, 110], [255, 165], [220, 205], [160, 220], [110, 200],
            [85, 240], [55, 200], [10, 220], [-40, 205], [-70, 165],
            [-75, 110], [-70, 55], [-40, 15]
        ],
        startHeadingOffset: 0
    }
};

export function getTrackDefinition(id) {
    return TrackDefinitions[id] || TrackDefinitions.circuit_01;
}
