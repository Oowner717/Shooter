// Particles, shockwaves, debris sparkle, screen shake and the ripple sources
// that the background grid reacts to. Pooled — nothing here allocates once
// the pools have warmed up.

import { CFG } from './config.js';
import { pref } from './settings.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, glowSprite } from './util.js';

/**
 * A blast's reach, after the punch has landed.
 *
 * It lived in abilities.js while PULSE was its only caller. Six things push
 * one now -- PULSE, PRISM, DECOY, WELL, and the BLAST and KNELL mines -- and
 * a mine reaching into the ability module for it read backwards, so it is
 * here, in the file whose own header says "particles, shockwaves, ...".
 *
 * fx's ring() fades linearly on BOTH width and alpha -- `lineWidth = w * t`
 * and `alpha = t * 0.95` -- so a ring asked to live a whole second spends
 * most of it at sub-pixel width and 0.1 alpha, which is to say invisible. Two
 * extra ring() calls were the first attempt at making PULSE persist and they
 * could not be seen at all four hundred milliseconds in.
 *
 * So this owns its envelope instead: it opens fast to the blast's real edge,
 * HOLDS there thin and steady, and only then goes. The point is that the
 * shove is over in a quarter second while the question the player has -- how
 * far did that actually reach -- is answered for a second afterwards.
 */
export class Shock {
  constructor(x, y, r, color) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.color = color;
    this.t = 0;
    this.open = 0.3; // seconds to reach full radius
    this.life = 1.15;
    this.dead = false;
  }

  update(_world, dt) {
    this.t += dt;
    if (this.t >= this.life) this.dead = true;
  }

  draw(ctx) {
    const k = clamp(this.t / this.open, 0, 1);
    // Ease out: fast at the front, settling onto the edge.
    const e = 1 - (1 - k) ** 3;
    const rr = this.r * e;
    // Full while opening, then a long steady hold, then away.
    const left = clamp((this.life - this.t) / 0.45, 0, 1);
    const a = Math.min(1, k * 3) * left;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /*
     * Dashed, and turning.
     *
     * The first version was a thin solid cyan circle, and it was drawing
     * correctly the whole time and could not be seen: the substrate is a
     * polar lattice of solid cyan arcs, so a solid cyan arc at radius 340 is
     * indistinguishable from the sky it is drawn on. A traced ring reads as
     * background; a measured one does not. The slow rotation is what stops it
     * looking like a dotted line somebody left there.
     */
    ctx.strokeStyle = rgba(this.color, 0.75 * a);
    ctx.lineWidth = 2.4 + (1 - k) * 5;
    ctx.setLineDash([16, 11]);
    ctx.lineDashOffset = -this.t * 40;
    ctx.beginPath();
    ctx.arc(this.x, this.y, rr, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // Four marks on the axes, which no polar lattice has.
    ctx.strokeStyle = rgba('#d8f6ff', 0.6 * a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      ctx.moveTo(this.x + cx * (rr - 7), this.y + cy * (rr - 7));
      ctx.lineTo(this.x + cx * (rr + 7), this.y + cy * (rr + 7));
    }
    ctx.stroke();
    // A leading edge while it is still travelling, so the opening reads as
    // something moving outward rather than a circle being resized.
    if (k < 1) {
      ctx.strokeStyle = rgba('#ffffff', 0.5 * (1 - k) * a);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const PARTICLE_FIELDS = {
  x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 2, drag: 1.2, grav: 0,
  color: '#fff', kind: 0, rot: 0, vr: 0, glow: 1, sides: 3, tx: 0, ty: 0,
};

// kind: 0 = glow dot, 1 = streak, 2 = shard, 3 = ember, 4 = drawn in
const KIND_DOT = 0;
const KIND_STREAK = 1;
const KIND_SHARD = 2;
const KIND_EMBER = 3;
const KIND_HAUL = 4;

class Pool {
  constructor(make) {
    this.make = make;
    this.active = [];
    this.free = [];
  }
  spawn() {
    const o = this.free.pop() || this.make();
    this.active.push(o);
    return o;
  }
  sweep() {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].life <= 0) {
        this.free.push(a[i]);
        a[i] = a[a.length - 1];
        a.pop();
      }
    }
  }
  clear() {
    for (const o of this.active) this.free.push(o);
    this.active.length = 0;
  }
}

