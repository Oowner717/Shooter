// Offers. The simulation stops to evaluate you, and hands you something.
//
// Two tiers. SMALL comes often and gives tempo — a cooldown wiped, a burst of
// rate, some salvage. LARGE comes rarely and is permanent for the run, one
// option from each of the three axes.
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
    id: 'reset', name: 'RESET', line: 'Every ability ready right now.',
    run(world) { world.abilities.clearCooldowns(); },
  },
  {
    id: 'haste', name: 'HASTE', line: 'Ability cooldowns halved for 45s.',
    run(world) { world.haste = Math.max(world.haste, 45); },
  },
  {
    id: 'surge', name: 'SURGE', line: 'Double fire rate for 30s.',
    run(world) { world.surge = Math.max(world.surge, 30); },
  },
  {
    id: 'yield', name: 'YIELD', line: '+150 salvage.',
    run(world) { world.salvage += 150; },
  },
  {
    id: 'seed', name: 'SEED', line: 'Lay 3 mines now, random kind if none set.',
    run(world) { world.pendingMines = (world.pendingMines || 0) + 3; },
  },
  {
    id: 'shake', name: 'SHAKE OFF', line: 'Destroy everything gripping the turret.',
    run(world) {
      for (const e of [...world.attackers]) if (!e.dead) e.destroy(world);
      world.attackers.clear();
    },
  },
];

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
   * in the queue — nothing is ever skipped because something else arrived. The
   * permanent tier jumps ahead of the top-ups; see below.
   */
  note(world) {
    while (world.kills >= this.nextSmall) {
      this.nextSmall += CFG.events.small;
      this.queue.push({ tier: 'small', options: rollSmall() });
      if (world.announceOffer) world.announceOffer('small');
    }
    while (world.kills >= this.nextLarge) {
      this.nextLarge += CFG.events.large;
      // A permanent one goes to the front. Nothing expires, so the top-ups it
      // steps in front of lose nothing by waiting — and the button can then
      // say AMENDMENT and mean it, instead of advertising the top-up that
      // happened to be queued first.
      this.queue.unshift({ tier: 'large', options: rollLarge(this.taken), held: this.held() });
      if (world.announceOffer) world.announceOffer('large');
    }
  }

  /** How many of each upgrade is already stacked, by id. */
  held() {
    const out = {};
    for (const id of this.taken) out[id] = (out[id] || 0) + 1;
    return out;
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
