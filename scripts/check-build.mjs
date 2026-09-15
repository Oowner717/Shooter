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
const { ENEMY_TYPES, CFG, TYPE_BY_ID, GAITS } = await import(new URL('../src/config.js', import.meta.url));
const chroma = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
};
/*
 * ---- a GAIT is declared from a vocabulary, and every word in it is read ---
 *
 * Two directions, because each fails differently and silently.
 *
 * A type naming a gait nothing implements gets the march it was trying not to
 * take: `drive`'s dispatch falls through to `wander` or to the route, nothing
 * throws, and the body simply walks downhill like everything else. That is
 * the `shape` fault verbatim -- five shapes with no case in the draw switch
 * fell through to `drawChip` for fourteen builds.
 *
 * And an entry in GAITS with no reader is a promise the table is making and
 * the code is not keeping, which is `kind: 'works'` verbatim: the six build
 * lots carried that field for eighteen builds while `buildGun` checked only
 * that a lot existed. So each id has to appear BY NAME in src/enemies.js.
 */
const gaitSrc = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const gaitWords = Object.keys(GAITS);
const badGait = ENEMY_TYPES.filter((t) => t.gait && !gaitWords.includes(t.gait))
  .map((t) => `${t.id} declares gait '${t.gait}', which is not in GAITS`);
const mute = gaitWords.filter((g) => !new RegExp(`'${g}'`).test(gaitSrc))
  .map((g) => `GAITS.${g} is read by nothing in src/enemies.js`);
if (badGait.length || mute.length) {
  for (const line of [...badGait, ...mute]) console.error(`gaits: ${line}`);
  process.exit(1);
}
console.log(`gaits: ${gaitWords.length} in the vocabulary (${gaitWords.join(' ')}), all read; `
  + `${ENEMY_TYPES.filter((t) => t.gait).length} types declare one, the rest march`);

/*
 * ---- a RIDE type authors what it GIVES, and there is no default ---------
 *
 * `CFG.graft.grow` / `.tough` / `.regen` / `.hp` / `.life` / `.hunt` were one
 * block shared by the only rider in the game for a hundred and fifty builds.
 * Build 322 added a second with different numbers for five of the six, which
 * is the fault build 319 needed a guard for from the other direction -- a
 * second `plated` type would have worn `CFG.flint`'s arc and slew rate in
 * total silence -- and build 224's `levels ?? 3`, which sold eight nodes three
 * times. So the numbers live on the type and `ridesOf` throws for a `ride`
 * type that declares none.
 *
 * Caught at the TABLE and not only at the throw, because `ridesOf` runs from
 * the Enemy constructor: a throw there is a throw inside the rAF loop, which
 * build 288 records as reading like a frozen screen rather than an error. It
 * also catches a rider authored but never released -- one the constructor
 * never sees and so can never throw for.
 *
 * Held in BOTH directions. A `rides` block on a type that does not declare
 * `gait: 'ride'` is a block nothing reads, which is `kind: 'works'` (eighteen
 * builds) and the nine anomaly `cost` fields (fifty-six).
 */
const RIDE_KEYS = ['life', 'hunt', 'grow', 'tough', 'armor', 'regen', 'hp'];
const rideBad = [];
for (const t of ENEMY_TYPES) {
  const isRider = t.gait === 'ride';
  if (isRider && !t.rides) {
    rideBad.push(`${t.id} declares gait 'ride' and no rides block`);
    continue;
  }
  if (t.rides && !isRider) {
    rideBad.push(`${t.id} declares a rides block and is not gait 'ride', so nothing reads it`);
    continue;
  }
  if (!isRider) continue;
  for (const k of RIDE_KEYS) {
    const v = t.rides[k];
    if (!Number.isFinite(v) || v < 0) rideBad.push(`${t.id}: rides.${k} is ${v}`);
  }
  for (const k of Object.keys(t.rides)) {
    if (!RIDE_KEYS.includes(k)) rideBad.push(`${t.id}: rides.${k} is read by nothing`);
  }
  if (t.rides.life <= 0 || t.rides.hunt <= 0 || t.rides.hp <= 0) {
    rideBad.push(`${t.id}: life ${t.rides.life}, hunt ${t.rides.hunt}, hp ${t.rides.hp} `
      + '-- a rider with no clock, no reach or no health is not a rider');
  }
  /*
   * A rider that cannot cross the field it is released into cannot work, and
   * nothing would fail for it: it would hunt nothing, wander, and expire.
   * `life` at its own cruise has to cover the era-1 column with room over,
   * and `hunt` has to be able to SEE that far -- SEED is exempt from the
   * second half because a SCION throws it into the crowd it is already
   * standing in, which is what `weight: 0` plus `harmless` says.
   */
  const column = CFG.entryDepth + 700; // a floor-to-rim order of magnitude
  if (t.rides.life * t.speed < column) {
    rideBad.push(`${t.id}: life ${t.rides.life}s at speed ${t.speed} covers `
      + `${(t.rides.life * t.speed) | 0} units, under the ~${column} it may have to cross`);
  }
}
/*
 * ...and the ARMOUR CEILING is reachable, which is what makes it a rule.
 *
 * `applyDamage` computes `dmg * (1 - plate)`, so a ring of riders adding flat
 * armour can make a body nothing can kill: FLINT is 0.55 and three LATCHes at
 * 0.2 reach 1.15. `refreshGrafts` clamps at `CFG.graft.armorCap`, and BOTH
 * halves are asserted -- the cap is under 1, and the worst unclamped case is
 * over the cap. The second half is the build-198 rule: a threshold nothing can
 * physically reach is a door that never opens, and a clamp that can never
 * clamp is a branch whose other arm is dead code.
 */
const riders = ENEMY_TYPES.filter((t) => t.gait === 'ride');
const worstRide = Math.max(0, ...riders.map((t) => t.rides.armor));
const worstBody = Math.max(0, ...ENEMY_TYPES.filter((t) => !t.fixed && !t.gait).map((t) => t.armor || 0));
const worstRing = worstBody + worstRide * CFG.graft.stack;
if (!(CFG.graft.armorCap > 0 && CFG.graft.armorCap < 1)) {
  rideBad.push(`graft.armorCap ${CFG.graft.armorCap} is not inside (0, 1)`);
}
if (worstRide > 0 && !(worstRing > CFG.graft.armorCap)) {
  rideBad.push(`graft.armorCap ${CFG.graft.armorCap} cannot be reached: the worst ring is `
    + `${worstRing.toFixed(2)} (body ${worstBody} + ${CFG.graft.stack} x ${worstRide}), `
    + 'so the clamp is a branch that can never be taken');
}
if (rideBad.length) {
  for (const line of rideBad) console.error(`rides: ${line}`);
  process.exit(1);
}
console.log(`rides: ${riders.length} riders (${riders.map((t) => t.id).join(' ')}), all seven keys; `
  + `armour caps at ${CFG.graft.armorCap} against a worst ring of ${worstRing.toFixed(2)}`);

/*
 * ---- a RISE type authors its CLOCK, and the nominal speed has to agree ----
 *
 * `climb` is seconds and `rise` derives the cruise from it against the column
 * the body is actually on, so the climb is the same duration at either era.
 * Two things can go wrong and neither announces itself.
 *
 * A MISSING clock. `climbOf` throws, which is build 224's `levels` rule and
 * build 303's `band` rule applied to a third mandatory field -- but a throw at
 * spawn time is a throw in the rAF loop, which build 288 records as reading
 * like a freeze rather than an error. So it is caught at the table instead.
 *
 * A DRIFTED nominal. `type.speed` is still read by `scaleToTier` and by
 * everything that expects a type to have one, so it is a second number for
 * the same fact -- exactly the shape this repo keeps paying for. It is pinned
 * by arithmetic rather than by trust: `speed * climb` is the column the clock
 * was authored against, so every rise type's product must agree with every
 * other's. They all cross the same field.
 */
