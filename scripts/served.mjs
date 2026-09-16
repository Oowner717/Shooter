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
