/*
 * Why one run of the same fight takes a third longer than another.
 *
 * `fight.mjs` says how long a fight was. `dps.mjs` says where the output went
 * within one. Neither can answer the question the Phase C audit ended on:
 * ORDINAL runs from 202 to 287 seconds and GNOMON from 207 to 288 -- a third
 * of their own length -- while FRACTAL, AMPLITUDE, DYNAMO and PARITY all sit
 * inside ten seconds. Three hypotheses were built against that and all three
 * came back negative, because each was a guess at one term of a sum nobody
 * had written down.
 *
 * So write the sum down. The turret fires at a near-constant rate -- 3.2 to
 * 3.3 shots a second in every measurement ever taken here, because the cadence
 * is a timer and not a decision -- which collapses the whole question to:
 *
 *     length  ~=  shots / shotRate  +  held
 *
 * A run is longer because it needed more shots, or because more of it was
 * spent in a beat where nothing could be shot. Nothing else is available. And
 * "needed more shots" decomposes exactly, because every shot ends up in one
 * of four places:
 *
 *   ON THE BOSS      damage that actually came off a boss body's health. The
 *                    only kind that shortens the fight.
 *   ON A MINION      everything the boss threw, plus whatever the field had
 *                    left standing. Work, but not progress.
 *   INTO ARMOUR      the difference between the damage a round asked for and
 *                    the damage the body took. Paid, never landed.
 *   OVERKILL         the part of a killing blow past zero. A body on 5hp
 *                    taking a 40 hit wastes 35 of it.
 *   MISSED           a shot that never reached anything at all -- which is
 *                    mostly the mid-sweep problem `dps.mjs` measures as
 *                    `wide`: with auto fire on, the cadence does not wait for
 *                    the barrel.
 *
 * ...and the work itself is not fixed either, which is the part the audit
 * kept guessing at. A boss that mends, repairs or re-forms ADDS health to the
 * field mid-fight, and how much it adds depends on the state it was in when
 * the beat fired. So RESTORED is measured directly -- every frame in which any
 * body's health goes up, or a dead one comes back -- rather than inferred.
 *
 * The report is per run, and then the difference between the longest run and
 * the shortest, converted into seconds, term by term. That is the whole point:
 * the gap stops being a hypothesis and becomes a line in a table.
 *
 *   node scripts/variance.mjs 1 [--runs 7] [--cap 900] [--url ...]
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const N = Number(args.find((a) => /^\d+$/.test(a)) || 1);
const RUNS = Number(flag('runs', 7));
const CAP = Number(flag('cap', 900));
const URL = flag('url', 'http://127.0.0.1:8099/index.html');

const browser = await chromium.launch();
const runs = [];

for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  // The determinism recipe, same as the other two probes: stub rAF so nothing
  // advances but our own loop, block the worker so a stale cache cannot serve
  // a different build, and stub AudioContext because audio.init draws fifty
  // thousand random numbers at an unpredictable moment.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__sim);

  await page.evaluate(async (n) => {
    const { Enemy } = await import('../src/enemies.js');
    const g = window.__sim;
    const w = g.world;
    const S = 1 / 60;
    document.getElementById('startBtn').click();
    for (let i = 0; i < 120; i++) g.update(S);
    g.debugTeachAll();
    w.autoAim = true;
    w.autoFire = true;
    w.energy = 0;
    w.apertures[n] = 1;
    g.openBoss(n);

    const v = {
      t: 0,
      shots: 0,
      hitShots: 0, // shots that reached something
      onBoss: 0,
      onOther: 0,
      armour: 0,
      over: 0,
      restored: 0,
      spawned: 0,
      held: 0,
      blind: 0,
      byType: {},
      reforms: [], // one entry per frame in which anything came back
      own: new WeakSet(), // the boss's own bodies, refreshed every frame
      hp: new WeakMap(),
      seen: new WeakSet(),
      touched: false, // did the shot in flight reach anything this call
    };

    /*
     * The one place damage is applied. Wrapped rather than inferred from a
     * health scan, because a scan cannot see the two kinds of waste: armour
     * takes its cut before health moves, and overkill happens past zero where
     * health is no longer being written.
     */
    const hurt = Enemy.prototype.applyDamage;
    Enemy.prototype.applyDamage = function wrapped(world, dmg, ...rest) {
      if (this.dead || this.isDrop) return hurt.call(this, world, dmg, ...rest);
      const before = this.hp;
      hurt.call(this, world, dmg, ...rest);
      // `real` is what got past armour and the ward; it may run below zero,
      // and the part below zero is the overkill.
      const real = before - this.hp;
      const landed = before - Math.max(0, this.hp);
      v.touched = true;
      v.armour += Math.max(0, dmg - real);
      v.over += Math.max(0, real - landed);
      const id = (this.type && this.type.id) || '?';
      v.byType[id] = (v.byType[id] || 0) + landed;
      if (v.own.has(this)) v.onBoss += landed;
      else v.onOther += landed;
      return undefined;
    };

    // Every shot, and whether it reached anything. A shot is credited with a
    // hit if any damage was applied between it leaving and the next one.
    const shoot = w.shooter.shoot.bind(w.shooter);
    w.shooter.shoot = (world) => {
      if (v.touched) v.hitShots++;
      v.touched = false;
      v.shots++;
      return shoot(world);
    };
    window.__v = v;
  }, N);

  let done = false;
  let guard = 0;
  while (!done && guard++ < Math.ceil((CAP * 60) / 600) + 2) {
    done = await page.evaluate(async ({ cap }) => {
      const { CFG } = await import('../src/config.js');
      const { angleDelta } = await import('../src/util.js');
      const g = window.__sim;
      const w = g.world;
      const S = 1 / 60;
      const v = window.__v;
      const limit = CFG.shooter.aimClamp + 0.04;

      for (let i = 0; i < 600; i++) {
        if (!w.boss || v.t > cap) return true;
        const b = w.boss;

        /*
         * Whose body is whose, refreshed every frame because a boss's parts
         * list changes under it -- TERMINUS hides a ring, PARITY parks a
         * crescent, ORDINAL's garrison joins the field as panels go.
         */
        v.own = new WeakSet();
        if (b.core) v.own.add(b.core);
        for (const p of b.parts()) v.own.add(p);
        if (b.halves) for (const h of b.halves) v.own.add(h);

        /*
         * What came back this frame. Any body whose health went UP, and any
         * dead body that is alive again -- which covers a mend, a repair
         * pulse, a scripted resurrection and a re-form without needing to
         * know which of them a given boss has.
         */
        let back = 0;
        for (const e of w.enemies) {
          if (!e.type || e.isDrop) continue;
          const had = v.hp.get(e);
          if (!v.seen.has(e)) {
            v.seen.add(e);
            // New on the field. Boss parts present from the start are not a
            // spawn; anything arriving later is work that did not exist.
            if (v.t > 1 && !v.own.has(e)) v.spawned += e.maxHp || 0;
          } else if (had !== undefined && e.hp > had + 0.001) {
            back += e.hp - had;
          }
          v.hp.set(e, e.dead ? 0 : e.hp);
        }
        // ...and the ones that were dead a frame ago and are not now. They are
        // off world.enemies while dead for most bosses, so they are counted
        // through the boss's own parts list instead.
        for (const p of b.parts()) {
          if (p.dead) { v.hp.set(p, 0); continue; }
          const had = v.hp.get(p);
          if (had !== undefined && had <= 0 && p.hp > 0) back += p.hp;
          v.hp.set(p, p.hp);
        }
        if (back > 0.5) {
          v.restored += back;
          v.reforms.push({ at: +v.t.toFixed(1), hp: Math.round(back) });
        }

        // Held: nothing can be shot usefully while the world is dilated for a
        // setpiece or a death. Counted on the raw clock, which is what the
        // player experiences.
        if (w.timeScale < 0.999) v.held += S;

        // ...and blind: no body inside the cone and inside reach, so the
        // turret is firing at nothing whatever it does.
        let legal = 0;
        const s = w.shooter;
        for (const e of w.enemies) {
          if (e.dead || e.staged || e.harmless) continue;
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const d = Math.hypot(dx, dy);
          if (Math.abs(angleDelta(-Math.PI / 2, Math.atan2(dy, dx))) <= limit
            && d - (e.r || 0) <= g.aimRange) legal++;
        }
        if (!legal) v.blind += S;

        g.update(S);
        v.t += S;
      }
      return false;
    }, { cap: CAP });
  }

  const out = await page.evaluate(() => {
    const v = window.__v;
    return {
      secs: v.t,
      shots: v.shots,
      hitShots: v.hitShots,
      onBoss: v.onBoss,
      onOther: v.onOther,
      armour: v.armour,
      over: v.over,
      restored: v.restored,
      spawned: v.spawned,
      held: v.held,
      blind: v.blind,
      byType: v.byType,
      reforms: v.reforms,
    };
  });
  out.errs = errs.slice(0, 2);
  runs.push(out);
  await ctx.close();
}
await browser.close();

