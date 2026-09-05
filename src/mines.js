// Auto-laid mines, in eight kinds. One kind is laid at a time. All eight are
// lobbed onto a random patch of ground, all eight are inert for the whole
// flight — passing straight through anything in the way — and none of them
// does anything until it has settled. Harmless drift never sets one off.
//
// BLAST goes off: one hard bang, damage and knockback, on contact.
// SNARE does not go off. It opens, hauls everything near it into one pinned
//   knot and holds it there. No damage of its own; the damage is the objects
//   grinding against each other, and whatever you put into a pile that cannot
//   move.
// WIRE is the only one that is not a point. It unspools a taut line to either
//   side of itself and cuts anything that crosses it, for as long as that
//   thing stays on the line. Nothing triggers it and nothing consumes it: it
//   is a lane closed until it expires.
// KNELL does not wait to be touched. It counts, and then it tolls where it
//   lies — twice stock, four times with FOURTH BELL — each ring wider and
//   weaker than the last. BLAST punishes what walks into it; this denies the
//   ground whether anything is there or not.
// THORN is not a charge at all. It opens into a patch of burning ground and
//   stays open: nothing sets it off and nothing uses it up.
// LODE holds a field open instead of a line, and pushes everything inside it
//   outward for as long as it lives. No damage of its own either.
// SPALL throws one fan of shot straight up the field on contact, and is
//   spent. Each pellet bursts where it lands.
// VOID deletes the first thing that touches it, whatever its health — except
//   an anomaly's own structure, which is not survivable by design.

import { yardHold, shielded } from './yard.js';
import { CFG } from './config.js';
import { TAU, clamp, rand, spread, rgba, drawGlow, segClosest } from './util.js';
import { applyBlast, ENTRY_Y } from './enemies.js';
import { spark, dot, ring, ripple, shake, flash, Shock } from './fx.js';
import { Patch } from './patch.js';
import { fire } from './projectiles.js';
import { audio } from './audio.js';
import { ledger } from './ledger.js';

const M = CFG.mines;
const S = CFG.snare;
const W = CFG.wire;
const K = CFG.knell;
const T = CFG.thorn;
const L = CFG.lode;
const P = CFG.spall;
const V = CFG.void;

/** Per-kind timings and geometry. Adding a kind is an entry here and a case. */
const KIND = { blast: M, snare: S, wire: W, knell: K, thorn: T, lode: L, spall: P, void: V };

/** What each kind shows on the field. */
/*
 * What each kind shows on the field, and five of these moved in build 217.
 *
 * A mine sits on the field for fifteen seconds and five may be down at once,
 * so its colour is doing more work than almost anything else on the screen --
 * and four of them were wearing a colour that already meant something else:
 *
 *   WIRE  #7cffb2 is HAIL's ability colour, SPLITTER's and HERALD's body, and
 *         TITHE's muzzle. Teal instead, which nothing in the bar uses.
 *   LODE  #59e0ff is the SYSTEM colour -- the HUD, the turret's accent, PULSE
 *         and the TURRET root all wear it. A mine cannot have the chrome's
 *         colour. Azure, a clear step darker and bluer.
 *   VOID  #b388ff sat thirteen degrees from SNARE's violet, and the two are
 *         the pair a player most needs to tell apart: one deletes what walks
 *         in, the other holds it. Indigo, which is its own card's tone.
 *   KNELL #ff5d8f is the AMMUNITION branch root and BLOOM's body. Magenta.
 *   BLAST #ff9f1c is WARDEN's body, and its core #ff2d55 is the game's damage
 *         red -- the wave-reset flash, the breach ring. A step warmer, and a
 *         hot cream core rather than a second red.
 *
 *   SPALL was amber on the field and red on its own chip. The chip wins:
 *   it is the one a player learns the mine by, and BLAST moving to a warmer
 *   amber is what leaves room for it.
 *
 * THORN and SNARE keep theirs: SNARE is deliberately WELL's violet, because
 * the two do the same thing to a crowd, and THORN is deliberately near SPORE,
 * because they leave the same ground.
 */
const TONE = {
  blast: { live: '#ffb247', idle: '#9fb3c8', core: '#ffe6d2' },
  snare: { live: '#c77dff', idle: '#8fa9c4', core: '#e0aaff' },
  wire: { live: '#22ffcf', idle: '#8fa9c4', core: '#eafff8' },
  knell: { live: '#ff61f2', idle: '#9fb3c8', core: '#ffd6e2' },
  thorn: { live: '#c3eb4b', idle: '#8fa9c4', core: '#e6ffe6' },
  lode: { live: '#3fb9ff', idle: '#8fa9c4', core: '#e6f4ff' },
  spall: { live: '#ff4d4d', idle: '#9fb3c8', core: '#ffe0d2' },
  void: { live: '#7383ff', idle: '#8fa9c4', core: '#1a0f2e' },
};

/**
 * How much of the tree a mine of this kind is carrying, 0 to 1.
 *
 * The TURRET branch's eight nodes are eighteen levels of visible STRUCTURE on
 * the drawn machine, and a mine is the only other thing in the game the
 * player buys upgrades FOR and then watches sit on the field. So mines are
 * built the same way: every upgrade that touches a kind changes what it looks
 * like, from its first level, and a mine that has been invested in is
 * visibly a heavier object than one that has not.
 *
 * Read off `world.up` rather than off the ledger, so a node renamed or split
 * changes nothing here -- and so the reading is of what the mine can actually
 * DO rather than of what was bought. Six of these are shared by every kind
 * and one or two are the kind's own; the total is normalised, so a fully
 * bought BLAST (six of six) and a fully bought SPALL (eight of eight) both
 * arrive at 1.
 */
/**
 * The same tally, as its two halves: how many of the upgrades this kind can
 * use are owned, and how many there are.
 *
 * Both are wanted. `mineGrade` is the ratio, which sizes the body; the COUNT
 * is what the collar of marks around it draws, and `drawMines` was
 * reconstructing it as `round(grade * denominator)` off a denominator written
 * out by hand -- `spall ? 8 : blast || thorn ? 6 : 7` -- against the one this
 * function actually computes. It disagreed for six of the eight kinds, so a
 * SNARE with five upgrades available drew seven marks and a WIRE with one
 * drew two. There is one denominator now and it is this one.
 */
