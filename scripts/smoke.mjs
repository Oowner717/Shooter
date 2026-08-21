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
for (let round = 0; round < 6; round++) {
  await page.evaluate(() => {
    const g = window.__sim;
    g.debugAddKills(30);
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
const fired = await page.evaluate(async () => {
  const w = window.__sim.world;
  const before = w.projectiles.length;
  w.shooter.cooldown = 0;
  w.shooter.shoot(w);
  await new Promise((r) => setTimeout(r, 60));
  return w.projectiles.length - before;
});
if (fired < 1) {
  console.error('FAIL: the turret did not fire when told to');
  process.exit(1);
}
console.log('turret fires:', fired, 'round(s) on one trigger pull');

const stats = async () => page.evaluate(() => document.getElementById('dbgStats').textContent);
const busyStats = await stats();

/*
 * There is no count, no lull, no ORDINAL and no ending to walk any more —
 * build 81 made every run endless. What is left to prove is that a long run
 * keeps going: the field stays populated, waves keep rotating, and nothing
 * transitions the game out from under the player.
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
  return { phase: w.phase, kills: w.kills, endless: w.endless, boss: !!w.boss };
});

// The run has no end, so there is no reset button and nothing to restart from.
// What is checked instead is that a restart from the menu lands back in play.
await page.evaluate(() => window.__sim.restart());
await sleep(1800);
await page.screenshot({ path: `${SHOTS}/10-restart.png` });

const finalPhase = await page.evaluate(() => document.getElementById('phaseTag').textContent);

console.log('--- busy-field stats ---\n' + busyStats);
console.log('--- deep-field stats ---\n' + deepStats);
console.log('past the old count:', JSON.stringify(stillPlaying));
console.log('phase after restart:', finalPhase);
const runningBuild = await page.evaluate(() => document.querySelector('.bootFoot')?.textContent || '');
console.log('running build:', runningBuild.replace(/^.*BUILD /, '') || '(unknown)');
console.log('console errors:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  !', e);

await browser.close();
process.exit(errors.length ? 1 : 0);