// ---- report ---------------------------------------------------------------

const pad = (s, n) => String(s).padStart(n);
const k = (x) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(Math.round(x)));

console.log(`\nANOMALY ${N} — ${RUNS} runs, why they differ\n`);
console.log('  run    secs   shots   sh/s   miss     boss   minion   armour     over'
  + '  restored   held  blind');
for (let i = 0; i < runs.length; i++) {
  const r = runs[i];
  console.log(
    `  ${pad(i + 1, 3)}  ${pad(r.secs.toFixed(0), 6)}${pad(r.shots, 8)}`
    + `${pad((r.shots / r.secs).toFixed(2), 7)}`
    + `${pad(`${Math.round((100 * (r.shots - r.hitShots)) / Math.max(1, r.shots))}%`, 7)}`
    + `${pad(k(r.onBoss), 9)}${pad(k(r.onOther), 9)}${pad(k(r.armour), 9)}${pad(k(r.over), 9)}`
    + `${pad(k(r.restored), 10)}${pad(r.held.toFixed(0), 7)}${pad(r.blind.toFixed(0), 7)}`,
  );
}

/*
 * The same partition, per run, as a share of that run's shots. Read down a
 * column: a boss whose fights differ has one column that moves.
 */
const secs = runs.map((r) => r.secs);
const lo = runs[secs.indexOf(Math.min(...secs))];
const hi = runs[secs.indexOf(Math.max(...secs))];
const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const gap = hi.secs - lo.secs;

