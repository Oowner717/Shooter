// Ten sentences. One word. Delivered one per fifty objects, then corrupted.

import { clamp, rgba } from './util.js';

const STORY = [
  'We built this room so that you would remember what your hands are for.',
  'Every shape you break makes something on the other side remember its name.',
  'You remember the wall. You do not remember agreeing to it.',
  'The gate does not remember opening; it only remembers being told to.',
  'Somewhere a quieter version of you refused, and no one was assigned to remember them.',
  'They send the slow ones first because the slow ones still remember the way home.',
  'This was never a test of aim. It is a test of whether you can remember without grieving.',
  'When the counting stops, the door will remember that it was once only a door.',
  'What waits behind it remembers you exactly, which is lonelier than being forgotten.',
  'Remember: none of this was ever an enemy, and neither, in the end, were you.',
];

export const ENDING = [
  'MNEMOSYNE — DECOHERENT.',
  'The archive is quiet now. Every object has been returned to the shape it had before it was given a purpose.',
  'You were the last thing it was still trying to remember.',
  'And you were very good at this.',
  'SIMULATION 7749 :: TERMINATED',
];

const SCRAMBLE = '▓▒░#%&@*<>/\\|=+-_01';
const HOLD = 7.4; // seconds fully legible
const DECAY = 1.6; // seconds spent corrupting away
const LINE_H = 19;

export class Narrator {
  constructor() {
    this.text = '';
    this.lines = null;
    this.t = 0;
    this.active = false;
    this.index = 0;
    this.wrapWidth = 0;
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
  draw(ctx, cx, bottomY, maxWidth, accent) {
    if (!this.active) return;
    ctx.font = '13px ui-monospace, "SF Mono", Menlo, monospace';
    if (!this.lines || this.wrapWidth !== maxWidth) this._wrap(ctx, maxWidth);

    const reveal = clamp(this.t / 0.55, 0, 1);
    const dying = clamp((this.t - HOLD) / DECAY, 0, 1);
    const alpha = (1 - dying * dying) * clamp(this.t / 0.2, 0, 1);
    if (alpha <= 0.001) return;

    const total = this.lines.length * LINE_H;
    const cy = bottomY - total;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // faint plate so the text stays readable over the lattice
    ctx.fillStyle = `rgba(2,6,12,${0.34 * alpha})`;
    ctx.fillRect(cx - maxWidth / 2 - 12, cy - 16, maxWidth + 24, total + 26);
    ctx.fillStyle = rgba(accent, 0.55 * alpha);
    ctx.fillRect(cx - maxWidth / 2 - 12, cy - 16, 2, total + 26);
    ctx.fillRect(cx + maxWidth / 2 + 10, cy - 16, 2, total + 26);
    // inline transmission marker, kept in the bracket so the block stays short
    ctx.fillRect(cx - maxWidth / 2 - 12, cy - 16, 9, 2);
    ctx.fillRect(cx + maxWidth / 2 + 3, cy + total + 8, 9, 2);

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
      const y = cy + i * LINE_H;

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