function tally(world, kind) {
  const up = world.up;
  if (!up) return { has: 0, of: 1 };
  /*
   * The shared six, MINUS the ones this kind cannot use.
   *
   * The docstring above promises a reading of what the mine can DO, and the
   * first version did not honour it: it counted all six for every kind, so
   * WIDE MOUTH made a THORN look heavier when THORN has no trigger mouth at
   * all, and DEEP CHARGE and SHRAPNEL dressed a LODE that has no blast and
   * does no damage. A mine that grew because of something it cannot use is
   * the readout lying about the machine.
   */
  const mouth = !!KIND[kind].trigger;               // WIDE MOUTH
  /*
   * ...and SALTED gives a blast to the kinds that have none of their own, so
   * once it is owned DEEP CHARGE and SHRAPNEL genuinely do reach them --
   * `fizzle` scales its radius by `up.mineBlast` and its damage by
   * `up.mineDamage`. Without this a LODE with SALTED, DEEP CHARGE and
   * SHRAPNEL all bought wore marks for none of the three that were doing
   * anything to it.
   */
  const bang = kind === 'blast' || kind === 'knell' || kind === 'spall'
    || !!up.mineFizzle;                                                 // DEEP CHARGE
  /*
   * SHRAPNEL is `up.mineDamage`. It is read by `detonate`, `fizzle`, `toll`,
   * SPALL's pellets and their bursts, and -- since build 220 -- THORN's
   * ground. Not by WIRE's cut, which carries `up.wireDamage` of its own and
   * nothing else, so crediting WIRE here would be the readout lying about the
   * machine: the exact fault the note at the top of this function says the
   * accounting was written to stop. (A stale version of this paragraph
   * survived directly above the one that corrected it.)
   */
  const hurts = bang || kind === 'thorn';                               // SHRAPNEL
  let has = 0;
  let of = 2; // PAIRED CHARGE and QUICK LAY reach every kind: both are about
              // how many are on the field, which every mine has.
  if (up.mineSalvo > 0) has++;
  if (up.mineEvery < 1) has++;
  // SALTED gives a spent mine a blast, so it reaches even the kinds that have
  // none of their own -- it is the one that gives a LODE something to do.
  of++;
  if (up.mineFizzle) has++;
  if (mouth) { of++; if (up.mineTrigger > 1) has++; }
  if (bang) { of++; if (up.mineBlast > 1) has++; }
  if (hurts) { of++; if (up.mineDamage > 1) has++; }
  // ...and the ones that are its own.
  const own = {
    snare: [up.mineHold > 1],
    wire: [up.wireDamage > 1],
    knell: [up.mineTolls > 0],
    lode: [up.lodeReach > 1],
    spall: [up.spallPellets > 1, up.spallBurst > 1],
    void: [up.voidReach > 1],
    thorn: [up.patchR > 1],
  }[kind] || [];
  of += own.length;
  for (const b of own) if (b) has++;
  return { has, of };
}

/** How much of the tree a mine of this kind is carrying, 0 to 1. */
export function mineGrade(world, kind) {
  const { has, of } = tally(world, kind);
  return of > 0 ? has / of : 0;
}

/** ...and how many marks the collar draws, which is the numerator itself. */
function mineMarks(world, kind) {
  return tally(world, kind).has;
}

/** ...and what the grade does to how big the thing is drawn. */
function mineScale(world, kind) {
  // A quarter larger fully bought. "Slightly larger" is the brief: a mine
  // that doubled would crowd a field that may hold five of them.
  return 1 + mineGrade(world, kind) * 0.26;
}

class Mine {
  constructor(kind, x0, y0, x1, y1, world0) {
    const k = KIND[kind];
    this.kind = kind;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.x = x0;
    this.y = y0;
    this.r = k.r;
    this.t = 0; // flight progress, 0..1
    this.settle = 0; // seconds since landing
    this.life = M.life;
    this.dead = false;
    this.spin = rand(0, TAU);
    this.hold = 0; // snare only: seconds of grip left once it has opened
    this.open = 0; // snare and wire: eased 0 -> 1 as it comes up
    // wire only: the two ends of the line, set when it lands
    this.ax = x1;
    this.ay = y1;
    this.bx = x1;
    this.by = y1;
    // knell only: tolls left, and the clock to the next one
    this.tolls = kind === 'knell' ? K.tolls + world0.up.mineTolls : 0;
    /*
     * ...and how many it started with. `toll` derived its index as
     * `(K.tolls + up.mineTolls) - m.tolls` -- a LIVE read against a
     * SNAPSHOT -- so buying FOURTH BELL with a knell already on the field
     * shifted every remaining toll's index up and the mine skipped its
     * first, tightest, hardest ring: 100.3 centre damage instead of 139.3,
     * drawn 50% wider than it was owed. The upgrade you had just paid for
     * made the mine you were watching weaker.
     */
    this.tollsMax = this.tolls;
    this.tollTimer = 0;
    /*
     * wire only: the clock its bite runs on. `cut` used to apply
     * `damage * dt` and `shove * dt` every frame, and both halves were
     * wrong for it. `applyDamage` floors a hit at `Math.max(1, ...)`, so a
     * per-frame bite of 79/60 = 1.32 floors on anything with armour over
     * 0.24 and, at 120Hz, on EVERYTHING -- 120 a second against a rated 79,
     * with armour ignored entirely. And the shove pays the repeated-hit
     * fade once per frame, so `kicked` climbed to 9.7 after a second of
     * contact where sustained gunfire settles at 4.25: the wire delivered
     * 17% of its nominal push, ran the OPPOSITE way from its damage across
     * refresh rates, and then quietly disarmed every later shove on that
     * body -- rounds and mine blasts alike -- for up to twenty seconds.
     * Four bites a second, the same rate `Patch` uses and for the same
     * stated reason.
     */
    this.cutT = 0;
  }

  get cfg() {
    return KIND[this.kind];
  }

  get landed() {
    return this.t >= 1;
  }

  get armed() {
    return this.landed && this.settle >= this.cfg.arm && this.hold <= 0;
  }

  /** Snare only: currently holding a knot. */
  get gripping() {
    return this.hold > 0;
  }

  /** Wire only: the line is out and cutting. */
  get cutting() {
    return this.kind === 'wire' && this.landed && this.settle >= W.arm;
  }
}

/**
 * Somewhere in the open field, clear of the turret and well clear of the top.
 *
 * `M.keepTop` of the field is off limits, and that is the whole change here
 * from build 223: the buffer was a flat 70 units off `ENTRY_Y`, which on a
 * field about 630 units deep is a ninth of it, so a mine could land more or
 * less on the line objects come in on. Two things are wrong with that and both
 * are about the mine being wasted rather than about it being unfair. A mine has
 * `flight` and then `arm` before it can do anything -- 1.25 to 1.7 seconds
 * depending on the kind -- so one thrown at the entry line spends its settling
 * time where the wave has not arrived yet and then triggers on the first thing
 * to cross, which is the leading body of a wave that has not gathered. And a
 * KNELL or a SNARE put down there does its work above the top of what is
 * coming, on nothing.
 *
 * A fifth of the field, measured off the field's own depth rather than as a
 * constant, so it stays a fifth on every screen the game is played at.
 */
