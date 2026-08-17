// DOM-side interface. Canvas draws the world; HTML draws anything that has to
// be crisp, tappable and safe-area aware.

import { ABILITIES } from './abilities.js';
import { BUILD } from './config.js';
import { clamp } from './util.js';
import { Menu } from './menu.js';

const $ = (id) => document.getElementById(id);

/** Cells that select a loadout rather than an assist. Mutually exclusive. */
export const ROUND_KEYS = ['explosive', 'shotgun', 'arc', 'barb'];
export const ASSIST_KEYS = ['autoAim', 'autoFire', 'autoMine', 'autoSnare'];
const CFG_LABEL = { explosive: 'HE', shotgun: 'SHOT', arc: 'ARC', barb: 'BARB' };
const ASSIST_MARK = { autoAim: '◎', autoFire: '↑', autoMine: '◈', autoSnare: '✳' };

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
      gateBar: $('gateBar'),
      gateFill: $('gateFill'),
      alerts: $('alerts'),
      killGoal: document.querySelector('#counter .dim'),
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
      loadoutChip: $('loadoutChip'),
      loadoutRound: $('loadoutRound'),
      loadoutAssists: $('loadoutAssists'),
    };

    this.slots = [];
    this.alerts = [];
    this.hintTimer = 0;
    this.lastKills = -1;
    this.lastGoal = -1;
    this.lastPhase = '';

    this.buildAbilities();
    this.buildDebug();

    // The menu owns the loadout cells now, so it is built before anything
    // tries to read or set one.
    this.menu = new Menu(game);
    this.el.toggles = {};
    for (const [key, el] of this.menu.cells) this.el.toggles[key] = el;
    this.el.loadoutChip.addEventListener('click', () => {
      this.menu.show('loadout');
      this.menu.setOpen(true);
    });

    // The boot copy is translucent enough to read the HUD through it, and on a
    // short screen the kicker sits level with the top chips. Nothing behind the
    // title screen is live yet, so hide it until the run starts.
    document.body.classList.add('booting');

    // Stamped where it is visible on launch: if this number is not the newest,
    // the page is running a cached build.
    const foot = document.querySelector('.bootFoot');
    if (foot) foot.textContent = `${foot.textContent}  ·  BUILD ${BUILD}`;

    this.el.startBtn.addEventListener('click', () => game.start());
    this.el.resetBtn.addEventListener('click', () => game.restart());
    $('dbgClose').addEventListener('click', () => this.toggleDebug(false));
  }

  // ------------------------------------------------------------- abilities

  buildAbilities() {
    const frag = document.createDocumentFragment();
    ABILITIES.forEach((def, i) => {
      const b = document.createElement('button');
      b.className = 'ab';
      b.style.color = def.color;
      b.innerHTML = `<span class="fill"></span>${def.icon}<span class="lbl">${def.name}</span>`;
      b.setAttribute('aria-label', def.name);
      const trigger = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.game.useAbility(i);
      };
      b.addEventListener('pointerdown', trigger);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      frag.appendChild(b);
      this.slots.push({ el: b, fill: b.querySelector('.fill'), ready: null, frac: -1, locked: null });
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
        const ready = f >= 1;
        if (s.ready !== ready) {
          s.ready = ready;
          s.el.classList.toggle('ready', ready);
        }
      }
      if (s.locked !== locked) {
        s.locked = locked;
        s.el.classList.toggle('locked', locked);
      }
    }
  }

  showHint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    this.hintTimer = 3.4;
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
    if (!visible) return;
    this.el.bossFill.style.transform = `scaleX(${clamp(frac, 0, 1)})`;
    if (title) this.el.bossTitle.textContent = title;
    if (sub) this.el.bossSub.textContent = sub;
  }

  setGate(visible, frac = 1) {
    this.el.gateBar.hidden = !visible;
    if (!visible) return;
    this.el.gateFill.style.transform = `scaleX(${clamp(frac, 0, 1)})`;
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
      if (this.hintTimer <= 0) this.el.hint.classList.remove('show');
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
      ['SKIP → GATE', () => g.debugSkipToGate()],
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
      ['SKIP INTRO', () => g.debugSkipIntro()],
      ['SPAWN WAVE', () => g.debugSpawnWave()],
      ['FILL FIELD', () => g.debugFillField()],
      ['CLEAR FIELD', () => g.debugClearField()],
      ['GLITCH TEST', () => g.debugGlitch()],
      ['THROW MINE', () => g.debugThrowMine()],
      ['THROW SNARE', () => g.debugThrowSnare()],
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
      ['INVINCIBLE GATE', 'toughGate'],
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

  setToggle(key, on) {
    const el = this.el.toggles[key];
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', String(on));
  }

  setSound() {
    this.menu.syncSystem();
  }

  /**
   * The loadout readout in the top bar: what is loaded and which assists are
   * live, so the menu is never needed just to check.
   */
  syncLoadout(world) {
    const round = ROUND_KEYS.find((k) => world.round === k);
    const label = round ? CFG_LABEL[round] : 'STD';
    const on = ASSIST_KEYS.filter((k) => world[k]).map((k) => ASSIST_MARK[k]).join('');
    if (this.lastRoundLabel !== label) {
      this.lastRoundLabel = label;
      this.el.loadoutRound.textContent = label;
      this.el.loadoutChip.classList.toggle('armed', label !== 'STD');
    }
    const marks = on || '—';
    if (this.lastAssists !== marks) {
      this.lastAssists = marks;
      this.el.loadoutAssists.textContent = marks;
    }
  }

  /**
   * What still has to run while the simulation is held: the interface itself,
   * so a cell lights the instant it is tapped and the readout keeps up.
   */
  syncHudLight(world) {
    this.syncAbilities(world.abilities);
    this.syncLoadout(world);
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
