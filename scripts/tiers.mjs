/*
 * How long a body from tier n's band takes to kill, at tier n's money.
 *
 * The ladder shipped in build 177 with three slopes in it -- population,
 * health and bounty -- and no way to see what any of them does to a fight.
 * `fight.mjs`, `dps.mjs` and `variance.mjs` all point at the seven bosses,
 * which are authored encounters and do not move when the tier does. The
 * ordinary field is the thing the ladder actually governs and nothing was
 * watching it.
 *
 * This is the fourth of the trio, and it answers one question: at tier n,
 * holding what tier n's earnings can buy, how many seconds does the heaviest
 * thing tier n sends take to put down. That number is the whole of plan B --
 * see docs/pacing.md, which wants it held at 2-4 seconds through about tier 10
 * and past 6 by about tier 14, so the wall forms somewhere a player can see it
 * coming.
 *
 * ---- what it does, and the three places it could lie ----
 *
 * THE MONEY is MEASURED from build 362, re-measured at 371 on the economy
 * builds 365 and 366 left, and was asserted before all of it. `--spend`
 * follows the earned-by-rung curve below, interpolated between anchors and
 * capped at what the whole tree costs, because nobody can spend more than
 * that; what changed is where the anchors come from. They were plan C's
 * targets -- what the economy was *meant* to hand over -- on the argument
 * that B and C were being tuned against each other and one of them had to be
 * the fixed end. That argument was sound and its cost was that nothing ever
 * checked the fixed end.
 *
 * **Those targets were 23x too rich at rung 7 and are MEASURED from build
 * 362.** `scripts/income.mjs` is the probe this paragraph asked for -- "fix
 * the curve by driving a measured one in" -- and what it found is that the
 * plan's own income model was close and this instrument was not. Measured
 * against `docs/rebalance.html`'s model at the seven gate rungs: **500 kB /
 * 1.89 MB / 5.46 MB / 9.05 MB / 40.6 MB / 95.8 MB** banked by rungs 7 / 14 /
 * 21 / 28 / 35 / 42, against a modelled 441 kB / 1.81 / 5.67 / 15.20 / 32.47
 * / 80.10 -- within a factor of 1.25 at six of the six, and the one that is
 * not (rung 28, 0.60x) is low rather than high. Two methods that share no
 * arithmetic agreeing to a quarter is the corroboration; the anchors this
 * probe asserted said **15 MB by rung 8**, and their tail reached **2.02 GB
 * by rung 28**.
 *
 * What that cost is not a subtle bias. `spendAt` clamps at `TREE_TOTAL`, so
 * the asserted curve bought the WHOLE TREE from about rung 17 of 49 -- every
 * row past 17 measured a fully bought turret whatever the prices were, which
 * is what build 303's phase-4 note means when it says this probe cannot see
 * that phase past rung 17, recorded there as a limitation rather than traced
 * to its cause.
 *
 * The old figure in this paragraph was wrong twice over and both are worth
 * knowing. "About four times" was taken against the 15,000-by-tier-8 anchor
 * in POINTS, before build 284 made the game count in bytes and before 303
 * re-priced the tree. And "a stock turret banks 4,417 in fifteen minutes and
 * settles at tier 7-8" is 4.9 kB/s against a measured 3.3-3.6 kB/s at rungs
 * 1-7 -- the same order, which is this instrument agreeing with a
 * seventeen-build-old reading it was written to replace, and the settling
 * rung is reproduced exactly: funded with NOTHING, income.mjs's first pass
 * cannot climb past rung 15 and says so in its own message.
 *
 * What the measured curve rests on, stated because the anchors below are only
 * as good as it. ONE 240-second window a rung a pass, three passes: rungs 7,
 * 14 and 21 are SETTLED -- spanning 1.25x, 1.19x and 1.01x across the passes
 * that REACHED them, which is three, three and two: pass 1 funds nothing and
 * its curve stops at rung 15, so it has no figure above that at all -- and
 * **28 and up are soft** -- a deep window holds two to five scored waves, and
 * the rate at rungs 42 and 49 drew 3.94, 8.66, 2.70 and 317 kB/s across the
 * passes, because what a 240-second window at the top of the ladder contains
 * is a draw. The INTEGRAL is a model even though both its terms are measured
 * (rate x dwell, interpolated between eight samples), and the glitch
 * discharge is counted and NOT modelled, so the dwell is a floor. Pooling the
 * windows is the next thing this curve wants; `--window` and `--iters` are
 * how, and the deep rungs are where it would pay.
 *
 * THE LOADOUT is the damage line and nothing else: the purchases a player
 * makes if all they want is to kill the thing in front of them, in a fixed
 * order (see LINE). Anything left over after that goes on the rest of the tree
 * in tree order, which is where the diminishing returns come from -- a turret
 * with forty thousand behind it has most of it in rounds and mines and
 * abilities that do nothing for a single body. So every TTK here is the
 * optimistic end of the range. If the wall shows up in these numbers it shows
 * up sooner in a real run, not later.
 *
 * THE ROUND is BOLT, loaded, alone. No mines, no abilities, no ammunition
 * swap. That is not what a fight looks like and it is not meant to be: this
 * measures the gun, so that when the gun stops being enough the tier it
 * happens at is a property of the gun.
 *
 * Rounds are counted the way `variance.mjs` learned to count them -- not as
 * `shoot()` calls, which return false when the turret cannot fire and are not
 * rounds. They are counted at creation, through `projectiles.push`, because
 * the first version watched the array after each frame and a round that was
 * fired and consumed inside one update was never in it: at point-blank that
 * is every round, and the instrument reported a NEEDLE dying to nothing in no
 * time. Damage is counted the same way, off a roster that survives the sweep,
 * for exactly the same reason.
 *
 *   node scripts/tiers.mjs [--from 1] [--to 16] [--runs 3] [--cap 45]
 *                          [--range 300] [--spend N] [--url ...] [--expect NNN]
 */

import { createRequire } from 'node:module';
import { WAVES, ENEMY_TYPES, CFG, BUILD, kB, fmtBytes, fmtRate } from '../src/config.js';
import { NODES, priceOf } from '../src/tree.js';

const require = createRequire(import.meta.url);
import { checkServed, requireWorld, requireSameTree } from './served.mjs';
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const FROM = Number(flag('from', 1));
const TO = Number(flag('to', 16));
const RUNS = Number(flag('runs', 3));
const CAP = Number(flag('cap', 45));
/*
 * World units between the turret and the body, straight up. Inside the base
 * `aimRange` of 400 on purpose: this measures the gun, and a target the assist
 * cannot see is measuring ARRAY.
 */
const RANGE = Number(flag('range', 300));
/*
 * How far a body being timed may wander from where the bench put it. Two
 * body-lengths of the biggest thing in the table: enough that nothing is
 * frozen, little enough that nothing leaves the turret's reach or its cone.
 * See the mark loop for what happens at 0 and at infinity -- both were tried.
 */
