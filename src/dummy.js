/**
 * The practice dummy: the one thing on the field that exists to be shot.
 *
 * ---- what it is for ----
 *
 * A rate is only readable off something that does not die, does not move and
 * does not fight back, so the dummy is all three. But a target that only sat
 * there was a blue disc that absorbed everything in silence: you could read
 * the counter or you could watch the field, and nothing on the field told you
 * which of your rounds was the heavy one. So the dummy is also the readout --
 * it reacts to every hit in proportion to that hit, and it reacts to the
 * SUSTAINED rate in a way that is different in kind at each band, so a glance
 * at it says roughly what the number says.
 *
 * ---- two channels, and they must not drown each other ----
 *
 *   PER HIT     a ring, a spark fan and a number at the impact point, all
 *               sized by that hit's damage. This is the one that would be
 *               lost at high rates, so it is drawn ON TOP of everything else
 *               and its floor rises with the band rather than falling: at
 *               2,000 a second there are dozens a second and each one still
 *               has to be a distinct event.
 *   SUSTAINED   `heat`, 0 to 1, eased from the 3-second rate. It drives the
 *               core, the ring's spin, the halo, the arcs and the ground
 *               bloom -- five things that come in at five different points,
 *               so the band is legible without reading the digits.
 *
 * ---- the radius ----
 *
 * 68, against a BULWARK's 45. It cannot go past 72: `CFG.GRID_CELL` is twice
 * the largest body in the game and `check-build.mjs` asserts the broadphase
 * cell covers it, so a body wider than that would be one the grid can miss an
 * overlap on. The dummy is `fixed` and barely collides, but the ceiling is
 * real and this sits under it deliberately.
 */

import { CFG } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow } from './util.js';
import { spark, ripple } from './fx.js';
import { ledger } from './ledger.js';

export const DUMMY = {
  r: 68,
  /*
   * Where it stands. 420 units up-field against the 300 the first one used --
   * far enough that the whole rig and its halo are clear of the turret's own
   * furniture (the barrel, the lever arc and the intake ring all live inside
   * about 150), and close enough that a SCATTER cone still lands on it and
   * PULSE, at 575 fully bought, still reaches.
   */
  up: 420,
  tone: '#8fb8d8',
  hot: '#ffcf6b',
  peak: '#ff5d6b',
};

/**
 * The bands, in damage a second, and what each one turns on.
 *
 * Chosen against what the game can actually produce rather than round numbers:
 * a stock BOLT settles near 40, a bought one near 420, SCATTER sustains over
 * 1,200 and a PRISM press spikes past 2,000. So every band is reachable and
 * the top one takes a deliberate build, which is what makes it worth having.
 *
 * `heat` is the eased position across the whole ladder, 0 at nothing and 1 at
 * the top of the last band, so the drawing has one continuous number and the
 * bands are only where new ELEMENTS arrive.
 */
export const BANDS = [0, 120, 400, 900, 1800];

export function bandOf(dps) {
  let n = 0;
  for (let i = 0; i < BANDS.length; i++) if (dps > BANDS[i]) n = i + 1;
  return n; // 0..5
}

/** 0..1 across the whole ladder, with the top band given room above it. */
function heatOf(dps) {
  const top = BANDS[BANDS.length - 1] * 1.6;
  // Square-rooted, so the first band is not a flat nothing: a stock turret at
  // 40 a second has to see the rig respond, or the low end reads as broken.
  return clamp(Math.sqrt(clamp(dps / top, 0, 1)), 0, 1);
}

/** A hit's weight, 0..1, against what one round of the heaviest kind does. */
function weightOf(dmg) {
  return clamp(Math.sqrt(clamp(dmg / 420, 0, 1)), 0.08, 1);
}

// --------------------------------------------------------------- the marks

/**
 * One hit, drawn where it landed.
 *
 * Its own effect rather than a call into `fx` for three reasons: it has to
 * outlive the frame it was made on, it has to be drawn AFTER the rig (so a
 * hit is never lost inside the glow at high rates), and it carries a number,
 * which nothing in `fx` does.
 */
