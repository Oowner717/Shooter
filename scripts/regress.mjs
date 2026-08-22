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

// --- the volume -------------------------------------------------------------
{
  await page.evaluate(async () => { (await import('../src/audio.js')).audio.setVolume(0.35); });
  await page.evaluate(async () => { (await import('../src/audio.js')).audio.setEnabled(false); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  const back = await page.evaluate(async () => {
    const a = (await import('../src/audio.js')).audio;
    a.setEnabled(true);
    return a.volume;
  });
  check('unmuting after a relaunch returns to the chosen level', Math.abs(back - 0.35) < 1e-6, `came back at ${back}`);
  await page.evaluate(async () => { (await import('../src/audio.js')).audio.setVolume(1); });
}

// --- a first kill is said on the field --------------------------------------
// The menu button has always flashed. Nobody watching the field ever saw it.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { codex } = await import('../src/codex.js');
    const w = g.world;
    w.director.timer = 1e9; w.director.driftTimer = 1e9;
    for (const e of [...w.enemies]) e.dead = true; w.enemies.length = 0;
    codex.forget();
    for (const a of document.querySelectorAll('#alerts .alert')) a.remove();
    const e = g.debugSpawn('bloom', w.width / 2, 600);
    e.staged = false; e.spawnIn = 0; e.applyDamage(w, 1e9);
    await new Promise((res) => setTimeout(res, 400));
    const notice = [...document.querySelectorAll('#alerts .alert.found')]
      .map((a) => ({ text: a.textContent, colour: a.style.color }))[0];
    return { notice, found: codex.found };
  });
  check('a first kill is announced on the field', !!r.notice && /BLOOM/.test(r.notice.text) && !!r.notice.colour,
    JSON.stringify(r));
}

// --- reset means reset ------------------------------------------------------
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const { codex } = await import('../src/codex.js');
    g.debugTeachAll();
    g.debugGiveEnergy(4000);
    g.debugCodexAll();
    if (g.saveNow) g.saveNow();
    const before = {
      found: codex.found, energy: Math.round(g.world.energy), teaching: g.teaching,
      keys: Object.keys(localStorage).filter((k) => k.startsWith('sim7749')).sort(),
    };
    g.resetAll();
    await new Promise((res) => setTimeout(res, 800));
    return {
      before,
      found: codex.found, energy: Math.round(g.world.energy), teaching: g.teaching,
      kills: g.world.kills, taken: g.world.offers.taken.length,
      keys: Object.keys(localStorage).filter((k) => k.startsWith('sim7749')).sort(),
    };
  });
  check('reset puts the device back to a first launch',
    r.found === 0 && r.energy === 0 && r.kills === 0 && r.taken === 0 && r.teaching === true
      && !r.keys.includes('sim7749-run') && !r.keys.includes('sim7749-codex')
      && !r.keys.includes('sim7749-lines'),
    JSON.stringify(r));
}

// --- the corruption line quotes the real rates ------------------------------
// It is the one piece of copy in the game that states numbers, so the numbers
// have to be the ones the code uses. Change CFG.energy.tax and this fails.
{
  const r = await page.evaluate(async () => {
    const { CFG } = await import('../src/config.js');
    const { ON_CONTACT } = await import('../src/tutorial.js');
    const S = CFG.energy;
    // intakeRate() with no INSULATION: bite is CFG.energy.tax, compounding,
    // floored, with at most taxCap objects counted.
    const cost = (n) => Math.round((1 - Math.max(S.taxFloor, S.tax ** Math.min(n, S.taxCap))) * 100);
    const said = ON_CONTACT.map((l) => l.text).join(' ');
    const want = [1, 2, 3, S.taxCap].map((n) => `${cost(n)}%`);
    return { want, missing: want.filter((w) => !said.includes(w)), said };
  });
  check('the corruption line quotes the rates the code actually charges',
    r.missing.length === 0, `wanted ${JSON.stringify(r.want)}, missing ${JSON.stringify(r.missing)}`);
}

// --- every turret upgrade puts something on the turret -----------------------
// The TURRET branch is named for its parts, so a part that quietly stops being
// drawn makes a liar of the tree. Each one is drawn alone onto a scratch
// canvas and its lit pixels counted against a bare turret.
{
  const r = await page.evaluate(async () => {
    const g = window.__sim;
    const w = g.world;
    const s = w.shooter;
    const cvs = document.createElement('canvas');
    cvs.width = 260; cvs.height = 260;
    const c = cvs.getContext('2d');
    const lit = (rig) => {
      c.clearRect(0, 0, 260, 260);
      c.save();
      c.translate(130 - s.x, 130 - s.y);
      w.rig = rig;
      w.rigAt = w.offers.taken.length; // make the cache hit, so `rig` is used
      w.rigFlash = 0;
      s.draw(c, w);
      c.restore();
      const d = c.getImageData(0, 0, 260, 260).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++;
      return n;
    };
    // Read off the tree rather than listed here, so a node placed under TURRET
    // is covered by this case the moment it is placed. It was a hardcoded list
    // until build 109, which would have let ARRAY in undrawn and unnoticed.
    const { NODES } = await import('../src/tree.js');
    const parts = NODES.filter((n) => n.id && n.parent && n.parent.key === 'turret');
    const none = Object.fromEntries(parts.map((p) => [p.id, 0]));
    const bare = lit(none);
    const each = {};
    for (const p of parts) each[p.id] = lit({ ...none, [p.id]: p.levels || 1 }) - bare;
    w.rigAt = -1; // let it rebuild honestly again
    return { bare, each };
  });
  const silent = Object.entries(r.each).filter(([, n]) => n <= 0).map(([k]) => k);
  check('every turret upgrade puts a visible part on the turret', silent.length === 0,
    `${silent.length ? `nothing drawn for ${silent.join(', ')} — ` : ''}${JSON.stringify(r.each)}`);
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