const SLACK = Number(flag('slack', 80));
/** Seconds the gun fires at the wall, per tier, for the rate and damage columns. */
const BENCH = Number(flag('bench', 6));
/** ...and the longest a whole wave is given to clear before it is called uncleared. */
const WAVECAP = Number(flag('wavecap', 120));
// `--spend` is given in POINTS, the unit docs/pacing.md is written in, and
// converted here -- a flag whose unit differs from the doc it is read
// beside is a flag nobody can use.
const FIXED = flag('spend', null) === null ? null : kB(Number(flag('spend', 0)));
const URL = flag('url', 'http://127.0.0.1:8099/index.html');
// Which tree is this reading? `scripts/served.mjs` carries the whole
// finding; the short version is that this container's http-server serves
// its own CWD and ignores a trailing path, so a `--url` differential can
// silently read the live tree twice. The heading names the served BUILD
// every run and `--expect NNN` refuses a mismatch, because printing is not
// guarding. Called before the browser launches, so `abort` is a plain exit.
const { abort: wrongTree, served } = await checkServed(URL, flag('expect', null), 'tiers.mjs');
if (wrongTree) process.exit(1);
// ...and this probe imports its constants from ../src/, so it may only be
// aimed at a tree that IS this checkout -- otherwise the prices and the wave
// roster are mine and only the game is theirs. `served.mjs` has the finding.
{
  const { abort } = requireSameTree(served, BUILD, 'tiers.mjs');
  if (abort) process.exit(1);
}

// ---- the money ------------------------------------------------------------

/**
 * Everything in the tree, every level of it, added up. The ceiling on a run's
 * spend: past this there is nothing left to buy.
 */
const TREE_TOTAL = NODES
  .filter((n) => n.id && !n.repeat && !n.dormant && n.currency !== 'remainder')
  .reduce((sum, n) => {
    let s = 0;
    for (let i = 0; i < (n.levels || 1); i++) s += priceOf(n, i);
    return sum + s;
  }, 0);

/*
 * The earned-by-rung curve, MEASURED -- `scripts/income.mjs`, re-measured at
 * build 371 (and first measured at 362, whose copy this replaces).
 *
 * Anchors to interpolate between, in bytes, taken with the rung pinned and
 * the era derived from it, and integrated from two measured terms: what a
 * rung banks a second off `world.earned`, and how many seconds a rung takes
 * (the verdict mix, surge +2 / clean +1 / stall 0, over the wave plus its
 * measured seam). Iterated -- NOT to a fixed point and NOT
 * from below, which build 371 measured over five passes and the block
 * beside the array sets out. The first pass
 * funds every rung with nothing -- so the curve owes nothing to the asserted
 * one it replaces. The long note at the top of this file says what it rests
 * on and where it is a model rather than a measurement; read that before
 * moving these.
 *
 * `check-build.mjs` pins the economy terms the curve is a function of and
 * fails the build when one of them moves, because a measured constant
 * describes the day it was taken on and this one is what every affordability
 * claim in the repo reads through. Re-measure and move the pin together.
 *
 * ---- AND THE DEEP ANCHORS ARE SINGLE DRAWS, MEASURED AT BUILD 363 ----
 *
 * Distrust everything from rung 28 up, for two reasons that are both about
 * the probe rather than the ladder.
 *
 * The RATE at a deep rung is not reproducible. Measured at one funding across
 * five windows, rung 49 read 10.8, 24.6, 93.4, 184 and 648 kB/s -- a factor
 * of 60, and no narrower over twenty game-minutes than over four -- and rung
 * 42 read 5.75 to 65.9. The candidate is the wave rules, which `restart()`
 * re-rolls per window, so each anchor above is ONE roll. A slope taken off
 * two such windows is worthless: the rung 42-to-49 growth read 1.138 a rung
 * on one and 1.014 on the next, and `TAIL` below is 1.13055, so the first of
 * those agreeing with it to 0.66% was a coincidence. Re-taking the curve
 * wants N runs a rung, not a longer window.
 *
 * BUILD 364 CONFIRMED THE CANDIDATE AND PRICED THE ALTERNATIVE. A 2x2 at rung
 * 42 with a pin per random channel: the trait sequence held and the wave
 * shuffle left free reads 140 to 247 kB/s (1.8x) against 6.76 to 328 (48x)
 * with both loose, so the trait draw is the channel and the wave draw is
 * worth 1.8x of it. And pinning BOTH is not exact, so N cannot be 1: a
 * residual 1.08x survives between windows in one page, and any intervention
 * worth measuring re-routes the pinned stream by changing the pacing. What
 * moves is the PER-WAVE pay, 187 kB to 52.5 MB, and a poor window is poor in
 * every wave -- which is what makes runs the right instrument rather than a
 * hopeless one.
 *
 * And the funded turret has never included CORE. It needs NEW FORM, NEW FORM
 * is `currency: 'remainder'` -- one per anomaly reconciled under the era
 * hold, not payable in bytes -- so the loop above skips it and has to.
 * Measured, 107 buys and 0 CORE levels at every spend. That is four levels at
 * x1.35, x3.32, the largest single node in the tree by multiplier, and its
 * 5.32 MB is affordable from rung 28 up: it was never the purse. Granting the
 * remainder is a decision the re-take has to make. **Build 364 priced it and
 * it is worth about a tenth rather than a factor**: granted through the
 * ledger, buys go 107 to 111 and the rate moves 9.43 to 10.5 kB/s at one roll
 * and 256 against 248 and 230 at another. At that rung income is gated by
 * salvage ARRIVING and not by bodies dying, so a damage multiplier buys very
 * little of it -- the missing node is a real gap in the TURRET phase 7b is
 * about and a tenth of a gap in this curve, which are different claims.
 */
