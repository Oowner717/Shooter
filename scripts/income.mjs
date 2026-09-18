/*
 * income.mjs -- what a run has BANKED by the rung it meets each slot on.
 *
 *   node scripts/income.mjs [--rungs 1,7,14,21,28,35,42,49] [--waves 6] [--runs 1]
 *                           [--iters 3] [--window S] [--spend BYTES]
 *                           [--seed N] [--rand N] [--grant] [--press]
 *                           [--url URL] [--expect NNN]
 *
 * The one number this repo has never measured, and the reason phase 7b of
 * `docs/rebalance.html` cannot be written without it: "seven numbers measured
 * against the turret each slot actually meets" is a claim about what the run
 * can AFFORD by rung 7, 14, 21, 28, 35, 42 and 49, and every affordability
 * figure in the repo traces back to five anchors in `tiers.mjs` that were
 * ASSERTED rather than measured. That probe's own header says so twice --
 * "THE MONEY is not measured, it is asserted", and "those targets are known to
 * be about four times too rich... Fix the curve by driving a measured one in
 * through `--spend`." This is that measured one.
 *
 * ---- why it is not a long run with a bot ----
 *
 * The obvious instrument is `ladder-probe.mjs` climbing from rung 1 with a
 * buying policy, reading `world.earned` as it goes. Measured, that does not
 * work at this scale: that probe drives the page through one `page.evaluate`
 * and one `page.mouse.click` per iteration against `sleep(60)`, and its clock
 * is WALL time -- so the game advances at about 0.4x wall (calibrated at build
 * 362: 60 wall seconds bought 23 game seconds and three teach waves). A climb
 * to rung 49 is tens of game-minutes; at 0.4x that is an hour of wall clock a
 * run, and one run is a draw.
 *
 * So the curve is INTEGRATED from two terms, each measured at a sampled rung
 * with the rung PINNED, the way `fight.mjs` and `tiers.mjs`'s stream column
 * already drive the game -- synthetic `g.update(1/60)` steps inside one
 * evaluate, no rAF, thousands of frames a second:
 *
 *   RATE   bytes banked a second, off `world.earned` -- lifetime banked, fed
 *          by `bank()`, which is the one place salvage enters a run. NOT off
 *          the purse: the purse falls on every purchase, and `ladder-probe`'s
 *          own `energyPerSec` is a purse delta, correct there only because
 *          its three profiles buy nothing after setup.
 *   DWELL  seconds a rung. A wave is scored `surge` (+2 rungs), `clean` (+1)
 *          or `stall` (0), so the rungs a wave is worth comes off the verdict
 *          mix, and the dwell is (wave + its measured seam) / rungs-a-wave.
 *
 * and earned-at-rung-N is the sum of RATE x DWELL over the rungs below it,
 * interpolated between the samples. Both terms are measured; the INTEGRAL is
 * a model, and it is stated as one.
 *
 * ---- the circularity, and the fixed point ----
 *
 * Income depends on the turret, the turret depends on income. So the curve is
 * iterated: pass 1 funds every rung with NOTHING and measures what a bare gun
 * banks, pass 2 funds each rung with pass 1's answer, and so on. It is
 * approached from BELOW, so the first pass owes nothing to the asserted curve
 * it replaces and the sequence is a lower bound climbing. `--iters` is how
 * many passes; the report prints every one, because whether it has settled is
 * the reader's judgement and not this probe's.
 *
 * ---- what each pass does per rung, and why each line is there ----
 *
 * The rung is PINNED (`d.hold`), or a window at rung 28 is a window spent
 * climbing and what it reports is the income of a run somewhere else. It is
 * re-asserted every frame, because `glitchOut` CLEARS the hold on its own
 * line -- a discharge would otherwise unpin the rung mid-window, silently.
 * Discharges are counted and reported; they are a real term in the dwell (a
 * step back) and are NOT in the model, which is a floor on the dwell rather
 * than an estimate of it.
 *
 * The ERA is derived from the rung against `eraGate` and forced, because
 * `reset()` writes era 1 without resizing and `setEra` refuses a switch to
 * the era it is already in -- so the opposite is written first. Build 305's
 * finding, on `tiers.mjs`, which measured band 5 on a field the game does not
 * send it to for nineteen builds. It does NOT model the transformation: a run
 * crossing `eraGate` has to buy NEW FORM, and what that costs is the tree's
 * business rather than the field's. A rung above the gate is measured on the
 * field it is played on, which is the claim.
 *
 * `world.earned` is credited by the FUNDING and not by a line of this
 * probe's own: `debugGiveBytes` adds to the lifetime counter as well as to the
 * purse, deliberately and with the reason at its own site, because object
 * types are gated on lifetime banked since build 180 -- so a rung-35 window
 * funded without it would be a rung-35 wave made of band-1 bodies. It lands
 * before the delta's first sample, so the funding is outside the measurement.
 *
 * The TEACH waves are driven past before the window opens. `restart()` puts
 * the run back on the opening beats, which are authored, exempt from the
 * budget and play from the authored order whatever the rung says -- so a
 * window that opens on one measures the tutorial.
 *
 * The LOADOUT is `tiers.mjs`'s policy verbatim, and deliberately: the damage
 * line in a fixed order, then whatever is left on the rest of the tree in tree
 * order. Two probes measuring against two different players cannot be read
 * together, and that policy is the one this repo's price tables were tuned
 * against. `poor` stops the line and `maxed` skips -- build 178's finding.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import { checkServed, requireWorld } from './served.mjs';
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
/*
 * ---- THE WINDOW IS COUNTED IN WAVES, NOT IN SECONDS ----------------------
 *
 * `--waves N` IS the window: the loop runs until N waves have SCORED and the
 * seam after the last of them has closed. Both terms this probe multiplies
 * are per-wave quantities -- the rate is what the waves it saw banked over
 * the seconds they took, and the dwell is (wave + seam) / rungs-a-wave -- so
 * N waves is the sample size both of them want, and a fixed-seconds window is
 * a different sample size at every rung.
 *
 * WHICH IS THE FAULT IT REPLACES, and this probe's own header carried it for
 * six builds without acting on it: a wave is about 5 seconds at rung 1 and
 * 125.8 at rung 49, so `--window 240` was about forty-eight waves at the
 * bottom of the ladder and ZERO at the top -- measured, two 240s windows at
 * rung 49 that completed no wave at all and reported 24.6 and 184 kB/s
 * against 93.4 over 1200 seconds. A bound chosen once, near the truth,
 * against a quantity that varies 25x across the thing being sampled: build
 * 331's and 364's "a loop bound is a fitted margin wearing a `for`
 * statement's clothes", on a probe's window rather than on a case's.
 *
 * It also SPENDS the time where the precision is needed. A fixed window
 * over-samples the bottom to reach nothing at the top; equal waves moves
 * those seconds up the ladder, so the same statistical power costs less wall
 * clock rather than more.
 *
 * `--window S` forces the old fixed-seconds shape and is KEPT, because an
 * attribution comparing two rates wants equal TIME rather than equal waves --
 * build 364's 2x2 is the reading it exists for. The heading says which of the
 * two shapes a reading was taken under, because a table that does not record
 * its own conditions cannot be read six builds later.
 */
/*
 * ---- ...AND SIX WAVES COULD NOT PRICE THE DEEP RUNGS ---------------------
 *
 * The default was 6 from build 368 and it was chosen for the RATE: six waves
 * is a reasonable sample of what a wave banks. The DWELL wants something the
 * rate does not -- a CLIMB -- and climbs are rare exactly where the ladder is
 * hardest, so the window that samples the rate adequately reports the dwell
 * as unbounded and the curve stops.
 *
 * Measured at build 370, rung 21 funded with what the fixed point gave it
 * (882 kB), everything else loose:
 *
 *   6 waves   0 surge / 0 clean / 6 stall, TWICE over, on two passes -- the
 *             dwell reads `held`, the curve stops at rung 15, and rungs 28,
 *             35 and 49 were priced perfectly and thrown away as collateral
 *   20 waves  0 surge / 2 clean / 17 stall + 1 glitch -- dwell 280.0s
 *
 * So the rung climbs about one wave in ten and six waves sees none of them
 * 0.9^6 = 53% of the time. Rung 42 is the same story: `held` at six waves,
 * 1/2/12 and a dwell of 317.5s at twenty. `held` was NOT a property of those
 * rungs and the curve that stopped below them was not a statement about the
 * ladder -- which is precisely what build 362 read off its own stop line and
 * what `dwellOf`'s note now says in its own words.
 *
 * TWENTY is the measured-adequate number rather than a round one: at a climb
 * rate of one in ten it sees at least one climb 88% of the time, where six
 * sees one 47% of the time. It costs what it says it costs -- rung 21 took
 * 559s of game time and rung 42 took 1270s -- and that is the point of
 * counting the window in waves: the seconds go where the precision is
 * needed. Raise it further for a rung that still reads `held`; the stop line
 * says so and prints the floor.
 */
const WAVES = Math.max(1, Number(flag('waves', 20)));
const WINDOW = flag('window', null) === null ? null : Number(flag('window', 0));
/*
 * `--runs R` takes R windows at every sampled rung, because one window is a
 * DRAW. Build 364 measured the rate at rung 42 spanning 5.75 to 65.9 kB/s and
 * at rung 49 10.8 to 648 at one funding, traced the channel to the trait
 * roll, and priced the alternative: pinning a roll is choosing one (build
 * 338), and pinning BOTH channels is still not exact, so N cannot be 1.
 *
 * Pooled by SELECTING the median run by rate, not by averaging the columns: a
 * mean of R windows' fields is a row no window produced, and this repo has
 * paid for tables that describe no run. A rung is pooled from the runs that
 * could be PRICED and prices at all only if a majority of them could, so a
 * rung that mostly fails to climb is not flattered by the one window that
 * did -- and every run's own figures print under it either way.
 */
