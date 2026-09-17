/*
 * The measuring stick for a boss fight.
 *
 * ORDINAL took three builds of retunes to land at a length anybody would sit
 * through, and every one of those retunes was a hand-rolled probe that died
 * with its container. Six more bosses are planned; this is that probe, kept.
 *
 * It does not watch a fight in real time. `game.update(dt)` is callable
 * directly and the frame loop in main.js is nothing but a rAF around it, so
 * this drives the same step at a fixed 1/60 with no rendering and no clock:
 * a two-hundred-second fight measures in a couple of seconds. Everything it
 * reports is in *game* seconds, which is what the tuning is about.
 *
 * What it reports, and why each number is here:
 *
 *   arrival      how long the scene runs, and the fastest caption in it --
 *                law 4 is a reading-speed ceiling and the first draft of
 *                ORDINAL's broke it at 34 characters a second
 *   stages       seconds per stage. A stage that is half the fight is not a
 *                stage, and that is exactly how ORDINAL's III measured at
 *                140 of 216 seconds before it was cut
 *   damage       what each class of body absorbed. The fight is meant to be
 *                about the core; a garrison eating most of the output is the
 *                shape of a fight that grinds
 *   in range     the closest each class ever came to the turret, against the
 *                base aim range of 400 -- law 2, which killed two of the six
 *                planned designs on paper
 *   death        how long the end sequence runs, and whether the REMAINDER
 *                arrived
 *
 * Run: node scripts/fight.mjs [n] [--runs N] [--url ...] [--expect NNN]
 * `n` is the anomaly number, 1 (ORDINAL) being the only one built.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import { checkServed, requireWorld } from './served.mjs';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
/*
 * ---- THE ANOMALY NUMBER, AND WHY THIS IS NOT `argv.find(/^\d+$/)` --------
 *
 * It was, and the bug is that a FLAG'S VALUE is also a bare number. CLAUDE.md
 * documents this probe as
 *
 *     node scripts/fight.mjs --seed 20260824 --hash 9000
 *
 * with no positional at all -- and `find` then returned **20260824**, the
 * seed, so the canonical instrument of this repo ran "ANOMALY 20260824"
 * instead of ORDINAL and said so in its own heading, every time. Measured on
 * build 339: the documented command reports `ANOMALY 20260824 ... hash
 * -1334607133` with nine bodies on the field, while `fight.mjs 1` reports
 * `ANOMALY 1` with 39/31/26/10/41 bodies across its samples and a hash of
 * 1664149562.
 *
 * It still worked as a DIFFERENTIAL -- the degenerate number is stable and
 * reproduced across builds 337, 338 and 339 -- which is exactly why it
 * survived: a differential instrument that is measuring the wrong thing
 * still looks like it is working. What it could not do is see anything that
 * needs a boss on the field.
 *
 * So the positional is read as a positional: the first token that is a bare
 * number AND is not the value of a preceding `--flag`. A missing positional
 * defaults to 1, which is what the heading has always claimed.
 */
