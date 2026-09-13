// The glossary, and the record of what has been seen.
//
// Entries unlock the first time you destroy one — the boss included — and the
// record survives a reset, because it was never yours: it is kept by whoever
// has been counting. Descriptions are field notes in the same voice as the
// story: flat, observed, second person where it helps, never a tutorial.

import { ANOMALIES } from './anomaly.js';
import { soak } from './ledger.js';

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
    /*
     * ---- both figures in this line were wrong, and had been for a while ---
     *
     * It said "Worth 10 ENERGY against a MOTE's 4". `CFG.energy.drift` -- the
     * flat amount a harmless body is paid, and it IS flat, `bank()` takes it
     * instead of the mass worth -- has been 6, not 10; and a MOTE's "4" was
     * its `drops`, which is the NUMBER of motes it sheds and not what they
     * are worth. Measured off the config: a DRIFT pays 6.00 kB and a MOTE
     * 2.64 kB from its own mass. Rather than write two fresh numbers that can
     * go stale the same way, the line states the RATIO, which is what the
     * sentence was always about.
     */
    line: 'No heading, no destination, no threat. It is not counted, and AUTO AIM will not take it — a DRIFT is only ever shot on purpose. It is worth more than twice a MOTE, which is the reason to bother.',
  },
  {
    id: 'ember',
    name: 'EMBER',
    // The ratio, not a figure: `drops` and what a mote is worth both come off
    // the config, and DRIFT's line cost a build for quoting two numbers that
    // had gone stale. What the sentence is about is that it is leaving.
    line: 'Comes up off the floor instead of down out of the portal, and climbs for the rim with a little salvage in it. Not counted, not a threat, and gone in a few seconds with whatever it was carrying.',
  },
  {
    id: 'husk',
    name: 'HUSK',
    /*
     * ---- "the largest single payout" was FALSE and shipped in build 307 ----
     *
     * docs/objects.html says it and this line repeated it. Measured off the
     * code: a harmless body pays `drops` motes at the `minValue` floor plus
     * the flat `CFG.energy.drift`, so a HUSK is 12 + 6 = 18 kB -- against a
     * BULWARK's 112 kB and a boss core's 264 to 792. It is the largest among
     * the HARMLESS bodies, and only until LANTERN's 22 kB. Same fault as
     * DRIFT's old "worth 10 ENERGY against a MOTE's 4": a figure quoted in
     * prose rots, so the sentence states the comparison it was always about.
     */
    line: 'A wreck of something this simulation ran before, thrown across the field end over end. It wants nothing and it is leaving. Nothing else you can ignore is worth as much.',
  },
  {
    id: 'lantern',
    name: 'LANTERN',
    // No figure: what it is carrying is `drops`, and what that is worth moves
    // with the config. The sentence is the clock and the bill.
    line: 'Caged salvage on its way back out through the portal, climbing for the rim on a clock you can watch. It will not touch you and it does not have to: reach the rim and it takes the lot with it. The one harmless body worth a magazine.',
  },
  {
    id: 'filament',
    name: 'FILAMENT',
    line: 'Seven beads nose to tail, each following the one in front. It wants nothing from you and blocks nothing. Cut it anywhere and you have two shorter snakes, both still going, and the shape of what is left is different every time.',
  },
  {
    id: 'bell',
    name: 'BELL',
    line: 'Hangs in the middle band and bobs, and wants nothing. Break it and for a couple of seconds every object on the field shows you where it is going -- through a corrupted feed, which is exactly when you need it. One round, one harmless kill, and the only shot you take to see better rather than to break something.',
  },
  {
    id: 'spindle',
    name: 'SPINDLE',
    line: 'A bar turning end over end as it comes, and the only thing on the field that is not the same size from every angle. Broadside it is the widest target you will meet; edge-on it is thinner than a NEEDLE, and a round goes past it. Automatic fire will spend about half of itself on the edge. A thumb does not have to.',
  },
  {
    id: 'shoal',
    name: 'SHOAL',
    line: 'Fourteen at once, with no leader and nothing to break. They steer at each other and at you, so the school turns as one thing and closes whatever gap you make in it. A bolt takes one of fourteen; anything with a radius takes the school. It is the field telling you that aiming is not always the answer.',
  },
  {
    id: 'quarry',
    name: 'QUARRY',
    line: 'One body that is nine, and the lines it will break along are already drawn on it. Each generation is smaller, faster and thinner-plated than the one it came out of, and nothing it does is aimed at you -- it takes no lane, crosses the field, turns off the walls and spins the whole way. Where you break it is the decision: high and the pieces have the field to spread in, low and they are already on the mount.',
  },
  {
    id: 'axiom',
    name: 'AXIOM',
    line: 'It states a rule and holds you to it. Nothing you carry is yours while its clauses stand.',
  },
  {
    id: 'clause',
    name: 'CLAUSE',
    line: 'One of your buttons, held shut. Break it and you have that much of yourself back.',
  },
  {
    id: 'lemma',
    name: 'LEMMA',
    line: 'A small argument in support of a larger one. It exists to keep you off the clause that sent it.',
  },
  {
    id: 'tessera',
    name: 'TESSERA',
    line: 'It does not come to you and it does not have to. It lays the ground between you and it, one tile at a time.',
  },
  {
    id: 'tile',
    name: 'TILE',
    line: 'Laid ground. Nothing you fire crosses it while it is down, and it has no interest in you at all.',
  },
  {
    id: 'shard',
    name: 'SHARD',
    line: 'What comes off a tile you have taken. Cutting the corridor is not free.',
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
const ANOMALY_IDS = new Set(ANOMALIES.flatMap((a) => a.types));

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
  // The bench's lifetime record. Progress rather than comfort, so it goes the
  // way the glossary goes and not the way the volume does.
  soak.forget();
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

