// DOM-side interface. Canvas draws the world; HTML draws anything that has to
// be crisp, tappable and safe-area aware.

import { ABILITIES } from './abilities.js';
import { BUILD } from './config.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);

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
      status: $('status'),
      killGoal: document.querySelector('#counter .dim'),
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
      muteBtn: $('muteBtn'),
      dbgBtn: $('dbgBtn'),
    };

    this.slots = [];
    this.alerts = [];
    this.statusEls = new Map();
    this.hintTimer = 0;
    this.lastKills = -1;
    this.lastGoal = -1;
    this.lastPhase = '';

    this.buildAbilities();
    this.buildDebug();

    // Stamped where it is visible on launch: if this number is not the newest,
    // the page is running a cached build.
    const foot = document.querySelector('.bootFoot');
    if (foot) foot.textContent = `${foot.textContent}  ·  BUILD ${BUILD}`;

    this.el.startBtn.addEventListener('click', () => game.start());
    this.el.resetBtn.addEventListener('click', () => game.restart());
    this.el.muteBtn.addEventListener('click', () => game.toggleSound());
    this.el.dbgBtn.addEventListener('click', () => this.toggleDebug());
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
      this.slots.push({ el: b, fill: b.querySelector('.fill'), ready: null, frac: -1 });
    });
    this.el.abilities.appendChild(frag);
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
      if (s.frac !== f) {
        s.frac = f;
        s.fill.style.transform = `scaleY(${1 - f})`;
        const ready = f >= 1;
        if (s.ready !== ready) {
          s.ready = ready;
          s.el.classList.toggle('ready', ready);
        }
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

  setPhase(label) {
    if (label === this.lastPhase) return;
    this.lastPhase = label;
    this.el.phaseTag.textContent = label;
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

  /**
   * Sticky pills for whatever is currently being done to you. Diffed against
   * the live set so nothing is torn down and rebuilt every frame.
   */
  syncStatus(world) {
    const want = new Map();
    if (world.attackers.size > 0) want.set('BREACH · CLEAR THE MARKED OBJECT', 'breach');
    if (world.veil > 0) want.set('VEIL', 'power');
    if (world.invert > 0) want.set('AIM INVERTED', 'power');
    if (world.jam > 0) want.set('FEED JAMMED', 'power');
    if (world.chrono > 0) want.set('ROUNDS SLOWED', 'power');
    if (world.boss && world.boss.recallActive) want.set('RECALL', 'power');

    for (const [text, el] of this.statusEls) {
      if (!want.has(text)) {
        el.remove();
        this.statusEls.delete(text);
      }
    }
    for (const [text, kind] of want) {
      if (this.statusEls.has(text)) continue;
      const el = document.createElement('div');
      el.className = `alert ${kind}`;
      el.textContent = text;
      this.el.status.appendChild(el);
      this.statusEls.set(text, el);
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
    for (const el of this.statusEls.values()) el.remove();
    this.statusEls.clear();
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
      ['SPAWN WAVE', () => g.debugSpawnWave()],
      ['FILL FIELD', () => g.debugFillField()],
      ['CLEAR FIELD', () => g.debugClearField()],
      ['GLITCH TEST', () => g.debugGlitch()],
      ['RESTART', () => g.restart()],
      ['END SCREEN', () => g.debugEnding()],
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

  setSound(on) {
    this.el.muteBtn.classList.toggle('off', !on);
  }
}
