/*
 * ================================== D2 =====================================
 *
 * The era-2 rig: a SUSPENDED FIELD.
 *
 * ---- what it shares, and what it does not ----
 *
 * Every FEATURE is Dummy's, and none of it is copied. `updateDummy` runs the
 * pin, the strain, the band walk and the roll; `dummyHit` books the record,
 * deposits the strain and raises the mark; `Tally` draws the numbers. This
 * module is a `draw` and nothing else, and `drawDummy` dispatches to it on
 * `e.dummyForm`. So a band added to one rig is a band on both, and a bench
 * that measures one thing measures it the same way in either room -- which is
 * what "the same features, completely different visuals" has to mean if it is
 * not going to drift into two half-maintained rigs.
 *
 * The one thing it does share by choice is the TONE RAMP. The colour encodes
 * the band, and a band-4 rate has to look like a band-4 rate in both rooms or
 * the two are not comparable. What differs is the FORM.
 *
 * ---- the form ----
 *
 * Dummy is a machined head on a gimbal: metal, vents, shutters, a deck. D2 is
 * the opposite of a machine -- there is no body at all. A core hangs in the
 * middle of a cage of rings, held there by nothing you can see, and what the
 * bands do is take the cage apart:
 *
 *   1  the stations light. A scale of ticks around the outer ring, filling
 *      with the strain -- the one element that is a readout rather than a
 *      symptom, and D2's answer to Dummy's encoder scale.
 *   2  the rings WOBBLE. Each plane's inclination starts breathing, slightly
 *      out of step with the others.
 *   3  one ring LEAVES FORMATION. Its plane departs the shared axis and it
 *      begins to precess on its own -- the first thing that is visibly wrong
 *      rather than merely busy.
 *   4  PHASE BREAKS. The rings stop being continuous: each is drawn as arcs
 *      with gaps that open and close on two incommensurate frequencies, so
 *      the cage never resolves and reads as containment failing.
 *   5  the core BREACHES. It grows past the inner ring, light plumes outward
 *      along the axis, and the outermost ring tumbles -- a full rotation
 *      rather than an oscillation, which is the one motion that cannot be
 *      mistaken for the rig working hard.
 *
 * ---- the record ----
 *
 * One per era from build 262, so this has its own and starts empty. Dummy
 * wears it as five concentric rings of twenty beads; D2 wears it as ONE great
 * ring of a hundred stations, filling clockwise, in five decades that step up
 * in length. Same ladder, same reading -- shutting a decade is still a visible
 * event -- expressed in the cage's own language rather than the machine's.
 *
 * It is in the FIXED register with the stations: a record must never be
 * mistaken for debris, and everything else here is moving.
 */

import { TAU, clamp, rgba, drawGlow } from './util.js';
import { soak, soakBeads, SOAK_BEADS, SOAK_PER_SHELL } from './ledger.js';

/*
 * The cage: three rings, each with its own radius, tilt and rate.
 *
 * The TILTS are the whole illusion and the first set was far too shallow --
 * 0.42, -0.30 and 0.18 radians foreshorten a ring to 91%, 96% and 98% of its
 * width, which is not an orbit, it is three concentric circles. A ring only
 * reads as a ring in space when it is squashed hard enough that the eye takes
 * the short axis for depth, and that starts somewhere under about 0.8.
 */
const RINGS = [
  { r: 0.55, tilt: 1.16, spin: 0.55, lean: 0.0 },   // squash 0.40
  { r: 0.82, tilt: 0.72, spin: -0.38, lean: 1.9 },  // squash 0.75
  { r: 1.06, tilt: 1.34, spin: 0.27, lean: 3.6 },   // squash 0.23
];

/** How many stations the outer ring carries, and how many the record does. */
const TICKS = 28;
const STATIONS = SOAK_BEADS;

/**
 * One ring, as an ellipse with a broken phase.
 *
 * `gaps` is how much of the ring is missing (0 at rest, up to about a third
 * at band 5) and `phase` is where the gaps are. Drawn as `n` arcs rather than
 * one ellipse when it is broken, because a dashed stroke on an ellipse in
 * canvas dashes in SCREEN length and the far side of a foreshortened ring is
 * travelling much slower than the near side -- the dashes would bunch, which
 * reads as an artefact rather than as a break.
 */
