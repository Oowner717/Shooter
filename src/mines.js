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
import { Patch } from './patch.js';
import { fire } from './projectiles.js';
import { audio } from './audio.js';

const M = CFG.mines;
const S = CFG.snare;
const W = CFG.wire;
const K = CFG.knell;
const T = CFG.thorn;
const L = CFG.lode;
const P = CFG.spall;
const V = CFG.void;

/** Per-kind timings and geometry. Adding a kind is an entry here and a case. */
const KIND = { blast: M, snare: S, wire: W, knell: K, thorn: T, lode: L, spall: P, void: V };

/** What each kind shows on the field. */
const TONE = {
  blast: { live: '#ff9f1c', idle: '#9fb3c8', core: '#ff2d55' },
  snare: { live: '#c77dff', idle: '#8fa9c4', core: '#e0aaff' },
  wire: { live: '#7cffb2', idle: '#8fa9c4', core: '#c9ffe4' },
  knell: { live: '#ff5d8f', idle: '#9fb3c8', core: '#ffd6e2' },
  thorn: { live: '#9be89b', idle: '#8fa9c4', core: '#e6ffe6' },
  lode: { live: '#59e0ff', idle: '#8fa9c4', core: '#d6f6ff' },
  spall: { live: '#ffd166', idle: '#9fb3c8', core: '#fff0c8' },
  void: { live: '#b388ff', idle: '#8fa9c4', core: '#1a0f2e' },
};

class Mine {
  constructor(kind, x0, y0, x1, y1, world0) {
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
    this.armScale = 1; // QUICK ARM, set at the throw
    this.life = M.life;
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
    this.tolls = kind === 'knell' ? K.tolls + world0.up.mineTolls : 0;
    this.tollTimer = 0;
  }

  get cfg() {
    return KIND[this.kind];
  }

  get landed() {
    return this.t >= 1;
  }