function landingSite(world) {
  const deep = Math.max(1, world.floorY - ENTRY_Y);
  // ...and never past the wall. `yardHold` is 0 at era 1, which is ENTRY_Y, so
  // this is `Math.max(x, 0)` on a value already at or below the entry line.
  const top = Math.max(ENTRY_Y + deep * M.keepTop, yardHold(world));
  const bottom = world.shooter.y - 130;
  return {
    x: rand(60, world.width - 60),
    y: rand(top, Math.max(top + 80, bottom)),
  };
}

/*
 * The note a mine makes as it is thrown, one per kind.
 *
 * It held four of the eight for three builds -- the four that existed when it
 * was written -- so THORN, LODE, SPALL and VOID were all laid with BLAST's
 * own chime and a player had no way to hear which one had gone out. The
 * fallback is deliberately not any kind's value now, so a ninth kind is
 * audibly unnamed rather than quietly impersonating the first.
 */
const LAY_TONE = {
  blast: 300, snare: 240, wire: 380, knell: 200,
  thorn: 340, lode: 210, spall: 420, void: 160,
};

export function throwMine(world, kind = 'blast') {
  const s = world.shooter;
  const site = landingSite(world);
  /*
   * The ceiling, enforced here rather than at the clock so that anything
   * laying more than one at a time is covered by it too. The oldest goes,
   * and it goes the way its kind goes -- a blast mine bangs, a spall throws,
   * a void closes -- so nothing simply evaporates.
   *
   * `find` is the oldest because the list is spliced rather than swap-popped;
   * see the removal at the bottom of `updateMines`. And the loop is rarely
   * entered in ordinary play: with PAIRED CHARGE capped at one level a throw
   * lays two against a cap of five, so the field peaks at four. It is a
   * backstop, not a mechanism.
   */
  while (laidCount(world) >= M.cap) {
    const oldest = world.mines.find((x) => !x.dead);
    if (!oldest) break;
    retire(world, oldest);
    if (!oldest.dead) oldest.dead = true;
  }
  const m = new Mine(kind, s.x, s.y - 20, site.x, site.y, world);
  if (kind === 'wire') {
    // The line is laid across the field, not along it, so it closes a lane
    // rather than sitting parallel to everything coming down. Kept inside the
    // arena even when the landing site is near an edge.
    const half = Math.min(W.span, world.width / 2 - 30);
    const cx = clamp(site.x, half + 24, world.width - half - 24);
    m.ax = cx - half;
    m.bx = cx + half;
    m.ay = site.y;
    m.by = site.y;
    // The spool has to land on the middle of its own line, not on the landing
    // site it was aimed at — clamping the line moved one and not the other.
    m.x1 = cx;
  }
  world.mines.push(m);
  audio.chime(LAY_TONE[kind] || 270);
}

/**
 * Everything on the field, of any kind.
 *
 * Field-wide rather than per kind: counting per kind would let a player
 * switch round the eight and hold eight caps at once. (Two stale docstrings
 * were stacked here -- one saying it counted a single kind, the other saying
 * nothing expires, against a fifteen-second `life`.)
 */
function laidCount(world) {
  let n = 0;
  for (const m of world.mines) if (!m.dead) n++;
  return n;
}

function detonate(world, m) {
  m.dead = true;
  const br = M.blast.r * world.up.mineBlast;
  applyBlast(world, { x: m.x, y: m.y, r: br, damage: M.blast.damage * world.up.mineDamage, impulse: M.blast.impulse, src: 'blast' });
  /*
   * At the radius, not half again past it.
   *
   * `drawFx` strokes a ring at `alpha = t * 0.95` and `width = w * t`, both
   * running to nothing as it grows, so drawn `m.r -> br * 1.5` it crossed the
   * edge that actually hurt at about a third of its brightness and two pixels
   * wide, then swept another half a radius over bodies nothing touched. Sixth
   * of this family; PULSE, PRISM, DECOY, WELL and HE all ended the same way.
   */
  ring(m.x, m.y, br * 0.78, br * 1.06, 0.4, '#ffb347', 5);
  ring(m.x, m.y, 0, br * 0.5, 0.24, '#ffffff', 2);
  world.effects.push(new Shock(m.x, m.y, br, '#ffb347'));
  ripple(m.x, m.y, 1.4, br * 4);
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU);
    spark(m.x, m.y, Math.cos(a) * rand(200, 620), Math.sin(a) * rand(200, 620), '#ffd166', rand(0.2, 0.5), 2.6);
  }
  flash(0.16, '#ffd9a0');
  shake(9);
  audio.boom();
}

/** A snare opening: it stops being a trigger and starts being a fist. */
function snap(world, m) {
  /*
   * Bounded by what the mine has left to live.
   *
   * `CFG.mines.life` is 15 and its comment calls it a contract nothing may
   * move -- "none of them outlives its quarter minute" -- and the gripping
   * arm of `updateMines` runs the hold down without ever looking at `life`.
   * With DEAD WEIGHT fully bought the hold is 10.8s, so a snare that snapped
   * at 14.9 seconds stood for 25.7 and held a cap slot the whole time.
   */
  m.hold = Math.min(S.hold * world.up.mineHold, Math.max(0.1, m.life));
  // (`m.settle = 0` sat here and nothing could read it: `armed` is
  // `landed && settle >= arm && hold <= 0`, and `hold` is now positive, so
  // the settle term cannot decide anything while a snare is gripping.)
  ring(m.x, m.y, S.reach, m.r * 2, 0.45, '#c77dff', 4);
  ripple(m.x, m.y, 1.1, S.reach * 3);
  shake(6);
  audio.ability('well');
}

/**
 * Drag everything in reach into the middle and pin it. Velocity-driven rather
 * than force-driven, the same way WELL works, so bodies converge instead of
 * slingshotting past each other — and they collide the whole way in, which is
 * where the damage comes from.
 */
function grip(world, m, dt) {
  const blend = clamp(11 * dt, 0, 1);
  const r2 = S.reach * S.reach;
  const take = (list) => {
    for (const e of list) {
      /*
       * `fixed` first: a boss's frame is placed by the boss every frame and
       * `drive` re-zeroes its velocity, so a snare hauling at one is writing
       * into a value that is overwritten before it is integrated -- and the
       * wires were drawn to a knot that could not move.
       *
       * `spent` and `fizzle`, not `staged` -- the rule CLAUDE.md records.
       * `spent` is a boss's own frame through its outro and nothing may act
       * on it; `fizzle` is a body dissolving, and this writes `vx`/`vy` by
       * hand exactly as WELL's knot does, so it is steering and has to
       * honour it. `staged` came OUT: most of a body's march in is on
       * screen, and a snare that visibly fails to take something standing
       * in it is the worse fault.
       */
      if (e.dead || e.spent || e.fizzle || e.type.fixed || shielded(world, e)) continue;
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) continue;
      const d = Math.sqrt(d2);
      // ease off inside the knot so they pack instead of driving through
      const closing = S.pull * Math.min(1, d / 46);
      e.vx += ((dx / d) * closing - e.vx) * blend;
      e.vy += ((dy / d) * closing - e.vy) * blend;
    }
  };
  take(world.enemies);
  take(world.drops);

  if (Math.random() < 0.7) {
    const a = rand(0, TAU);
    const rr = rand(m.r * 2, S.reach);
    dot(m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr,
      -Math.cos(a) * 260, -Math.sin(a) * 260, '#c77dff', 0.35, 2.2);
  }
}

