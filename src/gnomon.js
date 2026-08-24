/*
 * GNOMON. Anomaly II, amber.
 *
 * ORDINAL's problem was alignment: two frames turning at different rates, and
 * you ground holes in them and waited for your holes to line up. GNOMON is
 * that inverted, and the inversion is the whole design.
 *
 * The holes you make here stay exactly where you put them. The dial is one
 * ring of arcs and it barely turns. What moves is the *shadow*: a needle
 * sweeps out of the core, and behind it it drags a wedge of dark across the
 * field. A round that crosses the shadow decays and dies before it reaches
 * anything. So the dial is not the only thing between you and the core --
 * the light is, and the light is on a clock.
 *
 * That is what makes it work on auto aim without being a hold-the-trigger.
 * The assist keeps shooting whatever is nearest; the shadow decides which of
 * those shots ever land. You are not aiming, you are waiting for the hour --
 * and the fight is about noticing that the hour is a thing you can be early
 * for.
 *
 * Four stages, and each changes the shape of the problem rather than its
 * size:
 *
 *   I     one needle, one shadow, a slow sweep. Open the dial.
 *   NOON  at half the dial: the needle spins to a blur and throws its shadow
 *         once round everything. The field is swept, the garrison walks out
 *         at once, and the dial puts part of itself back. Not a stage -- a
 *         thing that happens *to* you, and the answer is to have been ahead.
 *   II    a second needle, opposite. Two shadows, and the gap between them is
 *         the thing you learn. It starts mending arcs.
 *   III   the dial cracks loose: arcs come off the ring into eccentric orbits,
 *         so the holes stop staying where you put them after all.
 *   IV    THE NEEDLE COMES DOWN. It detaches, falls, and plants itself beside
 *         the turret as a wall that pulses shadow out of where it landed --
 *         and the core comes down after it.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { explode, ring, ripple, spark, shake, flash } from './fx.js';
import { audio } from './audio.js';
import { shed } from './debris.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Boss } from './boss.js';

const G = () => CFG.gnomon;
const B = () => CFG.boss;

/*
 * The arrival, and the one in the game that makes the field *brighter*.
 *
 * Everything else that has ever come through a hole has darkened the sky on
 * the way in. This is a thing that measures light, so it brings some -- the
 * substrate comes up amber before the hole opens, which reads as a sunrise
 * run at the wrong speed and tells you it is not ORDINAL before a shape has
 * been drawn.
 *
 * Held at roughly eleven characters a second, like ORDINAL's, because that is
 * about reading rather than about either of them.
 */
