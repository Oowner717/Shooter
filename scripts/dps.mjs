/*
 * Where the turret's output actually goes, per stage.
 *
 * `fight.mjs` answers "how long, and what absorbed the damage". That was
 * enough for six bosses and then it was not: build 134 tried to fix DYNAMO's
 * blink gap, the fight got thirty percent longer, and three isolation runs
 * could not attribute it. The damage table said the same total damage landed
 * over a longer fight, which is a statement about the symptom.
 *
 * The missing half is what happens between the turret deciding to shoot and a
 * body losing health. Three things live in that gap and none of them is
 * visible from a damage table:
 *
 *   THE CONE. `Game.autoTarget` only considers bodies within
 *   `CFG.shooter.aimClamp` -- 1.36 radians, so 78 degrees either side of
 *   straight up. Anything further round than that is not a target however
 *   near it is. For a boss arranged in a ring about the turret, well over
 *   half of it is unshootable at any instant.
 *
 *   THE SLEW. Auto aim traverses at `autoTurnRate` 4.2 rad/s, not instantly.
 *   A ninety-degree switch takes the better part of a second.
 *
 *   THE MID-SWEEP SHOT. With auto fire on -- which is how every harness runs
 *   and how most players play -- the cadence does NOT wait for the barrel:
 *   `updateFiring` only holds fire for `aimError` when auto fire is OFF. So
 *   every shot taken while the barrel is still coming round is fired at
 *   where the last target was.
 *
 * Which makes target THRASH the thing to measure. A change that makes two
 * bodies take turns being the nearest costs the fight a slew and a handful of
 * wasted shots every time they swap, and nothing else in the toolchain can
 * see it.
 *
 *   node scripts/dps.mjs 5 [--runs N] [--cap 900] [--url ...]
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
const RUNS = Number(flag('runs', 1));
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
  /*
   * The determinism recipe, three findings deep and all of it harness rather
   * than game: stub rAF so nothing advances but our own loop, block the
   * service worker so a stale cache cannot serve a different build, and stub
   * AudioContext because audio.init fills a noise buffer with fifty thousand
   * Math.random draws at an unpredictable moment.
   */
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__sim);

  await page.evaluate(async (n) => {
    const { CFG } = await import('../src/config.js');
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

    const rec = {
      cone: CFG.shooter.aimClamp,
      slew: CFG.shooter.autoTurnRate,
      hold: 0.14, // the aimError above which a shot is fired mid-sweep
      stage: {},
      was: new WeakMap(),
      lastTarget: null,
      t: 0,
    };
    const bucket = () => ({
      secs: 0,
      shots: 0,
      wide: 0, // shots taken while the barrel was still coming round
      dmg: 0,
      byType: {},
      switches: 0,
      blind: 0, // frames with no legal target at all
      candSum: 0,
      inCone: 0, // frames the boss's own nearest body was inside the cone
      bossFrames: 0,
    });
    rec.at = () => {
      const k = w.boss ? (w.boss.arriving > 0 ? 0 : w.boss.stage) : -1;
      if (!rec.stage[k]) rec.stage[k] = bucket();
      return rec.stage[k];
    };

    // Every shot, with the barrel's error at the moment it was taken.
    const shoot = w.shooter.shoot.bind(w.shooter);
    w.shooter.shoot = (world) => {
      const b = rec.at();
      b.shots++;
      if (w.shooter.aimError > rec.hold) b.wide++;
      return shoot(world);
    };
    window.__d = rec;
  }, N);

  let done = false;
  let guard = 0;
  while (!done && guard++ < Math.ceil((CAP * 60) / 900) + 2) {
    done = await page.evaluate(async ({ cap }) => {
      const { CFG } = await import('../src/config.js');
      const { angleDelta } = await import('../src/util.js');
      const g = window.__sim;
      const w = g.world;
      const S = 1 / 60;
      const rec = window.__d;
      const limit = CFG.shooter.aimClamp + 0.04;

      for (let i = 0; i < 900; i++) {
        if (!w.boss || rec.t > cap) return true;
        const b = rec.at();
        const s = w.shooter;

        /*
         * What the assist could legally pick this frame, by the same two
         * tests `autoTarget` applies: inside the cone, and inside reach
         * measured to the body's edge.
         */
        let cands = 0;
        let near = Infinity;
        let nearIn = false;
        for (const e of w.enemies) {
          if (e.dead || e.staged || e.harmless) continue;
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const d = Math.hypot(dx, dy);
          const inCone = Math.abs(angleDelta(-Math.PI / 2, Math.atan2(dy, dx))) <= limit;
          if (d < near) { near = d; nearIn = inCone; }
          if (inCone && d - (e.r || 0) <= g.aimRange) cands++;
        }
        b.candSum += cands;
        if (!cands) b.blind++;
        // ...and whether the nearest thing on the field was one of them,
        // which is the difference between "the fight is far away" and "the
        // fight is beside you and the barrel does not turn that far".
        if (near < Infinity) { b.bossFrames++; if (nearIn) b.inCone++; }

        g.update(S);
        rec.t += S;
        b.secs += S;

        if (!w.boss) return true;
        // Target thrash: how often the assist changed its mind. Every switch
        // buys a slew, and every shot during the slew is fired at where the
        // last target was.
        const lock = g.autoLock || null;
        if (lock !== rec.lastTarget) { if (rec.lastTarget && lock) b.switches++; rec.lastTarget = lock; }

        for (const e of w.enemies) {
          if (!e.type) continue;
          const had = rec.was.get(e);
          if (had !== undefined && e.hp < had) {
            const lost = had - e.hp;
            b.dmg += lost;
            b.byType[e.type.id] = (b.byType[e.type.id] || 0) + lost;
          }
          rec.was.set(e, e.hp);
        }
      }
      return false;
    }, { cap: CAP });
  }

  const out = await page.evaluate(() => {
    const rec = window.__d;
    const o = { cone: rec.cone, slew: rec.slew, t: rec.t, stages: {} };
    for (const k of Object.keys(rec.stage)) {
      const b = rec.stage[k];
      o.stages[k] = {
        secs: b.secs,
        shots: b.shots,
        wide: b.wide,
        dmg: b.dmg,
        switches: b.switches,
        blind: b.blind,
        cand: b.candSum / Math.max(1, b.secs * 60),
        inCone: b.inCone / Math.max(1, b.bossFrames),
        byType: b.byType,
      };
    }
    return o;
  });
  out.errs = errs.slice(0, 3);
  runs.push(out);
  await ctx.close();
}
await browser.close();

