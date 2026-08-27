// Player projectiles. Swept (segment) collision so nothing tunnels at
// 1500 px/s, earliest-hit resolution so the nearest object always takes it.

import { CFG } from './config.js';
import { TAU, rand, spread, rgba, drawGlow, segClosest, drawBolt } from './util.js';
import { spark, dot } from './fx.js';
import { SHARD_R } from './enemies.js';
import { audio } from './audio.js';

class Projectile {
  constructor(x, y, vx, vy, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = opts.r ?? CFG.bolt.r;
    this.damage = opts.damage ?? CFG.bolt.damage;
    this.impulse = opts.impulse ?? CFG.bolt.impulse;
    this.life = opts.life ?? CFG.bolt.life;
    this.bounces = opts.bounces ?? CFG.bolt.bounces;
    this.color = opts.color || '#bff4ff';
    this.core = opts.core || '#ffffff';
    this.trail = opts.trail ?? 0.024;
    /*
     * Thrown by SPIRAL's sweep rather than aimed. It is the same round with
     * the same upgrades -- this only changes how it is drawn, so a field full
     * of them reads as one sweep going out rather than as fifty unrelated
     * shots that happen to have started at the same place.
     */
    this.spun = !!opts.spun;
    /*
     * The marker's phase, off the launch bearing rather than off Math.random.
     *
     * A decorative `rand(0, TAU)` here draws once per projectile, and a
     * projectile is the most common thing this game makes -- it moved
     * ORDINAL's canonical hash from 117409503 to -701545965 the moment it
     * went in. This is deterministic, free, and better besides: the strokes
     * line up with the way the round is travelling.
     */
    this.spin = Math.atan2(vy, vx);
    // Called at the point of impact (or on timeout) for rounds that go off.
    this.burst = opts.burst || null;
    this.chain = !!opts.chain; // ARC: jumps on from whatever it hits
    this.jumps = opts.jumps ?? CFG.rounds.arc.jumps;
    // DOUBLE TAP / TRIPLE TAP: a follow-up round waits this long at the
    // muzzle before it sets off.
    this.hold = opts.hold ?? 0;
    // SPINE: bodies it carries on through, and what it keeps of its damage
    // each time it does.
    this.pierce = opts.pierce ?? 0;
    this.pierceFade = opts.pierceFade ?? 1;
    // OVERSTUFFED: bodies this round may bounce off instead of stopping in,
    // and what it keeps of its damage each time it does. A rebound is not a
    // pierce — it comes back off the surface rather than out the far side.
    this.rebound = opts.rebound ?? 0;
    this.reboundFade = opts.reboundFade ?? 1;
    // RAILED: the fraction of a body's armour this round simply ignores.
    this.shred = opts.shred ?? 0;
    // Rounds that leave a mark on what they hit rather than only hurting it.
    this.onHit = opts.onHit || null;
    this.dead = false;
    this.ignore = null; // body we just reflected off
    this.ignoreT = 0;
  }
}


/**
 * Advance every projectile and resolve what it runs into.
 * Order of precedence is purely "whichever is nearest along the path".
 */
/** End a projectile. `impacted` is false only when it simply leaves the field. */
function endProjectile(world, p, x, y, impacted) {
  p.dead = true;
  if (impacted && p.burst) p.burst(world, x, y);
}

