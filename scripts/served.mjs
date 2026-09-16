/*
 * WHICH TREE IS A PROBE ACTUALLY READING?
 *
 * Build 345, extracted from `fight.mjs` where build 344 first wrote it, and
 * the reason it is shared rather than copied is the rule this repo keeps
 * paying for: four copies of one check is a hand-kept list, and the guard
 * that watches it then has to name five sites instead of asking the
 * directory. `check-build.mjs` derives the probe list by grepping
 * `scripts/*.mjs` for `flag('url'`, so a sixth probe is covered by existing.
 *
 * The fault, in full, because it is silent and the reading looks perfect:
 * **this container's `http-server` serves its own CWD and ignores a trailing
 * path argument.** So `http-server -p 8096 -c-1 --silent /tmp/w342`, launched
 * from the repo, serves the LIVE TREE on 8096 -- and build 343 took three
 * "old build" readings in one session that were all the current code, then
 * wrote a note attributing the disagreement to instrument drift that does not
 * exist. Verified off `/proc`: every one of those processes has an empty
 * cmdline and `cwd=/home/user/Shooter`. The one that worked had been launched
 * by a command that happened to `cd` first.
 *
 * The invocation that actually serves a worktree is
 * `cd <worktree> && http-server -p N -c-1 --silent` with NO path -- and
 * because the cmdline is empty, such a server cannot be found or killed by
 * pattern either. `for pid in $(pgrep -x http-server); do readlink
 * /proc/$pid/cwd; done` is what says which tree each one is serving.
 *
 * WHICH DIFFERENTIALS THIS PROTECTS, stated as the tell: a `--url`
 * differential that reports a MOVE proves the two trees really differed and
 * is sound whatever the invocation was; one that reports NO MOVE is exactly
 * what a stale serve produces and cannot be told apart from it. So every
 * "identical either side" reading taken through a second server before build
 * 344 is worth re-taking. Builds 331-338 were re-taken at 345 and all eight
 * hold (`1664149562`, six marks and six body counts each, to the digit).
 *
 * Note the check has to read something that DISCRIMINATES. Build 343's did
 * not: it grepped the served source for `wobble || 1`, and the build's own
 * new comment quoted that string, so the check passed against a tree with
 * `?? 1` in the code. Parse the expression or read a constant -- never match
 * a string that prose can also contain. This reads the BUILD literal, which
 * `check-build.mjs` already pins to one authored place.
 *
 * And printing is not guarding -- build 329's rule, from the broadphase cell
 * that shipped a silent widening under a `console.log` nobody read. So
 * `--expect NNN` turns the heading into a refusal, which is the only form
 * that cannot be skim-read past. The caller decides what to tear down,
 * because only the caller knows what it has opened; every probe today calls
 * this BEFORE its browser launch, so `abort` means a plain exit.
 */

/** What the server at `base` is really serving: its BUILD and REV literals. */
export const servedTree = async (base) => {
  const root = base.replace(/\/[^/]*$/, '');
  try {
    const res = await fetch(`${root}/src/config.js`);
    if (!res.ok) return { err: `HTTP ${res.status}` };
    const src = await res.text();
    const b = src.match(/export const BUILD = '([^']*)'/);
    const r = src.match(/export const REV = '([^']*)'/);
    return { build: b && b[1], rev: r && r[1] };
  } catch (e) {
    return { err: String((e && e.message) || e) };
  }
};

/**
 * Print which tree the probe is reading, and refuse if `expect` disagrees.
 * Returns `{ abort, served }`; the caller exits 1 on `abort` after closing
 * whatever it owns.
 */
export const checkServed = async (base, expect, who) => {
  const served = await servedTree(base);
  if (served.err) {
    console.log(`\n  ! could not read the served tree (${served.err}) -- `
      + `the reading below is of an UNKNOWN tree`);
  } else {
    console.log(`\nserving ${base}\n  build ${served.build}  rev ${served.rev}`);
  }
  if (expect !== null && expect !== undefined
      && String(served.build) !== String(expect)) {
    console.error(`\n${who}: --expect ${expect} but the server at ${base} is `
      + `serving build ${served.build}. This container's http-server serves its own `
      + `CWD and ignores a trailing path, so launch it as `
      + `\`cd <worktree> && http-server -p N -c-1 --silent\` with no path argument.`);
    return { abort: true, served };
  }
  return { abort: false, served };
};

