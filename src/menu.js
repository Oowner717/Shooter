// The menu. One button in the top bar opens a sheet over the bottom of the
// screen, where the thumb already is; the simulation holds while it is open.
//
// It explains rather than controls. Everything that is chosen — rounds, mines,
// the two that run on their own — is chosen on the play screen, so the sheet
// carries the two records instead: what you shoot with, and what you have
// shot. Both are built from data, so a new round or a new object is a table
// entry and no markup.

import { CODEX, FIELD_ENTRIES, ANOMALY_ENTRIES, codex } from './codex.js';
import { CONTROLS } from './narrative.js';
import { ARSENAL, ARSENAL_GROUPS, specRows } from './arsenal.js';
import { SLOTS } from './loadout.js';

/** Every arm, by the key the tree calls it — BOLT is `standard` in here. */
const ARM_BY_KEY = new Map(ARSENAL.map((a) => [a.key === 'standard' ? 'bolt' : a.key, a]));
import { ABILITIES } from './abilities.js';
import { gunAmmo } from './turrets.js';
import { PREFS, pref, cyclePref, prefWord } from './settings.js';
import { VOLUME_STEPS } from './audio.js';
import { CFG, BUILD, REV } from './config.js';
import { swipeToDismiss, swipeTabs } from './swipe.js';
import { lastSession, lifetime, LOCK } from './sandbox.js';
import { TREE, NODES, DETACHED, priceOf } from './tree.js';
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

/**
 * Does this row apply to everything in its category rather than to one arm?
 *
 * The same walk up, looking for the `universal` mark tree.js puts on the three
 * ALL-X groups. A node under ALL MINES is universal; DEEP CHARGE is, SLEDGE --
 * which hangs off SLUG -- is not. Read off the group rather than off a list of
 * ids, so a node moved between the two changes register by being moved.
 */
function universal(n) {
  for (let at = n; at; at = at.parent) if (at.universal) return true;
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

/** A padlock, for the sealed tab and its room. */
/** The tree, for the door at the foot of a loadout tab. */
const TREE_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
  + 'stroke-linecap="square"><path d="M12 21V9M12 9 5 4M12 9l7-5"/>'
  + '<circle cx="12" cy="22" r="1.4" fill="currentColor" stroke="none"/>'
  + '<circle cx="4.4" cy="3.2" r="1.6"/><circle cx="19.6" cy="3.2" r="1.6"/></svg>';

const BRANCH_MARK = {
  turret: bm('<path d="M12 21V9"/><path d="M9 12 12 8.6 15 12"/><path d="M4.6 18.6 12 21l7.4-2.4"/>'),
  ammo: bm('<circle cx="12" cy="7" r="2.8" fill="currentColor" stroke="none"/><path d="M12 21V12"/><path d="M8.6 15.5h6.8" opacity=".6"/>'),
  mines: bm('<path d="M3.5 19h17"/><path d="M8 19a4 4 0 0 1 8 0"/><path d="M12 12.5V7"/>'),
  abilities: bm('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'),
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
 * Two menus in one sheet, from build 226.
 *
 * ARSENAL is everything you do to the machine: which rounds are on the strip,
 * which mines, the tree that sells the rest, and a sealed room above the tree
 * for what comes later. SYSTEM is everything that is not a decision -- what
 * the objects are, and the settings. They were one flat row of three tabs
 * (UPGRADES / OBJECTS / SYSTEM) plus a separate sheet for the loadout that
 * the strip's AMMO and MINES buttons opened, so the four things a player
 * touches most were in two different places with two different closes.
 *
 * The header switches menus; the row under it is the current menu's tabs;
 * the panel swipes sideways through them and crosses into the other menu at
 * the edge, so the whole thing is also one strip of six.
 *
 * ULTIMATE is a locked tab on purpose -- the room exists so the shape of the
 * menu does not change when something goes in it, and so the player knows
 * there is a tier above the tree before it opens. `sealed` keeps the tab
 * visible but marks it, and its panel says so.
 */
const GROUPS = [
  { id: 'arsenal', label: 'ARSENAL', tabs: [
    { id: 'ammo', label: 'AMMO' },
    { id: 'mines', label: 'MINES' },
    { id: 'tree', label: 'UPGRADES' },
    { id: 'ultimate', label: 'ULTIMATE', sealed: true },
  ] },
  { id: 'system', label: 'SYSTEM', tabs: [
    { id: 'codex', label: 'OBJECTS' },
    /*
     * The bench. Under SYSTEM rather than ARSENAL because it is not something
     * you fire, lay or buy -- it is a tool for looking at the ones that are --
     * and because ARSENAL's row is already four wide on a 320 screen.
     *
     * `locked` is not `sealed`: ULTIMATE's seal is permanent and says so,
     * while this one opens the moment the run buys SANDBOX. So the tab is
     * present and shut rather than absent, for the same reason the tree draws
     * the rows you cannot afford -- a door you can see is a thing to aim at.
     */
    { id: 'sandbox', label: 'ASSAY', locked: 'sandbox' },
    /*
     * The emplacements. Under SYSTEM and not ARSENAL, which is where it
     * belongs by subject -- and cannot go, measured: ARSENAL's row is already
     * four wide at 320, its two eight-character labels (UPGRADES, ULTIMATE)
     * are at 80px each with 302px of strip, and a fifth tab takes every label
     * to 60px. SYSTEM at four renders exactly as ARSENAL at four does today.
     *
     * `locked` names the thing that opens it rather than being a flag,
     * because there are two locked tabs now and they open on different facts.
     */
    { id: 'guns', label: 'TURRETS', locked: 'guns' },
    { id: 'system', label: 'SETTINGS' },
  ] },
];
const TABS = GROUPS.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g.id })));
const TAB_BY_ID = new Map(TABS.map((t) => [t.id, t]));