/*
 * ---- every shape case supplies its helper's whole signature -------------
 *
 * `case 'drift': drawDrift(ctx, r, 0)` against `drawDrift(ctx, r, phase, time)`
 * shipped for the life of the glossary. `time` was `undefined`, so
 * `Math.sin(time * 1.3 + phase)` is NaN and the pulse ring's radius and all
 * three orbiting dots' centres were NaN -- canvas silently draws nothing for a
 * non-finite path, so DRIFT's icon was its dashed outline and nothing else.
 * Measured: one NaN radius and three NaN centres of ten path arguments.
 *
 * It cost more than an icon. Every grey the suite renders is compared against
 * that specimen as its CONTROL, so build 308's LANTERN arm was measuring
 * against a DRIFT missing the two features its own docstring names. A broken
 * control reads as a passing case.
 *
 * Swept rather than fixed, because nothing about the fault announced itself: a
 * missing argument is legal JavaScript and a NaN path is a legal no-op. One
 * instance across 45 helpers, which is what makes it worth a guard rather
 * than a grep.
 */
const drawSrc = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const arity = {};
for (const m of drawSrc.matchAll(/^function (draw[A-Za-z0-9_]+)\(([^)]*)\)/gm)) {
  arity[m[1]] = m[2].split(',').map((x) => x.trim()).filter(Boolean).length;
}
const thin = [];
for (const m of drawSrc.matchAll(/case '([a-z0-9]+)': (draw[A-Za-z0-9_]+)\(([^;]*?)\); break;/g)) {
  const [, shape, fn, args] = m;
  if (!(fn in arity)) continue;
  let depth = 0;
  let n = args.trim() ? 1 : 0;
  for (const ch of args) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  if (n < arity[fn]) thin.push(`case '${shape}' passes ${n} of ${fn}'s ${arity[fn]} arguments`);
}
if (thin.length) {
  for (const line of thin) console.error(`shape args: ${line}`);
  process.exit(1);
}
console.log(`shape args: every case supplies its helper's whole signature (${Object.keys(arity).length} helpers)`);

const risers = ENEMY_TYPES.filter((t) => t.gait === 'rise');
const noClock = risers.filter((t) => !(typeof t.climb === 'number' && t.climb > 0))
  .map((t) => `${t.id} is a 'rise' type and declares no climb`);
const cols = risers.map((t) => ({ id: t.id, col: t.speed * t.climb }));
const lo = Math.min(...cols.map((c) => c.col));
const hi = Math.max(...cols.map((c) => c.col));
const drifted = risers.length > 1 && hi > lo * 1.03
  ? [`speed x climb disagrees across the rise types (${cols.map((c) => `${c.id} ${c.col}`).join(', ')})`
    + ' -- they all cross the same column, so one of the nominals has drifted']
  : [];
if (noClock.length || drifted.length) {
  for (const line of [...noClock, ...drifted]) console.error(`rise: ${line}`);
  process.exit(1);
}
/*
 * A type that is more than one body says so in a field `release()` dispatches
 * on, and everything that counts bodies per authored entry has to read it.
 * Four such fields today -- `tows` (2), `beads` (7), `school` (14) and
 * `pair` (2) -- and
 * the guard is that each numeric one is a whole number above one, so
 * `beads: 1` (a chain of one, and a dispatch for nothing) cannot be written.
 *
 * ---- and the LIST is read out of `release` rather than written here ------
 *
 * `if (type.X) return` is the dispatch, so the source is the roster of
 * multiplicity fields and this cannot fall behind it -- which a hand-kept
 * list of two would have done the moment `school` was added, silently,
 * because every assertion in it is about the fields it happens to name. Held
 * in BOTH directions, the shape the gait vocabulary already uses: a field
 * `release` dispatches on that no type declares is a branch nothing can
 * take, and a type declaring a multiplicity `release` does not dispatch on is
 * one authored entry silently becoming one body.
 */
const relSrc = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const relBody = relSrc.slice(relSrc.indexOf('export function release('));
const dispatched = [...relBody.slice(0, relBody.indexOf('\n}')).matchAll(/if \(type\.(\w+)\) return/g)]
  .map((m) => m[1]);
const MULTI = ['tows', 'beads', 'school', 'pair'];
const missedDispatch = MULTI.filter((f) => !dispatched.includes(f));
const extraDispatch = dispatched.filter((f) => !MULTI.includes(f));
const unclaimed = dispatched.filter((f) => !ENEMY_TYPES.some((t) => t[f] !== undefined));
const multi = ENEMY_TYPES.filter((t) => dispatched.some((f) => typeof t[f] === 'number'));
const badMulti = [
  ...missedDispatch.map((f) => `release() no longer dispatches on \`${f}\`, which this guard counts`),
  ...extraDispatch.map((f) => `release() dispatches on \`${f}\`, which nothing here counts as a multiplicity`),
  ...unclaimed.map((f) => `release() dispatches on \`${f}\` and no type declares it`),
  ...multi.flatMap((t) => dispatched.filter((f) => typeof t[f] === 'number')
    .filter((f) => !(Number.isInteger(t[f]) && t[f] > 1))
    .map((f) => `${t.id} declares ${f}: ${t[f]}, which is not a whole number above one`)),
];
if (badMulti.length) {
  for (const line of badMulti) console.error(`multiplicity: ${line}`);
  process.exit(1);
}
/*
 * ...and a chain's derived follow distance has to clear the floor the pair
 * solver imposes. `resolvePair` corrects any overlap and exempts nothing for
 * being harmless, so a gap under `2r + slop` is a snake grinding against
 * itself -- measured at `2r + 8`, the worst gap touched 18.0 against a floor
 * of 18.4.
 */
const tight = multi.filter((t) => typeof t.beads === 'number')
  .map((t) => ({ id: t.id, gap: t.r * 2 + CFG.chain.clear, floor: t.r * 2 + CFG.physics.slop }))
  .filter((c) => c.gap <= c.floor)
  .map((c) => `${c.id}'s gap ${c.gap} is inside the pair solver's floor of ${c.floor}`);
if (tight.length) {
  for (const line of tight) console.error(`chain: ${line}`);
  process.exit(1);
}
console.log(`multiplicity: ${multi.length + 1} type(s) are more than one body, off release()'s own `
  + `dispatch on ${dispatched.join('/')} (`
  + `${[...multi.map((t) => `${t.id} `
    + `${dispatched.map((f) => t[f]).find((v) => typeof v === 'number')}`), 'tow 2'].join(', ')})`);

console.log(`rise: ${risers.length} type(s) author a clock (${risers.map((t) => `${t.id} ${t.climb}s`).join(' ')}), `
  + `nominal speeds agree on a column of ${lo}-${hi}`);

const { fractureDepth, fractureFactor, barOf, pairOf, respawnOf, threatOf, formable } = await import(new URL('../src/enemies.js', import.meta.url));

/*
 * ---- A FRACTURE HAS TO TERMINATE, and nothing else would say so ----------
 *
 * `splits.type` naming the parent's own id makes the chain recursive, and the
 * thing that ends it is arithmetic: the radius falls by `scale` a generation
 * until it is under `floor`. So a `scale` at or above 1 is not a balance
 * mistake, it is `threatOf` looping for ever -- and `threatOf` is called from
 * `Director.load`, from this file, and from the tree's own price sweep, so
 * the failure is the game not booting rather than a wave being wrong.
 *
 * `fractureDepth` throws for one; this calls it for every type so an
 * unreachable fracture cannot be authored and left to be discovered on the
 * rung its band starts at. The reported numbers are DERIVED from the same
 * three fields the behaviour is, which is the rule the gate table and the
 * lot count both had to learn: ask the structure, never restate it.
 */
