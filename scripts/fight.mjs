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
 * Run: node scripts/fight.mjs [n] [--runs N] [--url ...]
 * `n` is the anomaly number, 1 (ORDINAL) being the only one built.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const N = Number(argv.find((a) => /^\d+$/.test(a)) || 1);
const RUNS = Number(flag('runs', 1));
const BASE = flag('url', 'http://127.0.0.1:8099/index.html');
// A fight that has not ended in this many game-seconds is not a fight, it is
// a wall -- report it as one rather than hanging.
const CAP = Number(flag('cap', 900));
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
    w.energy = 0;

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

  await page.evaluate((n) => {
    const g = window.__sim;
    const w = g.world;
    if (n === 1) w.aperture = 1; else w.apertures[n] = 1;
    g.openBoss(n);
  }, N);

  if (HASH !== null) return hashRun(page, Number(HASH));

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
      mix(w.energy); mix(w.shock); mix(w.timeScale); mix(w.remainder);
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
  for (const m of r.marks) console.log(`  ${m}`);
  console.log(`\n  hash  ${r.hash}`);
  console.log(`  ${r.alive ? 'still standing' : 'over'}, ${r.remainder} remainder\n`);
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}

const num = (x) => (Math.round(x * 10) / 10).toFixed(1);
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

console.log(`\nANOMALY ${N} — ${RUNS} run${RUNS > 1 ? 's' : ''}, assists only, nothing bought\n`);

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
