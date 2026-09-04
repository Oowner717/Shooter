// The yard: the enemy's side of the era-2 field.
//
// It is NOT a body. It is one derived plain object at `world.yard`, and the
// whole of its immunity is that it lives in no list anything walks. Every one
// of the twenty-five damage sources in this game reaches health through
// `Enemy.applyDamage` or `Enemy.destroy`, and every path to those two iterates
// `world.enemies`, `world.drops`, `world.debris`, `world.effects` or the
// per-frame `bodies` array. A thing in none of them needs ZERO guard lines,
// against the nineteen a `penned` mark would have to keep agreeing with
// forever -- and this repo's own history is that a mark honoured by four paths
// out of five ships green and is found by a player. The practice dummy wore
// `harmless` for its side effect and silently lost five damage sources; the
// three sites that decide what may be shot have already drifted apart once.
//
// The same non-membership is why the yard survives `Game.setEra`, which empties
// all seven lists on its way in. A building in `world.enemies` would be deleted
// by the very switch that creates it.
//
// It imports config and util and NOTHING else -- in particular not enemies.js,
// which imports from here. `scripts/bundle.mjs` orders modules by an acyclic
// walk, and it shipped a dead page for fifty-three builds the last time the
// module graph was not what it thought.

import { CFG } from './config.js';
import { clamp, rgba, mixHex } from './util.js';

/**
 * Derive the yard, or clear it. The ONE writer, called from `Game.resize`.
 *
 * Nothing here is stored and nothing is saved: the yard is a function of the
 * era and the screen, so a rotation re-derives it and a reload cannot strand a
 * stale one. It mutates the existing object rather than replacing it, so a
 * rotation mid-wave does not throw away the wall's lighting.
 *
 * ---- the gate is `era === 2 && !sandbox`, and the second term is load-bearing
 *
 * `setZoom(era, sandbox)` pins the testbed to era 1's SCALE without touching
 * `world.era`, and both bench doors carry the era across by hand -- so
 * `era === 2 && sandbox === true` is a real, reachable state that the suite
 * already makes the round trip of. A gate on the era alone paints a building
 * and a wall across the practice range, at era 1's scale, in the one room
 * whose entire job is measuring damage against a clean field.
 */
export function syncYard(world, entryY) {
  if (world.era !== 2 || world.sandbox) { world.yard = null; return null; }
  const Y = CFG.yard;
  const a = world.yard || { lit: null, flare: 0, flareX: 0, consulted: false };
  /*
   * The mouth sits exactly ON the entry line, and that is the one placement
   * that costs nothing. `ENTRY_Y + CFG.entryDepth` is already three things: the
   * bottom of the interface (measured 402 world units at era 2, against a mouth
   * at 400), the line a body clears `staged` on, and the end of the fast march
   * `CFG.entrySpeed` exists for. Putting the door there makes "a body walks out"
   * and "a body becomes live" the same visible event for free -- no spawn y
   * moves, and `entrySpeed` keeps its only reader. A mouth anywhere BELOW the
   * line would quietly retire that constant at era 2, which is the shape of
   * `world.endless`: a value still threaded and no longer reachable.
   */
  a.mouthY = entryY + CFG.entryDepth;
  a.mouthX = world.width / 2;
  a.mouthHalf = Y.mouthHalf;
  a.faceHalf = Y.faceHalf;
  a.wallY = a.mouthY + Y.gap;
  // The top of the player's ground: the wall plus a body's worth of clearance,
  // so nothing is placed sitting ON the line it is not allowed past.
  a.hold = a.wallY + Y.clear;
  // The mass recedes off the top of the field. It is bigger than what fits,
  // deliberately: the enemy's side does not end where the screen does.
  a.top = entryY - 260;
  const teeth = Math.max(8, Math.round(world.width / Y.tooth));
  if (!a.lit || a.lit.length !== teeth) a.lit = new Float32Array(teeth);
  world.yard = a;
  return a;
}

/**
 * The top of the player's ground. Literally 0 -- which is `ENTRY_Y` -- at
 * era 1, so every caller is `Math.max(whatever it already was, 0)` there and
 * every existing value is provably at or below the entry line already.
 */
