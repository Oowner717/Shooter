// The portal: where everything the simulation sends comes through.
//
// From build 297 nothing arrives from the top of the screen. The old field
// dropped bodies in from above the chrome and the era-2 field walked them out
// of a building's door; both are one thing now, at both eras -- a rift lying
// in the far end of the field, seen in the same perspective the grid is drawn
// in, with a vortex inside it and a rim everything is born through.
//
// It is NOT a body, for the reason the yard is not: it is one derived plain
// object at `world.portal`, in no list anything walks, so every damage path in
// the game misses it by construction rather than by a guard. It is a function
// of the era and the screen and is stored nowhere -- `syncPortal` is the ONE
// writer, called from `Game.resize`, and a rotation re-derives it.
//
// It imports config and util and NOTHING else. `enemies.js` and `yard.js`
// both import from here, and `scripts/bundle.mjs` orders modules by an
// acyclic walk -- a cycle ships a page that boots to its title and does
// nothing else.

import { CFG } from './config.js';
import { TAU, clamp, rgba, mixHex } from './util.js';

/**
 * The entry line: where a body stops being `staged` and becomes something the
 * assist may choose. It is the portal's LOWER RIM, and the rim is derived --
 * see `syncPortal` for why it can sit below `entryY + CFG.entryDepth` -- so
 * everything that used to read that sum reads this instead. Without a portal
 * (the assay) it is the sum, exactly as it always was.
 */
export function entryLine(world, entryY = 0) {
  const P = world.portal;
  return P ? P.rim : entryY + CFG.entryDepth;
}

/**
 * Derive the portal, or clear it. The ONE writer.
 *
 * ---- where it stands, and why the entry line moved to follow it
 *
 * The rim is the entry line and the entry line is the rim: a body is born on
 * the frame it clears the rim, and that is the frame `staged` comes off, so
 * "walks out" and "goes live" are the same visible event, as they were at the
 * era-2 door. But the portal has to be SEEN, whole, or it is the drawing
 * running out at the top of the screen -- and the chrome above the field is
 * 76 CSS px on a phone with no notch and up to 135 on one with a notch. At
 * era 1 the entry line is 260 world units and the chrome ends at 123 on the
 * small screen and about 215 under a notch, so a portal pinned to the line
 * would be half under the bar on every current iPhone.
 *
 * So the rim is `max(entryY + entryDepth, chrome + pad + 2 ry)`: exactly the
 * old entry line wherever the portal fits above it (the suite's viewports, an
 * SE), and lower by the notch where it does not. `world.floorY` has always
 * been derived from the chrome at the bottom in the same way; this is the top
 * catching up. Anything that reads the line goes through `entryLine`.
 *
 * `chromeY` is in WORLD units and comes from the probe `Game.resize` already
 * reads for the safe area -- `getBoundingClientRect` on `#topbar` is all
 * zeros while the title screen is up, which is exactly when the constructor
 * first calls this.
 */
export function syncPortal(world, entryY, chromeY = 0) {
  if (world.sandbox) { world.portal = null; return null; }
  const C = CFG.portal;
  const P = world.portal || { births: [], spin: 0, flare: 0 };
  const line = entryY + CFG.entryDepth;
  const rim = Math.max(line, chromeY + C.pad + 2 * C.ry);
  P.x = world.width / 2;
  P.rx = C.rx;
  P.ry = C.ry;
  P.rim = rim;
  P.y = rim - C.ry;
  P.top = rim - 2 * C.ry;
  P.line = line;
  P.chromeY = chromeY;
  world.portal = P;
  return P;
}

/**
 * How wide the mouth is for a body of radius r: the band of the rim births
 * are spread across. Narrower than the rim itself, because the rim is an
 * ellipse and its outer fifth is nearly level with the centre line -- a body
 * born there would be visibly out of the surface long before it clears the
 * line.
 */
function mouthHalf(P, r) {
  return Math.max(8, P.rx * CFG.portal.mouth - r - 4);
}

/**
 * Map a field-wide x into the mouth. Identity without a portal.
 *
 * Load-bearing: it draws NO random on either branch. The callers roll their
 * own x first and this is applied to the ANSWER, so the `Math.random` call
 * order of every spawn site is what it was -- which is what ORDINAL's hash is
 * sensitive to. (The hash still moves on build 297, because the answers do;
 * see CLAUDE.md. But it moves for that reason and no other.)
 */
export function throughMouth(world, x, r) {
  const P = world.portal;
  if (!P) return x;
  const half = mouthHalf(P, r);
  const k = half / (world.width / 2);
  return clamp(P.x + (x - world.width / 2) * k, P.x - half, P.x + half);
}

