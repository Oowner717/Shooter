// Headless smoke test: boots the game in an iPhone-sized viewport, drives it
// through every phase via the debug hooks, and reports console errors + FPS.
// Run: node scripts/smoke.mjs [baseUrl]

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

// Playwright is installed globally in this environment; resolve it via CJS so
// NODE_PATH is honoured.
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8099/index.html';
const SHOTS = process.env.SHOT_DIR || '/tmp/sim7749-shots';
mkdirSync(SHOTS, { recursive: true });

const errors = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('requestfailed', (r) => {
  // A deliberate reload (the build-change escape hatch) aborts whatever was
  // in flight; that is expected, not a failure.
  const why = r.failure()?.errorText || '';
  if (why.includes('ERR_ABORTED')) return;
  errors.push(`requestfailed: ${r.url()} ${why}`);
});

await page.goto(BASE, { waitUntil: 'load' });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/01-boot.png` });

// expose the game instance for driving
await page.evaluate(() => {
  const btn = document.getElementById('startBtn');
  btn.click();
});
await sleep(1200);

// The opening hands the controls over one at a time over the first sixty
// objects. The walk-through is not what this is testing, so take all of it.
await page.evaluate(() => window.__sim.debugTeachAll());
await sleep(120);

// tap around the play field
const vp = page.viewportSize();
for (let i = 0; i < 25; i++) {
  await page.mouse.click(60 + ((i * 47) % (vp.width - 120)), 140 + ((i * 83) % 320));
  await sleep(35);
}
await sleep(600);
await page.screenshot({ path: `${SHOTS}/02-play.png` });

// abilities
const abilityCount = await page.evaluate(() => document.querySelectorAll('#abilities .ab').length);
for (let i = 0; i < abilityCount; i++) {
  await page.evaluate((k) => {
    const el = document.querySelectorAll('#abilities .ab')[k];
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }, i);
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/03-ability-${i}.png` });
}

// debug panel — reached through the menu now that the DBG chip is gone
await page.click('#menuBtn');
await sleep(300);
await page.evaluate(() => window.__sim.hud.menu.show('system'));
await sleep(200);
await page.screenshot({ path: `${SHOTS}/03b-menu.png` });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-panel="system"] .menuCell')]
    .find((c) => c.querySelector('.cellName').textContent === 'DEBUG');
  b.click();
});
await sleep(300);
await page.screenshot({ path: `${SHOTS}/04-debug.png` });

const dbg = async (label) => {
  await page.evaluate(() => { document.getElementById('debugPanel').hidden = false; });
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('#dbgGrid button')].find((x) => x.textContent === t);
    if (!b) throw new Error(`no debug button ${t}`);
    b.click();
  }, label);
  await page.evaluate(() => { document.getElementById('debugPanel').hidden = true; });
};

await dbg('STATS');
await dbg('NO COOLDOWN');

// --- soak: unlock every object type, then churn the field with abilities ---
// Energy, not kills: the types have been gated on what a run has banked since
// build 180, and debugFillField spawns straight from the table regardless --
// so a soak driven on kills was churning a field the director could not have
// produced. The kills still go in; they are what the tally and the story read.
for (let round = 0; round < 6; round++) {
  await page.evaluate(() => {
    const g = window.__sim;
    g.debugAddKills(30);
    g.debugGiveEnergy(4000);
    g.debugFillField();
  });
  for (let a = 0; a < 5; a++) {
    await page.evaluate((k) => window.__sim.useAbility(k), a);
    await sleep(220);
  }
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(50 + ((i * 61) % (vp.width - 100)), 150 + ((i * 97) % 340));
    await sleep(25);
  }
  await sleep(500);
}
await page.screenshot({ path: `${SHOTS}/04b-soak.png` });
const soakStats = await page.evaluate(() => document.getElementById('dbgStats').textContent);
console.log('--- soak stats ---\n' + soakStats);

await dbg('FILL FIELD');
await sleep(1500);
await page.screenshot({ path: `${SHOTS}/05-full-field.png` });

