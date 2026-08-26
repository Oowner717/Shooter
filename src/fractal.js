/*
 * FRACTAL. Anomaly III, acid green.
 *
 * ORDINAL was a wall you opened. GNOMON was a light you waited on. This is
 * neither: it is depth.
 *
 * Three generations of one triangle. A core, three middles orbiting it at the
 * points of a triangle, three smalls orbiting each middle -- and your rounds
 * meet the smallest first, then the middles, then the core. Nothing here is a
 * wall. Everything here is a *generation*, and the armour is made of the same
 * stuff as the threat.
 *
 * Which is the rule that makes it a fight rather than a stack: breaking a
 * middle does not delete the three smalls it was carrying, it **frees** them.
 * They stop orbiting, leave the structure, and become sovereign objects with
 * ordinary appetites. So peeling the armour off is the same act as arming the
 * thing that comes at you, and the order you do it in is the whole decision.
 *
 * And it never gains a body it did not arrive with. The count on the field is
 * the same nine smalls and three middles from the first frame to the last,
 * redistributed between "in orbit" and "loose" -- which is what keeps a
 * self-similar boss legible instead of turning into a swarm.
 *
 *   I          slow concentric orbits. Peel a middle.
 *   RECURSION  on the first middle broken: everything left collapses onto the
 *              core and reassembles into the whole figure once, at part
 *              health. The only heal in the fight, and it is a scene.
 *   II         the orbits go eccentric and the generations counter-rotate, so
 *              the shape you learned stops being the shape.
 *   III        the core divides: three pieces, a third the size and a third of
 *              what is left of its health each. It is not smaller.
 *   IV         whatever is last takes the whole remaining bar, goes white-
 *              green, and orbits *you*.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { ring, ripple, spark, shake, flash, explode } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Boss } from './boss.js';

const F = () => CFG.fractal;

const ARRIVAL = [
  { text: 'ONE OF THE OBJECTS HAS BEEN REPEATING ITSELF.', hold: 4.2 },
  { text: 'EVERY PIECE OF IT IS THE WHOLE OF IT.', hold: 3.6 },
  { text: 'IT DOES NOT BELIEVE IN SMALLEST PARTS.', hold: 3.8 },
  { text: 'FRACTAL', hold: 2.8 },
];

const OUTRO = [
  { text: 'IT HAS REACHED ITS SMALLEST PART.', hold: 3.4 },
  { text: 'THE PATTERN STOPS HERE.', hold: 3.0 },
  { text: 'SOMETHING IS MOVING IN LONG, SLOW WAVES.', hold: 3.8 },
];

/*
 * FRACTAL's four skies, authored rather than rotated.
 *
 * The generator would put acid green in the sky, and acid green in the sky is
 * the one colour this game cannot afford: salvage is green, the affordance
 * green in the tree is green, and a field lit green hides both. So the sky
 * stays near-black and goes olive, then bronze, then a hot pale horizon --
 * and the *boss* carries the colour. Which is truer to it anyway: the thing
 * is a pattern, not a weather system.
 */
const MOODS = [
  { top: '#050a04', mid: '#12210a', low: '#020401', line: '#3f6b1e', neb: ['#1c3a0c', '#14290a', '#182f08'], accent: '#8bff4d' },
  { top: '#081104', mid: '#1e3a0c', low: '#030601', line: '#5c9c26', neb: ['#2c5a0e', '#1c3a0c', '#24480a'], accent: '#a6ff6e' },
  { top: '#0d1a05', mid: '#325c10', low: '#050a02', line: '#8bff4d', neb: ['#4a8a14', '#2c5a0e', '#3a6e0c'], accent: '#d6ff9e' },
  { top: '#16280a', mid: '#4f8a18', low: '#0a1204', line: '#c2ff8f', neb: ['#6eb81e', '#4a8a14', '#5ca016'], accent: '#ffffff' },
];

