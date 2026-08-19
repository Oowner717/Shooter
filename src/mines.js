// Auto-laid mines, in four kinds. One kind is laid at a time. All four are
// lobbed onto a random patch of ground, all four are inert for the whole
// flight — passing straight through anything in the way — and none of them
// does anything until it has settled. Harmless drift never sets one off.
//
// BLAST goes off: one hard bang, damage and knockback, on contact.
// SNARE does not go off. It opens, hauls everything near it into one pinned
//   knot and holds it there. No damage of its own; the damage is the objects
//   grinding against each other, and whatever you put into a pile that cannot
//   move.
// WIRE is the only one that is not a point. It unspools a taut line to either
//   side of itself and cuts anything that crosses it, for as long as that
//   thing stays on the line. Nothing triggers it and nothing consumes it: it
//   is a lane closed until it expires.
// KNELL does not wait to be touched. It counts, and then it goes off three
//   times where it lies, each wider and weaker than the last. BLAST punishes
//   what walks into it; this denies the ground whether anything is there or
//   not.

import { CFG, HAIRLINE } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, segClosest } from './util.js';
import { applyBlast, ENTRY_Y } from './enemies.js';
import { spark, dot, ring, ripple, shake, flash } from './fx.js';
import { audio } from './audio.js';

const M = CFG.mines;
const S = CFG.snare;
const W = CFG.wire;
const K = CFG.knell;

/** Per-kind timings and geometry. Adding a kind is an entry here and a case. */
const KIND = { blast: M, snare: S, wire: W, knell: K };