/**
 * A mine reaching the end of it — because its life ran out, or because a newer
 * one needed its place. It goes off the way its kind goes off, so being pushed
 * off the field is not the same as being wasted.
 */
function retire(world, m) {
  if (m.dead) return;
  if (!m.landed || m.settle < m.cfg.arm) { m.dead = true; return; }
  if (m.kind === 'blast') { detonate(world, m); return; }
  if (m.kind === 'spall') { spall(world, m); return; }
  if (m.kind === 'knell') { while (!m.dead && m.tolls > 0) toll(world, m); return; }
  if (m.kind === 'snare' && !m.gripping) {
    /*
     * It snaps and then lets go, in one beat.
     *
     * `retire` is called with the mine about to be marked dead, and
     * `updateMines` has no dead check at the top of its loop -- so an evicted
     * snare entered the gripping arm exactly ONCE, held for a single frame,
     * and was spliced at the bottom of the same iteration. The player got the
     * whole 210-unit closing ring, the shake and the WELL sound, which is the
     * feedback that means a snare has taken a crowd, and nothing was held.
     * The release effects go with it now, so it reads as a grab that could
     * not be kept rather than as a hold that silently did not happen.
     */
    snap(world, m);
    ring(m.x, m.y, m.r * 2, S.reach * 0.8, 0.3, '#8b5cf6', 2);
    for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(180), spread(180), '#c77dff', 0.4, 2);
    audio.pop(0.9);
    return;
  }
  /*
   * THORN, LODE, WIRE and VOID: through `fizzle`, which is what all four
   * already do at end of life and is what SALTED turns into a blast. It was
   * a bare `m.dead = true`, so half the roster was evicted with nothing to
   * show for it -- against this function's own first sentence, "it goes off
   * the way its kind goes off, so being pushed off the field is not the same
   * as being wasted", and against SALTED's row, which promises a spent mine
   * goes off. THORN takes its ground with it the way its own end-of-life arm
   * does. `fizzle` reads `m.dead` back on its first line, so it cannot
   * double-fire.
   */
  if (m.kind === 'thorn' && m.patch) m.patch.retire();
  fizzle(world, m);
  m.dead = true;
}

/** SALTED. A mine that simply ran out still leaves something behind. */
function fizzle(world, m) {
  /*
   * Once. It sets `m.dead` on its first line and had no guard reading it, so
   * anything that could call it twice got two blasts -- and THORN and LODE
   * could call it every frame forever. Cheap, and it is the one door SALTED's
   * blast comes through.
   */
  if (m.dead) return;
  m.dead = true;
  if (world.up.mineFizzle) {
    const f = M.fizzle;
    applyBlast(world, {
      x: m.x, y: m.y, r: f.r * world.up.mineBlast,
      damage: f.damage * world.up.mineDamage, impulse: f.impulse,
      // SALTED's blast is booked to the kind that left it, not to BLAST.
      src: m.kind,
    });
    /*
     * Two faults in one line: drawn 1.3x past the blast, and drawn off the
     * UNSCALED `f.r` while the blast above it is `f.r * up.mineBlast`. At
     * three DEEP CHARGEs the blast reaches 236 and this was drawing 125 --
     * so the same line was 30% too wide at zero upgrades and 47% too narrow
     * at full, which is the one way to be wrong in both directions at once.
     */
    const fr = f.r * world.up.mineBlast;
    ring(m.x, m.y, fr * 0.72, fr * 1.06, 0.32, '#ffb347', 3);
    world.effects.push(new Shock(m.x, m.y, fr, '#ffb347'));
    for (let k = 0; k < 8; k++) spark(m.x, m.y, spread(180), spread(180), '#ffd9a0', 0.35, 1.8);
    audio.boom();
    return;
  }
  for (let k = 0; k < 6; k++) spark(m.x, m.y, spread(50), spread(50), '#6d829a', 0.5, 1.4);
}

/** SPALL. One fan, straight up the field, and the mine is spent. */
function spall(world, m) {
  m.dead = true;
  const base = -Math.PI / 2;
  const n = Math.round(P.pellets * world.up.spallPellets);
  /*
   * SPLINTER: each pellet goes off where it lands.
   *
   * `up.spallBurst` is a MULTIPLIER on the radius, so a fan with the node
   * unowned bursts at the authored 26 and the node widens it -- rather than
   * a level count that has to be turned into a radius at the one site that
   * reads it. The damage is not scaled by it: what SPLINTER sells is reach.
   */
  const B = P.burst;
  const br = B.r * world.up.spallBurst;
  const bd = B.damage * world.up.mineDamage;
  for (let i = 0; i < n; i++) {
    const off = ((i / Math.max(1, n - 1)) - 0.5) * P.spread + spread(0.03);
    fire(world, m.x, m.y - 4, base + off, {
      src: 'spall',
      speed: rand(P.speed[0], P.speed[1]),
      r: 3.4,
      damage: P.damage * world.up.mineDamage,
      impulse: 60,
      bounces: 0,
      life: 0.85,
      color: '#ffd9a0',
      trail: 0.03,
      /*
       * The same form SCATTER and HAIL use, and for the same reason: this
       * fan is fourteen at zero upgrades and thirty-six with BUCKSHOT. The
       * comment below has said since the day it was written that each pellet
       * is deliberately quiet -- and every one of them was falling to
       * `fire`'s DEFAULT muzzle arm, two sparks and a dot apiece, which is up
       * to a hundred and eight particles on one point, and then landing as
       * thirty-six generic hitBursts. Exactly the fault build 219 fixed on
       * HAIL, one file over.
       */
      form: 'pellet',
      /*
       * Fourteen of these go off in one fan, so each one is deliberately
       * quiet: no ring, no shake, no sound of its own. The sum of them is
       * the effect, and one loud pellet would be fourteen loud things.
       */
      burst: (w, x, y) => {
        applyBlast(w, { x, y, r: br, damage: bd, impulse: B.impulse, src: 'spall' });
        // Drawn CONTRACTING, brightest at the edge that hurts. A ring fades
        // and thins as it grows, so `br * 0.3 -> br` put its dimmest, finest
        // frame exactly on the blast radius -- the same trap as the four
        // above, in the one place a Shock apiece would be thirty-six of them.
        ring(x, y, br, br * 0.4, 0.16, '#ffd9a0', 1.4);
      },
    });
  }
  ring(m.x, m.y, m.r, 150, 0.3, '#ff4d4d', 3);
  for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(200), spread(200) - 120, '#ffe0d2', 0.3, 2);
  shake(4);
  audio.boom();
}

