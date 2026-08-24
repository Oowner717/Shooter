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
import { explode, ring, ripple, spark, shake, haul, flash } from './fx.js';
import { audio } from './audio.js';
import { shed } from './debris.js';
import { background } from './background.js';
import { registerAnomaly, makerOf, dressOf, anomalyOf } from './anomaly.js';

const O = () => CFG.ordinal;
/** The five numbers every boss's ending shares. See CFG.boss. */
const B = () => CFG.boss;

/*
 * What it says on the way in, and what it says once it is over.
 *
 * Held on an explicit clock rather than derived from the visual beats: those
 * are about what the frame is doing and these are about how long a sentence
 * takes to read, and tying them together is how the first line ended up on
 * screen for 1.44 seconds. Roughly eleven characters a second, which is a
 * comfortable pace for widely spaced caps, plus a beat to land on.
 *
 * Flat and observed, the same voice as the story: it is not threatening you,
 * it is telling you what it has been doing.
 */
const ARRIVAL = [
  { text: 'SOMETHING HAS STOPPED COUNTING.', hold: 3.4 },
  { text: 'IT HAS KEPT A TALLY SINCE BEFORE YOU ARRIVED.', hold: 4.2 },
  { text: 'IT WANTS TO SEE WHAT HAS BEEN SUBTRACTING.', hold: 4 },
  { text: 'ORDINAL', hold: 2.8 },
];

/*
 * ...and afterwards. Said over the wreck, once the field has stopped moving,
 * which is the only quiet the run ever gets.
 */
const OUTRO = [
  { text: 'THE COUNT IS BROKEN.', hold: 3.2 },
  { text: 'WHAT IS LEFT OF IT IS ON THE FLOOR IN FRONT OF YOU.', hold: 4.4 },
  { text: 'SOMETHING ELSE IS ALREADY COUNTING.', hold: 3.8 },
];
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

/*
 * The REMAINDER.
 *
 * ORDINAL has been counting since before you arrived, and when the count is
 * broken there is something left over. It is not energy: energy is what
 * objects are made of and there is a floor of it after every wave. This is
 * the one thing in the game there is exactly one of per ORDINAL, and the only
 * thing a RECAST can be paid for with.
 *
 * It rises out of the detonation, hangs for a beat where the core was so it
 * is seen, and then comes to the turret on its own. Nothing has to be done to
 * collect it -- missing the only drop of its kind because a thumb was
 * somewhere else would be a cruelty, not a challenge.
 */
class Remainder {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.x0 = x;
    this.y0 = y;
    this.t = 0;
    this.dead = false;
    this.taken = false;
  }

  update(world, dt) {
    this.t += world.dtRaw || dt; // its own clock: it outlives the slow-motion
    const hang = 0.9;
    if (this.t < hang) {
      this.y = this.y0 - (this.t / hang) * 26;
      return;
    }
    const k = clamp((this.t - hang) / B().riseFor, 0, 1);
    const e = k * k * (3 - 2 * k); // ease, so it leaves slowly and arrives fast
    const s = world.shooter;
    this.x = this.x0 + (s.x - this.x0) * e;
    this.y = (this.y0 - 26) + (s.y - (this.y0 - 26)) * e;
    if (k < 1 || this.taken) return;
    this.taken = true;
    this.dead = true;
    world.remainder = (world.remainder || 0) + 1;
    // Picked up by the HUD, which is the thing that can say so. Counted
    // rather than flagged, so two arriving in one frame both get said.
    world.remainderGained = (world.remainderGained || 0) + 1;
    ring(s.x, s.y, 6, 200, 0.5, '#ffe9ff', 4);
    ring(s.x, s.y, 2, 90, 0.3, '#ffffff', 2);
    ripple(s.x, s.y, 1.4, 420);
    audio.chime(880);
  }

  draw(ctx) {
    const T = TYPE_BY_ID.ordinal;
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 7);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, T.glow, 0, 0, 54 * pulse, 0.55);
    // a small hard diamond, turning, with a white core
    ctx.rotate(this.t * 1.6);
    ctx.strokeStyle = rgba('#ffd9f6', 0.95);
    ctx.fillStyle = rgba(T.color, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7.5, 0);
    ctx.lineTo(0, 11);
    ctx.lineTo(-7.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', pulse);
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, TAU);
    ctx.fill();
    // and a thin cross of light, so it reads at a glance across a busy field
    ctx.strokeStyle = rgba('#ffffff', 0.35 * pulse);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(22, 0);
    ctx.moveTo(0, -22); ctx.lineTo(0, 22);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}

/**
 * What every boss is, underneath.
 *
 * ORDINAL was written before there was a second one, so the parts of it that
 * are about *a* boss got tangled with the parts that are about counting.
 * This is the untangled half: the bodies, the captions, the arrival and the
 * death, in the shape all seven need them.
 *
 * ORDINAL takes the small mechanical parts from here and keeps its own
 * arrival and death, which are tuned to the second and measured. That is
 * deliberate: rewriting a fight that works, in order to share code with a
 * fight that does not exist yet, is how you break the one that works. A boss
 * written against this class gets the whole of it.
 */
export class Boss {
  constructor(world, n) {
    this.n = n; // which of the seven. See anomaly.js.
    this.t = 0;
    this.stage = 1;
    this.stageT = 0;
    this.dying = 0;
    this.done = false;
    this.flare = 0; // white bloom on a stage change or a mend
    this.beams = []; // mend beams, drawn from the core to what it is mending
    this.repairT = 0;
    this.burstT = 0;
    this.parked = [];
    this.arriving = 0;
    this.entry = 0;
  }

  /** One of this boss's bodies: fixed in place, off the ledger, off the tally. */
  body(id, x, y, r) {
    const e = new Enemy(TYPE_BY_ID[id], x, y, { staged: false, spawnIn: 0.9, r });
    e.counts = false; // it is not one of the five hundred
    e.mass = Infinity;
    e.invMass = 0;
    e.cruise = 0;
    e.accel = 0;
    return e;
  }