export function updateProjectiles(world, dt) {
  const list = world.projectiles;
  const W = world.width;

  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    // a timed round goes off wherever it happens to be
    if (p.life <= 0) endProjectile(world, p, p.x, p.y, true);
    if (p.ignoreT > 0) p.ignoreT -= dt; else p.ignore = null;

    if (!p.dead && p.hold > 0) {
      p.hold -= dt;
      dot(p.x, p.y, 0, 0, p.color, 0.06, 5);
      continue;
    }

    if (!p.dead) {
      let nx = p.x + p.vx * dt;
      let ny = p.y + p.vy * dt;

      resolveSegment(world, p, p.x, p.y, nx, ny);
      if (!p.dead) {
        p.x = nx;
        p.y = ny;

        // arena-edge ricochet
        if (p.x < p.r && p.vx < 0) {
          if (p.bounces > 0) { p.bounces--; p.x = p.r; p.vx = -p.vx; ricochetFx(p); }
          else endProjectile(world, p, p.x, p.y, true);
        } else if (p.x > W - p.r && p.vx > 0) {
          if (p.bounces > 0) { p.bounces--; p.x = W - p.r; p.vx = -p.vx; ricochetFx(p); }
          else endProjectile(world, p, p.x, p.y, true);
        }
        if (p.y < -world.stageHeight || p.y > world.floorY + 60) p.dead = true;
      }
    }

    if (p.dead) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

/**
 * ARC. Jumps from what it hit to the nearest thing it has not touched yet, and
 * on again, drawing the link each time. Each link is a little weaker than the
 * last, so a long chain is worth setting up but never free.
 */
function chainFrom(world, first, hx, hy, jumps) {
  const g = CFG.rounds.arc;
  const up = world.up;
  const links = jumps ?? g.jumps;
  // SUPERCONDUCTOR sets what a link keeps; LONG LEAD sets how far it reaches.
  const fall = up.arcFalloff || g.falloff;
  const range = g.jumpRange * up.arcRange;
  const seen = new Set();
  if (first) seen.add(first);
  let x = hx;
  let y = hy;
  let damage = g.jumpDamage;
  const r2 = range * range;

  for (let jump = 0; jump < links; jump++) {
    let best = null;
    let bestD = r2;
    const scan = (list) => {
      for (const e of list) {
        if (e.dead || seen.has(e)) continue;
        const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d2 < bestD) { bestD = d2; best = e; }
      }
    };
    scan(world.enemies);
    if (!best) break;

    seen.add(best);
    world.effects.push(new Arc(x, y, best.x, best.y));
    for (let i = 0; i < 3; i++) {
      spark(best.x, best.y, spread(180), spread(180), '#9be7ff', 0.2, 2);
    }
    best.applyDamage(world, damage);
    audio.reflect();
    x = best.x;
    y = best.y;
    damage *= fall;
  }
}

/** A drawn link in an ARC chain. Pure decoration; the damage already landed. */
/**
 * One hop of an ARC round, as lightning rather than as a bent laser.
 *
 * It was a quadratic curve with a single fixed kink in it, which is a shape
 * that reads as a whip or a tracer -- one smooth bow, no matter how far it had
 * to reach. The bolt routine in util.js is the one DYNAMO's circuit uses:
 * segments and amplitude scaled to the span, two octaves of offset, and forks.
 *
 * The seed is fixed per hop and the clock is stepped, so a hop crackles for the
 * fifth of a second it lives rather than sitting still or smearing.
 */
class Arc {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.life = 0.22;
    this.max = 0.22;
    this.dead = false;
    this.seed = rand(0, 500);
    this.t = 0;
  }

  update(_world, dt) {
    this.life -= dt;
    this.t += dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const k = Math.max(0, this.life / this.max);
    ctx.globalCompositeOperation = 'lighter';
    drawBolt(ctx, this.x0, this.y0, this.x1, this.y1, {
      glow: '#59e0ff', hot: '#bff0ff', alpha: k, width: 0.7,
      seed: this.seed, tick: Math.floor(this.t * 26), forks: 2, amp: 0.8,
    });
    ctx.globalCompositeOperation = 'source-over';
  }
}

function ricochetFx(p) {
  for (let i = 0; i < 3; i++) {
    spark(p.x, p.y, spread(180), spread(180), p.color, 0.18, 2);
  }
}

/**
 * Break every chunk of wreckage the segment passes through, up to `limit`
 * along it. Walks downward from the length captured on entry, so the pieces a
 * chunk sheds are appended past the end and are never re-broken by the same
 * round.
 */
function shatterAlong(world, p, ax, ay, bx, by, limit) {
  const list = world.debris;
  if (!list || !list.length) return;
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const dirx = p.vx / sp;
  const diry = p.vy / sp;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (c.dead) continue;
    const rr = c.r + p.r;
    if (Math.min(ax, bx) - rr > c.x || Math.max(ax, bx) + rr < c.x) continue;
    if (Math.min(ay, by) - rr > c.y || Math.max(ay, by) + rr < c.y) continue;
    const hit = segClosest(ax, ay, bx, by, c.x, c.y);
    if (hit.d2 > rr * rr || hit.t > limit) continue;
    c.shatter(world, dirx, diry);
  }
}

