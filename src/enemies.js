// The objects. Each one is a physics body with a steering brain, a way to die
// and a hand-drawn look. Nothing here knows about the rest of the game beyond
// the `world` handle it is given.

import { CFG, ENEMY_TYPES, TYPE_BY_ID, HAIRLINE, massOf } from './config.js';
import { TAU, clamp, rand, randInt, spread, pick, weightedPick, rgba, drawGlow } from './util.js';
import { explode, hitBurst, spark, shard as fxShard, ring, ripple } from './fx.js';
import { audio } from './audio.js';

/** WARDEN plate geometry — shared by drawing, hit tests and the broadphase. */
const SHARD_ORBIT = 2.15; // multiples of the core radius
export const SHARD_R = 12;

export class Enemy {
  constructor(type, x, y, opts = {}) {
    this.type = type;
    this.isDebris = !!opts.debris;
    this.counts = !this.isDebris;

    const r = opts.r || type.r;
    this.r = r;
    this.x = x;
    this.y = y;
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.angle = rand(0, TAU);
    this.av = spread(1.4);

    this.mass = massOf(type, r) * (opts.massScale || 1);
    this.invMass = 1 / this.mass;
    this.restitution = type.restitution ?? 0.6;
    this.friction = 0.3;
    this.cruise = type.speed * (opts.speedScale || rand(0.86, 1.14));

    this.maxHp = Math.round((opts.hp ?? type.hp) * (this.isDebris ? 1 : rand(0.92, 1.1)));
    this.hp = this.maxHp;
    this.armor = type.armor || 0;

    this.staged = opts.staged || false; // still above the wall
    this.attacking = false;
    this.flash = 0;
    this.dead = false;
    this.phase = rand(0, TAU);
    this.lurchTimer = rand(0, 2);
    this.ttl = this.isDebris ? rand(22, 30) : 0;
    this.spawnIn = opts.spawnIn ?? 0; // brief materialise animation

    if (type.shards) {
      this.shards = [];
      for (let i = 0; i < type.shards; i++) {
        this.shards.push({ a: (i / type.shards) * TAU, alive: true, hp: 22 });
      }
      this.shardSpin = rand(0.8, 1.6) * (Math.random() < 0.5 ? -1 : 1);
    }
  }

  /** Radius the plates orbit at, and the reach a projectile must clear. */
  get orbitR() {
    return this.r * SHARD_ORBIT;
  }

  get hitReach() {
    return this.shards ? this.orbitR + SHARD_R : this.r;
  }

  // ------------------------------------------------------------- behaviour

  steer(world, dt) {
    const t = world.time;
    let tx;
    let ty;

    if (this.staged) {
      // Funnel toward the gate mouth, then dive through it — including while
      // the doors are travelling, which is the point of the doors travelling.
      const g = world.wall;
      tx = g.gateCx + Math.sin(t * 0.6 + this.phase) * g.gateHalf * 0.55;
      ty = g.y + g.thickness + 40;
    } else {
      tx = world.shooter.x;
      ty = world.shooter.y;
      if (world.boss && world.boss.recallActive) {
        tx = world.boss.x;
        ty = world.boss.y;
      }
    }

    const wob = Math.sin(t * (0.7 + this.phase * 0.11) + this.phase) * (this.type.wobble || 1);
    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // clumsy: the heading wanders around the true bearing
    const ang = Math.atan2(dy, dx) + wob * 0.24;
    dx = Math.cos(ang);
    dy = Math.sin(ang);

    const slow = world.stasis > 0 ? 0.12 : 1;
    // Something that has already breached the turret commits to it, so the
    // corruption it causes is always clearable.
    const cruise = this.cruise * slow * (this.attacking ? 1.3 : 1);
    const speed = Math.hypot(this.vx, this.vy);
    // Steering yields to physics while a body is flying — knockback stays fun.
    const authority = clamp(1 - (speed / Math.max(cruise, 1) - 1) / 3, 0.12, 1);
    const k = (this.type.accel / 100) * authority * slow;

    this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (dy * cruise - this.vy) * clamp(k * dt, 0, 1);

    if (world.stasis > 0) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }

