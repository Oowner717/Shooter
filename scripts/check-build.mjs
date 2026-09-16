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
const { ENEMY_TYPES, CFG, TYPE_BY_ID, GAITS, ROUTES } = await import(new URL('../src/config.js', import.meta.url));
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
/*
 * ---- and the FIELD IS MANDATORY from build 338 --------------------------
 *
 * `gait` was optional and 43 of the 61 types declared nothing, with the
 * absence MEANING march -- so a type nobody had thought about and a type
 * deliberately chosen to march were the same text. That is `u.levels ?? 3`
 * (eight nodes sold three times), an omitted `band` (9 kB against 4 MB), and
 * the `plated`/`rides`/`respawn`/`planted`/`bar` shared blocks, all over
 * again. `gaitOf` is the thrower and this is where it is called, at BUILD
 * time: a throw from inside the rAF loop is build 288's freeze rather than an
 * error anybody reads.
 *
 * It holds the `fixed` partition in BOTH directions -- a fixed type must
 * declare nothing, because `drive` returns for one on its first statement and
 * a gait would be a second source of truth for `fixed` -- so a nineteenth
 * fixed type is covered by existing and so is a type that stops being fixed.
 */
const { gaitOf } = await import(new URL('../src/enemies.js', import.meta.url));
const gaitSrc = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const gaitWords = Object.keys(GAITS);
const badGait = [];
for (const t of ENEMY_TYPES) {
  try { gaitOf(t); } catch (e) { badGait.push(e.message); }
}
/*
 * ---- the reader test wants a DISPATCH ARM, not the string anywhere ------
 *
 * It was `new RegExp(\`'${g}'\`).test(gaitSrc)` over the whole file, and that
 * is two holes rather than one:
 *
 *   A word named only in a COMMENT satisfied it, which is the opposite of what
 *   the test is for -- the thing being guarded against is a word with a
 *   description and no implementation, and a description is a comment. Latent
 *   rather than live: measured on the tree this went in on, all fourteen
 *   existing words had a genuine code reader.
 *
 *   And a word named in a MEMBERSHIP SET satisfied it too. `OWN_SPAWN`,
 *   `OWN_SPEED` and `FACES_TRAVEL` are not steering arms, and `'dive'` has
 *   seven code occurrences of which four are the unrelated `divePhase`
 *   machinery. Proved by revert: replacing `dive`'s ONE real arm
 *   (`gait === 'dive'`) and `flock`'s with `else if (false)` left the old
 *   predicate reporting nothing muted in both cases -- the guard could not see
 *   a gait whose entire implementation had been deleted.
 *
 * So the pattern is narrowed rather than the corpus widened: a word has to
 * appear as `gait === 'x'` or as `case 'x':`, which are the only two forms
 * `drive` and the constructor dispatch in. Measured against this tree, that is
 * exactly one arm for each of the fourteen and zero for march.
 *
 * MARCH IS EXEMPT, and the reason is the test's own argument: the test exists
 * because a type naming a gait nothing implements gets the march it was trying
 * not to take, and a type naming MARCH and getting the march is correct. There
 * is no site that needs to name it -- `'march'` appears zero times in
 * enemies.js, comments included -- and adding one to satisfy a grep would be
 * exactly the dead field this hunts. What holds march instead is the mandatory
 * rule above, which is the stronger guard.
 *
 * The exemption is SELF-POLICING, because a hand-kept exemption list is how
 * `world.apertures` came to be sized 8 against 9 anomalies: an exempt word
 * that turns out to HAVE a dispatch arm fails the build, so the list cannot
 * quietly outlive its reason and each addition stays a deliberate edit with a
 * reason written beside it.
 *
 * ---- AND THE FORECAST THAT USED TO BE HERE WAS TWO-THIRDS WRONG ----------
 *
 * It read: "Phase 2's `lurch`, `drag` and `wander` are all fall-throughs or
 * on-top modifiers and will want the same exemption; if that list reaches
 * three or four, mark the fall-through words in GAITS itself." Both words that
 * landed came in with a REAL dispatch arm instead -- `lurch` at
 * `gait === 'lurch'` (build 338) and `drag` at `gait === 'drag' &&
 * this.tether` (339) -- so `NO_ARM` is still `['march']` and the advice was
 * never taken. A prediction left in the present tense reads as guidance, and
 * following it here would have been the mechanism by which a word slipped the
 * one guard that can see a missing implementation.
 *
 * Worth knowing about the OTHER way past this test, measured rather than
 * reasoned: `case 'wander':` added beside the existing `case 'hover':` on the
 * harmless switch's shared `default:` arm satisfies `dispatches` while
 * implementing nothing new. The pattern can see an ABSENT arm; it cannot see
 * an arm that does nothing, and nothing static can. What refused `wander` is
 * the argument at its GAITS entry, not this guard.
 */
