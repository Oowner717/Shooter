/*
 * The tree.
 *
 * Everything permanent used to arrive as an AMENDMENT: three cards, take one,
 * and the rest of that roll was gone forever. That made a run a sequence of
 * accidents. A tree makes it a plan — you can see the whole machine from the
 * first minute, and every energy you bank is aimed at something you picked.
 *
 * Four categories, and nothing at the top level is bought:
 *
 *   TURRET     the machine itself
 *   AMMO       BOLT, free, and every other round beside it
 *   MINES      BLAST, bought, and every other mine behind it
 *   ABILITIES  PULSE and FAN, free, and the other six beside them
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

import { ALL_UPGRADES, UNLOCKS, CHARGES } from './upgrades.js';
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
  turret: ['rate', 'handsoff', 'slew', 'overwatch', 'casing', 'insulation', 'sweep', 'intake'],

  // ---- the rack ----
  // Whole-rack upgrades sit on the category; BOLT keeps only its own two.
  ammo: ['hollowpoint', 'hotload', 'tracer', 'ricochet', 'heavy', 'salvo'],
  bolt: ['overstuffed', 'doubletap'],
  explosive: ['overpressure', 'cluster'],
  shotgun: ['doubleo', 'longshot'],
  arc: ['fifthlink', 'superconductor', 'longlead'],
  spine: ['throughandthrough', 'annealed', 'railed'],
  slug: ['sledge'],
  rime: ['deepfreeze'],
  // BLOOM OUT widens every burning patch, which is SPORE's and THORN's alike.
  // It sits under the round because that is the one you meet first.
  spore: ['bloomout'],
  tithe: ['compound', 'levy', 'lien'],

  // ---- the field ----
  // BLAST is the gateway: the mine doctrine and every other mine are behind it.
  blast: ['paired', 'quickarm', 'widemouth', 'salted', 'deepcharge', 'shrapnel'],
  snare: ['deadweight'],
  wire: ['hotwire'],
  knell: ['fourthbell'],
  thorn: [],
  lode: ['repulsor'],
  spall: ['buckshot'],
  void: ['eventhorizon'],

  // ---- the abilities ----
  abilities: ['standing', 'reflex'],
  pulse: [],
  fan: [], lance: [], well: [], prism: [], stasis: [], decoy: [], chorus: [],
};

/** Which arms hang off which category, in the order they are shown. */
const BRANCH = {
  ammo: ['bolt', 'explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  mines: ['blast'],
  // PULSE and FAN are the two the turret starts with. They are free where the
  // six below them are bought; their extra uses are not.
  abilities: ['pulse', 'fan', 'lance', 'well', 'prism', 'stasis', 'decoy', 'chorus'],
  turret: [],
};

/** The mines behind BLAST. Buying the first charge is what opens the tier. */
const BEHIND_BLAST = ['snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'];

/** Free arms: things the turret already has when the run starts. */
const FREE_ARMS = new Set(['bolt', 'pulse', 'fan']);

const UP_BY_ID = new Map(ALL_UPGRADES.map((u) => [u.id, u]));
const armLabel = (key) => (ARSENAL.find((a) => a.key === key) || {}).label
  || (ABILITIES.find((a) => a.id === key) || {}).name || key.toUpperCase();
const armIcon = (key) => (ARSENAL.find((a) => a.key === key) || {}).icon
  || (ABILITIES.find((a) => a.id === key) || {}).icon || '';
const armTone = (key) => (ARSENAL.find((a) => a.key === key) || {}).tone
  || (ABILITIES.find((a) => a.id === key) || {}).color || '#8fb6d8';

/**
 * What a round, mine or ability does, said on the row itself. A price with no
 * description is a thing you cannot decide about — the whole point of a tree
 * over a card draw is being able to read it before you commit.
 */
function armLine(key) {
  const a = ARSENAL.find((x) => x.key === key);
  if (a) return `${a.dmg ? `${a.dmg} damage. ` : ''}${a.fx || ''}`.trim();
  const b = ABILITIES.find((x) => x.id === key);
  // The ability hints are written as "NAME — what it does"; the name is
  // already the heading of the row.
  if (b) return (b.hint || '').replace(/^[A-Z ]+—\s*/, '');
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

const ROOT_TONE = { turret: '#59e0ff', ammo: '#bff4ff', mines: '#ffb347', abilities: '#c9a7ff' };
const ROOT_NAME = { turret: 'TURRET', ammo: 'AMMUNITION', mines: 'MINES', abilities: 'ABILITIES' };
const ROOT_LINE = {
  turret: 'The machine itself. Everything here is yours from the first frame.',
  ammo: 'What leaves the barrel. BOLT is loaded before you start; the rest are bought.',
  mines: 'What you leave behind. BLAST opens the tier — the other seven are behind it.',
  abilities: 'What you hold. PULSE and FAN can never be taken from you; the other six are bought.',
};

function leaf(id) {
  const u = UP_BY_ID.get(id);
  if (!u) throw new Error(`tree: no upgrade "${id}"`);
  const levels = u.levels ?? 3; // an unlimited stack is offered three deep here
  return node({
    kind: 'upgrade', id, key: id, name: u.name, line: u.line, icon: u.icon,
    levels, tone: '#9fb3c8',
    cost: COST.upgrade, step: COST.step, tiers: u.tiers || null,
  });
}

/** The second use of an ability, as a node. */
function chargeOf(key) {
  return node({
    kind: 'charge', id: `charge_${key}`, key, name: `${armLabel(key)} ×2`,
    line: 'Hold a second use of it, ready before the wait.',
    icon: armIcon(key), tone: armTone(key), cost: COST.charge,
  });
}

/** `free` marks something the turret already has: BOLT, PULSE and FAN. */
function arm(key, kind) {
  const free = FREE_ARMS.has(key);
  const kids = (UNDER[key] || []).map(leaf);
  if (kind === 'ability') kids.unshift(chargeOf(key));
  // BLAST carries the whole mine tier behind it.
  if (key === 'blast') kids.push(...BEHIND_BLAST.map((k) => arm(k, 'mine')));
  return node({
    kind: 'arm', id: free ? null : `open_${key}`, key, free,
    name: armLabel(key), line: armLine(key), icon: armIcon(key), tone: armTone(key),
    cost: free ? 0 : (kind === 'ability' ? COST.ability : COST[kind]),
    children: kids,
  });
}

const KIND = { ammo: 'round', mines: 'mine', abilities: 'ability', turret: null };

/*
 * A category is a heading and is never bought. Everything purchasable is an
 * arm or a leaf under one, which is what makes ABILITIES a peer of AMMO rather
 * than a list hanging off PULSE.
 */
export const TREE = ['turret', 'ammo', 'mines', 'abilities'].map((root) => node({
  kind: 'root', key: root, name: ROOT_NAME[root], free: true,
  tone: ROOT_TONE[root], line: ROOT_LINE[root],
  children: [
    ...(UNDER[root] || []).map(leaf),
    ...(BRANCH[root] || []).map((k) => arm(k, KIND[root])),
  ],
}));

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
