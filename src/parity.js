/*
 * PARITY. Anomaly VI, violet.
 *
 * Two mirrored crescents orbiting a point a hundred and eighty degrees apart,
 * sharing one bar -- and only one of them is real at a time. They trade places
 * on a clock, and the one that is not real is a wireframe standing exactly
 * where it would be if it were.
 *
 * Two rules, pulling against each other on purpose.
 *
 * PANES BREAK IN PAIRS. Shatter one and its twin on the other crescent goes
 * with it, so damage on the structure is doubled and the mirror stays a
 * mirror. That feels generous.
 *
 * ONLY THE REAL HALF TAKES DAMAGE TO THE BAR. The phased one is out of the
 * world entirely -- not a flag, not an armour value, simply not in
 * world.enemies, which is the only thing "cannot be touched" has ever meant
 * here. So half of what you might shoot is a picture, and that is what the
 * generosity was paying for.
 *
 * The parked mechanism is doing the work again, and this is the third boss to
 * need it: ORDINAL's garrison waits behind a wall with it, DYNAMO's core
 * shelters inside a circuit with it, and here it is what makes a reflection a
 * reflection. Auto aim picks by distance and cannot be told that a thing is
 * not really there -- so the thing is not really there.
 *
 * And the mirror-line is not scenery. It is the seam the two of them are
 * reflected across, it precesses, and when it comes round onto the turret you
 * are briefly on both sides of it -- which is corruption, and the only
 * pressure this fight makes that is not a thrown ECHO. Without it this boss
 * cost the player nothing at all: measured on build 133, zero corrupted
 * frames, a mean of zero things stuck to the turret, and an intake it never
 * once taxed.
 *
 *   I      slow orbit, slow swaps.
 *   II     panes half gone: the swaps quicken and the mirror-line precesses.
 *   MERGE  the halves rush together and try to fuse. Both real for a few
 *          seconds -- the one window of genuinely double damage, dressed as
 *          a threat.
 *   III    post-merge the orbits desynchronise and the line spins up.
 *   IV     one crescent shatters for good. The survivor is permanently real
 *          and comes down spinning what panes it has left. The fight's
 *          premise breaking is the last stage.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { ring, ripple, spark, shake, flash, explode } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Boss } from './boss.js';

const P = () => CFG.parity;

/*
 * The arrival draws everything twice, once on each side of the centre line,
 * and the fourth beat is the two of them failing to be one thing.
 */
