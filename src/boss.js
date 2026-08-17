// ORDINAL. It does not attack. It removes things from you — your sight, your
// aim, your rate of fire — and walks, without hurry, toward the turret. It is
// the last item in this room, and it is numbered.

import { CFG, ENEMY_TYPES } from './config.js';
import { TAU, clamp, rand, spread, pick, rgba, drawGlow, makeCanvas, smoothstep, segClosest } from './util.js';
import { spark, dot, shard as fxShard, ring, ripple, shake, flash, explode } from './fx.js';
import { Enemy } from './enemies.js';
import { audio } from './audio.js';

const SPRITE = 512;
const SHIELD_R = 22;

// What it spits out. Bulwarks are excluded: they are wall-clearing work, not
// pressure, and the boss fight already asks enough of the player's aim.
const EMITTABLE = ENEMY_TYPES.filter((t) => t.id !== 'bulwark');

const PALETTES = [
  { ring: '#ffd98a', spoke: '#fff3c4', iris: '#ffb347', core: '#fffaf0', halo: '#ff9f1c' },
  { ring: '#cbb8ff', spoke: '#efe6ff', iris: '#8b5cf6', core: '#f7f0ff', halo: '#7b2cbf' },
  { ring: '#ff9fb0', spoke: '#ffe1e6', iris: '#ff2d55', core: '#fff0f3', halo: '#ff2d6f' },
];

const POWERS = [
  {
    id: 'veil',
    label: 'VEIL · SIGHT WITHDRAWN',
    apply(world) { world.veil = Math.max(world.veil, 7.5); },
  },
  {
    id: 'invert',
    label: 'INVERT · AIM MIRRORED',
    apply(world) { world.invert = Math.max(world.invert, 8.5); },
  },
  {
    id: 'jam',
    label: 'JAM · FEED THROTTLED',
    apply(world) { world.jam = Math.max(world.jam, 8.5); },
  },
  {
    id: 'choir',
    label: 'CHOIR · SHIELDS RAISED',
    apply(world, boss) { boss.raiseChoir(); },
  },
  {
    id: 'recall',
    label: 'RECALL · EVERYTHING RETURNS',
    apply(world, boss) { boss.recall = Math.max(boss.recall, 6.5); },
  },
  {
    id: 'chrono',
    label: 'CHRONO · ROUNDS SLOWED',
    apply(world) { world.chrono = Math.max(world.chrono, 7); },
  },
];

export class Boss {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = CFG.boss.r;
    this.maxHp = CFG.boss.hp;
    this.hp = this.maxHp;
    this.vx = 0;
    this.vy = 0;
    this.dead = false;
    this.intro = 0;
    this.phase = 0;
    this.flash = 0;
    this.spin = 0;
    this.time = 0;
    this.pupil = 0;
    this.recall = 0;
    this.shields = [];
    this.powerTimer = 5.5;
    this.spawnTimer = CFG.boss.spawnInterval;
    this.lastPower = '';
    this.contactCooldown = 0;
    this.sprites = null;
    this.palette = PALETTES[0];
    this.buildSprites();

