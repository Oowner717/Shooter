/*
 * clears.mjs -- the clear table for one band, per WAVE and per RUNG.
 *
 * `tiers.mjs`'s clear column takes a band's HEAVIEST authored wave -- one wave
 * per tier, picked by the health it puts on the field, on the stated ground
 * that "a band's worst wave is the one that decides whether the band is
 * survivable". That was the right question while threat and length were the
 * same thing, and they are not any more: `threatOf` is health over
 * `threatPerHp` and nothing else, so it cannot see that a KITE stands off at
 * the edge of the assist's reach and will not come and be shot, that a
 * REMNANT holds its wave open for six seconds after it dies, or that a VEIL
 * stops the gun choosing what is behind it. REMNANT's wave and KITE's were
 * each recorded as the longest in band 5 without being the heaviest -- and
 * both of those figures were modelled from the body's transit rather than
 * timed, and build 382 measured them at a sixth and a half of the claim. So
 * the question "does this band clear inside the cap" wants every wave of it,
 * at every rung the band is drawn at, and that is what this prints.
 *
 * WHAT IS COPIED AND WHY. The wave is sized off `Director.budgetAt` and
 * `threatOfWave` -- imported, not restated, because a bench that keeps its
 * own copy of that formula reports the game it used to be (build 301 moved
 * `tiers.mjs` off `scaleAt(tier).pop * population` for exactly that reason).
 * The turret is funded by the allocator the other probes use, between
 * sentinels `check-build` compares byte for byte. And the wave MARCHES IN
 * from the top with the gun cold, because a wave put down loose on the field
 * can land level with the turret, outside `autoTarget`'s 78-degree cone for
 * ever -- a band-2 wave once sat out a two-minute cap with a LURCHER parked
 * beside the barrel.
 *
 * WHAT IT IS NOT. It spawns through `debugSpawnGroup` rather than through
 * `Director.emit`, so it delivers every body the budget asks for. That is
 * deliberate for a CAP question -- it is the worst case the wave can produce
 * -- and it means this cannot see the class of fault build 333 found, where
 * `emit` took a job off the list and released one body of ninety-six. Ask
 * that with a census through `emit`, not with this.
 *
 * TWO COLUMNS, AND THEY ANSWER DIFFERENT QUESTIONS. Fully bought (the
 * default) is the best gun the tree sells, so a wave that misses the cap
 * there misses it for everyone; it is also the column the historical figures
 * were taken in. `--funded` reads the landed income curve and asks what a run
 * standing on that rung actually holds, which is the question a player faces.
 */
import { createRequire } from 'node:module';
import { WAVES, CFG, BUILD, kB } from '../src/config.js';
import { NODES, priceOf } from '../src/tree.js';
const require = createRequire(import.meta.url);
import { checkServed, requireWorld, requireSameTree } from './served.mjs';
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const BAND = Number(flag('band', 5));
const PER = CFG.waves.tier.perBand;
/*
 * A band's own rungs by default. Note `bandsFor` returns `[hi - 1, hi]`, so
 * the top band is also drawn at every rung above its own -- pass `--rungs`
 * for those.
 */
const RUNGS = (flag('rungs', null)
  || Array.from({ length: PER }, (_, i) => (BAND - 1) * PER + 1 + i).join(','))
  .split(',').map(Number);
const RUNS = Number(flag('runs', 3));
/** The longest a wave is given before it is called uncleared. `tiers.mjs`'s own. */
const WAVECAP = Number(flag('wavecap', 120));
const ONLY = flag('waves', null) === null ? null : flag('waves', '').split(',').map(Number);
/*
 * Seconds the wave is given to finish MARCHING IN before the clock starts.
 * Measured rather than guessed, and it has to be measured at the DEEPEST rung:
 * a formation of fifty-odd bodies is queued in rows up the mouth and the last
 * row has the whole stack's height to travel on top of the throat, so the
 * march grows with the budget. A bound that is reached is a cell that timed
 * part of the walk in, which is not a clear time -- so the probe says so per
 * cell rather than averaging it in.
 */