  get coreFrac() {
    return this.core.dead ? 0 : clamp(this.core.hp / this.core.maxHp, 0, 1);
  }

  /**
   * Step a caption script. One line at a time, each held for as long as it
   * takes to read, and the whole thing gets out of the way when it is done.
   */
  say(world, script, raw) {
    if (this.line === undefined) { this.line = 0; this.lineT = 0; }
    if (this.line >= script.length) return true;
    this.lineT += raw;
    const cur = script[this.line];
    world.bossLine = cur.text;
    if (this.lineT >= cur.hold) {
      this.lineT = 0;
      this.line++;
      if (this.line >= script.length) world.bossLine = null;
    }
    return this.line >= script.length;
  }

  /** Everything of this boss's that is a placed body. Overridden per boss. */
  parts() {
    return [];
  }

  /** The per-frame housekeeping every boss does before anything else. */
  tickCommon(world, dt) {
    this.flare = Math.max(0, this.flare - dt * 2.2);
    if (this.lineFor > 0) {
      this.lineFor -= world.dtRaw || dt;
      if (this.lineFor <= 0) world.bossLine = null;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
  }

  /**
   * Belt to the arrival's braces. A part joins world.enemies as it lands, but
   * anything that shortcuts the arrival -- a test setting `arriving = 0`, a
   * frame dropped under load -- would otherwise leave a boss standing there
   * with a structure nothing can see or shoot.
   */
  settle(world) {
    if (this.settled) return;
    this.settled = true;
    for (const p of this.parts()) {
      p.landed = true;
      if (p.hidden) continue;
      p.spawnIn = 0;
      if (!p.dead && !world.enemies.includes(p)) world.enemies.push(p);
    }
  }

  /**
   * A dead part, put back at part health -- and put back into the world.
   *
   * sweep() removes a dead body from world.enemies with a swap-and-pop, so
   * clearing `dead` on one the boss still holds a reference to revives it
   * *outside* the field: counted by the gauge, impossible to see or hit.
   * ORDINAL shipped that once; it is a law now.
   */
  revive(world, p, hpFrac) {
    p.dead = false;
    p.maxHp = p.type.hp;
    p.hp = Math.round(p.maxHp * hpFrac);
    p.spawnIn = 0.4;
    p.flash = 1;
    p.free = null;
    p.homing = 0;
    if (!world.enemies.includes(p)) world.enemies.push(p);
  }

  /**
   * The arrival, in four beats: the sky turns over, a hole opens, the thing
   * comes through it, and its structure assembles out of the dark.
   *
   * Nothing can be hurt for any of it, and the health is pinned rather than
   * merely ignored -- a stray round landing on a boss that has not finished
   * arriving is a fight that started before the player was looking.
   */
  arriveStep(world, raw, C, script, moods) {
    this.arriving -= raw;
    this.t += raw;
    const k = clamp(1 - this.arriving / C.arrive, 0, 1);
    this.entry = k;
    const [b1, b2, b3] = C.beats;

    for (const p of this.parts()) p.hp = p.maxHp;
    this.core.hp = this.core.maxHp;

    const unfold = k < b3 ? 0 : (k - b3) / (1 - b3);
    const all = this.parts();
    let popped = 0;
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (p.hidden) continue;
      const due = i / all.length;
      p.spawnIn = unfold > due ? 0 : 1;
      if (unfold > due && !p.landed) {
        p.landed = true;
        world.enemies.push(p);
        ring(p.x, p.y, p.r * 2.4, p.r * 0.6, 0.22, p.type.glow, 2);
        if (popped++ < 2) audio.pop(0.5);
      }
    }
    this.core.spawnIn = k < b2 ? 1 : clamp(1 - (k - b2) / (b3 - b2), 0, 1);
    this.place(raw * 0.5);

    background.setDread(clamp(k / b1, 0, 1), 0);
    background.setFocus(this.x, this.y);
    if (!this.moodSet && k >= b1 * 0.5) {
      this.moodSet = true;
      if (moods) background.setBossMoods(moods);
      background.setMood('boss');
    }

    const T = this.core.type;
    const beat = k < b1 ? 0 : k < b2 ? 1 : k < b3 ? 2 : 3;
    if (beat !== this.beatAt) {
      this.beatAt = beat;
      if (beat >= 1) {
        ring(this.x, this.y, 4, 120 + beat * 220, 0.4 + beat * 0.12, T.glow, 5 - beat);
        background.surge(1.4);
        shake(6 + beat * 5);
        audio.boom();
      }
    }
    this.say(world, script, raw);
    if (this.arriving <= 0) {
      this.entry = 1;
      world.bossLine = null;
      ring(this.x, this.y, 20, 640, 0.7, '#ffffff', 5);
      ripple(this.x, this.y, 2.6, 900);
      shake(22);
      audio.boom();
      background.surge(2);
    }
  }

  /**
   * The end, in four beats, on the real clock -- so the slow motion does not
   * stretch the sequence it is there to make readable.
   *
   *   ARREST      the structure stops dead and comes apart, piece by piece
   *   INFALL      the core takes everything loose on the field into itself
   *   DETONATION  and lets go of all of it in one frame
   *   AFTER       the REMAINDER rises out of what is left and comes to you
   */
  die(world, C) {
    this.dying = C.endFor;
    this.beat = 0;
    this.lineFor = 0;
    world.bossLine = null;
    this.snapped = 0;
    world.timeScale = B().endSlow;
    world.bossSlow = B().slowFor;
    for (const d of this.parked) d.dead = true;
    this.parked.length = 0;
    ring(this.x, this.y, 8, 240, 0.5, '#ffffff', 4);
    ripple(this.x, this.y, 2.4, 700);
    shake(20);
    audio.boom();
    background.surge(2);
  }