export function yardHold(world) {
  const a = world.yard;
  if (!a) return 0;
  a.consulted = true;
  return a.hold;
}

/**
 * Refuse a placement above the wall, and RECORD it at the x where it happened.
 * Identity at era 1.
 *
 * ---- why the wall is three clamps and not a collider
 *
 * The rule is ONE-WAY, so the enemy half needs no mechanism at all: nothing
 * stops a body, so nothing is written, and "enemy objects pass through" is true
 * by construction -- `drive`, `physicsStep` and the routes never consult it.
 * Only the friendly half is a rule, and it is a PLACEMENT rule because of a
 * measured fact: of every friendly summon in the game, exactly ONE is a physics
 * body, and it does not move. The DECOY is pushed into the broadphase with
 * `invMass: 0`; mines fly a parametric arc in `world.mines`, projectiles live
 * in `world.projectiles`, and Patch/Front/Ward/Well live in `world.effects` --
 * `physics.js` can see none of them. Its only collision test is `a.r + b.r`, so
 * a wall spanning the field would be twenty-odd circles, each a body, each a
 * slot of `CFG.maxEnemies`, to stop one stationary decoy.
 */
export function holdBelow(world, x, y, pad = 0) {
  const a = world.yard;
  if (!a) return y;
  a.consulted = true;
  const floor = a.hold + pad;
  if (y >= floor) return y;
  a.flare = 1;
  a.flareX = x;
  return floor;
}

/**
 * Map a field-wide x into the door. Identity at era 1.
 *
 * Load-bearing: it draws NO random on either branch, so era 1 keeps not merely
 * its values but its exact `Math.random` call ORDER -- which is what ORDINAL's
 * canonical hash mixes, and what a reordered roll would silently re-baseline.
 */
export function throughMouth(world, x, r) {
  const a = world.yard;
  if (!a) return x;
  const half = Math.max(8, a.mouthHalf - r - 4);
  const k = half / (world.width / 2);
  return clamp(a.mouthX + (x - world.width / 2) * k, a.mouthX - half, a.mouthX + half);
}

/**
 * Where a formation's bodies stand so the WHOLE of it comes out of the door:
 * rows across the mouth, stacked upward, centred on it. Absolute x, relative y.
 * Null at era 1, where `formationOffset`'s six shapes keep the sky they were
 * authored for.
 *
 * Rows rather than the authored shapes, and that is arithmetic rather than
 * taste. At the population ceiling the widest authored job is BLOOM x12, whose
 * `line` spans 995 world units against a 968-wide field -- no door can pass
 * that with its spacing intact. Clamping the offsets stacks bodies on the two
 * door edges and the pair solver blows them apart on the next frame; scaling
 * them crushes `gap`, which is the thing that exists to stop overlap, to a
 * seventh of what the body needs. `pitch` is `2r + 8`, so overlap is
 * impossible by construction.
 *
 * It also SHORTENS the worst spawn column rather than lengthening it: three
 * rows of BULWARK reach 331 units above the door where the authored `column`
 * of eight reaches 903.
 */
export function mouthSlots(world, r, gap, count) {
  const a = world.yard;
  if (!a) return null;
  const half = Math.max(8, a.mouthHalf - r - 4);
  const pitch = r * 2 + 8;
  const per = Math.max(1, Math.floor((half * 2) / pitch));
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / per);
    const n = Math.min(per, count - row * per);
    out.push([a.mouthX + ((i % per) - (n - 1) / 2) * pitch, -row * gap]);
  }
  return out;
}

/**
 * The wall lights where something crosses it, for the whole run -- so the rule
 * is restated by every arrival rather than by one caption at the start.
 *
 * Returns on its first line at era 1, which is what makes this free there.
 */
