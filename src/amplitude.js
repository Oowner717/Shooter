/*
 * AMPLITUDE. Anomaly IV, teal.
 *
 * Every boss before this one is a structure around a centre: a frame, a dial,
 * a set of orbits. Break enough of it and the middle is exposed. This one has
 * no middle. It is a *waveform* -- fourteen segments strung along a travelling
 * sine with the head at the leading end -- and where any part of it is depends
 * on when you look rather than on where it started.
 *
 * The rule the fight rests on: breaking segments SHORTENS the wave, and a
 * shorter wave swings HIGHER. Its amplitude grows as its body shrinks, so the
 * troughs dip nearer the turret the better you are doing. It leans in as it
 * loses, which is the opposite of every other fight here.
 *
 * The span is set so the far end of the wave passes inside aim range even at
 * full length -- 355 of 400 at the bottom of its swing -- so the fight is
 * winnable from the first frame rather than only once you have hurt it. The
 * growing swing takes that to 300: it is escalation, not a rescue. See the
 * note on `span` in CFG.amplitude for the arithmetic, and the suite, which
 * measures it at three body lengths.
 *
 *   I          one wave, slow period.
 *   RESONANCE  on the way into II the whole serpent comes down the field,
 *              passes over the turret and goes back up. Still solid the whole
 *              way, so for four seconds the field is a wave going past.
 *   II         the frequency doubles.
 *   III        it splits into two strands, out of phase, one high and one low,
 *              and the lane between them breathes.
 *   IV         the coil. What is left wraps a ring round the turret and draws
 *              it in to a floor -- pressure, never a crush.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { Enemy } from './enemies.js';
import { ring, ripple, spark, shake, flash } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Boss } from './boss.js';

const A = () => CFG.amplitude;

/*
 * The arrival is heard before it is seen: the substrate itself starts to
 * ripple in rows while there is still nothing drawn on the field. It is the
 * only boss that announces itself through the floor.
 */
