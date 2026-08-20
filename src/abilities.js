// Eight abilities. Each one is legible from its first use, and each one says
// what it is the first time it is used rather than in a manual.
//
// The turret is issued with PULSE and FAN — one that shoves a crowd off and
// one that kills it. The other six are locked and handed over by the permanent
// tier of the offer system, along with the rounds and the mines. A second use of any one
// of them is bought the same way; until it is, an ability holds exactly one
// charge and behaves as a plain cooldown, with nothing extra drawn on it.

import { TAU, clamp, rand, spread, smoothstep, rgba, drawGlow, segClosest } from './util.js';
import { spark, dot, ring, ripple, shake, flash } from './fx.js';
import { CFG } from './config.js';
import { fire } from './projectiles.js';
import { applyBlast, ENTRY_Y, drawIn } from './enemies.js';
import { audio } from './audio.js';

/*
 * Ability marks. Each one draws what the ability does to the field rather than
 * a generic glyph, because the bar is read at a glance mid-fight and two
 * abilities that look alike are two abilities that get pressed by mistake.
 * WELL and SIPHON were both a circle in a ring of spikes; they are now the
 * only two that could not be confused.
 */
const ICON = {
  // A shockwave leaving the turret: a hard core and two arcs already gone.
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2" opacity=".8"/><path d="M16.6 7.4a6.5 6.5 0 0 1 0 9.2" opacity=".8"/><path d="M4.1 4.1a11.2 11.2 0 0 0 0 15.8" opacity=".38"/><path d="M19.9 4.1a11.2 11.2 0 0 1 0 15.8" opacity=".38"/></svg>',
  // Everything the turret has, at once, across the whole arc.
  fan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="21" r="1.7" fill="currentColor" stroke="none"/><path d="M12 21 4.6 9.4M12 21 8.7 7.2M12 21V6.6M12 21l3.3-13.8M12 21 19.4 9.4"/></svg>',
  // One shot straight through everything in the column.
  lance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11.4 2.4 7.4 10h8z" fill="currentColor" stroke="none"/><path d="M11.4 10.6v11"/><path d="M8.9 13.8h5" opacity=".5"/><path d="M9.7 17.4h3.4" opacity=".3"/></svg>',
  // Everything on the field, dragged inward — the opposite of PULSE.
  well: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.4v4.4M9.7 4.6 12 6.9l2.3-2.3"/><path d="M12 21.6v-4.4M9.7 19.4 12 17.1l2.3 2.3"/><path d="M2.4 12h4.4M4.6 9.7 6.9 12l-2.3 2.3"/><path d="M21.6 12h-4.4M19.4 9.7 17.1 12l2.3 2.3"/></svg>',
  // Held. A crystal with something stopped inside it.
  stasis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.6 20.1 7.3v9.4L12 21.4 3.9 16.7V7.3z"/><path d="M12 8.4 15.6 10.5v4.2L12 16.8l-3.6-2.1v-4.2z" fill="currentColor" fill-opacity=".3"/></svg>',
  // A shell that breaks and leaves in every direction at once.
  prism: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M8.6 3.4 2.6 18.6h12z"/><path d="M13.4 8.4 21.6 5.2M14.8 12.2 22.4 11.6M16.2 15.8l5.6 3.4" opacity=".8"/></svg>',
  // Two turrets. One of them is not there.
  decoy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.8 4.6v4.2"/><path d="M2.9 12.4 6.8 8.9l3.9 3.5v5.9H2.9z"/><circle cx="6.8" cy="14.6" r="1.3" fill="currentColor" stroke="none"/><path d="M17.2 4.6v4.2" stroke-dasharray="2.2 1.9"/><path d="M13.3 12.4l3.9-3.5 3.9 3.5v5.9h-7.8z" stroke-dasharray="2.2 1.9" opacity=".85"/></svg>',
  // Wreckage hauled up off the floor and thrown back out the top.
  chorus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.4" r="2.1"/><circle cx="4.6" cy="16" r="2.1"/><circle cx="19.4" cy="16" r="2.1"/><circle cx="12" cy="20.4" r="2.1" fill="currentColor" stroke="none"/><path d="M10.6 6.2 6 14M13.4 6.2 18 14M6.4 17.4l3.5 2.2M17.6 17.4l-3.5 2.2M12 6.5v11.8" opacity=".7"/></svg>',
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

// The singularity runs in two acts: a long gather that drags everything into
// one grinding knot, then a short collapse that crushes the knot and blows.
// Most of the damage comes from the objects hitting each other on the way in.
const WELL_GATHER = 2.5;
const WELL_COLLAPSE = 0.6;
const WELL_REACH = 430;

class Well {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.max = WELL_GATHER + WELL_COLLAPSE;
    this.life = this.max;
    this.r = WELL_REACH * 0.3;
    this.crush = 0;
    this.dead = false;
    this.spin = 0;
  }

  update(world, dt) {
    this.life -= dt;
    const age = this.max - this.life;
    this.crush = clamp((age - WELL_GATHER) / WELL_COLLAPSE, 0, 1);
    const ramp = smoothstep(clamp(age / 0.8, 0, 1));
    this.spin += dt * (2.6 + this.crush * 14);
    // the event horizon draws in as it crushes
    this.r = WELL_REACH * 0.3 * (1 - this.crush * 0.86) + 20;

    // A tractor beam rather than a gravity field: velocity is driven toward a
    // fixed inward speed, so bodies converge instead of slingshotting into
    // escape orbits. They still collide with each other the whole way in —
    // that is where most of the damage comes from.
    const blend = clamp(9 * ramp * dt, 0, 1);
    const inward = 270 * (1 + this.crush * 1.6);
    const swirl = 130 * (1 - this.crush);

    const grab = (list) => {
      for (const e of list) {
        if (e.dead) continue;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > WELL_REACH || d < 0.5) continue;
        const nx = dx / d;
        const ny = dy / d;
        // ease off inside the knot so they pack together instead of
        // driving straight through the middle and out the far side
        const closing = inward * Math.min(1, d / 70);
        const tan = swirl * Math.min(1, d / 120);
        const wantX = nx * closing - ny * tan;
        const wantY = ny * closing + nx * tan;
        e.vx += (wantX - e.vx) * blend;
        e.vy += (wantY - e.vy) * blend;
        e.av += 1.4 * dt;
      }
    };
    grab(world.enemies);
    grab(world.drops);

    // infalling matter
    const streams = this.crush > 0 ? 3 : 1;
    for (let i = 0; i < streams; i++) {
      if (Math.random() > 0.7) continue;
      const a = rand(0, TAU);
      const rr = rand(this.r * 1.4, WELL_REACH);
      spark(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr,
        -Math.cos(a) * (380 + this.crush * 700), -Math.sin(a) * (380 + this.crush * 700),
        this.crush > 0 ? '#ffffff' : '#c77dff', 0.3, 2);
    }

    if (this.life <= 0) {
      this.dead = true;
      applyBlast(world, { x: this.x, y: this.y, r: 210, damage: 105, impulse: 1000 });
      ring(this.x, this.y, 10, 340, 0.42, '#e0aaff', 5);
      ring(this.x, this.y, 0, 170, 0.26, '#ffffff', 2);
      ripple(this.x, this.y, 1.9, 720);
      flash(0.32, '#e0c2ff');
      shake(12);
      audio.boom();
    }
  }

  draw(ctx, world) {
    const fade = clamp(this.life / 0.35, 0, 1);
    const heat = this.crush;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, heat > 0 ? '#ffffff' : '#7b2cbf', 0, 0, this.r * (2.4 + heat * 1.6), (0.4 + heat * 0.5) * fade);

    // accretion disc — tilts and tightens as the well crushes down
    ctx.rotate(this.spin);
    ctx.strokeStyle = rgba('#e0aaff', 0.7 * fade);
    ctx.lineWidth = 1.4 + heat * 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * (0.5 + i * 0.22), this.r * (0.16 + i * 0.1) * (1 - heat * 0.6),
        i * 0.8 + world.time, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // the hole itself
    ctx.fillStyle = '#05010a';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, this.r * 0.22), 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', (0.8 + heat * 0.2) * fade);
    ctx.lineWidth = 1.6 + heat * 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.4, this.r * 0.24), 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

