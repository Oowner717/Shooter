// Particles, shockwaves, debris sparkle, screen shake and the ripple sources
// that the background grid reacts to. Pooled — nothing here allocates once
// the pools have warmed up.

import { CFG } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, glowSprite } from './util.js';

const PARTICLE_FIELDS = {
  x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, drag: 1.2, grav: 0,
  color: '#fff', kind: 0, rot: 0, vr: 0, glow: 1, sides: 3,
};

// kind: 0 = glow dot, 1 = streak, 2 = shard, 3 = ember
const KIND_DOT = 0;
const KIND_STREAK = 1;
const KIND_SHARD = 2;
const KIND_EMBER = 3;

class Pool {
  constructor(make) {
    this.make = make;
    this.active = [];
    this.free = [];
  }
  spawn() {
    const o = this.free.pop() || this.make();
    this.active.push(o);
    return o;
  }
  sweep() {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].life <= 0) {
        this.free.push(a[i]);
        a[i] = a[a.length - 1];
        a.pop();
      }
    }
  }
  clear() {
    for (const o of this.active) this.free.push(o);
    this.active.length = 0;
  }
}

export const fx = {
  particles: new Pool(() => ({ ...PARTICLE_FIELDS })),
  rings: new Pool(() => ({ x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, w: 3, color: '#fff', fill: 0 })),
  ripples: [], // consumed by the background grid
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  flash: 0,
  flashColor: '#ffffff',
  quality: 1, // scaled down by the adaptive quality governor

  reset() {
    this.particles.clear();
    this.rings.clear();
    this.ripples.length = 0;
    this.shake = 0;
    this.flash = 0;
  },

  get budgetLeft() {
    return CFG.maxParticles * this.quality - this.particles.active.length;
  },
};

// ---------------------------------------------------------------- emitters

export function spark(x, y, vx, vy, color, life = 0.35, r = 2.2) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_STREAK;
  p.drag = 2.4; p.grav = 0; p.glow = 1;
  return p;
}

export function dot(x, y, vx, vy, color, life, r) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_DOT;
  p.drag = 1.6; p.grav = 0; p.glow = 1;
  return p;
}

export function shard(x, y, vx, vy, color, life, r, sides = 3) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_SHARD;
  p.drag = 0.7; p.grav = 26; p.rot = rand(0, TAU); p.vr = spread(9);
  p.sides = sides; p.glow = 0.5;
  return p;
}

function ember(x, y, vx, vy, color, life, r) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_EMBER;
  p.drag = 0.9; p.grav = -14; p.glow = 1;
  return p;
}

export function ring(x, y, r0, r1, life, color, w = 3, fill = 0) {
  const g = fx.rings.spawn();
  g.x = x; g.y = y; g.r = r0;
  g.vr = (r1 - r0) / life;
  g.life = g.max = life;
  g.color = color; g.w = w; g.fill = fill;
  return g;
}

export function ripple(x, y, strength, radius) {
  // Bounded tightly: background.drawLattice walks this list once per ring
  // vertex, so it is the one place where a long list would actually cost.
  if (fx.ripples.length >= 12) fx.ripples.shift();
  fx.ripples.push({ x, y, t: 0, life: 1.5, strength, radius });
}

/**
 * Let the screen-level effects finish while the world is held. A pause that
 * freezes a white flash mid-decay looks like a broken frame rather than a
 * paused one, so these two keep running even when nothing moves.
 */
export function settleScreen(dt) {
  fx.shake = Math.max(0, fx.shake - fx.shake * 9 * dt - 6 * dt);
  fx.shakeX = spread(fx.shake);
  fx.shakeY = spread(fx.shake);
  fx.flash = Math.max(0, fx.flash - dt * 2.6);
}

export function shake(amount) {
  fx.shake = Math.min(26, fx.shake + amount);
}

export function flash(alpha, color = '#ffffff') {
  if (alpha > fx.flash) {
    fx.flash = alpha;
    fx.flashColor = color;
  }
}

// ------------------------------------------------------------ composites

/** Bolt impact against a body. */
export function hitBurst(x, y, nx, ny, color) {
  const n = (5 * fx.quality) | 0;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ny, nx) + spread(1.1);
    const s = rand(90, 300);
    spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.12, 0.3), rand(1.4, 2.6));
  }
  dot(x, y, 0, 0, color, 0.16, 13);
}