const frac = ENEMY_TYPES.filter((t) => fractureDepth(t) > 0).map((t) => {
  const d = fractureDepth(t);
  const radii = Array.from({ length: d + 1 }, (_, i) => +(t.r * t.splits.scale ** i).toFixed(1));
  const last = t.splits.count ** d;
  let made = 0;
  for (let i = 0; i <= d; i++) made += t.splits.count ** i;
  return { id: t.id, d, radii, last, made, hp: fractureFactor(t) };
});
const badFrac = frac.filter((f) => f.radii[f.d] >= ENEMY_TYPES.find((t) => t.id === f.id).splits.floor)
  .map((f) => `${f.id}'s last generation at r ${f.radii[f.d]} is still above its own floor`);
if (badFrac.length) {
  for (const line of badFrac) console.error(`fracture: ${line}`);
  process.exit(1);
}
/*
 * ---- EVERY FIELD A TYPE DECLARES HAS TO HAVE A READER -------------------
 *
 * This is the third dead field on a config object to be found by hand, and
 * the first two each shipped for eighteen and fifty-six builds: `kind:
 * 'works'` on the build lots, and a `cost` on all nine anomalies whose only
 * reader left with build 227's ANOMALY branch. On the roster it was TWO --
 * `large: true` on fifteen types, under a comment claiming it made a body
 * "released more slowly, and worth more when it lands", and `solo: true` on
 * SCION, which was not decoration at all: it named a measured bug and
 * nothing read it.
 *
 * So the sweep is the guard, and it is cheap: the union of every key any
 * ENEMY_TYPE declares, each one required to appear as `.key` or as a quoted
 * string somewhere in src/ OUTSIDE config.js. Declaring a field is not
 * reading it, which is the whole distinction.
 *
 * It errs toward passing -- a short name like `r` or `hp` matches something
 * unrelated in a thousand places -- and that is the right direction: this
 * cannot be the instrument that tells you a field is LIVE, only the one that
 * tells you a field is definitely dead. A dead field is `git rm`, or, if its
 * comment names a rule, the rule.
 */
const typeSrc = src.filter((f) => f !== 'config.js')
  .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
const declaredKeys = [...new Set(ENEMY_TYPES.flatMap((t) => Object.keys(t)))].sort();
const unread = declaredKeys.filter((k) => !new RegExp(`\\.${k}\\b|['"\`]${k}['"\`]`).test(typeSrc));
if (unread.length) {
  for (const k of unread) {
    console.error(`dead field: every type field needs a reader in src/ and \`${k}\` has none `
      + `(declared by ${ENEMY_TYPES.filter((t) => k in t).map((t) => t.id).join(', ')})`);
  }
  process.exit(1);
}
console.log(`type fields: all ${declaredKeys.length} keys the roster declares are read in src/`);

console.log(`fracture: ${frac.length} type(s) break into their own kind (`
  + `${frac.map((f) => `${f.id} r ${f.radii.join('->')}, ${f.last} of ${f.made} bodies, x${f.hp.toFixed(2)} health`).join('; ')})`);

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
/*
 * ---- ...AND THE CELL ITSELF IS PINNED, BECAUSE WIDENING IT IS GLOBAL ----
 *
 * Build 329. The guard above refuses a cell that is too NARROW, which is the
 * correctness half -- and it cannot refuse one that is legitimately wider,
 * because `GRID_CELL` is derived from `MAX_BODY_R` and a bigger body makes a
 * bigger cell by arithmetic. So a new type widens the grid for the whole
 * game, silently, and the only thing that reported it was a `console.log`
 * nobody was reading.
 *
 * That happened at build 328. ANVIL is r 56 and not `fixed`, so it counts at
 * `56 * (1 + MAX_GRAFT_GROW * graft.stack)` = **89.6** -- the largest body in
 * the game, against a fully grafted BULWARK's 72 -- and the cell went
 * **144 -> 180**. Two measured consequences, neither of them intended by that
 * build:
 *
 *   - The ORDINAL hash MOVED, `1213474222` -> `-1334607133`. Bisected rather
 *     than guessed: 328's physics.js and enemies.js against 327's config.js
 *     give 1213474222 to the bit, and 328's config.js with the WAVE removed
 *     still gives -1334607133, so the channel is the type's presence in
 *     `ENEMY_TYPES` and not the wave (which is what build 318's note already
 *     said about the wave table). A wider cell tests different pairs in a
 *     different order, which is what `MAX_BODY_R`'s own docstring warns
 *     about: "It also silently changed every fight that was already tuned,
 *     which is how it was caught."
 *   - A full 57-body field costs **0.268 -> 0.387 ms an update**, best of
 *     five runs of 300 updates each. That is 1.44x the update cost for 1.56x
 *     the cell area, and about 2.3% of a 60Hz frame -- small in absolute
 *     terms and worth knowing before it is paid again.
 *
 * The widening is CORRECT and stays: a grafted anvil really can be 89.6, so a
 * 144 cell would be a hole in the guarantee above. What was missing is
 * anything that made somebody look. This pin is that: the number is written
 * down with the body that sets it, so moving it is a deliberate edit with a
 * reason rather than a side effect of authoring a radius.
 */
const CELL_PIN = 180;
const CELL_BY = 'anvil';
if (GRID_CELL !== CELL_PIN) {
  const widest = CFGMOD.ENEMY_TYPES
    .map((t) => ({ id: t.id, at: t.fixed ? t.r : t.r * (1 + CFGMOD.MAX_GRAFT_GROW * BCFG.graft.stack) }))
    .sort((a, b) => b.at - a.at)[0];
  console.error(`broadphase cell is ${GRID_CELL}, pinned at ${CELL_PIN} (set by ${CELL_BY}). `
    + `The widest body is now ${widest.id} at ${widest.at.toFixed(1)}. A cell change is a `
    + 'change to which pairs the broadphase tests, so it moves the ORDINAL hash and costs '
    + 'every object in the game broadphase time -- measured 0.268 -> 0.387 ms an update on a '
    + 'full field for 144 -> 180. Take the hash before and after, record the delta and its '
    + 'cause, and move this pin in the same commit.');
  process.exit(1);
}
console.log(`broadphase cell ${GRID_CELL} covers the largest body (${MAX_BODY_R}) and `
  + `the largest static one (${STATIC_R}); worst pair ${MAX_BODY_R + STATIC_R}, needs ${NEED} `
  + `-- pinned at ${CELL_PIN}, set by ${CELL_BY}`);

/*
 * ---- A BAR IS A HIT PROFILE, SO ITS REACH HAS TO BE DECLARED ------------
 *
 * `bar` makes a round test a CAPSULE instead of a circle, and the capsule
 * reaches `(long + thin) * r` from the centre -- past `r`, which is the point
 * and also the hazard: `MAX_BODY_R` is what the broadphase cell is sized
 * against and what every "how big can a body be" claim in this file rests
 * on. A bar longer than that would be hittable outside the region anything
 * else in the game reasons about.
 *
 * `barOf` throws for a thickness at or above the length; this asserts the
 * reach at the TABLE, because the alternative is finding out on the first
 * round fired -- and build 288's note is that a throw in a draw or hit path
 * reads as a freeze rather than an error.
 */
