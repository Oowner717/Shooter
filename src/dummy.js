/**
 * OVERDRIVE GIMBAL -- the practice dummy, and the only thing on the range.
 *
 * A calibration head hung in a gimbal ring, bolted to a deck plate, seen
 * head-on from up-field. It is a machine being pushed past its rating: as the
 * rate climbs it stops down, opens its vents, closes its armour, loses its
 * trim, cracks, and finally jams.
 *
 * ---- three registers of motion, and that split is the whole design ----
 *
 *   fixed    the collar, the encoder scale, the deck plate and the strut.
 *            These never move, ever. The scale being fixed is what makes it
 *            an ENCODER: the ring turns against it.
 *   rolling  the gimbal ring and its two trunnions.
 *   still    the head, its bore and its iris. The head NEVER rotates and its
 *            silhouette is 0.82R at every band, so the thing you aim at never
 *            moves and never resizes. It trembles only once the mount has
 *            lost its trim.
 *
 * The ring passing BEHIND the head at the top and IN FRONT at the bottom is
 * what makes it an object rather than a polar diagram, and it costs two arcs
 * instead of one. Never cut it, or the trunnions.
 *
 * ---- two channels, and they must not drown each other ----
 *
 *   PER HIT     a strike wedge denting the plate where the round landed, a
 *               strain deposit on that facet, a chip or two, and a number.
 *               The numbers MERGE by octant -- one live slot each, carrying a
 *               running sum and a count -- so thirty hits a second is six
 *               legible re-strikes rather than thirty numbers nobody reads.
 *   SUSTAINED   `strain`, 0 to 1, band-aligned so the drawing lines up with
 *               the arrivals. It drives the scale, the roll, the aperture,
 *               the vents, the shutters, the judder and the jam -- six things
 *               arriving at five different points, so the band can be COUNTED
 *               and not merely felt.
 *
 * ---- and nothing arrives in a frame ----
 *
 * The band the rig stands in rises at once and falls one step per `DWELL`
 * with a margin under each edge, so a rate parked on a boundary physically
 * cannot chatter; `dummyBandF` then eases toward it, and every element fades
 * and MOVES in over the half second that takes. Colour is a mix of two stops
 * on one ramp read at the same position, so structure and colour can never
 * disagree.
 *
 * ---- the radius ----
 *
 * 68, against a BULWARK's 45, and no drawn geometry may pass 1.14R. The hard
 * ceiling on the body is 72 -- `GRID_CELL` is twice the largest body in the
 * game and `check-build.mjs` asserts the broadphase covers it -- and the
 * 1.14R footprint is what lets the rig stand in the 169-unit band a 320x568
 * screen leaves between the readout and the machine.
 */

import { CFG } from './config.js';
import { TAU, clamp, rand, spread, smoothstep, rgba, drawGlow, mixHex, jag } from './util.js';
import { spark, shard, ripple } from './fx.js';
import { ledger, soak, soakBeads, SOAK_BEADS, SOAK_PER_SHELL } from './ledger.js';
import { drawD2 } from './d2.js';

export const DUMMY = {
  r: 68,
  /*
   * Where it stands, and the band it is allowed to stand in when the readout
   * above it says 420 will not do. A 320x568 screen shows 916 world units of
   * depth against a 390x844's 1361, so a fixed distance that clears the panel
   * on one phone puts the rig behind it on another.
   *
   * `nearest` is measured rather than preferred: the drawn machine and its
   * lever arc live inside about 150 units of the mount, and on the tightest
   * screen the game is played at the band between the readout and the machine
   * is 169 units. 165 is what fits, not what is comfortable.
   */
  up: 420,
  nearest: 165,
  farthest: 460,
  clear: 12,
  tone: '#8fb8d8',
};

/** Nothing drawn may pass this, as a fraction of the body radius. */
const FOOT = 1.14;

/**
 * The bands, in damage a second.
 *
 * Chosen against what the game can actually produce rather than round
 * numbers: a stock BOLT settles near 40, a bought one near 420, SCATTER
 * sustains over 1,200 and TITHE past 2,500. So every band is reachable and
 * the top one takes a deliberate build.
 */
export const BANDS = [0, 120, 400, 900, 1800];

/** The ceiling the strain map runs to, above the last band. */
const TOP = BANDS[BANDS.length - 1] * 1.6;
const EDGES = [...BANDS, TOP];

export function bandOf(dps) {
  let n = 0;
  for (let i = 0; i < BANDS.length; i++) if (dps > BANDS[i]) n = i + 1;
  return n; // 0..5
}

/**
 * 0..1, BAND-ALIGNED.
 *
 * It was a square root over the whole ladder, which put the band edges at
 * 0.20 / 0.37 / 0.56 / 0.79 -- so nothing drawn from it ever lined up with an
 * arrival, and the lit tick count at a band edge was an arbitrary number.
 * Piecewise, each band owns a fifth of the scale: 120 is exactly 0.2, 400 is
 * 0.4, 900 is 0.6, 1800 is 0.8. Only band 1 keeps a root, because it spans
 * 120 of the game's 2880 and a stock turret at 40 has to see the rig move.
 */
function strainOf(dps) {
  if (!(dps > 0)) return 0;
  let i = 0;
  while (i < 4 && dps > EDGES[i + 1]) i++;
  let f = clamp((dps - EDGES[i]) / (EDGES[i + 1] - EDGES[i]), 0, 1);
  if (i === 0) f = Math.sqrt(f);
  return (i + f) / 5;
}

/** A hit's weight, 0..1, against what one round of the heaviest kind does. */
function weightOf(dmg) {
  return clamp(Math.sqrt(clamp(dmg / 420, 0, 1)), 0.08, 1);
}

/**
 * The colour ramp, one stop per band, mixed at the eased band position.
 *
 * It was three hard stops chosen by band, so crossing a boundary repainted
 * the rig in one frame and a rate sitting on a boundary strobed between two
 * colours several times a second. One source for the colour and for the
 * structure -- both read `dummyBandF` -- so the shutters can never be out
 * while the rig still wears the colour of the band below.
 */
const RAMP = ['#4a6379', '#8fb8d8', '#7fe0d0', '#ffcf6b', '#ff8a4d', '#ff5d6b'];

/*
 * ...and it is quantised and memoised, which is not a micro-optimisation.
 * `rgba()` caches on `hex|alpha` in a table that stops accepting entries at
 * 4096, and a continuously varying hex called eight times a frame fills it in
 * seconds -- after which every new colour in the GAME re-parses. 321 stops is
 * finer than the eye at this size and bounded for the life of the process.
 */