export class Menu {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('menu'),
      groups: $('menuGroups'),
      tabs: $('menuTabs'),
      panels: $('menuPanels'),
      btn: $('menuBtn'),
      scrim: $('menuScrim'),
      close: $('menuClose'),
    };
    this.open = false;
    this.tab = 'tree';
    this.cells = new Map(); // key -> element, for the active-state sync
    // Locked tabs, by what opens them. Two of them, and they open on
    // different facts -- ASSAY on a node, TURRETS on a gun standing.
    this.lockTabs = new Map();
    this.codexCells = new Map();
    this.lastFound = -1;

    this.buildTabs();
    this.buildLoadout('ammo');
    this.buildLoadout('mines');
    this.buildTree();
    this.buildUltimate();
    this.buildSandbox();
    this.buildGuns();
    this.buildCodex();
    this.buildSystem();
    this.show('tree');
    // The lock starts on: a fresh run has not bought it, and `show` above does
    // not visit a tab it is not showing.
    this.syncSandbox();
    this.syncUltimate();
    // Sideways through the tabs. Bound on the scroller rather than the sheet
    // so the dismiss below, which owns the vertical axis, never sees it.
    swipeTabs(this.el.panels, {
      onPrev: () => this.step(-1),
      onNext: () => this.step(1),
    });

    // The hamburger is the SYSTEM door: OBJECTS and SETTINGS. ARSENAL has
    // three doors of its own on the field -- the energy chip and the strip's
    // AMMO and MINES buttons -- so the one button that is not about a
    // decision opens the menu that is not about one.
    this.el.btn.addEventListener('click', () => {
      if (this.open) { this.setOpen(false); return; }
      this.openTab(this.group() === 'system' ? this.tab : 'codex');
    });
    this.el.close.addEventListener('click', () => this.setOpen(false));
    this.el.scrim.addEventListener('click', () => this.setOpen(false));
    // Down: the sheet enters from below and that is the way it goes back. Its
    // panels scroll, and the helper refuses a drag the content still wants.
    swipeToDismiss(this.el.root, {
      dir: 'down', onClose: () => this.setOpen(false),
    });
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
    // The mode row is play-screen furniture; a sheet over the whole screen is
    // not the place to leave it standing.
    if (on && this.game.hud) this.game.hud.openAimRow(false);
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
    if (on) { this.syncCodex(); this.syncTree(); this.syncSandbox(); this.syncUltimate(); }
    // The machine only draws while it is being looked at.
    if (on && this.tab === 'tree') this.runHero(); else this.stopHero();
  }

  buildTabs() {
    const gf = document.createDocumentFragment();
    for (const g of GROUPS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menuGroup';
      b.dataset.group = g.id;
      b.textContent = g.label;
      // Into the group on the tab it was last on, so switching back and
      // forth does not lose your place.
      b.addEventListener('click', () => this.show(this.last[g.id] || g.tabs[0].id));
      gf.appendChild(b);
    }
    this.el.groups.appendChild(gf);
    this.last = {};

    const tf = document.createDocumentFragment();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `menuTab${t.sealed ? ' sealed' : ''}`;
      b.dataset.tab = t.id;
      b.dataset.group = t.group;
      b.innerHTML = t.sealed || t.locked
        ? `<span class="tabLock" aria-hidden="true">${LOCK}</span>${t.label}`
        : t.label;
      // A lock that can come off. Re-read every time the sheet opens, because
      // the tab is bought from the tree two tabs along.
      if (t.locked) this.lockTabs.set(t.locked, b);
      b.addEventListener('click', () => this.show(t.id));
      tf.appendChild(b);
    }
    this.el.tabs.appendChild(tf);
  }

  /** Which menu the current tab belongs to. */
  group() {
    const t = TAB_BY_ID.get(this.tab);
    return t ? t.group : GROUPS[0].id;
  }

  /** The tab `n` places along the strip of six, wrapping at neither end. */
  step(n) {
    const i = TABS.findIndex((t) => t.id === this.tab);
    const j = Math.max(0, Math.min(TABS.length - 1, i + n));
    if (j !== i) this.show(TABS[j].id);
    return this.tab;
  }

  /** Open the sheet on a tab: the one call every door on the field makes. */
  openTab(tab) {
    if (!TAB_BY_ID.has(tab)) return false;
    this.setOpen(true);
    this.show(tab);
    return true;
  }

  show(tab) {
    if (!TAB_BY_ID.has(tab)) tab = 'tree';
    this.tab = tab;
    const group = this.group();
    this.last[group] = tab;
    // Same rule as the sheet: leaving this tab abandons whatever was armed.
    this.armRow(null);
    for (const b of this.el.groups.children) b.classList.toggle('on', b.dataset.group === group);
    // Only this menu's tabs are in the row. The other menu's are hidden
    // rather than removed, so the row is one element built once.
    for (const b of this.el.tabs.children) {
      b.hidden = b.dataset.group !== group;
      b.classList.toggle('on', b.dataset.tab === tab);
    }
    for (const p of this.el.panels.children) p.hidden = p.dataset.panel !== tab;
    // The panels share one scroller. Leaving the tree scrolled halfway and
    // switching to a short tab landed on its bottom edge, or on nothing.
    this.el.panels.scrollTop = 0;
    if (tab === 'codex') this.syncCodex();
    if (tab === 'tree') this.syncTree();
    if (tab === 'sandbox') this.syncSandbox();
    if (tab === 'guns') this.syncGuns();
    if (tab === 'ultimate') this.syncUltimate();
    // The loadout tabs are filled by the HUD, which owns the strip they
    // describe; it is told which group is up and does the rest.
    if ((tab === 'ammo' || tab === 'mines') && this.game.hud) {
      this.game.hud.showLoadoutPanel(this.game.world, tab);
    }
    if (this.open && tab === 'tree') this.runHero(); else this.stopHero();
  }

  /*
   * ---- the two loadout tabs ----
   *
   * The rows themselves are rendered by Hud.syncLoadoutSheet, which has owned
   * that job since the loadout was a sheet of its own; what is built here is
   * the room -- the slots, the list, and the door to the tree at the foot --
   * one set per group, so AMMO and MINES keep their own scroll and their own
   * door. The HUD is handed the elements by id, the way it always was.
   */
  buildLoadout(group) {
    const p = this.panel(group, 'loadout');
    const note = document.createElement('div');
    note.className = 'loadNote';
    note.textContent = `choose what sits on the strip · ${SLOTS[group]} slots`;
    const slots = document.createElement('div');
    slots.className = 'loadSlots';
    slots.id = `loadSlots_${group}`;
    const list = document.createElement('div');
    list.className = 'loadList';
    list.id = `loadList_${group}`;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'loadMore';
    more.id = `loadMore_${group}`;
    more.innerHTML = `<span class="loadMoreIcon" aria-hidden="true">${TREE_MARK}</span>`
      + '<span class="loadMoreBody"><span class="loadMoreName">UPGRADES</span>'
      + '<span class="loadMoreLine"></span></span>'
      + '<span class="loadMoreGo" aria-hidden="true">&#8250;</span>';
    // The door: this group's own branch of the tree, not the top of it.
    more.addEventListener('click', () => this.openTo(group));
    p.append(note, slots, list, more);
    return p;
  }

  /*
   * ULTIMATE. Sealed, and the panel says so in the game's own voice rather
   * than with an empty grid: a locked door that looks like a locked door is a
   * promise, and an empty room is a bug report.
   */
  /**
   * The SANDBOX room: what it is, and the way in.
   *
   * Two states in one panel rather than two panels. Shut, it says what the
   * thing is and what it costs, because a locked door that does not say what
   * is behind it is a locked door nobody saves for. Open, it is one button.
   */
  buildSandbox() {
    const p = this.panel('sandbox', 'sandbox');
    const shut = document.createElement('div');
    shut.className = 'sealedRoom';
    shut.innerHTML = `<span class="sealedMark" aria-hidden="true">${LOCK}</span>
      <span class="sealedName">THE ASSAY</span>
      <span class="sealedLine">An instrumented target and a counter, and
      nothing else on the field. Shoot it with anything you have and read
      exactly what every round, mine and ability is delivering &mdash; per
      second, per source. Nothing there is earned and nothing there is spent,
      but the rig keeps a record of everything you have ever put into it.</span>
      <span class="sealedLine sbCost">Bought from UPGRADES, at the top of the tree.</span>`;

    const open = document.createElement('div');
    open.className = 'sbRoom';
    open.hidden = true;
    open.innerHTML = `<span class="sealedName">THE ASSAY</span>
      <span class="sealedLine">One instrumented rig and four rates. Waves,
      energy, corruption and rules are all off, and your kit is exactly what it
      is in the run. Leave whenever you like &mdash; the run is written down
      before you go in and handed back when you come out.</span>
      <span class="sealedLine">Three rooms, one per era: the old field with
      DUMMY on it, the new field &mdash; no building, no wall &mdash; with the
      second form and D2 on it, and a third that is not built yet. Each keeps
      its own numbers and its own record, and resetting one resets only
      that one.</span>`;
    const go = document.createElement('button');
    go.className = 'sbEnter';
    go.textContent = 'ENTER THE ASSAY';
    go.addEventListener('click', () => {
      /*
       * The sheet closes FIRST, and that ordering is the whole of a bug that
       * shipped in 236. `body.menuOpen #sandbox` is `display: none`, and
       * `getBoundingClientRect()` on a `display: none` element returns all
       * zeros -- so `Sandbox.standoff`, which stands the rig clear of the
       * readout's measured bottom edge, measured zero and put the rig at its
       * preferred distance with a 212px panel on top of it. Every case for it
       * called `enterSandbox()` directly and never had the menu open.
       *
       * `standoff` refuses to answer off an unrendered panel now as well, so
       * this ordering is belt and the refusal is braces.
       */
      if (this.game.world.sandbox || this.game.world.phase !== 'staging') return;
      this.setOpen(false);
      this.game.enterSandbox();
    });
    open.appendChild(go);
    /*
     * ...and what the last visit measured.
     *
     * The room was one button and two thirds of a screen of nothing under it.
     * The numbers are the whole reason the bench exists, so the tab carries
     * the last session's headline and its three heaviest sources -- which
     * also means the figures survive walking out, which they did not until
     * `ledger.disarm()` replaced the reset on the way out.
     */
    const last = document.createElement('div');
    last.className = 'sbLast';
    open.appendChild(last);

    p.append(shut, open);
    this.sandboxRoom = { shut, open, go, last };
  }

  // ------------------------------------------------------------ emplacements

  /**
   * The TURRETS tab: what the line is, what it is carrying, and six upgrades.
   *
   * Shut, it says what an emplacement is and where you buy one, because the
   * only place you CAN buy one is a lot on the field and a tab that opened
   * onto six rows you cannot reach would be a worse door than a locked one.
   *
   * Open, it is the switch, one line of state, and the six. The rows are the
   * tree's own `makeCard`, pushed into `this.items`, so pricing, levels,
   * affordability, the arm-then-buy press and the whole of `syncTree` are the
   * tree's -- there is exactly one purchase path in this game and this is not
   * a second one.
   */
  buildGuns() {
    const p = this.panel('guns', 'guns');

    const shut = document.createElement('div');
    shut.className = 'sealedRoom';
    shut.innerHTML = `<span class="sealedMark" aria-hidden="true">${LOCK}</span>
      <span class="sealedName">THE EMPLACEMENTS</span>
      <span class="sealedLine">Six small auto-turrets, one per build lot on the
      new field. Each is bought once, stands where you put it, and shoots
      whatever comes into its reach &mdash; no aim mode, no ammunition slot,
      nothing to steer. What they buy is ground you no longer have to
      face.</span>
      <span class="sealedLine sbCost">Tap a build lot on the field to raise the
      first one. This opens when it stands.</span>`;

    const open = document.createElement('div');
    open.className = 'gunRoom';
    open.hidden = true;

    const head = document.createElement('div');
    head.className = 'gunHead';
    head.innerHTML = '<span class="sealedName">THE EMPLACEMENTS</span>'
      + '<span class="gunState"></span>';

    /*
     * The switch. One control, and it is the only setting they have: the line
     * is running or it is not. It says what it WILL DO rather than what is
     * true -- a button labelled with its own state is a button you have to
     * read twice.
     */
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'gunSwitch';
    sw.addEventListener('click', () => {
      const w = this.game.world;
      w.gunsOn = w.gunsOn === false;
      this.syncGuns();
      this.game.checkpoint();
    });

    const grid = document.createElement('div');
    grid.className = 'branchGrid gunGrid';
    /*
     * The six, and they are the tree's cards. `makeCard` takes a root only for
     * an arm's noun, and these are leaves, so `null` is the honest argument.
     */
    // The NODES and not the upgrade defs: `makeCard` and `syncTree` read
    // `levels`, `cost`, `step`, `tiers` and `needs` off a node, which is what
    // `leaf()` builds. `DETACHED` is that, for the six that live in here.
    this.gunNodes = DETACHED;
    for (const n of this.gunNodes) {
      const card = this.makeCard(n, null);
      grid.appendChild(card);
      this.items.push({ n, card });
    }

    open.append(head, sw, grid);
    p.append(shut, open);
    this.gunRoom = { shut, open, sw, state: head.querySelector('.gunState') };
  }

  /** The lock comes off the moment one is standing. */
  syncGuns() {
    const w = this.game.world;
    const n = (w.guns || []).length;
    this.setLock('guns', n > 0);
    const r = this.gunRoom;
    if (!r) return;
    r.shut.hidden = n > 0;
    r.open.hidden = n === 0;
    if (!n) return;
    const on = w.gunsOn !== false;
    const ammo = gunAmmo(w);
    r.sw.textContent = on ? 'STAND THE LINE DOWN' : 'BRING THE LINE UP';
    r.sw.classList.toggle('off', !on);
    r.state.textContent = `${n} OF 6 STANDING \u00b7 ${on ? 'RUNNING' : 'STOOD DOWN'} \u00b7 ${ammo.name}`;
    // The cards are the tree's, so their state is the tree's sync.
    this.syncTree();
  }

  /** The lock comes off the moment the run owns the node. */
  syncSandbox() {
    const owned = !!(this.game.world.up && this.game.world.up.sandbox);
    const r = this.sandboxRoom;
    if (r) {
      r.shut.hidden = owned;
      r.open.hidden = !owned;
      // Only from a running field: the title screen and an ending are not one.
      r.go.disabled = this.game.world.phase !== 'staging';
      const s = owned ? lastSession() : null;
      /*
       * ...and the record under it, which is a different kind of number and
       * says so. The session is gone when the app is killed; this one is what
       * the rig is wearing and it is still there next week. Shown whenever
       * there is one, even on a launch where the room has not been opened,
       * because that is the whole point of it being a record.
       */
      const lt = owned ? lifetime() : null;
      r.last.hidden = !s && !lt;
      const head = s
        ? `<h5 class="first">LAST SESSION</h5>
           <div class="sbLastHead">
             <div><b>${s.clock}</b><em>ELAPSED</em></div>
             <div><b>${s.total}</b><em>DAMAGE</em></div>
             <div><b>${s.dps}</b><em>DPS AVG</em></div>
           </div>`
          + s.top.map((t) => `<div class="sbLastRow"><i style="background:${t.tone}"></i>`
            + `<span>${t.name}</span><b>${t.value}</b></div>`).join('')
        : '';
      const rec = lt
        ? `<h5${head ? '' : ' class="first"'}>LIFETIME</h5>
           <div class="sbLife">
             <span class="sbLifeBar"><b style="width:${lt.pct.toFixed(1)}%"></b></span>
             <span class="sbLifeNum">${lt.total}</span>
             <span class="sbLifeOf">${lt.beads >= lt.of ? 'SHELL COMPLETE'
               : `${lt.beads}/${lt.of} &middot; ${lt.next} TO NEXT`}</span>
           </div>`
        : '';
      r.last.innerHTML = head + rec;
    }
    this.setLock('sandbox', owned);
  }

  /**
   * A lock that can come off.
   *
   * Two classes, not `hidden` on the padlock: `.tabLock` carries
   * `display: inline-block`, so `[hidden]`'s user-agent rule -- one class of
   * specificity, and it loses to any author rule -- would flip the attribute
   * and leave the lock on the screen. The trap CLAUDE.md keeps a note about.
   */
  setLock(which, owned) {
    const b = this.lockTabs.get(which);
    if (!b) return;
    b.classList.toggle('sealed', !owned);
    b.classList.toggle('unlocked', owned);
  }

  /**
   * ULTIMATE: what is above the tree, and how far off it is.
   *
   * Two states in one panel, the shape the testbed's room already uses. Shut,
   * it names the two things that gate it and COUNTS them, because a locked
   * door that does not say how far off it is, is a locked door nobody saves
   * for -- and both halves of this gate are things you are doing anyway, so
   * the counters move on their own. Open, it is one button.
   *
   * The counters are read off the same facts `Game.rigDone` and the price are:
   * there is no second definition of "finished" anywhere.
   */
  buildUltimate() {
    const p = this.panel('ultimate', 'ultimate');
    const shut = document.createElement('div');
    shut.className = 'sealedRoom';
    shut.innerHTML = `<span class="sealedMark" aria-hidden="true">${LOCK}</span>
      <span class="sealedName">NEW FORM</span>
      <span class="sealedLine">Not an upgrade to the machine &mdash; a
      different machine, on a field you have not seen. Everything you have
      built comes with it.</span>
      <span class="sealedLine ufNeed"></span>
      <span class="sealedLine ufNeed2"></span>
      <span class="sealedLine sbCost">Bought from UPGRADES, at the top of the
      tree, with what the anomalies leave behind.</span>`;

    const open = document.createElement('div');
    open.className = 'sbRoom';
    open.hidden = true;
    open.innerHTML = `<span class="sealedName">NEW FORM</span>
      <span class="sealedLine">The field is taken, the machine comes apart in
      the order you built it, and what stands up is not the same turret. Thirty
      seconds. Tap to cut it short at any point &mdash; it lands in the same
      place either way.</span>`;
    const go = document.createElement('button');
    /*
     * `ufEnter`, NOT `sbEnter`. The testbed's door owns that class and its own
     * case reaches for it with a bare `document.querySelector('.sbEnter')` --
     * and this panel is built FIRST, so a shared class silently handed the
     * testbed's case this button instead. It clicked BEGIN, started a
     * thirty-second cinematic, never entered the room, and died on a dummy
     * that was never placed. A selector another thing already owns is not a
     * style choice.
     */
    go.className = 'ufEnter';
    go.textContent = 'BEGIN';
    go.addEventListener('click', () => {
      // The sheet closes FIRST, for the reason the testbed's door records: a
      // panel that is `display: none` measures zero, and act I is a camera
      // move that wants a real viewport under it.
      this.setOpen(false);
      this.game.beginEvolve();
    });
    open.appendChild(go);
    p.append(shut, open);
    this.ultimateRoom = { shut, open, go,
      need: shut.querySelector('.ufNeed'), need2: shut.querySelector('.ufNeed2') };
    return p;
  }

  /**
   * ...and the two counters under it, live.
   *
   * Called from `sync`, so they move while you watch. Both are read off the
   * same facts the GATE is read off -- `Game.rigDone` and `reconciled.length`
   * against the price -- so the room cannot say you are ready while the tree
   * says locked.
   */
  syncUltimate() {
    const r = this.ultimateRoom;
    if (!r) return;
    const g = this.game;
    const w = g.world;
    const done = g.owned('recast') > 0 || w.era === 2;
    r.shut.hidden = done;
    r.open.hidden = !done;
    if (done) {
      // Already on the new field: the room has nothing left to offer.
      r.go.disabled = w.era === 2 || w.phase !== 'staging' || !!w.evolve;
      r.go.textContent = w.era === 2 ? 'DONE' : 'BEGIN';
      return;
    }
    // Off `NODES` and `RIG_LEVELS`, which is the denominator the hero readout
    // already counts against -- not a second walk with its own filter.
    let have = 0;
    for (const n of NODES) {
      if (!n.id || !n.parent || n.parent.key !== 'turret') continue;
      have += g.owned(n.id);
    }
    const want = RIG_LEVELS;
    const anom = w.reconciled.length;
    const need = CFG.ordinal.recast;
    r.need.textContent = `THE MACHINE FINISHED \u00b7 ${have} of ${want}`;
    r.need.classList.toggle('ufMet', want > 0 && have >= want);
    r.need2.textContent = `EVERY ANOMALY RECONCILED \u00b7 ${Math.min(anom, need)} of ${need}`;
    r.need2.classList.toggle('ufMet', anom >= need);
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

    /*
     * No NEXT shelf, and no "N more for the next".
     *
     * Both were built to answer "what can I buy right now", and both answered
     * it as an ordering: two cards under a heading that says NEXT read as the
     * two you are supposed to buy next, and a countdown to the cheapest thing
     * reads as a queue. There is no order to this tree -- every branch is open
     * from the first frame and nothing in it is a prerequisite for anything
     * else -- so the panel should not imply one. The exception is the seven
     * ways in, and those are gated in the tree itself rather than hinted at
     * here; see `needs` in upgrades.js.
     *
     * What is left is the machine, what you have built of it, and the
     * branches. The affordable count still exists where it is a fact rather
     * than a suggestion: on the energy chip out on the field, which says how
     * many things are in reach without saying which.
     */
    const head = document.createElement('div');
    head.className = 'treeHead';
    head.innerHTML = '<span class="treeHeadName">ENERGY</span>'
      + '<span class="treeSouls" id="treeSouls" hidden></span>'
      + '<b id="treeBank">0</b>';

    p.appendChild(this.buildHero());
    p.appendChild(head);
    p.appendChild(this.buildBranches());

    this.el.treeBank = head.querySelector('#treeBank');
    this.el.treeSouls = head.querySelector('#treeSouls');

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
     * you go down to when you are ready, not the first thing you meet.
     */
    const order = ['turret', 'ammo', 'mines', 'abilities'];
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
           * blast radius. Only BOLT, PULSE and HAIL got a heading, and that
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
          g.className = `grpLab${n.universal ? ' univ' : ''}`;
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
   * The machine, and what you have built of it. Above the branches, because
   * the tree could say neither.
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


  /**
   * One card. The whole thing is the button — the first press turns it over,
   * the second spends. Three targets on one row is the bug menu.js already
   * fixed once and it is not being reintroduced at a larger size.
   */
  makeCard(n, root) {
    const c = document.createElement('button');
    c.type = 'button';
    /*
     * `univ` marks a row that applies to everything in its category rather
     * than to the arm beside it -- everything under ALL ROUNDS, ALL MINES and
     * ALL ABILITIES. It carries the same distinction the bone tone does (see
     * GROUP_TONE in tree.js) in a second channel, because a rule expressed
     * only as a colour is a rule a colourblind player does not get -- and
     * because the colour it replaced was BLAST's to within dE 0.6.
     */
    c.className = `shopCard${n.kind === 'arm' ? ' arm' : ''}${universal(n) ? ' univ' : ''}`;
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
     * BOLT, PULSE and HAIL are issued rather than bought, so they have no id
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
   * One card's five states. Every card in every branch is painted by this
   * one function, so a card cannot say one thing in one place and another
   * elsewhere -- which is how the tree's price box and its pips drifted.
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
   * every card came out the same colour whatever it was upgrading. The tone
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
  syncRoom(rows) {
    const g = this.game;
    const w = g.world;

    /*
     * A part landed. Detected here rather than announced from Game.buy so
     * there is one path -- anything that adds to the ledger flares, including
     * the debug hooks, and nothing has to remember to call this.
     */
    const taken = w.ledger;
    if (this.tookAt === undefined) this.tookAt = taken.length;
    if (taken.length > this.tookAt) {
      const last = NODES.find((n) => n.id === taken[taken.length - 1]);
      this.flare(last && last.tone);
    }
    this.tookAt = taken.length;

    // What you have built. No denominator: there are 133 levels in the tree
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
    // scale is against the finished radius rather than the current one -- and
    // 190 is a span in WORLD units, so it follows the field: left bare, an
    // era-2 machine needs 80 units of room below the mount against 72 the card
    // would give it, and clips with nothing to report it.
    const k = (h / dpr / (190 * CFG.scale)) * dpr;
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
    // From a loadout tab this is a jump inside the same sheet now, not a
    // sheet closing and another opening; the landing below is the same.
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

    this.syncBranches();
    this.syncRoom(this.items);
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

    /*
     * Two sections, because a boss is not a field object.
     *
     * It was one list of thirty-four in spawn order, so ORDINAL sat between
     * TOW and TALLY with nothing saying it was a boss, and the twelve things
     * the bosses make were scattered among ordinary objects they have nothing
     * to do with. The split is derived from ANOMALIES.types -- see codex.js
     * -- so the glossary cannot drift from the fights. It also found a hole:
     * TERMINUS and its two had no entries at all.
     */
    this.codexSections = [
      this.buildCodexSection(p, 'THE FIELD', 'what comes down on its own', FIELD_ENTRIES),
      this.buildCodexSection(p, 'THE ANOMALIES', 'the seven, and what they make', ANOMALY_ENTRIES),
    ];

    /*
     * AUTO AIM and AUTO FIRE last. They came here in 154 because they are a
     * reference and this is where the references are -- but put at the top
     * they pushed the count, which is the entire subject of this tab, below
     * the fold. A reference for two systems you never buy does not open the
     * page about what you have collected.
     */
    this.buildAuto(p);
  }

  /**
   * One half of the glossary: a heading carrying its own count, the entries
   * recorded in it, and a block of tiles for the ones that are not.
   */
  buildCodexSection(p, title, note, entries) {
    const lab = heading(title, note);
    p.appendChild(lab);
    const known = document.createElement('div');
    known.className = 'codexGrid';
    p.appendChild(known);
    const none = document.createElement('div');
    none.className = 'codexNone';
    none.textContent = 'Nothing here yet.';
    p.appendChild(none);
    const unseen = document.createElement('div');
    unseen.className = 'codexUnseen';
    p.appendChild(unseen);
    for (const e of entries) {
      const cell = document.createElement('div');
      cell.className = 'codexCell';
      cell.innerHTML = '<div class="codexArt"><canvas width="72" height="72"></canvas></div>'
        + '<div class="codexBody"><div class="codexName"></div><div class="codexLine"></div></div>';
      unseen.appendChild(cell);
      this.codexCells.set(e.id, cell);
    }
    return { entries, lab, note, known, none, unseen };
  }

  /** Redacted until it has been destroyed once. */
  syncCodex() {
    if (this.lastFound === codex.found) return;
    this.lastFound = codex.found;
    if (this.el.codexCount) {
      this.el.codexCount.innerHTML = `<b>${codex.found}</b> OF ${codex.total} RECORDED`;
      this.el.codexBar.style.width = `${(codex.found / codex.total) * 100}%`;
    }
    for (const sec of this.codexSections || []) {
      const have = sec.entries.filter((e) => codex.has(e.id)).length;
      // Each half carries its own fraction: 12/16 of the field is a different
      // thing from 3/21 of the anomalies, and one total said neither.
      sec.lab.querySelector('em').textContent = `${have}/${sec.entries.length}`;
      sec.none.hidden = have > 0;
      sec.unseen.hidden = have >= sec.entries.length;
    }
    for (const e of CODEX) {
      const cell = this.codexCells.get(e.id);
      const known = codex.has(e.id);
      cell.classList.toggle('locked', !known);
      // Into the right list of its OWN section. Cells are moved rather than
      // rebuilt so a drawn specimen is drawn once and stays drawn.
      const sec = (this.codexSections || []).find((x) => x.entries.includes(e));
      const home = !sec ? null : known ? sec.known : sec.unseen;
      if (home && cell.parentElement !== home) home.appendChild(cell);
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
    const purse = `${world.energy | 0}:${world.remainder | 0}:${world.ledger.length}`;
    if (purse !== this.lastPurse) {
      this.lastPurse = purse;
      this.game.hud.setBuys(this.reachCount(world));
      // ...and the two counters above the tree, which move on exactly the
      // things this key already watches: a level bought and a REMAINDER
      // earned. Keyed rather than per-frame, for the reason `fitBar` is.
      if (this.open) this.syncUltimate();
    }
    // ...and the emplacement tab's lock, which opens on a purchase made on the
    // FIELD rather than in here -- so nothing else in this sync would notice.
    this.setLock('guns', (world.guns || []).length > 0);
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
/*
 * How much of the frame's half-width an icon is allowed to use. Under 1 by
 * enough that nothing touches the border it is drawn inside.
 */
const SPECIMEN_FILL = 0.82;

/** Per-id scale that makes a shape fill exactly that much. Measured once. */
const specimenFit = new Map();
let fitCanvas = null;

/**
 * Every specimen used to be drawn at a flat `w * 0.34`, and the shapes are
 * not the same size as each other: measured across the whole glossary, NEEDLE
 * and TOW reached the frame's edge exactly (and clipped), WARDEN 0.94 of it
 * and TALLY 0.89, while ECHO used 0.61 and BULWARK 0.67. A 1.63x spread in a
 * grid of identical square tiles, with the biggest ones touching their border.
 *
 * So the extent is measured rather than assumed: the shape is drawn once into
 * a scratch canvas at a nominal radius, its alpha bounding box gives the true
 * half-extent, and the ratio is cached per id. A shape added later fits
 * itself. The measure runs once per id per session, off the same code path
 * that draws the cell, so it cannot drift from it.
 *
 * The scratch is TWICE the frame, which is not a detail. A first version
 * measured in a frame-sized canvas, and the two shapes that most needed
 * fitting were exactly the two that had already clipped in it: NEEDLE reaches
 * 2.24x the radius it is handed, so its measured extent came back pinned to
 * the frame edge, the correction computed from it was far too small, and it
 * clipped again. A measurement taken through the thing being corrected is not
 * a measurement.
 */
function specimenScale(id, w) {
  if (specimenFit.has(id)) return specimenFit.get(id);
  let k = 1;
  try {
    const box = w * 2;
    if (!fitCanvas) {
      fitCanvas = document.createElement('canvas');
      fitCanvas.width = box;
      fitCanvas.height = box;
    }
    const c = fitCanvas.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, box, box);
    c.save();
    c.translate(box / 2, box / 2);
    drawCodexShape(c, id, w * 0.34);
    c.restore();
    const d = c.getImageData(0, 0, box, box).data;
    const mid = box / 2;
    let reach = 0;
    for (let y = 0; y < box; y++) {
      for (let x = 0; x < box; x++) {
        if (d[(y * box + x) * 4 + 3] <= 8) continue;
        // Half-extent from the centre on the wider of the two axes, which is
        // what decides whether it touches a square frame.
        const ex = Math.max(mid - x, x + 1 - mid);
        const ey = Math.max(mid - y, y + 1 - mid);
        if (ex > reach) reach = ex;
        if (ey > reach) reach = ey;
      }
    }
    if (reach > 0) k = ((w / 2) * SPECIMEN_FILL) / reach;
  } catch (_) {
    // A context that will not hand back pixels leaves every icon where it
    // was; a glossary drawn at the old size is better than one not drawn.
    k = 1;
  }
  specimenFit.set(id, k);
  return k;
}

function drawSpecimen(canvas, id) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  ctx.clearRect(0, 0, w, w);
  ctx.save();
  ctx.translate(w / 2, w / 2);
  drawCodexShape(ctx, id, w * 0.34 * specimenScale(id, w));
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