const bars = ENEMY_TYPES.filter((t) => t.bar).map((t) => ({ id: t.id, ...barOf(t) }));
const overReach = bars.filter((b) => b.reach > MAX_BODY_R)
  .map((b) => `${b.id}'s bar reaches ${b.reach.toFixed(1)} against a MAX_BODY_R of ${MAX_BODY_R}`);
if (overReach.length) {
  for (const line of overReach) console.error(`bar: ${line}`);
  process.exit(1);
}
/*
 * ...and each one declares its OWN proportions, from build 330.
 *
 * They were `CFG.cartwheel.long` / `.thin` -- the GAIT's block -- until a
 * second capsule type arrived, at which point VEIL's membrane would have been
 * tested as a 166-unit spindle with no field to set and nothing to fail.
 * `barOf` throws for a missing or malformed block, which is what the map above
 * exercises; this asserts the other half, that no two bars are the same shape
 * by accident, and prints each one so a proportion that drifts is visible.
 */
const barShapes = new Map();
for (const b of bars) {
  const t = ENEMY_TYPES.find((x) => x.id === b.id);
  const key = `${t.bar.long}x${t.bar.thin}`;
  if (barShapes.has(key)) {
    console.error(`bar: ${b.id} and ${barShapes.get(key)} declare the same proportions (${key}) -- `
      + 'a shape shared between two types is a shape one of them inherited rather than chose. '
      + 'If they really are the same body, say so here.');
    process.exit(1);
  }
  barShapes.set(key, b.id);
}
/*
 * ---- ...AND A SHEET NEEDS A CAPSULE, AND HAS TO HANG LEVEL -------------
 *
 * Build 330. `sheet` says the body OCCLUDES -- `Game.autoTarget` refuses
 * anything whose ray from the machine crosses it -- and two things it does
 * not declare itself are load-bearing:
 *
 *   - `bar`, because what occludes is the CAPSULE. Without one `barHalf` is
 *     `NaN`, `occluded` compares `NaN <= 36` and silently refuses nothing at
 *     all: a whole mechanism switched off with no error and no fail.
 *   - `upright`, because the proof that occlusion cannot leave the gun with
 *     nothing to shoot is that two LEVEL capsules cannot each cross the
 *     other's ray first -- one of them is nearer the machine, so the relation
 *     is a strict order by depth and has no cycle. A tilted sheet can cross
 *     another tilted sheet in an X, and then neither is choosable.
 *
 * Unlike `plated` (319), `rides` (322), `respawn` (324) and `planted` (328)
 * there is deliberately NO refusal of a second type declaring `sheet`: those
 * four have readers that consult a shared block, and a sheet's readers
 * consult the body's own `bar`, `angle` and position. The guard goes on the
 * flag when the flag's readers look somewhere else.
 */
const sheetTypes = ENEMY_TYPES.filter((t) => t.sheet);
for (const t of sheetTypes) {
  if (!t.bar) {
    console.error(`sheet: ${t.id} occludes but declares no bar -- what occludes is the capsule, and `
      + 'without one `barHalf` is NaN and `occluded` refuses nothing at all, silently');
    process.exit(1);
  }
  if (!t.upright) {
    console.error(`sheet: ${t.id} occludes but is not upright -- the guarantee that something is `
      + 'always choosable rests on two LEVEL capsules being unable to hide each other, which is a '
      + 'strict order by depth. A tilted sheet can cross another in an X and leave neither pickable.');
    process.exit(1);
  }
}
const SP = CFG.spread;
if (!(SP.lanes >= 3 && SP.lanes % 2 === 1)) {
  console.error(`spread.lanes ${SP.lanes}: at least three, and ODD -- the candidates are spread evenly `
    + "across a symmetric band, so an odd count is what puts one on the machine's own column. "
    + 'That column is the one the spread treats as already occupied, and with an even count there is '
    + 'nothing standing at the middle for the rule to spread away from.');
  process.exit(1);
}
if (!(SP.slant > 0 && SP.look > 0)) {
  console.error(`spread.slant ${SP.slant} / look ${SP.look}: both positive. At slant 0 the aim point is `
    + 'infinitely far below and the body never crosses; at look 0 a body already on its lane aims at '
    + 'its own depth and stops descending.');
  process.exit(1);
}
if (sheetTypes.length) {
  console.log(`sheet: ${sheetTypes.length} type(s) occlude (`
    + `${sheetTypes.map((t) => `${t.id} spans ${(2 * barOf(t).half).toFixed(0)} and hides within `
      + `${barOf(t).thick.toFixed(1)} of the ray`).join('; ')}), crossing to one of ${SP.lanes} lanes `
    + `at ${SP.slant} of lateral per unit of depth`);
}
console.log(`bar: ${bars.length} type(s) are tested as a capsule (`
  + `${bars.map((b) => `${b.id} ${(b.half * 2).toFixed(0)}x${(b.thick * 2).toFixed(0)}, reach `
    + `${b.reach.toFixed(1)} of ${MAX_BODY_R}`).join('; ') || 'none'}); the cartwheel spins at `
  + `${(CFG.cartwheel.spin / (2 * Math.PI)).toFixed(3)} rev/s`);


/*
 * ---- A PLATE ON ONE FACE IS A MECHANISM WITH TWO WAYS TO BE VACUOUS -----
 *
 * `CFG.flint.front` is the cosine of the plate's half-arc, and both ends of
 * its range delete the object rather than tune it: at 0 the plate covers
 * every direction that is not behind, which is ordinary armour with extra
 * arithmetic, and at 1 it covers a single ray and nothing ever meets it. The
 * guide's arc is +-53 degrees, so the value is about 0.6 and the degrees are
 * printed because a cosine is not readable.
 *
 * ...and a `plated` type with no `armor` is the whole mechanism doing
 * nothing: `applyDamage` reaches the directional branch only when `plate` is
 * already above zero, so an author who sets the flag and forgets the armour
 * gets silence rather than an error.
 *
 * ...and a SECOND plated type would silently wear FLINT's numbers. Both
 * readers are hard-wired to this one block -- `Enemy.frontal` reads
 * `CFG.flint.front` and `Enemy.face` reads `CFG.flint.turn` -- so a new type
 * declaring `plated` gets a 53-degree arc slewing at 1.6 rad/s whatever its
 * own design said, with no field to set and nothing to fail. The same shape
 * as `levels` defaulting to 3 (eight nodes sold three times) and a `band`
 * reading as band 1: a value that is inherited in silence is
 * indistinguishable from a value that was chosen. The build stops here and
 * says what has to move, rather than letting the arc be decided by which
 * body happened to be authored first.
 */
/*
 * ---- PLANTED is read at two doors, and both are written for ONE object ---
 *
 * Build 328. `Enemy.applyDamage` zeroes the impulse argument for a planted
 * body and `resolvePair` gives it no share of a contact -- between them that
 * is every shove in the game, which is why the refusal is two lines rather
 * than a sweep. But neither reader asks the TYPE anything: a second type
 * declaring the flag inherits the whole of ANVIL's design in silence, which
 * is exactly build 319's `plated` fault and 322's `rides` fault read
 * forwards, and 224's `levels ?? 3` before them.
 *
 * So one planted type, and the build says what has to move before a second
 * arrives. It also holds the pairing: `planted` without `creep` is a body
 * that cannot be moved and still takes an evasive arc, which is not a
 * contradiction the engine would catch -- `drive` would simply steer it --
 * but it is not a thing anyone has designed, and the two halves of this
 * object are meant to be read together.
 */
