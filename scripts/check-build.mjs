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
const cov = coverage();
if (cov.missing.length || cov.extra.length || cov.dupes.length) {
  if (cov.missing.length) console.error(`tree is missing: ${cov.missing.join(', ')}`);
  if (cov.extra.length) console.error(`tree has unknown ids: ${cov.extra.join(', ')}`);
  if (cov.dupes.length) console.error(`tree places twice: ${cov.dupes.join(', ')}`);
  process.exit(1);
}
console.log(`tree places all ${cov.want} buyable things exactly once`);

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
const { MAX_BODY_R, GRID_CELL } = await import(new URL('../src/config.js', import.meta.url));
if (!(GRID_CELL >= 2 * MAX_BODY_R)) {
  console.error(`broadphase cell ${GRID_CELL} is under 2 x the largest body (${MAX_BODY_R}); `
    + 'two of those can overlap two cells apart and never be tested');
  process.exit(1);
}
if (!readFileSync(new URL('../src/game.js', import.meta.url), 'utf8').includes('GRID_CELL')) {
  console.error('src/game.js no longer uses GRID_CELL — the grid is sized by something unguarded');
  process.exit(1);
}
console.log(`broadphase cell ${GRID_CELL} covers the largest body (${MAX_BODY_R})`);

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
const peak = Math.max(...regular.map((w) => Math.round(bodiesOf(w) * CFG.waves.swell[1])));
if (peak > CFG.maxEnemies) {
  console.error(`the heaviest wave asks for ${peak} bodies at full swell against a field cap `
    + `of ${CFG.maxEnemies}; the cap would be doing the balancing`);
  process.exit(1);
}
// Types that are only ever produced by another type, never released directly.
// ORDINAL's three are not of the field at all: they come through the APERTURE
// and leave with it, and no wave will ever name them.
const DERIVED = new Set(['plate', 'seed', 'towMass', 'drift', 'tally', 'ordinal', 'digit']);
const placed = new Set(WAVES.flatMap((w) => w.of.map(([id]) => id)));
const unplaced = ENEMY_TYPES.filter((t) => !placed.has(t.id) && !DERIVED.has(t.id)).map((t) => t.id);
if (unplaced.length) {
  console.error(`no wave releases: ${unplaced.join(', ')} — unreachable outside the debug screen`);
  process.exit(1);
}
console.log(`${regular.length} regular waves, all 2-3 types, up to ${Math.max(...regular.map(bodiesOf))} `
  + `bodies at population ${CFG.waves.population} (${peak} at full swell, cap ${CFG.maxEnemies}); `
  + `${placed.size} types released, ${DERIVED.size} produced by others`);

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
const ap = ALL_UPGRADES.find((u) => u.id === 'aperture');
if (!ap || ap.cost !== CFG.ordinal.cost) {
  console.error(`APERTURE is priced at ${ap ? ap.cost : 'nothing'} against CFG.ordinal.cost `
    + `${CFG.ordinal.cost}`);
  process.exit(1);
}
const panels = CFG.ordinal.rings.reduce((n, r) => n + r.per * 4, 0);
console.log(`ORDINAL: ${panels} segments in ${CFG.ordinal.rings.length} closed frames, `
  + `APERTURE ${ap.cost}`);

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
