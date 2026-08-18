// Auto-laid mines, in two kinds. Both are lobbed onto a random patch of
// ground, both are inert for the whole flight — passing straight through
// anything in the way — and both only arm once they have settled. Harmless
// drift never sets either off.
//
// BLAST goes off: one hard bang, damage and knockback.
// SNARE does not. It opens, hauls everything near it into one pinned knot and
// holds it there. It deals no damage of its own; the damage is the objects
// grinding against each other, and whatever you put into a pile that cannot
// move.

import { CFG, HAIRLINE } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow } from './util.js';
import { applyBlast, ENTRY_Y } from './enemies.js';
import { spark, dot, ring, ripple, shake, flash } from './fx.js';
import { audio } from './audio.js';

const M = CFG.mines;
const S = CFG.snare;

/** Per-kind timings and geometry. */
const KIND = { blast: M, snare: S };

class Mine {
  constructor(kind, x0, y0, x1, y1) {
    const k = KIND[kind];
    this.kind = kind;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.x = x0;
    this.y = y0;
    this.r = k.r;
    this.t = 0; // flight progress, 0..1
    this.settle = 0; // seconds since landing
    this.life = k.life;
    this.dead = false;
    this.spin = rand(0, TAU);
    this.hold = 0; // snare only: seconds of grip left once it has opened
    this.open = 0; // snare only: eased 0 -> 1 as the field comes up
  }

  get cfg() {
    return KIND[this.kind];
  }

  get landed() {
    return this.t >= 1;
  }

  get armed() {
    return this.landed && this.settle >= this.cfg.arm && this.hold <= 0;
  }

  /** Snare only: currently holding a knot. */
  get gripping() {
    return this.hold > 0;
  }
}

/** Somewhere in the open field, clear of the top edge and of the turret itself. */
function landingSite(world) {
  const top = ENTRY_Y + 70;
  const bottom = world.shooter.y - 130;
  return {
    x: rand(60, world.width - 60),
    y: rand(top, Math.max(top + 80, bottom)),
  };
}

export function throwMine(world, kind = 'blast') {
  const s = world.shooter;
  const site = landingSite(world);
  world.mines.push(new Mine(kind, s.x, s.y - 20, site.x, site.y));
  audio.chime(kind === 'snare' ? 240 : 300);
}

/** How many of one kind are on the field. */
function countKind(world, kind) {
  let n = 0;
  for (const m of world.mines) if (m.kind === kind) n++;
  return n;
}

function detonate(world, m) {
  m.dead = true;
  applyBlast(world, { x: m.x, y: m.y, r: M.blast.r, damage: M.blast.damage, impulse: M.blast.impulse });
  ring(m.x, m.y, m.r, M.blast.r * 1.5, 0.4, '#ffb347', 5);
  ring(m.x, m.y, 0, M.blast.r * 0.7, 0.24, '#ffffff', 2);
  ripple(m.x, m.y, 1.4, M.blast.r * 4);
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU);
    spark(m.x, m.y, Math.cos(a) * rand(200, 620), Math.sin(a) * rand(200, 620), '#ffd166', rand(0.2, 0.5), 2.6);
  }
  flash(0.16, '#ffd9a0');
  shake(9);
  audio.boom();
}

/** A snare opening: it stops being a trigger and starts being a fist. */
function snap(world, m) {
  m.hold = S.hold;
  m.settle = 0;
  ring(m.x, m.y, S.reach, m.r * 2, 0.45, '#c77dff', 4);
  ripple(m.x, m.y, 1.1, S.reach * 3);
  shake(6);
  audio.ability('well');
}

/**
 * Drag everything in reach into the middle and pin it. Velocity-driven rather
 * than force-driven, the same way WELL works, so bodies converge instead of
 * slingshotting past each other — and they collide the whole way in, which is
 * where the damage comes from.
 */
function grip(world, m, dt) {
  const blend = clamp(11 * dt, 0, 1);
  const r2 = S.reach * S.reach;
  const take = (list) => {
    for (const e of list) {
      if (e.dead || e.staged) continue;
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      // ease off inside the knot so they pack instead of driving through
      const closing = S.pull * Math.min(1, d / 46);
      e.vx += ((dx / d) * closing - e.vx) * blend;
      e.vy += ((dy / d) * closing - e.vy) * blend;
    }
  };
  take(world.enemies);
  take(world.debris);

  if (Math.random() < 0.7) {
    const a = rand(0, TAU);
    const rr = rand(m.r * 2, S.reach);
    dot(m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr,
      -Math.cos(a) * 260, -Math.sin(a) * 260, '#c77dff', 0.35, 2.2);
  }
}

