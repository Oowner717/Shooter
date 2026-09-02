// The turret. Stationary, immortal, and the only thing in the arena with
// infinite mass — everything else bounces off it.

import { CFG } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, angleDelta } from './util.js';
import { fire, clampAim } from './projectiles.js';
import { Patch } from './patch.js';
import { fx, spark, ring, shake, ripple, shard as fxShard, ember as fxEmber } from './fx.js';

/*
 * Every level of every part in the TURRET branch, added up: 1 FEED, 3 GIMBAL,
 * 2 ARRAY, 2 SIEVE, 3 PILE, 3 SPINES, 3 SHROUD, 1 INTAKE. What `rig().filled` is a
 * fraction of, and the one number that tells the machine it is finished.
 *
 * It is written out here rather than derived, because shooter.js reaching into
 * the tree to ask would be the gun importing the shop. So it is a copy, and a
 * copy of a number that moves is a number that goes stale: it said 17 for the
 * whole of build 178, when FEED went from two levels to one, and a machine
 * that can never fill its last socket never lights. scripts/check-build.mjs
 * holds this to the tree now.
 */
export const RIG_MAX = 18;

/** How wide SALVO throws its three. */
const SALVO_FAN = 0.09;
import { applyBlast } from './enemies.js';
import { audio } from './audio.js';

/**
 * What the tree has done to the gun, as one number, 1 at stock.
 *
 * Bosses are the only hostiles in the game with no scaling at all. `spawnOne`
 * applies the tier's `scaleAt()` behind `!type.fixed` (enemies.js), every boss
 * body is `fixed`, and each one is built by `new Enemy` inside `Boss.body()` --
 * so a boss meets the authored literal whatever the player is carrying.
 *
 * Measured, seven anomalies, auto-aim and auto-fire, nothing bought against
 * the whole tree bought: 227.0s -> 57.3s, 227.3 -> 43.4, 245.0 -> 47.5,
 * 223.7 -> 43.3, 236.3 -> 41.5, 216.0 -> 41.0, 212.6 -> 67.8. Every one of
 * them falls to about a fifth of the length it was tuned to.
 *
 * A HANDFUL OF NODES CARRY ALL OF IT, and they cost a few thousand of the
 * tree's hundred-odd: HOLLOWPOINT at 1.25 a level over three, SALVO's every
 * Nth shot, and what is left of FEED. Resetting them alone returns a
 * fully-bought fight to nearly its stock length -- so this is the product to
 * answer, not the ledger and not the spend. Half the tree is mines, abilities
 * and defence: a player who bought those has not shortened any fight and must
 * not be handed a harder boss for it.
 *
 * SIGHT was the fourth term and went in build 215, taking a 1.25^3 with it.
 * PILE replaces it on the TURRET branch and is NOT counted here on purpose:
 * it is a fixed 26 damage on a fixed clock in a ring round the machine, so
 * against a boss -- one large body, met at range, in the middle of the field
 * -- it is worth a few damage a second and nothing the fight can feel. What
 * this measures is what the GUN does to the thing in front of it.
 *
 * The terms are the gun's own, and deliberately read from the same places the
 * gun reads them (`up.damage` at the `shot()` below, `up.rate` in
 * Game.update, `up.salvo` here) rather than re-derived from the tree.
 *
 * Asserted as a PRODUCT in regress.mjs rather than node by node, for the same
 * reason `up.rate` is: a new damage node arriving is exactly the thing that
 * would otherwise stop this tracking the gun, silently.
 */
/**
 * The wave a PILE sends out through the floor.
 *
 * An ANNULUS, not a blast: born at `CFG.pile.r0` and only ever travelling
 * outward, so it cannot reach what is already on the mount. See CFG.pile for
 * why that is the design and not an accident.
 *
 * Rides in `world.effects`, which already has the update/draw/dead contract
 * this needs -- and, because it also exposes `wellField()`, the background
 * picks it up for free: Game.update collects a well off every effect that has
 * one. Nothing in this game has ever pushed the lattice OUTWARD; WELL only
 * ever pulled it in. That is what the effect is made of.
 */
export class Front {
  constructor(x, y, level) {
    const P = CFG.pile;
    this.x = x;
    this.y = y;
    this.r0 = P.r0;
    this.r = P.r[Math.min(level, P.r.length) - 1];
    this.travel = Math.max(0.05, (this.r - this.r0) / P.speed);
    this.life = this.travel + 0.45; // the substrate springs back after the front
    this.t = 0;
    this.dead = false;
    this.hit = new Set(); // struck once, on the frame the front passes it
    this.cut = 0; // ...and how many, which decides how loud the ending is
  }

  /** Where the front is now. */
  get radius() {
    return this.r0 + (this.r - this.r0) * Math.min(1, this.t / this.travel);
  }

  /**
   * The substrate, pushed OUT.
   *
   * `background.warp` computes `pull = min(d * 0.97, d * f * 1.5)` from
   * `f = (1 - d/reach) ** 1.7 * strength` and settles each lattice point at
   * `d - pull`. A NEGATIVE strength makes `pull` negative, so `d - pull > d`
   * and every point moves outward while the twist unwinds -- the opposite of
   * what WELL does with the same three lines. It eases off over the last of
   * the life so the field springs back rather than snapping.
   */
  wellField() {
    const k = Math.min(1, this.t / this.travel);
    const ease = this.t <= this.travel ? 1 : Math.max(0, 1 - (this.t - this.travel) / 0.45);
    return { x: this.x, y: this.y, reach: this.radius + 90, strength: -0.85 * ease * (0.35 + k * 0.65) };
  }

  update(world, dt) {
    this.t += dt;
    if (this.t >= this.life) { this.dead = true; return; }
    if (this.t > this.travel) return;
    const P = CFG.pile;
    const rr = this.radius;
    const span = this.r - this.r0;
    for (const e of world.enemies) {
      /*
       * `spent` and `fizzle` are here for the reason CLAUDE.md gives: a
       * boss's own structure is still drawn through its ending and must not
       * be shot at, shoved, or cashed in. `harmless` keeps grey grey -- an
       * automatic thing that vaporised DRIFT would undercut SIEVE and break
       * the promise the colour rule makes.
       */
      if (e.dead || e.harmless || e.staged || e.spent || e.fizzle) continue;
      if (this.hit.has(e)) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      /*
       * The mount is included, deliberately, from build 216.
       *
       * Build 215 skipped anything inside the birth radius on the grounds
       * that the glitch timer is the only involuntary way down and its answer
       * -- shoving the thing off -- had to stay the player's decision. That
       * was overruled: negating the glitch threat with what you have bought
       * is a legitimate thing for the tree to sell, and the upgrade system's
       * unspoken direction is toward a machine that increasingly looks after
       * itself. So PILE clears the mount too, and PULSE stops being the only
       * answer to a body on the turret -- it is still the only one you can
       * ask for on the frame you need it.
       *
       * The front is still an annulus and still only travels outward; what
       * changed is that a body whose EDGE the front has reached counts, and a
       * body sitting on the machine has its edge inside `r0` from the first
       * frame. Nothing else about the geometry moved.
       */
      // The front has reached it, and had not on the frame before. The body's
      // own radius counts: a BULWARK is met when its edge is met.
      if (d - e.r > rr) continue;
      this.hit.add(e);
      this.cut++;
      // Clamped at BOTH ends: a body on the mount is at `d < r0`, so the raw
      // fraction goes above 1 and would hand it more impulse than the wave
      // has. It gets the full share, not more than the full share.
      const f = 1 - Math.min(1, Math.max(0, (d - this.r0) / (span || 1)));
      const nx = dx / d;
      const ny = dy / d;
      /*
       * `thrown` BEFORE the impulse, or the cap clips the shove on the frame
       * it is given: it exempts the body from `cruise * maxSpeedFactor` up to
       * `physics.thrownSpeed` and stops it steering, which is what makes a
       * struck body visibly lose ground instead of being nudged and driving
       * straight back in.
       */
      e.thrown = Math.max(e.thrown || 0, P.thrown);
      e.applyDamage(world, P.damage * (0.35 + f * 0.65), nx, ny, P.impulse * f);
      // The same mark every time, so the cause is legible without the event
      // being loud -- and only while there is budget for it.
      if (this.cut <= 8 && fx.quality >= 0.7) {
        spark(e.x - nx * e.r, e.y - ny * e.r, nx * 210, ny * 210, '#dff1ff', 0.22, 2);
      }
    }
  }