const planted = ENEMY_TYPES.filter((t) => t.planted);
if (planted.length) {
  const bad = [];
  if (planted.length > 1) {
    bad.push(`${planted.length} types are planted (${planted.map((t) => t.id).join(', ')}) and `
      + 'both readers -- applyDamage\'s impulse and resolvePair\'s share -- are written '
      + 'against ANVIL. Give the refusal a per-type shape before adding another.');
  }
  for (const t of planted) {
    if (t.gait !== 'creep') {
      bad.push(`${t.id} is planted and its gait is '${t.gait}', not 'creep' -- a body nothing `
        + 'can move that still takes an evasive arc is half an object');
    }
  }
  if (bad.length) {
    for (const line of bad) console.error(`planted: ${line}`);
    process.exit(1);
  }
  console.log(`planted: ${planted.length} type(s) refuse every impulse `
    + `(${planted.map((t) => `${t.id} r${t.r} hp${t.hp}`).join(', ')}), at applyDamage's `
    + 'impulse and resolvePair\'s share, while still walking at their own speed');
}

const plated = ENEMY_TYPES.filter((t) => t.plated);
if (plated.length) {
  const F = CFG.flint;
  const bad = [];
  if (!(F.front > 0 && F.front < 1)) {
    bad.push(`front ${F.front} must be inside (0, 1): 0 is ordinary armour and 1 is a plate `
      + 'nothing can hit');
  }
  if (!(F.turn > 0)) bad.push(`turn ${F.turn} must be positive, or the face never tracks`);
  for (const t of plated) {
    if (!(t.armor > 0)) bad.push(`${t.id} is plated and carries no armor, so the plate does nothing`);
  }
  if (plated.length > 1) {
    bad.push(`${plated.length} types are plated (${plated.map((t) => t.id).join(', ')}) and `
      + '`front`/`turn` live in CFG.flint, so all but the first would inherit FLINT\'s arc and '
      + 'slew in silence. Move both onto the type before adding another.');
  }
  if (bad.length) {
    for (const line of bad) console.error(`plate: ${line}`);
    process.exit(1);
  }
  const deg = (Math.acos(F.front) * 180) / Math.PI;
  console.log(`plate: ${plated.length} type(s) carry armour on one face (`
    + `${plated.map((t) => `${t.id} ${t.armor}`).join('; ')}) across `
    + `+-${deg.toFixed(1)} degrees, slewing ${F.turn} rad/s to hold it on the barrel; `
    + 'five directionless damage sources meet no plate at all');
}


/*
 * ---- A DIVE NEEDS A CORRIDOR, AND ITS LANE HAS TO BE INSIDE IT ----------
 *
 * `diveLane` puts a diving body between two radii it does not choose: the
 * overlap `e.r + s.r`, which `resolvePair` separates at and bills
 * `impactDamage` across, and `CFG.shooter.grabPad` past it, where
 * `checkContact` still takes hold. The gait only works because those two are
 * in that order, and because the lane sits strictly BETWEEN them -- build
 * 317 put it on the outer wall and the payload became a coin flip on the
 * body's own heading wobble (18 grip frames at wobble 0.12 against 439 at 0).
 *
 * The lane cannot be computed here -- `diveLane` needs a live world for
 * `shooter.x` and `width` -- so what is asserted is its ARITHMETIC: the
 * offset the function uses must fall strictly inside the corridor for every
 * diving type. That is the claim this heading makes and the 317 guard did
 * not check.
 *
 * Bounded at BOTH ends, because the prose asserts an ordering and 317 checked
 * only the low one: a pad wider than the body is a berth rather than a graze,
 * and the pass stops being a pass.
 *
 * ...and the DECOY is the field's OTHER static body, standing at exactly
 * `shooter.x` with its own radius. It clears today only because
 * `decoy.r < shooter.r`; raise it past the lane and every diving body dies on
 * it above the mount, in a phase whose exit is position-only. Nothing else
 * in the repo ties those two numbers together.
 */
const divers = ENEMY_TYPES.filter((t) => t.gait === 'dive');
if (divers.length) {
  const D = CFG.shrike;
  const pad = CFG.shooter.grabPad;
  const sr = CFG.shooter.r;
  const bad = [];
  if (!(pad > 0)) bad.push(`grabPad is ${pad}: no lane grips without overlapping`);
  if (!(D.dive > D.climb)) bad.push(`dive ${D.dive} is not faster than the climb ${D.climb}`);
  if (!(D.hold > 0) || !(D.dwell > 0)) bad.push(`hold/dwell must be positive, got ${D.hold}/${D.dwell}`);
  for (const t of divers) {
    const lane = t.r + sr + pad / 2;
    if (!(lane > t.r + sr && lane < t.r + sr + pad)) {
      bad.push(`${t.id}'s lane ${lane} is not strictly inside its corridor `
        + `(${t.r + sr}, ${t.r + sr + pad})`);
    }
    if (!(pad < t.r)) bad.push(`grabPad ${pad} is not narrower than ${t.id}'s own radius ${t.r}`);
    // the climb has to leave the band it dived through, by a body at least
    if (!(D.swing > t.r)) bad.push(`${t.id} climbs ${D.swing} out, inside its own radius ${t.r}`);
    if (!(CFG.decoy.r < sr + pad / 2)) {
      bad.push(`a DECOY of radius ${CFG.decoy.r} reaches ${t.id}'s lane `
        + `(clear only while under ${sr + pad / 2})`);
    }
  }
  if (bad.length) {
    for (const line of bad) console.error(`dive: ${line}`);
    process.exit(1);
  }
  console.log(`dive: ${divers.length} type(s) run a lane (`
    + `${divers.map((t) => `${t.id} r${t.r} at ${t.r + sr + pad / 2} of a corridor `
      + `${t.r + sr}-${t.r + sr + pad}`).join('; ')}), `
    + `${D.dive} down against ${D.climb} back up (x${(D.dive / D.climb).toFixed(1)}), `
    + `swinging ${D.swing} clear to climb; a DECOY reaches ${CFG.decoy.r} of ${sr + pad / 2}`);
}


/*
 * ---- A HOP HAS TO BE A HOP, AND ITS LANDING HAS TO CLEAR THE MOUNT ------
 *
 * Five things about `CFG.chaff` are load-bearing and every one of them fails
 * silently, which is why they are here rather than in a comment.
 *
 * THE SLANT. Measured before a line of the object was written: 100 rounds an
 * arm, three trials, against a march control moving at the hop's own mean
 * speed. With the hop straight DOWN the field the miss share is 0.000 at 200,
 * 300 and 450 units -- identical to the control -- because a quantised body's
 * lead error then lies ALONG the line of fire and `resolveSegment` sweeps the
 * round's whole step. Only the LATERAL component costs the gun anything: at a
 * lateral-to-drop slant of 0.6 the miss share is 0.107 at 300 and 0.620 at
 * 450, at 1.2 it is 0.240 and 0.797, at 2.0 it is 0.263 and 0.770 and
 * saturated. So a hop that is not mostly sideways is a body the gun does not
 * notice, which is not this object at all.
 *
 * THE DURATION. `CFG.fixedStep` is 1/120 and `steer` runs once per substep,
 * so `leapT` has to be at least one substep and land on a whole number of
 * them: `hopFor` counts substeps as an INTEGER, because as a float countdown
 * `0.05 - 6 * (1/120)` is 6.9e-18 rather than zero and every leap came out
 * exactly 7/6 too far. A `leapT` that is not a multiple of the substep is an
 * authored duration the gait cannot deliver.
 *
 * THE REST. The cadence is `drop / cruise` seconds of which `leapT` is the
 * leap, so `drop / speed` has to EXCEED `leapT` or the body never sits still
 * -- and sitting still is the half of the gait the copies come from.
 *
 * THE LANDING. This is build 317's SHRIKE finding on a different gait: the
 * turret is static, so `impactDamage`'s reduced mass against it is the body's
 * WHOLE mass clamped at 300, which kills anything under that at any relative
 * speed over the threshold. Measured, a chaff put on the mount at the burst
 * speed dies in ONE frame while the same body at its own 70 lives on 64
 * health. A leap is refused within `walk` of the machine and `walk` carries a
 * whole leap's reach, so the nearest possible landing is
 * `r + shooter.r + grabPad + walkPad` -- which has to be strictly outside the
 * overlap `r + shooter.r`, i.e. `grabPad + walkPad > 0`. Nothing else in the
 * repo ties the shooter's grab pad to this gait.
 *
 * THE COPY'S LIFE. `ghost` has to outlast the gap between leaps or the object
 * loses its own sentence -- "a copy of itself standing where it was" is a
 * thing there has to be one of when you look.
 */