export function updateMines(world, dt) {
  const list = world.mines;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.spin += dt * (m.armed ? 2.4 : 0.8);
    m.open += ((m.gripping ? 1 : 0) - m.open) * clamp(dt * 7, 0, 1);

    if (!m.landed) {
      // Inert arc. No collision at all until it comes to rest.
      m.t = Math.min(1, m.t + dt / m.cfg.flight);
      const e = m.t;
      m.x = m.x0 + (m.x1 - m.x0) * e;
      m.y = m.y0 + (m.y1 - m.y0) * e - Math.sin(e * Math.PI) * 120;
      if (m.landed) {
        for (let k = 0; k < 8; k++) {
          spark(m.x, m.y, spread(120), spread(120), '#9fb3c8', 0.3, 1.6);
        }
        audio.thud();
      }
      continue;
    }

    m.settle += dt;
    m.life -= dt;

    if (m.gripping) {
      // Holding. It cannot be re-triggered and it does no damage itself.
      m.hold -= dt;
      grip(world, m, dt);
      if (m.hold <= 0) {
        m.dead = true;
        ring(m.x, m.y, m.r * 2, S.reach * 0.8, 0.3, '#8b5cf6', 2);
        for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(180), spread(180), '#c77dff', 0.4, 2);
        audio.pop(0.9);
      }
    } else if (m.life <= 0) {
      // Expired rather than triggered: fizzles out without a bang.
      m.dead = true;
      for (let k = 0; k < 6; k++) spark(m.x, m.y, spread(50), spread(50), '#6d829a', 0.5, 1.4);
    } else if (m.armed) {
      const reach = m.r + m.cfg.trigger;
      for (const e of world.enemies) {
        // Only things that could corrupt the feed can set a mine off.
        if (e.dead || e.harmless || e.staged) continue;
        const rr = reach + e.r;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= rr * rr) {
          if (m.kind === 'snare') snap(world, m); else detonate(world, m);
          break;
        }
      }
    }

    if (m.dead) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

export function drawMines(ctx, world) {
  for (const m of world.mines) {
    const flying = !m.landed;
    const armed = m.armed;
    const snare = m.kind === 'snare';
    // Two kinds, two colours, and the snare's is the same violet as WELL
    // because it does the same thing to a crowd.
    const accent = snare
      ? (m.gripping ? '#e0aaff' : armed ? '#c77dff' : '#8fa9c4')
      : (armed ? '#ff9f1c' : '#9fb3c8');

    // The grip, drawn first so held bodies sit on top of it.
    if (snare && m.open > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = S.reach * m.open;
      drawGlow(ctx, '#8b5cf6', m.x, m.y, rr * 0.9, 0.16 * m.open);
      ctx.strokeStyle = rgba('#c77dff', 0.5 * m.open);
      ctx.lineWidth = HAIRLINE * 1.6;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, TAU);
      ctx.stroke();
      // wires to whatever it has hold of
      ctx.strokeStyle = rgba('#e0aaff', 0.4 * m.open);
      ctx.lineWidth = HAIRLINE;
      ctx.beginPath();
      for (const e of world.enemies) {
        if (e.dead || e.staged) continue;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > S.reach * S.reach) continue;
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(m.x, m.y);

    if (armed) {
      // trigger radius, so you can read where it will catch something
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 4 + m.spin);
      ctx.strokeStyle = rgba(accent, 0.14 + pulse * 0.16);
      ctx.lineWidth = HAIRLINE;
      ctx.setLineDash([HAIRLINE * 4, HAIRLINE * 6]);
      ctx.beginPath();
      ctx.arc(0, 0, m.r + m.cfg.trigger, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, m.r * (flying ? 2.6 : 3.4), flying ? 0.3 : 0.24 + (armed ? 0.3 : 0));
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(m.spin);
    ctx.fillStyle = 'rgba(10,16,26,0.94)';
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = HAIRLINE * 1.6;

    if (snare) {
      // four jaws, splayed open once it has hold of something
      const spread2 = 0.34 + m.open * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.42, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.moveTo(Math.cos(a) * m.r * 0.42, Math.sin(a) * m.r * 0.42);
        ctx.lineTo(Math.cos(a) * m.r * 1.25, Math.sin(a) * m.r * 1.25);
        ctx.lineTo(Math.cos(a + spread2) * m.r * 1.7, Math.sin(a + spread2) * m.r * 1.7);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const x = Math.cos(a) * m.r;
        const y = Math.sin(a) * m.r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // spikes appear once it is live
      if (armed) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.5;
          ctx.moveTo(Math.cos(a) * m.r, Math.sin(a) * m.r);
          ctx.lineTo(Math.cos(a) * m.r * 1.5, Math.sin(a) * m.r * 1.5);
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = rgba(armed ? (snare ? '#e0aaff' : '#ff2d55') : '#59e0ff',
      flying ? 0.5 : 0.4 + 0.6 * Math.abs(Math.sin(world.time * 5)));
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Cadence for one of the two auto-lay toggles. Returns the next timer value.
 * Each kind keeps its own count and its own clock, so both can run at once.
 */
export function mineCadence(world, timer, dt, kind = 'blast') {
  const on = kind === 'snare' ? world.autoSnare : world.autoMine;
  const k = KIND[kind];
  if (!on || world.phase === 'ending' || world.phase === 'boot') return timer;
  const next = timer - dt;
  if (next > 0) return next;
  if (countKind(world, kind) < k.max) throwMine(world, kind);
  return k.interval * rand(0.85, 1.15);
}