let _toneQ = -1;
let _toneHex = RAMP[0];
function toneAt(bf) {
  const q = Math.round(clamp(bf, 0, RAMP.length - 1) * 64);
  if (q === _toneQ) return _toneHex;
  _toneQ = q;
  const p = q / 64;
  const i = Math.min(RAMP.length - 2, Math.floor(p));
  _toneHex = mixHex(RAMP[i], RAMP[i + 1], p - i);
  return _toneHex;
}

/** How far band `n`'s own element has arrived, 0 to 1. */
function arrived(bf, n) {
  return clamp(bf - (n - 1), 0, 1);
}

/**
 * ...and how a mechanical one arrives: a blade bouncing off its detent rather
 * than easing onto it. One sine, about 8% overshoot, settled by the time it is
 * home. The metal gets this; the light does not.
 */
function detent(a) {
  return smoothstep(a) + 0.1 * Math.sin(a * TAU) * (1 - a);
}

// ------------------------------------------------------- the fixed tables
//
// Everything below is built once at module load and written in place. The
// draw path allocates nothing: the rig is drawn sixty times a second and an
// array literal per frame is a collection you can feel.

/**
 * ---- the soak shell: what this device has ever put into a dummy ----
 *
 * The bands are a RATE and the marks are a HIT. Neither of them remembers
 * anything: walk out of the room and the rig is bare again. This is the third
 * channel and the only one that is a RECORD -- one small bead for every step
 * of the odometer in `ledger.js`, standing off the machine, and it is still
 * there next week.
 *
 * ---- five rings of twenty, and why not a scatter ----
 *
 * The ladder is an odometer with a decade a ring, so the DRAWING is one too:
 * ring k is worth ten times the one inside it, fills clockwise from twelve
 * o'clock, and is 43% larger in the bead. The first version stippled all
 * hundred across one annulus by golden angle, which fills evenly and is
 * prettier and cannot be READ -- the decade is the whole point of the ladder
 * and a stipple hides it. Radial separation alone does not carry it either:
 * 6.1 units between rings is 3.8 CSS px at this zoom, so the size ladder says
 * the same thing a second way.
 *
 * A completed ring gets a joining circle at a tenth alpha and a partial one
 * does not, so closing a decade is a visible event and a full set reads as a
 * cage of five rings rather than a hundred loose dots.
 *
 * `RING_PHASE` is the golden conjugate of one bead's pitch, so no two rings
 * ever line up. Whole-step offsets put rings 1/3/5 and 2/4 into register and
 * the shell grows radial SPOKES, which is a boss's frame -- exactly the read
 * to avoid on a body.
 *
 * ---- where it sits ----
 *
 * Outside everything. The furthest hard geometry on the rig is the trunnions
 * at 1.20R (`-RR - R * 0.08` with RR = 1.12R) and `Game.drawAutoLock` -- which
 * is not in this file at all -- puts four arcs at `e.r + 16` = 1.24R once it
 * has converged. Ring 1's inner bead edge is at 1.29R, clear of both at every
 * roll angle, so the beads can never cover the head, the shutters, the
 * aperture or the encoder scale. `DUMMY.reach` is the outer edge, and
 * `Sandbox.standoff` stands the rig off the readout by THAT rather than by
 * the body radius, or the top of the shell goes under the panel.
 *
 * ---- and why none of it moves ----
 *
 * A record does not move. Debris does, and debris is the one thing this must
 * never be mistaken for -- so the shell joins the rig's FIXED register, with
 * the collar and the deck plate and the encoder scale. It is lit from below
 * instead: the lower half at twice the alpha of the upper, matching band 5's
 * deck pool and the encoder's own six-o'clock origin. Two static passes, both
 * precomputed.
 *
 * That is also what keeps it out of the band sweep's way. `regress.mjs`
 * compares whole normalised frames against a control of the same band eleven
 * frames apart; a hundred rotating dots would inflate that control for a
 * reason that has nothing to do with bands, and would inflate it MORE the
 * longer the device had been played.
 *
 * The one moving part is the bead being earned, and it has no animation state
 * -- it grows and drifts into its slot as a pure function of the fraction, so
 * a reload resumes it at exactly the size it had.
 */
const RINGS = SOAK_BEADS / SOAK_PER_SHELL;
/**
 * A cool NEUTRAL grey, and the only achromatic thing in the picture.
 *
 * Measured in CIELAB against what it is drawn beside: 17.7 from the rig's own
 * `#8fb8d8`, 26.7 from its fixed structure `#4a6379`, 25.9 from the shard
 * white, and 64 to 71 from the three warm stops the rig wears whenever a
 * bought turret is firing. Every hue in this game is spoken for; achromatic
 * is the register nothing owns, and "not lit by the machine" is what a record
 * should look like.
 */
const BEAD_TONE = '#98a0a8';
/** Unit vector per bead: cos and sin of its fixed bearing. */
const BEAD_CX = new Float32Array(SOAK_BEADS);
const BEAD_CY = new Float32Array(SOAK_BEADS);
/*
 * 0 or 1, NOT the alpha. It held the alpha and the draw loop compared
 * `BEAD_S[i] !== lit` against the literal -- and a Float32Array reads 0.66
 * back as the float32 nearest 0.66, which is not the double 0.66, so the
 * test was true for every bead and NOTHING was drawn. The joining circles
 * still were, so the shell looked like five empty rings and the count it is
 * supposed to show was invisible at every total.
 */
const BEAD_S = new Uint8Array(SOAK_BEADS);
const BEAD_R = new Float32Array(SOAK_BEADS);
const BEAD_SZ = new Float32Array(SOAK_BEADS);
/** The outer edge of the whole shell, as a fraction of R. */
export const BEAD_REACH = 1.32 + 0.09 * (RINGS - 1) + 0.026 + 0.005 * (RINGS - 1);
for (let i = 0; i < SOAK_BEADS; i++) {
  const k = Math.floor(i / SOAK_PER_SHELL);
  const j = i % SOAK_PER_SHELL;
  // Twelve o'clock, then clockwise: canvas +y is down, so increasing angle
  // turns clockwise on screen.
  const a = -Math.PI / 2 + j * (TAU / SOAK_PER_SHELL)
    + k * 0.381966 * (TAU / SOAK_PER_SHELL);
  BEAD_CX[i] = Math.cos(a);
  BEAD_CY[i] = Math.sin(a);
  BEAD_R[i] = 1.32 + 0.09 * k;
  BEAD_SZ[i] = 0.026 + 0.005 * k;
  // Lit from the deck. Static, so this is a table and not a per-frame sine.
  BEAD_S[i] = Math.sin(a) > 0 ? 1 : 0;
}