const N = (() => {
  for (let i = 0; i < argv.length; i++) {
    if (!/^\d+$/.test(argv[i])) continue;
    if (i > 0 && /^--/.test(argv[i - 1])) continue; // it is a flag's value
    return Number(argv[i]);
  }
  return 1;
})();
const RUNS = Number(flag('runs', 1));
const BASE = flag('url', 'http://127.0.0.1:8099/index.html');
// Which tree is this reading? `scripts/served.mjs` carries the whole
// finding; the short version is that this container's http-server serves
// its own CWD and ignores a trailing path, so a `--url` differential can
// silently read the live tree twice. The heading names the served BUILD
// every run and `--expect NNN` refuses a mismatch, because printing is not
// guarding. Called before the browser launches, so `abort` is a plain exit.
const { abort: wrongTree } = await checkServed(BASE, flag('expect', null), 'fight.mjs');
if (wrongTree) process.exit(1);
// A fight that has not ended in this many game-seconds is not a fight, it is
// a wall -- report it as one rather than hanging.
const CAP = Number(flag('cap', 900));
/*
 * ---- THE SLOT: THE FIELD THE ANOMALY IS ACTUALLY MET ON -----------------
 *
 * `--era N` overrides; the default is DERIVED from `anomalyEra(n)`, which is
 * the same function `Game.debugBoss` sets the era off. Never written out
 * here: the gate table moved at build 299 and the hold rung at 305, and a
 * copy of either in a probe is build 329's stale-derived-number shape.
 *
 * Until build 353 this probe set NO era, so every run was on era 1 -- and
 * `anomalyEra` puts DYNAMO, PARITY and TERMINUS on era 2 from build 305. So
 * three of the seven had never been measured on the field they are met on,
 * which is build 305's own `tiers.mjs` finding ("the one instrument pointed
 * at the ordinary field was measuring band 5 on a field the game no longer
 * sends it to") arriving in the boss instrument.
 *
 * Measured, the era moves three things and NOT the boss: `CFG.power` 1 ->
 * 1.3 (it keys off `CFG.scale`, so it follows the era's zoom), the closing
 * column 753 -> 1158 and the width 629 -> 968. A boss's own health is
 * era-independent -- two draws of DYNAMO's core read 3979 and 4190, which is
 * the constructor's `rand(0.92, 1.1)` and not a scaling.
 *
 * THE RUNG IS DELIBERATELY NOT SET, and that is measured rather than
 * assumed. Every boss body is `fixed` and so is every minion, so
 * `scaleToTier` returns on its first line for all of them: ORDINAL's core
 * reads 1788 at rung 1 and 1787 at rung 7, and its TALLYs 171 and 172. The
 * player's own `gunScale` is 1 at stock either way. So a boss fight has no
 * rung channel at all and rung 1 is the honest place to measure one -- which
 * is why the gate rung is PRINTED as the slot's label and not applied.
 */
const ERA = flag('era', null);
/*
 * `--seed N` makes the whole session deterministic: the PRNG below replaces
 * Math.random before a single line of the game has run, so two trees that
 * behave identically produce byte-identical reports.
 *
 * Without it a fight varies by fifty seconds run to run -- garrison release,
 * repair targets and burst angles are all rolled -- which is fine for asking
 * "how long is this fight" and useless for asking "did that refactor change
 * anything". This is how Phase 0's gate is actually checked.
 */
const SEED = flag('seed', null);
/*
 * `--hash N` runs N frames of the fight and prints a hash of the world as it
 * went, instead of a report. With `--seed` that is reproducible to the bit,
 * which is how a refactor is checked: take the hash, change the code, take it
 * again. Phase 0 -- generalising this engine from one boss to seven -- was
 * gated on 9000 frames of ORDINAL hashing the same before and after.
 *
 * It is a blunt instrument on purpose. It does not say what changed, only
 * that something did, and that is the question a refactor has to answer.
 */
const HASH = flag('hash', null);
const STEP = 1 / 60;
const CHUNK = 900; // steps per round trip: 15 game-seconds

const browser = await chromium.launch();
const errors = [];
/*
 * The slot the last run was fought in: the rung the anomaly is gated at, the
 * era it was met on, and the three things the era moves. It is recorded here
 * rather than folded into the per-run report because it is a property of the
 * SETUP and is identical across `--runs`, and because a table of fight lengths
 * that does not say which field a row was measured on cannot be read six
 * builds later -- which is exactly what `tiers.mjs` had to be corrected for at
 * build 305, and what left builds 5, 6 and 7 measured on era 1 here.
 */
let lastSlot = null;

