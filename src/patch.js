// A patch of ground that hurts what stands on it.
//
// Two things want this and neither should own it: SPORE leaves a small one
// where it lands, and a THORN mine is a large one that lasts. It rides in
// world.effects, which already has the update/draw/dead contract this needs.

import { TAU, rand, spread, rgba, mixHex, drawGlow } from './util.js';
import { fx, spark } from './fx.js';

/**
 * How long a retired patch is left on the screen to go out in. Long enough to
 * be seen going, short enough that the cap still reads as a cap.
 */
const RETIRE = 0.35;

export class Patch {
  /**
   * @param opts r, life, dps, tone, and `tick` seconds between damage ticks.
   *   Damage lands in ticks rather than per frame so a body crossing a corner
   *   of one takes a readable bite rather than a rounding error.
   */
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.r = opts.r ?? 90;
    this.life = opts.life ?? 4;
    this.max = this.life;
    this.dps = opts.dps ?? 40;
    this.tone = opts.tone || '#8eeb4b';
    this.tick = opts.tick ?? 0.25;
    this.t = 0;
    this.next = 0;
    this.dead = false;
    /*
     * Whose ground this is. SPORE's patches are capped and THORN's are not:
     * a THORN is already limited by the mine cap, and tagging only the round
     * keeps the two from being counted against each other. Read by the cap
     * in shooter.js and nowhere else.
     */
    this.spore = !!opts.spore;
    this.retired = false;
    /*
     * Drawn in the ground pass, under the bodies. Patches lived in
     * world.effects and effects draw AFTER enemies -- so burning ground was
     * painted over the things standing on it, washing every body on a patch
     * with the fill and reading as a slab laid on top of the field instead
     * of ground under it. The full-chaos review is what caught it: on a
     * crowded frame the two patches were the visually heaviest objects on
     * the screen, heavier than the boss.
     */
    this.ground = true;
    /*
     * ---- what the patch is made of ----
     *
     * Three layers, and none of them is a filled disc. It WAS a filled disc:
     * 30% of a bright green over the whole ragged rim, an additive pass on
     * top of that, a full-radius glow, and two hard polygon outlines -- which
     * on a 390px screen is a solid slab a third of the width across, reading
     * as spilled paint rather than as spores. Three of them (the cap) covered
     * most of the lower half of the field in flat colour.
     *
     * `specks` is what has settled: the grain, and the only thing that says
     * where the damage stops. Seeded uniformly by area, with a thin band at
     * the rim -- a spore print has an edge. They die back from the outside in
     * as the patch burns down, which is the timer the creeping inner ring
     * used to be, at the cost of a second hard outline.
     *
     * `motes` is the cloud coming off it -- the only additive layer, and the
     * one that has to carry "spores". Each rises, drifts, fades and is
     * reseeded on its own clock.
     */
    const q = Math.max(0.45, fx.quality || 1);
    /*
     * Two tints, so the grain is not one flat colour. The pale one is the
     * tone lifted most of the way to white and is what a spore catching the
     * light looks like; the dark one is the tone dropped toward the ground.
     * Cached per patch rather than per speck: mixHex parses.
     */
    this.pale = mixHex(this.tone, '#ffffff', 0.55);
    this.dark = mixHex(this.tone, '#0a1408', 0.42);
    /*
     * Settled spores. Seeded uniformly by AREA (sqrt of a uniform, or they
     * crowd the centre), plus a thin band right at the rim -- a spore print
     * has an edge, and it is the only thing telling the player where the
     * damage stops now that there is no outline.
     */
    /*
     * A third of them in the rim band, not a quarter. At 24% of 58 that was
     * fourteen specks around a whole circumference -- one every twenty-six
     * degrees, which is not a ring, and the boundary is the one thing about
     * this effect the player has to be able to find: everything standing
     * inside it is being hurt.
     */
    const n = Math.round(104 * q);
    const rimFrom = n - Math.round(n * 0.34);
    this.specks = Array.from({ length: n }, (_, i) => {
      const rim = i >= rimFrom;
      const a = rim
        // Spaced round the circle rather than dropped at random, or a
        // fourteen-sample ring leaves gaps a quarter of a turn wide.
        ? ((i - rimFrom) / (n - rimFrom)) * TAU + spread(0.16)
        : rand(0, TAU);
      const d = rim ? rand(0.88, 1) : Math.sqrt(rand(0, 1)) * 0.9;
      return {
        dx: Math.cos(a) * d, dy: Math.sin(a) * d, d,
        r: rim ? rand(0.8, 1.7) : rand(0.7, 2.4),
        a: rim ? rand(0.42, 0.8) : rand(0.3, 0.85),
        pale: Math.random() < 0.34,
      };
    });
    this.motes = Array.from({ length: Math.round(48 * q) }, () => this.seedMote(rand(0, 1)));
    // A ragged edge, fixed at birth: burning ground is not a circle. One
    // radius per spoke, reused every frame, so the outline holds still
    // instead of boiling.
    this.edge = Array.from({ length: 18 }, () => 0.82 + rand(0, 0.26));
  }

  /**
   * Put out early, because a newer patch took its place.
   *
   * `next = Infinity` rather than `dps = 0`: applyDamage floors a hit at
   * `Math.max(1, ...)`, so a patch on zero damage still takes a point off
   * everything standing in it four times a second. Stopping the clock is the
   * only way to stop the damage. The life is cut rather than zeroed so the
   * ground is seen going out -- a patch that vanished on the frame the fourth
   * one landed would read as a bug rather than as a limit.
   */
  retire() {
    if (this.retired) return;
    this.retired = true;
    this.next = Infinity;
    this.life = Math.min(this.life, RETIRE);
    this.max = Math.max(this.max, this.life);
  }

  /**
   * One spore: where it starts, how it drifts, how long it lasts.
   *
   * Seeded by area rather than by radius -- `rand(0.15, 0.98)` put as many
   * spores in the inner tenth of the disc as in the outer half, which is the
   * distribution of a dial and not of a cloud. Smaller and shorter-lived than
   * before, because there are twice as many of them now and the cloud is the
   * effect rather than a garnish on it.
   */
  seedMote(age = 0) {
    const life = rand(0.7, 1.7);
    return {
      a: rand(0, TAU),
      d: Math.sqrt(rand(0, 1)) * 0.96,
      rise: rand(11, 34),
      drift: spread(18),
      size: rand(1.4, 3.6),
      pale: Math.random() < 0.3,
      life,
      t: age * life,
    };
  }

  update(world, dt) {
    this.t += dt;
    this.life -= dt;
    // The spores run on their own clocks and are reseeded where they die, so
    // the patch keeps throwing them off for as long as it is burning.
    for (const m of this.motes) {
      m.t += dt;
      if (m.t >= m.life) Object.assign(m, this.seedMote(0));
    }
    if (this.life <= 0) { this.dead = true; return; }
    this.next -= dt;
    if (this.next > 0) return;
    this.next = this.tick;
    const bite = this.dps * this.tick;
    const rr = this.r;
    for (const e of world.enemies) {
      // Harmless drift is not worth burning, and staged rows are not here yet.
      if (e.dead || e.staged || e.harmless) continue;
      const reach = rr + e.r;
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > reach * reach) continue;
      // A body the ground finishes died of spores, and its death says so.
      e.lastHit = 'pod';
      e.lastHitT = world.time;
      e.applyDamage(world, bite, 0, 0, 0);
      spark(e.x, e.y, spread(60), spread(60) - 30, this.tone, 0.3, 1.6);
    }
  }

  /** The ragged outline, as a path. Shared by the fill and the edge. */
  rim(ctx, scale = 1) {
    const n = this.edge.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * TAU;
      const rr = this.r * this.edge[i % n] * scale;
      const x = this.x + Math.cos(a) * rr;
      const y = this.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  draw(ctx) {
    // Fades in fast and out slowly, so it never appears or vanishes on a frame.
    const k = Math.min(1, this.t / 0.25) * Math.min(1, this.life / 0.8);
    // What is left of it, so ground that is nearly spent looks nearly spent
    // rather than blinking out at full strength.
    const left = Math.max(0, this.life / this.max);
    const R = this.r;
    ctx.save();

    /*
     * ---- the ground, in source-over ----
     *
     * Burning ground is something the field is standing ON; drawn additively
     * like the rest of the effect it read as a light shining from above. One
     * soft, wide, very dim haze and nothing else -- it used to be 30% of a
     * bright green filled across the whole ragged rim, plus an additive pass,
     * plus a full-radius glow, plus two hard outlines, which over near-black
     * arrives as a flat olive slab a third of the screen wide. A first pass
     * at this replaced the fill with nine soft blobs and they read as
     * out-of-focus smudges: lumps are not more organic than a disc, they are
     * just lumpier. The haze is a whisper of presence and the grain does the
     * describing.
     */
    drawGlow(ctx, this.dark, this.x, this.y, R * 0.98, 0.44 * k * (0.4 + left * 0.6));

    /*
     * ---- what has settled ----
     *
     * The grain, the edge and the timer, all in one layer. They die back from
     * the rim inward as the patch burns down, so the area visibly closes
     * rather than dimming in place -- which is what the creeping inner ring
     * used to do, at the cost of a second hard outline. Full extent until the
     * last third: the first draft's `0.28 + left * 0.78` started biting
     * immediately and drew a one-second-old patch smaller than the circle it
     * was hurting things in.
     */
    const reach = Math.min(1.14, 0.26 + left * 1.1);
    for (const sp of this.specks) {
      if (sp.d > reach) continue;
      // Softened only as the patch closes. At full extent `reach` sits clear
      // of 1, so the rim band -- the only thing marking where the damage
      // stops -- is drawn at its own alpha rather than at a quarter of it.
      const edge = Math.min(1, (reach - sp.d) * 8);
      ctx.fillStyle = rgba(sp.pale ? this.pale : this.tone,
        Math.min(1, sp.a * k * edge));
      ctx.beginPath();
      ctx.arc(this.x + sp.dx * R, this.y + sp.dy * R, sp.r, 0, TAU);
      ctx.fill();
    }

    /*
     * ---- and the cloud coming off it ----
     *
     * The only additive layer, and the one carrying the whole idea. Forty-eight
     * of them against the old fourteen, each smaller, shorter-lived and seeded
     * by area rather than by radius. Up fast and out slow: a spore is
     * brightest as it leaves the ground.
     */
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const age = m.t / m.life;
      if (age >= 1) continue;
      const a = m.a + age * 0.5;
      const d = R * m.d;
      const x = this.x + Math.cos(a) * d + m.drift * age;
      const y = this.y + Math.sin(a) * d - m.rise * age;
      const fade = Math.min(1, age * 5) * (1 - age) ** 1.6;
      drawGlow(ctx, m.pale ? this.pale : this.tone, x, y,
        m.size * (0.8 + age * 1.4), 0.95 * fade * k);
    }

    ctx.restore();
  }
}