export const fx = {
  particles: new Pool(() => ({ ...PARTICLE_FIELDS })),
  // `a0`/`span` are declared here rather than sprung into existence by the
  // one emitter that sets them: a recycled ring must never inherit the arc
  // of whatever used the slot before it, and every field is written on spawn.
  rings: new Pool(() => ({ x: 0, y: 0, r: 0, vr: 0, life: 0, max: 1, w: 3,
    color: '#fff', fill: 0, a0: 0, span: TAU })),
  ripples: [], // consumed by the background grid
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  flash: 0,
  flashColor: '#ffffff',
  quality: 1, // scaled down by the adaptive quality governor

  reset() {
    this.particles.clear();
    this.rings.clear();
    this.ripples.length = 0;
    this.shake = 0;
    this.flash = 0;
  },

  get budgetLeft() {
    return CFG.maxParticles * this.quality - this.particles.active.length;
  },
};

// ---------------------------------------------------------------- emitters

export function spark(x, y, vx, vy, color, life = 0.35, r = 2.2) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_STREAK;
  p.drag = 2.4; p.grav = 0; p.glow = 1;
  return p;
}

export function dot(x, y, vx, vy, color, life, r) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_DOT;
  p.drag = 1.6; p.grav = 0; p.glow = 1;
  return p;
}

export function shard(x, y, vx, vy, color, life, r, sides = 3) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_SHARD;
  p.drag = 0.7; p.grav = 26; p.rot = rand(0, TAU); p.vr = spread(9);
  p.sides = sides; p.glow = 0.5;
  return p;
}

export function ember(x, y, vx, vy, color, life, r) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_EMBER;
  p.drag = 0.9; p.grav = -14; p.glow = 1;
  return p;
}

/**
 * Energy being drawn into the turret. Unlike everything else here it does not
 * fly: it homes on a point and speeds up as it closes, because the read wanted
 * is "this is being taken in", and a particle that decelerates on arrival
 * reads as one that was thrown and ran out.
 */
export function haul(x, y, tx, ty, color = '#9fe8ff', life = 0.45, r = 2.6) {
  if (fx.budgetLeft <= 0) return null;
  const p = fx.particles.spawn();
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.tx = tx; p.ty = ty;
  p.life = p.max = life;
  p.r = r; p.color = color; p.kind = KIND_HAUL;
  p.drag = 0; p.grav = 0; p.glow = 1;
  return p;
}

/**
 * An expanding ring, or an arc of one.
 *
 * `a0`/`span` make it a segment rather than a circle, which is the whole of
 * how build 211's HE burst is different every time: a shockwave drawn as three
 * or four broken arcs at angles nobody chose twice has a silhouette, where a
 * circle has only a radius. `span` of TAU (the default) is the closed ring
 * every existing caller gets.
 */
export function ring(x, y, r0, r1, life, color, w = 3, fill = 0, a0 = 0, span = TAU) {
  const g = fx.rings.spawn();
  g.x = x; g.y = y; g.r = r0;
  g.vr = (r1 - r0) / life;
  g.life = g.max = life;
  g.color = color; g.w = w; g.fill = fill;
  g.a0 = a0; g.span = span;
  return g;
}

export function ripple(x, y, strength, radius) {
  // Bounded tightly: background.drawLattice walks this list once per ring
  // vertex, so it is the one place where a long list would actually cost.
  if (fx.ripples.length >= 12) fx.ripples.shift();
  fx.ripples.push({ x, y, t: 0, life: 1.5, strength, radius });
}

/**
 * Let the screen-level effects finish while the world is held. A pause that
 * freezes a white flash mid-decay looks like a broken frame rather than a
 * paused one, so these two keep running even when nothing moves.
 */
export function settleScreen(dt) {
  fx.shake = Math.max(0, fx.shake - fx.shake * 9 * dt - 6 * dt);
  fx.shakeX = spread(fx.shake);
  fx.shakeY = spread(fx.shake);
  fx.flash = Math.max(0, fx.flash - dt * 2.6);
}

export function shake(amount) {
  // Scaled by the player's preference. It is a phone, and two hours of a
  // screen that jumps every time something detonates is a real complaint --
  // one nobody should have to solve by turning the game off. See settings.js.
  fx.shake = Math.min(26, fx.shake + amount * pref('shake'));
}

