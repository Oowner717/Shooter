// Units: the era-2 works, and what they send out.
//
// Build 398. The two lots beside the turret (yard.js, kind 'works') are
// buildings you can buy once the turret has taken its second form. Each
// building, once bought, keeps sending the unit assigned to it out onto the
// field, where it hovers in the middle / upper-middle band and fights. The
// UNITS screen (hud.js) buys buildings, buys unit types and assigns them, and
// AUTO SEND switches the sending on and off.
//
// State is ONE object, `world.squad`, deliberately not an array on the world
// (the world's arrays are partitioned into FIELD_LISTS / RUN_LISTS in game.js
// and a regress case asserts that partition is total).
//
// Imports config, util, fx and yard only -- yard imports nothing that imports
// this, so the module graph stays acyclic for bundle.mjs.

import { CFG, MB, fmtBytes } from './config.js';
import { TAU, clamp, rand, rgba, drawGlow } from './util.js';
import { spark, ring } from './fx.js';
import { shielded, yardHold } from './yard.js';

/*
 * ---- the ten units ---------------------------------------------------------
 *
 * Distances and speeds are era-1 world units and are multiplied by
 * `CFG.scale` where read, like everything else the turret side owns. Damage
 * is per hit and is multiplied by the turret's own damage upgrades
 * (`world.up.damage`), so units keep pace with the gun they fight beside.
 *
 *   role  'attack' hovers in the upper-middle band, 'defend' in the middle.
 *   cap   how many one building keeps out at once.
 *   every seconds between sends from one building.
 */
export const UNITS = [
  { id: 'drone', name: 'DRONE', cost: 0, color: '#7fe6c0', shape: 'tri', role: 'attack',
    hp: 60, dmg: 14, rate: 2.5, range: 300, speed: 260, cap: 3, every: 4,
    line: 'Cheap and steady. Plinks at whatever comes near.' },
  { id: 'sentry', name: 'SENTRY', cost: MB(1.5), color: '#9fd8ff', shape: 'square', role: 'defend',
    hp: 150, dmg: 18, rate: 2, range: 340, speed: 200, cap: 3, every: 5,
    line: 'Tougher. Holds the middle of the field, close to you.' },
  { id: 'lancer', name: 'LANCER', cost: MB(3), color: '#ffd27f', shape: 'arrow', role: 'attack',
    hp: 70, dmg: 90, rate: 0.6, range: 620, speed: 220, cap: 2, every: 6,
    line: 'Long reach. One slow shot that hits hard.' },
  { id: 'gnat', name: 'GNAT', cost: MB(4), color: '#c8ff7f', shape: 'dot', role: 'attack',
    hp: 25, dmg: 6, rate: 6, range: 220, speed: 380, cap: 6, every: 1.5,
    line: 'Tiny and fast, sent out in numbers.' },
  { id: 'arclet', name: 'ARCLET', cost: MB(6), color: '#b49cff', shape: 'diamond', role: 'attack',
    hp: 80, dmg: 26, rate: 1.5, range: 320, speed: 240, cap: 3, every: 5, chain: 2,
    line: 'Every shot jumps on to two more targets.' },
  { id: 'mortar', name: 'MORTAR', cost: MB(8), color: '#ff9f6b', shape: 'hex', role: 'attack',
    hp: 110, dmg: 40, rate: 0.8, range: 460, speed: 180, cap: 2, every: 6, splash: 90,
    line: 'Bursts over a crowd, hurting everything nearby.' },
  { id: 'rime', name: 'RIME', cost: MB(11), color: '#8fe8ff', shape: 'star', role: 'defend',
    hp: 90, dmg: 12, rate: 2, range: 360, speed: 220, cap: 3, every: 5, slow: 0.55,
    line: 'Chills what it hits and slows it right down.' },
  { id: 'hunter', name: 'HUNTER', cost: MB(15), color: '#ff6b8a', shape: 'wing', role: 'attack',
    hp: 50, dmg: 260, rate: 0, range: 700, speed: 420, cap: 3, every: 3, dive: true, splash: 70,
    line: 'Picks a target and dives straight into it.' },
  { id: 'aegis', name: 'AEGIS', cost: MB(20), color: '#e8f0ff', shape: 'ring', role: 'defend',
    hp: 650, dmg: 10, rate: 2, range: 260, speed: 160, cap: 2, every: 8, grind: 120,
    line: 'A heavy guardian. Grinds down whatever touches it.' },
  { id: 'seraph', name: 'SERAPH', cost: MB(30), color: '#fff2a8', shape: 'cross', role: 'attack',
    hp: 260, dmg: 55, rate: 3, range: 520, speed: 300, cap: 2, every: 6,
    line: 'The best of them. Fast, far-reaching, hard to bring down.' },
];
export const UNIT_BY_ID = new Map(UNITS.map((u) => [u.id, u]));

