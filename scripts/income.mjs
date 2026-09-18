/*
 * income.mjs -- what a run has BANKED by the rung it meets each slot on.
 *
 *   node scripts/income.mjs [--rungs 1,7,14,21,28,35,42,49] [--window 120]
 *                           [--iters 3] [--spend BYTES] [--seed N] [--rand N] [--grant]
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
const WINDOW = Number(flag('window', 120));
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
const SAMPLE = RUNGS.length ? RUNGS : [1, ...gates.gates];
/*
 * `--rungs 42,42,42,42` is how several windows are taken at ONE rung in one
 * launch, which is what an attribution needs and what the browser launch per
 * window would otherwise cost. It is a real idiom and it breaks the curve:
 * `pick` interpolates over the sampled rungs and a duplicate makes that
 * arithmetic meaningless, so the anchors printed under it are not anchors.
 * Said out loud rather than refused -- a probe that prints a table nobody can
 * read and exits 0 is this repo's own scar.
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
async function windowAt(rung, spend, seconds) {
  return page.evaluate(async ({ rung, spend, seconds, line, seed, rand, grant, press }) => {
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
      d.hold = true;
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
    const frames = Math.round(seconds * 60);
    for (let f = 0; f < frames; f++) {
      // Re-asserted every frame: `glitchOut` clears the hold on its own line,
      // so one discharge would unpin the rung for the rest of the window.
      d.hold = true;
      g.update(S);
      if (d.at !== lastAt && !d.resting) {
        cur = { at: d.at, teach: !!(d.wave && d.wave.teach), f0: f, earned0: w.earned,
          rules: ruleset() };
        lastAt = d.at;
        if (endedAt !== null) { seams.push((f - endedAt) / 60); endedAt = null; }
      }
      if (lastResting === false && d.resting && cur) {
        cur.dur = +((f - cur.f0) / 60).toFixed(2);
        cur.verdict = cur.teach ? 'unscored' : d.lastVerdict;
        cur.paid = Math.round(w.earned - cur.earned0);
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
      pulses,
      banked: Math.round(w.earned - earned0),
      rate: +((w.earned - earned0) / seconds).toFixed(1),
      waves: scored.length, surge: n('surge'), clean: n('clean'), stall: n('stall'),
      glitches,
      waveSec: +mean(scored.map((x) => x.dur)).toFixed(1),
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
      rest: +mean(seams).toFixed(1),
      seams: seams.length,
      field: +(fieldSum / frames).toFixed(1),
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
      openS: cur ? +((frames - cur.f0) / 60).toFixed(1) : 0,
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
  }, { rung, spend, seconds, line: LINE, seed: SEED, rand: RAND, grant: GRANT, press: PRESS });
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
 *   HELD   waves completed and none of them scored. The rung does not let go,
 *          the dwell really is unbounded, and that is a MEASUREMENT.
 *   SHORT  no wave completed, or only one boundary was seen so no seam
 *          closed. The dwell is UNKNOWN. Nothing was measured, and the window
 *          or the wave's own arrival is the thing to look at -- `jobsLeft`
 *          says which.
 *
 * Reading the second as the first is what put the wrong mechanism into build
 * 362's note. A readout that cannot tell two facts apart will be quoted as
 * whichever one the reader already believes.
 */
