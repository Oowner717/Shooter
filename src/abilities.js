// Five abilities. No costs, no upgrades, no unlocks — they exist purely
// because they are satisfying. Each one is legible from its first use.

import { TAU, clamp, rand, spread, rgba, drawGlow, segClosest } from './util.js';
import { spark, dot, ring, ripple, shake, flash } from './fx.js';
import { fire } from './projectiles.js';
import { applyBlast } from './enemies.js';
import { audio } from './audio.js';

const ICON = {
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="6" opacity=".7"/><circle cx="12" cy="12" r="9.6" opacity=".35"/></svg>',
  fan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 22V13"/><path d="M12 13 4 4"/><path d="M12 13 20 4"/><path d="M12 13 8.5 2.5"/><path d="M12 13 15.5 2.5"/></svg>',
  lance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 22V2"/><path d="M8.5 8 12 2l3.5 6"/><path d="M9.5 17h5" opacity=".6"/></svg>',
  well: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" opacity=".8"/><path d="M5 5l2.6 2.6M19 5l-2.6 2.6M5 19l2.6-2.6M19 19l-2.6-2.6" opacity=".5"/></svg>',
  stasis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2v20M3.4 7 20.6 17M20.6 7 3.4 17"/><circle cx="12" cy="12" r="3.2" fill="currentColor" fill-opacity=".2"/></svg>',
};

// ------------------------------------------------------------------ effects

class Beam {
  constructor(x0, y0, x1, y1, color) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.life = 0.42;
    this.max = 0.42;
    this.color = color;
    this.dead = false;
  }
  update(_world, dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = clamp(this.life / this.max, 0, 1);
    const w = 3 + t * 26;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(this.color, t * 0.35);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x0, this.y0);
    ctx.lineTo(this.x1, this.y1);
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', t);
    ctx.lineWidth = Math.max(0.6, t * 5);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }
}

class Well {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 2.7;
    this.max = 2.7;
    this.r = 0;
    this.dead = false;
    this.spin = 0;
  }

  update(world, dt) {
    this.life -= dt;
    this.spin += dt * 3.4;
    const t = 1 - this.life / this.max;
    this.r = 150 * Math.sin(clamp(t, 0, 1) * Math.PI) + 24;

    const pull = 2600;
    const grab = (list) => {
      for (const e of list) {
        if (e.dead) continue;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 320 || d < 1) continue;
        const f = (pull / Math.max(d, 40)) * dt;
        e.vx += (dx / d) * f;
        e.vy += (dy / d) * f;
        e.av += 0.6 * dt;
      }
    };
    grab(world.enemies);
    grab(world.debris);

    if (Math.random() < 0.7) {
      const a = rand(0, TAU);
      const rr = rand(120, 260);
      spark(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, -Math.cos(a) * 420, -Math.sin(a) * 420, '#c77dff', 0.3, 2);
    }

    if (this.life <= 0) {
      this.dead = true;
      applyBlast(world, { x: this.x, y: this.y, r: 190, damage: 90, impulse: 900 });
      ring(this.x, this.y, 10, 320, 0.4, '#e0aaff', 5);
      ring(this.x, this.y, 0, 160, 0.25, '#ffffff', 2);
      ripple(this.x, this.y, 1.8, 700);
      flash(0.3, '#e0c2ff');
      shake(11);
      audio.boom();
    }
  }

  draw(ctx, world) {
    const t = clamp(this.life / this.max, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#7b2cbf', 0, 0, this.r * 2.4, 0.45 * t);
    ctx.rotate(this.spin);
    ctx.strokeStyle = rgba('#e0aaff', 0.7 * t);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * (0.5 + i * 0.22), this.r * (0.16 + i * 0.1), i * 0.8 + world.time, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05010a';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, this.r * 0.2), 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', 0.8 * t);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.4, this.r * 0.22), 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

// -------------------------------------------------------------- definitions

/** Highest-value target ahead of the turret, for auto-aimed abilities. */
function bestTarget(world) {
  if (world.boss && !world.boss.dead) return world.boss;
  let best = null;
  let score = -1;
  for (const e of world.enemies) {
    if (e.dead || e.staged) continue;
    const s = e.r * 2 + e.hp * 0.3 - Math.hypot(e.x - world.shooter.x, e.y - world.shooter.y) * 0.14;
    if (s > score) { score = s; best = e; }
  }
  return best;
}

/** Centre of the densest knot of objects — where a singularity is worth it. */
function densestPoint(world) {
  const list = world.enemies.filter((e) => !e.dead && !e.staged);
  if (!list.length) {
    return { x: world.shooter.x, y: world.shooter.y - 240 };
  }
  let best = list[0];
  let bestCount = -1;
  for (const a of list) {
    let c = 0;
    for (const b of list) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < 150 * 150) c += 1 + b.r * 0.03;
    }
    if (c > bestCount) { bestCount = c; best = a; }
  }
  return { x: best.x, y: best.y };
}