export function flash(alpha, color = '#ffffff') {
  if (alpha > fx.flash) {
    fx.flash = alpha;
    fx.flashColor = color;
  }
}

// ------------------------------------------------------------ composites

/** Bolt impact against a body. */
/**
 * A round landing, per form.
 *
 * Every projectile in the game landed as the same hitBurst in a different
 * colour -- the rounds were given nine identities in flight in build 172 and
 * all nine still ARRIVED identically, which is the one-recipe disease at the
 * exact moment the player is being paid for a hit. Each form lands as what it
 * is now: ice chips, a crackle, a puncture, a concussion, a puff, a ledger
 * tick.
 *
 * The default -- BOLT and anything unnamed -- still goes through hitBurst
 * with its exact randomness, because ORDINAL's canonical hash is taken with
 * BOLT and the default path's draw count is load-bearing. Everything here
 * only ever runs for a named form, which the canonical fight never fires.
 */
export function impactFx(form, x, y, nx, ny, color) {
  switch (form) {
    // Up to forty-five of these land per salvo: one spark and out, which is
    // also a quarter of what the generic burst cost.
    case 'pellet':
      spark(x, y, nx * 160 + spread(60), ny * 160 + spread(60), color, 0.14, 1.8);
      break;
    // The blast is the show; the contact itself is one ember so the two
    // never compete.
    case 'shell':
      ember(x, y, spread(40), spread(40) - 30, color, 0.5, 2.6);
      break;
    // Discharge: jagged, perpendicular, brief.
    case 'arc': {
      const px = -ny;
      const py = nx;
      for (const side of [-1, 1]) {
        spark(x, y, px * side * rand(180, 320) + nx * 60,
          py * side * rand(180, 320) + ny * 60, color, 0.14, 1.7);
      }
      dot(x, y, 0, 0, '#ffffff', 0.1, 8);
      break;
    }
    // A puncture: one bright through-spark carrying on, no spray.
    case 'dart':
      spark(x, y, -nx * rand(260, 380), -ny * rand(260, 380), '#ffffff', 0.16, 2);
      dot(x, y, 0, 0, color, 0.08, 6);
      break;
    // Concussion: a ring and slow dust, nothing bright. Mass, arriving.
    case 'slab':
      ring(x, y, 3, 40, 0.28, color, 2.6);
      for (let i = 0; i < 3; i++) dot(x, y, spread(60), spread(60) - 20, color, rand(0.4, 0.7), rand(3, 5));
      break;
    // Ice: faceted chips with gravity, and a cold glint.
    case 'flake':
      for (let i = 0; i < 4; i++) {
        shard(x, y, nx * rand(40, 120) + spread(140), ny * rand(40, 120) + spread(140) - 60,
          '#bfefff', rand(0.4, 0.8), rand(2, 3.6), 6);
      }
      dot(x, y, 0, 0, '#ffffff', 0.09, 7);
      break;
    // A puff that rises: what the patch will be made of.
    case 'pod':
      for (let i = 0; i < 3; i++) {
        ember(x, y, spread(50), -rand(20, 70), color, rand(0.5, 0.9), rand(2, 3.4));
      }
      break;
    // The ledger tick: a small ring in the mark's own green.
    case 'tithe':
      ring(x, y, 2, 26, 0.24, color, 2);
      dot(x, y, 0, 0, color, 0.1, 6);
      break;
    default:
      hitBurst(x, y, nx, ny, color);
  }
}

/**
 * A death, flavoured by what caused it. The base explode() always runs --
 * this is the garnish on top, and only for a fresh, named killer: a body
 * that dies to BOLT, to an ability, or half a second after its last hit gets
 * the classic death it always had, which also keeps every kill in ORDINAL's
 * canonical fight off this path entirely.
 */
