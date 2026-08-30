// Headless ladder probe: plays the game with real taps and reports every wave.
//
//   node scripts/ladder-probe.mjs [seconds] [tier] [profile] [baseUrl]
//
//   seconds  how long to play after setup             (default 180)
//   tier     rung to jump the ladder to before play    (default 1)
//   profile  bare | mid | max                          (default bare)
//            bare: nothing bought
//            mid:  +10000 ENERGY, then the 20 cheapest non-aperture nodes
//            max:  UNLOCK ALL, MAX UPGRADES, +10000 ENERGY (opens every type)
//   baseUrl  where index.html is served               (default http://127.0.0.1:8099/index.html)
//
// Serve the repo first, e.g. `python3 -m http.server 8099`. Output: a JSON summary on
// stdout and in ./probe-<profile>-t<tier>.json, with one record per wave the director
// ran: { tier, band, of, asked, dur, contact, left, verdict, trait }, the band makeup of
// `order` every 15 s, energy/s, and console errors.
//
// The bot reads object coordinates and taps the nearest hostile ahead of the turret;
// it presses every unsealed ability every 3 s and never touches the lever. It is a
// fixed-skill player, which is what makes two runs comparable.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const SECONDS = parseInt(process.argv[2] || '180', 10);
const TIER = parseInt(process.argv[3] || '1', 10);
const PROFILE = process.argv[4] || 'bare';
const BASE = (process.argv[5] && !process.argv[5].startsWith('--')) ? process.argv[5] : 'http://127.0.0.1:8099/index.html';
/*
 * `--hold` pins the ladder at the rung it was jumped to.
 *
 * For anything measured PER RUNG -- yield above all -- the rung has to stay
 * put. Without it a run dropped above its ceiling spends the window falling,
 * and what gets reported as "energy per second at rung 30" is the energy of a
 * run being shoved back to 26. HOLD pins climbs only, so a rung the profile
 * genuinely cannot hold still falls, which is the honest answer there.
 */
const HOLD = process.argv.includes('--hold');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__sim && window.__sim.world);
await sleep(600);
await page.click('#startBtn');
await sleep(1200);
await page.evaluate(async () => { const m = await import('./src/config.js'); window.__waves = m.WAVES; });

// ---- profile, through the debug panel like a person would ----
const dbg = async (label) => page.evaluate((t) => {
  const panel = document.getElementById('debugPanel');
  panel.hidden = false;
  const b = [...document.querySelectorAll('#dbgGrid button')].find((x) => x.textContent === t);
  if (!b) throw new Error(`no debug button ${t}`);
  b.click();
  panel.hidden = true;
}, label);
const buttons = { bare: [], mid: ['+10000 ENERGY'], max: ['UNLOCK ALL', 'MAX UPGRADES', '+10000 ENERGY'] }[PROFILE] || [];
if (buttons.length) {
  await page.click('#menuBtn');
  await sleep(250);
  await page.evaluate(() => window.__sim.hud.menu.show('system'));
  await sleep(150);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-panel="system"] .menuCell')].find((c) => c.querySelector('.cellName').textContent === 'DEBUG');
    b.click();
  });
  await sleep(250);
  for (const label of buttons) { await dbg(label); await sleep(200); }
  await page.evaluate(() => { if (document.body.classList.contains('menuOpen')) window.__sim.hud.menu.toggle(); });
  await sleep(300);
}
if (PROFILE === 'mid') {
  await page.evaluate(async () => {
    const g = window.__sim; const w = g.world;
    const { NODES, priceOf } = await import('./src/tree.js');
    for (let i = 0; i < 20; i++) {
      const c = NODES.filter((n) => n.id && !n.dormant && !/aperture/.test(n.id) && n.currency !== 'remainder' && g.available(n))
        .map((n) => ({ n, have: g.owned(n.id) })).filter(({ n, have }) => n.repeat || have < (n.levels || 1))
        .map((x) => ({ ...x, price: priceOf(x.n, x.have) })).filter((x) => x.price <= w.energy).sort((a, b) => a.price - b.price)[0];
      if (!c || g.buy(c.n.id) !== 'ok') break;
    }
  });
}
// The rail only walks rungs already climbed, so the jump uses the director's setter.
await page.evaluate(({ n, hold }) => {
  const g = window.__sim;
  g.world.director.setTier(n);
  g.world.director.hold = hold;
  g.hud.syncRail(g.world);
}, { n: TIER, hold: HOLD });

const read = () => page.evaluate(() => {
  const g = window.__sim; const w = g.world; const d = w.director;
  const r = g.canvas.getBoundingClientRect(); const s = w.shooter;
  const W = window.__waves;
  return {
    rect: { left: r.left, top: r.top }, scale: w.scale, shooter: { x: s.x, y: s.y, r: s.r },
    enemies: w.enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, y: e.y, harmless: !!e.harmless, id: e.type?.id || '?' })),
    hostile: w.enemies.filter((e) => !e.dead && !e.harmless).length,
    kills: w.kills, energy: Math.round(w.energy), earned: Math.round(w.earned), phase: w.phase, boss: !!w.boss,
    dividend: +(g.__dividend ? g.__dividend(w) : 1),
    gated: d.heldBy ? d.heldBy(w) : 0,
    reconciled: [...(w.reconciled || [])],
    dir: { at: d.at, resting: d.resting, tier: d.tier, peak: d.peak, fails: d.fails, verdict: d.lastVerdict, trait: d.trait?.id || d.trait || null,
      of: d.wave ? d.wave.of.map(([id, n]) => `${id}x${n}`).join('+') : '', teach: !!(d.wave && d.wave.teach), band: d.wave ? (d.wave.band || null) : null,
      asked: d.asked, contact: +d.contact.toFixed(1), hitPatience: d.hitPatience },
    order: d.order.map((i, k) => (k <= d.at ? '[' : '') + (W[i].teach ? 'T' : (W[i].band || 1)) + (k <= d.at ? ']' : '')).join(' '),
    buttons: [...document.querySelectorAll('#ui button')].map((b) => b.getBoundingClientRect()).filter((q) => q.width > 0).map((q) => ({ l: q.left, t: q.top, r: q.right, b: q.bottom })),
    panel: document.body.classList.contains('loadoutOpen') ? 'loadout' : document.body.classList.contains('menuOpen') ? 'menu' : null,
  };
});

