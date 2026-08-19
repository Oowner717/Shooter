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
    line: 'Three plates orbit it and eat what you send. Take the plates first.',
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
    id: 'drift',
    name: 'DRIFT',
    line: 'No heading, no destination, no threat. It is not counted. It is here so the field is not only enemies.',
  },
  {
    id: 'ordinal',
    name: 'ORDINAL',
    boss: true,
    line: 'Wore your five hundred and would not hand them back. Not the hardest thing they have — the first one.',
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

/**
 * Whether ORDINAL has been beaten. Kept the same way the glossary is, because
 * it answers the same kind of question: what has this player already seen?
 * Every run after the first clear is endless — no count, no boss, no ending.
 */
const CLEARED = 'sim7749-cleared';

export function cleared() {
  try {
    return localStorage.getItem(CLEARED) === '1';
  } catch {
    return false;
  }
}

export function markCleared() {
  try {
    localStorage.setItem(CLEARED, '1');
  } catch {
    /* private mode: this run stays counted, which is the safe way to fail */
  }
}

export function forgetCleared() {
  try {
    localStorage.removeItem(CLEARED);
  } catch { /* nothing to forget */ }
}

/**
 * Whether the opening has been walked through once. The first run hands the
 * interface over a piece at a time; every run after it starts with all of it,
 * because being taught the same nineteen things twice is not teaching.
 */
const TAUGHT = 'sim7749-taught';

export function taught() {
  try {
    return localStorage.getItem(TAUGHT) === '1';
  } catch {
    return false;
  }
}

export function markTaught() {
  try {
    localStorage.setItem(TAUGHT, '1');
  } catch {
    /* private mode: the run that is open keeps its unlocks either way */
  }
}

export function forgetTaught() {
  try {
    localStorage.removeItem(TAUGHT);
  } catch { /* nothing to forget */ }
}