  /**
   * Two arcs and nothing else. Colourless on purpose: it is the medium
   * moving, not something added to it, and it is the only effect in the game
   * with no hue to confuse with a round, a mine or a boss.
   *
   * Alpha rides in `rgba()` inside one save/restore and is never assigned to
   * `globalAlpha` -- see the four bugs CLAUDE.md records of exactly that
   * shape. No `flash()` ever: this goes off every three seconds for the rest
   * of the run, and four hundred screen whites is a strobe.
   */
  draw(ctx) {
    const k = Math.min(1, this.t / this.travel);
    const rr = this.radius;
    const left = Math.max(0, Math.min(1, (this.life - this.t) / 0.3));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The wake, behind the front and wider.
    ctx.strokeStyle = rgba('#b9d4e6', 0.4 * left * (1 - k * 0.35));
    ctx.lineWidth = 5 + (1 - k) * 9;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(2, rr - 8 - k * 10), 0, TAU);
    ctx.stroke();
    // ...and the front itself, thinning as it goes out.
    ctx.strokeStyle = rgba('#ffffff', 0.85 * left * (1 - k * 0.5));
    ctx.lineWidth = 2 + (1 - k) * 3.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, rr, 0, TAU);
    ctx.stroke();
    /*
     * The scar: a dim residue drawn AT the radius the wave reached, after the
     * front has gone. A ring that fades as it grows is dimmest exactly where
     * its radius means something -- this is the frame that says how far it
     * got. Skipped entirely when the strike cut nothing, which is most of
     * them: an effect that is spectacular once is intolerable the four
     * hundredth time, and the answer is to draw less when less happened.
     */
    if (this.cut > 0 && this.t > this.travel) {
      const s2 = 1 - (this.t - this.travel) / 0.45;
      ctx.strokeStyle = rgba('#8fb6d8', 0.3 * s2 * s2);
      ctx.lineWidth = CFG.hairline * 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function gunScale(world) {
  const up = world.up;
  const out = up.damage
    // SALVO is every Nth shot leaving as three, so two extra rounds in N.
    * (up.salvo ? 1 + 2 / up.salvo : 1)
    / (up.rate || 1);
  return Math.max(1, out);
}

export class Shooter {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = CFG.shooter.r;
    // Static physics body: infinite mass, never integrated, so these are the
    // only fields the solver touches.
    this.vx = 0;
    this.vy = 0;
    this.invMass = 0;
    this.restitution = 0.55;
    this.friction = 0.4;
    this.dead = false;

    this.aim = -Math.PI / 2;
    this.targetAim = -Math.PI / 2;
    this.recoil = 0;
    this.heat = 0;
    this.cooldown = 0;
    this.spin = 0;

    // --- lever ---
    this.gripAngle = Math.PI / 2; // straight down = barrel straight up
    // 1 while SPIRAL is sweeping, then decaying: how much of the gimbal's
    // closed travel circle is still drawn. See drawLever().
    this.sweepFade = 0;
    this.gripHeld = false;
    this.gripGlow = 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.aim = this.targetAim = -Math.PI / 2;
    this.recoil = 0;
    this.heat = 0;
    this.cooldown = 0;
    this.gripAngle = Math.PI / 2;
    this.gripHeld = false;
    this.gripGlow = 0;
  }

  aimAt(x, y, inverted) {
    let dx = x - this.x;
    if (inverted) dx = -dx;
    const dy = y - this.y;
    this.targetAim = clampAim(Math.atan2(dy, dx));
  }

  // ------------------------------------------------------------------ lever

  get gripX() {
    return this.x + Math.cos(this.gripAngle) * CFG.shooter.gripLen;
  }

  get gripY() {
    return this.y + Math.sin(this.gripAngle) * CFG.shooter.gripLen;
  }

  /**
   * Point the grip at (x, y). The rod is rigid, so the grip slides along its
   * arc rather than following the finger exactly, and the barrel — being the
   * other end of the same rod — swings the opposite way.
   */
  driveGrip(x, y, inverted) {
    let dx = x - this.x;
    if (inverted) dx = -dx;
    const dy = y - this.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    // Clamp into the lower hemisphere, mirroring the barrel's own limit.
    const down = Math.PI / 2;
    const limit = CFG.shooter.aimClamp;
    const d = clamp(angleDelta(down, Math.atan2(dy, dx)), -limit, limit);
    this.gripAngle = down + d;
    this.targetAim = this.gripAngle - Math.PI;
  }

  grabGrip(x, y, inverted) {
    this.gripHeld = true;
    this.driveGrip(x, y, inverted);
    this.aim = this.targetAim; // the rod is already where your hand put it
  }

  releaseGrip() {
    this.gripHeld = false;
  }

  /** How far the barrel still has to travel to reach its target bearing. */
  get aimError() {
    return Math.abs(angleDelta(this.aim, this.targetAim));
  }

  update(world, dt) {
    this.gripGlow += ((this.gripHeld ? 1 : 0) - this.gripGlow) * clamp(dt * 12, 0, 1);

    // The barrel holds wherever it was last pointed. Auto aim traverses at its
    // own slower rate, easing off as it arrives, so it sweeps between targets
    // instead of jumping between them.
    const d = angleDelta(this.aim, this.targetAim);
    // SLEW scales the whole traverse rather than only its ceiling. The ceiling
    // is not what binds over most of a sweep -- the ease-in term is -- so an
    // upgrade that lifted the cap alone moved the barrel by nothing at all,
    // which is what it had been doing since it was written.
    const rate = world.autoSteering && !this.gripHeld
      ? Math.min(CFG.shooter.autoTurnRate, Math.max(0.9, Math.abs(d) * 3)) * world.up.slew
      : CFG.shooter.turnRate;
    this.aim += clamp(d, -rate * dt, rate * dt);

    // The rod is rigid: unless a hand is on it, it is simply the far end of
    // whatever the barrel is doing.
    if (!this.gripHeld) this.gripAngle = this.aim + Math.PI;

    this.recoil = Math.max(0, this.recoil - dt * 6.5);
    this.heat = Math.max(0, this.heat - dt * 1.4);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.spin += dt * (0.6 + this.heat * 2.4);
  }

  get muzzleX() {
    return this.x + Math.cos(this.aim) * (this.r * 1.42 - this.recoil * 7);
  }

  get muzzleY() {
    return this.y + Math.sin(this.aim) * (this.r * 1.42 - this.recoil * 7);
  }

  /*
   * It used to also require `world.lockout <= 0`. That field went with ORDINAL
   * in build 82 and nothing noticed, because `undefined <= 0` is false — so
   * canFire returned false on every frame of build 82, 83 and 84 and the
   * turret could not shoot at all. Deleting a world field leaves every
   * comparison against it silently answering the wrong way, and a `<=` answers
   * it in the direction that breaks things.
   */
  canFire(world) {
    /*
     * ---- the gun is silent through an anomaly's arrival and its death ----
     *
     * Every round the turret fires arrives here: both pointer branches, the
     * space key, updateFiring's cadence, and SPIRAL's sweep -- which zeroes
     * the cooldown to bypass the cadence and is refused anyway, because this
     * sits ahead of it. One place, and a boss added later cannot get past it
     * without inheriting the answer.
     *
     * A truthiness test on `world.boss` and a method call, deliberately, and
     * NEVER a comparison against a world field. The note above is the record
     * of `world.lockout` -- this same feature -- being deleted in build 82 and
     * leaving `undefined <= 0` answering false, so the turret could not fire
     * at all for three builds and nothing caught it.
     */
    if (world && world.boss && world.boss.sequencing()) return false;
    return this.cooldown <= 0;
  }

  /**
   * One shot of whatever is loaded. Returns true if it actually went out.
   *
   * @param scale a multiplier on the round's damage. SPIRAL fires mid-sweep
   *   at less than a placed shot is worth; everything else leaves it at 1.
   */
  shoot(world, scale = 1) {
    if (!this.canFire(world)) return false;
    const a = this.aim + spread(0.012);
    const slow = 1;
    const R = CFG.rounds;
    const up = world.up;

    // Every ammo upgrade lands here rather than inside each round, so a round
    // stays a description of what it does and the upgrades stay scalars.
    // A round that left mid-sweep is drawn differently -- see
    // drawProjectiles(). It is still the loaded round with all of its
    // upgrades; it is only marked as having been thrown by the sweep.
    const spun = world.spiral > 0;
    const shot = (angle, opts) => fire(world, this.muzzleX, this.muzzleY, angle, {
      ...opts,
      spun,
      speed: (opts.speed || CFG.bolt.speed) * up.speed,
      damage: (opts.damage ?? CFG.bolt.damage) * up.damage * scale,
      impulse: (opts.impulse ?? CFG.bolt.impulse) * up.impulse,
      bounces: (opts.bounces ?? CFG.bolt.bounces) + up.bounces,
    });

    /*
     * SALVO: every Nth shot leaves as three. An offer called OVERDRAW made
     * every shot do it for the next dozen; that system is gone -- see "There
     * are no Offers" in the README.
     *
     * `fan` is a list of angle offsets and every branch below spreads its
     * round across it — except the shotgun, which built its own cone and
     * ignored `fan` entirely. That meant SALVO had never done anything at all
     * for SCATTER, in any build. It does now: the branch multiplies its pellets
     * across the fan, so a tripled SCATTER is fifteen pellets and not five.
     */
    this.salvoCount = (this.salvoCount || 0) + 1;
    const salvo = up.salvo && this.salvoCount % up.salvo === 0;
    // SALVO's three, at the spread the fan is drawn to.
    const fan = salvo ? [-SALVO_FAN, 0, SALVO_FAN] : [0];

    if (world.round === 'shotgun') {
      const g = R.shotgun;
      // DOUBLE-O widens the count without widening the cone, so the extra
      // pellets fill it in rather than spreading it out. LONG THROW moves the
      // cliff further away; it never removes it.
      const pellets = g.pellets + up.shotPellets;
      // Every pellet, once per fan offset — so a tripled SCATTER is three cones
      // and not one. See the note on `fan` above.
      for (const f of fan) for (let i = 0; i < pellets; i++) {
        const off = ((i / (pellets - 1)) - 0.5) * g.spread + spread(0.02) + f;
        shot(a + off, {
          speed: rand(g.speed[0], g.speed[1]) * slow,
          r: 3.2,
          damage: g.damage,
          impulse: 44,
          life: g.life * up.shotRange,
          bounces: 0,
          color: '#ffd9a0',
          trail: 0.03,
          form: 'pellet',
        });
      }
    } else if (world.round === 'explosive') {
      const g = R.explosive;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 5.6,
        damage: g.damage,
        impulse: 70,
        bounces: 0,
        color: '#ff9f5c',
        core: '#fff0d8',
        trail: 0.03,
        form: 'shell',
        burst: heBurst,
      });
    } else if (world.round === 'arc') {
      const g = R.arc;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 4.6,
        damage: g.damage,
        impulse: 40,
        bounces: 0,
        /*
         * The card is violet (#ad73ff) and the round flew pale BLUE -- so
         * the chip you press and the thing that leaves the barrel did not
         * match, on the one round whose whole identity is its colour of
         * electricity. SPINE and BOLT had the same drift and get the same
         * correction: flight colours come from the card's family now.
         */
        color: '#c79bff',
        core: '#ffffff',
        trail: 0.038,
        form: 'arc',
        chain: true,
        jumps: R.arc.jumps + up.arcJumps,
      });
    } else if (world.round === 'spine') {
      const g = R.spine;
      // DOUBLE TAP holds its second dart at the muzzle rather than shortening
      // the cadence: one trigger pull with a stutter in it, not a faster gun.
      // It was BOLT's until build 209; see CFG.rounds.spine.
      const taps = 1 + up.spineTap;
      for (const f of fan) {
        for (let t = 0; t < taps; t++) {
          shot(a + f + (t ? spread(0.02) : 0), {
            speed: g.speed * slow,
            r: 3.4,
            damage: g.damage * g.tapFade ** t,
            impulse: 30,
            bounces: 0,
            color: '#ff9ade',
            core: '#ffffff',
            trail: 0.05,
            form: 'dart',
            hold: t * g.tapGap,
            pierce: g.pierce + up.pierce,
            pierceFade: up.spineFade || g.fade,
            shred: up.spineShred,
          });
        }
      }
    } else if (world.round === 'slug') {
      const g = R.slug;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 7.2,
        damage: g.damage,
        impulse: g.impulse * up.slug,
        bounces: 0,
        color: '#b8c6d8',
        core: '#f2f6fb',
        trail: 0.02,
        form: 'slab',
        // Marked as thrown-by-SLUG. While the mark is live the body neither
        // deals nor takes collision damage — SLUG puts things where you want
        // them and is not allowed to be a damage round by proxy. Everything
        // else on the field still trades damage on impact.
        onHit: (w, e) => { e.slugged = Math.max(e.slugged || 0, R.slug.calm); },
      });
    } else if (world.round === 'rime') {
      const g = R.rime;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 4.4,
        damage: g.damage,
        impulse: 18,
        bounces: 0,
        color: '#8fe3ff',
        core: '#e8faff',
        trail: 0.05,
        form: 'flake',
        onHit: (w, e) => { e.chill = Math.max(e.chill, g.chill * w.up.chill); },
      });
    } else if (world.round === 'spore') {
      const g = R.spore;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 5,
        damage: g.damage,
        impulse: 24,
        bounces: 0,
        color: '#8eeb4b',
        core: '#e6ffe6',
        trail: 0.04,
        form: 'pod',
        burst: (w, x, y) => {
          w.effects.push(new Patch(x, y, {
            r: g.patch.r * w.up.patchR,
            life: g.patch.life,
            dps: g.patch.dps,
            tone: '#8eeb4b',
            spore: true,
          }));
          /*
           * Only so much ground may burn at once. Patch damage is per body
           * and stacks with nothing stopping it, so the round's real number
           * was never its dps but its dps times how many of them the fire
           * rate kept alive -- see CFG.rounds.spore.patch.cap.
           *
           * The oldest goes out first, which is what makes SPORE a placement
           * round: the fourth shot does not add to the third, it replaces
           * the first, so where you put them is the decision.
           *
           * `w.effects` is in insertion order, so a forward walk is oldest
           * first. Retired patches are skipped rather than counted, or a
           * burst would put out one already going out and leave four burning.
           */
          const cap = g.patch.cap + w.up.patchCap;
          let live = 0;
          for (const fx of w.effects) if (fx.spore && !fx.retired) live++;
          for (const fx of w.effects) {
            if (live <= cap) break;
            if (fx.spore && !fx.retired) { fx.retire(); live--; }
          }
        },
      });
    } else if (world.round === 'tithe') {
      const g = R.tithe;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 4.2,
        damage: g.damage,
        impulse: 22,
        bounces: 0,
        color: '#7cffb2',
        core: '#dfffe9',
        trail: 0.05,
        form: 'tithe',
        onHit: (w, e) => {
          /*
           * The ramp lands here, on the body that was actually hit, rather
           * than being guessed at the muzzle. The base damage has already
           * gone in by the time this runs; what this adds is what the marks
           * already on it are worth, and then it deepens the mark by one.
           *
           * So TITHE is nearly harmless on the first hit and real damage by
           * the eighth, which is what lets it be left on one large thing for a
           * long fight without ever changing ammunition.
           */
          const extra = e.marks * g.step * w.up.titheStep;
          if (extra > 0) e.applyDamage(w, g.damage * w.up.damage * extra, 0, 0, 0);
          e.marks = Math.min(g.marks + w.up.titheMarks, e.marks + 1);
          e.bounty = Math.max(e.bounty, g.bounty * w.up.bounty);
        },
      });
    } else {
      const g = R.standard;
      // OVERSTUFFED rides on the bounce budget, so an extra ricochet is worth
      // the same whether it comes off a wall or off a body. DOUBLE TAP was
      // here until build 209 and is SPINE's now, effect and all -- moving the
      // node alone would have sold a card that did nothing to the round it
      // sat beneath.
      for (const f of fan) {
        shot(a + f, {
          speed: CFG.bolt.speed * slow,
          color: '#a8c4ff',
          core: '#eef4ff',
          damage: CFG.bolt.damage,
          life: CFG.bolt.life * up.boltLife,
          bounces: CFG.bolt.bounces + up.boltBounce,
          rebound: up.boltRebound,
          reboundFade: g.reboundFade,
        });
      }
    }

    this.recoil = 1;
    // What just left, for the muzzle flash: the flash on the machine wears
    // the round's colour, so switching ammunition is visible at the barrel
    // and not only on the strip.
    this.shotTint = ({ shotgun: '#ffd9a0', explosive: '#ff9f5c', arc: '#c79bff',
      spine: '#ff9ade', slug: '#b8c6d8', rime: '#8fe3ff', spore: '#8eeb4b',
      tithe: '#7cffb2' })[world.round] || '#a8c4ff';
    this.heat = Math.min(1, this.heat + 0.14);
    audio.shot();
    shake(0.5);
    // ejected casing
    const side = this.aim + Math.PI / 2;
    spark(this.muzzleX, this.muzzleY, Math.cos(side) * rand(60, 140), Math.sin(side) * rand(60, 140) - 40, '#ffd9a0', 0.3, 1.6);
    return true;
  }

  draw(ctx, world) {
    const breached = world.attackers.size > 0;
    const t = world.time;
    const accent = breached ? '#ff5d5d' : '#59e0ff';

    // Aim ray. It reaches further while the ball is held, because that is when
    // you are aiming by feel rather than by pointing at a target.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rayLen = 300 + this.gripGlow * 320;
    const rx = this.x + Math.cos(this.aim) * rayLen;
    const ry = this.y + Math.sin(this.aim) * rayLen;
    const grad = ctx.createLinearGradient(this.x, this.y, rx, ry);
    grad.addColorStop(0, rgba(accent, 0.2 + this.gripGlow * 0.22));
    grad.addColorStop(1, rgba(accent, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.muzzleX, this.muzzleY);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.restore();

    // The muzzle flash, in the round's own colour. Off the recoil rather
    // than a timer of its own: recoil spikes to 1 on the shot and decays,
    // which is exactly the envelope a flash wants.
    if (this.recoil > 0.06 && this.shotTint) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, this.shotTint, this.muzzleX, this.muzzleY,
        14 + this.recoil * 20, 0.55 * this.recoil);
      ctx.restore();
    }

    this.drawLever(ctx, accent, t);
    this.drawMachine(ctx, world, accent, t, breached);
  }

  /*
   * ========================== the machine ============================
   *
   * ONE MACHINE, and the upgrades are made of it rather than hung off it.
   *
   * The version this replaces drew a mount full of empty sockets and then put
   * a gadget in each one: a dish on a mast, a spike in a notch, a ring on a
   * track. Every part was a separate little object at a separate little
   * radius, most of them translucent, and a fully rigged turret was not a
   * better machine -- it was the same machine with seven things floating
   * around it. At forty units across on a phone that reads as clutter, and
   * clutter is not a reward.
   *
   * So every part is now STRUCTURE. It changes the body's outline, it is drawn
   * opaque with hard edges, and it is drawn in the same pass as the thing it
   * belongs to:
   *
   *   SPINES   the hull. Armour plates round the deck, growing it outward --
   *            the machine is physically bigger by the end.
   *   SHROUD   the mantlet. A gun shield that closes round the breech and
   *            turns with the barrel. The biggest change to the silhouette.
   *   GIMBAL   the bearing. A toothed race under the deck, a row of teeth
   *            per level.
   *   ARRAY    the fin. A flat panel blade off the back, not a dish.
   *   FEED     the drum. A belt box on the breech's flank with rounds in it.
   *   SIGHT    the block. A boxed sight along the barrel with a lit lens.
   *   INTAKE   the vents. Louvres cut through the skirt.
   *
   * Bare, it is a plain dark hexagon with a stub barrel and one lit line --
   * basic on purpose, so that there is somewhere to go.
   */
  drawMachine(ctx, world, accent, t, breached) {
    const g = this.rig(world);
    const filled = g.filled || 0;
    const flash = clamp(world.rigFlash / CFG.rig.flash, 0, 1);
    // The whole thing grows. Nothing else says "look what I built" as
    // immediately as the machine taking up more room than it used to.
    const R = this.r * (1 + filled * 0.34) * (1 + flash * 0.06);
    const lit = 0.55 + filled * 0.45;

    const DARK = 'rgba(7,14,23,0.98)';
    const BODY = 'rgba(20,34,52,0.99)';
    const FACE = 'rgba(30,50,74,0.99)';

    const poly = (n, rr, turn, cx = 0, cy = 0) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + turn;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    ctx.save();
    ctx.translate(this.x, this.y);

    /*
     * ---- the reach of the assist ----
     *
     * A hairline arc across the cone at exactly the distance a target has to
     * be inside, drawn only while auto aim is switched on. Without it the base
     * range is invisible -- you only ever meet it as "auto aim ignored that
     * one" -- and ARRAY is a number on a card rather than a line you watch
     * move out.
     *
     * It went in at build 109 with the reach itself and was lost at 150, in
     * the pass that turned every floating gadget into structure. It was not a
     * gadget: it is the one part of the machine that is about the field rather
     * than about the machine, and it is the only thing that says where the
     * assist stops.
     *
     * Drawn first, under everything, so it never competes with the turret.
     */
    if (world.autoAim) {
      const reach = CFG.shooter.aimRange * world.up.aimRange;
      const cone = CFG.shooter.aimClamp;
      ctx.strokeStyle = rgba(accent, 0.12 + flash * 0.3);
      ctx.lineWidth = CFG.hairline;
      ctx.setLineDash([CFG.hairline * 5, CFG.hairline * 11]);
      ctx.beginPath();
      ctx.arc(0, 0, reach, -Math.PI / 2 - cone, -Math.PI / 2 + cone);
      ctx.stroke();
      /*
       * ...and the two edges of the cone, as short ticks at the arc. The arc
       * alone says how far and says nothing about how wide, and "past the
       * shoulder" is the other half of why the assist ignores something --
       * see the note on aimClamp in config.js.
       */
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const a = -Math.PI / 2 + side * cone;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.moveTo(c * (reach - 14), sn * (reach - 14));
        ctx.lineTo(c * (reach + 14), sn * (reach + 14));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /*
     * ---- GIMBAL: the bearing race ----
     *
     * There were legs: three struts out from under the deck, each with a
     * crossbar at the foot, drawn in translucent grey. Three upside-down Ts
     * hanging under the machine. They were meant to say "mounted" and they
     * said nothing -- the turret does not stand anywhere, it is the middle of
     * the field, and a tripod under it only ever answered a question nobody
     * had asked. Gone. The race is where this part is legible anyway.
     */
    if (g.slew) {
      // the race: a machined ring with teeth cut in it, one row per level
      for (let i = 0; i < g.slew; i++) {
        const rr = R * (1.06 + i * 0.13);
        ctx.strokeStyle = rgba('#7fa8c8', (0.5 + 0.14 * i) * lit);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.stroke();
        const teeth = 18 + i * 6;
        ctx.lineWidth = CFG.hairline * 2;
        ctx.beginPath();
        for (let k = 0; k < teeth; k++) {
          const a = this.spin * (i % 2 ? -0.5 : 0.5) + (k / teeth) * TAU;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          ctx.moveTo(c * rr, sn * rr);
          ctx.lineTo(c * (rr + 3.4), sn * (rr + 3.4));
        }
        ctx.stroke();
      }
    }

    // ---- SPINES: the hull. Armour that makes the machine bigger -----------
    if (g.casing) {
      for (let i = 0; i < g.casing; i++) {
        const rr = R * (1.0 + i * 0.16);
        const last = i === g.casing - 1;
        ctx.fillStyle = i ? BODY : FACE;
        // The outermost plate carries the bright edge: the silhouette is what
        // the eye reads first and it should be the lit line, not an inner one.
        ctx.strokeStyle = rgba(last ? '#bfe6ff' : accent, (last ? 0.7 : 0.3) * lit);
        ctx.lineWidth = CFG.hairline * (last ? 2.6 : 2);
        poly(6, rr, Math.PI / 6 + i * 0.26);
        ctx.fill();
        ctx.stroke();
      }
      // chamfers: a bright short stroke on each plate's outer corner, which is
      // what makes a stack of hexagons read as bevelled metal
      const rr = R * (1.0 + (g.casing - 1) * 0.16);
      ctx.strokeStyle = rgba('#bfe6ff', 0.5 * lit);
      ctx.lineWidth = CFG.hairline * 1.8;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6 + (g.casing - 1) * 0.26;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.moveTo(c * rr * 0.86 - sn * 4, sn * rr * 0.86 + c * 4);
        ctx.lineTo(c * rr - sn * 1, sn * rr + c * 1);
      }
      ctx.stroke();
    }

    /*
     * ---- PILE: a weight in a slot through the deck ------------------------
     *
     * Deck-plane structure, drawn with the machine and NOT rotating with the
     * barrel -- it is part of the floor, which is where its wave comes from.
     * It is also the countdown: the weight rides `world.pileT` up its rails
     * and drops, so the clock is on the machine rather than on the top of the
     * screen, where `Hud.pillCap` can legitimately return 0.
     */
    if (g.pile) {
      const P = CFG.pile;
      const every = P.every[Math.min(g.pile, P.every.length) - 1];
      // 0 just after a strike, 1 at the top of its travel. `pileT` counts
      // DOWN to the next one, so the weight is highest when the wait is
      // longest and drops as it runs out.
      const wind = clamp((world.pileT || 0) / every, 0, 1);
      const lift = CFG.rig.pile * (0.25 + wind * 0.75) * 0.34;
      const slotW = R * 0.34;
      const slotH = R * 0.5;
      // the slot itself, cut into the deck
      ctx.fillStyle = '#070d15';
      ctx.strokeStyle = rgba(accent, 0.34 * lit);
      ctx.lineWidth = CFG.hairline * 1.6;
      roundRectPath(ctx, -slotW / 2, -slotH * 0.9, slotW, slotH, 2);
      ctx.fill();
      ctx.stroke();
      // the rails it rides
      ctx.strokeStyle = rgba(accent, 0.22 * lit);
      ctx.lineWidth = CFG.hairline;
      ctx.beginPath();
      ctx.moveTo(-slotW / 2 + 2, -slotH * 0.9);
      ctx.lineTo(-slotW / 2 + 2, -slotH * 0.9 + slotH);
      ctx.moveTo(slotW / 2 - 2, -slotH * 0.9);
      ctx.lineTo(slotW / 2 - 2, -slotH * 0.9 + slotH);
      ctx.stroke();
      // ...and the weight in it, the only moving structure on the machine
      const wy = -slotH * 0.9 + slotH - 6 - lift;
      ctx.fillStyle = BODY;
      ctx.strokeStyle = rgba('#bfe6ff', (0.5 + wind * 0.4) * lit);
      ctx.lineWidth = CFG.hairline * 2;
      roundRectPath(ctx, -slotW * 0.34, wy - 5, slotW * 0.68, 6, 1.4);
      ctx.fill();
      ctx.stroke();
      // L2: the anvil under it, and buttresses. The machine goes bottom-heavy.
      if (g.pile >= 2) {
        ctx.fillStyle = '#0b1220';
        ctx.strokeStyle = rgba(accent, 0.5 * lit);
        ctx.lineWidth = CFG.hairline * 1.8;
        roundRectPath(ctx, -slotW * 0.46, -slotH * 0.9 + slotH - 4, slotW * 0.92, 5, 1);
        ctx.fill();
        ctx.stroke();
        for (const e of [-1, 1]) {
          ctx.strokeStyle = rgba(accent, 0.32 * lit);
          ctx.lineWidth = CFG.hairline * 2.2;
          ctx.beginPath();
          ctx.moveTo(e * slotW * 0.5, -slotH * 0.9 + slotH);
          ctx.lineTo(e * R * 0.66, R * 0.34);
          ctx.stroke();
        }
      }
      /*
       * L3: a ring inlaid flush in the deck at the radius the wave is born
       * at, which flares as the weight lands. Drawn additively inside the
       * same save/restore the machine already holds.
       */
      if (g.pile >= 3) {
        const flare = Math.max(0, 1 - (every - (world.pileT || 0)) / 0.35);
        ctx.strokeStyle = rgba('#bfe6ff', (0.16 + flare * 0.6) * lit);
        ctx.lineWidth = CFG.hairline * (1.6 + flare * 3);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.86, 0, TAU);
        ctx.stroke();
      }
    }

    // ---- the deck: the one part that is always there ----------------------
    ctx.fillStyle = BODY;
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = CFG.hairline * (2 + filled * 1.4);
    poly(6, R * 0.92, Math.PI / 6);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.26 + filled * 0.24);
    ctx.lineWidth = CFG.hairline;
    poly(6, R * 0.74, Math.PI / 6);
    ctx.stroke();
    // bolts at the corners: six small marks, and a drawn hexagon becomes a
    // machined one
    ctx.fillStyle = rgba(accent, 0.3 + filled * 0.4);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + Math.PI / 6;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83, 1.5, 0, TAU);
      ctx.fill();
    }

    // ---- INTAKE: louvres cut through the skirt ----------------------------
    if (g.intake) {
      for (let i = -1; i <= 1; i++) {
        const a = Math.PI / 2 + i * 0.44;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const x = c * R * 0.84;
        const y = sn * R * 0.84;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(4,9,15,0.99)';
        roundRectPath(ctx, -6, -5.5, 12, 11, 2);
        ctx.fill();
        ctx.strokeStyle = rgba('#7fe6c0', 0.75);
        ctx.lineWidth = CFG.hairline * 1.6;
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(-4.5, k * 3);
          ctx.lineTo(4.5, k * 3);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- ARRAY: a panel fin off the back, not a dish ----------------------
    for (let i = 0; i < g.aimrange; i++) {
      // Off the shoulders. Down is the back of the mount, and a fin drawn
      // there points straight at the control the thumb is on.
      const a = -Math.PI / 2 + (i ? 1 : -1) * 1.78;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const h = 18 + i * 8;
      ctx.save();
      ctx.translate(c * R * 0.8, sn * R * 0.8);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(12,26,40,0.99)';
      ctx.strokeStyle = rgba('#8fd8ff', 0.85 * lit);
      ctx.lineWidth = CFG.hairline * 1.8;
      // a blade: narrow at the mount, square at the tip
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(h, -6.5);
      ctx.lineTo(h, 6.5);
      ctx.lineTo(0, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // the elements on its face
      ctx.strokeStyle = rgba('#8fd8ff', 0.55 * lit);
      ctx.lineWidth = CFG.hairline * 1.2;
      ctx.beginPath();
      for (let k = 1; k < 4; k++) {
        ctx.moveTo(h * (k / 4), -5);
        ctx.lineTo(h * (k / 4), 5);
      }
      ctx.stroke();
      ctx.restore();
    }

    /*
     * ---- SIEVE: a screen across the array's mouth ----
     *
     * Seated on the fins rather than beside them, because what it does is done
     * to the array: it is the thing that decides what the sweep is allowed to
     * come back with. Drawn on both fins when both are there and on the mount
     * shoulder when neither is, so buying it before ARRAY still shows.
     */
    if (g.driftaim) {
      // A second screen behind the first at OPEN SIEVE: the mouth is wider,
      // not narrower, so the pair reads as something opening rather than
      // closing.
      const layers = g.driftaim;
      const seats = g.aimrange > 0 ? g.aimrange : 1;
      for (let i = 0; i < seats; i++) {
        const a = -Math.PI / 2 + (i ? 1 : -1) * 1.78;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const h = g.aimrange > i ? 18 + i * 8 : 10;
        ctx.save();
        ctx.translate(c * R * 0.8, sn * R * 0.8);
        ctx.rotate(a);
        for (let L = 0; L < layers; L++) {
          const x = h + 2.5 + L * 3.2;
          const span = 7.5 + L * 2.4;
          ctx.strokeStyle = rgba('#b8f0a0', (0.9 - L * 0.2) * lit);
          ctx.lineWidth = CFG.hairline * 1.6;
          ctx.beginPath();
          ctx.moveTo(x, -span);
          ctx.lineTo(x, span);
          ctx.stroke();
          ctx.lineWidth = CFG.hairline;
          ctx.strokeStyle = rgba('#b8f0a0', (0.6 - L * 0.15) * lit);
          ctx.beginPath();
          for (let k = -2; k <= 2; k++) {
            ctx.moveTo(x - 3, k * 3);
            ctx.lineTo(x, k * 3);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ======================= everything that turns =======================
    ctx.save();
    ctx.rotate(this.aim);
    const recoil = this.recoil * 6;

    // ---- FEED: the belt drum on the breech's flank ------------------------
    for (let i = 0; i < g.rate; i++) {
      const sy = i ? 1 : -1;
      const dx = R * 0.28 - recoil * 0.4;
      const dy = sy * (11 + i * 1.5);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillStyle = BODY;
      ctx.strokeStyle = rgba('#ffc07a', 0.85);
      ctx.lineWidth = CFG.hairline * 1.8;
      roundRectPath(ctx, -9, -7, 20, 14, 3);
      ctx.fill();
      ctx.stroke();
      // rounds in the belt, marching
      ctx.fillStyle = rgba('#ffc07a', 0.9);
      for (let k = 0; k < 4; k++) {
        const u = ((t * 1.6 + k * 0.25) % 1);
        ctx.fillRect(-7 + u * 15, -2.2, 2.4, 4.4);
      }
      ctx.restore();
      // the belt itself, curving into the breech
      ctx.strokeStyle = rgba('#ffc07a', 0.55);
      ctx.lineWidth = CFG.hairline * 2.2;
      ctx.beginPath();
      ctx.moveTo(dx + 10, dy);
      ctx.quadraticCurveTo(R * 0.5, dy * 0.5, R * 0.42 - recoil, 0);
      ctx.stroke();
    }

    // ---- the breech block -------------------------------------------------
    ctx.fillStyle = FACE;
    ctx.strokeStyle = rgba(accent, 0.8);
    ctx.lineWidth = CFG.hairline * 1.8;
    roundRectPath(ctx, -R * 0.1 - recoil * 0.4, -10, R * 0.62, 20, 3);
    ctx.fill();
    ctx.stroke();

    // ---- SHROUD: the mantlet. The biggest change to the outline -----------
    if (g.insulation) {
      const half = 0.5 + g.insulation * 0.26; // radians of shield either side
      const mr = R * (0.62 + g.insulation * 0.1);
      ctx.fillStyle = FACE;
      ctx.strokeStyle = rgba('#7fe6c0', 0.95 * lit);
      ctx.lineWidth = CFG.hairline * 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, mr, -half, half);
      ctx.arc(0, 0, mr - 8 - g.insulation * 1.5, half, -half, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // a lit lip along its outer edge, so the shield has a front
      ctx.strokeStyle = rgba('#c8fff0', 0.55 * lit);
      ctx.lineWidth = CFG.hairline * 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, mr - 1.5, -half * 0.94, half * 0.94);
      ctx.stroke();
      // ribs across the face of it
      ctx.strokeStyle = rgba('#7fe6c0', 0.4 * lit);
      ctx.lineWidth = CFG.hairline * 1.4;
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) {
        const a = (k / 2) * half * 0.9;
        ctx.moveTo(Math.cos(a) * (mr - 6), Math.sin(a) * (mr - 6));
        ctx.lineTo(Math.cos(a) * (mr - 1), Math.sin(a) * (mr - 1));
      }
      ctx.stroke();
    }

    // ---- the barrel -------------------------------------------------------
    // Longer with a heavier feed, and longer again once it is armoured: the
    // gun has to stay the biggest thing on the machine or the machine stops
    // reading as a gun.
    const bl = R * (1.24 + g.rate * 0.11 + g.casing * 0.08);
    ctx.fillStyle = 'rgba(18,34,52,0.99)';
    ctx.strokeStyle = rgba(accent, 0.95);
    ctx.lineWidth = 2;
    const bw = 6.5 + g.casing * 0.9;
    roundRectPath(ctx, R * 0.16 - recoil, -bw, bl, bw * 2, 4);
    ctx.fill();
    ctx.stroke();
    // the bore, as a line, and the heat at the muzzle end where it would be
    ctx.fillStyle = rgba('#ffffff', 0.1 + this.heat * 0.3);
    ctx.fillRect(R * 0.26 - recoil, -1.6, bl - R * 0.16, 3.2);
    if (this.heat > 0.02) {
      const gh = ctx.createLinearGradient(R * 0.3 - recoil, 0, R * 0.16 + bl - recoil, 0);
      gh.addColorStop(0, rgba('#ff9f5c', 0));
      gh.addColorStop(1, rgba('#ffd6a0', 0.45 * this.heat));
      ctx.fillStyle = gh;
      ctx.fillRect(R * 0.3 - recoil, -5, bl - R * 0.2, 10);
    }
    // cooling fins across the jacket
    ctx.strokeStyle = rgba(accent, 0.42);
    ctx.lineWidth = CFG.hairline * 1.6;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const x = R * 0.44 + (bl * 0.16) * k - recoil;
      ctx.moveTo(x, -bw + 0.5);
      ctx.lineTo(x, -2.6);
      ctx.moveTo(x, 2.6);
      ctx.lineTo(x, bw - 0.5);
    }
    ctx.stroke();
    // muzzle brake: ports at the tip, and a second pair once it is armoured
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.lineWidth = 1.5;
    for (const sy of [-1, 1]) {
      for (let k = 0; k < 1 + Math.min(1, g.casing); k++) {
        const x0 = R * 0.16 + bl - 12 - k * 9 - recoil;
        ctx.beginPath();
        ctx.moveTo(x0, sy * bw);
        ctx.lineTo(x0, sy * (bw + 3.5));
        ctx.lineTo(x0 + 6, sy * (bw + 3.5));
        ctx.lineTo(x0 + 6, sy * bw);
        ctx.stroke();
      }
    }

    if (this.recoil > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#ffe9b0', R * 0.16 + bl + 6 - recoil, 0, 24 * this.recoil, this.recoil);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // ---- the core port, recessed in the deck ------------------------------
    ctx.fillStyle = 'rgba(4,9,15,0.98)';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = CFG.hairline * 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.stroke();
    // three iris blades, turning against the bearing
    ctx.strokeStyle = rgba(accent, 0.6);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -this.spin * 0.7 + (i / 3) * TAU;
      ctx.arc(0, 0, 6.2, a, a + 0.7);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(this.heat > 0.35 ? '#ffd6a0' : accent, 0.55 + this.heat * 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, 3 + this.recoil * 1.6, 0, TAU);
    ctx.fill();

    /*
     * Breached, and only then, the machine is lit from outside. It is the one
     * piece of light this drawing has, because it is the one thing that is not
     * part of the machine: something has hold of it.
     */
    if (breached) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, accent, 0, 0, R * 3, 0.3 + 0.22 * Math.sin(t * 18));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  rig(world) {
    const taken = world.ledger;
    if (world.rig && world.rigAt === taken.length) return world.rig;
    const rig = { rate: 0, slew: 0, aimrange: 0, driftaim: 0, pile: 0, casing: 0, insulation: 0, intake: 0 };
    for (const id of taken) if (id in rig) rig[id]++;
    /*
     * ...and how much of the branch is on, as one number.
     *
     * Every part could be seen individually and there was nothing that said
     * FINISHED -- a fully rigged turret was a turret with a lot on it, which
     * at this scale reads as clutter rather than as an achievement. The
     * housing, the rings and the mount all lean on this: the machine closes
     * up and lights as the last sockets fill.
     */
    rig.filled = Object.values(rig).reduce((a, b) => a + b, 0) / RIG_MAX;
    world.rig = rig;
    world.rigAt = taken.length;
    return rig;
  }

  /**
   * The control: a rail, and a ball on it.
   *
   * There was a stem -- a shaft from the mount out to the grip, latterly an
   * articulated arm with a hinge in it. It was always the weakest thing on
   * screen: a long diagonal across the middle of the play area, drawn over
   * whatever was behind it, and it made the turret and the control look like
   * one bent object rather than a machine and the hand on it. Gone. The ball
   * runs the rail, the rail is the linkage, and the turret is left alone.
   */
  drawLever(ctx, accent, t) {
    const len = CFG.shooter.gripLen;
    const gx = this.gripX;
    const gy = this.gripY;
    const held = this.gripGlow;
    const gr = CFG.shooter.gripR;
    const clamp2 = CFG.shooter.aimClamp;
    const down = Math.PI / 2;
    const now = this.gripAngle;

    // ---- the rail: a track, hard stops, a centre notch, and the travel ----
    ctx.strokeStyle = rgba(accent, 0.09 + held * 0.12);
    ctx.lineWidth = CFG.hairline * 3.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, down - clamp2, down + clamp2);
    ctx.stroke();
    for (const e of [-1, 1]) {
      const a = down + e * clamp2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.strokeStyle = rgba(accent, 0.3 + held * 0.4);
      ctx.lineWidth = CFG.hairline * 2.2;
      ctx.beginPath();
      ctx.moveTo(this.x + c * (len - 9), this.y + sn * (len - 9));
      ctx.lineTo(this.x + c * (len + 9), this.y + sn * (len + 9));
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(accent, 0.2 + held * 0.28);
    ctx.lineWidth = CFG.hairline * 1.6;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + len - 6);
    ctx.lineTo(this.x, this.y + len + 6);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.3 + held * 0.5);
    ctx.lineWidth = CFG.hairline * 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, Math.min(down, now), Math.max(down, now));
    ctx.stroke();

    /*
     * SPIRAL closes the circle.
     *
     * The travel arc runs from straight-down to wherever the grip is, and the
     * grip cannot leave the lower hemisphere -- so this ring is a smile, every
     * frame of every run, except the three seconds SPIRAL owns the barrel and
     * takes it the whole way round. That is the one time the gimbal is ever
     * whole and it is worth seeing, so the upper half is drawn explicitly and
     * held for a beat after the last round rather than snapping shut with the
     * aim. `sweepFade` is 1 through the sweep and decays across CFG.spiral's
     * settle afterwards.
     */
    if (this.sweepFade > 0) {
      const f = this.sweepFade;
      ctx.strokeStyle = rgba('#ff7a1a', 0.42 * f);
      ctx.lineWidth = CFG.hairline * 3.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, len, down + clamp2, down - clamp2 + TAU);
      ctx.stroke();
      // The two ends where it meets the rail's own hard stops, so the closure
      // reads as the ring completing rather than as a second ring over it.
      for (const e of [-1, 1]) {
        const a2 = down + e * clamp2;
        ctx.strokeStyle = rgba('#ffd9a0', 0.5 * f);
        ctx.lineWidth = CFG.hairline * 2.4;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(a2) * (len - 7), this.y + Math.sin(a2) * (len - 7));
        ctx.lineTo(this.x + Math.cos(a2) * (len + 7), this.y + Math.sin(a2) * (len + 7));
        ctx.stroke();
      }
    }

    // ---- the ball ----------------------------------------------------------
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(this.gripAngle);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, gr * 2.2 + held * 28, 0.16 + held * 0.4);
    ctx.globalCompositeOperation = 'source-over';

    /*
     * A sphere rather than a disc: the body is dark, and a crescent of
     * lighter face is laid across the upper left of it. That single offset
     * arc is the whole difference between a ball and a circle.
     */
    ctx.fillStyle = 'rgba(9,18,29,0.97)';
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = rgba(accent, 0.09 + held * 0.08);
    ctx.beginPath();
    ctx.arc(-gr * 0.28, -gr * 0.3, gr * 0.92, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(accent, 0.8 + held * 0.2);
    ctx.lineWidth = CFG.hairline * 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.stroke();
    // the limb: a bright short arc on the lit side, which is what makes it
    // read as round rather than flat
    ctx.strokeStyle = rgba('#ffffff', 0.35 + held * 0.3);
    ctx.lineWidth = CFG.hairline * 2;
    ctx.beginPath();
    ctx.arc(0, 0, gr - 2.5, Math.PI * 1.05, Math.PI * 1.55);
    ctx.stroke();

    // knurling round the equator: what a thing meant to be gripped has
    ctx.strokeStyle = rgba(accent, 0.22 + held * 0.4);
    ctx.lineWidth = CFG.hairline * 1.5;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.moveTo(c * (gr - 5.5), sn * (gr - 5.5));
      ctx.lineTo(c * (gr - 1.5), sn * (gr - 1.5));
    }
    ctx.stroke();

    /*
     * ...and the rim is a gauge. The turret's cadence is a timer the player
     * has no other sight of -- the only way to know where in it you are is to
     * watch a round leave -- so it sweeps here, under the thumb, on the one
     * part of the machine that is being looked at while it fires.
     */
    const cyc = (t % CFG.shooter.gripFireInterval) / CFG.shooter.gripFireInterval;
    ctx.strokeStyle = rgba('#ffffff', (0.25 + held * 0.55) * (1 - cyc * 0.5));
    ctx.lineWidth = CFG.hairline * 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, gr - 3.2, -Math.PI / 2, -Math.PI / 2 + cyc * TAU);
    ctx.stroke();

    // hub, and the trigger state in the middle of it
    ctx.fillStyle = 'rgba(5,11,18,0.98)';
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.42, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5 + held * 0.4);
    ctx.lineWidth = CFG.hairline * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.42, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(accent, 0.25 + held * 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.24 + held * 2.5, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // a ring off the ball on every round it sends
    if (held > 0.02) {
      ctx.strokeStyle = rgba(accent, (1 - cyc) * held * 0.75);
      ctx.lineWidth = CFG.hairline * 1.6;
      ctx.beginPath();
      ctx.arc(gx, gy, gr + cyc * 20, 0, TAU);
      ctx.stroke();
    }
  }
}

