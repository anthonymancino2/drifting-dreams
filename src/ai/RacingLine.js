import { shortestAngleDelta } from '../utils/MathUtils.js';

// Thin query layer over TrackManager's centerline so AIRacer never has to know about
// samples/arcLengths/binary search directly. The centerline itself IS the racing line
// for phase 1 AI; per-bot lateral offsets (see AIRacer personalities) fan cars out
// across the road width instead of stacking them on a single line.
export default class RacingLine {
    constructor(trackManager) {
        this.track = trackManager;
    }

    getPathInfo(position) {
        return this.track.getPathInfo(position);
    }

    getPoint(arcLength, lateralOffset = 0) {
        return this.track.getPointAtArcLength(arcLength, lateralOffset);
    }

    // Net heading change between `arcLength` and `arcLength + aheadDistance`, in
    // radians. Larger magnitude = sharper upcoming corner; used to throttle down /
    // trigger AI drift ahead of turns instead of reacting to them.
    getCurvatureAhead(arcLength, aheadDistance) {
        const angleNow = this.track.getTangentAngleAtArcLength(arcLength);
        const angleAhead = this.track.getTangentAngleAtArcLength(arcLength + aheadDistance);
        return shortestAngleDelta(angleNow, angleAhead);
    }
}
