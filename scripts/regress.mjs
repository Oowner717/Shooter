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
 */
{
  const r = await page.evaluate(() => {
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
  check('the title clears the menu\'s floor, and nothing hangs off the screen',
    r.bad.length === 0 && r.seen > 6 && r.footBottom <= r.vh,
    `${r.seen} read; failing: ${r.bad.slice(0, 5)}; foot ${r.footBottom}/${r.vh}`);
  check('the title teaches the two ways to shoot and leaves the rest to the run',
    r.keys === 2, `${r.keys} control rows on the title`);
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
    w.shooter.cooldown = 0;
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
    for (let i = 0; i < 10; i++) { w.shooter.cooldown = 0; w.shooter.shoot(w); }
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
    for (const tab of ['system', 'codex', 'tree']) {
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
    for (const tab of ['tree', 'codex', 'system']) {
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
 * finished one: screenshot it owning nothing, buy all 136 levels, screenshot
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
    // 137 since build 169, when SPIRAL gained COUNTERSPIN -- the first
    // shaping upgrade any ability has ever had under it.
    num(r.bare.count) < num(r.full.count) && num(r.full.count) === 137
    && /TURRET 17\/17/.test(r.full.count) && !/TURRET 17\/17/.test(r.bare.count),
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
 * The seven ways in ARE a sequence, and that one is enforced in the tree
 * rather than implied by furniture: each is shut until the boss before it has
 * been put down.
 *
 * ORDER. The section is headed YOUR MACHINE and it opened on ANOMALY, which
 * is a boss door, not the machine. The turret leads; the doors are last.
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
    for (const name of ['ANOMALY', 'TURRET']) {
      rows.find((x) => x.querySelector('.branchName').textContent === name).click();
    }
    const dead = [...document.querySelectorAll('.shopCard')].filter((c) => {
      if (!c.offsetParent) return false;
      const mt = c.querySelector('.shopMeter');
      return mt && !mt.children.length && getComputedStyle(mt).visibility !== 'hidden';
    }).length;
    const doorsNow = () => [...document.querySelectorAll('.branchGrid .shopCard')]
      .filter((c) => c.offsetParent && /APERTURE/.test(c.querySelector('.shopName').textContent))
      .map((c) => c.classList.contains('locked'));
    rows.find((x) => x.querySelector('.branchName').textContent === 'ANOMALY').click();
    const first = doorsNow();
    // ...and once the first boss is reconciled, exactly one more opens.
    g.world.reconciled.push(1);
    m.syncTree();
    const after = doorsNow();
    // Put it back: a reconciled boss left behind changes what later cases
    // find available.
    g.world.reconciled.length = 0;
    m.syncTree();
    m.setOpen(false);
    return { order, spill, dead, first, after,
      shelf: !!document.querySelector('.shelf'), next: !!document.getElementById('treeNext') };
  });
  check('nothing in the shop suggests an order to buy in',
    !r.shelf && !r.next, `shelf ${r.shelf}, next line ${r.next}`);
  check('the ways in are the one sequence, and each waits for the one before',
    r.first.length === 7 && r.first[0] === false && r.first.slice(1).every(Boolean)
    && r.after[0] === false && r.after[1] === false && r.after.slice(2).every(Boolean),
    `shut at start ${r.first.filter(Boolean).length}/7; `
    + `after the first is put down ${r.after.filter(Boolean).length}/7`);
  check('the machine leads and the doors come last, with no name overflowing',
    r.order[0] === 'TURRET' && r.order[r.order.length - 1] === 'ANOMALY'
    && r.spill.length === 0 && r.dead === 0,
    JSON.stringify({ order: r.order, spill: r.spill, deadTracks: r.dead }));
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
    w.kills = 0;
    d.shuffle(w);           // a rotation decided when almost nothing is unlocked
    const before = d.order.length;
    const missing = WAVES.map((wv, i) => i).filter((i) => !WAVES[i].teach && !d.order.includes(i));
    w.kills = 9999;         // everything is unlocked now, mid-rotation
    d.begin(w);
    const after = d.order.length;
    const stillMissing = missing.filter((i) => !d.order.includes(i));
    // ...and nothing already played is replayed by the splice. `<`, not `<=`:
    // begin() admits and then steps forward, so a wave spliced at the very
    // next slot lands exactly on the playhead and is played immediately,
    // which is the point of admitting it.
    const ahead = missing.filter((i) => { const k = d.order.indexOf(i); return k >= 0 && k < d.at; });
    return { before, after, wanted: missing.length, stillMissing: stillMissing.length, behindPlayhead: ahead.length,
             names: stillMissing.map((i) => JSON.stringify(WAVES[i].of)) };
  });
  check('a wave that unlocks mid-rotation joins the rotation it unlocked during',
    r.wanted > 0 && r.stillMissing === 0 && r.behindPlayhead === 0,
    `rotation ${r.before} -> ${r.after}, ${r.wanted} newly eligible, ${r.stillMissing} still absent`
    + `${r.names.length ? ` (${r.names.join(' ')})` : ''}, ${r.behindPlayhead} spliced behind the playhead`);
}