    // static as far as the object solver is concerned
    this.invMass = 0;
    this.mass = Infinity;
    this.restitution = 0.9;
    this.friction = 0.2;
    this.angle = 0;
    this.av = 0;
    this.cruise = 0;
  }

  get hpFrac() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get recallActive() {
    return this.recall > 0;
  }

  get hitColor() {
    return this.palette.core;
  }

  // ------------------------------------------------------------- appearance

  buildSprites() {
    const p = this.palette;
    this.sprites = {
      spokes: buildSpokes(p.spoke),
      ringOuter: buildTickRing(p.ring, 1.3, 72, 0.1, 6),
      ringMid: buildTickRing(p.ring, 1.06, 44, 0.07, 4),
      ringInner: buildGlyphRing(p.iris, 0.84),
      iris: buildIris(p.iris, p.core),
    };
  }

  // ----------------------------------------------------------------- combat

  hurt(world, dmg) {
    if (this.dead || this.intro < 1) return;
    this.hp -= dmg;
    this.flash = Math.min(1, this.flash + dmg / 900);
    this.pupil = Math.min(1, this.pupil + dmg / 2200);

    const nextPhase = this.hpFrac < 0.34 ? 2 : this.hpFrac < 0.67 ? 1 : 0;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.palette = PALETTES[this.phase];
      this.buildSprites();
      ring(this.x, this.y, this.r, this.r * 6, 0.7, this.palette.halo, 6);
      flash(0.4, this.palette.core);
      shake(16);
      ripple(this.x, this.y, 2.2, 900);
      audio.bossPower();
      world.alert(`ASPECT ${this.phase + 1} · ${['WATCHING', 'ADJUSTING', 'YIELDING'][this.phase]}`, 'power', 2.6);
      this.powerTimer = Math.min(this.powerTimer, 1.6);
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU);
        spark(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
          Math.cos(a) * rand(200, 700), Math.sin(a) * rand(200, 700), this.palette.ring, 0.5, 3);
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      world.onBossDead();
    }
  }

  push(nx, ny, amount) {
    this.vx += nx * amount;
    this.vy += ny * amount;
  }

  raiseChoir() {
    const n = 6;
    for (let i = 0; i < n; i++) {
      this.shields.push({
        a: (i / n) * TAU,
        dist: this.r * 1.95,
        hp: 300,
        maxHp: 300,
        life: 17,
        born: 0,
      });
    }
  }

  /** Nearest shield hit by the segment, or null. */
  castShields(ax, ay, bx, by, pr) {
    let best = null;
    let bestT = 2;
    const rr = SHIELD_R + pr;
    for (const s of this.shields) {
      if (s.hp <= 0) continue;
      const sx = this.x + Math.cos(s.a) * s.dist;
      const sy = this.y + Math.sin(s.a) * s.dist;
      const c = segClosest(ax, ay, bx, by, sx, sy);
      if (c.d2 <= rr * rr && c.t < bestT) { bestT = c.t; best = s; }
    }
    return best ? { t: bestT, shield: best } : null;
  }

  // ----------------------------------------------------------------- update

  update(world, dt) {
    if (this.dead) return;
    this.time += dt;
    this.spin += dt * 0.22;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.pupil = Math.max(0, this.pupil - dt * 0.7);
    this.recall = Math.max(0, this.recall - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);

    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 2.8);
      if (Math.random() < 0.6) {
        const a = rand(0, TAU);
        const rr = rand(this.r * 1.4, this.r * 3);
        spark(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr,
          -Math.cos(a) * 260, -Math.sin(a) * 260, this.palette.ring, 0.5, 2.4);
      }
      return;
    }

    // --- shields ---
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      s.born = Math.min(1, s.born + dt * 1.8);
      s.a += dt * 0.5;
      s.life -= dt;
      if (s.hp <= 0 || s.life <= 0) {
        const sx = this.x + Math.cos(s.a) * s.dist;
        const sy = this.y + Math.sin(s.a) * s.dist;
        for (let k = 0; k < 8; k++) {
          fxShard(sx, sy, spread(280), spread(280), this.palette.ring, 0.6, 6, 4);
        }
        ring(sx, sy, 4, 60, 0.25, this.palette.core, 2);
        audio.pop(0.7);
        this.shields.splice(i, 1);
      }
    }

    // --- movement: slow, inevitable, and genuinely pushable ---
    const s = world.shooter;
    let dx = s.x - this.x;
    let dy = s.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const drift = CFG.boss.approach * (1 + this.phase * 0.22);
    this.vx += (dx * drift - this.vx) * clamp(1.1 * dt, 0, 1);
    this.vy += (dy * drift - this.vy) * clamp(1.1 * dt, 0, 1);
    const damp = Math.exp(-1.15 * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const topLimit = world.wall.y + world.wall.thickness + this.r * 0.35;
    const bottomLimit = s.y - this.r - 40;
    this.x = clamp(this.x, this.r * 0.6, world.width - this.r * 0.6);
    if (this.y < topLimit) { this.y = topLimit; this.vy = Math.max(this.vy, 0); }
    if (this.y > bottomLimit) { this.y = bottomLimit; this.vy = Math.min(this.vy, 0); }

    // --- contact with the turret ---
    if (d < this.r + s.r + 4 && this.contactCooldown <= 0) {
      this.contactCooldown = 3.4;
      world.bossContact = CFG.boss.contactGlitch;
      this.vx -= dx * 240;
      this.vy -= dy * 240;
      shake(20);
      flash(0.5, this.palette.core);
      ring(s.x, s.y, 10, 420, 0.5, this.palette.halo, 5);
      audio.bossPower();
      audio.glitchOn();
      world.alert('CONTACT · FEED REWRITTEN', 'breach', 2.4);
    }

    // --- powers ---
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      const span = CFG.boss.powerInterval;
      this.powerTimer = (span[0] + (span[1] - span[0]) * (this.phase / 2)) * rand(0.85, 1.15);
      this.castPower(world);
    }

    // --- it keeps producing objects, because that is what it is for ---
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = CFG.boss.spawnInterval * rand(0.8, 1.2);
      this.emit(world);
    }
  }

  castPower(world) {
    const options = POWERS.filter((p) => p.id !== this.lastPower);
    const power = pick(options);
    this.lastPower = power.id;
    power.apply(world, this);
    world.alert(power.label, 'power', 3);
    ring(this.x, this.y, this.r * 0.6, this.r * 5, 0.6, this.palette.halo, 4);
    flash(0.22, this.palette.iris);
    shake(7);
    audio.bossPower();
  }

  emit(world) {
    if (world.enemies.length >= CFG.maxEnemies) return;
    const n = 2 + this.phase;
    for (let i = 0; i < n; i++) {
      const type = pick(EMITTABLE);
      const a = rand(Math.PI * 0.1, Math.PI * 0.9);
      const px = this.x + Math.cos(a) * this.r * 0.9;
      const py = this.y + Math.sin(a) * this.r * 0.9;
      const e = new Enemy(type, px, py, {
        vx: Math.cos(a) * rand(80, 190),
        vy: Math.sin(a) * rand(80, 190),
        spawnIn: 1,
      });
      world.enemies.push(e);
      ring(px, py, 2, 40, 0.3, this.palette.ring, 2);
    }
  }

  /** The long, loud way out. */
  detonate(world) {
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU);
      const rr = rand(0, this.r);
      explode(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, this.r * 0.5, this.palette.ring, this.palette.halo, 2);
    }
    for (let i = 0; i < 90; i++) {
      const a = rand(0, TAU);
      fxShard(this.x, this.y, Math.cos(a) * rand(120, 720), Math.sin(a) * rand(120, 720),
        this.palette.ring, rand(1, 2.4), rand(4, 18), 4);
    }
    ring(this.x, this.y, this.r, Math.hypot(world.width, world.height) * 1.4, 1.1, this.palette.core, 8);
    ring(this.x, this.y, this.r, this.r * 5, 0.6, '#ffffff', 4);
    ripple(this.x, this.y, 3, 1400);
    flash(1, '#ffffff');
    shake(26);
    audio.boom();
  }

  // ------------------------------------------------------------------- draw

  draw(ctx) {
    const p = this.palette;
    const intro = smoothstep(clamp(this.intro, 0, 1));
    const scale = 0.18 + intro * 0.82;
    const size = this.r * 3.4 * scale;
    const half = size / 2;
    const breathe = 1 + Math.sin(this.time * 1.1) * 0.02;

    ctx.save();
    ctx.translate(this.x, this.y);

    // halo
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, p.halo, 0, 0, this.r * 3.6 * scale, 0.4 + this.flash * 0.4 + Math.sin(this.time * 2) * 0.05);

    const layer = (img, rot, alpha, s = 1, ox = 0, oy = 0) => {
      ctx.save();
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      const hs = half * s * breathe;
      ctx.drawImage(img, ox - hs, oy - hs, hs * 2, hs * 2);
      ctx.restore();
    };

    const sp = this.sprites;
    layer(sp.spokes, this.spin * 0.6, 0.5 + 0.12 * Math.sin(this.time * 1.7), 1.06);
    // chromatic ghosting on the rings
    layer(sp.ringOuter, -this.spin * 1.5, 0.28, 1, -2.5, 0);
    layer(sp.ringOuter, -this.spin * 1.5, 0.28, 1, 2.5, 0);
    layer(sp.ringOuter, -this.spin * 1.5, 0.85);
    layer(sp.ringMid, this.spin * 2.4, 0.8);
    layer(sp.ringInner, -this.spin * 3.6, 0.85);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // body
    const bodyR = this.r * scale * breathe;
    const g = ctx.createRadialGradient(0, -bodyR * 0.2, bodyR * 0.05, 0, 0, bodyR);
    g.addColorStop(0, 'rgba(12,6,20,0.2)');
    g.addColorStop(0.7, 'rgba(6,3,12,0.86)');
    g.addColorStop(1, 'rgba(2,1,6,0.96)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    layer(sp.iris, this.spin * 1.1, 0.9, 1);

    // pupil: a hole that constricts as it is hurt
    ctx.globalCompositeOperation = 'source-over';
    const pupilR = bodyR * (0.3 - this.pupil * 0.1 + Math.sin(this.time * 0.9) * 0.02);
    ctx.fillStyle = '#02010a';
    ctx.beginPath();
    ctx.arc(0, 0, pupilR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(p.core, 0.95);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, pupilR, 0, TAU);
    ctx.stroke();
    drawGlow(ctx, p.core, 0, 0, pupilR * 1.3, 0.55 + this.flash);

    // wings
    ctx.strokeStyle = rgba(p.ring, 0.42);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + this.time * 0.15;
      const rr = bodyR * (1.55 + 0.14 * Math.sin(this.time * 2 + i));
      ctx.beginPath();
      ctx.arc(0, 0, rr, a - 0.34, a + 0.34);
      ctx.stroke();
    }

    if (this.flash > 0.01) {
      ctx.globalAlpha = clamp(this.flash, 0, 1) * 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, bodyR, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // shields
    for (const s of this.shields) {
      const sx = this.x + Math.cos(s.a) * s.dist;
      const sy = this.y + Math.sin(s.a) * s.dist;
      const hpf = clamp(s.hp / s.maxHp, 0, 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(s.a + Math.PI / 2 + this.time);
      ctx.scale(s.born, s.born);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, p.ring, 0, 0, 34, 0.35 * hpf);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(p.core, 0.5 + hpf * 0.5);
      ctx.fillStyle = rgba(p.iris, 0.2 * hpf);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - Math.PI / 2;
        const x = Math.cos(a) * SHIELD_R;
        const y = Math.sin(a) * SHIELD_R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // spiral of returning motes while RECALL is up
    if (this.recallActive && Math.random() < 0.5) {
      const a = rand(0, TAU);
      const rr = rand(this.r * 2, this.r * 5);
      dot(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, -Math.cos(a) * 200, -Math.sin(a) * 200, p.ring, 0.6, 2.4);
    }
  }
}

