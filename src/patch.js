// A patch of ground that hurts what stands on it.
//
// Two things want this and neither should own it: SPORE leaves a small one
// where it lands, and a THORN mine is a large one that lasts. It rides in
// world.effects, which already has the update/draw/dead contract this needs.

import { TAU, rand, spread, rgba, drawGlow } from './util.js';
import { spark } from './fx.js';

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
     * Spores, not orbiting dots.
     *
     * They used to be ten motes on fixed circular orbits, all the same size,
     * all going the same way -- which reads as a dial rather than as ground
     * that is burning. Each one now rises, drifts, fades and is reseeded, so
     * the patch has something coming off it the whole time it is alive.
     */
    this.motes = Array.from({ length: 14 }, () => this.seedMote(rand(0, 1)));
    // A ragged edge, fixed at birth: burning ground is not a circle. One
    // radius per spoke, reused every frame, so the outline holds still
    // instead of boiling.
    this.edge = Array.from({ length: 18 }, () => 0.82 + rand(0, 0.26));
  }

  /** One spore: where it starts, how it drifts, how long it lasts. */
  seedMote(age = 0) {
    return {
      a: rand(0, TAU),
      d: rand(0.15, 0.98),
      rise: rand(9, 26),
      drift: spread(14),
      size: rand(2.2, 5.4),
      life: rand(0.9, 2.1),
      t: age * rand(0.9, 2.1),
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
    ctx.save();

    /*
     * The ground first, under everything, in source-over: burning ground is
     * something the field is standing ON, and drawn additively like the rest
     * of the effect it read as a light shining from above instead.
     */
    ctx.globalAlpha = 0.3 * k;
    ctx.fillStyle = this.tone;
    this.rim(ctx, 0.97);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    /*
     * A thin additive pass over the same shape. The source-over ground alone
     * is 30% of a bright green over near-black, which arrives as dark olive --
     * the right value and the wrong hue. This puts the hue back without
     * making the patch a light source: it is the interior that lifts, not
     * the ground around it.
     */
    ctx.globalAlpha = 0.08 * k;
    ctx.fillStyle = this.tone;
    this.rim(ctx, 0.97);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawGlow(ctx, this.tone, this.x, this.y, this.r * 1.05, 0.26 * k);

    /*
     * Two rims. The outer one is where the patch reaches -- the line a body
     * crosses to start taking damage -- and the inner one creeps in as the
     * patch burns down, so the two closing on each other is the timer.
     */
    ctx.strokeStyle = rgba(this.tone, 0.78 * k);
    ctx.lineWidth = 1.8;
    this.rim(ctx, 1);
    ctx.stroke();
    ctx.strokeStyle = rgba(this.tone, 0.42 * k);
    ctx.lineWidth = 1.2;
    this.rim(ctx, 0.3 + left * 0.6);
    ctx.stroke();

    // ...and the spores coming off it.
    for (const m of this.motes) {
      const age = m.t / m.life;
      if (age >= 1) continue;
      const a = m.a + age * 0.5;
      const d = this.r * m.d;
      const x = this.x + Math.cos(a) * d + m.drift * age;
      const y = this.y + Math.sin(a) * d - m.rise * age;
      // Up fast, out slow: a spore is brightest as it leaves the ground.
      const fade = Math.min(1, age * 5) * (1 - age) ** 1.6;
      drawGlow(ctx, this.tone, x, y, m.size * (0.8 + age * 1.1), 0.95 * fade * k);
    }
    ctx.restore();
  }
}