// --- ...and every type is actually met in a run ------------------------------
// The other half, driven: the real Director on a fast clock with the field
// cleared each step, so the player is a perfect one and unlocks land on time.
// A type met in under half of runs is content most players will never see.
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
      d.load = (world, wave) => { played.add(WAVES.indexOf(wave)); return realLoad(world, wave); };
      while (w.released < CFG.killGoal && guard++ < 40000) {
        d.update(w, 0.7);
        for (const e of w.enemies) e.dead = true;
        w.enemies.length = 0;
        for (const dr of w.drops) dr.dead = true;
        w.drops.length = 0;
        w.kills = w.released;
      }
      d.load = realLoad;
      for (const i of played) for (const [id] of WAVES[i].of) seen[id] = (seen[id] || 0) + 1;
    }
    const types = [...new Set(WAVES.flatMap((wv) => wv.of.map(([id]) => id)))];
    types.sort((a, b) => (TYPE_BY_ID[a].unlock || 0) - (TYPE_BY_ID[b].unlock || 0));
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
 * The measure is against the same object with the turret silent, because that
 * is the claim: being shot at may slow an object down, it may not park it.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const S = w.shooter;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    const clear = () => { for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
                          for (const d of [...w.drops]) d.dead = true; w.drops.length = 0; };
    const SECONDS = 26;
    const trial = (type, fire) => {
      clear();
      w.autoAim = fire; w.autoFire = fire;
      const e = g.debugSpawn(type, S.x + 40, 180);
      e.staged = false; e.spawnIn = 0;
      e.route = { id: 'direct', width: 0, weave: 0, commit: 1 };
      e.hp = 1e9; e.maxHp = 1e9; // it is here to be pushed, not killed
      const start = Math.hypot(e.x - S.x, e.y - S.y);
      let far = start;
      let arrived = null;
      for (let s = 0; s < SECONDS * 30; s++) {
        g.update(1 / 30);
        const d = Math.hypot(e.x - S.x, e.y - S.y);
        far = Math.max(far, d);
        if (d < 90) { arrived = +(s / 30).toFixed(1); break; }
      }
      const end = arrived === null ? Math.hypot(e.x - S.x, e.y - S.y) : 90;
      clear();
      return { arrived, start: Math.round(start), far: Math.round(far), end: Math.round(end),
        closed: Math.round(start - end) };
    };
    const out = {};
    for (const type of ['lurcher', 'bulwark']) {
      out[type] = { quiet: trial(type, false), fire: trial(type, true) };
    }
    w.autoAim = false; w.autoFire = false;
    return out;
  });
  const share = (o) => o.fire.closed / Math.max(1, o.quiet.closed);
  const ok = r.lurcher.fire.arrived !== null
    && share(r.lurcher) >= 0.7 && share(r.bulwark) >= 0.7
    && r.lurcher.fire.far < r.lurcher.fire.start * 1.2
    && r.bulwark.fire.far < r.bulwark.fire.start * 1.2;
  check('a body under sustained fire still closes on the turret', ok,
    Object.entries(r).map(([k, o]) => `${k} closed ${o.fire.closed}/${o.quiet.closed} of `
      + `${o.quiet.start} (${Math.round(share(o) * 100)}%), arrived ${o.fire.arrived ?? 'no'}, `
      + `pushed out to ${o.fire.far}`).join(' | '));
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
    // A clean field, and nothing left running over it: an earlier case in this
    // file can leave a WELL or a STASIS up, and either of them will drag a
    // thrown MASS off the turret it was aimed at.
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    w.autoAim = false; w.autoFire = false;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    for (const e of w.effects) e.dead = true; w.effects.length = 0;
    w.mines.length = 0;
    w.stasis = 0;
    w.timeScale = 1;
    w.attackers.clear();
    w.shock = 0;
    const made = en.spawnGroup(w, 'tow', 1, { where: 'field', x: S.x + 30, y: 700 });
    const head = made.find((e) => e.type.id === 'tow');
    const mass = made.find((e) => e.type.id === 'towMass');
    head.staged = false; head.spawnIn = 0; mass.staged = false; mass.spawnIn = 0;
    let released = null; let peak = 0; let landed = null;
    for (let s = 0; s < 1500; s++) {
      g.update(1 / 60);
      peak = Math.max(peak, w.shock);
      if (released === null && !head.tether) {
        released = { speed: Math.round(Math.hypot(mass.vx, mass.vy)), thrown: mass.thrown > 0, hurled: !!mass.hurled };
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
    return { released, landed, peak: +peak.toFixed(2), want: H.shock, speed: H.speed };
  });
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
    g.restart();
    w.phase = 'staging';
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
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
    g.buy('aperture');
    g.buy('aperture');
    const held = w.aperture;
    g.openBoss(); // spends one
    const spent = w.aperture;
    g.checkpoint();
    const { readRun } = await import('../src/save.js');
    const d = readRun();
    if (w.boss) { w.boss.clear(w); w.boss = null; }
    g.resume(); // the real restore path, off the real file
    const back = { held, spent, saved: d ? d.aperture : null, restored: w.aperture,
      ledger: w.ledger.filter((x) => x === 'aperture').length };
    g.restart();
    return back;
  });
  check('a spent APERTURE is not handed back by a reload',
    r.held === 2 && r.spent === 1 && r.saved === 1 && r.restored === 1 && r.ledger === 2,
    `bought 2, spent 1 -> held ${r.spent}, saved ${r.saved}, restored ${r.restored}, `
    + `ledger still records ${r.ledger}`);
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

    const shot = (rig) => {
      // Force the cache rather than buying: `rig()` keys off the ledger's
      // length, so a stub with a matching count is honoured.
      w.rig = { rate: 0, slew: 0, aimrange: 0, overwatch: 0, casing: 0, insulation: 0, intake: 0, ...rig };
      w.rig.filled = ['rate', 'slew', 'aimrange', 'overwatch', 'casing', 'insulation', 'intake']
        .reduce((a, k) => a + w.rig[k], 0) / 17;
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
    const parts = ['rate', 'slew', 'aimrange', 'overwatch', 'casing', 'insulation', 'intake'];
    const out = { bare, shows: [], quiet: [] };
    for (const id of parts) {
      const one = shot({ [id]: 1 });
      (Math.abs(one - bare) > 500 ? out.shows : out.quiet).push(id);
    }
    // ...and a second level of the same part has to add something too, or the
    // levels above the first are numbers on a card.
    out.deeper = [];
    for (const id of ['slew', 'casing', 'insulation', 'overwatch']) {
      const a = shot({ [id]: 1 });
      const b = shot({ [id]: 3 });
      if (Math.abs(b - a) > 500) out.deeper.push(id);
    }
    // ...and the whole branch together is not the same picture as any of it.
    out.full = shot({ rate: 2, slew: 3, aimrange: 2, overwatch: 3, casing: 3, insulation: 3, intake: 1 });
    w.rig = null;
    g.restart();
    return out;
  });
  check('every part the TURRET branch sells shows up on the turret',
    r.quiet.length === 0 && r.shows.length === 7,
    `drew something: ${r.shows.join(', ') || 'none'}`
    + `${r.quiet.length ? `; drew NOTHING: ${r.quiet.join(', ')}` : ''}`);
  check('...and so does every level of it above the first',
    r.deeper.length === 4 && Math.abs(r.full - r.bare) > 5000,
    `levels 1 -> 3 changed the machine for ${r.deeper.join(', ') || 'nothing'}; `
    + `bare against fully rigged: ${Math.round(Math.abs(r.full - r.bare) / 1000)}k`);
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
      s.cooldown = 0;
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
     * Counted by COLOUR, not by brightness, and against a control row.
     *
     * Summing the strip's luminance gave a case that failed twice and passed
     * once on the same code -- the strip is a few pixel rows, so one body
     * drifting across it moves the total by a third, and the corruption feed
     * randomises the frame inside draw() itself.
     *
     * The line is rgba(255,220,0,.5) at one world unit, which lands as about
     * (54,50,16) after scaling and antialiasing -- so it is not bright, and a
     * threshold picked for "yellow" at 110 found nothing at all. What marks it
     * is blue sitting well BELOW red, which nothing on a blue-black field
     * does across a full width. Read against a control row sixty pixels up,
     * it is 0 / 1560 / 0 and identical on three consecutive runs.
     */
    const { glitch } = await import('../src/glitch.js');
    glitch.level = 0;
    glitch.burst = 0;
    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d');
    const k = cv.width / w.width;
    const row = Math.round(w.floorY * k);
    const yellow = (y) => {
      const d = c2.getImageData(0, Math.max(0, y - 2), cv.width, 5).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 35 && d[i + 1] > 30 && d[i + 2] < d[i] * 0.55) n++;
      }
      return n;
    };
    const ctrl = Math.max(0, row - 60);
    const strip = () => yellow(row) - yellow(ctrl);
    w.debug.hitboxes = false; g.draw();
    const floorOff = strip();
    press('HITBOXES'); g.draw();
    const floorOn = strip();
    press('HITBOXES'); g.draw();
    const floorBack = strip();

    for (const key of Object.keys(w.debug)) w.debug[key] = false;
    g.hud.toggleDebug(false);
    g.restart();
    return { before, onLen: on.length, moved, after,
      lines: on.split('\n').length, floorOff, floorOn, floorBack };
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
    r.floorOn > 150 && r.floorOff < 40 && r.floorBack < 40,
    `floor row against a control row: off ${r.floorOff}, on ${r.floorOn}, `
    + `off again ${r.floorBack}`);
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

