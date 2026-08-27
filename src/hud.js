// DOM-side interface. Canvas draws the world; HTML draws anything that has to
// be crisp, tappable and safe-area aware.

import { ABILITIES } from './abilities.js';
import { ARSENAL, specRows } from './arsenal.js';
import { CONTROLS } from './narrative.js';
import { pref, setPref } from './settings.js';
import { BUILD, CFG, ENEMY_TYPES, TYPE_BY_ID } from './config.js';
import { drawSpecimen, FORMATION_SHAPES, GROUP_MAX } from './enemies.js';

import { CODEX, codex, markLine } from './codex.js';
import {  } from './util.js';
import { Menu } from './menu.js';
import { holdFor, STACK, MIN_READ } from './tutorial.js';
import { SLOTS, carried, freeSlot } from './loadout.js';
import { heldList } from './anomaly.js';
import { readRun } from './save.js';

const $ = (id) => document.getElementById(id);

/** Sliders. The one shape that reads as "choose what goes here" at 14px. */
const CONFIG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M4 7h6M14 7h6M4 17h10M18 17h2"/>'
  + '<circle cx="12" cy="7" r="2.1"/><circle cx="16" cy="17" r="2.1"/></svg>';

/*
 * The two exclusive families, taken from the arsenal rather than written out
 * again. They were hand-kept lists of four each, from back when four was all
 * there was, and they had quietly stopped meaning what they say: SEED picks a
 * mine from MINE_KEYS and so could only ever lay one of the first four.
 */
/** Rounds that are not the default. Mutually exclusive with each other. */
export const ROUND_KEYS = ARSENAL
  .filter((a) => a.kind === 'round' && a.key !== 'standard').map((a) => a.key);
/** Mines. Also mutually exclusive, but all of them can be off at once. */
export const MINE_KEYS = ARSENAL.filter((a) => a.kind === 'mine').map((a) => a.key);

/**
 * How long ago, in as few characters as will do. Anything older than a week is
 * simply "a while" -- past that the exact figure is not what anybody is
 * deciding on, and "13d" reads as a demand to remember what happened 13 days
 * ago rather than as an invitation to pick the run back up.
 */
