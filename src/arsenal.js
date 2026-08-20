// What the turret shoots with, in one table.
//
// Two surfaces read this: the strip across the bottom of the play screen,
// which is where it is chosen, and the menu's ARSENAL tab, which is where it
// is explained. An entry here buys both surfaces and no markup — the round's
// behaviour still needs CFG.rounds, ROUND_KEYS and the firing code.
//
// `kind` decides which handler a tap calls — 'round' is exclusive, 'auto' is a
// toggle. `group` decides where it sits: mines to the left of the two that run
// on their own, ammunition to the right of them.

const svg = (body, w = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

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
  // It stays in.
  // The same shot, three places down the same line.
  recur: svg('<circle cx="12" cy="4.5" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="2.2" fill="currentColor" stroke="none" opacity=".72"/><circle cx="12" cy="18.5" r="2.2" fill="currentColor" stroke="none" opacity=".45"/>'),
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
  // Plating opened.
  sunder: svg('<path d="M12 2.6 20 6v6.6c0 4.6-3.4 7.2-8 8.8-4.6-1.6-8-4.2-8-8.8V6z"/><path d="M13.6 5.4 9.6 12h4.4l-3.8 6.4" fill="none"/>'),
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
 */
export const ARSENAL = [
  {
    key: 'blast', kind: 'mine', group: 'mines', label: 'BLAST', icon: ICON.blast, tone: '#ffb347',
    line: 'Lobbed onto a random patch every few seconds. Completely inert in flight and only arms where it settles. Drift never sets one off. One hard bang.',
  },
  {
    key: 'snare', kind: 'mine', group: 'mines', label: 'SNARE', icon: ICON.snare, tone: '#c77dff',
    line: 'It does not go off. It opens, hauls everything near it into one pinned knot and holds it there. No damage of its own — the damage is what you put into a pile that cannot move.',
  },
  {
    key: 'wire', kind: 'mine', group: 'mines', label: 'WIRE', icon: ICON.wire, tone: '#7cffb2',
    line: 'The only one that is not a point. It unspools a taut line across the field and cuts whatever crosses it, for as long as that thing stays on it. Nothing triggers it, nothing uses it up and it does not expire: it is a lane closed for good, or until the cap pushes it off for a newer one.',
  },
  {
    key: 'knell', kind: 'mine', group: 'mines', label: 'KNELL', icon: ICON.knell, tone: '#ff5d8f',
    line: 'It does not wait to be touched. It counts, and then it goes off three times where it lies, each wider and weaker than the last. BLAST punishes what walks into it; this denies the ground whether anything is there or not.',
  },  {
    key: 'thorn', kind: 'mine', group: 'mines', label: 'THORN', icon: ICON.thorn, tone: '#9be89b',
    line: 'Not a charge. It opens into a patch of burning ground and stays open — nothing triggers it and nothing uses it up, and anything standing on it is being hurt the whole time it stands there.',
  },
  {
    key: 'lode', kind: 'mine', group: 'mines', label: 'LODE', icon: ICON.lode, tone: '#59e0ff',
    line: 'Does no damage and cannot be triggered. It pushes, constantly, and everything in reach is walking uphill. For making a lane, or for holding a crowd off while something else does the work.',
  },
  {
    key: 'spall', kind: 'mine', group: 'mines', label: 'SPALL', icon: ICON.spall, tone: '#ffd166',
    line: 'A claymore. It triggers like a blast mine and throws everything it has in one direction instead of all of them: straight up the field, into whatever is coming down it.',
  },
  {
    key: 'void', kind: 'mine', group: 'mines', label: 'VOID', icon: ICON.voidmine, tone: '#b388ff',
    line: 'One thing, whatever it is, gone. It does not care about armour or health or size, and it only ever does it once. The answer to the single object a run cannot otherwise get through.',
  },

  {
    key: 'autoAim', kind: 'auto', group: 'auto', label: 'AUTO AIM', icon: ICON.aim, wide: true, run: true,
    line: 'Tracks whatever is corrupting the feed, leads the shot for flight time and swings at its own rate. Your hand on the lever outranks it.',
  },
  {
    key: 'autoFire', kind: 'auto', group: 'auto', label: 'AUTO FIRE', icon: ICON.fire, wide: true, run: true,
    line: 'Keeps shooting wherever the barrel happens to point. A shade slower than working the lever yourself, so playing is still worth it.',
  },
  {
    key: 'standard', kind: 'round', group: 'ammo', label: 'BOLT', icon: ICON.std, tone: '#bff4ff',
    line: 'Nothing done to it, and the fastest cadence there is. Everything else buys its trick with rate of fire.',
  },
  {
    key: 'explosive', kind: 'round', group: 'ammo', label: 'HE', icon: ICON.he, tone: '#ff9f5c',
    line: 'Detonates on impact. Costs better than half your rate of fire and travels slower, so single targets are no easier — crowds are.',
  },
  {
    key: 'shotgun', kind: 'round', group: 'ammo', label: 'SHOT', icon: ICON.shot, tone: '#ffd9a0',
    line: 'Five pellets a shot in a tight cone. They expire well short of the top of the field: devastating up close, useless at range.',
  },
  {
    key: 'arc', kind: 'round', group: 'ammo', label: 'ARC', icon: ICON.arc, tone: '#9be7ff',
    line: 'The weakest thing you can load on impact and the strongest through a crowd. The hit jumps to the nearest thing it has not touched, up to four links, each a little weaker. Poor against anything standing on its own.',
  },
  {
    key: 'recur', kind: 'round', group: 'ammo', label: 'RECUR', icon: ICON.recur, tone: '#c9b6ff',
    line: 'The shot happens again. Whatever it lands on, a moment later it is a little further along the same line, still travelling the way it was, three times over and weaker each time. Wasted on anything standing on its own; devastating down the length of a column.',
  },  {
    key: 'spine', kind: 'round', group: 'ammo', label: 'SPINE', icon: ICON.spine, tone: '#d8f1ff',
    line: 'It does not stop at what it hits. Straight through and on to whatever was standing behind it, a little weaker each time. Worth exactly as much as you can line up.',
  },
  {
    key: 'slug', kind: 'round', group: 'ammo', label: 'SLUG', icon: ICON.slug, tone: '#b8c6d8',
    line: 'Barely hurts anything. It moves things: back up the field, off the turret, into each other. The field is a physics problem first, and this is the round that treats it as one.',
  },
  {
    key: 'rime', kind: 'round', group: 'ammo', label: 'RIME', icon: ICON.rime, tone: '#8fe3ff',
    line: 'Drags whatever it touches down to a crawl for a few seconds. It kills nothing by itself. It buys the time for everything else to.',
  },
  {
    key: 'spore', kind: 'round', group: 'ammo', label: 'SPORE', icon: ICON.spore, tone: '#9be89b',
    line: 'Bursts into a patch of ground that keeps burning after the shot is over. The only round you fire where something is going to be rather than where it is.',
  },
  {
    key: 'tithe', kind: 'round', group: 'ammo', label: 'TITHE', icon: ICON.tithe, tone: '#7cffb2',
    line: 'Almost harmless. It marks a body instead, and a marked body pays several times over whenever it finally comes apart — by your hand or anyone else\u2019s.',
  },
  {
    key: 'sunder', kind: 'round', group: 'ammo', label: 'SUNDER', icon: ICON.sunder, tone: '#ffb0d8',
    line: 'Opens a body\u2019s plating. For a while everything lands harder on it, including everything that is not this round. For the things armour makes tedious, and worthless against the things it does not.',
  },

];

/** Menu order: grouped, with the heading each group is filed under. */
export const ARSENAL_GROUPS = [
  { id: 'ammo', title: 'AMMUNITION', note: 'one at a time' },
  { id: 'mines', title: 'MINES', note: 'one kind at a time' },
  { id: 'auto', title: 'RUNNING', note: 'left on or left off' },
];
