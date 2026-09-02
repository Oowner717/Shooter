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

import { ALL_UPGRADES, UNLOCKS, CHARGES, BOSS_TONE } from './upgrades.js';
import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';

/*
 * Prices. Flat per depth rather than per node, because pacing is not what this
 * is for yet — the shape is. One number to move when it is.
 */
export const COST = {
  round: 900, // a new round or mine
  mine: 900,
  ability: 1100,
  charge: 1400, // a second use of one
  upgrade: 500, // a leaf, at its first level
  step: 350, // ...and this much more for every level after the first
};

/** Where every leaf hangs. Ids are upgrade ids; the key is the parent node. */
const UNDER = {
  // ---- the machine ----
  turret: ['rate', 'slew', 'aimrange', 'driftaim', 'pile', 'casing', 'insulation', 'intake'],

  // ---- the rack ----
  // Whole-rack upgrades sit on the category; BOLT keeps only its own two.
  // HOT LOAD sat here until build 193. It was the whole cadence ladder on its
  // own -- see docs/pacing.md -- and what is left of the ladder is FEED.
  ammo: ['hollowpoint', 'tracer', 'ricochet', 'heavy', 'salvo'],
  bolt: ['overstuffed'],
  explosive: ['overpressure', 'cluster'],
  shotgun: ['doubleo', 'longshot'],
  arc: ['fifthlink', 'superconductor', 'longlead'],
  spine: ['throughandthrough', 'annealed', 'railed', 'doubletap'],
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
  spall: ['buckshot'],
  void: ['eventhorizon'],

  // ---- the way in ----
  // One leaf under its own heading, always available, never behind anything.
  // ...one slot per boss, in order. RECAST is not here — it sits above every
  // category; see TREE at the bottom of this file.
  anomaly: ['aperture', 'aperture2', 'aperture3', 'aperture4', 'aperture5', 'aperture6', 'aperture7'],

  // ---- the abilities ----
  // REFLEX sat here until build 190, when it went: it fired PULSE for you,
  // and nothing in this game casts an ability for you.
  abilities: ['standing'],
  // The only ability besides SPIRAL with a knob of its own -- and it earns it
  // for the same reason: PULSE is the one thing that answers a body already
  // on the mount, so how far it reaches and how hard it throws is a decision
  // rather than a number.
  pulse: ['shockfront'],
  fan: [], lance: [], well: [], prism: [], stasis: [], decoy: [],
  // The only ability in the tree with a shaping upgrade of its own. The other
  // seven are bought and then have nothing but a second charge to sell; this
  // one has a knob on it, which is part of why it is the one that replaced
  // CHORUS -- the tree is about the gun, and so is this.
  spiral: ['counterspin'],
};

/** Which arms hang off which category, in the order they are shown. */
const BRANCH = {
  ammo: ['bolt', 'explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  // All eight, side by side. BLAST used to be a gate the other seven sat
  // behind, which made the first 900 a toll rather than a choice — you paid it
  // to reach the mine you actually wanted. They are peers now, in any order.
  mines: ['blast', 'snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'],
  // PULSE and HAIL are the two the turret starts with. They are free where the
  // six below them are bought; their extra uses are not.
  abilities: ['pulse', 'fan', 'lance', 'well', 'prism', 'stasis', 'decoy', 'spiral'],
  turret: [],
  anomaly: [],
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
const ROOT_TONE = { turret: '#59e0ff', ammo: '#ff5d8f', mines: '#ffb347', abilities: '#c9a7ff', anomaly: BOSS_TONE[0] };
const ROOT_NAME = { turret: 'TURRET', ammo: 'AMMUNITION', mines: 'MINES', abilities: 'ABILITIES', anomaly: 'ANOMALY' };
const ROOT_LINE = {
  turret: 'The machine itself. Everything here is yours from the first frame.',
  ammo: 'What leaves the barrel. BOLT is loaded before you start; the rest are bought.',
  mines: 'What you leave behind. Eight of them, none behind any other — buy them in any order.',
  abilities: 'What you hold. PULSE and HAIL can never be taken from you; the other six are bought.',
  anomaly: 'Seven ways in, one colour each. One of them has something on the other side of it.',
};

function leaf(id) {
  const u = UP_BY_ID.get(id);
  if (!u) throw new Error(`tree: no upgrade "${id}"`);
  // `repeat` is a node with no ceiling at all: the count is not what you own,
  // it is how many you are holding, and it goes down again. Only APERTURE.
  const levels = u.repeat ? Infinity : (u.levels ?? 3);
  return node({
    kind: 'upgrade', id, key: id, name: u.name, line: u.line, icon: u.icon,
    levels, repeat: !!u.repeat, currency: u.currency || null,
    dormant: !!u.dormant, needs: u.needs || 0, rung: u.rung || 0,
    tone: u.tone || '#9fb3c8',
    // An upgrade may price itself. Only APERTURE does: it is not a step on a
    // ladder, it is the same purchase every time, and it costs what it costs.
    cost: u.cost ?? COST.upgrade, step: u.step ?? COST.step, tiers: u.tiers || null,
  });
}

/** The second use of an ability, as a node. */
function chargeOf(key) {
  return node({
    kind: 'charge', id: `charge_${key}`, key, name: `${armLabel(key)} ×2`,
    // Named rather than "it": eight of these sit in one branch and the line
    // was word-for-word identical on all eight.
    line: `A second ${armLabel(key)}, ready before the wait is over.`,
    icon: armIcon(key), tone: armTone(key), cost: COST.charge,
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
    cost: free ? 0 : (kind === 'ability' ? COST.ability : COST[kind]),
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
    kind: 'group', key: `${root}_all`, free: true,
    name: g.name, line: g.line, tone: ROOT_TONE[root], children: kids,
  })];
}

/*
 * A category is a heading and is never bought. Everything purchasable is an
 * arm or a leaf under one, which is what makes ABILITIES a peer of AMMO rather
 * than a list hanging off PULSE.
 */
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
  ...['anomaly', 'turret', 'ammo', 'mines', 'abilities'].map((root) => node({
    kind: 'root', key: root, name: ROOT_NAME[root], free: true,
    tone: ROOT_TONE[root], line: ROOT_LINE[root],
    // The ANOMALY heading carries every boss colour at once — see BOSS_TONE.
    tones: root === 'anomaly' ? BOSS_TONE : null,
    children: [
      ...commons(root),
      ...(BRANCH[root] || []).map((k) => arm(k, KIND[root])),
    ],
  })),
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
export const NODE_BY_ID = new Map(NODES.filter((n) => n.id).map((n) => [n.id, n]));

/** What a node costs at the level about to be bought. `have` is 0-based. */
export function priceOf(n, have = 0) {
  return n.cost + (n.step || 0) * have;
}

/*
 * The coverage check, exported so scripts/check-build.mjs can run it without a
 * browser. Every purchasable thing in upgrades.js must appear in the tree
 * exactly once, or it is content nobody can ever buy.
 */
export function coverage() {
  const placed = NODES.filter((n) => n.id).map((n) => n.id);
  const dupes = placed.filter((id, i) => placed.indexOf(id) !== i);
  const want = [...ALL_UPGRADES.map((u) => u.id), ...UNLOCKS.map((u) => u.id),
    ...CHARGES.map((u) => u.id)];
  const missing = want.filter((id) => !placed.includes(id));
  const extra = placed.filter((id) => !want.includes(id));
  return { placed: placed.length, want: want.length, missing, extra, dupes };
}