const MARCH = Number(flag('march', 90));
const URL = flag('url', 'http://127.0.0.1:8099/index.html');

// Which tree is this reading? `scripts/served.mjs` carries the whole finding;
// the short version is that this container's http-server serves its own CWD
// and ignores a trailing path, so a `--url` differential can silently read
// the live tree twice. Called before the browser launches, so `abort` is a
// plain exit.
const { abort: wrongTree, served } = await checkServed(URL, flag('expect', null), 'clears.mjs');
if (wrongTree) process.exit(1);
// ...and this probe imports its constants from ../src/, so it may only be
// aimed at a tree that IS this checkout -- otherwise the wave roster and the
// prices are mine and only the game is theirs.
{
  const { abort } = requireSameTree(served, BUILD, 'clears.mjs');
  if (abort) process.exit(1);
}

/*
 * Stage 1: the damage line, in the order a player spends it -- VERBATIM from
 * `tiers.mjs`, because the leftover the allocator below shares is left over
 * FROM this, so two probes agreeing on the allocator and disagreeing on the
 * line still fund two turrets. `check-build` compares the three copies as a
 * list of ids. It stops at the first entry it cannot afford and deliberately
 * does NOT skip down the list: here the order IS the priority, which is the
 * opposite of the rule for the leftover.
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

/*
 * Everything in the tree, every level of it. Past this there is nothing left
 * to buy, so the default spend is the best gun the tree sells.
 */
let TREE = 0;
for (const n of NODES) {
  if (!n.id || n.repeat || n.dormant || n.currency) continue;
  for (let h = 0; h < n.levels; h++) TREE += priceOf(n, h);
}
const SPEND = flag('spend', null) === null ? Math.ceil(TREE * 1.5) : kB(Number(flag('spend', 0)));

/*
 * ---- the other column: what a run standing here actually holds ----
 *
 * `--funded` reads the landed income curve out of `tiers.mjs`'s own source
 * rather than keeping a ninth copy of eight numbers. A table restated in a
 * second file is this repo's most expensive recurring shape, and the curve is
 * re-measured every few builds -- a copy here would describe a game that no
 * longer runs while still exiting 0. The interpolation is `spendAt`'s,
 * clamped at the tree's own cost for the same reason that one is.
 */
const FUNDED = args.includes('--funded');
const CURVE = (() => {
  // `require.resolve` rather than `new URL`: the `--url` flag above is named
  // URL to match the sibling probes, which shadows the global constructor.
  const src = require('node:fs').readFileSync(require.resolve('./tiers.mjs'), 'utf8');
  const m = src.match(/const EARNED = (\[\[[^;]*\]\]);/);
  if (!m) throw new Error('clears.mjs: could not read EARNED out of tiers.mjs -- the detection has drifted');
  const rows = JSON.parse(m[1]);
  if (rows.length < 2) throw new Error(`clears.mjs: EARNED parsed as ${rows.length} anchor(s)`);
  return rows;
})();
const spendAt = (tier) => {
  const last = CURVE[CURVE.length - 1];
  if (tier >= last[0]) {
    const [r0, e0] = CURVE[CURVE.length - 2];
    const tail = e0 > 0 ? (last[1] / e0) ** (1 / (last[0] - r0)) : 1;
    return Math.min(TREE, Math.round(last[1] * tail ** (tier - last[0])));
  }
  for (let i = 1; i < CURVE.length; i++) {
    const [t0, e0] = CURVE[i - 1];
    const [t1, e1] = CURVE[i];
    if (tier <= t1) {
      return Math.min(TREE, Math.round(e0 + ((e1 - e0) * (tier - t0)) / (t1 - t0)));
    }
  }
  return 0;
};
const spendFor = (tier) => (FUNDED ? spendAt(tier) : SPEND);

