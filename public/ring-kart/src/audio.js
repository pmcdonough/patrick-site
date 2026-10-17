// The sound, made in the browser. Nothing plays until the first click or key, as browsers require.
//
// The engine is built from the car's own engine in cars.json, not a recording. A four-stroke engine fires each
// cylinder once every two turns of the crank, so the note's fundamental is the engine cycle (rpm / 120 Hz) and the
// loudest partials are the firing order (as many times the cycle as there are cylinders) and its multiples; a little
// of every other partial is the roughness of real combustion. Two copies of that wave a few cents apart thicken it,
// a soft clipper driven harder with the throttle adds the rasp under load, a resonance stands for the intake and the
// exhaust, and a low-pass opens with the revs and the throttle. A flat-six at 9,000 rpm fires 450 times a second,
// which is the GT3 RS's scream; a four at 6,700 fires 223 times and sounds like a hot hatch.
//
// The gearbox (`gearbox` in drive.js) is what makes it sound driven: each change up cuts the ignition for a few
// hundredths of a second, a crack in a twin-clutch box and a "brap" in a DSG, while the revs fall to the next gear;
// each change down blips the throttle, so the revs jump and the exhaust pops, one bark per gear into a hairpin. Off
// the throttle at high revs it crackles. Turbo cars whistle on boost and sigh when you lift. Then the tyres in a
// drift, the wind, a whoosh for a mini-turbo, a thud for a bump, the barrier's beep and the horn. On the pro lap the
// director's trackside cameras hear the car the way a marshal would: quieter far away, and its pitch falling as it
// goes past (the Doppler shift).
export class Sound {
  constructor() { this.on = true; this.ctx = null; this.lastBoost = 0; this.lastBump = 0; this.E = null; this.ups = 0; this.downs = 0; this.load = 0; this.gas = false; this.near = 1; this.cutUntil = 0; this.blipT = 0; this.ear = { d: 6, vr: 0 }; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.55 : 0;
    // a gentle limiter at the end, so a blip, a pop and the horn together never clip
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    this.master.connect(comp); comp.connect(ctx.destination);
    // ---------- the engine: two oscillators, the clipper, the resonance, the low-pass, the level ----------
    this.o1 = ctx.createOscillator(); this.o2 = ctx.createOscillator(); this.o2.detune.value = 9;
    this.drive = ctx.createGain(); this.drive.gain.value = 1;
    this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '2x';
    const curve = new Float32Array(1024); for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
    this.shaper.curve = curve;
    this.res = ctx.createBiquadFilter(); this.res.type = 'peaking'; this.res.Q.value = 1.3; this.res.gain.value = 7;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.9;
    this.eg = ctx.createGain(); this.eg.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.7;
    this.o1.connect(this.drive); this.o2.connect(g2); g2.connect(this.drive);
    this.drive.connect(this.shaper); this.shaper.connect(this.res); this.res.connect(this.lp); this.lp.connect(this.eg); this.eg.connect(this.master);
    this.o1.start(); this.o2.start();
    // noise for combustion, tyres, wind, pops and whooshes
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, f, q, to = this.master) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(to); s.start(); g.filter = fl; return g; };
    this.rumble = loop('bandpass', 400, 1.2, this.lp);   // combustion noise, through the engine's own low-pass
    this.tyre = loop('bandpass', 950, 7);
    this.wind = loop('lowpass', 420, 0.7);
    // the turbo's whistle
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.wg = ctx.createGain(); this.wg.gain.value = 0;
    this.whistle.connect(this.wg); this.wg.connect(this.master); this.whistle.start();
    if (this.E) this.engine(this.E);
  }
  // the engine's voice: its wave from the cylinder count, and how bright it is
  engine(E) {
    this.E = E;
    if (!this.ctx) return;
    const N = E.cyl || 4, H = Math.min(96, N * 8), re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    // the firing partials, falling away slowly (a flat-six keeps its high ones: that is the howl), and a little of
    // every other partial, fixed per engine so it always sounds the same
    let seed = N * 7919 + (E.redline || 0); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const fall = E.flat ? 0.55 : E.turbo ? 0.95 : 0.8;
    for (let h = 1; h <= H; h++) {
      const k = h / N;
      im[h] = h % N === 0 ? 1 / Math.pow(k, fall) : (h % (N / 2) === 0 ? 0.22 : 0.07) * rnd() / Math.sqrt(h / N + 0.5);
    }
    const w = this.ctx.createPeriodicWave(re, im);
    this.o1.setPeriodicWave(w); this.o2.setPeriodicWave(w);
    this.bright = E.flat ? 1 : E.turbo ? 0.5 : 0.72;
    this.res.frequency.value = E.flat ? 2300 : E.turbo ? 900 : 1400;
    this.rumble.filter.frequency.value = E.flat ? 900 : 380;
  }
  toggle() { this.on = !this.on; if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, this.ctx.currentTime, 0.05); return this.on; }
  quiet() { if (this.eg) { const t = this.ctx.currentTime; for (const g of [this.eg, this.tyre, this.wind, this.rumble, this.wg]) g.gain.setTargetAtTime(0, t, 0.05); } }
  burst(type, f, dur, vol, when = 0, q = 1) {
    if (!this.ctx) return; const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); const t = ctx.currentTime + when;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  // an exhaust pop: a short low crack
  pop(vol = 0.3, when = 0) { this.burst('lowpass', 600 + Math.random() * 700, 0.04 + Math.random() * 0.04, vol * this.near, when, 0.7); }
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
  whoosh() { this.burst('bandpass', 700, 0.9, 0.45); this.burst('highpass', 2400, 0.5, 0.16); }
  beep() { this.tone(880, 0.18, 0.12); this.tone(1320, 0.3, 0.12, 0.2); }
  finish() { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.25, 0.1, i * 0.12)); }
  // where the listener is: d metres from the car, closing at vr metres a second (negative going away)
  hear(d, vr) { this.ear.d = d; this.ear.vr += (vr - this.ear.vr) * 0.3; }
  update(car, mode, dt) {
    if (!this.ctx || !car) return;
    const t = this.ctx.currentTime;
    if (mode === 'pick' || !car.gb) { this.quiet(); return; }
    const E = car.engine, gb = car.gb, red = E.redline, frac = Math.min(1.05, gb.rpm / red);
    if (this.E !== E) { this.engine(E); this.ups = gb.ups; this.downs = gb.downs; }
    const v = Math.abs(car.v), gas = car.input.gas > 0 || car.boost > 0, br = this.bright;
    // the listener: far away it is quieter and duller, and the pitch shifts as the car comes and goes
    const d = Math.max(1, this.ear.d), near = this.near = Math.min(1, 14 / d), dop = Math.max(0.75, Math.min(1.3, 343 / (343 - Math.max(-120, Math.min(120, this.ear.vr)))));
    this.load += ((gas ? 1 : 0) - this.load) * Math.min(1, dt * 14);
    const L = this.load;
    // ---------- shifts ----------
    if (gb.ups !== this.ups) {
      this.ups = gb.ups;
      if (gas) {
        // the ignition cut: a dip and a crack, longer in a manual where you lift for the change
        const quick = E.box === 'pdk' || E.box === 'dsg', dip = quick ? 0.05 : E.box === 'auto' ? 0.3 : 0.28;
        this.eg.gain.cancelScheduledValues(t); this.eg.gain.setValueAtTime(this.eg.gain.value, t);
        this.eg.gain.linearRampToValueAtTime(this.eg.gain.value * (E.box === 'auto' ? 0.7 : 0.25), t + 0.012);
        this.eg.gain.linearRampToValueAtTime(this.eg.gain.value, t + dip);
        if (E.box === 'pdk') this.burst('bandpass', 1900, 0.05, 0.28 * near, 0, 1.4);
        if (E.box === 'dsg') { this.burst('lowpass', 320, 0.11, 0.5 * near, 0.005, 1.2); this.pop(0.35, 0.03); }
        if (E.box === 'manual' && E.turbo) this.burst('highpass', 2600, 0.25, 0.08 * near);   // the wastegate sighing as you lift
        this.cutUntil = t + dip;
      }
    }
    if (gb.downs !== this.downs) {
      this.downs = gb.downs;
      if (E.box !== 'auto') {
        // the blip: the throttle opens for a tenth of a second, then the exhaust pops on the way back down
        this.blipT = t + (E.box === 'manual' ? 0.16 : 0.1);
        const n = E.flat ? 2 + (Math.random() < 0.5) : 1 + (Math.random() < 0.4);
        for (let i = 0; i < n; i++) this.pop(0.42, 0.07 + i * (0.04 + Math.random() * 0.05));
      }
    }
    const blip = t < this.blipT ? 1 : 0;
    // ---------- the note ----------
    const f = gb.rpm / 120 * dop;
    this.o1.frequency.setTargetAtTime(f, t, 0.008); this.o2.frequency.setTargetAtTime(f, t, 0.008);
    const load = Math.max(L, blip * 0.85);
    this.drive.gain.setTargetAtTime(0.55 + load * (0.9 + 1.6 * br) * (0.5 + 0.5 * frac), t, 0.02);
    this.lp.frequency.setTargetAtTime((420 + frac * (1300 + 4200 * br) * (0.4 + 0.6 * load)) * (0.45 + 0.55 * near), t, 0.025);
    this.res.gain.setTargetAtTime(3 + 6 * load * frac, t, 0.05);
    if (t >= this.cutUntil) this.eg.gain.setTargetAtTime((0.06 + load * (0.07 + 0.06 * frac)) * (0.25 + 0.75 * near) * (gb.limiter && Math.floor(t * 28) % 2 ? 0.55 : 1), t, 0.02);
    this.rumble.gain.setTargetAtTime(0.02 + 0.07 * load * frac, t, 0.05);
    // a turbo spools with revs and throttle, whistles, and sighs when you lift at speed
    if (E.turbo) {
      this.whistle.frequency.setTargetAtTime(2200 + gb.rpm * 0.55, t, 0.05);
      this.wg.gain.setTargetAtTime(L * frac * 0.014 * near, t, 0.12);
      if (this.gas && !gas && frac > 0.55) this.burst('bandpass', 3200, 0.35, 0.12 * near, 0, 0.8);
    }
    // overrun: off the throttle high in the revs the exhaust crackles, the GT3 RS most
    if (!gas && frac > 0.5 && v > 10 && Math.random() < dt * (E.flat ? 7 : E.turbo ? 2.5 : 3.5) * frac) this.pop(0.2 + Math.random() * 0.2);
    this.gas = gas;
    // ---------- tyres, wind, turbo, bumps ----------
    this.tyre.gain.setTargetAtTime(car.drift && !car.air ? 0.16 * near : 0, t, 0.05);
    this.wind.gain.setTargetAtTime(Math.min(0.32, v * v / 9000) * near, t, 0.1);
    if (car.boost > 0 && this.lastBoost <= 0) this.burst('highpass', 1200, 0.6, 0.35);
    this.lastBoost = car.boost;
    if (car.bump > 0.35 && this.lastBump < 0.3) this.burst('lowpass', 180, 0.3, 0.6 * car.bump);
    this.lastBump = car.bump;
  }
}
