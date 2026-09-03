// What the turret shoots with, in one table.
//
// A note on `tone`. It is read by hud.js and nothing else -- the strip, the
// loadout sheet and the upgrade cards -- so it is an interface colour, not a
// gameplay one. Rounds and mines are drawn from CFG.
//
// It used to be chosen per entry with nothing checking the set. Measured as
// CIE dE against a dark ground, ARC and RIME were 3.2 apart, BOLT and SPINE
// 9.1, STASIS and DECOY 1.0 -- five of the nine rounds sat inside a
// twenty-four degree band of pale blue. On a 1px rail at 26% opacity nobody
// could tell, and nobody had to; on a 170px card with a 40px icon they read
// as the same round twice. Every pair inside a branch now clears dE 25.
//
// Two surfaces read this: the strip across the bottom of the play screen,
// which is where it is chosen, and the menu's ARSENAL tab, which is where it
// is explained. An entry here buys both surfaces and no markup, and ROUND_KEYS
// and MINE_KEYS are read off it rather than written out again — the round's
// behaviour still needs CFG.rounds and the firing code.
//
// `kind` decides which handler a tap calls — 'round' is exclusive, 'auto' is a
// toggle. `group` decides where it sits: mines to the left of the two that run
// on their own, ammunition to the right of them.

import { svgMark } from './util.js';

/** The arsenal's marks are a hair heavier than the upgrade marks. */
const svg = (body, w = 1.8) => svgMark(body, w);

export const ICON = {
  // A charge that sits where it lands and goes off once, hard.
  blast: svg('<path d="M3 20h18"/><path d="M8 20a4 4 0 0 1 8 0"/><path d="M12 13.5V8M7.6 14.4 5.2 10.3M16.4 14.4l2.4-4.1"/>'),
  // The other kind: it opens instead of detonating.
  snare: svg('<circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14M7.1 7.1l9.8 9.8M16.9 7.1 7.1 16.9"/>', 1.5),
  // A line strung between two ends, and something caught on it.
  wire: svg('<path d="M2.5 12h19"/><path d="M4.5 8v8M19.5 8v8"/><path d="M12 8.4 10 12l2 3.6 2-3.6z" fill="currentColor" stroke="none"/>'),
  // A bell, not a shell: it rings rather than bursts, three times.
  knell: svg('<path d="M6 16.5c0-6 1.6-9.5 6-9.5s6 3.5 6 9.5z"/><path d="M4.4 16.5h15.2"/><circle cx="12" cy="19.4" r="1.6" fill="currentColor" stroke="none"/><path d="M12 7V4.2" opacity=".7"/>'),
  aim: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>'),
  fire: svg('<path d="M12 21.5V8"/><path d="M8.4 11.6 12 7.2l3.6 4.4"/><path d="M7 3.5h10" opacity=".65"/>'),
  // One round, nothing done to it.
  std: svg('<circle cx="12" cy="7.5" r="2.6" fill="currentColor" stroke="none"/><path d="M12 21.5V12"/>'),
  // It arrives and opens.
  he: svg('<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2"/>', 1.6),
  // Five, spreading.
  shot: svg('<path d="M12 21.5 7 10.5M12 21.5 9.8 9.5M12 21.5V9M12 21.5l2.2-12M12 21.5 17 10.5"/>', 1.6),
  // It does not stop at what it hit. A bolt reads at 13px; three dots and a
  // zigzag did not — it came out as a chevron.
  arc: svg('<path d="M13.6 2 5 13.4h5.6L9.8 22l8.6-11.4h-5.6z" fill="currentColor" stroke="none"/>'),
  // --- build 51: six more rounds ---
  // It does not stop at the first thing.
  spine: svg('<path d="M12 22V3.4"/><path d="M8.6 6.8 12 3.2l3.4 3.6"/><path d="M6.5 11h11M7.5 16h9" opacity=".55"/>'),
  // Heavy, blunt, and mostly momentum.
  slug: svg('<rect x="8" y="9" width="8" height="11" rx="1.4"/><path d="M8 9c0-3.4 1.8-5.4 4-5.4S16 5.6 16 9"/><path d="M4 20h16" opacity=".5"/>'),
  // Frost on whatever it touches.
  rime: svg('<path d="M12 2.6v18.8M3.9 7.3l16.2 9.4M20.1 7.3 3.9 16.7"/><path d="M12 6.2 9.8 4M12 6.2 14.2 4M12 17.8 9.8 20M12 17.8l2.2 2.2" opacity=".75"/>'),
  // It lands and keeps burning.
  spore: svg('<circle cx="12" cy="9.4" r="3.4"/><path d="M12 12.8V16"/><path d="M6 20c1.4-2.6 3.4-4 6-4s4.6 1.4 6 4"/><path d="M4.6 20h14.8" opacity=".6"/>'),
  // A mark that pays.
  tithe: svg('<path d="M12 3.2 20 8v8l-8 4.8L4 16V8z"/><path d="M12 8.4v7.2M9.4 10.4h5.2M9.4 13.6h5.2" opacity=".9"/>'),
  // --- build 51: four more mines ---
  // A burr that opens into ground you cannot stand on.
  thorn: svg('<circle cx="12" cy="12" r="2.6"/><path d="M12 9.4V4M12 14.6V20M9.4 12H4M14.6 12H20M9.9 9.9 6.2 6.2M14.1 9.9l3.7-3.7M9.9 14.1l-3.7 3.7M14.1 14.1l3.7 3.7"/>'),
  // Something with a field around it, pushing out.
  lode: svg('<circle cx="12" cy="12" r="3"/><path d="M12 8V4.2M9.9 6.3 12 4.2l2.1 2.1" opacity=".9"/><path d="M12 16v3.8M9.9 17.7 12 19.8l2.1-2.1" opacity=".9"/><path d="M8 12H4.2M6.3 9.9 4.2 12l2.1 2.1" opacity=".9"/><path d="M16 12h3.8M17.7 9.9 19.8 12l-2.1 2.1" opacity=".9"/>'),
  // A claymore: everything it has, one way.
  spall: svg('<path d="M5.6 18.6h12.8l-2-4.6H7.6z"/><path d="M12 11.4V3.6M8.4 11.4 6 4.6M15.6 11.4 18 4.6" opacity=".9"/>'),
  // A hole with nothing in it.
  voidmine: svg('<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/><path d="M12 3.4v2M12 18.6v2M3.4 12h2M18.6 12h2" opacity=".55"/>'),
};

