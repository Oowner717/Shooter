// The objects. Each one is a physics body with a steering brain, a way to die
// and a hand-drawn look. Nothing here knows about the rest of the game beyond
// the `world` handle it is given.

import { CFG, WAVES, TYPE_BY_ID, ROUTES, HAIRLINE, massOf } from './config.js';
import { TAU, clamp, rand, spread, pick, weightedPick, rgba, drawGlow } from './util.js';
import { explode, hitBurst, spark, dot, shard as fxShard, ring, ripple, haul } from './fx.js';
import { audio } from './audio.js';
import { shed } from './debris.js';

/**
 * The top of the visible field, in world units. Objects are queued above it
 * and are not in play — not targetable, not collidable, not counted — until
 * they have come all the way down past it.
 */
export const ENTRY_Y = 0;

/**
 * A specimen portrait for the glossary, drawn with the same shape routines the
 * field uses so the two can never drift apart. Centred on the current
 * transform; `r` is the radius to draw at.
 */
export function drawSpecimen(ctx, id, r) {
  const t = TYPE_BY_ID[id];
  ctx.save();
  ctx.lineWidth = 1.6;
  if (!t) {
    ctx.strokeStyle = rgba('#ffd98a', 0.95);
    ctx.fillStyle = 'rgba(6,3,12,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffd98a', 0.6);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
      ctx.lineTo(Math.cos(a) * r * (i % 4 === 0 ? 1.42 : 1.24), Math.sin(a) * r * (i % 4 === 0 ? 1.42 : 1.24));
    }
    ctx.stroke();
    ctx.fillStyle = '#02010a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#fffaf0', 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = rgba(t.color, 0.95);
  ctx.fillStyle = rgba(t.glow, 0.16);
  switch (t.shape) {
    case 'shard': drawShard(ctx, r); break;
    case 'needle': drawNeedle(ctx, r); break;
    case 'hex': drawHex(ctx, r); break;
    case 'blob': drawBlob(ctx, r, 0.6, 0); break;
    case 'bloom': drawBloom(ctx, r, 0.4, 0, t); break;
    case 'plated': drawPlated(ctx, r, 1); break;
    case 'plate': drawPlate(ctx, r); break;
    case 'warden': {
      drawWardenCore(ctx, r);
      // the plates are what the entry is about, so they are in the portrait
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ox = ca * r * SHARD_ORBIT * 0.62;
        const oy = sa * r * SHARD_ORBIT * 0.62;
        ctx.moveTo(ox + sa * 6, oy - ca * 6);
        ctx.lineTo(ox - sa * 6, oy + ca * 6);
      }
      ctx.stroke();
      break;
    }
    case 'prism': drawPrism(ctx, r); break;
    case 'herald': drawHerald(ctx, r, 0.5); break;
    case 'glut': drawGlut(ctx, r, 6, 0.5, 0); break;
    case 'tow': {
      drawTowHead(ctx, r * 0.8);
      ctx.strokeStyle = rgba('#8fa9c4', 0.7);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.6);
      ctx.lineTo(0, r * 1.6);
      ctx.stroke();
      break;
    }
    case 'mass': drawTowMass(ctx, r * 0.9, 1); break;
    case 'drift': drawDrift(ctx, r, 0); break;
    case 'scion': drawScion(ctx, r, 0, 0); break;
    case 'seed': drawSeed(ctx, r, 0, 0); break;
    default: drawShard(ctx, r);
  }
  ctx.restore();
}

/** WARDEN plate geometry — shared by drawing, hit tests and the broadphase. */
const SHARD_ORBIT = 2.15; // multiples of the core radius
export const SHARD_R = 12;

