/*
 * income.mjs -- what a run has BANKED by the rung it meets each slot on.
 *
 *   node scripts/income.mjs [--rungs 1,7,14,21,28,35,42,49] [--window 120]
 *                           [--iters 3] [--url URL] [--expect NNN]
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
const ITERS = Number(flag('iters', 3));
const RUNGS = String(flag('rungs', '')).split(',').filter(Boolean).map(Number);
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

/**
 * One window: fund the rung, pin it, drive it, and report what it banked.
 *
 * Everything the window depends on is set explicitly rather than inherited --
 * the round, the assists, the era, the roster gate, the field. `restart()` is
 * not a reset of everything a probe can leave behind, which is the rule two
 * flaky cases and three probes in this repo have each paid for.
 */
async function windowAt(rung, spend, seconds) {
  return page.evaluate(async ({ rung, spend, seconds, line }) => {
    const { CFG } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    const S = 1 / 60;
    g.restart();
    w.phase = 'staging';
    g.debugTeachAll();

    // The field this rung is played on, derived from the gate and forced.
    const era = rung > CFG.waves.tier.eraGate ? 2 : 1;
    w.era = era === 2 ? 1 : 2;
    w.newForm = era === 2 ? 'done' : 'armed';
    g.setEra(era);

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
      for (const n of NODES) {
        if (!n.id || n.repeat || n.dormant || n.currency) continue;
        while (g.buy(n.id) === 'ok') bought.push(n.id);
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
    let cur = null;
    let endedAt = null;
    let lastAt = d.at;
    let lastResting = d.resting;
    let glitches = 0;
    const earned0 = w.earned;
    const frames = Math.round(seconds * 60);
    for (let f = 0; f < frames; f++) {
      // Re-asserted every frame: `glitchOut` clears the hold on its own line,
      // so one discharge would unpin the rung for the rest of the window.
      d.hold = true;
      g.update(S);
      if (d.at !== lastAt && !d.resting) {
        cur = { at: d.at, teach: !!(d.wave && d.wave.teach), f0: f, earned0: w.earned };
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
      lastResting = d.resting;
    }

    const scored = waves.filter((x) => x.verdict && x.verdict !== 'unscored');
    const n = (v) => scored.filter((x) => x.verdict === v).length;
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    return {
      rung, era, spend, buys: bought.length,
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
      purseLeft: Math.round(w.bytes),
    };
  }, { rung, spend, seconds, line: LINE });
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
 * the window measured -- 2 for a surge, 1 for a clean, 0 for a stall. A rung
 * whose window scored NOTHING is a rung the run cannot climb off, so the
 * dwell is unbounded; the curve stops there and says so rather than dividing
 * by zero.
 */
function integrate(samples) {
  const dwellOf = (s) => {
    const steps = s.surge * 2 + s.clean;
    if (!s.waves || steps <= 0) return Infinity;
    // A seam that never closed inside the window is a seam this window cannot
    // price: the mean of an empty list is NaN, and the dwell it would give is
    // a number with nothing behind it.
    if (!Number.isFinite(s.rest)) return Infinity;
    return (s.waveSec + s.rest) / (steps / s.waves);
  };
  const dwell = samples.map((s) => ({ rung: s.rung, dwell: dwellOf(s), rate: s.rate }));
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

console.log(`income: serving build ${served.build ?? '?'} rev ${served.rev ?? '?'}`);
console.log(`  rungs ${SAMPLE.join(' ')} -- window ${WINDOW}s -- ${ITERS} pass(es)`);
console.log(`  ladder: bossEvery ${gates.bossEvery}, ceiling ${gates.ceiling}, `
  + `eraGate ${gates.eraGate}, gates ${gates.gates.join(' ')}`);

let funding = SAMPLE.map((rung) => ({ rung, earned: 0 }));
const passes = [];
for (let it = 0; it < ITERS; it++) {
  const samples = [];
  for (const rung of SAMPLE) {
    const spend = Math.max(0, Math.round(pick(funding, 'earned', rung)));
    samples.push(await windowAt(rung, spend, WINDOW));
  }
  const { curve, dwell, stop } = integrate(samples);
  passes.push({ samples, curve, dwell, stop });
  funding = curve;

  console.log(`\n---- pass ${it + 1} of ${ITERS} `
    + `${'-'.repeat(52)}`);
  console.log('  rung era      funded buys       rate  waves  su/cl/st  wave s  seam s   dwell s'
    + '     earned here');
  for (const s of samples) {
    const dw = dwell.find((d) => d.rung === s.rung);
    const e = curve.find((c) => c.rung === s.rung);
    console.log(`  ${pad(s.rung, 4)} ${pad(s.era, 3)} ${pad(fmt(s.spend), 11)} `
      + `${pad(s.buys, 4)} ${pad(fmt(s.rate) + '/s', 10)} ${pad(s.waves, 6)}  `
      + `${pad(s.surge, 2)}/${pad(s.clean, 2)}/${pad(s.stall, 2)}  ${pad(s.waveSec, 6)}  `
      + `${pad(Number.isFinite(s.rest) ? s.rest : '--', 6)}  `
      + `${pad(Number.isFinite(dw.dwell) ? dw.dwell.toFixed(1) + (s.waves < 3 ? '+' : '') : 'never', 8)}  `
      + `${pad(e ? fmt(e.earned) : '--', 14)}`);
  }
  if (stop) {
    console.log(`  the curve stops at rung ${stop}: no wave at or below it scored a climb, `
      + 'so the dwell there is unbounded and nothing above it is reachable');
  }
}

const last = passes[passes.length - 1];
console.log(`\n---- the anchors ${'-'.repeat(58)}`);
console.log('  For tiers.mjs\'s EARNED, which is asserted today and which its own header');
console.log('  asks to have a measured curve driven into. Bytes, and the probe\'s own');
console.log('  integral -- read the passes above before pasting one in.');
console.log(`  const EARNED = [${last.curve.map((c) => `[${c.rung}, ${c.earned}]`).join(', ')}];`);
if (errs.length) console.log(`\n  page errors: ${errs.length}\n    ${errs.slice(0, 5).join('\n    ')}`);

await browser.close();