  get armed() {
    return this.landed && this.settle >= this.cfg.arm * this.armScale && this.hold <= 0;
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
  // The ceiling is enforced here rather than at the clock, because a SEED
  // offer lays three at once and does not go through the clock at all. The
  // oldest goes, and it goes the way its kind goes — a blast mine bangs, a
  // spall throws, a void closes — so nothing simply evaporates.
  while (laidCount(world) >= M.cap) {
    const oldest = world.mines.find((x) => !x.dead);
    if (!oldest) break;
    retire(world, oldest);
    if (!oldest.dead) oldest.dead = true;
  }
  const m = new Mine(kind, s.x, s.y - 20, site.x, site.y, world);
  m.armScale = world.up.mineArm;
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
  applyBlast(world, { x: m.x, y: m.y, r: br, damage: M.blast.damage * world.up.mineDamage, impulse: M.blast.impulse });
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
  m.hold = S.hold * world.up.mineHold;
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
/**
 * A mine reaching the end of it — because its life ran out, or because a newer
 * one needed its place. It goes off the way its kind goes off, so being pushed
 * off the field is not the same as being wasted.
 */
function retire(world, m) {
  if (m.dead) return;
  if (!m.landed || m.settle < m.cfg.arm * m.armScale) { m.dead = true; return; }
  if (m.kind === 'blast') { detonate(world, m); return; }
  if (m.kind === 'spall') { spall(world, m); return; }
  if (m.kind === 'knell') { while (!m.dead && m.tolls > 0) toll(world, m); return; }
  if (m.kind === 'snare' && !m.gripping) { snap(world, m); return; }
  m.dead = true;
}

/** SALTED. A mine that simply ran out still leaves something behind. */
function fizzle(world, m) {
  m.dead = true;
  if (world.up.mineFizzle) {
    const f = M.fizzle;
    applyBlast(world, {
      x: m.x, y: m.y, r: f.r * world.up.mineBlast,
      damage: f.damage * world.up.mineDamage, impulse: f.impulse,
    });
    ring(m.x, m.y, m.r, f.r * 1.3, 0.32, '#ffb347', 3);
    for (let k = 0; k < 8; k++) spark(m.x, m.y, spread(180), spread(180), '#ffd9a0', 0.35, 1.8);
    audio.boom();
    return;
  }
  for (let k = 0; k < 6; k++) spark(m.x, m.y, spread(50), spread(50), '#6d829a', 0.5, 1.4);
}

/** SPALL. One fan, straight up the field, and the mine is spent. */
function spall(world, m) {
  m.dead = true;
  const base = -Math.PI / 2;
  const n = Math.round(P.pellets * world.up.spallPellets);
  for (let i = 0; i < n; i++) {
    const off = ((i / Math.max(1, n - 1)) - 0.5) * P.spread + spread(0.03);
    fire(world, m.x, m.y - 4, base + off, {
      speed: rand(P.speed[0], P.speed[1]),
      r: 3.4,
      damage: P.damage * world.up.mineDamage,
      impulse: 60,
      bounces: 0,
      life: 0.85,
      color: '#ffd9a0',
      trail: 0.03,
    });
  }
  ring(m.x, m.y, m.r, 150, 0.3, '#ffd166', 3);
  for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(200), spread(200) - 120, '#ffe9c0', 0.3, 2);
  shake(4);
  audio.boom();
}

/** VOID. Whatever walked into it is simply not there any more. */
function swallow(world, m, e) {
  m.dead = true;
  ring(m.x, m.y, e.r * 2.2, 6, 0.42, '#b388ff', 3);
  for (let k = 0; k < 16; k++) {
    const a = rand(0, TAU);
    spark(e.x, e.y, Math.cos(a) * rand(40, 260), Math.sin(a) * rand(40, 260), '#c9a7ff', rand(0.25, 0.5), 2.2);
  }
  // Destroyed, not dissolved: it counts, and it pays.
  e.applyDamage(world, e.hp + 1e6, 0, 0, 0);
  flash(0.12, '#d9c2ff');
  shake(6);
  audio.boom();
}

/** LODE. Everything in reach is being pushed away, every frame it is up. */
function repel(world, m, dt) {
  const reach = L.reach * world.up.lodeReach;
  const rr = reach * reach;
  for (const e of world.enemies) {
    if (e.dead || e.staged) continue;
    const dx = e.x - m.x;
    const dy = e.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr || d2 < 1) continue;
    const d = Math.sqrt(d2);
    // Hardest at the centre and nothing at all at the rim, so the edge of it
    // is somewhere a body can sit rather than a wall it bounces off.
    const f = (1 - d / reach) * L.push * world.up.lodePush * dt * e.invMass;
    e.vx += (dx / d) * f;
    e.vy += (dy / d) * f;
  }
}

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
      e.applyDamage(world, W.damage * world.up.wireDamage * dt, nx, ny, W.shove * dt);
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
  const i = (K.tolls + world.up.mineTolls) - m.tolls;
  const r = K.blast.r * (1 + i * K.grow) * world.up.mineBlast;
  const damage = K.blast.damage * K.fade ** i * world.up.mineDamage;
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
    m.life -= dt;

    if (m.kind === 'thorn') {
      // It is the patch: one is opened the moment it settles and kept in step
      // with the mine, so killing the mine takes the ground with it.
      if (!m.patch && m.settle >= T.arm) {
        m.patch = new Patch(m.x, m.y, {
          r: T.patch.r * world.up.patchR,
          life: m.life,
          dps: T.patch.dps * world.up.patchDps,
          tone: '#9be89b',
        });
        world.effects.push(m.patch);
      }
      if (m.life <= 0) {
        fizzle(world, m);
        if (m.patch) m.patch.dead = true;
      }
      continue;
    }

    if (m.kind === 'lode') {
      if (m.settle >= L.arm) repel(world, m, dt);
      if (m.life <= 0) fizzle(world, m);
      continue;
    }

    if (m.kind === 'wire') {
      // Nothing triggers it and nothing consumes it; it runs out its life.
      if (m.cutting) cut(world, m, dt);
      if (m.life <= 0) fizzle(world, m);
    } else if (m.kind === 'knell') {
      // It does not need anything to walk into it. Once armed it is a clock,
      // and it ends itself on the last of its tolls — the life is a backstop
      // behind that, for a knell that never finished settling.
      if (m.settle >= K.arm) {
        m.tollTimer -= dt;
        if (m.tollTimer <= 0) toll(world, m);
      }
      if (!m.dead && m.life <= 0) fizzle(world, m);
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
    } else if (m.life <= 0) {
      // Ran out rather than being triggered. Nothing to show for it, unless
      // SALTED has been taken.
      fizzle(world, m);
    } else if (m.armed && m.cfg.trigger) {
      const reach = m.r + m.cfg.trigger * world.up.mineTrigger;
      for (const e of world.enemies) {
        // Only things that could corrupt the feed can set a mine off.
        if (e.dead || e.harmless || e.staged) continue;
        const rr = reach + e.r;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= rr * rr) {
          if (m.kind === 'snare') snap(world, m);
          else if (m.kind === 'spall') spall(world, m);
          else if (m.kind === 'void') swallow(world, m, e);
          else detonate(world, m);
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
    const thorn = m.kind === 'thorn';
    const lode = m.kind === 'lode';
    const spallM = m.kind === 'spall';
    const voidM = m.kind === 'void';
    const live = snare ? m.gripping || armed
      : wire ? m.cutting
        : knell ? m.landed
          : thorn || lode ? m.landed && m.settle >= m.cfg.arm
            : armed;
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

    // LODE's reach. It has no trigger ring to borrow, and a push you cannot
    // see the edge of is a push you cannot use.
    if (lode && live) {
      const rr = L.reach * world.up.lodeReach;
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 2.2 + m.spin);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, '#59e0ff', m.x, m.y, rr * 0.8, 0.07 + pulse * 0.04);
      ctx.strokeStyle = rgba('#59e0ff', 0.2 + pulse * 0.16);
      ctx.lineWidth = HAIRLINE * 1.4;
      ctx.setLineDash([HAIRLINE * 3, HAIRLINE * 7]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      // a few marks running outward, so the direction is not a guess
      ctx.strokeStyle = rgba('#d6f6ff', 0.3 + pulse * 0.25);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + world.time * 0.5;
        const d0 = rr * (0.45 + 0.3 * pulse);
        ctx.moveTo(m.x + Math.cos(a) * d0, m.y + Math.sin(a) * d0);
        ctx.lineTo(m.x + Math.cos(a) * (d0 + 14), m.y + Math.sin(a) * (d0 + 14));
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
    } else if (thorn) {
      // a burr: a small core with spines out of it in every direction
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.45, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.moveTo(Math.cos(a) * m.r * 0.45, Math.sin(a) * m.r * 0.45);
        ctx.lineTo(Math.cos(a) * m.r * 1.5, Math.sin(a) * m.r * 1.5);
      }
      ctx.stroke();
    } else if (lode) {
      // two rings and a gap: something with a field around it
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.85, 0.5, Math.PI - 0.5);
      ctx.moveTo(Math.cos(Math.PI + 0.5) * m.r * 0.85, Math.sin(Math.PI + 0.5) * m.r * 0.85);
      ctx.arc(0, 0, m.r * 0.85, Math.PI + 0.5, TAU - 0.5);
      ctx.stroke();
    } else if (spallM) {
      // a wedge, facing the way it will throw
      ctx.beginPath();
      ctx.moveTo(-m.r, m.r * 0.5);
      ctx.lineTo(m.r, m.r * 0.5);
      ctx.lineTo(m.r * 0.5, -m.r * 0.9);
      ctx.lineTo(-m.r * 0.5, -m.r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * m.r * 0.45, -m.r * 0.9);
        ctx.lineTo(i * m.r * 0.7, -m.r * 1.7);
      }
      ctx.stroke();
    } else if (voidM) {
      // a hole: filled dark, ringed bright, with nothing inside it
      ctx.fillStyle = 'rgba(6,4,14,0.98)';
      ctx.beginPath();
      ctx.arc(0, 0, m.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 0.55, 0, TAU);
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
/**
 * One clock for every kind, fixed at CFG.mines.throwEvery, and no upgrade may
 * move it. What an upgrade may do is put more down per throw: PAIRED CHARGE
 * widens the salvo, which is the only way the cap is reachable by laying.
 */
export function mineCadence(world, timer, dt) {
  const kind = world.mine;
  if (!kind || world.phase === 'ending' || world.phase === 'boot') return timer;
  const next = timer - dt;
  if (next > 0) return next;
  const n = 1 + world.up.mineSalvo;
  for (let i = 0; i < n; i++) throwMine(world, kind);
  return M.throwEvery;
}
