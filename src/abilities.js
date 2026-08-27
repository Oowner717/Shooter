// Eight abilities. Each one is legible from its first use, and each one says
// what it is the first time it is used rather than in a manual.
//
// The turret is issued with PULSE and HAIL — one that shoves a crowd off and
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
  spiral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12.2a2.6 2.6 0 1 1 2.4-3.6 5.2 5.2 0 1 1-8.1 6.1 8.4 8.4 0 1 1 14.4-2.3"/><circle cx="12" cy="12.2" r="1" fill="currentColor" stroke="none"/><path d="M20.7 12.4 22 9.6M20.7 12.4l-2.9-.6" opacity=".8"/></svg>',
};


// ------------------------------------------------------------------ effects

/**
 * PULSE's reach, after the punch has landed.
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
class Shock {
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

/**
 * LANCE's beam, in three parts on two clocks.
 *
 * It was one stroke pair on a 0.42s fade, and at four hundred milliseconds
 * there was nothing left on the screen at all -- twelve seconds of cooldown
 * for a flash you could blink through, drawn as a thin stick rather than as
 * the heaviest single hit in the bar.
 *
 * The strike is still fast, because a beam that lingers at full strength
 * stops reading as instantaneous. What is new is the SCAR: the line it went
 * through stays, thin and dim, for four times as long, so the shot leaves
 * evidence and the player can see what it passed through after the fact. The
 * two clocks are the whole idea -- a hard, brief hit and a slow, quiet mark.
 */
