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
 * `rate(win)` is a rolling window over the ring; see `WINDOWS` below for the
 * three the interface uses and why. `sustained` is `total / elapsed` since the
 * last reset and is what a comparison wants, since a burst weapon and a steady
 * one have to be judged over the same clock.
 *
 * ---- cost ----
 *
 * Off unless the sandbox armed it. `note` returns on its first line in a
 * normal run, so the ordinary game pays one property read per hit and nothing
 * else -- no allocation, no Map lookup, no window to prune. That matters:
 * `applyDamage` runs tens of thousands of times in a boss fight.
 */

/**
 * How much history the ring keeps, and the windows read off it.
 *
 * There was one window, three seconds, and it was the only rate on the screen.
 * Three seconds is short enough that a weapon fired 1.5 times a second makes
 * the number jump every round -- and the counter was also being redrawn every
 * frame, so the bar flickered through four digits a second and could not be
 * read at all, let alone compared.
 *
 * So: one ring, thirty seconds deep, and any window read off it.
 *
 *   3s   what is happening RIGHT NOW. Still wanted -- it is what the dummy's
 *        own effects are driven from, where responsiveness is the point and
 *        legibility is not.
 *   10s  what the panel leads with. Long enough to survive a reload or a
 *        cooldown, short enough to answer when you change round.
 *   30s  what a comparison wants. A burst weapon and a steady one only look
 *        alike over a window that contains several of the bursts.
 *
 * ...and the session average is on top of those, over however long the
 * counter has been running, which is the one number that cannot be gamed by
 * choosing when to look.
 */
const HISTORY = 30;
export const WINDOWS = [3, 10, 30];

/**
 * The one the panel leads with, and `rate()`'s default.
 *
 * It was on the bar as well until build 236, four pixels above the tile
 * carrying the same number -- and at 320 the label wrapped, so the bar read
 * "DPS" over "10s" beside a figure.
 */
export const BAR_WINDOW = 10;

class Ledger {
  constructor() {
    this.on = false;
    this.t = 0;
    this.total = 0;
    this.over = 0;
    this.kills = 0;
    /*
     * `peak` was here, written on every tick and read by NOTHING -- and it
     * cost a full backwards walk of the 3s window per frame to maintain. The
     * rig's own peak flag is `e.dummyPeak` in dummy.js, which is a decayed
     * maximum of the STRAIN and not of the rate, and has always been its own.
     */
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
    const cut = this.t - HISTORY;
    while (this.head < this.wT.length && this.wT[this.head] < cut) this.head++;
    // Compact when the dead prefix is most of the ring, so a long session does
    // not grow three unbounded arrays. Amortised O(1) per entry.
    if (this.head > 512 && this.head * 2 > this.wT.length) {
      this.wT.splice(0, this.head);
      this.wD.splice(0, this.head);
      this.wS.splice(0, this.head);
      this.head = 0;
    }
  }

  /**
   * Damage a second over the last `win` seconds, everything together.
   *
   * Walked backwards from the newest entry and stopped at the window's edge,
   * so a short window costs a short walk however deep the ring is -- the 3s
   * rate is read every frame to drive the dummy, and it must not be a scan of
   * thirty seconds of history to get it.
   */
  rate(win = BAR_WINDOW) {
    if (!this.on) return 0;
    const cut = this.t - win;
    let sum = 0;
    for (let i = this.wD.length - 1; i >= this.head; i--) {
      if (this.wT[i] < cut) break;
      sum += this.wD[i];
    }
    return sum / Math.min(win, Math.max(0.25, this.t));
  }

