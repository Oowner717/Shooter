/*
 * ORDINAL.
 *
 * Everything else on the field is something the simulation emitted. This is
 * the thing that has been counting it, and it arrives through a hole you paid
 * to open rather than down the field like everything else.
 *
 * The shape is the fight. Two square frames, one inside the other and turning
 * against it, built out of TALLY segments that stop rounds. A core sits dead
 * still at the centre and cannot be touched except through a hole in both
 * frames at once. You do not aim at the core -- you grind the frame open and
 * wait for your holes to line up, which they do and undo continuously because
 * the two frames turn at different rates. That is what makes the fight work
 * on auto aim without being a hold-the-trigger: the assist shoots what is
 * nearest, and the field decides when a shot gets through.
 *
 * The garrison is not part of the structure. DIGITs are sitting inside the
 * frame, parked, out of the world entirely -- unshootable, not colliding, not
 * steering. Break a panel and the ones behind it leave through the hole, and
 * from that moment they are ordinary objects with ordinary appetites. Nothing
 * about the frame governs them again.
 *
 * Three stages, read off the core's health, and each one changes the shape of
 * the problem rather than the size of it:
 *
 *   I    both frames turn slowly. Open the outer one, then the inner one.
 *   II   the frames speed up and the inner one reverses, so an alignment you
 *        learned stops being the alignment. ORDINAL starts repairing panels,
 *        so a hole is no longer permanent and a second garrison walks out.
 *   III  the frames strobe, and the core stops waiting: it throws DIGITs out
 *        of itself on a clock.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { explode, ring, ripple, spark, shake } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';

const O = () => CFG.ordinal;

/** Where a segment sits on a square frame, in the frame's own unturned space. */
function slotAt(half, per, side, i) {
  // Along one edge, inset half a step at each end so corners are not doubled.
  const t = (i + 0.5) / per - 0.5; // -0.5 .. 0.5
  const along = t * 2 * half;
  switch (side) {
    case 0: return [along, -half, 0]; // top, bar runs horizontally
    case 1: return [half, along, Math.PI / 2]; // right
    case 2: return [-along, half, 0]; // bottom
    default: return [-half, -along, Math.PI / 2]; // left
  }
}