/** roundRect() is Safari 16.4+, so the barrel builds its own path. */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Explosive round detonation, shared by every HE shot. */
function heBurst(world, x, y) {
  const b = CFG.rounds.explosive.blast;
  const r = b.r * world.up.blastR;
  applyBlast(world, { x, y, r, damage: b.damage * world.up.damage, impulse: b.impulse });
  // CLUSTER. Four smaller ones thrown out around the first, so HE stops being
  // a circle and becomes a patch of overlapping circles — the same total on
  // one body, and a great deal more across a line of them.
  if (world.up.cluster) {
    const c = CFG.rounds.explosive.cluster;
    for (let i = 0; i < c.n; i++) {
      const a = (i / c.n) * TAU + Math.PI / 4;
      const cx = x + Math.cos(a) * c.out;
      const cy = y + Math.sin(a) * c.out;
      applyBlast(world, {
        x: cx, y: cy,
        r: r * c.scale,
        damage: b.damage * c.scale * world.up.damage,
        impulse: b.impulse * c.scale,
      });
      /*
       * A sub-blast is drawn only where it CHANGES THE OUTLINE. `out` is a
       * fixed 78 units and is not scaled by OVERPRESSURE, so once the main
       * radius passes about 210 every sub-blast is entirely inside it: at
       * full upgrades the old version drew four small circles within one big
       * one -- a Venn diagram in line art, and four rings of drawing for no
       * shape at all. Stock, where CLUSTER genuinely makes a clover 252 units
       * across, it still gets its ring.
       */
      if (c.out + r * c.scale > r * 1.02) heFx(cx, cy, r * c.scale, true);
    }
  }
  heFx(x, y, r);
  shake(clamp(r * 0.045, 2.4, 7));
  audio.boom(0.7);
}