/** What each building costs, west then east. */
export const BUILDING_COST = [MB(3), MB(5)];
export const BUILDING_NAME = ['WEST WORKS', 'EAST WORKS'];

const R = 13; // a unit's radius, era-1 units
const CONTACT_DPS = 40; // what touching a hostile costs a unit, per second

/** A fresh squad: nothing built, DRONE owned, sending on. */
export function freshSquad() {
  return {
    built: [false, false],
    assign: ['drone', 'drone'],
    owned: ['drone'],
    auto: true,
    list: [],
    timers: [1, 1],
    beams: [],
    seq: 0,
  };
}

/** A saved squad back (save.js writes built/assign/owned/auto), defensively:
 * a save from before build 398 has none of it. */
export function squadRestore(d) {
  const q = freshSquad();
  if (!d || typeof d !== 'object') return q;
  if (Array.isArray(d.built)) q.built = [0, 1].map((i) => !!d.built[i]);
  if (Array.isArray(d.owned)) {
    q.owned = [...new Set(['drone', ...d.owned.filter((id) => UNIT_BY_ID.has(id))])];
  }
  if (Array.isArray(d.assign)) {
    q.assign = [0, 1].map((i) => (q.owned.includes(d.assign[i]) ? d.assign[i] : 'drone'));
  }
  q.auto = d.auto !== false;
  return q;
}

/** Buildings and unit buying are open once the turret has its second form. */
export function unitsOpen(world) {
  return world.era === 2 && !world.sandbox;
}

/** The works lots, from the yard, or [] when there is no yard. */
function works(world) {
  const a = world.yard;
  if (!a || !a.lots) return [];
  return a.lots.filter((l) => l.kind === 'works');
}

// ---- purchases -------------------------------------------------------------
// Each returns 'ok', 'poor', 'owned', 'locked' or 'no'.

export function buyBuilding(world, i) {
  const q = world.squad;
  if (!unitsOpen(world)) return 'locked';
  if (i < 0 || i > 1) return 'no';
  if (q.built[i]) return 'owned';
  const price = BUILDING_COST[i];
  if (world.bytes < price) return 'poor';
  world.bytes -= price;
  q.built[i] = true;
  q.timers[i] = 0.6;
  const l = works(world)[i];
  if (l) ring(l.x, l.y, l.hw * 0.4, l.hw * 3.2, 0.6, '#8fdcff', 2);
  return 'ok';
}

export function buyUnit(world, id) {
  const q = world.squad;
  const u = UNIT_BY_ID.get(id);
  if (!u) return 'no';
  if (!unitsOpen(world)) return 'locked';
  if (q.owned.includes(id)) return 'owned';
  if (world.bytes < u.cost) return 'poor';
  world.bytes -= u.cost;
  q.owned.push(id);
  return 'ok';
}

export function assignUnit(world, i, id) {
  const q = world.squad;
  if (i < 0 || i > 1 || !q.owned.includes(id)) return 'no';
  q.assign[i] = id;
  return 'ok';
}