/*
 * ---- THE CONDITIONS THESE EIGHT NUMBERS WERE MEASURED UNDER --------------
 *
 * Recorded beside them because a measurement describes the day it was taken
 * on, and a table of numbers with no record of its own conditions is the
 * exact fault `income.mjs` fails the build for when a PINNED reading calls
 * itself the curve. The paragraph above says the anchors are measured; this
 * says by what.
 *
 *   taken at   build 371, one container, the tree served locally at build
 *              370 -- which is the tree these numbers describe. 371 changes
 *              only this table and the probe's own `--from`, and the probe
 *              imports nothing from `../src/`, so the reading is of the
 *              economy that is still running.
 *   probe      income.mjs --iters 3, then --from <pass 3> --iters 2,
 *              rungs 1 7 14 21 28 35 42 49
 *   window     TWENTY SCORED WAVES a rung, which is the shape build 368 put
 *              in place of a flat span of seconds and 370 made the default.
 *              The seconds are an output and run 302s at rung 1 to 2589 at
 *              rung 49, so every rung is sampled over the same number of
 *              waves rather than over whatever a clock happened to give.
 *              All eight rungs priced, so this curve has a rung-49 anchor
 *              for the first time and `TAIL` below now extrapolates only
 *              above the ceiling, where nothing plays.
 *   rolls      all four loose (no --seed, --rand, --grant or --press), which
 *              is what makes them anchors rather than an attribution
 *   runs       ONE window a rung, which is still a DRAW and is the whole of
 *              what is left owing -- see the block below.
 *   turret     funded in bytes, so CORE is NOT owned: it needs NEW FORM,
 *              which is `currency: 'remainder'` and not payable in bytes.
 *              Build 364 priced the grant at about a tenth of the rate
 *              rather than a factor -- a real gap in the TURRET phase 7b is
 *              about and a small one in this curve. Buys read 107 of 107 at
 *              rungs 35, 42 and 49, so the tree is bought out there and the
 *              purse is not what holds those rungs.
 *
 * ---- AND IT IS THE FIFTH PASS OF A SEQUENCE THAT HAS NOT CONVERGED ------
 *
 * `income.mjs`'s own header says the fixed point is "iterated from BELOW".
 * Measured over five passes it is not: the map is DECREASING, so plain
 * iteration oscillates instead of climbing to a point. Bytes by rung, pass
 * by pass (pass 1 is unfunded and could price only rungs 1 and 7):
 *
 *   rung    p1       p2        p3        p4        p5
 *      7    493 kB   658 kB    695 kB    340 kB    617 kB
 *     14    --       8.06 MB   3.16 MB   1.82 MB   1.31 MB
 *     21    --       33.1 MB   7.26 MB   7.44 MB   4.21 MB
 *     28    --       73.9 MB   21.7 MB   24.7 MB   15.9 MB
 *     35    --        144 MB   75.4 MB   89.5 MB   66.8 MB
 *     42    --        276 MB    205 MB    240 MB    197 MB
 *     49    --        687 MB    380 MB    462 MB    380 MB
 *
 * The cause is that `earned` is the integral of RATE and DWELL, and better
 * funding collapses the dwell faster than it raises the rate: at rung 49,
 * pass 2 to pass 3 is rate x2.79 against dwell /12.5 (989.4s a rung to
 * 79.0). The tell is the discharge column -- rung 49 blew the glitch fuse on
 * 20 of 20 waves in pass 1, 19 in pass 2 and 1 in pass 3. A poor run walks
 * DOWN the ladder and banks a great deal per rung because it is standing
 * still; a funded one climbs and banks less. So funding up means earned
 * down, which is a decreasing map, and a decreasing map's iterates
 * alternate: rung 49 reads 687, 380, 462, 380 and rung 42 reads 276, 205,
 * 240, 197.
 *
 * What is landed is PASS 5 -- the last pass of the longest sequence, one
 * self-consistent curve, exact rather than a per-rung median across passes
 * that would reconcile against nothing. What it is NOT is a fixed point, and
 * two things say how far off it might be. The alternating pairs bracket a
 * damped estimate about 10-25% above it (rung 49 ~420 MB against 380, rung
 * 42 ~218 against 197, rung 28 ~20.3 against 15.9). And rung 1 is the noise
 * control, because its funding is 0.00 B in all five passes by construction:
 * on an identical input its rate reads 3.12 to 3.59 kB/s and its DWELL 12.7
 * to 18.5 seconds, a spread of x1.46 -- comparable to the step the iteration
 * is still taking, which is why five passes at one run a rung cannot
 * separate the two.
 *
 * So the next pass on this table is `--runs 3`, which is three times the
 * hours, and the shape to reach for is DAMPED iteration -- seed pass N+1
 * with the mean of passes N-1 and N -- because a decreasing map is what
 * damping exists for. Until then these eight are the best measured curve
 * there has been (the first on the economy builds 365 and 366 left, and the
 * first with an anchor at the ceiling), and they are a reading rather than a
 * settled number.
 */
const EARNED = [[1, 0], [7, 617033], [14, 1312335], [21, 4210247], [28, 15863661], [35, 66839173], [42, 196810828], [49, 379908991]];
/*
 * Past the last anchor, the growth of the last measured pair carries on.
 *
 * DERIVED rather than written down: it was `(40/15) ** 0.25`, a ratio between
 * two anchors of the asserted curve, and it reached 2.02 GB by rung 28
 * against a modelled 15.20 MB -- so far past `TREE_TOTAL` that every row past
 * about rung 17 was measuring a fully bought turret whatever the prices said.
 * A tail taken off the measured curve's own last pair cannot do that.
 */
const TAIL = (() => {
  const [r0, e0] = EARNED[EARNED.length - 2];
  const [r1, e1] = EARNED[EARNED.length - 1];
  return (e1 / e0) ** (1 / (r1 - r0));
})();

function spendAt(tier) {
  if (FIXED !== null) return FIXED;
  const last = EARNED[EARNED.length - 1];
  if (tier >= last[0]) {
    return Math.min(TREE_TOTAL, Math.round(last[1] * TAIL ** (tier - last[0])));
  }
  for (let i = 1; i < EARNED.length; i++) {
    const [t0, e0] = EARNED[i - 1];
    const [t1, e1] = EARNED[i];
    /*
     * CLAMPED like the extrapolation branch above it, and it never was.
     *
     * Only the `tier >= last[0]` branch clamped, which has never mattered
     * because the last anchor (95.8 MB at rung 42) is well under the tree's
     * own cost -- so nothing interpolated could exceed it. An EIGHTH anchor
     * at rung 49 moves rungs 43-48 out of the clamped branch, and if that
     * anchor is above `TREE_TOTAL` the `spend` column climbs past the whole
     * tree and then FALLS at rung 49, the only rung still reaching the clamp.
     * Measured with a rung-49 anchor of 300 MB: 42: 95.8 -> 43: 125.0 -> ...
     * -> 48: 270.8 -> 49: 133.1 MB. No measured figure moves (the buy loop
     * stops when nothing is affordable), so it is the READOUT that would have
     * been nonsense -- which is the only thing a funding column is for.
     */
    if (tier <= t1) {
      return Math.min(TREE_TOTAL,
        Math.round(e0 + ((e1 - e0) * (tier - t0)) / (t1 - t0)));
    }
  }
  return 0;
}

// ---- the bands ------------------------------------------------------------

/**
 * What each band brings that no lower band had. Derived from the table rather
 * than written out, so a wave that is re-banded moves this with it -- and a
 * band's *new* types are the only thing that makes tier n feel unlike tier
 * n-2, which is what wants measuring.
 */
function newTypesByBand() {
  const byBand = new Map();
  for (const w of WAVES) {
    if (w.teach || !w.band) continue;
    if (!byBand.has(w.band)) byBand.set(w.band, new Set());
    for (const [id] of w.of || []) byBand.get(w.band).add(id);
  }
  const seen = new Set();
  const out = new Map();
  for (const b of [...byBand.keys()].sort((a, z) => a - z)) {
    const fresh = [...byBand.get(b)].filter((id) => !seen.has(id));
    for (const id of byBand.get(b)) seen.add(id);
    // Heaviest last, so the report reads up to the thing that defines the band.
    fresh.sort((a, z) => hpOf(a) - hpOf(z));
    out.set(b, fresh);
  }
  return out;
}
const hpOf = (id) => (ENEMY_TYPES.find((t) => t.id === id) || {}).hp || 0;

const BANDS = newTypesByBand();
/** The same rule Director.bandsFor uses: the top band a tier draws from. */
const bandOf = (tier) => Math.min(5, Math.max(1, Math.ceil(tier / CFG.waves.tier.perBand)));

/**
 * The heaviest authored wave in each band, by the health it puts on the field.
 * A band's worst wave is the one that decides whether the band is survivable,
 * so it is the one the clear column is measured against.
 */
const HEAVIEST = new Map();
for (const w of WAVES) {
  if (w.teach || !w.band || !(w.of || []).length) continue;
  const weight = w.of.reduce((a, [id, n]) => a + hpOf(id) * n, 0);
  const held = HEAVIEST.get(w.band);
  if (!held || weight > held.weight) HEAVIEST.set(w.band, { of: w.of, weight });
}
// The BAND travels with it from build 301: a wave's size comes off
// `Director.budgetAt(tier, band)` now, so the bench cannot price one without
// knowing which band's budget it is spending.
for (const [b, v] of HEAVIEST) HEAVIEST.set(b, { of: v.of, band: b });

