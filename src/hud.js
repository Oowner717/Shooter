// DOM-side interface. Canvas draws the world; HTML draws anything that has to
// be crisp, tappable and safe-area aware.

import { ABILITIES } from './abilities.js';
import { ARSENAL, specRows } from './arsenal.js';
import { CONTROLS } from './narrative.js';
import { BUILD } from './config.js';
import { clamp } from './util.js';
import { Menu } from './menu.js';
import { holdFor, STACK } from './tutorial.js';
import { SLOTS, carried, freeSlot } from './loadout.js';

const $ = (id) => document.getElementById(id);

/** Sliders. The one shape that reads as "choose what goes here" at 14px. */
const CONFIG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M4 7h6M14 7h6M4 17h10M18 17h2"/>'
  + '<circle cx="12" cy="7" r="2.1"/><circle cx="16" cy="17" r="2.1"/></svg>';

/** Rounds that are not the default. Mutually exclusive with each other. */
export const ROUND_KEYS = ['explosive', 'shotgun', 'arc', 'halo'];
/** Mines. Also mutually exclusive, but all of them can be off at once. */
export const MINE_KEYS = ['blast', 'snare', 'wire', 'knell'];

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      killNum: $('killNum'),
      counter: $('counter'),
      phaseTag: $('phaseTag'),
      bossBar: $('bossBar'),
      bossFill: $('bossFill'),
      bossTitle: $('bossTitle'),
      bossSub: $('bossSub'),
      alerts: $('alerts'),
      killGoal: document.querySelector('#counter .dim'),
      salvage: $('salvageNum'),
      salvageChip: $('salvageChip'),
      phaseTagEl: $('phaseTag'),
      pendingBtn: $('pendingBtn'),
      pendingLabel: $('pendingLabel'),
      pendingCount: $('pendingCount'),
      amendFlash: $('amendFlash'),
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
      bossCaption: $('bossCaption'),
      abilities: $('abilities'),
      hint: $('abilityHint'),
      debug: $('debugPanel'),
      dbgGrid: $('dbgGrid'),
      dbgStats: $('dbgStats'),
      boot: $('boot'),
      startBtn: $('startBtn'),
      endScreen: $('endScreen'),
      endText: $('endText'),
      resetBtn: $('resetBtn'),
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

    // Stamped where it is visible on launch: if this number is not the newest,
    // the page is running a cached build.
    const foot = document.querySelector('.bootFoot');
    if (foot) foot.textContent = `${foot.textContent}  ·  BUILD ${BUILD}`;

    this.el.loadScrim.addEventListener('click', () => game.closeLoadout());
    $('loadClose').addEventListener('click', () => game.closeLoadout());
    this.el.pendingBtn.addEventListener('click', () => game.openOffer());
    this.el.offerScrim.addEventListener('click', () => game.closeOffer());

    this.el.startBtn.addEventListener('click', () => game.start());
    this.el.resetBtn.addEventListener('click', () => game.restart());
    $('dbgClose').addEventListener('click', () => this.toggleDebug(false));
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
        // Ready means there is a use in hand, which with two charges is true
        // while the bar is still filling the second one back up.
        const ready = abilities.usable(i);
        if (s.ready !== ready) {
          s.ready = ready;
          s.el.classList.toggle('ready', ready);
        }
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
    this.el.pendingLabel.textContent = kind === 'large' ? 'AMENDMENT' : 'ALLOCATION';
    this.el.pendingBtn.classList.toggle('large', kind === 'large');
    // The taller plate grows up into the caption band; the band gets out of
    // its way for as long as one is waiting. See styles.css.
    document.body.classList.toggle('amendPending', kind === 'large');
    // The bloom belongs to the arrival, not to the tier: dropping back to a
    // top-up has to clear it or the next AMENDMENT inherits a spent animation.
    if (kind !== 'large') this.el.pendingBtn.classList.remove('flare');
  }

  /**
   * A permanent upgrade has come due. The plate blooms and a gold frame runs
   * round the edge of the screen twice. Neither one takes a tap or holds the
   * world — this is the interface raising its voice, not stopping the run.
   */
  announceAmendment() {
    const btn = this.el.pendingBtn;
    // setPending runs on the next frame off world state; the button has to be
    // up now or the bloom plays against display:none and is never seen.
    btn.hidden = false;
    btn.classList.add('large');
    document.body.classList.add('amendPending');
    this.el.pendingLabel.textContent = 'AMENDMENT';
    btn.classList.remove('flare');
    void btn.offsetWidth;
    btn.classList.add('flare');

    const f = this.el.amendFlash;
    clearTimeout(this.amendTimer);
    f.hidden = true;
    void f.offsetWidth;
    f.hidden = false;
    this.amendTimer = setTimeout(() => { f.hidden = true; }, 2000);
  }

  showOffer(offer) {
    if (!offer) return;
    const large = offer.tier === 'large';
    this.el.offerKicker.textContent = large ? 'PERFORMANCE NOTED' : 'ALLOCATION AVAILABLE';
    this.el.offerNote.textContent = large ? 'permanent · select one' : 'select one';
    this.el.offer.classList.toggle('large', large);
    this.el.offerCards.innerHTML = '';
    offer.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'offerCard';
      const held = large ? offer.held[opt.id] || 0 : 0;
      b.innerHTML = `<span class="offerMark">${opt.icon || ''}</span>`
        + '<span class="offerBody">'
        + (large ? `<span class="offerAxis">${opt.axis}</span>` : '')
        + `<span class="offerName">${opt.name}</span>`
        + `<span class="offerLine">${opt.line}</span>`
        // Said rather than implied: these come round again and again, and a
        // card reading "double fire rate" invites the wrong guess in either
        // direction — that a second one is wasted, or that it is quadruple.
        + (opt.stacks === 'time'
          ? '<span class="offerTag">TIME STACKS, NOT EFFECT</span>'
          : opt.stacks === false ? '<span class="offerTag">DOES NOT STACK</span>' : '')
        + '</span>'
        // How many of this one is already stacked. The whole reason the marks
        // exist: a repeatable upgrade is worth recognising by shape.
        + (held ? `<span class="offerHeld">x${held}</span>` : '');
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
  setSalvage(n, rate = 1) {
    const v = Math.floor(n);
    if (v !== this.lastSalvage) {
      this.lastSalvage = v;
      this.el.salvage.textContent = v;
    }
    const choked = rate < 0.999;
    if (choked !== this.lastChoked) {
      this.lastChoked = choked;
      this.el.salvageChip.classList.toggle('choked', choked);
    }
  }

  /**
   * The same chip, repurposed. It is the most-looked-at number on the screen
   * for thirteen minutes, so taking it over says more than any alert can.
   */
  setLedgerMode(on) {
    this.el.counter.classList.toggle('ledger', on);
    if (!on) this.el.counter.classList.remove('spent');
    // WITHHELD, not RECLAIMED: the number is what ORDINAL still has of yours,
    // and it reads 500/500 at the moment nothing has come back yet.
    this.el.counterLabel.textContent = on ? 'WITHHELD' : 'OBJECTS';
    // The memo exists to keep the DOM quiet; a mode change has to break it in
    // both directions or the chip keeps the previous run's number.
    this.lastKills = -1;
    this.lastGoal = -1;
  }

  setLedger(n, of) {
    this.setKills(n, of);
    // Emptied: it stops reading as a quantity and starts reading as a state.
    this.el.counter.classList.toggle('spent', n <= 0);
    if (n <= 0) this.el.counterLabel.textContent = 'SPENT';
  }

  setPhase(label) {
    if (label === this.lastPhase) return;
    this.lastPhase = label;
    this.el.phaseTag.textContent = label;
  }

  /**
   * The arrival captions. Large, centred, one at a time — deliberately not an
   * alert pill, because the point of the entrance is that the interface stops
   * being busy for a moment. Pass null to clear.
   */
  bossCaption(text, hold = 3) {
    const el = this.el.bossCaption;
    clearTimeout(this.captionTimer);
    if (!text) {
      el.classList.remove('show');
      el.textContent = '';
      return;
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // restart the entrance
    el.classList.add('show');
    this.captionTimer = setTimeout(() => el.classList.remove('show'), hold * 1000);
  }

  setBoss(visible, frac = 1, title, sub) {
    this.el.bossBar.hidden = !visible;
    // The phase chip reads BOSS directly above a bar that reads ORDINAL. One
    // of them is redundant, and dropping it is also what keeps the top bar
    // inside 320px now that salvage has a chip.
    this.el.phaseTagEl.hidden = visible;
    if (!visible) return;
    this.el.bossFill.style.transform = `scaleX(${clamp(frac, 0, 1)})`;
    if (title) this.el.bossTitle.textContent = title;
    if (sub) this.el.bossSub.textContent = sub;
  }


  // ----------------------------------------------------------------- alerts

  alert(text, kind = 'info', duration = 2.4) {
    const existing = this.alerts.find((a) => a.text === text);
    if (existing) {
      existing.t = duration;
      return;
    }
    const el = document.createElement('div');
    el.className = `alert ${kind}`;
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
    const actions = [
      ['SKIP → COUNT', () => g.debugSkipToCount()],
      ['TOGGLE ENDLESS', () => g.debugEndless()],
      ['SKIP → BOSS', () => g.debugSkipToBoss()],
      ['KILL BOSS', () => g.debugKillBoss()],
      ['+50 KILLS', () => g.debugAddKills(50)],
      ['NEXT STORY', () => g.debugNextStory()],
      ['BOSS POWER', () => g.debugBossPower()],
      ['REPRISE', () => g.debugReprise()],
      ['ECHO', () => g.debugEcho()],
      ['TITHE', () => g.debugTithe()],
      ['SUBTRACT', () => g.debugSubtract()],
      ['DRAIN LEDGER', () => g.debugDrainLedger()],
      ['UNLOCK ALL', () => g.debugUnlockAll()],
      ['SKIP INTRO', () => g.debugSkipIntro()],
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
      ['END SCREEN', () => g.debugEnding()],
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
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.textContent = label;
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

  toggleDebug(force) {
    const next = force === undefined ? this.el.debug.hidden : force;
    this.el.debug.hidden = !next;
  }

  setStats(text) {
    this.el.dbgStats.textContent = text;
  }

  // ------------------------------------------------------------- screens

  hideBoot() {
    document.body.classList.remove('booting');
    this.el.boot.classList.add('out');
    setTimeout(() => { this.el.boot.hidden = true; }, 500);
  }

  showEnding(lines) {
    document.body.classList.add('ending');
    this.el.endScreen.hidden = false;
    this.el.endText.innerHTML = '';
    lines.forEach((line, i) => {
      const d = document.createElement('div');
      d.textContent = line;
      if (i === lines.length - 1) d.className = 'term';
      d.style.animationDelay = `${i * 1.5}s`;
      this.el.endText.appendChild(d);
    });
    this.el.resetBtn.hidden = true;
  }

  showResetButton() {
    this.el.resetBtn.hidden = false;
  }

  hideEnding() {
    document.body.classList.remove('ending');
    this.el.endScreen.hidden = true;
    this.el.endText.innerHTML = '';
    this.el.resetBtn.hidden = true;
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
    this.menu.sync(world);
  }

  /**
   * First-ever kill of a type. Deliberately wordless: an alert here would be
   * text over the boss the moment ORDINAL emits something new, which is the
   * one thing the fight is not allowed to do. The menu button pulses and its
   * count goes up, and the entry is waiting when the player looks.
   */
  noteCodex() {
    this.menu.syncCodex();
    const b = this.menu.el.btn;
    b.classList.remove('recorded');
    void b.offsetWidth;
    b.classList.add('recorded');
  }
}