  dieStep(world, dt, C, outro) {
    if (this.blew) {
      if (this.outroAt === undefined) { this.outroAt = 0; this.line = 0; this.lineT = 0; }
      this.say(world, outro, world.dtRaw || dt);
    }
    const raw = world.dtRaw || dt;
    this.dying -= raw;
    this.beat += raw;
    const t = this.beat;
    const A = C.arrest !== undefined ? C.arrest : 0.7;
    const I = C.infall !== undefined ? C.infall : 1.1;
    if (t < A) { this.dieExtra(world, t / A); this.arrest(world, t / A); }
    else if (t < A + I) {
      this.arrest(world, 1);
      this.infall(world, raw, (t - A) / I, C);
    } else if (!this.blew) this.detonate(world, C);
    this.place(dt * 0.2);
    if (this.dying <= 0) this.done = true;
  }

  /** A hook for whatever a particular ending does on the way down. */
  dieExtra() {}

  /** ARREST: pieces snapping off, one after another rather than all at once. */
  arrest(world, k) {
    const all = this.parts().filter((p) => !p.dead && !p.hidden);
    const want = Math.ceil(all.length * clamp(k, 0, 1));
    while (this.snapped < want && all.length) {
      const p = all.shift();
      if (!p || p.dead) { this.snapped++; continue; }
      p.dead = true;
      this.snapped++;
      explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.5);
      ring(p.x, p.y, 2, p.r * 5, 0.3, p.type.glow, 2);
      for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU);
        spark(p.x, p.y, Math.cos(a) * rand(90, 260), Math.sin(a) * rand(90, 260),
          p.type.color, rand(0.3, 0.7), 2);
      }
    }
  }

  /** INFALL: the core taking the field into itself. */
  infall(world, dt, k, C) {
    const grab = (list) => {
      for (const e of list) {
        if (e.dead) continue;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = C.pull * k * dt / d;
        e.vx += dx * f;
        e.vy += dy * f;
      }
    };
    grab(world.enemies);
    grab(world.drops);
    grab(world.debris);
    if (Math.random() < 0.5) {
      const rr = 520 * (1 - k) + 40;
      ring(this.x, this.y, rr, rr * 0.2, 0.28, this.core.type.glow, 2);
    }
    shake(3 + k * 6);
  }

  /** DETONATION: one frame, everything at once, and a wreck that stays. */
  detonate(world, C) {
    const T = this.core.type;
    this.blew = true;
    flash(0.85, '#ffffff');
    for (let i = 0; i < 6; i++) {
      ring(this.x, this.y, 6 + i * 24, 300 + i * 240, 0.55 + i * 0.15,
        i % 2 ? '#ffffff' : T.glow, 7 - i);
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rand(-0.05, 0.05);
      const sp = rand(420, 900);
      spark(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, i % 3 ? T.color : '#ffffff',
        rand(0.5, 1.1), 3);
    }
    explode(this.x, this.y, C.coreR * 2, T.color, T.glow, 4);
    /*
     * The husk. Ordinary wreckage clears itself, which is right for a BULWARK
     * breaking mid-wave and wrong here: a boss that leaves an empty field
     * reads as having been deleted rather than broken. These are keeps.
     */
    for (const p of this.parts()) {
      shed(world, { x: p.x, y: p.y, r: p.r, vx: 0, vy: 0, type: p.type }, 2,
        { keep: true, size: 2 });
    }
    shed(world, { x: this.x, y: this.y, r: C.coreR, vx: 0, vy: 0, type: T }, 14,
      { keep: true, size: 1.9 });
    ripple(this.x, this.y, 4, 1500);
    shake(40);
    audio.boom();
    background.surge(2);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rand(-0.1, 0.1);
      const sp = rand(220, 520);
      world.drops.push(new Enemy(T, this.x, this.y, {
        drop: true, r: rand(3.4, 5.8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        energy: C.pay / 30,
      }));
    }
    world.remainderFrom = this.n;
    for (let i = 0; i < B().remainder; i++) {
      world.effects.push(new Remainder(this.x, this.y));
    }
  }

  /** Take everything of this boss's off the field. */
  clear(world) {
    for (const p of this.parts()) p.dead = true;
    this.core.dead = true;
    for (const d of this.parked) d.dead = true;
    this.parked.length = 0;
    background.setDread(0, 0);
    background.setFocus(null, null);
  }

  // --------------------------------------------------------------- draw

  /** The hole it comes out of, and falls back into. */
  drawHole(ctx, C, T, arriving) {
    if (!arriving && this.dying <= 0) return;
    const g = arriving
      ? 1 - clamp(this.arriving / C.arrive, 0, 1)
      : clamp(this.dying / C.endFor, 0, 1);
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

  /** The beams from the core to whatever it is mending. */
  drawBeams(ctx) {
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
  }
}

