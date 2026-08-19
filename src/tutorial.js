// What the game says about itself, and when.
//
// It used to be a ladder: nineteen controls handed over on a timer, each with
// a sentence, all inside the first two minutes. That put the whole manual in
// the opening and left the rest of the run silent.
//
// Now almost nothing is said up front. The turret starts with BOLT and PULSE
// and nothing else; every other round, mine and ability is a permanent upgrade,
// taken from the offer that comes round every so often. A thing explains itself
// the first time it is *used* — which is minutes after it was unlocked, and
// only if the player actually reaches for it. The teaching is spread across
// the whole run because the run hands things over across the whole run.

/** Seconds a line of n words needs: a beat to notice it, then about 180wpm. */
export function holdFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return 2 + words / 3;
}

/**
 * The opening, over an empty field. Four lines and then it stops talking: the
 * grip, the shot, the one button that is always yours, and what is coming.
 */
const OPENING = [
  { text: 'Swing the grip under the turret.\nThe barrel goes the other way.' },
  { text: 'Or tap ahead of the turret\nand it shoots there.' },
  { text: 'PULSE is under your thumb.\nNothing can ever take it from you.' },
  { text: 'Something is coming down now.\nNone of it can kill you.' },
];

/**
 * And these, spread across the count, about the three things the run gives
 * back. Each is said where it can be pointed at rather than described:
 * CFG.events.smallFirst exists so there is a real ALLOCATION on the button by
 * the time the second one is read.
 */
const NOTES = [
  { at: 2, text: 'The green number is SALVAGE.\nEverything you break gives some up.' },
  { at: 20, text: 'ALLOCATION is waiting. Three offered, one taken.\nIt keeps. Open it whenever you want it.' },
  { at: 44, text: 'An AMENDMENT is the permanent one.\nNew rounds, new mines, new abilities.' },
  { at: 120, text: 'Everything you are not carrying is still out there.\nThe offers are how you get it.' },
];

export const SCRIPT = [...OPENING, ...NOTES].map((e) => ({ ...e, hold: holdFor(e.text) }));

/**
 * What each thing says the first time it is used. One sentence about what it
 * does — no story, and nothing that leans on a mechanic not yet met. These are
 * also the lines the unlock offers carry, so the card that hands you a round
 * and the caption that greets you using it say the same thing.
 */
export const FIRST_USE = {
  standard: 'BOLT. Plain, and the fastest thing you can fire.',
  explosive: 'HE. Blows up where it lands. Slower to fire.',
  shotgun: 'SHOT. Five pellets. Close range only.',
  arc: 'ARC. The hit jumps on to the next thing, four times.',
  recur: 'RECUR. The shot happens three more times, further down.',

  blast: 'BLAST. Mines lay themselves. This one bangs once, hard.',
  snare: 'SNARE. Never goes off. It pins a crowd in place.',
  wire: 'WIRE. A line across the field. It cuts what crosses.',
  knell: 'KNELL. Waits for nothing. Goes off three times.',

  autoAim: 'AUTO AIM. It picks a target and leads the shot.',
  autoFire: 'AUTO FIRE. It keeps shooting where the barrel points.',

  pulse: 'PULSE. A shockwave. Shoves everything away from you.',
  fan: 'FAN. Twenty-five pellets in one tight cone.',
  lance: 'LANCE. A beam through the biggest thing out there.',
  well: 'WELL. Drags everything into a knot, then collapses it.',
  prism: 'PRISM. A shell that bursts, then beams every way.',
  stasis: 'STASIS. Objects stop. Your shots do not.',
  decoy: 'DECOY. A turret that is not yours. They go there.',
  chorus: 'CHORUS. Ties the field together.\nWhatever kills one hurts the rest.',
};

/**
 * What the turret is issued with. Everything else is bought.
 *
 * PULSE shoves and FAN kills, so the pair is a way to answer a crowd and a way
 * to remove one — a turret that opens with only PULSE has nothing it can point
 * at anything. The two that run on their own come with it because they are not
 * power: they are the difference between playing this with a thumb on the
 * lever and leaving it running, and which of those a session is should be the
 * player's to choose from the first minute rather than something the offers
 * eventually get round to. Both start switched off.
 */
export const STARTING = ['standard', 'pulse', 'fan', 'autoAim', 'autoFire'];

/** Rounds, mines and abilities, in the order the offers hand them out. */
export const LOCKABLE = {
  rounds: ['explosive', 'shotgun', 'arc', 'recur'],
  mines: ['blast', 'snare', 'wire', 'knell'],
  abilities: ['lance', 'well', 'prism', 'stasis', 'decoy', 'chorus'],
};

/** Everything the run can ever hand over, for the debug panel and the tests. */
export const ALL_KEYS = [...STARTING, ...Object.values(LOCKABLE).flat()];

/**
 * The quiet after a line has had its time, before the next one is said. Short,
 * but it is the difference between being told things and being buried.
 */
export const GAP = 0.7;

/** How many lines the band keeps. The newest is at the bottom. */
export const STACK = 2;

/** When the first line is said, in seconds from the start of the run. */
export const START = 1.2;