const RUNS = Math.max(1, Number(flag('runs', 1)));
let ITERS = Number(flag('iters', 3));
const RUNGS = String(flag('rungs', '')).split(',').filter(Boolean).map(Number);
/*
 * `--spend N` funds every sampled rung with N instead of with the previous
 * pass's curve, which turns the probe from "what does the curve settle at"
 * into "given THIS much money, what happens at this rung". It is what asks
 * whether a rung the curve stopped below is held by the purse or by the
 * ladder: fund it with the whole tree and money can no longer be the answer.
 * The fixed point is meaningless under it -- every pass funds identically --
 * so it forces one pass and says so rather than printing three copies.
 */
const SPEND = flag('spend', null) === null ? null : Number(flag('spend', 0));
/*
 * ---- THE TWO RANDOM CHANNELS, PINNABLE ONE AT A TIME ---------------------
 *
 * Both default OFF and the measured curve is taken with both loose, because
 * pinning a roll is choosing one (build 338) and an anchor taken under a pin
 * is an anchor for that roll. They exist to ATTRIBUTE the spread, which is a
 * different question from what the curve settles at, and they turn a
 * deep-rung A/B from unreadable into exact.
 *
 * `--seed N` writes `world.runSeed` after the restart, which is the TRAIT
 * sequence: `traitsFor` is `traitAt(runSeed, cycle, index, slot)`, so a
 * pinned seed makes the window see the same rules in the same order.
 * `--rand N` replaces Math.random with a fresh xorshift32 at the top of
 * every window, which is everything else -- the wave shuffle, and every
 * per-body route, side, scale, health and spawn-x roll.
 *
 * THE TRAP, AND IT IS WHY THE VARYING CELL NEEDS `--seed` EXPLICITLY:
 * `restart()` draws the run's seed off Math.random, so `--rand` ALONE pins
 * the trait sequence too and collapses the two cells into one. To vary the
 * traits with everything else held, pass `--rand R` with a DIFFERENT
 * `--seed` per run.
 */
const SEED = flag('seed', null) === null ? null : Number(flag('seed', 0));
const RAND = flag('rand', null) === null ? null : Number(flag('rand', 0));
/*
 * `--grant` puts `recast` in the LEDGER before the buying loop, which is the
 * one thing that makes CORE reachable: it is the tree's only node behind a
 * `needs` PREDICATE, it needs the NEW FORM, and the NEW FORM is
 * `currency: 'remainder'` and not payable in bytes at all -- so every funded
 * window this probe has ever taken is short of CORE's x3.32, the largest
 * single node in the tree by multiplier. The ledger and not the flag,
 * because `owned()` counts `world.ledger` and reads nothing else (build
 * 266). Off by default: whether the modelled turret owns the remainder is
 * the curve's decision and not a probe default.
 */
const GRANT = args.includes('--grant');
/*
 * `--press` presses PULSE the instant it recharges, which is the OTHER half
 * of what the curve models. The probe shoots and has never pressed anything,
 * and one trait makes that the difference between a wave paying and a wave
 * paying nothing: EBB reverses a mote's steering for the whole of its life
 * and drops do not expire, so an EBB wave's salvage runs to the arena edge
 * and is never banked -- and EBB's own docstring names the answer, "PULSE
 * and INTAKE still overrule it, because taking energy in by hand is the
 * answer to this and it should keep working". So the loose reading is the
 * income of a run that never answers, which is a FLOOR, and pressing on
 * cooldown is the ceiling. Off by default for `--grant`'s reason: whether
 * the modelled run presses is the curve's decision, not a probe default.
 */
const PRESS = args.includes('--press');
const URL = flag('url', 'http://127.0.0.1:8099/index.html');
// Which tree is this reading? `scripts/served.mjs` carries the whole finding;
// the short version is that this container's http-server serves its own CWD
// and ignores a trailing path, so a `--url` reading can silently be of the
// live tree. The heading names the served BUILD every run and `--expect NNN`
// refuses a mismatch, because printing is not guarding.
const { served, abort: wrongTree } = await checkServed(URL, flag('expect', null), 'income.mjs');
if (wrongTree) process.exit(1);

/*
 * The damage line, in the order income reaches it -- `tiers.mjs`'s LINE, and
 * it is a COPY on purpose rather than an import. This probe imports nothing
 * from `../src/`, which is what keeps it aimable at any served tree
 * (`check-build.mjs` derives that asymmetry from the imports; build 347). A
 * shared constant would have to live in `src/` or in a fourth file, and
 * either makes this probe refuse a base that is not its own checkout.
 */
const LINE = [
  'hollowpoint', 'rate',
  'hollowpoint', 'hollowpoint',
  'hollowpoint', 'hollowpoint',
  'overstuffed',
  'overstuffed', 'overstuffed', 'overstuffed',
  'salvo',
  'casing', 'casing', 'casing',
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH
    || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
// The determinism recipe, three findings deep and all of it harness rather
// than game: stub rAF so nothing advances but our own loop, block the service
// worker so a stale cache cannot serve a different build, and stub
// AudioContext because audio.init fills a noise buffer with fifty thousand
// Math.random draws at an unpredictable moment.
await page.addInitScript(() => {
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
});
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__sim);
// What this probe's figures are read off. `served.mjs` refuses a served tree
// that lacks any of them: the purse is declared because it HAS been renamed
// (world.energy -> world.bytes at build 286), which is what made phase 5's
// build-283 column a table of a tree it never read.
{
  const { abort } = await requireWorld(page, ['bytes'], 'income.mjs');
  if (abort) { await browser.close(); process.exit(1); }
}

/** The ladder's own gate rungs, derived, so a change to the table moves this. */
const gates = await page.evaluate(async () => {
  const { CFG } = await import('../src/config.js');
  const T = CFG.waves.tier;
  return { gates: T.gates.slice(), ceiling: T.ceiling, eraGate: T.eraGate, bossEvery: T.bossEvery };
});
/*
 * ---- ASCENDING, because `pick` walks forward and clamps on both ends ----
 *
 * `pick` returns `samples[0]` below the first rung and `samples[last]` above
 * the last, then walks forward looking for the first bound above the rung it
 * was asked for -- all three of which are only correct for an ascending list.
 * `--rungs` is taken in the order typed, and `--rungs 49,42` is a perfectly
 * ordinary attribution invocation, as is appending a rung to an existing
 * list. Measured on the sliced function: handed 14,7,1 every rung from 1 to
 * 14 returns the TOP sample's dwell and rate, so the whole curve is built
 * from one sample; handed 1,14,7, rungs 10 and 14 read 20 where ascending
 * reads 28.57 and 40.
 *
 * Sorted rather than refused, because the measurements are the same
 * measurements whatever order they were asked for and only the interpolation
 * cares -- and the reorder is PRINTED, so a reader who meant something by the
 * order finds out. The sibling misuse (a repeated rung) is caught and
 * disqualifies the reading; that this one was not is the asymmetry that
 * makes it a fault rather than a matter of likelihood.
 */
const ASKED = RUNGS.length ? RUNGS : [1, ...gates.gates];
const SAMPLE = [...ASKED].sort((a, b) => a - b);
const RESORTED = ASKED.join(',') !== SAMPLE.join(',');
/*
 * `--rungs 42,42,42,42` is how several windows are taken at ONE rung in one
 * launch, which is what an attribution needs and what the browser launch per
 * window would otherwise cost. It is a real idiom and it breaks the curve:
 * `pick` interpolates over the sampled rungs and a duplicate makes that
 * arithmetic meaningless, so the anchors printed under it are not anchors.
 *
 * Said out loud AND refused from build 369: it is one of the five conditions
 * that disqualify a reading as the curve, so the anchors block prints no
 * paste-ready line under it. Until then it was said out loud and the line was
 * printed anyway, four output lines under its own `NOT ANCHORS` heading -- a
 * that prints a table nobody can read and exits 0 is this repo's own scar,
 * and so is a warning nothing acts on.
 */
const REPEATED = SAMPLE.length !== new Set(SAMPLE).size;

/**
 * One window: fund the rung, pin it, drive it, and report what it banked.
 *
 * Everything the window depends on is set explicitly rather than inherited --
 * the round, the assists, the era, the roster gate, the field. `restart()` is
 * not a reset of everything a probe can leave behind, which is the rule two
 * flaky cases and three probes in this repo have each paid for.
 */
