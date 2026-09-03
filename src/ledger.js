/**
 * What is actually doing the damage, by source.
 *
 * Every balance question this project has asked -- which round is the odd one
 * out, why a mine reads as doing nothing, whether an upgrade reaches the thing
 * it claims to -- has been answered by a throwaway probe in a headless browser,
 * and three of those probes published a finding that was the instrument rather
 * than the game. This is the same measurement taken from INSIDE the running
 * game, on the phone, against whatever the player has actually bought.
 *
 * ---- what is recorded ----
 *
 * `note` is called from `Enemy.applyDamage`, at the one place the delivered
 * number exists: AFTER the armour plate, the HERALD ward and the `Math.max(1,
 * ...)` floor. Recording the argument instead would be recording what the
 * caller asked for, which is rate-independent by construction and cannot see a
 * floor -- the exact instrument fault that cost build 231 a table. Two numbers
 * per source:
 *
 *   `total`     every point delivered, overkill included. This is OUTPUT: what
 *               the kit put out, which is the number a dummy measures and the
 *               one a balance pass wants.
 *   `over`      the part of it that landed on a body that was already dead by
 *               the end of the hit. Against a practice dummy this is zero by
 *               construction; against a real wave it is how much of the output
 *               was wasted, which is a different and equally useful reading.
 *   `kills`     how many bodies this source finished. Kept because damage on
 *               its own cannot describe VOID, which does no damage at all --
 *               it deletes one body through `Enemy.destroy`, whatever its
 *               health, and a table with only a damage column reports the
 *               game's most decisive mine as doing nothing. That is the same
 *               shape as the KNELL complaint build 231 chased down, and a
 *               counter is worth having only if it cannot make it again.
 *
 * ---- the two rates ----
 *
 * `live` is a rolling window (`WINDOW` seconds) and is what the counter on the
 * screen shows -- it answers "what am I doing right now". `sustained` is
 * `total / elapsed` since the last reset and is what a comparison wants, since
 * a burst weapon and a steady one have to be judged over the same clock.
 *
 * ---- cost ----
 *
 * Off unless the sandbox armed it. `note` returns on its first line in a
 * normal run, so the ordinary game pays one property read per hit and nothing
 * else -- no allocation, no Map lookup, no window to prune. That matters:
 * `applyDamage` runs tens of thousands of times in a boss fight.
 */

/** Seconds of history behind the live rate. */
const WINDOW = 3;

/**
 * Long enough that a slow weapon is not reported as idle between shots, short
 * enough that the number answers to the trigger. SLUG at 1.5 rounds a second
 * puts four or five in this window; PULSE on a seven-second cooldown will show
 * a spike and fall back, which is the truth about PULSE.
 */

class Ledger {
  constructor() {
    this.on = false;
    this.t = 0;
    this.total = 0;
    this.over = 0;
    this.kills = 0;
    this.peak = 0;
    /** src -> { total, over, hits, kills, first, last } */
    this.by = new Map();
    /**
     * The rolling window, as a flat ring of (t, amount, src) rather than a
     * list of objects: this is written on every hit and pruned every frame,
     * and an object apiece would make a boss fight's worth of garbage.
     */
    this.wT = [];
    this.wD = [];
    this.wS = [];
    this.head = 0; // index of the oldest entry still inside the window
  }

  /** Arm, from a clean slate. */
  arm(on) {
    this.on = !!on;
    this.reset();
  }

  /**
   * Stop recording and KEEP what was recorded.
   *
   * Leaving the bench used to `arm(false)`, which resets -- so the moment you
   * walked out, the session you had just spent five minutes on was gone. The
   * numbers are the whole point of the room; they outlive the visit now, and
   * the menu shows the last one. Entering re-arms and clears, so a session is
   * still one session.
   */
  disarm() {
    this.on = false;
  }

  reset() {
    this.t = 0;
    this.total = 0;
    this.over = 0;
    this.kills = 0;
    this.peak = 0;
    this.by.clear();
    this.wT.length = 0;
    this.wD.length = 0;
    this.wS.length = 0;
    this.head = 0;
  }

  /**
   * One delivered hit.
   *
   * @param src an ARSENAL key (`standard`, `blast`, ...), an ABILITIES id
   *   (`pulse`, ...) or one of the few things that are neither -- see
   *   `SRC_LABEL` below. An empty source is still counted in the total: a
   *   number that adds up is worth more than a tidy table, and an unattributed
   *   row is a bug this can actually show you.
   * @param real the delivered damage, after mitigation.
   * @param over the part of `real` past what the body had left.
   * @param killed whether this hit is the one that finished it.
   */
  note(src, real, over = 0, killed = false) {
    if (!this.on || !(real > 0)) return;
    this.total += real;
    this.over += over;
    if (killed) this.kills++;
    const key = src || 'unattributed';
    const e = this.row(key);
    e.total += real;
    e.over += over;
    e.hits++;
    if (killed) e.kills++;
    e.last = this.t;
    this.wT.push(this.t);
    this.wD.push(real);
    this.wS.push(key);
  }

