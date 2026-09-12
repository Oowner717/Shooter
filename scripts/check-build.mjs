// Guards the one build literal that still has to be duplicated.
//
// src/config.js is the source of truth: main.js registers the worker as
// './sw.js?b=<BUILD>' and the worker derives its cache name from that. The
// only remaining copy is the inline escape hatch in index.html, which runs
// before any module can load and so cannot import anything.
//
// It also stamps and guards REV — a content fingerprint of the whole source
// tree. BUILD says which build this is *meant* to be; REV says which bytes it
// actually is. Two installs claiming BUILD 75 can still be different code —
// that is exactly the confusion that produced this — and comparing a seven
// character hash on two screens settles it in a glance.
//
// Run: node scripts/check-build.mjs        (verify)
//      node scripts/check-build.mjs --stamp (write the current REV)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const grab = (file, re) => {
  const m = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(re);
  if (!m) throw new Error(`no build literal found in ${file}`);
  return m[1];
};

const config = grab('src/config.js', /export const BUILD = '([^']+)'/);
const html = grab('index.html', /var BUILD = '([^']+)'/);

if (config !== html) {
  console.error(`build mismatch: src/config.js=${config} index.html=${html}`);
  process.exit(1);
}
console.log(`build ${config} consistent`);

/*
 * ...and index.html's literal has to sit inside the window the foreground
 * update check reads.
 *
 * `main.js` range-fetches the first `PROBE_BYTES` of index.html every time the
 * app comes forward and compares the build in it with the one it is running --
 * that is the ONLY thing that updates an installed copy which iOS never
 * evicts, because everything else fires on `load` and a home-screen session
 * survives backgrounding for days. If the literal ever drifts past the window
 * the check silently stops finding it, the app silently stops updating, and
 * nothing says so. Exactly the guard bundle.mjs keeps on its own rev stamp,
 * for exactly the same reason.
 *
 * The window is read out of main.js rather than restated here, so there is one
 * number and this is a reader of it.
 */
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const probeM = mainSrc.match(/const PROBE_BYTES = (\d+);/);
if (!probeM) {
  console.error('src/main.js: no PROBE_BYTES -- the foreground update check is gone');
  process.exit(1);
}
const probe = Number(probeM[1]);
const htmlSrc = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const at = Buffer.byteLength(htmlSrc.slice(0, htmlSrc.indexOf(`var BUILD = '${html}'`)), 'utf8');
const end = at + Buffer.byteLength(`var BUILD = '${html}';`, 'utf8');
if (end > probe) {
  console.error(`index.html's build literal ends at byte ${end}, outside the `
    + `${probe}-byte window main.js reads on every foreground -- installed `
    + `copies would stop updating and say nothing`);
  process.exit(1);
}
console.log(`update probe: the build literal ends at byte ${end} of ${probe}`);

// The worker's precache list is hand-written, so a new module can be shipped
// without being reachable offline. src/arsenal.js was added in build 21 and
// missed this list; the fetch handler would have papered over it for anyone
// who had already loaded the page online, and left a fresh install broken on
// a plane. Cheap to check, so it is checked.
const src = readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.js'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const missing = src.filter((f) => !sw.includes(`'./src/${f}'`));
if (missing.length) {
  console.error(`sw.js precache is missing: ${missing.map((f) => `src/${f}`).join(', ')}`);
  process.exit(1);
}
console.log(`sw.js precaches all ${src.length} modules`);

// ---- the tree covers everything --------------------------------------------
//
// tree.js says where each permanent thing sits; upgrades.js says what it does.
// Two files, one subject, so they can drift — and a node left out of the tree
// is content nobody in the game can ever buy. Checked here rather than trusted.
const { coverage } = await import(new URL('../src/tree.js', import.meta.url));
const { ALL_UPGRADES } = await import(new URL('../src/upgrades.js', import.meta.url));
const { ANOMALIES, barRamp } = await import(new URL('../src/anomaly.js', import.meta.url));
const cov = coverage();
if (cov.missing.length || cov.extra.length || cov.dupes.length) {
  if (cov.missing.length) console.error(`tree is missing: ${cov.missing.join(', ')}`);
  if (cov.extra.length) console.error(`tree has unknown ids: ${cov.extra.join(', ')}`);
  if (cov.dupes.length) console.error(`tree places twice: ${cov.dupes.join(', ')}`);
  process.exit(1);
}
console.log(`tree places all ${cov.want} buyable things exactly once`);

/*
 * ...and every one of them says WHICH BAND it is priced for.
 *
 * The build-224 statement, applied to the second mandatory field. `levels` was
 * `u.levels ?? 3` and eight nodes shipped sold three times because a defaulted
 * value and a chosen one were the same text; a band has the same failure mode
 * and a worse blast radius, because an omitted band reads as band 1 and band 1
 * is 9 kB against band 7's 4 MB. `bandOf` throws at page load for a missing
 * one, and this is the same statement at build time -- which is where it
 * catches the ids nothing currently ASKS for, the twenty-one of the mine line
 * being out of play.
 *
 * Checked in both directions plus the one ordering rule: see `bands()`.
 */