export class Enemy {
  constructor(type, x, y, opts = {}) {
    this.type = type;
    this.isDrop = !!opts.drop;
    this.counts = !this.isDrop;

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
    // Energy moves at its own pace and turns at its own rate; a body moves at
    // its type's. See CFG.drop.speed for why they were ever the same thing.
    this.cruise = this.isDrop
      ? CFG.drop.speed * (opts.speedScale || rand(0.9, 1.12))
      : type.speed * (opts.speedScale || rand(0.86, 1.14));
    this.accel = this.isDrop ? CFG.drop.accel : type.accel;

    this.maxHp = Math.round((opts.hp ?? type.hp) * (this.isDrop ? 1 : rand(0.92, 1.1)));
    this.hp = this.maxHp;
    this.armor = type.armor || 0;

    this.staged = opts.staged || false; // still above the top of the screen
    this.attacking = false;
    this.flash = 0;
    this.dead = false;
    this.phase = rand(0, TAU);
    this.lurchTimer = rand(0, 2);

    this.harmless = !!type.harmless;
    if (this.harmless) this.counts = false;
    this.ward = 0; // damage reduction granted by a HERALD
    this.wardT = 0; // lapses unless refreshed
    // GRAFT. A SEED is a harmless body that hunts a host instead of wandering;
    // `grafted` is what it leaves behind, and a grafted body closes its own
    // wounds until something finishes it.
    // EBB: seconds left of being thrown, during which it does not steer.
    this.thrown = 0;
    // SLUG: seconds left of being exempt from collision damage, in both
    // directions. A SLUG shoves as hard as it ever did and pays out nothing
    // for what it shoves things into — see CFG.rounds.slug.calm.
    this.slugged = 0;
    this.seed = type.id === 'seed';
    this.seedT = this.seed ? CFG.graft.life : 0;
    this.host = null;
    /*
     * Balls riding this body. A seed that reaches a host used to dissolve into
     * it: the host silently became bigger and started healing, and there was
     * nothing to shoot to undo it. Now each one stays, orbiting, as a thing
     * with its own health -- so the boost is always visible, always stackable
     * and always removable. null until the first one lands.
     */
    this.grafts = null;
    this.graftSpin = 0;
    this.graftBaseR = 0; // what the body was before any of them
    this.graftBaseHp = 0;
    this.graftBaseEnergy = 0;
    this.tether = null; // the other half of a TOW, if any
    // Every object picks its own way across the field.
    this.route = opts.route || weightedPick(ROUTES);
    this.routeSide = Math.random() < 0.5 ? -1 : 1;
    this.routeScale = rand(0.7, 1.25);
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = 0;
    this.stagedFor = 0;
    // Debris used to expire after 22-30s. It does not any more: a fragment
    // carries salvage, and salvage that rots is a clock the player is losing
    // to. The floor drains by being collected instead — pulled into the
    // intake, shot, or blasted.
    this.ttl = 0;
    // Set when it is made, from the parent's mass. Banked whichever way it
    // goes: reaching the turret, or being destroyed.
    this.energy = opts.energy || 0;
    // Marks left on a body by the rounds that do not simply hurt it.
    this.chill = 0; // RIME: seconds of being dragged to a crawl
    this.bounty = 1; // TITHE: what its energy is worth when it goes
    this.marks = 0; // ...and how deep the mark is, which is what TITHE rides on
    this.spawnIn = opts.spawnIn ?? 0; // brief materialise animation

    /*
     * Plates, and only on a body.
     *
     * `isDrop` was not checked here, so a WARDEN's energy — built from the
     * WARDEN type like every mote is built from its parent — came out of the
     * constructor carrying three orbiting plates of its own. A four-unit mote
     * was drawn as a three-bladed pinwheel the size of the thing that dropped
     * it, and its hitReach grew to the plates' orbit, so a round aimed past it
     * could be stopped by the phantom plating on a piece of salvage. The
     * screen filled with orange rotors that looked like objects, could not be
     * auto-aimed, and ate shots.
     */
    if (type.shards && !this.isDrop) {
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

  /** Live balls riding this body. */
  get graftCount() {
    if (!this.grafts) return 0;
    let n = 0;
    for (const g of this.grafts) if (g.alive) n++;
    return n;
  }

  /** Kept as a read-only name because half the file asks the question. */
  get grafted() {
    return this.graftCount > 0;
  }

  /** Radius the balls ride at. It follows the body, which the balls grow. */
  get graftR() {
    return this.r * CFG.graft.orbit;
  }

  get hitReach() {
    const core = this.shards ? this.orbitR + SHARD_R : this.r;
    return this.graftCount ? Math.max(core, this.graftR + CFG.graft.ball) : core;
  }

  /*
   * Recompute everything the balls give, from how many are alive.
   *
   * Derived rather than accumulated on purpose: a ball being shot off has to
   * put the body back exactly, and a body whose radius was multiplied on the
   * way up cannot be divided back down without drift. The wound is carried
   * across as a fraction, so losing a ball never kills the host outright and
   * gaining one never heals it.
   */
  refreshGrafts() {
    const G = CFG.graft;
    const n = this.graftCount;
    this.r = this.graftBaseR * (1 + G.grow * n);
    this.mass = massOf(this.type, this.r);
    this.invMass = 1 / this.mass;
    const frac = this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 1;
    this.maxHp = Math.max(1, Math.round(this.graftBaseHp * (1 + G.tough * n)));
    this.hp = Math.max(1, Math.min(this.maxHp, this.maxHp * frac));
    this.energy = this.graftBaseEnergy * (1 + G.tough * n);
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
    let cruise = this.cruise * slow;
    const k = (this.accel / 100) * slow * 0.9;
    let dx = Math.cos(this.wanderAngle);
    let dy = Math.sin(this.wanderAngle);

    // Quick in at the top, easing off with depth, and never stopped. There
    // is no band and no floor: `crawl` is the fraction of the descent that
    // always remains, so a drift is forever still coming down — just less and
    // less urgently — and will reach the turret if it is left alone.
    //
    // Build 78 held them in a band and pulled them back from below, which is a
    // wall however gently it is written: the bottom two thirds of the field
    // had no grey in it at all.
    const D = CFG.drift;
    const ease = D.crawl + (1 - D.crawl) * Math.exp(-Math.max(this.y, 0) / D.taper);
    const urge = D.sink * ease;
    dx *= 1 - urge;
    dy = dy * (1 - urge) + urge;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    // ...and it comes down at a pace worth watching. At wander speed the first
    // one reached the field a good ten seconds after the first hostile, which
    // is not what "the safe thing arrives first" means.
    cruise = (this.cruise + (D.fall - this.cruise) * ease) * slow;

    this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (dy * cruise - this.vy) * clamp(k * dt, 0, 1);
    if (world.stasis > 0) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  /**
   * The soft side boundary. Applied after steering and before integration, to
   * every body the arena holds, so it covers a hostile making its run, a drift
   * wandering, and a mote being drawn in — every one of which could otherwise
   * end up rolling along a wall.
   *
   * A nudge on the velocity rather than a change of heading: the object keeps
   * doing whatever it was doing and simply stops being able to reach the edge.
   */
  edgeEase(world, dt) {
    const E = CFG.physics;
    const left = this.x - this.r;
    const right = world.width - (this.x + this.r);
    const near = Math.min(left, right);
    if (near < E.edgeEase) {
      // Squared, so it is nothing at the outer limit and firm at the wall.
      const urge = (1 - Math.max(near, 0) / E.edgeEase) ** 2;
      this.vx += (left < right ? 1 : -1) * E.edgePush * urge * dt;
    }
    // The floor is a wall too. A drift that has finished coming down would
    // otherwise settle onto the bottom edge and sit there at a dead stop,
    // which is exactly what a thing that never stops must not do.
    const below = world.floorY - (this.y + this.r);
    if (below < E.floorEase) {
      const urge = (1 - Math.max(below, 0) / E.floorEase) ** 2;
      this.vy -= E.edgePush * urge * dt;
    }
  }

  /**
   * A SEED looking for a host. It takes the largest thing within reach rather
   * than the nearest, so it reads as reinforcing the object that was already
   * the problem — and it re-picks every frame, so shooting its target out from
   * under it sends it somewhere else rather than stalling it.
   */
  hunt(world, dt) {
    const G = CFG.graft;
    this.seedT -= dt;
    if (this.seedT <= 0) { this.dead = true; return; }

    let best = null;
    let bestScore = 0;
    for (const e of world.enemies) {
      // Not another SCION. It is the largest thing on the field, so it would
      // win the pick nearly every time, and a SCION whose seeds reinforce the
      // next SCION is a loop rather than a decision -- the object exists to
      // give the ability away.
      // Full is full. Below the cap a body can take another, which is what
      // makes a SCION's three land as one problem rather than three.
      if (e === this || e.dead || e.seed || e.harmless || e.staged) continue;
      if (e.graftCount >= G.stack) continue;
      if (e.type.id === 'scion') continue;
      const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
      if (d2 > G.hunt * G.hunt) continue;
      // Biggest first, and closer breaks the tie.
      const score = e.r * 1000 - Math.sqrt(d2);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    this.host = best;
    if (!best) {
      this.wander(world, dt);
      return;
    }

    const dx = best.x - this.x;
    const dy = best.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d <= best.r + this.r + 2) {
      graft(world, best);
      this.dead = true;
      this.dissolved = true;
      return;
    }
    const k = (this.accel / 100) * dt;
    this.vx += ((dx / d) * this.cruise - this.vx) * clamp(k, 0, 1);
    this.vy += ((dy / d) * this.cruise - this.vy) * clamp(k, 0, 1);
  }

  /**
   * Steering, then the two things that have to happen however it steered.
   *
   * drive() has half a dozen early returns -- thrown, seeded, harmless, dead
   * -- and a NEEDLE that stops pointing where it is going the moment EBB
   * throws it is a NEEDLE that tumbles for the most visible second of its
   * life. Same for a TOW's wind-up, which must not stall because the pair got
   * shoved.
   */
  steer(world, dt) {
    this.shoveFade(dt);
    this.drive(world, dt);
    if (this.type.hurl && this.tether) this.windUp(world, dt);
    this.face(dt);
  }

  /**
   * Types that lead with a point turn to face where they are going.
   *
   * A NEEDLE is drawn as a spike along -y, so the heading it wants is the
   * travel bearing plus a quarter turn. Eased over about a tenth of a second
   * rather than snapped, and its tumble is damped out as it comes round, so a
   * body shoved sideways reads as correcting rather than as a sprite being
   * rotated. Below walking pace it keeps whatever heading it had -- a needle
   * sitting still has no "forward" to point at.
   */
  face(dt) {
    if (!this.type.point || this.isDrop) return;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp < 10) return;
    let d = Math.atan2(this.vy, this.vx) + Math.PI / 2 - this.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = clamp(dt * 11, 0, 1);
    this.angle += d * k;
    this.av *= 1 - k;
  }

  /**
   * A TOW winding its load up, and letting go of it.
   *
   * Only the head runs this, and only while it still has a cable. Inside the
   * hurl range the mass is driven around the head -- a sideways push each
   * frame, so the pair spins up instead of being teleported into an orbit --
   * and at the end of the wind it is released at the turret.
   */
  windUp(world, dt) {
    const H = this.type.hurl;
    const mass = this.tether.other;
    if (!mass || mass.dead) return;
    const s = world.shooter;
    if (Math.hypot(s.x - this.x, s.y - this.y) > H.range) { this.wind = 0; return; }

    this.wind = (this.wind || 0) + dt;
    const spin = clamp(this.wind / H.wind, 0, 1);
    // perpendicular to the cable, so the load comes round rather than in
    let cx = mass.x - this.x;
    let cy = mass.y - this.y;
    const cd = Math.hypot(cx, cy) || 1;
    cx /= cd; cy /= cd;
    mass.vx += -cy * 900 * spin * dt;
    mass.vy += cx * 900 * spin * dt;
    this.tether.len = this.type.tows.length * (1 - spin * 0.45); // and it draws in

    if (this.wind < H.wind) return;

    // Let go. Straight at the turret, at a speed nothing else on the field
    // has, and coasting -- `thrown` is what stops a released body steering.
    const dx = s.x - mass.x;
    const dy = s.y - mass.y;
    const d = Math.hypot(dx, dy) || 1;
    mass.vx = (dx / d) * H.speed;
    mass.vy = (dy / d) * H.speed;
    mass.av = spread(9);
    mass.thrown = 2.2;
    mass.hurled = true;
    this.tether = null;
    mass.tether = null;
    this.wind = 0;
    this.hurled = true; // spent: it never gets another one
    ring(this.x, this.y, this.r, this.r * 5, 0.3, this.type.color, 2);
    audio.thud();
  }

  drive(world, dt) {
    // Thrown clear and not yet recovered. It coasts: the whole point of EBB is
    // that the field comes off you, and a body that starts steering back on
    // the next frame has not been thrown anywhere.
    if (this.thrown > 0) {
      this.thrown -= dt;
      return;
    }
    if (this.seed) {
      this.hunt(world, dt);
      return;
    }
    /*
     * Energy is energy, whatever dropped it.
     *
     * A mote is built from the type it fell off, so a mote off a DRIFT
     * inherited `harmless` and took this branch -- it wandered the band it was
     * made in and never came to the turret at all. The one object whose
     * salvage you have to go and fetch was the one object whose salvage was
     * never coming to you.
     */
    if (this.harmless && !this.isDrop) {
      this.wander(world, dt);
      return;
    }

    const t = world.time;
    let tx;
    let ty;

    if (this.staged) {
      // Nothing to aim at yet: it is still marching in, so it simply comes
      // down, drifting a little as it falls. The target sits below the entry
      // line rather than on it, or a body eases to a halt just short of the
      // line it is supposed to cross.
      tx = this.x + Math.sin(t * 0.6 + this.phase) * 40;
      ty = ENTRY_Y + CFG.entryDepth + 60;
    } else {
      tx = world.shooter.x;
      ty = world.shooter.y;
      // A DECOY outranks the turret: that is the whole ability.
      if (world.decoy && !world.decoy.dead) {
        tx = world.decoy.x;
        ty = world.decoy.y;
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
      /*
       * `commit` is an exponent, so a low one folds in very slowly: WIDE
       * (width 480, commit 0.35) still held a 293-unit sideways offset at 130
       * units out, which is not an approach, it is an orbit.
       *
       * So the offset is scaled off entirely across the last stretch,
       * whatever the route. An arc is how a thing arrives; it is not how it
       * spends the endgame.
       */
      const reach = clamp(d / 520, 0, 1) ** r.commit;
      const closing = clamp((d - 170) / 210, 0, 1);
      let lateral = r.width * this.routeScale * this.routeSide * reach * closing;
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
    // The march in is brisk. The entry line is 260 units down the field and an
    // object crossing it at its own cruise would spend five seconds getting
    // there — the point of the depth is where things are engaged, not how long
    // the run takes to hand them over.
    if (this.staged) cruise *= CFG.entrySpeed;
    // Once nothing more will be released, whatever is left closes in, so the
    // tail of the run is never a hunt across an empty field.
    if (releasesLeft(world) <= 0) cruise *= 1.45;
    // loiterers hang back at mid range before making their run
    if (this.route.dawdle && !this.staged) {
      const dist = Math.hypot(world.shooter.x - this.x, world.shooter.y - this.y);
      if (dist > 260) cruise *= this.route.dawdle;
    }
    const speed = Math.hypot(this.vx, this.vy);
    /*
     * Steering yields to physics while a body is flying, so knockback stays
     * fun -- but only while the body is still going roughly where it wanted
     * to. It used to yield unconditionally, and the shove that mattered was
     * the one that reversed it: authority collapsed to 0.12 and the object
     * coasted away without turning round. Measured on build 110, one
     * invulnerable MOTE under auto fire on a direct route:
     *
     *   quiet       791 746 702 ... 344 299 255 209 166 121  78  39
     *   under fire  791 750 705 ... 445 402 473 672 969 1277 1305 1306
     *
     * It closed to 400 units, was blown back across the whole field, and was
     * still out there twenty seconds later. A LURCHER simply sat between 330
     * and 560 for the entire run.
     *
     * `along` is how much of the current velocity is going the way the object
     * wants. Negative means it is travelling away from where it is steering,
     * and that is exactly when it needs its authority back rather than least.
     */
    const along = speed > 1 ? (this.vx * dx + this.vy * dy) / speed : 1;
    const flying = clamp(1 - (speed / Math.max(cruise, 1) - 1) / 3, 0.12, 1);
    const authority = clamp(flying + Math.max(0, -along) * 0.9, 0.12, 1);
    const k = (this.accel / 100) * authority * slow;

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
    if (this.slugged > 0) this.slugged = Math.max(0, this.slugged - dt);

    /*
     * A grafted body closes what you did not finish, once per second per ball.
     * Nothing else in the game heals, so this is the one object that punishes
     * spreading fire around -- and the answer to it is on its surface: shoot
     * the balls off and the healing goes with them.
     */
    const balls = this.graftCount;
    if (balls) {
      const spin = world.stasis > 0 ? 0.12 : 1;
      for (const g of this.grafts) g.a += this.graftSpin * dt * spin;
      if (this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + CFG.graft.regen * balls * dt);
      }
    }

    // RIME wears off on its own. The chill is a drag rather
    // than a speed cap, so a heavy body coasts further out of it than a light
    // one — which is the same physics everything else here obeys.
    if (this.chill > 0) {
      this.chill -= dt;
      const k = CFG.rounds.rime.drag ** dt;
      this.vx *= k;
      this.vy *= k;
    }
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

    if (this.staged) {
      // An object wedged on its way in would stall the run forever, since the
      // count only completes once every released object is destroyed. The
      // march is longer than it was, so the valve waits longer before shoving.
      this.stagedFor += dt;
      if (this.stagedFor > 14) this.vy += 130 * dt;
      // Past the entry line: it is loose in the arena now, and somewhere the
      // player can actually watch it be dealt with.
      if (this.y - this.r > ENTRY_Y + CFG.entryDepth) this.staged = false;
    }
  }

  // ------------------------------------------------------------ behaviours

  /**
   * HERALD. Covers the nearest few hostiles — never another beacon — so that
   * while covered they take a fraction of incoming damage. Both the thread and
   * the shell are drawn, so the beacon reads as the reason nothing else is
   * dying, and killing it is always a thing you can actually do.
   */
  wardNearby(world, dt) {
    const cfg = this.type.ward;
    this.warded = this.warded || [];
    this.warded.length = 0;
    if (this.staged || this.spawnIn > 0) return;
    const r2 = cfg.radius * cfg.radius;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.harmless || e.staged) continue;
      // No beacon covers another beacon. Five HERALDs drifting together spent
      // eighteen of their twenty-five cover slots on each other and webbed the
      // screen doing it — a knot of them was near-unkillable, which is the
      // exact opposite of "kill the beacon, not the escort".
      if (e.type.ward) continue;
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
    for (const d of world.drops) {
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
   * A ball shot off a host. Everything it was giving comes off with it, which
   * is the whole point of it being a thing on the outside rather than a state
   * on the inside.
   */
  hitGraft(s, dmg, hx, hy) {
    if (!s.alive) return;
    s.hp -= dmg;
    if (s.hp > 0) {
      hitBurst(hx, hy, 0, -1, '#d9c2ff');
      return;
    }
    s.alive = false;
    this.refreshGrafts();
    ring(hx, hy, 2, CFG.graft.ball * 4, 0.34, '#c9a7ff', 2);
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      spark(hx, hy, Math.cos(a) * rand(70, 210), Math.sin(a) * rand(70, 210), '#d9c2ff', rand(0.2, 0.42), 2);
    }
    audio.reflect();
  }

  /**
   * A shove is a shove. A stream of them is not a conveyor belt.
   *
   * Knockback stacked without limit, so anything the turret kept shooting was
   * pushed back faster than it could steer in. Measured on build 110, one
   * invulnerable MOTE under auto fire on a direct route: it closed to 400
   * units, was blown out to 1306 -- past the top of the field -- and was
   * still out there twenty seconds later at vy -70, because every bolt that
   * reached it renewed the push. A LURCHER held station between 330 and 560
   * for a whole run. That is the "enemies stop and never arrive" this fixes.
   *
   * So repeated hits give diminishing shove. `kicked` counts effective hits
   * and bleeds off over CFG.physics.kickFade seconds, and each new hit is
   * scaled by 1/(1 + kicked). The first hit after a quiet moment lands at
   * exactly its old strength -- the punt is the fun part and is untouched --
   * while a sustained stream settles at about a third of it, which is well
   * inside what the object's own steering can answer.
   *
   * Damage is not touched. This is the impulse only.
   */
  shoveFade(dt) {
    if (this.kicked > 0) this.kicked = Math.max(0, this.kicked - dt / CFG.physics.kickFade);
  }

  /**
   * @returns 'reflect' | 'hit'
   */
  takeHit(world, dmg, hx, hy, nx, ny, impulse, shred = 0) {
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

    this.applyDamage(world, dmg, nx, ny, impulse, shred);
    hitBurst(hx, hy, -nx, -ny, this.type.glow);
    return 'hit';
  }

  applyDamage(world, dmg, nx = 0, ny = 0, impulse = 0, shred = 0) {
    if (this.dead) return;
    /*
     * An energy mote cannot be hurt. It is not wreckage to be broken up a
     * second time — it is the charge the object was carrying, and the only
     * thing that can happen to it is being taken in. A blast still shoves it
     * around, which is why the impulse is applied before the return.
     */
    if (this.isDrop) {
      if (impulse) {
        this.vx += nx * impulse * this.invMass;
        this.vy += ny * impulse * this.invMass;
      }
      return;
    }
    // A HERALD's cover, if one is refreshing it. It lapses a frame after the
    // beacon stops covering, which is what makes killing the beacon feel like
    // the answer rather than a statistic.
    const ward = this.wardT > 0 ? (this.ward || 0) : 0;
    // RAILED lets a SPINE through the plate rather than into it: `shred` is
    // the fraction of this body's armour the round simply does not meet.
    const plate = this.armor * (1 - shred);
    const real = Math.max(1, dmg * (1 - plate) * (1 - ward));
    this.hp -= real;
    this.flash = Math.min(1, this.flash + 0.5 + real / 260);
    if (impulse) {
      // Diminishing returns on a stream of hits — see shoveFade().
      const fade = 1 / (1 + (this.kicked || 0));
      this.kicked = (this.kicked || 0) + fade;
      const push = impulse * this.invMass * fade;
      this.vx += nx * push;
      this.vy += ny * push;
      this.av += spread(push * 0.02);
    }
    if (this.hp <= 0) this.destroy(world);
  }

  destroy(world) {
    if (this.dead) return;
    this.dead = true;
    const t = this.type;
    // Destroying a fragment is a way of collecting it, not a way of losing it.
    if (this.energy) bank(world, this.energy * this.bounty, this.x, this.y);
    // The harmless ones pay too. It is the one income the tally never sees.
    else if (this.harmless) bank(world, CFG.energy.drift * this.bounty, this.x, this.y);
    explode(this.x, this.y, this.r, t.color, t.glow, this.isDrop ? 0.55 : 1);
    audio.pop(clamp(this.r / 22, 0.5, 2.4));

    if (this.isDrop) return;

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

    // SCION: it throws seeds rather than simply coming apart. They are
    // harmless bodies and come out of nobody's quota — a SCION costs one of
    // the five hundred whatever it does on the way out.
    if (t.id === 'scion') {
      const G = CFG.graft;
      for (let i = 0; i < G.seeds; i++) {
        const a = (i / G.seeds) * TAU + rand(0, TAU);
        const seed = new Enemy(TYPE_BY_ID.seed, this.x, this.y, {
          staged: false,
          spawnIn: 0.5,
          vx: this.vx + Math.cos(a) * G.spread,
          vy: this.vy + Math.sin(a) * G.spread,
        });
        world.enemies.push(seed);
      }
      ring(this.x, this.y, this.r, this.r * 3.4, 0.5, '#c9a7ff', 4);
      ripple(this.x, this.y, 1.4, this.r * 6);
    }

    // Splitter: children keep the parent's momentum.
    if (t.splits) {
      const child = TYPE_BY_ID[t.splits.type];
      // Children are glitch-causing objects too, so they come out of the same
      // quota. Near the end of the run a splitter simply sheds fewer.
      // A body carrying shards releases only the ones still on it: shoot the
      // plates off a WARDEN and there are fewer left to come at you when the
      // core finally goes.
      const alive = this.shards ? this.shards.filter((sh) => sh.alive).length : t.splits.count;
      const count = Math.min(t.splits.count, alive, releasesLeft(world));
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

    // Wreckage. Only the four largest objects shed it, and they shed a lot of
    // it — the point is that a BULWARK coming apart looks like a BULWARK
    // coming apart, and that it happens rarely enough to stay an event.
    if (t.debris) shed(world, this, t.debris);

    // Energy: destructible, pushable, does not count toward the tally. A body
    // carries its worth between its pieces, so what a thing pays is what it
    // was made of.
    const n = t.drops || 0;
    const worth = Math.max(n, Math.round(massOf(t, this.r) * CFG.energy.perMass));
    const each = Math.max(CFG.energy.minValue, Math.round(worth / Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      if (world.drops.length >= CFG.maxDrops) break;
      const a = rand(0, TAU);
      const sp = rand(70, 240);
      // A fraction of the parent, but never bigger than energy is allowed
      // to draw. The ceiling is drawn rather than fixed: a flat clamp pinned
      // every chip off anything large to exactly the maximum, and a floor of
      // identical pieces reads as tiling rather than as wreckage.
      const dr = Math.min(
        rand(this.r * 0.16, this.r * 0.3),
        rand(CFG.drop.min, CFG.drop.max),
      );
      world.drops.push(new Enemy(t, this.x + Math.cos(a) * this.r * 0.5, this.y + Math.sin(a) * this.r * 0.5, {
        drop: true,
        r: dr,
        hp: 8 + dr,
        vx: this.vx * 0.4 + Math.cos(a) * sp,
        vy: this.vy * 0.4 + Math.sin(a) * sp,
        energy: each,
      }));
      // TITHE marks the body, but the salvage rides on what the body leaves —
      // so the mark has to come with it or the round pays nothing at all.
      world.drops[world.drops.length - 1].bounty = this.bounty;
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
    if (this.isDrop) {
      // Energy is not damaged and has no health to read, so it is drawn at
      // full brightness and additively: a floor of it should glow.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(t.color, 0.5);
      ctx.strokeStyle = rgba(t.color, 0.75);
      ctx.lineWidth = Math.max(HAIRLINE * 0.8, this.r * 0.22);
    } else {
      ctx.fillStyle = rgba(t.color, 0.16 * dim);
      ctx.strokeStyle = rgba(t.color, 0.55 + 0.45 * dim);
      ctx.lineWidth = Math.max(HAIRLINE, this.r * 0.09);
    }

    switch (this.isDrop ? 'drop' : t.shape) {
      case 'shard': drawShard(ctx, this.r); break;
      case 'needle': drawNeedle(ctx, this.r); break;
      case 'hex': drawHex(ctx, this.r); break;
      case 'blob': drawBlob(ctx, this.r, this.phase, world.time); break;
      case 'bloom': drawBloom(ctx, this.r, this.phase, world.time, t); break;
      case 'plated': drawPlated(ctx, this.r, hpFrac); break;
      case 'plate': drawPlate(ctx, this.r); break;
      case 'warden': drawWardenCore(ctx, this.r); break;
      case 'prism': drawPrism(ctx, this.r); break;
      case 'herald': drawHerald(ctx, this.r, this.wardSpin || 0); break;
      case 'glut': drawGlut(ctx, this.r, this.fed || 0, this.phase, world.time); break;
      case 'tow': drawTowHead(ctx, this.r); break;
      case 'mass': drawTowMass(ctx, this.r, hpFrac); break;
      case 'drift': drawDrift(ctx, this.r, this.phase, world.time); break;
      case 'scion': drawScion(ctx, this.r, this.phase, world.time); break;
      case 'seed': drawSeed(ctx, this.r, this.phase, world.time); break;
      case 'drop': drawDrop(ctx, this.r, this.phase, world.time); break;
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

    /*
     * The balls a SCION left on this body (unrotated frame, like the plates).
     *
     * Drawn as the SEED they arrived as, on a thread back to the body, and
     * each one dims as it is worn down — so a ball that is nearly off looks
     * nearly off. They are the same object they were in the air, which is what
     * makes "shoot them there instead" occur to anyone at all.
     */
    if (this.graftCount) {
      const G = CFG.graft;
      const orbit = this.graftR;
      for (const g of this.grafts) {
        if (!g.alive) continue;
        const gx = this.x + Math.cos(g.a) * orbit;
        const gy = this.y + Math.sin(g.a) * orbit;
        const life = clamp(g.hp / g.maxHp, 0.2, 1);
        ctx.strokeStyle = rgba('#c9a7ff', 0.3 + 0.25 * life);
        ctx.lineWidth = HAIRLINE * 1.6;
        // From the body's edge, not its centre: a line drawn through the
        // middle of a BULWARK reads as damage to it rather than as a thread.
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(g.a) * this.r * 0.92, this.y + Math.sin(g.a) * this.r * 0.92);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.save();
        ctx.translate(gx, gy);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#c9a7ff', 0.2 + 0.3 * life);
        ctx.strokeStyle = rgba('#d9c2ff', 0.45 + 0.5 * life);
        ctx.lineWidth = Math.max(HAIRLINE, G.ball * 0.16);
        drawSeed(ctx, G.ball, g.a * 3, world.time);
        ctx.restore();
      }
    }

    // orbiting plates (unrotated frame)
    if (this.shards) {
      const orbit = this.orbitR;
      const plate = TYPE_BY_ID.plate;
      ctx.strokeStyle = rgba(t.color, 0.9);
      ctx.fillStyle = rgba(t.color, 0.16);
      ctx.lineWidth = HAIRLINE * 2.2;
      for (const sh of this.shards) {
        if (!sh.alive) continue;
        // Drawn as the PLATE it will become when the core goes, facing out
        // along its orbit. A bar here and a shell segment loose on the field
        // hid the fact that they are the same object.
        ctx.save();
        ctx.translate(this.x + Math.cos(sh.a) * orbit, this.y + Math.sin(sh.a) * orbit);
        ctx.rotate(sh.a);
        drawPlate(ctx, plate.r);
        ctx.restore();
      }
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

    /*
     * Covered by a HERALD: a shell, so the reason it is shrugging off hits is
     * visible on the thing shrugging them off.
     *
     * Four things make it a shell rather than a ring, and the point of all
     * four is that a covered MOTE must not read as an energy mote with a halo
     * — see CFG.wardShell. A floor on the radius, so the smallest hostile gets
     * a shell it can be seen inside. Plating with gaps in it, because a solid
     * circle is what a glow looks like. A turn, because energy does not turn.
     * And a wash across the volume, so the body is inside something.
     */
    if (this.wardT > 0 && this.ward > 0) {
      const W = CFG.wardShell;
      const rr = Math.max(this.r + W.gap, W.min);
      const pulse = 0.45 + 0.3 * Math.sin(world.time * 5 + this.phase);
      const spin = world.time * W.spin + this.phase;

      ctx.fillStyle = rgba('#7cffb2', 0.05 + 0.035 * pulse);
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba('#7cffb2', pulse + 0.2);
      ctx.lineWidth = Math.max(HAIRLINE * 2, rr * W.thick);
      const slice = (TAU / W.plates) * W.fill;
      for (let i = 0; i < W.plates; i++) {
        const a0 = spin + (i / W.plates) * TAU;
        ctx.beginPath();
        ctx.arc(this.x, this.y, rr, a0, a0 + slice);
        ctx.stroke();
      }
    }

    // damage arc — only on objects big enough to be worth tracking
    if (hpFrac < 0.98 && !this.isDrop && this.r >= 16) {
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

/*
 * A dart, not a diamond.
 *
 * It used to be four straight lines -- tip, two shoulders, tail -- which at
 * ten units across read as a kite with no front and no back, and told you
 * nothing about which way the fastest thing on the field was going. It leads
 * with the point now: a long spike, shoulders set well back, a pair of swept
 * fins behind them and a lit spine running up to a bright tip.
 *
 * Drawn along -y, because that is the axis Enemy.face() turns to the heading.
 */
function drawNeedle(ctx, r) {
  const stroke = ctx.strokeStyle;
  // the body: a narrow spike with the widest point two thirds of the way back
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.1);
  ctx.quadraticCurveTo(r * 0.34, -r * 0.5, r * 0.56, r * 0.62);
  ctx.lineTo(0, r * 0.24);
  ctx.lineTo(-r * 0.56, r * 0.62);
  ctx.quadraticCurveTo(-r * 0.34, -r * 0.5, 0, -r * 2.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // swept fins, off the shoulders and raked back
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * r * 0.4, -r * 0.1);
    ctx.lineTo(side * r * 1.05, r * 0.72);
    ctx.lineTo(side * r * 0.5, r * 0.5);
  }
  ctx.stroke();

  // the spine, and a lit tip at the front of it
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(HAIRLINE * 0.7, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.3);
  ctx.lineTo(0, -r * 1.7);
  ctx.stroke();
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.1);
  ctx.lineTo(r * 0.17, -r * 1.35);
  ctx.lineTo(-r * 0.17, -r * 1.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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

/**
 * PLATE: a curved section of shell, which is what it is — one of the three
 * pieces a WARDEN's armour comes apart into. Drawn as an arc band rather than
 * a solid so it never gets mistaken for a small whole object.
 */
function drawPlate(ctx, r) {
  const outer = r;
  const inner = r * 0.52;
  const half = 1.15; // ~130 degrees of shell
  ctx.beginPath();
  ctx.arc(0, 0, outer, -half, half);
  ctx.arc(0, 0, inner, half, -half, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Two rivets, so the curve reads as plating and not as a crescent.
  ctx.beginPath();
  const mid = (outer + inner) / 2;
  for (const a of [-half * 0.55, half * 0.55]) {
    ctx.moveTo(Math.cos(a) * mid + r * 0.1, Math.sin(a) * mid);
    ctx.arc(Math.cos(a) * mid, Math.sin(a) * mid, r * 0.1, 0, TAU);
  }
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

/**
 * SCION. A shell with three pods held inside it, which is what it is: a body
 * whose whole point is what comes out of it.
 */
function drawScion(ctx, r, phase, time) {
  ctx.beginPath();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase * 0.2;
    const rr = r * (i % 2 ? 0.86 : 1);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const spin = time * 0.5 + phase;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.19, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/** A SEED in flight: small, and pointed at whatever it has chosen. */
function drawSeed(ctx, r, phase, time) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const t = 0.6 + 0.4 * Math.sin(time * 6 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42 * t, 0, TAU);
  ctx.fill();
}

/**
 * An energy mote. It used to be drawn as `drawChip` — a small angular
 * pentagon, the same shape family as a body — because it used to be wreckage.
 * It is the charge the object was carrying, so it is a core with a halo on it
 * and it pulses: nothing else on the field glows steadily like this, which is
 * what makes a floor of it read as something to collect rather than something
 * to shoot.
 */
function drawDrop(ctx, r, phase, time) {
  const t = 0.72 + 0.28 * Math.sin(time * 3.4 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5 * t, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, TAU);
  ctx.fill();
  ctx.fill();
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

export function driftCount(world) {
  let n = 0;
  for (const e of world.enemies) if (!e.dead && e.harmless) n++;
  return n;
}

/**
 * Where a second SCION comes down. Two of them arriving together would seed
 * the same host twice and read as one event rather than two decisions, so the
 * second is pushed to whichever side of the field the first is not on.
 */
function scionLane(world, type, x) {
  const other = world.enemies.find((e) => !e.dead && e.type.id === 'scion');
  if (!other) return x;
  const lo = type.r + 12;
  const hi = world.width - type.r - 12;
  if (Math.abs(x - other.x) >= CFG.graft.apart) return x;
  const away = other.x < world.width / 2 ? hi : lo;
  return clamp(away + spread(60), lo, hi);
}

/**
 * Put one rolled type on the field, and say what that came to.
 *
 * A TOW is the only type that is two bodies, so it is the only one that needs
 * dispatching -- and the only reason this returns a list. It used to return
 * the head of the pair and nothing else, which was fine for the director,
 * which ignores the return, and wrong for the spawn screen, which counts it:
 * three TOWs put six bodies on the field and the panel said three.
 */
function release(world, type, x, y, opts) {
  if (type.tows) return spawnTow(world, x, y, opts);
  return [spawnOne(world, type, x, y, opts)];
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
/** Exported for the test suite, which builds a TOW pair directly. */
function spawnTow(world, x, y, opts = {}) {
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

/**
 * Hostiles still owed. Endless runs are never owed a last one, so the quota is
 * unbounded — without this the director stops dead and every object keeps the
 * closing-speed bonus meant for the final stragglers.
 */
function releasesLeft(world) {
  if (world.endless) return Infinity;
  return Math.max(0, CFG.killGoal - world.released);
}

/**
 * Salvage into the bank, at whatever rate the turret is managing. Objects
 * attached to it are sitting on the intake: one costs about a fifth, five
 * costs seventy per cent, and it never reaches nothing.
 */
export function intakeRate(world) {
  const S = CFG.energy;
  const n = Math.min(world.attackers.size, S.taxCap);
  const bite = 1 - (1 - S.tax) * world.up.insulation;
  return Math.max(S.taxFloor, bite ** n);
}

function bank(world, amount, x, y) {
  const got = amount * intakeRate(world);
  world.energy += got;
  if (got >= 1) dot(x, y, 0, -60, '#9fe8ff', 0.5, 3);
}

/**
 * Wreckage comes to you, and what happens when it gets there is a decision.
 *
 * There is no collection radius. There was one -- an unmarked circle at 190
 * units where a fragment silently stopped existing -- and it made the floor
 * pay for itself while you looked the other way. Now a fragment drifts all the
 * way in and lands on the turret, and it is still lying there: **the way to
 * bank it is to destroy it**, which costs the shots that were going up the
 * field instead. A floor you have not cleared is a pile physically on top of
 * you, eating your own rounds until you spend some on it.
 *
 * INTAKE is the upgrade that ends that chore: with it, anything touching the
 * turret is taken in on contact. It is the difference between wreckage being
 * work and wreckage being income, which is worth a card.
 */
/**
 * Every mote within reach, taken in at once. PULSE is the ordinary way this
 * happens; SCOUR is the same verb with no limit and a bonus on it.
 *
 * @returns how many were taken, so the caller can decide whether to say so.
 */
export function drawIn(world, radius, bonus = 1) {
  const s = world.shooter;
  const r2 = radius * radius;
  let took = 0;
  for (const e of world.drops) {
    if (e.dead || !e.energy) continue;
    if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r2) continue;
    absorb(world, e, bonus, true);
    took++;
  }
  return took;
}

/** One mote taken in. `bonus` is SCOUR paying over the odds for it. */
export function absorb(world, e, bonus = 1, streak = false) {
  if (e.dead || !e.energy) return;
  bank(world, e.energy * bonus, e.x, e.y);
  // Drawn in from a distance rather than walked into: show it arriving, or
  // a PULSE that empties the floor is a number in the corner going up.
  if (streak) {
    const s = world.shooter;
    haul(e.x, e.y, s.x, s.y, '#9fe8ff', 0.42, 2.6);
  }
  e.energy = 0;
  e.dead = true;
  e.dissolved = true;
}

export function collectEnergy(world, dt) {
  const S = CFG.energy;
  const s = world.shooter;
  const list = world.drops;
  const auto = world.up.intake;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead || !e.energy) continue;
    const dx = s.x - e.x;
    const dy = s.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (auto) {
      // Landed on the turret. Touching, not merely near: the reach is the two
      // radii and a little, the same test contact uses for everything else.
      const rr = s.r + e.r + 2;
      if (d2 <= rr * rr) {
        absorb(world, e);
        continue;
      }
    }
    const d = Math.sqrt(d2) || 1;
    e.vx += (dx / d) * S.pull * dt;
    e.vy += (dy / d) * S.pull * dt;
  }
}

/**
 * Where the i-th member of a shape sits, relative to the shape's centre.
 *
 * Pulled out of spawnFormation when the debug screen grew a shape picker: two
 * copies of this switch would have let a RING mean one thing to the director
 * and another to the panel meant for inspecting it.
 */
function formationOffset(shape, i, count, gap) {
  const k = i - (count - 1) / 2;
  switch (shape) {
    case 'line': return [k * gap, 0];
    case 'wedge': return [k * gap, -Math.abs(k) * gap * 0.8];
    case 'column': return [spread(6), -i * gap];
    case 'arc': return [k * gap, -(k * k) * gap * 0.16];
    case 'ring': {
      const a = (i / count) * TAU;
      return [Math.cos(a) * gap * 1.1, Math.sin(a) * gap * 1.1];
    }
    default: return [spread(gap * 1.4), spread(gap * 1.4)];
  }
}

/** A formation queued above the screen, marching down into it. */
export function spawnFormation(world, kinds, count) {
  const shape = pick(FORMATIONS);
  // Somewhere across the width, with enough room either side for the shape.
  const half = Math.min(world.width * 0.22, 190);
  const cx = clamp(world.width / 2 + spread(world.width * 0.5), half, world.width - half);
  // A formation is one type in a shape; a shape made of towed pairs is not a
  // formation, it is a traffic jam, and it would cost double the allotment.
  const single = kinds.filter((k) => !k.tows);
  const type = weightedPick(single.length ? single : kinds);
  const gap = type.r * 2.5 + 8;
  const made = [];

  for (let i = 0; i < count; i++) {
    const [ox, oy] = formationOffset(shape, i, count, gap);
    const x = clamp(cx + ox, type.r + 4, world.width - type.r - 4);
    const y = -60 + oy - rand(0, 30);
    /*
     * release(), not spawnOne(). The line above drops towed types when there
     * is anything else to pick, but with a single kind there is nothing to
     * fall back to -- and spawnOne on a TOW makes a head with no MASS and no
     * cable, which is not a TOW at all. Unreachable until build 110 only
     * because the TOW waves never actually played; the director refuses to
     * form them up either, so this is the belt to that pair of braces.
     */
    made.push(...release(world, type, x, y, { speedScale: rand(0.94, 1.06) }));
  }
  return made;
}

/** The shapes a group can be asked for by name. */
export const FORMATION_SHAPES = FORMATIONS;

/** Nobody needs forty BULWARKs, and the frame time says so. */
export const GROUP_MAX = 24;

/**
 * One named group, exactly as asked for: this type, this many, this shape,
 * arriving this way.
 *
 * spawnFormation deliberately rolls its own type and drops the towed pair,
 * because inside a run a formation of TOWs is a traffic jam rather than a
 * formation. The debug screen wants the opposite of all of that -- the point
 * there is to get the thing you pointed at, and a wall of TOWs is a legitimate
 * thing to want to look at once.
 *
 *   where: 'entry' queues it above the screen so the march in is part of what
 *          you see; 'field' puts it down in the arena already loose, which is
 *          the only way to watch a behaviour that only starts after the entry
 *          line -- warding, feeding, splitting.
 */
export function spawnGroup(world, id, count, opts = {}) {
  const type = TYPE_BY_ID[id];
  if (!type) return [];
  const n = clamp(Math.round(count) || 1, 1, GROUP_MAX);
  const shape = FORMATIONS.includes(opts.shape) ? opts.shape : pick(FORMATIONS);
  const onField = opts.where === 'field';
  const gap = type.r * 2.5 + 8;
  const half = Math.min(world.width * 0.3, 200);
  const cx = clamp(opts.x ?? world.width / 2 + spread(world.width * 0.4), half, world.width - half);
  // On the field, somewhere with room to be watched: below the entry line so
  // nothing is still marching, and clear of the floor so nothing lands on it.
  const lo = ENTRY_Y + CFG.entryDepth + 90;
  const hi = Math.max(lo + 40, world.floorY - 220);
  const cy = onField ? clamp(opts.y ?? rand(lo, hi), lo, hi) : -60;
  const made = [];

  for (let i = 0; i < n; i++) {
    const [ox, oy] = formationOffset(shape, i, n, gap);
    const x = clamp(cx + ox, type.r + 4, world.width - type.r - 4);
    const y = onField
      ? clamp(cy + oy, ENTRY_Y + 40, world.floorY - type.r - 24)
      : cy + oy - rand(0, 30);
    // Drift is not released, it is let go: it has its own entry velocities and
    // is not counted against anything.
    if (type.harmless) { made.push(spawnDrift(world, { x, y })); continue; }
    made.push(...release(world, type, x, y, {
      staged: !onField,
      spawnIn: onField ? 0.25 : 1,
      speedScale: rand(0.94, 1.06),
    }));
  }
  return made;
}

/** Loose, aimless matter that comes down with everything else. */
export function spawnDrift(world, opts = {}) {
  const type = TYPE_BY_ID.drift;
  const x = opts.x ?? clamp(world.width / 2 + spread(world.width * 0.8),
    type.r + 6, world.width - type.r - 6);
  const y = opts.y ?? ENTRY_Y + rand(10, 40);
  const e = new Enemy(type, x, y, { staged: false, spawnIn: 1, vx: spread(30), vy: rand(10, 50) });
  world.enemies.push(e);
  return e;
}

/**
 * The wave runner. Objects arrive in groups with a beginning and an end, and
 * the quiet between two of them is the point — a trickle never finishes and
 * so never starts.
 *
 * Nothing here is ever named on screen. There is no counter and no banner: a
 * number would turn a rhythm into a score.
 */
export class Director {
  constructor() {
    this.reset();
  }

  reset() {
    // The field starts empty and stays empty for a while. There is an
    // interface to find, a lever to try and two things already in hand before
    // the first object is released, and none of that should be done while
    // reacting. Harmless drift comes well before any of it, so there is
    // something to shoot at while the field is still safe.
    this.driftTimer = CFG.driftStart;
    this.order = []; // wave indices, in the order they will be played
    this.at = -1; // which of `order` is running; -1 is "not started"
    this.cycle = 0; // full passes finished — the first one carries the opening
    this.jobs = []; // what is left to release in the running wave
    this.asked = 0; // how many the running wave asked for, after the swell
    this.timer = CFG.openingGrace; // until the next release, or the next wave
    this.wait = 0; // how long this wave has been waiting for the field to thin
    this.resting = true; // between waves rather than inside one
  }

  /** Every type in a wave has to have unlocked before the wave is eligible. */
  eligible(world, wave) {
    return wave.of.every(([id]) => world.kills >= (TYPE_BY_ID[id].unlock || 0));
  }

  /**
   * Build the next rotation. The first one leads with the opening waves in
   * their authored order; every one after that drops them for good and simply
   * shuffles whatever has unlocked.
   */
  shuffle(world) {
    const rest = [];
    WAVES.forEach((wv, i) => { if (!wv.teach && this.eligible(world, wv)) rest.push(i); });
    // Fisher-Yates. Order past the opening is meant to be arbitrary.
    for (let i = rest.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const open = this.cycle === 0
      ? WAVES.map((wv, i) => (wv.teach ? i : -1)).filter((i) => i >= 0)
      : [];
    this.order = [...open, ...rest];
    this.at = -1;
    this.cycle++;
  }

  /**
   * Expand a wave into the list of releases it will make.
   *
   * Three or more of one type in a regular wave arrive together in formation,
   * because six MOTEs in a wedge is a wave and six MOTEs filing in one at a
   * time is a queue. Tutorial waves never form up — they always file in, one
   * object at a time, which is the whole of what makes the opening readable.
   */
  load(world, wave) {
    const W = CFG.waves;
    // How much bigger this wave is than it was authored. Tutorial waves are
    // authored at exactly the size they should be and never swell.
    const progress = clamp(world.kills / W.swellKills, 0, 1);
    // ...and the flat population multiplier on top of it. Tutorial waves are
    // exempt from both: they are authored at exactly the size they teach at.
    const swell = wave.teach ? 1
      : (W.swell[0] + (W.swell[1] - W.swell[0]) * progress) * W.population;
    const jobs = [];
    let asked = 0;
    for (const [id, base] of wave.of) {
      const type = TYPE_BY_ID[id];
      if (!type) continue;
      const n = Math.max(1, Math.round(base * swell));
      asked += n;
      if (!wave.teach && n >= W.formAt) jobs.push({ type, n });
      else for (let i = 0; i < n; i++) jobs.push({ type, n: 1 });
    }
    this.asked = asked;
    // Interleaved rather than type by type, so a mixed wave arrives mixed.
    if (!wave.teach) {
      for (let i = jobs.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
      }
    }
    this.jobs = jobs;
    this.wait = 0;
    // A wave may ask for grey drift alongside it. It is not hostile, costs
    // nothing from the allotment, and is the whole of both the opening and the
    // bonus wave. Stacked upward rather than dropped in one row, so twenty-two
    // of them arrive as a shower over a few seconds instead of a wall.
    const want = wave.drift || 0;
    for (let i = 0; i < want; i++) {
      if (driftCount(world) >= CFG.waves.driftCap) break;
      spawnDrift(world, want > 4 ? { y: ENTRY_Y + rand(10, 40) - i * 30 } : {});
    }
  }

  /*
   * Waves that have unlocked since this rotation was built, spliced into what
   * is left of it.
   *
   * The rotation used to be a snapshot: shuffle() read eligibility once, at
   * the top of a cycle, and nothing rejoined until the next one. A run is five
   * cycles and the last is built at around 317 kills, so GLUT (330) and TOW
   * (380) unlocked into a rotation that had already been decided and then ran
   * out of allotment before another was built. Measured over 30 driven runs
   * before this: both played 0% of the time. They were authored, reachable in
   * the debug screen, in the codex -- and unreachable in an actual run.
   *
   * Spliced ahead of the playhead at a random point rather than appended, so
   * a late unlock is not always the very last thing you see.
   */
  admit(world) {
    const already = new Set(this.order);
    let added = 0;
    WAVES.forEach((wv, i) => {
      if (wv.teach || already.has(i) || !this.eligible(world, wv)) return;
      const room = this.order.length - this.at;
      const at = this.at + 1 + ((Math.random() * Math.max(1, room)) | 0);
      this.order.splice(at, 0, i);
      added++;
    });
    return added;
  }

  /** The wave currently running, or null before the first one starts. */
  get wave() {
    const i = this.order[this.at];
    return i === undefined ? null : WAVES[i];
  }

  /**
   * Stand the runner back up from a save. The wave is *restarted*, not
   * resumed: you come back to the wave you left on, from the top of it. Half
   * a wave is not a place anyone remembers being.
   */
  restore(world, d) {
    // Nothing to come back to: a run that quit before its first wave started
    // is left exactly as a fresh one, opening grace and tutorial waves and
    // all. The tooltips it already saw still do not replay — those are kept
    // separately, and seen is seen.
    if (!d || !Array.isArray(d.order) || !d.order.length) return;
    this.order = d.order.filter((i) => Number.isInteger(i) && i >= 0 && i < WAVES.length);
    // One *behind* the saved wave, because the first begin() steps forward and
    // has to land back on it. Setting `at` to the saved index directly is how
    // "resume on the wave I left" quietly became "resume on the one after".
    const was = Math.min(d.at ?? 0, this.order.length - 1);
    this.at = Math.max(-1, was - 1);
    this.cycle = d.cycle || 1;
    this.resting = true;
    this.timer = 1.5; // a beat to look at the field before it starts again
    this.jobs = [];
    this.asked = 0;
  }

  update(world, dt) {
    if (world.phase !== 'staging') return;

    // A slow trickle of aimless matter, all run, independent of the waves.
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = rand(CFG.waves.drift[0], CFG.waves.drift[1]);
      if (driftCount(world) < CFG.maxDrift) spawnDrift(world);
    }

    this.timer -= dt;

    if (this.resting) {
      if (this.timer > 0) return;
      this.begin(world);
      return;
    }

    // Still letting the wave out.
    if (this.jobs.length) {
      if (this.timer > 0) return;
      this.emit(world);
      return;
    }

    // Everything is out. The wave ends when the field thins — or when patience
    // runs out, so one object loitering out of reach can never stall the run.
    this.wait += dt;
    // A wave may hold the field for a minimum time regardless of how fast it
    // clears. The opening uses it so the lines about DRIFT are read against a
    // field that has nothing else on it.
    const wv = this.wave;
    if (wv && wv.dwell && this.wait < wv.dwell) return;
    // Proportional to what this wave let out, so a big wave is not held to the
    // same empty field as a small one and does not simply time out every time.
    const thinAt = Math.max(CFG.waves.clearTo, Math.round(this.asked * CFG.waves.thinFrac));
    if (hostileCount(world) > thinAt && this.wait < CFG.waves.patience) return;
    const teach = this.wave && this.wave.teach;
    const rest = teach ? CFG.waves.teachRest : CFG.waves.rest;
    this.resting = true;
    this.timer = rand(rest[0], rest[1]);
  }

  /** Start the next wave, rebuilding the rotation if this one is spent. */
  begin(world) {
    if (releasesLeft(world) <= 0) { this.timer = 1; return; }
    if (this.order.length) this.admit(world);
    if (this.at + 1 >= this.order.length) this.shuffle(world);
    if (!this.order.length) { this.timer = 1; return; }
    this.at++;
    this.load(world, this.wave);
    this.resting = false;
    this.timer = 0;
  }

  /** Put the next job on the field. */
  emit(world) {
    const wave = this.wave;
    const gap = wave && wave.teach ? CFG.waves.teachGap : CFG.waves.gap;
    this.timer = rand(gap[0], gap[1]);

    const quota = releasesLeft(world);
    if (quota <= 0) { this.jobs.length = 0; return; }
    // The field cap is a hard ceiling on top of the wave. Hold the job rather
    // than dropping it: a wave is a group, and losing half of it to a cap the
    // player is about to clear would make waves quietly inconsistent.
    if (hostileCount(world) >= CFG.maxEnemies) return;

    const job = this.jobs.shift();
    if (!job) return;
    const t = job.type;
    // A TOW is two bodies and costs two of the allotment.
    const cost = t.tows ? 2 : 1;
    if (quota < cost) { this.jobs.length = 0; return; }

    // A shape made of towed pairs is a traffic jam rather than a formation,
    // and costs double the allotment for it. They file in.
    if (job.n > 1 && !t.tows) {
      const room = Math.min(job.n, quota, CFG.maxEnemies - hostileCount(world));
      if (room >= 2) { spawnFormation(world, [t], room); return; }
    }
    let x = rand(t.r + 12, world.width - t.r - 12);
    // Two SCIONs arriving on top of each other seed the same host twice and
    // read as one event rather than two decisions.
    if (t.id === 'scion') x = scionLane(world, t, x);
    release(world, t, x, -50 - rand(0, 40));
  }
}

/** Area damage + shove, used by blooms, mines and PULSE. */
/**
 * A SEED reaching a host. It does not dissolve into it: it attaches, and stays
 * attached as a ball riding the outside of the body.
 *
 * The host keeps being whatever it was — its shape, its route, its behaviour —
 * and every ball on it makes it a little larger, a little tougher, and closes
 * its wounds a little faster. Nothing is replaced, because "that BLOOM is now
 * a problem" is a much better read than "a new object appeared".
 *
 * Up to `CFG.graft.stack` of them, so a SCION's three can all land on the same
 * body and make one monster of it. Each is a separate target with its own
 * health, and shooting one off takes its whole share back — which is the way
 * out of a body that is otherwise healing faster than you can hurt it.
 */
export function graft(world, host) {
  const G = CFG.graft;
  if (!host || host.dead || host.graftCount >= G.stack) return false;

  // First one: remember what the body was, so every later recount is measured
  // from the same place rather than from whatever the last one left behind.
  if (!host.grafts) {
    host.grafts = [];
    host.graftBaseR = host.r;
    host.graftBaseHp = host.maxHp;
    host.graftBaseEnergy = host.energy || 0;
    host.graftSpin = rand(0.7, 1.3) * (Math.random() < 0.5 ? -1 : 1) * G.spin;
  }

  // Spaced around the ring by slot, so a second and a third land opposite what
  // is already there instead of stacking into one bright dot.
  const slot = host.grafts.length;
  host.grafts.push({
    a: (slot / G.stack) * TAU + rand(-0.3, 0.3),
    alive: true,
    hp: G.hp,
    maxHp: G.hp,
  });
  host.refreshGrafts();

  host.flash = 1;
  ring(host.x, host.y, host.r * 0.5, host.r * 2.6, 0.5, '#c9a7ff', 3);
  ripple(host.x, host.y, 1.2, host.r * 5);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU);
    spark(host.x, host.y, Math.cos(a) * rand(90, 260), Math.sin(a) * rand(90, 260), '#d9c2ff', rand(0.24, 0.5), 2.2);
  }
  audio.reflect();
  return true;
}

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
      /*
       * The balls on a grafted body take the blast too, each judged from where
       * it actually is. Without this a mine or a PULSE could only ever hurt
       * the host, and a build with no precise shot in it had no answer at all
       * to a body carrying three of them.
       */
      if (e.graftCount) {
        // `orbit` is read once, outside the loop, and that is load-bearing:
        // taking a ball off shrinks the host and moves the ring the rest ride,
        // so reading it per ball would judge the second and third against an
        // orbit the blast never saw. One shockwave, one set of positions.
        const orbit = e.graftR;
        for (const g of e.grafts) {
          if (!g.alive) continue;
          const gx = e.x + Math.cos(g.a) * orbit;
          const gy = e.y + Math.sin(g.a) * orbit;
          const gd2 = (gx - x) ** 2 + (gy - y) ** 2;
          if (gd2 > r2) continue;
          const gf = 1 - Math.sqrt(gd2) / r;
          e.hitGraft(g, damage * (0.35 + gf * 0.65), gx, gy);
        }
      }
      e.applyDamage(world, damage * (0.35 + falloff * 0.65), nx, ny, impulse * falloff);
    }
  };
  hit(world.enemies);
  hit(world.drops);

  // Wreckage is pulverised rather than split by a shockwave: a PULSE turning
  // one plate into three next to the turret would be adding clutter exactly
  // where it was meant to be clearing it. Downward from the captured length,
  // so nothing added mid-loop is walked.
  if (world.debris) {
    for (let i = world.debris.length - 1; i >= 0; i--) {
      const c = world.debris[i];
      if (c.dead) continue;
      const dx = c.x - x;
      const dy = c.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      c.shatter(world, dx / d, dy / d, false);
    }
  }

}
