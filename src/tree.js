/*
 * The tree.
 *
 * Everything permanent used to arrive as a card: three offered, take one, and
 * the rest of that roll gone forever. That made a run a sequence of accidents.
 * A tree makes it a plan — you can see the whole machine from the first
 * minute, and every energy you bank is aimed at something you picked.
 *
 * Four categories, and nothing at the top level is bought:
 *
 *   TURRET     the machine itself
 *   AMMO       BOLT, free, and every other round beside it
 *   MINES      all eight, none behind any other
 *   ABILITIES  PULSE and HAIL, free, and the other six beside them
 *
 * A category is a heading, not a thing you own — PULSE used to be the root of
 * the ability branch, which made every other ability read as something that
 * hung off PULSE rather than as its equal.
 *
 * A node is available when its parent is owned, and bought with energy. That
 * is the whole rule. Nothing is rolled, nothing expires, nothing is missed.
 *
 * This file holds only the *shape*. What each node does still lives in
 * upgrades.js (ALL_UPGRADES / UNLOCKS / CHARGES) and is looked up by id, so
 * there is one definition of an upgrade and one definition of where it sits.
 * `scripts/check-build.mjs` asserts every id is placed exactly once, which is
 * what stops the two drifting.
 */

import { CFG, kB } from './config.js';
import { ALL_UPGRADES, UNLOCKS, CHARGES } from './upgrades.js';
import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';

/*
 * Prices, BY BAND, from build 303.
 *
 * A node's band is the band of the ladder it is MEANT to be bought in -- rungs
 * 1-7 are band 1, 8-14 band 2, and so on to band 7 at the ceiling. Level 1
 * costs the band's price and every level after it costs `BAND_STEP` of that
 * price MORE than the last, so `priceOf` is untouched: it is still
 * `cost + step * have`.
 *
 * It was flat per depth until 303 -- every leaf `500 kB + 350 kB`, every round
 * or mine 900 kB, every ability 1.1 MB, every second charge 1.4 MB -- under a
 * comment saying pacing "is not what this is for yet". The cost of that was
 * measured rather than argued: `tiers.mjs` on build 302 bought the WHOLE tree
 * by rung 17 of 49 and the damage plateaued there, because a flat price cannot
 * say "this is an early thing" and so nothing in the tree is late. The spread
 * here is 444x from band 1 to band 7, which is what makes "which band is this
 * node for?" a real authoring decision. See docs/rebalance.html, phase 4.
 *
 * Index 0 is unused so that a band reads as its own number.
 */
const BAND_PRICE = [0, kB(9), kB(27), kB(82), kB(250), kB(700), kB(1600), kB(4000)];

/**
 * What each level after the first adds, as a share of the band's price.
 *
 * ADDITIVE and not compounding: level n is `price * (1 + BAND_STEP * (n - 1))`,
 * so an 8-level node costs 24.8 band-prices rather than 1.6^7 = 27 of them.
 * The plan's own price table is drawn from the additive form (its level-3
 * column is 2.2x and not 2.56x), and the additive form is what `priceOf`
 * already computes.
 */
const BAND_STEP = 0.6;

/**
 * Where every leaf hangs. Ids are upgrade ids; the key is the parent node.
 *
 * Exported from build 250 because the evolution takes the machine apart in the
 * order it was built and needs to know which ledger entries ARE the machine.
 * A second copy of the eight socket ids is a second thing to keep in step.
 */
