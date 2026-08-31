// World state, phase machine, physics stepping and the render pipeline.

import { CFG, BUILD, REV, ENEMY_TYPES, GRID_CELL, TYPE_BY_ID, setHairline } from './config.js';
import { Ordinal, openAperture } from './boss.js';
// Imported for the side effect: a boss module registers its constructor
// with anomaly.js on load, and nothing else references it by name.
import './gnomon.js';
import './fractal.js';
import './amplitude.js';
import './dynamo.js';
import './parity.js';
import './terminus.js';
import { nameOf, dressOf, heldList } from './anomaly.js';
import { pref } from './settings.js';
import { TAU, clamp, rand, spread, rgba, makeCanvas, weightedPick, angleDelta } from './util.js';
import { Grid, integrate, resolvePair, clampToArena, impactDamage } from './physics.js';
import { fx, updateFx, drawFx, drawFlash, settleScreen, spark, ring, ripple, shake } from './fx.js';
import { background } from './background.js';
import { glitch } from './glitch.js';
import { audio } from './audio.js';
import { Director, spawnOne, spawnFormation, spawnDrift, spawnGroup, hostileCount, driftCount, applyBlast, solveTethers, collectEnergy, drawIn, intakeRate, ENTRY_Y, dividend } from './enemies.js';
import { Shooter } from './shooter.js';
import { Abilities } from './abilities.js';
import { updateProjectiles, drawProjectiles } from './projectiles.js';
import { updateMines, drawMines, mineCadence, throwMine } from './mines.js';
import { Narrator } from './narrative.js';
import { Hud, ROUND_KEYS, MINE_KEYS } from './hud.js';
import { codex, lineSeen, markLine, forgetLines, forgetPlayer, migrateLines } from './codex.js';
import { readRun, saveRun, forgetRun } from './save.js';
import { freshUpgrades, BY_ID } from './upgrades.js';
import { NODES, NODE_BY_ID, priceOf } from './tree.js';

/** The turret branch, for the fitting announcements and the completion one. */
const TURRET_NODES = NODES.filter((n) => n.id && n.parent && n.parent.key === 'turret');
import { SCRIPT, ON_CONTACT, STILL_HELD, CONTROL_LINES, FIRST_USE, ALL_KEYS, STARTING, GAP, START } from './tutorial.js';
import { freshLoadout, place, drop, carried, groupOf, freeSlot } from './loadout.js';
import { drawSpecimen } from './enemies.js';
import { registerCodexShape } from './menu.js';

const STAGE_HEIGHT = 320; // how far above the screen objects may queue

/** Seconds between one automatic checkpoint and the next. */
const SAVE_EVERY = 4;

/*
 * Decoration must not move the simulation.
 *
 * The title screen's DRIFT is scenery -- it exists so the title is a running
 * simulation rather than a still page -- but it is spawned through the same
 * spawnDrift() as everything else, which rolls a position and two velocities
 * off Math.random. That is four draws per body against a PRNG that
 * scripts/fight.mjs seeds before the game is constructed, so seven bodies of
 * scenery shifted the whole stream and ORDINAL's canonical hash moved from
 * 117409503 to 539018592 the moment the title got something to look at.
 *
 * The hash was right to move and the change behind it was not the material
 * pass it appeared to indict: disabling this one call put the hash back on
 * the canonical value with everything else still in place. So the scenery
 * runs on its own stream and hands Math.random back, and the run's own
 * randomness never learns the title screen happened.
 */
