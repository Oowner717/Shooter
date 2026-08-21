// World state, phase machine, physics stepping and the render pipeline.

import { CFG, BUILD, REV, ENEMY_TYPES } from './config.js';
import { TAU, clamp, rand, spread, rgba, makeCanvas, weightedPick, angleDelta } from './util.js';
import { Grid, integrate, resolvePair, clampToArena, impactDamage } from './physics.js';
import { fx, updateFx, drawFx, drawFlash, settleScreen, spark, ring, ripple, shake } from './fx.js';
import { background } from './background.js';
import { glitch } from './glitch.js';
import { audio } from './audio.js';
import { Director, spawnOne, spawnFormation, spawnDrift, hostileCount, applyBlast, solveTethers, collectEnergy, drawIn, intakeRate, ENTRY_Y } from './enemies.js';
import { Shooter } from './shooter.js';
import { Abilities } from './abilities.js';
import { updateProjectiles, drawProjectiles } from './projectiles.js';
import { updateMines, drawMines, mineCadence, throwMine } from './mines.js';
import { Narrator } from './narrative.js';
import { Hud, ROUND_KEYS, MINE_KEYS } from './hud.js';
import { codex, taught, markTaught, forgetTaught } from './codex.js';
import { readRun, saveRun, forgetRun } from './save.js';
import { Offers } from './events.js';
import { freshUpgrades, BY_ID } from './upgrades.js';
import { NODE_BY_ID, priceOf } from './tree.js';
import { SCRIPT, FIRST_USE, ALL_KEYS, STARTING, GAP, START } from './tutorial.js';
import { freshLoadout, place, drop, carried, groupOf, freeSlot } from './loadout.js';
import { drawSpecimen } from './enemies.js';
import { registerCodexShape } from './menu.js';

const STAGE_HEIGHT = 320; // how far above the screen objects may queue

