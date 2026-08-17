// The objects. Each one is a physics body with a steering brain, a way to die
// and a hand-drawn look. Nothing here knows about the rest of the game beyond
// the `world` handle it is given.

import { CFG, ENEMY_TYPES, TYPE_BY_ID, ROUTES, HAIRLINE, massOf } from './config.js';
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

    this.harmless = !!type.harmless;
    if (this.harmless) this.counts = false;
    this.ward = 0; // damage reduction granted by a HERALD
    this.wardT = 0; // lapses unless refreshed
    this.barbs = null; // BARB rounds currently sunk into it
    this.tether = null; // the other half of a TOW, if any
    // Every object picks its own way across the field.
    this.route = opts.route || weightedPick(ROUTES);
    this.routeSide = Math.random() < 0.5 ? -1 : 1;
    this.routeScale = rand(0.7, 1.25);
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = 0;
    this.stagedFor = 0;
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

  /** Aimless bodies: a slow random walk with no destination at all. */
  wander(world, dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = rand(1.6, 4.2);
      this.wanderAngle += spread(1.9);
    }
    const slow = world.stasis > 0 ? 0.12 : 1;
    const cruise = this.cruise * slow;
    const k = (this.type.accel / 100) * slow * 0.9;
    const dx = Math.cos(this.wanderAngle);
    const dy = Math.sin(this.wanderAngle);
    this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (dy * cruise - this.vy) * clamp(k * dt, 0, 1);
    if (world.stasis > 0) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  steer(world, dt) {
    if (this.harmless) {
      this.wander(world, dt);
      return;
    }

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
      // A DECOY outranks the turret: that is the whole ability.
      if (world.decoy && !world.decoy.dead) {
        tx = world.decoy.x;
        ty = world.decoy.y;
      }
      // ORDINAL's RECALL outranks both.
      if (world.boss && world.boss.recallActive) {
        tx = world.boss.x;
        ty = world.boss.y;
      }
    }

    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;

    // Route offset: swing wide of the true bearing at long range and fold in
    // as the object closes, so each one arrives by its own arc.
    if (!this.staged) {
      const r = this.route;
      const reach = clamp(d / 520, 0, 1) ** r.commit;
      let lateral = r.width * this.routeScale * this.routeSide * reach;
      if (r.weave) lateral *= Math.sin(t * r.weave + this.phase);
      tx += -dy * lateral;
      ty += dx * lateral;
      dx = tx - this.x;
      dy = ty - this.y;
      const nd = Math.hypot(dx, dy) || 1;
      dx /= nd;
      dy /= nd;
    }

    const wob = Math.sin(t * (0.7 + this.phase * 0.11) + this.phase) * (this.type.wobble || 1);
    // clumsy: the heading wanders around the true bearing
    const ang = Math.atan2(dy, dx) + wob * 0.24;
    dx = Math.cos(ang);
    dy = Math.sin(ang);

    const slow = world.stasis > 0 ? 0.12 : 1;
    // Something that has already breached the turret commits to it, so the
    // corruption it causes is always clearable.
    let cruise = this.cruise * slow * (this.attacking ? 1.3 : 1);
    // Once nothing more will be released, whatever is left closes in, so the
    // tail of the run is never a hunt across an empty field.
    if (releasesLeft(world) <= 0) cruise *= 1.45;
    // loiterers hang back at mid range before making their run
    if (this.route.dawdle && !this.staged) {
      const dist = Math.hypot(world.shooter.x - this.x, world.shooter.y - this.y);
      if (dist > 260) cruise *= this.route.dawdle;
    }
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
    if (this.wardT > 0) {
      this.wardT -= dt;
      if (this.wardT <= 0) this.ward = 0;
    }

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

    if (this.type.ward) this.wardNearby(world, dt);
    if (this.type.eat) this.feed(world);
    this.updateBarbs(world, dt);

    if (this.staged) {
      // A wedged object above the wall would stall the run forever, since the
      // gate only seals once every released object has been destroyed.
      this.stagedFor += dt;
      if (this.stagedFor > 10) {
        const g = world.wall;
        const dx = g.gateCx - this.x;
        const dy = g.y + g.thickness + 40 - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx += (dx / d) * 130 * dt;
        this.vy += (dy / d) * 130 * dt;
      }
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

  // ------------------------------------------------------------ behaviours

  /**
   * HERALD. Covers the nearest few hostiles: while covered they take a
   * fraction of incoming damage, and both the thread and the shell are drawn,
   * so the beacon reads as the reason nothing else is dying.
   */
  wardNearby(world, dt) {
    const cfg = this.type.ward;
    this.warded = this.warded || [];
    this.warded.length = 0;
    if (this.staged || this.spawnIn > 0) return;
    const r2 = cfg.radius * cfg.radius;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.harmless || e.staged) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      if (dx * dx + dy * dy > r2) continue;
      this.warded.push(e);
      // Refreshed every frame it is in range, so it lapses the moment the
      // beacon dies rather than needing a teardown pass.
      e.ward = Math.max(e.ward || 0, cfg.reduction);
      e.wardT = 0.12;
      if (this.warded.length >= cfg.max) break;
    }
    this.wardSpin = (this.wardSpin || 0) + dt * 1.4;
  }

  /**
   * GLUT. Eats fragments off the floor and gets bigger for it. Radius, mass
   * and hit points all move together, so a fed one really is a different
   * object by the time it arrives.
   */
  feed(world) {
    const cfg = this.type.eat;
    if (this.staged || this.spawnIn > 0) return;
    if (this.r >= cfg.maxR) return;
    for (const d of world.debris) {
      if (d.dead) continue;
      const reach = this.r + d.r + cfg.reach;
      const dx = d.x - this.x;
      const dy = d.y - this.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      d.dead = true;
      d.dissolved = true; // eaten, not destroyed: it must not score
      this.r = Math.min(cfg.maxR, this.r + cfg.growth);
      this.mass = massOf(this.type, this.r);
      this.invMass = 1 / this.mass;
      this.maxHp += cfg.hpPer;
      this.hp += cfg.hpPer;
      this.fed = (this.fed || 0) + 1;
      for (let i = 0; i < 4; i++) {
        spark(d.x, d.y, (this.x - d.x) * 2.2, (this.y - d.y) * 2.2, this.type.glow, 0.3, 2);
      }
      audio.pop(0.5);
      if (this.r >= cfg.maxR) break;
    }
  }

  /** BARB rounds sunk into this body, biting on their own clock. */
  updateBarbs(world, dt) {
    if (!this.barbs || !this.barbs.length) return;
    const cfg = CFG.rounds.barb;
    for (let i = this.barbs.length - 1; i >= 0; i--) {
      const b = this.barbs[i];
      b.life -= dt;
      b.next -= dt;
      if (b.next <= 0) {
        b.next = cfg.tick;
        spark(this.x + Math.cos(b.a) * this.r, this.y + Math.sin(b.a) * this.r,
          spread(70), spread(70), '#ff9f1c', 0.22, 1.8);
        this.applyDamage(world, cfg.tickDamage);
        if (this.dead) return;
      }
      if (b.life <= 0) {
        this.barbs[i] = this.barbs[this.barbs.length - 1];
        this.barbs.pop();
      }
    }
  }

  /** @returns true if it took the barb. */
  addBarb(angle) {
    const cfg = CFG.rounds.barb;
    this.barbs = this.barbs || [];
    if (this.barbs.length >= cfg.maxPer) return false;
    this.barbs.push({ a: angle, life: cfg.duration, next: cfg.tick });
    return true;
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
    // A HERALD's cover, if one is refreshing it. It lapses a frame after the
    // beacon stops covering, which is what makes killing the beacon feel like
    // the answer rather than a statistic.
    const ward = this.wardT > 0 ? (this.ward || 0) : 0;
    const real = Math.max(1, dmg * (1 - this.armor) * (1 - ward));
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
      // Children are glitch-causing objects too, so they come out of the same
      // quota. Near the end of the run a splitter simply sheds fewer.
      const count = Math.min(t.splits.count, releasesLeft(world));
      for (let i = 0; i < count; i++) {
        // a little over the cap: a split should not be silently swallowed
        if (hostileCount(world) >= CFG.maxEnemies + 8) break;
        const a = (i / count) * TAU + rand(0, 1);
        const sp = rand(90, 190);
        world.enemies.push(new Enemy(child, this.x + Math.cos(a) * this.r * 0.7, this.y + Math.sin(a) * this.r * 0.7, {
          vx: this.vx * 0.5 + Math.cos(a) * sp,
          vy: this.vy * 0.5 + Math.sin(a) * sp,
          staged: this.staged,
          spawnIn: 0.6,
        }));
        world.released++;
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
      case 'herald': drawHerald(ctx, this.r, this.wardSpin || 0); break;
      case 'glut': drawGlut(ctx, this.r, this.fed || 0, this.phase, world.time); break;
      case 'tow': drawTowHead(ctx, this.r); break;
      case 'mass': drawTowMass(ctx, this.r, hpFrac); break;
      case 'drift': drawDrift(ctx, this.r, this.phase, world.time); break;
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

    // The cable to the other half of a TOW pair, and the shell/threads of a
    // HERALD's cover. Both are drawn in world space so they read as links
    // between bodies rather than decoration on one.
    if (this.tether && !this.tether.other.dead) {
      const o = this.tether.other;
      ctx.strokeStyle = rgba('#8fa9c4', 0.75);
      ctx.lineWidth = HAIRLINE * 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      // links, so the cable does not read as a laser
      const dx = o.x - this.x;
      const dy = o.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const n = Math.min(9, Math.max(3, Math.round(d / 22)));
      ctx.strokeStyle = rgba(t.glow, 0.5);
      ctx.lineWidth = HAIRLINE * 3.2;
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const px = this.x + dx * k;
        const py = this.y + dy * k;
        ctx.moveTo(px - (dy / d) * 3, py + (dx / d) * 3);
        ctx.lineTo(px + (dy / d) * 3, py - (dx / d) * 3);
      }
      ctx.stroke();
    }

    if (this.warded && this.warded.length) {
      ctx.strokeStyle = rgba(t.glow, 0.34);
      ctx.lineWidth = HAIRLINE * 1.4;
      ctx.beginPath();
      for (const e of this.warded) {
        if (e.dead) continue;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
    }

    // Covered by a HERALD: a shell, so the reason it is shrugging off hits is
    // visible on the thing shrugging them off.
    if (this.wardT > 0 && this.ward > 0) {
      const pulse = 0.45 + 0.3 * Math.sin(world.time * 5 + this.phase);
      ctx.strokeStyle = rgba('#7cffb2', pulse);
      ctx.lineWidth = HAIRLINE * 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 7, 0, TAU);
      ctx.stroke();
    }

    // BARB rounds sunk into it, and the bite they are about to take
    if (this.barbs && this.barbs.length) {
      ctx.strokeStyle = rgba('#ff9f1c', 0.9);
      ctx.lineWidth = HAIRLINE * 2.2;
      ctx.beginPath();
      for (const b of this.barbs) {
        const ca = Math.cos(b.a);
        const sa = Math.sin(b.a);
        ctx.moveTo(this.x + ca * (this.r - 3), this.y + sa * (this.r - 3));
        ctx.lineTo(this.x + ca * (this.r + 9), this.y + sa * (this.r + 9));
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

/** HERALD: an open ring with a spinning inner cross — visibly a transmitter. */
function drawHerald(ctx, r, spin) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.5, Math.PI - 0.5);
  ctx.arc(0, 0, r, Math.PI + 0.5, TAU - 0.5);
  ctx.stroke();
  ctx.save();
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** GLUT: a lumpy sac whose seams multiply as it eats. */
function drawGlut(ctx, r, fed, phase, t) {
  const lobes = 7;
  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * TAU;
    const bulge = 1 + Math.sin(a * 3 + phase + t * 0.8) * 0.1;
    const x = Math.cos(a) * r * bulge;
    const y = Math.sin(a) * r * bulge;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // one seam per mouthful, so how fed it is reads at a glance
  const seams = Math.min(9, fed);
  if (!seams) return;
  ctx.beginPath();
  for (let i = 0; i < seams; i++) {
    const a = (i / 9) * TAU + phase;
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
  }
  ctx.stroke();
}

/** TOW head: a hook. */
function drawTowHead(ctx, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, -2.2, 1.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.cos(1.1) * r, Math.sin(1.1) * r);
  ctx.lineTo(Math.cos(1.1) * r * 1.5, Math.sin(1.1) * r * 0.4);
  ctx.stroke();
}

/** The mass it drags: a banded weight. */
function drawTowMass(ctx, r, hpFrac) {
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
  for (let i = -1; i <= 1; i++) {
    const y = i * r * 0.42;
    const half = Math.sqrt(Math.max(0, r * r - y * y)) * 0.82;
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
  }
  ctx.globalAlpha = 0.35 + hpFrac * 0.4;
  ctx.stroke();
  ctx.globalAlpha = 1;
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

/** Soft, dashed and unhurried — legibly not a threat. */
function drawDrift(ctx, r, phase, time) {
  ctx.setLineDash([r * 0.5, r * 0.42]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  const pulse = 0.6 + 0.4 * Math.sin(time * 1.3 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.36 * pulse, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = phase + time * 0.35 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.1, 0, TAU);
    ctx.fill();
  }
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

/**
 * Objects that actually count against the spawn budget. Harmless drift is
 * tracked separately so raising its population can never slow the run down.
 */
export function hostileCount(world) {
  let n = 0;
  for (const e of world.enemies) if (!e.dead && !e.harmless) n++;
  return n;
}

function driftCount(world) {
  let n = 0;
  for (const e of world.enemies) if (!e.dead && e.harmless) n++;
  return n;
}

/** Types that have unlocked at the current kill count. */
function availableTypes(kills) {
  // weight 0 means "never rolled for": drift and a TOW's mass are both placed
  // by dedicated spawners, and weightedPick's fallback could otherwise return
  // one of them.
  return ENEMY_TYPES.filter((t) => t.weight > 0 && kills >= (t.unlock || 0));
}

/**
 * Put one rolled type on the field. A TOW is the only type that is two bodies,
 * so it is the only one that needs dispatching.
 */
function release(world, type, x, y, opts) {
  if (type.tows) return spawnTow(world, x, y, opts)[0];
  return spawnOne(world, type, x, y, opts);
}

/**
 * Release one object into the run. Exactly `CFG.killGoal` glitch-causing
 * objects exist across a whole run, so every hostile creation is counted here
 * and the director stops once the quota is spent.
 */
export function spawnOne(world, type, x, y, opts = {}) {
  const e = new Enemy(type, x, y, { staged: true, spawnIn: 1, ...opts });
  world.enemies.push(e);
  if (!e.harmless) world.released++;
  return e;
}

/**
 * A TOW and the mass it drags. Two real bodies joined by a constraint, so the
 * pair swings and shoves — and two of the five hundred, the same way a
 * splitter's children are.
 */
export function spawnTow(world, x, y, opts = {}) {
  const head = TYPE_BY_ID.tow;
  const massType = TYPE_BY_ID[head.tows.type];
  const len = head.tows.length;
  const a = spawnOne(world, head, x, y, opts);
  const b = spawnOne(world, massType, x + spread(30), y - len, { ...opts, route: a.route });
  a.tether = { other: b, len };
  b.tether = { other: a, len };
  return [a, b];
}

/** Distance constraints, resolved after the contact solver. */
export function solveTethers(world) {
  for (const e of world.enemies) {
    const t = e.tether;
    if (!t) continue;
    const o = t.other;
    // The cable goes slack the moment either end dies, and clearing both sides
    // stops the survivor dragging a corpse around the field.
    if (o.dead || e.dead) { e.tether = null; if (o) o.tether = null; continue; }
    if (e.x > o.x || (e.x === o.x && e.y > o.y)) continue; // solve each pair once

    let dx = o.x - e.x;
    let dy = o.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) continue;
    const err = d - t.len;
    if (err <= 0) continue; // a cable pulls, it does not push
    dx /= d;
    dy /= d;
    const inv = e.invMass + o.invMass;
    if (inv <= 0) continue;
    // Positional, weighted by inverse mass, plus a matching velocity
    // correction so the pair swings instead of buzzing.
    const push = err * 0.42;
    e.x += dx * push * (e.invMass / inv);
    e.y += dy * push * (e.invMass / inv);
    o.x -= dx * push * (o.invMass / inv);
    o.y -= dy * push * (o.invMass / inv);
    const rel = (o.vx - e.vx) * dx + (o.vy - e.vy) * dy;
    if (rel > 0) {
      const j = rel / inv;
      e.vx += dx * j * e.invMass;
      e.vy += dy * j * e.invMass;
      o.vx -= dx * j * o.invMass;
      o.vy -= dy * j * o.invMass;
    }
  }
}

/** Hostiles still owed to the run. */
export function releasesLeft(world) {
  return Math.max(0, CFG.killGoal - world.released);
}

/** A formation queued above the screen, marching down to the gate. */
export function spawnFormation(world, kinds, count) {
  const shape = pick(FORMATIONS);
  const half = world.wall.gateHalf;
  const cx = clamp(world.wall.gateCx + spread(half * 0.5), half, world.width - half);
  // A formation is one type in a shape; a shape made of towed pairs is not a
  // formation, it is a traffic jam, and it would cost double the allotment.
  const single = kinds.filter((k) => !k.tows);
  const type = weightedPick(single.length ? single : kinds);
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

/** Loose, aimless matter released through the gate along with everything else. */
export function spawnDrift(world, opts = {}) {
  const type = TYPE_BY_ID.drift;
  const g = world.wall;
  const x = opts.x ?? clamp(g.gateCx + spread(g.gateHalf * 0.8), type.r + 6, world.width - type.r - 6);
  const y = opts.y ?? g.y + g.thickness + rand(10, 40);
  const e = new Enemy(type, x, y, { staged: false, spawnIn: 1, vx: spread(30), vy: rand(10, 50) });
  world.enemies.push(e);
  return e;
}

export class Director {
  constructor() {
    this.timer = 1.2;
    this.driftTimer = 3;
  }

  reset() {
    this.timer = 1.2;
    this.driftTimer = 3;
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
    for (let i = 0; i < 6; i++) {
      spawnDrift(world, {
        x: rand(60, world.width - 60),
        y: rand(top, Math.max(top + 60, bottom)),
      });
    }
  }

  update(world, dt) {
    if (world.phase !== 'staging') return;

    // A slow trickle of aimless matter, capped so it never crowds the field.
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = rand(3.5, 6.5);
      if (driftCount(world) < CFG.maxDrift) spawnDrift(world);
    }

    const progress = clamp(world.kills / CFG.popRampKills, 0, 1);
    const popTarget = Math.round(CFG.popStart + (CFG.popEnd - CFG.popStart) * progress);
    const interval = CFG.spawnInterval[0] + (CFG.spawnInterval[1] - CFG.spawnInterval[0]) * progress;

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = interval * rand(0.8, 1.25);

    const quota = releasesLeft(world);
    if (quota <= 0) return; // the whole allotment has been let out

    const hostiles = hostileCount(world);
    if (hostiles >= Math.min(popTarget, CFG.maxEnemies)) return;

    const kinds = availableTypes(world.kills);
    const room = Math.min(popTarget, CFG.maxEnemies, world.released + quota) - hostiles;

    if (room >= 4 && quota >= 4 && Math.random() < CFG.formationChance) {
      spawnFormation(world, kinds, randInt(3, Math.min(6, room, quota)));
    } else {
      // A TOW costs two of the allotment, so it is off the table when only one
      // release is left.
      const affordable = quota >= 2 ? kinds : kinds.filter((k) => !k.tows);
      const t = weightedPick(affordable);
      release(world, t, rand(t.r + 12, world.width - t.r - 12), -50 - rand(0, 40));
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

  // A sealed gate is a target like anything else; at half weight, since it is
  // a wall and the bolts are meant to remain the honest way through it.
  if (world.wall.sealed) {
    const gy = world.wall.y + world.wall.thickness / 2;
    const px = clamp(x, world.wall.gateCx - world.wall.gateHalf, world.wall.gateCx + world.wall.gateHalf);
    const d = Math.hypot(x - px, y - gy);
    if (d < r) world.wall.damageGate(world, damage * (1 - d / r) * 0.5, px, gy);
  }

  if (world.boss && !world.boss.dead) {
    const dx = world.boss.x - x;
    const dy = world.boss.y - y;
    const d = Math.hypot(dx, dy);
    if (d < r + world.boss.r) {
      const falloff = clamp(1 - d / (r + world.boss.r), 0, 1);
      world.boss.hurt(world, damage * falloff * 1.6);
      world.boss.push(dx / (d || 1), dy / (d || 1), impulse * falloff * 0.06);
    }
    // The copy is destructible, so blasts have to reach it as well — without
    // this, abilities were the one thing on the field that could not touch it.
    const e = world.boss.echo;
    if (e && e.born >= 1) {
      const ed = Math.hypot(e.x - x, e.y - y);
      if (ed < r + e.r) world.boss.hurtEcho(world, damage * clamp(1 - ed / (r + e.r), 0, 1) * 1.6);
    }
  }
}