export function deathFx(form, x, y, r) {
  switch (form) {
    // Frozen through: the body comes apart as ice, not as fire.
    case 'flake':
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU);
        shard(x, y, Math.cos(a) * rand(80, 220), Math.sin(a) * rand(80, 220) - 40,
          '#bfefff', rand(0.5, 1), rand(2.4, Math.max(3, r * 0.22)), 6);
      }
      ring(x, y, 4, r * 2.2, 0.3, '#8fe3ff', 2);
      break;
    // Burned out: embers rise off the wreck.
    case 'shell':
      for (let i = 0; i < 5; i++) {
        ember(x, y, spread(80), -rand(20, 90), '#ff9f5c', rand(0.7, 1.4), rand(2, 4));
      }
      break;
    // Earthed: the charge leaves the body the way it arrived.
    case 'arc': {
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        spark(x, y, Math.cos(a) * rand(240, 420), Math.sin(a) * rand(240, 420),
          '#c79bff', 0.18, 2);
      }
      dot(x, y, 0, 0, '#ffffff', 0.12, r);
      break;
    }
    // Bisected: two big halves, perpendicular to nothing in particular --
    // the read is "cut", not "burst".
    case 'dart':
      for (const side of [-1, 1]) {
        shard(x, y, spread(60), side * rand(120, 200), '#ff9ade', rand(0.6, 1),
          Math.max(3, r * 0.3), 3);
      }
      break;
    // Crushed: slow, heavy, and the ground answers.
    case 'slab':
      for (let i = 0; i < 4; i++) {
        dot(x, y, spread(70), spread(70), '#b8c6d8', rand(0.5, 0.9), rand(3, 6));
      }
      ripple(x, y, 1.2, r * 6);
      break;
    // Gone to spores.
    case 'pod':
      for (let i = 0; i < 5; i++) {
        ember(x, y, spread(60), -rand(20, 80), '#8eeb4b', rand(0.7, 1.3), rand(2, 3.6));
      }
      break;
    // Paid in full: the double ring is the receipt.
    case 'tithe':
      ring(x, y, 4, r * 2.6, 0.34, '#40e693', 2.6);
      ring(x, y, 2, r * 1.6, 0.26, '#dfffe9', 1.6);
      break;
    default:
      break;
  }
}

export function hitBurst(x, y, nx, ny, color) {
  const n = (5 * fx.quality) | 0;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ny, nx) + spread(1.1);
    const s = rand(90, 300);
    spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.12, 0.3), rand(1.4, 2.6));
  }
  dot(x, y, 0, 0, color, 0.16, 13);
}

/** An object dying: shards, embers, a shock ring and a ground ripple. */
export function explode(x, y, r, color, glow, power = 1) {
  const q = fx.quality;
  const shards = clamp((r * 0.4 * power * q) | 0, 3, 22);
  for (let i = 0; i < shards; i++) {
    const a = rand(0, TAU);
    const s = rand(60, 260) * power;
    // Capped like a chip is, so a big body's burst does not throw pieces the
    // size of a small body. Looser than the floor's ceiling because these live
    // under a second and a BULWARK should still come apart bigger than a MOTE.
    const sr = Math.min(rand(r * 0.12, r * 0.3), rand(CFG.drop.min, CFG.drop.max * CFG.drop.burst));
    shard(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.5, 1.15), sr, 3 + ((Math.random() * 3) | 0));
  }
  const sparks = clamp((r * 0.7 * power * q) | 0, 5, 34);
  for (let i = 0; i < sparks; i++) {
    const a = rand(0, TAU);
    const s = rand(120, 520) * power;
    spark(x, y, Math.cos(a) * s, Math.sin(a) * s, glow, rand(0.18, 0.5), rand(1.5, 3.4));
  }
  const embers = clamp((r * 0.25 * q) | 0, 2, 12);
  for (let i = 0; i < embers; i++) {
    ember(x, y, spread(70), spread(70) - 20, color, rand(0.7, 1.6), rand(1.4, 3));
  }
  ring(x, y, r * 0.35, r * 3.1 * power, 0.42, glow, 2.4);
  ring(x, y, 0, r * 1.5, 0.24, '#ffffff', 1.4);
  dot(x, y, 0, 0, '#ffffff', 0.14, r * 1.6);
  ripple(x, y, 0.9 * power, r * 6);
  shake(clamp(r * 0.09 * power, 0.6, 7));
}

// ------------------------------------------------------------- simulation

