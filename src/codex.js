// The glossary, and the record of what has been seen.
//
// Entries unlock the first time you destroy one — the boss included — and the
// record survives a reset, because it was never yours: it is kept by whoever
// has been counting. Descriptions are field notes in the same voice as the
// story: flat, observed, second person where it helps, never a tutorial.

const KEY = 'sim7749-codex';

/** Every entry, in the order they are shown. `id` matches the object type. */
export const CODEX = [
  {
    id: 'mote',
    name: 'MOTE',
    line: 'Barely present. One round moves it further than it can move itself.',
  },
  {
    id: 'needle',
    name: 'NEEDLE',
    line: 'The quick one. Thin enough that arriving is the only thing it does well.',
  },
  {
    id: 'lurcher',
    name: 'LURCHER',
    line: 'Shoves itself forward in bursts and coasts between them. Heavy enough that a bolt is a suggestion.',
  },
  {
    id: 'splitter',
    name: 'SPLITTER',
    line: 'Comes apart into four, and the four carry on where it was going.',
  },
  {
    id: 'bloom',
    name: 'BLOOM',
    line: 'Its death is the point. Keep nothing beside it that you wanted.',
  },
  {
    id: 'bulwark',
    name: 'BULWARK',
    line: 'Armoured past the point of interest. Push it into something instead.',
  },
  {
    id: 'warden',
    name: 'WARDEN',
    line: 'Three plates orbit it and eat what you send. Take them first, or take them anyway.',
  },
  {
    id: 'plate',
    name: 'PLATE',
    line: 'A piece of a WARDEN with nothing left to guard. Whatever is still on the core when it goes comes at you.',
  },
  {
    id: 'prism',
    name: 'PRISM',
    line: 'Turns a glancing shot into somebody else’s problem. Hit it square, or aim the ricochet.',
  },
  {
    id: 'herald',
    name: 'HERALD',
    line: 'Covers what stands near it, and shows you it is doing so. The covering stops when it does.',
  },
  {
    id: 'glut',
    name: 'GLUT',
    line: 'Eats what you leave lying about. Every fragment on the floor is a decision you already made.',
  },
  {
    id: 'tow',
    name: 'TOW',
    line: 'Drags a weight on a cable. The weight does not steer, and it does not need to.',
  },
  {
    id: 'towMass',
    name: 'MASS',
    line: 'The far end of a cable. It arrives by being swung, and it arrives regardless.',
  },
  {
    id: 'scion',
    name: 'SCION',
    line: 'Worth more to the field dead than alive. What it throws goes looking for something to join.',
  },
  {
    id: 'seed',
    name: 'SEED',
    line: 'Harmless on its own, and it is not on its own for long. It rides whatever it reaches and closes that body\'s wounds — up to three of them at once. Shoot it in the air, or shoot it off afterwards.',
  },
  {
    id: 'drift',
    name: 'DRIFT',
    line: 'No heading, no destination, no threat. It is not counted, and AUTO AIM will not take it — a DRIFT is only ever shot on purpose. Worth 10 ENERGY against a MOTE\u2019s 4, which is the reason to bother.',
  },
];

const IDS = new Set(CODEX.map((e) => e.id));

/**
 * What has been destroyed at least once, ever. Kept in localStorage, so it
 * outlives a reset the way a record outlives a session. Private browsing has
 * no store; the codex then simply lives for as long as the tab does.
 */
class Codex {
  constructor() {
    this.seen = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      for (const id of JSON.parse(raw)) if (IDS.has(id)) this.seen.add(id);
    } catch {
      /* unreadable or unavailable: start empty and carry on */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      /* no store available — the in-memory set still works for this tab */
    }
  }

  has(id) {
    return this.seen.has(id);
  }

  /** @returns true if this was the first one ever, which is worth announcing. */
  record(id) {
    if (!id || !IDS.has(id) || this.seen.has(id)) return false;
    this.seen.add(id);
    this.save();
    return true;
  }

  get found() {
    return this.seen.size;
  }

  get total() {
    return CODEX.length;
  }

  /** Debug only. */
  forget() {
    this.seen.clear();
    this.save();
  }

  unlockAll() {
    for (const e of CODEX) this.seen.add(e.id);
    this.save();
  }
}

export const codex = new Codex();

/*
 * Two keys this build has no use for, and no readers left.
 *
 * `sim7749-cleared` recorded whether ORDINAL had been beaten, and has meant
 * nothing since build 81 took the boss out: every run is endless, so there is
 * nothing to have beaten and nothing it could gate. Its three readers were
 * kept on the grounds that the key was still on players' devices and removing
 * them would strand it — but a reader nobody calls does not un-strand
 * anything. They are gone, and migrateLines() deletes the key instead, which
 * is what not stranding it actually looks like.
 *
 * `sim7749-taught` is the flag the per-line record replaced in build 94. Read
 * once, by migrateLines(), then removed.
 */
const CLEARED = 'sim7749-cleared';
const TAUGHT = 'sim7749-taught';

/**
 * Which lines this device has already been told, one id at a time.
 *
 * It used to be a single flag: said, or not said, for the whole script at
 * once. That was fine until the script grew — the two lines about DRIFT were
 * written after most devices had already set the flag, so the game had
 * something to say and no way left to say it, and the only route back was
 * REPLAY OPENING in the menu, which you would have to already know about.
 *
 * Per line, a line added later is simply a line this device has not been told,
 * and one it has been told is never repeated. Held in memory as well, because
 * teach() asks this every frame.
 */
const LINES = 'sim7749-lines';
let _lines = null;

function loadLines() {
  if (_lines) return _lines;
  try {
    const raw = localStorage.getItem(LINES);
    _lines = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    _lines = new Set();
  }
  return _lines;
}

export function lineSeen(id) {
  return loadLines().has(id);
}

export function markLine(id) {
  const set = loadLines();
  if (set.has(id)) return;
  set.add(id);
  try {
    localStorage.setItem(LINES, JSON.stringify([...set]));
  } catch { /* private mode: it will offer the line again next launch */ }
}

export function forgetLines() {
  _lines = new Set();
  try {
    localStorage.removeItem(LINES);
  } catch { /* nothing to forget */ }
}

/**
 * The one-time move off the old flag.
 *
 * A device carrying `sim7749-taught` has been through an opening, but not
 * which one — there is no record of that to read. `ids` is what it is credited
 * with: the control lines, which have been in the opening since the first
 * build and are the ones nobody wants to sit through twice. Anything written
 * since is left unseen, which is the whole point of doing this at all.
 */
export function migrateLines(ids) {
  try {
    if (localStorage.getItem(LINES) !== null) return;
    if (localStorage.getItem(TAUGHT) !== '1') return;
    const set = loadLines();
    for (const id of ids) set.add(id);
    localStorage.setItem(LINES, JSON.stringify([...set]));
    localStorage.removeItem(TAUGHT);
    localStorage.removeItem(CLEARED); // dead since build 81; see the note above
  } catch { /* private mode: nothing was remembered to migrate */ }
}

