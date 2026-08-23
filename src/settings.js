/*
 * What the player has decided about how this behaves, as distinct from what
 * they have earned.
 *
 * Kept apart from the run and from the glossary on purpose. A save is progress
 * and is thrown away by RESET SIMULATION; a preference is not progress and
 * surviving a reset is the whole point of it — somebody who turned the shake
 * off did not mean "until I start again". Audio already kept its own volume
 * this way and this is the same idea with the rest of it in one place.
 *
 * Every value is bounded on read. A store this small is not worth a schema,
 * but it is worth being unable to poison the game with a hand-edited string.
 */

const KEY = 'sim7749-prefs';

/** The shipped defaults, and the only description of what a pref may be. */
const SPEC = {
  /*
   * Screen shake, as a multiplier. It is a phone: a two-hour session of a
   * screen that jumps every time something detonates is a real complaint and
   * not one anybody should have to solve by turning the game off.
   */
  shake: { def: 1, of: [0, 0.5, 1], label: 'SCREEN SHAKE', words: ['OFF', 'LIGHT', 'FULL'] },
  /*
   * A ceiling on the effects budget. The adaptive governor already drops
   * quality when frames get long; this is the player saying "start there" on
   * a device they know is slow, and it is a ceiling rather than a setting so
   * the governor can still go lower.
   */
  effects: { def: 1, of: [0.55, 0.8, 1], label: 'EFFECTS', words: ['LOW', 'MEDIUM', 'FULL'] },
  /*
   * Whether the interface says things unprompted — the story lines, the
   * first-use captions, the codex announcements. The boss keeps its captions
   * either way: those are the event, not commentary on it.
   */
  chatter: { def: 1, of: [0, 1], label: 'CAPTIONS', words: ['OFF', 'ON'] },
};

const state = { ...Object.fromEntries(Object.entries(SPEC).map(([k, s]) => [k, s.def])) };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return;
    for (const [k, s] of Object.entries(SPEC)) {
      const v = Number(d[k]);
      // Nearest allowed value, not the raw one: a store edited by hand, or
      // written by a build whose steps were different, still lands somewhere
      // the game understands.
      if (!Number.isFinite(v)) continue;
      let best = s.def;
      let gap = Infinity;
      for (const opt of s.of) {
        const g = Math.abs(opt - v);
        if (g < gap) { gap = g; best = opt; }
      }
      state[k] = best;
    }
  } catch { /* private mode: the defaults are the settings */ }
}
load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing to do */ }
}

export const PREFS = SPEC;

/** The live value of one preference. */
export function pref(key) {
  return state[key];
}

/** Set one, clamped to what it is allowed to be. Returns the value it took. */
export function setPref(key, value) {
  const s = SPEC[key];
  if (!s) return undefined;
  const v = s.of.includes(value) ? value : s.def;
  if (state[key] === v) return v;
  state[key] = v;
  save();
  return v;
}

/**
 * Step one down, wrapping at the bottom. What a tapped row does.
 *
 * Down rather than up because every one of these ships at its maximum, so
 * stepping up means the first tap can only wrap — FULL straight to OFF, which
 * reads as a broken control rather than as a setting. Down is what somebody
 * tapping SCREEN SHAKE wanted anyway.
 */
export function cyclePref(key) {
  const s = SPEC[key];
  if (!s) return undefined;
  const i = s.of.indexOf(state[key]);
  const at = i < 0 ? s.of.indexOf(s.def) : i;
  return setPref(key, s.of[(at - 1 + s.of.length) % s.of.length]);
}

/** The word for the value it is on, for the row that shows it. */
export function prefWord(key) {
  const s = SPEC[key];
  if (!s) return '';
  const i = s.of.indexOf(state[key]);
  return s.words[i < 0 ? s.of.indexOf(s.def) : i];
}

/** Back to the shipped defaults. RESET SIMULATION does not do this. */
export function forgetPrefs() {
  for (const [k, s] of Object.entries(SPEC)) state[k] = s.def;
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