export class Fractal extends Boss {
  constructor(world) {
    super(world, 3);
    const C = F();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.arriving = C.arrive;

    this.spinA = 0; // where the middles are round the core
    this.spinB = 0; // ...and the smalls round their middle
    this.recursed = false;
    this.recurse = 0; // seconds of RECURSION still to run
    this.knot = 0; // 0..1, how far everything is drawn onto the core
    this.descent = null; // the second beat's clock, on the way into IV
    this.descended = false;
    this.split = false;
    this.replaceT = C.replaceEvery;
    this.closeT = 0;

    /*
     * The core, and later its thirds. `pieces` is what the health bar reads:
     * from stage III there are three of these and the bar is their sum, which
     * is what makes "it is not smaller, there is more of it" true rather than
     * a caption over a shrinking bar.
     */
    this.core = this.body('fractal', this.x, this.y);
    this.pieces = [this.core];
    this.coreTotal = this.core.maxHp;
    world.enemies.push(this.core);

    /*
     * The generations. Each middle knows its place round the core and each
     * small knows its place round its middle, so a body's position is a fact
     * about the structure rather than a simulation -- and a freed small is
     * simply one that has stopped being asked.
     */
    this.mids = [];
    for (let i = 0; i < C.mids; i++) {
      const m = this.body('fraction', this.x, this.y);
      /*
       * On the parent's CORNERS, not merely round it.
       *
       * `drawTri` puts a triangle's vertices at -90, 30 and 150 degrees, so a
       * child placed at a multiple of 120 from zero lands on the middles of
       * the parent's sides instead -- a quarter turn out, which is exactly
       * enough to stop the figure reading as a subdivision of itself.
       */
      m.at = -Math.PI / 2 + (i / C.mids) * TAU;
      m.mites = [];
      for (let k = 0; k < C.mites; k++) {
        const t = this.body('mite', this.x, this.y);
        t.at = -Math.PI / 2 + (k / C.mites) * TAU;
        t.host = m;
        m.mites.push(t);
      }
      this.mids.push(m);
    }

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  /** Every body of the structure, in the order the arrival assembles them. */
  parts() {
    const out = [];
    for (const m of this.mids) {
      out.push(m);
      for (const t of m.mites) out.push(t);
    }
    // The core's thirds are parts too, once there are any: they are what
    // arrest() takes apart at the end.
    for (const p of this.pieces) if (p !== this.core) out.push(p);
    return out;
  }

  /**
   * The bar is the sum of whatever the core currently is.
   *
   * One body in stages I and II, three in III and IV -- and the total it is
   * measured against never changes, so dividing into thirds does not read as
   * suddenly having less.
   */
  get coreFrac() {
    let hp = 0;
    for (const p of this.pieces) if (!p.dead) hp += p.hp;
    return clamp(hp / this.coreTotal, 0, 1);
  }

  /** How much of the structure is still in orbit rather than loose or gone. */
  shellFrac() {
    const all = this.mids.length + this.mids.length * F().mites;
    let held = 0;
    for (const m of this.mids) {
      if (!m.dead) held++;
      for (const t of m.mites) if (!t.dead && t.host) held++;
    }
    return held / all;
  }

  gauge() {
    const C = F();
    const arriving = this.arriving > 0;
    const d = dressOf(3);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: [{ label: 'ORBIT', seg: this.mids.length * (1 + C.mites), frac: this.shellFrac() }],
      marks: [
        { at: C.splitAt, past: !arriving && this.coreFrac <= C.splitAt },
        { at: C.huntAt, past: !arriving && this.coreFrac <= C.huntAt },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /**
   * Every generation where its orbit says it is.
   *
   * `knot` draws the whole figure down onto the core, which is the only thing
   * RECURSION needs to look like what it is.
   */
  place(dt) {
    const C = F();
    const spin = C.spin[this.stage - 1] * (this.dying > 0 ? 2.6 : 1);
    this.spinA += C.midSpin * spin * dt;
    // From II the generations turn against each other.
    this.spinB += C.miteSpin * spin * dt * (this.stage >= 2 ? 1.6 : 1);
    const grip = 1 - this.knot * 0.94;
    const ecc = this.stage >= 2 ? C.eccentric : 0;

    /*
     * Every generation wears the same rotation, and in stage I every
     * generation sits at the same three angles.
     *
     * That is what makes the arrangement of the bodies the same figure the
     * core has drawn inside itself since this boss was written. Turned to
     * face along their own orbits and spun independently -- which is what
     * this did -- three middles and nine smalls are a scatter that happens to
     * contain triangles. Locked, they are one triangle of triangles of
     * triangles, and every screenshot of stage I says so.
     *
     * From II they come apart, which is a thing the header has always claimed
     * and nothing ever showed: `spinB` diverges from `spinA` and the shape
     * you learned stops being the shape.
     */
    const lock = this.stage >= 2 ? this.spinB : this.spinA;
    const face = this.spinA;
    for (let i = 0; i < this.mids.length; i++) {
      const m = this.mids[i];
      const a = m.at + this.spinA;
      // Eccentric from II: the orbit breathes rather than being a circle.
      const rr = C.midR * (1 + ecc * Math.sin(a * 2 + i)) * grip;
      if (!m.dead) {
        /*
         * After DESCENT a middle belongs to a piece rather than to the middle
         * of the field: the figure has gone one level down and there are
         * three of it. Same relationship, one scale smaller -- on the corner
         * of whatever is carrying it.
         */
        const host = this.descended ? this.pieceFor(i) : null;
        const hx = host ? host.x : this.x;
        const hy = host ? host.y : this.y;
        const hr = host ? C.subR * grip : rr;
        m.x = hx + Math.cos(a) * hr;
        m.y = hy + Math.sin(a) * hr;
        m.angle = face;
        m.vx = 0; m.vy = 0; m.av = 0;
      }
      for (const t of m.mites) {
        // A freed small is nobody's any more: it steers, and this leaves it
        // alone. That is the whole of what being freed means.
        if (t.dead || !t.host) continue;
        const b = t.at + lock;
        const tr = C.miteR * grip;
        t.x = m.x + Math.cos(b) * tr;
        t.y = m.y + Math.sin(b) * tr;
        t.angle = face;
        t.vx = 0; t.vy = 0; t.av = 0;
      }
    }

    // The core, or its thirds.
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.dead) continue;
      if (!this.split) {
        p.x = this.x;
        p.y = this.y;
        // The core wears the same rotation as everything hanging off it, or
        // its drawn corners turn away from the bodies sitting on them.
        p.angle = face;
      } else {
        /*
         * In IV they orbit YOU -- and an orbit is a full turn, which takes
         * them behind the turret's shoulder where the assist cannot reach
         * them at any distance. Measured before this: stage IV had the
         * nearest body inside the cone 5% of the time, 47% of its shots fired
         * mid-sweep and 16% of its frames with nothing legal to shoot at all.
         *
         * So it is a SWEEP rather than an orbit: each piece swings back and
         * forth across the top of the field, out to `pieceArc` either side of
         * straight up, which is inside the assist's 1.36. Three of them a
         * third of a cycle apart still cross and pass each other; what they
         * no longer do is spend a third of every lap unshootable.
         */
        const phase = (i / this.pieces.length) * TAU + this.spinA * C.pieceSpin * 4;
        // Half rate for the sweep: a swing crosses its own arc twice a cycle,
        // where an orbit crosses it once, so the same number turns the barrel
        // twice as often. Measured at full rate, 61% of stage IV's shots were
        // fired while the barrel was still coming round.
        const a = this.stage >= 4
          ? -Math.PI / 2 + Math.sin(phase * 0.5) * C.pieceArc
          : phase;
        const rr = C.pieceOrbit * grip * (this.stage >= 4 ? this.closeIn() : 1);
        const cx = this.stage >= 4 ? this.hunt.x : this.x;
        const cy = this.stage >= 4 ? this.hunt.y : this.y;
        p.x = cx + Math.cos(a) * rr;
        p.y = cy + Math.sin(a) * rr;
        p.angle = a;
      }
      p.vx = 0; p.vy = 0; p.av = 0;
    }
  }

  /** How far in the last piece has drawn on the turret, 1 -> a close orbit. */
  closeIn() {
    const C = F();
    const k = clamp((this.closeT || 0) / C.closeFor, 0, 1);
    const e = k * k * (3 - 2 * k);
    return 1 - e * (1 - C.closeOrbit / C.pieceOrbit);
  }

  // -------------------------------------------------------------- beats

  /**
   * A middle has gone, so the three it was carrying are loose.
   *
   * They are pushed outward along the line they were on rather than dropped
   * where they stood, so the break reads as something coming *out* of the
   * structure -- and they are ordinary objects from that frame on.
   */
  free(world, m) {
    for (const t of m.mites) {
      if (t.dead || !t.host) continue;
      t.host = null;
      /*
       * Off the boss's books and onto its own. The type is not `fixed`, so
       * once nothing is placing it every frame the physics and the steering
       * simply take over -- which is why there is no "make it sovereign"
       * anywhere: being sovereign is not being placed.
       */
      t.mass = TYPE_BY_ID.mite.density * t.r * t.r;
      t.invMass = 1 / t.mass;
      t.cruise = TYPE_BY_ID.mite.speed;
      t.accel = TYPE_BY_ID.mite.accel;
      let ax = t.x - this.x;
      let ay = t.y - this.y;
      const ad = Math.hypot(ax, ay) || 1;
      t.vx = (ax / ad) * rand(180, 260);
      t.vy = (ay / ad) * rand(180, 260);
      t.thrown = 0.4;
      spark(t.x, t.y, t.vx * 0.4, t.vy * 0.4, TYPE_BY_ID.mite.glow, 0.35, 2);
    }
    audio.pop(0.75);
  }

  /**
   * RECURSION.
   *
   * The first middle breaks and the whole figure answers: everything left
   * draws onto the core, holds, and springs back out with every lost piece
   * put back at part health. It is the only heal in this fight, it happens
   * once, and it is a scene rather than a drip -- the difference between "it
   * is mending" and "it remembers what it was".
   */
  startRecursion(world) {
    this.recursed = true;
    this.recurse = 0;
    world.bossLine = 'IT REMEMBERS ITS SHAPE.';
    this.lineFor = 3.4;
    flash(0.4, TYPE_BY_ID.fractal.color);
    shake(16);
    audio.boom();
  }

  stepRecursion(world, raw) {
    const C = F();
    this.recurse += raw;
    const inFor = C.recurseIn;
    const hold = inFor + C.recurseHold;
    if (this.recurse < inFor) {
      const k = clamp(this.recurse / inFor, 0, 1);
      this.knot = k * k * (3 - 2 * k);
      if (Math.random() < 0.35) {
        const rr = 400 * (1 - this.knot) + 30;
        ring(this.x, this.y, rr, rr * 0.3, 0.24, TYPE_BY_ID.fractal.glow, 2);
      }
      shake(2 + this.knot * 7);
      return false;
    }
    if (this.recurse < hold) {
      this.knot = 1;
      return false;
    }
    if (!this.sprang) {
      this.sprang = true;
      // Everything it ever had, back at part health -- and not one body more
      // than it arrived with, which is the cap that stops this being a wall.
      let back = 0;
      for (const m of this.mids) {
        if (m.dead) { this.revive(world, m, C.recurseHp); back++; }
        for (const t of m.mites) {
          if (t.dead) { this.revive(world, t, C.recurseHp); back++; }
          // ...including the ones that got loose. They are recalled.
          if (!t.host) {
            t.host = m;
            t.mass = Infinity;
            t.invMass = 0;
            t.cruise = 0;
            t.accel = 0;
            back++;
          }
        }
      }
      this.recalled = back;
      flash(0.55, '#ffffff');
      for (let i = 0; i < 4; i++) {
        ring(this.x, this.y, 10 + i * 22, 420 + i * 200, 0.45 + i * 0.14,
          i % 2 ? '#ffffff' : TYPE_BY_ID.fractal.glow, 5 - i);
      }
      ripple(this.x, this.y, 3, 1100);
      shake(28);
      audio.boom();
      background.surge(2);
      return false;
    }
    const out = this.recurse - hold;
    const k = clamp(out / C.recurseOut, 0, 1);
    this.knot = 1 - k * k * (3 - 2 * k);
    if (k < 1) return false;
    this.knot = 0;
    return true;
  }

  /** Which piece a middle belongs to once the figure has gone a level down. */
  pieceFor(i) {
    const live = this.pieces.filter((p) => !p.dead);
    if (!live.length) return null;
    return live[i % live.length];
  }

  /**
   * DESCENT. The second setpiece, and the beat the back half never had.
   *
   * Same verb as RECURSION -- knot everything down, put it back, spring it
   * out -- and a different sentence. RECURSION restores the figure it was.
   * This one restores it one level LOWER: the core has divided by now, so
   * what springs back is three complete copies of the shape, each hanging off
   * a piece. "It is not smaller, there is more of it", finally shown rather
   * than captioned.
   */
  startDescent(world) {
    const C = F();
    this.descended = true;
    this.descent = 0;
    this.sprungDeep = false;
    world.bossLine = 'IT IS GOING DOWN A LEVEL.';
    this.lineFor = 3.4;
    this.hold(world, 0.5);
    flash(0.45, TYPE_BY_ID.fractal.color);
    ripple(this.x, this.y, 3, 1100);
    shake(20);
    audio.boom();
    background.surge(2);
  }

  stepDescent(world, raw) {
    const C = F();
    this.descent += raw;
    const inFor = C.recurseIn;
    const hold = inFor + C.recurseHold;
    if (this.descent < inFor) {
      const k = clamp(this.descent / inFor, 0, 1);
      this.knot = k * k * (3 - 2 * k);
      if (Math.random() < 0.35) {
        const rr = 360 * (1 - this.knot) + 24;
        ring(this.x, this.y, rr, rr * 0.3, 0.24, TYPE_BY_ID.fractal.glow, 2);
      }
      shake(2 + this.knot * 7);
      return false;
    }
    if (this.descent < hold) { this.knot = 1; return false; }
    if (!this.sprungDeep) {
      this.sprungDeep = true;
      // The same bodies it arrived with, put back and recalled -- the
      // conservation rule is not bent for a setpiece.
      this.reform(world, C.descentHp);
      this.recall();
      return false;
    }
    const out = this.descent - hold;
    const k = clamp(out / C.recurseOut, 0, 1);
    this.knot = 1 - k * k * (3 - 2 * k);
    if (k < 1) return false;
    this.knot = 0;
    this.descent = null;
    return true;
  }

  /** Loose smalls come home. What "freed" meant, unmade for one beat. */
  recall() {
    for (const m of this.mids) {
      for (const t of m.mites) {
        if (t.dead || t.host) continue;
        t.host = m;
        t.mass = Infinity;
        t.invMass = 0;
        t.cruise = 0;
        t.accel = 0;
      }
    }
  }

  /**
   * III: the core divides.
   *
   * It does not shrink -- it becomes three of itself, a third the size, with
   * a third of what is left of its health each, orbiting wide. The bar is
   * their sum and the total it is measured against does not move, so the
   * caption is a description rather than a boast.
   */
  divide(world) {
    const C = F();
    const left = this.core.hp;
    const each = Math.max(1, Math.round(left / C.pieces));
    this.split = true;
    this.core.r = C.pieceR;
    this.core.hp = each;
    this.core.maxHp = each;
    for (let i = 1; i < C.pieces; i++) {
      const p = this.body('fractal', this.x, this.y, C.pieceR);
      p.hp = each;
      p.maxHp = each;
      p.spawnIn = 0.4;
      this.pieces.push(p);
      world.enemies.push(p);
    }
    flash(0.6, '#ffffff');
    for (let i = 0; i < 3; i++) {
      ring(this.x, this.y, 8 + i * 30, 380 + i * 200, 0.5 + i * 0.12,
        i % 2 ? '#ffffff' : TYPE_BY_ID.fractal.glow, 5 - i);
    }
    ripple(this.x, this.y, 2.8, 1000);
    shake(26);
    audio.boom();
  }

  /** Replace one lost small -- never more than it arrived with. */
  replace(world) {
    for (const m of this.mids) {
      if (m.dead) continue;
      for (const t of m.mites) {
        if (!t.dead) continue;
        this.revive(world, t, 0.7);
        t.host = m;
        t.mass = Infinity;
        t.invMass = 0;
        t.cruise = 0;
        t.accel = 0;
        this.beams.push({ p: t, t: 0.55 });
        return true;
      }
    }
    return false;
  }

  enterStage(world, n) {
    const C = F();
    this.stage = n;
    this.flare = 1;
    if (n === 3 && !this.split) this.divide(world);
    if (n >= 4) {
      this.closeT = 0;
      this.hunt = { x: world.shooter.x, y: world.shooter.y };
    }
    this.hold(world, 0.45);
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'EVERY PIECE IS STILL THE WHOLE.'
      : n >= 3 ? 'IT IS NOT SMALLER. THERE IS MORE OF IT.'
        : 'IT HAS STOPPED KEEPING ITS SHAPE.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.fractal.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = F();
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

    // A middle that has just gone lets its smalls loose, once.
    for (const m of this.mids) {
      if (m.dead && !m.freed) {
        m.freed = true;
        this.free(world, m);
        /*
         * On the LAST middle, not the first.
         *
         * The figure is compact enough now that one area weapon takes a
         * middle in a few seconds, so on the first it fired about thirty
         * seconds into the fight and stage I was thirteen percent of it --
         * under the floor the plan sets for a stage. Waiting for the whole
         * generation makes the opening a stage rather than a doorway, and it
         * is the better scene besides: everything it had is loose and the
         * figure is a bare core, and THEN it puts all of it back at once.
         */
        this.broke = (this.broke || 0) + 1;
        if (!this.recursed && this.broke >= this.mids.length) this.startRecursion(world);
      }
    }

    // RECURSION holds everything while it runs.
    if (this.recursed && this.recurse !== null && !this.sprangDone) {
      if (this.stepRecursion(world, world.dtRaw || dt)) {
        this.sprangDone = true;
        world.bossLine = null;
      } else {
        this.place(dt);
        background.setFocus(this.x, this.y);
        return;
      }
    }

    // DESCENT holds everything while it runs.
    if (this.descent !== null) {
      this.place(dt);
      if (this.stepDescent(world, world.dtRaw || dt)) this.enterStage(world, 4);
      background.setFocus(this.x, this.y);
      return;
    }

    this.place(dt);

    // IV: the last piece comes for you, and keeps coming.
    if (this.stage >= 4) {
      this.closeT += world.dtRaw || dt;
      const s = world.shooter;
      this.hunt.x += (s.x - this.hunt.x) * Math.min(1, dt * 1.4);
      this.hunt.y += (s.y - this.hunt.y) * Math.min(1, dt * 1.4);
      this.shedT = (this.shedT || C.shedEvery) - dt;
      if (this.shedT <= 0) {
        this.shedT = C.shedEvery;
        if (!this.replace(world)) this.throwMite(world);
      }
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (this.sprangDone && this.stage < 2) want = 2;
    if (frac <= C.splitAt && want < 3) want = 3;
    // DESCENT is the door into IV and holds the ladder while it runs.
    if (this.split && !this.descended && frac <= C.descentAt) {
      this.startDescent(world);
      return;
    }
    if (this.descended && want < 4) want = 4;
    if (frac <= C.huntAt && want < 4) want = 4;
    /*
     * One stage at a time. The triggers are independent -- the beat for II,
     * the bar for III and IV -- so two can come true on the same frame, and
     * jumping to the furthest along skips whatever is between. Written as a
     * jump, a fight that crossed `splitAt` and `huntAt` together went straight
     * to IV and the core never divided at all, because divide() is gated on
     * entering exactly stage three.
     */
    if (want > this.stage) this.enterStage(world, this.stage + 1);

    if (C.replaceEvery > 0 && this.stage >= 2 && this.stage < 4) {
      this.replaceT -= dt;
      if (this.replaceT <= 0) {
        this.replaceT = C.replaceEvery;
        if (this.replace(world)) audio.chime(520);
      }
    }

    // Where the fight is: the centroid of whatever is still the core.
    if (this.split) {
      let n = 0;
      let cx = 0;
      let cy = 0;
      for (const p of this.pieces) if (!p.dead) { cx += p.x; cy += p.y; n++; }
      if (n) background.setFocus(cx / n, cy / n);
    } else background.setFocus(this.x, this.y);

    const through = 1 - (this.shellFrac() * 0.35 + frac * 0.65);
    background.setDread(1, through);

    if (this.pieces.every((p) => p.dead)) {
      // The end is where the last piece was, not where it started.
      const last = this.lastAt || { x: this.x, y: this.y };
      this.x = last.x;
      this.y = last.y;
      this.die(world, C);
    } else {
      for (const p of this.pieces) if (!p.dead) this.lastAt = { x: p.x, y: p.y };
    }
  }

  /** IV, with nothing left to put back: it sheds a small at you instead. */
  throwMite(world) {
    const a = rand(0, TAU);
    const p = this.pieces.find((q) => !q.dead);
    if (!p) return;
    const t = this.claim(new Enemy(TYPE_BY_ID.mite, p.x, p.y, { staged: false, spawnIn: 0.2 }));
    t.vx = Math.cos(a) * rand(260, 360);
    t.vy = Math.sin(a) * rand(260, 360);
    t.thrown = 0.5;
    world.enemies.push(t);
    ring(p.x, p.y, 6, 120, 0.3, TYPE_BY_ID.mite.glow, 2);
  }

  /**
   * The death is RECURSION run backwards: the last piece subdivides, and each
   * subdivision subdivides, down to sparks. The wreck it leaves is scattered
   * dust in the shape the thing had -- which the next wave then arrives into.
   */
  dieExtra(world, k) {
    if (this.shattered === undefined) this.shattered = 0;
    const want = Math.floor(k * 5);
    while (this.shattered < want) {
      this.shattered++;
      const n = 3 ** this.shattered;
      const rr = 90 / this.shattered;
      for (let i = 0; i < Math.min(n, 18); i++) {
        const a = (i / Math.min(n, 18)) * TAU + this.shattered;
        spark(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr,
          Math.cos(a) * rand(60, 220), Math.sin(a) * rand(60, 220),
          this.shattered % 2 ? TYPE_BY_ID.fractal.color : '#ffffff', rand(0.4, 0.9), 2);
      }
      ring(this.x, this.y, rr, rr * 3, 0.3, TYPE_BY_ID.fractal.glow, 3);
      audio.pop(0.6);
    }
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = F();
    const T = TYPE_BY_ID.fractal;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);

    /*
     * The lines of the figure: core to each middle, middle to each of its
     * smalls. It is what makes the thing read as one object with parts rather
     * than as a cloud of triangles -- and a line that is not drawn is a small
     * that has got loose, which is the fight's one piece of information.
     */
    ctx.strokeStyle = rgba(T.color, (0.16 + 0.24 * this.flare) * open);
    ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    for (const m of this.mids) {
      if (m.dead) continue;
      for (const p of this.pieces) {
        if (p.dead) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(m.x, m.y);
      }
      for (const t of m.mites) {
        if (t.dead || !t.host) continue;
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(t.x, t.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawBeams(ctx);

    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.2 + 0.1 * Math.sin(this.t * (1.4 + this.stage)) + this.flare * 0.6;
    for (const p of this.pieces) {
      if (p.dead) continue;
      drawGlow(ctx, T.glow, p.x, p.y, (this.split ? C.pieceOrbit : C.midR) * 1.5, pulse * open);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(3, (world) => new Fractal(world));
