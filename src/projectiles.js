// Player projectiles. Swept (segment) collision so nothing tunnels at
// 1500 px/s, earliest-hit resolution so the nearest object always takes it.

import { CFG } from './config.js';
import { TAU, rand, spread, rgba, drawGlow, segClosest } from './util.js';
import { spark, dot, hitBurst } from './fx.js';
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
    // Called at the point of impact (or on timeout) for rounds that go off.
    this.burst = opts.burst || null;
    this.chain = !!opts.chain; // ARC: jumps on from whatever it hits
    this.jumps = opts.jumps ?? CFG.rounds.arc.jumps;
    // RECUR: how many more times this shot happens again after it lands,
    // and how long it waits at the impact point before it does.
    this.recur = opts.recur ?? 0;
    this.hold = opts.hold ?? 0;
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

    // A recurrence sits where the last one landed for a moment before it goes
    // on. That stutter is the whole read of the round: the line of light stops
    // dead, then reappears deeper into the column.
    if (!p.dead && p.hold > 0) {
      p.hold -= dt;
      dot(p.x, p.y, 0, 0, p.color, 0.06, 5);
      continue;
    }

    if (!p.dead) {
      let nx = p.x + p.vx * dt;
      let ny = p.y + p.vy * dt;

      // Boss RECALL bends shots toward the boss — helpful, and unnerving.
      if (world.boss && world.boss.recallActive && !world.boss.dead) {
        const bdx = world.boss.x - p.x;
        const bdy = world.boss.y - p.y;
        const bd = Math.hypot(bdx, bdy) || 1;
        const pull = 900 * dt;
        p.vx += (bdx / bd) * pull;
        p.vy += (bdy / bd) * pull;
        nx = p.x + p.vx * dt;
        ny = p.y + p.vy * dt;
      }

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
  const links = jumps ?? g.jumps;
  const seen = new Set();
  if (first) seen.add(first);
  let x = hx;
  let y = hy;
  let damage = g.jumpDamage;
  const r2 = g.jumpRange * g.jumpRange;

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
    scan(world.debris);
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
    damage *= g.falloff;
  }
}

/** A drawn link in an ARC chain. Pure decoration; the damage already landed. */
class Arc {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.life = 0.22;
    this.max = 0.22;
    this.dead = false;
    // one fixed kink so the bolt reads as electrical, not as a laser
    this.kink = rand(-0.3, 0.3);
  }

  update(_world, dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const t = Math.max(0, this.life / this.max);
    const mx = (this.x0 + this.x1) / 2;
    const my = (this.y0 + this.y1) / 2;
    const dx = this.x1 - this.x0;
    const dy = this.y1 - this.y0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [w, c, a] of [[7, '#59e0ff', 0.3], [2.2, '#ffffff', 0.95]]) {
      ctx.strokeStyle = rgba(c, a * t);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(this.x0, this.y0);
      ctx.quadraticCurveTo(mx - dy * this.kink, my + dx * this.kink, this.x1, this.y1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }
}

/**
 * RECUR. The shot happens again from where it landed, still travelling the way
 * it was, after a short hold. It cannot hit the same body twice in a row, so a
 * single object cannot farm it — it has to have something behind it.
 */
function recurFrom(world, p, hx, hy, dirx, diry, hit) {
  const cfg = CFG.rounds.recur;
  const a = Math.atan2(diry, dirx);
  // Clear of the body it just landed on, or the recurrence lands on the same
  // one again and the round never gets past the first thing it touches.
  const off = (hit ? hit.r : 0) + p.r + 6;
  const next = fire(world, hx + dirx * off, hy + diry * off, a, {
    damage: p.damage * cfg.falloff,
    speed: cfg.speed,
    bounces: 0,
    recur: p.recur - 1,
    hold: cfg.hold,
    color: '#c9b6ff',
    core: '#ffffff',
  });
  if (next && hit) {
    next.ignore = hit;
    next.ignoreT = cfg.hold + 0.25;
  }
  audio.thud();
}

function ricochetFx(p) {
  for (let i = 0; i < 3; i++) {
    spark(p.x, p.y, spread(180), spread(180), p.color, 0.18, 2);
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
      if (e.dead || e === p.ignore) continue;
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
  test(world.debris);

  // boss body
  const boss = world.boss;
  if (boss && !boss.dead) {
    const shieldHit = boss.castShields(ax, ay, bx, by, p.r);
    if (shieldHit && shieldHit.t < bestT) {
      bestT = shieldHit.t;
      bestKind = 'bossShield';
      bestTarget = shieldHit.shield;
    }
    const rr = boss.r + p.r;
    const c = segClosest(ax, ay, bx, by, boss.x, boss.y);
    if (c.d2 <= rr * rr && c.t < bestT) {
      bestT = c.t;
      bestKind = 'boss';
      bestTarget = boss;
    }
    // The copy of your turret is a target like anything else.
    const e = boss.echo;
    if (e && e.born >= 1) {
      const er = e.r + p.r;
      const ec = segClosest(ax, ay, bx, by, e.x, e.y);
      if (ec.d2 <= er * er && ec.t < bestT) {
        bestT = ec.t;
        bestKind = 'echo';
        bestTarget = e;
      }
    }
  }

  if (!bestKind) return;

  const hx = ax + (bx - ax) * bestT;
  const hy = ay + (by - ay) * bestT;
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const dirx = p.vx / sp;
  const diry = p.vy / sp;

  switch (bestKind) {
    case 'enemy': {
      const e = bestTarget;
      const res = e.takeHit(world, p.damage, hx, hy, dirx, diry, p.impulse);
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
      if (p.chain) chainFrom(world, e, hx, hy, p.jumps);
      if (p.recur > 0) recurFrom(world, p, hx, hy, dirx, diry, e);
      audio.hit();
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'shard': {
      bestTarget.enemy.hitShard(bestTarget.shard, p.damage, hx, hy, -dirx, -diry);
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'bossShield': {
      bestTarget.hp -= p.damage;
      hitBurst(hx, hy, -dirx, -diry, '#ffe9a8');
      audio.reflect();
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'boss': {
      // Its armour is the player's own tally. A hit that mostly gets soaked
      // has to look different from one that lands, or the ramp is invisible.
      const boss = world.boss;
      const soaked = boss.damageScale(world) < 0.55;
      boss.hurt(world, p.damage);
      boss.push(dirx, diry, CFG.boss.pushPerBolt);
      if (soaked) {
        for (let i = 0; i < 4; i++) {
          spark(hx, hy, spread(150) - dirx * 130, spread(150) - diry * 130, boss.palette.ring, 0.24, 1.8);
        }
        audio.reflect();
      } else {
        hitBurst(hx, hy, -dirx, -diry, boss.hitColor);
        audio.hit();
      }
      // An ARC round still jumps off ORDINAL into whatever it has around it.
      // A RECUR round does not: the recurrence would land on the same hull a
      // tenth of a second later and again after that, which farmed ORDINAL for
      // twice a plain bolt off one shot. There is nothing behind it to reach,
      // which is exactly the matchup the round is bad at.
      if (p.chain) chainFrom(world, null, hx, hy, p.jumps);
      endProjectile(world, p, hx, hy, true);
      return;
    }
    case 'echo': {
      world.boss.hurtEcho(world, p.damage);
      hitBurst(hx, hy, -dirx, -diry, world.boss.hitColor);
      audio.hit();
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