export class Ordinal extends Boss {
  constructor(world) {
    super(world, 1);
    const C = O();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.arriving = C.arrive;

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
          /*
           * Not on the field yet. The frames assemble on the last beat of the
           * arrival, segment by segment, and a panel joins the world at the
           * moment it snaps into its slot — so it is neither drawn nor
           * shootable before then, which is what makes the unfold read as the
           * thing being built rather than as forty sprites fading up.
           */
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

  /**
   * Fill the frame with DIGITs, parked behind particular segments.
   *
   * Each one is given a segment of its own and sits just inside it, so where
   * a DIGIT is, is a fact about the frame rather than a decoration: break
   * *that* panel and *that* DIGIT comes out of *that* hole. Spread across all
   * four sides in turn, so the garrison is on every side of ORDINAL and not
   * banked on one.
   *
   * A later wave garrisons the inner frame as well, which is what makes
   * opening the outer one stop being the whole answer.
   */
  garrison(n, deep = false) {
    const rings = deep ? this.rings : [this.rings[0]];
    for (let k = 0; k < n; k++) {
      const ring = rings[k % rings.length];
      const live = ring.panels.filter((p) => !p.dead);
      const pool = live.length ? live : ring.panels;
      // Round the sides in turn rather than at random: four sides, evenly.
      const guard = pool[(k * 7 + this.wave * 3) % pool.length];
      const d = new Enemy(TYPE_BY_ID.digit, this.x, this.y, { staged: false, spawnIn: 0 });
      d.counts = false;
      d.guard = guard;
      d.berth = rand(0.55, 0.8); // how far in from its segment it waits
      this.parked.push(d);
    }
    this.wave++;
  }

  /** Where a parked DIGIT is: just inside the segment it is waiting behind. */
  berthOf(d) {
    const g = d.guard;
    if (!g) return [this.x, this.y];
    return [this.x + (g.x - this.x) * d.berth, this.y + (g.y - this.y) * d.berth];
  }

  /** Every segment of both frames: what settle(), arrest() and clear() walk. */
  parts() {
    return this.rings.flatMap((r) => r.panels);
  }

  /** Alive segments over the total, per frame — what the bar's ticks show. */
  shellFrac(i) {
    const ps = this.rings[i].panels;
    return ps.filter((p) => !p.dead).length / ps.length;
  }

  /**
   * Everything the gauge needs to draw itself, and nothing about ORDINAL.
   *
   * The bar used to read CFG.ordinal directly and assume exactly two frames
   * with the segment counts written into the markup. GNOMON has one dial,
   * DYNAMO's shell is three pylons and TERMINUS has two rings, so the boss
   * describes its own gauge and the HUD builds whatever it is handed.
   *
   * `marks` are where the stages that are still ahead of you begin, on the
   * track they begin on -- the two ticks in the core bar. `seg` is the real
   * segment count of a shell, so a tick going out on that track is a panel
   * going out.
   */
  gauge() {
    const C = O();
    const arriving = this.arriving > 0;
    const d = dressOf(this.n);
    const stage = arriving ? 0 : this.stage;
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: this.rings.map((r, i) => ({
        label: i === 0 ? 'OUTER' : 'INNER',
        seg: r.panels.length,
        frac: this.shellFrac(i),
      })),
      marks: [
        { at: C.stageCore, past: !arriving && this.coreFrac <= C.stageCore },
        { at: C.stageDescend, past: !arriving && this.coreFrac <= C.stageDescend },
      ],
      bar: d.bar[Math.min(stage, d.bar.length - 1)],
    };
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
        // Thrown clear by CONVERGENCE: its own business until it is reeled in.
        if (p.free && !p.homing) { p.vx = 0; p.vy = 0; p.av = 0; continue; }
        const [ox, oy, bar] = p.slot;
        // `knot` draws every slot down onto the core; `homing` is a segment
        // easing back to wherever its slot has turned to while it was away.
        const grip = 1 - (this.knot || 0) * 0.94;
        const tx = this.x + (ox * c - oy * s) * grip;
        const ty = this.y + (ox * s + oy * c) * grip;
        if (p.homing) {
          const h = p.homing;
          p.x += (tx - p.x) * h * 0.3;
          p.y += (ty - p.y) * h * 0.3;
          if (h >= 1) { p.free = null; p.homing = 0; }
        } else {
          p.x = tx;
          p.y = ty;
        }
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
    // ...and the garrison rides the segment it is waiting behind.
    for (const d of this.parked) {
      const [bx, by] = this.berthOf(d);
      d.x = bx;
      d.y = by;
    }
  }