// ---- the loadout ----------------------------------------------------------

/*
 * The damage line, in the order a player spends it.
 *
 * Damage before cadence at the very start -- one HOLLOWPOINT is +25% against
 * HOT LOAD's +15% -- then the two alternating, then BOLT's own two, then the
 * rest of what changes what a round is worth.
 *
 * GIMBAL, ARRAY and SHROUD are deliberately NOT here, though a real player
 * buys all three. The body is one target, straight up, inside base reach:
 * there is no slew to shorten, no reach to extend and no corruption to
 * insulate, so all three would buy nothing this rig can see while eating
 * budget that would otherwise be damage. Leaving them in made the instrument
 * report a slower kill for a reason that has nothing to do with the gun. The
 * soak below still buys them once the line is exhausted.
 */
const LINE = [
  // One FEED, and that is the whole cadence line: it was capped in 178 and
  // halved in 193, and HOT LOAD -- three levels of it, on the tree's default
  // -- went in 193 too. Everything else here buys what a round is worth.
  // Five levels from build 229, not three: this is the whole damage curve and
  // it is what keeps the tree paying past tier 6. All five are in the line, in
  // the order income reaches them.
  'hollowpoint', 'rate',
  'hollowpoint', 'hollowpoint',
  'hollowpoint', 'hollowpoint',
  // DOUBLE TAP used to be skipped here: it went to SPINE in build 209 and this
  // bench measures BOLT, so buying it would have spent a tier's budget on a
  // card that does nothing to the round being measured. It came out entirely
  // in build 225 and there is nothing left to skip.
  'overstuffed',
  'overstuffed', 'overstuffed', 'overstuffed',
  'salvo',
  // SPINES is real damage here: a body that closes on the turret stands in it.
  'casing', 'casing', 'casing',
];

// ---- the run --------------------------------------------------------------

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH
    || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const tiers = [];
for (let t = FROM; t <= TO; t++) tiers.push(t);

/** tier -> run -> { spend, bought, marks: [{id, ttk, rounds, dmg, hp, killed}] } */
const results = new Map(tiers.map((t) => [t, []]));
const errs = [];
/*
 * The rungs the plan's own table states, which are the middle rung of each
 * boss band -- `i * bossEvery + (bossEvery + 1) / 2`, the same anchors
 * `CFG.waves.tier.flow` is authored on. Derived from `bossEvery` rather than
 * written out as 4/11/18/25/32/39/46, and clipped to whatever range the run
 * was asked for so `--to 20` does not measure rung 46.
 */
const STREAM_RUNGS = CFG.waves.tier.flow
  .map((_, i) => i * CFG.waves.tier.bossEvery + (CFG.waves.tier.bossEvery + 1) / 2)
  .filter((t) => t >= FROM && t <= TO);
const STREAM = [];