/**
 * Strip order, left to right. Mines, then the two that run on their own, then
 * ammunition — so the things a hand reaches for during a fight sit at the two
 * ends and the two that are simply left on sit between them.
 *
 * Every round and every mine is described the same way and in the same order:
 * `dmg`, which is the number, and `fx`, which is the one thing it does that
 * nothing else does. Both are short on purpose. This table used to carry a
 * paragraph each — considered, quite good, and read by nobody choosing a
 * loadout mid-fight. A comparison is only useful if it can be made at a
 * glance, and a glance is what the loadout sheet gets.
 *
 * `dmg` is per hit unless it says otherwise: `/s` is per second of contact,
 * `x N` is that many pieces, `+ N` is what follows the impact. `none` means
 * the mine does no damage of its own, which for SNARE and LODE is the point.
 */
/*
 * Every `dmg` here is a literal, and six of them had gone stale.
 *
 * Build 216 put a tenth on every mine that does damage and build 218 took
 * SPINE from 20 to 34, and neither pass came back to this table -- so BLAST
 * read 95 against 105, WIRE 72 against 79, KNELL 74 against 81, THORN 34
 * against 37, SPALL's pellet 26 against 29 and SPINE 20 against 34. Three
 * surfaces read these strings (the loadout sheet, the quick strip and the
 * first-use caption), so a stale number is wrong in three places at once,
 * and the rack comparison that SET SPINE's 34 was argued against one of
 * them.
 *
 * `regress.mjs` checks every one of them against `CFG` now. If you retune a
 * number in config.js, this table is the second half of that change.
 */
