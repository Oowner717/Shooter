/**
 * SANDBOX. The instrument, inside the game.
 *
 * Every balance question this project has answered was answered by a
 * throwaway probe in a headless browser -- and three of those probes
 * published a finding that turned out to be the instrument rather than the
 * game. This is the same measurement taken from inside the running game, on
 * the phone, against the kit the player has actually bought: put a thing down,
 * shoot it, and read what each round, mine and ability is delivering.
 *
 * ---- what it is not ----
 *
 * It is not a run. Nothing here is earned and nothing here is kept: no waves,
 * no energy, no salvage, no rules, no glitch timer, no boosts, and no ladder.
 * The one thing it borrows is the run's kit, because measuring a stock turret
 * would be measuring a turret nobody is playing.
 *
 * Entering checkpoints the run and leaving restores it, so the field you come
 * back to is the same one `resume()` would have handed you after a reload --
 * your count, your kit and your salvage, standing on clear ground. While the
 * sandbox is up the run's own checkpoint clock is suspended, or the sandbox
 * would quietly overwrite the run it is standing on.
 *
 * ---- what may be spawned ----
 *
 * What has been destroyed at least once, ever -- `codex.seen`, the same
 * persistent record the glossary is drawn from. That is deliberate: the
 * sandbox is a place to re-examine things you have met, not a way to look at
 * the roster ahead of meeting it. Anomalies are on the same rule, so a boss
 * can be summoned once it has been broken once.
 *
 * A summoned anomaly here is an object and nothing more: no arrival banner, no
 * lines, no RECONCILED, no rung, no aperture spent, and -- unlike the real
 * thing -- the field it arrives on is left exactly as it was.
 */

import { TYPE_BY_ID, ENEMY_TYPES } from './config.js';
import { GROUP_MAX, FORMATION_SHAPES, drawSpecimen } from './enemies.js';
import { ANOMALIES, anomalyOf, makerOf } from './anomaly.js';
import { codex, FIELD_ENTRIES } from './codex.js';
import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { ledger, SRC_EXTRA } from './ledger.js';
import { background } from './background.js';
import { rgba } from './util.js';

const $ = (id) => document.getElementById(id);

/**
 * The name and colour of a ledger source.
 *
 * Rounds and mines are `ARSENAL` keys and abilities are `ABILITIES` ids,
 * because that is what the ledger records -- so the panel takes its labels
 * from the same tables the rest of the interface does, and a round renamed in
 * one place is renamed here. What is left is the handful of things a player
 * never buys as an item; those are in `SRC_EXTRA`.
 */
const ARS_BY_KEY = new Map(ARSENAL.map((a) => [a.key, a]));
const ABL_BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

export function sourceName(src) {
  const a = ARS_BY_KEY.get(src);
  if (a) return a.label;
  const b = ABL_BY_ID.get(src);
  if (b) return b.name;
  return (SRC_EXTRA[src] || {}).name || String(src || '?').toUpperCase();
}

export function sourceTone(src) {
  const a = ARS_BY_KEY.get(src);
  if (a && a.tone) return a.tone;
  const b = ABL_BY_ID.get(src);
  if (b && b.color) return b.color;
  return (SRC_EXTRA[src] || {}).tone || '#9fb3c8';
}

/**
 * Which of the four families a source belongs to, for the grouped table.
 * Taken off ARSENAL's own `kind` rather than from a second list here.
 */
export function sourceGroup(src) {
  const a = ARS_BY_KEY.get(src);
  if (a) return a.kind === 'mine' ? 'MINES' : 'AMMUNITION';
  if (ABL_BY_ID.has(src)) return 'ABILITIES';
  return 'EVERYTHING ELSE';
}

const GROUP_ORDER = ['AMMUNITION', 'MINES', 'ABILITIES', 'EVERYTHING ELSE'];

