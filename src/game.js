// World state, phase machine, physics stepping and the render pipeline.

import { CFG, BUILD, ENEMY_TYPES } from './config.js';
import { TAU, clamp, rand, spread, rgba, makeCanvas, weightedPick, angleDelta } from './util.js';
import { Grid, integrate, resolvePair, clampToArena, impactDamage } from './physics.js';
import { fx, updateFx, drawFx, drawFlash, settleScreen, spark, ring, shake } from './fx.js';
import { background } from './background.js';
import { glitch } from './glitch.js';
import { audio } from './audio.js';
import { Director, spawnOne, spawnFormation, spawnDrift, hostileCount, applyBlast, solveTethers, collectSalvage, intakeRate, ENTRY_Y } from './enemies.js';
import { Shooter } from './shooter.js';
import { Boss } from './boss.js';
import { Abilities } from './abilities.js';
import { updateProjectiles, drawProjectiles } from './projectiles.js';
import { updateMines, drawMines, mineCadence, throwMine } from './mines.js';
import { Narrator, ENDING } from './narrative.js';
import { Hud, ROUND_KEYS, MINE_KEYS } from './hud.js';
import { codex, cleared, markCleared, forgetCleared, taught, markTaught, forgetTaught } from './codex.js';
import { Offers } from './events.js';
import { freshUpgrades } from './upgrades.js';
import { SCRIPT, FIRST_USE, ALL_KEYS, STARTING, GAP, START } from './tutorial.js';
import { drawSpecimen } from './enemies.js';
import { registerCodexShape } from './menu.js';