const ARRIVAL = [
  { text: 'THERE ARE TWO OF EVERYTHING HERE.', hold: 3.2 },
  { text: 'ONE OF EACH HAS BEEN HIDDEN FROM YOU.', hold: 3.8 },
  { text: 'IT HAS COME TO BALANCE THE ACCOUNT.', hold: 3.6 },
  { text: 'PARITY', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE ACCOUNT IS ODD.', hold: 2.8 },
  { text: 'NOTHING HERE HAS A TWIN ANY MORE.', hold: 3.4 },
  { text: 'AT THE EDGE OF THE FIELD, SOMETHING HAS DRAWN A LINE.', hold: 4.8 },
];

/*
 * Violet skies, rotated from ORDINAL's and then darkened through the middle
 * of the ramp by hand. Generated, stages II and III came out close enough to
 * ORDINAL's own magenta to be mistaken for it at a glance -- which matters
 * more here than anywhere, because this is the boss whose whole subject is
 * two things that look the same.
 */
const MOODS = [
  { top: '#0a041a', mid: '#1e0a44', low: '#040110', line: '#5b2ca0', neb: ['#320c78', '#240a58', '#2a0868'], accent: '#a86bff' },
  { top: '#0f0626', mid: '#2c0e64', low: '#060218', line: '#7a3fd0', neb: ['#4a12a8', '#320c78', '#3c0e90'], accent: '#c396ff' },
  { top: '#170a34', mid: '#4212a0', low: '#0a0322', line: '#a86bff', neb: ['#6a1ae0', '#4a12a8', '#5814c4'], accent: '#e6d6ff' },
  { top: '#241250', mid: '#6420e0', low: '#120840', line: '#d3b3ff', neb: ['#8b45ff', '#6a1ae0', '#7a2ef0'], accent: '#ffffff' },
];

export class Parity extends Boss {
  constructor(world) {
    super(world, 6);
    const C = P();
    this.hub = { x: world.shooter.x, y: world.shooter.y - C.standoff };
    this.x = this.hub.x;
    this.y = this.hub.y;
    this.arriving = C.arrive;

    this.orbitA = 0;
    this.lineA = 0; // the mirror-line's own angle
    this.real = 0; // which half is real right now
    this.swapT = C.swapEvery[0];
    this.tell = 0;
    this.merge = 0;
    this.merged = false;
    this.lone = false;
    this.echoT = C.echoEvery[0];

    /*
     * The pair. `pool` is the one bar they share: damage taken by whichever
     * half is real comes off it, and both halves are written back to it every
     * frame, so there is never a moment where the two disagree about how hurt
     * the thing is.
     */
    this.halves = [];
    for (let i = 0; i < 2; i++) {
      const h = this.body('parity', this.hub.x, this.hub.y);
      h.side = i;
      h.panes = [];
      for (let k = 0; k < C.panes; k++) {
        const q = this.body('pane', this.hub.x, this.hub.y);
        q.at = (k / (C.panes - 1) - 0.5) * C.paneArc;
        q.host = h;
        q.twinIndex = k;
        h.panes.push(q);
      }
      this.halves.push(h);
    }
    this.core = this.halves[0];
    this.poolMax = this.core.maxHp;
    this.pool = this.poolMax;
    this.lastHp = [this.poolMax, this.poolMax];

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  parts() {
    return [...this.halves[0].panes, ...this.halves[1].panes];
  }

  /** How much of the mirror is still standing. Panes only -- they come in pairs. */
  shellFrac() {
    const all = this.parts();
    return all.filter((p) => !p.dead).length / all.length;
  }

  get coreFrac() {
    return clamp(this.pool / this.poolMax, 0, 1);
  }

  /**
   * Whichever half is currently real; both, during MERGE.
   *
   * `lone` used to mean "both", because there only ever was one left. Now IV
   * keeps its twin -- retired from reality, not from the field -- so the rule
   * is the same in the last stage as in the first: one of the two is a
   * picture, and the picture is not in world.enemies.
   */
  realHalves() {
    if (this.merge > 0) return this.halves.filter((h) => !h.dead && !h.retired);
    const h = this.halves[this.real];
    return h && !h.dead && !h.retired ? [h] : [];
  }

  gauge() {
    const C = P();
    const arriving = this.arriving > 0;
    const d = dressOf(6);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: [{ label: 'MIRROR', seg: this.parts().length, frac: this.shellFrac() }],
      marks: [
        { at: C.mergeAt, past: !arriving && this.coreFrac <= C.mergeAt },
        { at: C.loneAt, past: !arriving && this.coreFrac <= C.loneAt },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  place(dt) {
    const C = P();
    // INVERSION drives both angles itself -- it is the one beat where where
    // the halves are and which way the seam lies are the subject rather than
    // the background, so nothing else may advance them under it.
    if (this.inverting === undefined) {
      this.orbitA += C.orbitSpin * dt * (this.stage >= 3 ? 1.5 : 1);
      this.lineA += C.lineSpin[this.stage - 1] * dt;
    }
    const ecc = this.stage >= 2 ? C.eccentric : 0;
    // MERGE draws the two together; IV has only one left to place.
    const pull = this.merge > 0 ? 1 - clamp(this.merge / C.mergeFor, 0, 1) : 0;
    const near = 1 - Math.sin(pull * Math.PI) * 0.92;

    for (let i = 0; i < this.halves.length; i++) {
      const h = this.halves[i];
      if (h.dead) continue;
      const a = this.orbitA + i * Math.PI;
      // ...and it stays a pair to the end: the survivor no longer collapses
      // onto the hub in IV, because there is still something opposite it.
      const rr = C.orbit * (1 + ecc * Math.sin(a * 2)) * near;
      h.x = this.hub.x + Math.cos(a) * rr;
      h.y = this.hub.y + Math.sin(a) * rr;
      // Each crescent's open side faces the middle, so the pair reads as one
      // thing with a gap rather than as two objects that happen to be near.
      h.angle = a + Math.PI;
      h.vx = 0; h.vy = 0; h.av = 0;

      for (const q of h.panes) {
        if (q.dead) continue;
        /*
         * On the OUTWARD face -- along `a`, away from the hub -- not along
         * the crescent's own facing, which points inward at its twin.
         *
         * Placed inward they sat behind the crescent from the turret's point
         * of view, and auto aim picks the nearest thing: measured, the mirror
         * was still at a hundred percent a hundred seconds into the fight,
         * so the pane-pairing rule, stage II and the MERGE heal condition had
         * all never once been exercised. The near crescent's panes are at 180
         * now against its own 210, which is what makes them the armour they
         * are supposed to be.
         */
        const b = a + q.at + (this.lone ? this.flailA || 0 : 0);
        q.x = h.x + Math.cos(b) * C.paneR;
        q.y = h.y + Math.sin(b) * C.paneR;
        q.angle = b + Math.PI / 2;
        q.vx = 0; q.vy = 0; q.av = 0;
      }
    }
    if (this.lone) this.flailA = (this.flailA || 0) + C.flailSpin * dt;

    const live = this.halves.filter((h) => !h.dead);
    if (live.length) {
      this.x = live.reduce((n, h) => n + h.x, 0) / live.length;
      this.y = live.reduce((n, h) => n + h.y, 0) / live.length;
    }
  }

  /**
   * The bar the two of them share.
   *
   * Damage lands on whichever half is real; this takes what each one lost
   * since the last frame, spends it out of the one pool, and writes the pool
   * back to both. So the halves can never disagree about how hurt the thing
   * is -- and during MERGE, when both are real, the two dents *add*, which is
   * exactly the window that beat is for.
   */
  syncPool() {
    let took = 0;
    for (let i = 0; i < this.halves.length; i++) {
      const h = this.halves[i];
      if (h.retired) continue;
      /*
       * A half that died this frame lost everything it had left, and that
       * still comes off the pool.
       *
       * Skipping dead halves instead was a fight that never ended: a single
       * hit big enough to take a crescent below zero killed it between
       * frames, the killing blow was never counted, the pool stopped just
       * short of empty, and with both halves gone there was nothing on the
       * field but ECHOes. Measured, it ran to the nine-hundred-second cap
       * with the bar still showing health.
       */
      const now = h.dead ? 0 : h.hp;
      const lost = this.lastHp[i] - now;
      if (lost > 0) took += lost;
    }
    if (took > 0) this.pool = Math.max(0, this.pool - took);
    for (let i = 0; i < this.halves.length; i++) {
      const h = this.halves[i];
      if (h.retired) continue;
      // The pool is the authority on whether this thing is alive, not the
      // body: a crescent is a face of one account, and the account is shared.
      if (h.dead && this.pool > 0) {
        h.dead = false;
        h.spawnIn = 0;
        h.flash = 1;
      }
      h.hp = Math.max(1, this.pool);
      h.maxHp = this.poolMax;
      this.lastHp[i] = h.hp;
    }
  }

  /**
   * Which halves are on the field.
   *
   * A phased crescent is out of world.enemies -- the parked mechanism, the
   * same one ORDINAL's garrison and DYNAMO's core use. Auto aim picks by
   * distance and cannot be told that something is only a reflection, so the
   * reflection is not there to pick. Its panes go with it: a pane hanging off
   * a half that is not real would be a solid piece of a picture.
   */
  syncReach(world, dt = 0) {
    const live = this.realHalves();
    for (let i = 0; i < this.halves.length; i++) {
      const h = this.halves[i];
      const real = !h.dead && live.includes(h);
      for (const body of [h, ...h.panes]) {
        if (body.dead) continue;
        const at = world.enemies.indexOf(body);
        if (real && at < 0) world.enemies.push(body);
        else if (!real && at >= 0) world.enemies.splice(at, 1);
        /*
         * A parked body is off world.enemies, so nothing steps it -- and its
         * own materialise timer is stepped by that update. Left alone it
         * never runs out, and the body stays at a third of its size for the
         * rest of the fight. Found on INVERSION: the panes it puts back come
         * back on both halves, and the reflection's seven were still
         * arriving, permanently, small. Ticked here at the same rate the
         * enemy would have ticked it.
         */
        if (!real && body.spawnIn > 0) body.spawnIn = Math.max(0, body.spawnIn - dt * 2.2);
      }
      h.phased = !real;
    }
  }

  // -------------------------------------------------------------- beats

  /**
   * The swap, with a tell.
   *
   * For half a second before it lands both halves ghost, so the change is
   * something you watch happen rather than something that has happened. The
   * same reason DYNAMO telegraphs its blink: an instantaneous change of which
   * things are real is indistinguishable from a bug.
   */
  /**
   * The seam, across the turret.
   *
   * The mirror-line runs through the hub at `lineA`, so how near it comes to
   * the turret is a pure function of its angle: the turret sits directly
   * below the hub, which puts it on the line exactly twice per precession.
   * Slow in I, four times as fast by IV -- the same escalation the swaps get,
   * on the one part of this boss that was already drawn and doing nothing.
   */
  stepSeam(world) {
    const C = P();
    const s = world.shooter;
    const dx = s.x - this.hub.x;
    const dy = s.y - this.hub.y;
    // Perpendicular distance to an infinite line through the hub.
    const off = Math.abs(dx * Math.sin(this.lineA) - dy * Math.cos(this.lineA));
    if (off > C.seamWidth) return;
    world.shock = Math.max(world.shock, C.seamShock);
    if (Math.random() < 0.3) {
      spark(s.x + rand(-20, 20), s.y + rand(-20, 20), rand(-70, 70), rand(-70, 70),
        TYPE_BY_ID.parity.glow, 0.3, 2);
    }
  }

  stepSwap(world, dt) {
    const C = P();
    if (this.lone || this.merge > 0) return;
    const every = C.swapEvery[this.stage - 1];
    if (!every) return;
    if (this.tell > 0) {
      this.tell -= dt;
      if (this.tell <= 0) {
        this.real = 1 - this.real;
        for (const h of this.halves) {
          if (!h.dead) ring(h.x, h.y, 10, 150, 0.35, TYPE_BY_ID.parity.glow, 3);
        }
        audio.pop(0.8);
      }
      return;
    }
    this.swapT -= dt;
    if (this.swapT > 0) return;
    this.swapT = every;
    this.tell = C.tell;
    audio.chime(360);
  }

  /**
   * MERGE. The halves rush together and try to fuse.
   *
   * Both are real for the whole of it, which makes it the fight's one window
   * of genuinely double damage -- the pool takes what each of them takes. It
   * is dressed as a threat because that is funnier and because it is also
   * true: if the window closes with the mirror intact it gets a little of the
   * bar back, so ignoring it is the only way it costs you anything.
   */
  startMerge(world) {
    const C = P();
    this.merged = true;
    this.merge = C.mergeFor;
    world.bossLine = 'IT IS TRYING TO BE ONE THING.';
    this.lineFor = 3.4;
    flash(0.4, TYPE_BY_ID.parity.color);
    ripple(this.hub.x, this.hub.y, 2.8, 1000);
    shake(20);
    audio.boom();
  }

  endMerge(world) {
    const C = P();
    // It only mends if you let it: the window closing on a whole mirror is
    // the one thing in this fight that gives anything back.
    if (this.shellFrac() > 0.6) {
      this.pool = Math.min(this.poolMax, this.pool + this.poolMax * C.mergeHeal);
      for (const h of this.halves) if (!h.dead) this.beams.push({ p: h, t: 0.55 });
      audio.chime(300);
    }
    flash(0.5, '#ffffff');
    for (let i = 0; i < 3; i++) {
      ring(this.hub.x, this.hub.y, 10 + i * 26, 420 + i * 200, 0.45 + i * 0.12,
        i % 2 ? '#ffffff' : TYPE_BY_ID.parity.glow, 5 - i);
    }
    shake(26);
    audio.boom();
    background.surge(2);
    world.bossLine = null;
  }

  /**
   * A pane and its twin, together.
   *
   * The mirror stays a mirror: there is never a pane on one crescent without
   * the matching one on the other. It is why breaking the structure is twice
   * as fast as it looks, and it is the visible half of the bargain whose
   * other half is that only one crescent is ever real.
   */
  pairPanes(world) {
    for (const h of this.halves) {
      for (const q of h.panes) {
        if (!q.dead || q.paired) continue;
        q.paired = true;
        const other = this.halves[1 - h.side];
        const twin = other && other.panes[q.twinIndex];
        if (twin && !twin.dead) {
          twin.dead = true;
          twin.paired = true;
          explode(twin.x, twin.y, twin.r, twin.type.color, twin.type.glow, 1.3);
          ring(twin.x, twin.y, 3, twin.r * 5, 0.3, twin.type.glow, 2);
          // A line between them as they go, so the pairing is seen rather
          // than inferred from a second thing having vanished.
          this.beams.push({ p: twin, t: 0.4 });
        }
      }
    }
  }

  /** Two ECHOes, mirrored. Never one. */
  throwEchoes(world) {
    const C = P();
    const from = this.realHalves()[0] || this.halves[0];
    if (!from) return;
    for (const s of [1, -1]) {
      const a = Math.atan2(world.shooter.y - from.y, world.shooter.x - from.x) + s * 0.42;
      const d = this.claim(new Enemy(TYPE_BY_ID.echo, from.x, from.y, { staged: false, spawnIn: 0.2 }));
      d.vx = Math.cos(a) * rand(200, 280);
      d.vy = Math.sin(a) * rand(200, 280);
      d.thrown = 0.45;
      world.enemies.push(d);
    }
    ring(from.x, from.y, 6, 110, 0.28, TYPE_BY_ID.echo.glow, 2);
    audio.pop(0.7);
  }

  enterStage(world, n) {
    const C = P();
    this.stage = n;
    this.flare = 1;
    this.swapT = C.swapEvery[n - 1] || 0;
    this.echoT = C.echoEvery[n - 1];
    if (n >= 4) this.retireTwin(world);
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT HAS GIVEN UP ON SYMMETRY.'
      : n >= 3 ? 'THE HALVES NO LONGER AGREE.'
        : 'THE HALVES DISAGREE.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.parity.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  /**
   * INVERSION. The halves trade places, and the picture becomes the thing.
   *
   * The setpiece the back half never had, and the beat that turns III into
   * IV. The seam sweeps a full turn while the two crescents walk half a
   * circle -- so each ends where the other began -- and at the midpoint,
   * reality flips. What you were shooting is now the reflection, standing
   * exactly where the reflection was standing, and the thing you could not
   * touch is the thing in front of you.
   *
   * Then the panes come back. That is where this fight's length is: a stage
   * boundary only re-partitions health the boss already had, and fourteen
   * panes at 55% is the only number in this build that adds any.
   */
  startInversion(world) {
    const C = P();
    this.inverting = 0;
    this.invA0 = this.orbitA;
    this.invL0 = this.lineA;
    this.flipped = false;
    this.invBack = false;
    world.bossLine = 'INVERSION';
    this.lineFor = 3.6;
    this.hold(world, 0.7);
    flash(0.45, TYPE_BY_ID.parity.color);
    ripple(this.hub.x, this.hub.y, 2.8, 1000);
    shake(22);
    audio.boom();
    background.surge(2);
  }

  stepInversion(world, raw) {
    const C = P();
    this.inverting += raw;
    const k = clamp(this.inverting / C.invertFor, 0, 1);
    const e = k * k * (3 - 2 * k);
    // Half a circle for the pair, a whole one for the seam: the crescents
    // change ends while the mirror-line turns all the way round them.
    this.orbitA = this.invA0 + Math.PI * e;
    this.lineA = this.invL0 + TAU * e;

    if (!this.flipped && k >= 0.5) {
      this.flipped = true;
      this.real = 1 - this.real;
      flash(0.5, '#ffffff');
      for (const h of this.halves) {
        if (!h.dead) ring(h.x, h.y, 12, 260, 0.45, TYPE_BY_ID.parity.glow, 4);
      }
      shake(18);
      audio.boom();
    }
    if (k < 1) return false;
    if (!this.invBack) {
      this.invBack = true;
      this.reform(world, C.invertHp, { sweep: 1.1 });
      /*
       * A pane that came back is a pane that can pair again. `paired` is what
       * stops pairPanes taking a twin twice for the same break, and leaving
       * it set on a revived pane retires the rule that makes this a mirror.
       */
      for (const h of this.halves) for (const q of h.panes) if (!q.dead) q.paired = false;
      return false;
    }
    if (this.inverting < C.invertFor + 1.1) return false;
    this.inverting = undefined;
    world.bossLine = null;
    return true;
  }

  /**
   * IV: the twin is retired from reality, and stays.
   *
   * This used to shatter one crescent, and that threw the premise away -- one
   * crescent is not a mirror, so the last stage of the mirror fight had no
   * mirror in it. Now the twin keeps its place opposite the survivor, keeps
   * mimicking it, and loses every pane the survivor loses; it simply never
   * comes back round to being the real one. The premise survives to the end.
   * What changes is that the reflection is now provably empty.
   */
  retireTwin(world) {
    const twin = this.halves[1 - this.real] || this.halves[1];
    if (twin) {
      // Retired, not dead: syncPool brings a *dead* half back while the pool
      // has anything in it, and the drawing code needs a body to outline.
      twin.retired = true;
      twin.mirror = true;
      twin.dead = false;
      ring(twin.x, twin.y, 14, 420, 0.6, TYPE_BY_ID.parity.glow, 4);
      ripple(twin.x, twin.y, 2.4, 800);
    }
    this.lone = true;
    this.y0 = this.y;
    this.fall = 0;
    flash(0.6, '#ffffff');
    shake(32);
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = P();
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
    this.pairPanes(world);
    this.syncReach(world, dt);
    this.syncPool();

    /*
     * Dead first, before anything else gets a turn.
     *
     * Checked last, a blow that emptied the pool could still fall through
     * into the MERGE trigger -- which is read off the same bar -- and start a
     * setpiece over a corpse. Nothing that follows this line has any business
     * running once the account is settled.
     */
    if (this.pool <= 0) { this.die(world, C); return; }

    if (this.merge > 0) {
      this.merge -= world.dtRaw || dt;
      // No stage jump here: endMerge only records that it happened, and the
      // ladder below steps 1 -> 2 -> 3 one at a time. Calling enterStage(3)
      // from here skipped II entirely -- measured, it never ran at all.
      if (this.merge <= 0) { this.merge = 0; this.endMerge(world); }
      background.setFocus(this.x, this.y);
      return;
    }

    /*
     * INVERSION, held above everything else for the same reason MERGE is: it
     * drives the orbit and the seam itself, and a swap or an ECHO landing
     * inside it would be a second thing happening during the one beat this
     * fight asks you to watch.
     */
    if (this.inverting !== undefined) {
      const done = this.stepInversion(world, world.dtRaw || dt);
      this.place(0); // ...on this frame's angles, not last frame's
      if (done) {
        this.inverted = true;
        this.enterStage(world, 4);
      }
      background.setFocus(this.x, this.y);
      return;
    }

    this.stepSwap(world, dt);
    this.stepSeam(world);

    // IV brings the survivor down on you.
    if (this.lone) {
      this.fall = Math.min(1, (this.fall || 0) + (world.dtRaw || dt) / C.descendFor);
      const e = this.fall * this.fall * (3 - 2 * this.fall);
      const s = world.shooter;
      this.hub.y = this.y0 + (s.y - C.close - this.y0) * e;
      this.hub.x += (s.x - this.hub.x) * Math.min(1, dt * 0.5);
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (this.shellFrac() <= C.crackAt && want < 2) want = 2;
    if (frac <= C.mergeAt && !this.merged) { this.startMerge(world); return; }
    if (this.merged && want < 3) want = 3;
    /*
     * IV is not entered, it is arrived at through INVERSION -- and only from
     * III. A bar that falls past both gates on one frame still climbs the
     * ladder a rung at a time, which is the bug this game has shipped four
     * times: FRACTAL never divided, GNOMON never planted its needle, DYNAMO
     * and PARITY both skipped a stage whole.
     */
    if (frac <= C.loneAt && this.stage === 3 && !this.inverted) {
      this.startInversion(world);
      return;
    }
    if (frac <= C.loneAt && this.inverted && want < 4) want = 4;
    // One stage at a time: the triggers are independent -- panes for II, the
    // bar for III and IV -- so two can come true on the same frame.
    if (want > this.stage) this.enterStage(world, this.stage + 1);

    this.echoT -= dt;
    if (this.echoT <= 0) {
      this.echoT = C.echoEvery[this.stage - 1];
      this.throwEchoes(world);
    }

    const through = 1 - (this.shellFrac() * 0.35 + frac * 0.65);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);
  }

  /** Everything has to be back on the field for the wreck to be shed. */
  clear(world) {
    for (const h of this.halves) {
      h.retired = true;
      if (!world.enemies.includes(h)) world.enemies.push(h);
      h.dead = true;
    }
    super.clear(world);
  }

  /**
   * The death: it puts the mirror back, and then the mirror goes.
   *
   * Every pane it ever lost reassembles in place -- for one held beat the
   * whole thing stands restored, reflecting the field back at itself -- and
   * then the entire sheet shatters at once. It is the only ending in the game
   * that repairs the boss before killing it, and that is the point: the last
   * thing you see is what it was.
   */
  dieExtra(world, k) {
    if (this.restored === undefined) {
      this.restored = true;
      for (const h of this.halves) {
        for (const q of h.panes) {
          if (!q.dead) continue;
          q.dead = false;
          q.hp = Math.max(1, Math.round(q.maxHp * 0.3));
          q.spawnIn = 0;
          q.flash = 1;
          if (!world.enemies.includes(q)) world.enemies.push(q);
        }
      }
      flash(0.4, '#e6d6ff');
      audio.chime(280);
    }
    // ...and it holds, whole, until the arrest takes it.
    if (k > 0.72 && !this.rained) {
      this.rained = true;
      flash(0.6, '#ffffff');
      ring(this.x, this.y, 20, 700, 0.6, TYPE_BY_ID.parity.glow, 4);
      shake(24);
    }
  }

  /**
   * The field, reflected across the seam.
   *
   * The most striking thing available in any of these seven fights, and it is
   * one transform: the turret and everything it has in the air, mirrored
   * through the line, drawn as a ghost on the far side. Your own gun, firing
   * your own shots, at the boss, from the other side of it.
   *
   * It also makes the seam mean something before it costs you anything. The
   * reflection's distance from you is exactly twice the seam's, so the two
   * turrets close on each other as the line comes round -- and the frame they
   * touch is the frame `stepSeam` corrupts you on. The one pressure this
   * fight makes had no tell but the line itself; now the tell is your own
   * reflection walking toward you.
   */
  drawMirror(ctx, world, open) {
    const C = P();
    const s = world.shooter;
    const hx = this.hub.x;
    const hy = this.hub.y;
    // Reflection through a line at `lineA` through the hub.
    const c2 = Math.cos(2 * this.lineA);
    const s2 = Math.sin(2 * this.lineA);
    const mx = (x, y) => hx + (x - hx) * c2 + (y - hy) * s2;
    const my = (x, y) => hy + (x - hx) * s2 - (y - hy) * c2;

    // How close the seam is to the turret, which is how close the reflection
    // is to standing in the same place as the thing it reflects.
    const off = Math.abs((s.x - hx) * Math.sin(this.lineA) - (s.y - hy) * Math.cos(this.lineA));
    const near = clamp(1 - off / (C.seamWidth * 5), 0, 1);
    const a = (0.2 + near * 0.55) * open;
    if (a <= 0.01) return;

    const gx = mx(s.x, s.y);
    const gy = my(s.x, s.y);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Its shots, first, so the ghost turret sits on top of its own muzzle.
    ctx.lineCap = 'round';
    for (const p of world.projectiles) {
      const px = mx(p.x, p.y);
      const py = my(p.x, p.y);
      // The velocity reflects too, or the tracers trail the wrong way.
      const vx = p.vx * c2 + p.vy * s2;
      const vy = p.vx * s2 - p.vy * c2;
      ctx.strokeStyle = rgba('#e6d6ff', a * 0.6);
      ctx.lineWidth = p.r * 1.1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - vx * p.trail, py - vy * p.trail);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    /*
     * The turret itself, as an outline rather than a copy. Reflecting the
     * real drawing means a mount, six sockets and whatever is bolted into
     * them, at a fifth of the alpha -- measured as a smear. Three circles and
     * a barrel is the thing it is a reflection *of*, which is what reads.
     */
    const ga = this.lineA * 2 - s.aim;
    ctx.strokeStyle = rgba('#e6d6ff', a);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(ga) * 34, gy + Math.sin(ga) * 34);
    ctx.stroke();
    for (const r of [20, 12, 5]) {
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, TAU);
      ctx.stroke();
    }
    /*
     * ...and the base, which is the part that says "turret" at a glance --
     * carried round with the reflection rather than left level. A direction
     * reflects to `2 * lineA - itself`, so the ghost's own up is
     * `2 * lineA + PI/2`, and its deck lies across that.
     */
    const up = 2 * this.lineA + Math.PI / 2;
    const ux = Math.cos(up);
    const uy = Math.sin(up);
    const bx = gx - ux * 16;
    const by = gy - uy * 16;
    ctx.beginPath();
    ctx.moveTo(bx + uy * 26, by - ux * 26);
    ctx.lineTo(bx - uy * 26, by + ux * 26);
    ctx.stroke();

    if (near > 0.35) drawGlow(ctx, TYPE_BY_ID.parity.glow, gx, gy, 70, near * 0.5 * open);
    ctx.restore();
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = P();
    const T = TYPE_BY_ID.parity;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);

    // Not through the ending. The mirror-line and the field reflected across
    // it are what this boss DOES; a hazard still drawn after the bar empties
    // is the fight carrying on through its own payout, and GNOMON's shadow has
    // been gated this way since it was written.
    if (!arriving && this.dying <= 0) this.drawMirror(ctx, world, open);

    /*
     * The mirror-line: a thin bright axis through the middle of the pair.
     * Nothing enforces it in the simulation -- the crescents are simply
     * placed opposite each other -- but it is the thing that makes the two of
     * them read as reflections rather than as a pair of objects.
     *
     * Drawn in IV as well now. It used to stop the moment one crescent went,
     * which was correct when the mirror ended there and is wrong now that it
     * does not.
     */
    if (!arriving && this.dying <= 0) {
      const len = 520;
      const g2 = ctx.createLinearGradient(
        this.hub.x - Math.cos(this.lineA) * len, this.hub.y - Math.sin(this.lineA) * len,
        this.hub.x + Math.cos(this.lineA) * len, this.hub.y + Math.sin(this.lineA) * len);
      g2.addColorStop(0, rgba(T.glow, 0));
      g2.addColorStop(0.5, rgba('#e6d6ff', 0.42 * open));
      g2.addColorStop(1, rgba(T.glow, 0));
      ctx.strokeStyle = g2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(this.hub.x - Math.cos(this.lineA) * len, this.hub.y - Math.sin(this.lineA) * len);
      ctx.lineTo(this.hub.x + Math.cos(this.lineA) * len, this.hub.y + Math.sin(this.lineA) * len);
      ctx.stroke();
    }

    /*
     * The phased half, drawn as a wireframe. It is out of world.enemies, so
     * nothing else draws it -- and it has to be drawn, because a reflection
     * you cannot see is not a reflection, it is an absence.
     */
    for (const h of this.halves) {
      if (h.dead || !h.phased) continue;
      ctx.save();
      ctx.globalAlpha = 0.3 * open;
      h.draw(ctx, world);
      for (const q of h.panes) if (!q.dead) q.draw(ctx, world);
      ctx.restore();
    }

    // The tell: both halves ringed while the swap is landing.
    if (this.tell > 0) {
      const k = clamp(this.tell / C.tell, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (const h of this.halves) {
        if (h.dead) continue;
        ctx.strokeStyle = rgba('#ffffff', 0.5 * (1 - k));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, C.coreR * (1.2 + k * 0.6), 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawBeams(ctx);

    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.2 + 0.1 * Math.sin(this.t * (1.6 + this.stage)) + this.flare * 0.6;
    for (const h of this.halves) {
      if (h.dead || h.phased) continue;
      drawGlow(ctx, T.glow, h.x, h.y, C.orbit * 2.2, pulse * open);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(6, (world) => new Parity(world));