const treeMod = await import(new URL('../src/tree.js', import.meta.url));
const bnd = treeMod.bands();
if (bnd.missing.length || bnd.extra.length || bnd.range.length
  || bnd.parentBad.length || bnd.gateBad.length || !bnd.rising) {
  if (bnd.missing.length) {
    console.error(`${bnd.missing.length} node(s) declare no band: ${bnd.missing.join(' ')}.`
      + ' Write the band out -- there is no default, deliberately; see BAND in tree.js');
  }
  if (bnd.extra.length) console.error(`BAND prices ids the tree does not offer: ${bnd.extra.join(' ')}`);
  if (bnd.range.length) console.error(`band out of range 1-7: ${bnd.range.join(' ')}`);
  if (bnd.parentBad.length) {
    console.error('a leaf priced for an earlier band than its parent cannot be '
      + `bought when it is priced for: ${bnd.parentBad.join('; ')}`);
  }
  if (bnd.gateBad.length) {
    console.error('a node the machine cannot be finished without, priced past the '
      + `thing it unlocks: ${bnd.gateBad.join('; ')}`);
  }
  if (!bnd.rising) console.error('BAND_PRICE is not strictly increasing');
  process.exit(1);
}
/*
 * ...and the price table is printed rather than asserted, because what it
 * should SAY is a design decision and not a bound. What is worth reading off
 * it: band 1 has to be cheap enough that a rung-1 run can start spending, and
 * the whole tree has to be dear enough that rung 49 still has something left
 * -- build 302 bought all of it by rung 17 of 49, which is the fault this
 * table exists to fix. The plan's own target is about 116 MB.
 */
{
  const per = new Map();
  for (const n of [...treeMod.NODES, ...treeMod.DETACHED]) {
    if (!n.id || n.currency === 'remainder') continue;
    const b = bnd.BAND[n.id] || 0;
    const lv = n.levels || 1;
    let spend = 0;
    for (let i = 0; i < lv; i++) spend += n.cost + (n.step || 0) * i;
    const at = per.get(b) || { nodes: 0, levels: 0, spend: 0 };
    per.set(b, { nodes: at.nodes + 1, levels: at.levels + lv, spend: at.spend + spend });
  }
  const fmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} MB` : `${Math.round(v / 1e3)} kB`);
  const shown = [...per.entries()].sort((a, z) => a[0] - z[0])
    .map(([b, v]) => `${b || 'self'}:${v.nodes}n/${v.levels}L/${fmt(v.spend)}`);
  const whole = [...per.values()].reduce((a, v) => a + v.spend, 0);
  console.log(`bands: ${bnd.want} nodes priced 9 kB to 4 MB a level, +${bnd.BAND_STEP * 100}% a level `
    + `-- ${shown.join(' ')}; whole tree ${fmt(whole)}`);
}

/*
 * ...and the machine knows how many parts it has.
 *
 * `RIG_MAX` in shooter.js is every level of every TURRET node added up, and it
 * is a hand-written copy because the gun has no business importing the shop.
 * It is read out of the source rather than imported, because importing
 * shooter.js here would drag in audio and the canvas.
 *
 * A stale copy is silent: the turret's housing, rings and mount all light as a
 * fraction of it, so a machine that has bought everything simply never
 * finishes filling. Build 178 took a level off FEED and left this at 17.
 */
const { NODES } = await import(new URL('../src/tree.js', import.meta.url));
const turretLevels = NODES
  .filter((n) => n.id && n.parent && n.parent.key === 'turret')
  .reduce((a, n) => a + (n.levels || 1), 0);
const rigMax = Number(grab('src/shooter.js', /RIG_MAX = (\d+)/));
if (rigMax !== turretLevels) {
  console.error(`RIG_MAX is ${rigMax} but the TURRET branch sells ${turretLevels} levels; `
    + 'the machine would never finish filling');
  process.exit(1);
}
console.log(`the turret's ${turretLevels} sockets match what the TURRET branch sells`);

/*
 * ...and every upgrade says how many times it may be bought.
 *
 * `tree.js` used to read `u.levels ?? 3`, so a node whose author never capped
 * it was silently sold three times -- and eight shipped that way between
 * builds 178 and 223, every one of them found late by a probe or a player
 * because a node relying on the default and a node deliberately set to three
 * were the same text. `leaf()` throws on a missing number now, which is a
 * failure at page load; this is the same statement at build time, where it
 * belongs, and it catches an upgrade that has been WRITTEN but not yet hung
 * on the tree -- one `leaf()` never sees and so can never throw for.
 *
 * `repeat` is the exemption: no ceiling at all, because the count is how many
 * you are holding rather than what you own. Only the APERTUREs and RECAST.
 */
const uncapped = ALL_UPGRADES.filter((u) => !u.repeat && !(u.levels > 0));
if (uncapped.length) {
  console.error(`${uncapped.length} upgrade(s) declare no levels: `
    + `${uncapped.map((u) => u.id).join(' ')}. Write the number out -- there is `
    + 'no default, deliberately; see the note above leaf() in tree.js');
  process.exit(1);
}
const repeats = ALL_UPGRADES.filter((u) => u.repeat).map((u) => u.id);
console.log(`all ${ALL_UPGRADES.length - repeats.length} capped upgrades write their own `
  + `level count out; ${repeats.length} repeatable (${repeats.join(' ')})`);

