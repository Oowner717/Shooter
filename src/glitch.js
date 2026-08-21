// Full-frame corruption. The scene is rendered into an offscreen buffer and
// this module decides how honestly to present it.
//
// Works entirely in device pixels: slice displacement, chroma ghosting,
// difference-inverted bands, block noise and a vertical roll. No filters, no
// getImageData — both are far too slow on iOS.

import { clamp, rand, randInt, spread } from './util.js';

class Glitch {
  constructor() {
    this.level = 0; // eased display level
    // Only one mode left: the corruption you take from contact. 'boss' and
    // 'frozen' went with ORDINAL in build 82.
    this.mode = 'normal';
    this.roll = 0;
    this.burst = 0;
  }

  reset() {
    this.level = 0;
    this.mode = 'normal';
    this.roll = 0;
    this.burst = 0;
  }

  /** One-off spike (contact events). */
  kick(amount) {
    this.burst = Math.max(this.burst, amount);
  }

  update(dt, target, mode) {
    this.mode = mode;
    this.burst = Math.max(0, this.burst - dt * 1.4);
    const goal = clamp(target + this.burst, 0, 1.2);
    // Rises fast, decays slow — corruption should feel sticky.
    const rate = goal > this.level ? 16 : 3.2;
    this.level += (goal - this.level) * clamp(rate * dt, 0, 1);
    this.roll += dt * 90;
  }

  get active() {
    return this.level > 0.004;
  }

  /**
   * Composite `src` (device-pixel scene buffer) onto `ctx`.
   * @param {CanvasRenderingContext2D} ctx destination, untransformed
   */
  present(ctx, src, bw, bh) {
    const L = clamp(this.level, 0, 1.2);


    if (L < 0.004) {
      ctx.drawImage(src, 0, 0);
      return;
    }

    const intensity = L;

    // --- base pass, occasionally torn off its vertical origin ---
    let rollY = 0;
    if (intensity > 0.55 && Math.random() < 0.06) {
      rollY = Math.round(((this.roll % bh) + bh) % bh);
    }
    const jx = Math.round(spread(intensity * 7));
    if (rollY) {
      ctx.drawImage(src, 0, 0, bw, bh - rollY, jx, rollY, bw, bh - rollY);
      ctx.drawImage(src, 0, bh - rollY, bw, rollY, jx, 0, bw, rollY);
    } else {
      ctx.drawImage(src, jx, 0);
      if (jx !== 0) {
        // fill the exposed edge so we never show background through the seam
        ctx.drawImage(src, jx > 0 ? 0 : bw + jx, 0, Math.abs(jx), bh, jx > 0 ? 0 : bw + jx, 0, Math.abs(jx), bh);
      }
    }

    // --- displaced slices with chroma ghosting ---
    const slices = Math.round(2 + intensity * 13);
    for (let i = 0; i < slices; i++) {
      const sh = randInt(4, Math.max(6, Math.round(bh * 0.06)));
      const sy = randInt(0, bh - sh);
      const dx = Math.round(spread(intensity * 46));
      if (dx === 0) continue;

      ctx.drawImage(src, 0, sy, bw, sh, dx, sy, bw, sh);

      // chroma ghost
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * intensity;
      ctx.drawImage(src, 0, sy, bw, sh, dx * -0.6, sy, bw, sh);
      ctx.fillStyle = i % 2 ? 'rgba(255,40,90,0.16)' : 'rgba(40,220,255,0.16)';
      ctx.fillRect(0, sy, bw, sh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // --- inverted bands ---
    if (intensity > 0.28) {
      const bands = randInt(1, 3);
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < bands; i++) {
        const sh = randInt(6, Math.round(bh * 0.09));
        ctx.fillRect(0, randInt(0, bh - sh), bw, sh);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // --- block noise ---
    const blocks = Math.round(intensity * 16);
    for (let i = 0; i < blocks; i++) {
      const bwid = randInt(8, 90);
      const bhei = randInt(2, 12);
      const x = randInt(0, bw - bwid);
      const y = randInt(0, bh - bhei);
      const roll = Math.random();
      if (roll < 0.34) {
        // torn copy from elsewhere in the frame
        ctx.drawImage(src, x, randInt(0, bh - bhei), bwid, bhei, x, y, bwid, bhei);
      } else if (roll < 0.7) {
        ctx.fillStyle = `rgba(${randInt(120, 255)},${randInt(120, 255)},${randInt(160, 255)},${rand(0.05, 0.28)})`;
        ctx.fillRect(x, y, bwid, bhei);
      } else {
        ctx.fillStyle = `rgba(0,0,0,${rand(0.15, 0.5)})`;
        ctx.fillRect(x, y, bwid, bhei);
      }
    }

    // --- hot tear line ---
    if (intensity > 0.4 && Math.random() < 0.5) {
      const y = randInt(0, bh - 2);
      ctx.fillStyle = `rgba(255,255,255,${rand(0.15, 0.5) * intensity})`;
      ctx.fillRect(0, y, bw, randInt(1, 3));
    }

  }
}

export const glitch = new Glitch();
