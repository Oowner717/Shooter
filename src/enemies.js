// The objects. Each one is a physics body with a steering brain, a way to die
// and a hand-drawn look. Nothing here knows about the rest of the game beyond
// the `world` handle it is given.

import { CFG, WAVES, TYPE_BY_ID, ROUTES, massOf } from './config.js';
import { traitsFor, traitAt, has as hasTrait, TRAIT_BY_ID } from './traits.js';
import { TAU, clamp, rand, spread, pick, weightedPick, rgba, drawGlow } from './util.js';
import { explode, hitBurst, impactFx, deathFx, spark, dot, shard as fxShard, ring, ripple, haul } from './fx.js';
import { audio } from './audio.js';
import { shed } from './debris.js';
import { contactAt } from './physics.js';

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
    case 'tally': drawTally(ctx, r, 1); break;
    case 'ordinal': drawOrdinal(ctx, r, 0, 0, 1); break;
    case 'digit': drawDigit(ctx, r, 0, 0); break;
    case 'dial': drawDial(ctx, r, 1); break;
    case 'gnomon': drawGnomon(ctx, r, 0, 0, 1); break;
    case 'second': drawSecond(ctx, r, 0, 0); break;
    case 'mite': drawTri(ctx, r, 1, 0); break;
    case 'fraction': drawTri(ctx, r, 1, 1); break;
    case 'fractal': drawTri(ctx, r, 1, 2); break;
    case 'crest': drawCrest(ctx, r, 1); break;
    case 'amplitude': drawAmplitude(ctx, r, 0, 0, 1); break;
    case 'droplet': drawDroplet(ctx, r, 0, 0); break;
    case 'pylon': drawPylon(ctx, r, 1); break;
    case 'dynamo': drawDynamo(ctx, r, 0, 0, 1); break;
    case 'ion': drawIon(ctx, r, 0, 0); break;
    case 'pane': drawPane(ctx, r, 1); break;
    case 'parity': drawParity(ctx, r, 0, 0, 1); break;
    case 'echo': drawEcho(ctx, r, 0, 0); break;
    case 'bound': drawBound(ctx, r, 1); break;
    case 'terminus': drawTerminus(ctx, r, 0, 0, 1); break;
    case 'limit': drawLimit(ctx, r, 0, 0); break;
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

/**
 * What a body is made of.
 *
 * Every hostile in the game was drawn by one recipe -- a 16% fill, a stroke
 * between 55% and 100%, and a line 9% of the radius -- for all thirty-seven
 * shapes, with no exceptions. So the only two things separating a body from
 * any other body on the screen were its hue and its silhouette, and at a full
 * field both saturate: seven hues at the same value and the same optical
 * weight, nothing in front of anything, and no way to pick out the thing that
 * is about to hurt you.
 *
 * Nothing new had to be invented to fix that. The table already knows what
 * each of these weighs -- `density` runs from 0.5 on a SEED to 7 on a PYLON,
 * a fourteen-fold range -- and it already knows which of them are armoured.
 * The draw simply never read either. So weight is where the material comes
 * from: a light thing is nearly hollow with a fine line, a heavy thing is
 * dense with a thick one, and an armoured thing carries a second line inside
 * the first because it is plated.
 *
 * The curve saturates at 2.7, which is BULWARK -- the heaviest thing on an
 * ordinary field. Everything above it is boss structure at 5 to 7, which is
 * a wall and should read as one.
 *
 * Memoised on the type, because this is per-body per-frame and a full field
 * is fifty-seven of them.
 */