export const ABILITIES = [
  {
    id: 'pulse',
    name: 'PULSE',
    color: '#59e0ff',
    cooldown: 7,
    icon: ICON.pulse,
    hint: 'PULSE — shockwave from the turret. Everything nearby gets shoved away.',
    run(world) {
      const s = world.shooter;
      applyBlast(world, { x: s.x, y: s.y, r: 340, damage: 58, impulse: 1050 });
      ring(s.x, s.y, 20, 360, 0.42, '#59e0ff', 6);
      ring(s.x, s.y, 10, 220, 0.28, '#ffffff', 2.4);
      ripple(s.x, s.y, 1.5, 800);
      shake(10);
      flash(0.18, '#bdf0ff');
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU);
        spark(s.x + Math.cos(a) * 30, s.y + Math.sin(a) * 30, Math.cos(a) * rand(300, 700), Math.sin(a) * rand(300, 700), '#9fe8ff', 0.4, 2.6);
      }
      audio.ability('pulse');
    },
  },
  {
    id: 'fan',
    name: 'FAN',
    color: '#7cffb2',
    cooldown: 5,
    icon: ICON.fan,
    hint: 'FAN — 22 pellets in a wide spray. Good for crowds.',
    run(world) {
      const s = world.shooter;
      for (let i = 0; i < 22; i++) {
        const a = s.aim + ((i / 21) - 0.5) * 1.5 + spread(0.03);
        fire(world, s.muzzleX, s.muzzleY, a, {
          speed: rand(900, 1240),
          r: 3,
          damage: 15,
          impulse: 34,
          life: 0.62,
          bounces: 0,
          color: '#7cffb2',
          trail: 0.03,
        });
      }
      s.recoil = 1;
      shake(4);
      audio.ability('fan');
    },
  },
  {
    id: 'lance',
    name: 'LANCE',
    color: '#ffd166',
    cooldown: 12,
    icon: ICON.lance,
    hint: 'LANCE — piercing beam. Locks onto the biggest thing on screen.',
    run(world) {
      const s = world.shooter;
      const target = bestTarget(world);
      const a = target ? Math.atan2(target.y - s.y, target.x - s.x) : s.aim;
      const len = Math.hypot(world.width, world.height) * 1.2;
      const x1 = s.x + Math.cos(a) * len;
      const y1 = s.y + Math.sin(a) * len;
      world.effects.push(new Beam(s.muzzleX, s.muzzleY, x1, y1, '#ffd166'));

      const hitList = (list) => {
        for (const e of list) {
          if (e.dead) continue;
          const c = segClosest(s.x, s.y, x1, y1, e.x, e.y);
          const rr = e.r + 26;
          if (c.d2 > rr * rr) continue;
          e.applyDamage(world, 190, Math.cos(a), Math.sin(a), 1500);
          spark(c.px, c.py, spread(300), spread(300), '#fff0c0', 0.3, 3);
        }
      };
      hitList(world.enemies);
      hitList(world.debris);

      if (world.boss && !world.boss.dead) {
        const c = segClosest(s.x, s.y, x1, y1, world.boss.x, world.boss.y);
        if (c.d2 < (world.boss.r + 26) ** 2) {
          world.boss.hurt(world, 900);
          world.boss.push(Math.cos(a), Math.sin(a), 46);
        }
      }
      if (world.wall.sealed) {
        const gx = world.wall.gateCx;
        const gy = world.wall.y + world.wall.thickness / 2;
        const c = segClosest(s.x, s.y, x1, y1, gx, gy);
        if (c.d2 < (world.wall.gateHalf + 20) ** 2) world.wall.damageGate(world, 700, c.px, c.py);
      }

      s.aim = a;
      s.targetAim = a;
      s.recoil = 1.6;
      shake(9);
      flash(0.14, '#fff3c4');
      audio.ability('lance');
    },
  },
  {
    id: 'well',
    name: 'WELL',
    color: '#c77dff',
    cooldown: 19,
    icon: ICON.well,
    hint: 'WELL — a singularity. Objects get dragged together and break each other.',
    run(world) {
      const p = densestPoint(world);
      world.effects.push(new Well(p.x, p.y));
      ring(p.x, p.y, 320, 30, 0.5, '#c77dff', 3);
      audio.ability('well');
    },
  },
  {
    id: 'stasis',
    name: 'STASIS',
    color: '#9fe8ff',
    cooldown: 21,
    icon: ICON.stasis,
    hint: 'STASIS — objects freeze for four seconds. Your shots do not.',
    run(world) {
      world.stasis = 4;
      for (const e of world.enemies) { e.vx *= 0.1; e.vy *= 0.1; e.av *= 0.1; }
      for (const e of world.debris) { e.vx *= 0.1; e.vy *= 0.1; e.av *= 0.1; }
      ring(world.shooter.x, world.shooter.y, 20, Math.hypot(world.width, world.height), 0.5, '#9fe8ff', 4);
      flash(0.2, '#d6f4ff');
      for (let i = 0; i < 22; i++) {
        dot(rand(0, world.width), rand(0, world.height), 0, 0, '#d6f4ff', rand(0.4, 1.2), rand(3, 9));
      }
      audio.ability('stasis');
    },
  },
];

// -------------------------------------------------------------- controller

export class Abilities {
  constructor() {
    this.slots = ABILITIES.map((def) => ({ def, cd: 0, used: false }));
  }

  reset() {
    for (const s of this.slots) { s.cd = 0; s.used = false; }
  }

  update(dt) {
    for (const s of this.slots) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
  }

  /** @returns the slot if it fired, otherwise null. */
  trigger(world, index) {
    const s = this.slots[index];
    if (!s || s.cd > 0) return null;
    s.def.run(world);
    s.cd = s.def.cooldown * (world.debug.noCooldown ? 0 : 1);
    const first = !s.used;
    s.used = true;
    return { slot: s, first };
  }

  readyFraction(i) {
    const s = this.slots[i];
    return s.cd <= 0 ? 1 : 1 - s.cd / s.def.cooldown;
  }
}
