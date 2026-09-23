// A junction point in the road graph. `incomingEdges`/`outgoingEdges` are
// ordered LEFT-TO-RIGHT by local socket X -- this ordering is what makes
// lane-based branch selection trivial with no special-casing:
// outgoingEdges[laneIndex < laneCount/2 ? 0 : 1] picks the branch a car in
// that lane takes, for a simple 2-way split.
export class RoadNode {
  constructor(id, position) {
    this.id = id;
    this.position = position;
    this.incomingEdges = []; // [edgeId]
    this.outgoingEdges = []; // [edgeId]
  }

  chooseOutgoingEdge(laneIndex, laneCount) {
    if (this.outgoingEdges.length <= 1) return this.outgoingEdges[0];
    return this.outgoingEdges[laneIndex < laneCount / 2 ? 0 : 1];
  }

  chooseWeightedOutgoingEdge(rand, weights) {
    if (this.outgoingEdges.length <= 1) return this.outgoingEdges[0];
    const roll = rand();
    let acc = 0;
    for (let i = 0; i < this.outgoingEdges.length; i++) {
      acc += weights[i] ?? (1 / this.outgoingEdges.length);
      if (roll < acc) return this.outgoingEdges[i];
    }
    return this.outgoingEdges[this.outgoingEdges.length - 1];
  }
}
