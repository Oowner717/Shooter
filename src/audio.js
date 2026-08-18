// Tiny WebAudio synth. No assets, no network — every sound is generated.
// Fails silent if the API is unavailable or blocked.

import { clamp, rand } from './util.js';

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ready = false;
    this.noiseBuf = null;
    this.drone = null;
    this.lastAt = new Map();
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // shared white-noise buffer
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.ready = true;
      this.startDrone();
    } catch {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  /** Simple per-key throttle so 10 taps/second doesn't turn into mud. */
  _gate(key, minGap) {
    const now = this.ctx.currentTime;
    const last = this.lastAt.get(key) || -1;
    if (now - last < minGap) return false;
    this.lastAt.set(key, now);
    return true;
  }

  _env(node, t0, attack, decay, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.12, gain = 0.2, attack = 0.004, detune = 0 }) {
    if (!this.ready || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this._env(g, t0, attack, dur, gain);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + attack + 0.03);
  }

  noise({ dur = 0.2, gain = 0.25, f0 = 3000, f1 = 200, q = 1, type = 'lowpass' }) {
    if (!this.ready || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(0.85, 1.2);
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.004, dur, gain);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------- ambience

  startDrone() {
    if (!this.ready || this.drone) return;
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.value = 41;
    b.frequency.value = 41.6;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    a.connect(filt);
    b.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    a.start(t0); b.start(t0); lfo.start(t0);
    this.drone = { a, b, filt, g };
  }

  /** Shift the ambient bed for a phase change. */
  setDroneMood(base, cutoff, level) {
    if (!this.drone) return;
    const t = this.ctx.currentTime;
    this.drone.a.frequency.setTargetAtTime(base, t, 1.4);
    this.drone.b.frequency.setTargetAtTime(base * 1.014, t, 1.4);
    this.drone.filt.frequency.setTargetAtTime(cutoff, t, 1.4);
    this.drone.g.gain.setTargetAtTime(level, t, 1.4);
  }

  // ---------------------------------------------------------------- cues

  shot() {
    if (!this.ready || !this._gate('shot', 0.035)) return;
    this.tone({ type: 'square', f0: rand(880, 1030), f1: 180, dur: 0.07, gain: 0.1 });
    this.noise({ dur: 0.05, gain: 0.06, f0: 6000, f1: 900, type: 'highpass' });
  }

  hit() {
    if (!this.ready || !this._gate('hit', 0.028)) return;
    this.noise({ dur: 0.05, gain: 0.07, f0: 5200, f1: 1400, type: 'bandpass', q: 2 });
  }

  reflect() {
    if (!this.ready || !this._gate('refl', 0.05)) return;
    this.tone({ type: 'triangle', f0: 1800, f1: 2600, dur: 0.09, gain: 0.09 });
  }

  pop(size = 1) {
    if (!this.ready || !this._gate('pop', 0.02)) return;
    this.noise({ dur: clamp(0.12 * size, 0.08, 0.5), gain: clamp(0.1 * size, 0.06, 0.3), f0: 2600 / size, f1: 90, q: 0.8 });
    this.tone({ type: 'sine', f0: 200 / size, f1: 44, dur: 0.18 * size, gain: 0.11 });
  }

  boom() {
    if (!this.ready) return;
    this.noise({ dur: 1.1, gain: 0.34, f0: 1400, f1: 40, q: 0.6 });
    this.tone({ type: 'sine', f0: 90, f1: 26, dur: 1.0, gain: 0.3 });
  }

  ability(kind) {
    if (!this.ready) return;
    switch (kind) {
      case 'pulse':
        this.tone({ type: 'sine', f0: 160, f1: 40, dur: 0.5, gain: 0.24 });
        this.noise({ dur: 0.45, gain: 0.16, f0: 900, f1: 80 });
        break;
      case 'fan':
        this.noise({ dur: 0.24, gain: 0.16, f0: 7000, f1: 700, type: 'highpass' });
        break;
      case 'lance':
        this.tone({ type: 'sawtooth', f0: 260, f1: 2400, dur: 0.34, gain: 0.16 });
        this.tone({ type: 'sine', f0: 1200, f1: 300, dur: 0.4, gain: 0.1 });
        break;
      case 'well':
        this.tone({ type: 'sine', f0: 60, f1: 300, dur: 1.4, gain: 0.2 });
        break;
      case 'stasis':
        this.tone({ type: 'triangle', f0: 1400, f1: 1400, dur: 0.6, gain: 0.12 });
        this.tone({ type: 'triangle', f0: 2100, f1: 2100, dur: 0.7, gain: 0.08, detune: 8 });
        break;
      default:
        break;
    }
  }

  glitchOn() {
    if (!this.ready || !this._gate('glitch', 0.35)) return;
    this.noise({ dur: 0.4, gain: 0.14, f0: 800, f1: 4200, type: 'bandpass', q: 0.6 });
    this.tone({ type: 'square', f0: 70, f1: 55, dur: 0.3, gain: 0.09 });
  }

  bossPower() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', f0: 110, f1: 96, dur: 1.1, gain: 0.12 });
    this.tone({ type: 'sawtooth', f0: 155, f1: 148, dur: 1.1, gain: 0.1, detune: -12 });
    this.tone({ type: 'sine', f0: 880, f1: 440, dur: 0.9, gain: 0.07 });
  }

  /** A dull knock: something sinking in rather than breaking. */
  thud() {
    if (!this.ready || !this._gate('thud', 0.04)) return;
    this.tone({ type: 'square', f0: rand(300, 420), f1: 120, dur: 0.08, gain: 0.07 });
    this.noise({ dur: 0.09, gain: 0.09, f0: 4000, f1: 700, type: 'bandpass', q: 3 });
  }

  chime(f = 660) {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: f, f1: f, dur: 1.2, gain: 0.12, attack: 0.01 });
    this.tone({ type: 'sine', f0: f * 1.5, f1: f * 1.5, dur: 0.9, gain: 0.06, attack: 0.01 });
  }
}

export const audio = new Audio();