function ring(ctx, rr, tilt, roll, gaps, phase, segs) {
  const squash = Math.max(0.06, Math.cos(tilt));
  if (gaps <= 0.001) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rr, rr * squash, roll, 0, TAU);
    ctx.stroke();
    return;
  }
  const n = segs;
  const span = (TAU / n) * (1 - gaps);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = phase + (i / n) * TAU;
    ctx.ellipse(0, 0, rr, rr * squash, roll, a0, a0 + span);
    // `moveTo` between arcs, or canvas joins the end of one to the start of
    // the next and the gaps are drawn back in as chords.
    if (i < n - 1) {
      const a1 = phase + ((i + 1) / n) * TAU;
      const c = Math.cos(roll);
      const s = Math.sin(roll);
      const x = rr * Math.cos(a1);
      const y = rr * squash * Math.sin(a1);
      ctx.moveTo(x * c - y * s, x * s + y * c);
    }
  }
  ctx.stroke();
}

/**
 * The rig, drawn.
 *
 * Reads only what `updateDummy` maintains, which is what keeps the two forms
 * honest: there is no D2 state, so there is nothing about D2 that can be
 * right while Dummy is wrong.
 */
export function drawD2(ctx, e, k) {
  const { R, s, t, flash, tone, lit0, a1, a2, a3, a4, a5, hair } = k;

  const was = ctx.globalAlpha;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalCompositeOperation = 'lighter';

  // ---- the halo, and band 5's plume -------------------------------------
  drawGlow(ctx, tone, 0, 0, R * (1.5 + s * 1.4),
    0.05 + lit0 * (0.05 + s * 0.35) + flash * 0.16);
  if (a5 > 0.01) {
    /*
     * Along the axis and in both directions, so it reads as the field letting
     * go rather than as the thing falling over. Scaled and not two glows: one
     * sprite, stretched, is one draw.
     */
    ctx.save();
    ctx.scale(0.34, 1);
    drawGlow(ctx, tone, 0, 0, R * (2.2 + s * 1.6), (0.06 + s * 0.12) * a5);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- the record: one great ring of stations ---------------------------
  /*
   * Outside everything else: the widest ring reaches 1.06R, band 1's own
   * ticks end at 1.32R, and this starts at 1.44R -- inside `BEAD_REACH`,
   * which is what the standoff already clears for. And in the FIXED register,
   * which is the whole point of a record. Two strokes for the whole thing:
   * one for the closed decades and one for the decade being earned.
   */
  const beads = soakBeads(soak.total);
  if (beads > 0) {
    const full = Math.min(STATIONS, Math.floor(beads));
    const rr = R * 1.44;
    // Quiet. It is a record and not a readout: it must be there when looked
    // for and never the first thing seen, which at 0.34 alpha and hair * 1.6
    // it was -- on a dark band it was the brightest thing in the frame.
    ctx.strokeStyle = rgba('#cfe0f2', 0.2);
    ctx.lineWidth = hair * 1.1;
    ctx.beginPath();
    for (let i = 0; i < full; i++) {
      // Clockwise from twelve, the way the shell fills.
      const a = -Math.PI / 2 + (i / STATIONS) * TAU;
      // A decade further round is a longer station: the ladder is legible as
      // LENGTH as well as as arc, so a closed decade is a visible step.
      const len = R * (0.026 + 0.013 * Math.floor(i / SOAK_PER_SHELL));
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.moveTo(c * rr, sn * rr);
      ctx.lineTo(c * (rr + len), sn * (rr + len));
    }
    ctx.stroke();
    /*
     * ...and the one being earned, which is the difference between a record
     * and a picture of one: it grows into its slot over the damage it costs.
     * No animation state -- the fraction IS the arrival, so it survives a
     * reload at exactly the length it had.
     */
    const frac = Math.min(1, beads - full);
    if (full < STATIONS && frac > 0.02) {
      const a = -Math.PI / 2 + (full / STATIONS) * TAU;
      const len = R * (0.026 + 0.013 * Math.floor(full / SOAK_PER_SHELL)) * frac;
      ctx.strokeStyle = rgba('#cfe0f2', 0.2 * frac);
      ctx.lineWidth = hair * 1.1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * (rr + len), Math.sin(a) * (rr + len));
      ctx.stroke();
    }
  }

  // ---- the cage ---------------------------------------------------------
  /*
   * Drawn far ring first so the near halves land over the core. Each ring's
   * plane is its own base tilt plus, from band 2, a breath -- and the three
   * frequencies are deliberately not multiples of each other, so the cage
   * never resolves into a shape that looks intentional.
   */
  for (let i = 0; i < RINGS.length; i++) {
    const g = RINGS[i];
    const wob = a2 * 0.30 * Math.sin(t * (1.7 + i * 0.53) + g.lean);
    /*
     * Band 3: ONE ring leaves. The outermost, because a ring departing from
     * the outside is a containment failing from the outside in -- and because
     * the inner two still holding is what makes the departure read.
     */
    const off = i === RINGS.length - 1 ? a3 * 0.85 : 0;
    const jud = a4 * 0.05 * (Math.sin(t * 37 + i) + 0.6 * Math.sin(t * 23.7 + i));
    const tilt = g.tilt + wob + off + jud;
    /*
     * Band 5: the outer ring TUMBLES -- `t` unbounded rather than a sine, so
     * it goes all the way round. The other two keep their oscillation, which
     * is what makes the tumble read as one thing coming loose rather than as
     * the whole picture spinning.
     */
    const tumble = i === RINGS.length - 1 ? a5 * t * 1.9 : 0;
    const roll = g.lean + t * g.spin * (1 + a4 * 0.7) + tumble;
    const gaps = a4 * 0.34;
    const rr = R * g.r * (1 + a5 * 0.10 * i);
    const near = 0.35 + lit0 * 0.45 + s * 0.2;
    ctx.strokeStyle = rgba(tone, near);
    // Thin. A cage is a set of LINES holding something; at hair * 2.2 the
    // rings were bands and the thing they hold could not be seen past them.
    ctx.lineWidth = hair * (1.2 + s * 0.7);
    ring(ctx, rr, tilt, roll, gaps, t * 0.4 + i, 5 + i);
  }

  // ---- band 1: the stations on the outer ring ---------------------------
  /*
   * The one element that is a READOUT and not a symptom: `TICKS` marks round
   * the outer ring, of which the strain lights a share. It arrives at band 1
   * and stays for the rest of the climb, which is what makes it the scale the
   * other four are read against.
   */
  if (a1 > 0.01) {
    const g = RINGS[RINGS.length - 1];
    const rr = R * g.r * 1.14;
    const lit = Math.round(TICKS * clamp(s, 0, 1));
    ctx.lineWidth = hair * 2;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = rgba(pass ? tone : '#5d7086', (pass ? 0.9 : 0.4) * a1);
      ctx.beginPath();
      for (let i = 0; i < TICKS; i++) {
        if ((i < lit) !== !!pass) continue;
        const a = -Math.PI / 2 + (i / TICKS) * TAU;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = R * (pass ? 0.10 : 0.06);
        ctx.moveTo(c * rr, sn * rr);
        ctx.lineTo(c * (rr + len), sn * (rr + len));
      }
      ctx.stroke();
    }
  }

  // ---- the core ---------------------------------------------------------
  /*
   * Band 5 BREACHES it: it grows past the inner ring's own 0.55R, which is
   * the one moment the cage is visibly not containing anything. It went to
   * 0.69R first and swallowed the middle ring too, which loses the cage
   * exactly when the cage failing is the thing being said. Everything below
   * band 5 is the core answering the strain.
   */
  const core = R * (0.17 + s * 0.10 + a5 * 0.30) * (1 + flash * 0.16);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, tone, 0, 0, core * 2.6, 0.30 + s * 0.35 + flash * 0.3);
  ctx.restore();
  ctx.fillStyle = rgba('#f2f8ff', 0.75 + s * 0.25);
  ctx.beginPath();
  ctx.arc(0, 0, core, 0, TAU);
  ctx.fill();
  /*
   * ...and the strain, ON the core, as a ring that closes. Dummy carries this
   * on its encoder scale and its vents; here it is the one hard edge in a
   * drawing made of light, so it is where the eye already is.
   */
  ctx.strokeStyle = rgba(tone, 0.85);
  ctx.lineWidth = hair * 2.6;
  ctx.beginPath();
  ctx.arc(0, 0, core * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s, 0, 1));
  ctx.stroke();

  /*
   * The peak, as a single mark on that ring. `e.dummyPeak` is a decayed
   * maximum of the STRAIN and bleeds at 0.09 a second, so a weapon fired one
   * and a half times a second parks it far above its lit run while a
   * continuous one parks it on the end -- the mean and the peak on one scale,
   * told apart by POSITION and not by colour.
   */
  const pk = clamp(e.dummyPeak || 0, 0, 1);
  if (pk > 0.02) {
    const a = -Math.PI / 2 + TAU * pk;
    ctx.strokeStyle = rgba('#f2f8ff', 0.8);
    ctx.lineWidth = hair * 2.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * core * 1.28, Math.sin(a) * core * 1.28);
    ctx.lineTo(Math.cos(a) * core * 1.72, Math.sin(a) * core * 1.72);
    ctx.stroke();
  }

  ctx.globalAlpha = was;
  ctx.restore();
}
