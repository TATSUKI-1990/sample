export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new window.AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  }

  shoot() {
    this.ensure();
    const t = this.ctx.currentTime;
    this.noise(t, 0.07, 0.22);
    this.tone(160, 0.09, "square", 0.18);
  }

  hit() {
    this.ensure();
    this.tone(540, 0.04, "triangle", 0.09);
  }

  step(speed) {
    this.ensure();
    this.tone(80 + speed * 4, 0.03, "square", 0.04);
  }

  tone(freq, duration, type, gainAmount) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(gainAmount, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }

  noise(t, duration, gainAmount) {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = gainAmount;
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }
}
