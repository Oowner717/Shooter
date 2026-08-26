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

/** Every arm, by the key the tree calls it — BOLT is `standard` in here. */
const ARM_BY_KEY = new Map(ARSENAL.map((a) => [a.key === 'standard' ? 'bolt' : a.key, a]));
import { ABILITIES } from './abilities.js';
import { PREFS, pref, cyclePref, prefWord } from './settings.js';
import { VOLUME_STEPS } from './audio.js';
import { BUILD, REV } from './config.js';
import { TREE, NODES, priceOf } from './tree.js';
import { svgMark } from './util.js';

/**
 * Is this node somewhere under the branch with that key? `parent` is set on
 * every node by tree.js's flatten(), so this is a walk up rather than a
 * search down, and a node is counted as being under itself.
 */
function inBranch(n, key) {
  for (let at = n; at; at = at.parent) if (at.key === key) return true;
  return false;
}

const $ = (id) => document.getElementById(id);

/*
 * One mark per category. The categories are headings in tree.js and never had
 * icons, because a row of text does not need one -- a 44-pixel row that has to
 * be told apart at a glance does.
 */
const bm = (body) => svgMark(body, 1.8);
/** What an arm card says across its top. A round is not an upgrade to one. */
const NEW_WORD = { ammo: 'ROUND', mines: 'MINE', abilities: 'ABILITY' };

const BRANCH_MARK = {
  turret: bm('<path d="M12 21V9"/><path d="M9 12 12 8.6 15 12"/><path d="M4.6 18.6 12 21l7.4-2.4"/>'),
  ammo: bm('<circle cx="12" cy="7" r="2.8" fill="currentColor" stroke="none"/><path d="M12 21V12"/><path d="M8.6 15.5h6.8" opacity=".6"/>'),
  mines: bm('<path d="M3.5 19h17"/><path d="M8 19a4 4 0 0 1 8 0"/><path d="M12 12.5V7"/>'),
  abilities: bm('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'),
  anomaly: bm('<circle cx="12" cy="12" r="6.4"/><path d="M12 2.4v3.2M12 18.4v3.2M2.4 12h3.2M18.4 12h3.2"/>'),
};

/*
 * Every level the TURRET branch sells, added up. Off the tree rather than off
 * shooter.js's RIG_MAX, because this is the denominator of what the panel is
 * counting and the panel counts tree nodes.
 */
const RIG_LEVELS = NODES
  .filter((n) => n.id && !n.repeat && n.parent && n.parent.key === 'turret')
  .reduce((a2, n) => a2 + (n.levels || 1), 0);

/*
 * Three, not four. ARSENAL was a second screen describing the same rounds and
 * mines the tree sells — you read the specs on one tab and bought them on
 * another, and the tab you bought on said less about them than the tab you
 * did not. The tree carries the arsenal's own rows now: its art, its label and
 * its DMG/FX pair, with the price on the end. What is left of ARSENAL is the
 * two that run on their own, which are not bought and so belong under the
 * tree rather than in it.
 */