/** VOID. Whatever walked into it is simply not there any more. */
function swallow(world, m, e) {
  m.dead = true;
  // Drawn AT the body, which is what it is a picture of. It was centred on
  // the MINE and sized off the BODY, and WIDE MOUTH opens the two as much as
  // 71 units apart -- so the collapse closed on empty ground beside the thing
  // that had actually gone.
  ring(e.x, e.y, e.r * 2.2, 6, 0.42, '#7383ff', 3);
  for (let k = 0; k < 16; k++) {
    const a = rand(0, TAU);
    spark(e.x, e.y, Math.cos(a) * rand(40, 260), Math.sin(a) * rand(40, 260), '#c9a7ff', rand(0.25, 0.5), 2.2);
  }
  /*
   * Destroyed, not damaged: it counts, and it pays.
   *
   * It went through `applyDamage` with `hp + 1e6`, and ARMORED intercepts
   * that BEFORE the plate and before the ward -- "it is not a reduction, the
   * hit did not happen" -- so an armoured body walked onto a VOID, spent it,
   * and walked off untouched, against a row that says "one kill" and "the
   * first thing to touch it is gone, whatever its health". No amount of
   * damage can beat a rule that discards the hit; the answer is not to send
   * a bigger number through the same door but to use the other one.
   * `Enemy.destroy` is the door everything else comes through, and it is
   * where the payout and build 210's fizzle guard both live.
   */
  e.hp = 0;
  // Booked as a KILL and not as damage, because that is what it is: the mine
  // has no damage number and deleting a body through `destroy` never reaches
  // `applyDamage`. Without this the counter reports VOID as doing nothing.
  ledger.kill('void');
  e.destroy(world);
  flash(0.12, '#d9c2ff');
  shake(6);
  audio.boom();
}

/** LODE. Everything in reach is being pushed away, every frame it is up. */
function repel(world, m, dt) {
  const reach = L.reach * world.up.lodeReach;
  const rr = reach * reach;
  for (const e of world.enemies) {
    // The same rule as the snare's grip above: a continuous field that
    // writes velocity is steering, so `spent` and `fizzle` and not `staged`.
    // `shielded` is the wall: a body wholly on the enemy side is not pushed.
    if (e.dead || e.spent || e.fizzle || shielded(world, e)) continue;
    const dx = e.x - m.x;
    const dy = e.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr || d2 < 1) continue;
    const d = Math.sqrt(d2);
    // Hardest at the centre and nothing at all at the rim, so the edge of it
    // is somewhere a body can sit rather than a wall it bounces off.
    const f = (1 - d / reach) * L.push * world.up.lodePush * dt * e.invMass;
    e.vx += (dx / d) * f;
    e.vy += (dy / d) * f;
  }
}

/**
 * WIRE. Everything touching the line is cut for as long as it stays on it, and
 * shoved off the way it was leaning — so a body crossing takes a slice rather
 * than being parked in the beam and ground to nothing.
 *
 * (This docstring sat stranded above `retire`, three functions away, from
 * whenever the two were last moved past each other.)
 */
function cut(world, m, dt) {
  const reach = W.width * m.open;
  /*
   * The span it has actually unspooled, which is what the picture draws.
   *
   * `m.open` ramped the WIDTH and nothing else, so the line cut its whole
   * 300-unit span from the first frame while being drawn creeping out of the
   * middle over `W.open` -- 0.55 seconds -- and on the first frame drawn at
   * no length at all. A body 140 units from the spool was cut by a wire that
   * was not there yet. Same lerp as the draw, off the same `open`.
   */
  const mx = (m.ax + m.bx) / 2;
  const ax = mx + (m.ax - mx) * m.open;
  const bx = mx + (m.bx - mx) * m.open;
  /*
   * The bite runs on its own clock -- see `cutT` in the constructor. The
   * sparks stay per-frame, because they are a picture of contact and not a
   * quantity, and `Math.random() < 12 * dt` is already rate-independent.
   */
  m.cutT -= dt;
  const bite = m.cutT <= 0;
  if (bite) m.cutT = W.tick;
  const take = (list) => {
    for (const e of list) {
      // A damage path: `spent` yes, `staged` no. Grey stays grey.
      if (e.dead || e.spent || e.harmless) continue;
      const hit = segClosest(ax, m.ay, bx, m.by, e.x, e.y);
      const rr = reach + e.r;
      if (hit.d2 > rr * rr) continue;
      const d = Math.sqrt(hit.d2) || 1;
      const nx = (e.x - hit.px) / d;
      const ny = (e.y - hit.py) / d;
      if (bite) {
        e.applyDamage(world, W.damage * world.up.wireDamage * W.tick, nx, ny,
          W.shove * W.tick, 0, 0, false, 'wire');
      }
      if (Math.random() < 12 * dt) {
        spark(hit.px, hit.py, spread(180), spread(180), '#22ffcf', 0.24, 2);
      }
    }
  };
  take(world.enemies);
  take(world.drops);
}

/**
 * KNELL. One toll of `CFG.knell.tolls` plus FOURTH BELL, each wider than the
 * one before and worth less. Two stock, four fully bought -- it said "one of
 * three" from when the base was 3, and the base has been 2 since the node
 * that buys the third back was written.
 */
/**
 * The wait to a knell's next toll. Derived from the SPAN rather than fixed, so
 * however many tolls a mine was laid with, they are spread evenly across the
 * same window -- see `span` in config.js, and the paragraph on `spread` beside
 * it, which is the same shape applied to the radius.
 */
function tollGap(m) {
  const n = Math.max(1, m.tollsMax);
  return n > 1 ? K.span / (n - 1) : K.span;
}