const TICKS = 24;
const TICK_C = new Float32Array(TICKS);
const TICK_S = new Float32Array(TICKS);
for (let i = 0; i < TICKS; i++) {
  // Lit from the bottom (canvas +y, six o'clock) outward in both directions:
  // a bar graph wrapped round the mount, lit where a gimbal takes its weight.
  const a = Math.PI / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / TICKS);
  TICK_C[i] = Math.cos(a);
  TICK_S[i] = Math.sin(a);
}

const FACETS = 12;
const HEAD_C = new Float32Array(FACETS);
const HEAD_S = new Float32Array(FACETS);
for (let i = 0; i < FACETS; i++) {
  const a = (i / FACETS) * TAU;
  HEAD_C[i] = Math.cos(a);
  HEAD_S[i] = Math.sin(a);
}

/*
 * The cracks, seeded ONCE. A crack that re-randomises every frame is not a
 * crack, it is noise -- which is exactly what the scribbled arcs it replaces
 * were. Stored as (how far in, sideways kink), four points per facet.
 */
const CRACK_PTS = 4;
const CRACK = new Float32Array(FACETS * CRACK_PTS * 2);
for (let f = 0; f < FACETS; f++) {
  for (let k = 0; k < CRACK_PTS; k++) {
    const i = (f * CRACK_PTS + k) * 2;
    CRACK[i] = k / (CRACK_PTS - 1);
    CRACK[i + 1] = jag(f * 7 + k, f + 3, 0) * 0.09;
  }
}

/*
 * The strike wedges: ten slots, oldest overwritten, written in place. It was
 * an effect object allocated per hit and pushed into `world.effects` -- one
 * allocation thirty times a second under a SCATTER.
 */
const WEDGES = 10;
const WEDGE = new Float32Array(WEDGES * 3); // bearing, weight, age
let wedgeAt = 0;
for (let i = 0; i < WEDGES; i++) WEDGE[i * 3 + 2] = 9;

// ------------------------------------------------------------- the entity

/**
 * The per-body state, made once and lazily, from three places.
 *
 * Lazily because the regress sweep drives a bare `{ x, y, r, dummy: true }`
 * straight into `updateDummy` and `drawDummy` -- and that has to keep
 * working, because rendering the rig by hand onto an offscreen canvas is the
 * only honest way to compare two bands. Judging it off live screenshots
 * measures the frame loop instead.
 */
function ensureRig(e) {
  if (e.strain) return e;
  e.strain = new Float32Array(FACETS);
  e.dummyStrain = 0;
  e.dummyBand = 0;
  e.dummyHeld = 0;
  e.dummyBandF = 0;
  e.dummySag = 0;
  e.dummyRoll = 0;
  e.dummyT = 0;
  e.dummyFlash = 0;
  e.dummyPeak = 0;
  e.dummyHot = -1;
  return e;
}

/**
 * How long a band is HELD once reached, per step down, and how far under an
 * edge the rate must fall before that clock even starts.
 *
 * Rising is instant: a hit that takes you into a band is answered on the
 * frame it lands. Falling needs the rate to drop `MARGIN` of the band's own
 * width BELOW the edge it came in at and stay there for `DWELL` -- so a rate
 * that crossed up at 400 cannot get back under 340, and one frame back above
 * the edge resets the clock. That is what makes a boundary un-chatterable.
 * Band 5 to nothing is 3.5 seconds of visible spin-down.
 */
const DWELL = 0.7;
const MARGIN = 0.12;

function dropEdge(b) {
  if (b <= 1) return 0;
  const width = (b < 5 ? BANDS[b] : TOP) - BANDS[b - 1];
  return Math.max(0, BANDS[b - 1] - MARGIN * width);
}

/** Per-frame bookkeeping: the pin, the strain, the band and the roll. */
export function updateDummy(e, dt) {
  ensureRig(e);
  /*
   * Pinned. It is not `harmless` -- see `placeDummy` -- so `drive` steers it
   * at the turret like anything else, and a target that walks towards you
   * while you are reading a rate off it is not a bench. Position as well as
   * velocity, because a blast's impulse moves it inside the same frame.
   */
  if (e.dummyHome) { e.x = e.dummyHome.x; e.y = e.dummyHome.y; }
  e.vx = 0;
  e.vy = 0;
  e.hp = e.maxHp;

  const dps = ledger.on ? ledger.live() : 0;
  const want = strainOf(dps);
  // Up in 0.16s so the trigger feels connected; down over 0.85s so a burst
  // reads as a burst, and so the fall matches the band walk-down rather than
  // lagging behind it.
  const s = e.dummyStrain;
  e.dummyStrain = s + (want - s) * (1 - Math.exp(-dt / (want > s ? 0.16 : 0.85)));

  /*
   * The peak flag. It jumps to the strain at once and bleeds at 0.09 a
   * second, so a weapon fired one and a half times a second parks it far
   * above its lit run while a continuous one parks it on the end -- the mean
   * and the peak on one scale, told apart by POSITION and not by colour.
   */
  e.dummyPeak = Math.max(e.dummyStrain, e.dummyPeak - dt * 0.09);

  const now = bandOf(dps);
  e.dummyBand = now;
  const held = e.dummyHeld;
  if (now >= held) {
    e.dummyHeld = now;
    e.dummySag = 0;
  } else if (held > 0 && (dps <= 0 || dps < dropEdge(held))) {
    e.dummySag += dt;
    if (e.dummySag > DWELL) { e.dummyHeld = held - 1; e.dummySag = 0; }
  } else {
    e.dummySag = 0;
  }
  e.dummyBandF += (e.dummyHeld - e.dummyBandF) * (1 - Math.exp(-dt * 2.2));

  e.dummyRoll += dt * (0.3 + e.dummyStrain * 1.9);
  e.dummyT += dt;
  e.dummyFlash = Math.max(0, e.dummyFlash - dt * 3.6);

  // The facets, decayed, and the hottest one found in the same pass.
  const st = e.strain;
  const fade = Math.exp(-dt * 0.55);
  let hot = -1;
  let best = 0.25;
  for (let i = 0; i < FACETS; i++) {
    st[i] *= fade;
    if (st[i] > best) { best = st[i]; hot = i; }
  }
  e.dummyHot = hot;

  /*
   * ...and which four facets the cracks run down. Chosen HERE, not in the
   * draw path: it is a partial sort and the draw path must not do one.
   *
   * The hottest first, so shooting one face moves the cracks to where you
   * shot -- and falling back to four fixed facets when nothing is landing,
   * because an element that exists only while something is currently hitting
   * it is an element the band sweep cannot see. Band 4 always shows four.
   */
  if (!e.dummyCracks) e.dummyCracks = new Int8Array(4);
  const cr = e.dummyCracks;
  for (let k = 0; k < 4; k++) cr[k] = k * 3;
  for (let k = 0; k < 4; k++) {
    let bestI = -1;
    let bestV = 0.25;
    for (let i = 0; i < FACETS; i++) {
      if (st[i] <= bestV) continue;
      let taken = false;
      for (let j = 0; j < k; j++) if (cr[j] === i) { taken = true; break; }
      if (!taken) { bestV = st[i]; bestI = i; }
    }
    if (bestI >= 0) cr[k] = bestI; else break;
  }

  // The wedges age in place; nothing is spliced and nothing is allocated.
  for (let i = 0; i < WEDGES; i++) {
    const a = i * 3 + 2;
    if (WEDGE[a] < 9) WEDGE[a] += dt;
  }
}