const TABS = [
  { id: 'tree', label: 'UPGRADES' },
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
    };
    this.open = false;
    this.tab = 'tree';
    this.cells = new Map(); // key -> element, for the active-state sync
    this.codexCells = new Map();
    this.lastFound = -1;

    this.buildTabs();
    this.buildTree();
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
    // An arm does not survive the sheet. It lapses after four seconds because
    // an armed card left sitting is a trap for the next tap -- and closing the
    // sheet and opening it again is exactly that gap, with the four seconds
    // still running. Measured: arm a card, close, reopen, and one tap spent.
    this.armRow(null);
    if (on) { this.syncCodex(); this.syncTree(); }
    // The machine only draws while it is being looked at.
    if (on && this.tab === 'tree') this.runHero(); else this.stopHero();
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
    // Same rule as the sheet: leaving this tab abandons whatever was armed.
    this.armRow(null);
    for (const b of this.el.tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of this.el.panels.children) p.hidden = p.dataset.panel !== tab;
    // The panels share one scroller. Leaving the tree scrolled halfway and
    // switching to a short tab landed on its bottom edge, or on nothing.
    this.el.panels.scrollTop = 0;
    if (tab === 'codex') this.syncCodex();
    if (tab === 'tree') this.syncTree();
    if (this.open && tab === 'tree') this.runHero(); else this.stopHero();
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
    this.items = [];
    this.branches = [];

    const head = document.createElement('div');
    head.className = 'treeHead';
    head.innerHTML = '<span class="treeHeadName">ENERGY</span>'
      + '<span class="treeNext" id="treeNext"></span>'
      + '<span class="treeSouls" id="treeSouls" hidden></span>'
      + '<b id="treeBank">0</b>';

    p.appendChild(this.buildHero());
    p.appendChild(this.buildShelf());
    p.appendChild(head);
    p.appendChild(this.buildBranches());

    this.el.treeBank = head.querySelector('#treeBank');
    this.el.treeSouls = head.querySelector('#treeSouls');
    this.el.treeNext = head.querySelector('#treeNext');

  }

  /*
   * AUTO AIM and AUTO FIRE. They are not bought, so they are not for sale,
   * so they do not belong in a shop -- they sat at the bottom of it because
   * they were the last thing the old ARSENAL tab held that the tree had no
   * row for. Eight pieces of text between 6.5 and 10 pixels, describing two
   * things nobody can buy, under eighty-three things they can.
   *
   * They are a reference, and OBJECTS is where the references are.
   */
  buildAuto(p) {
    const run = ARSENAL_GROUPS.find((x) => x.id === 'auto');
    p.appendChild(heading(run.title, run.note));
    const grid = document.createElement('div');
    grid.className = 'armGrid';
    for (const a of ARSENAL.filter((x) => x.group === 'auto')) {
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

  /*
   * ====================== YOUR MACHINE ==========================
   *
   * What the tree was. Five rows, one per category, each with a meter in its
   * own colour and its own fraction -- the whole shape of eighty-three
   * purchases in five lines, readable across a room.
   *
   * It was an indented outline three levels deep, closed by default, with
   * OPEN and CLOSE on every branch and a rail down the left. That is the
   * shape of a file browser and it is the wrong shape for a shop: 460 pieces
   * of text, 434 of them at ten pixels or under, and up to four taps between
   * opening the panel and spending anything.
   *
   * Flat, one category open at a time, and the thing nesting used to say --
   * that OVERSTUFFED belongs to BOLT -- is said by order and colour instead.
   * A mod sits directly under its round, wearing its round's tone.
   */
  buildBranches() {
    const frag = document.createDocumentFragment();
    const lab = document.createElement('div');
    lab.className = 'shopLab';
    lab.innerHTML = '<span>YOUR MACHINE</span>';
    frag.appendChild(lab);

    /*
     * Display order, not tree order. TREE leads with ANOMALY because the old
     * outline put "the way in" first -- but this section's heading is YOUR
     * MACHINE, and a boss door is not the machine. The turret leads, its
     * ammunition and field follow, and the doors are the last row: the thing
     * you go down to when you are ready, not the first thing under the shelf.
     */
    const order = ['turret', 'ammo', 'mines', 'abilities', 'anomaly'];
    const roots = TREE.filter((n) => n.kind === 'root');
    roots.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
    // RECAST is a leaf at the top of the tree because it is bought with a
    // currency nothing else uses. It is still a new form for the turret, so
    // it is shown with the turret rather than as a category of one.
    for (const root of roots) frag.appendChild(this.buildBranch(root));
    return frag;
  }

  buildBranch(root) {
    const wrap = document.createElement('div');
    wrap.className = 'branch shut';
    wrap.style.setProperty('--tone', root.tone || '#8fb6d8');

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'branchRow';
    row.innerHTML = `<span class="branchIcon">${BRANCH_MARK[root.key] || ''}</span>`
      + `<span class="branchName">${root.name}</span>`
      + '<span class="branchBar"><i></i></span>'
      + '<span class="branchFrac"></span>'
      + '<span class="branchCaret"></span>';
    // ANOMALY holds a slot per boss and each boss owns a hue, so its meter
    // wears all seven at once -- the one row that says how many there are.
    if (root.tones && root.tones.length) {
      const step = 100 / root.tones.length;
      wrap.style.setProperty('--tones', root.tones
        .map((c, i) => `${c} ${(i * step).toFixed(2)}%, ${c} ${((i + 1) * step).toFixed(2)}%`)
        .join(', '));
      wrap.classList.add('spectrum');
    }
    wrap.appendChild(row);

    const grid = document.createElement('div');
    grid.className = 'branchGrid';

    const own = [];
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.kind === 'arm') {
          /*
           * A round, a mine or an ability: the thing itself, not a tweak to
           * it. It takes the full width and says NEW ROUND across the top,
           * and everything under it until the next one belongs to it.
           *
           * It used to be a card exactly like its own mods -- HE sat beside
           * OVERPRESSURE, same colour, same size, with nothing on screen to
           * say that one was a new round and the other was forty percent more
           * blast radius. Only BOLT, PULSE and FAN got a heading, and that
           * was by accident: they are the arms with no id, and the label was
           * keyed off the id rather than off the kind.
           */
          const card = this.makeCard(n, root);
          grid.appendChild(card);
          if (n.id) { this.items.push({ n, card }); own.push(n); }
        } else if (n.id) {
          const card = this.makeCard(n, root);
          grid.appendChild(card);
          this.items.push({ n, card });
          own.push(n);
        } else if (n.name && n.kind === 'group') {
          // A heading over a set that belongs to no one arm: ALL ROUNDS.
          const g = document.createElement('div');
          g.className = 'grpLab';
          g.style.setProperty('--tone', this.toneOf(n));
          g.textContent = n.name;
          grid.appendChild(g);
        }
        if (n.children && n.children.length) walk(n.children);
      }
    };
    walk(root.children || []);
    // ...and RECAST, on the end of the turret.
    if (root.key === 'turret') {
      for (const n of TREE) {
        if (n.kind === 'root' || !n.id) continue;
        const card = this.makeCard(n, root);
        grid.appendChild(card);
        this.items.push({ n, card });
        own.push(n);
      }
    }
    wrap.appendChild(grid);

    row.addEventListener('click', () => {
      const shut = wrap.classList.contains('shut');
      // One at a time. Two open branches is two screens of cards and no way
      // back to the top, which is the thing this replaced.
      for (const b of this.branches) b.wrap.classList.add('shut');
      this.armRow(null);
      if (shut) wrap.classList.remove('shut');
      this.syncTree();
    });

    this.branches.push({ root, wrap, row, grid, nodes: own });
    return wrap;
  }

  /*
   * ======================= the room =========================
   *
   * The machine, what you have built of it, and the two cheapest things you
   * can afford. Above the tree, because the tree could say none of it.
   *
   * The measurement that put it here: screenshot the panel owning nothing,
   * buy all one hundred and thirty-six levels, screenshot again, diff below
   * the energy strip -- zero differing pixels. The menu that upgrades the
   * turret could not tell an empty machine from a finished one.
   */

  buildHero() {
    const wrap = document.createElement('div');
    wrap.className = 'rigHero';
    const cv = document.createElement('canvas');
    const flare = document.createElement('span');
    flare.className = 'rigFlare';
    const count = document.createElement('div');
    count.className = 'rigCount';
    wrap.appendChild(cv);
    wrap.appendChild(flare);
    wrap.appendChild(count);
    this.el.rigCanvas = cv;
    this.el.rigFlare = flare;
    this.el.rigCount = count;
    return wrap;
  }

  buildShelf() {
    const wrap = document.createElement('div');
    const lab = document.createElement('div');
    lab.className = 'shopLab';
    lab.innerHTML = '<span>NEXT</span><em id="shopMore"></em>';
    wrap.appendChild(lab);
    const shelf = document.createElement('div');
    shelf.className = 'shelf';
    wrap.appendChild(shelf);
    this.el.shelf = shelf;
    this.el.shopMore = lab.querySelector('#shopMore');
    this.shelfAt = ['', ''];
    return wrap;
  }

  /**
   * One card. The whole thing is the button — the first press turns it over,
   * the second spends. Three targets on one row is the bug menu.js already
   * fixed once and it is not being reintroduced at a larger size.
   */
  makeCard(n, root) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = `shopCard${n.kind === 'arm' ? ' arm' : ''}`;
    if (n.id) c.dataset.id = n.id;
    c.style.setProperty('--tone', this.toneOf(n));
    const max = n.repeat ? 0 : (n.levels || 1);
    const kind = n.kind === 'arm' ? (NEW_WORD[root && root.key] || 'THING') : '';
    /*
     * A meter only where there are levels to be part-way through -- the same
     * rule the old tree wrote down for its pips. Below two segments the track
     * is kept for layout and hidden: on a single-level card the owned state
     * already reads through the tone wash and the tick, and on a repeatable
     * one (the APERTUREs, RECAST) an empty track can never fill, which reads
     * as something stuck rather than as something to do.
     */
    c.innerHTML = (kind ? `<span class="shopKind" data-noun="${kind}">${kind}</span>` : '')
      + `<span class="shopIcon">${n.icon || ''}</span>`
      + '<span class="shopBody"><span class="shopName"></span>'
      + '<span class="shopSpec"></span>'
      + '<span class="shopStat"></span></span>'
      + `<span class="shopMeter${max < 2 ? ' none' : ''}">${'<i></i>'.repeat(max)}</span>`
      + '<b class="shopPrice"></b>';
    /*
     * BOLT, PULSE and FAN are issued rather than bought, so they have no id
     * and nothing to buy. They still get a card: a round you already own
     * reading the same way as one you do not is the point of the heading.
     */
    if (!n.id) {
      c.disabled = true;
      c.classList.add('issued', 'own');
      this.fillCard(c, n, n.name);
      c.querySelector('.shopPrice').textContent = 'ISSUED';
      return c;
    }
    c.addEventListener('click', () => {
      if (c.classList.contains('locked')) { this.refuseRow(c); return; }
      if (this.armed !== c) { this.armRow(c); this.syncTree(); return; }
      this.armRow(null);
      const res = this.game.buy(n.id);
      if (res !== 'ok') this.refuseRow(c);
      this.syncTree();
    });
    return c;
  }

  /**
   * One card's five states. The same function paints the shelf and the
   * grids, so a card cannot say one thing in one place and another in the
   * other -- which is how the tree's price box and its pips drifted apart.
   *
   *   locked  behind something unbought. Dim, still readable, still priced.
   *   poor    open and out of reach right now.
   *   afford  the only state that invites a press.
   *   part    yours, with levels left. Lit, and still priced.
   *   own     yours, and finished. Brightest, and the price is a full meter.
   *
   * `own` is the inversion. A bought row used to grey out and get a tick,
   * which made colour mean FOR SALE and grey mean YOURS -- so finishing the
   * tree made it go dim. A tick is a receipt; a lit part is a trophy.
   */
  syncCard(card, n) {
    const g = this.game;
    const w = g.world;
    const have = g.owned(n.id);
    const max = n.repeat ? 0 : (n.levels || 1);
    const full = !n.repeat && have >= max;
    const open = g.available(n) && !n.dormant;
    const price = full ? 0 : priceOf(n, have);
    const purse = n.currency === 'remainder' ? (w.remainder || 0) : w.energy;
    const afford = !full && purse >= price;
    const armed = card === this.armed;

    card.classList.toggle('locked', !open);
    card.classList.toggle('poor', open && !full && !afford);
    card.classList.toggle('own', !!full);
    card.classList.toggle('armed', armed);
    /*
     * NEW ROUND while it is one. Once it is yours it is just a round, and the
     * mods under it are still its mods -- the eyebrow has a second job as the
     * heading for everything below it, so it does not go away.
     */
    const eyebrow = card.querySelector('.shopKind');
    if (eyebrow) {
      const word = full ? eyebrow.dataset.noun : `NEW ${eyebrow.dataset.noun}`;
      if (eyebrow.textContent !== word) eyebrow.textContent = word;
    }

    const at = Math.min(have, Math.max(max - 1, 0));
    const nm = card.querySelector('.shopName');
    this.fillCard(card, n, n.tiers && n.tiers[at] ? n.tiers[at].name : n.name);

    const tag = n.currency === 'remainder' ? `${price}\u25c6` : String(price);
    nm.dataset.price = tag;
    const say = armed ? 'BUY' : full ? '\u2713' : !open ? '\u00b7' : tag;
    const pr = card.querySelector('.shopPrice');
    if (pr.textContent !== say) pr.textContent = say;

    const meter = card.querySelector('.shopMeter');
    for (let k = 0; k < meter.children.length; k++) {
      meter.children[k].classList.toggle('on', k < have);
    }
    return { open, full, afford, price, have, max };
  }

  /**
   * The colour a card wears: its branch's, not its own.
   *
   * Most leaves carry no tone and fall back to a slate grey, so every card on
   * the shelf came out the same colour whatever it was upgrading. The tone
   * that means something is the nearest one up the tree -- the arm's if it
   * hangs off one, the category's otherwise.
   */
  toneOf(n) {
    const SLATE = '#9fb3c8';
    for (let at = n; at; at = at.parent) {
      if (at.tone && at.tone !== SLATE) return at.tone;
    }
    return SLATE;
  }

  /**
   * What a card says about itself.
   *
   * An UPGRADE's line is written as a stat and then flavour -- "+20% fire
   * rate. A belt feed along the barrel." The first sentence is the number you
   * are deciding with, and the rest was being set at 8px on sixty-three rows.
   * The card keeps the number.
   *
   * An ARM's is written the other way round: the damage first, then what the
   * thing actually does. Taking the first sentence there gave SNARE "NEVER
   * GOES OFF" and LODE "CANNOT BE TRIGGERED" -- both true, both a description
   * of what the mine does not do, and both dropping the half that is the
   * reason to buy it (SNARE pins a crowd for 2.4s; LODE shoves everything
   * near it away). ARC read "DAMAGE 11, THEN 25 A JUMP" and never mentioned
   * that the hit jumps to four more bodies.
   *
   * So an arm splits: the numbers go on a spec line of their own and the card
   * says what it does.
   */
  textOf(n) {
    const say = (t) => (t ? t[0].toUpperCase() + t.slice(1) : '');
    if (n.kind === 'arm') {
      const a = ARM_BY_KEY.get(n.key);
      if (a) return { spec: String(a.dmg || '').toUpperCase(), stat: say(a.fx || '') };
      const b = ABILITIES.find((x) => x.id === n.key);
      // The ability hints read "NAME — what it does"; the name is already the
      // heading of the card and what is left starts mid-sentence.
      if (b) return { spec: '', stat: say((b.hint || '').replace(/^[A-Z ]+—\s*/, '')) };
    }
    const line = (n.line || '').trim();
    if (!line) return { spec: '', stat: '' };
    const stop = line.indexOf('. ');
    const first = stop > 0 ? line.slice(0, stop) : line.replace(/\.$/, '');
    /*
     * Caps for a quantity, sentence case for a sentence. "+25% DAMAGE" is a
     * readout and reads as one; "BOLT REBOUNDS OFF BODIES INSTEAD OF
     * STOPPING, WEAKER EACH TIME" is forty-eight characters of shouting at
     * 12px, and letterforms with no ascenders or descenders are the hardest
     * thing to read at that size.
     */
    const quantity = /^[+\u00d7\u2013-]?\d|^[+\u00d7]/.test(first) && first.length <= 30;
    return { spec: '', stat: quantity ? first.toUpperCase() : say(first) };
  }

  /** Name, numbers and effect. Shared, so an issued arm reads like a sold one. */
  fillCard(card, n, name) {
    const nm = card.querySelector('.shopName');
    if (nm.textContent !== name) nm.textContent = name;
    const { spec, stat } = this.textOf(n);
    const sp = card.querySelector('.shopSpec');
    if (sp.textContent !== spec) sp.textContent = spec;
    sp.hidden = !spec;
    const st = card.querySelector('.shopStat');
    if (st.textContent !== stat) st.textContent = stat;
  }

  /** Everything the room shows. Driven from syncTree, so it cannot drift. */
  syncRoom(rows, affordable = 0) {
    const g = this.game;
    const w = g.world;

    /*
     * A part landed. Detected here rather than announced from Game.buy so
     * there is one path -- anything that adds to the ledger flares, including
     * the debug hooks, and nothing has to remember to call this.
     */
    const taken = w.offers.taken;
    if (this.tookAt === undefined) this.tookAt = taken.length;
    if (taken.length > this.tookAt) {
      const last = NODES.find((n) => n.id === taken[taken.length - 1]);
      this.flare(last && last.tone);
    }
    this.tookAt = taken.length;

    // What you have built. No denominator: there are 136 levels in the tree
    // and a run does not reach that, so a fraction of it is a failure state
    // rather than a trophy. The turret has one because it can be finished.
    let built = 0;
    let rigHave = 0;
    for (const { n } of rows) {
      if (!n.id || n.repeat) continue;
      const have = g.owned(n.id);
      built += have;
      if (n.parent && n.parent.key === 'turret') rigHave += have;
    }
    const say = `<b>${built}</b> BUILT<i>·</i>TURRET <b>${rigHave}</b>/${RIG_LEVELS}`;
    if (this.el.rigCount && this.el.rigCount.innerHTML !== say) {
      this.el.rigCount.innerHTML = say;
    }

    /*
     * The shelf: the two cheapest things within reach. Not a catalogue -- the
     * tree below is the catalogue, and the whole complaint about it was that
     * it opened on one.
     */
    const buyable = [];
    const ways = [];
    let cheapest = null;
    for (const { n } of rows) {
      if (!n.id || n.dormant || !g.available(n)) continue;
      const have = g.owned(n.id);
      if (!n.repeat && have >= (n.levels || 1)) continue;
      const price = priceOf(n, have);
      const purse = n.currency === 'remainder' ? (w.remainder || 0) : w.energy;
      /*
       * Upgrades first; a way in fills only a slot no upgrade wants.
       *
       * The APERTUREs are the cheapest things in the tree and they repeat, so
       * plain cheapest-first parked two of them on the shelf permanently --
       * which is the fault this panel was rebuilt to fix, reproduced at a
       * larger size. Excluding them outright was the second wrong rule: with
       * only a way in within reach, the strip said "100 more for the next"
       * while the empty shelf pointed at a five-hundred-energy upgrade,
       * because the two were computing "next" from different lists. One list
       * now. Upgrades take the slots; an affordable way in stands in only
       * where a slot would otherwise sit empty; and the empty shelf's target
       * is the cheapest thing under the strip's own definition.
       */
      const way = inBranch(n, 'anomaly');
      if (purse >= price) (way ? ways : buyable).push({ n, price, have });
      else if (!n.currency && (!cheapest || price < cheapest.price)) cheapest = { n, price };
    }
    buyable.sort((a, b) => a.price - b.price);
    ways.sort((a, b) => a.price - b.price);
    const offer = buyable.concat(ways);

    const shelf = this.el.shelf;
    if (!shelf) return;
    if (this.el.shopMore) {
      /*
       * Counted against the strip's own total, not against this list. The
       * shelf sells upgrades and skips the seven ways in, but the ways in
       * are still below, in the ANOMALY grid -- and the strip, the energy
       * chip's badge and this label all describe the same purse, so "55
       * within reach" sitting an inch from "46 MORE BELOW" read as one of
       * them being wrong. Now the label is always the strip minus what the
       * shelf is showing.
       */
      const more = affordable - Math.min(offer.length, 2);
      this.el.shopMore.textContent = more > 0 ? `${more} MORE BELOW` : '';
    }

    if (!offer.length) {
      // Honest about being empty rather than blank. A shelf with nothing on
      // it and no reason given reads as broken; a target reads as early.
      const short = cheapest ? Math.ceil(cheapest.price - w.energy) : 0;
      const say2 = cheapest
        ? `<span>${cheapest.n.name}</span><b>${short}</b><span>MORE ENERGY</span>`
        : '<span>NOTHING LEFT TO BUY</span>';
      if (shelf.dataset.empty !== say2) {
        shelf.dataset.empty = say2;
        shelf.innerHTML = `<div class="shopNone">${say2}</div>`;
        this.shelfAt = ['', ''];
      }
      return;
    }
    if (shelf.dataset.empty) { shelf.innerHTML = ''; delete shelf.dataset.empty; }

    for (let i = 0; i < 2; i++) {
      const pick = offer[i];
      const at = shelf.children[i];
      if (!pick) {
        if (at) at.remove();
        this.shelfAt[i] = '';
        continue;
      }
      const { n, have } = pick;
      // A card is rebuilt only when the thing on it changes; the rest of the
      // time it is repainted in place, so the meter and the price can animate.
      let card = at;
      if (!card || card.dataset.id !== n.id) {
        card = this.makeCard(n);
        if (at) shelf.replaceChild(card, at); else shelf.appendChild(card);
      }
      this.syncCard(card, n);
      // Beat four: a card that is not the one that was here slides in, so the
      // shelf visibly re-deals instead of silently swapping.
      const key = `${n.id}:${have}`;
      if (this.shelfAt[i] !== key) {
        this.shelfAt[i] = key;
        card.classList.remove('dealt');
        void card.offsetWidth;
        card.classList.add('dealt');
      }
    }
  }

  /** Beat one: the part lands. Over the canvas, not into it — see below. */
  flare(tone) {
    const f = this.el.rigFlare;
    if (!f) return;
    f.style.setProperty('--flare', tone || '#59e0ff');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  /**
   * The machine, drawn from the same code the field uses.
   *
   * The simulation is held while the menu is open — `Game.paused` — so the
   * world clock is stopped and anything the drawing reads off it is frozen.
   * That is what the local clock is for: a slow sweep of the barrel so the
   * thing is alive without the field running behind it.
   *
   * Capped at fifteen frames a second. A sixty-frame loop over a paused game
   * on a phone is how the best idea in the plan becomes a frame-rate bug.
   */
  drawHero(now) {
    const cv = this.el.rigCanvas;
    const g = this.game;
    if (!cv || !g.world || !g.world.shooter) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = cv.getBoundingClientRect();
    if (!box.width) return;
    const w = Math.round(box.width * dpr);
    const h = Math.round(box.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const s = g.world.shooter;
    // Wrapped. `now` is milliseconds since the page loaded, and the sweep
    // below is a sine of it -- left unbounded the borrowed spin reaches
    // thousands of radians on a long session, where a float has fewer bits
    // left for the fraction than the drawing needs.
    const t = (now % 600000) / 1000;
    // Big enough to read the parts on. The machine grows with the rig, so the
    // scale is against the finished radius rather than the current one.
    const k = (h / dpr / 190) * dpr;
    ctx.save();
    ctx.translate(w / 2, h * 0.62);
    ctx.scale(k, k);
    ctx.translate(-s.x, -s.y);
    // Borrowed, drawn, put back. The field owns these; the menu is only
    // looking at them, and a paused turret that came back pointing somewhere
    // else would be this panel reaching into the game.
    const aim0 = s.aim;
    const spin0 = s.spin;
    s.aim = -Math.PI / 2 + Math.sin(t * 0.55) * 0.26;
    s.spin = spin0 + t * 0.5;
    try {
      s.drawMachine(ctx, g.world, '#59e0ff', t, false);
    } finally {
      s.aim = aim0;
      s.spin = spin0;
      ctx.restore();
    }
  }

  /**
   * The idle. Runs only while the sheet is open on this tab, and stops dead
   * otherwise — there is nothing to animate on the other two.
   */
  runHero() {
    if (this.heroRaf) return;
    const tick = (now) => {
      if (!this.open || this.tab !== 'tree') { this.heroRaf = 0; return; }
      this.heroRaf = requestAnimationFrame(tick);
      if (now - (this.heroAt || 0) < 66) return;
      this.heroAt = now;
      this.drawHero(now);
    };
    this.heroRaf = requestAnimationFrame(tick);
  }

  stopHero() {
    if (this.heroRaf) cancelAnimationFrame(this.heroRaf);
    this.heroRaf = 0;
  }

  /**
   * Beat two: the wallet counts down rather than jumping.
   *
   * A quarter of a second of ticking is most of the sensation of spending;
   * the number arriving already changed is the sensation of a form being
   * submitted.
   */
  rollBank(to) {
    const el = this.el.treeBank;
    if (!el) return;
    const from = this.bankShown === undefined ? to : this.bankShown;
    this.bankShown = to;
    if (from === to) { el.textContent = to; return; }
    // Only a spend rolls. Energy arriving is the field's business and it has
    // its own animation on the chip outside.
    if (to > from || from - to > 100000) { el.textContent = to; return; }
    cancelAnimationFrame(this.bankRaf || 0);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / 260, 1);
      const e = 1 - (1 - p) * (1 - p);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) this.bankRaf = requestAnimationFrame(step);
    };
    this.bankRaf = requestAnimationFrame(step);
  }

  /**
   * Arm one row, and only one. Nine hundred energy is most of an early run and
   * a thumb is not precise, so nothing is spent on a single tap.
   */
  armRow(row) {
    clearTimeout(this.armTimer);
    if (this.armed && this.armed !== row) this.armed.classList.remove('armed');
    this.armed = row;
    if (!row) return;
    row.classList.add('armed');
    // It lapses on its own. An armed row left sitting is a trap for the next
    // tap, which by then is about something else.
    this.armTimer = setTimeout(() => {
      if (this.armed === row) { row.classList.remove('armed'); this.armed = null; this.syncTree(); }
    }, 4000);
  }

  refuseRow(row) {
    row.classList.remove('refuse');
    void row.offsetWidth;
    row.classList.add('refuse');
  }

  /** Every row's state, diffed. Called on open, on a buy, and on tab change. */
  /**
   * Is this row buyable right now? The one definition of it — the tree paints
   * `afford` with it and the chip badge counts with it, so the number on the
   * chip and the rows behind it can never disagree.
   */
  buyable(n, w) {
    if (!n.id || n.dormant || n.free) return false;
    const g = this.game;
    const have = g.owned(n.id);
    const max = n.repeat ? Infinity : (n.levels || 1);
    if (have >= max) return false;
    if (!g.available(n)) return false;
    const purse = n.currency === 'remainder' ? (w.remainder || 0) : w.energy;
    return purse >= priceOf(n, have);
  }

  /**
   * How many of them, walking the node table rather than the DOM — so it
   * costs nothing with the menu shut, which is exactly when the badge on the
   * energy chip needs it.
   */
  reachCount(w, under = null) {
    let n = 0;
    for (const node of NODES) {
      if (!this.buyable(node, w)) continue;
      if (under && !inBranch(node, under)) continue;
      n++;
    }
    return n;
  }

  /**
   * Open the tree standing on one branch, with everything above it opened on
   * the way. What the loadout sheet's bar does: the sheet is where you find
   * out a round is sealed, and this is the shortest line from that to the row
   * that unseals it. Landing on the top of an eighty-row tree instead would
   * make the reader find it again.
   *
   * Returns whether the branch was found, so a caller wiring a key that no
   * longer exists finds out rather than silently opening the top.
   */
  openTo(key) {
    this.setOpen(true);
    this.show('tree');
    /*
     * A branch, not a row. The callers ask for 'ammo' or 'mines' -- the
     * loadout sheet is where you find out a round is sealed and this is the
     * shortest line from that to the cards that unseal it.
     *
     * It used to walk a row's ancestors open one at a time, because a row
     * inside a shut parent has no height and scrolling to it lands on
     * nothing. There is one level now, so there is one thing to open.
     */
    const hit = this.branches && this.branches.find((b) => b.root.key === key);
    if (!hit) return false;
    for (const b of this.branches) b.wrap.classList.toggle('shut', b !== hit);
    this.armRow(null);
    this.syncTree();
    /*
     * Put it at the top of the scroller. Measured as a difference between two
     * rects, which is why the sheet sliding up underneath does not spoil it:
     * #menu's entrance is a translate, and a translate moves both rects by
     * the same amount.
     */
    const box = this.el.panels.getBoundingClientRect();
    const row = hit.row.getBoundingClientRect();
    /*
     * Clear of the ENERGY strip, which is sticky at the top of this same
     * scroller -- scrolling to the scroller's own top edge parks the row you
     * were sent to underneath it, which looks exactly like being sent
     * nowhere. Measured rather than written down, so restyling the strip
     * cannot quietly break the landing.
     */
    const head = this.el.panels.querySelector('.menuPanel.tree .treeHead');
    const clear = (head ? head.getBoundingClientRect().height : 0) + 8;
    this.el.panels.scrollTop += row.top - box.top - clear;
    for (const el of this.el.panels.querySelectorAll('.branchRow.landed')) {
      el.classList.remove('landed');
    }
    void hit.row.offsetWidth;
    hit.row.classList.add('landed');
    const done = (e) => {
      if (e.animationName !== 'treeLanded') return;
      hit.row.classList.remove('landed');
      hit.row.removeEventListener('animationend', done);
    };
    hit.row.addEventListener('animationend', done);
    return true;
  }

  /** Every card's state, plus the room and the branch meters. Diffed. */
  syncTree() {
    if (!this.items) return;
    const g = this.game;
    const w = g.world;
    this.rollBank(Math.floor(w.energy));
    // The other purse, shown only once there is something in it — a currency
    // reading "0" for the first hour is a promise nobody asked for.
    const souls = this.el.treeSouls;
    if (souls) {
      const n = w.remainder || 0;
      if (souls.hidden !== !n) souls.hidden = !n;
      if (n) souls.textContent = `${n}\u25c6 REMAINDER`;
    }

    let cheapest = Infinity;
    let affordable = 0;
    for (const { n, card } of this.items) {
      // A card inside a shut branch is a card with no height. Painting it is
      // work nobody can see, and there are eighty-three of them.
      const shown = card.offsetParent !== null;
      const st = shown ? this.syncCard(card, n)
        : this.cardState(n);
      if (st.open && !st.full) {
        if (st.afford) affordable++;
        else if (!n.currency) cheapest = Math.min(cheapest, st.price);
      }
    }

    if (this.el.treeNext) {
      this.el.treeNext.textContent = affordable
        ? `${affordable} within reach`
        : Number.isFinite(cheapest) ? `${Math.ceil(cheapest - w.energy)} more for the next`
          : '';
      this.el.treeNext.classList.toggle('reach', affordable > 0);
    }

    this.syncBranches();
    this.syncRoom(this.items, affordable);
  }

  /** What syncCard works out, without touching the DOM. */
  cardState(n) {
    const g = this.game;
    const w = g.world;
    const have = g.owned(n.id);
    const max = n.repeat ? 0 : (n.levels || 1);
    const full = !n.repeat && have >= max;
    const open = g.available(n) && !n.dormant;
    const price = full ? 0 : priceOf(n, have);
    const purse = n.currency === 'remainder' ? (w.remainder || 0) : w.energy;
    return { open, full, price, have, max, afford: !full && purse >= price };
  }

  /**
   * The five meters. Each one is every level its category sells, and how
   * many of them are yours.
   *
   * ANOMALY counts differently on purpose: its seven slots repeat, so what
   * you hold is a stock rather than a level. Opened-at-least-once is the
   * thing that goes up and stays up, which is what a meter is for.
   */
  syncBranches() {
    if (!this.branches) return;
    const g = this.game;
    for (const b of this.branches) {
      let have = 0;
      let max = 0;
      let reach = 0;
      for (const n of b.nodes) {
        // RECAST is shown with the turret because it is a new form for the
        // turret, but it is bought with REMAINDER -- so it is not a level of
        // this branch and counting it made the row say 10/18 beside a hero
        // saying 10/17.
        if (n.currency) continue;
        const st = this.cardState(n);
        if (n.repeat) { have += Math.min(st.have, 1); max += 1; }
        else { have += st.have; max += st.max; }
        if (st.open && !st.full && st.afford) reach++;
      }
      const frac = b.row.querySelector('.branchFrac');
      const say = `${have}/${max}`;
      if (frac.textContent !== say) frac.textContent = say;
      const bar = b.row.querySelector('.branchBar > i');
      bar.style.width = `${max ? (have / max) * 100 : 0}%`;
      b.wrap.classList.toggle('done', max > 0 && have >= max);
      // A dot on a shut branch holding something you can afford: the reason
      // to open it, without opening it.
      b.wrap.classList.toggle('reach', reach > 0);
    }
  }

  // ---------------------------------------------------------------- arsenal

  /**
   * A reference, not a rack. The strip on the play screen is where a round or
   * a mine is chosen; this is the only place the one-line reason for choosing
   * it is written down, and it lights to match whatever is loaded right now.
   */
  // ------------------------------------------------------------------ codex

  /*
   * ====================== the record =============================
   *
   * A collection, laid out as one.
   *
   * It was thirty-four identical rows. Each one was 115px of dashed art box,
   * a name redacted into block glyphs, and the sentence "No record. Destroy
   * one." -- thirty-four times, over 2166px, which is 3.8 screens of the same
   * line. The tab whose entire subject is what you have collected opened on
   * a wall of what you have not, and said how many you had at 8.5px in the
   * title bar.
   *
   * So: the count is the first thing and it is a meter, what you have found
   * is a list that grows, and what you have not is a block of blank tiles
   * that shrinks. The sentence is said once, over the block, instead of
   * thirty-four times inside it.
   */
  buildCodex() {
    const p = this.panel('codex', 'codex');

    const head = document.createElement('div');
    head.className = 'codexHead';
    head.innerHTML = '<span class="codexCount"></span>'
      + '<span class="codexBar"><i></i></span>';
    p.appendChild(head);
    this.el.codexCount = head.querySelector('.codexCount');
    this.el.codexBar = head.querySelector('.codexBar > i');

    this.el.codexKnownLab = heading('RECORDED', '');
    p.appendChild(this.el.codexKnownLab);
    const known = document.createElement('div');
    known.className = 'codexGrid';
    p.appendChild(known);
    const none = document.createElement('div');
    none.className = 'codexNone';
    none.textContent = 'Nothing yet. An object is recorded the first time you destroy one.';
    p.appendChild(none);
    this.el.codexNone = none;

    this.el.codexUnseenLab = heading('NOT YET SEEN', 'destroy one to record it');
    p.appendChild(this.el.codexUnseenLab);
    const unseen = document.createElement('div');
    unseen.className = 'codexUnseen';
    p.appendChild(unseen);

    /*
     * AUTO AIM and AUTO FIRE last. They came here in 154 because they are a
     * reference and this is where the references are -- but put at the top
     * they pushed the count, which is the entire subject of this tab, below
     * the fold. A reference for two systems you never buy does not open the
     * page about what you have collected.
     */
    this.buildAuto(p);

    this.el.codexKnown = known;
    this.el.codexUnseenBox = unseen;
    for (const e of CODEX) {
      const cell = document.createElement('div');
      cell.className = 'codexCell';
      cell.innerHTML = '<div class="codexArt"><canvas width="72" height="72"></canvas></div>'
        + '<div class="codexBody"><div class="codexName"></div><div class="codexLine"></div></div>';
      unseen.appendChild(cell);
      this.codexCells.set(e.id, cell);
    }
  }

  /** Redacted until it has been destroyed once. */
  syncCodex() {
    if (this.lastFound === codex.found) return;
    this.lastFound = codex.found;
    if (this.el.codexCount) {
      this.el.codexCount.innerHTML = `<b>${codex.found}</b> OF ${codex.total} RECORDED`;
      this.el.codexBar.style.width = `${(codex.found / codex.total) * 100}%`;
      // The two headings and the empty note only belong on screen when the
      // section under them has something in it.
      this.el.codexKnownLab.hidden = !codex.found;
      this.el.codexNone.hidden = !!codex.found;
      const left = codex.total - codex.found;
      this.el.codexUnseenLab.hidden = !left;
      this.el.codexUnseenLab.querySelector('em').textContent = left === codex.total
        ? 'destroy one to record it' : `${left} left`;
    }
    for (const e of CODEX) {
      const cell = this.codexCells.get(e.id);
      const known = codex.has(e.id);
      cell.classList.toggle('locked', !known);
      // Into the section it now belongs to. Cells are moved rather than
      // rebuilt so a drawn specimen is drawn once and stays drawn.
      const home = known ? this.el.codexKnown : this.el.codexUnseenBox;
      if (cell.parentElement !== home) home.appendChild(cell);
      // A blank tile says "not seen" on its own. The name used to be redacted
      // into block glyphs -- thirty-four strings of ▚▞▜▙ at 10px and 1.93 to
      // one, which reads as text that has gone wrong rather than as a secret.
      cell.querySelector('.codexName').textContent = known ? e.name : '';
      cell.querySelector('.codexLine').textContent = known ? e.line : '';
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
    // No heading. The tab above this panel already says SYSTEM, and the other
    // two tabs open on their subject -- the machine, the count -- not on
    // their own name repeated.
    const grid = document.createElement('div');
    grid.className = 'menuGrid';
    const g = this.game;
    p.appendChild(this.volumeRow());
    /*
     * The rest of the options. One row each, tapped to step through their
     * values, because three of them have three states and a toggle cannot say
     * "medium". They are preferences rather than progress, so they live in
     * their own store and RESET SIMULATION does not touch them — see
     * src/settings.js.
     */
    const opts = document.createElement('div');
    opts.className = 'optRows';
    this.optRows = Object.keys(PREFS).map((key) => {
      const b = document.createElement('button');
      b.className = 'optRow';
      b.type = 'button';
      b.innerHTML = `<span class="optName">${PREFS[key].label}</span>`
        + `<span class="optPips"></span><span class="optWord"></span>`;
      const pips = b.querySelector('.optPips');
      for (let i = 0; i < PREFS[key].of.length; i++) pips.appendChild(document.createElement('i'));
      b.addEventListener('click', () => { cyclePref(key); this.syncSystem(); });
      opts.appendChild(b);
      return { key, el: b, pips: [...pips.children], word: b.querySelector('.optWord') };
    });
    p.appendChild(opts);

    /*
     * DEBUG here; RESET at the very bottom, on its own, under its own
     * heading. They were a pair of equal tiles side by side -- one opens a
     * developer panel and the other wipes the run, the glossary and the
     * opening lines with no undo, and nothing about the layout said which was
     * which. A destructive action is not a peer of a convenience.
     */
    const rows = [
      ['DEBUG', 'developer panel', () => { this.setOpen(false); g.hud.toggleDebug(true); }],
    ];
    for (const [label, sub, run, ask] of rows) {
      const b = document.createElement('button');
      b.className = 'menuCell';
      b.innerHTML = `<span class="cellName">${label}</span><span class="cellSub">${sub}</span>`;
      b.addEventListener('click', () => {
        // Anything that throws the run away asks first. There is no undo and
        // the button sits one tap from the volume control.
        if (ask && this.armedCell !== b) {
          if (this.armedCell) this.armedCell.classList.remove('armed');
          this.armedCell = b;
          b.classList.add('armed');
          b.querySelector('.cellSub').textContent = 'tap again — this cannot be undone';
          clearTimeout(this.cellTimer);
          this.cellTimer = setTimeout(() => {
            b.classList.remove('armed');
            b.querySelector('.cellSub').textContent = sub;
            this.armedCell = null;
          }, 4000);
          return;
        }
        if (ask) {
          clearTimeout(this.cellTimer);
          b.classList.remove('armed');
          b.querySelector('.cellSub').textContent = sub;
          this.armedCell = null;
        }
        run();
        this.syncSystem();
      });
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

    /*
     * BUILD says which build this claims to be; REV says which bytes it is.
     * Two devices showing the same pair are running the same code -- which is
     * the thing that could not be checked before, and cost an afternoon.
     *
     * It was 8.5px at 1.84 to one, which is a stamp you cannot read off a
     * phone held at arm's length. A version stamp that exists to be compared
     * between two devices has exactly one requirement.
     */
    const foot = document.createElement('div');
    foot.className = 'menuStamp';
    foot.innerHTML = `<span>SESSION 7749</span><span>BUILD <b>${BUILD}</b></span>`
      + `<span>REV <b>${REV}</b></span>`;
    p.appendChild(foot);

    /*
     * And the one thing on this panel that cannot be undone, at the bottom,
     * alone, wearing its own colour. It used to be a tile beside DEBUG.
     */
    p.appendChild(heading('DANGER', ''));
    const wipe = document.createElement('button');
    wipe.className = 'menuCell wipe';
    wipe.type = 'button';
    const sub = 'wipes the run, the record and the opening lines';
    wipe.innerHTML = `<span class="cellName">RESET SIMULATION</span><span class="cellSub">${sub}</span>`;
    wipe.addEventListener('click', () => {
      if (this.armedCell !== wipe) {
        if (this.armedCell) this.armedCell.classList.remove('armed');
        this.armedCell = wipe;
        wipe.classList.add('armed');
        wipe.querySelector('.cellSub').textContent = 'tap again — this cannot be undone';
        clearTimeout(this.cellTimer);
        this.cellTimer = setTimeout(() => {
          wipe.classList.remove('armed');
          wipe.querySelector('.cellSub').textContent = sub;
          this.armedCell = null;
        }, 4000);
        return;
      }
      clearTimeout(this.cellTimer);
      wipe.classList.remove('armed');
      wipe.querySelector('.cellSub').textContent = sub;
      this.armedCell = null;
      this.setOpen(false);
      g.resetAll();
    });
    p.appendChild(wipe);
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
    /*
     * ...and what it is set to. SCREEN SHAKE and EFFECTS both end in a word --
     * FULL, HALF, OFF -- and the volume, the one control on this panel with
     * six positions instead of three, ended in nothing at all. Six lit boxes
     * is a picture of a level; it is not a reading of one.
     */
    const word = document.createElement('span');
    word.className = 'volWord';
    this.el.volWord = word;

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
    // ...after the bar, because SCREEN SHAKE and EFFECTS both read
    // name / pips / word and a third row reading name / word / pips is one
    // row disagreeing with the two under it.
    wrap.appendChild(word);
    return wrap;
  }

  syncSystem() {
    if (this.optRows) {
      for (const r of this.optRows) {
        const spec = PREFS[r.key];
        const at = spec.of.indexOf(pref(r.key));
        r.word.textContent = prefWord(r.key);
        // Nothing lit at the bottom step: a meter reading "one of three" for
        // OFF says the opposite of what it is. Same rule as the volume bar.
        r.pips.forEach((p, i) => p.classList.toggle('on', at > 0 && i <= at));
        r.el.classList.toggle('off', at === 0 && spec.of[0] === 0);
      }
    }
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
    if (this.el.volWord) {
      const say = at === 0 ? 'MUTE' : `${Math.round(VOLUME_STEPS[at] * 100)}%`;
      if (this.el.volWord.textContent !== say) this.el.volWord.textContent = say;
      this.el.volWord.classList.toggle('off', at === 0);
    }
  }

  // -------------------------------------------------------------- live sync

  /** Called every frame; cheap because every write is diffed. */
  sync(world) {
    // The badge on the energy chip. Only recomputed when a purse actually
    // moves — energy ticks up constantly, so this is the diff that matters.
    const purse = `${world.energy | 0}:${world.remainder | 0}:${world.offers.taken.length}`;
    if (purse !== this.lastPurse) {
      this.lastPurse = purse;
      this.game.hud.setBuys(this.reachCount(world));
    }
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