/**
 * What the picker offers: the field, and nothing an anomaly puts down.
 *
 * The first version listed every ENEMY_TYPE, which meant thirty-seven chips
 * including seven boss cores and the fourteen pieces they make -- so ORDINAL
 * could be put down as a bare core with none of its frame, a DIGIT could be
 * spawned with no ORDINAL to have come off, and the six rows of the picker
 * you had to scroll past to reach anything were mostly things that only exist
 * inside a fight. A boss is summoned WHOLE from the ANOMALIES row underneath,
 * which is the only way it is a boss at all.
 *
 * Derived from the glossary's own split rather than written out here:
 * `FIELD_ENTRIES` is `CODEX` minus every id any anomaly puts on the field, so
 * a new boss or a new minion is excluded by existing.
 */
const FIELD_IDS = new Set(FIELD_ENTRIES.map((e) => e.id));
const SPAWNABLE = ENEMY_TYPES.filter((t) => FIELD_IDS.has(t.id));

/** A number a player can read at a glance, not to four significant figures. */
function num(v) {
  if (!(v > 0)) return '0';
  if (v >= 100000) return `${Math.round(v / 1000)}k`;
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function clock(t) {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class Sandbox {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.sheet = '';           // '' | 'spawn' | 'stats'
    this.pick = { id: 'mote', count: 5, shape: '', where: 'field' };
    this.chips = new Map();
    this.bossChips = new Map();
    this.rows = [];
    this.el = {};
    this.build();
  }

  // ------------------------------------------------------------ the shell

  build() {
    const root = $('sandbox');
    if (!root) return;
    this.el.root = root;

    const bar = document.createElement('div');
    bar.id = 'sbBar';
    bar.innerHTML = '<span class="sbTag">SANDBOX</span>'
      + '<span id="sbDps"><b>0</b><em>DPS</em></span>';
    const mk = (id, text, fn) => {
      const b = document.createElement('button');
      b.id = id;
      b.className = 'sbBtn';
      b.textContent = text;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    this.el.dps = bar.querySelector('#sbDps b');
    this.el.spawnBtn = mk('sbSpawnBtn', 'SPAWN', () => this.show(this.sheet === 'spawn' ? '' : 'spawn'));
    this.el.statsBtn = mk('sbStatsBtn', 'STATS', () => this.show(this.sheet === 'stats' ? '' : 'stats'));
    mk('sbExit', 'EXIT', () => this.game.exitSandbox());

    const sheet = document.createElement('div');
    sheet.id = 'sbSheet';
    sheet.hidden = true;
    this.el.sheet = sheet;

    this.el.spawnPane = this.buildSpawn();
    this.el.statsPane = this.buildStats();
    sheet.append(this.el.spawnPane, this.el.statsPane);
    root.append(bar, sheet);
  }

  /**
   * The picker. Modelled on the debug panel's, and wearing its classes, so
   * the two look like the same tool and neither carries a private stylesheet.
   * What is different is the gate: only what the codex has seen.
   */
  buildSpawn() {
    const p = document.createElement('div');
    p.className = 'sbPane';

    const pick = document.createElement('div');
    pick.className = 'spawnPick';
    for (const t of SPAWNABLE) {
      const b = document.createElement('button');
      b.className = 'spawnChip';
      b.title = t.name;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.translate(32, 32);
      drawSpecimen(ctx, t.id, 20);
      const name = document.createElement('span');
      name.textContent = t.name;
      b.append(c, name);
      b.addEventListener('click', () => { this.pick.id = t.id; this.syncSpawn(); });
      pick.appendChild(b);
      this.chips.set(t.id, b);
    }
    this.el.pick = pick;

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
        b.addEventListener('click', () => { write(value); this.syncSpawn(); });
        box.appendChild(b);
        cells.push([b, value]);
      }
      r.append(l, box);
      this.rows.push({ cells, read });
      return r;
    };

    const counts = [1, 3, 5, 8, 12, 20].filter((n) => n <= GROUP_MAX);
    const howMany = row('HOW MANY', counts.map((n) => [String(n), n]),
      () => this.pick.count, (v) => { this.pick.count = v; });
    const shape = row('SHAPE', [['ANY', ''], ...FORMATION_SHAPES.map((k) => [k.toUpperCase(), k])],
      () => this.pick.shape, (v) => { this.pick.shape = v; });
    const where = row('ARRIVES', [['ABOVE', 'entry'], ['ON FIELD', 'field']],
      () => this.pick.where, (v) => { this.pick.where = v; });

    const go = document.createElement('button');
    go.className = 'spawnGo';
    go.addEventListener('click', () => this.spawn());
    this.el.go = go;

    /*
     * The dummy. A body that does not move, does not attack, does not die and
     * does not pay -- so a damage-per-second reading is a reading of the gun
     * and not of how long a LURCHER happened to survive. It is the one thing
     * here that is not a copy of something in the roster.
     */
    const dummy = document.createElement('button');
    dummy.className = 'spawnGo sbDummy';
    dummy.textContent = 'PRACTICE DUMMY';
    dummy.addEventListener('click', () => this.dummy());

    const bosses = document.createElement('div');
    bosses.className = 'sbBosses';
    const bh = document.createElement('span');
    bh.className = 'spawnLabel';
    bh.textContent = 'ANOMALIES';
    bosses.appendChild(bh);
    const brow = document.createElement('div');
    brow.className = 'sbBossRow';
    for (const a of ANOMALIES) {
      const b = document.createElement('button');
      b.className = 'sbBoss';
      b.textContent = a.name;
      b.style.setProperty('--tone', a.tone);
      b.addEventListener('click', () => this.summon(a.n));
      brow.appendChild(b);
      this.bossChips.set(a.n, b);
    }
    bosses.appendChild(brow);
    this.el.bosses = bosses;

    const clear = document.createElement('button');
    clear.className = 'spawnClear';
    clear.textContent = 'CLEAR FIELD';
    clear.addEventListener('click', () => this.game.debugClearField());

    p.append(pick, howMany, shape, where, go, dummy, bosses, clear);
    return p;
  }

  buildStats() {
    const p = document.createElement('div');
    p.className = 'sbPane';
    p.hidden = true;

    const head = document.createElement('div');
    head.className = 'sbStatHead';
    head.innerHTML = '<div><b id="sbTotal">0</b><em>DAMAGE</em></div>'
      + '<div><b id="sbLive">0</b><em>DPS NOW</em></div>'
      + '<div><b id="sbSust">0</b><em>DPS AVG</em></div>'
      + '<div><b id="sbPeak">0</b><em>DPS PEAK</em></div>';
    const sub = document.createElement('div');
    sub.className = 'sbStatSub';
    sub.innerHTML = '<span id="sbClock">00:00</span><span id="sbOver"></span>';
    const reset = document.createElement('button');
    reset.className = 'sbReset';
    reset.textContent = 'RESET COUNTER';
    reset.addEventListener('click', () => { ledger.reset(); this.syncStats(); });
    const table = document.createElement('div');
    table.className = 'sbTable';

    p.append(head, sub, reset, table);
    this.el.table = table;
    this.el.total = head.querySelector('#sbTotal');
    this.el.live = head.querySelector('#sbLive');
    this.el.sust = head.querySelector('#sbSust');
    this.el.peak = head.querySelector('#sbPeak');
    this.el.clock = sub.querySelector('#sbClock');
    this.el.over = sub.querySelector('#sbOver');
    return p;
  }

  // ---------------------------------------------------------- in and out

  enter() {
    this.on = true;
    this.sheet = '';
    if (this.el.root) this.el.root.hidden = false;
    if (this.el.sheet) this.el.sheet.hidden = true;
    document.body.classList.add('sandbox');
    ledger.arm(true);
    background.setMood('sandbox', true);
    this.syncSpawn();
  }

  leave() {
    this.on = false;
    this.sheet = '';
    if (this.el.root) this.el.root.hidden = true;
    if (this.el.sheet) this.el.sheet.hidden = true;
    document.body.classList.remove('sandbox');
    // Kept, not cleared: the menu shows the last session, and a table that
    // vanished the moment you left would be a table nobody could quote.
    ledger.disarm();
  }

  show(which) {
    this.sheet = which;
    if (!this.el.sheet) return;
    this.el.sheet.hidden = !which;
    this.el.spawnPane.hidden = which !== 'spawn';
    this.el.statsPane.hidden = which !== 'stats';
    this.el.spawnBtn.classList.toggle('on', which === 'spawn');
    this.el.statsBtn.classList.toggle('on', which === 'stats');
    if (which === 'spawn') this.syncSpawn();
    if (which === 'stats') this.syncStats();
  }

  // -------------------------------------------------------------- putting

  /** Only what has been destroyed at least once, ever. */
  allowed(id) {
    return codex.has(id);
  }

  spawn() {
    if (!this.allowed(this.pick.id)) return;
    const made = this.game.debugSpawnGroup(this.pick.id, this.pick.count, {
      shape: this.pick.shape || undefined,
      where: this.pick.where,
    });
    const t = TYPE_BY_ID[this.pick.id];
    this.game.hud.alert(`+${made.length} ${t ? t.name : this.pick.id}`, 'info', 1.2);
  }

  /**
   * A body with no route, no legs and no end.
   *
   * Built out of the roster's heaviest shape and then unmade: `fixed` is what
   * the boss frames use to say "the physics does not move this", `harmless`
   * keeps it off the corruption path, and the health is topped back up every
   * frame in `Game.update` so the reading is never cut short by the thing
   * dying. It cannot be destroyed, so it cannot pay and cannot be counted.
   */
  dummy() {
    const w = this.game.world;
    const e = this.game.debugSpawn('bulwark', w.width / 2, w.shooter.y - 300);
    if (!e) return;
    e.staged = false;
    e.spawnIn = 0;
    e.dummy = true;
    e.harmless = true;
    e.counts = false;
    e.invMass = 0;
    e.vx = 0;
    e.vy = 0;
    e.hp = 1e9;
    e.maxHp = 1e9;
    this.game.hud.alert('DUMMY PLACED', 'info', 1.2);
  }

  /**
   * An anomaly, as an object.
   *
   * `Game.openBoss` is the real door and does four things this must not: it
   * spends an APERTURE, it hauls in and destroys everything already on the
   * field, it puts a banner up, and its ending pays a rung and a RECONCILED.
   * This is the constructor and the moods and nothing else -- which is what
   * "like he is a regular object" means.
   */
  summon(n) {
    const w = this.game.world;
    if (w.boss) return;
    const a = anomalyOf(n);
    const make = makerOf(n);
    if (!a || !make || !this.allowed(a.types[0])) return;
    this.game.summonSandboxBoss(n, make);
    this.show('');
  }

  // -------------------------------------------------------------- syncing

  syncSpawn() {
    for (const [id, b] of this.chips) {
      const seen = this.allowed(id);
      b.disabled = !seen;
      b.classList.toggle('locked', !seen);
      b.classList.toggle('on', seen && id === this.pick.id);
    }
    // If the selection is not something this device has met, move it to the
    // first thing that is -- a picker whose GO does nothing is worse than a
    // picker that chose for you.
    if (!this.allowed(this.pick.id)) {
      const first = SPAWNABLE.find((t) => this.allowed(t.id));
      if (first) this.pick.id = first.id;
      for (const [id, b] of this.chips) b.classList.toggle('on', id === this.pick.id);
    }
    for (const r of this.rows) {
      const v = r.read();
      for (const [b, value] of r.cells) b.classList.toggle('on', value === v);
    }
    const t = TYPE_BY_ID[this.pick.id];
    if (this.el.go) {
      this.el.go.textContent = this.allowed(this.pick.id)
        ? `SPAWN ${this.pick.count} ${t ? t.name : ''}`.trim()
        : 'NOTHING MET YET';
      this.el.go.disabled = !this.allowed(this.pick.id);
    }
    for (const [n, b] of this.bossChips) {
      const a = anomalyOf(n);
      const ok = !!a && !!makerOf(n) && this.allowed(a.types[0]);
      b.disabled = !ok;
      b.classList.toggle('locked', !ok);
    }
  }

  syncStats() {
    if (!this.el.table) return;
    this.el.total.textContent = num(ledger.total);
    this.el.live.textContent = num(ledger.live());
    this.el.sust.textContent = num(ledger.total / Math.max(0.25, ledger.t));
    this.el.peak.textContent = num(ledger.peak);
    this.el.clock.textContent = clock(ledger.t);
    this.el.over.textContent = ledger.total > 0 || ledger.kills > 0
      ? `${ledger.kills} DESTROYED  ·  ${ledger.total > 0
        ? Math.round((ledger.over / ledger.total) * 100) : 0}% OVERKILL` : '';

    // A row with no damage and no kills is a source that did nothing, and the
    // table should not carry it. VOID has no damage by design and is kept by
    // the kills arm.
    const rows = ledger.table().filter((r) => r.total > 0 || r.kills > 0);
    if (!rows.length) {
      this.el.table.innerHTML = '<p class="sbEmpty">Nothing has been hit yet. '
        + 'Put something down and shoot it.</p>';
      return;
    }
    const top = rows[0].total || 1;
    const parts = [];
    for (const g of GROUP_ORDER) {
      const mine = rows.filter((r) => sourceGroup(r.src) === g);
      if (!mine.length) continue;
      parts.push(`<h4>${g}</h4>`);
      for (const r of mine) {
        const tone = sourceTone(r.src);
        /*
         * A source with kills and no damage is not a blank row: VOID deletes
         * a body through `Enemy.destroy` and never touches `applyDamage`, so
         * its damage really is zero and its whole contribution is the kill.
         * Saying so beats a row of dashes.
         */
        const rate = r.total > 0 ? num(r.sustained) : '&mdash;';
        const tot = r.total > 0 ? num(r.total) : `${r.kills} kill${r.kills === 1 ? '' : 's'}`;
        parts.push(
          '<div class="sbRow">'
          + `<i style="background:${tone}"></i>`
          + `<span class="sbName">${sourceName(r.src)}</span>`
          + `<span class="sbBar"><b style="width:${(r.total / top) * 100}%;`
          + `background:${rgba(tone, 0.55)}"></b></span>`
          + `<span class="sbNum">${rate}</span>`
          + `<span class="sbTot">${tot}</span>`
          + '</div>',
        );
      }
    }
    this.el.table.innerHTML =
      '<div class="sbHeadRow"><span></span><span class="sbName">SOURCE</span>'
      + '<span class="sbBar"></span><span class="sbNum">DPS</span>'
      + '<span class="sbTot">TOTAL</span></div>' + parts.join('');
  }

  /**
   * Once a frame, and deliberately cheap on the frames nothing is open: the
   * bar's one number every frame, the table four times a second. Reading
   * `ledger.table()` sorts and allocates, and nobody can read a table that
   * redraws sixty times a second anyway.
   */
  update(dt) {
    if (!this.on) return;
    if (this.el.dps) this.el.dps.textContent = num(ledger.live());
    this.statT = (this.statT || 0) - dt;
    if (this.statT <= 0) {
      this.statT = 0.25;
      if (this.sheet === 'stats') this.syncStats();
      if (this.sheet === 'spawn') this.syncSpawn();
    }
  }
}

/**
 * The last session, for the menu room. One line of headline and the three
 * heaviest sources -- enough to be worth opening the tab for, and not so much
 * that the room stops being a door.
 */
export function lastSession() {
  if (!(ledger.t > 0) || (ledger.total <= 0 && ledger.kills <= 0)) return null;
  return {
    clock: clock(ledger.t),
    total: num(ledger.total),
    kills: ledger.kills,
    dps: num(ledger.total / Math.max(0.25, ledger.t)),
    top: ledger.table().filter((r) => r.total > 0 || r.kills > 0).slice(0, 3).map((r) => ({
      name: sourceName(r.src),
      tone: sourceTone(r.src),
      value: r.total > 0 ? num(r.sustained) : `${r.kills} kill${r.kills === 1 ? '' : 's'}`,
    })),
  };
}

/** The tree node that opens the door, named in one place. */
export const SANDBOX_ID = 'sandbox';

/** ...and whether this run has it. */
export function sandboxOwned(world) {
  return !!(world && world.up && world.up.sandbox);
}
