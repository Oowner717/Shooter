// The first run, and only the first run.
//
// Everything is on screen from the start and almost none of it works. The
// buttons are visible because the shape of the interface is part of what is
// being taught — you should be able to see there are four mines before you
// have any of them — and they are sealed because a wall of nineteen controls
// handed over at once is not an introduction, it is a manual.
//
// They open one at a time, each with one line. Ammunition first, then mines,
// then the two that run on their own, then the abilities, which is
// deliberately last: by the time they arrive the turret is already looking
// after itself, and abilities are the part you are meant to be doing by hand.
//
// PACING. The count alone cannot pace this. Objects die slowly at first and
// very fast later, so a ladder keyed only on kills hands out its hardest
// lines at its quickest moment — measured at build 35, KNELL had 0.71s on
// screen for eleven words, and fifteen of twenty-three lines were gone before
// they could be read. So an unlock needs two things: enough objects
// destroyed, and enough time for the line before it to have been read. The
// second one is what actually governs, and it is sized to the sentence.

/** Seconds a line of n words needs: a beat to notice it, then about 180wpm. */
export function holdFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return 2 + words / 3;
}

/**
 * Said over the opening field. Spaced by their own reading time, so no line is
 * ever cut off by the next one. The field is empty to start and the first
 * objects arrive part way through, which is where the third line wants to be.
 */
const INTRO_LINES = [
  'Swing the grip under the turret.\nThe barrel goes the other way.',
  'Or tap ahead of the turret\nand it shoots there.',
  'Nothing coming down can kill you.\nIt only breaks up what you see through.',
  'Five hundred of them.\nNone of them is the point.',
];

export const INTRO = (() => {
  let t = 1.2;
  return INTRO_LINES.map((text) => {
    const at = t;
    t += holdFor(text);
    return [at, text];
  });
})();

/** When the last intro line has had its time. The ladder waits for this. */
export const INTRO_ENDS = INTRO[INTRO.length - 1][0]
  + holdFor(INTRO_LINES[INTRO_LINES.length - 1]);

/**
 * Unlocks, in order. `key` is a strip key or an ability id; `at` is the count
 * it opens on. Every line is one sentence about what the thing does and
 * nothing else — no story, and nothing that leans on a mechanic the player has
 * not met yet.
 */
const STEPS = [
  ['standard', 'BOLT. Plain, and the fastest thing you can fire.'],
  ['explosive', 'HE. Blows up where it lands. Slower to fire.'],
  ['shotgun', 'SHOT. Five pellets. Close range only.'],
  ['arc', 'ARC. The hit jumps on to the next thing, four times.'],
  ['recur', 'RECUR. The shot happens three more times, further down.'],

  ['blast', 'BLAST. Mines lay themselves. This one bangs once, hard.'],
  ['snare', 'SNARE. Never goes off. It pins a crowd in place.'],
  ['wire', 'WIRE. A line across the field. It cuts what crosses.'],
  ['knell', 'KNELL. Waits for nothing. Goes off three times.'],

  ['autoAim', 'AUTO AIM. It picks a target and leads the shot.'],
  ['autoFire', 'AUTO FIRE. It keeps shooting where the barrel points.'],

  ['pulse', 'PULSE. A shockwave. Shoves everything away from you.'],
  ['fan', 'FAN. Twenty-five pellets in one tight cone.'],
  ['lance', 'LANCE. A beam through the biggest thing out there.'],
  ['well', 'WELL. Drags everything into a knot, then collapses it.'],
  ['prism', 'PRISM. A shell that bursts, then beams every way.'],
  ['stasis', 'STASIS. Objects stop. Your shots do not.'],
  ['decoy', 'DECOY. A turret that is not yours. They go there.'],
  ['siphon', 'SIPHON. Hauls the wreckage in and throws it back.'],
];

const FIRST = 2; // objects destroyed before the first thing opens
const EVERY = 3; // and between each one after it

export const TUTORIAL = STEPS.map(([key, text], i) => ({
  key, text, at: FIRST + i * EVERY, hold: holdFor(text),
}));

/**
 * The quiet after a line has had its time, before the next thing opens. Short,
 * but it is the difference between being handed things and being buried.
 */
export const GAP = 0.7;

/**
 * Acting on a line is proof it was read. A player who taps the thing they were
 * just given does not sit through the rest of its hold — it shortens to this
 * instead, so someone engaged is moved along and someone passive still gets
 * the whole sentence.
 */
export const ACK = 1.4;

/** One line after the last of them, and the run stops teaching. */
export const OUTRO = {
  at: FIRST + (STEPS.length - 1) * EVERY + 4,
  text: 'That is all of it.\nThe rest of the run is yours.',
};

/** Everything the tutorial ever hands over, for the runs that skip it. */
export const ALL_KEYS = STEPS.map(([key]) => key);
