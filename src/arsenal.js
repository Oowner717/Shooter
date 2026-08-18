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
  barb: svg('<path d="M12 22V3.5"/><path d="m12 3.5-3.1 3.6M12 3.5l3.1 3.6M12 9.4l-3.1 3.6M12 9.4l3.1 3.6M12 15.3l-3.1 3.6M12 15.3l3.1 3.6"/>', 1.6),
};

/**
 * Strip order, left to right. Mines, then the two that run on their own, then
 * ammunition — so the things a hand reaches for during a fight sit at the two
 * ends and the two that are simply left on sit between them.
 */
export const ARSENAL = [
  {
    key: 'autoMine', kind: 'auto', group: 'mines', label: 'BLAST', icon: ICON.blast, tone: '#ffb347',
    line: 'Lobbed onto a random patch every few seconds. Completely inert in flight and only arms where it settles. Drift never sets one off. One hard bang.',
  },
  {
    key: 'autoSnare', kind: 'auto', group: 'mines', label: 'SNARE', icon: ICON.snare, tone: '#c77dff',
    line: 'The other kind, and it does not go off. It opens, hauls everything near it into one pinned knot and holds it there. No damage of its own — the damage is what you put into a pile that cannot move.',
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
    key: 'standard', kind: 'round', group: 'ammo', label: 'STD', icon: ICON.std,
    line: 'Nothing done to it, and the fastest cadence there is. Everything else buys its trick with rate of fire.',
  },
  {
    key: 'explosive', kind: 'round', group: 'ammo', label: 'HE', icon: ICON.he,
    line: 'Detonates on impact. Costs better than half your rate of fire and travels slower, so single targets are no easier — crowds are.',
  },
  {
    key: 'shotgun', kind: 'round', group: 'ammo', label: 'SHOT', icon: ICON.shot,
    line: 'Five pellets a shot in a tight cone. They expire well short of the top of the field: devastating up close, useless at range.',
  },
  {
    key: 'arc', kind: 'round', group: 'ammo', label: 'ARC', icon: ICON.arc,
    line: 'The weakest thing you can load on impact and the strongest through a crowd. The hit jumps to the nearest thing it has not touched, up to four links, each a little weaker. Poor against anything standing on its own.',
  },
  {
    key: 'barb', kind: 'round', group: 'ammo', label: 'BARB', icon: ICON.barb,
    line: 'Almost nothing when it lands — it sinks in and starts biting, and a body will hold four at once. The slowest cadence of anything, so it is wasted on a mote and made for what takes a while.',
  },
];

/** Menu order: grouped, with the heading each group is filed under. */
export const ARSENAL_GROUPS = [
  { id: 'ammo', title: 'AMMUNITION', note: 'one at a time' },
  { id: 'mines', title: 'MINES', note: 'laid on their own' },
  { id: 'auto', title: 'RUNNING', note: 'left on or left off' },
];