  row(key) {
    let e = this.by.get(key);
    if (!e) {
      e = { total: 0, over: 0, hits: 0, kills: 0, first: this.t, last: this.t };
      this.by.set(key, e);
    }
    return e;
  }

  /**
   * A body removed without being damaged.
   *
   * VOID is the only thing in the game that does this, and it does it through
   * `Enemy.destroy` rather than `applyDamage` on purpose -- ARMORED DISCARDS a
   * hit rather than reducing it, so no amount of damage can be guaranteed to
   * kill and the mine whose whole promise is "one kill, whatever its health"
   * cannot be built out of one. So it has nothing to book as damage, and
   * without this its row would be empty.
   */
  kill(src) {
    if (!this.on) return;
    this.kills++;
    const e = this.row(src || 'unattributed');
    e.kills++;
    e.last = this.t;
  }

  /**
   * Advance the clock and drop what has fallen out of the window.
   *
   * Driven off the REAL frame time, not the world's -- slow motion during a
   * boss's death would otherwise stretch the denominator and report a burst of
   * damage-per-second that no phone ever delivered.
   */
  tick(dt) {
    if (!this.on) return;
    this.t += dt;
    const cut = this.t - WINDOW;
    while (this.head < this.wT.length && this.wT[this.head] < cut) this.head++;
    // Compact when the dead prefix is most of the ring, so a long session does
    // not grow three unbounded arrays. Amortised O(1) per entry.
    if (this.head > 512 && this.head * 2 > this.wT.length) {
      this.wT.splice(0, this.head);
      this.wD.splice(0, this.head);
      this.wS.splice(0, this.head);
      this.head = 0;
    }
    const l = this.live();
    if (l > this.peak) this.peak = l;
  }

  /** Damage a second over the last `WINDOW` seconds, everything together. */
  live() {
    if (!this.on) return 0;
    let sum = 0;
    for (let i = this.head; i < this.wD.length; i++) sum += this.wD[i];
    return sum / Math.min(WINDOW, Math.max(0.25, this.t));
  }

  /** ...and the same, split by source. */
  liveBy() {
    const out = new Map();
    if (!this.on) return out;
    const span = Math.min(WINDOW, Math.max(0.25, this.t));
    for (let i = this.head; i < this.wD.length; i++) {
      out.set(this.wS[i], (out.get(this.wS[i]) || 0) + this.wD[i]);
    }
    for (const [k, v] of out) out.set(k, v / span);
    return out;
  }

  /**
   * The table the stats panel draws: one row per source, heaviest first.
   *
   * `sustained` is over the WHOLE elapsed clock rather than over the source's
   * own first-to-last, on purpose. A weapon that was swapped away from is
   * genuinely contributing nothing for the rest of the window, and a table
   * that divided each row by its own span would rank a round fired twice
   * above one fired for a minute.
   */
  table() {
    const live = this.liveBy();
    const span = Math.max(0.25, this.t);
    const rows = [];
    for (const [src, e] of this.by) {
      rows.push({
        src,
        total: e.total,
        over: e.over,
        hits: e.hits,
        kills: e.kills,
        live: live.get(src) || 0,
        sustained: e.total / span,
        share: this.total > 0 ? e.total / this.total : 0,
      });
    }
    // By damage, then by kills -- so VOID, which has no damage at all, still
    // sorts above a row that did nothing rather than falling off the bottom.
    rows.sort((a, b) => (b.total - a.total) || (b.kills - a.kills));
    return rows;
  }
}

export const ledger = new Ledger();

/**
 * The sources that are not an ARSENAL key or an ability id.
 *
 * Everything a player buys is already named somewhere -- `ARSENAL` for rounds
 * and mines, `ABILITIES` for the bar -- and the ledger uses those keys
 * directly so the panel can take its label, icon and colour from the same
 * place the rest of the interface does. What is left is the handful of things
 * that damage bodies and are not on any of those lists.
 */
export const SRC_EXTRA = {
  contact: { name: 'COLLISIONS', tone: '#9fb3c8' },
  bloom: { name: 'BLOOM BLAST', tone: '#ff5d8f' },
  casing: { name: 'HARD CASING', tone: '#7cffb2' },
  pile: { name: 'PILE', tone: '#ffd166' },
  turret: { name: 'TURRET', tone: '#59e0ff' },
  unattributed: { name: 'UNATTRIBUTED', tone: '#ff5d8f' },
};
