// The menu. One button in the top bar opens a sheet over the bottom of the
// screen, where the thumb already is; the simulation holds while it is open.
//
// It explains rather than controls. Everything that is chosen — rounds, mines,
// the two that run on their own — is chosen on the play screen, so the sheet
// carries the two records instead: what you shoot with, and what you have
// shot. Both are built from data, so a new round or a new object is a table
// entry and no markup.

import { CODEX, codex } from './codex.js';
import { ARSENAL, ARSENAL_GROUPS } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { BUILD } from './config.js';

const $ = (id) => document.getElementById(id);

const TABS = [
  { id: 'arsenal', label: 'ARSENAL' },
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
    this.tab = 'arsenal';
    this.cells = new Map(); // key -> element, for the active-state sync
    this.codexCells = new Map();
    this.lastFound = -1;

    this.buildTabs();
    this.buildArsenal();
    this.buildCodex();
    this.buildSystem();
    this.show('arsenal');

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
    // The found count is about the glossary; on the other tabs it is a number
    // with nothing to belong to.
    this.el.found.classList.toggle('show', tab === 'codex');
    if (tab === 'codex') this.syncCodex();
  }

  panel(id, cls = '') {
    const p = document.createElement('div');
    p.className = `menuPanel ${cls}`.trim();
    p.dataset.panel = id;
    this.el.panels.appendChild(p);
    return p;
  }

  // ---------------------------------------------------------------- arsenal

  /**
   * A reference, not a rack. The strip on the play screen is where a round or
   * a mine is chosen; this is the only place the one-line reason for choosing
   * it is written down, and it lights to match whatever is loaded right now.
   */
  buildArsenal() {
    const p = this.panel('arsenal', 'codex');
    for (const g of ARSENAL_GROUPS) {
      p.appendChild(heading(g.title, g.note));
      const grid = document.createElement('div');
      grid.className = 'armGrid';
      for (const a of ARSENAL.filter((x) => x.group === g.id)) {
        const row = document.createElement('div');
        row.className = 'armRow';
        if (a.tone) row.style.setProperty('--tone', a.tone);
        row.innerHTML = `<div class="codexArt arm">${a.icon}</div>`
          + `<div class="codexBody"><div class="codexName">${a.label}</div>`
          + `<div class="codexLine">${a.line}</div></div>`;
        grid.appendChild(row);
        this.cells.set(a.key, row);
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

    p.appendChild(heading('CONTROLS', 'the whole of it'));
    const keys = document.createElement('div');
    keys.className = 'menuKeys';
    // The only other place these appear is the title screen, which is gone for
    // the rest of the run.
    for (const [k, v] of [
      ['LEVER', 'hold the grip under the turret and swing. The barrel is the far end of the same rod, so it goes the opposite way — and fires on its own.'],
      ['TAP', 'anywhere ahead of the turret and the shots go there instead. Hold to keep firing.'],
      ['ABILITIES', `${ABILITIES.length} along the bottom edge. One tap each. Nothing to spend or upgrade; each comes back on its own.`],
      ['CONTACT', 'does not kill you. It breaks up the feed you aim through, and it stays broken until you destroy what caused it.'],
    ]) {
      const row = document.createElement('div');
      row.className = 'menuKey';
      row.innerHTML = `<span>${k}</span><p>${v}</p>`;
      keys.appendChild(row);
    }
    p.appendChild(keys);

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
    for (const a of ARSENAL) {
      const on = a.kind === 'round' ? world.round === a.key : !!world[a.key];
      const el = this.cells.get(a.key);
      if (!el || el._on === on) continue;
      el._on = on;
      el.classList.toggle('on', on);
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