/** One fight, driven end to end. Returns the report the page built. */
async function fight(page) {
  await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    g.debugTeachAll();
    /*
     * Assists only, and nothing bought.
     *
     * This is the floor the length targets are written against: whatever the
     * fight measures here, somebody with upgrades does faster. Measuring a
     * kitted-out turret would flatter every boss and tell us nothing about
     * the player who opens the way the first time they can afford it.
     */
    w.autoAim = true;
    w.autoFire = true;
    w.bytes = 0;

    /*
     * The recorder. It rides the boss rather than the frame: every figure
     * below is sampled inside the driven loop, so nothing here depends on
     * rendering having happened.
     */
    const rec = {
      t: 0,
      stage: {}, // stage -> game-seconds spent in it
      seen: null,
      arrival: 0,
      arrived: false,
      captions: [], // { text, hold } as they are read
      lastLine: null,
      lineT: 0,
      hp: {}, // type id -> damage absorbed
      near: {}, // type id -> closest it ever came to the turret
      death: 0,
      dying: false,
      remainder: 0,
      ended: 0,
      note: [],
    };
    window.__fight = rec;
  });

  const slot = await page.evaluate(async ({ n, want }) => {
    const { anomalyEra } = await import('../src/boss.js');
    const { CFG } = await import('../src/config.js');
    const { entryLine } = await import('../src/portal.js');
    const T = CFG.waves.tier;
    const g = window.__sim;
    const w = g.world;
    const era = want === null ? anomalyEra(n) : want;
    /*
     * `setEra` refuses a switch to the era it is already in, so the opposite
     * is written first -- build 305's note, on the same function. Before
     * `openBoss`, because `setEra` runs `takeField` and the boss has to
     * arrive onto the field it is going to be fought on.
     */
    if (w.era !== era) { w.era = era === 1 ? 2 : 1; g.setEra(era); }
    if (n === 1) w.aperture = 1; else w.apertures[n] = 1;
    const opened = g.openBoss(n);
    const core = w.boss && w.boss.core;
    return {
      era: w.era,
      derived: anomalyEra(n),
      rung: (T.gates || [])[n - 1] ?? null,
      opened: !!opened && !!w.boss,
      power: +CFG.power.toFixed(3),
      column: Math.round(w.shooter.y - entryLine(w, 0)),
      width: Math.round(w.width),
      coreHp: core ? Math.round(core.maxHp) : null,
      hard: w.boss ? +(w.boss.hard || 0).toFixed(3) : null,
    };
  }, { n: N, want: ERA === null ? null : Number(ERA) });
  if (!slot.opened) throw new Error(`anomaly ${N} did not open`);
  // Above the hash branch, so the hash report says which field it read too.
  lastSlot = slot;

  if (HASH !== null) {
    /*
     * The hash is a rung-1 ERA-1 number and the whole recorded history of it
     * is taken there, so re-siting it would void every comparison in
     * CLAUDE.md. `anomalyEra(1)` is 1, so the documented command is
     * unaffected -- this refuses the combination rather than silently
     * producing a figure nothing can be compared against.
     */
    if (slot.era !== 1) {
      console.error(`fight.mjs: --hash is an era-1 instrument and anomaly ${N} `
        + `is met on era ${slot.era}. Pass --era 1 to say so deliberately; the `
        + `recorded hash history is all era 1 and a era-2 figure compares to nothing.`);
      process.exit(1);
    }
    return hashRun(page, Number(HASH));
  }

  let done = false;
  let steps = 0;
  const maxSteps = Math.ceil(CAP / STEP);
  while (!done && steps < maxSteps) {
    // eslint-disable-next-line no-await-in-loop
    const out = await page.evaluate(({ chunk, step }) => {
      const g = window.__sim;
      const w = g.world;
      const rec = window.__fight;
      // Last frame's health, so a drop can be attributed to the body it came
      // off rather than guessed at.
      // Keyed by the body itself and weak, so a fight that churns thousands
      // of bodies does not carry every corpse to the end of it.
      if (!rec.was) rec.was = new WeakMap();

      for (let i = 0; i < chunk; i++) {
        const boss = w.boss;
        if (!boss && rec.arrived) { rec.ended = rec.t; return { done: true }; }

        // ---- sample, then step ----
        if (boss) {
          const arriving = boss.arriving > 0;
          if (arriving) rec.arrival += step;
          else if (!rec.arrived) rec.arrived = true;

          // captions, at the pace they are actually read
          const line = w.bossLine;
          if (line !== rec.lastLine) {
            if (rec.lastLine) rec.captions.push({ text: rec.lastLine, hold: +rec.lineT.toFixed(2) });
            rec.lastLine = line;
            rec.lineT = 0;
          }
          if (line) rec.lineT += step;

          if (!arriving && boss.dying <= 0) {
            const s = boss.stage || 0;
            rec.stage[s] = (rec.stage[s] || 0) + step;
          }
          if (boss.dying > 0) { rec.dying = true; rec.death += step; }

          // what each class of body is absorbing, and how near it comes
          const s = w.shooter;
          for (const e of w.enemies) {
            if (!e.type) continue;
            const id = e.type.id;
            const d = Math.hypot(e.x - s.x, e.y - s.y);
            const near = rec.near[id];
            if (near === undefined || d < near) rec.near[id] = Math.round(d);
            const was = rec.was.get(e);
            if (was !== undefined && e.hp < was) {
              rec.hp[id] = (rec.hp[id] || 0) + (was - e.hp);
            }
            rec.was.set(e, e.hp);
          }
        }

        rec.remainder = w.remainder | 0;
        g.update(step);
        rec.t += step;
      }
      return { done: false, t: rec.t, stage: w.boss ? w.boss.stage : null,
        core: w.boss && !w.boss.arriving ? +w.boss.coreFrac.toFixed(3) : 1 };
    }, { chunk: CHUNK, step: STEP });
    done = out.done;
    steps += CHUNK;
    if (!done && process.env.FIGHT_TRACE) {
      console.log(`   ${out.t.toFixed(0)}s stage ${out.stage} core ${out.core}`);
    }
  }

  return page.evaluate((capped) => {
    const rec = window.__fight;
    if (rec.lastLine) rec.captions.push({ text: rec.lastLine, hold: +rec.lineT.toFixed(2) });
    if (capped) rec.note.push('DID NOT END inside the cap');
    delete rec.was;
    return rec;
  }, steps >= maxSteps);
}

