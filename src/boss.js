// ORDINAL. It does not attack. It removes things from you — your sight, your
// aim, your rate of fire — and walks, without hurry, toward the turret. It is
// the last item the simulation has to hand over, and it is numbered.
//
// Three things make it more than a health bar:
//
// THE LEDGER, WORN. It arrives holding the player's five hundred, and while it
// holds them they absorb damage on its behalf: at a full ledger three quarters
// of every hit is soaked, at an empty one none of it is. Damage takes count
// back, and everything it spends is armour it no longer has — so the fight
// opens hard, accelerates as the number comes home, and asks nothing of the
// player's hands. The counter that read 500/500 all run is the thing being
// fought over.
//
// THE REVERSAL. It does not only spawn: it un-kills. REPRISE drags the debris
// of things the player already destroyed back together into whole objects,
// ECHO stands a copy of the player's own turret across the field and shoots
// back with it, and TITHE reaches out and takes reclaimed count back.
//
// SUBTRACTION. It cannot hurt the player, so it removes options: sight, aim,
// rate of fire, and — SUBTRACT — one of the six ability buttons at a time.

import { CFG, ENEMY_TYPES } from './config.js';
import { TAU, clamp, rand, spread, pick, rgba, drawGlow, makeCanvas, smoothstep, segClosest, angleDelta } from './util.js';
import { spark, dot, shard as fxShard, ring, ripple, shake, flash, explode } from './fx.js';
import { Enemy, ENTRY_Y } from './enemies.js';
import { audio } from './audio.js';

const SPRITE = 512;
const SHIELD_R = 22;

// What it spits out. Bulwarks are excluded: they are grinding work, not
// pressure, and the boss fight already asks enough of the player's aim.
const EMITTABLE = ENEMY_TYPES.filter((t) => t.id !== 'bulwark');

/**
 * The arrival, in beats, keyed on `intro` running 0 -> 1. It is deliberately
 * unhurried: the whole point of the sequence is that nothing is coming out of
 * the field for a while and the player has time to read what is.
 */
const INTRO_TIME = 11.5; // seconds from breach to first action
const INTRO = [
  {
    at: 0,
    caption: 'THAT WAS THE LAST OF THE SIMPLE WORK.',
    hold: 3.4,
    run: (b) => { shake(10); ripple(b.x, b.y, 1.4, 520); audio.bossPower(); },
  },
  {
    at: 0.28,
    caption: 'IT HAS BEEN HOLDING YOUR FIVE HUNDRED SINCE THE FIRST ONE.',
    hold: 3.8,
    run: (b) => { ring(b.x, b.y, b.r * 0.3, b.r * 3.4, 0.8, b.palette.ring, 4); shake(8); },
  },
  {
    at: 0.58,
    caption: 'IT WILL NOT GIVE THEM BACK. TAKE THEM.',
    hold: 3.6,
    run: (b, w) => {
      ring(b.x, b.y, b.r * 4, b.r * 0.6, 0.9, b.palette.core, 5);
      ripple(b.x, b.y, 2.2, 900);
      shake(15);
      audio.bossPower();
      w.background.surge(1.6);
    },
  },
  {
    at: 0.88,
    caption: 'ORDINAL · FIRST OF ——',
    hold: 3.2,
    run: (b, w) => {
      flash(0.55, b.palette.core);
      ring(b.x, b.y, b.r, b.r * 7, 1, b.palette.halo, 7);
      ripple(b.x, b.y, 2.8, 1200);
      shake(22);
      audio.boom();
      w.background.surge(2);
    },
  },
];

const PALETTES = [
  { ring: '#ffd98a', spoke: '#fff3c4', iris: '#ffb347', core: '#fffaf0', halo: '#ff9f1c' },
  { ring: '#cbb8ff', spoke: '#efe6ff', iris: '#8b5cf6', core: '#f7f0ff', halo: '#7b2cbf' },
  { ring: '#ff9fb0', spoke: '#ffe1e6', iris: '#ff2d55', core: '#fff0f3', halo: '#ff2d6f' },
];

/*
 * `label` is documentation only — none of it is shown. Every one of these has
 * a whole-screen consequence the player can see happening, and captioning it
 * put a row of text over the boss for the length of the fight.
 */
const POWERS = [
  {
    id: 'reprise',
    label: 'REPRISE · THE DEAD RECONVENE',
    cost: () => CFG.boss.ledger.reprise,
    apply(world, boss) { boss.reprise(world); },
  },
  {
    id: 'echo',
    label: 'ECHO · YOUR TURRET, RETURNED',
    cost: () => CFG.boss.ledger.echo,
    // One at a time: two copies of the player firing at once stops reading as
    // a mirror and starts reading as noise.
    ready: (world, boss) => !boss.echo,
    apply(world, boss) { boss.raiseEcho(world); },
  },
  {
    id: 'tithe',
    label: 'TITHE · IT TAKES SOME BACK',
    cost: () => 0, // this one is a gain, not a spend
    // Only once the player is meaningfully ahead, so it reads as the fight
    // pushing back rather than as the number refusing to move — and never
    // after the ledger is spent, or the chip would say SPENT while the armour
    // quietly came back and reclaim() refused to take it off again.
    ready: (world, boss) => !boss.spentOut
      && world.ledger < CFG.killGoal * CFG.boss.ledger.titheAbove,
    apply(world, boss) { boss.tithe(world); },
  },
  {
    id: 'subtract',
    label: 'SUBTRACT · A BUTTON REMOVED',
    apply(world, boss) { boss.subtract(world); },
  },
  {
    id: 'veil',
    label: 'VEIL · SIGHT WITHDRAWN',
    apply(world) { world.veil = Math.max(world.veil, 7.5); },
  },
  {
    id: 'invert',
    label: 'INVERT · AIM MIRRORED',
    apply(world) { world.invert = Math.max(world.invert, 8.5); },
  },
  {
    id: 'jam',
    label: 'JAM · FEED THROTTLED',
    apply(world) { world.jam = Math.max(world.jam, 8.5); },
  },
  {
    id: 'choir',
    label: 'CHOIR · SHIELDS RAISED',
    apply(world, boss) { boss.raiseChoir(); },
  },
  {
    id: 'recall',
    label: 'RECALL · EVERYTHING RETURNS',
    apply(world, boss) { boss.recall = Math.max(boss.recall, 6.5); },
  },
  {
    id: 'chrono',
    label: 'CHRONO · ROUNDS SLOWED',
    apply(world) { world.chrono = Math.max(world.chrono, 7); },
  },
];

