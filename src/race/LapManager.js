// Per-racer lap tracking. Requires checkpoint segments to be crossed strictly in order
// (0, 1, 2, ... N-1, 0) before a lap counts, so cutting across the infield can't grant
// free laps. One instance per racer.
export default class LapManager {
    constructor(checkpointManager, totalLaps = 3) {
        this.checkpointManager = checkpointManager;
        this.totalLaps = totalLaps;
        this.currentSegment = 0;
        this.nextExpectedSegment = 1;
        this.lap = 1;
        this.hasCrossedStart = false;
        this.finished = false;
        this.lapTimes = [];
        this._currentLapStart = 0;
    }

    update(arcLength, elapsedRaceTime) {
        if (this.finished) return;
        const numSegments = this.checkpointManager.getSegmentCount();
        this.currentSegment = this.checkpointManager.getSegmentForArcLength(arcLength);

        if (this.currentSegment === this.nextExpectedSegment) {
            this.nextExpectedSegment = (this.nextExpectedSegment + 1) % numSegments;
            if (this.nextExpectedSegment === 0) {
                this.nextExpectedSegment = 1;
                if (this.hasCrossedStart) {
                    this.lapTimes.push(elapsedRaceTime - this._currentLapStart);
                    this._currentLapStart = elapsedRaceTime;
                    this.lap += 1;
                    if (this.lap > this.totalLaps) {
                        this.lap = this.totalLaps;
                        this.finished = true;
                    }
                }
                this.hasCrossedStart = true;
            }
        }
    }

    getProgress01() {
        const numSegments = this.checkpointManager.getSegmentCount();
        return (this.currentSegment + 1) / numSegments;
    }

    getBestLapTime() {
        return this.lapTimes.length ? Math.min(...this.lapTimes) : null;
    }
}
