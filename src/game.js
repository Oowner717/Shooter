// World state, phase machine, physics stepping and the render pipeline.

import { CFG, BUILD, ENEMY_TYPES } from './config.js';
import { TAU, clamp, rand, spread, rgba, makeCanvas, weightedPick, angleDelta } from './util.js';
import { Grid, integrate, resolvePair, resolveBox, clampToArena, impactDamage } from './physics.js';
import { fx, updateFx, drawFx, drawFlash, spark, ring, shake } from './fx.js';
import { background } from './background.js';
import { glitch } from './glitch.js';
import { audio } from './audio.js';
import { Director, spawnOne, spawnFormation, spawnDrift, applyBlast } from './enemies.js';
import { Shooter } from './shooter.js';
import { Wall } from './gate.js';
import { Boss } from './boss.js';
import { Abilities } from './abilities.js';
import { updateProjectiles, drawProjectiles } from './projectiles.js';
import { updateMines, drawMines, mineCadence, throwMine } from './mines.js';
import { Narrator, ENDING } from './narrative.js';
import { Hud } from './hud.js';

const STAGE_HEIGHT = 320; // how far above the screen objects may queue
const HUD_TOP_MIN = 20; // matches --hud-t: phones without a notch still have a status bar

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
    this.leverHinted = false;
    this.autoHinted = {};
    this.acc = 0;
    this.frameTimes = [];
    this.fps = 60;
    this.qualityCooldown = 0;

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
      phase: 'boot', // boot | staging | gate | boss | ending | frozen

      enemies: [],
      debris: [],
      projectiles: [],
      effects: [],
      pendingBlasts: [],
      attackers: new Set(),

      shooter: new Shooter(0, 0),
      wall: new Wall(),
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
      autoSteering: false, // is auto aim traversing the barrel this frame?
      autoAim: false,
      autoFire: false,
      autoMine: false,
      round: 'standard', // standard | explosive | shotgun
      mines: [],
      veilFade: 0, // eased so VEIL closes in rather than snapping

      nextStoryAt: CFG.storyEvery,
      sealed: false,

      debug: {
        noCooldown: false,
        noGlitch: false,
        slowmo: false,
        hitboxes: false,
        stats: false,
        toughGate: false,
      },

      alert: (text, kind, dur) => self.hud.alert(text, kind, dur),
      onGateSealed: () => self.onGateSealed(),
      onGateBroken: () => self.onGateBroken(),
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
    w.boss = null;
    w.stasis = w.veil = w.invert = w.jam = w.chrono = w.lockout = w.bossContact = 0;
    w.veilFade = 0;
    w.nextStoryAt = CFG.storyEvery;
    w.sealed = false;
    w.phase = 'staging';

    w.wall.reset();
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
    this.resetShown = false;
    this.hud.clearAlerts();
    this.hud.hideEnding();
    this.hud.setBoss(false);
    this.hud.setGate(false);
    this.hud.setKills(0, CFG.killGoal);
    this.hud.setPhase('STAGING');
    this.hud.syncAbilities(w.abilities);

    w.director.seed(w);
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
    const safeTop = Math.max(num(probe.paddingTop, 0), HUD_TOP_MIN);
    const safeBottom = num(probe.paddingBottom, 0);
    const barH = num(getComputedStyle(document.documentElement).getPropertyValue('--bar-h'), 74);

    // Everything below is in world units: screen pixels divided by the zoom.
    const world = this.world;
    const z = CFG.zoom;
    world.scale = z;
    world.width = sw / z;
    world.height = sh / z;
    world.floorY = (sh - (safeBottom + barH + 22)) / z;
    world.wall.layout(world.width, Math.max(96, safeTop + 74) / z);
    world.shooter.x = world.width / 2;
    world.shooter.y = this.shooterY;

    this.grid.resize(world.width, world.height + STAGE_HEIGHT, 96);
    background.resize(world.width, world.height, world.wall.gateCx, world.wall.y + world.wall.thickness);

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
        if (!this.leverHinted) {
          this.leverHinted = true;
          this.hud.showHint('LEVER — swing and hold. The barrel goes the other way.');
        }
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
      if (n >= 1 && n <= 5) this.useAbility(n - 1);
      if (ev.key === ' ') this.world.shooter.shoot(this.world);
    });
  }

  useAbility(i) {
    const w = this.world;
    if (w.phase === 'boot' || w.phase === 'ending' || w.phase === 'frozen') return;
    const res = w.abilities.trigger(w, i);
    if (!res) return;
    this.hud.flashAbility(i);
    if (res.first) this.hud.showHint(res.slot.def.hint);
  }

  static HINTS = {
    autoAim: 'AUTO AIM — tracks and fires on the nearest breacher.',
    autoFire: 'AUTO FIRE — keeps shooting wherever the barrel points.',
    autoMine: 'AUTO MINE — lobs inert mines that arm where they land.',
    explosive: 'HE ROUNDS — every shot detonates. Half the rate of fire.',
    shotgun: 'SHOT ROUNDS — five pellets a shot, close range, slower cadence.',
  };

  toggleAuto(key) {
    const w = this.world;
    w[key] = !w[key];
    this.hud.setToggle(key, w[key]);
    if (key === 'autoMine' && w.autoMine) this.mineTimer = 0.2;
    this.announceToggle(key, w[key]);
  }

  /** Loadouts are exclusive: picking one clears the other. */
  toggleRound(kind) {
    const w = this.world;
    w.round = w.round === kind ? 'standard' : kind;
    this.hud.setToggle('explosive', w.round === 'explosive');
    this.hud.setToggle('shotgun', w.round === 'shotgun');
    this.announceToggle(kind, w.round === kind);
  }

  announceToggle(key, on) {
    audio.chime(on ? 760 : 430);
    if (!on || this.autoHinted[key]) return;
    this.autoHinted[key] = true;
    this.hud.showHint(Game.HINTS[key]);
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
    else if (w.autoFire || target) interval = CFG.shooter.autoFireInterval;
    if (interval <= 0) return;
    // heavier rounds buy their effect with cadence
    interval *= CFG.rounds[w.round].rate;

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

    w.wall.update(w, dt);
    w.director.update(w, dt);
    if (w.boss && !w.boss.dead) w.boss.update(w, dt);

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
    bodies.pop(); // shooter is not integrated

    const boss = w.boss;
    for (const b of bodies) {
      let impact = 0;
      for (const box of w.wall.boxes) impact = Math.max(impact, resolveBox(b, box));
      impact = Math.max(impact, clampToArena(b, w.width, STAGE_HEIGHT, w.floorY));
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
      if (e.counts && !e.dissolved) this.registerKill();
      if (e.dissolved) {
        for (let k = 0; k < 4; k++) spark(e.x, e.y, spread(60), spread(60), e.type.glow, 0.4, 1.6);
      }
      w.attackers.delete(e);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  registerKill() {
    const w = this.world;
    w.kills++;
    while (w.kills >= w.nextStoryAt && w.narrator.index < 10) {
      w.nextStoryAt += CFG.storyEvery;
      w.narrator.advance();
      audio.chime(520 + w.narrator.index * 30);
      background.surge(0.7);
    }
    if (!w.sealed && w.kills >= CFG.killGoal) {
      w.sealed = true;
      w.phase = 'gate';
      w.wall.seal(w);
      this.hud.setPhase('SEAL');
    }
  }

  // --------------------------------------------------------------- phases

  /** @param real unscaled seconds — the outro must not run at slow-mo speed. */
  updatePhase(real) {
    const w = this.world;
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

  onGateSealed() {
    this.hud.setPhase('GATE');
    this.hud.setGate(true, 1);
    this.hud.alert('GATE SEALED · BREAK IT OPEN', 'info', 4);
    background.setMood('gate');
    background.surge(2);
    audio.setDroneMood(55, 480, 0.07);
  }

  onGateBroken() {
    const w = this.world;
    w.phase = 'boss';
    this.hud.setPhase('BOSS');
    this.hud.setGate(false);
    background.setMood('boss');
    background.surge(2);
    audio.setDroneMood(33, 260, 0.09);

    const bx = w.wall.gateCx;
    const by = w.wall.y + w.wall.thickness + CFG.boss.r * 0.4;
    w.boss = new Boss(bx, by);
    this.hud.setBoss(true, 1, 'MNEMOSYNE', 'MEMORY OF EVERY OBJECT');
    this.hud.alert('MNEMOSYNE · EMERGING', 'power', 4);
  }

  onBossDead() {
    const w = this.world;
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
    this.hud.setKills(w.kills, w.phase === 'staging' ? CFG.killGoal : null);
    this.hud.syncAbilities(w.abilities);
    this.hud.syncStatus(w);
    this.hud.updateAlerts(dt);
    if (w.wall.sealed) this.hud.setGate(true, w.wall.hp / w.wall.maxHp);
    if (w.boss && !w.boss.dead) this.hud.setBoss(true, w.boss.hpFrac);
    if (w.debug.stats) {
      this.hud.setStats(
        `fps    ${this.fps.toFixed(0)}\n`
        + `phase  ${w.phase}\n`
        + `kills  ${w.kills}\n`
        + `obj    ${w.enemies.length} + ${w.debris.length} deb\n`
        + `shots  ${w.projectiles.length}\n`
        + `parts  ${fx.particles.active.length}\n`
        + `dpr    ${this.dpr.toFixed(2)}  q ${fx.quality.toFixed(2)}\n`
        + `mines  ${w.mines.length}  round ${w.round}\n`
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

    // Story sits in the quiet band under the wall, behind every entity, so it
    // can never hide a target — and never competes with the lever for space.
    const wallBottom = w.wall.y + w.wall.thickness;
    w.narrator.draw(
      ctx,
      W / 2,
      wallBottom + (w.shooter.y - wallBottom) * 0.46,
      Math.min(W - 70, 470),
      background.mood.accent,
      13 / w.scale,
    );

    w.wall.draw(ctx, w);

    for (const e of w.debris) e.draw(ctx, w);
    for (const e of w.enemies) e.draw(ctx, w);
    if (w.boss && !w.boss.dead) w.boss.draw(ctx);

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
    if (w.boss && !w.boss.dead) hole(w.boss.x, w.boss.y, w.boss.r * 4);

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
    for (const b of w.wall.boxes) ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
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

  debugSkipToGate() {
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
    if (w.phase === 'staging') this.debugSkipToGate();
    w.wall.state = 'sealed';
    w.wall.rebuildBoxes();
    w.wall.breakOpen(w);
  }

  debugKillBoss() {
    const w = this.world;
    if (w.boss && !w.boss.dead) {
      w.boss.intro = 1;
      w.boss.hurt(w, w.boss.hp);
    }
  }

  debugAddKills(n) {
    for (let i = 0; i < n && this.world.phase === 'staging'; i++) this.registerKill();
  }

  debugNextStory() {
    this.world.narrator.advance();
  }

  debugBossPower() {
    const w = this.world;
    if (w.boss && !w.boss.dead) w.boss.castPower(w);
  }

  debugSpawnWave() {
    const w = this.world;
    spawnFormation(w, ENEMY_TYPES, 5);
  }

  debugFillField() {
    const w = this.world;
    while (w.enemies.length < CFG.maxEnemies) {
      const t = weightedPick(ENEMY_TYPES);
      spawnOne(w, t, rand(t.r + 10, w.width - t.r - 10), rand(w.wall.y + 60, w.floorY - 120), {
        staged: false,
        spawnIn: 0.4,
      });
    }
  }

  debugClearField() {
    const w = this.world;
    for (const e of w.enemies) if (!e.dead) e.destroy(w);
    for (const e of w.debris) if (!e.dead) e.destroy(w);
  }

  debugThrowMine() {
    throwMine(this.world);
  }

  debugSpawnDrift() {
    spawnDrift(this.world);
  }

  debugGlitch() {
    glitch.kick(1);
    this.world.bossContact = 1.6;
  }

  debugEnding() {
    const w = this.world;
    if (!w.boss) {
      w.boss = new Boss(w.wall.gateCx, w.wall.y + 120);
      w.boss.intro = 1;
    }
    w.boss.dead = true;
    this.onBossDead();
  }
}
