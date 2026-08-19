// The first run, and only the first run.
//
// Everything is on screen from the start and almost none of it works. The
// buttons are visible because the shape of the interface is part of what is
// being taught — you should be able to see there are four mines before you
// have any of them — and they are sealed because a wall of nineteen controls
// handed over at once is not an introduction, it is a manual.
//
// It is one ordered script. Some entries only say something; the rest hand a
// control over and say what it is. PULSE comes first, before there is anything
// to use it on: it is the one thing that can never be taken away, and having
// it from the start is the first fact about the game. Then ammunition, then
// mines, then the two that run on their own, then the rest of the abilities.
//
// PACING. The count cannot pace this. Objects die slowly at first and very
// fast later, so a script keyed only on kills hands out its hardest lines at
// its quickest moment — measured at build 35, KNELL had 0.71s on screen for
// eleven words. So an entry needs two things: enough objects destroyed, and
// enough time for the line before it to have been read. The clock is what
// actually governs, and it is sized to the sentence. The opening entries ask
// for nothing at all, so they run over the empty field before the first
// object has been released.

/** Seconds a line of n words needs: a beat to notice it, then about 180wpm. */
export function holdFor(text) {
  const words = String(text).trim().split(/\s+/).length;
  return 2 + words / 3;
}

/**
 * The script. `text` is always said. `key` hands a control over. `at` is the
 * count it waits for, and defaults to none — an entry with no `at` is paced by
 * the clock alone, which is how the opening runs on an empty field.
 */
const SCRIPT = [
  { text: 'Swing the grip under the turret.\nThe barrel goes the other way.' },
  { text: 'Or tap ahead of the turret\nand it shoots there.' },

  // Before anything is coming. It costs nothing to fire at an empty field, and
  // knowing it is there changes how the next ten minutes feel.
  { key: 'pulse', text: 'PULSE. A shockwave that shoves everything away.\nNothing can ever take this one from you.' },
  { key: 'standard', text: 'BOLT. Plain, and the fastest thing you can fire.' },

  { text: 'Something is coming down now.\nNone of it can kill you.' },
  { text: 'It only breaks up what you see through.\nFive hundred of them, and none is the point.' },

  { key: 'explosive', at: 2, text: 'HE. Blows up where it lands. Slower to fire.' },
  { key: 'shotgun', at: 5, text: 'SHOT. Five pellets. Close range only.' },
  { key: 'arc', at: 8, text: 'ARC. The hit jumps on to the next thing, four times.' },
  { key: 'recur', at: 11, text: 'RECUR. The shot happens three more times, further down.' },

  { key: 'blast', at: 14, text: 'BLAST. Mines lay themselves. This one bangs once, hard.' },
  { key: 'snare', at: 17, text: 'SNARE. Never goes off. It pins a crowd in place.' },
  { key: 'wire', at: 20, text: 'WIRE. A line across the field. It cuts what crosses.' },
  { key: 'knell', at: 23, text: 'KNELL. Waits for nothing. Goes off three times.' },

  { key: 'autoAim', at: 26, text: 'AUTO AIM. It picks a target and leads the shot.' },
  { key: 'autoFire', at: 29, text: 'AUTO FIRE. It keeps shooting where the barrel points.' },

  { key: 'fan', at: 32, text: 'FAN. Twenty-five pellets in one tight cone.' },
  { key: 'lance', at: 35, text: 'LANCE. A beam through the biggest thing out there.' },
  { key: 'well', at: 38, text: 'WELL. Drags everything into a knot, then collapses it.' },
  { key: 'prism', at: 41, text: 'PRISM. A shell that bursts, then beams every way.' },
  { key: 'stasis', at: 44, text: 'STASIS. Objects stop. Your shots do not.' },
  { key: 'decoy', at: 47, text: 'DECOY. A turret that is not yours. They go there.' },
  { key: 'siphon', at: 50, text: 'SIPHON. Hauls the wreckage in and throws it back.' },

  { at: 56, text: 'That is all of it.\nThe rest of the run is yours.' },
];

export const TUTORIAL = SCRIPT.map((e) => ({ ...e, hold: holdFor(e.text) }));

/**
 * The quiet after a line has had its time, before the next thing opens. Short,
 * but it is the difference between being handed things and being buried.
 */
export const GAP = 0.7;

/**
 * Acting on a line is proof it was read. A player who taps the thing they were
 * just given does not sit through the rest of its hold — the wait shortens to
 * this instead, so someone engaged is moved along and someone passive still
 * gets the whole sentence. The line itself stays up either way; it is pushed
 * up the band by the next one rather than taken away.
 */
export const ACK = 1.4;

/** How many lines the band keeps. The newest is at the bottom. */
export const STACK = 2;

/** When the first line is said, in seconds from the start of the run. */
export const START = 1.2;

/** Everything the script ever hands over, for the runs that skip it. */
export const ALL_KEYS = SCRIPT.filter((e) => e.key).map((e) => e.key);