const gaitCode = gaitSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const NO_ARM = ['march'];
const dispatches = (g) => new RegExp(`gait === '${g}'|case '${g}':`).test(gaitCode);
const mute = gaitWords.filter((g) => !NO_ARM.includes(g) && !dispatches(g))
  .map((g) => `GAITS.${g} has no dispatch arm in src/enemies.js -- `
    + `no \`gait === '${g}'\` and no \`case '${g}':\`, so a type naming it gets `
    + 'the march it was trying not to take');
const staleExempt = NO_ARM.filter((g) => dispatches(g))
  .map((g) => `GAITS.${g} is in check-build's NO_ARM exemption and now HAS a `
    + 'dispatch arm -- take it out of the list so the guard covers it again');
mute.push(...staleExempt);
const notAWord = NO_ARM.filter((g) => !gaitWords.includes(g))
  .map((g) => `check-build's NO_ARM names '${g}', which is not in GAITS`);
mute.push(...notAWord);
if (badGait.length || mute.length) {
  for (const line of [...badGait, ...mute]) console.error(`gaits: ${line}`);
  process.exit(1);
}
/*
 * ---- and a HARMLESS type may not declare a word the harmless branch eats -
 *
 * `drive`'s early returns are ORDERED, and a harmless body reaches its own
 * switch before the route branch is ever considered. That switch handles
 * `rise`, `tumble`, `chain` and `hover`, and its `default:` arm is
 * `wander` -- so a harmless type declaring any OTHER word silently gets the
 * hover band, with both gait guards above passing and nothing to read back.
 * That is the `shape`-with-no-case fault: five shapes fell through to
 * `drawChip` for fourteen builds.
 *
 * It matters specifically because build 338 made `march` a legal word. Before
 * that, a harmless type could only reach the default arm by naming a
 * replacer, which is visibly wrong at the site; `gait: 'march'` on a harmless
 * body looks like the most ordinary declaration in the file and is the one
 * value that cannot possibly be true of it.
 *
 * The legal set is DERIVED from the branch order rather than chosen: the two
 * branches ABOVE the harmless one also return, so `ride` (a rider goes for
 * its host -- SEED is harmless and rides) and `hop` reach their own code
 * first. `hop` is admitted and flagged rather than refused: `hopOn` hands the
 * body back for the last stretch, at which point a harmless hopper WOULD fall
 * to the hover band, so it is half-honoured -- legal, and worth knowing about
 * before something declares it.
 */
/*
 * DERIVED from `drive`'s own source, not restated. The legal set is the
 * `case 'x':` labels inside the harmless switch, plus the words whose branch
 * sits ABOVE that switch and returns -- which is exactly the two gait tests
 * appearing before `if (this.harmless` in `drive`. So a seventh case added to
 * the switch, or a branch moved above or below the harmless one, is covered by
 * existing.
 *
 * It was a hand-written list of six for one afternoon and the review caught
 * it: written out in check-build AND twice in one object literal in
 * regress.mjs, the message printing one copy while the assertion ran against
 * the other. That is `HERO_GAITS`/`HERO_COL` in docs/objects.html, which the
 * same build fixed for the identical reason -- two parallel copies read at the
 * same index, one of them edited. Ask the structure, never restate it.
 */
const driveSrc = gaitCode.slice(gaitCode.indexOf('drive(world, dt) {'));
const harmlessAt = driveSrc.indexOf('if (this.harmless');
if (harmlessAt < 0) throw new Error('check-build: cannot find drive\'s harmless branch');
const switchAt = driveSrc.indexOf('switch (this.type.gait)', harmlessAt);
if (switchAt < 0) throw new Error('check-build: cannot find the harmless gait switch');
const preHarmless = driveSrc.slice(0, harmlessAt);
const above = [...preHarmless.matchAll(/gait === '([a-z]+)'/g)].map((m) => m[1]);
/*
 * ...and a branch keyed on a CAPABILITY field has to be traced back to the
 * line that derives it, or the set comes out short. `drive`'s rider branch
 * tests `this.rides`, which the constructor sets from `type.gait === 'ride'`
 * -- so the word is legal for a harmless body (SEED is harmless and rides)
 * and a slice of `drive` alone cannot see it. Measured: without this the set
 * derived as [rise tumble chain hover hop] and the guard failed the build on
 * SEED. One pattern, `this.X = type.gait === 'y'`, and it is checked against
 * the branches `drive` actually takes rather than assumed.
 */
