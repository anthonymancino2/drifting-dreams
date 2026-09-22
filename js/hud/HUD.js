import { clamp } from '../core/MathUtils.js';

const GAUGE_MAX_MPH = 250, GAUGE_START = .75 * Math.PI, GAUGE_SWEEP = 1.5 * Math.PI;

export function mpsToMph(ms) { return ms * 2.23694; }
export function formatTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000);
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}

// DOM id map + per-frame update, port of updateHUD/drawSpeedGauge/drawMap
// (index.html:1062-1090). Circuit-specific fields (lap counter, AI-racer
// position ranking, drift score/state pill) are gone; new freeway fields
// (speed limit, bad-rep counter, next-checkpoint countdown) follow the same
// `.pill` DOM pattern the old HUD chips used.
export class HUD {
  constructor($) {
    this.$ = $;
    this.gaugeCanvas = $('speedGauge');
    this.gctx = this.gaugeCanvas.getContext('2d');
    this.mapCanvas = $('map');
    this.mctx = this.mapCanvas.getContext('2d');
    this._resizeGauge();
    addEventListener('resize', () => this._resizeGauge());
    this._laneLines = null;
    this._checkpointPts = null;
    this._bounds = null;
  }

  _resizeGauge() {
    const s = Math.round(this.gaugeCanvas.clientWidth * Math.min(devicePixelRatio, 2));
    if (s > 0 && this.gaugeCanvas.width !== s) { this.gaugeCanvas.width = s; this.gaugeCanvas.height = s; }
  }

  // Precomputes the minimap's lane-boundary polylines and checkpoint tick
  // positions once per world build (ring never changes mid-race in phase 1).
  buildMinimap(ring, checkpoints, sampleCount = 130) {
    const boundaryCount = ring.cfg.laneCount + 1;
    this._laneLines = Array.from({ length: boundaryCount }, (_, b) => {
      const offset = -((ring.cfg.laneCount * ring.cfg.laneWidth) / 2) + b * ring.cfg.laneWidth;
      return Array.from({ length: sampleCount }, (_, i) => ring.pointAtArc((i / sampleCount) * ring.length, offset).clone());
    });
    this._checkpointPts = checkpoints.map(cp => ring.pointAtArc(cp.arc, 0).clone());
    const outer = [...this._laneLines[0], ...this._laneLines[boundaryCount - 1]];
    this._bounds = {
      minX: Math.min(...outer.map(p => p.x)), maxX: Math.max(...outer.map(p => p.x)),
      minZ: Math.min(...outer.map(p => p.z)), maxZ: Math.max(...outer.map(p => p.z))
    };
  }

  _drawSpeedGauge(mph, boosting) {
    this._resizeGauge();
    const gctx = this.gctx, w = this.gaugeCanvas.width;
    if (!w) return;
    const cx = w / 2, cy = w / 2, r = w * .4;
    gctx.clearRect(0, 0, w, w);
    const frac = clamp(mph / GAUGE_MAX_MPH, 0, 1);
    gctx.lineCap = 'round';
    gctx.lineWidth = w * .045; gctx.strokeStyle = 'rgba(150,220,230,.16)';
    gctx.beginPath(); gctx.arc(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP); gctx.stroke();
    gctx.lineWidth = w * .012; gctx.strokeStyle = 'rgba(200,235,240,.5)';
    for (let i = 0; i <= 9; i++) {
      const a = GAUGE_START + GAUGE_SWEEP * (i / 9), r1 = r - w * .055, r2 = r + w * .02;
      gctx.beginPath(); gctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); gctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); gctx.stroke();
    }
    if (frac > .002) {
      const grad = gctx.createLinearGradient(cx - r, cy, cx + r, cy);
      grad.addColorStop(0, '#24f5ef'); grad.addColorStop(.6, '#ffd31d'); grad.addColorStop(1, '#ff4d4d');
      gctx.lineWidth = w * .045; gctx.strokeStyle = grad;
      gctx.shadowColor = boosting ? '#ff8a00' : '#24f5ef'; gctx.shadowBlur = w * .08;
      gctx.beginPath(); gctx.arc(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP * frac); gctx.stroke();
      gctx.shadowBlur = 0;
    }
    const na = GAUGE_START + GAUGE_SWEEP * frac;
    gctx.strokeStyle = boosting ? '#ff8a00' : '#fff'; gctx.lineWidth = w * .018;
    gctx.beginPath(); gctx.moveTo(cx, cy); gctx.lineTo(cx + Math.cos(na) * r * .78, cy + Math.sin(na) * r * .78); gctx.stroke();
    gctx.fillStyle = boosting ? '#ff8a00' : '#fff'; gctx.beginPath(); gctx.arc(cx, cy, w * .028, 0, 7); gctx.fill();
  }

  _drawMap(trafficCars, player) {
    if (!this._laneLines) return;
    const ctx = this.mctx, w = this.mapCanvas.width, h = this.mapCanvas.height, pad = 28;
    const { minX, maxX, minZ, maxZ } = this._bounds;
    const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
    const xy = p => [w / 2 + (p.x - (minX + maxX) / 2) * s, h / 2 + (p.z - (minZ + maxZ) / 2) * s];
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    this._laneLines.forEach((line, i) => {
      const isEdge = i === 0 || i === this._laneLines.length - 1;
      ctx.strokeStyle = isEdge ? 'rgba(210,240,242,.9)' : 'rgba(210,240,242,.35)';
      ctx.lineWidth = isEdge ? 5 : 1.5;
      ctx.beginPath();
      line.forEach((p, j) => { const [x, y] = xy(p); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    });

    ctx.fillStyle = '#ffd31d';
    for (const p of this._checkpointPts) { const [x, y] = xy(p); ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }

    ctx.fillStyle = 'rgba(200,210,220,.55)';
    for (const car of trafficCars) { const [x, y] = xy(car.position); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }

    ctx.fillStyle = '#ffd31d';
    const [px, py] = xy(player.position); ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
  }

  update(state) {
    const { $ } = this;
    const mph = Math.round(mpsToMph(Math.abs(state.player.speed)));
    const gear = mph < 2 ? 'N' : Math.min(6, Math.max(1, Math.ceil(mph / 27)));
    $('speed').textContent = mph;
    $('gear').textContent = gear;
    $('time').textContent = formatTime(state.raceTime);
    $('score').textContent = state.score;
    $('badRep').textContent = state.badRep;
    $('speedLimit').textContent = Math.round(state.speedLimitMph);
    $('nitroFill').style.height = (state.player.nitro * 94) + '%';
    $('checkpointTime').textContent = state.checkpointSecRemaining.toFixed(1) + 's';

    if (state.checkpointEvent) {
      const scoreEl = $('score');
      scoreEl.classList.remove('flash-bonus', 'flash-miss');
      void scoreEl.offsetWidth; // restart the CSS animation
      scoreEl.classList.add(state.checkpointEvent === 'bonus' ? 'flash-bonus' : 'flash-miss');
    }

    if (state.closeCall) {
      const scoreEl = $('score');
      scoreEl.classList.remove('flash-bonus');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('flash-bonus');
      const banner = $('closeCallBanner');
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
    }

    this._drawSpeedGauge(mph, state.boosting);
    this._drawMap(state.trafficCars, state.player);
  }
}
