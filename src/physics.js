// Impulse-based circle physics: restitution, tangential friction (which spins
// bodies up), positional correction, and a uniform grid broadphase.
//
// Everything the player watches bounce lives here, so it is deliberately
// allocation-free in the hot path.

import { CFG } from './config.js';
import { clamp } from './util.js';

const P = CFG.physics;

/**
 * Uniform grid. Bodies are inserted by centre cell only, which is exact as
 * long as `cell >= 2 * maxRadius` — any two overlapping bodies then live in
 * cells at most one apart.
 */
export class Grid {
  constructor(cell = 96) {
    this.cell = cell;
    this.cols = 0;
    this.rows = 0;
    this.ox = 1; // cell margin so bodies just outside the arena still bucket
    this.oy = 4;
    this.buckets = [];
  }

  resize(w, h, cell) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(w / cell) + this.ox * 2);
    this.rows = Math.max(1, Math.ceil(h / cell) + this.oy * 2);
    const n = this.cols * this.rows;
    this.buckets = new Array(n);
    for (let i = 0; i < n; i++) this.buckets[i] = [];
  }

  _cx(x) {
    return clamp(Math.floor(x / this.cell) + this.ox, 0, this.cols - 1);
  }

  _cy(y) {
    return clamp(Math.floor(y / this.cell) + this.oy, 0, this.rows - 1);
  }

  clear() {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i].length = 0;
  }

  build(bodies) {
    this.clear();
    for (let i = 0; i < bodies.length; i++) {
      bodies[i]._gi = i;
      this.buckets[this._cy(bodies[i].y) * this.cols + this._cx(bodies[i].x)].push(bodies[i]);
    }
  }

  /** Calls cb(a, b) once per potentially-overlapping pair. */
  eachPair(bodies, cb) {
    const { cols, rows } = this;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const cx = this._cx(a.x);
      const cy = this._cy(a.y);
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy;
        if (gy < 0 || gy >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          if (gx < 0 || gx >= cols) continue;
          const bucket = this.buckets[gy * cols + gx];
          for (let k = 0; k < bucket.length; k++) {
            const b = bucket[k];
            if (b._gi > i) cb(a, b);
          }
        }
      }
    }
  }
}

/** Advance one body. Returns nothing; damping is frame-rate independent. */
export function integrate(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.angle += b.av * dt;

  const d = Math.exp(-P.linearDamping * dt);
  b.vx *= d;
  b.vy *= d;
  b.av *= Math.exp(-P.angularDamping * dt);

  // Soft speed ceiling so a chain reaction can't fling anything to infinity.
  const cap = (b.cruise || 60) * P.maxSpeedFactor;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > cap * cap) {
    const s = cap / Math.sqrt(sp2);
    b.vx *= s;
    b.vy *= s;
  }
}

/**
 * Resolve a circle/circle contact.
 * @returns impact speed along the normal (0 if no contact / separating).
 */
export function resolvePair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 1e-9) return 0;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return 0;

  // --- positional correction (Baumgarte) ---
  const pen = Math.max(rr - d - P.slop, 0);
  if (pen > 0) {
    const corr = (pen / invSum) * P.correction;
    a.x -= nx * corr * a.invMass;
    a.y -= ny * corr * a.invMass;
    b.x += nx * corr * b.invMass;
    b.y += ny * corr * b.invMass;
  }

  // --- normal impulse ---
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return 0;

  const e = a.restitution < b.restitution ? a.restitution : b.restitution;
  const j = (-(1 + e) * vn) / invSum;
  a.vx -= nx * j * a.invMass;
  a.vy -= ny * j * a.invMass;
  b.vx += nx * j * b.invMass;
  b.vy += ny * j * b.invMass;

  // --- tangential friction -> spin ---
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  const mu = Math.sqrt((a.friction || 0.25) * (b.friction || 0.25));
  let jt = -vt / invSum;
  const maxJt = j * mu;
  jt = clamp(jt, -maxJt, maxJt);
  a.vx -= tx * jt * a.invMass;
  a.vy -= ty * jt * a.invMass;
  b.vx += tx * jt * b.invMass;
  b.vy += ty * jt * b.invMass;
  // Δω = -2·jt·invMass / r for a uniform disc (I = ½mr²).
  if (a.invMass > 0) a.av -= (2 * jt * a.invMass) / a.r;
  if (b.invMass > 0) b.av -= (2 * jt * b.invMass) / b.r;

  return -vn;
}

/** Mutual damage produced by an impact, before per-body armour. */
export function impactDamage(a, b, impact) {
  if (impact <= P.collisionThreshold) return 0;
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return 0;
  const reduced = 1 / invSum;
  return clamp((impact - P.collisionThreshold) * reduced * P.collisionDamage, 0, 300);
}

/**
 * Resolve a circle against a static axis-aligned box.
 * @returns impact speed (0 if no contact).
 */
export function resolveBox(b, box) {
  const cx = clamp(b.x, box.x0, box.x1);
  const cy = clamp(b.y, box.y0, box.y1);
  let dx = b.x - cx;
  let dy = b.y - cy;
  let d2 = dx * dx + dy * dy;
  let nx;
  let ny;
  let pen;

  if (d2 > 1e-9) {
    if (d2 >= b.r * b.r) return 0;
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = b.r - d;
  } else {
    // Centre inside the box — eject along the shallowest axis.
    const left = b.x - box.x0;
    const right = box.x1 - b.x;
    const top = b.y - box.y0;
    const bottom = box.y1 - b.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) { nx = -1; ny = 0; pen = left + b.r; }
    else if (m === right) { nx = 1; ny = 0; pen = right + b.r; }
    else if (m === top) { nx = 0; ny = -1; pen = top + b.r; }
    else { nx = 0; ny = 1; pen = bottom + b.r; }
  }

  b.x += nx * pen;
  b.y += ny * pen;

  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + b.restitution) * vn;
  b.vx += nx * j;
  b.vy += ny * j;
  // A little surface friction so bodies scrub and spin along walls.
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const jt = clamp(-vt, -j * 0.3, j * 0.3);
  b.vx += tx * jt;
  b.vy += ty * jt;
  b.av -= (2 * jt) / b.r;

  return -vn;
}

/** Keep a body inside the arena's left/right/bottom edges. */
export function clampToArena(b, w, h, floor) {
  let impact = 0;
  if (b.x - b.r < 0) {
    b.x = b.r;
    if (b.vx < 0) { impact = -b.vx; b.vx *= -b.restitution; b.av += b.vy * 0.004; }
  } else if (b.x + b.r > w) {
    b.x = w - b.r;
    if (b.vx > 0) { impact = b.vx; b.vx *= -b.restitution; b.av -= b.vy * 0.004; }
  }
  if (b.y + b.r > floor) {
    b.y = floor - b.r;
    if (b.vy > 0) { impact = Math.max(impact, b.vy); b.vy *= -b.restitution; }
  }
  if (b.y - b.r < -h) b.y = -h + b.r;
  return impact;
}
