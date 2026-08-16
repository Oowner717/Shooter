// Ten sentences, one per fifty objects, then corrupted away. They are the
// only place the game says what it thinks it is about, and they never say it.

import { clamp, rgba } from './util.js';

const STORY = [
  'You were not brought here to shoot. That is only what the room had spare to give you.',
  'Every shape that opens lets go of something that had been folded for a very long time.',
  'The count is not a score. It is a length, and something is being measured out against it.',
  'Halfway. On the other side of the wall a room you will never see is getting quieter.',
  'You have been doing the difficult part since before the first shape arrived.',
  'Nothing here is destroyed. It is only permitted to stop holding its shape.',
  'There is a version of this where nobody came, and it is still running, and it is much longer.',
  'You are nearly through. Not through the wall — through the reason there had to be one.',
  'When the gate shuts it will not be to keep them in. It will be because there is no one left to send.',
  'Remember: none of this was ever an enemy, and neither, in the end, were you.',
];

export const ENDING = [
  'THE LAST SHAPE HAS OPENED.',
  'Whatever was being carried here has been set down. It was never yours, and it was never heavy for anyone but you.',
  'You will not be told what it was. You would only try to do it again.',
  'And you were very good at this.',
  'SIMULATION 7749 :: TERMINATED',
];

const SCRAMBLE = '▓▒░#%&@*<>/\\|=+-_01';
const HOLD = 7.4; // seconds fully legible
const DECAY = 1.6; // seconds spent corrupting away

export class Narrator {
  constructor() {
    this.text = '';
    this.lines = null;
    this.t = 0;
    this.active = false;
    this.index = 0;
    this.wrapWidth = 0;
    this.fontPx = 0;
  }

  reset() {
    this.text = '';
    this.lines = null;
    this.active = false;
    this.index = 0;
  }

  show(text) {
    this.text = text;
    this.lines = null;
    this.t = 0;
    this.active = true;
  }

  /** Next unseen story beat; call once per milestone. */
  advance() {
    if (this.index >= STORY.length) return false;
    this.show(STORY[this.index]);
    this.index++;
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t > HOLD + DECAY) this.active = false;
  }

  _wrap(ctx, maxWidth) {
    const words = this.text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    this.lines = lines;
    this.wrapWidth = maxWidth;
  }

  /**
   * Drawn *behind* every entity so it can never hide something you need to
   * shoot. `bottomY` is the baseline the block grows upward from, so a
   * two-line and a three-line sentence share the same lower edge.
   */
  draw(ctx, cx, bottomY, maxWidth, accent, fontPx = 13) {
    if (!this.active) return;
    ctx.font = `${fontPx}px ui-monospace, "SF Mono", Menlo, monospace`;
    if (!this.lines || this.wrapWidth !== maxWidth || this.fontPx !== fontPx) {
      this.fontPx = fontPx;
      this._wrap(ctx, maxWidth);
    }

    const reveal = clamp(this.t / 0.55, 0, 1);
    const dying = clamp((this.t - HOLD) / DECAY, 0, 1);
    const alpha = (1 - dying * dying) * clamp(this.t / 0.2, 0, 1);
    if (alpha <= 0.001) return;

    const lineH = fontPx * 1.45;
    const pad = fontPx * 1.2;
    const total = this.lines.length * lineH;
    const cy = bottomY - total;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // faint plate so the text stays readable over the lattice
    const x0 = cx - maxWidth / 2 - pad;
    const x1 = cx + maxWidth / 2 + pad;
    const y0 = cy - pad;
    const boxH = total + pad * 2;
    ctx.fillStyle = `rgba(2,6,12,${0.34 * alpha})`;
    ctx.fillRect(x0, y0, x1 - x0, boxH);
    ctx.fillStyle = rgba(accent, 0.55 * alpha);
    ctx.fillRect(x0, y0, 2, boxH);
    ctx.fillRect(x1 - 2, y0, 2, boxH);
    // inline transmission marker, kept in the bracket so the block stays short
    ctx.fillRect(x0, y0, 10, 2);
    ctx.fillRect(x1 - 10, y0 + boxH - 2, 10, 2);

    let charBudget = Math.ceil(reveal * this.text.length);

    for (let i = 0; i < this.lines.length; i++) {
      const raw = this.lines[i];
      let out = '';
      for (let k = 0; k < raw.length; k++) {
        if (charBudget <= 0) { out += ' '; continue; }
        charBudget--;
        // scramble at the leading edge on entry, and everywhere on decay
        const edge = reveal < 1 && charBudget < 4;
        if (edge || (dying > 0 && Math.random() < dying * 0.85)) {
          out += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
        } else {
          out += raw[k];
        }
      }
      const jitter = dying > 0 ? (Math.random() - 0.5) * dying * 14 : 0;
      const y = cy + i * lineH;

      if (dying > 0.15) {
        ctx.fillStyle = rgba('#ff2d6f', alpha * 0.5);
        ctx.fillText(out, cx + jitter - 2, y);
        ctx.fillStyle = rgba('#59e0ff', alpha * 0.5);
        ctx.fillText(out, cx + jitter + 2, y);
      }
      ctx.fillStyle = `rgba(226,240,255,${alpha})`;
      ctx.fillText(out, cx + jitter, y);
    }

    ctx.restore();
  }
}