class Beam {
  constructor(x0, y0, x1, y1, color) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
    this.life = 0.42;
    this.max = 0.42;
    this.scar = 1.6; // the mark it leaves, on its own clock
    this.color = color;
    this.dead = false;
  }
  update(_world, dt) {
    this.life -= dt;
    this.scar -= dt;
    if (this.scar <= 0) this.dead = true;
  }
  draw(ctx) {
    const t = clamp(this.life / this.max, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    if (t > 0) {
      // The bloom, the body, and the filament, widest to narrowest.
      const dx = this.x1 - this.x0;
      const dy = this.y1 - this.y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      for (const [mul, alpha] of [[46, 0.16], [22, 0.3], [9, 0.55]]) {
        ctx.strokeStyle = rgba(this.color, t * alpha);
        ctx.lineWidth = 2 + t * mul;
        ctx.beginPath();
        ctx.moveTo(this.x0, this.y0);
        ctx.lineTo(this.x1, this.y1);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', t);
      ctx.lineWidth = Math.max(0.8, t * 6);
      ctx.beginPath();
      ctx.moveTo(this.x0, this.y0);
      ctx.lineTo(this.x1, this.y1);
      ctx.stroke();
      // ...and the muzzle it left from, which is where the weight is.
      drawGlow(ctx, '#fff0c0', this.x0, this.y0, 30 + t * 70, t * 0.85);
      drawGlow(ctx, this.color, this.x0 + ux * 40, this.y0 + uy * 40, 20 + t * 40, t * 0.5);
    }

    // The scar. Thin, dim, and much slower -- what the shot went through.
    const sc = clamp(this.scar / 1.6, 0, 1) ** 1.6;
    if (sc > 0) {
      ctx.strokeStyle = rgba(this.color, sc * 0.3);
      ctx.lineWidth = 1 + sc * 2.2;
      ctx.beginPath();
      ctx.moveTo(this.x0, this.y0);
      ctx.lineTo(this.x1, this.y1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }
}

// The singularity runs in two acts: a long gather that drags everything into
// one grinding knot, then a short collapse that crushes the knot and blows.
// Most of the damage comes from the objects hitting each other on the way in.
const WELL_GATHER = 2.5;
const WELL_COLLAPSE = 0.6;
const WELL_REACH = 430;

/*
 * `show` on each ability below is how long its effect is worth looking at,
 * which is not its cooldown and not its damage window: HAIL is over before the
 * pellets land and WELL drags for a couple of seconds. Hud.recede() takes the
 * strip and the ability bar down for exactly that long, because measured
 * across three handsets a turret-centred effect is 25-54% behind a control.
 */

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

  /**
   * What this is doing to the substrate. The lattice reads it once a frame and
   * bends its rays and rings around it — the reach is well past the tractor
   * beam's, because the pull on the sky should be visible before you are in it,
   * and the strength climbs as the well tightens so the sky collapses with it.
   */
  wellField() {
    const ramp = clamp((this.max - this.life) / 0.6, 0, 1);
    const out = clamp(this.life / 0.4, 0, 1); // let go as it goes, not after
    return {
      x: this.x,
      y: this.y,
      // Well past the tractor beam's own reach. The pull on the sky should be
      // readable before you are anywhere near the hole, and the strongest part
      // of the bend sits under the well's own glow if it is any tighter than
      // this — the visible half of the effect is all out here.
      reach: WELL_REACH * 2.4,
      strength: (0.6 + this.crush * 1.1) * ramp * out,
    };
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

    /*
     * The turret's own silhouette, not a circle.
     *
     * It was two dashed rings and a stub, which reads as a marker on the
     * ground -- and the whole idea is "a turret that is not yours", so
     * anything walking at it should be walking at something that looks like
     * the thing they were walking at before. It wears the real machine's
     * hexagonal mount and barrel, hollow and dashed, and the barrel sweeps:
     * a decoy that stands perfectly still is obviously not a gun.
     */
    ctx.strokeStyle = rgba('#9be7ff', 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a2 = -Math.PI / 2 + (i / 6) * TAU;
      const px = Math.cos(a2) * this.r;
      const py = Math.sin(a2) * this.r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.42, 0, TAU);
    ctx.stroke();
    // The barrel, swinging as if it were looking for something. Off
    // world.time so every decoy on the field is not in lockstep.
    ctx.save();
    ctx.rotate(-Math.PI / 2 + Math.sin(world.time * 1.3 + this.born) * 0.5);
    ctx.strokeRect(-4, -this.r * 1.62, 8, this.r * 0.9);
    ctx.strokeStyle = rgba('#d8f4ff', 0.8);
    ctx.beginPath();
    ctx.moveTo(0, -this.r * 1.62);
    ctx.lineTo(0, -this.r * 1.86);
    ctx.stroke();
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
 * SPIRAL. The barrel comes off its target and turns, firing all the way round.
 *
 * The one ability that is about the turret rather than the field. Every other
 * entry in the bar does something somewhere else; this one takes the gun the
 * player has spent the whole tree building and removes the single constraint
 * on it, which is that it can only point one way at a time.
 *
 * It fires the loaded round through every upgrade that round carries, so it is
 * nine different abilities depending on what is on the strip. It owns the aim
 * while it runs -- Game.updateFiring stands down on `world.spiral` -- and
 * hands it straight back, because a barrel left pointing wherever the sweep
 * ended would be a worse gift than the sweep.
 */
class Spiral {
  constructor(world) {
    const P = CFG.spiral;
    this.t = 0;
    this.life = P.life;
    this.settle = P.settle;
    this.dead = false;
    this.from = world.shooter.aim;
    this.grip = world.shooter.gripAngle;
    this.next = 0;
    this.rounds = 0;
    /*
     * COUNTERSPIN adds a second arm turning the other way. Each arm carries
     * its own angle and its own sign, so the upgrade is one more entry here
     * rather than a special case in three places. The barrel is arm 0 and is
     * the one the gun actually points along; the rest are traced.
     */
    this.arms = Array.from({ length: Math.max(1, world.up.spiralArms) }, (_, i) => ({
      dir: i % 2 ? -1 : 1,
      at: this.from + (i / Math.max(1, world.up.spiralArms)) * TAU,
      a: this.from,
    }));
    world.spiral = P.life;
  }

  /** Where an arm is, and how far out, at sweep fraction k. */
  reach(k) {
    const P = CFG.spiral;
    return P.rIn + (P.rOut - P.rIn) * k;
  }

  update(world, dt) {
    const P = CFG.spiral;
    const s = world.shooter;
    this.t += dt;

    if (this.life > 0) {
      this.life -= dt;
      world.spiral = Math.max(0, this.life);
      const k = clamp(this.t / P.life, 0, 1);
      for (const arm of this.arms) {
        arm.a = arm.at + arm.dir * k * P.turns * TAU;
      }
      /*
       * The sweep owns the barrel. This runs in the effects pass, after
       * shooter.update(), so whatever the assist did to the aim this frame is
       * overwritten rather than fought with. `targetAim` goes with it, because
       * `aimError` is a getter off the two and the slew would otherwise spend
       * the whole sweep correcting back to a target.
       */
      s.aim = this.arms[0].a + spread(P.wobble);
      s.targetAim = s.aim;
      s.sweepFade = 1;

      this.next -= dt;
      // `while` rather than `if`: a long frame owes more than one round, and
      // dropping them would make the sweep quietly weaker on a slow phone.
      let guard = 12;
      while (this.next <= 0 && guard-- > 0) {
        /*
         * One tick, one round per arm -- so COUNTERSPIN doubles the output
         * and does not square it. The first version also divided the
         * interval by the arm count, which is the same multiplier applied
         * twice: two arms fired 118 rounds against one arm's 33.
         */
        this.next += P.interval;
        for (const arm of this.arms) {
          s.cooldown = 0;
          const was = s.aim;
          s.aim = arm.a + spread(P.wobble);
          if (s.shoot(world, P.damage)) this.rounds++;
          s.aim = was;
        }
      }
      return;
    }

    /*
     * Done firing. The gun goes back before anything else does -- the aim is
     * wound back to where the sweep began rather than left at `from + 2.6
     * turns`, because gripAngle is derived from it and an unwound aim leaves
     * the gimbal's travel arc spanning six radians for the rest of the run.
     * That is exactly what it did: the ring stayed shut after every use.
     *
     * Guarded on a flag rather than on `world.spiral !== 0`, which is what
     * the first fix used and which never fired once: the running branch
     * writes `Math.max(0, this.life)`, so by the frame the sweep ends the
     * field it was testing had already reached zero on its own.
     */
    if (!this.restored) {
      this.restored = true;
      world.spiral = 0;
      s.aim = this.from;
      s.targetAim = this.from;
      s.gripAngle = this.grip;
    }
    // ...and the closed circle fades rather than vanishing on the frame.
    this.settle -= dt;
    s.sweepFade = clamp(this.settle / CFG.spiral.settle, 0, 1);
    if (this.settle <= 0) {
      s.sweepFade = 0;
      this.dead = true;
    }
  }

  draw(ctx, world) {
    const P = CFG.spiral;
    const s = world.shooter;
    const running = this.life > 0;
    const k = clamp(this.t / P.life, 0, 1);
    const fade = running
      ? Math.min(1, this.t / 0.16)
      : clamp(this.settle / P.settle, 0, 1);
    if (fade <= 0) return;
    const TONE = '#ff7a1a';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, TONE, s.x, s.y, 90 + k * 70, 0.2 * fade);

    /*
     * The trail is the swept path itself, wound outward.
     *
     * The first draft drew two thin arcs at a fixed radius and they were lost
     * against the turret's own furniture -- the aim ray, the lever and the
     * corruption ring all live in the same sixty pixels. The second drew a
     * ring, which is not what the ability is called. This walks back along
     * each arm's own history: every step is a shorter, dimmer, tighter piece
     * of the same curve, so what is on the screen is where the gun has been.
     */
    const STEPS = 26;
    const back = 2.9; // radians of sweep still shown behind each arm
    for (const arm of this.arms) {
      let px = 0;
      let py = 0;
      for (let i = 0; i <= STEPS; i++) {
        const f = i / STEPS;
        const a = arm.a - arm.dir * f * back;
        // How far through the sweep the arm was when it was there, so the
        // trail winds in behind it instead of tracking a fixed radius.
        const kk = Math.max(0, k - (f * back) / (P.turns * TAU));
        const rr = this.reach(kk);
        const x = s.x + Math.cos(a) * rr;
        const y = s.y + Math.sin(a) * rr;
        if (i > 0) {
          const w = (1 - f) ** 1.5;
          ctx.strokeStyle = rgba(TONE, (0.12 + 0.5 * w) * fade);
          ctx.lineWidth = 1 + 5.5 * w;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        px = x;
        py = y;
      }
      // The leading edge, where the rounds are actually leaving.
      const hx = s.x + Math.cos(arm.a) * this.reach(k);
      const hy = s.y + Math.sin(arm.a) * this.reach(k);
      drawGlow(ctx, '#ffd9a0', hx, hy, 34, 0.55 * fade);
      if (running) {
        // ...and the line from the muzzle out to it, so the two read as one
        // machine rather than as a turret and a separate spinning thing.
        ctx.strokeStyle = rgba(TONE, 0.3 * fade);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      }
    }
    if (running) drawGlow(ctx, '#ffd9a0', s.muzzleX, s.muzzleY, 28, 0.5 * fade);
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
    show: 0.85, // seconds this is worth watching -- see Hud.recede()
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
      /*
       * Three rings on three clocks, not two on one.
       *
       * PULSE is the most-pressed thing in the game -- seven seconds, always
       * owned, and the only answer to something on the mount -- and it was
       * over in under three tenths of a second. Measured on a still field,
       * four hundred milliseconds after a PULSE there was no evidence on the
       * screen that anything had happened.
       *
       * The fast pair stay, because the punch is the point. What is added is
       * a slow ring that walks out to the blast's real edge over a second, so
       * the reach it actually has is visible after the shove has landed -- and
       * a held bloom on the turret itself, which is the thing that just did
       * it.
       */
      ring(s.x, s.y, 20, 360, 0.42, '#59e0ff', 6);
      ring(s.x, s.y, 10, 220, 0.28, '#ffffff', 2.4);
      // ...and the reach, held. 340 is the blast radius above, so the ring
      // that stays is exactly the line the shove reached.
      world.effects.push(new Shock(s.x, s.y, 340, '#59e0ff'));
      ripple(s.x, s.y, 1.5, 800);
      shake(10);
      flash(0.18, '#bdf0ff');
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU);
        spark(s.x + Math.cos(a) * 30, s.y + Math.sin(a) * 30, Math.cos(a) * rand(300, 700), Math.sin(a) * rand(300, 700), '#9fe8ff', 0.4, 2.6);
      }
      /*
       * ...and a second, slower shell of embers behind the first, thrown at
       * a third of the speed. The original set all cleared the screen
       * together at the same moment, which is what made the whole thing read
       * as a single frame rather than as a blast with a wake.
       */
      for (let i = 0; i < 14; i++) {
        const a = rand(0, TAU);
        spark(s.x + Math.cos(a) * 46, s.y + Math.sin(a) * 46,
          Math.cos(a) * rand(90, 240), Math.sin(a) * rand(90, 240), '#bdf0ff', 1.1, 2);
      }
      audio.ability('pulse');
    },
  },
  {
    id: 'fan',
    show: 0.7, // seconds this is worth watching -- see Hud.recede()
    name: 'HAIL',
    color: '#7cffb2',
    cooldown: 5,
    icon: ICON.fan,
    hint: 'HAIL — 25 pellets in a tight cone.',
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
      /*
       * The cast, at the barrel. Twenty-five pellets leaving at once was
       * twenty-five muzzle flashes on top of each other and no single event
       * -- so the cone itself is drawn once: a wedge of embers thrown along
       * the spread, and a bloom where they all came from.
       */
      for (let i = 0; i < 10; i++) {
        const a = s.aim + ((i / 9) - 0.5) * arc;
        spark(s.muzzleX, s.muzzleY, Math.cos(a) * 420, Math.sin(a) * 420, '#c8ffe2', 0.22, 2.4);
      }
      dot(s.muzzleX, s.muzzleY, 0, 0, '#e6fff2', 0.16, 20);
      ring(s.muzzleX, s.muzzleY, 6, 70, 0.24, '#7cffb2', 2.4);
      s.recoil = 1;
      shake(4);
      audio.ability('fan');
    },
  },
  {
    id: 'lance',
    show: 1.0, // seconds this is worth watching -- see Hud.recede()
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
    show: 2.2, // seconds this is worth watching -- see Hud.recede()
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
    show: 1.25, // seconds this is worth watching -- see Hud.recede()
    name: 'PRISM',
    color: '#ff6beb',
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
    show: 1.1, // seconds this is worth watching -- see Hud.recede()
    name: 'STASIS',
    color: '#8fabff',
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
    show: 1.0, // seconds this is worth watching -- see Hud.recede()
    name: 'DECOY',
    color: '#ff616e',
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
    id: 'spiral',
    show: 3.5, // the whole sweep -- see Hud.recede()
    name: 'SPIRAL',
    color: '#ff7a1a',
    cooldown: 20,
    icon: ICON.spiral,
    hint: 'SPIRAL — the barrel comes off its target and turns, firing all the way round.',
    run(world) {
      world.effects.push(new Spiral(world));
      ring(world.shooter.x, world.shooter.y, 16, 220, 0.4, '#ff7a1a', 3);
      shake(3);
      audio.ability('lance');
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
    // A second use, and only a second: the roll already offers each of these
    // once, and this makes that true of the granting as well rather than only
    // of the offering.
    if (s.max >= 2) return false;
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
   * Takes an unlocked button away for a while, preferring
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
    // STANDING ORDER shortens every cooldown. HASTE used to halve them for a
    // while; it was an ALLOCATION boost and went with that system, but the
    // read on `world.haste` stayed behind on a field nothing writes.
    const scale = world.up.cooldown;
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