const ARRIVAL = [
  { text: 'THE LIGHT HERE HAS NEVER MOVED.', hold: 3.4 },
  { text: 'SOMETHING HAS BEEN TELLING TIME BY YOU.', hold: 4.0 },
  { text: 'IT HAS COME TO READ ITS SHADOW.', hold: 3.6 },
  { text: 'GNOMON', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE HOURS ARE LOOSE.', hold: 3.0 },
  { text: 'NOTHING HERE WILL BE MEASURED BY LIGHT AGAIN.', hold: 4.6 },
  { text: 'SOMETHING GREEN IS DIVIDING.', hold: 3.6 },
];

/*
 * GNOMON's four skies, authored rather than rotated.
 *
 * The generator in anomaly.js turns ORDINAL's magenta onto another hue and
 * keeps its lightness curve -- which is right for five of the six planned
 * bosses and wrong for this one, because ORDINAL's curve goes *down* into the
 * dark and GNOMON's whole idea is light. These go up: a dim ochre dawn, then
 * hotter, then a horizon that is nearly white, then the flare.
 */
const MOODS = [
  { top: '#140a04', mid: '#3a1c06', low: '#080401', line: '#b06a24', neb: ['#5c2c08', '#3f2206', '#4a2404'], accent: '#ffb066' },
  { top: '#1d0d03', mid: '#5a2a06', low: '#0c0602', line: '#d68a2a', neb: ['#7d3d08', '#5c2c08', '#6b3204'], accent: '#ffc180' },
  { top: '#2a1404', mid: '#7d3f08', low: '#120902', line: '#ff8a3d', neb: ['#a85a0c', '#7d3d08', '#8c4a06'], accent: '#ffe0b8' },
  // IV: it has come down, and the sky has come with it. No ground left and
  // the horizon lit from underneath -- the only mood in the game that is
  // brighter at the bottom than a lit menu.
  { top: '#3f2006', mid: '#b06414', low: '#241002', line: '#ffc180', neb: ['#d4801a', '#a85a0c', '#c06e10'], accent: '#ffffff' },
];

/**
 * Where an arc sits on the ring, in the dial's own unturned space.
 * Evenly round, so the arcs of the ring meet -- see CFG.gnomon.dialR.
 */
function arcAt(radius, per, i) {
  const a = (i / per) * TAU;
  return [Math.cos(a) * radius, Math.sin(a) * radius, a + Math.PI / 2];
}

export class Gnomon extends Boss {
  constructor(world) {
    super(world, 2);
    const C = G();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.arriving = C.arrive;

    this.dialAngle = 0;
    this.needleA = 0; // where the first needle points
    this.needles = C.needles[0];
    this.noon = 0; // seconds of NOON still to run
    this.noonDone = false;
    this.planted = null; // where the needle fell, once it has

    this.core = this.body('gnomon', this.x, this.y);
    world.enemies.push(this.core);

    /*
     * The dial. One ring, and every arc knows its slot on it, so a broken one
     * leaves a hole in a fixed place -- which is the promise this fight makes
     * and the one NOON breaks.
     */
    this.arcs = [];
    for (let i = 0; i < C.arcs; i++) {
      const p = this.body('dial', this.x, this.y);
      p.slot = arcAt(C.dialR, C.arcs, i);
      p.loose = null; // set in III, when the ring lets go of it
      this.arcs.push(p);
    }

    /*
     * The needle: collinear segments rather than one long body, because the
     * physics has only circles. Six of them out along the line the needle
     * points, which is a real wall for anything that runs into it and is what
     * lets stage IV plant it beside the turret without inventing anything.
     */
    this.needleSegs = [];
    for (let k = 0; k < C.needleSeg * 2; k++) {
      const p = this.body('dial', this.x, this.y, C.needleR);
      p.needle = k < C.needleSeg ? 0 : 1; // which needle it belongs to
      p.along = (k % C.needleSeg + 1) / C.needleSeg;
      p.hidden = p.needle > 0; // the second one does not exist until II
      this.needleSegs.push(p);
    }

    this.parked = [];
    this.wave = 0;
    this.garrison(C.garrison[0]);

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  /** How much of the dial is still standing. The gauge's one shell. */
  shellFrac() {
    return this.arcs.filter((p) => !p.dead).length / this.arcs.length;
  }

  gauge() {
    const C = G();
    const arriving = this.arriving > 0;
    const d = dressOf(2);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      // One shell, not two: there is one dial. The HUD builds what it is
      // handed, which is the whole point of it being handed anything.
      shells: [{ label: 'DIAL', seg: this.arcs.length, frac: this.shellFrac() }],
      marks: [
        { at: C.stageCore, past: !arriving && this.coreFrac <= C.stageCore },
        { at: C.stageDescend, past: !arriving && this.coreFrac <= C.stageDescend },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /** Fill the dial with SECONDs, each waiting behind an arc of its own. */
  garrison(n) {
    for (let k = 0; k < n; k++) {
      const live = this.arcs.filter((p) => !p.dead);
      const pool = live.length ? live : this.arcs;
      const guard = pool[(k * 5 + this.wave * 3) % pool.length];
      const d = new Enemy(TYPE_BY_ID.second, this.x, this.y, { staged: false, spawnIn: 0 });
      d.counts = false;
      d.guard = guard;
      d.berth = rand(0.58, 0.82);
      this.parked.push(d);
    }
    this.wave++;
  }

  /** Every body where the dial says it is, this frame. */
  place(dt) {
    const C = G();
    const spin = C.spin[this.stage - 1] * (this.dying > 0 ? 3 : 1);
    const fast = this.noon > 0 ? C.noonSpin : C.needleSpin * spin;
    this.dialAngle += C.dialSpin * spin * dt;
    this.needleA += fast * dt;

    const c = Math.cos(this.dialAngle);
    const s = Math.sin(this.dialAngle);
    for (const p of this.arcs) {
      if (p.dead) continue;
      const [ox, oy, bar] = p.slot;
      if (p.loose) {
        /*
         * III: off the ring and on its own ellipse. Still solid, still
         * shootable -- it has stopped being part of a wall and has not
         * stopped being in the way.
         */
        p.loose.a += p.loose.rate * dt;
        const rr = C.dialR * p.loose.scale;
        p.x = this.x + Math.cos(p.loose.a) * rr;
        p.y = this.y + Math.sin(p.loose.a) * rr * p.loose.squash;
        p.angle = p.loose.a + Math.PI / 2;
      } else {
        p.x = this.x + (ox * c - oy * s);
        p.y = this.y + (ox * s + oy * c);
        p.angle = bar + this.dialAngle;
      }
      p.vx = 0;
      p.vy = 0;
      p.av = 0;
    }

    // ...and the needles, out along wherever they point.
    for (const p of this.needleSegs) {
      if (p.hidden || p.dead) continue;
      if (this.planted) {
        // IV: it is not turning any more, it is lying where it fell.
        const a = this.planted.a;
        const reach = C.needleLen * p.along * 0.72;
        p.x = this.planted.x + Math.cos(a) * reach;
        p.y = this.planted.y + Math.sin(a) * reach;
        p.angle = a;
      } else {
        const a = this.needleA + p.needle * Math.PI;
        const reach = C.needleLen * p.along;
        p.x = this.x + Math.cos(a) * reach;
        p.y = this.y + Math.sin(a) * reach;
        p.angle = a;
      }
      p.vx = 0;
      p.vy = 0;
      p.av = 0;
    }

    this.core.x = this.x;
    this.core.y = this.y;
    this.core.vx = 0;
    this.core.vy = 0;

    for (const d of this.parked) {
      const g = d.guard;
      if (!g) continue;
      d.x = this.x + (g.x - this.x) * d.berth;
      d.y = this.y + (g.y - this.y) * d.berth;
    }
  }

  // ------------------------------------------------------------- shadow

  /** Where the shadows are pointing right now, as angles. */
  shadowAngles() {
    const out = [];
    if (this.planted) return out; // a planted needle throws rings, not a wedge
    for (let i = 0; i < this.needles; i++) out.push(this.needleA + i * Math.PI);
    return out;
  }

  /** Is this point in shadow? Anything that asks is about to be punished. */
  inShadow(x, y) {
    const C = G();
    const dx = x - this.x;
    const dy = y - this.y;
    // Nothing is in the core's own shadow: the wedge starts outside it.
    if (dx * dx + dy * dy < C.shadowFrom * C.shadowFrom) return false;
    const to = Math.atan2(dy, dx);
    for (const a of this.shadowAngles()) {
      let d = to - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < C.shadowHalf) return true;
    }
    return false;
  }

  /**
   * What the shadow does, which is the fight.
   *
   * A round inside it decays -- not deflected, not stopped dead, but killed
   * where it is, so the answer is never "shoot through it" and always "shoot
   * when it is not there". The turret inside it is corrupted, which costs the
   * intake and cannot cost anything else: nothing in this game kills you.
   */
  sweep(world, dt) {
    const C = G();
    for (const p of world.projectiles) {
      if (p.dead || !this.inShadow(p.x, p.y)) continue;
      p.dead = true;
      if (Math.random() < 0.25) {
        spark(p.x, p.y, rand(-30, 30), rand(-30, 30), '#5c3a12', 0.22, 1);
      }
    }
    const s = world.shooter;
    if (this.inShadow(s.x, s.y)) {
      world.shock = Math.max(world.shock, C.shadowShock);
      if (Math.random() < 0.25) {
        spark(s.x + rand(-20, 20), s.y + rand(-20, 20),
          rand(-50, 50), rand(-50, 50), TYPE_BY_ID.gnomon.glow, 0.3, 2);
      }
    }
    // ...and the planted needle, throwing rings instead of a wedge.
    if (this.planted) {
      this.plantT = (this.plantT || 0) - dt;
      if (this.plantT <= 0) {
        this.plantT = C.plantPulse;
        ring(this.planted.x, this.planted.y, 10, 520, 0.5, TYPE_BY_ID.gnomon.glow, 3);
        const d = Math.hypot(s.x - this.planted.x, s.y - this.planted.y);
        if (d < 420) world.shock = Math.max(world.shock, C.shadowShock);
        shake(7);
        audio.glitchOn();
      }
    }
  }

  // -------------------------------------------------------------- beats

  /**
   * NOON.
   *
   * Half the dial is gone, so it stops keeping time and simply reads the
   * whole field at once: the needle spins to a blur, the shadow goes round
   * everything, every round in flight dies, every SECOND still waiting walks
   * out at once, and the dial mends part of itself.
   *
   * It is not a stage. It is a bill that arrives when you are halfway, and
   * the way to answer it is to have been more than halfway.
   */
  strikeNoon(world) {
    const C = G();
    this.noon = C.noonFor;
    this.noonDone = true;
    world.bossLine = 'NOON';
    this.lineFor = 3.2;
    for (const p of world.projectiles) p.dead = true;
    // Everything still waiting leaves, through whatever is nearest.
    for (const d of [...this.parked]) this.release(world, d, true);
    this.rebuild(world, C.noonRebuild);
    flash(0.5, '#ffd9a8');
    for (let i = 0; i < 4; i++) {
      ring(this.x, this.y, 12 + i * 26, 520 + i * 220, 0.5 + i * 0.12,
        i % 2 ? '#ffffff' : TYPE_BY_ID.gnomon.glow, 5 - i);
    }
    ripple(this.x, this.y, 3, 1100);
    shake(30);
    audio.boom();
    background.surge(2);
  }

  /** One SECOND, out through the hole it was waiting behind. */
  release(world, d, force = false) {
    const i = this.parked.indexOf(d);
    if (i < 0) return;
    this.parked.splice(i, 1);
    const g = d.guard;
    let ax = d.x - this.x;
    let ay = d.y - this.y;
    if (g && !force) { ax = g.x - this.x; ay = g.y - this.y; }
    const ad = Math.hypot(ax, ay) || 1;
    d.vx = (ax / ad) * rand(200, 290);
    d.vy = (ay / ad) * rand(200, 290);
    d.spawnIn = 0.25;
    d.thrown = 0.4;
    d.guard = null;
    world.enemies.push(d);
    spark(d.x, d.y, d.vx * 0.4, d.vy * 0.4, TYPE_BY_ID.second.glow, 0.35, 2);
    audio.pop(0.7);
  }

  /** Whoever's arc has gone leaves; the rest file out once the dial is open. */
  releaseCheck(world, dt) {
    const wide = this.shellFrac() <= 0.34;
    this.impatient = Math.max(0, (this.impatient || 0) - dt);
    for (const d of [...this.parked]) {
      if (d.guard && !d.guard.dead) {
        if (!wide || this.impatient > 0) continue;
        this.impatient = 1;
        this.release(world, d, true);
        break;
      }
      this.release(world, d);
    }
  }

  /** Bring one arc back, capped -- the same law ORDINAL's repairs obey. */
  repair(world) {
    const C = G();
    if (this.shellFrac() >= C.repairCap) return false;
    const gone = this.arcs.filter((p) => p.dead);
    if (!gone.length) return false;
    const p = gone[(Math.random() * gone.length) | 0];
    this.revive(world, p, C.repairHp);
    this.beams.push({ p, t: 0.55 });
    return true;
  }

  /** ...and a whole swathe of it at once, which is what NOON does. */
  rebuild(world, frac) {
    const want = Math.round(this.arcs.length * frac);
    const gone = this.arcs.filter((p) => p.dead);
    const need = Math.max(0, want - (this.arcs.length - gone.length));
    for (let k = 0; k < need && k < gone.length; k++) {
      this.revive(world, gone[k], 0.6);
      this.beams.push({ p: gone[k], t: 0.55 });
    }
  }

  /** The core throwing its own SECONDs out, from III. */
  burst(world) {
    const C = G();
    for (let k = 0; k < C.burstOf; k++) {
      const a = rand(0, TAU);
      const d = new Enemy(TYPE_BY_ID.second, this.x, this.y, { staged: false, spawnIn: 0.2 });
      d.counts = false;
      d.x = this.x + Math.cos(a) * (C.coreR + 6);
      d.y = this.y + Math.sin(a) * (C.coreR + 6);
      d.vx = Math.cos(a) * rand(320, 430);
      d.vy = Math.sin(a) * rand(320, 430);
      d.thrown = 0.5;
      world.enemies.push(d);
    }
    ring(this.x, this.y, C.coreR, C.coreR * 4.5, 0.35, TYPE_BY_ID.gnomon.glow, 4);
    this.flare = 1;
    audio.boom();
  }

  // ------------------------------------------------------------- stages

  enterStage(world, n) {
    const C = G();
    this.stage = n;
    this.flare = 1;
    this.repairT = C.repair[n - 1];
    this.burstT = C.burst[n - 1];
    this.needles = C.needles[n - 1];
    // The second needle grows in, opposite the first.
    for (const p of this.needleSegs) {
      if (p.needle === 1) p.hidden = this.needles < 2;
    }
    if (n === 3) this.crack();
    if (n >= 4) this.plant(world);

    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'THE NEEDLE COMES DOWN.'
      : n >= 3 ? 'IT HAS DECIDED THE HOUR.'
        : 'THE DIAL IS CRACKED. IT RUNS FAST.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    this.garrison(C.garrison[Math.min(n, C.garrison.length) - 1]);
    ring(this.x, this.y, 20, 520, 0.7, TYPE_BY_ID.gnomon.glow, 6);
    ring(this.x, this.y, 10, 300, 0.4, '#ffffff', 3);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  /**
   * III: the ring lets go. Every surviving arc comes off onto an ellipse of
   * its own, so a hole you opened stops being a hole that stays open.
   */
  crack() {
    for (const p of this.arcs) {
      if (p.dead) continue;
      const [ox, oy] = p.slot;
      p.loose = {
        a: Math.atan2(oy, ox) + this.dialAngle,
        rate: rand(0.18, 0.42) * (Math.random() < 0.5 ? -1 : 1),
        scale: rand(0.82, 1.22),
        squash: rand(0.72, 1.12),
      };
    }
    flash(0.34, TYPE_BY_ID.gnomon.color);
    shake(18);
  }

  /**
   * IV: the needle comes down.
   *
   * It stops sweeping and plants itself beside the turret -- a wall in a
   * fixed place, throwing rings of shadow out of where it landed. Only one
   * needle survives it; the other goes with the stage.
   */
  plant(world) {
    const C = G();
    const s = world.shooter;
    const side = this.x <= s.x ? -1 : 1;
    this.planted = {
      x: s.x + side * C.plantAt,
      y: s.y - 40,
      a: -Math.PI / 2 + side * 0.5,
    };
    this.plantT = C.plantPulse;
    for (const p of this.needleSegs) if (p.needle === 1) p.hidden = true;
    this.y0 = this.y;
    this.fall = 0;
    flash(0.6, '#ffffff');
    ripple(this.planted.x, this.planted.y, 3.4, 1300);
    shake(34);
  }

  /** ...and the core after it. */
  descend(world, raw) {
    const C = G();
    const s = world.shooter;
    this.fall = Math.min(1, (this.fall || 0) + raw / C.descendFor);
    const e = this.fall * this.fall * (3 - 2 * this.fall);
    this.y = this.y0 + (s.y - C.close - this.y0) * e;
    background.setFocus(this.x, this.y);
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = G();
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
    this.sweep(world, dt);
    this.releaseCheck(world, dt);

    if (this.noon > 0) this.noon -= world.dtRaw || dt;

    const frac = this.coreFrac;
    // NOON fires once, at half a dial, and holds everything while it runs.
    if (!this.noonDone && this.shellFrac() <= C.noonAt) this.strikeNoon(world);
    if (this.noon > 0) {
      background.setFocus(this.x, this.y);
      if (this.core.dead) this.die(world, C);
      return;
    }

    let want = this.stage;
    if (this.noonDone && this.stage < 2) want = 2;
    if (frac <= C.stageCore && want < 3) want = 3;
    if (frac <= C.stageDescend && want < 4) want = 4;
    if (want > this.stage) this.enterStage(world, want);
    if (this.stage >= 4) this.descend(world, world.dtRaw || dt);

    const rep = C.repair[this.stage - 1];
    if (rep > 0) {
      this.repairT -= dt;
      if (this.repairT <= 0) {
        this.repairT = rep;
        if (this.repair(world)) audio.chime(420);
      }
    }
    const bur = C.burst[this.stage - 1];
    if (bur > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = bur; this.burst(world); }
    }

    const through = 1 - (this.shellFrac() * 0.4 + frac * 0.6);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /** Everything of GNOMON's that is still a body. */
  parts() {
    return [...this.arcs, ...this.needleSegs];
  }

  /**
   * The last sweep. Before the dial comes apart the shadow unwinds -- one
   * turn the other way, throwing no dark at all, which is light coming back
   * into a field that has been half in shade for three minutes. It is the
   * only thing in the game that is a relief rather than a threat.
   */
  dieExtra(world, k) {
    this.needleA -= (world.dtRaw || 0) * 5.5;
    this.unwind = k;
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = G();
    const T = TYPE_BY_ID.gnomon;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);

    /*
     * The shadow itself, drawn under everything: a wedge of dark rather than
     * a wedge of colour, because it is an absence. Multiply would be truer
     * still and is not worth the compositing cost on a phone -- a black wedge
     * at low alpha over a dark field reads the same.
     */
    if (!arriving && this.dying <= 0 && !this.planted) {
      const reach = 1500;
      for (const a of this.shadowAngles()) {
        const g2 = ctx.createRadialGradient(this.x, this.y, C.shadowFrom, this.x, this.y, reach);
        g2.addColorStop(0, rgba('#000000', 0.0));
        g2.addColorStop(0.06, rgba('#0a0600', 0.62 * open));
        g2.addColorStop(1, rgba('#0a0600', 0.30 * open));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.arc(this.x, this.y, reach, a - C.shadowHalf, a + C.shadowHalf);
        ctx.closePath();
        ctx.fill();
        // A hard edge down each side, so the wedge has a boundary you can
        // learn rather than a haze you have to guess at.
        ctx.strokeStyle = rgba('#ffb066', 0.16 * open);
        ctx.lineWidth = 1;
        for (const e of [-C.shadowHalf, C.shadowHalf]) {
          ctx.beginPath();
          ctx.moveTo(this.x + Math.cos(a + e) * C.shadowFrom,
            this.y + Math.sin(a + e) * C.shadowFrom);
          ctx.lineTo(this.x + Math.cos(a + e) * reach, this.y + Math.sin(a + e) * reach);
          ctx.stroke();
        }
      }
    }

    // the garrison, seen through the dial
    for (const d of this.parked) {
      ctx.save();
      ctx.globalAlpha = 0.5 * open;
      d.draw(ctx, world);
      ctx.restore();
    }

    // the ring the arcs sit on, while they still sit on it
    if (this.stage < 3) {
      const live = this.arcs.filter((p) => !p.dead).length;
      if (live > 1) {
        ctx.strokeStyle = rgba(T.color, (0.16 + 0.22 * this.flare) * open);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, C.dialR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // the needle's own spine, from the core out past its last segment
    ctx.globalCompositeOperation = 'lighter';
    if (this.dying <= 0 || this.unwind) {
      for (const a of (this.planted ? [this.planted.a] : this.shadowAngles())) {
        const ox = this.planted ? this.planted.x : this.x;
        const oy = this.planted ? this.planted.y : this.y;
        const len = C.needleLen * (this.planted ? 0.78 : 1);
        const g2 = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        g2.addColorStop(0, rgba('#ffe9c8', 0.9 * open));
        g2.addColorStop(1, rgba(T.glow, 0.15 * open));
        ctx.strokeStyle = g2;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }

    this.drawBeams(ctx);

    const pulse = 0.22 + 0.1 * Math.sin(this.t * (1.4 + this.stage)) + this.flare * 0.6;
    drawGlow(ctx, T.glow, this.x, this.y, C.dialR * 2.1, pulse * open);
    if (this.planted) drawGlow(ctx, T.glow, this.planted.x, this.planted.y, 120, 0.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(2, (world) => new Gnomon(world));