/**
 * N frames, hashed. Every number that describes the fight goes in: the field
 * counts, the purse, and every body's position and health, sampled every few
 * frames so the hash is cheap without being blind between samples.
 */
async function hashRun(page, frames) {
  const r = await page.evaluate(({ n, step }) => {
    const g = window.__sim;
    const w = g.world;
    let h = 2166136261;
    const mix = (v) => { h ^= Math.round(v * 64) | 0; h = Math.imul(h, 16777619) | 0; };
    const marks = [];
    for (let k = 0; k < n; k++) {
      g.update(step);
      if (k % 300 !== 299) continue;
      const boss = w.boss;
      mix(w.enemies.length); mix(w.projectiles.length); mix(w.debris.length);
      /*
       * The purse in POINTS, which is the unit every hash in CLAUDE.md's
       * history was taken in -- and, more to the point, a magnitude `mix`
       * survives. `mix` is `Math.round(v * 64) | 0`, so a value past
       * 33,554,432 overflows the cast and aliases mod 2^32: at byte scale a
       * 9,000-frame fight banks well past that, so two runs whose purses
       * differ by exactly 67,108,864 B would mix identically and the one
       * channel CLAUDE.md's "run it on any build that touches energy" rule
       * exists for would have quietly lost its resolution.
       */
      mix(w.bytes / 1000); mix(w.shock); mix(w.timeScale); mix(w.remainder);
      if (boss) {
        mix(boss.stage); mix(boss.coreFrac); mix(boss.arriving);
        mix(boss.x); mix(boss.y); mix(boss.parked.length);
        const gg = boss.gauge ? boss.gauge() : null;
        if (gg) for (const sh of gg.shells) mix(sh.frac);
      }
      for (const e of w.enemies) { mix(e.x); mix(e.y); mix(e.hp); }
      if (k % 1500 === 1499) {
        marks.push(`${String(k + 1).padStart(5)}  stage ${boss ? boss.stage : '-'}`
          + `  bodies ${String(w.enemies.length).padStart(3)}  ${h}`);
      }
    }
    return { hash: h, marks, alive: !!w.boss, remainder: w.remainder | 0 };
  }, { n: frames, step: STEP });
  return { hash: r, hashOnly: true };
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  /*
   * A fresh context per run with the service worker blocked. Registrations
   * outlive a page, so the second run in a session was being served by the
   * first run's worker -- and whether it had finished activating was a race.
   */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  /*
   * Take the clock off the wall.
   *
   * main.js is a rAF around game.update(dt), and in a headless browser those
   * frames keep arriving at whatever rate the machine feels like while this
   * script is between calls. That is the whole of why a seeded run still
   * wandered: the seed fixed the dice, but the *number of frames* that had
   * gone by before the fight started -- and the field they had built -- was
   * still whatever the last few hundred milliseconds happened to produce.
   *
   * rAF is stubbed to never call back, so nothing advances the game except
   * the fixed 1/60 steps below. Two trees that behave the same then produce
   * the same report, and any difference at all is a real one.
   */
  await page.addInitScript((seed) => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    /*
     * No audio, and this is not about the noise.
     *
     * audio.js fills a shared white-noise buffer on init -- sampleRate times
     * 1.2, which is fifty-odd thousand Math.random() calls -- and *when* it
     * initialises depends on the headless audio backend and the autoplay
     * policy. Seeding the PRNG is worthless while something can pull fifty
     * thousand draws out of it at an unpredictable moment: two runs with the
     * same seed diverged inside the first twenty seconds of the fight, and
     * this was why. With no AudioContext to build, audio.init() fails the
     * same way every time.
     */
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    if (seed === null) return;
    // xorshift32, installed before any of the game's modules evaluate.
    let x = (Number(seed) + 0x9e3779b9) >>> 0 || 1;
    Math.random = () => {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }, SEED === null ? null : Number(SEED) + i);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__sim);
  // What this probe's figures are read off. `served.mjs` refuses a served
  // tree that lacks any of them: the purse is declared because it HAS been
  // renamed (world.energy -> world.bytes at build 286), which is what made
  // phase 5's build-283 column a table of a tree it never read.
  {
    const { abort } = await requireWorld(page, ['bytes'], 'fight.mjs');
    if (abort) { await browser.close(); process.exit(1); }
  }
  await page.evaluate((step) => {
    const g = window.__sim;
    document.getElementById('startBtn').click();
    // Two seconds of run, counted rather than waited for, so the field the
    // fight starts on is the same field every time.
    for (let k = 0; k < 120; k++) g.update(step);
  }, STEP);
  runs.push(await fight(page));
  await ctx.close();
}