function integrate(samples) {
  const dwellOf = (s) => {
    const steps = s.surge * 2 + s.clean;
    if (!s.waves) return { dwell: Infinity, why: 'short' };
    // A seam that never closed inside the window is a seam this window cannot
    // price: the mean of an empty list is NaN, and the dwell it would give is
    // a number with nothing behind it.
    if (!Number.isFinite(s.rest)) return { dwell: Infinity, why: 'short' };
    if (steps <= 0) return { dwell: Infinity, why: 'held' };
    return { dwell: (s.waveSec + s.rest) / (steps / s.waves), why: null };
  };
  const dwell = samples.map((s) => {
    const { dwell: dw, why } = dwellOf(s);
    return { rung: s.rung, dwell: dw, why, rate: s.rate };
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
console.log(`  rungs ${SAMPLE.join(' ')} -- window ${WINDOW}s -- ${ITERS} pass(es)`
  + (forced ? ` (--spend pins the funding, so the fixed point does not apply: not ${forced})` : ''));
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

let funding = SAMPLE.map((rung) => ({ rung, earned: SPEND === null ? 0 : SPEND }));
const passes = [];
for (let it = 0; it < ITERS; it++) {
  const samples = [];
  for (const rung of SAMPLE) {
    const spend = SPEND !== null ? SPEND : Math.max(0, Math.round(pick(funding, 'earned', rung)));
    samples.push(await windowAt(rung, spend, WINDOW));
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
  console.log('  rung era      funded buy/core       rate  waves  su/cl/st   gl  wave s  seam s'
    + '  field/cap  left  unended  dwell s     earned here  pulse  paid/wave and rules');
  for (const s of samples) {
    const dw = dwell.find((d) => d.rung === s.rung);
    const e = curve.find((c) => c.rung === s.rung);
    console.log(`  ${pad(s.rung, 4)} ${pad(s.era, 3)} ${pad(fmt(s.spend), 11)} `
      + `${pad(`${s.buys}/${s.core}`, 7)} ${pad(fmt(s.rate) + '/s', 10)} ${pad(s.waves, 6)}  `
      + `${pad(s.surge, 2)}/${pad(s.clean, 2)}/${pad(s.stall, 2)}  ${pad(s.glitches, 3)}  `
      + `${pad(s.waveSec, 6)}  `
      + `${pad(Number.isFinite(s.rest) ? s.rest : '--', 6)}  `
      + `${pad(`${s.field}/${s.cap}`, 9)}  ${pad(s.jobsLeft, 4)}  ${pad(s.openS, 7)}  `
      + `${pad(Number.isFinite(dw.dwell) ? dw.dwell.toFixed(1) + (s.waves < 3 ? '+' : '') : dw.why, 8)}  `
      + `${pad(e ? fmt(e.earned) : '--', 14)}  ${pad(s.pulses, 5)}  `
      + `[${s.paidEach.map((b) => fmt(b).replace(' ', '')).join(' ')}] ${s.rules}`);
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
        + `inside ${WINDOW}s${bs && bs.openS ? `, one wave having run ${bs.openS}s of it` : ''}`
        + `${bs && bs.jobsLeft ? `, with ${bs.jobsLeft} job(s) still to let out, so it had not `
          + 'finished ARRIVING and its patience clock had not started' : ''}`);
      console.log(`  every rung from ${stop} to ${at} is interpolated toward that sample, `
        + 'so they are collateral rather than measured: this is a window, not a verdict');
    } else {
      console.log(`  the curve stops at rung ${stop}, and the sample that stopped it is rung ${at}: `
        + 'waves ended there and none scored a climb, so the rung does not let go');
    }
  }
}

const last = passes[passes.length - 1];
console.log(`\n---- the anchors ${'-'.repeat(58)}`);
if (REPEATED) {
  console.log('  NOT ANCHORS: --rungs repeats a rung, so this is several windows at one');
  console.log('  rung and the interpolation below has nothing to interpolate. Read the');
  console.log('  rows.');
}
console.log('  For tiers.mjs\'s EARNED, which is asserted today and which its own header');
console.log('  asks to have a measured curve driven into. Bytes, and the probe\'s own');
console.log('  integral -- read the passes above before pasting one in.');
console.log(`  const EARNED = [${last.curve.map((c) => `[${c.rung}, ${c.earned}]`).join(', ')}];`);
if (errs.length) console.log(`\n  page errors: ${errs.length}\n    ${errs.slice(0, 5).join('\n    ')}`);

await browser.close();
