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
 * THE MONEY is not measured, it is asserted. `--spend` follows plan C's
 * earned-by-tier targets, interpolated between the anchors the plan names and
 * capped at what the whole tree costs, because nobody can spend more than
 * that. So this prices the loadout at what the economy is *meant* to hand
 * over, not at what it does -- which is the point: B and C are being tuned
 * against each other and one of them has to be the fixed end.
 *
 * **Those targets are known to be about four times too rich.** A stock turret
 * on the assists banks 4,417 in fifteen minutes and settles at tier 7-8; the
 * curve assumes 15,000 by tier 8. So every loadout in the table below is
 * richer than a real run affords, and every TTK is correspondingly optimistic
 * -- the wall is nearer than this says, not further. The `pay/s` column does
 * not rescue it: that measures one heavy wave in isolation with the floor
 * counted as collected, which is roughly eight times a run's real income, and
 * using it to bless the curve is exactly the mistake build 180 made and had to
 * unpick. Fix the curve by driving a measured one in through `--spend`.
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
 *                          [--range 300] [--spend N] [--url ...]
 */

import { createRequire } from 'node:module';
import { WAVES, ENEMY_TYPES, CFG } from '../src/config.js';
import { NODES, priceOf } from '../src/tree.js';

const require = createRequire(import.meta.url);
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
/** Seconds the gun fires at the wall, per tier, for the rate and damage columns. */
const BENCH = Number(flag('bench', 6));
/** ...and the longest a whole wave is given to clear before it is called uncleared. */
const WAVECAP = Number(flag('wavecap', 120));
const FIXED = flag('spend', null) === null ? null : Number(flag('spend', 0));
const URL = flag('url', 'http://127.0.0.1:8099/index.html');

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

/** docs/pacing.md's earned-by-tier targets, as anchors to interpolate between. */
const EARNED = [[0, 0], [2, 1000], [5, 5000], [8, 15000], [12, 40000]];
/** Past the last anchor, the 8->12 growth carries on: (40/15)^(1/4) a tier. */
const TAIL = (40000 / 15000) ** 0.25;