for (const m of gaitCode.matchAll(/this\.([a-zA-Z]+) = type\.gait === '([a-z]+)'/g)) {
  if (new RegExp(`this\\.${m[1]}\\b`).test(preHarmless)) above.push(m[2]);
}
const inSwitch = [...driveSrc.slice(switchAt, driveSrc.indexOf('\n    }', switchAt))
  .matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
const HARMLESS_OK = [...new Set([...inSwitch, ...above])];
if (HARMLESS_OK.length < 4) {
  throw new Error(`check-build: the harmless legal set derived as [${HARMLESS_OK.join(' ')}], `
    + 'which is too few -- the slice found nothing and the guard would be vacuous');
}
const gentle = ENEMY_TYPES.filter((t) => t.harmless && !t.fixed);
const eaten = gentle.filter((t) => !HARMLESS_OK.includes(t.gait))
  .map((t) => `${t.id} is harmless and declares '${t.gait}', which `
    + "drive's harmless switch swallows -- it would get the hover band. "
    + `A harmless type may only declare [${HARMLESS_OK.join(' ')}]`);
if (eaten.length) {
  for (const line of eaten) console.error(`gaits: ${line}`);
  process.exit(1);
}

const marchers = ENEMY_TYPES.filter((t) => t.gait === 'march').length;
const held = ENEMY_TYPES.filter((t) => t.fixed).length;
console.log(`gaits: ${gaitWords.length} in the vocabulary (${gaitWords.join(' ')}), all read; `
  + `every one of ${ENEMY_TYPES.length - held} loose types declares one (${marchers} march), `
  + `${held} fixed types declare none; ${gentle.length} harmless types stay inside `
  + `[${HARMLESS_OK.join(' ')}]`);

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
/*
 * ---- a DRAG type needs the two blocks `windUp` reads, and there is no
 *      default -------------------------------------------------------------
 *
 * Build 339 re-keyed the TOW's mechanism off `type.hurl` onto the gait, which
 * left the word and the blocks able to disagree -- and the failure is a THROW
 * on `steer`'s hot path, which build 288 records as reading like a freeze
 * rather than an error. Reproduced rather than argued: a `drag` type with no
 * `hurl` gives `TypeError: Cannot read properties of undefined (reading
 * 'range')` at `windUp`'s `const H = this.type.hurl`, and one with `hurl` but
 * no `tows` gives the same on `this.type.tows.length`.
 *
 * And it is REACHABLE without a probe: a `drag` type with no `tows` is not
 * intercepted by `release`'s `if (type.tows) return spawnTow(...)`, so it
 * falls into the TETHERED trait block, which writes `e.tether` -- and
 * `this.tether` is the second conjunct of both flag-uses. An ordinary trait
 * roll gets there.
 *
 * Held in BOTH directions, the shape the rides guard already has: a `drag`
 * type missing either block fails, and a `hurl` block on a type that does not
 * declare `drag` is a block nothing reads. Green on arrival -- only TOW
 * declares the word and it carries both.
 *
 * One more thing a second `drag` type has to know, and the guard says it:
 * `spawnTow` takes no type argument and hard-keys `const head =
 * TYPE_BY_ID.tow`, so a second one WITH a `tows` block is released as a
 * literal TOW.
 */

const draggers = ENEMY_TYPES.filter((t) => t.gait === 'drag');
const dragBad = [];
for (const t of draggers) {
  if (!t.hurl || typeof t.hurl !== 'object') {
    dragBad.push(`${t.id} declares gait 'drag' and no hurl block -- windUp reads `
      + 'this.type.hurl.range and would throw on steer\'s hot path');
  }
  if (!t.tows || typeof t.tows !== 'object') {
    dragBad.push(`${t.id} declares gait 'drag' and no tows block -- windUp reads `
      + 'this.type.tows.length, and note spawnTow hard-keys TYPE_BY_ID.tow, so a '
      + 'second dragger needs that function generalised first');
  }
}
for (const t of ENEMY_TYPES) {
  if (t.hurl && t.gait !== 'drag') {
    dragBad.push(`${t.id} carries a hurl block and its gait is '${t.gait}', not `
      + "'drag' -- nothing reads it, which is the kind:'works' fault");
  }
}
if (dragBad.length) {
  for (const line of dragBad) console.error(`drag: ${line}`);
  process.exit(1);
}
console.log(`drag: ${draggers.length} dragger (${draggers.map((t) => t.id).join(' ')}), `
  + 'each with both the hurl and tows blocks its mechanism reads');

const riders = ENEMY_TYPES.filter((t) => t.gait === 'ride');
const worstRide = Math.max(0, ...riders.map((t) => t.rides.armor));
/*
 * `!t.fixed` alone, and the `&& !t.gait` that used to be here is why: it meant
 * "an ordinary field body" when the only gait-declarers were the new objects,
 * and build 338 made the field mandatory -- at which point the filter matches
 * NOTHING, `worstBody` is 0, and the ceiling is measured against a bare body.
 * A rule whose selector stops matching reads as a rule that holds.
 *
 * It was LATENT and not live, which is worth the sentence: FLINT at 0.55 is
 * the worst loose body either way, so the term happened never to exclude the
 * maximum (ANVIL 0.30, QUARRY 0.22 and SPINDLE 0.15 were excluded and are all
 * under it). And it would have failed LOUDLY rather than silently -- with the
 * filter empty the ring is 0.60 against a cap of 0.80, so the reachability
 * arm below fires and exits 1. A ring lands on any loose body; `fixed` is the
 * only thing it cannot land on, so that is the only term the claim needs.
 */
const worstBody = Math.max(0, ...ENEMY_TYPES.filter((t) => !t.fixed).map((t) => t.armor || 0));
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

const { fractureDepth, fractureFactor, barOf, pairOf, respawnOf, lobOf, stainOf, STAIN_KEYS, routesOf, threatOf, formable } = await import(new URL('../src/enemies.js', import.meta.url));

/*
 * ---- a SERPENT type declares its own ground, and there is no default -----
 *
 * Fourth mandatory block after `rides`, `respawn` and `bond`, and it is here
 * for the reason all three of those are: a second type declaring the gait
 * would otherwise wear MIRE's radius, clock and reach in silence, with no
 * field to set and nothing to fail. A number about the GAIT is shared
 * (`CFG.serpent`, the weave) and a number about the BODY is the type's.
 *
 * Called at BUILD time, which is the whole point -- `serpentOn` reads
 * `this.type.stain` inside `drive`, and a throw from there is build 288's
 * freeze rather than an error anybody reads. Held in both directions: a
 * `stain` block on a type that does not declare `serpent` is a block nothing
 * reads.
 */
/*
 * ---- a ROUTES allow-list, and who is allowed to have one -----------------
 *
 * Phase 3. The field is OPTIONAL and absence means all six, which is
 * deliberately not build 338's ruling about `gait` -- see `routesOf` for why
 * the two cases differ (an omitted `gait` meant a behaviour the author might
 * not have chosen; an omitted `routes` means the status quo).
 *
 * What a DECLARED list owes: every id exists, non-empty, no duplicates --
 * `routesOf` throws for all three and is called here at build time, because a
 * throw from the Enemy CONSTRUCTOR is a throw on the spawn path.
 *
 * And the other direction, which is the `stain`/`hurl` shape: a type whose
 * gait REPLACES the route may not declare one, because nothing would read it.
 * The replacer set is DERIVED from `drive`'s own if/else chain rather than
 * written out -- the arms are `gait === 'x'` inside a `!this.staged` test, and
 * the route branch is the `else if (!this.staged)` at the foot -- so moving an
 * arm in or out of that chain moves this guard with it.
 */
const routeSrc = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
const driveFrom = routeSrc.indexOf('drive(world, dt) {');
const driveTo = routeSrc.indexOf('const wob = Math.sin(', driveFrom);
if (driveFrom < 0 || driveTo < 0) throw new Error('check-build: cannot find drive\'s route chain');
const chain = routeSrc.slice(driveFrom, driveTo);
/*
 * `(?:else )?if` and not `else if`: the FIRST arm of that chain is a bare
 * `if (!this.staged && this.type.gait === 'roll' ...)` and every later one is
 * an `else if`, so matching only the second form derived six replacers and
 * silently dropped `roll` -- caught by reading the guard's own readout rather
 * than trusting it, which is the only way a derivation that is too NARROW
 * shows itself. A derivation that comes back short is worse than a written-out
 * list, because it looks derived.
 */
const REPLACERS = [...new Set([...chain.matchAll(/(?:else )?if \(!this\.staged && this\.type\.gait === '([a-z]+)'/g)]
  .map((m) => m[1]))];
if (REPLACERS.length < 4) {
  throw new Error(`check-build: derived only ${REPLACERS.length} route replacers from drive `
    + `[${REPLACERS.join(' ')}] -- the slice found nothing and this guard would be vacuous`);
}
const routeBad = [];
for (const t of ENEMY_TYPES) {
  if (t.routes === undefined) continue;
  try { routesOf(t); } catch (e) { routeBad.push(e.message); continue; }
  if (REPLACERS.includes(t.gait)) {
    routeBad.push(`${t.id} declares routes and its gait '${t.gait}' REPLACES the route, `
      + 'so nothing reads them -- the kind:\'works\' fault');
  }
  if (t.fixed) routeBad.push(`${t.id} is fixed and declares routes -- it does not drive`);
}
if (routeBad.length) {
  for (const line of routeBad) console.error(`routes: ${line}`);
  process.exit(1);
}
const pinned = ENEMY_TYPES.filter((t) => t.routes);
console.log(`routes: ${ROUTES.length} march routes; ${pinned.length} types name a subset `
  + `(${pinned.map((t) => `${t.id}=${t.routes.join('/')}`).join(' ')}), the rest draw from all `
  + `${ROUTES.length}. ${REPLACERS.length} gaits replace the route and may not name any `
  + `(${REPLACERS.join(' ')})`);

/*
 * ---- EVERY DIFFERENTIAL INSTRUMENT HAS TO SAY WHICH TREE IT READ --------
 *
 * Build 344 wrote this for `fight.mjs` alone and named the other four `--url`
 * probes as sharing the exposure and lacking the check. Build 345 closes
 * that, and the reason it is ONE helper rather than five copies is the rule
 * this repo keeps paying for: five copies is a hand-kept list, and this guard
 * would then have to name five sites and go stale at the sixth.
 *
 * The fault: this container's `http-server` serves its own CWD and ignores a
 * trailing path, so pointing it at a worktree from the repo directory serves
 * the repo. The reading looks perfect and is of the wrong code -- the exact
 * shape of build 340's positional-parser fault. `served.mjs` fetches the
 * served `config.js`, prints the BUILD and REV, and `--expect NNN` refuses a
 * mismatch: the refusal is the only part that cannot be skim-read past, so it
 * is the part worth guarding. A `console.log` in a guard script is not a
 * guard (build 329), and a verification nothing asserts is one somebody
 * deletes.
 *
 * Read off the source rather than pinned to a value, the way the `formable()`
 * call sites are, so a reworded message survives and a removed fetch does
 * not. And the PROBE LIST is derived by asking the directory which files take
 * `--url` -- `world.apertures` sized 8 against 9 anomalies is what a written
 * list costs.
 */
const servedSrc = readFileSync(new URL('../scripts/served.mjs', import.meta.url), 'utf8');
const servedNeeds = [
  ['reads the served tree', /fetch\(`\$\{root\}\/src\/config\.js`\)/],
  ['parses the served BUILD', /export const BUILD = '\(\[\^'\]\*\)'/],
  ['prints which tree it read', /console\.log\(`\\nserving \$\{base\}/],
  ['warns when it cannot read one', /UNKNOWN tree/],
  ['refuses an --expect mismatch', /abort: true/],
  ['names the cwd remedy in the refusal', /cd <worktree> && http-server/],
];
const servedBad = servedNeeds.filter(([, re]) => !re.test(servedSrc)).map(([w]) => w);
if (servedBad.length) {
  console.error(`served.mjs: the served-tree verification is incomplete -- missing: `
    + `${servedBad.join('; ')}. Build 343 took three hash readings of the wrong tree `
    + `because http-server serves its CWD and ignores a trailing path; the fetch and `
    + `the --expect refusal are what make that visible.`);
  process.exit(1);
}
const probeDir = new URL('../scripts/', import.meta.url);
const urlProbes = readdirSync(probeDir)
  .filter((f) => f.endsWith('.mjs') && f !== 'served.mjs')
  .filter((f) => /flag\('url'/.test(readFileSync(new URL(f, probeDir), 'utf8')))
  .sort();
if (!urlProbes.length) {
  console.error('served.mjs: no probe takes --url, so this guard is asserting nothing -- '
    + 'the detection (a `flag(\'url\'` call) has drifted, not the exposure');
  process.exit(1);
}
const probeBad = [];
for (const f of urlProbes) {
  const s = readFileSync(new URL(f, probeDir), 'utf8');
  // Matched inside the braces rather than as a whole statement: build 346 added
  // `requireWorld` to the same import and this guard failed the build for four
  // probes that DO import checkServed, with a message saying they do not. A
  // guard pinned to an exact line reports the wrong fault the first time a
  // second name joins it.
  if (!/import \{[^}]*\bcheckServed\b[^}]*\} from '\.\/served\.mjs'/.test(s)) {
    probeBad.push(`${f} takes --url and does not import checkServed`);
  } else if (!/await checkServed\(/.test(s)) {
    probeBad.push(`${f} imports checkServed and never calls it`);
  } else if (!/if \(wrongTree\) process\.exit\(1\)/.test(s)) {
    probeBad.push(`${f} calls checkServed and does not exit on its verdict, `
      + 'so the refusal is a print');
  }
}
if (probeBad.length) {
  for (const line of probeBad) console.error(`served: ${line}`);
  console.error('served: a probe that takes --url can be pointed at a worktree, and this '
    + "container's http-server serves its own CWD -- so without the check its "
    + 'differential can read the live tree twice and report "identical either side".');
  process.exit(1);
}
console.log(`served: all ${urlProbes.length} --url probe(s) (${urlProbes.join(' ')}) read, `
  + `print and refuse on the served BUILD via served.mjs`);

/*
 * ---- AND A POSITIONAL HAS TO BE A POSITIONAL ---------------------------
 *
 * The same family as the block above -- an instrument confidently measuring
 * the wrong thing -- and this is the THIRD place the parser has been written.
 *
 * Build 340 found `fight.mjs` taking its anomaly number as
 * `argv.find((a) => /^\d+$/.test(a))`, so the documented
 * `--seed 20260824 --hash 9000` ran "ANOMALY 20260824" and every hash that
 * probe had ever printed was of a degenerate fight. It fixed the one file.
 * `dps.mjs` and `variance.mjs` carried the identical line until build 345,
 * and the fault needed no new flag to be reachable: `variance.mjs --runs 3`
 * ran anomaly 3. Adding the numeric `--expect` is what made it obvious --
 * measured, `dps.mjs --expect 345` printed `ANOMALY 345` and carried on.
 *
 * So the rule, derived rather than listed: any probe that reads a bare-number
 * positional out of its own arguments must skip a token that is a preceding
 * flag's VALUE. The `find`-the-first-number form is refused outright, because
 * it cannot do that by construction.
 */
const POSNAL = /(?:args|argv)\.find\(\(a\) => \/\^\\d\+\$\/\.test\(a\)\)/;
const POSOK = /\/\^\\d\+\$\/\.test\((?:args|argv)\[i\]\)/;
const SELF = import.meta.url.split('/').pop();
const posProbes = readdirSync(probeDir)
  // ...skipping THIS file, because the guard's own regex source contains the
  // pattern it is searching for and it matched itself on the first run. Derived
  // from `import.meta.url` rather than written out: an exemption list of one
  // is still a list, and `pgrep -f` matching its own shell is the same fault
  // in a different costume -- three times in this repo's history.
  .filter((f) => f.endsWith('.mjs') && f !== SELF)
  .map((f) => [f, readFileSync(new URL(f, probeDir), 'utf8')])
  .filter(([, s]) => POSNAL.test(s) || POSOK.test(s))
  .sort();
if (!posProbes.length) {
  console.error('positional: no probe reads a bare-number positional, so this guard is '
    + 'asserting nothing -- the detection has drifted, not the exposure');
  process.exit(1);
}
const posBad = [];
for (const [f, s] of posProbes) {
  if (POSNAL.test(s)) {
    posBad.push(`${f} takes its positional as the FIRST bare number in its arguments, `
      + "so a numeric flag's value (--expect 345, --runs 3) is read as the positional -- "
      + 'build 340\'s fault, which made every hash that probe printed a different fight');
  } else if (!/if \(i > 0 && \/\^--\/\.test\((?:args|argv)\[i - 1\]\)\) continue;/.test(s)) {
    posBad.push(`${f} reads a bare-number positional and does not skip a flag's value`);

  }
}
if (posBad.length) {
  for (const line of posBad) console.error(`positional: ${line}`);
  process.exit(1);
}
console.log(`positional: all ${posProbes.length} probe(s) with a bare-number positional `
  + `(${posProbes.map(([f]) => f).join(' ')}) skip a flag's value`);
/*
 * ---- AND THE PROBE HAS TO BE ABLE TO READ THE TREE IT WAS POINTED AT ----
 *
 * Build 346, and it is the hole `--expect` does NOT close. That flag answers
 * "is this the commit I meant to serve"; it says nothing about whether the
 * probe's own field names exist on that commit. A `--url` differential
 * reaching back tens of builds crosses renames, and the failure is silent --
 * a write to a dead property and a read of `undefined`, on exactly the side
 * that was pointed there deliberately.
 *
 * Demonstrated, not supposed. Phase 5 of the byte migration reported `buys`
 * identical at all twenty tiers across builds 283 and 287; the probe funds a
 * tier with the single line `w.bytes = spend`, and build 286 renamed
 * `world.energy` to `world.bytes`, so 283's `Game.buy` reads a field that
 * write never touched. Measured on a correctly served 283, that probe reads
 * buys 0 / 0 / 0 and pay 0 B where the record says 1 / 2 / 3 -- so the claim
 * was of a tree it had never read, and it is struck rather than re-taken.
 *
 * WHO has to declare is DERIVED and the LIST is declared, which is the one
 * split available here: `w` is the WINDOW in `w.requestAnimationFrame` and
 * the WORLD in `w.bytes`, in the same file, so harvesting `w.X` cannot tell
 * a world field from a global and would refuse for fields the world never
 * had. The purse is the detection instead -- a probe that touches it is a
 * probe whose figures come off it -- and `contact.mjs` is outside this guard
 * by not touching the purse, which is a fact about that probe rather than an
 * exemption somebody wrote down.
 */
/*
 * The detection is the CONJUNCTION, and the first version got it wrong in a way
 * its own first run showed: it asked only "does this read the purse", which is a
 * symptom, and named `regress.mjs` and `ladder-probe.mjs` as faults. They do read
 * it -- and they also take a caller-chosen base (`--port`, and a positional
 * baseUrl), so they share the exposure and are wired rather than excused. What
 * is NOT exposed is a probe that reads the purse against a hard-coded server, and
 * there is none. **A guard's detection has to name the exposure, not a symptom of
 * it** -- the exposure is being aimable at a tree that might not have the field.
 */
const AIMABLE = /flag\('url'|'--port'|baseUrl/;
const pursed = readdirSync(probeDir)
  .filter((f) => f.endsWith('.mjs') && f !== SELF)
  .map((f) => [f, readFileSync(new URL(f, probeDir), 'utf8')])
  // ...and the helper itself is out by DEFINING the function rather than by
  // being named: `served.mjs` contains the purse in its own docstring and
  // cannot import itself, and an exemption list of one is still a list.
  .filter(([, s]) => !/export const requireWorld/.test(s))
  .filter(([, s]) => (/\bw\.bytes\b/.test(s) || /\bworld\.bytes\b/.test(s))
    && AIMABLE.test(s))
  .sort();
if (!pursed.length) {
  console.error('world: no probe reads the purse off the served world, so this guard is '
    + 'asserting nothing -- the detection has drifted, not the exposure');
  process.exit(1);
}
const worldBad = [];
for (const [f, s] of pursed) {
  if (!/import \{[^}]*\brequireWorld\b[^}]*\} from '\.\/served\.mjs'/.test(s)) {
    worldBad.push(`${f} reads the purse off the served world and does not import requireWorld`);
  } else if (!/await requireWorld\(page, \[[^\]]*'bytes'[^\]]*\]/.test(s)) {
    worldBad.push(`${f} imports requireWorld and does not declare 'bytes' to it, `
      + 'which is the one field of its own that has been renamed');
  } else if (!/if \(abort\) \{ await browser\.close\(\); process\.exit\(1\); \}/
      .test(s.replace(/^[ \t]+/gm, ''))) {
    worldBad.push(`${f} calls requireWorld and does not exit on its verdict, `
      + 'so the refusal is a print');
  }
}
if (worldBad.length) {
  for (const line of worldBad) console.error(`world: ${line}`);
  console.error('world: --expect says WHICH tree was served and this says whether the probe '
    + 'can read it. Without the pair, a differential across a rename reports a table of '
    + 'undefined and exits 0.');
  process.exit(1);
}
console.log(`world: all ${pursed.length} purse-reading probe(s) `
  + `(${pursed.map(([f]) => f).join(' ')}) declare their served-world fields and refuse a `
  + `tree without them`);