/*
 * Colour is a contract: grey means harmless. See the rule above ENEMY_TYPES.
 *
 * It is checked rather than trusted because it is the kind of rule a single
 * new object breaks silently -- and it had already been broken by three,
 * BULWARK and both halves of a TOW, which wore DRIFT's grey while being the
 * heaviest things that can reach the turret.
 *
 * Chroma, not a hue name: what makes a colour read as grey at a glance is how
 * little of it there is. The grey itself sits at 0.21, so 0.28 leaves room
 * either side of the line.
 */
const { ENEMY_TYPES, CFG, TYPE_BY_ID } = await import(new URL('../src/config.js', import.meta.url));
const chroma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
};
const GREY = CFG.debris.grey;
const greyFails = ENEMY_TYPES.filter((t) => t.color === GREY && !t.harmless)
  .map((t) => `${t.id} wears the grey but is not harmless`);
const dullFails = ENEMY_TYPES.filter((t) => t.color !== GREY && chroma(t.color) < 0.28)
  .map((t) => `${t.id} ${t.color} reads as grey (chroma ${chroma(t.color).toFixed(2)})`);
if (greyFails.length || dullFails.length) {
  for (const line of [...greyFails, ...dullFails]) console.error(`colour rule: ${line}`);
  process.exit(1);
}
console.log(`colour rule holds: ${GREY} is the only grey, on ${
  ENEMY_TYPES.filter((t) => t.color === GREY).map((t) => t.id).join(', ')}`);

/*
 * The broadphase is only exact while a cell is at least twice the largest
 * body: bodies are bucketed by centre cell and only the eight neighbours are
 * searched, so anything bigger than that can overlap something two cells away
 * and never be looked at. The cell is derived from MAX_BODY_R rather than
 * chosen, and this is what keeps the derivation honest — it went wrong once
 * already, when grafts made a BULWARK 72 against a cell of 96.
 */
const CFGMOD = await import(new URL('../src/config.js', import.meta.url));
const { MAX_BODY_R, GRID_CELL, CFG: BCFG } = CFGMOD;
/*
 * ...and the two STATIC bodies, which `MAX_BODY_R` cannot see because it walks
 * `ENEMY_TYPES` alone. `Game.update` pushes the turret and the DECOY into the
 * same grid as everything else, so a cell that covers the largest pair of
 * bodies but not turret-plus-BULWARK is a cell with a hole in it, and nothing
 * in the repo would report it. The turret's radius is about to grow.
 *
 * It is a MAX and not a replacement: `2 * MAX_BODY_R` is the binding term for
 * two grafted BULWARKs, which is a real coexisting pair, and swapping it for
 * `MAX_BODY_R + MAX_STATIC_R` would be strictly weaker than the guard this
 * replaces.
 */
const STATIC_R = Math.max(BCFG.shooter.r, BCFG.decoy.r);
const NEED = Math.max(2 * MAX_BODY_R, MAX_BODY_R + STATIC_R);
if (!(GRID_CELL >= NEED)) {
  console.error(`broadphase cell ${GRID_CELL} is under ${NEED} — the largest body is `
    + `${MAX_BODY_R} and the largest static body (turret ${BCFG.shooter.r}, decoy `
    + `${BCFG.decoy.r}) is ${STATIC_R}; two of those can overlap two cells apart `
    + 'and never be tested');
  process.exit(1);
}
if (!readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').includes('GRID_CELL')) {
  console.error('src/game.js no longer uses GRID_CELL — the grid is sized by something unguarded');
  process.exit(1);
}
console.log(`broadphase cell ${GRID_CELL} covers the largest body (${MAX_BODY_R}) and `
  + `the largest static one (${STATIC_R}); worst pair ${MAX_BODY_R + STATIC_R}, needs ${NEED}`);

/*
 * A covered body must not read as an energy mote.
 *
 * Energy is drawn in the colour of whatever dropped it, so a MOTE's energy is
 * a MOTE's cyan — the HERALD's cover is the only thing distinguishing "small
 * hostile someone is protecting" from "small thing to collect", and it used to
 * be a ring seven units clear of a body twelve units wide. The smallest shell
 * has to stay comfortably larger than the largest energy mote is ever drawn.
 */
const HALO = CFG.drop.max * 1.5; // drawDrop's outer radius at full pulse
const smallestShell = Math.min(
  ...ENEMY_TYPES.filter((t) => !t.harmless)
    .map((t) => Math.max(t.r + CFG.wardShell.gap, CFG.wardShell.min)),
);
if (smallestShell < HALO * 3) {
  console.error(`smallest ward shell is ${smallestShell.toFixed(1)} against an energy mote drawn `
    + `at up to ${HALO.toFixed(1)}; a covered body will read as energy`);
  process.exit(1);
}
console.log(`ward shell floor ${smallestShell.toFixed(0)} is ${(smallestShell / HALO).toFixed(1)}x `
  + `the largest energy mote (${HALO.toFixed(1)})`);

/*
 * Every regular wave is a combination, and every type in the table can be met.
 *
 * A wave naming one type is a quantity; two or three is a problem, and the
 * problem is the point. The bodies-per-wave ceiling is what keeps a
 * combination from becoming a crowd -- eight before the swell, which the
 * swell can take to about nineteen late in a run.
 *
 * The second half of this is the reachability rule: a type that appears in no
 * wave at all can only ever be met through the debug screen. Whether the
 * *rotation* actually reaches a wave is a runtime question and lives in
 * scripts/regress.mjs; this is the table-level half of it.
 */
