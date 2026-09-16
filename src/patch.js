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
    // ...and the same answer for the ledger, which wants the name a player
    // knows rather than the flag the cap reads.
    this.src = opts.src || (this.spore ? 'spore' : 'thorn');
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
    /*
     * `= this.life`, not `Math.max(this.max, this.life)`.
     *
     * `life` has just been clamped DOWN to `RETIRE`, and `max` is the full
     * authored life, so the max could never select its second argument -- it
     * was a no-op that read as a guard. The consequence is in `draw`, where
     * `left = life / max` drives the extent: leaving `max` at 4.5 while
     * `life` drops to 0.35 makes `left` jump to 0.08 on the retire frame, and
     * `left` sets the haze's alpha -- so the ground dropped most of its
     * presence in one step, which is the visible pop the retirement fade
     * exists to prevent. With `max` set to the remaining life, `left` runs
     * 1 -> 0 smoothly across the fade. (It drove the drawn EXTENT too until
     * build 220 fixed that separately; see `draw`.)
     */
    this.max = this.life;
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
      /*
       * Harmless drift is not worth burning. `spent` is a boss's own frame
       * through its ending and nothing may burn that either -- this had it
       * exactly backwards, skipping `staged` (which a DAMAGE path must not:
       * config.js says in as many words that `staged` never gated projectile
       * collision, and most of a body's march in is on screen) and not
       * skipping `spent` (which it must). Both patches, SPORE's and THORN's,
       * come through here.
       */
      if (e.dead || e.spent || e.harmless) continue;
      const reach = rr + e.r;
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > reach * reach) continue;
      // A body the ground finishes died of spores, and its death says so.
      e.lastHit = 'pod';
      e.lastHitT = world.time;
      e.applyDamage(world, bite, 0, 0, 0, 0, 0, false, this.src);
      spark(e.x, e.y, spread(60), spread(60) - 30, this.tone, 0.3, 1.6);
    }
  }

  /*
   * `rim()` and the `edge` array it was the only reader of came out in build
   * 220. Its docstring said "shared by the fill and the edge", and build 214
   * replaced both of those layers when it made SPORE's ground read as spores
   * rather than as a solid disc -- so it had described two things that no
   * longer existed for six builds, and had no caller for the same six. The
   * `windAt`/`rateAt` shape CLAUDE.md records: nothing fails on a dead
   * private method and `bundle.mjs` will happily ship one.
   */

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
     * The grain, the edge and the timer, all in one layer.
     *
     * They used to die back from the rim inward as the patch burned down, so
     * "the area visibly closes rather than dimming in place". The trouble is
     * that the area does NOT close: `bite` tests `this.r` and nothing else,
     * for the whole life. Re-derived, `0.26 + left * 1.1` holds full extent
     * for the FIRST 33% of a patch's life -- the comment here said the last
     * third -- and drops the rim band entirely for the final 56%, by which
     * point the outermost grain sits at 58 units against a burn circle of 92.
     * A player reading the picture stands a body just outside the grain and
     * it burns anyway.
     *
     * So the extent is fixed and the ALPHA carries the ending, which `k`
     * already does: it fades over the last 0.8s of life, and over the 0.35s
     * of a retirement (see `retire`). The picture is the damage now, and the
     * ragged rim is drawn for as long as there is anything to be outside of.
     */
    const reach = 1.14;
    for (const sp of this.specks) {
      if (sp.d > reach) continue;
      // `reach` sits clear of 1, so the rim band -- the only thing marking
      // where the damage stops -- is drawn at its own alpha rather than at a
      // fraction of it.
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

/**
 * A STAIN: corrupted ground that takes the pay rather than the health.
 *
 * MIRE lays these behind it. It shares Patch's contract and almost nothing
 * else, which is why it is a second class here rather than an option on the
 * first. What it reuses is the CONTRACT -- `update(world, dt)`, a `dead` flag,
 * `draw(ctx, world)`, and `ground` so it paints under the bodies -- and the
 * module, because "ground that rides in world.effects" is one concept even
 * though the two are made of different things.
 *
 * Why not a Patch with `dps: 0`: that class's own `retire()` docstring records
 * the trap, and it is a real one. `applyDamage` floors a hit at
 * `Math.max(1, ...)`, so a patch on zero damage still takes a point off
 * everything standing in it four times a second -- stopping the damage needs
 * `next = Infinity`, at which point every one of Patch's damage fields is
 * inert. And its picture is a spore print: specks seeded by area, a rim band,
 * a rising mote cloud, two tints of one green. None of that is a stain. A
 * class whose every field is switched off is not the class you wanted.
 *
 * `theirs` is the other half, and it is load-bearing at era 2. `Game.draw`'s
 * ground pass runs inside `Game.ours`, which clips to below the yard wall --
 * correct for a SPORE patch, because our mines and rounds may not cross that
 * line. A stain is THEIRS: MIRE comes through the portal at the rim and the
 * wall is below it, so a stain laid on the way down would be clipped away for
 * the first part of every crossing. The flag splits that one pass in two and
 * adds no `clip` call, which is what build 263's count case asserts.
 */
export class Stain {
  /**
   * @param opts r, life, tone, eat (reach past `r` at which a drop is taken)
   *   and `tick` seconds between sweeps. Eating runs on a CLOCK, not on the
   *   frame: a per-frame walk of `world.drops` per stain is O(stains x drops)
   *   every frame, and this repo's own rule is that anything continuous runs
   *   on a clock.
   */
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.r = opts.r ?? 48;
    this.life = opts.life ?? 7;
    this.max = this.life;
    this.tone = opts.tone || '#bc1aa7';
    this.eat = opts.eat ?? 6;
    this.tick = opts.tick ?? 0.25;
    this.next = 0;
    this.t = 0;
    this.dead = false;
    this.ground = true; // under the bodies, like every other kind of ground
    this.theirs = true; // ...and NOT clipped to our side of the wall
    /*
     * What it has eaten, for the case and for the picture -- a stain that has
     * taken salvage sits a little brighter, so the thing the player is being
     * charged for is visible on the ground that charged them.
     */
    this.ate = 0;
    this.pale = mixHex(this.tone, '#ffffff', 0.4);
    this.dark = mixHex(this.tone, '#12040f', 0.5);
    /*
     * The grain. Seeded uniformly by AREA (sqrt of a uniform, or it crowds the
     * centre) -- Patch's lesson, and the only one of its drawing decisions
     * that transfers. No rim band: a stain has no boundary the player has to
     * find, because nothing standing in it is being hurt. What it needs to
     * read as is a spill, so the edge is deliberately soft.
     */
    const q = Math.max(0.45, fx.quality || 1);
    const n = Math.round(58 * q);
    this.grain = Array.from({ length: n }, () => {
      const a = rand(0, TAU);
      const d = Math.sqrt(rand(0, 1));
      return {
        dx: Math.cos(a) * d, dy: Math.sin(a) * d, d,
        r: rand(1.4, 4.2) * (1 - d * 0.4),
        a: rand(0.18, 0.46),
        pale: Math.random() < 0.3,
      };
    });
  }

  /**
   * One sweep of the drops.
   *
   * `dead` AND `dissolved`, which is `Enemy.feed`'s pair and not a choice:
   * `dead` takes it off the field and `dissolved` is the one flag `Game.sweep`
   * reads to tell being eaten from being destroyed. Without the second, a
   * stain would BOOK a kill and a codex entry for salvage it removed -- build
   * 322's LATCH fault, where a rider that ran out of clock was counted.
   */
  swallow(world) {
    const reach = this.r + this.eat;
    const rr = reach * reach;
    for (const d of world.drops) {
      if (d.dead) continue;
      const dx = d.x - this.x;
      const dy = d.y - this.y;
      if (dx * dx + dy * dy > rr) continue;
      d.dead = true;
      d.dissolved = true; // eaten, not destroyed: it must not score
      this.ate += 1;
      for (let i = 0; i < 3; i++) {
        spark(d.x, d.y, spread(26), spread(26) - 12, this.tone, 0.34, 2);
      }
    }
  }

  update(world, dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.next -= dt;
    if (this.next <= 0) {
      this.next = this.tick;
      this.swallow(world);
    }
  }

  draw(ctx, world) {
    const left = Math.max(0, this.life / this.max);
    // Eased so the stain holds most of its weight and then goes quickly,
    // rather than being faint for most of a seven-second life.
    const k = Math.min(1, left * 1.8);
    ctx.save();
    ctx.translate(this.x, this.y);
    /*
     * A low haze rather than a filled disc, for Patch's measured reason: a
     * filled disc of a saturated colour at this radius is a slab a third of
     * the screen across, and three of them read as spilled paint over the
     * field rather than as ground under it.
     */
    drawGlow(ctx, 0, 0, this.r * 1.15, this.dark, 0.3 * k);
    for (const g of this.grain) {
      ctx.beginPath();
      ctx.arc(g.dx * this.r, g.dy * this.r, g.r, 0, TAU);
      ctx.fillStyle = rgba(g.pale ? this.pale : this.tone, g.a * k);
      ctx.fill();
    }
    /*
     * ...and a stain that has taken something shows it. Additive, so several
     * overlapping stains ADD rather than scribble -- build 330's rule about
     * anything that fires in numbers.
     */
    if (this.ate > 0) {
      const lit = Math.min(1, this.ate / 6);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, this.r * 0.6, this.pale, 0.16 * lit * k);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}
