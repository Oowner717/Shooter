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

  /**
   * Let it go while the world is held.
   *
   * `present()` re-rolls every slice, every block and the tear line on each
   * frame it draws -- that is what makes the corruption move -- and `draw()`
   * keeps running while the menu is up even though `update()` returns at the
   * top. So a paused game kept tearing and flickering behind the sheet at
   * whatever level the last live frame left it on, which is the one place in
   * the game where the picture has to be still enough to read.
   *
   * Faded rather than switched off, on the real clock, for the same reason
   * settleScreen exists: a flash cut mid-decay reads as a broken frame. It
   * costs nothing on the way back, because the rise is five times the decay
   * and the level is rebuilt from live state the moment update() runs again.
   */
  settle(dt) {
    this.burst = Math.max(0, this.burst - dt * 1.4);
    this.level = Math.max(0, this.level - this.level * 9 * dt - 0.35 * dt);
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
    const jx = Math.round(spread(intensity * 9));
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
    const slices = Math.round(3 + intensity * 17);
    for (let i = 0; i < slices; i++) {
      const sh = randInt(4, Math.max(6, Math.round(bh * 0.06)));
      const sy = randInt(0, bh - sh);
      const dx = Math.round(spread(intensity * 64));
      /*
       * ...and vertically, which the feed never did.
       *
       * A slice slid sideways across an empty sky changes almost nothing --
       * black moved onto black. Slid UP or DOWN it drags whatever was lit
       * somewhere else onto a dark band, which is a large change to the
       * frame that costs no light at all. That is the trade this whole pass
       * is: the effect should disturb, not illuminate. Measured, cutting the
       * white plates dropped disturbance from 29 to 26 alongside the
       * brightness; this is what pays it back.
       */
      const dy = Math.round(spread(intensity * 26));
      if (dx === 0 && dy === 0) continue;

      ctx.drawImage(src, 0, sy, bw, sh, dx, sy + dy, bw, sh);

      /*
       * The chroma ghost is a second copy of the SAME pixels at an offset,
       * not a light. Its alpha went up and its flat tint went down, because
       * the tint is `lighter` over a near-black field and adds light for
       * nothing while the ghost adds displacement for nothing.
       */
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * intensity;
      ctx.drawImage(src, 0, sy, bw, sh, dx * -0.75, sy + dy * 0.5, bw, sh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = i % 2 ? 'rgba(255,40,90,0.07)' : 'rgba(40,220,255,0.07)';
      ctx.fillRect(0, sy + dy, bw, sh);
      ctx.globalCompositeOperation = 'source-over';
    }

    /*
     * --- inverted bands ---
     *
     * These were `difference` against #ffffff, which on a normal image is an
     * invert and on THIS one is a white fill: the field is 97% near-black, so
     * every one of these bands took a strip of the screen from luminance 5 to
     * luminance 250. Measured, one object attached to the turret took the
     * screen from 0.54% near-white pixels to 6.6% -- the whole game, 57 bodies
     * of neon on black, is 0.5% -- and mean screen luminance rose 60%. The
     * feed was the brightest thing in the game by an order of magnitude and it
     * read as broken rendering rather than as something having hold of you.
     *
     * Differenced against a dark slate instead. Black goes to that slate
     * rather than to white, and the lit parts of the frame still inverse
     * toward dark, so it is still an inversion -- it just cannot manufacture
     * a highlight out of an empty sky. The bands are also torn sideways now,
     * which is the part that was doing the work anyway.
     */
    if (intensity > 0.28) {
      const bands = randInt(1, 3);
      for (let i = 0; i < bands; i++) {
        const sh = randInt(6, Math.round(bh * 0.09));
        const sy = randInt(0, bh - sh);
        const dx = Math.round(spread(intensity * 40));
        if (dx !== 0) ctx.drawImage(src, 0, sy, bw, sh, dx, sy, bw, sh);
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#39435c';
        ctx.fillRect(0, sy, bw, sh);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // --- block noise ---
    const blocks = Math.round(intensity * 22);
    for (let i = 0; i < blocks; i++) {
      const bwid = randInt(8, 90);
      const bhei = randInt(2, 12);
      const x = randInt(0, bw - bwid);
      const y = randInt(0, bh - bhei);
      const roll = Math.random();
      if (roll < 0.34) {
        // torn copy from elsewhere in the frame
        ctx.drawImage(src, randInt(0, bw - bwid), randInt(0, bh - bhei),
          bwid, bhei, x, y, bwid, bhei);
      } else if (roll < 0.7) {
        // Was 120-255 across all three channels at up to 0.28 -- a scatter of
        // near-white chips. Kept cold and kept dim: it reads as dead pixels
        // rather than as something on fire.
        ctx.fillStyle = `rgba(${randInt(60, 130)},${randInt(80, 150)},${randInt(110, 190)},${rand(0.05, 0.2)})`;
        ctx.fillRect(x, y, bwid, bhei);
      } else {
        ctx.fillStyle = `rgba(0,0,0,${rand(0.15, 0.5)})`;
        ctx.fillRect(x, y, bwid, bhei);
      }
    }

    /*
     * --- the tear line ---
     *
     * A full-width white bar at up to half alpha. It is the same colour the
     * turret goes when something is holding it (#ff5d5d) now, and thinner and
     * dimmer with it: a red line across the feed says what is happening, a
     * white one says the screen is broken.
     */
    if (intensity > 0.4 && Math.random() < 0.5) {
      const y = randInt(0, bh - 2);
      ctx.fillStyle = `rgba(255,93,93,${rand(0.12, 0.3) * intensity})`;
      ctx.fillRect(0, y, bw, randInt(1, 2));
    }

  }
}

export const glitch = new Glitch();
