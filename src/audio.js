export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14;
    this.master.connect(this.ctx.destination);
  }

  beep({ freq = 220, duration = 0.08, type = 'square', volume = 0.3 }) {
    this.ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  shot() { this.beep({ freq: 120, duration: 0.07, type: 'sawtooth', volume: 0.18 }); }
  hit() { this.beep({ freq: 700, duration: 0.03, type: 'triangle', volume: 0.12 }); }
  hurt() { this.beep({ freq: 70, duration: 0.15, type: 'square', volume: 0.16 }); }
  step() { this.beep({ freq: 190, duration: 0.02, type: 'triangle', volume: 0.05 }); }
}
