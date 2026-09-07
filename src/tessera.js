/*
 * ============================= TESSERA (IX) ================================
 *
 * The ninth anomaly, and the second of the two past the change. Gate rung 54.
 *
 * ---- what it does that the eight do not ----
 *
 * AXIOM takes things away from YOU. This one takes away the FIELD.
 *
 * It tiles the ground BETWEEN you and it -- `ahead` down the field from its own
 * core -- and a tile it has laid is ground your rounds do not cross. The core
 * is always reachable and the LINE to it is not,
 * so what you are managing is a corridor you keep having to re-cut: shoot a
 * tile and it lifts, and the next pass lays another somewhere else. It is the
 * only anomaly whose body is the space between you and it.
 *
 * ---- and it is ONE mechanism, not two ----
 *
 * A tile is an ordinary body. What stops a round is the same projectile sweep
 * that stops one on anything else -- there is no second collision system and
 * no special case anywhere in `updateProjectiles`. A tile is simply a thing
 * with a lot of surface and no interest in coming to you, which is a shape the
 * physics already supports; the design is a body table entry and a placement
 * rule, and that is the whole of it.
 *
 * That matters more than it sounds. A "wall your shots cannot cross" written
 * as its own test in the projectile loop would be a ninth thing every round,
 * mine, blast, beam and ability had to be taught about -- the exact shape
 * CLAUDE.md records for `spent`, `shielded` and `staged`, each of which cost a
 * build to get right across every damage path. This one costs nothing because
 * it is not new.
 *
 * ---- the corridor has to be CUTTABLE, which is a number ----
 *
 * A tile is 300hp against a slab of fifteen. If the whole slab stood between
 * you and the core the fight would be a wall of 4,500hp with a boss behind it,
 * which is not a corridor, it is a door. The slab is laid `cols` x `rows` on a
 * pitch WIDER than a tile's own diameter, so it is a lattice with gaps rather
 * than a surface -- you are cutting a line through it, not demolishing it.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { ring, ripple, spark, shake, flash } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Enemy } from './enemies.js';
import { Boss } from './boss.js';

const T = () => CFG.tessera;

const ARRIVAL = [
  { text: 'THE GROUND IS BEING SURVEYED.', hold: 3.0 },
  { text: 'IT IS DECIDING WHICH OF IT IS STILL YOURS.', hold: 4.6 },
  { text: 'IT WILL NOT COME TO YOU. IT DOES NOT HAVE TO.', hold: 3.8 },
  { text: 'TESSERA', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE GROUND IS OPEN.', hold: 2.8 },
  { text: 'EVERY LINE ACROSS IT IS YOURS AGAIN.', hold: 4.0 },
  { text: 'IT NEVER MOVED. IT ONLY DECIDED.', hold: 3.6 },
];

/* Deep violet-red: the second of the dark register the ninth shares with the
 * eighth, and rotated far enough from its gold that the two read as a pair
 * rather than as a repeat. */
const MOODS = [
  { top: '#12040a', mid: '#2e0a1c', low: '#070103', line: '#8c2f5a', neb: ['#54132f', '#3e0d23', '#460f27'], accent: '#c2477f' },
  { top: '#1c0610', mid: '#460f27', low: '#0b0206', line: '#b03a6e', neb: ['#75204a', '#54132f', '#602043'], accent: '#ff7ab0' },
  { top: '#280a18', mid: '#621436', low: '#100309', line: '#d44a86', neb: ['#a02a63', '#75204a', '#8a2456'], accent: '#ffa8cc' },
  { top: '#3c1024', mid: '#9c1f57', low: '#1c0610', line: '#ffa8cc', neb: ['#d43a7e', '#a02a63', '#bc3070'], accent: '#ffffff' },
];