export const UNDER = {
  // ---- the machine ----
  turret: ['rate', 'slew', 'aimrange', 'driftaim', 'pile', 'casing', 'insulation', 'intake'],

  // ---- the rack ----
  // Whole-rack upgrades sit on the category; BOLT keeps only its own two.
  // HOT LOAD sat here until build 193. It was the whole cadence ladder on its
  // own -- see docs/pacing.md -- and what is left of the ladder is FEED.
  // CORE sits beside HOLLOWPOINT because they are the same kind of thing --
  // the only two multipliers on the whole rack -- and a player looking for
  // "more damage" should find both in one place. It is gated by `needs` and
  // not by position: see its note in upgrades.js.
  ammo: ['hollowpoint', 'core', 'tracer', 'ricochet', 'heavy', 'salvo'],
  bolt: ['overstuffed'],
  explosive: ['overpressure', 'cluster'],
  shotgun: ['doubleo', 'longshot'],
  arc: ['fifthlink', 'superconductor', 'longlead'],
  spine: ['throughandthrough', 'sliver', 'annealed', 'railed'],
  slug: ['sledge'],
  rime: ['deepfreeze'],
  // BLOOM OUT widens every burning patch, which is SPORE's and THORN's alike.
  // It sits under the round because that is the one you meet first.
  spore: ['bloomout', 'secondgrowth'],
  tithe: ['compound', 'levy', 'lien'],

  // ---- the field ----
  // The mine doctrine is whole-tier: PAIRED CHARGE lays a second of whatever
  // you are throwing, SALTED saves any spent mine. It sat under BLAST because
  // BLAST used to be the door to the tier; it is a category-wide group now,
  // and BLAST is left with nothing of its own.
  mines: ['paired', 'quicklay', 'widemouth', 'salted', 'deepcharge', 'shrapnel'],
  blast: [],
  snare: ['deadweight'],
  wire: ['hotwire'],
  knell: ['fourthbell'],
  thorn: [],
  lode: ['repulsor'],
  spall: ['buckshot', 'splinter'],
  void: ['eventhorizon'],

  // ---- the way in ----
  // One leaf under its own heading, always available, never behind anything.
  // ...one slot per boss, in order. NEW FORM is not here — it sits above every
  // category; see TREE at the bottom of this file.

  // ---- the abilities ----
  // REFLEX sat here until build 190, when it went: it fired PULSE for you,
  // and nothing in this game casts an ability for you. Build 275 puts the
  // behaviour back as FLINCH and DEADBOLT -- under the BUTTON each one fires
  // rather than up here, because "PULSE goes off by itself" is a fact about
  // PULSE and belongs beside SHOCKFRONT, the other thing you can buy for it.
  // What 190 objected to was the CHARGE, and neither of them spends one; see
  // the note on both in upgrades.js.
  abilities: ['standing'],
  // The only ability besides SPIRAL with a knob of its own -- and it earns it
  // for the same reason: PULSE is the one thing that answers a body already
  // on the mount, so how far it reaches and how hard it throws is a decision
  // rather than a number. FLINCH is the third thing that follows from that:
  // if it is the answer to being gripped, it can be the automatic one.
  pulse: ['shockfront', 'flinch'],
  // ...and HAIL's, from build 263. It is the other free ability and the other
  // one that answers a crowd rather than a body, and AIRBURST is the decision
  // its fan poses: a fan is mostly gaps, and this is what closes them.
  fan: ['airburst'],
  lance: [], well: [], prism: [], stasis: [], decoy: [],
  // WARD is the one with real shaping: how far the shell stands, how hard it
  // cuts, how many arcs come off it, and whether it throws as it comes up.
  // It is a STATE rather than an event, which is what gives it four decisions
  // to sell where an instant has one.
  ward: ['standoff', 'edged', 'fork', 'heave', 'deadbolt'],
};

/*
 * ...and WHEN each of them is meant to be bought.
 *
 * `UNDER` says where a thing sits; this says which band of the ladder it is
 * FOR, and that sets its price off `BAND_PRICE` above. The two tables are
 * siblings and this file's whole job is to be the one place both are written.
 *
 * There is NO DEFAULT, deliberately, and that is the build-224 lesson applied
 * to a second field: `levels` was `u.levels ?? 3` for forty-six builds and
 * eight nodes shipped sold three times because a node relying on the default
 * and a node deliberately capped at three were the same text. A band has the
 * same failure mode and a worse blast radius -- an omitted band would read as
 * band 1, which is 9 kB, which is a node the player is handed. `bandOf` throws
 * for a missing id and `check-build.mjs` fails the build for one, in both
 * directions: an id here that the tree does not place is as much a mistake as
 * a node placed with no band.
 *
 * The mine line and its eight ways in are here even though `CFG.mines.inPlay`
 * is false, for two reasons. `rootNode('mines')` is still BUILT and thrown
 * away to derive `ELSEWHERE` (see MINE_IDS below), so `leaf()` runs for all
 * twenty-one of them and would throw; and the gun line's lesson from build 289
 * is that turning a system back on should be a config flip rather than an edit
 * to the guards. The six emplacement upgrades are the exception and are absent
 * on purpose: they price themselves, as do RECAST (which is not bought in
 * bytes at all) and the ASSAY (a deliberate one-off).
 *
 * HOW THIS TABLE WAS ARRIVED AT, because a band is a judgement and the reason
 * matters more than the number. Three independent whole-tree assignments were
 * made from three different angles -- the plan's named roster read as law, the
 * mechanism of each node read off its own `line`, and the affordability
 * arithmetic worked forwards from the band prices -- and this is their
 * majority: 31 of the 66 unanimous, 31 by two of three, 4 the median where all
 * three differed. No parent violation had to be repaired, which is the useful
 * part: three angles that never spoke to each other did not once price a leaf
 * for an earlier band than its arm.
 *
 * The two decisions worth recording because they were CLOSE:
 *
 * HOLLOWPOINT is the largest single entry in the table -- eight levels, so its
 * band moves 223 kB to 2.03 MB -- and it is band 3. Band 1 hands the whole
 * x6.35 damage spine over by rung 4 to 10 on the plan's own income model,
 * which is build 177's plateau rebuilt; band 3 finishes it at rungs 15 to 23
 * and leaves CORE's x3.32 to land at 28 to 35, so the gun's power arrives in
 * two spaced steps across forty-nine rungs instead of one early one.
 *
 * CORE is band 5 because the plan says so in PROSE rather than in its band
 * table -- "the four levels of CORE are priced for band 5 and affordable
 * inside it" -- and the arithmetic agrees: 5.32 MB against the 15.2 MB the run
 * has banked by rung 28, which is the rung RECAST's gate opens on. RECALL and
 * OVERCLOCK are band 2 from the same paragraph.
 *
 * Grouped the way `UNDER` is grouped, so the two tables read side by side.
 */