function toll(world, m) {
  const i = m.tollsMax - m.tolls;
  /*
   * Evenly across `spread`, rather than `1 + i * grow` unbounded in `i`.
   * The old form gave FOURTH BELL's two extra tolls to the far end of the
   * ladder, so a node that reads "+1 toll" was also buying a ring two and a
   * half bases wide; see the paragraph on `spread` in config.js. `tollsMax`
   * is what the mine was laid with, so the ladder does not change shape under
   * a mine that is already on the ground.
   */
  const n = Math.max(1, m.tollsMax);
  const t = n > 1 ? i / (n - 1) : 1;
  const r = K.blast.r * (1 + (K.spread - 1) * t) * world.up.mineBlast;
  const damage = K.blast.damage * K.fade ** i * world.up.mineDamage;
  m.tolls--;
  m.tollTimer = tollGap(m);
  applyBlast(world, { x: m.x, y: m.y, r, damage, impulse: K.blast.impulse, src: 'knell' });
  // At the radius, on every toll. It was `r * 1.4`, and a knell draws this
  // two to five times in a row, so the overshoot was the most repeated
  // instance of the fault in the game.
  ring(m.x, m.y, r * 0.76, r * 1.06, 0.42, '#ff61f2', 4);
  world.effects.push(new Shock(m.x, m.y, r, '#ff61f2'));
  ripple(m.x, m.y, 1.1 + i * 0.3, r * 3);
  for (let k = 0; k < 14; k++) {
    const a = rand(0, TAU);
    spark(m.x, m.y, Math.cos(a) * rand(150, 480), Math.sin(a) * rand(150, 480), '#ffb3c8', rand(0.2, 0.45), 2.4);
  }
  flash(0.1 + i * 0.03, '#ffc8d8');
  shake(6 + i * 3);
  audio.boom();
  if (m.tolls <= 0) m.dead = true;
}

export function updateMines(world, dt) {
  const list = world.mines;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.spin += dt * (m.armed ? 2.4 : 0.8);
    if (m.kind === 'wire') {
      // Linear, so it is actually out after W.open seconds rather than easing
      // toward it forever.
      m.open = clamp(m.open + (m.cutting ? dt / W.open : -dt * 4), 0, 1);
    } else {
      m.open += ((m.gripping ? 1 : 0) - m.open) * clamp(dt * 7, 0, 1);
    }

    if (!m.landed) {
      // Inert arc. No collision at all until it comes to rest.
      m.t = Math.min(1, m.t + dt / m.cfg.flight);
      const e = m.t;
      m.x = m.x0 + (m.x1 - m.x0) * e;
      m.y = m.y0 + (m.y1 - m.y0) * e - Math.sin(e * Math.PI) * 120;
      if (m.landed) {
        for (let k = 0; k < 8; k++) {
          spark(m.x, m.y, spread(120), spread(120), '#9fb3c8', 0.3, 1.6);
        }
        audio.thud();
      }
      continue;
    }

      m.settle += dt;
    m.life -= dt;

    if (m.kind === 'thorn') {
      // It is the patch: one is opened the moment it settles and kept in step
      // with the mine, so killing the mine takes the ground with it.
      if (!m.patch && m.settle >= T.arm) {
        m.patch = new Patch(m.x, m.y, {
          r: T.patch.r * world.up.patchR,
          life: m.life,
          /*
           * SHRAPNEL reaches THORN's ground, which it never has. `mineGrade`
           * has counted `up.mineDamage` for THORN since the accounting was
           * written -- `hurts = bang || thorn || wire` -- so the mine grew a
           * mark and got visibly heavier for an upgrade that touched nothing
           * in it. Measured, THORN's ladder was x1.28 where BLAST's is x3.10
           * and SPALL's x8.61. It is the same fault as SPORE's patch and
           * ARC's chain, on the third of the three.
           */
          dps: T.patch.dps * world.up.mineDamage,
          tone: '#c3eb4b',
        });
        world.effects.push(m.patch);
      }
      if (m.life <= 0) {
        fizzle(world, m);
        if (m.patch) m.patch.dead = true;
      }
      /*
       * ...and NO `continue`. This branch and LODE's below it both ended on
       * one, and the only thing past it is the splice that takes a dead mine
       * off the list -- so THORN and LODE were the two kinds that never left
       * `world.mines`. They stayed, were re-entered every frame with `life`
       * already past zero, and called `fizzle` again on each one: with SALTED
       * bought that is a blast, a ring, a Shock, sixteen sparks and an
       * `audio.boom()` sixty times a second for the rest of the run, from a
       * mine that expired thirty seconds ago. They are `else if` arms of the
       * chain below now, which is where the other six kinds already were.
       */
    } else if (m.kind === 'lode') {
      if (m.settle >= L.arm) repel(world, m, dt);
      if (m.life <= 0) fizzle(world, m);
    } else if (m.kind === 'wire') {
      // Nothing triggers it and nothing consumes it; it runs out its life.
      if (m.cutting) cut(world, m, dt);
      if (m.life <= 0) fizzle(world, m);
    } else if (m.kind === 'knell') {
      // It does not need anything to walk into it. Once armed it is a clock,
      // and it ends itself on the last of its tolls — the life is a backstop
      // behind that, for a knell that never finished settling.
      if (m.settle >= K.arm) {
        m.tollTimer -= dt;
        if (m.tollTimer <= 0) toll(world, m);
      }
      if (!m.dead && m.life <= 0) fizzle(world, m);
    } else if (m.gripping) {
      // Holding. It cannot be re-triggered and it does no damage itself.
      m.hold -= dt;
      grip(world, m, dt);
      if (m.hold <= 0) {
        m.dead = true;
        ring(m.x, m.y, m.r * 2, S.reach * 0.8, 0.3, '#8b5cf6', 2);
        for (let k = 0; k < 10; k++) spark(m.x, m.y, spread(180), spread(180), '#c77dff', 0.4, 2);
        audio.pop(0.9);
      }
    } else if (m.life <= 0) {
      // Ran out rather than being triggered. Nothing to show for it, unless
      // SALTED has been taken.
      fizzle(world, m);
    } else if (m.armed && m.cfg.trigger) {
      // EVENT HORIZON widens VOID's mouth and nothing else's, so it is asked
      // per kind rather than folded into the shared trigger scalar.
      const own = m.kind === 'void' ? world.up.voidReach : 1;
      const reach = m.r + m.cfg.trigger * world.up.mineTrigger * own;
      for (const e of world.enemies) {
        /*
         * Only things that could corrupt the feed can set a mine off -- and
         * this is a CHOOSER, so `staged` belongs here where it does not
         * belong in the damage paths above. `spent` joins it: a boss's frame
         * through its own outro must not spring a mine either.
         */
        if (e.dead || e.harmless || e.staged || e.spent) continue;
        // ...and nothing behind the wall springs one, or a mine laid at the
        // hold line would be spent on a body it could not have damaged.
        if (shielded(world, e)) continue;
        const rr = reach + e.r;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= rr * rr) {
          /*
           * ...except that VOID does not get to delete a boss.
           *
           * It deletes whatever touches it whatever its health, which is the
           * whole of it -- and a boss's frame is `type.fixed`, placed by the
           * boss every frame, so a mine that happened to land inside one
           * would have taken a segment (or a core) out of the choreography in
           * a single frame. Everything else here does damage, which a boss
           * can be built to survive; this one cannot be survived.
           */
          /*
           * ...nor a practice dummy. A dummy is a body that cannot die, so
           * that a rate can be read off it without the reading being cut
           * short; a mine that deletes one would be the one thing on the
           * field able to end the measurement, and it would look like a bug
           * rather than like the rule VOID actually has.
           */
          if (m.kind === 'void' && (e.type.fixed || e.dummy)) continue;
          if (m.kind === 'snare') snap(world, m);
          else if (m.kind === 'spall') spall(world, m);
          else if (m.kind === 'void') swallow(world, m, e);
          else detonate(world, m);
          break;
        }
      }
    }

    if (m.dead) {
      /*
       * Spliced, not swap-removed.
       *
       * The swap wrote the LAST element into slot i, and the eviction above
       * picks `world.mines.find((x) => !x.dead)` -- slot 0. Mines expire in
       * age order, so the oldest was the one that vacated slot 0 and the
       * NEWEST was the one moved into it: "the oldest goes" evicted the mine
       * the player had just watched land, while three older ones sat on. The
       * list is at most five long, so order-preserving removal is free and it
       * restores the invariant the `find` was written against.
       */
      list.splice(i, 1);
    }
  }
}

