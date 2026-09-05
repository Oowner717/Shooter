/**
 * THE ASSAY. The instrument, inside the game.
 *
 * Every balance question this project has answered was answered by a
 * throwaway probe in a headless browser -- and three of those probes
 * published a finding that turned out to be the instrument rather than the
 * game. This is the same measurement taken from inside the running game, on
 * the phone, against the kit the player has actually bought.
 *
 * ---- one target and a counter ----
 *
 * It shipped as a SANDBOX: a picker of sixteen field objects, a row of seven
 * anomalies, formations, group sizes, and the dummy as one option among them.
 * All of that is gone. What is left is what the mode was actually for -- a
 * practice dummy standing 420 units up-field and a readout of what your kit
 * is doing to it -- and the name went with it, because a sandbox is a place
 * you play with things and this is a place you measure one.
 *
 * ---- what it is not ----
 *
 * It is not a run. Nothing here is earned and nothing here is kept: no waves,
 * no energy, no salvage, no rules, no glitch timer, no boosts, no ladder and
 * no anomalies. The one thing it borrows is the run's kit, because measuring
 * a stock turret would be measuring a turret nobody is playing.
 *
 * Entering checkpoints the run and leaving restores it, so the field you come
 * back to is the same one `resume()` would have handed you after a reload --
 * your count, your kit and your salvage, standing on clear ground. While the
 * range is up the run's own checkpoint clock is suspended, or it would
 * quietly overwrite the run it is standing on.
 */

import { ARSENAL } from './arsenal.js';
import { ABILITIES } from './abilities.js';
import { ledger, soak, soakBeads, soakNext, SOAK_BEADS, SRC_EXTRA, WINDOWS,
  BAR_WINDOW } from './ledger.js';
import { background } from './background.js';
import { BEAD_REACH, placeDummy, DUMMY } from './dummy.js';
import { rgba, clamp } from './util.js';
import { CFG } from './config.js';

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
 * What the mode is called, in one place.
 *
 * It was SANDBOX, and it was the wrong word twice over: a sandbox is where
 * you play with things, and this had a picker of sixteen objects and seven
 * anomalies to play with. All of that went in build 235 -- there is one
 * target and a counter, and the whole point is the number.
 *
 * It was THE RANGE for that one build, which was better and still wrong: a
 * range is where you practise your aim, and nothing here is about aim. What
 * the room actually is, is a rig with one instrumented specimen on it, and
 * the thing under test is the machine you brought. So: the ASSAY -- to assay
 * is to determine what something actually contains.
 *
 * The internal names are all still `sandbox` and that is deliberate, not an
 * oversight. `world.sandbox`, the `Sandbox` class and above all the tree
 * node's id are what a saved run has written down -- renaming the id would
 * take a 20,000-energy node away from everyone who has bought it.
 */
export const RANGE_NAME = 'ASSAY';

/**
 * The padlock, and it lives here rather than in menu.js because menu.js
 * already imports from this file -- putting it the other way round is a cycle,
 * and `bundle.mjs` orders modules by an acyclic walk. A shared glyph belongs
 * in the lower module.
 */
