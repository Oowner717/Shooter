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
    this.tone = opts.tone || '#9be89b';
    this.tick = opts.tick ?? 0.25;
    this.t = 0;
    this.next = 0;
    this.dead = false;
    this.motes = Array.from({ length: 10 }, () => ({
      a: rand(0, TAU), d: rand(0.2, 1), s: rand(0.4, 1.3),
    }));
  }

  update(world, dt) {
    this.t += dt;
    this.life -= dt;
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

  draw(ctx) {
    // Fades in fast and out slowly, so it never appears or vanishes on a frame.
    const k = Math.min(1, this.t / 0.25) * Math.min(1, this.life / 0.8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, this.tone, this.x, this.y, this.r * 0.95, 0.14 * k);
    ctx.strokeStyle = rgba(this.tone, 0.4 * k);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const m of this.motes) {
      const a = m.a + this.t * m.s * 0.6;
      const d = this.r * m.d * (0.75 + 0.25 * Math.sin(this.t * 2 + m.a));
      drawGlow(ctx, this.tone, this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, 5, 0.5 * k);
    }
    ctx.restore();
  }
}
