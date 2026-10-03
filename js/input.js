// キーボード・マウス入力（ポインタロック対応）。テスト用に入力の注入もできる。
const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyT', 'KeyM',
  'KeyJ', 'KeyK', 'KeyL', 'KeyC', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight',
]);

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();       // 押されているキー
    this.pressed = new Set();    // このフレームで押されたキー
    this.released = new Set();
    this.down = [false, false, false];
    this.mPressed = [false, false, false];
    this.mReleased = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.captureKeys = false;    // 狩猟中はスペースなどでページが動かないようにする
    this.onLockChange = null;
    this.lockFailed = false;

    window.addEventListener('keydown', e => {
      if (this.captureKeys && GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keyDown(e.code);
    });
    window.addEventListener('keyup', e => this.keyUp(e.code));
    window.addEventListener('blur', () => this.clearAll());
    el.addEventListener('mousedown', e => {
      if (e.button > 2) return;
      e.preventDefault();
      this.mouseDown(e.button);
    });
    window.addEventListener('mouseup', e => { if (e.button <= 2) this.mouseUp(e.button); });
    window.addEventListener('mousemove', e => {
      if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    el.addEventListener('wheel', e => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  requestLock() {
    if (this.locked || !this.el.requestPointerLock) return;
    try {
      const r = this.el.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.lockFailed = true; });
    } catch { this.lockFailed = true; }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  keyDown(code) { if (!this.keys.has(code)) { this.keys.add(code); this.pressed.add(code); } }
  keyUp(code) { if (this.keys.has(code)) { this.keys.delete(code); this.released.add(code); } }
  mouseDown(b) { if (!this.down[b]) { this.down[b] = true; this.mPressed[b] = true; } }
  mouseUp(b) { if (this.down[b]) { this.down[b] = false; this.mReleased[b] = true; } }
  clearAll() {
    for (const k of this.keys) this.released.add(k);
    this.keys.clear();
    for (let b = 0; b < 3; b++) if (this.down[b]) { this.down[b] = false; this.mReleased[b] = true; }
  }

  held(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mPressed[0] = this.mPressed[1] = this.mPressed[2] = false;
    this.mReleased[0] = this.mReleased[1] = this.mReleased[2] = false;
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