console.log(`\n  spread ${Math.round(Math.min(...secs))}-${Math.round(Math.max(...secs))}s`
  + `  (${Math.round((100 * gap) / (mean((r) => r.secs) || 1))}% of the mean)`);

/*
 * The decomposition, and it is exact rather than a model.
 *
 * A shot delivers a fixed round, and that round ends up split between health
 * it took off a body, armour that refused it, and the part of a killing blow
 * past zero -- so the damage a run asked for divided by the shots that reached
 * anything IS the round, measured. Allocating each run's hit-shots across its
 * own four destinations by that ratio therefore partitions the run's shots
 * exactly: the five terms below sum to the run's total, by construction.
 *
 * Which makes the difference between two runs a difference in shots, and a
 * difference in shots a difference in seconds at a cadence that has measured
 * 3.31/s in every run of every fight ever taken here. The only term that is
 * not shots is time the fight spent dilated, when there was nothing to fire
 * at. Nothing is left over except rounding.
 *
 * The first version of this converted damage to seconds using the MEAN
 * round-size and the MEAN cadence across runs, and left twenty seconds of a
 * fifty-three second gap unattributed -- which is what a decomposition looks
 * like when it is a model of the fight rather than the fight's own arithmetic.
 */
const budget = (r) => {
  const raw = r.onBoss + r.onOther + r.armour + r.over;
  const per = raw / Math.max(1, r.hitShots); // the round, measured
  const sh = (d) => d / Math.max(0.0001, per);
  return {
    boss: sh(r.onBoss),
    minion: sh(r.onOther),
    armour: sh(r.armour),
    over: sh(r.over),
    miss: r.shots - r.hitShots,
    rate: r.shots / r.secs,
  };
};

