// Offers. The simulation stops to evaluate you, and hands you something.
//
// Two tiers. SMALL comes often and gives tempo — charges, an instant effect,
// salvage. LARGE comes rarely and is permanent for the run, one option from
// each of the three axes.
//
// Neither one ever interrupts. Both queue up behind a button and wait
// indefinitely, because the whole point of this game is that you can put it
// down. An offer left untaken for eight hours is still there.

import { CFG } from './config.js';
import { ABILITIES } from './abilities.js';
import { rollLarge } from './upgrades.js';

/**
 * The small tier. Everything here is tempo, not power: it changes the next
 * minute and nothing after it.
 */
const SMALL = [
  {
    id: 'restock', name: 'RESTOCK', line: 'Every ability back to full.',
    run(world) {
      for (const s of world.abilities.slots) {
        if (!s.def.free) s.charges = s.def.cap + world.up.cap;
      }
    },
  },
  {
    id: 'pair', name: 'PAIR', line: 'Two charges of one thing, chosen for you.',
    run(world) {
      const i = pickChargeable(world);
      if (i >= 0) world.abilities.addCharge(i, 2);
    },
  },
  {
    id: 'spread', name: 'SPREAD', line: 'One charge of everything.',
    run(world) {
      world.abilities.slots.forEach((s, i) => { if (!s.def.free) world.abilities.addCharge(i); });
    },
  },
  {
    id: 'yield', name: 'YIELD', line: 'A hundred and fifty salvage, straight in.',
    run(world) { world.salvage += 150; },
  },
  {
    id: 'surge', name: 'SURGE', line: 'Thirty seconds at double the rate of fire.',
    run(world) { world.surge = Math.max(world.surge, 30); },
  },
  {
    id: 'seed', name: 'SEED', line: 'Three mines laid where they lie, now.',
    run(world) { world.pendingMines = (world.pendingMines || 0) + 3; },
  },
];

function pickChargeable(world) {
  const open = [];
  world.abilities.slots.forEach((s, i) => {
    if (!s.def.free && s.charges < s.def.cap + world.up.cap) open.push(i);
  });
  if (!open.length) {
    const any = world.abilities.slots.map((s, i) => (s.def.free ? -1 : i)).filter((i) => i >= 0);
    return any.length ? any[(Math.random() * any.length) | 0] : -1;
  }
  return open[(Math.random() * open.length) | 0];
}

/** Three of the small tier, never the same one twice in one offer. */
function rollSmall() {
  const pool = [...SMALL];
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    out.push(...pool.splice((Math.random() * pool.length) | 0, 1));
  }
  return out;
}

export class Offers {
  constructor() {
    this.reset();
  }

  reset() {
    this.queue = []; // { tier, options } — oldest first, and none of them expire
    this.nextSmall = CFG.events.small;
    this.nextLarge = CFG.events.large;
    this.taken = []; // upgrade ids, so the one-offs are not offered twice
  }

  get pending() {
    return this.queue.length;
  }

  get next() {
    return this.queue[0] || null;
  }

  /**
   * Kills are the clock. Both tiers can come due on the same kill, and both go
   * in the queue — nothing is ever skipped because something else arrived.
   */
  note(world) {
    while (world.kills >= this.nextSmall) {
      this.nextSmall += CFG.events.small;
      this.queue.push({ tier: 'small', options: rollSmall() });
    }
    while (world.kills >= this.nextLarge) {
      this.nextLarge += CFG.events.large;
      this.queue.push({ tier: 'large', options: rollLarge(this.taken) });
    }
  }

  /** @returns the option taken, or null. */
  take(world, index) {
    const offer = this.queue[0];
    if (!offer) return null;
    const opt = offer.options[index];
    if (!opt) return null;
    this.queue.shift();
    if (offer.tier === 'large') {
      opt.apply(world.up);
      this.taken.push(opt.id);
    } else {
      opt.run(world);
    }
    return opt;
  }
}

export { SMALL, ABILITIES };
