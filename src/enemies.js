// The objects. Each one is a physics body with a steering brain, a way to die
// and a hand-drawn look. Nothing here knows about the rest of the game beyond
// the `world` handle it is given.

import { CFG, WAVES, TYPE_BY_ID, ROUTES, massOf, kB } from './config.js';
import { traitsFor, traitAt, has as hasTrait, TRAIT_BY_ID } from './traits.js';
import { TAU, clamp, rand, spread, pick, weightedPick, rgba, drawGlow, smoothstep, segClosest } from './util.js';
import { explode, hitBurst, impactFx, deathFx, spark, dot, shard as fxShard, ring, ripple, haul, edgeHit } from './fx.js';
import { audio } from './audio.js';
import { shed } from './debris.js';
import { contactAt } from './physics.js';
import { ledger } from './ledger.js';
import { drawDummy, dummyHit } from './dummy.js';
import { shielded } from './yard.js';
import { throughMouth, mouthSlots, entryLine, portalBirth, portalDepth, rimUnder } from './portal.js';
import { ARSENAL } from './arsenal.js';

/*
 * Every round and every mine, by the key each already books its damage under.
 * DERIVED from the arsenal rather than written out, so a new round or mine is
 * in it by existing -- the failure mode this replaces is a hand-kept list that
 * misses whatever was added after it was written.
 *
 * Abilities are deliberately absent: they are not ammo, and the ruling names
 * ammo and mines. So are contact, PILE and the DECOY's blast. And the filter
 * is not decoration -- `ARSENAL` carries nineteen entries, not seventeen: the
 * strip's AUTO AIM and AUTO FIRE toggles sit in the same table under
 * `kind: 'auto'`, and neither is a weapon.
 */
const POWERED = new Set(ARSENAL
  .filter((a) => a.kind === 'round' || a.kind === 'mine')
  .map((a) => a.key));

/**
 * The two damage sources the wall does NOT stand between, written as the
 * COMPLEMENT of the player's list on purpose.
 *
 * The rule is "nothing the player does reaches a body entirely on the far
 * side of the wall", and a hand-kept list of player sources is exactly the
 * shape CLAUDE.md warns about: the next round, mine or ability added would be
 * absent from it and would therefore be the one thing able to shoot through a
 * wall. Enumerating what is NOT the player's fails the other way -- a new
 * source is guarded by default, and the worst a miss can do is stop something
 * that should have been allowed.
 *
 * `contact` is two bodies grinding against each other, which is theirs and
 * happens on their side all the time; `bloom` is a BLOOM taking its
 * neighbours with it, which is theirs too.
 */
const ENEMY_SRC = new Set(['contact', 'bloom']);

/**
 * The top of the visible field, in world units. Objects are queued above it
 * and are not in play — not targetable, not collidable, not counted — until
 * they have come all the way down past it.
 */
export const ENTRY_Y = 0;

/**
 * The thing a body is going at instead of the turret, or null for the turret.
 *
 * `!isDrop` because a mote is not fooled by a decoy, it is ENERGY, and this
 * branch had no guard where both its neighbours do. A mote steers at 132 with
 * accel 300 against `collectData`'s 26 u/s^2 pull toward the turret, so the
 * steering won outright: pressing DECOY stopped loose energy arriving at all
 * for up to nine seconds, gathered it three hundred units up-field, and then
 * threw it outward with the decoy's own parting blast. Worst with INTAKE,
 * which only banks what touches the machine.
 *
 * One function because two places ask -- the steering target and the loiter
 * clock, which was measuring to the turret while the body walked at the decoy.
 */
function decoyTarget(world, body) {
  if (body.isDrop) return null;
  return world.decoy && !world.decoy.dead ? world.decoy : null;
}

/**
 * A specimen portrait for the glossary, drawn with the same shape routines the
 * field uses so the two can never drift apart. Centred on the current
 * transform; `r` is the radius to draw at.
 */
export function drawSpecimen(ctx, id, r) {
  const t = TYPE_BY_ID[id];
  ctx.save();
  ctx.lineWidth = 1.6;
  if (!t) {
    ctx.strokeStyle = rgba('#ffd98a', 0.95);
    ctx.fillStyle = 'rgba(6,3,12,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffd98a', 0.6);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
      ctx.lineTo(Math.cos(a) * r * (i % 4 === 0 ? 1.42 : 1.24), Math.sin(a) * r * (i % 4 === 0 ? 1.42 : 1.24));
    }
    ctx.stroke();
    ctx.fillStyle = '#02010a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba('#fffaf0', 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.strokeStyle = rgba(t.color, 0.95);
  ctx.fillStyle = rgba(t.glow, 0.16);
  switch (t.shape) {
    case 'shard': drawShard(ctx, r); break;
    case 'needle': drawNeedle(ctx, r); break;
    case 'tally': drawTally(ctx, r, 1); break;
    case 'ordinal': drawOrdinal(ctx, r, 0, 0, 1); break;
    case 'digit': drawDigit(ctx, r, 0, 0); break;
    case 'dial': drawDial(ctx, r, 1); break;
    case 'gnomon': drawGnomon(ctx, r, 0, 0, 1); break;
    case 'second': drawSecond(ctx, r, 0, 0); break;
    case 'mite': drawTri(ctx, r, 1, 0); break;
    case 'fraction': drawTri(ctx, r, 1, 1); break;
    case 'fractal': drawTri(ctx, r, 1, 2); break;
    case 'crest': drawCrest(ctx, r, 1); break;
    case 'amplitude': drawAmplitude(ctx, r, 0, 0, 1); break;
    case 'droplet': drawDroplet(ctx, r, 0, 0); break;
    case 'pylon': drawPylon(ctx, r, 1); break;
    case 'dynamo': drawDynamo(ctx, r, 0, 0, 1); break;
    case 'ion': drawIon(ctx, r, 0, 0); break;
    case 'pane': drawPane(ctx, r, 1); break;
    case 'parity': drawParity(ctx, r, 0, 0, 1); break;
    case 'echo': drawEcho(ctx, r, 0, 0); break;
    case 'bound': drawBound(ctx, r, 1); break;
    case 'terminus': drawTerminus(ctx, r, 0, 0, 1); break;
    case 'axiom': drawAxiom(ctx, r, 0, 0, 1); break;
    case 'clause': drawClause(ctx, r, 1); break;
    case 'lemma': drawLemma(ctx, r, 0, 0); break;
    case 'tessera': drawTessera(ctx, r, 0, 0, 1); break;
    case 'tile': drawTile(ctx, r, 1); break;
    case 'limit': drawLimit(ctx, r, 0, 0); break;
    case 'hex': drawHex(ctx, r); break;
    case 'blob': drawBlob(ctx, r, 0.6, 0); break;
    case 'bloom': drawBloom(ctx, r, 0.4, 0, t); break;
    case 'plated': drawPlated(ctx, r, 1); break;
    case 'plate': drawPlate(ctx, r); break;
    case 'warden': {
      drawWardenCore(ctx, r);
      // the plates are what the entry is about, so they are in the portrait
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ox = ca * r * SHARD_ORBIT * 0.62;
        const oy = sa * r * SHARD_ORBIT * 0.62;
        ctx.moveTo(ox + sa * 6, oy - ca * 6);
        ctx.lineTo(ox - sa * 6, oy + ca * 6);
      }
      ctx.stroke();
      break;
    }
    case 'prism': drawPrism(ctx, r); break;
    case 'herald': drawHerald(ctx, r, 0.5); break;
    case 'glut': drawGlut(ctx, r, 6, 0.5, 0); break;
    case 'tow': {
      drawTowHead(ctx, r * 0.8);
      ctx.strokeStyle = rgba('#8fa9c4', 0.7);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.6);
      ctx.lineTo(0, r * 1.6);
      ctx.stroke();
      break;
    }
    case 'mass': drawTowMass(ctx, r * 0.9, 1); break;
    case 'drift': drawDrift(ctx, r, 0, 0); break;
    case 'ember': drawEmber(ctx, r, 0, 0); break;
    case 'husk': drawHusk(ctx, r, 0, 0); break;
    case 'lantern': drawLantern(ctx, r, 0, 0); break;
    case 'bead': drawBead(ctx, r, 0, 0); break;
    case 'bell': drawBell(ctx, r, 0, 0); break;
    case 'quarry': drawQuarry(ctx, r, 0, 0); break;
    case 'dart': drawDart(ctx, r, 0, 0); break;
    case 'bar': drawBar(ctx, r, 0, 0); break;
    case 'yoke': drawYoke(ctx, r, 0, 0, true); break;
    /*
     * NOSE DOWN in the glossary, which is a different frame from the field.
     * `drawShrike` draws along local +x because `FACES_TRAVEL` writes
     * `angle` from the velocity -- but an icon has no velocity to orient to,
     * so it inherited +x and read as a dart flying sideways, a direction this
     * body never travels. Rendered and looked at, which is the only thing
     * that was going to find it: every other icon here is drawn in its own
     * natural orientation and `#ffd166` is shared with a NEEDLE that points
     * up. `+PI/2` sends local +x to world +y, and canvas y runs DOWN.
     */
    case 'shrike': {
      ctx.save();
      ctx.rotate(Math.PI / 2);
      drawShrike(ctx, r, 0, 0, false);
      ctx.restore();
      break;
    }
    /*
     * ...and FLINT the same way, for the same reason: `drawFlint` draws along
     * local +x because `Enemy.face` points a plated body at the machine, and
     * an icon has no machine to point at. Build 319 shipped it unrotated --
     * the exact fault build 318 fixed one build earlier, reintroduced by
     * copying the draw helper's frame and not its call site.
     */
    case 'flint': {
      ctx.save();
      ctx.rotate(Math.PI / 2);
      drawFlint(ctx, r, 0, 0);
      ctx.restore();
      break;
    }
    case 'scion': drawScion(ctx, r, 0, 0); break;
    case 'seed': drawSeed(ctx, r, 0, 0); break;
    case 'latch': drawLatch(ctx, r, 0, 0); break;
    default: drawShard(ctx, r);
  }
  ctx.restore();
}

/** WARDEN plate geometry — shared by drawing, hit tests and the broadphase. */
const SHARD_ORBIT = 2.15; // multiples of the core radius
export const SHARD_R = 12;

/**
 * What a body is made of.
 *
 * Every hostile in the game was drawn by one recipe -- a 16% fill, a stroke
 * between 55% and 100%, and a line 9% of the radius -- for all thirty-seven
 * shapes, with no exceptions. So the only two things separating a body from
 * any other body on the screen were its hue and its silhouette, and at a full
 * field both saturate: seven hues at the same value and the same optical
 * weight, nothing in front of anything, and no way to pick out the thing that
 * is about to hurt you.
 *
 * Nothing new had to be invented to fix that. The table already knows what
 * each of these weighs -- `density` runs from 0.5 on a SEED to 7 on a PYLON,
 * a fourteen-fold range -- and it already knows which of them are armoured.
 * The draw simply never read either. So weight is where the material comes
 * from: a light thing is nearly hollow with a fine line, a heavy thing is
 * dense with a thick one, and an armoured thing carries a second line inside
 * the first because it is plated.
 *
 * The curve saturates at 2.7, which is BULWARK -- the heaviest thing on an
 * ordinary field. Everything above it is boss structure at 5 to 7, which is
 * a wall and should read as one.
 *
 * Memoised on the type, because this is per-body per-frame and a full field
 * is fifty-seven of them.
 */
export function materialOf(t) {
  /*
   * Memoised per type, and the memo is keyed on the SCALE as well, because
   * `line` is now era-dependent -- see below. A memo that ignored the era
   * would hand era 2 era 1's ladder for the life of the process.
   */
  if (t._mat && t._matAt === CFG.scale) return t._mat;
  const heavy = clamp(((t.density ?? 1) - 0.5) / 2.2, 0, 1);
  t._matAt = CFG.scale;
  t._mat = {
    heavy,
    fill: 0.07 + heavy * 0.3, // 0.07 wisp, 0.37 solid
    /*
     * x radius -- and x the era's scale, which is the whole of build 199's
     * finding arriving from the other direction.
     *
     * A body is stroked at `max(CFG.hairline, r * line)`, and the hairline is
     * a DEVICE-pixel floor: it divides by the zoom, so pulling the camera back
     * raises the floor in world units while `r * line` does not move. Measured
     * at dpr 2, era 2 raises the floor 1.008 -> 1.551 and clamps 9 of the 16
     * field types instead of 4 -- DRIFT, TOW, GLUT, HERALD and PRISM all
     * collapse onto MOTE's outline. The line ladder is authored across 17.3x
     * and a body reads almost entirely as its outline, the fill being 7-9% of
     * its brightness, so that is most of the roster becoming the same object.
     *
     * Scaling `line` with the field holds the ladder against a floor that
     * moved. Era 1 is untouched: `CFG.scale` is exactly 1 there.
     */
    line: (0.062 + heavy * 0.072) * CFG.scale,
    plate: !!t.armor,
  };
  return t._mat;
}

/*
 * Scratch for `Enemy.hitCircleAt`, for the reason `HIT` in projectiles.js is
 * one: a hit resolves thousands of times a fight and this is read on the same
 * line it is returned. Never stored.
 */
const BAR_HIT = { x: 0, y: 0, r: 0 };

export class Enemy {
  constructor(type, x, y, opts = {}) {
    this.type = type;
    this.isDrop = !!opts.drop;
    this.counts = !this.isDrop;

    const r = opts.r || type.r;
    this.r = r;
    this.x = x;
    this.y = y;
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.angle = rand(0, TAU);
    this.av = spread(1.4);

    this.mass = massOf(type, r) * (opts.massScale || 1);
    this.invMass = 1 / this.mass;
    this.restitution = type.restitution ?? 0.6;
    this.friction = 0.3;
    // Energy moves at its own pace and turns at its own rate; a body moves at
    // its type's. See CFG.drop.speed for why they were ever the same thing.
    this.cruise = this.isDrop
      ? CFG.drop.speed * (opts.speedScale || rand(0.9, 1.12))
      : type.speed * (opts.speedScale || rand(0.86, 1.14));
    this.accel = this.isDrop ? CFG.drop.accel : type.accel;

    this.maxHp = Math.round((opts.hp ?? type.hp) * (this.isDrop ? 1 : rand(0.92, 1.1)));
    this.hp = this.maxHp;
    this.armor = type.armor || 0;
    /*
     * What the rung multiplied this body's health by, or 1 if nothing did.
     *
     * Written by `scaleToTier` and nowhere else, because that function is
     * where the FOUR conditions live that decide whether a body is scaled at
     * all (no director, harmless, fixed, a teach wave). Anything else that
     * needs the factor -- a rider's ball, which has to cost more to shoot
     * off at rung 21 than at rung 15 -- asks for it here rather than
     * restating those conditions, which is how two places end up disagreeing
     * about the same question.
     *
     * Declared here rather than sprung into existence at the site that sets
     * it, for the same reason `fizzle`, `placed` and `ignoreT` are.
     */
    this.hpScale = 1;

    this.staged = opts.staged || false; // still above the top of the screen
    /*
     * Seconds left of dissolving out of a simulation that has been stepped
     * back. Declared here rather than sprung into existence at the site that
     * sets it, because `spent` and `dissolved` were both written that way and
     * both are `undefined` on every body that never met the one thing that
     * writes them -- which is how you end up grepping the repo to find out
     * whether a field exists.
     */
    this.fizzle = 0;
    this.attacking = false;
    this.flash = 0;
    this.dead = false;
    this.phase = rand(0, TAU);
    this.lurchTimer = rand(0, 2);

    this.harmless = !!type.harmless;
    if (this.harmless) this.counts = false;
    this.ward = 0; // damage reduction granted by a HERALD
    this.wardT = 0; // lapses unless refreshed
    // GRAFT. A SEED is a harmless body that hunts a host instead of wandering;
    // `grafted` is what it leaves behind, and a grafted body closes its own
    // wounds until something finishes it.
    // Seconds left of being thrown clear, during which it does not steer. The
    // anomalies do the throwing; an offer called EBB used to as well, and that
    // system is gone. Not the build-204 TRAIT of the same name, which is about
    // which way wreckage drifts and never touches this.
    this.thrown = 0;
    // SLUG: seconds left of being exempt from collision damage, in both
    // directions. A SLUG shoves as hard as it ever did and pays out nothing
    // for what it shoves things into — see CFG.rounds.slug.calm.
    this.slugged = 0;
    /*
     * Seconds left of taking no share of a contact -- read by
     * `physics.resolvePair`, which treats a plowing body as infinitely massive
     * against anything that has mass of its own. Only a hurled MASS sets it
     * today, on the same clock as `thrown`, and only against movable bodies:
     * the turret and the DECOY are static and stop it dead.
     */
    this.plow = 0;
    /*
     * A rider, and it is derived from the GAIT rather than from a second
     * flag -- `type.gait === 'ride'` is the one statement, and `ridesOf`
     * then refuses a type that says it rides without saying how. It was
     * `type.id === 'seed'` until build 322, which is the shape build 275 had
     * to correct in `spawnGroup` (a flag two types share is not an id) read
     * the other way round: an id is not a capability either.
     *
     * ---- ...AND SALVAGE IS NOT A RIDER, WHICH COST A MEASUREMENT ---------
     *
     * `shed` builds every mote with `new Enemy(t, ...)` off the PARENT's
     * type, so a mote off a rider inherits `gait: 'ride'` -- and a mote is
     * not `staged`, so it went straight to `hunt`. Measured on a LATCH
     * killed 160 units under a BLOOM: the mote climbed to it and GRAFTED,
     * arming and healing the next body for free out of the salvage of the
     * one you had just killed. `aboard` 1 against 0 for a MOTE's and a
     * LURCHER's motes, which fall toward the turret as they should.
     *
     * Latent for the whole of SEED's life because SEED has `drops: 0` and
     * has never shed one. It is exactly build 307's finding -- "a mote off a
     * DRIFT inherited `harmless` and wandered the band it was made in", the
     * one object whose salvage you had to fetch -- with a far worse payload,
     * and the harmless branch in `drive` has carried its own `!this.isDrop`
     * since then for precisely this reason. Carried HERE rather than at the
     * branch so the capability itself is right: a mote's `rideT` is 0 and it
     * is not offered as a host either.
     */
    this.rides = type.gait === 'ride' && !this.isDrop;
    this.rideT = this.rides ? ridesOf(type).life : 0;
    this.host = null;
    /*
     * Balls riding this body. A seed that reaches a host used to dissolve into
     * it: the host silently became bigger and started healing, and there was
     * nothing to shoot to undo it. Now each one stays, orbiting, as a thing
     * with its own health -- so the boost is always visible, always stackable
     * and always removable. null until the first one lands.
     */
    this.grafts = null;
    this.graftSpin = 0;
    this.graftBaseR = 0; // what the body was before any of them
    this.graftBaseHp = 0;
    this.graftBaseBytes = 0;
    this.graftBaseArmor = 0;
    /*
     * Health a second the whole ring closes, summed in `refreshGrafts` and
     * read once a frame rather than recomputed there. Two riders can be on
     * one host from build 322 and they heal at different rates, so this is a
     * sum over the ring and not `regen * count` -- and the sum belongs where
     * every other consequence of the ring is derived, or it is a second
     * place that can disagree about what is aboard.
     */
    this.graftRegen = 0;
    this.tether = null; // the other half of a TOW, if any
    this.traits = null; // the wave's rules, if it was released by a traited one
    this.plateT = 0; // ARMORED: until the plate turns another hit away
    this.hitAt = 0; // MENDING: when this body was last hurt
    this.hitAt2 = 0; // ...and the time before that, so "twice within" is real
    // What last hit this body and when -- the death wears it if it is fresh.
    // A name from the round's flight form ('flake', 'shell'...), never from
    // an ability, so every kill in the canonical fight stays off the path.
    this.lastHit = null;
    this.lastHitT = -1;
    // Every object picks its own way across the field.
    this.route = opts.route || weightedPick(ROUTES);
    this.routeSide = Math.random() < 0.5 ? -1 : 1;
    this.routeScale = rand(0.7, 1.25);
    this.wanderAngle = rand(0, TAU);
    this.wanderTimer = 0;
    this.stagedFor = 0;
    /*
     * How long this body has been doing its gait, for the two gaits that end
     * on a clock rather than on arriving anywhere. Declared here rather than
     * sprung into existence in `tumble`, for the reason `fan`, `placed` and
     * `fizzle` are. Grepped against the boss modules before being declared,
     * which is build 298's rule: they write their own fields onto the bodies
     * they make and `Enemy.update` runs on those bodies too, so `loose` --
     * the obvious name for a field of this shape -- is GNOMON's.
     */
    this.gaitFor = 0;
    /*
     * The bead AHEAD of this one in a chain, or null for a head. Declared
     * here rather than sprung into existence at the spawn site, for the same
     * reason `fan`, `placed` and `gaitFor` are -- and named `link` because
     * build 298's rule is to grep the boss modules first and `.lead` is
     * taken by src/sandbox.js while `.next` and `.chain` are taken by
     * dynamo.js and projectiles.js. `.link` has no other reader in src.
     */
    this.link = null;
    /*
     * The beam, and the share of the pool this half has absorbed.
     *
     * `beam` is true while this body is half of a YOKE and the beam is
     * intact; the SURVIVOR clears it itself, which is build 310's rule --
     * `Enemy.destroy` is the one door every DAMAGE death comes through and
     * NOT the one door every `dead = true` comes through (six places set it
     * directly), so a partner taken by a fizzle, a boss teardown or the
     * glitch dissolve would leave a beam nobody broke.
     *
     * `took` is what makes WHERE the damage lands matter: the pool is
     * shared, so both halves read the same health, and this is the only
     * record of which of them absorbed it. Declared here rather than sprung
     * into existence at the spawn site, and grepped against the boss modules
     * first (build 298): `.beam` and `.took` have no other reader in src,
     * and `.freed` -- the obvious name for the survivor's flag -- is AXIOM's
     * method and one of FRACTAL's minion fields, which is exactly the
     * collision that cost a suite run.
     */
    this.beam = false;
    this.took = 0;
    /*
     * Which school this body belongs to, or 0 for anything that is not in
     * one. A serial rather than a roster: `spawnSchool` stamps the same
     * number on the fourteen it makes and every one of them finds its own
     * schoolmates by reading it, so nothing owns the school and nothing has
     * to prune it when a body dies -- which is build 310's chain rule, and
     * tessera.js's 53 entries for 15 berths is why it matters. Declared here
     * rather than sprung into existence at the spawn site, and grepped
     * against the boss modules first (build 298): `.shoal` has no other
     * reader in src.
     */
    this.shoal = 0;
    /*
     * Which way a `roll` is crossing the field, flipped when it reaches a
     * side wall. Zero until the first frame of the gait, which picks the
     * side the body has the most room on. Declared here rather than sprung
     * into existence in `rollOn`, for the reason `fan`, `link` and `gaitFor`
     * are -- and grepped against the boss modules first, per build 298.
     */
    this.rollSide = 0;
    /*
     * Where a `dive` body is in its own cycle, which lane it has committed
     * to, and how long it has been in the phase. A state machine belongs on
     * the BODY and declared here, for the reason `fan`, `placed` and
     * `rollSide` are -- and all four names were grepped against the boss
     * modules first, per build 298's `loose`/`p.loose` collision, which took
     * a whole suite run down with no case output at all.
     *
     * `baseCruise` is the body's OWN rolled cruise, kept because the gait
     * writes `this.cruise` per phase: the dive is five times the walk and the
     * climb is three quarters of it, so the authored speed has to survive
     * somewhere. Zero until the first frame of the gait.
     */
    this.divePhase = '';
    this.diveX = 0;
    this.diveT = 0;
    this.diveHeld = 0;
    this.diveSide = 0;
    this.baseCruise = 0;
    /*
     * A lateral held back until the body is loose. DRIFT is the only thing
     * that uses it: at era 2 it is laid inside the throat, and it used to be
     * given its sideways drift at the moment it appeared -- so it fanned out
     * INSIDE the doorway while every hostile went straight down and opened up
     * only once it was past the gate. Declared here rather than sprung into
     * existence at the spawn site, for the reason `placed` and `fizzle` are.
     */
    this.fan = 0;
    /*
     * Whether this body came through the portal, and how long it has been
     * loose since. `born` is what the one-way surface keys on (`edgeEase`):
     * a boss's minion, a debug placement and a field spawn never came
     * through and may stand wherever they stand. `bornFor` is the seconds
     * since birth and blends the route lateral in (`drive`), so a body
     * leaves the rim on the heading it arrived with; it starts large on
     * everything that was never born, so those get their arc at once, and
     * `portalBirth` is the one writer of both.
     *
     * NOT `loose`, which it was for one suite run: GNOMON keeps `p.loose` on
     * its arc pieces -- null, then an object -- and a counter of the same
     * name on every body turned that null into 0.0167 and the boss threw on
     * `p.loose.a`. A new field on Enemy has to be grepped against the boss
     * modules, which write their own fields onto bodies they make.
     */
    this.born = false;
    this.bornFor = 99;
    // Debris used to expire after 22-30s. It does not any more: a fragment
    // carries salvage, and salvage that rots is a clock the player is losing
    // to. The floor drains by being collected instead — pulled into the
    // intake, shot, or blasted.
    this.ttl = 0;
    // Set when it is made, from the parent's mass. Banked whichever way it
    // goes: reaching the turret, or being destroyed.
    this.bytes = opts.bytes || 0;
    // Marks left on a body by the rounds that do not simply hurt it.
    this.chill = 0; // RIME: seconds of being dragged to a crawl
    this.bounty = 1; // TITHE: what its data is worth when it goes
    /*
     * ...and whether a TITHE mark has already been applied to it. Declared
     * here rather than sprung into existence at the site that writes it, for
     * the same reason `placed` and `splits` are: a body must never inherit
     * one. The flag exists because the mark is a MULTIPLIER applied once,
     * not a floor -- see the note at TITHE's `onHit`.
     */
    this.tithed = false;
    this.marks = 0; // ...and how deep the mark is, which is what TITHE rides on
    this.spawnIn = opts.spawnIn ?? 0; // brief materialise animation

    /*
     * Plates, and only on a body.
     *
     * `isDrop` was not checked here, so a WARDEN's energy — built from the
     * WARDEN type like every mote is built from its parent — came out of the
     * constructor carrying three orbiting plates of its own. A four-unit mote
     * was drawn as a three-bladed pinwheel the size of the thing that dropped
     * it, and its hitReach grew to the plates' orbit, so a round aimed past it
     * could be stopped by the phantom plating on a piece of salvage. The
     * screen filled with orange rotors that looked like objects, could not be
     * auto-aimed, and ate shots.
     */
    if (type.shards && !this.isDrop) {
      this.shards = [];
      for (let i = 0; i < type.shards; i++) {
        this.shards.push({ a: (i / type.shards) * TAU, alive: true, hp: 22 });
      }
      this.shardSpin = rand(0.8, 1.6) * (Math.random() < 0.5 ? -1 : 1);
    }
  }

  /**
   * Half the bar's LENGTH, for the one type whose hit profile is a capsule.
   *
   * Derived from `r` and `CFG.cartwheel` rather than stored, so a body whose
   * radius moves (a graft grows one) takes its bar with it -- and so that the
   * DRAWING, the hit test and `hitReach` are reading one owner. See the note
   * at CFG.cartwheel.
   */
  get barHalf() {
    return this.r * CFG.cartwheel.long;
  }

  /** ...and half its thickness, which is the capsule's radius. */
  get barR() {
    return this.r * CFG.cartwheel.thin;
  }

  /**
   * The CIRCLE a hit at (hx, hy) has its contact geometry on.
   *
   * For everything in the game it is the body itself. For a bar it is the
   * capsule's LOCAL circle: a capsule is the set of circles of radius `barR`
   * centred along its axis, so the one the round met is centred at the
   * closest point on that axis -- and every piece of geometry downstream
   * (the impact parameter, the outward normal, the incidence PRISM reads,
   * the spin's lever arm, the burst's position, SPINE's chord) then comes out
   * exact against the real surface with no change of its own.
   *
   * ---- THIS IS THE FIFTH DOOR, and it was open -----------------------
   *
   * `resolveSegment` records the circle its hit test used and builds the
   * contact from it; `takeHit` then computed `contactAt(this, ...)` AGAIN,
   * against the body's own centre and radius. Identical for every round in
   * the game until a body stopped being a circle, and then quietly wrong:
   * the sweep would have had the capsule's geometry and the damage path a
   * disc's. One owner, called from both.
   *
   * The two agree BY CONSTRUCTION rather than by arrangement: `segSeg`
   * returns the mutually-closest pair, so the point on the axis nearest the
   * round's step is also the point nearest that step's own closest point,
   * which is what `hx, hy` is.
   *
   * Returns a module scratch object, the idiom `HIT` in projectiles.js
   * already uses for this hot path -- so it is read immediately and never
   * held. Never returned to anything that stores it.
   */
  hitCircleAt(hx, hy) {
    if (!this.type.bar || this.isDrop) return this;
    const half = this.barHalf;
    const ux = Math.cos(this.angle) * half;
    const uy = Math.sin(this.angle) * half;
    const s = segClosest(this.x - ux, this.y - uy, this.x + ux, this.y + uy, hx, hy);
    BAR_HIT.x = s.px;
    BAR_HIT.y = s.py;
    BAR_HIT.r = this.barR;
    return BAR_HIT;
  }

  /** Radius the plates orbit at, and the reach a projectile must clear. */
  get orbitR() {
    return this.r * SHARD_ORBIT;
  }

  /** Live balls riding this body. */
  get graftCount() {
    if (!this.grafts) return 0;
    let n = 0;
    for (const g of this.grafts) if (g.alive) n++;
    return n;
  }

  /** Kept as a read-only name because half the file asks the question. */
  get grafted() {
    return this.graftCount > 0;
  }

  /** Radius the balls ride at. It follows the body, which the balls grow. */
  get graftR() {
    return this.r * CFG.graft.orbit;
  }

  get hitReach() {
    /*
     * A BAR reaches past its own `r`, which is the whole reason this getter
     * has to know about it: `resolveSegment` rejects a body whose `hitReach`
     * does not cover the round's step before it ever gets to the capsule
     * test, so a bar without this line would be unhittable along exactly the
     * 23 units of itself that stick out -- and hittable in the middle, which
     * would read as the profile working.
     *
     * `isDrop` is checked for the reason the plates block above is: a mote
     * built from a type carrying a capability inherits the capability, and a
     * WARDEN's salvage once came out of the constructor with three orbiting
     * plates and a projectile reach to match.
     */
    if (this.type.bar && !this.isDrop) return this.barHalf + this.barR;
    const core = this.shards ? this.orbitR + SHARD_R : this.r;
    return this.graftCount ? Math.max(core, this.graftR + CFG.graft.ball) : core;
  }

  /*
   * Recompute everything the balls give, from how many are alive.
   *
   * Derived rather than accumulated on purpose: a ball being shot off has to
   * put the body back exactly, and a body whose radius was multiplied on the
   * way up cannot be divided back down without drift. The wound is carried
   * across as a fraction, so losing a ball never kills the host outright and
   * gaining one never heals it.
   */
  refreshGrafts() {
    /*
     * Summed per ball rather than multiplied by the count, because from
     * build 322 the ring can carry two kinds at once and they do not give
     * the same things: a SEED grows its host by a fifth of its radius and
     * heals it 9 a second, a LATCH grows it by nothing and heals it 14 while
     * adding 0.2 to its armour.
     *
     * For a ring of ONE KIND the sum is the old product to the BIT, which is
     * the claim the suite checks -- n additions of the same double and one
     * multiply by an integer n both round the same way here (measured at
     * n = 1, 2 and 3, including the 1.7999999999999998 that 3 x 0.6 gives).
     * So SEED is unchanged by this split, not merely close to unchanged.
     */
    let grow = 0;
    let tough = 0;
    let armor = 0;
    let regen = 0;
    if (this.grafts) {
      for (const g of this.grafts) {
        if (!g.alive) continue;
        grow += g.grow;
        tough += g.tough;
        armor += g.armor;
        regen += g.regen;
      }
    }
    this.r = this.graftBaseR * (1 + grow);
    this.mass = massOf(this.type, this.r);
    this.invMass = 1 / this.mass;
    const frac = this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 1;
    this.maxHp = Math.max(1, Math.round(this.graftBaseHp * (1 + tough)));
    this.hp = Math.max(1, Math.min(this.maxHp, this.maxHp * frac));
    this.bytes = this.graftBaseBytes * (1 + tough);
    /*
     * ...and the armour is a FLAT addition with a ceiling.
     *
     * `applyDamage` computes `dmg * (1 - plate)`, so armour reaching 1 is a
     * body no amount of damage can kill -- and `CFG.graft.stack` is 3, so
     * three riders at 0.2 on a body already at 0.55 would be 1.15. It is
     * clamped here, at the one place that owns the number, and
     * `check-build.mjs` asserts the arithmetic can never reach the clamp in
     * the first place (worst type armour + a full ring of the worst rider),
     * because a ceiling that is actually being hit is a rule nobody
     * authored. `CFG.graft.armorCap` is the value.
     */
    this.armor = Math.min(CFG.graft.armorCap, this.graftBaseArmor + armor);
    this.graftRegen = regen;
  }

  // ------------------------------------------------------------- behaviour

  /** Aimless bodies: a slow random walk with no destination at all. */
  /**
   * Whether STASIS has hold of THIS body. `world.stasis` is one global clock
   * and eleven places in the steering read it; every one of them read it as
   * "the field is frozen", which at era 2 included everything standing behind
   * the wall -- so an ability that is refused at the line was holding the
   * enemy's own yard still. The press already skipped shielded bodies for its
   * one-off damp (abilities.js); the lasting effect did not. One predicate,
   * eleven readers, and the next one is inside it by existing.
   *
   * At era 1 `shielded` is false on its first property read, so this is the
   * comparison it always was.
   */
  frozen(world) {
    return world.stasis > 0 && !shielded(world, this);
  }

  wander(world, dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = rand(1.6, 4.2);
      this.wanderAngle += spread(1.9);
    }
    const slow = this.frozen(world) ? 0.12 : 1;
    const k = (this.accel / 100) * slow * 0.9;
    const D = CFG.drift;
    // A HOVER: the walk is mostly sideways, so a drift that has arrived bobs
    // where it is rather than wandering up out of the band it lives in.
    let dx = Math.cos(this.wanderAngle);
    let dy = Math.sin(this.wanderAngle) * D.hover;

    /*
     * Where it lives: a band across the middle of the field, measured from
     * the portal's rim to the machine so it is the same PLACE on every
     * screen and at either era. Above the band it comes down at `fall` --
     * this is the arrival out of the portal, and it should be quick; below
     * it, knocked there by a shove or a shot, it climbs back at `climb`.
     * Inside, nothing pulls, and the walk is the whole of the motion. The
     * pull ramps over `taper` so the band has a soft edge rather than a
     * wall -- which is what build 78's band was, and why it was taken out.
     * Never back UP through the portal, but that is not this method's rule:
     * the surface is one-way for everything born through it, in `edgeEase`.
     */
    const rim = entryLine(world, ENTRY_Y);
    const span = Math.max(1, world.shooter.y - rim);
    const home = rim + span * D.band;
    const half = span * D.bandHalf;
    const off = this.y - home;
    let pull = 0;
    if (off < -half) pull = clamp((-half - off) / D.taper, 0, 1);
    else if (off > half) pull = -clamp((off - half) / D.taper, 0, 1);
    const urge = Math.abs(pull) * D.sink;
    dx *= 1 - urge;
    dy = dy * (1 - urge) + pull * D.sink;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const pace = pull > 0 ? D.fall : D.climb;
    const cruise = (this.cruise + (pace - this.cruise) * Math.abs(pull)) * slow;

    this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (dy * cruise - this.vy) * clamp(k * dt, 0, 1);
    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  /**
   * RISE: up-field, away from the machine, toward the rim.
   *
   * The first gait in this game that is not an approach. An EMBER comes up
   * off the floor -- the only thing on the field that starts where you are --
   * sways as it climbs, and is gone once it is clear of the portal's rim.
   *
   * It leaves through `fizzle`, which is the dissolve `Enemy.destroy` refuses
   * to cash in, so it pays nothing and counts nothing on the way out. That is
   * what "gone with whatever it was carrying" has to mean: a body that banked
   * its salvage as it left would be free energy on a timer.
   *
   * The one-way surface does NOT refuse it. `edgeEase` keys that on `born`,
   * and an EMBER never came through the portal -- so the rim it is climbing
   * to is a rim it is allowed to pass, which is the same escape a boss's
   * minion and a debug placement already had.
   *
   * ---- and the CLOCK is what is authored, from build 308 ----------------
   *
   * The cruise is DERIVED at the spawn site from the type's `climb` against
   * the column this body actually has to cross, so a rise takes the same
   * number of seconds at either era. Build 307 authored the speed and it was
   * measured wrong twice: docs/objects.html's 40 u/s is a twenty-four second
   * climb at era 1, and the 90 that replaced it measured 12.3s at era 1 and
   * **20.3s at era 2**, because the column is 963 units against 1481 and a
   * fixed speed stretches with the field. Nothing in this method knows about
   * that -- it steers at `this.cruise` as it always did.
   */
  rise(world, dt) {
    const E = CFG.rise;
    /*
     * Already going. `steer` runs from `physicsStep` and not from `update`,
     * so a dissolving body still reaches its gait every frame -- and the
     * condition below is still true once it has been met, so without this
     * the fizzle clock would be re-armed sixty times a second and the EMBER
     * would dissolve for ever. Build 210's lesson from the other side: a
     * state that stops a body moving has to be honoured in both, and a state
     * that is entered ONCE has to say so.
     */
    if (this.fizzle > 0) return;
    if (this.y + this.r < entryLine(world, ENTRY_Y) - E.gone * CFG.scale) {
      this.fizzle = E.fizzle;
      this.dissolved = true;
      return;
    }
    const slow = this.frozen(world) ? 0.12 : 1;
    const k = (this.accel / 100) * slow;
    const sway = Math.sin((world.time || 0) * 1.1 + this.phase) * E.sway * slow;
    const cruise = this.cruise * slow;
    this.vx += (sway - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (-cruise - this.vy) * clamp(k * dt, 0, 1);
    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  /**
   * TUMBLE: thrown rather than steered, and no opinion about the machine.
   *
   * There is no steering here at all -- the throw IS the gait, handed over at
   * the spawn site (`spawnByGait`) and spent by physics from there. What this
   * method owns is the clock that ends it and the hold under a STASIS, which
   * every term that moves a body owes: "objects freeze" is a hint the game
   * makes, and a spin that kept turning through it would be a third term
   * quietly exempt.
   *
   * The departure is the CLOCK and not the far wall. `edgeEase` exists to
   * stop anything reaching a wall, so a gait that left by crossing one would
   * be a gait arguing with the arena -- and eleven seconds is what
   * docs/objects.html promises a HUSK is on screen for.
   */
  tumble(world, dt) {
    const H = CFG.husk;
    if (this.fizzle > 0) return;   // see rise(): entered once, not per frame
    this.gaitFor += dt;
    if (this.gaitFor >= H.life) {
      this.fizzle = H.fizzle;
      this.dissolved = true;
      return;
    }
    /*
     * The spin is HELD, not set once. `integrate` damps angular velocity on
     * every substep (`CFG.physics.angularDamping`), so a spin handed over at
     * the spawn site decays: measured, 0.27 of a turn over eleven seconds
     * against the 2.6 the rate asks for -- a HUSK that stopped turning over
     * a second in, which is the one thing "end over end" cannot mean.
     *
     * Held as a FLOOR rather than written, so a round's own impact spin
     * (build 211's impact parameter) still adds on top instead of being
     * overwritten sixty times a second. And the direction is the way it is
     * TRAVELLING, so a HUSK that comes off a wall rolls back the other way:
     * canvas y runs down, so a body moving right rolls clockwise, which is a
     * positive `av`.
     */
    const slow = this.frozen(world) ? 0.12 : 1;
    const want = H.spin * slow;
    if (Math.abs(this.av) < want) this.av = (this.vx < 0 ? -want : want);
    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
      this.av *= f;
    }
  }

  /**
   * ROLL: across the field, off the side walls, spinning as it comes.
   *
   * Called from `drive` in the ROUTE's place rather than from the harmless
   * switch, because a roller is a hostile and still has to arrive -- see
   * CFG.roll for the two reasons HUSK's ballistic `tumble` cannot be reused
   * for one. Returns a displacement in WORLD X for the caller to add to its
   * own aim point; the side and the spin are this function's.
   *
   * @param {object} world
   * @param {number} dt
   * @param {number} ty the y the body is steering at, for the depth term
   * @returns {number} how far to one side of the aim point to steer instead
   */
  rollOn(world, dt, ty) {
    const R = CFG.roll;
    const slow = this.frozen(world) ? 0.12 : 1;
    /*
     * ---- IT TURNS AT `edgeEase`'s BAND, NOT AT THE WALL ------------------
     *
     * There is a global rule against a body reaching a side wall at all, and
     * it was written for exactly the thing a roller does: `edgeEase` pushes
     * anything within `CFG.physics.edgeEase` of an edge back toward the
     * middle at 300 u/s^2, under a docstring saying it covers "every one of
     * which could otherwise end up rolling along a wall". That band is 96
     * units of a 629-wide arena, so a turn point measured off the wall is a
     * branch nothing can ever take -- measured, a roller's reachable column
     * is 106 to 522 and a turn at `r + 14` sits at 54, a hundred units
     * outside anywhere the body can be. THAT is what the slant sweep was
     * really reporting, at zero wall turns for every factor from 0.75 to 2.0.
     *
     * So the turn is derived from the rule it would otherwise fight: the body
     * turns as it enters the band that would turn it anyway, and the two
     * agree rather than arguing. One owner for the number, which is why there
     * is no `CFG.roll.pad` of its own.
     */
    const pad = this.r + CFG.physics.edgeEase;
    // The first frame of the gait picks the side with the most room, so a
    // body that came down near one wall does not spend the gait against it.
    if (!this.rollSide) this.rollSide = this.x < world.width / 2 ? 1 : -1;
    else if (this.x <= pad) this.rollSide = 1;
    else if (this.x >= world.width - pad) this.rollSide = -1;
    /*
     * The spin is HELD, for `tumble`'s reason: `integrate` damps angular
     * velocity on every substep, so a spin written once decays to nothing
     * inside a second or two. Held as a SIGNED floor -- the spin in the
     * direction of travel must be at least `spin` -- which does two things a
     * `Math.abs` floor does not: a round's own impact spin still adds on top
     * rather than being overwritten sixty times a second, and a body that has
     * just turned off a wall rolls back the other way at once instead of
     * waiting for the damping to bring the old spin under the floor. Canvas y
     * runs down, so a body moving right rolls clockwise, which is positive.
     */
    const want = R.spin * slow;
    if (this.av * this.rollSide < want) this.av = this.rollSide * want;
    this.gaitFor += dt;
    /*
     * ---- IT IS AN AIM POINT TO ONE SIDE, not an offset to the bearing ----
     *
     * The route idiom adds its lateral along `(-dy, dx)` -- perpendicular to
     * the bearing at the machine -- and TWO versions of this gait were built
     * that way and measured before the geometry was believed. Perpendicular
     * to the bearing is TANGENTIAL, and a tangential heading holds the
     * body's distance from the machine rather than crossing the field: the
     * path wraps round the mount instead of zig-zagging over it. Measured,
     * sweeping the factor 0.75 -> 1.1 -> 1.3 -> 1.6 -> 2.0 moved the crossing
     * 187, 200, 202, 207, 205 units of a 629-wide field and produced ZERO
     * wall turns at every one of them -- the saturation is the tell, and a
     * factor the picture does not respond to is a factor multiplying the
     * wrong term.
     *
     * So the body steers at a point displaced in WORLD X from whatever it was
     * aiming at, by the remaining depth times `slant`. High up that point is
     * 562 units to one side of a mount 261 from the wall, so the body really
     * does drive at the wall and really does turn off it; as it comes down
     * the displacement shrinks with the depth and the aim point slides back
     * onto the machine, which is the fold every route already does across its
     * last stretch. `rollSide` is the direction of travel in x, +1 for right,
     * which is what makes the wall tests and the spin above read as written.
     */
    return this.rollSide * Math.max(0, ty - this.y) * R.slant * slow;
  }

  /**
   * FLOCK: steer at the school's own mean, and off whatever is nearest.
   *
   * Called from `drive` in the ROUTE's place, the same way `rollOn` is and
   * for the same reason: a flocker is a hostile and still has to arrive, so
   * the closing march is untouched and only the lane is replaced. Returns
   * the offset to add to the aim point, in world units.
   *
   * ONE PASS over the field per body, which is O(N^2) across a school -- 14
   * bodies against a field capped at 57 is about 800 distance tests a frame
   * and 4,000 with five schools up, against a pair solver that does far more.
   * The alternative is a cached centroid keyed on the frame, and that is a
   * second source of truth for a number this reads directly.
   *
   * The FACING is not written here -- it is in `Enemy.update`, so a school
   * points down-field through the march in as well, which this branch never
   * sees (a staged body takes the ordinary march and only starts flocking on
   * the frame it comes loose).
   *
   * @param {object} world
   * @param {number} dt
   * @returns {number[]} [ox, oy], the displacement of the aim point
   */
  flockOn(world, dt) {
    const F = CFG.flock;
    const slow = this.frozen(world) ? 0.12 : 1;
    let cx = 0;
    let cy = 0;
    let n = 0;
    let nx = 0;
    let ny = 0;
    let nd = Infinity;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.shoal !== this.shoal || e.fizzle > 0) continue;
      const ex = e.x - this.x;
      const ey = e.y - this.y;
      const d = Math.hypot(ex, ey);
      cx += ex;
      cy += ey;
      n++;
      if (d < nd) { nd = d; nx = ex; ny = ey; }
    }
    if (!n) return [0, 0];
    // Cohesion: a fraction of the way to the mean of the rest of the school.
    const ox = (cx / n) * F.cohere * slow;
    const oy = (cy / n) * F.cohere * slow;
    /*
     * ---- SEPARATION IS A NUDGE ON THE VELOCITY, NOT A TILT ON THE AIM ----
     *
     * Written as an aim-point offset it did nothing at all, and the sweep is
     * what said so: over eighteen combinations of the three factors the
     * closest pair in the school sat at 13.2 to 14.2 units in EVERY ONE --
     * which is `r1 + r2 - slop`, the distance `resolvePair` parks two
     * touching bodies at. A factor the picture does not respond to is a
     * factor on the wrong term (build 312).
     *
     * The reason is that every body in the school is steering at the SAME
     * mount, so a tilt away from a neighbour is spent long before contact:
     * two bodies converging on one point arrive together whatever their
     * headings did on the way. Cohesion can be a heading -- it is about
     * where the body is going -- and separation cannot.
     *
     * So it is `edgeEase`'s idiom instead, whose own docstring says why: "a
     * nudge on the velocity rather than a change of heading: the object keeps
     * doing whatever it was doing and simply stops being able to reach the
     * edge". `push` is an acceleration in units a second squared, squared off
     * with distance so it is nothing at `apart` and firm at contact, and
     * applied before `drive`'s own blend, which at this accel erases 5% of it
     * a frame.
     */
    const apart = this.r * F.apart;
    if (nd < apart && nd > 0.01) {
      const urge = (1 - nd / apart) ** 2 * F.push * slow * dt;
      this.vx -= (nx / nd) * urge;
      this.vy -= (ny / nd) * urge;
    }
    return [ox, oy];
  }

  /**
   * PAIRED: two halves turning about their own midpoint, and one pool.
   *
   * ---- THE BREAK IS A PULL, for build 310's reason -------------------
   *
   * The survivor notices its partner is gone and takes the beam off itself.
   * A hook at the death site would have been the obvious place and would
   * have been wrong: `Enemy.destroy` is the one door every DAMAGE death
   * comes through and NOT the one door every `dead = true` comes through --
   * six places set it directly, so a partner taken by a fizzle, a boss
   * teardown, the glitch dissolve or `Game.sweep` would leave a beam nobody
   * broke and a survivor that never got its speed. `solveTethers` clears the
   * tether records on its own; this is what clears the FLAG and pays the
   * survivor.
   *
   * @param {object} world
   * @param {number} dt
   */
  pairOn(world, dt) {
    const Y = CFG.yoke;
    const o = this.tether && this.tether.other;
    if (this.beam && (!o || o.dead || o.fizzle > 0)) {
      this.beam = false;
      this.tether = null;
      this.cruise *= Y.alone;
      // Its own share starts again, or a survivor that had absorbed the pool
      // up to the snap would snap a second time off its next hit.
      this.took = 0;
      return;
    }
    if (!this.beam || !o) return;
    /*
     * ONE POOL, held every frame and not only on the damage path. Anything
     * else that writes `hp` -- MENDING's regen, a graft's, a debug heal --
     * would otherwise desync the two halves, and the pool is the lower of
     * them because a pool is what is left rather than the best of two
     * readings.
     */
    if (o.hp !== this.hp) {
      const low = Math.min(o.hp, this.hp);
      o.hp = low;
      this.hp = low;
    }
    const slow = this.frozen(world) ? 0.12 : 1;
    const mx = (this.x + o.x) / 2;
    const my = (this.y + o.y) / 2;
    let ax = this.x - mx;
    let ay = this.y - my;
    const d = Math.hypot(ax, ay) || 1;
    ax /= d;
    ay /= d;
    /*
     * The tangent about the midpoint, and the same rotational sense for both
     * halves: `(-ay, ax)` is anticlockwise from wherever each body stands, so
     * one shared `routeSide` turns the pair rather than tearing at it. HELD
     * toward the rate rather than written, for `tumble`'s reason -- the
     * damping would otherwise take the rotation out inside two seconds -- and
     * blended so the beam's own constraint is not fighting a velocity that
     * appeared between two frames.
     */
    const tx = -ay * this.routeSide;
    const ty = ax * this.routeSide;
    /*
     * ---- A TARGET RATE IS NOT A RATE, AND THIS REPO HAS PAID FOR IT TWICE
     *
     * Build 298 (the portal's ramp) and build 308 (the rise clock) both
     * handed a target to a blend and measured what actually came out. The
     * same arithmetic applies here and the same way: `grip` blends the
     * tangential velocity toward `want`, and TWO other terms are pulling it
     * back every frame -- `integrate`'s `linearDamping`, and `drive`'s own
     * blend below, which steers both halves at nearly the same march target
     * and therefore erases the part of the velocity that DIFFERS between
     * them. Steady state is `want * grip / (grip + damping + accel/100)`,
     * which is 0.59 of the authored rate: measured 0.692 rad/s against the
     * 1.2 in `CFG.yoke`.
     *
     * So the target is grossed up by those two terms rather than by a fitted
     * constant -- which is the correct dependency as well as the honest one:
     * a heavier `accel` fights the rotation harder and needs more asking
     * for. `drive`'s `authority` clamp can only reduce its term, so this is
     * an upper bound on the fight and the delivered rate lands at or a
     * little under `spin`; the CASE is on the delivered rate, never on this
     * expression.
     *
     * ...and `cur` is measured RELATIVE TO THE MIDPOINT, which is what makes
     * it a rotation rate at all: the pair's own march is a translation both
     * halves share, and counting it as rotation would read the beam as
     * turning fastest whenever it happened to lie across the field.
     */
    const fight = CFG.physics.linearDamping + this.accel / 100;
    const want = Y.spin * d * slow * ((Y.grip + fight) / Y.grip);
    const mvx = (this.vx + o.vx) / 2;
    const mvy = (this.vy + o.vy) / 2;
    const cur = (this.vx - mvx) * tx + (this.vy - mvy) * ty;
    const k = clamp(Y.grip * dt, 0, 1);
    this.vx += tx * (want - cur) * k;
    this.vy += ty * (want - cur) * k;
    // The picture points ALONG the beam, so `drawYoke` can draw its half in
    // the body's own frame -- the same reason the dart's facing is the
    // gait's business and not a field on the type.
    this.angle = Math.atan2(o.y - this.y, o.x - this.x);
    this.av = 0;
  }

  /**
   * DIVE: fast on the run, slow on the way back.
   *
   * Three phases and the transitions are one-way within a cycle: HOLD across
   * the top until it has settled into a lane and waited `dwell`, DIVE down
   * that lane at `CFG.shrike.dive`, then CLIMB back out of it at a fraction
   * of its own walk. The asymmetry is the object -- `docs/objects.html`'s
   * counter is that it is only fast on the dive.
   *
   * ---- THE LANE IS DERIVED, AND IT GOES PAST THE MACHINE ---------------
   *
   * See `CFG.shrike` for the measurement: a 70-health body driven down the
   * turret's own column at 210 u/s is dead at frame 83 and never gets past,
   * because `impactDamage`'s reduced mass against a static body is the body's
   * whole mass and the result clamps at 300. `laneFor` is the one place the
   * lane is computed, off the overlap it must not enter and the grip band it
   * must reach.
   *
   * The SIDE is chosen once, on the first frame of the gait, from whichever
   * side of the machine the body arrived on -- a second roll would be a
   * second decision for one fact, which is the `rollSide` rule.
   *
   * @param {object} world
   * @param {number} dt
   * @param {number} tx the steering target the route would have used
   * @param {number} ty
   * @returns {number[]} the target this gait steers at instead
   */
  diveOn(world, dt) {
    const S = CFG.shrike;
    const s = world.shooter;
    if (!(this.baseCruise > 0)) this.baseCruise = this.cruise;
    if (!this.diveSide) this.diveSide = this.x < s.x ? -1 : 1;
    if (!this.divePhase) this.divePhase = 'hold';
    this.diveT += dt;
    const holdY = entryLine(world, ENTRY_Y) + S.hold;
    const lane = diveLane(world, this);
    /*
     * The dive's speed is DELIVERED and not asked for. `drive` blends the
     * velocity toward `dx * cruise` at `accel / 100` while `integrate` damps
     * every substep at `linearDamping`, so the steady state is
     * `target * k / (k + damping)` -- a raw 210 arrives as 181. Grossed up by
     * those two terms rather than by a fitted constant, which is the correct
     * dependency: a heavier `accel` needs less asking for. Fourth time in
     * this repo; see build 298, 308 and 316.
     */
    // Floored, because `gross` divides by it and `accel` has no default on a
    // type -- a dive body without one would get a NaN cruise and be lost for
    // the rest of the run without throwing. The rise clock's copy of this
    // arithmetic already carries the same floor.
    const k = Math.max(0.01, this.accel / 100);
    const gross = (k + CFG.physics.linearDamping) / k;
    if (this.divePhase === 'hold') {
      this.cruise = this.baseCruise;
      /*
       * Slide across the top INTO the lane, so the line can be read -- and be
       * mined -- before it is used. The tolerance is `grabPad` and not `r`:
       * at `r` it committed up to fourteen units wide, the dive never
       * converged (a target straight down the lane corrects laterally more
       * weakly the closer it gets), and the pass missed the grip band
       * entirely -- measured, a closest approach of 59.5 against a band of
       * 42 and ZERO frames of grip. The pad is the width of the thing the
       * lane exists to reach, so it is the width the commitment is worth.
       */
      /*
       * `diveT` counted time in the PHASE, and the body arrives from the
       * climb 150 units away -- so the traverse alone is about 4.8 seconds
       * against a 1.4-second dwell and the clock never decided anything.
       * Measured on the shipped build: 4.84 and 4.94 at the commit frame.
       * `diveHeld` counts time INSIDE the lane instead, which is the thing
       * `dwell` claims to be, so the line really is shown before it is used.
       */
      /*
       * ...and it BLEEDS rather than resets. The gate is two units wide and
       * `drive`'s heading wobble carries the body across it, so a clock that
       * went back to zero on every excursion never completed: measured, both
       * bodies of the shipped wave recorded ZERO dives in sixty seconds.
       * That is the TOW's `holdWind` fault exactly -- a hold that resets on
       * leaving its range is a hold that never completes under fire -- and
       * this is its recorded fix: leaving the lane costs ground rather than
       * the attempt.
       */
      const inLane = Math.abs(this.x - lane) < this.r * S.gate;
      this.diveHeld = Math.max(0, this.diveHeld + (inLane ? dt : -dt));
      /*
       * ...and ONE BODY IN THE LANE AT A TIME. The corridor is two units
       * wide and every body on a side derives the SAME lane -- there is no
       * room for a per-body offset inside it -- so two shrikes met in it:
       * measured on the shipped wave, both bodies dived twice and both were
       * dead at 27.8s, down to 3.3 and 23.1 health, which is a diving body
       * at 210 meeting a climbing one at 93. The queue is the fix the lane
       * cannot be: `scionLane` exists for the same reason one rung down.
       */
      if (inLane && this.diveHeld > S.dwell && !laneBusy(world, this)) {
        this.divePhase = 'dive';
        this.diveX = lane;
        this.diveT = 0;
        this.diveHeld = 0;
      }
      return [lane, holdY];
    }
    if (this.divePhase === 'dive') {
      this.cruise = S.dive * gross;
      // Past the machine and on to the floor, which is the overshoot.
      if (this.y > world.floorY - this.r * 2) {
        this.divePhase = 'climb';
        this.diveT = 0;
      }
      // A point AHEAD on the lane, not the far floor: see `CFG.shrike.look`.
      return [this.diveX, Math.min(world.floorY + this.r, this.y + S.look)];
    }
    // CLIMB: out of the lane and back up, slowly. This is the vulnerable half,
    // and it is grossed up by the same two terms as the dive -- one rule for
    // both, or the phase whose number nobody compensated is the one that
    // quietly runs at 0.86 of what the config says.
    this.cruise = S.climb * gross;
    if (this.y < holdY + this.r) {
      this.divePhase = 'hold';
      this.diveT = 0;
    }
    // The same wall margin `diveLane` uses; one gait, one number.
    const out = clamp(this.diveX + this.diveSide * S.swing,
      this.r + 4, world.width - this.r - 4);
    return [out, holdY];
  }

  /**
   * One pool, and the record of which half absorbed it.
   *
   * Called from `applyDamage` after the hit has landed, so what it books is
   * what the body actually lost -- past ARMORED's discard, past the plate,
   * past a HERALD's ward and past the `Math.max(1, ...)` floor, which is the
   * rule `ledger.note` already follows.
   *
   * `snap` is the share of the pool that, landed on ONE half, takes that
   * half off the beam. Spread your fire and the pool empties with neither
   * half having absorbed that share, so both go together; put the share into
   * one and it comes off with the rest of the pool standing in the other --
   * unencumbered, and faster. The total damage is the same either way.
   */
  pourPool(world, real) {
    const o = this.tether && this.tether.other;
    if (!o || o.dead) return;
    o.hp = this.hp;
    this.took += real;
    if (this.hp > 0 && this.took >= this.maxHp * CFG.yoke.snap) this.destroy(world);
  }

  /**
   * CHAIN: follow the leader, and a cut leaves two snakes.
   *
   * Each bead steers at the one AHEAD, holding `CFG.chain.gap`; the head has
   * nothing ahead of it and weaves down the field instead. So the snake's
   * shape is not authored anywhere -- it is what seven followers do to one
   * head's path, which is why the thing left after a cut is different every
   * time.
   *
   * ---- THE PROMOTION IS A PULL, NOT A PUSH -----------------------------
   *
   * A follower whose lead is gone becomes a head, and it finds that out
   * ITSELF on the next frame. Nothing is written at the death site, and that
   * is deliberate: `Enemy.destroy` is the one door every DAMAGE death comes
   * through but NOT the one door every `dead = true` comes through -- six
   * places set it directly (the seed's timer, a fizzle running out, a boss's
   * teardown, the glitch dissolve, `Game.sweep`, the debug wipe). A hook in
   * `destroy` would be missed by every one of them, and the bug would be a
   * snake following a corpse.
   *
   * It tests `fizzle` as well as `dead`, because a dissolving bead is leaving
   * and `Game.physicsStep` skips `steer` for one while `integrate` goes on
   * moving it -- so a lead that is merely fizzling is still a lead for as
   * long as `dead` alone is consulted.
   *
   * There is NO roster. A chain has no owner the way a boss owns its pieces,
   * so nothing would prune one -- and tessera.js is the measured record of
   * what that costs: `this.tiles` reached 53 entries for 15 berths before a
   * prune was added. Seven references, each dropped by the body holding it.
   */
  chain(world, dt) {
    const C = CFG.chain;
    if (this.fizzle > 0) return;   // see rise(): entered once, not per frame
    this.gaitFor += dt;
    if (this.gaitFor >= C.life) {
      this.fizzle = C.fizzle;
      this.dissolved = true;
      return;
    }
    // The promotion. Dropped rather than kept, so nothing holds a dead body.
    if (this.link && (this.link.dead || this.link.fizzle > 0)) this.link = null;

    const slow = this.frozen(world) ? 0.12 : 1;
    const k = (this.accel / 100) * slow;
    let vtx;
    let vty;
    if (this.link) {
      /*
       * ---- THE STATION IS A POINT AND THE SPEED IS AN ERROR --------------
       *
       * The target is the point `gap` BEHIND the bead ahead, and what this
       * bead aims for is the lead's OWN velocity plus a correction toward
       * that point. That is the whole of the controller, and it matters that
       * the correction is SIGNED: standing off the station in either
       * direction pushes it back, so a follower carried too close by its own
       * momentum is pushed out rather than merely slowed.
       *
       * The first version scaled a cruise by `d / gap` -- distance to the
       * LEAD -- with a floor of 0.15, so every term pointed at the lead and
       * the only thing resisting a close-up was a smaller speed toward it.
       * Measured over five seconds the gap touched **17.9 against the pair
       * solver's floor of 18.4**, which is the snake grinding against itself:
       * `resolvePair` corrects any overlap and exempts nothing for being
       * harmless. Matching the lead's velocity makes the station an
       * equilibrium instead of a limit, so the floor holds by construction
       * rather than by margin.
       */
      const dx = this.link.x - this.x;
      const dy = this.link.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const gap = chainGap(this.type);
      const ex = (this.link.x - (dx / d) * gap) - this.x;
      const ey = (this.link.y - (dy / d) * gap) - this.y;
      const err = Math.hypot(ex, ey) || 1;
      const fix = err * C.grip * slow;
      vtx = this.link.vx + (ex / err) * fix;
      vty = this.link.vy + (ey / err) * fix;
      /*
       * The CEILING is on the whole ask, not on the correction, because the
       * correction rides on top of the lead's own velocity -- capping only
       * the correction left a bead able to ask for about twice its cruise.
       * See CFG.chain.catch: above a relative 62 the pair solver starts
       * billing `impactDamage`, and a snake that hurts itself is not a snake.
       */
      const ceil = this.cruise * C.catch * slow;
      const ask = Math.hypot(vtx, vty);
      if (ask > ceil) { vtx *= ceil / ask; vty *= ceil / ask; }
    } else {
      // The head: a weave down the field. Nothing steers at the machine --
      // "it wants nothing and blocks nothing" is the whole object.
      const tx = this.x + Math.sin((world.time || 0) * C.weave + this.phase) * C.sway;
      const ty = this.y + C.ahead;
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      const want = this.cruise * slow;
      vtx = ((tx - this.x) / d) * want;
      vty = ((ty - this.y) / d) * want;
    }
    this.vx += (vtx - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (vty - this.vy) * clamp(k * dt, 0, 1);
    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  /**
   * The soft side boundary. Applied after steering and before integration, to
   * every body the arena holds, so it covers a hostile making its run, a drift
   * wandering, and a mote being drawn in — every one of which could otherwise
   * end up rolling along a wall.
   *
   * A nudge on the velocity rather than a change of heading: the object keeps
   * doing whatever it was doing and simply stops being able to reach the edge.
   */
  edgeEase(world, dt) {
    // Fixed bodies are placed, not steered — see drive(). Nudging one toward
    // the middle just fights the boss for the same frame. Their salvage is
    // not fixed and wants the wall like anything else.
    if (this.type.fixed && !this.isDrop) return;
    const E = CFG.physics;
    /*
     * Held, at the same 0.12 the steering is held at. This runs AFTER `steer`
     * and outside it, so a STASIS left it at full strength: 300 u/s^2 against
     * the freeze's own 2.15/s settles at about 140 u/s at the wall, where a
     * held body sits at 1.8 -- so the side bands, which are 96 units of a 629
     * wide arena either side, plus every drift resting near the floor, went
     * on visibly sliding for the whole four seconds. "Objects freeze" is the
     * hint, and it has to be true of every term that moves one.
     */
    const slow = this.frozen(world) ? 0.12 : 1;
    const left = this.x - this.r;
    const right = world.width - (this.x + this.r);
    const near = Math.min(left, right);
    if (near < E.edgeEase) {
      // Squared, so it is nothing at the outer limit and firm at the wall.
      const urge = (1 - Math.max(near, 0) / E.edgeEase) ** 2;
      this.vx += (left < right ? 1 : -1) * E.edgePush * urge * slow * dt;
    }
    // The floor is a wall too. A drift that has finished coming down would
    // otherwise settle onto the bottom edge and sit there at a dead stop,
    // which is exactly what a thing that never stops must not do.
    const below = world.floorY - (this.y + this.r);
    if (below < E.floorEase) {
      const urge = (1 - Math.max(below, 0) / E.floorEase) ** 2;
      this.vy -= E.edgePush * urge * slow * dt;
    }
    /*
     * ---- and the surface is ONE-WAY, from build 298 ----
     * A body that came through the portal does not go back through it. A
     * drift's walk used to send it up out of the rim it had just come out
     * of, and a PULSE can throw anything that way. A born body whose top
     * edge comes back within `skin` of the rim under it is pushed out again,
     * harder the further in it is -- a velocity floor and not a position
     * clamp, so a body shoved hard into the surface sinks a little way in
     * and comes back out over a few frames rather than snapping. Keyed on
     * `born`: a boss's minion, a debug placement and a field spawn never
     * came through and may stand wherever they stand.
     */
    if (this.born && !this.staged && world.portal) {
      const C = CFG.portal;
      const into = rimUnder(world, this.x) + this.r + C.skin - this.y;
      if (into > 0) this.vy = Math.max(this.vy, Math.min(into, 60) * C.refuse);
    }
  }

  /**
   * A SEED looking for a host. It takes the largest thing within reach rather
   * than the nearest, so it reads as reinforcing the object that was already
   * the problem — and it re-picks every frame, so shooting its target out from
   * under it sends it somewhere else rather than stalling it.
   */
  hunt(world, dt) {
    const G = CFG.graft;
    const rd = ridesOf(this.type);
    this.rideT -= dt;
    if (this.rideT <= 0) { this.dead = true; return; }

    let best = null;
    let bestScore = 0;
    for (const e of world.enemies) {
      // Not another SCION. It is the largest thing on the field, so it would
      // win the pick nearly every time, and a SCION whose seeds reinforce the
      // next SCION is a loop rather than a decision -- the object exists to
      // give the ability away.
      // Full is full. Below the cap a body can take another, which is what
      // makes a SCION's three land as one problem rather than three.
      if (e === this || e.dead || e.rides || e.harmless || e.staged) continue;
      // ...nor onto ORDINAL. A graft grows its host and heals it, and the one
      // thing a segment of a frame must not do is change size: the frame is
      // built to close exactly, and a grafted panel would open a hole in it
      // that no round made. A SCION already on the field when the way opens
      // is the only way this could ever have come up, which is exactly the
      // kind of thing that turns up once and is never reproducible.
      if (e.type.fixed) continue;
      if (e.graftCount >= G.stack) continue;
      if (e.type.id === 'scion') continue;
      const d2 = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
      if (d2 > rd.hunt * rd.hunt) continue;
      // Biggest first, and closer breaks the tie.
      const score = e.r * 1000 - Math.sqrt(d2);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    this.host = best;
    if (!best) {
      this.wander(world, dt);
      return;
    }

    const dx = best.x - this.x;
    const dy = best.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d <= best.r + this.r + 2) {
      graft(world, best, this);
      this.dead = true;
      this.dissolved = true;
      return;
    }
    /*
     * ...and it is held by a STASIS like everything else.
     *
     * `drive` returns to `hunt` ABOVE both its `slow` term and its damping,
     * so a SEED had neither: three violet seeds sailed across a stopped field
     * at 118 u/s -- sixty-five times a held body -- and grafted anyway, with
     * the freeze overlay drawing brackets round them as though they were
     * held. Same numbers as `drive`, applied in the same order.
     */
    const slow = this.frozen(world) ? 0.12 : 1;
    const k = (this.accel / 100) * slow * dt;
    this.vx += ((dx / d) * this.cruise * slow - this.vx) * clamp(k, 0, 1);
    this.vy += ((dy / d) * this.cruise * slow - this.vy) * clamp(k, 0, 1);
    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }
  }

  /**
   * Steering, then the two things that have to happen however it steered.
   *
   * drive() has half a dozen early returns -- thrown, seeded, harmless, dead
   * -- and a NEEDLE that stops pointing where it is going the moment something
   * throws it is a NEEDLE that tumbles for the most visible second of its
   * life. Same for a TOW's wind-up, which must not stall because the pair got
   * shoved.
   */
  steer(world, dt) {
    this.shoveFade(dt);
    this.drive(world, dt);
    if (this.type.hurl && this.tether) this.windUp(world, dt);
    this.face(dt, world);
  }

  /**
   * Types that lead with a point turn to face where they are going.
   *
   * A NEEDLE is drawn as a spike along -y, so the heading it wants is the
   * travel bearing plus a quarter turn. Eased over about a tenth of a second
   * rather than snapped, and its tumble is damped out as it comes round, so a
   * body shoved sideways reads as correcting rather than as a sprite being
   * rotated. Below walking pace it keeps whatever heading it had -- a needle
   * sitting still has no "forward" to point at.
   */
  /**
   * Did this hit land on the plated face?
   *
   * `nx, ny` is the direction the damage is travelling, so a hit on the front
   * comes in roughly OPPOSITE to where the body is pointing. A zero vector is
   * not frontal: a hit with no direction has no face.
   *
   * Counted rather than guessed: there are FOURTEEN `Enemy.applyDamage` call
   * sites in `src/`, of which eight pass a direction and six pass a literal
   * `0, 0` (contact is two sites of one source) -- plus one conditional zero
   * in WIRE's cut when the body's centre lies on the wire. An earlier draft
   * of this said "seventeen callers, two of them scale it": the seventeen
   * counted two unrelated `applyDamage` definitions and the Enemy one, and
   * NO caller scales the direction -- what is scaled at two sites is the
   * impulse beside it. The normalise is kept because a unit vector is a
   * precondition this function should not have to trust, but its cost is
   * real and the reason given for it was not.
   *
   * @param {number} nx
   * @param {number} ny
   * @returns {boolean}
   */
  frontal(nx, ny) {
    const m = Math.hypot(nx, ny);
    if (m < 1e-6) return false;
    const dot = -(nx * Math.cos(this.angle) + ny * Math.sin(this.angle)) / m;
    return dot >= CFG.flint.front;
  }

  face(dt, world) {
    if (this.isDrop) return;
    /*
     * A PLATED body turns to keep its face on the BARREL, not on its own
     * heading, and slowly. Handled here rather than in a fourth site: this
     * method is already where bodies are turned, and `steer` already calls it
     * once a frame.
     *
     * ---- AND NOTHING CAN SPIN IT, which an earlier draft claimed otherwise
     *
     * This zeroes `av`, and `steer` runs before `integrate` in the same
     * substep -- so every source of angular velocity in the game writes
     * OUTSIDE that window and is discarded unapplied: a round's own lever
     * spin, the pair solver's friction, a wall bounce, the WELL. Measured,
     * `av` set to 20 moved the angle 0.0000 rad against the 0.333 it would
     * have. So the plate cannot be knocked off axis, and the only thing that
     * moves it is the body's own POSITION changing -- a shove alters the
     * bearing to the mount, and the slew rate is what decides how long that
     * is worth. The rate is a rate; note `point`'s 11 below is NOT one, it
     * is a proportional gain (`k = dt * 11`), so the two are not comparable.
     *
     * Note this repo now has TWO conventions for a facing and they disagree.
     * `point` below turns to the heading along local -y at 11 rad/s; the
     * `FACES_TRAVEL` set added at build 317 turns to the heading along local
     * +x and snaps. FLINT is drawn along +x with the rest of that group.
     * Unifying the two is a change to what several existing bodies look
     * like, so it is recorded rather than done here.
     */
    if (this.type.plated && !this.staged && world) {
      const s = world.shooter;
      let d = Math.atan2(s.y - this.y, s.x - this.x) - this.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Held by a freeze, like every other steering path in this file --
      // measured, without it a frozen FLINT turned the full 0.8 rad in half
      // a second against the 0.096 everything else is slowed to.
      const step = CFG.flint.turn * dt * (this.frozen(world) ? 0.12 : 1);
      this.angle += clamp(d, -step, step);
      this.av = 0;
      return;
    }
    if (!this.type.point) return;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp < 10) return;
    let d = Math.atan2(this.vy, this.vx) + Math.PI / 2 - this.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = clamp(dt * 11, 0, 1);
    this.angle += d * k;
    this.av *= 1 - k;
  }

  /**
   * A TOW winding its load up, and letting go of it.
   *
   * Only the head runs this, and only while it still has a cable. Inside the
   * hurl range the mass is driven around the head -- a sideways push each
   * frame, so the pair spins up instead of being teleported into an orbit --
   * and at the end of the wind it is released at the turret.
   */
  windUp(world, dt) {
    const H = this.type.hurl;
    const mass = this.tether.other;
    if (!mass || mass.dead) return;
    const s = world.shooter;
    /*
     * Out of range: the wind BLEEDS rather than resets.
     *
     * It was `this.wind = 0`, and gunfire shoves the head backwards for as
     * long as it is being shot at, so one knockback near the end of the hold
     * cost the whole hold. Measured over five pairs at tier 9, one head wound
     * for four seconds across two attempts and threw nothing: it kept being
     * pushed a few units past 430 and starting again. Bleeding at `holdWind` a
     * second makes leaving range cost ground instead of the attempt.
     */
    if (Math.hypot(s.x - this.x, s.y - this.y) > H.range) {
      this.wind = Math.max(0, (this.wind || 0) - dt * H.holdWind);
      return;
    }

    /*
     * A STASIS stops the wind, exactly as it already stops a LURCHER's burst
     * (see `lurchTimer` below). `steer` calls this after `drive` and it had
     * no stasis term at all, so a TOW wound its 1.15 seconds inside the four
     * of a freeze and let go at 620 u/s -- with `thrown` 2.2 on the MASS,
     * which returns from `drive` above both the slow and the damping. The one
     * thing on the field that can be stopped by pressing a button was the one
     * thing that landed on the mount through it.
     */
    if (this.frozen(world)) return;
    this.wind = (this.wind || 0) + dt;
    const spin = clamp(this.wind / H.wind, 0, 1);
    // perpendicular to the cable, so the load comes round rather than in
    let cx = mass.x - this.x;
    let cy = mass.y - this.y;
    const cd = Math.hypot(cx, cy) || 1;
    cx /= cd; cy /= cd;
    mass.vx += -cy * 900 * spin * dt;
    mass.vy += cx * 900 * spin * dt;
    this.tether.len = this.type.tows.length * (1 - spin * 0.45); // and it draws in

    if (this.wind < H.wind) return;
    this.release(world, 1);
  }

  /**
   * Let go of the load.
   *
   * Split out of `windUp` because there are two ways to reach it now: the wind
   * completing, and the head dying with the cable still on (see
   * `Enemy.destroy`). `full` is how much of the hold it got -- 1 from a
   * completed wind, `wind / H.wind` from a death -- and it scales the speed
   * between `H.partial` and 1, so an early kill still buys a slower MASS.
   */
  release(world, full) {
    const H = this.type.hurl;
    const mass = this.tether && this.tether.other;
    if (!mass || mass.dead) return false;
    const s = world.shooter;
    const k = H.partial + (1 - H.partial) * clamp(full, 0, 1);

    /*
     * Shove the neighbourhood first, and only then let go.
     *
     * A TOW arrives with a wave rather than alone, so the frame it releases on
     * is routinely a frame with three or four other bodies inside the swing.
     * The load then started its 620 already in contact with them: even with
     * the plow below, the first frame is spent trading impulse instead of
     * travelling, and the throw read as a drop. This is the same shape as
     * PULSE and PILE -- a deliberate clear, so `throwOff` -- and it does no
     * damage: it exists to make room, not to be a second attack.
     *
     * `source: mass` keeps the load out of its own blast; the head is inside
     * it and is supposed to be, which is why the pair visibly comes apart.
     */
    applyBlast(world, {
      x: mass.x, y: mass.y, r: H.clear.r,
      damage: 0, impulse: H.clear.impulse, throwOff: true, source: mass, src: 'contact',
    });

    // Straight at the turret, at a speed nothing else on the field has, and
    // coasting -- `thrown` is what stops a released body steering.
    const dx = s.x - mass.x;
    const dy = s.y - mass.y;
    const d = Math.hypot(dx, dy) || 1;
    mass.vx = (dx / d) * H.speed * k;
    mass.vy = (dy / d) * H.speed * k;
    mass.av = spread(9);
    mass.thrown = 2.2;
    /*
     * ...and it does not give ground on the way in. `plow` is read by
     * `resolvePair`: the load takes no share of any contact with a body that
     * has mass of its own, so it crosses a crowd instead of stopping four
     * bodies into it. The turret and the DECOY are static and are deliberately
     * NOT plowed through -- see the header on resolvePair. Same clock as
     * `thrown`, because a load that has finished coasting is a body again.
     */
    mass.plow = 2.2;
    mass.hurled = true;
    this.tether = null;
    mass.tether = null;
    this.wind = 0;
    this.hurled = true; // spent: it never gets another one
    ring(this.x, this.y, this.r, this.r * 5, 0.3, this.type.color, 2);
    ring(mass.x, mass.y, mass.r, H.clear.r, 0.34, this.type.glow, 3);
    audio.thud();
    return true;
  }

  drive(world, dt) {
    // ORDINAL's frame and its core. Their position is the boss's business,
    // not physics' — see src/boss.js. They are still solid, still take hits
    // and still come apart; they simply do not go anywhere.
    /*
     * ...but only a body. A drop is built from the type it fell off, so
     * ORDINAL's salvage and every TALLY's carried `fixed` and was pinned by
     * this line the instant it existed: velocity zeroed every frame, no
     * steering, no drift to the turret. The whole payout of a boss sat in a
     * frozen cloud where the frame had been and could not be collected.
     */
    if (this.type.fixed && !this.isDrop) { this.vx = 0; this.vy = 0; return; }
    // Thrown clear and not yet recovered. It coasts: the whole point of a shove
    // is that the field comes off you, and a body that starts steering back on
    // the next frame has not been thrown anywhere.
    if (this.thrown > 0) {
      this.thrown -= dt;
      return;
    }
    /*
     * A rider goes for its host -- but NOT while it is still marching in.
     *
     * `drive`'s early returns are ORDERED and this branch sat above the
     * staged march, which never mattered while SEED was the only rider: a
     * SCION places its seeds mid-field and one is never `staged`. A LATCH is
     * released by a wave and comes down the portal like everything else, so
     * without the guard it would peel off at a host from the frame it
     * appeared, inside the throat, and the whole march-in would be a body
     * cutting sideways out of the mouth. That is build 307's finding
     * verbatim -- the harmless branch beside this one carries exactly the
     * same `!this.staged` for exactly the same reason -- and it means the
     * `rideT` clock does not run while the body is still in the doorway,
     * which is right: the seconds it has to find a host should not be spent
     * somewhere it cannot look.
     */
    if (this.rides && !this.staged) {
      this.hunt(world, dt);
      return;
    }
    /*
     * Energy is energy, whatever dropped it.
     *
     * A mote is built from the type it fell off, so a mote off a DRIFT
     * inherited `harmless` and took this branch -- it wandered the band it was
     * made in and never came to the turret at all. The one object whose
     * salvage you have to go and fetch was the one object whose salvage was
     * never coming to you.
     */
    /*
     * ...and NOT while it is still marching in. This branch sat above the
     * `staged` one, so a harmless body wandered from the frame it appeared
     * whatever its state -- which is why DRIFT alone fanned out inside the
     * doorway at era 2 while every hostile went straight down and opened up
     * only once it was past the gate. Zeroing its spawn velocity did nothing;
     * `wander` put the lateral back on the next frame.
     *
     * A staged DRIFT falls through to the staged march below, which is the
     * same sway every hostile takes on the way in, and picks the wander back
     * up on the frame it comes loose.
     */
    if (this.harmless && !this.isDrop && !this.staged) {
      /*
       * ...and WHICH walk is the TYPE's, from build 307. `hover` is the
       * band-and-bob `wander` has been since build 298 and is what anything
       * harmless with no declared gait still gets; `rise` and `tumble` are
       * the two that leave the field. See GAITS in config.js -- the gait is a
       * property of the type and never a roll at spawn, which is the whole
       * distinction from `route`.
       */
      switch (this.type.gait) {
        case 'rise': this.rise(world, dt); break;
        case 'tumble': this.tumble(world, dt); break;
        case 'chain': this.chain(world, dt); break;
        /*
         * `hover` IS the default arm, written out rather than implied: it is
         * what DRIFT has done since build 298 and what anything harmless
         * that has not declared a gait still gets. Named because
         * check-build.mjs requires every word in the vocabulary to be read
         * by name -- an entry with no reader is a promise the table is
         * making and the code is not keeping.
         */
        case 'hover':
        default: this.wander(world, dt); break;
      }
      return;
    }

    const t = world.time;
    let tx;
    let ty;

    if (this.staged) {
      // Nothing to aim at yet: it is still marching in, so it simply comes
      // down, drifting a little as it falls. The target sits below the entry
      // line rather than on it, or a body eases to a halt just short of the
      // line it is supposed to cross.
      // ...and the sway dies away as the body enters the surface, so what
      // pushes through the rim pushes straight rather than sliding along it.
      tx = this.x + Math.sin(t * 0.6 + this.phase) * 40 * (1 - portalDepth(world, this));
      ty = entryLine(world, ENTRY_Y) + 60;
    } else {
      tx = world.shooter.x;
      ty = world.shooter.y;
      /*
       * A DECOY outranks the turret: that is the whole ability -- for the
       * things it is an ability against.
       *
       * `!this.isDrop` because a mote is not fooled by a decoy, it is
       * ENERGY, and this branch had no guard where both its neighbours do.
       * A mote steers at 132 with accel 300 against `collectData`'s 26
       * u/s^2 pull toward the turret, so the steering won outright: pressing
       * DECOY stopped loose energy arriving for up to nine seconds, gathered
       * it three hundred units up-field, and then threw it outward with the
       * decoy's own parting blast. Worst with INTAKE, which only banks what
       * touches the machine.
       */
      const lure = decoyTarget(world, this);
      if (lure) {
        tx = lure.x;
        ty = lure.y;
      }
      /*
       * EBB: wreckage goes the other way.
       *
       * Only the wreckage -- the bodies still close as they always did, or
       * the trait would be a rest rather than a rule. The mote steers at a
       * point reflected through itself, so it uses the same steering it
       * already had and simply wants the opposite thing; PULSE and INTAKE
       * still overrule it, because taking energy in by hand is the answer to
       * this and it should keep working.
       */
      if (this.isDrop && this.traits && hasTrait(this.traits, 'ebb')) {
        tx = this.x * 2 - tx;
        ty = this.y * 2 - ty;
      }
    }

    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;

    /*
     * ---- CARTWHEEL holds a spin and takes its route like anything else ----
     *
     * The smallest of the six gaits: it adds the TURN and nothing else, and
     * the turn is the whole of SPINDLE's design because the bar's profile
     * against the barrel changes with it. So this does not replace the route
     * the way `roll` and `flock` do -- it sits above them and the ordinary
     * branch below still runs.
     *
     * Held as a SIGNED floor against `integrate`'s angular damping, for
     * `tumble`'s measured reason (0.27 of a turn in eleven seconds when it is
     * written once), and per SUBSTEP rather than per frame because the
     * damping is per substep. The direction is `routeSide`, which is already
     * a coin flip taken at spawn -- a second field would be a second roll for
     * the same decision, and a body that arcs left cartwheels left.
     */
    // PAIRED holds a rotation about the midpoint and notices a lost partner;
    // like the cartwheel it does not replace the route, it sits above it.
    if (this.type.gait === 'paired' && !this.isDrop && !this.staged) this.pairOn(world, dt);

    if (this.type.gait === 'cartwheel' && !this.isDrop && !this.staged) {
      const want = CFG.cartwheel.spin * (this.frozen(world) ? 0.12 : 1);
      if (this.av * this.routeSide < want) this.av = this.routeSide * want;
    }

    /*
     * ---- ROLL takes the route's place, and only once the body is loose ----
     *
     * A roller marches in on the same sway every hostile does -- the staged
     * branch above owns that, and this one is `!this.staged` -- and then
     * takes no lane at all. The lateral is a constant that reverses at the
     * side walls instead of an arc that folds in as it closes, so the body
     * crosses the field rather than approaching along one, and the spin is
     * held in `rollOn`. It is still CLOSING: see CFG.roll for why a hostile
     * cannot take HUSK's ballistic tumble.
     */
    if (!this.staged && this.type.gait === 'roll' && !this.isDrop) {
      tx += this.rollOn(world, dt, ty);
      dx = tx - this.x;
      dy = ty - this.y;
      const nd = Math.hypot(dx, dy) || 1;
      dx /= nd;
      dy /= nd;
    } else if (!this.staged && this.type.gait === 'dive' && !this.isDrop) {
      /*
       * DIVE owns the steering outright rather than offsetting the route: the
       * whole gait is WHERE it is going, and a route's fold-in would pull the
       * lane back onto the machine -- measured, a lane offset by 40 is eaten
       * by the steering down to 35.3 and the body dies on the mount.
       */
      const [px, py] = this.diveOn(world, dt);
      tx = px;
      ty = py;
      dx = tx - this.x;
      dy = ty - this.y;
      const nd = Math.hypot(dx, dy) || 1;
      dx /= nd;
      dy /= nd;
    } else if (!this.staged && this.type.gait === 'flock' && !this.isDrop) {
      /*
       * FLOCK, in the route's place for `roll`'s reason -- see `flockOn`. A
       * staged body takes the ordinary march in, so a school arrives through
       * the mouth as a group and only starts flocking once it is loose.
       */
      const [ox, oy] = this.flockOn(world, dt);
      tx += ox;
      ty += oy;
      dx = tx - this.x;
      dy = ty - this.y;
      const nd = Math.hypot(dx, dy) || 1;
      dx /= nd;
      dy /= nd;
    } else if (!this.staged) {
      // Route offset: swing wide of the true bearing at long range and fold in
      // as the object closes, so each one arrives by its own arc.
      const r = this.route;
      /*
       * `commit` is an exponent, so a low one folds in very slowly: WIDE
       * (width 480, commit 0.35) still held a 293-unit sideways offset at 130
       * units out, which is not an approach, it is an orbit.
       *
       * So the offset is scaled off entirely across the last stretch,
       * whatever the route. An arc is how a thing arrives; it is not how it
       * spends the endgame.
       */
      let lateral = routeLateral(r, d, this.routeScale, this.routeSide);
      if (r.weave) lateral *= Math.sin(t * r.weave + this.phase);
      /*
       * A body just born curves ONTO its arc rather than turning onto it. The
       * lateral used to arrive whole on the frame `staged` came off, which on
       * a WIDE route is a 293-unit sideways offset appearing between two
       * frames -- the body visibly kinked at the rim. Blended in over
       * `settle`; a body that was never born has `bornFor` at 99 and never
       * enters this branch, so its arithmetic is untouched.
       */
      if (this.bornFor < CFG.portal.settle) lateral *= this.bornFor / CFG.portal.settle;
      tx += -dy * lateral;
      ty += dx * lateral;
      dx = tx - this.x;
      dy = ty - this.y;
      const nd = Math.hypot(dx, dy) || 1;
      dx /= nd;
      dy /= nd;
    }

    const wob = Math.sin(t * (0.7 + this.phase * 0.11) + this.phase) * (this.type.wobble || 1);
    // clumsy: the heading wanders around the true bearing
    const ang = Math.atan2(dy, dx) + wob * 0.24;
    dx = Math.cos(ang);
    dy = Math.sin(ang);

    const slow = this.frozen(world) ? 0.12 : 1;
    // Something that has already breached the turret commits to it, so the
    // corruption it causes is always clearable.
    let cruise = this.cruise * slow * (this.attacking ? 1.3 : 1);
    // The march in is brisk. The entry line is 260 units down the field and an
    // object crossing it at its own cruise would spend five seconds getting
    // there — the point of the depth is where things are engaged, not how long
    // the run takes to hand them over.
    /*
     * ...and it SLOWS THROUGH THE SURFACE. The march is hidden above the
     * portal's centre line, so there is nothing to see it be fast; what is
     * seen is the last two radii of it, and a body arriving at 2.6 times
     * its own cruise and braking on our side of the rim read as spat out.
     * The multiplier eases from `entrySpeed` at the top of the surface to 1
     * at the rim, so a body comes through at the speed it will go on at.
     * Zero depth -- above the surface, or no portal at all -- keeps the
     * one-line arithmetic this had before, to the bit.
     */
    if (this.staged) {
      const depth = portalDepth(world, this);
      cruise *= depth > 0 ? 1 + (CFG.entrySpeed - 1) * (1 - smoothstep(depth)) : CFG.entrySpeed;
    }
    // loiterers hang back at mid range before making their run
    if (this.route.dawdle && !this.staged && !OWN_SPEED.has(this.type.gait)) {
      /*
       * Measured to what it is actually going at, which without a DECOY is
       * the turret and the same arithmetic it always was -- deliberately, so
       * this cannot move the canonical hash. With one it is the decoy: a
       * LOITER standing on a decoy 300 units up-field was measured against
       * the turret, so it was permanently outside its own 260 and dawdled at
       * the thing it had already reached for ever.
       */
      const to = decoyTarget(world, this) || world.shooter;
      const dist = Math.hypot(to.x - this.x, to.y - this.y);
      // A depth threshold, not a capability: 260 is a fifth of era 1's column and
      // would be an eighth of era 2's, so a loiterer would dawdle over 1273 units
      // instead of 736 and take 1.72x longer where everything else takes 1.54x.
      if (dist > 260 * CFG.scale) cruise *= this.route.dawdle;
    }
    const speed = Math.hypot(this.vx, this.vy);
    /*
     * Steering yields to physics while a body is flying, so knockback stays
     * fun -- but only while the body is still going roughly where it wanted
     * to. It used to yield unconditionally, and the shove that mattered was
     * the one that reversed it: authority collapsed to 0.12 and the object
     * coasted away without turning round. Measured on build 110, one
     * invulnerable MOTE under auto fire on a direct route:
     *
     *   quiet       791 746 702 ... 344 299 255 209 166 121  78  39
     *   under fire  791 750 705 ... 445 402 473 672 969 1277 1305 1306
     *
     * It closed to 400 units, was blown back across the whole field, and was
     * still out there twenty seconds later. A LURCHER simply sat between 330
     * and 560 for the entire run.
     *
     * `along` is how much of the current velocity is going the way the object
     * wants. Negative means it is travelling away from where it is steering,
     * and that is exactly when it needs its authority back rather than least.
     */
    const along = speed > 1 ? (this.vx * dx + this.vy * dy) / speed : 1;
    const flying = clamp(1 - (speed / Math.max(cruise, 1) - 1) / 3, 0.12, 1);
    const authority = clamp(flying + Math.max(0, -along) * 0.9, 0.12, 1);
    const k = (this.accel / 100) * authority * slow;

    this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);
    this.vy += (dy * cruise - this.vy) * clamp(k * dt, 0, 1);
    /*
     * ...and INSIDE THE SURFACE the brake is a wall, not a blend. The target
     * speed above eases to the body's own cruise at the rim, but `k` is the
     * body's accel over its cruise -- a LURCHER's time constant is close to
     * two seconds -- so the body was still at 88 u/s against a cruise of 40
     * on the frame it came through: the ramp was written and the velocity
     * had not heard. The surface is viscous: a staged body in it cannot be
     * going faster than the ramp says. Above the surface `depth` is 0 and
     * nothing here runs, so the hidden march is what it was.
     */
    if (this.staged) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > cruise && portalDepth(world, this) > 0) {
        this.vx *= cruise / sp;
        this.vy *= cruise / sp;
      }
    }

    if (this.frozen(world)) {
      const f = Math.exp(-1.6 * dt);
      this.vx *= f;
      this.vy *= f;
    }

    // Lurchers shove themselves forward in bursts instead of gliding.
    if (this.type.lurch) {
      this.lurchTimer -= dt;
      if (this.lurchTimer <= 0 && !this.frozen(world)) {
        this.lurchTimer = rand(1.1, 2.4);
        this.vx += dx * rand(40, 90);
        this.vy += dy * rand(40, 90);
        this.av += spread(3);
      }
    }
  }

  update(world, dt) {
    /*
     * Dissolving. It steers nothing, heals nothing and answers to nothing --
     * the run it belonged to is being taken back, and the only thing left for
     * it to do is stop being on the screen. `dead` at the end of it, which is
     * what the sweep is watching for; `dissolved` was set with the fizzle, so
     * the sweep pays nothing and counts nothing for it.
     */
    if (this.fizzle > 0) {
      this.fizzle -= dt;
      if (this.fizzle <= 0) this.dead = true;
      return;
    }
    if (this.spawnIn > 0) this.spawnIn = Math.max(0, this.spawnIn - dt * 2.2);
    if (this.bornFor < 10) this.bornFor += dt;
    this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.slugged > 0) this.slugged = Math.max(0, this.slugged - dt);
    if (this.plow > 0) this.plow = Math.max(0, this.plow - dt);
    if (this.plateT > 0) this.plateT = Math.max(0, this.plateT - dt);
    /*
     * A DART POINTS WHERE IT IS GOING, and this is the one owner of that.
     *
     * `Enemy.draw` rotates by `angle`, which for every other body is a spawn
     * roll plus a spin -- and a body whose picture is a nose and a tail has
     * to be drawn along its heading or it reads as debris. Written here
     * rather than in `flockOn` so the march IN points too, and `av` is
     * zeroed so `integrate` has nothing to fight it with. It is not a field
     * on the type, because a facing is the gait's business: `upright` is
     * about a picture oriented to the WORLD, and this is a picture oriented
     * to the body's own travel.
     */
    /*
     * A FACING is the gait's business, not the type's. `upright` means "this
     * picture is oriented to the world"; these two are oriented to their own
     * travel, which is a different claim and cannot be a flag on the type --
     * a SHRIKE points down on the run and up on the climb.
     *
     * Here rather than in the gait itself, because neither gait's branch runs
     * for a STAGED body: a school would march in pointing wherever fourteen
     * spawn rolls left it, which is build 310's EMBER-trail fault.
     */
    if (FACES_TRAVEL.has(this.type.gait) && !this.isDrop) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 1) {
        this.angle = Math.atan2(this.vy, this.vx);
        this.av = 0;
      }
    }
    /*
     * MENDING: it closes unless you keep hitting it.
     *
     * Stopped by TWO hits inside the window rather than one, so a stray round
     * cannot switch the rule off -- with one, MENDING would be a rule about
     * the opening seconds of a wave and nothing after. It is deliberately the
     * same verb as a graft's regen and a different reason: a graft is
     * something stuck to the body and shot off, this is the body itself.
     */
    if (this.traits && !this.isDrop && this.hp < this.maxHp
        && hasTrait(this.traits, 'mending')) {
      const T = CFG.waves.tier;
      const now = world.time || 0;
      const pressed = now - this.hitAt2 < T.mendWindow;
      if (!pressed) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * T.mendRate * dt);
    }

    /*
     * A grafted body closes what you did not finish, once per second per ball.
     * Nothing else in the game heals, so this is the one object that punishes
     * spreading fire around -- and the answer to it is on its surface: shoot
     * the balls off and the healing goes with them.
     */
    if (this.graftCount) {
      const spin = this.frozen(world) ? 0.12 : 1;
      for (const g of this.grafts) g.a += this.graftSpin * dt * spin;
      if (this.hp < this.maxHp && this.graftRegen > 0) {
        this.hp = Math.min(this.maxHp, this.hp + this.graftRegen * dt);
      }
    }

    /*
     * RIME wears off on its own. The chill is a drag rather than a speed cap:
     * a per-second multiplier on the velocity, applied here and NOT inside
     * the steering.
     *
     * That makes it mass-INDEPENDENT -- `vx *= k` says nothing about mass --
     * so the old sentence here, "a heavy body coasts further out of it than a
     * light one", was describing physics this line does not do. What actually
     * varies between bodies is `accel`: `drive` re-accelerates toward cruise
     * every substep while this pulls the other way, so the steady state is
     * set by how hard the body steers, not by what it weighs. A body that
     * steers hard keeps a third to a half of its pace; one that barely steers
     * is genuinely stopped.
     *
     * Deliberately not routed through the steering the way STASIS is: STASIS
     * is a four-second freeze on a 21-second cooldown and RIME is a round
     * fired twice a second, so a chill the steering could not answer would be
     * a permanent field-wide stop.
     */
    if (this.chill > 0) {
      this.chill -= dt;
      const k = CFG.rounds.rime.drag ** dt;
      this.vx *= k;
      this.vy *= k;
    }
    if (this.wardT > 0) {
      this.wardT -= dt;
      if (this.wardT <= 0) this.ward = 0;
    }

    if (this.shards) {
      const spin = this.frozen(world) ? 0.12 : 1;
      for (const s of this.shards) s.a += this.shardSpin * dt * spin;
    }

    if (this.ttl > 0) {
      this.ttl -= dt;
      if (this.ttl <= 0) {
        this.dead = true;
        this.dissolved = true;
      }
    }

    if (this.type.ward) this.wardNearby(world, dt);
    if (this.type.eat) this.feed(world);

    if (this.staged) {
      // An object wedged on its way in would stall the run forever, since the
      // count only completes once every released object is destroyed. The
      // march is longer than it was, so the valve waits longer before shoving.
      this.stagedFor += dt;
      if (this.stagedFor > 14) this.vy += 130 * dt;
      // Past the entry line: it is loose in the arena now, and somewhere the
      // player can actually watch it be dealt with. The line is the portal's
      // lower rim (`entryLine`), so this is the frame a body is BORN on --
      // the whole of it is through the surface -- and the rim is told so.
      if (this.y - this.r > entryLine(world, ENTRY_Y)) {
        this.staged = false;
        portalBirth(world, this);
        // ...and only NOW does it fan. See `fan` in the constructor.
        if (this.fan) { this.vx += this.fan; this.fan = 0; }
      }
    }
  }

  // ------------------------------------------------------------ behaviours

  /**
   * HERALD. Covers the nearest few hostiles — never another beacon — so that
   * while covered they take a fraction of incoming damage. Both the thread and
   * the shell are drawn, so the beacon reads as the reason nothing else is
   * dying, and killing it is always a thing you can actually do.
   */
  wardNearby(world, dt) {
    const cfg = this.type.ward;
    this.warded = this.warded || [];
    this.warded.length = 0;
    if (this.staged || this.spawnIn > 0) return;
    const r2 = cfg.radius * cfg.radius;
    for (const e of world.enemies) {
      if (e === this || e.dead || e.harmless || e.staged) continue;
      // No beacon covers another beacon. Five HERALDs drifting together spent
      // eighteen of their twenty-five cover slots on each other and webbed the
      // screen doing it — a knot of them was near-unkillable, which is the
      // exact opposite of "kill the beacon, not the escort".
      if (e.type.ward) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      if (dx * dx + dy * dy > r2) continue;
      this.warded.push(e);
      // Refreshed every frame it is in range, so it lapses the moment the
      // beacon dies rather than needing a teardown pass.
      e.ward = Math.max(e.ward || 0, cfg.reduction);
      e.wardT = 0.12;
      if (this.warded.length >= cfg.max) break;
    }
    this.wardSpin = (this.wardSpin || 0) + dt * 1.4;
  }

  /**
   * GLUT. Eats fragments off the floor and gets bigger for it. Radius, mass
   * and hit points all move together, so a fed one really is a different
   * object by the time it arrives.
   */
  feed(world) {
    const cfg = this.type.eat;
    if (this.staged || this.spawnIn > 0) return;
    if (this.r >= cfg.maxR) return;
    for (const d of world.drops) {
      if (d.dead) continue;
      const reach = this.r + d.r + cfg.reach;
      const dx = d.x - this.x;
      const dy = d.y - this.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      d.dead = true;
      d.dissolved = true; // eaten, not destroyed: it must not score
      this.r = Math.min(cfg.maxR, this.r + cfg.growth);
      this.mass = massOf(this.type, this.r);
      this.invMass = 1 / this.mass;
      this.maxHp += cfg.hpPer;
      this.hp += cfg.hpPer;
      this.fed = (this.fed || 0) + 1;
      for (let i = 0; i < 4; i++) {
        spark(d.x, d.y, (this.x - d.x) * 2.2, (this.y - d.y) * 2.2, this.type.glow, 0.3, 2);
      }
      audio.pop(0.5);
      if (this.r >= cfg.maxR) break;
    }
  }

  // ---------------------------------------------------------------- damage

  /** A bolt stopped by one of the WARDEN's orbiting plates. */
  hitShard(s, dmg, hx, hy, nx, ny) {
    s.hp -= dmg;
    if (s.hp > 0) {
      hitBurst(hx, hy, nx, ny, '#ffffff');
      return;
    }
    s.alive = false;
    fxShard(hx, hy, spread(140), spread(140) - 40, this.type.color, 0.7, 7, 4);
    spark(hx, hy, spread(200), spread(200), this.type.glow, 0.3, 2.4);
    audio.reflect();
  }

  /**
   * A ball shot off a host. Everything it was giving comes off with it, which
   * is the whole point of it being a thing on the outside rather than a state
   * on the inside.
   */
  /*
   * `nx, ny` defaults to straight up for the one caller that genuinely has no
   * travel direction -- `applyBlast`, which pushes through the centre. The
   * projectile path passes the real normal off `contactAt`.
   */
  hitGraft(s, dmg, hx, hy, nx = 0, ny = -1) {
    if (!s.alive) return;
    s.hp -= dmg;
    if (s.hp > 0) {
      hitBurst(hx, hy, nx, ny, '#d9c2ff');
      return;
    }
    s.alive = false;
    this.refreshGrafts();
    ring(hx, hy, 2, CFG.graft.ball * 4, 0.34, '#c9a7ff', 2);
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      spark(hx, hy, Math.cos(a) * rand(70, 210), Math.sin(a) * rand(70, 210), '#d9c2ff', rand(0.2, 0.42), 2);
    }
    audio.reflect();
  }

  /**
   * A shove is a shove. A stream of them is not a conveyor belt.
   *
   * Knockback stacked without limit, so anything the turret kept shooting was
   * pushed back faster than it could steer in. Measured on build 110, one
   * invulnerable MOTE under auto fire on a direct route: it closed to 400
   * units, was blown out to 1306 -- past the top of the field -- and was
   * still out there twenty seconds later at vy -70, because every bolt that
   * reached it renewed the push. A LURCHER held station between 330 and 560
   * for a whole run. That is the "enemies stop and never arrive" this fixes.
   *
   * So repeated hits give diminishing shove. `kicked` counts effective hits
   * and bleeds off over CFG.physics.kickFade seconds, and each new hit is
   * scaled by 1/(1 + kicked). The first hit after a quiet moment lands at
   * exactly its old strength -- the punt is the fun part and is untouched --
   * while a sustained stream settles at about a third of it, which is well
   * inside what the object's own steering can answer.
   *
   * Damage is not touched. This is the impulse only.
   */
  shoveFade(dt) {
    if (this.kicked > 0) this.kicked = Math.max(0, this.kicked - dt / CFG.physics.kickFade);
  }

  /**
   * `dirx, diry` is the round's unit TRAVEL DIRECTION, not a surface normal.
   *
   * It was called `nx, ny` for eleven builds and that name is the direct cause
   * of three separate faults fixed in 211 -- PRISM's incidence test, both
   * ricochets and the impact spin all read it as a normal, because it is
   * spelled like one. The real normal comes from `contactAt` and is `c.nx,
   * c.ny`; nothing should take a normal from this argument.
   *
   * @returns 'reflect' | 'hit'
   */
  takeHit(world, dmg, hx, hy, dirx, diry, impulse, shred = 0, form = null, pr = 0, src = '', throwOff = false) {
    /*
     * Where it actually landed. See `contactAt` in physics.js: the point the
     * projectile sweep hands over is a clamped closest-point on one frame of
     * travel, so only its component ACROSS the travel means anything -- and
     * that component is the exact impact parameter.
     */
    const c = contactAt(this.hitCircleAt(hx, hy), hx, hy, dirx, diry, pr);

    /*
     * Prisms bounce glancing bolts; only a square-on hit lands.
     *
     * That is what this has always said and, until build 211, not what it did.
     * The old test was `((hx - x) / r, (hy - y) / r) . (dirx, diry)`, which
     * divides by the RADIUS rather than by the offset's own length -- so it
     * reduced to how far along its last step the round happened to stop, and
     * the impact parameter did not enter it at all. Measured across five
     * sub-frame phases at eleven offsets: a dead-centre shot landed three
     * times in five and bounced twice, and the incidence column was identical
     * for every offset from 0 to 0.4r. A lottery on the frame boundary, with
     * `reflect: 0.55` fitted to it.
     */
    if (this.type.reflect && c.incidence < this.type.reflect) {
      audio.reflect();
      return 'reflect';
    }

    if (form) {
      this.lastHit = form;
      this.lastHitT = world.time;
    }
    /*
     * The shove is along the travel, which is what this argument is -- and
     * whether it is a THROW comes from the round. It was hardcoded `false`
     * here, which was right while nothing fired by the turret was a
     * deliberate clear and wrong the moment HAIL became one.
     */
    this.applyDamage(world, dmg, dirx, diry, impulse, shred, c.b, throwOff, src);
    /*
     * The landing, per form -- AT THE CONTACT, ALONG THE NORMAL.
     *
     * Build 211 derived both of those and then drew the burst with neither.
     * It passed `hx, hy` -- the clamped closest point on one frame of travel,
     * which is the one part of the hit `contactAt`'s own header says is
     * meaningless -- and `-dirx, -diry`, which is the reversed travel wearing
     * a normal's old name. So the mechanics of an impact were right from 211
     * and the picture of one was still the picture from 210.
     *
     * Measured over two live runs, 304 landed hits: the burst was drawn a
     * median 20.9 world units from where the round actually met the surface
     * (p90 36.6, max 45.0 -- a whole BULWARK radius), and 10.4% of bursts were
     * drawn OUTSIDE the body they hit. Systematically short, too, never long:
     * the step ends before the surface, so every burst sat between the turret
     * and the impact, which is why it never looked obviously wrong.
     *
     * And the direction mattered as much as the point. `hitBurst` sprays in a
     * cone about the vector it is handed, so reversed travel threw every
     * impact straight back down the barrel line -- a rim graze and a centre
     * punch sprayed identically. `c.nx, c.ny` is the real outward normal at
     * the contact, so a graze now comes off the surface.
     *
     * ORDINAL's canonical hash does not move for this, and the reason is
     * exact rather than hopeful: the hash mixes body positions and energy,
     * particles are neither, and `hitBurst` makes the same number of rand()
     * draws wherever it is told to put them. The load-bearing property of the
     * default path is its DRAW COUNT, which is untouched. Re-run to confirm:
     * 1796395127.
     */
    if (form) impactFx(form, c.x, c.y, c.nx, c.ny, this.type.glow);
    else hitBurst(c.x, c.y, c.nx, c.ny, this.type.glow);
    return 'hit';
  }

  /**
   * @param lever the signed impact parameter, when the caller knows where the
   *   hit landed. A blast has no lever arm by construction -- it pushes
   *   through the centre -- so everything else leaves this at 0.
   */
  /**
   * @param throwOff a deliberate shove rather than a hit that happens to
   *   push. It skips the diminishing-returns fade and lifts the body's speed
   *   cap for a moment -- see the note at the fade below.
   */
  /**
   * @param src who is doing it -- an ARSENAL key, an ability id, or one of the
   *   few names in `SRC_EXTRA`. Recorded by the sandbox's ledger and ignored
   *   entirely in a normal run; see ledger.js for why it is taken here and not
   *   at the call site.
   */
  applyDamage(world, dmg, nx = 0, ny = 0, impulse = 0, shred = 0, lever = 0, throwOff = false, src = '') {
    if (this.dead) return;
    /*
     * Behind the wall is safe. Before the power multiplier, before ARMORED
     * and before the impulse, because none of it happened: a body with no
     * pixel past the wall's bottom line takes no damage and is not shoved.
     * `shielded` is false the moment `world.yard` is absent, so era 1 and the
     * testbed pay one property read.
     */
    if (!ENEMY_SRC.has(src) && shielded(world, this)) return;
    /*
     * The new field's damage, at the one door all seventeen come through. The
     * `!== 1` is not decoration: `applyDamage` runs tens of thousands of times
     * in a boss fight, and at era 1 this must cost a comparison and nothing
     * else -- no set lookup, no multiply, no rounding.
     *
     * Before the plate, the ward and the `Math.max(1, ...)` floor, so a
     * stronger round is still reduced by armour in proportion. NOT by touching
     * the floor or the fade, which are on every damage path.
     */
    if (CFG.power !== 1 && POWERED.has(src)) dmg *= CFG.power;
    /*
     * An energy mote cannot be hurt. It is not wreckage to be broken up a
     * second time — it is the charge the object was carrying, and the only
     * thing that can happen to it is being taken in. A blast still shoves it
     * around, which is why the impulse is applied before the return.
     */
    if (this.isDrop) {
      if (impulse) {
        this.vx += nx * impulse * this.invMass;
        this.vy += ny * impulse * this.invMass;
      }
      return;
    }
    /*
     * ARMORED: the first hit each second does nothing.
     *
     * Before the plate and before the ward, because it is not a reduction --
     * the hit did not happen. A rate rather than a percentage on purpose: it
     * costs a fast turret almost nothing and a slow one a great deal, which
     * is the one axis the roster's own armour does not already cover.
     */
    if (this.traits && hasTrait(this.traits, 'armored') && this.plateT <= 0) {
      this.plateT = CFG.waves.tier.plateEvery;
      this.flash = Math.min(1, this.flash + 0.35);
      /*
       * ...but a THROW still lands, and this return used to swallow it.
       *
       * ARMORED discards a HIT -- "the hit did not happen" -- and a deliberate
       * shove is not a hit. Everything with `throwOff` is a button with a
       * clock on it (PULSE, PILE, HEAVE, HAIL), and PULSE is the game's ONE
       * answer to a body sitting on the mount where the barrel cannot reach.
       * With the plate up, that answer did nothing at all: no damage, which is
       * the trait working, and no shove either, which is the trait reaching
       * something it was never about. A player pressing the only button that
       * clears the mount, and watching nothing happen.
       *
       * The `isDrop` branch four lines up already does exactly this and says
       * why: the impulse is applied before the return because being unable to
       * HURT a thing is not the same as being unable to MOVE it.
       *
       * Ordinary gunfire is untouched -- it carries no `throwOff`, so a plated
       * round is still a round that did not happen, which is the whole of the
       * trait against the gun.
       */
      if (throwOff && impulse) {
        this.thrown = Math.max(this.thrown || 0, CFG.pile.thrown);
        const push = impulse * this.invMass;
        this.vx += nx * push;
        this.vy += ny * push;
      }
      return;
    }
    // MENDING counts hits, and needs the one before last: two inside the
    // window stop it closing. One stray round must never switch a rule off.
    this.hitAt2 = this.hitAt;
    this.hitAt = world.time || 0;
    // A HERALD's cover, if one is refreshing it. It lapses a frame after the
    // beacon stops covering, which is what makes killing the beacon feel like
    // the answer rather than a statistic.
    const ward = this.wardT > 0 ? (this.ward || 0) : 0;
    // RAILED lets a SPINE through the plate rather than into it: `shred` is
    // the fraction of this body's armour the round simply does not meet.
    let plate = this.armor * (1 - shred);
    /*
     * ...and a PLATED body carries it on one FACE. Gated on the type, so the
     * expression above is unchanged to the bit for every other body in the
     * game -- which is the claim the ORDINAL hash is run to check.
     *
     * `nx, ny` is the direction the damage travels and every caller already
     * passes it, so `-(n . facing)` is the frontness: +1 dead ahead, 0 from
     * the side, -1 from behind. The five callers that pass `0, 0` -- contact,
     * ARC's chain, a Patch's bite, HARD CASING and TITHE's bonus -- read 0
     * and meet no plate, because a hit with no direction cannot be asked
     * which face it landed on. See CFG.flint.
     */
    if (plate > 0 && this.type.plated) plate = this.frontal(nx, ny) ? plate : 0;
    const real = Math.max(1, dmg * (1 - plate) * (1 - ward));
    /*
     * Booked HERE, and this is the only honest place for it: past ARMORED's
     * discard, past the plate, past a HERALD's ward and past the floor. The
     * overkill is the part of the hit the body did not have left to take --
     * zero against a practice dummy, and against a real wave the difference
     * between output and what output was worth.
     */
    if (ledger.on) ledger.note(src, real, Math.max(0, real - this.hp), real >= this.hp);
    // ...and the dummy IS a readout: it shows the delivered number, for the
    // same reason the ledger books it -- what the caller asked for is not
    // what the body lost.
    if (this.dummy) dummyHit(world, this, real, nx, ny);
    this.hp -= real;
    this.flash = Math.min(1, this.flash + 0.5 + real / 260);
    if (impulse) {
      /*
       * Diminishing returns on a stream of hits — see shoveFade(). A
       * deliberate THROW does not pay it, and does not pay the speed cap
       * either.
       *
       * PULSE paid both, and it is the game's one escape from a body on the
       * mount. Measured on a BULWARK, which needs 6.4 units of separation to
       * be released: quiet, a PULSE moves it 6.38 -- it fails by two
       * hundredths. Under ordinary fire `kicked` settles at 4.25, the fade is
       * 0.19, and the same PULSE moves it 0.35 units. So the turret shooting
       * disarmed the only answer to the glitch timer, and `world.attackers`
       * never emptied, so `Director.held` never reset and the fuse kept
       * closing through the press.
       *
       * The cap is the other half: `physics.integrate` clamps to `cruise * 6`
       * unless `thrown` is set, and applyBlast never set it -- so PULSE was
       * clipped on 8 of the 14 field types (a MOTE took 24% of its rated
       * shove) and SHOCKFRONT's +30% bought those eight exactly nothing.
       *
       * Opt-in, so a mine or an HE burst is unchanged: only a caller that
       * says it is throwing gets it.
       */
      const fade = throwOff ? 1 : 1 / (1 + (this.kicked || 0));
      if (!throwOff) this.kicked = (this.kicked || 0) + fade;
      /*
       * Only a deliberate, one-press clear lifts the ceiling. Build 220 tried
       * giving SLUG the same exemption on the grounds that its whole identity
       * is the impulse and `(cruise || 60) * 6` clips it to 137 u/s against a
       * BULWARK -- true arithmetic, and it reopens build 110: measured, a
       * LURCHER under sustained SLUG with two HEAVYs goes out to 1293 units
       * of an 817-unit field and never comes back. A round fired one and a
       * half times a second cannot be exempt from the ceiling however heavy
       * it is; see the note at SLUG's own fire call and the case that pins it.
       */
      if (throwOff) this.thrown = Math.max(this.thrown || 0, CFG.pile.thrown);
      const push = impulse * this.invMass * fade;
      /*
       * The linear part is UNCHANGED, and deliberately so: an impulse applied
       * off-centre still delivers all of itself to the centre of mass. Where
       * it landed adds angular momentum; it does not subtract linear. So this
       * change costs the knockback ladder nothing -- HEAVY is worth exactly
       * what it was worth -- and buys the spin for free.
       */
      this.vx += nx * push;
      this.vy += ny * push;
      /*
       * ...and the spin is now the lever arm rather than a coin toss.
       *
       * Δω = L/I with I = ½mr² for a uniform disc, which is the same model
       * `resolvePair` already uses for collision friction -- so a body shoved
       * by a round and a body scraped by another body agree about what spin
       * means. It used to be `spread(push * 0.02)`: a scatter proportional to
       * the shove and unrelated to where the round hit, so a rim shot and a
       * centre punch span the same amount, in a random direction.
       *
       * ---- and the sign is NEGATIVE, which build 211 got wrong ----
       *
       * `lever` is measured along `perp = (-diry, dirx)`, and the impulse is
       * `push` along `dir`, so the angular impulse is
       *
       *   L = r x J = (b*perp.x)(push*dir.y) - (b*perp.y)(push*dir.x)
       *             = b*push*(-dir.y*dir.y - dir.x*dir.x)
       *             = -b*push
       *
       * -- the two terms of the cross product have the same sign here, not
       * opposite ones, because `perp` is the travel turned a quarter turn one
       * way and the cross product turns it the other. Shipped as `+` and every
       * body on the field turned the wrong way: measured across six
       * arrangements of travel and offset, all six inverted. A round from
       * below striking left of centre pushes the left side away from you,
       * which is CLOCKWISE on a canvas whose y runs down, and it went
       * anticlockwise.
       *
       * Capped in `integrate`, because the honest value is very fast on a
       * light body -- see CFG.physics.maxSpin.
       */
      if (lever) this.av -= (2 * lever * push) / (this.r * this.r);
    }
    /*
     * TETHERED: the pair is one body with two shapes.
     *
     * Written across rather than halved, so shooting either half is shooting
     * the same health -- which is the point, and is what makes a tethered
     * pair different from two bodies that happen to be joined. Guarded on the
     * other half being alive and traited, so a TOW's own tether (which shares
     * nothing) is untouched.
     */
    const o = this.tether && this.tether.other;
    if (o && !o.dead && o.traits && hasTrait(o.traits, 'tethered')
        && hasTrait(this.traits, 'tethered')) {
      o.hp = this.hp;
      o.flash = this.flash;
      if (o.hp <= 0) o.destroy(world);
    }
    // A YOKE's two halves read one number, and which of them absorbed it is
    // what decides whether the beam breaks. See `pourPool`.
    if (this.beam) this.pourPool(world, real);
    if (this.hp <= 0) this.destroy(world);
  }

  destroy(world) {
    if (this.dead) return;
    /*
     * A body finished off while it is dissolving is not a kill and pays
     * nothing, whatever finished it.
     *
     * The fizzle marks `spent`, so rounds pass straight through and the
     * assist will not look at it -- but `spent` has only ever had three
     * readers (autoTarget, its hysteresis, and the projectile sweep) and
     * blasts, mines, patches and every ability still test `dead` alone. So
     * the guard belongs here, at the one door all of them come through,
     * rather than on each of them.
     */
    if (this.fizzle > 0) { this.dead = true; return; }
    this.dead = true;
    const t = this.type;
    /*
     * The BELL rings. Set here rather than anywhere else because `destroy` is
     * the door a DAMAGE death comes through, which is the only way a hover
     * body ever leaves -- and the `fizzle` guard above means a bell taken by
     * the glitch dissolve rings for nobody, which is right: nobody shot it.
     * Topped up to the full window rather than added to, so two bells are two
     * seconds of instrument and not four.
     */
    if (t.rings) world.bell = Math.max(world.bell || 0, CFG.bell.ring);
    // Destroying a fragment is a way of collecting it, not a way of losing it.
    if (this.bytes) bank(world, this.bytes * this.bounty, this.x, this.y);
    // The harmless ones pay too. It is the one income the tally never sees.
    else if (this.harmless) bank(world, CFG.energy.drift * this.bounty, this.x, this.y);
    explode(this.x, this.y, this.r, t.color, t.glow, this.isDrop ? 0.55 : 1);
    /*
     * ...and the death wears what killed it, if the kill is fresh: frozen
     * through, burned out, earthed, bisected, crushed, gone to spores, or
     * paid in full. Half a second of freshness, because a body tagged by
     * RIME a while ago and finished by a PULSE did not die of ice.
     */
    if (this.lastHit && world.time - this.lastHitT < 0.5 && !this.isDrop) {
      deathFx(this.lastHit, this.x, this.y, this.r);
    }
    audio.pop(clamp(this.r / 22, 0.5, 2.4));

    if (this.isDrop) return;

    /*
     * A TOW lets go of its load as it dies.
     *
     * Measured at tier 9 against a bought damage line, five pairs released the
     * way the director releases them: two of the five threw nothing at all.
     * One head was dead at 7.2 seconds, still 600 units out, having never
     * begun to wind -- 135 health across an approach that takes the better
     * part of half a minute. The type's entire picture is the load coming off
     * the cable, and the commonest thing a TOW did was be shot before anyone
     * saw it.
     *
     * So the release is not a reward for surviving the wind, it is what the
     * body is FOR, and the wind decides how hard rather than whether: a head
     * killed cold throws at `hurl.partial` of full speed, one killed on the
     * last frame of its wind at all of it. Killing it early is still the right
     * play and still buys most of what it used to; it stops being an erasure.
     *
     * Before `t.detonate` and the rest deliberately -- the load leaves under
     * its own release, with its own clearing shove, rather than being scattered
     * by whatever else this death is about to do.
     */
    if (t.hurl && this.tether) {
      this.release(world, (this.wind || 0) / t.hurl.wind);
    }

    // Bloom: takes the neighbourhood with it.
    if (t.detonate) {
      ring(this.x, this.y, this.r, t.detonate.radius, 0.34, t.glow, 5);
      ring(this.x, this.y, this.r, t.detonate.radius * 0.7, 0.22, '#ffffff', 2);
      ripple(this.x, this.y, 1.6, t.detonate.radius * 3);
      world.pendingBlasts.push({
        x: this.x, y: this.y, r: t.detonate.radius,
        damage: t.detonate.damage, impulse: 260, source: this,
        // The field hurting itself. Booked under its own name rather than
        // under whatever killed the BLOOM, because a chain running through a
        // crowd is a thing the player did and not a thing the round did.
        src: 'bloom',
      });
    }

    // SCION: it throws seeds rather than simply coming apart. They are
    // harmless bodies, so nothing about them is owed to the field cap.
    if (t.id === 'scion') {
      const G = CFG.graft;
      for (let i = 0; i < G.seeds; i++) {
        const a = (i / G.seeds) * TAU + rand(0, TAU);
        const seed = new Enemy(TYPE_BY_ID.seed, this.x, this.y, {
          staged: false,
          spawnIn: 0.5,
          vx: this.vx + Math.cos(a) * G.spread,
          vy: this.vy + Math.sin(a) * G.spread,
        });
        world.enemies.push(seed);
      }
      ring(this.x, this.y, this.r, this.r * 3.4, 0.5, '#c9a7ff', 4);
      ripple(this.x, this.y, 1.4, this.r * 6);
    }

    // Splitter: children keep the parent's momentum.
    /*
     * ---- ...and a QUARRY's children are its OWN type (build 312) ---------
     *
     * `splits.type` naming the parent's own id is the whole of the fracture:
     * one type, one drawing, one codex entry, and the GENERATION is the
     * body's radius rather than a field on it. A body splits only while its
     * radius is above `splits.floor`, so r 40 breaks into three at 24, each
     * of those into three at 14.4, and 14.4 stops -- nine bodies out of one,
     * with the recursion terminated by arithmetic rather than by a counter
     * that every one of the six places that set `dead` would have to carry.
     *
     * The children's health, plate and speed come off the PARENT's, not off
     * the type's, for two reasons. `scaleToTier` has already multiplied the
     * parent's `maxHp` by the rung, so deriving from the type and scaling
     * again would apply the rung twice -- which is the shape of fault build
     * 231's note about instruments is: a tautology that reads as a result.
     * And a body that has been shot down from 420 to 30 and then breaks
     * should not hand out three children at full health.
     */
    const sameKind = t.splits && t.splits.type === t.id;
    const bigEnough = !sameKind || this.r >= t.splits.floor;
    if (t.splits && bigEnough) {
      const child = TYPE_BY_ID[t.splits.type];
      const Q = CFG.quarry;
      /*
       * ...and the RADIUS is the parent's own too, for the reason the
       * ceiling and the plate below are: `this.r` is what the ring has grown
       * it to. A SEED grows its host by a fifth of its radius per ball, so a
       * fully ridden QUARRY stands at 64 and its children came out at 38.4
       * instead of 24 -- which is mass, hit size and salvage, and one more
       * generation before `splits.floor` stops the cascade. Third face of
       * one bug; see the `sameKind` block below.
       */
      const kidR = sameKind
        ? (this.grafts ? this.graftBaseR : this.r) * t.splits.scale
        : child.r;
      // A body carrying shards releases only the ones still on it: shoot the
      // plates off a WARDEN and there are fewer left to come at you when the
      // core finally goes.
      const alive = this.shards ? this.shards.filter((sh) => sh.alive).length : t.splits.count;
      const count = Math.min(t.splits.count, alive);
      for (let i = 0; i < count; i++) {
        // a little over the cap: a split should not be silently swallowed
        if (hostileCount(world) >= CFG.maxEnemies + 8) break;
        const a = (i / count) * TAU + rand(0, 1);
        const sp = rand(90, 190);
        const kid = new Enemy(child, this.x + Math.cos(a) * this.r * 0.7, this.y + Math.sin(a) * this.r * 0.7, {
          vx: this.vx * 0.5 + Math.cos(a) * sp,
          vy: this.vy * 0.5 + Math.sin(a) * sp,
          staged: this.staged,
          spawnIn: 0.6,
          r: kidR,
        });
        // The tier, which this used to miss entirely. It is made HERE and
        // not released, so it never passes through `spawnOne` -- and the
        // multiplier lived inside `spawnOne` under a comment claiming that
        // was the one door. Most of a SPLITTER's and a WARDEN's mass was
        // arriving at tier-1 health and paying tier-1 energy.
        scaleToTier(world, kid, child);
        // ...and then the parent's, for a fracture. AFTER `scaleToTier`, or
        // the rung is applied to a figure that already carries it.
        if (sameKind) {
          /*
           * The parent's OWN ceiling and plate, not the RING's.
           *
           * `this.maxHp` and `this.armor` are what the balls riding it have
           * made of it, and the whole promise of a ring is that shooting one
           * off takes its share back -- so passing the boost to the children
           * is the share not coming back, permanently, out of a ring that no
           * longer exists. Measured on a QUARRY with a full ring: a SEED's
           * three took the parent 459 to 1285 and each child from 118 health
           * to **386**, and a LATCH's three took the plate 0.22 to 0.8 and
           * each child from 0.121 to **0.44**.
           *
           * The health half is older than the armour half -- it has been
           * there since QUARRY met a SEED in build 312 -- and both are the
           * same line, so both are fixed here. `graftBase*` is what the body
           * was before any ball landed, taken after `scaleToTier`, which is
           * exactly the figure a child should be a share of.
           */
          const ownHp = this.grafts ? this.graftBaseHp : this.maxHp;
          const ownArmor = this.grafts ? this.graftBaseArmor : this.armor;
          kid.maxHp = Math.max(1, Math.round(ownHp * Q.hpAt));
          kid.hp = kid.maxHp;
          kid.armor = ownArmor * Q.armorAt;
          kid.cruise = this.cruise * Q.speedAt;
        }
        world.enemies.push(kid);
        world.released++;
        // Made HERE rather than released, so it never goes through spawnOne:
        // it takes the wave off the body it came out of. See tagBody.
        tagBody(world, kid, this);
      }
    }

    // Wreckage. Only the four largest objects shed it, and they shed a lot of
    // it — the point is that a BULWARK coming apart looks like a BULWARK
    // coming apart, and that it happens rarely enough to stay an event.
    if (t.debris) shed(world, this, t.debris);

    // Energy: destructible, pushable, does not count toward the tally. A body
    // carries its worth between its pieces, so what a thing pays is what it
    // was made of.
    /*
     * ...and none of it on the bench. The sandbox has no purse, so salvage
     * there would be a floor filling with motes that can never be spent --
     * and the intake's own animation on a screen that is deliberately quiet.
     * Refused at the source rather than at `bank`, so nothing is made either.
     */
    /*
     * ---- a fracture pays through its PIECES, not twice (build 312) -------
     *
     * `shed` values a mote off the body's own MASS, and three children at
     * 0.6 of the radius carry 3 * 0.36 = 1.08 of their parent's area -- so
     * the mass is conserved across a fracture and paying at every generation
     * would pay for the same rock three times over. A body that broke into
     * its own kind sheds nothing; the nine that cannot break pay for all of
     * it. Their COUNT comes off the radius too, which is the generation:
     * (14.4 / 40)^2 of QUARRY's eight is one mote each, nine in total.
     */
    const fractured = sameKind && bigEnough;
    const share = sameKind ? (this.r / t.r) ** 2 : 1;
    const paid = t.drops ? Math.max(1, Math.round(t.drops * share)) : 0;
    const n = world.sandbox || fractured ? 0 : paid;
    /*
     * ---- and the salvage is QUANTISED, which the byte migration exposed ----
     *
     * Both roundings here used to land on whole POINTS, because a point was
     * the unit: a mote came out worth 1, 2, 3, 5 or 8 and never 6.24. Under
     * a straight x1000 they land on whole BYTES instead, which quantises a
     * thousand times finer -- and that is not the same number scaled, it is
     * the old rounding error REMOVED. Measured against an exact x1000 of what
     * each type used to pay: HERALD -22%, MITE -27%, PLATE -15%, and the
     * other way TOW +12%, LEMMA +17.6%. A unit change that moves what a body
     * pays by a quarter is a balance change, which this one is explicitly not.
     *
     * So the quantum is written down instead of being an accident of the unit.
     * It is `minValue` -- the smallest a mote may be worth -- and rounding to
     * a multiple of it reproduces the old payout for all 126 (type, radius)
     * pairs to the byte. De-quantising is arguably the better number and it is
     * available whenever somebody wants it; it is a decision with a table
     * behind it, not a side effect.
     */
    const q = CFG.energy.minValue;
    const worth = Math.max(n * q, Math.round(massOf(t, this.r) * CFG.energy.perMass / q) * q);
    const each = Math.max(q, Math.round(worth / Math.max(1, n) / q) * q);
    for (let i = 0; i < n; i++) {
      if (world.drops.length >= CFG.maxDrops) break;
      const a = rand(0, TAU);
      const sp = rand(70, 240);
      // A fraction of the parent, but never bigger than energy is allowed
      // to draw. The ceiling is drawn rather than fixed: a flat clamp pinned
      // every chip off anything large to exactly the maximum, and a floor of
      // identical pieces reads as tiling rather than as wreckage.
      const dr = Math.min(
        rand(this.r * 0.16, this.r * 0.3),
        rand(CFG.drop.min, CFG.drop.max),
      );
      world.drops.push(new Enemy(t, this.x + Math.cos(a) * this.r * 0.5, this.y + Math.sin(a) * this.r * 0.5, {
        drop: true,
        r: dr,
        hp: 8 + dr,
        vx: this.vx * 0.4 + Math.cos(a) * sp,
        vy: this.vy * 0.4 + Math.sin(a) * sp,
        bytes: each,
      }));
      // TITHE marks the body, but the salvage rides on what the body leaves —
      // so the mark has to come with it or the round pays nothing at all.
      const mote = world.drops[world.drops.length - 1];
      mote.bounty = this.bounty;
      // ...and so does the wave's rule, for the same reason: EBB is a rule
      // about wreckage, and wreckage is made here rather than released.
      mote.traits = this.traits;
    }
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, world) {
    // The practice dummy is its own object, not one of the roster's shapes
    // wearing a hat -- the BULWARK it is built out of is how it gets physics
    // and a damage path for free, and nothing else.
    if (this.dummy) { drawDummy(ctx, this, world); return; }
    const t = this.type;
    const hpFrac = clamp(this.hp / this.maxHp, 0, 1);
    /*
     * Two scales, one variable. Arriving grows in from 0.4; dissolving shrinks
     * away and takes the whole body's opacity with it, so a fizzled field
     * reads as the picture being withdrawn rather than as forty things dying
     * at once -- there is no explosion anywhere in it, which is the point.
     */
    const gone = this.fizzle > 0
      ? clamp(this.fizzle / (CFG.waves.glitch.fizzle || 1), 0, 1) : 1;
    const s = (this.spawnIn > 0 ? 1 - this.spawnIn * 0.6 : 1) * (0.72 + gone * 0.28);

    ctx.save();
    ctx.translate(this.x, this.y);
    /*
     * ---- SOME PICTURES ARE WORLD-UP (build 310) --------------------------
     *
     * `angle` is `rand(0, TAU)` in the constructor and every body also gets a
     * random `av`, so a shape helper drawing "below" or "over the top" is
     * drawing in a frame that is rotated by a random amount and slowly
     * turning. Two of the objects this rig shipped in 307 and 308 did exactly
     * that and their own docstrings claimed otherwise: EMBER's trail is "two
     * ticks BELOW it, which is the ground it has left" and LANTERN's bail is
     * "a hook over the top" -- and both pointed wherever the spawn roll put
     * them and rotated as the body drifted.
     *
     * `upright` is the type saying its picture is oriented to the WORLD and
     * not to the body: a spark rises and a cage hangs. HUSK deliberately does
     * NOT carry it, because "end over end" is the whole of that object.
     * `point` is the neighbouring idea for a body whose heading follows its
     * travel (see `Enemy.face`).
     */
    if (!t.upright) ctx.rotate(this.angle);
    if (s !== 1) ctx.scale(s, s);
    if (gone !== 1) ctx.globalAlpha *= gone * gone;

    /*
     * Ambient glow. Skipped on a fixed body unless it has just been hit:
     * ORDINAL puts forty segments on the field at once and draws a halo over
     * all of them itself, so forty more glow blits a frame bought nothing.
     */
    if (!t.fixed || this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, t.glow, 0, 0, this.r * 2.1, 0.24 + this.flash * 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }

    const dim = 0.45 + hpFrac * 0.55;
    if (this.isDrop) {
      // Energy is not damaged and has no health to read, so it is drawn at
      // full brightness and additively: a floor of it should glow.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(t.color, 0.5);
      ctx.strokeStyle = rgba(t.color, 0.75);
      ctx.lineWidth = Math.max(CFG.hairline * 0.8, this.r * 0.22);
    } else {
      // Weight, read off the density the table has always carried. See
      // materialOf(): 0.16/0.09r for everything became 0.07-0.37 fill on a
      // line of 0.062-0.134r, so a BULWARK arrives as something solid and a
      // SEED as something you could put a hand through.
      const m = materialOf(t);
      ctx.fillStyle = rgba(t.color, m.fill * dim);
      ctx.strokeStyle = rgba(t.color, 0.55 + 0.45 * dim);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * m.line);
    }

    /*
     * THE TITHE MARK.
     *
     * `marks` has driven this round's whole ramp since it shipped -- the
     * damage a hit adds and the salvage the body pays are both read off it --
     * and it was never drawn. A round whose entire point is that it gets
     * stronger the longer you stay on one body gave the player no way to see
     * whether they were on the right body, how far in they were, or that
     * anything was happening at all. The number was in the simulation and
     * nowhere on the screen.
     *
     * Drawn as strokes cut into the body's own outline, one per mark, closing
     * into a ring as it deepens -- so a marked thing reads at a glance and a
     * nearly-spent one reads as nearly closed. Under the shape, so it looks
     * cut in rather than stuck on.
     */
    if (this.marks > 0 && !this.isDrop) {
      const TONE = '#40e693';
      // Eight seats, because CFG.rounds.tithe.marks is 8 -- the depth the
      // round reaches on its own. LIEN raises the cap to fourteen, and those
      // last six are drawn on a second ring inside the first, offset half a
      // seat so they interleave. The first draft ran the seat angle off
      // `i / full` for every mark, so mark 9 landed exactly on mark 1 and a
      // body worth 14 was indistinguishable from one worth 8.
      const full = 8;
      const rr = this.r * 1.24;
      const deep = Math.min(1, this.marks / full);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // The ring itself tightens and brightens with the mark.
      ctx.strokeStyle = rgba(TONE, 0.13 + deep * 0.3);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      // A stroke per mark, cut inward. They accumulate clockwise from the top
      // so the count is readable without being a number.
      ctx.lineWidth = Math.max(CFG.hairline * 1.4, this.r * 0.1);
      ctx.strokeStyle = rgba(TONE, 0.55 + deep * 0.45);
      const len = this.r * (0.2 + deep * 0.12);
      const tick = (i, radius, reach) => {
        const ang = -Math.PI / 2 + ((i % full) / full) * TAU + (i >= full ? Math.PI / full : 0);
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(cx * (radius - reach), cy * (radius - reach));
        ctx.lineTo(cx * (radius + reach * 0.25), cy * (radius + reach * 0.25));
        ctx.stroke();
      };
      const outer = Math.min(this.marks, full);
      for (let i = 0; i < outer; i++) tick(i, rr, len);
      /*
       * Past eight, the marks go outward: shorter strokes in the gaps between
       * the seats, outside the ring. Outward rather than inward because the
       * first attempt put them at 0.98r, on top of the body's own outline,
       * where six of them were worth twenty-seven pixels and read as nothing.
       */
      const over = Math.min(this.marks - full, full);
      if (over > 0) {
        ctx.strokeStyle = rgba(TONE, 0.5 + deep * 0.35);
        ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.085);
        for (let i = full; i < full + over; i++) tick(i, rr + len * 0.95, len * 0.62);
      }
      // Full: the ring closes and the body carries a steady bloom, so "this
      // one is paying out" is visible across the field.
      if (this.marks >= full) {
        drawGlow(ctx, TONE, 0, 0, this.r * 1.9, 0.16 + 0.07 * Math.sin(world.time * 5 + this.phase));
      }
      ctx.restore();
    }

    /*
     * PLATED. A second line inside the first, on anything the table marks
     * `armor`.
     *
     * Armour is the one property that changes how you fight a body -- a
     * BULWARK at 676 health behind plate wants a different round from a
     * SCION at 390 without it -- and it was invisible. Drawn before the
     * shape and inside it, so it reads as a liner rather than as a halo, and
     * it fades with health like everything else: a plated thing coming apart
     * loses its plate first.
     *
     * ---- and a CLOSED ring is a claim about the whole body ----------------
     *
     * `materialOf(t).plate` is `!!t.armor`, so this drew a complete circle
     * for FLINT -- the one body in the game whose entire identity is armour
     * on ONE face -- underneath its own directional arcs. A marker whose
     * stated job is making armour legible, saying the opposite of the truth
     * about the only body it is the whole point of. Nothing could fail for
     * it: the ring is drawn, the arcs are drawn, and both are the right
     * colour. A type that says which WAY its armour faces draws its own, and
     * the general ring is for armour that really is all round.
     */
    if (materialOf(t).plate && !t.plated && !this.isDrop) {
      ctx.save();
      ctx.strokeStyle = rgba(t.color, 0.3 + 0.34 * dim);
      ctx.lineWidth = Math.max(CFG.hairline, this.r * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.7, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    switch (this.isDrop ? 'drop' : t.shape) {
      case 'shard': drawShard(ctx, this.r); break;
      case 'needle': drawNeedle(ctx, this.r); break;
      case 'hex': drawHex(ctx, this.r); break;
      case 'blob': drawBlob(ctx, this.r, this.phase, world.time); break;
      case 'bloom': drawBloom(ctx, this.r, this.phase, world.time, t); break;
      case 'plated': drawPlated(ctx, this.r, hpFrac); break;
      case 'plate': drawPlate(ctx, this.r); break;
      case 'warden': drawWardenCore(ctx, this.r); break;
      case 'prism': drawPrism(ctx, this.r); break;
      case 'herald': drawHerald(ctx, this.r, this.wardSpin || 0); break;
      case 'glut': drawGlut(ctx, this.r, this.fed || 0, this.phase, world.time); break;
      case 'tally': drawTally(ctx, this.r, hpFrac); break;
      case 'ordinal': drawOrdinal(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'digit': drawDigit(ctx, this.r, this.phase, world.time); break;
      case 'dial': drawDial(ctx, this.r, hpFrac); break;
      case 'gnomon': drawGnomon(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'second': drawSecond(ctx, this.r, this.phase, world.time); break;
      case 'mite': drawTri(ctx, this.r, hpFrac, 0); break;
      case 'fraction': drawTri(ctx, this.r, hpFrac, 1); break;
      case 'fractal': drawTri(ctx, this.r, hpFrac, 2); break;
      case 'crest': drawCrest(ctx, this.r, hpFrac); break;
      case 'amplitude': drawAmplitude(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'droplet': drawDroplet(ctx, this.r, this.phase, world.time); break;
      case 'pylon': drawPylon(ctx, this.r, hpFrac); break;
      case 'dynamo': drawDynamo(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'ion': drawIon(ctx, this.r, this.phase, world.time); break;
      case 'pane': drawPane(ctx, this.r, hpFrac); break;
      case 'parity': drawParity(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'echo': drawEcho(ctx, this.r, this.phase, world.time); break;
      case 'bound': drawBound(ctx, this.r, hpFrac); break;
      case 'terminus': drawTerminus(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'axiom': drawAxiom(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'clause': drawClause(ctx, this.r, hpFrac); break;
      case 'lemma': drawLemma(ctx, this.r, this.phase, world.time); break;
      case 'tessera': drawTessera(ctx, this.r, this.phase, world.time, hpFrac); break;
      case 'tile': drawTile(ctx, this.r, hpFrac); break;
      case 'limit': drawLimit(ctx, this.r, this.phase, world.time); break;
      case 'tow': drawTowHead(ctx, this.r); break;
      case 'mass': drawTowMass(ctx, this.r, hpFrac); break;
      case 'drift': drawDrift(ctx, this.r, this.phase, world.time); break;
      case 'ember': drawEmber(ctx, this.r, this.phase, world.time); break;
      case 'husk': drawHusk(ctx, this.r, this.phase, world.time); break;
      case 'lantern': drawLantern(ctx, this.r, this.phase, world.time); break;
      case 'bead': drawBead(ctx, this.r, this.phase, world.time); break;
      case 'bell': drawBell(ctx, this.r, this.phase, world.time); break;
      case 'quarry': drawQuarry(ctx, this.r, this.phase, world.time); break;
      case 'dart': drawDart(ctx, this.r, this.phase, world.time); break;
      case 'bar': drawBar(ctx, this.r, this.phase, world.time); break;
      case 'yoke': drawYoke(ctx, this.r, this.phase, world.time, this.beam); break;
      case 'flint': drawFlint(ctx, this.r, this.phase, world.time); break;
      case 'shrike': drawShrike(ctx, this.r, this.phase, world.time,
        this.divePhase === 'dive' && !(this.fizzle > 0)); break;
      case 'scion': drawScion(ctx, this.r, this.phase, world.time); break;
      case 'seed': drawSeed(ctx, this.r, this.phase, world.time); break;
      case 'latch': drawLatch(ctx, this.r, this.phase, world.time); break;
      case 'drop': drawDrop(ctx, this.r, this.phase, world.time); break;
      default: drawChip(ctx, this.r, this.phase);
    }

    if (this.flash > 0.01) {
      // A disc, not ctx.fill() on whatever sub-path the shape left behind —
      // several of the shapes end on an open stroke path.
      //
      // Multiplied into whatever is already set and put BACK, not reset to 1.
      // The fizzle sets the body's alpha at the top of this method and
      // `flash` freezes where it was (update refuses a dissolving body), so
      // a body hit just before the simulation stepped back drew its hit
      // flash at full strength and handed full opacity to everything after
      // it. Same trap as drawGlow, one method further in.
      const was = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = was * clamp(this.flash, 0, 1) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 0.92, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = was;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    /*
     * The balls a SCION left on this body (unrotated frame, like the plates).
     *
     * Drawn as the SEED they arrived as, on a thread back to the body, and
     * each one dims as it is worn down — so a ball that is nearly off looks
     * nearly off. They are the same object they were in the air, which is what
     * makes "shoot them there instead" occur to anyone at all.
     */
    if (this.graftCount) {
      const G = CFG.graft;
      const orbit = this.graftR;
      for (const g of this.grafts) {
        if (!g.alive) continue;
        const gx = this.x + Math.cos(g.a) * orbit;
        const gy = this.y + Math.sin(g.a) * orbit;
        const life = clamp(g.hp / g.maxHp, 0.2, 1);
        /*
         * Each ball in the ring's OWN tone and picture, from build 322.
         *
         * It was one hard-coded violet for every ball, which said everything
         * while SEED was the only rider and says the wrong thing now: a ring
         * can hold a SEED (which grows the host and heals it 9 a second) and
         * a LATCH (which armours it and heals it 14) at the same time, and
         * two balls doing different things cannot be one picture in one
         * colour. `from` is written by `graft`, which is the only writer.
         */
        const rt = TYPE_BY_ID[g.from];
        ctx.strokeStyle = rgba(rt.color, 0.3 + 0.25 * life);
        ctx.lineWidth = CFG.hairline * 1.6;
        // From the body's edge, not its centre: a line drawn through the
        // middle of a BULWARK reads as damage to it rather than as a thread.
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(g.a) * this.r * 0.92, this.y + Math.sin(g.a) * this.r * 0.92);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.save();
        ctx.translate(gx, gy);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(rt.color, 0.2 + 0.3 * life);
        ctx.strokeStyle = rgba(rt.color, 0.45 + 0.5 * life);
        ctx.lineWidth = Math.max(CFG.hairline, G.ball * 0.16);
        drawRiderBall(ctx, G.ball, g.a * 3, world.time, rt.shape);
        ctx.restore();
      }
    }

    // orbiting plates (unrotated frame)
    if (this.shards) {
      const orbit = this.orbitR;
      const plate = TYPE_BY_ID.plate;
      ctx.strokeStyle = rgba(t.color, 0.9);
      ctx.fillStyle = rgba(t.color, 0.16);
      ctx.lineWidth = CFG.hairline * 2.2;
      for (const sh of this.shards) {
        if (!sh.alive) continue;
        // Drawn as the PLATE it will become when the core goes, facing out
        // along its orbit. A bar here and a shell segment loose on the field
        // hid the fact that they are the same object.
        ctx.save();
        ctx.translate(this.x + Math.cos(sh.a) * orbit, this.y + Math.sin(sh.a) * orbit);
        ctx.rotate(sh.a);
        drawPlate(ctx, plate.r);
        ctx.restore();
      }
    }

    /*
     * The cable to the other half of a TOW pair, and the shell/threads of a
     * HERALD's cover. Both are drawn in world space so they read as links
     * between bodies rather than decoration on one.
     *
     * ---- ...BUT A RIGID BEAM IS DRAWN BY THE BODY THAT CARRIES IT -------
     *
     * This was `if (this.tether)` and it is the only tether reader in the
     * DRAW path, so build 316's YOKE got a TOW's cable laid over its own
     * beam -- rendered and looked at, which is the only way this was ever
     * going to be found: two paintings of one link, and the cable is
     * `#8fa9c4`, the game's ONE grey, which the colour rule promises means
     * harmless. A hostile pair strung together in the harmless colour is a
     * promise broken by a draw call, and `check-build`'s colour guard reads
     * type colours and cannot see it.
     *
     * `rigid` is the distinction and it already existed: a cable is slack
     * and is drawn as a link between two bodies; a beam holds its length
     * and is part of each half's own picture.
     */
    if (this.tether && !this.tether.rigid && !this.tether.other.dead) {
      const o = this.tether.other;
      ctx.strokeStyle = rgba('#8fa9c4', 0.75);
      ctx.lineWidth = CFG.hairline * 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      // links, so the cable does not read as a laser
      const dx = o.x - this.x;
      const dy = o.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const n = Math.min(9, Math.max(3, Math.round(d / 22)));
      ctx.strokeStyle = rgba(t.glow, 0.5);
      ctx.lineWidth = CFG.hairline * 3.2;
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const px = this.x + dx * k;
        const py = this.y + dy * k;
        ctx.moveTo(px - (dy / d) * 3, py + (dx / d) * 3);
        ctx.lineTo(px + (dy / d) * 3, py - (dx / d) * 3);
      }
      ctx.stroke();
    }

    if (this.warded && this.warded.length) {
      /*
       * Dimmer the more it wards. The alpha was a flat 0.34 per line, so the
       * web's total brightness scaled linearly with the flock -- a HERALD
       * warding two bodies drew two quiet lines and a crowded field drew a
       * net that out-shouted every body in it. The information is "these are
       * shielded and this is why", and that survives at a third the light:
       * the count is carried by how many lines there are, not by each line
       * being loud.
       */
      ctx.strokeStyle = rgba(t.glow, 0.34 / Math.sqrt(this.warded.length));
      ctx.lineWidth = CFG.hairline * 1.4;
      ctx.beginPath();
      for (const e of this.warded) {
        if (e.dead) continue;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
    }

    /*
     * Covered by a HERALD: a shell, so the reason it is shrugging off hits is
     * visible on the thing shrugging them off.
     *
     * Four things make it a shell rather than a ring, and the point of all
     * four is that a covered MOTE must not read as an energy mote with a halo
     * — see CFG.wardShell. A floor on the radius, so the smallest hostile gets
     * a shell it can be seen inside. Plating with gaps in it, because a solid
     * circle is what a glow looks like. A turn, because energy does not turn.
     * And a wash across the volume, so the body is inside something.
     */
    if (this.wardT > 0 && this.ward > 0) {
      const W = CFG.wardShell;
      const rr = Math.max(this.r + W.gap, W.min);
      const pulse = 0.45 + 0.3 * Math.sin(world.time * 5 + this.phase);
      const spin = world.time * W.spin + this.phase;

      ctx.fillStyle = rgba('#7cffb2', 0.05 + 0.035 * pulse);
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba('#7cffb2', pulse + 0.2);
      ctx.lineWidth = Math.max(CFG.hairline * 2, rr * W.thick);
      const slice = (TAU / W.plates) * W.fill;
      for (let i = 0; i < W.plates; i++) {
        const a0 = spin + (i / W.plates) * TAU;
        ctx.beginPath();
        ctx.arc(this.x, this.y, rr, a0, a0 + slice);
        ctx.stroke();
      }
    }

    // damage arc — only on objects big enough to be worth tracking
    if (hpFrac < 0.98 && !this.isDrop && this.r >= 16) {
      ctx.strokeStyle = rgba(t.color, 0.8);
      ctx.lineWidth = CFG.hairline * 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
      ctx.stroke();
    }

    // breach marker — this is the one you have to kill to clear the corruption
    if (this.attacking) {
      const p = 0.5 + 0.5 * Math.sin(world.time * 11);
      ctx.strokeStyle = rgba('#ff2d55', 0.5 + p * 0.5);
      ctx.lineWidth = CFG.hairline * 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 10 + p * 4, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = world.time * 2 + (i / 4) * TAU;
        const rr = this.r + 18 + p * 5;
        ctx.moveTo(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
        ctx.lineTo(this.x + Math.cos(a) * (rr + 7), this.y + Math.sin(a) * (rr + 7));
      }
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ shapes

function drawShard(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.92, r * 0.62);
  ctx.lineTo(-r * 0.92, r * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.42);
  ctx.lineTo(0, r * 0.3);
  ctx.stroke();
}

/*
 * A dart, not a diamond.
 *
 * It used to be four straight lines -- tip, two shoulders, tail -- which at
 * ten units across read as a kite with no front and no back, and told you
 * nothing about which way the fastest thing on the field was going. It leads
 * with the point now: a long spike, shoulders set well back, a pair of swept
 * fins behind them and a lit spine running up to a bright tip.
 *
 * Drawn along -y, because that is the axis Enemy.face() turns to the heading.
 */
function drawNeedle(ctx, r) {
  const stroke = ctx.strokeStyle;
  // the body: a narrow spike with the widest point two thirds of the way back
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.1);
  ctx.quadraticCurveTo(r * 0.34, -r * 0.5, r * 0.56, r * 0.62);
  ctx.lineTo(0, r * 0.24);
  ctx.lineTo(-r * 0.56, r * 0.62);
  ctx.quadraticCurveTo(-r * 0.34, -r * 0.5, 0, -r * 2.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // swept fins, off the shoulders and raked back
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * r * 0.4, -r * 0.1);
    ctx.lineTo(side * r * 1.05, r * 0.72);
    ctx.lineTo(side * r * 0.5, r * 0.5);
  }
  ctx.stroke();

  // the spine, and a lit tip at the front of it
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(CFG.hairline * 0.7, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.3);
  ctx.lineTo(0, -r * 1.7);
  ctx.stroke();
  ctx.fillStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(0, -r * 2.1);
  ctx.lineTo(r * 0.17, -r * 1.35);
  ctx.lineTo(-r * 0.17, -r * 1.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/*
 * ---- ORDINAL's three ----
 *
 * A frame segment. Drawn along its own bar axis, which the boss sets on the
 * body's angle, so a segment always lies along the edge it is part of. Five
 * strokes cut across it: it is a tally, and the count is what it is made of.
 * The strokes go out as it is damaged, so how far into a panel you are is
 * legible from across the field without a health bar on it.
 */
function drawTally(ctx, r, hpFrac) {
  const L = r * 2.05; // along the edge
  const T = r * 0.66; // across it
  ctx.beginPath();
  ctx.moveTo(-L / 2, -T / 2);
  ctx.lineTo(L / 2, -T / 2);
  ctx.lineTo(L / 2 + T * 0.34, 0);
  ctx.lineTo(L / 2, T / 2);
  ctx.lineTo(-L / 2, T / 2);
  ctx.lineTo(-L / 2 - T * 0.34, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const marks = 5;
  const lit = Math.ceil(marks * hpFrac);
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.1);
  for (let i = 0; i < marks; i++) {
    const x = -L / 2 + (i + 0.5) * (L / marks);
    const on = i < lit;
    ctx.strokeStyle = on ? stroke : rgba('#3a2438', 0.9);
    if (on) ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    // the fifth is struck through the other four, the way a tally is
    if (i === marks - 1) {
      ctx.moveTo(-L / 2 + L * 0.08, T * 0.34);
      ctx.lineTo(x + L * 0.06, -T * 0.34);
    } else {
      ctx.moveTo(x, -T * 0.3);
      ctx.lineTo(x, T * 0.3);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/*
 * The core. It does not move and it does not turn, so everything that reads
 * as motion on it is drawn: a ring of counters going round the outside, an
 * iris that opens as it is hurt, and a pupil that watches. The iris opening
 * is the tell -- at full health it is a closed lens, and by the last stage it
 * is a hole with something in it.
 */
function drawOrdinal(ctx, r, phase, t, hpFrac) {
  const stroke = ctx.strokeStyle;
  const hurt = 1 - hpFrac;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // the counting collar
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.05);
  const teeth = 24;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU + t * 0.35;
    const long = i % 4 === 0;
    ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
    ctx.lineTo(Math.cos(a) * r * (long ? 0.99 : 0.93), Math.sin(a) * r * (long ? 0.99 : 0.93));
  }
  ctx.stroke();

  // three rings, each turning at its own rate, each broken in a different place
  //
  // Alpha multiplied in and put back, not assigned and reset to 1: a shape
  // helper that forces the alpha to 1 on its way out hands full opacity to
  // everything drawn after it, which is how build 210's dissolve came out
  // fully opaque on the shapes that use this pattern.
  const was = ctx.globalAlpha;
  for (let i = 0; i < 3; i++) {
    const rr = r * (0.74 - i * 0.14);
    const off = t * (0.5 + i * 0.55) * (i % 2 ? -1 : 1);
    ctx.globalAlpha = was * (0.75 - i * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, rr, off, off + Math.PI * (1.5 - i * 0.22));
    ctx.stroke();
  }
  ctx.globalAlpha = was;

  // the iris: shut at full health, wide open at the end
  const irisR = r * (0.1 + 0.3 * hurt);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.16 + 0.5 * hurt);
  ctx.beginPath();
  ctx.arc(0, 0, irisR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.06);
  const blades = 6;
  ctx.beginPath();
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU - t * 0.8;
    const in0 = irisR;
    const out = r * 0.62;
    ctx.moveTo(Math.cos(a) * in0, Math.sin(a) * in0);
    ctx.lineTo(Math.cos(a + 0.5) * out, Math.sin(a + 0.5) * out);
  }
  ctx.stroke();
  // and the pupil
  ctx.fillStyle = rgba('#ffffff', 0.6 + 0.4 * Math.sin(t * 2 + phase) * hurt);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.075, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/*
 * One of the garrison. A bracket with a bar through it: small, angular and
 * obviously of the same make as the frame it came out of, so a loose one
 * still reads as ORDINAL's rather than as a new object type arriving.
 */
/*
 * ---- PARITY's three ----
 */

/**
 * A mirror pane: a hard-edged shard with a bright face and a crack that opens
 * across it as it is broken. Flat rather than solid-looking, because the whole
 * point of it is that it is a *surface*.
 */
function drawPane(ctx, r, hpFrac) {
  const w = r * 0.55;
  const h = r * 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, -h * 0.35);
  ctx.lineTo(w * 0.72, h);
  ctx.lineTo(-w * 0.72, h);
  ctx.lineTo(-w, -h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The face: a bright sliver down one side, which is what makes it read as
  // reflective rather than as a plate.
  ctx.fillStyle = rgba('#ffffff', 0.16 + 0.24 * hpFrac);
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.75);
  ctx.lineTo(w * 0.1, -h * 0.5);
  ctx.lineTo(-w * 0.1, h * 0.7);
  ctx.lineTo(-w * 0.62, h * 0.4);
  ctx.closePath();
  ctx.fill();
  // ...and the crack, which only exists once it has been hit.
  if (hpFrac < 0.99) {
    ctx.strokeStyle = rgba('#1a0d2e', 0.75);
    ctx.lineWidth = Math.max(CFG.hairline, r * 0.09 * (1 - hpFrac));
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, -h * 0.2);
    ctx.lineTo(w * 0.1, h * 0.1 * (1 - hpFrac) - h * 0.05);
    ctx.lineTo(w * 0.7, h * 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A half: a crescent, its open side facing its twin. Drawn as an arc with
 * thickness rather than a disc, so the pair reads as two halves of one thing
 * with a gap between them where the mirror-line runs.
 */
function drawParity(ctx, r, phase, t, hpFrac) {
  const inner = r * 0.46;
  ctx.beginPath();
  ctx.arc(0, 0, r, -1.15, 1.15);
  ctx.arc(0, 0, inner, 1.15, -1.15, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A bright rib down the middle of the crescent, breathing.
  ctx.strokeStyle = rgba('#e6d6ff', 0.35 + 0.45 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, (r + inner) * 0.5, -1.0, 1.0);
  ctx.stroke();
  // ...and the eye at its inner face, which is what looks across the gap.
  const beat = 0.6 + 0.4 * Math.sin(t * 2.4 + phase);
  ctx.fillStyle = rgba('#ffffff', 0.4 + 0.5 * beat * hpFrac);
  ctx.beginPath();
  ctx.arc(inner * 1.12, 0, r * 0.11 * (0.8 + 0.2 * beat), 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** An ECHO: a small paired chevron. There is always another one of these. */
function drawEcho(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.55);
  ctx.lineTo(0, r * 0.1);
  ctx.lineTo(r * 0.8, -r * 0.55);
  ctx.lineTo(r * 0.8, r * 0.2);
  ctx.lineTo(0, r * 0.85);
  ctx.lineTo(-r * 0.8, r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 6 + phase)));
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, -r * 0.1);
  ctx.lineTo(0, r * 0.4);
  ctx.lineTo(r * 0.45, -r * 0.1);
  ctx.stroke();
  ctx.restore();
}

/*
 * ---- TERMINUS's three ----
 */

/**
 * A BOUND: one tile of the skin of the world.
 *
 * Drawn as a bar lying ACROSS its own radius rather than a blob, because
 * thirty-two of them have to read as one continuous edge and not as beads on
 * a string. The bright line is on the outward face -- the side away from you
 * -- so a ring of them looks like something seen from the inside.
 */
function drawBound(ctx, r, hpFrac) {
  const w = r * 1.02; // along the ring
  const h = r * 0.6; // across it
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.72);
  ctx.lineTo(w, -h * 0.72);
  ctx.lineTo(w * 0.86, h);
  ctx.lineTo(-w * 0.86, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffd6dd', 0.3 + 0.5 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.17);
  ctx.beginPath();
  ctx.moveTo(-w * 0.92, -h * 0.72);
  ctx.lineTo(w * 0.92, -h * 0.72);
  ctx.stroke();
  ctx.restore();
}

/**
 * TERMINUS: an eye with the pupil of a hole, and four stubs at the quarters
 * where the beams come out in stage III. The iris turns the other way to the
 * shell, which is the same trick the two rings play at field scale.
 */
function drawTerminus(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The four stubs.
  ctx.strokeStyle = rgba('#ff9aab', 0.3 + 0.4 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.16);
  for (let i = 0; i < 4; i++) {
    const a = t * 0.5 + phase + (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    ctx.lineTo(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
    ctx.stroke();
  }
  // The iris: a broken annulus turning against the body.
  ctx.strokeStyle = rgba('#ffd6dd', 0.28 + 0.44 * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.11);
  for (let i = 0; i < 5; i++) {
    const a = -t * 0.8 + phase + (i / 5) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, a, a + 0.86);
    ctx.stroke();
  }
  // ...and the hole at the middle of it, which is the only part that is not
  // crimson: what the boundary is holding shut.
  const beat = 0.6 + 0.4 * Math.sin(t * 1.8 + phase);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = rgba('#12000a', 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3 * (0.9 + 0.1 * beat), 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.3 + 0.45 * beat * hpFrac);
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.06);
  ctx.stroke();
  ctx.restore();
}

/** A LIMIT: a caret pointing the way it is going, which is inward. */
/*
 * ---- AXIOM's three, and TESSERA's two ---------------------------------
 *
 * These five shipped in builds 273-274 declaring a `shape` that neither draw
 * switch had a case for, so all five fell through to `drawChip` in the field
 * and `drawShard` in the glossary: a TILE -- a piece of laid ground -- was an
 * irregular five-point blob, a CLAUSE was the same blob in a slightly
 * different gold, and all six new codex entries showed one generic icon.
 * Every one of the seven anomalies before them has three shapes of its own.
 *
 * The two families are drawn as what they ARE, which is the whole reason a
 * player can read this game at a glance: AXIOM is an argument, so it is
 * brackets and rules; TESSERA is a survey, so it is squares and grid.
 */

/** AXIOM: a proposition. A slab between heavy brackets, ruled through. */
function drawAxiom(ctx, r, phase, t, hpFrac) {
  const w = r * 0.92;
  const h = r * 0.6;
  const k = Math.max(CFG.hairline, r * 0.07);
  ctx.beginPath();
  ctx.rect(-w, -h, w * 2, h * 2);
  ctx.fill();
  ctx.stroke();
  // The brackets, which is what makes it a statement rather than a box.
  ctx.save();
  ctx.lineWidth = k * 1.8;
  const bx = w * 1.32;
  const by = h * 1.28;
  ctx.beginPath();
  ctx.moveTo(-bx + r * 0.16, -by); ctx.lineTo(-bx, -by);
  ctx.lineTo(-bx, by); ctx.lineTo(-bx + r * 0.16, by);
  ctx.moveTo(bx - r * 0.16, -by); ctx.lineTo(bx, -by);
  ctx.lineTo(bx, by); ctx.lineTo(bx - r * 0.16, by);
  ctx.stroke();
  ctx.restore();
  // ...and the rules inside it go out as it is argued down.
  const lines = 3;
  const lit = Math.ceil(lines * clamp(hpFrac, 0, 1));
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = k;
  for (let i = 0; i < lines; i++) {
    const y = -h + ((i + 1) * h * 2) / (lines + 1);
    ctx.strokeStyle = i < lit ? stroke : rgba('#3a3018', 0.9);
    ctx.beginPath();
    ctx.moveTo(-w * 0.72, y);
    ctx.lineTo(w * (i === lines - 1 ? 0.3 : 0.72), y);
    ctx.stroke();
  }
  ctx.restore();
}

/** CLAUSE: one bracketed fragment of it, turned to face the ring. */
function drawClause(ctx, r, hpFrac) {
  const w = r * 0.78;
  const h = r * 0.5;
  const k = Math.max(CFG.hairline, r * 0.11);
  ctx.beginPath();
  ctx.rect(-w, -h, w * 2, h * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.lineWidth = k;
  const bx = w * 1.36;
  ctx.beginPath();
  ctx.moveTo(-bx + r * 0.2, -h * 1.3); ctx.lineTo(-bx, -h * 1.3);
  ctx.lineTo(-bx, h * 1.3); ctx.lineTo(-bx + r * 0.2, h * 1.3);
  ctx.moveTo(bx - r * 0.2, -h * 1.3); ctx.lineTo(bx, -h * 1.3);
  ctx.lineTo(bx, h * 1.3); ctx.lineTo(bx - r * 0.2, h * 1.3);
  ctx.stroke();
  // One rule, and it shortens as the clause is broken.
  ctx.beginPath();
  ctx.moveTo(-w * 0.6, 0);
  ctx.lineTo(-w * 0.6 + w * 1.2 * clamp(hpFrac, 0.08, 1), 0);
  ctx.stroke();
  ctx.restore();
}

/** LEMMA: a step in the proof. The therefore-mark, three dots. */
function drawLemma(ctx, r, phase, t) {
  const spin = phase + t * 1.1;
  const d = r * 0.52;
  ctx.save();
  ctx.rotate(spin);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.34, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** TESSERA: the survey plate. A square with its own grid cut across it. */
function drawTessera(ctx, r, phase, t, hpFrac) {
  const w = r * 0.82;
  const k = Math.max(CFG.hairline, r * 0.06);
  ctx.beginPath();
  ctx.rect(-w, -w, w * 2, w * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.lineWidth = k;
  // Two cuts each way: the same three-by-three the field is laid on, so the
  // core says what it does without a caption.
  for (let i = 1; i < 3; i++) {
    const o = -w + (w * 2 * i) / 3;
    ctx.beginPath();
    ctx.moveTo(o, -w); ctx.lineTo(o, w);
    ctx.moveTo(-w, o); ctx.lineTo(w, o);
    ctx.stroke();
  }
  // ...and the survey mark at the centre, which fades as it is argued down.
  ctx.globalAlpha *= clamp(hpFrac, 0.15, 1);
  ctx.beginPath();
  ctx.rect(-w * 0.22, -w * 0.22, w * 0.44, w * 0.44);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** TILE: laid ground. A plain square, and it is meant to be plain. */
function drawTile(ctx, r, hpFrac) {
  const w = r * 0.88;
  const k = Math.max(CFG.hairline, r * 0.07);
  ctx.beginPath();
  ctx.rect(-w, -w, w * 2, w * 2);
  ctx.fill();
  ctx.stroke();
  /*
   * A cut mark that OPENS as the tile is broken, so a slab under fire reads
   * as ground coming apart rather than as ground getting dimmer. It is the
   * only state a tile has and it is the thing the fight is about.
   */
  const cut = 1 - clamp(hpFrac, 0, 1);
  if (cut > 0.02) {
    ctx.save();
    ctx.lineWidth = k;
    const g = w * 0.86 * cut;
    ctx.beginPath();
    ctx.moveTo(-w * 0.86, -g); ctx.lineTo(w * 0.86, g);
    ctx.moveTo(-w * 0.86, g); ctx.lineTo(w * 0.86, -g);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLimit(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.lineTo(r * 0.82, -r * 0.3);
  ctx.lineTo(0, -r * 0.02);
  ctx.lineTo(-r * 0.82, -r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.28 + 0.5 * (0.5 + 0.5 * Math.sin(t * 7 + phase)));
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.15);
  ctx.beginPath();
  ctx.moveTo(-r * 0.44, -r * 0.16);
  ctx.lineTo(0, r * 0.5);
  ctx.lineTo(r * 0.44, -r * 0.16);
  ctx.stroke();
  ctx.restore();
}

/*
 * ---- DYNAMO's three ----
 */

/**
 * A pylon: a squat tower with a cap and three insulator rings that go dark as
 * it is broken. It has to read as *standing on something* even though nothing
 * in this game has a ground, which is what the flared base is for.
 */
function drawPylon(ctx, r, hpFrac) {
  const w = r * 0.62;
  const h = r * 1.05;
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, -h);
  ctx.lineTo(w * 0.55, -h);
  ctx.lineTo(w, h);
  ctx.lineTo(-w, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.07);
  const rings = 3;
  const lit = Math.ceil(rings * hpFrac);
  for (let i = 0; i < rings; i++) {
    const y = -h * 0.6 + (i / (rings - 1)) * h * 1.3;
    const ww = w * (0.62 + i * 0.22);
    ctx.strokeStyle = i < lit ? rgba('#a8c8ff', 0.85) : rgba('#20304c', 0.9);
    ctx.beginPath();
    ctx.moveTo(-ww, y);
    ctx.lineTo(ww, y);
    ctx.stroke();
  }
  // The terminal on top: where an arc leaves from.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#dceaff', 0.5 + 0.5 * hpFrac);
  ctx.beginPath();
  ctx.arc(0, -h, r * 0.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.restore();
}

/**
 * The core: a ring with a lightning glyph in it, spinning up as it is worn
 * down. It is drawn as something *carrying* a charge rather than being one --
 * the ring is the vessel, the bolt inside is the contents.
 */
function drawDynamo(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const stroke = ctx.strokeStyle;
  ctx.save();
  // A second ring, turning, so the thing reads as live even standing still.
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.07);
  ctx.strokeStyle = rgba('#a8c8ff', 0.5);
  ctx.setLineDash([r * 0.5, r * 0.34]);
  ctx.lineDashOffset = -t * r * (1 + (1 - hpFrac) * 3);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // ...and the bolt.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  ctx.strokeStyle = rgba('#ffffff', 0.6 + 0.4 * Math.sin(t * 6 + phase));
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.5);
  ctx.lineTo(r * 0.12, -r * 0.08);
  ctx.lineTo(-r * 0.08, r * 0.04);
  ctx.lineTo(r * 0.22, r * 0.5);
  ctx.stroke();
  ctx.strokeStyle = stroke;
  ctx.restore();
}

/** An ION: a small hard diamond with a spark in it. */
function drawIon(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.7, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 8 + phase)));
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/*
 * ---- AMPLITUDE's three ----
 */

/**
 * One segment of the wave: a lens, wider than it is tall, with a bar through
 * it that shortens as it is broken. Drawn along its own axis, so the boss can
 * lie it flat along the tangent of the curve and it reads as part of a line
 * rather than as a bead on one.
 */
function drawCrest(ctx, r, hpFrac) {
  const L = r * 1.9;
  const T = r * 0.78;
  ctx.beginPath();
  ctx.moveTo(-L / 2, 0);
  ctx.quadraticCurveTo(0, -T, L / 2, 0);
  ctx.quadraticCurveTo(0, T, -L / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.16);
  ctx.strokeStyle = rgba('#d6fff2', 0.35 + 0.55 * hpFrac);
  ctx.beginPath();
  ctx.moveTo(-L * 0.34 * hpFrac, 0);
  ctx.lineTo(L * 0.34 * hpFrac, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * The head: a disc with a waveform running through it, and the waveform runs
 * faster as the thing is worn down. It is the only body in the game whose
 * decoration is a readout.
 */
function drawAmplitude(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.94, 0, TAU);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.09);
  // Two traces, the second a beat behind, so the head reads as oscillating
  // rather than as a circle with a squiggle in it.
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = rgba(k ? '#8ff5e0' : '#ffffff', k ? 0.35 : 0.75);
    ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
      const x = (i / 10) * r;
      const y = Math.sin(i * 0.6 + t * (2 + (1 - hpFrac) * 5) + phase + k * 1.1)
        * r * 0.42 * (0.4 + 0.6 * hpFrac);
      if (i === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A DROPLET: a teardrop, point leading. */
function drawDroplet(ctx, r, phase, t) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.2);
  ctx.quadraticCurveTo(r * 0.92, r * 0.2, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.92, r * 0.2, 0, -r * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5 + phase)));
  ctx.beginPath();
  ctx.arc(0, r * 0.05, r * 0.26, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/*
 * ---- FRACTAL's three ----
 *
 * One function for all of them, because they are one shape. `depth` is which
 * generation this is, and it draws that many levels of subdivision inside
 * itself -- so a MITE is a bare triangle, a FRACTION has three inside it, and
 * the core has three inside each of those. The armour you have to chew
 * through is visible in the body before you shoot it.
 */
function drawTri(ctx, r, hpFrac, depth) {
  const pts = (rad) => [
    [0, -rad],
    [rad * 0.866, rad * 0.5],
    [-rad * 0.866, rad * 0.5],
  ];
  const path = (rad, cx = 0, cy = 0) => {
    const p = pts(rad);
    ctx.beginPath();
    ctx.moveTo(cx + p[0][0], cy + p[0][1]);
    ctx.lineTo(cx + p[1][0], cy + p[1][1]);
    ctx.lineTo(cx + p[2][0], cy + p[2][1]);
    ctx.closePath();
  };
  path(r);
  ctx.fill();
  ctx.stroke();

  // The subdivisions, drawn inward. Sierpinski proper removes the middle;
  // this draws the three that are kept, which is the same picture and reads
  // at fifteen pixels where a cut-out does not.
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.045);
  const sub = (rad, cx, cy, left) => {
    if (left <= 0) return;
    const half = rad * 0.5;
    for (const [px, py] of pts(rad * 0.5)) {
      path(half, cx + px, cy + py);
      ctx.stroke();
      sub(half, cx + px, cy + py, left - 1);
    }
  };
  ctx.strokeStyle = rgba(stroke, 0.22 + 0.5 * hpFrac);
  sub(r, 0, 0, depth);
  ctx.restore();
}

/*
 * ---- GNOMON's three ----
 */

/**
 * One arc of the dial: a slab curved the long way, with hour ticks cut into
 * its outer edge that go out as it is broken. Drawn along its own axis, the
 * way a TALLY is, so the boss only has to hand it an angle.
 */
function drawDial(ctx, r, hpFrac) {
  const L = r * 2.0; // along the ring
  const T = r * 0.6; // across it
  const bow = r * 0.22; // how much the outer edge bellies out
  ctx.beginPath();
  ctx.moveTo(-L / 2, -T / 2);
  ctx.quadraticCurveTo(0, -T / 2 - bow, L / 2, -T / 2);
  ctx.lineTo(L / 2, T / 2);
  ctx.quadraticCurveTo(0, T / 2 - bow * 0.4, -L / 2, T / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Hours, going out as the arc goes. Four is enough to read at this size.
  const marks = 4;
  const lit = Math.ceil(marks * hpFrac);
  const stroke = ctx.strokeStyle;
  ctx.save();
  ctx.lineWidth = Math.max(CFG.hairline * 0.8, r * 0.08);
  for (let i = 0; i < marks; i++) {
    const x = -L / 2 + (i + 0.5) * (L / marks);
    ctx.strokeStyle = i < lit ? stroke : rgba('#3a2a18', 0.9);
    ctx.beginPath();
    ctx.moveTo(x, -T / 2 - bow * 0.5);
    ctx.lineTo(x, -T / 6);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The core: a disc with a graduated rim, and a bright pinhole at the middle
 * that the needle turns on. The rim is a face, so the thing at the centre of
 * a sundial reads as the instrument it is.
 */
function drawGnomon(ctx, r, phase, t, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const stroke = ctx.strokeStyle;
  ctx.save();
  // The face: twelve graduations, dimming as it is worn down.
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.05);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const long = i % 3 === 0;
    ctx.strokeStyle = rgba(long ? '#ffd9a8' : '#ffa860', 0.28 + 0.5 * hpFrac);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * (long ? 0.62 : 0.74), Math.sin(a) * r * (long ? 0.62 : 0.74));
    ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  // ...and the pinhole, which is the only part of it that is ever bright.
  const beat = 0.62 + 0.38 * Math.sin(t * 2.2 + phase);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#fff0d0', 0.5 + 0.5 * beat);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.19 * (0.85 + 0.15 * beat), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(stroke, 0.6);
  ctx.restore();
}

/** A SECOND: a small hard tick, leaning the way it is going. */
function drawSecond(ctx, r, phase, t) {
  const w = r * 0.5;
  const h = r * 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, h * 0.62);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.14);
  ctx.globalAlpha *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 6 + phase));
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.5);
  ctx.lineTo(0, h * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawDigit(ctx, r, phase, t) {
  const w = r * 0.72;
  const h = r * 1.05;
  ctx.beginPath();
  ctx.moveTo(-w, -h);
  ctx.lineTo(w, -h * 0.55);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(-w, h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(CFG.hairline, r * 0.13);
  const beat = 0.5 + 0.5 * Math.sin(t * 5 + phase);
  ctx.globalAlpha *= 0.4 + 0.6 * beat;
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, 0);
  ctx.lineTo(w * 0.6, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHex(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    const x = Math.cos(a) * r * 0.45;
    const y = Math.sin(a) * r * 0.45;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawBlob(ctx, r, phase, time) {
  ctx.beginPath();
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + Math.sin(a * 3 + time * 2.2 + phase) * 0.11);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.stroke();
}

function drawBloom(ctx, r, phase, time, t) {
  const petals = 6;
  const pulse = 1 + Math.sin(time * 3 + phase) * 0.07;
  ctx.beginPath();
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    const cx = Math.cos(a) * r * 0.58 * pulse;
    const cy = Math.sin(a) * r * 0.58 * pulse;
    ctx.moveTo(cx + r * 0.44, cy);
    ctx.arc(cx, cy, r * 0.44, 0, TAU);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rgba(t.glow, 0.85);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3 * pulse, 0, TAU);
  ctx.fill();
}

function drawPlated(ctx, r, hpFrac) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const plates = 8;
  for (let i = 0; i < plates; i++) {
    // plates fall off as the hull is worn down
    if (i / plates > hpFrac + 0.12) continue;
    const a0 = (i / plates) * TAU + 0.06;
    const a1 = a0 + TAU / plates - 0.12;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, a0, a1);
    ctx.arc(0, 0, r * 0.7, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.stroke();
}

function drawWardenCore(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.72 : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, TAU);
  ctx.fill();
}

/**
 * PLATE: a curved section of shell, which is what it is — one of the three
 * pieces a WARDEN's armour comes apart into. Drawn as an arc band rather than
 * a solid so it never gets mistaken for a small whole object.
 */
function drawPlate(ctx, r) {
  const outer = r;
  const inner = r * 0.52;
  const half = 1.15; // ~130 degrees of shell
  ctx.beginPath();
  ctx.arc(0, 0, outer, -half, half);
  ctx.arc(0, 0, inner, half, -half, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Two rivets, so the curve reads as plating and not as a crescent.
  ctx.beginPath();
  const mid = (outer + inner) / 2;
  for (const a of [-half * 0.55, half * 0.55]) {
    ctx.moveTo(Math.cos(a) * mid + r * 0.1, Math.sin(a) * mid);
    ctx.arc(Math.cos(a) * mid, Math.sin(a) * mid, r * 0.1, 0, TAU);
  }
  ctx.fill();
}

/** HERALD: an open ring with a spinning inner cross — visibly a transmitter. */
function drawHerald(ctx, r, spin) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.5, Math.PI - 0.5);
  ctx.arc(0, 0, r, Math.PI + 0.5, TAU - 0.5);
  ctx.stroke();
  ctx.save();
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** GLUT: a lumpy sac whose seams multiply as it eats. */
function drawGlut(ctx, r, fed, phase, t) {
  const lobes = 7;
  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * TAU;
    const bulge = 1 + Math.sin(a * 3 + phase + t * 0.8) * 0.1;
    const x = Math.cos(a) * r * bulge;
    const y = Math.sin(a) * r * bulge;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // one seam per mouthful, so how fed it is reads at a glance
  const seams = Math.min(9, fed);
  if (!seams) return;
  ctx.beginPath();
  for (let i = 0; i < seams; i++) {
    const a = (i / 9) * TAU + phase;
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    ctx.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
  }
  ctx.stroke();
}

/** TOW head: a hook. */
function drawTowHead(ctx, r) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, -2.2, 1.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.cos(1.1) * r, Math.sin(1.1) * r);
  ctx.lineTo(Math.cos(1.1) * r * 1.5, Math.sin(1.1) * r * 0.4);
  ctx.stroke();
}

/** The mass it drags: a banded weight. */
function drawTowMass(ctx, r, hpFrac) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    const y = i * r * 0.42;
    const half = Math.sqrt(Math.max(0, r * r - y * y)) * 0.82;
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
  }
  // Multiplied in and put back; see the note in drawEye.
  const was2 = ctx.globalAlpha;
  ctx.globalAlpha = was2 * (0.35 + hpFrac * 0.4);
  ctx.stroke();
  ctx.globalAlpha = was2;
}

function drawPrism(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
}

/** Soft, dashed and unhurried — legibly not a threat. */
/*
 * ---- the two harmless newcomers, build 307 -----------------------------
 *
 * Both wear the one grey, which `check-build.mjs` allows only on a harmless
 * type -- so neither can be told from a DRIFT by hue and both have to be told
 * apart by SILHOUETTE. A DRIFT is a dashed circle with three orbiting dots; an
 * EMBER is a four-pointed spark with a trail under it, and a HUSK is an
 * angular broken hull with nothing round about it at all.
 *
 * `regress.mjs` renders every declared shape against `drawChip` and requires
 * a different picture, because a `shape` with no case in the switch is a
 * silent fallback rather than an error -- five of them shipped that way in
 * builds 273-274.
 */

/** A spark on its way up: four points, a hot core, and the trail below it. */
function drawEmber(ctx, r, phase, time) {
  const beat = 0.72 + 0.28 * Math.sin(time * 3.4 + phase);
  // The four points, long on the vertical because it is climbing.
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.5);
  ctx.lineTo(r * 0.52, 0);
  ctx.lineTo(0, r * 1.5);
  ctx.lineTo(-r * 0.52, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // ...and the core, which is what beats.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42 * beat, 0, TAU);
  ctx.fill();
  /*
   * The trail: two ticks BELOW it, which is the ground it has left. Drawn
   * downward whatever the body's heading, because the gait only ever goes one
   * way and a trail that turned with the sway would read as a fin.
   *
   * That claim was FALSE from build 307 to 310: `Enemy.draw` rotated by the
   * body's own random `angle` before calling this, so "below" was wherever
   * the spawn roll put it. The type carries `upright` now and `draw` skips
   * the rotate for it.
   */
  for (let i = 0; i < 2; i++) {
    const y = r * (1.9 + i * 0.75);
    const w = r * (0.3 - i * 0.12);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/**
 * A wreck of something the simulation ran before: an angular hull with a bite
 * out of it, two ribs across the gap, and a loose piece still attached.
 *
 * Nothing in it is a circle. The one thing a HUSK must never read as is a big
 * DRIFT, and at r 38 against DRIFT's 17 size alone will not do it -- a body
 * reads almost entirely as its outline (see the hairline note in CLAUDE.md).
 */
function drawHusk(ctx, r, phase, time) {
  const sway = Math.sin(time * 0.5 + phase) * 0.06;
  ctx.save();
  ctx.rotate(sway);
  // The hull: seven sides, and the eighth torn open.
  const pts = [
    [-0.96, -0.24], [-0.52, -0.86], [0.3, -0.92], [0.9, -0.34],
    [0.84, 0.46], [0.26, 0.94], [-0.62, 0.72],
  ];
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px * r, py * r);
    else ctx.lineTo(px * r, py * r);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The bite: a wedge cut back into the hull from the torn side.
  ctx.beginPath();
  ctx.moveTo(-0.62 * r, 0.72 * r);
  ctx.lineTo(-0.18 * r, 0.16 * r);
  ctx.lineTo(-0.96 * r, -0.24 * r);
  ctx.stroke();
  // Two ribs across it, which is the structure the wedge exposed.
  for (let i = 0; i < 2; i++) {
    const t2 = 0.24 + i * 0.34;
    ctx.beginPath();
    ctx.moveTo((-0.62 + t2 * 0.44) * r, (0.72 - t2 * 0.56) * r);
    ctx.lineTo((-0.96 + t2 * 0.78) * r, (-0.24 + t2 * 0.4) * r);
    ctx.stroke();
  }
  // A loose piece, still hanging off the leading corner.
  ctx.beginPath();
  ctx.moveTo(0.3 * r, -0.92 * r);
  ctx.lineTo(0.62 * r, -1.24 * r);
  ctx.lineTo(0.86 * r, -0.9 * r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A bar: the capsule a round is actually tested against, drawn as itself.
 *
 * ---- NOTHING IS DRAWN OUTSIDE THE HIT PROFILE ---------------------------
 *
 * `docs/objects.html` puts a diamond on each end at 1.9 times the bar's own
 * half-thickness -- 10.4 units against a tube of 5.5 -- and that is a part
 * of the picture a round would visibly pass through, on the one body in this
 * game whose whole design is which part of it you can hit. The weights are
 * inside the tube instead, so the silhouette IS the capsule: the ends are
 * the caps the hit test uses and the cross-bars read as the mass that makes
 * it turn.
 *
 * Drawn along local +x and rotated by the body's own `angle`, which the
 * cartwheel gait spins -- so the picture turns with the profile by
 * construction rather than by agreement.
 */
function drawBar(ctx, r, phase, time) {
  const C = CFG.cartwheel;
  const half = r * C.long;
  const th = r * C.thin;
  ctx.beginPath();
  ctx.arc(-half, 0, th, Math.PI / 2, -Math.PI / 2);
  ctx.lineTo(half, -th);
  ctx.arc(half, 0, th, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The spine, and a weight short of each cap: what a bar turns about.
  ctx.beginPath();
  ctx.moveTo(-half * 0.9, 0);
  ctx.lineTo(half * 0.9, 0);
  ctx.stroke();
  for (const sgn of [-1, 1]) {
    const cx = sgn * half * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - th * 0.85, -th * 0.92);
    ctx.lineTo(cx + th * 0.85, -th * 0.92);
    ctx.lineTo(cx + th * 0.85, th * 0.92);
    ctx.lineTo(cx - th * 0.85, th * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * A dart: a nose, two swept barbs and a tail that beats.
 *
 * Drawn along local +x, because `Enemy.draw` rotates by `angle` and the flock
 * writes that angle to the body's own heading -- so +x is forward, the way the
 * turret's barrel is. Build 268's DECOY drew its barrel along local -y and
 * then applied the turret's own `-PI/2` on top, which sent it across the
 * field for sixty builds: a rotation convention copied without its frame
 * turns the drawing ninety degrees.
 *
 * The shape carries the whole distinction from a MOTE, which wears the same
 * cyan at dE 0.0 by measured decision -- see the SHOAL block in config.js. A
 * tumbling twelve-unit shard against fourteen aligned seven-unit darts is the
 * same register the six greys are told apart by.
 */
function drawDart(ctx, r, phase, time) {
  const beat = Math.sin(time * 9 + phase) * 0.3;
  /*
   * A SLENDER SPINDLE and not a delta, which is a measured choice: MOTE
   * wears this exact cyan and MOTE's icon is a broad triangle, so a dart
   * built as an arrowhead was two cyan deltas at two sizes. Rendered side by
   * side before this was settled -- the silhouette is carrying the whole
   * distinction here and it has to survive being four CSS pixels long.
   */
  ctx.beginPath();
  ctx.moveTo(r * 1.4, 0);
  ctx.lineTo(r * 0.1, r * 0.34);
  ctx.lineTo(-r * 0.6, r * 0.18);
  ctx.lineTo(-r * 0.6, -r * 0.18);
  ctx.lineTo(r * 0.1, -r * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The forked tail, beating off the back of the spindle.
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(-r * 1.3, (0.45 + beat) * r);
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(-r * 1.3, (-0.45 + beat) * r);
  ctx.stroke();
}

/**
 * A quarry: a boulder with its own fracture lines already on it.
 *
 * The three cuts meet at one point inside the hull, which is what makes the
 * picture a promise rather than a texture -- it is a Y, and a Y divides a
 * solid into the three the body breaks into. `docs/objects.html` draws it
 * this way and the counter text is why: "where you break it decides where the
 * nine go", which you can only plan for if the nine are visible in advance.
 *
 * The cuts are drawn at a fraction of the caller's alpha, and that fraction
 * is multiplied IN and put back by save/restore rather than assigned and
 * reset to 1 -- build 210's fade, where four separate helpers each forced the
 * alpha back and every body dissolved at full opacity.
 */
function drawQuarry(ctx, r, phase, time) {
  const grind = Math.sin(time * 0.7 + phase) * 0.03;
  const hull = [
    [-0.62, -0.78], [0.2, -1], [0.95, -0.3], [0.8, 0.6], [0, 1], [-0.85, 0.45],
  ];
  const outline = () => {
    ctx.beginPath();
    hull.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px * r, py * r);
      else ctx.lineTo(px * r, py * r);
    });
    ctx.closePath();
  };
  ctx.save();
  ctx.rotate(grind);
  outline();
  ctx.fill();
  ctx.stroke();
  /*
   * The three cuts, meeting at the point the rock comes apart around -- and
   * CLIPPED to the hull, because their far ends are authored past the
   * outline on purpose so that each one reaches its own edge whatever the
   * hull is. Rendered without the clip they hang off the silhouette, which
   * reads as a broken drawing rather than as a fracture.
   */
  ctx.save();
  outline();
  ctx.clip();
  ctx.globalAlpha *= 0.7;
  const hub = [0.1, 0.25];
  [[-0.2, -1], [0.95, 0.45], [-0.6, 0.8]].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.moveTo(hub[0] * r, hub[1] * r);
    ctx.lineTo(px * r, py * r);
    ctx.stroke();
  });
  ctx.restore();
  ctx.restore();
}

/**
 * A yoke half: a shield with a socket, and its half of the beam.
 *
 * ---- THE PICTURE IS DRAWN ALONG LOCAL +x, TOWARD THE PARTNER ----------
 *
 * `pairOn` writes `this.angle = atan2(o.y - this.y, o.x - this.x)` every
 * frame, so local +x points at the other half and the two shields face each
 * other across the beam by construction rather than by agreement. That is
 * the same convention `drawDart` takes from the flock and the DECOY got
 * wrong for sixty builds: a rotation copied without its frame turns the
 * drawing ninety degrees.
 *
 * ---- THE BEAM SHOWS THE POOL, WHICH IS THE WHOLE OBJECT ---------------
 *
 * Two bodies of one 150 is the thing a player has to be able to see before
 * they choose where to aim, and it is not visible in either half. So a tick
 * runs along the beam toward the partner -- the pool moving between them --
 * and it is the one feature here that could not be inferred from a still
 * frame. Off the moment `beam` goes false, with the stub torn short: a
 * survivor has to read as having been snapped off rather than as a body
 * that came this way.
 *
 * `beam` is passed IN rather than read off the body, because `drawIcon`
 * draws this shape with no body at all -- and the glossary wants the half
 * that is still attached, since that is what a YOKE is.
 */
function drawYoke(ctx, r, phase, time, beam) {
  const half = CFG.yoke.len / 2;
  const th = r * 0.17;
  const face = r * 0.68; // where the shield's flat side is
  /*
   * The beam first, so the shield is painted OVER the end of it and the two
   * read as one piece rather than as a bar with a lid on each end. Torn
   * short when it is broken, with the tear drawn as a step rather than as a
   * shorter bar -- a shorter bar is a smaller yoke.
   */
  const reach = beam ? half : r * 0.95;
  ctx.beginPath();
  ctx.moveTo(face * 0.5, -th);
  ctx.lineTo(reach, -th);
  if (beam) {
    ctx.lineTo(reach, th);
  } else {
    ctx.lineTo(reach - th * 0.5, -th * 0.25);
    ctx.lineTo(reach, th * 0.3);
    ctx.lineTo(reach - th * 0.7, th);
  }
  ctx.lineTo(face * 0.5, th);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The shield: flat toward the partner, rounded away from it.
  ctx.beginPath();
  ctx.moveTo(face, -r * 0.8);
  ctx.lineTo(-r * 0.45, -r * 0.95);
  ctx.lineTo(-r * 0.98, 0);
  ctx.lineTo(-r * 0.45, r * 0.95);
  ctx.lineTo(face, r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The socket the beam sits in, and the two lashings that hold it there.
  ctx.beginPath();
  ctx.moveTo(face, -th * 1.9);
  ctx.lineTo(face * 0.34, -th * 1.9);
  ctx.lineTo(face * 0.34, th * 1.9);
  ctx.lineTo(face, th * 1.9);
  ctx.stroke();
  /*
   * The pool running along the beam. A tick rather than a glow, and it moves
   * OUTWARD toward the partner, because what it is saying is that the number
   * is shared -- and `phase` is the spawn roll, so the two halves are not
   * lit in step, which is what stops the pair reading as one blinking body.
   */
  if (beam) {
    const run = (time * 0.8 + phase) % 1;
    const at = face * 0.6 + (reach - face * 0.6) * run;
    ctx.save();
    ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(run * Math.PI);
    ctx.beginPath();
    ctx.moveTo(at, -th * 1.5);
    ctx.lineTo(at, th * 1.5);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * A flint: a wedge with a plate across its leading face.
 *
 * ---- THE PICTURE DERIVES ITS ARC FROM THE RULE -----------------------
 *
 * The plate is drawn from `-acos(CFG.flint.front)` to `+acos(...)` rather
 * than from the two literals `docs/objects.html` sweeps (-2.5 to -0.64
 * radians), because those ARE that arc once the frame is corrected: +-0.93
 * radians is +-53 degrees, and `cos 53` is the 0.6 the damage path compares
 * against. One owner, so the thing a player can see and the thing that
 * reduces damage cannot drift apart -- which is the fault `CFG.mines.era2`
 * is shaped to avoid and the one `s.r * 2.4` paid for three times.
 *
 * Drawn along local +x: `Enemy.face` turns a plated body so `angle` points at
 * the machine, and the plate belongs on that side. The guide authors this
 * shape nose-UP, which is the frame that page draws everything in -- its
 * points are turned a quarter here rather than at the call site, for the
 * reason build 268's DECOY records.
 */
function drawFlint(ctx, r, phase, time) {
  // The wedge: nose forward, two corners trailing.
  ctx.beginPath();
  ctx.moveTo(r * 1.1, 0);
  ctx.lineTo(-r * 0.5, r);
  ctx.lineTo(-r * 0.5, -r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  /*
   * The plate: three arcs standing off the leading face, the outermost
   * faintest. Alpha multiplied IN and put back by save/restore rather than
   * assigned and reset to 1, which is build 210's fade.
   */
  const half = Math.acos(clamp(CFG.flint.front, -1, 1));
  const beat = 0.85 + 0.15 * Math.sin(time * 2.2 + phase);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.globalAlpha *= (1 - i * 0.28) * beat;
    ctx.lineWidth = CFG.hairline * (2.6 - i * 0.7);
    ctx.beginPath();
    /*
     * Centred on the BODY's own centre, which is the only frame `frontal`
     * has. The first version swept the right angle about a centre 0.7r
     * behind the body -- so the sweep was +-53.1 degrees and the arc a
     * player actually sees subtended +-94.8, 89.5 and 85.3 from the centre,
     * nearly twice the rule, while the docstring claimed the two could not
     * drift apart. Deriving a number from the right constant is not the same
     * as drawing the right thing.
     */
    ctx.arc(0, 0, r * (1.05 + i * 0.13), -half, half);
    ctx.stroke();
    ctx.restore();
  }
  // ...and the rib, which gives the wedge a front from behind as well.
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.5);
  ctx.lineTo(r * 0.2, 0);
  ctx.lineTo(-r * 0.5, r * 0.5);
  ctx.stroke();
}

/**
 * A shrike: a swept dart on a long spine, and a streak when it is running.
 *
 * ---- DRAWN ALONG LOCAL +x, WHICH IS NOT THE FRAME THE GUIDE USES --------
 *
 * `docs/objects.html` authors this shape nose-DOWN, at `(0, R * 1.5)`, which
 * is the frame that page draws every object in. `Enemy.update` writes
 * `angle = atan2(vy, vx)` for a `dive` body, so local +x is the direction of
 * travel and the nose belongs at `(R * 1.5, 0)` -- the guide's points turned
 * a quarter, written out here in the frame they are actually used in rather
 * than rotated at the call site. Build 268's DECOY drew its barrel in the
 * frame it was copied from and aimed across the field for sixty builds: a
 * rotation convention copied without its frame turns the drawing ninety
 * degrees.
 *
 * The streaks are the DIVE and nothing else, which is the whole reading of
 * this body -- fast on the run, slow on the way back. They are passed IN
 * because `drawSpecimen` has no body to ask, and the glossary shows the
 * clean silhouette: three golds share this tone and the shape is what tells
 * them apart, so the icon should not have anything laid over it.
 */
function drawShrike(ctx, r, phase, time, diving) {
  if (diving) {
    /*
     * Behind the nose, so they read as what it is leaving rather than as
     * something it is firing -- and multiplied into the caller's alpha and
     * put back by save/restore, never assigned and reset to 1 (build 210).
     */
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * r * 0.5;
      ctx.save();
      ctx.globalAlpha *= 0.5 - Math.abs(i - 2) * 0.1;
      ctx.lineWidth = CFG.hairline * (2.2 - Math.abs(i - 2) * 0.4);
      /*
       * Lengths as multiples of `r`, not the absolute 26 and 6 the guide
       * authors them at -- those are numbers measured on an r-14 body, and a
       * flat length on a radius-scaled shape is not a length (build 221's
       * PILE crest: 4.5 units authored on a 168-unit front, invisible). The
       * ratios are the guide's own figures divided by SHRIKE's radius, so an
       * r-14 body draws exactly what the guide drew.
       */
      const run = r * (1.857 - Math.abs(i - 2) * 0.429);
      ctx.beginPath();
      ctx.moveTo(-r * 1.4, off);
      ctx.lineTo(-r * 1.4 - run, off);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(r * 1.5, 0);
  ctx.lineTo(-r * 0.5, r * 1.15);
  ctx.lineTo(-r * 0.9, r * 0.3);
  ctx.lineTo(-r * 1.5, 0);
  ctx.lineTo(-r * 0.9, -r * 0.3);
  ctx.lineTo(-r * 0.5, -r * 1.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The spine, which is what makes it a dart rather than an arrowhead --
  // NEEDLE and GLUT wear this exact gold.
  ctx.beginPath();
  ctx.moveTo(r * 1.5, 0);
  ctx.lineTo(-r * 1.2, 0);
  ctx.stroke();
  // ...and the eye, forward of centre, which gives the silhouette a front.
  const beat = 0.7 + 0.3 * Math.sin(time * 3 + phase);
  ctx.save();
  ctx.globalAlpha *= diving ? 1 : beat;
  ctx.beginPath();
  ctx.arc(r * 1.05, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A bell: an open shell with a clapper swinging inside it.
 *
 * Six greys share one colour now, so the silhouette carries all of it. This is
 * the only one that is OPEN at the bottom -- a DRIFT is a closed dashed
 * circle, a LANTERN a closed cage, a bead a closed ring, an EMBER a spark and
 * a HUSK an angular hull. The mouth is the mark.
 *
 * Not `upright`, deliberately: a bell that has been hit should swing, and its
 * own shape is symmetric enough that a slow roll reads as swinging rather
 * than as a mistake. The clapper is what makes the rotation legible.
 */
function drawBell(ctx, r, phase, time) {
  const swing = Math.sin(time * 2.4 + phase) * 0.16;
  // The shell: a shoulder that flares to an open mouth.
  ctx.beginPath();
  ctx.moveTo(-r * 0.28, -r * 0.92);
  ctx.quadraticCurveTo(-r * 0.86, -r * 0.5, -r * 0.9, r * 0.62);
  ctx.lineTo(r * 0.9, r * 0.62);
  ctx.quadraticCurveTo(r * 0.86, -r * 0.5, r * 0.28, -r * 0.92);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The mouth, struck across the open end so the shell reads as hollow.
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, r * 0.62);
  ctx.lineTo(r * 0.9, r * 0.62);
  ctx.stroke();
  // The crown on top, which is what it would hang from.
  ctx.beginPath();
  ctx.arc(0, -r * 0.92, r * 0.22, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  // ...and the clapper, swinging inside the mouth. It is the one part that
  // moves against the shell, which is what makes a roll read as a swing.
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.3);
  ctx.lineTo(Math.sin(swing * 3) * r * 0.5, r * 0.42);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(Math.sin(swing * 3) * r * 0.5, r * 0.42, r * 0.17, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/**
 * One bead of a chain: a thick ring with a hole through it.
 *
 * RADIALLY SYMMETRIC on purpose, and that is a constraint rather than a
 * preference. At r 9 nothing interior is legible -- `CFG.hairline` puts the
 * stroke at 1.25 device pixels, which is 2.02 world units, so a 0.2r feature
 * is narrower than its own outline and merges into it. And a bead cannot say
 * which way the snake runs from inside the shape helper anyway: `angle` is a
 * random roll, so seven lozenges all pointing differently would read as
 * debris rather than as a chain. What says "chain" is the FORMATION, which is
 * the gait's job.
 *
 * The hole is what separates it from a DRIFT (a dashed circle with three dots
 * orbiting outside it) and from a MOTE's generic chip at this size.
 */
function drawBead(ctx, r, phase, time) {
  const beat = 0.86 + 0.14 * Math.sin(time * 2.2 + phase);
  // The ring: filled and stroked at full radius...
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // ...with the hole punched through it, stroked so it reads as an edge
  // rather than as a gap in the fill.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.44 * beat, 0, TAU);
  ctx.stroke();
  // Four short nicks on the rim, which is the only interior mark wide enough
  // to survive the stroke at this radius.
  for (let i = 0; i < 4; i++) {
    const a = phase * 0.3 + (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02);
    ctx.stroke();
  }
}

/**
 * A cage of salvage on its way out: a barred frame with beads inside it and a
 * bail on top, which is the half that reads as BEING LIFTED.
 *
 * Four greys now share one colour, so the silhouette is the whole of telling
 * them apart. A DRIFT is a dashed circle with three dots orbiting OUTSIDE its
 * own radius; an EMBER is a four-pointed spark with a trail beneath it; a HUSK
 * is an angular hull with a bite out of one side. This is the only one that is
 * a closed frame with something held INSIDE it -- the idiom drawGlut's `fed`
 * count already uses, which is why the beads are drawn at a fixed radius in a
 * ring rather than stippled: a count you can read is the point.
 */
function drawLantern(ctx, r, phase, time) {
  const lift = Math.sin(time * 1.6 + phase) * 0.05;
  ctx.save();
  ctx.rotate(lift);
  // The frame: a tall six-sided cage, flat top and bottom.
  const w = r * 0.72;
  const h = r * 0.98;
  ctx.beginPath();
  ctx.moveTo(-w * 0.62, -h);
  ctx.lineTo(w * 0.62, -h);
  ctx.lineTo(w, -h * 0.42);
  ctx.lineTo(w, h * 0.42);
  ctx.lineTo(w * 0.62, h);
  ctx.lineTo(-w * 0.62, h);
  ctx.lineTo(-w, h * 0.42);
  ctx.lineTo(-w, -h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The bars. Three of them, so the frame reads as a cage rather than a box
  // -- and vertical, because the thing inside is being carried upward.
  for (let i = -1; i <= 1; i++) {
    const bx = i * w * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx, -h * 0.78);
    ctx.lineTo(bx, h * 0.78);
    ctx.stroke();
  }
  // ...and its two rails, which close the bars off top and bottom.
  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.78, sy * h * 0.5);
    ctx.lineTo(w * 0.78, sy * h * 0.5);
    ctx.stroke();
  }
  // What it is carrying: a ring of beads, breathing together. Inside the
  // frame by construction, so the cage always reads as full.
  const n = CFG.lantern.cage;
  const beat = 0.7 + 0.3 * Math.sin(time * 2.6 + phase);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * w * 0.42, Math.sin(a) * h * 0.3, r * 0.11 * beat, 0, TAU);
    ctx.fill();
  }
  // The bail: a hook over the top, which is the mark nothing else has -- and
  // it is over the top only because the type carries `upright`; before build
  // 310 it pointed wherever the spawn roll had left `angle`.
  ctx.beginPath();
  ctx.arc(0, -h, r * 0.3, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.restore();
}

function drawDrift(ctx, r, phase, time) {
  ctx.setLineDash([r * 0.5, r * 0.42]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  const pulse = 0.6 + 0.4 * Math.sin(time * 1.3 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.36 * pulse, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = phase + time * 0.35 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.1, 0, TAU);
    ctx.fill();
  }
}

/**
 * SCION. A shell with three pods held inside it, which is what it is: a body
 * whose whole point is what comes out of it.
 */
function drawScion(ctx, r, phase, time) {
  ctx.beginPath();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase * 0.2;
    const rr = r * (i % 2 ? 0.86 : 1);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const spin = time * 0.5 + phase;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.19, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * A LATCH: a small body with four hooks already open.
 *
 * Four-fold symmetric on purpose, which is why the type declares no
 * `upright`: build 310 shipped two objects whose docstrings claimed an
 * orientation the drawing did not have, because `Enemy.draw` rotates by a
 * random spawn `angle` unless the type says otherwise. A shape that reads the
 * same at every quarter turn has no orientation to claim, so there is nothing
 * to protect and nothing to assert.
 *
 * The hooks reach 1.55r rather than the object guide's icon 2.2r. An icon is
 * drawn into a box and scaled by its own `view`; a body is drawn at its own
 * radius next to its own hitbox, and paint reaching more than twice the
 * radius reads as a body twice the size -- which for the one object whose
 * counter is "it is nine units wide" is the wrong thing to say.
 */
function drawLatch(ctx, r, phase, time) {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const grip = 0.72 + 0.28 * Math.sin(time * 3.2 + phase);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    // Out from the shell, then curled round: a quadratic whose control point
    // sits off the radial makes a hook rather than a spoke, and the curl
    // opens and closes a little so it reads as something looking for a hold.
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
    ctx.quadraticCurveTo(
      Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5,
      Math.cos(a + 0.62 * grip) * r * 1.55, Math.sin(a + 0.62 * grip) * r * 1.55,
    );
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, TAU);
  ctx.fill();
}

/**
 * Which picture a ball on a host wears, by the type that arrived as it.
 *
 * A ring can carry two kinds from build 322 and they do different things to
 * the host, so they must not look the same -- the same reason a SHOAL dart
 * could not keep MOTE's triangle. Routed through the rider's own `shape` so
 * the ball is the object it was in the air, which is what makes "shoot them
 * there instead" occur to anyone at all.
 *
 * The `default` arm is a real fallback rather than a throw, because a throw
 * in a draw path is a frozen frame and not an error (build 288) -- and it is
 * NOT left as a silent one: `regress.mjs` renders every riding type's ball
 * and requires each to differ from every other, so a third rider that fell
 * through to this arm would fail rather than quietly wear SEED's picture.
 */
function drawRiderBall(ctx, r, phase, time, shape) {
  switch (shape) {
    case 'latch': drawLatch(ctx, r, phase, time); break;
    case 'seed':
    default: drawSeed(ctx, r, phase, time); break;
  }
}

/** A SEED in flight: small, and pointed at whatever it has chosen. */
function drawSeed(ctx, r, phase, time) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const t = 0.6 + 0.4 * Math.sin(time * 6 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42 * t, 0, TAU);
  ctx.fill();
}

/**
 * An energy mote. It used to be drawn as `drawChip` — a small angular
 * pentagon, the same shape family as a body — because it used to be wreckage.
 * It is the charge the object was carrying, so it is a core with a halo on it
 * and it pulses: nothing else on the field glows steadily like this, which is
 * what makes a floor of it read as something to collect rather than something
 * to shoot.
 */
function drawDrop(ctx, r, phase, time) {
  const t = 0.72 + 0.28 * Math.sin(time * 3.4 + phase);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5 * t, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, TAU);
  ctx.fill();
  ctx.fill();
}

function drawChip(ctx, r, phase) {
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + phase;
    const rr = r * (0.6 + ((i * 37 + phase * 13) % 1) * 0.6);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ------------------------------------------------------------- spawn logic

const FORMATIONS = ['line', 'wedge', 'column', 'arc', 'cluster', 'ring'];

/**
 * Objects that actually count against the spawn budget. Harmless drift is
 * tracked separately so raising its population can never slow the run down.
 */
/**
 * What one body of this type WEIGHS, in threat points. (Build 301.)
 *
 * Health over `CFG.waves.threatPerHp`, and nothing else -- see that field for
 * why there is no per-mechanism term and how the derived numbers measure
 * against the plan's anchors. Two rules make it honest:
 *
 *   - `harmless` is ZERO. Drift is the mortar: it thickens a field without
 *     spending any of a wave's budget, which is the whole reason the stream
 *     and the scenery can be tuned apart.
 *   - a body that TOWS counts what it drags. `release()` makes the PAIR --
 *     `debugSpawn` makes only the head, which is an instrument fault a
 *     build-192 note published as a finding -- so a TOW weighs 135 + 280
 *     rather than 135, and derives 13.8 against the plan's rough 10.
 *   - a body that FRACTURES into its own kind counts what it BECOMES, which
 *     is the same claim one rung along. A QUARRY is 420 and then three at
 *     `hpAt` of that and nine at `hpAt` of those: 1138 rather than 420, so
 *     it derives 37.9 and not 14. Counted here rather than left to the
 *     author, because the alternative is a second source of truth for the
 *     same number -- and an under-counted body is a wave the budget thinks
 *     it can afford three of.
 */
export function threatOf(type) {
  if (!type || type.harmless) return 0;
  const towed = type.tows && TYPE_BY_ID[type.tows.type];
  /*
   * ...and a type that is MANY OF ITSELF counts all of them. One authored
   * SHOAL entry is fourteen bodies of fourteen health, so it weighs 6.5 and
   * not 0.47 -- the same claim as the TOW's, which counts what it drags
   * because `release` makes the pair. `beads` is in here for the same
   * reason and is inert today, FILAMENT being harmless: a hostile chain
   * would need no change.
   */
  const many = type.school || type.beads || 1;
  return (type.hp * fractureFactor(type) * many + (towed ? towed.hp : 0)) / CFG.waves.threatPerHp;
}

/**
 * How much health one body of a self-splitting type is worth in total, as a
 * multiple of its own.
 *
 * DERIVED from the same three fields the fracture itself runs on, and the
 * depth comes off the radius exactly the way `Enemy.destroy` decides whether
 * to split at all -- so a change to `scale` or `floor` moves the budget and
 * the behaviour together. A type that does not split into its own kind is 1.
 */
export function fractureDepth(type) {
  const sp = type && type.splits;
  if (!sp || sp.type !== type.id) return 0;
  /*
   * THROWS rather than defaulting, and the reason is that the loop below is
   * the fracture's own termination test: a `scale` at or above 1 is a chain
   * that never reaches the floor, which is not a balance mistake, it is the
   * game hanging on `threatOf` at module load. `levelsOf` and `bandOf` are
   * both written this way for the smaller version of the same problem --
   * a value that is indistinguishable from a chosen one.
   */
  if (!(sp.scale > 0 && sp.scale < 1)) throw new Error(`${type.id}: splits.scale must be above 0 and below 1, got ${sp.scale}`);
  if (!(sp.floor > 0)) throw new Error(`${type.id}: splits.floor must be above 0, got ${sp.floor}`);
  let n = 0;
  // The same test `Enemy.destroy` makes: a body splits while its own radius
  // is at or above the floor, and its children are `scale` of it.
  for (let r = type.r; r >= sp.floor; r *= sp.scale) n++;
  return n;
}

/**
 * What one body of a self-splitting type is worth in TOTAL health, as a
 * multiple of its own -- `1 + p + p^2 + ...` for `p = count * hpAt`, one
 * term per generation. A type that does not fracture is 1.
 */
export function fractureFactor(type) {
  const depth = fractureDepth(type);
  if (!depth) return 1;
  const per = type.splits.count * (CFG.quarry.hpAt || 0);
  let total = 0;
  for (let i = 0; i <= depth; i++) total += per ** i;
  return total;
}

/** ...and what a whole authored wave weighs, at the proportions it is written at. */
export function threatOfWave(wave) {
  let T = 0;
  for (const [id, n] of (wave && wave.of) || []) {
    const t = TYPE_BY_ID[id];
    if (t) T += threatOf(t) * n;
  }
  return T;
}

/**
 * What a band's wave is allowed to weigh, before the tier and the walk.
 *
 * DERIVED from that band's own authored waves -- their mean threat -- rather
 * than written down as a second table. So the budget follows the roster:
 * adding a wave to a band re-prices that band by existing, which is the rule
 * this repo keeps paying to re-learn (`world.apertures` sized 8 against 9
 * anomalies, the lot count in four places, a gate table typed out).
 *
 * The MEAN and not the max, because the walk in `CFG.waves.tier.budget`
 * averages exactly 1 across a band: the band's middle rung is the band as it
 * was authored and the ends are spread either side of it.
 *
 * A wave with no hostiles contributes nothing and is skipped -- the bonus
 * wave is 22 drifters and `of: []`, so it would otherwise drag band 1's
 * budget down by a quarter and, worse, be handed a scale of `budget / 0`.
 */
const BAND_BUDGET = (() => {
  const sums = {};
  for (const w of WAVES) {
    if (w.teach) continue;
    const T = threatOfWave(w);
    if (!(T > 0)) continue;
    const b = w.band || 1;
    (sums[b] = sums[b] || []).push(T);
  }
  const out = {};
  for (const b of Object.keys(sums)) {
    out[b] = sums[b].reduce((a, x) => a + x, 0) / sums[b].length;
  }
  return out;
})();

export function hostileCount(world) {
  let n = 0;
  // A body on its way out is not something the next wave has to wait for --
  // without this, `thinAt` counts the whole of a fizzled field for the second
  // it takes to go and the wave after a reset opens against a full board.
  for (const e of world.enemies) if (!e.dead && !e.harmless && !e.fizzle) n++;
  return n;
}

/*
 * How much DRIFT is on the field, which is not the same as how much harmless
 * matter is on it.
 *
 * Both callers gate `spawnDrift` -- the ambient trickle against `maxDrift`
 * and a wave's own placement against `driftCap` -- so the question is about
 * one type. It read `e.harmless`, which was already wrong for SEED (a
 * SCION's three quietly suppressed the ambient trickle) and would be wrong
 * again for every one of the twenty harmless objects: five EMBERs on the
 * floor would have stopped the grey arriving. Branched on the id, because
 * the branch is about one type -- the same correction build 275 made to
 * `spawnGroup`.
 */
export function driftCount(world) {
  let n = 0;
  for (const e of world.enemies) if (!e.dead && e.type.id === 'drift') n++;
  return n;
}

/**
 * Where a second SCION comes down. Two of them arriving together would seed
 * the same host twice and read as one event rather than two decisions, so the
 * second is pushed to whichever side of the field the first is not on.
 */
function scionLane(world, type, x) {
  const other = world.enemies.find((e) => !e.dead && e.type.id === 'scion');
  if (!other) return x;
  const lo = type.r + 12;
  const hi = world.width - type.r - 12;
  if (Math.abs(x - other.x) >= CFG.graft.apart) return x;
  const away = other.x < world.width / 2 ? hi : lo;
  return clamp(away + spread(60), lo, hi);
}

/**
 * Put one rolled type on the field, and say what that came to.
 *
 * A TOW is the only type that is two bodies, so it is the only one that needs
 * dispatching -- and the only reason this returns a list. It used to return
 * the head of the pair and nothing else, which was fine for the director,
 * which ignores the return, and wrong for the spawn screen, which counts it:
 * three TOWs put six bodies on the field and the panel said three.
 */
/*
 * Exported from build 276 for `debugFillField`, which had been building its
 * field out of `spawnOne`. A TOW is a PAIR -- a head plus the MASS it drags --
 * and only `release` makes both, so a fill was putting down 135hp heads
 * against the 415 the director actually sends. CLAUDE.md records the same
 * fault costing a published finding in build 192.
 */
export function release(world, type, x, y, opts) {
  if (type.tows) return spawnTow(world, x, y, opts);
  if (type.beads) return spawnChain(world, type, x, y, opts);
  if (type.school) return spawnSchool(world, type, x, y, opts);
  if (type.pair) return spawnPair(world, type, x, y, opts);
  const made = [spawnOne(world, type, x, y, opts)];
  /*
   * TETHERED: the wave arrives in pairs sharing one pool of health.
   *
   * Joined HERE rather than in load(), because a job is not a body until it
   * is released and the cap may hold one back -- pairing a plan would leave
   * half of the pairs joined to something that never arrived. A body waits
   * for the next one out of the same wave; the odd one at the end of a wave
   * simply stays single, which is the honest answer to an odd count.
   *
   * A TOW is left alone: it has a tether of its own that means something
   * else entirely, and two meanings on one field would be one too many.
   */
  const d = world.director;
  if (d && d.traits && d.traits.length && hasTrait(d.traits, 'tethered')) {
    const e = made[0];
    if (e && !e.harmless && !type.tows) {
      const waiting = d.pairing;
      if (waiting && !waiting.dead && !waiting.tether) {
        e.tether = { other: waiting, len: 96 };
        waiting.tether = { other: e, len: 96 };
        e.hp = Math.min(e.hp, waiting.hp);
        waiting.hp = e.hp;
        d.pairing = null;
      } else d.pairing = e;
    }
  }
  return made;
}

/**
 * Release one object into the run. `world.released` is counted here, at the
 * one place a hostile enters the world. Nothing gates on it: the 500-object
 * quota it was kept for went with `releasesLeft` in build 186, having returned
 * Infinity on every call since runs became endless in build 81. It is still
 * counted because the debug readout and the save both show it.
 */
/**
 * Which wave a body belongs to, and the wave's count of its own.
 *
 * The OBJECTS figure is "how many of THIS WAVE'S objects are down", and a
 * wave's objects are not the same as the hostiles on the field: bodies from
 * the wave before are still standing (a wave ends when the field THINS, not
 * when it empties), and a wave produces more than it asked for -- a SPLITTER's
 * children, a SEED, a TOW's MASS. Counting the field instead of the wave is
 * what made the figure jump when a wave turned over with things still on it.
 *
 * `from` is the body that made this one, and its tag is inherited: a
 * SPLITTER's children belong to the wave that released the SPLITTER even when
 * it is torn open two waves later. Only bodies of the RUNNING wave are added
 * to `made`, or a late split would inflate a total the figure is a fraction
 * of, and the bar would go backwards.
 */
function tagBody(world, e, from) {
  const d = world.director;
  if (!d || e.harmless) return e;
  e.wave = from ? (from.wave ?? d.serial) : d.serial;
  if (e.wave === d.serial) d.made++;
  return e;
}

/**
 * The tier's health, bounty and wave rules.
 *
 * This used to live inside `spawnOne` under a comment calling it "the one
 * place every hostile enters the world", and that was not true: a SPLITTER's
 * children and a SCION's seeds are made with `new Enemy` at the point their
 * parent came apart, so most of a splitting type's mass entered the world at
 * TIER 1 rates however deep the run was -- a soft target that paid tier-1
 * energy, beside an identical body that had arrived on its own with 8.6x the
 * health at tier 20. It is a function so the three sites can share it.
 *
 * Deliberately not applied to the harmless: DRIFT is a promise the field
 * keeps, and a tier-8 DRIFT with eight times the health is a grey object that
 * does not die like a grey object. The bonus wave stays a bonus -- and a
 * SCION's seeds are harmless bodies, so they are covered by that arm rather
 * than by an exception of their own.
 *
 * ...and not to a teach wave either. The opening is authored at exactly the
 * size and difficulty it should be; a tier-40 multiplier on it turns the
 * sentence "this is a NEEDLE" into a 29-second wall that teaches nothing.
 */
function scaleToTier(world, e, type) {
  const d = world.director;
  if (!d || e.harmless || type.fixed || d.wave?.teach) return e;
  const k = d.scaleAt(d.tier);
  e.maxHp *= k.hp;
  e.hp = e.maxHp;
  e.hpScale = k.hp;
  e.bounty *= k.bounty;
  /*
   * ...and the wave's rules, on the hostiles only.
   *
   * Grey is harmless: DRIFT and energy are never traited, which is why this
   * sits inside the same guard as the tier multiplier rather than beside it.
   * An ARMORED mote would break the one promise the colour rule makes.
   */
  if (d.traits && d.traits.length) {
    e.traits = d.traits;
    if (hasTrait(d.traits, 'swarm')) {
      e.maxHp = Math.max(1, Math.round(e.maxHp * CFG.waves.tier.swarmHp));
      e.hp = e.maxHp;
    }
  }
  return e;
}

export function spawnOne(world, type, x, y, opts = {}) {
  const e = new Enemy(type, x, y, { staged: true, spawnIn: 1, ...opts });
  scaleToTier(world, e, type);
  world.enemies.push(e);
  if (!e.harmless) world.released++;
  return tagBody(world, e, null);
}

/**
 * A TOW and the mass it drags. Two real bodies joined by a constraint, so the
 * pair swings and shoves — and two of the five hundred, the same way a
 * splitter's children are.
 */
/** Exported for the test suite, which builds a TOW pair directly. */
function spawnTow(world, x, y, opts = {}) {
  const head = TYPE_BY_ID.tow;
  const massType = TYPE_BY_ID[head.tows.type];
  const len = head.tows.length;
  const a = spawnOne(world, head, x, y, opts);
  const b = spawnOne(world, massType, x + spread(30), y - len, { ...opts, route: a.route });
  a.tether = { other: b, len };
  b.tether = { other: a, len };
  return [a, b];
}

/**
 * A chain: `type.beads` bodies in a column, each linked to the one ahead.
 *
 * Modelled on `spawnTow` because that is the repo's one mechanism for a type
 * that is more than one body -- `release()` dispatches on a TYPE FIELD, each
 * body is pushed to `world.enemies` exactly once by `spawnOne`, and the array
 * that comes back is what callers that count read. A boss's roster is the
 * wrong model: `Boss.body()` makes its pieces `fixed` with `invMass` 0 and
 * `drive()` returns on its first line for those, and a bead has to be STEERED.
 *
 * The beads are laid UP-FIELD of the release point, a gap apart, so the column
 * queues through the portal's throat nose-first and comes out as a line. Each
 * carries the one ahead of it; the head carries null, which is what `chain`
 * reads to know it is a head.
 *
 * `route` is shared with the head, the way `spawnTow` shares it with its load:
 * the beads take the same staged march in, or the column fans out inside the
 * doorway before the gait has ever run.
 */
/**
 * The bar a capsule hit profile is tested against, in units.
 *
 * THROWS on a shape that is not a bar, the rule `levelsOf`, `bandOf`,
 * `climbOf`, `beadsOf` and `schoolOf` all carry -- a thickness at or above
 * the length is not a bar, it is a disc with extra arithmetic, and the hit
 * test would quietly become a slightly wrong circle. Exported so
 * check-build.mjs can assert the reach against MAX_BODY_R at the table
 * rather than at the first round fired.
 */
export function barOf(type, r) {
  if (!type || !type.bar) throw new Error(`${type && type.id}: has no bar`);
  const C = CFG.cartwheel;
  if (!(C.long > 0 && C.thin > 0 && C.long > C.thin)) {
    throw new Error(`cartwheel.long ${C.long} / thin ${C.thin}: a bar is longer than it is thick`);
  }
  const rad = r ?? type.r;
  return { half: rad * C.long, thick: rad * C.thin, reach: rad * (C.long + C.thin) };
}

/**
 * How many bodies one authored SHOAL entry makes. Mandatory and no default,
 * the same rule `levelsOf`, `bandOf`, `climbOf` and `beadsOf` carry -- a
 * `school` of one is a school of nothing and a dispatch for no reason.
 */
export function schoolOf(type) {
  const n = type && type.school;
  if (!Number.isInteger(n) || n < 2) throw new Error(`${type && type.id}: school must be a whole number above one, got ${n}`);
  return n;
}

/**
 * The two halves of a YOKE. Mandatory and no default, the rule `levelsOf`,
 * `bandOf`, `climbOf`, `beadsOf`, `schoolOf` and `barOf` all carry -- and
 * pinned at exactly two, because the beam is rigid and a rigid constraint
 * between three bodies is a different solver.
 */
/**
 * The one lane a `dive` body may use, off the two rules it would otherwise
 * fight.
 *
 * A dive cannot go THROUGH the machine -- see `CFG.shrike` for the
 * measurement -- so the lane is the nearest column that grips it without
 * entering its overlap: `e.r + s.r` is the boundary `resolvePair` separates
 * at and bills `impactDamage` across, and `CFG.shooter.grabPad` past it is
 * where `checkContact` still takes hold. Measured across lanes 0 to 56, a
 * lane at the grip band grips for six frames, delivers its corruption, takes
 * nothing at all, passes the machine and reaches the floor; a lane on the
 * column is dead at frame 83 and a lane four units wider never grips.
 *
 * Derived rather than authored for `CFG.mines.era2`'s reason: the two radii
 * and the pad are the only inputs, so a dive body of another size is covered
 * by existing -- which is also why `drawShrike`'s streaks are multiples of
 * `r` and not the absolute lengths the guide authored on an r-14 body.
 *
 * @param {object} world
 * @param {object} e the diving body
 * @returns {number} the world x of its lane, on the side it is already on
 */
/**
 * Is another body of this gait already running the lane on this side?
 *
 * The corridor is `grabPad` wide and every body on a side derives the same
 * lane, so there is no per-body offset available inside it -- the separation
 * has to be in TIME. Measured without it, on the shipped wave: two shrikes
 * both dived, met in the corridor at a relative 300 u/s and were both dead
 * at 27.8 seconds.
 *
 * Only the DIVE is exclusive. Holding and climbing are outside the lane by
 * construction (the climb swings `CFG.shrike.swing` clear of it), so they
 * cannot collide there and must not block each other.
 */
function laneBusy(world, e) {
  for (const o of world.enemies) {
    if (o === e || o.dead || o.type.gait !== e.type.gait) continue;
    if (o.divePhase === 'dive' && o.diveSide === e.diveSide) return true;
  }
  return false;
}

export function diveLane(world, e) {
  const s = world.shooter;
  const side = e.diveSide || (e.x < s.x ? -1 : 1);
  // HALF a pad inside the grip band, not on it. `checkContact` grips on
  // `dist <= band`, so a lane at the band exactly passes that test at one
  // point and the body's own drift decides whether the pass delivers --
  // measured, 18 grip frames at wobble 0.12 against 439 at wobble 0.
  const gap = e.r + s.r + CFG.shooter.grabPad / 2;
  return clamp(s.x + side * gap, e.r + 4, world.width - e.r - 4);
}

export function pairOf(type) {
  const n = type && type.pair;
  if (n !== 2) throw new Error(`${type && type.id}: pair must be exactly 2, got ${n}`);
  const Y = CFG.yoke;
  if (!(Y.len > type.r * 2)) throw new Error(`yoke.len ${Y.len} must clear two radii (${type.r * 2})`);
  if (!(Y.snap > 0 && Y.snap < 1)) throw new Error(`yoke.snap ${Y.snap} must be a share of the pool`);
  if (!(Y.alone > 1)) throw new Error(`yoke.alone ${Y.alone} must be a speed a survivor GAINS`);
  return { n, len: Y.len, snap: Y.snap, alone: Y.alone };
}

/**
 * A pair on a rigid beam, sharing one pool.
 *
 * Modelled on `spawnTow`, which is this repo's one mechanism for a type that
 * is more than one body -- two `spawnOne` pushes, one entry each in
 * `world.enemies`, and the array back for the callers that count. The
 * difference is in the tether: `rigid` makes `solveTethers` correct
 * compression as well as extension, so the beam holds its length instead of
 * going slack, and `beam` is what the gait and the damage path read.
 *
 * Laid across the field rather than up it, because the pair turns about its
 * own midpoint and a vertical pair would spend its first second sweeping one
 * half through the other's lane. `route` is shared, the way a chain's and a
 * tow's are, or the two halves take different arcs in and the beam fights
 * the march.
 */
function spawnPair(world, type, x, y, opts = {}) {
  const P = pairOf(type);
  const half = P.len / 2;
  const lo = type.r + 4;
  const hi = world.width - type.r - 4;
  const a = spawnOne(world, type, clamp(x - half, lo, hi), y, opts);
  const b = spawnOne(world, type, clamp(x + half, lo, hi), y, { ...opts, route: a.route });
  a.tether = { other: b, len: P.len, rigid: true };
  b.tether = { other: a, len: P.len, rigid: true };
  a.beam = true;
  b.beam = true;
  /*
   * ONE POOL means one ceiling: the constructor rolls `maxHp` per body at
   * `rand(0.92, 1.1)`, so without this the two halves would disagree about
   * what the pool's full is and `snap` -- a share of `maxHp` -- would be a
   * different number on each of them.
   */
  b.maxHp = a.maxHp;
  b.hp = a.hp;
  /*
   * ...and one turning SENSE. `routeSide` is a coin flip taken per body in
   * the constructor, and `pairOn` reads it to decide which way round the
   * midpoint the pair goes -- so two halves that rolled differently would
   * hold opposite tangents and fight through the beam for the whole run.
   */
  b.routeSide = a.routeSide;
  return [a, b];
}

/** A serial per school, so fourteen bodies can find each other with no roster. */
let shoalSeq = 0;

/**
 * A school: `school` bodies of one type, laid in a blob and stamped with one
 * serial.
 *
 * Private and not exported, for the same reason the counter above is: a
 * reassigned `export let` is a live binding in a module and a SNAPSHOT in the
 * bundle, which is the fault build 199 measured and `bundle.mjs` now fails
 * the build for. Nothing outside this file needs either.
 *
 * They share the leader's `route`, the way a chain's beads do, so the march
 * IN is one group arriving rather than fourteen independent arcs -- the flock
 * takes over on the frame `staged` clears.
 */
function spawnSchool(world, type, x, y, opts = {}) {
  const n = schoolOf(type);
  const spread = type.r * CFG.flock.spread;
  const made = [];
  shoalSeq += 1;
  for (let i = 0; i < n; i++) {
    // A blob rather than a shape: a school has no formation, and a ring or a
    // wedge of fourteen would read as one.
    const a = rand(0, TAU);
    const d = Math.sqrt(Math.random()) * spread;
    const e = spawnOne(
      world, type,
      clamp(x + Math.cos(a) * d, type.r + 4, world.width - type.r - 4),
      y + Math.sin(a) * d * 0.7,
      i === 0 ? opts : { ...opts, route: made[0].route },
    );
    e.shoal = shoalSeq;
    made.push(e);
  }
  return made;
}

function spawnChain(world, type, x, y, opts = {}) {
  const n = beadsOf(type);
  const gap = chainGap(type);
  const made = [];
  let ahead = null;
  for (let i = 0; i < n; i++) {
    const e = spawnOne(world, type, x, y - i * gap, i === 0 ? opts : { ...opts, route: made[0].route });
    e.link = ahead;
    ahead = e;
    made.push(e);
  }
  return made;
}

/** Distance constraints, resolved after the contact solver. */
export function solveTethers(world) {
  for (const e of world.enemies) {
    const t = e.tether;
    if (!t) continue;
    const o = t.other;
    // The cable goes slack the moment either end dies, and clearing both sides
    // stops the survivor dragging a corpse around the field.
    if (o.dead || e.dead) { e.tether = null; if (o) o.tether = null; continue; }
    if (e.x > o.x || (e.x === o.x && e.y > o.y)) continue; // solve each pair once

    let dx = o.x - e.x;
    let dy = o.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) continue;
    const err = d - t.len;
    /*
     * A cable pulls and does not push; a BEAM does both. `rigid` is what
     * YOKE's pair carries, and without this arm the two halves would drift
     * together under the pair solver and the march and the beam would read
     * as a slack rope -- the one thing the object cannot look like. The
     * arithmetic below already handles a negative `err`: `push` comes out
     * negative and each body is moved AWAY from the other, which is the
     * correction a compressed beam wants.
     */
    if (err <= 0 && !t.rigid) continue;
    dx /= d;
    dy /= d;
    const inv = e.invMass + o.invMass;
    if (inv <= 0) continue;
    // Positional, weighted by inverse mass, plus a matching velocity
    // correction so the pair swings instead of buzzing.
    const push = err * 0.42;
    e.x += dx * push * (e.invMass / inv);
    e.y += dy * push * (e.invMass / inv);
    o.x -= dx * push * (o.invMass / inv);
    o.y -= dy * push * (o.invMass / inv);
    const rel = (o.vx - e.vx) * dx + (o.vy - e.vy) * dy;
    // ...and the velocity half of the same rule: a cable only has to stop the
    // pair separating, a beam has to stop it closing as well.
    if (rel > 0 || (t.rigid && rel < 0)) {
      const j = rel / inv;
      e.vx += dx * j * e.invMass;
      e.vy += dy * j * e.invMass;
      o.vx -= dx * j * o.invMass;
      o.vy -= dy * j * o.invMass;
    }
  }
}

/**
 * Salvage into the bank, at whatever rate the turret is managing. Objects
 * attached to it are sitting on the intake: one costs about a fifth, five
 * costs seventy per cent, and it never reaches nothing.
 */
export function intakeRate(world) {
  const S = CFG.energy;
  const n = Math.min(world.attackers.size, S.taxCap);
  const bite = 1 - (1 - S.tax) * world.up.insulation;
  return Math.max(S.taxFloor, bite ** n);
}

/**
 * The depth dividend: what everything banked is multiplied by.
 *
 * Off the PEAK rather than the current tier, so stepping back to breathe does
 * not cost you the rate you climbed for -- the ladder is already a difficulty
 * decision and it should not also be a pay cut. Anomalies count for five times
 * a rung because they are the only thing on the ladder that is put down once.
 */
export function dividend(world) {
  const T = CFG.waves.tier;
  const peak = world.director ? world.director.peak : 1;
  const done = world.reconciled ? world.reconciled.length : 0;
  return Math.min(T.dividendCap, 1 + T.dividendPeak * peak + T.dividendAnomaly * done);
}

function bank(world, amount, x, y) {
  // Nothing is earned on the bench. This is the one place energy enters a
  // run, so it is the one place that has to say so.
  if (world.sandbox) return;
  const got = amount * intakeRate(world) * dividend(world);
  world.bytes += got;
  // The one place energy enters a run, so the one place the lifetime counter
  // can be kept honest. Net of the corruption tax on purpose: what was taken
  // off you at the intake was never earned.
  world.earned += got;
  /*
   * What this wave has been worth, RAW -- before the intake tax and before the
   * dividend. The margin is paid back through this same function, so banking
   * the netted figure would tax and multiply it a second time.
   */
  const d = world.director;
  if (d && !d.resting) d.take += amount;
  /*
   * ...and a mote to say so, for anything worth a kilobyte or more.
   *
   * `got >= 1` before the byte migration, which was one whole point -- the
   * smallest amount the purse can take is `minValue * taxFloor`, three tenths
   * of one, so the threshold was doing real work. Left at 1 it would be one
   * BYTE, met by every bank there has ever been, and a threshold that is
   * always true is a threshold that has quietly been deleted.
   */
  if (got >= kB(1)) dot(x, y, 0, -60, '#9fe8ff', 0.5, 3);
}

/**
 * Wreckage comes to you, and what happens when it gets there is a decision.
 *
 * There is no collection radius. There was one -- an unmarked circle at 190
 * units where a fragment silently stopped existing -- and it made the floor
 * pay for itself while you looked the other way. Now a fragment drifts all the
 * way in and lands on the turret, and it is still lying there: **the way to
 * bank it is to destroy it**, which costs the shots that were going up the
 * field instead. A floor you have not cleared is a pile physically on top of
 * you, eating your own rounds until you spend some on it.
 *
 * INTAKE is the upgrade that ends that chore: with it, anything touching the
 * turret is taken in on contact. It is the difference between wreckage being
 * work and wreckage being income, which is worth a card.
 */
/**
 * Every mote within reach, taken in at once. PULSE is the only thing that does
 * this; an offer called SCOUR did it with no limit and a bonus on the pay, and
 * that system is gone -- so the `bonus` both of these carried went with it. It
 * was a parameter nothing could set: PULSE is the sole caller and passes
 * nothing, so it was 1 on every call it ever made. A multiplier that cannot be
 * anything but one is a branch that cannot be taken.
 *
 * @returns how many were taken, so the caller can decide whether to say so.
 */
export function drawIn(world, radius) {
  const s = world.shooter;
  const r2 = radius * radius;
  let took = 0;
  for (const e of world.drops) {
    if (e.dead || !e.bytes) continue;
    if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > r2) continue;
    absorb(world, e, true);
    took++;
  }
  return took;
}

/** One mote taken in. */
export function absorb(world, e, streak = false) {
  if (e.dead || !e.bytes) return;
  /*
   * WITH the mark, the way `Enemy.destroy` pays it (`this.bytes *
   * this.bounty`). This is the only collector PULSE's drawIn and INTAKE go
   * through, and it banked the raw energy -- so taking a mote in paid the
   * authored number while shooting the same mote paid the tier's compounding
   * 1.10^(tier-1) on top of it, plus OVERCLOCK's double and whatever TITHE
   * had marked it for.
   *
   * Measured, fourteen motes off a BULWARK, PULSE against destroying them:
   * tier 1 113/113, tier 6 119/191, tier 12 125/358, tier 20 134/822. The
   * ratios are 1/1.10^(tier-1) to three places, which is the whole of the
   * bug. An ability whose one line is "takes in the energy" paid 16% of what
   * the floor was worth by tier 20, and buying INTAKE lowered your income.
   *
   * The mark is put on the mote deliberately at the site that makes it (see
   * the note there); nothing was reading it back.
   */
  bank(world, e.bytes * (e.bounty || 1), e.x, e.y);
  // Drawn in from a distance rather than walked into: show it arriving, or
  // a PULSE that empties the floor is a number in the corner going up.
  if (streak) {
    const s = world.shooter;
    haul(e.x, e.y, s.x, s.y, '#9fe8ff', 0.42, 2.6);
  }
  e.bytes = 0;
  e.dead = true;
  e.dissolved = true;
}

export function collectData(world, dt) {
  const S = CFG.energy;
  const s = world.shooter;
  const list = world.drops;
  const auto = world.up.intake;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.dead || !e.bytes) continue;
    const dx = s.x - e.x;
    const dy = s.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (auto) {
      // Landed on the turret. Touching, not merely near: the reach is the two
      // radii and a little, the same test contact uses for everything else.
      const rr = s.r + e.r + 2;
      if (d2 <= rr * rr) {
        absorb(world, e);
        continue;
      }
    }
    const d = Math.sqrt(d2) || 1;
    e.vx += (dx / d) * S.pull * dt;
    e.vy += (dy / d) * S.pull * dt;
  }
}

/**
 * Where the i-th member of a shape sits, relative to the shape's centre.
 *
 * Pulled out of spawnFormation when the debug screen grew a shape picker: two
 * copies of this switch would have let a RING mean one thing to the director
 * and another to the panel meant for inspecting it.
 */
function formationOffset(shape, i, count, gap) {
  const k = i - (count - 1) / 2;
  switch (shape) {
    case 'line': return [k * gap, 0];
    case 'wedge': return [k * gap, -Math.abs(k) * gap * 0.8];
    case 'column': return [spread(6), -i * gap];
    case 'arc': return [k * gap, -(k * k) * gap * 0.16];
    case 'ring': {
      const a = (i / count) * TAU;
      return [Math.cos(a) * gap * 1.1, Math.sin(a) * gap * 1.1];
    }
    default: return [spread(gap * 1.4), spread(gap * 1.4)];
  }
}

/**
 * How far off the true bearing a route swings at a given range, in world units
 * and before the body's own `routeScale`/`routeSide`.
 *
 * Pulled out of `drive` so it can be measured. All four numbers in it are the
 * SHAPE of an approach rather than a capability, so all four scale with the
 * view: left alone at era 2 a SWEEP's 300-unit swing draws 121 CSS px against
 * era 1's 186, and the fold-in -- an absolute 380 units -- happens across 153
 * px instead of 236. Every route flattens 35% toward DIRECT, which is the one
 * thing a wider field was supposed to show off. Speeds are untouched by
 * ruling; this is distance, and distance is what the camera changed.
 *
 * `CFG.scale` is 1 at era 1, so this is the arithmetic it always was there.
 */
export function routeLateral(r, d, routeScale = 1, routeSide = 1) {
  const k = CFG.scale;
  const reach = clamp(d / (520 * k), 0, 1) ** r.commit;
  const closing = clamp((d - 170 * k) / (210 * k), 0, 1);
  /*
   * The body's own two factors are passed IN rather than applied to the
   * answer, and the order of this product is not free. Floating-point
   * multiplication is not associative, so pulling this out of `drive` as
   * `routeLateral(r, d) * routeScale * routeSide` re-associated it and moved
   * every body by a bit a frame -- which compounds, and moved ORDINAL's
   * canonical hash on a build whose whole claim was that era 1 could not
   * change. `k` is exactly 1 there and `width * 1` is exact, so written this
   * way the era-1 product is the one `drive` formed before build 241, to the
   * bit. A refactor that only reorders arithmetic is still a change.
   */
  return r.width * k * routeScale * routeSide * reach * closing;
}

/** A formation queued above the screen, marching down into it. */
export function spawnFormation(world, kinds, count) {
  const shape = pick(FORMATIONS);
  // Somewhere across the width, with enough room either side for the shape.
  const half = Math.min(world.width * 0.22, 190);
  const cx = clamp(world.width / 2 + spread(world.width * 0.5), half, world.width - half);
  // A formation is one type in a shape; a shape made of towed pairs is not a
  // formation, it is a traffic jam, and it would cost double the allotment.
  /*
   * ...and `solo` is the same refusal for a different reason: a SCION seeds
   * whatever it lands near, so three to six arriving together is one event
   * where the object's whole design is a decision per body. This is the
   * ROLL's half of the rule; the other half is in `Director.load`, which
   * refuses to GROUP one. Both are needed and they cannot disagree -- a
   * caller that names the type (the director, the debug picker) goes through
   * load's half, and a caller that hands over a list goes through this one.
   */
  const single = kinds.filter((k) => !k.tows && !k.solo);
  const type = weightedPick(single.length ? single : kinds);
  const gap = type.r * 2.5 + 8;
  /*
   * Rolled HERE and not one line earlier. `cx` above is drawn before the type
   * is picked, so hoisting `weightedPick` above the `spread` -- or the spread
   * below it -- swaps two `Math.random` calls at era 1 and re-baselines
   * ORDINAL for a change that is supposed to be a no-op there. `mouthSlots`
   * draws nothing and is null at era 1.
   */
  const slots = mouthSlots(world, type.r, gap, count);
  const made = [];

  for (let i = 0; i < count; i++) {
    const [ox, oy] = slots ? slots[i] : formationOffset(shape, i, count, gap);
    const x = slots ? ox : clamp(cx + ox, type.r + 4, world.width - type.r - 4);
    const y = -60 + oy - rand(0, 30);
    /*
     * release(), not spawnOne(). The line above drops towed types when there
     * is anything else to pick, but with a single kind there is nothing to
     * fall back to -- and spawnOne on a TOW makes a head with no MASS and no
     * cable, which is not a TOW at all. Unreachable until build 110 only
     * because the TOW waves never actually played; the director refuses to
     * form them up either, so this is the belt to that pair of braces.
     */
    made.push(...release(world, type, x, y, { speedScale: rand(0.94, 1.06) }));
  }
  return made;
}

/** The shapes a group can be asked for by name. */
export const FORMATION_SHAPES = FORMATIONS;

/** Nobody needs forty BULWARKs, and the frame time says so. */
export const GROUP_MAX = 24;

/**
 * One named group, exactly as asked for: this type, this many, this shape,
 * arriving this way.
 *
 * spawnFormation deliberately rolls its own type and drops the towed pair,
 * because inside a run a formation of TOWs is a traffic jam rather than a
 * formation. The debug screen wants the opposite of all of that -- the point
 * there is to get the thing you pointed at, and a wall of TOWs is a legitimate
 * thing to want to look at once.
 *
 *   where: 'entry' queues it above the screen so the march in is part of what
 *          you see; 'field' puts it down in the arena already loose, which is
 *          the only way to watch a behaviour that only starts after the entry
 *          line -- warding, feeding, splitting.
 */
export function spawnGroup(world, id, count, opts = {}) {
  const type = TYPE_BY_ID[id];
  if (!type) return [];
  const n = clamp(Math.round(count) || 1, 1, GROUP_MAX);
  const shape = FORMATIONS.includes(opts.shape) ? opts.shape : pick(FORMATIONS);
  const onField = opts.where === 'field';
  const gap = type.r * 2.5 + 8;
  const half = Math.min(world.width * 0.3, 200);
  const cx = clamp(opts.x ?? world.width / 2 + spread(world.width * 0.4), half, world.width - half);
  // On the field, somewhere with room to be watched: below the entry line so
  // nothing is still marching, and clear of the floor so nothing lands on it.
  const lo = entryLine(world, ENTRY_Y) + 90;
  const hi = Math.max(lo + 40, world.floorY - 220);
  const cy = onField ? clamp(opts.y ?? rand(lo, hi), lo, hi) : -60;
  const made = [];

  for (let i = 0; i < n; i++) {
    const [ox, oy] = formationOffset(shape, i, n, gap);
    const x = clamp(cx + ox, type.r + 4, world.width - type.r - 4);
    const y = onField
      ? clamp(cy + oy, ENTRY_Y + 40, world.floorY - type.r - 24)
      : cy + oy - rand(0, 30);
    /*
     * Drift is not released, it is let go: it has its own entry velocities and
     * is not counted against anything.
     *
     * Branched on the ID and not on `harmless`, because TWO types carry that
     * flag -- DRIFT and SEED, what a SCION leaves -- and `spawnDrift` opens
     * with `const type = TYPE_BY_ID.drift`, ignoring whatever it was reached
     * for. So the debug picker's SEED chip, which has its own portrait and its
     * own name, put down five DRIFTs and the panel said "+5 SEED": the exact
     * thing its own comment says that alert exists to prevent. A SEED is an
     * ordinary body and falls through to `release` like everything else.
     */
    if (type.id === 'drift') { made.push(spawnDrift(world, { x, y, here: true })); continue; }
    made.push(...release(world, type, x, y, {
      staged: !onField,
      spawnIn: onField ? 0.25 : 1,
      speedScale: rand(0.94, 1.06),
    }));
  }
  return made;
}

/** Loose, aimless matter that comes down with everything else. */
export function spawnDrift(world, opts = {}) {
  const type = TYPE_BY_ID.drift;
  // The two `??` lines stay exactly where they are: the caller at the ambient
  // site rolls its own stagger before this runs, and moving either roll swaps
  // the draw order at era 1.
  let x = opts.x ?? clamp(world.width / 2 + spread(world.width * 0.8),
    type.r + 6, world.width - type.r - 6);
  let y = opts.y ?? ENTRY_Y + rand(10, 40);
  /*
   * Drift used not to be `staged`, so unlike everything else it had no march
   * to hide behind the interface -- it appeared exactly where it was put,
   * which from build 297 would be in open sky above the portal. It is laid
   * INSIDE the portal instead, in the upper half of the surface where nothing
   * is drawn, keeping whatever stagger its caller asked for as an offset, and
   * it comes through the rim the way everything else does. `here` is the
   * escape for a caller placing something deliberately, and the assay -- no
   * portal -- keeps the loose spawn it always had.
   */
  const a = opts.here ? null : world.portal;
  if (a) {
    x = throughMouth(world, x, type.r);
    y = clamp(a.y - 6 * CFG.scale - (ENTRY_Y + 40 - y),
      a.top - type.r, a.y - 2 * CFG.scale);
  }
  /*
   * ...and it MARCHES OUT before it fans, which is what everything else does
   * and what DRIFT alone did not.
   *
   * At era 2 it was laid in the throat and handed `vx: spread(30)` on the
   * same frame, so it opened up sideways while it was still inside the
   * doorway -- measured at spawn, y 334 against a gate at 400 with a lateral
   * already on it, where a hostile at the same depth runs straight until it
   * is past 400 and only then steers. Reported as exactly that.
   *
   * `staged` is the mechanism the rest of the field uses and the release line
   * is already the gate, so the drift is held on `fan` and applied on the
   * frame the body comes loose. Without a portal there is no gate, and it
   * keeps the immediate lateral it has always had.
   */
  const lateral = spread(30);
  const e = new Enemy(type, x, y, a
    ? { staged: true, spawnIn: 1, vx: 0, vy: rand(10, 50) }
    : { staged: false, spawnIn: 1, vx: lateral, vy: rand(10, 50) });
  if (a) e.fan = lateral;
  world.enemies.push(e);
  return e;
}

/**
 * The wave runner. Objects arrive in groups with a beginning and an end, and
 * the quiet between two of them is the point — a trickle never finishes and
 * so never starts.
 *
 * Nothing here is ever named on screen. There is no counter and no banner: a
 * number would turn a rhythm into a score.
 */
export class Director {
  constructor() {
    this.reset();
  }

  reset() {
    // The field starts empty and stays empty for a while. There is an
    // interface to find, a lever to try and two things already in hand before
    // the first object is released, and none of that should be done while
    // reacting. Harmless drift comes well before any of it, so there is
    // something to shoot at while the field is still safe.
    this.driftTimer = CFG.driftStart;
    this.order = []; // wave indices, in the order they will be played
    this.at = -1; // which of `order` is running; -1 is "not started"
    this.cycle = 0; // full passes finished — the first one carries the opening
    this.jobs = []; // what is left to release in the running wave
    this.asked = 0; // how many the running wave asked for, after the swell
    /*
     * The running wave's own tally: which wave it is, how many bodies it has
     * actually put on the field, and how many of those are down. Counted
     * rather than inferred -- see cleared() for why subtracting the field
     * from `asked` cannot answer the question, and tagBody for why the field
     * is not the wave. `slain` is fed from Game.registerKill, the one door
     * every death comes through; `made` from tagBody, the one door every
     * hostile comes through. Zeroed by load() for every wave including the
     * teach ones.
     */
    this.serial = 0;
    this.made = 0;
    this.slain = 0;
    this.done = false; // the running wave has been scored and is finished
    this.timer = CFG.openingGrace; // until the next release, or the next wave
    this.wait = 0; // how long this wave has been waiting for the field to thin
    this.resting = true; // between waves rather than inside one
    /*
     * ---- the ladder ----
     * `tier` is the run's difficulty step. It climbs on a clean wave, is
     * pinned by `hold`, and steps back on its own after two failures. The
     * three scoring fields below are gathered while a wave runs and read when
     * it ends -- see score().
     */
    this.tier = 1;
    /*
     * The highest tier this run has stood on, which is not the same as the
     * highest below it. A run that reached 8 and stepped back to 5 has been
     * through 6 and 7, and the rail's ticks mean "passed" rather than
     * "smaller than where you are" -- so it is recorded rather than inferred.
     */
    this.peak = 1;
    this.hold = false;
    this.contact = 0; // seconds anything spent on the turret this wave
    this.hitPatience = false; // ...and whether the field ever thinned
    /*
     * ---- the glitch timer ----
     *
     * `held` is seconds of UNBROKEN contact and exists only to arm the thing;
     * `glitch` is the fuse itself, 0 to 1, and is what everything else reads:
     * the ring round the turret, the seconds inside it, and the screen effect
     * the mechanic is named after. Neither is per-wave and neither is saved --
     * a run picked up from a file starts with a clear turret by construction,
     * because `restore()` puts the wave back to the top and nothing is on the
     * field yet.
     */
    this.held = 0;
    this.glitch = 0;
    /*
     * ...and WHICH of the two signals is filling it this frame: 'contact',
     * 'crowd', or null while it is draining. The ring means one thing and the
     * cause is two, and until build 293 nothing recorded the difference -- so
     * the one sentence explaining the ring named contact, and a run drowning
     * with a clear mount got a closing countdown over an explanation of
     * something that was not happening. Written by `burn` and read by the
     * caption and by the alert the discharge posts.
     */
    this.burnFrom = null;
    /*
     * The other half of what the fuse reads: how long the release has been
     * held because the field is still full, and the ceiling it is held
     * against. `-1` means no wave has ended yet, so the first one is not
     * gated on a threshold nothing has set.
     */
    this.holdFor = 0;
    this.lastThin = -1;
    this.lastRelease = 0; // world.time of the last object let out
    this.take = 0; // raw bytes this wave has been worth, for the margin
    this.traits = []; // the rules this wave is carrying; see traits.js
    this.pairing = null; // TETHERED: the body waiting for a partner
    /*
     * A trait fixed by the player for a stretch of rungs, taken at a gate.
     * `{ id, until }` or null. It replaces the FIRST seeded trait and leaves
     * any second one alone, so choosing a lane narrows the question without
     * also making a two-trait rung a one-trait rung.
     */
    this.lane = null;
    /*
     * Two traits, offered on the rail after a gate is passed and standing
     * until one is taken or a wave is scored. Optional by construction: there
     * is no prompt and nothing is held, and leaving it lets the seed keep
     * deciding, which is the default the whole ladder already runs on.
     */
    this.laneOffer = null;
    /*
     * The two sheet actions, as charges. Not abilities: the strip is full at
     * eight and these are not things the turret does -- they are things done
     * to a wave. Same shape as a charge all the same, so `held` is what may be
     * spent now, `max` is what the tree paid for, and the cooldown is what
     * puts one back.
     */
    this.recall = { held: 0, max: 0, cd: 0 };
    this.overclock = { held: 0, max: 0, cd: 0, armed: false };
    this.lastVerdict = null; // surge | clean | stall | glitch, for the probes
    /*
     * One wave that cannot climb, set by any step back. Without it the ladder
     * ping-pongs at the ceiling: the rung below the wall is by construction
     * one you can clear, so a drop was always followed by an immediate climb
     * back into the wall that caused it.
     */
    this.grace = 0;
    /*
     * A trial: standing on a rung this run has NOT earned, for one wave, to
     * find out. `{ from, to }` while it runs. Proven, it becomes the peak;
     * failed, the run goes back to `from` and loses nothing.
     */
    this.probe = null;
    this.probeLock = 0; // seconds before another may be armed
  }

  /**
   * The anomaly standing on this rung, if any. 0 for an ordinary rung.
   *
   * `gates` is authored as rungs in order, so the index is the anomaly's own
   * number minus one -- see ANOMALIES in anomaly.js.
   */
  gateAt(tier) {
    const i = CFG.waves.tier.gates.indexOf(tier);
    return i < 0 ? 0 : i + 1;
  }

  /**
   * The anomaly holding this run where it is, if one is.
   *
   * Only ever the gate the run is STANDING on: a gate further up is not
   * holding anything yet, and one below has already been answered or stepped
   * back through.
   */
  heldBy(world) {
    const n = this.gateAt(this.tier);
    if (!n) return 0;
    return (world.reconciled || []).includes(n) ? 0 : n;
  }

  /**
   * Is the ladder held here by the FORM rather than by an anomaly?
   *
   * `CFG.waves.tier.eraGate` is the rung the first machine's ladder ends on.
   * Past it there is nothing cut for a turret built like that one, and the way
   * through is not to answer something -- it is to become something else. The
   * test is `newForm === 'done'` and not `=== 'armed'`: buying NEW FORM arms a
   * banner, and taking it is what changes the field. Half of it does not open
   * a gate.
   *
   * Takes the rung rather than reading `this.tier`, because `climbTo` walks a
   * rung at a time and has to be able to ask about each one on the way -- the
   * same reason `gateAt` does.
   *
   * @returns the rung it is held at, or 0
   */
  eraHeld(world, tier = this.tier) {
    const at = CFG.waves.tier.eraGate;
    if (!at || tier < at) return 0;
    return (world.newForm === 'done') ? 0 : at;
  }

  /**
   * Is the ladder held here by the FLOOR OF THE SIMULATION?
   *
   * `CFG.waves.tier.ceiling` is the last rung there is. Unlike the two holds
   * above it there is nothing that lifts this one -- an anomaly is answered by
   * fighting and the era by becoming, and this one is answered by nothing,
   * which is why it takes no world: there is no state it could consult.
   *
   * Takes the rung rather than reading `this.tier`, for the same reason
   * `gateAt` and `eraHeld` do: `climbTo` walks a rung at a time and has to be
   * able to ask about each one on the way.
   *
   * @returns the rung it is held at, or 0
   */
  depthHeld(tier = this.tier) {
    const at = CFG.waves.tier.ceiling;
    return (at && tier >= at) ? at : 0;
  }

  /**
   * The highest rung a climb from here may actually reach.
   *
   * Walks up one rung at a time and stops at the first gate whose anomaly is
   * still standing. Walking rather than comparing, because a surge climbs two
   * and must not step OVER a gate -- landing past one without answering it is
   * the only way the ladder could hand out a rung it did not mean to.
   */
  climbTo(world, want) {
    let at = this.tier;
    while (at < want) {
      const n = this.gateAt(at);
      if (n && !(world.reconciled || []).includes(n)) return at;
      // ...and the one gate that is not an anomaly. See `eraHeld`.
      if (this.eraHeld(world, at)) return at;
      // ...and the one that nothing opens. See `depthHeld`.
      if (this.depthHeld(at)) return at;
      at++;
    }
    return want;
  }

  /** Which authored band a tier draws from, and the one below it. */
  bandsFor(tier) {
    /*
     * Clamped at BOTH ends. Unclamped, tier 64 asked for bands 31..5 -- a
     * range matching nothing, which only worked because the empty-band
     * fallback caught it.
     *
     * `perBand` is SEVEN from build 301, so the five authored bands cover
     * rungs 1 to 35 and rungs 36-49 still draw band 4-5. That is the part of
     * the plan this build does not deliver: bands 6 and 7 want rosters of
     * their own and those are the twenty objects of phase 6. It is a far
     * shorter tail than the forty rungs `perBand: 2` left, and it is stated
     * rather than hidden.
     */
    const hi = Math.min(5, Math.max(1, Math.ceil(tier / CFG.waves.tier.perBand)));
    return [Math.max(1, hi - 1), hi];
  }

  /**
   * The multipliers this tier applies. One place, so the three plans have one
   * surface to tune and the probe has one thing to read.
   */
  scaleAt(tier) {
    const T = CFG.waves.tier;
    return {
      /*
       * All four compound off TIER 1 rather than off zero, so tier 1 is the
       * table exactly as authored and every step after it is a ratio on the
       * one before. See CFG.waves.tier.hpStep for why none of them is a
       * slope, and `popStep` for why `pop` joined them in build 300 -- it was
       * `1 + pop * tier`, which made tier 1 itself 1.1x the table.
       */
      pop: T.popStep ** (tier - 1),
      hp: T.hpStep ** (tier - 1),
      // ...and OVERCLOCK pays double for the wave it is armed on.
      bounty: T.bountyStep ** (tier - 1)
        * (this.overclock && this.overclock.armed ? T.overclockBounty : 1),
      /*
       * How much faster than rung 1 the stream runs. A MULTIPLIER and not a
       * rate, so `emit` divides its gap by it and rung 1 is exactly 1 -- the
       * opening arrives at the tempo it always did, to the bit. `pop` and
       * this one have to move together: `pop` alone is a wave four times as
       * long at the same tempo, and this one alone is the same wave over in a
       * fifth of the time.
       */
      flow: Director.flowAt(tier) / Director.flowAt(1),
    };
  }

  /**
   * What a wave at this rung and band is allowed to weigh, in threat points.
   *
   * Three factors and each answers a different question: the BAND says what
   * kind of wave this is (derived from its own roster -- see `BAND_BUDGET`),
   * `popStep` says how much deeper the run has got, and the WALK says where
   * inside its band this rung sits. The walk runs across the band's six
   * ordinary rungs and the seventh -- the one the anomaly holds -- takes the
   * closing value rather than a step past it, because its ordinary waves are
   * the band at its heaviest and that is what the aperture stands in front of.
   *
   * `population` is folded in here rather than left in `load`, so there is
   * ONE expression that says what a wave weighs. It was two multipliers in
   * two places, which is how a swell and a cap end up disagreeing.
   *
   * Static for the same reasons `flowAt` is: it depends on nothing but the
   * rung and the band, and the probes want it without a director.
   */
  static budgetAt(tier, band = 1) {
    const T = CFG.waves.tier;
    const B = T.budget;
    const base = BAND_BUDGET[band] || BAND_BUDGET[1] || 1;
    // 0 on a band's first rung, 5 on its last ordinary one, 6 on the boss's.
    const rw = (tier - 1) % T.bossEvery;
    const span = Math.max(1, T.bossEvery - 2);
    const walk = B.open + (B.close - B.open) * Math.min(rw, span) / span;
    return base * (T.popStep ** (tier - 1)) * CFG.waves.population * walk;
  }

  /**
   * Releases a second at a rung, off `CFG.waves.tier.flow`.
   *
   * The table holds ONE ANCHOR PER BOSS BAND, sitting on that band's middle
   * rung, and this interpolates between them -- so the stream accelerates
   * smoothly rather than stepping at a band edge. A cliff in the arrival rate
   * is the one thing a ladder climbed a rung at a time would meet as a wall
   * instead of a slope, and the band edges are exactly where a boss already
   * stands.
   *
   * Flat outside the anchors rather than extrapolated: rungs 1-3 sit below
   * the first anchor and rungs 47-49 above the last, and a line run past its
   * own data is a number nobody authored. Static because `Game.resize` and
   * the probes want it without a director, and because it depends on nothing
   * but the rung.
   */
  static flowAt(tier) {
    const T = CFG.waves.tier;
    const F = T.flow;
    if (!F || !F.length) return 1;
    const w = T.bossEvery;
    // 0 at the first band's middle rung, 1 at the second's, and so on.
    const x = (tier - (w + 1) / 2) / w;
    const i = Math.floor(x);
    if (i < 0) return F[0];
    if (i >= F.length - 1) return F[F.length - 1];
    return F[i] + (F[i + 1] - F[i]) * (x - i);
  }

  /**
   * Score the wave that just ended, and move the tier.
   *
   * Nothing here is new instrumentation: how long something sat on the turret,
   * whether the director ever got its field back, and how much of the wave
   * outlived it were all already known. They were simply never read.
   */
  /*
   * ================== the glitch timer ==================
   *
   * The only thing in this game that takes a rung away without being asked.
   *
   * It reads one signal -- is anything on the turret right now -- and it is a
   * clock rather than a tally, which is the whole difference between it and
   * the wave-end rout it replaced. Twelve seconds of contact totted up across
   * a wave arrived as a verdict a minute later, could not be seen coming, and
   * could not be answered once it was owed. Fourteen unbroken seconds is in
   * front of you the entire time it is running: `glitch` is drawn as a ring
   * closing round the machine with the seconds left inside it, it drives the
   * screen effect it is named after, and shooting the thing off the mount
   * winds it back at `recover`. Nothing is owed until it lands.
   *
   * Returns the move when it fires and null every other frame. The caller
   * announces it directly rather than through the `if (moved)` the two scored
   * paths use, because at tier 1 there is no rung to lose and the wave still
   * resets -- and a reset nobody is told about is a field that vanished.
   */
  burn(world, dt) {
    const G = CFG.waves.glitch;
    const wv = this.wave;
    /*
     * The opening is taught rather than scored, and it walks a LURCHER onto
     * the mount on purpose so the contact line has something to be about.
     * Nothing may be taken away during it -- and `score()` refuses a teach
     * wave at the same door, for the same reason.
     */
    if (wv && wv.teach) {
      this.held = 0;
      this.glitch = 0;
      this.burnFrom = null;
      return null;
    }
    /*
     * Two ways to fill it, and they are the same statement made twice: the
     * turret is being taken apart, or the run has stopped moving.
     *
     * Contact is the acute one and fills at the full rate. A HELD RELEASE --
     * the next wave refusing to start because the field is still full of the
     * last one -- fills at `crowd` of it, and it is the half that was
     * missing: FLINCH and DEADBOLT exist to break contact, so a run carrying
     * them sat below the contact signal indefinitely while drowning. Measured
     * over seven minutes on one tier with one gun, the two upgrades took the
     * fuse from six discharges to one and pinned the ladder where it was.
     *
     * A frame can do both, and only the larger is taken rather than the sum:
     * being gripped WHILE drowning is one emergency, and adding the two would
     * make the fuse run at 1.5x for the state it is most about.
     */
    const gripped = world.attackers.size > 0;
    if (gripped) {
      this.held += dt;
    } else {
      // Armed only after `arm` seconds, so a body that clips the mount on its
      // way past never lights it. `held` is unbroken time.
      this.held = 0;
    }
    const byContact = gripped && this.held >= G.arm ? 1 : 0;
    const byCrowd = this.holdFor > 0 ? G.crowd : 0;
    const rate = Math.max(byContact, byCrowd);
    /*
     * ...and the same comparison names the cause, so the interface can say
     * which of the two it is looking at. Contact wins a frame that is both,
     * because it is the larger term and the acute one -- being taken apart is
     * what to answer first. Null while the fuse drains, so a caption keyed on
     * this speaks only while it is actually filling.
     */
    this.burnFrom = rate === 0 ? null : (byContact >= byCrowd ? 'contact' : 'crowd');
    if (rate > 0) this.glitch = Math.min(1, this.glitch + (dt * rate) / G.fuse);
    else this.glitch = Math.max(0, this.glitch - (dt * G.recover) / G.fuse);
    return this.glitch >= 1 ? this.glitchOut(world) : null;
  }

  /**
   * The fuse ran out: fizzle the field, abandon the wave, drop a rung.
   *
   * Deliberately NOT a call into `score()` with a forced verdict, the way
   * RECALL goes. A forced verdict still runs the whole scoring path -- the
   * margin, the climb table, the probe resolution -- and this wave is not
   * being scored at all, it is being withdrawn. So everything `score()` owes
   * the next wave is paid here by hand, and the list is exact: `overclock.
   * armed` and `laneOffer` are cleared in score() and NOWHERE else, so a path
   * that skips it silently carries a spent OVERCLOCK charge and a lapsed lane
   * offer into the wave after.
   */
  /**
   * Everything a wave owes the next one, paid by hand.
   *
   * Extracted from `glitchOut` because it now has a second caller: a change of
   * ERA takes the field away without scoring it, exactly as a blown fuse does,
   * and the two must not keep separate copies of this list. `score()` clears
   * `overclock.armed` and `laneOffer` and NOWHERE else does, so a path that
   * skips either silently carries a spent charge and a lapsed lane offer into
   * the wave after -- and `grace`, which the callers set, has one writer in the
   * whole codebase.
   *
   * `resting` first and before anything else, because `update()` falls straight
   * into the end-of-wave block on the next frame without it and scores the same
   * wave twice.
   *
   * @param ran whether a wave was actually running. A fuse that blows in the
   *   rest between two waves has answered nothing, and charging the player an
   *   OVERCLOCK charge for a wave that never started is not free.
   */
  abandonWave(ran) {
    this.jobs.length = 0;
    this.resting = true;
    this.timer = rand(CFG.waves.rest[0], CFG.waves.rest[1]);
    this.contact = 0;
    this.hitPatience = false;
    this.take = 0;
    this.made = 0;
    this.slain = 0;
    // NOT `done`: a wave that was taken away was not finished. It keeps the
    // number it had, which is the point of showing it.
    this.done = false;
    if (ran) this.overclock.armed = false;
    this.laneOffer = null;
    this.held = 0;
    this.glitch = 0;
    this.burnFrom = null;
    // ...and the hold, because the field it was held against has just gone.
    this.holdFor = 0;
    this.lastThin = -1;
  }

  glitchOut(world) {
    const T = CFG.waves.tier;
    const G = CFG.waves.glitch;
    const from = this.tier;
    /*
     * Was a wave actually running? `score()` clears `overclock.armed` because
     * the wave it was armed on has been answered -- but a fuse that blows in
     * the rest BETWEEN two waves has answered nothing, and clearing it there
     * charges the player a whole charge for a wave that never started. Read
     * before `resting` is written below, because this method sets it.
     */
    const ran = !this.resting;
    /*
     * ...and which signal blew it, read HERE because `abandonWave` below
     * clears it. The alert this reason ends up in is the only account the
     * player gets of what just happened, and "THE FEED GAVE OUT" was printed
     * for both causes.
     */
    const cause = this.burnFrom;

    /*
     * The field dissolves. Marked rather than destroyed: `destroy()` is what
     * banks a body's energy, sheds its debris and counts it, and none of that
     * is owed for a wave that is being taken back. `spent` keeps the assist
     * off them and lets rounds through, `dissolved` keeps the sweep from
     * paying or counting, and `Enemy.destroy` refuses a fizzling body outright
     * so a mine or a blast landing on one during its second cannot cash it in.
     *
     * Energy already on the floor is left alone -- that was earned before the
     * fuse blew and is not the simulation's to take back -- and so is DRIFT,
     * the ambient grey trickle, which runs all run independently of the waves
     * and was never part of this one.
     *
     * DRIFT by name and not by `harmless`, which was the first version and let
     * a SCION's live SEEDs through: they are harmless -- they cannot touch the
     * turret and nothing is lost by ignoring them -- and they are absolutely
     * part of the wave, so a withdrawal that spared them handed the
     * replacement wave a set of grafts it never asked for.
     */
    let fizzled = 0;
    for (const e of world.enemies) {
      if (e.dead || e.isDrop || e.type.id === 'drift' || e.fizzle > 0) continue;
      e.fizzle = G.fizzle;
      e.spent = true;
      e.dissolved = true;
      e.attacking = false;
      world.attackers.delete(e);
      fizzled++;
    }

    this.abandonWave(ran);

    let moved = 0;
    if (this.probe) {
      /*
       * A trial that ends in a glitch has been answered, and the answer is no.
       * Its own fall back to the rung it was armed from IS the step back --
       * dropping a further rung on top of it would charge the run twice for
       * one wave, and the trial was a question the player asked.
       */
      const back = this.probe.from;
      this.probe = null;
      this.probeLock = T.probeLock;
      this.tier = back;
      moved = this.tier - from;
    } else if (this.tier > 1) {
      this.tier--;
      moved = -1;
      // A step back re-arms the climb even under HOLD. The pin holds the
      // climb, not the relief.
      this.hold = false;
    }
    // ...and the next wave cannot climb straight back into whatever did it.
    // `grace` has no other writer, so a path that forgets this line turns it
    // into a flag that can never be non-zero.
    this.grace = 1;
    this.lastVerdict = 'glitch';
    return {
      verdict: 'glitch', moved, tier: this.tier, from, fizzled, cause,
      // Deliberately not the 'THE FIELD NEVER THINNED' `score()` posts on a
      // patience timeout: that one is a wave ending untidily and costs
      // nothing, this one is a rung.
      reason: cause === 'crowd' ? 'THE FIELD OVERRAN' : 'THE FEED GAVE OUT',
      margin: 0,
    };
  }

  /**
   * How much of the running wave is down, from 0 to 1. The one place that
   * decides it: the chip beside the count, the rail's third meter, AUDIT's
   * CLEARED, RECALL's clean threshold and the alert's reason all read this.
   *
   * IT COUNTS THE WAVE, NOT THE FIELD. Those are not the same set, and every
   * version of this before build 215 measured the second while claiming the
   * first:
   *
   *   `(asked - alive) / asked`, in four copies, was not a measure of
   *   clearing at all -- it was a measure of ARRIVAL. `asked` is the whole
   *   wave, fixed at load(), while the bodies come out one at a time over the
   *   length of it, so a wave nobody had touched opened near 100% and fell as
   *   it arrived. Measured over 38 waves: opening reading median 75%, up to
   *   100%, and it stepped DOWN on 85 frames, worst single drop 67 points.
   *
   *   `slain / (slain + hostileCount + queued)` fixed the direction and
   *   still counted the field. A wave ENDS WHEN THE FIELD THINS -- `thinAt`
   *   allows a quarter of it to be left standing -- so the next wave began
   *   with the last one's leftovers on the screen and in its denominator. The
   *   figure could not reach 100% and turned over while there was plainly
   *   still work in front of you, which is exactly what it was reported as
   *   doing: "many objects still on field and it resets".
   *
   * So every hostile is stamped with the wave that produced it (tagBody),
   * children take the stamp off the body they came out of, and this is a
   * fraction of that wave's own bodies: how many it has actually put on the
   * field, plus what it still has queued, against how many of them are down.
   * Leftovers belong to the wave that released them and are counted there
   * even when they die two waves later -- which is why the figure is not
   * blanked between waves any more. It keeps climbing while the field is
   * cleaned up, and reaches 100% when the wave is genuinely finished.
   */
  /** How many of the running wave's own bodies are still up. */
  standing(world) {
    let n = 0;
    for (const e of world.enemies) {
      if (e.dead || e.harmless || e.fizzle) continue;
      if (e.wave === this.serial) n++;
    }
    return n;
  }

  cleared(world) {
    /*
     * A wave that has been SCORED is a wave that is finished, and reads as
     * finished: whatever it left standing was inherited by the field rather
     * than left uncleared, and the next wave will count it as its own if it
     * is still there. Without this the bar turned over at a median 73% --
     * which is the wave-end rule showing through, not the player's work --
     * and "it reaches 75 and disappears" was half this and half the blanking.
     *
     * Deliberately NOT set by glitchOut: a wave the fuse took away was not
     * finished, and it keeps its real number so the failure is legible.
     */
    if (this.done) return 1;
    let queued = 0;
    // A TOW is a job and two bodies -- the head plus the MASS it drags, both
    // hostile, both counted by the kill tally. Counting the job would make
    // the denominator jump the moment one is released.
    /*
     * A HARMLESS job is not in the denominator. `tagBody` refuses to stamp
     * one, `standing` skips it and `counts` is false on it, so a released
     * EMBER never reaches `made` or `slain` -- counting the queued ones would
     * put bodies in the total that can never come out of it, and the bar
     * would read short for as long as any were still waiting.
     */
    for (const j of this.jobs) {
      if (j.type.harmless) continue;
      queued += j.n * (j.type.tows ? 2 : 1);
    }
    const total = this.made + queued;
    return total > 0 ? Math.min(1, this.slain / total) : 0;
  }

  score(world, forced = null) {
    const T = CFG.waves.tier;
    const wave = this.wave;
    /*
     * The opening teaches; it is not scored and cannot move the tier. Nor is
     * the drift-only bonus wave (`{ of: [], drift: 22 }`), which asks for no
     * hostiles at all: with `asked === 0` there is nothing that could fail it,
     * so it was a free rung every cycle -- observed climbing 15 to 16 for
     * shooting nothing.
     */
    if (!wave || wave.teach || this.asked === 0) return null;
    /*
     * The three numbers the table reads. `t` is how long the field took to
     * thin after the last object was let out -- infinite if patience ended the
     * wave, which is that wave saying it was never coming back. Measuring from
     * the LAST RELEASE rather than from the top of the wave is the whole point:
     * a wave is not slow because it was big, it is slow because it would not
     * die, and only the second of those is the player's business.
     */
    const t = this.hitPatience ? Infinity : Math.max(0, (world.time || 0) - this.lastRelease);
    const k = this.contact;
    const c = this.cleared(world);

    // OVERCLOCK widens the surge window: a wave arriving twice as fast is over
    // sooner, and three seconds from the last release would be a surge handed
    // out for the arming rather than for the answering.
    const surgeWithin = this.overclock.armed ? T.overclockSurge : T.surgeWithin;
    /*
     * Three verdicts, and none of them goes down. A wave either earns a climb
     * or it holds; the only thing in the game that takes a rung away is the
     * glitch timer, which is a live clock and not a verdict -- see the note on
     * the table in config.js and `glitchOut` below. `k` and `c` are both still
     * measured, because the surge and clean windows read `k` and the alert and
     * AUDIT both read `c`, but neither can subtract any more.
     */
    let verdict;
    if (t <= surgeWithin && k < T.surgeContact) verdict = 'surge';
    else if (t <= T.cleanWithin && k < T.failContact) verdict = 'clean';
    else verdict = 'stall';
    /*
     * RECALL names its own verdict, and only its verdict.
     *
     * It is a bail-out: a wave three quarters cleared counts as the clean it
     * was going to be, and anything less is a stall rather than the rout the
     * table would have given it. That is what the charge buys, and it is why
     * it is a charge. Everything a verdict then MEANS -- the move, the grace,
     * the peak, the margin, the streak -- stays here, so there is still one
     * place that decides what a wave was worth.
     */
    if (forced) verdict = forced;
    this.lastVerdict = verdict;
    // Read by cleared(): the wave is over, so the figure completes.
    this.done = true;

    // Why it went the way it did, in the alert's own register. The dominant
    // cause, not a list: a step you did not ask for needs one reason.
    /*
     * Nothing here explains a drop any more -- the glitch timer names its own,
     * in `glitchOut` -- so the contact no longer has to be read first to keep
     * "THE FIELD NEVER THINNED" off the front of a step back. It is still read
     * ahead of the two shapes below it, because a wave that held you for six
     * seconds and then came back was about the turret whatever else was true.
     */
    const reason = this.hitPatience ? 'THE FIELD NEVER THINNED'
      : k >= T.failContact ? `${Math.round(k)} S ON THE TURRET`
        : c < T.routBelow ? 'MOST OF IT WAS STILL STANDING'
          : verdict === 'surge' ? 'CLEARED BEFORE THE LAST ONE LANDED'
            : verdict === 'clean' ? 'THE FIELD CAME BACK'
              : 'IT TOOK TOO LONG';

    const from = this.tier;
    this.overclock.armed = false;   // spent by the wave it was armed on
    // An offer not taken by the time a wave has been answered has lapsed. It
    // is a choice at the gate, not a decision hanging over the rest of the run.
    this.laneOffer = null;
    /*
     * The margin: a surge pays half again on what the wave was worth, in one
     * lump at the turret. Banked through bank() so the intake tax and the
     * dividend apply to it exactly once, like anything else the field pays.
     */
    let margin = 0;
    if (verdict === 'surge' && this.take > 0) {
      const before = world.bytes;
      bank(world, this.take * (T.margin - 1), world.shooter.x, world.shooter.y);
      margin = Math.round(world.bytes - before);
    }
    this.contact = 0;
    this.hitPatience = false;
    this.take = 0;

    // A trial answers only for itself: it is not a rung of the ladder until it
    // is proven, so it neither climbs nor drops the run that armed it.
    if (this.probe) {
      const won = verdict === 'surge' || verdict === 'clean';
      const { from: back, to } = this.probe;
      this.probe = null;
      this.probeLock = T.probeLock;
      this.tier = won ? to : back;
      if (won) this.peak = Math.max(this.peak, to);
      this.grace = 0;
      return { verdict, moved: this.tier - from, tier: this.tier, from, reason, margin,
        trial: won ? 'proven' : 'failed' };
    }

    let moved = 0;
    if (verdict === 'surge' || verdict === 'clean') {
      const step = verdict === 'surge' ? 2 : 1;
      // HOLD pins the climb, and grace defers it by one wave. Both are spent
      // whether or not there was anything to hold back.
      if (this.grace > 0) this.grace--;
      else if (!this.hold) {
        // ...and a gate stops it dead, however good the wave was.
        const to = this.climbTo(world, this.tier + step);
        moved = to - this.tier;
        this.tier = to;
      }
    }
    this.peak = Math.max(this.peak, this.tier);
    return { verdict, moved, tier: this.tier, from, reason, margin };
  }

  /**
   * Stand the run on a rung it has not earned, for one wave.
   *
   * `setTier()` unlocks as it goes and `reach()` will not go above `peak`, so
   * neither can do this: the whole point is a rung that is not yet yours. If
   * the wave comes back surge or clean the rung becomes the peak; anything
   * else and the run is put back where it was, having lost nothing but the
   * wave. A lockout after either, so it is a question and not a strategy.
   */
  trial(n, world) {
    if (this.probe || this.probeLock > 0) return null;
    const to = Math.max(1, Math.round(n));
    if (to <= this.peak) return null;
    // A trial is still a climb: it may not be used to step over a gate.
    if (world && this.climbTo(world, to) < to) return null;
    this.probe = { from: this.tier, to };
    this.tier = to;
    return this.probe;
  }

  /**
   * Put the ladder somewhere, and count it as reached.
   *
   * The machinery's setter: the restore, the probes and the debug panel. It
   * does not gate, because every one of those already knows where it wants
   * the run to be -- and it raises `peak`, because being put on a rung is
   * having stood on it.
   *
   * It DOES clamp to `ceiling`, which is the one thing above that is not a
   * gate: a rung past the last one is not a rung this run has not earned yet,
   * it is a rung that does not exist, and there is nothing for a wave to draw
   * from there. This is the second door -- build 272 wrote the era ceiling
   * into `climbTo` alone and `endBoss` stepped over it with this setter on the
   * very next line, so a ceiling honoured in one place is a ceiling with a
   * door standing open.
   */
  setTier(n) {
    const cap = CFG.waves.tier.ceiling || Infinity;
    this.tier = Math.min(cap, Math.max(1, Math.round(n)));
    this.peak = Math.max(this.peak, this.tier);
    return this.tier;
  }

  /**
   * ...and the player's, from the rail.
   *
   * A rung has to have been climbed before it can be gone back to, so this
   * clamps to `peak` and never raises it. The only thing that unlocks a tier
   * is the ladder climbing it in score() -- which is the whole point of a
   * ladder you can step back down: going back is free, going forward is
   * earned, and the two are different verbs.
   */
  reach(n) {
    /*
     * Stepping away from a trial withdraws it. Otherwise the probe outlives
     * the rung it was asking about and the next scored wave answers a question
     * nobody is standing on any more -- putting the run somewhere it did not
     * ask to be, which is the one thing the rail must never do.
     */
    this.probe = null;
    this.tier = Math.min(Math.max(1, Math.round(n)), Math.max(1, this.peak));
    return this.tier;
  }

  /**
   * Every type in a wave has to have opened before the wave is eligible.
   *
   * On lifetime energy, not on kills. A kill count says how much you have
   * shot; what gates a new object ought to be how far the run has actually
   * got, and the tree, the tiers and the unlocks then all run off one clock
   * instead of three. The thresholds are grouped by band -- see the note on
   * `opens` in config.js -- so a band's types are open before the band is
   * drawn from, rather than in the order they happened to be authored.
   */
  eligible(world, wave) {
    return wave.of.every(([id]) => (world.earned || 0) >= (TYPE_BY_ID[id].opens || 0));
  }

  /**
   * Build the next rotation. The first one leads with the opening waves in
   * their authored order; every one after that drops them for good and simply
   * shuffles whatever has unlocked.
   */
  shuffle(world) {
    const rest = [];
    const [lo, hi] = this.bandsFor(this.tier);
    const inBand = [];
    WAVES.forEach((wv, i) => {
      if (wv.teach || !this.eligible(world, wv)) return;
      const b = wv.band || 1;
      if (b >= lo && b <= hi) inBand.push(i);
      rest.push(i);
    });
    /*
     * The tier's own bands, or everything eligible if that comes out empty.
     *
     * It can: a player climbing faster than the economy unlocks types reaches
     * a band whose waves are all still locked, and a director with nothing to
     * play stalls the run dead. Falling back down-band is not a compromise --
     * it is what the ladder should do when it has outrun its own material.
     */
    if (inBand.length) { rest.length = 0; rest.push(...inBand); }
    // Fisher-Yates. Order past the opening is meant to be arbitrary.
    for (let i = rest.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    /*
     * The opening plays once, at the bottom, and never again. It used to lead
     * every cycle-0 rotation whatever the tier, so a run started at 40 was
     * taught DRIFT by "needle x2" -- a 29-second wave, authored for the first
     * minute of a run, that could not move the ladder either way.
     */
    const open = this.cycle === 0 && this.tier === 1
      ? WAVES.map((wv, i) => (wv.teach ? i : -1)).filter((i) => i >= 0)
      : [];
    this.order = [...open, ...rest];
    this.at = -1;
    this.cycle++;
  }

  /**
   * Expand a wave into the list of releases it will make.
   *
   * Three or more of one type in a regular wave arrive together in formation,
   * because six MOTEs in a wedge is a wave and six MOTEs filing in one at a
   * time is a queue. Tutorial waves never form up — they always file in, one
   * object at a time, which is the whole of what makes the opening readable.
   */
  load(world, wave) {
    const W = CFG.waves;
    // How much bigger this wave is than it was authored. Tutorial waves are
    // authored at exactly the size they should be and never swell.
    /*
     * Size comes off the TIER now, not the kill count. It was
     * `kills / swellKills` ramping one global knob from 1 to 2.4 across a
     * run -- which meant difficulty was a function of how long you had
     * played rather than of where you had chosen to stand, and could only
     * ever go one way.
     */
    /*
     * ---- the count comes off a BUDGET now (build 301) ----------------
     *
     * It was `pop * population` applied to each authored count, so the
     * numbers in `WAVES` were bodies and the tier was a volume knob on top.
     * They are PROPORTIONS from here on: a wave is scaled until its total
     * threat meets `Director.budgetAt`, so a wave of three BULWARKs and one
     * of twelve MOTEs weigh the same at the same rung, and LENGTH FOLLOWS
     * STRENGTH by construction rather than by an authored body count.
     *
     * Two exemptions, each of which would otherwise be a divide by zero or a
     * tutorial that speeds up:
     *
     *   - a TEACH wave is authored at exactly the size it should be and is
     *     scaled by nothing, which is the same exemption it already holds
     *     against the release arc and the flow staircase.
     *   - a wave with no HOSTILES weighs zero, so there is nothing to scale
     *     and no denominator to scale by. The bonus wave is 22 drifters and
     *     `of: []`; drift weighs zero by design (see `threatOf`) and its
     *     count is `wave.drift`, which this never touched.
     */
    const authored = wave.teach ? 0 : threatOfWave(wave);
    const swell = authored > 0
      ? Director.budgetAt(this.tier, wave.band || 1) / authored
      : 1;
    /*
     * What this wave is carrying, decided before a single body is made so
     * that SWARM can double the count on the way past. Seeded rather than
     * rolled: see traits.js.
     */
    this.traits = traitsFor(world, wave, this.tier, this.cycle, this.at);
    this.pairing = null;
    if (this.lane && this.traits.length) {
      if (this.lane.until > this.tier) {
        const laned = this.traits.find((t) => t.id === this.lane.id)
          || TRAIT_BY_ID[this.lane.id];
        if (laned) this.traits = [laned, ...this.traits.filter((t) => t !== laned)]
          .slice(0, this.traits.length);
      } else this.lane = null;   // the stretch is spent
    }
    const swarm = hasTrait(this.traits, 'swarm');
    const jobs = [];
    let asked = 0;
    for (const [id, base] of wave.of) {
      const type = TYPE_BY_ID[id];
      if (!type) continue;
      // SWARM: twice as many, half the health. The halving is stamped on the
      // body in spawnOne, where the tier's own multiplier is applied.
      /*
       * ---- MORTAR does not swell, and is not asked for (build 307) ------
       *
       * A harmless entry weighs nothing in the budget (`threatOf`), so it
       * cannot take the budget's multiplier either: four EMBERs authored in a
       * band-1 wave would be forty at a deep rung -- scenery scaled by a
       * difficulty it does not pay into. Drift has always worked this way,
       * `wave.drift` being a flat count this never touched; this states the
       * same rule once for every harmless type.
       *
       * Nor does it count toward `asked`, which is what the wave VERDICT is
       * measured against and the guard that keeps the drift-only bonus wave
       * from being scored. A body `standing` skips and `tagBody` refuses to
       * stamp is not part of the verdict.
       */
      /*
       * Tested on what it PAYS rather than on the `harmless` flag, because
       * paying nothing is the actual reason it may not take the multiplier.
       * The two cannot diverge: check-build.mjs fails the build for a
       * hostile that weighs nothing and for a harmless type that weighs
       * something, in both directions.
       */
      const mortar = threatOf(type) === 0;
      const n = Math.max(1, Math.round(base * (mortar ? 1 : swell))) * (swarm ? 2 : 1);
      if (!mortar) asked += n;
      /*
       * ---- `solo` IS READ HERE, and this is the only place it can be ------
       *
       * SCION has carried `solo: true` since it was written, under a comment
       * saying "never part of a formation... a formation releases three to
       * six of one type in one go -- which is how five of them ended up on
       * the screen at once the first time this was measured". NOTHING read
       * it: a field with no reader is a promise the field is making and the
       * code is not keeping, and this one named a measured bug. Build 301
       * then made it reachable again from a single authored entry, because
       * the budget SWELLS the count -- `['scion', 2]` at a deep rung is a
       * dozen, and anything from three up was grouped.
       *
       * The guard is in `load` and NOT in `emit`'s formation branch, which is
       * where it looks like it belongs. That branch `shift`s the job and
       * returns; skipping the formation there falls through to a single
       * release and DROPS the other n-1 bodies, silently, which is a worse
       * bug than the one being fixed. `load` is where the grouping decision
       * is taken, so refusing to group keeps the count: n singles instead.
       * The other half of the rule is in `spawnFormation`, which ROLLS its
       * own type from a list -- the same line that already drops TOWs.
       */
      if (!wave.teach && !type.solo && n >= W.formAt) jobs.push({ type, n });
      else for (let i = 0; i < n; i++) jobs.push({ type, n: 1 });
    }
    this.asked = asked;
    // Interleaved rather than type by type, so a mixed wave arrives mixed.
    if (!wave.teach) {
      for (let i = jobs.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
      }
    }
    this.jobs = jobs;
    /*
     * How many releases this wave is, so `emit` knows how far through itself
     * it is. Recorded rather than derived, because `jobs` is shifted down to
     * nothing as the wave goes out and there would be no denominator left.
     */
    this.jobsAt = jobs.length;
    /*
     * ---- every wave starts clean ----
     *
     * score() returns early for a teach wave, and used to do so BEFORE
     * clearing these -- and load() never cleared them at all. So an unscored
     * wave's contact was charged to whichever wave was scored next: the
     * opening's seconds on the turret arrived as a failure on the first real
     * wave. score() may still clear them; this is the guarantee.
     */
    this.contact = 0;
    this.hitPatience = false;
    this.wait = 0;
    this.lastRelease = world.time || 0;
    this.take = 0;
    // A new wave, and a new set of bodies to count. `serial` is what stamps
    // them, in tagBody; nothing else may write it.
    this.serial++;
    this.made = 0;
    this.slain = 0;
    this.done = false;
    // A wave may ask for grey drift alongside it. It is not hostile, costs
    // nothing from the allotment, and is the whole of both the opening and the
    // bonus wave. Stacked upward rather than dropped in one row, so twenty-two
    // of them arrive as a shower over a few seconds instead of a wall.
    const want = wave.drift || 0;
    for (let i = 0; i < want; i++) {
      if (driftCount(world) >= CFG.waves.driftCap) break;
      spawnDrift(world, want > 4 ? { y: ENTRY_Y + rand(10, 40) - i * 30 } : {});
    }
  }

  /*
   * Waves that have unlocked since this rotation was built, spliced into what
   * is left of it.
   *
   * The rotation used to be a snapshot: shuffle() read eligibility once, at
   * the top of a cycle, and nothing rejoined until the next one. A run is five
   * cycles and the last is built at around 317 kills, so GLUT (330) and TOW
   * (380) unlocked into a rotation that had already been decided and then ran
   * out of allotment before another was built. Measured over 30 driven runs
   * before this: both played 0% of the time. They were authored, reachable in
   * the debug screen, in the codex -- and unreachable in an actual run.
   *
   * Spliced ahead of the playhead at a random point rather than appended, so
   * a late unlock is not always the very last thing you see.
   */
  admit(world) {
    /*
     * ---- and it honours the band window ----
     *
     * It did not, and that quietly undid bandsFor() entirely. shuffle() builds
     * a rotation from the tier's own two bands; admit() then spliced in EVERY
     * eligible wave that was not already in it -- which is precisely the
     * out-of-band ones -- and it runs from begin(), so the window survived
     * exactly one wave. Logged at tier 40: after a shuffle the order read
     * `T T T T T T T T 4 5 4 5 5 4 4 4 4 5 5 4`, and one wave later
     * `T T T 2 T T T 1 2 T 3 T 4 3 5 2 4 5 5 3`. Tier 40 played five motes and
     * three needles as often as a tow and a bulwark.
     *
     * Nothing is admitted during the opening either: a teach wave is a script,
     * and splicing the rotation into the middle of it makes it not one.
     */
    if (this.wave && this.wave.teach) return 0;
    const already = new Set(this.order);
    const [lo, hi] = this.bandsFor(this.tier);
    /*
     * In-band only. The out-of-band list went with the starvation branch
     * below -- collecting it and never reading it is the shape `mineScale`
     * was in for two builds and `bundle.mjs` will ship without complaint.
     */
    const inBand = [];
    WAVES.forEach((wv, i) => {
      if (wv.teach || already.has(i) || !this.eligible(world, wv)) return;
      const b = wv.band || 1;
      if (b >= lo && b <= hi) inBand.push(i);
    });
    /*
     * Out-of-band waves are NEVER admitted -- they are what the next
     * shuffle() is for, and that is now true without an exception.
     *
     * There used to be one, for starvation: `inBand.length || this.at + 1 <
     * this.order.length ? inBand : rest`, under a comment saying "begin()
     * calls shuffle() when the order is spent, so this should be
     * unreachable". IT WAS REACHABLE, and the reason is the call order in
     * `begin`: `admit` runs BEFORE the spent check, so on the very frame the
     * order runs out with every in-band wave already in it, the fallback
     * fired, spliced the out-of-band ones in, and the spent check then saw a
     * non-empty tail and never reshuffled at all.
     *
     * Latent until build 301 made a band one boss slot wide. At `perBand: 2`
     * the window at rung 20 was bands 4-5, sixteen waves, and running the
     * pool dry on the same frame the order ended was rare; at `perBand: 7` it
     * is bands 2-3, ten waves, and the case measured 37 of 82 waves still to
     * play out of band. Exactly the shape the comment above describes and the
     * fix build 199 was for, arriving a second time through a different door.
     *
     * Deleted rather than guarded, because `shuffle` ALREADY carries this
     * fallback and carries it properly: if the window has nothing eligible it
     * plays everything eligible instead. Two fallbacks for one rule is how
     * they disagree -- and if nothing at all is eligible, `begin` leaves the
     * order empty and sets a one-second timer, which is the real floor.
     */
    const take = inBand;
    let added = 0;
    for (const i of take) {
      const room = this.order.length - this.at;
      const at = this.at + 1 + ((Math.random() * Math.max(1, room)) | 0);
      this.order.splice(at, 0, i);
      added++;
    }
    return added;
  }

  /*
   * Un-played entries that the tier has since climbed away from.
   *
   * A rotation is built for the band the tier was on when shuffle() ran, and a
   * cycle is twenty-odd waves long -- so a run climbing through it is still
   * playing band 1 material several rungs after leaving band 1. admit() is
   * about what should come IN; this is about what should no longer be waiting.
   *
   * Never empties the cycle: if everything ahead is out of band the rotation
   * is left alone and the next shuffle() rebuilds it. Entries at or before the
   * playhead are history and are not touched, so `at` never moves.
   */
  prune() {
    if (this.at + 1 >= this.order.length) return 0;
    if (this.wave && this.wave.teach) return 0;
    const [lo, hi] = this.bandsFor(this.tier);
    const head = this.order.slice(0, this.at + 1);
    const tail = this.order.slice(this.at + 1);
    const keep = tail.filter((i) => {
      const b = WAVES[i].band || 1;
      return b >= lo && b <= hi;
    });
    if (!keep.length || keep.length === tail.length) return 0;
    this.order = [...head, ...keep];
    return tail.length - keep.length;
  }

  /**
   * Offer a lane: two traits, drawn from the same seed as everything else so
   * that the pair a given gate offers is a property of the run rather than of
   * when it happened to be reached.
   */
  offerLane(world) {
    const a = traitAt(world.runSeed | 0, this.cycle, this.tier, 11);
    let b = a;
    for (let slot = 12; b === a && slot < 24; slot++) {
      b = traitAt(world.runSeed | 0, this.cycle, this.tier, slot);
    }
    this.laneOffer = [a, b];
    return this.laneOffer;
  }

  /** Take one of them, fixing it for `laneFor` rungs. */
  takeLane(id) {
    if (!this.laneOffer || !this.laneOffer.some((t) => t.id === id)) return null;
    this.lane = { id, until: this.tier + CFG.waves.tier.laneFor };
    this.laneOffer = null;
    return this.lane;
  }

  /**
   * RECALL: end the running wave now, and score it on what is cleared.
   *
   * Not a free clean -- it scores what actually happened. A wave three
   * quarters cleared is one you were going to clear; below that it is a
   * stall, which is the honest verdict for a wave walked away from, and a
   * stall still counts toward the streak that steps the ladder back.
   *
   * Posed so that score() reads the verdict rather than scored separately:
   * one place decides what a wave was worth, and a second copy of that table
   * is a second thing to keep in step.
   */
  recallWave(world) {
    if (!this.recall.held || this.resting || !this.wave || this.wave.teach) return null;
    const T = CFG.waves.tier;
    this.recall.held--;
    this.recall.cd = T.recallCd;
    /*
     * What was actually killed, not what had merely not arrived yet. Under
     * the old reading a wave RECALLED in its first seconds scored near 100%
     * cleared -- the bodies still queued counted as cleared -- so the charge
     * bought a guaranteed clean for walking away from a wave before it
     * started. It buys what it says it buys now: three quarters of the wave
     * down.
     */
    const cleared = this.cleared(world);
    const clean = cleared >= T.recallClean;
    this.jobs.length = 0;
    this.hitPatience = false;
    this.resting = true;
    this.timer = rand(CFG.waves.rest[0], CFG.waves.rest[1]);
    const moved = this.score(world, clean ? 'clean' : 'stall');
    if (moved && world.onTier) world.onTier(moved);
    return { cleared, verdict: moved ? moved.verdict : null, moved: moved ? moved.moved : 0 };
  }

  /** OVERCLOCK: the next wave arrives twice as fast and pays double. */
  armOverclock() {
    if (!this.overclock.held || this.overclock.armed) return false;
    this.overclock.held--;
    this.overclock.cd = CFG.waves.tier.overclockCd;
    this.overclock.armed = true;
    return true;
  }

  /** The wave currently running, or null before the first one starts. */
  get wave() {
    const i = this.order[this.at];
    return i === undefined ? null : WAVES[i];
  }

  /**
   * Stand the runner back up from a save. The wave is *restarted*, not
   * resumed: you come back to the wave you left on, from the top of it. Half
   * a wave is not a place anyone remembers being.
   */
  restore(world, d) {
    if (!d) return;
    /*
     * The rotation and the ladder are restored SEPARATELY, and running them
     * off one guard cost every early save its tier.
     *
     * `order` is empty for the whole of the opening grace -- it is not built
     * until the first begin() -- so a run saved in its first few seconds, or
     * by the page being hidden in them, writes `order: []`. That is a
     * perfectly good file. The old guard read it as a malformed one and
     * returned, which silently threw away `tier`, `peak` and `hold` with
     * it: a player who had climbed to tier 12 and quit early in a wave
     * came back to tier 1 and nothing said so.
     *
     * So an absent rotation now means only that there is no rotation to come
     * back to -- the run is left with the fresh one, opening grace and
     * tutorial waves and all, which is what it had -- and the ladder below is
     * restored either way.
     */
    if (Array.isArray(d.order) && d.order.length) {
      this.order = d.order.filter((i) => Number.isInteger(i) && i >= 0 && i < WAVES.length);
      // One *behind* the saved wave, because the first begin() steps forward
      // and has to land back on it. Setting `at` to the saved index directly
      // is how "resume on the wave I left" quietly became "resume on the one
      // after".
      const was = Math.min(d.at ?? 0, this.order.length - 1);
      this.at = Math.max(-1, was - 1);
      this.cycle = d.cycle || 1;
    }
    /*
     * A save written before the ladder existed has no tier at all, and
     * defaulting it to 1 would drop a long run back to the opening. Seeded
     * from the kill count instead, on the same shape the old swell used --
     * so a returning run resumes at about the difficulty it left.
     */
    /*
     * ---- the ceiling comes back before the rung, not after it ----
     *
     * It used to be `peak = max(tier, d.peak)`, and a save taken DURING A TRIAL
     * is standing three rungs above its ceiling by construction -- so reloading
     * one banked the unproven rung as earned, and then dropped the trial,
     * because the probe is only restored when `to` is above the peak the
     * restore had just inflated. The run came back owning a rung it had not
     * proved, with nothing left to prove it. Measured on build 207: saved
     * peak 19 with a trial to 22, restored peak 22 and no probe.
     *
     * So the ceiling is read on its own first. A trial then stands the run on
     * its rung without raising anything; only a run that is NOT mid-trial
     * floors the ceiling at where it is standing, which is the original rule
     * for saves written before build 188 that carry no peak at all.
     */
    /*
     * ...and clamped to `ceiling`, which is the THIRD door. `climbTo` refuses
     * and `setTier` clamps, and the restore writes both fields by hand and
     * goes through neither -- so a file written by a build with a deeper
     * ladder, or none, would put a run above a rung that does not exist and
     * nothing would ever bring it back down. The ceiling is read before the
     * probe for the same reason the original does: a trial stands the run on
     * its rung without raising anything.
     */
    const cap = CFG.waves.tier.ceiling || Infinity;
    this.peak = Math.min(cap, Math.max(1, Math.round(d.peak || 0)));
    const pr = d.probe;
    /*
     * ...and a stored trial ABOVE the ceiling is not a trial, it is a rung
     * that does not exist -- so it is refused rather than clamped, because
     * clamping it would leave `probe.to` and `tier` disagreeing about the
     * question being asked and `settle` would answer the wrong one.
     */
    this.probe = pr && Number.isFinite(pr.from) && Number.isFinite(pr.to)
      && pr.to > this.peak && pr.to <= cap
      ? { from: Math.max(1, Math.round(pr.from)), to: Math.round(pr.to) }
      : null;
    if (this.probe) {
      this.tier = this.probe.to;
    } else {
      this.tier = Math.min(cap, Math.max(1, Math.round(d.tier ?? (1 + (world.kills || 0) / 40))));
      // Where the run is standing is the least it can have stood on, so the
      // ticks are right even for a save that predates `peak`.
      this.peak = Math.max(this.peak, this.tier);
    }
    this.hold = !!d.hold;
    /*
     * The sheet's charges. `max` is replayed from the ledger like every other
     * upgrade, so only what is in hand and the clock have to be carried --
     * both additive, both defaulting to "nothing spent".
     */
    if (d.recall) {
      this.recall.held = Math.max(0, d.recall.held | 0);
      this.recall.cd = Math.max(0, +d.recall.cd || 0);
    }
    if (d.overclock) {
      this.overclock.held = Math.max(0, d.overclock.held | 0);
      this.overclock.cd = Math.max(0, +d.overclock.cd || 0);
      this.overclock.armed = !!d.overclock.armed;
    }
    /*
     * The lane, if one was taken. Additive, and dropped once its stretch is
     * past -- but measured against the rung the run OWNS rather than the one it
     * is standing on, or a trial three rungs up would spend a lane that is
     * still live at the rung the trial falls back to.
     */
    const owned = this.probe ? this.probe.from : this.tier;
    this.lane = d.lane && d.lane.id && Number.isFinite(d.lane.until)
      && d.lane.until > owned ? { id: d.lane.id, until: d.lane.until | 0 } : null;
    this.grace = d.grace | 0;
    this.probeLock = 0;
    this.contact = 0;
    this.hitPatience = false;
    this.held = 0;
    this.glitch = 0;
    this.holdFor = 0;
    // A restore puts the wave back to the top against an empty field, so
    // there is nothing for the gate to hold against and no threshold yet.
    this.lastThin = -1;
    this.lastRelease = world.time || 0;
    this.resting = true;
    this.timer = 1.5; // a beat to look at the field before it starts again
    this.jobs = [];
    this.asked = 0;
    this.made = 0;
    this.slain = 0;
    this.done = false;
  }

  /**
   * Put the fuse out.
   *
   * Separate from `update` because `Game.update` does not CALL `update` while
   * an anomaly is up -- it is an if/else, and the director is the else. So the
   * `world.boss` arm of the guard below was unreachable, and the fuse did
   * exactly what its own comment said it must not: froze at whatever it held
   * when the way opened, sat there for the whole fight, and came back still
   * lit over a turret that had been clear for four minutes. The case for it
   * passed because it drove `Director.update` directly and never went through
   * the branch that skips it -- a rule asserted on a control that is never
   * reached. Game.update calls this on the boss side of that if/else.
   */
  douse() {
    this.held = 0;
    this.glitch = 0;
    this.burnFrom = null;
    // ...and the hold with them. An anomaly takes the field, so a wave that
    // was being held against a full one is being held against nothing.
    this.holdFor = 0;
  }

  update(world, dt) {
    // Belt and braces: `Game.update` douses on the boss side of its if/else,
    // and this is the same rule stated where the clock lives, for any caller
    // that reaches here with either condition true.
    if (world.phase !== 'staging' || world.boss) {
      this.douse();
      return;
    }
    const glitched = this.burn(world, dt);
    if (glitched) {
      if (world.onTier) world.onTier(glitched);
      return;
    }

    if (this.probeLock > 0) this.probeLock = Math.max(0, this.probeLock - dt);
    // The sheet's two clocks. One charge back per cooldown, and never above
    // what the tree paid for.
    for (const c of [this.recall, this.overclock]) {
      if (c.cd <= 0) continue;
      c.cd = Math.max(0, c.cd - dt);
      if (c.cd === 0) c.held = Math.min(c.max, c.held + 1);
    }

    /*
     * ---- the trickle of aimless matter, as MORTAR (build 301) ----------
     *
     * All run and independent of the waves, and from build 301 it follows
     * the flow staircase the way `emit`'s gap does: divided by
     * `scaleAt().flow`, so grey arrives about five and a half times faster at
     * the ceiling than at rung 1. At a flat 4.5-8s against a band-7 field of
     * forty hostiles it was invisible, and the mortar's point is that the
     * field is never EMPTY -- between waves, or while the release gate waits
     * for one to thin.
     *
     * It cannot crowd the stream out, and that is structural rather than
     * lucky: drift weighs zero in the wave budget (`threatOf`), is not
     * counted by `hostileCount`, and has its own ceiling in `CFG.maxDrift`.
     * So the two are tuned apart, and a thick field of scenery never
     * flatters a wave's verdict or holds the release gate shut.
     */
    this.driftTimer -= dt;
    if (this.driftTimer <= 0) {
      this.driftTimer = rand(CFG.waves.drift[0], CFG.waves.drift[1])
        / this.scaleAt(this.tier).flow;
      if (driftCount(world) < CFG.maxDrift) spawnDrift(world);
    }

    /*
     * The two live signals the ladder scores on, gathered while the wave runs
     * rather than reconstructed after it. Both were already computed every
     * frame for other reasons; this is the first thing that reads them.
     */
    if (!this.resting && world.attackers.size > 0) this.contact += dt;

    this.timer -= dt;

    if (this.resting) {
      if (this.timer > 0) return;
      /*
       * ---- and the next wave waits for the FIELD, not just for the clock --
       *
       * A wave ENDS on its own bodies thinning, which is right and is not
       * what this is: `standing()` counts the wave that just ran, so a wave
       * is judged on what it did rather than on the mess it inherited. But
       * nothing counted the mess. Each wave is allowed to leave a quarter of
       * itself standing (`thinAt`) or to time out at `patience` leaving
       * whatever it likes, and the next one then arrived on top -- so the
       * leftovers compounded with no ceiling at all. Measured on a run that
       * had climbed past its gun: ten to twenty-nine hostiles standing
       * permanently, wave after wave, none of them ever cleared.
       *
       * So the release waits until the field is as thin as the last wave was
       * required to leave it. A player who cleared their wave is already
       * under it and nothing changes; a player who is drowning stops being
       * sent more. It is the one bound the ladder never had, and it is the
       * whole of "pressure is what you can get through".
       *
       * `holdFor` is what the fuse reads. There is deliberately NO cap on the
       * wait: an uncapped hold would be a deadlock if nothing else moved, and
       * something else does -- the fuse fills from this, blows, fizzles the
       * field and releases the hold. The loop closes.
       */
      if (this.lastThin >= 0 && hostileCount(world) > this.lastThin) {
        this.holdFor += dt;
        return;
      }
      this.holdFor = 0;
      this.begin(world);
      return;
    }

    // Still letting the wave out.
    if (this.jobs.length) {
      if (this.timer > 0) return;
      this.emit(world);
      return;
    }

    // Everything is out. The wave ends when the field thins — or when patience
    // runs out, so one object loitering out of reach can never stall the run.
    this.wait += dt;
    // A wave may hold the field for a minimum time regardless of how fast it
    // clears. The opening uses it so the lines about DRIFT are read against a
    // field that has nothing else on it.
    const wv = this.wave;
    if (wv && wv.dwell && this.wait < wv.dwell) return;
    // Proportional to what this wave let out, so a big wave is not held to the
    // same empty field as a small one and does not simply time out every time.
    const thinAt = Math.max(CFG.waves.clearTo, Math.round(this.asked * CFG.waves.thinFrac));
    /*
     * THIS WAVE'S bodies, not the field's.
     *
     * It was `hostileCount(world)`, so the wave before's leftovers counted
     * toward the threshold this wave has to get under -- which let a wave end
     * having cleared less of itself the messier the field it inherited, and
     * is the other half of "many objects still on field and it resets". A
     * wave is over when the wave is over.
     */
    if (this.standing(world) > thinAt && this.wait < CFG.waves.patience) return;
    // Reaching patience means the field never came back. That is the wave
    // telling you it was too much, in the one number that already knew.
    if (this.wait >= CFG.waves.patience) this.hitPatience = true;
    /*
     * ...and what it was allowed to leave, kept for the release gate above.
     * The threshold the wave was held to is the right ceiling for the field
     * the next one opens against: anything more than that is somebody else's
     * leftovers, and sending another wave into them is what compounds.
     */
    this.lastThin = thinAt;
    const teach = this.wave && this.wave.teach;
    const rest = teach ? CFG.waves.teachRest : CFG.waves.rest;
    this.resting = true;
    /*
     * ...and the quiet after it is worth what the wave was. A flat 2-4 seconds
     * is the same punctuation after a wave of five and a wave of thirty, which
     * is no punctuation at all: the heavy ones are exactly the ones you need a
     * beat to look at the field after. `restPer` a body asked for, capped, so
     * the swell at the top of the ladder cannot turn the rest into a wait.
     */
    const P = CFG.waves.press;
    const earned = teach ? 0 : Math.min(P.restCap, (this.asked || 0) * P.restPer);
    this.timer = rand(rest[0], rest[1]) + earned;
    // The wave is over: score it, and let the world announce any move.
    const moved = this.score(world);
    if (moved && world.onTier) world.onTier(moved);
  }

  /** Start the next wave, rebuilding the rotation if this one is spent. */
  begin(world) {
    if (this.order.length) this.admit(world);
    this.prune();
    if (this.at + 1 >= this.order.length) this.shuffle(world);
    if (!this.order.length) { this.timer = 1; return; }
    this.at++;
    this.load(world, this.wave);
    this.resting = false;
    this.timer = 0;
  }

  /** Put the next job on the field. */
  emit(world) {
    const wave = this.wave;
    const teach = wave && wave.teach;
    const gap = teach ? CFG.waves.teachGap : CFG.waves.gap;
    /*
     * ---- a wave PRESSES as it goes (build 229) ----
     *
     * The gap was a flat roll for every release, so a wave arrived as a
     * metronome: the same beat from the first body to the last, whatever the
     * wave was. Twenty-nine waves all delivered at one tempo is a field that
     * fills rather than a wave that happens.
     *
     * It runs from `press.open` on the first release to `press.close` on the
     * last, across this wave's own job list -- so a wave opens wide enough to
     * see what is arriving and closes tight enough to be a press. The two are
     * either side of 1, so the wave takes about as long as it did and the
     * change is in the shape rather than the length; the verdict table reads
     * `t` from the LAST release, which is the beat this moves least.
     *
     * The opening is exempt. Its whole point is that there is time to look at
     * each new thing, and a tutorial that speeds up is a tutorial that stops
     * teaching.
     */
    const P = CFG.waves.press;
    const done = this.jobsAt > 1 ? 1 - (this.jobs.length - 1) / (this.jobsAt - 1) : 1;
    const press = teach ? 1 : P.open + (P.close - P.open) * clamp(done, 0, 1);
    // OVERCLOCK halves the gap: the same wave, arriving at twice the rate.
    const squeeze = this.overclock.armed ? CFG.waves.tier.overclockGap : 1;
    /*
     * ---- and the stream RUNS FASTER with depth (build 300) ----
     *
     * `scaleAt().flow` is how many times rung 1's rate this rung asks for, so
     * the gap is divided by it: x1 at rung 1 and x5.56 by rung 49, which
     * takes the mean interval from about 1.27s to 0.23s. It is the other half
     * of `popStep` -- the wave asks for x21 the bodies, and without this it
     * would simply take twenty-one times as long at one tempo.
     *
     * Teach waves are exempt, the same exemption `press` above takes and for
     * the same reason. And the division is applied to the SAME roll, in the
     * same order, so rung 1 draws exactly the randoms it always did.
     */
    const stream = teach ? 1 : this.scaleAt(this.tier).flow;
    this.timer = rand(gap[0], gap[1]) * press * squeeze / stream;

    // The field cap is a hard ceiling on top of the wave. Hold the job rather
    // than dropping it: a wave is a group, and losing half of it to a cap the
    // player is about to clear would make waves quietly inconsistent.
    if (hostileCount(world) >= CFG.maxEnemies) return;

    const job = this.jobs.shift();
    if (!job) return;
    const t = job.type;

    /*
     * ---- A GAIT THAT PLACES ITS OWN BODY GOES FIRST (build 309) ---------
     *
     * A formation is a SHAPE COMING THROUGH THE MOUTH, and these do not come
     * through the mouth at all -- so the branch below is not about them and
     * must not see them first.
     *
     * It did, for two builds. `['ember', 4]` and `['ember', 5]` are jobs of
     * four and five, `job.n > 1` is true, and `spawnFormation` -> `release`
     * -> the ordinary portal path RETURNS before `spawnByGait` is ever
     * reached. Measured through the real director on the real wave: every
     * EMBER started at y -70 to -77 with `staged` true, against a floor at
     * 1223. So "the only thing on the field that starts where you are" came
     * down out of the portal, turned round at the rim and climbed back out --
     * and got none of build 308's derived clock either, at a measured cruise
     * of 83-93 against the 110 the clock asks for.
     *
     * The suite could not see it, and the reason is the rule the case's own
     * docstring quoted: it called `spawnByGait` directly. A case that calls
     * the method the handler calls tests the logic and not the control.
     *
     * All of `job.n` goes out at once, because the count is what the object
     * guide authors ("four or five" sparks) and because these are harmless:
     * `hostileCount` cannot see them, so the field cap below has nothing to
     * say about them and `mortarCap` is what bounds them at the table.
     */
    if (OWN_SPAWN.has(t.gait)) {
      for (let i = 0; i < Math.max(1, job.n); i++) {
        spawnByGait(world, t, rand(t.r + 12, world.width - t.r - 12));
      }
      this.lastRelease = world.time || 0;
      return;
    }

    /*
     * A shape made of towed pairs is a traffic jam rather than a formation.
     * They file in.
     *
     * ...and so does a YOKE, for the same reason made of different
     * arithmetic. `spawnFormation` lays its slots at `r * 2 + 8` -- 60 for
     * an r-26 half -- and a pair spans `r + len + r` = 112 across the field,
     * so the slots are pitched for one body and each pair is nearly two
     * slots wide. Measured through the real director on the real wave at
     * rung 32: 114 bodies, every beam intact at exactly 60, and a worst
     * overlap between halves of DIFFERENT pairs of 51.9 of a possible 52 --
     * two bodies with their centres a tenth of a unit apart. A formation of
     * pairs is a lattice, not a shape.
     *
     * `beads` and `school` reach this branch too once the budget swells
     * their count, and both were measured on the builds that shipped them;
     * neither is touched here.
     */
    if (job.n > 1 && !t.tows && !t.pair) {
      const room = Math.min(job.n, CFG.maxEnemies - hostileCount(world));
      if (room >= 2) { spawnFormation(world, [t], room); this.lastRelease = world.time || 0; return; }
    }
    let x = rand(t.r + 12, world.width - t.r - 12);
    // Two SCIONs arriving on top of each other seed the same host twice and
    // read as one event rather than two decisions.
    if (t.id === 'scion') x = scionLane(world, t, x);
    /*
     * ...and everything comes through the portal, at both eras. Applied to
     * the ANSWER rather than replacing the roll, so every spawn site draws
     * exactly the randoms it always did, in the order it always did.
     *
     * The y is deliberately untouched. A released body is `staged` from -50
     * down to the rim, and `drawPortal` draws nothing above the portal's
     * centre line, ghosts what is inside the surface and paints only what
     * has pushed through it -- so the march is hidden by the drawing rather
     * than by the chrome, which from build 295 is too short to hide it.
     */
    // The gait dispatch is ABOVE the formation branch from build 309 -- see
    // the note there. Nothing self-placing reaches this far.
    x = throughMouth(world, x, t.r);
    release(world, t, x, -50 - rand(0, 40));
    this.lastRelease = world.time || 0;
  }
}

/**
 * The two gaits that do not arrive through the portal, from build 307.
 *
 * A RISE body starts on the FLOOR and climbs; a TUMBLE body is thrown in from
 * one side. Neither is `staged` -- staging is the hidden march down the
 * portal's throat and there is no throat on either of these paths -- and
 * neither is `born`, so the one-way surface lets an EMBER out through the rim
 * it never came in by.
 *
 * The `x` already rolled by the caller is what places a RISE body and what
 * picks a TUMBLE body's SIDE, so this adds no draw of its own beyond the two
 * each throw needs. Returns true when it has placed the body, so the ordinary
 * portal release is skipped.
 *
 * `spawnGroup` deliberately does NOT come through here: a debug placement or
 * an assay body is put where the caller asked and picks its gait up from
 * wherever it stands, which is the same escape `spawnDrift`'s `here` is.
 */
/**
 * How many seconds a RISE type's climb takes, and there is no default.
 *
 * Build 224 removed `levels ?? 3` and build 303 made `band` throw for the
 * same reason: a defaulted value indistinguishable from a chosen one is
 * invisible in a diff, and eight nodes shipped sold three times before that
 * lesson took. A rise type with no clock would silently take whatever
 * `type.speed` happened to be -- which is the exact fault build 308 exists to
 * remove -- so it throws here and `check-build.mjs` fails the build for one.
 */
export function climbOf(type) {
  const c = type && type.climb;
  if (!(typeof c === 'number' && c > 0 && Number.isFinite(c))) {
    throw new Error(`${type && type.id}: a 'rise' type must declare climb, in seconds. `
      + 'There is no default -- see CFG.rise.');
  }
  return c;
}

/**
 * The gaits that place their own body instead of coming through the mouth.
 *
 * Shared with `Director.emit`, which has to know BEFORE it reaches for a
 * formation -- see the note there. One set rather than two lists, because the
 * ids also have to appear quoted in this file for check-build's gait
 * vocabulary guard, and a second copy is a second thing to forget.
 */
export const OWN_SPAWN = new Set(['rise', 'tumble']);

/**
 * The gaits whose PICTURE points along the body's own travel rather than at
 * the world. See the facing block in `Enemy.update` for why it is a gait
 * property and not a type flag.
 */
const FACES_TRAVEL = new Set(['flock', 'dive']);

/**
 * The gaits that AUTHOR a delivered speed, and are therefore exempt from the
 * route's `dawdle`.
 *
 * `dive` sets `this.cruise` per phase and its whole claim is a number in
 * units a second -- so leaving the route's speed modifier in the path makes
 * that number depend on a SPAWN ROLL. Measured: the same gait delivers 209.9
 * against an authored 210 on a body that rolled a direct route and 185.9 on
 * one that rolled a dawdling one, with the climb 80.0 against 51.6. Nothing
 * about the geometry differed; `g.restart()` moved the random stream and the
 * route came out different, which is how the suite found it after three
 * standalone probes agreed with each other.
 *
 * `roll` and `flock` also replace the route's STEERING and still inherit its
 * dawdle. That is left alone deliberately -- neither authors a speed, so for
 * them the modifier is just a slower approach, and changing it is a balance
 * decision rather than a correctness one.
 */
const OWN_SPEED = new Set(['dive']);

/**
 * How many bodies a chain is, and there is no default.
 *
 * The third mandatory field after `levels` (build 224) and `band` (303), and
 * for the same reason both of those threw in the end: a defaulted value is
 * indistinguishable in a diff from a chosen one. `beads` is also what
 * `release()` dispatches on and what everything counting bodies per authored
 * entry reads, so a silent 1 would be a dispatch for nothing and a mortar cap
 * under-counting sevenfold.
 */
/**
 * What a RIDER is, and it throws rather than defaulting.
 *
 * Fourth of this family after `levelsOf` (224), `bandOf` (303), `beadsOf`
 * (310) and `climbOf` (308), and it exists for the reason build 319 had to
 * add a check-build guard refusing a second `plated` type: both readers of
 * the rider's numbers were hard-wired to ONE block, `CFG.graft`, so the
 * second rider would have worn SEED's growth, toughening, healing and ball
 * health in total silence with no field to set and nothing to fail.
 *
 * All seven keys are required. `grow`, `tough` and `armor` are legitimately
 * zero for LATCH, which is exactly why they cannot be optional -- an omitted
 * key and a deliberate zero are the same text otherwise, and that is the
 * `levels ?? 3` fault that sold eight nodes three times.
 *
 * `check-build.mjs` runs the same rule over the table at build time, so an
 * authored-but-unreleased rider is caught before the game ever boots one --
 * a throw in the rAF loop reads as a freeze rather than an error (build 288).
 */
export const RIDE_KEYS = ['life', 'hunt', 'grow', 'tough', 'armor', 'regen', 'hp'];

export function ridesOf(type) {
  const rd = type && type.rides;
  if (!rd || typeof rd !== 'object') {
    throw new Error(`${type && type.id}: a 'ride' type must declare rides `
      + `{${RIDE_KEYS.join(', ')}}. There is no default -- see CFG.graft.`);
  }
  for (const k of RIDE_KEYS) {
    const v = rd[k];
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`${type.id}: rides.${k} must be a number at or above zero, got ${v}`);
    }
  }
  if (rd.life <= 0 || rd.hunt <= 0 || rd.hp <= 0) {
    throw new Error(`${type.id}: rides.life, .hunt and .hp must be above zero `
      + '-- a rider with no clock, no reach or no health is not a rider');
  }
  return rd;
}

export function beadsOf(type) {
  const n = type && type.beads;
  if (!(Number.isInteger(n) && n > 1)) {
    throw new Error(`${type && type.id}: a chain must declare beads, a whole number above one. `
      + 'There is no default -- see CFG.chain.');
  }
  return n;
}

/**
 * The follow distance, derived from the bead's own radius.
 *
 * `resolvePair` corrects any overlap and has no `harmless` exemption, so the
 * floor is `2r + CFG.physics.slop`; `CFG.chain.clear` is the measured headroom
 * above `2r` for the follower's own undershoot. Derived rather than authored
 * so a bead of another size moves the picture and the rule together -- the
 * `m.r` lesson.
 */
export function chainGap(type) {
  return type.r * 2 + CFG.chain.clear;
}

export function spawnByGait(world, type, x) {
  const g = type.gait;
  if (!OWN_SPAWN.has(g)) return false;
  if (g === 'rise') {
    const R = CFG.rise;
    // Off the floor, a little way up from it so nothing is born inside the
    // band `edgeEase` pushes out of.
    const fx = clamp(x, type.r + 6, world.width - type.r - 6);
    const fy = world.floorY - type.r - rand(2, 30);
    /*
     * ---- the CLOCK, derived per body (build 308) ------------------------
     *
     * `climb` is seconds and the cruise is what those seconds are worth on
     * the column THIS body has to cross -- measured off its own start and its
     * own dissolve line rather than off a nominal depth, so the roll above
     * cannot shorten the clock. The dissolve fires when `y + r` passes
     * `rim - gone * scale` (see `rise`), so that is the far end.
     *
     * Handed the speed at spawn rather than accelerating into it: `accel /
     * 100` is a rate, so LANTERN's 80 is a 1.25-second time constant and two
     * seconds of a nine-second climb would otherwise be spent getting going.
     */
    const end = entryLine(world, ENTRY_Y) - R.gone * CFG.scale - type.r;
    const need = Math.max(1, (fy - end) / climbOf(type));
    /*
     * ---- A TARGET SPEED IS NOT A SPEED, and this is the second time ------
     *
     * `rise` blends the velocity toward its target at `k = accel / 100` while
     * `integrate` damps it at `CFG.physics.linearDamping` every substep, so
     * the steady state is `target * k / (k + damping)` and NOT the target.
     * Measured with the clock handed over raw: EMBER wanted 11s and took
     * 13.47 (k = 2.2, ratio 0.80, predicted 13.4 -- the arithmetic and the
     * measurement agree to a hundredth) and LANTERN wanted 9 and took 18.9
     * (k = 0.8, ratio 0.59).
     *
     * CLAUDE.md already records this from build 298, about the portal's own
     * speed ramp, and it was walked into again. So the compensation is
     * derived from the two terms that cause it rather than fitted: the target
     * is what the climb needs, grossed up by `(k + damping) / k`. A slower
     * `accel` therefore needs a higher target for the same clock, which is
     * the correct dependency and the one a fitted constant would hide.
     *
     * Launched at `need` and not at the target, because `need` is the speed
     * it will actually hold -- so the clock is exact from the first frame
     * instead of overshooting and settling back onto it.
     */
    const k = Math.max(0.01, type.accel / 100);
    const cruise = need * ((k + CFG.physics.linearDamping) / k);
    const e = spawnOne(world, type, fx, fy, {
      staged: false,
      spawnIn: 0.6,
      vx: spread(R.sway),
      vy: R.launch ? -need : -rand(10, 40),
    });
    // After `spawnOne`, because the constructor sets `cruise` from the type's
    // own speed and `scaleToTier` runs in there too.
    e.cruise = cruise;
    return true;
  }
  const H = CFG.husk;
  // Whichever half of the field the roll landed in is the side it comes from,
  // so the throw crosses the whole arena rather than half of it.
  const side = x < world.width / 2 ? -1 : 1;
  const sx = side < 0 ? type.r + 4 : world.width - type.r - 4;
  // The spin is `tumble`'s, and only `tumble`'s: it has to be held against
  // the angular damping every frame anyway, so setting it here as well would
  // be two owners for one number.
  spawnOne(world, type, sx, entryLine(world, ENTRY_Y) + rand(40, 140), {
    staged: false,
    spawnIn: 0.6,
    vx: -side * H.cross,
    vy: H.fall * rand(0.6, 1.3),
  });
  return true;
}

/** Area damage + shove, used by blooms, mines and PULSE. */
/**
 * A SEED reaching a host. It does not dissolve into it: it attaches, and stays
 * attached as a ball riding the outside of the body.
 *
 * The host keeps being whatever it was — its shape, its route, its behaviour —
 * and every ball on it makes it a little larger, a little tougher, and closes
 * its wounds a little faster. Nothing is replaced, because "that BLOOM is now
 * a problem" is a much better read than "a new object appeared".
 *
 * Up to `CFG.graft.stack` of them, so a SCION's three can all land on the same
 * body and make one monster of it. Each is a separate target with its own
 * health, and shooting one off takes its whole share back — which is the way
 * out of a body that is otherwise healing faster than you can hurt it.
 */
export function graft(world, host, rider) {
  const G = CFG.graft;
  /*
   * The rider is MANDATORY, and it is the BODY rather than the type or an id.
   *
   * Two kinds can be on one ring from build 322 and they give different
   * things, so a ball has to carry which one it was -- and defaulting it to
   * SEED would be the `CFG.graft` fault moved one level in: the caller that
   * forgot would silently hand its host somebody else's numbers.
   *
   * The body and not the type, because the ball's own health has to climb
   * with the rung like every other hostile's does. `rides.hp` is what it
   * costs at rung 1 and `rider.hpScale` is what the ladder made of the body
   * that arrived as it -- asked of the body, because `scaleToTier` is where
   * the conditions for scaling anything live. A LATCH's ball is 40 at rung 1
   * and about 70 at rung 21; a SEED's is exactly 26 at every rung, because
   * SEED is harmless and `scaleToTier` leaves `hpScale` at 1 for it, which
   * is why this split leaves SEED unchanged to the digit.
   */
  const rd = ridesOf(rider.type);
  if (!host || host.dead || host.graftCount >= G.stack) return false;

  // First one: remember what the body was, so every later recount is measured
  // from the same place rather than from whatever the last one left behind.
  if (!host.grafts) {
    host.grafts = [];
    host.graftBaseR = host.r;
    host.graftBaseHp = host.maxHp;
    host.graftBaseBytes = host.bytes || 0;
    host.graftBaseArmor = host.armor || 0;
    host.graftSpin = rand(0.7, 1.3) * (Math.random() < 0.5 ? -1 : 1) * G.spin;
  }

  // Spaced around the ring by slot, so a second and a third land opposite what
  // is already there instead of stacking into one bright dot.
  //
  // The ball keeps its own shares as well as its own health: `refreshGrafts`
  // sums the ring rather than multiplying a count, so shooting one kind off a
  // mixed ring takes exactly that kind's share back.
  const slot = host.grafts.length;
  const ballHp = Math.max(1, Math.round(rd.hp * (rider.hpScale || 1)));
  host.grafts.push({
    a: (slot / G.stack) * TAU + rand(-0.3, 0.3),
    alive: true,
    hp: ballHp,
    maxHp: ballHp,
    from: rider.type.id, // which picture to draw, and which tone
    grow: rd.grow,
    tough: rd.tough,
    armor: rd.armor,
    regen: rd.regen,
  });
  host.refreshGrafts();

  host.flash = 1;
  ring(host.x, host.y, host.r * 0.5, host.r * 2.6, 0.5, '#c9a7ff', 3);
  ripple(host.x, host.y, 1.2, host.r * 5);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU);
    spark(host.x, host.y, Math.cos(a) * rand(90, 260), Math.sin(a) * rand(90, 260), '#d9c2ff', rand(0.24, 0.5), 2.2);
  }
  audio.reflect();
  return true;
}

export function applyBlast(world, blast) {
  const { x, y, r, damage, impulse, source } = blast;
  const r2 = r * r;
  /*
   * A shockwave that reaches the wall lights it. Nothing past it is touched --
   * `applyDamage` refuses -- but the blast plainly stopped against something,
   * and the whole point of the marks is that nothing in this game stops
   * against nothing.
   */
  const yard = world.yard;
  if (yard && y - r <= yard.wallY) edgeHit(x, yard.wallY, r / 200, 1, blast.color || '#9fd8ff');
  const hit = (list) => {
    for (const e of list) {
      /*
       * `spent` for the reason CLAUDE.md gives: a boss's own structure is
       * still drawn through its ending -- the arrest snaps the frame off a
       * piece at a time and the infall takes the rest -- and "anything that
       * decides what may be shot has to honour it". Rounds and the assist
       * already did; blasts never have, so a PULSE (up to 574.6 units at two
       * SHOCKFRONTs) or a mine going off inside a dying boss was damaging the
       * pieces the outro is made of, and could take one before the sequence
       * asked for it.
       */
      if (e.dead || e.spent || e === source) continue;
      /*
       * ...and the wall, HERE and not only in `applyDamage`. The graft loop
       * below calls `hitGraft` directly -- it takes no world and has no guard
       * of its own -- so a blast under the line was popping the balls off a
       * body it could not otherwise touch, five lines before the guarded call
       * that would have refused it.
       */
      if (shielded(world, e)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      const falloff = 1 - d / r;
      const nx = dx / d;
      const ny = dy / d;
      /*
       * The balls on a grafted body take the blast too, each judged from where
       * it actually is. Without this a mine or a PULSE could only ever hurt
       * the host, and a build with no precise shot in it had no answer at all
       * to a body carrying three of them.
       */
      if (e.graftCount) {
        // `orbit` is read once, outside the loop, and that is load-bearing:
        // taking a ball off shrinks the host and moves the ring the rest ride,
        // so reading it per ball would judge the second and third against an
        // orbit the blast never saw. One shockwave, one set of positions.
        const orbit = e.graftR;
        for (const g of e.grafts) {
          if (!g.alive) continue;
          const gx = e.x + Math.cos(g.a) * orbit;
          const gy = e.y + Math.sin(g.a) * orbit;
          const gd2 = (gx - x) ** 2 + (gy - y) ** 2;
          if (gd2 > r2) continue;
          const gf = 1 - Math.sqrt(gd2) / r;
          e.hitGraft(g, damage * (0.35 + gf * 0.65), gx, gy);
        }
      }
      e.applyDamage(world, damage * (0.35 + falloff * 0.65), nx, ny, impulse * falloff,
        0, 0, !!blast.throwOff, blast.src);
    }
  };
  hit(world.enemies);
  hit(world.drops);

  // Wreckage is pulverised rather than split by a shockwave: a PULSE turning
  // one plate into three next to the turret would be adding clutter exactly
  // where it was meant to be clearing it. Downward from the captured length,
  // so nothing added mid-loop is walked.
  if (world.debris) {
    for (let i = world.debris.length - 1; i >= 0; i--) {
      const c = world.debris[i];
      if (c.dead) continue;
      const dx = c.x - x;
      const dy = c.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      c.shatter(world, dx / d, dy / d, false);
    }
  }

}
