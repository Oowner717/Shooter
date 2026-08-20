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

  canFire(world) {
    return this.cooldown <= 0 && world.lockout <= 0;
  }

  /** One shot of whatever is loaded. Returns true if it actually went out. */
  shoot(world) {
    if (!this.canFire(world)) return false;
    const a = this.aim + spread(0.012);
    const slow = world.chrono > 0 ? 0.42 : 1;
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
    if (world.jam > 0) this.cooldown = CFG.boss.jamInterval;
    audio.shot();
    shake(0.5);
    // ejected casing
    const side = this.aim + Math.PI / 2;
    spark(this.muzzleX, this.muzzleY, Math.cos(side) * rand(60, 140), Math.sin(side) * rand(60, 140) - 40, '#ffd9a0', 0.3, 1.6);
    return true;
  }

  draw(ctx, world) {
    const breached = world.attackers.size > 0;
    const bossHit = world.bossContact > 0;
    const t = world.time;
    const accent = bossHit ? '#ff2d55' : breached ? '#ff5d5d' : '#59e0ff';

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

    // anchor struts
    ctx.strokeStyle = rgba('#3d5871', 0.7);
    ctx.lineWidth = HAIRLINE * 2.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 0.25 + (i / 2) * Math.PI * 0.5;
      ctx.moveTo(Math.cos(a) * this.r * 0.7, Math.sin(a) * this.r * 0.7);
      ctx.lineTo(Math.cos(a) * this.r * 1.9, Math.sin(a) * this.r * 1.9);
    }
    ctx.stroke();

    // shield halo
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, this.r * 3.4, breached || bossHit ? 0.45 + 0.25 * Math.sin(t * 18) : 0.2);
    ctx.globalCompositeOperation = 'source-over';

    // base
    ctx.fillStyle = 'rgba(10,20,32,0.95)';
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.lineWidth = HAIRLINE * 1.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const x = Math.cos(a) * this.r;
      const y = Math.sin(a) * this.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // gimbal rings
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const rr = this.r * (0.62 + i * 0.24);
      const off = this.spin * (i ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, rr, off, off + Math.PI * 1.35);
      ctx.stroke();
    }

    // barrel
    ctx.rotate(this.aim);
    const recoil = this.recoil * 6;
    ctx.fillStyle = 'rgba(18,34,52,0.98)';
    ctx.strokeStyle = rgba(accent, 0.95);
    ctx.lineWidth = 2;
    roundRectPath(ctx, this.r * 0.2 - recoil, -6.5, this.r * 1.3, 13, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.14 + this.heat * 0.5);
    ctx.fillRect(this.r * 0.3 - recoil, -3, this.r * 1.05, 6);

    if (this.recoil > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#ffe9b0', this.r * 1.5 - recoil, 0, 26 * this.recoil, this.recoil);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // core
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, this.r * 0.9, 0.7 + 0.2 * Math.sin(t * 4));
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    this.drawInterference(ctx, world, t);
  }

  /**
   * What is being done to the gun, drawn on the gun. VEIL, CHRONO and the
   * corruption are all visible on their own; a throttled feed and a mirrored
   * aim are the two that would otherwise read as the controls being broken, so
   * they get a mark at the pivot instead of a caption over the boss.
   */
  drawInterference(ctx, world, t) {
    const jam = world.jam > 0;
    const inv = world.invert > 0;
    if (!jam && !inv) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 0.55 + 0.45 * Math.sin(t * 9);

    if (jam) {
      // a bar across the muzzle: the barrel is stopped, not the finger
      ctx.save();
      ctx.rotate(this.aim);
      ctx.strokeStyle = rgba('#ff4d6d', 0.55 + pulse * 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.r * 1.5, -11);
      ctx.lineTo(this.r * 1.5, 11);
      ctx.moveTo(this.r * 1.25, -8);
      ctx.lineTo(this.r * 1.75, 8);
      ctx.moveTo(this.r * 1.75, -8);
      ctx.lineTo(this.r * 1.25, 8);
      ctx.stroke();
      ctx.restore();
    }

    if (inv) {
      // two arrows pointing at each other around the pivot: the axis is flipped
      ctx.strokeStyle = rgba('#ffcf5c', 0.5 + pulse * 0.4);
      ctx.lineWidth = 2.2;
      const rr = this.r * 1.55;
      for (const dir of [-1, 1]) {
        const bx = dir * rr;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx - dir * 13, 0);
        ctx.moveTo(bx - dir * 13, 0);
        ctx.lineTo(bx - dir * 7, -5);
        ctx.moveTo(bx - dir * 13, 0);
        ctx.lineTo(bx - dir * 7, 5);
        ctx.stroke();
      }
    }
    ctx.restore();
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

    // travel arc — makes the control discoverable without being told
    ctx.strokeStyle = rgba(accent, 0.17 + glow * 0.3);
    ctx.lineWidth = HAIRLINE * 1.4;
    ctx.setLineDash([HAIRLINE * 6, HAIRLINE * 8]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, len, Math.PI / 2 - CFG.shooter.aimClamp, Math.PI / 2 + CFG.shooter.aimClamp);
    ctx.stroke();
    ctx.setLineDash([]);

    // rod
    ctx.strokeStyle = rgba('#4d6a86', 0.85);
    ctx.lineWidth = HAIRLINE * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.5 + glow * 0.5);
    ctx.lineWidth = HAIRLINE * 2;
    ctx.stroke();
    ctx.lineCap = 'butt';

    // grip
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(this.gripAngle);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, gr * 2.4 + glow * 30, 0.22 + glow * 0.45);
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(11,22,35,0.95)';
    ctx.strokeStyle = rgba(accent, 0.75 + glow * 0.25);
    ctx.lineWidth = HAIRLINE * 2;
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // knurling, and a firing pulse while held
    ctx.strokeStyle = rgba(accent, 0.35 + glow * 0.4);
    ctx.lineWidth = HAIRLINE * 1.3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.6;
      ctx.moveTo(Math.cos(a) * gr * 0.42, Math.sin(a) * gr * 0.42);
      ctx.lineTo(Math.cos(a) * gr * 0.74, Math.sin(a) * gr * 0.74);
    }
    ctx.stroke();
    ctx.restore();

    if (glow > 0.02) {
      const pulse = (t % CFG.shooter.gripFireInterval) / CFG.shooter.gripFireInterval;
      ctx.strokeStyle = rgba(accent, (1 - pulse) * glow * 0.75);
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