const { WAVES } = await import(new URL('../src/config.js', import.meta.url));
const regular = WAVES.filter((w) => !w.teach && w.of.length);
const soloWaves = regular.filter((w) => w.of.length < 2 || w.of.length > 3);
if (soloWaves.length) {
  console.error(`${soloWaves.length} regular wave(s) do not name two or three types: `
    + soloWaves.map((w) => JSON.stringify(w.of)).join(' '));
  process.exit(1);
}
/*
 * Bodies per wave as released, which is the authored count times the flat
 * population multiplier -- the swell is on top of both and is meant to be.
 * A TOW counts two, because it is two.
 */
const WAVE_BODIES = 11;
const bodiesOf = (w) => Math.round(w.of
  .reduce((n, [id, c]) => n + Math.max(1, Math.round(c * CFG.waves.population)) * (TYPE_BY_ID[id].tows ? 2 : 1), 0));
const crowded = regular.map((w) => [w.of, bodiesOf(w)]).filter(([, n]) => n > WAVE_BODIES);
if (crowded.length) {
  console.error(`${crowded.length} wave(s) over ${WAVE_BODIES} bodies at population `
    + `${CFG.waves.population}: ` + crowded.map(([of, n]) => `${JSON.stringify(of)}=${n}`).join(' '));
  process.exit(1);
}
/*
 * ---- the stream, and what actually bounds the field (build 300) -----------
 *
 * This asserted that the heaviest wave at `tier.popCap` still FIT inside
 * `maxEnemies`, under a comment saying the field cap must never be the thing
 * doing the balancing. Build 300 inverts that premise deliberately: the wave
 * asks for x21.0 the authored count by rung 49 and the field cap IS what
 * holds the crowd down, because `emit` refuses to release while
 * `hostileCount(world) >= maxEnemies` and HOLDS the job rather than dropping
 * it. So a deep rung is a longer wave arriving faster through a field of
 * roughly constant size, and an ask of 231 bodies against a cap of 57 is the
 * design rather than a fault.
 *
 * What replaces it is the claim that CAN go wrong. Two things:
 *
 *   - the two slopes move TOGETHER. `popStep` alone is a wave twenty-one
 *     times as long at one tempo; `flow` alone is the same wave over in a
 *     fifth of the time. Asserted as the ratio, because that is the quantity
 *     the design is about -- bodies per wave over arrivals a second is the
 *     wave's LENGTH IN SECONDS, and it is meant to grow, not explode.
 *   - a release can never land every frame. The tightest single gap is the
 *     low end of `gap`, times the tightest `press`, times OVERCLOCK's
 *     squeeze, divided by the deepest `flow`. Under a frame or two that is
 *     not a stream, it is a spawn storm the pair solver pays for.
 */
const TIER = CFG.waves.tier;
/*
 * The real arithmetic, imported rather than restated. `enemies.js` loads
 * clean in node -- it touches no DOM at module scope -- so `flowAt`, the
 * threat of a type and the budget of a wave all come from the code that runs
 * in the game. This file kept a five-line copy of `flowAt` for one build and
 * that was one build too many: a guard that re-implements the thing it is
 * checking agrees with itself.
 */
const { Director, threatOf, threatOfWave } = await import(new URL('../src/enemies.js', import.meta.url));
const flowAt = (t) => Director.flowAt(t);
const deep = TIER.ceiling;
const popX = TIER.popStep ** (deep - 1);
const flowX = flowAt(deep) / flowAt(1);
/*
 * ---- and the ask is BUDGET-driven from build 301 ---------------------
 *
 * It was `bodiesOf(w) * popX`, which was true while the authored numbers
 * were counts. They are proportions now: a wave is scaled until its threat
 * meets `Director.budgetAt`, so the ask is the scaled count and the heaviest
 * wave is no longer the one with the most bodies written in it.
 */
const askAt = (w, tier) => {
  const T = threatOfWave(w);
  if (!(T > 0)) return bodiesOf(w);
  const scale = Director.budgetAt(tier, w.band || 1) / T;
  return w.of.reduce((n, [, c]) => n + Math.max(1, Math.round(c * scale)), 0);
};
const peak = Math.max(...regular.map((w) => askAt(w, deep)));
/*
 * ---- threat is priced for every type, and only for the ones that cost --
 *
 * A released type with no threat is a body a wave can be filled with for
 * free -- the budget would never be met and `load` would scale the wave
 * until the field cap stopped it. A HARMLESS type with threat is the
 * opposite fault and breaks the mortar: drift is what thickens a field
 * without spending a wave's budget, and that only works while it weighs
 * nothing.
 */
const freeHostile = ENEMY_TYPES.filter((t) => !t.harmless && !(threatOf(t) > 0)).map((t) => t.id);
const paidHarmless = ENEMY_TYPES.filter((t) => t.harmless && threatOf(t) !== 0).map((t) => t.id);
if (freeHostile.length || paidHarmless.length) {
  console.error(`threat is mispriced: ${freeHostile.join(', ') || 'no free hostiles'} weigh nothing; `
    + `${paidHarmless.join(', ') || 'no harmless body'} weighs something -- a free hostile is a wave `
    + 'that can never meet its budget, and a harmless body with weight is the mortar spending it');
  process.exit(1);
}
/*
 * ...and every band that has waves has a budget, and the WALK across a band
 * averages exactly 1 -- so a band's middle rung is the band as it was
 * authored and the two ends are spread either side of it. Without that the
 * walk is a global nerf or a global buff wearing a distribution's clothes.
 */