/** An object dying: shards, embers, a shock ring and a ground ripple. */
export function explode(x, y, r, color, glow, power = 1) {
  const q = fx.quality;
  const shards = clamp((r * 0.4 * power * q) | 0, 3, 22);
  for (let i = 0; i < shards; i++) {
    const a = rand(0, TAU);
    const s = rand(60, 260) * power;
    shard(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.5, 1.15), rand(r * 0.12, r * 0.3), 3 + ((Math.random() * 3) | 0));
  }
  const sparks = clamp((r * 0.7 * power * q) | 0, 5, 34);
  for (let i = 0; i < sparks; i++) {
    const a = rand(0, TAU);
    const s = rand(120, 520) * power;
    spark(x, y, Math.cos(a) * s, Math.sin(a) * s, glow, rand(0.18, 0.5), rand(1.5, 3.4));
  }
  const embers = clamp((r * 0.25 * q) | 0, 2, 12);
  for (let i = 0; i < embers; i++) {
    ember(x, y, spread(70), spread(70) - 20, color, rand(0.7, 1.6), rand(1.4, 3));
  }
  ring(x, y, r * 0.35, r * 3.1 * power, 0.42, glow, 2.4);
  ring(x, y, 0, r * 1.5, 0.24, '#ffffff', 1.4);
  dot(x, y, 0, 0, '#ffffff', 0.14, r * 1.6);
  ripple(x, y, 0.9 * power, r * 6);
  shake(clamp(r * 0.09 * power, 0.6, 7));
}

// ------------------------------------------------------------- simulation

export function updateFx(dt) {
  const parts = fx.particles.active;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vy = p.vy * d + p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  fx.particles.sweep();

  const rings = fx.rings.active;
  for (let i = 0; i < rings.length; i++) {
    const g = rings[i];
    g.life -= dt;
    g.r += g.vr * dt;
  }
  fx.rings.sweep();

  for (let i = fx.ripples.length - 1; i >= 0; i--) {
    const r = fx.ripples[i];
    r.t += dt;
    if (r.t >= r.life) fx.ripples.splice(i, 1);
  }

  fx.shake = Math.max(0, fx.shake - fx.shake * 9 * dt - 6 * dt);
  const s = fx.shake;
  fx.shakeX = spread(s);
  fx.shakeY = spread(s);
  fx.flash = Math.max(0, fx.flash - dt * 2.6);
}

// ---------------------------------------------------------------- drawing

export function drawFx(ctx) {
  const parts = fx.particles.active;
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const t = p.life / p.max;
    if (t <= 0) continue;

    if (p.kind === KIND_STREAK) {
      const a = clamp(t, 0, 1);
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = p.r * a;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.stroke();
    } else if (p.kind === KIND_SHARD) {
      ctx.globalAlpha = clamp(t * 1.3, 0, 1);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      const r = p.r;
      for (let k = 0; k < p.sides; k++) {
        const ang = (k / p.sides) * TAU;
        const rr = k % 2 ? r * 0.62 : r;
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      // dot / ember — pre-rendered glow sprite
      const r = p.r * (p.kind === KIND_EMBER ? 2.6 : 1) * (0.35 + t * 0.65);
      const img = glowSprite(p.color);
      ctx.globalAlpha = clamp(t, 0, 1) * p.glow;
      ctx.drawImage(img, p.x - r * 2, p.y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = 1;
    }
  }

  const rings = fx.rings.active;
  for (let i = 0; i < rings.length; i++) {
    const g = rings[i];
    const t = clamp(g.life / g.max, 0, 1);
    if (g.fill) {
      ctx.globalAlpha = t * g.fill;
      drawGlow(ctx, g.color, g.x, g.y, g.r);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = rgba(g.color, t * 0.95);
    ctx.lineWidth = Math.max(0.4, g.w * t);
    ctx.beginPath();
    ctx.arc(g.x, g.y, Math.max(0.5, g.r), 0, TAU);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export function drawFlash(ctx, w, h) {
  if (fx.flash <= 0.002) return;
  ctx.globalAlpha = clamp(fx.flash, 0, 1);
  ctx.fillStyle = fx.flashColor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}