// The band's own waves, by index in the authored table. Teach waves are out:
// they are authored beats, scaled by nothing, and the arc fights them.
const rows = [];
WAVES.forEach((w, i) => {
  if ((w.band || 1) !== BAND || w.teach) return;
  if (ONLY && !ONLY.includes(i)) return;
  rows.push({ i, of: w.of, label: w.of.map(([id, n]) => `${id}x${n}`).join('+') });
});
if (!rows.length) {
  console.error(`clears.mjs: band ${BAND} has no ordinary waves${ONLY ? ' matching --waves' : ''}.`);
  process.exit(1);
}

console.log(`\n  BAND ${BAND} CLEAR TABLE -- build ${BUILD}, ${rows.length} wave(s)`
  + ` x ${RUNGS.length} rung(s) x ${RUNS} run(s), cap ${WAVECAP}s\n  `
  + (FUNDED
    ? `FUNDED from the landed curve (${CURVE.length} anchors): `
      + RUNGS.map((r) => `r${r} ${(spendAt(r) / 1e6).toFixed(1)}MB`).join(' ')
    : `spend ${(SPEND / 1e6).toFixed(1)} MB -- FULLY BOUGHT (the tree is ${(TREE / 1e6).toFixed(1)} MB)`)
  + `\n`);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__sim, null, { timeout: 30000 });
{
  // Can this probe even READ that tree? `world.energy` became `world.bytes`
  // at build 286, and a write to the old name lands on a property `buy()`
  // never consults -- silently, on the side aimed there deliberately.
  const { abort } = await requireWorld(page, ['bytes'], 'clears.mjs');
  if (abort) { await browser.close(); process.exit(1); }
}
await page.evaluate(() => { document.getElementById('startBtn').click(); });

/*
 * One cell: one wave, one rung, one run.
 *
 * The evaluate's body is indented to SIX spaces rather than to its own
 * nesting, because `check-build` compares the text between the allocator's
 * sentinels byte for byte across every probe that funds a turret -- and
 * whitespace is part of that text.
 */