// ----------------------------------------------------------- sprite baking

function spriteCtx() {
  const c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  g.translate(SPRITE / 2, SPRITE / 2);
  return { c, g, R: SPRITE / 3.4 };
}

function buildSpokes(color) {
  const { c, g, R } = spriteCtx();
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const long = i % 4 === 0;
    const r0 = R * 0.92;
    const r1 = R * (long ? 1.52 : 1.24);
    const w = long ? 0.016 : 0.007;
    const grad = g.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    grad.addColorStop(0, rgba(color, 0.85));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
    g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.closePath();
    g.fill();
  }
  return c;
}

function buildTickRing(color, radius, ticks, tickLen, every) {
  const { c, g, R } = spriteCtx();
  const r = R * radius;
  g.strokeStyle = rgba(color, 0.4);
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();

  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU;
    const long = i % every === 0;
    const len = R * tickLen * (long ? 2 : 1);
    g.strokeStyle = rgba(color, long ? 0.95 : 0.5);
    g.lineWidth = long ? 3.2 : 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * (r - len / 2), Math.sin(a) * (r - len / 2));
    g.lineTo(Math.cos(a) * (r + len / 2), Math.sin(a) * (r + len / 2));
    g.stroke();
  }
  return c;
}

function buildGlyphRing(color, radius) {
  const { c, g, R } = spriteCtx();
  const r = R * radius;
  const n = 18;
  g.strokeStyle = rgba(color, 0.85);
  g.lineWidth = 2.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.save();
    g.rotate(a);
    g.translate(r, 0);
    g.rotate(Math.PI / 2);
    const s = R * 0.07;
    g.beginPath();
    switch (i % 4) {
      case 0: g.moveTo(-s, -s); g.lineTo(s, 0); g.lineTo(-s, s); break;
      case 1: g.arc(0, 0, s, 0.4, Math.PI - 0.4); break;
      case 2: g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s); break;
      default: g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s);
    }
    g.stroke();
    g.restore();
  }
  return c;
}

function buildIris(color, core) {
  const { c, g, R } = spriteCtx();
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r0 = R * (0.3 + Math.random() * 0.05);
    const r1 = R * (0.55 + Math.random() * 0.28);
    const grad = g.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    grad.addColorStop(0, rgba(core, 0.55));
    grad.addColorStop(1, rgba(color, 0));
    g.strokeStyle = grad;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  }
  g.strokeStyle = rgba(core, 0.5);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, R * 0.3, 0, TAU);
  g.stroke();
  return c;
}
