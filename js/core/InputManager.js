// Port of index.html:679-774's unified keyboard/gamepad/touch input system.
// `drift` re-added on request (handbrake slide/handling feel, not the old
// circuit racer's tiered mini-turbo/auto-boost reward system -- that stays
// gone, the checkpoint-bonus score is the only scoring now). The
// `KeyQ`/`KeyE` orbit-nudge keys and the canvas pointer-drag orbit handlers
// stay removed along with the dropped 360deg camera mode.
export const ACTIONS = [
  { id: 'left', label: 'Steer Left' },
  { id: 'right', label: 'Steer Right' },
  { id: 'gas', label: 'Accelerate' },
  { id: 'brake', label: 'Brake / Reverse' },
  { id: 'drift', label: 'Handbrake Drift' },
  { id: 'nitro', label: 'Nitro Boost' },
  { id: 'camera', label: 'Cycle Camera' },
  { id: 'pause', label: 'Pause' }
];
export const HELD_ACTIONS = ['left', 'right', 'gas', 'brake', 'drift', 'nitro'];
export const KEY_ALT = { left: ['ArrowLeft'], right: ['ArrowRight'], gas: ['ArrowUp'], brake: ['ArrowDown'] };
export const DEFAULT_KEYBINDS = { left: 'KeyA', right: 'KeyD', gas: 'KeyW', brake: 'KeyS', drift: 'Space', nitro: 'ShiftLeft', camera: 'KeyC', pause: 'Escape' };
export const DEFAULT_GPBINDS = {
  left: { t: 'axis', i: 0, d: -1 }, right: { t: 'axis', i: 0, d: 1 },
  gas: { t: 'button', i: 7 }, brake: { t: 'button', i: 6 },
  drift: { t: 'button', i: 0 }, nitro: { t: 'button', i: 1 }, camera: { t: 'button', i: 3 }, pause: { t: 'button', i: 9 }
};
const GP_BUTTON_NAMES = ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS'];
export const TOUCH_BTN_IDS = ['left', 'right', 'gas', 'brake', 'driftBtn', 'nitroBtn', 'camBtn'];
export const TOUCH_BTN_SIZE = { left: 74, right: 74, gas: 82, brake: 65, driftBtn: 68, nitroBtn: 60, camBtn: 60 };

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch (e) { return { ...fallback }; }
}

export function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', Escape: 'ESC', Enter: 'ENTER' })[code] || code;
}
export function gpLabel(bind) {
  if (!bind) return '-';
  if (bind.t === 'axis') return 'Stick ' + (bind.i === 0 ? 'X' : bind.i === 1 ? 'Y' : bind.i) + (bind.d < 0 ? ' -' : ' +');
  return GP_BUTTON_NAMES[bind.i] || ('Btn ' + bind.i);
}

export class InputManager {
  constructor($) {
    this.$ = $;
    this.KEYBINDS = loadJSON('dd_keybinds', DEFAULT_KEYBINDS);
    this.GPBINDS = loadJSON('dd_gpbinds', DEFAULT_GPBINDS);
    this.input = { left: false, right: false, gas: false, brake: false, nitro: false, steerAxis: null, throttleAxis: null, brakeAxis: null };
    this.keyHeld = {}; this.padHeld = {}; this.touchHeld = {};
    this.listeningFor = null;
    this.gpIndex = null;
    this.gpPrevPressed = {};
    this.layoutEditing = false;
    this.TOUCH_LAYOUT = loadJSON('dd_touchlayout', {});

    this.mode = 'attract';
    this.handlers = {};

    this._bindKeyboard();
    this._bindGamepadEvents();
    this._bindTouchButtons();
    this._bindTouchLayout();
  }

  setMode(mode) { this.mode = mode; }
  setHandlers(handlers) { this.handlers = handlers; }

  saveBinds() {
    try {
      localStorage.setItem('dd_keybinds', JSON.stringify(this.KEYBINDS));
      localStorage.setItem('dd_gpbinds', JSON.stringify(this.GPBINDS));
    } catch (e) { /* ignore */ }
  }

  resetBinds() {
    this.KEYBINDS = { ...DEFAULT_KEYBINDS };
    this.GPBINDS = JSON.parse(JSON.stringify(DEFAULT_GPBINDS));
    this.saveBinds();
  }

  keyToAction(code) {
    for (const a of ACTIONS) if (this.KEYBINDS[a.id] === code) return a.id;
    for (const k in KEY_ALT) if (KEY_ALT[k].includes(code)) return k;
    return null;
  }

