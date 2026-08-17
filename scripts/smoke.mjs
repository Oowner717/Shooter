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

const stats = async () => page.evaluate(() => document.getElementById('dbgStats').textContent);
const busyStats = await stats();

await dbg('SKIP → GATE');
await sleep(2600);
await page.screenshot({ path: `${SHOTS}/06-gate.png` });

await dbg('SKIP → BOSS');
await sleep(4000);
await page.screenshot({ path: `${SHOTS}/07-boss.png` });

// let the boss fight breathe so powers fire
for (let i = 0; i < 6; i++) {
  await dbg('BOSS POWER');
  await sleep(900);
  await page.screenshot({ path: `${SHOTS}/08-power-${i}.png` });
}
const bossStats = await stats();

await dbg('GLITCH TEST');
await sleep(400);
await page.screenshot({ path: `${SHOTS}/09-glitch.png` });

await dbg('KILL BOSS');
await sleep(3000);
await page.screenshot({ path: `${SHOTS}/10-death.png` });
await sleep(9000);
await page.screenshot({ path: `${SHOTS}/11-ending.png` });
await sleep(6000);
await page.screenshot({ path: `${SHOTS}/12-frozen.png` });

const hasReset = await page.evaluate(() => !document.getElementById('resetBtn').hidden);
if (hasReset) {
  await page.click('#resetBtn');
  await sleep(1500);
  await page.screenshot({ path: `${SHOTS}/13-restart.png` });
}

const finalPhase = await page.evaluate(() => document.getElementById('phaseTag').textContent);

console.log('--- busy-field stats ---\n' + busyStats);
console.log('--- boss stats ---\n' + bossStats);
console.log('reset button appeared:', hasReset);
console.log('phase after restart:', finalPhase);
const runningBuild = await page.evaluate(() => document.querySelector('.bootFoot')?.textContent || '');
console.log('running build:', runningBuild.replace(/^.*BUILD /, '') || '(unknown)');
console.log('console errors:', errors.length);
for (const e of errors.slice(0, 20)) console.log('  !', e);

await browser.close();
process.exit(errors.length ? 1 : 0);