// --------------------------------------------------------- the per-hit marks

/**
 * The numbers, merged by octant.
 *
 * One live slot per eighth of the compass, each carrying a running sum, a
 * count and the heaviest hit in it. A slot RE-STRIKES when it is 0.16s old or
 * when the running sum reaches two and a half times its own peak -- so a slow
 * heavy round trips the size rule on every hit and shows each one on its own,
 * while a thirty-a-second stream re-strikes about six times a second carrying
 * the sum. Eight slots is a hard ceiling on how many numbers can ever be on
 * the screen, which is the fix for the old design's answer to a busy frame:
 * it SHORTENED each mark's life, showing less exactly where there was most.
 *
 * One long-lived effect per rig, so the numbers draw after the machine (a hit
 * must never be lost inside the glow) with no allocation per hit.
 */
const SLOTS = 8;

class Tally {
  constructor(e) {
    this.e = e;
    this.dead = false;
    this.ground = false;
    this.slot = [];
    for (let i = 0; i < SLOTS; i++) {
      this.slot.push({ sum: 0, count: 0, peak: 0, age: 9, w: 0, tw: 0, text: '' });
    }
  }

  /** A hit on bearing `a`, of whatever the delivered number was. */
  add(a, dmg) {
    const i = ((Math.round((a / TAU) * SLOTS) % SLOTS) + SLOTS) % SLOTS;
    const s = this.slot[i];
    if (s.age >= 0.42 + s.w * 0.5) { s.sum = 0; s.count = 0; s.peak = 0; }
    s.sum += dmg;
    s.count++;
    s.peak = Math.max(s.peak, dmg);
    s.w = weightOf(s.peak);
    if (s.age >= 0.16 || s.sum >= 2.5 * s.peak) {
      s.age = 0;
      s.text = (s.sum >= 1000 ? `${(s.sum / 1000).toFixed(1)}k` : String(Math.round(s.sum)))
        + (s.count > 1 ? ` ×${s.count}` : '');
      s.tw = 0; // re-measured on the next draw, and only when the text moves
    }
  }

  update(world, dt) {
    for (const s of this.slot) s.age += dt;
    if (!world.enemies.includes(this.e)) this.dead = true;
  }