/**
 * Where a formation's bodies stand so the WHOLE of it comes through the
 * mouth: rows across it, stacked upward, centred. Absolute x, relative y.
 * Null without a portal, where `formationOffset`'s six shapes keep the sky
 * they were authored for.
 *
 * Rows rather than the authored shapes, and that is arithmetic rather than
 * taste: at the population ceiling BLOOM x12's `line` spans 995 world units
 * against a 968-wide field, and no mouth passes that with its spacing intact.
 * `pitch` is `2r + 8`, so overlap is impossible by construction, and the
 * stack is hidden -- everything above the portal's centre line is drawn
 * nowhere, see `drawPortal`.
 */
export function mouthSlots(world, r, gap, count) {
  const P = world.portal;
  if (!P) return null;
  const half = mouthHalf(P, r);
  const pitch = r * 2 + 8;
  const per = Math.max(1, Math.floor((half * 2) / pitch));
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / per);
    const n = Math.min(per, count - row * per);
    out.push([P.x + ((i % per) - (n - 1) / 2) * pitch, -row * gap]);
  }
  return out;
}

/** The rim's y under a given x: the ellipse's lower half. */
function rimAt(P, x) {
  const u = clamp((x - P.x) / P.rx, -1, 1);
  return P.y + P.ry * Math.sqrt(1 - u * u);
}

/**
 * A body has cleared the rim. Called from the one place `staged` comes off,
 * for a body that came through the mouth -- something put down on the field
 * by the debug picker is not a birth and gets no flare.
 */
export function portalBirth(world, e) {
  const P = world.portal;
  if (!P || Math.abs(e.x - P.x) > P.rx + e.r) return false;
  if (P.births.length >= 24) P.births.shift();
  P.births.push({ x: e.x, r: e.r, t: 0, life: 0.8 });
  P.flare = 1;
  return true;
}

/** Returns on its first line without a portal, which is what makes it free. */
export function updatePortal(world, dt) {
  const P = world.portal;
  if (!P) return;
  P.spin += dt;
  if (P.flare > 0) P.flare = Math.max(0, P.flare - dt * 1.4);
  for (let i = P.births.length - 1; i >= 0; i--) {
    const b = P.births[i];
    b.t += dt;
    if (b.t >= b.life) P.births.splice(i, 1);
  }
}

/**
 * Draw it, and draw the bodies that are inside it.
 *
 * `bodies` is every staged body in the throat and `drawBody(e)` paints one;
 * the portal decides where each may be seen, in three passes:
 *
 *   above the centre line ... nowhere. The wave stacks up there, and a
 *                             stack of bodies in open sky is the thing this
 *                             whole feature exists to end.
 *   inside the ellipse ...... GHOSTED, clipped to the surface, fading in
 *                             from nothing at the top rim to about half at
 *                             the bottom one -- something is coming, seen
 *                             through the surface.
 *   below the centre line and
 *   outside the ellipse ..... WHOLE. This is the part of a body that has
 *                             pushed through the surface, and it is drawn
 *                             before the rim so the rim reads as the hoop it
 *                             is coming through.
 *
 * The clip is a rect below the centre line with the ellipse cut out of it
 * (`evenodd`), which is "outside the surface, on our side of it" in one path.
 *
 * Told apart from every body by REGISTER: it is LARGE, it is STATIC in place,
 * it is the only ellipse on the field, and it TURNS -- nothing else on the
 * field rotates in place. A colourblind player receives all four. Its colours
 * are the sky's own (`mood.accent`, `mood.line`), for the reason the yard's
 * were: every saturated hue in the game is spoken for.
 *
 * During an anomaly it is SEALED: the vortex stops, the rim dims, and nothing
 * is born -- the anomaly is what happens instead of the wave field.
 */
