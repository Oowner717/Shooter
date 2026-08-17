// The menu. One button in the top bar opens a sheet over the bottom of the
// screen, where the thumb already is; the simulation holds while it is open, so
// changing a loadout mid-wave costs nothing.
//
// Everything in it is built from data — the SECTIONS table below and CODEX —
// so a new round, a new assist or a new object needs an entry and nothing else.
// The cells keep the ids the rest of the interface already looks up, so adding
// the menu did not change how a toggle is read or set.

import { CODEX, codex } from './codex.js';
import { ABILITIES } from './abilities.js';
import { BUILD } from './config.js';

const $ = (id) => document.getElementById(id);

/**
 * The quick-selection grid. `kind` decides which handler a cell calls, and
 * `key` is what gets passed. Add a row and it appears.
 */
export const SECTIONS = [
  {
    title: 'ROUNDS',
    note: 'one at a time',
    kind: 'round',
    cells: [
      { key: 'standard', id: 'tgStandard', label: 'STANDARD', sub: 'baseline' },
      { key: 'explosive', id: 'tgExplosive', label: 'HE', sub: 'detonates · half rate' },
      { key: 'shotgun', id: 'tgShotgun', label: 'SHOT', sub: 'five pellets · close' },
      { key: 'arc', id: 'tgArc', label: 'ARC', sub: 'jumps on · four links' },
      { key: 'barb', id: 'tgBarb', label: 'BARB', sub: 'sinks in · keeps biting' },
    ],
  },
  {
    title: 'ASSISTS',
    note: 'any combination',
    kind: 'auto',
    cells: [
      { key: 'autoAim', id: 'tgAutoAim', label: 'AIM', sub: 'tracks the nearest breach' },
      { key: 'autoFire', id: 'tgAutoFire', label: 'FIRE', sub: 'shoots where it points' },
      { key: 'autoMine', id: 'tgAutoMine', label: 'MINE', sub: 'lays blast mines' },
      { key: 'autoSnare', id: 'tgAutoSnare', label: 'SNARE', sub: 'lays pinning traps' },
    ],
  },
];