export function setAutoSend(world, on) {
  world.squad.auto = !!on;
  return world.squad.auto;
}

/** How many of one building's units are out. */
export function outFrom(world, i) {
  let n = 0;
  for (const m of world.squad.list) if (m.from === i && !m.dead) n++;
  return n;
}

// ---- the field -------------------------------------------------------------

/** The band units hover in: middle and upper-middle of the open field. */
function band(world) {
  const top = Math.max(yardHold(world), world.portal ? world.portal.rim || 0 : 0);
  const bottom = world.shooter.y;
  return { top, bottom, span: Math.max(1, bottom - top) };
}

function spawn(world, i) {
  const q = world.squad;
  const l = works(world)[i];
  const u = UNIT_BY_ID.get(q.assign[i]) || UNITS[0];
  if (!l) return;
  q.list.push({
    id: q.seq++, type: u.id, from: i,
    x: l.x, y: l.y - l.hh, vx: 0, vy: -120 * CFG.scale,
    hp: u.hp, cd: rand(0.2, 0.6), t: rand(0, 10), target: null, dead: false,
    lane: rand(0, 1),
  });
  ring(l.x, l.y - l.hh, 2, l.hw * 1.4, 0.35, u.color, 1.6);
}

/** Where a unit wants to be: its slot in the band. */
function station(world, m, u, idx, count) {
  const B = band(world);
  const frac = u.role === 'defend' ? 0.52 : 0.3;
  const y = B.top + B.span * (frac + (m.lane - 0.5) * 0.12) + Math.sin(m.t * 1.6) * 8 * CFG.scale;
  const margin = 60 * CFG.scale;
  const x = margin + ((idx + 0.5) / Math.max(1, count)) * (world.width - margin * 2)
    + Math.cos(m.t * 1.1) * 10 * CFG.scale;
  return { x, y };
}

function legal(world, e) {
  return !e.dead && !e.staged && !e.spent && !e.fizzle && !e.harmless && !shielded(world, e);
}

