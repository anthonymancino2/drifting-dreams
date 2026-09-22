import { mphToMs } from '../vehicles/VehicleRegistry.js';

// Seed of the eventual full RaceManager (a later phase adds a real commute
// timer/ETA on top of this same module). Phase 1 needs a balanced points
// system, not just a penalty meter: checkpoints spaced around the ring award
// a bonus when reached within a time budget, offsetting the -1/+1 collision
// penalty so score isn't purely punitive.
export class RaceManager {
  constructor(ring, config) {
    this.ring = ring;
    this.cfg = config;
    this.checkpoints = this._buildCheckpoints();
    this.score = 0;
    this.badRep = 0;
    this._nextCheckpointIdx = 0;
    this._segmentTimer = 0;
    this.lastCheckpointEvent = null; // 'bonus' | 'missed' | null, cleared by the HUD after it reads it
  }

  _buildCheckpoints() {
    const { checkpointCount, targetPaceMph, checkpointGraceSec } = this.cfg.race;
    const segmentLen = this.ring.length / checkpointCount;
    const budgetSec = segmentLen / mphToMs(targetPaceMph) + checkpointGraceSec;
    return Array.from({ length: checkpointCount }, (_, i) => ({
      arc: (i / checkpointCount) * this.ring.length,
      budgetSec,
      cleared: false
    }));
  }

  get nextCheckpointArc() { return this.checkpoints[this._nextCheckpointIdx].arc; }
  get segmentTimeRemaining() {
    const cp = this.checkpoints[this._nextCheckpointIdx];
    return Math.max(0, cp.budgetSec - this._segmentTimer);
  }

  update(dt, playerArc) {
    this._segmentTimer += dt;
    const cp = this.checkpoints[this._nextCheckpointIdx];
    // Crossed once the player's arc has advanced to (or past) the checkpoint's
    // arc, measured the short way around the wrap -- mirrors the wrap-aware
    // forward-progress technique updateLapProgress used (index.html:313).
    const distanceToGo = this.ring.wrapArc(cp.arc - playerArc);
    const segmentLen = this.ring.length / this.checkpoints.length;
    if (!cp.cleared && distanceToGo < segmentLen * .02) {
      cp.cleared = true;
      if (this._segmentTimer <= cp.budgetSec) {
        this.score += this.cfg.race.checkpointBonus;
        this.lastCheckpointEvent = 'bonus';
      } else {
        this.lastCheckpointEvent = 'missed'; // no penalty -- just no bonus, never double-stacks with collision penalties
      }
      this._segmentTimer = 0;
      this._nextCheckpointIdx = (this._nextCheckpointIdx + 1) % this.checkpoints.length;
      if (this._nextCheckpointIdx === 0) this.checkpoints.forEach(c => { c.cleared = false; });
    }
  }

  registerTrafficHit() {
    this.score -= this.cfg.collision.trafficHitScorePenalty;
    this.badRep += this.cfg.collision.trafficHitBadRep;
    this.lastHitEvent = true;
  }

  consumeEvents() {
    const events = { checkpoint: this.lastCheckpointEvent, hit: this.lastHitEvent };
    this.lastCheckpointEvent = null;
    this.lastHitEvent = false;
    return events;
  }
}
