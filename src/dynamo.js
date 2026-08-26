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
 *   II     first pylon down. The blinks quicken, and the circuit can no
 *          longer hold what it is carrying: the discharge stops running back
 *          along the arc and earths itself down the field instead.
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
    this.circuitA = 0;
    this.pylons = [];
    for (let i = 0; i < 3; i++) {
      // Its place on the ring, not its place on the field: the whole circuit
      // turns, so where a pylon *is* is worked out every frame.
      const a = -Math.PI / 2 + (i / 3) * TAU + Math.PI;
      const p = this.body('pylon', this.hub.x + Math.cos(a) * C.inset,
        this.hub.y + Math.sin(a) * C.inset);
      p.at = a;
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
   * How chewed the circuit is, by health rather than by count.
   *
   * The stage ladder used to read "a leg has fallen", and a turning circuit
   * does not deliver legs one at a time: auto aim takes whatever is nearest,
   * three pylons sweep past each other every few seconds, and the damage is
   * spread across all three. So the first pylon dies at about a third of the
   * circuit's health remaining and the other two fall almost together --
   * measured, stage I was 70% of the leg phase and stage II was the 30%
   * afterwards, 67 seconds against 21. Read as health it splits evenly, which
   * is what a stage boundary is for.
   */
  circuitFrac() {
    let hp = 0;
    let max = 0;
    for (const p of this.pylons) {
      max += p.maxHp;
      if (!p.dead) hp += Math.max(0, p.hp);
    }
    return max ? hp / max : 0;
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
    /*
     * The circuit turns, and that is most of what stops this fight being a
     * still image. Three towers that never move were a quarter of it.
     */
    this.circuitA += C.circuitSpin[this.stage - 1] * dt;
    for (const p of this.pylons) {
      if (p.dead) continue;
      const a = p.at + this.circuitA;
      p.x = this.hub.x + Math.cos(a) * C.inset;
      p.y = this.hub.y + Math.sin(a) * C.inset;
      p.angle = 0;
      p.vx = 0; p.vy = 0; p.av = 0;
    }

    if (this.triad) {
      // The blades are husks: drawn, not bodies. A dead pylon that could
      // still be shot would be a second health bar on a boss that has one.
      this.bladeA = (this.bladeA || 0) + C.bladeSpin * dt;
    } else if (this.stage >= 3 && !this.arriving) {
      /*
       * III: off the ground, and still blinking -- station to station round
       * you rather than sliding smoothly between them. A boss that glides is
       * a chase; one that is somewhere else every few seconds is the thing
       * this boss was supposed to be all along.
       */
      const [sx, sy] = this.stopAt(this.at);
      this.x = sx;
      this.y = sy;
    } else {
      // Through stopAt rather than off the pylon directly: with one leg left
      // the stops are stations around it, not the leg itself.
      const [sx, sy] = this.stopAt(this.at);
      this.x = sx;
      this.y = sy;
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
  /** How many places it can be right now: pylons, or stations on its orbit. */
  stops() {
    const C = D();
    if (this.stage >= 3) return C.orbitStops;
    const n = this.live().length;
    // One leg left is not one place to stand: it paces the near face of it.
    // Without this the blink -- the mechanic this boss is named for -- went
    // out for the whole stretch of II between SURGE and III, measured as one
    // blink in thirty one seconds.
    return n === 1 ? C.pylonStops : n;
  }

  /** ...and where a given one of them is. */
  stopAt(i) {
    const C = D();
    if (this.stage >= 3) {
      /*
       * Across the top of the turret, not all the way round it.
       *
       * A full ring of six stations puts two of them behind the ±78°
       * shoulder, and when the core blinks to one of those there is nothing
       * else on the field to shoot: measured, stage III ran 31% blind at 41
       * dmg/s against 70 everywhere else, which is most of why it was 46% of
       * a 324-second fight. The same geometry, and the same fix, as the
       * propeller in IV.
       */
      const a = -Math.PI / 2 + ((i / Math.max(1, C.orbitStops - 1)) - 0.5) * 2 * C.orbitArc;
      const s = this.hunt || this.hub;
      return [s.x + Math.cos(a) * C.orbitAt, s.y + Math.sin(a) * C.orbitAt];
    }
    const live = this.live();
    if (live.length === 1) {
      /*
       * ...ACROSS the leg, not around it. The stations sit on the line
       * perpendicular to the turret, so the core slides side to side over its
       * last pylon at the distance it was already standing at.
       *
       * Both other geometries were measured and both cost the fight. A full
       * lap -- the version built in 134 and rolled back for costing thirty
       * percent of the length -- puts the core behind its own leg for half of
       * every turn: further off, past the shoulder, and unshootable. An arc
       * across the NEAR face is worse in the opposite direction: it makes the
       * core nearer than the pylon, auto aim takes the nearest, and the whole
       * one-leg stretch is spent on the thing the stretch is not about. That
       * one drained the bar under the stage IV threshold before the last leg
       * fell -- III lasted zero seconds and II ran to a hundred and thirty.
       *
       * Sideways changes the distance by about seven units out of three
       * hundred. Nothing about who is nearest moves, and the blink comes
       * back on.
       */
      const p = live[0];
      const toward = Math.atan2(this.hub.y + C.standoff - p.y, this.hub.x - p.x);
      const side = ((i / Math.max(1, C.pylonStops - 1)) - 0.5) * 2;
      const a = toward + Math.PI / 2;
      return [p.x + Math.cos(a) * side * C.pylonOrbit, p.y + Math.sin(a) * side * C.pylonOrbit];
    }
    const p = live[Math.min(i, live.length - 1)] || this.pylons[0];
    return [p.x, p.y];
  }

  stepBlink(world, dt) {
    const C = D();
    if (this.stops() < 2) { this.next = -1; return; }
    if (this.tele > 0) {
      this.tele -= dt;
      if (this.tele <= 0) {
        // Where it left from, so the discharge has somewhere to come from.
        const [fx, fy] = this.stopAt(this.at);
        this.at = this.next;
        this.next = -1;
        const [tx, ty] = this.stopAt(this.at);
        const [dx2, dy2] = this.discharge(world, tx, ty);
        this.lance = { ax: fx, ay: fy, bx: dx2, by: dy2, t: C.lanceFor };
        ring(tx, ty, 8, 180, 0.4, TYPE_BY_ID.dynamo.glow, 3);
        spark(fx, fy, rand(-90, 90), rand(-90, 90), '#ffffff', 0.3, 3);
        audio.pop(0.85);
        shake(6);
      }
      return;
    }
    this.blinkT -= dt;
    if (this.blinkT > 0) return;
    this.blinkT = C.blinkEvery * (this.stage >= 2 ? C.blinkFast : 1);
    const n = this.stops();
    this.at = Math.min(this.at, n - 1);
    let go = this.at;
    while (go === this.at && n > 1) go = (Math.random() * n) | 0;
    this.next = go;
    this.tele = C.telegraph;
    audio.chime(320);
  }

  /**
   * The discharge.
   *
   * Every blink leaves a lance burning down the arc it travelled, for a
   * second or so. Crossing one is corruption -- so the telegraph is a warning
   * about two things at once: where it is going, and where the field is about
   * to be dangerous. It is also the only pressure this boss makes that is not
   * a minion, which matters: a fight whose only threat arrives on a spawn
   * clock has one rhythm, and this one now has two.
   */
  stepLance(world, dt) {
    const C = D();
    const L = this.lance;
    if (!L || L.t <= 0) return;
    L.t -= dt;
    const s = world.shooter;
    const vx = L.bx - L.ax;
    const vy = L.by - L.ay;
    const len2 = vx * vx + vy * vy || 1;
    const k = clamp(((s.x - L.ax) * vx + (s.y - L.ay) * vy) / len2, 0, 1);
    const dx = s.x - (L.ax + vx * k);
    const dy = s.y - (L.ay + vy * k);
    if (dx * dx + dy * dy < C.lanceWidth * C.lanceWidth) {
      world.shock = Math.max(world.shock, C.lanceShock);
      if (Math.random() < 0.3) {
        spark(s.x + rand(-18, 18), s.y + rand(-18, 18), rand(-70, 70), rand(-70, 70),
          '#dceaff', 0.28, 2);
      }
    }
    if (L.t <= 0) this.lance = null;
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
      const d = this.claim(new Enemy(TYPE_BY_ID.ion, a.x, a.y, { staged: false, spawnIn: 0.2 }));
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
      const d = this.claim(new Enemy(TYPE_BY_ID.ion, this.x + Math.cos(a) * (C.coreR + 8),
        this.y + Math.sin(a) * (C.coreR + 8), { staged: false, spawnIn: 0.2 }));
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
   * Where the discharge goes, which from II is the ground.
   *
   * While the circuit is whole the charge has somewhere to be: it runs back
   * along the arc the core just travelled, between two things that are both a
   * long way from you. Break a leg and it has nowhere, so it earths -- down
   * the field, somewhere along the bottom, and crossing it is corruption.
   *
   * This is where `sweepArcs` was, which walked the links between surviving
   * pylons asking whether the turret was across one. It could never have
   * been: the circuit stands at standoff, and by II there are two pylons left
   * and so exactly one link, three hundred away. Measured over whole fights
   * it fired zero times in every stage, for six builds, while the header and
   * the config both said the surviving links electrify.
   */
  discharge(world, tx, ty) {
    const C = D();
    if (this.stage < 2) return [tx, ty];
    const s = world.shooter;
    // Somewhere along the bottom, not at you: it is being got rid of rather
    // than aimed, so whether it lands across the turret is the roll.
    const gx = s.x + rand(-C.earthSpread, C.earthSpread);
    const gy = s.y + rand(40, 140);
    ring(gx, gy, 6, 150, 0.34, TYPE_BY_ID.dynamo.glow, 2);
    return [gx, gy];
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

  /**
   * EARTH. The circuit comes back, and dumps itself at the ground.
   *
   * The beat this fight's back half never had. Everything after SURGE was one
   * long descent: the core lets go of the ground in III and comes down as a
   * propeller in IV, and nothing in between asks you to change what you are
   * shooting. So the ground reaches back up -- all three pylons return at
   * 40%, the whole circuit discharges downward on a single frame, and the
   * core is taken back into shelter behind it.
   *
   * It is also the only thing in this build that adds any length. A stage
   * boundary re-partitions health the boss already had; three pylons at 40%
   * is thirty seconds of shooting that was not there.
   */
  startEarth(world) {
    const C = D();
    this.earthing = 0;
    this.earthed = true; // set here, not on completion: the gate is one-shot
    this.struck = false;
    this.curtain = [];
    world.bossLine = 'EARTH';
    this.lineFor = 3.6;
    this.hold(world, 0.7);
    this.reform(world, C.earthHp, { sweep: 1 });
    flash(0.5, '#dceaff');
    ripple(this.hub.x, this.hub.y, 3.2, 1200);
    shake(26);
    audio.boom();
    background.surge(2);
  }

  stepEarth(world, raw) {
    const C = D();
    this.earthing += raw;
    const k = clamp(this.earthing / C.earthFor, 0, 1);

    // ...and then, on one frame, all of it at once.
    if (!this.struck && k >= 0.62) {
      this.struck = true;
      const floor = world.floorY || (world.shooter.y + 210);
      for (const p of this.live()) {
        this.curtain.push({ x: p.x, y: p.y, gx: p.x + rand(-40, 40), gy: floor, t: C.curtainFor });
        spark(p.x, p.y, rand(-60, 60), rand(80, 200), '#dceaff', 0.4, 4);
      }
      // One jolt, on the frame it lands. A curtain that corrupted for as long
      // as it was drawn would be weather; this boss already learned that once,
      // when its propeller ran stage IV at 77% corrupted frames.
      world.shock = Math.max(world.shock, C.earthShock);
      flash(0.75, '#ffffff');
      for (let i = 0; i < 4; i++) {
        ring(this.hub.x, this.hub.y, 14 + i * 30, 560 + i * 240, 0.5 + i * 0.12,
          i % 2 ? '#ffffff' : TYPE_BY_ID.dynamo.glow, 5 - i);
      }
      ripple(this.hub.x, this.hub.y, 3.6, 1400);
      shake(34);
      audio.boom();
      background.surge(2);
    }
    if (k < 1) return false;
    this.earthing = undefined;
    world.bossLine = null;
    return true;
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
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT HAS TAKEN THE GROUND BACK.'
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

  /**
   * ...and the second movement of IV: the circuit falls for the last time and
   * collapses into the core.
   *
   * This used to happen at the stage boundary, which was right when IV had
   * one movement. EARTH gives the ground back, so IV opens with the circuit
   * standing and the core behind it, and the propeller is what is left when
   * you have taken it apart a second time. The last stage is the only one in
   * this fight with two shapes in it, which is the right place for that.
   *
   * The legs have to actually go. Left alive one kept the core at a leg's
   * worth of armour and the turret went on splitting its fire: measured, IV
   * was forty three percent of the fight for the last quarter of the bar.
   */
  collapse(world) {
    for (const p of this.live()) {
      p.dead = true;
      explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.6);
      ring(p.x, p.y, 4, p.r * 6, 0.35, p.type.glow, 3);
    }
    this.triad = true;
    this.bladeA = 0;
    this.y0 = this.y;
    this.fall = 0;
    this.hunt = { x: world.shooter.x, y: world.shooter.y };
    this.orbitPhase = 0;
    world.bossLine = 'IT NO LONGER NEEDS THE GROUND.';
    this.lineFor = 4.2;
    flash(0.6, '#ffffff');
    ripple(this.x, this.y, 3.4, 1300);
    shake(34);
    audio.boom();
    background.surge(2);
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
    this.stepLance(world, dt);
    /*
     * The curtain burns out on the frame clock, not on EARTH's -- it used to
     * be stepped inside stepEarth, which stops running the moment the
     * setpiece ends, so three bolts the height of the field hung over the
     * whole of stage IV.
     */
    if (this.curtain) {
      for (let i = this.curtain.length - 1; i >= 0; i--) {
        this.curtain[i].t -= world.dtRaw || dt;
        if (this.curtain[i].t <= 0) this.curtain.splice(i, 1);
      }
    }

    if (this.surge > 0) {
      this.surge -= world.dtRaw || dt;
      this.surgeA = (this.surgeA || 0) + C.surgeSpin * dt;
      if (Math.random() < 0.4) shake(5);
      if (this.surge <= 0) world.bossLine = null;
      background.setFocus(this.x, this.y);
      return;
    }

    /*
     * EARTH is held above the rest of the frame for the reason SURGE is: it
     * drives the circuit itself, and a blink or an ION launch landing inside
     * it would be a second thing happening during the one beat this fight
     * asks you to watch.
     */
    if (this.earthing !== undefined) {
      if (this.stepEarth(world, world.dtRaw || dt)) this.enterStage(world, 4);
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
    // IV, first movement: the circuit EARTH gave back, one last time.
    if (this.stage >= 4 && !this.triad && !this.live().length) this.collapse(world);
    if (this.triad) {
      this.fall = Math.min(1, (this.fall || 0) + (world.dtRaw || dt) / C.descendFor);
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      const s = world.shooter;
      // The propeller comes down the line between where it was and you.
      /*
       * An arc over the turret rather than a lap around it. A full circle put
       * the propeller behind the shoulder for half of every turn, which the
       * probe read as 43% of stage IV with nothing legal on the field and
       * damage per shot at 9.5 against 20 everywhere else -- the worst stage
       * in the game, and geometry rather than balance.
       */
      this.orbitPhase = (this.orbitPhase || 0) + C.orbitRock * dt;
      this.orbitA = -Math.PI / 2 + Math.sin(this.orbitPhase) * C.orbitArc;
      this.x = this.hunt.x + Math.cos(this.orbitA) * C.orbitAt * (1 - e * 0.55);
      this.y = this.hunt.y + Math.sin(this.orbitA) * C.orbitAt * (1 - e * 0.55);
      /*
       * ...and it corrupts when a blade is across you, not merely while it is
       * near. Descended, this thing sits inside `close` permanently: measured
       * on build 133 stage IV ran at seventy-seven percent corrupted frames,
       * which is not a threat, it is weather. Gated on the blade angle it is
       * the two-per-turn strobe the propeller looks like it is. |sin| of the
       * difference is symmetric about a half turn, which is what makes one
       * test cover both blades of a two-bladed thing.
       */
      const toward = Math.atan2(s.y - this.y, s.x - this.x);
      const across = Math.abs(Math.sin(toward - this.bladeA)) < Math.sin(C.bladeArc);
      if (across && Math.hypot(this.x - s.x, this.y - s.y) < C.close) {
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
    if ((gone >= 1 || this.circuitFrac() <= C.crackAt) && want < 2) want = 2;
    if (gone >= 2 && !this.surged) { this.startSurge(world); return; }
    /*
     * III waits for the whole circuit, not two thirds of it.
     *
     * At two the gap between the first pylon falling and the second was four
     * percent of the fight -- the turret takes them at a steady rate, so the
     * stage between them was never going to be a stage. II is the middle of
     * this fight now: arcs live, blinks quick, SURGE landing inside it, and
     * the core coming out of shelter partway through.
     */
    if (gone >= 3 && want < 3) want = 3;
    /*
     * IV is not entered, it is arrived at through EARTH -- and only from III.
     * After it the circuit is standing again, so the last stage waits for the
     * legs to come down a second time as well as for the bar.
     */
    if (this.stage === 3 && !this.earthed && this.coreFrac <= C.stageTriad) {
      this.startEarth(world);
      return;
    }
    if (this.earthed && this.coreFrac <= C.stageTriad && want < 4) want = 4;
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
  /**
   * Deterministic noise for the bolts, in -1..1.
   *
   * Not `Math.random`. The draw runs off the same stream the simulation does,
   * so a bolt that rerolls from it also rerolls the fight -- the seeded hash
   * in `fight.mjs --hash` would stop reproducing the moment anything was
   * drawn. Hashed off the point index, a per-bolt seed and a STEPPED clock:
   * stepped because lightning crackles rather than undulates, and a smooth
   * function of `t` is a wobble.
   */
  jag(i, seed, tick) {
    const x = Math.sin(i * 127.1 + seed * 311.7 + tick * 74.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }

  /**
   * The points of one bolt, jagged in proportion to how far it has to go.
   *
   * Both numbers used to be constants -- seven segments and nine units of
   * offset, whatever the span. That is fine over a link between two pylons at
   * a hundred and ninety units and is a straight line over EARTH's curtain at
   * nine hundred: seven segments of a hundred and twenty-eight units each,
   * deviating by four degrees. Screenshotted, it was a pale stick.
   *
   * So the segment count and the amplitude both scale with the span, and the
   * offset is two octaves rather than one: a long swing down the length of the
   * bolt with a per-point jag on top of it. One octave of a smooth sine is a
   * rope; the second octave is what makes it lightning.
   */
  boltPath(ax, ay, bx, by, seed, amp = 1) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const n = clamp(Math.round(len / 26), 6, 30);
    const wide = clamp(len * 0.075, 7, 40) * amp;
    const tick = Math.floor(this.t * 18);
    const pts = [ax, ay];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const swing = this.jag(i, seed, tick) * 0.7 + this.jag(i * 4.3, seed + 9, tick) * 0.3;
      /*
       * Pinned at both ends, widest in the middle: a bolt starts and finishes
       * where it was aimed and does what it likes in between. The taper is
       * flattened off `sin` so it stays wide down most of its length and
       * pinches only near the ends.
       */
      const j = swing * wide * Math.sin(k * Math.PI) ** 0.55;
      /*
       * ...and it is displaced ALONG the run as well, which is the difference
       * between lightning and a zigzag. Evenly spaced points with only a
       * sideways offset give every segment the same length and the same
       * cadence -- a stylised bolt, drawn. Kept under half a segment so the
       * points cannot cross and double back.
       */
      const along = this.jag(i * 2.9, seed + 4, tick) * 0.42 / n;
      pts.push(ax + dx * (k + along) + px * j, ay + dy * (k + along) + py * j);
    }
    pts.push(bx, by);
    return pts;
  }

  /** ...and one bolt, drawn. */
  arc(ctx, ax, ay, bx, by, bright, seed, opts = {}) {
    const T = TYPE_BY_ID.dynamo;
    const w = opts.width || 1;
    const pts = this.boltPath(ax, ay, bx, by, seed, opts.amp);
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    };
    /*
     * Three passes down the same path: a wide haze, a body, and a thin white
     * core. Additively, that is what makes a stroke look hot rather than
     * drawn -- and it is why the lance and the curtain no longer lay a
     * straight gradient over the top of the jagged line. That straight band
     * was most of what the eye was reading.
     */
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(T.glow, (bright ? 0.2 : 0.15) * (opts.alpha ?? 1));
    ctx.lineWidth = (bright ? 11 : 6) * w;
    trace();
    ctx.strokeStyle = rgba(bright ? '#dceaff' : T.glow, (bright ? 0.55 : 0.42) * (opts.alpha ?? 1));
    ctx.lineWidth = (bright ? 4 : 2.2) * w;
    trace();
    // The dim pass still gets a white core. A link this boss is not currently
    // jumping along is a live wire, not a pencil line -- drawn at the old
    // 0.34 of one colour it read as the diagram of a circuit rather than one.
    ctx.strokeStyle = rgba('#ffffff', (bright ? 0.9 : 0.5) * (opts.alpha ?? 1));
    ctx.lineWidth = (bright ? 1.6 : 1) * w;
    trace();

    /*
     * ...and it branches. A bolt that runs from one point to another and
     * nowhere else reads as a wire however jagged it is; the forks are what
     * say electricity. They come off the middle of the run, go a fraction of
     * the way, and end in the air.
     */
    if (!bright || opts.forks === 0) { ctx.lineCap = 'butt'; return; }
    const tick = Math.floor(this.t * 18);
    const forks = opts.forks ?? 2;
    for (let f = 0; f < forks; f++) {
      const at = 0.3 + this.jag(f * 17 + 3, seed, tick) * 0.12 + f * 0.22;
      const i = Math.max(2, Math.min(pts.length - 4, Math.round((pts.length / 2) * at) * 2));
      const fx = pts[i];
      const fy = pts[i + 1];
      const a = Math.atan2(by - ay, bx - ax)
        + (this.jag(f * 5 + 1, seed + 3, tick) > 0 ? 1 : -1)
        * (0.5 + Math.abs(this.jag(f * 11, seed + 7, tick)) * 0.5);
      const run = Math.hypot(bx - ax, by - ay) * (0.16 + Math.abs(this.jag(f, seed + 2, tick)) * 0.2);
      this.arc(ctx, fx, fy, fx + Math.cos(a) * run, fy + Math.sin(a) * run, false,
        seed + 31 + f * 13, { width: w * 0.7, alpha: (opts.alpha ?? 1) * 0.8, forks: 0 });
    }
    ctx.lineCap = 'butt';
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

    /*
     * ...and in III there are no links to light, so the telegraph is drawn
     * straight from where it is to where it is going. Without this the blink
     * loses its tell exactly when the core is finally something you can shoot.
     */
    if (this.stage >= 3 && this.next >= 0 && !this.triad) {
      const [tx, ty] = this.stopAt(this.next);
      this.arc(ctx, this.x, this.y, tx, ty, true, 23);
    }

    // The discharge burning down the arc it just travelled.
    if (this.lance && this.lance.t > 0 && this.dying <= 0) {
      const k = clamp(this.lance.t / C.lanceFor, 0, 1);
      ctx.save();
      /*
       * Wide, because being across it is corruption and its width has to be
       * something you can see rather than something you learn by being
       * corrupted by it -- but wide along the BOLT now. It used to be a
       * straight gradient band laid over the jagged line, and a straight band
       * is what the eye read.
       */
      ctx.globalAlpha = 0.35 + 0.65 * k;
      this.arc(ctx, this.lance.ax, this.lance.ay, this.lance.bx, this.lance.by, true, 31,
        { width: C.lanceWidth / 12, forks: 3 });
      ctx.restore();
    }

    // III: the leash back to whatever is left of the ground.
    if (this.stage >= 3 && live.length && !this.triad) {
      this.arc(ctx, this.x, this.y, live[0].x, live[0].y, false, 11);
    }
    // IV: the propeller, core to husk.
    if (this.triad) {
      const a = this.bladeA || 0;
      /*
       * ...over half a turn of its own afterimage. A two-bladed thing turning
       * at 2.2 rad/s is, in any one frame, two straight lines -- the shape
       * the eye is being sold is the sweep, and a still frame of it was not
       * showing that at all. Drawn as flat wedges behind the live blades so
       * the arc reads as swept rather than as more lightning.
       */
      const trail = C.trailFor * C.bladeSpin;
      ctx.save();
      for (const s of [0, Math.PI]) {
        const g = ctx.createLinearGradient(this.x, this.y,
          this.x + Math.cos(a + s) * C.bladeR, this.y + Math.sin(a + s) * C.bladeR);
        g.addColorStop(0, rgba(T.glow, 0.3));
        g.addColorStop(1, rgba('#ffffff', 0.06));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, C.bladeR, a + s - trail, a + s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      for (const s of [1, -1]) {
        this.arc(ctx, this.x, this.y, this.x + Math.cos(a + (s < 0 ? Math.PI : 0)) * C.bladeR,
          this.y + Math.sin(a + (s < 0 ? Math.PI : 0)) * C.bladeR, true, s * 5);
      }
    }

    /*
     * EARTH: the whole circuit dumping at the ground on one frame. Every
     * standing pylon to the floor at once, which is the only time this fight
     * draws anything below the turret at all.
     */
    if (this.curtain && this.curtain.length) {
      ctx.save();
      let seed = 41;
      for (const b of this.curtain) {
        const k = clamp(b.t / C.curtainFor, 0, 1);
        ctx.globalAlpha = 0.25 + 0.75 * k;
        // The whole circuit dumping at the ground: the fattest bolts this
        // fight draws, and the only thing it ever draws below the turret.
        this.arc(ctx, b.x, b.y, b.gx, b.gy, true, seed += 5.3,
          { width: 1.7, forks: 4, amp: 1.2 });
      }
      ctx.restore();
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