/*
 * ---- ...AND WHOSE CONSTANTS IS IT PRINTING? ----------------------------
 *
 * Build 347, the third of the three and the last. `--expect` says which tree
 * was served; `requireWorld` says whether the probe can read it; neither
 * notices that half a probe's numbers never came from that tree at all.
 * `tiers.mjs` imports the price table, the wave roster, the type roster and
 * every config constant from `../src/`, so under `--url` those are the
 * CHECKOUT's and only the game is the served build -- a third independent
 * reason build 287's phase-5 reading could not have been about 283's economy,
 * since the whole subject of that differential was a x1000 price change and
 * both sides shared one price table.
 *
 * A REFUSAL RATHER THAN A REFACTOR, because what is true is narrower than
 * "read everything out of the page" (which would mean serialising `priceOf`
 * across the boundary and would still mix trees for any symbol somebody
 * forgot): for such a probe a differential is sound only when the checkout IS
 * the served commit, i.e. run it FROM the worktree. That is how build 346's
 * phase-5 reproduction was taken and why it was valid.
 *
 * AND THE ASYMMETRY IS THE POINT. `fight.mjs`, `dps.mjs`, `variance.mjs` and
 * `ladder-probe.mjs` import nothing from `../src/` -- every figure they print
 * is read out of the page -- so aiming them anywhere is sound, which is what
 * makes build 345's eight-build hash re-take valid rather than lucky. Derived
 * from the imports, so a probe that grows its first local import inherits the
 * refusal and one that sheds its last is let out.
 */
