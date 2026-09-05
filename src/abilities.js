// Eight abilities. Each one is legible from its first use, and each one says
// what it is the first time it is used rather than in a manual.
//
// The turret is issued with PULSE and HAIL — one that shoves a crowd off and
// one that kills it. The other six are locked and handed over by the permanent
// tier of the offer system, along with the rounds and the mines. A second use of any one
// of them is bought the same way; until it is, an ability holds exactly one
// charge and behaves as a plain cooldown, with nothing extra drawn on it.

import { TAU, clamp, rand, spread, smoothstep, rgba, drawGlow, segClosest } from './util.js';
import { spark, dot, ring, ripple, shake, flash, Shock } from './fx.js';
import { CFG } from './config.js';
import { fire, clampAim } from './projectiles.js';
import { applyBlast, ENTRY_Y, drawIn } from './enemies.js';
import { audio } from './audio.js';
import { yardHold, holdBelow, shielded } from './yard.js';

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
  ward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 4.2v3.4M12 16.4v3.4M4.2 12h3.4M16.4 12h3.4" opacity=".75"/><path d="m14.6 9.4 3.1-3.1M6.3 17.7l3.1-3.1" opacity=".4"/></svg>',
};


// ------------------------------------------------------------------ effects

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
        /*
         * `staged` is still marching in and must not be yanked onto the field
         * early; `fizzle` is dissolving and `spent` is a dead boss's frame.
         * Grey is grabbed on purpose -- WELL drags EVERYTHING, and a knot of
         * salvage is a fair thing to spend it on.
         *
         * `fizzle` in particular is CLAUDE.md's build-210 trap from the other
         * side: `physicsStep` refuses to STEER a dissolving body, but this
         * writes `vx`/`vy` directly and `integrate` runs regardless -- so a
         * well up over a glitch fizzle hauled the whole dissolving field
         * across the screen.
         *
         * Motes carry none of these marks and are exempt from the throw
         * below: they already converge inside their own ceiling, and a mote
         * that coasts is a mote that has stopped drifting to the turret.
         *
         * `staged` is deliberately NOT here: most of a body's march in is on
         * screen, and a well that visibly fails to touch something beside it
         * is worse than one that pulls a straggler in early.
         */
        // ...and `shielded`, because the knot writes `vx`/`vy` by hand and
        // a body behind the wall is not the player's to move.
        if (e.dead || e.spent || e.fizzle || shielded(world, e)) continue;
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
        /*
         * ...and the well is allowed to actually move it.
         *
         * `integrate` clamps a body to `(cruise || 60) * 6` unless it has
         * been thrown, and field cruise speeds run 23 to 150 -- so the
         * collapse's 702 u/s reached about a third of the roster at all, and
         * the median type took 35% of what the crush asked for. The graphic
         * tightened and the knot kept closing at the same rate, which is the
         * "picture is not the thing" disease this file keeps catching.
         *
         * Refreshed rather than set: it lapses a fifth of a second after the
         * well lets go, and while it is up the body coasts instead of
         * steering, which is what being dragged into a singularity is.
         */
        if (!e.isDrop) e.thrown = Math.max(e.thrown || 0, 0.2);
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
      applyBlast(world, { x: this.x, y: this.y, r: 210, damage: 105, impulse: 1000, src: 'well' });
      // At 210, not 62% past it. Fourth of the same fault -- a ring fades and
      // thins as it grows, so drawn 10 -> 340 it crossed the edge that
      // actually hurt at a third of its brightness and two pixels wide.
      ring(this.x, this.y, 168, 222, 0.42, '#e0aaff', 5);
      ring(this.x, this.y, 0, 105, 0.26, '#ffffff', 2);
      world.effects.push(new Shock(this.x, this.y, 210, '#e0aaff'));
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
    /*
     * What the life ring is drawn against. It moves, because `life` does: a
     * second press adds nine seconds to whatever is left, so a ring drawn
     * against the constant would sit pinned at full for the first nine
     * seconds of an eighteen-second decoy and tell you nothing. Against the
     * high-water mark it starts full on every press and empties honestly.
     */
    this.maxLife = D.life;
    this.dead = false;
    this.flash = 0;
    // The re-projection pulse, so a press that landed on a standing decoy is
    // visibly a press that landed. Ages out over its own second.
    this.restacked = 0;
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

  /**
   * A second press, while this one is still standing.
   *
   * It adds to the clock rather than replacing the decoy, which is the whole
   * of the change: the previous behaviour was `expire`, and `expire` is not a
   * tidy dismissal -- it is the decoy's death, a 260-unit 150-damage blast
   * with a 900 shove, thrown into the middle of the pile the decoy had spent
   * its life gathering. Pressing the pile-holder twice scattered the pile.
   *
   * Time only. The plating is not repaired, deliberately: a decoy has two
   * clocks and this ability extends one of them, so the drawing carries both
   * and the player can see which one is actually going to end it.
   */
  restack(world) {
    const D = CFG.decoy;
    const before = this.life;
    this.life = Math.min(D.lifeCap, this.life + D.life);
    this.maxLife = Math.max(this.maxLife, this.life);
    // Nothing to show if it was already at the ceiling, and a pulse that
    // fires when nothing happened is a pulse that stops meaning anything.
    if (this.life <= before + 1e-6) return false;
    this.restacked = 1;
    ring(this.x, this.y, this.r * 0.5, this.r * 6, 0.42, '#59e0ff', 3);
    ripple(this.x, this.y, 0.8, 380);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      spark(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
        Math.cos(a) * rand(60, 200), Math.sin(a) * rand(60, 200),
        '#9be7ff', rand(0.2, 0.45), 2);
    }
    shake(4);
    audio.ability('pulse');
    return true;
  }

  expire(world) {
    if (this.dead) return;
    this.dead = true;
    const B = CFG.decoy.blast;
    applyBlast(world, { x: this.x, y: this.y, r: B.r, damage: B.damage, impulse: B.impulse, src: 'decoy' });
    // At the radius, not half again past it. It ran to `B.r * 1.5`, and a
    // ring fades and thins as it grows, so it crossed the edge that actually
    // hurt at a third of its brightness and two pixels wide, then swept
    // another 130 units over bodies nothing could touch. The `Shock` holds
    // the true edge after it, as PULSE's has since build 216.
    ring(this.x, this.y, B.r * 0.8, B.r * 1.06, 0.5, '#9be7ff', 6);
    ring(this.x, this.y, 0, B.r * 0.5, 0.3, '#ffffff', 2.4);
    world.effects.push(new Shock(this.x, this.y, B.r, '#9be7ff'));
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
    this.restacked = Math.max(0, this.restacked - dt * 1.4);
    this.life -= dt;
    if (this.life <= 0) this.expire(world);
  }

  /*
   * ---- how long it has left, on the machine rather than beside it ----
   *
   * A decoy has two clocks and the drawing carried one of them: an arc of
   * plating at `r + 7` for health, and nothing at all for the nine seconds.
   * The only tell for time was the last 1.6 of it fading out, which is a
   * warning that arrives after the decision it was meant to inform -- by then
   * the pile is already coming back at you and there is nothing to do about
   * it. And the ability now STACKS, so "how long has it got" is a question
   * the player can actually answer with a button, which makes showing the
   * answer worth twice what it was.
   *
   * It is expressed as the machine coming apart rather than as a second
   * gauge, on the argument that the hexagonal mount IS the design -- it is
   * the real turret's silhouette, which is the entire reason anything walks
   * at it. So:
   *
   *   THE SIX SIDES GO OUT ONE AT A TIME. Six segments, `lf * 6` of them lit,
   *   the one on the boundary dimming through as it goes. Countable at a
   *   glance without being a number, and the same six every time however
   *   long the decoy was stacked to, because `maxLife` is the high-water mark
   *   rather than the config constant.
   *
   *   WHAT IS LEFT GETS LESS SOLID. The dash runs from [5,4] at full to about
   *   [1.4,7.6] at empty, so the projection visibly stops holding together
   *   rather than simply losing pieces.
   *
   *   AND IT STOPS LOOKING AROUND. The barrel's sweep is scaled by `lf`, so a
   *   decoy near the end of its life goes still -- which is the tell that
   *   reads from furthest away, since motion is what the eye catches first.
   *
   * The health arc is unchanged and still at `r + 7`; a life ring would have
   * been a second arc of the same shape in a different colour, which is two
   * gauges to tell apart in a fight rather than one thing falling apart.
   */
  draw(ctx, world) {
    const k = this.born;
    const hpf = clamp(this.hp / this.maxHp, 0, 1);
    const going = clamp(this.life / 1.6, 0, 1);
    const lf = clamp(this.life / Math.max(1e-6, this.maxLife), 0, 1);
    const re = this.restacked;
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
    ctx.lineWidth = 2 + re * 1.4;
    // Solid at full, gappy at the end: the projection stops holding together
    // as well as losing pieces.
    ctx.setLineDash([1.4 + 3.6 * lf, 4 + 3.6 * (1 - lf)]);
    // Six sides, each its own path, because they go out one at a time. `lit`
    // is how many are still whole; the one straddling the boundary carries
    // the fraction, so the countdown is smooth and still countable.
    const lit = lf * 6;
    for (let i = 0; i < 6; i++) {
      const held = clamp(lit - i, 0, 1);
      // Never zero: a side that vanished outright would leave a shape that is
      // not a hexagon, and the silhouette is the whole point of the thing.
      ctx.strokeStyle = rgba('#9be7ff', (0.1 + 0.8 * held) * (1 + re * 0.5));
      const a0 = -Math.PI / 2 + (i / 6) * TAU;
      const a1 = -Math.PI / 2 + ((i + 1) / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * this.r, Math.sin(a0) * this.r);
      ctx.lineTo(Math.cos(a1) * this.r, Math.sin(a1) * this.r);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba('#9be7ff', 0.9);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.42, 0, TAU);
    ctx.stroke();
    // The barrel, swinging as if it were looking for something. Off
    // world.time, which is also why the `spin` this class used to carry had
    // no reader: `run` allows exactly one decoy, so there is no lockstep to
    // break.
    ctx.save();
    /*
     * ---- the barrel pointed LEFT for its whole life ----
     *
     * This was `rotate(-Math.PI / 2 + sweep)`, copying the real turret's
     * convention without copying the frame it is a convention IN. The machine
     * draws its barrel along local +x and turns it by `aim`, which is -PI/2
     * for straight up. The decoy draws its barrel along local -y -- already
     * up -- and then applied the same -PI/2 on top, and `rotate(-PI/2)` sends
     * local -y to world -x. So the stand-in for the turret stood there aiming
     * across the field at nothing, at ninety degrees to the thing it exists to
     * impersonate, and the drawing's own comment says why that matters:
     * anything walking at it should be walking at something that looks like
     * what it was walking at before.
     *
     * Found by measurement rather than by eye, and only because it fouled
     * something else: the case below reads the six sides of the mount, and one
     * of them -- the left edge, side 4 -- would not dim at any life however far
     * the clock ran down. It was the barrel lying along it. Measured either
     * way, in two nineteen-pixel windows the same distance out from the mount:
     * 16 lit above and 70 to the left before, 70 above and 16 to the left
     * after. The 16 is the ambient glow, which reaches 3.4 radii and is in both
     * windows whatever the barrel does.
     *
     * The sweep is all that is left, and it is scaled by what the decoy has
     * left: a decoy near the end of its life goes still, which is the tell
     * that carries furthest since motion is what the eye takes first.
     */
    ctx.rotate(Math.sin(world.time * 1.3 + this.born) * 0.5 * lf);
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
    ctx.strokeStyle = rgba('#59e0ff', (0.3 + re * 0.45) * (1 - sweep));
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, this.r + 10 + sweep * 150, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * WARD. A shell round the turret, up for a few seconds.
 *
 * Two halves, and they answer different things. The SURFACE cuts anything
 * that crosses it, once per crossing with a short refractory -- so it is a
 * wall, not a patch of ground, and a body that walks through it pays for
 * walking through it rather than for standing near it. The ARCS take the
 * nearest bodies within a quarter again of the shell every fraction of a
 * second, which is what
 * answers something already on the turret and what makes the ability worth
 * pressing before anything has arrived.
 *
 * Rides in `world.effects` like every other ability effect. It does not touch
 * the barrel, the aim or the round -- SPIRAL owned all three and that is most
 * of why it was replaced.
 */
/*
 * A cold near-white, and the only one in the bar.
 *
 * The first pass used #8ef0ff, which is 11.7 dE from PULSE's #59e0ff -- two
 * cyan buttons side by side on an eight-slot strip, and the suite's own
 * colour case says 25 is the floor. Every saturated hue is taken (cyan,
 * green, amber, violet, magenta, periwinkle, red), so WARD takes the one
 * register nothing else uses: hard light rather than a colour.
 */
const TONE_WARD = '#e8f0ff';
/*
 * ...and the two the CHARGE is drawn in. The shell is structure and reads as
 * hard light; what runs along it is electricity and has to read as hotter
 * than the thing carrying it, or the surface looks inert.
 */
const TONE_ARC_HOT = '#ffffff';
const TONE_ARC_SOFT = '#8fd4ff';

class Ward {
  constructor(world) {
    const P = CFG.ward;
    const up = world.up;
    this.t = 0;
    this.life = P.life;
    this.dead = false;
    this.r = P.r * (up.wardR || 1);
    this.cut = P.cut * (up.wardCut || 1);
    // Snapshotted with the surface's, not read live. They disagreed: buying
    // EDGED while a shell was up moved the arcs and not the cut.
    this.arcDamage = P.arc.damage * (up.wardCut || 1);
    this.arcs = P.arc.n + (up.wardArcs || 0);
    this.next = P.arc.every;
    /*
     * Who has been cut lately, and when. A body resting exactly on the
     * surface would otherwise be billed every frame -- 60 times a second at
     * `cut` apiece, which is not a wall, it is a blender. Keyed by the body
     * and weak, so a shell up through a wave that churns hundreds of them
     * does not carry every corpse to the end of it.
     */
    this.seen = new WeakMap();
    /*
     * Which side of the surface each body was on last frame. A CROSSING is
     * the sign changing; without this the shell would cut whatever happened
     * to be near it rather than what went through it.
     */
    this.side = new WeakMap();
    this.lastRr = -1; // last frame's surface radius, so a crossing the WALL
                      // made is told from one a body made
    this.flash = 0; // the surface lighting where something just came through
    this.hits = []; // {a, t} -- where, so the shell is marked where it was hit
    this.bolts = []; // {x0,y0,x1,y1,t} -- the arcs, drawn for a moment
    /*
     * ...and the discharge that runs ALONG the surface, which is what says
     * the thing is live rather than merely present. `{ a, span, dir, t, seed }`
     * -- where it started, how far round it reaches, which way it is
     * crawling. Spawned on `this.crackle` whether or not anything is near:
     * a shell that only sparks when it is being touched reads as a wall that
     * happens to hurt, and this one is supposed to read as dangerous BEFORE
     * anything walks into it.
     */
    this.surges = [];
    this.crackle = 0;
    // ...and the charge that flickers the whole surface, on a much faster
    // clock than the old sine breath. Electricity does not breathe.
    this.jitter = 0;

    /*
     * HEAVE: one shove, on the frame the shell is made.
     *
     * Here rather than in `update` because "once, on the way up" has to be
     * once -- an update-side flag is a second thing that can go wrong, and
     * this constructor already runs exactly once. `throwOff` for the reason
     * CLAUDE.md gives: a press every eighteen seconds is a deliberate clear
     * and gets both halves of a throw, where SLUG at 1.5 rounds a second
     * gets neither.
     */
    if (up.wardPush) {
      applyBlast(world, {
        x: world.shooter.x, y: world.shooter.y,
        r: this.r,
        damage: 0,
        impulse: P.heave,
        throwOff: true,
        src: 'ward',
      });
      ring(world.shooter.x, world.shooter.y, this.r * 0.3, this.r * 1.06, 0.34,
        TONE_ARC_SOFT, 3.4);
      world.effects.push(new Shock(world.shooter.x, world.shooter.y, this.r,
        TONE_ARC_SOFT));
      for (let i = 0; i < 18; i++) {
        const a = rand(0, TAU);
        spark(world.shooter.x + Math.cos(a) * this.r * 0.5,
          world.shooter.y + Math.sin(a) * this.r * 0.5,
          Math.cos(a) * rand(260, 620), Math.sin(a) * rand(260, 620),
          TONE_ARC_SOFT, 0.34, 2.2);
      }
      shake(7);
    }
  }

  /** 0 while it stands up, 1 while it holds, back to 0 as it goes. */
  get open() {
    const P = CFG.ward;
    return Math.min(1, this.t / P.ramp) * Math.min(1, this.life / P.ramp);
  }

  update(world, dt) {
    const P = CFG.ward;
    const s = world.shooter;
    this.t += dt;
    this.life -= dt;
    this.flash = Math.max(0, this.flash - dt * 3.4);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      this.hits[i].t -= dt;
      if (this.hits[i].t <= 0) this.hits.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].t -= dt;
      if (this.bolts[i].t <= 0) this.bolts.splice(i, 1);
    }
    /*
     * The surface discharge. Two or three short arcs crawling round the shell
     * at any moment, each living about a fifth of a second -- so the surface
     * is never still and never the same shape twice, which is the whole of
     * "this is live". Their rate rises with `flash`, so the shell visibly
     * gets angrier for a moment after something crosses it.
     */
    for (let i = this.surges.length - 1; i >= 0; i--) {
      this.surges[i].t -= dt;
      if (this.surges[i].t <= 0) this.surges.splice(i, 1);
    }
    this.crackle -= dt * (1 + this.flash * 2.2);
    if (this.crackle <= 0 && this.surges.length < 5) {
      this.crackle = P.crackle * rand(0.55, 1.45);
      this.surges.push({
        a: rand(0, TAU),
        span: rand(0.22, 0.85),
        dir: Math.random() < 0.5 ? -1 : 1,
        t: rand(0.18, 0.34),
        max: 0.34,
        seed: Math.random() * 1000,
      });
    }
    // A fast, unsmooth flicker. The old surface breathed on a 3.1 rad/s sine,
    // which is what a shield does; this is what a live one does.
    this.jitter = 0.6 + 0.4 * Math.sin(this.t * 41) * Math.sin(this.t * 17.3);
    if (this.life <= 0) { this.dead = true; return; }

    const rr = this.r * this.open;
    /*
     * Whether the SURFACE moved this frame, which is the exact question --
     * both ramps, and the single frame either side of them where the clock
     * says one thing and the radius says another. Testing `t < ramp ||
     * life < ramp` instead is a frame out at each end.
     */
    const moved = rr !== this.lastRr;
    this.lastRr = rr;
    if (rr < 4) return;

    // ---- the surface ----
    for (const e of world.enemies) {
      /*
       * `spent` and `fizzle` for the reason CLAUDE.md gives: a boss's own
       * structure is still drawn through its ending and must not be shot at
       * or cashed in. `harmless` keeps grey grey.
       */
      if (e.dead || e.harmless || e.staged || e.spent || e.fizzle) continue;
      // ...and the wall, which the arcs loop below already honours: a shell
      // that reaches the line must not report cutting what is behind it.
      if (shielded(world, e)) continue;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      // Its EDGE against the surface, so a big body is met when it arrives
      // rather than when its centre does.
      const inside = d - e.r < rr;
      const was = this.side.get(e);
      this.side.set(e, inside);
      if (was === undefined || was === inside) continue;
      /*
       * ...and a crossing the SURFACE made does not count.
       *
       * `rr` is the radius times `open`, which ramps to 0 over the last third
       * of a second, so the shell sweeps inward through everything standing
       * in it on the way out -- and `recut` (0.55s) is long gone by then.
       * Every body inside was billed twice for one WARD, 226 damage at two
       * EDGEDs, at the moment the ring has already faded to nothing. The
       * config says the opposite in as many words: "a body that walks through
       * it pays for walking through it rather than for standing near it".
       *
       * The side is still recorded above, so a body that really does walk out
       * during the collapse is billed on the next frame it moves.
       */
      if (moved) continue;
      const last = this.seen.get(e) || -99;
      if (world.time - last < P.recut) continue;
      this.seen.set(e, world.time);
      const nx = dx / d;
      const ny = dy / d;
      e.applyDamage(world, this.cut, nx, ny, P.push, 0, 0, false, 'ward');
      this.flash = 1;
      this.hits.push({ a: Math.atan2(dy, dx), t: 0.4 });
      spark(s.x + nx * rr, s.y + ny * rr, nx * 240, ny * 240, TONE_WARD, 0.24, 2.2);
      audio.hit();
    }

    // ---- and the arcs ----
    this.next -= dt;
    if (this.next > 0) return;
    this.next = P.arc.every;
    const reach = rr * P.arc.reach;
    const near = [];
    for (const e of world.enemies) {
      if (e.dead || e.harmless || e.staged || e.spent || e.fizzle) continue;
      if (shielded(world, e)) continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d > reach) continue;
      near.push({ e, d });
    }
    if (!near.length) return;
    near.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(this.arcs, near.length); i++) {
      const e = near[i].e;
      const d = near[i].d || 1;
      const nx = (e.x - s.x) / d;
      const ny = (e.y - s.y) / d;
      e.applyDamage(world, this.arcDamage, nx, ny, 0, 0, 0, false, 'ward');
      // From the SURFACE, not from the turret: the shell is what is throwing
      // it, and a bolt starting at the machine would read as the gun firing.
      this.bolts.push({
        x0: s.x + nx * rr, y0: s.y + ny * rr, x1: e.x, y1: e.y, t: 0.16,
        seed: Math.random() * 1000,
      });
      spark(e.x, e.y, spread(120), spread(120), '#dff3ff', 0.22, 2);
    }
    audio.reflect();
  }

  draw(ctx, world) {
    const s = world.shooter;
    const k = this.open;
    if (k < 0.02) return;
    const rr = this.r * k;
    const t = this.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /*
     * The shell: a thin bright surface with a soft interior behind it. It is
     * drawn AT the radius it cuts at -- the whole point of the effect is that
     * you can see where the line is, and a ring that fades as it grows would
     * be dimmest exactly where the line matters. See CLAUDE.md.
     */
    const beat = this.jitter;
    drawGlow(ctx, TONE_WARD, s.x, s.y, rr * 0.96, (0.1 + this.flash * 0.12) * k);
    ctx.strokeStyle = rgba(TONE_WARD, (0.44 + beat * 0.22 + this.flash * 0.4) * k);
    ctx.lineWidth = 2.2 + this.flash * 2.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr, 0, TAU);
    ctx.stroke();
    // ...and a second, fainter line just inside it, so the surface has
    // thickness rather than being a drawn circle.
    ctx.strokeStyle = rgba(TONE_WARD, 0.18 * k);
    ctx.lineWidth = 6 + beat * 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, rr - 5, 0, TAU);
    ctx.stroke();

    /*
     * ---- the discharge, crawling along the surface ----
     *
     * This is the part that says the shell is DANGEROUS rather than merely
     * present. A circle with a soft glow behind it is a bubble; a circle with
     * something crawling round it that is never the same shape twice is a
     * live conductor, and the difference costs two strokes.
     *
     * Drawn ON the surface, jagged across it, in a hotter tone than the shell
     * itself -- so the shell reads as the structure and the crackle reads as
     * the charge the structure is carrying. Each arc travels round while it
     * lives, which is what stops the effect being a texture.
     */
    for (const g of this.surges) {
      const f = Math.max(0, g.t / g.max);
      const lead = g.a + g.dir * (1 - f) * g.span * 1.6;
      const seg = 7;
      const wob = 0.13 + f * 0.1;
      for (const [tone, alpha, width] of [
        [TONE_ARC_SOFT, 0.30 * f * k, 4.2],
        [TONE_ARC_HOT, 0.95 * f * k, 1.5],
      ]) {
        ctx.strokeStyle = rgba(tone, alpha);
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) {
          const u = i / seg;
          const a = lead + g.dir * u * g.span;
          // Off the surface by a hair, alternating, so it reads as arcing
          // across the shell rather than tracing it.
          const off = i === 0 || i === seg ? 0
            : Math.sin(g.seed + i * 2.7) * rr * wob * 0.12;
          const rad = rr + off;
          const px = s.x + Math.cos(a) * rad;
          const py = s.y + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // The head of the arc, which is the brightest thing on the shell.
      drawGlow(ctx, TONE_ARC_HOT, s.x + Math.cos(lead) * rr,
        s.y + Math.sin(lead) * rr, 7 + f * 5, 0.5 * f * k);
    }

    /*
     * The lattice: spokes from the machine to the surface, turning slowly.
     * This is what says the shell belongs to the turret rather than being
     * something the field did -- and it is what makes a still frame of it
     * read as a made object.
     */
    const spokes = 10;
    ctx.strokeStyle = rgba(TONE_WARD, 0.13 * k);
    ctx.lineWidth = CFG.hairline * 1.6;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + t * 0.42;
      ctx.moveTo(s.x + Math.cos(a) * rr * 0.34, s.y + Math.sin(a) * rr * 0.34);
      ctx.lineTo(s.x + Math.cos(a) * rr * 0.97, s.y + Math.sin(a) * rr * 0.97);
    }
    ctx.stroke();

    // Where something came through, marked on the surface for a moment.
    for (const h of this.hits) {
      const f = h.t / 0.4;
      const w2 = 0.22 + (1 - f) * 0.5;
      ctx.strokeStyle = rgba('#ffffff', 0.8 * f * k);
      ctx.lineWidth = 3.4 * f + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, h.a - w2, h.a + w2);
      ctx.stroke();
    }

    // ...and the arcs, drawn as a broken line rather than a straight one.
    for (const b of this.bolts) {
      const f = b.t / 0.16;
      ctx.strokeStyle = rgba('#eaf6ff', 0.9 * f);
      ctx.lineWidth = 1.6 + f * 1.4;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      const seg = 4;
      for (let i = 1; i <= seg; i++) {
        const u = i / seg;
        const jx = i === seg ? 0 : Math.sin(b.seed + i * 2.3) * 9;
        const jy = i === seg ? 0 : Math.cos(b.seed + i * 1.7) * 9;
        ctx.lineTo(b.x0 + (b.x1 - b.x0) * u + jx, b.y0 + (b.y1 - b.y0) * u + jy);
      }
      ctx.stroke();
      drawGlow(ctx, TONE_WARD, b.x1, b.y1, 16 * f + 6, 0.55 * f);
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
  applyBlast(world, { x, y, r: P.r, damage: P.damage, impulse: P.impulse, src: 'prism' });

  for (let i = 0; i < P.beams; i++) {
    const a = (i / P.beams) * TAU + rand(0, 0.3);
    const x1 = x + Math.cos(a) * P.beamLen;
    const y1 = y + Math.sin(a) * P.beamLen;
    world.effects.push(new Beam(x, y, x1, y1, SPECTRUM[i % SPECTRUM.length]));

    const sweep = (list) => {
      for (const e of list) {
        // The same guard the blast one line above this now carries. Not
        // `staged` and not `fizzle` -- see the note in LANCE's sweep.
        if (e.dead || e.spent) continue;
        const c = segClosest(x, y, x1, y1, e.x, e.y);
        const rr = e.r + 18;
        if (c.d2 > rr * rr) continue;
        e.applyDamage(world, P.beamDamage, Math.cos(a), Math.sin(a), 220, 0, 0, false, 'prism');
      }
    };
    sweep(world.enemies);
    sweep(world.drops);
  }

  /*
   * The seven rings end AT the blast, not 65% past it.
   *
   * They ran to `P.r * (1.05 + i*0.1)` -- 315 up to 495 against a blast that
   * stops at 300 -- and `drawFx` strokes a ring at `alpha = t` and
   * `width = w * t`, both running to nothing as it grows. So by the time each
   * one reached the radius that actually hurt it was at 0.05 to 0.41 alpha
   * and about a pixel wide, the brightest thing on screen was a knot in the
   * middle, and the wave the player watches sweep out carried on for another
   * 195 units over bodies that were never going to be touched. That is HE's
   * build-211 fault and PULSE's build-216 one for the third time.
   *
   * They land staggered rather than together -- 0.82 to 1.0 of the radius --
   * so the burst still opens as a wave, and the `Shock` holds the true edge
   * after they are gone, which is exactly what PULSE does.
   */
  for (let i = 0; i < SPECTRUM.length; i++) {
    ring(x, y, 8 + i * 6, P.r * (0.82 + i * 0.03), 0.45 + i * 0.05, SPECTRUM[i], 3);
  }
  world.effects.push(new Shock(x, y, P.r, '#ff6beb'));
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

/**
 * Highest-value target ahead of the turret, for auto-aimed abilities.
 *
 * The guard is `autoTarget`'s, because this is the same decision: `spent` and
 * `fizzle` are things that must not be shot (CLAUDE.md), and `harmless` is
 * grey. It skipped only `dead` and `staged`, so LANCE -- a twelve-second
 * ability whose hint says "the biggest threat" -- scored a DRIFT at 45.7
 * against a MOTE's 33.3 and could be spent on salvage, or, during a boss
 * ending, put 190 into the structure the outro is made of.
 */
function bestTarget(world) {
  let best = null;
  let score = -1;
  for (const e of world.enemies) {
    if (e.dead || e.staged || e.spent || e.fizzle || e.harmless) continue;
    // Nothing behind the wall is worth a press: it cannot be hurt.
    if (shielded(world, e)) continue;
    const s = e.r * 2 + e.hp * 0.3 - Math.hypot(e.x - world.shooter.x, e.y - world.shooter.y) * 0.14;
    if (s > score) { score = s; best = e; }
  }
  return best;
}

/** Centre of the densest knot of objects — where a singularity is worth it. */
function densestPoint(world) {
  // Grey counts -- WELL drags EVERYTHING into the knot and is worth pressing
  // on a field of salvage. `spent` and `fizzle` do not: one is a dead boss's
  // frame and the other is already dissolving.
  const list = world.enemies.filter((e) => !e.dead && !e.staged && !e.spent && !e.fizzle
    && !shielded(world, e));
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
      const up = world.up;
      /*
       * ONE radius, read by the blast, the picture and the intake alike.
       * They were three numbers: the blast scaled with SHOCKFRONT, the held
       * ring was a literal 340 under a comment claiming it was the same line,
       * and the intake was a flat 400. At two levels the blast reaches 574.6
       * -- so the ring was drawn at 59% of the true edge, and everything in
       * the 400-to-574 band was shoved outward and then not collected.
       */
      const R = 340 * up.pulseR;
      applyBlast(world, {
        x: s.x, y: s.y,
        r: R,
        src: 'pulse',
        damage: 58,
        impulse: 1050 * up.pulsePush,
        /*
         * A THROW, not a hit that happens to push. This is the game's one
         * answer to a body on the mount, and it was paying the stray-hit
         * fade and the speed cap like a bolt: measured, an ordinary rate of
         * fire took a BULWARK's separation from 6.38 units to 0.35, against
         * the 6.4 it needs to be released -- so the turret firing disarmed
         * the escape and the fuse kept closing through the press.
         */
        throwOff: true,
      });
      // ...and it draws the energy in. This is how the currency is collected:
      // objects drop it when they come apart, it drifts to the turret, and it
      // sits there until a PULSE takes it. INTAKE is the upgrade that stops
      // you having to ask.
      // ...never inside the blast. `CFG.energy.pulse` is authored a little
      // wider than the stock 340, and that promise has to survive SHOCKFRONT
      // or the widened blast flings energy out of the band that collects it.
      drawIn(world, Math.max(CFG.energy.pulse, R));
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
      // ...and these are the ONE radius too. They were literals -- 360 and
      // 220, written when 340 was the only radius there was -- so at two
      // SHOCKFRONTs the punch was drawn at 63% of the edge it actually had.
      ring(s.x, s.y, 20, R * 1.06, 0.42, '#59e0ff', 6);
      ring(s.x, s.y, 10, R * 0.65, 0.28, '#ffffff', 2.4);
      // ...and the reach, held, at the radius the shove actually reached.
      world.effects.push(new Shock(s.x, s.y, R, '#59e0ff'));
      // ...and the bloom on the machine that did it, which the note above has
      // promised since build 215 and which was never actually drawn.
      dot(s.x, s.y, 0, 0, '#dff6ff', 0.3, 34);
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
          // ...and it is HAIL's, not the loaded round's. `fire` defaults an
          // untagged projectile to `world.round`, which is right for the nine
          // things the rack fires and wrong for the two that are not rounds.
          src: 'fan',
          speed: rand(1000, 1230),
          r: 3,
          damage: 15,
          impulse: 34,
          life: 0.62,
          bounces: 0,
          color: '#7cffb2',
          trail: 0.03,
          /*
           * The same form SCATTER uses, and for the same reason: twenty-five
           * of these leave at once. Unnamed, they fell to `fire`'s default
           * muzzle -- two sparks and a dot APIECE, seventy-five particles on
           * one point -- which is precisely the blob the comment below says
           * this ability replaced with a drawn wedge, still being drawn
           * underneath it. The wedge is 11 particles against a budget of 620
           * scaled by quality, so on a busy field the authored thing is what
           * gets dropped and the accident is what survives. It landed the
           * same way: twenty-five generic hitBursts in one cone.
           */
          form: 'pellet',
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
    name: 'LANCE',
    color: '#ffd166',
    cooldown: 12,
    icon: ICON.lance,
    hint: 'LANCE — piercing beam, locked to the biggest threat.',
    run(world) {
      const s = world.shooter;
      const target = bestTarget(world);
      /*
       * Clamped, and written BEFORE the muzzle is read.
       *
       * `s.aim = a` was the one writer in the game that did not go through
       * `clampAim` -- every other one does (shooter.js, projectiles.js) --
       * and DRIFT sinks past the turret by design, so a target below the
       * barrel's own 77.9 degree limit is routine. The slew then chases
       * `targetAim`, which is the same illegal angle, and nothing ever puts
       * it back: the barrel sits under its stop and auto-fire shoots the
       * floor.
       *
       * And the muzzle was read a line too early, off the OLD bearing, so
       * the beam was drawn from where the barrel used to be while the damage
       * was swept from the turret's centre -- two different lines, 32 units
       * apart at the muzzle end. They are one line now: aim, then muzzle,
       * then draw and sweep from the same point.
       */
      const a = clampAim(target ? Math.atan2(target.y - s.y, target.x - s.x) : s.aim);
      s.aim = a;
      s.targetAim = a;
      const x0 = s.muzzleX;
      const y0 = s.muzzleY;
      const len = Math.hypot(world.width, world.height) * 1.2;
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      world.effects.push(new Beam(x0, y0, x1, y1, '#ffd166'));

      const hitList = (list) => {
        for (const e of list) {
          /*
          /*
           * `spent` for the reason CLAUDE.md gives: a boss's own frame is
           * still drawn through its ending and nothing may shoot it.
           *
           * NOT `staged`, and NOT `fizzle`. The audit asked for both. But
           * `staged` only clears once a body's top edge passes
           * `ENTRY_Y + entryDepth`, so most of the march down is on screen
           * and `resolveSegment` lets an ordinary round hit every bit of it;
           * and a dissolving body is still a physical body -- build 210 made
           * it stop STEERING, not stop existing, and `Enemy.destroy` is what
           * refuses to cash it in. A guard here would make a beam visibly
           * wash over a body and do nothing, which is the worse fault, and
           * every blast in the game would have to match it.
           */
          if (e.dead || e.spent) continue;
          const c = segClosest(x0, y0, x1, y1, e.x, e.y);
          const rr = e.r + 26;
          if (c.d2 > rr * rr) continue;
          e.applyDamage(world, 190, Math.cos(a), Math.sin(a), 1500, 0, 0, false, 'lance');
          spark(c.px, c.py, spread(300), spread(300), '#fff0c0', 0.3, 3);
        }
      };
      hitList(world.enemies);
      hitList(world.drops);

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
      // The chooser is allowed to point past the wall -- the crowd it is
      // reading is often up there -- and the knot is not allowed to go.
      const y = holdBelow(world, p.x, p.y, 40);
      world.effects.push(new Well(p.x, y));
      ring(p.x, y, 320, 30, 0.5, '#c77dff', 3);
      audio.ability('well');
    },
  },
  {
    id: 'prism',
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
        src: 'prism',
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
    color: '#8fabff',
    cooldown: 21,
    icon: ICON.stasis,
    hint: 'STASIS — objects freeze. Your shots do not.',
    run(world) {
      world.stasis = 4;
      // Everything but what is behind the wall: the freeze is an ability and
      // the enemy half is not the player's to hold still.
      for (const e of world.enemies) {
        if (shielded(world, e)) continue;
        e.vx *= 0.1; e.vy *= 0.1; e.av *= 0.1;
      }
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
    color: '#ff616e',
    cooldown: 24,
    icon: ICON.decoy,
    hint: 'DECOY — a turret that is not yours. They go for it instead.',
    run(world) {
      /*
       * A second press while one is up ADDS to its clock. It used to call
       * `expire` on the standing decoy -- which is not a dismissal, it is the
       * decoy's death: a 260-unit blast at 150 damage with a 900 shove, right
       * in the middle of the pile the decoy existed to hold. So the ability
       * whose whole job is keeping the field somewhere that is not on top of
       * you answered a second press by blowing the field back over you.
       *
       * Still one at a time, which was the original comment's point and is
       * still true; what changed is which one.
       */
      if (world.decoy && !world.decoy.dead) { world.decoy.restack(world); return; }
      const s = world.shooter;
      // A DECOY is the one friendly summon that is a physics body, and it is
      // the one the wall most obviously has to stop: its whole job is standing
      // where things are, and past the wall there is nothing to stand among.
      const top = Math.max(ENTRY_Y + 60, yardHold(world) + CFG.decoy.r);
      const d = new Decoy(s.x, holdBelow(world, s.x,
        clamp(s.y - CFG.decoy.ahead, top, s.y - 120), CFG.decoy.r));
      world.decoy = d;
      world.effects.push(d);
      ring(d.x, d.y, 6, 300, 0.5, '#59e0ff', 4);
      ripple(d.x, d.y, 1.2, 620);
      shake(7);
      audio.ability('pulse');
    },
  },
  {
    id: 'ward',
    name: 'WARD',
    color: '#e8f0ff',
    cooldown: 18,
    icon: ICON.ward,
    hint: 'WARD — a shell stands up round the turret. It cuts what crosses it and arcs at what is near it.',
    run(world) {
      const s = world.shooter;
      world.effects.push(new Ward(world));
      // Drawn AT the radius it will stand at, opening outward -- the ring is
      // the announcement of where the line is going to be.
      const r = CFG.ward.r * (world.up.wardR || 1);
      /*
       * ...and it has to be drawn AT that radius, which it was not.
       * `drawFx` strokes a ring at `alpha = t` and `width = w * t`, both
       * running to nothing as it grows, so a ring emitted from 18 out to `r`
       * was brightest at the muzzle and exactly invisible where the line was
       * going to stand. It opens just inside the radius now and drifts a
       * tenth past it as it dies -- CLAUDE.md's rule for HE's burst, which is
       * the same trap.
       */
      ring(s.x, s.y, r * 0.88, r * 1.1, 0.42, '#e8f0ff', 3.2);
      ring(s.x, s.y, r * 0.4, r * 0.62, 0.26, '#ffffff', 1.8);
      ripple(s.x, s.y, 0.9, r * 2.2);
      shake(4);
      audio.ability('stasis');
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
    this.slots = ABILITIES.map((def) => ({ def, cd: 0, used: false, max: 1, charges: 1 }));
  }

  reset() {
    for (const s of this.slots) {
      s.cd = 0; s.used = false; s.max = 1; s.charges = 1; s.cost = 0;
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

  /*
   * ---- the ability lock went in build 219 ----
   *
   * `lockRandom` took a button away for a while and was ORDINAL's SUBTRACT:
   * "PULSE is never on the table", "removing something already on cooldown
   * would cost the player nothing". It lost its one caller in BUILD 82,
   * "delete ORDINAL", and when ORDINAL was rebuilt the lock was never
   * rewired -- so for a hundred and thirty-six builds `s.locked` had no
   * writer and five readers that could never take their other branch:
   * `isLocked`, the `s.locked <= 0` term in `usable`, the decrement in
   * `update`, `world.abilityTaken` -> `Hud.flashTaken`, and `.ab.locked` in
   * the stylesheet. That is the `world.endless` shape CLAUDE.md records, and
   * its rule is to delete the flag rather than maintain the branch.
   *
   * ORDINAL has its own character now -- the frame, the DIGITs, the mends --
   * and it does not need a button taken away to have one.
   */

  usable(i) {
    const s = this.slots[i];
    return !!s && s.charges > 0;
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
    const free = !!world.debug.noCooldown;
    s.cost = s.def.cooldown * scale * (free ? 0 : 1);
    s.charges -= 1;
    // The clock is already running if this was a held charge; starting it over
    // would make the second use cost more than the first.
    if (s.cd <= 0) s.cd = s.cost;
    /*
     * NO COOLDOWN made every ability SINGLE USE, which is the opposite of
     * what the toggle says.
     *
     * The cost goes to 0, so `s.cd` stays 0, so `update`'s `if (s.cd <= 0)
     * continue` never reaches the line that hands a charge back -- and the
     * charge was already spent above. One press each and the whole bar was
     * dead until a restart. regress.mjs has a comment working around it
     * rather than a case failing on it, which is how it survived.
     */
    if (free) s.charges = s.max;
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
