// What is on the strip, as opposed to what the turret owns.
//
// Owning a round and having it under your thumb used to be the same thing,
// because there were exactly as many rounds as there were cells. That stops
// being true the moment there is a sixth round, so the two are separated here:
// `world.unlocked` is everything bought, and the loadout is the handful of it
// that the strip actually shows.
//
// The slot count is fixed. The strip is sized to the band between the lever's
// grip and the ability bar, and that band does not grow because the arsenal
// did — a longer strip would be a strip in the way of the lever.

import { ARSENAL } from './arsenal.js';

/** Cells per stack. Not a balance number: it is how many fit beside the lever. */
export const SLOTS = { mines: 4, ammo: 5 };

/** Which stack a key belongs in, or null if it is not a strip thing at all. */
export function groupOf(key) {
  const a = ARSENAL.find((x) => x.key === key);
  return a && (a.group === 'mines' || a.group === 'ammo') ? a.group : null;
}

export function freshLoadout() {
  return {
    mines: Array(SLOTS.mines).fill(null),
    ammo: Array(SLOTS.ammo).fill(null),
  };
}

export function slotOf(loadout, key) {
  const g = groupOf(key);
  return g ? loadout[g].indexOf(key) : -1;
}

export function carried(loadout, key) {
  return slotOf(loadout, key) >= 0;
}

/** Room for one more of that kind? */
export function freeSlot(loadout, group) {
  return loadout[group] ? loadout[group].indexOf(null) : -1;
}

/**
 * Put a key in the first free slot of its own stack.
 * @returns the slot index, or -1 if it is already carried or there is no room.
 *   A full stack is not an error: the thing is owned either way, and swapping
 *   something out for it is a decision that belongs to the player.
 */
export function place(loadout, key) {
  const g = groupOf(key);
  if (!g || carried(loadout, key)) return -1;
  const i = freeSlot(loadout, g);
  if (i < 0) return -1;
  loadout[g][i] = key;
  return i;
}

/** Take one off the strip. It stays owned. */
export function drop(loadout, key) {
  const g = groupOf(key);
  const i = g ? loadout[g].indexOf(key) : -1;
  if (i < 0) return false;
  loadout[g][i] = null;
  return true;
}

/** Everything of one kind the turret owns, in the table's own order. */
export function ownedOf(world, group) {
  return ARSENAL.filter((a) => a.group === group && world.unlocked.has(a.key));
}
