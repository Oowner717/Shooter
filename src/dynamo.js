/*
 * DYNAMO. Anomaly V, electric blue.
 *
 * A closed circuit. Three pylons in a compact triangle with arcs strung
 * between them, and a core that is not anywhere in particular: it sits AT a
 * pylon, and every few seconds it is at a different one.
 *
 * While the circuit is closed the core is armoured, and every pylon you take
 * out opens it further. So the fight is about the legs rather than about the
 * thing standing on them -- right up until there are no legs left, at which
 * point it stops needing the ground at all.
 *
 * A teleporting boss is the one archetype that is *more* comfortable on auto
 * aim than under a thumb. The assist retargets on the blink for free, where a
 * person would spend the fight chasing it. That is why the telegraph exists:
 * so you can see where it is going, not so you can react in time.
 *
 *   I      three pylons, lazy blinks, IONs riding the rails.
 *   II     first pylon down -- the surviving links electrify and sweep, and
 *          the blinks quicken.
 *   SURGE  second pylon down: the grid overloads, every arc whips a full turn
 *          round its pylon, and everything riding drops at once.
 *   III    one pylon left. The core lets go of the ground and orbits *you*,
 *          trailing a live arc back to it like a leash.
 *   IV     the last pylon collapses into the core and the pair becomes a
 *          two-bladed propeller of lightning, coming down.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { ring, ripple, spark, shake, flash, explode } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Boss } from './boss.js';

const D = () => CFG.dynamo;

/*
 * The arrival is struck rather than opened: each beat is a bolt, one pylon
 * planted per beat, and the core last down the middle.
 */