const ARRIVAL = [
  { text: 'THE FIELD HAS A FREQUENCY.', hold: 3.0 },
  { text: 'IT HAS BEEN OSCILLATING UNDER YOU THE WHOLE TIME.', hold: 4.6 },
  { text: 'IT IS COMING UP TO ITS FULL HEIGHT.', hold: 3.8 },
  { text: 'AMPLITUDE', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE WAVE IS FLAT.', hold: 2.8 },
  { text: 'WHAT IS LEFT OF IT WILL NOT CREST AGAIN.', hold: 4.0 },
  { text: 'SOMETHING HAS FINISHED CHARGING.', hold: 3.6 },
];

/*
 * Teal skies, rotated from ORDINAL's by the generator and then pulled toward
 * the blue-green end by hand at the top of the ramp: the generated stage IV
 * came out a pale mint that read as fog rather than as a thing about to come
 * apart. These keep the escalation and end somewhere colder and brighter.
 */
const MOODS = [
  { top: '#03100e', mid: '#062e2a', low: '#010605', line: '#1f8f7c', neb: ['#08544a', '#063e38', '#04463c'], accent: '#5cf0d0' },
  { top: '#041a17', mid: '#08433c', low: '#020a09', line: '#2ec2a6', neb: ['#0a7566', '#08544a', '#066054'], accent: '#8ff5e0' },
  { top: '#062622', mid: '#0c6154', low: '#030f0d', line: '#41ecc4', neb: ['#12a086', '#0a7566', '#0e8a70'], accent: '#d6fff2' },
  { top: '#0b3a32', mid: '#149c82', low: '#061a16', line: '#8ff5e0', neb: ['#1ad4ac', '#12a086', '#16bc96'], accent: '#ffffff' },
];

export class Amplitude extends Boss {
  constructor(world) {
    super(world, 4);
    const C = A();
    this.cx = world.shooter.x;
    this.cy = world.shooter.y - C.standoff;
    this.x = this.cx;
    this.y = this.cy;
    this.arriving = C.arrive;

    this.phase = 0; // where the travelling wave is in its cycle
    this.slideT = 0;
    this.drop = 0; // how far the whole wave has come down the field
    this.resonance = 0; // seconds of RESONANCE still to run
    this.resonated = false;
    this.strands = 1;
    this.coil = 0; // 0..1, how far the coil has drawn in
    this.flingT = C.fling[0];

    /*
     * The head rides the leading end of its own wave. Every other boss in the
     * game has a core you can find in the same place twice.
     */
    this.core = this.body('amplitude', this.x, this.y);
    world.enemies.push(this.core);

    /*
     * The body. Each segment owns a position *along* the wave rather than a
     * position on the field -- `u` from -0.5 at the head to +0.5 at the tail
     * -- and where that puts it is worked out every frame.
     */
    this.segs = [];
    for (let i = 0; i < C.segs; i++) {
      const p = this.body('crest', this.x, this.y);
      p.u = (i + 1) / C.segs - 0.5;
      p.strand = i % 2;
      this.segs.push(p);
    }

    this.place(0);
    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  parts() {
    return this.segs;
  }

  /** How much of the body is still standing. */
  shellFrac() {
    return this.segs.filter((p) => !p.dead).length / this.segs.length;
  }

  /**
   * How high it swings, right now.
   *
   * This is the fight in one line: the amplitude is bought with the body. A
   * whole wave is a shallow one that keeps its distance; a broken one whips.
   */
  swing() {
    const C = A();
    return C.swing + (1 - this.shellFrac()) * C.swingGrow;
  }

  gauge() {
    const C = A();
    const arriving = this.arriving > 0;
    const d = dressOf(4);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: [{ label: 'BODY', seg: this.segs.length, frac: this.shellFrac() }],
      marks: [
        { at: C.stageCore, past: !arriving && this.coreFrac <= C.stageCore },
        { at: C.stageCoil, past: !arriving && this.coreFrac <= C.stageCoil },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /**
   * Where a point on the wave is, for a position `u` along it.
   *
   * One function for the head and every segment, so the head is genuinely on
   * the curve rather than approximately near it -- which matters, because in
   * stage III the two strands are the same function with a phase and a height
   * added, and anything that only approximately followed the wave would drift
   * out of its own strand.
   */
  at(u, strand) {
    const C = A();
    const slide = Math.sin(this.slideT) * C.slide;
    const gap = this.strands > 1 ? (strand ? 1 : -1) * C.strandGap * 0.5 : 0;
    const ph = this.strands > 1 && strand ? C.strandPhase : 0;
    const x = this.cx + slide + u * C.span;
    const y = this.cy + this.drop + gap
      + Math.sin(u * C.waves * TAU + this.phase + ph) * this.swing();
    return [x, y];
  }

  /** ...and which way the wave is going there, so a segment lies along it. */
  tangent(u, strand) {
    const [x1, y1] = this.at(u - 0.01, strand);
    const [x2, y2] = this.at(u + 0.01, strand);
    return Math.atan2(y2 - y1, x2 - x1);
  }

  place(dt) {
    const C = A();
    const mul = C.freqMul[this.stage - 1] * (this.dying > 0 ? 0.4 : 1);
    this.phase += C.freq * mul * dt;
    this.slideT += C.slideRate * dt;

    if (this.coil > 0) {
      this.placeCoil(dt);
      return;
    }

    for (const p of this.segs) {
      if (p.dead) continue;
      const [x, y] = this.at(p.u, p.strand);
      p.x = x;
      p.y = y;
      p.angle = this.tangent(p.u, p.strand);
      p.vx = 0; p.vy = 0; p.av = 0;
    }
    const [hx, hy] = this.at(-0.5, 0);
    this.core.x = hx;
    this.core.y = hy;
    this.core.vx = 0;
    this.core.vy = 0;
    this.x = hx;
    this.y = hy;
  }

  /**
   * IV: the ring. What is left of the body wraps the turret and draws in to a
   * floor, with the head orbiting it. The floor is the whole difference
   * between pressure and a crush, and nothing in this game is allowed to be a
   * crush.
   */
  placeCoil(dt) {
    const C = A();
    const s = this.hunt;
    const k = clamp(this.coil, 0, 1);
    const e = k * k * (3 - 2 * k);
    const rr = C.coilFrom + (C.coilTo - C.coilFrom) * e;
    this.ringA = (this.ringA || 0) + C.coilSpin * dt;
    const live = this.segs.filter((p) => !p.dead);
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const a = this.ringA + (i / Math.max(1, live.length)) * TAU;
      p.x = s.x + Math.cos(a) * rr;
      p.y = s.y + Math.sin(a) * rr;
      p.angle = a + Math.PI / 2;
      p.vx = 0; p.vy = 0; p.av = 0;
    }
    /*
     * ...and the head comes *inside* its own ring, between the turret and the
     * wave, turning the other way.
     *
     * It orbited outside at first, which put the whole ring between you and
     * the only thing whose death ends this -- so auto aim, which takes what is
     * nearest, spent the entire stage chewing through the coil. Measured, IV
     * was forty-two percent of a three-hundred-and-twenty-second fight. In
     * here the head is the nearest thing, the ring is pressure rather than a
     * wall, and "it is closing its period around you" is more true rather than
     * less: it has come inside with you.
     */
    const ha = -this.ringA * 1.4;
    this.core.x = s.x + Math.cos(ha) * rr * 0.52;
    this.core.y = s.y + Math.sin(ha) * rr * 0.52;
    this.core.vx = 0;
    this.core.vy = 0;
    this.x = this.core.x;
    this.y = this.core.y;
  }

  // -------------------------------------------------------------- beats

  /**
   * RESONANCE. The wave comes down the field, over you, and back up.
   *
   * Everything else about this boss is a property of a waveform sitting at
   * the top of the field and can be waited out. This cannot: the segments are
   * still solid while they pass, and touching one is corruption. It is the
   * one beat that happens *to* you.
   */
  startResonance(world) {
    this.resonated = true;
    this.resonance = A().resonanceFor;
    world.bossLine = 'RESONANCE';
    this.lineFor = 3.0;
    flash(0.42, TYPE_BY_ID.amplitude.color);
    ripple(this.cx, this.cy, 3, 1100);
    shake(22);
    audio.boom();
    background.surge(2);
  }

  stepResonance(world, raw) {
    const C = A();
    this.resonance -= raw;
    const k = 1 - clamp(this.resonance / C.resonanceFor, 0, 1);
    // Down and back: a full sine over the beat, so it arrives and leaves at
    // the same speed and is at its lowest exactly halfway through.
    const s = world.shooter;
    const reach = (s.y - this.cy) + 40;
    this.drop = Math.sin(k * Math.PI) * reach;
    // Anything the wave is across takes it.
    for (const p of this.segs) {
      if (p.dead) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < p.r + 34) {
        world.shock = Math.max(world.shock, C.resonanceShock);
        if (Math.random() < 0.3) {
          spark(s.x + rand(-18, 18), s.y + rand(-18, 18), rand(-60, 60), rand(-60, 60),
            TYPE_BY_ID.amplitude.glow, 0.3, 2);
        }
      }
    }
    if (Math.random() < 0.3) ring(s.x, s.y, 20, 240, 0.3, TYPE_BY_ID.crest.glow, 2);
    if (this.resonance <= 0) {
      this.drop = 0;
      world.bossLine = null;
      return true;
    }
    return false;
  }

  /** What it throws off the top of itself. */
  fling(world) {
    const C = A();
    // From the highest crest -- the top of the wave, which is the part of it
    // furthest from you, so what it throws has the whole field to cross.
    let top = null;
    for (const p of this.segs) {
      if (p.dead) continue;
      if (!top || p.y < top.y) top = p;
    }
    const from = top || this.core;
    for (let k = 0; k < C.flingOf; k++) {
      const a = Math.PI / 2 + rand(-0.5, 0.5);
      const d = new Enemy(TYPE_BY_ID.droplet, from.x, from.y, { staged: false, spawnIn: 0.2 });
      d.counts = false;
      d.vx = Math.cos(a) * rand(120, 200);
      d.vy = Math.sin(a) * rand(160, 260);
      d.thrown = 0.45;
      world.enemies.push(d);
    }
    ring(from.x, from.y, 6, 90, 0.28, TYPE_BY_ID.droplet.glow, 2);
    audio.pop(0.7);
  }

  enterStage(world, n) {
    const C = A();
    this.stage = n;
    this.flare = 1;
    this.flingT = C.fling[n - 1];
    if (n >= 3) this.strands = 2;
    if (n >= 4) {
      this.gather(world);
      this.coil = 0.0001;
      this.hunt = { x: world.shooter.x, y: world.shooter.y };
      flash(0.55, '#ffffff');
      ripple(world.shooter.x, world.shooter.y, 3.4, 1300);
      shake(30);
    }
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT IS CLOSING ITS PERIOD AROUND YOU.'
      : n >= 3 ? 'TWO WAVES. ONE PERIOD.'
        : 'IT HAS DOUBLED ITS FREQUENCY.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.amplitude.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  /**
   * The wave gathers itself, once, on the way into the coil.
   *
   * By stage IV the body is reliably gone -- which left the ring with nothing
   * to be made of. A slow mend through the late stages did not fix it: a
   * segment restored into a trough that by then dips to eighty units from the
   * turret is deleted before it has finished arriving. So this is a beat
   * rather than a drip, like NOON and RECURSION, and nothing follows it. What
   * closes on you is what you left it.
   */
  gather(world) {
    const C = A();
    const gone = this.segs.filter((p) => p.dead);
    const want = Math.min(C.gather, gone.length);
    for (let i = 0; i < want; i++) {
      this.revive(world, gone[i], C.gatherHp);
      this.beams.push({ p: gone[i], t: 0.55 });
    }
    if (want) {
      for (let i = 0; i < 3; i++) {
        ring(world.shooter.x, world.shooter.y, 340 - i * 60, 90, 0.4 + i * 0.1,
          TYPE_BY_ID.crest.glow, 3);
      }
      audio.chime(560);
    }
    return want;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = A();
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

    // RESONANCE holds the staging while it runs -- it *is* the way into II.
    if (this.resonance > 0) {
      this.place(dt);
      if (this.stepResonance(world, world.dtRaw || dt)) this.enterStage(world, 2);
      background.setFocus(this.x, this.y);
      return;
    }

    this.place(dt);

    if (this.coil > 0 && this.coil < 1) {
      this.coil = Math.min(1, this.coil + (world.dtRaw || dt) / C.coilFor);
      this.hunt.x += (world.shooter.x - this.hunt.x) * Math.min(1, dt * 1.2);
      this.hunt.y += (world.shooter.y - this.hunt.y) * Math.min(1, dt * 1.2);
    } else if (this.coil >= 1) {
      this.hunt.x += (world.shooter.x - this.hunt.x) * Math.min(1, dt * 0.7);
      this.hunt.y += (world.shooter.y - this.hunt.y) * Math.min(1, dt * 0.7);
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (!this.resonated && this.shellFrac() <= C.stageBody) {
      this.startResonance(world);
      return;
    }
    if (frac <= C.stageCore && want < 3) want = 3;
    if (frac <= C.stageCoil && want < 4) want = 4;
    if (want > this.stage) this.enterStage(world, want);

    this.flingT -= dt;
    if (this.flingT <= 0) {
      this.flingT = C.fling[this.stage - 1];
      this.fling(world);
    }

    const through = 1 - (this.shellFrac() * 0.35 + frac * 0.65);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /**
   * The death: it flatlines.
   *
   * The coil unwinds and the wave stretches back across the whole field, and
   * then the swing goes to nothing -- so the last thing on screen before the
   * infall is fourteen segments in a dead straight horizontal line. It is the
   * only ending in the game that is a shape rather than an explosion, and it
   * is the shape this boss spent four minutes not being.
   */
  dieExtra(world, k) {
    const C = A();
    this.coil = 0;
    this.strands = 1;
    this.drop = 0;
    // The swing is driven straight to zero rather than left to the body
    // fraction, which by now would be asking for its widest.
    this.flat = k;
    for (const p of this.segs) {
      if (p.dead) continue;
      const [x] = this.at(p.u, 0);
      p.x = x;
      p.y = this.cy + (p.y - this.cy) * (1 - k);
      p.angle = 0;
    }
    if (k > 0.5 && !this.flatlined) {
      this.flatlined = true;
      flash(0.5, '#d6fff2');
      ring(this.cx, this.cy, 20, 900, 0.6, TYPE_BY_ID.amplitude.glow, 4);
      shake(20);
    }
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = A();
    const T = TYPE_BY_ID.amplitude;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;

    ctx.save();
    this.drawHole(ctx, C, T, arriving);

    /*
     * The curve itself, drawn through where the segments are rather than
     * between them: a wave with holes in it should still look like a wave,
     * and the gap where a segment was is the only record of what you have
     * done to it.
     */
    if (this.coil <= 0 && !arriving) {
      ctx.globalCompositeOperation = 'lighter';
      for (let strand = 0; strand < this.strands; strand++) {
        ctx.strokeStyle = rgba(T.color, (0.18 + 0.22 * this.flare) * open);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const u = -0.5 + i / 60;
          const [x, y] = this.at(u, strand);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ...and the ring, once there is one.
    if (this.coil > 0 && this.hunt) {
      const k = clamp(this.coil, 0, 1);
      const e = k * k * (3 - 2 * k);
      const rr = C.coilFrom + (C.coilTo - C.coilFrom) * e;
      ctx.strokeStyle = rgba(T.glow, 0.22 * open);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 9]);
      ctx.beginPath();
      ctx.arc(this.hunt.x, this.hunt.y, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.drawBeams(ctx);

    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.2 + 0.1 * Math.sin(this.t * (1.6 + this.stage)) + this.flare * 0.6;
    drawGlow(ctx, T.glow, this.x, this.y, C.span * 0.5, pulse * open);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}

registerAnomaly(4, (world) => new Amplitude(world));