export class Tessera extends Boss {
  constructor(world) {
    super(world, 9);
    const C = T();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.arriving = C.arrive;

    this.driftT = 0;
    this.layT = C.lay.every;

    this.core = this.body('tessera', this.x, this.y);
    world.enemies.push(this.core);

    /*
     * The lattice. Every berth is a place a tile CAN be, and it is laid once
     * up front and then re-laid a couple at a time -- so the slab is never
     * whole after the first minute and never empty either, which is what makes
     * it a corridor to keep open rather than a wall to knock down.
     */
    this.berths = [];
    for (let r = 0; r < C.rows; r++) {
      for (let c = 0; c < C.cols; c++) {
        this.berths.push({
          dx: (c - (C.cols - 1) / 2) * C.pitch,
          dy: (r - (C.rows - 1) / 2) * C.pitch + C.ahead,
          tile: null,
        });
      }
    }
    this.tiles = [];
    for (const b of this.berths) this.layAt(world, b);
    this.place(0);

    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  parts() {
    return this.tiles;
  }

  /** How much of the ground it has laid is still down. */
  shellFrac() {
    const down = this.berths.filter((b) => b.tile && !b.tile.dead).length;
    return down / this.berths.length;
  }

  gauge() {
    const C = T();
    const arriving = this.arriving > 0;
    const d = dressOf(9);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: [{ label: 'GROUND', seg: this.berths.length, frac: this.shellFrac() }],
      marks: [
        { at: C.stageCore, past: !arriving && this.coreFrac <= C.stageCore },
        { at: C.stageOpen, past: !arriving && this.coreFrac <= C.stageOpen },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /** Put a tile in a berth, if that berth is empty. */
  layAt(world, b) {
    if (b.tile && !b.tile.dead) return false;
    const p = this.body('tile', this.x + b.dx, this.y + b.dy);
    b.tile = p;
    this.tiles.push(p);
    world.enemies.push(p);
    return true;
  }

  /**
   * Re-tile. It fills the emptiest ground first, which is the whole reason the
   * corridor has to be RE-cut: cutting a line and leaving it is exactly the
   * shape this looks for.
   */
  relay(world) {
    const C = T();
    /*
     * A berth that was cut recently is not re-laid, however empty it is. Read
     * the note on `regrow` in config.js: without it the front of a lane comes
     * back on the very next pass, and a corridor you cannot stand in is a
     * door -- measured, a whole fight in which the core took zero damage.
     */
    const empty = this.berths.filter((b) => (!b.tile || b.tile.dead) && !(b.cut > 0));
    if (!empty.length) return;
    /*
     * Nearest to the machine first. A random fill would re-tile the far edge
     * as often as the lane you just opened, and the fight would have no
     * pressure in it -- what makes this a corridor is that the ground it wants
     * back most is the ground you just took.
     */
    empty.sort((a, b) => (
      Math.hypot(this.x + a.dx - world.shooter.x, this.y + a.dy - world.shooter.y)
      - Math.hypot(this.x + b.dx - world.shooter.x, this.y + b.dy - world.shooter.y)
    ));
    let laid = 0;
    for (const b of empty) {
      if (laid >= C.lay.n) break;
      if (!this.layAt(world, b)) continue;
      laid++;
      ring(b.tile.x, b.tile.y, 4, 40, 0.34, TYPE_BY_ID.tile.color, 2.4);
    }
    if (laid) audio.chime(320);
  }

  /**
   * A tile that has gone throws a SHARD. This is what cutting the corridor
   * costs: the line opens and something comes down it.
   */
  shed(world) {
    for (const b of this.berths) {
      if (!b.tile || !b.tile.dead || b.shed) continue;
      b.shed = true;
      // ...and the ground it stood on is open, and stays open. See `regrow`.
      b.cut = this.stage >= 2 ? T().regrowII : T().regrow;
      /*
       * `claim(new Enemy(...))` and NOT `this.body(...)`. `body` builds
       * STRUCTURE -- it sets `mass = Infinity`, `invMass = 0`, `cruise = 0`
       * and `accel = 0`, which is right for a tile bolted to the survey and
       * wrong for anything meant to come at you: a shard built that way cannot
       * steer, cannot be shoved, and is not marked `ofBoss`, so the ending's
       * `takeMinions` walks straight past it. Measured: four shards still
       * flying after the outro, in a game whose suite has a case for exactly
       * that.
       */
      const e = this.claim(new Enemy(TYPE_BY_ID.shard, b.tile.x, b.tile.y,
        { staged: false, spawnIn: 0.2 }));
      const a = Math.atan2(world.shooter.y - e.y, world.shooter.x - e.x) + rand(-0.4, 0.4);
      e.vx = Math.cos(a) * 70;
      e.vy = Math.sin(a) * 70;
      world.enemies.push(e);
      for (let k = 0; k < 8; k++) {
        const aa = rand(0, TAU);
        spark(e.x, e.y, Math.cos(aa) * rand(90, 300), Math.sin(aa) * rand(90, 300),
          '#ff7ab0', 0.32, 2);
      }
    }
    // ...and a berth that has been re-laid can shed again next time.
    for (const b of this.berths) if (b.tile && !b.tile.dead) b.shed = false;
  }

  /** Where the slab is. It slides, so a cut lane does not stay cut for free. */
  place(dt) {
    const C = T();
    this.driftT += dt * C.driftRate;
    const slide = Math.sin(this.driftT) * C.drift;
    for (const b of this.berths) {
      const p = b.tile;
      if (!p || p.dead) continue;
      p.x = this.x + b.dx + slide;
      p.y = this.y + b.dy;
      p.vx = 0;
      p.vy = 0;
      /*
       * ---- and a tile is GROUND, not a target ---------------------------
       *
       * `staged` is the mark for "may not be CHOSEN", and config.js says in as
       * many words that it never gated projectile collision -- which is
       * exactly the pair this fight needs. Without it the assist prefers a
       * tile to the core every time, because the slab stands `ahead` of the
       * core and is therefore always nearer: measured over a whole fight, the
       * core took 189 of its 8218 while the tiles took 16,618. The player was
       * not cutting a corridor, they were mowing a lawn that grew back, and
       * the boss withdrew on the patience clock having never been hurt.
       *
       * With it, you aim at the CORE and the ground in front of it is what
       * your rounds meet on the way -- which is the sentence at the top of
       * this file, finally true. Re-asserted here rather than set once at
       * `layAt`, because `Enemy.update` clears `staged` on the frame a body
       * passes the entry line and every tile is laid well below it.
       */
      p.staged = true;
    }
  }

  enterStage(world, n) {
    const C = T();
    this.stage = n;
    this.flare = 1;
    if (n >= 2) this.layT = Math.min(this.layT, C.layII);
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'IT IS LAYING FASTER THAN YOU CAN CUT.'
      : n >= 3 ? 'IT HAS STOPPED WAITING FOR THE GROUND TO CLEAR.'
        : 'IT IS RE-SURVEYING.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.tessera.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = T();
    this.t += dt;
    this.tickCommon(world, dt);

    if (this.arriving > 0) {
      this.arriveStep(world, world.dtRaw || dt, C, ARRIVAL, MOODS);
      return;
    }
    this.settle(world);

    if (this.dying > 0) {
      this.dieStep(world, dt, C, OUTRO);
      return;
    }

    this.place(dt);
    this.shed(world);

    /*
     * The berth cooldowns, and the tile roster.
     *
     * `this.tiles` is what `parts()` hands back, and `layAt` pushes to it on
     * every lay -- so over a long fight it grew without bound: measured, 53
     * entries for 15 berths, and every one of them walked by the base's
     * `temper`, its arrest and the ending. Pruned here, which is the one place
     * that runs every frame and knows which are still standing.
     */
    const angry = this.stage >= 2;
    for (const b of this.berths) if (b.cut > 0) b.cut -= dt;
    if (this.tiles.length > this.berths.length) {
      this.tiles = this.tiles.filter((p) => !p.dead);
    }

    this.layT -= dt;
    if (this.layT <= 0) {
      this.layT = angry ? C.layII : C.lay.every;
      this.relay(world);
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (frac <= C.stageCore && want < 3) want = 3;
    if (frac <= C.stageOpen && want < 4) want = 4;
    // The ground being cut open is what takes it out of stage I, so the fight
    // escalates on what the player did rather than only on the clock.
    if (want < 2 && this.shellFrac() <= 0.5) want = 2;
    if (want > this.stage) this.enterStage(world, want);

    const through = 1 - (this.shellFrac() * 0.3 + frac * 0.7);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /**
   * The ending: the ground opens all at once.
   *
   * Every tile still down is marked `spent` rather than destroyed -- the outro
   * is made of the structure, and a slab that vanished on the first frame of
   * it would leave the arrest with nothing to snap off. `spent` is the mark
   * for exactly this and the base's own arrest already honours it.
   */
  dieExtra(world, k) {
    if (k > 0.02 && !this.opened) {
      this.opened = true;
      flash(0.45, '#ffa8cc');
      ring(this.x, this.y, 30, 700, 0.6, TYPE_BY_ID.tessera.glow, 5);
      audio.chime(300);
    }
    for (const b of this.berths) {
      if (b.tile && !b.tile.dead) b.tile.spent = true;
    }
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = T();
    const TY = TYPE_BY_ID.tessera;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;
    const k = CFG.hairline;

    ctx.save();
    this.drawHole(ctx, C, this.t, arriving);

    /*
     * The SURVEY: a hairline box round every berth, laid or not. It is what
     * makes the fight readable -- an empty berth is a lane that is open now
     * and a box that is about to have something in it, and drawing only the
     * tiles would hide the second half of that.
     */
    const slide = Math.sin(this.driftT) * C.drift;
    ctx.strokeStyle = rgba(TY.color, 0.16 * open);
    ctx.lineWidth = k;
    const half = TYPE_BY_ID.tile.r;
    for (const b of this.berths) {
      if (b.tile && !b.tile.dead) continue;
      ctx.strokeRect(this.x + b.dx + slide - half, this.y + b.dy - half, half * 2, half * 2);
    }

    // The core: a heavy plate with the survey's own grid cut across it.
    const R = C.coreR * (1 + this.flare * 0.1);
    ctx.strokeStyle = rgba(TY.color, 0.6 + 0.3 * open);
    ctx.lineWidth = k * 2.4;
    ctx.beginPath();
    ctx.rect(this.x - R * 0.7, this.y - R * 0.7, R * 1.4, R * 1.4);
    ctx.stroke();
    ctx.strokeStyle = rgba(TY.glow, 0.45 * open);
    ctx.lineWidth = k * 1.2;
    for (let i = 1; i < 3; i++) {
      const o = -R * 0.7 + (R * 1.4 * i) / 3;
      ctx.beginPath();
      ctx.moveTo(this.x + o, this.y - R * 0.7);
      ctx.lineTo(this.x + o, this.y + R * 0.7);
      ctx.moveTo(this.x - R * 0.7, this.y + o);
      ctx.lineTo(this.x + R * 0.7, this.y + o);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, TY.glow, this.x, this.y, R * (1.5 + this.flare), 0.24 + 0.3 * open);
    ctx.restore();

    this.drawGhosts(ctx, TY.color);
    ctx.restore();
  }
}

registerAnomaly(9, (world) => new Tessera(world));