/*
 * ...AND WHICH TREE IT READ IS NOT THE SAME QUESTION AS WHETHER IT CAN READ
 * IT.
 *
 * Build 346. `checkServed` above answers "is this the commit I meant to
 * serve". It says nothing about whether the probe's own field names exist on
 * that commit -- and a `--url` differential reaches back tens of builds, so a
 * rename in between makes the probe write a dead property and read
 * `undefined`, silently, on exactly the side it was pointed at deliberately.
 *
 * Proved rather than argued, on the one differential that had it. Phase 5 of
 * the byte migration ran `tiers.mjs` against build 283 and 287 and reported
 * `buys` identical at all twenty tiers. The probe funds a tier with ONE line,
 * `w.bytes = spend` -- and build 286 renamed `world.energy` to `world.bytes`,
 * so build 283's `Game.buy` reads `w.energy` and that write lands on a
 * property nothing consults. Measured, the phase-5 probe against a correctly
 * served 283: **buys 0, 0, 0 at tiers 1-3 and pay 0 B**, against a recorded
 * 1, 2, 3 and "pay is x1000". So that reading was not of build 283's tree,
 * which is a positive demonstration where build 344 could only say a no-move
 * result is indistinguishable from a stale serve.
 *
 * The check has to run IN THE PAGE, because a world is the only thing that
 * can answer it -- and it cannot be DERIVED from the probe's source, which is
 * the thing tried first: `w` is the WINDOW in `w.requestAnimationFrame` and
 * the WORLD in `w.bytes`, in the same file, so a harvest of `w.X` collects
 * both and can refuse for a field the world was never meant to have. So the
 * probe DECLARES what its numbers depend on, which is a claim rather than a
 * restatement -- and what is derived is who has to make it: any probe whose
 * source touches the purse must call this, which `check-build.mjs` holds.
 */
export const requireWorld = async (page, fields, who) => {
  const missing = await page.evaluate((names) => {
    const w = window.__sim && window.__sim.world;
    if (!w) return names.slice();
    return names.filter((n) => !(n in w));
  }, fields);
  if (missing.length) {
    console.error(`\n${who}: the served tree has no world.${missing.join(', world.')} `
      + `-- every figure this probe derives from ${missing.length > 1 ? 'those fields' : 'that field'} `
      + `would be read off \`undefined\`, so the run is refused rather than printed. `
      + `A --url differential reaching back far enough crosses a rename: `
      + `world.energy became world.bytes at build 286, which is how phase 5's `
      + `build-283 column came to report a tree it had never read.`);
    return { abort: true, missing };
  }
  console.log(`  world has ${fields.map((f) => `.${f}`).join(' ')}`);
  return { abort: false, missing };
};

/*
 * ...AND A PROBE THAT IMPORTS THE LOCAL TREE MAY ONLY BE AIMED AT ITS OWN.
 *
 * Build 347, the third hole and the last of the three. `checkServed` says
 * which tree was served and `requireWorld` says whether the probe can read
 * it; neither notices that half the probe's numbers never came from that tree
 * at all. `tiers.mjs` imports `WAVES`, `ENEMY_TYPES`, `CFG`, the formatters,
 * `NODES` and `priceOf` from `../src/`, so under `--url` the price table, the
 * wave roster, the type roster and every config constant are the CHECKOUT's
 * and only the GAME is the served build.
 *
 * That is a third, independent reason build 287's phase-5 reading could not
 * have been about build 283's economy: the whole point of that differential
 * was a x1000 price change, and both sides shared one price table.
 *
 * THE FIX IS A REFUSAL RATHER THAN A REFACTOR, and the refusal teaches the
 * method. Reading the constants out of the page instead would mean serialising
 * `priceOf` -- a function -- across the boundary, and would leave the probe
 * silently mixing two trees for every symbol somebody forgot. What is
 * actually true is narrower and checkable: for such a probe a differential is
 * sound only when the checkout IS the served commit, which means running it
 * FROM the worktree (`cd /tmp/wNNN/scripts && node tiers.mjs`). That is
 * exactly how build 346's phase-5 reproduction was taken, and why it was
 * valid.
 *
 * AND IT DELIBERATELY DOES NOT APPLY TO THE OTHER FOUR. `fight.mjs`,
 * `dps.mjs`, `variance.mjs` and `ladder-probe.mjs` import nothing from
 * `../src/` -- every figure they print is read out of the page -- so aiming
 * them at any tree is sound, which is what makes build 345's eight-build hash
 * re-take valid and is worth saying rather than assuming. `check-build.mjs`
 * derives the two families from the imports themselves, so a probe that grows
 * its first local import inherits the refusal.
 */
export const requireSameTree = (served, localBuild, who) => {
  if (served && served.err) return { abort: false, mismatch: false };
  const there = String(served && served.build);
  const here = String(localBuild);
  if (there !== here) {
    console.error(`\n${who}: serving build ${there} while this checkout is build ${here}, `
      + `and this probe imports its constants from ../src/ -- the price table, the wave `
      + `roster and the config would be ${here}'s while only the game is ${there}'s, which `
      + `is how phase 5 reported a x1000 price change as no change at all. Run it FROM the `
      + `worktree instead: \`cd <worktree>/scripts && node ${who} --url ...\`.`);
    return { abort: true, mismatch: true };
  }
  console.log(`  checkout is build ${here} too, so its imported constants match`);
  return { abort: false, mismatch: false };
};
