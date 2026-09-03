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
      const b = bodies[i];
      b._gi = i;
      b._cx = this._cx(b.x);
      b._cy = this._cy(b.y);
      this.buckets[b._cy * this.cols + b._cx].push(b);
    }
  }

  /** Calls cb(a, b) once per potentially-overlapping pair. */
  eachPair(bodies, cb) {
    const { cols, rows } = this;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      const cx = a._cx;
      const cy = a._cy;
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
  /*
   * A ceiling on the spin, which until build 211 did not exist.
   *
   * Here rather than at the impact, so every source answers to one limit: a
   * round landing on the rim, a collision's tangential friction, and anything
   * added later. See CFG.physics.maxSpin for why a physically correct rim
   * impulse needs capping at all.
   *
   * And BEFORE the step, not after it, which is where it shipped: a clamp
   * below `angle += av * dt` bounds every frame except the one it exists to
   * bound, because the frame the excess arrives on is integrated in full and
   * only then clipped. Measured, a body handed the textbook rim value of
   * 117 rad/s turned 55.9 degrees on its first substep against a cap that
   * should have held it to 8.6.
   */
  if (b.av > P.maxSpin) b.av = P.maxSpin;
  else if (b.av < -P.maxSpin) b.av = -P.maxSpin;

  /*
   * Soft speed ceiling so a chain reaction can't fling anything to infinity.
   * A body that has just been thrown is exempt for as long as it is coasting:
   * that throw is bounded and deliberate, which is the case the clamp is not
   * there to catch. See CFG.physics.thrownSpeed.
   *
   * Above the step for the same reason as the spin, and it sat below it from
   * the day it was written: a cap applied after `x += vx * dt` does not cap
   * that step, it caps the next one, so the frame the excess arrives on is
   * committed in full. Measured over a live run, bodies exceeded their own cap
   * on 1.02% of substeps -- 988 of 97,339 -- worst case a BULWARK travelling
   * 3.6x its own ceiling for a frame.
   */
  const cap = b.thrown > 0 ? P.thrownSpeed : (b.cruise || 60) * P.maxSpeedFactor;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > cap * cap) {
    const s = cap / Math.sqrt(sp2);
    b.vx *= s;
    b.vy *= s;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.angle += b.av * dt;

  const d = Math.exp(-P.linearDamping * dt);
  b.vx *= d;
  b.vy *= d;
  b.av *= Math.exp(-P.angularDamping * dt);
}

/**
 * Resolve a circle/circle contact.
 * @returns impact speed along the normal (0 if no contact / separating).
 */
/*
 * ---- and one body that does not give ground: `plow` ----
 *
 * A hurled MASS is 280hp of armoured lump crossing the field at 620, and the
 * whole read of the type is that it is coming and you are in the way. Against
 * an ordinary contact it is not: `j` is shared by inverse mass, so a MASS is
 * slowed by every MOTE it clips, and a TOW that let go inside a crowd -- which
 * is the case that happens, because a TOW arrives with a wave rather than
 * alone -- threw a wrecking ball that stopped four bodies in.
 *
 * `plow` marks a body that takes NO share of a contact: no positional
 * correction, no normal impulse, no friction, no spin. The whole of the
 * response goes to the other side, which is thrown clear at the full weight of
 * the collision rather than at the half it would have shared. That is the
 * cheapest honest model of a thing too heavy to stop, and it costs nothing on
 * any frame where nothing is plowing.
 *
 * TWO GUARDS, both load-bearing.
 *
 * It only applies against a body with mass of its own (`invMass > 0`). The
 * turret and the DECOY are static -- `invMass = 0`, `mass = Infinity` -- and a
 * plow that ignored them would let the MASS pass straight THROUGH the thing it
 * was thrown at, which is the one outcome the type must never have. Against
 * those two it is an ordinary contact and stops dead, exactly as before.
 *
 * And it is asymmetric per side: if both bodies are plowing, neither yields
 * and the contact resolves as though both were static, which returns 0 rather
 * than dividing by an inverse sum of nothing.
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
  // A plowing body is infinitely massive FOR THIS CONTACT, and only against
  // something that can actually be moved -- see the header.
  const aPlow = a.plow > 0 && b.invMass > 0;
  const bPlow = b.plow > 0 && a.invMass > 0;
  const ia = aPlow ? 0 : a.invMass;
  const ib = bPlow ? 0 : b.invMass;
  const invSum = ia + ib;
  if (invSum <= 0) return 0;

  // --- positional correction (Baumgarte) ---
  const pen = Math.max(rr - d - P.slop, 0);
  if (pen > 0) {
    const corr = (pen / invSum) * P.correction;
    a.x -= nx * corr * ia;
    a.y -= ny * corr * ia;
    b.x += nx * corr * ib;
    b.y += ny * corr * ib;
  }

  // --- normal impulse ---
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return 0;

  const e = a.restitution < b.restitution ? a.restitution : b.restitution;
  const j = (-(1 + e) * vn) / invSum;
  a.vx -= nx * j * ia;
  a.vy -= ny * j * ia;
  b.vx += nx * j * ib;
  b.vy += ny * j * ib;
  /*
   * ...and what a plow throws has to be ALLOWED to leave.
   *
   * The whole impulse lands on one side now, so the struck body comes off at
   * roughly twice what it used to -- and `integrate` clips anything not
   * `thrown` to `cruise * maxSpeedFactor`, which for a heavy body is well
   * under the speed the plow is travelling at. Clipped, it stays inside the
   * plow's radius, and a contact that cannot separate is `impactDamage` on
   * both bodies every frame at a relative 620: measured before this line, a
   * MASS and the BULWARK it hit deleted each other in four frames.
   *
   * Short, because it is a shove out of the way and not a throw across the
   * field -- long enough to clear the plow, not long enough to stop the body
   * coming back.
   */
  if (aPlow) b.thrown = Math.max(b.thrown || 0, P.plowThrow);
  else if (bPlow) a.thrown = Math.max(a.thrown || 0, P.plowThrow);

  // --- tangential friction -> spin ---
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  const mu = Math.sqrt(a.friction * b.friction);
  let jt = -vt / invSum;
  const maxJt = j * mu;
  jt = clamp(jt, -maxJt, maxJt);
  a.vx -= tx * jt * ia;
  a.vy -= ty * jt * ia;
  b.vx += tx * jt * ib;
  b.vy += ty * jt * ib;
  // Δω = -2·jt·invMass / r for a uniform disc (I = ½mr²).
  if (ia > 0) a.av -= (2 * jt * ia) / a.r;
  if (ib > 0) b.av -= (2 * jt * ib) / b.r;

  return -vn;
}

