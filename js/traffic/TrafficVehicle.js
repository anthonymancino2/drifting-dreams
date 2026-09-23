import * as THREE from 'three';

// Per-car traffic state. Visual (root/model/wheels/groundLift) is built once
// via CarVisual.buildCarVisual and never rebuilt -- only physics fields
// change on recycle, so pooling costs zero new THREE objects after the
// initial pool is built.
export class TrafficVehicle {
  constructor(root, visual, assetIndex, statMods) {
    this.root = root;
    this.model = visual.model;
    this.wheels = visual.wheels;
    this.groundLift = visual.groundLift;
    this.sirenLights = visual.sirenLights;
    this.assetIndex = assetIndex;
    this.statMods = statMods;

    this.active = false;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.moveHeading = 0;
    this.steer = 0;
    this.speed = 0;
    this.cruiseSpeedMs = 0;
    this.rollVisual = 0;

    this.laneIndex = 0;
    this.targetLaneIndex = 0;
    this.laneBlendT = 1;

    this.edgeId = null;
    this.arc = 0;
    this.primaryArc = 0;
    // Set once, the first time the car comes within road.network.decisionWindow
    // of a split, by rolling road.network.branchWeights -- committing early
    // (rather than at the exact node) is what lets _leaderAndFollowerInLane
    // treat a car's chosen-but-not-yet-entered next edge as a real
    // continuation, avoiding the "leader already switched edges, follower
    // thinks the lane is empty" pop the plan called out.
    this._committedNextEdgeId = null;
    this._sampleHint = null;
    this._laneChangeCooldown = 0;
    this._hitCooldown = 0;
    this._closeCallCooldown = 0;
    this._lodFrameOffset = Math.floor(Math.random() * 4);
  }
}