const BAND = {
  /*
   * ---- the machine, and NONE of it may be priced past CORE's band ----
   *
   * `rigDone()` requires EVERY LEVEL of every node under this root; `recast`
   * (NEW FORM) needs `rigDone()`; and `core` needs `recast`. So the whole of
   * this group is a transitive prerequisite of the damage line's second half,
   * and it is the one gate in the game that is not a tree edge -- `bands()`'s
   * parent rule passed 66 of 66 on the build that got this wrong.
   *
   * Build 303 shipped `pile` at 6 and `insulation` at 7, which put the branch
   * at 27.88 MB against the 15.20 MB a run has banked by rung 28 on the plan's
   * own income model -- 218% with CORE counted, so NEW FORM and CORE were both
   * behind a price the run could not meet at the rung the plan offers them at.
   * Both are 4 now and the branch is 3.40 MB. `bands()` holds the rule.
   */
  // ---- the machine ----
  rate: 1, slew: 2, aimrange: 2, driftaim: 4, pile: 4, casing: 2, insulation: 4,
  intake: 1,
  // ---- the rack, whole ----
  hollowpoint: 3, core: 5, tracer: 1, ricochet: 1, heavy: 2, salvo: 1,
  // ---- BOLT ----
  overstuffed: 1,
  // ---- the eight bought rounds, and their own ----
  open_explosive: 3, overpressure: 4, cluster: 4, open_shotgun: 2, doubleo: 2,
  longshot: 2, open_arc: 4, fifthlink: 5, superconductor: 7, longlead: 7,
  open_spine: 4, throughandthrough: 4, sliver: 6, annealed: 7, railed: 7,
  open_slug: 5, sledge: 5, open_rime: 3, deepfreeze: 7, open_spore: 6, bloomout: 6,
  secondgrowth: 6, open_tithe: 5, compound: 7, levy: 6, lien: 7,
  // ---- the bar, whole ----
  standing: 4,
  // ---- the two free buttons ----
  charge_pulse: 1, shockfront: 1, flinch: 3, charge_fan: 2, airburst: 2,
  // ---- the six bought abilities, and their own ----
  open_lance: 3, charge_lance: 3, open_well: 5, charge_well: 5, open_prism: 5,
  charge_prism: 5, open_stasis: 3, charge_stasis: 6, open_decoy: 4, charge_decoy: 4,
  open_ward: 3, charge_ward: 3, standoff: 5, edged: 6, fork: 6, heave: 6,
  deadbolt: 4,
  // ---- the wave ----
  recall: 2, overclock: 2,
  // ---- the mine line, out of play (CFG.mines.inPlay) but priced ----
  // Unmeasured, and says so: nothing has benched a mine since build 289 shut
  // the line. The shape is the AMMUNITION line's -- eight ways in spread up
  // the ladder, the whole-line multipliers early enough to be worth owning,
  // the per-kind knobs beside their kind -- so that turning `inPlay` back on
  // is a config flip and not a pricing exercise. What it must NOT be is
  // absent: `rootNode('mines')` is still built and thrown away to derive
  // ELSEWHERE, so `leaf()` runs for all twenty-one of these.
  open_blast: 2, open_snare: 3, open_wire: 3, open_knell: 4,
  open_thorn: 4, open_lode: 5, open_spall: 5, open_void: 6,
  paired: 3, quicklay: 3, widemouth: 4, salted: 4, deepcharge: 5, shrapnel: 4,
  deadweight: 4, hotwire: 4, fourthbell: 5, repulsor: 5,
  buckshot: 5, splinter: 5, eventhorizon: 6,
};

/**
 * The band a node is priced for. THROWS for an id that declares none.
 *
 * A throw at module load is the point: it is a page that does not boot, which
 * is loud, where a default would be a node quietly sold at a thousandth of its
 * price. `check-build.mjs` makes the same statement at build time.
 */