class Mark {
  constructor(x, y, nx, ny, dmg, tone, band) {
    this.x = x;
    this.y = y;
    this.nx = nx;
    this.ny = ny;
    this.dmg = dmg;
    this.w = weightOf(dmg);
    this.tone = tone;
    this.band = band;
    this.t = 0;
    /*
     * A heavy hit is worth looking at for longer, and at the top band there
     * are dozens a second -- so the life SHORTENS as the band climbs, or the
     * screen fills with numbers nobody can read. The floor is what keeps a
     * single hit visible at 2,000 a second.
     */
    this.life = (0.42 + this.w * 0.5) * (band >= 4 ? 0.62 : 1);
    this.dead = false;
    this.rise = 34 + this.w * 46;
    this.text = dmg >= 1000 ? `${(dmg / 1000).toFixed(1)}k` : String(Math.round(dmg));
  }

  update(_world, dt) {
    this.t += dt;
    if (this.t >= this.life) this.dead = true;
  }

  draw(ctx) {
    const k = clamp(this.t / this.life, 0, 1);
    const a = 1 - k * k;
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // The impact ring: opens fast to a radius set by the hit, then goes.
    const e = 1 - (1 - Math.min(1, k * 3)) ** 3;
    const rr = (7 + this.w * 46) * e;
    ctx.strokeStyle = rgba(this.tone, 0.85 * a);
    ctx.lineWidth = CFG.hairline * (1.4 + this.w * 3.4) * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(this.x, this.y, rr, 0, TAU);
    ctx.stroke();

    // ...and a bright core on the frame it landed, so a hit has a moment.
    if (k < 0.34) {
      const f = 1 - k / 0.34;
      drawGlow(ctx, '#ffffff', this.x, this.y, (5 + this.w * 20) * f, 0.5 * f);
    }

    /*
     * The number. Plated rather than merely bright: the rig behind it is a
     * lit object with a halo over it, and thin glyphs over a busy ground
     * vanish exactly when the number matters -- the same rule the corruption
     * readout is held to.
     */
    ctx.globalCompositeOperation = 'source-over';
    const size = 9 + this.w * 15;
    const ty = this.y - this.rise * k;
    ctx.font = `600 ${size.toFixed(1)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w2 = ctx.measureText(this.text).width;
    ctx.fillStyle = `rgba(4,8,14,${0.5 * a})`;
    ctx.beginPath();
    const pad = size * 0.34;
    const h = size * 1.16;
    const x0 = this.x - w2 / 2 - pad;
    const y0 = ty - h / 2;
    const rr2 = h * 0.34;
    ctx.moveTo(x0 + rr2, y0);
    ctx.arcTo(x0 + w2 + pad * 2, y0, x0 + w2 + pad * 2, y0 + h, rr2);
    ctx.arcTo(x0 + w2 + pad * 2, y0 + h, x0, y0 + h, rr2);
    ctx.arcTo(x0, y0 + h, x0, y0, rr2);
    ctx.arcTo(x0, y0, x0 + w2 + pad * 2, y0, rr2);
    ctx.fill();
    ctx.fillStyle = rgba(this.w > 0.55 ? '#ffffff' : this.tone, a);
    ctx.fillText(this.text, this.x, ty);
    ctx.restore();
  }
}

/**
 * A hit landed. Called from `Enemy.applyDamage`, with the delivered number --
 * so what the dummy shows is what the body lost, and not what the caller
 * asked for. Same rule the ledger is held to, and for the same reason.
 */
export function dummyHit(world, e, dmg, nx, ny) {
  if (!(dmg > 0)) return;
  const band = e.dummyBand || 0;
  const w = weightOf(dmg);
  // The contact face. `nx, ny` is the round's travel for a projectile and the
  // blast's outward direction for an area hit, and both put the face at
  // `centre - n * r`; a hit with no direction at all lands on the rim
  // somewhere, which is honest for a patch or a wire.
  let ax = nx;
  let ay = ny;
  if (!(ax || ay)) { const a = rand(0, TAU); ax = Math.cos(a); ay = Math.sin(a); }
  const d = Math.hypot(ax, ay) || 1;
  ax /= d; ay /= d;
  const px = e.x - ax * e.r * 0.92;
  const py = e.y - ay * e.r * 0.92;

  e.dummyFlash = Math.min(1.6, (e.dummyFlash || 0) + 0.35 + w * 0.9);
  e.dummyHits = (e.dummyHits || 0) + 1;
  // Where it was struck, for the dent on the rim. Kept as a short list so a
  // burst reads as several impacts rather than as one brighter one.
  e.dummyDents = e.dummyDents || [];
  e.dummyDents.push({ a: Math.atan2(py - e.y, px - e.x), t: 0, w });
  if (e.dummyDents.length > 14) e.dummyDents.shift();

  const tone = band >= 4 ? DUMMY.peak : band >= 2 ? DUMMY.hot : DUMMY.tone;
  world.effects.push(new Mark(px, py, ax, ay, dmg, tone, band));

  /*
   * Sparks off the face, along the reflected direction. The COUNT is capped
   * by the band rather than by the damage alone: at the top band a fully
   * bought SCATTER lands thirty hits a second and an uncapped fan would be a
   * thousand particles that read as fog rather than as impacts.
   */
  const n = Math.max(2, Math.round((2 + w * 9) * (band >= 4 ? 0.5 : 1)));
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(-ay, -ax) + spread(0.9);
    const sp = rand(120, 200 + w * 520);
    spark(px, py, Math.cos(a) * sp, Math.sin(a) * sp, tone, rand(0.14, 0.3 + w * 0.3), 1.6 + w * 2);
  }
  // A heavy hit moves the ground as well, which is the difference a SLUG or a
  // KNELL toll should read as against a bolt.
  if (w > 0.42) ripple(px, py, 0.5 + w, 90 + w * 260);
}

// --------------------------------------------------------------- the model

/** Per-frame bookkeeping: heat, spin and the dents fading off the rim. */
export function updateDummy(e, dt) {
  const dps = ledger.on ? ledger.live() : 0;
  const want = heatOf(dps);
  // Up fast, down slow: the rig should answer the trigger immediately and
  // then cool visibly, which is what makes a burst weapon look like one.
  const k = want > (e.dummyHeat || 0) ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 1.1);
  e.dummyHeat = (e.dummyHeat || 0) + (want - (e.dummyHeat || 0)) * k;
  e.dummyBand = bandOf(dps);
  e.dummySpin = (e.dummySpin || 0) + dt * (0.28 + e.dummyHeat * 3.2);
  e.dummyT = (e.dummyT || 0) + dt;
  e.dummyFlash = Math.max(0, (e.dummyFlash || 0) - dt * 3.6);
  const dents = e.dummyDents;
  if (dents) {
    for (let i = dents.length - 1; i >= 0; i--) {
      dents[i].t += dt;
      if (dents[i].t > 0.55) dents.splice(i, 1);
    }
  }
}

/**
 * The colour of the rig, off the BAND rather than off the eased heat.
 *
 * Heat lags -- it is deliberately slow to fall so a burst weapon reads as one
 * -- and the structural elements arrive on the band. Taking the colour off
 * heat meant the two could disagree: the brackets could be out while the rig
 * was still the colour of the band below, which reads as a frame dropped
 * rather than as a state. One source for both.
 *
 * Band 0 is a DEAD slate and not a dim blue, because "nothing is happening"
 * has to be a different colour and not a lower brightness of the same one.
 */
function toneFor(band) {
  if (band <= 0) return '#4a6379';
  if (band <= 2) return DUMMY.tone;
  if (band === 3) return DUMMY.hot;
  return DUMMY.peak;
}

/**
 * The rig.
 *
 * Drawn instead of `Enemy.draw`, not on top of it: a dummy is not one of the
 * roster's shapes wearing a hat, and the body it is built out of is an
 * implementation detail of getting physics and damage for free.
 */
export function drawDummy(ctx, e) {
  const R = e.r;
  const h = clamp(e.dummyHeat || 0, 0, 1);
  const band = e.dummyBand || 0;
  const t = e.dummyT || 0;
  const flash = clamp(e.dummyFlash || 0, 0, 1.6);
  const tone = toneFor(band);

  ctx.save();
  ctx.translate(e.x, e.y);

  // ---- band 5: the ground under it ------------------------------------
  if (band >= 5) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, DUMMY.peak, 0, 0, R * 4.2, 0.1 + h * 0.16);
  }

  // ---- the halo, which every band has and which grows with the heat ----
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, tone, 0, 0, R * (1.7 + h * 1.5),
    (band === 0 ? 0.05 : 0.1 + h * 0.4) + flash * 0.18);
  ctx.globalCompositeOperation = 'source-over';

  // ---- the plate -------------------------------------------------------
  ctx.fillStyle = `rgba(7,13,21,${0.86 - h * 0.18})`;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();

  // ---- the outer ring, and its ticks ----------------------------------
  ctx.save();
  ctx.rotate(e.dummySpin || 0);
  ctx.strokeStyle = rgba(tone, 0.5 + h * 0.45);
  ctx.lineWidth = CFG.hairline * 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.96, 0, TAU);
  ctx.stroke();
  /*
   * Twenty-four ticks and the lit fraction IS the heat -- a rev counter, so
   * the band can be COUNTED and not only felt. This is the element that keeps
   * the low bands legible: at heat 0.1 two ticks are lit against twenty-two
   * dark, which is unmistakable on a still screen where a faint glow is not.
   */
  const ticks = 24;
  const lit = Math.round(h * ticks);
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU;
    const on = i < lit;
    const r0 = R * (on ? 0.78 : 0.86);
    const r1 = R * 0.94;
    ctx.strokeStyle = on ? rgba(tone, 0.95) : rgba('#4a6379', 0.5);
    ctx.lineWidth = CFG.hairline * (on ? 2.6 : 1.2);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // ---- the bullseye ----------------------------------------------------
  for (const [f, w] of [[0.72, 1.6], [0.5, 1.3], [0.3, 1.1]]) {
    ctx.strokeStyle = rgba(tone, 0.34 + h * 0.4);
    ctx.lineWidth = CFG.hairline * w;
    ctx.beginPath();
    ctx.arc(0, 0, R * f, 0, TAU);
    ctx.stroke();
  }
  // The cross, which is what makes it read as a TARGET and not as a dial.
  ctx.strokeStyle = rgba(tone, 0.3 + h * 0.3);
  ctx.lineWidth = CFG.hairline * 1.2;
  ctx.beginPath();
  ctx.moveTo(-R * 0.86, 0); ctx.lineTo(-R * 0.2, 0);
  ctx.moveTo(R * 0.2, 0); ctx.lineTo(R * 0.86, 0);
  ctx.moveTo(0, -R * 0.86); ctx.lineTo(0, -R * 0.2);
  ctx.moveTo(0, R * 0.2); ctx.lineTo(0, R * 0.86);
  ctx.stroke();

  // ---- the core --------------------------------------------------------
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.5 + 0.5 * Math.sin(t * (2 + h * 9));
  const cr = R * (0.16 + h * 0.12) * (1 + flash * 0.24);
  drawGlow(ctx, tone, 0, 0, cr * 3.4, 0.24 + h * 0.5 + flash * 0.3);
  ctx.fillStyle = rgba(band >= 4 ? '#ffffff' : tone,
    (band === 0 ? 0.22 : 0.55 + h * 0.4) + pulse * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, cr, 0, TAU);
  ctx.fill();
  // ...and at the top the core is white-hot and ringed, which is the one
  // thing band 5 has that band 4 does not other than the ground under it.
  if (band >= 5) {
    ctx.strokeStyle = rgba('#ffffff', 0.55 + pulse * 0.35);
    ctx.lineWidth = CFG.hairline * 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, cr * (1.9 + pulse * 0.3), 0, TAU);
    ctx.stroke();
  }

  // ---- band 3: a broken ring, turning the other way -------------------
  /*
   * Band 3's own element, and it exists because band 3 had none: it arrived
   * as a colour change and nothing else, and a state that lives only in a hue
   * is a state a colourblind player never receives -- a rule this project
   * already keeps a note about. Counter-rotating, so it cannot be mistaken
   * for the tick ring however fast that is spinning.
   */
  if (band >= 3) {
    ctx.strokeStyle = rgba(tone, 0.42 + h * 0.45);
    ctx.lineWidth = CFG.hairline * 2.6;
    const rr = R * (1.24 + h * 0.12);
    for (let i = 0; i < 3; i++) {
      const a0 = -(e.dummySpin || 0) * 0.6 + (i / 3) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + 1.5);
      ctx.stroke();
    }
  }

  // ---- band 2: the brackets flex outward ------------------------------
  if (band >= 2) {
    const out = R * (1.06 + h * 0.22);
    ctx.strokeStyle = rgba(tone, 0.4 + h * 0.5);
    ctx.lineWidth = CFG.hairline * 2.2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(out, -R * 0.2);
      ctx.lineTo(out + R * 0.14, -R * 0.2);
      ctx.lineTo(out + R * 0.14, R * 0.2);
      ctx.lineTo(out, R * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- band 4: arcs crawling over the face ----------------------------
  if (band >= 4) {
    ctx.strokeStyle = rgba('#ffffff', 0.3 + h * 0.45);
    ctx.lineWidth = CFG.hairline * 1.6;
    for (let i = 0; i < 3; i++) {
      const a0 = t * (2.2 + i) + (i / 3) * TAU;
      ctx.beginPath();
      let px = Math.cos(a0) * R * 0.9;
      let py = Math.sin(a0) * R * 0.9;
      ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        const a = a0 + Math.PI * (0.4 + k * 0.22) + Math.sin(t * 9 + k + i) * 0.5;
        // Kept OUT of the middle: an arc that crosses the core reads as
        // scribble over the target rather than as something running round it.
        const rr = R * (0.56 + ((k * 7 + i * 3) % 5) / 14);
        px = Math.cos(a) * rr;
        py = Math.sin(a) * rr;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // ---- the dents, where it has just been struck -----------------------
  if (e.dummyDents) {
    for (const d of e.dummyDents) {
      const k = clamp(d.t / 0.55, 0, 1);
      const a = 1 - k;
      ctx.strokeStyle = rgba('#ffffff', 0.7 * a * (0.3 + d.w));
      ctx.lineWidth = CFG.hairline * (1.4 + d.w * 3);
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.96 + k * 0.1), d.a - 0.2 - d.w * 0.28, d.a + 0.2 + d.w * 0.28);
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/**
 * Put one down. Built out of the roster's heaviest body and then unmade:
 * `fixed` is what the boss frames use to say the physics does not move this,
 * `harmless` keeps it off the corruption path, and `dummy` is what every
 * other rule in the game tests -- the draw, the damage marks, the healing in
 * `Game.update` and VOID's refusal to delete it.
 */
export function placeDummy(game) {
  const w = game.world;
  const e = game.debugSpawn('bulwark', w.width / 2, w.shooter.y - DUMMY.up);
  if (!e) return null;
  e.staged = false;
  e.spawnIn = 0;
  e.dummy = true;
  e.harmless = true;
  e.counts = false;
  e.invMass = 0;
  e.vx = 0;
  e.vy = 0;
  e.r = DUMMY.r;
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.armor = 0;
  e.ward = 0;
  e.traits = [];
  e.dummyHeat = 0;
  e.dummyBand = 0;
  e.dummySpin = 0;
  e.dummyT = 0;
  e.dummyFlash = 0;
  e.dummyHits = 0;
  e.dummyDents = [];
  return e;
}
