// The substrate. Everything radiates outward from a vanishing point at the
// so the whole world reads as something being emitted rather than a backdrop.
// Cheap on purpose: one gradient, three cached nebula sprites, a polar
// lattice, a few pre-rendered glyph columns and a dust field.

import { clamp, rand, rgba, mixHex, makeCanvas, glowSprite } from './util.js';
import { fx } from './fx.js';

const MOODS = {
  staging: { top: '#04060d', mid: '#071426', low: '#02040a', line: '#2f7fb8', neb: ['#0d3b66', '#14224a', '#062a3d'], accent: '#59e0ff' },
  lull: { top: '#0a0705', mid: '#231206', low: '#050304', line: '#b8762f', neb: ['#66300d', '#4a2a14', '#3d1c06'], accent: '#ffa347' },
  // The arrival: everything drains out of the substrate and the only colour
  // left is coming through the breach.
  breach: { top: '#000000', mid: '#080407', low: '#000000', line: '#6b4a2a', neb: ['#1a0d05', '#120612', '#050308'], accent: '#ffd08a' },
  // One per aspect, so the whole field turns over as it wakes up rather than
  // only the boss sprite changing colour.
  boss: { top: '#0b0703', mid: '#2b1a06', low: '#050301', line: '#c08a3a', neb: ['#6b3d08', '#4a2d10', '#2a1a04'], accent: '#ffd98a' },
  boss2: { top: '#08040f', mid: '#1b0b2e', low: '#04020a', line: '#9a5fd0', neb: ['#42117a', '#5c1040', '#1c0a4d'], accent: '#cbb8ff' },
  boss3: { top: '#0f0206', mid: '#320714', low: '#0a0103', line: '#e03a63', neb: ['#7a0c2c', '#5c1040', '#3d0416'], accent: '#ff9fb0' },
  ending: { top: '#000000', mid: '#0a0a0a', low: '#000000', line: '#555555', neb: ['#222222', '#111111', '#191919'], accent: '#cccccc' },
};

const GLYPHS = 'アカサタナハマヤラワ0123456789ABCDEF<>/\\|[]{}=+*#%$@';

class Background {
  constructor() {
    this.mood = { ...MOODS.staging };
    this.target = MOODS.staging;
    this.t = 0;
    this.flow = 0;
    this.dust = [];
    this.columns = [];
    this.nebula = [];
    this.w = 0;
    this.h = 0;
    this.vpx = 0;
    this.vpy = 0;
    this.deep = null;
    this.deepCtx = null;
    this.deepAge = 99;
    this.overlay = null;
    this.pulse = 0;
  }

  setMood(name) {
    if (MOODS[name]) this.target = MOODS[name];
  }

  /** A short bright bloom of the lattice — used on the lull and boss beats. */
  surge(amount = 1) {
    this.pulse = Math.min(2, this.pulse + amount);
  }