const mixed = readdirSync(probeDir)
  .filter((f) => f.endsWith('.mjs') && f !== SELF)
  .map((f) => [f, readFileSync(new URL(f, probeDir), 'utf8')])
  .filter(([, s]) => !/export const requireSameTree/.test(s))
  .filter(([, s]) => /from '\.\.\/src\//.test(s) && AIMABLE.test(s))
  .sort();
if (!mixed.length) {
  console.error('constants: no aimable probe imports from ../src/, so this guard is asserting '
    + 'nothing -- the detection has drifted, not the exposure. If every probe really is '
    + 'self-contained now, delete the guard and say so.');
  process.exit(1);
}
const mixBad = [];
for (const [f, s] of mixed) {
  if (!/import \{[^}]*\brequireSameTree\b[^}]*\} from '\.\/served\.mjs'/.test(s)) {
    mixBad.push(`${f} imports constants from ../src/ and can be aimed elsewhere, and does `
      + 'not import requireSameTree');
  } else if (!/requireSameTree\(served, BUILD,/.test(s)) {
    mixBad.push(`${f} imports requireSameTree and does not call it with the served info `
      + "and its own BUILD");
  } else if (!/if \(abort\) process\.exit\(1\);/.test(s.replace(/^[ \t]+/gm, ''))) {
    mixBad.push(`${f} calls requireSameTree and does not exit on its verdict, `
      + 'so the refusal is a print');
  }
}
if (mixBad.length) {
  for (const line of mixBad) console.error(`constants: ${line}`);
  console.error('constants: a probe that imports ../src/ prints its OWN constants whatever it is '
    + 'aimed at, so a differential has to be run FROM the worktree. Without the refusal it '
    + 'reports one tree\'s prices against another tree\'s game and exits 0.');
  process.exit(1);
}
const selfContained = readdirSync(probeDir)
  .filter((f) => f.endsWith('.mjs') && f !== SELF && f !== 'served.mjs')
  .filter((f) => {
    const s = readFileSync(new URL(f, probeDir), 'utf8');
    return AIMABLE.test(s) && !/from '\.\.\/src\//.test(s);
  }).sort();