/** Seconds between one automatic checkpoint and the next. */
const SAVE_EVERY = 4;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.safeProbe = document.getElementById('safeProbe');
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = makeCanvas(2, 2);
    this.bctx = this.buffer.getContext('2d', { alpha: false });

    this.dpr = 1;
    this.grid = new Grid(96);
    this.bodies = [];
    this.pointers = new Map();
    this.gripPointer = null;
    this.fireTimer = 0;
    this.mineTimer = 0;
    this.autoLock = null;
    this.autoHinted = {};
    this.wells = []; // reused every frame; see the collection pass in update()
    this.acc = 0;
    this.frameTimes = [];
    this.fps = 60;
    this.qualityCooldown = 0;

    // The glossary draws its specimens with the field's own shape routines.
    registerCodexShape(drawSpecimen);

    this.world = this.makeWorld();
    this.hud = new Hud(this);
    this.hud.setSound(audio.enabled);

    this.bindInput();
    this.resize();
    this.reset();
    this.world.phase = 'boot'; // the title screen runs over a live arena
  }

  // --------------------------------------------------------------- world

  makeWorld() {
    const self = this;
    return {
      width: 1, // world units, not screen pixels
      height: 1,
      scale: CFG.zoom, // world units -> screen pixels
      stageHeight: STAGE_HEIGHT,
      floorY: 1,
      time: 0,
      timeScale: 1,
      kills: 0,
      released: 0, // hostile objects let out so far; capped at CFG.killGoal
      phase: 'boot', // boot | staging

      enemies: [],
      drops: [], // energy on the floor, waiting to be taken in
      debris: [], // inert wreckage, on its way off the field
      projectiles: [],
      effects: [],
      pendingBlasts: [],
      attackers: new Set(),

      shooter: new Shooter(0, 0),
      background,
      narrator: new Narrator(),
      abilities: new Abilities(),
      director: new Director(),

      // status effects
      stasis: 0,
      autoSteering: false, // is auto aim traversing the barrel this frame?
      autoAim: false,
      autoFire: false,
      mine: null, // the one kind of mine being laid, or none

      energy: 0, // banked; nothing carries across a reset
      up: freshUpgrades(), // what the large offers have granted, this run only
      offers: new Offers(),
      surge: 0, // seconds of doubled cadence, from a SURGE offer
      haste: 0, // seconds of halved ability cooldowns, from a HASTE offer
      pendingMines: 0, // laid on the next tick, from a SEED offer
      // Always true from build 81. Kept as a field because the director, the
      // counter and the save all read it, and a constant threaded through
      // four modules is worse than a flag that is simply never false.
      endless: true,
      // What the first run has handed over so far. Every strip cell and every
      // ability button is on screen from the start; only what is in here can
      // actually be pressed. Full on any run after the opening.
      unlocked: new Set(),
      // ...and the handful of it that is actually on the strip. Owning a round
      // and having it under your thumb are two different things once there are
      // more rounds than cells.
      loadout: freshLoadout(),
      round: 'standard', // standard | explosive | shotgun
      mines: [],
      decoy: null, // the DECOY ability's stand-in turret, while one is up

      nextStoryAt: CFG.storyEvery,

      debug: {
        noCooldown: false,
        noGlitch: false,
        slowmo: false,
        hitboxes: false,
        stats: false,
      },

      alert: (text, kind, dur) => self.hud.alert(text, kind, dur),
      abilityTaken: (i) => self.hud.flashTaken(i),
      announceOffer: (tier) => self.announceOffer(tier),
      carry: (key) => self.carry(key),
    };
  }

  reset() {
    const w = this.world;
    w.enemies.length = 0;
    w.drops.length = 0;
    w.debris.length = 0;
    w.projectiles.length = 0;
    w.effects.length = 0;
    w.mines.length = 0;
    w.pendingBlasts.length = 0;
    w.attackers.clear();
    w.time = 0;
    w.timeScale = 1;
    w.kills = 0;
    w.released = 0;
    w.stasis = 0;
    w.decoy = null;
    w.nextStoryAt = CFG.storyEvery;
    w.energy = 0;
    w.up = freshUpgrades();
    w.offers.reset();
    w.surge = 0;
    w.haste = 0;
    w.corona = 0; // seconds the turret is burning
    w.overdraw = 0; // shots left that leave as three
    w.pendingScour = false;
    w.pendingEbb = false;
    w.pendingMines = 0;
    this.sweepTimer = 0;
    this.hud.setPending(0, null);
    this.loadoutOpen = null;
    // Every run is endless as of build 81. There is no five hundred to reach,
    // no lull, no ORDINAL and no ending — the field simply keeps coming, and
    // the run is however long you keep playing it. It used to be the state a
    // player earned by beating the boss once; it is the whole game now.
    w.endless = true;
    this.scriptStep = 0;
    // World time at which the line now up has had its reading time. Nothing
    // else in the opening moves until it passes; the first line is due at
    // START, which is what the initial value buys.
    this.lineUntil = START - GAP;
    // The opening lines run once, ever — unless asked for again from the menu,
    // which is the only way back to them.
    this.teaching = this.replayNext || !taught();
    this.replayNext = false;
    // What the turret is issued with. Everything else — four rounds, four
    // mines, the two that run on their own and seven of the eight abilities —
    // is bought from the permanent tier, and nothing carries over.
    w.unlocked = new Set(STARTING);
    // Issued kit goes straight onto the strip; there is room for all of it at
    // the start, and an empty stack on the first frame would be a puzzle.
    w.loadout = freshLoadout();
    for (const k of STARTING) place(w.loadout, k);
    if (this.hud) this.hud.buildStrip();
    w.phase = 'staging';

    // A reset is a fresh session: the strip goes back to standard rounds and
    // nothing running on its own, matching what a first-time player is handed
    // — including the first-use captions, which a fresh session should get.
    w.autoAim = false;
    w.autoFire = false;
    w.mine = null;
    w.round = 'standard';
    this.autoHinted = {};
    // The issued round is loaded from the first frame and the player has been
    // shooting it for minutes by the time they tap its cell, so its first-use
    // caption is spent before it can fire. Everything else in STARTING is
    // either off (the two that run on their own) or unused until pressed (the
    // abilities), so those still explain themselves the first time.
    this.autoHinted[w.round] = true;
    for (const key of ['autoAim', 'autoFire', ...MINE_KEYS, ...ROUND_KEYS]) {
      this.hud.setToggle(key, false);
    }
    this.hud.setToggle('standard', true);

    w.narrator.reset();
    w.abilities.reset();
    w.director.reset();
    w.shooter.reset(w.width / 2, this.shooterY);
    fx.reset();
    glitch.reset();
    background.setMood('staging');
    audio.setDroneMood(41, 320, 0.05);

    this.pointers.clear();
    this.gripPointer = null;
    w.autoSteering = false;

    this.mineTimer = 0;
    this.saveTimer = SAVE_EVERY;
    this.resetShown = false;
    this.hud.clearAlerts();
    this.hud.setKills(0, w.endless ? null : CFG.killGoal);
    this.hud.setEnergy(0);
    this.hud.setPhase(w.endless ? 'FIELD' : 'STAGING');
    background.setDread(0);
    this.hud.syncAbilities(w.abilities);
  }

  start() {
    audio.init();
    audio.resume();
    this.hud.hideBoot();
    this.reset();
    forgetRun();
    this.hud.alert('SIMULATION ONLINE', 'info', 2.6);
  }

  /**
   * Pick a saved run back up. reset() builds a whole fresh run first and this
   * then overwrites the parts that were kept, because a resumed run and a new
   * one differ in what has happened rather than in how anything works — every
   * subsystem still wants its own reset before it is told where it is.
   *
   * The field itself is not restored, and that is the design: you come back to
   * your count, your kit and your salvage, standing on clear ground.
   */
  resume() {
    const d = readRun();
    if (!d) return this.start();
    audio.init();
    audio.resume();
    this.hud.hideBoot();
    this.reset();

    const w = this.world;
    // The permanent tier is replayed as decisions rather than restored as
    // numbers: this rebuilds world.up, the ability charges and the held counts
    // from the one table that defines them.
    for (const id of d.taken) {
      const u = BY_ID.get(id);
      if (!u) continue;
      try { u.apply(w.up, w); } catch { /* a card from a table that has moved on */ }
      w.offers.taken.push(id);
    }
    // ...and then what was actually owned and carried wins over whatever the
    // replay happened to place, because a loadout is a decision too.
    w.unlocked = new Set(d.unlocked);
    for (const k of STARTING) w.unlocked.add(k);
    w.loadout = { mines: [...d.loadout.mines], ammo: [...d.loadout.ammo] };

    w.kills = d.kills;
    w.released = d.released;
    w.time = d.time || 0;
    w.energy = d.energy;
    w.nextStoryAt = d.nextStoryAt;
    // A loaded round with no cell on the strip is a broken state — the turret
    // is meant always to have a round it can actually see. The save cannot
    // produce one today, but a guard here is a line of code and the state it
    // prevents is a run you cannot shoot with.
    w.round = carried(w.loadout, d.round) ? d.round : (w.loadout.ammo.find(Boolean) || 'standard');
    w.mine = carried(w.loadout, d.mine) ? d.mine : null;
    w.autoAim = !!d.autoAim;
    w.autoFire = !!d.autoFire;
    w.offers.nextSmall = d.nextSmall;
    w.offers.nextLarge = d.nextLarge;
    for (const tier of d.queued || []) w.offers.requeue(w, tier);
    if (w.narrator) w.narrator.index = d.story || 0;

    // Nothing is said twice. The ladder picks up at the step it reached, so a
    // run that quit four lines in still gets the other fifteen and never
    // re-reads the four — and every first-use hint already shown stays shown.
    // Setting teaching false outright, which is what this did until build 71,
    // meant quitting during the opening silently cancelled the rest of it.
    this.scriptStep = d.scriptStep || 0;
    this.teaching = !!d.teaching && this.scriptStep < SCRIPT.length;
    this.autoHinted = {};
    for (const k of d.hinted || []) this.autoHinted[k] = true;
    // Back to the wave the run was left on, from the top of it.
    w.director.restore(w, d.wave);

    this.hud.buildStrip();
    for (const k of [...MINE_KEYS, ...ROUND_KEYS]) this.hud.setToggle(k, false);
    this.hud.setToggle('standard', w.round === 'standard');
    for (const k of ROUND_KEYS) this.hud.setToggle(k, w.round === k);
    for (const k of MINE_KEYS) this.hud.setToggle(k, w.mine === k);
    this.hud.setToggle('autoAim', w.autoAim);
    this.hud.setToggle('autoFire', w.autoFire);
    this.hud.setKills(w.kills, w.endless ? null : CFG.killGoal);
    this.hud.setEnergy(w.energy);
    this.hud.setPending(w.offers.pending, w.offers.next);
    this.hud.syncEffects(w);
    this.hud.syncAbilities(w.abilities);
    this.hud.alert('SESSION RESTORED', 'info', 2.6);
  }

  /**
   * Write the run down. Called on a slow timer, and again the moment the page
   * is hidden — on a phone that is the last thing anything reliably gets.
   */
  checkpoint() {
    saveRun(this.world, this);
  }

  restart() {
    this.reset();
    forgetRun();
    audio.resume();
    this.hud.alert('SIMULATION ONLINE', 'info', 2.6);
  }

  /**
   * How many of `id` the run has bought. The offer ledger is reused rather
   * than a second list kept beside it: `taken` already survives a save and is
   * already replayed on restore, so the tree gets persistence for free and
   * there is one answer to "what has this run got".
   */
  owned(id) {
    let n = 0;
    for (const t of this.world.offers.taken) if (t === id) n++;
    return n;
  }

  /** Is this node's parent bought, or free? */
  available(n) {
    for (let p = n.parent; p; p = p.parent) {
      if (p.free) continue;
      if (!p.id || !this.owned(p.id)) return false;
    }
    return true;
  }

  /**
   * Buy one level of a tree node. Everything is checked here rather than at
   * the button, so a stale panel can never spend energy it does not have.
   * @returns 'ok' | 'locked' | 'maxed' | 'poor'
   */
  buy(id) {
    const w = this.world;
    const n = NODE_BY_ID.get(id);
    if (!n) return 'locked';
    if (!this.available(n)) return 'locked';
    const have = this.owned(id);
    if (have >= (n.levels || 1)) return 'maxed';
    const price = priceOf(n, have);
    if (w.energy < price) return 'poor';

    const def = BY_ID.get(id);
    if (!def) return 'locked';
    w.energy -= price;
    // Stat upgrades only touch world.up; unlocks and charges need the world.
    def.apply(w.up, w);
    w.offers.taken.push(id);

    audio.amend();
    this.hud.setEnergy(w.energy, intakeRate(w));
    this.hud.buildStrip();
    this.hud.syncLoadout(w);
    this.hud.syncAbilities(w.abilities);
    this.hud.menu.syncTree();
    this.checkpoint();
    return 'ok';
  }

  toggleSound() {
    audio.init();
    audio.setEnabled(!audio.enabled);
    this.hud.setSound(audio.enabled);
  }

  /**
   * Set the level, 0..1. init() first because the context does not exist until
   * something asks for it, and a player whose first act is to turn the volume
   * up should hear the result rather than silently setting a gain on nothing.
   */
  setVolume(v) {
    audio.init();
    audio.resume();
    audio.setVolume(v);
    this.hud.setSound(audio.enabled);
  }

  get volume() {
    return audio.volume;
  }

  get soundOn() {
    return audio.enabled;
  }

  /** The simulation holds while the menu is open, so a change costs nothing. */
  get paused() {
    return !!this.offerOpen || !!this.loadoutOpen
      || !!(this.hud && this.hud.menu && this.hud.menu.open);
  }

  // -------------------------------------------------------------- layout

  get shooterY() {
    return this.world.floorY - CFG.shooter.standoff;
  }

  resize() {
    const sw = Math.max(320, Math.round(window.innerWidth));
    const sh = Math.max(420, Math.round(window.innerHeight));
    const dpr = clamp(window.devicePixelRatio || 1, 1, CFG.maxDpr) * this.qualityScale();

    this.dpr = dpr;
    this.canvas.width = Math.round(sw * dpr);
    this.canvas.height = Math.round(sh * dpr);
    this.canvas.style.width = `${sw}px`;
    this.canvas.style.height = `${sh}px`;
    this.buffer.width = this.canvas.width;
    this.buffer.height = this.canvas.height;

    // Safe-area insets come from the probe's resolved padding; a custom
    // property holding max()/env() is not guaranteed to parse as a number.
    const probe = getComputedStyle(this.safeProbe);
    const num = (v, fallback) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);
    const safeBottom = num(probe.paddingBottom, 0);
    const barH = num(getComputedStyle(document.documentElement).getPropertyValue('--bar-h'), 74);

    // Everything below is in world units: screen pixels divided by the zoom.
    const world = this.world;
    const z = CFG.zoom;
    world.scale = z;
    world.width = sw / z;
    world.height = sh / z;
    world.floorY = (sh - (safeBottom + barH + 22)) / z;
    world.shooter.x = world.width / 2;
    world.shooter.y = this.shooterY;

    this.grid.resize(world.width, world.height + STAGE_HEIGHT, 96);
    background.resize(world.width, world.height, world.width / 2, ENTRY_Y);

  }

  qualityScale() {
    return fx.quality >= 1 ? 1 : fx.quality >= 0.7 ? 0.85 : 0.7;
  }

  // --------------------------------------------------------------- input

  bindInput() {
    const c = this.canvas;
    const pos = (ev) => {
      const r = c.getBoundingClientRect();
      const z = this.world.scale;
      return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
    };

    c.addEventListener('pointerdown', (ev) => {
      const w = this.world;
      if (w.phase === 'boot' || w.phase === 'frozen') return;
      const p = pos(ev);
      if (p.y > w.floorY + 10) return; // ability strip belongs to the thumb
      const s = w.shooter;
      c.setPointerCapture?.(ev.pointerId);

      // Anything at or behind the turret grabs the lever; anything ahead of it
      // is a direct shot at the point you touched.
      if (this.gripPointer === null && p.y > s.y - s.r) {
        this.gripPointer = ev.pointerId;
        s.grabGrip(p.x, p.y, false);
        s.shoot(w);
        this.fireTimer = CFG.shooter.gripFireInterval;
      } else {
        this.pointers.set(ev.pointerId, p);
        s.aimAt(p.x, p.y, false);
        s.aim = s.targetAim; // taps are instant, drags slew
        s.shoot(w);
        this.fireTimer = CFG.shooter.holdFireInterval;
      }
      ev.preventDefault();
    }, { passive: false });

    c.addEventListener('pointermove', (ev) => {
      const w = this.world;
      if (ev.pointerId === this.gripPointer) {
        const p = pos(ev);
        w.shooter.driveGrip(p.x, p.y, false);
        ev.preventDefault();
        return;
      }
      if (!this.pointers.has(ev.pointerId)) return;
      const p = pos(ev);
      this.pointers.set(ev.pointerId, p);
      w.shooter.aimAt(p.x, p.y, false);
      ev.preventDefault();
    }, { passive: false });

    const end = (ev) => {
      if (ev.pointerId === this.gripPointer) {
        this.gripPointer = null;
        this.world.shooter.releaseGrip();
      }
      this.pointers.delete(ev.pointerId);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (ev) => {
      const n = parseInt(ev.key, 10);
      // Sealed buttons are refused at every entry point, keyboard included.
      if (n >= 1 && n <= 5 && !this.abilitySealed(n - 1)) this.useAbility(n - 1);
      if (ev.key === ' ') this.world.shooter.shoot(this.world);
    });
  }

  useAbility(i) {
    const w = this.world;
    if (w.phase === 'boot' || w.phase === 'ending' || w.phase === 'frozen') return;
    const res = w.abilities.trigger(w, i);
    if (!res) return;
    this.hud.flashAbility(i);
    // An ability says what it is the first time it is used, which is minutes
    // after it was bought and only if the player actually reaches for it.
    const line = FIRST_USE[res.slot.def.id];
    if (res.first && line && this.hintsAllowed) this.hud.showHint(line, true);
  }

  // The opening lines live in tutorial.js with the rest of the script. The
  // field is empty for CFG.openingGrace seconds while they run — long enough
  // to say four things at reading pace and try each one before there is
  // anything to react to.


  /**
   * Something has come due. A top-up gets a chime and nothing else — it is
   * tempo, it will keep. A permanent one is the only thing in the run that is
   * yours for good, and it gets said properly: a fanfare, a gold frame across
   * the whole screen, a pill that names it, and a button that blooms and then
   * keeps pulsing until it is taken. The world is never interrupted for it.
   */
  announceOffer(tier) {
    if (tier !== 'large') {
      audio.chime(600);
      return;
    }
    audio.amend();
    background.surge(2.4);
    shake(1.8);
    this.hud.alert('PERMANENT UPGRADE', 'power', 5.5);
    this.hud.announceAmendment();
  }

  /**
   * A round or a mine that has just been bought goes straight onto the strip
   * if there is a free cell for it, because the alternative is buying a thing
   * and watching nothing happen. If both its cells are full it stays owned and
   * off the strip: which four mines are under the thumb is a decision, and
   * this is not the moment to make it for the player.
   * @returns the slot it took, or -1 if it is waiting in the loadout screen.
   */
  carry(key) {
    const w = this.world;
    if (!groupOf(key)) return -1;
    const i = place(w.loadout, key);
    if (i >= 0) this.hud.buildStrip();
    return i;
  }

  /** Put one on the strip or take it off, from the loadout screen. */
  toggleCarry(key) {
    const w = this.world;
    const g = groupOf(key);
    if (!g || !w.unlocked.has(key)) return false;
    if (carried(w.loadout, key)) {
      // The turret has to keep something to shoot with.
      if (g === 'ammo' && w.loadout.ammo.filter(Boolean).length <= 1) return false;
      drop(w.loadout, key);
      if (w.round === key) this.toggleRound(w.loadout.ammo.find(Boolean));
      if (w.mine === key) w.mine = null;
    } else {
      if (freeSlot(w.loadout, g) < 0) return false;
      place(w.loadout, key);
    }
    this.hud.buildStrip();
    this.hud.syncLoadoutSheet(w);
    audio.chime(carried(w.loadout, key) ? 760 : 430);
    return true;
  }

  openLoadout(group) {
    this.loadoutOpen = group;
    this.hud.showLoadout(this.world, group);
  }

  closeLoadout() {
    this.loadoutOpen = null;
    this.hud.hideLoadout();
  }

  /** Opens whatever is at the front of the queue. Holds the world while it is up. */
  openOffer() {
    const w = this.world;
    if (!w.offers.pending) return false;
    this.offerOpen = true;
    // Rolled here rather than when it came due, so the three cards are drawn
    // against what has actually been taken by now. See Offers.prepare.
    this.hud.showOffer(w.offers.prepare(w));
    return true;
  }

  closeOffer() {
    this.offerOpen = false;
    this.hud.hideOffer();
  }

  takeOffer(index) {
    const w = this.world;
    const opt = w.offers.take(w, index);
    this.closeOffer();
    if (opt) {
      audio.chime(920);
      background.surge(1.2);
      this.hud.syncAbilities(w.abilities);
      // Point at the thing that just opened. After the scrim, so the bloom is
      // not spent behind it.
      if (opt.axis === 'UNLOCK' && opt.key) {
        setTimeout(() => this.hud.flashUnlocked(opt.key), 260);
      }
      // Not worth waiting four seconds for: this is the decision a player
      // would be most annoyed to lose.
      this.checkpoint();
    }
    return opt;
  }

  toggleAuto(key) {
    const w = this.world;
    w[key] = !w[key];
    this.hud.setToggle(key, w[key]);
    this.announceToggle(key, w[key]);
  }

  /**
   * One kind of mine is laid at a time. There is no cell for "none", so
   * tapping the lit one is how you stop laying them — unlike the rounds,
   * where STANDARD is a cell of its own and re-picking is a no-op.
   */
  toggleMine(kind) {
    const w = this.world;
    w.mine = w.mine === kind ? null : kind;
    for (const k of MINE_KEYS) this.hud.setToggle(k, w.mine === k);
    if (w.mine) this.mineTimer = 0.2;
    this.announceToggle(kind, w.mine === kind);
  }

  /**
   * Rounds are exclusive: picking one clears whichever was loaded. STANDARD is
   * a chip of its own on the strip, so tapping it loads standard rather than
   * toggling back to it, and tapping the lit one is a no-op rather than a
   * silent unload.
   */
  toggleRound(kind) {
    const w = this.world;
    const changed = w.round !== kind;
    w.round = kind;
    // STANDARD is a chip too, so it lights on the same pass as the rest.
    for (const k of ['standard', ...ROUND_KEYS]) this.hud.setToggle(k, w.round === k);
    // Re-picking the loaded round is a no-op, so it does not get a caption
    // either — a first-use line is about the change, and nothing changed.
    this.announceToggle(kind, w.round === kind, changed);
  }

  announceToggle(key, on, changed = true) {
    audio.chime(on ? 760 : 430);
    const hint = FIRST_USE[key];
    if (!changed || !on || !hint || this.autoHinted[key] || !this.hintsAllowed) return;
    // Marked only once it has actually been shown. It used to be marked first,
    // so picking a round while captions are suppressed
    // and where all five are now one tap away — spent that caption on nothing
    // and never gave it back, not even across a reset.
    this.autoHinted[key] = true;
    this.hud.showHint(hint, true);
  }

  /**
   * First-use captions are for learning the controls, which happens in the
   * staging run. Nothing explains itself once ORDINAL is on the field — a hint
   * lands in the same band as the boss, and it is the interface talking over
   * the fight.
   */
  get hintsAllowed() {
    return this.world.phase === 'staging' || this.world.phase === 'lull';
  }

  /**
   * Nearest object that is currently corrupting the feed, falling back to the
   * nearest live threat. Only considers bearings the barrel can actually
   * reach, so auto aim never locks onto something behind the turret.
   */
  autoTarget() {
    const w = this.world;
    const s = w.shooter;
    const limit = CFG.shooter.aimClamp + 0.04;
    let best = null;
    let bestScore = Infinity;
    for (const e of w.enemies) {
      if (e.dead || e.staged || e.harmless) continue;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      if (Math.abs(angleDelta(-Math.PI / 2, Math.atan2(dy, dx))) > limit) continue;
      // a marked breacher outranks anything four times closer
      const score = Math.hypot(dx, dy) * (e.attacking ? 0.25 : 1);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /** Aim where the target will be, not where it is. */
  aimLead(target) {
    const w = this.world;
    const s = w.shooter;
    const speed = CFG.bolt.speed;
    const flight = Math.hypot(target.x - s.x, target.y - s.y) / speed;
    s.aimAt(target.x + (target.vx || 0) * flight, target.y + (target.vy || 0) * flight, false);
  }

  /**
   * One cadence for every way of shooting. Manual input outranks the assists,
   * and nothing fires twice in a frame.
   */
  updateFiring(dt) {
    const w = this.world;
    const s = w.shooter;
    if (w.phase === 'ending' || w.phase === 'boot') return;

    const dragging = this.pointers.size > 0;
    const manual = s.gripHeld || dragging;
    const target = w.autoAim ? this.autoTarget() : null;

    w.autoSteering = !manual && !!target;
    this.autoLock = w.autoSteering ? target : null;
    if (w.autoSteering) this.aimLead(target);

    let interval = 0;
    if (s.gripHeld) interval = CFG.shooter.gripFireInterval;
    else if (dragging) interval = CFG.shooter.holdFireInterval;
    else if (w.autoFire || target) {
      // HANDS OFF removes the penalty auto fire pays for not being your hand.
      interval = w.up.handsOff ? CFG.shooter.gripFireInterval : CFG.shooter.autoFireInterval;
    }
    if (interval <= 0) return;
    // heavier rounds buy their effect with cadence
    interval *= CFG.rounds[w.round].rate * w.up.rate;
    if (w.surge > 0) interval *= 0.5;

    // Auto aim waits until the barrel has actually come round. Auto fire does
    // not — that toggle means "shoot wherever this is pointed", including
    // mid-sweep.
    if (!manual && !w.autoFire && s.aimError > 0.14) return;

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    this.fireTimer = interval;
    if (dragging && !s.gripHeld) {
      const last = [...this.pointers.values()].pop();
      if (last) s.aimAt(last.x, last.y, false);
    }
    s.shoot(w);
  }

  // -------------------------------------------------------------- update

  update(dtRaw) {
    const w = this.world;
    // Held while the menu is open: the field keeps being drawn, nothing moves,
    // and picking a round mid-wave costs nothing. The interface still runs.
    if (this.paused) {
      // Corruption is world state and stays frozen with the world, but a white
      // flash caught mid-decay would read as a broken frame rather than a
      // paused one, so the screen-level effects finish.
      settleScreen(Math.min(dtRaw, CFG.maxFrameDelta));
      this.hud.syncHudLight(w);
      return;
    }
    const real = Math.min(dtRaw, CFG.maxFrameDelta);
    let dt = real;
    if (w.debug.slowmo) dt *= 0.25;
    dt *= w.timeScale;

    w.time += dt;

    // The run writes itself down every few seconds. Off the world clock, so a
    // paused game is not writing, and cheap enough at this cadence that the
    // frame never notices: the whole record is a few hundred bytes.
    this.saveTimer -= real;
    if (this.saveTimer <= 0) {
      this.saveTimer = SAVE_EVERY;
      this.checkpoint();
    }

    // The opening script. Runs off the world clock so it holds with the menu.
    // The script waits on the count but is paced by the clock, so an entry
    // that is owed has to be checked every frame rather than only on the kill
    // that earned it. The director reads the flag off the world and thins the
    // field while it is set; mirrored here rather than assigned at every place
    // teaching changes, so the two can never drift apart.
    w.teaching = this.teaching;
    if (this.teaching && w.phase === 'staging') this.teach();

    // ---- status timers ----
    w.stasis = Math.max(0, w.stasis - dt);

    this.updateFiring(dt);

    w.abilities.update(dt);
    w.shooter.update(w, dt);
    w.narrator.update(dt);
    background.update(dt);

    // ---- per-frame entity bookkeeping ----
    for (const e of w.enemies) e.update(w, dt);
    for (const e of w.drops) e.update(w, dt);
    for (const c of w.debris) c.update(w, dt);
    for (let i = w.effects.length - 1; i >= 0; i--) {
      w.effects[i].update(w, dt);
      if (w.effects[i].dead) w.effects.splice(i, 1);
    }

    // The substrate bends around a WELL. Collected here rather than pushed
    // from the effect, so the background never holds a reference to something
    // that has ended — an empty list every frame there is nothing pulling.
    this.wells.length = 0;
    for (const e of w.effects) {
      if (e.dead || !e.wellField) continue;
      this.wells.push(e.wellField());
    }
    background.setWells(this.wells);

    w.director.update(w, dt);

    // ---- physics substeps ----
    let steps = 0;
    this.acc += dt;
    while (this.acc >= CFG.fixedStep && steps < CFG.maxSubsteps) {
      this.physicsStep(CFG.fixedStep);
      this.acc -= CFG.fixedStep;
      steps++;
    }
    if (steps === CFG.maxSubsteps) this.acc = 0;

    updateProjectiles(w, dt);
    this.mineTimer = mineCadence(w, this.mineTimer, dt);
    collectEnergy(w, dt);
    this.runUpgrades(dt);
    if (w.surge > 0) w.surge = Math.max(0, w.surge - dt);
    if (w.haste > 0) w.haste = Math.max(0, w.haste - dt);
    if (w.corona > 0) w.corona = Math.max(0, w.corona - dt);
    // SCOUR: the whole floor at once, and paid over the odds for it. The one
    // card that answers the chore build 59 created, and its worth is however
    // much wreckage you had let pile up.
    if (w.pendingScour) {
      w.pendingScour = false;
      const s = w.shooter;
      // The same verb PULSE uses, with no limit on the reach and a bonus on
      // the take. Infinity rather than a big number, because "the whole floor"
      // is what the card says.
      const took = drawIn(w, Infinity, CFG.boosts.scour.bonus);
      if (took) {
        ring(s.x, s.y, 30, 520, 0.55, '#9fe8ff', 3);
        ripple(s.x, s.y, 1.3, 900);
        audio.chime(880);
      }
    }

    // EBB: everything hostile thrown back up the field. The velocity is set
    // rather than added, so a BULWARK goes as far as a MOTE — the point is
    // that the field comes off you, not that heavy things shrug it off.
    if (w.pendingEbb) {
      w.pendingEbb = false;
      const E = CFG.boosts.ebb;
      const s = w.shooter;
      let n = 0;
      for (const e of w.enemies) {
        if (e.dead || e.harmless || e.staged) continue;
        e.vx = spread(E.spread);
        e.vy = -E.speed;
        e.thrown = E.coast;
        e.attacking = false;
        w.attackers.delete(e);
        e.flash = Math.max(e.flash, 0.6);
        n++;
      }
      if (n) {
        ring(s.x, s.y, 20, 900, 0.5, '#7cffb2', 4);
        ripple(s.x, s.y, 1.8, 1200);
        shake(5);
        audio.chime(520);
      }
    }

    while (w.pendingMines > 0) {
      w.pendingMines--;
      // With nothing selected SEED used to do nothing at all, which made it a
      // dead option on any run that had not picked a mine yet. It lays a
      // random kind instead — but only one that has actually been unlocked,
      // or it hands out a mine the turret has not bought. The offer is not
      // rolled at all when nothing is open, so the fallback is belt and braces.
      const own = MINE_KEYS.filter((k) => w.unlocked.has(k));
      if (w.mine) throwMine(w, w.mine);
      else if (own.length) throwMine(w, own[(Math.random() * own.length) | 0]);
    }
    updateMines(w, dt);
    this.resolveBlasts();
    this.checkContact();
    this.sweep(w.enemies);
    this.sweep(w.drops);
    // Debris keeps no ledger, so it gets a plain splice rather than sweep().
    for (let i = w.debris.length - 1; i >= 0; i--) {
      if (w.debris[i].dead) w.debris.splice(i, 1);
    }
    updateFx(dt);

    this.syncHud(dt);
    this.updateGlitch(dtRaw);
  }

  physicsStep(dt) {
    const w = this.world;
    const bodies = this.bodies;
    bodies.length = 0;
    for (const e of w.enemies) if (!e.dead) bodies.push(e);
    for (const e of w.drops) if (!e.dead) bodies.push(e);

    for (const b of bodies) {
      b.steer(w, dt);
      // The soft side boundary, between steering and integration so the nudge
      // lands this frame. Debris is deliberately excluded — it is the one thing
      // that is supposed to leave the field, and it is integrated below.
      b.edgeEase(w, dt);
      integrate(b, dt);
    }

    // Debris collides like everything else but is never clamped to the arena
    // — leaving the field is how a chunk ends. It is appended past the end of
    // the clamped run so the edge pass below can simply stop early.
    const clamped = bodies.length;
    for (const c of w.debris) {
      if (c.dead) continue;
      c.steer(w, dt);
      integrate(c, dt);
      bodies.push(c);
    }

    bodies.push(w.shooter);
    // The decoy is a static body too, so things pile up against it instead of
    // drifting through it — and it takes the collision damage of the pile.
    if (w.decoy && !w.decoy.dead) bodies.push(w.decoy);
    this.grid.build(bodies);
    this.grid.eachPair(bodies, (a, b) => {
      if (a.dead || b.dead) return;
      const impact = resolvePair(a, b);
      if (impact <= 0) return;
      // Wreckage bounces off things and hurts none of them, in either
      // direction. Skipped here rather than in applyDamage so the object it
      // struck is spared too.
      if (a.inert || b.inert) return;
      // ...and so is anything a SLUG has just hit. SLUG is the round that puts
      // things where you want them, not a damage round dressed as one: it
      // still shoves as hard as it ever did, but nothing it throws pays out on
      // impact, in either direction. Every other collision on the field trades
      // damage exactly as it always has. See CFG.rounds.slug.calm.
      if (a.slugged > 0 || b.slugged > 0) {
        // ...and the mark travels with the shove. A slugged BULWARK driven
        // through a MOTE would otherwise leave that MOTE flying at whatever is
        // behind it with full damage, which is still the SLUG doing it. The
        // mark is passed at its *remaining* time, never refreshed, so a chain
        // runs down instead of propagating for ever.
        const t = Math.max(a.slugged || 0, b.slugged || 0);
        if (typeof a.slugged === 'number') a.slugged = t;
        if (typeof b.slugged === 'number') b.slugged = t;
        return;
      }
      const dmg = impactDamage(a, b, impact);
      if (dmg <= 0) return;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      for (let i = 0; i < 3; i++) {
        spark(mx, my, spread(impact * 1.4), spread(impact * 1.4), '#ffffff', 0.16, 1.8);
      }
      if (a.applyDamage) a.applyDamage(w, dmg);
      if (b.applyDamage) b.applyDamage(w, dmg);
    });
    if (w.decoy && !w.decoy.dead) bodies.pop();
    bodies.pop(); // shooter is not integrated

    // Cables, after the contact solver so a TOW pair cannot be pulled apart by
    // whatever it just shoved.
    solveTethers(w);

    // Only the clamped run — debris is appended past it and is the one body
    // allowed to leave the field.
    for (let i = 0; i < clamped; i++) {
      const b = bodies[i];
      const impact = clampToArena(b, w.width, STAGE_HEIGHT, w.floorY);
      if (impact > 240) {
        spark(b.x, b.y, spread(impact), spread(impact), b.type.glow, 0.18, 1.8);
      }
    }
  }

  /**
   * The upgrades that are not a scalar somebody else reads: the ones that do
   * something on a clock. All of them are off until an offer turns them on.
   */
  runUpgrades(dt) {
    const w = this.world;
    const up = w.up;
    const s = w.shooter;

    // HARD CASING: whatever is holding the turret pays for it.
    if (up.casing > 0) {
      for (const e of w.attackers) {
        if (!e.dead) e.applyDamage(w, up.casing * dt);
      }
    }

    // CORONA: for half a minute the turret is unpleasant to be near. Reaches
    // past what is actually attached, which is the whole difference between
    // this and the card it replaced — it kills the crowd on the way in as
    // well as the one already holding on.
    if (w.corona > 0) {
      const C = CFG.boosts.corona;
      const r2 = C.r * C.r;
      const bite = C.dps * dt;
      for (const e of w.enemies) {
        if (e.dead || e.staged || e.harmless) continue;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 <= r2) e.applyDamage(w, bite);
      }
      // A ring on the beat rather than every frame: sixty of these a second
      // is a solid disc, not a shell.
      this.coronaBeat = (this.coronaBeat || 0) - dt;
      if (this.coronaBeat <= 0) {
        this.coronaBeat = 0.28;
        ring(s.x, s.y, C.r * 0.55, C.r, 0.3, '#ff9f5c', 2);
      }
    }

    // SWEEP: the barrel cannot reach behind the turret, so the turret does it
    // itself. This is the upgrade that turns a chore into something you bought.
    if (up.sweep > 0) {
      this.sweepTimer -= dt;
      if (this.sweepTimer <= 0) {
        this.sweepTimer = up.sweep;
        applyBlast(w, { x: s.x, y: s.y, r: 260, damage: 90, impulse: 780 });
        ring(s.x, s.y, 20, 300, 0.4, '#7cffb2', 4);
      }
    }

    // REFLEX: PULSE answers a crowd on the turret without being asked.
    if (up.reflex && w.attackers.size >= 2) {
      const i = w.abilities.slots.findIndex((x) => x.def.essential);
      if (i >= 0 && w.abilities.usable(i)) this.useAbility(i);
    }
  }

  resolveBlasts() {
    const w = this.world;
    while (w.pendingBlasts.length) {
      const blast = w.pendingBlasts.pop();
      applyBlast(w, blast);
      shake(6);
    }
  }

  /** Objects touching the turret corrupt the feed until they are destroyed. */
  checkContact() {
    const w = this.world;
    if (w.phase === 'boot' || w.phase === 'ending') return;
    const s = w.shooter;
    for (const e of w.enemies) {
      if (e.dead || e.attacking || e.harmless) continue;
      const rr = e.r + s.r + 2;
      if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 <= rr * rr) {
        e.attacking = true;
        w.attackers.add(e);
        audio.glitchOn();
        shake(7);
        ring(s.x, s.y, 10, 120, 0.3, '#ff2d55', 3);
      }
    }
  }

  sweep(list) {
    const w = this.world;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e.dead) continue;
      // The glossary records anything actually destroyed, including harmless
      // drift and a TOW's mass, neither of which counts toward the tally.
      if (!e.dissolved) this.noteDestroyed(e);
      if (e.counts && !e.dissolved) this.registerKill();
      if (e.dissolved) {
        for (let k = 0; k < 4; k++) spark(e.x, e.y, spread(60), spread(60), e.type.glow, 0.4, 1.6);
      }
      w.attackers.delete(e);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  /** Everything destroyed passes through here for the record, counted or not. */
  noteDestroyed(e) {
    const id = e && e.type && e.type.id;
    if (codex.record(id)) this.hud.noteCodex();
  }

  /**
   * The opening ladder. One control comes back per few objects, in the order
   * the game wants them learned — ammunition, mines, the two that run on their
   * own, then the abilities — each with a line. When the last entry is out the
   * run stops teaching, and it never teaches again on this device.
   */
  teach() {
    if (!this.teaching) return;
    const w = this.world;
    const step = SCRIPT[this.scriptStep];
    if (!step) return;
    // Paced by the clock so nothing is ever cut off, and gated on the count so
    // a line about salvage is not said before any has been banked.
    if (w.time < this.lineUntil + GAP) return;
    if (step.at !== undefined && w.kills < step.at) return;

    this.scriptStep++;
    this.hud.showHint(step.text, true);
    this.lineUntil = w.time + step.hold;
    if (this.scriptStep >= SCRIPT.length) {
      this.teaching = false;
      markTaught();
    }
  }

  /**
   * Run the opening lines again. They are remembered as said in localStorage
   * and a reset does not clear that on purpose — being told the same four
   * things twice is not teaching. But there was no way back to them at all,
   * which made every later change to them invisible to anyone who had played.
   */
  replayOpening() {
    forgetTaught();
    this.replayNext = true;
    this.restart();
  }

  /** Stop the opening where it is, without a word. */
  finishTeaching() {
    if (!this.teaching) return;
    this.teaching = false;
    this.scriptStep = SCRIPT.length;
    this.hud.clearHint();
    markTaught();
  }

  /**
   * On screen and not yet bought. Every locked thing is drawn from the first
   * frame — the shape of what a turret can become is part of what the offers
   * are for, and a card that hands you WIRE means more when you have been
   * looking at its cell for ten minutes.
   */
  isSealed(key) {
    return !this.world.unlocked.has(key);
  }

  /** The same question by ability slot, which is how the bar and keys ask it. */
  abilitySealed(i) {
    const s = this.world.abilities.slots[i];
    return !!s && this.isSealed(s.def.id);
  }

  registerKill() {
    const w = this.world;
    w.kills++;
    w.offers.note(w);
    this.teach();
    // The ten lines, one per `storyEvery` kills, and then it stops talking.
    // They used to be gated on the counted run — the run that no longer
    // exists — which would have left the game with no voice at all.
    while (w.phase === 'staging' && w.kills >= w.nextStoryAt && w.narrator.index < 10) {
      w.nextStoryAt += CFG.storyEvery;
      w.narrator.advance();
      audio.chime(520 + w.narrator.index * 30);
      background.surge(0.7);
    }
  }



  // ------------------------------------------------------------- glitch

  updateGlitch(dtRaw) {
    const w = this.world;
    let level = 0;
    let mode = 'normal';
    if (!w.debug.noGlitch) {
      level = Math.min(CFG.glitch.max, w.attackers.size * CFG.glitch.perAttacker);
    }
    glitch.update(dtRaw, level, mode);
  }

  syncHud(dt) {
    const w = this.world;
    this.hud.setKills(w.kills, null);
    this.hud.setEnergy(w.energy, intakeRate(w));
    this.hud.setPending(w.offers.pending, w.offers.next);
    this.hud.syncEffects(w);
    this.hud.syncAbilities(w.abilities);
    this.hud.syncLoadout(w);
    this.hud.syncSeals();
    this.hud.menu.sync(w);
    this.hud.updateAlerts(dt);
    if (w.debug.stats) {
      this.hud.setStats(
        `fps    ${this.fps.toFixed(0)}\n`
        + `phase  ${w.phase}\n`
        + `kills  ${w.kills}  released ${w.released}\n`
        + `obj    ${hostileCount(w)} hostile + ${w.enemies.length - hostileCount(w)} drift + ${w.drops.length} frag + ${w.debris.length} wreck\n`
        + `shots  ${w.projectiles.length}\n`
        + `parts  ${fx.particles.active.length}\n`
        + `dpr    ${this.dpr.toFixed(2)}  q ${fx.quality.toFixed(2)}\n`
        + `mines  ${w.mines.length}  round ${w.round}\n`
        + `build  ${BUILD}  rev ${REV}  zoom ${CFG.zoom}`,
      );
    }
  }

  // ---------------------------------------------------------------- draw

  draw() {
    const w = this.world;
    const ctx = this.bctx;
    const W = w.width;
    const H = w.height;

    if (w.phase === 'frozen' && this.snapshot) {
      const dst = this.ctx;
      dst.setTransform(1, 0, 0, 1, 0, 0);
      glitch.present(dst, this.snapshot, this.canvas.width, this.canvas.height);
      return;
    }

    const k = this.dpr * w.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);

    background.draw(ctx, W, H);

    // Story sits in the quiet upper band, behind every entity, so it can never
    // hide a target — and never competes with the lever for space.
    w.narrator.draw(
      ctx,
      W / 2,
      ENTRY_Y + (w.shooter.y - ENTRY_Y) * 0.46,
      Math.min(W - 70, 470),
      background.mood.accent,
      13 / w.scale,
    );

    // Under the energy and the objects both: wreckage is scenery, and it must
    // never sit on top of something you are meant to be aiming at.
    for (const c of w.debris) c.draw(ctx);
    for (const e of w.drops) e.draw(ctx, w);
    for (const e of w.enemies) e.draw(ctx, w);

    drawMines(ctx, w);
    for (const e of w.effects) e.draw(ctx, w);

    this.drawAutoLock(ctx);
    w.shooter.draw(ctx, w);
    drawProjectiles(ctx, w);
    drawFx(ctx);
    this.drawTouchAid(ctx);

    if (w.debug.hitboxes) this.drawHitboxes(ctx);

    ctx.restore();

    if (w.stasis > 0) this.drawStasis(ctx, W, H);
    background.drawOverlay(ctx, W, H);
    drawFlash(ctx, W, H);

    const dst = this.ctx;
    dst.setTransform(1, 0, 0, 1, 0, 0);
    if (glitch.active) {
      glitch.present(dst, this.buffer, this.canvas.width, this.canvas.height);
    } else {
      dst.drawImage(this.buffer, 0, 0);
    }
  }

  /**
   * Your thumb covers roughly a 44px disc of the screen. Anything under it
   * gets an outline drawn wide enough to peek out from behind the finger.
   */
  drawTouchAid(ctx) {
    if (this.pointers.size === 0) return;
    const w = this.world;
    for (const p of this.pointers.values()) {
      ctx.strokeStyle = rgba('#59e0ff', 0.34);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        ctx.moveTo(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30);
        ctx.lineTo(p.x + Math.cos(a) * 38, p.y + Math.sin(a) * 38);
      }
      ctx.stroke();

      for (const e of w.enemies) {
        if (e.dead) continue;
        const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d2 > 74 * 74) continue;
        ctx.strokeStyle = rgba(e.type.color, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 13, 0, TAU);
        ctx.stroke();
      }
    }
  }

  /** Brackets that tighten as the barrel comes round onto the auto-aim target. */
  drawAutoLock(ctx) {
    const e = this.autoLock;
    if (!e || e.dead) return;
    const w = this.world;
    const converged = clamp(1 - w.shooter.aimError / 0.9, 0, 1);
    const r = (e.r || 40) + 16 + (1 - converged) * 42;
    const a = 0.25 + converged * 0.5;
    const spin = w.time * (0.7 + (1 - converged) * 2.4);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(spin);
    ctx.strokeStyle = rgba(converged > 0.85 ? '#7cffb2' : '#59e0ff', a);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const base = (i / 4) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, r, base - 0.22, base + 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStasis(ctx, W, H) {
    const a = clamp(this.world.stasis / 0.8, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(120,200,255,${0.05 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(200,240,255,${0.3 * a})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }


  drawHitboxes(ctx) {
    const w = this.world;
    ctx.strokeStyle = 'rgba(0,255,120,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of [...w.enemies, ...w.drops]) {
      ctx.moveTo(e.x + e.r, e.y);
      ctx.arc(e.x, e.y, e.r, 0, TAU);
    }
    ctx.moveTo(w.shooter.x + w.shooter.r, w.shooter.y);
    ctx.arc(w.shooter.x, w.shooter.y, w.shooter.r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, w.floorY);
    ctx.lineTo(w.width, w.floorY);
    ctx.stroke();
  }

  // -------------------------------------------------------- perf governor

  trackFrame(ms) {
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 60) return;
    let sum = 0;
    for (const t of this.frameTimes) sum += t;
    const avg = sum / this.frameTimes.length;
    this.frameTimes.length = 0;
    this.fps = 1000 / Math.max(avg, 1);

    if (this.qualityCooldown > 0) { this.qualityCooldown--; return; }
    if (avg > 20.5 && fx.quality > 0.45) {
      fx.quality = fx.quality > 0.7 ? 0.7 : 0.45;
      this.qualityCooldown = 3;
      this.resize();
    } else if (avg < 13.5 && fx.quality < 1) {
      fx.quality = fx.quality < 0.7 ? 0.7 : 1;
      this.qualityCooldown = 6;
      this.resize();
    }
  }

  // ---------------------------------------------------------------- debug




  debugAddKills(n) {
    const w = this.world;
    for (let i = 0; i < n && w.phase === 'staging'; i++) {
      // keep the release quota in step, or the director would keep spawning
      w.released = Math.min(CFG.killGoal, w.released + 1);
      this.registerKill();
    }
  }

  debugNextStory() {
    this.world.narrator.advance();
  }








  debugSpawnWave() {
    const w = this.world;
    spawnFormation(w, ENEMY_TYPES, 5);
  }

  /** Place one object of a named type, for probing a single behaviour. */
  debugSpawn(id, x, y) {
    const w = this.world;
    const t = ENEMY_TYPES.find((e) => e.id === id);
    if (!t) return null;
    return spawnOne(w, t, x ?? w.width / 2, y ?? ENTRY_Y + 120, { staged: false, spawnIn: 0.2 });
  }

  debugFillField() {
    const w = this.world;
    while (hostileCount(w) < CFG.maxEnemies) {
      const t = weightedPick(ENEMY_TYPES);
      spawnOne(w, t, rand(t.r + 10, w.width - t.r - 10), rand(ENTRY_Y + 60, w.floorY - 120), {
        staged: false,
        spawnIn: 0.4,
      });
    }
  }

  debugClearField() {
    const w = this.world;
    // Snapshot first: destroying an object appends its fragments to w.drops,
    // and a live for..of would walk straight into them and kill those too.
    for (const e of [...w.enemies]) if (!e.dead) e.destroy(w);
    for (const e of [...w.drops]) if (!e.dead) e.destroy(w);
    w.debris.length = 0;
  }

  debugThrowMine(kind = 'blast') {
    throwMine(this.world, kind);
  }

  debugSpawnDrift() {
    spawnDrift(this.world);
  }

  debugGlitch() {
    glitch.kick(1);
  }



  /**
   * Everything the run could ever hand over, now. The opening lines are
   * skipped with it, because they are the one part that is about not having
   * things yet.
   */
  debugUnlockAll() {
    const w = this.world;
    for (const k of ALL_KEYS) w.unlocked.add(k);
    // Owning is not carrying. Granting the arsenal without putting any of it
    // on the strip left every cell empty, which is a state the offers can
    // reach too but is never what this button means.
    for (const k of ALL_KEYS) place(w.loadout, k);
    this.hud.buildStrip();
    this.hud.syncSeals();
    this.hud.syncAbilities(w.abilities);
  }

  /** The same, plus the opening marked as seen. What the tests drive. */
  debugTeachAll() {
    this.finishTeaching();
    this.debugUnlockAll();
  }

  /** Put the opening back, for looking at it again. */
  debugForgetTaught() {
    forgetTaught();
  }

  debugCodexAll() {
    codex.unlockAll();
    this.hud.menu.syncCodex();
  }


  debugCodexWipe() {
    codex.forget();
    this.hud.menu.syncCodex();
  }

}