export class Boss {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = CFG.boss.r;
    this.maxHp = CFG.boss.hp;
    this.hp = this.maxHp;
    this.vx = 0;
    this.vy = 0;
    this.dead = false;
    this.intro = 0;
    this.phase = 0;
    this.flash = 0;
    this.spin = 0;
    this.time = 0;
    this.pupil = 0;
    this.recall = 0;
    this.shields = [];
    this.powerTimer = 7.5;
    this.spawnTimer = CFG.boss.firstSpawn;
    this.lastPower = '';
    this.contactCooldown = 0;
    this.sprites = null;
    this.palette = PALETTES[0];
    this.buildSprites();

    // --- the ledger ---
    this.spent = 0; // burned on its own powers
    this.reclaimed = 0; // taken back off it by damage
    this.reclaimBank = 0; // fractional carry, so small hits still count
    this.spentOut = false; // nothing of the player's left
    this.held = 1; // eased fraction of the tally still worn, for drawing
    this.loomTimer = 0;
    this.looming = false;

    // --- arrival ---
    // A staged entrance rather than a fade-in: the breach lights, it is
    // hauled through, the rings assemble around it, and only then does it
    // start acting. `intro` runs 0 -> 1 across the whole sequence.
    this.introStage = -1;

    // --- reversal mechanics ---
    this.reprises = [];
    this.echo = null;
    this.echoBolts = [];

