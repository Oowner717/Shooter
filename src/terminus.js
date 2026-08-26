/*
 * TERMINUS. Anomaly VII, crimson. The last one.
 *
 * Every other boss in this game stands in front of the turret. This one does
 * not stand anywhere: it is a ring of thirty-two boundary segments closed
 * around *you*, and the fight is how much of it is left.
 *
 * That single decision pays for three things at once.
 *
 * LAW 2 IS FREE, for the first and only time. Every other fight has had to be
 * argued into aim range -- DYNAMO's pylons pulled in from 430, AMPLITUDE's
 * span narrowed from the field's full width, PARITY's crescents given an
 * orbit so that both of them pass through reach. A ring centred on the turret
 * puts every one of its segments at exactly the same distance from it. At 250
 * against a base aim range of 400 there is no far side to worry about, which
 * is a pleasant thing to be true of the boss whose entire subject is
 * distance.
 *
 * THE PRESSURE IS THE BOUNDARY BEING NEAR. Nothing is thrown at you here. The
 * ring contracts at a rate proportional to how much of it is standing and
 * pushes back out in proportion to how much you have opened, so the squeeze
 * is the sign of one subtraction and it is entirely yours to govern. It is
 * the only corruption in the game the player is in charge of.
 *
 * AND THE CORE CANNOT BE ARMOURED, SO IT ISN'T. It rides the ring instead of
 * sitting at the middle of it, and while it patrols it rides *outside* --
 * strictly further from the turret than every segment, so the assist cannot
 * pick it while any segment lives. To mend a gap it has to dip *inside*,
 * where it is nearer than everything else and the assist takes it instantly.
 * Five bosses learned by measurement that armour cannot express priority and
 * geometry can. This one is built out of that.
 *
 *   I       one ring, turning slowly, closing slowly.
 *   II      a second sparser ring inside it, turning the other way: two
 *           lattices of moving gaps.
 *   ECLIPSE both rings slam to the floor and hold, and each segment flashes
 *           one of the six prior tones before the whole thing is thrown back
 *           out. The one explicit echo of the other six.
 *   III     it lets go of the ring and takes what is left of it to the middle
 *           of the field as a double square frame -- ORDINAL's silhouette, in
 *           crimson -- and turns four beams out of itself.
 *   IV      the frame breaks orbit and the whole of what is left comes down
 *           together. All-out, both sides.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { ring, ripple, spark, shake, flash, explode } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf, BOSS_TONE } from './anomaly.js';
import { Boss } from './boss.js';

const X = () => CFG.terminus;

/*
 * Six beats, the longest arrival in the game. The sky does not darken for
 * this one -- it closes, and the ring comes in from beyond the edge of the
 * world while it is saying so.
 */