/** Find and apply the nearest thing hit along ax,ay -> bx,by. */
function resolveSegment(world, p, ax, ay, bx, by) {
  let bestT = 2;
  let bestKind = null;
  let bestTarget = null;

  const test = (list) => {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      // `spent`: finished with, and drawn only so its ending can be watched.
      // A round passes through it the way it passes through energy.
      if (e.dead || e.spent || e === p.ignore) continue;
      // Reach covers orbiting plates, which live outside the core radius.
      const reach = e.hitReach + p.r;
      if (Math.min(ax, bx) - reach > e.x || Math.max(ax, bx) + reach < e.x) continue;
      if (Math.min(ay, by) - reach > e.y || Math.max(ay, by) + reach < e.y) continue;

      if (e.shards) {
        const sr = SHARD_R + p.r;
        const orbit = e.orbitR;
        for (const s of e.shards) {
          if (!s.alive) continue;
          const sx = e.x + Math.cos(s.a) * orbit;
          const sy = e.y + Math.sin(s.a) * orbit;
          const cs = segClosest(ax, ay, bx, by, sx, sy);
          if (cs.d2 <= sr * sr && cs.t < bestT) {
            bestT = cs.t;
            bestKind = 'shard';
            bestTarget = { enemy: e, shard: s };
          }
        }
      }

      /*
       * Balls a SCION left on this body. Same contest as the plates: they are
       * on the outside, so a round that reaches one stops there, and taking
       * one off is a shot you can choose to take instead of firing into a
       * body that is healing faster than you are hurting it.
       */
      if (e.graftCount) {
        const gr = CFG.graft.ball + p.r;
        const orbit = e.graftR;
        for (const g of e.grafts) {
          if (!g.alive) continue;
          const gx = e.x + Math.cos(g.a) * orbit;
          const gy = e.y + Math.sin(g.a) * orbit;
          const cg = segClosest(ax, ay, bx, by, gx, gy);
          if (cg.d2 <= gr * gr && cg.t < bestT) {
            bestT = cg.t;
            bestKind = 'graft';
            bestTarget = { enemy: e, graft: g };
          }
        }
      }

      const rr = e.r + p.r;
      const c = segClosest(ax, ay, bx, by, e.x, e.y);
      if (c.d2 <= rr * rr && c.t < bestT) {
        bestT = c.t;
        bestKind = 'enemy';
        bestTarget = e;
      }
    }
  };
  test(world.enemies);
  // Energy is not in the way of anything. A round passes straight through it:
  // it is not a target, it is the thing you were shooting *for*.

  // Wreckage breaks but never blocks. It is resolved after the contest for
  // bestT and takes no part in it, so a chunk drifting in front of a BULWARK
  // can never eat the round meant for the BULWARK — it just comes apart as
  // the round goes past. Capped at bestT so a round does not shatter what is
  // behind whatever it stopped in.
  shatterAlong(world, p, ax, ay, bx, by, Math.min(bestT, 1));

  if (!bestKind) return;

  const hx = ax + (bx - ax) * bestT;
  const hy = ay + (by - ay) * bestT;
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const dirx = p.vx / sp;
  const diry = p.vy / sp;

  switch (bestKind) {
    case 'enemy': {
      const e = bestTarget;
      const res = e.takeHit(world, p.damage, hx, hy, dirx, diry, p.impulse, p.shred);
      if (res === 'reflect') {
        // mirror the velocity about the prism's surface normal
        let nx = (hx - e.x) / (e.r || 1);
        let ny = (hy - e.y) / (e.r || 1);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const d = p.vx * nx + p.vy * ny;
        p.vx = (p.vx - 2 * d * nx) * 0.92;
        p.vy = (p.vy - 2 * d * ny) * 0.92;
        p.x = hx + nx * (p.r + 1);
        p.y = hy + ny * (p.r + 1);
        p.ignore = e;
        p.ignoreT = 0.08;
        p.color = '#ffd6ff';
        e.flash = Math.max(e.flash, 0.35);
        for (let i = 0; i < 4; i++) spark(hx, hy, spread(220), spread(220), '#e0aaff', 0.22, 2.2);
        return;
      }
      if (p.onHit) p.onHit(world, e, hx, hy);
      if (p.chain) chainFrom(world, e, hx, hy, p.jumps);
      audio.hit();
      // A piercing round carries on out the other side, weaker, ignoring what
      // it just went through for long enough not to hit it twice.
      if (p.pierce > 0) {
        p.pierce--;
        p.damage *= p.pierceFade;
        p.ignore = e;
        p.ignoreT = 0.06;
        for (let i = 0; i < 3; i++) spark(hx, hy, spread(140), spread(140), p.color, 0.18, 1.8);
        return;
      }
      // ...and a rebounding one comes back off it, the way it comes off a
      // wall. Same normal-mirror as a PRISM reflection, except this one hurt
      // the thing it bounced off on the way past.
      if (p.rebound > 0) {
        p.rebound--;
        p.damage *= p.reboundFade;
        let nx = (hx - e.x) / (e.r || 1);
        let ny = (hy - e.y) / (e.r || 1);
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        const d = p.vx * nx + p.vy * ny;
        p.vx -= 2 * d * nx;
        p.vy -= 2 * d * ny;
        p.x = hx + nx * (p.r + 1);
        p.y = hy + ny * (p.r + 1);
        p.ignore = e;
        p.ignoreT = 0.08;
        ricochetFx(p);
        return;
      }
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'shard': {
      bestTarget.enemy.hitShard(bestTarget.shard, p.damage, hx, hy, -dirx, -diry);
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'graft': {
      bestTarget.enemy.hitGraft(bestTarget.graft, p.damage, hx, hy);
      endProjectile(world, p, hx, hy, true);
      return;
    }
    default: {
      for (let i = 0; i < 3; i++) {
        spark(hx, hy, spread(160) - dirx * 90, spread(160) - diry * 90, '#8fb6d8', 0.2, 1.8);
      }
      endProjectile(world, p, hx, hy, true);
    }
  }
}

export function drawProjectiles(ctx, world) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const p of world.projectiles) {
    // Two flat strokes read as a tapered tracer for a fraction of the cost of
    // a per-projectile gradient.
    const tx = p.x - p.vx * p.trail;
    const ty = p.y - p.vy * p.trail;
    ctx.strokeStyle = rgba(p.color, 0.28);
    ctx.lineWidth = p.r * 1.7;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = rgba(p.color, 0.9);
    ctx.lineWidth = p.r * 0.9;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * p.trail * 0.45, p.y - p.vy * p.trail * 0.45);
    ctx.stroke();

    drawGlow(ctx, p.color, p.x, p.y, p.r * 4.2, 0.75);
    /*
     * A spun round carries the sweep's own colour as a husk around whatever
     * it actually is: the core stays the round's, so BOLT is still blue and
     * RIME still ice, and the orange says where it came from. Two short
     * cross-strokes turning with the round, rather than a ring, because a
     * ring at this size is a dot and reads as nothing.
     */
    if (p.spun) {
      const a = p.spin + world.time * 9;
      drawGlow(ctx, '#ff7a1a', p.x, p.y, p.r * 5.6, 0.4);
      ctx.strokeStyle = rgba('#ffb066', 0.75);
      ctx.lineWidth = p.r * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const t2 = a + (i * Math.PI) / 2;
        const c = Math.cos(t2) * p.r * 1.5;
        const sn = Math.sin(t2) * p.r * 1.5;
        ctx.moveTo(p.x - c, p.y - sn);
        ctx.lineTo(p.x + c, p.y + sn);
      }
      ctx.stroke();
    }
    ctx.fillStyle = p.core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.62, 0, TAU);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';
}

/** Muzzle spawn helper shared by the turret and the abilities. */
export function fire(world, x, y, angle, opts = {}) {
  const speed = opts.speed ?? CFG.bolt.speed;
  const p = new Projectile(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, opts);
  world.projectiles.push(p);
  for (let i = 0; i < 2; i++) {
    spark(x, y, Math.cos(angle) * rand(60, 200) + spread(70), Math.sin(angle) * rand(60, 200) + spread(70), p.color, 0.14, 2);
  }
  dot(x, y, 0, 0, p.color, 0.09, 9);
  return p;
}

/** Barrel travel is limited to the forward hemisphere. */
export function clampAim(a) {
  const up = -Math.PI / 2;
  const limit = CFG.shooter.aimClamp;
  // fold the angle into [-PI, PI) relative to straight up before clamping
  let d = (a - up) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return up + (d < -limit ? -limit : d > limit ? limit : d);
}
