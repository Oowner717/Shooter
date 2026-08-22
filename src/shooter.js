// The turret. Stationary, immortal, and the only thing in the arena with
// infinite mass — everything else bounces off it.

import { CFG, HAIRLINE } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, angleDelta } from './util.js';
import { fire, clampAim } from './projectiles.js';
import { Patch } from './patch.js';
import { spark, ring, shake } from './fx.js';
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
    ctx.fillStyle = 'rgba(8,16,26,0.96)';
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = HAIRLINE * 2;
    hex(this.r, Math.PI / 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.lineWidth = HAIRLINE;
    hex(this.r * 0.82, Math.PI / 8);
    ctx.stroke();

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

    // ---- the two rings that were always there ----
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const rr = this.r * (0.62 + i * 0.24);
      const off = this.spin * (i ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, rr, off, off + Math.PI * 1.35);
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
    // bore, hot with use
    ctx.fillStyle = rgba('#ffffff', 0.14 + this.heat * 0.5);
    ctx.fillRect(this.r * 0.3 - recoil, -3, this.r * 1.05, 6);
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
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, this.r * 0.8, 0.6 + 0.2 * Math.sin(t * 4) + this.heat * 0.5);
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
    const rig = { rate: 0, slew: 0, overwatch: 0, casing: 0, insulation: 0, intake: 0 };
    for (const id of taken) if (id in rig) rig[id]++;
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
    const glow = this.gripGlow;
    const gr = CFG.shooter.gripR;
    const clamp2 = CFG.shooter.aimClamp;
    const held = glow;

    /*
     * The control column. It is the one thing on screen a thumb is actually
     * on, so it is built like a control: a detented travel arc that says where
     * the ends are, a shaft with a collar at the pivot, and a grip with finger
     * ridges rather than a disc with spokes. Everything on it answers to
     * `gripGlow`, which is how hard it is being held.
     */

    // travel arc, with detents at the ends and the middle
    ctx.strokeStyle = rgba(accent, 0.14 + held * 0.26);
    ctx.lineWidth = HAIRLINE * 1.4;
    ctx.setLineDash([HAIRLINE * 6, HAIRLINE * 8]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, Math.PI / 2 - clamp2, Math.PI / 2 + clamp2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = rgba(accent, 0.3 + held * 0.4);
    ctx.lineWidth = HAIRLINE * 1.6;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const a = Math.PI / 2 + (i / 2) * clamp2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const tick = i === 0 ? 7 : 5;
      ctx.moveTo(this.x + c * (len - tick), this.y + sn * (len - tick));
      ctx.lineTo(this.x + c * (len + tick), this.y + sn * (len + tick));
    }
    ctx.stroke();

    // the stretch of arc already travelled, lit, so the swing has a readout
    const now = Math.atan2(gy - this.y, gx - this.x);
    ctx.strokeStyle = rgba(accent, 0.28 + held * 0.5);
    ctx.lineWidth = HAIRLINE * 2.6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, Math.min(Math.PI / 2, now), Math.max(Math.PI / 2, now));
    ctx.stroke();

    // shaft: a dark rod with a lit spine down it, and a collar at the pivot
    ctx.strokeStyle = rgba('#22384e', 0.95);
    ctx.lineWidth = HAIRLINE * 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.45 + held * 0.55);
    ctx.lineWidth = HAIRLINE * 1.8;
    ctx.stroke();
    ctx.lineCap = 'butt';

    // pivot collar
    const ca = Math.atan2(gy - this.y, gx - this.x);
    ctx.save();
    ctx.translate(this.x + Math.cos(ca) * 16, this.y + Math.sin(ca) * 16);
    ctx.rotate(ca);
    ctx.fillStyle = 'rgba(12,24,38,0.98)';
    ctx.strokeStyle = rgba(accent, 0.6);
    ctx.lineWidth = HAIRLINE * 1.6;
    roundRectPath(ctx, -5, -7, 10, 14, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // grip
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(this.gripAngle);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, gr * 2.4 + held * 30, 0.2 + held * 0.45);
    ctx.globalCompositeOperation = 'source-over';

    // body
    ctx.fillStyle = 'rgba(9,18,29,0.96)';
    ctx.strokeStyle = rgba(accent, 0.8 + held * 0.2);
    ctx.lineWidth = HAIRLINE * 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // finger ridges: four arcs round the rim, offset, not spokes
    ctx.strokeStyle = rgba(accent, 0.3 + held * 0.45);
    ctx.lineWidth = HAIRLINE * 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + t * 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, gr * 0.78, a, a + 0.85);
      ctx.stroke();
    }

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
      const pulse = (t % CFG.shooter.gripFireInterval) / CFG.shooter.gripFireInterval;
      ctx.strokeStyle = rgba(accent, (1 - pulse) * held * 0.75);
      ctx.lineWidth = HAIRLINE * 1.6;
      ctx.beginPath();
      ctx.arc(gx, gy, gr + pulse * 20, 0, TAU);
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