/** What each kind shows on the field. */
const TONE = {
  blast: { live: '#ff9f1c', idle: '#9fb3c8', core: '#ff2d55' },
  snare: { live: '#c77dff', idle: '#8fa9c4', core: '#e0aaff' },
  wire: { live: '#7cffb2', idle: '#8fa9c4', core: '#c9ffe4' },
  knell: { live: '#ff5d8f', idle: '#9fb3c8', core: '#ffd6e2' },
};

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
    this.dead = false;
    this.spin = rand(0, TAU);
    this.hold = 0; // snare only: seconds of grip left once it has opened
    this.open = 0; // snare and wire: eased 0 -> 1 as it comes up
    // wire only: the two ends of the line, set when it lands
    this.ax = x1;
    this.ay = y1;
    this.bx = x1;
    this.by = y1;
    // knell only: tolls left, and the clock to the next one
    this.tolls = kind === 'knell' ? K.tolls : 0;
    this.tollTimer = 0;
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

  /** Wire only: the line is out and cutting. */
  get cutting() {
    return this.kind === 'wire' && this.landed && this.settle >= W.arm;
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

const LAY_TONE = { blast: 300, snare: 240, wire: 380, knell: 200 };

export function throwMine(world, kind = 'blast') {
  const s = world.shooter;
  const site = landingSite(world);
  const m = new Mine(kind, s.x, s.y - 20, site.x, site.y);
  if (kind === 'wire') {
    // The line is laid across the field, not along it, so it closes a lane
    // rather than sitting parallel to everything coming down. Kept inside the
    // arena even when the landing site is near an edge.
    const half = Math.min(W.span, world.width / 2 - 30);
    const cx = clamp(site.x, half + 24, world.width - half - 24);
    m.ax = cx - half;
    m.bx = cx + half;
    m.ay = site.y;
    m.by = site.y;
    // The spool has to land on the middle of its own line, not on the landing
    // site it was aimed at — clamping the line moved one and not the other.
    m.x1 = cx;
  }
  world.mines.push(m);
  audio.chime(LAY_TONE[kind] || 300);
}

/** How many of one kind are on the field. */
/**
 * Everything on the field, of any kind. Nothing expires now, so the ceiling
 * has to be field-wide: counting per kind would let a player switch round the
 * four and hold four caps at once.
 */
function laidCount(world) {
  let n = 0;
  for (const m of world.mines) if (!m.dead) n++;
  return n;
}

function detonate(world, m) {
  m.dead = true;
  const br = M.blast.r * world.up.mineBlast;
  applyBlast(world, { x: m.x, y: m.y, r: br, damage: M.blast.damage, impulse: M.blast.impulse });
  ring(m.x, m.y, m.r, br * 1.5, 0.4, '#ffb347', 5);
  ring(m.x, m.y, 0, br * 0.7, 0.24, '#ffffff', 2);
  ripple(m.x, m.y, 1.4, br * 4);
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

/**
 * WIRE. Everything touching the line is cut for as long as it stays on it, and
 * shoved off the way it was leaning — so a body crossing takes a slice rather
 * than being parked in the beam and ground to nothing.
 */
function cut(world, m, dt) {
  const reach = W.width * m.open;
  const take = (list) => {
    for (const e of list) {
      if (e.dead || e.harmless || e.staged) continue;
      const hit = segClosest(m.ax, m.ay, m.bx, m.by, e.x, e.y);
      const rr = reach + e.r;
      if (hit.d2 > rr * rr) continue;
      const d = Math.sqrt(hit.d2) || 1;
      const nx = (e.x - hit.px) / d;
      const ny = (e.y - hit.py) / d;
      e.applyDamage(world, W.damage * dt, nx, ny, W.shove * dt);
      if (Math.random() < 12 * dt) {
        spark(hit.px, hit.py, spread(180), spread(180), '#7cffb2', 0.24, 2);
      }
    }
  };
  take(world.enemies);
  take(world.debris);
}

/** KNELL. One of three, each wider than the one before and worth less. */
function toll(world, m) {
  const i = K.tolls - m.tolls;
  const r = K.blast.r * (1 + i * K.grow) * world.up.mineBlast;
  const damage = K.blast.damage * K.fade ** i;
  m.tolls--;
  m.tollTimer = K.gap;
  applyBlast(world, { x: m.x, y: m.y, r, damage, impulse: K.blast.impulse });
  ring(m.x, m.y, m.r, r * 1.4, 0.42, '#ff5d8f', 4);
  ripple(m.x, m.y, 1.1 + i * 0.3, r * 3);
  for (let k = 0; k < 14; k++) {
    const a = rand(0, TAU);
    spark(m.x, m.y, Math.cos(a) * rand(150, 480), Math.sin(a) * rand(150, 480), '#ffb3c8', rand(0.2, 0.45), 2.4);
  }
  flash(0.1 + i * 0.03, '#ffc8d8');
  shake(6 + i * 3);
  audio.boom();
  if (m.tolls <= 0) m.dead = true;
}

export function updateMines(world, dt) {
  const list = world.mines;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.spin += dt * (m.armed ? 2.4 : 0.8);
    if (m.kind === 'wire') {
      // Linear, so it is actually out after W.open seconds rather than easing
      // toward it forever.
      m.open = clamp(m.open + (m.cutting ? dt / W.open : -dt * 4), 0, 1);
    } else {
      m.open += ((m.gripping ? 1 : 0) - m.open) * clamp(dt * 7, 0, 1);
    }

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

    if (m.kind === 'wire') {
      // Nothing triggers it and nothing consumes it. It is a lane closed until
      // the field-wide cap pushes it off for something newer.
      if (m.cutting) cut(world, m, dt);
    } else if (m.kind === 'knell') {
      // It does not need anything to walk into it. Once armed it is a clock,
      // and it ends itself on the last of its three tolls.
      if (m.settle >= K.arm) {
        m.tollTimer -= dt;
        if (m.tollTimer <= 0) toll(world, m);
      }
    } else if (m.gripping) {
      // Holding. It cannot be re-triggered and it does no damage itself.
      m.hold -= dt;
      grip(world, m, dt);
      if (m.hold <= 0) {
        m.dead = true;
        ring(m.x, m.y, m.r * 2, S.reach * 0.8, 0.3, '#8b5cf6', 2);
        for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(180), spread(180), '#c77dff', 0.4, 2);
        audio.pop(0.9);
      }
    } else if (m.armed && m.cfg.trigger) {
      const reach = m.r + m.cfg.trigger * world.up.mineTrigger;
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
    const wire = m.kind === 'wire';
    const knell = m.kind === 'knell';
    const tone = TONE[m.kind];
    // The snare's violet is WELL's, because it does the same thing to a crowd.
    const live = snare ? m.gripping || armed : wire ? m.cutting : knell ? m.landed : armed;
    const accent = live ? (snare && m.gripping ? tone.core : tone.live) : tone.idle;

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

    // The line, drawn before the body so the anchor sits on top of it.
    if (wire && m.open > 0.01) {
      const t = m.open;
      const mx = (m.ax + m.bx) / 2;
      const ax = mx + (m.ax - mx) * t;
      const bx = mx + (m.bx - mx) * t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // A wide soft pass and a hard core, so it reads as taut rather than drawn
      for (const [w2, alpha] of [[W.width * 2, 0.1 * t], [W.width * 0.8, 0.32 * t], [HAIRLINE * 1.4, 0.95 * t]]) {
        ctx.strokeStyle = rgba('#7cffb2', alpha);
        ctx.lineWidth = w2;
        ctx.beginPath();
        ctx.moveTo(ax, m.ay);
        ctx.lineTo(bx, m.by);
        ctx.stroke();
      }
      // the two ends it is strung between
      for (const ex of [ax, bx]) {
        drawGlow(ctx, '#7cffb2', ex, m.ay, 14, 0.4 * t);
        ctx.strokeStyle = rgba('#c9ffe4', 0.9 * t);
        ctx.lineWidth = HAIRLINE * 1.6;
        ctx.beginPath();
        ctx.moveTo(ex, m.ay - 9);
        ctx.lineTo(ex, m.ay + 9);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(m.x, m.y);

    // The countdown to the next toll, drawn as an arc closing on the body.
    if (knell && m.landed && m.tolls > 0) {
      const frac = m.settle < K.arm
        ? clamp(m.settle / K.arm, 0, 1)
        : 1 - clamp(m.tollTimer / K.gap, 0, 1);
      ctx.strokeStyle = rgba('#ff5d8f', 0.75);
      ctx.lineWidth = HAIRLINE * 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 1.9, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.stroke();
      // one mark per toll it still owes
      ctx.fillStyle = rgba('#ffd6e2', 0.9);
      for (let k = 0; k < m.tolls; k++) {
        ctx.beginPath();
        ctx.arc(-6 + k * 6, -m.r * 2.9, 1.7, 0, TAU);
        ctx.fill();
      }
    }

    if (armed && m.cfg.trigger) {
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

    if (wire) {
      // a spool: a ring with the line running out of both sides of it
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-m.r * 1.5, 0);
      ctx.lineTo(m.r * 1.5, 0);
      ctx.stroke();
    } else if (knell) {
      // a bell: a body that rings rather than a shell that bursts
      ctx.beginPath();
      ctx.moveTo(-m.r, m.r * 0.75);
      ctx.quadraticCurveTo(-m.r * 0.95, -m.r * 0.9, 0, -m.r);
      ctx.quadraticCurveTo(m.r * 0.95, -m.r * 0.9, m.r, m.r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, m.r * 0.75, m.r * 0.26, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (snare) {
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

    ctx.fillStyle = rgba(live ? tone.core : '#59e0ff',
      flying ? 0.5 : 0.4 + 0.6 * Math.abs(Math.sin(world.time * 5)));
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Cadence for whichever kind is selected. One kind is laid at a time, so there
 * is one clock; switching kinds mid-run leaves whatever is already on the
 * field, since nothing expires: the cap is field-wide, so laying a new kind
 * pushes the old ones off one at a time rather than all at once.
 */
export function mineCadence(world, timer, dt) {
  const kind = world.mine;
  if (!kind || world.phase === 'ending' || world.phase === 'boot') return timer;
  const k = KIND[kind];
  const next = timer - dt;
  if (next > 0) return next;
  if (laidCount(world) < M.cap + world.up.mineMax) throwMine(world, kind);
  return k.interval * world.up.mineRate * rand(0.85, 1.15);
}
