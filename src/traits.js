// Wave traits: one rule, applied to every hostile a wave releases.
//
// Past band 5 the ladder introduced nothing new -- the climb was carried by
// population, health and bounty, which are three ways of saying "more of the
// same". A trait is the fourth thing: the same wave, answered differently.
//
// Three rules hold this file together.
//
//   GREY IS HARMLESS. DRIFT and energy are never traited. The colour rule is
//   a promise about what can hurt you, and an ARMORED mote would break it.
//
//   A TRAIT NEVER RECOLOURS A TYPE. A BULWARK is a BULWARK whatever it is
//   carrying; the trait is said on the rail and in the shape of the fight,
//   never by repainting the body. Recolouring would put two meanings on one
//   channel, and the roster's colours already mean something.
//
//   SEEDED, NOT STORED. The trait is a pure function of the run's seed, the
//   cycle and the wave's place in it -- so the rail can show what is coming
//   before the wave exists, a save does not have to carry a list, and two
//   runs of the same seed are the same run.

import { CFG } from './config.js';

/**
 * The five, in a fixed order. The order IS the wire format: `traitAt` indexes
 * this array, so inserting one in the middle re-rolls every seeded run. Add to
 * the end.
 *
 * `glyph` is a short mark for the rail node -- monochrome, drawn in the rail's
 * own palette. See the note at the top on never recolouring a type.
 */
export const TRAITS = [
  {
    id: 'armored',
    name: 'ARMORED',
    glyph: '◧', // a half-filled square: the plate
    line: 'THE FIRST HIT EACH SECOND DOES NOTHING',
  },
  {
    id: 'swarm',
    name: 'SWARM',
    glyph: '∷', // four dots: many, and smaller
    line: 'TWICE AS MANY, HALF THE HEALTH',
  },
  {
    id: 'mending',
    name: 'MENDING',
    glyph: '⊕', // a cross in a circle
    line: 'IT CLOSES UNLESS YOU KEEP HITTING IT',
  },
  {
    id: 'tethered',
    name: 'TETHERED',
    glyph: '∞', // two joined
    line: 'PAIRS SHARE ONE POOL OF HEALTH',
  },
  {
    id: 'ebb',
    name: 'EBB',
    glyph: '⇡', // wreckage going the other way
    line: 'WRECKAGE GOES THE OTHER WAY',
  },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

/**
 * A small integer hash. Not cryptography and not trying to be: it has to be
 * stable across builds and devices, spread five ways, and never call
 * Math.random -- which would put a decorative roll into the per-wave path and
 * move ORDINAL's canonical hash, the way `spin` did before build 166.
 */
function mix(a, b, c) {
  let h = (a | 0) ^ ((b | 0) * 0x9e3779b1) ^ ((c | 0) * 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Which trait a given wave of a given run carries -- the whole of the rule.
 *
 * Pure, so the rail may ask about a wave that has not been loaded yet, and so
 * a restore lands on the same answer as the run that saved it.
 */
export function traitAt(runSeed, cycle, index, slot = 0) {
  return TRAITS[mix(runSeed, cycle * 977 + index, slot * 31 + 7) % TRAITS.length];
}

/**
 * How many traits a rung carries: none below `traitFrom`, one from there, two
 * from `traitPair`. Two is a different question rather than a harder one --
 * ARMORED SWARM is a wall of small things you cannot open, which neither is
 * on its own.
 */
export function traitCount(tier) {
  const T = CFG.waves.tier;
  if (tier < T.traitFrom) return 0;
  return tier >= T.traitPair ? 2 : 1;
}

/**
 * The traits a wave carries, as an array. Empty for a teach wave, for the
 * drift-only bonus wave (`asked === 0` -- there is nothing to apply a rule
 * to), and below `traitFrom`.
 *
 * Two traits are drawn from different slots and de-duplicated by walking the
 * list, so a pair is always two DIFFERENT rules rather than one twice.
 */
export function traitsFor(world, wave, tier, cycle, index) {
  if (!wave || wave.teach || !wave.of || !wave.of.length) return [];
  const n = traitCount(tier);
  if (!n) return [];
  const seed = world.runSeed | 0;
  const out = [traitAt(seed, cycle, index, 0)];
  for (let slot = 1; out.length < n && slot < 8; slot++) {
    const t = traitAt(seed, cycle, index, slot);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Whether a wave's traits include one, by id. Hot path: called per body. */
export function has(list, id) {
  if (!list || !list.length) return false;
  for (const t of list) if (t.id === id) return true;
  return false;
}
