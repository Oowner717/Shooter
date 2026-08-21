/*
 * The tree.
 *
 * Everything permanent used to arrive as an AMENDMENT: three cards, take one,
 * and the rest of that roll was gone forever. That made a run a sequence of
 * accidents. A tree makes it a plan — you can see the whole machine from the
 * first minute, and every energy you bank is aimed at something you picked.
 *
 * Four branches, and three of them are already yours:
 *
 *   TURRET   the machine itself. Free.
 *   BOLT     the rack. Free, and every other round hangs off it.
 *   PULSE    the abilities. Free, and every other ability hangs off it.
 *   BLAST    the field. Bought, and every other mine hangs off it.
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
  // BOLT is the round you start with, so the whole-rack upgrades hang off it
  // alongside its own two.
  bolt: ['hollowpoint', 'hotload', 'tracer', 'ricochet', 'heavy', 'salvo',
    'overstuffed', 'doubletap'],
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
  pulse: ['standing', 'reflex'],
  fan: [], lance: [], well: [], prism: [], stasis: [], decoy: [], chorus: [],
};

/** Which unlock nodes hang off which root. */
const BRANCH = {
  bolt: ['explosive', 'shotgun', 'arc', 'spine', 'slug', 'rime', 'spore', 'tithe'],
  blast: ['snare', 'wire', 'knell', 'thorn', 'lode', 'spall', 'void'],
  // FAN is the other ability the turret starts with, so it is free where the
  // six below are bought. Its extra use is not.
  pulse: ['fan', 'lance', 'well', 'prism', 'stasis', 'decoy', 'chorus'],
  turret: [],
};

const UP_BY_ID = new Map(ALL_UPGRADES.map((u) => [u.id, u]));
const armLabel = (key) => (ARSENAL.find((a) => a.key === key) || {}).label
  || (ABILITIES.find((a) => a.id === key) || {}).name || key.toUpperCase();
const armIcon = (key) => (ARSENAL.find((a) => a.key === key) || {}).icon
  || (ABILITIES.find((a) => a.id === key) || {}).icon || '';
const armTone = (key) => (ARSENAL.find((a) => a.key === key) || {}).tone
  || (ABILITIES.find((a) => a.id === key) || {}).color || '#8fb6d8';

/**
 * A node.
 * @param kind  root | arm | upgrade | charge
 * @param id    the id it is bought as: an upgrade id, `open_<key>`, or
 *              `charge_<key>`. Roots have no id — they are never bought.
 */
function node(o) {
  return { levels: 1, cost: 0, children: [], ...o };
}

const ROOT_TONE = { turret: '#59e0ff', bolt: '#bff4ff', blast: '#ffb347', pulse: '#59e0ff' };
const ROOT_LINE = {
  turret: 'The machine. Everything here is yours from the first frame.',
  bolt: 'The rack. BOLT is loaded before you start; every other round is bought from here.',
  blast: 'The field. Buy the charge and the rest of the mines open behind it.',
  pulse: 'The hands. PULSE can never be taken from you; the rest are bought.',
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

/** `free` marks something the turret already has: FAN, and the three roots. */
function arm(key, kind, free = false) {
  const kids = (UNDER[key] || []).map(leaf);
  if (kind === 'ability') kids.unshift(chargeOf(key));
  return node({
    kind: 'arm', id: free ? null : `open_${key}`, key, free,
    name: armLabel(key), icon: armIcon(key), tone: armTone(key),
    cost: free ? 0 : (kind === 'ability' ? COST.ability : COST[kind]),
    children: kids,
  });
}

const KIND = { bolt: 'round', blast: 'mine', pulse: 'ability', turret: null };

/*
 * BLAST is the only root that is bought. It is a mine like any other and the
 * whole of the field tier sits behind it, which is what makes buying it a
 * decision rather than a formality.
 */
const BOUGHT_ROOT = { blast: COST.mine };

export const TREE = ['turret', 'bolt', 'pulse', 'blast'].map((root) => node({
  kind: 'root', key: root, name: armLabel(root), icon: armIcon(root),
  id: BOUGHT_ROOT[root] ? `open_${root}` : null,
  cost: BOUGHT_ROOT[root] || 0,
  free: !BOUGHT_ROOT[root],
  tone: ROOT_TONE[root], line: ROOT_LINE[root],
  children: [
    ...(root === 'pulse' ? [chargeOf('pulse')] : []),
    ...(UNDER[root] || []).map(leaf),
    ...(BRANCH[root] || []).map((k) => arm(k, KIND[root], k === 'fan')),
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