function nearest(world, x, y, reach, skip) {
  let best = null;
  let bd = reach * reach;
  for (const e of world.enemies) {
    if (skip && skip.has(e)) continue;
    if (!legal(world, e)) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function hit(world, m, u, e, dmg) {
  const dx = e.x - m.x;
  const dy = e.y - m.y;
  const d = Math.hypot(dx, dy) || 1;
  e.applyDamage(world, dmg, dx / d, dy / d, 40, 0, 0, false, 'unit');
  if (u.slow && !e.dead) { e.vx *= u.slow; e.vy *= u.slow; }
}

function blast(world, x, y, r, dmg, color) {
  ring(x, y, r * 0.2, r, 0.35, color, 2);
  for (const e of world.enemies) {
    if (!legal(world, e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > r + e.r) continue;
    e.applyDamage(world, dmg * (1 - 0.5 * clamp(d / r, 0, 1)), (e.x - x) / (d || 1), (e.y - y) / (d || 1), 60, 0, 0, false, 'unit');
  }
}

function fire(world, m, u, e) {
  const q = world.squad;
  const dmg = u.dmg * (world.up.damage || 1);
  q.beams.push({ x0: m.x, y0: m.y, x1: e.x, y1: e.y, t: 0.12, color: u.color });
  if (u.splash) blast(world, e.x, e.y, u.splash * CFG.scale, dmg, u.color);
  else hit(world, m, u, e, dmg);
  spark(e.x, e.y, rand(-80, 80), rand(-80, 80), u.color, 0.25, 1.8);
  if (u.chain) {
    const seen = new Set([e]);
    let from = e;
    for (let k = 0; k < u.chain; k++) {
      const n = nearest(world, from.x, from.y, 160 * CFG.scale, seen);
      if (!n) break;
      seen.add(n);
      q.beams.push({ x0: from.x, y0: from.y, x1: n.x, y1: n.y, t: 0.12, color: u.color });
      hit(world, from, u, n, dmg * 0.7);
      from = n;
    }
  }
}

/** One step of the whole squad. Called from Game.update after the yard. */
export function updateUnits(world, dt) {
  const q = world.squad;
  if (!q) return;
  for (const b of q.beams) b.t -= dt;
  if (q.beams.length) q.beams = q.beams.filter((b) => b.t > 0);
  if (!unitsOpen(world) || !world.yard) {
    if (q.list.length) q.list.length = 0;
    return;
  }

  // Sending.
  for (let i = 0; i < 2; i++) {
    if (!q.built[i] || !q.auto) continue;
    const u = UNIT_BY_ID.get(q.assign[i]) || UNITS[0];
    if (outFrom(world, i) >= u.cap) { q.timers[i] = Math.min(q.timers[i], u.every); continue; }
    q.timers[i] -= dt;
    if (q.timers[i] <= 0) {
      spawn(world, i);
      q.timers[i] = u.every;
    }
  }

  // Order the live ones by type so a station is stable while units come and go.
  const live = q.list.filter((m) => !m.dead);
  const k = CFG.scale;
  live.forEach((m, idx) => {
    const u = UNIT_BY_ID.get(m.type) || UNITS[0];
    m.t += dt;
    if (m.target && !legal(world, m.target)) m.target = null;
    if (!m.target || (m.t % 0.5) < dt) m.target = nearest(world, m.x, m.y, u.range * k) || m.target;

    let goal;
    if (u.dive && m.target) goal = { x: m.target.x, y: m.target.y };
    else goal = station(world, m, u, idx, live.length);

    // Steer: ease toward the goal, capped at the unit's speed.
    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const top = u.speed * k;
    const want = Math.min(top, d * 3);
    const ax = (dx / d) * want - m.vx;
    const ay = (dy / d) * want - m.vy;
    const turn = Math.min(1, dt * (u.dive ? 6 : 3.5));
    m.vx += ax * turn;
    m.vy += ay * turn;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    const r = R * k;
    // Contact both ways: hostiles hurt units, and AEGIS / HUNTER hurt back.
    for (const e of world.enemies) {
      if (e.dead || e.staged || e.harmless || e.spent || e.fizzle) continue;
      const rr = r + e.r;
      if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > rr * rr) continue;
      if (u.dive && e === m.target) {
        blast(world, m.x, m.y, (u.splash || 60) * k, u.dmg * (world.up.damage || 1), u.color);
        m.dead = true;
        break;
      }
      m.hp -= CONTACT_DPS * dt * Math.max(1, e.r / 20);
      if (u.grind && legal(world, e)) {
        e.applyDamage(world, u.grind * dt * (world.up.damage || 1), 0, -1, 0, 0, 0, false, 'unit');
      }
    }
    if (m.dead) return;

    // Shooting.
    if (u.rate > 0) {
      m.cd -= dt;
      if (m.cd <= 0 && m.target) {
        const tdx = m.target.x - m.x;
        const tdy = m.target.y - m.y;
        if (tdx * tdx + tdy * tdy <= (u.range * k) ** 2) {
          fire(world, m, u, m.target);
          m.cd = 1 / u.rate;
        }
      }
    }

    if (m.hp <= 0) {
      m.dead = true;
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * TAU;
        spark(m.x, m.y, Math.cos(a) * rand(60, 160), Math.sin(a) * rand(60, 160), u.color, 0.35, 1.8);
      }
    }
  });
  if (q.list.some((m) => m.dead)) q.list = q.list.filter((m) => !m.dead);
}

// ---- drawing ---------------------------------------------------------------

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  switch (shape) {
    case 'tri':
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.87, r * 0.6); ctx.lineTo(-r * 0.87, r * 0.6); ctx.closePath();
      break;
    case 'square':
      ctx.rect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      break;
    case 'arrow':
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.6, r * 0.8); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.6, r * 0.8); ctx.closePath();
      break;
    case 'dot':
      ctx.arc(0, 0, r * 0.55, 0, TAU);
      break;
    case 'diamond':
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'wing':
      ctx.moveTo(0, -r); ctx.lineTo(r, r * 0.7); ctx.lineTo(0, r * 0.2); ctx.lineTo(-r, r * 0.7); ctx.closePath();
      break;
    case 'ring':
      ctx.arc(0, 0, r * 1.1, 0, TAU);
      ctx.moveTo(r * 0.55, 0);
      ctx.arc(0, 0, r * 0.55, 0, TAU, true);
      break;
    case 'cross':
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 0.3, -r * 0.3); ctx.lineTo(r * 1.2, 0); ctx.lineTo(r * 0.3, r * 0.3);
      ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.3, r * 0.3); ctx.lineTo(-r * 1.2, 0); ctx.lineTo(-r * 0.3, -r * 0.3);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r, 0, TAU);
  }
}

