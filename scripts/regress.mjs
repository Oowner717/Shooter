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
      ledger: w.offers.taken.filter((x) => x === 'aperture').length };
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
  check("ORDINAL's salvage comes to you and its wreck stays where it fell",
    r.moved.ordinal > 60 && r.moved.tally > 60 && r.moved.mote > 60
    && r.justAfter > 20 && r.later >= r.justAfter * 0.9,
    `closed in 1.5s: ${Object.entries(r.moved).map(([k, v]) => `${k} ${v}`).join(', ')} units; `
    + `wreck ${r.justAfter} pieces, still ${r.later} after ${r.wait}s `
    + `(a chunk lives ${r.chunkLife}s)`);
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
   * Nothing is behind anything else. Every boss that exists is for sale on a
   * cold run -- gating them in a chain made a player who wanted the amber one
   * go and break the magenta one first, which is a queue rather than a
   * choice. The ones that are not built still refuse, because there is
   * genuinely nothing on the other side of them.
   */
  check('every boss that exists is for sale, and nothing is behind anything else',
    r.opened.join() === r.builtIds.join()
    && r.opened.length === r.live && r.refused.length === r.sealed
    && r.held.split(',').slice(0, r.live).every((x) => x === '1'),
    `bought ${JSON.stringify(r.opened)} against built ${JSON.stringify(r.builtIds)}, `
    + `refused ${r.refused.length}; ways in held ${r.held}`);
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
    const header = (document.getElementById('treeNext') || {}).textContent || '';
    g.hud.menu.setOpen(false);
    g.restart();
    return { badge, opened, header, count: g.hud.menu.reachCount(w) };
  });
  const said = (chip.header.match(/^(\d+) within reach/) || [])[1];
  check('the energy chip opens the tree, and its badge is the tree\'s own count',
    chip.opened.open && chip.opened.shown && chip.opened.tab === 'tree'
    && Number(chip.badge) > 0 && chip.badge === said,
    `badge ${chip.badge}, header "${chip.header}", opened ${chip.opened.tab}`);

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

// --- the tree row says what a press will do ---------------------------------
/*
 * Two affordances that were not there. The disclosure arrow was an 8px chevron
 * hard against the row's left border, unlabelled — it read as part of the
 * frame rather than as a door — and the price was bare text, which is how a
 * readout is drawn, not a control.
 *
 * Now: a fixed gutter with the arrow centred in it and OPEN/CLOSE named above
 * it, and a box round the price whenever the press would actually spend
 * something. What is checked is that the word tracks the branch, that the box
 * appears on exactly the pressable states and on none of the readouts (a ✓, a
 * locked ·, a heading's blank), and that a tap in the gutter still opens
 * rather than arms while a tap on a leaf's dead gutter still reaches the row.
 */
{
  /*
   * Measured at rest, not on the way in. #menu enters on a translate, so a
   * difference between two rects inside it survives being measured mid-slide
   * -- but elementFromPoint takes viewport coordinates and does not, and a
   * row still hundreds of pixels below the fold answers "nothing" rather than
   * "the wrong thing". The first version of this case measured during the
   * entrance and passed only because the menu happened to be open already.
   */
  await page.evaluate(() => {
    const g = window.__sim;
    g.debugGiveEnergy(2600);
    g.hud.menu.setOpen(true);
    g.hud.menu.show('tree');
  });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const vis = (el) => el.getBoundingClientRect().width > 0;
    const rows = [...document.querySelectorAll('.treeRow')];
    // Every price is either a box or a readout, never the wrong one.
    const wrong = [];
    for (const row of rows) {
      const c = row.querySelector('.treeCost');
      const box = c.classList.contains('box');
      const t = c.textContent;
      const readout = t === '' || t === '\u2713' || t === '\u00b7';
      if (box === readout) wrong.push(`${row.querySelector('.treeName').textContent}:"${t}":${box}`);
    }
    // The word names what the next press does, and follows the branch.
    const head = rows.find((x) => x.querySelector('.treeGutWord'));
    const branch = head.parentElement;
    const said = [];
    for (let i = 0; i < 2; i++) {
      said.push({ shut: branch.classList.contains('shut'),
        word: head.querySelector('.treeGutWord').textContent });
      head.querySelector('.treeCaret').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    const armedByCaret = !!document.querySelector('.treeRow.armed');
    // The arrow sits in the middle of its own gutter, and that gutter is the
    // space between the row's edge and the first thing in it.
    const rb = head.getBoundingClientRect();
    const cb = head.querySelector('.treeCaret').getBoundingClientRect();
    const ib = head.querySelector('.treeIcon').getBoundingClientRect();
    const arrow = cb.left + cb.width / 2 - rb.left;
    const middle = (ib.left - rb.left) / 2;
    // A leaf's gutter is dead, so the row underneath it takes the press --
    // the left edge of a leaf used to be a zone that swallowed the buy.
    const leaf = rows.find((x) => vis(x) && !x.querySelector('.treeGutWord'));
    leaf.scrollIntoView({ block: 'center' });
    const lg = leaf.querySelector('.treeGut').getBoundingClientRect();
    const top = document.elementFromPoint(lg.left + lg.width / 2, lg.top + lg.height / 2);
    const hit = top === leaf;
    const hitWas = top ? `${top.tagName}.${top.className}` : 'nothing';
    window.__sim.hud.menu.setOpen(false);
    return { rows: rows.length, wrong, said, armedByCaret, arrow: +arrow.toFixed(1),
      middle: +middle.toFixed(1), hit, hitWas,
      leafName: leaf.querySelector('.treeName').textContent,
      leafBox: [Math.round(lg.left), Math.round(lg.top)],
      boxes: rows.filter((x) =>
        x.querySelector('.treeCost').classList.contains('box')).length };
  });
  const words = r.said.length === 2
    && r.said.every((s) => s.word === (s.shut ? 'OPEN' : 'CLOSE'))
    && r.said[0].shut !== r.said[1].shut;
  check('a tree price is boxed when it is pressable and bare when it is not',
    r.wrong.length === 0 && r.boxes > 0, `${r.boxes}/${r.rows} boxed; wrong: ${r.wrong.slice(0, 4)}`);
  check('the gutter names what the press does, and only opens',
    words && !r.armedByCaret, JSON.stringify(r.said) + ` armed:${r.armedByCaret}`);
  check('the arrow is centred between the row edge and its text',
    Math.abs(r.arrow - r.middle) <= 2 && r.hit,
    `arrow at ${r.arrow}, middle at ${r.middle}; leaf ${r.leafName} at ${r.leafBox} `
    + `reaches the row: ${r.hit} (hit ${r.hitWas})`);
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
    const landed = document.querySelector('.treeRow.landed');
    const head = document.querySelector('.menuPanel.tree .treeHead');
    return {
      sheetShut: document.getElementById('loadout').hidden,
      stillOpen: g.loadoutOpen,
      menu: g.hud.menu.open && g.hud.menu.tab,
      on: landed && landed.querySelector('.treeName').textContent,
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
    const second = document.querySelector('.treeRow.landed');
    const jump2 = { on: second && second.querySelector('.treeName').textContent,
      marks: document.querySelectorAll('.treeRow.landed').length };
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