// --- SPIRAL is the one ability that is about the gun -------------------------
/*
 * It replaced CHORUS, and the reason was a gap rather than a complaint. Every
 * ability in the bar acted on the field and away from the turret -- PULSE
 * shoves, LANCE pierces, WELL gathers, PRISM bursts, STASIS holds, DECOY
 * redirects, FAN throws a cone somewhere else -- and not one of them touched
 * the turret's own gun, which is what the whole UPGRADES tree is about. Nine
 * rounds and twenty fittings, and nothing in the bar cared which you carried.
 *
 * So the thing to assert is not that it does damage, it is that it is the
 * gun: it fires the loaded round through that round's own upgrades, it takes
 * the barrel off whatever the assist had chosen, and it gives the barrel back
 * when it is done. A version that quietly fired BOLTs would pass a damage
 * check and be the wrong ability.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { ABILITIES } = await import('../src/abilities.js');
    const { FIRST_USE, LOCKABLE } = await import('../src/tutorial.js');
    const { NODES } = await import('../src/tree.js');

    const ids = ABILITIES.map((a) => a.id);
    const treeText = JSON.stringify(NODES.map((n) => [n.id, n.name, n.line]));
    const gone = !/chorus/i.test(treeText) && !ids.includes('chorus')
      && !FIRST_USE.chorus && !LOCKABLE.abilities.includes('chorus');
    const placed = ids.includes('spiral') && /open_spiral/.test(treeText)
      && /charge_spiral/.test(treeText) && !!FIRST_USE.spiral
      && LOCKABLE.abilities.includes('spiral');

    g.debugTeachAll();
    g.debugClearField();
    w.debug.noCooldown = true;
    for (let i = 0; i < 20; i++) g.debugSpawn('mote', 200 + i * 18, 260);

    const slot = w.abilities.slots.findIndex((sl) => sl && sl.def.id === 'spiral');
    const s = w.shooter;

    // Point the barrel somewhere deliberate, so "came off its target" is a
    // fact about this run rather than about wherever it happened to be.
    s.aim = 0;
    const aimBefore = s.aim;

    const fired = {};
    const seen = new Set();
    /*
     * The charge is put back and the field is cleared before each sweep.
     * Without the first, the second sweep never happens -- `noCooldown` zeroes
     * the wait but not the charge count, so trigger() refuses and the case
     * reads the FIRST sweep's rounds still in flight and reports both sweeps
     * as identical. Which is exactly the failure the check is looking for, so
     * it was a green-looking red for the wrong reason.
     */
    const round = (name) => {
      w.round = name;
      w.projectiles.length = 0;
      const sl = w.abilities.slots[slot];
      sl.charges = Math.max(1, sl.charges);
      sl.cd = 0;
      sl.locked = 0;
      const went = !!g.useAbility(slot) || w.spiral > 0;
      let turned = 0;
      for (let i = 0; i < 200; i++) {
        g.update(1 / 60);
        turned = Math.max(turned, Math.abs(s.aim - aimBefore));
        for (const p of w.projectiles) if (p.color) seen.add(p.color);
      }
      fired[name] = { turned: +turned.toFixed(2), spiral: +w.spiral.toFixed(2), went };
    };
    round('standard');
    const coloursAfterBolt = new Set(seen);
    seen.clear();
    round('rime');
    const rimeColours = new Set(seen);

    // ...and the gun is handed back: spiral clears and firing resumes.
    const handedBack = w.spiral === 0;
    w.debug.noCooldown = false;
    g.restart();
    return { gone, placed, fired, handedBack,
      boltColours: [...coloursAfterBolt], rimeColours: [...rimeColours],
      tone: ABILITIES.find((a) => a.id === 'spiral')?.color };
  });

  check('CHORUS is gone from the bar, the tree and the script, and SPIRAL is in all three',
    r.gone && r.placed,
    `chorus gone ${r.gone}, spiral placed ${r.placed}, tone ${r.tone}`);

  // A full sweep is CFG.spiral.turns revolutions; anything under one turn
  // means the barrel never actually came off its target.
  const swept = r.fired.standard && r.fired.standard.turned > Math.PI * 2;
  check('...and it takes the barrel off its target and hands it back',
    swept && r.handedBack,
    `turned ${r.fired.standard && r.fired.standard.turned} radians, `
    + `handed back ${r.handedBack}`);

  /*
   * The one that matters: it fires what is LOADED. A BOLT is #7aa2ff and a
   * RIME round is #8fe3ff, so a sweep with RIME on the strip has to put
   * different projectiles on the field than a sweep with BOLT. An
   * implementation that always fired the default round would pass every
   * other check here.
   */
  const differs = r.boltColours.length > 0 && r.rimeColours.length > 0
    && r.rimeColours.some((c) => !r.boltColours.includes(c));
  /*
   * COUNTERSPIN, and the gimbal going home.
   *
   * Two things that both went wrong the first time and in the same way -- a
   * multiplier applied twice, and a guard on a value that had already moved.
   * COUNTERSPIN fired 118 rounds against one arm's 33, because the interval
   * was divided by the arm count AND a round went out per arm, which is the
   * doubling squared. And the aim was never wound back, because the restore
   * was guarded on `world.spiral !== 0` while the running branch had already
   * written zero to it -- so the gimbal's travel arc stayed spanning six
   * radians and the ring sat closed for the rest of the run.
   */
  const extra = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { NODES } = await import('../src/tree.js');
    g.debugTeachAll();
    g.debugClearField();
    w.debug.noCooldown = true;
    for (let i = 0; i < 24; i++) g.debugSpawn('mote', 160 + i * 16, 240);
    const s = w.shooter;
    const slot = w.abilities.slots.findIndex((sl) => sl && sl.def.id === 'spiral');
    const sweep = (arms) => {
      w.up.spiralArms = arms;
      w.round = 'standard';
      const sl = w.abilities.slots[slot];
      sl.charges = Math.max(1, sl.charges); sl.cd = 0; sl.locked = 0;
      s.aim = -Math.PI / 2;
      const aim0 = s.aim;
      const grip0 = s.gripAngle;
      g.useAbility(slot);
      const eff = w.effects.find((e) => e.arms);
      const n = eff ? eff.arms.length : 0;
      for (let i = 0; i < 300; i++) g.update(1 / 60);
      return { n, rounds: eff ? eff.rounds : 0,
        // Where the barrel and the grip ended up against where they began.
        aimBack: Math.abs(s.aim - aim0) < 0.5,
        gripSpan: +Math.abs(s.gripAngle - grip0).toFixed(2),
        fade: s.sweepFade };
    };
    const one = sweep(1);
    const two = sweep(2);
    w.up.spiralArms = 1;
    w.debug.noCooldown = false;
    const inTree = JSON.stringify(NODES.map((n) => [n.id, n.name]));
    g.restart();
    return { one, two, hasNode: /counterspin/.test(inTree) && /COUNTERSPIN/.test(inTree) };
  });

  check('COUNTERSPIN adds an arm and doubles the sweep, rather than squaring it',
    extra.hasNode && extra.one.n === 1 && extra.two.n === 2
    && extra.two.rounds > extra.one.rounds * 1.6
    && extra.two.rounds < extra.one.rounds * 2.6,
    `in the tree ${extra.hasNode}; one arm ${extra.one.rounds} rounds, `
    + `two arms ${extra.two.rounds} `
    + `(${(extra.two.rounds / Math.max(1, extra.one.rounds)).toFixed(2)}x)`);

  /*
   * ...and the gimbal goes home. The travel arc is drawn from straight-down
   * to wherever the grip is, so an aim left at `start + 2.6 turns` leaves it
   * spanning the whole circle -- which is what a player saw for the rest of
   * the run, every run, after every use.
   */
  check('...and the barrel and the gimbal are back where they started',
    extra.one.aimBack && extra.two.aimBack
    && extra.one.gripSpan < 0.5 && extra.two.gripSpan < 0.5
    && extra.one.fade === 0,
    `aim returned ${extra.one.aimBack}/${extra.two.aimBack}, `
    + `grip off by ${extra.one.gripSpan}/${extra.two.gripSpan} rad, `
    + `sweep overlay faded to ${extra.one.fade}`);

  check('...and it fires whatever round is loaded, not a round of its own',
    differs,
    `BOLT sweep (went ${r.fired.standard && r.fired.standard.went}) left `
    + `${r.boltColours.join(',') || 'nothing'}; RIME sweep `
    + `(went ${r.fired.rime && r.fired.rime.went}) left `
    + `${r.rimeColours.join(',') || 'nothing'}`);
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