/*
 * The turret can shoot. Trivial, and it went unnoticed for three builds:
 * removing world.lockout in build 82 left `world.lockout <= 0` in canFire()
 * comparing against undefined, which is false, so nothing could fire at all.
 * Nothing here exercised an actual trigger pull — the walk uses debug spawns
 * and debug kills — so the suite stayed green through a game you could not
 * play. It is asserted first now, before anything else is measured.
 */
const fired = await page.evaluate(() => {
  const w = window.__sim.world;
  const before = w.projectiles.length;
  w.shooter.cooldown = 0;
  const ok = w.shooter.shoot(w);
  // Counted in the same tick. It used to wait 60ms first, which on the packed
  // field this runs against measured whether the round survived the flight
  // rather than whether it left the barrel: FILL FIELD puts bodies close
  // enough to the muzzle that a hit inside one frame is normal, and the check
  // failed on roughly a third of runs for a turret that was working fine.
  return { made: w.projectiles.length - before, ok };
});
if (!fired.ok || fired.made < 1) {
  console.error('FAIL: the turret did not fire when told to', JSON.stringify(fired));
  process.exit(1);
}
console.log('turret fires:', fired.made, 'round(s) on one trigger pull');

const stats = async () => page.evaluate(() => document.getElementById('dbgStats').textContent);
const busyStats = await stats();

/*
 * There is no count, no lull, no ORDINAL and no ending to walk any more —
 * build 81 made every run endless, and build 186 finally took out the last
 * of the machinery that had been left standing for it. What is left to prove
 * is that a long run keeps going: the field stays populated, waves keep
 * rotating, and nothing transitions the game out from under the player.
 */
await dbg('+50 KILLS');
await dbg('+50 KILLS');
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/06-deep-field.png` });

await dbg('NEXT STORY');
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/07-story.png` });

await dbg('GLITCH TEST');
await sleep(400);
await page.screenshot({ path: `${SHOTS}/08-glitch.png` });

// Long enough for several waves to hand over, and past where the five
// hundredth kill used to end the run.
for (let i = 0; i < 6; i++) await dbg('+50 KILLS');
await sleep(6000);
const deepStats = await stats();
await page.screenshot({ path: `${SHOTS}/09-still-running.png` });

const stillPlaying = await page.evaluate(() => {
  const w = window.__sim.world;
  return { phase: w.phase, kills: w.kills, tier: w.director.tier, boss: !!w.boss };
});

// The run has no end, so there is no reset button and nothing to restart from.
// What is checked instead is that a restart from the menu lands back in play.
await page.evaluate(() => window.__sim.restart());
await sleep(1800);
await page.screenshot({ path: `${SHOTS}/10-restart.png` });

/*
 * Read off the world rather than off a chip. The FIELD readout this used to
 * scrape became the ladder's control in build 177 -- and a phase check that
 * depends on a particular element existing was only ever testing the markup.
 */
const finalPhase = await page.evaluate(() => window.__sim.world.phase);

console.log('--- busy-field stats ---\n' + busyStats);
console.log('--- deep-field stats ---\n' + deepStats);
console.log('past the old count:', JSON.stringify(stillPlaying));
console.log('phase after restart:', finalPhase,
  '| tier:', await page.evaluate(() => window.__sim.world.director.tier));
/*
 * Off `#bootBuild`, which is the element that holds it. This read the whole of
 * `.bootFoot` and stripped everything up to "BUILD " -- and build 227 put the
 * RESET SIMULATION control and its confirm box inside that footer, so the
 * probe started printing the entire wipe dialogue under "running build:". It
 * still exited 0, which is the point worth remembering: a readout with no
 * assertion behind it can go wrong and stay green.
 */
const runningBuild = await page.evaluate(() => document.getElementById('bootBuild')?.textContent || '');
console.log('running build:', runningBuild.replace(/^BUILD /, '') || '(unknown)');
console.log('console errors:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  !', e);

await browser.close();
process.exit(errors.length ? 1 : 0);