/**
 * A second turret that is not yours and is not real. Everything that walks
 * walks at it instead — Enemy.steer picks it over the shooter — so a scattered
 * field becomes one pile somewhere that is not on top of you. It is a static
 * body, so things pile up against it rather than through it, and it takes the
 * collision damage of everything it catches. When it goes, it goes loudly.
 */
class Decoy {
  constructor(x, y) {
    const D = CFG.decoy;
    this.x = x;
    this.y = y;
    this.r = D.r;
    this.hp = D.hp;
    this.maxHp = D.hp;
    this.life = D.life;
    this.dead = false;
    this.flash = 0;
    this.spin = 0;
    this.born = 0;
    // static physics body, exactly like the turret
    this.vx = 0;
    this.vy = 0;
    this.invMass = 0;
    this.mass = Infinity;
    this.restitution = 0.5;
    this.friction = 0.4;
  }

  /** The solver calls this on anything it damages. */
  applyDamage(world, dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = Math.min(1, this.flash + dmg / 200);
    if (this.hp <= 0) this.expire(world);
  }

  expire(world) {
    if (this.dead) return;
    this.dead = true;
    const B = CFG.decoy.blast;
    applyBlast(world, { x: this.x, y: this.y, r: B.r, damage: B.damage, impulse: B.impulse });
    ring(this.x, this.y, this.r, B.r * 1.5, 0.5, '#9be7ff', 6);
    ring(this.x, this.y, 0, B.r * 0.7, 0.3, '#ffffff', 2.4);
    ripple(this.x, this.y, 1.8, B.r * 4);
    flash(0.24, '#bdf0ff');
    shake(14);
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      spark(this.x, this.y, Math.cos(a) * rand(240, 700), Math.sin(a) * rand(240, 700), '#9fe8ff', 0.45, 2.6);
    }
    audio.boom();
    if (world.decoy === this) world.decoy = null;
  }

  update(world, dt) {
    this.born = Math.min(1, this.born + dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.spin += dt * 1.6;
    this.life -= dt;
    if (this.life <= 0) this.expire(world);
  }

  draw(ctx, world) {
    const k = this.born;
    const hpf = clamp(this.hp / this.maxHp, 0, 1);
    const going = clamp(this.life / 1.6, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = k * (0.45 + going * 0.55);

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#59e0ff', 0, 0, this.r * 3.4, 0.28 + this.flash * 0.5);
    ctx.globalCompositeOperation = 'source-over';

    // the same silhouette as the real one, drawn hollow so it reads as a copy
    ctx.strokeStyle = rgba('#9be7ff', 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.42, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.strokeRect(-4, -this.r * 1.5, 8, this.r * 0.8);
    ctx.restore();

    // what is left of it
    ctx.strokeStyle = rgba('#ffffff', 0.85);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * hpf);
    ctx.stroke();

    // a lure sweeping outward, so it reads as calling rather than sitting
    const sweep = (world.time * 1.2) % 1;
    ctx.strokeStyle = rgba('#59e0ff', 0.3 * (1 - sweep));
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 10 + sweep * 150, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * SIPHON. Hauls every loose fragment on the field into the muzzle and throws
 * it back out as a volley, so the more wreckage there is the harder it hits.
 * A field you have just cleared has almost nothing to give, which is the
 * trade — and it is the one ability that competes with a GLUT for food.
 */
/*
 * CHORUS. Every hostile on the field is tied to every other one for a few
 * seconds. Nothing happens on its own — the binding does no damage and holds
 * nothing in place. But the moment one of them comes apart, the rest feel it,
 * and on a crowded field one good shot walks all the way through the crowd
 * without another round being fired.
 *
 * It is the only ability whose payoff is entirely in what the player does next.
 */
class Chorus {
  constructor(world) {
    const P = CFG.chorus;
    this.t = 0;
    this.dead = false;
    this.bound = [];
    const s = world.shooter;
    const r2 = P.reach * P.reach;
    for (const e of world.enemies) {
      if (e.dead || e.staged || e.harmless) continue;
      if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r2) continue;
      this.bound.push(e);
      if (this.bound.length >= P.maxBound) break;
    }
    // Remembered rather than read at the time: an echo is the size of what was
    // lost, and by the time it is paid out the thing is already gone.
    this.worth = new Map(this.bound.map((e) => [e, Math.min(P.cap, P.floor + (e.maxHp || e.hp) * P.share)]));
    this.gen = new Map(); // how far out from the first death each one is
    this.hops = 0;
    this.arcs = []; // one short-lived line per echo, so the chain is watchable
    this.linkT = 0;
    this.links = [];
    audio.ability('stasis');
  }

  update(world, dt) {
    const P = CFG.chorus;
    this.t += dt;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].t += dt;
      if (this.arcs[i].t > 0.3) this.arcs.splice(i, 1);
    }
    if (this.t >= P.life) { this.dead = true; return; }

    for (let i = this.bound.length - 1; i >= 0; i--) {
      const e = this.bound[i];
      if (!e.dead) continue;
      this.bound.splice(i, 1);
      // Taken by something else entirely — dissolved bodies were never killed,
      // so they are not a death the rest of the choir should answer.
      if (e.dissolved) { this.worth.delete(e); continue; }
      const g = this.gen.get(e) || 0;
      const echo = (this.worth.get(e) || 0) * P.falloff ** g;
      this.worth.delete(e);
      this.gen.delete(e);
      if (echo <= 1 || !this.bound.length || this.hops >= P.hops) continue;
      this.hops++;

      // The few nearest, not everything. This is what makes it a chain rather
      // than a field-wide detonation: it travels through whatever is packed
      // together and stops where the crowd thins out.
      const near = this.bound
        .filter((o) => !o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= P.link * P.link)
        .sort((a, b) => ((a.x - e.x) ** 2 + (a.y - e.y) ** 2) - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2))
        .slice(0, P.spread);
      for (const o of near) {
        o.hp -= echo;
        o.flash = 1;
        this.gen.set(o, g + 1);
        this.arcs.push({ x1: e.x, y1: e.y, x2: o.x, y2: o.y, t: 0 });
        spark(o.x, o.y, rand(-90, 90), rand(-90, 90), '#c9a7ff', 0.3, 2);
        if (o.hp <= 0) o.dead = true; // and its own echo lands next frame
      }
      if (!near.length) continue;
      ring(e.x, e.y, 8, 120, 0.28, '#c9a7ff', 2.2);
      shake(1.6);
      audio.pop(1.2);
    }
  }

  /**
   * Who an echo would reach from where. Recomputed a few times a second rather
   * than every frame — forty bodies is sixteen hundred distance checks, and
   * the shape does not change fast enough to be worth that at 60fps.
   */
  relink() {
    const P = CFG.chorus;
    const live = this.bound.filter((e) => !e.dead);
    this.links = [];
    for (const a of live) {
      let best = null;
      let bd = P.link * P.link;
      for (const b of live) {
        if (b === a) continue;
        const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) this.links.push([a, best]);
    }
  }

  draw(ctx) {
    const P = CFG.chorus;
    this.linkT -= 1 / 60;
    if (this.linkT <= 0) { this.linkT = 0.25; this.relink(); }
    // Fades in over the first beat and out over the last, so the field is not
    // suddenly webbed and suddenly bare.
    const k = Math.min(1, this.t / 0.35) * Math.min(1, (P.life - this.t) / 0.9);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // What is tied to what: each bound body to its nearest, so the picture is
    // the shape of the crowd and you can see where a chain would stop.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba('#c9a7ff', 0.26 * k * (0.55 + 0.45 * pulse));
    ctx.beginPath();
    for (const [a, b] of this.links) {
      if (a.dead || b.dead) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    for (const e of this.bound) {
      if (!e.dead) drawGlow(ctx, '#c9a7ff', e.x, e.y, e.r * 1.5, 0.2 * k);
    }

    // And the chain actually travelling, one bright line per echo paid.
    for (const a of this.arcs) {
      const f = 1 - a.t / 0.3;
      ctx.lineWidth = 1 + 2.2 * f;
      ctx.strokeStyle = rgba('#e6d6ff', 0.9 * f);
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const SPECTRUM = ['#ff4d6d', '#ff9f1c', '#ffe066', '#7cffb2', '#59e0ff', '#8b5cf6', '#e0aaff'];

/**
 * Where a prism shell lands: a refraction. One wide shockwave, then a fan of
 * coloured beams that each cut everything along their length.
 */
function prismBurst(world, x, y) {
  const P = CFG.prism;
  applyBlast(world, { x, y, r: P.r, damage: P.damage, impulse: P.impulse });

  for (let i = 0; i < P.beams; i++) {
    const a = (i / P.beams) * TAU + rand(0, 0.3);
    const x1 = x + Math.cos(a) * P.beamLen;
    const y1 = y + Math.sin(a) * P.beamLen;
    world.effects.push(new Beam(x, y, x1, y1, SPECTRUM[i % SPECTRUM.length]));

    const sweep = (list) => {
      for (const e of list) {
        if (e.dead) continue;
        const c = segClosest(x, y, x1, y1, e.x, e.y);
        const rr = e.r + 18;
        if (c.d2 > rr * rr) continue;
        e.applyDamage(world, P.beamDamage, Math.cos(a), Math.sin(a), 220);
      }
    };
    sweep(world.enemies);
    sweep(world.drops);
    if (world.boss && !world.boss.dead) {
      const c = segClosest(x, y, x1, y1, world.boss.x, world.boss.y);
      if (c.d2 < (world.boss.r + 18) ** 2) world.boss.hurt(world, P.beamDamage * 2);
      // the copy is a body too — beams used to cut through it for nothing
      const e = world.boss.echo;
      if (e && e.born >= 1) {
        const ec = segClosest(x, y, x1, y1, e.x, e.y);
        if (ec.d2 < (e.r + 14) ** 2) world.boss.hurtEcho(world, P.beamDamage * 2);
      }
    }
  }

  for (let i = 0; i < SPECTRUM.length; i++) {
    ring(x, y, 8 + i * 6, P.r * (1.05 + i * 0.1), 0.45 + i * 0.05, SPECTRUM[i], 3);
  }
  for (let i = 0; i < 46; i++) {
    const a = rand(0, TAU);
    spark(x, y, Math.cos(a) * rand(200, 780), Math.sin(a) * rand(200, 780),
      SPECTRUM[i % SPECTRUM.length], rand(0.25, 0.6), 2.8);
  }
  ripple(x, y, 2.1, P.r * 4);
  flash(0.34, '#ffffff');
  shake(14);
  audio.boom();
  audio.chime(880);
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
    // The one that is always there. It is the answer to something sitting on
    // the turret where the barrel cannot reach, so ORDINAL can never take it.
    essential: true,
    icon: ICON.pulse,
    hint: 'PULSE — hurts and shoves what is near you, and takes in the energy.',
    run(world) {
      const s = world.shooter;
      applyBlast(world, { x: s.x, y: s.y, r: 340, damage: 58, impulse: 1050 });
      // ...and it draws the energy in. This is how the currency is collected:
      // objects drop it when they come apart, it drifts to the turret, and it
      // sits there until a PULSE takes it. INTAKE is the upgrade that stops
      // you having to ask.
      drawIn(world, CFG.energy.pulse);
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
    hint: 'FAN — 25 pellets in a tight cone.',
    run(world) {
      const s = world.shooter;
      const count = 25;
      const arc = 1.12; // narrower than it was, so the pellets land together
      for (let i = 0; i < count; i++) {
        const a = s.aim + ((i / (count - 1)) - 0.5) * arc + spread(0.022);
        fire(world, s.muzzleX, s.muzzleY, a, {
          speed: rand(1000, 1230),
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
    hint: 'LANCE — piercing beam, locked to the biggest threat.',
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
      hitList(world.drops);

      if (world.boss && !world.boss.dead) {
        const ec2 = world.boss.echo;
        if (ec2 && ec2.born >= 1) {
          const c3 = segClosest(s.x, s.y, x1, y1, ec2.x, ec2.y);
          if (c3.d2 < (ec2.r + 20) ** 2) world.boss.hurtEcho(world, 900);
        }
        const c = segClosest(s.x, s.y, x1, y1, world.boss.x, world.boss.y);
        if (c.d2 < (world.boss.r + 26) ** 2) {
          world.boss.hurt(world, 900);
          world.boss.push(Math.cos(a), Math.sin(a), 46);
        }
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
    cooldown: 38,
    icon: ICON.well,
    hint: 'WELL — drags everything into a knot, then collapses.',
    run(world) {
      const p = densestPoint(world);
      world.effects.push(new Well(p.x, p.y));
      ring(p.x, p.y, 320, 30, 0.5, '#c77dff', 3);
      audio.ability('well');
    },
  },
  {
    id: 'prism',
    name: 'PRISM',
    color: '#ff9ff3',
    cooldown: 16,
    icon: ICON.prism,
    hint: 'PRISM — a shell that refracts. Wide blast, then beams every way.',
    run(world) {
      const s = world.shooter;
      // Fused, not ballistic: it refracts after a fixed run whether or not it
      // hits anything, so the burst always lands somewhere you can see.
      fire(world, s.muzzleX, s.muzzleY, s.aim, {
        speed: 820,
        r: 8,
        damage: 30,
        impulse: 120,
        life: 0.7,
        bounces: 0,
        color: '#ffd6ff',
        core: '#ffffff',
        trail: 0.05,
        burst: prismBurst,
      });
      s.recoil = 1.3;
      shake(4);
      audio.ability('lance');
    },
  },
  {
    id: 'stasis',
    name: 'STASIS',
    color: '#9fe8ff',
    cooldown: 21,
    icon: ICON.stasis,
    hint: 'STASIS — objects freeze. Your shots do not.',
    run(world) {
      world.stasis = 4;
      for (const e of world.enemies) { e.vx *= 0.1; e.vy *= 0.1; e.av *= 0.1; }
      for (const e of world.drops) { e.vx *= 0.1; e.vy *= 0.1; e.av *= 0.1; }
      ring(world.shooter.x, world.shooter.y, 20, Math.hypot(world.width, world.height), 0.5, '#9fe8ff', 4);
      flash(0.2, '#d6f4ff');
      for (let i = 0; i < 22; i++) {
        dot(rand(0, world.width), rand(0, world.height), 0, 0, '#d6f4ff', rand(0.4, 1.2), rand(3, 9));
      }
      audio.ability('stasis');
    },
  },
  {
    id: 'decoy',
    name: 'DECOY',
    color: '#9be7ff',
    cooldown: 24,
    icon: ICON.decoy,
    hint: 'DECOY — a turret that is not yours. They go for it instead.',
    run(world) {
      // Only one at a time; a second would just split the pile.
      if (world.decoy && !world.decoy.dead) world.decoy.expire(world);
      const s = world.shooter;
      const top = ENTRY_Y + 60;
      const d = new Decoy(s.x, clamp(s.y - CFG.decoy.ahead, top, s.y - 120));
      world.decoy = d;
      world.effects.push(d);
      ring(d.x, d.y, 6, 300, 0.5, '#59e0ff', 4);
      ripple(d.x, d.y, 1.2, 620);
      shake(7);
      audio.ability('pulse');
    },
  },
  {
    id: 'chorus',
    name: 'CHORUS',
    color: '#c9a7ff',
    cooldown: 15,
    icon: ICON.chorus,
    hint: 'CHORUS — ties the field together. Whatever kills one hurts the rest.',
    run(world) {
      world.effects.push(new Chorus(world));
      ring(world.shooter.x, world.shooter.y, 20, 520, 0.55, '#c9a7ff', 3);
      shake(4);
    },
  },
];

// -------------------------------------------------------------- controller

export class Abilities {
  constructor() {
    // `max` is how many uses are held at once and `charges` is how many are
    // left. Everything starts at one, which is the cooldown-only behaviour the
    // game had before: a second charge is bought, one ability at a time, and
    // until it is bought there is nothing extra on screen to explain.
    this.slots = ABILITIES.map((def) => ({ def, cd: 0, used: false, locked: 0, max: 1, charges: 1 }));
  }

  reset() {
    for (const s of this.slots) {
      s.cd = 0; s.used = false; s.locked = 0; s.max = 1; s.charges = 1; s.cost = 0;
    }
  }

  /** A permanent second (or third) use of one ability, held in hand. */
  grantCharge(id) {
    const s = this.slots.find((a) => a.def.id === id);
    if (!s) return false;
    s.max += 1;
    s.charges += 1; // the one just bought is in hand, not owed
    return true;
  }

  update(dt) {
    for (const s of this.slots) {
      if (s.locked > 0) s.locked = Math.max(0, s.locked - dt);
      if (s.cd <= 0) continue;
      s.cd = Math.max(0, s.cd - dt);
      if (s.cd > 0 || s.charges >= s.max) continue;
      // One charge back per cooldown, and the clock restarts while any are
      // still owed — so a two-charge ability refills in two cooldowns, not one.
      s.charges += 1;
      if (s.charges < s.max) s.cd = this.lastCost(s);
    }
  }

  /** What the cooldown was set to last time, so a refill runs at the same rate. */
  lastCost(s) {
    return s.cost || s.def.cooldown;
  }

  /** Everything ready, now. */
  clearCooldowns() {
    for (const s of this.slots) { s.cd = 0; s.charges = s.max; }
  }

  /**
   * ORDINAL's SUBTRACT. Takes an unlocked button away for a while, preferring
   * one that is actually ready — removing something already on cooldown would
   * cost the player nothing, and neither would removing one never unlocked.
   * PULSE is never on the table.
   * @returns the index taken, or -1 if there was nothing worth taking.
   */
  lockRandom(seconds, unlocked) {
    const free = [];
    const any = [];
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.locked > 0 || s.def.essential) continue;
      // Taking away something never bought costs the player nothing and reads
      // as a greyed button going slightly greyer. SUBTRACT is ORDINAL's whole
      // character; it has to land on something that was actually in hand.
      if (unlocked && !unlocked.has(s.def.id)) continue;
      any.push(i);
      if (s.cd <= 0) free.push(i);
    }
    const pool = free.length ? free : any;
    if (!pool.length) return -1;
    const i = pool[(Math.random() * pool.length) | 0];
    this.slots[i].locked = seconds;
    return i;
  }

  isLocked(i) {
    const s = this.slots[i];
    return !!s && s.locked > 0;
  }

  usable(i) {
    const s = this.slots[i];
    return !!s && s.charges > 0 && s.locked <= 0;
  }

  /** @returns the slot if it fired, otherwise null. */
  trigger(world, index) {
    const s = this.slots[index];
    if (!s || !this.usable(index)) return null;
    s.def.run(world);
    // STANDING ORDER shortens every cooldown; HASTE halves them for a while.
    const scale = world.up.cooldown * (world.haste > 0 ? 0.5 : 1);
    s.cost = s.def.cooldown * scale * (world.debug.noCooldown ? 0 : 1);
    s.charges -= 1;
    // The clock is already running if this was a held charge; starting it over
    // would make the second use cost more than the first.
    if (s.cd <= 0) s.cd = s.cost;
    const first = !s.used;
    s.used = true;
    return { slot: s, first };
  }

  readyFraction(i) {
    const s = this.slots[i];
    if (s.cd <= 0) return 1;
    return clamp(1 - s.cd / this.lastCost(s), 0, 1);
  }

  /** For the pips, which only exist once something has more than one use. */
  chargeState(i) {
    const s = this.slots[i];
    return s ? { charges: s.charges, max: s.max } : { charges: 0, max: 1 };
  }
}