for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => errs.push(String(e)));
  /*
   * The same determinism recipe the other three use: stub rAF so nothing
   * advances but our own loop, block the service worker so a stale cache
   * cannot serve a different build, and stub AudioContext because audio.init
   * fills a noise buffer with fifty thousand Math.random draws.
   */
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__sim);
  // What this probe's figures are read off. `served.mjs` refuses a served
  // tree that lacks any of them: the purse is declared because it HAS been
  // renamed (world.energy -> world.bytes at build 286), which is what made
  // phase 5's build-283 column a table of a tree it never read.
  {
    const { abort } = await requireWorld(page, ['bytes'], 'tiers.mjs');
    if (abort) { await browser.close(); process.exit(1); }
  }
  await page.evaluate(() => { document.getElementById('startBtn').click(); });

  for (const tier of tiers) {
    const out = await page.evaluate(async ({
      tier, spend, line, cap, range, slack, benchFor, waveCap, ids, waveOf,
    }) => {
      const { CFG } = await import('../src/config.js');
      // Imported, not restated: `budgetAt` and `threatOfWave` are what `load`
      // itself uses, so the bench prices a wave the way the game does.
      const { Director, threatOfWave } = await import('../src/enemies.js');
      const g = window.__sim;
      const S = 1 / 60;

      // ---- a run of its own, at this tier, holding this much -------------
      g.restart();
      const w = g.world;
      /*
       * The instrument checking its own instrument. Every tier is measured in
       * the same page, so a restart that left purchases behind would price
       * tier 9 with tier 8's turret still bolted on and every number after it
       * would be quietly wrong.
       */
      if (w.ledger.length) throw new Error(`restart left ${w.ledger.length} purchases behind`);
      for (let i = 0; i < 90; i++) g.update(S);
      g.debugTeachAll();
      /*
       * ---- AND THE ERA THE RUNG IS ACTUALLY PLAYED AT, build 306 ---------
       *
       * This probe never touched the era, and until build 305 that was very
       * nearly right: `eraGate` was 42, so nineteen of its twenty rows were
       * era-1 rows anyway. 305 moved the hold to 28 and the whole of band 5
       * -- rungs 29 to 35 -- became era-2 territory, so every row past 28 was
       * measuring band 5 on a field the game no longer sends it to. A loose
       * crossing is 1481 world units at era 2 against 962 at era 1 and a
       * body's own speed does not scale with it, so that is not a rounding
       * difference: it is a third more ground to cover.
       *
       * DERIVED from `eraGate` rather than written out, so this follows the
       * next time the hold moves.
       *
       * The switch is FORCED rather than requested. `setEra` refuses a switch
       * to the era it is already in, and `reset()` writes `w.era = 1` -- so
       * after an era-2 row the next `restart()` leaves the flag at 1 and
       * `setEra(1)` is a no-op that runs neither `takeField` nor the sky.
       * Writing the opposite era first makes the switch real. (The GEOMETRY
       * is safe either way: `reset()` re-derives it by comparing `CFG.zoom`
       * against `CFG.ZOOMS[era]` and resizing if they disagree, which was
       * checked rather than assumed -- the first version of this note claimed
       * a resize bug that is not there.) It still has to happen BEFORE
       * anything the probe sets that a resize would overwrite, because the
       * resize rewrites every `SCALED` value from `BASE`.
       *
       * `newForm` moves with it because the era and that flag are one state:
       * up sets 'done', down sets 'armed'.
       */
      const era = tier > CFG.waves.tier.eraGate ? 2 : 1;
      w.era = era === 2 ? 1 : 2;
      w.newForm = era === 2 ? 'done' : 'armed';
      g.setEra(era);
      w.director.setTier(tier);
      // The director is silenced rather than paused: this measures one body,
      // and a wave landing on top of it would be measuring a fight.
      w.director.update = () => {};

      w.bytes = spend;
      const bought = [];
      /*
       * In order, stopping at the first thing the budget cannot reach -- not
       * skipping down the list to whatever is still affordable.
       *
       * Skipping made the table non-monotone: at tier 3 the leftovers reached
       * DOUBLE TAP, at tier 4 a second FEED ate them first, and the richer
       * turret came out holding strictly less than the poorer one. A priority
       * list is a thing you save up for, and a calibration column has to be
       * comparable down its whole length.
       */
      for (const id of line) {
        const got = g.buy(id);
        /*
         * Only "cannot afford" stops the line. "maxed" means the line asks for
         * a level the tree no longer sells and is skipped -- build 178 took
         * FEED from two levels to one, and breaking on maxed abandoned the
         * damage line at its fourth entry and measured tree order instead. The
         * table looked like the nerf had moved the taps six tiers later; it had
         * moved nothing.
         */
        if (got === 'poor') break;
        if (got === 'ok') bought.push(id);
      }
      // Whatever the damage line could not absorb goes on the rest of the
      // tree, in tree order -- parents first, so an arm is open before its
      // leaves are reached. This is where a large budget stops helping.
      const { NODES } = await import('../src/tree.js');
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
      if (w.round !== 'standard') w.round = 'standard';

      // ---- one body at a time --------------------------------------------
      const clear = () => {
        w.enemies.length = 0;
        w.drops.length = 0;
        w.debris.length = 0;
        w.projectiles.length = 0;
        w.effects.length = 0;
        w.mines.length = 0;
        w.pendingBlasts.length = 0;
        w.attackers.clear();
        w.heldFor = 0;
      };

      /*
       * ---- the gun, on its own ----
       *
       * Rate and damage cannot be read off the kills. A MOTE at tier 1 dies in
       * a fifth of a second, and one round inside a fifth of a second is
       * "five a second" -- the first version of this reported cadence rising
       * and falling at random because it was dividing single rounds by
       * fractions. So the gun is measured against a wall instead: one body
       * with enough health that the clock always runs out first, pinned where
       * it was put so the range never changes.
       *
       * The same wall at every tier, so the column is comparable down its
       * whole length. It measures what leaves the barrel and lands, which is
       * the thing plan B moves -- SPINES is in the line above and contributes
       * nothing here, because nothing is touching the turret.
       */
      const bench = (secs) => {
        clear();
        w.autoAim = false;
        w.autoFire = false;
        const made = g.debugSpawnGroup('bloom', 1, {
          where: 'field', shape: 'line', x: w.width / 2, y: w.shooter.y - range,
        });
        const e = made[0];
        for (let i = 0; i < 90 && (e.staged || e.spawnIn > 0); i++) g.update(S);
        e.maxHp = 1e9;
        e.hp = 1e9;
        const px = e.x;
        const py = e.y;

        w.autoAim = true;
        w.autoFire = true;
        g.fireTimer = 0;
        w.shooter.cooldown = 0;

        let rounds = 0;
        let dmg = 0;
        let t = 0;
        let last = e.hp;
        const realPush = w.projectiles.push.bind(w.projectiles);
        w.projectiles.push = (...ps) => { rounds += ps.length; return realPush(...ps); };
        while (t < secs) {
          g.update(S);
          t += S;
          e.x = px; e.y = py; e.vx = 0; e.vy = 0;
          if (e.hp < last) dmg += last - e.hp;
          last = e.hp;
        }
        w.projectiles.push = realPush;
        return { rounds, dmg, secs: t };
      };
      const gun = bench(benchFor);

      /*
       * ---- and the same tier as a wave ----
       *
       * One body is the wrong wall, and the table above is what says so: the
       * health slope moves a kill from a fifth of a second to about one, and
       * that is the whole of what +6% a tier can do against a tree that
       * multiplies damage by nineteen. What actually presses on a player is
       * the wave -- population and health together, arriving at once -- so the
       * band's heaviest authored wave is built at this tier's size, by the
       * director's own arithmetic, and timed until the field is clear.
       *
       * It arrives from the top and marches in, which is the only way a wave
       * ever arrives. Put down loose on the field instead -- which is what
       * this did first -- a body can land level with the turret or below it,
       * and `autoTarget` only looks 78 degrees either side of straight up, so
       * it is unshootable for the rest of its life: a band-2 wave sat out the
       * full two-minute cap with a LURCHER parked beside the barrel. The
       * march-in is run with the gun cold so the clock measures the killing
       * and not the walking.
       */
      const waveClear = (of, cap2, band) => {
        clear();
        w.autoAim = false;
        w.autoFire = false;
        /*
         * ---- the size comes off the BUDGET from build 301 ---------------
         *
         * This restated `scaleAt(tier).pop * population`, which was the
         * arithmetic `load` used while the authored numbers were counts. They
         * are PROPORTIONS now: a wave is scaled until its threat meets
         * `Director.budgetAt(tier, band)`. A bench that keeps its own copy of
         * a formula reports the game it used to be -- measured, this one
         * would have built a band-5 wave at rung 35 from the old swell and
         * called the result a clear time for the new engine.
         */
        const T = threatOfWave({ of });
        const swell = T > 0
          ? Director.budgetAt(w.director.tier, band || 1) / T
          : 1;
        let asked = 0;
        for (const [id, base] of of) {
          const n = Math.max(1, Math.round(base * swell));
          asked += n;
          g.debugSpawnGroup(id, n, {});
        }
        for (let i = 0; i < 60 * 20 && w.enemies.some((e) => e.staged || e.spawnIn > 0); i++) {
          g.update(S);
        }
        /*
         * What the wave is worth, in energy.
         *
         * Measured off the purse and the floor, not off the table. `e.bounty`
         * is a MULTIPLIER on what a body's wreckage is worth, not the worth
         * itself -- the worth comes from the body's mass through
         * CFG.energy.perMass and is split across the motes it leaves. Summing
         * bounty gave a column with no units in it, which read as a 40x
         * collapse in income and was nothing of the kind.
         *
         * Offered rather than banked: what lands in the purse has already had
         * the corruption tax taken off it, and the tax is a property of how
         * the fight went rather than of the tier.
         */
        let hp = 0;
        for (const e of w.enemies) if (!e.harmless) hp += e.maxHp || 0;
        const purse0 = w.bytes;

        w.autoAim = true;
        w.autoFire = true;
        g.fireTimer = 0;
        w.shooter.cooldown = 0;
        const live = () => {
          let n = 0;
          for (const e of w.enemies) if (!e.dead && !e.harmless) n++;
          return n;
        };
        let t = 0;
        while (t < cap2 && live() > 0) { g.update(S); t += S; }
        // Banked, plus everything still lying on the floor unpaid for.
        let pay = w.bytes - purse0;
        for (const e of w.drops) if (!e.dead && e.bytes) pay += e.bytes * (e.bounty || 1);
        return {
          asked, pay, hp, secs: t, cleared: live() === 0, left: live(),
          // If anything is still marching when the clock starts, part of what
          // this timed was the walk in and the number is not comparable.
          marching: w.enemies.some((e) => e.staged),
        };
      };

      const marks = [];
      for (const id of ids) {
        clear();
        /*
         * Nothing is fired while it materialises. Both assists off is the only
         * way to hold fire: with auto aim on, `updateFiring` shoots at anything
         * it has a target for whether auto fire is set or not.
         */
        w.autoAim = false;
        w.autoFire = false;
        // Straight up from the turret, not up from the floor. The floor is only
        // 210 units below the turret, so measuring from it put the body 30
        // units off the muzzle -- close enough that it died inside one frame.
        const made = g.debugSpawnGroup(id, 1, {
          where: 'field', shape: 'line', x: w.width / 2, y: w.shooter.y - range,
        });
        if (!made.length) { marks.push({ id, missing: true }); continue; }
        for (let i = 0; i < 90 && made.some((e) => e.staged || e.spawnIn > 0); i++) g.update(S);

        const hp0 = made.reduce((a, e) => a + e.maxHp, 0);
        const at = Math.round(Math.hypot(made[0].x - w.shooter.x, made[0].y - w.shooter.y));

        /*
         * ---- and it is HELD there ----
         *
         * This column claims to be time-to-kill at `range`. It was not: the
         * body was put down at 300 and then allowed to walk, and what it
         * measured was as much the pathing as the gun.
         *
         * A TOW is where that showed. The pair spawns at 300 and 431 and
         * climbs away -- measured, head 307 -> 682 -> 754 -> 1092 and mass
         * 431 -> 636 -> 840 -> 996 over nine seconds -- and the turret's
         * reach with the whole tree bought is 841. At about 6.6s the mass
         * crosses it, `autoTarget` returns nothing from then on, and the
         * probe sits out its 45-second cap waiting for a body the gun can no
         * longer point at. That is what every `>45s` in the old TOW column
         * was: not a time, a target that left. The health slope moved it only
         * because a lighter pair dies before it gets far enough away, which
         * is why build 194 appeared to "fix" it.
         */
        /*
         * A LEASH, not a nail, and the difference cost a table.
         *
         * The first version wrote the spawn position back every frame and
         * zeroed the velocity with it. That stops the drift, and it also
         * stops the body: a PRISM carries `reflect: 0.55`, so whether a bolt
         * lands depends on how it meets the surface, and one held perfectly
         * still at dead centre presents the same face to the muzzle for ever.
         * Measured, tier 5 PRISM went from 1.5s to >45s -- the probe had
         * built a body the gun could not hurt and reported it as a wall.
         *
         * So each body is held near where it was put, with `SLACK` to move in
         * and its velocity never touched. Inside that ball it wobbles, spins
         * and takes recoil exactly as it would; outside it is put back on the
         * edge and carries on trying. That answers the defect this is for --
         * a target walking out of the turret's 841-unit reach -- without
         * answering anything it is not.
         *
         * Both of the simpler versions were tried and both were wrong, in
         * opposite directions. A hard nail on the spawn point breaks PRISM
         * (>45s against 1.5s, either with the velocity zeroed or not: a fixed
         * point presents a fixed face). A leash on distance alone leaves the
         * TOW free to swing out of `autoTarget`'s 78-degree cone, and tier 20
         * went on reading >45s. The ball is what holds both.
         */
        const leashed = made.map((e) => ({ e, x: e.x, y: e.y }));
        const pin = () => {
          for (const p of leashed) {
            if (p.e.dead) continue;
            const dx = p.e.x - p.x;
            const dy = p.e.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d <= slack || d < 1e-6) continue;
            // Back onto the edge of its own ball, along its own bearing, and
            // its velocity is left alone so it carries on trying.
            const k = slack / d;
            p.e.x = p.x + dx * k;
            p.e.y = p.y + dy * k;
          }
        };

        w.autoAim = true;
        w.autoFire = true;
        g.fireTimer = 0;
        w.shooter.cooldown = 0;

        let rounds = 0;
        let dmg = 0;
        /*
         * Counted where they are made, not where they are seen. Watching
         * `w.projectiles` between frames misses every round that is fired and
         * consumed inside one update, which at close range is all of them.
         */
        const realPush = w.projectiles.push.bind(w.projectiles);
        w.projectiles.push = (...ps) => { rounds += ps.length; return realPush(...ps); };

        /*
         * ...and the same hazard on the other side. A body that dies is swept
         * out of `w.enemies` by the update that killed it, so a plain walk of
         * the list after the frame never sees the blow that finished it. The
         * roster holds what each body had last frame; anything that has left
         * the list has had the rest of it taken off.
         */
        const roster = new Map();
        for (const e of w.enemies) roster.set(e, e.hp);
        const note = () => {
          const live = new Set(w.enemies);
          for (const [e, had] of [...roster]) {
            if (!live.has(e)) { dmg += Math.max(0, had); roster.delete(e); }
          }
          for (const e of w.enemies) {
            const had = roster.get(e);
            if (had !== undefined && e.hp < had) dmg += had - e.hp;
            roster.set(e, e.hp);
          }
        };
        const alive = () => {
          let n = 0;
          for (const e of w.enemies) if (!e.dead && !e.harmless) n++;
          return n;
        };

        let t = 0;
        while (t < cap) {
          pin();
          g.update(S);
          t += S;
          note();
          if (alive() === 0) break;
        }
        w.projectiles.push = realPush;
        marks.push({ id, ttk: t, rounds, dmg, hp: hp0, at, killed: alive() === 0 });
      }

      const wave = waveClear(waveOf.of, waveCap, waveOf.band);
      return { tier, spend, bought, gun, marks, wave, era: w.era };
    }, {
      tier, spend: spendAt(tier), line: LINE, cap: CAP, range: RANGE, slack: SLACK,
      benchFor: BENCH, waveCap: WAVECAP, ids: BANDS.get(bandOf(tier)) || [],
      waveOf: (HEAVIEST.get(bandOf(tier)) || { of: [], band: 1 }),
    });

    results.get(tier).push(out);
  }
  /*
   * ...and the stream, ON THE FIRST RUN ONLY. It is 120 seconds of real
   * frames per rung against a cold gun, which is the most expensive thing in
   * this script -- and unlike the columns above it is not a calibration
   * surface that wants averaging. What it reports is the shape of the
   * arrivals, and the shape does not need three draws to be read.
   */
  if (r === 0) {
    for (const rung of STREAM_RUNGS) STREAM.push(await streamAt(page, rung));
  }
  await ctx.close();
}
await browser.close();