function spendAt(tier) {
  if (FIXED !== null) return FIXED;
  const last = EARNED[EARNED.length - 1];
  if (tier >= last[0]) {
    return Math.min(TREE_TOTAL, Math.round(last[1] * TAIL ** (tier - last[0])));
  }
  for (let i = 1; i < EARNED.length; i++) {
    const [t0, e0] = EARNED[i - 1];
    const [t1, e1] = EARNED[i];
    if (tier <= t1) return Math.round(e0 + ((e1 - e0) * (tier - t0)) / (t1 - t0));
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
for (const [b, v] of HEAVIEST) HEAVIEST.set(b, v.of);

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
  'hollowpoint', 'rate', 'hotload',
  'hollowpoint', 'rate', 'hotload',
  'hollowpoint', 'hotload',
  // One DOUBLE TAP, because there is only one to buy: TRIPLE TAP was its
  // second level and went in build 189. The line asked for it twice and the
  // second ask was skipped as `maxed` rather than breaking, but a calibration
  // list should say what it means to buy.
  'doubletap', 'overstuffed',
  'overstuffed', 'overstuffed', 'overstuffed',
  'overwatch', 'overwatch', 'overwatch',
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
  await page.evaluate(() => { document.getElementById('startBtn').click(); });

  for (const tier of tiers) {
    const out = await page.evaluate(async ({
      tier, spend, line, cap, range, benchFor, waveCap, ids, waveOf,
    }) => {
      const { CFG } = await import('../src/config.js');
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
      w.director.setTier(tier);
      // The director is silenced rather than paused: this measures one body,
      // and a wave landing on top of it would be measuring a fight.
      w.director.update = () => {};

      w.energy = spend;
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
      for (const n of NODES) {
        if (!n.id || n.repeat || n.dormant || n.currency) continue;
        while (g.buy(n.id) === 'ok') bought.push(n.id);
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
      const waveClear = (of, cap2) => {
        clear();
        w.autoAim = false;
        w.autoFire = false;
        const swell = w.director.scaleAt(w.director.tier).pop * CFG.waves.population;
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
        const purse0 = w.energy;

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
        let pay = w.energy - purse0;
        for (const e of w.drops) if (!e.dead && e.energy) pay += e.energy * (e.bounty || 1);
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
          g.update(S);
          t += S;
          note();
          if (alive() === 0) break;
        }
        w.projectiles.push = realPush;
        marks.push({ id, ttk: t, rounds, dmg, hp: hp0, at, killed: alive() === 0 });
      }

      const wave = waveClear(waveOf, waveCap);
      return { tier, spend, bought, gun, marks, wave };
    }, {
      tier, spend: spendAt(tier), line: LINE, cap: CAP, range: RANGE,
      benchFor: BENCH, waveCap: WAVECAP, ids: BANDS.get(bandOf(tier)) || [],
      waveOf: HEAVIEST.get(bandOf(tier)) || [],
    });

    results.get(tier).push(out);
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
const num = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '-');

console.log(`\nTHE LADDER — tiers ${FROM}-${TO}, ${RUNS} run${RUNS > 1 ? 's' : ''} each,`
  + ' BOLT and the damage line');
console.log(`  spend: ${FIXED !== null ? `${num(FIXED)} flat` : "docs/pacing.md's earned-by-tier targets"}`
  + `, capped at the whole tree (${num(TREE_TOTAL)})`);
console.log(`  slopes: pop +${CFG.waves.tier.pop * 100}%/tier (cap x${CFG.waves.tier.popCap})`
  + ` · hp x${CFG.waves.tier.hpStep}^(n-1) · bounty +${CFG.waves.tier.bounty * 100}%/tier`);
const atRange = [...results.values()].flat()
  .flatMap((r) => r.marks.map((m) => m.at)).filter(Number.isFinite);
console.log(`  one body, ${RANGE} units straight up (measured ${med(atRange) || RANGE}),`
  + ` cap ${CAP}s\n`);

console.log('  tier band    spend  buys  rnd/s     dps  worst   wave  clear   pay  pay/s  |  time to kill');
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

  console.log(`  ${pad(tier, 4)}${pad(band, 5)}${pad(num(spend), 9)}${pad(Math.round(buys), 6)}`
    + `${pad(rps.toFixed(1), 7)}${pad(dps.toFixed(0), 8)}`
    + `${pad(Number.isFinite(top) ? `${top.toFixed(1)}s` : `>${CAP}s`, 7)}`
    + `${pad(Math.round(asked), 7)}`
    + `${pad(stuck ? `>${WAVECAP}s` : `${clear.toFixed(0)}s${spread > 2 ? '~' : ''}`, 7)}`
    + `${pad(Math.round(perWave), 6)}${pad(perSec.toFixed(1), 7)}  |  ${cells.join('   ')}`);
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
  console.log(`    tier ${String(tier).padEnd(3)} ${num(r.spend).padStart(7)}  ${list}`);
}

console.log(`\n  rnd/s    projectiles a second, counted at the muzzle, against a wall for ${BENCH}s`);
console.log('  dps      ...and what landed on it, a second — armour already paid for');
console.log('  worst    the slowest member of the band: what the tier is bounded by');
console.log('  wave     bodies in the band\'s heaviest authored wave, at this tier\'s size');
console.log('  pay      energy the wave offers, banked plus still on the floor');
console.log('  pay/s    ...over the seconds it took.');
console.log('           NOT a run\'s income. This is the band\'s HEAVIEST wave, alone, with');
console.log('           no rest between waves and the floor counted as collected — about');
console.log('           eight times what a real run banks. A stock turret on the assists');
console.log('           banks 4,417 in fifteen minutes. Use it to compare tiers with each');
console.log('           other, never to price anything.');
console.log(`  clear    ...and how long the whole of it took to put down (cap ${WAVECAP}s).`);
console.log('           ~ means the runs disagreed by more than double: read the tier,');
console.log('           not the second. Raise --runs before tuning against this column.');
if (loose.length) {
  console.log(`\n  NOT COMPARABLE: still marching in when the clock started at tier ${loose.join(', ')}`);
}
console.log('  buys     tree levels owned: the damage line first, then whatever');
console.log('           the budget could still reach in tree order');

if (errs.length) console.log('\n  ERRORS', errs.slice(0, 3));
