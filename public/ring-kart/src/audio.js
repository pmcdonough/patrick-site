// The sound, made in the browser: an engine from two oscillators through a filter that opens with the throttle, the
// tyres squealing in a drift, wind that rises with speed, a whoosh for a mini-turbo, a thud for a bump, and the beep
// of the barrier. Nothing plays until the first click or key, as browsers require.
import { revs } from './drive.js?v=0.6';
export class Sound {
  constructor() { this.on = true; this.ctx = null; this.rpm = 900; this.lastBoost = 0; this.lastBump = 0; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.55 : 0; this.master.connect(ctx.destination);
    // engine
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 4;
    this.eg = ctx.createGain(); this.eg.gain.value = 0.0;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    this.o1.connect(this.lp); this.o2.connect(g2); g2.connect(this.lp); this.lp.connect(this.eg); this.eg.connect(this.master);
    this.o1.start(); this.o2.start();
    // noise for tyres, wind and whooshes
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return g; };
    this.tyre = loop('bandpass', 950, 7);
    this.wind = loop('lowpass', 420, 0.7);
  }
  toggle() { this.on = !this.on; if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, this.ctx.currentTime, 0.05); return this.on; }
  quiet() { if (this.eg) { const t = this.ctx.currentTime; this.eg.gain.setTargetAtTime(0, t, 0.05); this.tyre.gain.setTargetAtTime(0, t, 0.05); this.wind.gain.setTargetAtTime(0, t, 0.05); } }
  burst(type, f, dur, vol) {
    if (!this.ctx) return; const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); s.stop(t + dur + 0.05);
  }
  tone(f, dur, vol = 0.2, when = 0) {
    if (!this.ctx) return; const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + when;
    o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // a cartoon horn: two notes a third apart, sliding up into the first
  horn() {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, d] of [[311, 0], [392, 0.22]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 1800;
      o.frequency.setValueAtTime(f * 0.7, t + d); o.frequency.exponentialRampToValueAtTime(f, t + d + 0.08);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.03); g.gain.setValueAtTime(0.16, t + d + 0.18); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.3);
      o.connect(lp); lp.connect(g); g.connect(this.master); o.start(t + d); o.stop(t + d + 0.35);
    }
  }
  // a car going past a trackside camera
  whoosh() { this.burst('bandpass', 700, 0.9, 0.55); this.burst('highpass', 2400, 0.5, 0.2); }
  beep() { this.tone(880, 0.18, 0.12); this.tone(1320, 0.3, 0.12, 0.2); }
  finish() { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.25, 0.1, i * 0.12)); }
  update(car, mode, dt) {
    if (!this.ctx || !car) return;
    const t = this.ctx.currentTime;
    if (mode === 'pick') { this.quiet(); return; }
    const v = Math.abs(car.v), gas = car.input.gas || car.boost > 0 ? 1 : 0;
    // the revs come from the gearbox the dials read
    const want = revs(car).rpm;
    this.rpm += (want - this.rpm) * Math.min(1, dt * (want > this.rpm ? 9 : 6));
    const f = this.rpm / 30 * (car.spec.mass > 1.8 ? 0.8 : 1);
    this.o1.frequency.setTargetAtTime(f, t, 0.02); this.o2.frequency.setTargetAtTime(f / 2, t, 0.02);
    this.lp.frequency.setTargetAtTime(380 + gas * 1900 + this.rpm * 0.12, t, 0.04);
    this.eg.gain.setTargetAtTime(0.09 + gas * 0.1, t, 0.05);
    this.tyre.gain.setTargetAtTime(car.drift && !car.air ? 0.16 : 0, t, 0.05);
    this.wind.gain.setTargetAtTime(Math.min(0.35, v * v / 9000), t, 0.1);
    if (car.boost > 0 && this.lastBoost <= 0) this.burst('highpass', 1200, 0.6, 0.35);
    this.lastBoost = car.boost;
    if (car.bump > 0.35 && this.lastBump < 0.3) this.burst('lowpass', 180, 0.3, 0.6 * car.bump);
    this.lastBump = car.bump;
  }
}