export const ARSENAL = [
  {
    key: 'blast', kind: 'mine', group: 'mines', label: 'BLAST', icon: ICON.blast, tone: '#ffb247',
    dmg: '105', fx: 'Triggers on contact. One hard bang.',
  },
  {
    key: 'snare', kind: 'mine', group: 'mines', label: 'SNARE', icon: ICON.snare, tone: '#c77dff',
    dmg: 'no damage',
    fx: 'Pins a whole crowd where it stands, for 2.4s.',
  },
  {
    key: 'wire', kind: 'mine', group: 'mines', label: 'WIRE', icon: ICON.wire, tone: '#22ffcf',
    dmg: '79/s', fx: 'A line across the field. It cuts what crosses.',
  },
  {
    key: 'knell', kind: 'mine', group: 'mines', label: 'KNELL', icon: ICON.knell, tone: '#ff61f2',
    dmg: '81, twice', fx: 'Tolls where it lies, untouched, each one reaching further.',
  },
  {
    key: 'thorn', kind: 'mine', group: 'mines', label: 'THORN', icon: ICON.thorn, tone: '#c3eb4b',
    dmg: '37/s', fx: 'Opens into burning ground and stays open.',
  },
  {
    key: 'lode', kind: 'mine', group: 'mines', label: 'LODE', icon: ICON.lode, tone: '#3fb9ff',
    dmg: 'no damage',
    fx: 'Shoves everything near it away, and keeps on shoving.',
  },
  {
    key: 'spall', kind: 'mine', group: 'mines', label: 'SPALL', icon: ICON.spall, tone: '#ff4d4d',
    dmg: '29 x 14', fx: 'Throws a wall of shot straight up the field on contact.',
  },
  {
    key: 'void', kind: 'mine', group: 'mines', label: 'VOID', icon: ICON.voidmine, tone: '#7383ff',
    dmg: 'one kill',
    fx: 'The first thing to touch it is gone, whatever its health. An anomaly-s own structure is beyond it.',
  },

  {
    // `short` is what the strip cell says. The cell is 52px wide and the
    // full name at a readable size is 64: on the strip the icon carries the
    // AUTO half. Everywhere else -- OBJECTS, aria -- the full name stands.
    key: 'autoAim', kind: 'auto', group: 'auto', label: 'AUTO AIM', short: 'AIM', icon: ICON.aim, wide: true, run: true,
    fx: 'Picks the nearest target inside its reach and leads the shot. ARRAY extends the reach; your hand outranks all of it.',
  },
  {
    key: 'autoFire', kind: 'auto', group: 'auto', label: 'AUTO FIRE', short: 'FIRE', icon: ICON.fire, wide: true, run: true,
    fx: 'Keeps firing where the barrel points, at the rate you fire yourself.',
  },

  {
    key: 'standard', kind: 'round', group: 'ammo', label: 'BOLT', icon: ICON.std, tone: '#7aa2ff',
    dmg: '26', fx: 'The fastest cadence there is, and the only one that comes back off the arena walls.',
  },
  {
    key: 'explosive', kind: 'round', group: 'ammo', label: 'HE', icon: ICON.he, tone: '#ff5638',
    dmg: '15 + 44 blast', fx: 'Detonates on impact. Half the fire rate.',
  },
  /*
   * SHOT until build 184, and renamed because it was the same word as what the
   * FAN ability did and one letter from SLUG, which is a round of its own --
   * three names out of one family, two of them describing the same cone.
   *
   * `short` carries it on the strip. The stacks are budgeted at a fixed width
   * so the whole bar closes inside 320, and seven characters ran past the cell
   * border above 372px; every other surface with room -- the tree, the loadout
   * sheet, the codex, the first-use line -- says SCATTER.
   */
  {
    key: 'shotgun', kind: 'round', group: 'ammo', label: 'SCATTER', short: 'SPRAY', icon: ICON.shot, tone: '#ffc533',
    dmg: '12 x 5', fx: 'A tight cone that dies short. Close range only.',
  },
  {
    key: 'arc', kind: 'round', group: 'ammo', label: 'ARC', icon: ICON.arc, tone: '#ad73ff',
    dmg: '11, then 25 a jump', fx: 'The hit jumps to 4 more nearby, weaker each time.',
  },
  {
    key: 'spine', kind: 'round', group: 'ammo', label: 'SPINE', icon: ICON.spine, tone: '#ff6bce',
    dmg: '34, fading', fx: 'Punches through 3 more bodies and sprays splinters out of each.',
  },
  {
    key: 'slug', kind: 'round', group: 'ammo', label: 'SLUG', icon: ICON.slug, tone: '#c1cee0',
    dmg: '44', fx: 'Slow and heavy. Shoves things a very long way.',
  },
  {
    key: 'rime', kind: 'round', group: 'ammo', label: 'RIME', icon: ICON.rime, tone: '#4de1ff',
    dmg: '16', fx: 'Chills for 3.2s. What it touches loses most of its pace, and the harder it steers the more it keeps.',
  },
  {
    key: 'spore', kind: 'round', group: 'ammo', label: 'SPORE', icon: ICON.spore, tone: '#8eeb4b',
    dmg: '10 + 46/s', fx: 'Leaves burning ground where it bursts, for 4.5s. Three at a time.',
  },
  {
    key: 'tithe', kind: 'round', group: 'ammo', label: 'TITHE', icon: ICON.tithe, tone: '#40e693',
    dmg: '8, and rising', fx: 'Marks a body: each mark hurts it more, and all of them pay 3.5x.',
  },
];

/** Everything in the table, by key, because three surfaces look things up. */
export const ARM = new Map(ARSENAL.map((a) => [a.key, a]));

/**
 * The whole of an entry on one line, for the places that only have one: the
 * caption on first use and the card that hands the thing over. Same words as
 * the loadout sheet, in the same order, so nothing has to be read twice.
 */
export function specLine(key) {
  const a = ARM.get(key);
  if (!a) return '';
  const head = !a.dmg ? '' : a.dmg === 'none' ? 'No damage. ' : `DMG ${a.dmg}. `;
  return `${head}${a.fx}`;
}


/** Menu order: grouped, with the heading each group is filed under. */
export const ARSENAL_GROUPS = [
  { id: 'ammo', title: 'AMMUNITION', note: 'one at a time' },
  { id: 'mines', title: 'MINES', note: 'one kind at a time' },
  { id: 'auto', title: 'RUNNING', note: 'left on or left off' },
];

/**
 * The two rows every round and mine is now described by. Labelled, aligned and
 * in the same order every time, so two entries can be compared by looking down
 * a column rather than by reading two paragraphs.
 */
export function specRows(a) {
  const rows = [];
  if (a.dmg) rows.push(`<span class="spec dmg"><b>DMG</b><i>${a.dmg}</i></span>`);
  if (a.fx) rows.push(`<span class="spec"><b>FX</b><i>${a.fx}</i></span>`);
  return rows.join('');
}