/**
 * The detonation, drawn.
 *
 * Separated from `heBurst` so the picture can be produced without applying a
 * blast -- which is what makes it possible to look at, and to assert, without
 * a field. See CFG.rounds.explosive.fx for what each part is for and what was
 * wrong with the one this replaces.
 *
 * Everything scales off `r`, the real blast radius, which runs from 96 units
 * stock to 263 fully bought -- 84% of the width of a 390px screen. The counts
 * scale with the square root of that rather than with the area, and are
 * capped: the particle pass is additive, and a screen-filling burst drawn at
 * full density does not read as bigger, it reads as white.
 */
export function heFx(x, y, r, light = false) {
  const F = CFG.rounds.explosive.fx;
  const R = CFG.rounds.explosive.blast.r;
  const size = Math.min(F.cap, Math.sqrt(r / R));
  const n = (base) => Math.max(3, Math.round(base * size * fx.quality));

  /*
   * The front: a closed circle drawn AT the damage radius, on the frame the
   * damage lands, and the brightest thing in the burst.
   *
   * It starts at `r` rather than expanding into it, and that is the whole
   * point. A ring fades and thins as it GROWS -- `drawFx` strokes it at
   * `alpha = t` and `width = w * t`, both running from full at spawn to
   * nothing at the end -- so a ring authored to expand into the blast radius
   * is at its dimmest and thinnest exactly where the damage was. The one it
   * replaces did that, and then overshot by another 40% on top. This one is
   * brightest on frame one, at the radius, and drifts out a tenth as it goes.
   *
   * Everything else is behind it. The damage was a circle and the picture
   * should not lie about that, however broken up the rest of it is.
   */
  ring(x, y, r, r * 1.1, F.front, '#fff0e2', 4.4);
  // ...and the core going off inside it: a filled glow that collapses. `fill`
  // has been an argument of `ring` since it was written and had no callers.
  ring(x, y, r * 0.44, r * 0.1, F.front * 1.5, '#ff8a4c', 1.6, 0.5);

  /*
   * ...and then it comes apart. Two to four arcs, each starting somewhere
   * nothing picks twice and covering somewhere between a third and two thirds
   * of a turn, expanding past the radius as they fade. This is the whole of
   * why two detonations do not look alike.
   */
  const arcs = light ? 1 : Math.round(rand(F.arcs[0], F.arcs[1]));
  for (let i = 0; i < arcs; i++) {
    const a0 = rand(0, TAU);
    const span = rand(F.arcSpan[0], F.arcSpan[1]);
    ring(x, y, r * rand(0.55, 0.8), r * rand(1.05, 1.35), F.tail * rand(0.7, 1),
      i % 2 ? '#ff5638' : '#ff8a4c', rand(1.6, 3.4), 0, a0, span);
  }

  /*
   * The debris, thrown along two or three lobes rather than evenly.
   *
   * An even ring of sparks is a radius drawn twice; lobes give the burst a
   * direction it did not have, and a different one each time. The scatter
   * inside a lobe is wide enough that the lobes read as weighting rather than
   * as spokes.
   */
  const lobes = [];
  const count = Math.round(rand(F.lobes[0], F.lobes[1]));
  for (let i = 0; i < count; i++) lobes.push(rand(0, TAU));
  const along = () => lobes[(Math.random() * lobes.length) | 0] + spread(F.lobeSpread);

  /*
   * Thrown far enough to CROSS the front ring, which is what makes a lobe a
   * direction rather than a smudge. `reach` is in multiples of the blast
   * radius over the particle's own life, so a spark that lives 0.3s and is
   * asked for 1.6r leaves at 1.6 * r / 0.3 units a second -- the drag in
   * updateFx then eats some of it, which is why the range tops out above 2.
   */
  const sparks = n(light ? F.sparks * 0.35 : F.sparks);
  for (let i = 0; i < sparks; i++) {
    // A fifth of them ignore the lobes, so the burst still has a floor of
    // roundness under the shape -- without it a two-lobe draw reads as a
    // cross rather than as an explosion.
    const a = i % 5 === 0 ? rand(0, TAU) : along();
    const life = rand(0.2, 0.46);
    const sp = (rand(F.throw[0], F.throw[1]) * r) / life;
    spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, i % 3 ? '#ffb066' : '#fff0e2',
      life, rand(1.8, 3.4));
  }
  // A sub-blast gets the front, one arc and a handful of sparks and nothing
  // else. Four of them at full treatment is a hundred particles a trigger pull
  // for a shape the main burst has already drawn.
  if (light) return;
  const shards = n(F.shards);
  for (let i = 0; i < shards; i++) {
    const a = along();
    const life = rand(0.45, 0.9);
    const sp = (rand(F.throw[0] * 0.7, F.throw[1] * 0.8) * r) / life;
    fxShard(x, y, Math.cos(a) * sp, Math.sin(a) * sp, '#ff7a3c',
      life, rand(2, 3.8), 3 + ((Math.random() * 2) | 0));
  }
  // ...and the tail: embers rising off it, which is the thing the old burst
  // had none of and the reason it was over in a sixth of a second.
  // ...and the embers are the tail, not the body of it: few, small, and left
  // rising after everything else has gone. Drawn at 2.6x their radius by the
  // glow sprite, so a 3 here is already a wide soft blob.
  const embers = n(F.embers);
  for (let i = 0; i < embers; i++) {
    fxEmber(x + spread(r * 0.6), y + spread(r * 0.6),
      spread(70), -rand(30, 110), '#ff9f5c', rand(0.5, 1.1), rand(1, 1.9));
  }
  ripple(x, y, clamp(r / R, 0.7, 2), r * 3);
}