  _bindKeyboard() {
    addEventListener('keydown', e => {
      if (this.listeningFor && this.listeningFor.kind === 'key') {
        if (e.code !== 'Escape') { this.KEYBINDS[this.listeningFor.action] = e.code; this.saveBinds(); }
        this.listeningFor = null;
        this.handlers.onRenderBindList?.();
        e.preventDefault();
        return;
      }
      if (this.listeningFor) return;
      if (this.mode === 'attract') { this.handlers.onAdvanceAttract?.(); return; }
      if (this.mode === 'vehicleSelect') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.handlers.onMenuNav?.(-1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.handlers.onMenuNav?.(1);
        else if (e.code === 'Enter' || e.code === 'Space') this.handlers.onMenuConfirm?.();
        return;
      }
      const action = this.keyToAction(e.code);
      if (action && HELD_ACTIONS.includes(action)) { this.keyHeld[action] = true; e.preventDefault(); }
      // e.repeat is true for the synthetic keydown events the OS fires while
      // a key is held (not a second real press) -- HELD_ACTIONS don't care
      // (keyHeld=true is idempotent either way), but camera-cycle and
      // pause are single-press TOGGLES: without this guard, holding Escape
      // even slightly too long fires several toggles from one press, which
      // is exactly how pause gets stuck -- an odd/even number of repeats
      // lands back on paused instead of the single toggle the player did.
      if (e.repeat) return;
      if (action === 'camera') this.handlers.onCameraCycle?.();
      if (action === 'pause') this.handlers.onPause?.();
    });
    addEventListener('keyup', e => {
      const action = this.keyToAction(e.code);
      if (action) this.keyHeld[action] = false;
    });
  }

  _bindGamepadEvents() {
    addEventListener('gamepadconnected', e => {
      this.gpIndex = e.gamepad.index;
      const el = this.$('gpStatus'); if (el) el.textContent = 'Connected: ' + e.gamepad.id;
    });
    addEventListener('gamepaddisconnected', e => {
      if (e.gamepad.index === this.gpIndex) {
        this.gpIndex = null;
        const el = this.$('gpStatus'); if (el) el.textContent = 'No controller detected';
      }
    });
  }