if (RUNS > 1 && gap > 1) {
  const a = budget(lo);
  const b = budget(hi);
  const rate = (a.rate + b.rate) / 2;
  const rows = [
    ['on the boss', (b.boss - a.boss) / rate, `${k(lo.onBoss)} -> ${k(hi.onBoss)} damage`],
    ['on minions', (b.minion - a.minion) / rate, `${k(lo.onOther)} -> ${k(hi.onOther)}`],
    ['into armour', (b.armour - a.armour) / rate, `${k(lo.armour)} -> ${k(hi.armour)}`],
    ['overkill', (b.over - a.over) / rate, `${k(lo.over)} -> ${k(hi.over)}`],
    ['shots that missed', (b.miss - a.miss) / rate, `${a.miss} -> ${b.miss} shots`],
    ['held, unshootable', hi.held - lo.held, `${lo.held.toFixed(0)}s -> ${hi.held.toFixed(0)}s`],
  ];
  console.log(`\n  what separates the longest run from the shortest: ${gap.toFixed(0)}s`);
  for (const [name, s, note] of rows) {
    if (Math.abs(s) < 0.5) continue;
    console.log(`    ${(s >= 0 ? '+' : '-')}${pad(Math.abs(s).toFixed(1), 5)}s  `
      + `${name.padEnd(20)}${note}`);
  }
  const named = rows.reduce((a2, x) => a2 + x[1], 0);
  console.log(`    ${(gap - named >= 0 ? '+' : '-')}${pad(Math.abs(gap - named).toFixed(1), 5)}s`
    + '  rounding');

  /*
   * ...and where the extra work came from, which is the term the audit's three
   * failed hypotheses were all guessing at. A boss that mends or re-forms adds
   * health to the field mid-fight; how much depends on the state it was in.
   */
  console.log('\n  the boss put back');
  for (const [tag, r] of [['shortest', lo], ['longest', hi]]) {
    console.log(`    ${tag.padEnd(9)} ${pad(k(r.restored), 6)} over ${r.reforms.length} frames`
      + `${r.spawned ? `, and ${k(r.spawned)} arrived as minions` : ''}`);
  }
}

console.log('\n  the shot budget, as a share of each run');
console.log('  run     boss  minion  armour    over    miss');
for (let i = 0; i < runs.length; i++) {
  const bud = budget(runs[i]);
  const tot = runs[i].shots || 1;
  const pc = (x) => pad(`${Math.round((100 * x) / tot)}%`, 8);
  console.log(`  ${pad(i + 1, 3)}  ${pc(bud.boss)}${pc(bud.minion)}${pc(bud.armour)}`
    + `${pc(bud.over)}${pc(bud.miss)}`);
}

const ids = [...new Set(runs.flatMap((r) => Object.keys(r.byType)))];
if (ids.length) {
  console.log('\n  landed by type (shortest / longest run)');
  for (const id of ids.sort((a, b) => (hi.byType[b] || 0) - (hi.byType[a] || 0))) {
    console.log(`    ${id.padEnd(10)} ${pad(k(lo.byType[id] || 0), 7)} ${pad(k(hi.byType[id] || 0), 8)}`);
  }
}

console.log('\n  miss      shots that reached nothing at all -- mostly mid-sweep');
console.log('  armour    asked-for damage a body never took');
console.log('  overkill  the part of a killing blow past zero');
console.log('  restored  health the boss put back: mends, repairs, re-forms');
console.log('  held      seconds under dilation, when nothing can be shot');

const errs = runs.flatMap((r) => r.errs);
if (errs.length) console.log('\n  ERRORS', errs.slice(0, 3));
