// The wall and its gate. Everything in the arena came through this hole, and
// once the tally is met it closes and becomes the target.

import { CFG } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow } from './util.js';
import { spark, shard as fxShard, ring, ripple, shake, flash } from './fx.js';
import { audio } from './audio.js';

export class Wall {
  constructor() {
    this.y = 0;
    this.thickness = 26;
    this.gateCx = 0;
    this.gateHalf = 90;
    this.breachHalf = 0;
    this.width = 0;

    this.state = 'open'; // open | closing | sealed | broken
    this.closeT = 0;
    this.hp = CFG.gate.hp;
    this.maxHp = CFG.gate.hp;
    this.boxes = [];
    this.cracks = [];
    this.hotspots = [];
    this.shakeT = 0;
  }

  layout(width, y) {
    this.width = width;
    this.y = y;
    this.gateCx = width / 2;
    this.gateHalf = Math.min(96, width * 0.25);
    this.breachHalf = Math.min(width * 0.42, CFG.boss.r + 34);
    this.rebuildBoxes();
  }

  reset() {
    this.state = 'open';
    this.closeT = 0;
    this.hp = this.maxHp;
    this.cracks.length = 0;
    this.hotspots.length = 0;
    this.rebuildBoxes();
  }

  get sealed() {
    return this.state === 'sealed';
  }

  /** Half-width of the current opening (animates while the doors travel). */
  get openHalf() {
    if (this.state === 'open') return this.gateHalf;
    if (this.state === 'closing') return this.gateHalf * (1 - this.closeT);
    if (this.state === 'broken') return this.breachHalf;
    return 0;
  }

  rebuildBoxes() {
    const half = this.openHalf;
    const y0 = this.y;
    const y1 = this.y + this.thickness;
    this.boxes = [
      { x0: -40, x1: this.gateCx - half, y0, y1 },
      { x0: this.gateCx + half, x1: this.width + 40, y0, y1 },
    ];
    if (this.sealed) {
      this.boxes.push({ x0: this.gateCx - this.gateHalf, x1: this.gateCx + this.gateHalf, y0, y1, gate: true });
    }
  }

  seal(world) {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.closeT = 0;
    audio.chime(220);
    world.background.surge(1.4);
  }

  damageGate(world, dmg, x, y) {
    if (this.state !== 'sealed') return;
    if (!world.debug.toughGate) this.hp -= dmg;
    this.shakeT = 0.12;
    if (this.hotspots.length < 40) this.hotspots.push({ x, y, t: 0 });
    if (this.cracks.length < 26 && Math.random() < 0.22) {
      this.cracks.push({
        x, y,
        segs: Array.from({ length: 4 }, () => ({ a: rand(0, TAU), len: rand(8, 34) })),
      });
    }
    if (this.hp <= 0) this.breakOpen(world);
  }

  breakOpen(world) {
    this.hp = 0;
    // the wall tears wide enough for what is behind it
    this.state = 'broken';
    this.rebuildBoxes();
    audio.boom();
    flash(0.85, '#cfe9ff');
    shake(22);
    ripple(this.gateCx, this.y + this.thickness, 2.4, 900);
    for (let i = 0; i < 46; i++) {
      const x = this.gateCx + spread(this.breachHalf);
      const y = this.y + rand(0, this.thickness);
      fxShard(x, y, spread(420), rand(-160, 420), '#9fb3c8', rand(0.8, 1.8), rand(4, 15), 4);
      spark(x, y, spread(500), rand(-260, 500), '#9fe8ff', rand(0.3, 0.7), 3);
    }
    ring(this.gateCx, this.y + this.thickness, 20, 620, 0.7, '#9fe8ff', 6);
    world.onGateBroken();
  }

  update(world, dt) {
    this.shakeT = Math.max(0, this.shakeT - dt);
    for (let i = this.hotspots.length - 1; i >= 0; i--) {
      this.hotspots[i].t += dt;
      if (this.hotspots[i].t > 0.9) this.hotspots.splice(i, 1);
    }

    if (this.state === 'closing') {
      this.closeT += dt / CFG.gate.closeTime;
      // The wall segments grow inward as the doors travel; the solver ejects
      // anything caught in the doorway on the next substep.
      this.rebuildBoxes();
      if (this.closeT >= 1) {
        this.closeT = 1;
        this.state = 'sealed';
        this.rebuildBoxes();
        shake(8);
        audio.boom();
        world.onGateSealed();
      }
    }
  }

  draw(ctx, world) {
    const y0 = this.y;
    const th = this.thickness;
    const sx = this.shakeT > 0 ? spread(3) : 0;

    ctx.save();
    ctx.translate(sx, 0);

    // --- the wall proper ---
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + th);
    grad.addColorStop(0, '#2b3646');
    grad.addColorStop(0.4, '#151d29');
    grad.addColorStop(1, '#0a0f16');

