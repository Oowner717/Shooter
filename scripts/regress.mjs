/*
 * The regression suite.
 *
 * This exists because the one before it did not. The per-feature tests lived
 * in a session scratchpad as two hundred and forty-three loose probe scripts
 * with a hand-kept runner list; half of them named things deleted in builds
 * 81-99, and all of them died with the container they were written in. Twenty
 * one of the forty three the runner still listed failed on build 100, and not
 * one of those failures was the game's fault. A suite nobody can run is not a
 * suite.
 *
 * So: one file, in the repo, asserting the things this game has actually got
 * wrong. Every case here is a bug that shipped.
 *
 *   ghost fields   build 82 deleted world.lockout and left `world.lockout <= 0`
 *                  behind. `undefined <= 0` is false, so the turret could not
 *                  fire for three builds and nothing noticed. A Proxy over
 *                  world and world.up catches the whole class.
 *   the trigger    the same bug, asserted directly.
 *   subsystems     every round, mine, ability and object type, once, watching
 *                  for a thrown error.
 *   the save       build 100: a save must survive the app updating, and must
 *                  still refuse a malformed one.
 *   the tabs       build 89: .menuPanel.tree won the cascade over [hidden] and
 *                  the tree sat on top of every other tab.
 *   the volume     build 101: mute, relaunch, unmute came back to full rather
 *                  than to the level the player chose.
 *   broadphase     build 92 grew a body past half the grid cell, so two of
 *                  them could overlap unseen. (Also guarded statically in
 *                  check-build.mjs; this checks the running game agrees.)
 *   discovery      build 104: a first kill only flashed the menu button, which
 *                  nobody watching the field ever saw.
 *   the reset      build 104: RESET SIMULATION kept the glossary and every
 *                  line already said, so starting again started again with the
 *                  game still knowing you.
 *   corruption     build 105: the only copy in the game that states numbers,
 *                  checked against the numbers the code charges.
 *   the rig        build 106: the TURRET branch is named for the parts it
 *                  bolts on, so a part that stops drawing makes a liar of the
 *                  tree.
 *   salvage        build 108: a WARDEN's energy inherited its orbiting plates,
 *                  so a 4-unit mote was drawn as a pinwheel and stopped rounds
 *                  across a 59-unit reach.
 *
 * Run: node scripts/regress.mjs            (expects a static server on :8099)
 *      node scripts/regress.mjs --port N
 *
 * Needs playwright: NODE_PATH=/opt/node22/lib/node_modules
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argPort = process.argv.indexOf('--port');
const PORT = argPort > 0 ? process.argv[argPort + 1] : '8099';
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const ok = (name, detail = '') => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });
const check = (name, cond, detail = '') => (cond ? ok(name, detail) : bad(name, detail));

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(900);

// --- the title screen, before anything presses it ----------------------------
/*
 * The same floor the menu has: 11px and 4.5:1, on the one screen every run
 * begins at. The footer gets its own check because it once ended seven pixels
 * past a 664px viewport -- half of "BUILD N" simply off the screen -- and a
 * clipped element still passes a font-size sweep.
 *
 * BOTH STATES. This walked the panel exactly as a first launch finds it, so
 * everything that only appears once there is a run on disk -- the record
 * tiles, the resume detail, RESET SIMULATION and the box that asks for the
 * word -- was never measured at all. Build 227 rebuilt this screen and put
 * five new rows on it, four of them in that half. A sweep that reads one of
 * two states is a floor for one of two states.
 */
{
  const sweepTitle = () => page.evaluate(() => {
    const px = (v) => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const a2 = m[1].split(',').map(Number);
      return { r: a2[0], g: a2[1], b: a2[2], a: a2.length > 3 ? a2[3] : 1 }; };
    const over = (f, b2) => ({ r: f.r * f.a + b2.r * (1 - f.a), g: f.g * f.a + b2.g * (1 - f.a),
      b: f.b * f.a + b2.b * (1 - f.a), a: 1 });
    const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const cr = (x, y) => { const a2 = L(x); const b2 = L(y);
      return (Math.max(a2, b2) + 0.05) / (Math.min(a2, b2) + 0.05); };
    const bad = [];
    let seen = 0;
    const wk = document.createTreeWalker(document.getElementById('boot'), NodeFilter.SHOW_TEXT);
    let t;
    while ((t = wk.nextNode())) {
      const txt = t.nodeValue.trim();
      if (!txt) continue;
      const el = t.parentElement;
      if (!el.offsetParent) continue;
      const cs = getComputedStyle(el);
      const fg = px(cs.color);
      if (!fg || fg.a === 0) continue;
      seen++;
      let bg = { r: 4, g: 8, b: 14, a: 1 };
      const chain = [];
      for (let e = el; e; e = e.parentElement) {
        const q = px(getComputedStyle(e).backgroundColor);
        if (q && q.a > 0) chain.unshift(q);
      }
      for (const q of chain) bg = over(q, bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const ratio = cr(over(fg, bg), bg);
      if (size < 11 || ratio < (large ? 3 : 4.5)) bad.push(`${txt.slice(0, 14)}@${size}px:${ratio.toFixed(2)}`);
    }
    const foot = document.querySelector('.bootFoot').getBoundingClientRect();
    const keys = document.querySelectorAll('.bootKeys li').length;
    return { seen, bad, footBottom: Math.round(foot.bottom), vh: innerHeight, keys };
  });

  const cold = await sweepTitle();
  /*
   * ...and again with a run on disk and the wipe box open, which is every row
   * this panel can show. The save is written straight to storage rather than
   * through a run, because what is being measured is the panel and not the
   * game -- and it is taken away again, or the case after this one starts on a
   * title screen offering a CONTINUE it did not ask for.
   */
  const warm = await page.evaluate(async () => {
    const { saveRun } = await import('../src/save.js');
    const { codex } = await import('../src/codex.js');
    const g = window.__sim;
    const was = g.world.phase;
    g.world.phase = 'staging';
    g.world.kills = 348;
    g.world.energy = 2140;
    codex.record('mote');
    codex.record('ordinal');
    saveRun(g.world, g);
    g.world.phase = was;
    g.hud.offerResume();
    g.hud.showRecord();
    document.getElementById('wipeBtn').click();
    return true;
  });
  const hot = await sweepTitle();
  await page.evaluate(async () => {
    const { forgetRun } = await import('../src/save.js');
    forgetRun();
    document.getElementById('wipeNo').click();
    window.__sim.hud.offerResume();
    window.__sim.hud.showRecord();
  });

  const r = cold;
  check('the title clears the menu\'s floor, and nothing hangs off the screen',
    r.bad.length === 0 && r.seen > 6 && r.footBottom <= r.vh,
    `${r.seen} read; failing: ${r.bad.slice(0, 5)}; foot ${r.footBottom}/${r.vh}`);
  check('...and so does every row it only shows once there is a run to continue',
    warm && hot.bad.length === 0 && hot.seen > r.seen && hot.footBottom <= hot.vh,
    `${hot.seen} read with a save and the wipe box open, against ${r.seen} without; `
    + `failing: ${hot.bad.slice(0, 6)}; foot ${hot.footBottom}/${hot.vh}`);
  check('the title teaches the two ways to shoot and leaves the rest to the run',
    r.keys === 2, `${r.keys} control rows on the title`);

  /*
   * ...and the one thing on it that claims to be live actually is.
   *
   * The readout shipped in build 227 as an object count, under a comment
   * calling it a reading off the arena running behind the panel rather than an
   * animation of nothing. `Game.update` holds the boot field at seven
   * drifters and nothing kills drift, so it was seven from the first frame to
   * the last -- one distinct value over 240 frames, measured. A number that
   * cannot change is decoration, and the comment made it a lie as well. There
   * is a clock in it now, and this is what says so.
   */
  const live = await page.evaluate(() => {
    const g = window.__sim;
    const seen = new Set();
    for (let i = 0; i < 60 * 4; i++) {
      g.update(1 / 60);
      g.hud.syncBoss(g.world);
      seen.add(document.getElementById('bootTele').textContent);
    }
    return { phase: g.world.phase, n: seen.size, first: [...seen][0], last: [...seen].pop() };
  });
  check('...and the readout on it moves, rather than only claiming to',
    live.phase === 'boot' && live.n >= 3 && /T\+\d\d:\d\d/.test(live.first),
    `${live.n} distinct readings over four seconds of the title screen: `
    + `"${live.first}" .. "${live.last}"`);
}

await page.evaluate(() => document.getElementById('startBtn').click());
await page.waitForTimeout(1200);

// --- the trigger ------------------------------------------------------------
// Counted in the same tick: waiting first measures whether the round survived
// the flight, which on a packed field is a coin toss. See scripts/smoke.mjs.
{
  const r = await page.evaluate(() => {
    const w = window.__sim.world;
    const before = w.projectiles.length;
    const fired = w.shooter.shoot(w);
    return { fired, made: w.projectiles.length - before };
  });
  check('the turret fires when told to', r.fired && r.made >= 1, JSON.stringify(r));
}

// --- ghost fields -----------------------------------------------------------
// Everything below runs with world and world.up behind a Proxy that records
// every read of a key that is not there.
await page.evaluate(() => {
  const g = window.__sim;
  window.__ghosts = new Map();
  const wrap = (obj, where) => new Proxy(obj, {
    get(t, k, r) {
      if (typeof k === 'string' && !(k in t)) {
        const key = `${where}.${k}`;
        window.__ghosts.set(key, (window.__ghosts.get(key) || 0) + 1);
      }
      return Reflect.get(t, k, r);
    },
  });
  g.world.up = wrap(g.world.up, 'up');
  g.world = wrap(g.world, 'world');
});

// --- every subsystem, once --------------------------------------------------
const drive = async (name, fn, wait = 300) => {
  const before = errors.length;
  try { await page.evaluate(fn); } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); }
  await page.waitForTimeout(wait);
  return errors.length === before;
};

let subsystems = true;
subsystems = (await drive('teach', () => window.__sim.debugTeachAll())) && subsystems;
subsystems = (await drive('energy', () => window.__sim.debugGiveEnergy(200000))) && subsystems;
subsystems = (await drive('buy all', () => window.__sim.debugBuyAll(), 700)) && subsystems;
subsystems = (await drive('fill', () => window.__sim.debugFillField(), 700)) && subsystems;

const abilities = await page.evaluate(() => window.__sim.world.abilities.slots.length);
for (let i = 0; i < abilities; i++) {
  subsystems = (await drive(`ability ${i}`, (k) => window.__sim.useAbility(k), 350, i)) && subsystems;
  await page.evaluate((k) => window.__sim.useAbility(k), i).catch(() => {});
  await page.waitForTimeout(300);
}
const rounds = await page.evaluate(async () => Object.keys((await import('../src/config.js')).CFG.rounds));
for (const id of rounds) {
  subsystems = (await drive(`round ${id}`, (k) => {
    const w = window.__sim.world;
    w.round = k;
    for (let i = 0; i < 10; i++) { w.shooter.shoot(w); }
  }, 250, id)) && subsystems;
}
const mines = await page.evaluate(async () => (await import('../src/tutorial.js')).LOCKABLE.mines);
for (const id of mines) {
  subsystems = (await drive(`mine ${id}`, (k) => window.__sim.debugThrowMine(k), 250, id)) && subsystems;
}
subsystems = (await drive('every object type', async () => {
  const g = window.__sim;
  const { ENEMY_TYPES } = await import('../src/config.js');
  for (const t of ENEMY_TYPES) {
    const e = g.debugSpawn(t.id, 60 + Math.random() * 500, 350 + Math.random() * 450);
    if (e) { e.staged = false; e.spawnIn = 0; }
  }
}, 2000)) && subsystems;
subsystems = (await drive('scion -> seeds -> grafts', () => {
  const g = window.__sim;
  const s = g.debugSpawn('scion', g.world.width / 2, 400);
  s.staged = false; s.spawnIn = 0; s.applyDamage(g.world, 1e9);
}, 4500)) && subsystems;
subsystems = (await drive('restart', () => window.__sim.restart(), 1000)) && subsystems;

check(`every round, mine, ability and object type runs (${rounds.length} rounds, ${mines.length} mines, ${abilities} abilities)`,
  subsystems, errors.slice(0, 3).join(' / '));

const ghosts = await page.evaluate(() => [...(window.__ghosts || new Map())]);
check('nothing reads a field that does not exist', ghosts.length === 0,
  ghosts.map(([k, n]) => `${k} x${n}`).join(', '));

// --- the save ---------------------------------------------------------------
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const save = await import('../src/save.js');
    g.debugAddKills(20);
    g.debugGiveEnergy(3000);
    g.buy('rate');
    if (g.saveNow) g.saveNow();
    const raw = JSON.parse(localStorage.getItem('sim7749-run') || 'null');
    if (!raw) return { wrote: false };
    const older = { ...raw, build: '1' };
    localStorage.setItem('sim7749-run', JSON.stringify(older));
    const survives = save.readRun() !== null;
    const refuses = (mut) => {
      const d = JSON.parse(JSON.stringify(raw));
      mut(d);
      localStorage.setItem('sim7749-run', JSON.stringify(d));
      return save.readRun() === null;
    };
    const junk = {
      version: refuses((d) => { d.v = -1; }),
      noLoadout: refuses((d) => { delete d.loadout; }),
      badLoadout: refuses((d) => { d.loadout = { mines: 1, ammo: 2 }; }),
      badTaken: refuses((d) => { d.taken = 'rate'; }),
      badUnlocked: refuses((d) => { d.unlocked = 7; }),
      badKills: refuses((d) => { d.kills = 'many'; }),
    };
    localStorage.setItem('sim7749-run', JSON.stringify(raw));
    return { wrote: true, survives, junk };
  });
  check('a save survives the app updating', r.wrote && r.survives, JSON.stringify(r));
  check('a malformed save is still refused',
    r.junk && Object.values(r.junk).every(Boolean), JSON.stringify(r.junk));
}

// --- the menu tabs ----------------------------------------------------------
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    g.hud.menu.setOpen(true);
    const out = {};
    for (const tab of ['ammo', 'mines', 'tree', 'ultimate', 'codex', 'system']) {
      g.hud.menu.show(tab);
      const shown = [...document.querySelectorAll('#menuPanels .menuPanel')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => el.dataset.panel);
      out[tab] = shown;
    }
    g.hud.menu.setOpen(false);
    return out;
  });
  const oneEach = Object.entries(r).every(([tab, shown]) => shown.length === 1 && shown[0] === tab);
  check('each menu tab shows its own panel and only its own', oneEach, JSON.stringify(r));
}

// --- the shop's own floor ---------------------------------------------------
/*
 * Every word in the panel that sells things has to be readable.
 *
 * It was not: 434 of 460 pieces of text at 10px or under, the smallest 5.5,
 * and the line on all sixty-three rows was 8px at 2.99:1 against a 4.5:1
 * floor. This walks what is actually on screen, composites each element's
 * ground through its ancestors, and measures -- so a colour that passes in
 * isolation and fails over the surface it is actually on is still caught.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    g.debugGiveEnergy(3000);
    g.hud.menu.setOpen(true);
    g.hud.menu.show('tree');
    document.querySelectorAll('.branchRow')[1].click();
    const px = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const a = m[1].split(',').map(Number);
      return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 };
    };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a),
      b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const cr = (x, y) => { const a = L(x); const b = L(y);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    const bad = [];
    let seen = 0;
    /*
     * All three panels, not just the shop.
     *
     * UPGRADES got a floor in 154 and OBJECTS and SYSTEM did not, so the
     * menu carried two standards for two builds: measured the same way,
     * every one of OBJECTS' 78 pieces of text was under 11px and 72 of them
     * failed 4.5:1, the worst at 1.82. A floor that applies to one tab is
     * not a floor.
     */
    const panels = [];
    for (const tab of ['ammo', 'mines', 'tree', 'ultimate', 'codex', 'system']) {
      g.hud.menu.show(tab);
      panels.push(document.querySelector(`[data-panel="${tab}"]`));
    }
    g.hud.menu.show('tree');
    const nodes = [];
    for (const panel of panels) {
      const wk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      let n;
      // A panel that is not the open one is `hidden`, so offsetParent is null
      // for everything inside it. It is un-hidden for the measurement and put
      // back afterwards.
      const was = panel.hidden;
      panel.hidden = false;
      while ((n = wk.nextNode())) nodes.push(n);
      panel.hidden = was;
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== 'tree';
    let t;
    let at = -1;
    while ((t = nodes[++at])) {
      const txt = t.nodeValue.trim();
      if (!txt) continue;
      const el = t.parentElement;
      if (!el.isConnected || el.hidden || el.closest('[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const fg = px(cs.color);
      // Text painted through a gradient with background-clip reports a
      // transparent colour; there is nothing there to measure.
      if (!fg || fg.a === 0) continue;
      seen++;
      let bg = { r: 5, g: 8, b: 15, a: 1 };
      const chain = [];
      for (let e = el; e; e = e.parentElement) {
        const c = px(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) chain.unshift(c);
      }
      for (const c of chain) bg = over(c, bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const ratio = cr(over(fg, bg), bg);
      if (size < 11 || ratio < (large ? 3 : 4.5)) {
        bad.push(`${txt.slice(0, 14)}@${size}px:${ratio.toFixed(2)}`);
      }
    }
    g.hud.menu.setOpen(false);
    return { seen, bad };
  });
  check('every word in the menu clears 11px and 4.5:1',
    r.bad.length === 0 && r.seen > 60, `${r.seen} read; failing: ${r.bad.slice(0, 6)}`);
}

// --- what a purchase sounds like --------------------------------------------
/*
 * It was a rising arpeggio over two and a bit seconds -- five times longer
 * than the longest thing that happens on screen when you buy something. What
 * is asserted is the length, because that is the part that was wrong: a
 * fitting seats, it does not get announced.
 */
{
  const r = await page.evaluate(async () => {
    const { audio } = await import('../src/audio.js');
    // Scheduled, not rendered: the suite stubs the audio context, so what can
    // be checked is what amend() asks for rather than what comes out.
    /*
     * The five amend() asks for, found by their own shape.
     *
     * The first version of this counted every voice inside a 140ms window and
     * asserted there were five. The suite runs a live game underneath it, so
     * anything else that made a sound in that window was counted too -- it
     * came back seven about one run in ten. What is being tested is what a
     * purchase schedules, not what the field happened to be doing.
     */
    const voices = [];
    const t0 = Date.now();
    const tone = audio.tone.bind(audio);
    const noise = audio.noise.bind(audio);
    const grab = (kind, dflt) => (o) => voices.push({
      kind, at: Date.now() - t0, dur: o.dur || dflt, gain: o.gain, f0: o.f0 || 0,
    });
    audio.tone = grab('tone', 0.12);
    audio.noise = grab('noise', 0.2);
    const wasReady = audio.ready;
    Object.defineProperty(audio, 'ready', { value: true, configurable: true });
    audio.amend();
    await new Promise((res) => setTimeout(res, 160));
    audio.tone = tone;
    audio.noise = noise;
    Object.defineProperty(audio, 'ready', { value: wasReady, configurable: true });
    const find = (f) => voices.find(f);
    const mine = [
      find((v) => v.kind === 'noise' && Math.abs(v.dur - 0.035) < 0.001),   // the meet
      find((v) => v.kind === 'tone' && Math.abs(v.f0 - 165) < 1),           // the seat
      find((v) => v.kind === 'noise' && Math.abs(v.dur - 0.13) < 0.001),    // its weight
      find((v) => v.kind === 'tone' && Math.abs(v.f0 - 1290) < 1),          // the ring
      find((v) => v.kind === 'tone' && Math.abs(v.f0 - 1935) < 1),
    ];
    const got = mine.filter(Boolean);
    const end = got.length ? Math.max(...got.map((v) => v.at / 1000 + v.dur)) : 99;
    return { found: got.length, heard: voices.length, endMs: Math.round(end * 1000),
      peak: got.length ? Math.max(...got.map((v) => v.gain)) : 0 };
  });
  check('a purchase seats rather than chimes',
    r.found === 5 && r.endMs < 400 && r.peak >= 0.2,
    `${r.found}/5 of its own voices (${r.heard} heard), last ends at ${r.endMs}ms, loudest ${r.peak}`);
}

// --- the room ---------------------------------------------------------------
/*
 * The panel that upgrades the turret could not tell an empty machine from a
 * finished one: screenshot it owning nothing, buy every level, screenshot
 * again, diff below the energy strip -- zero differing pixels. This is that
 * gate, kept as an assertion rather than as a screenshot: the count and the
 * shelf both have to move, and the machine has to be drawn at all.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const m = g.hud.menu;
    m.setOpen(true);
    m.show('tree');
    const read = () => {
      m.syncTree();
      const cv = document.querySelector('.rigHero canvas');
      return {
        count: document.querySelector('.rigCount').textContent,
        // The shelf's two, not all eighty-five: the branch grids are made of
        // the same card and querying for the class alone catches the lot.
        // Every card carries its branch's colour, not the slate fallback.
        tones: [...document.querySelectorAll('.branchGrid .shopCard')]
          .map((c) => c.style.getPropertyValue('--tone')),
        drawn: cv ? cv.width > 0 && cv.height > 0 : false,
      };
    };
    g.debugGiveEnergy(9000);
    m.drawHero(1000);
    const bare = read();

    g.debugBuyAll();
    g.debugGiveEnergy(90000);
    m.drawHero(2000);
    const full = read();
    m.setOpen(false);
    return { bare, full };
  });
  // Not "0 BUILT": the cases above this one have already spent energy on the
  // same page. What is asserted is that the two states are told apart at all,
  // and that the finished one reads as finished.
  const num = (t) => parseInt(t, 10);
  check('the room tells an empty machine from a finished one',
    // 136 since build 232, when SANDBOX went in at one level -- the tree's
    // one node that is not an upgrade to anything, and sits beside RECAST
    // above the four categories for the same reason. It was
    // 135 from build 229, when the rebalance took HOLLOWPOINT from three
    // levels at 1.5 to five at 1.32 -- the same x4.0 arriving four cost-steps
    // further up the ladder, which is what pays for the gentler health slope.
    // It was
    // 133 from build 225, when DOUBLE TAP came out -- the last node in the
    // game that multiplied throughput, and at a flat 1.5 rounds a trigger pull
    // worth more than the whole fire-rate ladder. It was
    // 134 from build 223, when DEEP CHARGE was capped at two levels. It had
    // none, so the tree sold three -- 1.35^3 -- which put a bought BLAST at a
    // 413-unit radius and a KNELL's last toll at 726 on a world about 630
    // units wide. The eighth node caught by `u.levels ?? 3`. It was
    // 135 from build 221, when HEAVE went in at one level -- the WARD's
    // fourth node, and a switch rather than a dial. It was
    // 134 from build 220, when the ammo-and-mine audit capped three more
    // nodes the tree was selling three times: FIFTH LINK to 1 (the round's
    // base is four jumps and the node is named for the fifth), PAIRED CHARGE
    // to 1 (the mine cap evicted what the other two levels laid) and FOURTH
    // BELL to 2 (`CFG.knell.tolls` names the count in its own comment). It
    // was
    // 139 from build 219, when REPULSOR and STANDING ORDER were each capped
    // at two levels -- neither had any, so the tree was selling both three
    // times, which is the `u.levels ?? 3` trap for the second and third time.
    // It was
    // 141 from build 218, when SLIVER went in at two levels. And
    // 139 from build 217: COUNTERSPIN's one level went with SPIRAL, WARD's
    // three nodes brought five (STANDOFF 2, EDGED 2, FORK 1), and BUCKSHOT
    // lost one -- it had no `levels` and the tree was selling it three times.
    // It was
    // 136 from build 216, when SPLINTER went in at two levels. And
    // 134 from build 215: SHOCKFRONT went in at two levels, and SIGHT's
    // three were replaced by PILE's three. And
    // 132 from build 214, when QUICK ARM (one level) was replaced by QUICK
    // LAY (two). It was 131 from build 209, when TRACER and HEAVY each lost a
    // level -- build 212 left it there, BLOOM OUT going 3 levels to 2 exactly
    // paying for SECOND GROWTH. Before that: 133 from build 193, when HOT
    // LOAD went entirely; 134 from 192,
    // when HOT LOAD was capped at one level; 136 from 190, when REFLEX went;
    // 137 from 189, when DOUBLE TAP lost TRIPLE TAP; 138 from 183, when SIEVE
    // gained its second level; 137 from 182 when SIEVE went in; 136 from 178
    // when FEED lost a level; and 137 before that from 169, when SPIRAL
    // gained COUNTERSPIN.
    num(r.bare.count) < num(r.full.count) && num(r.full.count) === 136
    && /TURRET 18\/18/.test(r.full.count) && !/TURRET 18\/18/.test(r.bare.count),
    `${r.bare.count} -> ${r.full.count}`);
  check('every card wears its branch\'s colour, not the slate fallback',
    r.bare.tones.length > 10 && r.bare.tones.every((t) => t && t !== '#9fb3c8'),
    `${r.bare.tones.length} cards; distinct: ${[...new Set(r.bare.tones)].length}`);
  check('the machine is drawn in the menu that upgrades it', r.bare.drawn, JSON.stringify(r.bare.drawn));
}

// --- what a card has to say for itself --------------------------------------
/*
 * Three complaints, one place.
 *
 * A ROUND IS NOT AN UPGRADE TO ONE. HE sat beside OVERPRESSURE in the same
 * colour at the same size, and nothing said one was a new round and the other
 * was forty percent more blast radius. An arm takes the full width and heads
 * everything under it.
 *
 * SUBTITLES. Only BOLT and ALL ROUNDS had a heading, because the label was
 * keyed off having no id rather than off being an arm -- so the three arms
 * the turret is issued with got one and the six you buy did not.
 *
 * NOTHING IS CUT OFF. The card clamps its text, and a stat that runs past the
 * clamp is a sentence that stops mid-word: SNARE read "It never…", which is
 * the exact half the rewrite existed to remove.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const m = g.hud.menu;
    g.debugGiveEnergy(90000);
    m.setOpen(true);
    m.show('tree');
    const out = { arms: [], clipped: [], mods: 0, headed: 0 };
    for (const name of ['AMMUNITION', 'MINES', 'ABILITIES']) {
      // Open, not toggle: an earlier case may have left this branch open,
      // and a click on an open branch shuts it.
      const row = [...document.querySelectorAll('.branchRow')]
        .find((x) => x.querySelector('.branchName').textContent === name);
      if (row.parentElement.classList.contains('shut')) row.click();
      const grid = [...document.querySelectorAll('.branchGrid')].find((x) => x.offsetParent);
      let head = null;
      for (const c of grid.children) {
        if (c.classList.contains('grpLab')) { head = 'group'; continue; }
        if (c.classList.contains('arm')) {
          head = c;
          out.arms.push({
            name: c.querySelector('.shopName').textContent,
            kind: (c.querySelector('.shopKind') || {}).textContent || '',
            spec: (c.querySelector('.shopSpec') || {}).textContent || '',
            wide: getComputedStyle(c).gridColumnStart === '1'
              && getComputedStyle(c).gridColumnEnd.includes('-1'),
          });
          continue;
        }
        out.mods++;
        if (head) out.headed++;
      }
      /*
       * Nothing in the shop is allowed to end in an ellipsis.
       *
       * Every element that owns text, not just the stat: a clamp on the
       * description was only half of it, and a name or a spec that overflowed
       * would elide just as quietly. Checked as "is anything cut off",
       * because that is the thing being forbidden -- an assertion about the
       * clamp value would pass the day someone adds a different one.
       */
      for (const el of document.querySelectorAll('.menuPanel.tree *')) {
        if (!el.offsetParent) continue;
        if (![...el.childNodes].some((x) => x.nodeType === 3 && x.nodeValue.trim())) continue;
        const t = el.textContent.trim();
        if (t.includes('\u2026')) { out.clipped.push(`literal: ${t.slice(-24)}`); continue; }
        if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) continue;
        const cs = getComputedStyle(el);
        if (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') {
          out.clipped.push(`${el.className || el.tagName}: ${t.slice(0, 24)}`);
        }
      }
    }
    m.setOpen(false);
    return out;
  });
  // Nine rounds, eight mines, eight abilities.
  check('every round, mine and ability heads its own group of upgrades',
    r.arms.length === 25 && r.mods > 0 && r.headed === r.mods
    && r.arms.every((a) => /^(NEW )?(ROUND|MINE|ABILITY)$/.test(a.kind)),
    `${r.arms.length} arms, ${r.headed}/${r.mods} mods under one`);
  check('an unlock does not read as an upgrade: full width, and its own numbers',
    r.arms.every((a) => a.wide)
    && r.arms.filter((a) => a.spec).length >= 17,
    JSON.stringify(r.arms.slice(0, 3)));
  check('nothing in the shop ends in an ellipsis',
    r.clipped.length === 0, `cut off: ${r.clipped.slice(0, 6)}`);
}

// --- no two things in a branch wear the same colour --------------------------
/*
 * `tone` is read by hud.js and nothing else, so it is an interface colour --
 * and it was chosen per entry with nothing checking the set. Measured as CIE
 * dE against a dark ground, ARC and RIME were 3.2 apart, BOLT and SPINE 9.1,
 * and STASIS and DECOY 1.0: literally the same colour on two abilities. On a
 * 1px rail at 26% opacity nobody could tell; on a card with a 40px icon they
 * read as the same thing twice.
 */
{
  const r = await page.evaluate(async () => {
    const { ARSENAL } = await import('../src/arsenal.js');
    const { ABILITIES } = await import('../src/abilities.js');
    const lab = (hx) => {
      const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      let X = (r0 * 0.4124 + g0 * 0.3576 + b0 * 0.1805) / 0.95047;
      let Y = r0 * 0.2126 + g0 * 0.7152 + b0 * 0.0722;
      let Z = (r0 * 0.0193 + g0 * 0.1192 + b0 * 0.9505) / 1.08883;
      const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      X = f(X); Y = f(Y); Z = f(Z);
      return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    };
    const dE = (a, b) => { const A = lab(a); const B = lab(b);
      return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
    const sets = {
      rounds: ARSENAL.filter((a) => a.kind === 'round').map((a) => [a.label, a.tone]),
      mines: ARSENAL.filter((a) => a.kind === 'mine').map((a) => [a.label, a.tone]),
      abilities: ABILITIES.map((a) => [a.id, a.color]),
    };
    const out = {};
    for (const [k, list] of Object.entries(sets)) {
      let worst = [1e9, '', ''];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = dE(list[i][1], list[j][1]);
          if (d < worst[0]) worst = [+d.toFixed(1), list[i][0], list[j][0]];
        }
      }
      out[k] = worst;
    }
    return out;
  });
  check('no two rounds, mines or abilities wear the same colour',
    Object.values(r).every((w) => w[0] >= 25), JSON.stringify(r));
}

// --- an arm does not survive the sheet --------------------------------------
/*
 * A press arms a card and a second press spends, because nine hundred energy
 * is most of an early run and a thumb is not precise. It lapses after four
 * seconds for the same reason: an armed card left sitting is a trap for the
 * next tap, which by then is about something else.
 *
 * Closing the sheet and opening it again was exactly that gap with the four
 * seconds still running -- so was changing tab and coming back. Both shipped
 * in 152, and both meant one tap spent.
 */
{
  const r = await page.evaluate(() => {
    const m = window.__sim.hud.menu;
    window.__sim.debugGiveEnergy(9000);
    m.setOpen(true);
    m.show('tree');
    /*
     * A card from a branch, not from the shelf: the cases above this one have
     * already bought the tree out, so the shelf is legitimately empty by the
     * time this runs and querying it returns null.
     */
    const rows = [...document.querySelectorAll('.branchRow')];
    if (rows[1].parentElement.classList.contains('shut')) rows[1].click();
    const card = [...document.querySelectorAll('.branchGrid .shopCard')]
      .find((c) => c.offsetParent && !c.classList.contains('locked'));
    const arm = () => { m.armRow(null); card.click(); };
    arm();
    const armed = !!document.querySelector('.shopCard.armed');
    m.setOpen(false);
    m.setOpen(true);
    const afterClose = !!m.armed;
    arm();
    m.show('system');
    m.show('tree');
    const afterTab = !!m.armed;
    m.setOpen(false);
    return { armed, afterClose, afterTab };
  });
  check('an arm lapses when the sheet closes or the tab changes',
    r.armed && !r.afterClose && !r.afterTab, JSON.stringify(r));
}

// --- the shop implies no order ----------------------------------------------
/*
 * There is no order to this tree. Every branch is open from the first frame,
 * nothing in it is a prerequisite for anything else, and the panel must not
 * suggest otherwise -- so the NEXT shelf and the "N more for the next"
 * countdown are gone. Both answered "what can I buy right now" as a ranking.
 *
 * ORDER. The section is headed YOUR MACHINE and it used to open on ANOMALY,
 * which is a boss door and not the machine. The turret leads. The branch went
 * entirely in build 227 -- see below -- so what is asserted now is that there
 * are FOUR of them and none of them is a door.
 *
 * NO DEAD TRACKS. A repeatable card has no levels, so it gets no meter -- an
 * empty track that can never fill reads as something stuck. And no branch
 * name overflows into its own meter, which is what AMMUNITION did at 92px.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const m = g.hud.menu;
    g.restart();
    g.world.phase = 'staging';
    g.debugGiveEnergy(9000);
    m.setOpen(true);
    m.show('tree');
    m.syncTree();
    const order = [...document.querySelectorAll('.branchRow .branchName')].map((x) => x.textContent);
    const spill = [...document.querySelectorAll('.branchRow .branchName')]
      .filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent);
    const rows = [...document.querySelectorAll('.branchRow')];
    rows.find((x) => x.querySelector('.branchName').textContent === 'TURRET').click();
    const dead = [...document.querySelectorAll('.shopCard')].filter((c) => {
      if (!c.offsetParent) return false;
      const mt = c.querySelector('.shopMeter');
      return mt && !mt.children.length && getComputedStyle(mt).visibility !== 'hidden';
    }).length;
    // Nothing anywhere in the tree sells a way in any more.
    const doors = [...document.querySelectorAll('.shopCard .shopName')]
      .filter((el) => /APERTURE/.test(el.textContent)).length;
    m.setOpen(false);
    return { order, spill, dead, doors,
      shelf: !!document.querySelector('.shelf'), next: !!document.getElementById('treeNext') };
  });
  check('nothing in the shop suggests an order to buy in',
    !r.shelf && !r.next, `shelf ${r.shelf}, next line ${r.next}`);
  check('the machine leads, and no branch sells a way in any more',
    r.order[0] === 'TURRET' && r.order.length === 4
    && !r.order.includes('ANOMALY') && r.doors === 0,
    JSON.stringify({ order: r.order, apertureCards: r.doors }));
  check('...and no name overflows its meter, and no track is dead',
    r.spill.length === 0 && r.dead === 0,
    JSON.stringify({ spill: r.spill, deadTracks: r.dead }));
}

// --- energy is not a small copy of what dropped it ---------------------------
// A mote is built from its parent's type, and the constructor did not check
// isDrop before handing out orbiting plates: a WARDEN's salvage came out as a
// three-bladed pinwheel with the reach of the thing that dropped it, and it
// stopped rounds aimed past it.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;
    const { ENEMY_TYPES } = await import('../src/config.js');
    // break one of everything, so every kind of salvage is on the floor at once
    for (const t of ENEMY_TYPES) {
      const e = g.debugSpawn(t.id, 80 + Math.random() * 460, 400 + Math.random() * 300);
      if (!e) continue;
      e.staged = false; e.spawnIn = 0;
      e.applyDamage(w, 1e9);
    }
    await new Promise((res) => setTimeout(res, 700));
    const bad = w.drops.filter((d) => !d.dead)
      .filter((d) => (d.shards && d.shards.length) || d.hitReach > d.r + 0.01)
      .map((d) => `${d.type.id} r${d.r.toFixed(1)} reach ${d.hitReach.toFixed(1)}`);
    const wardens = w.enemies.filter((e) => !e.dead && e.type.shards && !e.isDrop);
    return { motes: w.drops.filter((d) => !d.dead).length, bad, keptPlates: wardens.every((e) => e.shards) };
  });
  check('no energy mote wears the plating of what dropped it',
    r.bad.length === 0, `${r.motes} motes: ${JSON.stringify(r.bad)}`);
}

// --- auto aim has a reach, and ARRAY is what extends it ----------------------
// Through build 108 `autoTarget` tested bearing and nothing else, so the
// assist held the whole field and no upgrade could sell reach. The base is
// CFG.shooter.aimRange; ARRAY multiplies it 1.45 a level, two levels deep.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const { CFG } = await import('../src/config.js');
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    const clear = () => { for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0; };
    // one hostile straight up the field at `dist`, with ARRAY at `mult`
    const takes = (dist, mult) => {
      clear();
      const e = g.debugSpawn('mote', s.x, s.y - dist);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0;
      w.up.aimRange = mult;
      const got = g.autoTarget() === e;
      clear();
      return got;
    };
    const b = CFG.shooter.aimRange;
    const one = 1.45;
    const two = 1.45 * 1.45;
    const out = {
      base: b,
      near: [takes(b * 0.5, 1), takes(b * 0.5, one), takes(b * 0.5, two)],
      mid: [takes(b * 1.2, 1), takes(b * 1.2, one), takes(b * 1.2, two)],
      far: [takes(b * 1.9, 1), takes(b * 1.9, one), takes(b * 1.9, two)],
      // and the cone still rules: dead abeam, well inside the reach, is not a
      // target -- 90 degrees off straight up, against a clamp of 1.36 + 0.04
      abeam: (() => {
        clear();
        const e = g.debugSpawn('mote', s.x + b * 0.5, s.y);
        if (!e) return null;
        e.staged = false; e.spawnIn = 0;
        w.up.aimRange = two;
        const got = g.autoTarget() === e;
        clear();
        return got;
      })(),
    };
    w.up.aimRange = 1;
    return out;
  });
  const want = { near: [true, true, true], mid: [false, true, true], far: [false, false, true] };
  const wrong = Object.keys(want).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(want[k]));
  check('auto aim reaches exactly as far as ARRAY has paid for',
    wrong.length === 0 && r.abeam === false,
    `base ${r.base}, near/mid/far at x1,x1.45,x2.1 = ${JSON.stringify([r.near, r.mid, r.far])}, abeam ${r.abeam}`);
}

// --- a wave that unlocks mid-rotation joins that rotation --------------------
/*
 * shuffle() read eligibility once, at the top of a cycle, and nothing rejoined
 * until the next one was built. A run is about five cycles and the last was
 * built at around 317 kills, so GLUT (unlock 330) and TOW (380) unlocked into
 * a rotation that had already been decided, and the 500-release allotment ran
 * out before another was. Driven 30 times on build 109: both played 0% of the
 * time. Authored, in the codex, in the debug screen, unreachable in a run.
 *
 * This half is the mechanism, deterministically: build a rotation at zero
 * kills, then cross every threshold and step the director once.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { WAVES, TYPE_BY_ID } = await import('../src/config.js');
    g.restart();
    const w = g.world;
    w.phase = 'staging';
    const d = w.director;
    w.earned = 0;
    d.shuffle(w);           // a rotation decided when almost nothing is unlocked
    const before = d.order.length;
    const missing = WAVES.map((wv, i) => i).filter((i) => !WAVES[i].teach && !d.order.includes(i));
    w.earned = 999999;      // everything is open now, mid-rotation
    d.begin(w);
    const after = d.order.length;
    /*
     * Build 200 taught admit() the band window, so a wave that unlocks
     * mid-rotation joins THIS rotation only if the tier is on its band -- at
     * tier 1 a band-5 wave has no business being played, which is the whole
     * of the fix. What must survive is reachability: it is in the next
     * rotation, not lost for the run. So the two halves are asserted apart.
     */
    const [lo, hi] = d.bandsFor(d.tier);
    const inBand = missing.filter((i) => { const b = WAVES[i].band || 1; return b >= lo && b <= hi; });
    const stillMissing = inBand.filter((i) => !d.order.includes(i));
    // Measured HERE, before the rebuild below moves the playhead: the claim is
    // about what the splice did, not about what a fresh rotation looks like.
    const aheadNow = missing.filter((i) => { const k = d.order.indexOf(i); return k >= 0 && k < d.at; });
    d.at = d.order.length;  // spend the rotation
    d.begin(w);             // ...which rebuilds it
    const unreachable = missing.filter((i) => {
      const b = WAVES[i].band || 1;
      return b >= lo && b <= hi && !d.order.includes(i);
    });
    // ...and nothing already played is replayed by the splice. `<`, not `<=`:
    // begin() admits and then steps forward, so a wave spliced at the very
    // next slot lands exactly on the playhead and is played immediately,
    // which is the point of admitting it.
    return { before, after, wanted: missing.length, inBand: inBand.length,
             stillMissing: stillMissing.length, behindPlayhead: aheadNow.length,
             unreachable: unreachable.length, window: [lo, hi],
             names: stillMissing.map((i) => JSON.stringify(WAVES[i].of)) };
  });
  check('a wave that unlocks mid-rotation joins the rotation it unlocked during',
    r.wanted > 0 && r.stillMissing === 0 && r.behindPlayhead === 0,
    `rotation ${r.before} -> ${r.after}, ${r.wanted} newly eligible and ${r.inBand} of them `
    + `in band ${r.window[0]}-${r.window[1]}, ${r.stillMissing} still absent`
    + `${r.names.length ? ` (${r.names.join(' ')})` : ''}, ${r.behindPlayhead} spliced behind the playhead`);
  check('...and one that unlocks out of band is in the next rotation, not lost',
    r.unreachable === 0, `${r.unreachable} newly eligible waves absent after the rebuild too`);
}

// --- ...and every type is actually met in a run ------------------------------
/*
 * The other half, driven: the real Director on a fast clock with the field
 * cleared each step, so the player is a perfect one and the gates land on
 * time. A type met in under half of runs is content most players will never
 * see.
 *
 * Run until the last gate is comfortably passed, rather than to 500 releases.
 * 500 was CFG.killGoal, from when a run ended there; runs have been endless
 * since build 81 and the gates are on banked energy since 180, so a release
 * count is now a bound on the wrong axis entirely. Measured: a perfect player
 * banks 8,827 by 500 releases and 29,270 by 800, so BULWARK (11,000) and TOW
 * (14,000) both sat outside a bound that had nothing to do with them and this
 * case called two live types unreachable.
 */
{
  const RUNS = 12;
  const FLOOR = 0.5;
  const r = await page.evaluate(async (RUNS) => {
    const g = window.__sim;
    const { CFG, WAVES, TYPE_BY_ID } = await import('../src/config.js');
    const seen = {};
    for (let n = 0; n < RUNS; n++) {
      g.restart();
      const w = g.world;
      w.phase = 'staging';
      const d = w.director;
      let guard = 0;
      const played = new Set();
      const realLoad = d.load.bind(d);
      let loads = 0;
      d.load = (world, wave) => { loads++; played.add(WAVES.indexOf(wave)); return realLoad(world, wave); };
      /*
       * Destroyed rather than marked dead. The gates are on banked energy now,
       * and `bank()` only runs inside destroy() -- a perfect player who flips
       * `dead` earns nothing at all and never opens a single type, which is
       * how this case first failed. Bodies first, so what they shed is on the
       * floor to be collected in the same step.
       */
      /*
       * Long enough that the LAST gate to open has had a full rotation of
       * waves to be drawn in.
       *
       * Bounded on earnings alone it was a guess, and both guesses were wrong:
       * 1.2x the last gate reported TOW met a third of the time and 2x reported
       * 42%, neither of which is a statement about TOW. TOW is three of
       * twenty-five waves, so what it needs is not more money but more draws --
       * so the money opens the gate and then a rotation's worth of loads has to
       * go by before the run is called finished.
       */
      const NEED = Math.max(...Object.values(TYPE_BY_ID).map((t) => t.opens || 0));
      let gateAt = -1;
      while ((gateAt < 0 || loads - gateAt < 30) && guard++ < 200000) {
        if (gateAt < 0 && w.earned >= NEED) gateAt = loads;
        d.update(w, 0.7);
        for (const e of [...w.enemies]) if (!e.dead) e.destroy(w);
        w.enemies.length = 0;
        for (const dr of [...w.drops]) if (!dr.dead) dr.destroy(w);
        w.drops.length = 0;
        w.kills = w.released;
      }
      d.load = realLoad;
      for (const i of played) for (const [id] of WAVES[i].of) seen[id] = (seen[id] || 0) + 1;
    }
    const types = [...new Set(WAVES.flatMap((wv) => wv.of.map(([id]) => id)))];
    types.sort((a, b) => (TYPE_BY_ID[a].opens || 0) - (TYPE_BY_ID[b].opens || 0));
    return { runs: RUNS, rate: Object.fromEntries(types.map((t) => [t, (seen[t] || 0) / RUNS])) };
  }, RUNS);
  const thin = Object.entries(r.rate).filter(([, v]) => v < FLOOR);
  check(`every type in the wave table is met in over ${FLOOR * 100}% of runs`,
    thin.length === 0,
    `${thin.length ? `thin: ${thin.map(([t, v]) => `${t} ${Math.round(v * 100)}%`).join(', ')} — ` : ''}`
    + Object.entries(r.rate).map(([t, v]) => `${t} ${Math.round(v * 100)}%`).join(', '));
}

// --- a TOW always brings its MASS --------------------------------------------
// A TOW is the one type that is two bodies on a cable. spawnFormation went
// through spawnOne, which makes a head with no mass and no tether -- harmless
// only while the TOW waves never played, which they now do.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const en = await import('../src/enemies.js');
    const { TYPE_BY_ID } = await import('../src/config.js');
    const clear = () => { for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0; };
    const bare = (label) => {
      const heads = w.enemies.filter((e) => !e.dead && e.type.id === 'tow');
      const loose = heads.filter((e) => !e.tether || !e.tether.other || e.tether.other.dead
        || e.tether.other.type.id !== 'towMass');
      return { label, heads: heads.length,
        masses: w.enemies.filter((e) => !e.dead && e.type.id === 'towMass').length,
        loose: loose.length };
    };
    const out = [];
    clear();
    en.spawnFormation(w, [TYPE_BY_ID.tow], 4);
    out.push(bare('formation'));
    clear();
    en.spawnGroup(w, 'tow', 4);
    out.push(bare('group'));
    clear();
    return out;
  });
  const broken = r.filter((x) => x.loose > 0 || x.masses !== x.heads);
  check('a TOW is never put on the field without its MASS',
    broken.length === 0, JSON.stringify(r));
}

// --- a body under sustained fire still closes on the turret ------------------
/*
 * Knockback stacked without limit along the line of fire. Measured on build
 * 110, one invulnerable MOTE under auto fire on a direct route: it closed to
 * 400 units, was blown out to 1306 -- past the top of the field -- and was
 * still out there twenty seconds later. A LURCHER held station between 330
 * and 560 for a whole run and never arrived. Repeated hits now give
 * diminishing shove; the first one after a quiet moment is untouched.
 *
 * The claim is about TIME, so this is measured in time: being shot at may
 * make a body take longer to arrive, it may not stop it arriving.
 *
 * It used to be measured in distance -- how far the body closed under fire as
 * a share of how far it closed in silence -- plus one absolute window of 26
 * seconds it had to arrive inside. Both were wrong in the same way. The share
 * says nothing once the body arrives in both trials, and the window was set
 * near the truth rather than clear of it: measured, a LURCHER crosses in
 * 16.0-17.2s with the turret silent and 17.3-22.1s under fire, so 26 gave the
 * worst honest run 1.2x of margin, and the case failed about one run in ten
 * for no reason but the weather. It was reported twice as intermittent before
 * anyone measured what it was actually asking for.
 *
 * Each body sets its own budget from its own quiet crossing now, which is
 * both generous and immune to the next balance pass: a BULWARK takes 46-58s
 * to cross with nobody shooting at it, and no one fixed number was ever going
 * to suit it and a LURCHER at once.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const S = w.shooter;
    /*
     * From a known machine. The fire trial's knockback is whatever the turret
     * has been bought, and this case never set it -- so an upgrade left on by
     * an earlier case (HEAVY doubles knockback) would land on the fire run and
     * not on the quiet one it is compared against.
     */
    g.restart();
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    const clear = () => { for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
                          for (const d of [...w.drops]) d.dead = true; w.drops.length = 0; };
    // Generous enough that a body which is merely slow is not recorded as one
    // that never came. A BULWARK needs about fifty.
    const CAP = 90;
    // ...and how much longer than its own quiet crossing being shot at may
    // cost it. Measured, fire costs a LURCHER 15% and a BULWARK 12%.
    const SLOW = 3;
    const trial = (type, fire, secs) => {
      clear();
      w.autoAim = fire; w.autoFire = fire;
      const e = g.debugSpawn(type, S.x + 40, 180);
      e.staged = false; e.spawnIn = 0;
      e.route = { id: 'direct', width: 0, weave: 0, commit: 1 };
      e.hp = 1e9; e.maxHp = 1e9; // it is here to be pushed, not killed
      const start = Math.hypot(e.x - S.x, e.y - S.y);
      let far = start;
      let arrived = null;
      for (let s = 0; s < secs * 30; s++) {
        g.update(1 / 30);
        const d = Math.hypot(e.x - S.x, e.y - S.y);
        far = Math.max(far, d);
        if (d < 90) { arrived = +(s / 30).toFixed(1); break; }
      }
      const end = arrived === null ? Math.hypot(e.x - S.x, e.y - S.y) : 90;
      clear();
      return { arrived, start: Math.round(start), far: Math.round(far), end: Math.round(end) };
    };
    const out = {};
    for (const type of ['lurcher', 'bulwark']) {
      const quiet = trial(type, false, CAP);
      // Its own crossing, times what fire is allowed to cost it.
      const budget = quiet.arrived === null ? CAP : Math.min(CAP, quiet.arrived * SLOW + 5);
      const fire = trial(type, true, budget);
      out[type] = { quiet, fire, budget: +budget.toFixed(1) };
    }
    w.autoAim = false; w.autoFire = false;
    g.restart();
    return out;
  });
  const ok = Object.values(r).every((o) => o.quiet.arrived !== null
    // It arrives, inside a budget set by its own unhindered crossing...
    && o.fire.arrived !== null
    // ...and it is never shoved further out than it started.
    && o.fire.far < o.quiet.start * 1.2);
  check('a body under sustained fire still closes on the turret', ok,
    Object.entries(r).map(([k, o]) => `${k} crosses in ${o.quiet.arrived}s quiet, `
      + `${o.fire.arrived ?? `NEVER (${o.fire.end} out)`} under fire against a `
      + `${o.budget}s budget, pushed out to ${o.fire.far} of ${o.quiet.start}`)
      .join(' | '));
}

// --- ...and SLUG's shove is bounded by the body it hits ----------------------
/*
 * `integrate` clips an unthrown body to `(cruise || 60) * maxSpeedFactor` --
 * 137 u/s against a BULWARK -- and only a deliberate one-press clear is
 * exempt, by passing `throwOff`. So SLUG's 1500 impulse, and SLEDGE's ladder
 * and HEAVY's on top of it, all multiply a number the physics then discards:
 * measured, a stock SLUG moves a BULWARK 36 units and a fully bought one 364,
 * where the raw arithmetic says thousands.
 *
 * That reads like a defect and build 220's audit reported it as one. It is
 * not. The ceiling is what makes the case ABOVE this one true. Lifting it for
 * SLUG -- keeping the repeated-hit fade, lifting only the ceiling -- was tried
 * and measured, and a LURCHER under sustained SLUG with two HEAVYs went out to
 * 1293 units of an 817-unit field and never came back. That is build 110
 * verbatim: "it closed to 400 units, was blown out to 1306, and was still out
 * there twenty seconds later."
 *
 * So this pins the ceiling rather than a change. The next reader to follow the
 * same arithmetic gets a red test instead of shipping build 110 again.
 *
 * KNOWN AND NOT ASSERTED: an unkillable body under sustained SLUG with HEAVY
 * bought does not arrive on the shipped build either, ceiling and all -- the
 * cap bounds each shove and the CADENCE defeats it, since a LURCHER closing at
 * 36 u/s cannot make back 216 u/s of outward every two thirds of a second.
 * Nothing in normal play is both unkillable and mobile (SLUG lands 66 damage a
 * second and a boss's frame is `fixed`), so what that describes is kiting
 * rather than the build-110 lock. It is left alone deliberately; if a future
 * change puts something unkillable and mobile on the field, this is the note
 * to come back to.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const S = w.shooter;
    g.restart();
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    g.debugClearField();
    g.debugGiveEnergy(200000);
    const bought = { heavy: 0, sledge: 0 };
    for (let i = 0; i < 6; i++) {
      if (g.buy('heavy') === 'ok') bought.heavy++;
      if (g.buy('sledge') === 'ok') bought.sledge++;
    }
    g.toggleRound('slug');
    const rows = [];
    for (const type of ['lurcher', 'bulwark']) {
      g.debugClearField();
      const e = g.debugSpawn(type, S.x, S.y - 260);
      if (!e) continue;
      e.staged = false; e.spawnIn = 0;
      e.hp = 1e9; e.maxHp = 1e9;
      w.autoAim = true; w.autoFire = true;
      /*
       * Measured as DISPLACEMENT over the frame, not as the velocity left on
       * the body afterwards. The impulse lands during the projectile sweep,
       * which runs after physics, so reading `vx,vy` at the end of a frame
       * reports a number that is clamped before it is ever travelled at --
       * the first version of this saw 87,643 u/s against a cap of 627 and
       * concluded the cap did nothing.
       */
      let peak = 0;
      let px = e.x;
      let py = e.y;
      for (let f = 0; f < 60 * 3; f++) {
        e.hp = 1e9;
        g.update(1 / 60);
        peak = Math.max(peak, Math.hypot(e.x - px, e.y - py) * 60);
        px = e.x;
        py = e.y;
      }
      rows.push({
        type, cruise: Math.round(e.cruise || 0),
        cap: Math.round((e.cruise || 60) * CFG.physics.maxSpeedFactor),
        peak: Math.round(peak), thrownCap: CFG.physics.thrownSpeed,
      });
    }
    w.autoAim = false; w.autoFire = false;
    g.restart();
    return { rows, bought };
  });
  // Headroom, because a substep can commit a little more than the clamp on the
  // frame the excess arrives, and the arena's own edge push adds to it.
  const ok = r.rows.length === 2 && r.rows.every((x) => x.peak <= x.cap * 1.3)
    && r.rows.every((x) => x.cap < x.thrownCap);
  check('SLUG-s shove is bounded by what it hits, and a throw-s ceiling is higher',
    ok,
    `HEAVY x${r.bought.heavy} | ` + r.rows.map((x) => `${x.type} cruise ${x.cruise}, `
      + `travelled at most ${x.peak} u/s against a ceiling of ${x.cap} `
      + `(a throw would be ${x.thrownCap})`).join(' | '));
}

// --- the late wall is answerable by the arsenal, if not by BOLT --------------
/*
 * The plateau is intentional, and this is what makes that safe to say.
 *
 * Past tier 8 the tree stops selling BOLT damage. scripts/tiers.mjs measures
 * BOLT, so its dps column is flat at 717 from tier 7 with 15,000 spent and
 * still 717 at tier 20 with 114,150 -- and its `clear` column goes over the
 * cap at the top of the ladder. Read as "the ladder has an unanswerable
 * wall", that would be a reason to cap the health slope.
 *
 * It is not what it means. What the tree sells after tier 8 is the arsenal:
 * eight more rounds, eight mines, six abilities. Measured at tier 20 with the
 * whole tree bought, against the same band-5 wave, one round at a time:
 *
 *   SPORE 64s · HE 109s · SCATTER 159s · BOLT 160s · TITHE 166s
 *   ARC, SPINE, SLUG and RIME did not clear inside 180s
 *
 * SPORE answers in a quarter of the time BOLT needs. The wall is a BOLT wall,
 * which is the design working rather than failing -- so nothing is capped,
 * and this case is what stops that decision rotting. It does not name a
 * round: it asserts that SOMETHING in the rack still answers the top of the
 * ladder, so a balance pass that flattened the whole arsenal would be caught
 * even if it left BOLT exactly where it is.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const A = await import('../src/arsenal.js');
    const g = window.__sim;
    const w = g.world;
    const S = 1 / 60;
    /*
     * Representative of band 5 rather than derived from the authored table:
     * the point is a great deal of late health on the field at once, and a
     * case that recomputed "the heaviest wave" would be re-implementing
     * tiers.mjs to assert something coarser than either.
     */
    const WAVE = [['bulwark', 3], ['tow', 2], ['warden', 3], ['scion', 2]];
    /*
     * 160 from build 217, up from 120, and the change is to the MARGIN rather
     * than to what is claimed.
     *
     * The claim is "something in the rack can still clear the top of the
     * ladder", and the cap is only there to bound the runtime of a build
     * where nothing can. At 120 it was inside the answer instead of outside
     * it: measured across runs, HE and SCATTER came back with ONE body left
     * of about thirty on some passes and a clean sweep on others, so the case
     * went red about one run in three on a build that was demonstrably fine.
     * The loop exits the instant the field is clear, so a higher cap costs
     * nothing on a healthy build and only lengthens the failing case.
     */
    const CAP = 160;
    // Best first, measured: the case stops at the first round that answers,
    // so an intact arsenal costs one trial and a broken one costs nine.
    const ORDER = ['spore', 'explosive', 'shotgun', 'standard', 'tithe',
      'arc', 'spine', 'slug', 'rime'];
    const known = new Set(A.ARSENAL.filter((x) => x.kind === 'round').map((x) => x.key));
    /*
     * Captured once and put back at the end. `reset()` keeps the same
     * Director object, so a stub left on it outlives every restart after it
     * and starves every later case of waves -- which is exactly what the
     * first version of this case did to the four ladder cases below it.
     */
    const ranD = w.director.update;

    const trial = (round) => {
      g.restart();
      g.debugTeachAll();
      w.director.update = () => {};
      w.director.timer = 1e9; w.director.driftTimer = 1e9;
      g.debugGiveEnergy(400000);
      g.debugBuyAll();
      w.director.setTier(20);
      for (const e of [...w.enemies]) e.dead = true;
      w.enemies.length = 0;
      w.round = round;
      w.autoAim = false; w.autoFire = false;
      const swell = w.director.scaleAt(w.director.tier).pop * CFG.waves.population;
      for (const [id, base] of WAVE) {
        g.debugSpawnGroup(id, Math.max(1, Math.round(base * swell)), {});
      }
      for (let i = 0; i < 60 * 20 && w.enemies.some((e) => e.staged || e.spawnIn > 0); i++) g.update(S);
      let hp = 0;
      for (const e of w.enemies) if (!e.harmless) hp += e.maxHp || 0;
      w.autoAim = true; w.autoFire = true;
      g.fireTimer = 0;
      const live = () => w.enemies.filter((e) => !e.dead && !e.harmless).length;
      let t = 0;
      while (t < CAP && live() > 0) { g.update(S); t += S; }
      return { round, secs: +t.toFixed(1), left: live(), hp: Math.round(hp) };
    };

    const tried = [];
    let answered = null;
    for (const round of ORDER) {
      if (!known.has(round)) continue;
      const one = trial(round);
      tried.push(one);
      if (one.left === 0) { answered = one; break; }
    }
    // ...and BOLT's own number, for the record, if the sweep stopped early.
    const bolt = tried.find((x) => x.round === 'standard') || null;
    w.director.update = ranD;
    g.restart();
    return { answered, tried, bolt, rounds: known.size };
  });

  check('something in the rack still answers the top of the ladder',
    !!r.answered && r.answered.left === 0,
    r.answered
      ? `${r.answered.round.toUpperCase()} clears ${r.answered.hp.toLocaleString()} of `
        + `band-5 health at tier 20 in ${r.answered.secs}s`
        + `${r.tried.length > 1 ? ` (after ${r.tried.length - 1} that did not)` : ''}`
      : `none of ${r.rounds} rounds cleared it: `
        + r.tried.map((x) => `${x.round} left ${x.left}`).join(', '));
}

// --- a NEEDLE leads with its point -------------------------------------------
// It is the fastest thing on the field and used to tumble, which told you
// nothing about where it was going. The art is drawn along -y, so the angle it
// wants is the travel bearing plus a quarter turn.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    const out = [];
    for (const h of [-Math.PI / 2, 0, Math.PI / 2, 2.4]) {
      const e = g.debugSpawn('needle', w.shooter.x, 300);
      e.staged = false; e.spawnIn = 0;
      e.vx = Math.cos(h) * 140; e.vy = Math.sin(h) * 140;
      for (let k = 0; k < 90; k++) e.face(1 / 60);
      const want = h + Math.PI / 2;
      let d = e.angle - want;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      out.push(+Math.abs(d).toFixed(3));
      e.dead = true;
    }
    w.enemies.length = 0;
    // ...and something that does not lead with a point is left alone
    const m = g.debugSpawn('mote', w.shooter.x, 300);
    m.staged = false; m.spawnIn = 0; m.vx = 140; m.vy = 0;
    const before = m.angle;
    for (let k = 0; k < 90; k++) m.face(1 / 60);
    const moteMoved = Math.abs(m.angle - before) > 1e-9;
    m.dead = true; w.enemies.length = 0;
    return { off: out, moteMoved };
  });
  check('a NEEDLE turns to lead with its point',
    r.off.every((d) => d < 0.05) && !r.moteMoved,
    `radians off heading: ${r.off.join(', ')}${r.moteMoved ? ' — and a MOTE was rotated too' : ''}`);
}

// --- a TOW throws its MASS, and the hit lands as corruption -------------------
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const S = w.shooter;
    const en = await import('../src/enemies.js');
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    /*
     * A clean field, and nothing left running over it: an earlier case in this
     * file can leave a WELL or a STASIS up, and either of them will drag a
     * thrown MASS off the turret it was aimed at.
     *
     * The list was half of one, and the missing half made this case fail about
     * one run in three. Everything below the effects is a BODY IN THE
     * BROADPHASE that an earlier case put there -- wreckage, uncollected
     * salvage, a round still in flight -- and the load crosses 620 units a
     * second through whatever is in the way. `up` goes back to stock for the
     * same reason: a hundred cases run before this one and several of them buy
     * the tree, and none of what they bought is meant to be part of the
     * question.
     */
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    w.autoAim = false; w.autoFire = false;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const e of w.effects) e.dead = true; w.effects.length = 0;
    for (const d of w.drops) d.dead = true; w.drops.length = 0;
    w.debris.length = 0;
    w.projectiles.length = 0;
    w.mines.length = 0;
    w.up = (await import('../src/upgrades.js')).freshUpgrades();
    w.stasis = 0;
    w.timeScale = 1;
    w.attackers.clear();
    w.shock = 0;
    const made = en.spawnGroup(w, 'tow', 1, { where: 'field', x: S.x + 30, y: 700 });
    const head = made.find((e) => e.type.id === 'tow');
    const mass = made.find((e) => e.type.id === 'towMass');
    head.staged = false; head.spawnIn = 0; mass.staged = false; mass.spawnIn = 0;
    let released = null; let peak = 0; let landed = null;
    let minD = 1e9; let wasAttacking = false; let liveMines = 0; let liveFx = 0;
    for (let s = 0; s < 1500; s++) {
      g.update(1 / 60);
      peak = Math.max(peak, w.shock);
      if (released === null && !head.tether) {
        released = { speed: Math.round(Math.hypot(mass.vx, mass.vy)), thrown: mass.thrown > 0, hurled: !!mass.hurled };
      }
      if (released) {
        minD = Math.min(minD, Math.hypot(mass.x - S.x, mass.y - S.y));
        if (mass.attacking) wasAttacking = true;
        liveMines = Math.max(liveMines, w.mines.length);
        liveFx = Math.max(liveFx, w.effects.length);
      }
      /*
       * The landing is read off the corruption spike, not off the MASS being
       * a live attacker afterwards: 280hp of armour arriving at 614 can and
       * often does break itself on the turret, so it lands, spikes, and is
       * gone in the same instant. The spike is the event.
       */
      if (released && landed === null && w.shock > 0) {
        landed = { shock: +w.shock.toFixed(2), attackers: w.attackers.size, dead: mass.dead };
        for (let k = 0; k < 60 * 3; k++) g.update(1 / 60); // and it has to clear
        landed.after = +w.shock.toFixed(2);
        break;
      }
    }
    const H = TYPE_BY_ID.tow.hurl;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.shock = 0; w.attackers.clear();
    return { released, landed, peak: +peak.toFixed(2), want: H.shock, speed: H.speed,
      minD: Math.round(minD), need: Math.round(mass.r + S.r + 2), wasAttacking,
      massDead: mass.dead, headDead: head.dead, liveMines, liveFx,
      stasis: w.stasis, scale: w.timeScale };
  });
  /*
   * The landing arm of this used to fail about one run in three, and BOTH
   * halves of that were real. The instrument was reading a body moving 10.3
   * units a frame against a two-unit contact tolerance sampled once a frame
   * -- fixed in `Game.checkContact`, which sweeps the step now the way
   * `resolveSegment` has always swept a projectile's. And the case was
   * clearing half the field it said it was clearing. `minD` is reported either
   * way so a future failure says which of the two it is.
   */
  check('a TOW throws its MASS at the turret and the hit spikes corruption',
    !!r.released && r.released.speed >= r.speed * 0.9 && r.released.hurled
    && !!r.landed && r.peak >= r.want * 0.95 && r.landed.after === 0,
    JSON.stringify(r));
}

// --- ORDINAL --------------------------------------------------------------
/*
 * The whole point of the shape: the core is behind two closed frames, and a
 * frame whose segments do not meet is not a frame. On the first build of this
 * fight the segments covered 62% of a side and rounds went straight through --
 * the core was at 99% while the frame was still at 100%.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0; // straight to solid
    const coreAt = bo.core.hp;
    // Everything the turret has, straight up the field, for a good while.
    w.autoAim = true; w.autoFire = true;
    for (let k = 0; k < 8 * 60; k++) g.update(1 / 60);
    const sealedCore = bo.core.hp;
    const outerAfter = bo.shellFrac(0);
    /*
     * ...and with the frames taken out of the way it is reachable. The loose
     * garrison goes too: auto aim takes what is nearest, and a DIGIT between
     * the turret and the core is nearer than the core -- which is correct in
     * the fight and confounding in the measurement.
     */
    for (const ring of bo.rings) for (const p of ring.panels) p.dead = true;
    for (const e of w.enemies) if (e !== bo.core) e.dead = true;
    for (let k = 0; k < 5 * 60; k++) {
      g.update(1 / 60);
      for (const e of w.enemies) if (e !== bo.core && !e.dead) e.dead = true;
    }
    const openCore = bo.core.hp;
    const out = { coreAt, sealedCore, openCore, outerAfter: +outerAfter.toFixed(2),
      panels: bo.rings.reduce((n, x) => n + x.panels.length, 0) };
    if (w.boss) w.boss.clear(w);
    w.boss = null; w.autoAim = false; w.autoFire = false;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    return out;
  });
  // Sealed: the core takes little or nothing while the frame is up, and the
  // frame is visibly being worked on. Open: it takes real damage.
  const leak = (r.coreAt - r.sealedCore) / r.coreAt;
  const through = (r.sealedCore - r.openCore) / r.coreAt;
  check('ORDINAL\'s core is only reachable through a hole in its frame',
    leak < 0.05 && r.outerAfter < 1 && through > 0.05,
    `sealed 8s: core lost ${(leak * 100).toFixed(1)}%, outer frame at ${r.outerAfter}; `
    + `frame removed, 5s: core lost a further ${(through * 100).toFixed(1)}% of ${r.panels} segments`);
}

// --- ...and the fight progresses on the assists alone ------------------------
// It has to be finishable with no manual aiming at all -- the assist shoots
// what is nearest, the frame is what is nearest, and shots through the holes
// are what reach the core.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { freshUpgrades } = await import('../src/upgrades.js');
    g.restart();
    /*
     * Nothing inherited. This case failed about one run in fifteen and passed
     * fourteen of fourteen in isolation, which is the TOW case's disease from
     * build 223 over again: `restart` clears the field but a hundred cases
     * run before this one, and what they leave on the world -- a round, a
     * bought tree, an aim mode, a stubbed director, a time scale -- is not
     * part of the question. Everything the assists' 85 seconds depend on is
     * set here rather than assumed.
     */
    w.phase = 'staging';
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const e of w.effects) e.dead = true; w.effects.length = 0;
    w.drops.length = 0; w.debris.length = 0; w.projectiles.length = 0; w.mines.length = 0;
    w.up = freshUpgrades();
    w.round = 'standard';
    w.aimMode = 'field';
    w.timeScale = 1; w.stasis = 0; w.decoy = null;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    w.autoAim = true; w.autoFire = true;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    const seen = new Set();
    let released = 0;
    const parked0 = bo.parked.length;
    for (let s = 0; s < 85; s++) {
      for (let k = 0; k < 30; k++) g.update(1 / 30);
      seen.add(bo.stage);
      released = Math.max(released, parked0 - bo.parked.length);
      if (!w.boss) break;
    }
    const out = { stages: [...seen], outer: +bo.shellFrac(0).toFixed(2),
      inner: +bo.shellFrac(1).toFixed(2), core: +bo.coreFrac.toFixed(2),
      released, parked0, loose: w.enemies.filter((e) => !e.dead && e.type.id === 'digit').length };
    if (w.boss) w.boss.clear(w);
    w.boss = null; w.autoAim = false; w.autoFire = false;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.timeScale = 1;
    return out;
  });
  /*
   * What this is about is that the assists make progress with nobody aiming,
   * and the evidence for that is the frame coming apart -- not the core.
   *
   * It used to assert the core was under 95% by then, which held while the
   * whole fight was 100 seconds. It is 200 now, with a 14-second arrival in
   * front of it and a fourth stage behind it, so at this point the core is
   * still sealed *and should be*: it cannot be touched until the frames are
   * open, and opening them is the first two stages. Asserting on the core
   * here was asserting on the length of the fight by accident.
   */
  check('ORDINAL can be fought on the assists alone, and its garrison gets out',
    r.stages.includes(2) && r.outer < 0.4 && r.inner < 1 && r.released > 0,
    `85s on auto: stages ${r.stages.join('+')}, outer ${r.outer}, inner ${r.inner}, `
    + `core ${r.core}, ${r.released}/${r.parked0} DIGITs released`);
}

// --- a mended segment is back on the field, not just back alive --------------
/*
 * sweep() takes a dead body out of world.enemies with a swap-and-pop, so
 * clearing `dead` on a segment ORDINAL still holds a reference to resurrected
 * it *outside* the field: it counted toward the shell meter and could not be
 * seen, hit or collided with. Measured on build 112 -- the outer frame climbed
 * from 8% back to 42% through stage III with nothing actually there.
 *
 * The same block checks that a SEED cannot graft ORDINAL. A graft grows and
 * heals its host, and a segment that changes size opens a hole in a frame
 * built to close exactly.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0;
    const ring = bo.rings[0];
    // Take it well under the repair cap so ORDINAL will mend.
    for (const p of ring.panels.slice(0, 20)) p.dead = true;
    g.update(1 / 60); // let sweep run
    const splicedOut = ring.panels.filter((p) => p.dead && !w.enemies.includes(p)).length;
    const mended = bo.repair(w);
    const phantom = ring.panels.filter((p) => !p.dead && !w.enemies.includes(p)).length;

    // ...and a SEED sitting inside it grafts nothing.
    const seed = g.debugSpawn('seed', bo.x + 30, bo.y - 20);
    seed.staged = false; seed.spawnIn = 0;
    for (let k = 0; k < 120; k++) g.update(1 / 60);
    const grafted = ring.panels.filter((p) => p.graftCount).length + (bo.core.graftCount || 0);
    // A loose DIGIT is a legitimate host and often the nearest thing — what
    // must never be one is anything the boss places.
    const host = seed.host && seed.host.type.fixed ? seed.host.type.id : null;

    const out = { splicedOut, mended, phantom, grafted, host };
    w.boss.clear(w); w.boss = null;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.timeScale = 1;
    return out;
  });
  check('a mended segment is back on the field, and ORDINAL cannot be grafted',
    r.splicedOut > 0 && r.mended && r.phantom === 0 && r.grafted === 0 && r.host === null,
    `${r.splicedOut} segments swept out, mended ${r.mended}, ${r.phantom} alive but off the field, `
    + `${r.grafted} grafted${r.host ? `, a SEED took ORDINAL's ${r.host}` : ''}`);
}

// --- a spent APERTURE is not handed back by a reload -------------------------
// The ledger records what was bought, and a restore replays every taken id
// through its `apply` -- APERTURE's hands out one each time. A run that bought
// two and opened one came back holding two.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    g.debugGiveEnergy(5000);
    // Handed rather than bought from build 227. Two of them, because what
    // this is about is that opening one spends one and a reload does not put
    // it back -- and the ledger no longer carries an `aperture` id at all.
    w.offered.length = 0;
    w.apertures[1] = 2;
    const held = w.aperture;
    g.openBoss(); // spends one
    const spent = w.aperture;
    g.checkpoint();
    const { readRun } = await import('../src/save.js');
    const d = readRun();
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    g.resume(); // the real restore path, off the real file
    const back = { held, spent, saved: d ? (d.apertures ? d.apertures[1] | 0 : null) : null,
      restored: w.aperture,
      ledger: w.ledger.filter((x) => x === 'aperture').length };
    g.restart();
    return back;
  });
  check('a spent APERTURE is not handed back by a reload',
    r.held === 2 && r.spent === 1 && r.saved === 1 && r.restored === 1 && r.ledger === 0,
    `held 2, spent 1 -> held ${r.spent}, saved ${r.saved}, restored ${r.restored}; `
    + `the ledger records ${r.ledger} aperture purchases, because there are none`);
}

// --- ORDINAL leaves a REMAINDER, and RECAST is what spends it ---------------
/*
 * The only currency in the game that is not energy: one per ORDINAL, dropped
 * on its death, collected on its own so it cannot be missed, and spendable on
 * exactly one thing. RECAST does nothing yet -- the point of the case is that
 * the purse, the price and the announcement all agree.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    g.debugGiveEnergy(9000);
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0;
    const before = w.remainder;
    const cantYet = g.buy('recast'); // nothing to pay with
    bo.core.dead = true;
    // Run the death and the collection out, on the real clock.
    for (let k = 0; k < 60 * 12 && w.remainder === before; k++) g.update(1 / 60);
    const held = w.remainder;
    /*
     * The announcement, off the screen rather than off the queue: syncHud
     * drains `remainderGained` on the frame it says it, so reading the queue
     * afterwards always finds it empty.
     *
     * And it waits for ORDINAL to stop talking — the REMAINDER lands about
     * four seconds into a death whose outro reads for eleven — so this runs
     * on until the pill is actually up rather than sampling once and hoping.
     */
    const pills = () => [...document.querySelectorAll('#alerts .alert')]
      .map((a) => a.textContent).join(' | ');
    let said = pills();
    for (let k = 0; k < 60 * 20 && !/REMAINDER/.test(said); k++) {
      g.update(1 / 60);
      said = pills();
    }
    const waited = !!w.bossLine;
    const bought = g.buy('recast');
    const spent = w.remainder;
    const again = g.buy('recast');
    // ...and the price is a REMAINDER, not energy.
    const energyAfter = Math.round(w.energy);
    const out = { before, cantYet, held, said, waited, bought, spent, again,
      energyKept: energyAfter >= 9000, boss: !!w.boss };
    g.restart();
    return out;
  });
  check('ORDINAL leaves one REMAINDER, and RECAST is the only thing that spends it',
    r.cantYet === 'poor' && r.held === 1 && /REMAINDER/.test(r.said) && r.bought === 'ok'
    && r.spent === 0 && r.again === 'poor' && r.energyKept,
    `before ${r.before} (buy: ${r.cantYet}), after the death ${r.held} held, `
    + `buy: ${r.bought} -> ${r.spent} held, again: ${r.again}, energy untouched ${r.energyKept}; `
    + `said "${r.said}"`);
}

// --- what ORDINAL leaves behind ---------------------------------------------
/*
 * Two things reported off a real phone, both visible in one screenshot: the
 * boss's salvage sat frozen in a cloud where the frame had been, and the
 * wreckage vanished the instant it died.
 *
 * The salvage froze because a drop is built from the type it fell off, and
 * ORDINAL and TALLY are `fixed` — the guard that pins the frame in place was
 * pinning its energy too, velocity zeroed every frame, no steering, nothing
 * to collect. The wreckage vanished because ordinary debris times out, which
 * is right for a BULWARK mid-wave and wrong for the one object the field is
 * supposed to remember.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { TYPE_BY_ID, CFG } = await import('../src/config.js');
    const { Enemy } = await import('../src/enemies.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;
    w.debris.length = 0;
    const s = w.shooter;

    // ---- salvage off a fixed type has to come to you ----
    const moved = {};
    for (const id of ['ordinal', 'tally', 'mote']) {
      for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;
      const d = new Enemy(TYPE_BY_ID[id], s.x + 120, s.y - 300, { drop: true, r: 4, energy: 5 });
      w.drops.push(d);
      const was = Math.hypot(d.x - s.x, d.y - s.y);
      for (let k = 0; k < 90; k++) g.update(1 / 60);
      moved[id] = Math.round(was - Math.hypot(d.x - s.x, d.y - s.y));
    }
    for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;

    // ---- and the wreck has to still be there afterwards ----
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0;
    bo.core.dead = true;
    for (let k = 0; k < 60 * 8 && w.boss; k++) g.update(1 / 60);
    const justAfter = w.debris.filter((c) => !c.dead && c.keep).length;
    // well past the ordinary lifetime of a chunk
    const wait = Math.ceil(CFG.debris.life * 2 + 4);
    for (let k = 0; k < 60 * wait; k++) g.update(1 / 60);
    const later = w.debris.filter((c) => !c.dead && c.keep).length;
    const out = { moved, justAfter, later, wait, chunkLife: CFG.debris.life };
    g.restart();
    return out;
  });
  /*
   * 45, not 60. What is being asked is "does salvage come to you", and a mote
   * spawned with an outward velocity spends part of the window shedding it --
   * measured, they close between 59 and 155 units in the same second and a
   * half. At 60 the case failed about one run in four on the low end, which is
   * a threshold reporting noise rather than a defect.
   */
  check("ORDINAL's salvage comes to you and its wreck stays where it fell",
    r.moved.ordinal > 45 && r.moved.tally > 45 && r.moved.mote > 45
    && r.justAfter > 20 && r.later >= r.justAfter * 0.9,
    `closed in 1.5s: ${Object.entries(r.moved).map(([k, v]) => `${k} ${v}`).join(', ')} units; `
    + `wreck ${r.justAfter} pieces, still ${r.later} after ${r.wait}s `
    + `(a chunk lives ${r.chunkLife}s)`);
}

// --- a line is said once on this device, not once per run --------------------
/*
 * The whole promise of the per-line record is that a line is said once and
 * never again -- it is why it exists, and why it survived being a single flag.
 * The first-use captions were not using it. They were gated on `autoHinted`,
 * which restart() clears and the save carries, so a player who had been told
 * what BOLT is was told again the next time a run started. For ever. The same
 * for every ability, off a per-run `used` flag on the slot.
 *
 * They go through the same record now. This asks it the way a player meets it:
 * pick the round, restart, pick it again.
 */
{
  const r = await page.evaluate(async () => {
    const { forgetLines, lineSeen } = await import('../src/codex.js');
    const g = window.__sim;
    const w = g.world;
    forgetLines();
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;

    let said = 0;
    const real = g.hud.showHint.bind(g.hud);
    g.hud.showHint = (...a) => { said++; return real(...a); };

    // A round explains itself the first time it is picked.
    g.debugUnlockAll();
    const pick = (k) => { w.round = 'standard'; g.toggleRound(k); };
    pick('shotgun');
    const first = said;

    // ...and not the next run.
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    g.debugUnlockAll();
    said = 0;
    pick('shotgun');
    const again = said;

    // ...and a reset is still a first launch.
    forgetLines();
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    g.debugUnlockAll();
    said = 0;
    pick('shotgun');
    const afterReset = said;

    g.hud.showHint = real;
    const marked = lineSeen('use:shotgun');
    forgetLines();
    g.restart();
    return { first, again, afterReset, marked };
  });
  check('a first-use caption is said once on the device, not once a run',
    r.first === 1 && r.again === 0 && r.afterReset === 1,
    `said on the first pick: ${r.first}; on the same pick a run later: ${r.again}; `
    + `after a reset: ${r.afterReset}`);
}

// --- every part the TURRET branch sells is visible on the turret -------------
/*
 * The branch is named for the parts -- GIMBAL, SPINES, SHROUD, ARRAY, FEED,
 * SIGHT, INTAKE -- so the row you press and the thing that appears are the
 * same word, and a level of one of them that drew nothing would be a purchase
 * with no evidence. There is no way to eyeball seven parts across three levels
 * each on a machine forty units wide, so it is asked of the pixels: render the
 * turret with the part and without it, and require the frames to differ.
 *
 * Rendered to an offscreen canvas at the turret's own scale rather than
 * screenshotting the game, so the test sees the machine and not the sky.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.autoAim = true;
    const s = w.shooter;

    const cv = document.createElement('canvas');
    cv.width = 260;
    cv.height = 260;
    const c2 = cv.getContext('2d', { willReadFrequently: true });

    const { RIG_MAX } = await import('../src/shooter.js');
    // The eight sockets the TURRET branch sells, in tree order.
    const RIG_PARTS = ['rate', 'slew', 'aimrange', 'driftaim', 'pile', 'casing', 'insulation', 'intake'];
    const shot = (rig) => {
      // Force the cache rather than buying: `rig()` keys off the ledger's
      // length, so a stub with a matching count is honoured.
      /*
       * All EIGHT sockets, against RIG_MAX. The stub used to name seven --
       * it silently omitted `driftaim` -- and divide by 17, which stopped
       * being RIG_MAX at build 178. A part missing from this list is a part
       * this case cannot see, which is the one thing it exists to do.
       */
      w.rig = { rate: 0, slew: 0, aimrange: 0, driftaim: 0, pile: 0, casing: 0, insulation: 0, intake: 0, ...rig };
      w.rig.filled = RIG_PARTS.reduce((a, k) => a + w.rig[k], 0) / RIG_MAX;
      w.rigAt = w.ledger.length;
      w.rigFlash = 0;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, 260, 260);
      c2.translate(130 - s.x, 130 - s.y);
      s.draw(c2, w);
      const d = c2.getImageData(0, 0, 260, 260).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2] + d[i + 3];
      return sum;
    };

    const bare = shot({});
    const parts = RIG_PARTS;
    const out = { bare, shows: [], quiet: [] };
    for (const id of parts) {
      const one = shot({ [id]: 1 });
      (Math.abs(one - bare) > 500 ? out.shows : out.quiet).push(id);
    }
    // ...and a second level of the same part has to add something too, or the
    // levels above the first are numbers on a card.
    out.deeper = [];
    for (const id of ['slew', 'casing', 'insulation', 'pile']) {
      const a = shot({ [id]: 1 });
      const b = shot({ [id]: 3 });
      if (Math.abs(b - a) > 500) out.deeper.push(id);
    }
    // ...and the whole branch together is not the same picture as any of it.
    out.full = shot({ rate: 2, slew: 3, aimrange: 2, driftaim: 1, pile: 3, casing: 3, insulation: 3, intake: 1 });
    w.rig = null;
    g.restart();
    return out;
  });
  check('every part the TURRET branch sells shows up on the turret',
    r.quiet.length === 0 && r.shows.length === 8,
    `drew something: ${r.shows.join(', ') || 'none'}`
    + `${r.quiet.length ? `; drew NOTHING: ${r.quiet.join(', ')}` : ''}`);
  check('...and so does every level of it above the first',
    r.deeper.length === 4 && Math.abs(r.full - r.bare) > 5000,
    `levels 1 -> 3 changed the machine for ${r.deeper.join(', ') || 'nothing'}; `
    + `bare against fully rigged: ${Math.round(Math.abs(r.full - r.bare) / 1000)}k`);
}

// --- the cadence ceiling is where plan B put it ------------------------------
/*
 * Two numbers hold the top of the turret's rate of fire down, and both were
 * moved in build 178: FEED has one level instead of two, and a tap fades to
 * half instead of three fifths.
 *
 * They are asserted together and against the gun rather than against the
 * table, because that is where they could come apart. Either could be put back
 * by a hand that only read the other -- the tree could grow a second FEED
 * without anyone touching tapFade, or tapFade could drift back to 0.6 and
 * leave the tree alone -- and neither shows up anywhere on screen. What is
 * checked is the thing plan B is actually about: how many rounds a fully fed
 * turret puts out a second, and what the tail of one trigger pull is worth.
 *
 * Rounds are counted at the muzzle. `shoot()` returns false when it cannot
 * fire, so a call is not a round -- the same mistake scripts/variance.mjs made
 * and published a finding on.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { NODE_BY_ID } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    /*
     * The director is silenced so nothing arrives mid-count, and put back
     * before this case returns. `reset()` clears the world's arrays but keeps
     * the same Director object, so a patch left on it outlives every restart
     * after it -- which is how this case, on its first run, quietly stopped
     * the four ladder cases below from ever seeing a wave.
     */
    const ran = w.director.update;
    w.director.update = () => {};
    for (const e of [...w.enemies]) e.dead = true;
    w.enemies.length = 0;
    w.projectiles.length = 0;

    const feed = NODE_BY_ID.get('rate').levels;
    /*
     * ...and nothing else. DOUBLE TAP came out in build 225 -- it was the last
     * node in the game that multiplied throughput, and at a flat 1.5 rounds a
     * pull it was worth more than the entire fire-rate ladder. Asserted as the
     * ABSENCE of any such node rather than as its level count, so a
     * replacement arriving under a different name is caught too.
     */
    const tapNodes = [...NODE_BY_ID.keys()].filter((k) => /tap$/.test(k));

    // Everything, then fire at nothing for four seconds and count the muzzle.
    g.debugGiveEnergy(200000);
    g.debugBuyAll();
    g.toggleRound('spine');
    w.autoAim = false;
    w.autoFire = true;
    g.fireTimer = 0;
    let rounds = 0;
    const push = w.projectiles.push.bind(w.projectiles);
    w.projectiles.push = (...ps) => { rounds += ps.length; return push(...ps); };
    for (let i = 0; i < 4 * 60; i++) g.update(1 / 60);
    w.projectiles.push = push;
    w.director.update = ran;

    // What the interval is, straight off the same arithmetic updateFiring does.
    const interval = CFG.shooter.gripFireInterval * CFG.rounds.spine.rate * w.up.rate;
    return {
      feed, tapNodes, rate: w.up.rate, round: w.round,
      rps: rounds / 4, pulls: 1 / interval,
    };
  });
  /*
   * What is left of the cadence ladder, in one number.
   *
   * `up.rate` is the product of every fire-rate upgrade a fully bought turret
   * holds, and from build 193 there is exactly one of those: FEED, at 0.9.
   * HOT LOAD was the other, and it was worth more than FEED ever was -- three
   * levels on the tree's default of `u.levels ?? 3`, 0.85 cubed. Asserting
   * the product rather than the nodes is what catches a new one arriving, or
   * an old one quietly taking a default back.
   */
  check('the whole cadence tree is one FEED, and it is worth a tenth',
    r.feed === 1 && r.tapNodes.length === 0 && Math.abs(r.rate - 0.9) < 1e-9,
    `FEED x${r.feed} and no tap node left (${r.tapNodes.join(' ') || 'none'}); `
    + `everything bought leaves the interval at x${r.rate.toFixed(4)}`);
  /*
   * Measured on SPINE from build 209, because that is where DOUBLE TAP went
   * and there is no tap to count anywhere else. SPINE's own `rate` is 1.45
   * against BOLT's 1, so the pull figure is lower by exactly that and none of
   * the cadence ladder has moved: `up.rate` is round-agnostic and is asserted
   * on its own above.
   *
   * 2.7 pulls a second: 0.286 base, SPINE's 1.45, and one FEED at 0.9. The
   * rounds figure is that times ONE dart a pull -- DOUBLE TAP came out in
   * build 225 and it was the second -- times SALVO's every-eighth, which is
   * genuinely noisy over a four-second window since how many every-eighths
   * land in it is a matter of phase. Measured 3.3; the window is set clear of
   * that rather than against it, the same span the two-dart version carried.
   * The point of the window is unchanged -- it notices a fire-rate upgrade
   * arriving or an old one taking a default back, and it is derived from
   * `up.rate` either way.
   */
  check('a fully fed turret tops out where the cadence passes left it',
    r.round === 'spine' && r.pulls > 2.5 && r.pulls < 2.9 && r.rps > 2.6 && r.rps < 4.6,
    `${r.pulls.toFixed(1)} pulls/s, ${r.rps.toFixed(1)} rounds/s`);
}

// --- the unlock clock runs on what a run has earned, not on what it killed --
/*
 * Object types used to be gated on the kill count, which measures how much you
 * have shot rather than how far you have got: ten minutes of farming MOTEs
 * opened a BULWARK there was no turret for. They are on `world.earned` now --
 * lifetime energy banked, which only ever goes up and is unaffected by
 * spending, so the tree, the tiers and the types all read one clock.
 *
 * Three things could each break it silently. The counter could stop being fed,
 * because `bank()` is the only place energy enters and nothing on screen shows
 * a lifetime total. Spending could take it back down, which would re-lock types
 * a player already has. And a save from before it existed could come back with
 * nothing, taking TOW off a run that had been fighting them all evening.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    const { captureRun } = await import('../src/save.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const d = () => w.director;

    // ---- it is fed, and spending does not take it back ----
    const from = w.earned;
    const wave = { of: [['mote', 3]] };
    // Kill something rather than crediting the field: bank() is the seam, and
    // a test that writes w.earned itself would pass with the seam cut.
    w.enemies.length = 0;
    const e = g.debugSpawn('bloom');
    e.spawnIn = 0; e.staged = false;
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    e.destroy(w);
    // Destroying a fragment is how it is collected -- see bank(). Done
    // directly rather than through PULSE, because an ability's index in the
    // bar is not a handle this case should depend on.
    for (const dr of [...w.drops]) if (!dr.dead) dr.destroy(w);
    const banked = w.earned - from;
    /*
     * The grant credits `earned` as well as the purse -- see debugGiveEnergy --
     * so the lifetime figure is re-read AFTER it. Comparing against the total
     * from before the grant is what this case did first, and it failed on a
     * counter that was working: 28 banked, 2,000 granted, 2,028 lifetime, and
     * an assertion that had not been told about the second number.
     */
    g.debugGiveEnergy(2000);
    const afterGrant = w.earned;
    const purseBefore = w.energy;
    g.buy('hollowpoint');
    const spent = purseBefore - w.energy;
    const afterSpend = w.earned;

    // ---- the gate reads it ----
    w.earned = 0;
    const towWave = { of: [['tow', 1]] };
    const lockedAtZero = d().eligible(w, towWave);
    w.earned = TYPE_BY_ID.tow.opens;
    const openAtThreshold = d().eligible(w, towWave);
    // ...and it is the earned clock, not the purse.
    w.earned = 0;
    w.energy = 999999;
    const purseDoesNotOpen = d().eligible(w, towWave);
    w.energy = 0;

    // ---- a save that predates the clock ----
    w.earned = 4321;
    w.phase = 'staging';
    const file = captureRun(w, g);
    const wrote = file && file.earned;
    /*
     * The same file with the field stripped, as an old one arrives -- put
     * through localStorage and `resume()`, which is the only path a save ever
     * actually takes. Writing it straight into the world would test a line
     * that no player's save ever reaches.
     */
    const old = { ...file, kills: 240 };
    delete old.earned;
    localStorage.setItem('sim7749-run', JSON.stringify(old));
    localStorage.removeItem('sim7749-run-prev');
    g.resume();
    const migrated = w.earned;
    localStorage.removeItem('sim7749-run');

    g.restart();
    return {
      banked, spent, afterSpend, afterGrant, from,
      lockedAtZero, openAtThreshold, purseDoesNotOpen,
      wrote, migrated, towOpens: TYPE_BY_ID.tow.opens,
    };
  });

  check('killing something feeds the lifetime counter, and buying never drains it',
    r.banked > 0 && r.spent > 0 && r.afterSpend === r.afterGrant,
    `banked ${r.banked.toFixed(0)}, spent ${r.spent}, lifetime still ${r.afterSpend.toFixed(0)}`);

  check('a type is gated on what was earned, not on what is in the purse',
    r.lockedAtZero === false && r.openAtThreshold === true && r.purseDoesNotOpen === false,
    `TOW at 0 earned: ${r.lockedAtZero}, at ${r.towOpens}: ${r.openAtThreshold}, `
    + `with a full purse and nothing earned: ${r.purseDoesNotOpen}`);

  /*
   * 240 kills x 12 is the rate the thresholds were pitched from, so a veteran
   * comes back holding everything they had. Seeding at 0 would have re-locked
   * nine of the ten types on every run open when this shipped.
   */
  check('a save from before the clock is migrated rather than reset',
    r.wrote === 4321 && r.migrated === 2880,
    `wrote ${r.wrote}; a pre-clock save at 240 kills came back at ${r.migrated} earned`);
}

// --- WARD is a shell, not a second PULSE ------------------------------------
/*
 * SPIRAL held this slot until build 217 and two cases held it: one that a
 * reset mid-sweep did not leave the gun switched off (the sweep owned the
 * barrel and only the effect could give it back), and one that the barrel
 * came to rest where it began. Both are gone with the ability, and so are
 * `world.spiral`, `sweepFade` and a round's `spun` flag -- three fields that
 * nothing could set any more.
 *
 * WARD owns nothing. It is a state the field is in, not a thing the turret
 * does, so the gun goes on firing through it and there is no gun to give
 * back.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const P = CFG.ward;
    const out = { r: P.r, life: P.life };

    const press = () => {
      const i = w.abilities.slots.findIndex((x) => x.def.id === 'ward');
      if (i < 0) return false;
      const slot = w.abilities.slots[i];
      slot.charges = Math.max(1, slot.charges); slot.cd = 0;
      g.useAbility(i);
      return true;
    };
    const bare = () => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      w.up = freshUpgrades();
      w.effects.length = 0;
      w.autoAim = false; w.autoFire = false;
    };
    const pin = (id, at) => {
      const e = g.debugSpawn(id, s.x, s.y - at);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0; e.hp = 1e7; e.maxHp = 1e7;
      e.invMass = 0; e.vx = 0; e.vy = 0;
      return e;
    };

    out.inTree = w.abilities.slots.some((x) => x.def.id === 'ward');
    out.gone = w.abilities.slots.some((x) => x.def.id === 'spiral');

    /*
     * ---- the surface cuts what CROSSES it, once a crossing ----
     *
     * A body held still on the line must not be billed every frame: at
     * `cut` apiece, sixty times a second, that is not a wall, it is a
     * blender. A body walked through it must be.
     */
    bare();
    const still = pin('mote', P.r);   // parked exactly on the surface
    press();
    for (let f = 0; f < 60 * 3; f++) { still.x = s.x; still.y = s.y - P.r; g.update(1 / 60); }
    out.parked = Math.round(1e7 - still.hp);

    bare();
    const walker = pin('mote', P.r + 60);
    press();
    let crossings = 0;
    let was = 1e7;
    for (let f = 0; f < 60 * 4; f++) {
      // In and out, slowly, four times.
      const at = P.r + 60 - Math.abs(((f / 40) % 4) - 2) * 70;
      walker.x = s.x; walker.y = s.y - at;
      g.update(1 / 60);
      if (walker.hp < was) { crossings++; was = walker.hp; }
    }
    out.crossings = crossings;
    out.walked = Math.round(1e7 - walker.hp);

    // ---- ...and the arcs take what is inside, including the mount --------
    bare();
    const onMount = pin('lurcher', 8);
    press();
    for (let f = 0; f < 60 * 3; f++) { onMount.x = s.x + 4; onMount.y = s.y - 6; g.update(1 / 60); }
    out.mount = Math.round(1e7 - onMount.hp);

    // ---- it does not take the gun ---------------------------------------
    /*
     * The one thing SPIRAL did that WARD must not. Counted at
     * `projectiles.push`, which is where a round actually becomes one.
     */
    bare();
    pin('mote', 220);
    w.autoAim = true; w.autoFire = true;
    press();
    let rounds = 0;
    const push = w.projectiles.push.bind(w.projectiles);
    w.projectiles.push = (...ps) => { rounds += ps.length; return push(...ps); };
    for (let f = 0; f < 60 * 2; f++) g.update(1 / 60);
    w.projectiles.push = push;
    out.rounds = rounds;
    out.upWhileFiring = w.effects.some((x) => x instanceof Object && x.bolts);

    // ---- and grey stays grey --------------------------------------------
    bare();
    g.debugSpawnDrift();
    for (let f = 0; f < 6; f++) g.update(1 / 60);
    const drift = w.enemies.find((e) => e.harmless && !e.dead);
    if (drift) { drift.hp = drift.maxHp; }
    press();
    for (let f = 0; f < 60 * 3; f++) {
      if (drift) { drift.x = s.x; drift.y = s.y - P.r; drift.vx = 0; drift.vy = 0; }
      g.update(1 / 60);
    }
    out.drift = !drift || drift.hp === drift.maxHp;

    // ---- the three upgrades reach it ------------------------------------
    const reachOf = (id, n) => {
      bare();
      const d = BY_ID.get(id);
      if (!d) return null;
      for (let i = 0; i < n; i++) d.apply(w.up, w);
      press();
      for (let f = 0; f < 12; f++) g.update(1 / 60);
      const ward = w.effects.find((x) => x.bolts);
      return ward ? { r: Math.round(ward.r), cut: Math.round(ward.cut), arcs: ward.arcs } : null;
    };
    out.plainW = reachOf('standoff', 0);
    out.wide = reachOf('standoff', 2);
    out.hard = reachOf('edged', 2);
    out.forked = reachOf('fork', 1);

    bare();
    w.spawnLock = 0;
    w.up = freshUpgrades();
    g.restart();
    return out;
  });

  check('WARD is in the bar and SPIRAL is not',
    r.inTree && !r.gone, `ward ${r.inTree}, spiral ${r.gone}`);

  check('...and its surface cuts what crosses it, once a crossing',
    r.parked > 0 && r.parked < r.walked * 0.8 && r.crossings >= 2,
    `a body parked on the line for three seconds took ${r.parked}; one walked `
    + `through it four times took ${r.walked} over ${r.crossings} separate cuts`);

  check('...and its arcs reach what is on the turret itself',
    r.mount > 0, `a body on the mount took ${r.mount} from three seconds of WARD`);

  check('...and it never takes the gun, which is what SPIRAL did',
    r.rounds > 0, `${r.rounds} rounds left the barrel during two seconds of WARD`);

  check('...and grey stays grey',
    r.drift, `a DRIFT held on the surface for three seconds: untouched ${r.drift}`);

  check('...and STANDOFF, EDGED and FORK all reach the shell',
    r.plainW && r.wide && r.hard && r.forked
    && r.wide.r > r.plainW.r * 1.4 && r.hard.cut > r.plainW.cut * 1.7
    && r.forked.arcs === r.plainW.arcs + 1,
    `radius ${r.plainW && r.plainW.r} -> ${r.wide && r.wide.r}; cut `
    + `${r.plainW && r.plainW.cut} -> ${r.hard && r.hard.cut}; arcs `
    + `${r.plainW && r.plainW.arcs} -> ${r.forked && r.forked.arcs}`);
}

// --- nothing casts an ability for you ---------------------------------------
/*
 * REFLEX fired PULSE the moment two things had hold of the turret. It was a
 * bought upgrade and it read as a bug: a charge spent without being asked is a
 * charge you do not have when you need it, and the ability whose whole job is
 * answering a crowd is the worst one to take that decision away on. It went in
 * build 190 and this is the rule left behind it.
 *
 * Asserted with the whole tree bought, because an automation nobody has paid
 * for is an automation that cannot be caught: the turret here owns every
 * upgrade in the game and two bodies are sitting on its mount, which is every
 * condition anything of that shape would have keyed on.
 *
 * The telling is not the automation and never was, so the button is checked
 * too -- `.ab.urgent` breathes for as long as anything is attached.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const ranD = w.director.update;
    w.director.update = () => {};
    w.enemies.length = 0;
    g.debugGiveEnergy(200000);
    g.debugBuyAll();

    // Two of them, on the mount, which is what REFLEX keyed on.
    const s = w.shooter;
    for (const dx of [4, -6]) {
      const e = g.debugSpawn('lurcher', s.x + dx, s.y - 6);
      e.spawnIn = 0; e.vx = 0; e.vy = 0;
    }
    const mount = () => {
      for (let n = w.attackers.size; n < 2; n++) {
        const e = g.debugSpawn('lurcher', s.x + (n ? -6 : 4), s.y - 6);
        e.spawnIn = 0; e.vx = 0; e.vy = 0;
      }
    };

    /*
     * Counted per frame, from the frame the first body lands, and this took
     * three goes to get right -- each wrong version reported a clean bar
     * through a turret that was firing itself.
     *
     * Hooking Game.useAbility caught nothing and was never shown to catch
     * anything. Diffing charges either side of the window caught nothing
     * either, because a cooldown puts a charge back inside it. And counting
     * per frame but only AFTER letting the bodies settle caught nothing,
     * because the automation fires on the frame they arrive and the window
     * opened onto a PULSE that was already spent -- which is the same class
     * of mistake as the last two: measuring after the event.
     *
     * So the counter starts before anything is on the mount and runs the
     * whole way, and it is proved against a press of its own below.
     */
    let unasked = 0;
    let held = 0;
    let gripped = 0;
    /*
     * The light is sampled INSIDE the loop, on frames where something is
     * actually on the mount, because that is when the claim applies.
     *
     * It was read once at the end, and HARD CASING -- one of the upgrades
     * this case deliberately buys -- kills whatever has hold of the turret,
     * so a run where the mount happened to clear on the last frame reported
     * the button dark and failed. Same disease as the counter below it:
     * looking after the moment instead of during it.
     */
    let litWhenHeld = 0;
    let sampledHeld = 0;
    let seen = w.abilities.slots.map((x) => x.charges);
    const who = [];
    const tick = () => {
      w.abilities.slots.forEach((x, k) => {
        if (x.charges < seen[k]) { unasked += seen[k] - x.charges; who.push(x.def.id); }
        seen[k] = x.charges;
      });
    };
    // Every cooldown in the game clear, so anything of that shape has a use
    // in hand the moment its condition is met.
    for (const x of w.abilities.slots) { x.cd = 0; }
    for (let i = 0; i < 60 * 7; i++) {
      mount();
      g.update(1 / 60);
      tick();
      if (w.attackers.size >= 2) held++;
      gripped = Math.max(gripped, w.attackers.size);
      if (i % 30 === 0 && w.attackers.size > 0) {
        sampledHeld++;
        g.hud.syncAbilities(w.abilities);
        const p = w.abilities.slots.findIndex((x) => x.def.essential);
        if (g.hud.slots[p].el.classList.contains('urgent')) litWhenHeld++;
      }
    }
    /*
     * Closed off before the press below, and this is the fourth version of
     * this counter. The third shared it with the vacuity check and reported
     * one unasked cast on a clean build -- the case catching its own press,
     * traced back to its own line. Every wrong version of this reported
     * something plausible, which is the whole hazard: the instrument has to
     * be shown to be reading what it claims before its zero means anything.
     */
    const auto = unasked;
    const whoAuto = who.slice();

    const pulse = w.abilities.slots.findIndex((x) => x.def.essential);
    const lit = sampledHeld > 0 && litWhenHeld === sampledHeld;

    /*
     * ...and neither the ability nor the counter watching it is asleep. PULSE
     * is pressed on the same counter, so a zero above means "nothing fired"
     * and not "nothing could have been seen firing".
     */
    for (const x of w.abilities.slots) { x.cd = 0; }
    g.update(1 / 60);
    seen = w.abilities.slots.map((x) => x.charges);
    const from = unasked;
    g.useAbility(pulse);
    tick();
    const pressed = unasked - from === 1;

    w.director.update = ranD;
    g.restart();
    return { gripped, held, auto, who: whoAuto, lit, litWhenHeld, sampledHeld,
      pressed, slots: w.abilities.slots.length };
  });

  check('nothing on the bar goes off by itself, and the button says so instead',
    r.gripped >= 2 && r.held > 350 && r.auto === 0 && r.lit && r.pressed,
    `${r.gripped} on the mount and two held for ${r.held} of 420 frames, `
    + `every one of ${r.slots} abilities owned: ${r.auto} charges spent `
    + `unasked over seven seconds${r.who.length ? ` (${r.who.join(', ')})` : ''}; `
    + `PULSE lit on ${r.litWhenHeld}/${r.sampledHeld} of the frames sampled with `
    + `something on the mount, and the same counter sees a press ${r.pressed}`);
}

// --- every control on the play screen answers a real press ------------------
/*
 * Pressed, not called.
 *
 * The AUTO AIM row shipped in build 183 unable to close: the cell only ever
 * opened it, so the one gesture everybody uses to dismiss a menu did nothing,
 * and the whole control read as dead. The case that was supposed to cover it
 * called `setAim()` and `aimPressed()` once each and asserted the state they
 * returned -- which is the logic, not the control. Nothing ever pressed the
 * same button twice, and nothing ever pressed the row's own buttons at all.
 *
 * So this goes through the handlers, on the elements, with the event they are
 * actually bound to. `pointerdown`, because that is what the play screen
 * binds -- a `click` here would test nothing.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const ranD = w.director.update;
    w.director.update = () => {};
    g.debugGiveEnergy(9000);
    g.buy('driftaim');
    g.buy('driftaim');

    const tap = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const cell = () => document.getElementById('tgAutoAim');
    const open = () => g.hud.aimRowOpen();

    // ---- the cell is a toggle ----
    g.hud.openAimRow(false);
    const seq = [];
    for (let i = 0; i < 4; i++) { tap(cell()); seq.push(open() ? 1 : 0); }

    // ---- and every button in the row applies its own mode and closes ----
    const picked = [];
    for (const mode of ['off', 'field', 'drift', 'all']) {
      tap(cell());
      const btn = document.querySelector(`#aimModes .m_${mode}`);
      tap(btn);
      picked.push(`${mode}->${w.autoAim ? w.aimMode : 'off'}${open() ? '!OPEN' : ''}`);
    }

    // ---- reaching past it for another control puts it away ----
    tap(cell());
    tap(document.getElementById('tgAutoFire'));
    const otherCloses = !open();
    tap(cell());
    g.hud.menu.setOpen(true);
    const menuCloses = !open();
    g.hud.menu.setOpen(false);

    /*
     * ...and nothing on the strip or the ability bar throws when pressed. A
     * control that raises is a control that stops the frame it was pressed on.
     */
    const threw = [];
    const onErr = (ev) => threw.push(String(ev.message || ev.reason));
    window.addEventListener('error', onErr);
    for (const el of document.querySelectorAll('#quickBar .qc, #abilities .ab')) {
      try { tap(el); } catch (e) { threw.push(`${el.id || el.className}: ${e.message}`); }
      /*
       * Two of those cells are the config buttons and they open the loadout
       * sheet, which sets `body.loadoutOpen` -- that drops the strip and the
       * ability bar to a quarter opacity and holds the run. Left standing it
       * failed three later cases, one of them the title-screen paint check,
       * which is a fair report of a sheet nobody closed.
       */
      g.closeLoadout();
    }
    window.removeEventListener('error', onErr);
    g.hud.openAimRow(false);
    g.hud.menu.setOpen(false);

    w.director.update = ranD;
    g.restart();
    return { seq: seq.join(''), picked, otherCloses, menuCloses, threw };
  });

  check('the AUTO AIM cell opens the row and closes it again',
    r.seq === '1010', `four presses gave ${r.seq} (1 = open); it shipped as 1111`);

  check('...and every position in the row applies from a press on it',
    JSON.stringify(r.picked) === JSON.stringify(['off->off', 'field->field', 'drift->drift', 'all->all']),
    r.picked.join('  '));

  check('...and reaching past the row for anything else puts it away',
    r.otherCloses && r.menuCloses,
    `another strip control: ${r.otherCloses} · opening the menu: ${r.menuCloses}`);

  check('every control on the strip and the ability bar survives being pressed',
    r.threw.length === 0, r.threw.slice(0, 4).join(' | ') || 'none threw');
}

// --- the top bar fits the numbers in it -------------------------------------
/*
 * `#barChips` is the shrinkable group and its comment has always said so, but
 * nothing inside it could shrink: every chip is `white-space: nowrap`, so the
 * group never absorbed anything, it clipped. Measured across the widths this
 * is played at, with a five-figure purse and the affordable-rows badge up --
 * ordinary mid-run play -- the badge ran 17px past the edge at 390 and 32px at
 * 375, the two commonest iPhone widths. The badge saying how many upgrades you
 * can afford, cut off exactly when you can afford plenty.
 *
 * A media query cannot see the length of a number, so the bar measures itself
 * and drops labels in order of what they are worth. Asserted at every width
 * and every purse size rather than at the one that was noticed, and asserted
 * BOTH ways: a label that never comes back when the purse is spent down is the
 * same bug pointing the other way.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const bar = g.hud.el.barChips;
    const held = { w: window.innerWidth, energy: w.energy };
    const over = [];
    const labels = [];
    // The real widths cannot be changed from in here, so the group is squeezed
    // directly -- which is the same thing as far as the fit is concerned.
    for (const width of [200, 220, 250, 300, 340]) {
      bar.style.maxWidth = `${width}px`;
      for (const [energy, buys] of [[0, 0], [12345, 12], [148000, 85]]) {
        g.hud.setEnergy(energy, 1);
        g.hud.setBuys(buys);
        g.hud.barSig = ''; // the guard is keyed on digits; the width moved too
        g.hud.fitBar();
        if (bar.scrollWidth > bar.clientWidth + 1) {
          over.push(`${width}px/E${energy}: ${bar.scrollWidth - bar.clientWidth}px`);
        }
      }
      // ...and with room again, the words have to come back.
      g.hud.setEnergy(0, 1);
      g.hud.setBuys(0);
      g.hud.barSig = '';
      g.hud.fitBar();
      labels.push(width >= 300 ? bar.className.trim() : 'x');
    }
    bar.style.maxWidth = '';
    g.hud.setEnergy(held.energy, 1);
    g.hud.barSig = '';
    g.hud.fitBar();
    return { over, restored: labels.filter((c) => c === '').length, checked: labels.length };
  });

  check('nothing in the top bar is ever clipped, at any width or purse',
    r.over.length === 0, r.over.length ? r.over.join(', ') : 'clear at every width tried');

  check('...and the labels come back once the purse is spent down',
    r.restored >= 2,
    `${r.restored} of the roomy widths dropped no label with an empty purse`);
}

// --- the assist says where it stops, and what it will take ------------------
/*
 * Three things that are all one idea: the player can see what the assist is
 * doing without being told.
 *
 * The reach arc says where auto aim stops. It went in with the reach itself at
 * build 109 and was lost at 150, in the pass that turned every floating gadget
 * on the turret into structure -- it is not a gadget, it is the only thing on
 * screen that says why a body two thirds up the field was ignored, and without
 * it ARRAY is a number on a card.
 *
 * SIEVE puts a third position on AUTO AIM: DRIFT and nothing else. Asserted at
 * both ends, because the interesting half is what it REFUSES -- an assist that
 * took grey as well as hostiles would just shoot whatever was nearest and make
 * the choice for the player.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    // Put back before this returns. reset() keeps the same Director object, so
    // a patch left on it outlives every restart after it -- which is how this
    // case, on its first run, stopped four ladder cases below from ever seeing
    // a wave.
    const ranD = w.director.update;
    w.director.update = () => {};
    for (const e of [...w.enemies]) e.dead = true;
    w.enemies.length = 0;
    w.drops.length = 0;
    w.debris.length = 0;
    w.effects.length = 0;

    /*
     * ---- the reach arc, by diffing frames ----
     *
     * A colour test is no good here: the arc is a hairline at 0.12 alpha over
     * a lattice that is already blue, so counting blue pixels counts the
     * lattice. Two frames with it off must be identical -- that control is the
     * instrument checking itself -- and the frame with it on must differ.
     */
    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const k = cv.width / w.width;
    const reach = CFG_aimRange(w);
    function CFG_aimRange(world) { return 400 * world.up.aimRange; }
    const row = Math.round((w.shooter.y - reach) * k);
    const grab = () => c2.getImageData(0, Math.max(0, row - 4), cv.width, 9).data;
    const diff = (x, y) => {
      let n = 0;
      for (let i = 0; i < x.length; i += 4) {
        if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1])
          + Math.abs(x[i + 2] - y[i + 2]) > 6) n++;
      }
      return n;
    };
    w.autoAim = false; w.aimDrift = false;
    g.draw(); const off1 = grab();
    g.draw(); const off2 = grab();
    w.autoAim = true;
    g.draw(); const on = grab();
    const noise = diff(off1, off2);
    const moved = diff(off1, on);

    // ---- what positions exist, at each level of SIEVE ----
    const offered = [];
    for (const lvl of [0, 1, 2]) {
      w.up.driftAim = lvl;
      offered.push(g.aimModes().join(','));
    }

    /*
     * ---- the control is a toggle until there is something to choose ----
     *
     * Two positions is a toggle and four is a menu. A list of two costs a tap
     * to say what one tap already said; a blind cycle through four is a
     * control you have to count your way round.
     */
    w.up.driftAim = 0;
    g.setAim('off');
    g.hud.openAimRow(false);
    g.aimPressed();
    const bareOpens = !g.hud.el.aimModes.hidden;
    const bareOn = w.autoAim;
    g.aimPressed();
    const bareOff = !w.autoAim;
    w.up.driftAim = 2;
    g.aimPressed();
    const richOpens = !g.hud.el.aimModes.hidden;
    const listed = [...g.hud.el.aimModes.querySelectorAll('.aimMode')]
      .filter((b) => !b.hidden).map((b) => b.dataset.mode).join(',');
    g.setAim('all');
    const closesOnPick = g.hud.el.aimModes.hidden;

    // ---- ...and what each position will actually pick ----
    w.enemies.length = 0;
    const mote = g.debugSpawn('mote', w.width / 2 - 40, w.shooter.y - 200);
    mote.staged = false; mote.spawnIn = 0;
    g.debugSpawnDrift();
    const drift = w.enemies.find((e) => e.harmless);
    drift.x = w.width / 2 + 40; drift.y = w.shooter.y - 200;
    drift.staged = false; drift.spawnIn = 0;
    const pick = (mode) => { g.setAim(mode); const t = g.autoTarget(); return t && t.type.id; };
    const plain = pick('field');
    const grey = pick('drift');
    // ALL has to be able to reach either, so the nearer one is moved under it.
    const bothA = pick('all');
    drift.x = w.width / 2 + 4;
    const bothB = g.autoTarget() && g.autoTarget().type.id;

    w.director.update = ranD;
    g.restart();
    return {
      noise, moved, row, cvW: cv.width,
      offered, bareOpens, bareOn, bareOff, richOpens, listed, closesOnPick,
      plain, grey, bothA, bothB,
    };
  });

  check('auto aim draws where it stops, and only while it is on',
    r.noise === 0 && r.moved > 40,
    `two frames with it off differ by ${r.noise}px; with it on, ${r.moved}px on row ${r.row} of ${r.cvW}`);

  check('each level of SIEVE adds a position, and neither is free',
    JSON.stringify(r.offered) === JSON.stringify(['off,field', 'off,field,drift', 'off,field,drift,all']),
    r.offered.join('  |  '));

  check('AUTO AIM is a toggle until there is something to choose, then a row',
    r.bareOpens === false && r.bareOn && r.bareOff
    && r.richOpens && r.listed === 'off,field,drift,all' && r.closesOnPick,
    `bare: opens=${r.bareOpens} on=${r.bareOn} off=${r.bareOff}`
    + ` | bought: opens=${r.richOpens} lists=[${r.listed}] closes=${r.closesOnPick}`);

  /*
   * The three positions, at the only place it matters -- what comes back from
   * autoTarget. DRIFT is asserted by what it REFUSES as much as what it takes:
   * an assist that quietly took hostiles too would make the trade for you.
   */
  check('FIELD takes hostiles, DRIFT takes grey, ALL takes whichever is nearer',
    r.plain === 'mote' && r.grey === 'drift' && r.bothA === 'mote' && r.bothB === 'drift',
    `field ${r.plain} · drift ${r.grey} · all ${r.bothA} then ${r.bothB} when grey is nearer`);
}

// --- the mode row is on the screen, or it is not, and a thumb can hit it ----
/*
 * What every case above this one could not see.
 *
 * They press the row's buttons by selector and read `hidden` back off the
 * element, and on all of that the control was perfect: the property flipped,
 * `aimRowOpen()` agreed, the right mode landed. The band stayed on the screen
 * the whole time. `#aimModes { display: grid }` and `.aimMode { display:
 * flex }` are written on an id and a class; `[hidden] { display: none }` is
 * the user agent's, at one class and losing to both -- so closing the row set
 * a property that changed nothing anyone could see, and the four buttons went
 * on painting over the field and taking the taps meant for it. Reported three
 * times as "the menu will not collapse"; passed every time.
 *
 * And what it could not see either: the row was a 104px column wedged between
 * the two stacks with each button 33px tall, which is under every other
 * control on this screen and under what a thumb can reliably land on.
 *
 * So this case asks the three questions a property cannot answer: is it
 * painted, is it big enough, and is it what `elementFromPoint` finds. At this
 * suite's 390, which is the middle of the three the change was measured at --
 * 320 gives the band 73px columns and 414 gives it 97, and every position
 * clears 44px tall and hit-tests to itself at all three.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const ranD = w.director.update;
    w.director.update = () => {};
    g.debugGiveEnergy(9000);
    g.buy('driftaim');
    g.buy('driftaim');
    await new Promise((res) => setTimeout(res, 120));

    const row = document.getElementById('aimModes');
    // Pressed on the element, through the handler, with the event the play
    // screen binds -- and then measured, which is the part that was missing.
    const tap = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const painted = () => row.getBoundingClientRect().height > 0;

    g.hud.openAimRow(false);
    const shutAtStart = !painted();
    tap(document.getElementById('tgAutoAim'));
    const openPaints = painted();

    /*
     * Where the finger lands. A button can be the right size, in the right
     * place, and still be under something: the band spans the whole bar, so
     * its end columns lie over the two stacks, which come later in the DOM.
     * Measured before any of this went in, ALL returned an ammunition cell.
     */
    const seats = [];
    for (const btn of row.querySelectorAll('.aimMode')) {
      if (btn.getBoundingClientRect().height === 0) continue;
      const b = btn.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round((b.left + b.right) / 2),
        Math.round((b.top + b.bottom) / 2));
      seats.push({ mode: btn.dataset.mode, h: Math.round(b.height), w: Math.round(b.width),
        mine: top === btn || btn.contains(top),
        on: b.left >= 0 && b.right <= window.innerWidth
          && b.top >= 0 && b.bottom <= window.innerHeight });
    }
    // 44 is the floor a thumb needs; everything else on this screen clears it.
    const small = seats.filter((s) => s.h < 44).map((s) => `${s.mode} ${s.h}px`);
    const buried = seats.filter((s) => !s.mine || !s.on).map((s) => s.mode);

    /*
     * ...and it is painted over them, not merely hit-tested first.
     *
     * elementFromPoint cannot answer this: it skips anything at
     * `pointer-events: none`, so once the dim disables the stacks the aim
     * button wins the hit test whether it is drawn on top or underneath. The
     * band's stacking order is what keeps the ammunition cell from being
     * drawn over the end of it, and it is a property of the band alone --
     * the two stacks set none, so later-in-the-DOM is all they have.
     */
    const lift = getComputedStyle(row).zIndex;
    const stacks = ['q_mines', 'q_ammo']
      .map((c) => getComputedStyle(document.querySelector(`.${c}`)).zIndex).join(',');

    // ...and pressing the cell again takes it off the screen, not just out of
    // a property.
    tap(document.getElementById('tgAutoAim'));
    const shutAgain = !painted() && !document.body.classList.contains('aimOpen');

    /*
     * A position that has not been paid for is not on the screen either --
     * the same trap one level down, since `.aimMode` sets display too.
     */
    const held = w.up.driftAim;
    w.up.driftAim = 0;
    g.hud.openAimRow(true);
    const bare = [...row.querySelectorAll('.aimMode')]
      .filter((b) => b.getBoundingClientRect().height > 0)
      .map((b) => b.dataset.mode).join(',');
    w.up.driftAim = held;
    g.hud.openAimRow(false);

    /*
     * ...and the two sheets that cover the strip actually stop it being
     * pressed. `#ui button { pointer-events: auto }` carries an id, so the
     * class-built rules that declare the strip out of play could never reach
     * a button: it went to 25% opacity and stayed fully live underneath.
     */
    const pe = () => getComputedStyle(document.getElementById('tgAutoFire')).pointerEvents;
    g.openLoadout('mines');
    const underSheet = pe();
    g.closeLoadout();
    g.hud.menu.setOpen(true);
    const underMenu = pe();
    g.hud.menu.setOpen(false);
    const afterwards = pe();

    w.director.update = ranD;
    g.restart();
    return { shutAtStart, openPaints, seats, small, buried, shutAgain, bare,
      lift, stacks, underSheet, underMenu, afterwards };
  });

  check('the mode row leaves the screen when it closes, not just the property',
    r.shutAtStart && r.openPaints && r.shutAgain,
    `shut at start=${r.shutAtStart}, open paints=${r.openPaints}, shut again=${r.shutAgain}`);

  check('every position it offers is thumb-sized and nothing is on top of it',
    r.seats.length === 4 && !r.small.length && !r.buried.length
    && Number(r.lift) > 0 && r.stacks === 'auto,auto',
    `${r.seats.length} offered, ${r.seats.map((s) => `${s.mode} ${s.w}x${s.h}`).join(' · ')}`
    + `${r.small.length ? ` | under 44px: ${r.small.join(', ')}` : ''}`
    + `${r.buried.length ? ` | buried: ${r.buried.join(', ')}` : ''}`
    + ` | band z-index ${r.lift} over stacks at ${r.stacks}`);

  check('a position that has not been bought is not on the screen',
    r.bare === 'off,field',
    `with no SIEVE the row shows [${r.bare}]`);

  check('a sheet over the strip actually stops the strip being pressed',
    r.underSheet === 'none' && r.underMenu === 'none' && r.afterwards === 'auto',
    `loadout ${r.underSheet} · menu ${r.underMenu} · neither ${r.afterwards}`);
}

// --- a burst of presses loses nothing, and marks nothing it did not say -----
/*
 * Four controls reached as fast as a thumb can reach them.
 *
 * The band used to take whatever arrived and push what was there out of the
 * way, and every line was marked said-on-this-device the moment it was pushed
 * -- so pressing AUTO AIM, AUTO FIRE, PULSE and HAIL in three seconds spent
 * four captions and showed one, and this device would never offer the other
 * three again. That is the whole of "I only saw the tooltips for the first
 * two". They queue now, and the marking moved to the moment of painting.
 */
{
  const r = await page.evaluate(async () => {
    const { lineSeen } = await import('../src/codex.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const ranD = w.director.update;
    w.director.update = () => {};
    g.hud.clearHint();
    /*
     * A fresh device as far as these four lines are concerned -- and only
     * these four. forgetLines() wipes the record for the whole device, which
     * every case after this one reads, so the file is put back byte for byte
     * afterwards.
     */
    const keys = ['use:autoAim', 'use:autoFire', 'use:pulse', 'use:fan'];
    const { forgetLines } = await import('../src/codex.js');
    const heldLines = localStorage.getItem('sim7749-lines');
    forgetLines();
    const heldHinted = g.autoHinted;
    const heldTeaching = g.teaching;
    g.autoHinted = {};
    g.teaching = false; // the opening is a separate queue and not what this is about

    const seen = [];
    const markedEarly = [];
    for (const fn of [() => g.toggleAuto('autoAim'), () => g.toggleAuto('autoFire'),
      () => g.useAbility(0), () => g.useAbility(1)]) {
      fn();
      g.update(1 / 60);
      markedEarly.push(keys.filter((k) => lineSeen(k)).length);
    }
    const queued = g.hud.voiceHeld.length;
    // ...and then let the band work through them.
    const texts = new Set();
    for (let i = 0; i < 60 * 90; i++) {
      g.update(1 / 60);
      if (g.hud.hintTimer > 0) texts.add(g.hud.el.hint.textContent.trim());
    }
    const marked = keys.filter((k) => lineSeen(k)).length;
    w.director.update = ranD;
    g.autoHinted = heldHinted;
    g.teaching = heldTeaching;
    if (heldLines === null) localStorage.removeItem('sim7749-lines');
    else localStorage.setItem('sim7749-lines', heldLines);
    g.restart();
    return { queued, marked, shown: texts.size, markedEarly };
  });

  check('four controls pressed in a burst all get their line, in turn',
    r.queued >= 3 && r.shown >= 4 && r.marked === 4,
    `${r.queued} queued behind the first, ${r.shown} distinct lines shown, ${r.marked}/4 marked said`);

  /*
   * ...and nothing was marked before it was shown. After the first press
   * exactly one line has been painted and so exactly one is marked; if the
   * old behaviour came back this would read 1 2 3 4.
   */
  check('...and a line is marked said only once it has actually been said',
    JSON.stringify(r.markedEarly) === JSON.stringify([1, 1, 1, 1]),
    `lines marked after each of the four presses: ${r.markedEarly.join(' ')}`);
}

// --- the ladder climbs, catches, and remembers ------------------------------
/*
 * Difficulty had no direction before this: past the opening eight, waves were
 * shuffled and the only thing that grew was a global volume knob driven off
 * the kill count. You could not stand on a step, could not go back to one,
 * and the game could not tell whether you were coping -- though it had been
 * measuring exactly that, every frame, in two places nothing read.
 *
 * Driven rather than asserted in the abstract, because the whole claim is
 * behavioural: a turret that can cope climbs, a turret that cannot is caught
 * and set down a rung, and neither happens by accident.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    const d = () => w.director;

    // ---- bands: sane at every tier anyone can reach, and never empty ----
    const bandRows = [];
    for (let t = 1; t <= 80; t++) {
      const [lo, hi] = d().bandsFor(t);
      bandRows.push({ t, lo, hi, ok: lo >= 1 && hi <= 5 && lo <= hi });
    }
    const badBands = bandRows.filter((b) => !b.ok);

    /*
     * ---- the health slope compounds, and tier 1 is the table as written ----
     *
     * It was linear, +6% a tier, and reached x2.2 by tier 20 against a damage
     * line worth x13 by tier 8 -- so the ladder got busier and never got
     * harder, and scripts/tiers.mjs measured the slowest body in a band
     * *falling* from 3.0s at tier 3 to 1.4s at tier 20. Asserted as a shape
     * rather than as three numbers: tier 1 unscaled, every rung a fixed ratio
     * on the one below, and no ceiling on it.
     */
    const hp1 = d().scaleAt(1).hp;
    const ratios = [];
    for (let t = 2; t <= 30; t++) ratios.push(d().scaleAt(t).hp / d().scaleAt(t - 1).hp);
    const step = CFG.waves.tier.hpStep;
    const compounds = ratios.every((x) => Math.abs(x - step) < 1e-9);

    // ---- the climb: a fully-bought turret on the assists ----
    /*
     * With the anomalies answered, so this measures the LADDER. Build 203 put
     * seven gates on it and the first is rung 6: without this the run climbs
     * to 6, is held there by ORDINAL exactly as intended, and a case about
     * how fast a good turret climbs fails on the gate doing its job. That the
     * gate holds is asserted on its own, further down.
     */
    g.restart();
    g.debugTeachAll();
    g.debugGiveEnergy(200000);
    g.debugBuyAll();
    for (let n = 1; n <= 7; n++) if (!w.reconciled.includes(n)) w.reconciled.push(n);
    w.autoAim = true; w.autoFire = true;
    const climbFrom = d().tier;
    for (let i = 0; i < 300 * 60; i++) g.update(1 / 60);
    const climbed = d().tier;
    const climbFails = 0;
    const climbPeak = d().peak;
    const climbTraits = (d().traits || []).map((t) => t.id).join('+');
    const climbLast = d().lastVerdict;
    w.reconciled.length = 0;

    /*
     * ---- the catch: a turret that cannot answer, parked high ----
     *
     * Assists off and nothing bought, dropped in at tier 9. From build 210
     * there is exactly one thing that can catch it -- the glitch timer -- so
     * the verdict the run was last given is asserted alongside the drop. Left
     * as a live 500-second run rather than a posed one on purpose: it is the
     * only end-to-end proof in the suite that the involuntary way down fires
     * at all, off nothing but real frames.
     */
    g.restart();
    g.debugTeachAll();
    w.autoAim = false; w.autoFire = false;
    d().setTier(9);
    d().hold = false;
    const caughtFrom = d().tier;
    let downs = 0;
    let last = d().tier;
    for (let i = 0; i < 500 * 60; i++) {
      g.update(1 / 60);
      if (d().tier < last) downs++;
      last = d().tier;
    }
    const caughtTo = d().tier;
    const caughtLast = d().lastVerdict;

    // ---- HOLD pins the climb but never the relief ----
    g.restart();
    g.debugTeachAll();
    d().setTier(4);
    d().hold = true;
    // A clean wave under HOLD must not climb...
    d().contact = 0; d().hitPatience = false; d().asked = 4;
    d().at = 0; d().order = [8]; // a real, non-teach wave
    w.enemies.length = 0;
    const heldBefore = d().tier;
    d().score(w);
    const heldAfterClean = d().tier;
    // ...and the GLITCH TIMER must still step it back, and un-pin it. From
    // build 210 that is the only thing that can: the verdict table has no way
    // down, so posing this through score() would assert nothing at all.
    d().hold = true;
    d().glitchOut(w);
    const heldAfterFail = d().tier;
    const holdCleared = d().hold;
    const heldGrace = d().grace;

    // ---- teach waves never move the ladder ----
    g.restart();
    d().setTier(3);
    d().order = [0]; d().at = 0; // wave 0 is a teach wave
    d().contact = 0; d().hitPatience = false; d().asked = 0;
    const teachVerdict = d().score(w);
    const teachTier = d().tier;

    g.restart();
    return { badBands, bandAt: { t1: bandRows[0], t9: bandRows[8], t80: bandRows[79] },
      hp1, compounds, step, hpAt: [10, 14, 20].map((t) => d().scaleAt(t).hp),
      climbFrom, climbed, climbFails, climbPeak, climbTraits, climbLast,
      caughtFrom, caughtTo, downs, caughtLast,
      heldBefore, heldAfterClean, heldAfterFail, holdCleared, heldGrace,
      teachVerdict, teachTier };
  });

  check('every tier maps to a real band, at both ends of the ladder',
    r.badBands.length === 0,
    `${r.badBands.length} bad of 80; tier 1 -> ${r.bandAt.t1.lo}..${r.bandAt.t1.hi}, `
    + `tier 9 -> ${r.bandAt.t9.lo}..${r.bandAt.t9.hi}, `
    + `tier 80 -> ${r.bandAt.t80.lo}..${r.bandAt.t80.hi}`);

  check('the ladder\'s health compounds, and tier 1 is the table as written',
    Math.abs(r.hp1 - 1) < 1e-9 && r.compounds
    // No ceiling: tier 20 is still exactly the exponent, not a clamp. This
    // was `> 12` and that was the slope of the day rather than the rule --
    // build 194 took hpStep from 1.17 to 1.12 to pay for the cadence nerfs,
    // tier 20 went x19.7 to x8.6, and a case about the SHAPE of the slope
    // failed on its size.
    && Math.abs(r.hpAt[2] - r.step ** 19) < 1e-9 && r.hpAt[2] > r.hpAt[0] * 2,
    `tier 1 x${r.hp1}, every rung x${r.step}; tier 10/14/20 = `
    + r.hpAt.map((x) => `x${x.toFixed(1)}`).join(' / ')
    + `, and tier 20 is x${(r.step ** 19).toFixed(1)} by the formula`);

  /*
   * How far it gets, not whether it ever stumbles.
   *
   * It used to also require zero failures standing, which was true while the
   * health slope was linear and a bought-out turret could climb forever. It
   * compounds since build 179: this run reaches tier 15, where the slowest
   * body in the band takes six and a half seconds, and a turret that far up
   * dropping one wave is the wall working rather than the ladder misfiring.
   * Requiring none of that made the case a coin flip on where the 300 seconds
   * happened to end.
   */
  /*
   * ...and the margin is clear of the boundary it is measuring.
   *
   * `+8` from tier 1 means "must reach rung 10", and build 204 put the trait
   * threshold at exactly rung 10 -- so the case passed if and only if the run
   * got past the rung where the difficulty steps up, which is a coin flip by
   * construction. Measured in isolation the run reaches 12-14; inside the
   * suite it has landed on 9 twice and above 10 once. Six rungs in five
   * minutes is still a climb, and it is nowhere near the step.
   */
  check('a turret that can cope climbs the ladder',
    r.climbed > r.climbFrom + 5,
    `tier ${r.climbFrom} -> ${r.climbed} (peak ${r.climbPeak}) over 300 driven seconds, `
    + `${r.climbFails} failures standing, last verdict ${r.climbLast}, `
    + `wave carrying [${r.climbTraits}]`);

  check('...and a turret that cannot is caught and set down, by the glitch timer',
    r.caughtTo < r.caughtFrom && r.downs >= 1 && r.caughtLast === 'glitch',
    `tier ${r.caughtFrom} -> ${r.caughtTo}, ${r.downs} step-back(s), `
    + `last verdict ${r.caughtLast}`);

  /*
   * HOLD is the one asymmetric control in the game: it pins the climb and not
   * the relief. Somebody who pins a tier they cannot hold would otherwise be
   * left there by their own earlier decision, which is the one outcome an
   * auto-step-back exists to prevent.
   */
  check('HOLD pins the climb, and never pins the fall',
    r.heldAfterClean === r.heldBefore
    && r.heldAfterFail === r.heldBefore - 1
    && r.holdCleared === false && r.heldGrace === 1,
    `held at ${r.heldBefore}: clean wave -> ${r.heldAfterClean}, `
    + `a glitch -> ${r.heldAfterFail}, hold still on: ${r.holdCleared}, `
    + `grace armed ${r.heldGrace}`);

  check('...and the opening teaches without ever moving the ladder',
    r.teachVerdict === null && r.teachTier === 3,
    `teach wave scored ${JSON.stringify(r.teachVerdict)}, tier ${r.teachTier}`);
}

// --- the ladder survives being put down and picked up -----------------------
/*
 * Three new fields in the save, and one migration that matters more than the
 * three: a run saved before the ladder existed has no tier, and defaulting it
 * to 1 would drop a long run back to the opening on the update that shipped
 * this. Seeded from the kill count instead.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { captureRun } = await import('../src/save.js');
    g.restart();
    g.debugTeachAll();
    g.debugAddKills(200);
    /*
     * Let the director actually start. restore() deliberately does nothing
     * for a run saved before its first wave -- an empty rotation means there
     * is nothing to come back to -- so a case that never runs a wave is
     * testing that early-out rather than the ladder.
     */
    w.autoAim = true; w.autoFire = true;
    for (let i = 0; i < 40 * 60; i++) g.update(1 / 60);
    const d = w.director;
    d.setTier(11);
    d.hold = true;
    const blob = captureRun(w, g);
    const wrote = { tier: blob.wave.tier, hold: blob.wave.hold };

    // Round trip.
    d.reset();
    d.restore(w, blob.wave);
    const back = { tier: d.tier, hold: d.hold };

    // ...and a pre-ladder save, which has the wave block but no tier at all.
    const old = { ...blob.wave };
    delete old.tier; delete old.hold;
    w.kills = 240;
    d.reset();
    d.restore(w, old);
    const migrated = d.tier;

    g.restart();
    return { wrote, back, migrated, fromKills: 240 };
  });
  check('the ladder is saved, restored, and migrated rather than reset',
    r.wrote.tier === 11 && r.wrote.hold === 1
    && r.back.tier === 11 && r.back.hold === true
    && r.migrated > 1,
    `wrote ${JSON.stringify(r.wrote)}, read back ${JSON.stringify(r.back)}; `
    + `a pre-ladder save at ${r.fromKills} kills came back at tier ${r.migrated}`);
}

// --- the ladder is a rail, and it is legible and reachable on every phone ---
/*
 * What replaced the tier chip, and what the chip could never say.
 *
 * The chip read "TIER 6" and opened a three-button row on a second tap: two
 * taps to find out what the run was doing, and a number with no context
 * around it. Six of what, going which way, and had it ever been higher. The
 * rail answers all three without being asked, so the things worth asserting
 * are the ones a number did not have: that the window is centred and clamped,
 * that the ticks mean passed rather than smaller, and that the three controls
 * are still reachable once five nodes are sharing the row with them.
 *
 * The band is measured against what is above and below it, because that is
 * where the two real mistakes were. Written against the 32px the top-bar
 * chips used to be, it landed 12px inside the menu button; and at the two
 * rows it was drawn from it pushed the alerts column past the teaching band
 * on a 568 screen, where pillCap() went to zero and every receipt in the game
 * queued for good.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { WAVES } = await import('../src/config.js');
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    const ranD = w.director.update;
    w.director.update = () => {};
    const d = w.director;

    const box = (id) => {
      const q = document.getElementById(id).getBoundingClientRect();
      return { t: Math.round(q.top), b: Math.round(q.bottom), h: Math.round(q.height),
        w: Math.round(q.width) };
    };
    // Where the finger lands, not just where the element says it is.
    const seat = (id) => {
      const el = document.getElementById(id);
      const q = el.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round((q.left + q.right) / 2),
        Math.round((q.top + q.bottom) / 2));
      return { h: Math.round(q.height), mine: top === el || el.contains(top) };
    };
    const window5 = () => [...document.querySelectorAll('.railNode')].map((n) => ({
      n: Number(n.querySelector('b').textContent),
      tick: n.querySelector('i').textContent === '\u2713',
      at: n.classList.contains('at'),
      seen: n.classList.contains('seen'),
    }));

    /* ---- the band clears the bar above it ---- */
    d.setTier(7); d.hold = false;
    g.hud.syncRail(w);
    const bar = box('topbar');
    const rail = box('waveRail');
    const clearsBar = rail.t >= bar.b;

    /* ---- and every control is reachable ---- */
    d.setTier(9); d.reach(6); // so the skip is on the bar to be measured
    g.hud.syncRail(w);
    const seats = { down: seat('railDown'), up: seat('railUp'),
      skip: seat('railSkip'), auto: seat('railAuto') };
    // ...and the band still fits, with four controls on it now.
    const overflow = Math.round(document.getElementById('railAuto').getBoundingClientRect().right)
      > Math.round(document.getElementById('waveRail').getBoundingClientRect().right) + 1;

    /* ---- the window is centred, and clamped at the floor ---- */
    d.setTier(9); d.setTier(7); d.hold = false; // been to 9, standing on 7
    g.hud.syncRail(w);
    const mid = window5();
    d.setTier(1); d.hold = false;
    g.hud.syncRail(w);
    const floor = window5();
    const floorLocked = document.getElementById('railDown').disabled;

    /*
     * ---- a rung has to be climbed before it can be gone back to ----
     *
     * `peak` is the ceiling and only score() raises it. The arrows use
     * `reach`, which clamps; `setTier` is the machinery's and does unlock,
     * which is why the probes and the restore can still put a run anywhere.
     */
    d.setTier(9);      // the run has climbed to 9...
    d.reach(6);        // ...and been pushed back to 6
    d.hold = false;
    g.hud.syncRail(w);
    const shut = [...document.querySelectorAll('.railNode')].map((el) => ({
      n: Number(el.querySelector('b').textContent),
      locked: el.classList.contains('locked'),
      seen: el.classList.contains('seen'),
    }));
    const midUp = { off: document.getElementById('railUp').disabled,
      skip: !document.getElementById('railSkip').hidden };
    // Straight to the top of what has been earned.
    document.getElementById('railSkip').click();
    const skipped = { tier: d.tier, peak: d.peak, hold: d.hold,
      off: document.getElementById('railUp').disabled,
      skip: !document.getElementById('railSkip').hidden,
      shut: [...document.querySelectorAll('.railNode')]
        .filter((el) => el.classList.contains('locked'))
        .map((el) => Number(el.querySelector('b').textContent)) };
    /*
     * ...and at the ceiling the arrow ARMS A TRIAL rather than climbing.
     *
     * Build 201. It used to be simply disabled there, which is the rule
     * working and reading as a dead control. What must still hold is that a
     * button never raises `peak`: the run stands three rungs up, on a rung it
     * has not earned, and the ceiling does not move until a wave says so.
     * Pressed repeatedly it must not stack trials either.
     */
    for (let i = 0; i < 4; i++) document.getElementById('railUp').click();
    const held = { tier: d.tier, peak: d.peak, probe: d.probe ? { ...d.probe } : null };
    g.hud.syncRail(w);
    const onTrial = [...document.querySelectorAll('.railNode')].map((el) => ({
      n: Number(el.querySelector('b').textContent),
      trial: el.classList.contains('trial'),
      locked: el.classList.contains('locked'),
      seen: el.classList.contains('seen'),
    }));
    // A trial that is not cleared costs the rung and nothing else.
    // A real wave, not whatever sat at order[0]: score() returns null for a
    // teach wave and for one that asked for nothing, and a null here would
    // read as "the trial did not resolve" when the case never posed it one.
    const realWave = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);
    d.order = [realWave]; d.at = 0;
    // Slow, untouched, and most of it still standing: a rout by any reading.
    w.time = 999; d.lastRelease = 0; d.asked = 10; d.contact = 0; d.hitPatience = true;
    const lost = d.score(w);
    const afterLost = { tier: d.tier, peak: d.peak, probe: d.probe };
    /*
     * ...and the MODEL holds it, not the button.
     *
     * Asserted separately because the first version of this case was not: the
     * disabled attribute on the arrow swallowed the presses, so the case
     * passed with the arrows still calling setTier -- which unlocks as it
     * goes and would have left no gate at all. A control that refuses is not
     * the same as a rule that holds, and only one of them survives the next
     * caller.
     */
    const forced = { asked: d.peak + 5, got: d.reach(d.peak + 5), peak: d.peak };
    // Down is always free -- going back is not something that is earned.
    document.getElementById('railDown').click();
    const back = d.tier;

    /* ---- the arrows move it and pin it; the switch says which ---- */
    d.setTier(6); d.hold = false;
    g.hud.syncRail(w);
    const autoWord = () => document.getElementById('railAuto')
      .querySelector('.rLong').textContent;
    const runningLabel = autoWord();
    document.getElementById('railUp').click();
    const up = { tier: d.tier, hold: d.hold, label: autoWord() };
    document.getElementById('railDown').click();
    const down = d.tier;
    document.getElementById('railAuto').click();
    const released = { hold: d.hold, label: autoWord() };

    /*
     * ---- peak survives being written down ----
     *
     * Through captureRun and the director's own restore rather than through
     * resume(), which tears down and rebuilds every subsystem in the game and
     * would leave the twelve cases after this one standing in the wreckage.
     */
    const { captureRun } = await import('../src/save.js');
    d.setTier(12); d.setTier(4);
    const peakBefore = d.peak;
    const file = captureRun(w, g);
    const wrote = file && file.wave ? file.wave.peak : null;
    // restore() refuses a file with no rotation in it, and the rotation is
    // empty between runs, so one is supplied rather than borrowed.
    const asFile = (extra) => ({ ...file.wave, order: [0], at: 0, cycle: 1, ...extra });
    d.peak = 1;
    d.restore(w, asFile());
    const peakBack = d.peak;
    // ...and a file written before build 188 has none, which must not read as
    // "never been anywhere" -- standing on a tier is proof of having reached it.
    d.peak = 1;
    d.restore(w, asFile({ peak: undefined, tier: 9 }));
    const peakOld = d.peak;
    /*
     * ...and a file with no ROTATION in it still restores the ladder.
     *
     * `order` is empty for the whole of the opening grace, so a run saved in
     * its first few seconds -- or by the page being hidden in them, which is
     * the last event iOS reliably gives -- writes `order: []`. restore() used
     * to read that as a malformed file and return, throwing tier, peak, hold
     * and fails away with it. A player who had climbed to 12 and quit early
     * in a wave came back to tier 1, and nothing said so.
     */
    d.setTier(1); d.peak = 1; d.hold = false;
    d.restore(w, { ...file.wave, order: [], tier: 12, peak: 14, hold: 1, fails: 1 });
    const noOrder = { tier: d.tier, peak: d.peak, hold: d.hold };

    /*
     * ---- the frame loop paints it ----
     * Blanked by hand, the tier moved behind the HUD's back, and one frame of
     * ordinary play run. Nothing here presses anything or changes phase.
     */
    for (const c of g.hud.railCells) { c.n.textContent = ''; c.tick.textContent = ''; c.at = -1; }
    g.hud.el.railAuto.querySelector('.rLong').textContent = '';
    g.hud._railAt = null; g.hud._railPeak = null; g.hud._railHold = null;
    const paintedBefore = [...document.querySelectorAll('.railNode')]
      .map((n) => n.querySelector('b').textContent).join(',').replace(/^,+$/, '');
    d.setTier(11); d.hold = false;
    g.update(1 / 60);
    const painted = {
      before: paintedBefore.replace(/,/g, '') === '' ? '' : paintedBefore,
      after: [...document.querySelectorAll('.railNode')]
        .map((n) => n.querySelector('b').textContent).join(','),
      label: g.hud.el.railAuto.querySelector('.rLong').textContent,
    };

    /* ---- and a fight takes the slot back ---- */
    d.setTier(7); d.hold = false;
    const quiet = () => { g.hud.clearAlerts();
      document.getElementById('bossCaption').classList.remove('show'); };
    quiet();
    const beforeFight = { rail: box('waveRail').h, alerts: box('alerts').t, cap: g.hud.pillCap() };
    w.apertures[1] = 1;
    g.openBoss(1);
    await new Promise((res) => setTimeout(res, 700));
    quiet();
    const inFight = { rail: box('waveRail').h, alerts: box('alerts').t, cap: g.hud.pillCap(),
      boss: box('bossBar').t, cls: document.body.classList.contains('bossUp') };

    w.director.update = ranD;
    g.restart();
    await new Promise((res) => setTimeout(res, 200));
    const afterFight = document.body.classList.contains('bossUp');
    return { bar, rail, clearsBar, seats, overflow, shut, midUp, skipped, held, back, forced,
      mid, floor, floorLocked, runningLabel,
      up, down, released, peakBefore, peakBack, peakOld, wrote, noOrder,
      painted, beforeFight, inFight, afterFight, onTrial, lost, afterLost,
      vh: window.innerHeight };
  });

  check('the rail sits clear of the bar above it and every control is thumb-sized',
    r.clearsBar && r.rail.h > 0 && !r.overflow
    && Object.values(r.seats).every((s) => s.h >= 44 && s.mine),
    `bar ends ${r.bar.b}, rail ${r.rail.t}..${r.rail.b}, overflows ${r.overflow}; `
    + Object.entries(r.seats).map(([k, s]) => `${k} ${s.h}px hit=${s.mine}`).join(' · '));

  check('the window centres on the run and stops at the floor',
    r.mid.map((c) => c.n).join(',') === '5,6,7,8,9'
    && r.mid.find((c) => c.at).n === 7
    && r.floor.map((c) => c.n).join(',') === '1,2,3,4,5'
    && r.floor.find((c) => c.at).n === 1 && r.floorLocked,
    `at 7: [${r.mid.map((c) => c.n).join(',')}] · at 1: `
    + `[${r.floor.map((c) => c.n).join(',')}], step-back disabled ${r.floorLocked}`);

  /*
   * The ticks are the whole reason for drawing this instead of counting. A
   * run that reached 9 and was pushed back to 7 has stood on 8 -- so 8 is not
   * a stranger, but it is not cleared-and-done either, and a tick on it would
   * read as "nothing to do here" over a tier about to be climbed again.
   */
  check('a tick means passed, and a tier above you that you have stood on is neither',
    r.mid.filter((c) => c.tick).map((c) => c.n).join(',') === '5,6'
    && r.mid.filter((c) => c.seen).map((c) => c.n).join(',') === '8,9',
    `ticked [${r.mid.filter((c) => c.tick).map((c) => c.n).join(',')}] · `
    + `stood on above [${r.mid.filter((c) => c.seen).map((c) => c.n).join(',')}]`);

  /*
   * The gate. Forward is earned and back is free, which is the whole of what
   * `peak` is for -- before build 196 the arrows called setTier, which raised
   * peak on the way, so there was no ceiling and nothing to unlock.
   */
  /*
   * ...and the skip puts the climb back ON, where the arrows pin it. A step
   * is "I want to be here"; the skip is "put me back where I was", and the
   * state you were in when you got there was climbing. Pinning on it left the
   * player at their ceiling reading HELD and never advancing again -- a trap
   * made of two controls that each behaved sensibly on their own.
   */
  check('a tier that has never been climbed cannot be stepped into',
    r.midUp.off === false && r.midUp.skip === true
    && r.skipped.tier === 9 && r.skipped.peak === 9 && r.skipped.hold === false
    && r.held.peak === 9
    && r.forced.got === 9 && r.forced.peak === 9
    && r.back === 8,
    `at 6 of 9: up ${r.midUp.off ? 'shut' : 'open'}, skip ${r.midUp.skip ? 'offered' : 'hidden'} `
    + `-> skip lands on ${r.skipped.tier} still climbing (held ${r.skipped.hold}), `
    + `four more presses of up leave the ceiling at ${r.held.peak}; `
    + `asked for ${r.forced.asked} it gives `
    + `${r.forced.got} and peak stays ${r.forced.peak}; down still goes to ${r.back}`);

  /*
   * The trial is the one way past the ceiling, and it is still not a button
   * raising `peak` -- the button only puts the run there to be judged.
   */
  check('at the ceiling the arrow arms one trial, three rungs up, and no more',
    r.held.probe && r.held.probe.from === 9 && r.held.probe.to === 12
    && r.held.tier === 12 && r.held.peak === 9,
    `four presses at 9: probe ${JSON.stringify(r.held.probe)}, standing on `
    + `${r.held.tier}, ceiling still ${r.held.peak}`);
  check('...drawn as stood-on but not earned, with the rungs beside it still shut',
    r.onTrial.some((c) => c.n === 12 && c.trial && !c.locked)
    && r.onTrial.filter((c) => c.locked).length > 0
    && !r.onTrial.some((c) => c.seen),
    `nodes ${r.onTrial.map((c) => `${c.n}${c.trial ? '*' : ''}${c.locked ? 'x' : ''}`).join(' ')} `
    + '(* trial, x shut)');
  check('...and a trial that is not cleared costs the rung and nothing else',
    r.lost && r.lost.trial === 'failed' && r.afterLost.tier === 9
    && r.afterLost.peak === 9 && r.afterLost.probe === null,
    `verdict ${r.lost && r.lost.verdict}, back to ${r.afterLost.tier} `
    + `(ceiling ${r.afterLost.peak}), probe ${JSON.stringify(r.afterLost.probe)}`);

  check('...and the rungs above it are drawn shut, with nothing to skip to',
    r.shut.filter((c) => c.locked).length === 0
    && r.shut.filter((c) => c.seen).map((c) => c.n).join(',') === '7,8'
    && r.skipped.shut.join(',') === '10,11'
    && r.skipped.off === false && r.skipped.skip === false,
    `at 6 of 9 nothing is shut and [${r.shut.filter((c) => c.seen).map((c) => c.n)}] are open ahead; `
    + `at the ceiling [${r.skipped.shut}] are shut, up is ${r.skipped.off ? 'shut' : 'open'} `
    + `and the skip is ${r.skipped.skip ? 'still offered' : 'gone'}`);

  check('the arrows move the ladder and pin it, and the switch says so',
    r.runningLabel === 'AUTO PROGRESS ON'
    && r.up.tier === 7 && r.up.hold === true && r.up.label === 'HELD AT 7'
    && r.down === 6
    && r.released.hold === false && r.released.label === 'AUTO PROGRESS ON',
    `running "${r.runningLabel}" · up -> ${r.up.tier} "${r.up.label}" · `
    + `down -> ${r.down} · released "${r.released.label}"`);

  check('the highest tier the run has stood on survives being written down',
    r.peakBefore === 12 && r.wrote === 12 && r.peakBack === 12 && r.peakOld === 9,
    `peak ${r.peakBefore} in memory, ${r.wrote} in the file, ${r.peakBack} back; `
    + `a file without one restores at its own tier (${r.peakOld})`);

  check('...and a save taken before the first wave still keeps its ladder',
    r.noOrder.tier === 12 && r.noOrder.peak === 14
    && r.noOrder.hold === true,
    `a file with an empty rotation restores tier ${r.noOrder.tier}, peak `
    + `${r.noOrder.peak}, held ${r.noOrder.hold}`);

  /*
   * ...and the band is painted by the frame loop, not by luck.
   *
   * syncRail was called from syncHudLight -- the path that runs while the
   * world is HELD -- and not from syncHud, which runs every frame of play. So
   * the rail was drawn on a tier change, on a press of its own arrows, or the
   * next time the game was paused, and never otherwise. A fresh run got away
   * with it because the first clean wave moves the tier and paints it; a
   * resumed one came back with five empty boxes and no switch label.
   *
   * Moved here rather than asserted through resume(), which rebuilds every
   * subsystem in the game: the tier is set behind the HUD's back and one
   * frame is run, which is exactly the situation a restore leaves.
   */
  check('the rail is painted by the frame loop, not by something moving it',
    r.painted.before === '' && r.painted.after === '9,10,11,12,13'
    && r.painted.label !== '',
    `cells blanked to "${r.painted.before}", one frame later "${r.painted.after}", `
    + `switch reads "${r.painted.label}"`);

  /*
   * The measurement the design was changed by. Two rows here cost the 568
   * screen its only pill slot; one row and a reservation that is only made
   * during a fight keep it, in both states.
   */
  check('a fight takes the slot back, and the column below keeps its room',
    r.beforeFight.rail > 0 && r.inFight.rail === 0 && r.inFight.cls
    && r.inFight.boss === r.rail.t
    && r.beforeFight.cap >= 1 && r.inFight.cap >= 1 && !r.afterFight,
    `${r.vh}px tall · quiet: rail ${r.beforeFight.rail}px, alerts ${r.beforeFight.alerts}, `
    + `cap ${r.beforeFight.cap} | fight: rail ${r.inFight.rail}px, boss at ${r.inFight.boss}, `
    + `alerts ${r.inFight.alerts}, cap ${r.inFight.cap} | class clears after: ${!r.afterFight}`);
}

// --- a hit lands as the round, and a death wears its killer ------------------
/*
 * The rounds were given nine identities in flight in build 172 and all nine
 * still ARRIVED identically -- every projectile landed as the same hitBurst
 * in a different colour, and every body died as the same explode(). The
 * one-recipe disease, at the exact moments the player is being paid.
 *
 * Named forms land as what they are now (ice chips, a crackle, a puncture, a
 * concussion, a puff, a ledger tick) and a death within half a second of a
 * named hit wears it. The default path -- BOLT, HAIL, anything unnamed -- is
 * byte-for-byte the old hitBurst and the plain explode, because it is the
 * path every hit in ORDINAL's canonical fight takes, and the hash held at
 * 117409503 through this change on exactly that guarantee.
 *
 * Counted structurally: what each impact SPAWNS (streaks, dots, shards,
 * embers, rings), not what it paints -- the mix is the identity and it is
 * exact where pixels are weather.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { fx, impactFx, deathFx } = await import('../src/fx.js');
    g.debugTeachAll();
    g.debugClearField();
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }

    const census = () => {
      const c = { streak: 0, dot: 0, shard: 0, ember: 0 };
      for (const q of fx.particles.active) {
        c[['dot', 'streak', 'shard', 'ember', 'haul'][q.kind] || 'dot']++;
      }
      c.rings = fx.rings.active.length;
      return c;
    };
    const clear = () => { fx.particles.clear(); fx.rings.clear(); };
    const delta = (a, b) => Object.fromEntries(
      Object.keys(b).map((k) => [k, b[k] - (a[k] || 0)]));

    const forms = ['pellet', 'shell', 'arc', 'dart', 'slab', 'flake', 'pod', 'tithe'];
    const impacts = {};
    for (const f of forms) {
      clear();
      const before = census();
      impactFx(f, 400, 400, 0, -1, '#ffffff');
      impacts[f] = delta(before, census());
    }
    clear();
    const before = census();
    impactFx(null, 400, 400, 0, -1, '#ffffff'); // the default: classic burst
    impacts.default = delta(before, census());

    const deaths = {};
    for (const f of ['flake', 'shell', 'arc', 'dart', 'slab', 'pod', 'tithe']) {
      clear();
      const b2 = census();
      deathFx(f, 400, 400, 20);
      deaths[f] = delta(b2, census());
    }

    /*
     * ...and the wiring, end to end: a body killed by a RIME round dies with
     * ice shards on top of its own explode, and one killed by a BOLT does
     * not. Driven through the real projectile path, not the dispatchers.
     */
    const kill = (round) => {
      g.debugClearField();
      // ...and the air with it. The first draft left the previous round's
      // projectiles in flight, and a leftover RIME bolt tagged the "BOLT"
      // kill's fresh mote before the first BOLT arrived.
      w.projectiles.length = 0;
      const s = w.shooter;
      const e = g.debugSpawn('mote', s.x, s.y - 160);
      e.spawnIn = 0; e.vx = 0; e.vy = 0; e.hp = 1;
      w.round = round;
      s.aim = -Math.PI / 2; s.targetAim = s.aim;
      clear();
      for (let i = 0; i < 90 && !e.dead; i++) {
        s.shoot(w);
        g.update(1 / 60);
      }
      return { dead: e.dead, tagged: e.lastHit, shards: census().shard };
    };
    const rimeKill = kill('rime');
    const boltKill = kill('standard');

    clear();
    g.debugClearField();
    g.restart();
    return { impacts, deaths, rimeKill, boltKill };
  });

  const sig = (d) => Object.entries(d).filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${v}`).join(',') || 'nothing';
  const sigs = Object.entries(r.impacts).map(([f, d]) => `${f}=${sig(d)}`);
  const distinct = new Set(Object.values(r.impacts).map(sig));
  const empty = Object.entries(r.impacts).filter(([, d]) => sig(d) === 'nothing');
  check('every named round lands as its own mix, and none lands as nothing',
    empty.length === 0 && distinct.size >= 7,
    `${distinct.size} distinct impact signatures of ${Object.keys(r.impacts).length}: `
    + sigs.join('  '));

  const deadSigs = new Set(Object.values(r.deaths).map(sig));
  check('...and every named death is a different garnish',
    Object.values(r.deaths).every((d) => sig(d) !== 'nothing') && deadSigs.size >= 6,
    `${deadSigs.size} distinct of ${Object.keys(r.deaths).length}: `
    + Object.entries(r.deaths).map(([f, d]) => `${f}=${sig(d)}`).join('  '));

  check('...and a RIME kill dies of ice through the real path, a BOLT kill does not',
    r.rimeKill.dead && r.rimeKill.tagged === 'flake' && r.rimeKill.shards > 0
    && r.boltKill.dead && r.boltKill.tagged === null,
    `RIME: dead ${r.rimeKill.dead}, tagged ${r.rimeKill.tagged}, `
    + `${r.rimeKill.shards} shards; BOLT: dead ${r.boltKill.dead}, `
    + `tagged ${r.boltKill.tagged}`);
}

// --- ground is under the field, and one band holds one voice ----------------
/*
 * Two defects from the first full-chaos review -- every system staged on one
 * screen at once, which no probe had ever done. Both were invisible in
 * isolation and obvious in composition:
 *
 * Patches lived in world.effects, and effects draw AFTER the bodies -- so
 * burning ground was painted over the things standing on it. On a crowded
 * frame the two SPORE patches were the visually heaviest objects on the
 * screen, heavier than the boss, because they were not ground at all: they
 * were slabs laid on top of the field. Patch declares `ground` now and the
 * draw makes two passes over effects.
 *
 * And the canvas narrator was never in the one-voice rule -- build 167 only
 * arbitrated the DOM surfaces -- so a story line still fading when a boss
 * arrived sat exactly under the arrival caption, text through text, in the
 * same upper band both call home.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { Patch } = await import('../src/patch.js');
    const { glitch } = await import('../src/glitch.js');
    g.debugTeachAll();
    g.debugClearField();
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
    g.hud.clearHint(); g.hud.clearAlerts(); g.hud.unrecede();
    glitch.level = 0; glitch.burst = 0;

    // A body standing on a patch. BULWARK, because it is the biggest and its
    // stroke is the strongest -- if anything survives being drawn under a
    // slab it is this, so a wash on IT is proof of the general case.
    const s = w.shooter;
    const e = g.debugSpawn('bulwark', s.x, s.y - 260);
    e.spawnIn = 0; e.vx = 0; e.vy = 0; e.hp = e.maxHp;
    for (let i = 0; i < 10; i++) g.update(1 / 60);

    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d');
    const k = cv.width / w.width;
    /*
     * Read the green channel's EXCESS over red across the body's own disc.
     * The patch tone is #8eeb4b -- green almost double red -- while nothing
     * in BULWARK's own draw is green-dominant, so ground drawn over the body
     * pushes G past R inside the disc and ground drawn under it cannot.
     */
    const wash = () => {
      const r0 = Math.round(e.r * 0.8 * k);
      const cx = Math.round(e.x * k);
      const cy = Math.round(e.y * k);
      const d = c2.getImageData(cx - r0, cy - r0, r0 * 2, r0 * 2).data;
      let excess = 0;
      for (let i = 0; i < d.length; i += 4) excess += Math.max(0, d[i + 1] - d[i]);
      return Math.round(excess / 1000);
    };
    /*
     * ...and a second reading, in a BOX just outside the body, to show the
     * patch is genuinely being drawn. It was one 2x2 pixel: fine against a
     * filled disc and useless against build 214's patch, which is a scatter
     * of small specks over a dim haze -- a point sample lands between them
     * and reports the effect missing on a build where it is plainly there.
     * Same disease as the HITBOXES floor line in CLAUDE.md.
     */
    /*
     * ...and whether the patch is being drawn AT ALL, by differencing the two
     * frames rather than by looking for green.
     *
     * It was one 2x2 pixel just outside the body: fine against a filled disc
     * and useless against build 214's patch, which is a scatter of small
     * specks over a dim haze -- a point sample lands between them and reports
     * the effect missing on a build where it is plainly there. Widening it to
     * a box did not help either, because the field's own lattice is a dim
     * teal and swamps the signal: measured, 740 strongly-green pixels of
     * lattice against 112 the patch adds. Nothing is moving between the two
     * draws except the patch, so the difference IS the patch, and it needs no
     * threshold tuned to whatever the effect happens to look like this build.
     * Same disease as the HITBOXES floor line in CLAUDE.md, twice over.
     */
    const frame = () => {
      const half = Math.round(126 * k);
      const bx = Math.max(0, Math.round(e.x * k) - half);
      const by = Math.max(0, Math.round(e.y * k) - half);
      const bw = Math.min(c2.canvas.width - bx, half * 2);
      const bh = Math.min(c2.canvas.height - by, half * 2);
      return c2.getImageData(bx, by, bw, bh).data;
    };
    const litUp = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (b[i + 1] - a[i + 1] > 8) n++;
      return n;
    };
    w.effects.length = 0;
    g.draw();
    const bare = wash();
    const frameBare = frame();
    const patch = new Patch(e.x, e.y, { r: 120, life: 6, dps: 0, tone: '#8eeb4b' });
    // Past its own quarter-second fade-in, or it is invisible everywhere and
    // the whole case reads a patch that is not being drawn at all.
    patch.t = 1;
    w.effects.push(patch);
    g.draw();
    const onGround = wash();
    // ...and the patch is genuinely there: pixels the patch lit that the bare
    // frame did not, over the patch's own area.
    const lit = litUp(frameBare, frame());
    const patchThere = lit > 900;
    w.effects.length = 0;

    // The narrator, standing down. Spied rather than pixel-read: text on a
    // canvas has no reliable pixel signature, but whether draw() was invoked
    // is exact.
    let drew = 0;
    const real = w.narrator.draw;
    w.narrator.draw = (...args) => { drew++; return real.apply(w.narrator, args); };
    w.bossLine = null;
    g.draw();
    const without = drew;
    w.bossLine = 'IT IS THE EDGE.';
    g.draw();
    const withCaption = drew - without;
    w.narrator.draw = real;
    w.bossLine = null;

    g.debugClearField();
    g.restart();
    return { bare, onGround, patchThere, lit,
      ground: patch.ground === true, without, withCaption };
  });

  check('a patch is ground: under the body standing on it, not over it',
    r.ground && r.patchThere && r.onGround < r.bare * 1.3 + 40,
    `green excess across the body's disc: bare ${r.bare}, on a patch ${r.onGround}; `
    + `${r.lit} pixels over the patch's own area were lit by drawing it, so `
    + `the patch is there (${r.patchThere})`);

  check('...and the narrator stands down while a boss is talking',
    r.without === 1 && r.withCaption === 0,
    `narrator.draw ran ${r.without}x with no caption, ${r.withCaption}x under one`);
}

// --- an ability is on the screen for as long as it is on the world ----------
/*
 * Three abilities were drawing for a fraction of the time they were running,
 * and STASIS was the worst of them by far: `world.stasis` is set to 4 and its
 * draw faded out over `stasis / 0.8`, so it painted for four fifths of a
 * second and then NOTHING for the remaining three and a bit while it was
 * still holding the entire field. Twenty-one seconds of cooldown buying an
 * effect that is invisible for eighty percent of its life, and the only way
 * to know it was still on was that things were not moving.
 *
 * PULSE and LANCE were the same disease in a milder form -- both over inside
 * half a second, on seven and twelve second cooldowns -- so both now run on
 * two clocks: a hard brief hit, and a slow quiet mark that says where it
 * reached (PULSE's dashed ring at the blast's real edge) or what it went
 * through (LANCE's scar).
 *
 * Measured on a frozen frame, so nothing but the effect can differ between
 * the two reads. The alternative -- diffing live frames -- measures the
 * world moving and cannot tell an effect that is drawing from a body that
 * drifted, which is exactly the trap that made the first attempt at this
 * report all eight abilities as visible for a flat 2.5 seconds.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { glitch } = await import('../src/glitch.js');
    g.debugTeachAll();
    g.debugClearField();
    w.debug.noCooldown = true;
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
    g.hud.clearHint(); g.hud.clearAlerts(); g.hud.unrecede();
    glitch.level = 0; glitch.burst = 0;

    const s = w.shooter;
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 11 - 0.5) * 1.6;
      const e = g.debugSpawn(i % 3 ? 'mote' : 'lurcher',
        s.x + Math.cos(a) * 190, s.y + Math.sin(a) * 190);
      if (e) { e.spawnIn = 0; e.vx = 0; e.vy = 0; }
    }
    for (let i = 0; i < 20; i++) g.update(1 / 60);

    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d');
    const snap = () => {
      const d = c2.getImageData(0, 0, cv.width, cv.height).data;
      const out = new Uint8Array(Math.floor(d.length / 4 / 4));
      for (let i = 0, j = 0; j < out.length; i += 16, j++) {
        out[j] = Math.min(255, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      }
      return out;
    };
    const diff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 10) n++;
      return n;
    };

    // The reference frame: everything exactly where it is, nothing running.
    w.stasis = 0;
    w.effects.length = 0;
    g.draw();
    const base = snap();

    // STASIS, three seconds into its four. Set directly rather than cast, so
    // the bodies do not move and the only difference is the drawing.
    w.stasis = 1.0; g.draw();
    const stasisLate = diff(snap(), base);
    w.stasis = 3.5; g.draw();
    const stasisEarly = diff(snap(), base);
    w.stasis = 0;

    // PULSE's reach ring, after the punch is over. Its fast rings live 0.42s;
    // this is read at 0.8, where the old effect had nothing left at all.
    const fire = (id) => {
      const i = w.abilities.slots.findIndex((x) => x && x.def.id === id);
      const sl = w.abilities.slots[i];
      sl.charges = Math.max(1, sl.charges); sl.cd = 0;
      g.useAbility(i);
    };
    const hold = (secs) => {
      // Only the effects are ticked, so bodies cannot drift and pollute the
      // comparison.
      for (let f = 0; f < Math.round(secs * 60); f++) {
        for (const e of [...w.effects]) e.update(w, 1 / 60);
        for (let k = w.effects.length - 1; k >= 0; k--) if (w.effects[k].dead) w.effects.splice(k, 1);
      }
    };
    w.effects.length = 0;
    fire('pulse');
    hold(0.8);
    g.draw();
    const pulseLate = diff(snap(), base);
    const pulseEffects = w.effects.length;

    w.effects.length = 0;
    fire('lance');
    hold(0.8); // its beam lives 0.42s; only the scar should remain
    g.draw();
    const lanceLate = diff(snap(), base);
    const lanceEffects = w.effects.length;

    w.effects.length = 0;
    w.stasis = 0;
    w.debug.noCooldown = false;
    g.restart();
    return { stasisEarly, stasisLate, pulseLate, pulseEffects, lanceLate, lanceEffects };
  });

  check('STASIS is drawn for as long as STASIS is holding the field',
    r.stasisEarly > 400 && r.stasisLate > 400,
    `pixels changed at 3.5s left: ${r.stasisEarly}, at 1.0s left: ${r.stasisLate}`);

  check('...and PULSE and LANCE both outlive their own first frame',
    r.pulseLate > 150 && r.pulseEffects > 0
    && r.lanceLate > 100 && r.lanceEffects > 0,
    `0.8s after firing -- PULSE ${r.pulseLate} pixels (${r.pulseEffects} effects alive), `
    + `LANCE ${r.lanceLate} pixels (${r.lanceEffects} alive)`);
}

// --- when something is on the turret, the answer says so --------------------
/*
 * The barrel cannot point at a thing sitting on its own mount. That is the
 * entire reason PULSE exists and the reason ORDINAL can never take it away,
 * and nothing on the screen ever said it: the caption read "it stops when you
 * destroy it", which is true and useless, and a player who never worked out
 * which of eight buttons was the answer got no second chance -- every line in
 * this game is said once per device.
 *
 * Three things now. The button wears it for as long as anything is attached;
 * it distinguishes "this is the one" from "and you can press it right now";
 * and a player who is still held after a while is told, in words, once, with
 * a long leash, until they use it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { STILL_HELD } = await import('../src/tutorial.js');
    g.debugTeachAll();
    g.debugClearField();
    g.hud.clearHint();

    const btn = (name) => [...document.querySelectorAll('#abilities .ab')]
      .find((b) => new RegExp(name).test(b.textContent));
    /*
     * `.ab` transitions border-color over 200ms and `.ab.flash` runs a
     * 340ms animation that outranks the urgent one while it lasts, so a
     * computed style read on the frame the class changes is reading the
     * value it is leaving, not the one it is going to. Both are waited out.
     */
    /*
     * ...and the world keeps running through that 420ms, which is the whole
     * of why this case was flaky.
     *
     * `.ab.urgent` is on for as long as something is attached, and the body
     * this case puts on the mount is shoved off it by the physics inside the
     * wait -- so the `cooling` read came back "ab essential" with no urgent
     * class on about one run in three, on a build where nothing was wrong.
     * Exactly the shape CLAUDE.md already records for this button: a light
     * sampled at the end of a window rather than on frames where something is
     * genuinely attached. `hold` re-pins and heals the body every frame of
     * the wait, the way the measuring loops further down already do.
     */
    const settle = (hold) => new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (hold && !hold.dead) {
          hold.x = w.shooter.x + 4; hold.y = w.shooter.y - 6;
          hold.vx = 0; hold.vy = 0; hold.hp = hold.maxHp;
        }
        if (performance.now() - t0 >= 420) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const look = async (hold) => {
      const b = btn('PULSE');
      b.classList.remove('flash');
      await settle(hold);
      const cs = getComputedStyle(b);
      return { cls: b.className, border: cs.borderTopColor, anim: cs.animationName,
        lbl: getComputedStyle(b.querySelector('.lbl')).color };
    };
    const others = () => [...document.querySelectorAll('#abilities .ab')]
      .filter((b) => !/PULSE/.test(b.textContent) && b.classList.contains('urgent')).length;

    const sync = () => g.hud.syncAbilities(w.abilities);
    w.attackers.clear(); sync();
    const clean = await look();

    // Something walks onto the mount.
    const s = w.shooter;
    const e = g.debugSpawn('lurcher', s.x + 4, s.y - 6);
    e.spawnIn = 0; e.vx = 0; e.vy = 0;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const held = await look(e);
    const spread = others();

    // ...and with no charge in hand it must still mark itself, but must not
    // claim to be pressable.
    const slot = w.abilities.slots.find((x) => x.def.essential);
    const keep = { charges: slot.charges, cd: slot.cd };
    slot.charges = 0; slot.cd = 9;
    sync();
    const cooling = await look(e);
    slot.charges = keep.charges; slot.cd = keep.cd;
    sync();

    // The words, for someone who has still not pressed it.
    g.hud.clearHint();
    g.hud.say(null);
    /*
     * The fuse is zeroed with `heldFor`, not left where the preamble put it.
     * The nudge is a nine-second clock and the glitch timer is a fifteen-and-
     * a-half-second one, both starting from the same first touch, so in a real
     * run the nudge always lands first -- but this case has had a LURCHER on
     * the mount through three 420ms style settles before it starts counting,
     * and a fuse that blew inside the window fizzled the field and reset
     * `heldFor` to 0, so the band was never asked for at all. Zeroing both is
     * what makes the twenty frames below measure the nudge rather than the
     * race. That the nudge wins the race is asserted on its own, next door.
     */
    if (w.director) { w.director.glitch = 0; w.director.held = 0; }
    w.heldFor = 0; w.heldSaid = 1e9;
    /*
     * Gated on `.show`, not on the text. clearHint() drops the class and
     * leaves the words in the DOM, so a plain textContent read finds the
     * last thing said for the rest of the run -- which reported the nudge
     * as firing again when what it had found was its own leftovers.
     */
    const band = () => {
      const el = document.getElementById('abilityHint');
      return el.classList.contains('show')
        ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    };
    /*
     * The body is PINNED to the mount for the window, and healed each frame.
     *
     * `w.heldFor` resets the moment nothing is attached, and from build 210
     * `world.attackers` releases a body that has stopped touching -- so it is
     * genuinely unbroken time now, where before it was "has ever touched you
     * and is not dead yet". A LURCHER dropped on the turret and left to the
     * physics gets shoved off it by the next thing that arrives, and the
     * nine-second clock starts again from nothing every time. Which is the
     * right behaviour for the nudge and the wrong setup for measuring it.
     */
    let saidAt = null;
    for (let i = 0; i < 60 * 20 && saidAt === null; i++) {
      if (e.dead) break;
      e.x = s.x + 4; e.y = s.y - 6; e.vx = 0; e.vy = 0; e.hp = e.maxHp;
      g.update(1 / 60);
      if (band().includes('PULSE shoves off')) saidAt = +(w.heldFor).toFixed(1);
    }

    // ...and it stops for good once they use it.
    const idx = w.abilities.slots.indexOf(slot);
    slot.charges = Math.max(1, slot.charges); slot.cd = 0;
    g.useAbility(idx);
    g.hud.clearHint();
    const e2 = g.debugSpawn('lurcher', s.x + 4, s.y - 6);
    e2.spawnIn = 0; e2.vx = 0; e2.vy = 0;
    let again = false;
    for (let i = 0; i < 60 * 120; i++) {
      if (!e2.dead) { e2.x = s.x + 4; e2.y = s.y - 6; e2.vx = 0; e2.vy = 0; e2.hp = e2.maxHp; }
      g.update(1 / 60);
      if (band().includes('PULSE shoves off')) { again = true; break; }
    }
    const stillHeld = w.attackers.size;

    /*
     * Off the mount, off the button.
     *
     * The field is emptied and locked first, because `look()` waits out a
     * 420ms transition and the game keeps running through it -- a body
     * walking onto the turret during that wait puts the class back on for
     * perfectly correct reasons and fails the check for none.
     */
    g.debugClearField();
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
    for (const a of [...w.attackers]) a.dead = true;
    w.attackers.clear();
    sync();
    const after = await look();

    g.debugClearField();
    g.restart();
    return { clean, held, cooling, after, spread, saidAt, again, stillHeld,
      window: STILL_HELD.after };
  });

  check('something on the turret lights PULSE, and only PULSE',
    !/urgent/.test(r.clean.cls) && /urgent/.test(r.held.cls)
    && r.spread === 0 && !/urgent/.test(r.after.cls),
    `clean "${r.clean.cls}" -> held "${r.held.cls}" -> released "${r.after.cls}"; `
    + `${r.spread} other buttons lit`);

  /*
   * `now` is the difference between "this is the one" and "and you can press
   * it". A button that shouts press-me on cooldown is a lie a player only has
   * to be told once to stop believing it.
   *
   * The computed colours are asserted, not just the class, because that is
   * the half that failed silently: this block sat ABOVE `.ab.ready` in the
   * stylesheet, both are two-class selectors, and the later one won -- so the
   * border and the label went back to PULSE's cyan on the exact button being
   * made unmistakable, with the declarations present in the source and simply
   * not applying.
   */
  const red = (c) => {
    const m = String(c).match(/[\d.]+/g);
    if (!m) return false;
    const [rr, gg, bb] = m.map(Number);
    return rr > 150 && rr > gg * 1.6 && rr > bb * 1.6;
  };
  check('...and it says "press me" only when there is a use in hand',
    /\bnow\b/.test(r.held.cls) && !/\bnow\b/.test(r.cooling.cls)
    && /urgent/.test(r.cooling.cls)
    && r.held.anim !== r.cooling.anim && r.held.anim !== 'none'
    && red(r.held.border) && red(r.cooling.border) && !red(r.clean.border),
    `ready "${r.held.cls}" (${r.held.anim}, border ${r.held.border}); `
    + `cooling "${r.cooling.cls}" (${r.cooling.anim}, border ${r.cooling.border}); `
    + `clean border ${r.clean.border}`);

  check('...and a player still held after a while is told what to press, once',
    r.saidAt !== null && r.saidAt >= r.window && r.saidAt < r.window + 3
    && !r.again && r.stillHeld > 0,
    `said at ${r.saidAt}s of being held (window ${r.window}s); `
    + `said again in the two minutes after a PULSE: ${r.again} `
    + `(with ${r.stillHeld} still attached)`);
}

// --- nine rounds, nine shapes in the air ------------------------------------
/*
 * Every projectile used to be drawn by one recipe -- two strokes, a glow and
 * a dot -- so the only thing separating HE in flight from RIME was a colour,
 * which is the same disease the bodies had before build 166. Each round now
 * flies as its mechanic: a shell, pellets, a crackling zigzag, a finned dart,
 * a slab with a bow wave, a turning flake, a pod shedding motes, the TITHE
 * ring, and BOLT's needle.
 *
 * Asked of the pixels, pairwise: each round's projectile is rendered alone at
 * a fixed spot and heading through the REAL branch in shooter.js -- no
 * duplicated opts to drift out of date -- and every pair of rounds has to
 * differ. A future round added to the arsenal that never names a form falls
 * back to the tracer and immediately collides with BOLT here, which is the
 * point: the case is the reminder that a round is a shape, not a hue.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { drawProjectiles } = await import('../src/projectiles.js');
    g.debugTeachAll();
    g.debugClearField();
    const s = w.shooter;

    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const c2 = cv.getContext('2d', { willReadFrequently: true });

    const rounds = ['standard', 'shotgun', 'explosive', 'arc', 'spine',
      'slug', 'rime', 'spore', 'tithe'];
    const shots = {};
    const forms = {};
    for (const key of rounds) {
      w.projectiles.length = 0;
      w.round = key;
      s.aim = 0;
      s.shoot(w);
      const p = w.projectiles[0];
      forms[key] = p.form;
      // One projectile, parked at the same spot with the same heading, so
      // the comparison is the form and nothing else.
      p.x = 80; p.y = 80;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      p.vx = (p.vx / sp) * 900; p.vy = (p.vy / sp) * 900;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, 160, 160);
      drawProjectiles(c2, { time: 2.0, projectiles: [p] });
      const d = c2.getImageData(0, 0, 160, 160).data;
      // Downsampled RGB signature: 20x20 cells of summed channels.
      const sig = new Float64Array(20 * 20 * 3);
      let ink = 0;
      for (let y = 0; y < 160; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4;
          const cell = ((y >> 3) * 20 + (x >> 3)) * 3;
          sig[cell] += d[i] * (d[i + 3] / 255);
          sig[cell + 1] += d[i + 1] * (d[i + 3] / 255);
          sig[cell + 2] += d[i + 2] * (d[i + 3] / 255);
          ink += d[i + 3];
        }
      }
      shots[key] = { sig: [...sig], ink: Math.round(ink / 1000) };
    }
    w.projectiles.length = 0;
    g.restart();
    return { rounds, shots, forms };
  });

  const diff = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return Math.round(sum / 1000);
  };
  const pairs = [];
  for (let i = 0; i < r.rounds.length; i++) {
    for (let j = i + 1; j < r.rounds.length; j++) {
      pairs.push({ a: r.rounds[i], b: r.rounds[j],
        d: diff(r.shots[r.rounds[i]].sig, r.shots[r.rounds[j]].sig) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const empty = r.rounds.filter((k) => r.shots[k].ink < 20);
  const formSet = new Set(Object.values(r.forms));
  check('all nine rounds fly as nine different shapes',
    empty.length === 0 && pairs[0].d > 8 && formSet.size === 9,
    `${formSet.size} distinct forms; closest pair ${pairs[0].a}/${pairs[0].b} at ${pairs[0].d} `
    + `(next ${pairs[1].a}/${pairs[1].b} at ${pairs[1].d}); `
    + `ink ${r.rounds.map((k) => `${k}:${r.shots[k].ink}`).join(' ')}`
    + `${empty.length ? `; EMPTY: ${empty.join(',')}` : ''}`);
}

// --- every control in the debug panel does something, and nothing throws ----
/*
 * This panel has been wrong before and in a way nothing could catch: five of
 * its buttons called methods that went with the boss and the ledger in builds
 * 81-82, and they sat there dead for twenty builds because a button only
 * throws when it is pressed and nobody was pressing them. Its own comment
 * says so.
 *
 * So they are all pressed here -- twenty-three in the panel and every control
 * on the spawn screen behind it -- with an error trap around each press,
 * because an exception inside a click handler is an uncaught error and not a
 * throw at the call site: a try/catch around `.click()` catches nothing.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const caught = [];
    const onErr = (ev) => caught.push(String(ev.message || ev.reason || ev));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);

    g.debugTeachAll();
    g.hud.toggleDebug(true);
    const label = (b) => (b.textContent || '').trim() || b.className;

    const pressAll = (sel) => {
      const out = [];
      const n = document.querySelectorAll(sel).length;
      for (let i = 0; i < n; i++) {
        const b = document.querySelectorAll(sel)[i];
        if (!b) continue;
        const name = label(b);
        const was = caught.length;
        b.click();
        // The spawn screen can be left by its own BACK; put it back so the
        // remaining controls are still reachable.
        if (sel === '#dbgSpawn button' && document.getElementById('dbgSpawn').hidden) {
          g.hud.showSpawn(true);
        }
        out.push({ name, threw: caught.length > was ? caught[caught.length - 1] : null });
      }
      return out;
    };

    const panel = pressAll('#dbgGrid button');
    g.hud.showSpawn(true);
    const spawn = pressAll('#dbgSpawn button');
    g.hud.showSpawn(false);

    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
    g.hud.toggleDebug(false);
    // Toggles are left wherever the presses put them.
    for (const k of Object.keys(g.world.debug)) g.world.debug[k] = false;
    g.restart();
    return { panel, spawn };
  });

  const broke = [...r.panel, ...r.spawn].filter((x) => x.threw);
  check('every control in the debug panel can be pressed without throwing',
    broke.length === 0 && r.panel.length >= 20 && r.spawn.length >= 40,
    `${r.panel.length} panel + ${r.spawn.length} spawn-screen controls; `
    + `${broke.length} threw${broke.length ? `: ${broke.slice(0, 3).map((b) => `${b.name} (${b.threw})`).join('; ')}` : ''}`);
}

// --- the panel's two live readouts say what is true now --------------------
/*
 * STATS wrote into its box and never cleared it, so switching the toggle off
 * left the last frame's readout sitting there: a plausible fps, phase and
 * object count that had stopped being true the moment it stopped updating.
 * The worst kind of debug output -- still there, still believable, no longer
 * measuring anything.
 *
 * HITBOXES is checked on the one thing it draws that nothing else does: a
 * full-width line across the floor. Whole-frame luminance cannot see it --
 * measured, two frames with the update loop stubbed still differ by 289k
 * while the hitboxes are worth 32k, so the frame's own noise is nine times
 * the signal and any before/after on it is reading weather.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.debugTeachAll();
    g.hud.toggleDebug(true);
    g.debugClearField();
    g.debugFillField();
    for (let i = 0; i < 60; i++) g.update(1 / 60);

    const box = () => document.getElementById('dbgStats').textContent.trim();
    const press = (t) => [...document.querySelectorAll('#dbgGrid button')]
      .find((b) => b.textContent.trim() === t).click();

    // --- STATS ---
    w.debug.stats = false; g.update(1 / 60);
    const before = box().length;
    press('STATS');
    g.update(1 / 60);
    const on = box();
    // ...and it is live, not a one-off write.
    w.kills += 7;
    g.update(1 / 60);
    const moved = box() !== on;
    press('STATS');
    g.update(1 / 60);
    const after = box().length;

    /*
     * --- HITBOXES: the floor line, which nothing else draws ---
     *
     * Measured on an offscreen canvas at a scale this case chooses, the same
     * way the TURRET-parts case renders the machine rather than screenshotting
     * the game.
     *
     * It used to read the live canvas, and could not be made to work there.
     * The line is ONE WORLD UNIT wide, so on screen it is `dpr * world scale`
     * -- and this context has no deviceScaleFactor, so that is 1 x 0.62. Six
     * tenths of a pixel over a floor band that is not black does not survive
     * the colour test at all, and the perf governor made it worse: a hundred
     * and eighty cases in it had taken the canvas to 273x591, where the line is
     * 0.43 of a pixel. So the case passed or failed on how slow the cases
     * before it had run, which is not a property of HITBOXES. Pinning
     * fx.quality does nothing on its own (the backing store is only sized
     * inside resize()); pinning it and resizing gets the canvas back but not
     * the line; overriding devicePixelRatio and resizing leaves getImageData
     * reading zeros on every row.
     *
     * At 1.43 units to the pixel the line is unambiguous, and the reading no
     * longer depends on anything the suite did beforehand. What is lost is
     * "drawn through draw()", so the button's own wiring is asserted directly
     * instead: pressing HITBOXES has to move w.debug.hitboxes, both ways.
     */
    const press2 = (t) => [...document.querySelectorAll('#dbgGrid button')]
      .find((b) => b.textContent.trim() === t).click();
    w.debug.hitboxes = false;
    press2('HITBOXES');
    const flagOn = w.debug.hitboxes;
    press2('HITBOXES');
    const flagBack = w.debug.hitboxes;

    const off = document.createElement('canvas');
    off.width = 900;
    off.height = 400;
    const oc = off.getContext('2d', { willReadFrequently: true });
    const sc = off.width / w.width;
    const band = 200; // where floorY is put in the offscreen frame
    const lineAt = (drawIt) => {
      oc.setTransform(1, 0, 0, 1, 0, 0);
      oc.clearRect(0, 0, off.width, off.height);
      oc.save();
      oc.translate(0, band - w.floorY * sc);
      oc.scale(sc, sc);
      if (drawIt) g.drawHitboxes(oc);
      oc.restore();
      const d = oc.getImageData(0, band - 4, off.width, 9).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 35 && d[i + 1] > 30 && d[i + 2] < d[i] * 0.55) n++;
      }
      return n;
    };
    const floorOff = lineAt(false);
    const floorOn = lineAt(true);
    const floorBack = lineAt(false);
    const geom = { scale: +sc.toFixed(3), px: +(sc).toFixed(2), width: off.width };
    // The line spans the whole width, so what it is worth scales with the
    // canvas -- asserted against that rather than a number copied off one run.
    const want = off.width * 0.5;

    for (const key of Object.keys(w.debug)) w.debug[key] = false;
    g.hud.toggleDebug(false);
    g.restart();
    return { before, onLen: on.length, moved, after,
      lines: on.split('\n').length, floorOff, floorOn, floorBack,
      flagOn, flagBack, geom, want };
  });

  check('STATS writes a live readout, and clears it rather than freezing it',
    r.before === 0 && r.onLen > 60 && r.lines >= 8 && r.moved && r.after === 0,
    `off ${r.before} chars -> on ${r.onLen} chars over ${r.lines} lines `
    + `(updates: ${r.moved}) -> off again ${r.after} chars`);

  /*
   * Absolute, not relative: off is zero, so a ratio against it says nothing.
   * The gap is the whole point -- the line reads 273 to 1560 depending on how
   * much of the floor row the field is sitting on, and nothing at all reads
   * between 0 and 273. The threshold goes in that gap rather than near either
   * end of it.
   */
  check('...and HITBOXES draws its floor line and takes it away again',
    r.floorOn > r.want && r.floorOff < 40 && r.floorBack < 40,
    `floor row against a control row: off ${r.floorOff}, on ${r.floorOn}, `
    + `off again ${r.floorBack} (wanted over ${Math.round(r.want)}) `
    + `| flag ${r.flagOn}/${r.flagBack} | ${JSON.stringify(r.geom)}`);
}

// --- the corruption feed is not the brightest thing in the game -------------
/*
 * The feed's inverted bands were `difference` against #ffffff. On a normal
 * image that is an invert; on this one it is a white fill, because the field
 * is 97% near-black -- so every band took a strip of the screen from luminance
 * 5 to luminance 250.
 *
 * Measured on a full field, one object attached to the turret took the screen
 * from 0.65% near-white pixels to 11.4%, and two to 14.4%. The entire game --
 * fifty-seven bodies of neon on black -- is 0.5%. The corruption feed was
 * twenty times brighter than the thing it was drawn over, and it read as
 * broken rendering rather than as something having hold of you.
 *
 * The bands difference against a dark slate now, the block noise is cold and
 * dim, the tear line is the turret's own breached red instead of white, and
 * the light that came out is paid back in displacement -- slices tear
 * vertically as well as sideways, which moves the game's own image a long way
 * for no light at all. Brightness fell to 0.57%/0.64% and the fraction of the
 * lit image the feed disturbs held at 39.6%/62.1% against 35.6%/62.4%.
 *
 * The ceiling is what is asserted. The disturbance is not, because the
 * instrument for it is poor -- see the note in the probe -- and a test that
 * cannot tell violent from bright is the test that let this ship.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { glitch } = await import('../src/glitch.js');
    g.debugTeachAll();
    g.debugClearField();
    g.debugFillField();
    g.hud.clearHint();
    g.hud.clearAlerts();
    // Let the field settle into place without the feed on it.
    w.shock = 0;
    for (let i = 0; i < 90; i++) g.update(1 / 60);

    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d');
    /* Every 5th pixel; near-white is what a plate makes and a neon outline
     * does not. */
    const read = () => {
      const d = c2.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; let bright = 0; let sum = 0;
      for (let i = 0; i < d.length; i += 20) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += L; n++;
        if (L > 200) bright++;
      }
      return { brightPct: +(bright / n * 100).toFixed(2), mean: +(sum / n).toFixed(1) };
    };

    const at = (level) => {
      glitch.level = level;
      glitch.roll += 90;
      g.draw();
      return read();
    };
    const clean = at(0);
    // CFG.glitch: 0.34 an attachment, capped at 0.92.
    const one = at(0.34);
    const two = at(0.68);
    const capped = at(0.92);
    glitch.level = 0;
    g.draw();
    g.restart();
    return { clean, one, two, capped };
  });

  const worst = Math.max(r.one.brightPct, r.two.brightPct, r.capped.brightPct);
  check('the corruption feed is not brighter than the game it is drawn over',
    worst < 2.5 && r.capped.mean < r.clean.mean * 2,
    `clean ${r.clean.brightPct}% near-white at mean ${r.clean.mean}; `
    + `one ${r.one.brightPct}%, two ${r.two.brightPct}%, `
    + `capped ${r.capped.brightPct}% at mean ${r.capped.mean}`);

  // ...and it is still doing something. A feed that lit nothing and moved
  // nothing would pass the check above.
  check('...and it is still doing something to the frame',
    r.capped.mean > r.clean.mean * 1.05 || r.capped.brightPct > r.clean.brightPct,
    `clean mean ${r.clean.mean} -> capped mean ${r.capped.mean}`);
}

// --- WARD is placed the way an ability is placed ----------------------------
/*
 * SPIRAL held this slot and this case asserted the thing SPIRAL was for: that
 * it fired the LOADED round through that round's own upgrades, which made it
 * nine abilities rather than one. That is also why it never read as an
 * ability -- what happened when you pressed it depended entirely on the
 * ammunition, so it had no picture of its own.
 *
 * What survives is the placement half, which is about the machinery rather
 * than about SPIRAL: an ability has to be in ABILITIES, buyable in the tree,
 * have a charge node, have a first-use line and be lockable. Miss one and the
 * ability is real and unreachable, or reachable and silent.
 */
{
  const r = await page.evaluate(async () => {
    const { ABILITIES } = await import('../src/abilities.js');
    const { FIRST_USE, LOCKABLE } = await import('../src/tutorial.js');
    const { NODES } = await import('../src/tree.js');
    const ids = ABILITIES.map((a) => a.id);
    const treeText = JSON.stringify(NODES.map((n) => [n.id, n.name, n.line]));
    return {
      ids,
      // Gone, root and branch: the ability, its node, its charge, its line,
      // its lock entry, and COUNTERSPIN which was its only upgrade.
      gone: !/spiral/i.test(treeText) && !ids.includes('spiral')
        && !FIRST_USE.spiral && !LOCKABLE.abilities.includes('spiral')
        && !/counterspin/i.test(treeText),
      placed: ids.includes('ward') && /open_ward/.test(treeText)
        && /charge_ward/.test(treeText) && !!FIRST_USE.ward
        && LOCKABLE.abilities.includes('ward'),
      // ...and the three that shape it.
      shaped: ['standoff', 'edged', 'fork'].filter((id) => new RegExp(`"${id}"`).test(treeText)).length,
      colours: ABILITIES.map((a) => a.color),
    };
  });

  check('WARD is placed the way an ability has to be placed, and SPIRAL is gone',
    r.placed && r.gone && r.shaped === 3,
    `in ABILITIES, in the tree, with a charge node, a first-use line and a `
    + `lock entry: ${r.placed}; SPIRAL and COUNTERSPIN gone: ${r.gone}; `
    + `${r.shaped} of 3 shaping nodes placed`);

  /*
   * Eight buttons on one strip, and the colour is the only thing telling them
   * apart at a glance once the icons are 24px. A duplicate would be two
   * controls that look like the same control.
   */
  check('...and no two abilities wear the same colour',
    new Set(r.colours).size === r.colours.length,
    `${r.colours.length} abilities, ${new Set(r.colours).size} distinct colours`);
}

// --- one voice at a time ----------------------------------------------------
/*
 * The teaching band and the boss caption are the two things in this game that
 * talk at length, and neither knew the other existed. Sampled across an
 * ordinary run on two handsets -- the opening script over a live field, eight
 * abilities, then ORDINAL -- the game was saying something in 97.4% of
 * frames, two or more surfaces were up in 47.9%, three in 10.3%, and on a
 * 320-wide screen 38.2% of frames had text landing on other text. The
 * commonest pair by a distance was the band against the caption, 84 of 340
 * frames, and the band was in all three of the top collisions.
 *
 * Three rules, and each one was needed because the measurement said so after
 * the one before it went in:
 *
 *   1. a teaching line arriving while the boss talks waits its turn,
 *   2. a caption arriving while the band reads pre-empts it and puts what it
 *      was saying back on the queue -- without this the band simply stayed,
 *      still 36 of 340 frames on a 390-wide screen,
 *   3. a pill with no room beside the band waits. On a 568-tall screen the
 *      band's top is at y=140 and the alerts column starts at 124, so a pill
 *      does not merely reach the band, it starts below it -- there is no
 *      number of pills that fits, and the first attempt, which capped the
 *      count, moved nothing at all.
 *
 * Nothing is ever dropped. A first-use line is marked said on the device at
 * the call site before it reaches the band, so a line thrown away here is a
 * line the player never gets.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const hud = g.hud;
    const showing = () => document.getElementById('abilityHint').classList.contains('show');
    const captioned = () => document.getElementById('bossCaption').classList.contains('show');
    const pills = () => document.querySelectorAll('#alerts .alert').length;

    hud.clearHint();
    hud.clearAlerts();
    hud.say(null);

    // 1. the boss is talking; a teaching line waits rather than landing on it.
    hud.say('SOMETHING HAS STOPPED COUNTING.');
    hud.showHint('PULSE is under your thumb.', true, 30);
    const deferred = { band: showing(), queued: hud.voiceHeld.length };
    // ...and it is said once the caption goes.
    hud.say(null);
    hud.updateAlerts(0.016);
    const released = { band: showing(), queued: hud.voiceHeld.length,
      text: document.getElementById('abilityHint').textContent.trim().slice(0, 24) };

    // 2. the band is reading; a caption pre-empts it and the line is kept.
    hud.clearHint();
    hud.say(null);
    hud.showHint('Broken objects leave ENERGY.', true, 30);
    const before = showing();
    hud.say('IT IS THE EDGE.');
    const preempted = { band: showing(), caption: captioned(), queued: hud.voiceHeld.length };

    // 3. a pill with no room beside the band waits for room.
    hud.say(null);
    hud.clearHint();
    hud.clearAlerts();
    hud.showHint('Broken objects leave ENERGY.', true, 30);
    const cap = hud.pillCap();
    hud.alert('MOTE RECORDED  1/37', 'found', 30);
    const pilled = { cap, shown: pills(), held: hud.pillHeld.length };
    hud.clearHint();
    hud.updateAlerts(0.016);
    const pillBack = { shown: pills(), held: hud.pillHeld.length };

    hud.clearHint(); hud.clearAlerts(); hud.say(null);
    return { deferred, released, preempted, before, pilled, pillBack,
      vh: window.innerHeight };
  });

  check('a teaching line waits while the boss is talking, and is not lost',
    r.deferred.band === false && r.deferred.queued === 1
    && r.released.band === true && r.released.queued === 0
    && /PULSE/.test(r.released.text),
    `while talking: band ${r.deferred.band}, ${r.deferred.queued} held; `
    + `after: band ${r.released.band}, says "${r.released.text}"`);

  check('...and a caption arriving pre-empts a band already reading',
    r.before === true && r.preempted.band === false
    && r.preempted.caption === true && r.preempted.queued === 1,
    `band was ${r.before}, then band ${r.preempted.band} / caption `
    + `${r.preempted.caption} with ${r.preempted.queued} put back`);

  /*
   * The pill half only bites where there is genuinely no room, which is a
   * property of the screen. On a tall one the cap is 2 and the pill shows
   * immediately -- asserting a deferral there would be asserting a bug.
   */
  const tight = r.pilled.cap < 1;
  check('...and a pill with no room beside the band waits for it',
    tight
      ? (r.pilled.shown === 0 && r.pilled.held === 1 && r.pillBack.shown === 1)
      : (r.pilled.shown === 1 && r.pilled.held === 0),
    `${r.vh}px tall, cap ${r.pilled.cap}: ${r.pilled.shown} shown / `
    + `${r.pilled.held} held, then ${r.pillBack.shown} shown once the band went`);
}

// --- a body is made of something --------------------------------------------
/*
 * Every hostile in the game was drawn by one recipe: a 16% fill, a stroke
 * between 55% and 100%, and a line 9% of the radius -- thirty-seven shapes,
 * no exceptions. So the only two things separating any body from any other
 * were hue and silhouette, and at a full field both saturate.
 *
 * Nothing new had to be invented. `density` has been in the table since the
 * physics went in, running 0.5 on a SEED to 7 on a PYLON, and `armor` has
 * been there as long; the draw read neither. Weight now comes off density and
 * plate off armour, so the table's own physics is what the field looks like.
 *
 * Asked of the pixels, like the turret's parts above, because there is no
 * eyeballing thirty shapes at three weights on a phone: render one body,
 * count how much ink is inside it, and require the light end and the heavy
 * end to be different pictures. Counting ink rather than summing the whole
 * frame, because a heavier line and a denser fill both add and a sum would
 * pass on either alone.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { materialOf } = await import('../src/enemies.js');
    const { TYPE_BY_ID } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;

    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 160;
    const c2 = cv.getContext('2d', { willReadFrequently: true });

    /*
     * One body per type, rendered at a fixed radius so this measures the
     * material and not the size. Ink is alpha-weighted coverage inside the
     * frame: a fill that got denser and a line that got thicker both raise
     * it, and a body that vanished drops it to nothing.
     */
    const ink = (id) => {
      const t = TYPE_BY_ID[id];
      if (!t) return null;
      const e = g.debugSpawn(id, 400, 400);
      if (!e) return null;
      e.spawnIn = 0; e.angle = 0; e.flash = 0; e.hp = e.maxHp; e.r = 22;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, 160, 160);
      c2.translate(80 - e.x, 80 - e.y);
      e.draw(c2, w);
      const d = c2.getImageData(0, 0, 160, 160).data;
      let sum = 0;
      for (let i = 3; i < d.length; i += 4) sum += d[i];
      e.dead = true;
      return Math.round(sum / 1000);
    };

    // Light to heavy, by the density the table already carried.
    const order = ['seed', 'drift', 'needle', 'mote', 'splitter', 'warden', 'lurcher', 'towMass', 'bulwark'];
    const got = {};
    for (const id of order) got[id] = ink(id);
    const mats = Object.fromEntries(order.map((id) => [id,
      { d: TYPE_BY_ID[id].density, ...materialOf(TYPE_BY_ID[id]) }]));
    g.restart();
    return { order, got, mats,
      plated: order.filter((id) => mats[id].plate),
      bare: order.filter((id) => !mats[id].plate) };
  });

  const light = r.got.seed;
  const heavy = r.got.bulwark;
  // Monotone is too strong -- the shapes differ, and a NEEDLE is a chevron
  // where a WARDEN is a disc. What has to hold is that the ends separate and
  // that nothing collapsed to the single recipe this replaced.
  const spread = heavy / Math.max(1, light);
  check('a body is made of something: the light end and the heavy end differ',
    spread > 1.35 && light > 0 && r.order.every((id) => r.got[id] > 0),
    `ink at r22: ${r.order.map((id) => `${id}:${r.got[id]}`).join(' ')} (heavy/light ${spread.toFixed(2)}x)`);

  const fills = r.order.map((id) => r.mats[id].fill);
  const lines = r.order.map((id) => r.mats[id].line);
  const rising = (v) => v.every((x, i) => i === 0 || x >= v[i - 1]);
  check('...and weight comes off the density the table already knew',
    rising(fills) && rising(lines)
    && fills[0] < 0.1 && fills[fills.length - 1] > 0.3
    && r.plated.length === 2 ,
    `fill ${fills.map((v) => v.toFixed(2)).join('/')}, `
    + `line ${lines.map((v) => v.toFixed(3)).join('/')}, plated ${r.plated.join(',')}`);
}

// --- nothing live is on screen behind a full-screen screen ------------------
/*
 * `body.booting` and `body.ending` each carried a list of the live HUD and
 * `{ opacity: 0; pointer-events: none }`. The last selector in both lists was
 * `#toggleRack`, and the build that replaced the toggle rack with a menu
 * deleted the element and the declaration block with it, leaving a bare
 * `body.booting` dangling before a comment. The parser then ran the two lists
 * together and fed them the NEXT rule's block, so:
 *
 * the whole live HUD then painted at full strength behind the title screen --
 * MINES, FIRE and AMMO are legible through the briefing copy, which reads as
 * a rendering fault on the first thing anybody sees. Invisible for as long as
 * nobody screenshotted it.
 *
 * Only `booting` is asserted. The `ending` half of the rule is inert: there
 * is no #endScreen element in the game any more and nothing sets the class,
 * so a green check on it would be measuring nothing -- the same trap the
 * colour parser below fell into.
 */
{
  const r = await page.evaluate(async () => {
    const o = (id) => {
      const el = document.getElementById(id);
      return el ? +getComputedStyle(el).opacity : null;
    };
    const live = ['topbar', 'abilities', 'quickBar'];
    const was = document.body.className;
    document.body.className = 'booting';
    const hit = getComputedStyle(document.getElementById('abilities')).pointerEvents;
    /*
     * Waited out, not sampled on the spot. The recede added a 0.34s opacity
     * transition to #quickBar and #abilities, so getComputedStyle right after
     * the class change returns the value the transition started from -- 1 --
     * and the first draft of this read two of the three as still painting
     * when the rule was applying correctly the whole time.
     */
    await new Promise((res) => setTimeout(res, 500));
    const booting = Object.fromEntries(live.map((id) => [id, o(id)]));
    document.body.className = was;
    await new Promise((res) => setTimeout(res, 500));
    const after = Object.fromEntries(live.map((id) => [id, o(id)]));
    return { booting, after, hit };
  });
  check('the live HUD is not painting behind the title screen',
    Object.values(r.booting).every((v) => v === 0) && r.hit === 'none'
    && Object.values(r.after).every((v) => v === 1),
    `booting ${JSON.stringify(r.booting)} (pointer-events ${r.hit}), `
    + `in play ${JSON.stringify(r.after)}`);
}

// --- the title screen is a running simulation, not a page -------------------
/*
 * `phase = 'boot'` has been commented "the title screen runs over a live
 * arena" since the first build, and the arena was empty: substrate, parallax
 * dust, nothing else. Sampled a ninth of the canvas twice 1.2s apart, 2.6% of
 * it changed. DRIFT and only DRIFT falls through it now -- the one harmless
 * type, so nothing on the title is a fight happening without a player, and
 * the two opening lines about grey being a promise are demonstrated before
 * either is said.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { driftCount, hostileCount } = await import('../src/enemies.js');
    const w = g.world;
    g.restart();
    w.phase = 'boot';
    for (const e of [...w.enemies]) e.dead = true;
    w.enemies.length = 0;
    // The top-up rides in update(), so a boot frame has to actually be run.
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    const drift = driftCount(w);
    const hostile = hostileCount(w);
    // ...and it stops the moment the run starts: from staging the director
    // owns what is on the field.
    w.phase = 'staging';
    for (const e of [...w.enemies]) e.dead = true;
    w.enemies.length = 0;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    const afterStart = w.enemies.filter((e) => !e.dead).length;
    g.restart();
    return { drift, hostile, afterStart };
  });
  check('the title screen has something falling through it, and only DRIFT',
    r.drift >= 5 && r.hostile === 0 && r.afterStart === 0,
    `${r.drift} drift, ${r.hostile} hostile on the title; `
    + `${r.afterStart} seeded after the run starts`);

  /*
   * ...and none of it costs the run a single random number.
   *
   * spawnDrift() rolls a position and two velocities off Math.random, so
   * seven bodies of scenery is twenty-odd draws against a stream that
   * scripts/fight.mjs seeds before the game is built -- and ORDINAL's
   * canonical hash moved from 117409503 to 539018592 the moment the title
   * got something to look at. The scenery runs on its own PRNG now. This
   * counts the draws rather than re-running the fight, because the fight is
   * four hundred seconds and this is the property that actually matters.
   */
  const draws = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    const real = Math.random;
    let n = 0;
    const count = (fn) => {
      n = 0;
      Math.random = () => { n++; return real(); };
      try { fn(); } finally { Math.random = real; }
      return n;
    };
    const clear = () => { for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0; };

    w.phase = 'boot';
    clear();
    const seeding = count(() => g.seedTitleField(7));
    void clear;
    const seeded = w.enemies.filter((e) => !e.dead).length;

    /*
     * Only the seeding is asserted, and deliberately.
     *
     * The per-frame top-up cannot be isolated from inside a frame: adding a
     * body changes what the rest of the frame does, and the body itself then
     * draws every frame it lives for. Three drafts tried and all three
     * measured that instead -- one frame against one frame (failed on a
     * jitter of a single draw), twenty against twenty after clearing the
     * field (81 to 52, which was the cost of burying the bodies), and the
     * same popping them instead (92 to 40, which was the cost of the new
     * body existing). Each number was real and none of them was the top-up.
     *
     * The whole-run guarantee is not this case, it is ORDINAL's canonical
     * hash: seeded, 9000 frames, 117409503, which is what caught the problem
     * in the first place when it moved to 539018592. scripts/fight.mjs is
     * where that is checked, because it is a four-hundred-second fight and
     * this suite is not the place for it. What is checked here is the part
     * that can be checked exactly.
     */
    g.restart();
    return { seeding, seeded };
  });
  check('...and the scenery does not spend the run\'s randomness',
    draws.seeding === 0 && draws.seeded > 0,
    `seeding ${draws.seeded} title bodies cost ${draws.seeding} Math.random draws`);
}

// --- the strip and the ability bar are glass, and still legible -------------
/*
 * The controls own the bottom third of the screen and everything the turret
 * emits is a circle centred on the turret, which sits 60-70% of the way down
 * it -- and worse on a bigger phone, because the furniture is a fixed height
 * while the field grows. Measured on SE / 13 / Pro Max: PRISM's burst is
 * 25/54/54% behind a control, SNARE's pull the same, DECOY's blast 34/52/49%
 * and TERMINUS's boundary -- a ring around the turret for a whole fight --
 * 40/51/47%. Half of the last boss in the game was behind four buttons.
 *
 * Two things answer it and both are asserted here. The panels went from
 * 86-92% opaque to 72-80%, so the field reads through them at all times; and
 * a beat where something big is drawn takes them down to a whisper. The
 * transparency is the part that can silently regress into unreadable, so the
 * labels are measured composited over the brightest sky the game ever paints
 * rather than over the menu's dark ground.
 */
{
  const r = await page.evaluate(async () => {
    const { ANOMALIES, ORDINAL_MOODS } = await import('../src/anomaly.js');
    /*
     * Three notations, because the first draft parsed one and silently
     * measured almost nothing.
     *
     *  - hex, because the boss skies are authored as hex. Parsing only
     *    rgba() found zero skies and let the dark default stand in as "the
     *    worst ground" -- a passing test over a measurement that had not
     *    happened.
     *  - color(srgb r g b), because every label on the strip takes its
     *    colour from `color-mix(in srgb, var(--tone) 58%, var(--dim))` and
     *    Chromium serialises that as color(srgb ...) with 0..1 floats, not
     *    as rgb(). Fifteen of the twenty-three cells were being skipped, so
     *    the case read the eight ability labels and called that the strip.
     *    (The menu's own floor above is unaffected -- checked: all 105 of
     *    its nodes serialise as rgb().)
     *  - rgb()/rgba(), which is everything else.
     */
    const px = (str) => {
      const t = String(str).trim();
      const h = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (h) {
        const v = h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1];
        return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16),
          b: parseInt(v.slice(4, 6), 16), a: 1 };
      }
      const c = t.match(/^color\(srgb\s+([^)]+)\)/i);
      if (c) {
        const [r2, g2, b2, a] = c[1].split(/[\s/]+/).filter(Boolean).map(Number);
        return { r: r2 * 255, g: g2 * 255, b: b2 * 255, a: a === undefined ? 1 : a };
      }
      const m = t.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r2, g2, b2, a] = m[1].split(',').map(Number);
      return { r: r2, g: g2, b: b2, a: a === undefined ? 1 : a };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const cr = (x, y) => { const a = L(x); const b = L(y);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

    /*
     * The worst ground a control ever sits on. Every boss rotates the sky
     * onto its own hue across four stages, so the brightest `mid` of the lot
     * is the case to measure -- not the dark staging sky the controls were
     * designed against.
     */
    const skies = [...ORDINAL_MOODS, ...ANOMALIES.flatMap((a) => a.moods || [])]
      .filter(Boolean).map((m) => px(m.mid) || px(m.top)).filter(Boolean);
    let ground = { r: 5, g: 8, b: 15, a: 1 };
    for (const c of skies) if (L(c) > L(ground)) ground = { ...c, a: 1 };

    const bad = [];
    let seen = 0;
    /*
     * The case sets its own state up. Run on whatever an earlier case left
     * behind it read nine cells out of twenty-three -- a restart empties the
     * loadout and a folded stack hides its own -- and nine cells passing is
     * not the strip passing.
     */
    const { setPref } = await import('../src/settings.js');
    window.__sim.debugTeachAll();
    setPref('showMines', 1); setPref('showAmmo', 1);
    window.__sim.hud.syncFolds();
    const cells = [...document.querySelectorAll('.qc, #abilities .ab')];
    for (const el of cells) {
      const q = el.getBoundingClientRect();
      if (!(q.height > 0)) continue;
      // The button's own painted panel, composited onto that sky.
      let bg = ground;
      for (const e of [el]) {
        const cs = getComputedStyle(e);
        // The panel is a gradient; take its darkest declared stop, which is
        // the end a label most often sits over.
        const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => px(m[0]));
        const c = stops.length ? stops.reduce((a, b) => (L(a) < L(b) ? a : b)) : px(cs.backgroundColor);
        if (c && c.a > 0) bg = over(c, bg);
      }
      const wk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = wk.nextNode())) {
        const txt = n.nodeValue.trim();
        if (!txt) continue;
        const cs = getComputedStyle(n.parentElement);
        const fg = px(cs.color);
        if (!fg || fg.a === 0) continue;
        seen++;
        const size = parseFloat(cs.fontSize);
        const ratio = cr(over(fg, bg), bg);
        if (size < 11 || ratio < 4.5) bad.push(`${txt.slice(0, 10)}@${size}px:${ratio.toFixed(2)}`);
      }
    }
    return { seen, bad, ground: `rgb(${Math.round(ground.r)},${Math.round(ground.g)},${Math.round(ground.b)})`,
      skies: skies.length, cells: cells.length };
  });
  check('every word on the strip and the ability bar clears 11px and 4.5:1 on the worst sky',
    r.bad.length === 0 && r.seen >= 20,
    `${r.seen} read over ${r.ground} (brightest of ${r.skies} boss skies); failing: ${r.bad.slice(0, 6)}`
    + ` | ${r.seen} words across ${r.cells} cells`);
}

// --- ...and the furniture gets out of the way on the beats, not on a press --
/*
 * The recede is for the beats where the screen is the point and nothing is
 * being pressed: a boss arriving, a stage turning over.
 *
 * Using an ability was on that list until build 191. Everything an ability
 * draws is a circle on the turret and the turret sits behind the controls --
 * measured across three handsets, a turret-centred effect is 25-54% behind
 * one -- so the strip dimmed itself for the length of whatever had just been
 * cast. The trouble is which frame that is: the frame you press an ability is
 * the frame you are most likely to press another, and a control that fades
 * under the thumb already on it reads as the press having failed.
 *
 * So the assertion inverted. What is checked now is that a press changes
 * nothing at all, and that the beats still do -- and both halves matter,
 * because deleting the whole mechanism would pass the first on its own.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const opacity = () => ({
      strip: +getComputedStyle(document.getElementById('quickBar')).opacity,
      abs: +getComputedStyle(document.getElementById('abilities')).opacity,
    });
    const settle = () => new Promise((res) => setTimeout(res, 420));
    g.hud.unrecede();
    await settle();
    const before = opacity();

    /* ---- a press leaves both bands alone ---- */
    g.useAbility(0);
    const onPress = {
      cls: document.body.classList.contains('recede'),
      t: g.hud.recedeT,
    };
    /*
     * Waited out, not sampled on the spot. Both bands carry a 0.34s opacity
     * transition, so getComputedStyle on the frame of the press returns the
     * value it would have been leaving -- 1 -- and a fade would read as no
     * fade at all. Long enough for one to have finished if there were one.
     */
    await settle();
    const after = opacity();

    /* ---- and a beat still takes both ---- */
    g.hud.recede(1);
    await settle();
    const beat = opacity();
    const beatCls = document.body.classList.contains('recede');
    // ...and it is still pressable while it is faint. A recede that took the
    // controls away would be worse than the occlusion it is fixing.
    const ab = document.querySelector('#abilities .ab');
    const hittable = getComputedStyle(ab).pointerEvents !== 'none';
    // The clock runs it out on its own.
    g.hud.updateAlerts(99);
    await settle();
    const back = opacity();
    g.hud.unrecede();
    return { before, onPress, after, beat, beatCls, hittable, back };
  });

  check('using an ability does not fade anything',
    r.before.strip === 1 && r.before.abs === 1
    && !r.onPress.cls && r.onPress.t === 0
    && r.after.strip === 1 && r.after.abs === 1,
    `before ${r.before.strip}/${r.before.abs}, on the press class=${r.onPress.cls} `
    + `clock=${r.onPress.t}, a third of a second later ${r.after.strip}/${r.after.abs}`);

  check('...and a boss beat still takes both bands down, and gives them back',
    r.beatCls && r.beat.strip < 0.6 && r.beat.abs < 0.6 && r.hittable
    && r.back.strip === 1 && r.back.abs === 1,
    `beat ${r.beat.strip}/${r.beat.abs} (pressable ${r.hittable}), `
    + `back to ${r.back.strip}/${r.back.abs}`);
}

// --- the TITHE mark is on the screen, and it deepens ------------------------
/*
 * `marks` drove this round's whole ramp from the day it shipped -- the damage
 * a hit adds and the salvage the body pays are both read off it -- and for
 * every build until 164 it was drawn nowhere. A round whose entire point is
 * that it gets stronger the longer you stay on one body told the player
 * nothing about which body they were on or how far in they were.
 *
 * Two things are asked, because the first draft passed the first and failed
 * the second. The mark has to be visible at all; and it has to keep saying
 * something past the eight that CFG.rounds.tithe.marks stops at, because LIEN
 * raises that cap to fourteen. The first draft placed every tick at
 * `i / 8` of a turn, so mark 9 landed exactly on mark 1 and a body worth
 * fourteen was pixel-identical to one worth eight.
 *
 * Counted rather than eyeballed: the mark is the only green thing on a
 * violet body, so green-dominant pixels are the mark and nothing else.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;

    const cv = document.createElement('canvas');
    cv.width = 200; cv.height = 200;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const e = g.debugSpawn('lurcher', 400, 400);
    e.spawnIn = 0; e.angle = 0; e.flash = 0; e.hp = e.maxHp;

    const green = (marks) => {
      e.marks = marks;
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, 200, 200);
      c2.translate(100 - e.x, 100 - e.y);
      e.draw(c2, w);
      const d = c2.getImageData(0, 0, 200, 200).data;
      let n = 0;
      // #40e693 against a violet body: green well clear of both others.
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 1] > d[i] + 26 && d[i + 1] > d[i + 2] + 26 && d[i + 1] > 60) n++;
      }
      return n;
    };

    const at = {};
    for (const m of [0, 1, 4, 8, 11, 14]) at[m] = green(m);
    e.dead = true;
    g.restart();
    return at;
  });
  const rising = [0, 1, 4, 8, 11, 14].slice(1)
    .every((m, i) => r[m] > r[[0, 1, 4, 8, 11, 14][i]]);
  check('a marked body wears its mark, and a deeper mark reads deeper',
    r[0] < 40 && r[1] > r[0] + 40 && rising,
    `green pixels by mark: ${[0, 1, 4, 8, 11, 14].map((m) => `${m}:${r[m]}`).join(' ')}`);
  check('...and it keeps saying something past the eight it stops deepening at',
    r[14] > r[8] + 60 && r[11] > r[8],
    `8 -> ${r[8]}, 11 -> ${r[11]}, 14 -> ${r[14]}`);
}

// --- the two stacks can be put away, and stay away --------------------------
/*
 * Nine mines and nine rounds is eighteen buttons down the sides of a phone,
 * and a player who has settled on two of each is carrying sixteen they never
 * press. The fold is the answer, and it has one rule that is easy to get
 * wrong: the button that folds a stack cannot be inside the part that folds,
 * or putting the stack away takes the way back with it.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const shown = (sel) => [...document.querySelectorAll(sel)]
      .filter((el) => el.getBoundingClientRect().height > 0).length;
    const press = (id) => document.getElementById(id)
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const out = { open: {}, shut: {}, back: {} };
    const read = (into) => {
      into.mines = shown('.q_mines .qc');
      into.ammo = shown('.q_ammo .qc');
      into.foldMines = shown('#foldMines');
      into.label = document.querySelector('#foldMines .qLbl').textContent;
    };
    /*
     * ...and where it sits, which is the whole of the build-210 change.
     *
     * `seat` is the button's own box and the box of the LAST slot above it, so
     * "the fold is under the stack" is asserted as geometry rather than as DOM
     * order -- `#quickBar` bottom-aligns its groups and the stack grows upward
     * off a floor line, so DOM order and screen order are only the same while
     * nobody adds a `column-reverse`.
     */
    const seat = (id) => {
      const el = document.getElementById(id);
      const b = el.getBoundingClientRect();
      const group = el.closest('.qGroup');
      const above = [...group.querySelectorAll('.qc:not(.fold)')]
        .filter((c) => c.getBoundingClientRect().height > 0)
        .map((c) => c.getBoundingClientRect());
      const mid = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width),
        // Every visible slot is above it, and none overlaps it.
        under: above.every((c) => c.bottom <= b.top + 1),
        cells: above.length,
        groupBottom: Math.round(group.getBoundingClientRect().bottom),
        // ...and nothing is sitting on top of it: the aim row spans the bar at
        // this height and `#abilities` is 14px below the floor line.
        onTop: mid === el || el.contains(mid),
        live: getComputedStyle(el).pointerEvents !== 'none',
      };
    };
    g.hud.syncFolds();
    read(out.open);
    out.seatOpen = seat('foldMines');
    out.seatAmmo = seat('foldAmmo');
    press('foldMines'); press('foldAmmo');
    read(out.shut);
    out.seatShut = seat('foldMines');
    press('foldMines'); press('foldAmmo');
    read(out.back);
    // The bar is rebuilt from the arsenal's defaults on every purchase, so the
    // seat has to survive one. See the AUTO AIM trap in CLAUDE.md.
    g.hud.buildStrip();
    g.hud.syncFolds();
    out.seatRebuilt = seat('foldMines');
    return out;
  });
  check('folding a stack puts it away and leaves the way back',
    r.shut.mines === 1 && r.shut.ammo === 1 && r.shut.foldMines === 1
    && r.open.mines > 1 && r.back.mines === r.open.mines
    && r.shut.label === 'MINES' && r.open.label === '',
    `open ${r.open.mines}/${r.open.ammo}, folded ${r.shut.mines}/${r.shut.ammo} `
    + `(button still there: ${r.shut.foldMines}, says "${r.shut.label}"), `
    + `unfolded ${r.back.mines}/${r.back.ammo}`);

  /*
   * ---- and it does not move (build 210) ----
   *
   * The fold used to be the FIRST child of its group, at the head of the
   * column. Measured at 390x844 it sat at y 570 with the stack open and y 726
   * with it shut: 156px of travel on the one control in the bar whose entire
   * job is to be in the same place both times, and 156px is most of a thumb's
   * reach on a phone. The stack grows upward off a floor line that never
   * moves, so the foot of the column is the only seat in it that does not --
   * and it lands level with the MINES and AMMO buttons in the bands either
   * side, which are bottom-aligned for the same reason.
   *
   * Asserted as geometry, as a hit test, and across a rebuild. The hit test is
   * the one that matters: `#aimModes` spans the whole bar at this height and
   * `#abilities` starts 14px below the floor line, so a control moved down
   * here can be perfectly positioned and still be under something.
   */
  check('the fold sits at the foot of its stack, and stays there when it folds',
    r.seatOpen.under && r.seatOpen.cells > 1 && r.seatShut.cells === 0
    && r.seatOpen.bottom === r.seatShut.bottom
    && r.seatOpen.bottom === r.seatOpen.groupBottom
    && r.seatAmmo.under && r.seatAmmo.bottom === r.seatOpen.bottom
    && r.seatRebuilt.bottom === r.seatOpen.bottom && r.seatRebuilt.under,
    `open: bottom ${r.seatOpen.bottom} with ${r.seatOpen.cells} cells above it `
    + `(group bottom ${r.seatOpen.groupBottom}); shut: bottom ${r.seatShut.bottom}; `
    + `AMMO side ${r.seatAmmo.bottom}; after a rebuild ${r.seatRebuilt.bottom}`);

  check('...and it is a target a thumb can actually land on, with nothing over it',
    r.seatOpen.onTop && r.seatOpen.live && r.seatOpen.h >= 28 && r.seatOpen.w >= 44
    && r.seatShut.onTop,
    `${r.seatOpen.w}x${r.seatOpen.h}, topmost at its own centre ${r.seatOpen.onTop}, `
    + `pressable ${r.seatOpen.live}; folded, topmost ${r.seatShut.onTop}`);

  // ...and the choice is a setting, so it survives the app being closed.
  const kept = await page.evaluate(async () => {
    const { pref, setPref } = await import('../src/settings.js');
    setPref('showMines', 0);
    const raw = localStorage.getItem('sim7749-prefs');
    setPref('showMines', 1);
    return { written: /showMines/.test(raw || ''), reads: pref('showMines') };
  });
  check('...and which way it was left is remembered', kept.written && kept.reads === 1,
    `written to the prefs blob: ${kept.written}`);
}

// --- nothing a boss made outlives it -----------------------------------------
/*
 * The outro is the payout, and it used to have a fight going on in it.
 *
 * A boss's death runs for eleven to nineteen seconds: the arrest, the infall,
 * the detonation, three lines of outro read at reading speed, and the salvage
 * walking home. Through all of it, whatever the boss last threw was still
 * flying at the turret, still bumping it, still being shot at by an assist
 * that had nothing else to aim at. Measured on AMPLITUDE's fourth stage, three
 * hundred objects were on the field when the bar emptied.
 *
 * So every minion a boss makes is marked as its own, and the ending takes them
 * with it -- paying out, because the energy is the player's either way, but
 * never as kills. `counts = false` could not be the mark on its own: it is set
 * on drift and on everything an APERTURE clears off the field as well.
 *
 * This walks all seven, because the mark has to be applied at every spawn site
 * in seven files and a missed one is invisible until someone watches an outro.
 * ORDINAL had exactly that: it keeps its own copy of the death sequence, so
 * the fix to the base class did nothing for it and its garrison flew on.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    const { dressOf } = await import('../src/anomaly.js');
    const out = [];
    for (let n = 1; n <= 7; n++) {
      g.restart();
      w.phase = 'staging';
      w.director.timer = 1e9; w.director.driftTimer = 1e9;
      for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
      for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;
      w.apertures[n] = 1;
      g.openBoss(n);
      const b = w.boss;
      b.arriving = 0;
      b.settle(w);
      g.update(1 / 60);

      // Far enough in that the minion clocks have fired. Every boss releases
      // on a timer from its later stages, so the fight has to actually run.
      b.enterStage(w, 3);
      const mine = () => w.enemies.filter((e) => !e.dead && e.ofBoss === n).length;
      let held = 0;
      for (let i = 0; i < 60 * 40 && w.boss && b.dying <= 0; i++) {
        g.update(1 / 60);
        held = Math.max(held, mine());
      }
      const before = mine();

      // ...and then it dies, through its own death and not a shortcut: three
      // of the seven trigger on something other than the core's body.
      const key = dressOf(n).name.toLowerCase();
      b.die(w, CFG[key]);
      const after = mine();
      let peak = 0;
      for (let i = 0; i < 60 * 30 && w.boss; i++) {
        g.update(1 / 60);
        peak = Math.max(peak, mine());
      }
      out.push({ n, key, held, before, after, peak, ended: !w.boss });
    }
    g.restart();
    return out;
  });
  const made = r.filter((x) => x.held > 0);
  const clean = r.filter((x) => x.after === 0 && x.peak === 0);
  check('nothing a boss made is still flying during its own outro',
    clean.length === 7 && made.length >= 5,
    `${made.length} of 7 had minions out during the fight (most at once: `
    + `${r.map((x) => x.held).join('/')}); left on the field once it died: `
    + `${r.map((x) => x.after).join('/')}; arriving during the outro: `
    + `${r.map((x) => x.peak).join('/')}`);
  check('...and every one of the seven reaches the end of its ending',
    r.every((x) => x.ended), `ran out: ${r.filter((x) => x.ended).length} of 7`);
}

// --- ...and nothing is left to shoot at while it happens ---------------------
/*
 * The structure is the other half of it, and it cannot be solved the same way.
 * A boss's minions can simply be destroyed when it dies; its own bodies cannot,
 * because the ending is made OF them -- the arrest snaps the frame off one
 * piece at a time and the infall pulls what is left into the core. They have to
 * still be there to be drawn.
 *
 * So they are marked `spent`: still drawn, no longer a target, and a round
 * passes straight through. Measured before it existed, AMPLITUDE had something
 * legal to shoot on 85% of the frames of its own payout, TERMINUS on 50% and
 * PARITY on 57% -- and PARITY and TERMINUS are the two that put bodies BACK
 * during the sequence, which is why the mark is re-applied every frame rather
 * than once.
 *
 * The corruption goes too. A beam or a squeeze still on the turret when the bar
 * empties is the fight carrying on past its own end.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    const { dressOf } = await import('../src/anomaly.js');
    const out = [];
    for (let n = 1; n <= 7; n++) {
      g.restart();
      w.phase = 'staging';
      w.director.timer = 1e9; w.director.driftTimer = 1e9;
      for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
      w.apertures[n] = 1;
      g.openBoss(n);
      const b = w.boss;
      b.arriving = 0;
      b.settle(w);
      g.update(1 / 60);
      b.enterStage(w, 3);
      for (let i = 0; i < 60 * 20 && w.boss && b.dying <= 0; i++) g.update(1 / 60);

      b.die(w, CFG[dressOf(n).name.toLowerCase()]);
      let targeted = 0;
      let frames = 0;
      let shock = 0;
      let drawn = 0;
      for (let i = 0; i < 60 * 30 && w.boss; i++) {
        g.update(1 / 60);
        frames++;
        if (g.autoTarget(w)) targeted++;
        shock = Math.max(shock, w.shock);
        drawn = Math.max(drawn, w.enemies.filter((e) => !e.dead && e.spent).length);
      }
      out.push({ n, targeted, frames, shock: +shock.toFixed(2), drawn });
    }
    g.restart();
    return out;
  });
  check('and nothing of it is left to shoot at while that happens',
    r.every((x) => x.targeted === 0) && r.every((x) => x.shock === 0)
    && r.some((x) => x.drawn > 0),
    `frames of the outro with a legal target: ${r.map((x) => x.targeted).join('/')} `
    + `of ${r.map((x) => x.frames).join('/')}; peak corruption `
    + `${r.map((x) => x.shock).join('/')}; bodies still drawn through it `
    + `${r.map((x) => x.drawn).join('/')}`);
}

// --- TALLY, the one heal in the back half ------------------------------------
/*
 * ORDINAL was the shortest of the seven at 174 seconds, and the reason is
 * arithmetic: a new stage re-partitions health the boss already had, so it
 * adds nothing. Only putting destroyed bodies back adds time. TALLY does
 * both jobs at once -- it counts the panels you took, in slot order, at an
 * accelerating tick, and then it re-forms them.
 *
 * Three things have to hold or the setpiece is decoration:
 *   - it fires once, on the way from III to IV, and the ladder does not skip
 *     the stage it gates (the bug class that has bitten FRACTAL, GNOMON,
 *     DYNAMO and PARITY, every time by jumping `this.stage = n` past the
 *     enter hook);
 *   - the count it reads back matches the number of panels actually gone,
 *     because the figure at the core IS that count and a wrong one is a lie
 *     told in 26px type;
 *   - the frames come back, which is the part that costs the player time.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0;
    g.update(1 / 60);

    // Walk it to the gate the honest way, so the stage ladder is under test
    // too: bleed the boss down and let its own step decide when TALLY runs.
    const seen = [];
    let gone = 0;          // panels down at the moment TALLY started
    let peak = 0;          // highest count it read out
    let ran = 0;
    let back = 0;          // panels standing once it finished
    const panels = () => bo.panels().filter((p) => !p.hidden);
    for (let k = 0; k < 60 * 240 && w.boss; k++) {
      if (seen[seen.length - 1] !== bo.stage) seen.push(bo.stage);
      const live = panels().filter((p) => !p.dead);
      // Stop breaking things once the count starts: a panel lost mid-receipt
      // moves the number the receipt is being read against.
      if (k % 6 === 0 && live.length && bo.tally === undefined) live[0].dead = true;
      /*
       * ...and the core is bled to a floor rather than to nothing. Forty
       * panels going up beside it splash, and a core parked on 1hp died to
       * that about one run in four -- which abandons the count, correctly,
       * and made this case flaky for the wrong reason. A fifth of full is
       * under both gates (TALLY 0.34, DESCENT 0.28) with room to spare.
       */
      bo.core.hp = Math.max(bo.core.maxHp * 0.2, bo.core.hp - 8);
      g.update(1 / 60);
      if (bo.tally !== undefined) {
        ran++;
        if (!gone) gone = panels().filter((p) => p.dead).length;
        peak = Math.max(peak, bo.tallyAt || 0);
      }
      if (bo.stage === 4) { back = panels().filter((p) => !p.dead).length; break; }
    }
    // The ladder is read after the loop as well as inside it: the stage that
    // ends the walk changes on the update that breaks out of it.
    if (w.boss && seen[seen.length - 1] !== bo.stage) seen.push(bo.stage);
    const out = { seen, gone, peak, ran: +(ran / 60).toFixed(1), back,
      tallyFor: CFG.ordinal.tallyFor, tallied: !!bo.tallied, coreDead: !!bo.core.dead };
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.timeScale = 1; w.shock = 0; w.bossLine = null;
    return out;
  });
  check('ORDINAL counts back what you took, and then takes it back',
    r.seen.join() === '1,2,3,4' && r.tallied && r.gone > 4 && r.peak === r.gone
    && r.ran >= r.tallyFor && r.back > 4,
    `stages ${r.seen.join(' -> ')}, TALLY ran ${r.ran}s (over ${r.tallyFor}s), `
    + `read ${r.peak} of ${r.gone} gone, ${r.back} panels standing after`
    + `${r.coreDead ? ' (the core died on the way)' : ''}`);
}

// --- DESCENT, and the captions that read at reading speed --------------------
/*
 * The fourth stage is the only one that changes where ORDINAL is: it leaves
 * its station and closes on the turret, and the beams it turns out of its
 * core are corruption while they are across you.
 *
 * The captions are here too because they were measurably wrong: the first
 * arrival line held for 1.44 seconds at 34 characters a second, of which the
 * first 0.9 was the fade-in. Anything over about fifteen a second is not a
 * line anyone read, it is a line that was on screen.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    const station = bo.y;
    bo.arriving = 0;
    g.update(1 / 60);
    bo.core.hp = bo.core.maxHp * 0.2; // straight into IV
    let peak = 0;
    let sweeps = 0;
    let was = 0;
    for (let k = 0; k < 60 * 40; k++) {
      g.update(1 / 60);
      peak = Math.max(peak, w.shock);
      if ((bo.lashing || 0) > 0 && was <= 0) sweeps++;
      was = bo.lashing || 0;
    }
    const out = { stage: bo.stage, station: Math.round(station), now: Math.round(bo.y),
      want: Math.round(w.shooter.y - CFG.ordinal.close), fall: +(bo.fall || 0).toFixed(2),
      peak: +peak.toFixed(2), lashShock: CFG.ordinal.lashShock, sweeps };
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.timeScale = 1; w.shock = 0;
    return out;
  });
  check('ORDINAL comes down in its fourth stage, and its beams cost you',
    r.stage === 4 && r.fall === 1 && Math.abs(r.now - r.want) < 4 && r.now > r.station
    && r.sweeps > 4 && r.peak >= r.lashShock * 0.9,
    `stage ${r.stage}, fell ${r.station} -> ${r.now} (wanted ${r.want}), `
    + `${r.sweeps} sweeps in 40s, corruption peaked at ${r.peak} of ${r.lashShock}`);

  // ...and no caption anywhere is faster than a person can read it.
  const cap = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const src = await (await fetch('../src/boss.js')).text();
    const out = [];
    for (const m of src.matchAll(/\{ text: '([^']+)', hold: ([\d.]+) \}/g)) {
      out.push({ text: m[1], hold: +m[2], rate: +(m[1].length / +m[2]).toFixed(1) });
    }
    return { lines: out, arrive: CFG.ordinal.arrive };
  });
  const fast = cap.lines.filter((l) => l.rate > 15);
  check('no ORDINAL caption goes by faster than it can be read',
    cap.lines.length >= 6 && fast.length === 0,
    `${cap.lines.length} lines, fastest ${Math.max(...cap.lines.map((l) => l.rate))} chars/sec`
    + `${fast.length ? ` — too fast: ${fast.map((l) => `"${l.text}" ${l.rate}`).join(', ')}` : ''}`);
}

// --- the caption and the pills never overlap ---------------------------------
/*
 * They were two absolutely positioned blocks at two fixed offsets — a caption
 * at 24% of the field and a pill stack at hud-t + 104 — which is a promise
 * that they will collide as soon as three pills are up and a caption is
 * reading. They did, on a phone, mid-outro: ORDINAL's last line printed
 * straight through REMAINDER RECOVERED.
 *
 * They share a flex column now, so not overlapping is a property of the
 * layout. This is the arithmetic that says so, against the worst case the
 * outro can actually produce.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    g.hud.say('WHAT IS LEFT OF IT IS ON THE FLOOR IN FRONT OF YOU.');
    const realSay = g.hud.say.bind(g.hud);
    g.hud.say = () => {}; // the frame loop clears it while no boss is up
    g.hud.alert('ORDINAL LEFT A REMAINDER', 'remainder', 9);
    g.hud.alert('2 HELD · RECAST, IN THE TREE', 'found', 9, '#ffb8ee');
    g.hud.alert('ORDINAL RECORDED 3/19', 'found', 9, '#ff5ec8');
    await new Promise((res) => setTimeout(res, 1400)); // let captionIn finish
    const box = (el) => {
      const q = el.getBoundingClientRect();
      return { t: Math.round(q.top), b: Math.round(q.bottom), l: Math.round(q.left), r: Math.round(q.right) };
    };
    const cap = box(document.getElementById('bossCaption'));
    const pills = [...document.querySelectorAll('#alerts .alert')].map(box);
    g.hud.say = realSay;
    g.hud.say(null);
    for (const a of [...g.hud.alerts]) a.t = 0;
    return { cap, pills, w: window.innerWidth, h: window.innerHeight };
  });
  const hits = (a, c) => !(a.b <= c.t || c.b <= a.t);
  const over = r.pills.filter((p) => hits(r.cap, p)).length;
  const boxes = [r.cap, ...r.pills];
  const off = boxes.filter((x) => x.l < 0 || x.r > r.w || x.t < 0 || x.b > r.h).length;
  const tall = r.cap.b > r.cap.t; // it has to actually be up, or this proves nothing
  check('ORDINAL\'s caption and the alert pills never overlap',
    tall && r.pills.length >= 3 && over === 0 && off === 0,
    `caption ${r.cap.t}-${r.cap.b}, ${r.pills.length} pills `
    + `${r.pills.map((p) => `${p.t}-${p.b}`).join(' ')}; ${over} overlapping, ${off} off-screen`);
}

// --- the way opening takes the whole field ----------------------------------
/*
 * "All waves stop, no more enemies except boss and his minions" has to be
 * true on the frame the way opens, not just afterwards — so everything on the
 * field is hauled into the hole and broken, paying out exactly as shooting it
 * would have.
 *
 * Including DRIFT, which was exempt on the grounds that it is grey and it is
 * scenery. True, and not the point: a dozen grey shapes still wandering
 * through the arrival say the field is not ORDINAL's when it is.
 *
 * Energy already on the floor is untouched. That is yours, not the field's,
 * and taking it would make opening the way a punishment for having just
 * cleared a wave.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const en = await import('../src/enemies.js');
    const { TYPE_BY_ID } = await import('../src/config.js');
    const { Enemy } = await import('../src/enemies.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const d of [...w.drops]) d.dead = true; w.drops.length = 0;
    g.debugGiveEnergy(9000);
    g.debugFillField();
    for (let i = 0; i < 12; i++) en.spawnDrift(w, { x: 60 + i * 40, y: 320 + (i % 4) * 130 });
    for (const e of w.enemies) { e.staged = false; e.spawnIn = 0; }
    // salvage already on the floor, which has to survive the arrival
    const mine = [];
    for (let i = 0; i < 6; i++) {
      const d = new Enemy(TYPE_BY_ID.mote, w.shooter.x + 40 + i * 12, w.shooter.y - 120,
        { drop: true, r: 4, energy: 3 });
      w.drops.push(d);
      mine.push(d);
    }
    const before = {
      hostile: w.enemies.filter((e) => !e.dead && !e.harmless).length,
      drift: w.enemies.filter((e) => !e.dead && e.harmless).length,
    };
    w.aperture = 1;
    g.openBoss();
    const after = {
      hostile: w.enemies.filter((e) => !e.dead && !e.harmless && !e.type.fixed).length,
      drift: w.enemies.filter((e) => !e.dead && e.harmless).length,
      keptMine: mine.filter((d) => !d.dead).length,
    };
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    g.restart();
    return { before, after };
  });
  check('opening the way takes the whole field, DRIFT included, and leaves your salvage',
    r.before.hostile > 10 && r.before.drift >= 10
    && r.after.hostile === 0 && r.after.drift === 0 && r.after.keptMine === 6,
    `${r.before.hostile} hostile + ${r.before.drift} drift -> `
    + `${r.after.hostile} + ${r.after.drift}; ${r.after.keptMine}/6 of your own salvage left alone`);
}

// --- the field picks up where it left off -----------------------------------
/*
 * The director is frozen while a boss is up, not reset — it returns at the
 * top of its update and nothing touches its state. So the wave that was
 * running when the way opened still has its remaining releases sitting in
 * `jobs`, and `at` still points at it.
 *
 * endBoss() used to force `resting = true`, which made the next begin() step
 * past that wave and load the following one: half a wave you were in the
 * middle of, thrown away because a boss happened. Driven, before and after
 * the same fight: `at` went 3 -> 4 and the wave with it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { WAVES } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    g.debugTeachAll();
    g.debugGiveEnergy(9000);
    const d = w.director;
    // run on until a wave is genuinely mid-release
    let guard = 0;
    while (guard++ < 30000 && !(d.jobs.length >= 3 && !d.resting)) g.update(1 / 60);
    const before = { at: d.at, wave: WAVES.indexOf(d.wave), jobs: d.jobs.length,
      order: d.order.join(','), cycle: d.cycle };

    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    bo.arriving = 0;
    g.update(1 / 60);
    bo.core.dead = true;
    for (let k = 0; k < 60 * 20 && w.boss; k++) g.update(1 / 60);
    // ...and past the beat, so it is demonstrably letting things out again
    for (let k = 0; k < 60 * 9; k++) g.update(1 / 60);
    const after = { at: d.at, wave: WAVES.indexOf(d.wave), jobs: d.jobs.length,
      order: d.order.join(','), cycle: d.cycle };
    g.restart();
    return { before, after };
  });
  const b2 = r.before;
  const a2 = r.after;
  check('the wave that was running when the way opened resumes, it is not skipped',
    b2.jobs >= 3 && a2.at === b2.at && a2.wave === b2.wave
    && a2.order === b2.order && a2.cycle === b2.cycle && a2.jobs < b2.jobs,
    `wave ${b2.wave} at ${b2.at} with ${b2.jobs} left -> wave ${a2.wave} at ${a2.at} `
    + `with ${a2.jobs} left, rotation ${a2.order === b2.order ? 'intact' : 'CHANGED'}`);
}

// --- seven ways in, one colour each ------------------------------------------
/*
 * The seven ways in are given, not bought, from build 227.
 *
 * They were an ANOMALY branch of the tree: one repeatable node each, priced
 * 100 to 500 in energy and gated `needs` on the boss before. An aperture was
 * the only thing in that tree that was not an upgrade to anything, so meeting
 * a boss cost you the gun you would meet it with.
 *
 * What it competed with is the GATE, which has done this since build 203 and
 * is now the only path: stand on an anomaly's rung and `Game.syncGate` lights
 * the banner at no cost. Build 227 nearly shipped a second granter keyed to
 * its own rungs, which would have handed ORDINAL's way in at 3 while the gate
 * held the ladder at 6 -- so what this asserts is that there is exactly ONE
 * table, that nothing sells a way in, and that the gate still lights.
 *
 * RECAST stays where it was: above every category rather than inside one,
 * because it is not an upgrade to the machine, the rack or the field.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    const { TREE, NODES } = await import('../src/tree.js');
    const { ANOMALIES } = await import('../src/anomaly.js');
    g.restart();
    w.phase = 'staging';
    g.debugGiveEnergy(9000);
    w.remainder = 2;
    const first = TREE[0];

    /*
     * The gate, walked rung by rung. A jump to the top would be standing on
     * the last one and could not tell "arrives at its own rung" from "arrives
     * eventually"; the run has to be put on each in turn.
     */
    const d = w.director;
    const gates = CFG.waves.tier.gates;
    w.reconciled.length = 0;
    for (const a of ANOMALIES) w.apertures[a.n] = 0;
    const lit = {};
    const early = [];
    for (let rung = 1; rung <= gates[gates.length - 1]; rung++) {
      d.setTier(rung);
      g.syncGate();
      for (const a of ANOMALIES) {
        if ((w.apertures[a.n] | 0) > 0 && lit[a.name] === undefined) {
          lit[a.name] = rung;
          if (rung !== gates[a.n - 1]) early.push(`${a.name} at ${rung} not ${gates[a.n - 1]}`);
        }
      }
    }

    /*
     * ...and it is topped up to one rather than added to, which is what "the
     * gate stays lit" means: opening the way spends the aperture and standing
     * on the same rung hands it back, but standing there for a hundred frames
     * does not hand back a hundred.
     */
    d.setTier(gates[0]);
    w.apertures[1] = 0;
    for (let i = 0; i < 20; i++) g.syncGate();
    const relit = w.apertures[1] | 0;
    // ...and not once the boss behind it has been put down.
    w.reconciled.push(1);
    w.apertures[1] = 0;
    g.syncGate();
    const afterDone = w.apertures[1] | 0;

    const out = {
      firstIsRecast: first.id === 'recast' && first.kind === 'upgrade',
      recastInTree: NODES.filter((n) => n.id === 'recast').length,
      slots: NODES.filter((n) => n.id && /^aperture/.test(n.id)).length,
      roots: NODES.filter((n) => n.kind === 'root').map((n) => n.key),
      builtCount: ANOMALIES.filter((a) => a.built).length,
      gates, lit, early, relit, afterDone,
    };
    w.reconciled.length = 0;
    for (const a of ANOMALIES) w.apertures[a.n] = 0;
    g.restart();
    return out;
  });

  check('no tree node sells a way in, and RECAST still sits above every branch',
    r.slots === 0 && !r.roots.includes('anomaly') && r.roots.length === 4
    && r.firstIsRecast && r.recastInTree === 1,
    `${r.slots} aperture nodes left; roots ${r.roots.join('/')}; `
    + `first row is ${r.firstIsRecast ? 'RECAST' : 'NOT recast'}`);

  check('every way in lights on its own gate rung, and none before it',
    r.early.length === 0 && Object.keys(r.lit).length === r.builtCount,
    `${r.early.join('; ') || 'each lit on its own rung'} — `
    + `${JSON.stringify(r.lit)} against gates ${r.gates.join(',')}`);

  check('...and the gate stays lit at one, and goes out once its boss is down',
    r.relit === 1 && r.afterDone === 0,
    `twenty frames on the rung with the way spent gives back ${r.relit}, not twenty; `
    + `once reconciled it gives back ${r.afterDone}`);
}

// --- options, the way in, and a save that cannot be lost to one bad write ---
{
  /*
   * Preferences are not progress. They live in their own store, they survive
   * RESET SIMULATION, and every value is clamped on the way in so a
   * hand-edited string cannot poison the game.
   */
  const r = await page.evaluate(async () => {
    const { pref, setPref, cyclePref, PREFS } = await import('../src/settings.js');
    const was = Object.fromEntries(Object.keys(PREFS).map((k) => [k, pref(k)]));
    // every one ships at its top step, and a tap steps *down* rather than
    // wrapping straight from FULL to OFF
    const first = {};
    for (const k of Object.keys(PREFS)) {
      setPref(k, PREFS[k].def);
      cyclePref(k);
      first[k] = PREFS[k].of.indexOf(pref(k));
    }
    // ...and nothing outside the allowed set can get in
    setPref('shake', 999);
    const junk = pref('shake');
    localStorage.setItem('sim7749-prefs', '{"shake":"banana","effects":0.79}');
    const stored = localStorage.getItem('sim7749-prefs');
    for (const [k, v] of Object.entries(was)) setPref(k, v);
    return { keys: Object.keys(PREFS), first, junk, def: PREFS.shake.def, stored: !!stored,
      steps: Object.fromEntries(Object.keys(PREFS).map((k) => [k, PREFS[k].of.length])) };
  });
  const stepsDown = Object.entries(r.first).every(([k, i]) => i === r.steps[k] - 2);
  check('a preference steps down, clamps, and is its own store',
    r.keys.length >= 2 && stepsDown && r.junk === r.def && r.stored,
    `${r.keys.length} prefs, first tap lands on ${JSON.stringify(r.first)} `
    + `(one below the top of ${JSON.stringify(r.steps)}), junk clamped to ${r.junk}`);

  /*
   * The energy chip is the way into the tree, and the badge on it is the same
   * count the tree writes in its own header -- one definition of affordable,
   * so the number and the screen it opens cannot disagree.
   */
  const chip = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    g.debugGiveEnergy(2600);
    g.hud.menu.setOpen(false);
    g.hud.menu.lastPurse = null;
    g.hud.menu.sync(w);
    const badge = document.getElementById('energyBuys').textContent;
    document.getElementById('energyChip').click();
    await new Promise((res) => setTimeout(res, 250));
    const opened = { open: g.hud.menu.open, tab: g.hud.menu.tab,
      shown: !document.querySelector('[data-panel="tree"]').hidden };
    g.hud.menu.syncTree();
    // Read before the restart: restart() empties the purse, and a count taken
    // after it is a count of what a fresh run can afford, not what the badge
    // was showing.
    const count = g.hud.menu.reachCount(w);
    g.hud.menu.setOpen(false);
    g.restart();
    return { badge, opened, count };
  });
  /*
   * Against reachCount, not against a line in the panel. The panel used to
   * repeat the figure as "N within reach" and this compared the two; that
   * line is gone, because a countdown to the cheapest thing reads as a queue
   * in a tree that has no order. The badge survives it -- out on the field it
   * says how many things are in reach without saying which -- so what is
   * checked now is the badge against the count it is derived from.
   */
  check('the energy chip opens the tree, and its badge is the tree\'s own count',
    chip.opened.open && chip.opened.shown && chip.opened.tab === 'tree'
    && Number(chip.badge) > 0 && Number(chip.badge) === chip.count,
    `badge ${chip.badge}, reachCount ${chip.count}, opened ${chip.opened.tab}`);

  /*
   * And the save. It used to be one setItem: a store that fills mid-write or
   * a browser that truncates on a kill left the only copy unreadable, which
   * readRun() then correctly refuses -- which reads as "my save is gone".
   */
  const save = await page.evaluate(async () => {
    const g = window.__sim;
    const { readRun } = await import('../src/save.js');
    g.restart();
    g.world.phase = 'staging';
    g.debugGiveEnergy(700);
    g.world.kills = 41;
    g.checkpoint();          // a good file, and a backup of the one before
    g.world.kills = 88;
    g.checkpoint();          // now the backup holds the 41
    const good = readRun();
    // ...and the current file is destroyed the way a bad write destroys it
    localStorage.setItem('sim7749-run', '{"v":4,"kills":88,"loadou');
    const salvaged = readRun();
    const stamped = Number.isFinite(good && good.at);
    g.restart();
    return { good: good && good.kills, salvaged: salvaged && salvaged.kills, stamped };
  });
  check('a truncated save falls back to the write before it',
    save.good === 88 && save.salvaged === 41 && save.stamped,
    `current ${save.good}, after truncating it ${save.salvaged}, timestamped ${save.stamped}`);
}

// --- the title screen fits, at the size it has always had to fit at ---------
/*
 * The two buttons are the one thing on the title screen that has to be
 * reachable without a scroll. On a 320x568 screen the briefing and the five
 * control rows already end within a pixel or two of the bottom, so anything
 * added above them is one row from pushing the buttons under the fold — a
 * record row and a resume note did exactly that, by 45px.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { codex } = await import('../src/codex.js');
    codex.record('mote');
    codex.record('ordinal');
    g.hud.showRecord();
    g.hud.offerResume();
    const box = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const q = el.getBoundingClientRect();
      return { t: Math.round(q.top), b: Math.round(q.bottom), l: Math.round(q.left),
        r: Math.round(q.right), shown: !el.hidden && q.height > 0 };
    };
    const at = (w, h) => {
      // The boot screen is laid out by CSS alone, so measuring it at another
      // size means asking the page to be that size.
      document.documentElement.style.setProperty('width', `${w}px`);
      document.documentElement.style.setProperty('height', `${h}px`);
      return null;
    };
    at(0, 0);
    document.documentElement.style.removeProperty('width');
    document.documentElement.style.removeProperty('height');
    return { start: box('startBtn'), resume: box('resumeBtn'), record: box('bootRecord'),
      vw: window.innerWidth, vh: window.innerHeight };
  });
  const overlap = r.start && r.resume && r.resume.shown
    && !(r.resume.r <= r.start.l || r.start.r <= r.resume.l);
  const off = [r.start, r.resume, r.record]
    .filter((x) => x && x.shown && (x.l < 0 || x.r > r.vw)).length;
  /*
   * ...and CONTINUE says CONTINUE. It read "CONTINUE · 137 / 500" and that
   * goal had been meaningless since build 81 — every run is endless — but it
   * survived on an accident: `endless` stopped being written to the save in
   * build 100 because nothing read it back, and this was the one thing still
   * reading it. Absent field, falsy, goal printed. The flag and CFG.killGoal
   * both went in build 186; this case is what stops the label coming back.
   */
  const label = await page.evaluate(() => {
    const g = window.__sim;
    g.debugGiveEnergy(50);
    g.world.kills = 137;
    g.checkpoint();
    g.hud.offerResume();
    return { btn: document.getElementById('resumeBtn').textContent,
      note: document.getElementById('resumeNote').textContent };
  });
  check('CONTINUE says CONTINUE, and the goal is nowhere on it',
    label.btn.trim() === 'CONTINUE' && !/\/\s*\d/.test(label.btn) && /137/.test(label.note),
    `button "${label.btn}", note "${label.note}"`);

  check('the title screen keeps its buttons on screen and side by side',
    !!r.start && !overlap && off === 0 && r.start.b <= r.vh,
    `${r.vw}x${r.vh}: NEW RUN ends at ${r.start && r.start.b}, overlap ${overlap}, `
    + `${off} off the side`);
}

// --- the boss gauge reads what is actually happening ------------------------
/*
 * It was a 6px track with a gradient in it, which says "something has health"
 * and nothing else. Three things are worth reading off it and none of them
 * were legible: how hard the last hit landed, how much of each frame is still
 * standing, and how far it is to the stage that changes the problem.
 *
 * The frame meters are notched at the *real* segment counts, so a tick going
 * out is a panel going out — which is only true while the notch count and the
 * ring table agree, and that is what this checks.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.aperture = 1;
    g.openBoss();
    const bo = w.boss;
    const read = () => {
      g.syncHud(0.016);
      const el = (id) => document.getElementById(id);
      const num = (t) => Number((String(t).match(/scaleX\(([\d.]+)\)/) || [])[1]);
      return {
        phase: el('bossPhase').textContent,
        arriving: el('bossFill').closest('.bossCore').classList.contains('arriving'),
        fill: num(el('bossFill').style.transform),
        ghost: num(el('bossGhost').style.transform),
        m3: el('bossMark3').classList.contains('past'),
        m4: el('bossMark4').classList.contains('past'),
      };
    };
    const coming = read();
    bo.arriving = 0;
    g.update(1 / 60);
    const full = read();
    // a big bite, then a moment: the ghost must not have caught up instantly
    bo.core.hp = bo.core.maxHp * 0.5;
    const hit = read();
    bo.core.hp = bo.core.maxHp * 0.2;
    const late = read();
    // ...and the ghost never rises, however the health moves
    bo.core.hp = bo.core.maxHp * 0.9;
    const healed = read();

    // the notches are the frame, not a decoration of it
    const seg = [...document.querySelectorAll('.bossShellTrack')]
      .map((t) => Number(t.style.getPropertyValue('--seg')));
    const want = CFG.ordinal.rings.map((x) => x.per * 4);

    const box = document.getElementById('bossBar').getBoundingClientRect();
    const out = { coming, full, hit, late, healed, seg, want,
      onScreen: box.left >= 0 && box.right <= window.innerWidth,
      marks: [CFG.ordinal.stageCore, CFG.ordinal.stageDescend] };
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    g.restart();
    return out;
  });
  const ok = r.coming.arriving && r.coming.phase === 'ARRIVING'
    && !r.full.arriving && r.full.fill === 1
    && r.hit.fill === 0.5 && r.late.fill === 0.2
    && r.healed.ghost <= r.late.ghost                 // the ghost only falls
    && r.full.m3 === false && r.late.m3 === true      // marks flip as they pass
    && r.full.m4 === false && r.late.m4 === true
    && JSON.stringify(r.seg) === JSON.stringify(r.want)
    && r.onScreen;
  check('the boss gauge reads arrival, damage, the frames and the next stage',
    ok,
    `arriving ${r.coming.phase}/${r.coming.arriving}; fill 1 -> ${r.hit.fill} -> ${r.late.fill}; `
    + `ghost held at ${r.healed.ghost} through a heal; stage marks ${JSON.stringify(r.marks)} `
    + `past ${r.full.m3}/${r.full.m4} -> ${r.late.m3}/${r.late.m4}; `
    + `notches ${JSON.stringify(r.seg)} against ${JSON.stringify(r.want)}`);
}

// --- the broadphase ---------------------------------------------------------
{
  const r = await page.evaluate(async () => {
    const ph = await import('../src/physics.js');
    const { MAX_BODY_R } = await import('../src/config.js');
    const cell = window.__sim.grid.cell;
    const grid = new ph.Grid(cell);
    grid.resize(700, 1700, cell);
    // two of the largest body there is, overlapping, straddling a cell edge
    const r0 = MAX_BODY_R;
    const mk = (x) => ({ x, y: 700, r: r0, vx: 0, vy: 0, av: 0, invMass: 1,
      restitution: 0.6, friction: 0.3, cruise: 60, thrown: 0 });
    let worst = 1;
    for (let gap = Math.round(2 * r0) - 1; gap > 4; gap -= 3) {
      for (let x = 1; x < cell; x += 7) {
        const bodies = [mk(x), mk(x + gap)];
        grid.build(bodies);
        let pairs = 0;
        grid.eachPair(bodies, () => { pairs++; });
        if (pairs === 0) return { cell, maxR: r0, missedAt: { x, gap } };
        worst = Math.min(worst, pairs);
      }
    }
    return { cell, maxR: r0, missedAt: null, worst };
  });
  check('the broadphase sees every overlap of the largest body', !r.missedAt, JSON.stringify(r));

  /*
   * ...and the cell is not being sized for grafts that can never happen.
   *
   * MAX_BODY_R carried a full SCION stack's growth on *every* type, including
   * the ones SCION refuses outright. FRACTAL's r-64 core was multiplied to
   * 102 by it and took the cell from 144 to 205 -- a coarser grid and more
   * pairs tested for every object in the game, and it silently changed every
   * fight that had already been tuned. A fixed body still has to fit the
   * guarantee, so it counts at its own size; it just does not count as if it
   * were carrying something it cannot be given.
   */
  const graftable = await page.evaluate(async () => {
    const { ENEMY_TYPES, CFG, MAX_BODY_R, GRID_CELL } = await import('../src/config.js');
    const grown = 1 + CFG.graft.grow * CFG.graft.stack;
    const fixed = ENEMY_TYPES.filter((t) => t.fixed);
    return {
      cell: GRID_CELL,
      max: MAX_BODY_R,
      // No fixed type may be counted as if it had grown.
      inflated: fixed.filter((t) => MAX_BODY_R < t.r * grown && MAX_BODY_R >= t.r).length,
      // ...but every fixed body still has to fit inside the guarantee.
      tooBig: fixed.filter((t) => t.r * 2 > GRID_CELL).map((t) => t.id),
      biggestFixed: Math.max(...fixed.map((t) => t.r)),
      biggestLoose: Math.max(...ENEMY_TYPES.filter((t) => !t.fixed).map((t) => t.r * grown)),
    };
  });
  check('the broadphase cell is not sized for grafts a boss can never carry',
    graftable.tooBig.length === 0
    && graftable.max === Math.max(graftable.biggestFixed, graftable.biggestLoose)
    && graftable.cell >= 2 * graftable.biggestFixed,
    `cell ${graftable.cell}, max body ${graftable.max} `
    + `(biggest fixed ${graftable.biggestFixed}, biggest graftable ${graftable.biggestLoose})`
    + `${graftable.tooBig.length ? `; TOO BIG: ${graftable.tooBig}` : ''}`);
}

/*
 * One card, one target.
 *
 * The tree row had three: a gutter that opened it, a body that armed it, and
 * a price that bought it -- so looking inside a round was the same gesture as
 * spending nine hundred on it, and the left edge of a leaf was a dead zone
 * that swallowed the buy. It was fixed once, and the first draft of the plan
 * that replaced the tree proposed it again at a larger size.
 *
 * What is checked is that the price says a price on exactly the states where
 * a press would spend and a readout on every state where it would not, that
 * the branch row only ever opens, and that a press anywhere on a card -- its
 * art, its text, its price -- lands on the same button.
 */
{
  /*
   * Measured at rest, not on the way in. #menu enters on a translate, so a
   * difference between two rects inside it survives being measured mid-slide
   * -- but elementFromPoint takes viewport coordinates and does not, and a
   * card still hundreds of pixels below the fold answers "nothing" rather
   * than "the wrong thing".
   */
  await page.evaluate(() => {
    const g = window.__sim;
    g.debugGiveEnergy(2600);
    g.hud.menu.setOpen(true);
    g.hud.menu.show('tree');
    // Open one, so there are cards in every state to look at.
    document.querySelectorAll('.branchRow')[1].click();
  });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.branchGrid .shopCard')]
      .filter((c) => c.offsetParent);
    const wrong = [];
    let priced = 0;
    for (const c of cards) {
      const t = c.querySelector('.shopPrice').textContent;
      const readout = t === '\u2713' || t === '\u00b7' || t === 'ISSUED';
      const locked = c.classList.contains('locked');
      const own = c.classList.contains('own');
      // A ✓ means finished, a · means behind something unbought, ISSUED means
      // the turret came with it, and anything else is a number you can be
      // charged. Nothing else is legal.
      const should = c.classList.contains('issued') ? 'ISSUED'
        : own ? '\u2713' : locked ? '\u00b7' : 'price';
      const says = t === '\u2713' ? '\u2713' : t === '\u00b7' ? '\u00b7'
        : t === 'ISSUED' ? 'ISSUED' : 'price';
      if (should !== says) wrong.push(`${c.querySelector('.shopName').textContent}:"${t}"`);
      if (!readout) priced++;
    }
    // The caret tracks the branch, and opening never arms a purchase.
    const rows = [...document.querySelectorAll('.branchRow')];
    const shutness = [];
    for (let i = 0; i < 2; i++) {
      shutness.push(rows[1].parentElement.classList.contains('shut'));
      rows[1].click();
    }
    /*
     * The two carets are read at the same moment, off two different branches
     * -- one open and one shut -- rather than off one branch before and after
     * a press. The rotation is a 0.16s transition, so measured immediately
     * after a click it is still halfway there and both reads come back the
     * same number.
     */
    const open = rows.find((x) => !x.parentElement.classList.contains('shut'))
      || rows[1];
    const shut = rows.find((x) => x.parentElement.classList.contains('shut'));
    const sin = (x) => Math.round(parseFloat(
      getComputedStyle(x.querySelector('.branchCaret')).transform.split(',')[1]) * 100);
    const said = { shutness, openTurn: sin(open), shutTurn: sin(shut) };
    const armedByBranch = !!document.querySelector('.shopCard.armed');

    // Three presses on one card -- the art, the words and the price -- and
    // all three have to land on the same button.
    const card = cards.find((c) => !c.classList.contains('locked'));
    card.scrollIntoView({ block: 'center' });
    const at = (el) => {
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return top && top.closest('.shopCard') === card;
    };
    const oneTarget = ['.shopIcon', '.shopName', '.shopPrice'].every((q) => at(card.querySelector(q)));
    window.__sim.hud.menu.setOpen(false);
    return { cards: cards.length, wrong, priced, said, armedByBranch, oneTarget,
      name: card.querySelector('.shopName').textContent };
  });
  // sin of the rotation: -45deg shut, +45deg open. Opposite signs.
  const turns = r.said.shutness[0] !== r.said.shutness[1]
    && r.said.openTurn * r.said.shutTurn < 0;
  check('a card asks for a price only when the press would spend',
    r.wrong.length === 0 && r.priced > 0 && r.cards > 0,
    `${r.priced}/${r.cards} priced; wrong: ${r.wrong.slice(0, 4)}`);
  check('a branch row only ever opens, and its caret says which way',
    turns && !r.armedByBranch, JSON.stringify(r.said) + ` armed:${r.armedByBranch}`);
  check('the whole card is one target: art, words and price all reach it',
    r.oneTarget, `${r.name}: ${r.oneTarget}`);
}

// --- the loadout sheet has a door to the tree --------------------------------
/*
 * Half of what the loadout sheet lists reads LOCKED, and a locked round is
 * unsealed in the upgrade tree and nowhere else -- so the screen that raises
 * the question had no way to the screen that answers it. There is a bar at
 * its foot now, outside the scroller so it is there when the question is
 * asked, and it lands on this group's own branch rather than on the top of
 * eighty rows.
 *
 * Two things this checks that broke while it was being built: the branch
 * counts have to partition the tree's own total (a wrong `inBranch` would
 * still produce plausible numbers), and the landing has to clear the ENERGY
 * strip, which is sticky at the top of the same scroller and parked the row
 * you were sent to underneath itself.
 */
{
  /*
   * Same rule as the tree case above: the sheet enters on a translate, so it
   * is opened, left to settle, and only then measured. Measured on the way in
   * it sits 14px lower than it ever will and reads as hanging off the bottom
   * of the screen.
   */
  /*
   * The loadout is the AMMO and MINES tabs of the menu from build 226, and the
   * door to the tree is at the foot of each tab's panel. It used to be pinned
   * outside the sheet's scroller; the panel is inside the menu's now, so what
   * is asserted is that the door is there, is this group's, is full width,
   * and is the last thing in the panel -- and that pressing it lands on the
   * branch, which is the half that matters.
   */
  const read = async (group) => {
    await page.evaluate((g) => {
      window.__sim.debugGiveEnergy(4000);
      window.__sim.hud.menu.setOpen(false);
      window.__sim.openLoadout(g);
    }, group);
    await page.waitForTimeout(320);
    return page.evaluate((g) => {
      const m = window.__sim.hud.menu;
      const bar = document.getElementById(`loadMore_${g}`);
      const list = document.getElementById(`loadList_${g}`);
      const panel = document.querySelector(`[data-panel="${g}"]`);
      const pb = panel.getBoundingClientRect();
      const bb = bar.getBoundingClientRect();
      return {
        tab: m.open && m.tab,
        group: m.group(),
        name: bar.querySelector('.loadMoreName').textContent,
        line: bar.querySelector('.loadMoreLine').textContent,
        belowList: bb.top >= list.getBoundingClientRect().bottom - 1,
        last: panel.lastElementChild === bar,
        wide: bb.width >= pb.width - 4,
        shown: getComputedStyle(panel).display !== 'none' && bb.height > 0,
      };
    }, group);
  };
  const ammo = await read('ammo');
  // Press it: the sheet goes, the tree comes up standing on AMMUNITION. Every
  // figure here is a difference between two rects, so the menu still sliding
  // in cannot spoil it.
  const jump = await page.evaluate(() => {
    const g = window.__sim;
    document.getElementById('loadMore_ammo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const landed = document.querySelector('.branchRow.landed');
    const head = document.querySelector('.menuPanel.tree .treeHead');
    return {
      sheetShut: g.hud.menu.tab !== 'ammo',
      stillOpen: g.loadoutOpen,
      menu: g.hud.menu.open && g.hud.menu.tab,
      on: landed && landed.querySelector('.branchName').textContent,
      branchOpen: !!landed && !landed.parentElement.classList.contains('shut'),
      // Clear of the ENERGY strip, which is sticky at the top of the same
      // scroller and used to park the row you were sent to underneath it.
      clearOfHead: landed
        ? Math.round(landed.getBoundingClientRect().top - head.getBoundingClientRect().bottom) : null,
    };
  });
  const mines = await read('mines');
  const rest = await page.evaluate(async () => {
    const { TREE } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    document.getElementById('loadMore_mines').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const second = document.querySelector('.branchRow.landed');
    const jump2 = { on: second && second.querySelector('.branchName').textContent,
      marks: document.querySelectorAll('.branchRow.landed').length };
    // The branch counts have to add up to the tree's own, or one of them is
    // counting rows that belong to somebody else.
    const m = g.hud.menu;
    /*
     * Derived from the tree rather than written out. This listed the five
     * roots by hand and still named `anomaly` after build 227 removed it --
     * `reachCount` returns 0 for a key that is not a branch, so the sum went
     * on matching the total and the case went on passing while asserting a
     * sum over a branch that does not exist. A hand-kept list of the thing
     * being measured cannot catch the thing being measured changing.
     */
    const roots = TREE.filter((n) => n.kind === 'root').map((n) => n.key);
    const parts = Object.fromEntries(roots.map((k) => [k, m.reachCount(w, k)]));
    const missing = m.openTo('no-such-branch-key');
    m.setOpen(false);
    g.closeLoadout();
    return { jump2, parts, total: m.reachCount(w),
      sum: roots.reduce((a, k) => a + parts[k], 0), missing };
  });
  check('each loadout tab carries a door to its own branch of the tree',
    ammo.tab === 'ammo' && mines.tab === 'mines' && ammo.group === 'arsenal'
    && ammo.name === 'AMMUNITION UPGRADES' && mines.name === 'MINE UPGRADES'
    && [ammo, mines].every((x) => x.belowList && x.last && x.wide && x.shown),
    JSON.stringify({ ammo, mines }));
  check('pressing it closes the sheet and stands the tree on that branch',
    jump.sheetShut && jump.stillOpen === null && jump.menu === 'tree'
    && jump.on === 'AMMUNITION' && jump.branchOpen && jump.clearOfHead >= 0
    && rest.jump2.on === 'MINES' && rest.jump2.marks === 1 && rest.missing === false,
    JSON.stringify({ jump, jump2: rest.jump2, unknownKey: rest.missing }));
  check('a branch count is a part of the tree count, and the parts are the whole',
    rest.sum === rest.total && rest.total > 0,
    `${JSON.stringify(rest.parts)} sums to ${rest.sum}, tree says ${rest.total}`);
}

// --- the boss engine holds seven, not one -----------------------------------
/*
 * Phase 0: ORDINAL stopped being *the* boss and became boss I of seven.
 *
 * The risk in that is entirely in the seams, and this covers the ones that
 * would fail quietly. The purse is the sharpest: `world.aperture` is now an
 * accessor onto slot 1 of `world.apertures`, and if those ever became two
 * integers instead of one view of the same integer, a run would hold ways in
 * that could not be spent. The save is next: per-boss counts were added
 * *without* bumping the version, because readSlot refuses a file whose
 * version it does not know and a bump would have thrown away the run of
 * every install that updated.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const A = await import('../src/anomaly.js');
    const out = {};

    // One integer, two names.
    w.aperture = 0;
    w.apertures[1] = 3;
    out.readsThrough = w.aperture;
    w.aperture = 5;
    out.writesThrough = w.apertures[1];
    w.aperture = -2;
    out.clamps = w.apertures[1];

    // Every anomaly has a name, a colour and a slot in the tree, and the
    // tree's seven-colour heading is the same list rather than a copy of it.
    out.seven = A.ANOMALIES.length;
    out.named = A.ANOMALIES.every((a) => a.name && /^#[0-9a-f]{6}$/i.test(a.tone));
    out.tones = A.BOSS_TONE.join(',');
    out.built = A.ANOMALIES.filter((a) => a.built).map((a) => a.n);
    out.makeable = A.ANOMALIES.filter((a) => A.makerOf(a.n)).map((a) => a.n);

    // ORDINAL's gauge ramp is the table that was authored for it, not a
    // generated approximation of it.
    out.ramp = A.dressOf(1).bar.map((x) => x.join('/')).join(' ');
    // ...and a boss that has none of its own still gets five usable pairs.
    const gen = A.dressOf(5).bar;
    out.genOk = gen.length === 5
      && gen.every((pr) => pr.length === 2 && pr.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
    const moods = A.dressOf(5).moods;
    out.moodOk = moods.length === 4
      && moods.every((m) => /^#[0-9a-f]{6}$/i.test(m.top) && m.neb.length === 3)
      // ...and it is not just ORDINAL's magenta handed back.
      && moods[0].mid !== A.dressOf(1).moods[0].mid;

    // A boss that is planned and not written refuses to be opened, and does
    // not eat the way in on its way to refusing.
    /*
     * Whichever of the seven is still unwritten -- picked from the table
     * rather than named, because naming one meant this case quietly started
     * testing a boss that had since been built, and passed by accident.
     */
    const idle = A.ANOMALIES.find((a) => !A.makerOf(a.n));
    out.idleName = idle ? idle.name : null;
    if (idle) {
      w.apertures[idle.n] = 1;
      out.unbuilt = g.openBoss(idle.n);
      out.unbuiltKept = w.apertures[idle.n];
      w.apertures[idle.n] = 0;
    } else { out.unbuilt = false; out.unbuiltKept = 1; }
    w.aperture = 0;
    return out;
  });
  check('one integer holds boss I\'s ways in, under both its names',
    r.readsThrough === 3 && r.writesThrough === 5 && r.clamps === 0,
    JSON.stringify({ read: r.readsThrough, write: r.writesThrough, clamp: r.clamps }));
  /*
   * `built` is a claim the table makes; a registered constructor is the fact.
   * Checking them against each other is what catches a boss that was written
   * and never wired up, or flagged and never written -- either of which ships
   * a slot that takes the money and opens onto nothing.
   */
  check('every anomaly is named and coloured, and built exactly when it can be made',
    r.seven === 7 && r.named && r.built.join() === r.makeable.join()
    && r.tones.split(',').length === 7 && new Set(r.tones.split(',')).size === 7,
    `${r.seven} anomalies, flagged built ${r.built}, actually makeable ${r.makeable}, `
    + `tones ${r.tones}`);
  check('a boss dresses its own gauge and sky, and ORDINAL keeps the authored one',
    r.ramp === '#a03fb0/#e6a8ff #ff5ec8/#ffb8ee #ff3fb0/#ffc2f0 #ff2f8f/#ffd0e6 #ff5470/#ffe0e6'
    && r.genOk && r.moodOk,
    `ORDINAL ramp "${r.ramp}"; generated ok ${r.genOk}; moods ok ${r.moodOk}`);
  check('a boss that is planned and not written cannot be opened, and costs nothing',
    r.unbuilt === false && r.unbuiltKept === 1,
    `${r.idleName || 'nothing'} is unwritten: opened ${r.unbuilt}, `
    + `way in ${r.unbuiltKept === 1 ? 'kept' : 'EATEN'}`);
}

// --- the save carries seven purses and does not throw the run away ----------
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { captureRun } = await import('../src/save.js');
    const out = {};

    w.apertures[1] = 2;
    w.apertures[3] = 4;
    w.reconciled = [1];
    const d = captureRun(w, g);
    out.version = d.v;
    out.wroteBoth = d.aperture === 2 && Array.isArray(d.apertures) && d.apertures[3] === 4;
    out.wroteReconciled = (d.reconciled || []).join() === '1';

    // Round trip, through the real path: written to the slot, read back by
    // resume(), which is the only thing that ever restores a run.
    localStorage.setItem('sim7749-run', JSON.stringify(d));
    g.resume();
    out.back = `${w.apertures[1]}/${w.apertures[3]}/${w.reconciled.join()}`;

    /*
     * ...and the shape every existing install has on disk: an old file with
     * `aperture` and neither of the new fields. It has to load, and boss I's
     * count has to survive it.
     */
    const old = JSON.parse(JSON.stringify(d));
    delete old.apertures;
    delete old.reconciled;
    old.aperture = 7;
    localStorage.setItem('sim7749-run', JSON.stringify(old));
    g.resume();
    out.oldLoads = `${w.aperture}/${w.apertures[1]}/${w.apertures[3]}/${w.reconciled.length}`;

    w.apertures.fill(0);
    w.reconciled.length = 0;
    localStorage.removeItem('sim7749-run');
    return out;
  });
  check('the save records every purse without bumping the version',
    r.version === 4 && r.wroteBoth && r.wroteReconciled && r.back === '2/4/1',
    JSON.stringify(r));
  check('a save written before there were seven still loads',
    r.oldLoads === '7/7/0/0', `aperture/slot1/slot3/reconciled = ${r.oldLoads}`);
}

// --- the banner names whose way it is ---------------------------------------
/*
 * It was one button in one magenta, because there was one boss. It is a list
 * now -- a row per boss whose way in is held, each in that boss's colour --
 * and the press has to carry which. Delegated, because the rows are rebuilt
 * whenever what is held changes.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    const read = () => {
      g.hud.syncBoss(w);
      const bar = document.getElementById('apertureBar');
      return {
        hidden: bar.hidden,
        rows: [...bar.querySelectorAll('.apRow')].map((b) => ({
          n: b.dataset.n,
          text: b.querySelector('.apName').textContent,
          tone: b.style.getPropertyValue('--tone'),
        })),
      };
    };
    const out = {};
    w.apertures.fill(0);
    out.none = read();
    // The case every player has today: one boss, and the row says what it has
    // always said rather than naming a thing there is only one of.
    w.apertures[1] = 1;
    out.one = read();
    w.apertures[1] = 2;
    out.two = read();
    // ...and once there is more than one kind, each is named and coloured.
    w.apertures[4] = 1;
    out.mixed = read();
    // Pressing a row opens *that* way. Boss IV is not built, so this proves
    // the number reached openBoss rather than that a boss appeared.
    const opened = [];
    const was = g.openBoss.bind(g);
    g.openBoss = (n) => { opened.push(n); return false; };
    for (const b of document.querySelectorAll('#apertureBar .apRow')) {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
    g.openBoss = was;
    out.pressed = opened.join(',');
    w.apertures.fill(0);
    g.hud.syncBoss(w);
    return out;
  });
  check('the banner is hidden with nothing held and says the old thing with one',
    r.none.hidden && r.none.rows.length === 0
    && !r.one.hidden && r.one.rows.length === 1
    && r.one.rows[0].text === 'APERTURE HELD'
    && r.two.rows[0].text === 'APERTURE HELD x2',
    JSON.stringify({ none: r.none.rows.length, one: r.one.rows, two: r.two.rows }));
  check('two kinds held are two rows, each named, coloured and pressable',
    r.mixed.rows.length === 2
    && r.mixed.rows[0].text === 'ORDINAL APERTURE HELD x2'
    && r.mixed.rows[1].text === 'AMPLITUDE APERTURE HELD'
    && r.mixed.rows[0].tone === '#ff5ec8' && r.mixed.rows[1].tone === '#2ee6c0'
    && r.pressed === '1,4',
    `${JSON.stringify(r.mixed.rows)} pressed ${r.pressed}`);
}

// --- the gauge is the boss's, not ORDINAL's ---------------------------------
/*
 * The bar read CFG.ordinal directly and assumed two shells whose segment
 * counts were written into the markup. GNOMON has one dial and DYNAMO's shell
 * is three pylons, so the boss describes its gauge and the HUD builds what it
 * is handed -- including rebuilding when the shape is not what it drew last.
 */
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    w.aperture = 1;
    g.openBoss(1);
    const boss = w.boss;
    boss.arriving = 0;
    boss.settled = false;
    g.hud.syncBoss(w);
    const rows = () => [...document.querySelectorAll('#bossShell .bossShellRow')]
      .map((x) => `${x.querySelector('em').textContent}:`
        + `${x.querySelector('.bossShellTrack').style.getPropertyValue('--seg')}`);
    const gauge = boss.gauge();
    const out = {
      title: document.getElementById('bossTitle').textContent,
      shells: rows().join(' '),
      seg: gauge.shells.map((sh) => sh.seg).join(','),
      real: boss.rings.map((x) => x.panels.length).join(','),
      marks: gauge.marks.map((m) => m.at).join(','),
      phase: document.getElementById('bossPhase').textContent,
      barVar: document.getElementById('bossBar').style.getPropertyValue('--boss'),
    };
    /*
     * A boss with a different number of shells gets a different number of
     * rows. Faked by overriding this one's gauge for a frame -- the point is
     * that the HUD builds what it is handed, and there is no second boss to
     * hand it anything yet.
     */
    const three = boss.gauge();
    boss.gauge = () => ({ ...three, shells: [...three.shells, { label: 'THIRD', seg: 9, frac: 0.5 }] });
    g.hud.syncBoss(w);
    out.rebuilt = rows().join(' ');
    delete boss.gauge; // back to the prototype's
    g.hud.syncBoss(w);
    return out;
  });
  check('the gauge is built from what the boss says it has',
    !!r && r.title === 'ORDINAL' && r.shells === 'OUTER:24 INNER:16'
    && r.seg === '24,16' && r.seg === r.real && r.marks === '0.6,0.28'
    && r.phase === 'I' && r.barVar === '#ff5ec8',
    JSON.stringify(r));
  check('a boss with another number of shells gets another number of rows',
    !!r && r.rebuilt === 'OUTER:24 INNER:16 THIRD:9', r && r.rebuilt);
}

// --- breaking one is recorded, and named --------------------------------------
{
  const r = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    const said = [];
    const was = g.hud.alert.bind(g.hud);
    g.hud.alert = (text, ...rest) => { said.push(text); return was(text, ...rest); };
    if (!w.boss) { w.aperture = 1; g.openBoss(1); }
    w.bossN = 1;
    w.reconciled.length = 0;
    g.endBoss();
    // Twice is once: it is a fact about the device, not a tally.
    w.aperture = 1;
    g.openBoss(1);
    w.bossN = 1;
    g.endBoss();
    g.hud.alert = was;
    const out = { reconciled: w.reconciled.join(','), said: said.filter((x) => /RECONCILED/.test(x)) };
    w.reconciled.length = 0;
    w.apertures.fill(0);
    return out;
  });
  check('breaking a boss is recorded once, under its own name',
    r.reconciled === '1' && r.said.length === 2
    && r.said.every((x) => x === 'ORDINAL RECONCILED'),
    JSON.stringify(r));
}

// --- GNOMON: the shadow is the fight ----------------------------------------
/*
 * ORDINAL's problem was alignment. GNOMON's is occlusion, and the whole fight
 * rests on one rule: a round inside the shadow dies. If that stops being true
 * the fight is a dial with holes in it and nothing else, and it would still
 * look right on screen -- which is exactly the kind of thing that ships.
 *
 * Also checked: the dial closes (a wall with gaps is not a wall), the needle
 * is real bodies rather than a drawing, NOON fires once and only once, and
 * the shadow costs the intake rather than anything that could kill you.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.apertures[2] = 1;
    g.openBoss(2);
    const boss = w.boss;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    // The dial is a closed ring of real, shootable bodies.
    out.arcs = boss.arcs.length;
    out.onField = boss.arcs.filter((p) => w.enemies.includes(p)).length;
    // ...and the needle is bodies too, not a line drawn on the field: stage
    // IV plants it beside the turret as a wall, which a drawing cannot be.
    out.needleOnField = boss.needleSegs
      .filter((p) => !p.hidden && w.enemies.includes(p)).length;

    /*
     * The rule. A round put inside the wedge dies within a frame; one put
     * outside it does not. Placed by angle off the boss rather than by
     * guessing at coordinates, so this keeps meaning what it says if the
     * needle's rest angle ever changes.
     */
    const C = CFG.gnomon;
    boss.needleA = 0; // pointing +x
    const at = (ang, rad) => ({ x: boss.x + Math.cos(ang) * rad, y: boss.y + Math.sin(ang) * rad });
    const put = (p) => {
      const q = { x: p.x, y: p.y, dead: false, hold: 0, r: 2, vx: 0, vy: 0 };
      w.projectiles.push(q);
      return q;
    };
    const inside = put(at(0, 300));
    const outside = put(at(Math.PI / 2, 300));
    // ...and one deep in the middle, which is nobody's shadow.
    const middle = put(at(0, C.shadowFrom * 0.5));
    boss.sweep(w, 1 / 60);
    out.killedInside = inside.dead;
    out.sparedOutside = outside.dead;
    out.sparedMiddle = middle.dead;
    w.projectiles.length = 0;

    // The turret in shadow is corrupted, and corruption is all it costs.
    const s = w.shooter;
    const keep = { x: s.x, y: s.y };
    w.shock = 0;
    const spot = at(0, 300);
    s.x = spot.x; s.y = spot.y;
    boss.sweep(w, 1 / 60);
    out.shockInShadow = +w.shock.toFixed(2);
    w.shock = 0;
    const clear2 = at(Math.PI / 2, 300);
    s.x = clear2.x; s.y = clear2.y;
    boss.sweep(w, 1 / 60);
    out.shockClear = +w.shock.toFixed(2);
    s.x = keep.x; s.y = keep.y;

    /*
     * NOON fires once, on its own threshold, and does not fire again. Read
     * off `noonAt` rather than written down: it moved from half a dial to a
     * third in build 139 when stage I measured at eleven percent of the
     * fight, and a case with the old number in it fails for the wrong reason.
     */
    out.noonBefore = boss.noonDone;
    out.noonNeeds = CFG.gnomon.noonAt;
    const kill = Math.ceil(boss.arcs.length * (1 - CFG.gnomon.noonAt) + 1);
    for (let i = 0; i < kill && i < boss.arcs.length; i++) boss.arcs[i].dead = true;
    g.update(1 / 60);
    out.noonAfter = boss.noonDone;
    out.noonRebuilt = boss.arcs.filter((p) => !p.dead).length;
    const wasNoon = boss.noon;
    boss.noonDone = boss.noonDone; // fire again? it must not
    for (const p of boss.arcs) p.dead = true;
    g.update(1 / 60);
    out.noonOnce = boss.noon <= wasNoon + 0.001;

    // ...and one gauge, because there is one dial.
    const gg = boss.gauge();
    out.shells = gg.shells.map((x) => `${x.label}:${x.seg}`).join(',');
    out.title = gg.title;
    g.restart();
    return out;
  });
  check('GNOMON stands up as a dial, a needle and a garrison',
    r.built === 'Gnomon' && r.arcs === 16 && r.onField === 16 && r.needleOnField === 6
    && r.shells === 'DIAL:16' && r.title === 'GNOMON',
    JSON.stringify({ arcs: r.arcs, onField: r.onField, needle: r.needleOnField,
      shells: r.shells, title: r.title }));
  check('a round inside the shadow dies and one outside it does not',
    r.killedInside === true && r.sparedOutside === false && r.sparedMiddle === false,
    `inside killed ${r.killedInside}, outside killed ${r.sparedOutside}, `
    + `inside the core's own radius killed ${r.sparedMiddle}`);
  check('the shadow costs the intake and nothing else',
    r.shockInShadow > 0 && r.shockClear === 0,
    `in shadow ${r.shockInShadow} corruption, clear of it ${r.shockClear}`);
  check('NOON strikes once, on its own threshold, and mends part of it',
    r.noonBefore === false && r.noonAfter === true && r.noonRebuilt > 0 && r.noonOnce,
    JSON.stringify({ before: r.noonBefore, after: r.noonAfter, needs: r.noonNeeds,
      arcsBack: r.noonRebuilt, onlyOnce: r.noonOnce }));
}

// --- FRACTAL: freeing, not deleting -----------------------------------------
/*
 * FRACTAL's one rule is that breaking a middle does not remove the three
 * smalls it was carrying -- it frees them. Armour becomes pressure, and the
 * order you break things in is the whole decision.
 *
 * If that silently stopped working the fight would still look right: the
 * triangles would still orbit, the bar would still fall, and it would simply
 * be a stack of health with nothing at stake. So it is checked directly, and
 * so is the conservation rule that keeps it legible -- it may never put more
 * bodies on the field than it arrived with, which is the same law that stops
 * a boss out-healing a turret.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.apertures[3] = 1;
    g.openBoss(3);
    const boss = w.boss;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    const C = CFG.fractal;
    out.mids = boss.mids.length;
    out.mites = boss.mids.reduce((n, m) => n + m.mites.length, 0);
    out.onField = boss.parts().filter((p) => w.enemies.includes(p)).length;

    // Break one middle. Its smalls must survive it, and stop being its.
    const victim = boss.mids[0];
    const theirs = victim.mites;
    victim.dead = true;
    g.update(1 / 60);
    out.freedAlive = theirs.filter((t) => !t.dead).length;
    out.freedLoose = theirs.filter((t) => !t.host).length;
    /*
     * ...and being loose has to mean something. A body the boss still places
     * every frame is armour whatever it is called; one that steers has a
     * finite mass and a cruise speed, which is the whole difference.
     */
    out.freedSteers = theirs.every((t) => t.dead
      || (Number.isFinite(t.mass) && t.cruise === TYPE_BY_ID.mite.speed));

    /*
     * RECURSION comes on the LAST middle, not the first -- changed in build
     * 138, because at one middle it fired about thirty seconds into the fight
     * and stage I was thirteen percent of it. The scene is better for it too:
     * everything the boss had is loose and the figure is a bare core, and then
     * all of it comes back at once.
     */
    out.notYet = !boss.recursed;
    for (const m of boss.mids) { if (!m.dead) { m.dead = true; } }
    g.update(1 / 60);
    out.recursing = boss.recursed;
    let guard = 0;
    while (!boss.sprangDone && guard++ < 1200) g.update(1 / 60);
    out.recursed = boss.sprangDone;
    // Everything it ever had is back -- and nothing more than it arrived with.
    out.afterMids = boss.mids.filter((m) => !m.dead).length;
    out.afterHeld = boss.mids.reduce((n, m) => n + m.mites.filter((t) => !t.dead && t.host).length, 0);
    out.bodyCount = boss.parts().length;

    /*
     * The conservation rule, pressed hard: kill everything it has and let it
     * replace for a while. It may put back what it lost and not one body more.
     */
    for (const m of boss.mids) { m.dead = true; for (const t of m.mites) t.dead = true; }
    for (let i = 0; i < 3000; i++) g.update(1 / 60);
    out.rebuiltMids = boss.mids.length;
    out.rebuiltMites = boss.mids.reduce((n, m) => n + m.mites.length, 0);
    out.heldNow = boss.mids.reduce((n, m) => n + m.mites.filter((t) => !t.dead && t.host).length, 0);

    // The bar is the sum of whatever the core currently is, against a total
    // that does not move -- so dividing into thirds is not a sudden loss.
    const before = boss.coreFrac;
    boss.core.hp = Math.round(boss.core.maxHp * 0.5);
    const half = boss.coreFrac;
    boss.divide(w);
    const after = boss.coreFrac;
    out.pieces = boss.pieces.length;
    out.frac = [+half.toFixed(3), +after.toFixed(3)];
    out.sameTotal = Math.abs(half - after) < 0.02;
    out.shells = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');
    g.restart();
    return out;
  });
  check('FRACTAL stands up as three generations of one shape',
    r.built === 'Fractal' && r.mids === 3 && r.mites === 9 && r.onField === 12
    && r.shells === 'ORBIT:12',
    JSON.stringify({ mids: r.mids, mites: r.mites, onField: r.onField, shells: r.shells }));
  check('breaking a middle frees its smalls rather than deleting them',
    r.freedAlive === 3 && r.freedLoose === 3 && r.freedSteers,
    `${r.freedAlive} of 3 survived, ${r.freedLoose} came loose, `
    + `and they steer: ${r.freedSteers}`);
  check('RECURSION waits for the whole generation, then puts it all back',
    r.notYet && r.recursing && r.recursed && r.afterMids === 3 && r.afterHeld === 9,
    JSON.stringify({ heldOff: r.notYet, started: r.recursing, finished: r.recursed,
      mids: r.afterMids, held: r.afterHeld }));
  check('it never puts more on the field than it arrived with',
    r.rebuiltMids === 3 && r.rebuiltMites === 9 && r.heldNow <= 9,
    `${r.rebuiltMids} middles and ${r.rebuiltMites} smalls exist, ${r.heldNow} held`);
  check('dividing the core is not the bar suddenly falling',
    r.pieces === 3 && r.sameTotal,
    `${r.pieces} pieces; bar went ${r.frac[0]} -> ${r.frac[1]}`);
}

// --- AMPLITUDE: the wave leans in as it loses --------------------------------
/*
 * This boss has no middle. Its body is a waveform, and the one rule holding
 * the fight together is that breaking segments makes what is left swing
 * HIGHER: it leans in as it loses.
 *
 * Both halves of law 2 are checked here. The span was chosen so the far end
 * of the wave passes inside the base aim range even at full length -- 355 of
 * 400 at the bottom of its swing, which is the whole reason the span is 460
 * and not the field's own 629 -- and the growing amplitude then brings it
 * further in rather than rescuing it. Measured at three body lengths, because
 * a boss that is legal at the start and drifts out of reach in the middle
 * looks identical while being unwinnable.
 *
 * The coil's floor is the other one: a ring that closed to nothing would be
 * the first thing in this game that could kill you.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.apertures[4] = 1;
    g.openBoss(4);
    const boss = w.boss;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    const C = CFG.amplitude;
    out.segs = boss.segs.length;
    out.onField = boss.segs.filter((p) => w.enemies.includes(p)).length;
    out.shells = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');

    // The rule: a shorter body swings higher.
    out.whole = Math.round(boss.swing());
    for (let i = 0; i < 7; i++) boss.segs[i].dead = true;
    out.half = Math.round(boss.swing());
    for (let i = 7; i < 13; i++) boss.segs[i].dead = true;
    out.bare = Math.round(boss.swing());

    /*
     * ...and it is the swing that makes the far end reachable. Walked over a
     * whole period at each length: with the body whole the far segment never
     * comes inside the base aim range, and by the time it is broken it does.
     */
    const s = w.shooter;
    const reachAt = (frac) => {
      for (const p of boss.segs) p.dead = false;
      const kill = Math.round(boss.segs.length * (1 - frac));
      for (let i = 0; i < kill; i++) boss.segs[i].dead = true;
      let best = 1e9;
      const keep = boss.phase;
      for (let i = 0; i < 120; i++) {
        boss.phase = (i / 120) * Math.PI * 2;
        // The far end of the wave, which is the hardest place to be.
        const [x, y] = boss.at(0.5, 0);
        best = Math.min(best, Math.hypot(x - s.x, y - s.y));
      }
      boss.phase = keep;
      return Math.round(best);
    };
    out.reachWhole = reachAt(1);
    out.reachHalf = reachAt(0.5);
    out.reachBare = reachAt(0.15);
    for (const p of boss.segs) p.dead = false;

    /*
     * The coil has a floor. Driven all the way in and then some, the ring
     * must never draw closer than the config says -- it presses, it does not
     * crush.
     */
    /*
     * ...and the ring has something to be made of.
     *
     * The body is reliably gone by stage IV, which left the coil empty twice
     * over -- once with no answer at all, and once with a slow mend that
     * restored segments into a trough deep enough to delete them on arrival.
     * The gather is a beat rather than a drip, and this is the thing it
     * exists to guarantee.
     */
    for (const p of boss.segs) p.dead = true;
    boss.stage = 3;
    const got = boss.gather(w);
    out.gathered = got;
    out.ringHas = boss.segs.filter((p) => !p.dead).length;
    out.ringOnField = boss.segs.filter((p) => !p.dead && w.enemies.includes(p)).length;

    boss.stage = 4;
    boss.coil = 1;
    boss.hunt = { x: s.x, y: s.y };
    let closest = 1e9;
    for (let i = 0; i < 400; i++) {
      boss.coil = Math.min(1, boss.coil + 0.02);
      boss.placeCoil(1 / 60);
      for (const p of boss.segs) {
        if (!p.dead) closest = Math.min(closest, Math.hypot(p.x - s.x, p.y - s.y));
      }
    }
    out.coilFloor = Math.round(closest);
    out.wantFloor = C.coilTo;
    // The head comes inside its own ring: outside it, the whole coil sits
    // between the turret and the only body whose death ends the fight, and
    // auto aim spends the stage chewing through it.
    out.headIn = Math.round(Math.hypot(boss.core.x - s.x, boss.core.y - s.y));
    g.restart();
    return out;
  });
  check('AMPLITUDE stands up as a waveform with a head on it',
    r.built === 'Amplitude' && r.segs === 14 && r.onField === 14
    && r.shells === 'BODY:14',
    JSON.stringify({ segs: r.segs, onField: r.onField, shells: r.shells }));
  check('a shorter wave swings higher',
    r.whole < r.half && r.half < r.bare,
    `whole ${r.whole}, half-broken ${r.half}, nearly gone ${r.bare}`);
  check('the far end of the wave is reachable at every length, and gets nearer',
    r.reachWhole <= 390 && r.reachHalf <= 390 && r.reachBare <= 390
    && r.reachBare < r.reachHalf && r.reachHalf < r.reachWhole,
    `far end comes within ${r.reachWhole} whole, ${r.reachHalf} half-broken, `
    + `${r.reachBare} nearly gone — against a base aim range of 400`);
  check('the coil presses and does not crush',
    r.coilFloor >= r.wantFloor - 2,
    `closest the ring ever came: ${r.coilFloor}, floor ${r.wantFloor}`);
  check('the wave gathers a ring to close with, and comes inside it',
    r.gathered > 0 && r.ringHas === r.gathered && r.ringOnField === r.gathered
    && r.headIn < r.coilFloor,
    `gathered ${r.gathered} segments, ${r.ringOnField} of them on the field; `
    + `head orbits at ${r.headIn} inside a ring at ${r.coilFloor}`);
}

// --- DYNAMO: the circuit is the way in --------------------------------------
/*
 * This boss took four goes to get right and every one of them failed the same
 * way: the core was reachable, so auto aim -- which picks by distance, and the
 * core blinks between pylons so it is always exactly as far as one -- put
 * about half the turret's output into it regardless of how heavily it was
 * armoured. Armour at 0.6 let the core die during stage II and stage III
 * lasted a single frame; armour at 0.88 merely wasted the fire instead and
 * stage II became sixty-two percent of the fight.
 *
 * So the core is *out of the world* while two legs stand, using the parked
 * mechanism ORDINAL's garrison proved. These check the three things that
 * makes true, plus the two ordering bugs found on the way: the shield table
 * being indexed backwards, and independent stage triggers letting the fight
 * skip a stage entirely.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.apertures[5] = 1;
    g.openBoss(5);
    const boss = w.boss;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    const C = CFG.dynamo;
    out.pylons = boss.pylons.length;
    out.onField = boss.pylons.filter((p) => w.enemies.includes(p)).length;
    out.shells = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');

    /*
     * The shelter. Three legs and two legs: unreachable. One leg: out in the
     * open. Checked by membership of world.enemies, which is the only thing
     * "unreachable" means -- nothing can shoot, blast or collide with a body
     * that is not on the field.
     */
    const reach = () => { boss.syncReach(w); return w.enemies.includes(boss.core); };
    out.reach3 = reach();
    boss.pylons[0].dead = true;
    out.reach2 = reach();
    boss.pylons[1].dead = true;
    out.reach1 = reach();
    boss.pylons[2].dead = true;
    out.reach0 = reach();

    // The shield opens as the circuit comes apart, rather than closing.
    const armorAt = (dead) => {
      boss.pylons.forEach((p, i) => { p.dead = i < dead; });
      return boss.shield();
    };
    out.armour = [0, 1, 2, 3].map(armorAt);
    // ...and it is never total: the damage floor means a whole circuit is the
    // slow way in, not no way in.
    out.neverWall = out.armour.every((a) => a < 1);

    /*
     * No stage may be skipped. Its triggers are independent -- pylons for II
     * and III, core health for IV -- so both can come true on one frame, and
     * jumping to the furthest along skipped III entirely.
     */
    boss.pylons.forEach((p) => { p.dead = true; });
    boss.core.hp = Math.round(boss.core.maxHp * 0.05);
    const seen = [boss.stage];
    let earthRan = 0;
    for (let i = 0; i < 1200 && boss.stage < 4; i++) {
      g.update(1 / 60);
      if (boss.earthing !== undefined) earthRan++;
      if (boss.stage !== seen[seen.length - 1]) seen.push(boss.stage);
    }
    out.stages = seen.join(',');
    out.ladder = seen.every((v, i) => i === 0 || v === seen[i - 1] + 1);
    out.earthRan = +(earthRan / 60).toFixed(1);
    /*
     * IV opens with the circuit STANDING. EARTH is the way into it and EARTH
     * gives the ground back, so the last stage has two movements: the circuit
     * one last time, and then the propeller. The old assertion here was that
     * no leg survived the stage change, which was right when IV had one
     * shape in it and is now exactly backwards.
     */
    out.legsAtIV = boss.pylons.filter((p) => !p.dead).length;
    out.bladesAtIV = !!boss.triad;
    // ...and the last leg still has to actually go when it goes: left alive
    // it keeps the core at a leg's worth of armour and the turret goes on
    // splitting its fire.
    for (const p of boss.pylons) p.dead = true;
    g.update(1 / 60);
    out.bladesAfter = !!boss.triad;
    out.legsAfter = boss.pylons.filter((p) => !p.dead).length;

    /*
     * The blink has to run in the stages where the core can actually be
     * touched, which is the whole of what was wrong with this fight for a
     * build. It ran only while two legs stood -- exactly when the core is
     * sheltered and unshootable -- so its signature happened entirely while
     * the player was shooting something else, and then stopped for the
     * remaining three quarters of the fight.
     */
    // Everything above killed the circuit; these need one back.
    for (const p of boss.pylons) { p.dead = false; p.hp = p.maxHp; p.retired = false; }
    boss.triad = false;
    boss.hunt = { x: w.shooter.x, y: w.shooter.y };
    out.stopsByStage = [1, 2, 3, 4].map((n) => { boss.stage = n; return boss.stops(); });
    /*
     * ...including the stretch of II with one leg left, which is the case it
     * was actually broken in: `stops()` returned the number of live pylons,
     * so with one left there was one place to stand and the blink switched
     * off. Measured, thirty one seconds of stage II produced a single blink.
     */
    boss.stage = 2;
    boss.pylons.forEach((p, i) => { p.dead = i > 0; });
    out.stopsOneLeg = boss.stops();
    const leg = boss.pylons[0];
    const seenAt = new Set();
    for (let i = 0; i < boss.stops(); i++) {
      const [sx, sy] = boss.stopAt(i);
      seenAt.add(`${Math.round(sx)},${Math.round(sy)}`);
    }
    out.pacedPlaces = seenAt.size;
    /*
     * And it paces ACROSS the leg rather than around it: every station is
     * about as far from the turret as the leg itself. Nearer and auto aim
     * spends the stretch on the core instead of the pylon; further and the
     * core hides behind its own leg. Both were measured and both cost the
     * fight -- see the note in stopAt.
     */
    const dLeg = Math.hypot(leg.x - w.shooter.x, leg.y - w.shooter.y);
    out.paceDrift = Math.round(Math.max(...[...Array(boss.stops())].map((_, i) => {
      const [sx, sy] = boss.stopAt(i);
      return Math.abs(Math.hypot(sx - w.shooter.x, sy - w.shooter.y) - dLeg);
    })));
    for (const p of boss.pylons) { p.dead = false; p.hp = p.maxHp; }
    boss.stage = 3;
    boss.at = 0;
    boss.next = -1;
    boss.tele = 0;
    boss.blinkT = 0;
    boss.lance = null;
    const where = [];
    for (let i = 0; i < 900; i++) {
      boss.stepBlink(w, 1 / 60);
      boss.place(1 / 60);
      where.push(`${Math.round(boss.x)},${Math.round(boss.y)}`);
      // A few frames past the blink, so the move it caused is recorded --
      // breaking on the lance alone stops on the very frame it happens.
      if (boss.lance && boss.lance.t < 1) break;
    }
    out.blinkedLate = new Set(where).size > 1;
    out.lanced = !!boss.lance;
    // ...and the lance is a hazard, not a decoration.
    if (boss.lance) {
      const s = w.shooter;
      const keep = { x: s.x, y: s.y };
      w.shock = 0;
      s.x = (boss.lance.ax + boss.lance.bx) / 2;
      s.y = (boss.lance.ay + boss.lance.by) / 2;
      boss.stepLance(w, 1 / 60);
      out.lanceShock = +w.shock.toFixed(2);
      w.shock = 0;
      s.x = keep.x - 4000;
      boss.stepLance(w, 1 / 60);
      out.lanceClear = +w.shock.toFixed(2);
      s.x = keep.x; s.y = keep.y;
    }
    // The circuit turns rather than standing still.
    boss.stage = 1;
    const spun = boss.pylons.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
    for (let i = 0; i < 240; i++) boss.place(1 / 60);
    out.turned = boss.pylons.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|') !== spun;
    g.restart();
    return out;
  });
  check('DYNAMO stands up as a circuit with a core inside it',
    r.built === 'Dynamo' && r.pylons === 3 && r.onField === 3
    && r.shells === 'CIRCUIT:3',
    JSON.stringify({ pylons: r.pylons, onField: r.onField, shells: r.shells }));
  check('the core cannot be reached until the circuit is down to one leg',
    r.reach3 === false && r.reach2 === false && r.reach1 === true && r.reach0 === true,
    `reachable with 3/2/1/0 legs standing: ${r.reach3}/${r.reach2}/${r.reach1}/${r.reach0}`);
  check('its shield opens as the circuit comes apart, and is never total',
    r.armour[0] > r.armour[1] && r.armour[1] > r.armour[2] && r.armour[2] > r.armour[3]
    && r.neverWall,
    `armour by legs gone: ${r.armour.join(' -> ')}`);
  check('it climbs the stages one at a time, and only EARTH opens the last',
    r.ladder && r.stages.endsWith('4') && r.earthRan >= 1,
    `stages seen: ${r.stages}; EARTH ran ${r.earthRan}s on the way into IV`);
  check('IV opens with the ground EARTH gave back, and ends without it',
    r.legsAtIV > 0 && !r.bladesAtIV && r.bladesAfter && r.legsAfter === 0,
    `legs standing at IV: ${r.legsAtIV}, propeller then: ${r.bladesAtIV}; `
    + `once the circuit falls: propeller ${r.bladesAfter}, legs ${r.legsAfter}`);
  check('it keeps blinking once the core is something you can shoot',
    r.stopsByStage.every((n) => n >= 2) && r.blinkedLate && r.lanced,
    `places it can be, by stage: ${r.stopsByStage.join('/')}; `
    + `moved in III: ${r.blinkedLate}; left a discharge: ${r.lanced}`);
  check('...and through the stretch of II where only one leg is left',
    r.stopsOneLeg >= 2 && r.pacedPlaces === r.stopsOneLeg && r.paceDrift <= 12,
    `${r.stopsOneLeg} places on one leg, ${r.pacedPlaces} of them distinct, `
    + `and none more than ${r.paceDrift} units off the leg's own range`);
  check('every blink leaves a discharge, and crossing it costs the intake',
    r.lanceShock > 0 && r.lanceClear === 0,
    `on the lance ${r.lanceShock} corruption, clear of it ${r.lanceClear}`);
  check('the circuit turns rather than standing still',
    r.turned, `pylons moved over four seconds: ${r.turned}`);
}

// --- and everywhere DYNAMO can stand is somewhere the turret can point ------
/*
 * The one law this fight kept breaking, in two places, for four builds.
 *
 * `Game.autoTarget` will not pick a body more than `CFG.shooter.aimClamp`
 * off vertical -- 78 degrees either side of straight up -- however near it
 * is. So a boss that puts itself in a ring AROUND the turret is unshootable
 * for as much of that ring as falls behind the shoulder, and if it is the
 * only thing on the field the turret has nothing to do at all.
 *
 * DYNAMO did it twice. III blinks between six stations on a circle centred
 * on the turret; IV orbits it. Measured: stage III ran 31% blind at 41 dmg/s
 * against 70 everywhere else, and stage IV ran 43% blind with the nearest
 * body inside the cone 1% of the time and damage per shot at 9.5 against 20.
 * Between them they were 46% of a 324-second fight.
 *
 * Both are arcs across the top now. This walks every station III can blink
 * to and a full sweep of IV's orbit, and asks the geometry question directly.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    const { angleDelta } = await import('../src/util.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.apertures[5] = 1;
    g.openBoss(5);
    const bo = w.boss;
    bo.arriving = 0;
    bo.settle(w);
    g.update(1 / 60);
    const C = CFG.dynamo;
    const s = w.shooter;
    const limit = CFG.shooter.aimClamp;

    const off = (x, y) => Math.abs(angleDelta(-Math.PI / 2, Math.atan2(y - s.y, x - s.x)));
    const reach = (x, y) => Math.hypot(x - s.x, y - s.y);

    // III: every station it can blink to.
    bo.stage = 3;
    bo.hunt = { x: s.x, y: s.y };
    const st = [];
    for (let i = 0; i < bo.stops(); i++) {
      const [x, y] = bo.stopAt(i);
      st.push({ off: off(x, y), d: reach(x, y) });
    }
    // IV: a full sweep of the propeller's rock, at both ends of the descent.
    bo.stage = 4;
    bo.triad = true;
    bo.orbitPhase = 0;
    const pr = [];
    for (let k = 0; k < 400; k++) {
      bo.orbitPhase += C.orbitRock / 60;
      const a = -Math.PI / 2 + Math.sin(bo.orbitPhase) * C.orbitArc;
      for (const e of [0, 1]) {
        const rr = C.orbitAt * (1 - e * 0.55);
        pr.push({ off: off(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr),
          d: reach(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr) });
      }
    }
    const worst = (xs) => +(Math.max(...xs.map((p) => p.off))).toFixed(2);
    const far = (xs) => Math.round(Math.max(...xs.map((p) => p.d)));
    const out = {
      limit: +limit.toFixed(2), range: g.aimRange,
      stations: st.length, stationOff: worst(st), stationFar: far(st),
      bladeOff: worst(pr), bladeFar: far(pr),
    };
    g.restart();
    return out;
  });
  check('everywhere it can stand is somewhere the turret can point',
    r.stations >= 2 && r.stationOff < r.limit && r.bladeOff < r.limit
    && r.stationFar <= r.range && r.bladeFar <= r.range,
    `${r.stations} stations in III, worst ${r.stationOff} rad off vertical `
    + `(cone ${r.limit}), furthest ${r.stationFar} of ${r.range}; `
    + `the propeller's sweep in IV: worst ${r.bladeOff}, furthest ${r.bladeFar}`);
}

// --- PARITY: two of everything, one of them real ----------------------------
/*
 * The whole fight is a bargain between two rules that pull against each other:
 * panes break in PAIRS, which doubles your damage on the structure, and only
 * the REAL half takes damage to the bar, which halves what you can shoot at.
 * If either one quietly stopped working the fight would look identical.
 *
 * Also checked: the shared pool, which is the one thing here with no visible
 * tell at all. Two bodies, one bar -- and the first version never emptied it,
 * because a hit big enough to take a crescent below zero killed the body
 * between frames and the killing blow was skipped. That fight ran to the
 * nine-hundred-second cap with health still on the gauge.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.apertures[6] = 1;
    g.openBoss(6);
    const boss = w.boss;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    const C = CFG.parity;
    out.halves = boss.halves.length;
    out.panes = boss.parts().length;
    out.shells = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');

    /*
     * Only one half is on the field. Its panes go with it -- a solid pane
     * hanging off a reflection would be a piece of a picture you can shoot.
     */
    const onField = () => boss.halves.map((h) => (w.enemies.includes(h) ? 1 : 0)
      + h.panes.filter((q) => !q.dead && w.enemies.includes(q)).length);
    out.reach = onField().join('/');
    // ...and it is the other one after a swap.
    boss.real = 1 - boss.real;
    boss.syncReach(w);
    out.reachAfter = onField().join('/');

    /*
     * Panes break in pairs. Kill one and its twin on the other crescent must
     * go with it -- including a twin that is currently phased, which is the
     * case that would be easiest to miss.
     */
    const a = boss.halves[0].panes[2];
    const twin = boss.halves[1].panes[2];
    a.dead = true;
    g.update(1 / 60);
    out.pairedTwin = twin.dead === true;
    out.pairedCount = boss.parts().filter((p) => p.dead).length;

    /*
     * The shared pool: hurting whichever half is real spends the one bar, and
     * a blow big enough to kill a crescent outright still comes off it rather
     * than being lost. The half comes back while the pool has anything in it.
     */
    const was = boss.coreFrac;
    const real = boss.realHalves()[0];
    real.hp -= boss.poolMax * 0.25;
    g.update(1 / 60);
    out.spent = +(was - boss.coreFrac).toFixed(2);
    out.mirrored = boss.halves.every((h) => h.retired || h.dead
      || Math.abs(h.hp - boss.pool) < 2);
    // The overkill case: dead between frames, and the pool still empties.
    const live = boss.realHalves()[0];
    live.hp = -99999;
    live.dead = true;
    g.update(1 / 60);
    out.emptied = boss.pool <= 0;
    out.ended = boss.dying > 0;
    g.restart();
    return out;
  });
  check('PARITY stands up as two halves of one mirror',
    r.built === 'Parity' && r.halves === 2 && r.panes === 14
    && r.shells === 'MIRROR:14',
    JSON.stringify({ halves: r.halves, panes: r.panes, shells: r.shells }));
  check('only one half is on the field, and its panes go with it',
    /^(0\/\d+|\d+\/0)$/.test(r.reach.replace(/(\d+)/g, (m) => m))
    && r.reach !== r.reachAfter
    && r.reach.split('/').some((x) => x === '0')
    && r.reachAfter.split('/').some((x) => x === '0'),
    `bodies on the field per half: ${r.reach}, and after a swap: ${r.reachAfter}`);
  check('a pane takes its twin with it, phased or not',
    r.pairedTwin && r.pairedCount === 2,
    `twin went too: ${r.pairedTwin}; ${r.pairedCount} panes gone from one kill`);
  check('two bodies share one bar, and an overkill still empties it',
    r.spent >= 0.2 && r.mirrored && r.emptied && r.ended,
    `a quarter-bar hit spent ${r.spent}; halves agree: ${r.mirrored}; `
    + `overkill emptied the pool: ${r.emptied}; it ended: ${r.ended}`);
}

// --- INVERSION, and the mirror that survives to the end ----------------------
/*
 * Stage IV used to shatter one crescent, which threw the fight's premise
 * away: one crescent is not a mirror, so the last stage of the mirror fight
 * had no mirror in it. Now the twin is retired from *reality* rather than
 * from the field. Four things have to hold or it is a corpse left lying:
 *
 *   - the ladder cannot skip INVERSION on the way to IV (the bug this game
 *     has shipped four times, once in this very boss);
 *   - the twin is still there, still drawn, and still NOT in world.enemies,
 *     which is the only thing "cannot be touched" has ever meant here;
 *   - it never comes back round to being real, however long the fight runs;
 *   - it loses every pane the survivor loses, because a reflection that
 *     keeps panes the original has lost is not a reflection.
 *
 * And the panes come back, which is the whole of where this build's length
 * came from.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.apertures[6] = 1;
    g.openBoss(6);
    const bo = w.boss;
    bo.arriving = 0;
    bo.settle(w);
    g.update(1 / 60);
    const C = CFG.parity;

    const seen = [];
    let ran = 0;
    let gone = 0;   // panes down when INVERSION started
    let stood = 0;  // ...and standing at that moment
    let back = 0;   // ...and standing when it finished
    let flips = 0;  // times `real` changed during it
    let lastReal = bo.real;
    // Walk it down the honest way so the ladder is under test: bleed the
    // shared bar and break panes, and let the boss decide its own stages.
    for (let k = 0; k < 60 * 300 && w.boss; k++) {
      if (seen[seen.length - 1] !== bo.stage) seen.push(bo.stage);
      if (bo.inverting === undefined) {
        const live = bo.parts().filter((q) => !q.dead && w.enemies.includes(q));
        if (k % 8 === 0 && live.length) live[0].dead = true;
        bo.pool = Math.max(bo.poolMax * 0.12, bo.pool - 30);
      } else {
        ran++;
        if (!gone) {
          gone = bo.parts().filter((q) => q.dead).length;
          stood = bo.parts().filter((q) => !q.dead).length;
        }
        if (bo.real !== lastReal) { flips++; lastReal = bo.real; }
      }
      g.update(1 / 60);
      if (bo.stage === 4) { back = bo.parts().filter((q) => !q.dead).length; break; }
    }
    if (w.boss && seen[seen.length - 1] !== bo.stage) seen.push(bo.stage);

    /*
     * Now IV proper. Run it on for a while and watch the twin: it must stay
     * on the field as a picture, never become real, and stay in step.
     */
    let everReal = false;
    let everReachable = false;
    let drifted = 0;
    const twin = bo.halves.find((h) => h.retired);
    const alive = bo.halves.find((h) => !h.retired);
    for (let k = 0; k < 60 * 30 && w.boss && bo.stage === 4; k++) {
      const live = alive.panes.filter((q) => !q.dead);
      if (k % 40 === 0 && live.length) live[0].dead = true;
      g.update(1 / 60);
      if (!twin) break;
      if (bo.realHalves().includes(twin)) everReal = true;
      if (w.enemies.includes(twin)) everReachable = true;
      if (twin.panes.some((q, i) => q.dead !== alive.panes[i].dead)) drifted++;
      if (twin.spawnIn > 0.001) drifted++;
    }
    const out = {
      seen, ran: +(ran / 60).toFixed(1), gone, stood, back, flips,
      invertFor: C.invertFor, inverted: !!bo.inverted, lone: !!bo.lone,
      twinThere: !!twin && !twin.dead, twinDrawn: !!twin && !!twin.phased,
      everReal, everReachable, drifted,
      standing: twin ? twin.panes.filter((q) => !q.dead).length : -1,
    };
    g.restart();
    return out;
  });
  check('it cannot reach its last stage without inverting first',
    r.seen.join() === '1,2,3,4' && r.inverted && r.ran >= r.invertFor
    && r.flips === 1 && r.gone > 3 && r.back > r.stood,
    `stages ${r.seen.join(' -> ')}, INVERSION ran ${r.ran}s (over ${r.invertFor}s), `
    + `reality flipped ${r.flips}x, ${r.gone} panes down and ${r.stood} standing `
    + `-> ${r.back} standing after`);
  check('the last stage keeps its mirror, and the mirror is provably empty',
    r.lone && r.twinThere && r.twinDrawn && !r.everReal && !r.everReachable
    && r.drifted === 0 && r.standing >= 0,
    `twin on the field: ${r.twinThere}, drawn as a picture: ${r.twinDrawn}, `
    + `ever real: ${r.everReal}, ever shootable: ${r.everReachable}, `
    + `frames out of step with the survivor: ${r.drifted}`);
}

// --- TERMINUS: the one that is a distance -----------------------------------
/*
 * This boss is a geometry argument, so these are geometry assertions.
 *
 * The ring is centred on the turret, which makes law 2 free -- every segment
 * is at exactly the same distance -- and makes the core's reachability a
 * question of radius rather than of armour: outside the ring it is strictly
 * further away than every segment and the assist cannot pick it; inside, it
 * is nearer than all of them and the assist takes it at once. Five bosses
 * before it proved armour cannot express priority. If either of those two
 * inequalities ever stops holding, this fight quietly becomes a different one
 * and nothing on screen says so.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.apertures[7] = 1;
    g.openBoss(7);
    const boss = w.boss;
    const C = CFG.terminus;
    const out = { built: boss.constructor.name };
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);
    const s = w.shooter;
    const far = (p) => Math.hypot(p.x - s.x, p.y - s.y);

    out.outer = boss.outer.length;
    out.inner = boss.inner.length;
    out.shells = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');
    // The arrival can be shortcut; the ring must still have come in. Parked at
    // `edge` it sits outside aim range and the fight cannot be started at all.
    out.radius = Math.round(boss.radius);

    // Law 2, for free: one distance, and it is inside reach.
    const d = boss.outer.map(far);
    out.spread = Math.round(Math.max(...d) - Math.min(...d));
    out.reach = Math.round(Math.max(...d));

    // The second ring is out of the world until it is in it.
    out.innerOff = boss.inner.every((p) => !w.enemies.includes(p));
    out.innerDrawnOnly = boss.inner.every((p) => p.hidden);
    boss.enterStage(w, 2);
    g.update(1 / 60);
    out.innerOn = boss.inner.every((p) => w.enemies.includes(p));
    out.shellsII = boss.gauge().shells.map((x) => `${x.label}:${x.seg}`).join(',');

    // Patrolling: further than every segment. Mending: nearer than all of them.
    boss.mend = null;
    boss.dip = 0;
    boss.place(1 / 60);
    const live = boss.parts().filter((p) => !p.dead);
    out.outFar = far(boss.core) > Math.max(...live.map(far)) - 0.001;
    boss.dip = 1;
    boss.place(1 / 60);
    out.inNear = far(boss.core) < Math.min(...live.map(far)) - 0.001;
    // ...and the armour follows the same dip, so the exposure is not only
    // positional. Never total in either direction.
    boss.dip = 0; boss.place(1 / 60);
    const armOut = boss.core.armor;
    boss.dip = 1; boss.place(1 / 60);
    out.armour = [+armOut.toFixed(2), +boss.core.armor.toFixed(2)];
    out.armourOpens = armOut > boss.core.armor && armOut < 1;
    boss.dip = 0;

    /*
     * The squeeze. It is the only pressure in this fight and the only one in
     * the game the player governs: a whole ring closes, an opened one springs
     * back out, and the corruption is how near it has got.
     */
    boss.radius = C.ring;
    boss.pulse = 0;
    boss.lurchT = C.lurchEvery[0];
    w.shock = 0;
    boss.stepSqueeze(w, 1 / 60);
    out.wideClear = +w.shock.toFixed(2); // at full radius it costs nothing
    /*
     * ...and between lurches it costs nothing either. The boundary corrupts
     * for the half second its shockwave is crossing you and not otherwise:
     * before build 136 it corrupted every frame it was near, which measured
     * at 76% of stage I and 95% of stage II spent glitching.
     */
    let bit = 0;
    let hi = 0;
    for (let i = 0; i < 60 * 60; i++) {
      w.shock = 0;
      boss.stepSqueeze(w, 1 / 60);
      if (w.shock > 0.001) { bit++; hi = Math.max(hi, w.shock); }
    }
    out.duty = +(bit / (60 * 60)).toFixed(2);
    out.closed = Math.round(boss.radius);
    out.tightShock = +hi.toFixed(2);
    // Break most of it and the boundary has to give ground.
    boss.outer.forEach((p, i) => { if (i % 4) p.dead = true; });
    boss.inner.forEach((p, i) => { if (i % 4) p.dead = true; });
    for (let i = 0; i < 60 * 6; i++) boss.stepSqueeze(w, 1 / 60);
    out.sprang = Math.round(boss.radius);
    // ...and it never goes past the floor, whatever happens. Law 3.
    out.neverCrushes = boss.radius >= C.floor - 0.001;

    /*
     * The mend, which is the trade this boss makes with itself: every piece of
     * boundary it puts back costs it a window inside its own ring. Capped, and
     * a revived body has to be back ON the field -- ORDINAL shipped a repair
     * that healed things outside world.enemies once, and it is a law now.
     */
    g.restart();
    w.phase = 'staging';
    w.apertures[7] = 1;
    g.openBoss(7);
    const b2 = w.boss;
    b2.arriving = 0;
    b2.settle(w);
    g.update(1 / 60);
    b2.outer[3].dead = true;
    b2.mendT = 0;
    let mends = 0;
    let target = null;
    for (let i = 0; i < 60 * 600 && mends < CFG.terminus.mendCap + 2; i++) {
      b2.place(1 / 60);
      b2.stepPatrol(w, 1 / 60);
      // Whatever it actually chose, which is not necessarily the one killed
      // last: it mends the gap it is passing.
      if (b2.mend) target = b2.mend.seg;
      if (b2.mends > mends) {
        mends = b2.mends;
        if (out.mendPut === undefined && target) {
          out.mendPut = w.enemies.includes(target) && !target.dead;
          out.mendPartial = target.hp < target.maxHp && target.hp > 0;
        }
      }
      // Keep giving it something to do, so the cap is what stops it.
      if (!b2.mend) {
        const alive = b2.outer.filter((p) => !p.dead);
        if (alive.length > 1) alive[0].dead = true;
      }
    }
    out.mends = b2.mends;
    out.mendCapped = b2.mends <= CFG.terminus.mendCap;

    /*
     * III: it drags what it can carry into a double square frame, and drops
     * the rest. Unbounded, stage III is however much boundary happened to
     * survive -- and the core has to be in reach once it is there, which the
     * plan's 470 was not.
     */
    g.restart();
    w.phase = 'staging';
    w.apertures[7] = 1;
    g.openBoss(7);
    const b3 = w.boss;
    b3.arriving = 0;
    b3.settle(w);
    b3.enterStage(w, 2);
    g.update(1 / 60);
    const before = b3.parts().filter((p) => !p.dead).length;
    b3.enterStage(w, 3);
    for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
    const kept = b3.parts().filter((p) => !p.dead);
    out.dropped = before - kept.length;
    out.carried = kept.length;
    out.keptCap = kept.length <= CFG.terminus.frameKeep;
    out.coreInReach = Math.round(Math.hypot(b3.core.x - s.x, b3.core.y - s.y));
    // Two squares, not one: the distances from the frame's centre fall into
    // two bands, and the near side of the outer one is nearer than the core.
    const off = kept.map((p) => Math.max(Math.abs(p.x - b3.fc.x), Math.abs(p.y - b3.fc.y)));
    out.bands = new Set(off.map((v) => Math.round(v / 40))).size;
    out.frameShields = Math.min(...kept.map((p) => Math.hypot(p.x - s.x, p.y - s.y)))
      < Math.hypot(b3.core.x - s.x, b3.core.y - s.y);

    // The beams strobe across the turret rather than sitting on it.
    let on = 0;
    const frames = 600;
    b3.frameK = 1;
    for (let i = 0; i < frames; i++) {
      w.shock = 0;
      b3.stepBeams(w, 1 / 60);
      if (w.shock > 0.001) on++;
    }
    out.beamDuty = +(on / frames).toFixed(2);

    w.shock = 0;
    g.restart();
    return out;
  });
  check('TERMINUS stands up as a boundary closed around the turret',
    r.built === 'Terminus' && r.outer === 32 && r.inner === 12
    && r.shells === 'BOUND:32' && r.shellsII === 'BOUND:32,INNER:12',
    JSON.stringify({ outer: r.outer, inner: r.inner, shells: r.shells, andThen: r.shellsII }));
  check('every segment is the same distance away, and all of it is in reach',
    r.spread <= 1 && r.reach <= 390 && r.radius <= 260,
    `spread ${r.spread}, furthest ${r.reach}, radius after a shortcut arrival ${r.radius}`);
  check('the second ring is out of the world until it is in it',
    r.innerOff && r.innerDrawnOnly && r.innerOn,
    `off the field first: ${r.innerOff}; on it after II: ${r.innerOn}`);
  check('the core is out of reach on patrol and in reach while it mends',
    r.outFar && r.inNear && r.armourOpens,
    `outside the ring it is furthest: ${r.outFar}; inside, nearest: ${r.inNear}; `
    + `armour ${r.armour[0]} -> ${r.armour[1]}`);
  check('the boundary lurches rather than hums, and it never crushes',
    r.wideClear === 0 && r.closed < 250 && r.tightShock > 0 && r.sprang > r.closed
    && r.neverCrushes && r.duty > 0.02 && r.duty < 0.3,
    `at full radius ${r.wideClear}; closes to ${r.closed}, corrupting on `
    + `${Math.round(r.duty * 100)}% of frames at up to ${r.tightShock}; `
    + `opened, springs back to ${r.sprang}`);
  check('a mend puts a segment back on the field, and the budget runs out',
    r.mendPut && r.mendPartial && r.mendCapped && r.mends >= 1,
    `revived onto the field: ${r.mendPut}; part-healed: ${r.mendPartial}; `
    + `${r.mends} mends against a cap`);
  check('III carries what it can into a double frame and drops the rest',
    r.keptCap && r.dropped > 0 && r.bands >= 2 && r.frameShields && r.coreInReach <= 390,
    `carried ${r.carried}, dropped ${r.dropped}, ${r.bands} bands of frame; `
    + `core at ${r.coreInReach}; frame nearer than the core: ${r.frameShields}`);
  check('the beams strobe across the turret rather than sitting on it',
    r.beamDuty > 0.05 && r.beamDuty < 0.3,
    `a beam is across the turret on ${Math.round(r.beamDuty * 100)}% of frames`);
}

// --- the last stage: wider beams, fewer of them, and less of the turn -------
/*
 * "A hazard that is simply on top of you for the whole stage is weather, not
 * a threat" is this file's own line, written when DYNAMO's propeller ran
 * stage IV at 77% corrupted frames. TERMINUS was doing the same thing and
 * calling it a strobe: six beams at 0.46 rad/s come round every 2.3 seconds,
 * world shock decays over about a second, and the decay never finished --
 * measured, 58% of the last stage.
 *
 * The plan wanted the beams to WIDEN as the core goes, so the end of the
 * fight is crimson wedges rather than lines. Widening alone took it to 74%.
 * So fewer of them turn as they widen, and the test is the arithmetic that
 * makes that work: the total share of a turn covered must not rise, while a
 * single beam must get substantially fatter.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.apertures[7] = 1;
    g.openBoss(7);
    const b = w.boss;
    b.arriving = 0;
    b.settle(w);
    b.stage = 4;
    b.frameK = 0;
    const C = CFG.terminus;

    // The share of a full turn a beam is across you for, at both ends of IV.
    const share = () => (2 * b.beamCount() * b.beamArc()) / (Math.PI * 2);
    b.core.hp = b.core.maxHp * C.stageBare;
    const open = { n: b.beamCount(), arc: +b.beamArc().toFixed(3), share: +share().toFixed(3) };
    b.core.hp = 1;
    const shut = { n: b.beamCount(), arc: +b.beamArc().toFixed(3), share: +share().toFixed(3) };

    /*
     * ...and the resurrected boundary wears the six tones. LAST CLOSE puts
     * every segment back up -- it is the edge, and it does not stop being the
     * edge because you took some of it away -- and the six colours bleed back
     * to crimson over the stage rather than flashing once.
     */
    b.stage = 3;
    b.openInner(w); // the second ring has to be on the field to come back up
    for (const p of b.parts()) p.dead = true;
    b.enterStage(w, 4);
    const all = b.parts();
    const tones = new Set(all.map((p) => p.tone).filter(Boolean));
    const out = {
      open, shut,
      backUp: all.filter((p) => !p.dead).length,
      total: all.length,
      tones: tones.size,
      fadeStart: +(b.toneFade || 0).toFixed(2),
      toneFor: C.toneFor,
    };
    // ...and it fades, once the edge is back up: `reclose` runs first and
    // nothing else in IV advances until it has.
    for (let i = 0; i < 60 * 30; i++) g.update(1 / 60);
    out.fadeLater = +(b.toneFade || 0).toFixed(2);
    g.restart();
    return out;
  });
  check('the beams widen as the core goes, and cover less of the turn for it',
    r.shut.arc > r.open.arc * 1.5 && r.shut.n < r.open.n
    && r.shut.share <= r.open.share && r.open.share < 0.25,
    `${r.open.n} beams at ${r.open.arc} rad covering ${Math.round(r.open.share * 100)}% `
    + `of the turn, then ${r.shut.n} at ${r.shut.arc} covering `
    + `${Math.round(r.shut.share * 100)}%`);
  check('the last stage puts the whole edge back, wearing the six before it',
    r.backUp === r.total && r.total > 40 && r.tones === 6
    && r.fadeStart === 0 && r.fadeLater > 0.1 && r.fadeLater < 1,
    `${r.backUp} of ${r.total} segments back up in ${r.tones} tones, `
    + `fading ${r.fadeStart} -> ${r.fadeLater} over ${r.toneFor}s`);
}

// --- III closes too, and does not crush anything ----------------------------
/*
 * Stage III was the weakest fifth of this fight: the frame is a compact
 * double square, a compact double square is a splash magnet, and what was
 * left was a core with beams on it until IV started. Two things changed.
 *
 * It GATHERS. `frameKeep` was only a ceiling, and ECLIPSE fires on the
 * boundary being half spent, so the frame was usually built from fewer bodies
 * than it wanted and the drop never ran at all -- stage III was however
 * little happened to survive. The fallen edge is taken up into the frame now.
 *
 * And it CLOSES. A square boundary shrinking on the turret, which is the
 * ring's own move in the shape the ring turned into, rather than a distant
 * object that happens to be square. Law 3 still holds: it presses, it never
 * crushes, and that is the number this case exists to pin.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { CFG } = await import('../src/config.js');
    g.restart();
    w.phase = 'staging';
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    w.apertures[7] = 1;
    g.openBoss(7);
    const b = w.boss;
    const s = w.shooter;
    b.arriving = 0;
    b.settle(w);
    b.enterStage(w, 2);
    g.update(1 / 60);
    const C = CFG.terminus;

    // Spend the boundary the way ECLIPSE guarantees it will be spent.
    const all = b.parts();
    for (let i = 0; i < all.length; i++) if (i % 4) all[i].dead = true;
    const left = b.parts().filter((p) => !p.dead).length;
    b.enterStage(w, 3);
    for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
    const out = { left, gathered: b.parts().filter((p) => !p.dead).length, keep: C.frameKeep };

    // Now close it, and watch what the nearest body ever does.
    out.high = Math.round(s.y - b.fc.y);
    let near = Infinity;
    // How far the frame reaches from its own middle, read at both ends of the
    // close: the shrink IS the closing here, so it is the thing to measure.
    const span = () => Math.round(Math.max(...b.parts().filter((p) => !p.dead && !p.hidden)
      .map((p) => Math.max(Math.abs(p.x - b.fc.x), Math.abs(p.y - b.fc.y)))));
    out.wide0 = span();
    for (let i = 0; i < 60 * (C.shutFor + 6); i++) {
      g.update(1 / 60);
      if (!w.boss || b.stage !== 3) break;
      for (const p of b.parts()) {
        if (p.dead || p.hidden) continue;
        near = Math.min(near, Math.hypot(p.x - s.x, p.y - s.y) - (p.r || 0));
      }
    }
    out.wide1 = span();
    out.shut = +(b.shut || 0).toFixed(2);
    out.low = Math.round(s.y - b.fc.y);
    out.near = Math.round(near);
    out.want = C.frameClose;
    g.restart();
    return out;
  });
  check('III gathers the fallen edge instead of only dropping the surplus',
    r.gathered === r.keep && r.gathered > r.left,
    `${r.left} segments survived to III, and the frame carries ${r.gathered} `
    + `of a wanted ${r.keep}`);
  /*
   * It closes by drawing in -- the ring's own move, in the shape the ring
   * turned into -- and it comes down a little as well. The corner is what
   * law 3 binds: a square that turns puts a corner sqrt(2) out directly under
   * its centre twice a turn, which is why closing by descent alone drove it
   * to within fourteen units of the turret, and why `frameR` had to come down
   * from 190 to fix a violation that predates any of this.
   */
  check('III closes on the turret, and law 3 holds while it does',
    r.shut >= 0.99 && r.low < r.high && Math.abs(r.low - r.want) < 6
    && r.wide1 < r.wide0 * 0.8 && r.near > 80,
    `the frame drew in from ${r.wide0} to ${r.wide1} and came from ${r.high} `
    + `above the turret to ${r.low} (wanted ${r.want}); nothing of it ever got `
    + `nearer than ${r.near}`);
}

/*
 * ...and the one thing in this game that leaves a mark on the world.
 *
 * Every other fight hands `staging` back and the field looks exactly as it
 * did. Breaking the edge does not: the between-waves sky is grey-gold for the
 * rest of the run. Per run, and only for the seventh -- a mood that leaked
 * into any other reconciliation, or survived a restart, would read as the
 * background having broken rather than as a consequence.
 */
{
  const r = await page.evaluate(async () => {
    const { background } = await import('../src/background.js');
    const g = window.__sim;
    const w = g.world;
    const out = {};
    const land = (n) => {
      g.restart();
      w.phase = 'staging';
      w.apertures[n] = 1;
      g.openBoss(n);
      w.boss.clear(w);
      g.endBoss();
      return background.target.accent;
    };
    const staging = (() => { g.restart(); return background.target.accent; })();
    out.afterSix = land(6);
    out.afterSeven = land(7);
    out.dawnFlag = !!w.dawn;
    // ...and it holds through the waves that follow rather than being one
    // frame of colour on the way past.
    background.setMood(w.dawn ? 'dawn' : 'staging');
    out.holds = background.target.accent === out.afterSeven;
    g.restart();
    out.afterRestart = background.target.accent;
    out.staging = staging;
    out.cleared = !w.dawn;
    return out;
  });
  check('breaking the edge leaves the sky changed, and only that one does',
    r.afterSix === r.staging && r.afterSeven !== r.staging && r.dawnFlag && r.holds
    && r.afterRestart === r.staging && r.cleared,
    `staging ${r.staging}; after VI ${r.afterSix}; after VII ${r.afterSeven}; `
    + `after a restart ${r.afterRestart}`);
}

// --- the three that measured as doing nothing at all ------------------------
/*
 * Every one of these shipped as a mechanic the code described and the fight
 * never performed, and none of them could be seen by looking: they are all a
 * geometry that misses.
 *
 * AMPLITUDE's RESONANCE came down through the hole the turret had shot in the
 * wave -- auto aim takes the nearest thing, the nearest segment is the one
 * directly above you, so the gap is centred on the turret by construction.
 * Closest approach 85 against a contact of 50, for six builds.
 *
 * DYNAMO's discharge ran back along the arc the core travelled, between two
 * pylons that both stand at standoff. And its propeller corrupted on plain
 * proximity, so once descended it never stopped: 77% of stage IV, which is
 * weather rather than a threat.
 *
 * PARITY had no corruption channel of any kind. Whole fight, zero.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const out = {};

    const open = (n) => {
      g.restart();
      w.phase = 'staging';
      w.apertures[n] = 1;
      g.openBoss(n);
      const b = w.boss;
      b.arriving = 0;
      b.settle(w);
      g.update(1 / 60);
      return b;
    };

    // AMPLITUDE: the beat has to reach, with the body half gone -- which is
    // the state it fires in, not a whole wave.
    {
      const b = open(4);
      b.segs.forEach((p, i) => { if (i % 2 === 0) p.dead = true; });
      b.startResonance(w);
      let peak = 0;
      let near = 1e9;
      for (let i = 0; i < 400 && b.resonance > 0; i++) {
        w.shock = 0;
        b.place(1 / 60);
        b.stepResonance(w, 1 / 60);
        peak = Math.max(peak, w.shock);
        for (const p of b.segs) {
          if (p.dead) continue;
          near = Math.min(near, Math.hypot(p.x - w.shooter.x, p.y - w.shooter.y));
        }
      }
      out.resShock = +peak.toFixed(2);
      out.resNear = Math.round(near);
    }

    // DYNAMO: the discharge earths from II, and the propeller strobes.
    {
      const b = open(5);
      const arc = [b.hub.x + 40, b.hub.y - 20];
      b.stage = 1;
      out.holds = b.discharge(w, arc[0], arc[1]).join(',') === arc.join(',');
      b.stage = 2;
      const to = b.discharge(w, arc[0], arc[1]);
      out.earths = to[1] > w.shooter.y;
      out.earthNear = Math.abs(to[0] - w.shooter.x) <= CFG.dynamo.earthSpread;

      b.stage = 4;
      b.triad = true;
      b.hunt = { x: w.shooter.x, y: w.shooter.y };
      b.fall = 1;
      b.bladeA = 0;
      b.x = w.shooter.x;
      b.y = w.shooter.y - 60; // inside `close`, so only the angle can gate it
      let on = 0;
      const frames = 240;
      for (let i = 0; i < frames; i++) {
        w.shock = 0;
        b.bladeA += CFG.dynamo.bladeSpin / 60;
        const toward = Math.atan2(w.shooter.y - b.y, w.shooter.x - b.x);
        const across = Math.abs(Math.sin(toward - b.bladeA)) < Math.sin(CFG.dynamo.bladeArc);
        if (across) on++;
      }
      out.bladeDuty = +(on / frames).toFixed(2);
    }

    // PARITY: standing on the mirror-line costs the intake, and standing off
    // it does not.
    {
      const b = open(6);
      const s = w.shooter;
      // Straight through the turret: the hub is directly above it, so the
      // seam is on the turret exactly when the line is vertical.
      b.lineA = Math.PI / 2;
      w.shock = 0;
      b.stepSeam(w);
      out.seamOn = +w.shock.toFixed(2);
      b.lineA = 0;
      w.shock = 0;
      b.stepSeam(w);
      out.seamOff = +w.shock.toFixed(2);
      // ...and it comes round onto the turret on its own, twice a turn.
      b.lineA = 0;
      let hits = 0;
      let was = false;
      for (let i = 0; i < 60 * 60; i++) {
        b.lineA += CFG.parity.lineSpin[0] / 60;
        w.shock = 0;
        b.stepSeam(w);
        const now = w.shock > 0;
        if (now && !was) hits++;
        was = now;
      }
      out.seamPasses = hits;
    }

    w.shock = 0;
    g.restart();
    return out;
  });
  check('RESONANCE comes down onto the turret rather than past it',
    r.resShock > 0 && r.resNear < 50,
    `peak corruption ${r.resShock}; closest the wave came: ${r.resNear}`);
  check('from II the discharge earths down the field instead of back up the arc',
    r.holds && r.earths && r.earthNear,
    `I leaves it on the arc: ${r.holds}; II throws it past the turret: ${r.earths}`);
  check('the propeller strobes across you rather than humming on top of you',
    r.bladeDuty > 0.1 && r.bladeDuty < 0.6,
    `a blade is across the turret on ${Math.round(r.bladeDuty * 100)}% of frames`);
  check('standing on the mirror-line costs the intake, and standing off it does not',
    r.seamOn > 0 && r.seamOff === 0 && r.seamPasses >= 2,
    `on the seam ${r.seamOn}, clear of it ${r.seamOff}; `
    + `it came round onto the turret ${r.seamPasses} times in a minute`);
}

// --- AMPLITUDE has to stay inside the world ---------------------------------
/*
 * A wide sine cannot have all of itself inside a 400 aim range: the ends are
 * two hundred across, so anything more than 346 above the turret out there is
 * unreachable. Segments cycling in and out of reach IS this fight -- you shoot
 * the wave when it comes to you.
 *
 * Two things are not allowed to. The growth in the swing used to go BOTH ways,
 * so every crest got further away as the player made progress: measured, the
 * far end at a crest sat 541 from the turret and stage III ran with nothing
 * legal to shoot on 47% of its frames. And the head -- the thing whose death
 * ends this -- swam out with it.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { angleDelta } = await import('../src/util.js');
    const g = window.__sim;
    const w = g.world;
    const C = CFG.amplitude;
    const out = {};
    g.restart();
    w.phase = 'staging';
    w.apertures[4] = 1;
    g.openBoss(4);
    const boss = w.boss;
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);
    const s = w.shooter;

    /*
     * The growth is spent downward. Take the wave's highest and lowest points
     * whole, then break most of the body so the swing grows, and take them
     * again: the top must not have moved up, and the bottom must have come
     * down.
     */
    const span = () => {
      let top = Infinity;
      let low = -Infinity;
      for (let i = 0; i <= 40; i++) {
        const [, y] = boss.at(-0.5 + i / 40, 0);
        top = Math.min(top, y);
        low = Math.max(low, y);
      }
      return [top, low];
    };
    boss.phase = 0;
    const [top0, low0] = span();
    out.swing0 = Math.round(boss.swing());
    boss.segs.forEach((p, i) => { if (i > 2) p.dead = true; });
    boss.phase = 0;
    const [top1, low1] = span();
    out.swing1 = Math.round(boss.swing());
    out.grew = out.swing1 > out.swing0;
    out.crestHeld = top1 >= top0 - 1; // no further away (smaller y is higher)
    out.troughCame = low1 > low0 + 1; // and the bottom is nearer the turret

    /*
     * The head stays inside reach, whatever the wave is doing.
     */
    let worst = 0;
    for (let i = 0; i < 60 * 20; i++) {
      boss.place(1 / 60);
      worst = Math.max(worst, Math.hypot(boss.core.x - s.x, boss.core.y - s.y));
    }
    out.headFurthest = Math.round(worst);
    out.headInReach = worst <= C.reach + 2;

    /*
     * OCTAVE: four strands, and the body back.
     */
    boss.segs.forEach((p) => { p.dead = true; });
    boss.strike(w);
    out.strands = boss.strands;
    out.bodyBack = boss.segs.filter((p) => !p.dead).length;
    const used = new Set(boss.segs.filter((p) => !p.dead).map((p) => p.strand));
    out.allStrandsUsed = used.size === boss.strands;
    // ...and four sines a quarter period apart are actually apart.
    const ys = [0, 1, 2, 3].map((k) => boss.at(0, k)[1]);
    out.strandsApart = new Set(ys.map((y) => Math.round(y / 8))).size >= 3;

    /*
     * The coil is an ARC over the turret, not a ring around it: every segment
     * inside the assist's cone, which a closed ring cannot be.
     */
    boss.coil = 1;
    boss.hunt = { x: s.x, y: s.y };
    boss.place(1 / 60);
    const limit = CFG.shooter.aimClamp;
    const live = boss.segs.filter((p) => !p.dead);
    out.coilOf = live.length;
    out.coilInCone = live.every((p) => Math.abs(angleDelta(-Math.PI / 2,
      Math.atan2(p.y - s.y, p.x - s.x))) <= limit);
    // ...and it still does not crush: law 3.
    out.coilFloor = live.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= C.coilTo - 2);
    g.restart();
    return out;
  });
  check('the swing grows downward: the crest holds and the trough comes to you',
    r.grew && r.crestHeld && r.troughCame,
    `swing ${r.swing0} -> ${r.swing1}; crest held: ${r.crestHeld}; `
    + `trough came in: ${r.troughCame}`);
  check('the head never swims out of reach of the turret',
    r.headInReach, `furthest the head got over twenty seconds: ${r.headFurthest}`);
  check('OCTAVE folds the wave into four strands and puts the body back',
    r.strands === 4 && r.bodyBack > 0 && r.allStrandsUsed && r.strandsApart,
    `${r.strands} strands, ${r.bodyBack} segments back, all strands seated: `
    + `${r.allStrandsUsed}`);
  check('the coil is an arc over the turret rather than a ring around it',
    r.coilInCone && r.coilFloor && r.coilOf > 6,
    `${r.coilOf} segments, all inside the cone: ${r.coilInCone}; `
    + `none inside the floor: ${r.coilFloor}`);
}

// --- GNOMON's clock keeps running -------------------------------------------
/*
 * The shadow is the best pressure mechanic in this game -- 30-34% of stages II
 * and III -- and it used to stop dead the moment the needle planted. Stage IV
 * measured 0.4% corrupted frames: the finale of the fight whose whole subject
 * is a moving shadow had no moving shadow in it. It sweeps out of the planted
 * needle now, which is what a gnomon is.
 *
 * And MIDNIGHT, the beat the back half did not have: the dial comes back, one
 * revolution runs at speed, and every arc it passes goes dark for good.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const C = CFG.gnomon;
    const out = {};
    g.restart();
    w.phase = 'staging';
    w.apertures[2] = 1;
    g.openBoss(2);
    const boss = w.boss;
    boss.arriving = 0;
    boss.settle(w);
    g.update(1 / 60);

    /*
     * MIDNIGHT: half the dial gone, then the beat, then the dial back and the
     * arcs it swept marked dark.
     */
    boss.arcs.forEach((p, i) => { if (i % 2 === 0) p.dead = true; });
    out.brokeTo = boss.arcs.filter((p) => !p.dead).length;
    boss.stage = 3;
    boss.strikeMidnight(w);
    out.opened = boss.midnight === 0;
    let guard = 0;
    while (boss.midnight !== null && guard++ < 60 * 30) {
      boss.place(1 / 60);
      boss.stepMidnight(w, 1 / 60);
    }
    out.ran = boss.midnight === null && boss.midnightDone;
    out.dialBack = boss.arcs.filter((p) => !p.dead).length;
    out.darkened = boss.arcs.filter((p) => p.dark).length;
    // ...once. A second pass would be a second heal.
    out.onlyOnce = boss.midnightDone;

    /*
     * The planted needle still throws a wedge, and it sweeps. Origin is the
     * plant rather than the core -- that is the whole point of a sundial.
     */
    boss.plant(w);
    out.planted = !!boss.planted;
    out.throwsShadow = boss.shadowAngles().length > 0;
    const from = boss.shadowFrom();
    out.fromPlant = from === boss.planted;
    const a0 = boss.plantA;
    for (let i = 0; i < 120; i++) boss.place(1 / 60);
    out.sweeps = Math.abs(boss.plantA - a0) > 0.2;
    // ...and something standing in it is corrupted, which is what "the finale
    // has pressure" means in a number.
    const s = w.shooter;
    const keep = { x: s.x, y: s.y };
    const a = boss.plantA;
    s.x = boss.planted.x + Math.cos(a) * (C.shadowFrom + 80);
    s.y = boss.planted.y + Math.sin(a) * (C.shadowFrom + 80);
    out.inIt = boss.inShadow(s.x, s.y);
    s.x = boss.planted.x + Math.cos(a + Math.PI / 2) * (C.shadowFrom + 80);
    s.y = boss.planted.y + Math.sin(a + Math.PI / 2) * (C.shadowFrom + 80);
    out.clearOfIt = !boss.inShadow(s.x, s.y);
    s.x = keep.x; s.y = keep.y;

    /*
     * The ladder: both core thresholds true on one frame must still visit the
     * stage where the needle comes down.
     */
    g.restart();
    w.phase = 'staging';
    w.apertures[2] = 1;
    g.openBoss(2);
    const b2 = w.boss;
    b2.arriving = 0;
    b2.settle(w);
    b2.noonDone = true;
    b2.core.hp = Math.round(b2.core.maxHp * 0.02);
    const seen = [b2.stage];
    for (let i = 0; i < 60 * 60 && b2.stage < 4; i++) {
      g.update(1 / 60);
      if (!w.boss) break;
      if (b2.stage !== seen[seen.length - 1]) seen.push(b2.stage);
    }
    out.stages = seen.join(',');
    out.ladder = seen.every((v, i) => i === 0 || v === seen[i - 1] + 1);
    out.came = !!b2.planted;
    g.restart();
    return out;
  });
  check('MIDNIGHT puts the dial back and darkens what its sweep passes',
    r.opened && r.ran && r.dialBack > r.brokeTo && r.darkened > 0 && r.onlyOnce,
    `${r.brokeTo} arcs standing, ${r.dialBack} after; ${r.darkened} went dark`);
  check('a planted needle still throws a shadow, and it sweeps',
    r.planted && r.throwsShadow && r.fromPlant && r.sweeps && r.inIt && r.clearOfIt,
    `throws: ${r.throwsShadow}; out of the plant: ${r.fromPlant}; `
    + `turns: ${r.sweeps}; dark where it points: ${r.inIt}`);
  check('it cannot skip the stage where the needle comes down',
    r.ladder && r.came && r.stages.endsWith('4'),
    `stages seen: ${r.stages}; the needle planted: ${r.came}`);
}

// --- FRACTAL is a shape containing itself -----------------------------------
/*
 * This fight's one idea is self-similarity, and for ten builds nothing on
 * screen showed it: the core drew a proper Sierpinski subdivision inside
 * itself while the bodies around it orbited at 150 with their own rotations,
 * so the figure read as a solar system. These hold the arrangement that fixed
 * it -- children on the parent's CORNERS, at half the distance, wearing the
 * parent's rotation -- because it is geometry, and geometry is exactly what
 * drifts when someone tunes an orbit radius later.
 *
 * Plus the stage ladder, which could skip III entirely: `divide()` is gated on
 * entering stage three, and the ladder jumped straight to whatever was
 * furthest along. A fight that crossed both thresholds on one frame never
 * divided its core at all.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const C = CFG.fractal;
    const out = {};
    g.restart();
    w.phase = 'staging';
    w.apertures[3] = 1;
    g.openBoss(3);
    const boss = w.boss;
    boss.arriving = 0;
    boss.settle(w);
    boss.spinA = 0;
    boss.spinB = 0;
    boss.place(0);

    const ang = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
    const near = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.02;

    /*
     * A triangle drawn by drawTri has vertices at -90, 30 and 150 degrees.
     * Every middle has to sit on one of those bearings from the core, and
     * every small on one of them from its middle.
     */
    const corners = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    const onCorner = (a) => corners.some((c) => near(a, c));
    out.midsOnCorners = boss.mids.every((m) => onCorner(ang(boss.x, boss.y, m.x, m.y)));
    out.mitesOnCorners = boss.mids.every((m) => m.mites
      .every((t) => onCorner(ang(m.x, m.y, t.x, t.y))));

    // ...and every generation wears one rotation, or they do not nest.
    const faces = [boss.core.angle, ...boss.mids.map((m) => m.angle),
      ...boss.mids.flatMap((m) => m.mites.map((t) => t.angle))];
    out.oneFace = faces.every((a) => near(a, faces[0]));

    // Half the distance, near enough: a child on a corner has its inner edge
    // touching, which is `parent vertex + child radius`.
    const midD = Math.hypot(boss.mids[0].x - boss.x, boss.mids[0].y - boss.y);
    out.midSits = Math.abs(midD - (C.coreR + boss.mids[0].r)) < 12;
    out.ratio = +(C.midR / C.miteR).toFixed(2);

    /*
     * DESCENT: the figure comes back one level lower, three copies of it, and
     * not one body more than it arrived with.
     */
    boss.mids.forEach((m) => { m.dead = true; m.mites.forEach((t) => { t.dead = true; }); });
    boss.divide(w);
    // After the divide, not before: dividing the core is where the two extra
    // pieces come from, and they are the core rather than new structure.
    const bodies = boss.parts().length;
    boss.startDescent(w);
    for (let i = 0; i < 60 * 12 && boss.descent !== null; i++) {
      boss.place(1 / 60);
      boss.stepDescent(w, 1 / 60);
    }
    out.descended = boss.descended && boss.descent === null;
    out.cameBack = boss.mids.filter((m) => !m.dead).length;
    out.noNewBodies = boss.parts().length === bodies;
    boss.place(0);
    // Each middle now hangs off a piece rather than off the middle of nothing.
    out.reparented = boss.mids.filter((m) => !m.dead).every((m) => boss.pieces
      .some((p) => !p.dead && Math.abs(Math.hypot(m.x - p.x, m.y - p.y) - C.subR) < 14));

    /*
     * The ladder: both thresholds true on one frame must still visit III.
     */
    g.restart();
    w.phase = 'staging';
    w.apertures[3] = 1;
    g.openBoss(3);
    const b2 = w.boss;
    b2.arriving = 0;
    b2.settle(w);
    b2.sprangDone = true;
    b2.recursed = true;
    b2.core.hp = Math.round(b2.core.maxHp * 0.02);
    const seen = [b2.stage];
    for (let i = 0; i < 60 * 40 && b2.stage < 4; i++) {
      g.update(1 / 60);
      if (!w.boss) break;
      if (b2.stage !== seen[seen.length - 1]) seen.push(b2.stage);
    }
    out.stages = seen.join(',');
    out.ladder = seen.every((v, i) => i === 0 || v === seen[i - 1] + 1);
    out.divided = b2.split;
    g.restart();
    return out;
  });
  check('the generations sit on their parent’s corners, wearing its rotation',
    r.midsOnCorners && r.mitesOnCorners && r.oneFace && r.midSits,
    `middles on corners: ${r.midsOnCorners}; smalls on corners: ${r.mitesOnCorners}; `
    + `one rotation: ${r.oneFace}; a middle sits on the corner: ${r.midSits}`);
  check('DESCENT puts the figure back one level down, and adds no bodies',
    r.descended && r.cameBack === 3 && r.noNewBodies && r.reparented,
    `${r.cameBack} middles back, hanging off pieces: ${r.reparented}; `
    + `body count unchanged: ${r.noNewBodies}`);
  check('it cannot skip the stage where the core divides',
    r.ladder && r.divided && r.stages.endsWith('4'),
    `stages seen: ${r.stages}; the core divided: ${r.divided}`);
}

// --- the assist's memory ----------------------------------------------------
/*
 * `autoTarget` used to pick strictly by score, sixty times a second, with no
 * memory of what it was already shooting. The barrel does not move that fast --
 * it traverses at `autoTurnRate` -- and with auto fire on the cadence does not
 * wait for it, so every shot taken during a slew goes where the last target
 * was. Measured on build 136, TERMINUS changed target FORTY-FIVE times a
 * second through the whole of stage I, because thirty-two ring segments sat at
 * exactly the same distance and the winner flipped on floating-point noise.
 * Seventy-four percent of that stage's shots were fired mid-sweep.
 *
 * The second case here is the bug the first one shipped with. Half this game's
 * bosses hide a body by splicing it out of world.enemies and leaving it alive
 * -- ORDINAL's garrison, DYNAMO's core, PARITY's phased crescent, TERMINUS's
 * second ring -- so a held target that has just phased passes every liveness
 * test there is. With `!held.dead` as the check instead of "still on the
 * field", PARITY ran nineteen percent longer with the assist locked onto a
 * reflection.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { TYPE_BY_ID } = await import('../src/config.js');
    const { Enemy } = await import('../src/enemies.js');
    const g = window.__sim;
    const w = g.world;
    const out = {};
    g.restart();
    w.phase = 'staging';
    w.autoAim = true;
    const s = w.shooter;
    w.enemies.length = 0;

    // Two bodies at exactly the same distance, straight up and either side.
    const put = (dx, dy) => {
      // A real hostile body: DRIFT is flagged `harmless` and `autoTarget`
      // skips it entirely, which made the first draft of this block pass by
      // comparing null to null sixty times.
      const e = new Enemy(TYPE_BY_ID.prism, s.x + dx, s.y + dy, { staged: false, spawnIn: 0 });
      e.counts = false;
      w.enemies.push(e);
      return e;
    };
    const a = put(-60, -300);
    const b = put(60, -300);
    out.tie = Math.abs(Math.hypot(-60, -300) - Math.hypot(60, -300)) < 0.001;

    // Sixty frames of picking. Without memory this alternates; with it, it
    // holds whatever it locked first.
    let switches = 0;
    let last = null;
    for (let i = 0; i < 60; i++) {
      const t = g.autoTarget();
      g.autoLock = t;
      if (last && t && t !== last) switches++;
      last = t;
    }
    out.tieSwitches = switches;
    out.tieLocked = !!last; // ...and it locked onto something at all

    // ...and something genuinely nearer still takes the lock at once.
    const near = put(0, -140);
    g.autoLock = last;
    out.tookNearer = g.autoTarget() === near;
    near.dead = true;

    /*
     * The parked case: the held target leaves world.enemies without dying.
     * The lock has to go with it on the very next pick.
     */
    g.autoLock = a;
    out.holdsWhileOn = g.autoTarget() === a;
    w.enemies.splice(w.enemies.indexOf(a), 1);
    out.dropsWhenParked = g.autoTarget() !== a;
    out.parkedStillAlive = !a.dead;

    out.stick = CFG.shooter.aimStick;
    g.restart();
    return out;
  });
  check('the assist keeps its lock on a tie rather than picking again every frame',
    r.tie && r.tieLocked && r.tieSwitches === 0 && r.stick > 1,
    `two bodies at the same distance, 60 frames: ${r.tieSwitches} switches `
    + `(margin ${r.stick})`);
  check('...and lets go the moment something is genuinely nearer',
    r.tookNearer, `took the nearer body: ${r.tookNearer}`);
  check('a target parked out of the world releases the lock, alive or not',
    r.holdsWhileOn && r.dropsWhenParked && r.parkedStillAlive,
    `held while on the field: ${r.holdsWhileOn}; dropped once parked: `
    + `${r.dropsWhenParked}; and it was never dead: ${r.parkedStillAlive}`);
}

// --- the quality governor is not a one-way ratchet ---------------------------
/*
 * The governor was fed the frame INTERVAL and judged it against absolute
 * milliseconds: drop above 20.5, come back below 13.5. A vsync-locked 60Hz
 * display cannot produce an interval under 16.67ms, so on the phone this game
 * is for, the recovery door was one that never opened -- one transient stall
 * and the canvas stayed at reduced resolution until the app was killed. A
 * 120Hz iPhone recovered and a 60Hz one did not, which is the threshold
 *testing the refresh rate rather than the game.
 *
 * The same absolute test could not tell a THROTTLED DISPLAY from a SLOW GAME.
 * iOS low-power mode drops rAF to 30Hz while the game does no more work at
 * all; a 60Hz phone that spends 30ms of every frame in update() and draw()
 * produces the identical 33ms interval. Build 197 answered both with 0.45 --
 * punishing the first for a setting the player chose.
 *
 * So the interval is judged against the display's OWN cadence now, and work
 * is measured alongside it. Both are needed and the last two models here are
 * why: canvas calls are queued rather than executed, so a GPU-bound frame can
 * return from draw() in a millisecond and still miss its vsync -- only the
 * interval sees that -- while a uniformly half-rate game is invisible to the
 * interval and only the work tells it apart from a 30Hz display.
 *
 * The models are driven through trackFrame directly. This has to be synthetic:
 * a headless software rasteriser has no vsync and no GPU, so a live run cannot
 * produce any of the six timings that matter.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { fx } = await import('../src/fx.js');
    const wasQuality = fx.quality;

    const run = (frames) => {
      fx.quality = 1;
      g.qualityCooldown = 0;
      g.frameTimes.length = 0;
      if (g.workTimes) g.workTimes.length = 0;
      let floor = 1;
      for (const [ms, work] of frames) {
        g.trackFrame(Math.min(ms, 60), work);
        floor = Math.min(floor, fx.quality);
      }
      return { floor, end: fx.quality };
    };

    const V60 = 1000 / 60, V120 = 1000 / 120, V30 = 1000 / 30;
    const rep = (n, ms, work) => Array(n).fill(0).map(() => [ms, work]);
    const CALM = 4;    // ms of update+draw on a phone that is coping
    const HEAVY = 30;  // ms of update+draw on one that is not
    const STALL = [...rep(40, V60, CALM), ...rep(20, 40, CALM)];

    const out = {
      // 2400 frames is forty windows -- about forty seconds of play.
      healthy: run(rep(2400, V60, CALM)),
      recovers: run([...STALL, ...rep(2400, V60, CALM)]),
      lowPower: run(rep(2400, V30, CALM)),
      gpuBound: run([...rep(1200, V60, CALM),
        ...Array(1200).fill(0).map((_, i) => (i % 2 ? [V60, CALM] : [V60 * 2, CALM]))]),
      cpuBound: run(rep(2400, V30, HEAVY)),
      fedWork: Array.isArray(g.workTimes),
    };

    // Put the canvas back. A case that leaves quality on the floor charges
    // every later case for it -- the backing store is sized inside resize().
    fx.quality = wasQuality;
    g.qualityCooldown = 0;
    g.frameTimes.length = 0;
    if (g.workTimes) g.workTimes.length = 0;
    g.resize();
    out.restored = fx.quality === wasQuality;
    out.foundAt = wasQuality;
    return out;
  });

  check('a healthy 60Hz frame budget is left alone',
    r.healthy.floor === 1 && r.healthy.end === 1,
    `forty windows at 16.67ms: floor ${r.healthy.floor}, ends at ${r.healthy.end}`);
  check('quality dropped by a stall comes back on a vsync-locked 60Hz display',
    r.recovers.floor < 1 && r.recovers.end === 1,
    `one stall then forty clean windows: floor ${r.recovers.floor}, `
    + `ends at ${r.recovers.end} (build 197 ended at 0.70 and stayed there)`);
  check('a display throttled to 30Hz is not mistaken for a game that cannot cope',
    r.lowPower.end === 1,
    `low-power 30Hz with ${4}ms of work: ends at ${r.lowPower.end} `
    + '(build 197 ended at 0.45)');
  check('a GPU-bound frame that misses its vsync still drops quality',
    r.gpuBound.end <= 0.45,
    `misses every other vsync at low work: ends at ${r.gpuBound.end}`);
  check('...and so does a game that is uniformly half-rate on its own work',
    r.cpuBound.end <= 0.45 && r.fedWork,
    `33ms interval with 30ms of work: ends at ${r.cpuBound.end}; `
    + `governor is fed work: ${r.fedWork}`);
  check('the governor case puts the canvas back where it found it',
    r.restored, `found quality at ${r.foundAt} and did not restore it`);
}

// --- the stroke floor is a device-pixel measure ------------------------------
/*
 * HAIRLINE's own docstring said "not below roughly one device pixel". The
 * arithmetic said otherwise: a world unit is `dpr * CFG.zoom` device pixels,
 * so a fixed `1.25 / zoom` draws at 1.25 * dpr -- 2.5 device pixels on a dpr-2
 * iPhone and 3.75 on a Pro Max.
 *
 * A floor is only meant to stop a line vanishing. This one was setting the
 * weight: measured on build 198, EIGHTEEN of thirty-seven types had
 * `r * m.line` land under it, so a line ladder authored across 17.3x was drawn
 * across 4.2x, and the body with density 6.0 got the same outline as the one
 * at 0.55. Phase 1 measured that a body reads almost entirely as its outline
 * -- the fill is 7-9% of its brightness -- so that is the type's weight
 * deleted from the channel carrying the image.
 *
 * The floor is live from build 199, set off the canvas's own scale. The
 * assertions are on what it EVALUATES TO on each device, which is the question
 * the constant was never asked, plus the dpr-1 case as a regression guard:
 * low-dpr displays must be unchanged, because 1.25 device pixels is what they
 * were already getting.
 */
{
  const r = await page.evaluate(async () => {
    const cfg = await import('../src/config.js');
    const { CFG, ENEMY_TYPES } = cfg;
    const { materialOf } = await import('../src/enemies.js');
    const g = window.__sim;
    const was = g.dpr;

    const at = (dpr) => {
      cfg.setHairline(dpr);
      const H = CFG.hairline;
      const drawn = Object.values(ENEMY_TYPES).map((t) => {
        const want = t.r * materialOf(t).line;
        return { want, drawn: Math.max(H, want), heavy: materialOf(t).heavy };
      });
      const w = drawn.map((d) => d.drawn);
      const solid = drawn.filter((d) => d.heavy >= 0.99).sort((a, b) => a.want - b.want)[0];
      const wisp = drawn.slice().sort((a, b) => a.heavy - b.heavy)[0];
      return {
        floorPx: H * dpr * CFG.zoom,
        clamped: drawn.filter((d) => d.want < H).length,
        total: drawn.length,
        spread: Math.max(...w) / Math.min(...w),
        solidOverWisp: solid.drawn / wisp.drawn,
      };
    };

    const out = { one: at(1), two: at(2), three: at(3) };
    out.authored = (() => {
      const w = Object.values(ENEMY_TYPES).map((t) => t.r * materialOf(t).line);
      return Math.max(...w) / Math.min(...w);
    })();
    // Put it back where the running game had it. A case that leaves the stroke
    // floor set for a phantom device charges every later case for it.
    g.resize();
    out.restored = Math.abs(CFG.hairline - 1.25 / (Math.max(g.dpr, 0.1) * CFG.zoom)) < 1e-9;
    out.dprKept = Math.abs(g.dpr - was) < 1e-9;
    return out;
  });

  const px = (v) => Math.abs(v - 1.25) < 0.01;
  // dpr 3 is a unit test of setHairline, not a claim about a device: the game
  // clamps to CFG.maxDpr, so a Pro Max runs the canvas at 2 like every other.
  check('the stroke floor is one device pixel at every scale, not one CSS pixel',
    px(r.one.floorPx) && px(r.two.floorPx) && px(r.three.floorPx),
    `floor in device px — dpr 1: ${r.one.floorPx.toFixed(2)}, `
    + `dpr 2: ${r.two.floorPx.toFixed(2)}, dpr 3: ${r.three.floorPx.toFixed(2)} `
    + '(build 198 gave 1.25 / 2.50 / 3.75)');
  check('a retina display stops having half the roster clamped to the floor',
    r.two.clamped <= 12 && r.three.clamped <= 3,
    `clamped of ${r.two.total} — dpr 2: ${r.two.clamped}, dpr 3: ${r.three.clamped} `
    + '(build 198 clamped 18 at every scale)');
  check('...so the line ladder the roster is authored with survives to the screen',
    r.two.spread > 7 && r.three.spread > 11 && r.authored > 17,
    `authored ${r.authored.toFixed(1)}x, drawn — dpr 2: ${r.two.spread.toFixed(1)}x, `
    + `dpr 3: ${r.three.spread.toFixed(1)}x (build 198 drew 4.2x)`);
  check('a body of density 6 is no longer given the same outline as one of 0.5',
    r.two.solidOverWisp > 1.5,
    `solid over wisp as drawn at dpr 2: ${r.two.solidOverWisp.toFixed(2)}x `
    + '(build 198: 1.00x — identical)');
  check('a low-dpr display is left exactly where it was',
    r.one.clamped === 18 && Math.abs(r.one.spread - 4.25) < 0.01,
    `dpr 1 — clamped ${r.one.clamped}/37, spread ${r.one.spread.toFixed(2)}x `
    + '(build 198: 18/37 and 4.25x)');
  check('the stroke-floor case puts the floor back where the game had it',
    r.restored && r.dprKept, `restored: ${r.restored}, dpr kept: ${r.dprKept}`);
}

// --- the ladder plays the band it says it is on -----------------------------
/*
 * Four things the ladder got wrong, all of them invisible from inside a run.
 *
 * THE BAND WINDOW LASTED ONE WAVE. shuffle() builds a rotation from the tier's
 * own two bands; admit() then spliced in every eligible wave NOT already in it
 * -- which is exactly the out-of-band ones -- and admit() runs from begin().
 * Logged at tier 40: after a shuffle `T T T T T T T T 4 5 4 5 5 4 4 4 4 5 5 4`,
 * one wave later `T T T 2 T T T 1 2 T 3 T 4 3 5 2 4 5 5 3`. Tier 40 played
 * five motes and three needles as often as a tow and a bulwark.
 *
 * THE VERDICT LEAKED. score() returns early for a teach wave BEFORE clearing
 * `contact` and `hitPatience`, and load() never cleared them, so an unscored
 * wave's seconds on the turret were charged to the next scored wave.
 *
 * THE BONUS WAVE WAS SCORED. `{ of: [], drift: 22 }` is not marked teach, and
 * with `asked === 0` nothing could fail it -- a free rung every cycle.
 *
 * THE OPENING REPLAYED, TIER-SCALED. It led every cycle-0 rotation whatever
 * the tier, and spawnOne gave it the tier multiplier, so a run starting at 40
 * was taught DRIFT by a 29-second "needle x2" that could not move the ladder.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { WAVES, CFG } = await import('../src/config.js');
    const w = g.world;
    const d = w.director;

    const out = {};

    // ---- the band window survives more than one wave ----
    // `earned` first: eligibility gates on it, and shuffle() legitimately
    // falls back to every eligible wave when the tier's own bands are all
    // still locked. A run that has not opened band 4 cannot play band 4.
    g.restart();
    w.phase = 'staging';
    w.earned = 999999;
    d.setTier(20);
    d.shuffle(w);
    const [lo, hi] = d.bandsFor(20);
    out.window = [lo, hi];
    // Run the rotation the way begin() does, admit() included, and look at
    // what is left to play after each wave rather than only after the shuffle.
    let outOfBand = 0, checked = 0;
    for (let i = 0; i < 12; i++) {
      d.begin(w);
      for (let k = d.at + 1; k < d.order.length; k++) {
        checked++;
        const b = WAVES[d.order[k]].band || 1;
        if (b < lo || b > hi) outOfBand++;
      }
    }
    out.aheadChecked = checked;
    out.aheadOutOfBand = outOfBand;

    // ---- load() leaves no verdict behind ----
    d.contact = 99;
    d.hitPatience = true;
    d.wait = 42;
    d.load(w, WAVES.find((x) => !x.teach && x.of.length));
    out.afterLoad = { contact: d.contact, patience: d.hitPatience, wait: d.wait };

    // ---- the drift-only bonus wave cannot move the ladder ----
    const bonus = WAVES.findIndex((x) => !x.teach && (!x.of || !x.of.length));
    out.hasBonus = bonus >= 0;
    if (bonus >= 0) {
      d.order = [bonus]; d.at = 0;
      d.load(w, WAVES[bonus]);
      const before = d.tier;
      out.bonusScored = d.score(w);
      out.bonusMoved = d.tier - before;
    }

    // ---- the opening plays once, at the bottom ----
    d.reset();
    d.setTier(30);
    d.shuffle(w);
    out.teachAt30 = d.order.filter((i) => WAVES[i].teach).length;
    d.reset();
    d.shuffle(w);                       // cycle 0, tier 1
    out.teachAt1 = d.order.filter((i) => WAVES[i].teach).length;
    out.teachSecondCycle = (() => { d.shuffle(w); return d.order.filter((i) => WAVES[i].teach).length; })();

    /*
     * ---- and a teach wave is never tier-scaled ----
     *
     * Measured as a RATIO between the same type spawned under a teach wave and
     * under a regular one at the same tier, rather than against an authored
     * number: it is spawnOne's multiplier that is being tested, and nothing
     * else in the constructor has to be modelled for the ratio to mean what it
     * says. At tier 30 the multiplier is hpStep^29, about 25x.
     */
    d.reset();
    w.earned = 999999;
    d.setTier(30);
    const teach = WAVES.find((x) => x.teach && x.of.length);
    const plain = WAVES.find((x) => !x.teach && x.of.length);
    /*
     * Averaged over many spawns: the Enemy constructor rolls every body's
     * health through `rand(0.92, 1.1)`, so two single bodies can differ by 1.2x
     * on their own. A first version compared one against one and read 30.4x
     * where the multiplier is 26.7x -- the roll, reported as a defect.
     */
    const hpUnder = (wave) => {
      const sum = {}, n = {};
      for (let pass = 0; pass < 14; pass++) {
        g.debugClearField();
        d.order = [WAVES.indexOf(wave)]; d.at = 0;
        d.load(w, wave);
        for (let i = 0; i < 300 && d.jobs.length; i++) d.emit(w);
        for (const e of w.enemies.filter((x) => !x.harmless && !x.dead)) {
          sum[e.type.id] = (sum[e.type.id] || 0) + e.maxHp;
          n[e.type.id] = (n[e.type.id] || 0) + 1;
        }
      }
      const byType = {};
      for (const k of Object.keys(sum)) byType[k] = sum[k] / n[k];
      return byType;
    };
    /*
     * With traits lifted out of the way. This case is about spawnOne's TIER
     * multiplier, and from build 204 a rung-30 wave also carries two seeded
     * rules -- SWARM among them halves health, so the ratio came out at 13.3x
     * against 26.7x whenever the seed happened to roll it. Raising the
     * threshold above the rung under test is the smallest way to ask the
     * original question; it is put back immediately.
     */
    const wasFrom = CFG.waves.tier.traitFrom;
    CFG.waves.tier.traitFrom = 9999;
    const teachHp = hpUnder(teach);
    const plainHp = hpUnder(plain);
    CFG.waves.tier.traitFrom = wasFrom;
    out.traitFromRestored = CFG.waves.tier.traitFrom === wasFrom;
    const shared = Object.keys(teachHp).filter((k) => plainHp[k]);
    out.sharedType = shared[0] || null;
    out.teachHp = shared.length ? teachHp[shared[0]] : null;
    out.plainHp = shared.length ? plainHp[shared[0]] : null;
    out.hpStepAt30 = CFG.waves.tier.hpStep ** 29;

    g.debugClearField();
    g.restart();
    return out;
  });

  check('the tier plays its own band for a whole cycle, not for one wave',
    r.aheadChecked > 0 && r.aheadOutOfBand === 0,
    `band window ${r.window[0]}-${r.window[1]}: ${r.aheadOutOfBand} of ${r.aheadChecked} `
    + 'waves still to play were out of band (build 199: admit() spliced them back every wave)');
  check('load() leaves no previous wave’s verdict behind',
    r.afterLoad.contact === 0 && r.afterLoad.patience === false && r.afterLoad.wait === 0,
    `after load(): contact ${r.afterLoad.contact}, hitPatience ${r.afterLoad.patience}, `
    + `wait ${r.afterLoad.wait}`);
  check('the drift-only bonus wave is not a free rung',
    r.hasBonus && r.bonusScored === null && r.bonusMoved === 0,
    `bonus wave scored ${JSON.stringify(r.bonusScored)}, moved ${r.bonusMoved}`);
  check('a teach wave is authored size, not tier size',
    r.traitFromRestored && r.sharedType !== null && r.teachHp !== null
      && Math.abs(r.plainHp / r.teachHp - r.hpStepAt30) < r.hpStepAt30 * 0.08,
    `${r.sharedType} at tier 30 — under the opening ${r.teachHp}, under a regular wave `
    + `${r.plainHp} (ratio ${r.teachHp ? (r.plainHp / r.teachHp).toFixed(1) : '?'}x, `
    + `hpStep^29 is ${r.hpStepAt30.toFixed(1)}x)`);
  check('the opening plays once, at the bottom, and never again',
    r.teachAt30 === 0 && r.teachAt1 > 0 && r.teachSecondCycle === 0,
    `teach waves in the rotation — starting at tier 30: ${r.teachAt30}, `
    + `at tier 1: ${r.teachAt1}, second cycle: ${r.teachSecondCycle}`);
}

// --- four verdicts, not two -------------------------------------------------
/*
 * There were two, and both ways of failing were "slow" rather than "in
 * danger": the ladder parked a maxed run where waves ran 28-37 s with about
 * 2.6 s of contact, climbing +1 per wave and falling -1 per two, so a fall
 * cost six times a climb. The table reads three numbers now -- `t`, seconds
 * from the LAST RELEASE to the field thinning; `k`, seconds anything spent on
 * the turret; `c`, the fraction of the wave that did not survive -- and
 * `patience` makes `t` infinite rather than being the verdict itself.
 *
 * Measuring `t` from the last release rather than from the top of the wave is
 * the point: a wave is not slow because it was big, it is slow because it
 * would not die, and only the second is the player's business.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { WAVES, CFG } = await import('../src/config.js');
    const T = CFG.waves.tier;
    const w = g.world;
    const d = w.director;
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);

    /*
     * One wave, posed exactly. `left` bodies are put on the field so `c` is
     * (asked - left) / asked; everything else is written straight onto the
     * director, which is what score() reads.
     */
    const pose = ({ t, k, left, asked = 10, tier = 20, hold = false, grace = 0 }) => {
      g.debugClearField();
      for (let i = 0; i < left; i++) g.debugSpawn('mote', 60 + i * 12, 120);
      d.probe = null;
      d.setTier(tier);
      d.peak = tier;
      d.hold = hold;
      d.grace = grace;
      d.order = [real]; d.at = 0;
      d.asked = asked;
      d.contact = k;
      d.hitPatience = t === Infinity;
      w.time = 1000;
      d.lastRelease = t === Infinity ? 1000 : 1000 - t;
      const out = d.score(w);
      g.debugClearField();
      return out;
    };

    const res = {
      surge: pose({ t: 1, k: 0, left: 0 }),
      clean: pose({ t: 8, k: 1, left: 0 }),
      // slow, but most of it died and nothing sat on the turret
      stall: pose({ t: 20, k: 1, left: 2 }),
      // ...and again: it still holds. There is no streak any more.
      stall2: pose({ t: 20, k: 1, left: 2 }),
      // most of it outlived the wave
      routByRemains: pose({ t: 20, k: 1, left: 8 }),
      // ...or it was on the turret for a quarter of a minute
      heavyContact: pose({ t: 8, k: 15, left: 0 }),
      // patience ending the wave makes t infinite, which the table reads
      patience: pose({ t: Infinity, k: 0, left: 0 }),
      // grace: the wave after a drop cannot climb
      graced: pose({ t: 1, k: 0, left: 0, grace: 1 }),
      // HOLD pins the climb...
      pinned: pose({ t: 1, k: 0, left: 0, hold: true }),
    };
    /*
     * ...and the whole table, swept, because "no verdict can subtract" is a
     * claim about every cell in it and not about the handful above. Three
     * seconds of `t` either side of both windows, contact from nothing to
     * twice the old rout threshold, and a field from cleared to untouched:
     * 5 x 7 x 4 poses, and not one of them may come back with a move below 0.
     * Posed at tier 20 so the floor guard cannot be what is doing the work.
     */
    const sweep = [];
    for (const t of [0.5, 3, 4, 12, 13, Infinity]) {
      for (const k of [0, 1.9, 2, 5.9, 6, 12, 24]) {
        for (const left of [0, 2, 6, 10]) {
          const out = pose({ t, k, left, asked: 10, tier: 20 });
          if (out && out.moved < 0) sweep.push({ t, k, left, moved: out.moved });
        }
      }
    }
    res.sweep = sweep;
    res.sweepOf = 6 * 7 * 4;
    res.cfg = { surgeWithin: T.surgeWithin, cleanWithin: T.cleanWithin,
      failContact: T.failContact, routBelow: T.routBelow };
    g.restart();
    return res;
  });

  const v = (x) => (x ? `${x.verdict}${x.moved >= 0 ? '+' : ''}${x.moved}` : 'null');
  check('a wave cleared before the last one landed is a surge, and climbs two',
    r.surge.verdict === 'surge' && r.surge.moved === 2,
    `${v(r.surge)} (t 1s, no contact, nothing left)`);
  check('the ordinary clear climbs one',
    r.clean.verdict === 'clean' && r.clean.moved === 1, v(r.clean));
  /*
   * Build 208: being SLOW is not being in trouble. A run that clears
   * everything at its own pace, with nothing ever reaching the turret, was
   * being pushed down a ladder it was holding fine -- twice over, by a stall
   * streak and by a wave "mostly outliving" itself. Both are gone. The one
   * thing that steps the ladder back is something spending real time attached.
   */
  check('slow but untouched holds, however many times it happens',
    r.stall.verdict === 'stall' && r.stall.moved === 0
    && r.stall2.verdict === 'stall' && r.stall2.moved === 0,
    `first ${v(r.stall)}, second ${v(r.stall2)}`);
  check('a wave that mostly outlived you holds too, if it never reached you',
    r.routByRemains.verdict === 'stall' && r.routByRemains.moved === 0,
    `${v(r.routByRemains)} (8 of 10 still standing, nothing on the turret)`);
  /*
   * Build 210: the table cannot go down at all, from any cell in it.
   *
   * The rout it lost was `k >= 12` -- twelve seconds of contact totted up
   * across a wave and cashed in once the wave was over. A wave-end verdict is
   * the wrong instrument for "you were in trouble": it arrives up to a minute
   * after the trouble did, it cannot be seen coming, and there is nothing to
   * be done about it once it is owed. Ten bad seconds at the top of a wave
   * condemned a wave that was then cleared perfectly.
   *
   * The glitch timer is the same signal read the other way round -- live,
   * on the screen, and answerable while it runs -- and it is now the only
   * involuntary way down. Swept rather than sampled, because that is a claim
   * about the whole table.
   */
  check('nothing this table can produce steps the ladder back',
    r.sweep.length === 0 && r.heavyContact.moved === 0,
    `${r.sweepOf - r.sweep.length}/${r.sweepOf} poses held; `
    + `15 s on the turret is ${v(r.heavyContact)}`
    + (r.sweep.length ? `; first drop ${JSON.stringify(r.sweep[0])}` : ''));
  check('patience ending a wave is read as a wave that never thinned, and holds',
    r.patience.verdict === 'stall' && r.patience.moved === 0
    && r.patience.reason === 'THE FIELD NEVER THINNED',
    `${v(r.patience)} — ${r.patience.reason}`);
  check('...and a wave that held you for a while still says so',
    /^\d+ S ON THE TURRET$/.test(r.heavyContact.reason),
    `it said "${r.heavyContact.reason}"`);
  check('the wave after a step back cannot climb back into what did it',
    r.graced.verdict === 'surge' && r.graced.moved === 0,
    `${v(r.graced)} with grace armed (build 200 would have climbed straight back)`);
  check('HOLD pins the climb',
    r.pinned.moved === 0, `pinned ${v(r.pinned)}`);
}

// --- a rung pays more than the one below it ---------------------------------
/*
 * Bounty was linear -- `1 + 0.15 * tier` -- against health compounding at
 * `hpStep`. Exponential cost against linear pay has one outcome: energy per
 * point of damage at rung 40 was 0.08 of rung 1, so the best-paying place on
 * the ladder was near the bottom and climbing was a pay cut. Measured on 197:
 * 8.9/s maxed at rungs 12-19, 3.4/s at rung 40, 5.8/s un-upgraded at 1-6.
 *
 * Three things carry the fix and each is asserted separately, because they
 * compose and a bug in one is easy to hide behind the other two.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES } = await import('../src/config.js');
    const { dividend } = await import('../src/enemies.js');
    const T = CFG.waves.tier;
    const w = g.world;
    const d = w.director;
    const out = {};

    // ---- bounty compounds, and slower than health ----
    out.bountyStep = T.bountyStep;
    out.hpStep = T.hpStep;
    out.b1 = d.scaleAt(1).bounty;
    out.b40 = d.scaleAt(40).bounty;
    out.h40 = d.scaleAt(40).hp;
    // energy per point of damage, rung 40 against rung 1
    const payPer = (tier, bounty) => bounty / d.scaleAt(tier).hp;
    out.payPerHp = payPer(40, d.scaleAt(40).bounty) / payPer(1, d.scaleAt(1).bounty);
    // ...against what the linear bounty build 201 retired would have given.
    const oldB = (tier) => 1 + 0.15 * tier;
    out.payPerHpOld = payPer(40, oldB(40)) / payPer(1, oldB(1));

    // ---- the dividend ----
    g.restart();
    w.reconciled.length = 0;
    d.peak = 1;
    out.divBase = dividend(w);
    d.peak = 20;
    out.divAt20 = dividend(w);
    w.reconciled.push(1, 2);
    out.divWithTwo = dividend(w);
    d.peak = 500; w.reconciled.push(3, 4, 5, 6, 7);
    out.divCap = dividend(w);
    out.cap = T.dividendCap;

    // ---- it reaches `earned`, not just the purse ----
    g.restart();
    d.peak = 40; w.reconciled.length = 0;   // dividend 1.4
    w.up.insulation = 1; w.attackers.clear();  // no intake tax
    const e0 = w.energy, n0 = w.earned;
    const body = g.debugSpawn('mote', w.width / 2, 200);
    body.staged = false; body.spawnIn = 0;
    const worth = body.energy * body.bounty;
    body.hp = 0; body.die ? body.die(w) : null;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    g.debugClearField();
    out.divLive = dividend(w);
    out.purseRose = w.energy > e0;
    out.earnedRose = w.earned > n0;
    out.earnedEqualsPurse = Math.abs((w.energy - e0) - (w.earned - n0)) < 0.01;
    void worth;

    // ---- the margin, and that it is not taxed twice ----
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);
    const pose = (verdict) => {
      g.debugClearField();
      g.restart();
      d.peak = 20; d.setTier(20); d.hold = false; d.grace = 0; d.probe = null;
      w.up.insulation = 1; w.attackers.clear();
      w.reconciled.length = 0;
      d.order = [real]; d.at = 0;
      d.asked = 10; d.contact = 0; d.hitPatience = false;
      d.take = 1000;                       // this wave was worth 1000, raw
      w.time = 1000;
      // surge wants t <= surgeWithin; clean wants surgeWithin < t <= cleanWithin
      d.lastRelease = 1000 - (verdict === 'surge' ? 1 : 8);
      const before = w.energy;
      const res = d.score(w);
      return { verdict: res.verdict, margin: res.margin, paid: w.energy - before };
    };
    out.surge = pose('surge');
    out.clean = pose('clean');
    out.wantMargin = 1000 * (T.margin - 1) * Math.min(T.dividendCap, 1 + T.dividendPeak * 20);
    g.restart();
    return out;
  });

  check('bounty compounds, and a shade slower than health',
    r.bountyStep > 1 && r.bountyStep < r.hpStep && Math.abs(r.b1 - 1) < 1e-9,
    `bounty x${r.bountyStep}^(n-1) against hp x${r.hpStep}^(n-1); rung 1 pays x${r.b1.toFixed(3)}, `
    + `rung 40 pays x${r.b40.toFixed(1)} against x${r.h40.toFixed(1)} health`);
  /*
   * Per point of damage a deep rung still pays less -- bounty is deliberately
   * a shade under health, so a rung stays harder than the one below it. What
   * changed is the SHAPE: rung 40 pays 0.70 of rung 1 rather than 0.08.
   * The run-level answer is the probe's, and it is the opposite sign: energy
   * per second RISES with the rung, because the wave grows too.
   *
   * The ABSOLUTE figure is what is pinned, not the ratio against the retired
   * linear bounty. That ratio moves with `hpStep` -- build 229 took health
   * from 1.12 to 1.085 a rung, which makes the linear scheme less ruinous as
   * well, so a threshold written against it drifts every time the health
   * slope is touched and stops describing the thing it is named for. Rung 40
   * keeping over half of rung 1's rate is the promise; being clear of the
   * linear scheme is the second arm and no longer carries the case.
   */
  check('...so a deep rung is no longer the pay cut it was',
    r.payPerHp > 0.5 && r.payPerHp < 1 && r.payPerHp / r.payPerHpOld > 2,
    `energy per point of damage at rung 40, against rung 1: `
    + `${r.payPerHp.toFixed(3)} now against ${r.payPerHpOld.toFixed(3)} under the linear bounty `
    + `— ${(r.payPerHp / r.payPerHpOld).toFixed(1)}x better`);
  check('the depth dividend rises with the peak and with anomalies, and is capped',
    Math.abs(r.divBase - 1.01) < 1e-9 && r.divAt20 > r.divBase
    && r.divWithTwo > r.divAt20 && Math.abs(r.divCap - r.cap) < 1e-9,
    `peak 1 x${r.divBase.toFixed(2)}, peak 20 x${r.divAt20.toFixed(2)}, `
    + `+2 anomalies x${r.divWithTwo.toFixed(2)}, far past both x${r.divCap.toFixed(2)} (cap ${r.cap})`);
  check('...and it reaches lifetime energy, not only the purse',
    r.divLive > 1 && r.purseRose && r.earnedRose && r.earnedEqualsPurse,
    `dividend x${r.divLive.toFixed(2)}; purse rose ${r.purseRose}, earned rose ${r.earnedRose}, `
    + `by the same amount ${r.earnedEqualsPurse}`);
  check('a surge pays the margin, and an ordinary clear does not',
    r.surge.verdict === 'surge' && r.surge.margin > 0
    && r.clean.verdict === 'clean' && r.clean.margin === 0,
    `surge paid ${r.surge.margin}, clean paid ${r.clean.margin}`);
  check('...and the margin is taxed and multiplied exactly once',
    Math.abs(r.surge.paid - r.wantMargin) < Math.max(1, r.wantMargin * 0.01),
    `on a wave worth 1000 raw at peak 20: paid ${r.surge.paid.toFixed(0)}, `
    + `want ${r.wantMargin.toFixed(0)} (half again, through one dividend and one intake)`);
}

// --- the anomalies are on the ladder ----------------------------------------
/*
 * All seven were built and none of them was on the ladder. Past band 5 nothing
 * new was ever introduced, and the only way to meet an anomaly was to buy an
 * APERTURE out of the tree -- so a run could climb to rung 40 having never
 * seen one. A gate rung is an ordinary rung for waves; the ladder simply will
 * not CLIMB past it until its anomaly is reconciled.
 *
 * The withdrawal was specified against `Boss.stageT`, which turned out to be
 * dead state: it is set to 0 in the constructor and again in enterStage, and
 * nothing in the codebase has ever incremented it. All seven bosses do write
 * `world.bossStage` on a stage change, so the watcher is in Game and works
 * the same for every one of them.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES } = await import('../src/config.js');
    const w = g.world;
    const d = w.director;
    const gates = CFG.waves.tier.gates;
    const out = { gates };
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);

    // ---- a gate stops a climb, and a surge does not step over one ----
    const climbFrom = (tier, verdict) => {
      g.debugClearField();
      g.restart();
      w.reconciled.length = 0;
      d.setTier(tier); d.hold = false; d.grace = 0; d.probe = null;
      d.order = [real]; d.at = 0;
      d.asked = 10; d.contact = 0; d.hitPatience = false; d.take = 0;
      w.time = 1000;
      d.lastRelease = 1000 - (verdict === 'surge' ? 1 : 8);
      const res = d.score(w);
      return { from: tier, to: d.tier, verdict: res.verdict };
    };
    const gate = gates[0];                       // 6, ORDINAL
    out.intoGate = climbFrom(gate - 1, 'clean'); // 5 -> 6, allowed
    out.atGate = climbFrom(gate, 'clean');       // 6 -> 6, held
    out.surgeOver = climbFrom(gate - 1, 'surge');// 5 -> 6, NOT 7
    out.surgeBelow = climbFrom(gate - 3, 'surge');// 3 -> 5, nothing in the way

    // ...and once it is reconciled the same wave climbs straight through
    g.restart(); w.reconciled.length = 0; w.reconciled.push(1);
    d.setTier(gate); d.hold = false; d.grace = 0; d.probe = null;
    d.order = [real]; d.at = 0; d.asked = 10; d.contact = 0; d.hitPatience = false;
    w.time = 1000; d.lastRelease = 992;
    d.score(w);
    out.past = d.tier;

    // ---- a drop is never gated: going back was not what had to be earned ----
    // Posed through the glitch timer from build 210, because the verdict table
    // no longer has a way down to pose. The gate is on the rung being LEFT,
    // which is the case that matters: a gate that held the fall as well as the
    // climb would strand a run on the one rung it has proved it cannot hold.
    g.restart(); w.reconciled.length = 0;
    d.setTier(gate); d.hold = false; d.grace = 0; d.probe = null;
    d.order = [real]; d.at = 0; d.asked = 10; d.contact = 0; d.hitPatience = false;
    w.time = 1000; d.lastRelease = 1000;
    out.routed = d.glitchOut(w).moved;

    // ---- a trial may not vault a gate ----
    g.restart(); w.reconciled.length = 0;
    d.setTier(gate); d.peak = gate; d.probe = null; d.probeLock = 0;
    out.trialOverGate = d.trial(gate + 3, w);
    w.reconciled.push(1);
    d.probe = null; d.probeLock = 0;
    out.trialOnceOpen = !!d.trial(gate + 3, w);

    // ---- standing on a gate lights the banner, free ----
    g.restart();
    w.reconciled.length = 0;
    for (let i = 1; i <= 7; i++) w.apertures[i] = 0;
    const spent = w.energy;
    d.setTier(gate);
    g.syncGate();
    out.lit = w.apertures[1] | 0;
    out.costNothing = w.energy === spent;
    out.heldRows = (await import('../src/anomaly.js')).heldList(w).length;
    // ...and it cannot be farmed by standing there
    for (let i = 0; i < 5; i++) g.syncGate();
    out.stillOne = w.apertures[1] | 0;
    // ...and an ordinary rung lights nothing
    d.setTier(gate + 1); w.apertures[1] = 0; g.syncGate();
    out.offGate = w.apertures[1] | 0;

    // ---- the withdrawal ----
    g.restart();
    w.reconciled.length = 0;
    d.setTier(gate);
    g.syncGate();
    g.openBoss(1);
    for (let i = 0; i < 240; i++) g.update(1 / 60);   // through the arrival
    out.stood = !!w.boss;
    out.stageWas = w.bossStage;
    // Hold the stage still and run past patience. dtRaw is what watchBoss
    // counts, so the wall clock is not what this is waiting on.
    let ticks = 0;
    while (w.boss && ticks < 60 * 200) { g.update(1 / 60); ticks++; }
    out.withdrewAfter = +(ticks / 60).toFixed(1);
    out.patience = CFG.boss.patience;
    out.gone = !w.boss;
    out.notReconciled = !w.reconciled.includes(1);
    out.stillLit = (w.apertures[1] | 0) > 0 || (g.syncGate(), (w.apertures[1] | 0) > 0);
    out.tierKept = d.tier;

    // ---- and beating one is worth the rung it was standing in front of ----
    g.restart();
    w.reconciled.length = 0;
    d.setTier(gate);
    g.syncGate();
    g.openBoss(1);
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    if (w.boss) { w.boss.done = true; g.update(1 / 60); }
    out.afterWin = { tier: d.tier, reconciled: [...w.reconciled] };

    g.restart();
    return out;
  });

  check('the seven anomalies stand on rungs of the ladder',
    r.gates.length === 7 && r.gates.every((x, i) => i === 0 || x > r.gates[i - 1]),
    `gates at ${r.gates.join(', ')}`);
  check('a gate rung can be climbed to, and not past',
    r.intoGate.to === 6 && r.atGate.to === 6,
    `5 -> ${r.intoGate.to}, then 6 -> ${r.atGate.to} on a clean wave`);
  check('...and a surge steps ON to a gate rather than over it',
    r.surgeOver.to === 6 && r.surgeOver.verdict === 'surge' && r.surgeBelow.to === 5,
    `surge from 5 lands on ${r.surgeOver.to}; the same surge from 3 lands on ${r.surgeBelow.to}`);
  check('...and once the anomaly is reconciled the rung opens',
    r.past === 7, `at 6 with ORDINAL reconciled, a clean wave goes to ${r.past}`);
  check('a gate holds the climb and never the fall',
    r.routed === -1, `a glitch at the gate moved ${r.routed}`);
  check('a trial cannot be used to vault a gate',
    r.trialOverGate === null && r.trialOnceOpen === true,
    `armed over a standing gate: ${JSON.stringify(r.trialOverGate)}; once open: ${r.trialOnceOpen}`);
  check('standing on a gate lights its banner, and costs nothing',
    r.lit === 1 && r.costNothing && r.heldRows === 1 && r.stillOne === 1 && r.offGate === 0,
    `apertures held ${r.lit}, banner rows ${r.heldRows}, energy unchanged ${r.costNothing}, `
    + `after five more frames ${r.stillOne}, on an ordinary rung ${r.offGate}`);
  check('an anomaly that stands too long without losing a stage withdraws',
    r.stood && r.gone && r.withdrewAfter >= r.patience && r.withdrewAfter < r.patience * 1.5,
    `stood up ${r.stood}, went after ${r.withdrewAfter}s against a patience of ${r.patience}s`);
  check('...leaving nothing reconciled, the gate lit and the rung where it was',
    r.notReconciled && r.stillLit && r.tierKept === 6,
    `reconciled ${!r.notReconciled}, still lit ${r.stillLit}, standing on ${r.tierKept}`);
  check('and beating one hands over the rung it was standing in front of',
    r.afterWin.reconciled.includes(1) && r.afterWin.tier === 7,
    `reconciled ${JSON.stringify(r.afterWin.reconciled)}, now on rung ${r.afterWin.tier}`);
}

// --- the waves start asking a different question ----------------------------
/*
 * Past band 5 the ladder introduced nothing new: the climb was carried by
 * population, health and bounty, which are three ways of saying "more of the
 * same". A trait is the fourth thing -- the same wave, answered differently.
 *
 * Every rule here is asserted by MEASURING IT, not by reading the flag back.
 * A trait that is stamped on a body and does nothing is the exact bug this
 * phase could ship without noticing, and `e.traits.includes(...)` would pass
 * on every one of them.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES, TYPE_BY_ID } = await import('../src/config.js');
    const { TRAITS, traitAt, traitsFor, traitCount } = await import('../src/traits.js');
    const T = CFG.waves.tier;
    const w = g.world;
    const d = w.director;
    const out = { ids: TRAITS.map((t) => t.id) };

    // ---- seeded, not rolled ----
    out.stable = traitAt(1234, 2, 3).id === traitAt(1234, 2, 3).id;
    out.varies = new Set(Array.from({ length: 40 }, (_, i) => traitAt(99, 0, i).id)).size;
    out.differsBySeed = traitAt(1, 0, 0).id !== traitAt(2, 0, 0).id
      || traitAt(1, 0, 1).id !== traitAt(2, 0, 1).id;

    // ---- when they arrive ----
    out.count = [1, 9, 10, 24, 25, 40].map((t) => traitCount(t));
    const teach = WAVES.find((x) => x.teach && x.of.length);
    const bonus = WAVES.find((x) => !x.teach && (!x.of || !x.of.length));
    out.onTeach = traitsFor(w, teach, 30, 1, 0).length;
    out.onBonus = bonus ? traitsFor(w, bonus, 30, 1, 0).length : -1;

    // A body, released under a chosen trait, at a rung that carries one.
    const bodyUnder = (id, typeId = 'mote') => {
      g.debugClearField();
      d.setTier(30);
      d.traits = [TRAITS.find((t) => t.id === id)];
      d.pairing = null;
      const e = g.debugSpawn(typeId, w.width / 2, 240);
      if (e) { e.staged = false; e.spawnIn = 0; }
      return e;
    };

    // ---- ARMORED: the first hit each second does nothing ----
    let e = bodyUnder('armored');
    const armorFull = e.hp;
    e.applyDamage(w, 50);
    const afterFirst = e.hp;
    e.applyDamage(w, 50);
    const afterSecond = e.hp;
    for (let i = 0; i < 70; i++) e.update(w, 1 / 60);   // past plateEvery
    e.applyDamage(w, 50);
    const afterWait = e.hp;
    out.armored = { turned: afterFirst === armorFull, thenHurt: afterSecond < afterFirst,
      turnsAgain: afterWait === afterSecond };
    // ...and an untraited body of the same type takes the first hit
    d.traits = [];
    const plain = g.debugSpawn('mote', w.width / 2, 240);
    plain.staged = false; plain.spawnIn = 0;
    const plainFull = plain.hp;
    plain.applyDamage(w, 50);
    out.armored.plainTakesIt = plain.hp < plainFull;

    // ---- MENDING: it closes unless you keep hitting it ----
    e = bodyUnder('mending');
    e.hp = e.maxHp * 0.5;
    const mendFrom = e.hp;
    w.time = 500;
    for (let i = 0; i < 120; i++) { w.time += 1 / 60; e.update(w, 1 / 60); }
    const mended = e.hp;
    // ...and two hits inside the window stop it
    e.hp = e.maxHp * 0.5;
    const pressFrom = e.hp;
    for (let i = 0; i < 120; i++) {
      w.time += 1 / 60;
      if (i % 20 === 0) { e.hitAt2 = w.time; e.hitAt = w.time; }
      e.update(w, 1 / 60);
    }
    out.mending = { closes: mended > mendFrom + 1, pressedHolds: e.hp <= pressFrom + 1,
      gained: +(mended - mendFrom).toFixed(1) };

    // ---- SWARM: twice as many, half the health ----
    const load = (id) => {
      g.debugClearField();
      d.setTier(30);
      d.lane = null;
      // Every authored wave carries two or three types -- check-build asserts
      // it -- so "one type" finds nothing and hands load() undefined.
      const wave = WAVES.find((x) => !x.teach && x.of && x.of.length);
      d.order = [WAVES.indexOf(wave)]; d.at = 0;
      /*
       * Pinned through the LANE, not by writing `traits` afterwards.
       *
       * SWARM's doubling happens inside load(), which re-decides the traits
       * from the seed on the way in -- so a trait written on after the call is
       * too late for the half of the rule that matters, and the first version
       * of this case reported "asked 64 -> 64" with the health correctly
       * halved. The lane is the game's own way of fixing a trait for a wave,
       * so using it tests the path a player would take.
       */
      /*
       * The baseline has to be genuinely UNTRAITED, which "no lane" is not: a
       * rung-30 wave still draws two seeded traits, and when the seed rolls
       * SWARM into the baseline the comparison reads 393 against 396 and the
       * rule looks broken on a working build. The threshold is lifted for the
       * baseline only, and put straight back.
       */
      const was = CFG.waves.tier.traitFrom;
      if (!id) CFG.waves.tier.traitFrom = 9999;
      d.lane = id ? { id, until: 9999 } : null;
      d.load(w, wave);
      CFG.waves.tier.traitFrom = was;
      const askedAt = d.asked;
      for (let i = 0; i < 400 && d.jobs.length; i++) d.emit(w);
      const born = w.enemies.filter((x) => !x.harmless && !x.dead);
      return { asked: askedAt, born: born.length,
        hp: born.length ? born.reduce((a, x) => a + x.maxHp, 0) / born.length : 0 };
    };
    const plainWave = load(null);
    const swarmWave = load('swarm');
    out.swarmPinned = (d.traits || []).some((t) => t.id === 'swarm');
    out.traitFromKept = CFG.waves.tier.traitFrom === T.traitFrom;
    out.swarm = { plain: plainWave, swarm: swarmWave,
      moreBodies: swarmWave.asked >= plainWave.asked * 1.9,
      lighter: swarmWave.hp < plainWave.hp * 0.7 };

    // ---- TETHERED: pairs share one pool ----
    const tw = load('tethered');
    const paired = w.enemies.filter((x) => !x.dead && x.tether && !x.type.tows);
    let shared = false;
    if (paired.length >= 2) {
      const a = paired[0];
      const b = a.tether.other;
      const before = b.hp;
      /*
       * Hit until one LANDS. Rung 30 carries two traits, and if the second is
       * ARMORED the first hit is turned away entirely -- applyDamage returns
       * before the mirroring, so the pair stays equal at full health and a
       * case checking "the other one dropped too" reads false on a working
       * build. A case about one rule has to survive the other.
       */
      let tries = 0;
      while (a.hp >= before && tries < 4) { a.applyDamage(w, Math.max(1, before * 0.2)); tries++; }
      shared = Math.abs(b.hp - a.hp) < 0.01 && b.hp < before;
      out.tetherTries = tries;
    }
    out.tethered = { pairs: paired.length, of: tw.born, shared };

    // ---- EBB: wreckage goes the other way ----
    const drift = (id) => {
      g.debugClearField();
      w.drops.length = 0;
      d.setTier(30);
      d.traits = id ? [TRAITS.find((t) => t.id === id)] : [];
      const body = g.debugSpawn('bulwark', w.width / 2, 260);
      body.staged = false; body.spawnIn = 0;
      body.traits = d.traits.length ? d.traits : null;
      body.destroy(w);
      const motes = w.drops.filter((m) => !m.dead);
      if (!motes.length) return null;
      const far = () => {
        const live = motes.filter((m) => !m.dead);
        if (!live.length) return null;
        return live.reduce((a, m) => a + Math.hypot(m.x - w.shooter.x, m.y - w.shooter.y), 0)
          / live.length;
      };
      const d0 = far();
      /*
       * The WHOLE step, not Enemy.update. update() only steers -- it sets a
       * velocity -- and integrate() in physics.js is what moves the body. The
       * first version of this case called update in a loop and reported both
       * the traited and untraited motes sitting at exactly the distance they
       * started, which is a probe measuring its own omission.
       */
      d.update = () => {};                       // no new waves mid-measurement
      /*
       * AFTER the burst, not through it. A body's wreckage leaves it at 70 to
       * 240 u/s in every direction and the motes spend the best part of a
       * second still flying outward on that throw, so a window that opens on
       * the frame of death is measuring the explosion rather than the
       * steering: the untraited baseline read 741 -> 744 on one run -- three
       * units OUT, on motes whose whole job is to come in -- and the case
       * failed on a working build. Three quarters of a second for the throw
       * to spend itself, and then a second and a half of what this is about.
       */
      for (let i = 0; i < 45; i++) g.update(1 / 60);
      const d0b = far();
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      const d1 = far();
      return { n: motes.length, thrown: +d0.toFixed(0), from: d0b === null ? null : +d0b.toFixed(0),
        to: d1 === null ? null : +d1.toFixed(0) };
    };
    const realUpdate = Object.getPrototypeOf(d).update;
    out.ebbPlain = drift(null);
    out.ebb = drift('ebb');
    // ...and it goes back. reset() keeps the same Director, so a stub left
    // here starves every later case of waves.
    delete d.update;
    if (d.update !== realUpdate) d.update = realUpdate;
    out.directorRestored = d.update === realUpdate;

    // ---- a lane fixes one for a stretch ----
    g.restart();
    d.setTier(12);
    const offer = d.offerLane(w);
    out.offered = offer.length === 2 && offer[0].id !== offer[1].id;
    out.tookWrong = d.takeLane('nonesuch');
    const took = d.takeLane(offer[0].id);
    out.lane = took ? { id: took.id, until: took.until } : null;
    out.laneFor = T.laneFor;
    out.offerCleared = d.laneOffer === null;

    g.debugClearField();
    g.restart();
    return out;
  });

  check('the five rules exist, and which one a wave carries is seeded not rolled',
    r.ids.length === 5 && r.stable && r.varies >= 4 && r.differsBySeed,
    `${r.ids.join(', ')}; 40 waves of one seed used ${r.varies} of them, and two seeds differ`);
  check('nothing is traited below rung 10, one from there, two from 25',
    JSON.stringify(r.count) === JSON.stringify([0, 0, 1, 1, 2, 2]),
    `rungs 1/9/10/24/25/40 carry ${r.count.join('/')} traits`);
  check('...and never the opening or the bonus wave',
    r.onTeach === 0 && r.onBonus === 0,
    `teach wave ${r.onTeach}, drift-only bonus wave ${r.onBonus}`);
  check('ARMORED turns the first hit each second, and only the first',
    r.armored.turned && r.armored.thenHurt && r.armored.turnsAgain && r.armored.plainTakesIt,
    `first hit turned ${r.armored.turned}, second landed ${r.armored.thenHurt}, `
    + `turns again after a second ${r.armored.turnsAgain}; an untraited body of the same `
    + `type takes it ${r.armored.plainTakesIt}`);
  check('MENDING closes a wound, and two hits inside the window stop it',
    r.mending.closes && r.mending.pressedHolds,
    `left alone for two seconds it gained ${r.mending.gained} hp; under fire it did not`);
  check('SWARM is twice as many at half the health',
    r.swarmPinned && r.traitFromKept && r.swarm.moreBodies && r.swarm.lighter,
    `asked ${r.swarm.plain.asked} -> ${r.swarm.swarm.asked}, mean health `
    + `${r.swarm.plain.hp.toFixed(0)} -> ${r.swarm.swarm.hp.toFixed(0)}`);
  check('TETHERED joins them in pairs that share one pool of health',
    r.tethered.pairs >= 2 && r.tethered.shared,
    `${r.tethered.pairs} of ${r.tethered.of} bodies paired; hurting one hurt the other `
    + `by the same amount: ${r.tethered.shared} (took ${r.tetherTries} hit(s) to land one)`);
  check('EBB sends the wreckage the other way',
    r.directorRestored && r.ebb && r.ebbPlain && r.ebb.from !== null && r.ebbPlain.from !== null
    && r.ebb.to > r.ebb.from && r.ebbPlain.to < r.ebbPlain.from,
    `once the throw is spent -- traited: ${r.ebb && `${r.ebb.from} -> ${r.ebb.to}`} units `
    + `from the turret; untraited: ${r.ebbPlain && `${r.ebbPlain.from} -> ${r.ebbPlain.to}`}`);
  check('a gate offers two lanes, and taking one fixes it for a stretch',
    r.offered && r.tookWrong === null && r.lane && r.lane.until === 12 + r.laneFor
    && r.offerCleared,
    `offer of two ${r.offered}; a trait not offered is refused ${r.tookWrong === null}; `
    + `took ${r.lane && r.lane.id} until rung ${r.lane && r.lane.until}`);
}

// --- the wave sheet ---------------------------------------------------------
/*
 * Two decisions about the wave that is running, taken from the rail rather
 * than from the strip -- which is full at eight, and neither of these is
 * something the turret does.
 *
 * The brief specified a sheet that "holds the world the way Offers do". The
 * Offers reward pool is documented in the README and does not exist in this
 * codebase: no pool, no implementation, and `hud.offerResume` is the title
 * screen's "resume your run". `Game.paused` is what actually holds a run, so
 * the sheet joins the menu and the loadout there -- and that is asserted, not
 * assumed, because a modal that does not stop the field is a modal you get
 * killed behind.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const T = CFG.waves.tier;
    const w = g.world;
    const d = w.director;
    const out = {};
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);

    // ---- both are in the tree, and sealed until the run has stood on 10 ----
    const nodes = NODES.filter((n) => n.id === 'recall' || n.id === 'overclock');
    out.inTree = nodes.length;
    out.rungs = nodes.map((n) => n.rung);
    g.restart();
    g.debugGiveEnergy(500000);
    d.setTier(1); d.peak = 1;
    out.sealedLow = nodes.every((n) => !g.available(n));
    d.setTier(T.sheetRung); d.peak = T.sheetRung;
    out.openAt10 = nodes.every((n) => g.available(n));
    // ...and stepping back down does not re-seal what has been earned
    d.reach(3);
    out.staysOpen = nodes.every((n) => g.available(n));

    // ---- the sheet holds the world ----
    g.restart();
    w.phase = 'staging';
    const before = { pausedWas: g.paused };
    g.openSheet(true);
    out.holds = { open: g.sheetOpen, paused: g.paused, wasPaused: before.pausedWas };
    // ...and nothing moves while it is up
    g.debugClearField();
    const body = g.debugSpawn('mote', w.width / 2, 200);
    body.staged = false; body.spawnIn = 0;
    const at = { x: body.x, y: body.y };
    const at0 = d.at;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    out.frozen = Math.abs(body.x - at.x) < 0.01 && Math.abs(body.y - at.y) < 0.01
      && d.at === at0;
    g.openSheet(false);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    out.movesAgain = Math.abs(body.x - at.x) > 0.01 || Math.abs(body.y - at.y) > 0.01;

    // ---- a wave posed at a chosen cleared fraction ----
    const pose = (cleared) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      d.setTier(20); d.peak = 20; d.hold = false; d.grace = 0; d.probe = null;
      d.order = [real]; d.at = 0;
      d.resting = false;
      d.asked = 10; d.contact = 0; d.hitPatience = false; d.take = 0;
      d.jobs.length = 0;
      w.time = 1000; d.lastRelease = 1000;
      const left = Math.round(10 * (1 - cleared));
      // Killed AND still standing. RECALL scores what is down, and posing
      // only the survivors used to be enough because the reading was
      // `asked - alive` -- which meant a wave RECALLED before it had arrived
      // scored a clean for nothing. See Director.cleared.
      d.slain = 10 - left;
      for (let i = 0; i < left; i++) {
        const e = g.debugSpawn('mote', 40 + i * 14, 140);
        if (e) { e.staged = false; e.spawnIn = 0; }
      }
      d.recall = { held: 1, max: 1, cd: 0 };
      return d.recallWave(w);
    };
    out.recallClean = pose(0.9);
    out.recallStall = pose(0.3);
    // ...and it is spent, with a clock on it
    out.spent = { held: d.recall.held, cd: Math.round(d.recall.cd) };
    out.cdWanted = T.recallCd;
    // ...and a spent RECALL refuses
    out.refuses = d.recallWave(w);

    // ---- OVERCLOCK ----
    g.restart();
    d.setTier(20);
    d.overclock = { held: 1, max: 1, cd: 0, armed: false };
    out.armed = d.armOverclock();
    out.armedTwice = d.armOverclock();
    out.overSpent = { held: d.overclock.held, cd: Math.round(d.overclock.cd) };
    const plainBounty = (() => { d.overclock.armed = false; return d.scaleAt(20).bounty; })();
    d.overclock.armed = true;
    const hotBounty = d.scaleAt(20).bounty;
    out.paysDouble = Math.abs(hotBounty / plainBounty - T.overclockBounty) < 1e-9;
    // ...and the gap it releases at
    /*
     * Reloaded between the two, because the first twelve emits empty the jobs
     * and the second loop then never runs -- the first version of this read
     * "0.541s armed against 0s plain" and the zero was the loop not happening.
     */
    /*
     * Pooled over many loads. `formAt` groups three or more of a type into ONE
     * job, so an authored wave is about two jobs and a single load yields two
     * samples -- the first version averaged those two and read 0.873s against
     * an expected 1.275s, which is two unlucky draws from a range of
     * [0.85, 1.7] and not a defect. Twenty-odd samples settles it.
     */
    const gapsUnder = (armed) => {
      const out2 = [];
      for (let pass = 0; pass < 12; pass++) {
        g.debugClearField();
        d.order = [real]; d.at = 0; d.resting = false;
        d.load(w, WAVES[real]);
        d.overclock.armed = armed;
        for (let i = 0; i < 12 && d.jobs.length; i++) { d.emit(w); out2.push(d.timer); }
      }
      d.overclock.armed = false;
      return out2;
    };
    const gaps = gapsUnder(true);
    const slow = gapsUnder(false);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    out.gap = { hot: +mean(gaps).toFixed(3), plain: +mean(slow).toFixed(3),
      n: Math.min(gaps.length, slow.length) };

    g.debugClearField();
    g.restart();
    return out;
  });

  check('RECALL and OVERCLOCK are in the tree, sealed until the run has stood on 10',
    r.inTree === 2 && r.rungs.every((x) => x === 10) && r.sealedLow && r.openAt10,
    `${r.inTree} nodes at rung ${r.rungs.join('/')}; sealed at rung 1 ${r.sealedLow}, `
    + `open at 10 ${r.openAt10}`);
  check('...and stepping back down does not re-seal what has been earned',
    r.staysOpen, `available after stepping back to rung 3: ${r.staysOpen}`);
  check('the sheet holds the world, the way the menu and the loadout do',
    !r.holds.wasPaused && r.holds.open && r.holds.paused && r.frozen && r.movesAgain,
    `paused ${r.holds.paused}; the field froze ${r.frozen} and moved again on close `
    + `${r.movesAgain}`);
  check('RECALL takes what is cleared: three quarters is a clean, less is a stall',
    r.recallClean && r.recallClean.verdict === 'clean' && r.recallClean.moved === 1
    && r.recallStall && r.recallStall.verdict === 'stall' && r.recallStall.moved === 0,
    `90% cleared -> ${r.recallClean && r.recallClean.verdict} (${r.recallClean && r.recallClean.moved}); `
    + `30% -> ${r.recallStall && r.recallStall.verdict} (${r.recallStall && r.recallStall.moved})`);
  check('...and it is spent, and refuses until the clock runs out',
    r.spent.held === 0 && r.spent.cd === r.cdWanted && r.refuses === null,
    `after use: ${r.spent.held} in hand, ${r.spent.cd}s to wait; a second call gave `
    + `${JSON.stringify(r.refuses)}`);
  check('OVERCLOCK arms once, pays double, and halves the gap',
    r.armed && !r.armedTwice && r.overSpent.held === 0 && r.paysDouble
    && r.gap.hot < r.gap.plain * 0.62 && r.gap.n >= 20,
    `armed ${r.armed}, again ${r.armedTwice}; bounty x${2} ${r.paysDouble}; `
    + `mean release gap ${r.gap.hot}s armed against ${r.gap.plain}s plain `
    + `(${r.gap.n} samples each)`);
}

// --- the rail says how it is going, and the sheet is really held ------------
/*
 * Two halves of the same phase.
 *
 * THE SHEET IS HELD THE WAY THE MENU AND THE LOADOUT ARE. `#ui button
 * { pointer-events: auto }` carries an id, so nothing built out of classes can
 * turn a control back off -- `body.menuOpen #quickBar { pointer-events: none }`
 * never disabled a single button, and the strip stayed fully pressable under
 * the sheet covering it for however many builds. A deliberate disable has to
 * name an id of its own. Asserted on the RENDERED style rather than on the
 * class, because the class is what was already there and wrong.
 *
 * THE RAIL SAYS HOW IT IS GOING. The three meters AUDIT shows are on the rung
 * the run is standing on, so the verdict is legible before it is announced --
 * and asserted as rendered boxes, never as a property, for the same reason the
 * AUTO AIM row had to be: `el.hidden` does nothing to an element the sheet
 * gives a display to.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES } = await import('../src/config.js');
    const T = CFG.waves.tier;
    const w = g.world;
    const d = w.director;
    const out = {};
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);
    const pe = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).pointerEvents : 'missing';
    };

    g.restart();
    w.phase = 'staging';
    d.setTier(12); d.peak = 12;
    g.hud.syncRail(w);
    out.closed = {
      strip: pe('#quickBar button'), abil: pe('#abilities button'),
      rail: pe('#railUp'), body: document.body.classList.contains('sheetOpen'),
    };
    g.openSheet(true);
    out.open = {
      strip: pe('#quickBar button'), abil: pe('#abilities button'),
      // sheetClose, not sheetRecall: RECALL is legitimately `disabled` until the
      // tree has sold it, and `#waveSheet .sheetAct[disabled]` rightly beats
      // the rule that turns the sheet back on. Measuring it asked whether an
      // unbought control is pressable, which is not the question.
      rail: pe('#railUp'), sheet: pe('#sheetClose'),
      body: document.body.classList.contains('sheetOpen'),
      // ...and it is actually on screen, not merely un-hidden.
      box: document.getElementById('waveSheet').getBoundingClientRect().height,
    };
    // ...and it does not outlive its opener
    g.restart();
    out.afterRestart = { open: g.sheetOpen, cls: document.body.classList.contains('sheetOpen') };
    w.phase = 'staging';
    d.setTier(6); d.peak = 6;
    w.reconciled.length = 0;
    g.syncGate();
    g.openSheet(true);
    g.openBoss(1);
    out.afterBoss = g.sheetOpen;
    if (w.boss) { w.boss.clear(w); w.boss = null; w.bossN = 0; w.bossStage = 0; }

    // ---- the meters, on the rung the run is standing on ----
    g.restart();
    w.phase = 'staging';
    g.debugClearField();
    d.setTier(12); d.peak = 12; d.hold = true;
    d.order = [real]; d.at = 0; d.resting = false;
    d.asked = 10; d.contact = 0; d.hitPatience = false;
    w.time = 1000; d.lastRelease = 1000;
    /*
     * Six of ten down, four still up. Posed as `slain` AND bodies, because
     * the meter reads what was killed against what is still there -- it used
     * to read `asked` minus the field, which called six of ten cleared on a
     * wave nobody had shot at. See Director.cleared.
     */
    d.jobs.length = 0;
    d.slain = 6;
    for (let i = 0; i < 4; i++) {
      const e = g.debugSpawn('mote', 40 + i * 20, 150);
      if (e) { e.staged = false; e.spawnIn = 0; }
    }
    g.hud.syncRail(w);
    const cellAt = () => [...document.querySelectorAll('.railNode')]
      .find((el) => Number(el.querySelector('b').textContent) === d.tier);
    const widths = () => [...cellAt().querySelectorAll('.rBars em')]
      .map((el) => parseFloat(el.style.width) || 0);
    out.barsShown = cellAt().querySelector('.rBars').getBoundingClientRect().height > 0;
    const w0 = widths();
    // Six seconds on the turret, and half the wave gone.
    d.contact = T.failContact * 0.5;
    w.time = 1000 + T.cleanWithin * 0.5;
    g.hud.syncRail(w);
    const w1 = widths();
    out.moved = w1.some((x, i) => Math.abs(x - w0[i]) > 1);
    out.contactBar = w1[0];
    out.sinceBar = w1[1];
    out.clearedBar = w1[2];
    // ...and between waves there is nothing to report
    d.resting = true;
    g.hud.syncRail(w);
    out.hiddenBetween = cellAt().querySelector('.rBars').getBoundingClientRect().height === 0;

    // ---- a gate is honest at a distance ----
    d.resting = false;
    d.setTier(4); d.peak = 12;
    w.reconciled.length = 0;
    g.hud.syncRail(w);
    const nodes = [...document.querySelectorAll('.railNode')].map((el) => ({
      n: Number(el.querySelector('b').textContent),
      gate: el.classList.contains('gate'), shut: el.classList.contains('shut'),
    }));
    out.gateAhead = nodes.find((x) => x.n === 6) || null;
    out.plainRung = nodes.find((x) => x.n === 5) || null;
    w.reconciled.push(1);
    g.hud.syncRail(w);
    out.gateOpened = [...document.querySelectorAll('.railNode')]
      .some((el) => Number(el.querySelector('b').textContent) === 6
        && el.classList.contains('gate') && !el.classList.contains('shut'));

    g.debugClearField();
    g.restart();
    return out;
  });

  check('the sheet takes the strip, the abilities and the rail out of play',
    r.closed.strip === 'auto' && r.open.strip === 'none'
    && r.open.abil === 'none' && r.open.rail === 'none' && r.open.sheet === 'auto'
    && r.open.box > 0,
    `strip pointer-events ${r.closed.strip} -> ${r.open.strip}, abilities ${r.open.abil}, `
    + `rail ${r.open.rail}, the sheet itself ${r.open.sheet}; sheet ${r.open.box}px tall`);
  check('...and it never outlives its opener',
    !r.afterRestart.open && !r.afterRestart.cls && !r.afterBoss,
    `after a restart ${r.afterRestart.open} (class ${r.afterRestart.cls}); `
    + `with an anomaly up ${r.afterBoss}`);
  check('the rung the run is on carries the three meters, and they move',
    r.barsShown && r.moved && r.contactBar > 40 && r.contactBar < 60
    && r.sinceBar > 40 && r.sinceBar < 60 && r.clearedBar > 50,
    `drawn ${r.barsShown}; contact ${r.contactBar}%, since ${r.sinceBar}%, `
    + `cleared ${r.clearedBar}% (half, half, and six of ten down)`);
  check('...and says nothing between waves',
    r.hiddenBetween, `bars still drawn while resting: ${!r.hiddenBetween}`);
  check('a gate is marked on the rung it stands on, from any distance',
    r.gateAhead && r.gateAhead.gate && r.gateAhead.shut
    && r.plainRung && !r.plainRung.gate && r.gateOpened,
    `standing on 4: rung 6 gate ${r.gateAhead && r.gateAhead.gate} shut `
    + `${r.gateAhead && r.gateAhead.shut}, rung 5 gate ${r.plainRung && r.plainRung.gate}; `
    + `once reconciled it is marked and open: ${r.gateOpened}`);
}

// --- everything builds 200-207 added survives a save, and none of it leaks ---
/*
 * The wave-system work put nine new pieces of state on the Director and one on
 * the world, across seven builds. Each was saved and restored on its own and
 * none of it had ever been round-tripped together.
 *
 * Two failure modes, and only a round trip catches either. A field that is
 * WRITTEN but not READ comes back as its default -- a spent RECALL returns full,
 * a lane the player chose is gone. A field that is neither written nor cleared
 * LEAKS -- reset() keeps the same Director object, so whatever the last run
 * left in it is what the next run starts with. This repo has been bitten by the
 * second one before: a stubbed `director.update` outlived three restarts and
 * starved every later case of waves.
 *
 * Ordering matters and is asserted by consequence rather than by reading the
 * code: the ledger replays the tree BEFORE director.restore, so a bought RECALL
 * sets max=1 and held=1, and the saved `held` has to win over that. If the two
 * ran the other way round, a spent charge would come back in hand.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { captureRun } = await import('../src/save.js');
    const { TRAITS } = await import('../src/traits.js');
    const w = g.world;
    const d = w.director;
    const out = {};

    // ---- dirty every new field with a value nothing defaults to ----
    g.restart();
    g.debugGiveEnergy(500000);
    d.setTier(14); d.peak = 19;
    g.buy('recall'); g.buy('overclock');   // sealed until rung 10; peak is 19
    out.bought = { recall: d.recall.max, overclock: d.overclock.max };
    w.runSeed = 123456;
    w.reconciled.length = 0; w.reconciled.push(1, 2);
    d.hold = true;
    d.grace = 1;
    /*
     * Through trial(), not by writing `probe` beside a tier it disagrees with.
     * A real trial always stands the run ON probe.to, and restore() repairs an
     * incoherent pair by trusting the probe -- so a hand-built {from:14,to:22}
     * with tier 14 comes back as 22 and reads as a round-trip failure when it
     * is the safety net working. The gates have to be answered first: a trial
     * may not vault one, which is asserted elsewhere.
     */
    w.reconciled.push(3);
    d.setTier(19); d.peak = 19;
    d.trial(22, w);
    d.lane = { id: TRAITS[2].id, until: 20 };
    d.recall.held = 0; d.recall.cd = 41;
    d.overclock.held = 0; d.overclock.cd = 77; d.overclock.armed = true;
    const before = {
      runSeed: w.runSeed, reconciled: [...w.reconciled],
      tier: d.tier, peak: d.peak, hold: d.hold, grace: d.grace,
      probe: { ...d.probe }, lane: { ...d.lane },
      recall: { held: d.recall.held, cd: d.recall.cd, max: d.recall.max },
      overclock: { held: d.overclock.held, cd: d.overclock.cd,
        armed: d.overclock.armed, max: d.overclock.max },
    };
    // Through storage, the way a returning player does it -- resume() reads
    // localStorage rather than taking a snapshot, and the point of this case
    // is the whole path and not the two ends of it.
    g.checkpoint();
    const snap = captureRun(w, g);
    const stored = localStorage.getItem('sim7749-run');

    // ---- a different run in between, so a leak cannot masquerade as a restore --
    g.restart();
    d.setTier(2); d.peak = 2;
    const fresh = {
      runSeed: w.runSeed, reconciled: [...w.reconciled],
      grace: d.grace, probe: d.probe, lane: d.lane, laneOffer: d.laneOffer,
      traits: (d.traits || []).length, pairing: d.pairing, probeLock: d.probeLock,
      take: d.take,
      recall: { held: d.recall.held, cd: d.recall.cd, max: d.recall.max },
      overclock: { held: d.overclock.held, cd: d.overclock.cd,
        armed: d.overclock.armed, max: d.overclock.max },
    };
    out.clean = fresh;
    out.seedRerolled = fresh.runSeed !== before.runSeed;

    // ---- ...and back ----
    localStorage.setItem('sim7749-run', stored);
    g.resume();
    out.after = {
      runSeed: w.runSeed, reconciled: [...w.reconciled],
      tier: d.tier, peak: d.peak, hold: d.hold, grace: d.grace,
      probe: d.probe ? { ...d.probe } : null, lane: d.lane ? { ...d.lane } : null,
      recall: { held: d.recall.held, cd: d.recall.cd, max: d.recall.max },
      overclock: { held: d.overclock.held, cd: d.overclock.cd,
        armed: d.overclock.armed, max: d.overclock.max },
    };
    out.before = before;

    // ---- a save from before any of this restores to defaults, not to junk ----
    /*
     * Genuinely legacy: the fields are absent AND the ledger has no post-205
     * node in it. Deleting only the fields leaves a save that bought RECALL,
     * and the ledger replay then rightly hands the charge over -- which is the
     * code working and looks like a leak.
     */
    const old = JSON.parse(JSON.stringify(snap));
    delete old.runSeed;
    delete old.wave.lane; delete old.wave.probe; delete old.wave.grace;
    delete old.wave.recall; delete old.wave.overclock;
    old.taken = (old.taken || []).filter((id) => id !== 'recall' && id !== 'overclock');
    g.restart();
    localStorage.setItem('sim7749-run', JSON.stringify(old));
    g.resume();
    out.legacy = {
      runSeed: w.runSeed, lane: d.lane, probe: d.probe, grace: d.grace,
      recallHeld: d.recall.held, recallMax: d.recall.max,
      overArmed: d.overclock.armed, tier: d.tier,
    };

    g.restart();
    return out;
  });

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('the tree sells RECALL and OVERCLOCK once the run has stood on rung 10',
    r.bought.recall === 1 && r.bought.overclock === 1,
    `after buying: recall max ${r.bought.recall}, overclock max ${r.bought.overclock}`);
  check('a fresh run starts with none of the wave system’s state left over',
    r.clean.grace === 0 && r.clean.probe === null && r.clean.lane === null
    && r.clean.laneOffer === null && r.clean.traits === 0 && r.clean.pairing === null
    && r.clean.probeLock === 0 && r.clean.take === 0
    && r.clean.recall.max === 0 && r.clean.recall.held === 0 && r.clean.recall.cd === 0
    && r.clean.overclock.max === 0 && r.clean.overclock.armed === false
    && r.clean.reconciled.length === 0 && r.seedRerolled,
    `grace ${r.clean.grace}, probe ${JSON.stringify(r.clean.probe)}, lane `
    + `${JSON.stringify(r.clean.lane)}, traits ${r.clean.traits}, take ${r.clean.take}, `
    + `recall ${JSON.stringify(r.clean.recall)}, overclock ${JSON.stringify(r.clean.overclock)}, `
    + `reconciled ${r.clean.reconciled.length}, a new seed ${r.seedRerolled}`);
  check('...and a saved run comes back with every one of them',
    same(r.before, r.after),
    `saved ${JSON.stringify(r.before)}\n         got   ${JSON.stringify(r.after)}`);
  check('a spent charge stays spent: the ledger replay does not refill it',
    r.after.recall.max === 1 && r.after.recall.held === 0 && r.after.recall.cd === 41
    && r.after.overclock.max === 1 && r.after.overclock.held === 0,
    `recall ${JSON.stringify(r.after.recall)}, overclock ${JSON.stringify(r.after.overclock)}`);
  check('a save written before any of this restores to defaults, not to junk',
    r.legacy.runSeed === 0 && r.legacy.lane === null && r.legacy.probe === null
    && r.legacy.grace === 0 && r.legacy.recallHeld === 0 && r.legacy.recallMax === 0
    && r.legacy.overArmed === false
    // 22, not 19: the file says the run is standing on 22 and carries no
    // probe, and standing on a rung is all a save without trials could mean.
    // A pre-205 file cannot have tier above peak, so nothing needs repairing.
    && r.legacy.tier === 22,
    `seed ${r.legacy.runSeed}, lane ${JSON.stringify(r.legacy.lane)}, probe `
    + `${JSON.stringify(r.legacy.probe)}, grace ${r.legacy.grace}, `
    + `recall ${r.legacy.recallHeld} in hand of ${r.legacy.recallMax}, overclock armed `
    + `${r.legacy.overArmed}; and the rung it was on survived: ${r.legacy.tier}`);
}

// --- the crosshair is not under the thumb -----------------------------------
/*
 * A thumb covers roughly a 44px disc, which at `zoom` is about 71 world units
 * across -- so aiming at the point you touch means aiming at the one part of
 * the field you cannot see. drawTouchAid already drew a ring wide enough to
 * peek out from behind the finger, which says WHERE you are aiming and still
 * not WHAT you are aiming at.
 *
 * The aim point itself is lifted now, so the crosshair marks the real aim
 * rather than being a decoration offset from it. Asserted through the actual
 * pointer handler on the canvas, not by calling aimAt: what is being tested is
 * the wiring between a thumb and a barrel, and a case that calls the method the
 * handler calls tests neither.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG } = await import('../src/config.js');
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    w.autoAim = false;
    const c = g.canvas;
    const box = c.getBoundingClientRect();
    const z = w.scale;
    // A touch well above the turret, so it is an aim and not a grab at the lever.
    const wx = w.width / 2 + 40;
    const wy = w.shooter.y - 300;
    const ev = (type, id) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, bubbles: true, cancelable: true,
      clientX: box.left + wx * z, clientY: box.top + wy * z,
    }));
    ev('pointerdown', 71);
    const pt = [...g.pointers.values()][0] || null;
    const aimed = w.shooter.targetAim;
    ev('pointerup', 71);

    // ...and the lever is still grabbed where the hand actually is.
    const gy = w.shooter.y + 8;
    const ev2 = (type, id) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, bubbles: true, cancelable: true,
      clientX: box.left + (w.width / 2) * z, clientY: box.top + gy * z,
    }));
    ev2('pointerdown', 72);
    const grabbed = g.gripPointer === 72;
    ev2('pointerup', 72);

    // The angle the turret would have taken aiming AT the finger, for contrast.
    const at = Math.atan2(wy - w.shooter.y, wx - w.shooter.x);
    const atAim = Math.atan2(wy - CFG.touchLift - w.shooter.y, wx - w.shooter.x);
    g.restart();
    return {
      rest: -Math.PI / 2, atAim,
      lift: CFG.touchLift, touchedAt: wy,
      aimPoint: pt ? { x: pt.x, y: pt.y, tx: pt.tx, ty: pt.ty } : null,
      aimed, atFinger: at, grabbed,
      thumbWorld: 44 / CFG.zoom,
    };
  });

  check('the aim point sits above the finger, by more than a thumb’s radius',
    r.aimPoint && Math.abs(r.aimPoint.ty - r.touchedAt) < 0.01
    && Math.abs((r.aimPoint.ty - r.aimPoint.y) - r.lift) < 0.01
    && r.lift > r.thumbWorld / 2,
    `touched at y ${r.touchedAt.toFixed(0)}, aiming at y ${r.aimPoint && r.aimPoint.y.toFixed(0)} `
    + `— lifted ${r.lift} world units against a thumb radius of `
    + `${(r.thumbWorld / 2).toFixed(0)}`);
  /*
   * Against BOTH the finger and the barrel's rest position. The first version
   * compared only against the finger and passed while the press was being lost
   * entirely to a setPointerCapture throw -- the barrel had never moved from
   * -PI/2, which is also not the angle to the finger. A case that passes when
   * nothing happened is not a case.
   */
  check('...and the barrel really points there, not at the finger',
    Math.abs(r.aimed - r.atFinger) > 0.02 && Math.abs(r.aimed - r.rest) > 0.02
    && Math.abs(r.aimed - r.atAim) < 0.02,
    `barrel at ${r.aimed.toFixed(3)} rad; the finger is at ${r.atFinger.toFixed(3)}, `
    + `the lifted point at ${r.atAim.toFixed(3)}, and rest is ${r.rest.toFixed(3)}`);
  check('...while the lever is still taken hold of where the hand is',
    r.grabbed, `a press below the turret grabbed the lever: ${r.grabbed}`);
}

// --- the gun is silent through an arrival and an outro ----------------------
/*
 * An arrival is the one thing in this game that is purely watched, and an outro
 * is the frame coming apart a piece at a time. Half of this was already true
 * and invisible: an arrival pins the boss's health every frame, and an outro
 * marks every boss body `spent`, which autoTarget and the collision pass both
 * honour -- so rounds already did nothing. What was left was the noise, and a
 * turret firing into a set piece for the 28-41 seconds those two take.
 *
 * Walked through all seven, because "and any boss added later" is the whole
 * point: the seal is `Boss.sequencing()` on the base class, so a boss inherits
 * it by existing rather than by its author remembering a mark. Counted at
 * `projectiles.push`, which is where a round becomes real -- a body 30 units
 * off the muzzle can be born and die inside one frame, and state watched
 * BETWEEN frames sees neither.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { ANOMALIES } = await import('../src/anomaly.js');
    const { CFG } = await import('../src/config.js');
    const out = { bosses: [] };

    for (const a of ANOMALIES) {
      g.restart();
      w.phase = 'staging';
      w.apertures[a.n] = 1;
      g.openBoss(a.n);
      if (!w.boss) { out.bosses.push({ name: a.name, missing: true }); continue; }
      w.autoAim = true;
      w.autoFire = true;
      const push = w.projectiles.push.bind(w.projectiles);
      let firedArriving = 0;
      let firedDying = 0;
      let firedFighting = 0;
      w.projectiles.push = (...ps) => {
        const b = w.boss;
        if (b && b.arriving > 0) firedArriving += ps.length;
        else if (b && b.dying > 0) firedDying += ps.length;
        else firedFighting += ps.length;
        return push(...ps);
      };
      // Through the whole arrival.
      let f = 0;
      while (w.boss && w.boss.arriving > 0 && f < 60 * 40) { g.update(1 / 60); f++; }
      const arrivalSecs = +(f / 60).toFixed(1);
      // ...a beat of actual fight, so the counter is shown to read a one...
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      // ...then the death, all the way to the end of it.
      /*
       * `Boss.die(world, C)` wants the boss's own config block; only ORDINAL's
       * override takes one argument. The anomaly's `cfg` key is what every
       * subclass passes itself, so the same call works for all seven.
       */
      if (w.boss) w.boss.die(w, CFG[a.cfg]);
      let d = 0;
      while (w.boss && !w.boss.done && d < 60 * 60) { g.update(1 / 60); d++; }
      const outroSecs = +(d / 60).toFixed(1);
      w.projectiles.push = push;
      out.bosses.push({
        name: a.name, arrivalSecs, outroSecs,
        firedArriving, firedDying, firedFighting,
      });
      if (w.boss) { w.boss.clear(w); w.boss = null; w.bossN = 0; w.bossStage = 0; }
    }

    // ...and with no boss at all the gun is unaffected.
    g.restart();
    w.phase = 'staging';
    out.freeToFire = w.shooter.shoot(w) !== false;
    g.restart();
    return out;
  });

  const seen = r.bosses.filter((b) => !b.missing);
  const silentIn = seen.filter((b) => b.firedArriving === 0);
  const silentOut = seen.filter((b) => b.firedDying === 0);
  const armed = seen.filter((b) => b.firedFighting > 0);
  check('not a round leaves the barrel during any of the seven arrivals',
    seen.length === 7 && silentIn.length === 7,
    seen.map((b) => `${b.name} ${b.firedArriving} in ${b.arrivalSecs}s`).join(' · '));
  check('...nor during any of the seven outros',
    silentOut.length === 7,
    seen.map((b) => `${b.name} ${b.firedDying} in ${b.outroSecs}s`).join(' · '));
  /*
   * A zero means nothing until the instrument has been shown to read a one --
   * so the same counter, on the same run, watches the fight in between.
   */
  check('...and the same counter sees the gun firing in between, so the zeros mean something',
    armed.length === 7 && r.freeToFire,
    seen.map((b) => `${b.name} ${b.firedFighting}`).join(' · ')
    + `; with no boss at all the gun fires: ${r.freeToFire}`);
}

// --- every overlay can be swiped away ---------------------------------------
/*
 * Bound through one helper (src/swipe.js) so the awkward parts live in one
 * place, and the awkward parts are the whole of it.
 *
 * A LEAKED INLINE TRANSFORM IS THE FAILURE THAT MATTERS. Inline style beats
 * `#menu.open { transform: none }`, so a drag that ends without cleaning up
 * leaves a panel that is open, holds Game.paused, takes input, and cannot be
 * seen -- the same family as the `[hidden]` trap this repo already records,
 * and worse, because there is no way back to it. Asserted on the RENDERED box
 * and on the inline style, never on the class.
 *
 * THE PANELS SCROLL, and the browser pans them with the same gesture, so a
 * drag the content still wants must not be claimed.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    w.phase = 'staging';
    const out = {};
    const drag = (el, from, to, target) => {
      const t = target || el;
      const mk = (type, x, y) => new PointerEvent(type, {
        pointerId: 9, bubbles: true, cancelable: true, clientX: x, clientY: y,
      });
      t.dispatchEvent(mk('pointerdown', from.x, from.y));
      // Several moves, because the helper needs to pass its slop before it
      // claims anything -- a single jump to the end is not a drag.
      for (let i = 1; i <= 6; i++) {
        t.dispatchEvent(mk('pointermove',
          from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6));
      }
      t.dispatchEvent(mk('pointerup', to.x, to.y));
    };
    const shown = (id) => document.getElementById(id).getBoundingClientRect().height > 0;
    const inline = (id) => document.getElementById(id).style.transform;

    // ---- the menu: swipe down ----
    g.hud.menu.setOpen(true);
    out.menuOpenBefore = g.hud.menu.open && g.paused;
    drag(document.getElementById('menu'), { x: 200, y: 300 }, { x: 200, y: 520 });
    out.menuClosed = !g.hud.menu.open;
    out.menuUnpaused = !g.paused;
    out.menuTransform = inline('menu');

    // ---- the wave sheet: swipe up, and its centring transform survives ----
    w.director.setTier(12); w.director.peak = 12;
    g.openSheet(true);
    out.sheetOpenBefore = g.sheetOpen;
    drag(document.getElementById('waveSheet'), { x: 200, y: 220 }, { x: 200, y: 60 });
    out.sheetClosed = !g.sheetOpen;
    out.sheetTransform = inline('waveSheet');
    out.sheetHidden = !shown('waveSheet');

    // ---- a swipe the wrong way must not close anything ----
    g.hud.menu.setOpen(true);
    drag(document.getElementById('menu'), { x: 200, y: 300 }, { x: 200, y: 180 });
    out.wrongWayKeptOpen = g.hud.menu.open;
    // ...and neither must a short one.
    drag(document.getElementById('menu'), { x: 200, y: 300 }, { x: 200, y: 330 });
    out.shortKeptOpen = g.hud.menu.open;
    out.afterRefusals = inline('menu');

    // ---- a drag that the content wants to scroll is not claimed ----
    // Reopened first: the short-swipe check above ran on a menu the wrong-way
    // check had left open, and the state cascades. Reading `menu.open` here
    // without reopening measured the previous step, not this one.
    g.hud.menu.setOpen(true);
    const panels = document.getElementById('menuPanels');
    panels.scrollTop = 40;
    const scrollable = panels.scrollHeight - panels.clientHeight > 1;
    out.scrollTop = panels.scrollTop;
    out.over = panels.scrollHeight - panels.clientHeight;
    drag(document.getElementById('menu'), { x: 200, y: 300 }, { x: 200, y: 520 }, panels);
    out.scrollable = scrollable;
    out.scrollKeptOpen = g.hud.menu.open;
    g.hud.menu.setOpen(false);

    // ---- the loadout and the debug panel are bound too ----
    out.bound = ['menu', 'waveSheet', 'aimModes', 'debugPanel']
      .filter((id) => !!document.getElementById(id));
    g.restart();
    return out;
  });

  check('the menu goes away when it is pushed down, and lets the world go with it',
    r.menuOpenBefore && r.menuClosed && r.menuUnpaused && r.menuTransform === '',
    `open and holding the world ${r.menuOpenBefore} -> closed ${r.menuClosed}, `
    + `world running ${r.menuUnpaused}, inline transform left behind `
    + `"${r.menuTransform}"`);
  check('the wave sheet goes up, and keeps the transform that centres it',
    r.sheetOpenBefore && r.sheetClosed && r.sheetHidden && r.sheetTransform === '',
    `closed ${r.sheetClosed}, off screen ${r.sheetHidden}, inline transform `
    + `"${r.sheetTransform}"`);
  check('a swipe the wrong way, or too short a one, changes nothing',
    r.wrongWayKeptOpen && r.shortKeptOpen && r.afterRefusals === '',
    `wrong way kept it open ${r.wrongWayKeptOpen}, short one ${r.shortKeptOpen}; `
    + `nothing left on the element: "${r.afterRefusals}"`);
  check('...and a drag the panel still wants to scroll is left to the panel',
    r.scrollable && r.scrollKeptOpen,
    `#menuPanels can scroll ${r.scrollable}; a drag starting inside it kept the `
    + `menu open ${r.scrollKeptOpen} (scrollTop ${r.scrollTop} of ${r.over})`);
  check('all four overlays exist to be bound',
    r.bound.length === 4, `found ${r.bound.join(', ')} (the loadout is a menu tab from 226)`);
}

// --- the glitch timer: the only thing that takes a rung away -----------------
/*
 * Build 210 replaced the wave-end rout with a live clock, and the clock rests
 * on one assumption the old verdict did not: that `world.attackers` means
 * "on the turret NOW". It did not. A body entered the set on contact and left
 * it exactly one way -- by dying -- and `e.attacking` was never written false
 * anywhere outside the constructor, so a LURCHER shoved clear by a PULSE and
 * left alive counted as attached from across the field for the rest of its
 * life. Under a countdown to losing a rung, whose whole answer is shoving the
 * thing off, that is unanswerable. The release is asserted first and on its
 * own, because every case below it is measuring nothing if it is not there.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG, WAVES } = await import('../src/config.js');
    const w = g.world;
    const d = w.director;
    const G = CFG.waves.glitch;
    const out = { cfg: { arm: G.arm, fuse: G.fuse, recover: G.recover, fizzle: G.fizzle } };
    const s = w.shooter;
    const real = WAVES.findIndex((x) => !x.teach && x.of && x.of.length);

    /*
     * The director parked in rest with its clocks out of reach. `burn()` runs
     * ABOVE the resting branch, so the fuse still ticks while nothing else
     * about the wave does -- which is the whole field cleared of everything
     * that could otherwise move the numbers under the measurement.
     */
    const stage = (tier = 9) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.spawnLock = 1e9;
      d.driftTimer = 1e9;
      d.order = [real]; d.at = 0;
      d.resting = true; d.timer = 1e9;
      d.asked = 10; d.contact = 0; d.hitPatience = false; d.take = 0;
      d.setTier(tier); d.hold = false; d.grace = 0; d.probe = null;
      d.held = 0; d.glitch = 0;
      w.time = 1000; d.lastRelease = 1000;
      w.drops.length = 0;
      // The mount, explicitly. `reset()` clears the set but a body destroyed
      // by debugClearField is dead-and-unswept for a frame and the set still
      // holds it, so a stage() that only restarts can begin with a full mount.
      for (const a of [...w.attackers]) { a.dead = true; a.attacking = false; }
      w.attackers.clear();
    };
    /*
     * ONE body, held in place rather than re-seated.
     *
     * The first version of this spawned a fresh LURCHER whenever the mount
     * went empty, which piled bodies up at the same point: they shoved each
     * other off, `held` -- which is UNBROKEN contact by design -- reset every
     * time one was released, and the fuse cost itself a 1.5s re-arm on each.
     * It reported the timer firing 1.6s late and the mount refusing to clear,
     * both of which were the instrument. Pinned position and full health each
     * frame is what makes "fourteen unbroken seconds" actually unbroken.
     */
    const seat = () => {
      const e = g.debugSpawn('lurcher', s.x + 4, s.y - 6);
      e.spawnIn = 0;
      return e;
    };
    const hold = (e, secs, at = null) => {
      for (let i = 0; i < Math.round(secs * 60); i++) {
        if (e && !e.dead) {
          e.x = at ? at.x : s.x + 4;
          e.y = at ? at.y : s.y - 6;
          e.vx = 0; e.vy = 0;
          e.hp = e.maxHp;
        }
        g.update(1 / 60);
      }
    };

    // ---- the set means "now" ----
    stage();
    const body = seat();
    g.update(1 / 60);
    out.onMount = w.attackers.size;
    // Shoved clear and left alive -- the case the old set could not see.
    body.x = s.x + 420; body.y = s.y - 380; body.vx = 0; body.vy = 0;
    g.update(1 / 60);
    out.offMount = w.attackers.size;
    out.offFlag = body.attacking;
    // ...and it may come back.
    body.x = s.x + 4; body.y = s.y - 6;
    g.update(1 / 60);
    out.backOn = w.attackers.size;

    // ---- the fuse lights late, and only late ----
    stage();
    const armer = seat();
    hold(armer, G.arm - 0.5);
    out.beforeArm = d.glitch;
    hold(armer, 1);
    out.afterArm = d.glitch;

    // ---- ...and a clear turret winds it back out ----
    stage();
    const goer = seat();
    hold(goer, G.arm + 4);
    out.lit = d.glitch;
    // Held OFF the mount rather than killed, so this measures the release and
    // the recovery together -- a body destroyed would have left the set by the
    // one route it always had.
    // Four seconds of burn come back at 0.6x, so it owes six and two thirds.
    // Read at half that and again past all of it: the first says it is coming
    // back at the rate config names, the second that it actually goes out.
    hold(goer, 3.33, { x: s.x + 420, y: s.y - 380 });
    out.halfBack = d.glitch;
    hold(goer, 4.5, { x: s.x + 420, y: s.y - 380 });
    out.recovered = d.glitch;
    out.recoveredClear = w.attackers.size;

    // ---- and left alone it runs out ----
    stage();
    const burner = seat();
    let firedAt = null;
    for (let i = 0; i < 60 * 30 && firedAt === null; i++) {
      hold(burner, 1 / 60);
      if (d.lastVerdict === 'glitch') firedAt = +((i + 1) / 60).toFixed(1);
    }
    out.firedAt = firedAt;
    out.expectAt = G.arm + G.fuse;

    // ---- what firing does to the field ----
    stage();
    g.debugSpawn('mote', s.x - 90, 260).spawnIn = 0;
    g.debugSpawn('mote', s.x + 90, 260).spawnIn = 0;
    // A SEED: harmless, and absolutely part of the wave. The first version of
    // glitchOut skipped every `harmless` body, which spared a SCION's live
    // seeds and handed the replacement wave a set of grafts it never asked for.
    g.debugSpawn('seed', s.x + 40, 240).spawnIn = 0;
    g.debugSpawnDrift();
    // A mote of energy on the floor, made the way the game makes them.
    const payer = g.debugSpawn('mote', s.x, 300);
    payer.spawnIn = 0;
    payer.destroy(w);
    // One frame, so the sweep books that kill BEFORE the counters are read.
    // `destroy()` only marks; `Game.sweep` is what calls registerKill, and
    // taking the snapshot between the two charged this case for a kill it
    // made itself.
    g.update(1 / 60);
    const dropsBefore = w.drops.filter((x) => !x.dead).length;
    const energyBefore = Math.round(w.energy);
    const killsBefore = w.kills;
    // Everything the wave put out -- the grey trickle is DRIFT by name, and it
    // is the only thing on the field that is not the wave's.
    /*
     * ...and the assist is shown to READ A ONE first.
     *
     * `autoTarget` refuses anything past `CFG.shooter.aimRange` (400 on a
     * stock run) and the bodies above sit 742 units out, so it returned null
     * whether or not the fizzle marked anything: a zero the instrument had
     * never been shown to read a one for. One body goes inside the cone and
     * the reach, and the lock is taken before the withdrawal and looked for
     * again after it.
     *
     * Spawned BEFORE the field is counted. Put after, it was fizzled and not
     * counted, and the case reported "4 of 3 marked".
     */
    w.autoAim = true;
    w.aimMode = 'field';
    const near = g.debugSpawn('mote', s.x + 30, s.y - 260);
    near.spawnIn = 0; near.staged = false;
    out.targetsBefore = g.autoTarget() !== null;

    const hostiles = w.enemies.filter((e) => !e.dead && e.type.id !== 'drift').length;
    const greyBefore = w.enemies.filter((e) => !e.dead && e.type.id === 'drift').length;
    const seedsBefore = w.enemies.filter((e) => !e.dead && e.type.id === 'seed').length;
    const move = d.glitchOut(w);
    out.fizzled = move.fizzled;
    out.hostiles = hostiles;
    out.marks = w.enemies.filter((e) => e.fizzle > 0)
      .every((e) => e.spent === true && e.dissolved === true && !e.attacking);
    out.greyKept = w.enemies.filter((e) => !e.dead && e.type.id === 'drift' && !e.fizzle)
      .length === greyBefore;
    out.seeds = seedsBefore;
    out.seedsTaken = w.enemies.filter((e) => e.type.id === 'seed' && e.fizzle > 0).length;
    out.targetsNone = g.autoTarget() === null;
    // A blast landing on one of them during its second must not cash it in.
    const victim = w.enemies.find((e) => e.fizzle > 0);
    if (victim) victim.destroy(w);
    // ...and a second later there is nothing of them left.
    for (let i = 0; i < Math.round((G.fizzle + 0.4) * 60); i++) g.update(1 / 60);
    out.gone = w.enemies.filter((e) => !e.dead && e.type.id !== 'drift').length;
    out.paid = Math.round(w.energy) - energyBefore;
    out.counted = w.kills - killsBefore;
    out.dropsKept = w.drops.filter((x) => !x.dead).length >= dropsBefore;

    // ---- what firing does to the ladder and the wave ----
    stage(9);
    // A wave RUNNING, because an armed OVERCLOCK is only spent by a glitch
    // that interrupts one -- see the pair of charge cases below.
    d.resting = false;
    d.hold = true;
    d.overclock.armed = true;
    d.laneOffer = { id: 'x', until: 99 };
    d.jobs = [{ id: 'mote', n: 1 }];
    d.contact = 7; d.hitPatience = true; d.take = 500;
    const m9 = d.glitchOut(w);
    out.move9 = { moved: m9.moved, tier: m9.tier, from: m9.from,
      verdict: m9.verdict, reason: m9.reason };
    out.after9 = { grace: d.grace, hold: d.hold, resting: d.resting,
      jobs: d.jobs.length, armed: d.overclock.armed, offer: d.laneOffer,
      contact: d.contact, patience: d.hitPatience, take: d.take,
      glitch: d.glitch, held: d.held, timerSane: d.timer > 0 && d.timer < 30 };

    // ---- rung 1: the wave still resets, and nothing claims otherwise ----
    stage(1);
    g.debugSpawn('mote', s.x - 90, 260).spawnIn = 0;
    const m1 = d.glitchOut(w);
    out.move1 = { moved: m1.moved, tier: m1.tier };
    out.reset1 = m1.fizzled > 0 && d.resting === true;

    // ---- a trial that glitches is answered, not charged twice ----
    stage(9);
    d.peak = 9;
    d.trial(12, w);
    const beforeTrial = d.tier;
    const mt = d.glitchOut(w);
    out.trial = { armedAt: beforeTrial, to: mt.tier, moved: mt.moved,
      probe: d.probe, locked: d.probeLock > 0 };

    // ---- it does not run during an anomaly, nor while the game is teaching --
    /*
     * Driven through `g.update`, the real frame, and NOT through
     * `d.update`.
     *
     * The first version of this case called the director directly and passed
     * on a build where the guard was unreachable: `Game.update` is an if/else
     * and the director is the else, so nothing calls `Director.update` at all
     * while an anomaly is up. The fuse froze at whatever it held when the way
     * opened, sat there for the whole fight, and came back still lit over a
     * turret that had been clear for four minutes -- with a green case above
     * it asserting the opposite. A control that refuses is not the same as a
     * rule that holds; press the real path.
     */
    stage();
    d.glitch = 0.5;
    w.apertures[1] = 1;
    g.openBoss(1);
    out.bossUp = !!w.boss;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    out.underBoss = d.glitch;
    // ...and it is still out when the anomaly is gone, rather than resuming
    // from where it froze.
    g.withdrawBoss();
    for (let i = 0; i < 10; i++) g.update(1 / 60);
    out.afterBoss = d.glitch;

    stage();
    d.glitch = 0.5;
    d.order = [0]; d.at = 0; // wave 0 is a teach wave
    d.update(w, 1 / 60);
    out.underTeach = d.glitch;

    // ---- it says so, on the canvas, without spending a story beat ----
    stage(9);
    g.hud.say(null);
    w.bossLine = null;
    w.narrator.clear();
    const storyBefore = w.narrator.index;
    w.onTier(d.glitchOut(w));
    out.said = w.narrator.active ? w.narrator.text : '';
    out.storySpent = w.narrator.index - storyBefore;
    out.alert = [...document.querySelectorAll('#alerts .alert')]
      .map((el) => el.textContent).join(' | ');

    // ---- the review's own findings, each with a case of its own -----------
    /*
     * The fade RENDERS. `drawGlow` used to assign globalAlpha and reset it to
     * 1, throwing away the alpha the fizzle had set one line earlier -- so
     * every body dissolved at full opacity and only the scale moved. Measured
     * on an offscreen canvas, not the live one, at a scale this case picks.
     */
    stage();
    const fader = g.debugSpawn('mote', 300, 300);
    fader.spawnIn = 0; fader.staged = false; fader.flash = 0;
    const alphaAt = (fz) => {
      fader.fizzle = fz;
      const c = document.createElement('canvas');
      c.width = 200; c.height = 200;
      const cx = c.getContext('2d', { willReadFrequently: true });
      /*
       * An OPAQUE ground first.
       *
       * `getImageData` hands back unpremultiplied RGBA, so a white pixel drawn
       * at alpha 0.16 onto a transparent canvas reads back as (255,255,255)
       * with a = 41: the colour channels do not move at all and only the alpha
       * does. The first version of this read the colour channels and reported
       * 210 -> 210 across most of a dissolve that was working. Composited over
       * black, the colour channels are the fade.
       */
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, 200, 200);
      cx.setTransform(2, 0, 0, 2, 100 - fader.x * 2, 100 - fader.y * 2);
      fader.draw(cx, w);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      const px = cx.getImageData(0, 0, 200, 200).data;
      let lit = 0;
      let peak = 0;
      let ink = 0;
      for (let i = 0; i < px.length; i += 4) {
        const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (v > 8) lit++;
        ink += v;
        peak = Math.max(peak, v);
      }
      return { lit, peak: Math.round(peak), ink: Math.round(ink / 1000) };
    };
    out.fadeFull = alphaAt(G.fizzle);
    out.fadeHalf = alphaAt(G.fizzle * 0.4);
    out.fadeEnd = alphaAt(G.fizzle * 0.05);
    fader.fizzle = 0;
    fader.dead = true;

    // A dissolving body drives at nothing.
    stage();
    const drifter = g.debugSpawn('lurcher', s.x + 200, s.y - 500);
    drifter.spawnIn = 0; drifter.staged = false; drifter.vx = 0; drifter.vy = 0;
    d.glitchOut(w);
    const d0 = Math.hypot(drifter.x - s.x, drifter.y - s.y);
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    out.drove = +(d0 - Math.hypot(drifter.x - s.x, drifter.y - s.y)).toFixed(2);
    out.droveSpeed = +Math.hypot(drifter.vx, drifter.vy).toFixed(2);

    // An OVERCLOCK armed for a wave that never ran is not spent.
    stage(9);
    d.resting = true;
    d.overclock.armed = true;
    d.glitchOut(w);
    out.armedKeptAtRest = d.overclock.armed;
    stage(9);
    d.resting = false;
    d.overclock.armed = true;
    d.glitchOut(w);
    out.armedSpentInWave = d.overclock.armed;

    // A body cleared out of the set by a boss can be taken back by the turret.
    stage();
    const grabbed = g.debugSpawn('lurcher', s.x + 4, s.y - 6);
    grabbed.spawnIn = 0;
    g.update(1 / 60);
    out.grabbedOn = w.attackers.has(grabbed);
    for (const e of w.attackers) e.attacking = false;
    w.attackers.clear();                 // what a boss's hush() does
    grabbed.x = s.x + 4; grabbed.y = s.y - 6; grabbed.vx = 0; grabbed.vy = 0;
    g.update(1 / 60);
    out.grabbedBack = w.attackers.has(grabbed);

    // ---- and it is drawn, as a ring that closes with a number in it --------
    /*
     * On a recording stand-in rather than off the live canvas. The ring is one
     * world unit of stroke over a floor band that is not black, and the perf
     * governor has had the backing store down to 273x591 by the time the suite
     * gets here -- a colour test on that is a test of how slow the cases above
     * it ran. What is being asserted is that the thing draws the fuse, so the
     * calls are what to read.
     */
    const rec = () => {
      const calls = [];
      const noop = () => {};
      const ctx = new Proxy({ calls }, {
        get(t, k) {
          if (k === 'calls') return calls;
          return (...a) => {
            calls.push({ k, a });
            // Faithful enough to be measured through: the readout measures its
            // own label to size the plate behind it, and a stand-in that hands
            // back a function for `measureText` makes the code under test throw
            // rather than run. Six units a character is close enough for a
            // monospace face at the sizes this draws at.
            if (k === 'measureText') return { width: String(a[0]).length * 6 };
            return noop();
          };
        },
        set(t, k, v) { calls.push({ k, a: [v], set: true }); return true; },
      });
      return ctx;
    };
    /*
     * The ARGUMENTS, not just the call names.
     *
     * The first version counted arcs and matched the digits against a regexp,
     * and would have passed a ring that never closed and a clock that counted
     * UP -- both drawn with two arcs and a plausible-looking number. It reads
     * the arc's sweep and the label at four points on the fuse now, and asserts
     * both are monotonic in the right direction.
     */
    const sample = (at) => {
      d.glitch = at;
      const c = rec();
      g.drawGlitch(c);
      const arcs = c.calls.filter((x) => x.k === 'arc');
      const text = c.calls.find((x) => x.k === 'fillText');
      return {
        calls: c.calls.length,
        arcs: arcs.length,
        // The track is the full circle; the fuse is the one that grows.
        sweep: arcs.length > 1 ? +Math.abs(arcs[1].a[4] - arcs[1].a[3]).toFixed(4) : null,
        track: arcs.length ? +Math.abs(arcs[0].a[4] - arcs[0].a[3]).toFixed(4) : null,
        label: text ? String(text.a[0]) : '',
      };
    };
    stage();
    out.drawCold = sample(0).calls;
    out.draw = [0.25, 0.5, 0.75, 1 - 1.4 / G.fuse].map(sample);
    out.tau = Math.PI * 2;

    g.debugClearField();
    w.spawnLock = 0;
    g.restart();
    return out;
  });

  check('the turret lets go of what is no longer on it',
    r.onMount === 1 && r.offMount === 0 && r.offFlag === false && r.backOn === 1,
    `on the mount ${r.onMount}, shoved clear and still alive ${r.offMount} `
    + `(attacking ${r.offFlag}), walked back on ${r.backOn}`);

  check('the fuse lights only after a body has held on for a moment',
    r.beforeArm === 0 && r.afterArm > 0,
    `${r.cfg.arm - 0.5}s of contact -> ${r.beforeArm}, ${r.cfg.arm + 0.5}s -> `
    + `${r.afterArm.toFixed(3)}`);

  check('...and clearing the turret winds it back out, at the rate config names',
    r.lit > 0.2 && r.recovered === 0 && r.recoveredClear === 0
    && Math.abs(r.halfBack - r.lit / 2) < 0.03,
    `lit to ${r.lit.toFixed(3)} over ${r.cfg.arm + 4}s; held clear, half the `
    + `time back -> ${r.halfBack.toFixed(3)} (half of lit is `
    + `${(r.lit / 2).toFixed(3)}), all of it -> ${r.recovered.toFixed(3)} `
    + `(mount ${r.recoveredClear})`);

  check('...and left alone it runs out, on the clock config says',
    r.firedAt !== null && Math.abs(r.firedAt - r.expectAt) < 1.2,
    `fired at ${r.firedAt}s, expected ${r.expectAt}s (arm ${r.cfg.arm} + fuse ${r.cfg.fuse})`);

  /*
   * The field is WITHDRAWN, not killed. `destroy()` is what banks a body's
   * energy, sheds its debris and counts it, and none of that is owed for a
   * wave being taken back -- so the marks have to hold against everything
   * that could still reach one during the second it takes to dissolve. The
   * blast in the middle of this case is that: `spent` keeps rounds and the
   * assist off them, but blasts, mines, patches and every ability test `dead`
   * alone, which is why the guard is inside `destroy()`.
   */
  check('the field fizzles out, pays nothing, and counts for nothing',
    r.fizzled === r.hostiles && r.hostiles > 0 && r.marks && r.targetsNone
    && r.gone === 0 && r.paid === 0 && r.counted === 0
    && r.dropsKept && r.greyKept && r.seeds > 0 && r.seedsTaken === r.seeds
    && r.targetsBefore,
    `${r.fizzled} of ${r.hostiles} marked (flags ok ${r.marks}, assist had a lock `
    + `${r.targetsBefore} and now sees none ${r.targetsNone}); `
    + `${r.seedsTaken}/${r.seeds} SEEDs taken; after `
    + `${r.cfg.fizzle}s ${r.gone} left, paid ${r.paid}, counted ${r.counted}, `
    + `energy on the floor kept ${r.dropsKept}, grey kept ${r.greyKept}`);

  /*
   * Everything score() owes the next wave, paid by hand -- because this path
   * deliberately does not go through score(). `overclock.armed` and
   * `laneOffer` are cleared THERE and nowhere else, so a wave reset that skips
   * it carries a spent OVERCLOCK charge and a lapsed lane offer into the wave
   * after. And `grace` has no other writer at all: without the line that arms
   * it here it becomes a flag that can never be non-zero, with four readers
   * that can never take their other branch.
   */
  check('a glitch abandons the wave rather than scoring it',
    r.after9.jobs === 0 && r.after9.resting === true && r.after9.timerSane
    && r.after9.armed === false && r.after9.offer === null
    && r.after9.contact === 0 && r.after9.patience === false && r.after9.take === 0
    && r.after9.glitch === 0 && r.after9.held === 0,
    `jobs ${r.after9.jobs}, resting ${r.after9.resting}, overclock still armed `
    + `${r.after9.armed}, lane offer ${JSON.stringify(r.after9.offer)}, `
    + `contact ${r.after9.contact}, take ${r.after9.take}`);

  check('...and steps the ladder back one rung, arms grace, and un-pins HOLD',
    r.move9.moved === -1 && r.move9.tier === r.move9.from - 1
    && r.move9.verdict === 'glitch' && r.after9.grace === 1 && r.after9.hold === false,
    `${r.move9.from} -> ${r.move9.tier} (${r.move9.verdict}, "${r.move9.reason}"), `
    + `grace ${r.after9.grace}, hold ${r.after9.hold}`);

  check('...and on the bottom rung it resets the wave without claiming a step back',
    r.move1.moved === 0 && r.move1.tier === 1 && r.reset1,
    `at tier 1: moved ${r.move1.moved}, field withdrawn and wave rested ${r.reset1}`);

  /*
   * A trial is a question the player asked, so it is answered rather than
   * charged for twice: the fall back to the rung it was armed from IS the step
   * back. Without this the run drops to the trial's floor and then a further
   * rung below it, for one wave.
   */
  check('a trial that glitches is answered, not charged twice',
    r.trial.to === 9 && r.trial.probe === null && r.trial.locked
    && r.trial.moved === 9 - r.trial.armedAt,
    `armed at ${r.trial.armedAt}, landed on ${r.trial.to} (moved ${r.trial.moved}), `
    + `probe ${JSON.stringify(r.trial.probe)}, locked out ${r.trial.locked}`);

  /*
   * Both guards are whole-method returns that PUT THE FUSE OUT rather than
   * step over it. A fuse frozen behind a boss guard comes back nine tenths
   * closed over a turret that has been clear for four minutes.
   */
  check('nothing burns during an anomaly, and nothing burns while the game is teaching',
    r.bossUp && r.underBoss === 0 && r.afterBoss === 0 && r.underTeach === 0,
    `anomaly on the field ${r.bossUp}; half a fuse through half a second of it `
    + `-> ${r.underBoss}, and after it withdrew -> ${r.afterBoss}; `
    + `on a teach wave -> ${r.underTeach}`);

  /*
   * `show()` writes text and nothing else; `advance()` moves `index`, which is
   * saved to disk as `story`. A line that spent one of the ten numbered beats
   * would cost the player a beat they can never get back, every time the fuse
   * blew.
   */
  check('it says so on the canvas, without spending a story beat',
    /stepped back/i.test(r.said) && /weren/i.test(r.said) && r.storySpent === 0
    && /STEPPED BACK/.test(r.alert),
    `narrator: "${r.said}" (story beats spent ${r.storySpent}); alert: "${r.alert}"`);

  /*
   * Three findings from the review of this build, each with the case that
   * would have caught it.
   *
   * THE FADE never rendered: `drawGlow` assigned `globalAlpha` and reset it to
   * 1, throwing away the alpha the fizzle set one line earlier, so every body
   * dissolved at full opacity with only the scale moving. Read off an
   * offscreen canvas at a scale this case picks, never the live one -- the
   * governor has had that down to 273x591 by the time the suite reaches here.
   *
   * A DISSOLVING BODY STEERS: `Enemy.update` refuses a fizzling body but
   * steering is driven from `physicsStep`, not from update, so a fizzled
   * LURCHER went on driving at the turret through its own dissolve.
   *
   * AN OVERCLOCK armed for a wave that then never ran was being spent by the
   * glitch, because `score()` clears it and this path copied that without
   * asking whether a wave had actually started.
   */
  check('a dissolving body fades out, drives at nothing, and takes no charge with it',
    r.fadeFull.ink > r.fadeHalf.ink && r.fadeHalf.ink > r.fadeEnd.ink
    && r.fadeEnd.ink < r.fadeFull.ink * 0.35
    && r.fadeFull.lit > 0 && r.drove <= 1 && r.droveSpeed <= 1
    && r.armedKeptAtRest === true && r.armedSpentInWave === false,
    `ink over black ${r.fadeFull.ink} -> ${r.fadeHalf.ink} -> ${r.fadeEnd.ink} `
    + `across the dissolve (peaks ${r.fadeFull.peak}/${r.fadeHalf.peak}/`
    + `${r.fadeEnd.peak}); closed ${r.drove} units at ${r.droveSpeed} u/s while `
    + `dissolving; OVERCLOCK kept when it fired between waves ${r.armedKeptAtRest}, `
    + `spent when a wave was running ${r.armedSpentInWave}`);

  /*
   * A set cleared without clearing the flag locks a live body out for good:
   * the grab loop skips anything already `attacking`, and `hush()` and
   * `open()` both empty the set mid-fight with bodies still on the mount.
   * Measured before the fix, over one ORDINAL fight: 472 frames where the set
   * and what was actually touching the turret disagreed.
   */
  check('a body cleared off the mount by an anomaly can be taken back afterwards',
    r.grabbedOn && r.grabbedBack,
    `grabbed ${r.grabbedOn}, and after the set was emptied under it, re-grabbed `
    + `${r.grabbedBack}`);

  /*
   * Read the arguments, not the call names. A ring that never closes and a
   * clock that counts up both draw two arcs and a plausible number, and the
   * first version of this case passed all four substitute implementations it
   * was later tried against.
   */
  {
    const d4 = r.draw;
    const sweeps = d4.map((x) => x.sweep);
    const secs = d4.map((x) => parseFloat(x.label));
    const closes = sweeps.every((v, i) => v !== null && (i === 0 || v > sweeps[i - 1]));
    const counts = secs.every((v, i) => Number.isFinite(v) && (i === 0 || v < secs[i - 1]));
    // 1e-3, not 1e-9: `sweep` and `track` are both rounded to four places on
    // the way out of the page, so a tolerance tighter than that rounding can
    // never be met and the case failed on a ring that was drawing perfectly.
    const track = d4.every((x) => Math.abs(x.track - r.tau) < 1e-3);
    check('...and it is drawn as a ring that closes, with the seconds counting down',
      r.drawCold === 0 && d4.every((x) => x.arcs === 2) && closes && counts && track
      && Math.abs(sweeps[1] - r.tau * 0.5) < 1e-3
      && /^\d+$/.test(d4[0].label) && /^\d+\.\d$/.test(d4[3].label),
      `out: ${r.drawCold} calls; sweep ${sweeps.map((v) => (v / r.tau).toFixed(2)).join(' -> ')} `
      + `of a full turn (track always ${(d4[0].track / r.tau).toFixed(2)}); `
      + `reading ${d4.map((x) => `"${x.label}"`).join(' -> ')}`);
  }
}

// --- a round lands where it lands ------------------------------------------
/*
 * Build 211 gave the impact a geometry. Three things were wrong before it, and
 * all three came from the same mistake: `resolveSegment` hands `takeHit` the
 * closest point on the round's ONE-FRAME STEP to the body's centre, clamped to
 * the ends of that step, and three separate pieces of code treated that as a
 * point on the surface.
 *
 *   THE SPIN was `spread(push * 0.02)` -- a scatter proportional to the shove
 *   and unrelated to where the round hit, so a rim shot and a centre punch
 *   span the same amount in a random direction.
 *
 *   PRISM's "only a square-on hit lands" divided by the RADIUS instead of by
 *   the offset's own length, which reduces it to how far along its last step
 *   the round happened to stop. The impact parameter did not enter it at all.
 *
 *   THE RICOCHET mirrored about that same vector, which on a square-on shot
 *   lies along the round's own line -- so a bounce sent the round back the way
 *   it came instead of off the surface.
 *
 * The one quantity in the hit point that IS exact is its component ACROSS the
 * travel: the perpendicular distance from the centre to the round's line is
 * the same for every point on that line, so the clamp cannot corrupt it. That
 * is the impact parameter, and everything here is derived from it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { CFG } = await import('../src/config.js');
    const { contactAt } = await import('../src/physics.js');
    const w = g.world;
    const out = {};

    // ---- the geometry, on its own ----
    const body = { x: 0, y: 0, r: 24 };
    // Travelling straight up, so the impact parameter is just the hit point's x.
    const at = (b, hy = 40) => contactAt(body, b, hy, 0, -1);
    out.b = [0, 6, 12, 21.6].map((b) => +at(b).b.toFixed(9));
    /*
     * The property the whole change rests on: the answer does not depend on
     * WHERE ALONG THE RAY the hit point fell. Measured on the live game before
     * this, a bolt fired dead-centre at a BULWARK reported a contact point 48
     * units short of the centre -- three units outside a 45-unit body -- purely
     * because its step ended there.
     */
    out.invariant = [-300, -40, 0, 40, 300]
      .map((hy) => +at(9, hy).b.toFixed(9))
      .every((v, i, a2) => v === a2[0]);
    out.incidence = [0, 6, 12, 21.6, 24].map((b) => +at(b).incidence.toFixed(3));
    // |b| routinely exceeds r, because the hit test is against e.r + p.r.
    // An unclamped sqrt(r^2 - b^2) is NaN, and a NaN velocity is a body lost
    // for the rest of the run rather than an error anybody sees.
    out.past = at(40);
    out.finite = [40, -40, 1e6].every((b) => {
      const c = at(b);
      return Number.isFinite(c.nx) && Number.isFinite(c.ny)
        && Number.isFinite(c.incidence) && Number.isFinite(c.x);
    });
    out.unit = [0, 6, 21.6, 40, -30].map((b) => +Math.hypot(at(b).nx, at(b).ny).toFixed(6));

    // ---- what a hit does to a body ----
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; w.director.resting = true; }
    const pin = () => {
      const e = g.debugSpawn('lurcher', 300, 300);
      e.spawnIn = 0; e.staged = false;
      e.vx = 0; e.vy = 0; e.av = 0; e.kicked = 0; e.hp = e.maxHp * 40; e.maxHp = e.hp;
      return e;
    };
    /*
     * Same body, same impulse, hit in different places -- and the DIRECTION is
     * what is read, not just that two of them differ.
     *
     * Canvas y runs down, so `ctx.rotate(+a)` is clockwise on screen and a
     * positive `av` reads as clockwise. Each row below states the answer
     * somebody watching would give, and the case asserts that answer.
     *
     * The first version of this checked only that the two rims came out with
     * opposite signs, which is true of the correct model and of the inverted
     * one alike -- and build 211 shipped inverted underneath it. Every body on
     * the field turned the wrong way with the case green. A test that pins a
     * symmetry and not a direction is a test that cannot see a sign.
     */
    const shove = (dir, off) => {
      const e = pin();
      // Put the hit point a long way back down the incoming line, which is
      // where the projectile sweep actually reports them from.
      e.takeHit(w, 1, e.x + off[0] - dir[0] * 200, e.y + off[1] - dir[1] * 200,
        dir[0], dir[1], 400);
      const got = { v: +Math.hypot(e.vx, e.vy).toFixed(4), av: +e.av.toFixed(4) };
      e.dead = true;
      return got;
    };
    out.centre = shove([0, -1], [0, 0]);
    out.rim = shove([0, -1], [20, 0]);
    out.rimOther = shove([0, -1], [-20, 0]);
    // Six arrangements of travel and offset, each with the turn a person
    // watching the screen would name. All six were inverted on build 211.
    out.turns = [
      ['up/left', [0, -1], [-14, 0], 'cw'],
      ['up/right', [0, -1], [14, 0], 'acw'],
      ['down/left', [0, 1], [-14, 0], 'acw'],
      ['down/right', [0, 1], [14, 0], 'cw'],
      ['right/above', [1, 0], [0, -14], 'cw'],
      ['right/below', [1, 0], [0, 14], 'acw'],
    ].map(([name, dir, off, want]) => {
      const av = shove(dir, off).av;
      return { name, want, got: av > 0 ? 'cw' : (av < 0 ? 'acw' : 'none'), av };
    });

    // ...and the cap, which did not exist before: the honest rim value on a
    // light body is nearly nineteen revolutions a second.
    const seed = g.debugSpawn('seed', 300, 300);
    seed.spawnIn = 0; seed.staged = false; seed.hp = 1e6; seed.maxHp = 1e6;
    for (let i = 0; i < 6; i++) seed.takeHit(w, 0, seed.x + seed.r * 0.95, seed.y + 200, 0, -1, 400);
    const { integrate } = await import('../src/physics.js');
    integrate(seed, 1 / 60);
    out.spinCap = +Math.abs(seed.av).toFixed(3);
    out.cap = CFG.physics.maxSpin;
    seed.dead = true;

    // ---- PRISM: only a square-on hit lands, and it is not a lottery ----
    const prism = () => {
      const e = g.debugSpawn('prism', 300, 300);
      e.spawnIn = 0; e.staged = false; e.vx = 0; e.vy = 0;
      e.hp = 1e6; e.maxHp = 1e6;
      return e;
    };
    const shoot = (b, hy) => {
      const e = prism();
      const res = e.takeHit(w, 1, e.x + b, e.y + hy, 0, -1, 0);
      e.dead = true;
      return res;
    };
    out.reflect = CFG.enemyTypes ? null : null;
    // Five sub-frame phases at each offset. Before the fix the phase decided
    // the outcome and the offset did not; now it is the other way round.
    const phases = [-300, -80, -20, 20, 200];
    out.square = phases.map((hy) => shoot(0, hy));
    out.grazing = phases.map((hy) => shoot(19, hy));
    out.squareAllHit = out.square.every((x) => x === 'hit');
    out.grazeAllReflect = out.grazing.every((x) => x === 'reflect');

    g.debugClearField();
    g.restart();
    return out;
  });

  check('the impact parameter is exact, and does not depend on where the step ended',
    r.b.join(',') === '0,6,12,21.6' && r.invariant,
    `hit points at x = 0/6/12/21.6 read b = ${r.b.join(', ')}; the same offset `
    + `sampled at five points along the ray agrees with itself: ${r.invariant}`);

  check('...and a graze past the radius stays finite rather than going NaN',
    r.finite && r.past.incidence === 0 && Math.abs(r.past.b) === 24
    && r.unit.every((u) => Math.abs(u - 1) < 1e-6),
    `b = 40 on a 24-unit body clamps to ${r.past.b} with incidence `
    + `${r.past.incidence}; every normal is a unit vector (${r.unit.join(', ')})`);

  /*
   * Incidence is 1 through the centre and 0 along the rim, which is the number
   * PRISM's `reflect` has always been compared against and never received.
   */
  check('...and incidence runs from square-on to grazing',
    r.incidence[0] === 1 && r.incidence[4] === 0
    && r.incidence.every((v, i, a) => i === 0 || v < a[i - 1]),
    `b = 0/6/12/21.6/24 gives incidence ${r.incidence.join(', ')}`);

  /*
   * The linear half is deliberately UNCHANGED. An impulse applied off-centre
   * still delivers all of itself to the centre of mass -- where it landed adds
   * angular momentum, it does not subtract linear -- so this costs the
   * knockback ladder nothing and HEAVY is worth exactly what it was worth.
   */
  check('where a round lands decides the spin and not the shove',
    Math.abs(r.centre.v - r.rim.v) < 1e-6 && r.centre.v > 0
    && Math.abs(r.centre.av) < 1e-9
    && Math.abs(r.rim.av) > 0.05
    && Math.abs(Math.abs(r.rim.av) - Math.abs(r.rimOther.av)) < 1e-9,
    `centre: ${r.centre.v} u/s and ${r.centre.av} rad/s; rim: ${r.rim.v} u/s and `
    + `${r.rim.av} rad/s; the other rim ${r.rimOther.av} rad/s`);

  /*
   * ...and it turns the way a person watching would say it should.
   *
   * This is the assertion the first version of the case above was missing. It
   * pinned the symmetry -- the two rims spin opposite each other -- which is
   * equally true of the correct model and of its mirror image, and build 211
   * shipped the mirror image underneath it: a round from below striking left
   * of centre pushes that side away from you, which is clockwise, and every
   * body on the field went anticlockwise.
   */
  check('...and it turns the way it should, in every arrangement',
    r.turns.every((t) => t.got === t.want),
    r.turns.map((t) => `${t.name} wanted ${t.want} got ${t.got} (${t.av})`).join('; '));

  check('...and nothing may spin faster than the cap',
    r.spinCap <= r.cap + 1e-6 && r.spinCap > 0,
    `six rim hits on a SEED settle at ${r.spinCap} rad/s against a cap of ${r.cap}`);

  /*
   * PRISM's own docstring has said "only a square-on hit lands" since it was
   * written. Measured before the fix, across five sub-frame phases: a
   * dead-centre shot landed three times in five, and the incidence column was
   * identical for every offset from 0 to 0.4r -- the frame boundary decided,
   * not the geometry.
   */
  check('a square-on shot always lands on a PRISM, and a graze always bounces',
    r.squareAllHit && r.grazeAllReflect,
    `dead centre at five sub-frame phases: ${r.square.join(', ')}; `
    + `at 0.95r: ${r.grazing.join(', ')}`);
}

// --- HE goes off differently every time ------------------------------------
/*
 * The burst this replaces was a single ochre outline circle, twelve sparks and
 * a small shake -- the shortest explosion authored in the game, with no
 * shards, no embers, no ripple and no tail. Three things were wrong with it.
 *
 *   IT DREW THE WRONG CIRCLE. The ring expanded to `r * 1.4` and only reached
 *   there at the end of its life, so the picture ended 40% outside the radius
 *   the damage was applied at -- and because a ring fades and thins AS IT
 *   GROWS, it was dimmest and thinnest exactly where the damage was. The frame
 *   the damage landed on was the least conspicuous frame of the effect.
 *
 *   IT WORE SOMEBODY ELSE'S COLOUR. #ffd166 is NEEDLE's and GLUT's body colour
 *   and #ff9f1c is WARDEN's; the burst was drawn in the same two tones as the
 *   BLAST mine and read as a small one.
 *
 *   IT WAS THE SAME EVERY TIME. Radius, colour, width, life, shake and sound
 *   were all constant; the only variation in the whole function was twelve
 *   spark angles, which are invisible against the lattice.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { fx, updateFx } = await import('../src/fx.js');
    const { heFx } = await import('../src/shooter.js');
    const TAU = Math.PI * 2;
    const R = CFG.rounds.explosive.blast.r;
    const F = CFG.rounds.explosive.fx;
    const out = { R, F, maxParticles: CFG.maxParticles };

    const burst = (rr, light = false) => {
      fx.reset();
      heFx(315, 560, rr, light);
      // `span` and `a0` are NOT rounded: the closed-ring test compares span
      // against TAU, and rounding it to three places put it 1.85e-4 away from
      // a full turn -- so every ring in the burst read as an arc and the front
      // read as absent. The first version of this case did exactly that.
      const rings = fx.rings.active.map((g) => ({
        r: +g.r.toFixed(2), span: g.span ?? TAU, a0: g.a0 ?? 0,
        fill: g.fill, color: g.color, life: +g.life.toFixed(3),
      }));
      return { rings, parts: fx.particles.active.length };
    };

    // ---- the front is AT the damage radius, closed, on frame one ----
    const b0 = burst(R);
    const closed = b0.rings.filter((x) => Math.abs(x.span - TAU) < 1e-6 && !x.fill);
    out.front = closed[0] || null;
    out.overshoot = +Math.max(...b0.rings.map((x) => x.r)).toFixed(2);
    out.arcs = b0.rings.filter((x) => x.span < TAU - 1e-6).length;
    out.parts = b0.parts;

    // ---- and it is different every time ----
    const sig = (b) => b.rings.filter((x) => x.span < TAU - 1e-6)
      .map((x) => `${x.a0.toFixed(3)}/${x.span.toFixed(3)}`).join(',');
    const sigs = [];
    for (let i = 0; i < 12; i++) sigs.push(sig(burst(R)));
    out.distinct = new Set(sigs).size;
    out.of = sigs.length;

    // ...and so is where the debris goes. Binned by direction: an even ring
    // would fill every bin, lobes leave some empty, and WHICH are empty has to
    // change from one detonation to the next or the lobes are decoration.
    /*
     * EIGHT bursts, not two, and the statistic is the concentration.
     *
     * This drew two and required BOTH to leave one of twelve 30-degree bins
     * empty, which is a property of a single random draw rather than of the
     * effect: measured over 200 detonations, a burst fills all twelve about
     * once in 200, so two draws failed roughly one run in a hundred and the
     * case was on the flake list for three builds. It is about 33 particles
     * spread over 12 bins -- an empty bin is likely, not certain.
     *
     * What is actually being claimed is that the debris goes in LOBES rather
     * than an even ring, and the honest measure of that is how far the busiest
     * direction is above the mean: an even ring is 1.0 by construction, and
     * the measured floor over 200 bursts is 2.18 (p5 2.55, median 3.27). The
     * worst of eight is asserted, so it is a statement about every burst
     * rather than about a lucky one.
     */
    const lobeSig = () => {
      fx.reset();
      heFx(315, 560, R);
      const bins = new Array(12).fill(0);
      for (const p of fx.particles.active) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp < 40) continue;
        bins[(((Math.atan2(p.vy, p.vx) + TAU) % TAU) / TAU * 12) | 0]++;
      }
      return bins;
    };
    const lobes = [];
    for (let i = 0; i < 8; i++) lobes.push(lobeSig());
    const peakOf = (b) => Math.max(...b) / Math.max(1, b.reduce((a, x) => a + x, 0) / 12);
    out.lobeWorstPeak = Math.min(...lobes.map(peakOf));
    // ...and most of them leave a direction bare, which is the picture the
    // concentration produces. Six of eight, against a per-burst rate of 199
    // in 200 -- clear of the truth rather than sitting on it.
    out.lobeWithGap = lobes.filter((b) => b.some((x) => x === 0)).length;
    out.lobeDistinct = new Set(lobes.map((b) => b.join(','))).size;

    // ---- it has a tail, where the old one was over in a sixth of a second --
    fx.reset();
    heFx(315, 560, R);
    let alive = 0;
    for (let f = 0; f < 200; f++) {
      updateFx(1 / 60);
      if (fx.particles.active.length || fx.rings.active.length) alive = f + 1;
    }
    out.life = +(alive / 60).toFixed(2);

    // ---- a sub-blast is drawn lighter than the main one ----
    const heavy = burst(R * 0.5);
    const light = burst(R * 0.5, true);
    out.heavyParts = heavy.parts;
    out.lightParts = light.parts;
    out.lightRings = light.rings.length;

    // ---- and a screen-filling one does not cost proportionally more --------
    const big = burst(R * 2.744); // OVERPRESSURE, all three levels
    out.bigParts = big.parts;
    fx.reset();
    return out;
  });

  /*
   * A ring is brightest and widest at SPAWN and fades as it grows, so a front
   * authored to expand into the blast radius is at its faintest exactly where
   * the damage was. This one starts there.
   */
  check('the HE front is a closed ring at the radius the damage was applied to',
    r.front && Math.abs(r.front.r - r.R) < 1e-6 && r.overshoot <= r.R * 1.15,
    `front drawn at ${r.front ? r.front.r : 'none'} against a blast radius of `
    + `${r.R}; nothing in the burst starts beyond ${r.overshoot} (the old one `
    + `ended at ${r.R * 1.4})`);

  check('...and the shockwave behind it is broken into arcs nothing picks twice',
    r.arcs >= r.F.arcs[0] && r.arcs <= r.F.arcs[1] && r.distinct === r.of,
    `${r.arcs} arcs this time; ${r.distinct} of ${r.of} detonations had a `
    + `different set of them`);

  /*
   * An even ring of sparks is the radius drawn twice. Lobes give the burst a
   * direction, and a different one each time -- which is the whole of what
   * "different every time" has to mean to be visible at 390px.
   */
  check('...and the debris is thrown along lobes, in a different pattern each time',
    r.lobeWorstPeak > 1.8 && r.lobeWithGap >= 6 && r.lobeDistinct === 8,
    `over eight bursts the weakest still puts ${r.lobeWorstPeak.toFixed(1)}x the mean `
    + `into one direction (an even ring is 1.0), ${r.lobeWithGap}/8 left a direction `
    + `bare, and ${r.lobeDistinct}/8 patterns were distinct`);

  check('...and it has a tail, where the old burst was over in a sixth of a second',
    r.life > 0.6, `the last of it goes out at ${r.life}s`);

  /*
   * `out` is a fixed 78 units and is not scaled by OVERPRESSURE, so past about
   * a 210-unit main radius every sub-blast is entirely inside it: the old
   * version drew four small circles within one big one. The lighter treatment
   * is what a sub-blast gets when it does still change the outline.
   */
  check('a cluster sub-blast is drawn lighter than the burst that threw it',
    r.lightParts < r.heavyParts * 0.6 && r.lightRings <= 3 && r.lightParts > 0,
    `sub-blast ${r.lightParts} particles and ${r.lightRings} rings against the `
    + `main burst's ${r.heavyParts}`);

  /*
   * The particle pass is additive and a fully-bought blast is 84% of the width
   * of a 390px screen. Drawn at full density that does not read as bigger, it
   * reads as white -- and it would spend most of a 620-particle budget on one
   * trigger pull.
   */
  check('...and a screen-filling blast does not cost proportionally more',
    r.bigParts < r.parts * 2.4 && r.bigParts < r.maxParticles * 0.35,
    `stock ${r.parts} particles, fully bought ${r.bigParts}, budget ${r.maxParticles}`);
}

// --- SPORE's ground is capped, and laid where the round landed -------------
/*
 * Patch damage is per body, additive, with no cap and no dedup, so a round's
 * real number was never its dps -- it was its dps times how many patches the
 * fire rate kept alive. At 0.286 * 2.0 = 0.572s between shots against a 4.5s
 * life that is 7.9 of them: 362 damage a second stock, against SCATTER's 135
 * and BOLT's 91, and 8.2x the rack with BLOOM OUT bought. Against a boss with
 * minions the ground was landing 45k a second into 8.5k of health.
 *
 * Three at a time from build 212, oldest out first, and SECOND GROWTH buys a
 * fourth. The cases below hold the cap, the retirement, the upgrade, and the
 * one thing the cap must NOT reach -- a THORN's ground, which the mine cap
 * already limits and which would otherwise be counted against the round.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { Patch } = await import('../src/patch.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const S = CFG.rounds.spore;
    const out = { cap: S.patch.cap };

    const spores = () => w.effects.filter((f) => f.spore && !f.dead);
    const live = () => spores().filter((f) => !f.retired).length;

    /** A body that will not move and will not die, straight up the barrel. */
    const pin = () => {
      const e = g.debugSpawn('bulwark', s.x, s.y - 300);
      e.staged = false; e.spawnIn = 0;
      e.hp = 1e9; e.maxHp = 1e9; e.invMass = 0;
      return e;
    };
    /** Fire one round and run it out, holding the body where it was put. */
    const volley = (e, shots, onFrame) => {
      for (let i = 0; i < shots; i++) {
        s.shoot(w);
        for (let k = 0; k < 30 && w.projectiles.length; k++) {
          e.vx = 0; e.vy = 0; e.av = 0;
          g.update(1 / 60);
          if (onFrame) onFrame();
        }
      }
    };
    const clear = () => {
      g.debugClearField();
      w.projectiles.length = 0;
      w.effects.length = 0;
      w.round = 'spore';
      s.aim = -Math.PI / 2; s.targetAim = s.aim;
    };

    // ---- the ground goes down where the round met the body ----------------
    /*
     * `hx, hy` is a clamped closest point on ONE FRAME of travel and is not on
     * the surface: measured over 304 landed hits it sat a median 20.9 world
     * units from the real contact, p90 36.6, and 10.4% of the time outside the
     * body altogether. The true point is exactly `e.r` from the centre by
     * construction, which is what this measures -- a step end has no reason to
     * land on that circle and, being systematically short, never did.
     */
    clear();
    const e0 = pin();
    let laid = null;
    volley(e0, 1, () => {
      const p = spores()[0];
      if (p && !laid) laid = { x: p.x, y: p.y, ex: e0.x, ey: e0.y, er: e0.r };
    });
    out.laid = laid && +Math.abs(Math.hypot(laid.x - laid.ex, laid.y - laid.ey) - laid.er).toFixed(2);
    out.r0 = laid && laid.er;

    // ---- three at a time, and the oldest is the one that goes -------------
    clear();
    const e1 = pin();
    let peak = 0;
    const born = [];
    volley(e1, 7, () => {
      peak = Math.max(peak, live());
      for (const p of spores()) if (!born.includes(p)) born.push(p);
    });
    out.peak = peak;
    out.born = born.length;
    // Oldest first: of the ones that ever burned, the retired set must be a
    // PREFIX of the order they were laid in.
    const outOrder = born.map((p) => (p.retired ? 1 : 0));
    out.prefix = outOrder.join('').replace(/1*0*$/, '') === '';
    out.stillLive = live();

    // ---- ...and one put out early stops hurting what stands in it ---------
    /*
     * `next = Infinity` rather than `dps = 0`: applyDamage floors a hit at
     * Math.max(1, ...), so a retired patch on zero damage would still take a
     * point off everything in it four times a second. The control run is the
     * instrument showing it can read a one.
     */
    clear();
    const bite = (retire) => {
      g.debugClearField();
      w.effects.length = 0;
      const b = g.debugSpawn('bulwark', s.x, s.y - 300);
      b.staged = false; b.spawnIn = 0; b.hp = 1e6; b.maxHp = 1e6; b.invMass = 0;
      const p = new Patch(b.x, b.y, { r: 200, life: 4, dps: 46, tone: '#8eeb4b', spore: true });
      if (retire) p.retire();
      const before = b.hp;
      for (let k = 0; k < 90; k++) { b.vx = 0; b.vy = 0; p.update(w, 1 / 60); }
      const took = before - b.hp;
      b.dead = true;
      return +took.toFixed(2);
    };
    out.burning = bite(false);
    out.putOut = bite(true);

    // ---- SECOND GROWTH buys a fourth --------------------------------------
    clear();
    w.up.patchCap += 1;
    const e2 = pin();
    let peak4 = 0;
    volley(e2, 7, () => { peak4 = Math.max(peak4, live()); });
    out.peak4 = peak4;
    w.up.patchCap -= 1;

    // ---- ...and a THORN's ground is not counted against the round ---------
    /*
     * A THORN makes the identical Patch and is already limited by the mine
     * cap. Tagging only the round is what keeps the two from putting each
     * other out -- the first version of this change capped every Patch in
     * world.effects and a full spore rack silently doused the mines.
     */
    clear();
    const e3 = pin();
    for (let i = 0; i < 3; i++) {
      g.debugThrowMine('thorn');
      for (let k = 0; k < 90; k++) g.update(1 / 60);
    }
    const thornsBefore = w.effects.filter((f) => f.r && f.dps && !f.spore && !f.dead).length;
    volley(e3, 7, null);
    out.thornsBefore = thornsBefore;
    out.thornsAfter = w.effects.filter((f) => f.r && f.dps && !f.spore && !f.dead && !f.retired).length;
    out.sporesWithThorns = live();

    g.debugClearField();
    w.effects.length = 0;
    w.projectiles.length = 0;
    g.restart();
    return out;
  });

  check('a SPORE patch is laid where the round met the body, not where its step ended',
    r.laid !== null && r.laid < 1.5,
    `the ground landed ${r.laid} units off the surface of a body of radius `
    + `${r.r0}; the step end used to be a median 20.9 out`);

  check('only three patches of burning ground may be alight at once',
    r.peak === r.cap && r.born > r.cap && r.stillLive === r.cap,
    `${r.born} laid over seven shots, never more than ${r.peak} alight at once `
    + `against a cap of ${r.cap}, ${r.stillLive} still burning at the end`);

  check('...and it is the oldest that goes out, so the round is about placement',
    r.prefix && r.born > r.stillLive,
    `${r.born - r.stillLive} of ${r.born} were put out, and they are the ones `
    + `laid first, in order (${r.prefix})`);

  check('...and one put out early stops hurting what stands in it',
    r.burning > 0 && r.putOut === 0,
    `a burning patch took ${r.burning} off a body in a second and a half; a `
    + `retired one took ${r.putOut} (dps 0 alone would still take 1 a tick)`);

  check('...and SECOND GROWTH buys a fourth',
    r.peak4 === r.cap + 1,
    `${r.peak4} alight with the node owned, against ${r.peak} without it`);

  check('...and a THORN\'s ground is not counted against the round\'s cap',
    r.thornsBefore > 0 && r.thornsAfter === r.thornsBefore && r.sporesWithThorns === r.cap,
    `${r.thornsBefore} thorn patches down, ${r.thornsAfter} still burning after `
    + `a full spore rack, alongside ${r.sporesWithThorns} of the round's own`);
}

// --- the OBJECTS figure is clearing, not arrival ----------------------------
/*
 * `(asked - alive) / asked`, in four copies, is not a measure of clearing. It
 * is a measure of ARRIVAL: `asked` is the whole wave and the bodies come out
 * one at a time over the length of it, so the figure opened near 100% and fell
 * as the wave landed. Measured over 38 waves of a driven run before the fix,
 * the reading on the frame each wave began ran from 0 to 100 with a median of
 * 75 -- for waves in identical condition, none of them shot at -- and the
 * number ran BACKWARDS on 85 frames, worst single drop 67 points. And `alive`
 * counts every hostile on the field while a wave puts out more bodies than it
 * asks for, so a SPLITTER wave was pegged near 0 with most of it down.
 *
 * These cases hold the three things that were wrong: it starts at nothing, it
 * moves only on a kill, and what a wave makes counts as work rather than as
 * failure.
 */
{
  const r = await page.evaluate(async () => {
    const { WAVES } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const d = w.director;
    const out = {};

    /** Put the run on one authored wave, from the top, with a clear field. */
    const pose = (pick) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.autoAim = false; w.autoFire = false;
      const i = WAVES.findIndex(pick);
      d.order = [i]; d.at = 0;
      d.resting = false;
      d.load(w, WAVES[i]);
      /*
       * begin() does this and load() does not, so a wave posed by calling
       * load() directly sits behind whatever the clock was left on -- and
       * reset() leaves it on the 22-second opening grace. The splitter case
       * below spent twenty seconds watching a wave that had not been let out
       * yet and reported "no splitter wave found".
       */
      d.timer = 0;
      w.time = 1000; d.lastRelease = 1000;
      return i;
    };
    const pct = () => Math.round(d.cleared(w) * 100);
    const up = () => w.enemies.filter((e) => !e.dead && !e.harmless && !e.fizzle).length;

    // ---- it opens at nothing, and stays there for the whole arrival -------
    const plain = pose((x) => !x.teach && x.of.length && x.of.every(([id]) => id === 'mote' || id === 'needle'));
    out.wave = plain >= 0;
    out.opening = pct();
    // Seeded with the opening reading, so the reported maximum is over the
    // WHOLE arrival including the frame the wave began on -- which is the
    // frame the old one read 100% on.
    const trail = [pct()];
    // Let the wave arrive with the gun cold. Every one of these frames is a
    // body landing and none of them is a kill, which is the whole of what the
    // old reading got backwards.
    for (let f = 0; f < 60 * 30 && d.jobs.length; f++) {
      g.update(1 / 60);
      trail.push(pct());
    }
    out.arrivalMax = trail.length ? Math.max(...trail) : -1;
    out.arrivalUp = up();
    out.arrived = !d.jobs.length;

    // ---- ...and a kill is the only thing that moves it --------------------
    const before = pct();
    const victim = w.enemies.find((e) => !e.dead && !e.harmless);
    if (victim) { victim.hp = 1; victim.applyDamage(w, 999, 0, 0, 0); }
    g.update(1 / 60);
    out.beforeKill = before;
    out.afterKill = pct();
    out.slain = d.slain;

    // ---- ...and it never runs backwards while a wave is being cleared -----
    /*
     * Except where the wave MAKES something: a SPLITTER splitting adds work
     * that was never asked for, and the figure moving down by exactly that is
     * the field telling the truth. So this walks a wave with no splitter in
     * it, and the splitter is its own case below.
     */
    pose((x) => !x.teach && x.of.length && x.of.every(([id]) => id === 'mote' || id === 'needle'));
    w.autoAim = true; w.autoFire = true;
    let back = 0; let worst = 0; let last = pct(); let peak = 0;
    for (let f = 0; f < 60 * 90 && !d.resting; f++) {
      g.update(1 / 60);
      const p = pct();
      if (p < last) { back++; worst = Math.max(worst, last - p); }
      peak = Math.max(peak, p);
      last = p;
    }
    out.back = back; out.worst = worst; out.peak = peak;

    // ---- what a wave makes is work, not failure ---------------------------
    /*
     * `asked` counts the SPLITTER as one and it dies into two more, so the
     * old reading could not tell "cleared" from "multiplied": measured, a
     * splitter wave of asked 7 never read above 57% with six of its seven
     * down, because the children it made were subtracted from its own total.
     */
    pose((x) => !x.teach && x.of.some(([id]) => id === 'splitter'));
    for (let f = 0; f < 60 * 20 && d.jobs.length; f++) g.update(1 / 60);
    const sp = w.enemies.find((e) => !e.dead && e.type.id === 'splitter');
    out.foundSplitter = !!sp;
    if (sp) {
      const upBefore = up();
      const pBefore = pct();
      sp.hp = 1; sp.applyDamage(w, 999, 0, 0, 0);
      for (let f = 0; f < 20; f++) g.update(1 / 60);
      out.split = { upBefore, upAfter: up(), pBefore, pAfter: pct(), slain: d.slain };
    }

    // ---- and it is bounded, whatever the field does ------------------------
    /*
     * The old one clamped because it had to: `alive` routinely exceeded
     * `asked` (measured, 15 up on a wave of 12) and the raw fraction went
     * NEGATIVE. This one cannot leave [0, 1] by construction, and the field
     * being flooded is the case that proves it.
     */
    g.debugClearField();
    d.resting = false; d.asked = 4; d.jobs.length = 0; d.slain = 2;
    for (let i = 0; i < 24; i++) {
      const e = g.debugSpawn('mote', 30 + (i % 12) * 24, 120 + ((i / 12) | 0) * 40);
      if (e) { e.staged = false; e.spawnIn = 0; }
    }
    out.flooded = pct();
    d.slain = 0;
    out.floodedNone = pct();

    // ---- an anomaly says nothing on this chip -----------------------------
    /*
     * Game.update freezes the director for the whole of a fight, so the wave
     * underneath cannot move -- and w.kills climbs the entire time off the
     * boss's own bodies. Both halves are guarded: the chip goes blank, and
     * registerKill does not pour a boss's dead into a paused wave.
     *
     * Driven through registerKill rather than by shooting a boss for ninety
     * seconds: it is the one door every death comes through, and a case that
     * waits for an anomaly to make one of its own is measuring the fight.
     * The control below is what shows the counter can read a one at all --
     * the same wave, the same call, with nothing in the sky.
     */
    g.debugClearField();
    g.restart();
    w.phase = 'staging';
    d.resting = false; d.asked = 6; d.jobs.length = 0; d.slain = 0;
    w.aperture = 1;
    g.openBoss(1);
    for (let f = 0; f < 60; f++) g.update(1 / 60);
    const bossUp = !!w.boss;
    // The chip this used to read is gone (build 222). What it was really
    // asserting is that a paused wave takes nothing from a boss's dead, and
    // that is still `cleared` -- which the rail and AUDIT both draw.
    const frozen = d.cleared(w);
    // Handed a body OF THE RUNNING WAVE, because that is what registerKill
    // now tests: a death only moves the figure if it belongs to the wave the
    // figure is about. A bare call proves nothing either way.
    const one = () => g.registerKill({ wave: d.serial });
    for (let i = 0; i < 5; i++) one();
    const underBoss = d.slain;
    // ...and the control: no boss, same call, same wave.
    w.boss = null;
    for (let i = 0; i < 5; i++) one();
    out.boss = { up: bossUp, frozen, after: d.cleared(w), underBoss,
      control: d.slain - underBoss };

    g.debugClearField();
    g.restart();
    return out;
  });

  check('the wave figure opens at nothing, and the whole arrival leaves it there',
    r.wave && r.opening === 0 && r.arrived && r.arrivalMax === 0 && r.arrivalUp > 1,
    `opened at ${r.opening}%, highest ${r.arrivalMax}% across an `
    + `arrival that put ${r.arrivalUp} bodies on the field with the gun cold `
    + `(the old reading opened at a median 75% and fell to 0 as they landed)`);

  check('...and a kill is the only thing that moves it',
    r.beforeKill === 0 && r.afterKill > 0 && r.slain === 1,
    `${r.beforeKill}% -> ${r.afterKill}% on the first body down (slain ${r.slain})`);

  check('...and clearing a wave never takes the figure backwards',
    r.back === 0 && r.peak > 0,
    `${r.back} steps down over a wave driven to its end, worst ${r.worst} points, `
    + `peaking at ${r.peak}% (the old one stepped down 85 times in 38 waves, `
    + `worst drop 67 points)`);

  /*
   * The dip is the point: two bodies arrived that nothing had asked for, so
   * the denominator grew and the same kills are a smaller share of it. What
   * must NOT happen is the old behaviour, where the children were subtracted
   * from the wave's own total and a splitter wave could not read its way past
   * half however much of it you killed.
   */
  check('...and what a wave MAKES is counted as work rather than as failure',
    r.foundSplitter && r.split && r.split.upAfter > r.split.upBefore
    && r.split.slain > 0 && r.split.pAfter > 0,
    r.split ? `the splitter went down and left ${r.split.upAfter - r.split.upBefore + 1} `
      + `behind it: ${r.split.upBefore} up -> ${r.split.upAfter}, `
      + `${r.split.pBefore}% -> ${r.split.pAfter}% with ${r.split.slain} down`
      : 'no splitter wave found');

  check('...and it cannot leave nought and a hundred, whatever the field does',
    r.flooded > 0 && r.flooded < 100 && r.floodedNone === 0,
    `24 up against an asked of 4: ${r.flooded}% with two down, ${r.floodedNone}% with none `
    + `(the old fraction went negative here and was clamped)`);

  check('...and an anomaly pours nothing into it',
    r.boss.up && r.boss.underBoss === 0 && r.boss.control === 5
    && r.boss.after === r.boss.frozen,
    `the paused wave took ${r.boss.underBoss} of five deaths with an anomaly up `
    + `and ${r.boss.control} of five without one; the figure sat at `
    + `${r.boss.frozen} throughout`);
}

// --- the corruption is held with the world ---------------------------------
/*
 * `Game.update` returns at the top while the menu, the loadout or the wave
 * sheet is open, so nothing about the world moves -- but `draw()` keeps
 * running, and `Glitch.present` re-rolls every displaced slice, every noise
 * block and the tear line on the frame it is called. So a held game went on
 * tearing and flickering at whatever level the last live frame left it on,
 * which is the one place in the game where the picture has to be still enough
 * to read.
 *
 * Driven synthetically, off one fixed source buffer: a live run cannot answer
 * "did the picture change" because the world under it is moving as well.
 */
{
  const r = await page.evaluate(async () => {
    const { glitch } = await import('../src/glitch.js');
    const g = window.__sim;
    const w = g.world;
    const out = {};
    const was = { level: glitch.level, burst: glitch.burst };

    // A source frame with enough in it that a displaced slice shows.
    const src = document.createElement('canvas');
    src.width = 240; src.height = 320;
    const sc = src.getContext('2d');
    for (let i = 0; i < 300; i++) {
      sc.fillStyle = `hsl(${(i * 37) % 360} 80% 55%)`;
      sc.fillRect((i * 53) % 240, (i * 91) % 320, 9, 5);
    }
    const dst = document.createElement('canvas');
    dst.width = 240; dst.height = 320;
    const dc = dst.getContext('2d');
    /** A cheap signature of what present() actually put on the screen. */
    const shot = () => {
      dc.clearRect(0, 0, 240, 320);
      glitch.present(dc, src, 240, 320);
      const d = dc.getImageData(0, 0, 240, 320).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 61) { h ^= d[i]; h = Math.imul(h, 16777619); }
      return h | 0;
    };
    const distinct = (n) => {
      const s = new Set();
      for (let i = 0; i < n; i++) s.add(shot());
      return s.size;
    };

    // ---- live: the picture moves, which is the whole point of it ----------
    glitch.level = 0.85; glitch.burst = 0;
    out.liveLevel = glitch.level;
    out.liveDistinct = distinct(8);

    // ---- held: settle it the way a paused frame does ----------------------
    /*
     * Sixty frames of the paused path, on the real clock, which is one second
     * of a player looking at the menu. The decay is the same shape
     * settleScreen uses on the flash.
     */
    let steps = 0;
    for (let i = 0; i < 60 && glitch.active; i++) { glitch.settle(1 / 60); steps++; }
    out.settleFrames = steps;
    out.heldLevel = +glitch.level.toFixed(4);
    out.heldActive = glitch.active;
    out.heldDistinct = distinct(8);

    // ...and it is not a one-way door: the level is rebuilt from live state.
    glitch.update(1 / 60, 0.9, 'normal');
    out.backAfterOneFrame = glitch.level > 0.1;

    // ---- and the paused path in the game actually calls it ----------------
    /*
     * Asserted through Game.update rather than by calling settle() directly:
     * the whole defect was that the held path did not reach the corruption,
     * and a case that calls settle() itself would have passed on the broken
     * build. Same shape as the boss/director rule in CLAUDE.md.
     */
    g.restart();
    w.phase = 'staging';
    glitch.level = 0.8; glitch.burst = 0;
    g.hud.menu.open = true;
    const atOpen = glitch.level;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    out.paused = g.paused;
    out.throughUpdate = { from: +atOpen.toFixed(3), to: +glitch.level.toFixed(4) };
    g.hud.menu.open = false;

    glitch.level = was.level; glitch.burst = was.burst;
    g.restart();
    return out;
  });

  check('a held frame stops tearing, and the world being still is not enough',
    r.liveDistinct >= 6 && r.heldActive === false && r.heldDistinct === 1,
    `live, one buffer presented eight times gave ${r.liveDistinct} different `
    + `pictures; held it gave ${r.heldDistinct} (level ${r.liveLevel} -> `
    + `${r.heldLevel} over ${r.settleFrames} frames)`);

  check('...and the pause path in Game.update is what does it',
    r.paused && r.throughUpdate.to < 0.02 && r.throughUpdate.from > 0.5,
    `half a second of held frames took the level ${r.throughUpdate.from} -> `
    + `${r.throughUpdate.to} without settle() being called by the case`);

  check('...and it comes straight back when the world does',
    r.backAfterOneFrame,
    'one live frame at a level of 0.9 puts the corruption back');
}

// --- QUICK LAY sells the wait, which is the half a player feels -------------
/*
 * QUICK ARM sold `mineArm`: the settling time between a mine landing and it
 * being able to trigger, 0.4s to 0.8s depending on the kind. Its line -- "a
 * mine arms twice as fast after it lands" -- was read as the throw cooldown
 * by everyone who read it, because that is the wait a player actually feels.
 * It was a fifth of a second off a fifteen-second cycle.
 *
 * QUICK LAY is the cycle itself, two levels at 0.75: 15s to 11.25 to 8.44.
 * `throwEvery` was documented as one of three numbers no upgrade may move; it
 * is a dial now and the cap and the life are not, which is the part of that
 * contract worth keeping.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const { mineCadence } = await import('../src/mines.js');
    const g = window.__sim;
    const w = g.world;
    const out = { every: CFG.mines.throwEvery, cap: CFG.mines.cap, life: CFG.mines.life };

    // ---- the old node is gone, root and branch --------------------------
    out.quickarmNode = NODES.some((n) => n.id === 'quickarm');
    out.quickarmDef = !!BY_ID.get('quickarm');
    out.freshHasArm = 'mineArm' in freshUpgrades();

    // ---- the new one is in the tree, at two levels ----------------------
    const node = NODES.find((n) => n.id === 'quicklay');
    const def = BY_ID.get('quicklay');
    out.placed = !!node;
    out.levels = def ? def.levels : null;
    out.freshHasEvery = 'mineEvery' in freshUpgrades();

    // ---- and what it is worth, off the clock rather than off the table --
    /*
     * Measured through mineCadence, which is what the frame calls: it returns
     * the next wait. A case that multiplied CFG by the scalar itself would
     * pass on a build where nothing read the scalar at all.
     */
    const waitAfterAThrow = (levels) => {
      g.debugClearField();
      w.up = freshUpgrades();
      for (let i = 0; i < levels; i++) def.apply(w.up, w);
      w.mine = 'blast';
      w.phase = 'staging';
      // Ask for one throw: the timer runs out, mines are laid, and the number
      // that comes back is the wait until the next lot.
      return +mineCadence(w, 0, 1 / 60).toFixed(3);
    };
    out.waits = [0, 1, 2].map(waitAfterAThrow);

    // ---- ...and nothing may sell a third level --------------------------
    const priced = NODES.filter((n) => n.id === 'quicklay');
    out.inTreeOnce = priced.length;

    g.debugClearField();
    w.up = freshUpgrades();
    w.mine = null;
    g.restart();
    return out;
  });

  check('QUICK ARM is gone, and nothing is left reading for it',
    !r.quickarmNode && !r.quickarmDef && !r.freshHasArm,
    `in the tree ${r.quickarmNode}, in the table ${r.quickarmDef}, `
    + `mineArm still on world.up ${r.freshHasArm}`);

  check('QUICK LAY is in its place, two levels, and shortens the actual clock',
    r.placed && r.levels === 2 && r.inTreeOnce === 1 && r.freshHasEvery
    && Math.abs(r.waits[0] - r.every) < 1e-6
    && Math.abs(r.waits[1] - r.every * 0.75) < 1e-3
    && Math.abs(r.waits[2] - r.every * 0.5625) < 1e-3,
    `the wait between throws goes ${r.waits.join('s -> ')}s across two levels, `
    + `off a base of ${r.every}s`);

  /*
   * The cap and the life are still nobody's to move: five on the field,
   * fifteen seconds each. What changed is only how often you may lay.
   */
  check('...and the cap and the life it is measured against did not move',
    r.cap === 5 && r.life === 15 && r.waits[2] < r.life,
    `cap ${r.cap}, life ${r.life}s, fastest throw ${r.waits[2]}s -- so a fully `
    + `bought clock is a steady ${(r.life / r.waits[2]).toFixed(2)} mines, `
    + `against one before`);
}

// --- an anomaly is worth what the gun is worth ------------------------------
/*
 * Bosses were the only hostiles in the game with no scaling at all. `spawnOne`
 * applies the tier's scaleAt() behind `!type.fixed`, every boss body is
 * `fixed`, and each one is built by `new Enemy` inside `Boss.body()` -- so an
 * anomaly met the authored literal whatever the player was carrying.
 *
 * Measured, all seven, auto-aim and auto-fire, nothing bought against the
 * whole tree bought: 227.0s -> 57.3s, 227.3 -> 43.4, 245.0 -> 47.5,
 * 223.7 -> 43.3, 236.3 -> 41.5, 216.0 -> 41.0, 212.6 -> 67.8. Every one to
 * about a fifth of its tuned length.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    const { gunScale } = await import('../src/shooter.js');
    const { freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const out = { cap: CFG.boss.temper, patience: CFG.boss.patience };

    /** Open one anomaly and read what it was built out of. */
    const open = (n, buy) => {
      g.restart();
      w.phase = 'staging';
      w.autoAim = true; w.autoFire = true;
      if (buy) { g.debugGiveEnergy(400000); g.debugBuyAll(); }
      if (n === 1) w.aperture = 1; else w.apertures[n] = 1;
      g.openBoss(n);
      /*
       * Past the arrival. ORDINAL's frame is not assembled during it -- at
       * forty frames the only body on the field with `counts === false` is
       * the core, which is how the first version of this case came to divide
       * a 1900hp core by TALLY's 165 and report the structure at x53.
       */
      for (let f = 0; f < 60 * 30 && w.boss && w.boss.sequencing(); f++) g.update(1 / 60);
      const b = w.boss;
      if (!b) return null;
      // TALLYs only: `counts === false` is every piece of the boss INCLUDING
      // its core, and averaging a 1900hp core in with 165hp panels reported a
      // structure multiplier of 53.
      const panels = w.enemies.filter((e) => !e.dead && e.counts === false
        && e.type.id === 'tally');
      return { hard: b.hard, core: b.core ? b.core.maxHp : null,
        pieces: panels.length,
        hp: panels.reduce((a, e) => a + e.maxHp, 0), boss: b, panels };
    };

    // ---- the measure itself: a PRODUCT, not a list of nodes --------------
    /*
     * Asserted against a literal for the same reason regress asserts up.rate
     * against one: a new damage node arriving is exactly the thing that would
     * otherwise stop this tracking the gun, silently and with every case green.
     */
    g.restart();
    w.up = freshUpgrades();
    w.autoAim = true; w.autoFire = true;
    out.stockScale = +gunScale(w).toFixed(4);
    g.debugGiveEnergy(400000); g.debugBuyAll();
    out.boughtScale = +gunScale(w).toFixed(3);
    // ...and SIGHT is worth nothing to a player aiming by hand, which is how
    // the shot itself gates it.
    w.autoAim = false; w.autoFire = false;
    out.byHandScale = +gunScale(w).toFixed(3);
    w.autoAim = true; w.autoFire = true;

    // ---- stock is an EXACT identity, which is what keeps the hash still --
    /*
     * The multiply is on the health the CONSTRUCTOR produced, not a recompute
     * from `type.hp` -- the constructor applies rand(0.92, 1.1) to every body
     * and fight.mjs seeds Math.random, so recomputing would throw that jitter
     * away and move the canonical ORDINAL hash on a build where nothing was
     * bought. Asserted by exact equality on `hard === 1`, and by a BAND when
     * bought, because the jitter is +/-9% and a case pinned to a digit here
     * would be flaky in the way CLAUDE.md's note describes.
     */
    const stock = open(1, false);
    out.stockHard = stock ? stock.hard : null;
    out.stockCore = stock ? Math.round(stock.core) : null;
    const T = TYPE_BY_ID.tally;
    const O = TYPE_BY_ID.ordinal;
    out.stockCoreBand = stock ? Math.abs(stock.core / O.hp - 1) : null;

    // ---- ...and a bought one is tempered, everywhere it is made ----------
    const bought = open(1, true);
    out.boughtHard = bought ? +bought.hard.toFixed(3) : null;
    out.coreRatio = bought && stock ? +(bought.core / O.hp).toFixed(3) : null;
    out.pieceRatio = bought && bought.pieces
      ? +((bought.hp / bought.pieces) / T.hp).toFixed(3) : null;

    // ---- ...including a piece put BACK after it was taken apart ----------
    /*
     * revive() and ORDINAL's two private copies of it write `type.hp` raw.
     * Miss them and a re-formed panel comes back at authored health halfway
     * through a tempered fight -- invisible, because nothing on the screen
     * says what a panel is supposed to be worth.
     */
    const b = bought && bought.boss;
    let revived = null;
    if (b) {
      const p = w.enemies.find((e) => !e.dead && e.counts === false
        && e.type.id === 'tally');
      if (p) { p.dead = true; b.revive(w, p, 1); revived = p.maxHp; }
    }
    out.revived = revived ? +(revived / T.hp).toFixed(3) : null;

    // ---- and the withdrawal clock moves with it -------------------------
    /*
     * Measured at temper 3.4, TERMINUS's last stage ran 77.8s of the 90 --
     * a net that would have started catching fights it was never meant to.
     * Driven through Game.update rather than by reading the expression: the
     * clock is spent in one place and a case that recomputes it proves
     * nothing about the place that spends it.
     */
    const allowance = (hard) => {
      g.restart();
      w.phase = 'staging';
      w.aperture = 1;
      g.openBoss(1);
      if (!w.boss) return null;
      /*
       * Past the arrival first. `watchBoss` zeroes the clock for as long as
       * the boss is `sequencing()`, which the whole 14.4-second arrival is --
       * so a case that opens the way and steps one frame is measuring the
       * scene, not the clock, and reports the stock anomaly surviving a
       * ninety-second stall it never had.
       */
      for (let f = 0; f < 60 * 30 && w.boss && w.boss.sequencing(); f++) g.update(1 / 60);
      if (!w.boss || w.boss.sequencing()) return null;
      w.boss.hard = hard;
      g.bossStageWas = w.bossStage;
      g.bossStageT = CFG.boss.patience * 1.02;   // just past the stock clock
      const up = !!w.boss;
      g.update(1 / 60);
      return { was: up, still: !!w.boss };
    };
    out.stockClock = allowance(1);
    out.hardClock = allowance(4);

    g.restart();
    w.up = freshUpgrades();
    return out;
  });

  // HOLLOWPOINT (five levels at 1.32 from build 229's rebalance; it was three
  // at 1.5 from 215), SALVO, FEED. SIGHT was a fourth 1.25^3 until build 215,
  // when it was replaced by PILE -- which is deliberately not counted: it is
  // a fixed 26 in a ring round the machine and is worth nothing against a
  // boss met at range.
  const want = 1.32 ** 5 * 1.25 / 0.9;

  check('what the tree did to the gun is one number, and it is 1 at stock',
    r.stockScale === 1 && Math.abs(r.boughtScale - want) < 0.02
    && r.byHandScale === r.boughtScale,
    `stock ${r.stockScale}, fully bought ${r.boughtScale} (the product of `
    + `HOLLOWPOINT, SALVO and FEED is ${want.toFixed(3)}); nothing in it is `
    + `conditional on how the turret is aimed any more (${r.byHandScale})`);

  check('an anomaly opened by a stock turret is the anomaly as authored',
    r.stockHard === 1 && r.stockCoreBand < 0.11,
    `hard ${r.stockHard}, core ${r.stockCore} against an authored 1900 `
    + `(${(r.stockCoreBand * 100).toFixed(1)}% off, which is the constructor's `
    + `own jitter and nothing else -- the multiply is an identity at 1)`);

  /*
   * `hard` is the product, or the cap, whichever is smaller. It WAS the cap
   * until build 215: SIGHT's removal took a 1.25^3 out of gunScale and the
   * product fell from 5.30 to 4.69. The ceiling still binds -- 4.2 is under
 * 4.69, so `Math.min` returns the cap on every bought fight, and the cap is
 * what sets a bought anomaly's health. The 2.71 this used to say was
 * HOLLOWPOINT priced at 1.25 a level, which it has not been since 215. Asserted
   * against the same min the boss takes, not against a literal, or this case
   * would have to be edited every time the gun changes -- and the point of
   * it is to notice when the gun changes.
   */
  const cap = Math.min(want, r.cap);
  check('...and one opened by a bought turret is worth the gun that opened it',
    Math.abs(r.boughtHard - cap) < 0.02
    && Math.abs(r.coreRatio / cap - 1) < 0.12
    && Math.abs(r.pieceRatio / cap - 1) < 0.12,
    `hard ${r.boughtHard} (the product is ${want.toFixed(2)}, the ceiling `
    + `${r.cap}); core x${r.coreRatio} and structure x${r.pieceRatio} of authored`);

  check('...and a piece put back mid-fight comes back tempered too',
    r.revived !== null && Math.abs(r.revived / cap - 1) < 0.02,
    `a revived panel is x${r.revived} of its authored health, against the `
    + `x${cap.toFixed(2)} the rest of the boss is at`);

  /*
   * The clock exists to stop an under-gunned run sitting in front of a gate
   * for ever. A tempered anomaly is longer by construction rather than by the
   * player failing to hurt it, so the allowance moves with the same
   * multiplier its health did.
   */
  check('...and the withdrawal clock is measured against the boss it is watching',
    r.stockClock && !r.stockClock.still && r.hardClock && r.hardClock.still,
    `just past ${r.patience}s: a stock anomaly withdraws (still up `
    + `${r.stockClock && r.stockClock.still}), a x4 one does not `
    + `(${r.hardClock && r.hardClock.still})`);
}

// --- PILE: the one thing on the machine that acts unasked -------------------
/*
 * It replaces SIGHT, and the rule it must not break is the one REFLEX broke in
 * build 190: nothing in this game casts an ability. PILE is not an ability --
 * no charge, no slot, nothing on the bar -- and the case that owns that rule
 * (the whole tree bought, two LURCHERs on the mount, charges counted every
 * frame) covers it unchanged.
 *
 * The design is an ANNULUS and not a blast, and that is load-bearing rather
 * than decorative: it is born at CFG.pile.r0 and only ever travels outward, so
 * it cannot reach a body already on the mount. The glitch timer is the only
 * involuntary way down the game has, its answer is shoving the thing off, and
 * an unaskable blast centred on the turret would quietly defuse it.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG, WAVES: WAVE_TABLE } = await import('../src/config.js');
    const { Front } = await import('../src/shooter.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const P = CFG.pile;
    const out = { every: P.every.slice(), r0: P.r0 };
    const def = BY_ID.get('pile');

    const bare = () => {
      g.debugClearField();
      w.effects.length = 0;
      w.projectiles.length = 0;
      w.spawnLock = 1e9;
      if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      w.up = freshUpgrades();
      w.pileT = 0;
      // On the field, or Game.update never reaches the director at all and
      // every clock this case is about is frozen.
      w.phase = 'staging';
    };
    const own = (n) => { for (let i = 0; i < n; i++) def.apply(w.up, w); };

    // ---- the clock, measured off the waves it actually makes -------------
    /*
     * Through g.update, never by calling the stepper: `runUpgrades` is called
     * BELOW the `if (w.boss)` branch, and a case that drives the stepper
     * directly is testing the one call the game does not make -- which is
     * exactly how build 210's glitch douse shipped dead with a green case.
     */
    out.gaps = [];
    for (let lvl = 1; lvl <= 3; lvl++) {
      bare(); own(lvl);
      let last = null;
      const gaps = [];
      let t = 0;
      for (let f = 0; f < 60 * 30 && gaps.length < 3; f++) {
        const before = w.effects.length;
        g.update(1 / 60);
        t += 1 / 60;
        if (w.effects.length > before) {
          if (last !== null) gaps.push(+(t - last).toFixed(2));
          last = t;
        }
      }
      out.gaps.push(gaps);
    }

    // ---- it never reaches what is on the mount ---------------------------
    /*
     * The front is born outside the contact radius by construction. Asserted
     * on the FUSE as well as on the geometry: a body pinned to the turret
     * must still be able to run the glitch timer all the way down with PILE
     * firing throughout, or the upgrade has taken away the one clock the game
     * promises is answerable.
     */
    /*
     * The mount is INCLUDED from build 216, and this is the case that used to
     * assert the opposite.
     *
     * Build 215 skipped anything whose centre was inside the birth radius, on
     * the grounds that the glitch timer is the only involuntary way down and
     * its answer -- shoving the thing off -- had to stay a decision the player
     * makes. That was overruled: negating the glitch threat with what you have
     * bought is a legitimate thing for the tree to sell. So a body held ON the
     * machine is struck like any other, and the assertion is inverted rather
     * than deleted, because "does it reach the mount" is still the question
     * this upgrade lives or dies on -- it has just changed sign.
     */
    const reach = (at) => {
      bare(); own(3);
      const e = g.debugSpawn('lurcher', s.x, s.y - at);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0; e.vx = 0; e.vy = 0; e.hp = 1e7; e.maxHp = 1e7;
      const f = new Front(s.x, s.y, 3);
      w.effects.push(f);
      // Held for one frame only: long enough for the front to be born on top
      // of it, and then let go, so the shove is measured rather than fought.
      let peak = at;
      for (let k = 0; k < 60; k++) {
        if (k === 0) { e.x = s.x; e.y = s.y - at; e.vx = 0; e.vy = 0; }
        g.update(1 / 60);
        peak = Math.max(peak, Math.hypot(e.x - s.x, e.y - s.y));
      }
      return { at, hit: f.hit.has(e), hurt: e.hp < 1e7, peak: Math.round(peak),
        gained: Math.round(peak - at) };
    };
    out.mount = reach(Math.round(P.r0 * 0.4));
    out.rim = reach(Math.round(P.r0 * 1.4));

    // ...and it does go off on its own, over and over, with nothing asked.
    bare(); own(3);
    let fired = 0;
    for (let f = 0; f < 60 * 22; f++) {
      const before = w.effects.length;
      g.update(1 / 60);
      if (w.effects.length > before) fired++;
    }
    out.fired = fired;

    // ---- ...and it does throw what is closing ----------------------------
    /*
     * The DIRECTION, in the arrangement somebody watching would name: a body
     * out in the ring gains distance from the turret. Asserting that two
     * cases differ would be equally true of the mirror image -- build 211's
     * spin case shipped exactly that way.
     */
    const throwAt = (id, at) => {
      bare(); own(3);
      const e = g.debugSpawn(id, s.x, s.y - at);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0; e.vx = 0; e.vy = 0; e.hp = 1e7; e.maxHp = 1e7;
      const was = Math.hypot(e.x - s.x, e.y - s.y);
      w.effects.push(new Front(s.x, s.y, 3));
      let peak = was;
      for (let f = 0; f < 60; f++) { g.update(1 / 60); peak = Math.max(peak, Math.hypot(e.x - s.x, e.y - s.y)); }
      return { was: Math.round(was), peak: Math.round(peak), gained: Math.round(peak - was) };
    };
    out.mote = throwAt('mote', 110);
    out.bulwark = throwAt('bulwark', 110);

    // ---- grey is grey, and a spent body is finished ----------------------
    bare(); own(3);
    g.debugSpawnDrift();
    for (let f = 0; f < 6; f++) g.update(1 / 60);
    const drift = w.enemies.find((e) => e.harmless && !e.dead);
    if (drift) { drift.x = s.x; drift.y = s.y - 120; drift.hp = drift.maxHp; }
    const spent = g.debugSpawn('mote', s.x + 40, s.y - 120);
    if (spent) { spent.staged = false; spent.spawnIn = 0; spent.spent = true; spent.hp = spent.maxHp; }
    w.effects.push(new Front(s.x, s.y, 3));
    for (let f = 0; f < 40; f++) {
      if (drift) { drift.vx = 0; drift.vy = 0; }
      g.update(1 / 60);
    }
    out.spared = { drift: !!drift && drift.hp === drift.maxHp,
      spent: !!spent && spent.hp === spent.maxHp };

    // ---- and no charge is spent, ever ------------------------------------
    bare(); own(3);
    g.debugGiveEnergy(400000); g.debugBuyAll();
    const charges = () => w.abilities.slots.map((x) => x.charges).join(',');
    const c0 = charges();
    for (let f = 0; f < 60 * 12; f++) g.update(1 / 60);
    out.charges = { before: c0, after: charges() };

    bare();
    w.up = freshUpgrades();
    w.spawnLock = 0;
    g.restart();
    return out;
  });

  check('PILE goes off on its own clock, and the clock is what the card says',
    r.gaps.every((g2, i) => g2.length >= 2
      && g2.every((x) => Math.abs(x - r.every[i]) < 0.12)),
    r.gaps.map((g2, i) => `L${i + 1} ${g2.join('/')}s against ${r.every[i]}`).join('; '));

  /*
   * The whole reason it is a ring and not a blast. If this fails, PULSE has
   * quietly stopped being the answer to something on the mount and the glitch
   * timer has stopped being answerable.
   */
  /*
   * The whole reason it is a ring and not a blast. The glitch timer is the
   * only involuntary way down the game has and its answer is shoving the
   * thing off; an unaskable blast centred on the turret would take that
   * decision away. PILE cannot reach the mount, and PULSE still can.
   */
  /*
   * Asked of the front's own `hit` record as well as of the distance: a body
   * on the mount is taking impact damage off the collision solver the whole
   * time it is there, so its health alone cannot tell you what reached it.
   */
  check('...and it clears the turret itself, which is what it is for',
    r.mount && r.rim && r.mount.hit && r.mount.gained > 40
    && r.rim.hit && r.rim.hurt && r.fired >= 5,
    `the front is born at ${r.r0}: a body sitting on the machine at `
    + `${r.mount && r.mount.at} was struck (${r.mount && r.mount.hit}) and `
    + `thrown to ${r.mount && r.mount.peak} (+${r.mount && r.mount.gained}); `
    + `one at ${r.rim && r.rim.at} was too. ${r.fired} waves went out over 22s `
    + `unasked`);

  check('...and what IS closing is thrown back, hardest when it is lightest',
    r.mote && r.bulwark && r.mote.gained > 120 && r.bulwark.gained < r.mote.gained * 0.35,
    `from ${r.mote.was} units a MOTE is thrown to ${r.mote.peak} (+${r.mote.gained}); `
    + `a BULWARK from ${r.bulwark.was} reaches ${r.bulwark.peak} (+${r.bulwark.gained})`);

  check('...and it leaves grey alone, and leaves a spent body finished',
    r.spared.drift && r.spared.spent,
    `drift untouched ${r.spared.drift}, spent body untouched ${r.spared.spent}`);

  check('...and it is not an ability: nothing on the bar is ever spent for it',
    r.charges.before === r.charges.after,
    `charges ${r.charges.before} -> ${r.charges.after} over twelve seconds of `
    + `PILE firing with the whole tree owned`);
}

// --- nothing that carries words may sit on top of anything else -------------
/*
 * `Hud.pillCap` measures the gap between the alerts column and the teaching
 * band, and the band is not always up -- so three pills could be admitted
 * against a cap of three and then have the band open underneath them, taking
 * the cap to one. Nothing re-tested it: the cap was enforced at ADMISSION and
 * never again. Measured on a real 320x568 viewport before the fix, pills at
 * 165..195 and 197..227 against a band at 163..242 -- two captions inside
 * another one's box, 29px of overlap each.
 *
 * Driven by moving the cap rather than by moving the viewport, because a case
 * cannot resize the window it is running in: what shrank in the real report
 * was the room, and what the room decides is the cap. The geometry is checked
 * as well, at whatever size the suite is actually running at.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const out = {};
    const real = g.hud.pillCap;
    g.hud.clearAlerts(); g.hud.clearHint();
    g.hud.pillHeld.length = 0;

    // Three pills, admitted while there is room for three.
    g.hud.alert('REMAINDER RECOVERED', 'rigDone', 20);
    g.hud.alert('HELD \u00b7 RECAST AVAILABLE', 'rigDone', 20);
    g.hud.alert('BULWARK RECORDED 12/37', 'rigDone', 20);
    out.admitted = g.hud.alerts.length;

    // ...and then the room for them goes, the way the band takes it.
    g.hud.pillCap = () => 1;
    g.hud.updateAlerts(1 / 60);
    out.shownAfter = g.hud.alerts.length;
    out.queuedAfter = g.hud.pillHeld.length;
    out.stillInDom = document.querySelectorAll('#alerts .alert').length;

    // ...and when the room comes back, so do they. Nothing paid for is lost.
    g.hud.pillCap = real;
    for (let f = 0; f < 8; f++) g.hud.updateAlerts(1 / 60);
    out.back = g.hud.alerts.length;

    // ---- and the geometry itself, at the size this is running at ---------
    g.hud.clearAlerts(); g.hud.clearHint(); g.hud.pillHeld.length = 0;
    g.hud.alert('REMAINDER RECOVERED', 'rigDone', 20);
    g.hud.alert('HELD \u00b7 RECAST AVAILABLE', 'rigDone', 20);
    g.hud.alert('BULWARK RECORDED 12/37', 'rigDone', 20);
    g.hud.showHint('CORRUPTION. Something is holding the turret. The barrel cannot reach it. PULSE can.', true);
    for (let f = 0; f < 6; f++) g.syncHud(1 / 60);
    const boxes = [];
    for (const el of document.querySelectorAll('#alerts .alert')) boxes.push({ n: 'pill', b: el.getBoundingClientRect() });
    const band = document.getElementById('abilityHint');
    if (band && band.classList.contains('show')) boxes.push({ n: 'band', b: band.getBoundingClientRect() });
    const top = document.getElementById('topbar');
    if (top) boxes.push({ n: 'topbar', b: top.getBoundingClientRect() });
    let worst = 0;
    const pairs = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b; const b = boxes[j].b;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 1) { worst = Math.max(worst, Math.round(oy)); pairs.push(`${boxes[i].n}/${boxes[j].n}`); }
      }
    }
    out.boxes = boxes.length;
    out.worst = worst;
    out.pairs = pairs;
    out.cap = g.hud.pillCap();

    g.hud.pillCap = real;
    g.hud.clearAlerts(); g.hud.clearHint(); g.hud.pillHeld.length = 0;
    g.restart();
    return out;
  });

  check('a caption never sits on top of another one',
    r.worst === 0 && r.boxes >= 3,
    `${r.boxes} things carrying words up at once against a cap of ${r.cap}; `
    + `worst overlap ${r.worst}px${r.pairs.length ? ` (${r.pairs.join(', ')})` : ''}`);

  /*
   * The actual defect: enforced at admission only is enforced once. The room
   * a caption was admitted into can be taken away by the next thing that
   * opens, and nothing was looking.
   */
  check('...and the cap is re-checked every frame, not only when a pill arrives',
    r.admitted === 3 && r.shownAfter === 1 && r.stillInDom === 1,
    `three admitted; with the room taken away, ${r.shownAfter} left up and `
    + `${r.stillInDom} still in the DOM`);

  /*
   * Nothing paid for is lost: what is up plus what is held is still three.
   * The overflow used to be QUEUED by the per-frame trim and DROPPED by the
   * one inside alert(), so a pill pushed off and then re-admitted could be
   * discarded on its way back in -- one caption of three gone, with nothing
   * reading wrong anywhere.
   */
  check('...and what no longer fits is put back rather than dropped',
    r.shownAfter + r.queuedAfter === r.admitted && r.back > 1,
    `${r.shownAfter} up and ${r.queuedAfter} held of ${r.admitted} admitted; `
    + `${r.back} were up again once there was room`);
}

// --- picking a mine is a choice of kind, not a free mine --------------------
/*
 * `toggleMine` used to set `this.mineTimer = 0.2`, so selecting a kind laid
 * one two tenths of a second later whatever the cadence had left to run.
 * Tapping through the six mine buttons put six mines on the field in about a
 * second, and switching kinds mid-cooldown reset the wait to nothing --
 * reported as "a mine is set after every click of a mine button".
 *
 * The clock runs across a switch now: whatever is selected when it comes up is
 * what gets laid. Switching still costs nothing, which is the point of the
 * strip; it just does not buy anything either.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const out = { every: CFG.mines.throwEvery };

    const clean = () => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.up = freshUpgrades();
      w.mines.length = 0;
      w.mine = null;
      g.mineTimer = 0;
    };
    const laid = () => w.mines.length;

    // ---- six taps in a second is one mine, not six ----------------------
    clean();
    g.toggleMine('blast');
    for (let f = 0; f < 20; f++) g.update(1 / 60);
    const afterFirst = laid();
    for (const k of ['snare', 'thorn', 'lode', 'knell', 'wire']) {
      g.toggleMine(k);
      for (let f = 0; f < 12; f++) g.update(1 / 60);
    }
    out.tapped = { afterFirst, afterSix: laid(), timer: +g.mineTimer.toFixed(1) };

    // ---- ...and switching does not shorten the wait ---------------------
    /*
     * Measured off the clock the frame loop actually keeps, not off a
     * recomputation: the defect was a control writing to that clock, so a
     * case that reads anything else would not have seen it.
     */
    clean();
    g.toggleMine('blast');
    for (let f = 0; f < 60 * 6; f++) g.update(1 / 60);
    const midway = +g.mineTimer.toFixed(2);
    g.toggleMine('snare');
    g.toggleMine('thorn');
    g.toggleMine('blast');
    out.switched = { midway, after: +g.mineTimer.toFixed(2) };

    // ---- ...and the cadence itself is still the cadence ------------------
    clean();
    g.toggleMine('blast');
    const at = [];
    let t = 0;
    for (let f = 0; f < 60 * 40 && at.length < 3; f++) {
      const before = laid();
      g.update(1 / 60);
      t += 1 / 60;
      if (laid() > before) at.push(+t.toFixed(2));
    }
    out.gaps = at.slice(1).map((x, i) => +(x - at[i]).toFixed(2));

    clean();
    g.restart();
    return out;
  });

  check('picking a mine kind does not lay one, and does not reset the clock',
    r.tapped.afterFirst === 1 && r.tapped.afterSix === 1,
    `one tap laid ${r.tapped.afterFirst}; five more kinds tapped over the next `
    + `second laid ${r.tapped.afterSix - r.tapped.afterFirst} more (it used to `
    + `lay one per tap)`);

  check('...and the wait a switch interrupts is the wait it comes back to',
    Math.abs(r.switched.midway - r.switched.after) < 1e-9,
    `${r.switched.midway}s left before three switches, ${r.switched.after}s after`);

  check('...and the cadence between mines is still the one config names',
    r.gaps.length >= 1 && r.gaps.every((x) => Math.abs(x - r.every) < 0.1),
    `${r.gaps.join('s, ')}s between throws against ${r.every}s`);
}

// --- SPLINTER, and what a mine is worth ------------------------------------
/*
 * Build 216 put 10% on every mine that does damage and SPALL's pellets gained
 * a burst where they land. VOID, SNARE and LODE are untouched because none of
 * them has a damage number: VOID deletes, SNARE holds, LODE pushes.
 *
 * Build 231's audit moved three of the six, and this case is the record of
 * which and why -- measured on a twenty-body crowd with the control (the same
 * crowd, no mine) subtracted, stock then fully bought:
 *
 *   BLAST     458 /  2,899     THORN   5,596 / 31,379
 *   KNELL     377 /  3,270     WIRE    5,234 / 18,024
 *   SPALL     456 /  4,261     VOID    one kill, whatever its health
 *
 * BLAST is the only kind that gets exactly ONE event, and it was the smallest
 * of the six; THORN bills every body in its ground for as long as the mine
 * lives and was ahead on every bench that was run. So BLAST 105 -> 150,
 * KNELL 81 -> 95 and THORN's ground 37 -> 29 a second, which lands them at
 * 653 / 4,214, 442 / 3,898 and 4,386 / 24,673.
 *
 * The ratios are pinned rather than printed. A readout with no assertion
 * behind it rots -- build 227 shipped two of those -- and the previous
 * version of this case pinned a flat 1.1 across all six, which is a snapshot
 * of one past pass rather than a rule, so the audit had to come here anyway.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const out = {};

    // ---- the numbers, against what build 215 shipped --------------------
    /*
     * `was` is what build 230 shipped, and the ratios below are build 231's
     * mine audit against it -- kept as ratios so the case reads as the change
     * that was made rather than as a second copy of config.js.
     */
    const was = { blast: 105, fizzle: 48, thorn: 37, knell: 81, wire: 79, spall: 29 };
    const now = {
      blast: CFG.mines.blast.damage,
      fizzle: CFG.mines.fizzle.damage,
      thorn: CFG.thorn.patch.dps,
      knell: CFG.knell.blast.damage,
      wire: CFG.wire.damage,
      spall: CFG.spall.damage,
    };
    out.ratios = Object.fromEntries(Object.entries(now)
      .map(([k, v]) => [k, +(v / was[k]).toFixed(3)]));
    // ...and the three that have no damage number still have none.
    out.noDamage = ['void', 'snare', 'lode'].filter((k) => CFG[k] && CFG[k].damage === undefined);

    // ---- SPLINTER is in the tree at two levels --------------------------
    const node = NODES.find((n) => n.id === 'splinter');
    const def = BY_ID.get('splinter');
    out.placed = !!node;
    out.levels = def ? def.levels : null;

    // ---- ...and it widens what a pellet does where it lands -------------
    /*
     * Measured off bodies actually hurt by the fan, at a spread that no
     * pellet can hit directly: a row set OUTSIDE the pellets' own line, so
     * anything that takes damage took it from a burst. A case that measured
     * total damage would be measuring the pellets.
     */
    /*
     * A rank of bodies across the fan, and the mine PINNED under it.
     *
     * Two things had to be nailed down. The mine lands where `throwMine`
     * decides, so a case that throws one and waits is measuring the throw --
     * it reported 0 damage at both levels on about one run in three, which is
     * the same answer a build with SPLINTER doing nothing would give. And a
     * pellet that hits nothing simply times out 900 units up and bursts
     * there, so the burst is only ever COLLATERAL: it is measured on the
     * bodies beside the ones the pellets actually hit, which is what the
     * upgrade is for.
     */
    /*
     * A rank of bodies beside the fan, with the mine's LANDING SITE pinned.
     *
     * Five versions of this were flaky and every one was the harness rather
     * than the game. A SPALL flies to a target `throwMine` picks, so a rank
     * placed at a guessed spot is a coin toss -- runs came back 0/0, then 1
     * hurt for 50, then 0/0, which is the answer a build with SPLINTER doing
     * nothing would give. A version that patched `applyBlast` to record the
     * radius could not work at all: an ES module export is a live binding and
     * cannot be reassigned from outside, so it recorded zero bursts on a
     * build that fires fourteen.
     *
     * `x1, y1` is where the mine is flying TO, and writing it before it lands
     * is the one thing that makes the geometry the case's to choose. The
     * witness is then placed at a distance no unbought burst can reach and
     * every bought one can.
     */
    const fanRadii = (levels) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      w.up = freshUpgrades();
      for (let i = 0; i < levels; i++) def.apply(w.up, w);
      w.mines.length = 0;
      w.projectiles.length = 0;
      const s = w.shooter;
      const mx = w.width / 2;
      const my = s.y - 170;
      g.debugThrowMine('spall');
      const m = w.mines[0];
      if (!m) return null;
      m.x1 = mx; m.y1 = my;
      for (let f = 0; f < 60 * 4 && w.mines.length && !w.mines[0].landed; f++) g.update(1 / 60);
      if (!w.mines.length) return null;
      w.mines[0].settle = 99;
      /*
       * The target the pellets hit, dead ahead of the mine, and a witness
       * beside it -- outside the FAN as well as outside the unbought burst,
       * which is the arithmetic this case turns on.
       *
       * The fan is 0.9 radians wide, so its half-width at distance d is
       * 0.483d. At 150 units that is 72, and a witness 44 units off the line
       * was inside it and struck by pellets directly at both levels (measured
       * 71 and 89 -- a real difference, but not the one being claimed). At 80
       * units the fan is 39 wide: a witness at 50 is clear of it by 11, clear
       * of the authored 26-unit burst by 24, and inside the 62.5 that two
       * levels buy by 12.
       */
      const put = (x, y) => {
        const e = g.debugSpawn('mote', x, y);
        if (!e) return null;
        e.staged = false; e.spawnIn = 0; e.hp = 1e6; e.maxHp = 1e6;
        e.invMass = 0; e.vx = 0; e.vy = 0;
        return e;
      };
      const target = put(mx, my - 80);
      const witness = put(mx + 50, my - 80);
      /*
       * The body that sets it off, at the EDGE of the mouth rather than on
       * top of it. `spall()` fires from `m.y - 4`, so a trigger body standing
       * on the mine is born inside the fan and eats all fourteen pellets on
       * frame one -- measured, the target 150 units up took exactly 0 while
       * the projectiles vanished in nine frames. Four versions of this case
       * failed on that, and none of them was the game.
       */
      const trip = put(mx + 38, my);
      if (trip) { trip.hp = 1e6; trip.maxHp = 1e6; }
      let fired = false;
      for (let f = 0; f < 60 * 3; f++) {
        for (const e of [target, witness, trip]) {
          if (e) { e.vx = 0; e.vy = 0; }
        }
        if (trip) { trip.x = mx + 38; trip.y = my; }
        if (target) { target.x = mx; target.y = my - 80; }
        if (witness) { witness.x = mx + 50; witness.y = my - 80; }
        g.update(1 / 60);
        if (!w.mines.length) fired = true;
      }
      return {
        fired,
        target: target ? Math.round(1e6 - target.hp) : 0,
        witness: witness ? Math.round(1e6 - witness.hp) : 0,
      };
    };
    out.one = fanRadii(0);
    out.two = fanRadii(2);

    g.debugClearField();
    w.spawnLock = 0;
    w.up = freshUpgrades();
    g.restart();
    return out;
  });

  const R = r.ratios;
  check('the mine audit moved three numbers and left the other three alone',
    Math.abs(R.blast - 1.429) < 0.01 && Math.abs(R.knell - 1.173) < 0.01
    && Math.abs(R.thorn - 0.784) < 0.01
    && Math.abs(R.fizzle - 1) < 0.01 && Math.abs(R.wire - 1) < 0.01
    && Math.abs(R.spall - 1) < 0.01
    && r.noDamage.length === 3,
    Object.entries(R).map(([k, v]) => `${k} x${v}`).join(', ')
    + `; and ${r.noDamage.join('/')} still have no damage number to raise`);

  /*
   * The witness is what the node bought: a body clear of the fan's own line,
   * reached only by what the pellets leave behind. Measured stable across
   * runs at 35 unbought against 62 with both levels -- a clean 1.8x, where
   * the target in the fan barely moves (212 -> 227) because it is being hit
   * by pellets either way. The target is the control: a case that watched
   * only IT would pass on a build where SPLINTER did nothing at all.
   */
  check('SPLINTER is in the tree at two levels, and widens what a pellet leaves',
    r.placed && r.levels === 2 && r.one && r.two && r.one.fired && r.two.fired
    && r.one.target > 0 && r.two.target > 0
    && r.one.witness > 0 && r.two.witness > r.one.witness * 1.5,
    `the body in the fan took ${r.one.target} unbought and ${r.two.target} `
    + `bought; a witness 50 units off the line took ${r.one.witness} and `
    + `${r.two.witness}`);
}

// --- PULSE actually clears the mount, and pays what the floor is worth ------
/*
 * An audit of PULSE found four things wrong with it and one reason none of
 * them had been caught: nothing in the suite ever pressed PULSE and looked at
 * `world.attackers`. The existing case counts pixels and effects, and the
 * release case proves the contact set releases by TELEPORTING a body 420 units
 * away. So the ability's whole job was untested.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const out = {};

    const seat = (id, buy) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      w.up = freshUpgrades();
      if (buy) { const d2 = BY_ID.get('shockfront'); for (let i = 0; i < 2; i++) d2.apply(w.up, w); }
      const e = g.debugSpawn(id, s.x + 4, s.y - 6);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0; e.hp = 1e7; e.maxHp = 1e7;
      for (let f = 0; f < 30; f++) { e.x = s.x + 4; e.y = s.y - 6; e.vx = 0; e.vy = 0; g.update(1 / 60); }
      return e;
    };
    const press = () => {
      const slot = w.abilities.slots.find((x) => x.def.essential);
      if (!slot) return false;
      slot.charges = Math.max(1, slot.charges); slot.cd = 0;
      g.useAbility(w.abilities.slots.indexOf(slot));
      return true;
    };

    /*
     * The heaviest body in the game, WITH THE TURRET FIRING -- which is the
     * case that was broken. `kicked` is the anti-knockback-lock counter and
     * PULSE was paying it like a stray bolt: measured, an ordinary rate of
     * fire took a BULWARK's separation from 6.38 units to 0.35, against the
     * 6.4 it needs to be released. So the gun disarmed the one escape the
     * game has, and the fuse kept closing through the press.
     */
    const clears = (id, firing) => {
      const e = seat(id, false);
      if (!e) return null;
      w.autoAim = true;
      w.autoFire = !!firing;
      if (firing) {
        // Long enough for `kicked` to settle where sustained fire keeps it.
        for (let f = 0; f < 60 * 3; f++) {
          e.x = s.x + 4; e.y = s.y - 6; e.vx = 0; e.vy = 0; e.hp = e.maxHp;
          g.update(1 / 60);
        }
      }
      const kicked = +(e.kicked || 0).toFixed(2);
      const held = !!w.attackers.has(e);
      press();
      let clear = 0;
      let peak = 0;
      for (let f = 0; f < 60 * 2; f++) {
        g.update(1 / 60);
        peak = Math.max(peak, Math.hypot(e.x - s.x, e.y - s.y));
        if (!w.attackers.has(e)) clear++;
      }
      w.autoFire = false;
      return { held, kicked, clear, peak: Math.round(peak), thrown: e.thrown > 0 };
    };
    out.quiet = clears('bulwark', false);
    out.firing = clears('bulwark', true);
    out.mote = clears('mote', true);

    // ---- SHOCKFRONT is worth something to a light body ------------------
    /*
     * It was worth nothing to eight of the fourteen types: applyBlast never
     * set `thrown`, so `integrate` clamped every light body to `cruise * 6`
     * and the extra impulse was thrown away by the cap. A MOTE took 24% of
     * PULSE's rated shove and both levels of the node moved it not at all.
     */
    /*
     * Measured as SPEED, not distance. With the cap lifted a MOTE is now
     * thrown 447 units off the mount and leaves the arena either way, so
     * distance saturates and reads 447 against 433 -- the field's edge, not
     * the upgrade. The cap is a ceiling on velocity and velocity is what has
     * to be watched. Sampled over the first few frames, before drag.
     */
    const speedOf = (buy) => {
      const e = seat('mote', buy);
      if (!e) return null;
      const cap = Math.round((e.cruise || 60) * CFG.physics.maxSpeedFactor);
      press();
      // Raw, on the frame the impulse lands, before `integrate` clamps it --
      // this is what SHOCKFRONT moves. And settled, after the clamp, which is
      // what the body actually travels at.
      const raw = Math.round(Math.hypot(e.vx, e.vy));
      g.update(1 / 60);
      const held = Math.round(Math.hypot(e.vx, e.vy));
      return { raw, held, cap, thrown: e.thrown > 0 };
    };
    out.plain = speedOf(false);
    out.bought = speedOf(true);

    // ---- and it collects what the floor is actually worth ----------------
    /*
     * `absorb` banked the raw energy where `Enemy.destroy` banks
     * `energy * bounty`, so taking a mote in paid the authored number while
     * shooting the same mote paid the tier's compounding on top. Measured
     * before the fix: tier 20 returned 16% of what destroying it paid.
     */
    const income = (tier) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.up = freshUpgrades();
      if (w.director) { w.director.setTier(tier); w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      const host = g.debugSpawn('bulwark', s.x, s.y - 120);
      if (!host) return 0;
      host.staged = false; host.spawnIn = 0;
      host.applyDamage(w, host.hp + 1e6, 0, 0, 0);
      for (let f = 0; f < 20; f++) g.update(1 / 60);
      const drops = w.drops.length;
      const before = w.energy;
      press();
      for (let f = 0; f < 90; f++) g.update(1 / 60);
      return { drops, gained: Math.round(w.energy - before) };
    };
    out.low = income(1);
    out.high = income(20);

    g.debugClearField();
    w.spawnLock = 0;
    w.up = freshUpgrades();
    w.autoFire = false;
    g.restart();
    return out;
  });

  check('PULSE gets the heaviest body off the turret, and the gun cannot stop it',
    r.quiet && r.firing && r.quiet.held && r.firing.held
    && r.quiet.clear > 100 && r.firing.clear > 100 && r.firing.kicked > 1,
    `a BULWARK seated on the mount: quiet, released for ${r.quiet.clear} of 120 `
    + `frames (thrown to ${r.quiet.peak}); under fire with kicked at `
    + `${r.firing.kicked}, released for ${r.firing.clear} (thrown to `
    + `${r.firing.peak}) -- it used to be 0`);

  /*
   * Two things, because the cap has two effects. It USED to hold a MOTE to
   * `cruise * 6` -- 24% of PULSE's rated shove -- so the ability barely moved
   * the commonest body on the field and SHOCKFRONT's +30% bought it nothing
   * at all. A throw now lifts it to `physics.thrownSpeed`, and the impulse
   * itself scales again. The settled speed is still capped, deliberately;
   * what matters is that the ceiling is the throw's and not the body's.
   */
  check('...and a light body is thrown clear of its own speed cap',
    r.plain && r.bought && r.plain.thrown
    && r.plain.held > r.plain.cap
    && r.bought.raw > r.plain.raw * 1.4,
    `a MOTE leaves the mount at ${r.plain.held} u/s against its own cap of `
    + `${r.plain.cap}; the shove itself goes ${r.plain.raw} -> ${r.bought.raw} `
    + `with SHOCKFRONT (x${(r.bought.raw / Math.max(1, r.plain.raw)).toFixed(2)}), `
    + `which the cap used to eat entirely`);

  check('...and it banks what the wreckage is worth, not what it was authored at',
    r.low.gained > 0 && r.high.gained > r.low.gained * 3,
    `the same body's salvage taken in by PULSE: ${r.low.gained} at tier 1 from `
    + `${r.low.drops} motes, ${r.high.gained} at tier 20 from ${r.high.drops} `
    + `(x${(r.high.gained / Math.max(1, r.low.gained)).toFixed(1)}, and the `
    + `tier's own compounding over 19 rungs is x${(1.1 ** 19).toFixed(1)})`);
}

// --- SPINE is worth loading, and SLIVER is what it does to a line -----------
/*
 * SPINE was the weakest thing in the rack that is not a utility round.
 * Measured on a single target against the others: 48.2 damage a second, where
 * BOLT is 90.9, HE 98.2 and SCATTER 135.3. Its whole worth was in a column,
 * and a column is something the field gives you rather than something you can
 * ask for -- so there was no reason to carry it late.
 *
 * 34 a dart from build 218, which is 82 a second on one body, and SLIVER is
 * what the column is worth on top of that.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const { BY_ID, freshUpgrades } = await import('../src/upgrades.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const S = CFG.rounds.spine;
    const base = CFG.shooter.gripFireInterval;
    // `fans` is how many bodies the dart actually gets out the far side of --
    // itself plus its pierce -- capped at the column the probe puts down. Read
    // from config rather than written out, so a change to either moves the
    // expectation with it instead of failing this case.
    const COLUMN = 4;
    const out = { sliverN: S.sliver.n, shatterN: S.shatter.n,
      fans: Math.min(COLUMN, S.pierce + 1) };

    // ---- where it sits in the rack now -----------------------------------
    const dps = (k, d) => d / (base * CFG.rounds[k].rate);
    out.spine = +dps('spine', S.damage).toFixed(1);
    out.bolt = +(CFG.bolt.damage / (base * CFG.rounds.standard.rate)).toFixed(1);

    const def = BY_ID.get('sliver');
    out.placed = NODES.some((n) => n.id === 'sliver');
    out.levels = def ? def.levels : null;
    // Two upgrades called the same thing would be worse than the clash
    // check-build would have caught: SPLINTER is SPALL's, from build 216.
    out.splinterStillSpall = NODES.some((n) => n.id === 'splinter');

    /*
     * ---- what one dart makes, counted at projectiles.push ----------------
     *
     * A dart is fired straight up into a pinned body and every projectile the
     * frame produces is counted, which is the only place a round actually
     * becomes one. Counting damage instead would be counting the body's
     * armour and the pierce ladder as well.
     */
    const fragments = (levels) => {
      g.debugClearField();
      g.restart();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }
      w.up = freshUpgrades();
      for (let i = 0; i < levels; i++) def.apply(w.up, w);
      w.projectiles.length = 0;
      w.round = 'spine';
      /*
       * A COLUMN, not a pair. The first body is what the round comes apart
       * in; the rest are what the fragments have to travel into, and the
       * second level is only visible if a fragment finds something of its
       * own to come apart in. Two bodies 60 units apart overlap at a
       * BULWARK's 45-unit radius, and the fan diverges past them -- so the
       * case read 4 at both levels, which is the answer a build where the
       * second level did nothing would give.
       */
      const held = [];
      for (const at of [190, 300, 410, 520]) {
        const e = g.debugSpawn('bulwark', s.x, s.y - at);
        if (!e) continue;
        e.staged = false; e.spawnIn = 0; e.hp = 1e7; e.maxHp = 1e7; e.invMass = 0;
        held.push({ e, at });
      }
      s.aim = -Math.PI / 2; s.targetAim = s.aim;
      let made = 0;
      const push = w.projectiles.push.bind(w.projectiles);
      w.projectiles.push = (...ps) => { made += ps.length; return push(...ps); };
      s.shoot(w);
      for (let f = 0; f < 40; f++) {
        for (const h of held) { h.e.x = s.x; h.e.y = s.y - h.at; h.e.vx = 0; h.e.vy = 0; }
        g.update(1 / 60);
      }
      w.projectiles.push = push;
      return made;
    };
    out.none = fragments(0);
    out.one = fragments(1);
    out.two = fragments(2);

    /*
     * ---- a fragment must not come apart in the body it was born in -------
     *
     * `fire` puts it at the contact point, which is INSIDE the thing its
     * parent was passing through. Without an `ignore` on it every fragment
     * would hit that same body on the frame it appeared and split again --
     * a cascade off one dart, bounded only by the damage floor.
     */
    g.debugClearField();
    g.restart();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.up = freshUpgrades();
    def.apply(w.up, w); def.apply(w.up, w);
    w.projectiles.length = 0;
    w.round = 'spine';
    const lone = g.debugSpawn('bulwark', s.x, s.y - 200);
    lone.staged = false; lone.spawnIn = 0; lone.hp = 1e7; lone.maxHp = 1e7; lone.invMass = 0;
    s.aim = -Math.PI / 2; s.targetAim = s.aim;
    let peak = 0;
    s.shoot(w);
    for (let f = 0; f < 60; f++) {
      lone.x = s.x; lone.y = s.y - 200; lone.vx = 0; lone.vy = 0;
      g.update(1 / 60);
      peak = Math.max(peak, w.projectiles.length);
    }
    out.loneePeak = peak;

    g.debugClearField();
    w.spawnLock = 0;
    w.up = freshUpgrades();
    w.round = 'standard';
    g.restart();
    return out;
  });

  check('SPINE is worth carrying against one body, not only against a line',
    r.spine > r.bolt * 0.8 && r.spine < r.bolt * 1.1,
    `${r.spine} damage a second on a single target against BOLT's ${r.bolt} `
    + `(it was 48.2, the weakest thing in the rack that is not a utility round)`);

  check('SLIVER is in the tree at two levels, beside SPALL-s own SPLINTER',
    r.placed && r.levels === 2 && r.splinterStillSpall,
    `sliver placed ${r.placed} at ${r.levels} levels; splinter still there `
    + `${r.splinterStillSpall}`);

  /*
   * One dart unbought, one dart plus its arc bought, and the arc's own arcs
   * at the second level. Counted rather than inferred: the second level is
   * multiplicative, so an off-by-one in the budget is the difference between
   * nine fragments and a cascade.
   */
  /*
   * The base fan is UNBOUGHT and is the round's own area effect: one splinter
   * fan out of every body the dart gets through, so the column of four is a
   * dart plus four sprays. What SLIVER adds on top is the cascade -- the round
   * proper coming apart into piercing fragments, once, the budget passing down
   * so the second level is three becoming nine and stopping.
   *
   * Every term is read from config, and the ceiling is asserted as well as the
   * step: the two systems multiply if the splinters are ever allowed to shed
   * splinters of their own, and that is the failure SLIVER already had once.
   */
  const base = 1 + r.fans * r.shatterN;
  check('a SPINE sprays out of every body it gets through, bought or not',
    r.none === base && r.fans > 1,
    `a trigger pull through a column of four made ${r.none} projectiles `
    + `unbought: one dart and ${r.fans} fans of ${r.shatterN}`);

  check('...and SLIVER adds its cascade on top, and only its cascade',
    r.one === base + r.sliverN
    && r.two === base + r.sliverN + r.sliverN * r.sliverN,
    `${r.none} unbought, ${r.one} at one level and ${r.two} at two `
    + `(the ceiling is ${base + r.sliverN + r.sliverN * r.sliverN}; a splinter `
    + `that shed splinters of its own would have no ceiling at all)`);

  /*
   * The cascade this guards against is not hypothetical: a fragment is
   * created at the contact point, INSIDE the body its parent was going
   * through, so without an ignore it hits that body on the frame it appears.
   */
  check('...and a fragment does not come apart in the body it was born in',
    r.loneePeak <= 1 + r.shatterN + r.sliverN + r.sliverN * r.sliverN,
    `a single body took one dart and at most ${r.loneePeak} projectiles were `
    + `ever on the field at once, against a ceiling of `
    + `${1 + r.shatterN + r.sliverN + r.sliverN * r.sliverN}`);
}

// --- NO COOLDOWN means no cooldown, not one use ----------------------------
/*
 * The toggle set the cost to 0, so `s.cd` stayed 0, so `update`'s
 * `if (s.cd <= 0) continue` never reached the line that hands a charge back --
 * and the charge had already been spent. One press each and the whole bar was
 * dead until a restart, which is the exact opposite of what the switch says.
 *
 * It survived because the suite worked AROUND it rather than failing on it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.spawnLock = 1e9;
    if (w.director) { w.director.timer = 1e9; w.director.driftTimer = 1e9; }

    const fires = (free) => {
      g.restart();
      w.phase = 'staging';
      w.debug.noCooldown = free;
      w.effects.length = 0;
      const i = w.abilities.slots.findIndex((x) => x.def.essential);
      let n = 0;
      /*
       * Counted off the CHARGE, not off useAbility's return, which is
       * undefined either way -- a case that read the return would report
       * zero presses on any build and pass or fail for the wrong reason.
       *
       * Ten presses in a row with a frame between them. With the toggle on
       * every one should land; with it off, one should and the rest should
       * be refused by the cooldown.
       */
      const slot = w.abilities.slots[i];
      for (let k = 0; k < 10; k++) {
        w.effects.length = 0;
        g.useAbility(i);
        // Counted off what the press PUT ON THE FIELD. Not off useAbility's
        // return, which is undefined either way; and not off the charge,
        // because the fix hands the charge straight back, so a charge that
        // never drops is the thing working rather than the thing failing.
        if (w.effects.length > 0) n++;
        g.update(1 / 60);
      }
      const left = slot.charges;
      w.debug.noCooldown = false;
      return { n, left };
    };
    const off = fires(false);
    const on = fires(true);

    w.spawnLock = 0;
    g.restart();
    return { off, on };
  });

  check('NO COOLDOWN means no cooldown, and not one use each',
    r.on.n === 10 && r.on.left > 0 && r.off.n === 1,
    `ten presses with the toggle on fired ${r.on.n} times and left `
    + `${r.on.left} charges (it fired once and left 0); with it off, `
    + `${r.off.n}`);
}

// --- the ability audit of build 219 -----------------------------------------
/*
 * Three things the audit found, each of a shape this file already knows.
 *
 * STANDING ORDER is the `u.levels ?? 3` trap for the third time (HOT LOAD,
 * REPULSOR, and now the one node that touches all eight buttons). Asserted as
 * a PRODUCT, exactly as `up.rate` is, so a second cooldown node arriving is
 * caught as surely as this one taking its default back.
 *
 * A blast honouring `spent` is CLAUDE.md's rule -- "anything that decides
 * what may be shot has to honour it" -- and blasts never did, so a PULSE
 * inside a dying boss was hitting the pieces the outro is made of.
 *
 * And HAIL's muzzle: it passed no `form`, so twenty-five pellets each took
 * `fire`'s default two-sparks-and-a-dot and put seventy-five particles on one
 * point -- the blob its own comment claims to have replaced with a wedge,
 * still drawn underneath the wedge.
 */
{
  const r = await page.evaluate(async () => {
    const { fx } = await import('../src/fx.js');
    const { NODE_BY_ID } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};

    // ---- 1. the cooldown ladder, as one number ----
    g.debugGiveEnergy(400000);
    g.debugBuyAll();
    const cooldown = w.up.cooldown;
    const standingLevels = NODE_BY_ID.get('standing').levels;

    // ---- 2. a blast leaves a spent body finished ----
    g.debugClearField();
    const s = w.shooter;
    const e = g.debugSpawn('bulwark', s.x + 60, s.y - 90);
    e.spent = true;
    const before = e.hp;
    const i = w.abilities.slots.findIndex((x) => x.def.essential);
    w.abilities.clearCooldowns();
    g.useAbility(i);
    const spentAfter = { hp: e.hp, dead: !!e.dead, x: e.x, y: e.y };
    // ...and the same body, not spent, is very much hit.
    g.debugClearField();
    const e2 = g.debugSpawn('bulwark', s.x + 60, s.y - 90);
    const before2 = e2.hp;
    w.abilities.clearCooldowns();
    g.useAbility(i);
    const liveAfter = e2.hp;

    // ---- 3. HAIL's muzzle ----
    g.debugClearField();
    const hail = w.abilities.slots.findIndex((x) => x.def.id === 'fan');
    w.abilities.clearCooldowns();
    fx.particles.clear();
    w.projectiles.length = 0;
    g.useAbility(hail);
    const muzzle = fx.particles.active.length;
    const rounds = w.projectiles.length;
    const forms = new Set(w.projectiles.map((p) => p.form));

    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return {
      cooldown, standingLevels,
      before, spentAfter, before2, liveAfter,
      muzzle, rounds, forms: [...forms],
    };
  });
  /*
   * 0.64 -- two levels of 0.8. It was 0.512, half of every clock on the bar,
   * against a row that says "-20%" and neighbours that all name their cap.
   */
  check('the whole cooldown tree is one STANDING ORDER, and it is worth a third',
    r.standingLevels === 2 && Math.abs(r.cooldown - 0.64) < 1e-9,
    `STANDING ORDER x${r.standingLevels}, everything bought leaves every `
    + `cooldown at x${r.cooldown.toFixed(4)}`);
  check('...and a blast leaves a spent body finished, and a live one hit',
    r.spentAfter.hp === r.before && r.spentAfter.dead === false
    && r.liveAfter < r.before2,
    `spent ${r.before} -> ${r.spentAfter.hp} (dead ${r.spentAfter.dead}), `
    + `live ${r.before2} -> ${r.liveAfter}`);
  /*
   * 36 with the form (25 pellets one spark each, plus the 11-particle wedge)
   * against 86 without it. The window is set clear of both rather than on the
   * digit, because the wedge is authored and may be redrawn.
   */
  check('...and HAIL leaves as pellets, not as twenty-five muzzle flashes',
    r.rounds === 25 && r.forms.length === 1 && r.forms[0] === 'pellet'
    && r.muzzle > 20 && r.muzzle < 60,
    `${r.rounds} rounds as ${JSON.stringify(r.forms)}, ${r.muzzle} particles at the barrel`);
}

// --- STASIS holds everything that moves, not most of it ---------------------
/*
 * "Objects freeze. Your shots do not." Three terms moved bodies without ever
 * asking, and all three are the same shape: a path that returns from `drive`
 * ABOVE its `slow` term, or a term applied outside `steer` entirely.
 *
 *  - a SCION's SEED goes through `hunt`, which had no stasis in it at all, so
 *    seeds crossed a stopped field at sixty-five times a held body and
 *    grafted anyway;
 *  - a TOW's `windUp` is called after `drive` and had no stasis term, so the
 *    one thing on the field that can be stopped by pressing a button wound up
 *    and hurled its MASS at the mount through the freeze;
 *  - `edgeEase` runs from `physicsStep`, outside steering, and pushed at its
 *    full 300 u/s^2 -- about 140 u/s at the wall against a held body's 1.8.
 *
 * Measured as SPEED after the freeze has had time to settle, against the same
 * arrangement unfrozen, because a ratio is what the hint promises and an
 * absolute number is a balance figure that will move.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    const run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); };

    // ---- a SEED hunting a host ----
    const seedSpeed = (freeze) => {
      g.debugClearField();
      const host = g.debugSpawn('bulwark', w.width / 2, 300);
      host.staged = false;
      const seed = g.debugSpawn('mote', w.width / 2 - 220, 300);
      seed.staged = false;
      seed.seed = true;
      seed.seedT = 99;
      w.stasis = freeze ? 99 : 0;
      run(30);
      const v = Math.hypot(seed.vx, seed.vy);
      w.stasis = 0;
      return { v, alive: !seed.dead, host: !!host };
    };

    // ---- a TOW winding up ----
    const towWind = (freeze) => {
      g.debugClearField();
      const s = w.shooter;
      const made = g.debugSpawnGroup('tow', 1);
      /*
       * `!e.dead` is load-bearing. `debugClearField` destroys bodies but the
       * list is not swept until the next frame, so without it the second call
       * finds the FIRST call's head -- still in `w.enemies`, still carrying
       * the 0.5s of wind it did unfrozen -- and the case reports the freeze
       * doing nothing on a build where it works.
       */
      const head = w.enemies.find((e) => !e.dead && e.type.id === 'tow' && e.tether);
      if (head) {
        head.staged = false;
        head.x = s.x; head.y = s.y - 200;
        if (head.tether.other) {
          head.tether.other.staged = false;
          head.tether.other.x = s.x - 60; head.tether.other.y = s.y - 200;
        }
      }
      w.stasis = freeze ? 99 : 0;
      run(30);
      const wind = head ? (head.wind || 0) : -1;
      w.stasis = 0;
      return { wind, made: made ? made.length : 0 };
    };

    // ---- a body resting against the wall ----
    const wallSpeed = (freeze) => {
      g.debugClearField();
      const e = g.debugSpawn('mote', 6, 320);
      e.staged = false;
      e.vx = 0; e.vy = 0;
      w.stasis = freeze ? 99 : 0;
      run(30);
      const v = Math.abs(e.vx);
      w.stasis = 0;
      return v;
    };

    const out = {
      seedFree: seedSpeed(false), seedHeld: seedSpeed(true),
      towFree: towWind(false), towHeld: towWind(true),
      wallFree: wallSpeed(false), wallHeld: wallSpeed(true),
    };
    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return out;
  });
  check('a STASIS holds a SEED, which went through hunt and was never asked',
    r.seedFree.v > 15 && r.seedHeld.v < r.seedFree.v * 0.25,
    `seed ${r.seedFree.v.toFixed(1)} u/s free, ${r.seedHeld.v.toFixed(1)} held`);
  check('...and it stops a TOW winding up, the way it already stopped a lurch',
    r.towFree.wind > 0.2 && r.towHeld.wind === 0 && r.towFree.made === 2,
    `wind ${r.towFree.wind.toFixed(2)}s free, ${r.towHeld.wind.toFixed(2)}s held`);
  check('...and the wall stops shoving, which it did at full strength',
    r.wallFree > 20 && r.wallHeld < r.wallFree * 0.25,
    `at the wall ${r.wallFree.toFixed(1)} u/s free, ${r.wallHeld.toFixed(1)} held`);
}

// --- what the audit found in WARD and DECOY ---------------------------------
/*
 * Two more of the same family, and both are "the picture is not the thing"
 * turned inward -- the code disagreeing with the sentence beside it.
 *
 * WARD's surface tests a CROSSING, but `rr` is the radius times `open`, which
 * ramps to nothing over the last third of a second. So the wall swept inward
 * through everything standing in it on the way out and billed the lot: every
 * body inside paid for one WARD twice, 226 damage at two EDGEDs, at the
 * moment the ring had already faded. `config.js` says the opposite in as many
 * words -- "a body that walks through it pays for walking through it rather
 * than for standing near it". The case above this one could not see it: a
 * parked body is inside the ARCS' reach too, so `parked > 0` was true either
 * way. Cuts are told from arcs by size (62 against 46).
 *
 * And a DECOY was fooling the energy. The steering override had no `isDrop`
 * guard where both its neighbouring branches do, and a mote steers at 132
 * with accel 300 against `collectEnergy`'s 26 u/s^2 -- so pressing it stopped
 * loose energy arriving at all for up to nine seconds.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    const s = w.shooter;
    const P = CFG.ward;

    // ---- WARD: a body that never moves is never cut ----
    const idx = (id) => w.abilities.slots.findIndex((x) => x.def.id === id);
    g.debugClearField();
    const still = g.debugSpawn('mote', s.x, s.y - P.r);
    still.staged = false;
    still.maxHp = 1e7; still.hp = 1e7;
    w.abilities.clearCooldowns();
    g.useAbility(idx('ward'));
    let cuts = 0;
    let arcs = 0;
    let was = still.hp;
    // The whole shell plus its collapse, and the body pinned on the line for
    // every frame of it.
    for (let f = 0; f < 60 * 7; f++) {
      still.x = s.x; still.y = s.y - P.r; still.vx = 0; still.vy = 0;
      g.update(1 / 60);
      const d = was - still.hp;
      if (d > 0) {
        if (Math.abs(d - P.cut) < 6) cuts++;
        else if (Math.abs(d - P.arc.damage) < 6) arcs++;
        was = still.hp;
      }
    }

    // ---- DECOY: the energy is not fooled ----
    g.debugClearField();
    const mote = g.debugSpawn('mote', s.x + 40, s.y - 260);
    mote.staged = false;
    // Made a drop by hand: what matters is the branch, and the branch is
    // `isDrop`. Moved into `w.drops` so nothing else treats it as hostile.
    const drops = w.drops;
    const near = (m) => Math.hypot(m.x - s.x, m.y - s.y);
    const closes = (decoy) => {
      g.debugClearField();
      // Off to the side and well BELOW the decoy, which stands at about
      // s.y - 300: with the bug the mote turns round and climbs to it, so the
      // sign of the change is the whole assertion.
      const e = g.debugSpawn('mote', s.x + 120, s.y - 140);
      e.staged = false;
      e.isDrop = true;
      e.harmless = false;
      w.abilities.clearCooldowns();
      if (decoy) g.useAbility(idx('decoy'));
      const d0 = near(e);
      for (let f = 0; f < 60 * 2; f++) g.update(1 / 60);
      return { d0, d1: near(e), dead: !!e.dead };
    };
    const free = closes(false);
    const fooled = closes(true);

    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return { cuts, arcs, free, fooled, unused: [mote, drops].length };
  });
  check('a WARD cuts a body that walks through it, never one standing still',
    r.cuts === 0 && r.arcs > 0,
    `a body pinned on the line for the whole shell took ${r.cuts} surface `
    + `cuts and ${r.arcs} arcs`);
  check('...and a DECOY does not fool the energy, only the field',
    r.free.d0 - r.free.d1 > 20 && r.fooled.d0 - r.fooled.d1 > 20
    && (r.fooled.d0 - r.fooled.d1) > (r.free.d0 - r.free.d1) * 0.5,
    `a mote closed ${r.free.d0.toFixed(0)} -> ${r.free.d1.toFixed(0)} with no `
    + `decoy, ${r.fooled.d0.toFixed(0)} -> ${r.fooled.d1.toFixed(0)} with one`);
}

// --- the mine layer had the spent/staged rule exactly backwards -------------
/*
 * Build 219 settled the rule for abilities and CLAUDE.md records it: `spent`
 * is a mark for what may be SHOT and every damage path must honour it;
 * `staged` is a mark for what may be CHOSEN and a damage path must NOT, since
 * `config.js` says in as many words that it "never gated projectile
 * collision" and most of a body's march in is on screen.
 *
 * Every one of the six paths in the mine layer had it the other way round --
 * SNARE's grip, LODE's repel, WIRE's cut, the shared patch that SPORE and
 * THORN both use, and the snare's drawn wires all skipped `staged` and none
 * of them skipped `spent`. So a mine burned, cut, hauled and drew the frame
 * of a boss that was already dead, and visibly did nothing to a body walking
 * in over it.
 *
 * Asserted as a differential, both ways, because a guard that refuses
 * everything passes a one-sided test. Shown to read a one, too: with the
 * three `spent` terms taken back out, THORN reports 111 against 111, WIRE
 * 237 against 201 and LODE 181 against 181.
 *
 * SNARE is the exception and is worth knowing about: its arm is closed by the
 * TRIGGER guard rather than by `grip`'s, because a `spent` body cannot spring
 * the mine in the first place. `grip` keeps its own guard for the case the
 * trigger cannot reach -- a body that becomes `spent` while already held,
 * which is a boss dying inside a snare.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    w.autoFire = false;
    w.autoAim = false;

    /*
     * One mine of one kind, landed and armed, with a witness pinned on it for
     * three seconds. `mark` is written onto the witness before the clock
     * starts: 'spent' must be left alone, 'staged' must not.
     */
    const run = (kind, mark) => {
      g.debugClearField();
      w.mines.length = 0;
      w.effects.length = 0;
      g.debugThrowMine(kind);
      const m = w.mines[w.mines.length - 1];
      for (let f = 0; f < 100; f++) g.update(1 / 60);
      if (!m) return { kind, mark, error: 'no mine' };
      const e = g.debugSpawn('lurcher', m.x, m.y - 6);
      if (!e) return { kind, mark, error: 'no witness' };
      e.staged = false;
      e.maxHp = 1e9;
      e.hp = 1e9;
      if (mark) e[mark] = true;
      const startHp = e.hp;
      let moved = 0;
      let px = e.x;
      let py = e.y;
      for (let f = 0; f < 60 * 3; f++) {
        // Pinned, healed and re-marked every frame: the question is whether
        // the mine acts on it at all, not whether it survives.
        e.hp = Math.min(e.hp, 1e9);
        if (mark) e[mark] = true;
        e.dead = false;
        /*
         * ...and its own legs taken away, which the first version of this
         * case forgot. A LURCHER walks 76 to 136 units in three seconds
         * under its own steering, which is far more than LODE's push, so the
         * case was measuring the witness and not the mine and reported a
         * `spent` body being pushed HARDER. `cruise` 0 makes `drive` steer
         * toward a standstill, so every unit of travel left is the mine's.
         */
        e.cruise = 0;
        e.accel = 400;
        g.update(1 / 60);
        moved += Math.hypot(e.x - px, e.y - py);
        px = e.x;
        py = e.y;
      }
      return { kind, mark, took: Math.round(startHp - e.hp), moved: Math.round(moved) };
    };

    /*
     * The two FIELD mines are measured differently, because a witness with
     * legs drowns them. LODE's push and SNARE's haul are per-frame writes to
     * velocity, so: pin the body where the field is strongest, zero its
     * velocity every frame, set `thrown` so `drive` returns before it can
     * steer, and sum the speed each frame leaves behind. What is left is the
     * field and nothing else. The first version let the body walk and
     * reported a `spent` body being pushed HARDER than a live one, which was
     * a LURCHER's own legs at 76 to 136 units against a shove of a few.
     */
    const field = (kind, mark) => {
      g.debugClearField();
      w.mines.length = 0;
      w.effects.length = 0;
      g.debugThrowMine(kind);
      const m = w.mines[w.mines.length - 1];
      for (let f = 0; f < 100; f++) g.update(1 / 60);
      if (!m) return { kind, mark, push: -1 };
      /*
       * Put it in the middle once it has landed. `landingSite` picks at
       * random, and the arena's own `edgeEase` pushes 300 u/s^2 through a
       * 96-unit band at each side -- so a mine that happened to land near a
       * wall added a shove of its own to the measurement and the LODE arm
       * swung 97 to 181 run to run on where the site fell.
       */
      m.x = w.width / 2;
      m.y = w.floorY - 320;
      m.x1 = m.x;
      m.y1 = m.y;
      const e = g.debugSpawn('lurcher', m.x + 30, m.y);
      if (!e) return { kind, mark, push: -1 };
      e.staged = false;
      e.maxHp = 1e9;
      e.hp = 1e9;
      let push = 0;
      for (let f = 0; f < 60 * 2; f++) {
        e.x = m.x + 30;
        e.y = m.y;
        e.vx = 0;
        e.vy = 0;
        e.hp = 1e9;
        e.dead = false;
        e.thrown = 1;          // `drive` returns before it can steer
        if (mark) e[mark] = true;
        g.update(1 / 60);
        push += Math.hypot(e.vx, e.vy);
      }
      return { kind, mark, push: Math.round(push) };
    };

    const out = {};
    for (const kind of ['thorn', 'wire']) {
      out[kind] = {
        clean: run(kind, null),
        spent: run(kind, 'spent'),
        staged: run(kind, 'staged'),
      };
    }
    for (const kind of ['lode', 'snare']) {
      out[kind] = {
        clean: field(kind, null),
        spent: field(kind, 'spent'),
        staged: field(kind, 'staged'),
      };
    }
    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return out;
  });

  // THORN and WIRE do damage; LODE and SNARE move things. Each is measured on
  // the quantity it actually produces.
  const hurt = (o) => o.took;
  const shove = (o) => o.moved;
  const cases = [
    ['a THORN patch', 'thorn', hurt],
    ['a WIRE', 'wire', hurt],
  ];
  for (const [name, kind, of] of cases) {
    const o = r[kind];
    check(`${name} leaves a spent body finished, and still takes one arriving`,
      of(o.clean) > 0 && of(o.spent) === 0 && of(o.staged) > 0,
      `unmarked ${of(o.clean)}, spent ${of(o.spent)}, staged ${of(o.staged)}`);
  }
  for (const [name, kind] of [['a LODE pushes', 'lode'], ['a SNARE hauls', 'snare']]) {
    const o = r[kind];
    check(`...and ${name} what is arriving and not what is spent`,
      o.clean.push > 0 && o.staged.push > 0 && o.spent.push === 0,
      `two seconds of field: unmarked ${o.clean.push}, spent ${o.spent.push}, `
      + `staged ${o.staged.push}`);
  }
}

// --- three more nodes the tree was selling three times ----------------------
/*
 * The `u.levels ?? 3` trap for the fourth, fifth and sixth time. What makes
 * these three different from the percentage ladders around them is that each
 * is named after the number it is supposed to produce, and two of them are
 * contradicted by a comment in config.js:
 *
 *   FIFTH LINK   ARC's base is 4 jumps; the fifth is one more. It made seven.
 *   FOURTH BELL  `CFG.knell.tolls` says "buys the third back and a fourth
 *                beyond it" -- two levels from a base of two. It rang five.
 *   PAIRED CHARGE  the mine cap is 5 and its comment calls it a contract
 *                nothing may move; at four a throw the cap evicted what the
 *                player had just paid for.
 *
 * Asserted on the RESULT each node produces, not on its \`levels\`, so a
 * change to the base number is caught as well as a change to the cap.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { NODE_BY_ID } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    g.debugGiveEnergy(500000);
    g.debugBuyAll();

    // ...and what a fully bought salvo actually leaves standing, which is the
    // question the cap answers. Two throws, because one cannot reach the cap.
    const live = () => w.mines.filter((m) => !m.dead).length;
    g.debugClearField();
    w.mines.length = 0;
    const salvo = 1 + w.up.mineSalvo;
    for (let i = 0; i < salvo; i++) g.debugThrowMine('blast');
    for (let f = 0; f < 120; f++) g.update(1 / 60);
    const afterOne = live();
    for (let i = 0; i < salvo; i++) g.debugThrowMine('blast');
    const afterTwo = live();
    const laid = w.mines.length;

    const out = {
      levels: {
        fifthlink: NODE_BY_ID.get('fifthlink').levels,
        fourthbell: NODE_BY_ID.get('fourthbell').levels,
        paired: NODE_BY_ID.get('paired').levels,
      },
      jumps: CFG.rounds.arc.jumps + w.up.arcJumps,
      tolls: CFG.knell.tolls + w.up.mineTolls,
      salvo, afterOne, afterTwo, laid, cap: CFG.mines.cap,
    };
    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return out;
  });
  check('a fully bought ARC makes five jumps, which is what FIFTH LINK is named for',
    r.levels.fifthlink === 1 && r.jumps === 5,
    `FIFTH LINK x${r.levels.fifthlink}, ARC jumps ${r.jumps}`);
  check('...and a fully bought KNELL rings four times, which is what the config says',
    r.levels.fourthbell === 2 && r.tolls === 4,
    `FOURTH BELL x${r.levels.fourthbell}, tolls ${r.tolls}`);
  check('...and a fully bought salvo does not lay more than the cap can hold',
    r.levels.paired === 1 && r.salvo === 2
    && r.afterOne === 2 && r.afterTwo === 4 && r.afterTwo === r.laid,
    `PAIRED CHARGE x${r.levels.paired} lays ${r.salvo} a throw; one throw `
    + `leaves ${r.afterOne} standing, two leave ${r.afterTwo} of ${r.laid} `
    + `laid against a cap of ${r.cap}`);
}

// --- the arsenal's numbers are the config's numbers -------------------------
/*
 * Six of the seventeen `dmg` strings in arsenal.js had gone stale. Build 216
 * put a tenth on every mine that does damage and build 218 took SPINE from 20
 * to 34, and neither pass came back to the table -- so the loadout sheet, the
 * quick strip and the first-use caption were all quoting BLAST at 95 against
 * 105, WIRE 72 against 79, KNELL 74 against 81, THORN 34 against 37, SPALL's
 * pellet 26 against 29 and SPINE 20 against 34.
 *
 * Every number in the row is pulled out of the string and checked, rather
 * than the string being compared whole, so the prose is still free to change.
 * A row that has no number in it (SNARE, LODE, VOID, the two AUTO controls)
 * is required to have none.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { ARSENAL } = await import('../src/arsenal.js');
    // What each row's numbers must be, in the order they appear in the string.
    const want = {
      blast: [CFG.mines.blast.damage],
      snare: [],
      wire: [CFG.wire.damage],
      knell: [CFG.knell.blast.damage],
      thorn: [CFG.thorn.patch.dps],
      lode: [],
      spall: [CFG.spall.damage, CFG.spall.pellets],
      void: [],
      standard: [CFG.bolt.damage],
      explosive: [CFG.rounds.explosive.damage, CFG.rounds.explosive.blast.damage],
      shotgun: [CFG.rounds.shotgun.damage, CFG.rounds.shotgun.pellets],
      arc: [CFG.rounds.arc.damage, CFG.rounds.arc.jumpDamage],
      spine: [CFG.rounds.spine.damage],
      slug: [CFG.rounds.slug.damage],
      rime: [CFG.rounds.rime.damage],
      spore: [CFG.rounds.spore.damage, CFG.rounds.spore.patch.dps],
      tithe: [CFG.rounds.tithe.damage],
    };
    const bad = [];
    const seen = [];
    for (const a of ARSENAL) {
      if (!(a.key in want)) continue;
      seen.push(a.key);
      const got = (a.dmg || '').match(/\d+(?:\.\d+)?/g);
      const nums = got ? got.map(Number) : [];
      const exp = want[a.key];
      if (nums.length !== exp.length || nums.some((n, i) => n !== exp[i])) {
        bad.push(`${a.key}: "${a.dmg}" has [${nums}], config says [${exp}]`);
      }
    }
    /*
     * ...and the `fx` sentences that quote a count or a duration, which is the
     * other half of the same drift. Only the ones that name a number.
     */
    const byKey = Object.fromEntries(ARSENAL.map((a) => [a.key, a]));
    const prose = [];
    const says = (key, n) => {
      const t = byKey[key] ? byKey[key].fx : '';
      if (!t.includes(String(n))) prose.push(`${key}: "${t}" does not say ${n}`);
    };
    says('snare', CFG.snare.hold);
    says('arc', CFG.rounds.arc.jumps);
    says('spine', CFG.rounds.spine.pierce);
    says('rime', CFG.rounds.rime.chill);
    says('spore', CFG.rounds.spore.patch.life);
    return { bad, prose, seen: seen.length, of: Object.keys(want).length };
  });
  check('every number the arsenal quotes is the number config actually holds',
    r.bad.length === 0 && r.seen === r.of,
    r.bad.length ? r.bad.join('; ') : `${r.seen}/${r.of} rows checked`);
  check('...and the sentences beside them still describe the same machine',
    r.prose.length === 0, r.prose.join('; ') || 'five counted sentences agree');
}

// --- ARC's chain takes the damage line, which it never had ------------------
/*
 * `up.damage` is applied at `fire` time, to the round's own damage. ARC's
 * dart therefore scaled with HOLLOWPOINT and its four jumps did not -- and
 * the jumps are most of the round: 11 on the dart against 25 x (1 + 0.86 +
 * 0.86^2 + 0.86^3) = 84 down the chain, so 88% of it was immune to the whole
 * AMMO damage line. Measured against five bodies in a row, a fully bought
 * turret went 95 dps to 217 where every other round in the rack multiplies
 * by three or more; with the chain scaled it is 510, and the ladder x2.28
 * becomes x5.37 against BOLT's x4.74.
 *
 * Asserted as the chain's SHARE of the round -- chained damage over struck
 * damage -- which is `jumpDamage / damage` and must not move when the damage
 * line is bought, because both terms take it. Without the fix the share
 * collapses from 2.27 to 0.67. A dimensionless ratio is used rather than a
 * factor of `up.damage` because the bought run also holds LONG LEAD and
 * FIFTH LINK, which buy REACH and an extra jump: those add real damage and
 * would push a raw ratio past any honest tolerance.
 *
 * Two bodies, not five, for the same reason -- one jump either way, so the
 * geometry is identical in both runs and only the arithmetic differs.
 *
 * Note the instrument twice over: a chain round measured against ONE body has
 * its whole mechanism switched off, and the first version of this bench read
 * ARC as the weakest round in the game because of it.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const bench = (bought) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      if (bought) { g.debugGiveEnergy(500000); g.debugBuyAll(); }
      g.toggleRound('arc');
      const s = w.shooter;
      const roster = [];
      for (let i = 0; i < 2; i++) {
        const e = g.debugSpawn('bulwark', s.x + i * 150, s.y - 300);
        if (!e) continue;
        e.staged = false;
        e.invMass = 0;
        e.maxHp = 1e9;
        e.hp = 1e9;
        roster.push({ e, x: e.x, y: e.y });
      }
      w.autoAim = false;
      w.autoFire = true;
      s.aim = -Math.PI / 2;
      s.targetAim = -Math.PI / 2;
      let rounds = 0;
      const push = w.projectiles.push.bind(w.projectiles);
      w.projectiles.push = (...ps) => { rounds += ps.length; return push(...ps); };
      for (let f = 0; f < 60 * 5; f++) {
        for (const q of roster) { q.e.x = q.x; q.e.y = q.y; q.e.vx = 0; q.e.vy = 0; }
        s.aim = -Math.PI / 2;
        s.targetAim = -Math.PI / 2;
        g.update(1 / 60);
      }
      w.projectiles.push = push;
      // The first body is the one the barrel points at; the second can only
      // have been reached by the chain.
      const struck = 1e9 - roster[0].e.hp;
      const chained = 1e9 - roster[1].e.hp;
      return { rounds, struck, chained, share: struck > 0 ? chained / struck : 0 };
    };
    const bare = bench(false);
    const full = bench(true);
    const line = w.up.damage;
    g.restart();
    return {
      bare, full, line,
      want: CFG.rounds.arc.jumpDamage / CFG.rounds.arc.damage,
    };
  });
  check('ARC-s chain takes the AMMO damage line, which it never had',
    r.bare.chained > 0 && r.full.chained > 0
    && Math.abs(r.bare.share - r.want) < r.want * 0.1
    && Math.abs(r.full.share - r.want) < r.want * 0.1,
    `the chain is ${r.bare.share.toFixed(2)}x the struck body bare and `
    + `${r.full.share.toFixed(2)}x with the whole damage line bought; `
    + `jumpDamage/damage is ${r.want.toFixed(2)} and up.damage is ${r.line}`);
}

// --- a THORN and a LODE come off the field when they are done ---------------
/*
 * The two kinds whose branch in `updateMines` ended on a `continue`. The only
 * thing past that `continue` is the splice that takes a dead mine off
 * `world.mines` -- so THORN and LODE were the only two kinds that never left
 * it. They stayed in the list, were re-entered every frame with `life` already
 * past zero, and called `fizzle` again on every one of them.
 *
 * `fizzle` is what SALTED turns into a blast. So a THORN that expired thirty
 * seconds ago was landing a blast, a ring, a Shock, sixteen sparks and an
 * `audio.boom()` SIXTY TIMES A SECOND, for the rest of the run, once per
 * expired mine -- and the list it was doing it from grew for ever.
 *
 * Measured both ways: how many mines the list holds after everything on it has
 * expired, and how many blasts land in the second after that.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const en = await import('../src/enemies.js');
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};

    const run = (kind, salted) => {
      g.debugClearField();
      w.mines.length = 0;
      w.effects.length = 0;
      w.up.mineFizzle = salted;
      g.debugThrowMine(kind);
      const m = w.mines[w.mines.length - 1];
      if (!m) return { kind, salted, error: 'no mine' };
      // Land it, then age it out. `life` is the only clock that matters here.
      for (let f = 0; f < 90; f++) g.update(1 / 60);
      m.life = 0.01;
      for (let f = 0; f < 30; f++) g.update(1 / 60);
      const held = w.mines.length;
      /*
       * Counted at the door every blast comes through, which is the only
       * instrument that can tell "it went off once" from "it is going off
       * every frame". Effects are no good -- the pool recycles.
       */
      let blasts = 0;
      const real = en.applyBlast;
      // ES module exports cannot be reassigned from outside, so the count is
      // taken off what a blast actually does: a fresh Shock per detonation.
      const before = w.effects.filter((x) => x && x.constructor
        && x.constructor.name === 'Shock').length;
      for (let f = 0; f < 60; f++) g.update(1 / 60);
      const after = w.effects.filter((x) => x && x.constructor
        && x.constructor.name === 'Shock').length;
      blasts = after - before;
      return { kind, salted, held, blasts, live: w.mines.filter((x) => !x.dead).length,
        used: typeof real === 'function' };
    };

    const out = {};
    for (const kind of ['thorn', 'lode', 'blast', 'wire']) {
      out[kind] = { plain: run(kind, false), salted: run(kind, true) };
    }
    w.up.mineFizzle = false;
    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return out;
  });
  const kinds = Object.keys(r);
  const stuck = kinds.filter((k) => r[k].plain.held !== 0 || r[k].salted.held !== 0);
  check('every kind of mine comes off the list when it is spent',
    stuck.length === 0,
    kinds.map((k) => `${k} ${r[k].plain.held}/${r[k].salted.held}`).join(' '));
  const noisy = kinds.filter((k) => r[k].salted.blasts > 1);
  check('...and a spent one goes off once, not once a frame',
    noisy.length === 0,
    kinds.map((k) => `${k} ${r[k].salted.blasts} blasts in the second after `
      + `it expired`).join(', '));
}

// --- a TITHE mark is worth the same at every tier ---------------------------
/*
 * It was `e.bounty = Math.max(e.bounty, g.bounty * up.bounty)` -- a FLOOR
 * under the body's own worth rather than a multiplier on it. The floor is
 * what the `Math.max` was for, and the reason is real: eight marks must not
 * compound to 3.5^8.
 *
 * But a body's own bounty is `bountyStep ^ (tier - 1)` = 1.10^(tier - 1),
 * which climbs into the floor and then straight past it -- 1.10^13 = 3.45 at
 * tier 14 -- so from tier 15 an unbought TITHE mark paid EXACTLY NOTHING, on
 * the one round whose whole point is that it pays. A `tithed` flag keeps the
 * once and the multiplier keeps the mark worth 3.5x wherever it lands.
 *
 * Asserted at both ends of the ladder, because the fault is invisible at one
 * of them: at tier 1 the old code and the new agree to the digit.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    g.toggleRound('tithe');
    const T = CFG.rounds.tithe;

    // A body carrying the bounty its tier would have given it, marked once.
    const at = (tier) => {
      g.debugClearField();
      const e = g.debugSpawn('lurcher', w.shooter.x, w.shooter.y - 200);
      if (!e) return null;
      e.staged = false;
      e.bounty = CFG.waves.tier.bountyStep ** (tier - 1);
      const before = e.bounty;
      // Through the round itself, not by hand: the point is what the round
      // does, and marking a body twice must not compound.
      e.hp = 1e9; e.maxHp = 1e9;
      w.autoAim = false; w.autoFire = true;
      w.shooter.aim = -Math.PI / 2; w.shooter.targetAim = -Math.PI / 2;
      for (let f = 0; f < 60 * 3; f++) {
        e.x = w.shooter.x; e.y = w.shooter.y - 200; e.vx = 0; e.vy = 0;
        e.hp = 1e9;
        w.shooter.aim = -Math.PI / 2; w.shooter.targetAim = -Math.PI / 2;
        g.update(1 / 60);
      }
      w.autoFire = false;
      return { tier, before, after: e.bounty, marks: e.marks };
    };
    const low = at(1);
    const high = at(18);
    w.director.update = ran;
    w.spawnLock = 0;
    g.restart();
    return { low, high, want: T.bounty };
  });
  const gain = (o) => (o && o.before > 0 ? o.after / o.before : 0);
  check('a TITHE mark multiplies what a body was worth, at every tier',
    r.low && r.high && r.low.marks > 1 && r.high.marks > 1
    && Math.abs(gain(r.low) - r.want) < 0.01
    && Math.abs(gain(r.high) - r.want) < 0.01,
    `tier 1: ${r.low && r.low.before.toFixed(2)} -> ${r.low && r.low.after.toFixed(2)} `
    + `(x${gain(r.low).toFixed(2)}); tier 18: ${r.high && r.high.before.toFixed(2)} -> `
    + `${r.high && r.high.after.toFixed(2)} (x${gain(r.high).toFixed(2)}); `
    + `the mark is worth x${r.want}`);
}

// --- burning ground takes the damage line, and VOID actually deletes --------
/*
 * `up.damage` is applied to a round's own damage at `fire` time, so anything
 * a round LEAVES BEHIND was outside it. SPORE's own damage is 10 against a
 * patch that does 46 a second for four and a half seconds, so the AMMO line
 * reached about a ninth of the round: measured on a pinned wall, SPORE went
 * 89 dps to 158 with the whole tree bought, a ladder of x1.78 where every
 * other round is x4.7 to x19. THORN's ground had the same hole in it against
 * SHRAPNEL -- x1.28 where BLAST is x3.10 -- and `mineGrade` had been
 * crediting THORN with SHRAPNEL the whole time, so the mine grew a mark and
 * got visibly heavier for an upgrade that touched nothing in it. Third
 * instance of the fault ARC's chain had.
 *
 * And VOID. Its row says "one kill" and "the first thing to touch it is gone,
 * whatever its health", and it did that by sending `hp + 1e6` through
 * `applyDamage` -- which ARMORED intercepts BEFORE the plate and before the
 * ward, because "it is not a reduction, the hit did not happen". So an
 * armoured body walked onto a VOID, spent it, and walked off untouched. No
 * number beats a rule that discards the hit; it goes through `Enemy.destroy`
 * now, which is the door everything else comes through.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const setup = (bought) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      if (bought) { g.debugGiveEnergy(500000); g.debugBuyAll(); }
    };
    const findPatch = () => w.effects.find((x) => x && typeof x.dps === 'number');

    // ---- SPORE's ground ----
    const spore = (bought) => {
      setup(bought);
      g.toggleRound('spore');
      w.effects.length = 0;
      const s = w.shooter;
      const e = g.debugSpawn('bulwark', s.x, s.y - 240);
      if (e) { e.staged = false; e.maxHp = 1e9; e.hp = 1e9; e.invMass = 0; }
      w.autoAim = false; w.autoFire = true;
      s.aim = -Math.PI / 2; s.targetAim = -Math.PI / 2;
      for (let f = 0; f < 90; f++) {
        if (e) { e.x = s.x; e.y = s.y - 240; e.hp = 1e9; }
        s.aim = -Math.PI / 2; s.targetAim = -Math.PI / 2;
        g.update(1 / 60);
        if (findPatch()) break;
      }
      w.autoFire = false;
      const p = findPatch();
      return { dps: p ? p.dps : -1, line: w.up.damage };
    };

    // ---- THORN's ground ----
    const thorn = (bought) => {
      setup(bought);
      w.effects.length = 0;
      w.mines.length = 0;
      g.debugThrowMine('thorn');
      for (let f = 0; f < 120; f++) { g.update(1 / 60); if (findPatch()) break; }
      const p = findPatch();
      return { dps: p ? p.dps : -1, line: w.up.mineDamage };
    };

    // ---- VOID against an armoured body ----
    const voidOn = (armoured) => {
      setup(false);
      w.mines.length = 0;
      g.debugThrowMine('void');
      const m = w.mines[w.mines.length - 1];
      for (let f = 0; f < 120; f++) g.update(1 / 60);
      if (!m) return { armoured, error: 'no mine' };
      const e = g.debugSpawn('lurcher', m.x, m.y);
      if (!e) return { armoured, error: 'no body' };
      e.staged = false;
      e.maxHp = 1e9; e.hp = 1e9;
      if (armoured) {
        e.traits = [{ id: 'armored' }];
        e.plateT = 0;
      }
      for (let f = 0; f < 60; f++) {
        if (!e.dead) { e.x = m.x; e.y = m.y; e.vx = 0; e.vy = 0; }
        g.update(1 / 60);
      }
      return { armoured, gone: !!e.dead, mineSpent: !!m.dead };
    };

    const out = {
      sporeBare: spore(false), sporeFull: spore(true),
      thornBare: thorn(false), thornFull: thorn(true),
      plain: voidOn(false), armoured: voidOn(true),
      base: { spore: CFG.rounds.spore.patch.dps, thorn: CFG.thorn.patch.dps },
    };
    w.spawnLock = 0;
    g.restart();
    return out;
  });
  check('SPORE-s burning ground takes the AMMO damage line',
    r.sporeBare.dps > 0 && r.sporeFull.dps > 0
    && Math.abs(r.sporeFull.dps - r.base.spore * r.sporeFull.line) < 0.01
    && Math.abs(r.sporeBare.dps - r.base.spore) < 0.01,
    `patch dps ${r.sporeBare.dps} bare -> ${r.sporeFull.dps} bought, against `
    + `${r.base.spore} x an up.damage of ${r.sporeFull.line}`);
  check('...and THORN-s takes SHRAPNEL, which mineGrade had been crediting it for',
    r.thornBare.dps > 0 && r.thornFull.dps > 0
    && Math.abs(r.thornFull.dps - r.base.thorn * r.thornFull.line) < 0.01,
    `patch dps ${r.thornBare.dps} bare -> ${r.thornFull.dps} bought, against `
    + `${r.base.thorn} x an up.mineDamage of ${r.thornFull.line}`);
  check('...and a VOID deletes an ARMORED body, which absorbed it whole',
    r.plain.gone === true && r.armoured.gone === true,
    `plain ${JSON.stringify(r.plain)}, armoured ${JSON.stringify(r.armoured)}`);
}

// --- a SLIVER fragment does not come apart in the body it was born in -------
/*
 * The intent is written out at `sliverOn`: "It must not split on the body it
 * was BORN in. `fire` puts it at the contact point, inside the thing the
 * parent was passing through, so without this every fragment would
 * immediately hit that same body and come apart again on the frame it
 * appeared." It was implemented as `ignore: e` -- and that cover is a fixed
 * 0.06 seconds, while the contact point is on the body's NEAR face, so a
 * fragment has a whole diameter to cross before it is clear.
 *
 * Measured on a BULWARK, the game's widest ordinary body: one dart landed
 * three separate hits at SLIVER 1 and up to eight at SLIVER 2, each re-hit
 * spending one of the fragment's pierces inside the body it was already in --
 * and at level 2 the ring and the three grandchildren were drawn at the entry
 * face, most of a body's width behind where the fan was meant to open.
 *
 * The cover is a distance now, per body and per fragment speed. Counted as
 * HITS ON ONE BODY from ONE dart, which is the quantity the comment is about;
 * a bench that counted damage would be confounded by the fan's own spread.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    const ran = w.director.update;
    w.director.update = () => {};
    g.debugGiveEnergy(400000);
    /*
     * SLIVER and its way in, and nothing else that touches the round.
     * `buy` refuses a node whose parents are unowned, so the chain has to be
     * walked -- the first version of this case called `buy('sliver')` three
     * times, got 'locked' three times, and measured a turret with no SLIVER
     * on it at all.
     */
    const { NODE_BY_ID } = await import('../src/tree.js');
    const chain = [];
    for (let n = NODE_BY_ID.get('sliver'); n; n = n.parent) if (n.id) chain.unshift(n.id);
    for (const id of chain) for (let i = 0; i < 4; i++) g.buy(id);
    const bought = [];
    for (let i = 0; i < g.owned('sliver'); i++) bought.push(i);
    g.toggleRound('spine');

    /*
     * One dart, fired by hand at a body pinned square in front of the barrel,
     * with the hit counted on the body itself. `applyDamage` is the door every
     * hit comes through, so it is wrapped rather than inferred from health --
     * a fragment's damage varies with its generation and would not count.
     */
    const s = w.shooter;
    const e = g.debugSpawn('bulwark', s.x, s.y - 300);
    if (!e) return { error: 'no body' };
    e.staged = false;
    e.invMass = 0;
    e.maxHp = 1e9;
    e.hp = 1e9;
    let hits = 0;
    const real = e.applyDamage.bind(e);
    e.applyDamage = (...a) => { hits++; return real(...a); };

    w.autoAim = false;
    w.autoFire = false;
    s.aim = -Math.PI / 2;
    s.targetAim = -Math.PI / 2;
    w.projectiles.length = 0;
    s.shoot(w);
    const fired = w.projectiles.length;
    for (let f = 0; f < 60; f++) {
      e.x = s.x; e.y = s.y - 300; e.vx = 0; e.vy = 0; e.hp = 1e9;
      g.update(1 / 60);
    }
    e.applyDamage = real;

    w.director.update = ran;
    w.spawnLock = 0;
    const levels = bought.length;
    g.restart();
    return { hits, fired, levels, r: e.r };
  });
  /*
   * The dart itself, plus at most the fan members whose own path really does
   * cross the body. Eight was the measured worst case before the fix, and
   * three the measured best; the window is set clear of both rather than on
   * either.
   */
  check('a SLIVER fragment does not come apart in the body it was born in',
    !r.error && r.levels === 2 && r.fired >= 1 && r.hits >= 1 && r.hits <= 2,
    `one dart at SLIVER x${r.levels} landed ${r.hits} hits on a ${r.r}-unit `
    + `body (${r.fired} round(s) left the barrel)`);
}

// --- a split child is a body of its tier, like every other body --------------
/*
 * `spawnOne` carried the tier's health and bounty under a comment calling it
 * "the one place every hostile enters the world". It was not: a SPLITTER's
 * children and a WARDEN's are made with `new Enemy` at the point the parent
 * came apart, and `world.enemies.push`ed directly. So most of a splitting
 * type's mass entered at TIER 1 rates however deep the run was -- a soft
 * target that paid tier-1 energy, sitting beside an identical body that had
 * arrived on its own with 8.6x the health.
 *
 * A SCION's seeds go the same way and are correctly untouched: they are
 * `harmless`, which is the arm that keeps grey grey, and the multiplier has
 * always skipped it.
 *
 * Asserted as the RATIO between a child at tier 1 and the same child deep,
 * which must be `scaleAt(tier)` itself -- an assertion that cannot be
 * satisfied by the children merely getting bigger for some other reason.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const en = await import('../src/enemies.js');
    const { TYPE_BY_ID } = await import('../src/config.js');
    // The splitting types, found rather than named, so a new one is covered.
    const parent = Object.values(TYPE_BY_ID).find((t) => t.splits);

    const at = (tier) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      const d = w.director;
      d.update = () => {};
      // `setTier` is the machinery's setter and unlocks as it goes; `reach`
      // is the player's and clamps. This is machinery.
      d.setTier(tier);
      d.wave = null;      // a teach wave is exempt by design
      d.traits = [];
      g.debugClearField();
      const p = g.debugSpawn(parent.id, w.width / 2, 300);
      if (!p) return null;
      p.staged = false;
      const before = w.enemies.length;
      p.destroy(w);
      const kids = w.enemies.filter((e) => !e.dead && e !== p && e.type.id === parent.splits.type);
      const k = d.scaleAt(d.tier);
      /*
       * Averaged over the whole brood. A child's BASE health is drawn per
       * body -- measured, four MOTEs came out at 29, 33, 31 and 33 against a
       * type base of 31 -- so a single sample, and even a mean of four, moves
       * the health ratio several percent run to run on a build where the
       * arithmetic is exactly right. The health half of this case is
       * therefore a sanity bound and the BOUNTY half is the exact one:
       * bounty has no variance at all (1 at tier 1, exactly `k.bounty`
       * deep), so it is the term that can be asserted to the digit.
       */
      const mean = (f) => (kids.length ? kids.reduce((n, e) => n + f(e), 0) / kids.length : 0);
      return {
        tier: d.tier, kids: kids.length, before,
        hp: mean((e) => e.maxHp),
        bounty: mean((e) => e.bounty),
        want: k,
      };
    };
    const low = at(1);
    const high = at(14);
    w.spawnLock = 0;
    g.restart();
    return { low, high, parent: parent && parent.id, child: parent && parent.splits.type };
  });
  const ok = r.low && r.high && r.low.kids > 0 && r.high.kids > 0
    // Exact: bounty carries no per-body variance.
    && Math.abs(r.low.bounty - r.low.want.bounty) < 1e-6
    && Math.abs(r.high.bounty - r.high.want.bounty) < 1e-6
    // ...and health scaled by something like the ladder rather than by 1.
    && r.high.hp > r.low.hp * (r.high.want.hp / r.low.want.hp) * 0.85
    && r.high.hp < r.low.hp * (r.high.want.hp / r.low.want.hp) * 1.15;
  check('a split child is a body of its tier, like every other body', ok,
    `${r.parent} -> ${r.child}: at tier ${r.low && r.low.tier} a child has `
    + `${r.low && Math.round(r.low.hp)}hp and pays x${r.low && r.low.bounty.toFixed(2)}; `
    + `at tier ${r.high && r.high.tier}, ${r.high && Math.round(r.high.hp)}hp and `
    + `x${r.high && r.high.bounty.toFixed(2)} — the ladder says `
    + `x${r.high && (r.high.want.hp / r.low.want.hp).toFixed(2)} and `
    + `x${r.high && (r.high.want.bounty / r.low.want.bounty).toFixed(2)}`);
}

// --- continuous damage does not change with the refresh rate ----------------
/*
 * `applyDamage` floors every hit at `Math.max(1, dmg * (1 - plate) * (1 -
 * ward))`, and `Patch` has said in its own docstring since it was written
 * that this is why it ticks four times a second rather than every frame.
 * Two other continuous sources did not: WIRE's cut and HARD CASING.
 *
 * At 79 a second a wire's per-frame bite is 79/60 = 1.32, which floors on
 * anything with armour over 0.24 -- BULWARK took 60/s against a rated 52 --
 * and at 120Hz it is 0.66, floored on EVERYTHING: 120 a second against a
 * rated 79, with armour ignored entirely. HARD CASING at 70 a level was the
 * same shape. The rated number in the arsenal was right for one refresh rate
 * and half the roster.
 *
 * WIRE's SHOVE was worse and ran the other way. A per-frame impulse pays the
 * repeated-hit fade once per frame, so `kicked` reached 9.7 after a second of
 * contact where sustained gunfire settles at 4.25 -- the wire delivered 17%
 * of its nominal push, delivered 1.9x more of it at 30Hz than at 120Hz, and
 * then scaled down every later shove on that body, rounds and mine blasts
 * alike, for up to twenty seconds.
 *
 * Measured the only way that settles it: the same wall-clock second, stepped
 * at two different rates, against a body that cannot die.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;

    const { NODE_BY_ID } = await import('../src/tree.js');
    const casingChain = [];
    for (let n = NODE_BY_ID.get('casing'); n; n = n.parent) if (n.id) casingChain.unshift(n.id);

    const overSecond = (step, arm) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.autoAim = false;
      w.autoFire = false;
      const s = w.shooter;
      const out = arm(s);
      const e = out.body;
      e.hp = 1e9;
      e.maxHp = 1e9;
      /*
       * Read off HEALTH, and the body is given enough of it to survive the
       * window rather than being healed inside it. Two earlier versions of
       * this got it wrong in opposite directions: one healed to full every
       * frame and measured `start - hp`, which is zero by construction; the
       * other summed the `dmg` ARGUMENT at the door, which is `79 * dt` and
       * therefore rate-independent whatever the code does -- the floor that
       * is the whole subject of this case is applied inside `applyDamage`,
       * after the argument.
       */
      const start = e.hp;
      const n = Math.round(1 / step);
      for (let f = 0; f < n; f++) {
        out.hold();
        g.update(step);
      }
      return { took: start - e.hp, kicked: +(e.kicked || 0).toFixed(2) };
    };

    // ---- WIRE: a body pinned on the line ----
    const wire = (step) => overSecond(step, (s) => {
      w.mines.length = 0;
      g.debugThrowMine('wire');
      const m = w.mines[w.mines.length - 1];
      for (let f = 0; f < 120; f++) g.update(1 / 60);
      const e = g.debugSpawn('bulwark', m.x1, m.ay);
      e.staged = false;
      e.invMass = 0;
      return { body: e, hold: () => { e.x = m.x1; e.y = m.ay; } };
    });

    // ---- HARD CASING: a body held on the turret ----
    const casing = (step) => overSecond(step, (s) => {
      g.debugGiveEnergy(300000);
      /*
       * Its way in, and then ONE level of SPINES.
       *
       * The chain matters because `buy` refuses a node whose parents are
       * unowned, and a silent 'locked' would leave `up.casing` at 0 with the
       * case measuring nothing and reporting a pass. The single level matters
       * because the floor this case is about only binds on small bites: at
       * three levels `up.casing` is 210, which is 3.5 a frame at 60Hz and
       * 1.75 at 120Hz, both clear of `Math.max(1, ...)` even through a
       * BULWARK's armour -- so a fully bought turret cannot see the fault at
       * all. One level is 70, which is 1.17 and 0.58.
       */
      for (const id of casingChain) {
        if (id === 'casing') { g.buy(id); break; }
        for (let i = 0; i < 4; i++) g.buy(id);
      }
      const e = g.debugSpawn('bulwark', s.x, s.y - 10);
      e.staged = false;
      e.invMass = 0;
      return {
        body: e,
        hold: () => {
          e.x = s.x; e.y = s.y - 10;
          e.attacking = true;
          w.attackers.add(e);
        },
      };
    });

    const out = {
      wire60: wire(1 / 60), wire120: wire(1 / 120),
      casing60: casing(1 / 60), casing120: casing(1 / 120),
      casingOwned: w.up.casing,
    };
    w.spawnLock = 0;
    g.restart();
    return out;
  });
  const near = (a, b, tol) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(a, b) * tol;
  check('a WIRE cuts the same in a second however fast the frames come',
    near(r.wire60.took, r.wire120.took, 0.28),
    `${Math.round(r.wire60.took)} at 60Hz against ${Math.round(r.wire120.took)} at 120Hz`);
  check('...and does not pin the body-s knockback while doing it',
    r.wire60.kicked < 6 && r.wire120.kicked < 6,
    `kicked reached ${r.wire60.kicked} at 60Hz and ${r.wire120.kicked} at 120Hz, `
    + `against the 4.25 sustained gunfire settles at`);
  check('...and HARD CASING bites the same, which had the same fault',
    r.casingOwned > 0 && near(r.casing60.took, r.casing120.took, 0.28),
    `${Math.round(r.casing60.took)} at 60Hz against ${Math.round(r.casing120.took)} `
    + `at 120Hz, on a turret carrying ${r.casingOwned} a second of casing`);
}

// --- every glossary icon sits inside its frame ------------------------------
/*
 * The cells are identical 36px squares and every specimen was drawn at a flat
 * `w * 0.34`, which assumes the shapes are the same size as each other. They
 * are not: measured across the whole glossary, NEEDLE and TOW reached the
 * frame's edge exactly -- clipped, in a bordered tile -- WARDEN used 0.94 of
 * it and TALLY 0.89, while ECHO used 0.61 and BULWARK 0.67. A 1.63x spread,
 * with the biggest ones touching their own border.
 *
 * `specimenScale` measures each shape's true half-extent once and caches the
 * correction, so a shape added later fits itself. Asserted on the RENDERED
 * PIXELS of the real cells rather than on the scale factor, because the
 * factor being right is not the claim -- the claim is that nothing touches
 * the edge.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { codex } = await import('../src/codex.js');
    const { ENEMY_TYPES } = await import('../src/config.js');
    for (const t of ENEMY_TYPES) codex.record(t.id);
    for (const id of ['ordinal', 'gnomon', 'fractal', 'amplitude', 'dynamo', 'parity',
      'terminus', 'digit', 'dial', 'fraction', 'crest', 'pylon', 'pane', 'bound',
      'tally', 'ion', 'plate', 'second', 'limit', 'echo', 'droplet', 'towMass', 'seed']) {
      try { codex.record(id); } catch (_) { /* not every id is a codex entry */ }
    }
    g.hud.menu.setOpen(true);
    g.hud.menu.show('codex');
    const rows = [];
    for (const c of document.querySelectorAll('.codexArt canvas')) {
      if (!c.dataset.drawn) continue;
      const W = c.width;
      const d = c.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, W, W).data;
      const half = W / 2;
      let reach = 0;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] <= 8) continue;
          reach = Math.max(reach, half - x, x + 1 - half, half - y, y + 1 - half);
        }
      }
      const name = c.closest('.codexCell').querySelector('.codexName').textContent;
      if (reach > 0) rows.push({ name, fill: +(reach / half).toFixed(3) });
    }
    g.hud.menu.setOpen(false);
    return rows;
  });
  r.sort((a, b) => b.fill - a.fill);
  const big = r.filter((x) => x.fill > 0.93);
  const small = r.filter((x) => x.fill < 0.6);
  check('every glossary icon is centred in its frame and touches no edge',
    r.length > 30 && big.length === 0 && small.length === 0,
    `${r.length} drawn, ${r.length ? `widest ${r[0].name} ${r[0].fill}, ` : ''}`
    + `${r.length ? `narrowest ${r[r.length - 1].name} ${r[r.length - 1].fill}` : ''}`
    + `${big.length ? ` | touching: ${big.map((x) => x.name).join(', ')}` : ''}`
    + `${small.length ? ` | lost in the frame: ${small.map((x) => x.name).join(', ')}` : ''}`);
}

// --- HEAVE, and PILE no longer reading as WARD ------------------------------
/*
 * Two things from build 221.
 *
 * HEAVE is the WARD's fourth node and a switch rather than a dial: the shell
 * throws everything out of it as it comes up, once, on the frame it is made.
 * It lives in the constructor rather than in `update` because "once" has to
 * be once, and a constructor already runs exactly once. `throwOff`, on the
 * rule build 220 settled: a press every eighteen seconds is a deliberate
 * clear and gets both halves of a throw, where SLUG at 1.5 rounds a second
 * gets neither.
 *
 * And PILE. It was a white circle inside a pale-blue circle, both expanding,
 * which is WARD's drawing at a different radius -- and it fires every eight
 * seconds for the whole run, so it was also the most repeated thing on the
 * screen. It is brass now, and a crest with lobes rather than a geometric
 * ring. Asserted on the RENDERED PIXELS, because "looks like" is a claim
 * about what reaches the screen and nothing else settles it.
 */
{
  const r = await page.evaluate(async () => {
    const { Front } = await import('../src/shooter.js');
    const { NODE_BY_ID } = await import('../src/tree.js');
    const g = window.__sim;
    const w = g.world;

    // ---- HEAVE ----
    /*
     * The witness is a LURCHER and NOT a BULWARK, and the first version of
     * this case got that wrong and failed on a working build. A shove is
     * `impulse * invMass`, and BULWARK's invMass is 0.030 against 0.20-2.38
     * for everything else in the game -- an order of magnitude down -- so it
     * measured the one body a shove barely moves and reported 16.5 u/s as a
     * defect. Measured against a fully-bought PULSE on the same body: 24.2.
     * HEAVE was already 68% of the biggest shove in the game and the case
     * said it did nothing. So the ordinary attacker carries the assertion,
     * and the heavy one gets an arm of its own below, asserting the mass
     * dependence rather than pretending it away.
     */
    const heaved = (buy, type = 'lurcher') => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      if (buy) {
        g.debugGiveEnergy(400000);
        const chain = [];
        for (let n = NODE_BY_ID.get('heave'); n; n = n.parent) if (n.id) chain.unshift(n.id);
        for (const id of chain) for (let i = 0; i < 4; i++) g.buy(id);
      }
      const s = w.shooter;
      // Inside the shell, healed each frame, so what moves it is the shove
      // and not its own legs and not its death.
      const e = g.debugSpawn(type, s.x + 70, s.y - 40);
      if (!e) return null;
      e.staged = false;
      e.hp = 1e9;
      e.maxHp = 1e9;
      e.vx = 0;
      e.vy = 0;
      const d0 = Math.hypot(e.x - s.x, e.y - s.y);
      const i = w.abilities.slots.findIndex((x) => x.def.id === 'ward');
      w.abilities.clearCooldowns();
      g.useAbility(i);
      // One frame: the shove lands on the frame the shell is made.
      g.update(1 / 60);
      const v = Math.hypot(e.vx, e.vy);
      for (let f = 0; f < 30; f++) { e.hp = 1e9; g.update(1 / 60); }
      return { owned: !!w.up.wardPush, v: +v.toFixed(1),
        moved: +(Math.hypot(e.x - s.x, e.y - s.y) - d0).toFixed(1) };
    };
    const plain = heaved(false);
    const bought = heaved(true);
    const heavy = heaved(true, 'bulwark');

    // ---- PILE against WARD, as pixels ----
    const W = 420;
    const c = document.createElement('canvas');
    c.width = W; c.height = W;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const lit = () => {
      const d = ctx.getImageData(0, 0, W, W).data;
      let rr = 0, gg = 0, bb = 0, n = 0, peak = 0;
      for (let q = 0; q < d.length; q += 4) {
        const v = Math.max(d[q], d[q + 1], d[q + 2]);
        if (v > peak) peak = v;
        if (v < 30) continue;
        rr += d[q]; gg += d[q + 1]; bb += d[q + 2]; n++;
      }
      return n ? { r: rr / n, g: gg / n, b: bb / n, n, peak } : { r: 0, g: 0, b: 0, n: 0, peak };
    };
    const pile = (cut) => {
      const f = new Front(W / 2, W / 2, 1);
      f.cut = cut;
      f.t = 0.14;
      ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, W);
      f.draw(ctx);
      return lit();
    };
    const quiet = pile(0);
    const struck = pile(3);

    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    const wi = w.abilities.slots.findIndex((x) => x.def.id === 'ward');
    w.abilities.clearCooldowns();
    g.useAbility(wi);
    const shell = w.effects.find((x) => x && x.surges);
    for (let i = 0; i < 30; i++) shell.update(w, 1 / 60);
    const s2 = w.shooter;
    const ox = s2.x, oy = s2.y;
    s2.x = W / 2; s2.y = W / 2;
    ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, W);
    shell.draw(ctx, w);
    const ward = lit();
    // ...and whether the surface is actually alive: the discharge is the
    // brightest thing on it, and there has to be some.
    let hot = 0;
    const dd = ctx.getImageData(0, 0, W, W).data;
    for (let q = 0; q < dd.length; q += 4) {
      if (dd[q] > 200 && dd[q + 1] > 200 && dd[q + 2] > 200) hot++;
    }
    s2.x = ox; s2.y = oy;
    g.restart();
    return { plain, bought, heavy, quiet, struck, ward, hot, surges: shell.surges.length };
  });

  check('HEAVE throws what is inside the shell, and only with the node bought',
    r.plain && r.bought && r.bought.owned === true && r.plain.owned === false
    && r.bought.v > 60 && r.plain.v < r.bought.v * 0.2
    && r.bought.moved > r.plain.moved + 30,
    `without it the body left at ${r.plain && r.plain.v} u/s and gained `
    + `${r.plain && r.plain.moved}u; with it, ${r.bought && r.bought.v} u/s and `
    + `${r.bought && r.bought.moved}u`);

  /*
   * ...and the shove is an impulse, so what a body gets out of it is
   * `impulse * invMass`. That is the whole reason the row says the heavy ride
   * it out, and it is worth pinning: BULWARK is the only body in the game an
   * order of magnitude down on invMass, and a future HEAVE that moved it as
   * far as a LURCHER would be a shove that had stopped caring about mass.
   * The floor is there so this cannot pass by HEAVE doing nothing at all.
   */
  check('...and what a body gets out of that shove is its own mass',
    r.heavy && r.heavy.v > 8 && r.heavy.v < r.bought.v * 0.45,
    `a LURCHER leaves at ${r.bought && r.bought.v} u/s, a BULWARK at `
    + `${r.heavy && r.heavy.v}`);

  /*
   * PILE is warm and WARD is cold. Asserted as the sign of (red - blue) on the
   * mean lit pixel, which is the one thing that cannot be argued with: WARD is
   * hard white light leaning blue, PILE is brass leaning red.
   */
  const warm = r.quiet.r - r.quiet.b;
  const cold = r.ward.r - r.ward.b;
  check('PILE and WARD do not read as the same effect',
    warm > 4 && cold < -4,
    `PILE's mean lit pixel is r${r.quiet.r.toFixed(0)} b${r.quiet.b.toFixed(0)} `
    + `(r-b ${warm.toFixed(1)}), WARD's is r${r.ward.r.toFixed(0)} `
    + `b${r.ward.b.toFixed(0)} (r-b ${cold.toFixed(1)})`);

  check('...and a PILE that struck nothing is the quieter of the two',
    r.quiet.peak > 0 && r.struck.peak > r.quiet.peak * 1.4 && r.quiet.peak < 110,
    `a pass that cut nothing peaks at ${r.quiet.peak} of 255; one that cut `
    + `three peaks at ${r.struck.peak}`);

  check('...and the WARD-s surface is visibly live, not a drawn circle',
    r.surges > 0 && r.hot > 20,
    `${r.surges} discharges crawling on it, ${r.hot} pixels of them near-white`);
}

/*
 * ---- build 222: the DECOY's two clocks, and the OBJECTS chip ----
 *
 * A second press used to call `expire` on the standing decoy, and `expire` is
 * the decoy's DEATH -- a 260-unit blast at 150 damage with a 900 shove, thrown
 * into the middle of the pile the decoy existed to hold somewhere that was not
 * on top of you. So the ability whose entire job is holding the field away
 * answered a second press by putting the field back. It adds to the clock now.
 *
 * And the drawing carries how long it has left, which it never did: the only
 * tell for time was the last 1.6 seconds fading out, which is a warning that
 * arrives after the decision it was meant to inform. Asserted on the RENDERED
 * PIXELS, because "you can see how long it has" is a claim about what reaches
 * the screen and nothing else settles it.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const slot = () => w.abilities.slots.findIndex((x) => x.def.id === 'decoy');

    const fresh = () => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.abilities.clearCooldowns();
    };

    // ---- a second press extends rather than detonates ----------------------
    fresh();
    g.useAbility(slot());
    const first = w.decoy;
    // Four seconds off the clock, so the extension has somewhere to land.
    for (let f = 0; f < 240; f++) g.update(1 / 60);
    const before = { life: +first.life.toFixed(2), hp: first.hp, dead: first.dead };
    // A witness inside the blast the old path would have thrown, so "it did
    // not detonate" is measured on the field rather than on a flag.
    const near = g.debugSpawn('lurcher', first.x + 90, first.y + 40);
    if (near) { near.staged = false; near.spawnIn = 0; }
    const witnessHp = near ? near.hp : -1;
    w.abilities.clearCooldowns();
    g.useAbility(slot());
    const after = {
      same: w.decoy === first,
      life: +w.decoy.life.toFixed(2),
      hp: w.decoy.hp,
      dead: first.dead,
      maxLife: +w.decoy.maxLife.toFixed(2),
      witness: near ? near.hp : -1,
    };

    // ---- and it stops at the ceiling --------------------------------------
    for (let i = 0; i < 6; i++) { w.abilities.clearCooldowns(); g.useAbility(slot()); }
    const capped = +w.decoy.life.toFixed(2);

    // ---- what the drawing says about the clock -----------------------------
    /*
     * Rendered onto an offscreen canvas at two points on one decoy's life, and
     * NOT off the live one: `draw` is called from the frame loop, so a
     * screenshot measures the loop rather than the drawing (the rule build 211
     * paid for on HE's burst). The turret's own silhouette is what carries it
     * -- six sides going out one at a time -- so the measurement is total lit
     * ink on the mount, which cannot be flattered by the fade at the end
     * because the fade is only the last 1.6 seconds and the samples are taken
     * well outside it.
     */
    const W = 220;
    const c = document.createElement('canvas');
    c.width = W; c.height = W;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    /*
     * Per SIDE, not per canvas. The first version summed every lit pixel on
     * the frame and read a 13% drop across two thirds of a life, which is not
     * the effect failing -- it is the AMBIENT GLOW, `drawGlow` at 3.4 radii,
     * which is by far the brightest thing here and does not depend on the
     * clock at all. Same shape as the streak and stroke-floor probes CLAUDE.md
     * records: the quantity was real and had nothing to do with the claim.
     *
     * The claim is that the mount's six sides go out one at a time, so the
     * measurement walks each side's own CHORD -- vertex to vertex, which is at
     * 0.866r at its midpoint and nowhere near the circle of radius r -- and
     * takes the brightest pixel on it. The dash means most samples land in a
     * gap; the maximum is what survives that. Comparing sides against each
     * other inside one frame is glow-neutral by construction: they sit at the
     * same radii and carry the same ambient underneath.
     */
    const sides = (d) => {
      const dd = w.decoy;
      dd.life = d;
      dd.maxLife = CFG.decoy.life;
      dd.born = 1;
      dd.restacked = 0;
      /*
       * The barrel's sweep pinned to dead centre, which is not tidiness: it
       * swings +/-0.5 rad scaled by the life left, and at the wide end it
       * crosses the chord of whichever side it is leaning over -- so a case
       * that left it to `world.time` would read one side bright or dim
       * depending on where in the sweep the sample happened to land. That is
       * the "measured at the wrong moment" flake CLAUDE.md keeps a list of.
       */
      w.time = (Math.PI - dd.born) / 1.3;
      const ox = dd.x, oy = dd.y;
      dd.x = W / 2; dd.y = W / 2;
      ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, W);
      dd.draw(ctx, w);
      dd.x = ox; dd.y = oy;
      const px = ctx.getImageData(0, 0, W, W).data;
      const at = (x, y) => {
        const q = ((y | 0) * W + (x | 0)) * 4;
        return Math.max(px[q], px[q + 1], px[q + 2]);
      };
      const out = [];
      for (let i = 0; i < 6; i++) {
        const a0 = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const a1 = -Math.PI / 2 + ((i + 1) / 6) * Math.PI * 2;
        const x0 = W / 2 + Math.cos(a0) * dd.r;
        const y0 = W / 2 + Math.sin(a0) * dd.r;
        const x1 = W / 2 + Math.cos(a1) * dd.r;
        const y1 = W / 2 + Math.sin(a1) * dd.r;
        let best = 0;
        // Away from the shared vertices, so a side cannot borrow its
        // neighbour's ink at the corner they have in common -- and clear of
        // the barrel, which stands out of the top vertex.
        for (let t = 0.3; t <= 0.7; t += 0.004) {
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          for (let o = -1; o <= 1; o++) best = Math.max(best, at(x + o, y), at(x, y + o));
        }
        out.push(best);
      }
      return out;
    };
    const full = sides(CFG.decoy.life);
    const third = sides(CFG.decoy.life * 0.34);
    /*
     * ...and which way the barrel points, off the same drawing. The barrel is
     * the only thing that reaches past 1.3 radii, so the two windows below --
     * straight up and straight left of the mount, the same size and the same
     * distance out -- contain the barrel and nothing else.
     */
    sides(CFG.decoy.life);
    const px2 = ctx.getImageData(0, 0, W, W).data;
    const box = (cx, cy, half) => {
      let n = 0;
      for (let y = cy - half; y <= cy + half; y++) {
        for (let x = cx - half; x <= cx + half; x++) {
          const q = ((y | 0) * W + (x | 0)) * 4;
          if (Math.max(px2[q], px2[q + 1], px2[q + 2]) > 90) n++;
        }
      }
      return n;
    };
    const rr = w.decoy.r;
    const barrel = {
      up: box(W / 2, W / 2 - rr * 1.7, 9),
      left: box(W / 2 - rr * 1.7, W / 2, 9),
    };
    // ...and the ONE control that matters: health held constant across both.
    // If the two readings differed because the plating arc moved, the drawing
    // would be expressing health twice and time not at all.
    const hpHeld = w.decoy.hp;

    g.restart();
    return { before, after, capped, cap: CFG.decoy.lifeCap, life: CFG.decoy.life,
      witnessHp, full, third, hpHeld, barrel };
  });

  check('a second DECOY adds to the clock instead of killing the one that is up',
    r.after.same === true && r.after.dead === false
    && r.after.life > r.before.life + r.life * 0.9
    && r.after.witness === r.witnessHp,
    `${r.before.life}s left -> ${r.after.life}s on the same decoy `
    + `(${r.after.same ? 'same object' : 'REPLACED'}); a body 98 units off it `
    + `went ${r.witnessHp} -> ${r.after.witness} hp, where the old path threw a `
    + `150-damage blast across 260 units`);

  check('...and the clock has a ceiling rather than however many charges allow',
    r.capped === r.cap,
    `six more presses reach ${r.capped}s against a cap of ${r.cap}`);

  /*
   * At full life every side of the mount reads the same; at a third, the ones
   * past the boundary have gone. Both arms are needed: the first is what shows
   * the instrument can read a lit side at all, and without it "side 5 is dim"
   * would pass on a drawing that had no mount in it.
   */
  const evenAtFull = r.full && Math.min(...r.full) > Math.max(...r.full) * 0.85;
  const goneAtThird = r.third && r.third[5] < r.third[0] * 0.7
    && r.third[4] < r.third[0] * 0.7;
  /*
   * The barrel points UP, which it did not until build 222.
   *
   * `rotate(-Math.PI / 2 + sweep)` copied the real turret's convention without
   * its frame: the machine draws its barrel along local +x and turns it by
   * `aim` (-PI/2 for up); the decoy draws its along local -y, which is already
   * up, and then took the same -PI/2 on top. `rotate(-PI/2)` sends local -y to
   * world -x, so the stand-in for the turret aimed across the field. Asserted
   * as ink in the quadrant above the mount against ink to the left of it, on
   * the same drawing, with the sweep pinned -- a claim about which way
   * something points is a claim about pixels.
   */
  check('the DECOY-s barrel points the way the turret-s does',
    r.barrel && r.barrel.up > r.barrel.left * 3 && r.barrel.up - r.barrel.left > 30,
    `above the mount ${r.barrel && r.barrel.up} lit pixels, to the left of it `
    + `${r.barrel && r.barrel.left} -- and the left window is not zero because `
    + `the ambient glow reaches 3.4 radii, which is why the two windows are the `
    + `same size at the same distance out`);

  check('...and how much of it is left is drawn on the machine',
    r.full && Math.max(...r.full) > 60 && evenAtFull && goneAtThird
    && r.third[0] > r.third[5],
    `the mount's six sides read [${r.full}] at full life and [${r.third}] at a `
    + `third of it, with health held at ${r.hpHeld} across both`);
}

/*
 * ---- build 222: the OBJECTS chip is a total and nothing else ----
 *
 * The per-wave figure that sat beside it came out at the player's request. The
 * case is here because a chip is easy to put back by accident and because the
 * thing that remains has to be the LIFETIME count -- `world.kills`, which is
 * fed from the one death door and survives a wave turning over.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    const d = w.director;
    d.resting = false; d.asked = 4; d.jobs.length = 0; d.slain = 0; d.made = 4;
    g.syncHud ? g.syncHud() : null;
    for (let f = 0; f < 3; f++) g.update(1 / 60);
    const chip = document.getElementById('counter');
    const text0 = chip.textContent.replace(/\s+/g, ' ').trim();
    // Five deaths of the running wave: the count moves, and nothing else on
    // the chip does.
    for (let i = 0; i < 5; i++) g.registerKill({ wave: d.serial });
    for (let f = 0; f < 3; f++) g.update(1 / 60);
    const text1 = chip.textContent.replace(/\s+/g, ' ').trim();
    const num = document.getElementById('killNum').textContent;
    const pctEl = !!document.getElementById('wavePct');
    // ...and it is the LIFETIME total, not the wave's: end the wave and the
    // number does not go back.
    const before = w.kills;
    d.done = true; d.resting = true;
    for (let f = 0; f < 3; f++) g.update(1 / 60);
    const kept = document.getElementById('killNum').textContent;
    g.restart();
    return { text0, text1, num, pctEl, kills: before, kept,
      cleared: typeof d.cleared === 'function' };
  });

  check('the OBJECTS chip carries the total destroyed and no per-wave figure',
    r.pctEl === false && !/%/.test(r.text0) && !/%/.test(r.text1)
    && r.num === String(r.kills) && r.kills === 5,
    `chip reads "${r.text1}" after five deaths (the element that held the `
    + `per-cent is ${r.pctEl ? 'STILL THERE' : 'gone'})`);

  check('...and the number it keeps is the run-s, not the wave-s',
    r.kept === String(r.kills) && r.cleared === true,
    `${r.kept} still shown once the wave is scored and resting; `
    + `Director.cleared ${r.cleared ? 'still exists for the rail and AUDIT' : 'IS GONE'}`);
}

/*
 * ---- build 222: the TOW actually throws the thing it is carrying ----
 *
 * Measured at tier 9 against a bought damage line, five pairs released the way
 * the director releases them: TWO OF FIVE THREW NOTHING. One head was dead at
 * 7.2 seconds and 600 units out, having never begun to wind -- 135 health
 * across an approach that took 18.7 to 27.0 seconds to close to the old
 * 430-unit hurl range. Another wound for four seconds across two attempts and
 * threw nothing, because gunfire kept shoving it a few units back out of range
 * and `windUp` reset the hold to zero every time.
 *
 * Four things answer that and each has an arm here: the range, the shorter
 * hold, the wind that bleeds instead of resetting, and the load coming off the
 * cable when the head dies. Plus the plow, which is what makes a throw into a
 * crowd a throw rather than a drop.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    const g = window.__sim;
    const w = g.world;
    const H = TYPE_BY_ID.tow.hurl;

    const fresh = () => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.autoAim = false;
      w.autoFire = false;
    };
    // A real pair. `debugSpawn` makes the head alone -- CLAUDE.md's note, and
    // a probe that builds one that way is measuring 135hp against the 415 the
    // game sends.
    const pair = () => {
      g.debugSpawnGroup('tow', 1, { staged: false });
      const head = w.enemies.find((e) => e.type.id === 'tow' && !e.dead);
      const mass = w.enemies.find((e) => e.type.id === 'towMass' && !e.dead);
      if (head) { head.staged = false; head.spawnIn = 0; }
      if (mass) { mass.staged = false; mass.spawnIn = 0; }
      return { head, mass };
    };

    // ---- a head killed cold still lets go ---------------------------------
    /*
     * Killed through `destroy`, which is the door every death comes through,
     * and killed COLD -- `wind` untouched at zero -- because that is the case
     * the measurement found: not a head that nearly made it, a head that never
     * started. The load must leave, and leave slower than a completed wind.
     */
    fresh();
    const cold = pair();
    let coldOut = null;
    if (cold.head && cold.mass) {
      cold.head.destroy(w);
      g.update(1 / 60);
      coldOut = {
        hurled: !!cold.mass.hurled,
        v: +Math.hypot(cold.mass.vx, cold.mass.vy).toFixed(0),
        tether: !!cold.mass.tether,
      };
    }

    // ---- ...and one that finished its wind throws harder -------------------
    fresh();
    const hot = pair();
    let hotOut = null;
    if (hot.head && hot.mass) {
      hot.head.wind = H.wind;
      hot.head.destroy(w);
      g.update(1 / 60);
      hotOut = { hurled: !!hot.mass.hurled,
        v: +Math.hypot(hot.mass.vx, hot.mass.vy).toFixed(0) };
    }

    // ---- the wind bleeds when it is shoved out of range, not resets --------
    /*
     * Driven through `windUp` with the head parked outside the range, because
     * that is exactly what gunfire does to it -- and the whole failure was
     * that one shove past the line cost the entire hold.
     */
    fresh();
    const shoved = pair();
    let bleed = null;
    if (shoved.head) {
      const s = w.shooter;
      shoved.head.x = s.x;
      shoved.head.y = s.y - (H.range * 0.5);
      // Inside: it winds.
      for (let f = 0; f < 24; f++) shoved.head.windUp(w, 1 / 60);
      const inside = +(shoved.head.wind || 0).toFixed(3);
      // Outside: half a second of it.
      shoved.head.y = s.y - (H.range + 200);
      for (let f = 0; f < 30; f++) shoved.head.windUp(w, 1 / 60);
      bleed = { inside, outside: +(shoved.head.wind || 0).toFixed(3) };
    }

    // ---- the load crosses a crowd ------------------------------------------
    /*
     * The same trial twice, plow off and plow on, with a wall of nine bodies
     * between the load and the turret. Everything is healed each frame so the
     * question is only ever "did it get there", never "did it kill its way
     * there"; and the empty-field arm is the control that shows the plow
     * changes NOTHING when there is nothing to plow -- without it the case
     * could pass on a load that had simply been made faster.
     */
    const cross = (crowd, plow) => {
      fresh();
      const s = w.shooter;
      const blockers = [];
      for (let i = 0; i < crowd; i++) {
        const e = g.debugSpawn(['lurcher', 'splitter', 'bulwark', 'prism', 'glut'][i % 5],
          s.x - 60 + (i % 3) * 60, s.y - 150 - ((i / 3) | 0) * 55);
        if (e) { e.staged = false; e.spawnIn = 0; e.hp = 1e9; e.maxHp = 1e9; blockers.push(e); }
      }
      const m = g.debugSpawn('towMass', s.x, s.y - 420);
      if (!m) return null;
      m.staged = false; m.spawnIn = 0; m.hp = 1e9; m.maxHp = 1e9;
      m.vx = 0; m.vy = H.speed; m.thrown = 2.2;
      m.plow = plow ? 2.2 : 0;
      let t = 0, closest = 1e9;
      while (t < 3 && !m.dead) {
        for (const b of blockers) b.hp = 1e9;
        m.hp = 1e9;
        g.update(1 / 60); t += 1 / 60;
        closest = Math.min(closest, Math.hypot(m.x - s.x, m.y - s.y));
      }
      return { closest: +closest.toFixed(0), stopped: m.y < s.y - 200 };
    };
    const clearOff = cross(0, false);
    const clearOn = cross(0, true);
    const jamOff = cross(9, false);
    const jamOn = cross(9, true);

    // ---- ...and it does not cross the TURRET -------------------------------
    /*
     * The one thing the plow must never do. The turret and the DECOY are
     * static -- invMass 0 -- and `resolvePair` only plows against a body with
     * mass of its own, so both stop it dead. Measured as "it is still on the
     * near side of the thing it was thrown at" a full second after arriving.
     */
    fresh();
    const s2 = w.shooter;
    const through = g.debugSpawn('towMass', s2.x, s2.y - 300);
    let past = null;
    if (through) {
      through.staged = false; through.spawnIn = 0; through.hp = 1e9; through.maxHp = 1e9;
      through.vx = 0; through.vy = H.speed; through.thrown = 2.2; through.plow = 2.2;
      let deepest = -1e9;
      for (let f = 0; f < 120; f++) {
        through.hp = 1e9;
        g.update(1 / 60);
        deepest = Math.max(deepest, through.y - s2.y);
      }
      past = +deepest.toFixed(0);
    }

    g.restart();
    return { coldOut, hotOut, bleed, clearOff, clearOn, jamOff, jamOn, past,
      H: { range: H.range, wind: H.wind, speed: H.speed, partial: H.partial,
        holdWind: H.holdWind } };
  });

  check('a TOW killed before it can wind still lets go of its load',
    r.coldOut && r.coldOut.hurled === true && r.coldOut.tether === false
    && r.coldOut.v > r.H.speed * r.H.partial * 0.8,
    `a head destroyed with the wind at zero threw its MASS at ${r.coldOut && r.coldOut.v} `
    + `u/s (two pairs in five used to throw nothing at all)`);

  check('...and a completed wind is still worth more than an interrupted one',
    r.hotOut && r.coldOut && r.hotOut.v > r.coldOut.v * 1.3,
    `${r.coldOut && r.coldOut.v} u/s cold against ${r.hotOut && r.hotOut.v} u/s `
    + `off a full wind, so killing the head early still buys the slower load`);

  check('...and a shove out of range costs the wind ground, not the attempt',
    r.bleed && r.bleed.inside > 0.3 && r.bleed.outside > 0
    && r.bleed.outside < r.bleed.inside,
    `0.4s inside the range wound to ${r.bleed && r.bleed.inside}; half a second `
    + `outside it left ${r.bleed && r.bleed.outside} (it used to leave nothing)`);

  check('a hurled MASS crosses a crowd it would otherwise have stopped in',
    r.jamOn && r.jamOff && r.clearOn && r.clearOff
    && r.jamOff.closest > r.clearOff.closest + 40
    && r.jamOn.closest < r.clearOn.closest + 12,
    `nine bodies in the way: it got to ${r.jamOff && r.jamOff.closest} units of the `
    + `turret without the plow and ${r.jamOn && r.jamOn.closest} with it, against `
    + `${r.clearOn && r.clearOn.closest} across an empty field`);

  check('...and the plow does nothing at all when there is nothing to plow',
    r.clearOn && r.clearOff && Math.abs(r.clearOn.closest - r.clearOff.closest) <= 4,
    `empty field: ${r.clearOff && r.clearOff.closest} units without it, `
    + `${r.clearOn && r.clearOn.closest} with it`);

  check('...and it never plows through the turret, which is what it is thrown at',
    r.past !== null && r.past < 0,
    `two seconds after arriving it is ${r.past} units past the turret centre `
    + `(a static body has no inverse mass, so resolvePair refuses to plow it)`);
}

/*
 * ---- build 223: the four things this build changed ----
 *
 * SPINE's splinters come out the FAR side; the four widest mines are a fifth
 * narrower; a mine is never laid in the top fifth of the field; and the ALL-X
 * rows no longer wear the colour of the first arm in their branch.
 */
{
  const r = await page.evaluate(async () => {
    const { CFG, TYPE_BY_ID } = await import('../src/config.js');
    const { NODES } = await import('../src/tree.js');
    const { freshUpgrades } = await import('../src/upgrades.js');
    const { throwMine } = await import('../src/mines.js');
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const S = CFG.rounds.spine;

    // ---- the splinters come out the FAR side -------------------------------
    /*
     * The whole point of the change, and the one thing that cannot be inferred
     * from a projectile count: a fan spawned at the CONTACT point opens
     * backwards across ground the round has already crossed and covers nothing
     * new. The contact point is the near face -- `contactAt` puts it at
     * `e.x + nx * e.r` -- so "did it come out the other side" is measured as
     * where each splinter was BORN relative to the body's centre, along the
     * dart's own travel. Fired straight up, so the far side is up-field: a
     * splinter born past the centre has a smaller y than the body has.
     */
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    w.up = freshUpgrades();
    w.round = 'spine';
    w.projectiles.length = 0;
    const wall = g.debugSpawn('bulwark', s.x, s.y - 260);
    wall.staged = false; wall.spawnIn = 0; wall.hp = 1e7; wall.maxHp = 1e7;
    wall.invMass = 0;
    s.aim = -Math.PI / 2; s.targetAim = s.aim;
    const born = [];
    const push0 = w.projectiles.push.bind(w.projectiles);
    w.projectiles.push = (...ps) => {
      for (const q of ps) born.push({ x: q.x, y: q.y, r: q.r });
      return push0(...ps);
    };
    s.shoot(w);
    for (let f = 0; f < 30; f++) {
      wall.x = s.x; wall.y = s.y - 260; wall.vx = 0; wall.vy = 0;
      g.update(1 / 60);
    }
    w.projectiles.push = push0;
    // The dart is the first thing pushed and is born at the muzzle; every
    // later one is a splinter.
    const splinters = born.slice(1);
    const far = splinters.filter((q) => q.y < wall.y).length;
    const onSurface = splinters.filter(
      (q) => Math.abs(Math.hypot(q.x - wall.x, q.y - wall.y) - wall.r) < 3).length;

    // ---- how much of the screen a mine may take ----------------------------
    /*
     * Every mine's MAXIMUM, with the whole tree owned, against the SCREEN it
     * is drawn on rather than against a constant -- `innerWidth / CFG.zoom` is
     * the field the player can actually see, and it is the only honest
     * denominator for "it takes up most of the screen".
     *
     * The previous version of this case was four hand-typed ceilings, each set
     * to whatever that build's value happened to be, under a comment saying
     * "the field is about 630 units across, so a radius over 315 is a circle
     * wider than the screen. Every one of these is now inside that" -- while
     * asserting `knell < 400`, which is 120% of it. The rule and the number
     * had come apart, so the case went green through the exact complaint it
     * was written for, twice. It states the rule now and computes the numbers.
     *
     * Two tiers, and the split is what the eye does with each:
     *   a BLAST is over in a quarter second and is read from its EDGE, so the
     *   edge has to be on the screen with room -- half the width.
     *   a standing reach is drawn continuously and is read from its CONTENTS
     *   (bodies dragged in, ground burning), so it only has to fit -- two
     *   thirds.
     */
    g.restart();
    g.debugTeachAll();
    g.debugGiveEnergy(400000);
    for (let pass = 0; pass < 4; pass++) for (const n of NODES) if (n.id) g.buy(n.id);
    const up = w.up;
    const K = CFG.knell;
    const screen = window.innerWidth / CFG.zoom;   // world units across the display
    const wide = {
      screen: +screen.toFixed(0),
      blastCap: +(screen * 0.25).toFixed(1),       // half the width, as a radius
      holdCap: +(screen / 3).toFixed(1),           // two thirds, as a radius
      blast: CFG.mines.blast.r * up.mineBlast,
      fizzle: CFG.mines.fizzle.r * up.mineBlast,
      knell: K.blast.r * K.spread * up.mineBlast,
      spall: CFG.spall.burst.r * up.spallBurst,
      lode: CFG.lode.reach * up.lodeReach,
      snare: CFG.snare.reach,
      thorn: CFG.thorn.patch.r * up.patchR,
      lodePush: up.lodePush,
      deepLevels: (NODES.find((n) => n.id === 'deepcharge') || {}).levels,
    };

    /*
     * ...and what a KNELL actually draws, walked through a real mine rather
     * than read off the expression above. FOURTH BELL used to put its two
     * extra tolls PAST the end of the ladder, so the node that reads "+1 toll"
     * was also the largest radius upgrade in the game; the widest ring must
     * now be the same whether it is owned or not.
     */
    const tollRings = (bell) => {
      g.restart();
      g.debugClearField();
      w.up = freshUpgrades();
      w.up.mineTolls = bell;
      w.mines.length = 0;
      w.effects.length = 0;
      throwMine(w, 'knell');
      const m = w.mines[w.mines.length - 1];
      if (!m) return null;
      /*
       * By identity, not by index. `effects` is compacted as things die, so a
       * new Shock can land BELOW the mark a previous frame left -- the first
       * version of this walked `effects.length` forward and saw one toll of
       * two.
       */
      const seen = [];
      const at = [];
      const had = new Set();
      let f = 0;
      for (; f < 60 * 30; f++) {
        if (m && !m.dead) { m.x = w.shooter.x; m.y = w.shooter.y - 200; }
        g.update(1 / 60);
        for (const e of w.effects) {
          if (!e || !e.constructor || e.constructor.name !== 'Shock') continue;
          if (had.has(e)) continue;
          had.add(e);
          seen.push(+e.r.toFixed(1));
          at.push(+(f / 60).toFixed(2));
        }
        if (m.dead) break;
      }
      return { rings: seen, at, gone: +(f / 60).toFixed(2) };
    };
    const bell0 = tollRings(0);
    const bell2 = tollRings(2);

    /*
     * ...and the rule the knell was breaking, asked of all eight: lay one on
     * an empty field, touch nothing, and see how long it stays. Seven of them
     * sat for their whole `life`; a knell was GONE in 2.85 seconds of fifteen,
     * because it ends itself on its last toll and the tolls were 1.15s apart.
     */
    const sitFor = (kind) => {
      g.restart();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.up = freshUpgrades();
      w.mines.length = 0;
      throwMine(w, kind);
      const m = w.mines[w.mines.length - 1];
      if (!m) return null;
      for (let f = 0; f < 60 * 30; f++) {
        g.update(1 / 60);
        if (!w.mines.includes(m)) return +(f / 60).toFixed(2);
      }
      return 30;
    };
    const sat = {};
    for (const k of ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void']) {
      sat[k] = sitFor(k);
    }
    sat.life = CFG.mines.life;

    g.restart();
    w.up = freshUpgrades();

    // ---- and where a mine may be laid --------------------------------------
    /*
     * Two hundred sites, because the site is a `rand` and one draw proves
     * nothing. Asserted against the FIELD's depth rather than a constant --
     * the buffer is a fraction so that it stays a fifth on every screen -- and
     * the spread is asserted too, or a broken site that always returned the
     * same point would pass the first arm on its own.
     */
    g.restart();
    g.debugTeachAll();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    const deep = w.floorY;
    const bar = deep * CFG.mines.keepTop;
    let above = 0, lowest = 1e9, highest = -1e9, lowRaw = 1e9;
    for (let i = 0; i < 200; i++) {
      w.mines.length = 0;
      throwMine(w, 'blast');
      const m = w.mines[w.mines.length - 1];
      if (!m) continue;
      // `y1` is the landing site; `y`/`y0` is the muzzle it was lobbed from.
      if (m.y1 < bar) above++;
      lowest = Math.min(lowest, m.y1);
      highest = Math.max(highest, m.y1);
      // Raw, because the assertion below is an inequality against `bar` and
      // both sides were being rounded before it: a site at 241.4 and a bar at
      // 241.2 both read 241, and "no lower than the bar" failed on a rounding
      // rather than on a mine.
      lowRaw = Math.min(lowRaw, m.y1);
    }
    w.mines.length = 0;

    // ---- and the colour the ALL-X rows wear --------------------------------
    const toneOf = (key) => {
      const n = NODES.find((x) => x.key === key);
      return n ? n.tone : null;
    };
    const tones = {
      minesAll: toneOf('mines_all'),
      ammoAll: toneOf('ammo_all'),
      abilitiesAll: toneOf('abilities_all'),
      blast: toneOf('blast'),
      minesRoot: toneOf('mines'),
    };
    // ...and that a card under one of them actually carries the mark, which is
    // the half a tone cannot express.
    const m2 = g.menu || window.__menu;
    g.restart();
    return { splinters: splinters.length, far, onSurface, wallR: wall.r,
      wide, bell0, bell2, sat, above, bar: +bar.toFixed(0), lowest: +lowest.toFixed(0),
      clearsBar: lowRaw >= bar,
      highest: +highest.toFixed(0), floorY: +w.floorY.toFixed(0), tones,
      hasMenu: !!m2 };
  });

  check('a SPINE-s splinters are born on the FAR side of what it went through',
    r.splinters > 0 && r.far === r.splinters && r.onSurface === r.splinters,
    `${r.far} of ${r.splinters} splinters were born past the body's centre, `
    + `${r.onSurface} of them on its surface (r ${r.wallR}) -- at the contact `
    + `point they would all have been on the near face`);

  /*
   * BLAST 413 -> 306 -> 215 -> 156 and KNELL's last toll 726 -> 538 -> 378 ->
   * 156, across builds 223, 227 and 229. The first two cuts were to one term
   * apiece of a product of three -- base x toll growth x DEEP CHARGE -- and
   * the complaint came back after both, because the other two terms were
   * still multiplying. 229 takes the growth (see `spread` in config.js) and
   * the node (1.35 -> 1.22 a level) as well.
   *
   * Stated against the screen, in screen widths, because that is the sentence
   * the player wrote three times: "it takes up most of the screen".
   */
  check('no mine blast opens wider than half the screen it is drawn on',
    r.wide.blast <= r.wide.blastCap && r.wide.knell <= r.wide.blastCap
    && r.wide.fizzle <= r.wide.blastCap && r.wide.spall <= r.wide.blastCap
    && r.wide.deepLevels === 2,
    `fully bought, against a ceiling of ${r.wide.blastCap} (half of a `
    + `${r.wide.screen}-unit screen): BLAST ${r.wide.blast.toFixed(0)}, `
    + `KNELL's widest toll ${r.wide.knell.toFixed(0)}, SALTED's fizzle `
    + `${r.wide.fizzle.toFixed(0)}, SPALL's pellet ${r.wide.spall.toFixed(0)}; `
    + `DEEP CHARGE sells ${r.wide.deepLevels} levels`);

  /*
   * The looser tier, and the reason for two of them: a blast is over in a
   * quarter second and is read from its EDGE, so the edge has to be on the
   * screen with room. A standing reach is drawn for as long as it lasts and is
   * read from its CONTENTS -- bodies hauled into the knot, ground burning --
   * so it only has to fit. None of the three has been touched since build 223.
   */
  check('...and no standing reach opens wider than two thirds of it',
    r.wide.snare <= r.wide.holdCap && r.wide.lode <= r.wide.holdCap
    && r.wide.thorn <= r.wide.holdCap,
    `against a ceiling of ${r.wide.holdCap}: SNARE ${r.wide.snare.toFixed(0)}, `
    + `LODE ${r.wide.lode.toFixed(0)}, THORN's ground ${r.wide.thorn.toFixed(0)}`);

  /*
   * The mechanism, watched rather than read: every Shock a KNELL pushes over
   * its own life, with FOURTH BELL unowned and fully bought. Two tolls become
   * four and the ladder fills IN -- same first ring, same last ring, two more
   * between them. Under `1 + i * grow` the last ring went 1.5 bases to 2.5,
   * which is how a node reading "+1 toll" came to be the largest radius
   * upgrade in the game and why two cuts to the base did not hold.
   */
  const near = (a, b) => Math.abs(a - b) < 0.5;
  const b0 = r.bell0 || {}, b2 = r.bell2 || {};
  check('FOURTH BELL fills the toll ladder in rather than extending past it',
    b0.rings && b2.rings && b0.rings.length === 2 && b2.rings.length === 4
    && near(b0.rings[0], b2.rings[0])
    && near(b0.rings[b0.rings.length - 1], b2.rings[b2.rings.length - 1])
    && b2.rings.every((v, i) => i === 0 || v > b2.rings[i - 1]),
    `unbought ${JSON.stringify(b0.rings)}, fully bought `
    + `${JSON.stringify(b2.rings)} -- same ends, and every ring wider than the `
    + `one before it`);

  /*
   * ...and the same in TIME, which is the half that mattered. `gap` was a
   * fixed 1.15s, so a knell ended itself 2.85 seconds after it was thrown --
   * see the case below. The span is what is fixed now: the first and last
   * tolls land at the same moments however many there are, and FOURTH BELL
   * makes the bell ring more OFTEN rather than for longer.
   */
  const spanOf = (b) => (b.at && b.at.length > 1 ? b.at[b.at.length - 1] - b.at[0] : 0);
  check('...and in time as well, so a bought knell rings more often, not longer',
    Math.abs(spanOf(b0) - spanOf(b2)) < 0.3 && spanOf(b0) > 6
    && near(b0.at[0], b2.at[0]),
    `unbought at ${JSON.stringify(b0.at)}s, fully bought at `
    + `${JSON.stringify(b2.at)}s -- a span of ${spanOf(b0).toFixed(1)}s against `
    + `${spanOf(b2).toFixed(1)}s`);

  /*
   * The rule the knell was breaking, and the one that would have caught it in
   * one line: a mine laid on empty ground and never touched is a promise that
   * it will be there when something arrives.
   *
   * Seven of the eight sat for the whole of `CFG.mines.life`. A KNELL ends
   * itself on its LAST toll, and the tolls were 1.15 seconds apart -- so it
   * was gone 2.85 seconds after being thrown, against 15.9 for every other
   * kind and a throw clock of 15 seconds. A knell player had a live mine 19%
   * of the time, and it spent that 19% in the window before a wave had
   * reached the ground it was there to deny: measured on a lane bodies
   * actually walk down, it delivered ZERO. The player's report was "KNELL
   * does not do damage" and the mine's own docstring said it "denies the
   * ground whether anything is there or not".
   *
   * Two thirds rather than the whole of it, because a knell legitimately ends
   * on its last toll and that is inside the life by design.
   */
  const sat = r.sat || {};
  const kinds = ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'];
  const short = kinds.filter((k) => !(sat[k] >= sat.life * 0.66));
  check('a mine nothing touches is still there when something arrives',
    short.length === 0 && sat.knell > 10,
    `on an empty field, against a ${sat.life}s life: `
    + kinds.map((k) => `${k} ${sat[k]}s`).join(', ')
    + (short.length ? ` -- ${short.join(', ')} gone inside two thirds of it` : ''));

  check('...and REPULSOR still throws as hard through the smaller circle',
    Math.abs(r.wide.lodePush - 1.96) < 0.01,
    `lode push x${r.wide.lodePush.toFixed(2)} with both levels, unchanged, `
    + `against a reach of ${r.wide.lode.toFixed(0)} rather than 184`);

  check('a mine is never laid in the top fifth of the field',
    r.above === 0 && r.clearsBar && r.highest > r.bar
    && r.highest - r.lowest > 60,
    `200 sites, ${r.above} of them above the ${r.bar}-unit line `
    + `(a fifth of a ${r.floorY}-unit field); they ran ${r.bar} to `
    + `${r.highest}`);

  /*
   * dE in CIELAB, which is the only way to say "these are the same colour"
   * about two hex strings. 25 is the floor the ability-bar case already uses.
   * ALL MINES against BLAST measured 0.6 before this build -- #ffb347 against
   * #ffb247, one unit of green apart.
   */
  const dE = (a, b) => {
    const lab = (h) => {
      const v = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const [rr, gg, bb] = v;
      const X = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
      const Y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
      const Z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
      const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
      return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    };
    const p = lab(a), q = lab(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  const gap = r.tones.minesAll && r.tones.blast ? dE(r.tones.minesAll, r.tones.blast) : 0;
  check('ALL MINES is not the colour of the first mine in the branch',
    gap > 25,
    `ALL MINES ${r.tones.minesAll} against BLAST ${r.tones.blast}: dE `
    + `${gap.toFixed(1)} (it was #ffb347 against #ffb247, dE 0.6)`);

  check('...and the three ALL-X headings share one register, which no arm uses',
    r.tones.minesAll && r.tones.minesAll === r.tones.ammoAll
    && r.tones.minesAll === r.tones.abilitiesAll
    && r.tones.minesAll !== r.tones.minesRoot,
    `ALL ROUNDS ${r.tones.ammoAll}, ALL MINES ${r.tones.minesAll}, `
    + `ALL ABILITIES ${r.tones.abilitiesAll}; the MINES heading itself is `
    + `still ${r.tones.minesRoot}`);
}

/*
 * ---- a load that breaks itself on you still landed on you ----
 *
 * `checkContact` skipped `e.dead`, and the physics runs before it: the pair
 * solver bills `impactDamage` to both sides, so a MASS arriving at 620 with
 * 280 health routinely destroys itself on the turret inside the frame it
 * arrives -- and was already dead when the contact loop looked. So the
 * corruption spike, which is the whole reason a thrown MASS is a different
 * event from something walking into you, fired only when the load SURVIVED.
 * The harder it hit you, the less likely it was to register.
 *
 * Measured before the fix over eight releases: four landed at 52 units against
 * a 55-unit band, died on the frame they arrived, and did nothing at all --
 * and that is what made the TOW case above fail about one run in three.
 *
 * Driven by putting a load on the turret and killing it in the same frame,
 * rather than by throwing one, because a real throw only shows it on the
 * releases where the impact happens to be lethal.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;

    const land = (survive) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.autoAim = false; w.autoFire = false;
      w.attackers.clear();
      w.shock = 0;
      const e = g.debugSpawn('towMass', s.x, s.y - 300);
      if (!e) return null;
      e.staged = false; e.spawnIn = 0;
      // Enough to walk away from the impact, or not enough -- which is the
      // only difference between the two arms.
      e.hp = survive ? 1e9 : 40;
      e.maxHp = e.hp;
      e.hurled = true;
      e.thrown = 2.2;
      const rr = e.r + s.r + 2;
      e.x = s.x; e.y = s.y - rr * 0.9;
      e.vx = 0; e.vy = 260;
      let peak = 0;
      // EVER in the set, not in it at the end: the release loop at the top of
      // checkContact lets go at `r + 6`, and a body that bounces off the
      // turret at 260 u/s clears that inside the window. Reading the end state
      // would have said "never gripped" about a body that gripped and let go.
      let everIn = false;
      for (let f = 0; f < 12; f++) {
        g.update(1 / 60);
        peak = Math.max(peak, w.shock);
        if (w.attackers.has(e)) everIn = true;
      }
      return { shock: +peak.toFixed(2), dead: e.dead, inSet: everIn };
    };

    const tough = land(true);
    const broke = land(false);
    g.restart();
    return { tough, broke };
  });

  check('a hurled MASS that breaks on the turret still spikes corruption',
    r.broke && r.broke.dead === true && r.broke.shock > 0,
    `a load with 40 health died on the turret and spiked to `
    + `${r.broke && r.broke.shock} (it used to spike to 0, because the physics `
    + `kills it before the contact loop looks)`);

  check('...and being wrecked is still not a grip: it lands, and it is gone',
    r.broke && r.broke.inSet === false && r.tough && r.tough.shock > 0
    && r.tough.inSet === true,
    `wrecked: in the attacker set ${r.broke && r.broke.inSet}; intact: `
    + `${r.tough && r.tough.inSet}, spike ${r.tough && r.tough.shock} `
    + `(a dead body in that set is one nothing ever releases)`);
}

/*
 * ---- build 224: there is no default number of levels ----
 *
 * `tree.js` read `u.levels ?? 3`, so a node whose author never capped it was
 * silently sold three times. EIGHT shipped that way between builds 178 and
 * 223 -- HOT LOAD, BUCKSHOT, REPULSOR, STANDING ORDER, FIFTH LINK, PAIRED
 * CHARGE, FOURTH BELL, DEEP CHARGE -- and every one was found late, by a probe
 * or a player rather than by the suite, because a node relying on the default
 * and a node deliberately set to three were the same text. The mistake was
 * invisible, which is the whole fault; correcting the docstring in build 220
 * did not help for exactly that reason.
 *
 * The number is mandatory now. This asserts the three things that has to mean:
 * every upgrade declares one, the tree REFUSES a node that does not, and the
 * ladder nobody meant to change did not change.
 */
{
  const r = await page.evaluate(async () => {
    const { ALL_UPGRADES } = await import('../src/upgrades.js');
    const { NODES } = await import('../src/tree.js');

    const capped = ALL_UPGRADES.filter((u) => !u.repeat);
    const silent = capped.filter((u) => u.levels === undefined);
    const bad = capped.filter((u) => !(u.levels > 0) || u.levels !== Math.round(u.levels));

    /*
     * ...and that the refusal is REAL, which is the half a count cannot show.
     * Without this the case passes on a build where the `?? 3` is still there
     * and every author has simply happened to write the number -- which is
     * exactly the state build 220 left, and DEEP CHARGE shipped uncapped three
     * builds later. `levelsOf` is the rule itself, exported for this.
     */
    const { levelsOf } = await import('../src/tree.js');
    const tries = [
      ['no levels at all', { id: 'a', name: 'A' }],
      ['zero', { id: 'b', name: 'B', levels: 0 }],
      ['negative', { id: 'c', name: 'C', levels: -2 }],
      ['a fraction', { id: 'd', name: 'D', levels: 2.5 }],
    ];
    const refused = tries.map(([what, u]) => {
      try { return { what, threw: false, got: levelsOf(u) }; }
      catch (e) { return { what, threw: true }; }
    });
    // ...and the control: a node that DOES declare one comes back with it, so
    // a `levelsOf` that threw on everything could not pass this.
    let good = null;
    try { good = levelsOf({ id: 'e', name: 'E', levels: 2 }); } catch (e) { good = 'threw'; }
    // Named on THIS side of the bridge: `Infinity` does not survive
    // JSON-serialisation out of the page and arrives as null, which would make
    // the assertion read as a test for absence rather than for infinity.
    let repeat = null;
    try {
      const v = levelsOf({ id: 'f', name: 'F', repeat: true });
      repeat = Number.isFinite(v) ? v : 'infinite';
    } catch (e) { repeat = 'threw'; }

    /*
     * The ladder itself. Counted over UPGRADE nodes only -- `NODES` also holds
     * the arms and the ability charges, which carry `levels: 1` from `node()`
     * and are not what this refactor touched.
     */
    const rungs = NODES.filter((n) => n.id && n.kind === 'upgrade'
      && Number.isFinite(n.levels));
    const total = rungs.reduce((a, n) => a + n.levels, 0);
    const repeats = NODES.filter((n) => n.id && !Number.isFinite(n.levels)).length;

    return { count: capped.length, silent: silent.map((u) => u.id),
      bad: bad.map((u) => u.id), refused, good, repeat,
      total, rungs: rungs.length, repeats };
  });

  check('every upgrade writes out how many times it may be bought',
    r.silent.length === 0 && r.bad.length === 0 && r.count > 50,
    `${r.count} capped upgrades, ${r.silent.length} of them silent`
    + `${r.silent.length ? ` (${r.silent.join(' ')})` : ''}`
    + `${r.bad.length ? `; malformed: ${r.bad.join(' ')}` : ''}`);

  check('...and the tree refuses one that does not, rather than guessing three',
    r.refused && r.refused.every((x) => x.threw) && r.good === 2
    && r.repeat === 'infinite',
    `${r.refused.filter((x) => x.threw).length}/${r.refused.length} malformed `
    + `declarations refused (${r.refused.filter((x) => !x.threw)
      .map((x) => `${x.what} -> ${x.got}`).join(', ') || 'none slipped through'}); `
    + `a node declaring 2 still comes back ${r.good}, and a repeatable one `
    + `${r.repeat}`);

  /*
   * And the ladder moved by exactly what the rebalance moved it by. Writing
   * fifteen threes out was a refactor and had to be provable as one -- the
   * same total the BUILT readout asserts, by a different route, so a level
   * lost to a typo cannot hide behind it. 105 until build 229, which put two
   * more levels on HOLLOWPOINT and nothing anywhere else; 107 until 232, when
   * SANDBOX added a node of one level.
   */
  /*
   * `repeats` was 8 until build 227 -- the seven APERTUREs plus RECAST -- and
   * is 1 now: the ways in are given at a rung rather than sold as repeatable
   * nodes, so RECAST is the only thing left in the tree with no ceiling.
   */
  check('...and writing the numbers out changed no ladder',
    r.total === 108 && r.rungs === 54 && r.repeats === 1,
    `${r.total} levels across ${r.rungs} upgrade nodes and ${r.repeats} `
    + `repeatable ones (fifteen of those levels were the silent default and are `
    + `now written out, which has to be a refactor and nothing else)`);
}

/*
 * ---- build 226: two menus in one sheet, and the doors onto them ----
 *
 * ARSENAL (AMMO, MINES, UPGRADES, ULTIMATE) and SYSTEM (OBJECTS, SETTINGS).
 * The loadout sheet the strip's two buttons used to open is the first two
 * tabs; the hamburger opens SYSTEM; the energy chip opens UPGRADES; the panel
 * swipes sideways through the six and crosses menus at the edge; and ULTIMATE
 * is sealed and says so. Each door is pressed the way a thumb presses it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const m = g.hud.menu;
    const w = g.world;
    const out = {};
    const tap = (el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    const state = () => ({ open: m.open, tab: m.tab, group: m.group(),
      tabsShown: [...document.querySelectorAll('#menuTabs .menuTab')]
        .filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.tab),
      paused: g.paused, loadout: g.loadoutOpen });
    m.setOpen(false);

    // ---- the four doors ----
    tap(document.getElementById('menuBtn'));
    out.hamburger = state();
    m.setOpen(false);
    tap(document.getElementById('energyChip'));
    out.energy = state();
    m.setOpen(false);
    tap(document.getElementById('cfgAmmo'));
    out.ammoBtn = state();
    m.setOpen(false);
    tap(document.getElementById('cfgMines'));
    out.minesBtn = state();

    // ---- the switch in the header, and it remembers the tab ----
    m.openTab('mines');
    tap(document.querySelector('.menuGroup[data-group="system"]'));
    const toSystem = state();
    tap(document.querySelector('.menuGroup[data-group="arsenal"]'));
    const back = state();
    out.switch = { toSystem, back };

    // ---- sideways, across the whole strip ----
    m.openTab('ammo');
    const walk = [m.tab];
    for (let i = 0; i < 7; i++) walk.push(m.step(1));
    const walkBack = [];
    for (let i = 0; i < 7; i++) walkBack.push(m.step(-1));
    out.walk = walk; out.walkBack = walkBack;

    // ---- a real sideways drag on the panel moves one tab, and a vertical
    // one does not ----
    const drag = (el, from, to, steps = 6) => {
      const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 9, isPrimary: true, clientX: x, clientY: y,
      }));
      ev('pointerdown', from.x, from.y);
      for (let i = 1; i <= steps; i++) {
        ev('pointermove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      }
      ev('pointerup', to.x, to.y);
    };
    m.openTab('tree');
    const panels = document.getElementById('menuPanels');
    drag(panels, { x: 300, y: 400 }, { x: 120, y: 405 });
    out.swipeLeft = { tab: m.tab, inline: panels.style.transform, open: m.open };
    drag(panels, { x: 120, y: 400 }, { x: 300, y: 405 });
    out.swipeRight = { tab: m.tab, open: m.open };
    drag(panels, { x: 200, y: 300 }, { x: 205, y: 480 });
    out.swipeDownOnPanel = { tab: m.tab, open: m.open };

    // ---- ULTIMATE is sealed and the room says so ----
    m.openTab('ultimate');
    const room = document.querySelector('[data-panel="ultimate"] .sealedRoom');
    const tabBtn = document.querySelector('.menuTab[data-tab="ultimate"]');
    out.ultimate = { tab: m.tab, sealedTab: tabBtn.classList.contains('sealed'),
      lockOnTab: !!tabBtn.querySelector('.tabLock svg'),
      room: !!room && getComputedStyle(room).display !== 'none',
      says: room ? room.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
      cards: document.querySelectorAll('[data-panel="ultimate"] .shopCard').length };

    return out;
  });

  /*
   * A tick between the gestures and the press, and it is load-bearing. Every
   * live drag arms a one-shot capture-phase click eater on its element so a
   * claimed swipe cannot also land as a tap on what is underneath, and clears
   * it on `setTimeout(0)` -- which never runs inside one synchronous
   * `evaluate`. Three synthetic drags above left three eaters armed, and the
   * press below was swallowed at the capture phase on the way down to its
   * row: "HE on the strip true, pressed: [...] -> [...]", identical either
   * side, on a working build. A thumb never meets this because the browser
   * ticks between gestures; the case has to tick too.
   */
  await page.waitForTimeout(20);
  const r2 = await page.evaluate(async () => {
    const g = window.__sim;
    const m = g.hud.menu;
    const w = g.world;
    const out = {};
    const tap = (el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    const state = () => ({ open: m.open, tab: m.tab, group: m.group(), paused: g.paused,
      loadout: g.loadoutOpen });

    // ---- the loadout still works as a tab: a row toggles the strip ----
    /*
     * From a KNOWN strip. `restart` then `debugTeachAll` owns the rack and
     * fills the five ammunition slots the same way every time, so the row to
     * press is a name and not a search: HE is on the strip, is not the last
     * round on it, and pressing it takes it off. Two earlier versions picked a
     * row by class and picked one the strip had every right to refuse -- a
     * fresh run has one row and it is the last round; a full strip makes
     * every row not on it `stuck`. The strip is reported either side so a
     * failure says what the press did rather than only that it did nothing.
     */
    g.restart();
    g.debugTeachAll();
    m.openTab('ammo');
    const rows = document.querySelectorAll('#loadList_ammo .loadRow:not(.sealed)').length;
    const target = document.getElementById('ldExplosive');
    const before = [...w.loadout.ammo];
    const wasOn = !!target && target.classList.contains('on');
    if (target) tap(target);
    const after = [...w.loadout.ammo];
    out.loadout = { rows, wasOn, before: before.join(','), after: after.join(','),
      changed: JSON.stringify(before) !== JSON.stringify(after),
      slots: document.querySelectorAll('#loadSlots_ammo .loadSlot').length };
    if (target) tap(target); // and put it back

    m.setOpen(false);
    out.closed = state();
    return out;
  });
  Object.assign(r, r2);

  check('the hamburger opens SYSTEM, and the three field doors open ARSENAL',
    r.hamburger.open && r.hamburger.group === 'system' && r.hamburger.tab === 'codex'
    && r.energy.open && r.energy.tab === 'tree' && r.energy.group === 'arsenal'
    && r.ammoBtn.tab === 'ammo' && r.minesBtn.tab === 'mines'
    && r.ammoBtn.loadout === 'ammo' && r.minesBtn.loadout === 'mines'
    && r.hamburger.paused && r.ammoBtn.paused,
    `hamburger -> ${r.hamburger.group}/${r.hamburger.tab}, energy -> ${r.energy.tab}, `
    + `AMMO -> ${r.ammoBtn.tab}, MINES -> ${r.minesBtn.tab}; the world holds under all of them`);

  check('...and only the open menu-s tabs are in the row',
    JSON.stringify(r.hamburger.tabsShown) === '["codex","sandbox","system"]'
    && JSON.stringify(r.energy.tabsShown) === '["ammo","mines","tree","ultimate"]',
    `SYSTEM shows ${r.hamburger.tabsShown.join('/')}, ARSENAL shows ${r.energy.tabsShown.join('/')}`);

  check('the switch in the header crosses menus and remembers where you were',
    r.switch.toSystem.group === 'system' && r.switch.back.tab === 'mines',
    `MINES -> SYSTEM lands on ${r.switch.toSystem.tab}; back to ARSENAL lands on `
    + `${r.switch.back.tab} (not the first tab)`);

  // Seven since build 232, when SANDBOX went into SYSTEM between OBJECTS and
  // SETTINGS. The walk is what proves the strip is one list and not two: it
  // crosses from ARSENAL into SYSTEM at ULTIMATE -> OBJECTS without a stop.
  check('the tabs are one strip, walked in either direction and stopping at the ends',
    JSON.stringify(r.walk) === '["ammo","mines","tree","ultimate","codex","sandbox","system","system"]'
    && JSON.stringify(r.walkBack) === '["sandbox","codex","ultimate","tree","mines","ammo","ammo"]',
    `forward ${r.walk.join(' ')}; back ${r.walkBack.join(' ')}`);

  check('a sideways drag on the panel moves one tab, and a downward one does not',
    r.swipeLeft.tab === 'ultimate' && r.swipeLeft.inline === '' && r.swipeLeft.open
    && r.swipeRight.tab === 'tree' && r.swipeDownOnPanel.tab === 'tree',
    `left from UPGRADES -> ${r.swipeLeft.tab} (inline transform left "${r.swipeLeft.inline}"), `
    + `right -> ${r.swipeRight.tab}, down -> ${r.swipeDownOnPanel.tab} still open ${r.swipeDownOnPanel.open}`);

  check('ULTIMATE is sealed, wears a lock, and its room says so rather than standing empty',
    r.ultimate.tab === 'ultimate' && r.ultimate.sealedTab && r.ultimate.lockOnTab
    && r.ultimate.room && /SEALED/.test(r.ultimate.says) && r.ultimate.cards === 0,
    `tab sealed ${r.ultimate.sealedTab}, lock ${r.ultimate.lockOnTab}, room "${r.ultimate.says}", `
    + `${r.ultimate.cards} cards for sale in it`);

  check('the AMMO tab still changes the strip, the way the sheet did',
    r.loadout.rows > 0 && r.loadout.slots > 0 && r.loadout.wasOn && r.loadout.changed
    && !r.closed.open && r.closed.loadout === null,
    `${r.loadout.rows} rows, ${r.loadout.slots} slots; HE on the strip ${r.loadout.wasOn}, `
    + `pressed: [${r.loadout.before}] -> [${r.loadout.after}]; closed -> loadoutOpen `
    + `${r.closed.loadout}`);
}

/*
 * ---- RESET SIMULATION asks for the word ----
 *
 * The title screen used to carry NEW RUN beside CONTINUE: `Game.start` calls
 * `forgetRun`, so it was the destructive one of the pair, wearing the quieter
 * label, one thumb-width from the button that resumes. It is gone. Starting
 * over is a small RESET SIMULATION at the foot of the screen, it only exists
 * when there is a run to destroy, and it asks you to type the word.
 *
 * A typed word rather than the SYSTEM panel's arm-and-tap-again: that one is
 * two taps deep inside a menu you went to on purpose, and this one is on the
 * first screen of the game with a whole run behind it.
 */
{
  const r = await page.evaluate(async () => {
    const { saveRun, readRun, forgetRun } = await import('../src/save.js');
    const g = window.__sim;
    const w = g.world;
    const q = (id) => document.getElementById(id);
    const shown = (id) => !!q(id) && !q(id).hidden;
    const type = (v) => {
      q('wipeWord').value = v;
      q('wipeWord').dispatchEvent(new Event('input', { bubbles: true }));
      return q('wipeGo').disabled;
    };

    // No save: nothing to reset, so no button offering to.
    forgetRun();
    g.hud.offerResume();
    const cold = { wipe: shown('wipeBtn'), resume: shown('resumeBtn'),
      start: getComputedStyle(q('startBtn')).display !== 'none',
      label: q('startBtn').textContent };

    // A save: CONTINUE is the only primary, and the reset appears under it.
    const was = w.phase;
    w.phase = 'staging';
    w.kills = 348;
    saveRun(w, g);
    w.phase = was;
    g.hud.offerResume();
    const warm = { wipe: shown('wipeBtn'), resume: shown('resumeBtn'),
      start: getComputedStyle(q('startBtn')).display !== 'none',
      label: q('resumeBtn').textContent };
    // ...and NEW RUN is gone rather than merely relabelled: nothing on this
    // screen but the reset can take the save away.
    const newRun = [...document.querySelectorAll('#boot button')]
      .filter((b) => b.offsetParent && /NEW RUN/i.test(b.textContent)).length;

    // The word. A partial does not arm it and neither does anything else.
    q('wipeBtn').click();
    const asked = { box: shown('wipeAsk'), btnGone: !shown('wipeBtn') };
    const tries = {
      empty: type(''),
      partial: type('DELET'),
      wrong: type('REMOVE'),
      lower: type('delete'),
      spaced: type('  DELETE '),
    };

    // Cancel puts it back untouched, and the save is still there.
    q('wipeNo').click();
    const cancelled = { box: shown('wipeAsk'), btn: shown('wipeBtn'), save: !!readRun() };

    // And the real thing: the save goes and a run starts.
    q('wipeBtn').click();
    type('DELETE');
    q('wipeGo').click();
    const done = { save: !!readRun(), boot: q('boot').hidden, phase: w.phase,
      box: shown('wipeAsk') };

    forgetRun();
    g.restart();
    g.hud.offerResume();
    return { cold, warm, newRun, asked, tries, cancelled, done };
  });

  check('the title offers one way in, and a reset only when there is one to make',
    r.cold.wipe === false && r.cold.resume === false && r.cold.start === true
    && r.cold.label === 'BEGIN SIMULATION'
    && r.warm.wipe === true && r.warm.resume === true && r.warm.start === false
    && r.warm.label === 'CONTINUE' && r.newRun === 0,
    `no save: ${r.cold.label} alone, reset ${r.cold.wipe}; with one: `
    + `${r.warm.label} alone, reset ${r.warm.wipe}; NEW RUN buttons left: ${r.newRun}`);

  check('...and RESET SIMULATION will not fire until DELETE is typed',
    r.asked.box && r.asked.btnGone
    && r.tries.empty && r.tries.partial && r.tries.wrong
    && r.tries.lower === false && r.tries.spaced === false,
    `disabled after — empty ${r.tries.empty}, DELET ${r.tries.partial}, REMOVE `
    + `${r.tries.wrong}; and armed by "delete" ${!r.tries.lower} and by "  DELETE " `
    + `${!r.tries.spaced}`);

  check('...cancelling changes nothing, and typing it wipes the run and begins one',
    r.cancelled.box === false && r.cancelled.btn === true && r.cancelled.save === true
    && r.done.save === false && r.done.boot === true && r.done.phase === 'staging'
    && r.done.box === false,
    `cancelled: box ${r.cancelled.box}, save still there ${r.cancelled.save}; `
    + `confirmed: save ${r.done.save}, title ${r.done.boot ? 'gone' : 'STILL UP'}, `
    + `phase ${r.done.phase}`);
}

/*
 * ---- build 232: the bench ----
 *
 * SANDBOX is a tool bought from the tree: a field with no run in it, where
 * anything already destroyed can be put down and what the kit is doing to it
 * read off a counter. Six things have to hold, and the last of them is the
 * only one that matters -- a counter that is wrong is worse than no counter,
 * because it will be believed.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { codex } = await import('../src/codex.js');
    const { ledger } = await import('../src/ledger.js');
    const { makerOf } = await import('../src/anomaly.js');
    const { readRun } = await import('../src/save.js');
    const out = {};
    const tab = () => document.querySelector('[data-tab="sandbox"]');

    // ---- the door ------------------------------------------------------
    g.restart();
    g.hud.menu.syncSandbox();
    out.shutTab = !!tab() && tab().classList.contains('sealed');
    out.refused = g.enterSandbox();
    g.debugGiveEnergy(60000);
    out.bought = g.buy('sandbox');
    g.hud.menu.syncSandbox();
    out.openTab = !tab().classList.contains('sealed') && tab().classList.contains('unlocked');
    out.price = 20000;

    // ---- in, and what is not there --------------------------------------
    g.restart();
    g.debugGiveEnergy(60000);
    g.buy('sandbox');
    out.entered = g.enterSandbox();
    out.flag = w.sandbox;
    out.chrome = document.body.classList.contains('sandbox');
    const seen0 = w.enemies.length;
    const fuse0 = w.director.glitch;
    for (let f = 0; f < 60 * 14; f++) g.update(1 / 60);
    out.noWaves = w.enemies.length === seen0;
    out.noFuse = w.director.glitch === fuse0;

    // nothing is earned, and nothing is written down
    codex.unlockAll();
    const sb = g.sandbox;
    sb.pick.id = 'lurcher';
    sb.pick.count = 5;
    sb.pick.where = 'field';
    sb.spawn();
    const purse = w.energy;
    const drops = w.drops.length;
    for (const e of [...w.enemies]) if (!e.dummy) e.destroy(w);
    for (let f = 0; f < 60; f++) g.update(1 / 60);
    out.noEnergy = w.energy === purse;
    out.noSalvage = w.drops.length === drops;
    // `checkpoint` refuses from inside, so what is on disk is the run
    const before = JSON.stringify(readRun());
    g.checkpoint();
    out.noWrite = JSON.stringify(readRun()) === before;

    // ---- only what has been destroyed ------------------------------------
    codex.forget();
    out.shutWhenUnseen = !sb.allowed('bulwark');
    codex.unlockAll();
    out.openWhenSeen = sb.allowed('bulwark');

    // ---- an anomaly, as an object ----------------------------------------
    sb.pick.id = 'lurcher';
    sb.pick.count = 4;
    sb.spawn();
    const field = w.enemies.filter((e) => !e.dead && !e.type.fixed).length;
    out.summoned = g.summonSandboxBoss(1, makerOf(1));
    out.fieldKept = w.enemies.filter((e) => !e.dead && !e.type.fixed).length >= field;
    out.noAperture = w.apertures.every((x) => !x);
    for (let f = 0; f < 60 * 3; f++) g.update(1 / 60);
    out.noLine = w.bossLine === null;
    const rec = w.reconciled.length;
    const tier = w.director.tier;
    g.endSandboxBoss();
    out.noReward = w.reconciled.length === rec && w.director.tier === tier && !w.boss;

    // ---- and out ---------------------------------------------------------
    out.left = g.exitSandbox();
    out.outFlag = w.sandbox === false;
    out.ledgerOff = ledger.on === false;
    out.chromeBack = !document.body.classList.contains('sandbox');

    /*
     * ---- the counter, against the health it claims to have taken ---------
     *
     * The ledger books inside `applyDamage`, past ARMORED's discard, past the
     * plate, past a HERALD's ward and past the `Math.max(1, ...)` floor -- so
     * its total for a source must equal the health that source actually took
     * off a body, to the digit. Measured on a body that is NOT a dummy: a
     * dummy is healed every frame, so `start - hp` on one is zero by
     * construction and would prove nothing whatever the ledger said.
     *
     * Four rounds, because a counter that is right for BOLT and wrong for the
     * three whose damage does not come out of the muzzle is the failure this
     * is actually guarding against -- HE's blast, ARC's chain and SPINE's
     * splinters are all booked at a different site from the dart.
     */
    const meter = (round) => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      ledger.arm(true);
      w.round = round;
      const s = w.shooter;
      const e = g.debugSpawn('bulwark', s.x, s.y - 300);
      e.staged = false;
      e.spawnIn = 0;
      e.hp = 4e7;
      e.maxHp = 4e7;
      e.invMass = 0;
      const hp0 = e.hp;
      w.autoAim = true;
      w.autoFire = true;
      for (let f = 0; f < 60 * 6; f++) {
        e.x = s.x; e.y = s.y - 300; e.vx = 0; e.vy = 0;
        s.aim = -Math.PI / 2; s.targetAim = s.aim;
        g.update(1 / 60);
      }
      const row = ledger.table().find((q) => q.src === round);
      const res = {
        round,
        took: +(hp0 - e.hp).toFixed(2),
        booked: +ledger.total.toFixed(2),
        mine: row ? +row.total.toFixed(2) : 0,
      };
      ledger.arm(false);
      w.autoAim = false;
      w.autoFire = false;
      return res;
    };
    out.meters = ['standard', 'explosive', 'arc', 'spine'].map(meter);

    // ---- the dummy does not die, and does not pay ------------------------
    g.restart();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    g.debugGiveEnergy(60000);
    g.buy('sandbox');
    g.enterSandbox();
    g.sandbox.dummy();
    const d = w.enemies.find((e) => e.dummy);
    const kills0 = w.kills;
    const purse0 = w.energy;
    if (d) { d.x = w.shooter.x; d.y = w.shooter.y - 300; }
    w.autoAim = true;
    w.autoFire = true;
    for (let f = 0; f < 60 * 8; f++) g.update(1 / 60);
    out.dummyAlive = !!d && !d.dead && d.hp === d.maxHp;
    // UNCHANGED, not zero: the run bought SANDBOX out of a stocked purse two
    // lines up, so it has forty thousand left. The first version of this
    // asserted `energy === 0` and failed on a working build.
    out.dummyPaidNothing = w.kills === kills0 && w.energy === purse0;
    out.dummyTookFire = ledger.total > 0;
    w.autoAim = false;
    w.autoFire = false;
    g.exitSandbox();
    g.restart();
    return out;
  });

  check('SANDBOX is shut until it is bought, and the tab says which',
    r.shutTab && r.refused === false && r.bought === 'ok' && r.openTab,
    `unbought: tab sealed ${r.shutTab}, enterSandbox() ${r.refused}; `
    + `bought for ${r.price}: tab open ${r.openTab}`);

  check('the bench has no waves, no fuse, no energy and writes nothing down',
    r.entered && r.flag && r.chrome && r.noWaves && r.noFuse
    && r.noEnergy && r.noSalvage && r.noWrite,
    `fourteen seconds in: waves ${r.noWaves}, glitch fuse ${r.noFuse}, `
    + `purse ${r.noEnergy}, salvage ${r.noSalvage}, checkpoint refused ${r.noWrite}`);

  check('...and only what this device has destroyed may be put down',
    r.shutWhenUnseen && r.openWhenSeen,
    `with the codex forgotten a BULWARK is ${r.shutWhenUnseen ? 'shut' : 'OPEN'}; `
    + `once seen it is ${r.openWhenSeen ? 'open' : 'STILL SHUT'}`);

  /*
   * The real door hauls in and destroys everything already on the field, puts
   * a banner up, spends an APERTURE and pays a RECONCILED and a rung on the
   * way out. A summon here is the constructor and the sky and nothing else.
   */
  check('a summoned anomaly is an object: no cost, no ceremony, and the field is left alone',
    r.summoned && r.fieldKept && r.noAperture && r.noLine && r.noReward,
    `field kept ${r.fieldKept}, apertures unspent ${r.noAperture}, `
    + `boss silent ${r.noLine}, ending paid nothing ${r.noReward}`);

  check('...and leaving hands the run back',
    r.left && r.outFlag && r.ledgerOff && r.chromeBack,
    `sandbox ${r.outFlag}, ledger disarmed ${r.ledgerOff}, chrome back ${r.chromeBack}`);

  /*
   * The one that matters. A counter that is wrong is worse than no counter.
   */
  const bad = (r.meters || []).filter(
    (m) => !(m.took > 0) || Math.abs(m.took - m.booked) > Math.max(0.5, m.took * 0.002)
      || Math.abs(m.mine - m.booked) > 0.5);
  check('the counter books exactly the health it took, by source',
    bad.length === 0,
    (r.meters || []).map((m) => `${m.round}: took ${m.took}, booked ${m.booked} `
      + `(${m.mine} to its own row)`).join('; '));

  check('a practice dummy does not die, does not count and does not pay',
    r.dummyAlive && r.dummyPaidNothing && r.dummyTookFire,
    `alive on full health ${r.dummyAlive}, nothing counted or banked `
    + `${r.dummyPaidNothing}, and it was actually being shot ${r.dummyTookFire}`);
}

/*
 * ---- build 233: what the picker offers, and what the counter books ----
 *
 * Two separate promises. The picker is the field and nothing an anomaly puts
 * down -- a boss is summoned WHOLE from the row underneath, because a bare
 * ORDINAL core with none of its frame is not the fight and a DIGIT with no
 * ORDINAL to have come off is not an object. And every damage path in the
 * game books to the name a player would look for it under.
 *
 * The second is the one worth the runtime. The ledger's TOTAL matching the
 * health a body lost only proves nothing is MISSING: a site that passes no
 * source still books, under `unattributed`. Four things were wrong when this
 * was first swept -- PULSE's blast had no source at all, HAIL's darts and
 * PRISM's shell fell through `fire`'s default and were booked to the LOADED
 * ROUND, and a BLOOM taking its neighbours with it was unattributed -- and
 * every one of them passed a total-only check.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { ledger } = await import('../src/ledger.js');
    const { NODES } = await import('../src/tree.js');
    const { ARSENAL } = await import('../src/arsenal.js');
    const { ABILITIES } = await import('../src/abilities.js');
    const { ANOMALIES } = await import('../src/anomaly.js');
    const { throwMine } = await import('../src/mines.js');
    const { freshUpgrades } = await import('../src/upgrades.js');
    const { codex } = await import('../src/codex.js');
    const out = {};

    // ---- the picker ------------------------------------------------------
    codex.unlockAll();
    g.restart();
    g.debugGiveEnergy(60000);
    g.buy('sandbox');
    g.enterSandbox();
    const sb = g.sandbox;
    const offered = [...sb.chips.keys()];
    const anomalyIds = new Set(ANOMALIES.flatMap((a) => a.types));
    out.offered = offered.length;
    out.leaked = offered.filter((id) => anomalyIds.has(id));
    out.bossRow = [...sb.bossChips.keys()].length;
    out.bossRowOpen = [...sb.bossChips.values()].filter((b) => !b.disabled).length;
    g.exitSandbox();

    // ---- every damage path -----------------------------------------------
    const setup = () => {
      g.restart();
      g.debugTeachAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.up = freshUpgrades();
      g.debugGiveEnergy(400000);
      for (let p = 0; p < 4; p++) for (const n of NODES) if (n.id) g.buy(n.id);
      w.mines.length = 0;
      w.projectiles.length = 0;
      w.effects.length = 0;
      w.drops.length = 0;
      w.debris.length = 0;
      ledger.arm(true);
    };
    /*
     * A wall that cannot die, cannot move and carries no armour, plate or
     * ward -- so `took` is the delivered number and nothing about the BODY is
     * in the reading. Nine hundred million health, because VOID deletes it
     * whatever the number and the point is that the number does not matter.
     */
    const wall = (dy) => {
      const s = w.shooter;
      const e = g.debugSpawn('bulwark', s.x, s.y - dy);
      e.staged = false;
      e.spawnIn = 0;
      e.hp = 9e8;
      e.maxHp = 9e8;
      e.invMass = 0;
      e.armor = 0;
      e.ward = 0;
      e.traits = [];
      return e;
    };
    const run = (e, seconds, tick) => {
      const s = w.shooter;
      const hp0 = e.hp;
      const home = { x: e.x, y: e.y };
      for (let f = 0; f < 60 * seconds; f++) {
        e.x = home.x; e.y = home.y; e.vx = 0; e.vy = 0;
        s.aim = -Math.PI / 2; s.targetAim = s.aim;
        if (tick) tick(f);
        g.update(1 / 60);
      }
      const rows = ledger.table();
      const res = {
        took: +(hp0 - e.hp).toFixed(1),
        booked: +ledger.total.toFixed(1),
        kills: ledger.kills,
        unattr: (rows.find((q) => q.src === 'unattributed') || {}).total || 0,
        rows: rows.map((q) => [q.src, +q.total.toFixed(1), q.kills]),
      };
      ledger.arm(false);
      w.autoAim = false;
      w.autoFire = false;
      return res;
    };
    const share = (res, key) => {
      const row = res.rows.find((q) => q[0] === key);
      return row && res.booked > 0 ? row[1] / res.booked : 0;
    };

    out.rounds = [];
    for (const a of ARSENAL.filter((x) => x.kind === 'round')) {
      setup();
      w.round = a.key;
      const e = wall(300);
      w.autoAim = true;
      w.autoFire = true;
      const res = run(e, 4);
      out.rounds.push({ key: a.key, label: a.label, ...res, share: share(res, a.key) });
    }

    out.mines = [];
    for (const a of ARSENAL.filter((x) => x.kind === 'mine')) {
      setup();
      const e = wall(320);
      throwMine(w, a.key);
      const m = w.mines[w.mines.length - 1];
      m.x1 = e.x;
      m.y1 = e.y + 30;
      if (a.key === 'wire') { m.ax = e.x - 150; m.bx = e.x + 150; m.ay = e.y; m.by = e.y; }
      const res = run(e, 20);
      out.mines.push({ key: a.key, label: a.label, ...res, share: share(res, a.key) });
    }

    out.abilities = [];
    for (let i = 0; i < ABILITIES.length; i++) {
      setup();
      const a = ABILITIES[i];
      w.loadout.abilities = ABILITIES.map((x) => x.id);
      const e = wall(150);
      const res = run(e, 14, (f) => { if (f === 30) g.useAbility(i); });
      out.abilities.push({ key: a.id, label: a.name, ...res, share: share(res, a.id) });
    }

    // ---- VOID books a kill, and does not take a dummy ---------------------
    setup();
    g.buy('sandbox');
    g.enterSandbox();
    g.sandbox.dummy();
    const d = w.enemies.find((x) => x.dummy);
    if (d) { d.x = w.shooter.x; d.y = w.shooter.y - 300; }
    throwMine(w, 'void');
    const vm = w.mines[w.mines.length - 1];
    vm.x1 = d ? d.x : w.shooter.x;
    vm.y1 = d ? d.y : w.shooter.y - 300;
    for (let f = 0; f < 60 * 8; f++) {
      if (d) { d.x = w.shooter.x; d.y = w.shooter.y - 300; d.vx = 0; d.vy = 0; }
      g.update(1 / 60);
    }
    out.dummySurvivedVoid = !!d && !d.dead;
    g.exitSandbox();
    g.restart();
    w.up = freshUpgrades();
    return out;
  });

  check('the picker offers the field, and an anomaly is summoned whole or not at all',
    r.leaked.length === 0 && r.offered > 10 && r.bossRow === 7 && r.bossRowOpen === 7,
    `${r.offered} field objects offered and ${r.leaked.length} anomaly ids leaked `
    + `(${r.leaked.join(', ') || 'none'}); the ANOMALIES row carries `
    + `${r.bossRow}, ${r.bossRowOpen} of them open`);

  /*
   * Asserted as WHICH ROWS EXIST, not as a share of the total.
   *
   * A share is the wrong instrument here and the first version of this used
   * one. PILE is on the TURRET branch, fires on a clock of its own and lands
   * on the same wall, so the source under test never owns 100% of a long
   * window -- PULSE read 58% over six seconds and 41% over twelve, which is
   * the window moving and not the game. What is actually being claimed is
   * that every point booked has a name a player would look for it under, so
   * that is what is checked: the source's own row is not empty, and no row
   * exists that is not the source, PILE, or body-on-body contact.
   *
   * `unattributed` is the row this exists to catch. Four things landed in it
   * on the first sweep -- PULSE's blast carried no source at all, HAIL's
   * darts and PRISM's shell fell through `fire`'s default to the LOADED
   * ROUND, and a BLOOM's death blast was nameless -- and every one of them
   * passed a total-only check, because a nameless hit still adds up.
   */
  const EXTRA = new Set(['pile', 'contact']);
  const stray = (x) => x.rows.filter((q) => q[0] !== x.key && !EXTRA.has(q[0]));
  const bad = (list, wantsDamage = true) => list.filter((x) => x.unattr > 0
    || Math.abs(x.took - x.booked) > Math.max(1, x.took * 0.002)
    || stray(x).length > 0
    || (wantsDamage && !(x.share > 0)));
  const say = (list) => list.map((x) => {
    const s2 = stray(x);
    return `${x.label} ${(x.share * 100).toFixed(0)}%${s2.length ? ` STRAY:${s2.map((q) => q[0]).join('+')}` : ''}`;
  }).join(' ');

  check('every round books its damage to its own name and to no other',
    bad(r.rounds || []).length === 0 && (r.rounds || []).length === 9,
    say(r.rounds || []));

  /*
   * SNARE and VOID are the two exceptions and both are by design: a snare's
   * damage is the crowd grinding against itself, which a single pinned wall
   * cannot do, and VOID has no damage at all -- it removes a body through
   * `Enemy.destroy`, which never reaches `applyDamage`, so its whole
   * contribution is a kill and the ledger books it as one. LODE has no damage
   * of its own either and still has a row, because SALTED gives a spent mine
   * a blast and it is booked to the kind that left it.
   */
  const mines = (r.mines || []).filter((x) => x.key !== 'snare' && x.key !== 'void');
  const voidRow = (r.mines || []).find((x) => x.key === 'void');
  const snare = (r.mines || []).find((x) => x.key === 'snare');
  check('every mine books its damage to its own name, and the two that have none say so',
    bad(mines).length === 0 && mines.length === 6
    && !!snare && snare.booked === 0
    && !!voidRow && voidRow.booked === 0 && voidRow.kills === 1,
    `${say(mines)}; SNARE books ${snare ? snare.booked : '?'} (its damage is the `
    + `knot grinding), VOID ${voidRow ? voidRow.booked : '?'} damage and `
    + `${voidRow ? voidRow.kills : '?'} kill`);

  const abl = (r.abilities || []).filter((x) => x.key !== 'stasis');
  const stasis = (r.abilities || []).find((x) => x.key === 'stasis');
  check('every ability books its damage to its own name, and STASIS has none to book',
    bad(abl).length === 0 && abl.length === 7
    && !!stasis && stasis.share === 0 && stray(stasis).length === 0,
    `${say(abl)}; STASIS does no damage of its own`);

  check('...and VOID will not take a practice dummy',
    r.dummySurvivedVoid,
    `the dummy is ${r.dummySurvivedVoid ? 'still there' : 'GONE'} after walking a VOID`);
}

/*
 * ---- build 234: the rates, and the thing they are read off ----
 *
 * The counter was one three-second window redrawn sixty times a second, which
 * is two faults compounding: a weapon fired one and a half times a second
 * moves a three-second window by a third on every round, and redrawing that
 * every frame made a four-digit number that flickered continuously. There are
 * three windows off one ring now and the bar shows the ten.
 *
 * And the dummy is the same reading in a form you can watch: a mark per hit
 * sized by that hit, and five bands of sustained state that arrive as
 * different ELEMENTS rather than as more of the same one -- because a state
 * that lives only in a hue is a state a colourblind player never receives.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { ledger, WINDOWS, BAR_WINDOW } = await import('../src/ledger.js');
    const { NODES } = await import('../src/tree.js');
    const { freshUpgrades } = await import('../src/upgrades.js');
    const { codex } = await import('../src/codex.js');
    const { BANDS, bandOf, placeDummy, drawDummy, updateDummy, DUMMY } =
      await import('../src/dummy.js');
    const { CFG, GRID_CELL } = await import('../src/config.js');
    const out = { windows: WINDOWS, bar: BAR_WINDOW, bands: BANDS };

    // ---- a window is a window --------------------------------------------
    /*
     * Two bursts, forty seconds apart, read at the end. Every window has to
     * give a different answer or they are not windows: the three sees only
     * the second, the thirty sees only the second as well but averages it
     * over its own span, and the run average carries both over the whole
     * clock. Forty seconds and not twenty, because the denominator is
     * `min(win, elapsed)` -- with less history than the window, the thirty and
     * the run average are the same number BY DESIGN, and a case that stopped
     * there would have proved nothing about either.
     */
    ledger.arm(true);
    for (let i = 0; i < 10; i++) ledger.note('standard', 100);
    ledger.tick(1);
    out.fresh3 = +ledger.rate(3).toFixed(1);
    for (let i = 0; i < 40; i++) ledger.tick(1);
    ledger.note('standard', 500);
    ledger.tick(1);
    out.old3 = +ledger.rate(3).toFixed(1);
    out.old30 = +ledger.rate(30).toFixed(1);
    out.run = +(ledger.total / ledger.t).toFixed(1);
    out.elapsed = +ledger.t.toFixed(1);
    ledger.arm(false);

    // ---- the bar does not redraw every frame ------------------------------
    g.restart();
    g.debugGiveEnergy(60000);
    g.buy('sandbox');
    g.enterSandbox();
    const sb = g.sandbox;
    const real = sb.syncStats.bind(sb);
    let calls = 0;
    sb.syncStats = () => { calls++; real(); };
    sb.show('stats');
    calls = 0;
    for (let f = 0; f < 60; f++) sb.update(1 / 60);
    out.syncsPerSecond = calls;
    sb.syncStats = real;
    sb.show('');
    out.barLabel = (document.querySelector('#sbDps em') || {}).textContent || '';

    // ---- the dummy is bigger, further out, and inside the ceiling --------
    const d = placeDummy(g);
    out.r = d ? d.r : 0;
    out.up = +(w.shooter.y - (d ? d.y : 0)).toFixed(0);
    out.cell = GRID_CELL;
    g.exitSandbox();

    // ---- every band is reachable ------------------------------------------
    /*
     * With real weapons against a real dummy, not by writing a number into
     * the rig. Four of the game's own things, chosen because between them
     * they cover the ladder: a stock BOLT for the bottom, and a bought BOLT,
     * SCATTER and TITHE for the rest.
     */
    const reach = (round, seconds, buy) => {
      g.restart();
      g.debugTeachAll();
      codex.unlockAll();
      g.debugClearField();
      w.phase = 'staging';
      w.spawnLock = 1e9;
      w.director.update = () => {};
      w.up = freshUpgrades();
      if (buy) {
        g.debugGiveEnergy(400000);
        for (let p = 0; p < 4; p++) for (const n of NODES) if (n.id) g.buy(n.id);
      }
      w.sandbox = true;
      ledger.arm(true);
      placeDummy(g);
      w.round = round;
      w.autoAim = true;
      w.autoFire = true;
      let peak = 0;
      for (let f = 0; f < 60 * seconds; f++) {
        w.shooter.aim = -Math.PI / 2;
        w.shooter.targetAim = w.shooter.aim;
        g.update(1 / 60);
        peak = Math.max(peak, ledger.live());
      }
      w.autoAim = false;
      w.autoFire = false;
      ledger.arm(false);
      w.sandbox = false;
      return { peak: +peak.toFixed(0), band: bandOf(peak) };
    };
    out.reach = {
      stock: reach('standard', 6, false),
      bolt: reach('standard', 6, true),
      scatter: reach('shotgun', 6, true),
      tithe: reach('tithe', 7, true),
    };

    // ---- and every band is a different picture ---------------------------
    /*
     * Rendered by hand onto an offscreen canvas, because judging an effect off
     * live screenshots measures the frame loop and not the effect -- a rule
     * this project already paid for once. Two measures per band, so a change
     * that is only a hue is not enough: how much of the frame is lit, and how
     * much of it is OUTSIDE the rig's own rim, which is what the brackets, the
     * broken ring and the ground bloom each add.
     */
    const S = 240;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const x = c.getContext('2d');
    const pics = [];
    const liveWas = ledger.live;
    const onWas = ledger.on;
    for (let band = 0; band <= BANDS.length; band++) {
      const lo = band === 0 ? 0 : BANDS[band - 1];
      const hi = band < BANDS.length ? BANDS[band] : BANDS[BANDS.length - 1] * 1.6;
      const dps = band === 0 ? 0 : (lo + hi) / 2;
      const e = { x: S / 2, y: S / 2, r: DUMMY.r, dummy: true };
      ledger.on = true;
      ledger.live = () => dps;
      for (let f = 0; f < 60 * 4; f++) updateDummy(e, 1 / 60);
      ledger.live = liveWas;
      ledger.on = onWas;
      x.clearRect(0, 0, S, S);
      x.fillStyle = '#0b1116';
      x.fillRect(0, 0, S, S);
      drawDummy(x, e);
      const px = x.getImageData(0, 0, S, S).data;
      let lit = 0;
      let far = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (Math.max(px[i], px[i + 1], px[i + 2]) < 40) continue;
        lit++;
        const j = i / 4;
        if (Math.hypot((j % S) - S / 2, ((j / S) | 0) - S / 2) > DUMMY.r * 1.05) far++;
      }
      pics.push({ band, dps: Math.round(dps), lit, far, drew: e.dummyBand });
    }
    out.pics = pics;

    // ---- a mark is sized by the hit that made it -------------------------
    /*
     * Two hits an order of magnitude apart on the same dummy, and the marks
     * they leave compared. This is the per-hit channel, and it is the one
     * that would be silently lost: the rig's own state would go on working
     * perfectly while every round looked identical.
     */
    g.restart();
    g.debugClearField();
    w.phase = 'staging';
    w.spawnLock = 1e9;
    w.director.update = () => {};
    w.sandbox = true;
    ledger.arm(true);
    const dd = placeDummy(g);
    w.effects.length = 0;
    dd.applyDamage(w, 12, 0, -1, 0, 0, 0, false, 'standard');
    const small = w.effects[w.effects.length - 1];
    dd.applyDamage(w, 900, 0, -1, 0, 0, 0, false, 'slug');
    const big = w.effects[w.effects.length - 1];
    out.mark = {
      made: w.effects.length,
      smallW: small ? +small.w.toFixed(3) : 0,
      bigW: big ? +big.w.toFixed(3) : 0,
      smallText: small ? small.text : '',
      bigText: big ? big.text : '',
      // the marks sit on the FACE the hit came from, not at the centre
      onFace: !!small && Math.abs(Math.hypot(small.x - dd.x, small.y - dd.y) - dd.r * 0.92) < 2,
    };
    ledger.arm(false);
    w.sandbox = false;
    g.restart();
    w.up = freshUpgrades();
    void CFG;
    return out;
  });

  check('there are three windows on one ring, and they disagree the way windows do',
    JSON.stringify(r.windows) === '[3,10,30]' && r.bar === 10
    // 1000 and not 1000/3: the denominator is `min(win, elapsed)`, and one
    // second in there is only a second of history to divide by. A window
    // cannot report a rate over time that has not happened.
    && Math.abs(r.fresh3 - 1000) < 0.5
    && Math.abs(r.old3 - 500 / 3) < 0.5
    && Math.abs(r.old30 - 500 / 30) < 0.5
    && Math.abs(r.run - 1500 / r.elapsed) < 0.5,
    `1000 at the start and 500 forty seconds later, read at ${r.elapsed}s: `
    + `the 3s says ${r.old3}, the 30s says ${r.old30}, the run average says `
    + `${r.run} (and the 3s read ${r.fresh3} on the first burst)`);

  check('...and the bar is the ten, redrawn four times a second and not sixty',
    r.syncsPerSecond === 4 && /10s/.test(r.barLabel),
    `${r.syncsPerSecond} refreshes in a second of frames, labelled "${r.barLabel}"`);

  check('the dummy is bigger and further out, and inside the broadphase ceiling',
    r.r === 68 && r.up === 420 && r.r * 2 <= r.cell,
    `radius ${r.r} against a BULWARK's 45 and a cell of ${r.cell}; standing `
    + `${r.up} units up-field`);

  /*
   * The bands are only worth having if the turret can get to them. Stock is
   * band 1 and a fully bought one walks the rest: BOLT to 3, SCATTER to 4 and
   * TITHE past 1,800 into 5.
   */
  const R = r.reach || {};
  check('a fully upgraded turret reaches every band the dummy can show',
    R.stock && R.stock.band >= 1 && R.bolt && R.bolt.band >= 3
    && R.scatter && R.scatter.band >= 4 && R.tithe && R.tithe.band >= 5,
    `stock BOLT ${R.stock && R.stock.peak}/band ${R.stock && R.stock.band}; `
    + `bought BOLT ${R.bolt && R.bolt.peak}/${R.bolt && R.bolt.band}, `
    + `SCATTER ${R.scatter && R.scatter.peak}/${R.scatter && R.scatter.band}, `
    + `TITHE ${R.tithe && R.tithe.peak}/${R.tithe && R.tithe.band}`);

  const pics = r.pics || [];
  const steps = pics.slice(1).map((p, i) => ({
    band: p.band,
    lit: p.lit / Math.max(1, pics[i].lit),
    far: p.far - pics[i].far,
  }));
  check('...and every band draws a different picture, by more than its colour',
    pics.length === 6 && pics.every((p) => p.drew === p.band)
    && steps.every((s) => s.lit > 1.15 || s.far > 400),
    steps.map((s) => `${s.band}: x${s.lit.toFixed(2)} lit, ${s.far > 0 ? '+' : ''}${s.far} outside`).join('  '));

  const m = r.mark || {};
  check('a hit leaves a mark on the face, sized by the hit',
    m.made === 2 && m.bigW > m.smallW * 3 && m.smallText === '12'
    && m.bigText === '900' && m.onFace,
    `12 damage -> weight ${m.smallW} "${m.smallText}"; 900 -> ${m.bigW} `
    + `"${m.bigText}"; struck face ${m.onFace}`);
}

// --- report -----------------------------------------------------------------
console.log('');
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? '  ok  ' : '  FAIL'}  ${r.name}${r.pass || !r.detail ? '' : `\n         ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed, ${errors.length} console/page errors`);
for (const e of errors.slice(0, 8)) console.log(`  ! ${e}`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