export class Ordinal {
  constructor(world) {
    const C = O();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.t = 0;
    this.arriving = C.arrive;
    this.stage = 1;
    this.stageT = 0;
    this.dying = 0;
    this.done = false;
    this.repairT = 0;
    this.burstT = 0;
    this.flare = 0; // white bloom on a stage change or a repair
    this.beams = []; // repair beams, drawn from the core to what it is mending

    // The two frames. `spin` is signed and multiplied by the stage.
    this.rings = C.rings.map((r) => ({ ...r, angle: r.turn, panels: [] }));

    // The core, a real body so a round that gets through simply hits it.
    this.core = this.body('ordinal', this.x, this.y);
    world.enemies.push(this.core);

    for (const ring of this.rings) {
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < ring.per; i++) {
          // Sized so the segments of a side meet: see the note on rings in
          // CFG.ordinal. A frame with gaps in it is not a frame.
          const p = this.body('tally', this.x, this.y, ring.half / ring.per);
          p.slot = slotAt(ring.half, ring.per, side, i);
          ring.panels.push(p);
          world.enemies.push(p);
        }
      }
    }

    /*
     * The garrison, parked. These are not in world.enemies and not in the
     * broadphase: a DIGIT inside the frame cannot be shot, cannot be hit by a
     * blast and does not push anything. It rides its slot until a hole opens
     * beside it, and joining the world is the whole of what being released
     * means.
     */
    this.parked = [];
    this.wave = 0;
    this.garrison(C.garrison[0]);

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  /** One of ORDINAL's bodies: fixed in place, off the ledger, off the tally. */
  body(id, x, y, r) {
    const e = new Enemy(TYPE_BY_ID[id], x, y, { staged: false, spawnIn: 0.9, r });
    e.counts = false; // it is not one of the five hundred
    e.mass = Infinity;
    e.invMass = 0;
    e.cruise = 0;
    e.accel = 0;
    return e;
  }

  /** Fill the empty slots of the frame with DIGITs, parked. */
  garrison(n) {
    const C = O();
    const outer = this.rings[0];
    for (let k = 0; k < n; k++) {
      const d = new Enemy(TYPE_BY_ID.digit, this.x, this.y, { staged: false, spawnIn: 0 });
      d.counts = false;
      // Between the two frames, spread round the corridor.
      const a = (k / n) * TAU + rand(-0.2, 0.2);
      const rr = (C.rings[0].half + C.rings[1].half) * 0.5 * rand(0.82, 1.02);
      d.berth = { a, rr };
      d.guard = outer.panels[(k * 3 + this.wave) % outer.panels.length];
      this.parked.push(d);
    }
    this.wave++;
  }

  get coreFrac() {
    return this.core.dead ? 0 : clamp(this.core.hp / this.core.maxHp, 0, 1);
  }

  /** Alive segments over the total, per frame — what the bar's ticks show. */
  shellFrac(i) {
    const ps = this.rings[i].panels;
    return ps.filter((p) => !p.dead).length / ps.length;
  }

  /** Put every panel where its frame says it is, this frame. */
  place(dt) {
    const spin = O().spin[this.stage - 1] * (this.dying > 0 ? 3.4 : 1);
    for (const ring of this.rings) {
      ring.angle += ring.spin * spin * dt;
      const c = Math.cos(ring.angle);
      const s = Math.sin(ring.angle);
      for (const p of ring.panels) {
        if (p.dead) continue;
        const [ox, oy, bar] = p.slot;
        p.x = this.x + ox * c - oy * s;
        p.y = this.y + ox * s + oy * c;
        p.angle = bar + ring.angle;
        p.vx = 0;
        p.vy = 0;
        p.av = 0;
      }
    }
    this.core.x = this.x;
    this.core.y = this.y;
    this.core.vx = 0;
    this.core.vy = 0;
  }

  /**
   * A parked DIGIT leaves when the panel it is sitting behind is gone -- or
   * when a third of the outer frame is, because a garrison does not wait
   * politely behind the one door it was assigned.
   */
  releaseCheck(world) {
    const open = 1 - this.shellFrac(0);
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const d = this.parked[i];
      const doorOpen = !d.guard || d.guard.dead;
      if (!doorOpen && open < 0.34) continue;
      this.parked.splice(i, 1);
      // It leaves through its own berth, outward, and then it is on its own.
      const a = d.berth.a;
      d.vx = Math.cos(a) * rand(150, 250);
      d.vy = Math.sin(a) * rand(150, 250);
      d.spawnIn = 0.25;
      d.thrown = 0.35;
      world.enemies.push(d);
      spark(d.x, d.y, d.vx * 0.4, d.vy * 0.4, TYPE_BY_ID.digit.glow, 0.35, 2);
      audio.pop(0.7);
      if (open < 0.34) break; // one at a time when the door is not theirs
    }
  }

  /**
   * Bring one dead segment back at half health -- inner frame first, and
   * never past CFG.ordinal.repairCap of a frame. See the note there for what
   * an uncapped version measured like.
   */
  repair() {
    const cap = O().repairCap;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      if (this.shellFrac(i) >= cap) continue;
      const gone = ring.panels.filter((p) => p.dead);
      if (!gone.length) continue;
      const p = gone[(Math.random() * gone.length) | 0];
      p.dead = false;
      p.maxHp = TYPE_BY_ID.tally.hp;
      p.hp = Math.round(p.maxHp * O().repairHp);
      p.spawnIn = 0.5;
      p.flash = 1;
      this.beams.push({ p, t: 0.55 });
      return true;
    }
    return false;
  }

  /** The core throwing its own garrison out, stage III. */
  burst(world) {
    const C = O();
    this.garrison(C.burstOf);
    const fresh = this.parked.splice(-C.burstOf, C.burstOf);
    for (const d of fresh) {
      const a = rand(0, TAU);
      d.x = this.x + Math.cos(a) * (C.coreR + 6);
      d.y = this.y + Math.sin(a) * (C.coreR + 6);
      d.vx = Math.cos(a) * rand(320, 430);
      d.vy = Math.sin(a) * rand(320, 430);
      d.thrown = 0.5;
      d.spawnIn = 0.2;
      world.enemies.push(d);
    }
    ring(this.x, this.y, C.coreR, C.coreR * 4.5, 0.35, TYPE_BY_ID.ordinal.glow, 4);
    this.flare = 1;
    audio.boom();
  }

  update(world, dt) {
    const C = O();
    this.t += dt;
    this.flare = Math.max(0, this.flare - dt * 2.2);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }

    if (this.arriving > 0) {
      this.arriving -= dt;
      // It is not solid yet: nothing can be hurt while it is still coming out.
      for (const ring of this.rings) for (const p of ring.panels) p.hp = p.maxHp;
      this.core.hp = this.core.maxHp;
      this.place(dt * 0.35);
      background.setDread(1, 0);
      return;
    }

    if (this.dying > 0) {
      this.dying -= dt;
      this.place(dt);
      if (this.dying <= 0) this.done = true;
      return;
    }

    this.place(dt);
    this.releaseCheck(world);

    // ---- stages, off progress through the whole thing ----
    const frac = this.coreFrac;
    let want = 1;
    if (this.shellFrac(0) <= C.stageOuter) want = 2;
    if (frac <= C.stageCore) want = 3;
    if (want > this.stage) this.enterStage(world, want);

    const rep = C.repair[this.stage - 1];
    if (rep > 0) {
      this.repairT -= dt;
      if (this.repairT <= 0) {
        this.repairT = rep;
        if (this.repair()) audio.chime(320);
      }
    }
    const bur = C.burst[this.stage - 1];
    if (bur > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = bur; this.burst(world); }
    }

    // The sky keeps pace with the fight.
    // How far through the fight the sky thinks we are: both frames and the
    // core, weighted the way the health actually sits.
    const through = 1 - (this.shellFrac(0) * 0.3 + this.shellFrac(1) * 0.2 + frac * 0.5);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world);
  }

  enterStage(world, n) {
    const C = O();
    this.stage = n;
    this.stageT = 0;
    this.flare = 1;
    this.repairT = C.repair[n - 1];
    this.burstT = C.burst[n - 1];
    // Both frames reverse, so whatever alignment was learned is now wrong.
    for (const ring of this.rings) ring.spin *= -1;
    this.garrison(C.garrison[n - 1]);
    ring(this.x, this.y, 20, 520, 0.7, TYPE_BY_ID.ordinal.glow, 6);
    ring(this.x, this.y, 10, 300, 0.4, '#ffffff', 3);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  /**
   * The end. The frame goes first, one panel at a time over a beat, then the
   * core folds in and lets go of everything it was holding. Time slows for it
   * -- the one moment in the run when the field stops.
   */
  die(world) {
    const C = O();
    this.dying = C.endFor;
    world.timeScale = C.endSlow;
    world.bossSlow = C.endFor;
    for (const ring of this.rings) {
      for (const p of ring.panels) {
        if (p.dead) continue;
        p.dead = true;
        explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.4);
      }
    }
    for (const d of this.parked) d.dead = true;
    this.parked.length = 0;
    for (let i = 0; i < 5; i++) {
      ring(this.x, this.y, 10 + i * 30, 320 + i * 190, 0.5 + i * 0.16, i % 2 ? '#ffffff' : TYPE_BY_ID.ordinal.glow, 6 - i);
    }
    ripple(this.x, this.y, 3.4, 1400);
    shake(34);
    audio.boom();
    // Everything it was counting, paid out at once.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rand(-0.1, 0.1);
      const sp = rand(180, 420);
      world.drops.push(new Enemy(TYPE_BY_ID.ordinal, this.x, this.y, {
        drop: true, r: rand(3.4, 5.6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        energy: C.pay / 26,
      }));
    }
    background.surge(2);
  }

  /** Take everything of ORDINAL's off the field. */
  clear(world) {
    for (const ring of this.rings) for (const p of ring.panels) p.dead = true;
    this.core.dead = true;
    for (const d of this.parked) d.dead = true;
    this.parked.length = 0;
    background.setDread(0, 0);
    background.setFocus(null, null);
  }

  // ------------------------------------------------------------------ draw

  /**
   * Everything that is not a body: the cables between the segments of a frame,
   * the repair beams, the parked garrison behind the shell, and the halo.
   * The panels and the core draw themselves, like every other body.
   */
  draw(ctx, world) {
    const C = O();
    const T = TYPE_BY_ID.ordinal;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();

    // ---- the wormhole it comes out of ----
    if (arriving || this.dying > 0) {
      const g = arriving ? open : clamp(this.dying / C.endFor, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const rr = (60 + i * 90) * g;
        ctx.strokeStyle = rgba(T.glow, 0.5 * g * (1 - i * 0.18));
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, rr, rr * (0.42 + 0.5 * g), this.t * (0.6 + i * 0.2), 0, TAU);
        ctx.stroke();
      }
      drawGlow(ctx, T.glow, this.x, this.y, 300 * g, 0.5 * g);
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- the parked garrison, seen through the frame ----
    for (const d of this.parked) {
      const a = d.berth.a + this.rings[0].angle * 0.6;
      d.x = this.x + Math.cos(a) * d.berth.rr;
      d.y = this.y + Math.sin(a) * d.berth.rr;
      ctx.save();
      ctx.globalAlpha = 0.5 * open;
      d.draw(ctx, world);
      ctx.restore();
    }

    // ---- the frames themselves: a cable through the segments ----
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const live = ring.panels.filter((p) => !p.dead);
      if (live.length < 2) continue;
      ctx.strokeStyle = rgba(T.color, (0.2 + 0.25 * this.flare) * open);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      const c = Math.cos(ring.angle);
      const s = Math.sin(ring.angle);
      const corner = (sx, sy) => [this.x + sx * ring.half * c - sy * ring.half * s,
        this.y + sx * ring.half * s + sy * ring.half * c];
      const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- repair beams ----
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const k = clamp(b.t / 0.55, 0, 1);
      ctx.strokeStyle = rgba('#ffffff', 0.7 * k);
      ctx.lineWidth = 1 + k * 3;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.stroke();
    }

    // ---- the halo, and the stage strobe ----
    const pulse = 0.22 + 0.1 * Math.sin(this.t * (1.4 + this.stage)) + this.flare * 0.6;
    drawGlow(ctx, T.glow, this.x, this.y, C.rings[0].half * 2.1, pulse * open);
    if (this.stage >= 3 && this.dying <= 0) {
      // Stage III: spokes out of the core, turning the other way to the frame.
      const n = 6;
      ctx.strokeStyle = rgba(T.glow, 0.18 + 0.12 * Math.sin(this.t * 9));
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - this.t * 0.9;
        ctx.moveTo(this.x + Math.cos(a) * C.coreR, this.y + Math.sin(a) * C.coreR);
        ctx.lineTo(this.x + Math.cos(a) * C.rings[0].half * 1.5, this.y + Math.sin(a) * C.rings[0].half * 1.5);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

/**
 * Open the way. Spends one APERTURE, stops the field, and puts ORDINAL on it.
 * Returns false if there is nothing to spend or one is already up.
 */
export function openAperture(world) {
  if (world.boss || !world.aperture) return false;
  world.aperture--;
  // The field belongs to ORDINAL now. Anything already on it is left where it
  // is -- clearing it would rob the arrival of the thing it arrives into.
  world.boss = new Ordinal(world);
  world.bossStage = 1;
  ripple(world.shooter.x, world.shooter.y - CFG.ordinal.standoff, 2.6, 900);
  shake(20);
  audio.boom();
  return true;
}