async function windowAt(rung, spend, want, seconds) {
  return page.evaluate(async ({ rung, spend, want, seconds, line, seed, rand, grant, press }) => {
    const { CFG } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    const S = 1 / 60;
    /*
     * A fresh stream per window, installed BEFORE the restart, because the
     * restart's own `runSeed` draw comes off it -- so this pins the trait
     * sequence as well unless `seed` varies. xorshift32, the same generator
     * `fight.mjs` installs for the canonical hash and `titleRandom` runs the
     * scenery on; a fresh closure each window is how the state is reset.
     */
    if (rand !== null) {
      let x = (Number(rand) + 0x9e3779b9) >>> 0 || 1;
      Math.random = () => {
        x ^= x << 13; x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5; x >>>= 0;
        return x / 4294967296;
      };
    }
    g.restart();
    // AFTER the restart, which is the one writer that would overwrite it.
    if (seed !== null) w.runSeed = Number(seed) | 0;
    w.phase = 'staging';
    g.debugTeachAll();

    // The field this rung is played on, derived from the gate and forced.
    const era = rung > CFG.waves.tier.eraGate ? 2 : 1;
    w.era = era === 2 ? 1 : 2;
    w.newForm = era === 2 ? 'done' : 'armed';
    g.setEra(era);

    /*
     * The remainder, if this run is modelled as having answered for it. Only
     * the LEDGER is written: `world.newForm` is already 'done' at era 2 four
     * lines above, and setting the flag is not owning the node -- `owned()`
     * counts `world.ledger` and reads nothing else, which is why a probe that
     * set the flag measured CORE at zero levels and read as a broken loop.
     */
    if (grant) w.ledger.push('recast');

    // The loadout: the damage line first, then the rest of the tree in tree
    // order. `poor` stops the line; `maxed` skips it.
    const bought = [];
    if (spend > 0) {
      g.debugGiveBytes(spend);
      for (const id of line) {
        const got = g.buy(id);
        if (got === 'poor') break;
        if (got === 'ok') bought.push(id);
      }
      /*
       * PASSES until one buys nothing, not one pass -- build 302's rule.
       *
       * A node gated on a `needs` PREDICATE rather than on a parent is
       * refused while its gate is shut, and a single walk of `NODES` never
       * comes back for it. It is a latent trap rather than a live fault, and
       * measuring which is the whole of the note below: `buys` is 107 and
       * `core` 0 with one pass and with eight, identically, at any spend.
       *
       * ---- AND CORE IS NOT BOUGHT AT ALL, WHICH IS NOT THIS LOOP ----
       *
       * There is exactly one `needs`-predicate chain in the tree and it is
       * the damage line's second half: CORE needs NEW FORM owned, and NEW
       * FORM is `currency: 'remainder'` -- one remainder per anomaly
       * reconciled under the era hold, `CFG.ordinal.recast` of them, and NOT
       * payable in bytes at all. The loop skips every `currency` node and has
       * to: a probe that handed over 200 MB has bought nothing towards it.
       * So CORE's four levels at x1.35 -- x3.32, the largest single node in
       * the tree by multiplier -- are missing from every funded window this
       * probe has ever taken, at every spend, and no pass count reaches them.
       * Setting `world.newForm` does not do it either: `owned()` reads the
       * LEDGER, which is why build 266 records that anything needing NEW FORM
       * writes `recast` into the ledger rather than setting the flag.
       *
       * That is a statement about what this probe MODELS -- a turret funded
       * in bytes -- and a run standing at rung 35 or 42 has answered five or
       * six gates and can certainly own NEW FORM, so the model is short of
       * the turret those slots actually meet. Granting the remainder is a
       * decision the curve's re-take has to make and this build does not: it
       * would move every anchor from rung 28 up, which is the rung CORE's
       * 5.32 MB first becomes affordable at.
       *
       * The passes stay because the trap is real and they cost nothing; the
       * cap is a backstop so a future gate cycle cannot spin.
       */
      for (let pass = 0; pass < 8; pass++) {
        let any = false;
        for (const n of NODES) {
          if (!n.id || n.repeat || n.dormant || n.currency) continue;
          while (g.buy(n.id) === 'ok') { bought.push(n.id); any = true; }
        }
        if (!any) break;
      }
    }
    if (w.round !== 'standard') w.round = 'standard';
    w.autoAim = true;
    w.autoFire = true;

    /*
     * The roster gate needs no line of its own: `debugGiveBytes` credits
     * `world.earned` as well as the purse, and says why at its own site --
     * object types are gated on lifetime banked since build 180, so bytes
     * handed over without it would open the tree and leave a rung-49 window
     * fighting MOTEs. It is credited BEFORE `earned0` is sampled below, so
     * the funding is outside the delta this probe measures.
     *
     * Which is also why pass 1 under-reports at a deep rung for TWO reasons
     * rather than one: no turret, and `earned` at zero, so the roster it is
     * sent is band 1's. Both are fixed by the next pass funding it.
     */

    const { hostileCount } = await import('../src/enemies.js');
    const { ABILITIES } = await import('../src/abilities.js');
    const d = w.director;
    d.setTier(rung);
    d.hold = true;
    g.debugClearField();
    /*
     * ---- `hold` PINS THE CLIMB AND NOT THE RUNG, so the rung has to be
     * ---- RE-ASSERTED and not only the flag ----------------------------
     *
     * `d.hold` has exactly ONE reader in the game -- `score`'s climb branch,
     * `else if (!this.hold)` (src/enemies.js:9495) -- so it stops the ladder
     * going UP and nothing else. A glitch discharge is the one verdict that
     * takes a rung AWAY, and `glitchOut` does `this.tier--` and then clears
     * the hold, under the game's own comment: "A step back re-arms the climb
     * even under HOLD. The pin holds the climb, not the relief."
     *
     * So re-asserting `hold` every frame -- which both loops below did, for
     * the stated reason that a discharge would otherwise unpin the climb --
     * restored exactly the relief that would have climbed the rung back, and
     * left the decrement standing. A window walked DOWN one rung per
     * discharge, for good, while its rate, its wave length and its seam were
     * all credited to the rung in the LABEL.
     *
     * Measured off the readings this fault produced, which is how it was
     * found: pass 1 at rung 21 recorded SIX discharges over six waves, so
     * that window ended at rung 15 and reported itself as 21; the same pass
     * at rung 49 recorded six, and a twenty-wave window at rung 42 recorded
     * seven, ending at 35. Only a well-funded pass escaped it -- pass 3
     * read `gl` 0 at seven of eight rungs -- which is why the corruption was
     * worst exactly where the ladder is hardest and the anchors are softest.
     *
     * `setTier` is the machinery's setter and does not gate, which is what a
     * probe wants; it also raises `peak`, so the rung stays reachable. The
     * re-pins are COUNTED and reported, because a pin that had to fire is a
     * discharge the window absorbed, and a reader who cannot see that number
     * cannot tell a rung that held from one that was held.
     */
    let repins = 0;
    const pin = () => {
      d.hold = true;
      if (d.tier !== rung) { d.setTier(rung); repins += 1; }
    };

    /*
     * Drive past the opening TEACH beats -- authored, exempt from the wave
     * budget, and played from the authored order whatever the rung says -- and
     * stop ON the frame a wave BEGINS.
     *
     * The boundary matters and the first version did not have it. Opening the
     * window mid-wave means that wave's start is outside it, so it is never
     * recorded and its seconds are charged to nothing: measured at rung 21,
     * where a bare gun holds the field at the cap and the release gate then
     * keeps the next wave back, the window saw ONE wave boundary in 150
     * seconds and reported zero scored waves. A window that opens on a
     * boundary charges every second it spends to a wave or to a seam.
     */
    let warm = 0;
    let wasResting = d.resting;
    while (warm < 60 * 600) {
      // The warm-up is inside the pin too: a discharge while driving past the
      // teach beats dropped the rung before the window had even opened.
      pin();
      g.update(S);
      warm++;
      const fresh = wasResting && !d.resting;
      wasResting = d.resting;
      if (fresh && d.wave && !d.wave.teach) break;
    }

    const waves = [];
    const seams = [];
    /*
     * SEEDED with the wave the warm-up landed on, and build 362 did not seed
     * it -- so every window silently dropped its FIRST wave, and the seam
     * after it with it.
     *
     * `lastAt` below is initialised to `d.at`, and a wave is entered on
     * `d.at !== lastAt`, so the wave the window OPENS on never satisfied that
     * test: no `cur`, therefore nothing pushed when it ended, therefore no
     * `endedAt` and no first seam either. The bias is one whole wave per
     * window, which is invisible where a window holds fifteen and is most of
     * the reading where it holds two -- a 240-second window at rung 42
     * reported one wave and had seen two. Worse at the top, where it is the
     * difference between a sample and nothing at all.
     */
    const ruleset = () => (d.traits || []).map((t) => t.id || t).join('+') || '-';
    let cur = { at: d.at, teach: !!(d.wave && d.wave.teach), f0: 0, earned0: w.earned,
      rules: ruleset() };
    /*
     * ...and the SEEDED wave needs the verdict cleared too, which the loop's
     * own clear cannot do for it.
     *
     * The clear that stops an unscoreable wave inheriting the previous one's
     * verdict sits in the wave-START branch, and this wave is seeded from
     * OUTSIDE the loop -- so wave 1 of every window never passed it and could
     * still be handed whatever the warm-up's last wave left in the field. It
     * is the likeliest one to need it: band 1 holds five waves of which one is
     * the drift-only bonus, and the warm-up drives until a non-teach wave
     * STARTS, so there is always a real verdict sitting there.
     *
     * Found by walking the fix's own code path rather than by a reading --
     * which is the half of "render the line" that applies to a branch: ask
     * which callers reach it, not only whether it works when reached.
     */
    d.lastVerdict = null;
    let endedAt = null;
    let lastAt = d.at;
    let lastResting = d.resting;
    let glitches = 0;
    /*
     * The two readings that say WHY a wave did not end, which the first
     * version of this probe did not take and which cost build 362's note its
     * mechanism. `Director.update` is `if (this.jobs.length) { emit; return }`
     * and `this.wait += dt` is BELOW that -- so `patience` (26s), the clause
     * whose whole job is that "one object loitering out of reach can never
     * stall the run", does not start until the wave is fully let out. And
     * `emit` refuses to release while `hostileCount >= maxEnemies` and HOLDS
     * the job rather than dropping it. So a wave whose ask is larger than a
     * field the gun cannot clear below the cap does not end LATE, it does not
     * end: the jobs never drain, the patience clock never starts, and no
     * number in the window says so unless the jobs and the field are read.
     */
    let fieldSum = 0;
    /*
     * PULSE, through `useAbility` -- the handler the button and the keyboard
     * both call, not `Abilities.trigger` underneath it, which is the rule a
     * shipped AUTO AIM fault paid for. It refuses when the slot is spent, so
     * asking every frame is a press the instant it recharges; the count comes
     * off the slot's own charges, because the handler returns nothing.
     *
     * The count is also the check on the loop: a fully bought turret owns
     * STANDING ORDER's two levels, so PULSE's clock is 7 * 0.64 and a
     * 300-second window holds 67 of them -- measured 68, which is the
     * arithmetic agreeing with the instrument rather than the instrument
     * agreeing with itself.
     */
    const pulseAt = ABILITIES.findIndex((a) => a.id === 'pulse');
    let pulses = 0;
    const earned0 = w.earned;
    /*
     * ---- THE FRAME BOUND IS A RUNAWAY GUARD, NOT A SAMPLE SIZE ----------
     *
     * With `--window S` it is `S * 60` and this is the old loop. Otherwise
     * the SAMPLE SIZE is `want` waves and this is only what stops the loop
     * when a wave never ends -- the same kind of thing as the eight-pass cap
     * on the buying loop above, and it is named that way rather than dressed
     * up as a prediction.
     *
     * A WAVE THAT DOES NOT END IS A REAL STATE AND THE CONFIG CANNOT BOUND
     * IT. `emit` refuses to release while `hostileCount >= maxEnemies` and
     * HOLDS the job, and `this.wait += dt` sits BELOW
     * `if (this.jobs.length) { emit; return }` -- so a wave whose ask is
     * larger than a field the gun cannot clear never drains its jobs, never
     * starts the `patience` clock, and genuinely has no end to wait for.
     *
     * SO IT IS MEASURED RATHER THAN DERIVED, and the first attempt at
     * deriving it is worth recording because it failed in a way that looked
     * right. It was `ALLOW * (jobsAt * press.open + patience + rest[1] +
     * restCap)`, which reads as the wave's own schedule -- and `jobsAt` at
     * ONE rung measured 2, 3 and 140, because `load` splits a type it cannot
     * form up into singles. So the derived base spanned 31 to 232 seconds at
     * rung 49 while the thing it was bounding, the HOLD, correlates with
     * neither: at ALLOW 3 it cut a window off at 98.5s having scored nothing,
     * and any factor large enough to clear the tail at two jobs bounds a
     * 140-job wave at half an hour. A derivation whose own spread is 7x on a
     * quantity it does not model is worse than a flat guard, because it looks
     * like it knows something.
     *
     * The flat figure is measured at the deepest rung, which is where the
     * distribution's tail is: a 1200-second window at rung 49, fully funded,
     * scored 5 waves of mean 193.5s and a WORST OF 426.8 -- so 1200 is 2.8x
     * the longest wave this game produces. It also subsumes the release term
     * the derivation was built out of: at `press.open` a wave would need 827
     * job entries for its release alone to reach 1200s, against 140 measured.
     * PER WAVE rather than accumulated, so the slack a quick wave leaves
     * cannot be spent on a later one that has hung.
     *
     * When it fires the row prints `!` and the window reports `short` with
     * `jobsLeft` beside it, which is the pair that says a wave had not
     * finished ARRIVING rather than merely being long. The obvious
     * improvement is to stop on that CONDITION instead of on this clock --
     * jobs not draining against a field pinned at the cap is a positive test
     * for the held state, and it would cost seconds where this costs 1200 --
     * and it is a judgement of its own rather than a bound.
     */
    const GUARD = 60 * 1200;
    let allow = GUARD;
    let deadline = seconds !== null ? Math.round(seconds * 60) : allow;
    let stop = seconds !== null ? 'window' : 'allowance';
    let scoredN = 0;
    let f = 0;
    while (f < deadline) {
      // Re-asserted every frame, BOTH of them: `glitchOut` clears the hold
      // AND decrements the rung, and this used to restore only the flag.
      pin();
      g.update(S);
      if (d.at !== lastAt && !d.resting) {
        cur = { at: d.at, teach: !!(d.wave && d.wave.teach), f0: f, earned0: w.earned,
          rules: ruleset() };
        /*
         * ---- AN UNSCOREABLE WAVE MUST NOT INHERIT THE LAST ONE'S VERDICT --
         *
         * `Director.score` returns null for `!wave || wave.teach ||
         * this.asked === 0` (src/enemies.js:9365) and never reaches the line
         * that writes `lastVerdict`, which has three writers in the whole
         * game -- the constructor, `glitchOut` and `score` -- and is cleared
         * between waves by NOTHING, not even `reset()`.
         *
         * The drift-only bonus wave is exactly that case: `{ of: [], drift:
         * 22, dwell: 8, band: 1 }` asks for no hostiles, `load` excludes
         * harmless from `asked`, it is not `teach`, and it still goes resting.
         * So the wave-end branch below read the PREVIOUS wave's verdict off a
         * field nobody had rewritten, recorded the bonus wave as scored,
         * added its 1 or 2 to `steps` and spent one of the window's N waves
         * on it. Seen in build 370's own first run at rungs 1 and 7: rows
         * with `asked 0  made 0  slain 0` carrying a verdict of `clean`.
         * `steps/waves` rises, so the DWELL FALLS, and band 1 is drawn at
         * rungs 1, 7 and 14 -- the bottom of the curve every anchor above it
         * is accumulated from.
         *
         * Clearing it at the wave's START is what makes the absence legible:
         * `score` writes it at the wave's END, so the previous wave's verdict
         * has already been consumed by the branch below. A null verdict is
         * then a wave that could not be scored, and it falls out of `scored`,
         * out `steps` and out of `scoredN` -- while its SECONDS and its PAY
         * stay in the window's rate, which is right: the bonus wave really
         * does pay (60.6 kB at rung 1, the largest single payout there) and
         * really does take time. It is the CLIMB it cannot contribute.
         *
         * The game's own comment above that early return names this wave and
         * says it "was a free rung every cycle -- observed climbing 15 to 16
         * for shooting nothing", which is the same fault on the ladder rather
         * than in the probe. Build 369's note that it "scores a SURGE by
         * construction" is wrong in both halves and is struck.
         */
        d.lastVerdict = null;
        lastAt = d.at;
        if (endedAt !== null) { seams.push((f - endedAt) / 60); endedAt = null; }
        // The guard is per WAVE, so it is re-armed from here rather than
        // accumulated: no wave gets more than `GUARD` whatever came before.
        if (seconds === null) deadline = f + allow;
      }
      /*
       * The three terms a wave's pay is a PRODUCT of, read off the director
       * every frame the wave is running and used at its last one -- because
       * `score()` and `glitchOut` both clear all three, so reading them in
       * the wave-end branch below reads zeroes.
       *
       *   asked  how many bodies the wave QUEUED, after the budget's swell
       *   made   how many were actually entered -- which is not `asked`,
       *          because a QUARRY fractures into three, a SPLITTER sheds
       *          four motes and a REMNANT comes back, and every child
       *          carries its parent's wave serial
       *   slain  how many died
       *   take   what their wreckage was worth RAW, before the intake tax
       *          and before the depth dividend -- `bank()` accumulates it on
       *          the one line energy enters a run
       *
       * So `paid = slain * (take / slain) * tax`, and a window that banked a
       * twenty-sixth of another window's can only have killed fewer, killed
       * cheaper, or been taxed harder. The window's own RATE cannot say
       * which, and build 364 left that factor unattributed for exactly this
       * reason.
       *
       * `made` IS THE KILL DENOMINATOR AND `asked` IS NOT, measured: the
       * first version of this split divided by `asked` and read shares of
       * 1.71, 1.04 and 1.02 -- a kill share over 1, on a working build,
       * because the children above are slain and were never queued.
       * `cleared()` divides by `made + queued` and clamps at 1 for the same
       * reason, four hundred lines up the same file. `asked` is kept because
       * it is the ROSTER term -- how big a wave the budget bought -- and it
       * is the one of the two that SWARM doubles.
       *
       * One smear, stated rather than corrected: a drop banked after its own
       * wave has ended is credited to whatever is running when it lands, in
       * `take` and in `paid` alike (`bank` adds to `take` only while the
       * director is not resting, so a drop collected during the SEAM reaches
       * `paid` and not `take`). That is not noise to remove -- delaying
       * salvage is precisely what EBB does -- so the terms are read as the
       * wave's account rather than as its bodies' worth.
       */
      /*
       * ...and read only while the wave is STILL RUNNING. `score()` and
       * `glitchOut` both zero all four of these and both write `resting`, so
       * a capture that runs unconditionally overwrites the wave's account
       * with the cleared values on the very frame it ends -- measured, `take`
       * read 0.00 B and `tax` was unreportable on every row. The last frame
       * the state held is the reading, which is a rule this repo has now paid
       * for on five different quantities.
       */
      if (cur && !d.resting) {
        cur.asked = d.asked; cur.made = d.made;
        cur.slain = d.slain; cur.take = Math.round(d.take);
        /*
         * ...and the two readings that separate the ROSTER from the
         * TRANSPORT, which `take` alone cannot: it counts what was BANKED
         * raw, so a wave of light bodies and a wave whose salvage never
         * arrived collapse to the same small number.
         *
         *   of     which authored wave the shuffle dealt. `d.wave` is a
         *          GETTER off `order[at]`, so it has to be read while the
         *          wave is the running one. A band-5 wave of BULWARKs and
         *          one of MOTEs weigh the same THREAT -- `load` swells every
         *          wave until it meets `budgetAt` -- and are worth wildly
         *          different money, because pay comes off a body's MASS and
         *          threat off its health.
         *   drops  salvage still on the floor. Drops do not expire (build
         *          325 deleted the `ttl`), so a wave whose motes never
         *          reached the intake leaves them lying there and the pile
         *          is the transport term made visible.
         */
        cur.of = d.wave && d.wave.of
          ? d.wave.of.map(([t, n]) => `${t}x${n}`).join(',') : '-';
        cur.drops = w.drops.length;
        /*
         * ...and what the pile is WORTH, plus how much of it carries EBB --
         * the rule that steers a mote away from the machine. A mote copies
         * its parent's traits at `shed` time and keeps them for life, so an
         * EBB drop is an EBB drop for ever, whatever the wave that follows
         * rolled. With no expiry (build 325 deleted the `ttl`) and one door
         * out (being collected), those two numbers are what turns a CAP into
         * a RATCHET: a slot taken by a mote that will never arrive is a slot
         * no later wave can shed into.
         */
        cur.dropBytes = Math.round(w.drops.reduce((a, x) => a + (x.bytes || 0), 0));
        cur.dropEbb = w.drops.filter((x) => (x.traits || [])
          .some((t) => (t.id || t) === 'ebb')).length;
      }
      if (lastResting === false && d.resting && cur) {
        cur.dur = +((f - cur.f0) / 60).toFixed(2);
        cur.verdict = cur.teach ? 'unscored' : d.lastVerdict;
        cur.paid = Math.round(w.earned - cur.earned0);
        if (cur.verdict && cur.verdict !== 'unscored') scoredN++;
        waves.push(cur);
        cur = null;
        endedAt = f;
      }
      /*
       * A discharge is counted once and the verdict is then cleared, because
       * `glitchOut` writes it and nothing else clears it until the next wave
       * scores -- so a single discharge would otherwise be counted on every
       * frame of the rest of the wave. Clearing a READOUT field from a probe
       * is a mutation the game can see: it is read by the rail and by
       * `Hud.markStep`, neither of which this probe draws, and `score()`
       * writes it fresh at the end of every wave.
       */
      if (d.lastVerdict === 'glitch') { glitches++; d.lastVerdict = null; }
      fieldSum += hostileCount(w);
      if (press && pulseAt >= 0) {
        const had = w.abilities.slots[pulseAt].charges;
        g.useAbility(pulseAt);
        if (w.abilities.slots[pulseAt].charges < had) pulses++;
      }
      lastResting = d.resting;
      f++;
      /*
       * ...and the target is N waves AND the seam after the last of them,
       * which is what `endedAt === null` says: the seam is pushed on the
       * frame the NEXT wave begins, so stopping on the Nth wave's own end
       * would leave the window with N waves and N-1 seams and a dwell built
       * from two different sample sizes.
       */
      if (seconds === null && scoredN >= want && endedAt === null) { stop = 'waves'; break; }
    }

    const scored = waves.filter((x) => x.verdict && x.verdict !== 'unscored');
    const n = (v) => scored.filter((x) => x.verdict === v).length;
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    return {
      rung, era, spend, buys: bought.length,
      /*
       * CORE's levels, reported because it is the one node in the tree behind
       * a `needs` PREDICATE rather than a parent and therefore the one a
       * buying loop can silently never reach. A count of 0 at a spend past
       * its price is this loop broken again; the general figure is `buys`,
       * and a total cannot say which node is missing.
       */
      core: bought.filter((x) => x === 'core').length,
      /*
       * The wave rules the window ACTUALLY PLAYED, one entry per wave and
       * de-duplicated -- reported because the rate at a deep rung is not
       * reproducible and this is the candidate.
       *
       * `restart()` re-rolls `world.runSeed` and `traitsFor` is
       * `traitAt(runSeed, cycle, index, slot)`, so every window draws its own
       * sequence -- and SWARM doubles a wave's bodies while halving their
       * health, which is most of what a rung banks a second. Measured over
       * two 1200-second windows at one spend, the rate at rung 42 read 8.88
       * and 65.9 kB/s and at rung 49 93.4 and 10.8: a factor of 7 to 9, in
       * opposite directions, over twenty game-minutes each.
       *
       * BUILD 363 READ `d.traits` HERE, ONCE, AFTER THE LOOP -- which is the
       * rules of the LAST wave and not of the window. A rung's traits are
       * drawn per wave, so a window with nine waves had nine sets and the
       * column printed one of them, in the build whose own note says a reader
       * "cannot see which roll a figure came from unless it is printed beside
       * it". Same fault as a probe that reduces a population to its worst
       * member: the column was the population's last element.
       */
      rules: [...new Set(scored.map((x) => x.rules))].join(' '),
      /*
       * What each scored wave paid, which the window's own RATE cannot say --
       * and the difference between the two readings is the whole of this
       * build's finding. A rate of 7 kB/s against 328 over the same 300
       * seconds is either every wave paying a fortieth or one wave in four
       * paying everything, and those want different re-takes: the first is
       * answered by runs, the second cannot be answered by runs at all.
       * `cur.paid` was captured from build 362 and thrown away.
       */
      paidEach: scored.map((x) => x.paid),
      /*
       * ONE ROW PER WAVE, each wave's pay beside ITS OWN rules -- which is
       * the pairing neither of the two previous versions of this column had,
       * and the whole of what build 364 got wrong.
       *
       * Build 363 printed `d.traits` once after the loop: one of N. Build
       * 364 replaced it with the de-duplicated SET of every ruleset the
       * window played, which is N of N and still cannot say WHICH wave had
       * WHICH -- so a window printing `[869kB 1.98MB ...]` beside
       * `swarm+mending ebb+armored` was read as "its ebb-free waves paid
       * 869 kB", and that identification was never in the data. A set is not
       * a pairing.
       */
      waveRows: scored.map((x) => ({
        asked: x.asked, made: x.made, slain: x.slain, take: x.take,
        paid: x.paid, dur: x.dur, verdict: x.verdict, rules: x.rules,
        of: x.of, drops: x.drops, dropBytes: x.dropBytes, dropEbb: x.dropEbb,
      })),
      /*
       * The split, per window, of the product above. Reported as three
       * numbers and not as one, because they answer three different
       * questions about a poor window: whether the wave was SENT (asked),
       * whether it was KILLED (the share), and what the bodies were WORTH
       * (raw bytes a slain body). `tax` is the fourth and is the intake
       * multiplied by the depth dividend, recovered as the ratio rather than
       * read off `CFG`, so a change to either is visible here.
       */
      asked: Math.round(mean(scored.map((x) => x.asked))),
      killShare: +mean(scored.map((x) => (x.made ? x.slain / x.made : NaN))).toFixed(3),
      perBody: Math.round(mean(scored.map((x) => (x.slain ? x.take / x.slain : NaN)))),
      tax: +mean(scored.map((x) => (x.take ? x.paid / x.take : NaN))).toFixed(2),
      pulses,
      banked: Math.round(w.earned - earned0),
      /*
       * Over the seconds the window ACTUALLY spent, which is not the seconds
       * it was allowed: a wave-counted window stops on its own target, so
       * dividing by the requested figure would scale every rate by however
       * much the loop stopped short by. `banked`, `secs` and `rate`
       * reconcile against each other in one row, which is the form this repo
       * prefers to a guard on a probe's arithmetic.
       */
      secs: +(f / 60).toFixed(1),
      /*
       * The runaway guard, PRINTED beside the seconds spent and the longest
       * wave -- build 364's rule about a loop bound, which is that a reader
       * cannot see the headroom unless both figures are there. Read it
       * against `durMax`: a row whose longest wave is anywhere near it is a
       * row whose window could stop for the wrong reason.
       */
      allowS: +(allow / 60).toFixed(1),
      jobsAt: d.jobsAt,
      want, stop,
      rate: +((w.earned - earned0) / (f / 60)).toFixed(1),
      waves: scored.length, surge: n('surge'), clean: n('clean'), stall: n('stall'),
      glitches,
      /*
       * How many discharges the pin had to ABSORB, and the rung the window
       * actually finished on. Both, because they answer different questions:
       * `repins` says the window was held rather than that it held, and
       * `tierEnd` is the flat assertion that the pin worked -- it must equal
       * the rung in the label, and before build 370 it did not.
       */
      repins,
      tierEnd: d.tier,
      /*
       * RAW, with the rounding done where it is printed. Both terms of the
       * dwell's numerator were stored at `toFixed(1)` -- the figures the
       * `wave s` and `seam s` columns show -- and then summed and divided in
       * `dwellOf`, which is build 313's "round for the message, divide the
       * raw" broken on the quantity the curve is made of. Small (a 0.1s
       * quantum on each term is about 1.3% of rung 1's 7.5s dwell and noise
       * at the deep rungs) and the rule does not scale with the magnitude.
       */
      waveSec: mean(scored.map((x) => x.dur)),
      /*
       * The LONGEST wave, beside the mean -- which is what the allowance
       * above has to clear, and what a mean cannot say. Build 362 already
       * recorded that this distribution has a tail (a mean of 125.8 at rung
       * 49 with 240-second windows completing nothing), so a factor set
       * against the mean is a factor that binds on the tail.
       */
      durMax: scored.length ? +Math.max(...scored.map((x) => x.dur)).toFixed(1) : 0,
      /*
       * The seam, MEASURED between one wave ending and the next beginning --
       * not `CFG.waves.rest`, which is only the first term of it.
       *
       * The authored rest is 0.4-1.1s plus `restPer` a body capped at
       * `restCap`, so about 2.5s at worst; what a window actually spends
       * between waves at a deep rung is the build-291 RELEASE GATE, which
       * holds the next wave until the field is as thin as the last one was
       * required to leave it. Against a gun that cannot clear, that is the
       * dominant term of the dwell and the config cannot see it -- measured
       * 0.8s at rung 1 against tens of seconds where the field stands.
       */
      rest: mean(seams),  // RAW, for the reason on `waveSec` above
      seams: seams.length,
      field: +(fieldSum / Math.max(1, f)).toFixed(1),
      cap: CFG.maxEnemies,
      /*
       * Seconds the wave in progress had been running when the window CLOSED,
       * and the one column that turns a wave count of 0 into a number.
       *
       * The window opens on a wave's first frame, so nothing is partial at
       * the start and this is the whole of the window's unaccounted time. A
       * mean wave length cannot say why a window saw no end -- at rung 49 the
       * mean is 125.8s and a 240s window still saw none, twice, because the
       * distribution has a tail -- and the alternative is arithmetic on the
       * means, which is a derivation where a measurement was available.
       */
      openS: cur ? +((f - cur.f0) / 60).toFixed(1) : 0,
      /*
       * Jobs still to be let out on the window's LAST FRAME -- a snapshot of
       * whichever wave was in progress when it closed, and nothing more. Read
       * it beside `waves`: non-zero with `waves` at 0 says the one wave this
       * window ever saw had not finished ARRIVING, so `patience` had not
       * started and there was never going to be an end to see. Non-zero with
       * waves completed says only that the next wave was still coming out,
       * which is the ordinary state at any instant -- measured 55 at rung 42
       * on a window whose dwell priced perfectly.
       */
      jobsLeft: d.jobs.length,
      purseLeft: Math.round(w.bytes),
    };
  }, { rung, spend, want, seconds, line: LINE, seed: SEED, rand: RAND, grant: GRANT,
    press: PRESS });
}

