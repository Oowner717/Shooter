// What the large events hand out. Permanent for the run, gone on reset.
//
// Three axes, so a pick is an identity rather than a number: AMMO sharpens
// what you shoot, FIELD is what happens without you, TURRET is the machine.
// Every large event offers exactly one of each, so a run reads as a shape.
//
// Every effect here is a scalar on `world.up`, read at the point of use. That
// is the whole contract: nothing in this file reaches into a subsystem, and
// adding an upgrade is an entry plus one place that reads it.

/** Defaults. Anything not listed is off. */
import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { LOCKABLE, FIRST_USE } from './tutorial.js';

export function freshUpgrades() {
  return {
    // ammo
    damage: 1,
    rate: 1, // lower is faster; applied as a divisor
    speed: 1,
    bounces: 0,
    impulse: 1,
    blastR: 1,
    arcJumps: 0,
    recur: 0,
    salvo: 0, // every Nth shot fires three
    // field
    mineMax: 0,
    mineRate: 1,
    mineBlast: 1, // radius of a blast mine and of a knell's tolls
    mineTrigger: 1,
    sweep: 0, // seconds between the turret clearing behind itself
    reflex: false, // PULSE answers a crowd on the turret by itself
    intake: 1,
    cooldown: 1, // multiplier on every ability's cooldown
    // turret
    handsOff: false, // auto-fire at the manual cadence
    slew: 1,
    overwatch: 1, // damage while no hand is on the lever
    casing: 0, // damage a second to whatever is touching the turret
    insulation: 1, // multiplier on how much corruption costs the intake
    shrug: 0, // seconds between throwing attackers off
  };
}


/*
 * A mark per upgrade. The offer is read in the two seconds before a tap, and a
 * name is slower to recognise than a shape — especially for the repeatable
 * ones, where what matters is "the one I already have three of".
 */