    // static as far as the object solver is concerned
    this.invMass = 0;
    this.mass = Infinity;
    this.restitution = 0.9;
    this.friction = 0.2;
    this.angle = 0;
    this.av = 0;
    this.cruise = 0;
  }

  get hpFrac() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get recallActive() {
    return this.recall > 0;
  }

  get hitColor() {
    return this.palette.core;
  }

  /**
   * How much of a hit actually lands. The player's own count is the armour:
   * a full ledger soaks three quarters of everything, an empty one soaks
   * nothing. No timing, no window — the number on the chip is the shield, and
   * it is worth attacking because attacking it is what brings it down.
   */
  damageScale(world) {
    const held = clamp(world.ledger / CFG.killGoal, 0, 1);
    return 1 - CFG.boss.ledger.armour * held;
  }

  // ------------------------------------------------------------- appearance

  buildSprites() {
    const p = this.palette;
    this.sprites = {
      spokes: buildSpokes(p.spoke),
      ringOuter: buildTickRing(p.ring, 1.3, 72, 0.1, 6),
      ringMid: buildTickRing(p.ring, 1.06, 44, 0.07, 4),
      ringInner: buildGlyphRing(p.iris, 0.84),
      iris: buildIris(p.iris, p.core),
    };
  }

  // ----------------------------------------------------------------- combat

  /**
   * Everything goes through here: bolts, blasts and abilities alike, all
   * scaled by the same armour, so there is one rule to learn and it is
   * visible on the body. Returns the damage that actually landed.
   */
  hurt(world, dmg) {
    if (this.dead || this.intro < 1) return 0;
    dmg *= this.damageScale(world);
    this.reclaim(world, dmg);

    this.hp -= dmg;
    this.flash = Math.min(1, this.flash + dmg / 900);
    this.pupil = Math.min(1, this.pupil + dmg / 2200);

    const nextPhase = this.hpFrac < 0.34 ? 2 : this.hpFrac < 0.67 ? 1 : 0;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.palette = PALETTES[this.phase];
      this.buildSprites();
      ring(this.x, this.y, this.r, this.r * 6, 0.7, this.palette.halo, 6);
      flash(0.4, this.palette.core);
      shake(16);
      ripple(this.x, this.y, 2.2, 900);
      audio.bossPower();
      // The substrate turns over with it, not just the sprite. This is the
      // whole announcement: no banner, because a whole-screen colour change
      // is not something anyone needs told.
      world.background.setMood(['boss', 'boss2', 'boss3'][this.phase]);
      world.background.surge(1.8);
      this.powerTimer = Math.min(this.powerTimer, 1.6);
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU);
        spark(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
          Math.cos(a) * rand(200, 700), Math.sin(a) * rand(200, 700), this.palette.ring, 0.5, 3);
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      world.onBossDead();
    }
    return dmg;
  }

  push(nx, ny, amount) {
    this.vx += nx * amount;
    this.vy += ny * amount;
  }

  // ----------------------------------------------------------------- ledger

  /**
   * Spend from the player's tally. Always succeeds, and clamps: a cost larger
   * than the remainder takes the remainder and empties the ledger. An earlier
   * version refused to overdraw, which stranded a few units above zero
   * forever and meant the spent-ledger endgame could never begin.
   */
  spend(world, amount) {
    if (this.spentOut) return;
    world.ledger = Math.max(0, world.ledger - amount);
    this.spent += amount;
    if (world.ledger <= 0) this.becomeSpent();
  }

  /** Whether it can still pay full price — governs which powers are in the deck. */
  canAfford(world, amount) {
    return this.spentOut || world.ledger >= amount;
  }

  /**
   * Damage takes the count back. Banked as a fraction so a shotgun pellet is
   * worth its share rather than being rounded away, and so the chip only ever
   * moves in whole numbers.
   */
  reclaim(world, dmg) {
    if (this.spentOut || world.ledger <= 0) return;
    this.reclaimBank += dmg * CFG.boss.ledger.reclaimPerDamage;
    const whole = Math.floor(this.reclaimBank);
    if (whole < 1) return;
    this.reclaimBank -= whole;
    const took = Math.min(whole, world.ledger);
    world.ledger -= took;
    this.reclaimed += took;
    world.reclaimed += took;
    if (world.ledger <= 0) this.becomeSpent();
  }

  /** TITHE: it reaches back and takes some of what was reclaimed. */
  tithe(world) {
    if (this.spentOut) return 0; // it has nothing of yours to reach for
    const amount = Math.min(CFG.boss.ledger.tithe, CFG.killGoal - world.ledger);
    if (amount <= 0) return 0;
    world.ledger += amount;
    this.reclaimed = Math.max(0, this.reclaimed - amount);
    world.reclaimed = Math.max(0, world.reclaimed - amount);
    const s = world.shooter;
    for (let i = 0; i < 26; i++) {
      const k = i / 26;
      dot(s.x + spread(70), s.y + spread(70),
        (this.x - s.x) * rand(0.5, 0.9), (this.y - s.y) * rand(0.5, 0.9),
        this.palette.iris, 0.5 + k * 0.3, 2.6);
    }
    ring(s.x, s.y, 180, 10, 0.5, this.palette.iris, 3);
    shake(11);
    audio.bossPower();
    return amount;
  }

  /** Nothing of yours left. It stops rationing and comes on. */
  becomeSpent() {
    if (this.spentOut) return;
    this.spentOut = true;
    this.powerTimer = Math.min(this.powerTimer, 1.2);
    ring(this.x, this.y, this.r, this.r * 8, 1, this.palette.core, 7);
    ripple(this.x, this.y, 2.6, 1100);
    flash(0.5, this.palette.core);
    shake(20);
    audio.bossPower();
  }

  // ---------------------------------------------------------------- arrival

  /**
   * The entrance, in beats. Each stage lands its own sound and effect and
   * hands a caption to the interface, so the fight starts with something
   * happening rather than with a shape appearing at full size.
   */
  updateIntro(world, dt) {
    this.intro = Math.min(1, this.intro + dt / INTRO_TIME);
    const stage = INTRO.findIndex((b, i) => this.intro < (INTRO[i + 1]?.at ?? 2) && this.intro >= b.at);
    if (stage > this.introStage) {
      this.introStage = stage;
      const beat = INTRO[stage];
      if (beat.caption) world.bossCaption(beat.caption, beat.hold ?? 3);
      if (beat.run) beat.run(this, world);
    }

    // matter drawn in through the breach the whole time it is arriving
    if (Math.random() < 0.75) {
      const a = rand(0, TAU);
      const rr = rand(this.r * 1.5, this.r * 4.5);
      spark(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr,
        -Math.cos(a) * rand(180, 420), -Math.sin(a) * rand(180, 420),
        this.palette.ring, 0.55, 2.6);
    }
  }

  // ------------------------------------------------------------------ loom

  /**
   * On station, its presence rewrites the feed on a timer. Shooting it off
   * station stops that — which is the whole exchange now that it no longer
   * advances: keep it pushed clear, or wear the corruption.
   */
  updateLoom(world, dt) {
    const s = world.shooter;
    const reach = CFG.boss.hold + CFG.boss.pushBand;
    const d = Math.hypot(s.x - this.x, s.y - this.y);
    this.looming = d < reach;
    if (!this.looming) { this.loomTimer = 0; return; }

    this.loomTimer -= dt;
    if (this.loomTimer > 0) return;
    this.loomTimer = CFG.boss.loomInterval;
    world.bossContact = CFG.boss.contactGlitch;
    shake(18);
    flash(0.42, this.palette.core);
    ring(s.x, s.y, 10, 460, 0.55, this.palette.halo, 5);
    ripple(this.x, this.y, 1.8, 700);
    audio.bossPower();
    audio.glitchOn();
  }

  /** SUBTRACT: one of the six buttons goes dark for a while. */
  subtract(world) {
    const slot = world.abilities.lockRandom(CFG.boss.subtract, world.unlocked);
    if (slot < 0) return -1;
    // The button going grey is easy to miss mid-fight, so the taking is shown:
    // a pull from ORDINAL and a hit on the button that lost.
    world.abilityTaken(slot);
    ring(this.x, this.y, this.r * 0.5, this.r * 4, 0.5, this.palette.iris, 3);
    audio.reflect();
    return slot;
  }

  // --------------------------------------------------------------- reprise

  /**
   * Kills, running backwards. Fragments already lying on the field are lifted
   * out of the simulation, flown back together, and land as whole objects.
   * Whatever debris is short is made up out of the boss itself, so the effect
   * reads the same on an empty field as on a littered one.
   */
  reprise(world) {
    const cfg = CFG.boss.reprise;
    const want = Math.round(rand(cfg.objects[0], cfg.objects[1]));
    const made = [];

    for (let n = 0; n < want; n++) {
      const type = pick(EMITTABLE);
      // Somewhere between the top of the field and the turret, so the crowd lands in
      // front of the player rather than on top of them.
      const ax = clamp(this.x + spread(cfg.reach), 60, world.width - 60);
      const ay = clamp(this.y + rand(60, cfg.reach * 0.55), ENTRY_Y + 40,
        world.shooter.y - 190);

      const pieces = [];
      // Prefer real debris near the assembly point: those are things the
      // player actually broke, and pulling them back is the point.
      for (let i = world.debris.length - 1; i >= 0 && pieces.length < cfg.perObject; i--) {
        const d = world.debris[i];
        if (d.dead) continue;
        if (Math.hypot(d.x - ax, d.y - ay) > cfg.reach) continue;
        pieces.push({ x: d.x, y: d.y, color: d.type.glow, r: d.r * 0.7 });
        d.dead = true;
        d.dissolved = true; // taken back, not destroyed: it must not count
      }
      while (pieces.length < cfg.perObject) {
        const a = rand(0, TAU);
        const rr = rand(this.r * 0.6, this.r * 1.5);
        pieces.push({ x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr, color: this.palette.ring, r: 4 });
      }

      this.reprises.push({ x: ax, y: ay, type, t: 0, dur: cfg.gather * rand(0.85, 1.15), pieces });
      made.push(type);
      ring(ax, ay, 4, 90, 0.4, this.palette.core, 2);
    }
    audio.reflect();
    return made.length;
  }

  updateReprises(world, dt) {
    for (let i = this.reprises.length - 1; i >= 0; i--) {
      const rp = this.reprises[i];
      rp.t += dt;
      const k = clamp(rp.t / rp.dur, 0, 1);
      if (k < 1) {
        if (Math.random() < 0.35) {
          const p = pick(rp.pieces);
          spark(p.x + spread(14), p.y + spread(14), spread(60), spread(60), p.color, 0.3, 1.6);
        }
        continue;
      }

      this.reprises.splice(i, 1);
      // The field is still capped: a reprise that would overfill it simply
      // finishes as a flourish and puts nothing down.
      if (world.enemies.length >= CFG.maxEnemies) {
        ring(rp.x, rp.y, 40, 4, 0.3, this.palette.ring, 2);
        continue;
      }
      world.enemies.push(new Enemy(rp.type, rp.x, rp.y, {
        vx: spread(70),
        vy: rand(20, 90),
        spawnIn: 0.55,
      }));
      ring(rp.x, rp.y, 70, 6, 0.35, rp.type.glow, 3);
      ring(rp.x, rp.y, 8, 120, 0.45, this.palette.core, 2);
      for (let k2 = 0; k2 < 10; k2++) {
        spark(rp.x, rp.y, spread(220), spread(220), rp.type.glow, 0.45, 2.2);
      }
      audio.pop(1.4);
    }
  }

  drawReprises(ctx) {
    for (const rp of this.reprises) {
      const k = clamp(rp.t / rp.dur, 0, 1);
      const ease = k * k * (3 - 2 * k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // the seam the pieces are being pulled toward
      const seam = 1 - Math.abs(1 - k * 2);
      ctx.strokeStyle = rgba(this.palette.core, 0.5 * seam);
      ctx.lineWidth = 1.6;
      for (const p of rp.pieces) {
        const px = p.x + (rp.x - p.x) * ease;
        const py = p.y + (rp.y - p.y) * ease;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(rp.x, rp.y);
        ctx.stroke();
        drawGlow(ctx, p.color, px, py, p.r * (2.4 + ease * 2), 0.5 + ease * 0.5);
      }
      drawGlow(ctx, this.palette.core, rp.x, rp.y, 10 + ease * 46, ease * 0.8);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ echo

  /**
   * A copy of the player's own turret, across the field. The player's
   * turret is fixed at the centre, so mirroring its x would stand the copy
   * exactly behind ORDINAL where nobody would ever see it — it goes to
   * whichever side ORDINAL is not on instead.
   */
  raiseEcho(world) {
    const right = this.x < world.width / 2;
    // Clear of the drawn rings, not just the body: they read out to about
    // 1.5 radii. The arena is narrow, so the vertical offset does most of the
    // separating — an earlier version clamped it back up toward the boss and
    // the copy vanished into the halo.
    const top = ENTRY_Y;
    // On a narrow field the horizontal offset alone is not enough to clear the
    // boss's spokes, so the vertical floor is pushed down until the pair are
    // genuinely separated — the health ring is the only signal it can be
    // destroyed and it must not sit inside the halo.
    const ex = clamp(world.width * (right ? 0.85 : 0.15), 92, world.width - 92);
    const need = this.r * 1.85;
    const dx2 = (ex - this.x) ** 2;
    const minDy = Math.sqrt(Math.max(0, need * need - dx2));
    this.echo = {
      x: ex,
      y: clamp(this.y + Math.max(this.r * 1.9, minDy),
        top + 130, top + (world.shooter.y - top) * 0.62),
      aim: Math.PI / 2,
      life: CFG.boss.echo.life,
      hp: CFG.boss.echo.hp,
      maxHp: CFG.boss.echo.hp,
      r: CFG.boss.echo.bodyR,
      flash: 0,
      fire: 0.9,
      born: 0,
      recoil: 0,
    };
    ring(this.echo.x, this.echo.y, 6, 220, 0.6, this.palette.core, 4);
    shake(9);
    audio.bossPower();
  }

  /**
   * The copy takes damage like anything else and can be shot apart. Killing it
   * also kills whatever it had in the air, so the reward is immediate and
   * obvious without anything having to say so.
   */
  hurtEcho(world, dmg) {
    const e = this.echo;
    if (!e || e.born < 1) return 0;
    e.hp -= dmg;
    e.flash = Math.min(1, e.flash + dmg / 160);
    if (e.hp <= 0) this.breakEcho(world, true);
    return dmg;
  }

  breakEcho(world, destroyed) {
    const e = this.echo;
    if (!e) return;
    const n = destroyed ? 26 : 14;
    for (let i = 0; i < n; i++) {
      fxShard(e.x, e.y, spread(destroyed ? 460 : 300), spread(destroyed ? 460 : 300),
        this.palette.ring, 0.7, 8, 4);
    }
    ring(e.x, e.y, destroyed ? 8 : 40, destroyed ? 300 : 4, 0.5, this.palette.core, 4);
    if (destroyed) {
      explode(e.x, e.y, e.r * 1.4, this.palette.core, this.palette.halo, 1.1);
      shake(14);
      audio.boom();
      // its rounds go with it
      for (const b of this.echoBolts) {
        for (let i = 0; i < 5; i++) spark(b.x, b.y, spread(200), spread(200), this.palette.ring, 0.3, 2);
      }
      this.echoBolts.length = 0;
    } else {
      audio.pop(1.2);
    }
    this.echo = null;
  }

  updateEcho(world, dt) {
    const cfg = CFG.boss.echo;
    const e = this.echo;
    if (e) {
      e.born = Math.min(1, e.born + dt * 2.2);
      e.life -= dt;
      e.flash = Math.max(0, e.flash - dt * 3);
      e.recoil = Math.max(0, e.recoil - dt * 4);
      const s = world.shooter;
      const want = Math.atan2(s.y - e.y, s.x - e.x);
      e.aim += clamp(angleDelta(e.aim, want), -2.4 * dt, 2.4 * dt);

      e.fire -= dt;
      if (e.fire <= 0 && e.born >= 1) {
        e.fire = cfg.interval * rand(0.85, 1.15);
        e.recoil = 1;
        this.echoBolts.push({
          x: e.x + Math.cos(e.aim) * 34,
          y: e.y + Math.sin(e.aim) * 34,
          vx: Math.cos(e.aim) * cfg.speed,
          vy: Math.sin(e.aim) * cfg.speed,
          life: 6,
          spin: 0,
        });
        audio.shot();
      }
      if (e.life <= 0) this.breakEcho(world, false);
    }

    // --- its rounds ---
    const s = world.shooter;
    for (let i = this.echoBolts.length - 1; i >= 0; i--) {
      const b = this.echoBolts[i];
      b.life -= dt;
      b.spin += dt * 6;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let gone = b.life <= 0 || b.x < -40 || b.x > world.width + 40 || b.y > world.floorY + 40;

      // Shot down. The player's own rounds are the counter to the player's
      // own turret, which is the joke, so the intercept radius is generous.
      if (!gone) {
        for (const p of world.projectiles) {
          if (p.dead) continue;
          const c = segClosest(p.x - p.vx * dt, p.y - p.vy * dt, p.x, p.y, b.x, b.y);
          const rr = cfg.intercept + p.r;
          if (c.d2 <= rr * rr) {
            p.dead = true;
            gone = true;
            for (let k = 0; k < 8; k++) {
              spark(b.x, b.y, spread(240), spread(240), this.palette.core, 0.35, 2.2);
            }
            ring(b.x, b.y, 3, 54, 0.26, this.palette.core, 2);
            audio.reflect();
            break;
          }
        }
      }

      // Landing on the turret. It cannot hurt the player — it corrupts the
      // feed and throws the barrel, which is worse than damage would be.
      if (!gone && Math.hypot(b.x - s.x, b.y - s.y) < s.r + cfg.r) {
        gone = true;
        world.bossContact = Math.max(world.bossContact, cfg.glitch);
        s.aim += spread(cfg.knock);
        s.targetAim = s.aim;
        shake(12);
        flash(0.3, this.palette.halo);
        ring(s.x, s.y, 8, 240, 0.4, this.palette.halo, 4);
        audio.glitchOn();
      }

      if (gone) {
        this.echoBolts[i] = this.echoBolts[this.echoBolts.length - 1];
        this.echoBolts.pop();
      }
    }
  }

  drawEcho(ctx) {
    const cfg = CFG.boss.echo;
    const p = this.palette;
    const e = this.echo;
    if (e) {
      const k = e.born;
      const fade = clamp(e.life / 2, 0, 1);
      const hpf = clamp(e.hp / e.maxHp, 0, 1);

      // A ring around it that empties as it is shot apart — the only thing
      // saying "this can be destroyed", and it says it without words. Drawn ON
      // the hit radius, not outside it: at 1.5x, bolts visibly crossed the ring
      // and registered nothing, which taught the opposite of what it means.
      // It appears only once the copy is solid, because until then shots do
      // pass straight through.
      if (k >= 1) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = rgba(p.ring, 0.22);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ff4d6d', 0.9);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r, -Math.PI / 2, -Math.PI / 2 + TAU * hpf);
        ctx.stroke();
        if (e.flash > 0.01) {
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, '#ffffff', 0, 0, e.r * 2.2, e.flash * 0.8);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.aim + Math.PI / 2);
      ctx.scale(k, k);
      ctx.globalAlpha = fade;

      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, p.halo, 0, 0, 70, 0.4 * fade);
      ctx.globalCompositeOperation = 'source-over';
      // drawGlow leaves globalAlpha at 1, so the fade has to be re-applied or
      // the body stays fully solid while its ring fades out under it
      ctx.globalAlpha = fade;

      // an upside-down turret: same silhouette, wrong colours, wrong way up
      ctx.fillStyle = 'rgba(6,3,12,0.9)';
      ctx.strokeStyle = rgba(p.ring, 0.9);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(p.core, 0.85);
      ctx.fillRect(-4.5, -34 - e.recoil * 5, 9, 22);
      ctx.strokeStyle = rgba(p.iris, 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(0, 44);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 50, 8, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.echoBolts) {
      drawGlow(ctx, p.halo, b.x, b.y, cfg.r * 3.4, 0.8);
      ctx.strokeStyle = rgba(p.core, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = b.spin + (i / 3) * TAU;
        const x = Math.cos(a) * cfg.r;
        const y = Math.sin(a) * cfg.r;
        if (i === 0) ctx.moveTo(b.x + x, b.y + y); else ctx.lineTo(b.x + x, b.y + y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  raiseChoir() {
    const n = 6;
    for (let i = 0; i < n; i++) {
      this.shields.push({
        a: (i / n) * TAU,
        dist: this.r * 1.95,
        hp: 300,
        maxHp: 300,
        life: 17,
        born: 0,
      });
    }
  }

  /** Nearest shield hit by the segment, or null. */
  castShields(ax, ay, bx, by, pr) {
    let best = null;
    let bestT = 2;
    const rr = SHIELD_R + pr;
    for (const s of this.shields) {
      if (s.hp <= 0) continue;
      const sx = this.x + Math.cos(s.a) * s.dist;
      const sy = this.y + Math.sin(s.a) * s.dist;
      const c = segClosest(ax, ay, bx, by, sx, sy);
      if (c.d2 <= rr * rr && c.t < bestT) { bestT = c.t; best = s; }
    }
    return best ? { t: bestT, shield: best } : null;
  }

  // ----------------------------------------------------------------- update

  update(world, dt) {
    if (this.dead) return;
    this.time += dt;
    this.spin += dt * 0.22;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.pupil = Math.max(0, this.pupil - dt * 0.7);
    this.recall = Math.max(0, this.recall - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.updateReprises(world, dt);
    this.updateEcho(world, dt);

    // the tally shell, eased so it thins visibly rather than stepping
    const heldNow = clamp(world.ledger / CFG.killGoal, 0, 1);
    this.held += (heldNow - this.held) * clamp(dt * 2.6, 0, 1);

    if (this.intro < 1) {
      this.updateIntro(world, dt);
      return;
    }

    // --- shields ---
    for (let i = this.shields.length - 1; i >= 0; i--) {
      const s = this.shields[i];
      s.born = Math.min(1, s.born + dt * 1.8);
      s.a += dt * 0.5;
      s.life -= dt;
      if (s.hp <= 0 || s.life <= 0) {
        const sx = this.x + Math.cos(s.a) * s.dist;
        const sy = this.y + Math.sin(s.a) * s.dist;
        for (let k = 0; k < 8; k++) {
          fxShard(sx, sy, spread(280), spread(280), this.palette.ring, 0.6, 6, 4);
        }
        ring(sx, sy, 4, 60, 0.25, this.palette.core, 2);
        audio.pop(0.7);
        this.shields.splice(i, 1);
      }
    }

    this.updateLoom(world, dt);

    // --- movement: it holds a station, it does not advance ---
    // The only reason it ever moves toward the turret is to close a gap the
    // player opened by shooting it. Past its station it eases to a stop, and
    // it can never come nearer than `hold` — so there is no creep to out-race
    // and no way for it to end up on top of the barrel.
    const s = world.shooter;
    let dx = s.x - this.x;
    let dy = s.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const over = d - CFG.boss.hold; // how far it has been pushed off station
    // Eases in over the last stretch so it settles rather than bumping the
    // clamp, and is worth nothing at all once it is home.
    const closing = clamp(over / 40, 0, 1);
    const drift = CFG.boss.approach * (1 + this.phase * 0.22)
      * (this.spentOut ? CFG.boss.ledger.spentApproach : 1) * closing;
    this.vx += (dx * drift - this.vx) * clamp(1.1 * dt, 0, 1);
    this.vy += (dy * drift - this.vy) * clamp(1.1 * dt, 0, 1);
    const damp = Math.exp(-1.15 * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const topLimit = ENTRY_Y + this.r * 0.35;
    // The hard floor. Straight up is the shortest line to the turret, so a
    // clamp on y alone guarantees the centre-to-centre distance as well.
    const bottomLimit = s.y - CFG.boss.hold;
    this.x = clamp(this.x, this.r * 0.6, world.width - this.r * 0.6);
    if (this.y < topLimit) { this.y = topLimit; this.vy = Math.max(this.vy, 0); }
    if (this.y > bottomLimit) { this.y = bottomLimit; this.vy = Math.min(this.vy, 0); }

    // --- powers ---
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      const span = CFG.boss.powerInterval;
      const scale = this.spentOut ? CFG.boss.ledger.spentPowerScale : 1;
      this.powerTimer = (span[0] + (span[1] - span[0]) * (this.phase / 2)) * rand(0.85, 1.15) * scale;
      this.castPower(world);
    }

    // --- it keeps producing objects, because that is what it is for ---
    // Held right back at first: the opening of the fight is the player and
    // ORDINAL and nothing else, and the field only thickens as it wakes up.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const ease = CFG.boss.earlySpawnScale;
      const scale = ease + (1 - ease) * (this.phase / 2);
      this.spawnTimer = CFG.boss.spawnInterval * scale * rand(0.8, 1.2);
      this.emit(world);
    }
  }

  castPower(world) {
    const ledger = CFG.boss.ledger;
    const costOf = (p) => (p.cost ? p.cost() : ledger.power);
    // Anything it cannot pay for is simply not in the deck this time, so the
    // fight thins out toward the end of the reserve. Once the ledger is spent
    // it stops rationing entirely and everything is back on the table.
    const options = POWERS.filter((p) => p.id !== this.lastPower
      && (!p.ready || p.ready(world, this))
      && this.canAfford(world, costOf(p)));
    if (!options.length) return;

    const power = pick(options);
    this.spend(world, costOf(power));
    this.lastPower = power.id;
    power.apply(world, this);
    ring(this.x, this.y, this.r * 0.6, this.r * 5, 0.6, this.palette.halo, 4);
    flash(0.22, this.palette.iris);
    shake(7);
    audio.bossPower();
  }

  emit(world) {
    if (world.enemies.length >= CFG.maxEnemies) return;
    const n = 2 + this.phase;
    this.spend(world, CFG.boss.ledger.emit * n);
    for (let i = 0; i < n; i++) {
      const type = pick(EMITTABLE);
      const a = rand(Math.PI * 0.1, Math.PI * 0.9);
      const px = this.x + Math.cos(a) * this.r * 0.9;
      const py = this.y + Math.sin(a) * this.r * 0.9;
      const e = new Enemy(type, px, py, {
        vx: Math.cos(a) * rand(80, 190),
        vy: Math.sin(a) * rand(80, 190),
        spawnIn: 1,
      });
      world.enemies.push(e);
      ring(px, py, 2, 40, 0.3, this.palette.ring, 2);
    }
  }

  /** The long, loud way out. */
  detonate(world) {
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU);
      const rr = rand(0, this.r);
      explode(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, this.r * 0.5, this.palette.ring, this.palette.halo, 2);
    }
    for (let i = 0; i < 90; i++) {
      const a = rand(0, TAU);
      fxShard(this.x, this.y, Math.cos(a) * rand(120, 720), Math.sin(a) * rand(120, 720),
        this.palette.ring, rand(1, 2.4), rand(4, 18), 4);
    }
    ring(this.x, this.y, this.r, Math.hypot(world.width, world.height) * 1.4, 1.1, this.palette.core, 8);
    ring(this.x, this.y, this.r, this.r * 5, 0.6, '#ffffff', 4);
    ripple(this.x, this.y, 3, 1400);
    flash(1, '#ffffff');
    shake(26);
    audio.boom();
  }

  // ------------------------------------------------------------------- draw

  draw(ctx) {
    const p = this.palette;
    const intro = smoothstep(clamp(this.intro, 0, 1));
    const scale = 0.18 + intro * 0.82;
    const size = this.r * 3.4 * scale;
    const half = size / 2;
    const breathe = 1 + Math.sin(this.time * 1.1) * 0.02;

    ctx.save();
    ctx.translate(this.x, this.y);

    // halo
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, p.halo, 0, 0, this.r * 3.6 * scale, 0.4 + this.flash * 0.4 + Math.sin(this.time * 2) * 0.05);

    const layer = (img, rot, alpha, s = 1, ox = 0, oy = 0) => {
      ctx.save();
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      const hs = half * s * breathe;
      ctx.drawImage(img, ox - hs, oy - hs, hs * 2, hs * 2);
      ctx.restore();
    };

    const sp = this.sprites;
    layer(sp.spokes, this.spin * 0.6, 0.5 + 0.12 * Math.sin(this.time * 1.7), 1.06);
    // chromatic ghosting on the rings
    layer(sp.ringOuter, -this.spin * 1.5, 0.28, 1, -2.5, 0);
    layer(sp.ringOuter, -this.spin * 1.5, 0.28, 1, 2.5, 0);
    layer(sp.ringOuter, -this.spin * 1.5, 0.85);
    layer(sp.ringMid, this.spin * 2.4, 0.8);
    layer(sp.ringInner, -this.spin * 3.6, 0.85);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // body
    const bodyR = this.r * scale * breathe;
    const g = ctx.createRadialGradient(0, -bodyR * 0.2, bodyR * 0.05, 0, 0, bodyR);
    g.addColorStop(0, 'rgba(12,6,20,0.2)');
    g.addColorStop(0.7, 'rgba(6,3,12,0.86)');
    g.addColorStop(1, 'rgba(2,1,6,0.96)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    layer(sp.iris, this.spin * 1.1, 0.9, 1);

    // pupil: a hole that constricts as it is hurt
    ctx.globalCompositeOperation = 'source-over';
    const pupilR = bodyR * (0.3 - this.pupil * 0.1 + Math.sin(this.time * 0.9) * 0.02);
    ctx.fillStyle = '#02010a';
    ctx.beginPath();
    ctx.arc(0, 0, pupilR, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(p.core, 0.95);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, pupilR, 0, TAU);
    ctx.stroke();
    drawGlow(ctx, p.core, 0, 0, pupilR * 1.3, 0.55 + this.flash);

    // The armour, worn. A shell of tally marks around the body that thins as
    // the count comes home: the one honest readout of what a hit is currently
    // worth, and it lives on the thing being shot rather than in the HUD.
    if (this.held > 0.005) {
      const marks = 60;
      const shellR = bodyR * 1.3;
      ctx.strokeStyle = rgba(p.core, 0.18 + this.held * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < marks; i++) {
        if (i / marks > this.held) continue;
        const a = (i / marks) * TAU - this.spin * 0.7;
        const len = bodyR * 0.12;
        ctx.moveTo(Math.cos(a) * shellR, Math.sin(a) * shellR);
        ctx.lineTo(Math.cos(a) * (shellR + len), Math.sin(a) * (shellR + len));
      }
      ctx.stroke();
      drawGlow(ctx, p.core, 0, 0, shellR * 1.6, 0.12 * this.held);
    }

    // wings
    ctx.strokeStyle = rgba(p.ring, 0.42);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + this.time * 0.15;
      const rr = bodyR * (1.55 + 0.14 * Math.sin(this.time * 2 + i));
      ctx.beginPath();
      ctx.arc(0, 0, rr, a - 0.34, a + 0.34);
      ctx.stroke();
    }

    if (this.flash > 0.01) {
      ctx.globalAlpha = clamp(this.flash, 0, 1) * 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, bodyR, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // shields
    for (const s of this.shields) {
      const sx = this.x + Math.cos(s.a) * s.dist;
      const sy = this.y + Math.sin(s.a) * s.dist;
      const hpf = clamp(s.hp / s.maxHp, 0, 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(s.a + Math.PI / 2 + this.time);
      ctx.scale(s.born, s.born);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, p.ring, 0, 0, 34, 0.35 * hpf);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(p.core, 0.5 + hpf * 0.5);
      ctx.fillStyle = rgba(p.iris, 0.2 * hpf);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - Math.PI / 2;
        const x = Math.cos(a) * SHIELD_R;
        const y = Math.sin(a) * SHIELD_R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // spiral of returning motes while RECALL is up
    if (this.recallActive && Math.random() < 0.5) {
      const a = rand(0, TAU);
      const rr = rand(this.r * 2, this.r * 5);
      dot(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, -Math.cos(a) * 200, -Math.sin(a) * 200, p.ring, 0.6, 2.4);
    }

    this.drawReprises(ctx);
    this.drawEcho(ctx);
  }
}

// ----------------------------------------------------------- sprite baking

function spriteCtx() {
  const c = makeCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  g.translate(SPRITE / 2, SPRITE / 2);
  return { c, g, R: SPRITE / 3.4 };
}

function buildSpokes(color) {
  const { c, g, R } = spriteCtx();
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const long = i % 4 === 0;
    const r0 = R * 0.92;
    const r1 = R * (long ? 1.52 : 1.24);
    const w = long ? 0.016 : 0.007;
    const grad = g.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    grad.addColorStop(0, rgba(color, 0.85));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
    g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.closePath();
    g.fill();
  }
  return c;
}

function buildTickRing(color, radius, ticks, tickLen, every) {
  const { c, g, R } = spriteCtx();
  const r = R * radius;
  g.strokeStyle = rgba(color, 0.4);
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.stroke();

  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU;
    const long = i % every === 0;
    const len = R * tickLen * (long ? 2 : 1);
    g.strokeStyle = rgba(color, long ? 0.95 : 0.5);
    g.lineWidth = long ? 3.2 : 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * (r - len / 2), Math.sin(a) * (r - len / 2));
    g.lineTo(Math.cos(a) * (r + len / 2), Math.sin(a) * (r + len / 2));
    g.stroke();
  }
  return c;
}

function buildGlyphRing(color, radius) {
  const { c, g, R } = spriteCtx();
  const r = R * radius;
  const n = 18;
  g.strokeStyle = rgba(color, 0.85);
  g.lineWidth = 2.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.save();
    g.rotate(a);
    g.translate(r, 0);
    g.rotate(Math.PI / 2);
    const s = R * 0.07;
    g.beginPath();
    switch (i % 4) {
      case 0: g.moveTo(-s, -s); g.lineTo(s, 0); g.lineTo(-s, s); break;
      case 1: g.arc(0, 0, s, 0.4, Math.PI - 0.4); break;
      case 2: g.moveTo(-s, -s); g.lineTo(s, s); g.moveTo(s, -s); g.lineTo(-s, s); break;
      default: g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(0, -s); g.lineTo(0, s);
    }
    g.stroke();
    g.restore();
  }
  return c;
}

function buildIris(color, core) {
  const { c, g, R } = spriteCtx();
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r0 = R * (0.3 + Math.random() * 0.05);
    const r1 = R * (0.55 + Math.random() * 0.28);
    const grad = g.createLinearGradient(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    grad.addColorStop(0, rgba(core, 0.55));
    grad.addColorStop(1, rgba(color, 0));
    g.strokeStyle = grad;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  }
  g.strokeStyle = rgba(core, 0.5);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, R * 0.3, 0, TAU);
  g.stroke();
  return c;
}