export function drawPortal(ctx, world, mood, bodies = [], drawBody = null) {
  const P = world.portal;
  if (!P) return;
  const k = CFG.scale;
  const hl = CFG.hairline;
  const t = world.time || 0;
  const sealed = !!world.boss;
  const accent = mood.accent;
  const bright = mixHex(accent, '#ffffff', 0.5);
  const breath = sealed ? 0 : 0.5 + 0.5 * Math.sin(t * 1.7);
  const live = sealed ? 0.35 : 1;
  const W = world.width;
  const H = world.height;

  ctx.save();

  /* ---- the spill, first, so everything is drawn over it ------------------
   * A widening wedge down the field from the rim rather than a disc, because
   * a disc says "a lamp" and a wedge says "a way out". At era 2 it runs to
   * the wall, which is where the light of the enemy's side ends.
   */
  const spillTo = world.yard ? world.yard.wallY + 40 * k : P.rim + CFG.portal.spill * k;
  const spill = ctx.createLinearGradient(0, P.rim - P.ry * 0.4, 0, spillTo);
  spill.addColorStop(0, rgba(accent, 0.17 * live));
  spill.addColorStop(0.5, rgba(accent, 0.06 * live));
  spill.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(P.x - P.rx * 0.8, P.y);
  ctx.lineTo(P.x + P.rx * 0.8, P.y);
  ctx.lineTo(P.x + P.rx * 0.8 + 60 * k, spillTo);
  ctx.lineTo(P.x - P.rx * 0.8 - 60 * k, spillTo);
  ctx.closePath();
  ctx.fill();

  /* ---- the halo round the rim -------------------------------------------
   * Drawn in the ellipse's own frame, so a circle gradient is an elliptical
   * one. The rim is the brightest ring and it falls off both ways.
   */
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.scale(P.rx, P.ry);
  const halo = ctx.createRadialGradient(0, 0, 0.9, 0, 0, 1.45);
  halo.addColorStop(0, rgba(accent, 0.34 * live * (0.8 + 0.2 * breath)));
  halo.addColorStop(0.45, rgba(accent, 0.1 * live));
  halo.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 1.45, 0, TAU);
  ctx.fill();
  ctx.restore();

  /* ---- the hole -----------------------------------------------------------
   * A hole punched in the sky: darker than anything behind it, or -- as the
   * yard's first face was -- drawn, placed and invisible. Then the interior,
   * dark at the centre and lit toward the rim, which is what a surface you
   * are looking INTO looks like.
   */
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = `rgba(2,4,10,${sealed ? 0.8 : 0.9})`;
  ctx.fillRect(P.x - P.rx, P.y - P.ry, P.rx * 2, P.ry * 2);
  ctx.save();
  ctx.translate(P.x, P.y);
  ctx.scale(P.rx, P.ry);
  const well = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  well.addColorStop(0, rgba(bright, 0.16 * live));
  well.addColorStop(0.18, rgba(mood.line, 0.03 * live));
  well.addColorStop(0.55, rgba(mood.line, 0.1 * live));
  well.addColorStop(0.86, rgba(accent, 0.34 * live));
  well.addColorStop(1, rgba(bright, 0.7 * live));
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (!sealed) {
    /* ---- the vortex -------------------------------------------------------
     * Three arms spiralling in, twice: a dim full-length pass and a bright
     * outer pass, so each arm reads as brightening toward the rim it is
     * feeding. Two dashed rings turn the other way inside them. Everything
     * here is keyed on `P.spin`, which is game time, so the assay's frozen
     * frames and a paused run both hold still.
     */
    const arms = 4;
    const pts = 28;
    const arm = (a, from, to, alpha, width) => {
      ctx.strokeStyle = rgba(accent, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const rho = from + (to - from) * (i / pts);
        const th = (a / arms) * TAU + P.spin * 0.7 + (1 - rho) * 4.6;
        const x = P.x + P.rx * rho * Math.cos(th);
        const y = P.y + P.ry * rho * Math.sin(th);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    for (let a = 0; a < arms; a++) {
      arm(a, 0.06, 0.98, 0.26, hl * 1.6);
      arm(a, 0.55, 0.98, 0.55, hl * 2.4);
    }
    /*
     * ...and the EYE: the throat at the centre the arms are feeding, the one
     * spot inside the surface that is lit rather than dark. It breathes with
     * the rim, so the two read as one thing inhaling.
     */
    const eye = 0.1 + 0.03 * breath;
    ctx.fillStyle = rgba(bright, 0.18 + 0.12 * breath);
    ctx.beginPath();
    ctx.ellipse(P.x, P.y, P.rx * eye * 2.4, P.ry * eye * 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.55 + 0.25 * breath);
    ctx.beginPath();
    ctx.ellipse(P.x, P.y, P.rx * eye, P.ry * eye, 0, 0, TAU);
    ctx.fill();
    ctx.setLineDash([9 * k, 13 * k]);
    for (const [rho, rate, alpha] of [[0.42, -46, 0.3], [0.68, 31, 0.24]]) {
      ctx.lineDashOffset = P.spin * rate;
      ctx.strokeStyle = rgba(mood.line, alpha);
      ctx.lineWidth = hl * 1.2;
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, P.rx * rho, P.ry * rho, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  ctx.restore();

  /* ---- what is coming: the ghost pass ------------------------------------ */
  if (bodies.length && drawBody) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU);
    ctx.clip();
    const was = ctx.globalAlpha;
    for (const e of bodies) {
      const depth = clamp((e.y - P.top) / (2 * P.ry), 0, 1);
      ctx.globalAlpha = was * 0.5 * depth;
      drawBody(e);
    }
    ctx.globalAlpha = was;
    ctx.restore();

    /* ---- what has come through: the emerged pass ------------------------
     * Only a body whose leading edge is past the rim under it: nothing of
     * one still wholly inside is on our side of the surface, and its glow
     * sprite -- 3.4 radii wide -- would otherwise leak out under the rim
     * before the body did.
     */
    ctx.save();
    ctx.beginPath();
    ctx.rect(-W, P.y, W * 3, H * 3);
    ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU);
    ctx.clip('evenodd');
    for (const e of bodies) if (e.y + e.r > rimAt(P, e.x)) drawBody(e);
    ctx.restore();
  }

  /* ---- the rim ------------------------------------------------------------
   * Three rings: a wide soft one, the rim itself, and a thin inner echo. The
   * rim is the one thing here drawn toward white -- it is the edge of the
   * surface, and the flare of a birth lands on it.
   */
  const rimA = (0.82 + 0.18 * breath) * live;
  ctx.strokeStyle = rgba(accent, 0.2 * live + P.flare * 0.2);
  ctx.lineWidth = hl * 11;
  ctx.beginPath();
  ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(bright, rimA);
  ctx.lineWidth = hl * (2.6 + P.flare * 1.4);
  ctx.beginPath();
  ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(accent, 0.35 * live);
  ctx.lineWidth = hl;
  ctx.beginPath();
  ctx.ellipse(P.x, P.y, P.rx * 0.93, P.ry * 0.9, 0, 0, TAU);
  ctx.stroke();

  if (!sealed) {
    /* ---- the surface stretching where a body is pushing through ---------
     * A short bright arc on the rim under each crossing body, at its widest
     * and brightest when the body is half way out. This is the moment the
     * whole drawing is for.
     */
    for (const e of bodies) {
      const yr = rimAt(P, e.x);
      const d = clamp((e.y + e.r - yr) / (2 * e.r), 0, 1);
      if (d <= 0 || d >= 1) continue;
      const bump = Math.sin(d * Math.PI);
      const phi = Math.acos(clamp((e.x - P.x) / P.rx, -1, 1));
      const half = Math.min(1.2, (e.r * 1.4) / P.rx);
      ctx.strokeStyle = rgba(bright, 0.45 + 0.55 * bump);
      ctx.lineWidth = hl * (2 + 6 * bump);
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, phi - half, phi + half);
      ctx.stroke();
    }

    /* ---- the births: a ring off the rim, gone in under a second --------- */
    for (const b of P.births) {
      const u = b.t / b.life;
      const yr = rimAt(P, b.x);
      const rr = b.r * (0.7 + 2.2 * u);
      ctx.strokeStyle = rgba(bright, (1 - u) * 0.75);
      ctx.lineWidth = hl * (1 + 3 * (1 - u));
      ctx.beginPath();
      ctx.ellipse(b.x, yr, rr, rr * 0.55, 0, 0, TAU);
      ctx.stroke();
      const phi = Math.acos(clamp((b.x - P.x) / P.rx, -1, 1));
      const half = Math.min(1.2, (b.r * 2) / P.rx) * (1 + u);
      ctx.strokeStyle = rgba('#ffffff', (1 - u) * 0.8);
      ctx.lineWidth = hl * 3 * (1 - u);
      ctx.beginPath();
      ctx.ellipse(P.x, P.y, P.rx, P.ry, 0, phi - half, phi + half);
      ctx.stroke();
    }

    /* ---- the motes on the rim -------------------------------------------
     * Fourteen small lights riding the rim at their own rates, as the thing
     * that says "this is turning" when nothing is being born.
     */
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + P.spin * (0.5 + 0.25 * (i % 3)) * (i % 2 ? 1 : -1);
      const rho = 1.02 + 0.06 * Math.sin(P.spin * 1.9 + i * 1.7);
      const x = P.x + P.rx * rho * Math.cos(a);
      const y = P.y + P.ry * rho * Math.sin(a);
      const r = (1.4 + 0.5 * (i % 3)) * k;
      ctx.fillStyle = rgba(accent, 0.22);
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(bright, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}