console.log(`constants: ${mixed.length} aimable probe(s) (${mixed.map(([f]) => f).join(' ')}) `
  + `import ../src/ and refuse a served tree that is not this checkout; `
  + `${selfContained.length} (${selfContained.join(' ')}) import none and may be aimed `
  + `anywhere`);

const weavers = ENEMY_TYPES.filter((t) => t.gait === 'serpent');
const stainBad = [];
for (const t of weavers) {
  try { stainOf(t); } catch (e) { stainBad.push(e.message); }
}
for (const t of ENEMY_TYPES) {
  if (t.stain && t.gait !== 'serpent') {
    stainBad.push(`${t.id} carries a stain block and its gait is '${t.gait}', not `
      + "'serpent' -- nothing reads it, which is the kind:'works' fault");
  }
}
if (stainBad.length) {
  for (const line of stainBad) console.error(`stain: ${line}`);
  process.exit(1);
}
console.log(`stain: ${weavers.length} weaver (${weavers.map((t) => t.id).join(' ')}), `
  + `each declaring all ${STAIN_KEYS.length} of ${STAIN_KEYS.join('/')}`);

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
 * ---- A STANDOFF'S STATION IS DERIVED, SO WHAT IS CHECKED IS THE DERIVATION
 *
 * `standWall` needs a live world -- `shooter`, `width`, the portal rim and
 * the yard wall -- so the six-cell table of the station against its five
 * rules is a suite case and not this. What is here is the arithmetic that
 * does NOT need a world, and every line of it is a way the gait fails in
 * silence rather than loudly:
 *
 *  - `lobOf` in both directions. It throws for a `standoff` type with no
 *    block, and a block on a type that does not stand is `kind: 'works'`
 *    all over again (a field declaring a rule nothing reads, eighteen
 *    builds). Build 313's dead-field sweep cannot see the second one,
 *    because it asks only whether the KEY is read anywhere.
 *  - THE SETTLING DISTANCE. The cruise is `max(speed x sway, gap x ease)`,
 *    so the body stops closing once the drift floor beats the gap term --
 *    at `speed x sway / ease` units out. Authored badly that is a body
 *    parked a radius off its own slot with nothing failing; it has to be
 *    well inside the body.
 *  - ROOM FOR ONE COLUMN inside the 45-degree bound, or `cols` is 1 on
 *    every screen and the wall is a queue.
 *  - AND THE STATION HAS TO BE REACHABLE AT ALL: if `reach - r` is not
 *    clear of the grab band then `ceil` always wins, the station is on the
 *    mount at every viewport, and the one thing this object promises is
 *    false everywhere. That is the shape build 198 calls a threshold no
 *    device can produce.
 */