// ---- report ---------------------------------------------------------------

const med = (xs) => {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pad = (s, n) => String(s).padStart(n);

/*
 * ---- THE STREAM, off the real director (build 301) -----------------------
 *
 * The one measurement nothing in this repo could make. Builds 300 and 301
 * moved the pressure out of per-body health and into how many bodies arrive
 * and how fast -- and every instrument here watched a single body's time to
 * die or one authored wave's time to clear, which is why the plan's audit
 * asks for this column by name.
 *
 * Four numbers a rung, all of them emergent rather than authored: ARRIVALS a
 * second (what `emit` actually released, divided by the window), the mean
 * STANDING field, the bodies a whole WAVE asked for, and the wave's LENGTH in
 * seconds. The last two are the pair the plan's table states and the first
 * two are the pair only a run can answer -- how many stand at once is arrival
 * rate times how long a body lives, and how long a body lives depends on the
 * margin, the round and where the assist is pointed.
 *
 * Driven with the turret FULLY BOUGHT and the assists on, and the reason is
 * that the first version was not and measured the wrong thing entirely. With
 * the gun cold the field fills to `CFG.maxEnemies` in the first few seconds,
 * `emit`'s hard gate then refuses every release, and the arrival rate
 * collapses to `maxEnemies / window` -- measured 0.12 to 0.76 a second
 * against an authored 0.9 to 5.0, with ONE wave started in 120 seconds at
 * six of the seven rungs. That is a measurement of the cap, which is a
 * constant, and not of the rung.
 *
 * So the gun has to be able to clear, or nothing turns over and there is no
 * stream to see. A fully bought turret is the FLOOR on the standing field --
 * the most gun the tree can buy against this rung's wave -- which is the
 * honest bound to state beside the authored rate. What a given rung's own
 * income affords is the columns above; this one is about the shape of the
 * arrivals.
 */
async function streamAt(page, rung) {
  return page.evaluate(async (tier) => {
    const { CFG } = await import('../src/config.js');
    const { Director, hostileCount, threatOfWave } = await import('../src/enemies.js');
    const g = window.__sim;
    const w = g.world;
    const S = 1 / 60;
    g.restart();
    w.phase = 'staging';
    g.debugTeachAll();
    // ...and the era this rung is played at. See the long note in the loadout
    // pass: derived from `eraGate`, and forced because `reset()` clears the
    // flag without resizing.
    {
      const era = tier > CFG.waves.tier.eraGate ? 2 : 1;
      w.era = era === 2 ? 1 : 2;
      w.newForm = era === 2 ? 'done' : 'armed';
      g.setEra(era);
    }
    g.debugClearField();
    g.debugGiveBytes(900000000);
    w.earned = 999999000;            // every type open, so the roster is the band's
    g.debugBuyAll();                 // see the note above: a cold gun measures the cap
    w.autoAim = true;
    w.autoFire = true;
    const d = w.director;
    delete d.update;
    w.spawnLock = 0;
    d.setTier(tier);
    d.hold = true;                   // the rung is the question; do not climb off it
    d.probe = null; d.grace = 0;
    const SECS = 120;
    let released0 = w.released;
    const standing = [];
    /*
     * The first wave's length counts too. It was pushed only on the SECOND
     * transition (`if (waves > 0)`), so a window that saw one wave reported a
     * mean length of 0.0 -- a zero from an instrument that had never been
     * shown to read anything else.
     */
    let waves = 0, at = d.at, waveStart = -1, lengths = [], asked = [];
    for (let f = 0; f < 60 * SECS; f++) {
      // The fuse pinned out: a discharge resets the wave and empties the
      // field, which is a second mechanism inside the one being measured.
      d.glitch = 0; d.held = 0; d.holdFor = 0;
      g.update(S);
      if (d.at !== at) {
        at = d.at;
        if (waveStart >= 0) lengths.push((f - waveStart) / 60);
        asked.push(d.asked);
        waveStart = f;
        waves++;
      }
      if (f % 30 === 0) standing.push(hostileCount(w));
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const band = d.bandsFor(tier)[1];
    return {
      tier,
      band,
      arrivals: (w.released - released0) / SECS,
      standing: mean(standing),
      peak: Math.max(0, ...standing),
      asked: mean(asked),
      length: mean(lengths),
      waves,
      budget: Director.budgetAt(tier, band),
      flow: Director.flowAt(tier),
      void: threatOfWave({ of: [] }),
    };
  }, rung);
}

console.log(`\nTHE LADDER — tiers ${FROM}-${TO}, ${RUNS} run${RUNS > 1 ? 's' : ''} each,`
  + ' BOLT and the damage line');
console.log(`  spend: ${FIXED !== null ? `${fmtBytes(FIXED)} flat` : "docs/pacing.md's earned-by-tier targets"}`
  + `, capped at the whole tree (${fmtBytes(TREE_TOTAL)})`);
/*
 * All four slopes compound off rung 1 from build 300 -- `pop` was
 * `1 + pop * tier` with a `popCap`, and both fields are gone, so this line
 * printed `undefined` for two of the three numbers it exists to show. A
 * readout with no assertion behind it rots; this one is printed beside the
 * table it explains, so it has to follow the config rather than restate it.
 */
{
  const T = CFG.waves.tier;
  const F = T.flow; const bw = T.bossEvery;
  const flowAt = (t) => {
    const x = (t - (bw + 1) / 2) / bw; const i = Math.floor(x);
    if (i < 0) return F[0];
    if (i >= F.length - 1) return F[F.length - 1];
    return F[i] + (F[i + 1] - F[i]) * (x - i);
  };
  const top = T.ceiling;
  console.log(`  slopes, all x^(n-1) off rung 1: pop x${T.popStep} (x${(T.popStep ** (top - 1)).toFixed(1)} `
    + `at ${top}) · hp x${T.hpStep} (x${(T.hpStep ** (top - 1)).toFixed(2)}) · bounty x${T.bountyStep} `
    + `(x${(T.bountyStep ** (top - 1)).toFixed(2)})`);
  console.log(`  stream: ${flowAt(1).toFixed(2)} releases a second at rung 1 rising to `
    + `${flowAt(top).toFixed(2)} at ${top} (x${(flowAt(top) / flowAt(1)).toFixed(2)})`);
}
const atRange = [...results.values()].flat()
  .flatMap((r) => r.marks.map((m) => m.at)).filter(Number.isFinite);
console.log(`  one body HELD at ${RANGE} units straight up (measured ${med(atRange) || RANGE}),`
  + ` cap ${CAP}s\n`);

/*
 * ---- the currency columns are FORMATTED, and that is not decoration -------
 *
 * `spend` was `pad(num(spend), 9)` and `pay` `pad(Math.round(perWave), 6)`,
 * both sized for point-magnitude figures. In bytes they overflow: measured on
 * build 287 the band ran into the spend (`22,333,333` is band 2 and 2,333,333)
 * and the pay ran into the pay/s (`11180712612.9` is 111,807 and 12,612.9).
 * A table nobody can parse is a table that stopped being an instrument, and it
 * exits 0 either way -- which is the failure mode this repo keeps paying for.
 *
 * Formatted rather than merely widened, because the figures are the game's
 * currency and the game prints them this way from build 285: a column that
 * reads `500 kB` against a card that reads `500 kB` is one fewer conversion
 * between the bench and the thing it is benching.
 */
console.log('  tier band era     spend  buys  rnd/s     dps  worst   wave  clear       pay      pay/s  |  time to kill');
const worst = new Map();
const clears = new Map();
const pays = new Map();
const loose = [];
for (const tier of tiers) {
  const runs = results.get(tier);
  if (!runs.length) continue;
  const band = bandOf(tier);
  const spend = runs[0].spend;
  const buys = med(runs.map((r) => r.bought.length));
  // Rate and damage off the wall, where a second is a second.
  const rps = med(runs.map((r) => r.gun.rounds / r.gun.secs));
  const dps = med(runs.map((r) => r.gun.dmg / r.gun.secs));

  const ids = BANDS.get(band) || [];
  const cells = [];
  let top = 0;
  for (const id of ids) {
    const ts = runs.map((r) => r.marks.find((m) => m.id === id) || {});
    const missed = ts.some((m) => m.killed === false);
    const v = med(ts.map((m) => m.ttk));
    cells.push(`${id} ${missed ? `>${CAP}s` : `${v.toFixed(1)}s`}`);
    // The band's worst case is its slowest member, which is not always its
    // biggest -- PRISM turns back 55% of what is fired at it and outlasts
    // bodies with three times its health.
    top = Math.max(top, missed ? Infinity : v);
  }
  worst.set(tier, top);

  const asked = med(runs.map((r) => r.wave.asked));
  const stuck = runs.some((r) => !r.wave.cleared);
  const secsEach = runs.map((r) => r.wave.secs);
  const clear = med(secsEach);
  clears.set(tier, stuck ? Infinity : clear);
  /*
   * A wave is not one number. Where the bodies happen to arrive and how much
   * the assist thrashes between them swings the same wave by five times at
   * this tier count, so a bare median would be a figure with nothing behind
   * it. `~` marks a tier whose runs disagreed by more than double.
   */
  const spread = Math.max(...secsEach) / Math.max(0.1, Math.min(...secsEach));
  if (runs.some((r) => r.wave.marching)) loose.push(tier);
  // What the wave is worth, and what that comes to a second at the pace it
  // was actually put down: the two numbers plan C's earned-by-tier curve is
  // either supported by or is not.
  const perWave = med(runs.map((r) => r.wave.pay));
  const perSec = med(runs.map((r) => r.wave.pay / Math.max(0.1, r.wave.secs)));
  pays.set(tier, perSec);

  console.log(`  ${pad(tier, 4)}${pad(band, 5)}${pad(runs[0].era, 4)}${pad(fmtBytes(spend), 10)}${pad(Math.round(buys), 6)}`
    + `${pad(rps.toFixed(1), 7)}${pad(dps.toFixed(0), 8)}`
    + `${pad(Number.isFinite(top) ? `${top.toFixed(1)}s` : `>${CAP}s`, 7)}`
    + `${pad(Math.round(asked), 7)}`
    + `${pad(stuck ? `>${WAVECAP}s` : `${clear.toFixed(0)}s${spread > 2 ? '~' : ''}`, 7)}`
    + `${pad(fmtBytes(perWave), 10)}${pad(fmtRate(perSec), 11)}  |  ${cells.join('   ')}`);
}

/*
 * The wall, said as a tier. Plan B wants a tier's band held inside four
 * seconds through about tier 10 and past six by about fourteen; those two
 * crossings are the whole of what this instrument is for, so they are stated
 * rather than left to be read off the column.
 */
console.log('\n  where the slowest member of the band crosses');
for (const mark of [2, 4, 6, 10]) {
  const at = tiers.find((t) => worst.get(t) > mark);
  console.log(`    ${String(`${mark}s`).padEnd(4)} ${at ? `tier ${at}` : `not inside tier ${TO}`}`);
}
console.log('\n  ...and where the band\'s heaviest wave crosses');
for (const mark of [20, 40, 60, 90]) {
  const at = tiers.find((t) => clears.get(t) > mark);
  console.log(`    ${String(`${mark}s`).padEnd(4)} ${at ? `tier ${at}` : `not inside tier ${TO}`}`);
}

// What the money actually bought, at three points along the climb.
const shown = [...new Set([FROM, Math.round((FROM + TO) / 2), TO])];
console.log('\n  what the spend bought');
for (const tier of shown) {
  const r = (results.get(tier) || [])[0];
  if (!r) continue;
  const count = {};
  for (const id of r.bought) count[id] = (count[id] || 0) + 1;
  const list = Object.entries(count)
    .map(([id, n]) => (n > 1 ? `${id}x${n}` : id)).join(' ');
  console.log(`    tier ${String(tier).padEnd(3)} ${fmtBytes(r.spend).padStart(9)}  ${list}`);
}

console.log(`\n  rnd/s    projectiles a second, counted at the muzzle, against a wall for ${BENCH}s`);
console.log('  dps      ...and what landed on it, a second — armour already paid for');
console.log('  worst    the slowest member of the band: what the tier is bounded by');
console.log('  wave     bodies in the band\'s heaviest authored wave, at this tier\'s size');
console.log('  pay      bytes the wave offers, banked plus still on the floor');
console.log('  pay/s    ...over the seconds it took.');
console.log('           NOT a run\'s income. This is the band\'s HEAVIEST wave, alone, with');
console.log('           no rest between waves and the floor counted as collected — about');
console.log('           eight times what a real run banks. A stock turret on the assists');
console.log('           banks 4,417 in fifteen minutes. Use it to compare tiers with each');
console.log('           other, never to price anything.');
console.log(`  clear    ...and how long the whole of it took to put down (cap ${WAVECAP}s).`);
console.log('           ~ means the runs disagreed by more than double: read the tier,');
console.log('           not the second. Raise --runs before tuning against this column.');
console.log('           A BOLT number, like every column here. Past tier 8 the tree');
console.log('           sells the arsenal rather than BOLT damage, and the late wall is');
console.log('           answerable with another round: at tier 20 SPORE clears the');
console.log('           band-5 wave in 64s against BOLT\'s 160 -- measured at build');
console.log('           195, on the round-by-round bench and not this column.');
console.log('           The plateau is intentional -- see docs/pacing.md.');
console.log('  NOTHING HERE CARRIES A TRAIT. This bench spawns its wave directly');
console.log('           rather than through Director.load, so the five rules that');
console.log('           arrive from rung 10 are absent from every column above.');
console.log('           Right for a calibration surface, wrong as a statement');
console.log('           about the ladder as it is played.');
if (loose.length) {
  console.log(`\n  NOT COMPARABLE: still marching in when the clock started at tier ${loose.join(', ')}`);
}
console.log('  buys     tree levels owned: the damage line first, then whatever');
console.log('           the budget could still reach in tree order');

if (STREAM.length) {
  console.log('\nTHE STREAM — off the real director, turret fully bought, assists on');
  console.log('  rung band  arr/s  standing  peak   asked   wave s  waves   budget  flow/s');
  for (const x of STREAM) {
    console.log('  ' + pad(x.tier, 4) + pad(x.band, 5) + pad(x.arrivals.toFixed(2), 7)
      + pad(x.standing.toFixed(1), 10) + pad(x.peak, 6) + pad(x.asked.toFixed(0), 8)
      + pad(x.length.toFixed(1), 9) + pad(x.waves, 7)
      + pad(x.budget.toFixed(0), 9) + pad(x.flow.toFixed(2), 8));
  }
  const f = STREAM[0]; const l = STREAM[STREAM.length - 1];
  console.log(`  rung ${f.tier} to ${l.tier}: arrivals x${(l.arrivals / Math.max(0.01, f.arrivals)).toFixed(2)}, `
    + `standing x${(l.standing / Math.max(0.1, f.standing)).toFixed(2)}, `
    + `asked x${(l.asked / Math.max(1, f.asked)).toFixed(1)}, `
    + `wave length x${(l.length / Math.max(0.1, f.length)).toFixed(2)}`);
  console.log('  arr/s    what emit() actually released, over 120s. The authored rate is');
  console.log('           CFG.waves.tier.flow; this is what survives the release gate,');
  console.log('           the field cap and the wave seams.');
  console.log('  standing the mean hostile count. EMERGENT: arrivals times how long a');
  console.log('           body lives, and nothing in the plan can predict it. Against a');
  console.log('           FULLY BOUGHT turret it is the floor -- the thinnest this field');
  console.log('           gets for any purchase set. A cold gun measures maxEnemies');
  console.log('           instead: the field saturates and emit() stops releasing.');
  console.log('  asked    bodies a whole wave queued, off Director.load. Proportions x');
  console.log('           the band budget from build 301, not an authored count.');
  console.log('  THE FUSE IS PINNED OUT. A glitch discharge resets the wave and');
  console.log('           empties the field, which is a second mechanism inside the');
  console.log('           one being measured -- the same fix build 300 made to the');
  console.log('           release-gate case after three runs read 0.86, 1.02 and 0.49.');
}

if (errs.length) console.log('\n  ERRORS', errs.slice(0, 3));
