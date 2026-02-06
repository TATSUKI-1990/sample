export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDelta = { x: 0, y: 0 };
    this.fire = false;
    this.wasReloadPressed = false;
    this.wasRestartPressed = false;

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.fire = true;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });
  }

  consumeLookDelta() {
    const d = { ...this.lookDelta };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return d;
  }

  frameActions() {
    const reload = this.keys.has('r');
    const restart = this.keys.has('r');
    const out = {
      reload: reload && !this.wasReloadPressed,
      restart: restart && !this.wasRestartPressed,
    };
    this.wasReloadPressed = reload;
    this.wasRestartPressed = restart;
    return out;
  }

  axis() {
    const w = this.keys.has('w') ? 1 : 0;
    const s = this.keys.has('s') ? 1 : 0;
    const d = this.keys.has('d') ? 1 : 0;
    const a = this.keys.has('a') ? 1 : 0;
    return { x: d - a, y: w - s };
  }

  get sprint() { return this.keys.has('shift'); }
  get crouch() { return this.keys.has('control'); }
  get jump() { return this.keys.has(' '); }
}