const cell = (tier, of, spend, waveCap, band) => page.evaluate(async ({
  tier, of, spend, waveCap, band, line, march,
}) => {
      const { CFG } = await import('../src/config.js');
      // Imported, not restated: `budgetAt` and `threatOfWave` are what `load`
      // itself uses, so the bench sizes a wave the way the game does.
      const { Director, threatOfWave } = await import('../src/enemies.js');
      const { NODES, priceOf, levelsOf } = await import('../src/tree.js');
      const g = window.__sim;
      const S = 1 / 60;

      g.restart();
      const w = g.world;
      // Every cell is measured in the same page, so a restart that left
      // purchases behind would fund the next one twice.
      if (w.ledger.length) throw new Error(`restart left ${w.ledger.length} purchases behind`);
      for (let i = 0; i < 90; i++) g.update(S);
      g.debugTeachAll();

      /*
       * The era is DERIVED from `eraGate` and the switch is FORCED. `setEra`
       * refuses a switch to the era it is already in and `reset()` writes
       * era 1, so after an era-2 cell the next `restart()` leaves the flag at
       * 1 and `setEra(1)` is a no-op that runs neither `takeField` nor the
       * sky. Writing the opposite era first makes it real. `newForm` moves
       * with it because the era and that flag are one state.
       */
      const era = tier > CFG.waves.tier.eraGate ? 2 : 1;
      w.era = era === 2 ? 1 : 2;
      w.newForm = era === 2 ? 'done' : 'armed';
      g.setEra(era);
      w.director.setTier(tier);
      // Silenced rather than paused: this measures one authored wave, and a
      // release landing in the middle of it is a body the clock did not ask
      // for. Every cell wants it silenced and every cell re-applies it.
      w.director.update = () => {};
      // A loaded wave's rules outlive the wave (build 327), and SWARM halves
      // health while doubling the count -- so a stale set is a different
      // wave wearing this one's name.
      w.director.traits = [];
      w.bytes = spend;

      const bought = [];
      /*
       * Stage 1, and only "cannot afford" stops it. "maxed" means the line
       * asks for a level the tree no longer sells and is skipped -- breaking
       * on maxed abandons the damage line at its fourth entry and measures
       * tree order instead, which once looked like a nerf moving the taps six
       * tiers later and had moved nothing.
       */
      for (const id of line) {
        const got = g.buy(id);
        if (got === 'poor') break;
        if (got === 'ok') bought.push(id);
      }
      /* ---- cheapest-first: ONE allocator, byte-identical in both probes ---- */
      for (;;) {
        const have = (id) => w.ledger.filter((x) => x === id).length;
        const cands = [];
        for (const n of NODES) {
          if (!n.id || n.repeat || n.dormant || n.currency) continue;
          const h = have(n.id);
          if (h >= levelsOf(n)) continue;
          cands.push({ id: n.id, p: priceOf(n, h) });
        }
        cands.sort((a, b) => a.p - b.p);
        let got = false;
        for (const c of cands) {
          if (c.p > w.bytes) break;
          if (g.buy(c.id) === 'ok') { bought.push(c.id); got = true; break; }
        }
        if (!got) break;
      }
      /* ---- end cheapest-first ---- */
      if (w.round !== 'standard') w.round = 'standard';

      // Not `restart()`: that is not a reset of everything a cell can leave
      // behind, and a leftover mine or projectile is inside the measurement.
      w.enemies.length = 0; w.ghosts.length = 0; w.respawns.length = 0;
      w.drops.length = 0; w.debris.length = 0; w.projectiles.length = 0;
      w.effects.length = 0; w.mines.length = 0; w.pendingBlasts.length = 0;
      w.attackers.clear(); w.heldFor = 0;

      // Nothing is fired while the wave materialises and marches. Both
      // assists off is the only way to hold fire: with auto aim on,
      // `updateFiring` shoots at anything it has a target for whether auto
      // fire is set or not.
      w.autoAim = false;
      w.autoFire = false;
      const T = threatOfWave({ of });
      const swell = T > 0 ? Director.budgetAt(w.director.tier, band) / T : 1;
      let asked = 0;
      for (const [id, base] of of) {
        const n = Math.max(1, Math.round(base * swell));
        asked += n;
        g.debugSpawnGroup(id, n, {});
      }
      let marchFrames = 0;
      for (let i = 0; i < 60 * march && w.enemies.some((e) => e.staged || e.spawnIn > 0); i++) {
        g.update(S); marchFrames++;
      }
      let hp = 0;
      for (const e of w.enemies) if (!e.harmless) hp += e.maxHp || 0;
      const purse0 = w.bytes;

      w.autoAim = true;
      w.autoFire = true;
      g.fireTimer = 0;
      w.shooter.cooldown = 0;
      // Harmless bodies are out of the count: a wave is cleared when nothing
      // hostile is left, and mortar has a way off the field of its own.
      const live = () => { let n = 0; for (const e of w.enemies) if (!e.dead && !e.harmless) n++; return n; };
      const born = live();
      const marching = w.enemies.some((e) => e.staged || e.spawnIn > 0);
      let t = 0;
      while (t < waveCap && live() > 0) { g.update(S); t += S; }
      let pay = w.bytes - purse0;
      for (const e of w.drops) if (!e.dead && e.bytes) pay += e.bytes * (e.bounty || 1);
      return {
        asked, born, hp, threat: T, swell, secs: t, cleared: live() === 0, left: live(),
        // If anything is still marching when the clock starts, part of what
        // this timed was the walk in and the number is not comparable.
        // Captured BEFORE the clock started, not after. Read at the end it is
        // always false, because a straggler comes loose during the very window
        // it is contaminating -- the end-of-window trap, and it hid a march
        // bound that every deep-rung cell was reaching.
        marching, marchSec: marchFrames / 60,
        buys: bought.length, dmg: w.up.damage, era: w.era, pay,
      };
}, {
  tier, of, spend, waveCap, band, line: LINE, march: MARCH,
});