const ARRIVAL = [
  { text: 'THE SUBSTRATE CARRIES A CURRENT.', hold: 3.2 },
  { text: 'SOMETHING HAS BEEN DRAWING ON IT SINCE YOU ARRIVED.', hold: 4.8 },
  { text: 'IT HAS COME TO COLLECT THE CHARGE.', hold: 3.6 },
  { text: 'DYNAMO', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE CIRCUIT IS OPEN.', hold: 2.8 },
  { text: 'THE CHARGE IS YOURS. IT ALWAYS WAS.', hold: 3.8 },
  { text: 'SOMETHING IS STANDING IN ITS OWN REFLECTION.', hold: 4.2 },
];

/*
 * Blue skies, and the one set that had to be pulled *away* from the
 * generator's answer rather than toward it. Rotated from ORDINAL's magenta,
 * stage IV came out a bright cyan -- the exact colour the entire interface is
 * drawn in, so the HUD stopped being readable against its own sky. These stay
 * indigo and end violet-white instead: hot, and nothing else's colour.
 */
const MOODS = [
  { top: '#04081c', mid: '#0c1b4a', low: '#010310', line: '#2c4f9e', neb: ['#132a6b', '#0e2050', '#101c58'], accent: '#7fb0ff' },
  { top: '#060c28', mid: '#122668', low: '#02040f', line: '#3f6ecc', neb: ['#1c3a94', '#132a6b', '#182a7a'], accent: '#a8c8ff' },
  { top: '#0a1038', mid: '#1c3494', low: '#03061a', line: '#4d8dff', neb: ['#2848c8', '#1c3a94', '#2038a8'], accent: '#d6e6ff' },
  { top: '#141a52', mid: '#3048cc', low: '#080c28', line: '#a8c8ff', neb: ['#4058ff', '#2848c8', '#3450e0'], accent: '#ffffff' },
];

export class Dynamo extends Boss {
  constructor(world) {
    super(world, 5);
    const C = D();
    this.hub = { x: world.shooter.x, y: world.shooter.y - C.standoff };
    this.x = this.hub.x;
    this.y = this.hub.y;
    this.arriving = C.arrive;

    this.at = 0; // which pylon the core is standing on
    this.next = -1; // ...and which it is going to, while a blink is telegraphed
    this.blinkT = C.blinkEvery;
    this.tele = 0;
    this.railT = C.railEvery[0];
    this.riders = []; // IONs currently travelling a link
    this.surge = 0;
    this.surged = false;
    this.orbitA = 0;
    this.triad = false;

    /*
     * The circuit. Point-down, so the nearest pylon is the one directly
     * between you and the rest of it -- which makes the obvious first target
     * also the one that opens the shortest path to the core.
     */
    this.pylons = [];
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * TAU + Math.PI;
      const p = this.body('pylon', this.hub.x + Math.cos(a) * C.inset,
        this.hub.y + Math.sin(a) * C.inset);
      p.home = { x: p.x, y: p.y };
      this.pylons.push(p);
    }

    this.core = this.body('dynamo', this.pylons[0].x, this.pylons[0].y);
    world.enemies.push(this.core);

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  parts() {
    return this.pylons;
  }

  /** How much of the circuit is still standing. */
  shellFrac() {
    return this.pylons.filter((p) => !p.dead).length / this.pylons.length;
  }

  live() {
    return this.pylons.filter((p) => !p.dead);
  }

  /**
   * What the core ignores, by how much of the circuit is left.
   *
   * Never a wall: the damage formula floors every hit at 1, so a whole
   * circuit is the slow way in rather than no way in. But it is slow enough
   * that taking the legs out is obviously the answer, which is the point.
   */
  shield() {
    const C = D();
    const gone = this.pylons.length - this.live().length;
    // Indexed by pylons gone, so it opens as the circuit comes apart. See the
    // note in CFG.dynamo for the build where this was the wrong way round.
    return C.shield[Math.min(gone, C.shield.length - 1)];
  }

  gauge() {
    const C = D();
    const arriving = this.arriving > 0;
    const d = dressOf(5);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      // Three pips rather than a bar: there are three of them and each one is
      // a step change in how armoured the core is, so a smooth track would be
      // lying about what the reader is watching for.
      shells: [{ label: 'CIRCUIT', seg: this.pylons.length, frac: this.shellFrac() }],
      marks: [{ at: C.stageTriad, past: !arriving && this.coreFrac <= C.stageTriad }],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  place(dt) {
    const C = D();
    for (const p of this.pylons) {
      if (p.dead) continue;
      p.x = p.home.x;
      p.y = p.home.y;
      p.angle = 0;
      p.vx = 0; p.vy = 0; p.av = 0;
    }

    if (this.triad) {
      // The blades are husks: drawn, not bodies. A dead pylon that could
      // still be shot would be a second health bar on a boss that has one.
      this.bladeA = (this.bladeA || 0) + C.bladeSpin * dt;
    } else if (this.stage >= 3 && !this.arriving) {
      // III: off the ground, going round you.
      this.orbitA += C.orbitSpin * dt;
      const s = this.hunt;
      this.x = s.x + Math.cos(this.orbitA) * C.orbitAt;
      this.y = s.y + Math.sin(this.orbitA) * C.orbitAt;
    } else {
      const p = this.live()[this.at] || this.live()[0] || this.pylons[0];
      this.x = p.x;
      this.y = p.y;
    }
    this.core.x = this.x;
    this.core.y = this.y;
    this.core.vx = 0;
    this.core.vy = 0;
    this.core.armor = this.shield();
  }

  /**
   * The core is *inside* the circuit, and while the circuit stands it cannot
   * be reached at all.
   *
   * This is the parked mechanism ORDINAL's garrison proved: out of
   * world.enemies is out of the world -- unshootable, uncollidable, drawn by
   * the boss rather than by the field. It is not a flag anything else has to
   * know about.
   *
   * It is here because armour could not do the job. The core blinks between
   * pylons, so it is always exactly as far away as a pylon is, and auto aim
   * picks by distance: roughly half of everything the turret produced went
   * into the core no matter how heavily it was armoured. At 0.6 that killed
   * it during stage II and stage III lasted one frame; at 0.88 it merely
   * wasted the fire instead, and stage II became sixty-two percent of the
   * fight. Neither is a circuit that matters.
   *
   * Two legs down and it is out in the open. That is the fight.
   */
  syncReach(world) {
    const hidden = this.live().length >= 2 && !this.core.dead;
    const at = world.enemies.indexOf(this.core);
    if (hidden && at >= 0) world.enemies.splice(at, 1);
    else if (!hidden && at < 0 && !this.core.dead) world.enemies.push(this.core);
    this.sheltered = hidden;
  }

  // -------------------------------------------------------------- beats

  /**
   * The blink. Telegraphed first: the arc to wherever it is going brightens
   * for `telegraph` seconds, and then it is there.
   *
   * Without the tell a teleport is a discontinuity, and a discontinuity is
   * not a mechanic, it is a bug you have to be told is deliberate.
   */
  stepBlink(world, dt) {
    const C = D();
    const live = this.live();
    if (live.length < 2 || this.stage >= 3) { this.next = -1; return; }
    if (this.tele > 0) {
      this.tele -= dt;
      if (this.tele <= 0) {
        this.at = this.next;
        this.next = -1;
        ring(live[this.at].x, live[this.at].y, 8, 180, 0.4, TYPE_BY_ID.dynamo.glow, 3);
        spark(this.x, this.y, rand(-90, 90), rand(-90, 90), '#ffffff', 0.3, 3);
        audio.pop(0.85);
        shake(5);
      }
      return;
    }
    this.blinkT -= dt;
    if (this.blinkT > 0) return;
    this.blinkT = C.blinkEvery * (this.stage >= 2 ? C.blinkFast : 1);
    this.at = Math.min(this.at, live.length - 1);
    let n = this.at;
    while (n === this.at && live.length > 1) n = (Math.random() * live.length) | 0;
    this.next = n;
    this.tele = C.telegraph;
    audio.chime(320);
  }

  /** The links, as pairs of live pylons. */
  links() {
    const live = this.live();
    const out = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) out.push([live[i], live[j]]);
    }
    return out;
  }

  /**
   * IONs ride the arcs and drop off them.
   *
   * The riding is the point. A minion that simply appeared at a pylon would
   * be a spawner; one that travels a visible line from one leg of the circuit
   * to another makes the circuit look inhabited, and tells you where it will
   * be before it is there.
   */
  launch(world) {
    const C = D();
    const ls = this.links();
    /*
     * ...and with fewer than two legs there are no rails left to ride, so it
     * sheds them off itself instead. Without this the IONs simply stopped:
     * measured, they were absent for seventy percent of the fight, because
     * the circuit that carries them is the first thing you take apart.
     */
    if (!ls.length) { this.shed(world); return; }
    for (let k = 0; k < C.railOf; k++) {
      const [a, b] = ls[(Math.random() * ls.length) | 0];
      const d = new Enemy(TYPE_BY_ID.ion, a.x, a.y, { staged: false, spawnIn: 0.2 });
      d.counts = false;
      // Off the ledger and off the field until it drops: while it is riding
      // it is scenery, the same way ORDINAL's garrison is scenery until a
      // panel goes. Nothing can shoot a thing that is inside a wire.
      this.riders.push({ e: d, a, b, t: 0 });
    }
    audio.chime(420);
  }

  /** No circuit left to ride: they come straight off the core. */
  shed(world) {
    const C = D();
    for (let k = 0; k < C.railOf; k++) {
      const a = rand(0, TAU);
      const d = new Enemy(TYPE_BY_ID.ion, this.x + Math.cos(a) * (C.coreR + 8),
        this.y + Math.sin(a) * (C.coreR + 8), { staged: false, spawnIn: 0.2 });
      d.counts = false;
      d.vx = Math.cos(a) * rand(180, 260);
      d.vy = Math.sin(a) * rand(180, 260);
      d.thrown = 0.45;
      world.enemies.push(d);
    }
    ring(this.x, this.y, C.coreR, C.coreR * 3.6, 0.3, TYPE_BY_ID.ion.glow, 3);
    audio.chime(420);
  }

  stepRiders(world, dt) {
    const C = D();
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      r.t += dt;
      const k = clamp(r.t / C.railFor, 0, 1);
      // A live wire sags; so does what is riding it.
      const sag = Math.sin(k * Math.PI) * 22;
      r.e.x = r.a.x + (r.b.x - r.a.x) * k;
      r.e.y = r.a.y + (r.b.y - r.a.y) * k + sag;
      if (k < 1 && !r.a.dead && !r.b.dead) continue;
      this.riders.splice(i, 1);
      this.drop(world, r.e);
    }
  }

  /** ...and off it comes. */
  drop(world, e) {
    e.vx = rand(-90, 90);
    e.vy = rand(40, 140);
    e.thrown = 0.4;
    e.spawnIn = 0.2;
    world.enemies.push(e);
    spark(e.x, e.y, e.vx * 0.5, e.vy * 0.5, TYPE_BY_ID.ion.glow, 0.3, 2);
  }

  /**
   * The electrified links, from II. An arc sweeps its own length once per
   * blink and crossing one is corruption -- the same currency every other
   * boss takes, and the only one any of them is allowed to.
   */
  sweepArcs(world) {
    const C = D();
    if (this.stage < 2) return;
    const s = world.shooter;
    for (const [a, b] of this.links()) {
      // Distance from the turret to the segment, which is what "crossing an
      // arc" actually means.
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      let t = ((s.x - a.x) * vx + (s.y - a.y) * vy) / len2;
      t = clamp(t, 0, 1);
      const dx = s.x - (a.x + vx * t);
      const dy = s.y - (a.y + vy * t);
      if (dx * dx + dy * dy < C.arcWidth * C.arcWidth) {
        world.shock = Math.max(world.shock, C.arcShock);
        if (Math.random() < 0.25) {
          spark(s.x + rand(-16, 16), s.y + rand(-16, 16), rand(-70, 70), rand(-70, 70),
            TYPE_BY_ID.dynamo.glow, 0.28, 2);
        }
      }
    }
  }

  /**
   * SURGE, on the second pylon. The grid overloads: every arc whips a full
   * turn round its pylon, the field strobes, and everything still riding
   * drops at once.
   */
  startSurge(world) {
    const C = D();
    this.surged = true;
    this.surge = C.surgeFor;
    world.bossLine = 'SURGE';
    this.lineFor = 3.0;
    for (const r of [...this.riders]) {
      this.riders.splice(this.riders.indexOf(r), 1);
      this.drop(world, r.e);
    }
    flash(0.55, '#dceaff');
    for (let i = 0; i < 4; i++) {
      ring(this.x, this.y, 12 + i * 28, 520 + i * 220, 0.5 + i * 0.12,
        i % 2 ? '#ffffff' : TYPE_BY_ID.dynamo.glow, 5 - i);
    }
    ripple(this.x, this.y, 3, 1100);
    shake(30);
    audio.boom();
    background.surge(2);
  }

  enterStage(world, n) {
    const C = D();
    this.stage = n;
    this.flare = 1;
    this.railT = C.railEvery[n - 1];
    if (n >= 3) {
      // Off the ground. It keeps a leash back to whatever is left.
      this.hunt = { x: world.shooter.x, y: world.shooter.y };
      this.orbitA = -Math.PI / 2;
      this.tele = 0;
      this.next = -1;
    }
    if (n >= 4) {
      /*
       * "The last pylon collapses into the core" -- and it has to actually
       * collapse, not ride along still standing. Left alive it kept a leg on
       * the board, which meant the core stayed at a leg's worth of armour and
       * the turret went on splitting its fire: measured, stage IV was
       * forty-three percent of the fight for the last quarter of the bar.
       * It goes out here, and what turns on the blades afterwards is a husk.
       */
      for (const p of this.live()) {
        p.dead = true;
        explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.6);
        ring(p.x, p.y, 4, p.r * 6, 0.35, p.type.glow, 3);
      }
      this.triad = true;
      this.bladeA = 0;
      this.y0 = this.y;
      this.fall = 0;
      flash(0.6, '#ffffff');
      ripple(this.x, this.y, 3.4, 1300);
      shake(34);
    }
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT NO LONGER NEEDS THE GROUND.'
      : n >= 3 ? 'IT HAS LET GO OF THE GROUND.'
        : 'IT HAS CLOSED THE CIRCUIT.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.dynamo.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = D();
    this.t += dt;
    this.tickCommon(world, dt);

    if (this.arriving > 0) {
      this.arriveStep(world, world.dtRaw || dt, C, ARRIVAL, MOODS);
      return;
    }
    this.settle(world);

    if (this.dying > 0) {
      this.dieStep(world, dt, C, OUTRO);
      return;
    }

    this.place(dt);
    this.syncReach(world);
    this.stepRiders(world, dt);
    this.sweepArcs(world);

    if (this.surge > 0) {
      this.surge -= world.dtRaw || dt;
      this.surgeA = (this.surgeA || 0) + C.surgeSpin * dt;
      if (Math.random() < 0.4) shake(5);
      if (this.surge <= 0) world.bossLine = null;
      background.setFocus(this.x, this.y);
      return;
    }

    this.stepBlink(world, dt);

    // III and IV follow the turret rather than a fixed point.
    if (this.stage >= 3 && this.hunt) {
      const s = world.shooter;
      this.hunt.x += (s.x - this.hunt.x) * Math.min(1, dt * 1.1);
      this.hunt.y += (s.y - this.hunt.y) * Math.min(1, dt * 1.1);
    }
    if (this.stage >= 4) {
      this.fall = Math.min(1, (this.fall || 0) + (world.dtRaw || dt) / C.descendFor);
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      const s = world.shooter;
      // The propeller comes down the line between where it was and you.
      this.x = this.hunt.x + Math.cos(this.orbitA) * C.orbitAt * (1 - e * 0.55);
      this.y = this.hunt.y + Math.sin(this.orbitA) * C.orbitAt * (1 - e * 0.55);
      this.orbitA += C.orbitSpin * 1.6 * dt;
      if (Math.hypot(this.x - s.x, this.y - s.y) < C.close) {
        world.shock = Math.max(world.shock, C.arcShock);
      }
      this.core.x = this.x;
      this.core.y = this.y;
    }

    this.railT -= dt;
    if (this.railT <= 0) {
      this.railT = C.railEvery[this.stage - 1];
      this.launch(world);
    }

    const gone = this.pylons.length - this.live().length;
    let want = this.stage;
    if (gone >= 1 && want < 2) want = 2;
    if (gone >= 2 && !this.surged) { this.startSurge(world); return; }
    if (gone >= 2 && want < 3) want = 3;
    if (this.coreFrac <= C.stageTriad && want < 4) want = 4;
    /*
     * One stage at a time. This boss's triggers are independent -- pylons for
     * II and III, core health for IV -- so both can come true on the same
     * frame, and jumping straight to the one furthest along skips whatever is
     * between. Measured: stage III never ran at all.
     */
    if (want > this.stage) this.enterStage(world, this.stage + 1);

    const through = 1 - (this.shellFrac() * 0.35 + this.coreFrac * 0.65);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /** On the way out it has to be back in the world, or the wreck is not shed. */
  clear(world) {
    if (!world.enemies.includes(this.core)) world.enemies.push(this.core);
    super.clear(world);
  }

  /**
   * The ending: the circuit grounds out.
   *
   * Chained lightning walks outward from the core to every wreck and debris
   * pile on the field, one strike each -- it is giving the charge back --
   * and then the field goes dark. That is the one blackout in this game, it
   * is capped at half a second on the real clock, and the core still glows
   * through it: a dark frame that lingers reads as a crash, not as a beat.
   */
  dieExtra(world, k) {
    const C = D();
    this.dark = k < C.darkFor / (C.arrest || 0.7) ? 0 : 1;
    if (this.chained === undefined) {
      this.chained = 0;
      this.marks = [...world.debris, ...world.drops]
        .filter((e) => !e.dead)
        .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y)
          - Math.hypot(b.x - this.x, b.y - this.y));
    }
    const want = Math.floor(k * Math.min(this.marks.length, 14));
    while (this.chained < want) {
      const m = this.marks[this.chained];
      this.chained++;
      if (!m) continue;
      this.bolt = { x: m.x, y: m.y, t: 0.2 };
      spark(m.x, m.y, rand(-80, 80), rand(-80, 80), '#dceaff', 0.3, 2);
      audio.pop(0.55);
    }
  }

  // --------------------------------------------------------------- draw

  /** One arc, drawn as a jagged line rather than a straight one. */
  arc(ctx, ax, ay, bx, by, bright, seed) {
    const dx = bx - ax;
    const dy = by - ay;
    const n = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      // Deterministic jitter off the boss clock: a bolt that reroll every
      // frame from Math.random is a bolt that also reruns the fight, because
      // the draw would then be consuming the same stream the sim does.
      const j = Math.sin(this.t * 22 + seed + i * 2.1) * 9 * Math.sin(k * Math.PI);
      ctx.lineTo(ax + dx * k - dy / Math.hypot(dx, dy || 1) * j,
        ay + dy * k + dx / Math.hypot(dx, dy || 1) * j);
    }
    ctx.lineTo(bx, by);
    ctx.strokeStyle = rgba(bright ? '#ffffff' : '#7fb0ff', bright ? 0.85 : 0.34);
    ctx.lineWidth = bright ? 2.4 : 1.2;
    ctx.stroke();
  }

  draw(ctx, world) {
    const C = D();
    const T = TYPE_BY_ID.dynamo;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);
    ctx.globalCompositeOperation = 'lighter';

    // The circuit itself.
    const live = this.live();
    if (!this.triad && this.stage < 3) {
      let seed = 0;
      for (const [a, b] of this.links()) {
        // The link the core is about to jump along is the bright one: that is
        // the whole telegraph.
        const going = this.next >= 0
          && ((a === live[this.at] && b === live[this.next])
            || (b === live[this.at] && a === live[this.next]));
        this.arc(ctx, a.x, a.y, b.x, b.y, going, seed += 3.7);
      }
    }

    // III: the leash back to whatever is left of the ground.
    if (this.stage >= 3 && live.length && !this.triad) {
      this.arc(ctx, this.x, this.y, live[0].x, live[0].y, false, 11);
    }
    // IV: the propeller, core to husk.
    if (this.triad) {
      const a = this.bladeA || 0;
      for (const s of [1, -1]) {
        this.arc(ctx, this.x, this.y, this.x + Math.cos(a + (s < 0 ? Math.PI : 0)) * C.bladeR,
          this.y + Math.sin(a + (s < 0 ? Math.PI : 0)) * C.bladeR, true, s * 5);
      }
    }

    // SURGE: every arc whipping a full turn round its pylon.
    if (this.surge > 0) {
      const k = clamp(this.surge / C.surgeFor, 0, 1);
      for (const p of live) {
        for (let i = 0; i < 3; i++) {
          const a = (this.surgeA || 0) + (i / 3) * TAU;
          this.arc(ctx, p.x, p.y, p.x + Math.cos(a) * 320 * k, p.y + Math.sin(a) * 320 * k,
            true, i * 2.3);
        }
      }
      drawGlow(ctx, '#ffffff', this.x, this.y, 420 * k, 0.5 * k);
    }

    /*
     * The core, while it is inside the circuit. Nothing else draws it then --
     * it is out of world.enemies -- so it is drawn here, dimmer, which is the
     * whole tell that it cannot yet be touched.
     */
    if (this.sheltered && !arriving) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      this.core.draw(ctx, world);
      ctx.restore();
      // ...behind a shell, so "sheltered" is a thing you can see rather than
      // a thing you work out from your rounds doing nothing.
      ctx.strokeStyle = rgba('#a8c8ff', 0.3 + 0.15 * Math.sin(this.t * 3));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, C.coreR * 1.5, 0, TAU);
      ctx.stroke();
    }

    // What is riding the wires.
    for (const r of this.riders) {
      ctx.save();
      ctx.globalAlpha = 0.85 * open;
      r.e.draw(ctx, world);
      ctx.restore();
    }

    // The last bolt of the grounding-out, if one is live.
    if (this.bolt && this.bolt.t > 0) {
      this.bolt.t -= 1 / 60;
      this.arc(ctx, this.x, this.y, this.bolt.x, this.bolt.y, true, 17);
    }

    this.drawBeams(ctx);
    const pulse = 0.22 + 0.1 * Math.sin(this.t * (1.6 + this.stage)) + this.flare * 0.6;
    drawGlow(ctx, T.glow, this.x, this.y, C.inset * 2.4, pulse * open);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(5, (world) => new Dynamo(world));