// ---- the passes -----------------------------------------------------------

const fmt = (b) => {
  const u = ['B', 'kB', 'MB', 'GB'];
  let i = 0; let v = b;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)} ${u[i]}`;
};
const pad = (s, n) => String(s).padStart(n);

/** Linear interpolation over the sampled rungs, clamped at both ends. */
function pick(samples, key, rung) {
  if (rung <= samples[0].rung) return samples[0][key];
  const last = samples[samples.length - 1];
  if (rung >= last.rung) return last[key];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]; const b = samples[i];
    if (rung <= b.rung) {
      const t = (rung - a.rung) / (b.rung - a.rung);
      return a[key] + (b[key] - a[key]) * t;
    }
  }
  return last[key];
}

/**
 * The integral: earned by rung N is the sum below it of rate x dwell.
 *
 * Dwell is (wave + rest) / rungs-a-wave, and rungs-a-wave is the verdict mix
 * the window measured -- 2 for a surge, 1 for a clean, 0 for a stall.
 *
 * ---- and an unpriceable sample has TWO causes, which build 362 conflated ----
 *
 * The first version returned one `Infinity` for three conditions and printed
 * one word (`never`) for all of them, and the stop line then stated ONE of
 * them -- "no wave scored a climb, so the dwell is unbounded" -- whichever
 * had actually happened. They are different facts:
 *
 *   HELD   waves completed and none of them scored. The dwell is at least
 *          what one climb would have given, which the reading CARRIES as its
 *          floor -- and it is a MEASUREMENT only in the limit of a window
 *          long enough that a climb would have shown. Build 370 measured
 *          that limit and the default was under it: rung 21 read `held`
 *          twice at six waves and priced at 280.0s over twenty, at one
 *          funding, because it climbs two waves in twenty. So `held` at a
 *          small window is a CENSORED observation wearing a measurement's
 *          clothes, which is this same paragraph's own fault one level in.
 *   SHORT  no wave completed, or only one boundary was seen so no seam
 *          closed. The dwell is UNKNOWN. Nothing was measured, and the window
 *          or the wave's own arrival is the thing to look at -- `jobsLeft`
 *          says which.
 *
 * Reading the second as the first is what put the wrong mechanism into build
 * 362's note. A readout that cannot tell two facts apart will be quoted as
 * whichever one the reader already believes.
 */
function dwellOf(s) {
  const steps = s.surge * 2 + s.clean;
  if (!s.waves) return { dwell: Infinity, why: 'short' };
    // A seam that never closed inside the window is a seam this window cannot
    // price: the mean of an empty list is NaN, and the dwell it would give is
    // a number with nothing behind it.
  if (!Number.isFinite(s.rest)) return { dwell: Infinity, why: 'short' };
  /*
   * ...AND `held` CARRIES THE FLOOR IT IS, because at a small window it is a
   * CENSORED reading and not the measurement the paragraph above calls it.
   *
   * With `steps` at 0 the quotient is unbounded, and what the window actually
   * observed is that the climb rate is under one in `waves` -- so the dwell
   * is AT LEAST the value one climb would have given, `(waveSec + rest) *
   * waves`. Measured at build 370, rung 21 funded with 882 kB: 0 climbs of 6
   * on two separate passes (`held`), and 2 of 20 at the same funding, dwell
   * 280.0s. At six waves a rung that climbs one wave in ten reads `held`
   * about 53% of the time, so `held` there is a coin toss and not a property
   * of the rung. The floor is what makes that visible.
   */
  if (steps <= 0) {
    return { dwell: Infinity, why: 'held',
      floor: Number.isFinite(s.rest) ? (s.waveSec + s.rest) * s.waves : NaN,
      waves: s.waves };
  }
  return { dwell: (s.waveSec + s.rest) / (steps / s.waves), why: null };
}

/**
 * R windows at one rung, reduced to ONE of them.
 *
 * The median run BY RATE, selected rather than averaged: a mean of R
 * windows' columns is a row no window produced, and every column here is
 * read as part of a self-consistent account of one window (`banked`, `secs`
 * and `rate` reconcile; `paid/wave` is the product of the three terms beside
 * it). An averaged row reconciles against nothing.
 *
 * Selected among the runs that could be PRICED, and only if a STRICT
 * MAJORITY of them could. Both halves matter and pull opposite ways: without
 * the filter one unpriceable window poisons a rung two others priced cleanly
 * (the interpolation then takes the six rungs below it as well -- see
 * `blame`); without the majority rule a rung that mostly cannot climb is
 * reported off the one window that did, which is choosing the roll that
 * flatters it. Both are stated as they were from build 368 and NEITHER was
 * kept by the code until build 370 -- see the site below.
 */
function poolRuns(runs) {
  const ok = runs.filter((s) => Number.isFinite(dwellOf(s).dwell));
  if (runs.length === 1) return { ...runs[0], runs, priced: ok.length };
  /*
   * A STRICT majority, and a REFUSAL rather than a fall-through -- build 370,
   * and the paragraph above had described both halves correctly while the code
   * did neither.
   *
   * It was `ok.length * 2 >= runs.length ? ok : runs`, which is two faults in
   * one expression. `>=` is AT LEAST HALF and not a majority, so an even split
   * priced the rung. And below the threshold it did not refuse -- it took the
   * median of ALL the runs, so whether a mostly-unpriceable rung got priced
   * depended on where the one good window happened to land in the RATE
   * ordering, which is exactly the "choosing the roll that flatters it" the
   * paragraph above exists to refuse.
   *
   * Measured by slicing both versions out and driving them over ten
   * arrangements: three change and seven are identical. 1 of 3 with the priced
   * run in the MIDDLE went PRICED and is now unpriceable; 1 of 2 and 2 of 4
   * likewise. Every case that satisfies the stated rule is untouched, AND SO
   * ARE BOTH `runs.length === 1` CASES -- which is what says a curve measured
   * at `--runs 1` is the same curve under this code, because that arm returns
   * before either term is read.
   */
  if (ok.length * 2 <= runs.length) {
    /*
     * WHICH unpriceable run represents a refused rung, chosen rather than
     * taken in array order. The row's `why` is what the stop line reports and
     * `held` and `short` are different facts -- `held` measured waves and no
     * climb, `short` measured nothing -- so a rung where two windows were
     * held and one saw no wave at all must not report "NOTHING WAS MEASURED"
     * because the short one happened to be first in the array. `held` is the
     * more informative of the two and wins; the row is still ONE window's and
     * the caption below says so rather than calling it a median.
     */
    const bad = runs.filter((x) => !Number.isFinite(dwellOf(x).dwell));
    const rep = bad.find((x) => dwellOf(x).why === 'held') || bad[0];
    return { ...rep, runs, priced: ok.length, refused: true };
  }
  const sorted = [...ok].sort((a, b) => a.rate - b.rate);
  const med = sorted[(sorted.length - 1) >> 1];
  return { ...med, runs, priced: ok.length };
}

function integrate(samples) {
  /*
   * ...AND IT CARRIES `floor` AND `waves`, because the stop line reads them
   * off whatever `blame` hands back and this map is what `blame` walks.
   *
   * The first version of build 370's floor rebuilt each entry as
   * `{rung, dwell, why, rate}` and dropped both -- so the stop line, whose
   * whole subject is that a `held` reading is a CENSORED one carrying a lower
   * bound, rendered "undefined wave(s) ended there ... so the dwell is at
   * least (no seam, so unpriced) a rung", and the fallback named a cause
   * `dwellOf` cannot produce for a `held` sample. Measured live on a rung-42
   * window before the fix. That is build 368's `fieldSum / frames` verbatim
   * -- a dropped field leaving a silent `undefined` in a readout -- in the
   * readout added to stop a different silence, which is why the rule is to
   * RENDER the line and not only to drive the function behind it.
   */
  const dwell = samples.map((s) => {
    const { dwell: dw, why, floor, waves } = dwellOf(s);
    return { rung: s.rung, dwell: dw, why, floor, waves, rate: s.rate };
  });
  const curve = [{ rung: 1, earned: 0 }];
  let acc = 0;
  let stop = null;
  for (let r = 1; r < gates.ceiling; r++) {
    const dw = pick(dwell, 'dwell', r);
    const ra = pick(dwell, 'rate', r);
    if (!Number.isFinite(dw)) { stop = r; break; }
    acc += dw * ra;
    if (SAMPLE.includes(r + 1)) curve.push({ rung: r + 1, earned: Math.round(acc) });
  }
  return { curve, dwell, stop };
}

/**
 * Which sample stopped the curve, and why -- which is NOT the stop rung.
 *
 * `pick` interpolates, so a sample whose dwell is `Infinity` poisons every
 * rung between it and the sample BELOW it: at the lower sample's own rung the
 * interpolation weight is exactly 0 and the value is that sample's finite
 * dwell, and one rung up the weight is non-zero and the product is infinite.
 * So sampling 1, 7, ... 42, 49 with rung 49 unpriceable stops the curve at
 * 43, and build 362 read that as the ladder ending at 43. It is the CEILING
 * sample that could not be priced, and the six rungs between are collateral.
 */
function blame(dwell, stop) {
  const bad = dwell.filter((d) => !Number.isFinite(d.dwell) && d.rung >= stop);
  return bad.length ? bad[0] : dwell.find((d) => !Number.isFinite(d.dwell)) || null;
}

/*
 * Forced before the heading prints, not after: the heading names the pass
 * count and a correction UNDER it leaves two numbers in the readout with the
 * wrong one first.
 */
let forced = null;
if (SPEND !== null && ITERS !== 1) { forced = ITERS; ITERS = 1; }

console.log(`income: serving build ${served.build ?? '?'} rev ${served.rev ?? '?'}`);
console.log(`  rungs ${SAMPLE.join(' ')} -- `
  + (WINDOW === null
    ? `window ${WAVES} scored wave(s) a rung`
    : `window a FIXED ${WINDOW}s a rung (an attribution's shape, not the curve's)`)
  + ` -- ${RUNS} run(s) a rung -- ${ITERS} pass(es)`
  + (forced ? ` (--spend pins the funding, so the fixed point does not apply: not ${forced})` : ''));
if (RESORTED) {
  console.log(`  ...--rungs was typed ${ASKED.join(',')} and is SORTED above: \`pick\` walks `
    + 'forward and clamps on both ends, so a descending or out-of-order list builds the '
    + 'whole curve out of one sample. The measurements are the same; only the '
    + 'interpolation cares.');
}
console.log(`  ladder: bossEvery ${gates.bossEvery}, ceiling ${gates.ceiling}, `
  + `eraGate ${gates.eraGate}, gates ${gates.gates.join(' ')}`);