const hoppers = ENEMY_TYPES.filter((t) => t.gait === 'hop');
if (hoppers.length) {
  const H = CFG.chaff;
  const sr = CFG.shooter.r;
  const pad = CFG.shooter.grabPad;
  const subs = H.leapT / CFG.fixedStep;
  const bad = [];
  if (!(H.leap > 0) || !(H.drop > 0)) {
    bad.push(`leap/drop must both be positive, got ${H.leap}/${H.drop}`);
  } else if (!(H.leap / H.drop >= 1)) {
    bad.push(`a slant of ${(H.leap / H.drop).toFixed(2)} is mostly radial, and a radial `
      + `hop costs the gun nothing (measured 0.000 miss share at 200, 300 and 450)`);
  }
  if (!(subs >= 1)) bad.push(`leapT ${H.leapT} is under one substep of ${CFG.fixedStep}`);
  if (Math.abs(subs - Math.round(subs)) > 1e-9) {
    bad.push(`leapT ${H.leapT} is ${subs.toFixed(3)} substeps, not a whole number of them`);
  }
  if (!(H.ghost > 0)) bad.push(`a copy's life is ${H.ghost}`);
  if (!(pad + H.walkPad > 0)) {
    bad.push(`grabPad ${pad} + walkPad ${H.walkPad} is ${pad + H.walkPad}: the nearest `
      + `landing is inside the overlap, and a landing on the mount is fatal`);
  }
  for (const t of hoppers) {
    const rest = t.speed > 0 ? H.drop / t.speed - H.leapT : -1;
    if (!(rest > 0)) {
      bad.push(`${t.id} at speed ${t.speed} never sits still: drop/speed is `
        + `${(H.drop / t.speed).toFixed(3)}s against a leap of ${H.leapT}`);
    } else if (!(H.ghost > rest + H.leapT)) {
      bad.push(`${t.id}'s copy lives ${H.ghost}s against a cadence of `
        + `${(rest + H.leapT).toFixed(3)}s, so there is nothing standing between leaps`);
    }
    if (t.harmless) bad.push(`${t.id} is harmless, so the budget prices it at nothing`);
  }
  if (bad.length) {
    for (const line of bad) console.error(`hop: ${line}`);
    process.exit(1);
  }
  const span = Math.hypot(H.leap, H.drop);
  console.log(`hop: ${hoppers.length} type(s) cross ${H.leap} across by ${H.drop} down `
    + `(slant ${(H.leap / H.drop).toFixed(2)}, span ${span.toFixed(1)}) over `
    + `${Math.round(subs)} substeps, leaving a copy for ${H.ghost}s against a cadence of `
    + `${hoppers.map((t) => `${t.id} ${(H.drop / t.speed).toFixed(2)}s`).join(', ')}; `
    + `nearest landing ${(pad + H.walkPad).toFixed(0)} clear of the mount`);
}


/*
 * ---- A BODY THAT COMES BACK HAS TO COME BACK ONCE, LATER, AND WEAKER ----
 *
 * `respawnOf` throws for a malformed block -- the fourth mandatory-field rule
 * after `levels` (224), `band` (303) and `beads`/`climb`/`rides` -- and it is
 * called here so a bad table fails the BUILD rather than the first death,
 * because a throw inside `destroy` is a throw in the rAF loop and build 288
 * records that reading as a freeze rather than an error.
 *
 * Three things beyond the shape, each of which fails silently:
 *
 * THE WAVE HAS TO OUTLAST THE RETURN. `Director.standing` counts a pending
 * return, so a wave cannot end while one is outstanding -- and `patience` is
 * what stops that being a stall. A `back` at or over `patience` would make a
 * remnant killed late in a wave guarantee that wave times out, every time.
 *
 * IT HAS TO COME BACK WEAKER. `respawn.hp` under 1 is checked in `respawnOf`;
 * what is checked here is the pair -- the health it returns with, times the
 * speed it gains, has to be under what it had, or the first kill is a favour.
 *
 * AND `threatOf` HAS TO SEE IT. The health a player shoots is `hp * (1 + the
 * share it returns with)`, so a band that priced the nominal figure is
 * underpaying for every wave that carries one. Asserted as the relation
 * rather than as the number, so a tuning pass cannot quietly break it.
 */
const comers = ENEMY_TYPES.filter((t) => t.respawn);
if (comers.length) {
  const bad = [];
  for (const t of comers) {
    let rs;
    try { rs = respawnOf(t); } catch (e) { bad.push(e.message); continue; }
    if (!(rs.back < CFG.waves.patience)) {
      bad.push(`${t.id} comes back after ${rs.back}s against a wave's patience of `
        + `${CFG.waves.patience}s: a body killed late in a wave would time that wave out`);
    }
    if (!(rs.hp * rs.quick < 1)) {
      bad.push(`${t.id} comes back at ${rs.hp} health and ${rs.quick}x speed, a product of `
        + `${(rs.hp * rs.quick).toFixed(2)} -- at or over 1 the first kill is a favour`);
    }
    const want = (t.hp * (1 + rs.hp)) / CFG.waves.threatPerHp;
    const got = threatOf(t);
    if (Math.abs(got - want) > 1e-9) {
      bad.push(`${t.id} weighs ${got.toFixed(3)} where the health a player shoots is `
        + `${t.hp} + ${t.hp * rs.hp} = ${want.toFixed(3)}: threatOf is not counting the return`);
    }
  }
  if (bad.length) {
    for (const line of bad) console.error(`respawn: ${line}`);
    process.exit(1);
  }
  console.log(`respawn: ${comers.length} type(s) come back once (`
    + `${comers.map((t) => {
      const rs = respawnOf(t);
      return `${t.id} after ${rs.back}s at ${rs.hp} health and ${rs.quick}x speed, `
        + `weighing ${threatOf(t).toFixed(2)} against a nominal `
        + `${(t.hp / CFG.waves.threatPerHp).toFixed(2)}`;
    }).join('; ')}), inside a patience of ${CFG.waves.patience}s`);
}


/*
 * ---- A PAIR CARRIES ITS OWN NUMBERS, AND THE LINK HAS TO CLEAR THE PAIR
 * SOLVER ------------------------------------------------------------------
 *
 * `pairOf` throws for a `pair` that is not exactly 2 and for a malformed
 * `bond` block -- the fourth mandatory-field rule after `levels` (224),
 * `band` (303) and `beads`/`climb`, and for the same measured reason: a
 * defaulted value indistinguishable from a chosen one is the shape this repo
 * keeps paying for. Those five numbers were `CFG.yoke` until build 332, read
 * by name in four places, so LOOM would have worn YOKE's beam length,
 * rotation, grip, pool share and survivor speed without declaring one of
 * them. Called here so a bad table fails the BUILD rather than the first
 * release, because a throw inside `release` is a throw in the rAF loop and
 * build 288 records that reading as a freeze.
 *
 * A THREAD is checked against the bodies it hangs off, not against a number
 * of its own: `threadSpan` insets each end by that body's radius so the
 * spools stay shootable ("either end drops it" is the counter), which makes
 * the blocking span `len - 2r` -- and a `stops` radius at or past that inset
 * is a thread that has swallowed its own ends. Both the release length and
 * the full span are checked, because the object grows.
 *
 * It also refuses a beam shorter than two radii, which is the pair solver's
 * floor: `resolvePair` corrects any overlap and exempts nothing, so a beam
 * inside `2r + slop` is two halves grinding against a constraint that is
 * holding them together -- the chain's measured fault, on an axis the rigid
 * tether cannot give ground on.
 */