const bandsWith = [...new Set(regular.filter((w) => threatOfWave(w) > 0).map((w) => w.band || 1))];
const noBudget = bandsWith.filter((b) => !(Director.budgetAt(1, b) > 0));
if (noBudget.length) {
  console.error(`band(s) ${noBudget.join(', ')} have waves and no budget`);
  process.exit(1);
}
const walkOf = (rw) => {
  const B = TIER.budget; const span = Math.max(1, TIER.bossEvery - 2);
  return B.open + (B.close - B.open) * Math.min(rw, span) / span;
};
const ordinary = [];
for (let rw = 0; rw <= TIER.bossEvery - 2; rw++) ordinary.push(walkOf(rw));
const meanWalk = ordinary.reduce((a, x) => a + x, 0) / ordinary.length;
if (Math.abs(meanWalk - 1) > 1e-9) {
  console.error(`the budget walk averages ${meanWalk.toFixed(4)} across a band's `
    + `${ordinary.length} ordinary rungs, not 1 -- ${TIER.budget.open}..${TIER.budget.close} is a `
    + 'change to how heavy a band is, not to how it is distributed');
  process.exit(1);
}
// Bodies over arrivals-a-second is the wave's own length. x21.0 of the bodies
// at x5.56 the rate is a wave x3.8 as long, which is the plan's 50s -> 190s.
const longer = popX / flowX;
if (!(longer > 1) || longer > 8) {
  console.error(`rung ${deep} asks for x${popX.toFixed(1)} the bodies at x${flowX.toFixed(2)} `
    + `the rate, which is a wave x${longer.toFixed(1)} as long; popStep and flow have to move `
    + 'together -- one without the other is a wave nobody can sit through, or one that is over');
  process.exit(1);
}
const tightest = CFG.waves.gap[0] * Math.min(TIER.overclockGap, 1)
  * Math.min(CFG.waves.press.open, CFG.waves.press.close) / flowX;
if (tightest < 1 / 30) {
  console.error(`the tightest release at rung ${deep} is ${(tightest * 1000).toFixed(0)}ms, which is `
    + 'inside two frames; that is a spawn storm and not a stream');
  process.exit(1);
}
console.log(`stream: rung ${deep} asks x${popX.toFixed(1)} the bodies at x${flowX.toFixed(2)} the rate `
  + `(a wave x${longer.toFixed(1)} as long), heaviest ask ${peak} through a field of `
  + `${CFG.maxEnemies}; tightest release ${(tightest * 1000).toFixed(0)}ms`);
console.log(`budget: ${bandsWith.length} bands priced off their own rosters `
  + `(${bandsWith.sort().map((b) => `${b}:${Director.budgetAt(1, b).toFixed(1)}`).join(' ')}), `
  + `walked ${TIER.budget.open}-${TIER.budget.close} across ${ordinary.length} ordinary rungs `
  + `(mean ${meanWalk.toFixed(2)}); rung 1 asks ${Math.max(...regular.map((w) => askAt(w, 1)))} at most, `
  + `rung ${deep} ${peak}`);
/*
 * Every regular wave carries a band, and every band has waves in it.
 *
 * A wave with no band is unreachable -- the director draws by band -- and an
 * empty band is a rung with nothing on it, which is a run that stalls on a
 * tier nobody can play. Both are silent at runtime and obvious here.
 */
const unbanded = regular.filter((w) => !w.band);
if (unbanded.length) {
  console.error(`${unbanded.length} wave(s) carry no band and can never be drawn: `
    + unbanded.map((w) => JSON.stringify(w.of)).join(' '));
  process.exit(1);
}
const byBand = {};
for (const w of regular) byBand[w.band] = (byBand[w.band] || 0) + 1;
const emptyBands = [1, 2, 3, 4, 5].filter((b) => !byBand[b]);
if (emptyBands.length) {
  console.error(`band(s) ${emptyBands.join(', ')} have no waves; the ladder would stall there`);
  process.exit(1);
}
/*
 * ...and every type opens before the band that wants it.
 *
 * `opens` is lifetime energy, and the thresholds are grouped by band so a
 * band's types are all in hand before the ladder draws from it. Grouped is not
 * something the numbers say about themselves -- they are ten integers in ten
 * scattered type entries -- so it is asserted: no type may open later than any
 * type of a band above it. The kill counts this replaced failed exactly here,
 * with HERALD (band 4) opening before PRISM (band 3).
 */
const bandOfType = {};
for (const w of regular) {
  for (const [id] of w.of || []) {
    bandOfType[id] = Math.min(bandOfType[id] ?? 9, w.band);
  }
}
const gates = ENEMY_TYPES
  .filter((t) => (t.opens || 0) > 0)
  .map((t) => ({ id: t.id, opens: t.opens, band: bandOfType[t.id] ?? 9 }))
  .sort((a, b) => a.opens - b.opens);