export function updateYard(world, dt) {
  const a = world.yard;
  if (!a) return;
  if (a.flare > 0) a.flare = Math.max(0, a.flare - dt * 0.9);
  const lit = a.lit;
  const band = 26 * CFG.scale;
  const w = world.width || 1;
  for (let i = 0; i < lit.length; i++) if (lit[i] > 0) lit[i] = Math.max(0, lit[i] - dt * 1.5);
  for (const e of world.enemies) {
    if (e.dead || Math.abs(e.y - a.wallY) > band + e.r) continue;
    const lo = clamp(Math.floor(((e.x - e.r) / w) * lit.length), 0, lit.length - 1);
    const hi = clamp(Math.floor(((e.x + e.r) / w) * lit.length), 0, lit.length - 1);
    for (let i = lo; i <= hi; i++) lit[i] = 1;
  }
}

/**
 * Draw it. One call, from `Game.draw`, immediately after the substrate and
 * before the ground effects -- so it is behind every body, every drop and
 * every piece of wreckage, which is what "scenery" has to mean on this canvas.
 *
 * Told apart from the thirty-seven bodies by REGISTER and not by hue, because
 * every saturated tone in this game is already spoken for: it is LARGE, it is
 * STATIC (nothing else on the field is), it is STRAIGHT AND RIBBED (no body in
 * the table is architectural), and it is UNLIT -- no glow sprite, no hit flash,
 * no wobble, no outline ladder. A colourblind player receives all four.
 */