const TABS = [
  { id: 'loadout', label: 'LOADOUT' },
  { id: 'codex', label: 'OBJECTS' },
  { id: 'system', label: 'SYSTEM' },
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('menu'),
      tabs: $('menuTabs'),
      panels: $('menuPanels'),
      btn: $('menuBtn'),
      scrim: $('menuScrim'),
      close: $('menuClose'),
      found: $('codexFound'),
    };
    this.open = false;
    this.tab = 'loadout';
    this.cells = new Map(); // key -> element, for the active-state sync
    this.codexCells = new Map();
    this.lastFound = -1;

    this.buildTabs();
    this.buildLoadout();
    this.buildCodex();
    this.buildSystem();
    this.show('loadout');

    this.el.btn.addEventListener('click', () => this.toggle());
    this.el.close.addEventListener('click', () => this.setOpen(false));
    this.el.scrim.addEventListener('click', () => this.setOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.setOpen(false);
    });
  }

  // ------------------------------------------------------------------ frame

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(on) {
    if (this.open === on) return;
    this.open = on;
    this.el.root.classList.toggle('open', on);
    this.el.scrim.classList.toggle('on', on);
    this.el.btn.classList.toggle('on', on);
    document.body.classList.toggle('menuOpen', on);
    if (on) this.syncCodex();
  }

  buildTabs() {
    const frag = document.createDocumentFragment();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'menuTab';
      b.dataset.tab = t.id;
      b.textContent = t.label;
      b.addEventListener('click', () => this.show(t.id));
      frag.appendChild(b);
    }
    this.el.tabs.appendChild(frag);
  }

  show(tab) {
    this.tab = tab;
    for (const b of this.el.tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of this.el.panels.children) p.hidden = p.dataset.panel !== tab;
    if (tab === 'codex') this.syncCodex();
  }

  panel(id, cls = '') {
    const p = document.createElement('div');
    p.className = `menuPanel ${cls}`.trim();
    p.dataset.panel = id;
    this.el.panels.appendChild(p);
    return p;
  }

  // ---------------------------------------------------------------- loadout

  buildLoadout() {
    const p = this.panel('loadout');
    for (const sec of SECTIONS) {
      p.appendChild(heading(sec.title, sec.note));
      const grid = document.createElement('div');
      grid.className = 'menuGrid';
      for (const c of sec.cells) {
        const b = document.createElement('button');
        b.className = 'menuCell';
        b.id = c.id;
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<span class="cellName">${c.label}</span><span class="cellSub">${c.sub}</span>`;
        b.addEventListener('click', () => {
          if (sec.kind === 'round') this.game.toggleRound(c.key);
          else this.game.toggleAuto(c.key);
        });
        grid.appendChild(b);
        this.cells.set(c.key, b);
      }
      p.appendChild(grid);
    }
  }

  // ------------------------------------------------------------------ codex

  buildCodex() {
    const p = this.panel('codex', 'codex');
    p.appendChild(heading('OBJECTS', 'recorded on first kill'));
    const grid = document.createElement('div');
    grid.className = 'codexGrid';
    for (const e of CODEX) {
      const cell = document.createElement('div');
      cell.className = `codexCell${e.boss ? ' boss' : ''}`;
      cell.innerHTML = `<div class="codexArt"><canvas width="72" height="72"></canvas></div>`
        + `<div class="codexBody"><div class="codexName"></div><div class="codexLine"></div></div>`;
      grid.appendChild(cell);
      this.codexCells.set(e.id, cell);
    }
    p.appendChild(grid);
  }

  /** Redacted until it has been destroyed once. */
  syncCodex() {
    if (this.lastFound === codex.found) return;
    this.lastFound = codex.found;
    this.el.found.textContent = `${codex.found}/${codex.total}`;
    for (const e of CODEX) {
      const cell = this.codexCells.get(e.id);
      const known = codex.has(e.id);
      cell.classList.toggle('locked', !known);
      cell.querySelector('.codexName').textContent = known ? e.name : redact(e.name);
      cell.querySelector('.codexLine').textContent = known ? e.line : 'No record. Destroy one.';
      const c = cell.querySelector('canvas');
      if (known && !c.dataset.drawn) {
        c.dataset.drawn = '1';
        drawSpecimen(c, e.id);
      } else if (!known && c.dataset.drawn) {
        delete c.dataset.drawn;
        c.getContext('2d').clearRect(0, 0, c.width, c.height);
      }
    }
  }

  // ----------------------------------------------------------------- system

  buildSystem() {
    const p = this.panel('system');
    p.appendChild(heading('SYSTEM', ''));
    const grid = document.createElement('div');
    grid.className = 'menuGrid';
    const g = this.game;
    const rows = [
      ['SOUND', 'on or off', () => g.toggleSound(), () => g.soundOn],
      ['RESET SIMULATION', 'start the session again', () => { this.setOpen(false); g.restart(); }],
      ['DEBUG', 'developer panel', () => { this.setOpen(false); g.hud.toggleDebug(true); }],
    ];
    for (const [label, sub, run, state] of rows) {
      const b = document.createElement('button');
      b.className = 'menuCell';
      b.innerHTML = `<span class="cellName">${label}</span><span class="cellSub">${sub}</span>`;
      b.addEventListener('click', () => { run(); this.syncSystem(); });
      if (state) { b.dataset.stateful = '1'; this.soundCell = b; this.soundState = state; }
      grid.appendChild(b);
    }
    p.appendChild(grid);

    const abil = document.createElement('div');
    abil.className = 'menuNote';
    abil.textContent = `${ABILITIES.length} abilities · one tap each · no cost, no upgrades`;
    p.appendChild(abil);

    const foot = document.createElement('div');
    foot.className = 'menuNote dim';
    foot.textContent = `SESSION 7749 · BUILD ${BUILD}`;
    p.appendChild(foot);
    this.syncSystem();
  }

  syncSystem() {
    if (!this.soundCell) return;
    this.soundCell.classList.toggle('on', !!this.soundState());
    this.soundCell.setAttribute('aria-pressed', String(!!this.soundState()));
  }

  // -------------------------------------------------------------- live sync

  /** Called every frame; cheap because every write is diffed. */
  sync(world) {
    for (const sec of SECTIONS) {
      for (const c of sec.cells) {
        const on = sec.kind === 'round' ? world.round === c.key : !!world[c.key];
        const el = this.cells.get(c.key);
        if (el._on === on) continue;
        el._on = on;
        el.classList.toggle('on', on);
        el.setAttribute('aria-pressed', String(on));
      }
    }
  }
}

function heading(title, note) {
  const h = document.createElement('div');
  h.className = 'menuHead';
  h.innerHTML = `<span>${title}</span>${note ? `<em>${note}</em>` : ''}`;
  return h;
}

const BLOCKS = '▚▞▜▙▟▛';
function redact(name) {
  let out = '';
  for (let i = 0; i < name.length; i++) out += BLOCKS[i % BLOCKS.length];
  return out;
}

/**
 * A specimen portrait, drawn once per entry with the same routines the field
 * uses, so the glossary can never drift out of step with the thing itself.
 */
function drawSpecimen(canvas, id) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.translate(w / 2, w / 2);
  drawCodexShape(ctx, id, w * 0.34);
  ctx.restore();
}

// Imported lazily to keep the module graph acyclic: enemies.js does not know
// about the interface, and the interface only needs the one function.
let shapeFn = null;
export function registerCodexShape(fn) {
  shapeFn = fn;
}

function drawCodexShape(ctx, id, r) {
  if (shapeFn) shapeFn(ctx, id, r);
}