  /**
   * A parked DIGIT leaves when the segment it is waiting behind is gone. It
   * leaves *through that hole*, outward along the line from the core through
   * where the panel was, which is what makes breaking a particular part of
   * the frame a decision rather than a chore.
   *
   * The rest of the garrison does not wait politely behind one door forever:
   * once two thirds of the outer frame is open, whoever is left files out at
   * one a second through whatever is nearest.
   */
  releaseCheck(world, dt) {
    const wide = this.shellFrac(0) <= 0.34;
    this.impatient = Math.max(0, (this.impatient || 0) - dt);
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const d = this.parked[i];
      const own = !d.guard || d.guard.dead;
      if (!own) {
        if (!wide || this.impatient > 0) continue;
        this.impatient = 1;
      }
      this.parked.splice(i, 1);
      const [bx, by] = this.berthOf(d);
      d.x = bx;
      d.y = by;
      // Outward, along the line the hole is on.
      let ax = d.x - this.x;
      let ay = d.y - this.y;
      const ad = Math.hypot(ax, ay) || 1;
      ax /= ad; ay /= ad;
      d.vx = ax * rand(190, 280);
      d.vy = ay * rand(190, 280);
      d.spawnIn = 0.25;
      d.thrown = 0.4;
      d.guard = null;
      world.enemies.push(d);
      spark(d.x, d.y, d.vx * 0.4, d.vy * 0.4, TYPE_BY_ID.digit.glow, 0.35, 2);
      audio.pop(0.7);
      if (!own) break;
    }
  }

  /**
   * Bring one dead segment back at half health -- inner frame first, and
   * never past CFG.ordinal.repairCap of a frame. See the note there for what
   * an uncapped version measured like.
   */
  repair(world) {
    const cap = O().repairCap;
    /*
     * Which frame it mends, and it is not the same answer in both stages.
     *
     * II mends the inner frame first: that is the one between you and the
     * core, and having to reopen it is the stage. III mends the outer one
     * first instead, so the core stays exposed and the last stage is about
     * the core rather than about the frame all over again. Measured before
     * this: stage III ran 100 seconds of a 150-second fight, nearly all of it
     * shooting a mended inner frame while the core sat there.
     */
    const order = this.stage >= 3 ? [0, 1] : [1, 0];
    for (const i of order) {
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
      /*
       * Back into the world, not just back to alive.
       *
       * sweep() removes a dead body from world.enemies with a swap-and-pop,
       * so clearing `dead` on a segment ORDINAL still holds a reference to
       * resurrected it *outside* the field: it counted toward the shell
       * meter and could not be seen, hit or collided with. Measured on the
       * first build of this fight -- the outer frame climbed from 8% back to
       * 42% through stage III while nothing was actually there.
       */
      if (!world.enemies.includes(p)) world.enemies.push(p);
      this.beams.push({ p, t: 0.55 });
      return true;
    }
    return false;
  }

  /** The core throwing its own garrison out, stage III. */
  burst(world) {
    const C = O();
    const fresh = [];
    for (let k = 0; k < C.burstOf; k++) {
      const d = new Enemy(TYPE_BY_ID.digit, this.x, this.y, { staged: false, spawnIn: 0 });
      d.counts = false;
      fresh.push(d);
    }
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

  /**
   * The arrival, in four beats.
   *
   *   SKY      the substrate turns over and the field is empty for a moment.
   *            Nothing is drawn where ORDINAL will be; the announcement is
   *            that the world has changed colour.
   *   HOLE     a point of light, then a hole, widening.
   *   THROUGH  the core comes through it, from nothing to full size.
   *   UNFOLD   the frames assemble out of the dark, segment by segment,
   *            snapping outward into their slots.
   *
   * Nothing can be hurt for any of it, and the health is pinned rather than
   * merely ignored -- a stray round landing on a boss that has not finished
   * arriving is a fight that started before the player was looking.
   */
  arrive(world, raw) {
    const C = O();
    this.arriving -= raw;
    this.t += raw;
    const k = clamp(1 - this.arriving / C.arrive, 0, 1);
    this.entry = k;
    const [b1, b2, b3] = C.beats;

    // nothing takes damage until it is here
    for (const ring2 of this.rings) for (const p of ring2.panels) p.hp = p.maxHp;
    this.core.hp = this.core.maxHp;

    // the frames assemble on the last beat, and are simply not there before it
    const unfold = k < b3 ? 0 : (k - b3) / (1 - b3);
    let n = 0;
    for (const ring2 of this.rings) {
      for (let i = 0; i < ring2.panels.length; i++) {
        const p = ring2.panels[i];
        const due = i / ring2.panels.length;
        p.spawnIn = unfold > due ? 0 : 1;
        if (unfold > due && !p.landed) {
          p.landed = true;
          world.enemies.push(p);
          ring(p.x, p.y, p.r * 2.4, p.r * 0.6, 0.22, p.type.glow, 2);
          if (n++ < 2) audio.pop(0.5);
        }
      }
    }
    this.core.spawnIn = k < b2 ? 1 : clamp(1 - (k - b2) / (b3 - b2), 0, 1);
    this.place(raw * 0.5);

    // the sky goes over first, and keeps going over
    background.setDread(clamp(k / b1, 0, 1), 0);
    background.setFocus(this.x, this.y);
    if (!this.moodSet && k >= b1 * 0.5) { this.moodSet = true; background.setMood('boss'); }

    // one shove of light per beat of the *staging*...
    const beat = k < b1 ? 0 : k < b2 ? 1 : k < b3 ? 2 : 3;
    if (beat !== this.beatAt) {
      this.beatAt = beat;
      if (beat >= 1) {
        ring(this.x, this.y, 4, 120 + beat * 220, 0.4 + beat * 0.12, TYPE_BY_ID.ordinal.glow, 5 - beat);
        background.surge(1.4);
        shake(6 + beat * 5);
        audio.boom();
      }
    }
    // ...and the captions on their own, at reading speed. See ARRIVAL.
    this.say(world, ARRIVAL, raw);
    if (this.arriving <= 0) {
      this.entry = 1;
      world.bossLine = null;
      ring(this.x, this.y, 20, 640, 0.7, '#ffffff', 5);
      ripple(this.x, this.y, 2.6, 900);
      shake(22);
      audio.boom();
      background.surge(2);
    }
  }

  update(world, dt) {
    const C = O();
    this.t += dt;
    this.flare = Math.max(0, this.flare - dt * 2.2);
    // A stage caption reads for a few seconds and then gets out of the way.
    if (this.lineFor > 0) {
      this.lineFor -= world.dtRaw || dt;
      if (this.lineFor <= 0) world.bossLine = null;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }

    if (this.arriving > 0) {
      this.arrive(world, world.dtRaw || dt);
      return;
    }
    /*
     * Belt to the unfold's braces. A segment joins world.enemies at the
     * moment it snaps into its slot, which is the whole of how the frame
     * assembles — but anything that shortcuts the arrival (a test setting
     * `arriving = 0`, a restore, a frame skipped under load) would otherwise
     * leave ORDINAL standing there with a frame nothing can see or shoot.
     * Once, on the first frame after the arrival, whatever has not landed
     * lands.
     */
    if (!this.settled) {
      this.settled = true;
      for (const ring2 of this.rings) {
        for (const p of ring2.panels) {
          p.landed = true;
          p.spawnIn = 0;
          if (!p.dead && !world.enemies.includes(p)) world.enemies.push(p);
        }
      }
    }

    if (this.dying > 0) {
      // ...and what it has to say about it, once it has stopped exploding.
      if (this.blew) {
        if (this.outroAt === undefined) { this.outroAt = 0; this.line = 0; this.lineT = 0; }
        this.say(world, OUTRO, world.dtRaw || dt);
      }
      /*
       * On the raw clock. `dt` here is already scaled by world.timeScale and
       * the death slams that to a tenth, so a sequence counted in scaled time
       * would run for as long as the ramp back took -- which is not a number
       * anyone chose. Measured at 4.2 seconds against a 2.8 that was asked
       * for, before this.
       */
      const raw = world.dtRaw || dt;
      this.dying -= raw;
      this.beat += raw;
      const t = this.beat;
      if (t < C.arrest) this.arrest(world, t / C.arrest);
      else if (t < C.arrest + C.infall) {
        this.arrest(world, 1);
        this.infall(world, raw, (t - C.arrest) / C.infall);
      } else if (!this.blew) this.detonate(world);
      this.place(dt * 0.2);
      if (this.dying <= 0) this.done = true;
      return;
    }

    this.place(dt);
    this.releaseCheck(world, dt);

    // ---- stages, off progress through the whole thing ----
    const frac = this.coreFrac;
    let want = 1;
    if (this.shellFrac(0) <= C.stageOuter) want = 2;
    if (frac <= C.stageCore) want = 3;
    /*
     * Stage III is not entered, it is arrived at through CONVERGENCE — the
     * frame collapses onto the core, is thrown back out, and reassembles.
     * Everything else is held while that runs.
     */
    // IV is the last quarter, and it is where ORDINAL stops waiting.
    if (this.stage === 3 && frac <= C.stageDescend) this.enterStage(world, 4);
    if (this.stage === 4) this.descend(world, world.dtRaw || dt);
    if (want >= 3 && this.stage < 3 && !this.converged) {
      if (this.conv === undefined) {
        this.conv = 0;
        this.threw = false;
        this.knot = 0;
        /*
         * It takes itself back first.
         *
         * By the time the core is down to 60% both frames are usually gone,
         * so a collapse-and-fling had nothing to collapse: measured, the knot
         * was the bare core and the throw put two segments on the field.
         * ORDINAL rebuilds most of itself as it draws in — which is what
         * makes the phase worth watching, and what makes it a third stage
         * rather than a cutscene.
         */
        this.rebuild(world, C.convergeRebuild);
        world.bossLine = 'CONVERGENCE';
        flash(0.3, TYPE_BY_ID.ordinal.color);
        shake(14);
        audio.boom();
      }
      if (this.converge(world, world.dtRaw || dt)) {
        this.converged = true;
        this.enterStage(world, 3);
      }
      return;
    }
    if (want > this.stage) this.enterStage(world, want);

    const rep = C.repair[this.stage - 1];
    if (rep > 0) {
      this.repairT -= dt;
      if (this.repairT <= 0) {
        this.repairT = rep;
        if (this.repair(world)) audio.chime(320);
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

  /**
   * CONVERGENCE: the frame collapsing onto the core and being thrown back out.
   *
   * Runs on the way into stage III and is the one beat of the fight that
   * happens *to* you. Everything else here is a property of the structure —
   * turn rate, repair, garrison — and can be waited out. This cannot: the
   * segments are still solid while they fly, so for two seconds the field is
   * ORDINAL going past you in every direction.
   *
   * Whatever survives is reeled back in and the frames rebuild out of it,
   * which is why it is worth shooting them on the way through.
   */
  converge(world, raw) {
    const C = O();
    this.conv += raw;
    const pull = C.convergePull;
    const hold = pull + C.convergeHold;
    const live = [];
    for (const ring2 of this.rings) for (const p of ring2.panels) if (!p.dead) live.push(p);

    if (this.conv < hold) {
      // in: every segment eased down onto the core, and the sky drawn with it
      const k = clamp(this.conv / pull, 0, 1);
      this.knot = k * k * (3 - 2 * k);
      if (Math.random() < 0.4) {
        const rr = 420 * (1 - this.knot) + 30;
        ring(this.x, this.y, rr, rr * 0.3, 0.24, TYPE_BY_ID.ordinal.glow, 2);
      }
      shake(2 + this.knot * 8);
      return false;
    }

    if (!this.threw) {
      this.threw = true;
      // ...and out. Solid the whole way.
      for (const p of live) {
        const a = Math.atan2(p.y - this.y, p.x - this.x) + rand(-0.1, 0.1);
        p.free = { vx: Math.cos(a) * C.convergeThrow, vy: Math.sin(a) * C.convergeThrow, t: 0 };
      }
      flash(0.5, TYPE_BY_ID.ordinal.color);
      for (let i = 0; i < 4; i++) {
        ring(this.x, this.y, 10 + i * 20, 420 + i * 200, 0.45 + i * 0.14,
          i % 2 ? '#ffffff' : TYPE_BY_ID.ordinal.glow, 5 - i);
      }
      ripple(this.x, this.y, 3, 1100);
      shake(30);
      audio.boom();
      background.surge(2);
      world.bossLine = 'IT IS NOT A WALL. IT NEVER WAS.';
      return false;
    }

    // the survivors coast, then are reeled back into their slots
    const back = this.conv - hold;
    for (const p of live) {
      if (!p.free) continue;
      p.free.t += raw;
      if (p.free.t < C.convergeBack * 0.45) {
        p.x += p.free.vx * raw;
        p.y += p.free.vy * raw;
        p.angle += raw * 4;
      } else {
        // home, easing back to wherever its slot has turned to by now
        p.homing = clamp((p.free.t - C.convergeBack * 0.45) / (C.convergeBack * 0.55), 0, 1);
      }
    }
    if (back < C.convergeBack) return false;
    for (const p of live) { p.free = null; p.homing = 0; }
    this.knot = 0;
    world.bossLine = null;
    ring(this.x, this.y, 400, 20, 0.5, TYPE_BY_ID.ordinal.glow, 3);
    audio.boom();
    return true;
  }

  /**
   * Put dead segments back, up to `frac` of each frame, at part health. The
   * same push into world.enemies that repair() needs: sweep() removes a dead
   * body from the field, and clearing `dead` on one this still holds a
   * reference to would otherwise revive it where nothing can see or shoot it.
   */
  rebuild(world, frac) {
    let back = 0;
    this.rings.forEach((ring2, i) => {
      const want = Math.round(ring2.panels.length * frac);
      const gone = ring2.panels.filter((p) => p.dead);
      const need = Math.max(0, want - (ring2.panels.length - gone.length));
      for (let k = 0; k < need && k < gone.length; k++) {
        const p = gone[k];
        p.dead = false;
        p.maxHp = TYPE_BY_ID.tally.hp;
        p.hp = Math.round(p.maxHp * 0.6);
        p.spawnIn = 0.4;
        p.flash = 1;
        p.free = null;
        p.homing = 0;
        if (!world.enemies.includes(p)) world.enemies.push(p);
        this.beams.push({ p, t: 0.55 });
        back++;
      }
    });
    return back;
  }

  /**
   * DESCENT. It comes down.
   *
   * Everything else in this fight is a property of a structure sitting at the
   * top of the field: turn rate, repair, garrison, all of it waited out from
   * where you are standing. This is the one stage that changes the geometry —
   * ORDINAL leaves its station and closes on the turret, frames spun to a
   * blur, and turns four beams out of its core.
   *
   * A beam across the turret is corruption. It cannot kill you — nothing in
   * this game can — but for as long as it is on you it costs the intake,
   * which is the only thing this fight has ever been able to take.
   */
  descend(world, raw) {
    const C = O();
    const s = world.shooter;
    this.fall = Math.min(1, (this.fall || 0) + raw / C.descendFor);
    const e = this.fall * this.fall * (3 - 2 * this.fall);
    this.y = this.y0 + (s.y - C.close - this.y0) * e;
    background.setFocus(this.x, this.y);

    // the eye tracks you
    this.gaze = Math.atan2(s.y - this.y, s.x - this.x);

    // ...and the beams turn, in sweeps rather than continuously
    this.lashA = (this.lashA || 0) + C.lashSpin * raw;
    this.lashT = (this.lashT || 0) - raw;
    if (this.lashT <= 0) {
      this.lashT = C.lashEvery + C.lashFor;
      this.lashing = C.lashFor;
      audio.glitchOn();
      shake(9);
    }
    if (this.lashing > 0) {
      this.lashing -= raw;
      // Anything the sweep is across takes it. The turret is what matters.
      const to = Math.atan2(s.y - this.y, s.x - this.x);
      let on = false;
      for (let i = 0; i < C.lash; i++) {
        const a = this.lashA + (i / C.lash) * TAU;
        let d = to - a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < C.lashWidth) on = true;
      }
      if (on) {
        world.shock = Math.max(world.shock, C.lashShock);
        if (Math.random() < 0.3) spark(s.x + rand(-20, 20), s.y + rand(-20, 20),
          rand(-60, 60), rand(-60, 60), TYPE_BY_ID.ordinal.glow, 0.3, 2);
      }
    }
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
    // The whole sky escalates with it, not just the boss.
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT IS COMING DOWN TO LOOK AT YOU.'
      : n >= 3 ? 'THE COUNT IS SHORT. IT HAS NOTICED.'
        : 'IT IS MENDING ITSELF.';
    this.lineFor = n >= 4 ? 4.4 : 3.4;
    if (n >= 4) {
      // Where it falls from, and it never goes back up.
      this.y0 = this.y;
      this.fall = 0;
      this.lashT = 1.2;
      flash(0.6, '#ffffff');
      for (const ring of this.rings) ring.spin *= 2.1;
      ripple(this.x, this.y, 3.4, 1300);
      shake(34);
    }
    this.garrison(C.garrison[Math.min(n, C.garrison.length) - 1], true);
    ring(this.x, this.y, 20, 520, 0.7, TYPE_BY_ID.ordinal.glow, 6);
    ring(this.x, this.y, 10, 300, 0.4, '#ffffff', 3);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  /**
   * The end, in four beats. Timed on the real clock -- see the note in
   * CFG.ordinal -- so the slow-motion does not stretch the sequence it is
   * there to make readable.
   *
   *   ARREST      the frames stop dead and come apart segment by segment,
   *               in order round the ring rather than all at once
   *   INFALL      the core takes everything loose on the field into itself
   *   DETONATION  and lets go of all of it in one frame
   *   AFTER       the REMAINDER rises out of what is left and comes to you
   *
   * Nothing here is on `update`'s scaled clock, and nothing here is a single
   * explode() call: the whole point is that it takes long enough to watch.
   */
  die(world) {
    const C = O();
    this.dying = C.endFor;
    this.beat = 0; // how far through the sequence, in real seconds
    // A stage caption still counting down would clobber the outro's first
    // line the moment it expired.
    this.lineFor = 0;
    world.bossLine = null;
    this.snapped = 0; // segments taken so far during ARREST
    world.timeScale = B().endSlow;
    world.bossSlow = B().slowFor;
    // Everything the frames were holding is let go at once.
    for (const d of this.parked) d.dead = true;
    this.parked.length = 0;
    ring(this.x, this.y, 8, 240, 0.5, '#ffffff', 4);
    ripple(this.x, this.y, 2.4, 700);
    shake(20);
    audio.boom();
    background.surge(2);
  }

  /** ARREST: segments snapping off round the frame, one after another. */
  arrest(world, k) {
    const C = O();
    const all = [];
    for (const ring2 of this.rings) for (const p of ring2.panels) if (!p.dead) all.push(p);
    const want = Math.ceil(all.length * clamp(k, 0, 1));
    while (this.snapped < want && all.length) {
      const p = all.shift();
      if (!p || p.dead) { this.snapped++; continue; }
      p.dead = true;
      this.snapped++;
      explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.5);
      ring(p.x, p.y, 2, p.r * 5, 0.3, p.type.glow, 2);
      for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU);
        spark(p.x, p.y, Math.cos(a) * rand(90, 260), Math.sin(a) * rand(90, 260),
          p.type.color, rand(0.3, 0.7), 2);
      }
    }
  }

  /** INFALL: the core taking the field into itself. */
  infall(world, dt, k) {
    const C = O();
    const grab = (list) => {
      for (const e of list) {
        if (e.dead) continue;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = C.pull * k * dt / d;
        e.vx += dx * f;
        e.vy += dy * f;
      }
    };
    grab(world.enemies);
    grab(world.drops);
    grab(world.debris);
    // ...and a ring closing on the centre, one every few frames
    if (Math.random() < 0.5) {
      const rr = 520 * (1 - k) + 40;
      ring(this.x, this.y, rr, rr * 0.2, 0.28, TYPE_BY_ID.ordinal.glow, 2);
    }
    shake(3 + k * 6);
  }

  /** DETONATION: one frame, everything at once. */
  detonate(world) {
    const C = O();
    const T = TYPE_BY_ID.ordinal;
    this.blew = true;
    flash(0.85, '#ffffff');
    for (let i = 0; i < 6; i++) {
      ring(this.x, this.y, 6 + i * 24, 300 + i * 240, 0.55 + i * 0.15,
        i % 2 ? '#ffffff' : T.glow, 7 - i);
    }
    // radial spokes, thrown out of the centre
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rand(-0.05, 0.05);
      const sp = rand(420, 900);
      spark(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, i % 3 ? T.color : '#ffffff',
        rand(0.5, 1.1), 3);
    }
    explode(this.x, this.y, C.coreR * 2, T.color, T.glow, 4);
    /*
     * The husk.
     *
     * Ordinary wreckage clears itself, which is right for a BULWARK breaking
     * mid-wave and wrong here: a boss that leaves an empty field reads as
     * having been deleted rather than broken. These are keeps — they never
     * time out — so what is lying on the floor afterwards is the shape of the
     * thing that was there, and it is still there when the next wave arrives.
     */
    /*
     * One piece per segment and a dozen off the core, at nearly twice the
     * size. Three each came to a hundred and thirty-odd chunks and the field
     * afterwards read as gravel rather than as the wreck of a structure —
     * and the next wave then arrived into it. Fewer and larger is the same
     * idea and a legible one.
     */
    for (const ring2 of this.rings) {
      for (const p of ring2.panels) {
        shed(world, { x: p.x, y: p.y, r: p.r, vx: 0, vy: 0, type: p.type }, 2,
          { keep: true, size: 2 });
      }
    }
    shed(world, { x: this.x, y: this.y, r: C.coreR, vx: 0, vy: 0, type: T }, 14,
      { keep: true, size: 1.9 });
    ripple(this.x, this.y, 4, 1500);
    shake(40);
    audio.boom();
    background.surge(2);
    // Everything it was counting, thrown outward.
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rand(-0.1, 0.1);
      const sp = rand(220, 520);
      world.drops.push(new Enemy(TYPE_BY_ID.ordinal, this.x, this.y, {
        drop: true, r: rand(3.4, 5.8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        energy: C.pay / 30,
      }));
    }
    /*
     * ...and the one thing it was keeping. Whose it was is recorded here
     * rather than read off the boss when it lands: a REMAINDER is still on
     * its way to the turret after the fight has been cleaned up, so by the
     * time anything announces it there is no boss left to ask.
     */
    world.remainderFrom = this.n;
    for (let i = 0; i < B().remainder; i++) {
      world.effects.push(new Remainder(this.x, this.y));
    }
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
    // Positioned in place(), not here: a draw that moves things is a draw
    // that behaves differently when the frame is dropped.
    for (const d of this.parked) {
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
    /*
     * DESCENT's beams. Four of them, turning out of the core, and they only
     * exist while a sweep is running — a beam that is always on is a hazard
     * you route around once and then ignore, and one that arrives on a clock
     * is a thing you have to keep answering.
     */
    if (this.stage >= 4 && this.lashing > 0 && this.dying <= 0) {
      const k = clamp(this.lashing / C.lashFor, 0, 1);
      const reach = 1500;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < C.lash; i++) {
        const a = this.lashA + (i / C.lash) * TAU;
        const w = C.lashWidth;
        const g2 = ctx.createLinearGradient(this.x, this.y,
          this.x + Math.cos(a) * reach, this.y + Math.sin(a) * reach);
        g2.addColorStop(0, rgba('#ffffff', 0.55 * k));
        g2.addColorStop(0.25, rgba(T.color, 0.4 * k));
        g2.addColorStop(1, rgba(T.glow, 0));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, reach, a - w, a + w);
        ctx.closePath();
        ctx.fill();
        // a hard line down the middle of it
        ctx.strokeStyle = rgba('#ffffff', 0.8 * k);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a) * reach, this.y + Math.sin(a) * reach);
        ctx.stroke();
      }
      drawGlow(ctx, '#ffffff', this.x, this.y, C.coreR * 3, 0.5 * k);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