const ungrouped = gates.filter((g, i) => gates.slice(i + 1).some((h) => h.band < g.band));
if (ungrouped.length) {
  console.error('these types open after a type of a lower band, so a band can be '
    + `drawn before its own types are in hand: ${ungrouped.map((g) => `${g.id} (band ${g.band})`).join(', ')}`);
  process.exit(1);
}
console.log(`gates: ${gates.length} types on lifetime energy, band-ordered — `
  + gates.map((g) => `${g.id} ${g.opens}`).join(', '));

/*
 * ...and no run that already had a type can lose it.
 *
 * A save from before build 180 carries no `earned`, so the restore converts
 * the kill count it does carry at twelve -- the rate a run actually banks per
 * object. That only works while every threshold sits at or below its own old
 * kill gate times twelve; raise one past that and a player who was fighting
 * TOWs comes back to a run that has never heard of them.
 *
 * The kill gates are frozen here because they no longer exist anywhere else.
 * They are history, not configuration: this is the only thing that reads them,
 * and it reads them to prove the migration is still honest.
 */
const KILL_GATES = {
  lurcher: 18, splitter: 45, bloom: 85, herald: 125, prism: 165,
  warden: 205, scion: 245, bulwark: 285, glut: 330, tow: 380,
};
// Must match the conversion in Game.restore, which is `kills * kB(12)` from
// the byte migration -- twelve KILOBYTES a kill, the same rate it always
// was in the unit the gates are now written in. Both sides of the
// comparison moved by a thousand, so what it proves is unchanged.
const RATE = 12e3;
const relock = gates.filter((g) => (KILL_GATES[g.id] || 0) * RATE < g.opens);
if (relock.length) {
  console.error('these gates sit above their old kill gate x'
    + `${RATE}, so the save migration re-locks them: `
    + relock.map((g) => `${g.id} ${g.opens} > ${KILL_GATES[g.id] * RATE}`).join(', '));
  process.exit(1);
}
console.log(`  ...and none re-locks on a pre-180 save (all under kills x${RATE})`);

console.log(`ladder: ${regular.length} waves across 5 bands, ${TIER.perBand} rungs each `
  + `(${[1, 2, 3, 4, 5].map((b) => byBand[b]).join('/')}), heaviest ask ${peak} `
  + `through a field of ${CFG.maxEnemies}`);
/*
 * Types that are only ever produced by another type, never released directly.
 *
 * A boss's bodies are not of the field at all: they come through an APERTURE
 * and leave with it, and no wave will ever name them. Which ones those are is
 * the anomaly table's business rather than a list kept here -- a seventh boss
 * adding three types should not also have to remember to edit this file, and
 * before this it would have failed the build with "no wave releases: crest".
 */
const DERIVED = new Set([
  'plate', 'seed', 'towMass', 'drift',
  ...ANOMALIES.flatMap((a) => a.types),
]);
const placed = new Set(WAVES.flatMap((w) => w.of.map(([id]) => id)));
const unplaced = ENEMY_TYPES.filter((t) => !placed.has(t.id) && !DERIVED.has(t.id)).map((t) => t.id);
if (unplaced.length) {
  console.error(`no wave releases: ${unplaced.join(', ')} — unreachable outside the debug screen`);
  process.exit(1);
}
console.log(`${regular.length} regular waves, all 2-3 types, up to ${Math.max(...regular.map(bodiesOf))} `
  + `bodies at population ${CFG.waves.population} (${peak} asked for at rung ${deep}, field `
  + `${CFG.maxEnemies}); ${placed.size} types released, ${DERIVED.size} produced by others`);

/*
 * ORDINAL's frames are solid, and the way in costs what it says it costs.
 *
 * A segment's radius is half a side over the segments on it, so the segments
 * of a side meet. At r 15 against a 300-unit side they covered 62% of it and
 * rounds simply flew through: the core was at 99% while the frame was still
 * at 100%, which is the fight backwards. This is the arithmetic that stops
 * that returning as a tuning slip.
 */
const leaky = CFG.ordinal.rings
  .map((r, i) => [i, (r.half / r.per) * 2 * r.per, r.half * 2])
  .filter(([, covered, side]) => covered < side - 0.001);
if (leaky.length) {
  console.error(`ORDINAL frame ${leaky.map(([i, c, side]) => `${i} covers ${c.toFixed(0)} of ${side}`).join(', ')}`
    + ' — rounds go through a frame that does not close');
  process.exit(1);
}
/*
 * Every anomaly has a slot in the tree and its own colour.
 *
 * There is no price to check. Each config carried a `cost` -- ORDINAL's was
 * asserted against the tree's ANOMALY branch, and the other eight were
 * written to match a branch that build 227 removed, so for fifty-six builds
 * nine numbers sat in the config with no reader and this comment promised a
 * check of them. They came out with the byte migration rather than being
 * rescaled, because rescaling a dead field is work that LOOKS like coverage.
 * The way in is `CFG.waves.tier.gates` and `Game.syncGate`, which cost
 * nothing; if a price ever comes back it is a tree node like any other.
 */
const dupTone = ANOMALIES.map((a) => a.tone)
  .filter((t, i, all) => all.indexOf(t) !== i);