const STAGE_HEIGHT = 320; // how far above the screen objects may queue

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.safeProbe = document.getElementById('safeProbe');
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = makeCanvas(2, 2);
    this.bctx = this.buffer.getContext('2d', { alpha: false });
    this.snapshot = null;

    this.dpr = 1;
    this.grid = new Grid(96);
    this.bodies = [];
    this.pointers = new Map();
    this.gripPointer = null;
    this.fireTimer = 0;
    this.mineTimer = 0;
    this.autoLock = null;
    this.autoHinted = {};
    this.acc = 0;
    this.endFade = 1; // turret opacity; falls to 0 under the ending text
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
      phase: 'boot', // boot | staging | lull | boss | ending | frozen

      enemies: [],
      debris: [],
      projectiles: [],
      effects: [],
      pendingBlasts: [],
      attackers: new Set(),

      shooter: new Shooter(0, 0),
      boss: null,
      background,
      narrator: new Narrator(),
      abilities: new Abilities(),
      director: new Director(),

      // status effects
      stasis: 0,
      veil: 0,
      invert: 0,
      jam: 0,
      chrono: 0,
      lockout: 0,
      bossContact: 0,
      // What ORDINAL still holds of the player's tally. Set when it arrives,
      // drained both by everything it does and by every hit that lands.
      ledger: 0,
      reclaimed: 0,
      autoSteering: false, // is auto aim traversing the barrel this frame?
      autoAim: false,
      autoFire: false,
      mine: null, // the one kind of mine being laid, or none

      salvage: 0, // banked; nothing carries across a reset
      up: freshUpgrades(), // what the large offers have granted, this run only
      offers: new Offers(),
      surge: 0, // seconds of doubled cadence, from a SURGE offer
      haste: 0, // seconds of halved ability cooldowns, from a HASTE offer
      pendingMines: 0, // laid on the next tick, from a SEED offer
      // Set once ORDINAL has been beaten. Every run after it is endless: no
      // five hundred, no lull, no boss, no ending. The counted run is the
      // tutorial for the game underneath it.
      endless: false,
      // What the first run has handed over so far. Every strip cell and every
      // ability button is on screen from the start; only what is in here can
      // actually be pressed. Full on any run after the opening.
      unlocked: new Set(),
      round: 'standard', // standard | explosive | shotgun
      mines: [],
      decoy: null, // the DECOY ability's stand-in turret, while one is up
      veilFade: 0, // eased so VEIL closes in rather than snapping

      nextStoryAt: CFG.storyEvery,
      counted: false, // the five hundredth has fallen; the lull is running

      debug: {
        noCooldown: false,
        noGlitch: false,
        slowmo: false,
        hitboxes: false,
        stats: false,
      },

      alert: (text, kind, dur) => self.hud.alert(text, kind, dur),
      bossCaption: (text, hold) => self.hud.bossCaption(text, hold),
      abilityTaken: (i) => self.hud.flashTaken(i),
      announceOffer: (tier) => self.announceOffer(tier),
      onBossDead: () => self.onBossDead(),
    };
  }

  reset() {
    const w = this.world;
    w.enemies.length = 0;
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
    w.boss = null;
    w.stasis = w.veil = w.invert = w.jam = w.chrono = w.lockout = w.bossContact = 0;
    w.veilFade = 0;
    w.ledger = 0;
    w.reclaimed = 0;
    w.decoy = null;
    this.hud.bossCaption(null);
    w.nextStoryAt = CFG.storyEvery;
    w.counted = false;
    w.salvage = 0;
    w.up = freshUpgrades();
    w.offers.reset();
    w.surge = 0;
    w.haste = 0;
    w.pendingMines = 0;
    this.sweepTimer = 0;
    this.shrugTimer = 0;
    this.hud.setPending(0, null);
    w.endless = cleared();
    this.lullTimer = 0;
    this.scriptStep = 0;
    // World time at which the line now up has had its reading time. Nothing
    // else in the opening moves until it passes; the first line is due at
    // START, which is what the initial value buys.
    this.lineUntil = START - GAP;
    // The opening lines run once, ever — unless asked for again from the menu,
    // which is the only way back to them. A cleared save is past them by
    // definition, and asking overrides that too.
    this.teaching = this.replayNext || (!taught() && !cleared());
    this.replayNext = false;
    // What the turret is issued with. Everything else — four rounds, four
    // mines, the two that run on their own and seven of the eight abilities —
    // is bought from the permanent tier, and nothing carries over.
    w.unlocked = new Set(STARTING);
    w.phase = 'staging';

    // A reset is a fresh session: the strip goes back to standard rounds and
    // nothing running on its own, matching what a first-time player is handed
    // — including the first-use captions, which a fresh session should get.
    w.autoAim = false;
    w.autoFire = false;
    w.mine = null;
    w.round = 'standard';
    this.autoHinted = {};
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
    this.snapshot = null;
    this.endStage = 0;
    this.endTimer = 0;
    this.endFade = 1;
    this.resetShown = false;
    this.hud.clearAlerts();
    this.hud.hideEnding();
    this.hud.setBoss(false);
    this.hud.setLedgerMode(false);
    this.hud.setKills(0, w.endless ? null : CFG.killGoal);
    this.hud.setSalvage(0);
    this.hud.setPhase(w.endless ? 'FIELD' : 'STAGING');
    background.setDread(0);
    this.hud.syncAbilities(w.abilities);
  }

  start() {
    audio.init();
    audio.resume();
    this.hud.hideBoot();
    this.reset();
    this.hud.alert('SIMULATION ONLINE', 'info', 2.6);
  }

  restart() {
    this.hud.hideEnding();
    this.reset();
    audio.resume();
    this.hud.alert('SIMULATION ONLINE', 'info', 2.6);
  }

  toggleSound() {
    audio.init();
    audio.setEnabled(!audio.enabled);
    this.hud.setSound(audio.enabled);
  }

  get soundOn() {
    return audio.enabled;
  }

  /** The simulation holds while the menu is open, so a change costs nothing. */
  get paused() {
    return !!this.offerOpen || !!(this.hud && this.hud.menu && this.hud.menu.open);
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

    // Soft darkness mask for the boss VEIL power, also in world units.
    this.veilMask = makeCanvas(Math.ceil(world.width / 2), Math.ceil(world.height / 2));
    this.veilCtx = this.veilMask.getContext('2d');
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
        s.grabGrip(p.x, p.y, w.invert > 0);
        s.shoot(w);
        this.fireTimer = CFG.shooter.gripFireInterval;
      } else {
        this.pointers.set(ev.pointerId, p);
        s.aimAt(p.x, p.y, w.invert > 0);
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
        w.shooter.driveGrip(p.x, p.y, w.invert > 0);
        ev.preventDefault();
        return;
      }
      if (!this.pointers.has(ev.pointerId)) return;
      const p = pos(ev);
      this.pointers.set(ev.pointerId, p);
      w.shooter.aimAt(p.x, p.y, w.invert > 0);
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

  /** Opens whatever is at the front of the queue. Holds the world while it is up. */
  openOffer() {
    if (!this.world.offers.pending) return false;
    this.offerOpen = true;
    this.hud.showOffer(this.world.offers.next);
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
    w.round = kind;
    // STANDARD is a chip too, so it lights on the same pass as the rest.
    for (const k of ['standard', ...ROUND_KEYS]) this.hud.setToggle(k, w.round === k);
    this.announceToggle(kind, w.round === kind);
  }

  announceToggle(key, on) {
    audio.chime(on ? 760 : 430);
    const hint = FIRST_USE[key];
    if (!on || !hint || this.autoHinted[key] || !this.hintsAllowed) return;
    // Marked only once it has actually been shown. It used to be marked first,
    // so picking a round during the boss fight — where captions are suppressed
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
    if (!best && w.boss && !w.boss.dead && w.boss.intro >= 1) best = w.boss;
    return best;
  }

  /** Aim where the target will be, not where it is. */
  aimLead(target) {
    const w = this.world;
    const s = w.shooter;
    const speed = CFG.bolt.speed * (w.chrono > 0 ? 0.42 : 1);
    const flight = Math.hypot(target.x - s.x, target.y - s.y) / speed;
    s.aimAt(target.x + (target.vx || 0) * flight, target.y + (target.vy || 0) * flight, w.invert > 0);
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
      if (last) s.aimAt(last.x, last.y, w.invert > 0);
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

    if (w.phase === 'frozen') {
      glitch.update(dtRaw, 1, 'frozen');
      this.endTimer += dtRaw;
      if (this.endTimer > 2.2 && !this.resetShown) {
        this.resetShown = true;
        this.hud.showResetButton();
      }
      return;
    }

    w.time += dt;

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
    w.veil = Math.max(0, w.veil - dt);
    w.invert = Math.max(0, w.invert - dt);
    w.jam = Math.max(0, w.jam - dt);
    w.chrono = Math.max(0, w.chrono - dt);
    w.lockout = Math.max(0, w.lockout - dt);
    w.bossContact = Math.max(0, w.bossContact - dt);
    w.veilFade += ((w.veil > 0 ? 1 : 0) - w.veilFade) * clamp(dt * 3.4, 0, 1);

    this.updateFiring(dt);

    w.abilities.update(dt);
    w.shooter.update(w, dt);
    w.narrator.update(dt);
    background.update(dt);

    // ---- per-frame entity bookkeeping ----
    for (const e of w.enemies) e.update(w, dt);
    for (const e of w.debris) e.update(w, dt);
    for (let i = w.effects.length - 1; i >= 0; i--) {
      w.effects[i].update(w, dt);
      if (w.effects[i].dead) w.effects.splice(i, 1);
    }

    w.director.update(w, dt);
    if (w.boss && !w.boss.dead) {
      w.boss.update(w, dt);
      // The world radiates from whatever is holding its attention, and the
      // sweep runs faster the emptier its ledger gets.
      background.setFocus(w.boss.x, w.boss.y);
      background.setDread(1, 1 - clamp(w.ledger / CFG.killGoal, 0, 1));
      if (!this.bossArmed && w.boss.intro >= 1) {
        this.bossArmed = true;
        this.onBossArrived();
      }
    }

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
    collectSalvage(w, dt);
    this.runUpgrades(dt);
    if (w.surge > 0) w.surge = Math.max(0, w.surge - dt);
    if (w.haste > 0) w.haste = Math.max(0, w.haste - dt);
    while (w.pendingMines > 0) {
      w.pendingMines--;
      // With nothing selected SEED used to do nothing at all, which made it a
      // dead option on any run that had not picked a mine yet. It lays a
      // random kind instead.
      throwMine(w, w.mine || MINE_KEYS[(Math.random() * MINE_KEYS.length) | 0]);
    }
    updateMines(w, dt);
    this.resolveBlasts();
    this.checkContact();
    this.sweep(w.enemies);
    this.sweep(w.debris);
    updateFx(dt);

    this.updatePhase(real);
    this.syncHud(dt);
    this.updateGlitch(dtRaw);
  }

  physicsStep(dt) {
    const w = this.world;
    const bodies = this.bodies;
    bodies.length = 0;
    for (const e of w.enemies) if (!e.dead) bodies.push(e);
    for (const e of w.debris) if (!e.dead) bodies.push(e);

    for (const b of bodies) {
      b.steer(w, dt);
      integrate(b, dt);
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

    const boss = w.boss;
    for (const b of bodies) {
      let impact = clampToArena(b, w.width, STAGE_HEIGHT, w.floorY);
      if (impact > 240) {
        spark(b.x, b.y, spread(impact), spread(impact), b.type.glow, 0.18, 1.8);
      }
      if (boss && !boss.dead && boss.intro >= 1) {
        const dx = b.x - boss.x;
        const dy = b.y - boss.y;
        const rr = b.r + boss.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          b.x = boss.x + nx * rr;
          b.y = boss.y + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + b.restitution) * vn * nx;
            b.vy -= (1 + b.restitution) * vn * ny;
          }
        }
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

    // SHRUG: the same idea, without the damage — it just gets them off.
    if (up.shrug > 0) {
      this.shrugTimer -= dt;
      if (this.shrugTimer <= 0) {
        this.shrugTimer = up.shrug;
        if (w.attackers.size) {
          applyBlast(w, { x: s.x, y: s.y, r: 200, damage: 0, impulse: 1200 });
          ring(s.x, s.y, 14, 220, 0.3, '#59e0ff', 3);
        }
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
    // Story beats belong to the staging run only. ORDINAL's own emissions push
    // the count well past five hundred, and a sentence in the mid-field band is
    // exactly the text that has no business being there.
    while (!w.endless && w.phase === 'staging' && w.kills >= w.nextStoryAt && w.narrator.index < 10) {
      w.nextStoryAt += CFG.storyEvery;
      w.narrator.advance();
      audio.chime(520 + w.narrator.index * 30);
      background.surge(0.7);
    }
    if (!w.endless && !w.counted && w.kills >= CFG.killGoal) {
      w.counted = true;
      w.phase = 'lull';
      this.lullTimer = CFG.lull;
      this.onLull();
    }
  }

  // --------------------------------------------------------------- phases

  /** @param real unscaled seconds — the outro must not run at slow-mo speed. */
  updatePhase(real) {
    const w = this.world;
    // Fades the turret out across the text, and snaps back on a reset.
    const wantFade = w.phase === 'ending' && this.endStage >= 1 ? 0 : 1;
    this.endFade += (wantFade - this.endFade) * clamp(real * 0.7, 0, 1);
    if (wantFade === 1 && this.endFade > 0.995) this.endFade = 1;

    if (w.phase === 'lull') {
      this.lullTimer -= real;
      if (this.lullTimer <= 0) this.beginBoss();
      return;
    }

    if (w.phase === 'ending') {
      this.endTimer += real;
      if (this.endStage === 0 && this.endTimer > 2.2) {
        this.endStage = 1;
        w.timeScale = 1;
        for (const e of w.enemies) { e.dead = true; e.dissolved = true; }
        for (const e of w.debris) { e.dead = true; e.dissolved = true; }
        w.projectiles.length = 0;
        this.hud.showEnding(ENDING);
        this.hud.setBoss(false);
        background.setMood('ending');
        audio.setDroneMood(28, 140, 0.03);
      } else if (this.endStage === 1 && this.endTimer > 2.2 + ENDING.length * 1.5 + 2.6) {
        this.endStage = 2;
        this.freeze();
      }
    }
  }

  /**
   * Five hundred are down and nothing is falling. A few seconds of empty field
   * is the whole of the transition — the run simply stops, and the light goes
   * wrong.
   */
  onLull() {
    // Insurance. The opening is two minutes and the count is thirteen, so a
    // run that reaches five hundred still teaching is not one anyone will
    // play — but nothing explains itself over ORDINAL, and that rule should
    // not rest on the arithmetic holding.
    this.finishTeaching();
    this.hud.setPhase('—');
    background.setMood('lull');
    background.surge(2);
    audio.setDroneMood(55, 480, 0.07);
  }

  beginBoss() {
    const w = this.world;
    w.phase = 'boss';
    this.hud.setPhase('BOSS');
    // The field goes dark for the arrival and only lights up again with it.
    background.setMood('breach');
    background.surge(2);
    audio.setDroneMood(26, 180, 0.05);

    w.boss = new Boss(w.width / 2, ENTRY_Y + CFG.boss.r * 0.4);
    background.setDread(1);

    // The reveal. Five hundred objects were not a score, they were a deposit,
    // and the counter the player has been watching all run turns over and
    // becomes the thing they now have to take back.
    w.ledger = CFG.killGoal;
    w.reclaimed = 0;
    this.hud.setLedgerMode(true);
    this.hud.clearAlerts();
    // All ten beats are spent by five hundred kills, but anything still
    // decaying mid-field would sit under the arrival captions. Clear the line
    // WITHOUT rewinding the script: reset() also zeroes the index, which
    // re-armed all ten sentences to replay over the boss as its own emissions
    // pushed the kill count past 550.
    w.narrator.clear();
    this.hud.setBoss(true, 1, 'ORDINAL', 'FIRST OF ——');
    this.bossArmed = false;
  }

  /** Called once the arrival sequence finishes and the fight proper starts. */
  onBossArrived() {
    // The last caption is still holding when the fight starts; from here on
    // there are no words at all.
    this.hud.bossCaption(null);
    background.setMood('boss');
    background.surge(2);
    audio.setDroneMood(33, 260, 0.09);
  }

  onBossDead() {
    markCleared();
    // Hand the world back to the sky. Both eased, so it drains out of the
    // substrate rather than cutting.
    background.setDread(0);
    background.setFocus(null, null);
    const w = this.world;
    if (codex.record('ordinal')) this.hud.noteCodex();
    w.phase = 'ending';
    w.timeScale = 0.3;
    w.lockout = 999;
    w.veil = w.invert = w.jam = w.chrono = 0;
    this.endTimer = 0;
    this.endStage = 0;
    this.resetShown = false;
    w.boss.detonate(w);
    this.hud.setPhase('END');
    this.hud.clearAlerts();
  }

  freeze() {
    const w = this.world;
    w.phase = 'frozen';
    this.endTimer = 0;
    this.snapshot = makeCanvas(this.buffer.width, this.buffer.height);
    this.snapshot.getContext('2d').drawImage(this.buffer, 0, 0);
    glitch.mode = 'frozen';
    glitch.level = 1;
    audio.setDroneMood(24, 90, 0.05);
    audio.glitchOn();
  }

  // ------------------------------------------------------------- glitch

  updateGlitch(dtRaw) {
    const w = this.world;
    let level = 0;
    let mode = 'normal';
    if (!w.debug.noGlitch) {
      if (w.bossContact > 0) {
        level = 1;
        mode = 'boss';
      } else {
        level = Math.min(CFG.glitch.max, w.attackers.size * CFG.glitch.perAttacker);
      }
    }
    glitch.update(dtRaw, level, mode);
  }

  syncHud(dt) {
    const w = this.world;
    // Once ORDINAL is on the field the counter is no longer the player's: it
    // reads the ledger, and it falls.
    if (w.boss) this.hud.setLedger(w.ledger, CFG.killGoal);
    else this.hud.setKills(w.kills, !w.endless && w.phase === 'staging' ? CFG.killGoal : null);
    this.hud.setSalvage(w.salvage, intakeRate(w));
    this.hud.setPending(w.offers.pending, w.offers.next);
    this.hud.syncAbilities(w.abilities);
    this.hud.syncLoadout(w);
    this.hud.syncSeals();
    this.hud.menu.sync(w);
    this.hud.updateAlerts(dt);
    if (w.boss && !w.boss.dead) this.hud.setBoss(true, w.boss.hpFrac);
    if (w.debug.stats) {
      this.hud.setStats(
        `fps    ${this.fps.toFixed(0)}\n`
        + `phase  ${w.phase}\n`
        + `kills  ${w.kills}  released ${w.released}/${CFG.killGoal}\n`
        + `obj    ${hostileCount(w)} hostile + ${w.enemies.length - hostileCount(w)} drift + ${w.debris.length} frag\n`
        + `shots  ${w.projectiles.length}\n`
        + `parts  ${fx.particles.active.length}\n`
        + `dpr    ${this.dpr.toFixed(2)}  q ${fx.quality.toFixed(2)}\n`
        + `mines  ${w.mines.length}  round ${w.round}\n`
        + (w.boss
          ? `ledger ${w.ledger}  back ${w.reclaimed}  burnt ${w.boss.spent}${w.boss.spentOut ? ' OUT' : ''}\n`
            + `armour x${w.boss.damageScale(w).toFixed(2)}  intro ${w.boss.intro.toFixed(2)}${w.boss.looming ? '  LOOMING' : ''}\n`
            + `rev    ${w.boss.reprises.length} reprise  ${w.boss.echo ? 'echo' : 'no echo'} ${w.boss.echoBolts.length} bolts\n`
            + `locked ${w.abilities.slots.filter((s) => s.locked > 0).length}/${w.abilities.slots.length}\n`
          : '')
        + `build  ${BUILD}  zoom ${CFG.zoom}`,
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

    for (const e of w.debris) e.draw(ctx, w);
    for (const e of w.enemies) e.draw(ctx, w);
    if (w.boss && !w.boss.dead) w.boss.draw(ctx);

    drawMines(ctx, w);
    for (const e of w.effects) e.draw(ctx, w);

    this.drawAutoLock(ctx);
    // The turret dissolves as the ending text comes up. It used to sit under
    // the last line of the closing stamp, which made the stamp unreadable —
    // and the session being over is a better reason for it to be gone than any
    // amount of moving text around.
    if (this.endFade > 0.002) {
      ctx.save();
      ctx.globalAlpha = this.endFade;
      w.shooter.draw(ctx, w);
      ctx.restore();
    }
    drawProjectiles(ctx, w);
    drawFx(ctx);
    this.drawTouchAid(ctx);

    if (w.debug.hitboxes) this.drawHitboxes(ctx);

    ctx.restore();

    if (w.stasis > 0) this.drawStasis(ctx, W, H);
    if (w.veilFade > 0.004) this.drawVeil(ctx, W, H);
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
    // Under INVERT the barrel goes to the mirrored bearing, so brackets drawn
    // on the true target point at somewhere the gun is not aiming — the
    // reticle would be arguing with the muzzle mark. Drop them while the axis
    // is flipped and let the barrel be the only claim about where fire goes.
    if (w.invert > 0) return;
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

  drawVeil(ctx, W, H) {
    const w = this.world;
    const a = w.veilFade * 0.93;
    const g = this.veilCtx;
    const vw = this.veilMask.width;
    const vh = this.veilMask.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, vw, vh);
    g.globalCompositeOperation = 'destination-out';

    const hole = (x, y, r) => {
      const grad = g.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, r / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.92)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x / 2 - r / 2, y / 2 - r / 2, r, r);
    };
    hole(w.shooter.x, w.shooter.y, 400);
    if (w.boss && !w.boss.dead) {
      hole(w.boss.x, w.boss.y, w.boss.r * 4);
      // and its copy — hiding the one thing that has to be shot down turns
      // VEIL from "sight withdrawn" into "target removed"
      const e = w.boss.echo;
      if (e) hole(e.x, e.y, e.r * 3.4);
    }

    ctx.globalAlpha = a;
    ctx.drawImage(this.veilMask, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawHitboxes(ctx) {
    const w = this.world;
    ctx.strokeStyle = 'rgba(0,255,120,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of [...w.enemies, ...w.debris]) {
      ctx.moveTo(e.x + e.r, e.y);
      ctx.arc(e.x, e.y, e.r, 0, TAU);
    }
    ctx.moveTo(w.shooter.x + w.shooter.r, w.shooter.y);
    ctx.arc(w.shooter.x, w.shooter.y, w.shooter.r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,80,80,0.6)';
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

  debugSkipToCount() {
    const w = this.world;
    if (w.phase !== 'staging') return;
    w.kills = CFG.killGoal - 1;
    w.narrator.index = 9;
    w.nextStoryAt = CFG.killGoal;
    this.registerKill();
  }

  debugSkipToBoss() {
    const w = this.world;
    if (w.phase === 'boss' || w.phase === 'ending') return;
    if (w.phase === 'staging') this.debugSkipToCount();
    this.lullTimer = 0;
    this.beginBoss();
  }

  debugKillBoss() {
    const w = this.world;
    if (w.boss && !w.boss.dead) {
      w.boss.intro = 1;
      // Damage is scaled by whatever the armour is worth right now, so a
      // debug kill has to divide it back out or it merely dents it.
      w.boss.hurt(w, w.boss.hp / w.boss.damageScale(w) + 1);
    }
  }

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

  debugBossPower() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.castPower(w);
  }

  debugReprise() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.reprise(w);
  }

  debugEcho() {
    const w = this.world;
    if (w.boss && !w.boss.dead && !w.boss.echo) w.boss.raiseEcho(w);
  }

  /** Jump straight to the spent-ledger endgame without waiting it out. */
  debugDrainLedger() {
    const w = this.world;
    if (!w.boss || w.boss.dead) return;
    w.boss.spend(w, w.ledger);
  }

  debugTithe() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.tithe(w);
  }

  debugSubtract() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.subtract(w);
  }

  /** Skip the arrival sequence when testing the fight itself. */
  debugSkipIntro() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.intro = 1;
  }

  debugSpawnWave() {
    const w = this.world;
    spawnFormation(w, ENEMY_TYPES, 5);
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
    // Snapshot first: destroying an object appends its fragments to w.debris,
    // and a live for..of would walk straight into them and kill those too.
    for (const e of [...w.enemies]) if (!e.dead) e.destroy(w);
    for (const e of [...w.debris]) if (!e.dead) e.destroy(w);
  }

  debugThrowMine(kind = 'blast') {
    throwMine(this.world, kind);
  }

  debugSpawnDrift() {
    spawnDrift(this.world);
  }

  debugGlitch() {
    glitch.kick(1);
    this.world.bossContact = 1.6;
  }



  /**
   * Everything the run could ever hand over, now. The opening lines are
   * skipped with it, because they are the one part that is about not having
   * things yet.
   */
  debugUnlockAll() {
    for (const k of ALL_KEYS) this.world.unlocked.add(k);
    this.hud.syncSeals();
    this.hud.syncAbilities(this.world.abilities);
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

  debugEndless() {
    const w = this.world;
    if (w.endless) forgetCleared(); else markCleared();
    this.restart();
  }

  debugCodexWipe() {
    codex.forget();
    this.hud.menu.syncCodex();
  }

  debugEnding() {
    const w = this.world;
    if (!w.boss) {
      w.boss = new Boss(w.width / 2, ENTRY_Y + 120);
      w.boss.intro = 1;
    }
    w.boss.dead = true;
    this.onBossDead();
  }
}