/*
 * Which of the two random channels this reading was taken under, printed
 * because a curve taken under a pin is a curve for that roll and nothing in
 * the table itself says so. Both loose is the curve; anything else is an
 * attribution.
 */
console.log(`  rolls: traits ${SEED === null ? 'loose' : `pinned seed ${SEED}`}`
  + `, everything else ${RAND === null ? 'loose' : `pinned rand ${RAND}`}`
  + `${GRANT ? ' -- NEW FORM granted, so CORE is buyable' : ''}`
  + `${PRESS ? ' -- PULSE pressed on cooldown' : ''}`
  + `${SEED === null && RAND === null && !GRANT && !PRESS ? '  (the curve)' : '  (an attribution, not the curve)'}`);
/*
 * ...AND THE ROLLS ARE NOT THE WHOLE VERDICT, so the line above cannot be it.
 *
 * That parenthetical is about the four ROLLS, and it prints "(the curve)" for
 * a reading whose window, funding or rung list disqualifies it -- which is
 * two statements in one readout, two lines apart, and the heading above has
 * already said `--spend pins the funding` when that is why. Build 369 found
 * the same shape one level down (a `NOT ANCHORS` warning printed four lines
 * above a paste-ready curve) and the rule is that a refusal whose own output
 * still offers the thing is not a refusal.
 *
 * A SECOND LINE rather than a rewording of the first, and the reason is the
 * guard: `check-build` derives the pinnable channel set from the condition
 * behind "(the curve)" and then requires each channel to DEFAULT LOOSE.
 * `WINDOW` and `SPEND` would pass that; `REPEATED` is COMPUTED off the rung
 * list and has no default to be loose, so folding the three in would fail
 * the build for a readout's wording. The anchors block at the foot is the
 * authoritative verdict -- it enumerates all seven reasons and withholds the
 * paste-ready line -- and this is the pointer to it from the top.
 */
