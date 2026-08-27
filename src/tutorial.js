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

/**
 * Seconds a line of n words needs: a beat to notice it, then reading pace.
 *
 * It was `2 + words / 3` -- a beat and 180wpm -- and that is the pace you read
 * prose you have never seen at. These are not prose: they are one sentence
 * about a button, most of them naming the button in their first word, and the
 * player is looking at the thing while they read about it. 1.5 + words / 3.6
 * is about 215wpm after a slightly shorter beat, which takes a twelve-word
 * line from six seconds to under five.
 *
 * The length was never the whole complaint though. See MIN_READ and the
 * queue in Hud.showHint: the real cost of these was four of them arriving in
 * three seconds and shoving each other off the band unread.
 */
export function holdFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return 1.5 + words / 3.6;
}

/**
 * How long a line has to have been up before a tap may take it away.
 *
 * Acting on a line is the best evidence there is that it has been read, so
 * playing dismisses it -- but a tap in the same instant it appears is a tap
 * that was already on its way, and would take the line away before it was
 * seen.
 */
export const MIN_READ = 1.1;

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
 * And these, spread across the count, about what the run gives back. Each is
 * said where it can be pointed at rather than described.
 */
const NOTES = [
  // Said the moment there is energy on the floor to point at. Two lines
  // rather than one because they answer three questions a new player has in
  // the same few seconds — is that thing dangerous, why is it moving toward
  // me, and what am I supposed to do about it. No, it is coming to you, and
  // PULSE takes it in. The INTAKE upgrade is what eventually removes the third.
  { at: 1, text: 'Broken objects leave ENERGY.\nIt is not an enemy. It drifts to you.' },
  { at: 2, text: 'PULSE takes in the energy near you.\nENERGY is the green number.' },
  /*
   * The three lines that were here described ALLOCATION and AMENDMENT -- three
   * cards, one taken -- and neither exists. AMENDMENT went in build 83 and its
   * line outlived it by eighty builds, telling every new player about a thing
   * the game had not had for a year. What is left points at the one place
   * everything is actually bought.
   */
  { at: 20, text: 'ENERGY buys everything.\nTap the green number to spend it.' },
  { at: 120, text: 'Everything you are not carrying is still out there.\nIt is all in UPGRADES, and none of it expires.' },
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
 * Said the first time corruption actually happens, rather than at a point in
 * the count.
 *
 * Every other line in here is paced by the clock or gated on kills, and
 * neither works for this one: something can grab the turret in the first ten
 * seconds or not for two minutes, and a paragraph about what it costs is worth
 * nothing unless something is holding on while it is read.
 *
 * The numbers are the point, and they are the real ones — CFG.energy.tax is
 * 0.78 per attached object, compounding, floored at CFG.energy.taxFloor with
 * CFG.energy.taxCap objects counted. So one costs 22% of what you bank, two
 * 39%, three 53%, five 70%, and past five nothing more. The feed's break-up
 * tops out at three (CFG.glitch: 0.34 each, capped at 0.92).
 */
export const ON_CONTACT = [
  /*
   * The first line used to end "It stops when you destroy it", which is true
   * and useless: the barrel cannot point at something sitting on its own
   * mount, which is the entire reason PULSE exists and the reason ORDINAL
   * can never take it away. So the player was told to destroy a thing and
   * not told the one tool in the game that can. It names PULSE now, and the
   * button itself pulses for as long as anything is attached -- see the
   * `.ab.urgent` block in styles.css, which is the half of this that keeps
   * working on a device that heard these lines a year ago.
   */
  'CORRUPTION. Something is holding the turret.\nThe barrel cannot reach it. PULSE can.',
  'It cannot kill you. Each one taxes what you bank:\none costs 22%, two 39%, three 53%, five 70%.',
].map((text) => ({ id: idOf(text), text, hold: holdFor(text) }));

/*
 * ...and if it is still there a while later, said again.
 *
 * Everything else in this file is once per device and that is right for it:
 * a line about a control you have already used is a line nobody wants twice.
 * This one is different, because being stuck is a state and not an event. A
 * player who never worked out what PULSE was for gets the opening lines once,
 * months ago, and then nothing at all -- so the game watches for the shape of
 * being stuck (something attached, for a while, and PULSE not pressed) and
 * says the one sentence that ends it. Repeatable, on a long leash, and it
 * stops for good the moment they use it.
 */
export const STILL_HELD = {
  after: 9, // seconds of being held before it says anything
  again: 45, // ...and the shortest gap between two of them
  text: 'PULSE shoves off whatever is holding you.\nIt is the flashing button. It is always yours.',
};

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
 * also the lines the tree carries, so the card that sells you a round and
 * the caption that greets you using it say the same thing.
 */
const ABILITY_USE = {
  // Not an ability: AUTO AIM's third position, which needs its own sentence
  // because it is the one assist that stops defending you.
  aimDrift: 'AUTO AIM: DRIFT. It takes grey and nothing else.\nIt is not watching the field while it does.',
  aimAll: 'AUTO AIM: ALL. Grey and hostile together.\nThere is nothing left to tell it.',
  pulse: 'PULSE. Hurts and shoves what is near you,\nand takes in the energy on the floor.',
  fan: 'HAIL. Twenty-five pellets in one tight cone.',
  lance: 'LANCE. A beam through the biggest thing out there.',
  well: 'WELL. Drags everything into a knot, then collapses it.',
  prism: 'PRISM. A shell that bursts, then beams every way.',
  stasis: 'STASIS. Objects stop. Your shots do not.',
  decoy: 'DECOY. A turret that is not yours. They go there.',
  spiral: 'SPIRAL. The barrel comes off its target\nand turns, firing all the way round.',
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
 * PULSE shoves and HAIL kills, so the pair is a way to answer a crowd and a way
 * to remove one — a turret that opens with only PULSE has nothing it can point
 * at anything. The two that run on their own come with it because they are not
 * power: they are the difference between playing this with a thumb on the
 * lever and leaving it running, and which of those a session is should be the
 * player's to choose from the first minute rather than something bought
 * later. Both start switched off.
 */
export const STARTING = ['standard', 'pulse', 'fan', 'autoAim', 'autoFire'];

/** Rounds, mines and abilities, in the order the tree lists them. */
export const LOCKABLE = {
  rounds: ['explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  mines: ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'],
  abilities: ['lance', 'well', 'prism', 'stasis', 'decoy', 'spiral'],
};

/** Everything the run can ever hand over, for the debug panel and the tests. */
export const ALL_KEYS = [...STARTING, ...Object.values(LOCKABLE).flat()];

/**
 * The quiet after a line has had its time, before the next one is said. Short,
 * but it is the difference between being told things and being buried.
 */
export const GAP = 0.7;

/**
 * How many lines the band keeps. The newest is at the bottom.
 *
 * One, from build 182. Two was written for the opening, where a line you have
 * just acted on is worth still having in view -- but every line is two rows of
 * text, so two of them is four rows of the field covered, and the band is over
 * the play area. It is also what made a burst of presses unreadable: the
 * second line pushed the first up and the third pushed it off, at whatever
 * speed the player happened to be tapping. The queue holds them now instead,
 * so nothing is lost by only showing one.
 */
export const STACK = 1;

/** When the first line is said, in seconds from the start of the run. */
export const START = 1.2;