export function drawYard(ctx, world, mood) {
  const a = world.yard;
  if (!a) return;
  const hl = CFG.hairline;
  const k = CFG.scale;
  const L = a.mouthX - a.faceHalf;
  const R = a.mouthX + a.faceHalf;
  const dl = a.mouthX - a.mouthHalf;
  const dr = a.mouthX + a.mouthHalf;

  ctx.save();

  /* ---- the doorway's spill, first, so the structure is drawn over it ------
   * The one lit thing up there, and the only reason the yard band reads as a
   * place rather than as empty sky. It is drawn as a widening wedge rather
   * than a disc because a disc says "a lamp" and a wedge says "a way out".
   */
  const spill = ctx.createLinearGradient(0, a.mouthY, 0, a.wallY + 40 * k);
  spill.addColorStop(0, rgba(mood.accent, 0.22));
  spill.addColorStop(0.55, rgba(mood.accent, 0.07));
  spill.addColorStop(1, rgba(mood.accent, 0));
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(dl, a.mouthY);
  ctx.lineTo(dr, a.mouthY);
  ctx.lineTo(dr + 46 * k, a.wallY + 40 * k);
  ctx.lineTo(dl - 46 * k, a.wallY + 40 * k);
  ctx.closePath();
  ctx.fill();

  /* ---- the mass -----------------------------------------------------------
   * A SILHOUETTE, not a slab. The first version filled it with the sky mixed
   * a fifth of the way toward the lattice colour, which on measurement is
   * within a few units of the sky itself -- the building was drawn, correctly
   * placed, and invisible, with only the doorway carrying it. A structure this
   * size against a dark sky reads as a hole punched in the sky with lit detail
   * on it, which is also what it is: something standing between you and the
   * substrate every ray in this game converges on.
   *
   * It fades in downward rather than starting on an edge, because an edge at
   * the top of the screen reads as the drawing running out, and this thing is
   * meant to be bigger than the frame.
   */
  const face = ctx.createLinearGradient(0, a.top, 0, a.mouthY);
  face.addColorStop(0, rgba('#000000', 0));
  face.addColorStop(0.45, rgba('#000000', 0.62));
  face.addColorStop(1, rgba('#000000', 0.78));
  ctx.fillStyle = face;
  ctx.fillRect(L, a.top, R - L, a.mouthY - a.top);

  // Ribs, spaced by the same tooth the wall is, so the two read as one build.
  const rib = CFG.yard.tooth * k;
  const lit0 = mixHex(mood.low, mood.line, 0.55);
  ctx.strokeStyle = rgba(lit0, 0.3);
  ctx.lineWidth = hl;
  ctx.beginPath();
  for (let y = a.mouthY - rib; y > a.top + rib; y -= rib) {
    const t = clamp((y - a.top) / (a.mouthY - a.top), 0, 1);
    const inset = (1 - t) * 30 * k;
    ctx.moveTo(L + inset, y);
    ctx.lineTo(R - inset, y);
  }
  ctx.stroke();

  // Two columns the whole height of the face, on the door's own edges, so the
  // opening reads as a shaft up through the building rather than a notch in
  // the bottom of it.
  ctx.strokeStyle = rgba(lit0, 0.5);
  ctx.lineWidth = hl * 1.6;
  ctx.beginPath();
  ctx.moveTo(dl, a.mouthY); ctx.lineTo(dl, a.top + (a.mouthY - a.top) * 0.2);
  ctx.moveTo(dr, a.mouthY); ctx.lineTo(dr, a.top + (a.mouthY - a.top) * 0.2);
  ctx.stroke();

  // The throat behind the door, darker than the face it is cut into.
  ctx.fillStyle = rgba('#000000', 0.72);
  ctx.fillRect(dl, a.mouthY - 96 * k, dr - dl, 96 * k);

  // The underside of the building, either side of the door: this is the edge
  // that says how far the mass reaches, and without it the face has no bottom.
  ctx.strokeStyle = rgba(lit0, 0.62);
  ctx.lineWidth = hl * 2;
  ctx.beginPath();
  ctx.moveTo(L, a.mouthY); ctx.lineTo(dl, a.mouthY);
  ctx.moveTo(dr, a.mouthY); ctx.lineTo(R, a.mouthY);
  ctx.stroke();

  // The sill: the one bright line in the yard, across the door only.
  ctx.strokeStyle = rgba(mood.accent, 0.62);
  ctx.lineWidth = hl * 2.6;
  ctx.beginPath();
  ctx.moveTo(dl, a.mouthY);
  ctx.lineTo(dr, a.mouthY);
  ctx.stroke();

  /* ---- the wall -----------------------------------------------------------
   * A quiet baseline the whole width of the field, carrying short DOWNWARD
   * ticks on its underside. The rule it states is one-way, so the thing that
   * has to be legible is a DIRECTION -- and a direction drawn as a shape
   * survives colourblindness by construction, where a direction drawn as a
   * colour does not. It lights where a body crosses it, so the rule is
   * restated by every arrival rather than explained once and forgotten.
   */
  const lit = a.lit;
  const seg = world.width / lit.length;
  ctx.lineWidth = hl * 2;
  ctx.strokeStyle = rgba(mood.line, 0.62);
  ctx.beginPath();
  ctx.moveTo(0, a.wallY);
  ctx.lineTo(world.width, a.wallY);
  ctx.stroke();
  const tick = 11 * k;
  for (let i = 0; i < lit.length; i++) {
    const x = (i + 0.5) * seg;
    const g = lit[i];
    ctx.strokeStyle = rgba(g > 0 ? mood.accent : mood.line, 0.4 + g * 0.55);
    ctx.lineWidth = hl * (1.5 + g * 1.8);
    ctx.beginPath();
    ctx.moveTo(x - tick * 0.7, a.wallY);
    ctx.lineTo(x, a.wallY + tick);
    ctx.lineTo(x + tick * 0.7, a.wallY);
    ctx.stroke();
  }

  /*
   * ...and a refusal, drawn where it happened. A rule the player is told about
   * once is a rule they forget; a rule that answers at the point of the press
   * is one they learn. The tick points INWARD -- back toward their own ground
   * -- against the wall's own outward chevrons, so the two read as opposites.
   */
  if (a.flare > 0) {
    const f = a.flare;
    ctx.strokeStyle = rgba(mood.accent, 0.35 + f * 0.6);
    ctx.lineWidth = hl * (2 + f * 2.6);
    const wide = (26 + (1 - f) * 40) * k;
    ctx.beginPath();
    ctx.moveTo(a.flareX - wide, a.wallY);
    ctx.lineTo(a.flareX + wide, a.wallY);
    ctx.moveTo(a.flareX - tick * 0.7, a.wallY + tick);
    ctx.lineTo(a.flareX, a.wallY);
    ctx.lineTo(a.flareX + tick * 0.7, a.wallY + tick);
    ctx.stroke();
  }

  ctx.restore();
}
