// Ranks racers by total race distance covered (completed laps * track length + current
// arc-length along the centerline), not raw world-space position - two cars side by
// side on a hairpin can be a full lap apart in actual progress. A finished racer's lap
// is clamped at totalLaps by LapManager, so it naturally floats to the top once nobody
// else can match its distance.
export default class PositionManager {
    constructor(trackManager) {
        this.trackManager = trackManager;
    }

    computeRanking(racers) {
        const scored = racers.map(racer => {
            const pathInfo = this.trackManager.getPathInfo(racer.state.position);
            const progress = racer.lapManager.lap * this.trackManager.totalLength + pathInfo.arcLength;
            return { racer, progress };
        });
        scored.sort((a, b) => b.progress - a.progress);
        scored.forEach(({ racer }, index) => { racer.racePosition = index + 1; });
        return scored.map(s => s.racer);
    }
}