/**
 * Open the way to anomaly `n`. Spends one of its APERTUREs, stops the field,
 * and puts the boss on it.
 *
 * Returns false if there is nothing to spend, one is already up, or `n` names
 * a boss that is planned and not written -- which is the honest answer for
 * six of the seven, and the reason the tree keeps their slots dormant.
 */
export function openAperture(world, n = 1) {
  if (world.boss) return false;
  const make = makerOf(n);
  if (!make || !anomalyOf(n)) return false;
  if (!world.apertures || !(world.apertures[n] > 0)) return false;
  world.apertures[n]--;

  /*
   * The field is ORDINAL's now, and that has to be true the moment the way
   * opens rather than only for what comes next.
   *
   * Everything already on it is taken by the hole: hauled in and broken,
   * which pays out its salvage exactly as shooting it would have. So it is
   * not a robbery -- opening the way mid-wave banks the wave.
   *
   * Including the harmless ones. DRIFT used to be left where it was on the
   * grounds that it is grey and it is scenery, which is true and is not the
   * point: the field belongs to ORDINAL from the frame the way opens, and a
   * dozen grey shapes still wandering through the arrival say that it does
   * not. Drift pays too -- it always has, at CFG.energy.drift -- so taking it
   * costs nobody anything. Energy already on the floor is untouched: that is
   * yours, not the field's.
   */
  const cx = world.shooter.x;
  const cy = world.shooter.y - CFG.ordinal.standoff;
  // Four passes, because a SPLITTER coming apart leaves four more behind it
  // and a BLOOM's blast can shed further bodies. Nothing splits four deep, so
  // this terminates on the field rather than on the counter.
  for (let pass = 0; pass < 4; pass++) {
    let took = 0;
    for (const e of [...world.enemies]) {
      if (e.dead || e.type.fixed) continue;
      haul(e.x, e.y, cx, cy, e.type.glow, 0.5, 3);
      // It pays out, but it is not a kill: you did not destroy it, the hole
      // did. Otherwise opening the way onto a full field walks the tally
      // forward by fifty-odd objects for the price of one APERTURE.
      e.counts = false;
      e.destroy(world);
      took++;
    }
    if (!took) break;
  }
  world.attackers.clear();

  // Whose sky this is, before the arrival starts turning it over.
  background.setBossMoods(dressOf(n).moods);
  world.boss = make(world);
  world.bossN = n;
  world.bossStage = 1;
  ripple(world.shooter.x, world.shooter.y - CFG.ordinal.standoff, 2.6, 900);
  shake(20);
  audio.boom();
  return true;
}

/*
 * ORDINAL is anomaly I. Registered here, at the bottom of the module that
 * defines it, so nothing has to import a boss in order to build one -- see
 * the note at the top of anomaly.js.
 */
registerAnomaly(1, (world) => new Ordinal(world));
