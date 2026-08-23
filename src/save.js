// The run, written down.
//
// This is a checkpoint, not a snapshot. What is kept is the *progress* — how
// far the count has got, what has been bought, what is on the strip, what the
// permanent tier has already handed over, and which wave the run was on — and
// not the field: the objects in the air, where the barrel was pointing, which
// mine was mid-flight. Restoring a live field is a great deal of machinery for
// a moment nobody is attached to. Coming back to a clear field at your own
// count, on the wave you left, restarted from the top of it, is the thing a
// player actually wanted when they closed the tab.
//
// What has already been *said* is kept too. A tooltip seen once is seen: the
// teaching ladder resumes at the step it reached rather than replaying from
// the top, and every first-use hint already shown stays shown.
//
// It is written for the way this is played: a phone, in short sittings, where
// the app can be killed between one glance and the next and never gets to say
// goodbye. So it saves on a timer, and again the instant the page is hidden,
// which on iOS is the last event anything reliably gets.

import { BUILD } from './config.js';

const KEY = 'sim7749-run';
const VERSION = 4; // 4: the run is on a wave, and the wave is part of the run

/** Only these two phases are a coherent place to pick a run up from. */
const SAVABLE = new Set(['staging', 'lull']);

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // private mode, or a full store: the run simply is not kept
  }
}

/**
 * What is on disk, or null.
 *
 * This used to throw a run away whenever the build changed -- the reasoning
 * being that the tables a save names, rounds and mines and upgrade ids, are
 * exactly what changes between builds. The reasoning outlived its truth. The
 * restore path already refuses everything it was afraid of, and each of these
 * was tested against a save doctored to contain it:
 *
 *   a round id this build has never had   ->  falls back to what is carried
 *   a mine id it has never had            ->  falls back to none
 *   an upgrade id it has never had        ->  skipped by the replay
 *   an unlocked key it has never had      ->  sits in the set, unused
 *   a wave index past the end of the table ->  director starts the rotation
 *
 * So the gate was buying nothing and costing everything: shipping a build
 * silently deleted the run of every player who had one open, which is the
 * opposite of what a save is for. `v` still guards the *shape* of the file --
 * bump VERSION when this stops being able to read its own past -- and the
 * checks below guard the fields the restore reaches into without asking.
 *
 * `build` is still written. It says which build wrote this, which is worth
 * knowing when a save does turn out to be strange; it is no longer a reason to
 * throw one away.
 */
export function readRun() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== VERSION) return null;
    if (!Number.isFinite(d.kills)) return null;
    // Shapes the restore indexes into directly rather than reading defensively.
    if (!d.loadout || !Array.isArray(d.loadout.mines) || !Array.isArray(d.loadout.ammo)) return null;
    if (!Array.isArray(d.taken) || !Array.isArray(d.unlocked)) return null;
    return d;
  } catch {
    return null;
  }
}

export function forgetRun() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to forget */ }
}

/**
 * Everything needed to stand the run back up. Ability charges and upgrade
 * scalars are not stored as values — `taken` is the list of permanent cards
 * accepted, in order, and replaying it rebuilds `world.up`, the charges and
 * the held counts from the one table that defines them. A saved number would
 * go stale the moment an upgrade was retuned; a saved decision does not.
 */
export function captureRun(world, game) {
  if (!SAVABLE.has(world.phase)) return null;
  return {
    v: VERSION,
    build: BUILD,
    kills: world.kills,
    released: world.released,
    time: world.time,
    energy: world.energy,
    nextStoryAt: world.nextStoryAt,
    // `endless: true` used to be written here. Nothing ever read it back —
    // every run has been endless since build 81, so restore sets it rather
    // than asking a file about it.
    unlocked: [...world.unlocked],
    loadout: { mines: [...world.loadout.mines], ammo: [...world.loadout.ammo] },
    round: world.round,
    mine: world.mine,
    autoAim: !!world.autoAim,
    autoFire: !!world.autoFire,
    taken: [...world.offers.taken],
    /*
     * How many ways in are actually held, which is not what the ledger says.
     *
     * A restore replays every taken id through its `apply`, and APERTURE's
     * hands out one each time -- so a run that bought three and opened two
     * came back holding three. The ledger records what was bought; this
     * records what is left, and the restore takes this one.
     */
    aperture: world.aperture | 0,
    nextSmall: world.offers.nextSmall,
    nextLarge: world.offers.nextLarge,
    // Only the tiers. The three cards on an unopened offer are a fresh roll
    // either way, and rolling them again on resume costs nothing.
    queued: world.offers.queue.map((q) => q.tier),
    teaching: !!game.teaching,
    scriptStep: game.scriptStep,
    hinted: Object.keys(game.autoHinted || {}),
    story: world.narrator ? world.narrator.index : 0,
    // Where the run is in the rotation. The order is stored rather than
    // re-rolled, because coming back to "the wave I was on" means the same
    // wave, not a wave of the same size. It is restarted from the top on
    // resume — half a wave is not a place anyone remembers being.
    wave: {
      order: [...world.director.order],
      at: world.director.at,
      cycle: world.director.cycle,
    },
  };
}

/** @returns true if something was actually written. */
export function saveRun(world, game) {
  const data = captureRun(world, game);
  return data ? write(data) : false;
}