if (dupTone.length) {
  console.error(`two anomalies share a colour: ${dupTone.join(', ')} — the tone is the identity`);
  process.exit(1);
}
/*
 * Every anomaly stands on a rung, and the rungs only go up.
 *
 * This used to assert that an upgrade SOLD each way in and that its price
 * matched the boss's own config. The tree's ANOMALY branch went in build 227,
 * which leaves the GATE as the one way to meet one -- `CFG.waves.tier.gates`,
 * index n-1, lit by Game.syncGate at no cost. So what has to hold moves to
 * that table: an anomaly with no gate can never be reached at all, and a
 * sequence that does not increase is a boss standing in front of one that
 * comes after it.
 */
const gateRungs = CFG.waves.tier.gates;
/*
 * ...and from build 299 the table is DERIVED and the roster is LONGER.
 *
 * The equal-lengths check this replaces was right while every anomaly had a
 * door. The ladder is now a spacing and a depth -- one slot every `bossEvery`
 * rungs to `ceiling` -- so the table is seven entries against a roster of
 * nine, and AXIOM and TESSERA are deferred by having no rung at all. What has
 * to hold is therefore not "one gate each" but three things:
 *
 *   - the table IS the derivation. Written out it would be a hand-kept list,
 *     which is the shape that has cost this repo `world.apertures` sized 8
 *     against 9 anomalies, a lot count restated in four places, and a case
 *     pinning `gates.length === 9`. `rungsEvery` is imported rather than
 *     re-implemented here, or the guard is a second copy of the thing it is
 *     checking.
 *   - no gate names an anomaly that does not exist. A table LONGER than the
 *     roster is a rung the ladder holds for a fight nothing can open, which
 *     is a run that cannot continue -- the one direction that is fatal.
 *   - the ceiling is the last gate. A rung of empty ladder above the last
 *     anomaly reads as the game having run out rather than as an end, and a
 *     ceiling BELOW the last gate is the deadlock build 299 was written to
 *     remove: an anomaly on the far side of a hold nothing can lift.
 */
const wantGates = CFGMOD.rungsEvery(TIER.bossEvery, TIER.ceiling);
if (wantGates.length !== gateRungs.length || wantGates.some((r, i) => r !== gateRungs[i])) {
  console.error(`the gate rungs are not one every ${TIER.bossEvery} to ${TIER.ceiling}: `
    + `${gateRungs.join(', ')} against ${wantGates.join(', ')} -- derive it, do not type it`);
  process.exit(1);
}
if (gateRungs.length > ANOMALIES.length) {
  console.error(`${gateRungs.length} gate rungs against ${ANOMALIES.length} anomalies `
    + `(${gateRungs.join(', ')}); a gate with no anomaly behind it is a rung nothing can open`);
  process.exit(1);
}
if (gateRungs[gateRungs.length - 1] !== TIER.ceiling) {
  console.error(`the last gate is rung ${gateRungs[gateRungs.length - 1]} and the ceiling is `
    + `${TIER.ceiling}; the ladder must end ON its last anomaly, not above or below it`);
  process.exit(1);
}
/*
 * ...and the price of a NEW FORM is the count of gates under the era hold.
 *
 * `CFG.ordinal.recast` is both the REMAINDERs the node costs and the
 * reconciled count it asks for, and `eraHeld` stops the ladder at `eraGate`
 * -- so a requirement above the number of gates at or below that rung is a
 * DEADLOCK and not a price: the run is held, and the way through the hold
 * needs an anomaly the hold has made unreachable. Exactly what shipping the
 * derived table with `recast: 7` would have been.
 */
const underHold = gateRungs.filter((r) => r <= TIER.eraGate).length;
if (CFG.ordinal.recast > underHold) {
  console.error(`NEW FORM asks for ${CFG.ordinal.recast} reconciled and only ${underHold} gates `
    + `sit at or below eraGate ${TIER.eraGate} -- the run would be held with no way through`);
  process.exit(1);
}
const badGate = gateRungs.filter((t, i) => !(t > 0) || t !== Math.round(t)
  || (i > 0 && t <= gateRungs[i - 1]));
if (badGate.length) {
  console.error(`the gate rungs are not whole and increasing: ${gateRungs.join(', ')}`);
  process.exit(1);
}
/*
 * GNOMON's dial closes too.
 *
 * Same arithmetic as ORDINAL's frames and the same bug it guards against: 16
 * arcs round a ring of radius 150 have 942 units of circumference to cover,
 * so each needs a diameter of at least 58.9. Under that and rounds fly
 * between them, and the fight is about a wall that is not one.
 */
{
  const C = CFG.gnomon;
  const need = (Math.PI * C.dialR) / C.arcs;
  const have = TYPE_BY_ID.dial.r;
  if (have < need - 0.001) {
    console.error(`GNOMON's dial: ${C.arcs} arcs at radius ${C.dialR} need r ${need.toFixed(2)}, `
      + `DIAL is r ${have} — rounds go through a dial that does not close`);
    process.exit(1);
  }
  console.log(`GNOMON: ${C.arcs} arcs close a dial of ${C.dialR} (r ${have} >= ${need.toFixed(1)}), `
    + `${C.needleSeg} segments a needle`);
}