const g = (body, w = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const MARK = {
  // --- ammo ---
  hollowpoint: g('<path d="M12 21V9"/><path d="M12 3 7.5 9.5h9z" fill="currentColor" stroke="none"/><path d="M18 18h4M20 16v4"/>'),
  hotload: g('<path d="M6 19.5 12 14l6 5.5M6 13 12 7.5 18 13M6 6.5 12 1.5 18 6.5" opacity=".55"/><path d="M6 19.5 12 14l6 5.5M6 13 12 7.5 18 13"/>'),
  tracer: g('<path d="M3 12h9"/><path d="M12.5 7.5 20 12l-7.5 4.5z" fill="currentColor" stroke="none"/><path d="M4 7.5h5M4 16.5h5" opacity=".5"/>'),
  ricochet: g('<path d="M3 3v18M21 3v18" opacity=".45"/><path d="M4 7l16 6-16 5"/>'),
  heavy: g('<rect x="13" y="8" width="8" height="8" rx="1"/><path d="M2 12h8"/><path d="M7 8.5 10.5 12 7 15.5"/>'),
  overpressure: g('<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" opacity=".6"/><circle cx="12" cy="12" r="9.6" opacity=".3"/>'),
  fifthlink: g('<circle cx="5" cy="17" r="2.2"/><circle cx="12" cy="8" r="2.2"/><circle cx="19" cy="16" r="2.2"/><path d="M6.4 15.3 10.6 9.8M13.5 9.5l4.2 4.7"/>'),
  fourthtime: g('<circle cx="4.5" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r="2.1" fill="currentColor" stroke="none" opacity=".7"/><circle cx="17.5" cy="12" r="2.1" fill="currentColor" stroke="none" opacity=".4"/>'),
  salvo: g('<path d="M5 21V7M12 21V4M19 21V7"/><path d="M2.6 9.4 5 7l2.4 2.4M9.6 6.4 12 4l2.4 2.4M16.6 9.4 19 7l2.4 2.4"/>'),
  // --- field ---
  deepmag: g('<ellipse cx="12" cy="7" rx="7.5" ry="2.8"/><path d="M4.5 7v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V7"/><path d="M4.5 12v5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-5"/>'),
  quicklay: g('<circle cx="15" cy="14" r="5"/><path d="M2 8h7M2 12h5M2 16h4" opacity=".7"/>'),
  // A charge going off wider than it used to: the same centre, one ring further.
  deepcharge: g('<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="9.4" stroke-dasharray="2.6 2.8"/><path d="M12 2.6v1.6M12 19.8v1.6M2.6 12h1.6M19.8 12h1.6" opacity=".7"/>'),
  widemouth: g('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="2.4 3"/>'),
  sweep: g('<path d="M12 4v7"/><path d="M8 11h8l1.5 5h-11z" fill="currentColor" stroke="none"/><path d="M3.5 15a9 9 0 0 0 17 0" stroke-dasharray="2.6 2.6"/>'),
  reflex: g('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M6.5 6.5a7.7 7.7 0 0 0 0 11M17.5 6.5a7.7 7.7 0 0 1 0 11" opacity=".6"/><path d="M13.5 2 10 7.5h4L10.5 13" />'),
  intake: g('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.5v4M9.8 4.6 12 6.9l2.2-2.3"/><path d="M12 21.5v-4M9.8 19.4 12 17.1l2.2 2.3"/><path d="M2.5 12h4M4.6 9.8 6.9 12l-2.3 2.2"/><path d="M21.5 12h-4M19.4 9.8 17.1 12l2.3 2.2"/>'),
  standing: g('<circle cx="12" cy="13" r="7.5"/><path d="M12 8.5V13l3 2"/><path d="M8.5 2.5h7" opacity=".6"/><path d="M17.5 20h4"/>'),
  // --- turret ---
  rate: g('<path d="M12 21V8"/><path d="M8.4 11.4 12 7l3.6 4.4"/><path d="M8.4 16.4 12 12l3.6 4.4" opacity=".5"/>'),
  handsoff: g('<path d="M12 21V8"/><path d="M8.4 11.4 12 7l3.6 4.4"/><circle cx="18" cy="18" r="4"/><path d="M15.2 20.8 20.8 15.2"/>'),
  slew: g('<path d="M4 16a8 8 0 0 1 16 0" stroke-dasharray="2.6 2.6"/><path d="M12 16V6"/><path d="M9 8.5 12 5.5l3 3"/><path d="M17 6.5l3 1.5-3 1.5" opacity=".7"/>'),
  overwatch: g('<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2"/>'),
  casing: g('<path d="M12 2.6 20 6v6.6c0 4.6-3.4 7.2-8 8.8-4.6-1.6-8-4.2-8-8.8V6z"/><path d="M12 8v8M8 12h8"/>'),
  insulation: g('<path d="M12 2.6 20 6v6.6c0 4.6-3.4 7.2-8 8.8-4.6-1.6-8-4.2-8-8.8V6z"/><path d="M7.5 12.5c1.6-2 3.4-2 4.5 0s2.9 2 4.5 0" opacity=".85"/>'),
  shrug: g('<circle cx="12" cy="12" r="3"/><path d="M12 8V3.6M9.8 5.8 12 3.5l2.2 2.3"/><path d="M12 16v4.4M9.8 18.2 12 20.5l2.2-2.3"/><path d="M8 12H3.6M5.8 9.8 3.5 12l2.3 2.2"/><path d="M16 12h4.4M18.2 9.8 20.5 12l-2.3 2.2"/>'),
};

const bump = (key, by) => (up) => { up[key] += by; };
const scale = (key, by) => (up) => { up[key] *= by; };
const set = (key, v) => (up) => { up[key] = v; };
/** Lower is faster, and repeats have to compound rather than run to zero. */
const quicken = (key, by) => (up) => { up[key] *= by; };

export const UPGRADES = {
  AMMO: [
    { id: 'hollowpoint', name: 'HOLLOWPOINT', line: '+25% damage.', apply: scale('damage', 1.25) , icon: MARK.hollowpoint },
    { id: 'hotload', name: 'HOT LOAD', line: '+15% fire rate.', apply: quicken('rate', 0.85) , icon: MARK.hotload },
    { id: 'tracer', name: 'TRACER', line: '+35% round speed.', apply: scale('speed', 1.35) , icon: MARK.tracer },
    { id: 'ricochet', name: 'RICOCHET', line: '+1 bounce off the arena edges.', apply: bump('bounces', 1) , icon: MARK.ricochet },
    { id: 'heavy', name: 'HEAVY', line: '2x knockback on every hit.', apply: scale('impulse', 2) , icon: MARK.heavy },
    { id: 'overpressure', name: 'OVERPRESSURE', line: '+40% HE blast radius.', apply: scale('blastR', 1.4) , icon: MARK.overpressure },
    { id: 'fifthlink', name: 'FIFTH LINK', line: 'ARC jumps 1 more time.', apply: bump('arcJumps', 1) , icon: MARK.fifthlink },
    { id: 'fourthtime', name: 'FOURTH TIME', line: 'RECUR repeats 1 more time.', apply: bump('recur', 1) , icon: MARK.fourthtime },
    { id: 'salvo', name: 'SALVO', line: 'Every 8th shot fires 3 rounds.', apply: set('salvo', 8) , icon: MARK.salvo },
  ],
  FIELD: [
    { id: 'deepmag', name: 'DEEP MAGAZINE', line: '+2 mines on the field at once.', apply: bump('mineMax', 2) , icon: MARK.deepmag },
    { id: 'quicklay', name: 'QUICK LAY', line: '+30% mine lay speed.', apply: quicken('mineRate', 0.7) , icon: MARK.quicklay },
    { id: 'deepcharge', name: 'DEEP CHARGE', line: '+35% mine blast radius.', apply: scale('mineBlast', 1.35) , icon: MARK.deepcharge },
    { id: 'widemouth', name: 'WIDE MOUTH', line: '+40% mine trigger range.', apply: scale('mineTrigger', 1.4) , icon: MARK.widemouth },
    { id: 'sweep', name: 'SWEEP', line: 'Turret blasts behind itself every 20s.', apply: set('sweep', 20) , icon: MARK.sweep },
    { id: 'reflex', name: 'REFLEX', line: 'PULSE fires itself when 2+ objects grip you.', apply: set('reflex', true) , icon: MARK.reflex },
    { id: 'intake', name: 'INTAKE', line: '+50% salvage pickup range.', apply: scale('intake', 1.5) , icon: MARK.intake },
    { id: 'standing', name: 'STANDING ORDER', line: '-20% ability cooldowns.', apply: quicken('cooldown', 0.8) , icon: MARK.standing },
  ],
  TURRET: [
    { id: 'rate', name: 'RATE', line: '+20% fire rate.', apply: quicken('rate', 0.8) , icon: MARK.rate },
    { id: 'handsoff', name: 'HANDS OFF', line: 'Auto fire matches your own fire rate.', apply: set('handsOff', true) , icon: MARK.handsoff },
    { id: 'slew', name: 'SLEW', line: '+50% auto aim turn speed.', apply: scale('slew', 1.5) , icon: MARK.slew },
    { id: 'overwatch', name: 'OVERWATCH', line: '+25% damage while hands off the lever.', apply: scale('overwatch', 1.25) , icon: MARK.overwatch },
    { id: 'casing', name: 'HARD CASING', line: 'Objects touching you take 40 damage a second.', apply: bump('casing', 40) , icon: MARK.casing },
    { id: 'insulation', name: 'INSULATION', line: 'Corruption costs half as much salvage.', apply: scale('insulation', 0.5) , icon: MARK.insulation },
    { id: 'shrug', name: 'SHRUG', line: 'Throws objects off the turret every 15s.', apply: set('shrug', 15) , icon: MARK.shrug },
  ],
};

export const AXES = ['AMMO', 'FIELD', 'TURRET'];

/*
 * The other two kinds of permanent thing an AMENDMENT can be. They are not
 * axes — a card is one of these or one of the three above — but they are what
 * the tier is mostly for now: the turret starts with BOLT and PULSE, and every
 * other round, mine and ability is bought here.
 */

/** The mark for a locked thing is the mark it will have once it is unlocked. */
const armIcon = (key) => (ARSENAL.find((a) => a.key === key) || {}).icon
  || (ABILITIES.find((a) => a.id === key) || {}).icon
  || '';

const armName = (key) => (ARSENAL.find((a) => a.key === key) || {}).label
  || (ABILITIES.find((a) => a.id === key) || {}).name
  || key.toUpperCase();

/**
 * One card per locked thing, carrying the same sentence the caption will give
 * on first use — the card that hands you a round and the caption that greets
 * you using it say the same thing, so neither has to be read twice.
 */
export const UNLOCKS = Object.values(LOCKABLE).flat().map((key) => ({
  id: `open_${key}`,
  key,
  axis: 'UNLOCK',
  name: armName(key),
  // The caption's own name prefix comes off — the card already has the name in
  // its heading — and its authored line break with it, because a card is one
  // paragraph and not two lines.
  line: (FIRST_USE[key] || '').replace(/^[A-Z ]+\. /, '').replace(/\s+/g, ' '),
  icon: armIcon(key),
  apply: (up, world) => {
    world.unlocked.add(key);
    // A round or a mine goes onto the strip if there is a free cell for it.
    // The game does the placing, because it also has to rebuild the strip.
    if (world.carry) world.carry(key);
  },
}));

/**
 * A second use of one ability, held in hand. Only ever offered for an ability
 * that has actually been unlocked, and only once each — offering a charge for
 * something the player has never seen is a card that cannot be read.
 */
export const CHARGES = ABILITIES.map((a) => ({
  id: `charge_${a.id}`,
  key: a.id,
  axis: 'CHARGE',
  name: `${a.name} x2`,
  line: 'Hold a second use of it, ready before the wait.',
  icon: a.icon,
  apply: (up, world) => { world.abilities.grantCharge(a.id); },
}));

/** Everything, flat, for the tests and the record. */
export const ALL_UPGRADES = AXES.flatMap((a) => UPGRADES[a].map((u) => ({ ...u, axis: a })));

/**
 * One from each axis. An upgrade that cannot stack is not offered twice; the
 * repeatable ones can come round again, which is what makes a long run able to
 * lean rather than merely collect.
 */
const ONCE = new Set(['salvo', 'sweep', 'reflex', 'handsoff']);

const pick = (pool) => (pool.length ? pool[(Math.random() * pool.length) | 0] : null);

/** The stat upgrades, one axis at a time, skipping what is already spent. */
const statPool = (taken, axis) =>
  UPGRADES[axis].filter((u) => !(ONCE.has(u.id) && taken.includes(u.id))).map((u) => ({ ...u, axis }));

/**
 * Three cards. While anything is still locked the first of them opens
 * something, because that is the spine of a run: the turret arrives with two
 * things and everything else is a choice made on the way. The second is a
 * second use of an ability once there is an ability worth doubling, and the
 * third is always a stat. Each falls through to a stat when its own pool is
 * empty, and the three are never the same card twice.
 */
export function rollLarge(taken, world) {
  const held = new Set(taken);
  const unlocked = world && world.unlocked ? world.unlocked : new Set();
  const out = [];
  const add = (u) => { if (u && !out.some((o) => o.id === u.id)) out.push(u); };

  add(pick(UNLOCKS.filter((u) => !unlocked.has(u.key))));
  add(pick(CHARGES.filter((c) => unlocked.has(c.key) && !held.has(c.id))));

  // Whatever is still missing comes off the stat table, one axis at a time so
  // three stat cards are never three of the same kind.
  const axes = [...AXES].sort(() => Math.random() - 0.5);
  for (const axis of axes) {
    if (out.length >= 3) break;
    add(pick(statPool(taken, axis).filter((u) => !out.some((o) => o.id === u.id))));
  }
  return out;
}