if (SEED === null && RAND === null && !GRANT && !PRESS
  && (WINDOW !== null || SPEND !== null || REPEATED)) {
  console.log('  ...but the rolls are not the whole verdict: '
    + [WINDOW !== null ? 'the window is a fixed span of seconds' : null,
      SPEND !== null ? 'the funding is pinned' : null,
      REPEATED ? 'a rung is repeated' : null].filter(Boolean).join(', ')
    + ' -- so this is NOT the curve. The anchors at the foot say so in full.');
}

let funding = SAMPLE.map((rung) => ({ rung, earned: SPEND === null ? 0 : SPEND }));
const passes = [];
for (let it = 0; it < ITERS; it++) {
  const samples = [];
  for (const rung of SAMPLE) {
    const spend = SPEND !== null ? SPEND : Math.max(0, Math.round(pick(funding, 'earned', rung)));
    const runs = [];
    for (let r = 0; r < RUNS; r++) runs.push(await windowAt(rung, spend, WAVES, WINDOW));
    samples.push(poolRuns(runs));
  }
  const { curve, dwell, stop } = integrate(samples);
  passes.push({ samples, curve, dwell, stop });
  funding = curve;

  console.log(`\n---- pass ${it + 1} of ${ITERS} `
    + `${'-'.repeat(52)}`);
  /*
   * `gl` is printed BESIDE the mix and not inside it, and neither reconciles
   * against `waves` -- which is the honest shape and was worth two attempts.
   *
   * The mix can be SHORT of `waves`: `glitchOut` writes `lastVerdict`, so a
   * wave a discharge ended is scored and is in none of surge/clean/stall.
   * And `gl` can EXCEED `waves`: it counts DISCHARGES, seen per frame, while
   * `waves` counts wave ENDS, seen on the resting edge -- measured 4 against
   * 3 at rung 35, so they are not two views of one population. Leaving `gl`
   * out entirely was the first version and it was worse: a reader who cannot
   * reconcile a row from its own numbers assumes the probe dropped one.
   * Folding it into the mix was the second and it was wrong in the other
   * direction: a slash-separated list reads as a partition.
   *
   * It is the one verdict that takes a rung AWAY, so a rung with more `gl`
   * than climbs is not a rung that holds, it is one that loses ground.
   */
  console.log('  rung era      funded buy/core       rate    win s  waves  su/cl/st   gl  pin'
    + '  wave s  seam s  field/cap  left  unended  dwell s     earned here  pulse'
    + '  paid/wave and rules');
  for (const s of samples) {
    const dw = dwell.find((d) => d.rung === s.rung);
    const e = curve.find((c) => c.rung === s.rung);
    console.log(`  ${pad(s.rung, 4)} ${pad(s.era, 3)} ${pad(fmt(s.spend), 11)} `
      + `${pad(`${s.buys}/${s.core}`, 7)} ${pad(fmt(s.rate) + '/s', 10)} `
      + `${pad(s.secs + (s.stop === 'allowance' ? '!' : ''), 8)} ${pad(s.waves, 6)}  `
      + `${pad(s.surge, 2)}/${pad(s.clean, 2)}/${pad(s.stall, 2)}  ${pad(s.glitches, 3)}  `
      + `${pad(s.repins, 3)}${s.tierEnd === s.rung ? ' ' : '!'} `
      + `${pad(Number.isFinite(s.waveSec) ? s.waveSec.toFixed(1) : '--', 6)}  `
      + `${pad(Number.isFinite(s.rest) ? s.rest.toFixed(1) : '--', 6)}  `
      + `${pad(`${s.field}/${s.cap}`, 9)}  ${pad(s.jobsLeft, 4)}  ${pad(s.openS, 7)}  `
      + `${pad(Number.isFinite(dw.dwell) ? dw.dwell.toFixed(1) + (s.waves < 3 ? '+' : '') : dw.why, 8)}  `
      + `${pad(e ? fmt(e.earned) : '--', 14)}  ${pad(s.pulses, 5)}  `
      + `[${s.paidEach.map((b) => fmt(b).replace(' ', '')).join(' ')}] ${s.rules}`);
    /*
     * EVERY RUN'S OWN FIGURES, under the pooled row -- because a pool is a
     * SELECTION and the reader cannot see what it selected from unless the
     * alternatives are printed. Build 349's rule: if a case pools N runs,
     * print the N figures. A `!` on `win s` is the allowance having bound
     * rather than the wave target being met, which is the one thing that
     * makes a row's `waves` short of what was asked for.
     */
    if (s.runs) {
      console.log('       runs: ' + s.runs.map((r) => {
        const rd = dwellOf(r);
        /*
         * `banked` is IN the line, because its own comment says the three of
         * them "reconcile against each other in one row, which is the form
         * this repo prefers to a guard on a probe's arithmetic" -- and it was
         * in no row, so that stated defence did not exist in the output. It
         * is the numerator of the rate beside its denominator; a row where
         * `banked / secs` is not `rate` is an arithmetic fault visible
         * without a guard, which is the whole claim.
         *
         * `jobsAt` is a SNAPSHOT and is labelled one: `load()` writes it once
         * per wave, so it is the wave that was loaded when the window closed
         * and not a property of the window. The guard paragraph above records
         * that figure spanning 2, 3 and 140 at ONE rung, which is the spread
         * that makes an unlabelled snapshot misleading -- the one-of-N shape
         * the `rules` column was fixed for twice.
         */
        return `${fmt(r.banked)} in ${r.secs}s = ${fmt(r.rate)}/s`
          + `, ${r.allowS}s a wave guard`
          + `${r.stop === 'allowance' ? '!' : ''}, ${r.waves}w`
          + `, worst ${r.durMax}s, ${r.jobsAt} job(s) at close, dwell `
          + `${Number.isFinite(rd.dwell) ? rd.dwell.toFixed(1) : rd.why}`;
      }).join('  |  ')
        + `   (${s.priced} of ${s.runs.length} priced`
        + `${s.runs.length > 1 ? (s.refused
          ? '; the row above is ONE unpriceable window, not a median -- the rung is '
            + 'refused for want of a strict majority'
          : '; the pooled row is the median by rate') : ''})`);
    }
  }
  /*
   * The split, on its own rows rather than as four more columns on a table
   * that is already 170 wide. It is the reading build 364 owed: that build
   * measured the deep-rung rate spanning a factor of sixty at one funding
   * and traced most of it to EBB, and then found the EBB-FREE waves of a
   * poor window were themselves 26x poorer than a rich window's -- with
   * nothing in the window able to say why.
   *
   * `paid/wave` is the product of the three terms beside it times `tax`, so
   * a row reconciles against itself to rounding and a poor row names its own
   * cause: fewer bodies sent, fewer of them killed, cheaper bodies, or a
   * harder tax.
   */
  console.log('');
  console.log('  WHAT A WAVE PAID, SPLIT (paid = slain x raw/body x tax; slain = made x kill)');
  console.log('  rung   w  verdict  asked  made  slain  kill   raw/body       tax'
    + '       paid  drops  on floor    ebb  rules / authored wave');
  for (const s of samples) {
    s.waveRows.forEach((r, i) => {
      const kill = r.made ? r.slain / r.made : NaN;
      const per = r.slain ? r.take / r.slain : NaN;
      const tax = r.take ? r.paid / r.take : NaN;
      console.log(`  ${pad(s.rung, 4)}  ${pad(i + 1, 2)}  ${pad(r.verdict, 7)}  `
        + `${pad(r.asked, 5)}  ${pad(r.made, 4)}  ${pad(r.slain, 5)}  `
        + `${pad(Number.isFinite(kill) ? kill.toFixed(2) : '--', 4)}  `
        + `${pad(Number.isFinite(per) ? fmt(Math.round(per)) : '--', 9)}  `
        + `${pad(Number.isFinite(tax) ? tax.toFixed(2) : '--', 5)}  `
        + `${pad(fmt(r.paid), 9)}  ${pad(r.drops, 5)}  `
        + `${pad(fmt(r.dropBytes), 9)}  ${pad(r.dropEbb, 3)}  ${r.rules}  ${r.of}`);
    });
  }
  /*
   * The stop line names the SAMPLE, not just the rung the loop broke at --
   * see `blame`. And it names which of the two causes, because build 362's
   * note quoted the wrong one: `held` is a measurement of a rung that will
   * not let go, `short` is this probe saying it measured nothing.
   */
  if (stop) {
    const b = blame(dwell, stop);
    const at = b ? b.rung : stop;
    if (b && b.why === 'short') {
      const bs = samples.find((x) => x.rung === at);
      console.log(`  the curve stops at rung ${stop}, and the sample that stopped it is rung ${at}: `
        + `NOTHING WAS MEASURED there -- ${bs && !bs.waves ? 'no wave ended' : 'no seam closed'} `
        + `inside ${bs ? bs.secs : '?'}s${bs && bs.stop === 'allowance' ? ' (the allowance, spent)' : ''}`
        + `${bs && bs.openS ? `, one wave having run ${bs.openS}s of it` : ''}`
        + `${bs && bs.jobsLeft ? `, with ${bs.jobsLeft} job(s) still to let out, so it had not `
          + 'finished ARRIVING and its patience clock had not started' : ''}`);
      console.log(`  every rung from ${stop} to ${at} is interpolated toward that sample, `
        + 'so they are collateral rather than measured: this is a window, not a verdict');
    } else {
      console.log(`  the curve stops at rung ${stop}, and the sample that stopped it is rung ${at}: `
        + `${b.waves} wave(s) ended there and NONE scored a climb, so the dwell is at `
        + `least ${Number.isFinite(b.floor) ? `${Math.round(b.floor)}s` : '(no seam, so unpriced)'} `
        + 'a rung -- A FLOOR, not a rung that never lets go');
      console.log(`  ...and at ${b.waves} wave(s) that is a CENSORED reading: a rung climbing `
        + `less often than once in ${b.waves} reads this way whatever its real dwell is. `
        + `Measured at build 370, rung 21 funded with 882 kB read 0 climbs of 6 on two `
        + `passes and 2 of 20 at the same funding (dwell 280.0s), so at six waves this is `
        + `a coin toss. Give it more waves before reading it as the ladder's end.`);
    }
  }
}

