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
    mineLife: 1,
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

const bump = (key, by) => (up) => { up[key] += by; };
const scale = (key, by) => (up) => { up[key] *= by; };
const set = (key, v) => (up) => { up[key] = v; };
/** Lower is faster, and repeats have to compound rather than run to zero. */
const quicken = (key, by) => (up) => { up[key] *= by; };

export const UPGRADES = {
  AMMO: [
    { id: 'hollowpoint', name: 'HOLLOWPOINT', line: '+25% damage.', apply: scale('damage', 1.25) },
    { id: 'hotload', name: 'HOT LOAD', line: '+15% fire rate.', apply: quicken('rate', 0.85) },
    { id: 'tracer', name: 'TRACER', line: '+35% round speed.', apply: scale('speed', 1.35) },
    { id: 'ricochet', name: 'RICOCHET', line: '+1 bounce off the arena edges.', apply: bump('bounces', 1) },
    { id: 'heavy', name: 'HEAVY', line: '2x knockback on every hit.', apply: scale('impulse', 2) },
    { id: 'overpressure', name: 'OVERPRESSURE', line: '+40% HE blast radius.', apply: scale('blastR', 1.4) },
    { id: 'fifthlink', name: 'FIFTH LINK', line: 'ARC jumps 1 more time.', apply: bump('arcJumps', 1) },
    { id: 'fourthtime', name: 'FOURTH TIME', line: 'RECUR repeats 1 more time.', apply: bump('recur', 1) },
    { id: 'salvo', name: 'SALVO', line: 'Every 8th shot fires 3 rounds.', apply: set('salvo', 8) },
  ],
  FIELD: [
    { id: 'deepmag', name: 'DEEP MAGAZINE', line: '+1 mine on the field at once.', apply: bump('mineMax', 1) },
    { id: 'quicklay', name: 'QUICK LAY', line: '+30% mine lay speed.', apply: quicken('mineRate', 0.7) },
    { id: 'longfuse', name: 'LONG FUSE', line: '+50% mine lifetime.', apply: scale('mineLife', 1.5) },
    { id: 'widemouth', name: 'WIDE MOUTH', line: '+40% mine trigger range.', apply: scale('mineTrigger', 1.4) },
    { id: 'sweep', name: 'SWEEP', line: 'Turret blasts behind itself every 20s.', apply: set('sweep', 20) },
    { id: 'reflex', name: 'REFLEX', line: 'PULSE fires itself when 2+ objects grip you.', apply: set('reflex', true) },
    { id: 'intake', name: 'INTAKE', line: '+50% salvage pickup range.', apply: scale('intake', 1.5) },
    { id: 'standing', name: 'STANDING ORDER', line: '-20% ability cooldowns.', apply: quicken('cooldown', 0.8) },
  ],
  TURRET: [
    { id: 'rate', name: 'RATE', line: '+20% fire rate.', apply: quicken('rate', 0.8) },
    { id: 'handsoff', name: 'HANDS OFF', line: 'Auto fire matches your own fire rate.', apply: set('handsOff', true) },
    { id: 'slew', name: 'SLEW', line: '+50% auto aim turn speed.', apply: scale('slew', 1.5) },
    { id: 'overwatch', name: 'OVERWATCH', line: '+25% damage while hands off the lever.', apply: scale('overwatch', 1.25) },
    { id: 'casing', name: 'HARD CASING', line: 'Objects touching you take 40 damage a second.', apply: bump('casing', 40) },
    { id: 'insulation', name: 'INSULATION', line: 'Corruption costs half as much salvage.', apply: scale('insulation', 0.5) },
    { id: 'shrug', name: 'SHRUG', line: 'Throws objects off the turret every 15s.', apply: set('shrug', 15) },
  ],
};

export const AXES = ['AMMO', 'FIELD', 'TURRET'];

/** Everything, flat, for the tests and the record. */
export const ALL_UPGRADES = AXES.flatMap((a) => UPGRADES[a].map((u) => ({ ...u, axis: a })));

/**
 * One from each axis. An upgrade that cannot stack is not offered twice; the
 * repeatable ones can come round again, which is what makes a long run able to
 * lean rather than merely collect.
 */
export function rollLarge(taken) {
  const once = new Set(['salvo', 'sweep', 'reflex', 'handsoff']);
  return AXES.map((axis) => {
    const pool = UPGRADES[axis].filter((u) => !(once.has(u.id) && taken.includes(u.id)));
    if (!pool.length) return null;
    return { ...pool[(Math.random() * pool.length) | 0], axis };
  }).filter(Boolean);
}