const fmt = (n, width) => String(n).padStart(width);
console.log('  wave                               ' + RUNGS.map((r) => fmt(`r${r}`, 8)).join('') + '   born');
const all = [];
for (const row of rows) {
  const cells = [];
  let born = 0;
  for (const tier of RUNGS) {
    const got = [];
    for (let k = 0; k < RUNS; k++) got.push(await cell(tier, row.of, spendFor(tier), WAVECAP, BAND));
    born = got[0].born;
    const secs = got.map((x) => (x.cleared ? x.secs : Infinity)).sort((a, b) => a - b);
    const med = secs[Math.floor(secs.length / 2)];
    const stuck = got.some((x) => !x.cleared);
    /*
     * `tiers.mjs`'s own convention: runs that disagree by more than double are
     * marked, because the same wave swings on where its bodies happen to
     * arrive. Read the rung, not the second.
     */
    const wide = secs[secs.length - 1] > secs[0] * 2;
    cells.push(stuck ? fmt('>cap', 8) : fmt(`${med.toFixed(0)}s${wide ? '~' : ''}`, 8));
    all.push({
      wave: row.label, i: row.i, tier, stuck, secs: med,
      lo: secs[0], hi: secs[secs.length - 1], got,
    });
  }
  console.log(`  [${fmt(row.i, 2)}] ${row.label.padEnd(30).slice(0, 30)}` + cells.join('') + fmt(born, 7));
}

const marched = all.filter((x) => x.got.some((g0) => g0.marching));
if (marched.length) {
  const worstMarch = Math.max(...all.flatMap((x) => x.got.map((g0) => g0.marchSec)));
  console.log(`\n  NOT COMPARABLE: ${marched.length} of ${all.length} cell(s) still had a body`
    + ` MARCHING when the clock started, so part of what they timed was the walk in.`
    + ` The worst march reached ${worstMarch.toFixed(1)}s against a bound of ${MARCH}s --`
    + ' raise `--march` past it and re-take those rungs.');
  for (const m of marched.slice(0, 8)) console.log(`    r${m.tier} [${m.i}] ${m.wave}`);
} else {
  const worstMarch = Math.max(...all.flatMap((x) => x.got.map((g0) => g0.marchSec)));
  console.log(`\n  Every wave finished marching before its clock started`
    + ` (worst march ${worstMarch.toFixed(1)}s of a ${MARCH}s bound), so every second below`
    + ' is killing rather than walking.');
}

console.log('\n  --- cells at or over 80% of the cap ---');
const bad = all.filter((x) => x.stuck || x.secs > WAVECAP * 0.8);
if (!bad.length) {
  const top = all.slice().sort((a, b) => b.secs - a.secs)[0];
  console.log(`  none. The worst cell of ${all.length} is r${top.tier} [${top.i}] ${top.wave}`
    + ` at ${top.secs.toFixed(0)}s, ${((top.secs / WAVECAP) * 100).toFixed(0)}% of the cap.`);
}
for (const b of bad) {
  const g0 = b.got[0];
  console.log(`  r${b.tier} [${b.i}] ${b.wave}: ${b.stuck ? `>${WAVECAP}s, ${g0.left} left` : `${b.secs.toFixed(0)}s`}`
    + ` -- asked ${g0.asked}, born ${g0.born}, hp ${(g0.hp / 1000).toFixed(1)}k,`
    + ` swell x${g0.swell.toFixed(2)}, march ${g0.marchSec.toFixed(1)}s, era ${g0.era},`
    + ` buys ${g0.buys}, dmg x${g0.dmg.toFixed(2)},`
    + ` runs [${b.got.map((x) => (x.cleared ? x.secs.toFixed(0) : '>cap')).join(' ')}]`);
}

console.log('\n  wave     the authored entry, and the index it sits at in WAVES.');
console.log('  rNN      seconds to clear it at that rung, median of the runs. `~` marks a');
console.log('           cell whose runs disagreed by more than double -- read the rung, not');
console.log(`           the second. \`>cap\` is ${WAVECAP}s reached with something still alive.`);
console.log('  born     hostiles the budget actually put on the field, at the first rung.');
await browser.close();