// --- ...and the furniture gets out of the way on the beats ------------------
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const opacity = () => ({
      strip: +getComputedStyle(document.getElementById('quickBar')).opacity,
      abs: +getComputedStyle(document.getElementById('abilities')).opacity,
    });
    g.hud.unrecede();
    const before = opacity();
    // An ability going off is a beat, and it is the ability's own `show`,
    // not its cooldown: FAN is over before the pellets land, WELL drags.
    g.useAbility(0);
    const held = g.hud.recedeT;
    const cls = document.body.classList.contains('recedeStrip');
    /*
     * ...and the ability bar is NOT in it. Pressing an ability is the one
     * moment that bar is what you are reading -- which one went, what it
     * cost, when it is back -- and fading it on the press hides exactly
     * that. A boss beat still takes both, because nobody is reading a
     * cooldown through an arrival.
     */
    const sparedAbilities = !document.body.classList.contains('recede');
    g.hud.unrecede();
    g.hud.recede(1, false);
    const bossBeatTakesBoth = document.body.classList.contains('recede')
      && document.body.classList.contains('recedeStrip');
    g.hud.unrecede();
    g.useAbility(0);
    // ...and it is still pressable while it is faint. A recede that took the
    // controls away would be worse than the occlusion it is fixing.
    const ab = document.querySelector('#abilities .ab');
    const hittable = getComputedStyle(ab).pointerEvents !== 'none';
    // The clock runs it out on its own.
    g.hud.updateAlerts(99);
    const after = { cls: document.body.classList.contains('recedeStrip'), t: g.hud.recedeT };
    g.hud.unrecede();
    return { before, held, cls, hittable, after, sparedAbilities, bossBeatTakesBoth,
      shows: (await import('../src/abilities.js')).ABILITIES.map((a) => a.show) };
  });
  check('an ability takes the strip down and leaves the ability bar alone',
    r.cls && r.held > 0 && r.hittable && !r.after.cls
    && r.sparedAbilities && r.bossBeatTakesBoth
    && r.before.strip === 1 && r.shows.every((v) => v > 0 && v < 4),
    `held ${r.held}s, ability bar spared ${r.sparedAbilities}, `
    + `a boss beat takes both ${r.bossBeatTakesBoth}, still pressable ${r.hittable}, `
    + `back afterwards ${!r.after.cls}, durations ${r.shows.join('/')}`);
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
    g.hud.syncFolds();
    read(out.open);
    press('foldMines'); press('foldAmmo');
    read(out.shut);
    press('foldMines'); press('foldAmmo');
    read(out.back);
    return out;
  });
  check('folding a stack puts it away and leaves the way back',
    r.shut.mines === 1 && r.shut.ammo === 1 && r.shut.foldMines === 1
    && r.open.mines > 1 && r.back.mines === r.open.mines
    && r.shut.label === 'MINES' && r.open.label === '',
    `open ${r.open.mines}/${r.open.ammo}, folded ${r.shut.mines}/${r.shut.ammo} `
    + `(button still there: ${r.shut.foldMines}, says "${r.shut.label}"), `
    + `unfolded ${r.back.mines}/${r.back.ammo}`);

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
 * ANOMALY holds a slot per boss. One of them has something behind it; the
 * other six are doors, shown because the shape of what is coming is worth
 * seeing and sealed because a way in that opens onto nothing is worse than a
 * door that plainly does not open.
 *
 * RECAST is not among them. It is not an upgrade to the machine, the rack or
 * the field — it is what you do with what the bosses leave — so it sits above
 * every category rather than inside one.
 */
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const { TREE, NODES } = await import('../src/tree.js');
    const { BOSS_TONE } = await import('../src/upgrades.js');
    const { ANOMALIES } = await import('../src/anomaly.js');
    g.restart();
    w.phase = 'staging';
    g.debugGiveEnergy(9000);
    w.remainder = 2;

    const first = TREE[0];
    const anomaly = NODES.find((n) => n.kind === 'root' && n.key === 'anomaly');
    const slots = NODES.filter((n) => n.id && /^aperture/.test(n.id));
    const live = slots.filter((n) => !n.dormant);
    const sealed = slots.filter((n) => n.dormant);
    /*
     * Every way in that exists is for sale, and nothing is behind anything
     * else: the built ones all take the money on a cold run, and the ones
     * that are not built refuse whatever has been broken.
     */
    w.reconciled.length = 0;
    const buys = slots.map((n) => ({ id: n.id, r: g.buy(n.id) }));
    const tones = slots.map((n) => n.tone);
    const out = {
      firstIsRecast: first.id === 'recast' && first.kind === 'upgrade',
      recastInTree: NODES.filter((n) => n.id === 'recast').length,
      slots: slots.length,
      live: live.length,
      sealed: sealed.length,
      names: slots.map((n) => n.name),
      tones,
      uniqueTones: new Set(tones).size,
      matchesPalette: tones.join(',') === BOSS_TONE.join(','),
      spectrum: (anomaly.tones || []).length,
      opened: buys.filter((b) => b.r === 'ok').map((b) => b.id),
      refused: buys.filter((b) => b.r === 'locked').map((b) => b.id),
      held: [1, 2, 3, 4, 5, 6, 7].map((n) => w.apertures[n] | 0).join(','),
      builtIds: slots.filter((n) => !n.dormant).map((n) => n.id),
      anomalies: ANOMALIES.length,
      builtCount: ANOMALIES.filter((a) => a.built).length,
      wantNames: ANOMALIES.map((a) => `${a.name} APERTURE`),
    };
    w.reconciled.length = 0;
    g.restart();
    return out;
  });
  /*
   * The counts are derived, not written down. Every phase builds another boss
   * and a hardcoded "two built, five sealed" is a test that has to be edited
   * to stay true -- which is a test that eventually gets edited without being
   * read. What is actually invariant is that the tree agrees with the table:
   * a slot per anomaly, one live slot per built anomaly, and the names in the
   * table's own order.
   */
  check('a tree slot per anomaly, live exactly where one is built',
    r.firstIsRecast && r.recastInTree === 1
    && r.slots === r.anomalies && r.live === r.builtCount
    && r.sealed === r.anomalies - r.builtCount
    && r.uniqueTones === r.anomalies && r.matchesPalette && r.spectrum === r.anomalies
    && r.names.join() === r.wantNames.join(),
    `${r.slots} slots (${r.live} live against ${r.builtCount} built, ${r.sealed} sealed), `
    + `${r.uniqueTones} distinct colours, heading carries ${r.spectrum}; `
    + `names ${JSON.stringify(r.names)}; first row is ${r.firstIsRecast ? 'RECAST' : 'NOT recast'}`);
  /*
   * One door at a time, and this reverses what it used to assert.
   *
   * Every built boss was for sale on a cold run, on the reasoning that gating
   * them made a player who wanted the amber one go and break the magenta one
   * first. That is true of the rest of the tree -- where nothing is behind
   * anything and the panel is built not to imply otherwise -- and wrong here:
   * these are numbered, each is built on the last, and a player meeting all
   * seven at once has no idea which one is meant for them yet. So the
   * sequence is enforced (`needs`, upgrades.js) rather than left as a hint,
   * and it is the ONLY sequence in the tree.
   *
   * On a cold run exactly one opens; the other six refuse whether they are
   * built or not, and the unbuilt ones would refuse anyway.
   */
  check('the ways in open one at a time, and only the first is cold-open',
    r.opened.join() === 'aperture'
    && r.refused.length === r.slots - 1
    && r.held.split(',')[0] === '1'
    && r.held.split(',').slice(1).every((x) => x === '0'),
    `bought ${JSON.stringify(r.opened)} of ${r.slots} slots, refused ${r.refused.length}; `
    + `ways in held ${r.held}`);
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
   * reading it. Absent field, falsy, goal printed.
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
  const read = async (group) => {
    await page.evaluate((g) => {
      window.__sim.debugGiveEnergy(4000);
      window.__sim.hud.menu.setOpen(false);
      window.__sim.openLoadout(g);
    }, group);
    await page.waitForTimeout(320);
    return page.evaluate(() => {
      const bar = document.getElementById('loadMore');
      const list = document.getElementById('loadList');
      const sheet = document.getElementById('loadout').getBoundingClientRect();
      const bb = bar.getBoundingClientRect();
      return {
        name: bar.querySelector('.loadMoreName').textContent,
        line: bar.querySelector('.loadMoreLine').textContent,
        // Outside the scroller and at the foot of the sheet: a door that
        // scrolls away is a door most people never find.
        belowList: bb.top >= list.getBoundingClientRect().bottom - 1,
        atFoot: Math.abs(sheet.bottom - bb.bottom) <= 2,
        wide: bb.width >= sheet.width - 4,
        onScreen: bb.bottom <= window.innerHeight + 1 && bb.top >= 0,
        box: [Math.round(bb.top), Math.round(bb.bottom), Math.round(window.innerHeight)],
      };
    });
  };
  const ammo = await read('ammo');
  // Press it: the sheet goes, the tree comes up standing on AMMUNITION. Every
  // figure here is a difference between two rects, so the menu still sliding
  // in cannot spoil it.
  const jump = await page.evaluate(() => {
    const g = window.__sim;
    document.getElementById('loadMore').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const landed = document.querySelector('.branchRow.landed');
    const head = document.querySelector('.menuPanel.tree .treeHead');
    return {
      sheetShut: document.getElementById('loadout').hidden,
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
  const rest = await page.evaluate(() => {
    const g = window.__sim;
    const w = g.world;
    document.getElementById('loadMore').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const second = document.querySelector('.branchRow.landed');
    const jump2 = { on: second && second.querySelector('.branchName').textContent,
      marks: document.querySelectorAll('.branchRow.landed').length };
    // The branch counts have to add up to the tree's own, or one of them is
    // counting rows that belong to somebody else.
    const m = g.hud.menu;
    const roots = ['turret', 'ammo', 'mines', 'abilities', 'anomaly'];
    const parts = Object.fromEntries(roots.map((k) => [k, m.reachCount(w, k)]));
    const missing = m.openTo('no-such-branch-key');
    m.setOpen(false);
    g.closeLoadout();
    return { jump2, parts, total: m.reachCount(w),
      sum: roots.reduce((a, k) => a + parts[k], 0), missing };
  });
  check('the loadout sheet carries a bar to its own branch of the tree',
    ammo.name === 'AMMUNITION UPGRADES' && mines.name === 'MINE UPGRADES'
    && [ammo, mines].every((x) => x.belowList && x.atFoot && x.wide && x.onScreen),
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
