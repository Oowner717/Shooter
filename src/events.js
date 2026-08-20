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
import { ARSENAL } from './arsenal.js';

/** Every mine there is, so nothing here has to be kept in step by hand. */
const MINE_IDS = ARSENAL.filter((a) => a.kind === 'mine').map((a) => a.key);

/*
 * A mark per top-up, drawn the same way the permanent ones are. The card is
 * read in the two seconds before a tap and a shape lands before a name does;
 * without these the small tier showed an empty box where the permanent tier
 * showed a symbol, which read as something missing rather than something
 * simpler.
 */
const g = (body, w = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const TICK = {
  // every ability ready: the cycle jumped back to the start
  reset: g('<path d="M3.5 12a8.5 8.5 0 1 1 2.9 6.4"/><path d="M3 7.5v5h5"/>'),
  // cooldowns halved: a clock with the charge run through it
  haste: g('<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2" opacity=".6"/><path d="M13.6 3 10 8.2h4L10.4 13"/>'),
  // double cadence: two shots where there was one
  surge: g('<path d="M8 21V9M16 21V9"/><path d="M5 12 8 8.5 11 12M13 12l3-3.5 3 3.5"/><path d="M8 5.5V3M16 5.5V3" opacity=".5"/>'),
  // salvage: the thing the chip counts
  yield: g('<path d="M12 2.6 21 9l-9 12.4L3 9z"/><path d="M3 9h18M12 2.6 8 9l4 12.4M12 2.6 16 9l-4 12.4" opacity=".45"/>'),
  // three laid at once
  seed: g('<circle cx="6" cy="17" r="2.4"/><circle cx="12" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><path d="M6 12.6V4M12 12.6V6.5M18 12.6V4" opacity=".55"/>'),
  // everything holding on is thrown off
  shake: g('<circle cx="12" cy="12" r="3.2"/><path d="M12 6.6V2.4M12 17.4v4.2M6.6 12H2.4M17.4 12h4.2"/><path d="m8.2 8.2-3 -3M15.8 8.2l3-3M8.2 15.8l-3 3M15.8 15.8l3 3" opacity=".55"/>'),
};

/**
 * The small tier. Everything here is tempo, not power: it changes the next
 * minute and nothing after it.
 *
 * `stacks: 'time'` marks the two that run on a clock. Their effect is a switch
 * the game reads as a boolean — a flat halving while the timer is above zero —
 * so taking a second one cannot make the turret shoot four times as fast. What
 * it does do is add to the clock: two SURGEs are sixty seconds of double rate,
 * not thirty. The card says which of the two it is, because "double fire rate"
 * on its own invites the wrong guess in either direction.
 *
 * The permanent tier has non-stacking upgrades too, but those are simply never
 * offered a second time, so the question never comes up; these two come round
 * again and again.
 */
const SMALL = [
  {
    id: 'reset', icon: TICK.reset, name: 'RESET', line: 'Every ability ready right now.',
    run(world) { world.abilities.clearCooldowns(); },
  },
  {
    id: 'haste', icon: TICK.haste, name: 'HASTE', line: 'Ability cooldowns halved for 45s.',
    // `id` is the world field it runs on, and `seconds` is read by both the
    // card and the readout, so a retune moves all three at once.
    stacks: 'time', seconds: 45,
    run(world) { world.haste += this.seconds; },
  },
  {
    id: 'surge', icon: TICK.surge, name: 'SURGE', line: 'Double fire rate for 30s.',
    stacks: 'time', seconds: 30,
    run(world) { world.surge += this.seconds; },
  },
  {
    id: 'yield', icon: TICK.yield, name: 'YIELD', line: '+150 salvage.',
    run(world) { world.salvage += 150; },
  },
  {
    id: 'seed', icon: TICK.seed, name: 'SEED', line: 'Lay 3 mines now, random kind if none set.',
    run(world) { world.pendingMines = (world.pendingMines || 0) + 3; },
  },
  {
    id: 'shake', icon: TICK.shake, name: 'SHAKE OFF', line: 'Destroy everything gripping the turret.',
    run(world) {
      for (const e of [...world.attackers]) if (!e.dead) e.destroy(world);
      world.attackers.clear();
    },
  },
];

/** Three of the small tier, never the same one twice in one offer. */
export function rollSmallFor(world) {
  return rollSmall(world);
}

function rollSmall(world) {
  // A turret with no mine unlocked has nowhere to put three of them, and an
  // option that does nothing is worse than one fewer option.
  // Any mine, not the four there used to be: a turret carrying only THORN had
  // SEED filtered out of every roll it was ever offered.
  const anyMine = MINE_IDS.some((k) => world.unlocked.has(k));
  const pool = SMALL.filter((o) => o.id !== 'seed' || anyMine);
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
    this.nextSmall = CFG.events.smallFirst;
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
      this.queue.push({ tier: 'small', options: rollSmall(world) });
      if (world.announceOffer) world.announceOffer('small');
    }
    while (world.kills >= this.nextLarge) {
      this.nextLarge += CFG.events.large;
      // A permanent one goes to the front. Nothing expires, so the top-ups it
      // steps in front of lose nothing by waiting — and the button can then
      // say AMENDMENT and mean it, instead of advertising the top-up that
      // happened to be queued first.
      this.queue.unshift({ tier: 'large', options: rollLarge(this.taken, world), held: this.held() });
      if (world.announceOffer) world.announceOffer('large');
    }
  }

  /** How many of each upgrade is already stacked, by id. */
  held() {
    const out = {};
    for (const id of this.taken) out[id] = (out[id] || 0) + 1;
    return out;
  }

  /**
   * Put an offer of this tier back on the queue with a fresh roll. Used when a
   * saved run is picked up: the three cards on an unopened offer were never
   * seen, so re-rolling them costs the player nothing and saves the store from
   * having to serialise a card.
   */
  requeue(world, tier) {
    if (tier === 'large') {
      this.queue.push({ tier, options: rollLarge(this.taken, world), held: this.held() });
    } else {
      this.queue.push({ tier, options: rollSmall(world) });
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
      // Stat upgrades only ever touch world.up; the unlocks and the charges
      // need the world itself, so both are handed over.
      opt.apply(world.up, world);
      this.taken.push(opt.id);
    } else {
      opt.run(world);
    }
    return opt;
  }
}

/**
 * The top-ups that run on a clock, for the readout that shows them. Filtered
 * from the table rather than listed again, so a third timed one is shown the
 * moment it exists.
 */
export const TIMED = SMALL.filter((o) => o.stacks === 'time');

export { SMALL, ABILITIES };
