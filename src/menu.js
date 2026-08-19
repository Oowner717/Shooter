// The menu. One button in the top bar opens a sheet over the bottom of the
// screen, where the thumb already is; the simulation holds while it is open.
//
// It explains rather than controls. Everything that is chosen — rounds, mines,
// the two that run on their own — is chosen on the play screen, so the sheet
// carries the two records instead: what you shoot with, and what you have
// shot. Both are built from data, so a new round or a new object is a table
// entry and no markup.

import { CODEX, codex } from './codex.js';
import { CONTROLS } from './narrative.js';
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
    this.buildAbilityStock(p);
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

  /**
   * The one place in the sheet that does something rather than explains. It is
   * not a second copy of a control — there is nowhere else to buy a charge —
   * and it is here because it is the only screen with room for a price.
   */
  buildAbilityStock(p) {
    p.appendChild(heading('ABILITIES', 'stocked, not timed'));
    const grid = document.createElement('div');
    grid.className = 'armGrid';
    this.stock = [];
    ABILITIES.forEach((def, i) => {
      const row = document.createElement('div');
      row.className = 'armRow stockRow';
      row.style.setProperty('--tone', def.color);
      row.innerHTML = `<div class="codexArt arm">${def.icon}</div>`
        + `<div class="codexBody"><div class="codexName">${def.name}</div>`
        + `<div class="codexLine">${def.hint.replace(/^[A-Z ]+ — /, '')}</div></div>`
        + (def.free
          ? '<div class="stockFree">ALWAYS</div>'
          : `<button class="stockBuy"><b class="held">0/${def.cap}</b>`
            + `<span class="price">+1 · ${def.price}</span></button>`);
      const btn = row.querySelector('.stockBuy');
      if (btn) {
        btn.addEventListener('click', () => this.game.buyCharge(i));
        this.stock.push({ i, def, btn, held: btn.querySelector('.held'), last: null, can: null });
      }
      grid.appendChild(row);
    });
    p.appendChild(grid);
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
    // the rest of the run. Both read the same table.
    for (const [k, body] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'menuKey';
      row.innerHTML = `<span>${k}</span><p>${body(ABILITIES.length)}</p>`;
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
    for (const st of this.stock || []) {
      const n = world.abilities.chargesOf(st.i);
      if (st.last !== n) {
        st.last = n;
        st.held.textContent = `${n}/${st.def.cap}`;
      }
      const can = n < st.def.cap && world.salvage >= st.def.price;
      if (st.can !== can) {
        st.can = can;
        st.btn.classList.toggle('can', can);
      }
    }
    for (const a of ARSENAL) {
      const on = a.kind === 'round' ? world.round === a.key
        : a.kind === 'mine' ? world.mine === a.key
          : !!world[a.key];
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