function ageOf(at) {
  if (!Number.isFinite(at)) return '';
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return 'a while ago';
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      killNum: $('killNum'),
      counter: $('counter'),
      tierChip: $('tierChip'),
      tierNum: $('tierNum'),
      tierHold: $('tierHold'),
      tierRow: $('tierRow'),
      alerts: $('alerts'),
      energy: $('energyNum'),
      energyChip: $('energyChip'),
      energyBuys: $('energyBuys'),
      offer: $('offer'),
      loadout: $('loadout'),
      loadMore: $('loadMore'),
      loadScrim: $('loadScrim'),
      loadTitle: $('loadTitle'),
      loadNote: $('loadNote'),
      loadSlots: $('loadSlots'),
      loadList: $('loadList'),
      counterLabel: document.querySelector('#counter em'),
      abilities: $('abilities'),
      hint: $('abilityHint'),
      barChips: $('barChips'),
      debug: $('debugPanel'),
      dbgGrid: $('dbgGrid'),
      dbgSpawn: $('dbgSpawn'),
      dbgStats: $('dbgStats'),
      bossCaption: $('bossCaption'),
      apertureBar: $('apertureBar'),
      bossBar: $('bossBar'),
      bossTitle: $('bossTitle'),
      bossPhase: $('bossPhase'),
      bossFill: $('bossFill'),
      bossGhost: $('bossGhost'),
      bossCore: document.querySelector('.bossCore'),
      bossMark3: $('bossMark3'),
      bossMark4: $('bossMark4'),
      bossShell: $('bossShell'),
      boot: $('boot'),
      bootRecord: $('bootRecord'),
      resumeNote: $('resumeNote'),
      startBtn: $('startBtn'),
      resumeBtn: $('resumeBtn'),
      quickBar: $('quickBar'),
    };

    this.slots = [];
    this.alerts = [];
    this.hintTimer = 0;
    this.hintShown = 0; // ...and how long the line now up has been up for
    this.barSig = ''; // what the top bar was last measured against

    this.recedeT = 0; // seconds the strip and the ability bar stay out of the way
    this.voiceHeld = []; // lines waiting for the screen to be quiet -- see speaking()
    this.pillHeld = []; // ...and pills waiting for room beside the band
    this.tutLines = []; // the opening's band keeps the line before
    this.lastKills = -1;

    this.buildAbilities();
    this.buildDebug();
    this.buildSpawn();
    this.buildTier();

    this.menu = new Menu(game);
    this.buildStrip();

    // The boot copy is translucent enough to read the HUD through it, and on a
    // short screen the kicker sits level with the top chips. Nothing behind the
    // title screen is live yet, so hide it until the run starts.
    document.body.classList.add('booting');

    const keys = document.querySelector('.bootKeys');
    if (keys) {
      /*
       * The two ways to shoot, and nothing else. All five entries used to be
       * here, and together they took more of the screen than the title did
       * -- while ABILITIES, UPGRADES and CORRUPTION are concepts the opening
       * script hands over one at a time in play, where they mean something.
       * LEVER and TAP are the two things a thumb needs before first contact.
       * SYSTEM > CONTROLS still carries the whole list, as its note says.
       */
      keys.innerHTML = CONTROLS.slice(0, 2)
        .map(([k, body]) => `<li><span>${k}</span> ${body(ABILITIES.length)}</li>`)
        .join('');
    }

    /*
     * The footer says two things at once: which build this is, and what to do
     * about the browser chrome.
     *
     * Add to Home Screen only goes borderless when this page is the document
     * iOS is looking at -- it reads apple-mobile-web-app-capable out of the
     * top-level <head>. Inside a frame that head belongs to the host, so the
     * advice is false there and the line says so instead. Already standalone,
     * there is nothing to advise and only the build is left.
     */
    const foot = document.querySelector('.bootFoot');
    if (foot) {
      const framed = window.top !== window.self;
      const standalone =
        navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
      const advice = standalone
        ? ''
        : framed
          ? 'Framed here. Open the page on its own to go borderless.'
          : 'Add to Home Screen for fullscreen playback.';
      foot.textContent = advice ? `${advice}  ·  BUILD ${BUILD}` : `BUILD ${BUILD}`;
    }

    this.el.loadScrim.addEventListener('click', () => game.closeLoadout());
    $('loadClose').addEventListener('click', () => game.closeLoadout());
    /*
     * The bar at the foot of the sheet. Everything reading LOCKED on that list
     * is bought in the tree and nowhere else, so the screen that shows you
     * what you have not got now has a door to the place that sells it -- and
     * it lands on this group's own branch rather than on the top of eighty
     * rows. The sheet closes on the way out: two stacked modals over the field
     * is one more than anybody asked for.
     */
    this.el.loadMore.addEventListener('click', () => {
      const group = this.loadGroup;
      game.closeLoadout();
      this.menu.openTo(group === 'mines' ? 'mines' : 'ammo');
    });

    this.el.startBtn.addEventListener('click', () => game.start());
    this.el.resumeBtn.addEventListener('click', () => game.resume());
    this.offerResume();
    this.showRecord();
    $('dbgClose').addEventListener('click', () => this.toggleDebug(false));

    /*
     * The way in. A play-screen control, so pointerdown like the rest of them
     * -- a thumb landing on it is the press. Keyboard gets its own path,
     * because pointerdown alone is right for a thumb and wrong for anything
     * else.
     */
    /*
     * The energy chip is the way into the tree. Energy is what upgrades cost,
     * so the number is the button, and the badge on it is how many things are
     * within reach right now — the one figure that decides whether opening it
     * is worth the tap.
     */
    this.el.energyChip.addEventListener('click', () => {
      this.menu.setOpen(true);
      this.menu.show('tree');
    });

    /*
     * The banner is a list now, one row per boss whose way in is held, so
     * the press has to say *which* way. Delegated rather than bound per row:
     * the rows are rebuilt whenever what is held changes, and a listener per
     * row would be rebound with them.
     */
    const open = (ev) => {
      const row = ev.target.closest && ev.target.closest('.apRow');
      if (!row) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.game.openBoss(Number(row.dataset.n) || 1);
    };
    this.el.apertureBar.addEventListener('pointerdown', open);
    this.el.apertureBar.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.el.apertureBar.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      open(ev);
    });

    // Everything above is what `preboot` was waiting for: the strip, the
    // abilities, the menu, the controls list, the build stamp and whether
    // there is a run to continue. The overlay can be looked at now.
    document.documentElement.classList.remove('preboot');
  }

  // ----------------------------------------------------------------- strip

  /**
   * The row above the ability bar: mines, the two that run on their own, then
   * ammunition. Everything here is bound on pointerdown, like the abilities
   * are, so a tap registers the instant the thumb lands and nothing opens,
   * pauses or takes the shot the turret would otherwise have fired.
   */
  buildStrip() {
    const w = this.game.world;
    this.strip = [];
    this.el.toggles = {};
    this.el.quickBar.innerHTML = '';

    // Five bands: the mines stacked at the left edge, a button to choose which
    // mines those are, the two that run on their own in the middle where the
    // thumb rests, the same button for ammunition, and the ammunition stacked
    // at the right edge. The stacks grow upward from the floor line, along the
    // edges, clear of the turret and the lever's arc in the centre.
    const band = (cls) => {
      const d = document.createElement('div');
      d.className = cls;
      this.el.quickBar.appendChild(d);
      return d;
    };
    const mines = band('qGroup q_mines');
    const cfgMines = band('qGroup q_cfg');
    const auto = band('qGroup q_auto');
    const cfgAmmo = band('qGroup q_cfg');
    const ammo = band('qGroup q_ammo');

    /*
     * A fold at the head of each stack. Four mine slots and four ammunition
     * slots is a lot of column on a phone, and a run that lays no mines is
     * looking past that whole side of the screen at the field behind it. The
     * button stays when the stack is folded -- a control that hides itself is
     * a control nobody finds again.
     */
    mines.appendChild(this.stackFold('mines'));
    ammo.appendChild(this.stackFold('ammo'));
    // Stacks read bottom-up on screen, so slot 0 is the bottom cell.
    this.fillStack(mines, w, 'mines');
    this.fillStack(ammo, w, 'ammo');
    this.syncFolds();
    cfgMines.appendChild(this.configButton('mines'));
    cfgAmmo.appendChild(this.configButton('ammo'));
    /*
     * The two that run on their own, and the row AUTO AIM opens above them.
     *
     * The row is stacked over the cells rather than beside them -- the band
     * sits in the middle of the quick bar between the two stacks and has no
     * width to give, and everything else on this bar already grows upward off
     * the floor line. Four positions laid out sideways here would push the
     * cells under the thumb that is reaching for them.
     */
    const modes = document.createElement('div');
    modes.id = 'aimModes';
    modes.hidden = true;
    auto.appendChild(modes);
    const cells = document.createElement('div');
    cells.className = 'autoCells';
    auto.appendChild(cells);
    for (const a of ARSENAL.filter((x) => x.group === 'auto')) {
      cells.appendChild(this.cell(a));
    }
    this.el.aimModes = modes;
    this.buildAimRow();
    /*
     * ...and the cell is put back into the position the world is in.
     *
     * buildStrip is called on every purchase, and it recreates the cell from
     * the arsenal's own defaults -- label AIM, no tone. So buying anything at
     * all silently reset a turret that was in DRIFT or ALL back to looking
     * like plain AUTO AIM while it went on doing something else, which is the
     * one thing a mode control must never do.
     */
    this.setAim(w);
  }

  /**
   * One button per position the assist can be put in.
   *
   * Built once and shown or hidden per mode, rather than rebuilt on every
   * open: which positions exist is a property of what has been bought, and
   * that changes at a purchase, not at a tap.
   */
  buildAimRow() {
    const LABEL = { off: 'OFF', field: 'FIELD', drift: 'DRIFT', all: 'ALL' };
    const NOTE = {
      off: 'aim by hand',
      field: 'hostiles only',
      drift: 'grey only',
      all: 'grey + hostile',
    };
    this.aimButtons = ['off', 'field', 'drift', 'all'].map((mode) => {
      const b = document.createElement('button');
      b.className = `aimMode m_${mode}`;
      b.dataset.mode = mode;
      b.innerHTML = `<span class="aimName">${LABEL[mode]}</span>`
        + `<span class="aimNote">${NOTE[mode]}</span>`;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.game.setAim(mode);
      });
      b.addEventListener('contextmenu', (ev) => ev.preventDefault());
      this.el.aimModes.appendChild(b);
      return { mode, el: b };
    });
  }

  /**
   * Open or close it. Closing is what every other press on the field does, so
   * a row left open can never be in the way of playing -- see the pointerdown
   * handler on the canvas.
   */
  /** Is the mode row showing? */
  aimRowOpen() {
    return !!this.el.aimModes && !this.el.aimModes.hidden;
  }

  openAimRow(open) {
    const row = this.el.aimModes;
    if (!row) return false;
    if (open) {
      const modes = this.game.aimModes();
      const at = this.game.world.autoAim ? this.game.world.aimMode : 'off';
      for (const b of this.aimButtons) {
        b.el.hidden = !modes.includes(b.mode);
        b.el.classList.toggle('at', b.mode === at);
      }
    }
    row.hidden = !open;
    return true;
  }

  /** The show/hide at the head of a stack. */
  stackFold(group) {
    const b = document.createElement('button');
    b.className = `qc fold q_fold_${group}`;
    b.id = group === 'mines' ? 'foldMines' : 'foldAmmo';
    b.innerHTML = '<span class="foldArrow" aria-hidden="true"></span>'
      + '<span class="qLbl"></span>';
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const key = group === 'mines' ? 'showMines' : 'showAmmo';
      setPref(key, pref(key) ? 0 : 1);
      this.syncFolds();
    });
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return b;
  }

  /** Both stacks, against the preference. Cheap enough to call on any change. */
  syncFolds() {
    for (const [group, key] of [['mines', 'showMines'], ['ammo', 'showAmmo']]) {
      const on = !!pref(key);
      const band = this.el.quickBar.querySelector(`.q_${group}`);
      if (band) band.classList.toggle('folded', !on);
      const btn = this.el.quickBar.querySelector(`.q_fold_${group}`);
      if (!btn) continue;
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label',
        `${on ? 'Hide' : 'Show'} ${group === 'mines' ? 'mines' : 'ammunition'}`);
      // Named while it is folded, because a lone arrow beside an empty column
      // does not say what pressing it brings back.
      btn.querySelector('.qLbl').textContent = on ? '' : (group === 'mines' ? 'MINES' : 'AMMO');
    }
  }

  /** One stack of slots, filled from the loadout and padded with empties. */
  fillStack(host, world, group) {
    const keys = world.loadout[group];
    // Column-reverse would put slot 0 at the bottom without this, but it also
    // reverses the tab order; laying them out backwards keeps both honest.
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const a = key && ARSENAL.find((x) => x.key === key);
      host.appendChild(a ? this.cell(a) : this.emptySlot(group, i));
    }
  }

  /** A cell carrying something. */
  cell(a) {
    const b = document.createElement('button');
    // Kept as the id the rest of the interface has always used, so a control
    // is still found by name wherever it is looked up — and it follows the
    // thing rather than the slot, so it survives being moved.
    b.id = `tg${a.key[0].toUpperCase()}${a.key.slice(1)}`;
    b.className = `qc${a.wide ? ' wide' : ''}${a.run ? ' run' : ''}`;
    if (a.tone) b.style.setProperty('--tone', a.tone);
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', a.label);
    b.dataset.key = a.key;
    b.innerHTML = `${a.icon}<span class="qLbl">${a.short || a.label}</span>`;
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.pick(a);
    });
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    // pointerdown alone is right for a thumb and wrong for everything else.
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      this.pick(a);
    });
    this.strip.push({ key: a.key, kind: a.kind, el: b, on: null });
    this.el.toggles[a.key] = b;
    return b;
  }

  /**
   * A cell with nothing in it. It opens the same screen the button beside the
   * stack does, because an empty cell is a question and that screen is the
   * answer — and it is drawn as an outline rather than a button so the stack
   * still reads as four things long.
   */
  emptySlot(group, i) {
    const b = document.createElement('button');
    b.className = 'qc empty';
    b.setAttribute('aria-label', `Empty ${group === 'mines' ? 'mine' : 'ammunition'} slot`);
    b.innerHTML = '<span class="qLbl">—</span>';
    b.dataset.slot = String(i);
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.game.openLoadout(group);
    });
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return b;
  }

  configButton(group) {
    const b = document.createElement('button');
    b.className = `qc wide cfg q_cfg_${group}`;
    b.id = group === 'mines' ? 'cfgMines' : 'cfgAmmo';
    b.setAttribute('aria-label', group === 'mines' ? 'Configure mines' : 'Configure ammunition');
    b.innerHTML = `${CONFIG_ICON}<span class="qLbl">${group === 'mines' ? 'MINES' : 'AMMO'}</span>`;
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.game.openLoadout(group);
    });
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return b;
  }


  // -------------------------------------------------------------- loadout

  /**
   * The screen behind the two buttons on the strip. It is the only place the
   * whole arsenal is visible at once, so it shows what is locked as well as
   * what is owned — a stack of four with two things in it should say what the
   * other two could be.
   */
  showLoadout(world, group) {
    this.openAimRow(false);
    this.loadGroup = group;
    this.el.loadTitle.textContent = group === 'mines' ? 'MINES' : 'AMMUNITION';
    this.el.loadNote.textContent = `choose what sits on the strip · ${SLOTS[group]} slots`;
    // Un-hidden first: syncLoadoutSheet does nothing while the sheet is down,
    // so filling it before showing it filled nothing at all.
    this.el.loadout.hidden = false;
    this.el.loadScrim.hidden = false;
    this.syncLoadoutSheet(world);
    void this.el.loadout.offsetWidth;
    this.el.loadout.classList.add('open');
    this.el.loadScrim.classList.add('on');
    document.body.classList.add('loadoutOpen');
  }

  hideLoadout() {
    this.el.loadout.classList.remove('open');
    this.el.loadScrim.classList.remove('on');
    this.el.loadout.hidden = true;
    this.el.loadScrim.hidden = true;
    document.body.classList.remove('loadoutOpen');
  }

  syncLoadoutSheet(world) {
    const group = this.loadGroup;
    if (!group || this.el.loadout.hidden) return;
    const keys = world.loadout[group];

    // The slots, in the order they appear on the strip: bottom cell first.
    // A filled one is a button, and pressing it takes that thing back off the
    // strip — the shortest way to undo a choice is to press the choice.
    this.el.loadSlots.innerHTML = '';
    for (const key of keys) {
      const a = key && ARSENAL.find((x) => x.key === key);
      const d = document.createElement(a ? 'button' : 'div');
      d.className = `loadSlot${a ? '' : ' empty'}`;
      if (a && a.tone) d.style.setProperty('--tone', a.tone);
      d.innerHTML = a
        ? `${a.icon}<span>${a.label}</span><span class="slotOff">REMOVE</span>`
        : '<span class="loadEmpty">EMPTY</span>';
      if (a) {
        d.type = 'button';
        d.title = `Remove ${a.label} from the strip`;
        d.setAttribute('aria-label', `Remove ${a.label} from the strip`);
        d.id = `sl${a.key[0].toUpperCase()}${a.key.slice(1)}`;
        d.addEventListener('click', () => {
          if (!this.game.toggleCarry(a.key)) this.refuse(d);
        });
      }
      this.el.loadSlots.appendChild(d);
    }

    // And everything of that kind, owned or not.
    const full = freeSlot(world.loadout, group) < 0;
    const lastAmmo = group === 'ammo' && keys.filter(Boolean).length <= 1;
    this.el.loadList.innerHTML = '';
    let sealed = 0;
    for (const a of ARSENAL.filter((x) => x.group === group)) {
      const owned = world.unlocked.has(a.key);
      if (!owned) sealed++;
      const on = carried(world.loadout, a.key);
      const stuck = on ? (lastAmmo && group === 'ammo') : full;
      const b = document.createElement('button');
      b.className = `loadRow${owned ? '' : ' sealed'}${on ? ' on' : ''}${owned && stuck ? ' stuck' : ''}`;
      b.id = `ld${a.key[0].toUpperCase()}${a.key.slice(1)}`;
      if (a.tone) b.style.setProperty('--tone', a.tone);
      b.disabled = !owned;
      b.innerHTML = `<span class="loadArt">${a.icon}</span>`
        + `<span class="loadBody"><span class="loadName">${a.label}</span>`
        + (owned ? specRows(a) : '<span class="loadLine">Not yet unlocked.</span>')
        + '</span>'
        + `<span class="loadState">${on ? 'ON STRIP' : owned ? (full ? 'NO SLOT' : 'ADD') : 'LOCKED'}</span>`;
      if (owned) {
        b.addEventListener('click', () => {
          if (!this.game.toggleCarry(a.key)) this.refuse(b);
        });
      }
      this.el.loadList.appendChild(b);
    }

    /*
     * And the bar under the list, which is the answer to the question the
     * list just raised. Three things it can say, in the order they are worth
     * saying: what you can afford in this branch right now, then what is
     * still sealed in it, then nothing -- because "0 within reach" beside a
     * button is a reason not to press it, and there is always a reason.
     */
    const bar = this.el.loadMore;
    if (bar) {
      const branch = group === 'mines' ? 'mines' : 'ammo';
      const reach = this.menu ? this.menu.reachCount(world, branch) : 0;
      bar.querySelector('.loadMoreName').textContent =
        group === 'mines' ? 'MINE UPGRADES' : 'AMMUNITION UPGRADES';
      bar.querySelector('.loadMoreLine').textContent = reach
        ? `${reach} within reach`
        : sealed ? `${sealed} still sealed` : 'nothing within reach yet';
      bar.classList.toggle('reach', reach > 0);
      bar.setAttribute('aria-label',
        `Open the ${group === 'mines' ? 'mines' : 'ammunition'} branch of the upgrade tree`);
    }
  }

  // ------------------------------------------------------------- abilities

  buildAbilities() {
    const frag = document.createDocumentFragment();
    ABILITIES.forEach((def, i) => {
      const b = document.createElement('button');
      b.className = `ab${def.essential ? ' essential' : ''}`;
      b.style.color = def.color;
      b.innerHTML = `<span class="fill"></span>${def.icon}<span class="lbl">${def.name}</span>`;
      b.setAttribute('aria-label', def.name);
      const trigger = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (this.game.abilitySealed(i)) return this.refuse(b);
        return this.game.useAbility(i);
      };
      b.addEventListener('pointerdown', trigger);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      // The pip row is built empty and stays empty until something has more
      // than one use. An ability with a single charge shows nothing at all —
      // an empty slot for a thing you have not bought is a nag, not a readout.
      const pips = document.createElement('span');
      pips.className = 'pips';
      b.appendChild(pips);
      frag.appendChild(b);
      this.slots.push({
        el: b, def, fill: b.querySelector('.fill'), pips, ready: null, frac: -1,
        locked: null, held: -1, cap: -1, urgent: null, now: null,
      });
    });
    this.el.abilities.appendChild(frag);
  }

  /** ORDINAL taking a button: the same jolt as using one, in the wrong colour. */
  flashTaken(i) {
    const s = this.slots[i];
    if (!s) return;
    s.el.classList.remove('taken');
    void s.el.offsetWidth;
    s.el.classList.add('taken');
  }

  flashAbility(i) {
    const s = this.slots[i];
    if (!s) return;
    s.el.classList.remove('flash');
    // force reflow so the animation restarts
    void s.el.offsetWidth;
    s.el.classList.add('flash');
  }

  /**
   * PULSE is the only thing that answers something sitting on the turret --
   * the barrel cannot point at its own mount -- and nothing on the screen
   * said so, so its button pulses for as long as anything is attached.
   *
   * The attacker count is READ here rather than passed in. It was a second
   * parameter for one draft and there are six call sites; the five that had
   * not been told about it passed nothing, defaulted to zero, and quietly
   * cleared the class the sixth had just set. A caller that has to remember
   * a new argument is a caller that will forget it.
   */
  syncAbilities(abilities) {
    const held = this.game.world.attackers.size;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      /*
       * Two states, not one. A button that pulses "press me" while it is on
       * cooldown is a lie the player only has to be told once to stop
       * trusting it -- so `urgent` says "this is the one" and `now` is added
       * only when there is actually a use in hand. The cooldown fill goes on
       * saying how long, as it always has.
       */
      const urgent = held > 0 && !!s.def.essential;
      if (s.urgent !== urgent) {
        s.urgent = urgent;
        s.el.classList.toggle('urgent', urgent);
      }
      // Quantised so an idle bar isn't restyled sixty times a second.
      const f = Math.round(abilities.readyFraction(i) * 100) / 100;
      const locked = abilities.isLocked(i);
      if (s.frac !== f) {
        s.frac = f;
        s.fill.style.transform = `scaleY(${1 - f})`;
      }
      // Ready means there is a use in hand, which with two charges is true
      // while the bar is still filling the second one back up.
      //
      // Checked on its own rather than inside the fraction diff above, which
      // is where it used to live. readyFraction is 1 whenever the cooldown is
      // clear, and an ability nobody owns has no cooldown — so buying one left
      // the fraction sitting at the 1 it had always been, the diff never fired,
      // and the button never lit. WELL, PRISM and STASIS could be bought and
      // still look sealed until something else happened to move the bar.
      const ready = abilities.usable(i);
      if (s.ready !== ready) {
        s.ready = ready;
        s.el.classList.toggle('ready', ready);
      }
      const now = urgent && ready;
      if (s.now !== now) {
        s.now = now;
        s.el.classList.toggle('now', now);
      }
      if (s.locked !== locked) {
        s.locked = locked;
        s.el.classList.toggle('locked', locked);
      }
      const { charges, max } = abilities.chargeState(i);
      if (s.held !== charges || s.cap !== max) {
        s.held = charges;
        s.cap = max;
        // Nothing is drawn at all below two, which is where every ability
        // starts and where most of them stay.
        s.pips.innerHTML = max > 1
          ? Array.from({ length: max }, (_, k) => `<i class="${k < charges ? 'on' : ''}"></i>`).join('')
          : '';
      }
    }
  }


  /**
   * @param tutorial the opening script, which sits lower and reads larger.
   * @param hold seconds on screen. Sized to the sentence by default: a flat
   *   nine seconds gave a four-word line the same time as a fifteen-word one.
   */
  showHint(text, tutorial = false, hold = holdFor(text), id = null) {
    /*
     * One long-form voice at a time.
     *
     * This band and the boss caption are the two things in the game that talk
     * at length, and they had no idea the other existed. Sampled across an
     * ordinary run on two handsets -- the opening script over a live field,
     * eight abilities, then ORDINAL -- the game was saying something in 97.4%
     * of frames, two or more surfaces were up in 47.9% and three in 10.3%,
     * and on a 320-wide screen 38.2% of frames had text actually landing on
     * other text. The commonest pair by a distance was this band against the
     * boss caption, at 84 of 340 frames, and the band was in all three of the
     * top collisions.
     *
     * So it waits. The caption's own comment has said since it was written
     * that the arrival is the one moment the interface may talk over the
     * game; this is the band finally honouring that. Nothing is dropped --
     * the call site has already marked a first-use line as said on this
     * device by the time it gets here, so a line thrown away here is a line
     * the player never gets -- it is held and said when the screen is clear.
     */
    /*
     * ...and one teaching line at a time, which is the same rule turned
     * inward.
     *
     * The band used to take whatever arrived and push what was there out of
     * the way. Measured on a fresh device: AUTO AIM, AUTO FIRE, PULSE and HAIL
     * pressed as fast as they can be reached put four lines through a
     * two-line band in under three seconds, and every one was marked
     * said-on-this-device the moment it was pushed -- so three of the four
     * were spent without being read, and this device will never offer them
     * again. That is the actual complaint behind "I only saw the first two".
     *
     * So a line arriving while one is still up waits for it, and the queue
     * drains in update(). `id` is what makes the marking honest: the caller
     * no longer records the line as said, this does, when it is painted.
     */
    if (tutorial && (this.speaking() || this.hintTimer > 0)) {
      this.voiceHeld.push({ text, hold, id });
      // Deep enough to hold every control a thumb can reach in one burst.
      while (this.voiceHeld.length > 8) this.voiceHeld.shift();
      return;
    }
    // Lines are written with their own break, so they wrap where they read.
    if (!tutorial) {
      this.tutLines.length = 0;
      this.el.hint.textContent = text;
    } else {
      // The opening keeps the line before. It is pushed up the band by the new
      // one rather than replaced, so a sentence you have just acted on is
      // still there while you are looking at what it gave you.
      this.tutLines.push(text);
      while (this.tutLines.length > STACK) this.tutLines.shift();
      this.el.hint.innerHTML = '';
      this.tutLines.forEach((line, i) => {
        const d = document.createElement('div');
        d.className = i === this.tutLines.length - 1 ? 'hLine now' : 'hLine past';
        d.textContent = line;
        this.el.hint.appendChild(d);
      });
    }
    this.el.hint.classList.toggle('tutorial', tutorial);
    this.el.hint.classList.add('show');
    this.hintTimer = hold;
    this.hintShown = 0;
    // Said, now that it has actually been said.
    if (id) markLine(id);
  }

  /**
   * Take the current line away because the player is playing.
   *
   * Acting on a line is the strongest evidence there is that it has been read,
   * and a band that stays over the field after that is in the way. Held for
   * MIN_READ first, or a tap already travelling when the line appeared would
   * take it away before it was seen. The queue is not dropped -- the next line
   * comes up on the following frame.
   */
  dismissHint() {
    if (this.hintTimer <= 0 || this.hintShown < MIN_READ) return false;
    this.hintTimer = 0;
    this.el.hint.classList.remove('show');
    this.tutLines.length = 0;
    return true;
  }

  /** Is the band busy, either talking or holding something to say? */
  pending() {
    return this.hintTimer > 0 || this.voiceHeld.length > 0;
  }

  /** Take it down now — the run has moved on, or the opening was cut short. */
  clearHint() {
    this.tutLines.length = 0;
    this.voiceHeld.length = 0;
    this.hintTimer = 0;
    this.el.hint.classList.remove('show');
  }

  /**
   * Is something already talking at length?
   *
   * The boss caption and a boss still arriving both count. The arrival is a
   * set piece with its own narration and a teaching line landing in the
   * middle of it is wrong on its own terms, never mind on the pixels.
   */
  speaking() {
    const el = this.el.bossCaption;
    if (el && el.classList.contains('show')) return true;
    const boss = this.game.world.boss;
    return !!(boss && boss.arriving > 0);
  }

  // ----------------------------------------------------------------- meters

  setKills(n) {
    if (n === this.lastKills) return;
    this.lastKills = n;
    this.el.killNum.textContent = n;
  }

  /**
   * Banked salvage, beside the count. The chip dims when the intake is being
   * sat on, because that is the only place the corruption costs anything the
   * player can read.
   */

  /**
   * Make the top bar's chips fit the numbers in them.
   *
   * `#barChips` is the shrinkable group and its comment has always said so,
   * but nothing inside it could actually shrink: every chip is `white-space:
   * nowrap`, so the group did not absorb anything, it clipped. Measured across
   * the widths this is played at, with a five-figure purse and the
   * affordable-rows badge up -- which is ordinary mid-run play, not an edge
   * case -- the badge was cut off by 17px at 390 and 32px at 375, the two
   * commonest iPhone widths. The badge that says how many upgrades you can
   * afford, gone exactly when you can afford plenty.
   *
   * A media query cannot fix it, because the trigger is not the screen width:
   * it is how many digits are in the purse and whether the badge is up. There
   * is already a 372px rule hiding the ENERGY word, and it is below both
   * widths that break. So the bar measures itself instead and drops labels in
   * order of what they are worth -- OBJECTS first, which is ambient, then
   * ENERGY, which the green number says anyway.
   */
  fitBar() {
    const bar = this.el.barChips;
    if (!bar) return;
    /*
     * Guarded on what is actually in the chips, because the measuring is not
     * free: reading scrollWidth after a class change forces a synchronous
     * layout, and setEnergy runs on every frame that energy lands -- which is
     * every frame of a PULSE. Three forced reflows a frame on a phone that
     * already has a quality governor is not a fix, it is a different bug.
     *
     * The signature is how many DIGITS are in each number, not the numbers
     * themselves. What decides whether a label still fits is the width of the
     * chips, and a purse going from 1,204 to 1,207 does not change that --
     * keyed on the values it re-measured on every frame energy landed, which
     * is every frame of a PULSE and 874 forced layouts in ten seconds. Keyed
     * on digits it fires a handful of times in a whole run.
     */
    const digits = (v) => String(Math.max(0, Math.floor(v || 0))).length;
    const sig = `${digits(this.lastEnergy)}|${digits(this.lastBuys)}`
      + `|${digits(this.lastKills)}|${window.innerWidth}`;
    if (sig === this.barSig) return;
    this.barSig = sig;
    // Widest first: measuring with the labels back on is the only way to know
    // whether they still need to be off.
    bar.classList.remove('tight', 'tighter');
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    bar.classList.add('tight');
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    bar.classList.add('tighter');
  }

  setEnergy(n, rate = 1) {
    const v = Math.floor(n);
    if (v !== this.lastEnergy) {
      // The far end of the collection animation. The streaks go into the
      // turret; this is where they come out, so the two read as one motion.
      const up = v > this.lastEnergy;
      this.lastEnergy = v;
      this.el.energy.textContent = v;
      if (up) {
        const chip = this.el.energyChip;
        chip.classList.remove('took');
        void chip.offsetWidth;
        chip.classList.add('took');
      }
    }
    const choked = rate < 0.999;
    if (choked !== this.lastChoked) {
      this.lastChoked = choked;
      this.el.energyChip.classList.toggle('choked', choked);
    }
    this.fitBar();
  }

  /**
   * How many rows in the tree are affordable right now, shown on the chip.
   *
   * The count comes from the menu, which already works it out to write "N
   * within reach" in its own header — so there is one calculation of what
   * affordable means and the badge cannot disagree with the screen it opens.
   */
  setBuys(n) {
    if (n === this.lastBuys) return;
    this.lastBuys = n;
    const el = this.el.energyBuys;
    el.textContent = n > 0 ? String(n) : '';
    el.classList.toggle('on', n > 0);
    this.el.energyChip.classList.toggle('canBuy', n > 0);
    // The badge is what pushed the chip past the edge in the first place.
    this.fitBar();
  }



  // -------------------------------------------------------------- the ladder

  /**
   * Where the run is standing, and the only way to move it by hand.
   *
   * Auto-advance is the default and the chip is mostly a readout; one tap
   * opens the row that pins or steps it. The row closes on any choice, so it
   * is never something left open on top of the field.
   */
  buildTier() {
    const g = this.game;
    const d = () => g.world.director;
    const openRow = (open) => {
      // Same slot: the row takes the chip's place rather than its own width.
      this.el.tierRow.hidden = !open;
      this.el.tierChip.hidden = open;
      /*
       * ...and the count steps aside while it is up. The row is wider than
       * the chip it replaces, and #barChips absorbs the difference by
       * shrinking -- which clipped ENERGY mid-number. OBJECTS is the one
       * readout on the bar nothing is ever decided from, and the row is gone
       * on the next tap.
       */
      document.body.classList.toggle('tiering', open);
    };
    this.el.tierChip.addEventListener('click', () => {
      openRow(this.el.tierRow.hidden);
      this.syncTier(g.world);
    });
    this.closeTierRow = () => openRow(false);
    const step = (by) => {
      const dir = d();
      if (!dir) return;
      /*
       * Moving by hand pins the tier. Anything else is a control that fights
       * the auto-advance: step down, clear one wave, and the ladder puts you
       * straight back where you could not stand.
       */
      dir.setTier(dir.tier + by);
      dir.hold = true;
      this.closeTierRow();
      this.syncTier(g.world);
    };
    $('tierDown').addEventListener('click', () => step(-1));
    $('tierUp').addEventListener('click', () => step(1));
    $('tierPin').addEventListener('click', () => {
      const dir = d();
      if (!dir) return;
      dir.hold = !dir.hold;
      this.closeTierRow();
      this.syncTier(g.world);
    });
  }

  syncTier(world) {
    const dir = world && world.director;
    if (!dir || !this.el.tierChip) return;
    const n = dir.tier;
    if (this._tierAt !== n) {
      this._tierAt = n;
      this.el.tierNum.textContent = n;
    }
    if (this._tierHold !== dir.hold) {
      this._tierHold = dir.hold;
      this.el.tierHold.hidden = !dir.hold;
      this.el.tierChip.classList.toggle('held', dir.hold);
      $('tierPin').textContent = dir.hold ? 'AUTO' : 'HOLD';
    }
    // Nothing below tier 1 to step down to.
    $('tierDown').disabled = n <= 1;
  }




  // ----------------------------------------------------------------- alerts

  /** `tone` overrides the kind's colour: used to say which object this is about. */
  alert(text, kind = 'info', duration = 2.4, tone = null) {
    const existing = this.alerts.find((a) => a.text === text);
    if (existing) {
      existing.t = duration;
      return;
    }
    /*
     * No room beside the band on this screen: hold it rather than paint it
     * on top of a sentence. A pill is a receipt and three seconds late is
     * nothing; landing across a line of instruction is not.
     */
    if (this.pillCap() < 1 && this.el.hint.classList.contains('show')) {
      if (!this.pillHeld.some((p) => p.text === text)) {
        this.pillHeld.push({ text, kind, duration, tone });
        while (this.pillHeld.length > 3) this.pillHeld.shift();
      }
      return;
    }
    const el = document.createElement('div');
    el.className = `alert ${kind}`;
    if (tone) el.style.color = tone;
    el.textContent = text;
    this.el.alerts.appendChild(el);
    this.alerts.push({ el, t: duration, text });
    while (this.alerts.length > this.pillCap()) {
      const old = this.alerts.shift();
      old.el.remove();
    }
  }

  updateAlerts(dt) {
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      const a = this.alerts[i];
      a.t -= dt;
      if (a.t <= 0) {
        a.el.remove();
        this.alerts.splice(i, 1);
      } else if (a.t < 0.5) {
        a.el.classList.add('fade');
      }
    }
    if (this.recedeT > 0) {
      this.recedeT -= dt;
      if (this.recedeT <= 0) {
        document.body.classList.remove('recede');
        document.body.classList.remove('recedeStrip');
      }
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      this.hintShown += dt;
      // The band going dark ends the stack: the next line after a silence
      // starts on its own rather than under something said a minute ago.
      if (this.hintTimer <= 0) {
        this.el.hint.classList.remove('show');
        this.tutLines.length = 0;
      }
    } else if (this.pillHeld.length && this.pillCap() >= 1) {
      const p = this.pillHeld.shift();
      this.alert(p.text, p.kind, p.duration, p.tone);
    } else if (this.voiceHeld.length && !this.speaking()) {
      // The screen is clear and something has been waiting. One at a time,
      // oldest first, with the gap the opening already uses between lines.
      const next = this.voiceHeld.shift();
      this.showHint(next.text, true, next.hold, next.id);
    }
  }

  clearAlerts() {
    for (const a of this.alerts) a.el.remove();
    this.alerts.length = 0;
    this.pillHeld.length = 0;
  }

  /**
   * How many pills fit between the top of the alerts column and the band.
   *
   * The pills share a flex column with the boss caption and so can never
   * overlap each other -- that was fixed when the column was introduced. What
   * they can still reach is the teaching band, and on a short screen they do
   * not merely reach it, they start below it: the band is positioned from the
   * BOTTOM of the screen, and on a 568-tall phone that puts its top at y=140
   * while the alerts column starts at 124 and one pill alone ends at 152. So
   * there is no number of pills that fits, and capping the count -- which is
   * what the first attempt did -- moved nothing. On a 664-tall phone the same
   * band starts at 227 and there is 75px of clear air.
   *
   * Hence a cap that can be zero, and a queue for what does not fit. Measured
   * off the two elements rather than guessed at a breakpoint, so a screen
   * nobody has tested on gets the right answer for its own reasons.
   */
  pillCap() {
    const alerts = this.el.alerts;
    const band = this.el.hint;
    if (!alerts || !band) return 2;
    const top = alerts.getBoundingClientRect().top;
    const floor = band.getBoundingClientRect().top;
    const cap = this.el.bossCaption;
    const capH = cap && cap.classList.contains('show')
      ? cap.getBoundingClientRect().height : 0;
    /*
     * Three at the top end, which is where it has always been -- the ORDINAL
     * outro fires exactly three (REMAINDER, HELD-RECAST, RECORDED) and they
     * are asserted not to overlap. An earlier pass lowered this to two on the
     * theory that the column was what the band landed on; the measurement
     * said otherwise -- see above, the band starts BELOW the column on a
     * short screen -- so the ceiling is left where the evidence left it and
     * only the floor, which can now be zero, is new.
     */
    return Math.max(0, Math.min(3, Math.floor((floor - top - capH) / 30)));
  }

  // ----------------------------------------------------------------- recede

  /**
   * Take the strip and the ability bar down to a whisper for a moment.
   *
   * The controls are fixed furniture across the bottom third of the screen,
   * and everything the turret emits is a circle centred on the turret, which
   * sits at 60-70% of the way down. The two overlap badly and it is worse on
   * a bigger phone, because the furniture is a fixed height while the field
   * grows: measured across three handsets, PRISM's burst is 25/54/54% behind
   * a control, SNARE's pull the same, DECOY's blast 34/52/49%, and TERMINUS's
   * boundary -- a ring closed around the turret for the whole fight -- is
   * 40/51/47%. Half of the last boss in the game was behind four buttons.
   *
   * So the furniture gets out of the way on the beats where something big is
   * being drawn and nothing is being pressed: an ability going off, a boss
   * arriving, a stage turning over, a boss dying. It stays touchable the
   * whole time -- a panic PULSE during a recede still fires, because the
   * button is faint rather than gone.
   */
  recede(seconds = 0.9, stripOnly = false) {
    this.recedeT = Math.max(this.recedeT || 0, seconds);
    /*
     * `stripOnly` leaves the ability bar alone.
     *
     * Pressing an ability is the one moment the ability bar is the thing you
     * are looking at -- which one went, what it cost, when it is back -- and
     * fading it on the press hides exactly that. So an ability takes the
     * fifteen-cell strip out of the way and nothing else. A boss arriving or
     * a stage turning over is not a press, nobody is reading a cooldown, and
     * both go.
     */
    if (!stripOnly) document.body.classList.add('recede');
    document.body.classList.add('recedeStrip');
  }

  /** Put it back now, whatever is left on the clock. */
  unrecede() {
    this.recedeT = 0;
    document.body.classList.remove('recede');
    document.body.classList.remove('recedeStrip');
  }

  // ------------------------------------------------------------------ debug

  buildDebug() {
    const g = this.game;
    /*
     * Five of these called methods that went with the boss and the ledger in
     * builds 81-82 -- TITHE, SUBTRACT, DRAIN LEDGER, SKIP INTRO, END SCREEN.
     * Nothing complained, because a button only throws when it is pressed, and
     * the panel was not being pressed. They are gone.
     *
     * `wide` spans both columns; SPAWN GROUP opens a screen rather than doing
     * something, so it gets the width and the ellipsis that say so.
     */
    const actions = [
      ['SPAWN GROUP…', () => this.showSpawn(true), 'wide'],
      ['+50 KILLS', () => g.debugAddKills(50)],
      ['NEXT STORY', () => g.debugNextStory()],
      ['UNLOCK ALL', () => g.debugUnlockAll()],
      ['MAX UPGRADES', () => g.debugBuyAll()],
      ['+10000 ENERGY', () => g.debugGiveEnergy(10000)],
      ['SPAWN WAVE', () => g.debugSpawnWave()],
      ['FILL FIELD', () => g.debugFillField()],
      ['CLEAR FIELD', () => g.debugClearField()],
      ['GLITCH TEST', () => g.debugGlitch()],
      ['THROW MINE', () => g.debugThrowMine('blast')],
      ['THROW SNARE', () => g.debugThrowMine('snare')],
      ['THROW WIRE', () => g.debugThrowMine('wire')],
      ['THROW KNELL', () => g.debugThrowMine('knell')],
      ['SPAWN DRIFT', () => g.debugSpawnDrift()],
      ['RESTART', () => g.restart()],
      ['CODEX ALL', () => g.debugCodexAll()],
      ['CODEX WIPE', () => g.debugCodexWipe()],
    ];
    const toggles = [
      ['NO COOLDOWN', 'noCooldown'],
      ['NO GLITCH', 'noGlitch'],
      ['SLOW-MO', 'slowmo'],
      ['HITBOXES', 'hitboxes'],
      ['STATS', 'stats'],
    ];

    const frag = document.createDocumentFragment();
    for (const [label, fn, cls] of actions) {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.classList.add(cls);
      b.addEventListener('click', fn);
      frag.appendChild(b);
    }
    for (const [label, key] of toggles) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', !!g.world.debug[key]);
      b.addEventListener('click', () => {
        g.world.debug[key] = !g.world.debug[key];
        b.classList.toggle('on', g.world.debug[key]);
      });
      frag.appendChild(b);
    }
    this.el.dbgGrid.appendChild(frag);
  }

  // ----------------------------------------------------------- spawn screen

  /*
   * A group of anything, on demand.
   *
   * The rest of the panel is one button per fixed thing, which stops working
   * the moment the question is "what do sixteen HERALDs do to each other" or
   * "does a PRISM ring reflect into itself". So this is a screen rather than a
   * button: pick the object, the count, the shape and how it arrives, then
   * spawn it as many times as you like.
   *
   * ABOVE queues the group off the top of the screen and lets it march in, so
   * the entry itself is what you are watching. ON FIELD puts it down past the
   * entry line already loose, which is the only way to see a behaviour that
   * does not start until an object is in play -- warding, feeding, splitting.
   *
   * The portraits are the same drawSpecimen the glossary uses, so a chip can
   * never show something the field does not.
   */
  buildSpawn() {
    const g = this.game;
    const el = this.el.dbgSpawn;
    // ON FIELD by default. The point of the screen is to look at the thing,
    // and a group queued above the arena spends its first four seconds off the
    // top of the screen -- which reads as nothing having happened at all.
    this.spawn = { id: ENEMY_TYPES[0].id, count: 5, shape: '', where: 'field' };
    this.spawnCells = new Map();
    this.spawnRows = [];
    this.spawnTallyText = '';

    const head = document.createElement('div');
    head.className = 'spawnHead';
    const back = document.createElement('button');
    back.className = 'spawnBack';
    back.textContent = '\u2039 BACK';
    back.addEventListener('click', () => this.showSpawn(false));
    const tally = document.createElement('span');
    tally.className = 'spawnTally';
    const peek = document.createElement('button');
    peek.className = 'spawnPeek';
    peek.addEventListener('click', () => this.miniSpawn(!this.el.debug.classList.contains('mini')));
    head.append(back, tally, peek);
    this.el.spawnTally = tally;
    this.el.spawnPeek = peek;

    const pick = document.createElement('div');
    pick.className = 'spawnPick';
    for (const t of ENEMY_TYPES) {
      const b = document.createElement('button');
      b.className = 'spawnChip';
      b.title = t.name;
      const c = document.createElement('canvas');
      // Backed at 2x and drawn once: a portrait never changes, and sixteen of
      // them redrawing every frame would cost more than the panel is worth.
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.translate(32, 32);
      drawSpecimen(ctx, t.id, 20);
      const name = document.createElement('span');
      name.textContent = t.name;
      b.append(c, name);
      b.addEventListener('click', () => { this.spawn.id = t.id; this.syncSpawn(true); });
      pick.appendChild(b);
      this.spawnCells.set(t.id, b);
    }

    const row = (label, opts, read, write) => {
      const r = document.createElement('div');
      r.className = 'spawnRow';
      const l = document.createElement('span');
      l.className = 'spawnLabel';
      l.textContent = label;
      const box = document.createElement('div');
      box.className = 'spawnOpts';
      const cells = [];
      for (const [text, value] of opts) {
        const b = document.createElement('button');
        b.textContent = text;
        b.addEventListener('click', () => { write(value); this.syncSpawn(true); });
        box.appendChild(b);
        cells.push([b, value]);
      }
      r.append(l, box);
      this.spawnRows.push({ cells, read });
      return r;
    };

    // Presets rather than a stepper: on a phone, six taps to reach twelve is
    // six taps too many, and nothing in between 12 and 20 is a different test.
    const counts = [1, 3, 5, 8, 12, 20].filter((n) => n <= GROUP_MAX);
    const howMany = row(
      'HOW MANY',
      counts.map((n) => [String(n), n]),
      () => this.spawn.count,
      (v) => { this.spawn.count = v; },
    );
    // '' is ANY, which lets spawnGroup roll one, the way the director does.
    const shape = row(
      'SHAPE',
      [['ANY', ''], ...FORMATION_SHAPES.map((k) => [k.toUpperCase(), k])],
      () => this.spawn.shape,
      (v) => { this.spawn.shape = v; },
    );
    const where = row(
      'ARRIVES',
      [['ABOVE', 'entry'], ['ON FIELD', 'field']],
      () => this.spawn.where,
      (v) => { this.spawn.where = v; },
    );

    const go = document.createElement('button');
    go.className = 'spawnGo';
    go.addEventListener('click', () => {
      const made = this.game.debugSpawnGroup(this.spawn.id, this.spawn.count, {
        shape: this.spawn.shape || undefined,
        where: this.spawn.where,
      });
      // A TOW is two bodies, so what landed is not always what was asked for.
      // Saying the real number is the difference between a tool and a guess.
      const t = TYPE_BY_ID[this.spawn.id];
      this.alert(`+${made.length} ${t ? t.name : this.spawn.id}`, 'info', 1.4);
      this.miniSpawn(true);
    });
    this.el.spawnGo = go;

    const clear = document.createElement('button');
    clear.className = 'spawnClear';
    clear.textContent = 'CLEAR FIELD';
    clear.addEventListener('click', () => g.debugClearField());

    el.append(head, pick, howMany, shape, where, go, clear);
  }

  /*
   * Fold the picker away and leave the button, the tally and the field.
   *
   * The panel is 340px of opaque glass over a 390px screen, and a group queued
   * above the arena marches down into exactly the part of the field it covers.
   * Spawning five MOTEs and seeing none of them is not a spawner that failed,
   * it is a spawner you cannot watch -- so a spawn folds it away by itself.
   * The button keeps its label, so the next one is still a single tap.
   */
  miniSpawn(on) {
    this.el.debug.classList.toggle('mini', !!on);
    this.el.spawnPeek.textContent = on ? 'PICK' : 'HIDE';
    this.spawnTallyText = ''; // the folded head has room for a shorter one
    this.syncSpawn();
  }

  /** Swap the panel between the button grid and the spawn screen. */
  showSpawn(on) {
    this.miniSpawn(false);
    this.el.dbgSpawn.hidden = !on;
    this.el.dbgGrid.hidden = on;
    // The picker needs three columns to be readable, which the 280px panel
    // does not have. It widens only while the screen is up.
    this.el.debug.classList.toggle('wide', !!on);
    if (on) this.syncSpawn(true);
  }

  spawnOpen() {
    return !this.el.dbgSpawn.hidden;
  }

  /**
   * `full` redraws the selection marks; without it this is the once-a-frame
   * tally, which is why it exits early and compares before it writes.
   */
  syncSpawn(full) {
    if (!this.spawn || this.el.debug.hidden || this.el.dbgSpawn.hidden) return;
    if (full) {
      for (const [id, cell] of this.spawnCells) cell.classList.toggle('on', id === this.spawn.id);
      for (const r of this.spawnRows) {
        const at = r.read();
        for (const [b, v] of r.cells) b.classList.toggle('on', v === at);
      }
      const t = TYPE_BY_ID[this.spawn.id];
      this.el.spawnGo.textContent = `SPAWN ${this.spawn.count} \u00d7 ${t ? t.name : this.spawn.id}`;
    }
    const f = this.game.debugFieldCount();
    const line = this.el.debug.classList.contains('mini')
      ? `${f.hostile} live · ${f.drift} drift`
      : `${f.hostile} live · ${f.drift} drift · ${f.frag} frag · ${f.wreck} wreck`;
    if (line !== this.spawnTallyText) {
      this.spawnTallyText = line;
      this.el.spawnTally.textContent = line;
    }
  }

  toggleDebug(force) {
    const next = force === undefined ? this.el.debug.hidden : force;
    this.el.debug.hidden = !next;
  }

  setStats(text) {
    this.el.dbgStats.textContent = text;
  }

  // ------------------------------------------------------------- screens

  /**
   * A saved run gets a button of its own on the title screen, with the count
   * on it. Two buttons rather than one that changes meaning: BEGIN has to keep
   * meaning "start a clean one", because the alternative is a player tapping
   * the only button on the screen and silently losing a run.
   */
  /**
   * The record, on the title screen: what this device has to show for itself
   * across every run it has ever had.
   *
   * The glossary is the only thing in the game that survives a reset — it was
   * never yours, it is kept by whoever has been counting — so it is the only
   * honest measure of "how far have I got" that a title screen can offer.
   * Shown only once there is something in it: a first launch has no record
   * and a row of zeroes is a worse welcome than no row at all.
   */
  showRecord() {
    const el = this.el.bootRecord;
    if (!el) return;
    const found = codex.found;
    if (!found) { el.hidden = true; return; }
    const bits = [`<b>${found}</b><em>of ${codex.total} recorded</em>`];
    // ORDINAL in the glossary means one has been taken apart. There is no
    // other way for it to get in there.
    if (codex.has('ordinal')) bits.push('<b>◆</b><em>ORDINAL reconciled</em>');
    el.innerHTML = bits.map((b) => `<span>${b}</span>`).join('');
    el.hidden = false;
  }

  offerResume() {
    const d = readRun();
    const b = this.el.resumeBtn;
    if (!b) return;
    if (!d) {
      b.hidden = true;
      if (this.el.resumeNote) this.el.resumeNote.hidden = true;
      this.el.startBtn.textContent = 'BEGIN SIMULATION';
      return;
    }
    /*
     * What is actually in the file, not just how far it got. A resume button
     * that says only a number is asking you to remember what that run was;
     * the count, the bank and how long ago it was answers it.
     */
    /*
     * Just CONTINUE.
     *
     * It used to read "CONTINUE · 137 / 500", and the goal in that had been
     * meaningless since build 81 -- every run is endless, there is no five
     * hundred to reach, and the in-game counter has shown no goal for forty
     * builds. It survived here on an accident: `endless` stopped being written
     * to the save in build 100 because nothing read it back, and this was the
     * one thing still reading it. Absent field, falsy, goal printed.
     *
     * The count itself is not meaningless and moves to the line below, where
     * the rest of what is in the file already lives.
     */
    b.textContent = 'CONTINUE';
    const bits = [];
    if (Number.isFinite(d.kills)) bits.push(`${d.kills} OBJECTS`);
    if (Number.isFinite(d.energy) && d.energy >= 1) bits.push(`${Math.floor(d.energy)} ENERGY`);
    if (d.remainder > 0) bits.push(`${d.remainder}◆ REMAINDER`);
    const ago = ageOf(d.at);
    if (ago) bits.push(ago);
    const note = this.el.resumeNote;
    if (note) {
      note.textContent = bits.join('  ·  ');
      note.hidden = !bits.length;
    }
    b.hidden = false;
    // Beside a CONTINUE the long form does not fit, and the short form is the
    // more honest label anyway: from here, that button is a new run.
    this.el.startBtn.textContent = 'NEW RUN';
  }

  hideBoot() {
    document.body.classList.remove('booting');
    this.el.boot.classList.add('out');
    setTimeout(() => { this.el.boot.hidden = true; }, 500);
  }




  /**
   * One place that turns a strip cell into the call it stands for, and the one
   * place a sealed cell is refused. The gate is here rather than in the game's
   * methods so that everything else — offers, resets, the debug panel — can
   * still set the loadout while the opening is running.
   */
  pick(a) {
    /*
     * ...and anything else on the strip puts the mode row away. Reaching past
     * an open menu for another control is a decision not to use it, and a row
     * that stays up over the field after that is in the way. AUTO AIM itself
     * is excluded: that press is the toggle.
     */
    if (a.key !== 'autoAim') this.openAimRow(false);
    if (this.game.isSealed(a.key)) return this.refuse(this.el.toggles[a.key]);
    if (a.kind === 'round') this.game.toggleRound(a.key);
    else if (a.kind === 'mine') this.game.toggleMine(a.key);
    else this.game.toggleAuto(a.key);
    return true;
  }

  /** A press that does nothing still has to feel like it landed on something. */
  refuse(el) {
    if (!el) return false;
    el.classList.remove('refused');
    void el.offsetWidth;
    el.classList.add('refused');
    return false;
  }

  /**
   * Immediate feedback on the tap that caused it. syncLoadout re-asserts the
   * same thing from world state on the next frame, so the cached value has to
   * move with it or the two disagree for a frame.
   */
  setToggle(key, on) {
    const el = this.el.toggles[key];
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', String(on));
    const q = this.strip.find((e) => e.key === key);
    if (q) q.on = on;
  }

  /**
   * AUTO AIM's three positions, on the one cell.
   *
   * `on` is the lit state either way -- the assist is running in both -- and
   * `drift` re-tones it and renames it, because a control whose third position
   * looks like its second is a control nobody can read at a glance. The label
   * is the shortest true word for what it is hunting.
   */
  setAim(world) {
    this.setToggle('autoAim', world.autoAim);
    const el = this.el.toggles.autoAim;
    if (!el) return;
    const mode = world.autoAim ? (world.aimMode || 'field') : 'off';
    // Re-toned and renamed per position: a control whose fourth position looks
    // like its second is a control nobody can read at a glance.
    el.classList.toggle('drift', mode === 'drift');
    el.classList.toggle('everything', mode === 'all');
    const lbl = el.querySelector('.qLbl');
    const word = { drift: 'DRIFT', all: 'ALL' }[mode] || 'AIM';
    if (lbl) lbl.textContent = word;
    el.setAttribute('aria-label', mode === 'field' || mode === 'off'
      ? 'AUTO AIM' : `AUTO AIM: ${word}`);
  }

  setSound() {
    this.menu.syncSystem();
  }

  /**
   * Something just became available. The offer sheet covers the screen while
   * it is being chosen and then closes, so without this the only sign of which
   * of fourteen locked things is now yours was one cell somewhere stopping
   * being grey while the player was looking at a card.
   */
  flashUnlocked(key) {
    const el = this.el.toggles[key]
      || (this.slots[ABILITIES.findIndex((d) => d.id === key)] || {}).el;
    if (!el) return;
    clearTimeout(this.openedTimers && this.openedTimers[key]);
    el.classList.remove('justOpened');
    void el.offsetWidth;
    el.classList.add('justOpened');
    this.openedTimers = this.openedTimers || {};
    this.openedTimers[key] = setTimeout(() => el.classList.remove('justOpened'), 5600);
  }

  /**
   * Which of the nineteen controls the opening has handed over. Sealed is not
   * the same as ORDINAL's `locked`: locked is something taken away mid-fight,
   * sealed is something not yet given. Both are visible; only one is a loss.
   */
  /**
   * The way in, and the thing that came through it.
   *
   * One or the other, never both: while there is no boss the banner is a
   * control offering the arrival, and while there is one the same strip of
   * screen is its bar. The two shell meters under the core's are the frames,
   * because for most of the fight the frames are what is actually moving.
   */
  /**
   * ORDINAL talking. One line at a time, centred over the field, faded in and
   * out on its own — the arrival is the one moment the interface is allowed
   * to talk over the game, and it is the only thing that uses this.
   *
   * Passing null clears it.
   */
  say(text) {
    const el = this.el.bossCaption;
    if (!el) return;
    if (this._said === text) return;
    this._said = text;
    if (!text) { el.classList.remove('show'); return; }
    /*
     * The other half of the one-voice rule, and the half the first pass
     * missed. showHint() defers a teaching line that arrives while the boss
     * is talking -- but a band already reading when the boss STARTS was left
     * where it was, so ORDINAL arriving on top of an opening line still put
     * two blocks of text on the screen. Measured, that alone was 36 of 340
     * frames on a 390-wide screen after the deferral went in.
     *
     * So the caption pre-empts, and what the band was saying goes back on the
     * queue rather than being lost: these lines are marked said on the device
     * at the call site, so a line dropped here is a line never read.
     */
    if (this.hintTimer > 0 && this.el.hint.classList.contains('show')) {
      const held = this.tutLines[this.tutLines.length - 1];
      if (held) this.voiceHeld.unshift({ text: held, hold: holdFor(held) });
      this.hintTimer = 0;
      this.tutLines.length = 0;
      this.el.hint.classList.remove('show');
    }
    el.textContent = text;
    el.classList.add('show');
  }

  syncBoss(world) {
    const bar = this.el.bossBar;
    const boss = world.boss;
    this.syncApertures(world);

    if (bar.hidden !== !boss) bar.hidden = !boss;
    if (!boss) {
      this._bossSeen = null; this._bossGhost = null; this._bossShells = 0;
      this._bossArriving = false;
      return;
    }

    /*
     * Everything below comes off the boss's own gauge() and nothing off
     * CFG.ordinal. The bar used to read ORDINAL's config directly and assume
     * two shells with their segment counts written into the markup, which is
     * a bar that can only ever draw one boss.
     */
    const g = boss.gauge();

    if (this._bossTitle !== g.title) {
      this._bossTitle = g.title;
      this.el.bossTitle.textContent = g.title;
    }

    this.el.bossCore.classList.toggle('arriving', g.arriving);
    /*
     * The two beats of a fight where the screen is the point and nothing is
     * being pressed: the arrival, and each stage turning over. Both hold the
     * recede open a beat at a time rather than setting it once, because an
     * arrival runs for several seconds and the timer counts down through it.
     */
    if (g.arriving) this.recede(0.5);
    this._bossArriving = g.arriving;
    this.el.bossFill.style.transform = `scaleX(${g.core.toFixed(3)})`;
    /*
     * The ghost only ever falls, and it falls late. It holds where the health
     * was until the transition catches it up, so a big hit reads as a hit
     * rather than as a bar that is slightly shorter than it was.
     */
    if (this._bossGhost == null || g.core > this._bossGhost) this._bossGhost = g.core;
    if (g.core < this._bossGhost) {
      this._bossGhost = g.core;
      this.el.bossGhost.style.transform = `scaleX(${g.core.toFixed(3)})`;
    }

    // The shell rows, built to whatever the boss says it has and then only
    // written to. Rebuilt when the shape changes, which is once per fight.
    if (this._bossShells !== g.shells.length) {
      this._bossShells = g.shells.length;
      this.el.bossShell.innerHTML = '';
      this._shellBars = g.shells.map((sh) => {
        const row = document.createElement('span');
        row.className = 'bossShellRow';
        row.innerHTML = `<em>${sh.label}</em>`
          + `<span class="bossShellTrack" style="--seg:${sh.seg}"><i></i></span>`;
        this.el.bossShell.appendChild(row);
        return row.querySelector('i');
      });
    }
    for (let i = 0; i < g.shells.length; i++) {
      this._shellBars[i].style.transform = `scaleX(${g.shells[i].frac.toFixed(3)})`;
    }

    // Where the stages still ahead of you begin, on the track they begin at.
    // Placed once per fight; lit as they are passed.
    if (this._bossMarkAt !== g.marks.length) {
      this._bossMarkAt = g.marks.length;
      this._markEls = [this.el.bossMark3, this.el.bossMark4];
      for (let i = 0; i < this._markEls.length; i++) {
        const m = g.marks[i];
        this._markEls[i].hidden = !m;
        if (m) this._markEls[i].style.left = `${(m.at * 100).toFixed(1)}%`;
      }
    }
    for (let i = 0; i < this._markEls.length; i++) {
      if (g.marks[i]) this._markEls[i].classList.toggle('past', g.marks[i].past);
    }

    // The gauge wears the stage's own colour, so the bar escalates with the
    // sky rather than staying one colour for the whole fight.
    const [c, lit] = g.bar;
    if (this._bossTone !== c) {
      this._bossTone = c;
      bar.style.setProperty('--boss', c);
      bar.style.setProperty('--bossLit', lit);
    }

    if (this._bossSeen !== g.phase) {
      // A stage turning over changes the sky, the gauge and usually the shape
      // of the thing you are shooting at. Worth a second of clear screen.
      if (this._bossSeen !== null) this.recede(1.4);
      this._bossSeen = g.phase;
      this.el.bossPhase.textContent = g.phase;
    }
  }

  /**
   * The banner: one row per boss whose way in is held, in that boss's colour.
   *
   * It was a single button, because there was a single boss. Rebuilt only
   * when what is held actually changes -- this runs every frame.
   */
  syncApertures(world) {
    const ap = this.el.apertureBar;
    const held = world.boss ? [] : heldList(world);
    const key = held.map((h) => `${h.n}:${h.held}`).join(',');
    if (this._apKey === key) return;
    this._apKey = key;
    if (ap.hidden !== !held.length) ap.hidden = !held.length;
    ap.innerHTML = '';
    for (const h of held) {
      const b = document.createElement('button');
      b.className = 'apRow';
      b.type = 'button';
      b.dataset.n = String(h.n);
      b.style.setProperty('--tone', h.tone);
      // ...and the hotter companion the glow and the row's fill are mixed
      // from. Without it every row wore ORDINAL's magenta behind its own
      // border, which is worse than not colouring them at all.
      b.style.setProperty('--glow', h.glow);
      // The name only once there is more than one to tell apart: "APERTURE
      // HELD" is what this has always said, and saying "ORDINAL APERTURE
      // HELD" to somebody who has only ever seen one is noise.
      const name = held.length > 1 ? `${h.name} APERTURE HELD` : 'APERTURE HELD';
      b.innerHTML = `<span class="apName">${name}${h.held > 1 ? ` x${h.held}` : ''}</span>`
        + '<span class="apGo">OPEN THE WAY</span>';
      ap.appendChild(b);
    }
  }

  syncSeals() {
    for (const q of this.strip) {
      const sealed = this.game.isSealed(q.key);
      if (q.sealed === sealed) continue;
      q.sealed = sealed;
      q.el.classList.toggle('sealed', sealed);
      q.el.setAttribute('aria-disabled', String(sealed));
    }
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const sealed = this.game.abilitySealed(i);
      if (s.sealedNow === sealed) continue;
      s.sealedNow = sealed;
      s.el.classList.toggle('sealed', sealed);
      s.el.setAttribute('aria-disabled', String(sealed));
    }
  }

  /** Lights the strip to match what is actually loaded and running. */
  syncLoadout(world) {
    // World state is the only truth here: a round is lit when it is loaded, a
    // mine or an assist when it is running. Every write is diffed.
    for (const q of this.strip) {
      const on = q.kind === 'round' ? world.round === q.key
        : q.kind === 'mine' ? world.mine === q.key
          : !!world[q.key];
      if (q.on === on) continue;
      q.on = on;
      q.el.classList.toggle('on', on);
      q.el.setAttribute('aria-pressed', String(on));
    }
  }

  /**
   * What still has to run while the simulation is held: the interface itself,
   * so a cell lights the instant it is tapped and the readout keeps up.
   */
  syncHudLight(world) {
    this.syncAbilities(world.abilities);
    this.syncTier(world);
    this.syncLoadout(world);
    this.syncSeals();
    this.syncBoss(world);
    this.menu.sync(world);
  }

  /**
   * First-ever kill of a type. Deliberately wordless: an alert here would be
   * text over the boss the moment ORDINAL emits something new, which is the
   * one thing the fight is not allowed to do. The menu button pulses and its
   * count goes up, and the entry is waiting when the player looks.
   */
  /**
   * An object destroyed for the first time.
   *
   * The menu button flashes, which it always did and which nobody looking at
   * the field ever saw. So it is said on the field as well, in the colour of
   * the thing that was just destroyed, with the tally beside it — the count is
   * what makes the glossary a thing you are filling in rather than a tab you
   * have not opened.
   */
  noteCodex(id) {
    this.menu.syncCodex();
    const b = this.menu.el.btn;
    b.classList.remove('recorded');
    void b.offsetWidth;
    b.classList.add('recorded');

    const entry = CODEX.find((e) => e.id === id);
    if (!entry) return;
    const type = TYPE_BY_ID[id];
    this.alert(`${entry.name} RECORDED  ${codex.found}/${codex.total}`, 'found', 3.6,
      type ? type.color : null);
  }
}
