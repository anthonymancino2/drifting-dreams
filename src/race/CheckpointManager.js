// Divides the track's total arc length into N equal checkpoint segments and reports
// which segment a given arc-length position falls in. Kept separate from LapManager
// so RaceManager can later show "checkpoint 4/8" progress independent of lap counting.
export default class CheckpointManager {
    constructor(trackManager) {
        this.trackManager = trackManager;
        this.numSegments = trackManager.getCheckpointCount();
    }

    getSegmentForArcLength(arcLength) {
        return this.trackManager.getCheckpointSegmentForArcLength(arcLength);
    }

    getSegmentCount() {
        return this.numSegments;
    }
}