/*
 * TERMINUS's outer ring closes too -- and its inner one deliberately does not.
 *
 * Same arithmetic a third time. The outer ring is the boundary and a boundary
 * with rounds going through it is not one, so 32 bodies round a circle of
 * radius 300 need a diameter of at least 58.9. Checked at `ring`, the widest
 * it ever is once damage is possible: it only ever contracts from there, and
 * contracting makes it tighter.
 *
 * The inner ring is the opposite claim and is checked as such. Stage II is
 * meant to be two lattices of moving gaps, so 18 segments where 32 would be
 * needed is the design; if someone ever "fixes" it into a second wall the
 * stage stops being a stage.
 */
{
  const C = CFG.terminus;
  const need = (Math.PI * C.ring) / C.segs;
  const have = TYPE_BY_ID.bound.r;
  if (have < need - 0.001) {
    console.error(`TERMINUS's ring: ${C.segs} segments at radius ${C.ring} need r `
      + `${need.toFixed(2)}, BOUND is r ${have} — the edge of the world has holes in it`);
    process.exit(1);
  }
  const innerNeed = (Math.PI * C.ring * C.innerAt) / C.innerSegs;
  if (have >= innerNeed) {
    console.error(`TERMINUS's inner ring closes (${C.innerSegs} segments at radius `
      + `${(C.ring * C.innerAt).toFixed(0)} need r ${innerNeed.toFixed(2)}, BOUND is r ${have}) `
      + '— stage II is supposed to be a lattice of gaps, not a second wall');
    process.exit(1);
  }
  console.log(`TERMINUS: ${C.segs} segments close a ring of ${C.ring} `
    + `(r ${have} >= ${need.toFixed(1)}), ${C.innerSegs} inside it that deliberately do not `
    + `(need ${innerNeed.toFixed(1)})`);
}

/*
 * A stage may not change whose colour it is.
 *
 * The gauge escalates through a fight, and the first generated ramp did that
 * by walking the hue -- which is what ORDINAL's hand-authored table does,
 * magenta drifting toward red. That is only safe while nothing else owns red.
 * Generated for the other six it was a disaster: amber finished its fight on
 * crimson, teal on green, violet on blue, crimson on magenta, and DYNAMO's
 * blue finished on the cyan the entire interface is drawn in. Every boss
 * ended up wearing the next one's identity at exactly the moment the fight
 * was most worth looking at.
 *
 * So: a generated ramp stays within a sixtieth of a turn of its own tone.
 * ORDINAL is exempt because its table is authored rather than generated, and
 * it was shipped that way.
 */
{
  const hueOf = (hex) => {
    const v = parseInt(hex.slice(1), 16);
    const r = ((v >> 16) & 255) / 255;
    const g = ((v >> 8) & 255) / 255;
    const b = (v & 255) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx === mn) return 0;
    const d = mx - mn;
    if (mx === r) return ((g - b) / d + (g < b ? 6 : 0)) / 6;
    if (mx === g) return ((b - r) / d + 2) / 6;
    return ((r - g) / d + 4) / 6;
  };
  const apart = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  const drifted = [];
  for (const a of ANOMALIES) {
    if (a.bar) continue; // authored, not generated
    const own = hueOf(a.tone);
    for (const [c] of barRamp(a.tone)) {
      if (apart(hueOf(c), own) > 1 / 60) drifted.push(`${a.name} -> ${c}`);
    }
  }
  if (drifted.length) {
    console.error(`a gauge ramp leaves its own colour: ${drifted.join(', ')}`);
    process.exit(1);
  }
}

const built = ANOMALIES.filter((a) => a.built);
const panels = CFG.ordinal.rings.reduce((n, r) => n + r.per * 4, 0);
console.log(`${built.length} of ${ANOMALIES.length} anomalies built, each standing on its own rung (`
  + `${built.map((a) => `${a.name} ${CFG.waves.tier.gates[a.n - 1] ?? 'deferred'}`).join(', ')})`);
console.log(`ORDINAL: ${panels} segments in ${CFG.ordinal.rings.length} closed frames`);

// ---- REV: what these bytes actually are ------------------------------------
//
// Everything the browser is served, in a fixed order, hashed. config.js's own
// REV line is blanked before hashing or the value could never be stable — it
// would be an input to itself.
const REV_LINE = /export const REV = '[^']*';/;
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const files = [...src.map((f) => `src/${f}`).sort(), 'styles.css', 'index.html', 'sw.js'];
const h = createHash('sha256');
for (const f of files) {
  h.update(f);
  h.update(f === 'src/config.js' ? read(f).replace(REV_LINE, '') : read(f));
}
const rev = h.digest('hex').slice(0, 7);

const cfgPath = new URL('../src/config.js', import.meta.url);
const cfg = readFileSync(cfgPath, 'utf8');
if (process.argv.includes('--stamp')) {
  if (!REV_LINE.test(cfg)) {
    console.error('no REV literal in src/config.js to stamp');
    process.exit(1);
  }
  writeFileSync(cfgPath, cfg.replace(REV_LINE, `export const REV = '${rev}';`));
  console.log(`rev stamped ${rev}`);
} else {
  const found = (cfg.match(/export const REV = '([^']*)'/) || [])[1];
  if (found !== rev) {
    console.error(`rev stale: src/config.js=${found || '(none)'} actual=${rev}`);
    console.error('run: node scripts/check-build.mjs --stamp');
    process.exit(1);
  }
  console.log(`rev ${rev} matches ${files.length} files`);
}
