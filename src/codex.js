// The glossary, and the record of what has been seen.
//
// Entries unlock the first time you destroy one — the boss included — and the
// record survives a reset, because it was never yours: it is kept by whoever
// has been counting. Descriptions are field notes in the same voice as the
// story: flat, observed, second person where it helps, never a tutorial.

import { ANOMALIES } from './anomaly.js';

const KEY = 'sim7749-codex';

/*
 * Two categories, and the split is derived rather than written down.
 *
 * ANOMALIES.types is each boss's own roster -- the boss first, then what it
 * makes -- so `ANOMALY_IDS` is the authority on which entries belong to a
 * boss and the glossary cannot drift from the fights. Everything else is the
 * field: what comes down on its own, and what those break into.
 */
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
    id: 'ordinal',
    name: 'ORDINAL',
    line: 'It has been counting since before you arrived. The frame is the count; the thing in the middle is what has been keeping it.',
  },
  {
    id: 'tally',
    name: 'TALLY',
    line: 'One segment of the count. Five strokes, and it goes out on the fifth.',
  },
  {
    id: 'digit',
    name: 'DIGIT',
    line: 'Garrisoned, not built in. It was only ever waiting for a door.',
  },
  {
    id: 'gnomon',
    name: 'GNOMON',
    line: 'It does not count you, it times you. The dial is the hour; the needle throws the shadow; the shadow is the only wall it ever really had.',
  },
  {
    id: 'dial',
    name: 'DIAL',
    line: 'One arc of the face. The hours cut into it go out as it does.',
  },
  {
    id: 'second',
    name: 'SECOND',
    line: 'It waited behind an hour for the hour to break. Nothing about the dial governs it now.',
  },
  {
    id: 'fractal',
    name: 'FRACTAL',
    line: 'It does not have parts, it has generations. Break one and you have not removed anything — you have let it go.',
  },
  {
    id: 'fraction',
    name: 'FRACTION',
    line: 'The middle of three. Armour on one side, and on the other, three things that were only ever waiting to be loose.',
  },
  {
    id: 'mite',
    name: 'MITE',
    line: 'The smallest part it believes in, which is not the same as the smallest part there is.',
  },
  {
    id: 'amplitude',
    name: 'AMPLITUDE',
    line: 'It has no middle. It is a period, and the head is only the part of it that arrives first.',
  },
  {
    id: 'crest',
    name: 'CREST',
    line: 'One segment of the wave. Break enough of them and what is left swings higher — it leans in as it loses.',
  },
  {
    id: 'droplet',
    name: 'DROPLET',
    line: 'Thrown off the top of the wave, from the part of it furthest from you.',
  },
  {
    id: 'dynamo',
    name: 'DYNAMO',
    line: 'It is never anywhere for long. While the circuit is closed it is armoured by its own legs; take those away and it stops needing the ground.',
  },
  {
    id: 'pylon',
    name: 'PYLON',
    line: 'One leg of the circuit. What it carries is not power, it is cover.',
  },
  {
    id: 'ion',
    name: 'ION',
    line: 'It travels the wire before it travels the field. You can see where it will be long before it is there.',
  },
  {
    id: 'parity',
    name: 'PARITY',
    line: 'Two halves of one account, and only ever one of them is real. Which one is a question it answers on a clock.',
  },
  {
    id: 'pane',
    name: 'PANE',
    line: 'A face of the mirror. It has a twin, and they go together — which is generous, and is paying for something.',
  },
  {
    id: 'echo',
    name: 'ECHO',
    line: 'There is always another one of these. Looking for it is how you find out which side of the line you are on.',
  },
  /*
   * TERMINUS and its two. They were missing entirely -- the seventh boss and
   * the only two things it puts on the field had no entries at all, which
   * nothing noticed while the glossary was one undivided list of thirty-four.
   * Splitting it into the field and the anomalies made a boss-shaped hole
   * obvious at once.
   */
  {
    id: 'terminus',
    name: 'TERMINUS',
    line: 'The last of them, and the only one that never throws anything. It closes instead: the room gets smaller until there is no room.',
  },
  {
    id: 'bound',
    name: 'BOUND',
    line: 'One segment of the boundary. The ring it belongs to is closed, so the only way through it is out.',
  },
  {
    id: 'limit',
    name: 'LIMIT',
    line: 'It comes in off a corner of the frame and walks. Nothing sent it; it was always going to arrive.',
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

/** Every id any anomaly puts on the field, boss included. */
export const ANOMALY_IDS = new Set(ANOMALIES.flatMap((a) => a.types));

/** The glossary in two halves: what the field sends, and what a boss makes. */
export const FIELD_ENTRIES = CODEX.filter((e) => !ANOMALY_IDS.has(e.id));
export const ANOMALY_ENTRIES = CODEX.filter((e) => ANOMALY_IDS.has(e.id));

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

/**
 * Every trace of this player, gone: the glossary, every line already said, and
 * the two dead keys the migration would otherwise have to find later. What
 * RESET SIMULATION means — the next launch is a first launch.
 *
 * The volume is deliberately not here. It is a comfort setting rather than
 * progress, and a reset that unmutes a phone at midnight is a worse thing to
 * do to someone than a volume that outlives their run.
 */
export function forgetPlayer() {
  codex.forget();
  forgetLines();
  try {
    // forget() leaves an empty record behind; a device that has never been
    // opened has no record at all, and that is what this is meant to look
    // like. The next thing destroyed writes it again.
    localStorage.removeItem(KEY);
    localStorage.removeItem(TAUGHT);
    localStorage.removeItem(CLEARED);
  } catch { /* nothing to forget */ }
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