let titleSeed = 0x7749;
function titleRandom(fn) {
  const real = Math.random;
  Math.random = () => {
    titleSeed ^= titleSeed << 13;
    titleSeed ^= titleSeed >>> 17;
    titleSeed ^= titleSeed << 5;
    return (titleSeed >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.safeProbe = document.getElementById('safeProbe');
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = makeCanvas(2, 2);
    this.bctx = this.buffer.getContext('2d', { alpha: false });

    this.dpr = 1;
    this.grid = new Grid(GRID_CELL);
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
    this.workTimes = [];
    this.fps = 60;
    this.frameWork = 0;
    this.qualityCooldown = 0;

    // The glossary draws its specimens with the field's own shape routines.
    registerCodexShape(drawSpecimen);

    this.world = Game.bindAperture(this.makeWorld());
    this.hud = new Hud(this);
    this.hud.setSound(audio.enabled);

    this.bindInput();
    this.resize();
    this.reset();
    this.world.phase = 'boot'; // the title screen runs over a live arena
    this.seedTitleField();
  }

  /**
   * What falls behind the title.
   *
   * `phase = 'boot'` has said "the title screen runs over a live arena" since
   * the first build and the arena was empty: a substrate, a parallax dust
   * field and nothing else, so a game whose whole identity is a simulation
   * running opened on a still page. Measured, 2.6% of the sampled pixels
   * changed over a second and a fifth of that was the dust.
   *
   * DRIFT and only DRIFT. It is the one harmless type -- grey, worth energy,
   * ignored by the assist -- so nothing here is a fight going on without a
   * player, and the two opening lines about grey being a promise are being
   * demonstrated before either is said. They are staggered up the field at
   * birth rather than released together, or the title opens on a curtain
   * coming down in one piece.
   */
  seedTitleField(n = 7) {
    const w = this.world;
    titleRandom(() => {
      for (let i = 0; i < n; i++) {
        const e = spawnDrift(w);
        // Spread up the field and a little past the top, so the first frame
        // is the middle of something rather than the start of it.
        if (e) e.y = ENTRY_Y - 120 + (i / n) * (w.floorY - ENTRY_Y) * 0.92;
      }
    });
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
      released: 0, // hostile objects let out so far; counted, not capped
      phase: 'boot', // boot | staging

      enemies: [],
      drops: [], // energy on the floor, waiting to be taken in
      debris: [], // inert wreckage, on its way off the field
      projectiles: [],
      effects: [],
      pendingBlasts: [],
      attackers: new Set(),
      // How long something has been on the turret, and when we last said what
      // to do about it. Both reset the moment PULSE goes off. See STILL_HELD.
      heldFor: 0,
      heldSaid: 1e9, // high, so the first prompt is not made to wait out a gap

      shooter: new Shooter(0, 0),
      background,
      narrator: new Narrator(),
      abilities: new Abilities(),
      director: new Director(),

      // status effects
      stasis: 0,
      // Seconds SPIRAL still owns the barrel. Zero the rest of the time;
      // updateFiring stands down while it is up so the two are never both
      // driving the gun.
      spiral: 0,
      autoSteering: false, // is auto aim traversing the barrel this frame?
      autoAim: false,
      /*
       * ...and WHAT it is hunting: 'field', 'drift' or 'all'.
       *
       * Positions on the same button rather than buttons of their own -- the
       * strip is full, and a control that is a mode of another control belongs
       * on it. 'field' is free; the other two are the two levels of SIEVE. See
       * Game.aimModes and the row the AUTO AIM cell opens.
       *
       * Held even while autoAim is off, so switching the assist back on
       * returns it to what it was doing rather than to the default.
       */
      aimMode: 'field',
      autoFire: false,
      mine: null, // the one kind of mine being laid, or none

      energy: 0, // banked; nothing carries across a reset
      /*
       * ...and every energy ever banked this run, which only ever goes up.
       *
       * `energy` is a purse: it falls every time the tree is bought from, so
       * it cannot say how far a run has got. This can, and it is what the
       * object types are gated behind -- a run that has banked four thousand
       * has met four thousand's worth of field whether it spent it or not.
       */
      earned: 0,
      up: freshUpgrades(), // every permanent effect this run has bought
      /*
       * Every id bought, in the order it was bought. This is the run's whole
       * record of itself: owned() counts it, the turret's rig is derived from
       * it, and the save is it. It used to live on an Offers object beside a
       * queue of cards waiting to be picked, which is why it was called that;
       * the cards are gone and the record is not.
       */
      ledger: [],
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

      // What is bolted to the turret: one count per TURRET node, rebuilt from
      // the ledger whenever that grows. Declared here rather than sprung
      // into existence on first use — a field that appears later is the shape
      // of bug scripts/regress.mjs watches for.
      rig: null,
      rigAt: -1, // taken.length the cache was built at
      rigFlash: 0, // seconds of the fitting animation still to run
      rigDone: false, // the whole branch bought out, announced once a run
      shock: 0, // a hurled MASS landing: corruption in its own right, decaying
      // The edge has been broken this run, so the sky between waves is the
      // `dawn` one rather than `staging`. See endBoss and background.js.
      dawn: false,
      // ---- the anomalies ----
      /*
       * How many ways in are held, per boss, indexed by anomaly number --
       * see anomaly.js. Bought from the tree, spent by opening the way.
       * Index 0 is unused so the number in the table is the index.
       *
       * `world.aperture` is an accessor onto slot 1, defined below. It is
       * boss I's count under the name it has had since there was only one
       * boss, and it is the *same integer*, not a copy: the save format, the
       * APERTURE upgrade's apply and every test still read and write it.
       */
      apertures: [0, 0, 0, 0, 0, 0, 0, 0],
      /*
       * Which bosses have ever been broken. Progression rather than run
       * state -- it is what unseals the next slot in the tree -- so it
       * survives a reset and rides the save.
       */
      reconciled: [],
      /*
       * The run's own seed. Every wave's trait is a pure function of it, the
       * cycle and the wave's place in the rotation -- so the rail can show
       * what is coming before the wave exists, the save carries one integer
       * instead of a list, and two runs of the same seed are the same run.
       */
      runSeed: (Math.random() * 0x7fffffff) | 0,
      // What a boss leaves behind, and the only thing RECAST can be bought
      // with. `remainderGained` is the announcement queue: the collectible
      // banks itself and the HUD is the thing that can say so.
      remainder: 0,
      remainderGained: 0,
      // The one on the field, or null, and which of the seven it is. While
      // there is one the director is stopped: the field belongs to it.
      boss: null,
      bossN: 0,
      bossStage: 0,
      bossSlow: 0,
      bossLine: null, // what the boss is saying, if anything

      debug: {
        noCooldown: false,
        noGlitch: false,
        slowmo: false,
        hitboxes: false,
        stats: false,
      },

      /*
       * The ladder moved. Announced rather than silent, in the game's own
       * alert language: a step you did not ask for needs to be a thing that
       * happened, not a number that quietly changed.
       */
      onTier: ({ verdict, moved, tier, from, reason, trial, margin = 0 }) => {
        void verdict; void from;
        self.hud.syncRail(self.world);
        /*
         * A trial answers out loud whichever way it goes: it is a question the
         * player asked, and a question that gets no answer is a bug report.
         */
        if (trial) {
          self.hud.alert(trial === 'proven' ? `PROVEN ${tier}` : `NOT YET · ${reason}`,
            trial === 'proven' ? 'good' : 'remainder', 4.5);
          return;
        }
        if (margin > 0) self.hud.alert(`MARGIN +${margin}`, 'good', 3);
        /*
         * ---- every move says why ----
         *
         * A step you did not ask for is a thing that happened, not a number
         * that quietly changed -- and the reason is what makes it a thing
         * rather than a mood. Held at a gate is announced even though the
         * ladder did not move, because a run standing still with a wave it
         * just cleared is the one case where nothing changing IS the news.
         */
        const held = self.world.director.heldBy(self.world);
        if (!moved) {
          if (held && (verdict === 'surge' || verdict === 'clean')) {
            self.hud.alert(`HELD AT THE GATE · ${nameOf(held)}`, 'remainder', 4);
          }
          return;
        }
        if (moved < 0) self.hud.alert(`STEPPED BACK · ${reason} · TIER ${tier}`, 'remainder', 4.5);
        else if (moved > 1) self.hud.alert(`SURGE · ${reason} · TIER ${tier}`, 'good', 4);
        else self.hud.alert(`TIER ${tier} · ${reason}`, 'info', 3);
      },
      alert: (text, kind, dur) => self.hud.alert(text, kind, dur),
      abilityTaken: (i) => self.hud.flashTaken(i),
      carry: (key) => self.carry(key),
    };
  }

  /**
   * `world.aperture`, which is slot 1 of `world.apertures` under its old
   * name.
   *
   * Boss I's count is read and written in six places -- the upgrade that
   * sells it, the save that records it, the restore that hands it back, the
   * reset that clears it, the open that spends it, and a dozen tests that
   * set it to 1. Making it an accessor rather than renaming those keeps one
   * integer where there would otherwise be two that have to be kept in step,
   * and two that have to be kept in step is how they end up not being.
   */
  static bindAperture(w) {
    Object.defineProperty(w, 'aperture', {
      enumerable: true,
      configurable: true,
      get() { return this.apertures[1] | 0; },
      set(v) { this.apertures[1] = Math.max(0, v | 0); },
    });
    return w;
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
    // A new run has not been told anything yet, and nothing is holding it.
    w.heldFor = 0;
    w.heldSaid = 1e9;
    w.shock = 0;
    if (w.boss) w.boss.clear(w);
    w.boss = null;
    w.bossStage = 0;
    w.bossSlow = 0;
    w.bossN = 0;
    w.bossLine = null;
    // The ways in and what came back through them are of the run, not of the
    // device. A reset is a fresh session and hands back nothing.
    w.apertures.fill(0);
    // Same lifecycle as the ways in: cleared here, handed back by the
    // restore. A run that is genuinely new -- RESET SIMULATION throws the
    // save away -- starts with nothing broken.
    w.reconciled.length = 0;
    w.runSeed = (Math.random() * 0x7fffffff) | 0;
    w.remainder = 0;
    w.remainderGained = 0;
    w.time = 0;
    w.timeScale = 1;
    w.kills = 0;
    w.released = 0;
    w.stasis = 0;
    w.decoy = null;
    /*
     * ...and SPIRAL, which was the one ability effect this did not clear.
     *
     * `updateFiring` stands down while `world.spiral > 0` -- the sweep owns
     * the barrel -- and the only thing that counts it back down is the effect
     * itself, which lives in `world.effects` and is emptied four lines above.
     * So a run reset during the sweep started with a gun that could not fire
     * and nothing left alive to ever re-enable it: not a stutter, a permanent
     * dead turret, reachable by pressing RESET SIMULATION within a second of
     * using SPIRAL. The same class of bug as build 82's, found the same way --
     * by pressing every control and watching what stopped working.
     */
    w.spiral = 0;
    w.shooter.sweepFade = 0;
    w.nextStoryAt = CFG.storyEvery;
    w.energy = 0;
    w.earned = 0;
    w.up = freshUpgrades();
    w.ledger.length = 0;
    this.loadoutOpen = null;
    // Never survives a restart: a held state whose opener is gone is a paused
    // world with no visible way out.
    this.sheetOpen = false;
    document.body.classList.remove('sheetOpen');
    /*
     * There is no five hundred to reach, no lull and no ending: the field keeps
     * coming and the run is however long you keep playing it.
     *
     * `w.endless` was the flag that said so, and it was written true here and
     * never anywhere else. Every reader was a ternary that could only pick one
     * branch -- the release quota, the counter's goal, the phase label -- so
     * the flag, `CFG.killGoal` and `releasesLeft()` all went in build 186. A
     * constant threaded through four modules is worse than a flag that is
     * never false, and a flag that is never false is worse than neither.
     */
    this.scriptStep = 0;
    // World time at which the line now up has had its reading time. Nothing
    // else in the opening moves until it passes; the first line is due at
    // START, which is what the initial value buys.
    this.lineUntil = START - GAP;
    /*
     * Nothing is said twice, and anything not yet said still gets said. The
     * record is per line now, so a line written after this device finished the
     * opening is simply a line it has not been told — which is how the two
     * about DRIFT reach anyone who was already playing before they existed.
     */
    migrateLines(CONTROL_LINES);
    this.teaching = SCRIPT.some((e) => !lineSeen(e.id));
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
    w.aimMode = 'field';
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
    // A new game is a new field, and the edge is back up. See endBoss.
    w.dawn = false;
    background.setMood('staging');
    audio.setDroneMood(41, 320, 0.05);

    this.pointers.clear();
    this.gripPointer = null;
    w.autoSteering = false;

    this.mineTimer = 0;
    this.saveTimer = SAVE_EVERY;
    this.resetShown = false;
    this.hud.clearAlerts();
    this.hud.setKills(0);
    this.hud.setEnergy(0);
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
      w.ledger.push(id);
    }
    // ...and then what was actually owned and carried wins over whatever the
    // replay happened to place, because a loadout is a decision too. Same for
    // the ways in that are still held: the replay hands one out per APERTURE
    // ever bought, and spending them is not in the ledger. See save.js.
    /*
     * The ways in. `apertures` is the store; `aperture` is the same slot
     * under the name saves have used since there was one boss, and older
     * files carry only that. Read the array when it is there, fall back to
     * the integer when it is not -- which is every save written before this
     * build, and they still load.
     */
    if (Array.isArray(d.apertures)) {
      for (let n = 1; n < w.apertures.length; n++) {
        w.apertures[n] = Math.max(0, d.apertures[n] | 0);
      }
    } else if (Number.isFinite(d.aperture)) w.aperture = Math.max(0, d.aperture | 0);
    // Absent before build 204. Zero is a legal seed and gives an old save a
    // stable set of traits rather than a different one every load.
    w.runSeed = Number.isFinite(d.runSeed) ? d.runSeed | 0 : 0;
    if (Array.isArray(d.reconciled)) {
      w.reconciled = d.reconciled.filter((n) => Number.isFinite(n)).map((n) => n | 0);
    }
    if (Number.isFinite(d.remainder)) w.remainder = Math.max(0, d.remainder | 0);
    w.unlocked = new Set(d.unlocked);
    for (const k of STARTING) w.unlocked.add(k);
    w.loadout = { mines: [...d.loadout.mines], ammo: [...d.loadout.ammo] };

    w.kills = d.kills;
    w.released = d.released;
    w.time = d.time || 0;
    w.energy = d.energy;
    /*
     * A save from before the unlock clock has no `earned` at all, and seeding
     * it at zero would take TOW back off a run that had already been fighting
     * them. The kill counts the gates used to be are converted at the rate the
     * new thresholds were pitched from, so nothing a run has met re-locks.
     */
    w.earned = Math.max(d.earned || 0, (d.kills || 0) * 12);
    w.nextStoryAt = d.nextStoryAt;
    // A loaded round with no cell on the strip is a broken state — the turret
    // is meant always to have a round it can actually see. The save cannot
    // produce one today, but a guard here is a line of code and the state it
    // prevents is a run you cannot shoot with.
    w.round = carried(w.loadout, d.round) ? d.round : (w.loadout.ammo.find(Boolean) || 'standard');
    w.mine = carried(w.loadout, d.mine) ? d.mine : null;
    w.autoAim = !!d.autoAim;
    /*
     * A save from before SIEVE has neither field; one from build 182 has the
     * boolean `aimDrift`. Either way the mode is clamped to what this run has
     * actually bought, so a file cannot restore into a position the turret
     * cannot reach.
     */
    const wanted = d.aimMode || (d.aimDrift ? 'drift' : 'field');
    w.aimMode = this.aimModes().includes(wanted) && wanted !== 'off' ? wanted : 'field';
    w.autoFire = !!d.autoFire;
    if (w.narrator) w.narrator.index = d.story || 0;

    // Nothing is said twice. The ladder picks up at the step it reached, so a
    // run that quit four lines in still gets the other fifteen and never
    // re-reads the four — and every first-use hint already shown stays shown.
    // Setting teaching false outright, which is what this did until build 71,
    // meant quitting during the opening silently cancelled the rest of it.
    this.scriptStep = d.scriptStep || 0;
    this.teaching = !!d.teaching && SCRIPT.some((e) => !lineSeen(e.id));
    this.autoHinted = {};
    for (const k of d.hinted || []) this.autoHinted[k] = true;
    // Back to the wave the run was left on, from the top of it.
    w.director.restore(w, d.wave);

    this.hud.buildStrip();
    for (const k of [...MINE_KEYS, ...ROUND_KEYS]) this.hud.setToggle(k, false);
    this.hud.setToggle('standard', w.round === 'standard');
    for (const k of ROUND_KEYS) this.hud.setToggle(k, w.round === k);
    for (const k of MINE_KEYS) this.hud.setToggle(k, w.mine === k);
    this.hud.setAim(w);
    this.hud.setToggle('autoFire', w.autoFire);
    this.hud.setKills(w.kills);
    this.hud.setWavePct(w);
    this.hud.setEnergy(w.energy);
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
    for (const t of this.world.ledger) if (t === id) n++;
    return n;
  }

  /**
   * Is this node's parent bought, or free -- and is whatever it waits on done?
   *
   * `needs` is an anomaly number: a way in to the second boss does not open
   * until the first has been broken at least once, which is progression
   * rather than a purchase and so is not something a parent node can say.
   */
  available(n) {
    if (n.needs && !this.world.reconciled.includes(n.needs)) return false;
    /*
     * ...and `rung` is the same idea on the ladder rather than on the bosses:
     * sealed until the run has STOOD on that rung. Peak, not the current tier,
     * so stepping back down to breathe does not seal something already earned.
     */
    if (n.rung && (this.world.director.peak | 0) < n.rung) return false;
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
    // A slot with nothing behind it yet. It is shown because the shape of
    // what is coming is worth seeing; it is not sold because a way in that
    // opens onto nothing is worse than a door that plainly does not open.
    if (n.dormant) return 'locked';
    const have = this.owned(id);
    if (!n.repeat && have >= (n.levels || 1)) return 'maxed';
    const price = priceOf(n, have);
    /*
     * Most of the tree is bought with energy. RECAST is bought with what
     * ORDINAL leaves behind, and a node says which by naming a currency --
     * so there is one purchase path and one place a price is checked, rather
     * than a second buy button that could drift out of step with this one.
     */
    const purse = n.currency === 'remainder' ? (w.remainder || 0) : w.energy;
    if (purse < price) return 'poor';

    const def = BY_ID.get(id);
    if (!def) return 'locked';
    if (n.currency === 'remainder') w.remainder -= price;
    else w.energy -= price;
    // Stat upgrades only touch world.up; unlocks and charges need the world.
    def.apply(w.up, w);
    w.ledger.push(id);

    audio.amend();
    this.hud.setEnergy(w.energy, intakeRate(w), dividend(w));
    this.hud.buildStrip();
    this.hud.syncLoadout(w);
    this.hud.syncAbilities(w.abilities);
    this.hud.menu.syncTree();
    this.noteRig(n);
    this.checkpoint();
    return 'ok';
  }

  /**
   * A fitting going on to the turret.
   *
   * Every TURRET node is a part you can see — the tree says GIMBAL and a
   * gimbal ring appears — so buying one is worth a moment: the machine flares
   * as the part goes on, and the part is named. And when the last of them is
   * bought out, that is the one thing in the run that is finished, so it is
   * said as such.
   */
  noteRig(n) {
    const w = this.world;
    if (!n || !n.parent || n.parent.key !== 'turret') return;
    w.rigFlash = CFG.rig.flash;
    const at = this.owned(n.id);
    const tier = n.tiers && n.tiers[at - 1] ? n.tiers[at - 1].name : n.name;
    this.hud.alert(`${tier} FITTED`, 'rig', 2.6);
    audio.chime(680);
    if (w.rigDone) return;
    const done = TURRET_NODES.every((t) => this.owned(t.id) >= (t.levels || 1));
    if (!done) return;
    w.rigDone = true;
    this.hud.alert('TURRET COMPLETE — EVERY FITTING INSTALLED', 'rigDone', 5);
    audio.chime(880);
    background.surge(1);
    shake(6);
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
    return !!this.loadoutOpen
      || !!this.sheetOpen
      || !!(this.hud && this.hud.menu && this.hud.menu.open);
  }

  /**
   * The wave sheet: what is running, and the two things that may be done about
   * it. Player-opened, so it holds the world the way the menu and the loadout
   * do -- nothing in this game opens a modal by itself.
   *
   * The brief said "holds the world the way Offers do". The Offers reward pool
   * is documented in the README and does not exist in this codebase -- there is
   * no pool and no implementation, and hud.offerResume is the title screen's
   * "resume your run". Game.paused is what actually holds a run, so it uses
   * that.
   */
  openSheet(on = true) {
    if (on && (this.world.phase !== 'staging' || this.world.boss)) return false;
    this.sheetOpen = !!on;
    document.body.classList.toggle('sheetOpen', this.sheetOpen);
    this.hud.syncSheet(this.world);
    return this.sheetOpen;
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
    // The stroke floor is a device-pixel measure, so it follows the scale the
    // canvas is actually drawn at -- including the governor's own factor.
    setHairline(dpr);
    this.canvas.width = Math.round(sw * dpr);
    this.canvas.height = Math.round(sh * dpr);
    this.canvas.style.width = `${sw}px`;
    this.canvas.style.height = `${sh}px`;
    this.buffer.width = this.canvas.width;
    this.buffer.height = this.canvas.height;

    // ...and the top bar's chips are sized against the numbers in them, which
    // a rotation changes the room for. See Hud.fitBar.
    if (this.hud) this.hud.fitBar();

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

    this.grid.resize(world.width, world.height + STAGE_HEIGHT, GRID_CELL);
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
    /*
     * The aim point, lifted clear of the thumb -- see CFG.touchLift.
     *
     * Kept separate from pos() rather than folded into it, because the two
     * are asked different questions. Everything that decides WHERE THE HAND IS
     * -- the lever's grab zone, the ability strip below the floor -- wants the
     * contact point, and everything that decides WHAT IS BEING AIMED AT wants
     * this. Folding the lift into pos() would move the lever's own hit zone up
     * the screen by an inch.
     *
     * Clamped to the top of the arena so the lift cannot aim at nothing, and
     * the point stored on `pointers` is this one, so the touch aid draws the
     * crosshair where the rounds are actually going.
     */
    const aimPos = (p) => ({ x: p.x, y: Math.max(0, p.y - CFG.touchLift) });

    c.addEventListener('pointerdown', (ev) => {
      const w = this.world;
      if (w.phase === 'boot' || w.phase === 'frozen') return;
      const p = pos(ev);
      if (p.y > w.floorY + 10) return; // ability strip belongs to the thumb
      const s = w.shooter;
      /*
       * Capture is a convenience, and it is allowed to fail.
       *
       * `?.` guards a missing method, not a throwing one -- and this throws
       * NotFoundError whenever the pointer is no longer active, which happens
       * for real when a touch ends between the event being queued and the
       * handler running, and on any synthetic pointer. It sits first in the
       * handler, so an exception here loses the WHOLE press: no aim, no shot,
       * no grip on the lever. Losing the capture costs a drag that wanders off
       * the canvas; losing the press costs the press.
       */
      try { c.setPointerCapture?.(ev.pointerId); } catch { /* pointer already gone */ }

      // Anything at or behind the turret grabs the lever; anything ahead of it
      // is a direct shot at the point you touched.
      // Acting on a line is the best evidence it has been read.
      this.hud.dismissHint();
      // ...and a row left open is never in the way of playing.
      this.hud.openAimRow(false);

      if (this.gripPointer === null && p.y > s.y - s.r) {
        this.gripPointer = ev.pointerId;
        s.grabGrip(p.x, p.y, false);
        s.shoot(w);
        this.fireTimer = CFG.shooter.gripFireInterval;
      } else {
        const a = aimPos(p);
        // The contact point travels with the aim point: the touch aid draws a
        // tether between them, so the lift reads as deliberate rather than as
        // the crosshair having drifted off the thumb.
        this.pointers.set(ev.pointerId, { ...a, tx: p.x, ty: p.y });
        s.aimAt(a.x, a.y, false);
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
      const raw = pos(ev);
      const a = aimPos(raw);
      this.pointers.set(ev.pointerId, { ...a, tx: raw.x, ty: raw.y });
      w.shooter.aimAt(a.x, a.y, false);
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
    /*
     * The strip used to fade to a whisper here for the length of whatever was
     * drawn -- each ability carried its own `show` for it. It went in build
     * 191. The reasoning was that everything an ability draws is a circle on
     * the turret and the turret sits behind the controls, which is true and
     * is not worth what it costs: the frame you press an ability is the frame
     * you are most likely to press another, and a bar that dims itself under
     * the thumb already on it reads as the press having gone wrong. The
     * occlusion is a fair complaint about where the furniture sits; dimming
     * the furniture at the moment of use is not the answer to it.
     *
     * The boss beats still recede -- an arrival and a stage turning over are
     * not presses, and nobody is reading a cooldown through either.
     */
    // An ability says what it is the first time it is used, which is minutes
    // after it was bought and only if the player actually reaches for it.
    // ...and once on this device: `res.first` is per-run, so without this an
    // ability re-explains itself at the start of every run for ever.
    /*
     * They have used it. The nudge about what PULSE is for has done its job
     * and never runs again this run -- `again` is a ceiling the counter can
     * now never reach, because nothing else raises it while nothing is
     * attached.
     */
    if (res.slot.def.essential) {
      w.heldSaid = -Infinity;
      w.heldFor = 0;
    }
    const line = FIRST_USE[res.slot.def.id];
    const said = `use:${res.slot.def.id}`;
    // Marked by the band when it paints, not here -- a line that goes into the
    // queue and is dropped must not count as read. See Hud.showHint.
    if (res.first && line && this.hintsAllowed && !lineSeen(said)) {
      this.hud.showHint(line, true, undefined, said);
    }
  }

  // The opening lines live in tutorial.js with the rest of the script. The
  // field is empty for CFG.openingGrace seconds while they run — long enough
  // to say four things at reading pace and try each one before there is
  // anything to react to.


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

  toggleAuto(key) {
    const w = this.world;
    if (key === 'autoAim') return this.aimPressed();
    w[key] = !w[key];
    this.hud.setToggle(key, w[key]);
    this.announceToggle(key, w[key]);
  }

  /**
   * Every position the assist can be put in, in the order the row offers them.
   *
   * 'field' is what auto aim has always been and is free. SIEVE's first level
   * adds 'drift' -- grey alone, which is a trade rather than a gift, because
   * an assist sweeping salvage is not defending you. Its second adds 'all',
   * which is the automation: both at once, no decision left to make.
   */
  aimModes() {
    const n = this.world.up.driftAim | 0;
    const modes = ['off', 'field'];
    if (n >= 1) modes.push('drift');
    if (n >= 2) modes.push('all');
    return modes;
  }

  /**
   * The AUTO AIM cell, pressed.
   *
   * Two positions is a toggle and four is a menu, and the control is whichever
   * the turret has paid for: a list of two costs a tap to say what one tap
   * already said, and a blind cycle through four is a control you have to
   * count your way around. So it toggles until SIEVE is bought and opens the
   * row after that -- the same shape as the tier chip, which exists only
   * because the ladder does.
   */
  aimPressed() {
    /*
     * Toggles. It only ever opened -- pressing the cell again re-opened the
     * row it was already showing, so the one gesture everybody tries to close
     * a menu with did nothing at all, twice, and the control read as dead.
     * The tier chip has always toggled; this is the same control and had to.
     */
    if (this.aimModes().length > 2) return this.hud.openAimRow(!this.hud.aimRowOpen());
    const w = this.world;
    return this.setAim(w.autoAim ? 'off' : 'field');
  }

  /** Put the assist in one named position. */
  setAim(mode) {
    const w = this.world;
    if (!this.aimModes().includes(mode)) return false;
    if (mode !== 'off') w.aimMode = mode;
    w.autoAim = mode !== 'off';
    this.hud.setAim(w);
    this.hud.openAimRow(false);
    // Each position says its own thing the first time it is reached.
    const key = !w.autoAim ? 'autoAim' : { drift: 'aimDrift', all: 'aimAll' }[mode] || 'autoAim';
    this.announceToggle(key, w.autoAim);
    return true;
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
    /*
     * ...and once on this DEVICE, not once in this run.
     *
     * `autoHinted` is per-run: it is reset by restart() and carried in the
     * save, so a caption already read comes back the next time a run starts.
     * A player who has been told what BOLT is does not need telling again
     * because they died. The per-line record is the same one the opening and
     * the corruption lines use, and its whole promise is that a line is said
     * once and never again.
     */
    const said = `use:${key}`;
    if (lineSeen(said)) { this.autoHinted[key] = true; return; }
    /*
     * Marked when it is painted, not when it is asked for -- the band does it,
     * off the id passed here. It used to be marked on this line, which meant a
     * line pushed straight off the band by the next press was spent without
     * ever being read and never came back, not even across a reset.
     */
    this.autoHinted[key] = true;
    this.hud.showHint(hint, true, undefined, said);
  }

  /**
   * First-use captions are for learning the controls, which happens in the
   * staging run. Nothing explains itself once ORDINAL is on the field — a hint
   * lands in the same band as the boss, and it is the interface talking over
   * the fight.
   */
  get hintsAllowed() {
    // ...and the player's own answer, which outranks everything else here.
    // Somebody who has played games like this knows what an auto-aim toggle
    // does before they press it, and a sentence saying so is in front of the
    // field. See PREFS.hints in settings.js.
    if (!pref('hints')) return false;
    return this.world.phase === 'staging' || this.world.phase === 'lull';
  }

  /**
   * Nearest object that is currently corrupting the feed, falling back to the
   * nearest live threat. Only considers bearings the barrel can actually
   * reach, so auto aim never locks onto something behind the turret.
   */
  /*
   * The reach of the assist, in world units. Base plus whatever ARRAY has
   * added, read at the point of use like every other scalar on world.up.
   */
  get aimRange() {
    return CFG.shooter.aimRange * this.world.up.aimRange;
  }

  autoTarget() {
    const w = this.world;
    const s = w.shooter;
    const mode = w.aimMode || 'field';
    const limit = CFG.shooter.aimClamp + 0.04;
    /*
     * Reach, not just bearing. Until build 109 the only test was the cone, so
     * the assist held the whole field and there was nothing left for ARRAY to
     * sell. Measured against the body's edge rather than its centre, or a
     * BULWARK 72 units across would sit half inside the ring and be ignored.
     */
    const reach = this.aimRange;
    let best = null;
    let bestScore = Infinity;
    // Whether the thing it is already shooting is still ON the field. See the
    // note below: `dead` is not the test, because half this game's bosses hide
    // a body by taking it out of world.enemies without killing it.
    let heldLive = false;
    const held = this.autoLock;
    for (const e of w.enemies) {
      if (e === held) heldLive = true;
      /*
       * ...and `spent`, which is a body that is part of an ending rather than
       * part of a fight. A boss's structure is still drawn all the way through
       * its death -- the arrest snaps it off one piece at a time and that is
       * the whole beat -- so it cannot simply be killed or parked at the
       * moment the bar empties. It can stop being a target. Measured over the
       * seven outros, AMPLITUDE had thirteen bodies still on the field and
       * something legal to shoot on 85% of the frames of its own payout.
       */
      /*
       * `harmless` is the DRIFT rule, and SIEVE is the one thing that lifts
       * it. DRIFT lifts it the other way round -- grey and NOTHING else, so a
       * player sweeping salvage is not also being defended -- and ALL lifts it
       * in both directions at once. See Game.aimModes.
       */
      if (e.dead || e.staged || e.spent) continue;
      if (mode === 'field' && e.harmless) continue;
      if (mode === 'drift' && !e.harmless) continue;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      if (Math.abs(angleDelta(-Math.PI / 2, Math.atan2(dy, dx))) > limit) continue;
      const dist = Math.hypot(dx, dy);
      if (dist - (e.r || 0) > reach) continue;
      // a marked breacher outranks anything four times closer
      const score = dist * (e.attacking ? 0.25 : 1);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    /*
     * ...and the thing it is already shooting keeps the lock unless something
     * beats it by a margin.
     *
     * Picking strictly by score is picking again from scratch sixty times a
     * second, and the barrel does not move that fast: it traverses at
     * `autoTurnRate`, and with auto fire on the cadence does not wait for it,
     * so every shot taken during a slew is fired at where the last target was.
     * Two bodies at the same distance therefore cost a slew and a handful of
     * wasted rounds every time they trade places.
     *
     * Measured on build 136, before this existed: TERMINUS changed target
     * forty-five times a second through the whole of stage I -- thirty-two
     * ring segments at exactly the same distance, so the winner flipped on
     * floating-point noise every frame -- and fired seventy-four percent of
     * its shots mid-sweep. FRACTAL's three divided core pieces did 4.7/s and
     * AMPLITUDE's wave 5.3/s. See scripts/dps.mjs, which is what found it.
     *
     * A quarter better is the bar. A minion closing on the turret still takes
     * the lock instantly -- it is nearer by much more than a quarter, and it
     * carries the `attacking` weight besides -- while a tie does not.
     */
    /*
     * `heldLive` rather than `!held.dead`, and that distinction is the whole
     * of a bug this shipped with for about twenty minutes. ORDINAL's garrison,
     * DYNAMO's core, PARITY's phased crescent and TERMINUS's second ring are
     * all hidden the same way -- spliced out of world.enemies and left alive --
     * so a held target that has just phased passes every liveness test there
     * is. Measured with it wrong, PARITY ran 19% longer: the assist kept its
     * lock on a reflection.
     */
    /*
     * ...and the lock it is holding has to pass the same tests the challengers
     * did. It did not test `spent`, so a boss body marked finished at the
     * moment its bar emptied kept the lock for the whole of the outro --
     * TERMINUS held one for 18% of its nineteen seconds. The hysteresis
     * decides which of two legal targets to keep, not whether a target is
     * legal at all.
     */
    if (heldLive && held !== best && !held.dead && !held.staged && !held.harmless
      && !held.spent) {
      const hx = held.x - s.x;
      const hy = held.y - s.y;
      const hd = Math.hypot(hx, hy);
      if (Math.abs(angleDelta(-Math.PI / 2, Math.atan2(hy, hx))) <= limit
        && hd - (held.r || 0) <= reach
        && hd * (held.attacking ? 0.25 : 1) <= bestScore * CFG.shooter.aimStick) {
        return held;
      }
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
    // SPIRAL owns the gun while it runs, and fires it on its own cadence.
    if (w.spiral > 0) return;

    const dragging = this.pointers.size > 0;
    const manual = s.gripHeld || dragging;
    const target = w.autoAim ? this.autoTarget() : null;

    w.autoSteering = !manual && !!target;
    this.autoLock = w.autoSteering ? target : null;
    if (w.autoSteering) this.aimLead(target);

    let interval = 0;
    if (s.gripHeld) interval = CFG.shooter.gripFireInterval;
    else if (dragging) interval = CFG.shooter.holdFireInterval;
    // Hands on the lever, a thumb on the field, or neither: the same cadence.
    // See the note in CFG.shooter about the one that used to be different.
    else if (w.autoFire || target) interval = CFG.shooter.gripFireInterval;
    if (interval <= 0) return;
    // heavier rounds buy their effect with cadence
    interval *= CFG.rounds[w.round].rate * w.up.rate;

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
    // The unscaled step, for the few things that must not stretch with the
    // world -- ORDINAL's death sequence is timed against the slow-motion ramp
    // rather than inside it.
    w.dtRaw = dt;
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

    // The title's field, topped up as it falls off the bottom. Only while the
    // title is up: from `staging` on, the director owns what is on the field.
    if (w.phase === 'boot' && driftCount(w) < 7) titleRandom(() => spawnDrift(w));

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

    /*
     * ORDINAL, and the field held while it is up. Waves do not resume until
     * it is gone: the whole point of the arrival is that everything else
     * stops, and a wave landing behind it would read as the simulation not
     * having noticed.
     */
    if (w.boss) {
      w.boss.update(w, dt);
      if (w.boss.done) this.endBoss();
      else this.watchBoss(dt);
    } else {
      w.director.update(w, dt);
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
    collectEnergy(w, dt);
    this.runUpgrades(dt);
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
      /*
       * ...except a body its boss puts somewhere every frame.
       *
       * The clamp exists to stop a free body leaving the field. A pinned one
       * is not free: TERMINUS's ring is a circle centred on the turret, and
       * the floor sits only 210 below it, so the arena quietly pushed the
       * bottom seven segments inward and the boundary was a circle with a
       * flat bottom -- 180 from the turret where the rest were at 250. Caught
       * by a regress case asserting that every segment is the same distance
       * away, which is the whole geometric premise of that fight.
       */
      if (b.pinned) continue;
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

    /*
     * REFLEX used to sit here: PULSE fired itself once two things had hold of
     * the turret. It went in build 190, and the rule it broke is the one the
     * rest of the bar has always kept -- nothing in this game casts an ability
     * for you. A charge spent without being asked is a charge you did not have
     * when you needed it, and the ability whose whole job is answering a
     * crowd is the worst one to take that decision away on.
     *
     * The telling was never the automation's anyway. `.ab.urgent` breathes on
     * the PULSE button for as long as anything is attached, with or without
     * the upgrade -- see Hud.syncAbilities. That is what stays.
     */

    /*
     * Somebody who has not worked out what PULSE is for.
     *
     * Being stuck is a state, not an event, and every other line in this game
     * is said once per device -- which is right for a control you have used
     * and wrong for one you never understood. So this watches for the shape
     * of it: something has been holding the turret for a while and PULSE has
     * not been pressed. It says one sentence, waits a long time before it
     * would say it again, and stops for good the moment they use it.
     *
     * `heldSaid` is time since it was last said and ticks whether or not
     * anything is attached -- it starts high so the FIRST one lands the
     * moment `after` is reached rather than waiting out a gap that has not
     * happened yet. Ticking it only while held was the first draft, and it
     * meant the first prompt needed forty-five seconds of being stuck rather
     * than nine.
     */
    w.heldSaid += dt;
    if (w.attackers.size > 0) {
      w.heldFor += dt;
      if (w.heldFor >= STILL_HELD.after && w.heldSaid >= STILL_HELD.again
          && this.hintsAllowed) {
        w.heldSaid = 0;
        this.hud.showHint(STILL_HELD.text, true);
      }
    } else {
      w.heldFor = 0;
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
        /*
         * A MASS that was thrown at you is not the same event as something
         * walking into you. It lands as a spike of corruption in its own
         * right -- see CFG's tow.hurl.shock -- which then decays, on top of
         * the grip it has on you afterwards like anything else.
         */
        if (e.hurled) {
          const H = TYPE_BY_ID.tow.hurl;
          e.hurled = false; // it only lands once
          w.shock = Math.max(w.shock, H.shock);
          audio.boom();
          shake(18);
          ring(s.x, s.y, 12, 260, 0.5, e.type.color, 5);
        } else {
          shake(7);
        }
        ring(s.x, s.y, 10, 120, 0.3, '#ff2d55', 3);
      }
    }
    // What it is and what it costs, said while something is doing it.
    if (w.attackers.size) this.sayOnce(ON_CONTACT);
  }

  /**
   * Open the way, from the banner. One APERTURE is spent and the field is
   * ORDINAL's until it is gone.
   */
  openBoss(n = 1) {
    const w = this.world;
    // Only onto a running field. The banner is a play-screen control and the
    // boot and ending screens are not the field.
    if (w.phase !== 'staging') return false;
    if (!openAperture(w, n)) return false;
    // No codex note here: recording it on arrival would name the thing
    // before it has done anything. It is recorded when it comes apart, by the
    // same path as everything else.
    this.openSheet(false);
    this.hud.alert('THE WAY IS OPEN', 'rigDone', 4);
    return true;
  }

  /**
   * ORDINAL has come apart. The sky lets go, time comes back, and the field
   * picks up exactly where it left off.
   *
   * The director is *frozen* while a boss is up, not reset — it returns at
   * the top of its update and nothing touches its state — so whatever it had
   * left to release is still sitting in `jobs` and `at` still points at the
   * wave that was running. This used to force `resting = true`, which made
   * the next begin() step past that wave and load the following one: half a
   * wave you were in the middle of, thrown away because a boss happened.
   *
   * So the only thing done here is to hold it for a beat. A wave with
   * releases left resumes and lets the rest of them out; a wave that had
   * already emptied is marked rested, because the hole took the field with it
   * and there is nothing left of that wave to finish.
   */
  /**
   * A gate rung lights its own banner, free.
   *
   * Idempotent and run every frame: the run may arrive on a gate by climbing,
   * by stepping back down to it, by a restore or by the debug panel, and one
   * check that simply keeps the invariant true beats four call sites that
   * each have to remember. Topping up to one rather than adding one, so
   * standing on a gate cannot be farmed -- and so the banner comes back on
   * its own after a withdrawal, which is what "the gate stays lit" means.
   */
  syncGate() {
    const w = this.world;
    const d = w.director;
    if (!d || w.boss || w.phase !== 'staging') return;
    const n = d.heldBy(w);
    if (!n || (w.apertures[n] | 0) > 0) return;
    w.apertures[n] = 1;
    if (this.gateLit !== n) {
      this.gateLit = n;
      this.hud.alert(`APERTURE · ${nameOf(n)} · OPEN THE WAY`, 'rigDone', 5);
    }
  }

  /**
   * The anomaly stops counting.
   *
   * A gate that cannot be passed is a run that cannot continue, so a boss that
   * has stood for `CFG.boss.patience` without losing a stage withdraws. The
   * gate stays lit, nothing is reconciled, and the field comes back.
   *
   * Watched from here, on `world.bossStage`, rather than from the boss's own
   * `stageT` -- which the brief named and which turned out to be dead state:
   * `Boss` sets it to 0 at construction and again in `enterStage`, and nothing
   * has ever incremented it. All seven bosses write `world.bossStage` on a
   * stage change, so one watcher here covers them uniformly and does not
   * depend on which of them call super.
   */
  watchBoss(dt) {
    const w = this.world;
    if (w.boss.sequencing()) { this.bossStageT = 0; return; }
    if (w.bossStage !== this.bossStageWas) {
      this.bossStageWas = w.bossStage;
      this.bossStageT = 0;
      return;
    }
    this.bossStageT = (this.bossStageT || 0) + (w.dtRaw || dt);
    if (this.bossStageT > CFG.boss.patience) this.withdrawBoss();
  }

  /**
   * ...and goes, leaving the way open behind it.
   *
   * Beside endBoss and deliberately not sharing with it: the two differ in
   * the one thing that matters, which is that nothing is reconciled here. A
   * boss that withdrew was not beaten.
   */
  withdrawBoss() {
    const w = this.world;
    if (!w.boss) return;
    w.boss.clear(w);
    w.boss = null;
    w.bossStage = 0;
    w.bossN = 0;
    w.timeScale = 1;
    w.bossLine = null;
    this.bossStageT = 0;
    this.bossStageWas = 0;
    const d = w.director;
    if (!d.jobs.length) d.resting = true;
    d.timer = CFG.boss.after;
    background.setMood(w.dawn ? 'dawn' : 'staging');
    this.hud.alert('IT HAS STOPPED COUNTING · FOR NOW', 'remainder', 5);
  }

  endBoss() {
    const w = this.world;
    const n = w.bossN || 1;
    w.boss.clear(w);
    w.boss = null;
    w.bossStage = 0;
    w.timeScale = 1;
    // It has been broken at least once now, which is what unseals what comes
    // after it. Recorded once; breaking the same one again changes nothing.
    if (!w.reconciled.includes(n)) w.reconciled.push(n);
    w.bossN = 0;
    const d = w.director;
    if (!d.jobs.length) d.resting = true;
    d.timer = CFG.boss.after;
    w.bossLine = null;
    this.hud.alert(`${nameOf(n)} RECONCILED`, 'rigDone', 5);
    /*
     * ...and the sky does not always come back the same.
     *
     * Every other fight hands `staging` back and the field looks exactly as
     * it did before. TERMINUS is the edge of the simulation, and breaking it
     * is the one thing in this game that leaves a mark on the world rather
     * than on the ledger: from here on the darkness is grey-gold. Per run --
     * a new game is a new field, and the edge is back up.
     */
    if (n === 7) w.dawn = true;
    background.setMood(w.dawn ? 'dawn' : 'staging');
    /*
     * ...and the gate it was standing on is open now. The rung past it is the
     * fight's own reward: the ladder was held there and nothing else was going
     * to move it, so handing it over here is the climb the anomaly was in the
     * way of rather than a bonus on top.
     */
    this.bossStageT = 0;
    this.bossStageWas = 0;
    this.gateLit = 0;
    if (d.gateAt(d.tier) === n) {
      d.setTier(d.tier + 1);
      // ...and the anomaly leaves a choice behind it. Two rules, on the rail,
      // taken by tapping one. Nothing is held and nothing is asked.
      d.offerLane(w);
      this.hud.syncRail(w);
    }
  }

  /**
   * A line that waits for a thing to happen rather than for the count.
   *
   * One per call, and only when the last one has had its reading time, so a
   * pair of them comes out paced the way the opening does. Remembered by the
   * same per-line record as everything else, so each is said once on this
   * device and never again — including to a player who finished the opening
   * long before the line existed.
   */
  sayOnce(lines) {
    const w = this.world;
    for (const l of lines) {
      if (lineSeen(l.id)) continue;
      if (w.time < this.lineUntil + GAP) return;
      markLine(l.id);
      this.hud.showHint(l.text, true);
      this.lineUntil = w.time + l.hold;
      return;
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
    if (codex.record(id)) this.hud.noteCodex(id);
  }

  /**
   * The opening ladder. One control comes back per few objects, in the order
   * the game wants them learned — ammunition, mines, the two that run on their
   * own, then the abilities — each with a line. When the last entry is out the
   * run stops teaching, and it never teaches again on this device.
   */
  teach() {
    if (!this.teaching) return;
    // The opening is a teaching line like any other and answers to the same
    // preference. Nothing is marked said while it is off, so turning it back
    // on resumes the script rather than skipping it.
    if (!pref('hints')) return;
    const w = this.world;
    // Walk past anything this device has already been told. Costs nothing and
    // no clock: a line it has heard should not hold up the one it has not.
    while (this.scriptStep < SCRIPT.length && lineSeen(SCRIPT[this.scriptStep].id)) {
      this.scriptStep++;
    }
    const step = SCRIPT[this.scriptStep];
    if (!step) { this.teaching = false; return; }
    /*
     * Paced by what has actually been said, not by what has been asked for.
     *
     * The clock below is set when a line is handed to the band, and since
     * build 182 the band may queue it rather than paint it -- so a player who
     * presses four controls in the first ten seconds put four first-use lines
     * in front of the opening, and the opening carried on producing on its own
     * clock regardless, stacking five deep behind them. The script waits for
     * the band to be clear instead, which is what its own pacing always meant.
     */
    if (this.hud.pending()) return;
    // ...and gated on the count, so a line about salvage is not said before
    // any has been banked.
    if (w.time < this.lineUntil + GAP) return;
    if (step.at !== undefined && w.kills < step.at) return;

    this.scriptStep++;
    this.hud.showHint(step.text, true, step.hold, step.id);
    this.lineUntil = w.time + step.hold;
    if (this.scriptStep >= SCRIPT.length) this.teaching = false;
  }

  /**
   * Back to a first launch.
   *
   * RESET SIMULATION used to only throw away the run — the glossary and every
   * line already said survived it, so "start again" started again with the
   * game still knowing you. REPLAY OPENING sat beside it to put the lines
   * back, which is two buttons for one idea and neither of them the one
   * anybody wanted. This is the one: the save, the glossary, the opening, and
   * the energy with it.
   */
  resetAll() {
    forgetPlayer();
    this.restart();
  }

  /** Stop the opening where it is, without a word. */
  finishTeaching() {
    if (!this.teaching) return;
    this.teaching = false;
    this.scriptStep = SCRIPT.length;
    this.hud.clearHint();
    // Stopping it is a decision about all of it, so all of it counts as said.
    for (const e of SCRIPT) markLine(e.id);
  }

  /**
   * On screen and not yet bought. Every locked thing is drawn from the first
   * frame — the shape of what a turret can become is worth seeing before it
   * is yours, and unsealing WIRE means more when you have been looking at its
   * cell for ten minutes.
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
    if (this.world.rigFlash > 0) this.world.rigFlash = Math.max(0, this.world.rigFlash - dtRaw);
    // Time comes back after ORDINAL's death, eased rather than snapped.
    if (this.world.bossSlow > 0) {
      this.world.bossSlow = Math.max(0, this.world.bossSlow - dtRaw);
      const k = 1 - this.world.bossSlow / Math.max(0.001, CFG.boss.slowFor);
      this.world.timeScale = CFG.boss.endSlow + (1 - CFG.boss.endSlow) * (k * k);
    }
    const w = this.world;
    let level = 0;
    let mode = 'normal';
    if (w.shock > 0) {
      w.shock = Math.max(0, w.shock - dtRaw / TYPE_BY_ID.tow.hurl.shockFor);
    }
    if (!w.debug.noGlitch) {
      level = Math.min(CFG.glitch.max, w.attackers.size * CFG.glitch.perAttacker + w.shock);
    }
    glitch.update(dtRaw, level, mode);
  }

  syncHud(dt) {
    // The gate keeps its own banner lit. Idempotent, so it does not matter
    // which of the six ways onto a gate rung the run took to get here.
    this.syncGate();
    const w = this.world;
    this.hud.setKills(w.kills);
    this.hud.setWavePct(w);
    /*
     * The ladder's rail. It was missing from here and present only in
     * syncHudLight -- the path that runs while the world is HELD -- so the
     * rail was drawn by accident and not by design: on a tier change, on a
     * press of its own arrows, or the next time the game was paused. A fresh
     * run got away with it because the first clean wave moves the tier and
     * paints it. A resumed one did not: nothing moves the ladder on the way
     * in, so the band came back with five empty boxes and no switch label,
     * which is what "waves do not show on continuing" was.
     */
    this.hud.syncRail(w);
    this.hud.setEnergy(w.energy, intakeRate(w), dividend(w));
    this.hud.syncAbilities(w.abilities);
    this.hud.syncLoadout(w);
    this.hud.syncSeals();
    /*
     * A REMAINDER arriving is the rarest event in the run -- one per ORDINAL,
     * and the only currency there is a second of. It gets said plainly, held
     * on screen for six seconds, and the tree grows a purse for it.
     */
    /*
     * ...and it waits for ORDINAL to stop talking. The REMAINDER lands about
     * four seconds into a death whose outro reads for eleven, so the two
     * announcements were always going to arrive together. They cannot
     * overlap on screen any more — they share a column — but one at a time
     * is still the better beat, and this is the whole of what that costs.
     */
    while (w.remainderGained > 0 && !w.bossLine) {
      w.remainderGained--;
      // Two lines rather than one long one: what happened, then what to do
      // about it. One line ran off both edges of a 390-wide screen.
      const from = w.remainderFrom || 1;
      this.hud.alert(`${nameOf(from)} LEFT A REMAINDER`, 'remainder', 6);
      this.hud.alert(`${w.remainder} HELD · RECAST, IN THE TREE`, 'found', 6,
        dressOf(from).bar[1][1]);
      this.checkpoint();
    }
    this.hud.say(w.boss ? w.bossLine : null);
    this.hud.syncBoss(w);
    this.hud.menu.sync(w);
    this.hud.updateAlerts(dt);
    this.hud.syncSpawn();
    /*
     * ...and cleared when the toggle goes off, which it never was. The box
     * only ever had text written INTO it, so switching STATS off left the
     * last frame's readout frozen in the panel -- a live-looking fps, phase
     * and object count that had stopped being true the moment it stopped
     * updating. The worst kind of debug output: still there, still plausible,
     * no longer measuring anything.
     */
    if (!w.debug.stats) {
      if (this.statsShown) { this.statsShown = false; this.hud.setStats(''); }
    } else {
      this.statsShown = true;
      this.hud.setStats(
        `fps    ${this.fps.toFixed(0)}\n`
        + `phase  ${w.phase}\n`
        + `kills  ${w.kills}  released ${w.released}\n`
        + `obj    ${hostileCount(w)} hostile + ${w.enemies.length - hostileCount(w)} drift + ${w.drops.length} frag + ${w.debris.length} wreck\n`
        + `shots  ${w.projectiles.length}\n`
        + `parts  ${fx.particles.active.length}\n`
        + `dpr    ${this.dpr.toFixed(2)}  q ${fx.quality.toFixed(2)}  work ${this.frameWork.toFixed(1)}ms\n`
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

    /*
     * Ground first: anything in effects that declares itself ground (the
     * SPORE and THORN patches) is part of the floor and draws under every
     * body, not over them. The rest of the effects stay where they were,
     * after the bodies, because a blast or a beam IS over the field.
     */
    for (const e of w.effects) if (e.ground) e.draw(ctx, w);

    // Story sits in the quiet upper band, behind every entity, so it can never
    // hide a target — and never competes with the lever for space.
    // ...and it stands down while a boss is talking: both live in the same
    // upper band, and an arrival caption landing across a story line still
    // fading was the one text-on-text collision the one-voice rule missed --
    // it only ever arbitrated the DOM surfaces, and the narrator is canvas.
    if (!w.bossLine) w.narrator.draw(
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
    // Over its own bodies: the frame's cables, the repair beams and the halo
    // belong on top of the segments they run between.
    if (w.boss) w.boss.draw(ctx, w);

    drawMines(ctx, w);
    for (const e of w.effects) if (!e.ground) e.draw(ctx, w);

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
   * Where the rounds are going, drawn clear of the hand.
   *
   * Your thumb covers roughly a 44px disc, so the aim point is lifted above
   * the contact patch (CFG.touchLift) and the crosshair is drawn at the lifted
   * point -- which is the real aim, not a decoration offset from it. A tether
   * runs back down to the finger so the gap reads as deliberate; without it
   * the crosshair looks like it has come loose.
   */
  drawTouchAid(ctx) {
    if (this.pointers.size === 0) return;
    const w = this.world;
    for (const p of this.pointers.values()) {
      if (p.tx !== undefined) {
        ctx.strokeStyle = rgba('#59e0ff', 0.16);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.tx, p.ty);
        ctx.lineTo(p.x, p.y + 26);
        ctx.stroke();
      }
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

  /**
   * STASIS, for as long as STASIS lasts.
   *
   * `world.stasis` is set to 4 and this faded out over `stasis / 0.8` -- so
   * the ability drew for the first four fifths of a second and then nothing
   * at all for the remaining three and a bit, while it was still holding the
   * entire field. Twenty-one seconds of cooldown buying an effect that is
   * invisible for eighty percent of its life, and the only way to know it was
   * still on was that things were not moving.
   *
   * It holds now, and it says what it is doing to each thing rather than only
   * to the screen: the frame is clamped at four corners, a scan crawls down
   * the field the way a held picture is read out line by line, and every body
   * caught in it wears brackets. The last half second is the only part that
   * fades, which is the warning that it is about to let go.
   */
  drawStasis(ctx, W, H) {
    const w = this.world;
    // Full strength while held; only the last half-second lets go.
    const a = clamp(w.stasis / 0.5, 0, 1);
    const t = w.time;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(120,200,255,${0.045 * a})`;
    ctx.fillRect(0, 0, W, H);

    /*
     * The read-out. A bright line crawling down the field: a frame that is
     * being held still is a frame being scanned, and it is the one moving
     * thing on a screen where nothing else may move.
     */
    const sy = ((t * 0.42) % 1) * H;
    const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
    g.addColorStop(0, 'rgba(143,171,255,0)');
    g.addColorStop(0.5, `rgba(190,225,255,${0.16 * a})`);
    g.addColorStop(1, 'rgba(143,171,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, sy - 60, W, 120);
    ctx.globalCompositeOperation = 'source-over';

    /*
     * Brackets on what is held. The ability's promise is "objects stop, your
     * shots do not", and nothing on the screen ever separated the two -- so
     * the things it has hold of are marked and the things it has not are not.
     */
    ctx.strokeStyle = `rgba(190,225,255,${0.5 * a})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const e of w.enemies) {
      if (e.dead || e.staged) continue;
      const r = e.r * 1.5;
      for (const [sx2, sy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = e.x + sx2 * r;
        const cy = e.y + sy2 * r;
        ctx.moveTo(cx - sx2 * r * 0.42, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy - sy2 * r * 0.42);
      }
    }
    ctx.stroke();

    // The frame, clamped at the corners rather than outlined all the way
    // round -- it reads as held rather than as a border.
    ctx.strokeStyle = `rgba(200,240,255,${0.34 * a})`;
    ctx.lineWidth = 2;
    const m = 4;
    const L = Math.min(W, H) * 0.12;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
    ]) {
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
    }
    ctx.stroke();
    ctx.restore();
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

  /*
   * `ms` is the interval between frames; `workMs` is how long update() and
   * draw() actually took inside it. Both are needed, because each is blind to
   * a kind of slowness the other sees:
   *
   *   The INTERVAL sees GPU-bound frames. Canvas calls are queued rather than
   *   executed, so draw() can return in a millisecond and still have handed
   *   the compositor more than it can finish before the next vsync. Nothing
   *   but the interval knows that happened.
   *
   *   The WORK sees a game that is uniformly half-rate. A 60Hz phone locked
   *   to 33ms because we spend 30ms in here is, from timing alone,
   *   indistinguishable from a 30Hz display -- the intervals are identical.
   *   Only the work tells the two apart.
   *
   * The interval is judged against the display's OWN cadence rather than an
   * absolute number, which is the whole of build 198. It used to drop above
   * 20.5ms and recover below 13.5ms, and a vsync-locked 60Hz display cannot
   * produce an interval under 16.67ms -- so the recovery door was one that
   * never opened. One transient stall pinned the game at reduced quality for
   * the rest of the session. The same absolute test also read iOS low-power
   * mode, which throttles rAF to 30Hz while the game does no more work at
   * all, as a device that could not cope, and cut quality to the floor.
   */
  trackFrame(ms, workMs = 0) {
    this.frameTimes.push(ms);
    this.workTimes.push(Math.min(workMs, 60));
    if (this.frameTimes.length < 60) return;
    let sum = 0;
    for (const t of this.frameTimes) sum += t;
    const avg = sum / this.frameTimes.length;
    let wsum = 0;
    for (const t of this.workTimes) wsum += t;
    const work = wsum / this.workTimes.length;

    /*
     * The display's cadence is the tenth percentile of the window, not the
     * mean and not the minimum: the fastest frames are the ones that landed
     * on a vsync, so they read the refresh rate even when most of the window
     * missed it, and taking a percentile rather than the outright minimum
     * keeps one spurious gap -- two callbacks fired back to back after a tab
     * restore -- from declaring a 500Hz display and dropping quality forever.
     */
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const cadence = clamp(sorted[(sorted.length * 0.1) | 0], 6, 34);
    this.frameTimes.length = 0;
    this.workTimes.length = 0;
    this.fps = 1000 / Math.max(avg, 1);
    this.frameWork = work;

    const late = avg / cadence;      // 1 means every frame landed on time
    const budget = 1000 / 60;        // the game targets 60; work is judged against that

    /*
     * Quality drops when frames get long and comes back up when they do not
     * -- but never above the player's own ceiling. Somebody who set EFFECTS
     * to LOW on a device they know is slow meant it, and having the governor
     * quietly undo that the moment the field is empty is the setting not
     * working.
     */
    const roof = pref('effects');
    if (fx.quality > roof) { fx.quality = roof; this.resize(); }
    if (this.qualityCooldown > 0) { this.qualityCooldown--; return; }
    const struggling = late > 1.25 || work > budget * 0.9;
    const comfortable = late < 1.06 && work < budget * 0.5;
    if (struggling && fx.quality > 0.45) {
      fx.quality = fx.quality > 0.7 ? 0.7 : 0.45;
      this.qualityCooldown = 3;
      this.resize();
    } else if (comfortable && fx.quality < roof) {
      fx.quality = Math.min(roof, fx.quality < 0.7 ? 0.7 : 1);
      this.qualityCooldown = 6;
      this.resize();
    }
  }

  // ---------------------------------------------------------------- debug




  debugAddKills(n) {
    const w = this.world;
    for (let i = 0; i < n && w.phase === 'staging'; i++) {
      // A debug kill is a body that was released, so the count the debug
      // readout and the save both show moves with it.
      w.released += 1;
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

  /**
   * A group of one named type, on demand -- the whole job of the spawn screen.
   * Returns what it made so the panel can say how many actually landed, which
   * differs from what was asked for whenever a TOW is involved.
   */
  debugSpawnGroup(id, count, opts = {}) {
    return spawnGroup(this.world, id, count, opts);
  }

  /**
   * What is on the field right now, for the spawn screen's tally. Counted in a
   * loop rather than filtered, because this runs every frame the screen is up.
   */
  debugFieldCount() {
    const w = this.world;
    let frag = 0;
    for (const e of w.drops) if (!e.dead) frag++;
    return {
      hostile: hostileCount(w),
      drift: driftCount(w),
      frag,
      wreck: w.debris.length,
    };
  }

  debugGlitch() {
    glitch.kick(1);
  }

  /**
   * Energy, without earning it. The tree is the only thing that spends it, so
   * this and MAX UPGRADES are the two halves of looking at the tree: one buys
   * everything outright, this one lets you buy it the way a player would and
   * watch the rows change state as you go.
   */
  debugGiveEnergy(n = 10000) {
    const w = this.world;
    w.energy += n;
    /*
     * ...and the lifetime counter with it. The object types are gated on
     * `earned` since build 180, so energy handed over without it opens the
     * tree and nothing else: a tester with a hundred thousand in the purse
     * would still be fighting MOTEs and NEEDLEs. What this button means is
     * "as though the run had earned it", which is both halves.
     */
    w.earned += n;
    this.hud.setEnergy(w.energy, intakeRate(w), dividend(w));
    this.hud.menu.syncTree();
    this.hud.alert(`+${n} ENERGY`, 'info', 1.4);
    return w.energy;
  }



  /**
   * The whole tree, every node at every level, paid for by nobody.
   *
   * UNLOCK ALL below hands over the kit -- the rounds, the mines, the
   * abilities -- and stops there, which is half a turret: none of the seventy
   * upgrades behind them, so a SCATTER with no DOUBLE-O and a mine tier with no
   * doctrine on it. This is the other half, and it includes the kit, since an
   * arm's unlock is a node in the tree like anything else.
   *
   * NODES comes out of flatten() parent-first, which is the order that matters:
   * a charge applies through world.abilities and would have nothing to grant
   * it to if the ability it belongs to had not been opened first.
   */
  debugBuyAll() {
    const w = this.world;
    let bought = 0;
    for (const n of NODES) {
      if (!n.id) continue;
      const def = BY_ID.get(n.id);
      if (!def) continue;
      // A repeatable node has no ceiling, so "buy every level of everything"
      // is not a finite instruction for it — the loop ran until the ledger
      // array itself refused to grow. It is also not an upgrade: handing out
      // ways in is not what MAX UPGRADES means.
      if (n.repeat) continue;
      for (let have = this.owned(n.id); have < (n.levels || 1); have++) {
        def.apply(w.up, w);
        w.ledger.push(n.id);
        bought++;
      }
    }
    this.hud.setEnergy(w.energy, intakeRate(w), dividend(w));
    this.hud.buildStrip();
    this.hud.syncLoadout(w);
    this.hud.syncAbilities(w.abilities);
    this.hud.menu.syncTree();
    this.hud.alert(`+${bought} upgrades`, 'info', 1.6);
    return bought;
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
    // on the strip left every cell empty, which is a state the tree can
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
    forgetLines();
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