export function drawMines(ctx, world) {
  for (const m of world.mines) {
    const flying = !m.landed;
    const armed = m.armed;
    const snare = m.kind === 'snare';
    const wire = m.kind === 'wire';
    const knell = m.kind === 'knell';
    const tone = TONE[m.kind];
    // The snare's violet is WELL's, because it does the same thing to a crowd.
    const thorn = m.kind === 'thorn';
    const lode = m.kind === 'lode';
    const spallM = m.kind === 'spall';
    const voidM = m.kind === 'void';
    const live = snare ? m.gripping || armed
      : wire ? m.cutting
        : knell ? m.landed
          : thorn || lode ? m.landed && m.settle >= m.cfg.arm
            : armed;
    const accent = live ? (snare && m.gripping ? tone.core : tone.live) : tone.idle;

    // The grip, drawn first so held bodies sit on top of it.
    if (snare && m.open > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rr = S.reach * m.open;
      drawGlow(ctx, '#8b5cf6', m.x, m.y, rr * 0.9, 0.16 * m.open);
      ctx.strokeStyle = rgba('#c77dff', 0.5 * m.open);
      ctx.lineWidth = CFG.hairline * 1.6;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, TAU);
      ctx.stroke();
      // wires to whatever it has hold of
      ctx.strokeStyle = rgba('#e0aaff', 0.4 * m.open);
      ctx.lineWidth = CFG.hairline;
      ctx.beginPath();
      /*
       * The same set `grip` takes, or the picture is drawing a hold the snare
       * does not have -- `drops` included, which it used to leave out. Both
       * lists walked in place rather than concatenated: this is a draw path
       * and it runs for every gripping snare, every frame.
       */
      const wire = (e) => {
        if (e.dead || e.spent || e.fizzle || e.type.fixed) return;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 > S.reach * S.reach) return;
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(e.x, e.y);
      };
      for (const e of world.enemies) wire(e);
      for (const e of world.drops) wire(e);
      ctx.stroke();
      ctx.restore();
    }

    // LODE's reach. It has no trigger ring to borrow, and a push you cannot
    // see the edge of is a push you cannot use.
    if (lode && live) {
      const rr = L.reach * world.up.lodeReach;
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 2.2 + m.spin);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      /*
       * No ambient haze. It was a full-radius drawGlow at a reach that
       * REPULSOR takes past 250 units -- the most expensive thing any mine
       * drew and the least informative, since the dashed ring and the
       * chevrons are what actually say where the push reaches.
       */
      ctx.strokeStyle = rgba('#3fb9ff', 0.24 + pulse * 0.14);
      ctx.lineWidth = CFG.hairline * 1.4;
      ctx.setLineDash([CFG.hairline * 3, CFG.hairline * 7]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      // a few marks running outward, so the direction is not a guess
      ctx.strokeStyle = rgba('#e6f4ff', 0.32 + pulse * 0.22);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + world.time * 0.5;
        const d0 = rr * (0.45 + 0.3 * pulse);
        ctx.moveTo(m.x + Math.cos(a) * d0, m.y + Math.sin(a) * d0);
        ctx.lineTo(m.x + Math.cos(a) * (d0 + 14), m.y + Math.sin(a) * (d0 + 14));
      }
      ctx.stroke();
      ctx.restore();
    }

    // The line, drawn before the body so the anchor sits on top of it.
    if (wire && m.open > 0.01) {
      const t = m.open;
      const mx = (m.ax + m.bx) / 2;
      const ax = mx + (m.ax - mx) * t;
      const bx = mx + (m.bx - mx) * t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      // A wide soft pass and a hard core, so it reads as taut rather than drawn
      for (const [w2, alpha] of [[W.width * 2, 0.1 * t], [W.width * 0.8, 0.32 * t], [CFG.hairline * 1.4, 0.95 * t]]) {
        ctx.strokeStyle = rgba('#22ffcf', alpha);
        ctx.lineWidth = w2;
        ctx.beginPath();
        ctx.moveTo(ax, m.ay);
        ctx.lineTo(bx, m.by);
        ctx.stroke();
      }
      // the two ends it is strung between
      for (const ex of [ax, bx]) {
        drawGlow(ctx, '#22ffcf', ex, m.ay, 14, 0.4 * t);
        ctx.strokeStyle = rgba('#eafff8', 0.9 * t);
        ctx.lineWidth = CFG.hairline * 1.6;
        ctx.beginPath();
        ctx.moveTo(ex, m.ay - 9);
        ctx.lineTo(ex, m.ay + 9);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(m.x, m.y);

    /*
     * ---- how much of the tree this one is carrying ----
     *
     * `R` is the DRAWN radius and `m.r` is the physical one -- the trigger
     * mouth, the blast centre and the hit tests all stay on `m.r`, because a
     * mine that got harder to walk into as you bought things would be a
     * balance change wearing a paint job. What grows is the object.
     *
     * `pips` is the same reading as a count, drawn as a collar of marks round
     * the seat: one for every upgrade this kind is carrying. It is the mine's
     * version of the eighteen sockets on the turret -- something you can look
     * at and see what you have put into it.
     */
    // Through `mineScale`, which existed and had no caller: this restated its
    // arithmetic inline, so the exported one was dead and the two could drift.
    const R = m.r * mineScale(world, m.kind);
    const pips = mineMarks(world, m.kind);

    // The countdown to the next toll, drawn as an arc closing on the body.
    if (knell && m.landed && m.tolls > 0) {
      const frac = m.settle < K.arm
        ? clamp(m.settle / K.arm, 0, 1)
        : 1 - clamp(m.tollTimer / tollGap(m), 0, 1);
      ctx.strokeStyle = rgba('#ff61f2', 0.75);
      ctx.lineWidth = CFG.hairline * 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, R * 2.3, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.stroke();
      // one mark per toll it still owes
      ctx.fillStyle = rgba('#ffd6e2', 0.9);
      for (let k = 0; k < m.tolls; k++) {
        ctx.beginPath();
        ctx.arc(-6 + k * 6, -R * 3.1, 1.7, 0, TAU);
        ctx.fill();
      }
    }

    if (armed && m.cfg.trigger) {
      /*
       * The trigger mouth, computed from THE SAME EXPRESSION the trigger test
       * uses -- see the reach above. It was `m.r + cfg.trigger`, with neither
       * WIDE MOUTH nor EVENT HORIZON in it, so a bought-out VOID advertised a
       * mouth a fraction of the one it actually had: a circle that is a
       * promise about where the mine will catch something, drawn in the wrong
       * place. And it is on `m.r` rather than on the drawn radius, because
       * the promise must not move because the body got heavier.
       *
       * It does not breathe any more either. Five mines is the ordinary
       * steady state once QUICK LAY and PAIRED CHARGE are owned, and five
       * dashed circles pulsing out of phase is the busiest thing on a quiet
       * field. The dash turning slowly says "live" without any of that.
       */
      const own = m.kind === 'void' ? world.up.voidReach : 1;
      ctx.strokeStyle = rgba(accent, 0.2);
      ctx.lineWidth = CFG.hairline;
      ctx.setLineDash([CFG.hairline * 4, CFG.hairline * 6]);
      ctx.lineDashOffset = -world.time * 6 - m.spin * 20;
      ctx.beginPath();
      ctx.arc(0, 0, m.r + m.cfg.trigger * world.up.mineTrigger * own, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, R * (flying ? 2.6 : 3.4), flying ? 0.3 : 0.24 + (armed ? 0.3 : 0));
    ctx.globalCompositeOperation = 'source-over';

    /*
     * ---- the seat ----
     *
     * A dark disc under the body with a lit rim, so a mine reads as an object
     * standing ON the field rather than as a glyph drawn into it. It is also
     * what stops the collar below floating: the pips sit on its edge.
     */
    if (!flying) {
      ctx.fillStyle = 'rgba(6,11,20,0.72)';
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.18 + (armed ? 0.14 : 0));
      ctx.lineWidth = CFG.hairline;
      ctx.stroke();
      /*
       * ...and the collar. One mark per upgrade this kind is carrying, so the
       * first mine upgrade bought is visible on the very next mine laid --
       * which is the whole of what was asked for. Spaced round the seat from
       * the top, clockwise, so a run of them reads as a gauge filling.
       */
      for (let i = 0; i < pips; i++) {
        const a = -Math.PI / 2 + (i / Math.max(6, pips)) * TAU;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ctx.strokeStyle = rgba(tone.core, 0.55 + (armed ? 0.3 : 0));
        ctx.lineWidth = CFG.hairline * 1.8;
        ctx.beginPath();
        ctx.moveTo(c * R * 1.72, sn * R * 1.72);
        ctx.lineTo(c * R * 2.05, sn * R * 2.05);
        ctx.stroke();
      }
    }

    ctx.rotate(m.spin);
    ctx.fillStyle = 'rgba(10,16,26,0.94)';
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = CFG.hairline * 1.6;

    if (wire) {
      // a spool: a ring with the line running out of both sides of it
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 1.5, 0);
      ctx.lineTo(R * 1.5, 0);
      ctx.stroke();
    } else if (knell) {
      // a bell: a body that rings rather than a shell that bursts
      ctx.beginPath();
      ctx.moveTo(-R, R * 0.75);
      ctx.quadraticCurveTo(-R * 0.95, -R * 0.9, 0, -R);
      ctx.quadraticCurveTo(R * 0.95, -R * 0.9, R, R * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, R * 0.75, R * 0.26, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else if (thorn) {
      // a burr: a small core with spines out of it in every direction
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.45, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.moveTo(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45);
        ctx.lineTo(Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5);
      }
      ctx.stroke();
    } else if (lode) {
      // two rings and a gap: something with a field around it
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.85, 0.5, Math.PI - 0.5);
      ctx.moveTo(Math.cos(Math.PI + 0.5) * R * 0.85, Math.sin(Math.PI + 0.5) * R * 0.85);
      ctx.arc(0, 0, R * 0.85, Math.PI + 0.5, TAU - 0.5);
      ctx.stroke();
    } else if (spallM) {
      /*
       * A wedge, facing the way it will throw -- which means it must not
       * turn. Everything else on a mine spins on `m.spin`, and this rode
       * along with it while the fan itself always leaves straight up the
       * field (`spall` fires on a fixed base bearing), so the one part of the
       * drawing that is a PROMISE about direction was the one part pointing
       * somewhere else. The seat, the glow, the dashed mouth and the pip
       * collar are all drawn before this and go on turning.
       */
      ctx.rotate(-m.spin);
      ctx.beginPath();
      ctx.moveTo(-R, R * 0.5);
      ctx.lineTo(R, R * 0.5);
      ctx.lineTo(R * 0.5, -R * 0.9);
      ctx.lineTo(-R * 0.5, -R * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * R * 0.45, -R * 0.9);
        ctx.lineTo(i * R * 0.7, -R * 1.7);
      }
      ctx.stroke();
    } else if (voidM) {
      // a hole: filled dark, ringed bright, with nothing inside it
      ctx.fillStyle = 'rgba(6,4,14,0.98)';
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = rgba(accent, 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.55, 0, TAU);
      ctx.stroke();
    } else if (snare) {
      // four jaws, splayed open once it has hold of something
      const spread2 = 0.34 + m.open * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.42, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.moveTo(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42);
        ctx.lineTo(Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25);
        ctx.lineTo(Math.cos(a + spread2) * R * 1.7, Math.sin(a + spread2) * R * 1.7);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // spikes appear once it is live
      if (armed) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.5;
          ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.lineTo(Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5);
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = rgba(live ? tone.core : '#9fb3c8',
      flying ? 0.5 : 0.4 + 0.6 * Math.abs(Math.sin(world.time * 5)));
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Cadence for whichever kind is selected. One kind is laid at a time, so there
 * is one clock; switching kinds mid-run leaves whatever is already on the
 * field, since nothing expires: the cap is field-wide, so laying a new kind
 * pushes the old ones off one at a time rather than all at once.
 */
/**
 * One clock for every kind. Two things in the tree reach it: PAIRED CHARGE
 * widens the throw and QUICK LAY shortens the wait between throws, and either
 * on its own is a way to put more on the field than the old steady state of
 * one. The cap and the life are still nobody's to move.
 */
export function mineCadence(world, timer, dt) {
  const kind = world.mine;
  if (!kind || world.phase === 'boot') return timer;
  const next = timer - dt;
  if (next > 0) return next;
  const n = 1 + world.up.mineSalvo;
  for (let i = 0; i < n; i++) throwMine(world, kind);
  return M.throwEvery * world.up.mineEvery;
}