const waves = []; const orderLog = []; const types = {};
let cur = null; let lastAt = -2; let lastResting = null; let taps = 0; let lastAb = 0; let lastOrder = 0;
let gatesOpened = 0; const gateLog = [];
const t0 = Date.now(); const T = () => +((Date.now() - t0) / 1000).toFixed(1);
const energy0 = (await read()).energy;

while (T() < SECONDS) {
  const st = await read(); const d = st.dir;
  for (const e of st.enemies) types[e.id] = (types[e.id] || 0) + 1;
  if (d.at !== lastAt && !d.resting) { cur = { start: T(), tier: d.tier, band: d.band, teach: d.teach, of: d.of, asked: d.asked, trait: d.trait, maxHostile: st.hostile, contact: 0, kills0: st.kills }; lastAt = d.at; }
  if (cur) { cur.maxHostile = Math.max(cur.maxHostile, st.hostile); cur.contact = Math.max(cur.contact, d.contact); cur.asked = Math.max(cur.asked, d.asked); }
  if (lastResting === false && d.resting && cur) {
    Object.assign(cur, { dur: +(T() - cur.start).toFixed(1), verdict: cur.teach ? 'unscored' : d.verdict, tierAfter: d.tier, hitPatience: d.hitPatience, left: st.hostile, kills: st.kills - cur.kills0 });
    waves.push(cur); cur = null;
  }
  lastResting = d.resting;
  if (st.reconciled.length > gateLog.length) {
    for (const n of st.reconciled.slice(gateLog.length)) gateLog.push({ n, at: T(), tier: d.tier });
  }
  if (Date.now() - lastOrder > 15000) { lastOrder = Date.now(); orderLog.push(`t=${T()}s tier=${d.tier} ${st.order}`); }
  if (st.phase === 'boot' || st.phase === 'frozen') { await sleep(100); continue; }
  /*
   * A gate is answered when the bot reaches one.
   *
   * Only when the ladder is actually HELD by a gate -- a held aperture the run
   * bought for itself is a decision the bot has no business making, but a rung
   * the ladder will not climb past has exactly one thing to do about it, and a
   * probe that walks up to a gate and stands there is measuring nothing.
   */
  if (st.gated && !st.boss) {
    const opened = await page.evaluate(() => {
      const row = document.querySelector('#apertureBar .apRow');
      if (!row) return false;
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return true;
    });
    if (opened) { gatesOpened++; await sleep(250); continue; }
  }
  if (st.panel) { await page.evaluate((p) => { const g = window.__sim; if (p === 'loadout') g.closeLoadout(); else g.hud.menu.toggle(); }, st.panel); continue; }

  const s = st.shooter;
  const dist = (e) => Math.hypot(e.x - s.x, e.y - s.y);
  const above = st.enemies.filter((e) => e.y < s.y - s.r - 6);
  const target = above.filter((e) => !e.harmless).sort((a, b) => dist(a) - dist(b))[0] || above.filter((e) => e.harmless).sort((a, b) => dist(a) - dist(b))[0];
  if (target) {
    const cx = target.x * st.scale + st.rect.left; const cy = target.y * st.scale + st.rect.top; const vp = page.viewportSize();
    const onButton = st.buttons.some((b) => cx >= b.l - 4 && cx <= b.r + 4 && cy >= b.t - 4 && cy <= b.b + 4);
    if (!onButton && cy > 110 && cy < vp.height - 140 && cx > 8 && cx < vp.width - 8) { await page.mouse.click(cx, cy); taps++; }
  }
  if (Date.now() - lastAb > 3000) { lastAb = Date.now(); await page.evaluate(() => { const g = window.__sim; for (let i = 0; i < 5; i++) { try { if (!g.abilitySealed(i)) g.useAbility(i); } catch (e) { /* sealed or empty */ } } }); }
  await sleep(60);
}

const fin = await read();
const scored = waves.filter((w) => w.verdict && w.verdict !== 'unscored');
const count = (v) => scored.filter((w) => w.verdict === v).length;
const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
const out = {
  profile: PROFILE, tier: TIER, seconds: SECONDS, taps, hold: HOLD,
  dividend: fin.dividend, gatesOpened, gateLog, reconciled: fin.reconciled,
  final: { kills: fin.kills, tier: fin.dir.tier, peak: fin.dir.peak, energyPerSec: +((fin.energy - energy0) / SECONDS).toFixed(2) },
  summary: { scored: scored.length, surge: count('surge'), clean: count('clean'), stall: count('stall'), rout: count('rout'), failed: count('failed'),
    medianDur: median(scored.map((w) => w.dur)), medianContact: median(scored.map((w) => w.contact)), maxHostile: Math.max(0, ...waves.map((w) => w.maxHostile)) },
  types, waves, orderLog, errors,
};
writeFileSync(`probe-${PROFILE}-t${TIER}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
