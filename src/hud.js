// DOM-side interface. Canvas draws the world; HTML draws anything that has to
// be crisp, tappable and safe-area aware.

import { ABILITIES } from './abilities.js';
import { ARSENAL, specRows } from './arsenal.js';
import { CONTROLS } from './narrative.js';
import { BUILD, CFG, ENEMY_TYPES, TYPE_BY_ID } from './config.js';
import { drawSpecimen, FORMATION_SHAPES, GROUP_MAX } from './enemies.js';

import { CODEX, codex } from './codex.js';
import {  } from './util.js';
import { Menu } from './menu.js';
import { holdFor, STACK } from './tutorial.js';
import { SLOTS, carried, freeSlot } from './loadout.js';
import { readRun } from './save.js';
import { TIMED } from './events.js';

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

/*
 * The gauge's colour per stage: arriving, then I to IV. It follows the sky —
 * see the boss moods in background.js — so the bar is hotter by the end
 * rather than one pink for two hundred seconds.
 */
const BOSS_BAR = [
  ['#a03fb0', '#e6a8ff'], // arriving
  ['#ff5ec8', '#ffb8ee'], // I
  ['#ff3fb0', '#ffc2f0'], // II
  ['#ff2f8f', '#ffd0e6'], // III
  ['#ff5470', '#ffe0e6'], // IV — it is coming down
];

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      killNum: $('killNum'),
      counter: $('counter'),
      phaseTag: $('phaseTag'),
      alerts: $('alerts'),
      killGoal: document.querySelector('#counter .dim'),
      energy: $('energyNum'),
      energyChip: $('energyChip'),
      energyBuys: $('energyBuys'),
      effects: $('effects'),
      pendingBtn: $('pendingBtn'),
      pendingLabel: $('pendingLabel'),
      pendingCount: $('pendingCount'),
      offer: $('offer'),
      offerScrim: $('offerScrim'),
      offerCards: $('offerCards'),
      loadout: $('loadout'),
      loadScrim: $('loadScrim'),
      loadTitle: $('loadTitle'),
      loadNote: $('loadNote'),
      loadSlots: $('loadSlots'),
      loadList: $('loadList'),
      offerKicker: $('offerKicker'),
      offerNote: $('offerNote'),
      counterLabel: document.querySelector('#counter em'),
      abilities: $('abilities'),
      hint: $('abilityHint'),
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
      bossShellA: $('bossShellA'),
      bossShellB: $('bossShellB'),
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
    this.tutLines = []; // the opening's band keeps the line before
    this.lastKills = -1;
    this.lastGoal = -1;
    this.lastPhase = '';

    this.buildAbilities();
    this.buildDebug();
    this.buildSpawn();

    this.menu = new Menu(game);
    this.buildStrip();

    // The boot copy is translucent enough to read the HUD through it, and on a
    // short screen the kicker sits level with the top chips. Nothing behind the
    // title screen is live yet, so hide it until the run starts.
    document.body.classList.add('booting');

    const keys = document.querySelector('.bootKeys');
    if (keys) {
      keys.innerHTML = CONTROLS
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
    this.el.pendingBtn.addEventListener('click', () => game.openOffer());
    this.el.offerScrim.addEventListener('click', () => game.closeOffer());

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

    const open = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.game.openBoss();
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

    // Stacks read bottom-up on screen, so slot 0 is the bottom cell.
    this.fillStack(mines, w, 'mines');
    this.fillStack(ammo, w, 'ammo');
    cfgMines.appendChild(this.configButton('mines'));
    cfgAmmo.appendChild(this.configButton('ammo'));
    for (const a of ARSENAL.filter((x) => x.group === 'auto')) {
      auto.appendChild(this.cell(a));
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
    b.innerHTML = `${a.icon}<span class="qLbl">${a.label}</span>`;
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
    for (const a of ARSENAL.filter((x) => x.group === group)) {
      const owned = world.unlocked.has(a.key);
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
        el: b, fill: b.querySelector('.fill'), pips, ready: null, frac: -1, locked: null, held: -1, cap: -1,
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

  syncAbilities(abilities) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
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
   * The waiting button. It is only ever there when something is actually
   * waiting, so it never competes with the field, and it says which tier is at
   * the front of the queue because a permanent one deserves to be noticed.
   */
  setPending(n, next) {
    const kind = next ? next.tier : '';
    if (n === this.lastPending && kind === this.lastPendingKind) return;
    this.lastPending = n;
    this.lastPendingKind = kind;
    this.el.pendingBtn.hidden = n <= 0;
    this.el.pendingCount.textContent = n;
    this.el.pendingCount.hidden = n < 2;
    this.el.pendingLabel.textContent = 'ALLOCATION';
    // The taller plate grows up into the caption band; the band gets out of
    // its way for as long as one is waiting. See styles.css.
    // The bloom belongs to the arrival, not to the tier: dropping back to a
    // top-up has to clear it or the next AMENDMENT inherits a spent animation.
    this.el.pendingBtn.classList.remove('flare');
  }


  showOffer(offer) {
    if (!offer) return;
    this.el.offerKicker.textContent = 'ALLOCATION AVAILABLE';
    this.el.offerNote.textContent = 'select one';
    this.el.offerCards.innerHTML = '';
    offer.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'offerCard';
      b.innerHTML = `<span class="offerMark">${opt.icon || ''}</span>`
        + '<span class="offerBody">'
        + `<span class="offerName">${opt.name}</span>`
        + `<span class="offerLine">${opt.line}</span>`
        // Said rather than implied: these come round again and again, and a
        // card reading "double fire rate" invites the wrong guess in either
        // direction — that a second one is wasted, or that it is quadruple.
        + (opt.stacks === 'time'
          ? `<span class="offerTag">${opt.unit === 'shots' ? 'SHOTS' : 'TIME'} STACKS, NOT EFFECT</span>`
          : opt.levels === 1 ? '<span class="offerTag">DOES NOT STACK</span>' : '')
        + '</span>'
        + '';
      b.addEventListener('click', () => this.game.takeOffer(i));
      this.el.offerCards.appendChild(b);
    });
    this.el.offer.hidden = false;
    this.el.offerScrim.hidden = false;
    // one frame, so the transition has something to run from
    void this.el.offer.offsetWidth;
    this.el.offer.classList.add('open');
    this.el.offerScrim.classList.add('on');
    document.body.classList.add('offerOpen');
  }

  hideOffer() {
    this.el.offer.classList.remove('open');
    this.el.offerScrim.classList.remove('on');
    this.el.offer.hidden = true;
    this.el.offerScrim.hidden = true;
    document.body.classList.remove('offerOpen');
  }

  /**
   * @param tutorial the opening script, which sits lower and reads larger.
   * @param hold seconds on screen. Sized to the sentence by default: a flat
   *   nine seconds gave a four-word line the same time as a fifteen-word one.
   */
  showHint(text, tutorial = false, hold = holdFor(text)) {
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
  }

  /** Take it down now — the run has moved on, or the opening was cut short. */
  clearHint() {
    this.tutLines.length = 0;
    this.hintTimer = 0;
    this.el.hint.classList.remove('show');
  }

  // ----------------------------------------------------------------- meters

  setKills(n, goal) {
    if (n === this.lastKills && goal === this.lastGoal) return;
    this.lastKills = n;
    this.lastGoal = goal;
    this.el.killNum.textContent = n;
    this.el.killGoal.textContent = goal ? `/${goal}` : '';
  }

  /**
   * Banked salvage, beside the count. The chip dims when the intake is being
   * sat on, because that is the only place the corruption costs anything the
   * player can read.
   */
  /**
   * What is running on a clock, and how much of it is left.
   *
   * Only two things in the game have a duration — SURGE and HASTE, the two
   * top-ups that stack in time rather than in effect — and until build 62
   * neither said so anywhere. You took a card that said "double fire rate for
   * 30s" and then had no way at all to know whether you were still inside the
   * thirty, which is most of what the card was worth.
   *
   * Rebuilt only when the set of live effects changes; a live one has its
   * number and its bar written in place every frame, so this costs two text
   * writes and a width per effect and never touches the DOM tree.
   */
  syncEffects(world) {
    const live = TIMED.filter((t) => world[t.id] > 0);
    const sig = live.map((t) => t.id).join(',');
    if (sig !== this.lastEffects) {
      this.lastEffects = sig;
      this.effectEls = {};
      this.el.effects.innerHTML = '';
      for (const t of live) {
        const d = document.createElement('div');
        d.className = `fxChip fx-${t.id}`;
        d.id = `fx${t.id[0].toUpperCase()}${t.id.slice(1)}`;
        d.innerHTML = `<span class="fxMark">${t.icon}</span>`
          + `<span class="fxBody"><span class="fxName">${t.name}</span>`
          + '<span class="fxBar"><i></i></span></span>'
          + '<b class="fxTime"></b>';
        this.el.effects.appendChild(d);
        this.effectEls[t.id] = { time: d.querySelector('.fxTime'), fill: d.querySelector('.fxBar i') };
      }
    }
    for (const t of live) {
      const left = world[t.id];
      const el = this.effectEls[t.id];
      if (!el) continue;
      // These stack in time, so a second card can put the clock well past one
      // card's worth. The bar is against the peak this run of it reached,
      // which is the only reading of "how full is it" that is true after two.
      this.effectPeak = this.effectPeak || {};
      this.effectPeak[t.id] = Math.max(this.effectPeak[t.id] || 0, left);
      // Seconds for the ones that run on a clock, shots for OVERDRAW, which
      // counts trigger pulls -- a slow round should get the same number of
      // them as a fast one, so it cannot be a duration.
      const secs = Math.ceil(left);
      if (secs !== el.lastSecs) {
        el.lastSecs = secs;
        el.time.textContent = t.unit === 'shots' ? String(secs) : `${secs}s`;
      }
      el.fill.style.width = `${Math.max(0, Math.min(1, left / this.effectPeak[t.id])) * 100}%`;
    }
    for (const t of TIMED) if (world[t.id] <= 0 && this.effectPeak) this.effectPeak[t.id] = 0;
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
  }



  setPhase(label) {
    if (label === this.lastPhase) return;
    this.lastPhase = label;
    this.el.phaseTag.textContent = label;
  }




  // ----------------------------------------------------------------- alerts

  /** `tone` overrides the kind's colour: used to say which object this is about. */
  alert(text, kind = 'info', duration = 2.4, tone = null) {
    const existing = this.alerts.find((a) => a.text === text);
    if (existing) {
      existing.t = duration;
      return;
    }
    const el = document.createElement('div');
    el.className = `alert ${kind}`;
    if (tone) el.style.color = tone;
    el.textContent = text;
    this.el.alerts.appendChild(el);
    this.alerts.push({ el, t: duration, text });
    while (this.alerts.length > 3) {
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
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      // The band going dark ends the stack: the next line after a silence
      // starts on its own rather than under something said a minute ago.
      if (this.hintTimer <= 0) {
        this.el.hint.classList.remove('show');
        this.tutLines.length = 0;
      }
    }
  }

  clearAlerts() {
    for (const a of this.alerts) a.el.remove();
    this.alerts.length = 0;
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
    b.textContent = `CONTINUE · ${d.kills}${d.endless ? '' : ` / ${CFG.killGoal}`}`;
    const bits = [];
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
    el.textContent = text;
    el.classList.add('show');
  }

  syncBoss(world) {
    const ap = this.el.apertureBar;
    const bar = this.el.bossBar;
    const boss = world.boss;
    const offer = !boss && world.aperture > 0;
    if (ap.hidden !== !offer) ap.hidden = !offer;
    if (offer) {
      const held = world.aperture > 1 ? ` x${world.aperture}` : '';
      const want = `APERTURE HELD${held}`;
      if (this._apLabel !== want) {
        this._apLabel = want;
        ap.firstElementChild.textContent = want;
      }
    }
    if (bar.hidden !== !boss) bar.hidden = !boss;
    if (!boss) { this._bossSeen = null; this._bossGhost = null; return; }

    const arriving = boss.arriving > 0;
    const core = arriving ? 1 : boss.coreFrac;
    this.el.bossCore.classList.toggle('arriving', arriving);
    this.el.bossFill.style.transform = `scaleX(${core.toFixed(3)})`;
    /*
     * The ghost only ever falls, and it falls late. It holds where the health
     * was until the transition catches it up, so a big hit reads as a hit
     * rather than as a bar that is slightly shorter than it was.
     */
    if (this._bossGhost == null || core > this._bossGhost) this._bossGhost = core;
    if (core < this._bossGhost) {
      this._bossGhost = core;
      this.el.bossGhost.style.transform = `scaleX(${core.toFixed(3)})`;
    }

    this.el.bossShellA.style.transform = `scaleX(${boss.shellFrac(0).toFixed(3)})`;
    this.el.bossShellB.style.transform = `scaleX(${boss.shellFrac(1).toFixed(3)})`;

    // Where the next two stages begin, on the track they begin at. Set once.
    if (!this._bossMarks) {
      this._bossMarks = true;
      const C = CFG.ordinal;
      this.el.bossMark3.style.left = `${(C.stageCore * 100).toFixed(1)}%`;
      this.el.bossMark4.style.left = `${(C.stageDescend * 100).toFixed(1)}%`;
    }
    this.el.bossMark3.classList.toggle('past', core <= CFG.ordinal.stageCore);
    this.el.bossMark4.classList.toggle('past', core <= CFG.ordinal.stageDescend);

    // The gauge wears the stage's own colour, so the bar escalates with the
    // sky rather than staying one pink for the whole fight.
    const tone = arriving ? 0 : boss.stage;
    if (tone !== this._bossTone) {
      this._bossTone = tone;
      const [c, lit] = BOSS_BAR[Math.min(tone, BOSS_BAR.length - 1)];
      bar.style.setProperty('--boss', c);
      bar.style.setProperty('--bossLit', lit);
    }

    const phase = arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][boss.stage - 1] || 'IV';
    if (this._bossSeen !== phase) {
      this._bossSeen = phase;
      this.el.bossPhase.textContent = phase;
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
