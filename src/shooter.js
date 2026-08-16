// The turret. Stationary, immortal, and the only thing in the arena with
// infinite mass — everything else bounces off it.

import { CFG, HAIRLINE } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, angleDelta } from './util.js';
import { fire, clampAim } from './projectiles.js';
import { spark, shake } from './fx.js';
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

  update(world, dt) {
    if (!this.gripHeld) {
      // sprung lever: the rod settles back to neutral when you let go
      const d = angleDelta(this.gripAngle, Math.PI / 2);
      const step = CFG.shooter.gripReturn * dt;
      this.gripAngle += clamp(d, -step, step);
      if (world.gripDriven) this.targetAim = this.gripAngle - Math.PI;
    }
    this.gripGlow += ((this.gripHeld ? 1 : 0) - this.gripGlow) * clamp(dt * 12, 0, 1);

    const d = angleDelta(this.aim, this.targetAim);
    const step = CFG.shooter.turnRate * dt;
    this.aim += clamp(d, -step, step);
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

  /** One bolt. Returns true if it actually went out. */
  shoot(world) {
    if (!this.canFire(world)) return false;
    const a = this.aim + spread(0.012);
    fire(world, this.muzzleX, this.muzzleY, a, {
      speed: CFG.bolt.speed * (world.chrono > 0 ? 0.42 : 1),
    });
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
