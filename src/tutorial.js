// The first run, and only the first run.
//
// Everything is on screen from the start and almost none of it works. The
// buttons are visible because the shape of the interface is part of what is
// being taught — you should be able to see there are four mines before you
// have any of them — and they are sealed because a wall of nineteen controls
// handed over at once is not an introduction, it is a manual.
//
// They open one at a time as the count climbs, each with one line. Ammunition
// first, then mines, then the two that run on their own, then the abilities,
// which is deliberately last: by the time they arrive the turret is already
// looking after itself, and abilities are the part you are meant to be doing
// by hand.

/** Said over the empty field before anything falls. Seconds from the start. */
export const INTRO = [
  [1.2, 'Swing the grip under the turret.\nThe barrel goes the other way.'],
  [4.8, 'Or tap ahead of the turret\nand it shoots there.'],
  [8.4, 'Nothing coming down can kill you.\nIt can only break up what you see through.'],
  [12.0, 'Five hundred of them.\nNone of them is the point.'],
];

/**
 * Unlocks, in order, keyed on the count. `key` is a strip key or an ability
 * id; `at` is the kill it opens on.
 */
const STEPS = [
  ['standard', 'BOLT. Nothing done to it, and the fastest cadence you have.'],
  ['explosive', 'HE. Detonates where it lands. Half the rate of fire.'],
  ['shotgun', 'SHOT. Five pellets, close in. Useless at range.'],
  ['arc', 'ARC. The hit jumps on to the next thing, four times.'],
  ['recur', 'RECUR. The shot happens again, further down the same line.'],

  ['blast', 'BLAST. Mines lay themselves. This one goes off once, hard.'],
  ['snare', 'SNARE. It does not go off. It pins a crowd and holds it.'],
  ['wire', 'WIRE. A line across the field. Whatever crosses it is cut.'],
  ['knell', 'KNELL. Nothing has to touch it. It goes off three times.'],

  ['autoAim', 'AUTO AIM. It picks a target and leads the shot for you.'],
  ['autoFire', 'AUTO FIRE. It keeps shooting wherever the barrel points.'],

  ['pulse', 'PULSE. A shove in every direction. Nothing can take this one.'],
  ['fan', 'FAN. Everything the turret has, all at once.'],
  ['lance', 'LANCE. One shot straight through a whole column.'],
  ['well', 'WELL. Drags the field into a knot, then collapses it.'],
  ['prism', 'PRISM. A shell that breaks and leaves in every direction.'],
  ['stasis', 'STASIS. Objects stop. Your rounds do not.'],
  ['decoy', 'DECOY. A turret that is not yours. They walk to it instead.'],
  ['siphon', 'SIPHON. Hauls the wreckage off the floor and throws it back.'],
];

const FIRST = 2; // kills before the first thing opens
const EVERY = 3; // and between each one after it

export const TUTORIAL = STEPS.map(([key, text], i) => ({
  key, text, at: FIRST + i * EVERY,
}));

/** One line after the last of them, at the count the run stops teaching. */
export const OUTRO = {
  at: FIRST + (STEPS.length - 1) * EVERY + 4,
  text: 'That is all of it.\nThe rest of the run is yours.',
};

/** Everything the tutorial ever hands over, for the runs that skip it. */
export const ALL_KEYS = STEPS.map(([key]) => key);