export const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square">'
  + '<rect x="5.5" y="10.5" width="13" height="10"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>'
  + '<circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>';

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
    this.tableOpen = false;
    this.el = {};
    this.build();
  }

  // ------------------------------------------------------------ the shell

  /*
   * ---- one bar and one panel, and both are always up ----
   *
   * It was a bar with a SPAWN sheet and a STATS sheet behind two toggles, and
   * the stats sheet was 56vh of glass that landed exactly on top of the
   * dummy. So you could read the rates or watch the thing they were about,
   * and not both -- which is the one thing this mode exists to let you do.
   *
   * The rates are always on screen now, sized to clear the rig, and the only
   * thing that folds is the per-source table under RESET COUNTER: that one is
   * a list of unbounded length and it is the only part that has to be allowed
   * to cover the field.
   */
  build() {
    const root = $('sandbox');
    if (!root) return;
    this.el.root = root;

    const bar = document.createElement('div');
    bar.id = 'sbBar';
    /*
     * The name and the two doors, and nothing else.
     *
     * It carried the ten-second rate as well, which was the same number as
     * the second tile of the panel four pixels below it -- and at 320 the
     * label wrapped, so the bar read "DPS" over "10s" beside a figure. A
     * readout printed twice is not twice as legible.
     */
    bar.innerHTML = `<span class="sbTag">${RANGE_NAME}</span>`;
    // `pointerdown`, like every other control on the play screen: a tap has
    // to register when the thumb lands, not when it leaves.
    const mk = (id, text, fn) => {
      const b = document.createElement('button');
      b.id = id;
      b.className = 'sbBtn';
      b.textContent = text;
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(); });
      bar.appendChild(b);
      return b;
    };
    mk('sbDummyBtn', 'DUMMY', () => this.dummy());
    mk('sbExit', 'EXIT', () => this.game.exitSandbox());

    root.append(bar, this.buildEras(), this.buildPanel());
  }

  /**
   * Three rooms, one per era.
   *
   * Its own row rather than three more buttons in the bar: the bar is the
   * name and the two doors, and at 320 it has no width left. This is a
   * segmented control -- which room you are in, always visible, one tap each
   * -- and it sits ABOVE the panel so the readout's bottom edge, which is
   * what `standoff` measures the rig against, is unaffected by it.
   *
   * The label is the era and nothing else. "ERA I" is what the tab is; what
   * each room contains is the room, and a row of tabs explaining themselves
   * is a row nobody reads twice.
   */
  buildEras() {
    const row = document.createElement('div');
    row.id = 'sbEras';
    this.el.eras = [];
    for (const [n, label] of [[1, 'ERA I'], [2, 'ERA II'], [3, 'ERA III']]) {
      const b = document.createElement('button');
      b.className = 'sbEra';
      b.dataset.era = String(n);
      /*
       * The padlock is a SPAN and not a class on the button, for the reason
       * the menu's own locked tabs carry one: a mark you can see is a door,
       * and a button that is merely dim is a button that looks broken.
       */
      b.innerHTML = n === 3
        ? `<span class="sbEraLock" aria-hidden="true">${LOCK}</span>${label}`
        : label;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const r = this.game.setBenchEra(n);
        if (r === 'locked') this.refuseEra(b);
      });
      row.appendChild(b);
      this.el.eras.push(b);
    }
    return row;
  }

  /** A door that does not open says so, once, where it was pressed. */
  refuseEra(b) {
    b.classList.remove('refuse');
    void b.offsetWidth;
    b.classList.add('refuse');
  }

  /** Which room is up, on the row. */
  syncEra() {
    const at = this.game.world.era;
    for (const b of this.el.eras || []) {
      const n = Number(b.dataset.era);
      const on = n === at;
      if (b._on === on) continue;
      b._on = on;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  buildPanel() {
    const p = document.createElement('div');
    p.id = 'sbPanel';

    /*
     * Four rates, and each answers a different question. NOW is what is
     * happening this second and is what the rig's own bands are driven from;
     * the two windows are for reading and comparing; RUN is over the whole
     * counter and is the one that cannot be gamed by choosing when to look.
     *
     * The first tile said "NOW" and the two beside it said their window,
     * which breaks the rule this room states in as many words -- a rate with
     * no window on it is not a number. It is three seconds and it says so.
     *
     * The unit is said ONCE, over the row, rather than four times inside it.
     * Every tile read "DPS NOW" / "DPS 10s" / "DPS 30s" / "DPS RUN", which
     * spends three quarters of a 8.5px label on a word that is the same in
     * every column and leaves no room for the one that is not.
     */
    /*
     * ---- one line up, everything else behind a button ----
     *
     * The panel was 212px on a 414x896 phone -- a caption, four tiles, a
     * session line, the record and two buttons, all of it up all the time --
     * and that is a quarter of the screen spent on a readout in a room whose
     * whole point is watching the thing the readout is about. It covered the
     * rig, and `standoff` could only answer by walking the rig backwards until
     * it hit its own floor.
     *
     * So the default is ONE ROW: the ten-second rate, which is the number you
     * actually watch, and how far round the record has got. Everything else --
     * the other three windows, the clock, the session total, the record's own
     * bar, RESET and the source table -- is behind the chevron.
     *
     * `standoff` measures THIS row and not the panel, so what is behind the
     * chevron is allowed to cover the field the way the source table always
     * has, and the rig does not move when you open it. Expand to read, fold to
     * shoot.
     */
    const line = document.createElement('div');
    line.className = 'sbLine';
    line.innerHTML = `<b id="sbLead">0</b><em>DPS ${WINDOWS[1]}s</em>`
      + `<span class="sbLineRec" id="sbLineRec">0/${SOAK_BEADS}</span>`;
    const more = document.createElement('button');
    more.className = 'sbMoreBtn';
    more.setAttribute('aria-label', 'More statistics');
    more.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.showMore(!this.moreOpen);
    });
    line.appendChild(more);

    const cap = document.createElement('div');
    cap.className = 'sbCap';
    cap.innerHTML = '<span>DAMAGE A SECOND</span><span class="sbCapWin">'
      + `THIS SESSION</span>`;

    const head = document.createElement('div');
    head.className = 'sbStatHead';
    head.innerHTML = `<div><b id="sbW0">0</b><em>${WINDOWS[0]}s</em></div>`
      + `<div><b id="sbW1">0</b><em>${WINDOWS[1]}s</em></div>`
      + `<div><b id="sbW2">0</b><em>${WINDOWS[2]}s</em></div>`
      + '<div><b id="sbSust">0</b><em>RUN</em></div>';

    /*
     * The clock and the total, and nothing else.
     *
     * It carried "n DESTROYED · n% OVERKILL" as well, and BOTH are pinned at
     * zero in this room by construction: the dummy has a billion health and is
     * healed every frame, VOID refuses it, and there is nothing else on the
     * field because there are no waves. So the line spent 27 of its 43
     * characters on two numbers that cannot move -- and at 320 that took it
     * to 304px inside a 280px box, where it WRAPPED, took the panel 12px
     * taller and landed it on the rig. On the first hit, after `standoff` had
     * already measured. The room was rebuilt in 235 to stop exactly that.
     */
    const sub = document.createElement('div');
    sub.className = 'sbStatSub';
    sub.innerHTML = '<span id="sbClock">00:00</span>'
      + '<span id="sbTotal">0</span>';

    /*
     * ---- and the one line that is NOT the session ----
     *
     * Everything above resets with RESET COUNTER and is gone when the app is
     * killed. This is the record: every point this device has ever put into a
     * dummy, which is what the shell of beads round the rig is drawn from.
     * It is here rather than in the bar because the bar has 55px of room at
     * 320 once the name and the two doors have taken theirs, and a number
     * with no room to say what it is is a number nobody reads.
     *
     * The bar under it is the shell itself, laid flat: the same count out of
     * the same hundred, so what the rig is wearing and what the panel says
     * cannot disagree.
     */
    const rec = document.createElement('div');
    rec.className = 'sbRec';
    rec.innerHTML = '<span class="sbRecTag">LIFETIME</span>'
      + '<span class="sbRecBar"><b id="sbSoakBar"></b></span>'
      + '<span class="sbRecNum" id="sbSoak">0</span>'
      + '<span class="sbRecOf" id="sbBeads">0/' + SOAK_BEADS + '</span>';

    const acts = document.createElement('div');
    acts.className = 'sbActs';
    const reset = document.createElement('button');
    reset.className = 'sbReset';
    reset.textContent = 'RESET COUNTER';
    reset.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ledger.reset();
      this.syncStats();
    });
    const fold = document.createElement('button');
    fold.className = 'sbFold';
    fold.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.showTable(!this.tableOpen);
    });
    acts.append(reset, fold);

    const table = document.createElement('div');
    table.className = 'sbTable';
    table.hidden = true;

    /*
     * `hidden` AND a `[hidden]` guard in the stylesheet, because `.sbMore` is
     * given a `display` -- the trap CLAUDE.md keeps a note about, which has
     * shipped three times: the property flips, every test that reads it back
     * agrees, and the element stays on the screen taking taps.
     */
    const box = document.createElement('div');
    box.className = 'sbMore';
    box.hidden = true;
    box.append(cap, head, sub, rec, acts, table);

    p.append(line, box);
    this.el.panel = p;
    this.el.line = line;
    this.el.more = more;
    this.el.box = box;
    this.el.lead = line.querySelector('#sbLead');
    this.el.lineRec = line.querySelector('#sbLineRec');
    this.el.acts = acts;
    this.el.table = table;
    this.el.fold = fold;
    this.el.win = WINDOWS.map((_, i) => head.querySelector(`#sbW${i}`));
    this.el.sust = head.querySelector('#sbSust');
    this.el.total = sub.querySelector('#sbTotal');
    this.el.clock = sub.querySelector('#sbClock');
    this.el.soak = rec.querySelector('#sbSoak');
    this.el.soakBar = rec.querySelector('#sbSoakBar');
    this.el.beads = rec.querySelector('#sbBeads');
    return p;
  }

  // ---------------------------------------------------------- in and out

  enter() {
    this.on = true;
    if (this.el.root) this.el.root.hidden = false;
    document.body.classList.add('sandbox');
    ledger.arm(true);
    background.setMood('sandbox', true);
    // Folded on the way in, every time: the table is the only thing here
    // that is allowed to cover the rig, and it should never do so uninvited.
    // Folded on the way in, every time, for the same reason the table is.
    this.showMore(false);
    this.showTable(false);
    /*
     * Filled BEFORE the rig is placed, and that ordering is load-bearing:
     * `standoff` measures the actions row's rendered bottom, and the rows
     * above it are empty until this runs -- so measuring first stood the rig
     * clear of a panel 10px shorter than the one that was about to be drawn,
     * and it landed on the rig on the first frame.
     */
    this.syncEra();
    this.syncStats();
    // ...and there is always something to shoot. The mode is one target and
    // a counter; arriving to an empty field and having to ask for the target
    // is a step that exists only because the old one could spawn other things.
    this.dummy();
  }

  leave() {
    this.on = false;
    if (this.el.root) this.el.root.hidden = true;
    document.body.classList.remove('sandbox');
    // Kept, not cleared: the menu shows the last session, and a table that
    // vanished the moment you left would be a table nobody could quote.
    ledger.disarm();
    // The record, on the other hand, is written down. `Game.checkpoint` also
    // flushes it, but leaving the room is the one moment that is certain.
    soak.flush();
  }

  /**
   * The screen changed shape: stand the rig off the new panel.
   *
   * Rotating the phone, or the iOS URL bar sliding away, moves the panel's
   * bottom edge by tens of pixels and the rig was left wherever it had been
   * put. Only moved when it would actually be wrong by more than a few units,
   * because moving the target is the one thing this room must not do while
   * somebody is measuring against it.
   */
  onResize() {
    this.placed = false;
    this.restand();
  }

  /**
   * Put the rig where the readout now leaves room for it.
   *
   * Only when it is actually wrong by more than a few units, because moving
   * the target is the one thing this room must not do while somebody is
   * measuring against it -- so a rotation moves it and opening the stats does
   * not (`standoff` measures the lead row, which does not change size).
   */
  restand() {
    if (!this.on) return;
    const w = this.game.world;
    const d = w.enemies.find((e) => e.dummy && !e.dead);
    if (!d) return;
    const up = this.standoff();
    if (up === null) return;
    this.placed = true;
    const y = w.shooter.y - up;
    if (Math.abs(y - d.y) < 8) return;
    d.y = y;
    if (d.dummyHome) d.dummyHome.y = y;
  }

  /**
   * Open or fold everything below the lead row.
   *
   * The rig does NOT move for this, deliberately: `standoff` measures the lead
   * row, so the block behind the chevron is allowed to cover the field the way
   * the source table always has been. Moving the target when you open a
   * readout is the one thing a room for measuring must not do.
   */
  showMore(on) {
    this.moreOpen = !!on;
    if (!this.el.box) return;
    this.el.box.hidden = !on;
    this.el.more.classList.toggle('on', !!on);
    if (on) this.syncStats();
    else this.showTable(false);
  }

  showTable(on) {
    this.tableOpen = !!on;
    if (!this.el.table) return;
    this.el.table.hidden = !on;
    this.el.fold.textContent = on ? 'HIDE SOURCES' : 'SHOW SOURCES';
    this.el.fold.classList.toggle('on', !!on);
    if (on) this.syncStats();
  }

  // -------------------------------------------------------------- the rig

  /**
   * One dummy, and only ever one. Pressing DUMMY with one already standing
   * replaces it where it stands rather than crowding a second onto the same
   * spot -- which is what the button is actually for: putting the target back
   * after a VOID or a stray PULSE has moved it.
   */
  dummy() {
    const w = this.game.world;
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      if (w.enemies[i].dummy) w.enemies.splice(i, 1);
    }
    const up = this.standoff();
    // `null` is "the panel could not be measured yet" -- see `standoff`. The
    // rig goes down at its preferred distance and `update` puts it right on
    // the first frame the readout is actually on the screen.
    this.placed = up !== null;
    // ...and WHICH rig. The era-2 room gets D2; see d2.js for what it is and
    // for why every feature of it is Dummy's.
    placeDummy(this.game, up === null ? DUMMY.up : up, w.era === 2 ? 2 : 1);
  }

  /**
   * How far up-field the rig stands, so that the readout never covers it.
   *
   * Measured off the panel rather than assumed, because the answer is
   * different on every phone: the world maps to the screen at `CFG.zoom` with
   * no camera offset, so a 320x568 screen shows 916 world units of depth and
   * a 390x844 shows 1361. A fixed 420 clears the panel on the second and puts
   * the rig 208px BEHIND it on the first.
   *
   * A UI decision, so it is taken here and not in `dummy.js`: that module
   * knows how to draw a rig, not what else is on the screen.
   */
  standoff() {
    const w = this.game.world;
    /*
     * Measured off the ACTIONS ROW and not off the panel, and that is the
     * whole of it: the source table hangs below that row, is up to 62vh tall,
     * and is the one thing here that is allowed to cover the field. Measuring
     * the panel meant that pressing DUMMY with the table open read a bottom
     * edge of 422px, drove `far` to zero, and parked the rig at `nearest` --
     * for good, because folding the table again does not put it back. The
     * rig's distance was a function of what happened to be open when a button
     * was pressed.
     */
    const el = this.el.line;
    const p = this.el.panel;
    if (!el || !p) return DUMMY.up;
    /*
     * The LEAD ROW's bottom plus the panel's own bottom padding and border,
     * which is where the folded panel really ends. Three earlier versions of
     * this line each measured something that grows: the panel itself (which is
     * 62dvh with the source table open, so pressing DUMMY there parked the rig
     * at its floor for good), the actions row without the padding under it
     * (and that padding is the whole of `clear` at this zoom, so the rig came
     * out flush against the glass), and the panel before `syncStats` had
     * filled it (10px short). What is measured has to be the part that cannot
     * change size.
     */
    const box = el.getBoundingClientRect();
    /*
     * ---- and it refuses to answer off a panel that is not on the screen ----
     *
     * `getBoundingClientRect()` on a `display: none` element returns all
     * zeros, and `#sandbox` is `display: none` while `body.menuOpen` is set --
     * so entering through the room's own ENTER button, which is the ONLY way a
     * player gets in, measured a bottom edge of zero and stood the rig at
     * `DUMMY.up` regardless of how tall the readout was. Reported from a
     * phone: a 212px panel with the rig behind it, on a build whose own case
     * said 55px of clearance, because the case called `enterSandbox()`
     * directly and never had the menu open. `null` here means "not yet";
     * `dummy()` leaves `placed` false and `update()` tries again.
     */
    if (!box.height) return null;
    const cs = getComputedStyle(p);
    const pad = (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const bottom = (box.bottom + pad) / CFG.zoom;
    // The furthest it may stand is just clear of the panel's bottom edge.
    /*
     * Cleared by the SHELL's outer edge and not by the body radius. The record
     * reaches 1.73R once it is full -- 117 units against the rig's 68 -- and
     * standing off by the body alone put the top of the outer ring under the
     * panel on every screen, on a build where the rig itself was clear.
     */
    const reach = Math.max(DUMMY.r, DUMMY.r * BEAD_REACH);
    const far = Math.max(0, w.shooter.y - (bottom + reach + DUMMY.clear));
    return Math.round(clamp(Math.min(DUMMY.up, far), DUMMY.nearest, DUMMY.farthest));
  }

  // -------------------------------------------------------------- syncing

  syncStats() {
    if (!this.el.table) return;
    /*
     * The record. `soakBeads` is the ladder, not the number -- the beads are
     * an odometer with a decade a shell, so 50% of them is 220,000 damage and
     * not 111 million, and a bar drawn off the raw total would sit against
     * the stop for the whole first hour.
     */
    const beads = soakBeads(soak.total);
    // The lead row first: it is the only part that is up when the rest is
    // folded, so it is the only part that must be right every tick.
    this.el.lead.textContent = num(ledger.rate(BAR_WINDOW));
    this.el.lineRec.textContent = beads >= SOAK_BEADS
      ? `${SOAK_BEADS}/${SOAK_BEADS}` : `${Math.floor(beads)}/${SOAK_BEADS}`;
    if (!this.moreOpen) return;
    this.el.soak.textContent = num(soak.total);
    this.el.beads.textContent = beads >= SOAK_BEADS
      ? 'COMPLETE'
      : `${Math.floor(beads)}/${SOAK_BEADS}  ·  ${num(soakNext(soak.total))} TO NEXT`;
    this.el.soakBar.style.width = `${(beads / SOAK_BEADS) * 100}%`;
    for (let i = 0; i < WINDOWS.length; i++) {
      this.el.win[i].textContent = num(ledger.rate(WINDOWS[i]));
    }
    this.el.sust.textContent = num(ledger.total / Math.max(0.25, ledger.t));
    this.el.total.textContent = `${num(ledger.total)} DAMAGE`;
    this.el.clock.textContent = clock(ledger.t);

    // The table sorts and allocates, so it is only built while it is open.
    if (!this.tableOpen) return;
    // A row with no damage and no kills is a source that did nothing, and the
    // table should not carry it. VOID has no damage by design and is kept by
    // the kills arm.
    const rows = ledger.table().filter((r) => r.total > 0 || r.kills > 0);
    if (!rows.length) {
      this.el.table.innerHTML = '<p class="sbEmpty">Nothing has been hit yet. '
        + 'Shoot the dummy and every round, mine and ability that lands on it '
        + 'will be listed here by name.</p>';
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
    /*
     * The header's third cell is an EMPTY span with no class: it used to be
     * `class="sbBar"`, which carries a 6px grey pill, so a stray graphic
     * floated in the header where a column label belongs.
     */
    this.el.table.innerHTML =
      '<div class="sbHeadRow"><span></span><span class="sbName">SOURCE</span>'
      + '<span></span><span class="sbNum">DPS</span>'
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
    this.statT = (this.statT || 0) - dt;
    if (this.statT > 0) return;
    this.statT = 0.25;
    // The panel was not on the screen when the rig went down -- see
    // `standoff`. This is the first tick after the menu closed behind us.
    if (!this.placed) this.restand();
    this.syncStats();
    /*
     * ...and the record to disk every eight seconds. `add` is called once per
     * delivered hit and a bought turret lands dozens a second, so the number
     * is kept in memory; this is what stops a session's worth of it being
     * lost to an app the phone killed without warning. A no-op unless it has
     * moved, so an idle room writes nothing.
     */
    this.soakT = (this.soakT || 0) - 0.25;
    if (this.soakT <= 0) { this.soakT = 8; soak.flush(); }
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
    /*
     * No kill count. It is pinned at zero in this room by construction -- the
     * dummy has a billion health and is healed every frame, VOID refuses it,
     * and there is nothing else on the field -- so the tile could only ever
     * read 0, which is the same reason the panel's own sub line lost it.
     */
    dps: num(ledger.total / Math.max(0.25, ledger.t)),
    top: ledger.table().filter((r) => r.total > 0 || r.kills > 0).slice(0, 3).map((r) => ({
      name: sourceName(r.src),
      tone: sourceTone(r.src),
      value: r.total > 0 ? num(r.sustained) : `${r.kills} kill${r.kills === 1 ? '' : 's'}`,
    })),
  };
}

/**
 * The record, for the menu room.
 *
 * `lastSession` above is the visit you just made and is gone when the app is
 * killed. This is the one that is not: what the device has ever put into a
 * dummy, and how much of the shell the rig wears it has paid for. Null before
 * anything has been shot, so the room does not carry a row of zeroes.
 */
export function lifetime() {
  if (!(soak.total > 0)) return null;
  const beads = soakBeads(soak.total);
  return {
    total: num(soak.total),
    beads: Math.floor(beads),
    of: SOAK_BEADS,
    pct: (beads / SOAK_BEADS) * 100,
    next: beads >= SOAK_BEADS ? '' : num(soakNext(soak.total)),
  };
}

/** The tree node that opens the door, named in one place. */
export const SANDBOX_ID = 'sandbox';

/** ...and whether this run has it. */
export function sandboxOwned(world) {
  return !!(world && world.up && world.up.sandbox);
}