    const half = this.openHalf;
    const segments = [
      [0, this.gateCx - half],
      [this.gateCx + half, this.width],
    ];
    for (const [x0, x1] of segments) {
      if (x1 <= x0) continue;
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, x1 - x0, th);
      // ribs
      ctx.strokeStyle = 'rgba(120,160,200,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / 22) * 22; x < x1; x += 22) {
        ctx.moveTo(x, y0 + 3);
        ctx.lineTo(x, y0 + th - 3);
      }
      ctx.stroke();
      // lit edge
      ctx.fillStyle = rgba(world.background.mood.accent, 0.5);
      ctx.fillRect(x0, y0 + th - 2, x1 - x0, 1.5);
    }

    // --- gate ---
    if (this.state === 'open' || this.state === 'closing') {
      this.drawOpening(ctx, world, half);
      this.drawDoors(ctx, half);
    } else if (this.sealed) {
      this.drawSealedGate(ctx);
    } else if (this.state === 'broken') {
      this.drawBreach(ctx, world);
    }

    ctx.restore();
  }

  drawOpening(ctx, world, half) {
    const y0 = this.y;
    const th = this.thickness;
    if (half <= 1) return;
    const accent = world.background.mood.accent;

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.gateCx - half, y0 - 4, half * 2, th + 8);
    ctx.clip();

    // the throat: dark, with depth lines running back into somewhere else
    ctx.fillStyle = '#010205';
    ctx.fillRect(this.gateCx - half, y0 - 4, half * 2, th + 8);
    ctx.strokeStyle = rgba(accent, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -4; i <= 4; i++) {
      const x = this.gateCx + (i / 4) * half;
      ctx.moveTo(x, y0 - 4);
      ctx.lineTo(this.gateCx + (i / 4) * half * 0.35, y0 + th + 4);
    }
    ctx.stroke();

    // light only at the lip, so it reads as an opening rather than a panel
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.16 + 0.07 * Math.sin(world.time * 2.2);
    drawGlow(ctx, accent, this.gateCx, y0 + th + 4, half * 1.3, pulse);
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.fillRect(this.gateCx - half, y0 + th - 1.5, half * 2, 1.5);
    ctx.restore();

    // jamb lights
    ctx.fillStyle = 'rgba(255,190,60,0.55)';
    for (let i = 0; i < 3; i++) {
      const y = y0 + 3 + ((world.time * 14 + i * 8) % (th - 6));
      ctx.fillRect(this.gateCx - half - 5, y, 4, 3);
      ctx.fillRect(this.gateCx + half + 1, y, 4, 3);
    }
  }

  drawDoors(ctx, half) {
    if (this.state !== 'closing') return;
    const y0 = this.y;
    const th = this.thickness;
    const doorW = this.gateHalf - half;
    if (doorW <= 0) return;
    ctx.fillStyle = '#3a4657';
    ctx.strokeStyle = 'rgba(255,190,60,0.8)';
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x = side < 0 ? this.gateCx - this.gateHalf : this.gateCx + half;
      ctx.fillRect(x, y0 - 2, doorW, th + 4);
      ctx.strokeRect(x, y0 - 2, doorW, th + 4);
    }
  }

  drawSealedGate(ctx) {
    const y0 = this.y;
    const th = this.thickness;
    const x0 = this.gateCx - this.gateHalf;
    const w = this.gateHalf * 2;
    const frac = clamp(this.hp / this.maxHp, 0, 1);

    const g = ctx.createLinearGradient(0, y0 - 3, 0, y0 + th + 3);
    g.addColorStop(0, '#4a5768');
    g.addColorStop(0.5, '#26303d');
    g.addColorStop(1, '#141b24');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0 - 3, w, th + 6);

    // seam + bolts
    ctx.strokeStyle = 'rgba(10,14,20,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.gateCx, y0 - 3);
    ctx.lineTo(this.gateCx, y0 + th + 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,205,230,0.35)';
    for (let i = 0; i < 6; i++) {
      const x = x0 + 8 + (i / 5) * (w - 16);
      ctx.fillRect(x - 1.5, y0 + 2, 3, 3);
      ctx.fillRect(x - 1.5, y0 + th - 5, 3, 3);
    }

    // stress glow rises as it fails
    ctx.globalCompositeOperation = 'lighter';
    const heat = 1 - frac;
    drawGlow(ctx, '#ff8a3c', this.gateCx, y0 + th / 2, w * 0.7, heat * 0.7);
    ctx.globalCompositeOperation = 'source-over';

    // cracks
    ctx.strokeStyle = rgba('#ffd9a0', 0.75);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const c of this.cracks) {
      for (const s of c.segs) {
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(s.a) * s.len, c.y + Math.sin(s.a) * s.len);
      }
    }
    ctx.stroke();

    // impact hotspots
    ctx.globalCompositeOperation = 'lighter';
    for (const h of this.hotspots) {
      const a = 1 - h.t / 0.9;
      drawGlow(ctx, '#ffd166', h.x, h.y, 16 * a + 4, a * 0.8);
    }
    ctx.globalCompositeOperation = 'source-over';

    // frame
    ctx.strokeStyle = 'rgba(255,190,60,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0 - 3, w, th + 6);
  }

  drawBreach(ctx, world) {
    const y0 = this.y;
    const th = this.thickness;
    const half = this.breachHalf;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.gateCx - half, y0 - 6, half * 2, th + 12);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y0 - 6, 0, y0 + th + 6);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.5, 'rgba(120,60,200,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(this.gateCx - half, y0 - 6, half * 2, th + 12);
    ctx.restore();

    // torn metal
    ctx.strokeStyle = 'rgba(150,175,205,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const bx = this.gateCx + side * half;
      ctx.moveTo(bx, y0);
      for (let i = 1; i <= 5; i++) {
        ctx.lineTo(bx - side * (i % 2 ? 7 : 0) - side * i * 1.5, y0 + (i / 5) * th);
      }
    }
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#b98cff', this.gateCx, y0 + th, half * 1.4, 0.28 + 0.12 * Math.sin(world.time * 3));
    ctx.globalCompositeOperation = 'source-over';
  }
}