const last = passes[passes.length - 1];
console.log(`\n---- the anchors ${'-'.repeat(58)}`);
/*
 * WHAT CONDITIONS THESE WERE TAKEN UNDER, PRINTED WITH THEM, because the
 * numbers travel and the conditions do not. `tiers.mjs` held a hand-pasted
 * copy of this line for six builds with no record of the window, the runs or
 * the rolls behind it; build 368 wrote them in by hand, which is a copy of a
 * copy and goes stale the same way. So the qualified branch below emits the
 * conditions as a COMMENT ABOVE the array, and pasting both is one copy.
 *
 * And a reading whose conditions disqualify it as the curve prints NO
 * paste-ready line at all. The probe already knew about one such condition --
 * a repeated `--rungs` entry -- and printed the line anyway, under its own
 * `NOT ANCHORS` heading: a refusal that refuses nothing, which is build 351's
 * ruling on a conjunct that cannot fail for the reason it is about, arriving
 * in a readout rather than in a case. Demonstrated rather than argued: a
 * `--spend 200 MB` run over the eight gate rungs printed a paste-ready
 * `EARNED` under a heading that had already said, in the same output, that
 * the fixed point does not apply to it.
 *
 * Disqualifying, each because it makes the reading about something other than
 * what a run with the dice free banks: any of the four pinnable rolls
 * (`check-build` refuses a build where one of them DEFAULTS on, for the same
 * reason this refuses a reading taken under one), a fixed-seconds window (a
 * different number of waves at every rung -- see the window paragraph above),
 * a pinned funding (a given turret rather than the fixed point), and a
 * repeated rung. REPORTED rather than refused, because each is sample size
 * and therefore the reader's judgement: the passes, the runs a rung, the
 * waves a rung, and whether every sampled rung could be priced at all.
 */