export function updateFx(dt) {
  const parts = fx.particles.active;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.kind === KIND_HAUL) {
      const hx = p.tx - p.x;
      const hy = p.ty - p.y;
      const hd = Math.hypot(hx, hy) || 1;
      // Slow off the floor and quick into the turret. The tail is drawn from
      // the velocity, so accelerating lengthens the streak as it goes.
      const sp = 220 + (1 - p.life / p.max) * 1250;
      p.vx = (hx / hd) * sp;
      p.vy = (hy / hd) * sp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (hd < 16) p.life = 0;
      continue;
    }
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vy = p.vy * d + p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  fx.particles.sweep();

  const rings = fx.rings.active;
  for (let i = 0; i < rings.length; i++) {
    const g = rings[i];
    g.life -= dt;
    g.r += g.vr * dt;
  }
  fx.rings.sweep();

  for (let i = fx.ripples.length - 1; i >= 0; i--) {
    const r = fx.ripples[i];
    r.t += dt;
    if (r.t >= r.life) fx.ripples.splice(i, 1);
  }

  fx.shake = Math.max(0, fx.shake - fx.shake * 9 * dt - 6 * dt);
  const s = fx.shake;
  fx.shakeX = spread(s);
  fx.shakeY = spread(s);
  fx.flash = Math.max(0, fx.flash - dt * 2.6);
}

// ---------------------------------------------------------------- drawing

export function drawFx(ctx) {
  const parts = fx.particles.active;
  /*
   * The caller's alpha, kept and put back.
   *
   * Two of the particle branches below assigned `globalAlpha` and ended on a
   * bare `= 1`, and so did the end of this function -- the form the note
   * beside the ring fill one screen down already calls forbidden, and the
   * same one CLAUDE.md records costing four separate fixes before build 210's
   * fizzle fade would come out at all. Harmless today because `Game.draw`
   * enters at 1; it is the next caller that pays.
   */
  const enter = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const t = p.life / p.max;
    if (t <= 0) continue;

    if (p.kind === KIND_STREAK || p.kind === KIND_HAUL) {
      // Energy brightens as it arrives rather than fading out, and carries a
      // longer tail, so a floor being emptied reads as a stream going in
      // rather than as sparks going out.
      const drawn = p.kind === KIND_HAUL;
      const a = drawn ? clamp(0.45 + (1 - t) * 0.55, 0, 1) : clamp(t, 0, 1);
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = Math.max(0.5, p.r * (drawn ? 0.5 + (1 - t) * 0.7 : a));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * (drawn ? 0.05 : 0.022), p.y - p.vy * (drawn ? 0.05 : 0.022));
      ctx.stroke();
    } else if (p.kind === KIND_SHARD) {
      ctx.globalAlpha = enter * clamp(t * 1.3, 0, 1);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      const r = p.r;
      for (let k = 0; k < p.sides; k++) {
        const ang = (k / p.sides) * TAU;
        const rr = k % 2 ? r * 0.62 : r;
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = enter;
    } else {
      // dot / ember — pre-rendered glow sprite
      const r = p.r * (p.kind === KIND_EMBER ? 2.6 : 1) * (0.35 + t * 0.65);
      const img = glowSprite(p.color);
      ctx.globalAlpha = enter * clamp(t, 0, 1) * p.glow;
      ctx.drawImage(img, p.x - r * 2, p.y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = enter;
    }
  }

  const rings = fx.rings.active;
  for (let i = 0; i < rings.length; i++) {
    const g = rings[i];
    const t = clamp(g.life / g.max, 0, 1);
    if (g.fill) {
      // Multiplied in and put back. The bare `= 1` this used to end on was the
      // forbidden form -- see the note on drawGlow in util.js -- and it was
      // harmless only because nothing in the game had ever passed `fill`.
      const was = ctx.globalAlpha;
      ctx.globalAlpha = was * t * g.fill;
      drawGlow(ctx, g.color, g.x, g.y, g.r);
      ctx.globalAlpha = was;
    }
    ctx.strokeStyle = rgba(g.color, t * 0.95);
    ctx.lineWidth = Math.max(0.4, g.w * t);
    ctx.beginPath();
    // `span` defaults to a full turn, so every ring authored before build 211
    // draws exactly the circle it always did.
    ctx.arc(g.x, g.y, Math.max(0.5, g.r), g.a0 || 0, (g.a0 || 0) + (g.span || TAU));
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = enter;
}

export function drawFlash(ctx, w, h) {
  if (fx.flash <= 0.002) return;
  const enter = ctx.globalAlpha;
  ctx.globalAlpha = enter * clamp(fx.flash, 0, 1);
  ctx.fillStyle = fx.flashColor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = enter;
}
