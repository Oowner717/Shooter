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

import { ARSENAL, specLine } from './arsenal.js';

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
  // The first wave is grey and nothing else — CFG.WAVES[0] is drift with no
  // hostiles at all, and it dwells long enough for both of these to be read
  // while the only thing on the field is the thing they are about. Said here
  // rather than in NOTES because NOTES are gated on the count and a DRIFT does
  // not raise it: a player who only ever shot drift would never reach them.
  // Says the rule, not just this object: grey is a promise the whole field
  // keeps, and it is worth more to a player as a rule than as one fact.
  { text: 'The grey ones are DRIFT.\nGrey is always harmless. Nothing grey can hurt you.' },
  { text: 'AUTO AIM ignores them. Shoot one\nyourself \u2014 they hold extra ENERGY.' },
];

/**
 * And these, spread across the count, about the three things the run gives
 * back. Each is said where it can be pointed at rather than described:
 * CFG.events.smallFirst exists so there is a real ALLOCATION on the button by
 * the time the second one is read.
 */
const NOTES = [
  // Said the moment there is energy on the floor to point at. Two lines
  // rather than one because they answer three questions a new player has in
  // the same few seconds — is that thing dangerous, why is it moving toward
  // me, and what am I supposed to do about it. No, it is coming to you, and
  // PULSE takes it in. The INTAKE upgrade is what eventually removes the third.
  { at: 1, text: 'Broken objects leave ENERGY.\nIt is not an enemy. It drifts to you.' },
  { at: 2, text: 'PULSE takes in the energy near you.\nENERGY is the green number.' },
  { at: 20, text: 'ALLOCATION is waiting. Three offered, one taken.\nIt keeps. Open it whenever you want it.' },
  { at: 44, text: 'An AMENDMENT is the permanent one.\nNew rounds, new mines, new abilities.' },
  { at: 120, text: 'Everything you are not carrying is still out there.\nThe offers are how you get it.' },
];

/*
 * A line's id is its text. Two consequences, both wanted: a line added later is
 * a line this device has not been told, and a line whose wording changes is a
 * new line too — which is right, because the reason to change it was that the
 * old one said something else.
 */
const idOf = (text) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

export const SCRIPT = [...OPENING, ...NOTES]
  .map((e) => ({ ...e, id: idOf(e.text), hold: holdFor(e.text) }));

/*
 * What a device carrying the old `sim7749-taught` flag is credited with having
 * heard. The four control lines: they have opened the game since the first
 * build, they are the ones nobody wants to sit through twice, and they are the
 * only ones anything can honestly be assumed about. Everything written after
 * them — the two about DRIFT among them — is left unheard, because for most
 * devices carrying that flag it genuinely is.
 */
export const CONTROL_LINES = SCRIPT.slice(0, 4).map((e) => e.id);

/**
 * What each thing says the first time it is used. One sentence about what it
 * does — no story, and nothing that leans on a mechanic not yet met. These are
 * also the lines the unlock offers carry, so the card that hands you a round
 * and the caption that greets you using it say the same thing.
 */
const ABILITY_USE = {
  pulse: 'PULSE. Hurts and shoves what is near you,\nand takes in the energy on the floor.',
  fan: 'FAN. Twenty-five pellets in one tight cone.',
  lance: 'LANCE. A beam through the biggest thing out there.',
  well: 'WELL. Drags everything into a knot, then collapses it.',
  prism: 'PRISM. A shell that bursts, then beams every way.',
  stasis: 'STASIS. Objects stop. Your shots do not.',
  decoy: 'DECOY. A turret that is not yours. They go there.',
  chorus: 'CHORUS. Ties the field together.\nWhatever kills one hurts the rest.',
};

/**
 * Rounds, mines and the two that run on their own say exactly what the loadout
 * sheet says about them, with the name in front — one source for the number
 * and the one line, so the card that hands it over, the caption that greets
 * you using it and the sheet you compare it on can never drift apart.
 */
export const FIRST_USE = {
  ...Object.fromEntries(ARSENAL.map((a) => [a.key, `${a.label}. ${specLine(a.key)}`])),
  ...ABILITY_USE,
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
  rounds: ['explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  mines: ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'],
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