/*
 * ---- ONE PREDICATE DECIDES WHAT MAY ARRIVE AS A SHAPE ------------------
 *
 * Three sites ask that question -- `Director.load` (group the entry into one
 * job of n, or split it into n singles), `Director.emit` (send this job as a
 * formation) and `spawnFormation` (roll a type out of a list) -- and until
 * build 333 they answered `!solo`, `!tows && !pair` and `!tows && !solo`.
 * The disagreement cost 97-99% of the TOW and pair bodies in nine band-5
 * waves, because `emit` shifts the whole job off the list and a refused
 * formation released exactly one.
 *
 * So the guard is not on a value, it is on the three sites still reading the
 * same function. A fourth multiplicity field arriving in `release` is then
 * one edit to `formable` rather than three that can be made two at a time.
 */
const formSites = [
  ['Director.load groups', /if \(!wave\.teach && (.*?) && n >= W\.formAt\)/],
  ['Director.emit forms up', /if \(job\.n > 1 && (.*?)\) \{/],
  ['spawnFormation rolls', /const single = kinds\.filter\(\(k\) => (.*?)\);/],
];
const formBad = [];
for (const [what, re] of formSites) {
  const m = gaitSrc.match(re);
  if (!m) formBad.push(`${what}: the site could not be found -- this guard has rotted`);
  else if (!m[1].includes('formable(')) {
    formBad.push(`${what} tests \`${m[1].trim()}\` instead of calling formable()`);
  }
}
if (formBad.length) {
  for (const line of formBad) console.error(`formable: ${line}`);
  process.exit(1);
}
const unformable = ENEMY_TYPES.filter((t) => !formable(t)).map((t) => t.id);
// `WAVES` is bound further down this file; CFGMOD is the copy already in
// scope here, which is the same module object.
const formWaves = CFGMOD.WAVES.filter((q) => !q.teach && (q.of || []).length);
const carriers = formWaves.filter((q) => (q.of || []).some(([id]) => !formable(TYPE_BY_ID[id])));
console.log(`formable: ${formSites.length} sites read one predicate; `
  + `${unformable.length} type(s) cannot arrive as a shape (${unformable.join(' ') || 'none'}), `
  + `carried by ${carriers.length} of ${formWaves.length} ordinary waves`);

const pairs = ENEMY_TYPES.filter((t) => t.pair).map((t) => ({ id: t.id, r: t.r, ...pairOf(t) }));
const tightBeam = pairs
  .filter((y) => y.len <= y.r * 2 + CFG.physics.slop)
  .map((y) => `${y.id}'s beam of ${y.len} is inside the pair solver's floor of `
    + `${(y.r * 2 + CFG.physics.slop).toFixed(1)}`);
if (tightBeam.length) {
  for (const line of tightBeam) console.error(`pair: ${line}`);
  process.exit(1);
}
/*
 * The one claim about a thread that `pairOf` does not already make.
 *
 * This had three clauses and TWO of them could not fail: `pairOf` throws
 * unless `bond.len > 2r`, which is exactly "the insets leave a thread", and
 * unless `bond.span > bond.len`, which is exactly "growing widens it" -- and
 * `pairs` above is built by calling `pairOf`, so a type that broke either
 * one never reaches this loop. A clause that is counted and cannot fail is
 * worse than a missing one (build 319), so they are gone and the reason is
 * here rather than in a diff.
 *
 * What is left is arithmetic nobody else does: the thread is drawn and
 * blocked at `stops` either side of the axis, and it has to FIT between the
 * two insets on the frame the pair is released -- at `bond.len`, which is
 * the narrowest the link ever is.
 */
const badThread = [];
for (const y of pairs.filter((q) => q.stops)) {
  const span = y.len - y.r * 2;
  if (!(y.stops * 2 < span)) {
    badThread.push(`${y.id}: a thread ${(y.stops * 2).toFixed(1)} thick does not fit the `
      + `${span.toFixed(1)} units its own insets leave at release`);
  }
}
if (badThread.length) {
  for (const line of badThread) console.error(`pair: ${line}`);
  process.exit(1);
}
/*
 * ---- ...AND WHAT `span` DECIDES BESIDES THE WIDTH ----------------------
 *
 * `span` is authored as "what the link grows to" and does a second job
 * nobody wrote down: both halves steer at the mount and the link is rigid,
 * so a pair that survives its transit parks STRADDLING the machine at a
 * standoff of `span / 2`. Measured over ninety seconds with nothing
 * shooting, a LOOM at full span closes to 71.2 and 84.9 against a grab
 * distance of 48 and settles at 99 / 91 -- **zero grip frames, and
 * `world.attackers` empty** -- while a YOKE, whose half-link is 30 against
 * a grab of 54, grips on arrival and holds for 4,142 of 5,400 frames.
 *
 * Both are correct: a LOOM is a wall that costs rounds and its wave pairs
 * it with a LURCHER, which is the half that grips. What was wrong is the
 * SILENCE -- build 329's lesson about the broadphase cell, one field along.
 * So the figure is printed beside the link, and a `span` edit that hands
 * this object a contact behaviour shows up in the same line that authored
 * it. It is deliberately not a refusal: which side of the grab band a pair
 * should sit on is a design decision and both answers are in play.
 */
const standoff = pairs.map((y) => {
  const reach = y.r + CFG.shooter.r + CFG.shooter.grabPad;
  const off = (y.span || y.len) / 2;
  return `${y.id} parks at ${off.toFixed(0)} against a grab of ${reach.toFixed(0)}`
    + ` (${off > reach ? 'never grips' : 'grips'})`;
});
console.log(`pair: ${standoff.join('; ') || 'none'}`);
console.log(`pair: ${pairs.length} type(s) on a rigid link (`
  + `${pairs.map((y) => `${y.id} 2x r${y.r} at ${y.len} (${(y.len / y.r).toFixed(2)}r), `
    + (y.pool ? `ONE pool, snap ${y.snap}` : 'two pools')
    + (y.span ? `, out to ${y.span} over ${y.grow}s` : '')
    + (y.stops ? `, a thread ${y.stops * 2} thick blocking ${(y.len - y.r * 2).toFixed(0)}`
      + `-${(y.span - y.r * 2).toFixed(0)} units` : '')
    + `, survivor x${y.alone}`).join('; ') || 'none'})`);


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
/*
 * ---- MORTAR is not part of the combination (build 307) ------------------
 *
 * A harmless entry in `of` is scenery laid alongside the wave: it weighs
 * nothing in the budget, does not swell with it, is skipped by `standing`,
 * refused by `tagBody` and invisible to `hostileCount`. So neither of the two
 * rules below is about it -- the two-or-three rule is about the PROBLEM being
 * a combination, and the body ceiling is about that combination not becoming
 * a crowd. Drift was already outside both, by living in `wave.drift` rather
 * than in `of` at all; EMBER and HUSK are in `of` because a wave names what
 * arrives on it, so the exemption has to be said rather than arranged.
 *
 * What bounds mortar instead is `mortarCap`, asserted below: exempt from
 * three ceilings is not the same as unbounded.
 */
const hostilesOf = (w) => w.of.filter(([id]) => !TYPE_BY_ID[id].harmless);
const mortarOf = (w) => w.of.filter(([id]) => TYPE_BY_ID[id].harmless);
const soloWaves = regular.filter((w) => hostilesOf(w).length < 2 || hostilesOf(w).length > 3);
if (soloWaves.length) {
  console.error(`${soloWaves.length} regular wave(s) do not name two or three hostile types: `
    + soloWaves.map((w) => JSON.stringify(w.of)).join(' '));
  process.exit(1);
}
/*
 * ...counted in BODIES and not in entries, because one authored entry is not
 * one body. `type.beads` is the multiplicity `release()` dispatches on -- the
 * same shape `tows` already has, which `bodiesOf` below has always doubled for
 * -- so a FILAMENT written `['filament', 1]` is SEVEN harmless bodies against
 * the cap. Authored entries would have under-counted it sevenfold, and mortar
 * is the one thing on the field that nothing else bounds: `hostileCount`
 * cannot see it, so `maxEnemies` has nothing to say about it either.
 */
const MORTAR_CAP = CFG.waves.mortarCap;
/*
 * True bodies per authored entry, off the same four fields `release`
 * dispatches on -- and `pair` IS the count, the way `school` and `beads` are,
 * so only `tows` needs its 2 written out. The mortar cap counts THESE, because nothing else bounds
 * mortar at all -- `hostileCount` cannot see it, so `maxEnemies` has nothing
 * to say about it either.
 */
const bodiesPer = (t) => t.school || t.beads || t.pair || (t.tows ? 2 : 1);
const mortarBodies = (w) => mortarOf(w).reduce((n, [id, c]) => n + c * bodiesPer(TYPE_BY_ID[id]), 0);
const overMortar = regular
  .map((w) => [w.of, mortarBodies(w)])
  .filter(([, n]) => n > MORTAR_CAP);
if (overMortar.length) {
  console.error(`${overMortar.length} wave(s) author more than ${MORTAR_CAP} harmless bodies, `
    + 'which nothing else bounds: ' + overMortar.map(([of, n]) => `${JSON.stringify(of)}=${n}`).join(' '));
  process.exit(1);
}
const mortarWaves = regular.filter((w) => mortarOf(w).length);
console.log(`mortar: ${mortarWaves.length} wave(s) carry harmless bodies, at most `
  + `${Math.max(0, ...regular.map(mortarBodies))} BODIES `
  + `of a cap of ${MORTAR_CAP}, and none of them counts toward the combination`);
/*
 * Bodies per wave as released, which is the authored count times the flat
 * population multiplier -- the swell is on top of both and is meant to be.
 * A TOW counts two, because it is two.
 *
 * ---- ...and A SCHOOL COUNTS ONE, which is a RULING and not an oversight --
 *
 * This ceiling is "a combination must not become a crowd", and it was written
 * when every hostile entry was independent bodies. A SHOAL is fourteen bodies
 * and ONE problem: there is no leader to take out and no answer that is about
 * any single one of them, which is the entire object. Counted as fourteen,
 * band 1's school wave is 22 against a ceiling of 11 and the honest choices
 * would be to double the allowance for every wave in the game or to ship a
 * school of six, which is not the object.
 *
 * ---- ...AND SO DOES A PAIR, for a stronger version of the same reason ---
 *
 * A YOKE is two bodies of ONE pool, and the school's fourteen have fourteen
 * pools. There is no state in which a pair is two simultaneous problems: it
 * arrives as one object, damage anywhere drains the same number, and the
 * counter is about reaching BOTH. The snap does not make it two either --
 * the half that comes off is gone, so what is left is one survivor, which
 * is one problem again. Counted as two, band 5's wave is 17 against a
 * ceiling of 11 and the choice would be three pairs, which is not the
 * object.
 *
 * So the ceiling counts PROBLEMS, the school is bounded separately (below,
 * at one per wave, the way `mortarCap` bounds the thing three ceilings are
 * blind to), and what bounds the bodies is `maxEnemies` -- which build 300
 * deliberately made the thing that holds the crowd down. Note this guard
 * ALREADY PASSED before the ruling was written, because `school` was a field
 * it did not read: a guard that passes for a reason nobody chose is the
 * `undefined > eraGate` shape, and the number is printed now.
 */
const WAVE_BODIES = 11;
const problemsPer = (t) => (t.school || t.pair ? 1 : bodiesPer(t));
const swelled = (c) => Math.max(1, Math.round(c * CFG.waves.population));
const bodiesOf = (w) => Math.round(hostilesOf(w)
  .reduce((n, [id, c]) => n + swelled(c) * problemsPer(TYPE_BY_ID[id]), 0));
const realBodiesOf = (w) => Math.round(hostilesOf(w)
  .reduce((n, [id, c]) => n + swelled(c) * bodiesPer(TYPE_BY_ID[id]), 0));
const crowded = regular.map((w) => [w.of, bodiesOf(w)]).filter(([, n]) => n > WAVE_BODIES);
if (crowded.length) {
  console.error(`${crowded.length} wave(s) over ${WAVE_BODIES} hostile bodies at population `
    + `${CFG.waves.population}: ` + crowded.map(([of, n]) => `${JSON.stringify(of)}=${n}`).join(' '));
  process.exit(1);
}
/*
 * ...and the school's own bound, since the ceiling above lets it through as
 * one. One school to a wave: two would be twenty-eight bodies arriving as two
 * groups with nothing to tell them apart, which is a crowd by any reading.
 * The BUDGET is what decides how many arrive at a deep rung, and the field
 * cap is what holds that down.
 */
const schoolsOf = (w) => w.of.filter(([id]) => TYPE_BY_ID[id].school)
  .reduce((n, [, c]) => n + c, 0);
const overSchool = regular.map((w) => [w.of, schoolsOf(w)]).filter(([, n]) => n > 1);
if (overSchool.length) {
  console.error(`${overSchool.length} wave(s) author more than one school: `
    + overSchool.map(([of, n]) => `${JSON.stringify(of)}=${n}`).join(' '));
  process.exit(1);
}
const schoolWaves = regular.filter((w) => schoolsOf(w));
console.log(`schools: ${schoolWaves.length} wave(s) carry one, at `
  + `${ENEMY_TYPES.filter((t) => t.school).map((t) => `${t.id} ${t.school}`).join(', ') || 'none'} `
  + `bodies each -- counted as ONE problem against the ${WAVE_BODIES}-body ceiling and as `
  + `${Math.max(0, ...schoolWaves.map(realBodiesOf))} real bodies, which maxEnemies bounds`);
const pairWaves = regular.filter((w) => w.of.some(([id]) => TYPE_BY_ID[id].pair));
console.log(`pairs: ${pairWaves.length} wave(s) carry them -- counted as ONE problem each against `
  + `the ${WAVE_BODIES}-body ceiling (worst ${Math.max(0, ...pairWaves.map(bodiesOf))}) and as `
  + `${Math.max(0, ...pairWaves.map(realBodiesOf))} real bodies, which maxEnemies bounds`);
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
const { Director, threatOfWave } = await import(new URL('../src/enemies.js', import.meta.url));
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
  // Hostiles only, and for the same reason `load` scales only those: mortar
  // pays nothing into the budget and cannot take the budget's multiplier.
  return hostilesOf(w).reduce((n, [, c]) => n + Math.max(1, Math.round(c * scale)), 0);
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