  resize(w, h, vpx, vpy) {
    const sameSize = this.w === w && this.h === h;
    this.w = w;
    this.h = h;
    this.vpx = vpx;
    this.vpy = vpy;
    // A device-pixel-ratio change re-enters here with identical CSS metrics;
    // rebuilding the parallax fields then would visibly reshuffle the sky.
    if (sameSize && this.overlay) return;

    this.dust.length = 0;
    const count = Math.round((w * h) / 9000);
    for (let i = 0; i < count; i++) {
      this.dust.push({
        x: rand(0, w),
        y: rand(0, h),
        z: rand(0.25, 1),
        r: rand(0.5, 1.7),
      });
    }

    // Pre-rendered glyph rain columns.
    this.columns.length = 0;
    const colH = 460;
    for (let i = 0; i < 5; i++) {
      const c = makeCanvas(16, colH);
      const g = c.getContext('2d');
      g.font = '13px ui-monospace, Menlo, monospace';
      g.textAlign = 'center';
      for (let y = 12; y < colH; y += 16) {
        g.fillStyle = `rgba(255,255,255,${rand(0.25, 1)})`;
        g.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], 8, y);
      }
      this.columns.push({
        img: c,
        x: rand(0, w),
        y: rand(-colH, h),
        speed: rand(18, 62),
        alpha: rand(0.05, 0.14),
        scale: rand(0.8, 1.8),
      });
    }

    this.deep = makeCanvas(Math.ceil(w / 2), Math.ceil(h / 2));
    this.deepCtx = this.deep.getContext('2d');
    this.deepAge = 99;
    this.buildOverlay(w, h);
  }

  update(dt) {
    this.t += dt;
    this.deepAge++;
    this.flow += dt * 26;
    this.pulse = Math.max(0, this.pulse - dt * 1.6);

    // Ease the palette toward the current phase.
    const k = 1 - Math.exp(-dt * 0.8);
    for (const key of ['top', 'mid', 'low', 'line', 'accent']) {
      this.mood[key] = mixHex(this.mood[key], this.target[key], k);
    }
    this.mood.neb = this.target.neb;

    for (const c of this.columns) {
      c.y += c.speed * dt;
      if (c.y > this.h) {
        c.y = -460 * c.scale;
        c.x = rand(0, this.w);
        c.speed = rand(18, 62);
      }
    }
    for (const d of this.dust) {
      d.y += (6 + d.z * 22) * dt;
      d.x += Math.sin(this.t * 0.3 + d.z * 9) * 4 * dt;
      if (d.y > this.h + 4) { d.y = -4; d.x = rand(0, this.w); }
    }
  }

  draw(ctx, w, h) {
    const m = this.mood;

    // --- base gradient ---
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, m.top);
    grad.addColorStop(0.42, m.mid);
    grad.addColorStop(1, m.low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // --- slow nebula bloom (cached half-res; it drifts far too slowly to
    //     be worth re-blending three screen-sized gradients every frame) ---
    this.drawNebula(ctx, w, h);

    // --- glyph rain (deep background) ---
    for (const c of this.columns) {
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(c.img, c.x, c.y, 16 * c.scale, 460 * c.scale);
    }
    ctx.globalAlpha = 1;

    this.drawLattice(ctx, w, h);

    // --- dust ---
    ctx.fillStyle = rgba(m.accent, 0.5);
    for (const d of this.dust) {
      ctx.globalAlpha = 0.1 + d.z * 0.3;
      ctx.fillRect(d.x, d.y, d.r * d.z, d.r * d.z);
    }
    ctx.globalAlpha = 1;
  }

  drawNebula(ctx, w, h) {
    if (!this.deep) return;
    if (this.deepAge >= 5) {
      this.deepAge = 0;
      const g = this.deepCtx;
      const dw = this.deep.width;
      const dh = this.deep.height;
      g.clearRect(0, 0, dw, dh);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.2;
      for (let i = 0; i < 3; i++) {
        const ph = this.t * (0.045 + i * 0.021) + i * 2.1;
        const x = dw * (0.5 + Math.cos(ph) * 0.42);
        const y = dh * (0.36 + Math.sin(ph * 0.83) * 0.34);
        const r = Math.max(dw, dh) * (0.38 + 0.1 * Math.sin(ph * 1.7));
        g.drawImage(glowSprite(this.mood.neb[i]), x - r, y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.deep, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Polar lattice centred on the vanishing point. Rings scroll outward and are displaced
   * by explosion ripples, so every kill visibly disturbs the world itself.
   */
  drawLattice(ctx, w, h) {
    const m = this.mood;
    const vpx = this.vpx;
    const vpy = this.vpy;
    const maxR = Math.hypot(Math.max(vpx, w - vpx), h - vpy) + 60;
    const ripples = fx.ripples;
    const bright = 1 + this.pulse * 1.6;

    ctx.lineWidth = 1;

    // Rays.
    ctx.strokeStyle = rgba(m.line, 0.09 * bright);
    ctx.beginPath();
    const rays = 30;
    for (let i = 0; i <= rays; i++) {
      const a = (i / rays) * Math.PI;
      ctx.moveTo(vpx + Math.cos(a) * 34, vpy + Math.sin(a) * 34);
      ctx.lineTo(vpx + Math.cos(a) * maxR, vpy + Math.sin(a) * maxR);
    }
    ctx.stroke();

    // Rings, displaced by ripples.
    const spacing = 62;
    const offset = this.flow % spacing;
    const segs = 26;
    for (let ringIdx = 0; ; ringIdx++) {
      const base = offset + ringIdx * spacing;
      if (base > maxR) break;
      if (base < 26) continue;
      const fade = clamp(1 - base / maxR, 0, 1);
      ctx.strokeStyle = rgba(m.line, (0.05 + fade * 0.13) * bright);
      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        let r = base;
        for (let k = 0; k < ripples.length; k++) {
          const rp = ripples[k];
          const px = vpx + ca * base;
          const py = vpy + sa * base;
          const dx = px - rp.x;
          const dy = py - rp.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > rp.radius) continue;
          const decay = (1 - d / rp.radius) * (1 - rp.t / rp.life);
          r += Math.sin(d * 0.05 - rp.t * 13) * 22 * rp.strength * decay * decay;
        }
        const x = vpx + ca * r;
        const y = vpy + sa * r;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Scanlines + vignette, baked once into a single overlay blit. */
  drawOverlay(ctx, w, h) {
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0, w, h);
  }

  buildOverlay(w, h) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    const rg = g.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.25, w / 2, h * 0.52, Math.max(w, h) * 0.78);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    this.overlay = c;
  }
}

export const background = new Background();
