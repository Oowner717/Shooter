// Offers. The simulation stops to evaluate you, and hands you something.
//
// Two tiers. SMALL comes often and gives tempo — a cooldown wiped, a burst of
// rate, some salvage. LARGE comes rarely and is permanent for the run, one
// option from each of the three axes.
//
// Neither one ever interrupts. Both queue up behind a button and wait
// indefinitely, because the whole point of this game is that you can put it
// down. An offer left untaken for eight hours is still there.

import { svgMark } from './util.js';
import { CFG } from './config.js';
import { ABILITIES } from './abilities.js';
import { ARSENAL } from './arsenal.js';
import { laidCount } from './mines.js';

/** Every mine there is, so nothing here has to be kept in step by hand. */
const MINE_IDS = ARSENAL.filter((a) => a.kind === 'mine').map((a) => a.key);

/*
 * A mark per top-up, drawn the same way the permanent ones are. The card is
 * read in the two seconds before a tap and a shape lands before a name does;
 * without these the small tier showed an empty box where the permanent tier
 * showed a symbol, which read as something missing rather than something
 * simpler.
 */

const g = svgMark;

const TICK = {
  // cooldowns halved: a clock with the charge run through it
  haste: g('<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2" opacity=".6"/><path d="M13.6 3 10 8.2h4L10.4 13"/>'),
  // double cadence: two shots where there was one
  surge: g('<path d="M8 21V9M16 21V9"/><path d="M5 12 8 8.5 11 12M13 12l3-3.5 3 3.5"/><path d="M8 5.5V3M16 5.5V3" opacity=".5"/>'),
  // three laid at once
  seed: g('<circle cx="6" cy="17" r="2.4"/><circle cx="12" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><path d="M6 12.6V4M12 12.6V6.5M18 12.6V4" opacity=".55"/>'),
  // a shell around the turret, with teeth on it
  corona: g('<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.6" stroke-dasharray="2.6 2.4"/><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M5.4 5.4 7.1 7.1M16.9 16.9l1.7 1.7M18.6 5.4 16.9 7.1M7.1 16.9l-1.7 1.7"/>'),
  // the floor, swept up
  scour: g('<path d="M3 20.4h18"/><path d="M12 3.6v8.8M8.2 8.4 12 12.2l3.8-3.8"/><path d="M6.4 16.6h11.2l1.2 3.8H5.2z"/>'),
  // everything on the field, sent back the way it came
  ebb: g('<path d="M12 21V6.4"/><path d="M6.8 11.6 12 6.2l5.2 5.4"/><path d="M3.4 17.4h5M15.6 17.4h5" opacity=".55"/><path d="M3.4 21h17.2" opacity=".35"/>'),
  // one pull of the trigger, three rounds out
  overdraw: g('<path d="M5 21V10M12 21V7M19 21V10"/><path d="M2.6 12.4 5 10l2.4 2.4M9.6 9.4 12 7l2.4 2.4M16.6 12.4 19 10l2.4 2.4"/><circle cx="12" cy="3.2" r="1.4" fill="currentColor" stroke="none"/>'),
  // the field filled with them at once
  volley: g('<circle cx="4.6" cy="18" r="2.1"/><circle cx="10.2" cy="18" r="2.1"/><circle cx="15.8" cy="18" r="2.1"/><circle cx="21" cy="18" r="2.1" opacity=".5"/><circle cx="12" cy="11" r="2.1"/><path d="M12 8.6V3.4M9.6 5.6 12 3.2l2.4 2.4" opacity=".6"/>'),
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
    /*
     * CORONA. Replaced SHAKE OFF in build 65.
     *
     * SHAKE OFF destroyed whatever was gripping the turret, which made it the
     * best card in the pool with four things attached and a card that did
     * literally nothing with none — and which of those you got was decided
     * before you saw it. This does the same job as an answer and can also be
     * taken as a precaution: for thirty seconds the turret is unpleasant to be
     * near, so the crowd that was about to arrive dies on the way in.
     */
    id: 'corona', icon: TICK.corona, name: 'CORONA',
    line: 'The turret burns for 30s. Anything holding on or close by takes damage.',
    stacks: 'time', seconds: CFG.boosts.corona.seconds,
    run(world) { world.corona += this.seconds; },
  },
  {
    id: 'seed', icon: TICK.seed, name: 'SEED', line: 'Lay 3 mines now, random kind if none set.',
    run(world) { world.pendingMines = (world.pendingMines || 0) + 3; },
  },
  {
    // VOLLEY tops the field up to a full set rather than laying a flat number,
    // so it never spends throws retiring mines you already had down.
    id: 'volley', icon: TICK.volley, name: 'VOLLEY',
    line: 'Fill the field to five mines now.',
    run(world) {
      const room = Math.max(0, CFG.mines.cap - laidCount(world));
      world.pendingMines = (world.pendingMines || 0) + room;
    },
  },
  {
    id: 'scour', icon: TICK.scour, name: 'SCOUR',
    line: 'All the energy on the field taken in at once, at +50%.',
    run(world) { world.pendingScour = true; },
  },
  {
    id: 'ebb', icon: TICK.ebb, name: 'EBB',
    line: 'Everything hostile is thrown back up the field.',
    run(world) { world.pendingEbb = true; },
  },
  {
    id: 'overdraw', icon: TICK.overdraw, name: 'OVERDRAW',
    line: 'The next 12 shots each fire three rounds.',
    // Counted in shots rather than seconds, so it reads on the same rail with
    // its own unit rather than being invisible.
    stacks: 'time', unit: 'shots', seconds: CFG.boosts.overdraw.shots,
    run(world) { world.overdraw += this.seconds; },
  },
];
/** Three of the small tier, never the same one twice in one offer. */
export function rollSmall(world) {
  // A turret with no mine unlocked has nowhere to put three of them, and an
  // option that does nothing is worse than one fewer option.
  // Any mine, not the four there used to be: a turret carrying only THORN had
  // SEED filtered out of every roll it was ever offered.
  const anyMine = MINE_IDS.some((k) => world.unlocked.has(k));
  const pool = SMALL.filter((o) => !(o.id === 'seed' || o.id === 'volley') || anyMine);
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
  /*
   * An offer is queued empty and rolled when it is first opened.
   *
   * It used to be rolled here, at the moment it came due — which meant two
   * AMENDMENTs waiting on the button had both been rolled against the same
   * state, and taking a card from the first did not touch the second. Measured
   * over 20,000 pairs: 53% shared at least one card, and 4.4% shared an
   * UNLOCK. Taking that twice unlocked nothing the second time and the pick
   * was simply gone; a shared CHARGE granted two extra uses where the design
   * says one; a shared levelled stat went past its own ceiling.
   *
   * Rolling on open fixes all three at once, because by then `taken` and
   * `unlocked` say what actually happened. It is rolled once and kept, so
   * closing the sheet and opening it again is not a free re-roll.
   */
  note(world) {
    while (world.kills >= this.nextSmall) {
      this.nextSmall += CFG.events.small;
      this.queue.push({ tier: 'small', options: null });
      if (world.announceOffer) world.announceOffer('small');
    }
    // AMENDMENTs are gone as of build 83. Everything permanent is bought from
    // the tree with energy instead of arriving as three cards you had to pick
    // one of and never see the other two again. ALLOCATIONs above are
    // untouched: they are tempo, not progression, and a top-up is exactly the
    // kind of thing that should turn up rather than be shopped for.
  }

  /**
   * Fill in the offer at the head of the queue, if it has not been looked at
   * yet. Everything that shows or takes an offer goes through here first.
   *
   * @returns the offer, ready to render, or null.
   */
  prepare(world) {
    const offer = this.queue[0];
    if (!offer) return null;
    if (!offer.options) {
      offer.options = rollSmall(world);
    }
    return offer;
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
    // Empty, like note() leaves them: a restored offer has not been looked at
    // either, so it is rolled when it is opened.
    this.queue.push({ tier, options: null });
  }

  /** @returns the option taken, or null. */
  take(world, index) {
    const offer = this.prepare(world);
    if (!offer) return null;
    const opt = offer.options[index];
    if (!opt) return null;
    this.queue.shift();
    opt.run(world);
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