  _gpAxisOrButtonValue(gp, bind) {
    if (!bind) return 0;
    if (bind.t === 'button') { const b = gp.buttons[bind.i]; return b ? b.value : 0; }
    const v = gp.axes[bind.i] || 0;
    return bind.d < 0 ? Math.max(0, -v) : Math.max(0, v);
  }
  _gpPressed(gp, bind) {
    if (!bind) return false;
    if (bind.t === 'button') return !!(gp.buttons[bind.i] && gp.buttons[bind.i].pressed);
    const v = gp.axes[bind.i] || 0;
    return bind.d < 0 ? v < -.5 : v > .5;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = this.gpIndex != null ? pads[this.gpIndex] : null;
    if (!gp) for (const p of pads) if (p) { gp = p; this.gpIndex = p.index; break; }
    if (!gp) {
      this.input.steerAxis = null; this.input.throttleAxis = null; this.input.brakeAxis = null;
      for (const a of HELD_ACTIONS) this.padHeld[a] = false;
      return;
    }
    const DEAD = .16;
    const lv = this._gpAxisOrButtonValue(gp, this.GPBINDS.left), rv = this._gpAxisOrButtonValue(gp, this.GPBINDS.right);
    let steer = rv - lv; steer = Math.abs(steer) < DEAD ? 0 : Math.sign(steer) * (Math.abs(steer) - DEAD) / (1 - DEAD);
    this.input.steerAxis = steer;
    this.input.throttleAxis = this._gpAxisOrButtonValue(gp, this.GPBINDS.gas);
    this.input.brakeAxis = this._gpAxisOrButtonValue(gp, this.GPBINDS.brake);
    this.padHeld.left = this._gpPressed(gp, this.GPBINDS.left);
    this.padHeld.right = this._gpPressed(gp, this.GPBINDS.right);
    this.padHeld.gas = this.input.throttleAxis > .08;
    this.padHeld.brake = this.input.brakeAxis > .08;
    this.padHeld.nitro = this._gpPressed(gp, this.GPBINDS.nitro);

    const cameraNow = this._gpPressed(gp, this.GPBINDS.camera), pauseNow = this._gpPressed(gp, this.GPBINDS.pause);
    if (cameraNow && !this.gpPrevPressed.camera) this.handlers.onCameraCycle?.();
    if (pauseNow && !this.gpPrevPressed.pause) this.handlers.onPause?.();

    if (this.listeningFor && this.listeningFor.kind === 'gp') {
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed && !(this.gpPrevPressed.buttons && this.gpPrevPressed.buttons[i])) {
          this.GPBINDS[this.listeningFor.action] = { t: 'button', i };
          this.saveBinds(); this.listeningFor = null; this.handlers.onRenderBindList?.();
          break;
        }
      }
    }

    if (this.mode === 'attract') {
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed && !(this.gpPrevPressed.buttons && this.gpPrevPressed.buttons[i])) { this.handlers.onAdvanceAttract?.(); break; }
      }
    } else if (this.mode === 'vehicleSelect') {
      const dpadL = gp.buttons[14] && gp.buttons[14].pressed, dpadR = gp.buttons[15] && gp.buttons[15].pressed;
      const stickL = gp.axes[0] < -.6, stickR = gp.axes[0] > .6, confirm = gp.buttons[0] && gp.buttons[0].pressed;
      const prevL = this.gpPrevPressed.navL, prevR = this.gpPrevPressed.navR, prevConfirm = this.gpPrevPressed.confirm;
      const goL = (dpadL || stickL) && !prevL, goR = (dpadR || stickR) && !prevR;
      if (goL) this.handlers.onMenuNav?.(-1);
      if (goR) this.handlers.onMenuNav?.(1);
      if (confirm && !prevConfirm) this.handlers.onMenuConfirm?.();
      this.gpPrevPressed.navL = dpadL || stickL; this.gpPrevPressed.navR = dpadR || stickR; this.gpPrevPressed.confirm = confirm;
    }
    this.gpPrevPressed.camera = cameraNow; this.gpPrevPressed.pause = pauseNow;
    this.gpPrevPressed.buttons = gp.buttons.map(b => b.pressed);
  }

  update() {
    this.pollGamepad();
    for (const a of HELD_ACTIONS) this.input[a] = this.keyHeld[a] || this.padHeld[a] || this.touchHeld[a];
  }

  _bindTouchButtons() {
    for (const [id, k] of [['left', 'left'], ['right', 'right'], ['gas', 'gas'], ['brake', 'brake'], ['driftBtn', 'drift'], ['nitroBtn', 'nitro']]) {
      const b = this.$(id);
      const set = v => { this.touchHeld[k] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', e => { if (this.layoutEditing) return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { } set(true); });
      b.addEventListener('pointerup', () => set(false));
      b.addEventListener('pointercancel', () => set(false));
    }
    this.$('camBtn').onclick = () => { if (!this.layoutEditing) this.handlers.onCameraCycle?.(); };
  }

  _bindTouchLayout() {
    this.applyTouchLayout();
    addEventListener('resize', () => this.applyTouchLayout());
    for (const id of TOUCH_BTN_IDS) {
      const el = this.$(id);
      el.addEventListener('pointerdown', e => {
        if (!this.layoutEditing) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) { }
        const move = ev => { this.TOUCH_LAYOUT[id] = this._placeTouchBtnPx(id, ev.clientX, ev.clientY); };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); this._saveTouchLayout(); };
        move(e);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    }
  }

  _placeTouchBtnPx(id, x, y) {
    const el = this.$(id), s = TOUCH_BTN_SIZE[id];
    x = Math.max(s / 2, Math.min(innerWidth - s / 2, x));
    y = Math.max(s / 2, Math.min(innerHeight - s / 2, y));
    el.style.left = (x - s / 2) + 'px'; el.style.top = (y - s / 2) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
    return { xf: x / innerWidth, yf: y / innerHeight };
  }
  _saveTouchLayout() { try { localStorage.setItem('dd_touchlayout', JSON.stringify(this.TOUCH_LAYOUT)); } catch (e) { } }
  applyTouchLayout() {
    for (const id of TOUCH_BTN_IDS) {
      const el = this.$(id), pos = this.TOUCH_LAYOUT[id];
      if (!pos) { el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = ''; continue; }
      this._placeTouchBtnPx(id, pos.xf * innerWidth, pos.yf * innerHeight);
    }
  }
  resetTouchLayout() { this.TOUCH_LAYOUT = {}; this._saveTouchLayout(); this.applyTouchLayout(); }

  setLayoutEditing(on) {
    this.layoutEditing = on;
    TOUCH_BTN_IDS.forEach(id => this.$(id).classList.toggle('editing', on));
  }

  renderBindList(listEl) {
    listEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'bindRow';
    head.innerHTML = '<span class="bindHead">ACTION</span><span class="bindHead">KEYBOARD</span><span class="bindHead">GAMEPAD</span>';
    listEl.appendChild(head);
    ACTIONS.forEach(a => {
      const row = document.createElement('div'); row.className = 'bindRow'; row.innerHTML = '<b>' + a.label + '</b>';
      const kListening = this.listeningFor && this.listeningFor.kind === 'key' && this.listeningFor.action === a.id;
      const kBtn = document.createElement('button');
      kBtn.className = 'bindKey' + (kListening ? ' listening' : '');
      kBtn.textContent = kListening ? 'PRESS A KEY…' : keyLabel(this.KEYBINDS[a.id]);
      kBtn.onclick = () => { this.listeningFor = { action: a.id, kind: 'key' }; this.renderBindList(listEl); };
      const gListening = this.listeningFor && this.listeningFor.kind === 'gp' && this.listeningFor.action === a.id;
      const gBtn = document.createElement('button');
      gBtn.className = 'bindKey' + (gListening ? ' listening' : '');
      gBtn.textContent = gListening ? 'PRESS A BUTTON…' : gpLabel(this.GPBINDS[a.id]);
      gBtn.onclick = () => { this.listeningFor = { action: a.id, kind: 'gp' }; this.renderBindList(listEl); };
      row.appendChild(kBtn); row.appendChild(gBtn); listEl.appendChild(row);
    });
  }
}