const standers = ENEMY_TYPES.filter((t) => t.gait === 'standoff');
const lobbers = ENEMY_TYPES.filter((t) => t.lob);
{
  const bad = [];
  for (const t of lobbers) {
    if (t.gait !== 'standoff') bad.push(`${t.id} declares a lob block and does not stand (gait ${t.gait})`);
  }
  const sr = CFG.shooter.r;
  const pad = CFG.shooter.grabPad;
  const rows = [];
  for (const t of standers) {
    let L;
    try { L = lobOf(t); } catch (e) { bad.push(e.message); continue; }
    const pitch = 2 * t.r + CFG.ranks.clear;
    const settle = (t.speed * L.sway) / L.ease;
    if (!(settle < t.r * 0.5)) {
      bad.push(`${t.id} settles ${settle.toFixed(1)} units off its slot `
        + `(speed ${t.speed} x sway ${L.sway} / ease ${L.ease}), which is not well inside r ${t.r}`);
    }
    // `ZOOMS` is indexed BY ERA with a dead slot at 0, and `aimRange` is in
    // `SCALED` so the module-load value is era 1's -- an era's reach is that
    // scaled by how much wider its field is.
    for (const [era, z] of CFG.ZOOMS.map((v, i) => [i, v]).filter(([i, v]) => i > 0 && v)) {
      const reach = CFG.shooter.aimRange * (CFG.ZOOMS[1] / z);
      const spanMax = (reach - t.r) * Math.SQRT1_2;
      if (!(spanMax > pitch)) {
        bad.push(`${t.id} at era ${era}: the 45-degree bound ${spanMax.toFixed(0)} `
          + `holds no column of ${pitch}`);
      }
      if (!(reach - t.r > t.r + sr + pad + 6)) {
        bad.push(`${t.id} at era ${era}: a station at ${(reach - t.r).toFixed(0)} is not clear of `
          + `the grab band ${(t.r + sr + pad + 6).toFixed(0)}, so it stands on the mount everywhere`);
      }
      rows.push(`${t.id} era ${era} out to ${(reach - t.r).toFixed(0)}, drift <= ${spanMax.toFixed(0)}`);
    }
  }
  if (bad.length) {
    for (const line of bad) console.error(`standoff: ${line}`);
    process.exit(1);
  }
  if (standers.length) {
    console.log(`standoff: ${standers.length} type(s) hold a derived station (${rows.join('; ')}), `
      + `packed at 2r + ${CFG.ranks.clear} on both axes, settling `
      + `${standers.map((t) => ((t.speed * t.lob.sway) / t.lob.ease).toFixed(1)).join('/')} off the slot`);
  }
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
