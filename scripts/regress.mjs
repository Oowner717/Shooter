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