// ---- report ---------------------------------------------------------------

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const keys = [...new Set(runs.flatMap((r) => Object.keys(r.stages)))].sort();
const name = (k) => (k === '0' ? 'arrive' : k === '-1' ? 'after' : `stage ${k}`);

console.log(`\nANOMALY ${N} — ${RUNS} run${RUNS > 1 ? 's' : ''}, where the output goes`);
console.log(`  cone ±${runs[0].cone.toFixed(2)} rad (${Math.round((runs[0].cone * 180) / Math.PI)}°`
  + ` either side of up) · assist slew ${runs[0].slew} rad/s\n`);

const pad = (s, n) => String(s).padStart(n);
console.log('  stage      secs   shots  shots/s   dmg/s  dmg/shot   wide   thrash   blind  in-cone');
for (const k of keys) {
  const pick = (f) => med(runs.filter((r) => r.stages[k]).map((r) => f(r.stages[k])));
  if (!runs.some((r) => r.stages[k])) continue;
  const secs = pick((b) => b.secs);
  if (secs < 1) continue;
  const shots = pick((b) => b.shots);
  const dmg = pick((b) => b.dmg);
  const wide = pick((b) => b.wide);
  const sw = pick((b) => b.switches);
  const blind = pick((b) => b.blind);
  const cone = pick((b) => b.inCone);
  console.log(
    `  ${name(k).padEnd(9)}${pad(secs.toFixed(0), 5)}`
    + `${pad(Math.round(shots), 8)}${pad((shots / secs).toFixed(1), 9)}`
    + `${pad((dmg / secs).toFixed(1), 8)}${pad((dmg / Math.max(1, shots)).toFixed(1), 10)}`
    + `${pad(`${Math.round((100 * wide) / Math.max(1, shots))}%`, 7)}`
    + `${pad((sw / secs).toFixed(2), 9)}`
    + `${pad(`${Math.round((100 * blind) / Math.max(1, secs * 60))}%`, 8)}`
    + `${pad(`${Math.round(100 * cone)}%`, 9)}`,
  );
}

console.log('\n  wide     shots fired while the barrel was still coming round -- these');
console.log('           go where the last target was, and auto fire does not wait');
console.log('  thrash   target changes per second. Each one buys a slew.');
console.log('  blind    frames with no legal target: nothing in the cone and in reach');
console.log('  in-cone  how often the nearest body on the field was inside the cone');

const errs = runs.flatMap((r) => r.errs);
if (errs.length) console.log('\n  ERRORS', errs.slice(0, 3));