  draw(ctx) {
    const e = this.e;
    const R = e.r;
    const tone = toneAt(e.dummyBandF || 0);
    const was = ctx.globalAlpha;
    for (let i = 0; i < SLOTS; i++) {
      const s = this.slot[i];
      if (!s.text) continue;
      const k = clamp(s.age / (0.42 + s.w * 0.5), 0, 1);
      if (k >= 1) { s.text = ''; s.sum = 0; s.count = 0; s.peak = 0; continue; }
      // Anchored on the octant's own bearing, so eight numbers are 38 points
      // apart on the rim and can never pile up on each other.
      const ang = (i / SLOTS) * TAU;
      const rr = R * 1.15 + (34 + s.w * 46) * k;
      const x = e.x + Math.cos(ang) * rr;
      const y = e.y + Math.sin(ang) * rr;
      const size = 9 + s.w * 15;
      ctx.font = `600 ${size.toFixed(1)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!s.tw) s.tw = ctx.measureText(s.text).width;
      /*
       * Plated. The head is a lit object under a halo, and thin glyphs over a
       * busy ground vanish exactly when the number matters -- the same rule
       * the corruption readout is held to.
       */
      const pad = size * 0.34;
      const h = size * 1.16;
      const x0 = x - s.tw / 2 - pad;
      const y0 = y - h / 2;
      const c = h * 0.34;
      ctx.globalAlpha = was * (1 - k * k);
      ctx.fillStyle = 'rgba(4,8,14,0.62)';
      ctx.beginPath();
      ctx.moveTo(x0 + c, y0);
      ctx.arcTo(x0 + s.tw + pad * 2, y0, x0 + s.tw + pad * 2, y0 + h, c);
      ctx.arcTo(x0 + s.tw + pad * 2, y0 + h, x0, y0 + h, c);
      ctx.arcTo(x0, y0 + h, x0, y0, c);
      ctx.arcTo(x0, y0, x0 + s.tw + pad * 2, y0, c);
      ctx.fill();
      ctx.fillStyle = s.w > 0.55 ? '#ffffff' : tone;
      ctx.fillText(s.text, x, y);
    }
    ctx.globalAlpha = was;
  }
}

/**
 * A hit landed. Called from `Enemy.applyDamage` with the DELIVERED number --
 * so what the rig shows is what the body lost, and not what the caller asked
 * for. Same rule the ledger is held to, and for the same reason.
 */
export function dummyHit(world, e, dmg, nx, ny) {
  if (!(dmg > 0)) return;
  ensureRig(e);
  /*
   * The record, before anything else. `dmg` is the DELIVERED damage -- this is
   * called from `applyDamage` past ARMORED's discard, past the plate, past a
   * ward and past the `Math.max(1, ...)` floor -- so what is booked is what
   * the rig actually lost, which is the same rule the ledger follows and for
   * the same reason. It is kept in memory and flushed on a clock; see
   * `Soak` in ledger.js for why it is not a write per hit.
   */
  soak.add(dmg);
  const w = weightOf(dmg);
  /*
   * The contact face. `nx, ny` is the round's travel for a projectile and the
   * blast's outward direction for an area hit, and both put the face at
   * `centre - n * r`; a hit with no direction at all lands somewhere on the
   * rim, which is honest for a patch or a wire.
   */
  let ax = nx;
  let ay = ny;
  if (!(ax || ay)) { const a = rand(0, TAU); ax = Math.cos(a); ay = Math.sin(a); }
  const d = Math.hypot(ax, ay) || 1;
  ax /= d; ay /= d;
  const bearing = Math.atan2(-ay, -ax);
  const px = e.x - ax * e.r * 0.9;
  const py = e.y - ay * e.r * 0.9;

  e.dummyFlash = Math.min(1.6, e.dummyFlash + 0.35 + w * 0.9);

  /*
   * The strain deposit, and the modulo is load-bearing: `Math.round(a / TAU *
   * 12) % 12` is NEGATIVE for every atan2 below zero, and a Float32Array
   * swallows a negative index in silence -- the whole upper half of the head
   * would never accumulate and nothing would look wrong.
   */
  const fi = ((Math.round((bearing / TAU) * FACETS) % FACETS) + FACETS) % FACETS;
  const st = e.strain;
  st[fi] = Math.min(1.4, st[fi] + w * 0.9);
  const l = (fi + FACETS - 1) % FACETS;
  const r2 = (fi + 1) % FACETS;
  st[l] = Math.min(1.4, st[l] + w * 0.35);
  st[r2] = Math.min(1.4, st[r2] + w * 0.35);

  // The wedge, into the ring buffer.
  const o = wedgeAt * 3;
  WEDGE[o] = bearing;
  WEDGE[o + 1] = w;
  WEDGE[o + 2] = 0;
  wedgeAt = (wedgeAt + 1) % WEDGES;

  if (e.tally) e.tally.add(bearing, dmg);

  /*
   * Chips off the plate, along the reflected direction, and the count FALLS
   * as the rate climbs -- one to three at full tilt. Thirty fans a second at
   * the old count was fog, and particles draw after the numbers, so anything
   * sustained papers over the readout.
   */
  const tone = toneAt(Math.max(1, e.dummyBandF || 0));
  const n = Math.max(1, Math.round((2 + w * 6) * (1 - e.dummyStrain * 0.55)));
  const back = Math.atan2(-ay, -ax);
  for (let i = 0; i < n; i++) {
    const a = back + spread(0.9);
    const sp = rand(120, 200 + w * 520);
    spark(px, py, Math.cos(a) * sp, Math.sin(a) * sp, tone, rand(0.14, 0.3 + w * 0.3), 1.6 + w * 2);
  }
  // ...and a faceted piece with gravity off a heavy one: the mechanical read.
  if (w > 0.5) {
    const a = back + spread(0.5);
    shard(px, py, Math.cos(a) * rand(180, 420), Math.sin(a) * rand(180, 420),
      '#dbe8f2', rand(0.3, 0.6), 2.4 + w * 2.4);
  }
  // A heavy hit moves the ground as well, which is the difference a SLUG or a
  // KNELL toll should read as against a bolt.
  if (w > 0.42) ripple(px, py, 0.5 + w, 90 + w * 260);
}

// ---------------------------------------------------------------- the model

export function drawDummy(ctx, e) {
  ensureRig(e);
  const R = e.r;
  const s = clamp(e.dummyStrain, 0, 1);
  /*
   * `bf` and not the instantaneous band: a continuous position eased toward
   * the HELD band, so every element fades and moves in over the half second
   * the position takes to cross its own band rather than appearing between
   * two frames.
   */
  const bf = e.dummyBandF || 0;
  const t = e.dummyT || 0;
  const flash = clamp(e.dummyFlash, 0, 1.6);
  const tone = toneAt(bf);
  const lit0 = clamp(bf, 0, 1);
  const a1 = smoothstep(arrived(bf, 1));
  const a2 = arrived(bf, 2);
  const a3 = arrived(bf, 3);
  const a4 = smoothstep(arrived(bf, 4));
  const a5 = smoothstep(arrived(bf, 5));
  const sh2 = detent(a2);
  const sh3 = detent(a3);
  const hair = CFG.hairline;

  /*
   * ---- two forms, one rig ----
   *
   * Everything above this line is shared and none of it is form: the pin, the
   * strain, the band walk, the marks and the record are `updateDummy`'s and
   * `dummyHit`'s, and the eight values below are the band machinery's reading
   * of them. D2 is handed that reading and paints; it computes none of it.
   *
   * HANDED OVER rather than imported, and that is not only tidiness: `d2.js`
   * importing `toneAt`, `arrived` and `detent` back out of here is a CYCLE,
   * and `bundle.mjs` orders modules by an acyclic walk. The single-file build
   * is where this game has already lost fifty-three builds to a module-graph
   * surprise, and a cycle is not a thing to find out about from a dead page.
   */
  if (e.dummyForm === 2) {
    drawD2(ctx, e, { R, s, bf, t, flash, tone, lit0, a1, a2, a3, a4, a5, hair });
    return;
  }

  /*
   * The mount leans as it works: the ring foreshortens and tips. Two
   * incommensurate judder frequencies once the trim is gone, so it never
   * resolves into a clean oscillation and reads as a servo fighting itself.
   */
  const tilt = 0.5 + 0.18 * sh2;
  const squash = Math.cos(tilt);
  const jud = a4 * 0.026 * (Math.sin(t * 41) + 0.6 * Math.sin(t * 26.3));
  const roll = e.dummyRoll + jud;
  const RR = R * 1.12;

  const was = ctx.globalAlpha;
  ctx.save();
  ctx.translate(e.x, e.y);

  // ---- band 5: light pooling on the deck -------------------------------
  if (a5 > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.scale(1, 0.42);
    drawGlow(ctx, tone, 0, 0, R * 2.6, (0.07 + s * 0.15) * a5);
    ctx.restore();
  }

  // ---- the halo --------------------------------------------------------
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, tone, 0, 0, R * (1.7 + s * 1.5),
    0.05 + lit0 * (0.05 + s * 0.4) + flash * 0.18);
  ctx.globalCompositeOperation = 'source-over';

  // ---- the soak shell: the record, in beads -----------------------------
  /*
   * Drawn here, between the halo and the machine: outside every part of the
   * rig by construction (the first bead's inner edge is at 1.29R and the
   * furthest hard geometry is 1.20R), and under the additive glows so the
   * inner ring catches the core's light the way anything else standing near
   * it would.
   *
   * Three fills for the whole shell -- the far half, the near half, and the
   * one arriving -- plus one stroke for however many rings are closed.
   * `BEAD_TONE` is a constant and the two alphas are constants, so this
   * contributes exactly three entries to the `rgba` cache for the life of the
   * process and never touches `glowSprite`, whose cache has no ceiling.
   */
  const beads = soakBeads(soak.total);
  if (beads > 0) {
    const full = Math.min(SOAK_BEADS, Math.floor(beads));
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = rgba(BEAD_TONE, pass ? 0.78 : 0.4);
      ctx.beginPath();
      for (let i = 0; i < full; i++) {
        if (BEAD_S[i] !== pass) continue;
        const rr = R * BEAD_R[i];
        const bx = BEAD_CX[i] * rr;
        const by = BEAD_CY[i] * rr;
        const sz = R * BEAD_SZ[i];
        ctx.moveTo(bx + sz, by);
        ctx.arc(bx, by, sz, 0, TAU);
      }
      ctx.fill();
    }
    /*
     * ...and a joining circle for each CLOSED ring, so shutting a decade is
     * something you see happen. A partial ring gets none: an empty circle
     * with three beads on it would promise a ring that is not there yet.
     */
    const closed = Math.floor(full / SOAK_PER_SHELL);
    if (closed > 0) {
      ctx.strokeStyle = rgba(BEAD_TONE, 0.1);
      ctx.lineWidth = hair * 1.2;
      ctx.beginPath();
      for (let k = 0; k < closed; k++) {
        // Off the bead table, not a second copy of its arithmetic.
        const rr = R * BEAD_R[k * SOAK_PER_SHELL];
        ctx.moveTo(rr, 0);
        ctx.arc(0, 0, rr, 0, TAU);
      }
      ctx.stroke();
    }
    /*
     * ...and the one being earned, which is the whole difference between a
     * record and a picture of a record: it grows and drifts out into its slot
     * over the damage it costs. No animation state -- the fraction IS the
     * arrival, so it survives a reload at exactly the size it had. At the
     * first ring that takes a fifth of a second on a bought turret and you
     * watch it land; at the fifth it takes an hour and it does not appear to
     * move at all, which is correct.
     */
    const frac = Math.min(1, beads - full);
    if (full < SOAK_BEADS && frac > 0.02) {
      const i = full;
      const rr = R * BEAD_R[i] + (1 - frac) * R * 0.05;
      ctx.globalAlpha = was * frac;
      ctx.fillStyle = rgba(BEAD_TONE, BEAD_S[i] ? 0.78 : 0.4);
      ctx.beginPath();
      ctx.arc(BEAD_CX[i] * rr, BEAD_CY[i] * rr,
        R * BEAD_SZ[i] * (0.45 + 0.55 * frac), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = was;
    }
  }

  // ---- the deck plate and its strut (fixed) ----------------------------
  ctx.fillStyle = 'rgba(9,14,20,0.95)';
  ctx.beginPath();
  ctx.moveTo(-R * 0.3, R * 1.02);
  ctx.lineTo(R * 0.3, R * 1.02);
  ctx.lineTo(R * 0.24, R * FOOT);
  ctx.lineTo(-R * 0.24, R * FOOT);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#4a6379', 0.6);
  ctx.lineWidth = hair * 1.4;
  ctx.beginPath();
  ctx.moveTo(-R * 0.16, R * 1.02); ctx.lineTo(-R * 0.13, R * FOOT);
  ctx.moveTo(R * 0.16, R * 1.02); ctx.lineTo(R * 0.13, R * FOOT);
  ctx.stroke();

  // ---- the collar (fixed) ----------------------------------------------
  ctx.strokeStyle = rgba('#4a6379', 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.08, 0, TAU);
  ctx.stroke();

  // ---- the encoder scale (fixed) ---------------------------------------
  /*
   * Twenty-four ticks, lit from the bottom outward, and the lit COUNT is the
   * strain -- a bar graph wrapped round the mount, so the band can be counted
   * on a still screen where a faint glow cannot. Batched into two paths; it
   * was twenty-four separate strokes, which was most of the old rig's cost.
   */
  if (a1 > 0.01) {
    const lit = Math.round(s * TICKS);
    ctx.globalAlpha = was * a1;
    for (let pass = 0; pass < 2; pass++) {
      const on = pass === 1;
      ctx.strokeStyle = on ? rgba(tone, 0.95) : rgba('#4a6379', 0.5);
      ctx.lineWidth = hair * (on ? 2.6 : 1.2);
      ctx.beginPath();
      for (let i = 0; i < TICKS; i++) {
        if ((i < lit) !== on) continue;
        const r0 = R * (on ? 1.02 : 1.06);
        ctx.moveTo(TICK_C[i] * r0, TICK_S[i] * r0);
        ctx.lineTo(TICK_C[i] * R * FOOT, TICK_S[i] * R * FOOT);
      }
      ctx.stroke();
    }
    // ...and the peak flag: the mean and the peak on one scale, one white
    // tick standing where the rate last reached.
    const pi = clamp(Math.round(e.dummyPeak * TICKS), 0, TICKS - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = hair * 2.2;
    ctx.beginPath();
    ctx.moveTo(TICK_C[pi] * R * 0.98, TICK_S[pi] * R * 0.98);
    ctx.lineTo(TICK_C[pi] * R * FOOT, TICK_S[pi] * R * FOOT);
    ctx.stroke();
    ctx.globalAlpha = was;
  }

  // ---- the far half of the gimbal ring, and its trunnions --------------
  ctx.strokeStyle = rgba(tone, 0.5);
  ctx.lineWidth = hair * 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, RR, RR * squash, roll, Math.PI, TAU);
  ctx.stroke();
  ctx.save();
  ctx.rotate(roll);
  ctx.fillStyle = rgba(tone, 0.7);
  ctx.beginPath();
  ctx.rect(-RR - R * 0.08, -R * 0.05, R * 0.16, R * 0.1);
  ctx.rect(RR - R * 0.08, -R * 0.05, R * 0.16, R * 0.1);
  ctx.fill();
  ctx.restore();

  // ---- the head. A polygon reads as milled; a circle reads as drawn. ----
  ctx.save();
  ctx.rotate(jud);
  const HR = R * 0.82;
  ctx.beginPath();
  ctx.moveTo(HEAD_C[0] * HR, HEAD_S[0] * HR);
  for (let i = 1; i < FACETS; i++) ctx.lineTo(HEAD_C[i] * HR, HEAD_S[i] * HR);
  ctx.closePath();
  ctx.fillStyle = 'rgba(9,14,20,0.90)';
  ctx.fill();
  ctx.strokeStyle = rgba(tone, 0.85);
  ctx.lineWidth = hair * 1.6;
  ctx.stroke();

  // The bolts give the shell a fixed orientation, so the fact that the head
  // does NOT spin while everything round it does is visible.
  ctx.fillStyle = rgba(tone, 0.45);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const bx = Math.cos(a) * R * 0.7;
    const by = Math.sin(a) * R * 0.7;
    ctx.moveTo(bx + R * 0.045, by);
    ctx.arc(bx, by, R * 0.045, 0, TAU);
  }
  ctx.fill();

  // ---- band 2: the vents crack open ------------------------------------
  if (a2 > 0.01) {
    const open = Math.min(1, sh2 * (1 + 0.35 * a5));
    const r0 = R * 0.68;
    const r1 = R * 0.8;
    const cut = () => {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const c = (i / 4) * TAU + Math.PI / 4;
        const half = 0.14 * open;
        ctx.moveTo(Math.cos(c - half) * r0, Math.sin(c - half) * r0);
        ctx.arc(0, 0, r0, c - half, c + half);
        ctx.lineTo(Math.cos(c + half) * r1, Math.sin(c + half) * r1);
        ctx.arc(0, 0, r1, c + half, c - half, true);
        ctx.closePath();
      }
    };
    ctx.fillStyle = 'rgba(4,8,12,0.9)';
    cut();
    ctx.fill();
    // ...and the light coming through them.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = was * (0.1 + s * 0.35) * open;
    ctx.fillStyle = rgba(tone, 0.9);
    cut();
    ctx.fill();
    ctx.globalAlpha = was;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- the core, seen through the aperture ------------------------------
  /*
   * The aperture stops DOWN as the rate climbs and the light through it gets
   * fiercer -- the inversion is the whole read. The floor of 0.30R is not
   * negotiable: the thing you point at must never be smallest, occluded and
   * vibrating exactly when you are firing hardest.
   */
  const ap = clamp(R * (0.52 - 0.22 * s) + flash * 0.06 * R, R * 0.3, R * 0.56);
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, tone, 0, 0, ap * 2.6, 0.22 + s * 0.62 + flash * 0.28);
  // ...and the surface glowing through where you have been aiming.
  if (e.dummyHot >= 0) {
    const i = e.dummyHot;
    const hv = clamp(e.strain[i], 0, 1);
    drawGlow(ctx, mixHex(tone, '#ffffff', 0.4),
      HEAD_C[i] * R * 0.66, HEAD_S[i] * R * 0.66, R * 0.42, 0.3 * hv * (0.3 + s));
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- the iris ---------------------------------------------------------
  /*
   * Six leaves, all in one fill path, opaque enough to mask the core -- which
   * is the whole point of an aperture. At band 5 two of them stall behind the
   * others, so the hole stops being a hexagon.
   */
  const lagOf = (i) => (a5 > 0.5 && (i === 1 || i === 4) ? 0.22 : 0);
  /*
   * A lighter value than the head's own plate, not the same one. They were
   * both `rgba(9,14,20,0.9x)` and the iris was invisible: six leaves drawn in
   * the colour of the thing they sit in, over a lit core that then read as a
   * plain glowing hexagon. A leaf is machined metal in front of a lamp; it has
   * to be the brighter of the two, and the lit chord along its leading edge is
   * what makes six of them read as an aperture.
   */
  ctx.fillStyle = 'rgba(26,36,48,0.97)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const lag = lagOf(i);
    const pa = (i / 6) * TAU;
    const p1 = pa + TAU / 6;
    ctx.moveTo(Math.cos(pa) * R * 0.62, Math.sin(pa) * R * 0.62);
    ctx.lineTo(Math.cos(p1) * R * 0.62, Math.sin(p1) * R * 0.62);
    ctx.lineTo(Math.cos(p1 - 0.55 + lag) * ap, Math.sin(p1 - 0.55 + lag) * ap);
    ctx.lineTo(Math.cos(pa - 0.55 + lag) * ap, Math.sin(pa - 0.55 + lag) * ap);
    ctx.closePath();
  }
  ctx.fill();
  ctx.strokeStyle = rgba(mixHex(tone, '#ffffff', 0.35), 0.9);
  ctx.lineWidth = hair * 1.8;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const lag = lagOf(i);
    const pa = (i / 6) * TAU - 0.55 + lag;
    ctx.moveTo(Math.cos(pa) * ap, Math.sin(pa) * ap);
    ctx.lineTo(Math.cos(pa + TAU / 6) * ap, Math.sin(pa + TAU / 6) * ap);
  }
  ctx.stroke();

  // ---- the bore lip, and the boresight ----------------------------------
  // A hole needs an edge; and the aim mark is engraved on the bezel, in front
  // of the aperture, never crossed by a shutter and never covered by a leaf.
  ctx.strokeStyle = rgba(tone, 0.7);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.6, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(tone, 0.75);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    ctx.moveTo(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4);
    ctx.lineTo(Math.cos(a) * R * 0.56, Math.sin(a) * R * 0.56);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.05, 0, TAU);
  ctx.fill();

  // ---- band 4: the cracks -----------------------------------------------
  /*
   * Seeded once at module load and never re-rolled. Stroked twice: a dark
   * core, then a lit fill -- a dark line on a dark plate adds no lit pixels
   * and is invisible to a colourblind player, to a greyscale screenshot and
   * to the instrument alike, so the lit pass is what makes it an ARRIVAL.
   *
   * The facets are the hottest ones first and fall back to four fixed ones
   * when nothing is landing, so band 4 always shows its cracks: an element
   * that exists only while something is currently hitting it is an element
   * the sweep cannot see.
   */
  if (a4 > 0.01) {
    const n = Math.ceil(4 * a4);
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass
        ? rgba(mixHex(tone, '#ffffff', 0.5), 0.55 + s * 0.35)
        : 'rgba(3,6,10,0.85)';
      ctx.lineWidth = hair * (pass ? 1 : 2.2);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const f = e.dummyCracks ? e.dummyCracks[k] : k * 3;
        const len = R * (0.12 + 0.22 * Math.min(1, e.strain[f]));
        const c = HEAD_C[f];
        const sn = HEAD_S[f];
        for (let p = 0; p < CRACK_PTS; p++) {
          const i = (f * CRACK_PTS + p) * 2;
          const rr = R * 0.82 - CRACK[i] * len;
          const off = CRACK[i + 1] * R;
          const x = c * rr - sn * off;
          const y = sn * rr + c * off;
          if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  // ---- the strike wedges -------------------------------------------------
  /*
   * Not an expanding ring: a wedge at the radius it means, in the head's own
   * frame so it rides the judder, denting INWARD as it dies. Ten of them in
   * three alpha buckets, so ten hits cost three strokes.
   */
  for (let b = 0; b < 3; b++) {
    ctx.strokeStyle = `rgba(255,255,255,${(0.25 + b * 0.3).toFixed(2)})`;
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < WEDGES; i++) {
      const o2 = i * 3;
      const age = WEDGE[o2 + 2];
      if (age >= 0.34) continue;
      const k = age / 0.34;
      const av = 1 - k * k;
      if (Math.min(2, Math.floor(av * 3)) !== b) continue;
      const wgt = WEDGE[o2 + 1];
      const ang = WEDGE[o2] - jud;
      const rr = R * (0.9 - 0.06 * k);
      ctx.lineWidth = hair * (1.6 + wgt * 4);
      ctx.moveTo(Math.cos(ang - wgt * 0.3) * rr, Math.sin(ang - wgt * 0.3) * rr);
      ctx.arc(0, 0, rr, ang - wgt * 0.3, ang + wgt * 0.3);
      any = true;
    }
    if (any) ctx.stroke();
  }
  ctx.restore(); // out of the head's judder frame

  // ---- band 3: the shutters ---------------------------------------------
  /*
   * Two armour blades sliding in from top and bottom, stopping at 0.62R just
   * outside the bore lip: the round face becomes a letterbox, which is the
   * biggest silhouette change on the ladder, and the aperture is never
   * touched. At band 5 the TOP one freezes at 60% of travel and cocked off
   * square while the bottom one keeps working -- the only band that arrives
   * as a broken thing rather than as more of a thing.
   */
  if (a3 > 0.01) {
    const chat = R * 0.03 * Math.sin(t * 38) * a4;
    /*
     * Clipped to the head's own disc, which is the difference between armour
     * and a black wedge. Unclipped they ran to 1.14R and 0.86R wide -- two
     * slabs across the whole mount, covering the encoder scale and half the
     * ring, which read as the picture being occluded rather than as the
     * machine closing up. Inside the clip they crop the round face into a
     * letterbox, which is the largest silhouette change on the ladder.
     */
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.83, 0, TAU);
    ctx.clip();
    for (const side of [-1, 1]) {
      const jam = side < 0 && a5 > 0.5;
      const travel = jam ? 0.6 : sh3;
      const hs = Math.max(R * 0.62, R * (0.88 - 0.26 * travel) + Math.abs(chat));
      ctx.save();
      if (jam) ctx.rotate(0.1 * a5);
      ctx.fillStyle = 'rgba(7,11,17,0.97)';
      // From the leading edge OUTWARD, both ways. The first version gave the
      // top blade a rect from -1.2R of height 1.2R, which ends at zero -- so
      // it covered the whole upper half of the head rather than the band
      // between its own edge and the rim, and the letterbox was a slot.
      const y0 = side > 0 ? hs : -R * 1.2;
      const y1 = side > 0 ? R * 1.2 : -hs;
      ctx.beginPath();
      ctx.rect(-R, y0, R * 2, y1 - y0);
      ctx.fill();
      // ...and the leading edge is lit, so a closed blade is a line and not
      // an absence.
      ctx.strokeStyle = rgba(tone, 0.75);
      ctx.lineWidth = hair * 2;
      ctx.beginPath();
      ctx.moveTo(-R * 0.84, side * hs);
      ctx.lineTo(R * 0.84, side * hs);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- the near half of the ring, in FRONT of everything ----------------
  // Behind the head at the top and in front of it at the bottom: that is the
  // whole illusion, and it costs one more arc.
  ctx.strokeStyle = rgba(tone, 0.95);
  ctx.lineWidth = hair * 3.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, RR, RR * squash, roll, 0, Math.PI);
  ctx.stroke();

  ctx.globalAlpha = was;
  ctx.restore();
}

/**
 * Put one down.
 *
 * ---- and it is NOT `harmless`, which it was until build 235 ----
 *
 * `harmless` is the game's word for "grey, scenery, cannot hurt you", and it
 * is tested by far more than the corruption path it was set for. FIVE damage
 * paths skip a harmless body outright -- a MINE is not triggered by one, a
 * WIRE will not cut one, a patch (THORN's ground and SPORE's) will not burn
 * one, and LANCE's sweep and WARD's arc both pass over one. So the dummy
 * silently could not be hurt by five of the things it exists to measure, and
 * the earlier audit missed every one of them because it measured against a
 * BULWARK, which is not harmless.
 *
 * What `harmless` was there for was to stop the thing walking at the turret,
 * and that is bought properly now: `dummyHome` is where it was put and
 * `updateDummy` puts it back every frame. `counts` still keeps it out of the
 * tally, and it cannot die, so it can never pay.
 */
export function placeDummy(game, up = DUMMY.up, form = 1) {
  const w = game.world;
  const e = game.debugSpawn('bulwark', w.width / 2, w.shooter.y - up);
  if (!e) return null;
  // Which rig this is. The ONLY thing about a dummy that differs between the
  // rooms; everything else on it is set the same way for both.
  e.dummyForm = form === 2 ? 2 : 1;
  e.staged = false;
  e.spawnIn = 0;
  e.dummy = true;
  e.counts = false;
  e.invMass = 0;
  e.vx = 0;
  e.vy = 0;
  e.r = DUMMY.r;
  e.dummyHome = { x: e.x, y: e.y };
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.armor = 0;
  e.ward = 0;
  e.traits = [];
  ensureRig(e);
  // One numbers effect per rig, long-lived, so the marks draw after the
  // machine with no allocation per hit.
  for (let i = w.effects.length - 1; i >= 0; i--) {
    if (w.effects[i] instanceof Tally) w.effects.splice(i, 1);
  }
  e.tally = new Tally(e);
  w.effects.push(e.tally);
  return e;
}