export function materialOf(t) {
  if (t._mat) return t._mat;
  const heavy = clamp(((t.density ?? 1) - 0.5) / 2.2, 0, 1);
  t._mat = {
    heavy,
    fill: 0.07 + heavy * 0.3, // 0.07 wisp, 0.37 solid
    line: 0.062 + heavy * 0.072, // x radius
    plate: !!t.armor,
  };
  return t._mat;
}

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
    /*
     * Seconds left of dissolving out of a simulation that has been stepped
     * back. Declared here rather than sprung into existence at the site that
     * sets it, because `spent` and `dissolved` were both written that way and
     * both are `undefined` on every body that never met the one thing that
     * writes them -- which is how you end up grepping the repo to find out
     * whether a field exists.
     */
    this.fizzle = 0;
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
    // Seconds left of being thrown clear, during which it does not steer. The
    // anomalies do the throwing; an offer called EBB used to as well, and that
    // system is gone. Not the build-204 TRAIT of the same name, which is about
    // which way wreckage drifts and never touches this.
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
    this.traits = null; // the wave's rules, if it was released by a traited one
    this.plateT = 0; // ARMORED: until the plate turns another hit away
    this.hitAt = 0; // MENDING: when this body was last hurt
    this.hitAt2 = 0; // ...and the time before that, so "twice within" is real
    // What last hit this body and when -- the death wears it if it is fresh.
    // A name from the round's flight form ('flake', 'shell'...), never from
    // an ability, so every kill in the canonical fight stays off the path.
    this.lastHit = null;
    this.lastHitT = -1;
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
    // Fixed bodies are placed, not steered — see drive(). Nudging one toward
    // the middle just fights the boss for the same frame. Their salvage is
    // not fixed and wants the wall like anything else.
    if (this.type.fixed && !this.isDrop) return;
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
      // ...nor onto ORDINAL. A graft grows its host and heals it, and the one
      // thing a segment of a frame must not do is change size: the frame is
      // built to close exactly, and a grafted panel would open a hole in it
      // that no round made. A SCION already on the field when the way opens
      // is the only way this could ever have come up, which is exactly the
      // kind of thing that turns up once and is never reproducible.
      if (e.type.fixed) continue;
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
   * -- and a NEEDLE that stops pointing where it is going the moment something
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
    // ORDINAL's frame and its core. Their position is the boss's business,
    // not physics' — see src/boss.js. They are still solid, still take hits
    // and still come apart; they simply do not go anywhere.
    /*
     * ...but only a body. A drop is built from the type it fell off, so
     * ORDINAL's salvage and every TALLY's carried `fixed` and was pinned by
     * this line the instant it existed: velocity zeroed every frame, no
     * steering, no drift to the turret. The whole payout of a boss sat in a
     * frozen cloud where the frame had been and could not be collected.
     */
    if (this.type.fixed && !this.isDrop) { this.vx = 0; this.vy = 0; return; }
    // Thrown clear and not yet recovered. It coasts: the whole point of a shove
    // is that the field comes off you, and a body that starts steering back on
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
      /*
       * EBB: wreckage goes the other way.
       *
       * Only the wreckage -- the bodies still close as they always did, or
       * the trait would be a rest rather than a rule. The mote steers at a
       * point reflected through itself, so it uses the same steering it
       * already had and simply wants the opposite thing; PULSE and INTAKE
       * still overrule it, because taking energy in by hand is the answer to
       * this and it should keep working.
       */
      if (this.isDrop && this.traits && hasTrait(this.traits, 'ebb')) {
        tx = this.x * 2 - tx;
        ty = this.y * 2 - ty;
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
    /*
     * Dissolving. It steers nothing, heals nothing and answers to nothing --
     * the run it belonged to is being taken back, and the only thing left for
     * it to do is stop being on the screen. `dead` at the end of it, which is
     * what the sweep is watching for; `dissolved` was set with the fizzle, so
     * the sweep pays nothing and counts nothing for it.
     */
    if (this.fizzle > 0) {
      this.fizzle -= dt;
      if (this.fizzle <= 0) this.dead = true;
      return;
    }
    if (this.spawnIn > 0) this.spawnIn = Math.max(0, this.spawnIn - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.slugged > 0) this.slugged = Math.max(0, this.slugged - dt);
    if (this.plateT > 0) this.plateT = Math.max(0, this.plateT - dt);
    /*
     * MENDING: it closes unless you keep hitting it.
     *
     * Stopped by TWO hits inside the window rather than one, so a stray round
     * cannot switch the rule off -- with one, MENDING would be a rule about
     * the opening seconds of a wave and nothing after. It is deliberately the
     * same verb as a graft's regen and a different reason: a graft is
     * something stuck to the body and shot off, this is the body itself.
     */
    if (this.traits && !this.isDrop && this.hp < this.maxHp
        && hasTrait(this.traits, 'mending')) {
      const T = CFG.waves.tier;
      const now = world.time || 0;
      const pressed = now - this.hitAt2 < T.mendWindow;
      if (!pressed) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * T.mendRate * dt);
    }

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
   * `dirx, diry` is the round's unit TRAVEL DIRECTION, not a surface normal.
   *
   * It was called `nx, ny` for eleven builds and that name is the direct cause
   * of three separate faults fixed in 211 -- PRISM's incidence test, both
   * ricochets and the impact spin all read it as a normal, because it is
   * spelled like one. The real normal comes from `contactAt` and is `c.nx,
   * c.ny`; nothing should take a normal from this argument.
   *
   * @returns 'reflect' | 'hit'
   */
  takeHit(world, dmg, hx, hy, dirx, diry, impulse, shred = 0, form = null, pr = 0) {
    /*
     * Where it actually landed. See `contactAt` in physics.js: the point the
     * projectile sweep hands over is a clamped closest-point on one frame of
     * travel, so only its component ACROSS the travel means anything -- and
     * that component is the exact impact parameter.
     */
    const c = contactAt(this, hx, hy, dirx, diry, pr);

    /*
     * Prisms bounce glancing bolts; only a square-on hit lands.
     *
     * That is what this has always said and, until build 211, not what it did.
     * The old test was `((hx - x) / r, (hy - y) / r) . (dirx, diry)`, which
     * divides by the RADIUS rather than by the offset's own length -- so it
     * reduced to how far along its last step the round happened to stop, and
     * the impact parameter did not enter it at all. Measured across five
     * sub-frame phases at eleven offsets: a dead-centre shot landed three
     * times in five and bounced twice, and the incidence column was identical
     * for every offset from 0 to 0.4r. A lottery on the frame boundary, with
     * `reflect: 0.55` fitted to it.
     */
    if (this.type.reflect && c.incidence < this.type.reflect) {
      audio.reflect();
      return 'reflect';
    }

    if (form) {
      this.lastHit = form;
      this.lastHitT = world.time;
    }
    // The shove is along the travel, which is what this argument is.
    this.applyDamage(world, dmg, dirx, diry, impulse, shred, c.b);
    /*
     * The landing, per form -- AT THE CONTACT, ALONG THE NORMAL.
     *
     * Build 211 derived both of those and then drew the burst with neither.
     * It passed `hx, hy` -- the clamped closest point on one frame of travel,
     * which is the one part of the hit `contactAt`'s own header says is
     * meaningless -- and `-dirx, -diry`, which is the reversed travel wearing
     * a normal's old name. So the mechanics of an impact were right from 211
     * and the picture of one was still the picture from 210.
     *
     * Measured over two live runs, 304 landed hits: the burst was drawn a
     * median 20.9 world units from where the round actually met the surface
     * (p90 36.6, max 45.0 -- a whole BULWARK radius), and 10.4% of bursts were
     * drawn OUTSIDE the body they hit. Systematically short, too, never long:
     * the step ends before the surface, so every burst sat between the turret
     * and the impact, which is why it never looked obviously wrong.
     *
     * And the direction mattered as much as the point. `hitBurst` sprays in a
     * cone about the vector it is handed, so reversed travel threw every
     * impact straight back down the barrel line -- a rim graze and a centre
     * punch sprayed identically. `c.nx, c.ny` is the real outward normal at
     * the contact, so a graze now comes off the surface.
     *
     * ORDINAL's canonical hash does not move for this, and the reason is
     * exact rather than hopeful: the hash mixes body positions and energy,
     * particles are neither, and `hitBurst` makes the same number of rand()
     * draws wherever it is told to put them. The load-bearing property of the
     * default path is its DRAW COUNT, which is untouched. Re-run to confirm:
     * 1796395127.
     */
    if (form) impactFx(form, c.x, c.y, c.nx, c.ny, this.type.glow);
    else hitBurst(c.x, c.y, c.nx, c.ny, this.type.glow);
    return 'hit';
  }

  /**
   * @param lever the signed impact parameter, when the caller knows where the
   *   hit landed. A blast has no lever arm by construction -- it pushes
   *   through the centre -- so everything else leaves this at 0.
   */
  /**
   * @param throwOff a deliberate shove rather than a hit that happens to
   *   push. It skips the diminishing-returns fade and lifts the body's speed
   *   cap for a moment -- see the note at the fade below.
   */
  applyDamage(world, dmg, nx = 0, ny = 0, impulse = 0, shred = 0, lever = 0, throwOff = false) {
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
    /*
     * ARMORED: the first hit each second does nothing.
     *
     * Before the plate and before the ward, because it is not a reduction --
     * the hit did not happen. A rate rather than a percentage on purpose: it
     * costs a fast turret almost nothing and a slow one a great deal, which
     * is the one axis the roster's own armour does not already cover.
     */
    if (this.traits && hasTrait(this.traits, 'armored') && this.plateT <= 0) {
      this.plateT = CFG.waves.tier.plateEvery;
      this.flash = Math.min(1, this.flash + 0.35);
      return;
    }
    // MENDING counts hits, and needs the one before last: two inside the
    // window stop it closing. One stray round must never switch a rule off.
    this.hitAt2 = this.hitAt;
    this.hitAt = world.time || 0;
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
      /*
       * Diminishing returns on a stream of hits — see shoveFade(). A
       * deliberate THROW does not pay it, and does not pay the speed cap
       * either.
       *
       * PULSE paid both, and it is the game's one escape from a body on the
       * mount. Measured on a BULWARK, which needs 6.4 units of separation to
       * be released: quiet, a PULSE moves it 6.38 -- it fails by two
       * hundredths. Under ordinary fire `kicked` settles at 4.25, the fade is
       * 0.19, and the same PULSE moves it 0.35 units. So the turret shooting
       * disarmed the only answer to the glitch timer, and `world.attackers`
       * never emptied, so `Director.held` never reset and the fuse kept
       * closing through the press.
       *
       * The cap is the other half: `physics.integrate` clamps to `cruise * 6`
       * unless `thrown` is set, and applyBlast never set it -- so PULSE was
       * clipped on 8 of the 14 field types (a MOTE took 24% of its rated
       * shove) and SHOCKFRONT's +30% bought those eight exactly nothing.
       *
       * Opt-in, so a mine or an HE burst is unchanged: only a caller that
       * says it is throwing gets it.
       */
      const fade = throwOff ? 1 : 1 / (1 + (this.kicked || 0));
      if (!throwOff) this.kicked = (this.kicked || 0) + fade;
      if (throwOff) this.thrown = Math.max(this.thrown || 0, CFG.pile.thrown);
      const push = impulse * this.invMass * fade;
      /*
       * The linear part is UNCHANGED, and deliberately so: an impulse applied
       * off-centre still delivers all of itself to the centre of mass. Where
       * it landed adds angular momentum; it does not subtract linear. So this
       * change costs the knockback ladder nothing -- HEAVY is worth exactly
       * what it was worth -- and buys the spin for free.
       */
      this.vx += nx * push;
      this.vy += ny * push;
      /*
       * ...and the spin is now the lever arm rather than a coin toss.
       *
       * Δω = L/I with I = ½mr² for a uniform disc, which is the same model
       * `resolvePair` already uses for collision friction -- so a body shoved
       * by a round and a body scraped by another body agree about what spin
       * means. It used to be `spread(push * 0.02)`: a scatter proportional to
       * the shove and unrelated to where the round hit, so a rim shot and a
       * centre punch span the same amount, in a random direction.
       *
       * ---- and the sign is NEGATIVE, which build 211 got wrong ----
       *
       * `lever` is measured along `perp = (-diry, dirx)`, and the impulse is
       * `push` along `dir`, so the angular impulse is
       *
       *   L = r x J = (b*perp.x)(push*dir.y) - (b*perp.y)(push*dir.x)
       *             = b*push*(-dir.y*dir.y - dir.x*dir.x)
       *             = -b*push
       *
       * -- the two terms of the cross product have the same sign here, not
       * opposite ones, because `perp` is the travel turned a quarter turn one
       * way and the cross product turns it the other. Shipped as `+` and every
       * body on the field turned the wrong way: measured across six
       * arrangements of travel and offset, all six inverted. A round from
       * below striking left of centre pushes the left side away from you,
       * which is CLOCKWISE on a canvas whose y runs down, and it went
       * anticlockwise.
       *
       * Capped in `integrate`, because the honest value is very fast on a
       * light body -- see CFG.physics.maxSpin.
       */
      if (lever) this.av -= (2 * lever * push) / (this.r * this.r);
    }
    /*
     * TETHERED: the pair is one body with two shapes.
     *
     * Written across rather than halved, so shooting either half is shooting
     * the same health -- which is the point, and is what makes a tethered
     * pair different from two bodies that happen to be joined. Guarded on the
     * other half being alive and traited, so a TOW's own tether (which shares
     * nothing) is untouched.
     */
    const o = this.tether && this.tether.other;
    if (o && !o.dead && o.traits && hasTrait(o.traits, 'tethered')
        && hasTrait(this.traits, 'tethered')) {
      o.hp = this.hp;
      o.flash = this.flash;
      if (o.hp <= 0) o.destroy(world);
    }
    if (this.hp <= 0) this.destroy(world);
  }

  destroy(world) {
    if (this.dead) return;
    /*
     * A body finished off while it is dissolving is not a kill and pays
     * nothing, whatever finished it.
     *
     * The fizzle marks `spent`, so rounds pass straight through and the
     * assist will not look at it -- but `spent` has only ever had three
     * readers (autoTarget, its hysteresis, and the projectile sweep) and
     * blasts, mines, patches and every ability still test `dead` alone. So
     * the guard belongs here, at the one door all of them come through,
     * rather than on each of them.
     */
    if (this.fizzle > 0) { this.dead = true; return; }
    this.dead = true;
    const t = this.type;
    // Destroying a fragment is a way of collecting it, not a way of losing it.
    if (this.energy) bank(world, this.energy * this.bounty, this.x, this.y);
    // The harmless ones pay too. It is the one income the tally never sees.
    else if (this.harmless) bank(world, CFG.energy.drift * this.bounty, this.x, this.y);
    explode(this.x, this.y, this.r, t.color, t.glow, this.isDrop ? 0.55 : 1);
    /*
     * ...and the death wears what killed it, if the kill is fresh: frozen
     * through, burned out, earthed, bisected, crushed, gone to spores, or
     * paid in full. Half a second of freshness, because a body tagged by
     * RIME a while ago and finished by a PULSE did not die of ice.
     */
    if (this.lastHit && world.time - this.lastHitT < 0.5 && !this.isDrop) {
      deathFx(this.lastHit, this.x, this.y, this.r);
    }
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
    // harmless bodies, so nothing about them is owed to the field cap.
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
      // A body carrying shards releases only the ones still on it: shoot the
      // plates off a WARDEN and there are fewer left to come at you when the
      // core finally goes.
      const alive = this.shards ? this.shards.filter((sh) => sh.alive).length : t.splits.count;
      const count = Math.min(t.splits.count, alive);
      for (let i = 0; i < count; i++) {
        // a little over the cap: a split should not be silently swallowed
        if (hostileCount(world) >= CFG.maxEnemies + 8) break;
        const a = (i / count) * TAU + rand(0, 1);
        const sp = rand(90, 190);
        const kid = new Enemy(child, this.x + Math.cos(a) * this.r * 0.7, this.y + Math.sin(a) * this.r * 0.7, {
          vx: this.vx * 0.5 + Math.cos(a) * sp,
          vy: this.vy * 0.5 + Math.sin(a) * sp,
          staged: this.staged,
          spawnIn: 0.6,
        });
        world.enemies.push(kid);
        world.released++;
        // Made HERE rather than released, so it never goes through spawnOne:
        // it takes the wave off the body it came out of. See tagBody.
        tagBody(world, kid, this);
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
      const mote = world.drops[world.drops.length - 1];
      mote.bounty = this.bounty;
      // ...and so does the wave's rule, for the same reason: EBB is a rule
      // about wreckage, and wreckage is made here rather than released.
      mote.traits = this.traits;
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, world) {
    const t = this.type;
    const hpFrac = clamp(this.hp / this.maxHp, 0, 1);
    /*
     * Two scales, one variable. Arriving grows in from 0.4; dissolving shrinks
     * away and takes the whole body's opacity with it, so a fizzled field
     * reads as the picture being withdrawn rather than as forty things dying
     * at once -- there is no explosion anywhere in it, which is the point.
     */
    const gone = this.fizzle > 0
      ? clamp(this.fizzle / (CFG.waves.glitch.fizzle || 1), 0, 1) : 1;
    const s = (this.spawnIn > 0 ? 1 - this.spawnIn * 0.6 : 1) * (0.72 + gone * 0.28);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (s !== 1) ctx.scale(s, s);
    if (gone !== 1) ctx.globalAlpha *= gone * gone;

    /*
     * Ambient glow. Skipped on a fixed body unless it has just been hit:
     * ORDINAL puts forty segments on the field at once and draws a halo over
     * all of them itself, so forty more glow blits a frame bought nothing.
     */
    if (!t.fixed || this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, t.glow, 0, 0, this.r * 2.1, 0.24 + this.flash * 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }

    const dim = 0.45 + hpFrac * 0.55;
    if (this.isDrop) {
      // Energy is not damaged and has no health to read, so it is drawn at
      // full brightness and additively: a floor of it should glow.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(t.color, 0.5);
      ctx.strokeStyle = rgba(t.color, 0.75);
      ctx.lineWidth = Math.max(CFG.hairline * 0.8, this.r * 0.22);
    } else {
      // Weight, read off the density the table has always carried. See
      // materialOf(): 0.16/0.09r for everything became 0.07-0.37 fill on a
      // line of 0.062-0.134r, so a BULWARK arrives as something solid and a
      // SEED as something you could put a hand through.
      const m = materialOf(t);
      ctx.fillStyle = rgba(t.color, m.fill * dim);
      ctx.strokeStyle = rgba(t.color, 0.55 + 0.45 * dim);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * m.line);
    }

    /*
     * THE TITHE MARK.
     *
     * `marks` has driven this round's whole ramp since it shipped -- the
     * damage a hit adds and the salvage the body pays are both read off it --
     * and it was never drawn. A round whose entire point is that it gets
     * stronger the longer you stay on one body gave the player no way to see
     * whether they were on the right body, how far in they were, or that
     * anything was happening at all. The number was in the simulation and
     * nowhere on the screen.
     *
     * Drawn as strokes cut into the body's own outline, one per mark, closing
     * into a ring as it deepens -- so a marked thing reads at a glance and a
     * nearly-spent one reads as nearly closed. Under the shape, so it looks
     * cut in rather than stuck on.
     */
    if (this.marks > 0 && !this.isDrop) {
      const TONE = '#40e693';
      // Eight seats, because CFG.rounds.tithe.marks is 8 -- the depth the
      // round reaches on its own. LIEN raises the cap to fourteen, and those
      // last six are drawn on a second ring inside the first, offset half a
      // seat so they interleave. The first draft ran the seat angle off
      // `i / full` for every mark, so mark 9 landed exactly on mark 1 and a
      // body worth 14 was indistinguishable from one worth 8.
      const full = 8;
      const rr = this.r * 1.24;
      const deep = Math.min(1, this.marks / full);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // The ring itself tightens and brightens with the mark.
      ctx.strokeStyle = rgba(TONE, 0.13 + deep * 0.3);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      // A stroke per mark, cut inward. They accumulate clockwise from the top
      // so the count is readable without being a number.
      ctx.lineWidth = Math.max(CFG.hairline * 1.4, this.r * 0.1);
      ctx.strokeStyle = rgba(TONE, 0.55 + deep * 0.45);
      const len = this.r * (0.2 + deep * 0.12);
      const tick = (i, radius, reach) => {
        const ang = -Math.PI / 2 + ((i % full) / full) * TAU + (i >= full ? Math.PI / full : 0);
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx * (radius - reach), cy * (radius - reach));
        ctx.lineTo(cx * (radius + reach * 0.25), cy * (radius + reach * 0.25));
        ctx.stroke();
      };
      const outer = Math.min(this.marks, full);
      for (let i = 0; i < outer; i++) tick(i, rr, len);
      /*
       * Past eight, the marks go outward: shorter strokes in the gaps between
       * the seats, outside the ring. Outward rather than inward because the
       * first attempt put them at 0.98r, on top of the body's own outline,
       * where six of them were worth twenty-seven pixels and read as nothing.
       */
      const over = Math.min(this.marks - full, full);
      if (over > 0) {
        ctx.strokeStyle = rgba(TONE, 0.5 + deep * 0.35);
        ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.085);
        for (let i = full; i < full + over; i++) tick(i, rr + len * 0.95, len * 0.62);
      }
      // Full: the ring closes and the body carries a steady bloom, so "this
      // one is paying out" is visible across the field.
      if (this.marks >= full) {
        drawGlow(ctx, TONE, 0, 0, this.r * 1.9, 0.16 + 0.07 * Math.sin(world.time * 5 + this.phase));
      }
      ctx.restore();
    }

    /*
     * PLATED. A second line inside the first, on anything the table marks
     * `armor`.
     *
     * Armour is the one property that changes how you fight a body -- a
     * BULWARK at 676 health behind plate wants a different round from a
     * SCION at 390 without it -- and it was invisible. Drawn before the
     * shape and inside it, so it reads as a liner rather than as a halo, and
     * it fades with health like everything else: a plated thing coming apart
     * loses its plate first.
     */
    if (materialOf(t).plate && !this.isDrop) {
      ctx.save();
      ctx.strokeStyle = rgba(t.color, 0.3 + 0.34 * dim);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.7, 0, TAU);
      ctx.stroke();
      ctx.restore();
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
      case 'tally': drawTally(ctx, this.r, hpFrac); break;
      case 'ordinal': drawOrdinal(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'digit': drawDigit(ctx, this.r, this.phase, world.time); break;
      case 'dial': drawDial(ctx, this.r, hpFrac); break;
      case 'gnomon': drawGnomon(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'second': drawSecond(ctx, this.r, this.phase, world.time); break;
      case 'mite': drawTri(ctx, this.r, hpFrac, 0); break;
      case 'fraction': drawTri(ctx, this.r, hpFrac, 1); break;
      case 'fractal': drawTri(ctx, this.r, hpFrac, 2); break;
      case 'crest': drawCrest(ctx, this.r, hpFrac); break;
      case 'amplitude': drawAmplitude(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'droplet': drawDroplet(ctx, this.r, this.phase, world.time); break;
      case 'pylon': drawPylon(ctx, this.r, hpFrac); break;
      case 'dynamo': drawDynamo(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'ion': drawIon(ctx, this.r, this.phase, world.time); break;
      case 'pane': drawPane(ctx, this.r, hpFrac); break;
      case 'parity': drawParity(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'echo': drawEcho(ctx, this.r, this.phase, world.time); break;
      case 'bound': drawBound(ctx, this.r, hpFrac); break;
      case 'terminus': drawTerminus(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'limit': drawLimit(ctx, this.r, this.phase, world.time); break;
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
      //
      // Multiplied into whatever is already set and put BACK, not reset to 1.
      // The fizzle sets the body's alpha at the top of this method and
      // `flash` freezes where it was (update refuses a dissolving body), so
      // a body hit just before the simulation stepped back drew its hit
      // flash at full strength and handed full opacity to everything after
      // it. Same trap as drawGlow, one method further in.
      const was = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = was * clamp(this.flash, 0, 1) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.92, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = was;
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
        ctx.lineWidth = CFG.hairline * 1.6;
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
        ctx.lineWidth = Math.max(CFG.hairline, G.ball * 0.16);
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
      ctx.lineWidth = CFG.hairline * 2.2;
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
      ctx.lineWidth = CFG.hairline * 2;
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
      ctx.lineWidth = CFG.hairline * 3.2;
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
      /*
       * Dimmer the more it wards. The alpha was a flat 0.34 per line, so the
       * web's total brightness scaled linearly with the flock -- a HERALD
       * warding two bodies drew two quiet lines and a crowded field drew a
       * net that out-shouted every body in it. The information is "these are
       * shielded and this is why", and that survives at a third the light:
       * the count is carried by how many lines there are, not by each line
       * being loud.
       */
      ctx.strokeStyle = rgba(t.glow, 0.34 / Math.sqrt(this.warded.length));
      ctx.lineWidth = CFG.hairline * 1.4;
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
      ctx.lineWidth = Math.max(CFG.hairline * 2, rr * W.thick);
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
      ctx.lineWidth = CFG.hairline * 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
      ctx.stroke();
    }

    // breach marker — this is the one you have to kill to clear the corruption
    if (this.attacking) {
      const p = 0.5 + 0.5 * Math.sin(world.time * 11);
      ctx.strokeStyle = rgba('#ff2d55', 0.5 + p * 0.5);
      ctx.lineWidth = CFG.hairline * 1.6;
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
  ctx.lineWidth = Math.max(CFG.hairline * 0.7, r * 0.07);
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

/*
 * ---- ORDINAL's three ----
 *
 * A frame segment. Drawn along its own bar axis, which the boss sets on the
 * body's angle, so a segment always lies along the edge it is part of. Five
 * strokes cut across it: it is a tally, and the count is what it is made of.
 * The strokes go out as it is damaged, so how far into a panel you are is
 * legible from across the field without a health bar on it.
 */
function drawTally(ctx, r, hpFrac) {
  const L = r * 2.05; // along the edge
  const T = r * 0.66; // across it
  ctx.beginPath();
  ctx.moveTo(-L / 2, -T / 2);
  ctx.lineTo(L / 2, -T / 2);
  ctx.lineTo(L / 2 + T * 0.34, 0);
  ctx.lineTo(L / 2, T / 2);
  ctx.lineTo(-L / 2, T / 2);
  ctx.lineTo(-L / 2 - T * 0.34, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const marks = 5;
  const lit = Math.ceil(marks * hpFrac);
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.1);
  for (let i = 0; i < marks; i++) {
    const x = -L / 2 + (i + 0.5) * (L / marks);
    const on = i < lit;
    ctx.strokeStyle = on ? stroke : rgba('#3a2438', 0.9);
    if (on) ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    // the fifth is struck through the other four, the way a tally is
    if (i === marks - 1) {
      ctx.moveTo(-L / 2 + L * 0.08, T * 0.34);
      ctx.lineTo(x + L * 0.06, -T * 0.34);
    } else {
      ctx.moveTo(x, -T * 0.3);
      ctx.lineTo(x, T * 0.3);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/*
 * The core. It does not move and it does not turn, so everything that reads
 * as motion on it is drawn: a ring of counters going round the outside, an
 * iris that opens as it is hurt, and a pupil that watches. The iris opening
 * is the tell -- at full health it is a closed lens, and by the last stage it
 * is a hole with something in it.
 */
function drawOrdinal(ctx, r, phase, t, hpFrac) {
  const stroke = ctx.strokeStyle;
  const hurt = 1 - hpFrac;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // the counting collar
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.05);
  const teeth = 24;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU + t * 0.35;
    const long = i % 4 === 0;
    ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.lineTo(Math.cos(a) * r * (long ? 0.99 : 0.93), Math.sin(a) * r * (long ? 0.99 : 0.93));
  }
  ctx.stroke();

  // three rings, each turning at its own rate, each broken in a different place
  //
  // Alpha multiplied in and put back, not assigned and reset to 1: a shape
  // helper that forces the alpha to 1 on its way out hands full opacity to
  // everything drawn after it, which is how build 210's dissolve came out
  // fully opaque on the shapes that use this pattern.
  const was = ctx.globalAlpha;
  for (let i = 0; i < 3; i++) {
    const rr = r * (0.74 - i * 0.14);
    const off = t * (0.5 + i * 0.55) * (i % 2 ? -1 : 1);
    ctx.globalAlpha = was * (0.75 - i * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, rr, off, off + Math.PI * (1.5 - i * 0.22));
    ctx.stroke();
  }
  ctx.globalAlpha = was;

  // the iris: shut at full health, wide open at the end
  const irisR = r * (0.1 + 0.3 * hurt);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.16 + 0.5 * hurt);
  ctx.beginPath();
  ctx.arc(0, 0, irisR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.06);
  const blades = 6;
  ctx.beginPath();
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU - t * 0.8;
    const in0 = irisR;
    const out = r * 0.62;
    ctx.moveTo(Math.cos(a) * in0, Math.sin(a) * in0);
    ctx.lineTo(Math.cos(a + 0.5) * out, Math.sin(a + 0.5) * out);
  }
  ctx.stroke();
  // and the pupil
  ctx.fillStyle = rgba('#ffffff', 0.6 + 0.4 * Math.sin(t * 2 + phase) * hurt);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.075, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/*
 * One of the garrison. A bracket with a bar through it: small, angular and
 * obviously of the same make as the frame it came out of, so a loose one
 * still reads as ORDINAL's rather than as a new object type arriving.
 */
/*
 * ---- PARITY's three ----
 */

/**
 * A mirror pane: a hard-edged shard with a bright face and a crack that opens
 * across it as it is broken. Flat rather than solid-looking, because the whole
 * point of it is that it is a *surface*.
 */
function drawPane(ctx, r, hpFrac) {
  const w = r * 0.55;
  const h = r * 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, -h * 0.35);
  ctx.lineTo(w * 0.72, h);
  ctx.lineTo(-w * 0.72, h);
  ctx.lineTo(-w, -h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The face: a bright sliver down one side, which is what makes it read as
  // reflective rather than as a plate.
  ctx.fillStyle = rgba('#ffffff', 0.16 + 0.24 * hpFrac);
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.75);
  ctx.lineTo(w * 0.1, -h * 0.5);
  ctx.lineTo(-w * 0.1, h * 0.7);
  ctx.lineTo(-w * 0.62, h * 0.4);
  ctx.closePath();
  ctx.fill();
  // ...and the crack, which only exists once it has been hit.
  if (hpFrac < 0.99) {
    ctx.strokeStyle = rgba('#1a0d2e', 0.75);
    ctx.lineWidth = Math.max(CFG.hairline, r * 0.09 * (1 - hpFrac));
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, -h * 0.2);
    ctx.lineTo(w * 0.1, h * 0.1 * (1 - hpFrac) - h * 0.05);
    ctx.lineTo(w * 0.7, h * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A half: a crescent, its open side facing its twin. Drawn as an arc with
 * thickness rather than a disc, so the pair reads as two halves of one thing
 * with a gap between them where the mirror-line runs.
 */
function drawParity(ctx, r, phase, t, hpFrac) {
  const inner = r * 0.46;
  ctx.beginPath();
  ctx.arc(0, 0, r, -1.15, 1.15);
  ctx.arc(0, 0, inner, 1.15, -1.15, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A bright rib down the middle of the crescent, breathing.
  ctx.strokeStyle = rgba('#e6d6ff', 0.35 + 0.45 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, (r + inner) * 0.5, -1.0, 1.0);
  ctx.stroke();
  // ...and the eye at its inner face, which is what looks across the gap.
  const beat = 0.6 + 0.4 * Math.sin(t * 2.4 + phase);
  ctx.fillStyle = rgba('#ffffff', 0.4 + 0.5 * beat * hpFrac);
  ctx.beginPath();
  ctx.arc(inner * 1.12, 0, r * 0.11 * (0.8 + 0.2 * beat), 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** An ECHO: a small paired chevron. There is always another one of these. */
function drawEcho(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.55);
  ctx.lineTo(0, r * 0.1);
  ctx.lineTo(r * 0.8, -r * 0.55);
  ctx.lineTo(r * 0.8, r * 0.2);
  ctx.lineTo(0, r * 0.85);
  ctx.lineTo(-r * 0.8, r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 6 + phase)));
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, -r * 0.1);
  ctx.lineTo(0, r * 0.4);
  ctx.lineTo(r * 0.45, -r * 0.1);
  ctx.stroke();
  ctx.restore();
}

/*
 * ---- TERMINUS's three ----
 */

/**
 * A BOUND: one tile of the skin of the world.
 *
 * Drawn as a bar lying ACROSS its own radius rather than a blob, because
 * thirty-two of them have to read as one continuous edge and not as beads on
 * a string. The bright line is on the outward face -- the side away from you
 * -- so a ring of them looks like something seen from the inside.
 */
function drawBound(ctx, r, hpFrac) {
  const w = r * 1.02; // along the ring
  const h = r * 0.6; // across it
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.72);
  ctx.lineTo(w, -h * 0.72);
  ctx.lineTo(w * 0.86, h);
  ctx.lineTo(-w * 0.86, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffd6dd', 0.3 + 0.5 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.17);
  ctx.beginPath();
  ctx.moveTo(-w * 0.92, -h * 0.72);
  ctx.lineTo(w * 0.92, -h * 0.72);
  ctx.stroke();
  ctx.restore();
}

/**
 * TERMINUS: an eye with the pupil of a hole, and four stubs at the quarters
 * where the beams come out in stage III. The iris turns the other way to the
 * shell, which is the same trick the two rings play at field scale.
 */
function drawTerminus(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The four stubs.
  ctx.strokeStyle = rgba('#ff9aab', 0.3 + 0.4 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.16);
  for (let i = 0; i < 4; i++) {
    const a = t * 0.5 + phase + (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    ctx.lineTo(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
    ctx.stroke();
  }
  // The iris: a broken annulus turning against the body.
  ctx.strokeStyle = rgba('#ffd6dd', 0.28 + 0.44 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.11);
  for (let i = 0; i < 5; i++) {
    const a = -t * 0.8 + phase + (i / 5) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, a, a + 0.86);
    ctx.stroke();
  }
  // ...and the hole at the middle of it, which is the only part that is not
  // crimson: what the boundary is holding shut.
  const beat = 0.6 + 0.4 * Math.sin(t * 1.8 + phase);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = rgba('#12000a', 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3 * (0.9 + 0.1 * beat), 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.3 + 0.45 * beat * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.06);
  ctx.stroke();
  ctx.restore();
}

/** A LIMIT: a caret pointing the way it is going, which is inward. */
function drawLimit(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.82, -r * 0.3);
  ctx.lineTo(0, -r * 0.02);
  ctx.lineTo(-r * 0.82, -r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.28 + 0.5 * (0.5 + 0.5 * Math.sin(t * 7 + phase)));
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.15);
  ctx.beginPath();
  ctx.moveTo(-r * 0.44, -r * 0.16);
  ctx.lineTo(0, r * 0.5);
  ctx.lineTo(r * 0.44, -r * 0.16);
  ctx.stroke();
  ctx.restore();
}

/*
 * ---- DYNAMO's three ----
 */

/**
 * A pylon: a squat tower with a cap and three insulator rings that go dark as
 * it is broken. It has to read as *standing on something* even though nothing
 * in this game has a ground, which is what the flared base is for.
 */
function drawPylon(ctx, r, hpFrac) {
  const w = r * 0.62;
  const h = r * 1.05;
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, -h);
  ctx.lineTo(w * 0.55, -h);
  ctx.lineTo(w, h);
  ctx.lineTo(-w, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.07);
  const rings = 3;
  const lit = Math.ceil(rings * hpFrac);
  for (let i = 0; i < rings; i++) {
    const y = -h * 0.6 + (i / (rings - 1)) * h * 1.3;
    const ww = w * (0.62 + i * 0.22);
    ctx.strokeStyle = i < lit ? rgba('#a8c8ff', 0.85) : rgba('#20304c', 0.9);
    ctx.beginPath();
    ctx.moveTo(-ww, y);
    ctx.lineTo(ww, y);
    ctx.stroke();
  }
  // The terminal on top: where an arc leaves from.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#dceaff', 0.5 + 0.5 * hpFrac);
  ctx.beginPath();
  ctx.arc(0, -h, r * 0.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.restore();
}

/**
 * The core: a ring with a lightning glyph in it, spinning up as it is worn
 * down. It is drawn as something *carrying* a charge rather than being one --
 * the ring is the vessel, the bolt inside is the contents.
 */
function drawDynamo(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const stroke = ctx.strokeStyle;
  ctx.save();
  // A second ring, turning, so the thing reads as live even standing still.
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.07);
  ctx.strokeStyle = rgba('#a8c8ff', 0.5);
  ctx.setLineDash([r * 0.5, r * 0.34]);
  ctx.lineDashOffset = -t * r * (1 + (1 - hpFrac) * 3);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // ...and the bolt.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  ctx.strokeStyle = rgba('#ffffff', 0.6 + 0.4 * Math.sin(t * 6 + phase));
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.5);
  ctx.lineTo(r * 0.12, -r * 0.08);
  ctx.lineTo(-r * 0.08, r * 0.04);
  ctx.lineTo(r * 0.22, r * 0.5);
  ctx.stroke();
  ctx.strokeStyle = stroke;
  ctx.restore();
}

/** An ION: a small hard diamond with a spark in it. */
function drawIon(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 8 + phase)));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/*
 * ---- AMPLITUDE's three ----
 */

/**
 * One segment of the wave: a lens, wider than it is tall, with a bar through
 * it that shortens as it is broken. Drawn along its own axis, so the boss can
 * lie it flat along the tangent of the curve and it reads as part of a line
 * rather than as a bead on one.
 */
function drawCrest(ctx, r, hpFrac) {
  const L = r * 1.9;
  const T = r * 0.78;
  ctx.beginPath();
  ctx.moveTo(-L / 2, 0);
  ctx.quadraticCurveTo(0, -T, L / 2, 0);
  ctx.quadraticCurveTo(0, T, -L / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.16);
  ctx.strokeStyle = rgba('#d6fff2', 0.35 + 0.55 * hpFrac);
  ctx.beginPath();
  ctx.moveTo(-L * 0.34 * hpFrac, 0);
  ctx.lineTo(L * 0.34 * hpFrac, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * The head: a disc with a waveform running through it, and the waveform runs
 * faster as the thing is worn down. It is the only body in the game whose
 * decoration is a readout.
 */
function drawAmplitude(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.94, 0, TAU);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.09);
  // Two traces, the second a beat behind, so the head reads as oscillating
  // rather than as a circle with a squiggle in it.
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = rgba(k ? '#8ff5e0' : '#ffffff', k ? 0.35 : 0.75);
    ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
      const x = (i / 10) * r;
      const y = Math.sin(i * 0.6 + t * (2 + (1 - hpFrac) * 5) + phase + k * 1.1)
        * r * 0.42 * (0.4 + 0.6 * hpFrac);
      if (i === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A DROPLET: a teardrop, point leading. */
function drawDroplet(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.2);
  ctx.quadraticCurveTo(r * 0.92, r * 0.2, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.92, r * 0.2, 0, -r * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5 + phase)));
  ctx.beginPath();
  ctx.arc(0, r * 0.05, r * 0.26, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/*
 * ---- FRACTAL's three ----
 *
 * One function for all of them, because they are one shape. `depth` is which
 * generation this is, and it draws that many levels of subdivision inside
 * itself -- so a MITE is a bare triangle, a FRACTION has three inside it, and
 * the core has three inside each of those. The armour you have to chew
 * through is visible in the body before you shoot it.
 */
function drawTri(ctx, r, hpFrac, depth) {
  const pts = (rad) => [
    [0, -rad],
    [rad * 0.866, rad * 0.5],
    [-rad * 0.866, rad * 0.5],
  ];
  const path = (rad, cx = 0, cy = 0) => {
    const p = pts(rad);
    ctx.beginPath();
    ctx.moveTo(cx + p[0][0], cy + p[0][1]);
    ctx.lineTo(cx + p[1][0], cy + p[1][1]);
    ctx.lineTo(cx + p[2][0], cy + p[2][1]);
    ctx.closePath();
  };
  path(r);
  ctx.fill();
  ctx.stroke();

  // The subdivisions, drawn inward. Sierpinski proper removes the middle;
  // this draws the three that are kept, which is the same picture and reads
  // at fifteen pixels where a cut-out does not.
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.045);
  const sub = (rad, cx, cy, left) => {
    if (left <= 0) return;
    const half = rad * 0.5;
    for (const [px, py] of pts(rad * 0.5)) {
      path(half, cx + px, cy + py);
      ctx.stroke();
      sub(half, cx + px, cy + py, left - 1);
    }
  };
  ctx.strokeStyle = rgba(stroke, 0.22 + 0.5 * hpFrac);
  sub(r, 0, 0, depth);
  ctx.restore();
}

/*
 * ---- GNOMON's three ----
 */

/**
 * One arc of the dial: a slab curved the long way, with hour ticks cut into
 * its outer edge that go out as it is broken. Drawn along its own axis, the
 * way a TALLY is, so the boss only has to hand it an angle.
 */
function drawDial(ctx, r, hpFrac) {
  const L = r * 2.0; // along the ring
  const T = r * 0.6; // across it
  const bow = r * 0.22; // how much the outer edge bellies out
  ctx.beginPath();
  ctx.moveTo(-L / 2, -T / 2);
  ctx.quadraticCurveTo(0, -T / 2 - bow, L / 2, -T / 2);
  ctx.lineTo(L / 2, T / 2);
  ctx.quadraticCurveTo(0, T / 2 - bow * 0.4, -L / 2, T / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hours, going out as the arc goes. Four is enough to read at this size.
  const marks = 4;
  const lit = Math.ceil(marks * hpFrac);
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.08);
  for (let i = 0; i < marks; i++) {
    const x = -L / 2 + (i + 0.5) * (L / marks);
    ctx.strokeStyle = i < lit ? stroke : rgba('#3a2a18', 0.9);
    ctx.beginPath();
    ctx.moveTo(x, -T / 2 - bow * 0.5);
    ctx.lineTo(x, -T / 6);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The core: a disc with a graduated rim, and a bright pinhole at the middle
 * that the needle turns on. The rim is a face, so the thing at the centre of
 * a sundial reads as the instrument it is.
 */
function drawGnomon(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const stroke = ctx.strokeStyle;
  ctx.save();
  // The face: twelve graduations, dimming as it is worn down.
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const long = i % 3 === 0;
    ctx.strokeStyle = rgba(long ? '#ffd9a8' : '#ffa860', 0.28 + 0.5 * hpFrac);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * (long ? 0.62 : 0.74), Math.sin(a) * r * (long ? 0.62 : 0.74));
    ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  // ...and the pinhole, which is the only part of it that is ever bright.
  const beat = 0.62 + 0.38 * Math.sin(t * 2.2 + phase);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#fff0d0', 0.5 + 0.5 * beat);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.19 * (0.85 + 0.15 * beat), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(stroke, 0.6);
  ctx.restore();
}

/** A SECOND: a small hard tick, leaning the way it is going. */
function drawSecond(ctx, r, phase, t) {
  const w = r * 0.5;
  const h = r * 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, h * 0.62);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.14);
  ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 + phase));
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.5);
  ctx.lineTo(0, h * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawDigit(ctx, r, phase, t) {
  const w = r * 0.72;
  const h = r * 1.05;
  ctx.beginPath();
  ctx.moveTo(-w, -h);
  ctx.lineTo(w, -h * 0.55);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(-w, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  const beat = 0.5 + 0.5 * Math.sin(t * 5 + phase);
  ctx.globalAlpha = 0.4 + 0.6 * beat;
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, 0);
  ctx.lineTo(w * 0.6, 0);
  ctx.stroke();
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
  // Multiplied in and put back; see the note in drawEye.
  const was2 = ctx.globalAlpha;
  ctx.globalAlpha = was2 * (0.35 + hpFrac * 0.4);
  ctx.stroke();
  ctx.globalAlpha = was2;
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
  // A body on its way out is not something the next wave has to wait for --
  // without this, `thinAt` counts the whole of a fizzled field for the second
  // it takes to go and the wave after a reset opens against a full board.
  for (const e of world.enemies) if (!e.dead && !e.harmless && !e.fizzle) n++;
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
  const made = [spawnOne(world, type, x, y, opts)];
  /*
   * TETHERED: the wave arrives in pairs sharing one pool of health.
   *
   * Joined HERE rather than in load(), because a job is not a body until it
   * is released and the cap may hold one back -- pairing a plan would leave
   * half of the pairs joined to something that never arrived. A body waits
   * for the next one out of the same wave; the odd one at the end of a wave
   * simply stays single, which is the honest answer to an odd count.
   *
   * A TOW is left alone: it has a tether of its own that means something
   * else entirely, and two meanings on one field would be one too many.
   */
  const d = world.director;
  if (d && d.traits && d.traits.length && hasTrait(d.traits, 'tethered')) {
    const e = made[0];
    if (e && !e.harmless && !type.tows) {
      const waiting = d.pairing;
      if (waiting && !waiting.dead && !waiting.tether) {
        e.tether = { other: waiting, len: 96 };
        waiting.tether = { other: e, len: 96 };
        e.hp = Math.min(e.hp, waiting.hp);
        waiting.hp = e.hp;
        d.pairing = null;
      } else d.pairing = e;
    }
  }
  return made;
}

/**
 * Release one object into the run. `world.released` is counted here, at the
 * one place a hostile enters the world. Nothing gates on it: the 500-object
 * quota it was kept for went with `releasesLeft` in build 186, having returned
 * Infinity on every call since runs became endless in build 81. It is still
 * counted because the debug readout and the save both show it.
 */
/**
 * Which wave a body belongs to, and the wave's count of its own.
 *
 * The OBJECTS figure is "how many of THIS WAVE'S objects are down", and a
 * wave's objects are not the same as the hostiles on the field: bodies from
 * the wave before are still standing (a wave ends when the field THINS, not
 * when it empties), and a wave produces more than it asked for -- a SPLITTER's
 * children, a SEED, a TOW's MASS. Counting the field instead of the wave is
 * what made the figure jump when a wave turned over with things still on it.
 *
 * `from` is the body that made this one, and its tag is inherited: a
 * SPLITTER's children belong to the wave that released the SPLITTER even when
 * it is torn open two waves later. Only bodies of the RUNNING wave are added
 * to `made`, or a late split would inflate a total the figure is a fraction
 * of, and the bar would go backwards.
 */
function tagBody(world, e, from) {
  const d = world.director;
  if (!d || e.harmless) return e;
  e.wave = from ? (from.wave ?? d.serial) : d.serial;
  if (e.wave === d.serial) d.made++;
  return e;
}

export function spawnOne(world, type, x, y, opts = {}) {
  const e = new Enemy(type, x, y, { staged: true, spawnIn: 1, ...opts });
  /*
   * The tier's health and bounty, applied at the one place every hostile
   * enters the world.
   *
   * Deliberately not applied to the harmless: DRIFT is a promise the field
   * keeps, and a tier-8 DRIFT with eight times the health is a grey object
   * that does not die like a grey object. The bonus wave stays a bonus.
   */
  /*
   * ...and not to a teach wave either. The opening is authored at exactly the
   * size and difficulty it should be; a tier-40 multiplier on it turns the
   * sentence "this is a NEEDLE" into a 29-second wall that teaches nothing.
   */
  const d = world.director;
  if (d && !e.harmless && !type.fixed && !d.wave?.teach) {
    const k = d.scaleAt(d.tier);
    e.maxHp *= k.hp;
    e.hp = e.maxHp;
    e.bounty *= k.bounty;
    /*
     * ...and the wave's rules, on the hostiles only.
     *
     * Grey is harmless: DRIFT and energy are never traited, which is why this
     * sits inside the same guard as the tier multiplier rather than beside it.
     * An ARMORED mote would break the one promise the colour rule makes.
     */
    if (d.traits && d.traits.length) {
      e.traits = d.traits;
      if (hasTrait(d.traits, 'swarm')) {
        e.maxHp = Math.max(1, Math.round(e.maxHp * CFG.waves.tier.swarmHp));
        e.hp = e.maxHp;
      }
    }
  }
  world.enemies.push(e);
  if (!e.harmless) world.released++;
  return tagBody(world, e, null);
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

/**
 * The depth dividend: what everything banked is multiplied by.
 *
 * Off the PEAK rather than the current tier, so stepping back to breathe does
 * not cost you the rate you climbed for -- the ladder is already a difficulty
 * decision and it should not also be a pay cut. Anomalies count for five times
 * a rung because they are the only thing on the ladder that is put down once.
 */
export function dividend(world) {
  const T = CFG.waves.tier;
  const peak = world.director ? world.director.peak : 1;
  const done = world.reconciled ? world.reconciled.length : 0;
  return Math.min(T.dividendCap, 1 + T.dividendPeak * peak + T.dividendAnomaly * done);
}

function bank(world, amount, x, y) {
  const got = amount * intakeRate(world) * dividend(world);
  world.energy += got;
  // The one place energy enters a run, so the one place the lifetime counter
  // can be kept honest. Net of the corruption tax on purpose: what was taken
  // off you at the intake was never earned.
  world.earned += got;
  /*
   * What this wave has been worth, RAW -- before the intake tax and before the
   * dividend. The margin is paid back through this same function, so banking
   * the netted figure would tax and multiply it a second time.
   */
  const d = world.director;
  if (d && !d.resting) d.take += amount;
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
 * Every mote within reach, taken in at once. PULSE is the only thing that does
 * this; an offer called SCOUR did it with no limit and a bonus on the pay, and
 * that system is gone -- so the `bonus` both of these carried went with it. It
 * was a parameter nothing could set: PULSE is the sole caller and passes
 * nothing, so it was 1 on every call it ever made. A multiplier that cannot be
 * anything but one is a branch that cannot be taken.
 *
 * @returns how many were taken, so the caller can decide whether to say so.
 */
export function drawIn(world, radius) {
  const s = world.shooter;
  const r2 = radius * radius;
  let took = 0;
  for (const e of world.drops) {
    if (e.dead || !e.energy) continue;
    if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r2) continue;
    absorb(world, e, true);
    took++;
  }
  return took;
}

/** One mote taken in. */
export function absorb(world, e, streak = false) {
  if (e.dead || !e.energy) return;
  /*
   * WITH the mark, the way `Enemy.destroy` pays it (`this.energy *
   * this.bounty`). This is the only collector PULSE's drawIn and INTAKE go
   * through, and it banked the raw energy -- so taking a mote in paid the
   * authored number while shooting the same mote paid the tier's compounding
   * 1.10^(tier-1) on top of it, plus OVERCLOCK's double and whatever TITHE
   * had marked it for.
   *
   * Measured, fourteen motes off a BULWARK, PULSE against destroying them:
   * tier 1 113/113, tier 6 119/191, tier 12 125/358, tier 20 134/822. The
   * ratios are 1/1.10^(tier-1) to three places, which is the whole of the
   * bug. An ability whose one line is "takes in the energy" paid 16% of what
   * the floor was worth by tier 20, and buying INTAKE lowered your income.
   *
   * The mark is put on the mote deliberately at the site that makes it (see
   * the note there); nothing was reading it back.
   */
  bank(world, e.energy * (e.bounty || 1), e.x, e.y);
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
    /*
     * The running wave's own tally: which wave it is, how many bodies it has
     * actually put on the field, and how many of those are down. Counted
     * rather than inferred -- see cleared() for why subtracting the field
     * from `asked` cannot answer the question, and tagBody for why the field
     * is not the wave. `slain` is fed from Game.registerKill, the one door
     * every death comes through; `made` from tagBody, the one door every
     * hostile comes through. Zeroed by load() for every wave including the
     * teach ones.
     */
    this.serial = 0;
    this.made = 0;
    this.slain = 0;
    this.done = false; // the running wave has been scored and is finished
    this.timer = CFG.openingGrace; // until the next release, or the next wave
    this.wait = 0; // how long this wave has been waiting for the field to thin
    this.resting = true; // between waves rather than inside one
    /*
     * ---- the ladder ----
     * `tier` is the run's difficulty step. It climbs on a clean wave, is
     * pinned by `hold`, and steps back on its own after two failures. The
     * three scoring fields below are gathered while a wave runs and read when
     * it ends -- see score().
     */
    this.tier = 1;
    /*
     * The highest tier this run has stood on, which is not the same as the
     * highest below it. A run that reached 8 and stepped back to 5 has been
     * through 6 and 7, and the rail's ticks mean "passed" rather than
     * "smaller than where you are" -- so it is recorded rather than inferred.
     */
    this.peak = 1;
    this.hold = false;
    this.contact = 0; // seconds anything spent on the turret this wave
    this.hitPatience = false; // ...and whether the field ever thinned
    /*
     * ---- the glitch timer ----
     *
     * `held` is seconds of UNBROKEN contact and exists only to arm the thing;
     * `glitch` is the fuse itself, 0 to 1, and is what everything else reads:
     * the ring round the turret, the seconds inside it, and the screen effect
     * the mechanic is named after. Neither is per-wave and neither is saved --
     * a run picked up from a file starts with a clear turret by construction,
     * because `restore()` puts the wave back to the top and nothing is on the
     * field yet.
     */
    this.held = 0;
    this.glitch = 0;
    this.lastRelease = 0; // world.time of the last object let out
    this.take = 0; // raw energy this wave has been worth, for the margin
    this.traits = []; // the rules this wave is carrying; see traits.js
    this.pairing = null; // TETHERED: the body waiting for a partner
    /*
     * A trait fixed by the player for a stretch of rungs, taken at a gate.
     * `{ id, until }` or null. It replaces the FIRST seeded trait and leaves
     * any second one alone, so choosing a lane narrows the question without
     * also making a two-trait rung a one-trait rung.
     */
    this.lane = null;
    /*
     * Two traits, offered on the rail after a gate is passed and standing
     * until one is taken or a wave is scored. Optional by construction: there
     * is no prompt and nothing is held, and leaving it lets the seed keep
     * deciding, which is the default the whole ladder already runs on.
     */
    this.laneOffer = null;
    /*
     * The two sheet actions, as charges. Not abilities: the strip is full at
     * eight and these are not things the turret does -- they are things done
     * to a wave. Same shape as a charge all the same, so `held` is what may be
     * spent now, `max` is what the tree paid for, and the cooldown is what
     * puts one back.
     */
    this.recall = { held: 0, max: 0, cd: 0 };
    this.overclock = { held: 0, max: 0, cd: 0, armed: false };
    this.lastVerdict = null; // surge | clean | stall | glitch, for the probes
    /*
     * One wave that cannot climb, set by any step back. Without it the ladder
     * ping-pongs at the ceiling: the rung below the wall is by construction
     * one you can clear, so a drop was always followed by an immediate climb
     * back into the wall that caused it.
     */
    this.grace = 0;
    /*
     * A trial: standing on a rung this run has NOT earned, for one wave, to
     * find out. `{ from, to }` while it runs. Proven, it becomes the peak;
     * failed, the run goes back to `from` and loses nothing.
     */
    this.probe = null;
    this.probeLock = 0; // seconds before another may be armed
  }

  /**
   * The anomaly standing on this rung, if any. 0 for an ordinary rung.
   *
   * `gates` is authored as rungs in order, so the index is the anomaly's own
   * number minus one -- see ANOMALIES in anomaly.js.
   */
  gateAt(tier) {
    const i = CFG.waves.tier.gates.indexOf(tier);
    return i < 0 ? 0 : i + 1;
  }

  /**
   * The anomaly holding this run where it is, if one is.
   *
   * Only ever the gate the run is STANDING on: a gate further up is not
   * holding anything yet, and one below has already been answered or stepped
   * back through.
   */
  heldBy(world) {
    const n = this.gateAt(this.tier);
    if (!n) return 0;
    return (world.reconciled || []).includes(n) ? 0 : n;
  }

  /**
   * The highest rung a climb from here may actually reach.
   *
   * Walks up one rung at a time and stops at the first gate whose anomaly is
   * still standing. Walking rather than comparing, because a surge climbs two
   * and must not step OVER a gate -- landing past one without answering it is
   * the only way the ladder could hand out a rung it did not mean to.
   */
  climbTo(world, want) {
    let at = this.tier;
    while (at < want) {
      const n = this.gateAt(at);
      if (n && !(world.reconciled || []).includes(n)) return at;
      at++;
    }
    return want;
  }

  /** Which authored band a tier draws from, and the one below it. */
  bandsFor(tier) {
    // Clamped at BOTH ends. Unclamped, tier 64 asked for bands 31..5 -- a
    // range matching nothing, which only worked because the empty-band
    // fallback caught it. Past band 5 every tier is band 4-5 and the climb is
    // carried by population, health and bounty, which is the intent.
    const hi = Math.min(5, Math.max(1, Math.ceil(tier / CFG.waves.tier.perBand)));
    return [Math.max(1, hi - 1), hi];
  }

  /**
   * The multipliers this tier applies. One place, so the three plans have one
   * surface to tune and the probe has one thing to read.
   */
  scaleAt(tier) {
    const T = CFG.waves.tier;
    return {
      pop: Math.min(1 + T.pop * tier, T.popCap),
      // Compounding, and off tier 1 rather than off zero -- so tier 1 is the
      // table exactly as authored and every step after it is a ratio on the
      // one before. See CFG.waves.tier.hpStep for why it is not a slope.
      hp: T.hpStep ** (tier - 1),
      // Compounding, like health and a little slower than it. See bountyStep.
      // ...and OVERCLOCK pays double for the wave it is armed on.
      bounty: T.bountyStep ** (tier - 1)
        * (this.overclock && this.overclock.armed ? T.overclockBounty : 1),
    };
  }

  /**
   * Score the wave that just ended, and move the tier.
   *
   * Nothing here is new instrumentation: how long something sat on the turret,
   * whether the director ever got its field back, and how much of the wave
   * outlived it were all already known. They were simply never read.
   */
  /*
   * ================== the glitch timer ==================
   *
   * The only thing in this game that takes a rung away without being asked.
   *
   * It reads one signal -- is anything on the turret right now -- and it is a
   * clock rather than a tally, which is the whole difference between it and
   * the wave-end rout it replaced. Twelve seconds of contact totted up across
   * a wave arrived as a verdict a minute later, could not be seen coming, and
   * could not be answered once it was owed. Fourteen unbroken seconds is in
   * front of you the entire time it is running: `glitch` is drawn as a ring
   * closing round the machine with the seconds left inside it, it drives the
   * screen effect it is named after, and shooting the thing off the mount
   * winds it back at `recover`. Nothing is owed until it lands.
   *
   * Returns the move when it fires and null every other frame. The caller
   * announces it directly rather than through the `if (moved)` the two scored
   * paths use, because at tier 1 there is no rung to lose and the wave still
   * resets -- and a reset nobody is told about is a field that vanished.
   */
  burn(world, dt) {
    const G = CFG.waves.glitch;
    const wv = this.wave;
    /*
     * The opening is taught rather than scored, and it walks a LURCHER onto
     * the mount on purpose so the contact line has something to be about.
     * Nothing may be taken away during it -- and `score()` refuses a teach
     * wave at the same door, for the same reason.
     */
    if (wv && wv.teach) {
      this.held = 0;
      this.glitch = 0;
      return null;
    }
    if (world.attackers.size > 0) {
      this.held += dt;
      // Armed only after `arm` seconds, so a body that clips the mount on its
      // way past never lights it. `held` is unbroken time and resets below.
      if (this.held >= G.arm) this.glitch = Math.min(1, this.glitch + dt / G.fuse);
    } else {
      this.held = 0;
      this.glitch = Math.max(0, this.glitch - (dt * G.recover) / G.fuse);
    }
    return this.glitch >= 1 ? this.glitchOut(world) : null;
  }

  /**
   * The fuse ran out: fizzle the field, abandon the wave, drop a rung.
   *
   * Deliberately NOT a call into `score()` with a forced verdict, the way
   * RECALL goes. A forced verdict still runs the whole scoring path -- the
   * margin, the climb table, the probe resolution -- and this wave is not
   * being scored at all, it is being withdrawn. So everything `score()` owes
   * the next wave is paid here by hand, and the list is exact: `overclock.
   * armed` and `laneOffer` are cleared in score() and NOWHERE else, so a path
   * that skips it silently carries a spent OVERCLOCK charge and a lapsed lane
   * offer into the wave after.
   */
  glitchOut(world) {
    const T = CFG.waves.tier;
    const G = CFG.waves.glitch;
    const from = this.tier;
    /*
     * Was a wave actually running? `score()` clears `overclock.armed` because
     * the wave it was armed on has been answered -- but a fuse that blows in
     * the rest BETWEEN two waves has answered nothing, and clearing it there
     * charges the player a whole charge for a wave that never started. Read
     * before `resting` is written below, because this method sets it.
     */
    const ran = !this.resting;

    /*
     * The field dissolves. Marked rather than destroyed: `destroy()` is what
     * banks a body's energy, sheds its debris and counts it, and none of that
     * is owed for a wave that is being taken back. `spent` keeps the assist
     * off them and lets rounds through, `dissolved` keeps the sweep from
     * paying or counting, and `Enemy.destroy` refuses a fizzling body outright
     * so a mine or a blast landing on one during its second cannot cash it in.
     *
     * Energy already on the floor is left alone -- that was earned before the
     * fuse blew and is not the simulation's to take back -- and so is DRIFT,
     * the ambient grey trickle, which runs all run independently of the waves
     * and was never part of this one.
     *
     * DRIFT by name and not by `harmless`, which was the first version and let
     * a SCION's live SEEDs through: they are harmless -- they cannot touch the
     * turret and nothing is lost by ignoring them -- and they are absolutely
     * part of the wave, so a withdrawal that spared them handed the
     * replacement wave a set of grafts it never asked for.
     */
    let fizzled = 0;
    for (const e of world.enemies) {
      if (e.dead || e.isDrop || e.type.id === 'drift' || e.fizzle > 0) continue;
      e.fizzle = G.fizzle;
      e.spent = true;
      e.dissolved = true;
      e.attacking = false;
      world.attackers.delete(e);
      fizzled++;
    }

    // The wave is abandoned, not scored. `resting` first and before anything
    // else, because update() falls straight into the end-of-wave block on the
    // next frame without it and scores the wave a second time.
    this.jobs.length = 0;
    this.resting = true;
    this.timer = rand(CFG.waves.rest[0], CFG.waves.rest[1]);
    this.contact = 0;
    this.hitPatience = false;
    this.take = 0;
    this.made = 0;
    this.slain = 0;
    // NOT `done`: a wave the fuse took away was not finished. It keeps the
    // number it had, which is the point of showing it.
    this.done = false;
    if (ran) this.overclock.armed = false;
    this.laneOffer = null;
    this.held = 0;
    this.glitch = 0;

    let moved = 0;
    if (this.probe) {
      /*
       * A trial that ends in a glitch has been answered, and the answer is no.
       * Its own fall back to the rung it was armed from IS the step back --
       * dropping a further rung on top of it would charge the run twice for
       * one wave, and the trial was a question the player asked.
       */
      const back = this.probe.from;
      this.probe = null;
      this.probeLock = T.probeLock;
      this.tier = back;
      moved = this.tier - from;
    } else if (this.tier > 1) {
      this.tier--;
      moved = -1;
      // A step back re-arms the climb even under HOLD. The pin holds the
      // climb, not the relief.
      this.hold = false;
    }
    // ...and the next wave cannot climb straight back into whatever did it.
    // `grace` has no other writer, so a path that forgets this line turns it
    // into a flag that can never be non-zero.
    this.grace = 1;
    this.lastVerdict = 'glitch';
    return {
      verdict: 'glitch', moved, tier: this.tier, from, fizzled,
      reason: 'THE FEED GAVE OUT', margin: 0,
    };
  }

  /**
   * How much of the running wave is down, from 0 to 1. The one place that
   * decides it: the chip beside the count, the rail's third meter, AUDIT's
   * CLEARED, RECALL's clean threshold and the alert's reason all read this.
   *
   * IT COUNTS THE WAVE, NOT THE FIELD. Those are not the same set, and every
   * version of this before build 215 measured the second while claiming the
   * first:
   *
   *   `(asked - alive) / asked`, in four copies, was not a measure of
   *   clearing at all -- it was a measure of ARRIVAL. `asked` is the whole
   *   wave, fixed at load(), while the bodies come out one at a time over the
   *   length of it, so a wave nobody had touched opened near 100% and fell as
   *   it arrived. Measured over 38 waves: opening reading median 75%, up to
   *   100%, and it stepped DOWN on 85 frames, worst single drop 67 points.
   *
   *   `slain / (slain + hostileCount + queued)` fixed the direction and
   *   still counted the field. A wave ENDS WHEN THE FIELD THINS -- `thinAt`
   *   allows a quarter of it to be left standing -- so the next wave began
   *   with the last one's leftovers on the screen and in its denominator. The
   *   figure could not reach 100% and turned over while there was plainly
   *   still work in front of you, which is exactly what it was reported as
   *   doing: "many objects still on field and it resets".
   *
   * So every hostile is stamped with the wave that produced it (tagBody),
   * children take the stamp off the body they came out of, and this is a
   * fraction of that wave's own bodies: how many it has actually put on the
   * field, plus what it still has queued, against how many of them are down.
   * Leftovers belong to the wave that released them and are counted there
   * even when they die two waves later -- which is why the figure is not
   * blanked between waves any more. It keeps climbing while the field is
   * cleaned up, and reaches 100% when the wave is genuinely finished.
   */
  /** How many of the running wave's own bodies are still up. */
  standing(world) {
    let n = 0;
    for (const e of world.enemies) {
      if (e.dead || e.harmless || e.fizzle) continue;
      if (e.wave === this.serial) n++;
    }
    return n;
  }

  cleared(world) {
    /*
     * A wave that has been SCORED is a wave that is finished, and reads as
     * finished: whatever it left standing was inherited by the field rather
     * than left uncleared, and the next wave will count it as its own if it
     * is still there. Without this the bar turned over at a median 73% --
     * which is the wave-end rule showing through, not the player's work --
     * and "it reaches 75 and disappears" was half this and half the blanking.
     *
     * Deliberately NOT set by glitchOut: a wave the fuse took away was not
     * finished, and it keeps its real number so the failure is legible.
     */
    if (this.done) return 1;
    let queued = 0;
    // A TOW is a job and two bodies -- the head plus the MASS it drags, both
    // hostile, both counted by the kill tally. Counting the job would make
    // the denominator jump the moment one is released.
    for (const j of this.jobs) queued += j.n * (j.type.tows ? 2 : 1);
    const total = this.made + queued;
    return total > 0 ? Math.min(1, this.slain / total) : 0;
  }

  score(world, forced = null) {
    const T = CFG.waves.tier;
    const wave = this.wave;
    /*
     * The opening teaches; it is not scored and cannot move the tier. Nor is
     * the drift-only bonus wave (`{ of: [], drift: 22 }`), which asks for no
     * hostiles at all: with `asked === 0` there is nothing that could fail it,
     * so it was a free rung every cycle -- observed climbing 15 to 16 for
     * shooting nothing.
     */
    if (!wave || wave.teach || this.asked === 0) return null;
    /*
     * The three numbers the table reads. `t` is how long the field took to
     * thin after the last object was let out -- infinite if patience ended the
     * wave, which is that wave saying it was never coming back. Measuring from
     * the LAST RELEASE rather than from the top of the wave is the whole point:
     * a wave is not slow because it was big, it is slow because it would not
     * die, and only the second of those is the player's business.
     */
    const t = this.hitPatience ? Infinity : Math.max(0, (world.time || 0) - this.lastRelease);
    const k = this.contact;
    const c = this.cleared(world);

    // OVERCLOCK widens the surge window: a wave arriving twice as fast is over
    // sooner, and three seconds from the last release would be a surge handed
    // out for the arming rather than for the answering.
    const surgeWithin = this.overclock.armed ? T.overclockSurge : T.surgeWithin;
    /*
     * Three verdicts, and none of them goes down. A wave either earns a climb
     * or it holds; the only thing in the game that takes a rung away is the
     * glitch timer, which is a live clock and not a verdict -- see the note on
     * the table in config.js and `glitchOut` below. `k` and `c` are both still
     * measured, because the surge and clean windows read `k` and the alert and
     * AUDIT both read `c`, but neither can subtract any more.
     */
    let verdict;
    if (t <= surgeWithin && k < T.surgeContact) verdict = 'surge';
    else if (t <= T.cleanWithin && k < T.failContact) verdict = 'clean';
    else verdict = 'stall';
    /*
     * RECALL names its own verdict, and only its verdict.
     *
     * It is a bail-out: a wave three quarters cleared counts as the clean it
     * was going to be, and anything less is a stall rather than the rout the
     * table would have given it. That is what the charge buys, and it is why
     * it is a charge. Everything a verdict then MEANS -- the move, the grace,
     * the peak, the margin, the streak -- stays here, so there is still one
     * place that decides what a wave was worth.
     */
    if (forced) verdict = forced;
    this.lastVerdict = verdict;
    // Read by cleared(): the wave is over, so the figure completes.
    this.done = true;

    // Why it went the way it did, in the alert's own register. The dominant
    // cause, not a list: a step you did not ask for needs one reason.
    /*
     * Nothing here explains a drop any more -- the glitch timer names its own,
     * in `glitchOut` -- so the contact no longer has to be read first to keep
     * "THE FIELD NEVER THINNED" off the front of a step back. It is still read
     * ahead of the two shapes below it, because a wave that held you for six
     * seconds and then came back was about the turret whatever else was true.
     */
    const reason = this.hitPatience ? 'THE FIELD NEVER THINNED'
      : k >= T.failContact ? `${Math.round(k)} S ON THE TURRET`
        : c < T.routBelow ? 'MOST OF IT WAS STILL STANDING'
          : verdict === 'surge' ? 'CLEARED BEFORE THE LAST ONE LANDED'
            : verdict === 'clean' ? 'THE FIELD CAME BACK'
              : 'IT TOOK TOO LONG';

    const from = this.tier;
    this.overclock.armed = false;   // spent by the wave it was armed on
    // An offer not taken by the time a wave has been answered has lapsed. It
    // is a choice at the gate, not a decision hanging over the rest of the run.
    this.laneOffer = null;
    /*
     * The margin: a surge pays half again on what the wave was worth, in one
     * lump at the turret. Banked through bank() so the intake tax and the
     * dividend apply to it exactly once, like anything else the field pays.
     */
    let margin = 0;
    if (verdict === 'surge' && this.take > 0) {
      const before = world.energy;
      bank(world, this.take * (T.margin - 1), world.shooter.x, world.shooter.y);
      margin = Math.round(world.energy - before);
    }
    this.contact = 0;
    this.hitPatience = false;
    this.take = 0;

    // A trial answers only for itself: it is not a rung of the ladder until it
    // is proven, so it neither climbs nor drops the run that armed it.
    if (this.probe) {
      const won = verdict === 'surge' || verdict === 'clean';
      const { from: back, to } = this.probe;
      this.probe = null;
      this.probeLock = T.probeLock;
      this.tier = won ? to : back;
      if (won) this.peak = Math.max(this.peak, to);
      this.grace = 0;
      return { verdict, moved: this.tier - from, tier: this.tier, from, reason, margin,
        trial: won ? 'proven' : 'failed' };
    }

    let moved = 0;
    if (verdict === 'surge' || verdict === 'clean') {
      const step = verdict === 'surge' ? 2 : 1;
      // HOLD pins the climb, and grace defers it by one wave. Both are spent
      // whether or not there was anything to hold back.
      if (this.grace > 0) this.grace--;
      else if (!this.hold) {
        // ...and a gate stops it dead, however good the wave was.
        const to = this.climbTo(world, this.tier + step);
        moved = to - this.tier;
        this.tier = to;
      }
    }
    this.peak = Math.max(this.peak, this.tier);
    return { verdict, moved, tier: this.tier, from, reason, margin };
  }

  /**
   * Stand the run on a rung it has not earned, for one wave.
   *
   * `setTier()` unlocks as it goes and `reach()` will not go above `peak`, so
   * neither can do this: the whole point is a rung that is not yet yours. If
   * the wave comes back surge or clean the rung becomes the peak; anything
   * else and the run is put back where it was, having lost nothing but the
   * wave. A lockout after either, so it is a question and not a strategy.
   */
  trial(n, world) {
    if (this.probe || this.probeLock > 0) return null;
    const to = Math.max(1, Math.round(n));
    if (to <= this.peak) return null;
    // A trial is still a climb: it may not be used to step over a gate.
    if (world && this.climbTo(world, to) < to) return null;
    this.probe = { from: this.tier, to };
    this.tier = to;
    return this.probe;
  }

  /**
   * Put the ladder somewhere, and count it as reached.
   *
   * The machinery's setter: the restore, the probes and the debug panel. It
   * does not gate, because every one of those already knows where it wants
   * the run to be -- and it raises `peak`, because being put on a rung is
   * having stood on it.
   */
  setTier(n) {
    this.tier = Math.max(1, Math.round(n));
    this.peak = Math.max(this.peak, this.tier);
    return this.tier;
  }

  /**
   * ...and the player's, from the rail.
   *
   * A rung has to have been climbed before it can be gone back to, so this
   * clamps to `peak` and never raises it. The only thing that unlocks a tier
   * is the ladder climbing it in score() -- which is the whole point of a
   * ladder you can step back down: going back is free, going forward is
   * earned, and the two are different verbs.
   */
  reach(n) {
    /*
     * Stepping away from a trial withdraws it. Otherwise the probe outlives
     * the rung it was asking about and the next scored wave answers a question
     * nobody is standing on any more -- putting the run somewhere it did not
     * ask to be, which is the one thing the rail must never do.
     */
    this.probe = null;
    this.tier = Math.min(Math.max(1, Math.round(n)), Math.max(1, this.peak));
    return this.tier;
  }

  /**
   * Every type in a wave has to have opened before the wave is eligible.
   *
   * On lifetime energy, not on kills. A kill count says how much you have
   * shot; what gates a new object ought to be how far the run has actually
   * got, and the tree, the tiers and the unlocks then all run off one clock
   * instead of three. The thresholds are grouped by band -- see the note on
   * `opens` in config.js -- so a band's types are open before the band is
   * drawn from, rather than in the order they happened to be authored.
   */
  eligible(world, wave) {
    return wave.of.every(([id]) => (world.earned || 0) >= (TYPE_BY_ID[id].opens || 0));
  }

  /**
   * Build the next rotation. The first one leads with the opening waves in
   * their authored order; every one after that drops them for good and simply
   * shuffles whatever has unlocked.
   */
  shuffle(world) {
    const rest = [];
    const [lo, hi] = this.bandsFor(this.tier);
    const inBand = [];
    WAVES.forEach((wv, i) => {
      if (wv.teach || !this.eligible(world, wv)) return;
      const b = wv.band || 1;
      if (b >= lo && b <= hi) inBand.push(i);
      rest.push(i);
    });
    /*
     * The tier's own bands, or everything eligible if that comes out empty.
     *
     * It can: a player climbing faster than the economy unlocks types reaches
     * a band whose waves are all still locked, and a director with nothing to
     * play stalls the run dead. Falling back down-band is not a compromise --
     * it is what the ladder should do when it has outrun its own material.
     */
    if (inBand.length) { rest.length = 0; rest.push(...inBand); }
    // Fisher-Yates. Order past the opening is meant to be arbitrary.
    for (let i = rest.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    /*
     * The opening plays once, at the bottom, and never again. It used to lead
     * every cycle-0 rotation whatever the tier, so a run started at 40 was
     * taught DRIFT by "needle x2" -- a 29-second wave, authored for the first
     * minute of a run, that could not move the ladder either way.
     */
    const open = this.cycle === 0 && this.tier === 1
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
    /*
     * Size comes off the TIER now, not the kill count. It was
     * `kills / swellKills` ramping one global knob from 1 to 2.4 across a
     * run -- which meant difficulty was a function of how long you had
     * played rather than of where you had chosen to stand, and could only
     * ever go one way.
     */
    const swell = wave.teach ? 1 : this.scaleAt(this.tier).pop * W.population;
    /*
     * What this wave is carrying, decided before a single body is made so
     * that SWARM can double the count on the way past. Seeded rather than
     * rolled: see traits.js.
     */
    this.traits = traitsFor(world, wave, this.tier, this.cycle, this.at);
    this.pairing = null;
    if (this.lane && this.traits.length) {
      if (this.lane.until > this.tier) {
        const laned = this.traits.find((t) => t.id === this.lane.id)
          || TRAIT_BY_ID[this.lane.id];
        if (laned) this.traits = [laned, ...this.traits.filter((t) => t !== laned)]
          .slice(0, this.traits.length);
      } else this.lane = null;   // the stretch is spent
    }
    const swarm = hasTrait(this.traits, 'swarm');
    const jobs = [];
    let asked = 0;
    for (const [id, base] of wave.of) {
      const type = TYPE_BY_ID[id];
      if (!type) continue;
      // SWARM: twice as many, half the health. The halving is stamped on the
      // body in spawnOne, where the tier's own multiplier is applied.
      const n = Math.max(1, Math.round(base * swell)) * (swarm ? 2 : 1);
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
    /*
     * ---- every wave starts clean ----
     *
     * score() returns early for a teach wave, and used to do so BEFORE
     * clearing these -- and load() never cleared them at all. So an unscored
     * wave's contact was charged to whichever wave was scored next: the
     * opening's seconds on the turret arrived as a failure on the first real
     * wave. score() may still clear them; this is the guarantee.
     */
    this.contact = 0;
    this.hitPatience = false;
    this.wait = 0;
    this.lastRelease = world.time || 0;
    this.take = 0;
    // A new wave, and a new set of bodies to count. `serial` is what stamps
    // them, in tagBody; nothing else may write it.
    this.serial++;
    this.made = 0;
    this.slain = 0;
    this.done = false;
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
    /*
     * ---- and it honours the band window ----
     *
     * It did not, and that quietly undid bandsFor() entirely. shuffle() builds
     * a rotation from the tier's own two bands; admit() then spliced in EVERY
     * eligible wave that was not already in it -- which is precisely the
     * out-of-band ones -- and it runs from begin(), so the window survived
     * exactly one wave. Logged at tier 40: after a shuffle the order read
     * `T T T T T T T T 4 5 4 5 5 4 4 4 4 5 5 4`, and one wave later
     * `T T T 2 T T T 1 2 T 3 T 4 3 5 2 4 5 5 3`. Tier 40 played five motes and
     * three needles as often as a tow and a bulwark.
     *
     * Nothing is admitted during the opening either: a teach wave is a script,
     * and splicing the rotation into the middle of it makes it not one.
     */
    if (this.wave && this.wave.teach) return 0;
    const already = new Set(this.order);
    const [lo, hi] = this.bandsFor(this.tier);
    const inBand = [];
    const rest = [];
    WAVES.forEach((wv, i) => {
      if (wv.teach || already.has(i) || !this.eligible(world, wv)) return;
      const b = wv.band || 1;
      (b >= lo && b <= hi ? inBand : rest).push(i);
    });
    /*
     * Out-of-band waves are not admitted -- they are what the next shuffle()
     * is for. The one exception is starvation: if the window has nothing to
     * offer AND there is nothing left to play, take anything rather than stand
     * the run in front of an empty field. begin() calls shuffle() when the
     * order is spent, so this should be unreachable; it is here because a
     * director with nothing to play stalls the run dead.
     */
    const take = inBand.length || this.at + 1 < this.order.length ? inBand : rest;
    let added = 0;
    for (const i of take) {
      const room = this.order.length - this.at;
      const at = this.at + 1 + ((Math.random() * Math.max(1, room)) | 0);
      this.order.splice(at, 0, i);
      added++;
    }
    return added;
  }

  /*
   * Un-played entries that the tier has since climbed away from.
   *
   * A rotation is built for the band the tier was on when shuffle() ran, and a
   * cycle is twenty-odd waves long -- so a run climbing through it is still
   * playing band 1 material several rungs after leaving band 1. admit() is
   * about what should come IN; this is about what should no longer be waiting.
   *
   * Never empties the cycle: if everything ahead is out of band the rotation
   * is left alone and the next shuffle() rebuilds it. Entries at or before the
   * playhead are history and are not touched, so `at` never moves.
   */
  prune() {
    if (this.at + 1 >= this.order.length) return 0;
    if (this.wave && this.wave.teach) return 0;
    const [lo, hi] = this.bandsFor(this.tier);
    const head = this.order.slice(0, this.at + 1);
    const tail = this.order.slice(this.at + 1);
    const keep = tail.filter((i) => {
      const b = WAVES[i].band || 1;
      return b >= lo && b <= hi;
    });
    if (!keep.length || keep.length === tail.length) return 0;
    this.order = [...head, ...keep];
    return tail.length - keep.length;
  }

  /**
   * Offer a lane: two traits, drawn from the same seed as everything else so
   * that the pair a given gate offers is a property of the run rather than of
   * when it happened to be reached.
   */
  offerLane(world) {
    const a = traitAt(world.runSeed | 0, this.cycle, this.tier, 11);
    let b = a;
    for (let slot = 12; b === a && slot < 24; slot++) {
      b = traitAt(world.runSeed | 0, this.cycle, this.tier, slot);
    }
    this.laneOffer = [a, b];
    return this.laneOffer;
  }

  /** Take one of them, fixing it for `laneFor` rungs. */
  takeLane(id) {
    if (!this.laneOffer || !this.laneOffer.some((t) => t.id === id)) return null;
    this.lane = { id, until: this.tier + CFG.waves.tier.laneFor };
    this.laneOffer = null;
    return this.lane;
  }

  /**
   * RECALL: end the running wave now, and score it on what is cleared.
   *
   * Not a free clean -- it scores what actually happened. A wave three
   * quarters cleared is one you were going to clear; below that it is a
   * stall, which is the honest verdict for a wave walked away from, and a
   * stall still counts toward the streak that steps the ladder back.
   *
   * Posed so that score() reads the verdict rather than scored separately:
   * one place decides what a wave was worth, and a second copy of that table
   * is a second thing to keep in step.
   */
  recallWave(world) {
    if (!this.recall.held || this.resting || !this.wave || this.wave.teach) return null;
    const T = CFG.waves.tier;
    this.recall.held--;
    this.recall.cd = T.recallCd;
    /*
     * What was actually killed, not what had merely not arrived yet. Under
     * the old reading a wave RECALLED in its first seconds scored near 100%
     * cleared -- the bodies still queued counted as cleared -- so the charge
     * bought a guaranteed clean for walking away from a wave before it
     * started. It buys what it says it buys now: three quarters of the wave
     * down.
     */
    const cleared = this.cleared(world);
    const clean = cleared >= T.recallClean;
    this.jobs.length = 0;
    this.hitPatience = false;
    this.resting = true;
    this.timer = rand(CFG.waves.rest[0], CFG.waves.rest[1]);
    const moved = this.score(world, clean ? 'clean' : 'stall');
    if (moved && world.onTier) world.onTier(moved);
    return { cleared, verdict: moved ? moved.verdict : null, moved: moved ? moved.moved : 0 };
  }

  /** OVERCLOCK: the next wave arrives twice as fast and pays double. */
  armOverclock() {
    if (!this.overclock.held || this.overclock.armed) return false;
    this.overclock.held--;
    this.overclock.cd = CFG.waves.tier.overclockCd;
    this.overclock.armed = true;
    return true;
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
    if (!d) return;
    /*
     * The rotation and the ladder are restored SEPARATELY, and running them
     * off one guard cost every early save its tier.
     *
     * `order` is empty for the whole of the opening grace -- it is not built
     * until the first begin() -- so a run saved in its first few seconds, or
     * by the page being hidden in them, writes `order: []`. That is a
     * perfectly good file. The old guard read it as a malformed one and
     * returned, which silently threw away `tier`, `peak` and `hold` with
     * it: a player who had climbed to tier 12 and quit early in a wave
     * came back to tier 1 and nothing said so.
     *
     * So an absent rotation now means only that there is no rotation to come
     * back to -- the run is left with the fresh one, opening grace and
     * tutorial waves and all, which is what it had -- and the ladder below is
     * restored either way.
     */
    if (Array.isArray(d.order) && d.order.length) {
      this.order = d.order.filter((i) => Number.isInteger(i) && i >= 0 && i < WAVES.length);
      // One *behind* the saved wave, because the first begin() steps forward
      // and has to land back on it. Setting `at` to the saved index directly
      // is how "resume on the wave I left" quietly became "resume on the one
      // after".
      const was = Math.min(d.at ?? 0, this.order.length - 1);
      this.at = Math.max(-1, was - 1);
      this.cycle = d.cycle || 1;
    }
    /*
     * A save written before the ladder existed has no tier at all, and
     * defaulting it to 1 would drop a long run back to the opening. Seeded
     * from the kill count instead, on the same shape the old swell used --
     * so a returning run resumes at about the difficulty it left.
     */
    /*
     * ---- the ceiling comes back before the rung, not after it ----
     *
     * It used to be `peak = max(tier, d.peak)`, and a save taken DURING A TRIAL
     * is standing three rungs above its ceiling by construction -- so reloading
     * one banked the unproven rung as earned, and then dropped the trial,
     * because the probe is only restored when `to` is above the peak the
     * restore had just inflated. The run came back owning a rung it had not
     * proved, with nothing left to prove it. Measured on build 207: saved
     * peak 19 with a trial to 22, restored peak 22 and no probe.
     *
     * So the ceiling is read on its own first. A trial then stands the run on
     * its rung without raising anything; only a run that is NOT mid-trial
     * floors the ceiling at where it is standing, which is the original rule
     * for saves written before build 188 that carry no peak at all.
     */
    this.peak = Math.max(1, Math.round(d.peak || 0));
    const pr = d.probe;
    this.probe = pr && Number.isFinite(pr.from) && Number.isFinite(pr.to) && pr.to > this.peak
      ? { from: Math.max(1, Math.round(pr.from)), to: Math.round(pr.to) }
      : null;
    if (this.probe) {
      this.tier = this.probe.to;
    } else {
      this.tier = Math.max(1, Math.round(d.tier ?? (1 + (world.kills || 0) / 40)));
      // Where the run is standing is the least it can have stood on, so the
      // ticks are right even for a save that predates `peak`.
      this.peak = Math.max(this.peak, this.tier);
    }
    this.hold = !!d.hold;
    /*
     * The sheet's charges. `max` is replayed from the ledger like every other
     * upgrade, so only what is in hand and the clock have to be carried --
     * both additive, both defaulting to "nothing spent".
     */
    if (d.recall) {
      this.recall.held = Math.max(0, d.recall.held | 0);
      this.recall.cd = Math.max(0, +d.recall.cd || 0);
    }
    if (d.overclock) {
      this.overclock.held = Math.max(0, d.overclock.held | 0);
      this.overclock.cd = Math.max(0, +d.overclock.cd || 0);
      this.overclock.armed = !!d.overclock.armed;
    }
    /*
     * The lane, if one was taken. Additive, and dropped once its stretch is
     * past -- but measured against the rung the run OWNS rather than the one it
     * is standing on, or a trial three rungs up would spend a lane that is
     * still live at the rung the trial falls back to.
     */
    const owned = this.probe ? this.probe.from : this.tier;
    this.lane = d.lane && d.lane.id && Number.isFinite(d.lane.until)
      && d.lane.until > owned ? { id: d.lane.id, until: d.lane.until | 0 } : null;
    this.grace = d.grace | 0;
    this.probeLock = 0;
    this.contact = 0;
    this.hitPatience = false;
    this.held = 0;
    this.glitch = 0;
    this.lastRelease = world.time || 0;
    this.resting = true;
    this.timer = 1.5; // a beat to look at the field before it starts again
    this.jobs = [];
    this.asked = 0;
    this.made = 0;
    this.slain = 0;
    this.done = false;
  }

  /**
   * Put the fuse out.
   *
   * Separate from `update` because `Game.update` does not CALL `update` while
   * an anomaly is up -- it is an if/else, and the director is the else. So the
   * `world.boss` arm of the guard below was unreachable, and the fuse did
   * exactly what its own comment said it must not: froze at whatever it held
   * when the way opened, sat there for the whole fight, and came back still
   * lit over a turret that had been clear for four minutes. The case for it
   * passed because it drove `Director.update` directly and never went through
   * the branch that skips it -- a rule asserted on a control that is never
   * reached. Game.update calls this on the boss side of that if/else.
   */
  douse() {
    this.held = 0;
    this.glitch = 0;
  }

  update(world, dt) {
    // Belt and braces: `Game.update` douses on the boss side of its if/else,
    // and this is the same rule stated where the clock lives, for any caller
    // that reaches here with either condition true.
    if (world.phase !== 'staging' || world.boss) {
      this.douse();
      return;
    }
    const glitched = this.burn(world, dt);
    if (glitched) {
      if (world.onTier) world.onTier(glitched);
      return;
    }

    if (this.probeLock > 0) this.probeLock = Math.max(0, this.probeLock - dt);
    // The sheet's two clocks. One charge back per cooldown, and never above
    // what the tree paid for.
    for (const c of [this.recall, this.overclock]) {
      if (c.cd <= 0) continue;
      c.cd = Math.max(0, c.cd - dt);
      if (c.cd === 0) c.held = Math.min(c.max, c.held + 1);
    }

    // A slow trickle of aimless matter, all run, independent of the waves.
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = rand(CFG.waves.drift[0], CFG.waves.drift[1]);
      if (driftCount(world) < CFG.maxDrift) spawnDrift(world);
    }

    /*
     * The two live signals the ladder scores on, gathered while the wave runs
     * rather than reconstructed after it. Both were already computed every
     * frame for other reasons; this is the first thing that reads them.
     */
    if (!this.resting && world.attackers.size > 0) this.contact += dt;

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
    /*
     * THIS WAVE'S bodies, not the field's.
     *
     * It was `hostileCount(world)`, so the wave before's leftovers counted
     * toward the threshold this wave has to get under -- which let a wave end
     * having cleared less of itself the messier the field it inherited, and
     * is the other half of "many objects still on field and it resets". A
     * wave is over when the wave is over.
     */
    if (this.standing(world) > thinAt && this.wait < CFG.waves.patience) return;
    // Reaching patience means the field never came back. That is the wave
    // telling you it was too much, in the one number that already knew.
    if (this.wait >= CFG.waves.patience) this.hitPatience = true;
    const teach = this.wave && this.wave.teach;
    const rest = teach ? CFG.waves.teachRest : CFG.waves.rest;
    this.resting = true;
    this.timer = rand(rest[0], rest[1]);
    // The wave is over: score it, and let the world announce any move.
    const moved = this.score(world);
    if (moved && world.onTier) world.onTier(moved);
  }

  /** Start the next wave, rebuilding the rotation if this one is spent. */
  begin(world) {
    if (this.order.length) this.admit(world);
    this.prune();
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
    // OVERCLOCK halves the gap: the same wave, arriving at twice the rate.
    const squeeze = this.overclock.armed ? CFG.waves.tier.overclockGap : 1;
    this.timer = rand(gap[0], gap[1]) * squeeze;

    // The field cap is a hard ceiling on top of the wave. Hold the job rather
    // than dropping it: a wave is a group, and losing half of it to a cap the
    // player is about to clear would make waves quietly inconsistent.
    if (hostileCount(world) >= CFG.maxEnemies) return;

    const job = this.jobs.shift();
    if (!job) return;
    const t = job.type;

    // A shape made of towed pairs is a traffic jam rather than a formation.
    // They file in.
    if (job.n > 1 && !t.tows) {
      const room = Math.min(job.n, CFG.maxEnemies - hostileCount(world));
      if (room >= 2) { spawnFormation(world, [t], room); this.lastRelease = world.time || 0; return; }
    }
    let x = rand(t.r + 12, world.width - t.r - 12);
    // Two SCIONs arriving on top of each other seed the same host twice and
    // read as one event rather than two decisions.
    if (t.id === 'scion') x = scionLane(world, t, x);
    release(world, t, x, -50 - rand(0, 40));
    this.lastRelease = world.time || 0;
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
      /*
       * `spent` for the reason CLAUDE.md gives: a boss's own structure is
       * still drawn through its ending -- the arrest snaps the frame off a
       * piece at a time and the infall takes the rest -- and "anything that
       * decides what may be shot has to honour it". Rounds and the assist
       * already did; blasts never have, so a PULSE (up to 574.6 units at two
       * SHOCKFRONTs) or a mine going off inside a dying boss was damaging the
       * pieces the outro is made of, and could take one before the sequence
       * asked for it.
       */
      if (e.dead || e.spent || e === source) continue;
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
      e.applyDamage(world, damage * (0.35 + falloff * 0.65), nx, ny, impulse * falloff,
        0, 0, !!blast.throwOff);
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
