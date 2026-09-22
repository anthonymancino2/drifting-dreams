import * as THREE from 'three';

// Tire smoke puffs and skid marks -- ported from index.html:635-670. Both
// are drift-only visuals that were removed along with the mechanic in the
// phase-1 trim; brought back now that the handbrake slide is back. Fixed-
// size pools reused round-robin/first-free so sustained drifting never
// grows the draw count.

function makeSmokeMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,.85)');
  grad.addColorStop(.4, 'rgba(235,238,240,.5)');
  grad.addColorStop(1, 'rgba(235,238,240,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .42, depthWrite: false });
}

export class SmokeSystem {
  constructor(scene) {
    this.scene = scene;
    this.baseMat = makeSmokeMaterial();
    this.pool = [];
  }
  puff(pos, scale = 1) {
    let s = this.pool.find(x => !x.visible);
    if (!s) { s = new THREE.Sprite(this.baseMat.clone()); this.scene.add(s); this.pool.push(s); }
    s.visible = true;
    s.position.copy(pos); s.position.y += .25;
    s.userData.rot = (Math.random() - .5) * 1.4;
    s.material.rotation = s.userData.rot;
    s.scale.setScalar(scale * 1.3);
    s.userData.life = 1;
    s.material.opacity = .5;
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      s.userData.life -= dt * .72;
      s.position.y += dt * .9;
      s.userData.rot += dt * .6;
      s.material.rotation = s.userData.rot;
      s.scale.addScalar(dt * 1.7);
      s.material.opacity = Math.max(0, s.userData.life * .45);
      if (s.userData.life <= 0) s.visible = false;
    }
  }
}

function makeSkidTexture() {
  const c = document.createElement('canvas'); c.width = 24; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 24, 0);
  g.addColorStop(0, 'rgba(12,10,14,0)'); g.addColorStop(.35, 'rgba(12,10,14,1)');
  g.addColorStop(.65, 'rgba(12,10,14,1)'); g.addColorStop(1, 'rgba(12,10,14,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 24, 64);
  return new THREE.CanvasTexture(c);
}

const SKID_CAP = 160;

export class SkidMarkSystem {
  constructor(scene) {
    const tex = makeSkidTexture();
    const geo = new THREE.PlaneGeometry(.34, 1.15); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.marks = [];
    for (let i = 0; i < SKID_CAP; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false; m.userData.life = 0;
      scene.add(m);
      this.marks.push(m);
    }
    this.cursor = 0;
  }
  drop(pos, heading, strength) {
    const m = this.marks[this.cursor];
    this.cursor = (this.cursor + 1) % SKID_CAP;
    m.position.set(pos.x, pos.y + .025, pos.z);
    m.rotation.y = heading;
    m.visible = true;
    m.userData.life = 1;
    m.userData.baseOpacity = Math.min(.85, .35 + strength * .5);
    m.material.opacity = m.userData.baseOpacity;
  }
  update(dt) {
    for (const m of this.marks) {
      if (!m.visible) continue;
      m.userData.life -= dt * .09;
      if (m.userData.life <= 0) { m.visible = false; continue; }
      m.material.opacity = m.userData.baseOpacity * Math.min(1, m.userData.life * 2);
    }
  }
}
