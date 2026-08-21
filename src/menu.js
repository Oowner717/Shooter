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
import { ARSENAL, ARSENAL_GROUPS, specRows } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { VOLUME_STEPS } from './audio.js';
import { BUILD, REV } from './config.js';
import { TREE, priceOf } from './tree.js';

const $ = (id) => document.getElementById(id);

const TABS = [
  { id: 'tree', label: 'UPGRADES' },
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
    this.tab = 'tree';
    this.cells = new Map(); // key -> element, for the active-state sync
    this.codexCells = new Map();
    this.lastFound = -1;

    this.buildTabs();
    this.buildTree();
    this.buildArsenal();
    this.buildCodex();
    this.buildSystem();
    this.show('tree');

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
    if (on) { this.syncCodex(); this.syncTree(); }
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
    if (tab === 'tree') this.syncTree();
  }

  panel(id, cls = '') {
    const p = document.createElement('div');
    p.className = `menuPanel ${cls}`.trim();
    p.dataset.panel = id;
    this.el.panels.appendChild(p);
    return p;
  }

  // ------------------------------------------------------------------- tree

  /*
   * Everything permanent, laid out as what it is: a tree. Four branches, three
   * of them already yours, and every node behind the one above it.
   *
   * It is an indented outline rather than a drawn 2D graph. Eighty nodes on a
   * 390px screen is the constraint, and an outline is the shape that survives
   * it — a row can be read at a glance, the rail down the left says what hangs
   * off what, and a branch that is closed takes one line instead of fourteen.
   */
  buildTree() {
    const p = this.panel('tree', 'tree');
    this.treeRows = [];
    const head = document.createElement('div');
    head.className = 'treeHead';
    head.innerHTML = '<span class="treeHeadName">ENERGY</span>'
      + '<span class="treeNext" id="treeNext"></span>'
      + '<b id="treeBank">0</b>';
    p.appendChild(head);
    this.el.treeBank = head.querySelector('#treeBank');
    this.el.treeNext = head.querySelector('#treeNext');

    for (const root of TREE) {
      p.appendChild(this.treeNode(root, 0));
    }
  }

  /** One row, plus its children under it. Recursive; depth drives the indent. */
  treeNode(n, depth) {
    const wrap = document.createElement('div');
    wrap.className = `treeBranch d${Math.min(depth, 3)}`;
    if (n.tone) wrap.style.setProperty('--tone', n.tone);

    const row = document.createElement('button');
    row.className = `treeRow k-${n.kind}`;
    row.type = 'button';
    // A level meter, not a fraction. Three states have to be told apart at a
    // glance — nothing bought, part bought, full — and "1/3" reads as a label
    // where a row of filled pips reads as progress. Single-level nodes get no
    // meter at all: there is nothing to be part-way through.
    const max = n.levels || 1;
    const pips = max > 1
      ? `<span class="treePips">${'<i></i>'.repeat(max)}</span>` : '';
    const cost = document.createElement('b');
    cost.className = 'treeCost';
    row.innerHTML = `<span class="treeIcon">${n.icon || ''}</span>`
      + `<span class="treeText"><span class="treeTop">`
      + `<span class="treeName">${n.name}</span>${pips}</span>`
      + `<span class="treeLine">${n.line || ''}</span></span>`;
    row.appendChild(cost);
    row.addEventListener('click', () => {
      if (n.children.length && (n.kind === 'root' || n.kind === 'arm')) {
        wrap.classList.toggle('shut');
      }
      if (n.id) {
        const res = this.game.buy(n.id);
        if (res !== 'ok') this.refuseRow(row);
      }
      this.syncTree();
    });
    wrap.appendChild(row);
    this.treeRows.push({ n, row, cost, wrap });

    if (n.children.length) {
      const kids = document.createElement('div');
      kids.className = 'treeKids';
      for (const c of n.children) kids.appendChild(this.treeNode(c, depth + 1));
      wrap.appendChild(kids);
      // Bought things open; everything else starts closed, or the panel is a
      // wall of eighty rows before a single decision has been made.
      if (depth > 0) wrap.classList.add('shut');
    }
    return wrap;
  }

  refuseRow(row) {
    row.classList.remove('refuse');
    void row.offsetWidth;
    row.classList.add('refuse');
  }

  /** Every row's state, diffed. Called on open, on a buy, and on tab change. */
  syncTree() {
    if (!this.treeRows) return;
    const g = this.game;
    const w = g.world;
    if (this.el.treeBank) this.el.treeBank.textContent = Math.floor(w.energy);
    // What the next thing costs. A tree you cannot afford anything in reads as
    // broken rather than as early, and "820 more" is the difference between a
    // wall and a target.
    let cheapest = Infinity;
    let affordable = 0;
    for (const { n, row, cost, wrap } of this.treeRows) {
      const have = n.id ? g.owned(n.id) : 0;
      const max = n.levels || 1;
      const open = g.available(n);
      const full = n.free || (n.id && have >= max);
      const part = !full && have > 0;
      const price = !full ? priceOf(n, have) : 0;
      const afford = price > 0 && w.energy >= price;

      /*
       * Five states, and every one of them says a different thing:
       *
       *   locked  behind something unbought. Dim, still readable.
       *   poor    open, priced, and out of reach right now.
       *   afford  open and buyable. The only state that invites a press.
       *   part    yours, with levels left. Lit, and still priced.
       *   full    yours, and finished. Lit, ticked, and no longer asking.
       *
       * `part` is the one that was missing: a node bought once out of three
       * looked exactly like one never bought at all.
       */
      row.classList.toggle('locked', !open);
      row.classList.toggle('poor', open && !full && !part && !afford);
      row.classList.toggle('afford', open && !full && !part && afford);
      row.classList.toggle('part', part);
      row.classList.toggle('full', !!full);
      row.classList.toggle('partAfford', part && afford);
      wrap.classList.toggle('branchOpen', !!full || n.kind === 'root');

      if (open && !full) {
        if (afford) affordable++;
        else cheapest = Math.min(cheapest, price);
      }
      cost.textContent = full ? '✓' : !open ? '·' : price;
      cost.classList.toggle('tick', !!full);

      const meter = row.querySelector('.treePips');
      if (meter) {
        for (let i = 0; i < meter.children.length; i++) {
          meter.children[i].classList.toggle('on', i < have);
        }
      }
      // The name is the tier's name once a tier has been reached.
      const lvl = row.querySelector('.treeName');
      if (lvl) {
        const at = Math.min(have, max - 1);
        lvl.textContent = n.tiers && n.tiers[at] ? n.tiers[at].name : n.name;
      }
    }
    if (this.el.treeNext) {
      this.el.treeNext.textContent = affordable
        ? `${affordable} within reach`
        : Number.isFinite(cheapest) ? `${Math.ceil(cheapest - w.energy)} more for the next`
          : '';
      this.el.treeNext.classList.toggle('reach', affordable > 0);
    }
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
          + `<div class="codexSpec">${specRows(a)}</div></div>`;
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
      cell.className = 'codexCell';
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
    p.appendChild(this.volumeRow());
    const rows = [
      ['RESET SIMULATION', 'start the session again', () => { this.setOpen(false); g.restart(); }],
      ['REPLAY OPENING', 'hand the controls over again', () => { this.setOpen(false); g.replayOpening(); }],
      ['DEBUG', 'developer panel', () => { this.setOpen(false); g.hud.toggleDebug(true); }],
    ];
    for (const [label, sub, run] of rows) {
      const b = document.createElement('button');
      b.className = 'menuCell';
      b.innerHTML = `<span class="cellName">${label}</span><span class="cellSub">${sub}</span>`;
      b.addEventListener('click', () => { run(); this.syncSystem(); });
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
    // BUILD says which build this claims to be; REV says which bytes it is.
    // Two devices showing the same pair are running the same code — which is
    // the thing that could not be checked before, and cost an afternoon.
    foot.textContent = `SESSION 7749 · BUILD ${BUILD} · REV ${REV}`;
    p.appendChild(foot);
    this.syncSystem();
  }

  /**
   * Volume, as a row of levels rather than a slider. A phone thumb on a 6px
   * track is a worse control than five targets you can hit without looking,
   * and the rest of the interface already reads in segments. The first segment
   * is off, so mute is a position on the scale and not a second control that
   * can disagree with it.
   */
  volumeRow() {
    const wrap = document.createElement('div');
    wrap.className = 'volRow';
    const name = document.createElement('span');
    name.className = 'volName';
    name.textContent = 'VOLUME';
    wrap.appendChild(name);

    const bar = document.createElement('div');
    bar.className = 'volBar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Volume');
    this.volCells = VOLUME_STEPS.map((v, i) => {
      const b = document.createElement('button');
      b.className = 'volStep';
      b.type = 'button';
      b.dataset.level = String(i);
      b.setAttribute('aria-label', i === 0 ? 'Mute' : `Volume ${i} of ${VOLUME_STEPS.length - 1}`);
      // Segments grow left to right, so the control reads as a level at a
      // glance and not as six equal buttons.
      b.style.setProperty('--h', `${34 + i * 12}%`);
      b.innerHTML = '<i></i>';
      b.addEventListener('click', () => { this.game.setVolume(v); this.syncSystem(); });
      bar.appendChild(b);
      return b;
    });
    wrap.appendChild(bar);
    return wrap;
  }

  syncSystem() {
    if (!this.volCells) return;
    const v = this.game.volume;
    // Nearest step, so a value restored from an older build still lights one.
    let at = 0;
    let best = Infinity;
    VOLUME_STEPS.forEach((s, i) => {
      const d = Math.abs(s - v);
      if (d < best) { best = d; at = i; }
    });
    this.volCells.forEach((b, i) => {
      b.classList.toggle('on', i <= at && at > 0);
      b.classList.toggle('muted', at === 0 && i === 0);
      b.setAttribute('aria-pressed', String(i === at));
    });
  }

  // -------------------------------------------------------------- live sync

  /** Called every frame; cheap because every write is diffed. */
  sync(world) {
    for (const a of ARSENAL) {
      const on = a.kind === 'round' ? world.round === a.key
        : a.kind === 'mine' ? world.mine === a.key
          : !!world[a.key];
      // The sheet is the record of what the turret has, and most of it starts
      // locked. Listing all eleven with no mark said the turret owned them.
      const sealed = !world.unlocked.has(a.key);
      const el = this.cells.get(a.key);
      if (!el || (el._on === on && el._sealed === sealed)) continue;
      el._on = on;
      el._sealed = sealed;
      el.classList.toggle('on', on);
      el.classList.toggle('sealed', sealed);
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