// ---------------------------------------------------------------- report

if (HASH !== null) {
  const r = runs[0].hash;
  console.log(`\nANOMALY ${N} — ${HASH} frames, seed ${SEED === null ? '(none — not reproducible)' : SEED}\n`);
  for (const ln of slotLines(lastSlot)) console.log(ln);
  console.log('');
  for (const m of r.marks) console.log(`  ${m}`);
  console.log(`\n  hash  ${r.hash}`);
  console.log(`  ${r.alive ? 'still standing' : 'over'}, ${r.remainder} remainder\n`);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

/*
 * Which field the numbers below were measured on. `derived` is what
 * `anomalyEra` says the slot is, so a forced `--era` is visible as a
 * disagreement rather than as a silently different row.
 */
function slotLines(sl) {
  if (!sl) return [];
  const forced = sl.era !== sl.derived;
  const out = [`  slot           rung ${sl.rung === null ? '(ungated)' : sl.rung}`
    + `, era ${sl.era}${forced ? ` (FORCED -- derived ${sl.derived})` : ' (derived)'}`];
  out.push(`  field          power ${sl.power}, column ${sl.column}, width ${sl.width}`);
  out.push(`  core           ${sl.coreHp}hp, hard ${sl.hard}`);
  return out;
}

const num = (x) => (Math.round(x * 10) / 10).toFixed(1);
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

console.log(`\nANOMALY ${N} — ${RUNS} run${RUNS > 1 ? 's' : ''}, assists only, nothing bought\n`);
for (const ln of slotLines(lastSlot)) console.log(ln);
console.log('');

const total = runs.map((r) => r.ended || r.t);
console.log(`  fight          ${num(med(total))}s`
  + (RUNS > 1 ? `   (${total.map(num).join(', ')})` : ''));
console.log(`  arrival        ${num(med(runs.map((r) => r.arrival)))}s`);
console.log(`  death          ${num(med(runs.map((r) => r.death)))}s`);

const stages = [...new Set(runs.flatMap((r) => Object.keys(r.stage)))].sort();
for (const s of stages) {
  const xs = runs.map((r) => r.stage[s] || 0);
  const share = med(xs) / med(total) * 100;
  console.log(`  stage ${s}        ${num(med(xs))}s   ${share.toFixed(0)}% of the fight`);
}

// Law 4: nothing goes past the reading speed.
const worst = runs.flatMap((r) => r.captions)
  .filter((c) => c.hold > 0.2)
  .map((c) => ({ ...c, cps: c.text.length / c.hold }))
  .sort((a, b) => b.cps - a.cps)[0];
if (worst) {
  console.log(`\n  fastest caption  ${worst.cps.toFixed(1)} chars/sec `
    + `${worst.cps > 13 ? 'OVER THE 13 CEILING' : 'ok'}  "${worst.text}"`);
}

// Where the output actually went.
const ids = [...new Set(runs.flatMap((r) => Object.keys(r.hp)))];
if (ids.length) {
  const sum = ids.reduce((a, id) => a + med(runs.map((r) => r.hp[id] || 0)), 0);
  console.log('\n  damage absorbed');
  const byDamage = ids
    .map((id) => [id, med(runs.map((r) => r.hp[id] || 0))])
    .sort((a, b) => b[1] - a[1]);
  for (const [id, d] of byDamage) {
    console.log(`    ${id.padEnd(10)} ${String(Math.round(d)).padStart(7)}   ${(d / sum * 100).toFixed(0)}%`);
  }
}

// Law 2: everything mandatory comes inside 390.
const nids = [...new Set(runs.flatMap((r) => Object.keys(r.near)))];
if (nids.length) {
  console.log('\n  closest approach (base aim range 400)');
  for (const id of nids) {
    const d = med(runs.map((r) => r.near[id] ?? 9999));
    console.log(`    ${id.padEnd(10)} ${String(Math.round(d)).padStart(5)}   ${d <= 390 ? 'in range' : 'OUT OF REACH'}`);
  }
}

const rem = runs.map((r) => r.remainder);
console.log(`\n  remainder      ${med(rem)} ${med(rem) === 1 ? '' : ' — expected exactly 1'}`);
const notes = runs.flatMap((r) => r.note);
for (const nt of notes) console.log(`  ! ${nt}`);
if (errors.length) {
  console.log(`\n  ${errors.length} console/page errors`);
  for (const e of errors.slice(0, 5)) console.log(`  ! ${e}`);
}
console.log('');

await browser.close();
process.exit(notes.length || errors.length ? 1 : 0);