/** An SVG of a unit's shape, for the UNITS screen. */
export function unitIcon(u, size = 22) {
  const c = size / 2;
  const r = size * 0.36;
  const pts = (list) => list.map(([x, y]) => `${(c + x * r).toFixed(1)},${(c + y * r).toFixed(1)}`).join(' ');
  let body;
  switch (u.shape) {
    case 'tri': body = `<polygon points="${pts([[0, -1], [0.87, 0.6], [-0.87, 0.6]])}"/>`; break;
    case 'square': body = `<rect x="${c - r * 0.75}" y="${c - r * 0.75}" width="${r * 1.5}" height="${r * 1.5}"/>`; break;
    case 'arrow': body = `<polygon points="${pts([[0, -1.2], [0.6, 0.8], [0, 0.4], [-0.6, 0.8]])}"/>`; break;
    case 'dot': body = `<circle cx="${c}" cy="${c}" r="${r * 0.55}"/>`; break;
    case 'diamond': body = `<polygon points="${pts([[0, -1], [0.7, 0], [0, 1], [-0.7, 0]])}"/>`; break;
    case 'hex': body = `<polygon points="${pts([0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * Math.PI / 3 + Math.PI / 6), Math.sin(i * Math.PI / 3 + Math.PI / 6)]))}"/>`; break;
    case 'star': body = `<polygon points="${pts([...Array(10)].map((_, i) => { const a = (i / 10) * TAU - Math.PI / 2; const k = i % 2 ? 0.45 : 1; return [Math.cos(a) * k, Math.sin(a) * k]; }))}"/>`; break;
    case 'wing': body = `<polygon points="${pts([[0, -1], [1, 0.7], [0, 0.2], [-1, 0.7]])}"/>`; break;
    case 'ring': body = `<circle cx="${c}" cy="${c}" r="${r * 1.0}" fill="none" stroke-width="${r * 0.5}"/>`; break;
    case 'cross': body = `<polygon points="${pts([[0, -1.2], [0.3, -0.3], [1.2, 0], [0.3, 0.3], [0, 1.2], [-0.3, 0.3], [-1.2, 0], [-0.3, -0.3]])}"/>`; break;
    default: body = `<circle cx="${c}" cy="${c}" r="${r}"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" fill="${u.color}" stroke="${u.color}" style="color:${u.color}">${body}</svg>`;
}

/** The works: an outline with a price before purchase, a building after. */
export function drawBuildings(ctx, world, mood) {
  if (!unitsOpen(world) || !world.squad) return;
  const q = world.squad;
  const hl = CFG.hairline;
  const k = CFG.scale;
  const lots = works(world);
  ctx.save();
  lots.forEach((l, i) => {
    const u = UNIT_BY_ID.get(q.assign[i]) || UNITS[0];
    const f = l.refused || 0;
    if (!q.built[i]) {
      ctx.setLineDash([5 * k, 5 * k]);
      ctx.lineWidth = hl * (1.4 + f * 1.8);
      ctx.strokeStyle = rgba(mood.line, 0.4 + f * 0.5);
      ctx.strokeRect(l.x - l.hw, l.y - l.hh, l.hw * 2, l.hh * 2);
      ctx.setLineDash([]);
      const label = fmtBytes(BUILDING_COST[i]);
      const px = Math.max(9, 10 / CFG.zoom);
      ctx.font = `${px}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const afford = world.bytes >= BUILDING_COST[i];
      ctx.fillStyle = rgba(afford ? '#7fe6c0' : mood.line, afford ? 0.9 : 0.55);
      ctx.fillText(label, l.x, l.y);
      return;
    }
    // A built works: a block, a roof, a door lit in the colour of what it sends.
    const bw = l.hw;
    const bh = l.hh * 0.75;
    ctx.fillStyle = 'rgba(8,16,28,0.92)';
    ctx.strokeStyle = rgba(u.color, 0.85);
    ctx.lineWidth = hl * 1.6;
    ctx.beginPath();
    ctx.moveTo(l.x - bw, l.y + l.hh);
    ctx.lineTo(l.x - bw, l.y - bh * 0.4);
    ctx.lineTo(l.x, l.y - l.hh);
    ctx.lineTo(l.x + bw, l.y - bh * 0.4);
    ctx.lineTo(l.x + bw, l.y + l.hh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The send clock: an arc round the door that fills until the next one.
    const ready = q.auto ? 1 - clamp(q.timers[i] / u.every, 0, 1) : 0;
    const full = outFrom(world, i) >= u.cap;
    ctx.save();
    ctx.translate(l.x, l.y + l.hh * 0.15);
    ctx.fillStyle = rgba(u.color, q.auto ? 0.9 : 0.35);
    ctx.strokeStyle = ctx.fillStyle;
    shapePath(ctx, u.shape, l.hw * 0.32);
    if (u.shape === 'ring') ctx.fill('evenodd'); else ctx.fill();
    ctx.lineWidth = hl * 1.4;
    ctx.strokeStyle = rgba(u.color, 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, l.hw * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * (full ? 1 : ready));
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

/** The units themselves, and their shots. Drawn with the friendly layer. */
export function drawUnits(ctx, world) {
  const q = world.squad;
  if (!q || (!q.list.length && !q.beams.length)) return;
  const k = CFG.scale;
  const hl = CFG.hairline;
  ctx.save();
  for (const b of q.beams) {
    ctx.strokeStyle = rgba(b.color, clamp(b.t / 0.12, 0, 1) * 0.85);
    ctx.lineWidth = hl * 2;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y0);
    ctx.lineTo(b.x1, b.y1);
    ctx.stroke();
  }
  for (const m of q.list) {
    const u = UNIT_BY_ID.get(m.type) || UNITS[0];
    const r = R * k;
    drawGlow(ctx, u.color, m.x, m.y, r * 2.6, 0.28);
    ctx.save();
    ctx.translate(m.x, m.y);
    const ang = m.target ? Math.atan2(m.target.y - m.y, m.target.x - m.x) + Math.PI / 2 : 0;
    ctx.rotate(ang);
    ctx.fillStyle = rgba(u.color, 0.92);
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    ctx.lineWidth = hl;
    shapePath(ctx, u.shape, r);
    if (u.shape === 'ring') ctx.fill('evenodd'); else ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Health, once it has been touched.
    if (m.hp < u.hp) {
      const w = r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(m.x - w / 2, m.y + r * 1.4, w, 3 * k);
      ctx.fillStyle = rgba(u.color, 0.9);
      ctx.fillRect(m.x - w / 2, m.y + r * 1.4, w * clamp(m.hp / u.hp, 0, 1), 3 * k);
    }
  }
  ctx.restore();
}