const ARRIVAL = [
  { text: 'THE COUNT WAS NEVER THE POINT.', hold: 3.4 },
  { text: 'EVERYTHING YOU BROKE WAS MEASURING YOU FOR THIS.', hold: 4.6 },
  { text: 'IT IS NOT COMING TO YOU.', hold: 3.0 },
  { text: 'IT IS THE EDGE.', hold: 3.0 },
  { text: 'THE SIMULATION ENDS AT ITS SKIN.', hold: 3.6 },
  { text: 'TERMINUS', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE EDGE IS BROKEN.', hold: 3.0 },
  { text: 'THE FIELD DOES NOT END WHERE ANYTHING SAYS IT DOES.', hold: 4.6 },
  { text: 'NOTHING ELSE IS COUNTING.', hold: 3.2 },
  { text: 'SIMULATION 7749 IS YOURS.', hold: 4.0 },
];

/*
 * Crimson skies, rotated from ORDINAL's and then pulled *away* from the
 * generator's answer at the hot end.
 *
 * Generated, stage IV came out a bright scarlet at the horizon -- which is
 * the colour of the damage flash, so every hit the turret took during the
 * last stage of the last fight vanished into the sky it was taken against.
 * These keep the ramp and end on a bloodless white-pink instead: the edge
 * going, rather than the field on fire.
 */
const MOODS = [
  { top: '#12040a', mid: '#3a0a1c', low: '#080104', line: '#a83f56', neb: ['#5c0a22', '#3d0a20', '#4a0618'], accent: '#ff8a9e' },
  { top: '#1a0410', mid: '#560a26', low: '#0c0106', line: '#d64a6a', neb: ['#820a30', '#5c0a22', '#6b0620'], accent: '#ff6a85' },
  { top: '#240418', mid: '#780a34', low: '#12010a', line: '#ff4d6d', neb: ['#b00c44', '#820a30', '#96063a', ], accent: '#ffc2cd' },
  { top: '#36061f', mid: '#a01a4e', low: '#1e0212', line: '#ffb0c0', neb: ['#d42a68', '#b00c44', '#c01458'], accent: '#ffffff' },
];

/**
 * Move between two places THE WAY ROUND, not the way across.
 *
 * Everything in this fight is arranged about one centre, and a straight line
 * between two points arranged about a centre goes through the centre -- which
 * is where the turret is. Measured: during LAST CLOSE the segments flying
 * from their frame seats back to the ring passed within 6 units of the
 * turret, and the core swapping between hanging over you and riding the wall
 * came within 13. Bodies sliding through the player read as a bug however
 * deliberate they are.
 *
 * So both ends are put into polar coordinates about the centre and the angle
 * and the radius are interpolated separately. The radius never passes through
 * zero, so nothing crosses the middle, and the motion is an arc -- which is
 * also what a thing made of a circle should look like when it moves.
 */
function arcLerp(cx, cy, ax, ay, bx, by, k) {
  const a1 = Math.atan2(ay - cy, ax - cx);
  const r1 = Math.hypot(ax - cx, ay - cy);
  const a2 = Math.atan2(by - cy, bx - cx);
  const r2 = Math.hypot(bx - cx, by - cy);
  let turn = (a2 - a1) % TAU;
  if (turn > Math.PI) turn -= TAU;
  if (turn < -Math.PI) turn += TAU;
  const a = a1 + turn * k;
  const r = r1 + (r2 - r1) * k;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

/**
 * A point on the perimeter of a square of half-width `h`, for `t` in 0..1 --
 * and which way that side runs, so a body placed there can lie along it.
 *
 * The angle is not decoration. Every segment placed with one shared rotation
 * gave twenty parallel bars scattered over a square area, which reads as a
 * spill rather than as ORDINAL's silhouette; lying along their own side they
 * are an outline.
 */
function onSquare(h, t) {
  const u = (((t % 1) + 1) % 1) * 4;
  const side = Math.floor(u);
  const f = u - side;
  const a = -h + 2 * h * f;
  const ang = (side * Math.PI) / 2;
  if (side === 0) return [a, -h, ang];
  if (side === 1) return [h, a, ang];
  if (side === 2) return [-a, h, ang];
  return [-h, -a, ang];
}

export class Terminus extends Boss {
  constructor(world) {
    super(world, 7);
    const C = X();
    // The centre of everything is the turret. Not a standoff, not a hub above
    // it: this boss is drawn around the player, which is the whole of it.
    this.hub = { x: world.shooter.x, y: world.shooter.y };
    this.x = this.hub.x;
    this.y = this.hub.y;
    this.arriving = C.arrive;

    this.radius = C.edge; // it comes in from beyond the world
    this.ringA = 0;
    this.innerA = 0;
    this.patrolA = -Math.PI / 2; // it starts at the top, where you can see it
    this.dip = 0; // 0 patrolling outside the ring, 1 mending inside it
    this.mend = null;
    this.mends = 0;
    this.mendT = C.mendEvery;
    this.eclipse = 0;
    this.eclipsed = false;
    this.frameK = 0; // 0 on the ring, 1 in the frame
    this.frameA = 0;
    this.beamA = 0;
    this.spiral = 0;
    this.limitT = 0;
    this.lurchT = C.lurchEvery[0];
    this.pulse = 0;
    this.fc = { x: this.hub.x, y: this.hub.y - C.frameAt };

    /*
     * The boundary. The outer ring closes -- 32 bodies of r 30 round a circle
     * of radius 250 -- and the inner one deliberately does not: 12 where 24
     * would be needed, so stage II is two lattices of moving gaps rather than
     * two walls. See CFG.terminus, and both closure checks in check-build.
     */
    this.outer = [];
    for (let i = 0; i < C.segs; i++) {
      const p = this.body('bound', this.hub.x, this.hub.y);
      p.at = (i / C.segs) * TAU;
      p.band = 0;
      /*
       * Out of the arena's hands. The floor sits 210 below the turret and this
       * ring is 250 round it, so the clamp pushed the bottom of the boundary
       * inward every frame and the circle had a flat bottom -- see the note in
       * Game.physicsStep. This boss places its own bodies; nothing else may.
       */
      p.pinned = true;
      this.outer.push(p);
    }
    this.inner = [];
    for (let i = 0; i < C.innerSegs; i++) {
      const p = this.body('bound', this.hub.x, this.hub.y);
      p.at = (i / C.innerSegs) * TAU;
      p.band = 1;
      // Not there yet, and `hidden` is what the arrival and the arrest read
      // to leave it alone. Keeping it out of world.enemies is syncReach's job
      // -- the same parked mechanism every boss since ORDINAL has used.
      p.hidden = true;
      p.pinned = true;
      this.inner.push(p);
    }

    this.core = this.body('terminus', this.hub.x, this.hub.y - C.edge);
    this.core.pinned = true;
    world.enemies.push(this.core);

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  /*
   * Everything of this boss's that is a placed body -- and the second ring is
   * not one of those until it exists. The base class walks this to settle the
   * arrival, to arrest the death and to shed the wreck, and the last of those
   * does not check `hidden`: a ring that never arrived would have left a
   * circle of debris where it would have been.
   */
  parts() {
    return this.inner[0].hidden ? [...this.outer] : [...this.outer, ...this.inner];
  }

  /** Everything of the boundary still standing, over everything it had. */
  shellFrac() {
    const all = this.parts();
    if (!all.length) return 0;
    return all.filter((p) => !p.dead).length / all.length;
  }

  /** ...and the outer ring alone, which is what the squeeze is driven by. */
  outerFrac() {
    return this.outer.filter((p) => !p.dead).length / this.outer.length;
  }

  innerFrac() {
    return this.inner.filter((p) => !p.dead).length / this.inner.length;
  }

  /** Whether the second ring is on the field yet. */
  get twoRings() {
    return !this.inner[0].hidden;
  }

  gauge() {
    const C = X();
    const arriving = this.arriving > 0;
    const d = dressOf(7);
    const shells = [{ label: 'BOUND', seg: this.outer.length, frac: this.outerFrac() }];
    // The second row appears when the second ring does, and the bar rebuilds
    // itself around it -- see hud.syncBoss, which reads the shape rather than
    // assuming one.
    if (this.twoRings) {
      shells.push({ label: 'INNER', seg: this.inner.length, frac: this.innerFrac() });
    }
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells,
      marks: [
        { at: C.eclipseAt, past: !arriving && this.eclipsed },
        { at: C.stageBare, past: !arriving && this.coreFrac <= C.stageBare },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /** Where a segment of a given band sits on the ring, right now. */
  ringAt(p) {
    const C = X();
    const rr = this.radius * (p.band ? C.innerAt : 1);
    const a = p.at + (p.band ? this.innerA : this.ringA);
    return [this.hub.x + Math.cos(a) * rr, this.hub.y + Math.sin(a) * rr, a];
  }

  /** ...and where it sits in the frame, once it has let go of the ring. */
  frameAtOf(p, i, n) {
    const C = X();
    /*
     * Every third one makes the inner square and the rest the outer, so the
     * frame keeps ORDINAL's proportion however much of the ring survived to
     * be dragged into it. Interleaved rather than split down the middle of
     * the list, or one whole side of the outer square would be whichever
     * segments happened to be at three o'clock.
     */
    const toInner = i % 3 === 2;
    // ...and III draws in as it comes down, so the frame is a boundary
    // closing rather than a distant object that happens to be square.
    const shrink = 1 - this.spiral * 0.32 - (this.shut || 0) * C.shutBy;
    const h = (toInner ? C.frameR[1] : C.frameR[0]) * shrink;
    const inCount = Math.max(1, Math.floor((n + 1) / 3));
    const seat = toInner ? (i - 2) / 3 : i - Math.floor((i + 1) / 3);
    const count = toInner ? inCount : Math.max(1, n - inCount);
    const [ox, oy, ang] = onSquare(h, seat / count);
    // The inner square turns the other way, the same trick the second ring
    // plays at field scale: two frames whose corners cross rather than one
    // shape with a smaller copy of itself inside it.
    const turn = toInner ? -this.frameA * 1.6 : this.frameA;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return [this.fc.x + ox * c - oy * s, this.fc.y + ox * s + oy * c, turn + ang];
  }

  place(dt) {
    const C = X();
    const arriving = this.arriving > 0;

    if (arriving) {
      // In from beyond the edge of the world, easing to where damage becomes
      // possible exactly as the arrival ends.
      const k = clamp(this.entry, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.radius = C.edge + (C.ring - C.edge) * e;
    }

    this.ringA += C.spin[this.stage - 1] * dt;
    this.innerA += C.innerSpin * dt;
    if (this.frameK > 0) this.frameA += (C.beamSpin * 0.4 + this.spiral * 0.5) * dt;

    const live = this.parts().filter((p) => !p.dead);
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const [rx, ry, ra] = this.ringAt(p);
      if (this.frameK <= 0) {
        p.x = rx; p.y = ry;
        /*
         * Lying ALONG the ring rather than across it, which is a quarter turn
         * off the radius -- and the shape's bright face is on its local -y,
         * so this also puts the lit edge on the outward side. Thirty-two of
         * them then read as one continuous skin seen from the inside, which
         * is the entire visual premise of the fight.
         */
        p.angle = ra + Math.PI / 2;
      } else {
        const [fx, fy, fa] = this.frameAtOf(p, i, live.length);
        const k = this.frameK * this.frameK * (3 - 2 * this.frameK);
        const [px, py] = arcLerp(this.hub.x, this.hub.y, rx, ry, fx, fy, k);
        p.x = px; p.y = py;
        const from = ra + Math.PI / 2;
        // The short way round, or a segment a hair past the wrap takes the
        // long way and visibly spins on its way to its seat.
        let turn = (fa - from) % TAU;
        if (turn > Math.PI) turn -= TAU;
        if (turn < -Math.PI) turn += TAU;
        p.angle = from + turn * k;
      }
      p.vx = 0; p.vy = 0; p.av = 0;
    }
    // A dead segment still has a place: the core has to be able to fly to the
    // gap it is going to mend, and the gap is where the segment would be.
    for (const p of [...this.outer, ...this.inner]) {
      if (!p.dead && !p.hidden) continue;
      const [rx, ry] = this.ringAt(p);
      p.x = rx; p.y = ry;
    }

    if (this.stage >= 3) {
      /*
       * III and IV: it is wherever `fc` is -- the middle of its own frame,
       * and then, once the frame has gone back to being a ring, a point
       * coming down the field inside it.
       */
      this.x = this.fc.x;
      this.y = this.fc.y;
    } else {
      const mul = C.patrolOut + (C.mendIn - C.patrolOut) * this.dip;
      this.x = this.hub.x + Math.cos(this.patrolA) * this.radius * mul;
      this.y = this.hub.y + Math.sin(this.patrolA) * this.radius * mul;
    }
    this.core.x = this.x;
    this.core.y = this.y;
    this.core.vx = 0;
    this.core.vy = 0;
    this.core.armor = C.armorPatrol + (C.armorMend - C.armorPatrol) * this.dip;
  }

  /**
   * Belt to the arrival's braces, for the one thing this boss keeps outside
   * its bodies: the radius.
   *
   * The ring comes in from `edge` during the arrival and nothing else ever
   * moves it inward. Anything that shortcuts the arrival -- a test setting
   * `arriving = 0`, a frame dropped under load -- would otherwise leave the
   * boundary parked at 420, which is outside aim range: a fight that cannot
   * be started, the same failure the base class's settle() exists to prevent
   * for bodies.
   */
  settle(world) {
    if (!this.settled) this.radius = Math.min(this.radius, X().ring);
    super.settle(world);
  }

  /**
   * Which parts of the boundary are on the field.
   *
   * Only the second ring needs this, and only before it exists: a body that
   * is drawn but not yet arrived has to be out of world.enemies, or the
   * assist will shoot a thing the player cannot see. The parked mechanism,
   * for the fifth boss in a row.
   */
  syncReach(world) {
    for (const p of this.inner) {
      if (p.dead) continue;
      const at = world.enemies.indexOf(p);
      if (p.hidden && at >= 0) world.enemies.splice(at, 1);
      else if (!p.hidden && at < 0) world.enemies.push(p);
    }
  }

  // -------------------------------------------------------------- beats

  /**
   * The squeeze, which arrives in LURCHES rather than as a hum.
   *
   * The whole of this fight's pressure, and its clock. A ring that is still
   * whole closes; one you have opened pushes back out at `relax` in
   * proportion to what you opened. So the radius is the running total of the
   * fight so far -- nothing thrown, nothing to dodge, and nothing that is not
   * a consequence of how fast you are working.
   *
   * What changed in build 136 is when it costs you. It used to corrupt every
   * frame the boundary was near, which measured at seventy-six percent of
   * stage I and ninety-five percent of stage II: a constant screen-wide
   * glitch for two hundred seconds, which is not a mechanic anyone can read.
   * Now the boundary lurches inward on a clock -- a step, a shockwave you can
   * see coming down the field, and corruption for the half second the wave is
   * crossing you -- and between lurches the field is clean. Same pressure,
   * one tenth of the glitch, and a beat instead of weather.
   */
  stepSqueeze(world, dt) {
    const C = X();
    const frac = this.shellFrac();
    if (this.eclipse <= 0 && this.frameK <= 0) {
      /*
       * How tight it can get is how much of it is left. A whole ring closes
       * all the way to the floor; one you have opened cannot, and the radius
       * springs back out at `relax` -- much faster than it closes -- the
       * moment you take a segment out of it.
       *
       * ...and `tight` is how far in it is ALLOWED to close this stage, which
       * is the escalation. Without it a whole ring was entitled to the floor
       * from the opening frame: measured, stage I ran at eighty percent
       * corrupted frames with a mean of 0.19, so the fight was at its most
       * oppressive before the player had done anything to it. Pressure that
       * starts at maximum is weather, not pressure -- the same note DYNAMO's
       * stage IV got two builds ago.
       */
      const target = C.ring - (C.ring - C.floor) * C.tight[this.stage - 1] * frac;
      /*
       * Out is smooth and in is a step. Opening the boundary lets it go at
       * once -- that is the reward, and it has to be legible in the frame you
       * earn it -- but closing waits for the lurch clock, so the ring only
       * ever comes at you in front of a shockwave you were given warning of.
       */
      if (this.radius < target) {
        this.radius = Math.min(target, this.radius + C.relax * dt);
        this.lurchT = Math.max(this.lurchT, C.lurchEvery[this.stage - 1] * 0.4);
      } else {
        this.lurchT -= dt;
        if (this.lurchT <= 0) {
          this.lurchT = C.lurchEvery[this.stage - 1];
          this.lurch(world, target);
        }
      }
    }
    if (this.frameK > 0) return;
    if (this.pulse > 0) this.pulse -= dt;
    if (this.pulse <= 0) return;
    // How hard a lurch bites is how near the boundary already was.
    const k = (C.ring - this.radius) / (C.ring - C.floor);
    const bite = clamp((k - C.squeezeFrom) / (1 - C.squeezeFrom), 0, 1);
    if (bite <= 0) return;
    world.shock = Math.max(world.shock, C.squeezeShock * bite);
    if (Math.random() < 0.4 * bite) {
      const s = world.shooter;
      spark(s.x + rand(-22, 22), s.y + rand(-22, 22), rand(-60, 60), rand(-60, 60),
        TYPE_BY_ID.bound.glow, 0.3, 2);
    }
  }

  /**
   * One step inward, and the wave it sends ahead of itself.
   *
   * The step is small -- `lurchBy` units -- so what you watch is a boundary
   * ratcheting closed, not a boundary sliding closed. The shockwave is drawn
   * from the ring inward and the corruption lasts exactly as long as it takes
   * to reach you, so the glitch is something arriving rather than something
   * that is on.
   */
  lurch(world, target) {
    const C = X();
    /*
     * It pulses whether or not it can move. A boundary already as tight as
     * this stage allows still strains against the limit on the clock -- and
     * dropping the beat there meant the pressure switched itself off for
     * whole stretches, which is the same defect in reverse.
     */
    this.radius = Math.max(target, this.radius - C.lurchBy);
    this.pulse = C.pulseFor;
    const T = TYPE_BY_ID.bound;
    ring(this.hub.x, this.hub.y, this.radius, -(this.radius - 20), C.pulseFor, T.glow, 3);
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      spark(this.hub.x + Math.cos(a) * this.radius, this.hub.y + Math.sin(a) * this.radius,
        -Math.cos(a) * 220, -Math.sin(a) * 220, T.color, 0.4, 2);
    }
    shake(7);
    audio.pop(0.5);
    this.flare = Math.max(this.flare, 0.5);
  }

  /**
   * The patrol, and the trade it makes with itself.
   *
   * It walks its own ring. When it passes a gap and has any of its budget
   * left it stops and mends -- which means dipping inside the ring, where it
   * is nearer to the turret than every segment and the assist takes it at
   * once. Every piece of boundary it puts back costs it a window, and when
   * the budget is spent it stops trading and there is nothing left to do but
   * finish the ring.
   */
  stepPatrol(world, dt) {
    const C = X();
    if (this.mend) {
      this.dip = Math.min(1, this.dip + dt / 0.5);
      this.mend.t -= dt;
      if (this.beams.length < 1 && Math.random() < 0.25) {
        this.beams.push({ p: this.mend.seg, t: 0.5 });
      }
      if (this.mend.t <= 0) {
        const seg = this.mend.seg;
        this.mend = null;
        this.mends++;
        this.mendT = C.mendEvery;
        // Law 7: a heal is capped, and this one is capped twice -- at a
        // fraction of one segment's bar and at a count for the whole fight.
        this.revive(world, seg, C.mendHeal);
        ring(seg.x, seg.y, 4, seg.r * 7, 0.35, TYPE_BY_ID.bound.glow, 3);
        audio.chime(300);
        flash(0.16, TYPE_BY_ID.terminus.color);
      }
      return;
    }
    this.dip = Math.max(0, this.dip - dt / 0.5);
    this.patrolA += C.patrolSpin * dt;
    if (this.mendT > 0) { this.mendT -= dt; return; }
    if (this.mends >= C.mendCap) return;
    // Is it passing a gap right now? The gap is where the dead segment would
    // have been, which is why place() keeps putting dead ones somewhere.
    const twoPi = TAU;
    for (const p of this.parts()) {
      if (!p.dead) continue;
      const a = p.at + (p.band ? this.innerA : this.ringA);
      let d = (this.patrolA - a) % twoPi;
      d = Math.abs(((d + Math.PI * 3) % twoPi) - Math.PI);
      if (d < 0.14) {
        this.mend = { seg: p, t: C.mendFor };
        // Said once, on the first one. Repeated per mend it was six captions
        // in a row over a fight that also has stage lines to get through, and
        // the reading-rate check counted one of them at twenty-two characters
        // a second against a ceiling of thirteen -- because a line replaced
        // before it has been read is a line that was never said.
        if (!this.mends) {
          world.bossLine = 'IT IS MENDING THE EDGE.';
          this.lineFor = 3.2;
        }
        return;
      }
    }
  }

  /** The second ring, arriving inside the first. */
  openInner(world) {
    for (const p of this.inner) {
      p.hidden = false;
      p.spawnIn = 0.5;
      p.flash = 1;
    }
    this.syncReach(world);
    for (let i = 0; i < 3; i++) {
      ring(this.hub.x, this.hub.y, this.radius * X().innerAt - i * 20, 60, 0.4 + i * 0.1,
        TYPE_BY_ID.bound.glow, 3);
    }
    flash(0.34, TYPE_BY_ID.terminus.color);
    shake(18);
    audio.boom();
  }

  /**
   * ECLIPSE. Both rings slam to the floor and hold there, and every segment
   * in turn wears one of the six colours that came before it.
   *
   * The only explicit quotation of the other six in the whole fight -- the
   * draft had TERMINUS re-running all of them as stages, and that was six
   * bosses of code and a fight made of reruns. One beat, six colours, and
   * then it throws the whole boundary back out to full radius.
   */
  startEclipse(world) {
    const C = X();
    this.eclipsed = true;
    this.eclipse = C.eclipseFor;
    world.bossLine = 'EVERYTHING YOU BROKE WAS MEASURING YOU FOR THIS.';
    this.lineFor = 5.0;
    flash(0.5, TYPE_BY_ID.terminus.color);
    ripple(this.hub.x, this.hub.y, 3.4, 1300);
    shake(30);
    audio.boom();
    background.surge(2);
  }

  stepEclipse(world, raw) {
    const C = X();
    this.eclipse -= raw;
    const k = 1 - clamp(this.eclipse / C.eclipseFor, 0, 1);
    if (k < C.eclipseHold) {
      // Down onto the floor, and held there. This is the tightest the field
      // ever gets, and the squeeze is at its maximum for all of it.
      const e = clamp(k / C.eclipseHold, 0, 1);
      this.radius = C.ring + (C.floor - C.ring) * (e * e * (3 - 2 * e));
      if (Math.random() < 0.3) shake(4);
    } else {
      if (!this.threw) {
        this.threw = true;
        flash(0.62, '#ffffff');
        for (let i = 0; i < 5; i++) {
          ring(this.hub.x, this.hub.y, C.floor + i * 30, 420 + i * 200, 0.5 + i * 0.12,
            i % 2 ? '#ffffff' : TYPE_BY_ID.terminus.glow, 5 - i);
        }
        ripple(this.hub.x, this.hub.y, 3.8, 1500);
        shake(34);
        audio.boom();
        background.surge(2);
      }
      const e = clamp((k - C.eclipseHold) / (1 - C.eclipseHold), 0, 1);
      this.radius = C.floor + (C.ring - C.floor) * (e * e * (3 - 2 * e));
    }
    if (this.eclipse <= 0) {
      world.bossLine = null;
      return true;
    }
    return false;
  }

  /**
   * III. It lets go of the ring.
   *
   * What is left of the boundary is dragged to the middle of the field as a
   * double square frame -- ORDINAL's silhouette, worn in crimson, the first
   * boss quoted by the last -- and the core sits at the middle of it and
   * turns four beams out of itself.
   *
   * The frame's near side is nearer to the turret than the core is, so it is
   * armour by construction and the fight is the same shape it has always
   * been: get through the edge to reach the thing that is holding it.
   */
  takeFrame(world) {
    const C = X();
    this.fc = { x: world.shooter.x, y: world.shooter.y - C.frameAt };
    this.frameK = 0.0001;
    this.limitT = C.limitEvery[2];
    /*
     * It can only carry so much of itself, and what it cannot it drops.
     *
     * Unbounded, stage III is however much boundary happened to survive --
     * which is the whole of the rest of the fight if ECLIPSE came early. And
     * the drop is the better image anyway: half the edge falling away as the
     * rest of it is gathered up.
     */
    /*
     * ...and what it is short of, it takes back.
     *
     * The cap was only ever a ceiling, and ECLIPSE fires on the boundary
     * being half spent -- so by III there are usually fewer bodies left than
     * the frame wants and the drop below never ran at all. Stage III was the
     * weakest fifth of this fight for exactly that reason: it was however
     * little happened to survive. It is a floor now. The fallen edge is
     * gathered up into the frame instead of being left lying on the circle,
     * which is both the better image and the whole of this stage's length.
     */
    const short = C.frameKeep - this.parts().filter((p) => !p.dead).length;
    if (short > 0) this.reform(world, C.frameHp, { cap: short, sweep: C.frameFor * 0.8 });

    const alive = this.parts().filter((p) => !p.dead);
    const keep = C.frameKeep;
    if (alive.length > keep) {
      for (let i = 0; i < alive.length; i++) {
        // Evenly spread, so what it keeps is a frame rather than an arc.
        if (Math.floor((i * keep) / alive.length) !== Math.floor(((i + 1) * keep) / alive.length)) {
          continue;
        }
        const p = alive[i];
        p.dead = true;
        explode(p.x, p.y, p.r, p.type.color, p.type.glow, 1.3);
        ring(p.x, p.y, 2, p.r * 4, 0.28, p.type.glow, 2);
      }
    }
    for (let i = 0; i < 4; i++) {
      ring(this.fc.x, this.fc.y, 20 + i * 40, 300 + i * 160, 0.45 + i * 0.1,
        i % 2 ? '#ffffff' : TYPE_BY_ID.terminus.glow, 4 - i * 0.5);
    }
    shake(24);
    audio.boom();
  }

  /**
   * The beams, from III.
   *
   * Four of them, turning. Being across one is corruption -- gated on the
   * ANGLE rather than on being near, which is DYNAMO's stage IV lesson taken
   * before it had to be learned twice: a hazard that is simply on top of you
   * for the whole stage is weather, not a threat. Four beams a quarter turn
   * apart repeat every quarter turn, which is what doubling the angle inside
   * the sine is doing.
   */
  beamCount() {
    const C = X();
    if (this.stage < 4) return C.beams;
    /*
     * Six for the last stage, merging to three as the core goes.
     *
     * The angle test is written for any count, including an odd one, so this
     * is the one number that has to change -- and it is what keeps the
     * widening from turning the stage into weather. Fewer, wider beams cover
     * less of the turn than more, narrower ones did.
     */
    const k = 1 - this.coreFrac / Math.max(0.0001, X().stageBare);
    return Math.round(C.beamsLate + (C.beamsLast - C.beamsLate) * clamp(k, 0, 1));
  }

  /**
   * ...and how wide one is, which grows as the core goes. The last of this
   * fight is crimson wedges rather than lines: the only escalation it has
   * that is not a change of shape.
   */
  beamArc() {
    const C = X();
    return C.beamArc * (1 + (1 - this.coreFrac) * C.beamWiden);
  }

  stepBeams(world, dt) {
    const C = X();
    if (this.stage < 3 || (this.stage === 3 && this.frameK < 1)) return;
    this.beamA += C.beamSpin * (1 + this.spiral * 0.8) * dt;
    // ...and when two of them become one, it is an event rather than a body
    // quietly vanishing from the turn.
    const n = this.beamCount();
    if (this.beamsWere !== undefined && n !== this.beamsWere) {
      flash(0.3, TYPE_BY_ID.terminus.color);
      ring(this.x, this.y, 20, 460, 0.45, TYPE_BY_ID.terminus.glow, 4);
      shake(12);
      audio.boom();
    }
    this.beamsWere = n;
    const s = world.shooter;
    const d = Math.hypot(s.x - this.x, s.y - this.y);
    if (d > C.beamLen) return;
    const toward = Math.atan2(s.y - this.y, s.x - this.x);
    // n beams a turn apart repeat every turn/n, which is what the half-count
    // inside the sine is doing: one test covers all of them.
    const h = this.beamCount() / 2;
    const across = Math.abs(Math.sin(h * (toward - this.beamA))) < Math.sin(h * this.beamArc());
    if (!across) return;
    world.shock = Math.max(world.shock, C.beamShock);
    if (Math.random() < 0.3) {
      spark(s.x + rand(-18, 18), s.y + rand(-18, 18), rand(-70, 70), rand(-70, 70),
        '#ffd6dd', 0.28, 2);
    }
  }

  /** LIMITs: off the frame's corners, and they walk in. */
  throwLimits(world) {
    const C = X();
    for (let k = 0; k < C.limitOf; k++) {
      const a = this.frameA + (k / C.limitOf) * TAU + Math.PI / 4;
      const h = C.frameR[0] * 1.2;
      const x = this.fc.x + Math.cos(a) * h;
      const y = this.fc.y + Math.sin(a) * h;
      const e = this.claim(new Enemy(TYPE_BY_ID.limit, x, y, { staged: false, spawnIn: 0.25 }));
      const toward = Math.atan2(world.shooter.y - y, world.shooter.x - x);
      e.vx = Math.cos(toward) * rand(140, 190);
      e.vy = Math.sin(toward) * rand(140, 190);
      e.thrown = 0.4;
      world.enemies.push(e);
      spark(x, y, e.vx * 0.4, e.vy * 0.4, TYPE_BY_ID.limit.glow, 0.3, 2);
    }
    audio.pop(0.7);
  }

  /**
   * IV -- LAST CLOSE. It puts the edge back up, one more time, around you.
   *
   * The plan had the frame simply drifting nearer for the last stage, and
   * that is what the second half of this fight was: III with a shorter
   * distance. It is the last stage of the last boss and it was the least
   * interesting thing on screen.
   *
   * So it throws the frame back out into a ring -- the fight's own best image
   * returning, and the one thing this boss has said from its first caption --
   * and ratchets it shut to the floor while the core comes down INSIDE it,
   * to a hundred and thirty above the turret. Nearer than the boundary, which
   * is the point: for the whole fight the edge has been the thing between you
   * and it, and for the last stage there is nothing between you at all.
   */
  lastClose(world) {
    const C = X();
    this.radius = C.ring;
    this.reclose = C.recloseFor;
    this.beamA += 0.4;
    this.bare = true;
    this.bareT = C.bareFor;
    /*
     * ...and it puts the boundary back. All of it.
     *
     * Without this the last stage had no ring in it: the trigger is the
     * core's bar, and by the time the core is down to two fifths the turret
     * has long since eaten every segment there was, so LAST CLOSE closed
     * around an empty circle. Measured on the first build of this beat, both
     * shell bars read zero for the whole of IV.
     *
     * A scripted resurrection rather than a heal -- PARITY's death does the
     * same thing for the same reason -- and it is what this boss has been
     * saying since its first caption. It is the edge. It does not stop being
     * the edge because you took some of it away.
     */
    this.reform(world, C.recloseHp, { sweep: C.recloseFor * 0.6 });
    this.syncReach(world);
    /*
     * ...and it comes back wearing the six tones.
     *
     * ECLIPSE flashes them in a beat, three quarters of the way through the
     * fight, and then they are gone. This is the same idea taken slowly: the
     * boundary this stage puts back up is coloured by where each segment sits
     * on the circle, and it bleeds back to crimson over the stage. The last
     * thing the last boss does is stop being six things and become one.
     */
    this.toneFade = 0;
    const all = [...this.outer, ...this.inner];
    for (let i = 0; i < all.length; i++) all[i].tone = BOSS_TONE[i % 6];
    flash(0.55, '#ffffff');
    for (let i = 0; i < 4; i++) {
      ring(this.hub.x, this.hub.y, 30 + i * 60, 420 + i * 200, 0.5 + i * 0.12,
        i % 2 ? '#ffffff' : TYPE_BY_ID.terminus.glow, 5 - i);
    }
    ripple(this.hub.x, this.hub.y, 3.4, 1300);
    shake(32);
    audio.boom();
    background.surge(2);
  }

  /**
   * IV's loop: it comes down onto you, and then it goes back into the wall.
   *
   * Two targets, alternating, which is the whole reason the last stage is
   * worth its length. Bare, it hangs a hundred and thirty above the turret --
   * nearer than the boundary, so the assist takes it and nothing else. Back
   * on the wall it is outside the ring again and out of reach, and what the
   * turret finds instead is the boundary it just put back up.
   *
   * Without this IV was one long look at a core with beams on it: the frame
   * evaporates in about twenty seconds because a compact double square is a
   * splash magnet, and everything after that was a single target and a timer.
   */
  stepBare(world, dt) {
    const C = X();
    const s = world.shooter;
    const raw = world.dtRaw || dt;
    this.bareT -= raw;
    if (this.bareT <= 0) {
      this.bare = !this.bare;
      this.bareT = this.bare ? C.bareFor : C.hideFor;
      const T = TYPE_BY_ID.terminus;
      ring(this.fc.x, this.fc.y, 16, 300, 0.45, T.glow, 3);
      flash(this.bare ? 0.3 : 0.16, T.color);
      shake(this.bare ? 14 : 8);
      audio.boom();
      // Once, on the first dive. Said on every one it was a caption every
      // twelve seconds cutting the last one off half-read -- measured at
      // twenty-eight characters a second against a ceiling of thirteen.
      if (this.bare && !this.said) {
        this.said = true;
        world.bossLine = 'IT IS INSIDE ITS OWN EDGE WITH YOU.';
        this.lineFor = 3.4;
      }
    }
    this.dip = this.bare ? 1 : 0;
    this.patrolA += C.patrolSpin * 1.5 * dt;
    // Where it wants to be: over the turret, or back out on the wall.
    const tx = this.bare ? s.x : this.hub.x + Math.cos(this.patrolA) * this.radius * C.patrolOut;
    const ty = this.bare ? s.y - C.spiralTo
      : this.hub.y + Math.sin(this.patrolA) * this.radius * C.patrolOut;
    // Round, not across: the two places it swings between are on opposite
    // sides of the turret and the chord between them runs straight over it.
    const k = Math.min(1, dt * C.bareRate);
    const [fx, fy] = arcLerp(this.hub.x, this.hub.y, this.fc.x, this.fc.y, tx, ty, k);
    this.fc.x = fx;
    this.fc.y = fy;
  }

  enterStage(world, n) {
    const C = X();
    this.stage = n;
    this.flare = 1;
    if (n === 2) this.openInner(world);
    if (n === 3) this.takeFrame(world);
    if (n >= 3) this.limitT = C.limitEvery[n - 1];
    if (n >= 4) this.lastClose(world);
    this.hold(world, 0.45);
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT HAS LET GO OF EVERYTHING BUT YOU.'
      : n >= 3 ? 'IT HAS LET GO OF THE EDGE.'
        : 'THERE IS A SECOND EDGE INSIDE THE FIRST.';
    this.lineFor = n >= 4 ? 4.4 : 3.6;
    ring(this.x, this.y, 20, 520, 0.7, TYPE_BY_ID.terminus.glow, 6);
    ripple(this.x, this.y, 2.2, 640);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = X();
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

    // The ring is centred on the turret and stays centred on it.
    const s = world.shooter;
    this.hub.x += (s.x - this.hub.x) * Math.min(1, dt * 1.4);
    this.hub.y += (s.y - this.hub.y) * Math.min(1, dt * 1.4);

    this.syncReach(world);

    // ECLIPSE holds everything while it runs -- it *is* the way into III.
    if (this.eclipse > 0) {
      this.place(dt);
      if (this.stepEclipse(world, world.dtRaw || dt)) this.enterStage(world, 3);
      this.stepSqueeze(world, dt);
      background.setFocus(this.x, this.y);
      return;
    }

    if (this.stage < 4 && this.frameK > 0 && this.frameK < 1) {
      this.frameK = Math.min(1, this.frameK + (world.dtRaw || dt) / C.frameFor);
    }
    /*
     * III closes. The frame comes down the field and draws in at the same
     * time -- the ring's own move, in the shape the ring turned into. Held
     * until the segments have reached their seats, or it would be closing on
     * a point they are still flying toward.
     */
    if (this.stage === 3 && this.frameK >= 1) {
      this.shut = Math.min(1, (this.shut || 0) + (world.dtRaw || dt) / C.shutFor);
      const e = this.shut * this.shut * (3 - 2 * this.shut);
      this.fc.x += (s.x - this.fc.x) * Math.min(1, dt * 0.6);
      this.fc.y = s.y - (C.frameAt + (C.frameClose - C.frameAt) * e);
    }
    if (this.stage >= 4) {
      // The frame unmakes itself back into a ring, and the core comes down
      // inside it. Both on the raw clock, so the slow motion of a big hit
      // does not stretch a beat that is meant to be read at speed.
      if (this.reclose > 0) {
        /*
         * The edge goes back up first, and the core only starts its loop once
         * it is up. Run together, `fc` was already easing down to a hundred
         * and thirty above the turret while the frame's seats were still being
         * measured from it -- so the segments on their way out were computed
         * around a point next to the player and passed within 25 of it.
         */
        this.reclose -= world.dtRaw || dt;
        this.frameK = Math.max(0, this.reclose / C.recloseFor);
      } else {
        this.spiral = Math.min(1, this.spiral + (world.dtRaw || dt) / C.spiralFor);
        this.toneFade = Math.min(1, (this.toneFade || 0) + (world.dtRaw || dt) / C.toneFor);
        this.stepBare(world, dt);
      }
    }

    this.place(dt);
    this.stepSqueeze(world, dt);
    // The patrol belongs to the boundary stages. In III it is in the middle
    // of its own frame and in IV it is coming down on you; neither is a lap.
    if (this.stage < 3) this.stepPatrol(world, dt);
    this.stepBeams(world, dt);

    if (this.stage >= 3) {
      this.limitT -= dt;
      if (this.limitT <= 0) {
        this.limitT = C.limitEvery[this.stage - 1];
        this.throwLimits(world);
      }
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (this.outerFrac() <= C.stageInner && want < 2) want = 2;
    // ECLIPSE is the door into III and holds the ladder while it runs. Two
    // ways in -- see CFG.terminus: the core worn down, or the boundary spent.
    if (!this.eclipsed && this.stage >= 2
      && (frac <= C.eclipseAt || this.shellFrac() <= C.eclipseRing)) {
      this.startEclipse(world);
      return;
    }
    if (this.eclipsed && want < 3) want = 3;
    if (frac <= C.stageBare && want < 4) want = 4;
    // One stage at a time. The triggers are independent -- the ring for II,
    // the bar for ECLIPSE and IV -- so two can come true on the same frame,
    // and jumping to the furthest along skips whatever is between.
    if (want > this.stage) this.enterStage(world, this.stage + 1);

    const through = 1 - (this.shellFrac() * 0.3 + frac * 0.7);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /** Everything has to be back on the field for the wreck to be shed. */
  clear(world) {
    for (const p of this.inner) p.hidden = false;
    super.clear(world);
  }

  /**
   * The death: the edge lets go, and the field is bigger afterwards.
   *
   * The core falls to the middle of the world rather than staying where it
   * was standing -- it has spent the whole fight being the outside of things
   * and it ends at the centre -- and the sky drains after it. What no other
   * ending does is leave anything behind: see Game.endBoss, which lands on
   * the `dawn` sky instead of putting `staging` back.
   */
  dieExtra(world, k) {
    if (this.fell === undefined) {
      this.fell = { x: this.x, y: this.y };
      flash(0.4, '#ffd6dd');
      audio.chime(220);
    }
    const e = k * k * (3 - 2 * k);
    const cx = world.width / 2;
    const cy = world.shooter.y - X().frameAt * 0.8;
    this.fc.x = this.fell.x + (cx - this.fell.x) * e;
    this.fc.y = this.fell.y + (cy - this.fell.y) * e;
    this.hub.x = this.fc.x;
    this.hub.y = this.fc.y;
    this.frameK = 1;
    this.x = this.fc.x;
    this.y = this.fc.y;
    this.core.x = this.x;
    this.core.y = this.y;
    // The sky comes with it: dread easing off as the edge that caused it goes.
    background.setDread(1 - e, 1);
    background.setFocus(this.x, this.y);
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = X();
    const T = TYPE_BY_ID.terminus;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);

    /*
     * The boundary itself, drawn as a circle through where the segments are
     * rather than only as the segments.
     *
     * A ring with holes in it should still read as a ring -- the gap where a
     * segment was is the only record of what you have done to it, and on a
     * phone the segments alone are thirty-two small marks that do not join
     * up. Faint, so it never competes with the bodies.
     */
    // The boundary you have opened, outlined where it was. Not only during
    // ECLIPSE now -- a ring with holes in it should read as a ring for the
    // whole fight, and the gaps are the record of what you have done.
    if (this.frameK <= 0 && !arriving && this.eclipse <= 0) {
      this.drawGhosts(ctx, T.color, 0.16);
    }

    if (this.frameK < 1 && !arriving) {
      ctx.globalCompositeOperation = 'lighter';
      for (const rr of this.twoRings ? [this.radius, this.radius * C.innerAt] : [this.radius]) {
        ctx.strokeStyle = rgba(T.color, (0.1 + 0.16 * this.flare) * open);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(this.hub.x, this.hub.y, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /*
     * ECLIPSE: each segment wearing one of the six that came before it, the
     * colour walking round the ring rather than all of them at once. It is
     * the only place in the game where six anomalies are on screen together.
     */
    if (this.eclipse > 0) {
      const k = 1 - clamp(this.eclipse / C.eclipseFor, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      /*
       * EVERY segment, including the ones you broke -- the dead as outlines,
       * the living ringed. For one beat the whole boundary is back and it is
       * wearing the six colours that came before it.
       *
       * Drawn from the survivors alone this was six lonely pieces: the beat
       * fires when the boundary is nearly spent, by construction, so the
       * scene the plan asked for -- a tight double circle of six colours
       * closed around the turret -- could only ever have been a handful of
       * marks. The ghosts cost nothing and are the whole image.
       */
      const all = [...this.outer, ...(this.twoRings ? this.inner : [])];
      for (let i = 0; i < all.length; i++) {
        const p = all[i];
        const u = (i / all.length + k * 1.6) % 1;
        const tone = BOSS_TONE[Math.floor(u * 6) % 6];
        if (p.dead) {
          ctx.strokeStyle = rgba(tone, 0.34);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.92, 0, TAU);
          ctx.stroke();
          continue;
        }
        ctx.strokeStyle = rgba(tone, 0.85);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.5, 0, TAU);
        ctx.stroke();
        drawGlow(ctx, tone, p.x, p.y, p.r * 5, 0.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /*
     * The resurrected boundary, still wearing the six.
     *
     * The segments are ordinary bodies drawn by the field in this boss's own
     * crimson, so the tone goes on over the top of them and fades out --
     * which leaves crimson, rather than needing a second colour to fade TO.
     */
    if (this.toneFade !== undefined && this.toneFade < 1) {
      const fade = 1 - this.toneFade;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts()) {
        if (p.dead || p.hidden || !p.tone) continue;
        ctx.strokeStyle = rgba(p.tone, 0.62 * fade);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.3, 0, TAU);
        ctx.stroke();
        drawGlow(ctx, p.tone, p.x, p.y, p.r * 3.4, 0.26 * fade);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /*
     * III and IV: the frame's own lines, drawn between its segments so the
     * silhouette is a shape rather than a scatter -- and the four beams,
     * which are the only thing in this fight that is thrown at all.
     */
    /*
     * III: the frame's own lines, drawn between its segments.
     *
     * Twenty bodies arranged on two squares are twenty bodies until something
     * joins them up. ORDINAL's silhouette is the point of this stage and the
     * silhouette is the line, not the marks on it -- so the outer ring of
     * seats is stroked as one closed path and the inner ring as another.
     */
    if (this.stage === 3 && this.frameK >= 1) {
      const live = this.parts().filter((p) => !p.dead);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(T.color, 0.3 + 0.3 * this.flare);
      ctx.lineWidth = 1.6;
      for (const band of [0, 1]) {
        const on = live.filter((p, i) => (i % 3 === 2) === !!band);
        if (on.length < 3) continue;
        ctx.beginPath();
        on.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.stage >= 3 && (this.stage > 3 || this.frameK >= 1)) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, C.beamLen);
      g.addColorStop(0, rgba('#ffd6dd', 0.34));
      g.addColorStop(0.4, rgba(T.glow, 0.16));
      g.addColorStop(1, rgba(T.glow, 0));
      ctx.strokeStyle = g;
      // Drawn at the width it actually corrupts at, so a beam that has grown
      // teeth looks like one. 10px at the base arc, in proportion after.
      ctx.lineWidth = 10 * (this.beamArc() / C.beamArc);
      const beams = this.beamCount();
      for (let i = 0; i < beams; i++) {
        const a = this.beamA + (i / beams) * TAU;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(a) * C.beamLen, this.y + Math.sin(a) * C.beamLen);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    this.drawBeams(ctx);

    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.2 + 0.1 * Math.sin(this.t * (1.4 + this.stage)) + this.flare * 0.6;
    drawGlow(ctx, T.glow, this.x, this.y, C.coreR * 5, pulse * open);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(7, (world) => new Terminus(world));