    // Lurchers shove themselves forward in bursts instead of gliding.
    if (this.type.lurch) {
      this.lurchTimer -= dt;
      if (this.lurchTimer <= 0 && world.stasis <= 0) {
        this.lurchTimer = rand(1.1, 2.4);
        this.vx += dx * rand(40, 90);
        this.vy += dy * rand(40, 90);
        this.av += spread(3);
      }
    }
  }

  update(world, dt) {
    if (this.spawnIn > 0) this.spawnIn = Math.max(0, this.spawnIn - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 4.5);

    if (this.shards) {
      const spin = world.stasis > 0 ? 0.12 : 1;
      for (const s of this.shards) s.a += this.shardSpin * dt * spin;
    }

    if (this.ttl > 0) {
      this.ttl -= dt;
      if (this.ttl <= 0) {
        this.dead = true;
        this.dissolved = true;
      }
    }

    if (this.staged) {
      if (this.y - this.r > world.wall.y + world.wall.thickness) {
        // Crossed the wall line — it is loose in the arena now.
        this.staged = false;
      } else if (world.wall.sealed) {
        // Doors shut with it still queued: reclaimed, and not counted.
        this.dead = true;
        this.dissolved = true;
      }
    }
  }

  // ---------------------------------------------------------------- damage

  /** A bolt stopped by one of the WARDEN's orbiting plates. */
  hitShard(s, dmg, hx, hy, nx, ny) {
    s.hp -= dmg;
    if (s.hp > 0) {
      hitBurst(hx, hy, nx, ny, '#ffffff');
      return;
    }
    s.alive = false;
    fxShard(hx, hy, spread(140), spread(140) - 40, this.type.color, 0.7, 7, 4);
    spark(hx, hy, spread(200), spread(200), this.type.glow, 0.3, 2.4);
    audio.reflect();
  }

  /**
   * @returns 'reflect' | 'hit'
   */
  takeHit(world, dmg, hx, hy, nx, ny, impulse) {
    // Prisms bounce glancing bolts; only a square-on hit lands.
    if (this.type.reflect) {
      const ndx = (hx - this.x) / this.r;
      const ndy = (hy - this.y) / this.r;
      const incidence = Math.abs(ndx * nx + ndy * ny);
      if (incidence < this.type.reflect) {
        audio.reflect();
        return 'reflect';
      }
    }

    this.applyDamage(world, dmg, nx, ny, impulse);
    hitBurst(hx, hy, -nx, -ny, this.type.glow);
    return 'hit';
  }

  applyDamage(world, dmg, nx = 0, ny = 0, impulse = 0) {
    if (this.dead) return;
    const real = Math.max(1, dmg * (1 - this.armor));
    this.hp -= real;
    this.flash = Math.min(1, this.flash + 0.5 + real / 260);
    if (impulse) {
      this.vx += nx * impulse * this.invMass;
      this.vy += ny * impulse * this.invMass;
      this.av += spread(impulse * this.invMass * 0.02);
    }
    if (this.hp <= 0) this.destroy(world);
  }

  destroy(world) {
    if (this.dead) return;
    this.dead = true;
    const t = this.type;
    explode(this.x, this.y, this.r, t.color, t.glow, this.isDebris ? 0.55 : 1);
    audio.pop(clamp(this.r / 22, 0.5, 2.4));

    if (this.isDebris) return;

    // Bloom: takes the neighbourhood with it.
    if (t.detonate) {
      ring(this.x, this.y, this.r, t.detonate.radius, 0.34, t.glow, 5);
      ring(this.x, this.y, this.r, t.detonate.radius * 0.7, 0.22, '#ffffff', 2);
      ripple(this.x, this.y, 1.6, t.detonate.radius * 3);
      world.pendingBlasts.push({
        x: this.x, y: this.y, r: t.detonate.radius,
        damage: t.detonate.damage, impulse: 260, source: this,
      });
    }

    // Splitter: children keep the parent's momentum.
    if (t.splits) {
      const child = TYPE_BY_ID[t.splits.type];
      for (let i = 0; i < t.splits.count; i++) {
        // a little over the cap: a split should not be silently swallowed
        if (world.enemies.length >= CFG.maxEnemies + 8) break;
        const a = (i / t.splits.count) * TAU + rand(0, 1);
        const sp = rand(90, 190);
        world.enemies.push(new Enemy(child, this.x + Math.cos(a) * this.r * 0.7, this.y + Math.sin(a) * this.r * 0.7, {
          vx: this.vx * 0.5 + Math.cos(a) * sp,
          vy: this.vy * 0.5 + Math.sin(a) * sp,
          staged: this.staged,
          spawnIn: 0.6,
        }));
      }
    }

    // Debris chips: destructible, pushable, do not count toward the tally.
    const n = t.debris || 0;
    for (let i = 0; i < n; i++) {
      if (world.debris.length >= CFG.maxDebris) break;
      const a = rand(0, TAU);
      const sp = rand(70, 240);
      const dr = rand(this.r * 0.16, this.r * 0.3);
      world.debris.push(new Enemy(t, this.x + Math.cos(a) * this.r * 0.5, this.y + Math.sin(a) * this.r * 0.5, {
        debris: true,
        r: dr,
        hp: 8 + dr,
        vx: this.vx * 0.4 + Math.cos(a) * sp,
        vy: this.vy * 0.4 + Math.sin(a) * sp,
        speedScale: 1.25,
      }));
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, world) {
    const t = this.type;
    const hpFrac = clamp(this.hp / this.maxHp, 0, 1);
    const s = this.spawnIn > 0 ? 1 - this.spawnIn * 0.6 : 1;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (s !== 1) ctx.scale(s, s);

    // ambient glow
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, t.glow, 0, 0, this.r * 2.1, 0.24 + this.flash * 0.5);
    ctx.globalCompositeOperation = 'source-over';

    const dim = 0.45 + hpFrac * 0.55;
    ctx.fillStyle = rgba(t.color, 0.16 * dim);
    ctx.strokeStyle = rgba(t.color, 0.55 + 0.45 * dim);
    ctx.lineWidth = Math.max(HAIRLINE, this.r * 0.09);

    switch (this.isDebris ? 'chip' : t.shape) {
      case 'shard': drawShard(ctx, this.r); break;
      case 'needle': drawNeedle(ctx, this.r); break;
      case 'hex': drawHex(ctx, this.r); break;
      case 'blob': drawBlob(ctx, this.r, this.phase, world.time); break;
      case 'bloom': drawBloom(ctx, this.r, this.phase, world.time, t); break;
      case 'plated': drawPlated(ctx, this.r, hpFrac); break;
      case 'warden': drawWardenCore(ctx, this.r); break;
      case 'prism': drawPrism(ctx, this.r); break;
      default: drawChip(ctx, this.r, this.phase);
    }

    if (this.flash > 0.01) {
      // A disc, not ctx.fill() on whatever sub-path the shape left behind —
      // several of the shapes end on an open stroke path.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(this.flash, 0, 1) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.92, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    // orbiting plates (unrotated frame)
    if (this.shards) {
      const orbit = this.orbitR;
      ctx.strokeStyle = rgba(t.color, 0.9);
      ctx.lineWidth = HAIRLINE * 2.2;
      ctx.beginPath();
      for (const sh of this.shards) {
        if (!sh.alive) continue;
        const ca = Math.cos(sh.a);
        const sa = Math.sin(sh.a);
        const sx = this.x + ca * orbit;
        const sy = this.y + sa * orbit;
        // the plate is a bar tangent to its orbit
        ctx.moveTo(sx + sa * 9, sy - ca * 9);
        ctx.lineTo(sx - sa * 9, sy + ca * 9);
      }
      ctx.stroke();
    }

    // damage arc — only on objects big enough to be worth tracking
    if (hpFrac < 0.98 && !this.isDebris && this.r >= 16) {
      ctx.strokeStyle = rgba(t.color, 0.8);
      ctx.lineWidth = HAIRLINE * 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
      ctx.stroke();
    }

    // breach marker — this is the one you have to kill to clear the corruption
    if (this.attacking) {
      const p = 0.5 + 0.5 * Math.sin(world.time * 11);
      ctx.strokeStyle = rgba('#ff2d55', 0.5 + p * 0.5);
      ctx.lineWidth = HAIRLINE * 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 10 + p * 4, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = world.time * 2 + (i / 4) * TAU;
        const rr = this.r + 18 + p * 5;
        ctx.moveTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
        ctx.lineTo(this.x + Math.cos(a) * (rr + 7), this.y + Math.sin(a) * (rr + 7));
      }
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ shapes

function drawShard(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.92, r * 0.62);
  ctx.lineTo(-r * 0.92, r * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.42);
  ctx.lineTo(0, r * 0.3);
  ctx.stroke();
}

function drawNeedle(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.9);
  ctx.lineTo(r * 0.72, 0);
  ctx.lineTo(0, r * 1.1);
  ctx.lineTo(-r * 0.72, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHex(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    const x = Math.cos(a) * r * 0.45;
    const y = Math.sin(a) * r * 0.45;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawBlob(ctx, r, phase, time) {
  ctx.beginPath();
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + Math.sin(a * 3 + time * 2.2 + phase) * 0.11);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.stroke();
}

function drawBloom(ctx, r, phase, time, t) {
  const petals = 6;
  const pulse = 1 + Math.sin(time * 3 + phase) * 0.07;
  ctx.beginPath();
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    const cx = Math.cos(a) * r * 0.58 * pulse;
    const cy = Math.sin(a) * r * 0.58 * pulse;
    ctx.moveTo(cx + r * 0.44, cy);
    ctx.arc(cx, cy, r * 0.44, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgba(t.glow, 0.85);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3 * pulse, 0, TAU);
  ctx.fill();
}

function drawPlated(ctx, r, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const plates = 8;
  for (let i = 0; i < plates; i++) {
    // plates fall off as the hull is worn down
    if (i / plates > hpFrac + 0.12) continue;
    const a0 = (i / plates) * TAU + 0.06;
    const a1 = a0 + TAU / plates - 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, a0, a1);
    ctx.arc(0, 0, r * 0.7, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.stroke();
}

function drawWardenCore(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.72 : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();
}

function drawPrism(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
}

function drawChip(ctx, r, phase) {
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase;
    const rr = r * (0.6 + ((i * 37 + phase * 13) % 1) * 0.6);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ------------------------------------------------------------- spawn logic

const FORMATIONS = ['line', 'wedge', 'column', 'arc', 'cluster', 'ring'];

/** Types that have unlocked at the current kill count. */
function availableTypes(kills) {
  return ENEMY_TYPES.filter((t) => kills >= (t.unlock || 0));
}

export function spawnOne(world, type, x, y, opts = {}) {
  const e = new Enemy(type, x, y, { staged: true, spawnIn: 1, ...opts });
  world.enemies.push(e);
  return e;
}

/** A formation queued above the screen, marching down to the gate. */
export function spawnFormation(world, kinds, count) {
  const shape = pick(FORMATIONS);
  const half = world.wall.gateHalf;
  const cx = clamp(world.wall.gateCx + spread(half * 0.5), half, world.width - half);
  const type = weightedPick(kinds);
  const gap = type.r * 2.5 + 8;
  const made = [];

  for (let i = 0; i < count; i++) {
    let ox = 0;
    let oy = 0;
    const k = i - (count - 1) / 2;
    switch (shape) {
      case 'line': ox = k * gap; oy = 0; break;
      case 'wedge': ox = k * gap; oy = -Math.abs(k) * gap * 0.8; break;
      case 'column': ox = spread(6); oy = -i * gap; break;
      case 'arc': ox = k * gap; oy = -(k * k) * gap * 0.16; break;
      case 'ring': {
        const a = (i / count) * TAU;
        ox = Math.cos(a) * gap * 1.1;
        oy = Math.sin(a) * gap * 1.1;
        break;
      }
      default: ox = spread(gap * 1.4); oy = spread(gap * 1.4);
    }
    const x = clamp(cx + ox, type.r + 4, world.width - type.r - 4);
    const y = -60 + oy - rand(0, 30);
    made.push(spawnOne(world, type, x, y, { speedScale: rand(0.94, 1.06) }));
  }
  return made;
}

export class Director {
  constructor() {
    this.timer = 1.2;
  }

  reset() {
    this.timer = 1.2;
  }

  /** Objects already loose in the arena when the simulation boots. */
  seed(world) {
    const kinds = availableTypes(0);
    // Seed the upper half of the field only. The opening beat should be
    // objects in the distance, never objects already on top of the turret.
    const wallBottom = world.wall.y + world.wall.thickness;
    const top = wallBottom + 50;
    const bottom = wallBottom + (world.shooter.y - wallBottom) * 0.55;
    for (let i = 0; i < CFG.popStart; i++) {
      const t = weightedPick(kinds);
      spawnOne(
        world,
        t,
        rand(t.r + 10, world.width - t.r - 10),
        rand(top, Math.max(top + 60, bottom)),
        { staged: false, spawnIn: rand(0.4, 1.4), vx: spread(20), vy: rand(0, 20) },
      );
    }
  }

  update(world, dt) {
    if (world.phase !== 'staging') return;
    const progress = clamp(world.kills / CFG.popRampKills, 0, 1);
    const popTarget = Math.round(CFG.popStart + (CFG.popEnd - CFG.popStart) * progress);
    const interval = CFG.spawnInterval[0] + (CFG.spawnInterval[1] - CFG.spawnInterval[0]) * progress;

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = interval * rand(0.8, 1.25);

    if (world.enemies.length >= Math.min(popTarget, CFG.maxEnemies)) return;

    const kinds = availableTypes(world.kills);
    const room = Math.min(popTarget, CFG.maxEnemies) - world.enemies.length;

    if (room >= 4 && Math.random() < CFG.formationChance) {
      spawnFormation(world, kinds, randInt(3, Math.min(6, room)));
    } else {
      const t = weightedPick(kinds);
      spawnOne(world, t, rand(t.r + 12, world.width - t.r - 12), -50 - rand(0, 40));
    }
  }
}

/** Area damage + shove, used by blooms, PULSE and the boss. */
export function applyBlast(world, blast) {
  const { x, y, r, damage, impulse, source } = blast;
  const r2 = r * r;
  const hit = (list) => {
    for (const e of list) {
      if (e.dead || e === source) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / r;
      const nx = dx / d;
      const ny = dy / d;
      e.applyDamage(world, damage * (0.35 + falloff * 0.65), nx, ny, impulse * falloff);
    }
  };
  hit(world.enemies);
  hit(world.debris);
  if (world.boss && !world.boss.dead) {
    const dx = world.boss.x - x;
    const dy = world.boss.y - y;
    const d = Math.hypot(dx, dy);
    if (d < r + world.boss.r) {
      const falloff = clamp(1 - d / (r + world.boss.r), 0, 1);
      world.boss.hurt(world, damage * falloff * 1.6);
      world.boss.push(dx / (d || 1), dy / (d || 1), impulse * falloff * 0.06);
    }
  }
}
