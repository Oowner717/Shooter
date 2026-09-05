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
// The last file that was known good. See write() for what this is for.
const BACKUP = 'sim7749-run-prev';
/*
 * 4: the run is on a wave, and the wave is part of the run.
 *
 * NOT bumped for `earned` in build 180, and the reason is the note below:
 * readSlot refuses a file whose `v` does not match exactly, so a bump throws
 * away every run currently open -- and the migration written to rescue those
 * runs would never get to execute, because the file is discarded before the
 * restore ever sees it. This only moves when the restore genuinely cannot read
 * its own past, and an absent field it has a default for is not that.
 */
const VERSION = 4;

/** Only these two phases are a coherent place to pick a run up from. */
// `staging` and nothing else: `boot` is the title screen and there has never
// been a third value. `'lull'` sat here from build 82 and could never match.
const SAVABLE = new Set(['staging']);

/*
 * Write it down, and do not destroy a good file to do it.
 *
 * This used to be one setItem. Which is fine until it is not: a store that
 * fills up mid-write, a browser that truncates on a kill, a serialiser that
 * throws halfway — and every one of those leaves the *only* copy of the run
 * unreadable, which readRun() then correctly refuses, which reads to the
 * player as "my save is gone".
 *
 * So the good file is copied aside first, the new one is written, and the new
 * one is read straight back and parsed before it is believed. If any of that
 * fails the backup is put back. It costs one extra read and one extra write of
 * a few kilobytes, on a timer, which is nothing next to losing an hour.
 */
function write(data) {
  let text;
  try {
    text = JSON.stringify(data);
  } catch {
    return false; // nothing sensible to store; leave whatever is there alone
  }
  let prev = null;
  try {
    prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(BACKUP, prev);
  } catch { /* no backup available; the write below still tries */ }
  try {
    localStorage.setItem(KEY, text);
    // Believe it only once it has come back. A quota failure can be silent on
    // some browsers, and a truncated file is worse than no file.
    const back = localStorage.getItem(KEY);
    if (back !== text) throw new Error('short write');
    JSON.parse(back);
    return true;
  } catch {
    try {
      if (prev) localStorage.setItem(KEY, prev);
      else localStorage.removeItem(KEY);
    } catch { /* nothing left to try */ }
    return false; // private mode, or a full store: the run simply is not kept
  }
}

/** Read and validate one slot. Null if it is missing, stale or malformed. */
function readSlot(key) {
  try {
    const raw = localStorage.getItem(key);
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
  /*
   * The current file, or the one before it. A save that cannot be read is a
   * save that is gone as far as the player is concerned, and one write ago is
   * a great deal closer to their run than nothing at all.
   */
  return readSlot(KEY) || readSlot(BACKUP);
}


export function forgetRun() {
  try {
    localStorage.removeItem(KEY);
    // ...and the one behind it, or readRun() would hand back the run that was
    // just deliberately thrown away.
    localStorage.removeItem(BACKUP);
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
    // Lifetime, not the purse: what the object types are gated behind.
    earned: world.earned,
    nextStoryAt: world.nextStoryAt,
    // `endless: true` used to be written here. Nothing ever read it back, and
    // the flag itself went in build 186 -- every run has been endless since 81
    // and nothing was left that could ask.
    unlocked: [...world.unlocked],
    loadout: { mines: [...world.loadout.mines], ammo: [...world.loadout.ammo] },
    round: world.round,
    mine: world.mine,
    autoAim: !!world.autoAim,
    aimMode: world.aimMode || 'field',
    autoFire: !!world.autoFire,
    taken: [...world.ledger],
    /*
     * How many ways in are actually held, which is not what the ledger says.
     *
     * A restore replays every taken id through its `apply`, and APERTURE's
     * hands out one each time -- so a run that bought three and opened two
     * came back holding three. The ledger records what was bought; this
     * records what is left, and the restore takes this one.
     */
    aperture: world.aperture | 0,
    /*
     * ...and the same for the other six, once there are other six.
     *
     * Additive, and the VERSION is deliberately not bumped for it: readSlot
     * refuses a file whose version it does not know, so bumping would throw
     * away the run of every install that updates. `aperture` above is slot 1
     * of this same array and is still written, so a file this build produces
     * is still readable as one of the old shape.
     */
    apertures: [...world.apertures],
    // The run's own seed: every wave's trait is a pure function of it, so one
    // integer carries what would otherwise be a list. See src/traits.js.
    runSeed: world.runSeed | 0,
    // Which bosses have ever been broken. Progression -- it is what unseals
    // the next slot -- so it is recorded rather than recomputed.
    reconciled: [...world.reconciled],
    /*
     * The era, from build 253 and not before. It was deliberately absent while
     * the only way to reach era 2 was a debug stepper: writing an unfinished
     * era to disk would have stranded a run in one across every reload. Now
     * that it is bought and paid for it is part of the run.
     */
    era: world.era,
    /*
     * The emplacements: which lots have one, and whether the line is running.
     *
     * The list of INDICES and nothing else -- a gun's place is its lot's place
     * and the lots are re-derived on every resize, so there is nothing else
     * about one that is a fact about the run. The six upgrades are ordinary
     * ledger ids and come back with `taken` like everything else.
     *
     * Additive, and the VERSION is deliberately not bumped: a file this build
     * writes is still readable by the shape before it, and a file written
     * before this reads back as a run with no emplacements, which it was.
     */
    guns: [...(world.guns || [])],
    gunsOn: world.gunsOn !== false,
    // ...and the same for what a boss left. Both are held counts that go
    // down again, which the ledger has no way of recording.
    remainder: world.remainder | 0,
    // When, so CONTINUE can say how long ago rather than just how far. Not
    // read by the restore; nothing about the run depends on the clock.
    at: Date.now(),
    // Only the tiers. The three cards on an unopened offer are a fresh roll
    // either way, and rolling them again on resume costs nothing.
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
      /*
       * The ladder: where the run had climbed to, and whether the player had
       * pinned it there. `fails` sat here too until build 208, when contact
       * became the only thing that steps the ladder back and the streak it
       * counted stopped existing.
       */
      tier: world.director.tier,
      /*
       * ...and the highest it has stood on, which the rail's ticks are drawn
       * from. Additive, so the VERSION does not move: a file without it comes
       * back with peak = tier, which is the truth for every run that never
       * stepped back and an understatement for the rest.
       */
      peak: world.director.peak,
      // A trial in flight, and the wave that may not climb. Both additive: a
      // save without them restores to no trial and no grace, which is what
      // every save before build 201 means.
      probe: world.director.probe ? { ...world.director.probe } : null,
      // The lane, if one was taken at a gate. Additive: a save without it
      // restores to no lane, which is what every save before 204 means.
      lane: world.director.lane ? { ...world.director.lane } : null,
      // What is in hand and how long until the next one. `max` is replayed
      // from the ledger with the rest of the tree, so it is not written here.
      recall: { held: world.director.recall.held | 0, cd: +world.director.recall.cd || 0 },
      overclock: { held: world.director.overclock.held | 0,
        cd: +world.director.overclock.cd || 0, armed: !!world.director.overclock.armed },
      grace: world.director.grace | 0,
      hold: world.director.hold ? 1 : 0,
    },
  };
}

/** @returns true if something was actually written. */
export function saveRun(world, game) {
  const data = captureRun(world, game);
  return data ? write(data) : false;
}
