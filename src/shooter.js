// The turret. Stationary, immortal, and the only thing in the arena with
// infinite mass — everything else bounces off it.

import { CFG, HAIRLINE } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, angleDelta } from './util.js';
import { fire, clampAim } from './projectiles.js';
import { Patch } from './patch.js';
import { spark, ring, shake } from './fx.js';

/*
 * Every level of every part in the TURRET branch, added up: 2 FEED, 3 GIMBAL,
 * 2 ARRAY, 3 SIGHT, 3 SPINES, 3 SHROUD, 1 INTAKE. What `rig().filled` is a
 * fraction of, and the one number that tells the machine it is finished.
 */
const RIG_MAX = 17;
import { applyBlast } from './enemies.js';
import { audio } from './audio.js';

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
  canFire() {
    return this.cooldown <= 0;
  }

  /** One shot of whatever is loaded. Returns true if it actually went out. */
  shoot(world) {
    if (!this.canFire()) return false;
    const a = this.aim + spread(0.012);
    const slow = 1;
    const R = CFG.rounds;
    const up = world.up;

    // Every ammo upgrade lands here rather than inside each round, so a round
    // stays a description of what it does and the upgrades stay scalars.
    const shot = (angle, opts) => fire(world, this.muzzleX, this.muzzleY, angle, {
      ...opts,
      speed: (opts.speed || CFG.bolt.speed) * up.speed,
      damage: (opts.damage ?? CFG.bolt.damage) * up.damage
        * (world.autoSteering || world.autoFire ? up.overwatch : 1),
      impulse: (opts.impulse ?? CFG.bolt.impulse) * up.impulse,
      bounces: (opts.bounces ?? CFG.bolt.bounces) + up.bounces,
    });

    /*
     * SALVO: every Nth shot leaves as three. OVERDRAW: so does every shot,
     * for the next dozen of them.
     *
     * `fan` is a list of angle offsets and every branch below spreads its
     * round across it — except the shotgun, which built its own cone and
     * ignored `fan` entirely. That meant SALVO had never done anything at all
     * for SHOT, in any build. It does now: the branch multiplies its pellets
     * across the fan, so a tripled SHOT is fifteen pellets and not five.
     */
    this.salvoCount = (this.salvoCount || 0) + 1;
    const salvo = up.salvo && this.salvoCount % up.salvo === 0;
    const drawing = world.overdraw > 0;
    if (drawing) world.overdraw = Math.max(0, world.overdraw - 1);
    const spreadBy = CFG.boosts.overdraw.fan;
    const fan = salvo || drawing ? [-spreadBy, 0, spreadBy] : [0];

    if (world.round === 'shotgun') {
      const g = R.shotgun;
      // DOUBLE-O widens the count without widening the cone, so the extra
      // pellets fill it in rather than spreading it out. LONG SHOT moves the
      // cliff further away; it never removes it.
      const pellets = g.pellets + up.shotPellets;
      // Every pellet, once per fan offset — so a tripled SHOT is three cones
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
        color: '#9be7ff',
        core: '#ffffff',
        trail: 0.038,
        chain: true,
        jumps: R.arc.jumps + up.arcJumps,
      });
    } else if (world.round === 'spine') {
      const g = R.spine;
      for (const f of fan) shot(a + f, {
        speed: g.speed * slow,
        r: 3.4,
        damage: g.damage,
        impulse: 30,
        bounces: 0,
        color: '#d8f1ff',
        core: '#ffffff',
        trail: 0.05,
        pierce: g.pierce + up.pierce,
        pierceFade: up.spineFade || g.fade,
        shred: up.spineShred,
      });
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
        color: '#9be89b',
        core: '#e6ffe6',
        trail: 0.04,
        burst: (w, x, y) => {
          w.effects.push(new Patch(x, y, {
            r: g.patch.r * w.up.patchR,
            life: g.patch.life * w.up.patchLife,
            dps: g.patch.dps * w.up.patchDps,
            tone: '#9be89b',
          }));
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
      // the same whether it comes off a wall or off a body. DOUBLE TAP and
      // TRIPLE TAP hold their rounds at the muzzle rather than shortening the
      // cadence: one trigger pull with a stutter in it, not a faster gun.
      const taps = 1 + up.boltTap;
      for (const f of fan) {
        for (let t = 0; t < taps; t++) {
          shot(a + f + (t ? spread(0.02) : 0), {
            speed: CFG.bolt.speed * slow,
            damage: CFG.bolt.damage * g.tapFade ** t,
            life: CFG.bolt.life * up.boltLife,
            bounces: CFG.bolt.bounces + up.boltBounce,
            hold: t * g.tapGap,
            rebound: up.boltRebound,
            reboundFade: g.reboundFade,
          });
        }
      }
    }

    this.recoil = 1;
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

    // Aim ray. It reaches further while the lever is held, because that is
    // when you are aiming by feel rather than by pointing at a target.
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

    this.drawLever(ctx, accent, t);

    ctx.save();
    ctx.translate(this.x, this.y);

    /*
     * ======================== the machine =========================
     *
     * Drawn as a mount with sockets in it rather than as a shape. Every
     * fitting the TURRET branch sells has a place waiting for it here — a
     * collar lip for the SHROUD, notches in the rim for the SPINES, a track
     * for the GIMBAL rings, ports under the deck for the INTAKE, and rails on
     * the barrel for the FEED and the SIGHT. Empty, each is drawn as a faint
     * outline; filled, drawRigBase() and drawRigBarrel() put the part in it.
     *
     * So a bare turret does not look plain, it looks unfinished, and buying a
     * part is watching a socket get occupied. The two halves are designed
     * against each other on purpose: neither is the whole picture.
     */
    const g = this.rig(world);
    const socket = rgba('#3d5871', 0.55); // an empty mount, waiting

    // ---- legs: a tripod with feet, behind everything ----
    ctx.strokeStyle = rgba('#3d5871', 0.75);
    ctx.lineWidth = HAIRLINE * 2.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 0.25 + (i / 2) * Math.PI * 0.5;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(c * this.r * 0.66, sn * this.r * 0.66);
      ctx.lineTo(c * this.r * 1.9, sn * this.r * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c * this.r * 1.9 - sn * 5, sn * this.r * 1.9 + c * 5);
      ctx.lineTo(c * this.r * 1.9 + sn * 5, sn * this.r * 1.9 - c * 5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // ---- shield halo ----
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, this.r * 3.4, breached ? 0.45 + 0.25 * Math.sin(t * 18) : 0.2);
    ctx.globalCompositeOperation = 'source-over';

    // ---- SHROUD's lip: a collar rail round the base ----
    if (!g.insulation) {
      ctx.strokeStyle = socket;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 13, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- GIMBAL's track ----
    ctx.strokeStyle = rgba('#3d5871', g.slew ? 0.5 : 0.34);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 1.1, 0, TAU);
    ctx.stroke();

    // ---- ARRAY's stubs: two masts waiting for a dish ----
    if (g.aimrange < 2) {
      ctx.strokeStyle = socket;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      for (let i = g.aimrange; i < 2; i++) {
        const a = -Math.PI / 2 + (i ? 1 : -1) * 0.86;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.moveTo(c * this.r * 0.88, sn * this.r * 0.88);
        ctx.lineTo(c * (this.r * 0.88 + 9), sn * (this.r * 0.88 + 9));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- INTAKE's ports, under the deck ----
    if (!g.intake) {
      ctx.strokeStyle = socket;
      ctx.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) {
        const a = Math.PI / 2 + i * 0.42;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(c * this.r * 0.96 - sn * 3, sn * this.r * 0.96 + c * 3);
        ctx.lineTo(c * this.r * 0.96 + sn * 3, sn * this.r * 0.96 - c * 3);
        ctx.stroke();
      }
    }

    // ---- housing: an outer bevel and an inner deck ----
    const hex = (rr, turn) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + turn;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    const filled = g.filled || 0;
    ctx.fillStyle = 'rgba(8,16,26,0.96)';
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = HAIRLINE * (2 + filled * 1.6);
    hex(this.r, Math.PI / 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.3 + filled * 0.35);
    ctx.lineWidth = HAIRLINE;
    hex(this.r * 0.82, Math.PI / 8);
    ctx.stroke();
    /*
     * A bolt at every corner, and a deck plate between the two bevels that
     * fills in as the branch does. Eight small marks are what turn a drawn
     * octagon into a machined one, and they cost nothing at this size.
     */
    ctx.fillStyle = rgba(accent, 0.25 + filled * 0.45);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * this.r * 0.91, Math.sin(a) * this.r * 0.91, 1.5, 0, TAU);
      ctx.fill();
    }
    if (filled > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(accent, 0.1 + filled * 0.3);
      ctx.lineWidth = HAIRLINE * 5 * filled;
      hex(this.r * 0.91, Math.PI / 8);
      ctx.stroke();
      ctx.restore();
    }

    // ---- SPINES' sockets: notches cut into the rim ----
    if (!g.casing) {
      ctx.strokeStyle = socket;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.moveTo(c * this.r * 0.9, sn * this.r * 0.9);
        ctx.lineTo(c * this.r * 1.0, sn * this.r * 1.0);
      }
      ctx.stroke();
    }

    /*
     * ---- the two rings that were always there ----
     *
     * They CLOSE. Each is an arc of a turn and a third at nothing bought and a
     * whole turn when the branch is full, so a finished machine has a
     * continuous ring where an unfinished one has two broken ones -- and the
     * index marks that ride the outer one only appear once it has closed,
     * because a scale on a broken ring is not a scale.
     */
    ctx.strokeStyle = rgba(accent, 0.55 + filled * 0.3);
    ctx.lineWidth = 1.5 + filled * 0.8;
    const sweep = Math.PI * 1.35 + filled * (TAU - Math.PI * 1.35);
    for (let i = 0; i < 2; i++) {
      const rr = this.r * (0.62 + i * 0.24);
      const off = this.spin * (i ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, rr, off, off + sweep);
      ctx.stroke();
    }
    if (filled > 0.55) {
      const lit = (filled - 0.55) / 0.45;
      ctx.strokeStyle = rgba(accent, 0.5 * lit);
      ctx.lineWidth = HAIRLINE * 1.6;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = this.spin * -1 + (i / 12) * TAU;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const long = i % 3 === 0 ? 5 : 2.6;
        ctx.moveTo(c * this.r * 0.86, sn * this.r * 0.86);
        ctx.lineTo(c * (this.r * 0.86 + long), sn * (this.r * 0.86 + long));
      }
      ctx.stroke();
    }

    // everything the TURRET branch has bolted on, in the unrotated frame
    this.drawRigBase(ctx, world, accent, t);

    // ---- the barrel and what rides it ----
    ctx.rotate(this.aim);
    const recoil = this.recoil * 6;

    // breech block at the pivot end
    ctx.fillStyle = 'rgba(14,26,40,0.98)';
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.lineWidth = HAIRLINE * 1.6;
    roundRectPath(ctx, this.r * 0.02 - recoil * 0.4, -9, this.r * 0.42, 18, 3);
    ctx.fill();
    ctx.stroke();

    // rails the FEED and the SIGHT clamp to, drawn empty when nothing is on
    if (!g.rate || !g.overwatch) {
      ctx.strokeStyle = socket;
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 3.5]);
      ctx.beginPath();
      if (!g.overwatch) { ctx.moveTo(this.r * 0.5, -7.5); ctx.lineTo(this.r * 1.3, -7.5); }
      if (!g.rate) { ctx.moveTo(this.r * 0.5, 7.5); ctx.lineTo(this.r * 1.3, 7.5); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawRigBarrel(ctx, world, accent);

    // the barrel itself
    ctx.fillStyle = 'rgba(18,34,52,0.98)';
    ctx.strokeStyle = rgba(accent, 0.95);
    ctx.lineWidth = 2;
    roundRectPath(ctx, this.r * 0.2 - recoil, -6.5, this.r * 1.3, 13, 4);
    ctx.fill();
    ctx.stroke();
    /*
     * The bore, hot with use -- as a LINE down the middle rather than a bar
     * filling most of the barrel. At full heat the bar was a six-unit block of
     * white the width of the whole barrel, which is what made the turret's one
     * long straight edge the brightest thing on the machine and flattened
     * everything bolted to it.
     */
    ctx.fillStyle = rgba('#ffffff', 0.1 + this.heat * 0.34);
    ctx.fillRect(this.r * 0.3 - recoil, -1.6, this.r * 1.05, 3.2);
    // ...and the heat is at the muzzle end, where it would be.
    if (this.heat > 0.02) {
      const gh = ctx.createLinearGradient(this.r * 0.4 - recoil, 0, this.r * 1.4 - recoil, 0);
      gh.addColorStop(0, rgba('#ff9f5c', 0));
      gh.addColorStop(1, rgba('#ffd6a0', 0.5 * this.heat));
      ctx.fillStyle = gh;
      ctx.fillRect(this.r * 0.4 - recoil, -5, this.r * 1.0, 10);
    }
    /*
     * Cooling fins across the top of the jacket. Three marks, and the barrel
     * stops being a rounded rectangle with a line in it.
     */
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = HAIRLINE * 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = this.r * (0.52 + i * 0.2) - recoil;
      ctx.moveTo(x, -6);
      ctx.lineTo(x, -2.6);
      ctx.moveTo(x, 2.6);
      ctx.lineTo(x, 6);
    }
    ctx.stroke();
    // muzzle brake: two ports near the tip
    ctx.strokeStyle = rgba(accent, 0.8);
    ctx.lineWidth = 1.4;
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(this.r * 1.16 - recoil, sy * 6.5);
      ctx.lineTo(this.r * 1.16 - recoil, sy * 10);
      ctx.lineTo(this.r * 1.36 - recoil, sy * 10);
      ctx.lineTo(this.r * 1.36 - recoil, sy * 6.5);
      ctx.stroke();
    }

    if (this.recoil > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#ffe9b0', this.r * 1.5 - recoil, 0, 26 * this.recoil, this.recoil);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // ---- the core, recessed, with an iris over it ----
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(4,9,15,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, TAU);
    ctx.stroke();
    // three iris blades, turning slowly against the rings
    ctx.strokeStyle = rgba(accent, 0.6);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -this.spin * 0.7 + (i / 3) * TAU;
      ctx.arc(0, 0, 6, a, a + 0.7);
    }
    ctx.stroke();
    /*
     * The core glow is drawn last and over everything, so at 0.6 plus heat it
     * was a white disc across the middle of the machine and the iris, the
     * rings and the inner bevel were all underneath it. Held to a ceiling, and
     * with the heat going into its COLOUR rather than its brightness.
     */
    ctx.globalCompositeOperation = 'lighter';
    const lit = Math.min(0.72, 0.34 + 0.1 * Math.sin(t * 4) + this.heat * 0.28);
    drawGlow(ctx, this.heat > 0.35 ? '#ffd6a0' : accent, 0, 0, this.r * 0.66, lit);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2 + this.recoil * 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }


  /*
   * ============================ the rig ==============================
   *
   * Every node in the TURRET branch is a part on the machine, and its level is
   * how much of that part there is. Buying GIMBAL grows a gimbal; buying it
   * again grows another. The tree is named for the parts, so the row you press
   * and the thing that appears are the same word.
   *
   * Counted straight off the purchase ledger and cached against its length,
   * because the ledger only ever grows: no hook to forget to call on a buy, a
   * restore or a reset. `rigFlash` runs down after a purchase and every part
   * is drawn brighter and a little larger while it does, so the moment a part
   * goes on is visible without anything having to remember which part it was.
   */
  rig(world) {
    const taken = world.offers.taken;
    if (world.rig && world.rigAt === taken.length) return world.rig;
    const rig = { rate: 0, slew: 0, aimrange: 0, overwatch: 0, casing: 0, insulation: 0, intake: 0 };
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

  /** Parts that sit on the mount, drawn in the turret's own unrotated frame. */
  drawRigBase(ctx, world, accent, t) {
    const R = CFG.rig;
    const g = this.rig(world);
    const flash = world.rigFlash / R.flash; // 1 -> 0 across the fitting
    const lift = 1 + flash * 0.12;
    const glow = 0.55 + flash * 0.45;

    /*
     * The reach of the assist, drawn only while it is switched on: a hairline
     * arc across the cone at exactly the distance a target has to be inside.
     * Without it the base range is invisible — you would only ever meet it as
     * "auto aim ignored that one" — and ARRAY would be a number on a card
     * rather than a ring you watch move out.
     */
    if (world.autoAim) {
      const reach = CFG.shooter.aimRange * world.up.aimRange;
      const cone = CFG.shooter.aimClamp;
      ctx.strokeStyle = rgba(accent, 0.12 + flash * 0.3);
      ctx.lineWidth = HAIRLINE;
      ctx.setLineDash([HAIRLINE * 5, HAIRLINE * 11]);
      ctx.beginPath();
      ctx.arc(0, 0, reach, -Math.PI / 2 - cone, -Math.PI / 2 + cone);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /*
     * ARRAY — a dish on a mast per level, off the shoulders of the housing.
     * Everything else in the branch acts on what the turret does; this one is
     * how far it can see, so it is drawn as the thing that looks: a bowl, a
     * feed horn at its focus, and a sweep leaving the mouth.
     */
    for (let i = 0; i < g.aimrange; i++) {
      const a = -Math.PI / 2 + (i ? 1 : -1) * 0.86;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ap = (R.dish + i * 5) * lift;
      const foot = this.r * 0.88;
      const mast = foot + (10 + i * 4) * lift;
      const lit = 0.78 + flash * 0.22; // a fitting this small has to be bright
      ctx.strokeStyle = rgba('#8fd8ff', 0.9 * lit);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c * foot, sn * foot);
      ctx.lineTo(c * mast, sn * mast);
      ctx.stroke();

      ctx.save();
      ctx.translate(c * (mast + ap * 0.5), sn * (mast + ap * 0.5));
      ctx.rotate(a); // +x is now straight out of the mount: the mouth faces it
      const bowl = ap * 0.5;
      // the bowl, backed toward the mast and open outward
      ctx.beginPath();
      ctx.arc(0, 0, bowl, Math.PI - 1.5, Math.PI + 1.5);
      ctx.fillStyle = rgba('#8fd8ff', 0.2 * lit);
      ctx.fill();
      ctx.strokeStyle = rgba('#9fe4ff', lit);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // a rib inside it, and a lip at each edge, or it reads as a crescent
      ctx.strokeStyle = rgba('#9fe4ff', 0.45 * lit);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, bowl * 0.6, Math.PI - 1.4, Math.PI + 1.4);
      ctx.stroke();
      ctx.strokeStyle = rgba('#9fe4ff', 0.9 * lit);
      ctx.lineWidth = 1.6;
      for (const e of [-1.5, 1.5]) {
        const ex = Math.cos(Math.PI + e) * bowl;
        const ey = Math.sin(Math.PI + e) * bowl;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + bowl * 0.3, ey + Math.sign(e) * bowl * 0.16);
        ctx.stroke();
      }
      // feed horn at the focus, on a strut
      ctx.strokeStyle = rgba('#9fe4ff', 0.6 * lit);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-bowl * 0.9, 0);
      ctx.lineTo(bowl * 0.5, 0);
      ctx.stroke();
      ctx.fillStyle = rgba('#eaf8ff', lit);
      ctx.beginPath();
      ctx.arc(bowl * 0.5, 0, 2, 0, TAU);
      ctx.fill();
      // the sweep leaving the mouth
      const out = (t * 0.75 + i * 0.5) % 1;
      ctx.strokeStyle = rgba('#8fd8ff', 0.6 * (1 - out) * lit);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, bowl * 1.2 + out * 18, -0.8, 0.8);
      ctx.stroke();
      ctx.restore();
    }

    // GIMBAL — a further ring per level, each turning against the last.
    for (let i = 0; i < g.slew; i++) {
      const rr = this.r * (1.1 + i * R.ring) * lift;
      const off = this.spin * (i % 2 ? 1 : -1) * (1 + i * 0.3);
      ctx.strokeStyle = rgba(accent, (0.3 + 0.12 * i) * glow);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr, off, off + Math.PI * (1.1 - i * 0.18));
      ctx.stroke();
    }

    // SPINES — spikes out of the housing, more of them each level.
    if (g.casing) {
      const n = 4 + g.casing * 3;
      ctx.strokeStyle = rgba('#ff9f5c', (0.5 + 0.15 * g.casing) * glow);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + this.spin * 0.2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = R.spine * (0.7 + 0.3 * g.casing) * lift;
        ctx.moveTo(c * this.r * 0.94, sn * this.r * 0.94);
        ctx.lineTo(c * (this.r + len), sn * (this.r + len));
      }
      ctx.stroke();
    }

    // SHROUD — a collar round the base, wider with every level. It sits under
    // the barrel's arc, which is where the field actually comes from.
    if (g.insulation) {
      const sweep = Math.min(TAU, R.shroud * g.insulation);
      const rr = (this.r + 13) * lift;
      ctx.strokeStyle = rgba('#7cffb2', 0.42 * glow);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, rr, Math.PI / 2 - sweep / 2, Math.PI / 2 + sweep / 2);
      ctx.stroke();
      ctx.strokeStyle = rgba('#7cffb2', 0.7 * glow);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, rr + 3, Math.PI / 2 - sweep / 2, Math.PI / 2 + sweep / 2);
      ctx.stroke();
    }

    // INTAKE — scoops under the housing, drawing the floor in.
    if (g.intake) {
      ctx.strokeStyle = rgba('#9fe8ff', 0.75 * glow);
      ctx.fillStyle = rgba('#9fe8ff', 0.12 * glow);
      ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        const a = Math.PI / 2 + i * 0.42;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const inR = this.r * 0.92;
        const outR = (this.r + 8) * lift;
        const w = 4.5;
        ctx.beginPath();
        ctx.moveTo(c * inR - sn * w * 0.5, sn * inR + c * w * 0.5);
        ctx.lineTo(c * outR - sn * w, sn * outR + c * w);
        ctx.lineTo(c * outR + sn * w, sn * outR - c * w);
        ctx.lineTo(c * inR + sn * w * 0.5, sn * inR - c * w * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // and the pull itself, a slow ring inward
      const pull = (t * 0.6) % 1;
      ctx.strokeStyle = rgba('#9fe8ff', 0.3 * (1 - pull) * glow);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.r + 8 + (1 - pull) * 46, 0, TAU);
      ctx.stroke();
    }
  }

  /** Parts that ride the barrel, drawn after the frame is turned to the aim. */
  drawRigBarrel(ctx, world, accent) {
    const R = CFG.rig;
    const g = this.rig(world);
    const flash = world.rigFlash / R.flash;
    const glow = 0.6 + flash * 0.4;

    // FEED — a belt housing alongside the barrel, a second one at RUNAWAY.
    for (let i = 0; i < g.rate; i++) {
      const side = i ? 1 : -1;
      const y = side * (6.5 + R.feed * 0.5);
      ctx.fillStyle = rgba('#0d1a28', 0.95);
      ctx.strokeStyle = rgba(accent, 0.9 * glow);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.rect(this.r * 0.34, y - R.feed / 2, this.r * 0.78, R.feed);
      ctx.fill();
      ctx.stroke();
      // a lit rail along the outer edge, or the housing is a dark rectangle
      // outlined in a hairline and reads as nothing at all
      ctx.strokeStyle = rgba(accent, 0.55 * glow);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.r * 0.34, y + side * R.feed * 0.5);
      ctx.lineTo(this.r * 1.12, y + side * R.feed * 0.5);
      ctx.stroke();
      // rounds in the belt, marching toward the breech
      ctx.fillStyle = rgba('#ffe9b0', 0.55 * glow);
      const march = (world.time * 34) % 7;
      for (let k = 0; k < 5; k++) {
        const x = this.r * 0.36 + ((k * 7 + march) % (this.r * 0.74));
        ctx.fillRect(x, y - 1.2, 2.4, 2.4);
      }
    }

    // SIGHT — a mast over the barrel with a crossbar per level.
    if (g.overwatch) {
      const h = R.sight * g.overwatch;
      const x = this.r * 0.95;
      ctx.strokeStyle = rgba('#ffd166', 0.85 * glow);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x, -6.5);
      ctx.lineTo(x, -6.5 - h);
      ctx.stroke();
      for (let i = 0; i < g.overwatch; i++) {
        const y = -6.5 - h + i * (h / g.overwatch) + 2;
        const w = 5 - i;
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#ffd166', 0.9 * glow);
      ctx.beginPath();
      ctx.arc(x, -6.5 - h, 1.6, 0, TAU);
      ctx.fill();
    }
  }

  /**
   * The half of the rod that hangs below the pivot, plus the grip on its end
   * and the arc it travels. Drawn under the turret body so the rod reads as
   * passing through it.
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
    const swing = (now - down) / clamp2; // -1 .. 1 across the travel

    /*
     * The control column. It is the one thing on screen a thumb is actually
     * on, so it is built like a control rather than like a line with a knob:
     * a rail with hard stops at the ends, an ARTICULATED arm with a hinge in
     * the middle of it, and a grip that is also a gauge.
     *
     * The arm is the change that does the work. A straight rod from the mount
     * to the grip is the same picture at every angle -- it slides, it does not
     * operate. A two-segment arm with a knee bows as it swings, so pulling the
     * handle over visibly works a linkage, and the machine reads as something
     * that is being driven rather than dragged.
     */

    // ---- the rail: a solid track, hard stops, and the stretch travelled ----
    ctx.strokeStyle = rgba(accent, 0.1 + held * 0.14);
    ctx.lineWidth = HAIRLINE * 3.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, down - clamp2, down + clamp2);
    ctx.stroke();
    for (const e of [-1, 1]) {
      const a = down + e * clamp2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.strokeStyle = rgba(accent, 0.34 + held * 0.4);
      ctx.lineWidth = HAIRLINE * 2.2;
      ctx.beginPath();
      ctx.moveTo(this.x + c * (len - 9), this.y + sn * (len - 9));
      ctx.lineTo(this.x + c * (len + 9), this.y + sn * (len + 9));
      ctx.stroke();
    }
    // centre detent, drawn as a notch rather than another tick
    ctx.strokeStyle = rgba(accent, 0.24 + held * 0.3);
    ctx.lineWidth = HAIRLINE * 1.6;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + len - 6);
    ctx.lineTo(this.x, this.y + len + 6);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.3 + held * 0.55);
    ctx.lineWidth = HAIRLINE * 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, Math.min(down, now), Math.max(down, now));
    ctx.stroke();

    /*
     * ---- the arm ----
     *
     * The knee always bows the same way, so the linkage has a handedness and
     * the two segments never straighten into the rod this replaced. It opens
     * a little as the handle is pulled off centre, which is the geometry a
     * real bell crank has and reads as effort.
     */
    const ex = (this.x + gx) / 2;
    const ey = (this.y + gy) / 2;
    const bow = 11 + Math.abs(swing) * 7;
    const px = -(gy - this.y) / len;
    const py = (gx - this.x) / len;
    const kx = ex + px * bow;
    const ky = ey + py * bow;

    const limb = (ax, ay, bx, by) => {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(10,20,33,0.97)';
      ctx.lineWidth = HAIRLINE * 8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.28 + held * 0.3);
      ctx.lineWidth = HAIRLINE * 5.4;
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.5 + held * 0.5);
      ctx.lineWidth = HAIRLINE * 1.6;
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    limb(this.x, this.y, kx, ky);
    limb(kx, ky, gx, gy);

    // the knee: a hinge pin, so the join is a joint and not a kink
    ctx.fillStyle = 'rgba(7,15,25,0.98)';
    ctx.strokeStyle = rgba(accent, 0.6 + held * 0.4);
    ctx.lineWidth = HAIRLINE * 1.8;
    ctx.beginPath();
    ctx.arc(kx, ky, 5.2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(accent, 0.45 + held * 0.5);
    ctx.beginPath();
    ctx.arc(kx, ky, 1.7, 0, TAU);
    ctx.fill();

    // the yoke at the mount: a fork the first segment is pinned into
    const ya = Math.atan2(ky - this.y, kx - this.x);
    ctx.save();
    ctx.translate(this.x + Math.cos(ya) * 15, this.y + Math.sin(ya) * 15);
    ctx.rotate(ya);
    ctx.fillStyle = 'rgba(12,24,38,0.98)';
    ctx.strokeStyle = rgba(accent, 0.55 + held * 0.35);
    ctx.lineWidth = HAIRLINE * 1.6;
    roundRectPath(ctx, -6, -8.5, 12, 17, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.3 + held * 0.4);
    ctx.lineWidth = HAIRLINE * 1.4;
    ctx.beginPath();
    ctx.moveTo(-2.5, -8.5); ctx.lineTo(-2.5, 8.5);
    ctx.moveTo(2.5, -8.5); ctx.lineTo(2.5, 8.5);
    ctx.stroke();
    ctx.restore();

    // ---- the grip ----
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(this.gripAngle);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, gr * 2.4 + held * 30, 0.18 + held * 0.42);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(9,18,29,0.96)';
    ctx.strokeStyle = rgba(accent, 0.8 + held * 0.2);
    ctx.lineWidth = HAIRLINE * 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.fill();
    ctx.stroke();

    /*
     * Knurling, not spokes. Short radial marks round the rim are what a thing
     * meant to be gripped has; the four sliding arcs that were here instead
     * turned with the clock, which made the grip look like it was spinning
     * under the thumb holding it.
     */
    ctx.strokeStyle = rgba(accent, 0.22 + held * 0.4);
    ctx.lineWidth = HAIRLINE * 1.5;
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
    ctx.lineWidth = HAIRLINE * 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, gr - 3.2, -Math.PI / 2, -Math.PI / 2 + cyc * TAU);
    ctx.stroke();

    // thumb pad: a flat across the top of the rim, so the grip has an up
    ctx.fillStyle = rgba(accent, 0.14 + held * 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.82, -2.5, -0.64);
    ctx.arc(0, 0, gr * 0.46, -0.64, -2.5, true);
    ctx.closePath();
    ctx.fill();

    // hub, and the trigger state in the middle of it
    ctx.fillStyle = 'rgba(5,11,18,0.98)';
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.44, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5 + held * 0.4);
    ctx.lineWidth = HAIRLINE * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.44, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(accent, 0.25 + held * 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, gr * 0.26 + held * 2.5, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // a ring off the grip on every round it sends
    if (held > 0.02) {
      ctx.strokeStyle = rgba(accent, (1 - cyc) * held * 0.75);
      ctx.lineWidth = HAIRLINE * 1.6;
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
      ring(cx, cy, 3, r * c.scale * 1.3, 0.22, '#ff9f5c', 2.6);
    }
  }
  ring(x, y, 4, r * 1.4, 0.26, '#ffb347', 3.4);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU);
    spark(x, y, Math.cos(a) * rand(150, 460), Math.sin(a) * rand(150, 460), '#ffd166', rand(0.16, 0.36), 2.4);
  }
  shake(3);
  audio.pop(1.3);
}