  /** The fastest of the three windows: what is happening right now. */
  live() {
    return this.rate(WINDOWS[0]);
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
    const span = Math.max(0.25, this.t);
    const rows = [];
    for (const [src, e] of this.by) {
      rows.push({
        src,
        total: e.total,
        over: e.over,
        hits: e.hits,
        kills: e.kills,
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

/**
 * ---- the soak: what this device has ever put into a dummy ----
 *
 * The ledger above is a SESSION. It is armed on the way into the bench and
 * cleared on the way in again, which is right for a measurement -- a rate you
 * cannot reset is a rate you cannot use -- and wrong for a record. This is the
 * record: one number, every point of damage ever delivered to a practice
 * dummy on this device, and it is what the rig's own accretion is drawn from.
 *
 * ---- why it is not in the save ----
 *
 * `sim7749-run` is the RUN, and three separate things throw it away: starting
 * over, `Game.restart`, and the title screen's RESET SIMULATION. A record that
 * a new run deletes is not a record. Worse, `captureRun` refuses to write
 * anywhere but `staging` and `Game.checkpoint` refuses outright while the
 * bench is up -- so a number living in the run file could not be written at
 * the one moment it is actually moving.
 *
 * So it is a key of its own, which is what every device-level fact in this
 * game already is: the glossary (`sim7749-codex`), the lines already said
 * (`sim7749-lines`), the preferences and the volume. It follows the codex
 * exactly -- loaded once at module load, written only when it has changed,
 * and cleared by `forgetPlayer()` and by nothing else, because that is the
 * one function in the game that means "the next launch is a first launch".
 *
 * ---- why it is flushed rather than written ----
 *
 * `add` is called from `dummyHit`, which is called once per delivered hit: a
 * fully bought turret puts four thousand points a second into the rig across
 * dozens of hits. `localStorage.setItem` on each of those would be a write per
 * frame, on the main thread, on a phone. So the number is kept in memory and
 * flushed on a clock and at every point the game already writes the run down
 * -- see `Game.checkpoint`, which flushes this BEFORE its own bench guard.
 */
const SOAK_KEY = 'sim7749-soak';

/**
 * ---- the ladder, in beads ----
 *
 * The rig wears the record as small beads in a shell round it, and the shell
 * has to do two things at once that pull against each other: show a new player
 * something on their first magazine, and still have somewhere to go after
 * hours. A flat "one bead per X damage" can do one or the other. One bead per
 * thousand and a fully bought turret fills any honest maximum in four minutes;
 * one bead per million and stock BOLT earns its first after four hours.
 *
 * So it is an odometer. Five shells of twenty beads, and each shell's beads
 * are worth TEN TIMES the one inside it:
 *
 *   shell 1   1k each      20k      the first bead is 17s of stock BOLT
 *   shell 2   10k each     220k     ...and 4s of a bought one
 *   shell 3   100k each    2.22M
 *   shell 4   1M each      22.2M
 *   shell 5   10M each     222.22M  a full set
 *
 * A full set is 222,220,000 points of damage, which is **13.1 hours** of a
 * fully bought turret held on the rig without a pause (measured: 4,700 dps,
 * `regress.mjs`), or 1,028 hours of the stock gun. That is the "very high
 * maximum" the request asked for, and the decade steps are what keep the first
 * hour visibly moving anyway -- three quarters of the beads are earned inside
 * the first 2.2M, which is eight minutes of the bought gun.
 *
 * The count is returned FRACTIONAL so the newest bead can be drawn arriving
 * rather than appearing between two frames -- the same rule the band position
 * follows.
 */
export const SOAK_SHELLS = 5;
export const SOAK_PER_SHELL = 20;
export const SOAK_BEADS = SOAK_SHELLS * SOAK_PER_SHELL;
/** What a bead in the innermost shell is worth. Every shell out is x10. */
const SOAK_UNIT = 1000;
/** What each shell's bead is worth, and what the whole shell costs. */
const SOAK_EACH = [];
for (let k = 0; k < SOAK_SHELLS; k++) SOAK_EACH.push(SOAK_UNIT * (10 ** k));
/** Damage for a full set. */
export const SOAK_CAP = SOAK_EACH.reduce((a, e) => a + e * SOAK_PER_SHELL, 0);

/** How many beads `total` has earned, fractionally. */
export function soakBeads(total) {
  let left = Math.max(0, +total || 0);
  let n = 0;
  for (let k = 0; k < SOAK_SHELLS; k++) {
    const shell = SOAK_EACH[k] * SOAK_PER_SHELL;
    if (left >= shell) { n += SOAK_PER_SHELL; left -= shell; continue; }
    return n + left / SOAK_EACH[k];
  }
  return SOAK_BEADS;
}

/** What the next bead costs from here, for the readout. 0 once the set is full. */
export function soakNext(total) {
  const n = soakBeads(total);
  if (n >= SOAK_BEADS) return 0;
  const k = Math.min(SOAK_SHELLS - 1, Math.floor(n / SOAK_PER_SHELL));
  return Math.ceil((1 - (n % 1)) * SOAK_EACH[k]);
}

class Soak {
  constructor() {
    this.total = 0;
    this.dirty = false;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(SOAK_KEY);
      if (raw === null) return;
      const v = Number(raw);
      // Bounded on read, the way `settings.js` and `audio.js` bound theirs: a
      // hand-edited string must not be able to poison the drawing.
      if (Number.isFinite(v) && v > 0) this.total = Math.min(v, SOAK_CAP * 4);
    } catch {
      /* private mode, or an unreadable store: the record starts here */
    }
  }

  /** One delivered hit on a dummy. */
  add(d) {
    if (!(d > 0)) return;
    this.total += d;
    this.dirty = true;
  }

  /** Write it down, if it has moved. Cheap enough to call on any clock. */
  flush() {
    if (!this.dirty) return false;
    this.dirty = false;
    try {
      localStorage.setItem(SOAK_KEY, String(Math.round(this.total)));
      return true;
    } catch {
      return false; // no store: the number still stands for as long as the tab does
    }
  }

  forget() {
    this.total = 0;
    this.dirty = false;
    try {
      localStorage.removeItem(SOAK_KEY);
    } catch { /* nothing to forget */ }
  }
}

export const soak = new Soak();