/*
 * ---- ...AND A TRUNCATED CURVE SAYS SO IN THE COMMENT ---------------------
 *
 * The final pass can STOP -- its top sample unpriceable, and every rung
 * between it and the sample below it collateral -- and the array printed
 * below then ends at whatever anchor survived. Nothing said so: `why`
 * enumerated seven disqualifiers and had no term for `last.stop`, so a
 * fully-loose run whose deep sample was `held` fell into the paste branch and
 * offered a SHORT array under a `// measured:` comment naming only the
 * window, the runs, the passes and the tree.
 *
 * What that costs is downstream and it is not small: `tiers.mjs` derives
 * `TAIL` from the LAST TWO entries of whatever array is pasted and
 * extrapolates every rung above it. Measured by running the shipped curve
 * through `spendAt` truncated at each anchor -- cut at 35 and `spendAt(42)`
 * returns the whole tree; cut at 14 and `spendAt(35)` reads 101 MB against a
 * measured 40.6 MB; cut at 7 and `e0` is 0, so `TAIL` is Infinity.
 *
 * It is NOT a disqualifier, which is the distinction: a pin is a condition
 * the reading was taken under and makes the whole reading something else, and
 * a stop is an incomplete result that is sound as far as it goes. Build 362's
 * curve was truncated at 42 and was pasted, correctly, with the truncation
 * recorded by hand in `tiers.mjs`'s own block. So the comment carries it and
 * the line is still offered -- the silence was the fault, not the paste.
 */
const cut = last.stop
  ? `, TRUNCATED at rung ${last.curve[last.curve.length - 1].rung}: the curve stopped at `
    + `rung ${last.stop} (sample ${blame(last.dwell, last.stop)?.rung ?? '?'} unpriceable), so `
    + "every rung above that anchor is tiers.mjs's TAIL extrapolation and was not measured"
  : '';
const cond = `window ${WINDOW === null ? `${WAVES} scored wave(s)` : `a FIXED ${WINDOW}s`} a rung`
  + `, ${RUNS} run(s) a rung, ${passes.length} pass(es)`
  + `, build ${served.build ?? '?'} rev ${served.rev ?? '?'}, this container${cut}`;
const why = [];
if (SEED !== null) why.push(`--seed ${SEED} pins the trait sequence`);
if (RAND !== null) why.push(`--rand ${RAND} pins the wave shuffle and every per-body roll`);
if (GRANT) why.push('--grant hands the run the NEW FORM remainder');
if (PRESS) why.push('--press fires PULSE on cooldown');
if (WINDOW !== null) why.push(`--window ${WINDOW} is a flat span of seconds, so the sample size `
  + 'is a different number of waves at every rung');
if (SPEND !== null) why.push(`--spend ${fmt(SPEND)} pins the funding, so this is a given turret `
  + 'rather than the fixed point');
if (REPEATED) why.push('--rungs repeats a rung, so the interpolation has nothing to interpolate');
console.log(`  taken under: ${cond}`);
console.log(`  priced: ${last.curve.length} of ${SAMPLE.length} sampled rung(s)`
  + `${last.stop ? `, and the curve stops at rung ${last.stop} -- see the stop line above` : ''}`);
if (why.length) {
  console.log(`  NOT THE CURVE, so there is no paste-ready line: ${why[0]}`);
  for (const w of why.slice(1)) console.log(`    ...and ${w}`);
  console.log('  The curve is this probe with every flag named above left OFF. What THIS');
  console.log('  reading integrated to, for reading and not for pasting:');
  console.log(`    ${last.curve.map((c) => `${c.rung}: ${fmt(c.earned)}`).join('   ')}`);
} else {
  console.log('  For tiers.mjs\'s EARNED, whose copy is MEASURED (build 362) and known');
  console.log('  STALE (build 366 moved the economy pin without re-measuring). Bytes, and');
  console.log('  the probe\'s own integral -- read the passes above before pasting one in,');
  console.log('  and paste the comment WITH the array.');
  console.log(`  // measured: ${cond}`);
  console.log(`  const EARNED = [${last.curve.map((c) => `[${c.rung}, ${c.earned}]`).join(', ')}];`);
}
if (errs.length) console.log(`\n  page errors: ${errs.length}\n    ${errs.slice(0, 5).join('\n    ')}`);

await browser.close();