/** Mutual damage produced by an impact, before per-body armour. */
/**
 * Where a round actually met a body, and how square-on it arrived.
 *
 * ---- why this is not just `(hit - centre)` ----
 *
 * `resolveSegment` hands `takeHit` the closest point on the round's ONE-FRAME
 * STEP to the body's centre, clamped to the ends of that step. That is not a
 * point on the surface and it is not reliably inside the body: measured, a
 * bolt fired dead-centre at a BULWARK reports a "contact point" 48 units short
 * of the centre along the incoming line -- three units OUTSIDE a 45-unit body
 * -- because the step ended before it got there. The component of that vector
 * ALONG the round's travel is sub-frame phase and nothing else.
 *
 * The component ACROSS the travel is exact, and is the one number worth
 * having: the perpendicular distance from the centre to the round's line is
 * the same for every point on that line, so the clamp cannot corrupt it.
 * Measured against deliberate offsets it tracks the impact parameter to the
 * digit -- b = 0.25r on a LURCHER reads 6.00 of 24, b = 0.5r on a BULWARK
 * reads 22.50 of 45.
 *
 * So everything here is derived from that one quantity plus the travel
 * direction and the body's radius, and nothing is taken from the hit point
 * except its lateral offset.
 *
 * Returns the signed impact parameter `b`, the outward unit normal at the
 * entry point, that point itself, and `incidence` -- 1 for a shot through the
 * centre, 0 for a graze along the rim.
 *
 * @param dirx,diry the round's unit travel direction
 */
export function contactAt(e, hx, hy, dirx, diry, pr = 0) {
  /*
   * On the circle the HIT TEST actually used, which is `e.r + p.r` and not
   * `e.r`: two discs touch when their centres are that far apart, so that is
   * the circle the line of centres -- the collision normal -- is defined on.
   *
   * Deriving it on `e.r` alone was wrong twice over. It under-turned every
   * bounce, because the normal was taken at the wrong point on the arc; and
   * because |b| runs up to `e.r + p.r`, the clamp flattened the outer band of
   * the aperture to `incidence` exactly 0 and a normal square to the travel,
   * so the grazing shots that need the geometry most got none of it. Measured
   * on a PRISM (r 20) with a BOLT (r 4.2): under-turns of 14.5 degrees at
   * b = 0.6r rising to 27 at 0.9r, and zero deflection across the outer fifth.
   */
  const R = (e.r || 1) + pr;
  // Still clamped, because |b| can reach R exactly and an unclamped
  // sqrt(R^2 - b^2) goes NaN on the rounding -- and a NaN velocity loses the
  // body for the rest of the run rather than throwing.
  const b = clamp((hx - e.x) * -diry + (hy - e.y) * dirx, -R, R);
  const depth = Math.sqrt(Math.max(0, R * R - b * b));
  const ox = -diry * b - dirx * depth;
  const oy = dirx * b - diry * depth;
  const nx = ox / R;
  const ny = oy / R;
  return {
    b,
    nx,
    ny,
    // Where the round's own centre sits at the moment of contact: what a
    // bounce should be placed at.
    cx: e.x + ox,
    cy: e.y + oy,
    // ...and where that is on the body's surface, which is what the picture
    // of the impact wants.
    x: e.x + nx * (e.r || 1),
    y: e.y + ny * (e.r || 1),
    incidence: depth / R,
  };
}

export function impactDamage(a, b, impact) {
  if (impact <= P.collisionThreshold) return 0;
  const invSum = a.invMass + b.invMass;
  if (invSum <= 0) return 0;
  const reduced = 1 / invSum;
  return clamp((impact - P.collisionThreshold) * reduced * P.collisionDamage, 0, 300);
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