export function bandOf(id) {
  const b = BAND[id];
  if (!Number.isInteger(b) || b < 1 || b >= BAND_PRICE.length) {
    throw new Error(`${id}: no band. Every node priced in bytes declares the band `
      + 'of the ladder it is meant to be bought in; there is no default. See BAND '
      + 'in tree.js.');
  }
  return b;
}

/** ...and what that band charges: the first level, and each one after it. */
function bandCost(id) {
  const price = BAND_PRICE[bandOf(id)];
  return { cost: price, step: Math.round(price * BAND_STEP) };
}

/** Every band-priced id, for the guard. Exported for `check-build.mjs`. */
export const BAND_IDS = () => Object.keys(BAND);

/** Exported so a probe can price a hypothetical without rebuilding the tree. */
export const bandPrice = (b) => BAND_PRICE[b];

/** Which arms hang off which category, in the order they are shown. */
const BRANCH = {
  ammo: ['bolt', 'explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  // All eight, side by side. BLAST used to be a gate the other seven sat
  // behind, which made the first 900 a toll rather than a choice — you paid it
  // to reach the mine you actually wanted. They are peers now, in any order.
  mines: ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'],
  // PULSE and HAIL are the two the turret starts with. They are free where the
  // six below them are bought; their extra uses are not.
  abilities: ['pulse', 'fan', 'lance', 'well', 'prism', 'stasis', 'decoy', 'ward'],
  turret: [],
};

/** Free arms: things the turret already has when the run starts. */
const FREE_ARMS = new Set(['bolt', 'pulse', 'fan']);

const UP_BY_ID = new Map(ALL_UPGRADES.map((u) => [u.id, u]));

/*
 * The round you start with is `standard` in the arsenal and `bolt` everywhere
 * else -- the default has never needed a key of its own there. Without the
 * alias every lookup below missed, and the BOLT row carried no icon, no tone
 * and no description at all: a blank line at the top of AMMUNITION.
 */
const ARM_KEY = { bolt: 'standard' };
const armOf = (key) => ARSENAL.find((a) => a.key === (ARM_KEY[key] || key));
const abilityOf = (key) => ABILITIES.find((a) => a.id === key);

const armLabel = (key) => (armOf(key) || {}).label
  || (abilityOf(key) || {}).name || key.toUpperCase();
const armIcon = (key) => (armOf(key) || {}).icon
  || (abilityOf(key) || {}).icon || '';
const armTone = (key) => (armOf(key) || {}).tone
  || (abilityOf(key) || {}).color || '#8fb6d8';

/** These are read as sentences on the row, and the sources are not. */
const sentence = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');

/**
 * What a round, mine or ability does, said on the row itself. A price with no
 * description is a thing you cannot decide about — the whole point of a tree
 * over a card draw is being able to read it before you commit.
 */
function armLine(key) {
  const a = armOf(key);
  if (a) {
    /*
     * `dmg` is free text for the arsenal's spec table: '95', but also 'none',
     * 'total', '74, twice' and '11, then 25 a jump'. Appending " damage." to
     * all of them gave SNARE "none damage." and VOID "total damage.".
     *
     * A quantity gets labelled instead of suffixed, which reads correctly for
     * every one of them. Anything that is not a quantity is left out entirely
     * — SNARE's line already opens "Never goes off."
     */
    const dmg = /^\d/.test(a.dmg || '') ? `Damage ${a.dmg}. ` : '';
    return `${dmg}${sentence(a.fx || '')}`.trim();
  }
  const b = abilityOf(key);
  // The ability hints are written as "NAME — what it does"; the name is
  // already the heading of the row, and what is left starts mid-sentence.
  if (b) return sentence((b.hint || '').replace(/^[A-Z ]+—\s*/, ''));
  return '';
}

/**
 * A node.
 * @param kind  root | arm | upgrade | charge
 * @param id    the id it is bought as: an upgrade id, `open_<key>`, or
 *              `charge_<key>`. Roots have no id — they are never bought.
 */
function node(o) {
  return { levels: 1, cost: 0, children: [], ...o };
}

/*
 * Four categories, four hues. AMMUNITION was '#bff4ff' -- twenty degrees of
 * hue from TURRET's cyan and almost white, so the two branches that carry the
 * most rows were the same colour. Rose is what is free: green belongs to
 * energy and the spectrum belongs to ANOMALY. It is KNELL's tone as well, but
 * KNELL is one mine deep inside another branch; two categories sharing a hue
 * is the collision that matters.
 */
const ROOT_TONE = { turret: '#59e0ff', ammo: '#ff5d8f', mines: '#ffb347', abilities: '#c9a7ff' };

/*
 * ---- and one register for the three ALL-X groups ----
 *
 * A group wore its CATEGORY's tone, and `Menu.toneOf` walks up to the nearest
 * one -- so every upgrade under ALL MINES came out `#ffb347`, which is BLAST's
 * `#ffb247` to within one unit of green. Measured in CIELAB: **dE 0.6**. Not
 * "similar", the same colour. So the eight rows that apply to every mine you
 * lay were indistinguishable from the eight that apply only to the first one
 * in the branch, and ALL ROUNDS had a milder case of it against HE.
 *
 * The fix is not another hue, because there is no hue left: cyan, azure,
 * mint, teal, periwinkle, violet, magenta, rose, red, amber, gold and three
 * greens are all spoken for by an arm, an ability or a root, and the suite's
 * own floor for two things that must be told apart is dE 25. So this takes
 * the one register nothing else uses -- a warm unsaturated bone, against a
 * palette that is otherwise entirely saturated colour plus two COLD neutrals
 * (SLUG's steel, WARD's white). Nearest neighbour dE 34.1.
 *
 * Shared by all three deliberately. The axis being drawn is not "which
 * category" -- the heading above already says that -- it is "this applies to
 * everything you have, not to the thing beside it", and that is one idea and
 * should look like one. `.shopCard.univ` in styles.css carries it structurally
 * as well, because a rule that lives only in a hue is a rule a colourblind
 * player does not get.
 */
const GROUP_TONE = '#d7c49a';
const ROOT_NAME = { turret: 'TURRET', ammo: 'AMMUNITION', mines: 'MINES', abilities: 'ABILITIES' };
const ROOT_LINE = {
  turret: 'The machine itself. Everything here is yours from the first frame.',
  ammo: 'What leaves the barrel. BOLT is loaded before you start; the rest are bought.',
  mines: 'What you leave behind. Eight of them, none behind any other — buy them in any order.',
  abilities: 'What you hold. PULSE and HAIL can never be taken from you; the other six are bought.',
};

/*
 * ---- there is no default number of levels, and there used to be ----
 *
 * This read `u.levels ?? 3`, and that one `??` is the single most expensive
 * line this repository has written. A node whose author never capped it was
 * silently sold THREE times, and eight of them shipped that way across builds
 * 178 to 223: HOT LOAD (0.85^3 on the fire interval, a larger cadence buff
 * than the FEED nerf that had just been made for exactly that reason),
 * BUCKSHOT, REPULSOR, STANDING ORDER (0.8^3 = 0.512 against a row promising
 * -20%, on the one node that touches all eight ability buttons), FIFTH LINK,
 * PAIRED CHARGE, FOURTH BELL (five tolls from a node named for the fourth) and
 * DEEP CHARGE (2.46x, a blast wider than the screen it is drawn on).
 *
 * Every one was found late, by a probe or a player rather than by the suite,
 * because a node relying on the default and a node deliberately set to three
 * were the same text. That is the whole fault: the mistake was INVISIBLE. A
 * cap corrected in build 220 -- the docstring in upgrades.js had actually
 * promised that an absent `levels` meant "without limit" -- did not help,
 * because it left the silence in place.
 *
 * So the number is mandatory now. Every upgrade writes its own out, three
 * included, and a node that forgets throws here rather than quietly becoming
 * a ladder nobody priced. `check-build.mjs` asserts the same thing so it is
 * caught before a page ever loads.
 *
 * `repeat` is the one exemption and is a different idea: no ceiling at all,
 * because the count is not what you own but how many you are holding, and it
 * goes down again. Only APERTURE and RECAST.
 */
/**
 * How many times an upgrade may be bought, or a throw.
 *
 * Split out of `leaf` and exported ONLY so the suite can exercise the refusal
 * directly -- which is a real and stated reason, and the alternative was a
 * case that asserts the absence of a `??` by reading the source as text. The
 * rule is the load-bearing part of this file and a case that cannot make it
 * fire is not a case; `leaf` is unreachable from outside, and feeding a
 * malformed node through the whole tree builder means adding it to a branch
 * table that is module-private too.
 */
export function levelsOf(u) {
  if (u && u.repeat) return Infinity;
  if (!u || !(u.levels > 0) || u.levels !== Math.round(u.levels)) {
    throw new Error(`tree: upgrade "${(u && u.id) || '?'}" declares no levels. `
      + 'Write the number out -- there is no default, deliberately: see the '
      + 'note above leaf().');
  }
  return u.levels;
}

function leaf(id) {
  const u = UP_BY_ID.get(id);
  if (!u) throw new Error(`tree: no upgrade "${id}"`);
  const levels = levelsOf(u);
  return node({
    kind: 'upgrade', id, key: id, name: u.name, line: u.line, icon: u.icon,
    levels, repeat: !!u.repeat, currency: u.currency || null,
    /*
     * The gate predicate, and it has to be listed HERE: this builder copies an
     * EXPLICIT set of fields off the upgrade, so anything not named is simply
     * not on the node. `available()` consulted `n.needs` for a whole build
     * while `n.needs` was undefined and NEW FORM was buyable with one
     * REMAINDER out of seven.
     */
    needs: u.needs || null, needsLine: u.needsLine || '',
    dormant: !!u.dormant, rung: u.rung || 0,
    tone: u.tone || '#9fb3c8',
    // An upgrade may price itself. Only APERTURE does: it is not a step on a
    // ladder, it is the same purchase every time, and it costs what it costs.
    ...(u.cost === undefined ? bandCost(id) : { cost: u.cost, step: u.step || 0 }),
    tiers: u.tiers || null,
  });
}

/** The second use of an ability, as a node. */
function chargeOf(key) {
  return node({
    kind: 'charge', id: `charge_${key}`, key, name: `${armLabel(key)} ×2`,
    // Named rather than "it": eight of these sit in one branch and the line
    // was word-for-word identical on all eight.
    line: `A second ${armLabel(key)}, ready before the wait is over.`,
    icon: armIcon(key), tone: armTone(key), ...bandCost(`charge_${key}`),
  });
}

/** `free` marks something the turret already has: BOLT, PULSE and HAIL. */
function arm(key, kind) {
  const free = FREE_ARMS.has(key);
  const kids = (UNDER[key] || []).map(leaf);
  if (kind === 'ability') kids.unshift(chargeOf(key));
  return node({
    kind: 'arm', id: free ? null : `open_${key}`, key, free,
    name: armLabel(key), line: armLine(key), icon: armIcon(key), tone: armTone(key),
    ...(free ? { cost: 0 } : bandCost(`open_${key}`)),
    children: kids,
  });
}

const KIND = { ammo: 'round', mines: 'mine', abilities: 'ability', turret: null };

/*
 * The upgrades that are not about any one thing.
 *
 * HOLLOWPOINT applies to whatever is loaded; STANDING ORDER to everything you
 * hold. Both sat directly under their category heading, in one flat list with
 * the rounds and abilities they apply to -- so REFLEX read as an ability you
 * could equip, and the actual abilities were four rows further down. They get
 * their own branch, and the category is left holding only the things it is a
 * category of.
 *
 * TURRET has no arms, so there is nothing there to separate its leaves from
 * and it stays flat. MINES has no leaves of its own at all.
 */
const GROUP = {
  ammo: {
    name: 'ALL ROUNDS',
    line: 'Applies to whatever is loaded, not to one round.',
  },
  abilities: {
    name: 'ALL ABILITIES',
    line: 'Applies to everything you hold, not to one ability.',
  },
  mines: {
    name: 'ALL MINES',
    line: 'Applies to whatever you lay, not to one mine.',
  },
};

/** A category's own leaves, boxed under a heading where there is one. */
function commons(root) {
  const kids = (UNDER[root] || []).map(leaf);
  const g = GROUP[root];
  if (!g || !kids.length) return kids;
  return [node({
    kind: 'group', key: `${root}_all`, free: true, universal: true,
    name: g.name, line: g.line, tone: GROUP_TONE, children: kids,
  })];
}

/*
 * A category is a heading and is never bought. Everything purchasable is an
 * arm or a leaf under one, which is what makes ABILITIES a peer of AMMO rather
 * than a list hanging off PULSE.
 */
const ROOTS = ['turret', 'ammo', 'mines', 'abilities'];

/*
 * One root, built. Pulled out of the TREE literal so that the MINES root can
 * be built WITHOUT being placed -- which is how `coverage()` learns the exact
 * set of ids the mine line takes with it when it goes out of play. Deriving
 * that set from the root itself rather than writing it out is the difference
 * between a list that follows the tree and a list somebody has to remember to
 * update; this repo has paid for the second shape four times.
 */
const rootNode = (root) => node({
  kind: 'root', key: root, name: ROOT_NAME[root], free: true,
  tone: ROOT_TONE[root], line: ROOT_LINE[root],
  children: [
    ...commons(root),
    ...(BRANCH[root] || []).map((k) => arm(k, KIND[root])),
  ],
});
/*
 * The whole thing, and RECAST sits above all of it.
 *
 * Every other purchasable thing in the game is an upgrade to the machine, the
 * rack or the field, and belongs under the category it upgrades. RECAST is
 * not: it is what you do with what the bosses leave behind, it is bought with
 * a currency nothing else uses, and there is exactly one of it. A category of
 * one would have been a heading with a single row under it, which says less
 * than the row on its own.
 */
export const TREE = [
  leaf('recast'),
  /*
   * ...and the bench, for the same reason and one of its own: SANDBOX is not
   * an upgrade to anything, it is the instrument you look at the upgrades
   * with. A category of one would say less than the row does.
   */
  leaf('sandbox'),
  /*
   * ...and the wave's own two, for the same reason RECAST is up here.
   *
   * Neither upgrades the machine, the rack or the field -- they are decisions
   * about the wave that is running, taken from the rail's sheet rather than
   * from the strip, which is full at eight. TURRET would have been the natural
   * home and is the wrong one twice over: every node there fills a socket on
   * the drawn turret (check-build catches it -- RIG_MAX is 18 and the branch
   * would have sold 20), and neither of these is a part you bolt on.
   *
   * Two rows, so unlike RECAST they get a heading: on its own a row explains
   * itself, and a pair needs saying what they have in common.
   */
  node({
    kind: 'group', key: 'wave_all', free: true,
    name: 'THE WAVE', tone: ROOT_TONE.turret,
    line: 'Two decisions about the wave that is running, taken from the rail.',
    children: [leaf('recall'), leaf('overclock')],
  }),
  /*
   * Four, not five. ANOMALY was the fifth and it sold the seven ways in; the
   * branch went in build 227 and a way in is given at a rung instead -- see
   * `at` in anomaly.js. Nothing else moved: RECAST is still above all of this,
   * because it is still what the bosses leave rather than an upgrade to
   * anything.
   */
  ...ROOTS.filter((root) => root !== 'mines' || CFG.mines.inPlay).map(rootNode),
];

/** Every node, flat, parent first. */
export function flatten(nodes = TREE, parent = null, out = []) {
  for (const n of nodes) {
    n.parent = parent;
    out.push(n);
    flatten(n.children, n, out);
  }
  return out;
}

export const NODES = flatten();

/*
 * The emplacement line: six upgrades whose only door is the TURRETS tab, which
 * is locked until a gun is standing. The tree cannot express that gate -- it
 * is a purchase made on the FIELD, not a node behind another node -- so they
 * live outside it, and `ELSEWHERE` below is what stops `check-build` reporting
 * them as content nobody can buy.
 *
 * Listed by id rather than by axis so that adding a seventh without deciding
 * where it lives still fails the build.
 */
const ELSEWHERE_IDS = ['gundamage', 'gunrate', 'gunrange', 'gunslew', 'gunsalvo', 'gunammo'];

/** What a node costs at the level about to be bought. `have` is 0-based. */
export function priceOf(n, have = 0) {
  return n.cost + (n.step || 0) * have;
}

/*
 * The coverage check, exported so scripts/check-build.mjs can run it without a
 * browser. Every purchasable thing in upgrades.js must appear in the tree
 * exactly once, or it is content nobody can ever buy.
 */
/*
 * The nodes that are bought somewhere other than the tree.
 *
 * Built with the tree's own `leaf`, so they are ordinary nodes in every
 * respect -- the same field list, the same price ladder, the same `needs`
 * predicate -- and they are in `NODE_BY_ID`, which is what `Game.buy` gates
 * on. They are simply not in `TREE`, so no branch draws them.
 */
/*
 * ...and none of them while the emplacement line is out of play. Empty here
 * means the six are in no tree, in no `NODE_BY_ID`, and skipped by a ledger
 * replay -- `Game.restore` walks `taken` through `BY_ID.get(id)` and a miss
 * simply continues -- so a run that bought them comes back without them and
 * cannot buy them again.
 *
 * `ELSEWHERE` below is deliberately NOT gated with it. It is what tells
 * `check-build.mjs` that these six ids live outside the tree on purpose, and
 * that is still true: they are authored, they are in `ALL_UPGRADES`, and they
 * are not content nobody can buy -- they are content nothing currently opens.
 */
export const DETACHED = CFG.gun.inPlay ? ELSEWHERE_IDS.map(leaf) : [];

/**
 * Every node that can be BOUGHT, wherever it is offered from. `Game.buy` gates
 * on this, so a node missing from it is a node no button can ever spend on --
 * which is what the six emplacement upgrades were for one build.
 */
export const NODE_BY_ID = new Map(
  [...NODES, ...DETACHED].filter((n) => n.id).map((n) => [n.id, n]),
);

/*
 * Ids that are deliberately NOT in the tree, and where they are instead.
 *
 * The tree is the canonical place a permanent thing is offered, and
 * `coverage()` exists to catch one that was written and never placed -- which
 * is content nobody can buy. The emplacement line is the one exception, and it
 * is an exception for a reason the tree cannot express: those six are only
 * reachable once a gun is STANDING, which is a purchase made on the field
 * rather than a node in a branch, and the tree has no gate of that shape.
 *
 * Listed by id rather than by axis so that adding a seventh GUN node without
 * deciding where it lives still fails the build.
 */
/*
 * ...and the mine line, when it is out of play. Everything the MINES root
 * would have offered -- the six ALL MINES leaves, the eight ways in, and the
 * seven upgrades hanging off individual kinds -- is still authored in
 * `upgrades.js` and is in no branch, so `coverage()` would call all twenty-one
 * content nobody can buy. They are excused instead, and the excuse is
 * DERIVED: the root is built here and thrown away, and its own ids are the
 * list. A hand-written one would be wrong the first time a mine upgrade is
 * added.
 */
const MINE_IDS = CFG.mines.inPlay
  ? []
  : flatten([rootNode('mines')]).filter((n) => n.id).map((n) => n.id);

export const ELSEWHERE = new Map([
  ...ELSEWHERE_IDS.map((id) => [id, 'the TURRETS tab']),
  ...MINE_IDS.map((id) => [id, 'out of play with the mine line']),
]);

/**
 * The same statement for BANDS: every id priced in bytes declares one, and the
 * table declares nothing the tree does not offer.
 *
 * `coverage()` catches a node that was written and never placed. This catches
 * the two ways the price table can drift from the tree it prices: a node with
 * no band (which `bandOf` would throw for, but only once something asked --
 * and nothing asks for the mine line while it is out of play), and a band left
 * behind for an id that has been deleted or renamed, which reads as coverage
 * and is not.
 *
 * `parentBad` is the one RULE rather than a coverage claim: a leaf cannot be
 * priced for an earlier band than the arm it hangs off, because the band is
 * when the thing is meant to be bought and a leaf cannot be bought before its
 * parent is owned. Equal is fine and common -- an arm and its own leaves are
 * usually the same purchase decision.
 */
export function bands() {
  const want = [...ALL_UPGRADES.filter((u) => u.cost === undefined).map((u) => u.id),
    ...UNLOCKS.map((u) => u.id), ...CHARGES.map((u) => u.id)];
  const have = Object.keys(BAND);
  const missing = want.filter((id) => !have.includes(id));
  const extra = have.filter((id) => !want.includes(id));
  const range = have.filter((id) => !Number.isInteger(BAND[id])
    || BAND[id] < 1 || BAND[id] >= BAND_PRICE.length);
  const parentBad = [];
  for (const n of NODES) {
    if (!n.id || !BAND[n.id]) continue;
    for (let p = n.parent; p; p = p.parent) {
      if (p.id && BAND[p.id] && BAND[n.id] < BAND[p.id]) {
        parentBad.push(`${n.id} (band ${BAND[n.id]}) under ${p.id} (band ${BAND[p.id]})`);
        break;
      }
    }
  }
  const rising = BAND_PRICE.slice(2).every((v, i) => v > BAND_PRICE[i + 1]);
  /*
   * ...and the one prerequisite that is NOT a tree edge.
   *
   * `rigDone()` in game.js requires every level of every node under the
   * `turret` root. `recast` gates on `rigDone()`, and `core` gates on owning
   * `recast` -- so the whole machine is a transitive prerequisite of CORE, and
   * a machine node priced LATER than CORE is a node that has to be bought
   * before a thing that is cheaper than it. `parentBad` cannot see this: the
   * turret nodes' parent is the root, which has no band, and the chain runs
   * through two `needs` predicates rather than through `children`.
   *
   * Build 303 shipped `insulation` at band 7 and `pile` at band 6 against a
   * CORE at band 5 and had a green suite, because nothing asked. Derived from
   * `UNDER.turret` and from `core`'s band rather than written out, so a ninth
   * turret socket is covered by existing.
   */
  const gateBad = [];
  const coreBand = BAND.core;
  for (const id of UNDER.turret || []) {
    if (BAND[id] === undefined || coreBand === undefined) continue;
    if (BAND[id] > coreBand) {
      gateBad.push(`${id} (band ${BAND[id]}) is required by rigDone() -> NEW FORM `
        + `-> CORE (band ${coreBand})`);
    }
  }
  return { want: want.length, missing, extra, range, parentBad, gateBad, rising,
    BAND, BAND_PRICE, BAND_STEP };
}

export function coverage() {
  const placed = [...NODES.filter((n) => n.id).map((n) => n.id), ...ELSEWHERE.keys()];
  const dupes = placed.filter((id, i) => placed.indexOf(id) !== i);
  const want = [...ALL_UPGRADES.map((u) => u.id), ...UNLOCKS.map((u) => u.id),
    ...CHARGES.map((u) => u.id)];
  const missing = want.filter((id) => !placed.includes(id));
  const extra = placed.filter((id) => !want.includes(id));
  return { placed: placed.length, want: want.length, missing, extra, dupes };
}
