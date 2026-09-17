// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

/** Shown on the title screen and in the debug stats. Must match BUILD in sw.js. */
export const BUILD = '351';

/**
 * What these bytes actually are, as opposed to what build they claim to be.
 *
 * A seven-character hash of every source file, stamped by
 * `node scripts/check-build.mjs --stamp` and guarded by the same script. Two
 * installs can both say BUILD 75 and be different code — a stale cache, a
 * different host, an older deploy — and there was no way to tell from inside
 * the game. There is now: the menu shows BUILD and REV together, and two
 * screens showing the same pair are running the same bytes.
 */
export const REV = 'e750be2';

/*
 * ---- prices are AUTHORED in the unit they are read in --------------------
 *
 * `cost: kB(500)` rather than `cost: 500000`. Amounts are stored in bytes so
 * that the number in the source and the number on the glass are the same
 * number -- this repo has been bitten four times by a value that is one thing
 * in the code and another one layer down -- and these keep the source
 * readable at that scale. `cost: 500` said nothing about what 500 was.
 *
 * They live ABOVE `CFG` because `CFG` is one object literal four thousand
 * lines long and its prices are written with them. A `const` arrow declared
 * below that literal is in its temporal dead zone while the literal is being
 * evaluated, so `cost: kB(500)` five hundred lines up would throw on the
 * module's first line of work -- which is to say the game would not boot, and
 * `CFG.bytes` itself can stay below because nothing reads it until something
 * is formatted.
 */
export const B = (n) => Math.round(n);
export const kB = (n) => Math.round(n * 1e3);
export const MB = (n) => Math.round(n * 1e6);
export const GB = (n) => Math.round(n * 1e9);

/*
 * ---- the shape of the ladder, authored once ------------------------------
 *
 * One boss slot every `BOSS_EVERY` rungs, and `DEPTH_CEILING` is the last
 * rung there is. Both are read back out of `CFG.waves.tier`, where they are
 * written down with the reasons; they live here because the gate table is
 * DERIVED from them inside the literal, and a `const` arrow below `CFG` is in
 * that literal's temporal dead zone while it is being evaluated -- the same
 * reason `kB` is up here.
 *
 * Derived rather than transcribed because a transcription is a hand-kept list,
 * and this repo has paid for three: `world.apertures` written out as eight
 * zeroes against nine anomalies, the emplacement lot count restated in four
 * places, and a case pinning `gates.length === 9` that failed the moment the
 * roster grew without one gate moving. Ask the structure, never restate it.
 */
const BOSS_EVERY = 7;
const DEPTH_CEILING = 49;

/** Every rung that is a multiple of `every`, up to and including `ceiling`. */
export const rungsEvery = (every, ceiling) => {
  const out = [];
  for (let r = every; r <= ceiling; r += every) out.push(r);
  return out;
};

export const CFG = {
  // ---- run structure -------------------------------------------------
  // Seconds of empty field at the start of a run, and again after the last
  // object falls, before the next thing happens. The field starts with nothing
  // in it: the first beat is the interface, not a reaction.
  // The field stays empty this long. The opening's first four entries ask for
  // nothing but the clock, so the grip, the tap, PULSE and BOLT are all in
  // hand — and have been played with — before the first object is released.
  //
  // Cut from 27 in build 58. The fourth line is said at 20.6s and reads for
  // another 5.7 — "something is coming down now" — and at 27 it had finished
  // and gone before anything did. At 22 the first object arrives while that
  // sentence is still on the screen, which is the beat it was written for.
  openingGrace: 22,
  // Harmless drift comes early regardless, so there is something to shoot at
  // while the field is still safe.
  driftStart: 7,

  /*
   * How far below the top edge an object has to come before it is loose in
   * the arena — before auto-aim will take it, before a HERALD will cover it,
   * before a shove or an aura will touch it.
   *
   * It used to be zero: an object went live the instant its lower edge cleared
   * the top of the screen, at a measured median of y=14 out of 1361. Auto-aim
   * picked it there and killed it there, at maximum range, at its smallest,
   * behind the status chips — the top band is occupied by interface down to
   * world y=234. So objects arrived and died in the one strip of the field you
   * cannot actually watch.
   *
   * 260 puts the line just clear of all of it. Nothing about *being shot* has
   * changed: `staged` never gated projectile collision, so a manual shot has
   * always been able to reach something on its way in, and still can. This
   * only holds the assists back until the thing they are shooting is somewhere
   * you can see it.
   */
  entryDepth: 260,
  // ...and the march in runs this much faster than the object's own cruise, so
  // the extra 260 units cost the run no time. Without it a wave simply took
  // five seconds longer to become a wave.
  entrySpeed: 2.6,
  // The population ramp, the warm-up rate and the teaching throttle all lived
  // here until build 71. Waves replaced every one of them: a wave is a fixed
  // group with a fixed pace, so how thin the opening is, is a property of
  // which waves come first rather than of a curve applied to a trickle.
  storyEvery: 50, // one story line per this many kills (10 lines total)

  // ---- camera ---------------------------------------------------------
  /*
   * World units per screen pixel. Below 1 the arena is drawn zoomed out, so
   * the field is physically larger than the display and objects read smaller
   * and further away. All game logic works in world units.
   *
   * LIVE from build 238: `setZoom` writes this on every resize from the era
   * the world is in, exactly the way `setHairline` writes `CFG.hairline`.
   * That is deliberately the shape it takes -- a property on `CFG`, written by
   * a function, read fresh at every use -- because `bundle.mjs` copies module
   * exports into a registry once, so an `export let` would be a live binding
   * in the served build and a SNAPSHOT in the bundle: green suite, clean boot,
   * and quietly a different game. It guards `export let`; it cannot guard a
   * module-local `const z = CFG.zoom`, so nothing may cache this.
   *
   * The value here is era 1's and is the module-load default. See `ZOOMS`.
   */
  /*
   * What the new field is worth. Applied to rounds and mines only -- the
   * user's ruling is "+30% base damage on all ammo and mines" -- and to
   * nothing the turret does directly, nothing an ability does, and nothing a
   * body does to you.
   */
  era2Power: 1.3,
  zoom: 0.62,
  /*
   * The scale per era, indexed from 1.
   *
   * Era 2 is era 1 x 0.65 -- 54% more world in each direction, so a 390x844
   * phone goes from 1361 units of depth to 2094. What that does NOT do is
   * open the window: the chrome and the ability strip are CSS-anchored, so
   * the unobstructed play band is 127 CSS px at BOTH eras (measured at
   * 320x568). Era 2 shows a larger world in the same space with everything
   * drawn 35% smaller, which is the deliberate reading -- see docs/newform.md.
   */
  ZOOMS: [0, 0.62, 0.403],

  /*
   * How far ABOVE the finger the aim point sits, in world units.
   *
   * A thumb covers roughly a 44px disc, which at `zoom` is about 71 world
   * units across -- so aiming at the point you touch means aiming at the one
   * part of the field you cannot see. drawTouchAid already drew a ring wide
   * enough to peek out from behind the finger, which shows you WHERE you are
   * aiming and still not WHAT you are aiming at.
   *
   * So the aim point is lifted clear of the contact patch: 56 units, about 35
   * screen pixels, which puts the crosshair's centre a comfortable margin
   * above the top of the thumb. The lift is applied to the AIM only -- the
   * lever is still grabbed where the hand physically is, because that is a
   * thing you take hold of rather than a thing you point at.
   */
  touchLift: 56,

  // ---- frame / quality ------------------------------------------------
  maxDpr: 2,
  /*
   * The stroke floor, in world units. Live: Game.resize rewrites it through
   * setHairline off the scale the canvas is actually drawn at. The default is
   * the dpr-1 value, which is what a fixed floor used to give everybody, so a
   * frame drawn before the first resize is thicker rather than thinner.
   */
  hairline: 1.25 / 0.62,
  fixedStep: 1 / 120, // physics substep
  maxSubsteps: 4,
  maxFrameDelta: 0.1, // clamp huge tab-switch deltas

  // ---- population -----------------------------------------------------
  // Raised with CFG.waves.population in build 111: a 30% bigger wave that
  // then meets the same ceiling is not a bigger wave, it is the same wave
  // arriving later.
  maxEnemies: 57,
  maxDrops: 128,
  /*
   * Aimless, harmless bodies alive at once -- the AMBIENT trickle's ceiling.
   *
   * 18 from build 301, up from 10, because drift is the MORTAR: it weighs
   * zero in the wave budget (`threatPerHp`'s note) and is not counted by
   * `hostileCount`, so it can thicken a field without crowding the stream or
   * flattering a wave's verdict. At ten against a band-7 field of forty it
   * was invisible; the trickle's interval follows the flow staircase now
   * (see `Director.update`), so grey arrives about five times faster at the
   * ceiling than at rung 1 and the field is never empty between waves.
   *
   * `waves.driftCap` 26 is the separate, higher ceiling for a wave that
   * places drift ON PURPOSE -- the bonus wave is 22 at once.
   */
  maxDrift: 18,
  maxParticles: 620,

  // ---- waves -----------------------------------------------------------
  /*
   * The field arrives in waves, not as a trickle.
   *
   * Builds 63 to 70 ran a rolling cohort: a working set of three types that a
   * timer drew from, rotating one out every so often. That got the *variety*
   * right and the *shape* wrong — objects arrived one at a time forever, so
   * nothing ever finished and nothing ever started. A wave has a beginning and
   * an end, which is what makes the quiet between two of them feel earned.
   *
   * A wave is done when everything in it has been released *and* the field has
   * thinned to `clearTo` — or when `patience` runs out, because one object
   * loitering in a corner must never be able to stall the run.
   *
   * None of this is ever named on screen. There is no wave counter, no "WAVE
   * 4" card and no between-wave banner: the pacing is meant to be felt, and a
   * number would turn a rhythm into a score.
   */
  waves: {
    clearTo: 2, // hostiles left before the next wave is allowed to start
    // A wave may also set `dwell`: the least time it is allowed to last, no
    // matter how fast the field clears. Only the opening uses it.
    patience: 26, // ...and the longest it will ever wait for that
    gap: [0.85, 1.7], // seconds between releases inside a regular wave
    /*
     * ---- the seam, CLOSED (build 301) ----------------------------------
     *
     * 2.6-4.2s until build 301, and with `press.restPer`/`restCap` on top a
     * long wave's seam reached 6.8s. That was the only pacing the game had
     * before the release arc and the flow staircase existed, and with both
     * of those in place it is a hole in a stream: the field empties, the
     * player waits, and the next wave starts from nothing.
     *
     * What paces the run now is the RELEASE GATE -- a wave waits for the
     * field to be as thin as the last one was required to leave it -- which
     * is a measurement of the player's position rather than a constant. The
     * plan's words are that the gate should rarely be the thing waiting,
     * because the turret is meant to be ahead; closing the seam is what
     * makes the gate the thing that decides when it is not.
     *
     * `restPer` and `restCap` stay, because a long wave earning a breath is
     * a real thing build 229 put in deliberately -- `restCap` comes down
     * 2.6 -> 1.4 so the breath is a beat and not a lull. Worst seam goes
     * 6.8s to 2.5s and the ordinary one 3.4s to 0.75s.
     */
    rest: [0.4, 1.1], // quiet between two regular waves, before `press.restPer`
    /*
     * ---- the shape of a wave, and the beat after it (build 229) ----
     *
     * `gap` above was rolled flat for every release, so every wave in the game
     * arrived at one tempo from its first body to its last, and the quiet
     * between two waves was the same whether the wave had been five bodies or
     * thirty. That is a field filling and emptying rather than a wave.
     *
     * `open` and `close` are the multiplier on the gap at the first release
     * and at the last, interpolated across the wave's own job list. They sit
     * either side of 1 and average about 1.02, so a wave takes as long as it
     * did -- what changed is that it now has a front and a back: wide enough
     * at the top to see what is arriving, tight enough at the end to be a
     * press. The opening's teach waves are exempt, because a tutorial that
     * speeds up is a tutorial that has stopped teaching.
     *
     * `restPer` is the beat a wave earns for its size, on top of `rest`, and
     * `restCap` is what stops the swell at the top of the ladder turning that
     * beat into a wait. A wave of six earns 1.1s, one of thirty earns the cap.
     */
    press: { open: 1.45, close: 0.6, restPer: 0.18, restCap: 1.4 },
    // The opening is much slower on both counts. Objects join one at a time
    // with a long beat between them, because the whole point of the tutorial
    // waves is that there is time to look at each new thing.
    teachGap: [2.6, 4.2],
    teachRest: [4, 6],
    drift: [4.5, 8], // a grey object every so often, for the whole run
    // maxDrift caps the *ambient* trickle. A wave placing drift on purpose is
    // a different thing and gets its own ceiling — the bonus wave is 22 at
    // once and would otherwise stop at ten. The trickle simply pauses until
    // the field is back under maxDrift.
    driftCap: 26,
    // A wave is authored at its opening size and grows with the tier, so the
    // same six-MOTE wave that is a gentle problem at tier 1 is fourteen of
    // them high up the ladder. Without this the field peaked at nine and the
    // late run was thinner than the early one — waves bound the population by
    // construction, which is most of why they work and all of why they need
    // this. Tutorial waves never swell; they are authored at the size they
    // are meant to be.
    /*
     * ---- THE LADDER ----
     *
     * Difficulty used to have no direction. Past the opening eight, waves
     * were shuffled and the only thing that grew was `swell`, a global volume
     * knob driven off the kill count -- so a run got busier but never got
     * *harder in a way anyone could stand on*, and nothing could be gone back
     * to. Tiers replace it: a numbered step, climbed automatically, held or
     * dropped by hand, and dropped for you when the field proves it is over
     * your head.
     *
     * A tier draws its shapes from a band of the authored table and one band
     * below it, and scales three things. All three slopes are the tuning
     * surface for the damage and energy plans -- see docs/pacing.md -- and
     * scripts/tiers.mjs is what calibrates them.
     */
    tier: {
      /*
       * Which band a tier draws from: `ceil(tier / perBand)`, clamped to the
       * authored bands. SEVEN from build 301, so a band is one boss slot
       * wide and `bossEvery` and this are the same number by design -- six
       * ordinary rungs and then the rung the anomaly holds.
       *
       * It was TWO, which meant the authored table ran out at rung 9: past
       * that every rung drew band 4-5 with bigger numbers on it, and the
       * ladder introduced nothing new for forty rungs. At seven the five
       * authored bands cover rungs 1 to 35 and bands 6-7 still draw band 5,
       * because their own rosters are phase 6's objects -- nineteen of them
       * since GYRE was withdrawn at build 331. That is a known limit of this
       * build rather than the shape it is aiming at.
       *
       * What it also does is give `budget.open`/`close` below something to
       * walk ACROSS. A ramp over two rungs is a step; over six it is a band
       * that opens gently and ends on its own heaviest set-piece.
       */
      perBand: 7,
      /*
       * ---- how many bodies a wave asks for (build 300) ------------------
       *
       * `popStep ** (tier - 1)`, which is the same shape health and bounty
       * already use and for the same reason: tier 1 is the authored table
       * EXACTLY, and every rung after it is a ratio on the one below. It was
       * `1 + pop * tier` at 0.1 a rung, which made tier 1 itself 1.1x the
       * table -- a slope that starts by moving the thing it is measured
       * against.
       *
       * 1.0655 is x21.0 at rung 49, and that number is the whole of phase 2:
       * the plan inverts which of the two slopes carries the climb. Health
       * was x50 by 49 against a population ceiling of x3 reached at rung 20,
       * so the last thirty rungs were pure health against a gun that stops
       * improving -- and `hpStep` below is now x3.83 while this is x21.
       * Quantity carries the pressure and a body barely gets tougher.
       *
       * It asks for more bodies; it does NOT put more on the screen. `emit`
       * hard-gates on `CFG.maxEnemies` and HOLDS the job rather than dropping
       * it, so a deeper rung is a LONGER wave arriving FASTER through a field
       * of roughly constant size -- which is what `flow` below is for, and
       * why the two have to move together. Raising this alone would make a
       * wave that takes four times as long at the same tempo.
       */
      popStep: 1.0655,
      /*
       * ---- and how fast they arrive (build 300) -------------------------
       *
       * Releases a second, ONE ANCHOR PER BOSS BAND, at that band's middle
       * rung -- `bossEvery` is the width, so anchor i sits on rung
       * `i * bossEvery + (bossEvery + 1) / 2`. `Director.flowAt` reads it and
       * interpolates between anchors, so the stream accelerates smoothly
       * instead of stepping at a band edge: a cliff in the arrival rate is
       * the one thing a ladder climbed one rung at a time would feel as a
       * wall rather than as a slope.
       *
       * Authored as a table rather than fitted to a curve because it IS the
       * design. The seven numbers are the plan's, and every smooth function
       * tried against them is wrong somewhere: a geometric ramp with the same
       * endpoints sags 21% under the middle anchors, and a straight line
       * overshoots them by 13%. A fit that misses its own anchors by a fifth
       * is a different game wearing the plan's numbers.
       *
       * Rung 1 is the divisor, so the multiplier there is exactly 1 and the
       * opening arrives at the tempo it always did, to the bit. The teach
       * waves are exempt on top of that, for the same reason the press arc
       * exempts them: they are authored beats and a tutorial that speeds up
       * is a tutorial that stops teaching.
       */
      flow: [0.9, 1.4, 2.0, 2.7, 3.4, 4.2, 5.0],
      /*
       * ---- what a wave is allowed to WEIGH (build 301) ------------------
       *
       * The walk across a band's six ordinary rungs, as a fraction of that
       * band's own budget. A wave is filled from its roster until the budget
       * is met, so LENGTH FOLLOWS STRENGTH by construction and nobody
       * authors a body count again -- the numbers in `WAVES` are proportions
       * from here on, not counts. See `Director.budgetAt`.
       *
       * The two ends average exactly 1, so a band's MEAN wave is the same
       * weight it was authored at and what changed is the distribution: rung
       * 1 of a band is its gentlest and rung 6 its heaviest. That matters
       * because build 300 made "rung 1 is the table exactly as authored" an
       * asserted invariant for the three SLOPES, and this is deliberately
       * not that -- the slopes are still 1 at rung 1 and the walk is a
       * separate authored shape on top.
       *
       * The boss rung takes `close`, not a seventh step: it is the rung the
       * anomaly holds and its ordinary waves are the band at its heaviest,
       * which is what the aperture is standing in front of.
       */
      budget: { open: 0.72, close: 1.28 },
      /*
       * Health is the one slope that compounds: type health x hpStep^(n-1),
       * so tier 1 is the table as authored and each rung is 12% on the one
       * below it.
       *
       * It was linear, +6% a tier, and scripts/tiers.mjs measured what that
       * came to: x2.2 at tier 20, against a damage line worth x13 by tier 8
       * and flat after it. The slowest body in a band peaked at 3.0s at tier
       * 3 and then *fell*, settling near 1.4s from tier 9 to 20 -- the ladder
       * got busier and never got harder, which is the whole thing it exists
       * to do. A linear slope steep enough to matter at fourteen (x0.457)
       * would have made tier 2 nearly twice tier 1: all early and no late.
       *
       * Compounding puts the growth where the wall is wanted: x1.12 at tier
       * 2, x1.57 at 5, x2.77 at 10, x4.36 at 14, x8.6 at 20. There is no
       * ceiling on it and there should not be -- the brief is to climb until
       * you cannot, and the fail score is what catches you.
       *
       * 1.12 from build 194, down from 1.17, and it is less a retune of the
       * ladder than the other half of one. Builds 189-193 took the whole
       * cadence tree apart -- TRIPLE TAP, then HOT LOAD, then FEED halved --
       * and the plateau went from 1,438 dps to 717, which is exactly half. A
       * compounding slope is the right instrument to answer that with,
       * because the damage cut is flat and the health it was outrunning is
       * not: at 1.17 the slowest body in band 5 went 13.9s to 27.3s at tier
       * 20 while tier 3 did not move at all. Chosen by sweeping 1.11, 1.12
       * and 1.13 against the wall the game had before any of it -- 1.12 puts
       * tier 16 at 8.1s against 8.0 and tier 20 at 12.4 against 13.9, where
       * 1.11 undershoots and 1.13 leaves half the gap. See docs/pacing.md.
       */
      /*
       * 1.105 from build 229, down from 1.12, and it is the other half of a
       * cadence nerf again -- exactly as 1.17 -> 1.12 was in build 194.
       *
       * That change paid for TRIPLE TAP (189) and HOT LOAD (193). DOUBLE TAP
       * went in build 225 and NOTHING paid for it: the plateau fell 717 to
       * 423 and the slope did not move, so the ladder was being climbed with
       * 59% of the gun it was calibrated against. Measured at build 228's
       * audit, the wall landed six rungs early -- docs/pacing.md asks for the
       * slowest body in a band to pass 6s at about tier 15 and it passed it
       * at 9, and the heaviest band-5 wave stopped clearing at 16 rather than
       * 19.
       *
       * Chosen off the ratio the design was calibrated at rather than by
       * feel. Build 179's good state was health x19.7 at tier 20 against
       * 1,438 dps -- 0.0137 of a second per point. Today's dps is 423 with
       * HOLLOWPOINT deepened to x4.00, so the health that lands the same TTK
       * at tier 20 is about x6.9, and 6.9^(1/19) is 1.105. Swept against
       * tiers.mjs afterwards; see the table in docs/pacing.md.
       */
      /*
       * ---- 1.028 from build 300, and it is the INVERSION ----------------
       *
       * Every note above is the history of one argument: the cadence tree
       * was cut three times, the plateau fell 1,438 dps to 423, and this
       * slope came down each time to keep the wall in the same place. It was
       * always the same instrument answering the same question -- how tough
       * is one body -- and the answer was x50.2 by rung 49.
       *
       * The question changed in phase 2. Pressure is carried by HOW MANY and
       * HOW FAST (`popStep` x21.0 and `flow` x5.56 above), so a body only has
       * to stay worth shooting rather than become a wall on its own: x3.83 at
       * rung 49, x1.03 at 2, x1.30 at 10, x1.75 at 21, x2.32 at 31.
       *
       * The two readings this replaces, kept because they are what the change
       * was measured against: at 1.085 the worst body in a band was 4.0s at
       * tier 9 and 10.3s at 20; the design brief asks for 2-4s through about
       * rung 10 and past 6s by about 14. At 1.028 a body's health is no
       * longer what produces either number -- the crowd is -- so the bench
       * that reads single-body TTK (`tiers.mjs`) is measuring the wrong wall
       * again, which is the finding build 177 published and build 227
       * reversed. Phase 3 is where the right one gets an instrument.
       */
      hpStep: 1.028,
      /*
       * ---- what a rung pays (build 202) ----
       *
       * Bounty was linear, `1 + 0.15 * tier`, against health compounding at
       * `hpStep`. Exponential cost and linear pay is a shape with only one
       * outcome: energy per point of damage at rung 40 was 0.08 of rung 1, so
       * the best-paying place on the whole ladder was near the bottom of it
       * and every hour spent climbing was an hour spent earning less.
       * Compounding too, and a little slower than health, so a rung is still
       * harder than the one below it -- just no longer poorer.
       */
      /*
       * ---- 1.045 from build 300, and it is now FASTER than health -------
       *
       * The paragraph above says "a little slower than health, so a rung is
       * still harder than the one below it -- just no longer poorer". That
       * ruling was about the PER-BODY trade, and phase 2 moved where "harder"
       * lives: a rung is harder because it sends x21 the bodies at x5.6 the
       * rate, not because each one is tougher. Per body, a deep rung is now
       * deliberately EASIER (x3.83 health) and better paying (x8.4 salvage).
       *
       * Held slower than health it would have had to be about 1.02, and a
       * purse that moves x2.6 across forty-nine rungs cannot pay for a tree
       * whose deepest band prices a node in the millions. What has to hold is
       * the thing build 202's rule was protecting -- energy per point of
       * damage must not fall as you climb -- and 1.045 against 1.028 makes it
       * RISE, x2.2 by rung 49, which is the same direction that rule wanted
       * and further along it.
       *
       * `regress.mjs` asserts the ratio rather than the ordering now. An
       * ordering (`bounty < hp`) was only ever a proxy for it, and it is a
       * proxy that says the wrong thing the moment health stops being the
       * thing that climbs.
       */
      bountyStep: 1.045, // salvage x bountyStep^(tier-1), against hpStep 1.028
      /*
       * A surge pays half again on what that wave was worth, banked in one
       * lump at the turret. The ladder's own reward for the thing it most
       * wants to see: a wave cleared before the last of it landed.
       */
      margin: 1.5,
      /*
       * ---- the depth dividend ----
       *
       * A multiplier on everything banked, off how far the run has BEEN (the
       * peak, not where it is standing) and how many anomalies it has put
       * down. Deliberately fed into `earned` as well as the purse: `earned`
       * is the one clock, and depth ought to move it. Capped, because this
       * is a nudge toward the deep end and not a second economy.
       */
      dividendCap: 1.6,
      dividendPeak: 0.01, // per rung ever stood on
      dividendAnomaly: 0.05, // per anomaly reconciled
      /*
       * ---- `popCap` is GONE (build 300) --------------------------------
       *
       * It was the ceiling on population growth, at x3, reached at rung 20 --
       * so the last thirty rungs were carried by health alone, which is the
       * shape phase 2 inverts. Deleted rather than raised, because with
       * `popStep` at 1.0655 and the ladder's own `ceiling` at rung 49 the
       * curve tops out at x21.0 by construction: any cap at or above that is
       * a bound nothing can reach, which is the `world.endless` shape build
       * 186 spent a pass removing -- a constant threaded through readers that
       * can never take their other branch.
       *
       * What actually bounds the FIELD is not a cap on the ask. `emit`
       * refuses to release at all while `hostileCount(world) >= maxEnemies`
       * and HOLDS the job rather than dropping it, so the wave gets longer
       * instead of the screen getting fuller. That is a runtime gate on the
       * real number, where the old cap was a static guess at it.
       */
      /*
       * What counts as a wave going badly. All three are read off
       * instruments that already ran every frame before the ladder existed:
       * how long something sat on the turret, whether the director ever got
       * its field back, and how much of the wave was still alive at the end.
       *
       * Two consecutive failures step the tier back. One is allowed -- a bad
       * wave is a bad wave, and a ladder that flinches at one is a ladder
       * nobody can climb.
       */
      /*
       * ---- the four verdicts (build 201) ----
       *
       * There were two, and both of the ways to fail were "slow" rather than
       * "in danger": the ladder parked a maxed run where waves ran 28-37 s
       * with about 2.6 s of contact, climbing +1 per wave and falling -1 per
       * two, so a fall took six times a climb. Three numbers are read at the
       * end of a wave -- `t`, seconds from the last release to the field
       * thinning; `k`, seconds anything spent on the turret; and `c`, the
       * fraction of what was asked for that did not survive.
       *
       *   surge  t <= surgeWithin and k < surgeContact   +2
       *   clean  t <= cleanWithin and k < failContact    +1
       *   stall  anything else                            0
       *
       * `patience` still ends a wave; it is no longer itself the verdict --
       * it makes `t` infinite, which the table then reads.
       *
       * ---- and from build 210 the table cannot step back at all ----
       *
       * There were two ways down before it and both were verdicts at the END
       * of a wave: a streak of stalls until 208, and then `k >= routContact`
       * -- twelve seconds attached, totted up across a wave and cashed in
       * once the wave was over. A wave-end verdict is a bad instrument for
       * "you were in trouble": it arrives up to a minute after the trouble
       * did, it cannot be seen coming, and there is nothing to be done about
       * it once it is owed. A player who spent the first ten seconds of a wave
       * with something on the turret and then cleared the field perfectly was
       * already condemned and had no way to know.
       *
       * So the ladder no longer steps back on a verdict. It steps back on the
       * GLITCH TIMER, which is live, visible, and recoverable while it runs --
       * see `glitch` below. Every verdict here climbs or holds; -1 is not a
       * value this table can produce any more.
       */
      surgeWithin: 3, // cleared this fast after the last release: a surge
      surgeContact: 2, // ...and with less than this on the turret
      cleanWithin: 12, // the ordinary clear
      failContact: 6, // seconds with anything attached, during one wave
      /*
       * Less of the wave than this killed. It no longer DECIDES anything -- it
       * is the threshold the alert reads to say "most of it was still
       * standing" rather than "it took too long", so the reason names the
       * shape of the wave. AUDIT's third meter is the same number.
       */
      routBelow: 0.4,
      probeLock: 60, // seconds before another trial rung may be armed
      /*
       * ---- the gates (build 203) ----
       *
       * The seven anomalies were all built and none of them was on the
       * ladder: past band 5 nothing new was ever introduced, and the only way
       * to meet one was to buy an APERTURE from the tree. A gate rung is an
       * ordinary rung for waves -- the ladder simply will not CLIMB past it
       * until its anomaly is in `world.reconciled`. Standing on one lights the
       * banner at no energy cost. Nothing holds the world: the way is opened
       * when the player opens it, and stalls and routs still push down past a
       * gate, because going back was never the thing that had to be earned.
       *
       * Index i is anomaly n = i + 1; see ANOMALIES in anomaly.js.
       *
       * ---- and it is DERIVED, from build 299 ----------------------------
       *
       * One slot every `bossEvery` rungs to `ceiling`. That sentence is the
       * ruling; the table is the sentence rather than a copy of it, for the
       * reason written out beside `BOSS_EVERY` at the top of this file.
       * `check-build.mjs` asserts the derivation against the real roster.
       *
       * SEVEN entries against NINE anomalies, on purpose. AXIOM and TESSERA
       * are deferred, and an anomaly with no rung has no door at all: nothing
       * declares a rung on itself (see the header in anomaly.js), so `gateAt`
       * returns 0 for every rung, no banner ever lights, and `load()` bounds
       * its aperture restore by the roster rather than by this table -- an
       * aperture stored for either one by an older file is inert. Putting
       * them back is a deeper `ceiling` and nothing else.
       */
      bossEvery: BOSS_EVERY,
      /*
       * ---- the last rung there is (build 299) ---------------------------
       *
       * The ladder will not climb past it, through BOTH doors -- `climbTo`
       * refuses and `setTier` clamps -- because `setTier` is the machinery's
       * setter and does not gate, which is how build 272's era ceiling had a
       * second door standing open. Everything else goes on working: waves
       * arrive at the capped rung, they still pay, the tree still fills. What
       * stops is the number, and the run is told so in as many words.
       *
       * Deliberately a gate rung rather than one above the last one, the same
       * ruling `eraGate` carries: standing on 49 having reconciled the
       * seventh is the exact moment there is nothing left to be sent against,
       * and a rung of empty ladder above it would read as the game having
       * simply run out rather than as an end.
       */
      ceiling: DEPTH_CEILING,
      gates: rungsEvery(BOSS_EVERY, DEPTH_CEILING),
      /*
       * ---- and the one gate that is not an anomaly (build 272) ----------
       *
       * The seven above are opened by ANSWERING something. This one is opened
       * by BECOMING something: past this rung the ladder will not climb until
       * the field has actually turned over. Not until NEW FORM is bought,
       * which is only half of it, but until it has been TAKEN:
       * `world.newForm === 'done'`, which `endEvolve` writes and which a
       * restore at era 2 writes for a run that did it in a previous session.
       *
       * Everything else goes on working. Waves still arrive at the capped
       * rung, they still pay, the tree still fills -- what stops is the
       * CLIMB, which is the one thing on the other side of the change. A run
       * that is stuck here is a run that is being told what to spend on.
       *
       * It is deliberately a gate rung rather than one above it: standing on
       * the rung having reconciled the anomaly there is the exact moment the
       * first form has nothing left to be sent against, and a rung of empty
       * ladder between the two would read as the game having simply run out.
       *
       * ---- 42 -> 28, build 305 (phase 5) --------------------------------
       *
       * It was 42 from build 272 to 304, which is six of the seven gates and
       * five sixths of the ladder spent as the first machine. The change is
       * the middle of the game rather than its last act now: the run becomes
       * something else at 28, having answered four anomalies, and meets three
       * on the far side.
       *
       * THE RUNG ON THE HOLD IS STILL FIGHTABLE, and that is what makes this
       * work rather than deadlock. AMPLITUDE's gate IS 28, and NEW FORM asks
       * for four reconciled -- so if the hold refused the fourth aperture
       * there would be no way through, which is build 299's `recast: 7`
       * deadlock arriving again through a different door. It does not:
       * `syncGate` lights off `heldBy`, which reads the ANOMALY gate alone,
       * while `eraHeld` refuses only the CLIMB. The two are different
       * questions and the code already kept them apart. `check-build.mjs`
       * counts gates at or BELOW this rung for exactly that reason, and
       * `regress.mjs` asserts the pair, because this is a claim that reads as
       * obviously-broken-or-obviously-fine depending on which function you
       * happen to look at first.
       *
       * What it MOVES is two fights: DYNAMO (35) and PARITY (42) were era-1
       * fights and are era-2 fights now, on a field where a loose crossing is
       * 1481 world units against era 1's 962 and a body's own speed does not
       * scale with it. `anomalyEra` derives that from this number, so nothing
       * had to be re-declared -- and measured either side, see the notes.
       */
      eraGate: 28,
      /*
       * ---- traits (build 204) ----
       *
       * Where the ladder starts asking a different question rather than a
       * bigger one. Below `traitFrom` a wave is exactly what it says it is,
       * which is what the first ten rungs are for; from `traitPair` two rules
       * arrive together and the pair is its own problem.
       */
      traitFrom: 10,
      traitPair: 25,
      // ARMORED: how often the plate turns a hit away.
      plateEvery: 1,
      // MENDING: fraction of max health a second, and the window in which two
      // hits stop it. Two, not one -- a single stray round should not switch
      // off a rule, or MENDING is only ever a rule about the first wave.
      mendRate: 0.04,
      mendWindow: 1,
      // SWARM: twice the bodies at this fraction of the health.
      swarmHp: 0.5,
      /*
       * ---- the wave sheet (build 205) ----
       *
       * Two decisions about the wave that is running, rather than about the
       * turret. Neither goes on the ability strip: it is full at eight, and
       * these are not things the turret does -- they are things done to a
       * wave. Sealed until the run has stood on `sheetRung`, because that is
       * where the ladder starts asking questions worth answering.
       */
      /*
       * ...and the two nodes read THIS rather than restating it. It was a
       * third copy of a 10: `upgrades.js` authored `rung: 10` on RECALL and
       * on OVERCLOCK, this said 10, and the only reader of this was
       * `regress.mjs` -- so the suite's guard was calibrated against a value
       * the game never consulted. Edit the nodes and the case correctly goes
       * red; edit THIS alone and the case ALSO went red, reporting the nodes
       * as mis-sealed when nothing about the seal had moved. One owner now,
       * which is the `LOTS` / `ANOMALIES.length` / `rungsEvery` correction.
       */
      sheetRung: 10,
      recallCd: 60, // seconds
      recallClean: 0.75, // cleared at least this much and RECALL scores a clean
      overclockCd: 90,
      overclockGap: 0.5, // the release gap, halved
      overclockBounty: 2, // ...and the wave pays double
      overclockSurge: 6, // ...and a surge is six seconds rather than three
      // A lane fixes one trait for this many rungs past the gate that offered it.
      laneFor: 6,
    },
    /*
     * A flat multiplier on every authored count, on top of the swell. The
     * table stays readable as a set of shapes -- two BLOOMs and four MOTEs is
     * a legible thing to author -- and how heavy the whole run is stays one
     * number here. 1.3 as of build 111.
     */
    population: 1.3,
    /*
     * How much MORTAR one wave may author, from build 307: the total count of
     * HARMLESS entries in its `of`.
     *
     * Mortar is exempt from three bounds at once and so needs one of its own.
     * It weighs nothing in the budget (`threatOf`), it does not swell with it
     * (`Director.load`), and `hostileCount` -- which is what `maxEnemies`
     * gates the release on -- does not see it either. Drift has always been
     * outside all three and was bounded by `driftCap` instead; this is the
     * same bound for every other harmless type, asserted at the table by
     * check-build.mjs rather than clamped at runtime, because a count that
     * never swells is the number the author wrote.
     */
    mortarCap: 8,
    /*
     * ---- how much a body WEIGHS, in threat points (build 301) ----------
     *
     * Health divided by this, and nothing else. The plan asks for "roughly
     * its health over thirty plus what its mechanism is worth", and the
     * first half of that is DERIVED while the second is not written at all
     * -- because a mechanism bonus is 43 hand-authored numbers, which is the
     * shape that has cost this repo `world.apertures` sized 8 against 9
     * anomalies and a lot count restated in four places. A new type is
     * priced by existing.
     *
     * Measured against the plan's own anchors, health alone is close: MOTE
     * 1.03 against 1, BLOOM 8.2 against 7, SCION 13.0 against 12, BULWARK
     * 22.5 against 20. LURCHER derives 6.2 against a rough 4, which is the
     * one that diverges and is left diverging: a per-type bonus is a tuning
     * decision that wants the audit in phase 3c, not a guess now.
     *
     * TWO rules make it honest. `harmless` weighs ZERO -- which is why the
     * drift mortar can thicken the field without touching the budget -- and
     * a body that TOWS counts what it drags, because `release` makes the
     * pair and a probe that priced the head alone would be measuring 135
     * against the 415 the game actually sends.
     */
    threatPerHp: 30,
    // The next wave is allowed in once the field has thinned to a quarter of
    // what this one let out, floored at `clearTo`. Proportional rather than
    // fixed, or a fourteen-object wave would sit at the end of its patience
    // every time while a three-object one cleared instantly.
    thinFrac: 0.25,
    // Three or more of one type in a regular wave arrive together in formation
    // rather than filing in. Tutorial waves never do — they always file in.
    /*
     * ---- ...AND CROSSING IT USED TO COST THE WAVE MOST OF ITSELF --------
     *
     * A count at or above this is GROUPED into one job; below it the entry
     * becomes n singles. Three is low enough that any scaled count crosses
     * it, so until build 333 every deep-rung wave was grouped -- and
     * `Director.emit` takes the whole job off the list with `shift()`, so a
     * type it refuses to form up released ONE body and a formation larger
     * than the field's headroom released only what fit. Both dropped the
     * rest. Measured at rung 32: 1 to 3% of the TOW and pair bodies arrived
     * in the nine band-5 waves that carry them, and a mote job of 70 landed
     * 57 with the field held empty. `formable` and the re-queue are the fix;
     * the numbers and the reasoning are at `formable` in enemies.js.
     *
     * What it cost in play, measured after the fix -- the heaviest ordinary
     * wave of each band, at that band's own middle rung, fully bought,
     * against the 120s cap: band 1 5.0s (18 bodies), band 2 9.1s (15),
     * band 3 9.6s (37), band 4 31.8s (60), band 5 46.2s (137), every body
     * delivered and nothing left standing. Band 5's three pair and TOW waves
     * at rungs 29/32/35 read 25.6-68.0s. So the ladder pays about twice the
     * seconds it used to for its deepest waves and stays inside the cap.
     */
    formAt: 3,

    /*
     * ---- the glitch timer (build 210) ----
     *
     * The one thing in the game that puts a run back a rung without being
     * asked to, and the whole of what replaced the wave-end rout.
     *
     * Something reaches the turret and holds on. After `arm` seconds of that,
     * a fuse lights: `Director.glitch` climbs from 0 to 1 over `fuse` seconds
     * of unbroken contact and is drawn as a closing ring round the machine
     * with the seconds left inside it. Clear the turret and it falls back at
     * `recover` times that rate; get it to 0 and it goes out. Let it reach 1
     * and the simulation steps back: the field fizzles out over `fizzle`
     * seconds, the wave is abandoned unscored, and the ladder drops a rung.
     *
     * Why a live clock rather than a verdict. The rout it replaces added up
     * seconds of contact across a whole wave and cashed them in at the end,
     * so the punishment arrived up to a minute after the thing that earned
     * it, could not be seen coming, and could not be answered once it was
     * owed -- ten bad seconds at the top of a wave condemned a wave that was
     * then cleared perfectly. This is the same signal read the other way
     * round: it is in front of you the whole time it is running, and shooting
     * the thing off the turret is the answer to it.
     *
     * `fuse` is 14 rather than the rout's 12 because those twelve were a
     * total and these fourteen are consecutive: nothing survives fourteen
     * unbroken seconds on the mount that was not going to survive twelve
     * scattered ones. `recover` at 0.6 makes a clean turret worth more than
     * the contact cost, without making a tap of the trigger wipe the debt.
     *
     * Not to be confused with `CFG.glitch`, which is the screen effect. They
     * are wired together -- `glitch.perFuse` below feeds the shader off this
     * clock, so the picture comes apart as the timer runs down -- but one is
     * a mechanic and the other is a look.
     */
    glitch: {
      arm: 1.5, // seconds of unbroken contact before the fuse lights
      fuse: 14, // ...and how long it then has to run
      recover: 0.6, // fraction of the burn rate it comes back at, once clear
      fizzle: 0.9, // seconds a body takes to dissolve when it goes
      warn: 5, // seconds left when the ring starts reading as urgent
      /*
       * ---- and it fills while the next wave is HELD, at this rate ---------
       *
       * The fuse read one signal -- is anything on the turret right now --
       * and a run that had fallen behind could sit outside it indefinitely.
       * Measured either side of FLINCH and DEADBOLT, on the same tier with
       * the same gun over seven minutes: without them the mount was gripped
       * 22.3% of the time, the fuse blew SIX times and the ladder walked 20
       * down to 14. With them it was gripped 10.2%, the fuse blew ONCE, and
       * the run stayed pinned at 20 with between ten and twenty-nine hostiles
       * standing on the field the whole time.
       *
       * That is the automation doing its job and starving the rescue by doing
       * it: the two upgrades exist to break contact, and unbroken contact was
       * the only thing the fuse could see. So it reads the other half now --
       * `holdFor`, the seconds the director has spent unable to start a wave
       * because the field is still full -- and being drowned fills the same
       * clock as being gripped, at half the rate. One clock, one ring, one
       * verdict; there is still exactly one involuntary way down.
       *
       * Half, because the two are not the same emergency: something on the
       * mount is taking the turret apart now, a full field is a run that has
       * stopped moving. Twenty-eight seconds of a wave that cannot start says
       * the same thing fourteen seconds of contact does.
       */
      crowd: 0.5,
    },
  },

  // ---- debris ----------------------------------------------------------
  /*
   * Wreckage, as distinct from energy.
   *
   * Energy is the currency: small, bright, drawn to the turret, taken in by a
   * PULSE. Debris is none of those things — it is the object's structure
   * coming apart, and it does nothing at all. It is inert, it cannot be
   * collected, it cannot hurt you, it bounces off whatever it meets and it
   * leaves the field. It exists because a BULWARK breaking into two dozen
   * glowing collectables reads as a payout, and a BULWARK breaking into two
   * dozen tumbling plates reads as a BULWARK breaking.
   *
   * Only four objects shed it, and they shed a lot: the point is that it is
   * occasional and unmistakable when it happens, not a constant litter.
   */
  debris: {
    // The one grey on the field. DRIFT wears it, and wreckage fades into it.
    // Nothing that can hurt you is allowed anywhere near it.
    grey: '#8fa9c4',
    fade: 2.4, // seconds a chunk takes to lose the colour it came off
    speed: [140, 460], // thrown out at this, then left alone
    spin: 7, // radians a second, give or take
    drag: 0.22, // it slows, but it never stops and never settles
    life: 14, // seconds before one gives up, if it has not left already
    out: 240, // world units past the edge before it is forgotten
    max: 90, // on the field at once
    // Bigger than an energy mote by design: nothing about the two should
    // invite a second look to tell apart.
    size: [0.16, 0.34], // fraction of the parent's radius
    min: 5,
    cap: 15,
    // Shooting it. A chunk wider than `split` comes apart into `pieces`
    // smaller ones at `keep` of its radius; anything at or below simply goes.
    // `min` is under `split` on purpose — that is what makes the cascade
    // terminate rather than halving forever.
    split: 7,
    pieces: [2, 3],
    keep: 0.56,
    // A chunk cannot be broken for this long after it appears. Without it the
    // round that made the pieces is still travelling through them and breaks
    // them again the next frame, so one bolt pulverised a plate all the way
    // down — and the bolt that killed a BULWARK shattered all sixteen chunks
    // before they had cleared its body. A bolt covers ~180 units in this, so
    // by the time it lifts the round that caused it is long gone.
    grace: 0.12,
    wane: 0.7, // a piece of a piece does not last as long as the original
  },

  // ---- scion / graft ---------------------------------------------------
  // What a SCION leaves behind and what it does to whatever it reaches.
  //
  // Two at a time and no more, because the point of the object is the decision
  // it forces and three of them at once is not a decision, it is noise. They
  // are also held apart on release: two SCIONs side by side would seed the
  // same host twice and read as one event.
  //
  // A seed that reaches a host does not dissolve into it. It rides it, as a
  // ball you can see and shoot, and everything it gives is given per ball and
  // taken back when the ball goes.
  //
  // ---- A NUMBER ABOUT THE RING IS SHARED; A NUMBER ABOUT THE RIDER IS THE
  // ---- TYPE'S, AND THERE IS NO DEFAULT FOR IT ------------------------------
  //
  // Everything below is about the RING: how many may ride one host, where
  // they ride, how big a ball is and how fast the ring turns. A host has ONE
  // ring, and from build 322 two different kinds of rider can be on it, so
  // none of this can belong to either of them.
  //
  // What a RIDER is -- how long it has to find a host, how far it looks, and
  // what the host gets while it is aboard -- lives on the TYPE as `rides`,
  // and `ridesOf` in enemies.js THROWS for a `gait: 'ride'` type that does
  // not declare one. `grow`, `tough`, `regen`, `hp`, `life` and `hunt` were
  // all here until LATCH arrived wanting different numbers from SEED for
  // five of the six, and a second rider silently wearing the first one's
  // constants is exactly the fault build 319 needed a check-build guard for
  // (`plated` hard-wired to `CFG.flint`) and build 224 paid for eight times
  // over (`levels ?? 3`): a value inherited in silence is indistinguishable
  // from a value that was chosen.
  graft: {
    cap: 2, // SCIONs on the field at once
    apart: 320, // world units the second is kept from the first
    seeds: 3, // thrown when one is destroyed
    spread: 190, // how hard they are thrown clear before they start hunting

    // ---- the ring, shared by every kind of rider standing on it ----
    stack: 3, // most that can ride one host, whatever kind they are
    orbit: 1.45, // where they ride, as a multiple of the host's radius
    ball: 9, // a ball's radius, whatever arrived as one
    spin: 0.9, // radians per second the ring turns
    /*
     * A fully ridden body still takes a FIFTH of what reaches it.
     *
     * `armor` on a rider is a flat addition and `applyDamage` computes
     * `dmg * (1 - plate)`, so the sum has to be bounded or a ring makes a
     * body nothing can kill. The number follows from the rule rather than
     * from the day's arithmetic, and the arithmetic is why the rule is
     * needed: FLINT is the most armoured loose body in the game at 0.55 and
     * a LATCH gives 0.2, so a full ring of three reaches 1.15 -- every
     * frontal hit reduced to `applyDamage`'s `Math.max(1, ...)` floor.
     *
     * It is a LIVE clamp and not a guard against nothing: FLINT plus TWO
     * latches is already 0.95. `check-build.mjs` asserts both halves -- that
     * the cap is under 1, and that the worst unclamped case is over it, so
     * this is never quietly a door that cannot be opened (build 198).
     */
    armorCap: 0.8,
  },

  // ---- drift ----------------------------------------------------------
  // The harmless ones, and where they end up.
  //
  // Aimless is not the same as absent. On a pure random walk a body spawned at
  // the entry line is exactly as likely to wander up out of the field as down
  // into it, and nothing removes it — so they collected against the top edge,
  // half off the screen, where no shot could reach and nothing could be
  // learned from them. They are the first thing a run meets and they were
  // meeting it from off-camera.
  //
  // They still have no destination. They just sink while they have no opinion,
  // and they stop sinking here.
  drift: {
    /*
     * Where the grey objects LIVE, from build 298: a band across the middle
     * of the field, `band` of the way from the portal's rim to the machine
     * and `bandHalf` of that span either side of it. A drift born through
     * the portal comes down to it at `fall`, a drift knocked below it comes
     * back up at `climb`, and inside it the walk is a HOVER -- the random
     * walk's vertical component is `hover` of its lateral one, so it bobs
     * where it is rather than wandering off. The pull outside the band ramps
     * to full over `taper` units and overrules `sink` of the walk at full.
     *
     * A band was tried at build 78 and rejected because "the bottom two
     * thirds of the field had no grey in it". That is the design now, asked
     * for by name: drift floats to the middle and hovers there, and it never
     * goes back up through the portal -- which is the surface's rule, not
     * the walk's; see `edgeEase`.
     */
    band: 0.5, // the band's centre, as a fraction of rim-to-machine
    bandHalf: 0.16, // ...and its half height, as a fraction of the same
    fall: 300, // speed of the descent into it out of the portal
    climb: 90, // ...and of the climb back up when knocked below it
    taper: 110, // world units outside the band over which the pull reaches full
    hover: 0.45, // the walk's vertical share inside the band
    sink: 0.95, // how much of the walk the pull overrules at full
  },

  /*
   * EMBER's climb, from build 307. It starts on the floor and steers for the
   * portal's rim, and `gone` is how far ABOVE that rim it has to get before
   * it dissolves -- a margin rather than the rim itself, so the thing that
   * takes it off the screen is the same one-way surface every body else
   * meets, seen from the other side.
   *
   * It leaves through `fizzle`, which is the dissolve `Enemy.destroy` refuses
   * to cash in: an EMBER that reaches the rim pays nothing and counts
   * nothing, which is what "gone with whatever it was carrying" has to mean.
   */
  /*
   * ---- the RISE gait's clock, build 308 ---------------------------------
   *
   * A rise body is a TIMER the player may answer or not, so what is authored
   * is the CLOCK and the speed is derived from it -- the type's `climb`, in
   * seconds, against the column the body actually has to cross.
   *
   * Build 307 authored the SPEED instead and it was measured wrong twice over.
   * EMBER at 40 u/s (docs/objects.html's own number) is a twenty-four second
   * climb up era 1's 963-unit column; raised to 90 it measured **12.3s at era
   * 1 and 20.3s at era 2**, because the column is 1481 units there and a fixed
   * speed stretches by 1.54x with the field. So the one object whose whole
   * promise is "free salvage if you are quick" took twice as long on the new
   * field, silently, and LANTERN -- whose counter reads "about nine seconds of
   * climb" -- would have taken 37s at era 1 and 57s at era 2 at its own
   * authored 26.
   *
   * Derived, the clock is the clock at either era. `check-build.mjs` fails the
   * build for a `rise` type that declares no `climb`, because a defaulted
   * value indistinguishable from a chosen one is the shape that has already
   * cost this repo `levels` and `band`.
   */
  rise: {
    /*
     * The body is handed its climb speed at SPAWN rather than accelerating
     * into it, or the clock is a lie by however long the acceleration takes:
     * `accel / 100` is a rate, so LANTERN's 80 is a 1.25-second time constant
     * and two seconds of a nine-second climb would be spent getting going.
     */
    launch: true,
    gone: 30, // world units past the rim before it dissolves
    fizzle: 0.5, // how long the dissolve takes once it is away
    // Shared, and deliberately not per type: it has ONE reader and a second
    // number for the same look would be a table with two rows and no rule.
    sway: 26, // the lateral wander on the way up, in units a second
  },
  /*
   * LANTERN: a cage of salvage on its way back out through the portal, and the
   * one object in the game that costs you something for being ignored.
   *
   * The cost is `drops` motes plus the flat harmless bank. MEASURED, by
   * destroying one and reading the purse: **22,220 B**, against 0 for one
   * left to reach the rim. That is 16 motes at the `minValue` floor plus the
   * 6 kB `energy.drift` pays for any harmless body, through the intake tax --
   * about 9% of a band-4 level's 250 kB.
   *
   * Two things that arithmetic alone got wrong here, both caught by measuring
   * instead. The rung does NOT scale it: `scaleToTier` returns early on
   * `e.harmless`, so a harmless body's `bounty` stays 1 for ever and the
   * first estimate of 72 kB at rung 28 was three times too high. And the
   * DENSITY does not move it either: `shed` takes
   * `max(n * minValue, mass * perMass quantised)` and a 20-unit cage is far
   * under the mass of 4.44 where the second term wins, so `drops` is the only
   * dial this object has.
   */
  lantern: {
    cage: 5, // beads drawn inside it, the picture of what it is carrying
  },
  /*
   * ---- the BELL's ring, build 311 ---------------------------------------
   *
   * Shoot a BELL and for `ring` seconds every body on the field carries a
   * bearing tick: a short line out of it along its own travel, so what the
   * field is DOING is readable at a glance. A free instrument for one round
   * and one harmless kill, and the only thing in the game you spend
   * ammunition on to see better rather than to break.
   *
   * The tick is drawn AFTER the corruption shader and that is the whole
   * technical content of the object. Everything else in `Game.draw` goes into
   * `this.buffer`, which `glitch.present` then copies to the glass while
   * tearing it -- so a readout drawn with the field is torn exactly when the
   * field is worst to read, which CLAUDE.md already records about the glitch
   * counter. The tick is painted onto the real canvas instead, through the
   * world transform CAPTURED from the same frame rather than recomputed, so
   * it cannot drift from where the bodies were drawn.
   */
  bell: {
    ring: 2, // seconds the field stays legible after one is broken
    tick: 2.1, // the tick's length, as a multiple of the body's radius
    fade: 0.5, // the share of the ring spent fading out
    min: 9, // ...and a floor on its length in world units, for the small ones
  },
  /*
   * ---- the CHAIN gait, build 310 ----------------------------------------
   *
   * Seven beads nose to tail, each steering at the one AHEAD. The snake is
   * not an object with seven parts -- there is no owner and no roster -- it is
   * seven ordinary bodies each holding one reference, which is what lets a cut
   * in the middle leave two shorter snakes with no bookkeeping at all.
   *
   * The follow distance is DERIVED from the bead's own radius (`chainGap` in
   * enemies.js), not authored: `resolvePair` corrects any overlap with no
   * `harmless` exemption, so the hard floor is `2r + physics.slop` and a
   * constant that suited r 9 would stop suiting the first bead of another
   * size. `clear` is the headroom above `2r`, and it is measured rather than
   * picked -- the follower's proportional controller undershoots by about 8
   * units when its lead decelerates, so at `2r + 8` the gap touched 18.0
   * against a floor of 18.4 and the snake bumped itself. 12 puts the worst
   * measured gap clear of it.
   *
   * `mouthSlots` uses `r * 2 + 8` too, and that is NOT the same quantity: its
   * pitch is LATERAL, between bodies abreast in a row. Same form, different
   * axis; do not tie them together.
   */
  chain: {
    clear: 12, // headroom above 2r for the follow distance -- see chainGap
    life: 18, // seconds on the field before a bead dissolves
    fizzle: 0.6, // how long the dissolve takes once its clock is out
    weave: 0.9, // the head's lateral oscillation, radians a second
    sway: 150, // ...and how far it reaches for, in world units
    ahead: 220, // how far down the field the head aims
    // How hard a follower closes its own gap, per unit of error.
    grip: 1.4,
    /*
     * ...and the CEILING on what a bead may ask for, as a share of its own
     * cruise. This is not tuning, it is what keeps the snake from hurting
     * itself: `impactDamage` bites above a relative
     * `CFG.physics.collisionThreshold` of 62, and the correction used to be
     * capped at `cruise * grip` ON TOP of the lead's velocity -- so a bead
     * catching up could ask for about 125 u/s against a cruise of 58 and
     * clear the threshold against the floor or against another bead.
     * Measured with it uncapped, beads on an otherwise empty field dropped to
     * 0.957 and 0.595 of their health. At 1.0 the ceiling is the cruise
     * itself, so 62 is unreachable by construction rather than by margin.
     */
    catch: 1,
  },
  /*
   * HUSK's arc. It takes no steering at all -- the whole gait is the throw --
   * so these are the throw and the clock that ends it.
   *
   * `life` is the eleven seconds docs/objects.html promises it is on screen
   * for; the departure is that clock and not the far wall, because
   * `edgeEase` exists to stop anything reaching a wall and a gait that
   * fought it would be a gait arguing with the arena.
   */
  husk: {
    life: 11, // seconds on screen before it dissolves
    cross: 150, // the sideways throw it arrives with, in units a second
    fall: 60, // ...and the downward component of the same throw
    spin: 1.5, // radians a second, end over end
    fizzle: 0.7, // how long the dissolve takes once its clock is out
  },

  /*
   * ---- ROLL: the gait, and why it is not `tumble` (build 312) ----------
   *
   * `docs/objects.html` gives QUARRY the same `tumble` HUSK has, and a
   * hostile cannot take it. HUSK's tumble is BALLISTIC -- thrown from a side
   * wall with no propulsion at all -- and two things follow from that which
   * are fine for scenery and fatal for something you have to destroy:
   *
   *   - `CFG.physics.linearDamping` is 0.55, so the throw is 11% of itself
   *     four seconds in. A HUSK is allowed to coast to a halt because it
   *     dissolves at `life`; a hostile that coasts to a halt never arrives.
   *   - where it stops is wherever it stopped. A body resting at floor level
   *     out to one side is outside `autoTarget`'s 78-degree cone for ever,
   *     and from build 291 the release gate waits for the field to thin --
   *     so one unreachable hostile is a run that cannot climb again.
   *
   * So `roll` keeps the closing march every hostile takes and replaces the
   * ROUTE with it: no lane, a lateral that reverses at the side walls, and
   * the spin held against the angular damping the way `tumble` holds HUSK's.
   * What the player sees is the guide's picture -- a rock crossing the field
   * end over end, taking no lane -- and the wave can still end.
   */
  // ---- remnant --------------------------------------------------------
  /*
   * REMNANT, and everything here is a correction to the object guide rather
   * than a transcription of it.
   *
   * `docs/objects.html` says: "Destroyed, it drops nothing and leaves a mark.
   * Six seconds later it re-forms at the portal at half health and 1.4x
   * speed, once, and that second body pays for both. A kill that is not a
   * kill until the second one." Its counter reads: "Nothing, the first time.
   * The second arrival is the one to be standing ready for."
   *
   * ---- 1. THE SECOND ARRIVAL IS NOT SOMETHING TO BE READY FOR -----------
   *
   * Measured before a line of this was written, at the rungs band 5 is
   * actually played on (29 / 32 / 35) with the whole tree bought -- 109 buys,
   * which is all of it:
   *
   *   a full REMNANT   (300 hp, armour 0.12)   0.70 / 0.80 / 0.75 s to kill
   *   the re-formed body (150 hp, 1.4x speed)  0.53 / 0.58 / 0.53 s
   *
   * A fully bought turret sustains about 4,700 dps, so 170 effective health
   * is four hundredths of a second of FIRE: the half-second is almost
   * entirely the round's flight time, and the body dies on the first volley
   * that reaches it. It arrives with HALF the health of the thing that just
   * died, onto a field carrying 30-58 bodies at those rungs (build 301's
   * measurement). So the second arrival is strictly LESS of an event than the
   * first, and nothing about it needs standing ready for.
   *
   * ---- 2. "ONE OR TWO" IS A PROPORTION, NOT A COUNT ---------------------
   *
   * The guide authors `count: 'one or two'`. A wave's counts are a BUDGET
   * from build 301, and measured on band 5's own roster the budget swells an
   * authored wave 9.5x to 10.2x at rung 32 -- a band-5 wave queues 66 to 97
   * bodies. So `['remnant', 2]` is about TWENTY remnants in play, and any
   * reading of this object that depends on there being one of them is a
   * reading of a wave the game does not send.
   *
   * ---- 3. SO WHAT THE OBJECT IS, IS THE ACCOUNTING ----------------------
   *
   * What survives measurement is the sentence the guide leads with: a kill
   * that is not a kill. The first death pays nothing, counts nothing, and
   * does not let the wave end. That is a TEMPO cost rather than a damage one,
   * and tempo is what bites in a game whose releases are gated on the field
   * thinning (build 291). The twenty clocks run CONCURRENTLY, so the wait is
   * bounded at about one `back` per wave however many remnants are in it --
   * six seconds against a band-5 wave of 52 to 120 seconds, which is 5-10%.
   * A CEILING rather than the cost: the clocks start on their own deaths and
   * the deaths are spread across the wave, so what a wave actually pays is
   * `back` after the LAST remnant death and usually nothing at all. That is
   * the honest size of it and the codex line says so.
   *
   * ---- 4. AND WHAT IS RECORDED RATHER THAN TUNED ------------------------
   *
   * Two pacing figures, both inference on top of measurements rather than
   * measurements, and both deliberately left for phase 6/7 rather than
   * answered by re-authoring a number in a build whose content is one body.
   *
   * `speed: 36` DELIVERS 21.9 to 28.0 u/s, measured over twelve samples in
   * two runs, mean about 26 -- against an arithmetic steady state of 24.7,
   * because `drive` blends toward cruise at `k = accel / 100` against
   * `integrate`'s `linearDamping` 0.55 and the steady state is
   * `speed * k / (k + damping)`. (The spread above the arithmetic is the
   * route's lateral and `wobble`, which add to the speed's magnitude without
   * adding closing speed; the prediction is for a straight line.) That is
   * the rule this repo has now walked into seven times, and as with LATCH it
   * is NOT compensated here: nothing in this object is a clock or a ratio
   * between two speeds, so what matters is knowing the delivered figure
   * rather than grossing it up.
   *
   * Against era 2's measured 1481-unit column (build 306) that is about 57
   * seconds for the first body to cross, so modelling a wave's length as
   * release window plus slowest traverse plus the return tail makes the
   * remnant wave the LONGEST in band 5 at every rung and over the 120s cap
   * at all three sampled ones -- inference on top of measurements rather
   * than a measurement, and labelled as such. Band 5 already misses that cap
   * at four of seven rungs on the era-2 field (build 306), so this is a
   * small marginal worsening of a documented plateau; the lever, if it is
   * ever wanted, is `speed`, because the traverse is about half the modelled
   * length. Recorded here so the next pacing pass has the number.
   */
  remnant: {
    /*
     * What is SHARED by anything that comes back, against what belongs to the
     * body -- the split build 322 had to make for riders. `back`, `hp` and
     * `quick` are on the TYPE as `respawn` (see REMNANT in ENEMY_TYPES); only
     * the mark is
     * here, because a mark is how this game says "a return is pending" and
     * two types that came back should say it the same way.
     *
     * Note `hp` is read in TWO places wherever it lives: the body that comes
     * back carries it, and `threatOf` counts it -- because the health a
     * player actually shoots for one remnant is 300 plus 150, and a band that
     * thinks it is buying 300 is a band paying for two thirds of what it
     * gets. Same rule as a TOW counting what it drags and a QUARRY counting
     * what it becomes.
     */
    /*
     * ---- THE MARK'S LIFE IS `back`, AND A `mark` SHARE CAME OUT ---------
     *
     * A `mark: 1` stood here from build 324, documented as "how long the
     * mark it leaves stands, as a share of `back`" -- and `enemies.js`
     * writes `life: rs.back` with no multiplier, so the field had NO READER
     * and its value being the identity is the only reason nothing could tell.
     * Authoring `mark: 0.8` to shorten the mark would have changed nothing,
     * in silence, on a field whose entire docstring is about that share.
     * That is the `world.endless` shape: a constant threaded rather than a
     * branch taken.
     *
     * Deleted rather than wired, because the paragraph's own argument is the
     * reason to delete it -- the mark is the clock MADE VISIBLE, there is one
     * object and one owner, and a second number that could drift out of step
     * with the clock is the thing it was arguing against. The mark stands for
     * exactly `back` because it IS `back`.
     */
  },

  // ---- chaff ----------------------------------------------------------
  /*
   * CHAFF, and the whole object is two measurements that were taken before a
   * line of it was written.
   *
   * ---- 1. THE OBJECT AS docs/objects.html SPECIFIES IT DOES NOTHING -------
   *
   * The guide says the copies are read as targets and the assist "locks on,
   * for the second and a half each one lasts". It does not, and the reason is
   * arithmetic rather than a bug: `autoTarget` scores `dist * (attacking ?
   * 0.25 : 1)`, and a copy dropped where a CLOSING body used to be is
   * strictly FURTHER from the machine than the body that dropped it.
   *
   * Measured on a stand-in before any of this existed -- thousands of samples
   * over one chaff -- a ghost was nearer than its own owner ZERO times, the
   * closest ratio being 1.005. With the counts the game actually sends (3 and
   * 8 chaff, 12-14 concurrent copies, 900-1200 frames, three trials each) the
   * assist locked a copy for ZERO frames in every run whose owners lived; with
   * mortal chaff it locked one 5.8-10.2% of the time and every one of those
   * frames was a frame the copy's owner was ALREADY DEAD. So the face-value
   * object is a reticle lagging a second and a half behind a corpse.
   *
   * And the hysteresis makes it worse rather than better. `aimStick` 1.15
   * means a held target keeps the lock until something is 1/1.15 = 0.8696 of
   * its distance -- measured by bisection, kept at 0.87 and switched at 0.86 --
   * so the thing it protects is the body that just hopped AWAY. Measured over
   * 45 (offset, hop) arrangements in the real sequence (locked on the chaff,
   * chaff hops, ask again): the copy took the lock in 3 of 45, and all three
   * were hops both strongly outward and flat, which a descending body does not
   * make.
   *
   * So the copy INHERITS the lock at the instant of the leap -- see
   * `Game.autoTarget`, which is the one place in the game a ghost is visible.
   * That is also the honest reading of the fiction: the assist was aimed at a
   * point, the thing at that point is now the copy, and `aimStick` then holds
   * it there instead of fighting it.
   *
   * ---- 2. A RADIAL HOP IS INVISIBLE TO THE GUN ---------------------------
   *
   * Measured, 100 rounds an arm, three trials, against a MARCH control moving
   * at the hop's own mean speed: with the hop straight down the field the miss
   * share is 0.000 at 200, 300 AND 450 units -- identical to the control. A
   * quantised body's lead error lies ALONG the line of fire and
   * `resolveSegment` sweeps the round's whole step, so it costs nothing at
   * all. Only the LATERAL component costs anything: at a lateral-to-drop
   * slant of 0.6 the miss share is 0.107 at 300 and 0.620 at 450; at 1.2,
   * 0.240 and 0.797; at 2.0, 0.263 and 0.770, saturated. The control read
   * 0.000 in all twelve arms, so the miss is the quantisation and nothing
   * else.
   *
   * Hence `leap` is twice `drop`: a slant of 2.0, in the saturated region,
   * because the object's counter is "aim it yourself" and a gait the gun does
   * not notice is not that object.
   */
  chaff: {
    leap: 100, // units ACROSS the field a hop covers
    drop: 50, // ...and units DOWN, so the slant is 2.0 -- see above
    /*
     * Seconds a leap takes. The guide says "three frames" and this game has
     * no such unit: `CFG.fixedStep` is 1/120 and `steer` runs per substep, so
     * a frame-counted hop runs twice per frame at 60Hz and once at 120. It is
     * a DURATION with the speed derived from it, which is build 308's rule for
     * a `rise` clock applied to a leap.
     */
    leapT: 0.05,
    /*
     * Seconds a copy is left standing. The guide's number, and it is the one
     * figure of the object a player can feel: the reticle sits on a thing that
     * is not there for this long.
     */
    ghost: 1.5,
    /*
     * How near the machine it stops hopping and simply walks.
     *
     * Derived, not chosen, and it is SHRIKE's lesson from build 317: the
     * turret is static, so `impactDamage`'s reduced mass against it is the
     * body's WHOLE mass clamped at 300, which kills anything under that at any
     * relative speed over the threshold. A leap covers 111.8 units at about
     * 2,200 u/s, so a landing anywhere inside the overlap is a death sentence
     * -- and the exit from a hop is a clock rather than a position, so nothing
     * else would have caught it. The guard is the overlap it must not enter
     * plus the reach of one whole leap, so a hop can never land inside it.
     */
    walkPad: 8, // added to (e.r + s.r + grabPad) + one leap
    /*
     * How bright a copy is at the instant it is left, fading to nothing over
     * its life. Low on purpose: the object guide's own art draws its three
     * ghosts at 0.39, 0.26 and 0.13, and the thing a player has to be able to
     * tell apart is the REAL body -- a copy as bright as its owner is not a
     * decoy, it is four bodies.
     *
     * Rendered and measured rather than eyeballed, off an offscreen canvas at
     * the field's own scale: a copy peaks at 154 of 255 at birth and 129 / 99
     * / 67 / 39 at a quarter, a half, three quarters and 0.95 of its life,
     * against the body's own 230. So it is two thirds of the body at birth
     * and a sixth at the end -- visible, clearly the same shape, and clearly
     * the fainter thing, which is the three properties the object needs.
     */
    ghostAlpha: 0.42,
  },

  roll: {
    /*
     * ---- the lateral is a tangent on the REMAINING DEPTH -----------------
     *
     * `routeLateral` hands `drive` a perpendicular OFFSET to the aim point,
     * so what this number multiplies decides the shape of the whole gait,
     * and two of the three candidates were measured and thrown away:
     *
     *   - a CONSTANT offset is a bearing tilt of `atan(offset / d)`, which
     *     grows without limit as the body closes -- 25 degrees at 400 units
     *     out and 62 at 100. That is a body that orbits the machine rather
     *     than arriving at it, and it is why every route folds its own
     *     offset off across the last stretch.
     *   - scaled by `d`, the DISTANCE to the machine, the tilt is constant
     *     and the path is a logarithmic spiral: measured, the body swings out
     *     187 units from the middle of a 629-wide field and then converges,
     *     from three different starting columns, and never reached a wall at
     *     all. The bounce would have been a branch nothing could take.
     *   - scaled by the remaining DEPTH it is both. High up the tilt is 36.9
     *     degrees off the bearing and the bearing is itself diagonal from out
     *     to one side, so the two add and the body crosses hard and turns off
     *     the walls; at the floor line the term is zero and it converges on
     *     the machine, which is the fold routes already do.
     */
    /*
     * 1.3, chosen off the sweep above rather than by eye: it is the number of
     * TURNS that the factor buys, and the cost is the arrival. Measured from
     * the rim at two starting columns -- 0.75 gives 0 to 1 turn and arrives
     * in 42-44s, 1.1 gives 1 and 55s, 1.3 gives 1 to 2 and 61-68s, 2.0 gives
     * 3 and 76-94s. The guide's picture is about 1.8 crossings; 1.3 is the
     * cheapest factor that always turns at least once. It is scale-invariant
     * across the two eras by construction, because the displacement goes with
     * the column and the field's width goes with the same zoom.
     */
    slant: 1.3,
    // ...and where it turns is NOT here: it is `CFG.physics.edgeEase`, which
    // already forbids a body to reach a side wall. See Enemy.rollOn.
    spin: 2, // radians a second, held as a floor -- see Enemy.rollOn
  },

  /*
   * ---- PAIRED: two bodies, one beam, and ONE POOL OF HEALTH -------------
   *
   * YOKE is the first thing in this game whose health is not a property of a
   * body. The two halves share a pool: damage to either drains the same
   * number, so focusing one half does not kill it any faster -- and that is
   * the whole object, because WHERE the damage lands still decides what you
   * are left with.
   *
   * `snap` is the share of the pool that, landed on ONE half, takes that half
   * off the beam. At 0.5: spread your fire and the pool empties with neither
   * half having absorbed half of it, so both go at once; put half the pool
   * into one and it snaps off with the other half still standing -- in a
   * single body, unencumbered, at `alone` times its speed. The total damage
   * to destroy a pair is the same either way. What differs is whether you
   * finish facing nothing or facing something fast.
   *
   * ---- ...and this is a reading of the guide, not a transcription -------
   *
   * `docs/objects.html` says "they share one pool of 150 health. Kill one and
   * the beam breaks -- and the survivor keeps the whole remaining pool". Read
   * literally those cannot both hold: if every point of damage drains one
   * shared pool then draining it kills both, and there is no "remaining pool"
   * for a survivor to keep. The `snap` share is what makes every sentence of
   * that paragraph true at once, including the counter ("take them together
   * with something that reaches both... focusing one half is the trap").
   * Recorded here because the next reader will have the guide open.
   */
  /*
   * ---- `CFG.yoke` IS GONE, AND THE NUMBERS ARE ON THE TYPES (build 332) --
   *
   * It held `len`, `spin`, `grip`, `snap` and `alone`, and `pairOn`,
   * `pourPool`, `drawYoke` and `pairOf` all read it BY NAME -- so LOOM, the
   * second `paired` type, would have worn YOKE's beam length, rotation rate,
   * grip, pool share and survivor speed in total silence, with no field to
   * set and nothing to fail. Not one of those five numbers is the GAIT's:
   * they are all facts about one pair.
   *
   * That is the sixth instance of this exact shape -- `plated` reading
   * `CFG.flint` (319), `ride` reading `CFG.graft` (322), `respawn` (324),
   * `planted` (328) and `bar` reading `CFG.cartwheel` (330) -- and the
   * second found BEFORE it did any damage, because the new type was authored
   * against the block. The rule build 330 stated holds: a number about the
   * GAIT is shared, a number about the BODY is the type's. So each pair type
   * carries its own `bond` block, `pairOf` throws for a missing or malformed
   * one, and `check-build` holds it in both directions.
   *
   * YOKE's five numbers are unchanged to the digit and the ORDINAL hash is
   * what says so.
   */

  /*
   * ---- A PLATE ON ONE FACE, AND A BODY THAT KEEPS IT POINTED AT YOU -----
   *
   * FLINT carries `armor` 0.55 on its FRONT FACE and nothing anywhere else,
   * and it turns to keep that face toward the barrel. `docs/objects.html`
   * calls it "the first body that makes the field have sides".
   *
   * ---- WHICH FACE WAS HIT IS ALREADY THREADED EVERYWHERE ---------------
   *
   * `applyDamage(world, dmg, nx, ny, ...)` takes the direction the damage is
   * TRAVELLING, and all seventeen callers already pass it -- a round's own
   * heading from `takeHit`, the outward normal from `applyBlast`, the beam
   * direction from PRISM and LANCE, the cut from WIRE. So the plate needs no
   * new argument and no new geometry: `-(n . facing)` is +1 for a hit dead on
   * the front, 0 from the side and -1 from behind.
   *
   * FIVE callers pass `0, 0` and therefore meet no plate at all: contact,
   * ARC's chain, a `Patch`'s bite, HARD CASING and TITHE's bonus. That is a
   * consequence and not an oversight -- a hit with no direction cannot be
   * asked which face it landed on, and the code must not invent one. It also
   * reads correctly against the guide's counter, which is mines, blasts from
   * behind and ricochets.
   *
   * ---- ...AND THE TURRET IS STATIC, WHICH IS THE WHOLE DESIGN ----------
   *
   * A body that turns to face the barrel presents its plate to GUNFIRE
   * always: there is no angle for the gun to find, because the gun cannot
   * move. So the answers are the ones the guide lists -- ground it walks
   * over, a blast up-field of it, a PRISM ricochet -- and 0.55 is a
   * reduction rather than a refusal, so the gun is slowed and not stopped.
   * Note the guide's counter also names "an emplacement standing off to one
   * side", which this game has not had since `CFG.gun.inPlay` went false at
   * build 289; the codex line does not promise it.
   */
  flint: {
    /*
     * The cosine of the plate's half-arc. 0.6 is about 53 degrees either
     * side of dead ahead, which is the arc the guide's own drawing sweeps
     * (-2.5 to -0.64 radians about the leading face). Authored as the cosine
     * because `applyDamage` runs tens of thousands of times in a boss fight
     * and the alternative is a `Math.acos` on that path; `check-build` prints
     * the degrees so the number is readable.
     */
    front: 0.6,
    /*
     * Radians a second it slews to keep the plate on the barrel.
     *
     * The first draft of this docstring said the window this leaves "after
     * something spins or shoves it is the only way the gun ever sees a side",
     * and MEASURED there is no such window. `Enemy.face` writes `av = 0` for
     * a plated body on every frame, one call above `integrate`, so build
     * 211's impact spin never reaches `angle` at all -- a bolt at maximum
     * lever moved a flint 0.0000 radians. Nor can a shove open one: PULSE's
     * impulse is radial from the machine, which changes the range and not the
     * bearing. And the tracking error a marching body demands is
     * `v_perp / d` -- at most 0.21 rad/s at the 210-unit standoff -- so 1.6
     * is seven times what holding the plate on the barrel actually costs.
     *
     * What the number really governs is the ARRIVAL: the constructor rolls a
     * random `angle`, so a flint takes up to `PI / turn` = 1.96s to come
     * round once it is loose, which is the one genuine window and is spent at
     * the top of the field outside `aimRange`. Slowing it further is the
     * lever if that window ever wants to be worth something; it is NOT a
     * lever on the side of a body under fire, because nothing in the game can
     * turn one.
     */
    turn: 1.6,
  },

  /*
   * ---- DIVE: fast on the run, slow on the way back ---------------------
   *
   * SHRIKE holds height across the top of the field, picks a lane, runs down
   * it at `dive`, passes the machine, overshoots to the floor and climbs back
   * for another. The object is the ASYMMETRY: `docs/objects.html`'s counter
   * is "it is only fast on the dive -- kill it in the climb, or stand a mine
   * on the line it is going to use", so the lane is chosen where it can be
   * seen being chosen and is KEPT for the life of the body.
   *
   * ---- ...AND IT GOES PAST THE MACHINE, NOT THROUGH IT ------------------
   *
   * The guide says "runs straight down THROUGH the machine". Nothing in this
   * engine can: the turret is static with `invMass` 0, so `resolvePair`
   * separates positionally and `impactDamage`'s reduced mass against a static
   * body is the body's FULL mass, clamped at 300 -- which is death for
   * anything under 300 health at any speed over the 62 threshold. Measured,
   * driving a 70-health body down the turret's own column at 210 u/s:
   * **dead at frame 83**, every time, and never past the machine. `plow`
   * does not save it and says so in its own guards, which name the turret as
   * one of the two things it must never pass through. Slowed under the
   * threshold it survives and is stopped dead 36 units above the mount.
   *
   * So the lane is DERIVED from the two rules it would otherwise fight: the
   * overlap it must not enter (`e.r + s.r`) and the grip band it must reach
   * (`+ CFG.shooter.grabPad`). Measured across lanes 0/38/40/41/42/44/48/56
   * with the body's x PINNED: 0 dies, 38 to 42 grip and lose nothing, 44 and
   * out never grip. There is no constant here for that reason; see
   * `diveLane`.
   *
   * ---- ...AND IT SITS IN THE MIDDLE OF THAT CORRIDOR, NOT ON ITS WALL ---
   *
   * The first version put the lane at the grip band EXACTLY, which is the
   * wall: `checkContact` grips on `dist <= band`, so at a horizontal offset
   * of exactly `band` the test passes at a single point and a real body's
   * drift decides whether the pass delivers anything. Measured, grip frames
   * over one 40-second run: 18 at `wobble` 0.12 and 439 at `wobble` 0 -- a
   * twenty-four-fold swing on a term that has nothing to do with the
   * mechanism, which is the tell that the payload was luck and not geometry.
   * Half a pad inside it, the corridor has a unit either side and the grip
   * is earned by the derivation.
   *
   * The corridor is `grabPad` = 2 units wide and a real body cannot hold two
   * units to the unit, so a pass ALSO scrapes the overlap: about 11 of 70
   * health, six passes' worth. Both facts are consequences of the same two
   * units and the assertions state both -- an earlier draft of this block
   * claimed the lane "takes nothing at all", which was the pinned sweep's
   * figure being quoted for a body that moves.
   */
  shrike: {
    /*
     * DELIVERED units a second down the lane, not a target. `drive` blends
     * toward its target while `linearDamping` and the blend's own accel term
     * pull back, so a raw 210 arrives as 181 -- the fault this repo has now
     * paid for four times (the portal ramp at 298, the rise clock at 308,
     * the yoke's spin at 316). `diveOn` grosses it up by those two terms and
     * the CASE is on what came out.
     */
    dive: 210,
    /*
     * ...and the way back, in DELIVERED units a second too -- an absolute and
     * not a share of its walk, because the two are independent quantities and
     * the object is the RATIO between them. Measured as a share it was 0.75
     * of a 41 u/s walk, which is 26.6 delivered against an 858-unit column:
     * a THIRTY-SECOND climb, one dive in forty seconds, and a body that is
     * very nearly scenery. At 80 the climb is about eleven seconds against a
     * four-second dive, so the asymmetry the counter promises is 2.6x and the
     * window to answer it is most of the cycle.
     */
    climb: 80,
    hold: 90, // how far below the portal's rim it patrols between runs
    dwell: 1.4, // seconds it holds a chosen lane before committing to it
    /*
     * How far OUT of the lane it climbs. It cannot come back up the lane it
     * dived down: the lane is the grip band by construction, and the climb is
     * the slow half, so a body returning up it would grip the machine for the
     * whole of its one vulnerable phase. "Climbs back ROUND for another" is
     * the guide's own word for this.
     */
    swing: 150,
    /*
     * How far AHEAD along the lane the dive steers. Aiming at the far floor
     * makes `dx/|d|` vanishingly small, so lateral error is never corrected:
     * build 317 committed within 14 units of the lane and the pass measured
     * an error of 17 -- it diverged. A point a fixed distance ahead keeps
     * real lateral authority the whole way down, which is what lets the
     * commit tolerance be a steering tolerance rather than the corridor's
     * own width.
     */
    look: 150,
    /*
     * ...and the tolerance the commit uses, as a share of the body's radius.
     * `grabPad` was tried and is the wrong quantity: two units is a
     * GEOMETRIC width and a body whose heading wobbles cannot hold it for
     * `dwell` even with the clock bleeding -- measured, both bodies of the
     * shipped wave recorded zero dives. The dive's own aim-ahead is what
     * brings it onto the lane over the 660 units above the mount.
     */
    gate: 0.5
  },

  /*
   * CARTWHEEL: the ordinary march, plus a spin that is HELD.
   *
   * The gait is the smallest of the six -- it takes its route like anything
   * else and the only thing it adds is the turn -- and it exists because the
   * turn is the whole of SPINDLE's design: the bar's profile against the
   * barrel changes continuously, so when you fire decides whether you hit.
   * Held as a floor rather than written, for `tumble`'s measured reason:
   * `integrate` damps angular velocity on every substep, so a spin handed
   * over at a spawn site is 0.27 of a turn in eleven seconds.
   *
   * Two thirds of a revolution a second, which is `docs/objects.html`'s own
   * figure: 4.19 rad/s, so a broadside comes round every 0.75s.
   */
  cartwheel: {
    /*
     * ---- THE GAIT'S NUMBER, AND ONLY THE GAIT'S -------------------------
     *
     * This block held the BAR'S SHAPE as well until build 330, as
     * `long` / `thin` -- and it was right about everything except whose the
     * shape is. The ratios-of-`r` argument stands and is now on the type
     * (see SPINDLE's `bar` block): THREE things read a capsule's shape -- the
     * hit test in `resolveSegment`, `hitReach` (which is what tells the sweep
     * to look outside `r` at all), and the DRAWING -- so it has one owner,
     * written as multiples of the radius rather than as units.
     *
     * What made the old home wrong is that a SECOND bar type reads it.
     * VEIL's membrane is 104 x 12 at r 52, i.e. 1.0r and 0.115r; SPINDLE's
     * is 1.6r and 0.183r. With the shape in the GAIT's block a veil would
     * have been tested as a 166-unit spindle, silently, with no field to set
     * and nothing to fail -- `plated` (319), `rides` (322), `respawn` (324)
     * and `planted` (328) are the same shape, and `levels ?? 3` (224) is
     * where the rule comes from. **A number about the GAIT is shared and a
     * number about the BODY is the type's**, which is build 322's ring/rider
     * split applied to a shape.
     *
     * So what is left here is the spin, which really is the gait's: it is
     * how fast a cartwheeling body turns, and any type taking that gait
     * turns at that rate.
     */
    spin: 4.19,
  },

  /*
   * ---- SPREAD: the gait of a thing that is covering ground ---------------
   *
   * `docs/objects.html`: "Goes wide before it comes down, taking the widest
   * lane it can find. It is trying to cover ground, not reach you." Two
   * numbers, and both are derived rather than chosen.
   *
   * `slant` is LATERAL PER UNIT OF DEPTH, off the guide's own path for this
   * gait: it moves 0.34 of the width across while descending 0.2 of the
   * depth, which at era 1 is 214 units sideways against 245 down -- 0.87,
   * and NOT the 1.7 those two fractions read as, because the field is nearly
   * twice as deep as it is wide. A fraction of a field is not a distance.
   *
   * `look` is the floor on how far ahead the aim point sits, and it is
   * SHRIKE's finding (build 318) rather than a taste: a body steering at a
   * point far down its own column has almost no lateral authority, because
   * `dx / |d|` vanishes. So the aim point is `max(look, gap / slant)` below
   * the body -- the slant while there is a gap to cross, and a point 150
   * units down the column once there is not.
   *
   * `lanes` is ODD on purpose. The candidates are spread evenly across the
   * band the body can actually stand in, so an odd count puts one exactly on
   * the machine's own column -- which is the lane the first sheet takes,
   * because a sheet nearer the middle covers more of the assist's cone. See
   * `sheetLaneFor`.
   */
  spread: {
    slant: 0.87, // lateral per unit of depth while crossing to its lane
    look: 150, // ...and how far ahead it aims once it is on it
    lanes: 7, // candidate columns, odd so the machine's own is one of them
  },

  /*
   * ---- SERPENT: a weave whose amplitude GROWS with depth -----------------
   *
   * MIRE's gait, and the reason it needed a new word rather than a route.
   * `ROUTES` already holds a "serpentine" (width 250, weave 0.55) and that is
   * the thing not to mistake this for: `routeLateral` scales every route's
   * offset by `reach = (d / 520k) ** commit` and `closing = (d - 170k) / 210k`,
   * BOTH of which go to zero as the body closes -- so every route in the game
   * FOLDS IN, and no combination of width, weave and commit can invert a
   * monotone factor. This one opens out.
   *
   * The amplitude is a share of the field's HALF-WIDTH, interpolated on the
   * body's own depth between the entry line and the mount, so it is scale-
   * invariant across the two eras the way `roll`'s slant is.
   *
   * `sway` is the peak speed of the lateral TARGET as a share of the body's
   * own cruise, and the weave rate is DERIVED from it and the amplitude
   * (`omega = sway * cruise / amp`) rather than authored. KITE paid for the
   * other way round at build 335: a sinusoid authored in radians a second
   * against an amplitude in units is a target the body cannot reach, and what
   * you get is a lag rather than a weave. Under 1 so the crossing still
   * closes: the weave is what it does on the way, not instead of arriving.
   */
  serpent: {
    /*
     * MEASURED, not chosen. Swept 0.5/1.0/1.6/2.4/3.2 over a whole crossing,
     * counting the half-cycles and the widest offset the body actually
     * reached:
     *
     *   sway  half-cycles  widest
     *   0.5        1        144
     *   1.0        2        187
     *   1.6        3        142
     *   2.4        4        108
     *   3.2        5         85
     *
     * 1.0 is both ends of the answer at once: it is where the swing is WIDEST
     * -- past it the body can no longer track the target and the lag eats the
     * amplitude, which is the failure KITE's `sway` was authored to avoid --
     * and it is the guide's own cycle count, its illustrative path being
     * `sin(7t)` across the crossing, which is 7 radians and therefore about
     * 1.1 full cycles. A weave nobody can see is not this object: at 0.5 the
     * body completed ONE half-cycle in a 39-second crossing, which reads as a
     * drift rather than a weave.
     */
    sway: 1,
    ampRim: 0.06, // barely a weave as it comes through the mouth...
    ampFloor: 0.34, // ...and a third of the half-width by the time it arrives
  },

  /*
   * ---- MIRE's GROUND, which is what the object actually is ---------------
   *
   * It does no damage at all -- that is the core of the design and not a
   * detail -- so what the stain takes is the PAY: salvage that comes to rest
   * in it is eaten, marked `dead` and `dissolved` so it never scores and
   * never reaches the purse. The primitive is shipped: `Enemy.feed` is a GLUT
   * doing exactly this to `world.drops`, under the comment "eaten, not
   * destroyed: it must not score".
   *
   * All three of the payloads the object guide authored were measured EMPTY at
   * build 339 and the re-spec is on MIRE's own card: a mine's arming time
   * (`CFG.mines.inPlay` false since 289), a DECOY's decay (a purchase at 37.5%
   * duty and 0% unbought), and "the intake pulls at half rate" -- which is
   * dead in all three of its readings, the sharpest being that
   * `CFG.energy.pull` is measurably inert: drops are STEERED as well as
   * pulled, so mean distance closed in three seconds reads 268.1 at the full
   * pull, 248.5 at half and 265.9 at ZERO.
   *
   * THE NUMBERS ARE ON THE TYPE, as a `stain` block, and this paragraph is
   * all that lives here. A number about the GAIT is shared and a number about
   * the BODY is the type's -- build 330's rule, arrived at after five separate
   * builds paid for the other way round: a second `plated` type would have
   * worn `CFG.flint`'s arc, a second `ride` type `CFG.graft`'s growth, and
   * the same for `respawn`, `planted` and `bar`. A second body that lays
   * ground wants its own radius and its own clock, so those go on the type and
   * `stainOf` throws for a `serpent` type that declares none. What stays
   * shared above is the weave, which really is the gait's.
   */

  /*
   * ---- STANDOFF: the RANKS, which is the gait's and not any type's -------
   *
   * The station's HEIGHT is `standHeight` and is derived from the machine's
   * own reach; the slide and the throw are the type's (`lob`). What is left
   * is how a standing crowd is PACKED, and that is neither -- it is one rule
   * for any type that holds a line, so it lives here.
   *
   * ---- ONE LINE CANNOT HOLD A SWELLED COUNT ------------------------------
   *
   * Build 301 made a wave's counts a BUDGET, so an authored three is 17
   * bodies at rung 20 and 43 to 57 at rung 35 -- and every body of a type
   * derives the SAME station. A line 264 units wide holds six 40-wide
   * bodies. So a standing body takes a SLOT -- a column and a RANK --
   * claimed once on its first loose frame and held. Rank 0 is the derived
   * station and each rank behind it stands `2r + clear` closer, which is
   * `chainGap`'s form and `mouthSlots`' pitch (the same shape, deliberately
   * not the same constant -- build 310). The front rank holds the edge of
   * what the assist can reach and the ranks behind it stand closer, so they
   * are easier, which gives the player an order to clear them in.
   *
   * ---- AND THE MOTIVATION IN THIS DOCSTRING WAS MEASURED AGAINST A
   * ---- STATION THAT NO LONGER EXISTS, WHICH IS WORTH RECORDING -----------
   *
   * It said, with a table, that without ranks the excess piles DOWN onto the
   * machine: `|y - station|` 97 to 181 mean and the worst body PAST the
   * mount at era 1. That was true, and it was measured against the FIRST
   * station, which ran straight down the machine's own column. Correcting
   * the station onto the reach CIRCLE (see `standWall`) moved it 102 units
   * further out -- and re-measured with ranks against one rank, same field,
   * same count, rungs 29/32/35:
   *
   *   ranks     grip 0  deepest 202-358 clear of the grab band
   *   one rank  grip 0  deepest 290-327 clear
   *
   * **Neither piles onto the machine any more.** So the ranks are NOT what
   * keeps this object's promise at the rungs its wave is played on; the
   * station is, and `standWall`'s own bound on the rank count is the belt.
   * What the ranks still do is real and smaller: the allocator needs a slot
   * space wider than one rank, or every body past the eleventh is sent to a
   * place another body already holds -- which build 336 made a SPREAD rather
   * than a pile (`standSlotFor` takes the least-occupied slot now), so with
   * one rank the same 57 bodies sit five to seven deep where the ranks put
   * them one or two; and the crowd comes out wider and
   * shallower (y spread 148-219 against 182-259, overlaps per body 0.94-1.77
   * against 1.82-2.22), so it reads as a line rather than a knot. Rendered
   * both ways at thirty bodies, the difference is visible and modest.
   *
   * Recorded rather than quietly rewritten, because the fix for the fault
   * this docstring described is the one that made the docstring wrong, and
   * that is exactly the shape this repo keeps paying for.
   *
   * `clear` is the gap between two standing bodies' surfaces. It has to
   * exceed nothing in particular -- `resolvePair` parks two touching bodies
   * at `2r - slop` -- but a rank packed at exactly `2r` is a rank the solver
   * is always correcting, and the drift would then read as a shuffle.
   */
  ranks: {
    clear: 8, // gap between two standing bodies, on both axes
  },

  /*
   * ---- FLOCK: the gait, and every term is a multiple of the body's own r --
   *
   * A school has no leader and no roster. Each body reads the mean position
   * of the bodies sharing its `shoal` serial and steers a fraction of the way
   * toward it, and pushes off whichever one is nearest -- so the shape of the
   * school is not authored anywhere, which is the same reason a FILAMENT's
   * snake is not (build 310). The cohesion offset is added to the aim point
   * the way a route's lateral is, so the closing march is untouched: a
   * hostile has to arrive, which is the rule `roll` already paid for.
   *
   * The two distances are MULTIPLES OF `r` rather than units, so a second
   * flocking type of another size is covered by existing -- the same reason
   * `chainGap` is `2r + clear` and `CFG.mines.era2` is applied where a mine
   * takes its radius.
   */
  flock: {
    cohere: 0.55, // how much of the way to the school's mean the aim point moves
    apart: 5, // x r: inside this a body is pushed off its nearest neighbour
    /*
     * ...in units a second squared, because separation is a NUDGE ON THE
     * VELOCITY and not a tilt on the aim -- see `flockOn`, where the first
     * version was a tilt and eighteen combinations of these three factors
     * all measured the closest pair at `2r - slop`, the distance the pair
     * solver parks two touching bodies at.
     *
     * Chosen off the sweep that replaced it, measured in TRANSIT (the first
     * window included the school arriving at the mount, where what is
     * measured is a pile against the turret). Mean nearest-neighbour
     * distance and the cloud's radius, at apart 5r: push 120 gives 17.1 and
     * 132, 300 gives 20.4 and 153, 700 gives 25.7 and 91. The last is 1.8
     * body diameters apart in a cloud 29% of the field wide, which is a
     * school a player can see fourteen bodies in -- and seeing fourteen is
     * the whole object, because a blob reads as one thing to shoot.
     */
    push: 700,
    spread: 6.5, // x r: the radius the school is laid down in at the mouth
  },

  /*
   * QUARRY: one body that becomes nine. See `splits` on the type -- the
   * fracture is the SAME type at a smaller radius, twice over, which is why
   * there is one codex entry and one drawing rather than three of each.
   */
  quarry: {
    hpAt: 0.3, // a child's share of its parent's health...
    speedAt: 1.35, // ...and how much faster it is for being smaller
    armorAt: 0.55, // ...and how much less of the plate it kept
  },

  // ---- shooter --------------------------------------------------------
  shooter: {
    r: 26,
    /*
     * ---- the contact band, and why it is NOT proportional to `r` ----
     *
     * A body becomes an attacker at `e.r + s.r + grabPad` and is released at
     * `e.r + s.r + releasePad`; the 4 units between them stop a body resting
     * on the rim flipping in and out every frame, each entry firing
     * `audio.glitchOn()`.
     *
     * The NEW FORM plan instructed that these become proportional to `r`
     * before the machine grows, "or a body on the rim chatters". That is
     * REFUTED, and implementing it would re-open a fixed bug. What sets a
     * body's resting distance is `resolvePair`'s positional correction, and
     * neither term in it contains a radius: `pen = max(rr - d - slop, 0)` with
     * `slop` an absolute 0.4 and `correction` an absolute 0.72, and the
     * turret's `invMass` is 0 so the whole correction goes to the body. So
     * equilibrium is `e.r + s.r - slop` at EVERY radius, and the margins are
     * `grabPad + slop` = 2.4 and `releasePad + slop` = 6.4 whatever `r` is.
     * `s.r` cancels exactly.
     *
     * Chatter needs a body to cross the whole band inside one frame -- above
     * about 240 u/s radially at 60Hz -- which comes from shoves and never from
     * the equilibrium, and growing `r` changes none of those terms.
     *
     * And proportional would be a REGRESSION: 4/26 at r=40 puts release at
     * +9.23, three extra units of grip on a body PULSE has already shoved
     * clear -- and `world.attackers` is what holds the glitch fuse lit, which
     * is the build-210 leak. They have seats so the finding is machine
     * readable and so the case can force a release to prove its instrument.
     */
    grabPad: 2,
    releasePad: 6,
    standoff: 210, // world units between the turret and the ability strip
    // Every cadence below is 30% slower than it was through build 80: 0.2 and
    // 0.22 became 0.286 and 0.314. The turret is meant to be a thing you
    // improve, and a base rate that already felt fast left the rate upgrades
    // with nothing to give. Tapping faster than this is still always allowed.
    holdFireInterval: 0.286, // sustained-fire cadence
    aimClamp: 1.36, // radians away from straight up that the barrel allows
    turnRate: 26, // rad/s barrel slew under your own hand
    autoTurnRate: 4.2, // rad/s while auto aim traverses between targets
    /*
     * How much better a challenger has to be before the assist lets go of what
     * it is already shooting. 1.0 is no memory at all, which is what this was.
     *
     * The barrel traverses at `autoTurnRate` and, with auto fire on, the
     * cadence does not wait for it -- so a target change costs a slew and
     * every round fired during it. Measured on build 136, TERMINUS changed
     * target forty-five times a second for the whole of stage I because
     * thirty-two ring segments sat at exactly the same distance; seventy-four
     * percent of its shots were fired mid-sweep. See Game.autoTarget.
     */
    aimStick: 1.15,

    /*
     * How far auto aim will reach for a target, in world units, before ARRAY.
     *
     * It used to have no limit at all: `autoTarget` walked every live object
     * in the cone and took the nearest, so the assist covered the whole field
     * corner to corner, and the only thing that ever changed about it was how
     * fast the barrel got there.
     *
     * Re-derived at 390x844 off an `ENTRY_Y` of 0, which is what it has been
     * since "Remove the wall and the gate" — the paragraph this replaces was
     * still measuring from 260 and every statement it made about coverage was
     * wrong by that much. The turret sits at y=996 with the top of the field
     * at y=0, so the live column above it is 996 units and the far top corner
     * is 1045 away.
     *
     * So 400 is 40% of the column straight up and a little over a third of
     * the way to a corner. Anything beyond is yours to shoot by hand until
     * ARRAY is bought; two levels of it (x1.45 each) reach 841, which covers
     * six sevenths of the column and leaves the corner 204 units outside.
     * On a short screen (320x568, turret at y=551) 841 does cover everything,
     * corners included — which is why DEEP ARRAY's row used to promise the
     * top of the field and was only true on the smallest phone the game runs
     * on.
     */
    aimRange: 400,

    // The lever. A rod runs through the turret's pivot: the grip hangs below
    // it, the barrel sticks out above it, and pushing one swings the other
    // the opposite way. Holding the grip fires on its own.
    gripLen: 112, // world units from pivot to grip
    gripR: 24, // grip knob radius
    gripFireInterval: 0.286,
    /*
     * There is no third cadence. Auto fire and auto aim used to shoot at
     * 0.314 -- a tax for not being your hand -- which HANDS OFF then removed
     * for 500 energy. Two problems with that: the penalty was invisible (a
     * tenth of a second is not something anyone reads off the screen, it just
     * makes the turret feel worse for a reason you cannot name), and the
     * upgrade that lifted it was not an upgrade, it was a refund. Everything
     * fires at gripFireInterval now.
     */
  },

  // ---- rounds ---------------------------------------------------------
  // Mutually exclusive; each buys its effect with rate of fire. Names, marks
  // and descriptions live in src/arsenal.js — this table is behaviour only.
  rounds: {
    standard: {
      rate: 1,
      // OVERSTUFFED. A BOLT that rebounds off a body instead of stopping in
      // it. It keeps this much of its damage each time, so a round crossing
      // four objects is worth roughly two and a half of them, not four.
      reboundFade: 0.7,
    },
    explosive: {
      rate: 2.1, // less than half the cadence
      speed: 1040, // and slower in the air
      damage: 15,
      blast: { r: 96, damage: 44, impulse: 420 },
      // CLUSTER. The burst throws four smaller ones outward, so HE stops
      // being a circle and becomes a patch of overlapping circles.
      cluster: { n: 4, out: 78, scale: 0.5 },
      /*
       * ---- what the detonation looks like (build 211) ----
       *
       * The one it replaces was a single ochre outline circle, twelve sparks
       * and a small shake: the shortest explosion authored in the game, with
       * no shards, no embers, no ripple and no tail. Three things were wrong
       * with it beyond being thin.
       *
       * IT DREW THE WRONG CIRCLE. The ring expanded to `r * 1.4` and only got
       * there at the end of its life, so the picture ended 40% outside the
       * radius the damage was applied at, and the frame the damage landed on
       * was the smallest and least conspicuous frame of the whole effect.
       * `front` is the ring that arrives AT the damage radius, fast, so the
       * first thing you see is the shape of what was hit.
       *
       * IT WORE SOMEBODY ELSE'S COLOUR. #ffd166 is NEEDLE's and GLUT's body
       * colour and #ff9f1c is WARDEN's; the burst was drawn in the same two
       * tones as the BLAST mine and read as a small one. HE's own tone is the
       * card's #ff5638, and build 209 already made this correction for ARC,
       * SPINE and BOLT -- flight and burst colours come from the card's
       * family. HE was the one it missed.
       *
       * IT WAS THE SAME EVERY TIME. Radius, colour, width, life, shake and
       * sound were all literally constant; the only variation in the entire
       * function was twelve spark angles, which are invisible against the
       * lattice. `arcs` and `lobes` are the answer: the shockwave is drawn as
       * a few broken arcs at angles nothing picks twice, and the debris is
       * thrown along two or three randomly chosen directions rather than
       * evenly, so a burst has a silhouette instead of only a radius.
       */
      fx: {
        front: 0.13, // seconds the leading ring takes to reach the blast radius
        tail: 0.46, // ...and how long the broken arcs behind it run for
        arcs: [2, 4], // how many of them, per detonation
        arcSpan: [0.5, 1.9], // radians each one covers
        lobes: [2, 3], // directions the debris is thrown along
        lobeSpread: 0.5, // radians of scatter within a lobe
        sparks: 22, // at the stock radius; scaled by size, and capped
        shards: 7,
        embers: 4,
        /*
     * A backstop, not a ceiling anything reaches: OVERPRESSURE's three levels
     * take the radius to 2.744x and the count scales with its square root, so
     * the largest multiplier the game can produce is 1.657. It is here so a
     * future radius node cannot quietly ask for a thousand particles.
     */
    cap: 2.2,
        /*
         * How far the debris gets, as a multiple of the blast radius over its
         * own life. Under 1 it never leaves the core and the burst reads as a
         * ring with a smudge in the middle -- which is what the first draft of
         * this did: measured off a frame strip, the sparks were still a
         * starburst 20 units across at frame 5 and gone by frame 9, so the
         * lobes they were supposed to describe never became visible. They have
         * to CROSS the ring to say anything about direction.
         */
        throw: [1.1, 2.4],
      },
    },
    shotgun: {
      rate: 1.55,
      pellets: 5,
      spread: 0.3,
      speed: [1120, 1420],
      damage: 12,
      // Range is speed x life and nothing else, so this is the whole of it:
      // 0.5 reached 560-710 units, which was most of the way up the field for
      // a round whose whole trade is being murderous up close. A quarter off.
      life: 0.375,
    },
    // Jumps from whatever it hits to the next thing near it, and on again.
    // Poor against anything on its own; devastating through a cluster, at any
    // range, which is the one thing neither HE nor SCATTER does.
    arc: {
      rate: 1.35,
      speed: 1180,
      damage: 11, // the first hit is the weakest part of it
      jumps: 4,
      jumpRange: 210,
      jumpDamage: 25,
      falloff: 0.86, // each link a little weaker than the last
    },
    // The simulation stutters. Whatever it hits, the round happens again a
    // fraction of a second later from the point of impact, still travelling
    // the way it was — so a column coming straight down is hit once by every
    // shot, all the way to the back of it. Useless on anything on its own.
    /*
     * SPINE. It does not stop at the first thing. No chaining, no repeating —
     * it simply carries on out the far side, a little weaker each time, so its
     * worth is entirely in how much you can line up behind the first target.
     */
    spine: {
      rate: 1.45,
      speed: 1560,
      /*
       * 34 from build 218, up from 20.
       *
       * Measured against the rack on a single target: SPINE was 48.2 damage a
       * second where BOLT is 90.9, SCATTER 135.3 and HE 98.2 -- the weakest
       * thing in the game that is not a utility round, and the reason it was
       * never worth loading late. Its whole worth was in a column, and a
       * column is something the field gives you rather than something you can
       * ask for.
       *
       * At 34 it is 82 a second on one body, just under BOLT -- so it is a
       * round you would carry, and everything it does through a line of
       * bodies is on top of that rather than instead of it.
       */
      damage: 34,
      pierce: 3, // bodies it goes through after the first
      fade: 0.78, // and what it keeps of its damage each time
      /*
       * ---- SHATTER: what the round sheds on the way OUT, and what makes it
       * an area round rather than a line one ----
       *
       * SPINE's worth was entirely in what you could line up behind the first
       * target, and a column is something the field gives you rather than
       * something you can ask for -- so it was a round whose good case you
       * could not create. It sheds a fan of splinters out the FAR side of
       * every body it passes through now: a dart into a crowd is a dart plus
       * three sprays of shrapnel, and the round stops needing the field's
       * permission to be worth loading.
       *
       * OUT THE FAR SIDE, not at the point of impact, and the difference is
       * the whole effect. The contact point is on the NEAR face -- physics'
       * `contactAt` puts it at `e.x + nx * e.r` -- so a fan spawned there
       * opens backwards into the space the round has already crossed and
       * covers nothing new. The exit is derived from the impact parameter and
       * the body's own radius; see `shatterOn` in shooter.js.
       *
       * The splinters shed nothing themselves. That bound is deliberate and it
       * is what keeps this from being SLIVER's cascade a second time: the
       * round pierces at most `pierce + 1` bodies, so a SPINE makes at most
       * four fans of three, and the ceiling is a number rather than a product
       * of the levels.
       */
      shatter: {
        n: 3,
        /*
         * 1.5 radians -- 86 degrees, and wider than SLIVER's 49 on purpose.
         * SLIVER's arc is made of darts that still pierce and are still
         * looking for the next body in the line, so it wants to stay near the
         * parent's bearing. These are shrapnel: their job is the ground
         * either side of the line, which is the ground the round was not
         * already covering.
         */
        spread: 1.5,
        damage: 0.32, // of what the round had left AT THAT EXIT
        speed: 0.5,
        /*
         * Short, and this is the number that keeps the effect readable on a
         * phone. At 0.5 speed a splinter travels 780 * 0.26 = 203 units, so
         * the spray is a patch about the size of one body's neighbourhood
         * rather than a second volley crossing the field.
         */
        life: 0.26,
        r: 2.2,
      },
      /*
       * ---- SLIVER: what the round does to the first thing it hits ----
       *
       * Unbought, a SPINE goes through a body and carries on as one dart.
       * With SLIVER it comes apart on the way through: an arc of fragments
       * out the far side, each one still piercing, so a single body becomes a
       * spray and a body with anything behind it becomes several.
       *
       * `depth` is how many times a fragment may itself come apart, and it is
       * what the second level buys -- three slivers becoming nine, which is
       * why the numbers below are as small as they are. `damage` is a
       * fraction of what the round had left AT THE MOMENT IT SPLIT, so a
       * fragment of a fragment is weak by construction and the total cannot
       * run away with the levels.
       */
      sliver: {
        n: 3,
        /*
         * 0.85 rather than 0.62. Measured against a column the two are within
         * a few points of each other -- the fragments have depth to travel
         * into either way -- but 0.62 is a 35-degree fan and reads as one
         * dart fraying rather than as an arc. At 49 degrees it is visibly a
         * spray, and it reaches bodies a little off the line the parent was
         * on, which is the shape a real field actually presents.
         */
        spread: 0.85, // radians the arc covers, centred on the travel
        /*
         * 0.7, not 0.5. At a half, and with a round bounded to ONE
         * coming-apart, two levels of SLIVER were worth 1.32x and 1.47x
         * through a column -- a node you would not buy. At 0.7 the arc is
         * genuinely three quarters of a fresh dart each, which is what makes
         * the first level a decision and the second worth compounding.
         */
        damage: 0.7, // of what the round had left when it came apart
        speed: 0.82,
        pierce: 1, // ...and what a fragment carries on through, before `pierce`
      },
      /*
       * ---- and DOUBLE TAP is gone, with `tapGap` and `tapFade` ----
       *
       * It moved here from BOLT in build 209, lost TRIPLE TAP in 189, and came
       * out entirely in build 225. It was the last cadence node in the game:
       * `up.rate` on a fully bought turret is 0.9 and the whole rate ladder is
       * worth 1.11x, so a node worth a flat 1.5 rounds a trigger pull was
       * larger than every fire-rate upgrade put together. And it was worth
       * that on SPINE alone, which made one round in nine carry the biggest
       * throughput node in the tree.
       *
       * SPINE's own answer to volume is `shatter` above, which is area rather
       * than cadence and is what the round was given one for.
       *
       * ---- AND IT LEFT THE FIELD THOSE TWO NUMBERS WERE WRITTEN INTO -----
       *
       * Build 225 deleted `hold: t * g.tapGap` from `shooter.js`, deleted
       * `tapGap` and `tapFade`, and wrote this paragraph naming both -- and
       * left `Projectile.hold`, the field the first of them supplied, with
       * its own comment reading "DOUBLE TAP: the follow-up round waits this
       * long at the muzzle before it sets off". It was read on EVERY FRAME
       * FOR EVERY ROUND (`if (!p.dead && p.hold > 0) { p.hold -= dt;
       * dot(...); continue; }`) and could never be non-zero: one
       * `new Projectile` call site, seven `fire()` callers, no `hold:`
       * anywhere. Removed at build 336+1 with the ORDINAL hash unmoved,
       * which is what "a branch that could never be taken" looks like
       * measured rather than argued.
       *
       * The lesson is not "sweep harder". It is that a removal pass which
       * writes down which CONFIG values it took out has not thereby found
       * the code that read them -- `git show <commit> -- <file>` on the
       * removing commit is the sweep, and it takes one command.
       */
    },
    /*
     * SLUG. One slow, heavy round with an enormous shove behind it.
     *
     * It used to do almost no damage on purpose: the damage was supposed to
     * come from what you shoved it into. That is the one thing it is no longer
     * allowed to do — a body a SLUG has just hit does no collision damage to
     * anything it is driven through, and takes none from it, for `calm`
     * seconds. Everything else on the field still trades damage on impact.
     *
     * The mark travels: `eachPair` gives both bodies the larger of the two
     * remaining times on any contact above the collision threshold, so what
     * is exempt is a SLUG's whole chain and not only the body it hit. That is
     * deliberate -- a slugged BULWARK ploughing through a crowd would
     * otherwise be a damage round by proxy, which is the one thing this rule
     * exists to prevent -- and it runs down rather than propagating for ever,
     * because the time carried is the remainder and never a fresh `calm`.
     *
     * That left it paying a 2.4x rate penalty for a shove and nothing else,
     * so it hits hard per shot — 44, against BOLT's 26 and SPINE's 34 —
     * while staying under
     * BOLT on sustained damage. It was written against SPINE at 20 and SPINE
     * has been 34 since build 218, so it is no longer the hardest single
     * round; the rate penalty and the shove are the trade, not the ceiling.
     */
    slug: {
      rate: 2.4,
      speed: 820,
      damage: 44,
      impulse: 1500,
      calm: 2.4, // seconds a slugged body neither deals nor takes impact damage
    },
    /*
     * RIME. Drags whatever it touches to a crawl for a few seconds. It kills
     * nothing on its own; it buys the time for everything else to.
     */
    rime: {
      rate: 1.7,
      speed: 1180,
      damage: 16,
      chill: 3.2, // seconds of drag
      drag: 0.02, // velocity kept per second while chilled
    },
    /*
     * SPORE. Bursts into a patch of ground that keeps burning. The only round
     * whose damage arrives after the shot is over, which makes it the one you
     * fire where something is going to be rather than where it is.
     */
    spore: {
      rate: 2.0,
      speed: 980,
      damage: 10,
      /*
       * `cap` is how many of these may burn at once, and it is the whole
       * reason SPORE is a round rather than an answer. Patch damage is per
       * body and stacks additively with no dedup, and the fire interval
       * (0.286 * 2.0 = 0.572s) against a 4.5s life leaves 7.9 patches alive
       * -- 362 damage a second stock against SCATTER's 135 and BOLT's 91,
       * and against a boss with minions the ground was landing 45k a second
       * into 8.5k of health. Three is the number that leaves it the best
       * ground-denial round in the game without being the best of every
       * other kind as well. SECOND GROWTH buys a fourth.
       */
      patch: { r: 92, life: 4.5, dps: 46, cap: 3 },
    },
    /*
     * TITHE. It barely hurts on the first hit, and that is the point: every
     * hit on the same body deepens the mark, and a deeper mark takes more
     * from this round. Left on a single large thing it ramps into real damage
     * without ever changing ammunition, which is what a long fight against
     * one body needs.
     *
     * The PAYMENT does not deepen and never has -- it is one multiplier on
     * what the body was already worth, set on the first hit and held. Build
     * 220 made it a multiplier rather than a floor, because a floor of 3.5
     * against a tier bounty of 1.10^(tier-1) was worth nothing from tier 15;
     * it did not make it ramp. Two comments and the arsenal row all used to
     * say it did.
     */
    tithe: {
      rate: 1.5,
      speed: 1300,
      damage: 8,
      bounty: 3.5, // energy multiplier on a marked body
      step: 0.55, // extra TITHE damage per mark already on it
      marks: 8, // and it stops deepening here
    },
  },

  /*
   * ---- axiom -------------------------------------------------------------
   *
   * The eighth anomaly, and the first that only exists past the change. It
   * has NO gate at all from build 299 -- the derived table is seven rungs and
   * the roster is nine, which is how this one and TESSERA are deferred -- so
   * `debugBoss` is the only way to reach it. It was authored against a rung
   * 48 that the ladder no longer has.
   *
   * ---- what it does that the seven do not ----
   *
   * Every one of them is answered by shooting the right part of it. This one
   * is answered by shooting the right part of it WITH LESS THAN YOU BROUGHT.
   * Five CLAUSES stand in a ring, and while a clause stands it holds one of
   * your ability buttons shut. Break it and that button comes back for the
   * rest of the fight. The core cannot be hurt while any clause stands, so
   * the fight is: get your kit back, in the order you choose, with what is
   * left of it.
   *
   * PULSE is never taken. That is ORDINAL's rule -- `essential` on the
   * ability, "the answer to something sitting on the mount where the barrel
   * cannot reach" -- and a boss that could take it is a boss that can pin you
   * against your own machine with no way out.
   *
   * ---- and it brings the ability lock back, deliberately ----
   *
   * `Abilities.lockRandom` was deleted in build 219 because it had no writer
   * and five readers that could never take their other branch -- the
   * `world.endless` shape CLAUDE.md records, whose rule is to delete the flag
   * rather than maintain the branch. The rule is not "never lock a button";
   * it is "do not keep a mechanism nothing drives". This drives one.
   */
  axiom: {
    standoff: 400,
    arrive: 14.4,
    coreR: 40,
    // The four beats of the arrival, as every anomaly has them: the base's
    // `arriveStep` reads `C.beats` and nothing supplies a default.
    beats: [0.14, 0.36, 0.6, 1],
    clauses: 5,
    ring: 190, // how far the clauses stand from the core...
    ringII: 150, // ...and how close they draw in once the ring is broken open
    spin: 0.22, // rad/s, and it grows with the stage
    /*
     * Which buttons it holds, in the order the clauses are built. Ids rather
     * than indices: a slot's index is the loadout's business and changes with
     * what is owned, and a clause holding "whatever is in slot 3" would hold a
     * different thing on two different runs.
     *
     * PULSE is not here and must never be. Everything else is fair.
     */
    holds: ['fan', 'lance', 'well', 'prism', 'stasis'],
    lemma: { every: 3.4, n: 2 },
    stageCore: 0.66,
    stageOpen: 0.33,
    /*
     * The ending, on the base's own clocks. `arrest` is the ring being snapped
     * off a clause at a time, `infall` the core taking the rest, `endFor` the
     * whole sequence and `pull` how hard the hole draws. None of these has a
     * default -- `Boss.die`, `arrest`, `infall` and `dieStep` read them
     * straight off the block -- which is why the first version of this boss
     * fought correctly and then threw on the frame its core died.
     */
    arrest: 0.7,
    infall: 1.1,
    endFor: 13.4,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- tessera -----------------------------------------------------------
   *
   * The ninth, and the second of the two past the change. Gate rung 54.
   *
   * ---- what it does that the eight do not ----
   *
   * AXIOM takes things away from you. This one takes away the FIELD: it tiles
   * the ground it stands on, and a tile it has laid is ground your rounds do
   * not cross. Shoot a tile and it lifts; the ground under it is yours again
   * until the next pass lays another.
   *
   * So the question is spatial where AXIOM's is about order: the boss is
   * always reachable and the LINE to it is not, and what you are managing is
   * a corridor you keep having to re-cut. It is the only anomaly whose body
   * is the space between you and it.
   *
   * ---- and it is one mechanism, not two ----
   *
   * A tile is an ordinary body with `plow: false` and a mark on it. What stops
   * a round is the same projectile sweep that stops one on anything else --
   * there is no second collision system and no special case in
   * `updateProjectiles`. A tile simply has a great deal of surface and no
   * interest in coming to you, which is a shape the physics already supports.
   */
  tessera: {
    standoff: 420,
    arrive: 14.4,
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 38,
    /*
     * The lattice. `cols` across by `rows` deep, laid on a grid `pitch` apart
     * and centred under the core -- so at stock it is a five-by-three slab
     * 132 units on a side, standing between the machine and the thing that
     * laid it.
     */
    cols: 5,
    rows: 3,
    pitch: 66,
    /*
     * ...and the slab is pushed DOWN the field toward the machine by `ahead`,
     * which is not decoration. Laid centred on the core -- which is what the
     * first version did -- the middle berth of an odd-by-odd grid lands at
     * (0, 0), i.e. exactly on the core: a tile inside the boss, invisible,
     * and the first thing any round up the centre line meets. It is also the
     * wrong shape for the design, which is a corridor to cut rather than a
     * shell to break. Two pitches puts the near row one pitch below the core,
     * 66 units from its centre against the 64 a tile (26) needs to clear a
     * core of 38 -- and the lateral slide only ever increases that.
     */
    ahead: 132,
    /*
     * ---- how fast it re-tiles, and why these numbers are what they are ---
     *
     * It was `{ every: 5.2, n: 2 }` with `layII: 3.4`, and MEASURED that made
     * the fight unwinnable at stock. The arithmetic nobody had done:
     *
     *   a stock gun puts about 76 damage a second into the slab, so it cuts
     *   one 300hp tile every 3.9 seconds. Two tiles every 5.2 seconds is one
     *   laid every 2.6. The boss out-laid the player 1.5 to 1, the corridor
     *   could never open, and over a whole fight the core took EXACTLY ZERO --
     *   164 seconds of shooting ground, and then it withdrew on the patience
     *   clock with `reconciled` still empty.
     *
     * One at a time, every 7 seconds, is one laid against 1.8 cut. That is
     * the margin the player needs to open a lane at all, and `layII` closes
     * it to 4.7 -- still slower than the cut, but only just, which is what the
     * second stage is for.
     */
    lay: { every: 7, n: 1 }, // how often it re-tiles, and how many at a time
    layII: 4.7, // ...and how often once it is angry
    /*
     * ...and a berth that has been cut STAYS cut for this long.
     *
     * The rate above is only half of it. `relay` fills the emptiest ground
     * nearest the machine first -- which is the point, it is what makes the
     * ground it wants back most the ground you just took -- but with no
     * cooldown that means the front of a lane is refilled on the very next
     * pass, so a lane can never be held open long enough to shoot down. A
     * corridor you cannot stand in is a door.
     */
    regrow: 9, // seconds before a cut berth may be re-laid
    regrowII: 5.5, // ...and once it is angry
    drift: 26, // how far the whole slab slides side to side
    driftRate: 0.3,
    stageCore: 0.62,
    stageOpen: 0.3,
    arrest: 0.7,
    infall: 1.1,
    endFor: 13.4,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- hail -------------------------------------------------------------
   *
   * The wide one. Twenty-five pellets in a tight cone until build 263, with
   * every number written as a literal at the call site -- so nothing in the
   * game could read what HAIL was worth without reading its `run`.
   *
   * ---- the fan, and what widening it costs -----------------------------
   *
   * `arc` 1.12 -> 1.85 rad (64 degrees -> 106) with the count 25 -> 34. Those
   * two together are close to density-neutral: 22.3 pellets a radian became
   * 18.4. A body of radius 20 at 200 units subtends 0.2 rad, so it now eats
   * about 3.7 pellets where it used to eat 4.5 -- HAIL is 18% WEAKER against
   * one body and 36% more metal across the field. That is the trade the
   * request asks for in as many words ("a large fan of shots"): it stops
   * being a burst you point at something and becomes an answer to a crowd.
   *
   * ---- the blowback, which is the whole of the rest ---------------------
   *
   * `impulse` 34 -> 265, and it is a THROW.
   *
   * 34 was never going to be felt. A shove is `impulse * invMass` and the
   * ordinary body runs 0.20 to 2.38, so 34 bought between 7 and 81 u/s of an
   * approach -- and worse, an untagged hit pays `1 / (1 + kicked)`, which is
   * applied and ACCUMULATED per pellet. Twenty-five pellets landing together
   * meant the second was worth half the first and the tenth a tenth of it, so
   * the harder HAIL connected the less each pellet pushed. The shove it was
   * rated for did not exist at any range.
   *
   * `throwOff` is what fixes both halves: the fade is skipped and the speed
   * ceiling lifts from `cruise * 6` to `physics.thrownSpeed`. The rule for
   * granting it is CADENCE and not weight -- PULSE and PILE have it, SLUG is
   * refused it, and the line is a deliberate press against a round fired one
   * and a half times a second. HAIL is a button with a five-second clock on
   * it (3.2s with both STANDING ORDERs), one press at a time, so it is on
   * the near side of that line with PULSE.
   *
   * What bounds it is the ceiling it just lifted to and not the number: 3.7
   * pellets at 265 is 980 of impulse, against PULSE's 1050 at zero falloff --
   * and whatever the total, `thrownSpeed` 720 clips the result and `thrown`
   * 0.5s is how long the body is off its steering. 720 for half a second is
   * 360 units of ground given up, after which it turns round and comes back.
   * That is the build-110 guard: what threw a body off the field for good was
   * SUSTAINED fire, not one press.
   *
   * ---- AIRBURST ---------------------------------------------------------
   *
   * `burst` is the upgrade's blast and is inert without it. What it buys is
   * measured rather than asserted, on a pinned witness over ninety frames:
   * one LURCHER 105 -> 161, three of them shoulder to shoulder 270 -> 505,
   * one BULWARK 118.8 -> 162. It is worth half again against one body and
   * nearly double against a crowd, which is the shape a fan should have.
   */
  hail: {
    pellets: 34,
    arc: 1.85, // radians, corner to corner
    jitter: 0.02, // ...and how much each pellet wanders inside its share
    speed: [980, 1240],
    r: 3,
    damage: 15,
    impulse: 265,
    life: 0.62,
    /*
     * AIRBURST. Nothing reads these without `up.fanBurst`.
     *
     * ---- why 74, and why 34 and 58 were both wrong ----------------------
     *
     * `applyBlast` measures centre to centre. A pellet's burst goes off where
     * the pellet STOPPED, which is on the far body's SURFACE -- so a blast of
     * radius R centred there reaches that body's own centre only if R exceeds
     * its radius. At 34 it was smaller than half the bodies in the game:
     * measured against a pinned BULWARK, four pellets landed for 118.8 and
     * the four bursts that followed them delivered EXACTLY ZERO, twice, to
     * the decimal.
     *
     * 58 fixed that for ordinary bodies and left it broken in the ONE PLACE A
     * PLAYER LOOKS. The assay's rig is r 68 -- larger than any body in the
     * game, because it is a target and not an attacker -- so a 58-unit burst
     * on its surface could not reach its centre either, and the room whose
     * whole job is telling you what a source is worth reported AIRBURST as
     * worth nothing. Measured over twelve presses: 1140 without it and 1170
     * with it, which is zero inside the noise, against x1.5 to x1.9 on the
     * same weapon in the field. Found by review, not by play.
     *
     * 74 is the smallest number that clears everything it must be able to
     * hurt: the rig at 68, the FRACTAL core at 64 (the largest base body) and
     * a fully grafted BULWARK at 72. The damage comes down 11 -> 10 to pay
     * for the area, and the field is where it was -- measured at twelve
     * presses, one LURCHER x1.71 -> x1.62, three abreast x1.89 -> x2.03, a
     * BULWARK x1.36 -> x1.40, and the rig x0.98 -> x1.30.
     *
     * What it is FOR is still the neighbours: chip damage that spreads
     * sideways off whatever a pellet found, which a fan of thirty-four cannot
     * do on its own. It just has to work on the thing it hit as well.
     */
    burst: { r: 74, damage: 10, impulse: 150 },
  },

  // ---- decoy ----------------------------------------------------------
  // A second turret that is not yours and is not real. Everything that was
  // walking at you walks at it instead, which turns a scattered field into one
  // pile somewhere else — and the pile is not on top of you.
  decoy: {
    life: 9,
    /*
     * ...and what a SECOND press is worth while one is still up.
     *
     * It used to be worth less than nothing: `run` called `expire` on the
     * standing decoy, which is its DEATH -- a 260-unit blast in the middle of
     * the pile it had gathered -- and then put a fresh one down. So the one
     * ability whose whole job is to hold a pile somewhere else answered a
     * second press by detonating the thing holding it. Measured: a body 98
     * units off the decoy went from 196 health to 82.9 on the press, and the
     * pile it was part of took a 900 shove outward.
     *
     * Worth saying plainly, because it was a mechanic and not only a bug --
     * with two charges it was an on-demand blast, and taking it away is a
     * real removal as well as a fix.
     *
     * A press adds `life` to what is left instead, up to `lifeCap`. The cap is
     * three presses' worth and exists so the ceiling is a number rather than
     * whatever the charge upgrade happens to allow; the second charge is the
     * only way to get two presses inside one decoy's life anyway, since the
     * cooldown is longer than the life.
     *
     * Note the OTHER clock is unchanged: a decoy dies on `hp` as readily as on
     * time, and a press does not repair it. Which is why the drawing now shows
     * both -- see Decoy.draw.
     */
    lifeCap: 27,
    hp: 900,
    r: 24,
    ahead: 300, // world units up-field from the turret
    blast: { r: 260, damage: 150, impulse: 900 }, // what it leaves behind
  },

  // ---- ward -----------------------------------------------------------
  /*
   * WARD. A shell stands up round the turret and stays up. Anything that
   * crosses it is cut on the way through, and the shell throws an arc at
   * whatever is nearest to it every so often.
   *
   * It replaced SPIRAL, which took the barrel off its target and turned it
   * through three revolutions firing the loaded round. SPIRAL's whole idea
   * was that it fired whatever you had loaded, so it was nine abilities in
   * one -- and that is also why it never read as an ability: what happened
   * when you pressed it depended entirely on the ammunition, so it had no
   * picture of its own and no answer to "what did that do".
   *
   * WHAT MAKES IT NOT A SECOND PULSE. PULSE is an instant: one blast, r 340,
   * a large shove, and it takes the energy in. WARD is a STATE -- it is up
   * for six seconds, it reaches a third as far, it does not shove at all, and
   * it does not collect. PULSE clears a space; WARD holds one. The two are
   * the difference between an answer and a stance, and pressing PULSE while a
   * WARD is up is a perfectly ordinary thing to do.
   *
   * It does answer the mount, and deliberately: a body on the turret is
   * INSIDE the shell, so the arcs -- which take the nearest -- take it first.
   * That is the same direction build 216 set for PILE, and the same reason:
   * what the tree sells is a machine that increasingly looks after itself.
   */
  ward: {
    life: 6, // seconds the shell is up
    r: 150, // and how far out it stands, before WIDEN
    /*
     * Damage on the way THROUGH, not per second of standing inside. A body is
     * cut once each time it crosses the surface, in either direction, with a
     * short refractory so a body sitting exactly on the line is not billed
     * every frame. That is what makes the shell a wall rather than a patch of
     * burning ground -- and what stops it being a worse SPORE.
     */
    cut: 62,
    recut: 0.55, // seconds before the same body may be cut again
    push: 210, // just enough to knock it back off the surface
    /*
     * ...and the arcs. Every `every` seconds the shell throws `n` of them at
     * the nearest bodies inside its own reach. This is the half that answers
     * something already on the turret, and the half that makes the ability
     * worth pressing when nothing is crossing yet.
     */
    arc: { every: 0.6, n: 2, damage: 46, reach: 1.25 },
    // Seconds between discharges crawling along the surface. It fires whether
    // or not anything is near, because a shell that only sparks when it is
    // being touched reads as a wall that happens to hurt; this one has to
    // read as dangerous before anything walks into it. The rate rises with
    // `flash`, so it visibly gets angrier just after something crosses.
    /*
     * HEAVE: one outward shove on the frame the shell comes up, and only with
     * the node. A throw rather than a hit that pushes -- the exemption PULSE
     * and PILE have and SLUG deliberately does not, on the same rule: a press
     * every eighteen seconds is a deliberate clear, and a round fired one and
     * a half times a second is not. So the ceiling lifts to `thrownSpeed` and
     * the repeated-shove fade is skipped, which is what makes a body visibly
     * lose ground instead of being nudged and driving straight back in.
     */
    heave: 1180,
    /*
     * ...and how far that shove REACHES, which is not the shell.
     *
     * It was `this.r` -- the shell's own 150 -- so HEAVE cleared the ground
     * the shell was about to occupy and nothing else, and a body two steps
     * outside stood and watched. The node is bought to be the WARD's answer
     * to a crowd, and a crowd is not inside a 150-unit circle. 300 is PULSE's
     * ground (340) less a little, which is the comparison the request makes
     * and the right one: PULSE is a bigger circle on a shorter clock, HEAVE
     * is nearly as big once every eighteen seconds and leaves a wall behind.
     *
     * In SCALED beside `ward.r`, because it is a length and has to cover the
     * same fraction of a field half again as deep.
     */
    heaveR: 300,
    crackle: 0.085,
    ramp: 0.35, // seconds the shell takes to stand up, and to go
  },

  /*
   * THORN. Not a charge at all: it opens into a patch of burning ground and
   * stays open. Nothing sets it off and nothing uses it up — anything standing
   * on it is being hurt the whole time it stands there.
   */
  thorn: {
    flight: 0.9,
    arm: 0.5,
    r: 12,
    /*
     * 29 a second, down from 37 at build 231's audit -- the only mine trimmed
     * by it, and the only one that was ahead on every bench that was run.
     *
     * It is the compounding shape again, one file over from BLAST's. A patch
     * bills a body for as long as that body is INSIDE it, so what a THORN is
     * worth is `dps x (time in the patch)` and the second term is itself
     * bought: BLOOM OUT takes the radius to 190, which at a lurcher's 38 units
     * a second is ten seconds of a fourteen-second life -- so the node sells
     * duration as well as area and the two multiply against the dps. Measured
     * on a twenty-body crowd it delivered 31,379 fully bought, against 18,024
     * for the next best and 2,899 for BLAST.
     */
    patch: { r: 104, dps: 29 },
  },
  /*
   * LODE. Does no damage and cannot be triggered. It pushes, constantly, and
   * everything within reach is walking uphill. The mine for making a lane, or
   * for holding a crowd off the turret while something else does the work.
   */
  lode: {
    flight: 0.9,
    arm: 0.5,
    r: 13,
    reach: 94, // cut 60% in build 53: it was closing most of a lane on its own
    push: 620, // acceleration outward, per second, at the centre
  },
  /*
   * SPALL. A claymore. It triggers like a BLAST but throws everything it has
   * in one direction instead of all of them — straight up the field, into
   * whatever is coming down it.
   */
  spall: {
    flight: 0.85,
    arm: 0.45,
    r: 12,
    trigger: 30,
    pellets: 14,
    spread: 0.9, // radians of the fan
    speed: [900, 1240],
    damage: 29,
    /*
     * What each pellet does where it lands, on top of what it hits directly.
     * Small on purpose: fourteen of these go off in a fan and the sum of them
     * is the effect, so one of them being loud would be fourteen loud things.
     * SPLINTER is the only thing that moves the radius.
     */
    burst: { r: 26, damage: 9, impulse: 110 },
  },
  /*
   * VOID. One thing, whatever it is, gone. It does not care about armour or
   * health or how big the thing was, and it only ever does it once. The answer
   * to the single object a run cannot otherwise get through.
   */
  void: {
    flight: 1,
    arm: 0.7,
    r: 12,
    // It has to be walked into, not merely approached. At 18 that mouth is
    // small enough that a VOID often expires unused, which is what EVENT
    // HORIZON is for — it more than doubles this and nothing else.
    trigger: 18,
  },

  // ---- prism shell ----------------------------------------------------
  prism: {
    r: 300, // blast radius
    damage: 110,
    impulse: 700,
    beams: 14,
    beamLen: 900,
    beamDamage: 85,
  },

  // ---- auto mines -----------------------------------------------------
  /*
   * PILE. The one thing on the machine that acts without being asked.
   *
   * It replaced SIGHT in build 215. What it is: a weight in a slot through the
   * deck, dropped on a clock, and the wave that goes out through the floor
   * when it lands. It answers the thing SIGHT never did -- something closing
   * on the turret while the barrel is pointed elsewhere.
   *
   * IT IS AN ANNULUS, NOT A BLAST: born at `r0` and only ever travelling
   * outward, so the wave arrives at a body rather than enveloping the field.
   * It DOES clear the mount, from build 216 -- a body sitting on the machine
   * has its edge inside `r0` from the first frame and is struck there.
   *
   * Build 215 excluded the mount on the grounds that the glitch timer is the
   * only involuntary way down and its answer, shoving the thing off, had to
   * stay a decision the player makes. That was overruled: negating the glitch
   * threat with what you have bought is a legitimate thing for the tree to
   * sell, and the direction of the upgrade system is a machine that
   * increasingly looks after itself. PULSE is still the only answer you can
   * ASK FOR on the frame you need it; PILE is the one that arrives anyway.
   *
   * `thrown` is what makes it read: it exempts a struck body from its own
   * speed cap up to `physics.thrownSpeed` and stops it steering for half a
   * second, so it visibly loses ground instead of being nudged and driving
   * straight back in.
   */
  pile: {
    every: [8, 5, 3], // seconds between waves, per level
    r0: 54, // where the front is born -- inside this is PULSE's business
    r: [168, 204, 240], // ...and how far it reaches, per level
    speed: 620, // world units a second the front travels outward
    damage: 26,
    impulse: 900,
    thrown: 0.5, // seconds a struck body is off its own cap and off its steering
    tell: 0.35, // how long before it goes that the machine says so
  },

  /*
   * ---- the two nodes that CAST, and the one rule that makes them safe ----
   *
   * Build 190 took REFLEX out and CLAUDE.md has said "nothing in this game
   * casts an ability" ever since. Build 275 puts two of them back, at the
   * author's decision, and the objection 190 raised is still correct and is
   * answered rather than overruled:
   *
   *   "an upgrade that spends a charge unasked is a charge you do not have
   *    when you need it"
   *
   * REFLEX went through `Abilities.trigger`, which spends `s.charges` and
   * starts `s.cd`. FLINCH and DEADBOLT call `def.run(world)` directly, so the
   * EFFECT happens and the BUTTON is untouched: charges, cooldown and the
   * first-use caption all belong to the player still. What they cost is the
   * clock below and nothing else, and that clock is theirs -- STANDING ORDER
   * shortens ability cooldowns and deliberately does not reach it, because
   * this is not an ability's cooldown.
   *
   * Six seconds, both, as asked. It is longer than PULSE's own 7 is not --
   * which is the point worth stating: at six this is a FASTER PULSE than the
   * button, and it is meant to be, because it only ever fires when something
   * already has hold of the machine. It cannot be farmed: `world.attackers`
   * is empty the rest of the time and the clock only runs down when it is not.
   */
  reflex: {
    every: 6, // ...each, on its own clock. See Game.runUpgrades.
  },

  /*
   * Every mine that does damage was raised 10% in build 216: BLAST 95 -> 105,
   * SALTED's fizzle 44 -> 48, THORN's ground 34 -> 37/s, KNELL's toll 74 ->
   * 81, WIRE 72 -> 79/s, SPALL's pellet 26 -> 29. VOID, SNARE and LODE are
   * untouched because none of them has a damage number: VOID deletes, SNARE
   * holds, LODE pushes.
   */
  mines: {
  /*
   * ---- THE MINE LINE IS OUT OF PLAY -----------------------------------
   *
   * Every line of it is still here -- `mines.js` entire, all eight kinds in
   * `arsenal.js`, the twenty-one upgrades in `upgrades.js`, the MINES tab and
   * its loadout sheet, the strip's own stack, the `mine`/`mines` fields in
   * the world and in the save. What is gone is every DOOR into it, and this
   * flag is the one thing that shuts them:
   *
   *   tree.js    the MINES root is not built, so its twenty-one ids are in no
   *              branch, no `NODE_BY_ID` and no ledger replay -- and they are
   *              excused from `coverage()` by a list DERIVED from the root
   *              that was dropped, so it cannot go stale
   *   menu.js    the MINES tab is not in `GROUPS` and its loadout sheet is
   *              not built, so there is nothing to open and nothing to pick
   *   hud.js     the strip's mine stack, its fold and its MINES button are
   *              not filled -- the two bands are still created, because
   *              `#quickBar` is `space-between` and dropping them would walk
   *              AIM and FIRE out from under the thumb -- and the debug
   *              panel's THROW cell goes with them
   *   game.js    `mineCadence`, `updateMines` and `drawMines` are not called,
   *              `pickMine` refuses, `debugThrowMine` refuses, and a restore
   *              comes back carrying none
   *
   * Set it true and every one of those comes back with no other edit. The
   * suite asserts the whole list and is run BOTH ways, so a door left open is
   * a red case rather than something a player finds.
   */
    inPlay: false,
  /*
   * ---- how much of a mine there is at era 2 ---------------------------
   *
   * Every mine radius is in `SCALED`, so a mine holds its size ON THE GLASS
   * across the eras -- 13 world units at era 1 and 20 at era 2, both of which
   * come to 8.06 CSS px. That is the right default for a picture and the
   * wrong one for these: five of them on a field half again as deep read as
   * clutter where the same five at era 1 read as placed.
   *
   * So they take a factor at era 2 and nothing else does. It is applied where
   * a mine takes its radius rather than to each of the eight `CFG` entries,
   * so a kind added later is covered by existing rather than by being added
   * to a list -- and it moves the TRIGGER reach with it (`m.r + cfg.trigger`),
   * which is deliberate: a smaller mine has a smaller mouth, and the ring
   * that draws that reach is computed from the same `m.r`, so the picture
   * cannot come apart from the rule.
   *
   * 0.7 puts a mine at 5.64 CSS px against era 1's 8.06.
   */
  era2: 0.7,
    /*
     * Five on the field, fifteen seconds each, one thrown every fifteen.
     *
     * `cap` and `life` are still a contract with the player rather than a
     * balance dial: nothing may move either, so the most that can ever be
     * standing is five and none of them outlives its quarter minute.
     *
     * `throwEvery` was the third of those until build 214 and is a dial now.
     * QUICK LAY takes two levels off it at 0.75 each -- 15s to 11.3 to 8.4 --
     * which is the first thing in the tree that shortens the wait rather than
     * widening the throw. Note the arithmetic it changes: a throw every
     * fifteen seconds against a fifteen-second life is a steady state of ONE
     * mine, laid as the last one goes, so the cap was a backstop nobody
     * reached by laying. At 8.4s it is a steady 1.8 throws, and PAIRED CHARGE
     * -- capped at one level in build 220, because uncapped it laid four a
     * throw and the cap evicted three of them -- doubles that to a steady 3.6
     * standing, peaking at 4. So the cap is still a backstop: measured, the
     * field never reaches five by laying. It is enforced in `throwMine`
     * rather than at the clock because a throw puts down more than one.
     */
    cap: 5,
    life: 15,
    /*
     * The top of the field, as a fraction of its depth, that a mine is never
     * thrown into.
     *
     * It was a flat 70 units off the entry line -- about a ninth of the field
     * -- so a mine could be laid essentially on the line bodies come in on,
     * spend its flight and its arming time (1.25 to 1.7 seconds, by kind)
     * before the wave had gathered, and then go off on whichever body crossed
     * first. A fifth of the field is the buffer, and it is a FRACTION rather
     * than a number of units so it stays a fifth on every screen.
     */
    keepTop: 0.2,
    throwEvery: 15, // one clock for every kind, not one each; QUICK LAY scales it
    flight: 0.85, // seconds from turret to landing site
    arm: 0.4, // settling time before it can trigger
    r: 13,
    trigger: 26, // extra reach beyond the mine's own radius
    /*
     * ---- how wide a mine may open, and why this is the fourth attempt ----
     *
     * 105, and the fully bought maximum is 156: half the width of a 390-point
     * phone. The rule this build writes down, and that `regress.mjs` now
     * asserts against the ACTUAL viewport rather than against four hand-typed
     * constants:
     *
     *   a BLAST is over in a quarter second and read from its EDGE, so its
     *   edge has to be on the screen with room to spare -- no wider than half
     *   of it. A standing reach (SNARE's knot, THORN's burn, LODE's push) is
     *   drawn continuously and read from its CONTENTS, so it only has to fit;
     *   two thirds is the ceiling there, and all three are already inside it.
     *
     * The base has now been cut three times -- 413 fully bought at build 222,
     * 306 at 223 (DEEP CHARGE capped at two levels), 215 at 227 (30% off the
     * base) and 156 here -- and the complaint came back after each of the
     * first two, because each cut ONE term of a product of three: base x toll
     * growth x DEEP CHARGE. Build 229 takes the other two as well; see
     * `spread` under `knell` and DEEP CHARGE in upgrades.js.
     *
     * The damage stays where it is on purpose, as it did at 227. What was
     * wrong was never how hard a mine hits, it is that a circle wider than the
     * screen is not a blast, it is a white flash with no shape to read -- and
     * five may be down at once. Nerfed in build 49 from 140; SHRAPNEL is still
     * the way back past the damage.
     */
    /*
     * 150, up from 105 in build 231's mine audit.
     *
     * BLAST is the only mine in the eight that gets exactly ONE event: it has
     * to be walked into, it fires once, and it is spent. THORN and WIRE bill
     * every body in their zone for as long as the mine lives, SNARE grinds a
     * knot for its whole hold, and a KNELL now tolls across its life. Measured
     * on a twenty-body crowd, control-subtracted: BLAST delivered 458 stock
     * against THORN's 5,596 and WIRE's 5,234, and it was the smallest of the
     * damaging mines at both ends of the tree. The one-event mine has to hit
     * hard enough to be worth the slot, which is what the radius cannot do for
     * it -- and the radius is now held to half a screen by the rule above.
     */
    blast: { r: 105, damage: 150, impulse: 760 },
    fizzle: { r: 67, damage: 48, impulse: 300 }, // SALTED: what a spent one does
  },

  // ---- snares ---------------------------------------------------------
  // The other kind of mine. It does not go off: it opens, hauls everything
  // near it into one pinned knot, and holds. No damage of its own — the
  // damage is the objects grinding against each other, and whatever you
  // choose to put into the pile while it cannot move.
  snare: {
    flight: 0.9,
    arm: 0.6, // takes longer to settle
    r: 14,
    trigger: 34, // a wider mouth, because it wants a crowd
    hold: 2.4, // seconds it keeps hold once it opens — was 3.6; see DEAD WEIGHT
    /*
     * 168, down a fifth from 210 in build 223. Nothing in the tree scales a
     * SNARE's reach, so this number IS its maximum -- and unlike a blast it is
     * drawn for the whole of the mine's life, hauling everything inside it
     * into one knot. At 210 on a world about 630 units wide it was taking two
     * thirds of the screen's width and most of what was on it; the knot is
     * the effect, and a knot that eats the entire field is a wave ending
     * rather than a mine working.
     */
    reach: 168,
    pull: 300, // inward speed it drives what it catches
  },

  // ---- wires -----------------------------------------------------------
  // The third kind, and the only one that is not a point. It lands, unspools a
  // taut line to either side of itself, and everything that crosses the line
  // is cut for as long as it stays on it. Nothing triggers it and nothing
  // consumes it: it is a lane closed for as long as it lasts.
  wire: {
    flight: 0.95,
    arm: 0.5,
    r: 11,
    span: 150, // half-length of the line, world units
    open: 0.55, // seconds to unspool once it has settled
    width: 8, // contact half-width
    damage: 79, // per second of contact, per body — was 105; see HOT WIRE
    shove: 150, // pushed off the line rather than held on it
    /*
     * ...and the clock both of those run on, four times a second, which is
     * `Patch`'s and for the same stated reason: `applyDamage` floors a hit at
     * `Math.max(1, ...)`, so a per-FRAME bite of 79/60 is floored on anything
     * armoured and, at 120Hz, on everything. Per frame this wire delivered
     * 120 a second against a rated 79 on a ProMotion phone and 79 on a 60Hz
     * one, with armour mattering on one of them and not the other -- and its
     * shove ran the opposite way across the same rates, because a per-frame
     * impulse pays the repeated-hit fade once a frame.
     */
    tick: 0.25,
  },

  // ---- knells ----------------------------------------------------------
  // The fourth kind. It does not wait to be touched — it counts, and then it
  // goes off twice where it lies, each wider and weaker than the last, and
  // four times with FOURTH BELL fully bought.
  // A blast mine punishes what walks into it; this one denies the ground.
  knell: {
    flight: 0.9,
    arm: 0.8,
    r: 13,
    tolls: 2, // was 3; FOURTH BELL buys the third back and a fourth beyond it
    /*
     * How long the tolls take, first to last -- NOT the gap between them.
     *
     * It was `gap: 1.15`, a fixed wait, and the arithmetic of that was the
     * whole of "KNELL does not do damage". A knell ends itself on its last
     * toll, so two tolls 1.15s apart meant the mine was GONE 2.85 seconds
     * after it was thrown (5.15 with FOURTH BELL) -- measured, against 15.9
     * seconds for every one of the other seven kinds, and a throw clock of
     * 15. A knell player had a live mine 19% of the time and bare ground for
     * the rest of it, and the mine spent its whole existence in the window
     * before a wave had reached the ground it was denying. Measured on a lane
     * bodies actually walk down, it delivered ZERO.
     *
     * So the tolls are spread across the mine's life instead, the same shape
     * as `spread` below: this is the span from the first to the last, with
     * however many tolls there are distributed evenly inside it, and FOURTH
     * BELL makes the bell ring MORE OFTEN over the same window rather than
     * extending it. Stock is 1.7s and 12.2s from the throw; fully bought is
     * every 3.5s across the same 10.5. Either way the mine denies its ground
     * for about four fifths of its life, which is what the paragraph above
     * has claimed since it was written.
     */
    span: 10.5,
    /*
     * 70, and the widest ring a KNELL can ever make is 156 -- half the width
     * of a 390-point phone, the same ceiling BLAST is held to above.
     *
     * This is the one that compounded, and it is why two previous cuts did not
     * hold. The toll ladder was `r * (1 + i * grow)` with `grow` 0.5, so every
     * toll was half a base wider than the last AND FOURTH BELL bought two more
     * tolls PAST the end of it: the last ring of a fully bought KNELL was
     * `r * (1 + 3 * grow) * mineBlast` = 4.55 bases. 726 units before build
     * 223, 538 after it, 378 after 227's cut to the base -- 113% of the width
     * of the screen it was drawn on, measured, with up to five of them down.
     *
     * So `grow` is gone and `spread` replaces it: the RATIO of the last toll
     * to the first, with however many tolls there are distributed evenly
     * between the two. FOURTH BELL now fills the ladder in rather than
     * extending it, so what it buys is two more tolls of damage and two more
     * gaps of denial -- and the widest ring is `r * spread * mineBlast`
     * whatever else is owned. At the stock two tolls the ladder is EXACTLY
     * what it was (1.0 then 1.5), which is why 1.5 is the number: nothing
     * about an unbought KNELL changes shape, only its base.
     */
    /*
     * 95, up from 81 at build 231's audit, so a stock knell's two tolls come
     * to about what one BLAST does -- 163 against 150 -- for a mine that
     * cannot be aimed at anything and whose rings are the smaller of the two.
     * The real answer to "a knell does no damage" was `span` above; this is
     * the rest of it.
     */
    blast: { r: 70, damage: 95, impulse: 430 },
    spread: 1.5, // the last toll is this much wider than the first
    fade: 0.72, // and this much of its damage
  },

  // ---- salvage ---------------------------------------------------------
  // Every object leaves fragments, and a fragment is worth something from the
  // moment it drops until the moment it is collected. Nothing decays: what is
  // on the floor is a backlog, not a clock. It is collected by reaching the
  // intake or by being destroyed, so a present player can turn the barrel on
  // the floor and cash it now, at the cost of the shots that are not going
  // into what is coming down.
  /*
   * How big an energy mote may draw, whatever it came off.
   *
   * A mote's radius, and an explosion shard's, are both a fraction of the
   * parent's — which meant a BULWARK dropped motes 16.7px across, a grafted
   * one 22.7px, and its explosion threw spiky shards bigger still. A live
   * NEEDLE is 12.4px. So the floor and the flash were full of things that read
   * as bodies and were not, in the parent's own colour.
   *
   * Capped, every piece draws in the small, bright band that says "this is
   * energy, come and take it". Explosion shards get a looser ceiling because
   * they live under a second and a big object should still burst bigger than
   * a small one.
   *
   * What a mote is worth is unaffected: value comes from the parent's mass and
   * is split across the motes it leaves, not read off their size.
   */
  drop: {
    min: 1.8,
    max: 4.4,
    burst: 1.6, // multiplier on the ceiling for explosion shards
    /*
     * How energy travels, whatever it fell off.
     *
     * It used to inherit the parent type's `speed` and `accel`, which made the
     * same object on screen behave four different ways: a mote off a NEEDLE
     * closed at 130 and turned hard, one off a BULWARK closed at 29 and barely
     * turned at all, and neither number is anything a player can see a reason
     * for. Energy is energy.
     */
    speed: 132,
    accel: 300,
  },

  /*
   * ---- this block keeps its name, and it is not an oversight --------------
   *
   * The currency became BYTES and `world.energy` became `world.bytes`, but
   * this is not the currency: four of its seven fields are not amounts at all
   * (`pulse` is a radius, `pull` a speed, `tax`/`taxFloor`/`taxCap` are
   * multipliers), it is the SALVAGE system rather than the money, and
   * `CFG.bytes` is already taken by the formatter's own table. Two entries
   * here are also named in `SCALED` by path string, and a renamed leaf there
   * stops being scaled in silence -- which is a fault this repo has already
   * shipped once.
   */
  energy: {
    // How far PULSE reaches to take energy in. Its blast is 340; this is a
    // little wider, because a shockwave that damages a body ought to be able
    // to pull in the energy sitting just past it.
    pulse: 400,
    // A whole object's worth, from its mass, split across the motes it
    // leaves. Taken from the parent rather than the chip: a chip's own mass is
    // small enough that every fragment in the game rounded to the same 1.
    perMass: kB(3.6),
    minValue: kB(1),

    drift: kB(6), // flat, for the harmless ones — income the tally never sees
    // No collection radius. Build 59 took it out: wreckage drifts the whole
    // way in and lands on the turret, and banking it means destroying it --
    // unless INTAKE has been taken, which collects anything that touches.
    /*
     * How hard a loose fragment is drawn turret-ward on its own. It is an
     * ACCELERATION and not a speed -- its one reader is `collectData`'s
     * `e.vx += (dx / d) * S.pull * dt` (enemies.js), i.e. u/s^2 -- and this
     * comment said "units per second" until build 336. `CFG.snare`'s own
     * `pull` beside it IS a target speed, which is how the wrong unit read
     * as plausible. It is in `SCALED`, so the era-2 field pulls harder in
     * proportion to its own depth.
     */
    pull: 26,
    // Attached objects sit on the intake. Five is as bad as it gets.
    tax: 0.78, // multiplier per attached object
    taxFloor: 0.3,
    taxCap: 5,
  },

  // ---- projectiles ----------------------------------------------------
  bolt: {
    speed: 1520,
    r: 4.2,
    damage: 26,
    impulse: 90,
    life: 2.2,
    bounces: 1, // ricochets off the arena side edges
  },

  // ---- physics --------------------------------------------------------
  physics: {
    linearDamping: 0.55, // per-second exponential drag
    angularDamping: 0.9,
    /*
     * A ceiling on how fast anything may spin, in radians a second.
     *
     * There was none, and until build 211 nothing needed one: a round's spin
     * was `spread(push * 0.02)`, a scatter unrelated to where it landed, and
     * the only other source was body-on-body friction. Applying a round's
     * impulse at the point it actually arrived makes the spin real, and real
     * is fast -- the textbook rim value for a stock bolt is 117 rad/s on a
     * SEED, nearly nineteen revolutions a second, which does not read as
     * spinning at all. It reads as a strobe.
     *
     * 9 rad/s is about one and a half turns a second: fast enough that a rim
     * hit is unmistakable, slow enough that the shape stays a shape. Applied
     * in `integrate` rather than at the impact, so every source of spin --
     * collisions included -- answers to the same limit.
     */
    maxSpin: 9,
    correction: 0.72, // positional correction factor
    slop: 0.4,
    /*
     * A soft wall inside the hard one.
     *
     * clampToArena is a hard stop with a bounce: a body that reaches the side
     * is pinned to it and, if it is still steering inward-and-down, it rolls
     * along the edge for as long as it takes to get past. That reads as the
     * simulation running out of room rather than as an object moving.
     *
     * So there is a second, invisible boundary `edgeEase` units in from each
     * side, and anything inside it is nudged back toward the middle. Squared
     * falloff: nothing at the outer limit, firmest right at the wall, so the
     * correction is felt as the object choosing to come away rather than as a
     * force acting on it. The hard clamp stays as the backstop for anything
     * thrown at the wall faster than the nudge can answer.
     */
    edgeEase: 96, // how far in from each side the soft boundary reaches
    edgePush: 300, // and how hard it pushes at the wall itself
    // The floor is a wall too, and a shallower one because the turret sits
    // just above it and nothing should be shoved off its own approach. Without
    // this a drift that has finished coming down simply rests on the bottom
    // edge — measured at fifteen unbroken seconds of vy exactly 0, which is
    // the one thing a thing that never stops is not allowed to do.
    floorEase: 84,
    maxSpeedFactor: 6, // hard clamp relative to a body's own cruise speed
    /*
     * ...and the ceiling for a body that has deliberately been thrown. The
     * ordinary clamp is relative to a body's own cruise, which is right for
     * stopping a chain reaction flinging something to infinity and wrong for a
     * deliberate shove: it clamped a BULWARK's throw on the first frame, so the
     * heavy things barely moved and the throw read as doing nothing to them.
     *
     * The throw was an offer called EBB when this was written; that system went
     * and the anomalies do the shoving now (see `thrown` in enemies.js). The
     * name is reused for a wave TRAIT from build 204 and means something else
     * entirely, which is why it is not used here.
     */
    thrownSpeed: 720,
    /*
     * How long an accumulated shove takes to bleed off, in seconds. See
     * Enemy.shoveFade() for what this is for and what it measured like
     * without it. Deliberate throws are exempt and use thrownSpeed above.
     */
    kickFade: 1.5,
    /*
     * How long a body a PLOW throws is exempt from the ordinary speed clamp.
     *
     * A plowing body (today: a hurled MASS, see CFG.enemyTypes tow.hurl) takes
     * no share of a contact, so the whole impulse lands on what it struck --
     * roughly twice the ordinary share, and well over `cruise * maxSpeedFactor`
     * for anything heavy. Clipped back to that, the struck body cannot get out
     * of the plow's radius, and a contact that cannot separate bills
     * `impactDamage` to both of them every frame at the closing speed.
     *
     * Half a second: long enough to clear, short enough that the body is
     * steering again before it has gone anywhere.
     */
    plowThrow: 0.5,
    collisionDamage: 0.42, // damage per unit of (impact speed * reduced mass)
    collisionThreshold: 62, // impact speed below this is a harmless bump
  },


  /*
   * ---- ORDINAL ---------------------------------------------------------
   *
   * The thing that has been counting, come to look at you.
   *
   * A square frame turning slowly around a core that does not move, with a
   * second frame inside it turning the other way. Both are built out of
   * TALLY segments and both are solid: a round stops in one. The core can
   * only be reached through a hole in both, and the two frames turn at
   * different rates, so the holes you have opened line up and part again.
   * That alignment is the whole rhythm of the fight, and it is why auto aim
   * can finish it -- the assist keeps firing at what is nearest, the shots
   * grind the frame open, and the ones that go through land on the core.
   *
   * DIGITs are garrisoned in the frame rather than placed on the field. They
   * are not part of the structure and they are not spawned by it: they are
   * sitting inside it, and a hole is a door. Break the panel beside one and
   * it leaves, and from then on it is an object like any other.
   */
  ordinal: {
    standoff: 380, // world units above the turret, dead centre
    /*
     * The arrival, as a scene rather than a spawn.
     *
     * It was 3.2 seconds of a frame fading up, which is an object appearing.
     * Nine is long enough to be an event: the sky goes over first and the
     * field is empty for a beat, then the hole opens and widens, then
     * something comes through it and unfolds. Four captions across it, one at
     * a time. Nothing can be hurt until it is over -- the fight starts when
     * ORDINAL is finished arriving, and not before.
     */
    /*
     * Fourteen and a half seconds, and the length is set by the reading
     * rather than the other way round. At nine it ran the first caption for
     * 1.44s — 34 characters a second, of which the first 0.9 was the fade-in,
     * so the line people were meant to read was fully visible for about half
     * a second. The holds below are authored at roughly eleven characters a
     * second, which is a comfortable pace for widely spaced caps, and the
     * fade was cut to 0.4s so a line is legible almost as soon as it is up.
     */
    arrive: 14.4,
    // Beats within the arrival, as fractions of it: sky, hole, through, unfold.
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 40,
    // Two frames. `half` is half the side, `per` the segments per side, `turn`
    // the resting rotation -- a quarter turn makes the inner one a diamond.
    /*
     * A segment's radius is not chosen, it is `half / per` -- half a side
     * divided by the segments on it -- so the segments of a side meet and the
     * frame is solid. At r 15 against a 300-unit side they covered 62% of it
     * and rounds went through the gaps: measured on the first build of this
     * fight, the core was down to 99% while the frame was still at 100%,
     * which is the fight backwards.
     */
    rings: [
      { half: 150, per: 6, spin: 0.20, turn: 0 },
      { half: 94, per: 4, spin: -0.33, turn: Math.PI / 4 },
    ],
    /*
     * Stages are read off progress through the whole thing, not off the core
     * alone -- the core cannot be touched until both frames are open, so
     * core-only staging put every stage change in the last third of the
     * fight and left the first two thirds as one flat grind.
     *
     *   I    from the arrival
     *   II   once half the outer frame is gone: the frames speed up and
     *        reverse, ORDINAL starts mending itself, a second garrison walks
     *   III  once the core is under 60%: it stops waiting
     */
    stageOuter: 0.5,
    stageCore: 0.6,
    /*
     * CONVERGENCE. The beat between the second stage and the third, and the
     * one thing in the fight that happens *to* you rather than being a
     * property of the frame.
     *
     * ORDINAL stops turning, pulls every segment it has left down onto the
     * core until the whole thing is a knot the size of the core itself,
     * holds -- and throws all of them outward at once. They are still solid
     * while they fly, so for two seconds the field is full of ORDINAL going
     * past you, and then the frames rebuild out of whatever survived.
     */
    convergeRebuild: 1, // how much of each frame it puts back first
    convergePull: 1.9, // seconds of the frame drawing in
    convergeHold: 0.55, // ...held at the knot
    convergeThrow: 620, // ...and how hard each segment leaves
    convergeBack: 2.2, // seconds before the survivors are reeled back in

    /*
     * ---- IV: DESCENT ----
     *
     * The angry one, and the only stage that changes where ORDINAL *is*.
     *
     * It has been a fixed installation for the whole fight — a thing at the
     * top of the field you work at. At the last quarter it stops waiting and
     * comes down, slowly, to `close`, with both frames spun to a blur and the
     * core's eye tracking the turret. Four beams turn out of it, and a beam
     * crossing the turret is corruption in its own right: it cannot kill you,
     * but it costs you the intake for as long as it is on you, which is the
     * one currency this fight has ever been able to take.
     */
    /*
     * TALLY, the second setpiece: the count stops and reads back what you
     * took, one ghost per tick, accelerating -- and then the frames come
     * back. ORDINAL is the shortest of the seven and a stage re-partitions
     * health it already had; putting forty panels back is the only thing
     * that adds any.
     */
    tallyAt: 0.34, // core fraction that opens it, once
    tallyFor: 3.6, // how long the reading takes
    tallyHp: 1, // ...and what the frames come back at
    stageDescend: 0.28, // core fraction it comes down at
    close: 235, // ...how near it gets
    descendFor: 13, // ...and how long it takes to get there
    lash: 4, // beams out of the core
    lashSpin: 0.42, // rad/s they turn at
    lashWidth: 0.1, // half-angle of the beam, in radians
    lashShock: 0.34, // corruption while one is across the turret
    lashEvery: 2.6, // seconds between sweeps
    lashFor: 1.5, // ...and how long a sweep lasts
    // ...how fast the frames turn. IV also multiplies the stored spin by 2.1
    // once, on entry, so the last figure here is not the whole of it: 2.6 x
    // 2.1 is about five and a half times the first stage, which is a blur
    // without being a strobe.
    spin: [1, 1.8, 2.9, 2.6],
    garrison: [12, 9, 14, 18], // ...how many DIGITs are inside when it starts
    repair: [0, 7.5, 7, 6], // ...seconds between repair pulses, 0 for never
    repairHp: 0.5, // and how much of a panel comes back
    /*
     * ...and the most of a frame it may ever put back. Uncapped, ORDINAL
     * simply out-healed a base turret: measured over a driven fight, the
     * outer frame went from 25% back to 100% between the 70th and 140th
     * second while the core barely moved. A boss that mends faster than you
     * break is not a stage, it is a wall.
     *
     * The inner frame is mended first, because that is the one standing
     * between you and the core.
     */
    repairCap: 0.75,
    /*
     * ...seconds between the core throwing DIGITs itself, 0 for never.
     *
     * It was 3.4 for three. Auto aim takes what is nearest and a DIGIT is
     * always nearer than a core 380 units up the field, so a burst that fast
     * simply parked the turret's whole output on the garrison: measured,
     * stage III ran 140 seconds of a 216-second fight with the core creeping
     * down a percent at a time. The garrison is pressure, not a wall.
     */
    burst: [0, 0, 5.5, 3.8],
    burstOf: 2,
    /*
     * The death, as a sequence rather than an explosion. Four beats, timed on
     * the real clock so the slow-motion does not stretch them:
     *
     *   ARREST      the frames stop dead and come apart segment by segment
     *   INFALL      the core draws the whole field into itself
     *   DETONATION  and lets go of all of it at once
     *   AFTER       the REMAINDER rises out of what is left
     *
     * It is the only time the field stops, and it is meant to be the thing
     * someone points a camera at.
     */
    arrest: 0.7, // segments snapping off, staggered
    infall: 1.1, // ...then the core pulling everything in
    /*
     * Two clocks, on purpose. `endFor` is how long the sequence lasts, which
     * is set by how long three outro captions take to read; `slowFor` is how
     * long time itself is slowed, which is set by how long slow motion is
     * interesting. Tying them together left the field at half speed for six
     * seconds of reading.
     */
    endFor: 13.4,
    pull: 900, // how hard the infall drags loose bodies
    pay: kB(900), // bytes on the floor when it lets go
    /*
     * REMAINDERs a NEW FORM costs, and the reconciled count it asks for --
     * ONE constant, read by the node's `cost`, by its `needs`, by the menu row
     * that prints the requirement and by the pill that counts them in. It was
     * the price here and a literal `7` in `upgrades.js` until build 299, which
     * is a defaulted-value shape: two writers for one ruling.
     *
     * FOUR from build 299, down from seven, because the ladder is seven slots
     * to a ceiling of 49 and only six of them sit under `eraGate`. At seven it
     * was a deadlock rather than a price: the run is held at rung 42 having
     * reconciled six, the seventh anomaly stands at 49 on the far side of that
     * hold, and the only way through the hold needed the one thing the hold
     * made unreachable. Four is the count standing on rung 28, which is where
     * the form change is going (see the plan's phase 5) and is under the hold
     * wherever `eraGate` ends up.
     */
    recast: 4,
  },

  /*
   * ---- GNOMON, anomaly II ----
   *
   * ORDINAL's problem was alignment: two frames turning at different rates,
   * and you waited for your holes to line up. GNOMON is that inverted. The
   * holes you make in the dial stay exactly where you put them -- and what
   * moves is the *shadow*, thrown by a needle sweeping out of the middle.
   *
   * A round that crosses the shadow decays and dies. So the dial is not the
   * only thing between you and the core: the light is, and the light is on a
   * clock. Everything else here is a consequence of that one idea.
   */
  gnomon: {
    standoff: 380,
    arrive: 14.6,
    // sky, hole, through, unfold -- the same staging as ORDINAL, because it
    // is the staging of an arrival rather than anything about ORDINAL.
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 40,
    /*
     * The dial: one ring of arcs.
     *
     * `r` on the type is 30, and 16 arcs at radius 150 need to be at least
     * that to meet: the circumference is 2*pi*150, a shade over 942, and 16
     * segments across it want a diameter of 58.9. Under that and rounds go
     * through the gaps, which is the same bug ORDINAL shipped once and the
     * same arithmetic guards it -- see scripts/check-build.mjs.
     */
    dialR: 150,
    arcs: 16,
    dialSpin: -0.16, // the dial turns one way...
    /*
     * ...and the needle the other, which is what makes the shadow sweep
     * across holes that are themselves moving. Signed, and multiplied by the
     * stage, like ORDINAL's frames.
     */
    needleSpin: 0.30,
    needleLen: 232, // reaches well past the dial, so the shadow is thrown wide
    needleSeg: 6, // collinear bodies making it up: the physics has only circles
    needleR: 11,
    /*
     * The shadow. `half` is half its angle, so 0.52 is a wedge of about 60
     * degrees. A round inside it decays; the turret inside it is corrupted,
     * which is the one currency a boss is allowed to take.
     */
    shadowHalf: 0.52,
    shadowShock: 0.3,
    shadowFrom: 46, // no shadow inside this radius: the core is not in its own
    /*
     * NOON. The setpiece, when half the dial is gone: the needle spins up and
     * throws its shadow once round the whole field. Everything in flight
     * dies, every SECOND still waiting leaves at once, and the dial puts part
     * of itself back -- so the answer to NOON is to have been ahead of it.
     */
    noonAt: 0.34, // dial fraction it fires at
    noonSpin: 7.5, // rad/s while it runs
    noonFor: 3.4,
    noonRebuild: 0.9, // how much of the dial it puts back
    // Stages, read the same way ORDINAL's are: off the dial, then the core.
    stageCore: 0.5,
    stageDescend: 0.25,
    close: 235, // how near it comes in IV
    descendFor: 12,
    // ...how fast the needle turns per stage, and how many needles there are.
    spin: [1, 1.5, 2.1, 2.4],
    needles: [1, 2, 2, 1], // II grows a second one; IV plants the survivor
    garrison: [11, 8, 13, 16],
    /*
     * Seconds between mends, 0 for never -- and III is 0 on purpose.
     *
     * GNOMON has one dial where ORDINAL has two frames, so mending it in the
     * late stages puts the wall straight back between you and the core.
     * Measured with III mending on a 7-second clock: the core went from 53%
     * to 39% over a hundred and thirty seconds while the dial oscillated
     * between an eighth and a third of itself, which is not a stage, it is a
     * treadmill. Mending belongs to II, where re-opening the dial *is* the
     * stage.
     */
    repair: [0, 8, 0, 0],
    repairHp: 0.5,
    repairCap: 0.75,
    /*
     * ...and how often the core throws SECONDs itself. Auto aim takes what is
     * nearest and a SECOND is always nearer than a core, so a fast burst
     * simply parks the turret's whole output on the garrison. Pressure, not a
     * wall -- the same lesson ORDINAL's stage III taught at 3.4 seconds.
     */
    burst: [0, 0, 7.5, 5.5],
    burstOf: 2,
    /*
     * IV. The needle comes down: it stops being a sweep and becomes a wall,
     * planted beside the turret, pulsing rings of shadow out of where it fell.
     * It is the one thing in this fight that does not move again.
     */
    /*
     * MIDNIGHT. The second setpiece, on the way into IV, and the counterpart
     * to NOON: both needles to twelve, the dial put back whole, and then one
     * revolution at speed that darkens every arc it passes -- still solid,
     * still in the way, no longer lit.
     *
     * It is also this fight's length. A stage re-partitions health it already
     * had; putting the dial back is the only thing that adds any.
     */
    midnightAt: 0.26, // core fraction that opens it, once
    midnightHp: 1, // ...and what the dial comes back at
    midnightFor: 4.2, // one full revolution
    /*
     * ...and once the needle is down the shadow swings out of IT rather than
     * out of the core. A planted needle used to throw no wedge at all and
     * stage IV measured 0.4% corrupted frames against 32-34% for II and III:
     * the best pressure mechanic in the game switching itself off for the
     * finale, in the fight that has it.
     */
    plantSweep: 0.5, // rad/s the planted shadow goes round
    plantAt: 150, // how far to the side of the turret it lands
    plantPulse: 2.8, // seconds between the rings it throws
    endFor: 13.6,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- FRACTAL, anomaly III ----
   *
   * ORDINAL was a wall you opened. GNOMON was a light you waited on. This is
   * neither: it is depth. Three generations of the same triangle, each
   * orbiting the one above it, and your rounds meet the smallest first.
   *
   * The rule that makes it a fight rather than a stack: breaking a middle
   * piece does not remove three small ones, it *frees* them. They stop being
   * armour and become sovereign objects with ordinary appetites. So the
   * fight's pressure and the fight's armour are the same bodies, and you
   * choose which they are by what you break -- and it never gains a body it
   * did not arrive with, which is what keeps it legible.
   */
  fractal: {
    standoff: 380,
    arrive: 14.4,
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 64,
    // Three middles, three smalls each. Sierpinski is three-fold; so is this.
    mids: 3,
    mites: 3,
    /*
     * How far each generation sits from its parent -- and these are the two
     * numbers that decide whether this boss looks like what it is.
     *
     * A Sierpinski triangle's three children sit ON the parent's corners:
     * half the size, half the distance, same orientation. At the old 150 the
     * middles floated eighty-six units past the core's corner and the whole
     * figure read as a solar system rather than as a shape containing itself
     * -- which is the one idea this fight has. The core's own drawing has
     * been a proper subdivision since it was written; nothing outside it
     * matched.
     *
     * The core's vertex is at its radius, 64. A middle of radius 30 centred
     * at 96 has its inner edge at 66, so it sits on that corner. Same
     * arithmetic one level down: a middle's vertex is at 30, a small of
     * radius 13 centred at 44 has its inner edge at 31. `miteR` was already
     * right; only the generation above it was wrong.
     */
    midR: 96, // how far the middles sit from the core -- ON its corners
    miteR: 44, // ...and the smalls from their middle, by the same arithmetic
    midSpin: 0.24,
    miteSpin: -0.62,
    // II makes the orbits eccentric and counter-rotates the generations, so
    // the shape you learned in I stops being the shape.
    eccentric: 0.34,
    /*
     * RECURSION. The setpiece, on the first middle broken: everything left
     * collapses onto the core and reassembles into the whole figure once, at
     * part health. It is the only heal in the fight and it is a scene rather
     * than a drip -- which is the difference between "it is mending" and "it
     * remembers what it was".
     */
    recurseIn: 1.5,
    recurseHold: 0.5,
    recurseOut: 1.2,
    recurseHp: 1,
    /*
     * ...and the cap that stops it being a wall. It may only ever put back
     * what it arrived with, so a fight it is losing cannot be turned into a
     * fight it is winning -- see law 7, and see what an uncapped ORDINAL
     * measured like.
     */
    replaceEvery: 9, // seconds between replacing a lost small, 0 for never
    // III: the core divides. Three pieces, a third of the size and a third of
    // what is left of its health each, orbiting wide.
    splitAt: 0.68,
    pieces: 3,
    pieceR: 34,
    pieceOrbit: 168,
    /*
     * How far either side of straight up the pieces sweep in IV. Inside the
     * assist's own cone of 1.36 rad on purpose -- see the note in place().
     * A full orbit round the turret looks like a siege and measures like a
     * blindfold.
     */
    pieceArc: 1.2,
    pieceSpin: 0.38,
    /*
     * IV: whatever is left comes for you.
     *
     * Read off the health rather than off "one piece remaining", which is how
     * it was first written and measured at eight tenths of a second: auto aim
     * takes what is nearest and so spreads its damage evenly across the three
     * pieces, which means the second-to-last and the last die within a breath
     * of each other. A stage that lasts less than one of its own captions is
     * not a stage.
     */
    /*
     * DESCENT. The second setpiece, and the one the back half of this fight
     * did not have: on the way into IV the whole figure knots down onto the
     * three pieces and comes back one level LOWER -- each piece carrying its
     * own middle and that middle its own three smalls, so the field holds
     * three complete copies of the shape instead of one.
     *
     * It is also where this fight gets its length. A new stage adds no time;
     * it re-partitions health that was already there. Putting the structure
     * back at `descentHp` is the only thing that does, and it is the same
     * bodies it arrived with -- the conservation rule is not bent for it.
     */
    descentAt: 0.2, // core fraction that opens it, once
    descentHp: 1, // ...and what the figure comes back at
    subR: 64, // a middle's distance from its piece: on the piece's corner
    huntAt: 0.18,
    closeOrbit: 180,
    closeFor: 9,
    shedEvery: 4.2,
    spin: [1, 1.5, 2.0, 2.3],
    endFor: 13.4,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- AMPLITUDE, anomaly IV ----
   *
   * Every boss so far has been a structure around a centre: a frame, a dial,
   * a set of orbits. This one is a *waveform*. Fourteen segments strung along
   * a travelling sine, head at the leading end, and where any one of them is
   * depends on when you look rather than on where it started.
   *
   * The rule that makes it a fight: breaking segments SHORTENS the wave, and
   * a shorter wave swings HIGHER. Its amplitude grows as its body shrinks, so
   * the troughs dip nearer the turret the better you are doing. It leans in
   * as it loses, which is the opposite of every other fight in the game.
   */
  amplitude: {
    standoff: 380,
    arrive: 14.4,
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 34,
    segs: 14,
    /*
     * How wide the wave is drawn and how tall it swings.
     *
     * `span` is deliberately narrower than the field, and that is law 2 being
     * paid for rather than hoped for. Across the field's full 629 a segment
     * parked at the edge sits 493 from the turret against a base aim range of
     * 400 and could never be shot at all. At 460 the far end is 230 across,
     * and a trough of 110 brings it to 355 -- in range at full length, before
     * the swing has grown at all. The growing swing then takes it to 300,
     * which is escalation rather than rescue. Measured at three body lengths
     * by the suite, and per body class by scripts/fight.mjs.
     */
    span: 460,
    swing: 110, // amplitude at full length...
    swingGrow: 90, // ...and how much of it is bought by breaking the body
    waves: 1.6, // how many periods fit across the span
    freq: 0.62, // rad/s the wave travels at
    slide: 84, // how far the whole serpent drifts side to side
    slideRate: 0.24,
    /*
     * RESONANCE. On the way into II the whole serpent comes down the field,
     * passes over the turret and goes back up. It is the one beat of this
     * fight that happens *to* you: the segments are still solid, so for three
     * seconds the field is a wave going past, and touching one is corruption.
     */
    resonanceFor: 4.2,
    resonanceShock: 0.32,
    // Stages.
    stageBody: 0.5, // body fraction that triggers RESONANCE and II
    stageCore: 0.62,
    stageCoil: 0.45,
    freqMul: [1, 2, 1.7, 1.4],
    /*
     * III: two waves, out of phase, one high and one low. The segments split
     * between two strands and the lane between them breathes.
     */
    strandGap: 128,
    strandPhase: Math.PI,
    /*
     * IV: the coil. What is left wraps a ring round the turret and contracts
     * to a floor -- pressure, never a crush. Nothing in this game kills you,
     * and a ring that closed to nothing would be the first thing that did.
     */
    coilFrom: 240,
    coilTo: 150,
    /*
     * ...and it is an ARC over the turret rather than a ring around it. A
     * closed ring puts a third of itself behind the shoulder, where the
     * assist's cone ends and a body is not a target at any distance. 1.2 rad
     * either side of straight up is inside the 1.36 it allows.
     */
    /*
     * How near the head is kept, whatever the wave is doing. A wide sine
     * cannot have all of itself inside a 400 aim range and the segments
     * cycling in and out of reach is the fight -- but the thing whose death
     * ends this is not allowed to swim out of the world. See place().
     */
    reach: 370,
    coilArc: 1.2,
    coilRock: 0.34, // ...and it rocks about that rather than revolving
    coilFor: 11,
    coilSpin: 0.5,
    /*
     * ...and what the wave gathers back to make the ring out of.
     *
     * The body is reliably gone by the middle of the fight, which left the
     * coil -- the whole point of stage IV -- with nothing to be a ring of.
     * The first answer was a slow capped mend through the late stages, and it
     * did not work twice over: mending from II made stage II forty-three
     * percent of a four-hundred-second fight, and mending in III achieved
     * nothing at all, because a segment restored into a trough that now dips
     * to eighty units from the turret is deleted before it has finished
     * arriving.
     *
     * So it is not a drip, it is a beat: on the way into IV the wave gathers
     * this many segments back at once, at part health, and that is the ring.
     * Once, like NOON and RECURSION, and nothing after it -- what closes on
     * you is what you left it.
     */
    gather: 6, // (unused: the coil takes the whole body back now)
    gatherHp: 1,
    /*
     * OCTAVE, on the way into III: the body comes back whole and the wave
     * folds into four strands a quarter period apart. Two strands was a pair
     * of lines; four is interference. It is also where the back half of this
     * fight gets its length -- a stage re-partitions health it already had.
     */
    strands: 4,
    octaveHp: 0.55,
    /*
     * ...and what it throws off the top of itself, on a clock.
     *
     * Slow, because auto aim takes what is nearest and a DROPLET falling
     * toward the turret is always nearer than a wave at standoff. At 6.5
     * seconds the droplets absorbed 63% of everything the turret produced
     * across a five-hundred-second fight -- the whole of it was spent
     * shooting the spray rather than the thing making it. The same lesson
     * ORDINAL's garrison and GNOMON's SECONDs each taught once: pressure,
     * not a wall.
     */
    fling: [11, 9.5, 8.5, 7.5],
    flingOf: 2,
    endFor: 13.6,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- DYNAMO, anomaly V ----
   *
   * A closed circuit. Three pylons in a compact triangle, arcs between them,
   * and a core that is not anywhere in particular: it sits AT a pylon, and
   * every few seconds it is at a different one.
   *
   * While the circuit is closed the core is armoured, and every pylon you
   * take out opens it further -- so the fight is about the legs rather than
   * about the thing standing on them, right up until there are no legs left.
   *
   * A teleporting boss is the one archetype that is *more* comfortable on
   * auto aim than under a thumb: the assist retargets on the blink for free,
   * where a person would be chasing it. Everything else here is built on
   * that -- the telegraph exists so you can see it coming, not so you can
   * react to it.
   */
  dynamo: {
    /*
     * Nearer than the others, and that is law 2 being paid for.
     *
     * The pylons are a triangle around this point, so the far two sit at
     * standoff + inset/2 vertically. At 320 and 96 that is 368 up and 83
     * across, which is 377 against a base aim range of 400. At the plan's
     * original spread they were 430 out and the fight could not be started.
     */
    standoff: 320,
    inset: 96, // how far each pylon is from the middle of the triangle
    arrive: 14.4,
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 36,
    /*
     * The blink. `telegraph` is how long the arc to the next pylon brightens
     * before the core is there -- it is the whole of the tell, and without it
     * a teleport is just a discontinuity.
     */
    blinkEvery: 5.2,
    telegraph: 0.8,
    blinkFast: 0.68, // the multiplier on it once the circuit is broken
    /*
     * ...and it keeps blinking after the circuit is gone.
     *
     * It did not, and that was the whole of what was wrong with this fight.
     * The blink -- the telegraph, the arc lighting up, the thing that makes
     * this boss this boss -- ran only in stages I and II, which are exactly
     * the stages where the core is sheltered and cannot be touched. So its
     * signature happened entirely while the player was shooting something
     * else, and then stopped for the remaining three quarters of the fight.
     * In III and IV it blinks between stations on its own orbit instead.
     */
    orbitStops: 6,
    /*
     * ...and with one leg left it paces around that instead of standing on
     * it, so the blink survives the stretch of II between SURGE and III.
     *
     * That comment sat over nothing for six builds. The fix it describes was
     * built in 134, cost thirty percent of the fight length for reasons three
     * isolation runs could not name, and was rolled back -- leaving the
     * config asserting a behaviour the module did not have. Measured, thirty
     * one seconds of stage II produced a single blink: the mechanic this boss
     * is named for, switched off for the stage in the middle of it.
     *
     * It comes back as a slide ACROSS the leg -- stations on the line
     * perpendicular to the turret, so the distance barely changes. The two
     * other geometries were both measured and both cost the fight: a full lap
     * (the 134 version) hides the core behind its own leg for half of every
     * turn, and an arc across the near face makes the core nearer than the
     * pylon, so auto aim spends the whole stretch on it and the bar is under
     * the stage IV threshold before the last leg falls.
     */
    pylonStops: 4,
    pylonOrbit: 74,
    /*
     * The circuit turns. Three towers standing still for a quarter of the
     * fight is a still image; turning, the arcs sweep the field and the
     * geometry is different every few seconds.
     */
    circuitSpin: [0.11, 0.24, 0.4, 0.55],
    /*
     * ...and II is read off how chewed the circuit is, not off a leg falling.
     *
     * A turning circuit does not deliver legs one at a time: three pylons
     * sweep past each other, auto aim takes whatever is nearest, and the
     * damage lands on all three. The first one dies at about a third of the
     * circuit's health left and the other two go almost together, so "a leg
     * has fallen" put 70% of the leg phase in stage I -- 67 seconds against
     * 21. At 0.55 the two halves of it are about the same size.
     */
    crackAt: 0.5,
    /*
     * ...and every blink discharges. The pylon it left fires a lance down
     * the arc it travelled, and crossing that lance is corruption -- so the
     * telegraph is a warning about two things at once: where it is going,
     * and where the field is about to be dangerous.
     */
    lanceFor: 1.2,
    lanceWidth: 32,
    lanceShock: 0.32,
    /*
     * How much damage the core ignores, indexed by pylons *gone*: none yet,
     * one, two, all three. So it starts armoured and opens as you take the
     * circuit apart, which is the fight.
     *
     * Written the other way round first -- the array read as "by pylons still
     * standing" while being indexed by pylons destroyed -- so the core was
     * softest with its circuit whole and became a wall once you had broken
     * it. Measured, stage IV was 47% of the fight and the core absorbed 38%
     * of everything while all three legs were up.
     *
     * Never a wall in either direction: the damage formula floors every hit
     * at 1, so a whole circuit is the slow way in rather than no way in.
     *
     * The first two figures are high because they have to make the legs the
     * obvious answer. At 0.82 and 0.6 the core simply died during stage II --
     * it blinks between pylons and so is often the nearest thing, and auto
     * aim takes the nearest thing -- which meant the circuit came down after
     * the fight was already decided and stage III lasted a single frame.
     */
    shield: [0.88, 0.72, 0.45, 0.15],
    /*
     * IONs ride the arcs. `railFor` is how long one takes to travel a link
     * before it drops off onto the field, which is the pressure this boss
     * makes -- slowly, because a boss whose spray is nearer than its core is
     * a boss you never get to shoot. Three of the four before this one
     * shipped that mistake once each.
     */
    railEvery: [13, 11, 10, 9],
    railFor: 2.6,
    railOf: 2,
    /*
     * From II the discharge earths instead of running back along the arc:
     * the leg the core has just left dumps what it was carrying at the
     * ground, somewhere along the bottom of the field rather than at you.
     * How far off the turret it can land is the whole of its rate -- at 260
     * against a lance width of 32 it lands across you on about a quarter.
     *
     * This replaced a sweep along the links between surviving pylons, which
     * could not reach: the circuit stands at standoff, and by II there are two
     * pylons left and so exactly one link, three hundred away. It fired zero
     * times in every stage of every fight for six builds.
     */
    earthSpread: 260,
    // IV: the propeller corrupts while a blade is across you, within this
    // many radians of the line to the turret, rather than the whole time it
    // is inside `close` -- which, descended, is permanently.
    bladeArc: 0.42,
    arcShock: 0.3,
    /*
     * SURGE, on the second pylon. The grid overloads: every arc whips a full
     * turn around its pylon, the field strobes, and everything riding drops
     * at once. Once, like NOON and RECURSION.
     */
    surgeFor: 3.2,
    surgeSpin: 6.5,
    // III: the core lets go of the ground and works its way round *you*,
    // station to station, trailing a leash back to whatever pylon is left.
    // The radius keeps it inside aim range by construction rather than luck.
    orbitAt: 300,
    orbitSpin: 0.42,
    /*
     * EARTH, on the way from III to IV. The circuit comes back at 40% and the
     * whole of it dumps at the ground on one frame -- a curtain down the
     * field, and the core taken back into shelter behind it.
     *
     * It is also this fight's only length. A stage boundary re-partitions
     * health the boss already had; three pylons at 40% is about thirty
     * seconds of shooting that did not exist, and it lands in the half of the
     * fight that had one beat in it.
     */
    earthFor: 4.6,
    curtainFor: 1.6, // how long the bolts burn, on the frame clock
    earthHp: 0.4,
    earthShock: 0.5, // one jolt, on the frame the curtain lands
    /*
     * IV: the propeller works an arc over the turret rather than a full
     * circle around it.
     *
     * A full circle is half a stage spent behind the ±78° shoulder, and the
     * probe measured exactly that: 43% of stage IV with no legal target on
     * the field at all, the nearest body inside the cone 1% of the time, and
     * damage per shot collapsing from 20 to 9.5. The worst stage in the game,
     * and it was geometry rather than balance. 1.15 keeps it inside 66°.
     */
    orbitArc: 1.15,
    orbitRock: 0.8,
    trailFor: 0.5, // ...and the blades leave half a turn of afterimage
    // IV: the last pylon collapses into it and the pair becomes a propeller.
    stageTriad: 0.25,
    bladeR: 92,
    bladeSpin: 2.2,
    close: 250,
    descendFor: 11,
    // The death: chained lightning walking outward, then the one blackout in
    // the game. Hard-capped, and the core glows through it -- a dark frame
    // that lingers reads as a crash rather than as a beat.
    darkFor: 0.5,
    endFor: 13.8,
    pull: 900,
    pay: kB(900),
  },

  /*
   * ---- PARITY, anomaly VI ----
   *
   * Two mirrored crescents orbiting a point, a hundred and eighty degrees
   * apart, sharing one bar -- and only one of them is real at a time. They
   * trade places on a clock, and the one that is not real is a wireframe
   * standing exactly where it would be if it were.
   *
   * Two rules, and they pull against each other on purpose:
   *
   *   Panes break in pairs. Shatter one and its twin on the other crescent
   *   goes with it, so damage on the structure is doubled and the mirror
   *   stays a mirror. That feels generous.
   *
   *   Only the real half takes damage to the bar. The phased one is out of
   *   the world entirely -- the parked mechanism, the same one DYNAMO's core
   *   uses inside its circuit -- so half of what you might shoot is a
   *   picture. That is what the generosity is paying for.
   */
  parity: {
    /*
     * Nearer than most, because the crescents orbit: the far one sits at
     * standoff + orbit, and it is the orbit that carries every part of it
     * through aim range rather than any one position doing so. At 300 and 90
     * the near half is 210 out and the far one 390, and they trade every few
     * seconds.
     */
    standoff: 300,
    orbit: 90,
    orbitSpin: 0.34,
    arrive: 14.4,
    beats: [0.14, 0.36, 0.6, 1],
    coreR: 38,
    panes: 7, // per crescent, so fourteen and every one has a twin
    paneArc: 1.5, // radians of the crescent's edge they are spread across
    /*
     * ...and how far off the crescent's centre they sit.
     *
     * Must clear the crescent's own radius of 38, or they are buried in it:
     * at 30 the first pair broke and then nothing, because everything behind
     * the first row was further from the turret than the crescent itself and
     * auto aim went back to the body. At 52 they stand proud, and the near
     * half's panes are 158 out against its own 210 -- which is what makes
     * them armour rather than decoration.
     */
    paneR: 52,
    /*
     * The swap. `tell` is how long the pair spends visibly trading -- both
     * ghosting -- before the change lands. Without it a phase flip is a
     * discontinuity, which is the same thing DYNAMO's telegraph exists for.
     */
    swapEvery: [5.4, 3.2, 2.6, 0],
    tell: 0.5,
    // II makes the mirror-line precess and the orbit breathe.
    eccentric: 0.3,
    lineSpin: [0.12, 0.22, 0.7, 1.4],
    /*
     * ...and the seam is live. Standing on the mirror-line is corruption, and
     * the turret sits directly below the hub, so the line comes onto it twice
     * per precession however fast that is going. At 34 against a standoff of
     * 300 the window is about seven percent of each turn: an occasional bite
     * with a visible tell -- the line itself, sweeping toward you -- rather
     * than the nothing at all this fight applied before it.
     */
    seamWidth: 34,
    seamShock: 0.3,
    /*
     * MERGE. On the way into III the halves rush together and try to fuse:
     * both fully real for a few seconds, which is the fight's one window of
     * genuinely double damage. It is dressed as a threat and it is an
     * opportunity, and it is the only heal it ever gets -- capped, and only
     * if you waste it.
     */
    /*
     * MERGE has to come after the mirror is visibly going, or it lands while
     * the fight is still in its first stage and II gets a single frame on the
     * way past. Measured with the merge at 0.6 and II at half the panes: the
     * pool crossed 60% well before the panes crossed 50%.
     */
    mergeAt: 0.58,
    // ...so II is read off the panes going, rather than half of them gone.
    crackAt: 0.7,
    mergeFor: 3.6,
    mergeHeal: 0.06, // of the bar, if the window closes with both halves whole
    /*
     * INVERSION, and then IV.
     *
     * The old IV shattered one crescent, which threw the premise away: one
     * crescent is not a mirror, and the last stage of the mirror fight had no
     * mirror in it. Now the twin is retired from reality rather than from the
     * field -- it stays, wireframe, mimicking the survivor exactly, and every
     * pane you take is taken from it too. What changes at IV is not that the
     * mirror ends but that it is provably empty.
     *
     * INVERSION is the beat that turns it. The halves trade *places* while
     * the seam sweeps a full turn, reality flips at the midpoint -- the
     * picture becomes the thing, standing where the thing was -- and the
     * panes come back. It is the only thing in this fight that adds length:
     * fourteen panes at 55% is about thirty seconds of shooting, and a stage
     * boundary moved is only a re-partition of health already there.
     */
    loneAt: 0.3,
    invertFor: 4.2, // the sweep, before the panes come back
    invertHp: 0.55, // ...and what they come back at
    flailSpin: 2.4,
    close: 240,
    descendFor: 11,
    /*
     * ...and what it throws, always two at once, mirrored.
     *
     * Slow, for the reason every boss before it has had to learn once: auto
     * aim takes what is nearest and an ECHO on its way in is always nearer
     * than a crescent at standoff. At 9.5 seconds they absorbed sixty-four
     * percent of everything the turret produced.
     */
    echoEvery: [16, 14, 12, 10],
    endFor: 13.6,
    pull: 900,
    pay: kB(900),
  },
  /*
   * ---- TERMINUS. Anomaly VII, crimson. The capstone. ----
   *
   * The one boss that does not stand in front of the turret. It is a ring
   * centred *on* you, and the fight is about how much of it is left.
   *
   * Every number here is bounded by the field rather than chosen. The world is
   * 629 x 1361 and the turret sits at (315, 996), so the largest circle
   * centred on the turret that stays on the field has radius 314 -- the sides
   * bind, not the top and bottom. That is the only reason `ring` is 250 and
   * not the plan's 360: the core rides just outside the ring at 1.1x, and 250
   * is what puts its far edge exactly on the margin instead of sliding off
   * the side of the world twice a lap.
   *
   * The happy consequence is that law 2 is free here for the first time: a
   * ring centred on the turret puts EVERY segment at exactly `ring` from it,
   * so at 250 against a base aim range of 400 there is no far side to worry
   * about. It is the only boss in the game with that property, and it is the
   * one whose whole subject is distance.
   */
  terminus: {
    /*
     * It materialises out past aim range and comes in during the arrival --
     * the threat legible before the fight is, law 2 restored the moment
     * damage becomes possible. 420 is deliberately just outside 400.
     */
    edge: 420,
    ring: 250, // where it settles, and the widest it ever is once live
    floor: 180, // ...and the tightest. Law 3: it presses, it never crushes.
    arrive: 21.6, // the longest arrival in the game, and its six beats need it
    beats: [0.12, 0.3, 0.52, 1],
    coreR: 40,
    /*
     * 32 segments, because the ring has to CLOSE.
     *
     * Same arithmetic as ORDINAL's frames and GNOMON's dial, and the same bug
     * it guards against: 32 bodies round a circle of radius 250 each need a
     * radius of at least pi*250/32 = 24.5, or rounds fly between them and the
     * boundary is not one. BOUND is r 30. The plan said 28 segments of r 15,
     * which is a ring with a third of its circumference missing -- caught by
     * scripts/check-build.mjs on the first run, which is what that check is
     * for.
     */
    segs: 32,
    /*
     * The second ring, from II. Sparser ON PURPOSE -- 12 bodies where a
     * closed ring at that radius would need 24 -- because two closed rings is
     * a wall and the stage is meant to be two lattices of moving gaps that
     * occasionally line up. It is the only structure in the game that is
     * deliberately permeable, and check-build asserts that it stays that way.
     */
    innerSegs: 12,
    innerAt: 0.62, // as a fraction of the outer radius, so they close together
    spin: [0.1, 0.15, 0.2, 0.26],
    innerSpin: -0.34, // counter-rotating
    /*
     * The squeeze, which is this fight's pressure and its clock at once.
     *
     * Where the ring WANTS to be is set by how much of it is still standing,
     * so "break gaps faster than it closes them" is not a figure of speech:
     * it is the sign of one subtraction. Out is smooth and in is a step --
     * opening lets it spring back at `relax` in the frame you earn it, while
     * closing waits on the lurch clock below. Nothing is thrown at you here.
     * The corruption is the boundary being near, and it is entirely yours to
     * govern.
     *
     * A `contract` rate in units/sec sat here until build 186, left behind
     * when the close became a step; nothing had read it since.
     */
    relax: 30, // how fast an opened ring springs back out
    // How far toward the floor the boundary is permitted to close, per stage.
    // This is the escalation, and ECLIPSE is where it is finally allowed all
    // of it. See stepSqueeze for the build where it was not permissioned.
    tight: [0.55, 0.75, 1, 1],
    /*
     * ...and it closes in STEPS, not as a slide.
     *
     * `lurchEvery` is the clock, `lurchBy` the size of one step, and
     * `pulseFor` how long the shockwave it sends ahead of itself takes to
     * cross you -- which is the only window in which the boundary corrupts
     * anything. Before this the squeeze corrupted every frame it was near:
     * seventy-six percent of stage I and ninety-five percent of stage II
     * spent glitching, which is a screen effect rather than a mechanic. Same
     * pressure, a tenth of the duty, and something to watch coming.
     */
    lurchEvery: [5.4, 4.0, 3.2, 3.4],
    lurchBy: 13,
    pulseFor: 0.5,
    squeezeFrom: 0.22, // fraction of the way to the floor before it bites
    squeezeShock: 0.4,
    /*
     * The patrol. The core rides the ring rather than sitting at its centre,
     * and while it patrols it rides *outside* it -- which is what makes it
     * unshootable without a single point of armour doing the work.
     *
     * Auto aim takes the nearest thing. A core at the ring's own radius is
     * exactly as near as thirty-two segments and ties with all of them; a
     * core outside the ring is strictly further than every one of them, and
     * the assist cannot pick it while any segment lives. This is the fifth
     * boss to need that lesson and the first to get it from geometry alone.
     */
    patrolOut: 1.1, // radius multiplier while patrolling
    patrolSpin: 0.52,
    /*
     * ...and the mend, which is the only time it is anywhere near you.
     *
     * To put a segment back it has to dip INSIDE the ring, where it is nearer
     * than everything else and the assist takes it instantly. So the fight is
     * a trade it makes with itself: every piece of ring it restores costs it
     * a window. Capped, like every heal in this game -- once the budget is
     * spent it stops trading and there is nothing left to do but finish the
     * ring.
     */
    /*
     * ...and it has to dip inside the INNER ring, not merely inside the outer
     * one. At 0.7 the mending core sat at 175 while the second ring stood at
     * 150, so from stage II onward the one window this fight gives you was
     * not a window at all: the assist went on taking the nearer thing, which
     * was the boundary. Kept a clear step under `innerAt`.
     */
    mendIn: 0.5, // radius multiplier while mending
    mendFor: 2.8,
    mendEvery: 1.6, // rest between mends
    mendHeal: 0.45, // of a segment's bar, per mend
    mendCap: 6, // ...and how many it will ever do
    armorPatrol: 0.55,
    armorMend: 0.05,
    // Stages.
    stageInner: 0.88, // outer-ring fraction that brings the second ring
    /*
     * What opens ECLIPSE, and there are two doors into it because the fight
     * has two clocks.
     *
     * The core is by construction hard to reach early -- it is outside its
     * own ring except while mending -- so a core-only trigger meant stage II
     * ran until the entire boundary was gone AND the core had been ground to
     * 60% with nothing left to shoot: measured, II was forty-four percent of
     * a five-hundred-and-forty-second fight. The boundary being spent is the
     * other way in, and dramatically the better one: the edge is nearly gone,
     * so it slams shut for one beat and shows you what it was made of.
     */
    eclipseAt: 0.6, // core fraction that triggers ECLIPSE, once...
    eclipseRing: 0.5, // ...or what is left of the boundary, whichever first
    /*
     * ...and the one that starts the last stage, set high on purpose. III is
     * over once its frame is gone -- about twenty seconds, because a compact
     * double square is a splash magnet -- and everything after that was a
     * lone core. IV is where the interesting half of this fight lives now, so
     * IV gets most of the bar.
     */
    stageBare: 0.62,
    /*
     * ECLIPSE. Both rings slam to the floor and hold, and each segment in
     * turn flashes one of the six prior tones, magenta round to violet,
     * before the whole thing is thrown back out. The one explicit echo of the
     * other six, and it is a scene rather than a stage.
     */
    eclipseFor: 7.2,
    eclipseHold: 0.55, // of it spent at the floor before the throw
    /*
     * III: it lets go of the ring and takes what is left of it to the middle
     * of the field, as a double square frame -- ORDINAL's silhouette, in
     * crimson, the first boss quoted by the last. And it turns four beams out
     * of itself.
     */
    /*
     * How far above the turret the frame's centre sits -- which is to say how
     * far away the core is for the whole of stage III, and so a law 2 number
     * rather than a composition one. At the plan's 470 the core sat outside a
     * base aim range of 400 and could not be shot at all: measured, stage III
     * was sixty percent of a fight that then ran into the nine-hundred-second
     * cap without ever reaching IV. At 360 the core is in reach and the
     * frame's near side is at 204, which is what makes the frame armour.
     */
    frameAt: 360,
    /*
     * Outer and inner half-widths. Wider than the plan's sketch because a
     * compact frame is a splash magnet: at 156 and 96 the segments sit close
     * enough together that one area weapon takes several, and sixteen of them
     * went in about twenty seconds. Spread out they are a silhouette you get
     * to look at.
     */
    frameR: [170, 106],
    frameFor: 2.6, // seconds of the segments flying to their places
    /*
     * ...and how much of the boundary it can carry. What it cannot, it drops.
     *
     * The frame is made of whatever survived the ring, so how much survived
     * is how big stage III is -- and unbounded that is the whole of the rest
     * of the fight. Sixteen is a double square with a readable outline and
     * about eighty seconds of work in it.
     */
    frameKeep: 30,
    /*
     * ...and what it is short of, it takes back.
     *
     * `frameKeep` was only ever a ceiling, and by III the boundary is spent
     * by construction -- ECLIPSE fires on the ring being half gone -- so the
     * frame was usually built from fewer bodies than it wanted and the drop
     * never ran. It is a floor as well now: the fallen edge is gathered into
     * the frame rather than left on the circle. Stage III was the weakest
     * fifth of this fight and this is where its length comes from.
     */
    frameHp: 0.7,
    /*
     * III closes too.
     *
     * The plan's own words: a square boundary shrinking on the turret, the
     * same idea as the ring in a different shape, rather than a distant
     * object that happens to be square. It comes from `frameAt` down to
     * `frameClose` and draws in by `shutBy` over `shutFor` seconds.
     *
     * It closes by DRAWING IN, which is the ring's own move rather than a
     * different one: the ring contracts, it does not descend, and a square
     * boundary contracting around its centre is the same picture. The descent
     * is a garnish on top of it.
     *
     * That is not the shape the first attempt took, and the reason is law 3.
     * The frame turns, so a corner of the outer square passes directly under
     * `fc` twice a turn -- and a corner is `sqrt(2)` further out than a side.
     * Closing by coming DOWN therefore drives the corner into the turret: at
     * 270 and a 16% draw-in it passed within fourteen units. Chasing it with
     * more draw-in does not help either, because past a point the shrinking
     * corner recedes faster than the frame descends and the thing stops
     * closing at all.
     *
     * The corner is also why `frameR` came down from [190, 118]. At 190 the
     * outer corner was 269 out and the frame sits 360 above the turret, so it
     * passed within 61 units -- a law 3 violation that predates all of this
     * and had no case watching it. At 170 the worst it ever gets is 90.
     */
    frameClose: 320,
    shutBy: 0.44,
    shutFor: 34,
    beams: 4,
    /*
     * ...and the last stage does not get MORE beams, it gets bigger ones.
     *
     * What decides how much of a stage is corrupted is not how wide a beam is
     * but how often one comes round: world shock decays over about a second,
     * so each crossing smears. Six beams at 0.46 rad/s cross every 2.3
     * seconds and the decay never finishes -- which is how stage IV measured
     * 58% of its frames corrupted while the code called it a strobe.
     */
    beamsLate: 5,
    beamSpin: 0.46,
    beamArc: 0.09, // radians either side of a beam that count as across it
    /*
     * ...and they widen as the core goes, while FEWER of them turn.
     *
     * The widening is the plan's: the last of this fight should be crimson
     * wedges rather than lines, and it is the only escalation here that is
     * not a change of shape. The merging is the measurement's. Six beams at
     * the old 0.16 covered 31% of every turn, and corruption smears -- world
     * shock decays over about half a second -- so stage IV was measured at
     * 58% of its frames corrupted BEFORE any of this was touched, which is
     * the definition this file already uses for weather rather than threat.
     * Widening alone would have taken it to 74%.
     *
     * Six narrow beams becoming three wide ones is more dramatic and less
     * constant at the same time: 19% of the turn at the start of IV and 21%
     * at the end, against 31% flat before.
     */
    beamsLast: 2,
    beamWiden: 1.6,
    beamShock: 0.3,
    beamLen: 900,
    /*
     * LIMITs, from III. They walk the frame's own lines inward. Slow, for the
     * reason all six before it had to learn once: auto aim takes what is
     * nearest, and a minion on its way in is always nearer than a boss.
     */
    limitEvery: [0, 0, 14, 11],
    limitOf: 1,
    /*
     * IV -- LAST CLOSE. The frame is thrown back out into a ring and shut one
     * more time, and the core comes down INSIDE it.
     *
     * The plan had the frame simply drifting nearer, which made the second
     * half of this fight III at a shorter distance -- the least interesting
     * thing on screen during the last stage of the last boss. `spiralTo` is
     * inside the boundary's floor of 180 on purpose: nearer than the edge, so
     * for the last stage there is nothing between you and it at all.
     */
    recloseFor: 2.4,
    // ...and what the boundary comes back at. Not a heal it chooses -- a
    // scripted resurrection, the way PARITY's death puts its panes back.
    recloseHp: 0.7,
    /*
     * ...and it comes back wearing the six tones, fading to crimson over the
     * stage. ECLIPSE flashes them in a beat; this is the same idea taken
     * slowly, so the last thing the last boss does is stop being six things
     * and become one.
     */
    toneFor: 46,
    /*
     * ...and the loop that makes the last stage worth its length: it hangs
     * over the turret for `bareFor`, then goes back out onto the wall for
     * `hideFor` where it is out of reach and the boundary is what the turret
     * finds instead. Two targets, alternating. Without it IV was one long
     * look at a core with beams on it.
     */
    bareFor: 7.5,
    hideFor: 5.0,
    bareRate: 2.4, // how fast it moves between the two
    spiralFor: 14,
    spiralTo: 130, // how near the core gets, and no nearer
    close: 230,
    // The death: the longest in the game, and the only one that leaves the
    // sky changed behind it.
    /*
    * The longest death in the game, and the length is arithmetic rather than
    * taste: the outro only starts once the detonation has landed, which is
    * arrest + infall = 3.4s in, and its four lines want 14.8s of reading.
    * Under 18.2 the last line -- the one the whole game has been walking
    * toward -- is cut off mid-sentence.
    */
    endFor: 19.4,
    arrest: 1.6,
    infall: 1.8,
    pull: 1100,
    pay: kB(1400),
  },

  /*
   * ---- what every boss shares ----
   *
   * Five numbers that are about *a* boss ending rather than about ORDINAL.
   * They sat in CFG.ordinal because ORDINAL was the only boss there was, and
   * six more are planned; a second boss copying them is how two of them end
   * up different by accident.
   *
   * The two clocks are separate on purpose. A boss's own `endFor` is how long
   * its death sequence lasts, which is set by how long its outro takes to
   * read; `slowFor` is how long time itself is slowed, which is set by how
   * long slow motion stays interesting. Tying them together left the field at
   * half speed for six seconds of reading.
   */
  boss: {
    endSlow: 0.12, // time scale a death slams to
    slowFor: 3.6, // ...and how long before it ramps back
    // A beat of empty sky before the field picks up again. The wave that was
    // running when the way opened resumes — see Game.endBoss().
    after: 4.6,
    /*
     * How long a boss may stand without losing a stage before it withdraws.
     *
     * A gate that cannot be passed is a run that cannot continue, and the
     * ladder has no other way past. Rather than let an under-gunned run sit in
     * front of one for ever, the anomaly stops counting and goes: the field
     * comes back, the gate stays lit, and nothing is reconciled. Measured off
     * a stage CHANGE rather than the whole fight, so a long fight that is
     * visibly progressing is never interrupted.
     */
    /*
     * Raised from 90 in build 215, because at 90 it was not a safety net --
     * it was the ending.
     *
     * Measured across three separate benches including the build-211
     * baseline: TERMINUS's stock fight ends with its last stage reading
     * EXACTLY 90.0s every single time. A stock turret has never beaten it;
     * it withdraws, and the 212.6s that had been quoted as its length was
     * the time it took to give up. Its stages naturally run 60-90s, so the
     * clock was inside the fight rather than outside it.
     *
     * 150 leaves the net doing its job -- a run that genuinely cannot pass a
     * gate still gets out rather than sitting there for ever -- while being
     * clear of a stage that is visibly progressing. It is still measured off
     * a stage CHANGE, not the whole fight, and it is still scaled by the
     * boss's own temper (see Game.watchBoss).
     */
    patience: 150,
    /*
     * A beat after the boss comes apart before it says anything.
     *
     * The outro used to start on the frame `detonate()` fired, which is about
     * 1.8 seconds after the core goes -- so the arrest, the infall and the
     * detonation, which are the whole of the spectacle, were read through a
     * caption. The death slams time to `endSlow` and ramps back over
     * `slowFor` (3.6s); this holds the words until that ramp is nearly done,
     * so the picture gets the slow motion to itself and the words arrive as
     * time comes back. `endFor` is extended by the same amount, or the last
     * lines would be cut off by the sequence ending underneath them.
     */
    outroWait: 3.2,
    /*
     * The most a bought turret may make an anomaly worth, as a multiplier on
     * the health of its core and its structure. See gunScale in shooter.js
     * for the measurement this answers: seven fights, all of them a fifth of
     * their tuned length once the tree is bought out.
     *
     * A ceiling rather than the raw product (which reaches 4.69) because the
     * multiplier reaches only structure and cores -- minions come through
     * claim() and are deliberately left alone, since a longer fight already
     * means more of them -- and because a boss's scripted beats do not
     * stretch. Tuned against the bench rather than derived: see the note in
     * regress.mjs.
     */
    temper: 4.2,
    riseFor: 2.1, // seconds a REMAINDER takes to reach the turret
    // What one leaves behind. One each, and the only source there is.
    remainder: 1,
  },

  // ---- ward shell -----------------------------------------------------

  /*
   * The cover a HERALD holds over a body.
   *
   * It used to be one thin ring at r + 7. On the smallest hostile there is — a
   * MOTE at r 12, and the thing a SPLITTER breaks into four of — that came out
   * barely wider than the body, and on a floor of glowing energy it read as a
   * dot with a halo rather than as something being protected. Energy is drawn
   * in the colour of whatever dropped it, so a MOTE's energy is a MOTE's cyan
   * and a SPLITTER's is a SPLITTER's green: the cover is what has to carry the
   * difference, and a thin ring did not.
   *
   * `min` is the floor that fixes it, and it is set against the largest an
   * energy mote is ever drawn — CFG.drop.max * 1.5, or 6.6 units — so the
   * smallest shell in the game is still four times the biggest thing it could
   * be mistaken for. scripts/check-build.mjs holds that ratio.
   */
  wardShell: {
    min: 26, // world units, whatever the body is
    gap: 8, // ...and at least this far clear of a body bigger than that
    plates: 5, // drawn as arc segments: plating reads as cover, a circle reads as glow
    fill: 0.6, // how much of each segment's slice is drawn
    thick: 0.055, // stroke, as a fraction of the shell radius
    spin: 0.9, // radians a second, so it is held rather than painted on
  },

  /*
   * What the TURRET branch bolts on -- see `Shooter.drawMachine`, which is
   * where the parts are drawn from a node's level.
   *
   * ---- AND FOUR OF THE SIX NUMBERS HERE HAD NO READER -----------------
   *
   * `CFG.rig` is accessed at exactly four sites in the whole tree
   * (shooter.js:1089 and :1867, game.js:1879 for `flash`; shooter.js:1319
   * for `pile`), so `ring`, `spine`, `feed` and `dish` were shipped in the
   * bundle and read by nothing. `dish` is build 150's deleted ARRAY gadget
   * BY NAME -- that build replaced the hung-on gadgets with structure on the
   * drawn machine, and CLAUDE.md records the same removal leaving five
   * TURRET lines "still describing the hung-on gadgets... ARRAY had been
   * selling a scanning dish for sixty builds and drawing a flat fin". The
   * prose was fixed then and the numbers behind it were not.
   *
   * The docstring was the expensive half and it was wrong three ways: it
   * claimed every key is "a part you can see", which is true of two of six;
   * it named `Shooter.drawRig()`, which does not exist anywhere in the tree
   * (the build-336 `standoffOf` trap, twice more -- the other is
   * upgrades.js); and it listed SIGHT as a current part, five builds after
   * shooter.js recorded SIGHT as gone. Build 313's dead-field sweep cannot
   * see any of this: its domain is keys declared on `ENEMY_TYPES`, not `CFG`
   * blocks.
   */
  rig: {
    flash: 0.9, // seconds the machine flares while a part goes on
    pile: 8, // pile: how far the weight travels in the deck, per level
  },

  // ---- feel -----------------------------------------------------------
  glitch: {
    perAttacker: 0.34,
    max: 0.92,
    /*
     * ...and the timer drives it too, so the picture coming apart IS the
     * countdown rather than a decoration beside it. Squared, so it is nothing
     * for most of the fuse and most of the picture at the end of it.
     *
     * 0.3 rather than the 0.55 it was first written at, and the difference was
     * a screenshot: 0.55 puts a single attacker plus a nine-tenths fuse at
     * 0.79 of a 0.92 cap, and at that level the digits inside the ring are
     * torn into unreadable glyphs -- the readout becoming illegible exactly
     * when it matters most. The ring survives (it is a big shape), the number
     * does not. At 0.3 the same moment is 0.64: still the worst the screen
     * ever looks, and still countable.
     */
    perFuse: 0.3,
  },
};

// -----------------------------------------------------------------------
// Objects. Mass is derived from density * area, so the big ones genuinely
// shrug off bolts while motes get punted across the arena.
//
// COLOUR IS A CONTRACT. Grey means harmless: it cannot touch the turret, it
// cannot corrupt the feed, and nothing is lost by ignoring it. `harmless` on a
// type is exactly that -- Game.checkContact() skips it, so it can never become
// an attacker. There is one grey, CFG.debris.grey, and only two things wear
// it: DRIFT, and wreckage.
//
// Everything that can reach you therefore has a hue, and three of them used to
// not: BULWARK and TOW were #9fb3c8, a TOW's mass #c8d6e5 -- the same
// grey-blue as DRIFT, on the three heaviest things on the field. They are
// cobalt and lime now. Energy keeps its own colour: it is not an object and
// the rule does not reach it.
//
// A fragment of a harmful body that comes off harmless -- wreckage -- arrives
// in the colour of what it came off and fades to the grey over
// CFG.debris.fade seconds, so the break is legible and what is left of it
// says plainly that it is over.
// -----------------------------------------------------------------------
/*
 * ---- `opens`: what a type is gated behind ----
 *
 * Lifetime energy banked this run (world.earned), not kills. It was kills --
 * 18, 45, 85, 125, 165, 205, 245, 285, 330, 380 -- and a kill count measures
 * how much you have shot rather than how far you have got: a run that spends
 * ten minutes farming MOTEs unlocks a BULWARK it has no turret for, and a run
 * that kills efficiently is punished for it. Energy is the clock everything
 * else already runs on, so the tree, the tiers and the types now share one.
 *
 * Grouped by band, which the kill counts were not. A tier draws from band
 * ceil(n/2), so the thresholds are pitched to be met before that band is
 * wanted:
 *
 *   band 2, wanted at tier 3    lurcher 200     splitter 500
 *   band 3, wanted at tier 5    bloom 700       prism 900      glut 1,100
 *   band 4, wanted at tier 7    herald 1,400    warden 1,700   scion 2,000
 *   band 5, wanted at tier 9    bulwark 2,800   tow 3,400
 *
 * HERALD used to open fourth of ten and GLUT ninth, which put a band-4 type in
 * a player's hands two bands early and held a band-3 type back until well past
 * it. scripts/check-build.mjs holds the grouping now.
 *
 * ---- these numbers came from play, and the first set did not ----
 *
 * They were pitched three times higher, against the earned-by-tier targets in
 * docs/pacing.md -- and those targets were blessed by tiers.mjs's pay/s column,
 * which measures a band's HEAVIEST wave, alone, cleared as fast as possible,
 * counting energy still lying on the floor as collected. Real play earns about
 * an eighth of that: a stock turret on the assists banks 4,417 in fifteen
 * minutes, not the 15,000 the curve assumed by tier 8.
 *
 * So the first set put HERALD at nineteen minutes and TOW at forty-seven, and
 * a ladder sitting at tier 7-8 spent the whole run falling down-band because
 * band 4 was not open yet. Measured against a real fifteen-minute run instead,
 * these land every type within about twelve minutes -- and land BULWARK and
 * TOW within seconds of where the kill counts they replaced used to put them,
 * which is the check that says the re-pitch is right rather than merely lower.
 *
 * Every one of them also sits below its old kill gate times twelve, which is
 * what the save migration converts at, so no run that had a type loses it.
 * check-build.mjs asserts that.
 *
 * 0 means always available. The director falls down-band if a band is reached
 * before its types are -- see Director.shuffle -- so a fast climb never stalls
 * on a locked band; it just fights the band below until the money catches up.
 */
export const ENEMY_TYPES = [
  {
    id: 'mote',
    opens: 0,
    name: 'MOTE',
    gait: 'march',
    shape: 'shard',
    r: 12,
    hp: 31,
    density: 0.85,
    speed: 56,
    accel: 190,
    restitution: 0.78,
    wobble: 2.1,
    color: '#7ef9ff',
    glow: '#00d4ff',
    weight: 26,
    drops: 4, // energy it leaves when it comes apart
  },
  {
    id: 'needle',
    opens: 0,
    name: 'NEEDLE',
    /*
     * ONE LINE -- phase 4a, and the only one of the guide's ten re-gaitings
     * that removes behaviour and cannot surprise. It was `march` with
     * `wobble: 0.8` and six routes; the guide's reason is "Commits to one
     * line at the rim. It is the fast one; it should not also wander."
     *
     * Measured across all six routes before the change, crossing time and
     * widest lateral offset from its own start-to-mount line: direct
     * 7.67s/22, sweep 9.52/161, wide 11.30/220, serpentine 8.30/72, hook
     * 8.63/159, loiter 14.45/78. So the FAST body was anywhere from 7.67 to
     * 14.45 seconds depending on a roll -- a factor of 1.88 -- and the 14.45
     * is the `loiter` dawdle it inherited from a route it barely used.
     *
     * What the word removes: the lateral (220 -> ~22), the wobble, and that
     * dawdle. What it does NOT remove is any speed -- `straight` is not
     * compensated, so the delivered 89.1 u/s is what it always was. See the
     * arm in enemies.js for why the pair `straight`/`creep` exists at all.
     */
    gait: 'straight',
    shape: 'needle',
    // Leads with the point: the heading follows the travel bearing rather
    // than tumbling. See Enemy.face().
    point: true,
    r: 10,
    hp: 26,
    density: 0.7,
    speed: 104, // the quick one
    accel: 330,
    restitution: 0.5,
    wobble: 0, // the word excludes it; written out per build 224
    color: '#ffd166',
    glow: '#ff9f1c',
    weight: 18,
    drops: 2, // energy it leaves when it comes apart
  },
  {
    id: 'lurcher',
    opens: kB(200),
    name: 'LURCHER',
    /*
     * ---- LURCH, re-keyed off `lurch: true` in build 338 -----------------
     *
     * It declared `march` for one afternoon and that was the weakest
     * declaration in the roster. The march is the SMALLER half of what this
     * body does: its own steady closing speed is `speed * k / (k + damping)`
     * = 38 x 1.2 / 1.75 = 26.1 u/s, against a burst whose mean is 65 arriving
     * every 1.1-2.4s -- two and a half times the whole cruise, up to 3.4x. So
     * `march` named the quieter component and was silent about the louder one,
     * on the one type docs/objects.html calls "the only type that already
     * owned its motion".
     *
     * The convention it now follows is the roster's own: a MODIFIER whose
     * route branch still runs is declared as the gait, which is what YOKE
     * (`paired`) and SPINDLE (`cartwheel`) already do. And it REMOVES a
     * second source of truth rather than adding one -- the burst was keyed on
     * a `lurch: true` field that only this type carried, so the word and the
     * behaviour could get out of step; `drive` reads the gait now and the
     * field is gone. Behaviourally identical, and the ORDINAL hash is what
     * says so rather than this sentence.
     */
    gait: 'lurch',
    shape: 'hex',
    r: 24,
    hp: 185,
    density: 1.35,
    speed: 38,
    accel: 120,
    restitution: 0.52,
    wobble: 2.6,
    color: '#b98cff',
    glow: '#8b5cf6',
    weight: 12,
    drops: 8, // energy it leaves when it comes apart
  },
  {
    id: 'splitter',
    opens: kB(500),
    name: 'SPLITTER',
    gait: 'march',
    /*
     * ONE ROUTE, NOT SIX -- phase 3, and the guide's own words: "it comes in
     * from the flank, and its four MOTEs inherit a flock." `wide` is width 480
     * and commit 0.35, the widest arc and the slowest fold-in in the table.
     *
     * Measured across all six, crossing time and widest offset: direct 15.3s
     * /34, sweep 14.9/130, wide 17.3/205, serpentine 15.8/33, hook 15.5/92,
     * loiter 24.4/37. So the restriction costs 0.1s against the old mean of
     * 17.2 and more than doubles the widest offset, 88 to 205. What it really
     * removes is VARIANCE: a SPLITTER was 14.9 to 24.4 seconds depending on a
     * roll and is now always 17.3.
     */
    routes: ['wide'],
    shape: 'blob',
    r: 29,
    hp: 159,
    density: 1.0,
    speed: 46,
    accel: 150,
    restitution: 0.86,
    wobble: 1.8,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 8,
    drops: 4, // energy it leaves when it comes apart
    splits: { type: 'mote', count: 4 },
  },
  {
    id: 'bloom',
    opens: kB(700),
    name: 'BLOOM',
    gait: 'march',
    shape: 'bloom',
    r: 33,
    hp: 247,
    density: 1.05,
    speed: 33,
    accel: 110,
    restitution: 0.62,
    wobble: 1.4,
    color: '#ff5d8f',
    glow: '#ff2d6f',
    weight: 6,
    drops: 6, // energy it leaves when it comes apart
    debris: 9, // inert wreckage thrown when it breaks up
    detonate: { radius: 132, damage: 96 },
  },
  {
    id: 'bulwark',
    opens: kB(2800),
    name: 'BULWARK',
    gait: 'march',
    shape: 'plated',
    r: 45,
    hp: 676,
    density: 2.7,
    speed: 23,
    accel: 90,
    restitution: 0.32,
    wobble: 0.9,
    armor: 0.34, // flat damage reduction
    // Cobalt. It was #9fb3c8 on a #5f7fa6 glow -- grey on the single hardest
    // body in the game, which is the exact opposite of what grey promises.
    // This is the saturation of the blue it already had.
    color: '#5d9cff',
    glow: '#2f6bd8',
    weight: 5,
    drops: 14, // energy it leaves when it comes apart
    debris: 16, // inert wreckage thrown when it breaks up
  },
  {
    id: 'warden',
    opens: kB(1700),
    name: 'WARDEN',
    gait: 'march',
    /*
     * `hook`, phase 3. The guide: "comes round the side shedding plates, which
     * is what a hook is for." It is commit 1.9, the highest in the table, so
     * the arc holds its offset late instead of folding in early.
     *
     * Measured: direct 17.8s/16, sweep 17.1/98, wide 20.3/151, serpentine
     * 16.1/27, hook 20.8/133, loiter 24.3/32. It is the second-slowest route
     * for this body -- 20.8 against an old mean of 19.4, 7% -- and it takes
     * the widest offset from a mean of 76 to 133.
     */
    routes: ['hook'],
    shape: 'warden',
    r: 22,
    hp: 153,
    density: 1.15,
    speed: 41,
    accel: 140,
    restitution: 0.66,
    wobble: 1.6,
    color: '#ff9f1c',
    glow: '#ff6b00',
    // Halved, because one WARDEN is now four objects: itself and the three
    // plates it releases. The roll should put about as much on the field as
    // it did, not twice as much.
    weight: 4,
    drops: 6, // energy it leaves when it comes apart
    shards: 3, // orbiting plates that eat incoming bolts
    // ...and when it goes, they come off as bodies rather than as scenery.
    splits: { type: 'plate', count: 3 },
  },
  {
    /*
     * PLATE. One of a WARDEN's three, off its orbit and on its own.
     *
     * While the WARDEN lives these eat your bolts and are shot off it one at a
     * time; when it dies the survivors do not simply vanish into energy, they
     * come at you. Small, quick, and worth a tally place each, which is why a
     * WARDEN is now half as common as it was.
     */
    id: 'plate',
    opens: 0,
    name: 'PLATE',
    gait: 'march',
    shape: 'plate',
    r: 11,
    hp: 44,
    density: 1.3,
    speed: 62,
    accel: 190,
    restitution: 0.7,
    wobble: 0.8,
    color: '#ffb84d',
    glow: '#ff6b00',
    weight: 0, // never rolled: a WARDEN places these
    drops: 2, // energy it leaves when it comes apart
  },
  {
    /*
     * SCION. A large body that is worth more dead than alive, to everything
     * else on the field.
     *
     * Kill it and it does not simply come apart: it throws SEEDs, and a SEED
     * goes looking for another object to graft itself onto. What it finds gets
     * bigger, tougher, and starts closing its own wounds. So the object you
     * chose to shoot first decides what the rest of the wave becomes, which is
     * the one decision the field did not previously ask for.
     *
     * There are two counters, and they are the same target twice. In the air a
     * SEED is slow, weak and available for several seconds: shoot it and
     * nothing is grafted at all. Once it lands it is still there — attached to
     * the host, orbiting it, with its own health — so it can be shot off, and
     * everything it was giving goes with it. Up to three ride one body; ignore
     * them and you fight something you made.
     */
    id: 'scion',
    opens: kB(2000),
    name: 'SCION',
    gait: 'march',
    /*
     * `loiter`, phase 3, and this is the ONE restriction with a real cost, so
     * the number is here rather than left to be discovered.
     *
     * The guide: "solo and deliberate: it hangs back at mid range before
     * committing, which its three seeds already imply." That is the DAWDLE and
     * nothing else -- `loiter` is the only route in the table that has one
     * (0.55), and `drive` applies it to the local cruise beyond 260 units.
     *
     * Measured: direct 38.2s/1, sweep 34.3/86, wide 36.9/166, serpentine
     * 33.1/16, hook 32.5/99, loiter 43.8/18. So it is 43.8 against an old mean
     * of 36.5 -- **20% slower on the slowest body in the game** -- and its
     * widest offset is only 18, because `loiter`'s width is 180 against
     * `wide`'s 480. "Hangs back" is delivered by the dawdle; the lateral is
     * not what this route gives a body this slow.
     *
     * `Director.standing` counts a SCION until it dies, so its waves get
     * about seven seconds longer. It is authored at 1 or 2 in three band-4
     * waves and carries `solo: true`, so that is one body at a time and the
     * cost does not multiply. Recorded as the price of the guide's rationale
     * rather than tuned here: inventing a balance answer in a build whose
     * content is a mechanism is the mistake build 304 deliberately did not
     * make.
     */
    routes: ['loiter'],
    shape: 'scion',
    r: 34,
    hp: 390,
    density: 1.15,
    speed: 26,
    accel: 70,
    restitution: 0.42,
    wobble: 0.35,
    color: '#c9a7ff',
    glow: '#8b5cf6',
    weight: 5,
    // Never part of a formation. The cap is two on the field, and a formation
    // releases three to six of one type in one go -- which is how five of
    // them ended up on the screen at once the first time this was measured.
    solo: true,
    drops: 9, // energy it leaves when it comes apart
    debris: 11, // inert wreckage thrown when it breaks up
  },
  {
    // What a SCION leaves. Harmless in itself -- it never breaches the turret
    // and it is not counted -- but it is not inert: it is looking for a host.
    id: 'seed',
    opens: 0,
    name: 'SEED',
    shape: 'seed',
    gait: 'ride',
    harmless: true,
    r: 8,
    hp: 18,
    density: 0.5,
    speed: 150,
    accel: 200,
    restitution: 0.5,
    wobble: 0,
    /*
     * What this rider is. Every number was `CFG.graft.<key>` until build 322
     * and every one of them is unchanged to the digit, which is the claim the
     * suite checks -- the split moved where they live and nothing else.
     *
     * `hunt` is short and `life` is long because a SEED does not cross the
     * field to work: a SCION throws it `CFG.graft.spread` = 190 units clear
     * of its own death, so the hosts it wants are the crowd that SCION was
     * already standing in. LATCH, released by a wave from the portal, is the
     * other way round and says so in its own block.
     */
    rides: {
      life: 13, // seconds it has to find a host
      hunt: 480, // ...and how far it will look
      grow: 0.2, // + this share of the host's own radius, per ball
      tough: 0.6, // + this share of its own health, and of its energy
      armor: 0, // + this much armour, flat
      regen: 9, // health it closes for the host per second
      hp: 26, // what the ball itself takes to shoot off
    },
    // A SEED cannot touch the turret and cannot corrupt the feed, so it is
    // `harmless` in the sense the code means. It is not harmless in the sense
    // the colour rule means: it is on its way to making some other body
    // bigger, tougher and healing. Grey would say "ignore this", about the one
    // object on the field you least can. Violet, and a shade lighter than the
    // SCION it came out of.
    color: '#ceb0ff',
    glow: '#a56bff',
    weight: 0, // never rolled: a SCION places these
    drops: 0, // energy it leaves when it comes apart
  },
  {
    // Harmless: it has no goal, it never breaches the turret, it does not
    // count, and it triggers nothing. It is here to be pushed around.
    id: 'drift',
    opens: 0,
    name: 'DRIFT',
    shape: 'drift',
    harmless: true,
    // What it does when nothing has happened to it yet. See GAITS below: the
    // band-and-bob build 298 gave this type is a gait and not a special case,
    // and naming it is what lets a second harmless body take a different one.
    gait: 'hover',
    r: 17,
    hp: 39,
    density: 0.55,
    speed: 34,
    accel: 95,
    restitution: 0.92,
    wobble: 0,
    // The grey, taken from the one place it is defined rather than typed out
    // again: DRIFT and wreckage must wear the same one, or "grey is harmless"
    // is two colours making a promise instead of one.
    color: CFG.debris.grey,
    glow: '#4f6f92',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 2, // energy it leaves when it comes apart
  },
  /*
   * ---- GYRE IS WITHDRAWN, AND NINETEEN IS WHAT THIS PHASE SHIPS ----------
   *
   * Build 331. `docs/objects.html` authors twenty objects and one of them has
   * no door in this game. GYRE is an orbiting body swinging a weighted arm
   * that "does not damage you -- it MOVES YOUR THINGS: a mine it passes is
   * dragged out of its lane, a DECOY is shoved off its mark", and its counter
   * is "lay for it". Measured, every clause of that is empty here:
   *
   *   - MINES have no door at all. `CFG.mines.inPlay` has been false since
   *     build 289, so the first half of what it does and the WHOLE of its
   *     counter are about a system a player cannot reach. Builds 317 and 319
   *     each shipped a codex line offering a mine as an answer and 323 had to
   *     correct both; this would have been the same fault at the scale of a
   *     whole object.
   *   - The DECOY is a PURCHASE (`LOCKABLE.abilities`) with `life` 9 against
   *     a `cooldown` of 24, so it stands at most **37.5% of the time** for a
   *     player who presses it the moment it recharges and **0%** for one who
   *     never bought it. An object whose only live target is optional and
   *     intermittent is the `world.endless` shape: a reader whose other
   *     branch is almost never taken.
   *   - SALVAGE can be moved and it costs nothing. `collectData` accelerates
   *     every drop at `energy.pull` 26 u/s^2 toward the machine and drops do
   *     not expire -- build 325 deleted the `ttl` that used to end them -- so
   *     a mote flung 100 / 200 / 300 units out is back in **2.8 / 3.9 /
   *     4.8 seconds** and none of it is lost. A delay in income, invisible.
   *
   * ...and the GAIT cannot carry the object on its own, which is the finding
   * that settled it. `orbit` is "closes to 300 units and circles, never
   * arrives, never leaves", and the obvious re-spec -- the body your barrel
   * cannot keep up with -- is arithmetic away from true: delivered speed is
   * `44 * 1.6 / 2.15` = **32.7 u/s**, so at radius 300 its bearing moves
   * 0.109 rad/s against `shooter.autoTurnRate` 4.2, which is **2.6% of the
   * barrel's slew** (5.2% at radius 150). Nothing about circling this machine
   * is a tracking problem.
   *
   * Worse, an orbit fights two rules this repo has already paid for.
   * `autoTarget`'s cone is `aimClamp + 0.04` = +-80.2 degrees, so **45% of a
   * full circle is inside it**: an orbiting HOSTILE is unchoosable for more
   * than half of a **58-second** orbit while `Director.standing` and
   * `hostileCount` hold the wave and the build-291 release gate open -- build
   * 312's `tumble` finding, on a body that never arrives by design. And the
   * arena clamps it: at era 1 the mount stands 210 units above the floor
   * (1012.6 against 1223), so a 300-radius circle passes 90 units under the
   * field and is squashed flat.
   *
   * WHAT WOULD BRING IT BACK, said plainly so the next reader does not have
   * to re-derive it: the mine line returning (one flag), AND the circle
   * becoming an ARC derived from the cone the way `roll` derives its turn
   * from `edgeEase` and `dive` derives its lane from `grabPad`. Both of those
   * together are a different object and would want a fresh spec; withdrawing
   * it is the honest state until then. Phase 6 has three left -- LOOM, MIRE
   * and KITE -- and the ordinals in the notes below are dated records of the
   * count as it stood when each shipped.
   *
   * ---- the first two of the twenty (docs/objects.html), build 307 ---------
   *
   * Both are HARMLESS, both are grey, and both LEAVE -- which is the thing
   * neither of them shares with anything already on the field. Every body in
   * the game until now either reached the machine or was destroyed; these two
   * have a way off the field of their own, and taking them apart before they
   * take it is the whole of what they ask.
   *
   * Harmless is not decoration here, it is the budget: `threatOf` weighs a
   * harmless type at ZERO, so neither of them spends any of a wave's threat
   * budget and neither of them SWELLS with it (see Director.load). They are
   * mortar in exactly the sense drift already was -- which is why adding them
   * to four existing waves moves no band's budget by a byte.
   */
  {
    // Sparks off the floor, climbing for the rim with a little salvage each.
    // An inverted DRIFT, and the only thing on the field that starts where
    // you are.
    id: 'ember',
    // 0, like DRIFT and SEED: a harmless body is gated by the BAND of the
    // waves that name it, not by lifetime energy. EMBER's waves are band 1,
    // so there is nothing to hold back.
    opens: 0,
    name: 'EMBER',
    shape: 'ember',
    harmless: true,
    gait: 'rise',
    // Its picture is oriented to the WORLD and not to the body -- a spark
    // rises, a cage hangs. See Enemy.draw.
    upright: true,
    r: 7,
    hp: 12,
    density: 0.4,
    /*
     * ---- the CLOCK is authored and the speed is derived (build 308) ------
     *
     * `climb` is how long this body takes to cross the column it is actually
     * on, so it is the same eleven seconds at either era; `rise` derives the
     * cruise from it at spawn. See CFG.rise for why build 307's authored
     * speed was wrong twice: docs/objects.html's own 40 u/s is a
     * twenty-four-second climb at era 1, and the 90 that replaced it measured
     * 12.3s at era 1 and 20.3s at era 2 -- the field got deeper and the one
     * object about being quick got slower.
     *
     * `speed` is kept because `scaleToTier` reads it and every other reader
     * of a type expects it; it is the era-1 equivalent of the clock and is
     * NOT what the body climbs at. `check-build.mjs` asserts the two agree at
     * era 1, so they cannot drift apart in silence.
     */
    climb: 11,
    speed: 88, // 88 x 11 = 968, which is era 1's column -- see the guard
    accel: 220,
    restitution: 0.6,
    wobble: 0,
    color: CFG.debris.grey,
    glow: '#7d9bb8',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 1, // energy it leaves when it comes apart
  },
  {
    // A wreck of something the simulation ran before: thrown rather than
    // steered, end over end across the field, and gone on its own clock. The
    // largest single payout on the field, for the eleven seconds it is there.
    id: 'husk',
    opens: 0,
    name: 'HUSK',
    shape: 'husk',
    harmless: true,
    gait: 'tumble',
    r: 38,
    hp: 90,
    density: 0.45,
    speed: 44,
    accel: 30,
    restitution: 0.85,
    wobble: 0,
    color: CFG.debris.grey,
    glow: '#41597a',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 12, // energy it leaves when it comes apart
  },
  {
    /*
     * A cage of salvage on its way back out through the portal. Harmless in
     * every sense that matters, and the only object in the game that costs
     * you something for being IGNORED: EMBER and HUSK leaving are an
     * opportunity you did not take, and this one is a bill.
     *
     * It is a rise body, so it leaves through `fizzle` + `dissolved` like the
     * other two, and `Enemy.destroy`'s first guard refuses to cash a
     * dissolving body in -- which is exactly what makes the theft a theft.
     * What it is carrying is `drops`, and the arithmetic is in CFG.lantern.
     */
    id: 'lantern',
    // 0, like every harmless body: the BAND of the waves that name it is the
    // gate, and its waves are band 4.
    opens: 0,
    name: 'LANTERN',
    shape: 'lantern',
    harmless: true,
    gait: 'rise',
    // Its picture is oriented to the WORLD and not to the body -- a spark
    // rises, a cage hangs. See Enemy.draw.
    upright: true,
    // Nine seconds, which is the clock docs/objects.html's own counter names
    // ("a timer you are allowed to answer or not: about nine seconds of
    // climb"). Its authored 26 u/s would have been 37s at era 1 and 57s at
    // era 2 -- see CFG.rise.
    climb: 9,
    r: 20,
    hp: 150,
    density: 0.55,
    speed: 107, // the era-1 equivalent of `climb`; `rise` derives the real one
    accel: 80,
    restitution: 0.7,
    wobble: 0,
    color: CFG.debris.grey,
    glow: '#8fb4d6',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 16, // energy it leaves when it comes apart -- and takes if it does not
  },
  {
    /*
     * Seven beads nose to tail, snaking across the field. It wants nothing and
     * blocks nothing: it is there to be CUT, and the shape of what is left is
     * different every time -- a bead taken out of the middle leaves two
     * shorter snakes, each with its own new leader, because a follower whose
     * lead is gone simply becomes a lead.
     *
     * `beads` is the multiplicity, and it is the field `release()` dispatches
     * on -- exactly the shape `tows` already has. Anything that counts bodies
     * per authored entry reads it: a wave writes ONE snake and seven arrive.
     */
    id: 'filament',
    opens: 0,
    name: 'FILAMENT',
    /*
     * `bead` and NOT `chain`. The shape guard harvests every `case 'x':` label
     * across the whole of enemies.js into ONE flat set, so a shape sharing a
     * name with a gait would read as covered by the gait switch's own case
     * while drawing nothing -- which is the build-273 silent fallback again.
     */
    shape: 'bead',
    harmless: true,
    gait: 'chain',
    beads: 7,
    r: 9,
    hp: 22,
    density: 0.4,
    speed: 58,
    accel: 180,
    restitution: 0.8,
    wobble: 0,
    color: CFG.debris.grey,
    glow: '#6f8da9',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 1, // energy it leaves when it comes apart
  },
  {
    /*
     * Hangs in the middle band and bobs. Shoot it and it RINGS: see CFG.bell.
     *
     * `rings` is the capability, declared on the type the way `tows`, `beads`
     * and `upright` are, so `Enemy.destroy` does not have to name an id. It
     * only ever goes by being shot -- a hover body never leaves the field --
     * and `destroy`'s own `fizzle` guard means a bell taken by the glitch
     * dissolve rings for nobody, which is right: nobody shot it.
     */
    id: 'bell',
    opens: 0,
    name: 'BELL',
    shape: 'bell',
    harmless: true,
    gait: 'hover',
    rings: true,
    r: 15,
    hp: 60,
    density: 0.5,
    speed: 30,
    accel: 100,
    restitution: 0.75,
    wobble: 0,
    color: CFG.debris.grey,
    glow: '#9ec0dd',
    weight: 0, // never chosen by the ordinary spawn roll
    drops: 2, // energy it leaves when it comes apart
  },
  {
    /*
     * QUARRY: nine bodies out of one, and you can see it coming.
     *
     * The first HOSTILE of the twenty, which is what makes it different from
     * the five before it: it weighs something. A harmless body is zero in
     * `threatOf`, so EMBER through BELL could be dropped into waves already
     * in the roster without moving a band's budget by a byte. This one moves
     * band 4's, and the fracture is most of the move -- see `threatOf`, which
     * counts what a QUARRY BECOMES the same way it already counts what a TOW
     * drags.
     *
     * `splits` names its OWN id, which is the whole economy of it: one type,
     * one drawing, one codex entry, and the generation is the body's RADIUS
     * rather than a field. r 40 breaks into three at 24, each of those into
     * three at 14.4, and 14.4 is under `floor` so that is where it stops.
     * The guide asks for a last generation at 13; one factor with one owner
     * is worth more than the digit, and `check-build.mjs` asserts the chain
     * terminates rather than asserting the radii.
     */
    /*
     * SHOAL: fourteen at a time, and the school IS the mechanic.
     *
     * There is no leader and no ability. A bolt takes one of fourteen and the
     * other thirteen close the gap; anything with a radius takes the school.
     * That is the whole object, and it is the first thing in this game that
     * teaches aimed fire is the wrong tool -- which is why it is band 1.
     *
     * `school` is the multiplicity `release()` dispatches on, the third such
     * field after `tows` (2) and `beads` (7). One authored entry is fourteen
     * bodies, so `threatOf` counts fourteen, the mortar cap counts bodies and
     * the combination ceiling counts the school as ONE PROBLEM -- see
     * check-build.mjs, which states that ruling rather than leaving it.
     *
     * ---- the colour is MOTE's, measured, and it is a decision ------------
     *
     * `docs/objects.html` gives the swarm family `#7ef9ff`, which is MOTE's
     * body colour at **dE 0.0 in CIELAB** -- the same collision build 223
     * had to fix between ALL MINES and BLAST. It is kept, for two measured
     * reasons. The palette is full: a search of the whole HSL grid against
     * all 75 tones in the roster found the best-separated colour left is a
     * pure magenta at dE 37.7 and nothing else clears 31, while the working
     * separation this game documents is 15-23. And the two ARE the same
     * family of problem -- many small fast things -- which is what the
     * guide's family colours mean. What separates them is the register the
     * repo already trusts for six greys: the silhouette (an aligned dart
     * against a tumbling shard), the size (r 7 against 12) and the count.
     * The nearest alternative inside the family is `#00b0e6` at dE 15.8;
     * changing category colours is explicitly a decision to be asked about
     * rather than taken, so it is written down here.
     */
    /*
     * YOKE: two bodies, one beam, one pool -- and where you aim decides what
     * you are left holding.
     *
     * `pair` is the fourth multiplicity `release()` dispatches on, after
     * `tows` (2), `beads` (7) and `school` (14) -- and the first one that is
     * NOT more health. A TOW is two bodies with two pools, so `threatOf`
     * counts the head plus what it drags; a chain and a school are N bodies
     * of N times the health. A yoke is two bodies of ONE 150, so it weighs
     * exactly 150 -- five points, not ten. Nothing in `threatOf` had to
     * change for that, which is the tell that the field is the right shape:
     * `many` reads `school || beads || 1` and a pair is one.
     */
    id: 'yoke',
    opens: 0,
    name: 'YOKE',
    shape: 'yoke',
    gait: 'paired',
    pair: 2,
    /*
     * The pair's own numbers, which lived in `CFG.yoke` until build 332 --
     * see the note where that block was. Unchanged to the digit.
     *
     * `spin` is COMPENSATED rather than held: `grip` blends the tangential
     * velocity toward it, and both `linearDamping` and `drive`'s own accel
     * term pull it back every frame, which delivers 0.59 of a raw target --
     * measured 0.692 rad/s against this 1.2 before `pairOn` grossed the ask
     * up by those two terms. Delivered 1.143-1.172 over three runs. See
     * `Enemy.pairOn`: a target rate is not a rate.
     *
     * `pool: true` is what makes this pair ONE 150 rather than two: it is
     * read by `spawnPair` (which gives both halves one ceiling) and by
     * `pourPool` (the share that snaps the beam). LOOM declares no pool and
     * so has two, which is why either end drops its thread.
     */
    bond: {
      len: 60, // the beam, centre to centre -- 2.3r, the guide's own spacing
      spin: 1.2, // radians a second about the midpoint, before compensation
      grip: 3, // how hard the pair is held at that rate, per second
      alone: 1.9, // what a survivor's speed is multiplied by
      pool: true, // one pool of health across both halves
      snap: 0.5, // the share of it that, landed on ONE half, breaks the beam
    },
    r: 26,
    hp: 150,
    density: 0.95,
    speed: 42,
    accel: 150,
    restitution: 0.4,
    wobble: 0.5,
    /*
     * The strange family's colour, which is LURCHER's at dE 0.0 -- the third
     * of these in three builds (SHOAL against MOTE, SPINDLE against TOW) and
     * the same ruling, which is written out at SHOAL: the palette has no
     * well-separated region left, the family is what the colour means, and
     * the silhouette carries the distinction. A pair on a beam turning about
     * its own midpoint is not a picture anybody confuses with a LURCHER.
     * The GLOW is separated at 21.6, the widest gap the violet band has.
     */
    color: '#b98cff',
    glow: '#5a2fb0',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 5, // energy it leaves when it comes apart
  },
  {
    /*
     * LOOM: a pair that walks APART, and the thread between them stops our
     * rounds. Build 332, phase 6q, and the seventeenth object to ship.
     *
     * It is the first thing in this game that stops a round anywhere but at
     * the edges of the field. The guide's analogy is exact and was CHECKED
     * rather than assumed: `updateProjectiles` clips a round's step at
     * `wallLine` and takes it there with `impacted` false, so the era-2 wall
     * really does absorb our rounds, and the thread is that rule brought into
     * the middle of the arena. (The first draft of this paragraph said the
     * wall did no such thing. It reads `shielded`, which refuses the CHOOSER
     * and the damage path, and there is a second mechanism a hundred lines
     * above it that does the absorbing.) A VEIL, by contrast, only makes the
     * assist decline a shot it cannot make, and `spent` structure is passed
     * straight through.
     *
     * ---- ...AND THE ASSIST IS NOT TOLD, WHICH IS A DECISION --------------
     *
     * `occluders` is VEIL's and the thread is deliberately NOT in it. Two
     * reasons, and the first is a guarantee: build 330's argument that an
     * occlusion rule can never leave the gun with nothing to shoot rests on
     * sheets being LEVEL, so that "in front of" is a strict order by depth --
     * a thread turns about its midpoint, two crossed threads could hide each
     * other's spools, and a silent gun plus the build-291 release gate is a
     * run that cannot climb. The second is the object: what LOOM costs is
     * rounds, and an assist that declined the shot would refuse to pay it.
     *
     * ---- WHAT THE BAND IS, AND WHY IT IS NOT THE GUIDE'S -----------------
     *
     * `docs/objects.html` puts LOOM in band 6 at rungs 36-42, and BANDS 6
     * AND 7 DO NOT EXIST: `CFG.waves.perBand` is 7, so the five authored
     * bands cover rungs 1-35 and everything above that draws bands 4-5.
     * Standing one up for this object would be worse than the band it has:
     * `budgetAt` is the mean threat of a band's OWN roster and `shuffle`
     * filters to the in-band waves, so a band 6 holding one wave would play
     * that one wave at every rung from 36 to 42. Band 6 wants a roster, not
     * a member. Band 5 is where the deepest authored play actually is, and
     * that is where this goes -- with the guide's rungs recorded rather than
     * quietly honoured.
     *
     * ---- TWO POOLS, WHICH IS THE DIFFERENCE FROM A YOKE ------------------
     *
     * A YOKE is two bodies of one 150 and where you aim decides what you are
     * left holding. A LOOM is two bodies of 110 EACH, and the thread is up
     * while both of them are: "either end drops it" is the guide's counter
     * and it is the whole reason the object has a way in. So it declares no
     * `pool`, `pourPool` does not run for it, and `threatOf` counts BOTH
     * halves -- the same rule that makes a TOW count what it drags, a QUARRY
     * what it becomes and a REMNANT what comes back.
     *
     * ---- THE COLOUR IS THE MULTIPLY FAMILY'S, AND IT IS ALREADY SHARED ---
     *
     * `#7cffb2` at dE 0.0 against SPLITTER, HERALD and QUARRY -- so this is
     * the fourth type in one green rather than a new collision, and the
     * standing ruling (SHOAL 314, SPINDLE 315, SHRIKE 317) applies without a
     * fresh sweep: the family is what the colour means and the silhouette
     * carries the distinction. Here the silhouette is unusually safe, because
     * the thread is the picture -- nothing else in the game paints a bright
     * line between two bodies, a TOW's cable being the harmless grey.
     */
    id: 'loom',
    opens: 0,
    name: 'LOOM',
    shape: 'loom',
    gait: 'paired',
    pair: 2,
    /*
     * ---- THE THREAD'S GEOMETRY IS DERIVED FROM THE BODIES IT HANGS OFF ---
     *
     * `stops` is the thread's own radius -- what a round has to miss. What it
     * does NOT say is how long the blocking segment is: that is `d - 2r`, the
     * separation less one radius at each end, because the thread's ends are
     * AT the two centres and a round arriving at a spool from the side would
     * otherwise be eaten a unit short of the body it was aimed at. "Either
     * end drops it" is the counter, so the ends have to be shootable, and
     * deriving the inset from the radius is the idiom `roll` takes from
     * `edgeEase` and `dive` from `grabPad`: before adding a rule about where
     * the thread reaches, use the one that already says where it must not.
     *
     * It also gives the guide's "the first four seconds are free" for free
     * rather than as a fitted delay -- at `len` 56 the blocking span is 16
     * units of a 968-wide field, so it is the GROWTH that turns the pair into
     * cover. Measured in play rather than derived: on the band-5 wave at rung
     * 32, era 2, through the real director, 38 pairs across three runs were
     * released at a separation of 55.94 to 56.53 (mean 56.07-56.13) for a
     * blocking span of 15.9 to 16.5. Build 332 read 55.9 to 79.0 (mean 61-62)
     * and 15.9 to 39.0 there, because each half ran its own growth clock --
     * see `pairOn`'s ONE CLOCK PER LINK note.
     *
     * ---- ...AND `span` ALSO SETS THE STANDOFF AT THE MACHINE -------------
     *
     * Both halves steer at the mount and the link is rigid, so a pair that
     * survives its transit parks STRADDLING the machine at `span / 2` = 95 --
     * against a grab distance of `r + s.r + grabPad` = 48. Measured over
     * ninety seconds with nothing shooting: closest approach 71.2 and 84.9,
     * settling at 99 / 91, **zero grip frames and `world.attackers` empty**,
     * where a YOKE (half-link 30 against a grab of 54) grips on arrival and
     * holds 4,142 frames of 5,400. So a LOOM never bills `impactDamage` and
     * never feeds the contact half of the glitch fuse.
     *
     * That is in character -- a LOOM is a wall that costs rounds, and its
     * wave pairs it with a LURCHER, which is the half that grips -- and it
     * was SILENT, which is build 329's fault about the broadphase cell one
     * field along. `check-build` prints the standoff beside the link now, so
     * a `span` edit that hands this object a contact behaviour shows up in
     * the line that authored it.
     */
    bond: {
      len: 56, // centre to centre at release -- 2.8r, barely wider than they are
      span: 190, // ...and what it grows to
      grow: 14, // seconds from one to the other, linearly
      spin: 0.3, // radians a second about the midpoint, before compensation
      grip: 3, // how hard that rate is held, per second
      alone: 1.4, // a survivor stops building cover and comes on faster
      stops: 3, // the thread's radius: what a round has to miss
    },
    r: 20,
    hp: 110,
    density: 0.8,
    speed: 34,
    accel: 120,
    restitution: 0.35,
    wobble: 0.4,
    armor: 0,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 3, // energy it leaves when it comes apart
  },
  {
    /*
     * ---- KITE: it will not come to you ---------------------------------
     *
     * Phase 6r, band 5, the eighteenth object to ship. It closes to a station
     * and holds it, sliding sideways, and never comes closer. What the object
     * IS, is the station -- because the design document's own number for it
     * does not survive contact with the field, and the derivation that
     * replaces it is the whole of why the object is fair.
     *
     * ---- AND THE BOLT IS WITHDRAWN, MEASURED, AT BUILD 336 --------------
     *
     * This paragraph said "the bolt it throws from there is build 336".
     * Build 336 measured it instead and did not ship it, the way GYRE was
     * withdrawn at 331. Four clauses of the guide's spec, every one of them
     * empty:
     *
     * 1. THERE IS NOTHING AT RANGE TO ATTACK. The `Shooter` declares no
     *    `hp` and no `applyDamage`, and `game.js`'s pair solver bills
     *    `impactDamage` behind `if (a.applyDamage)`, which is false for it.
     *    So a bolt cannot do damage, whatever it hits.
     * 2. THE ONE EXISTING RANGED PAYLOAD IS COSMETIC AND SATURATES.
     *    `world.shock` is written at eleven sites -- TEN BOSS SITES (nine
     *    attacks; GNOMON's shadow writes it at two ranges) plus a hurled
     *    MASS landing (game.js:3318, `tow.hurl.shock` 0.62, the largest in
     *    the game against 0.30-0.50 for every boss) -- and every one of
     *    them is `Math.max`, so it does not accumulate. A twelfth
     *    `Math.max` at game.js:3864 is the decay and it is CONSTANT rather
     *    than proportional -- `shock -= dtRaw / shockFor`, i.e. 0.556
     *    shock-units a second -- so a write of V drains in `V * shockFor`
     *    and the channel is pinned once `every / N <= V * shockFor`, i.e.
     *    `N >= every / (V * shockFor)`. At the TOW's 0.62 that is 1.116s
     *    and THREE kites. The formula and not the three is the durable
     *    form, because a bolt's own V was never authored: whatever it were
     *    set to, the count that pins the channel is a small integer and the
     *    delivered count is 16 to 57.
     * 3. THE GUIDE'S COUNTER IS ARITHMETICALLY UNAVAILABLE. A fully bought
     *    turret fires `1 / (holdFireInterval * up.rate)` = 3.885 rounds a
     *    second. Band 5 is drawn at every rung from 29 to the ceiling and
     *    the budget swells this wave's authored three kites to -- measured,
     *    SWARM divided out, which is build 314's rule -- **16 at rung 29,
     *    29 at 32, 43 at 35, 67 at 42 and 104 at 49**, held at the
     *    `maxEnemies` 57 from about rung 38. At 3.2s a body that is 5.0 to
     *    17.8 bolts a second. Shooting them down, one round one kill, with
     *    the gun doing nothing else and no slew at all, is short by
     *    **1.29x at the LIGHTEST rung the wave is played on** and 4.58x at
     *    the cap -- and SWARM, which the wave rolls about half the time,
     *    doubles it.
     * 4. AND A SHOOTABLE BOLT TAKES THE GUN FOR ITS WHOLE FLIGHT. Measured
     *    on a live field over 300s at rungs 29/32/35, fully bought, nothing
     *    stubbed: the assist's best score has a median of 630-876 units and
     *    something is gripping only 0-4% of the time, so a synthetic bolt
     *    scored into the same `consider` wins 80-100% of frames at 445,
     *    346, 247, 148, 74 and 25 units out. A bolt is strictly nearer the
     *    machine than the kite that fired it and it closes -- the exact
     *    inverse of build 323's CHAFF finding, where a copy was nearer than
     *    its own owner ZERO times. CHAFF needed an explicit line to give a
     *    ghost the lock; a bolt would need an explicit refusal, and with
     *    build 291's release gate waiting for the field to thin, 15 to 57
     *    permanently-nearest targets is a run that cannot climb.
     *
     * ---- TWO CHANNELS ARE LIVE, AND THE FUSE'S BRACKET IS EMPTY ---------
     *
     * The glitch fuse is the reachable payload that is not cosmetic: it is
     * visible, it is clamped, and `Director.burnFrom` (build 293) is the
     * FIELD a third cause would be named by. **Its two readers are not**,
     * and that matters to anyone building the re-spec below:
     * `game.js:3352` is `burn === 'crowd' ? ON_CROWD : ON_GLITCH` and
     * `enemies.js:8832` is `cause === 'crowd' ? 'THE FIELD OVERRAN' :
     * 'THE FEED GAVE OUT'` -- two-way ternaries whose else arm is the
     * CONTACT answer, so a third cause is captioned "clear the turret" and
     * posted as the feed giving out. Worse, `sayOnce` opens
     * `if (lineSeen(l.id)) continue` and `markLine` persists per device, so
     * a one-element array whose line has already been read says NOTHING,
     * EVER -- a third cause is silent on any device that has met contact
     * and spends the wrong line on a fresh one. Build 293 fixed the value
     * and left the shape: a third cause is a TWO-SITE edit, and the form
     * that cannot regress is one `{ contact, crowd, ... } ->
     * { line, reason }` table rather than a third ternary.
     *
     * The fuse fails on arithmetic anyway, in both directions at once.
     *
     * SALVAGE DENIAL is the other one and it was measured first, because a
     * GLUT eating `world.drops` is a shipped precedent with a codex line.
     * It has no middle: near the machine the salvage is already gone (stock,
     * the ground inside the mount is empty on 76-99% of samples at rungs
     * 29/35, so eating on impact is invisible), while a patch that LINGERS
     * takes 1.25-1.46 drops a second worth **66-69% of everything banked**,
     * which is a wave ending rather than an attack. Income is also not
     * reproducible run to run -- 2-7x swings at one rung -- so nothing in
     * between could have been tuned against a measurement. `waves.glitch.fuse` is 14 seconds, contact fills
     * at rate 1 (7.14% a second) and recovery drains at 0.6 (4.29%).
     *
     * Measured: kites reach their stations spread over 154 to 190 seconds
     * with a mean gap of 3.5 to 5.3s and a worst three-second burst of 4 to
     * 10 arrivals (rungs 29/32/35, era 2, through the real director).
     *
     *   - ONE-SHOT, the TOW's idiom and the only precedent in the game for
     *     a swelled-count body with a ranged action: at a mean gap of ~4s
     *     the fuse drains 17% between bolts, so a bolt worth less than that
     *     can never accumulate and is invisible; a bolt worth that much
     *     puts a burst of ten at 170% of the fuse and discharges it
     *     instantly, repeatedly.
     *   - REPEATING, at the guide's 3.2s: ONE kite lobbing has to be worth
     *     `recover / fuse * every` = 13.7% of the fuse just to outrun the
     *     drain, which is legible. FORTY-THREE of them lobbing need
     *     13.7 / 43 = 0.32% each to do exactly the same thing -- and 0.32%
     *     of a 14-second fuse is 45 MILLISECONDS of contact, a
     *     thirty-third of what one gripping body does during its arming
     *     delay alone.
     *
     * So the per-bolt value that survives the crowd is 1/43 of the value
     * that makes one bolt legible, and the factor between them is EXACTLY
     * the delivered count -- which is the budget's and not the author's. A
     * per-body cadence is the wrong parameterisation of the design, and
     * that is not something a number can be tuned to.
     *
     * ---- WHY THE COUNT CANNOT BE TUNED EITHER ---------------------------
     *
     * `swell = budgetAt(tier, band) / threatOfWave(wave)`, so taking kites
     * out makes the wave lighter and the swell bigger: cutting the authored
     * count by two thirds cuts the delivered count by 58%, and at one kite
     * the wave sits 22% under its band's mean -- outside build 315's +-10%
     * lever -- while still delivering 18 of them. Adding ballast re-prices
     * band 5 upward by 4-8%, which is build 328's fault by name: ANVIL's
     * wave took that band's mean up and turned REMNANT's arm red for a
     * reason having nothing to do with REMNANT. Band 5 already misses the
     * 120-second cap at four of seven rungs on the era-2 field.
     *
     * If it ever comes back it needs a re-spec and not a number: a payload
     * that is not the shader, and a bound that is not per body -- the TOW's
     * budget of throws, or `laneBusy`'s exclusion generalised to "at most k
     * in flight for the whole type", derived from `maxEnemies` the way
     * `leaveGhost`'s cap is. Both halves together or not at all, which is
     * GYRE's ruling.
     *
     * ---- THE AUTHORED 420 IS NOT A DISTANCE, IT IS ONE ERA'S ANSWER ------
     *
     * `docs/objects.html` says "holds 420 units and never comes closer".
     * Measured across the three supported viewports and both eras -- mount,
     * rim and column read off the running game rather than derived on paper:
     *
     *   era vp        mount    rim    col   wall  stock  y@420  420/col
     *   1   320x568   567.4    260  307.4      -    400  147.4   1.366
     *   2   320x568     873    400    473  561.5  615.4    453   0.888
     *   1   390x844  1012.6    260  752.6      -    400  592.6   0.558
     *   2   390x844  1557.8    400 1157.8  561.5  615.4 1137.8   0.363
     *   1   414x896  1096.5    260  836.5      -    400  676.5   0.502
     *   2   414x896  1686.8    400 1286.8  561.5  615.4 1266.8   0.326
     *
     * One number, and it means anything from a third of the column to 1.37
     * OF IT -- a 4.2x spread, with four independent failure modes:
     *
     *  - era 1 at 320x568 the station is **112.6 units above the portal
     *    rim** (rim 260 against a station at 147.4), so the body would drive
     *    back up toward a place it cannot
     *    legally stand and nothing would remove it: the only gone-above-the-
     *    rim path in the game is `rise`'s, and it is gait-specific.
     *  - `420 - r` is **400.00, which is `CFG.shooter.aimRange` exactly**, so
     *    at era 1 the margin against the unbought assist's reach is ZERO on
     *    every viewport, to the digit. Any outward slide puts it out of reach
     *    for ever.
     *  - era 2 at 320x568 it is **behind the yard wall** -- centre 88.5
     *    above the line and LEADING EDGE 68.5, and the edge is the figure
     *    that matters because `shielded` tests `e.y + e.r` -- where
     *    `shielded` refuses every damage path the player owns -- build 318's
     *    recorded SHRIKE fault, on a body that stands still.
     *  - and held as a RADIUS rather than a HEIGHT, 22% of era 2's standing
     *    room is permanently outside `autoTarget`'s cone. A height is
     *    cone-safe by a factor of 5.8 at every viewport, because the cone
     *    admits `|dx| <= h * tan(80.2 deg)`.
     *
     * **That third figure is also the reading of the whole number.** 400 is
     * the stock reach, so the guide's 420 IS "the far edge of what the assist
     * can reach, plus the body's own radius" -- the derivation already,
     * evaluated at era 1 and written down as a distance. So the station is
     * derived from the reach (see `standHeight`), which makes the object's
     * fairness a theorem rather than a tuning: it stands exactly as far out
     * as an UNBOUGHT assist can still see it, at every viewport and both
     * eras, and never above the rim, never behind the wall and never inside
     * the grab band. Same idiom as `roll` taking its turn from `edgeEase`,
     * `dive` its lane from `grabPad` and `spread` its band from `edgeEase`:
     * before adding a rule about where a body may stand, use the ones that
     * already say where it may not.
     */
    id: 'kite',
    opens: 0,
    name: 'KITE',
    shape: 'kite',
    gait: 'standoff',
    r: 20,
    hp: 130,
    density: 0.55,
    speed: 36,
    accel: 140,
    restitution: 0.4,
    /*
     * Nearly none. `wobble` is the clumsy heading wander `drive` adds around
     * the true bearing, and this body's whole claim is that it HOLDS a line
     * -- a station that wanders is a station whose distance is a spawn roll,
     * which is what SHRIKE's corridor paid for at build 318.
     */
    wobble: 0.05,
    armor: 0,
    /*
     * The picture is oriented to the WORLD, not to the body's own travel: a
     * thing that hangs at a station hangs the same way up whichever way it
     * happens to be drifting, and the rock is internal to `drawKite`. Note
     * `upright` means exactly "the drawing ignores `angle`" and, from build
     * 330, also pins `angle` and `av` -- so build 211's impact spin cannot
     * quietly accumulate on a body whose picture never shows it.
     */
    upright: true,
    /*
     * ---- AND THE NUMBERS THAT ARE THE BODY'S, NOT THE GAIT'S -------------
     *
     * The station itself is derived from world constants and so belongs to
     * the gait; the SLIDE is this body's character and belongs here. That
     * split is the sixth instance of a fault this repo has recorded five
     * times (`plated` reading CFG.flint, `ride` CFG.graft, `respawn`,
     * `planted`, `bar` CFG.cartwheel, `bond` CFG.yoke) -- and the live one
     * is `CFG.shrike.hold`/`dwell`/`gate`, which `diveOn` reads with no type
     * indirection, so a second `dive` type would wear SHRIKE's numbers in
     * silence. `lobOf` throws for a type that declares none. (That sentence
     * said `standoffOf` from build 335 to 336 and there is no such function
     * anywhere in the tree -- a docstring naming a helper that is not there,
     * four lines above the paragraph that names the real one.)
     *
     *   slide -- the drift's amplitude, as a share of HALF the width the
     *            field leaves between `edgeEase`'s two bands, so it is the
     *            same share of the screen at every viewport and both eras
     *            (the field measures 516 to 668 wide at era 1 and 794 to
     *            1027 at era 2). The COLUMNS take what is left, which is why
     *            `lobOf` refuses a half or more: at a half there is no wall.
     *            Measured at 0.25, the drift is 36 to 99 units and the wall
     *            is 4 to 12 columns.
     *   sway  -- the share of its own cruise it spends drifting. A SHARE and
     *            not a frequency, and that is the only form that cannot
     *            outrun the body: authored as radians a second of a sinusoid
     *            the body chases, the target point's own peak speed is
     *            `slide * halfUsable * sway`, which at the first draft's
     *            0.42 and 0.55 is **72.6 u/s against a delivered 25.9** --
     *            so the station would have been permanently somewhere the
     *            body could not get to and the "drift" would have read as a
     *            lag. `standOn` derives the rate from the amplitude instead.
     *   ease  -- how hard it holds the station: the share of the gap it
     *            closes a second, so the approach reads as arriving rather
     *            than as stopping dead. `check-build` asserts the settling
     *            distance it implies (`speed * sway / ease`, 7.6 units) is
     *            well inside the body, or the thing parks off its own slot
     *
     * And the block is NOT called `standoff`: see `lobOf`, which explains why
     * -- 43 hits of that word in `src/` outside this file make it a field the
     * dead-field sweep cannot see.
     *
     * The NAME is the guide's noun for the bolt, which build 336 withdrew, so
     * there is nothing lobbed and these three are the STATION's numbers. Left
     * as it is on purpose: `lob` still has no other hit in the tree, which is
     * the whole property the name was chosen for, and renaming a field for
     * tidiness is how a reader gets missed. Read it as "the standoff block".
     */
    lob: { slide: 0.25, sway: 0.34, ease: 1.6 },
    /*
     * ---- THE GUIDE'S FAMILY HEX IS BLOOM'S, AT dE 0.00 ------------------
     *
     * `docs/objects.html` gives the volatile family `#ff5d8f`, and for one
     * afternoon this type wore it under a comment saying "this is the first
     * body to wear it, so there is no collision to answer yet". That comment
     * was FALSE, and the mistake in it is worth more than the colour: it
     * checked the GUIDE's family roster (MIRE, KITE) instead of the LIVE
     * one. `#ff5d8f` is BLOOM's body colour and `#ff2d6f` is BLOOM's glow,
     * byte-identical, and BLOOM is a loose hostile in five waves -- four in
     * band 3 and one in band 4. `bandsFor` returns `[hi - 1, hi]`, so every
     * rung from 29 up draws bands 4 and 5 together and the two would be on
     * the field at once. It is also the AMMUNITION branch root in the tree
     * and BLOOM BLAST's own row in the ledger, so the hue is spoken for
     * three times over. Nothing in `check-build` tests uniqueness -- the
     * colour guard is grey-means-harmless plus a chroma floor, and 0.635
     * passes it -- so this would have shipped in silence.
     *
     * Swept the rose band against all 120 roster tones and all 556 distinct
     * hex literals in the tree, on a dE76 instrument validated first against
     * five figures recorded in CLAUDE.md (0.62 against 0.6, 29.12 against
     * 29.1, 11.76 against 11.8, 14.82 against 14.8, 36.60 against 36.6).
     * `#fa003a` is **40.4 from BLOOM's body**, 26.6 from its glow, and has
     * NOTHING within 12 of it anywhere in the tree. Its nearest tone of any
     * kind is TERMINUS's glow at 16.0, and that is a boss -- an aperture
     * clears the loose field on the way in, so the two are never on the
     * screen together, which is VEIL's own precedent (DYNAMO's glow at 3.0).
     * Luminance 0.206, between VEIL's 0.180 and LATCH's 0.265, because a
     * body reads almost entirely as its outline (build 199) and the
     * better-separated pure reds are too dark to draw a 20-unit one in.
     * Body-to-glow is 19.6, mid-range for the roster's 10 to 25.
     *
     * Build 322's rule, applied rather than quoted: before accepting a
     * dE-0.00 collision, ask whether the family has room. Here it does.
     */
    color: '#fa003a',
    glow: '#c4002e',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 4, // energy it leaves when it comes apart
  },
  {
    /*
     * ---- MIRE: it does not hurt you, it makes the fight not pay ----------
     *
     * The last of the object guide's nineteen, and the only one that was
     * re-specced before it was built -- see its card in docs/objects.html for
     * the measurements. All three of its authored payload clauses were empty:
     * a mine's arming time (`CFG.mines.inPlay` false since build 289), a
     * DECOY's decay (a purchase at 37.5% duty and 0% unbought), and "the
     * intake pulls at half rate", which is dead in all three of its possible
     * readings. The body, the gait and the counter are the guide's; the
     * payload is salvage.
     *
     * NO DAMAGE AT ALL is the core rather than a detail, and it is what makes
     * the stain's channel the right one: salvage denial is always on, needs no
     * purchase, has no duty cycle and costs no health. `Stain.swallow` marks a
     * drop `dead` and `dissolved`, which is `Enemy.feed`'s pair -- the second
     * flag being the one `Game.sweep` reads to tell being eaten from being
     * destroyed, so an eaten mote books no kill and no codex entry.
     *
     * `wobble` is 0 and written out rather than omitted, the same reason
     * LATCH's and CHAFF's are: the WEAVE is this body's lateral and the whole
     * of its picture, and `drive`'s clumsy heading wander on top of it would
     * muddy the one thing the gait is. `upright` because the drips hang down.
     *
     * The colour is not the guide's `#ff5d8f`, which is BLOOM's body colour at
     * dE 0.0 and the same collision KITE had to answer at build 335. Swept
     * across the rose band against all 89 roster tones: `#bc1aa7` is 21.3 from
     * its nearest (`#ff3fc0`), inside the 15-23 this repo documents as
     * working, and 35+ from both BLOOM and KITE. The best-separated colour in
     * that band is a pure red at 24.6 and is refused: red is the glitch and
     * the alert register in this game and is spoken for by meaning rather
     * than by distance.
     */
    id: 'mire',
    opens: 0,
    name: 'MIRE',
    shape: 'mire',
    gait: 'serpent',
    r: 24,
    hp: 160,
    density: 0.7,
    speed: 30,
    accel: 100,
    restitution: 0.4,
    wobble: 0,
    armor: 0,
    upright: true,
    /*
     * The ground it lays, on the TYPE and not in a shared block -- build 330's
     * rule, and `stainOf` throws for a `serpent` type that declares none.
     * `rRim`/`rFloor` are the radius at the two ends of the column, so "wider
     * the closer it gets" is the ground as well as the weave; `eat` is the
     * reach past that radius, the shape `glut.eat.reach` already has; `tick`
     * is the sweep clock, Patch's own rate, because anything continuous in
     * this game runs on a clock and not on the frame.
     */
    stain: {
      every: 1.1,
      rRim: 34,
      rFloor: 78,
      life: 7,
      eat: 6,
      tick: 0.25,
    },
    color: '#bc1aa7',
    glow: '#7a1170',
    weight: 0, // authored into its wave, never rolled by the ordinary spawn
    drops: 4,
  },
  {
    /*
     * SPINDLE: the only body in this game that is not a circle to a round.
     *
     * A bar 96 long and 11 thick, turning end over end at two thirds of a
     * revolution a second. Broadside it is the widest target on the field;
     * edge-on it is thinner than a NEEDLE. Nothing else changes its own hit
     * profile, and that is the object: auto-fire spends about half its
     * rounds on the edge, and a thumb does not have to.
     *
     * ---- `bar` IS A HIT PROFILE AND NOT A BODY ---------------------------
     *
     * `r` is still 30 and the PHYSICS still uses it: the pair solver, the
     * arena clamp, the broadphase, every blast, every beam, every chooser
     * and the mass all see an ordinary 30-unit disc. What reads the bar is
     * `resolveSegment`, which is the one place a ROUND is tested against a
     * body -- so the thing that turns is what you have to shoot, and
     * everything else in the game is unchanged. Making it a capsule
     * everywhere would be a different build and a different game: the pair
     * solver alone is `pen = rr - d - slop` in five places.
     *
     * The bar reaches 1.6r + 0.183r = 53.5 units from the centre, past `r` --
     * so a round can legitimately connect outside the body's own radius, and
     * `hitReach` is what tells the sweep to look. It is inside `MAX_BODY_R`
     * -- 72 when this was written, 89.6 since ANVIL took it at build 328 --
     * and inside half the broadphase cell, which check-build asserts.
     */
    id: 'spindle',
    opens: 0,
    name: 'SPINDLE',
    shape: 'bar',
    gait: 'cartwheel',
    /*
     * The capability AND its proportions, as multiples of `r`. Deliberately
     * separate from the gait, which is about how the body MOVES -- the same
     * split as `spent` (what may be shot) against `staged` (what may be
     * chosen).
     *
     * `docs/objects.html` gives this bar 96 long and 11 thick at r 30, which
     * is 1.6r and 0.183r -- and those are the numbers rather than the 96 and
     * the 11, so the hit test, `hitReach` and the drawing read one owner and
     * a grafted spindle takes its bar with it. check-build prints the units
     * they work out to.
     *
     * They lived in `CFG.cartwheel` until build 330 and moved here when a
     * second bar type arrived: a shape shared by gait is a shape the next
     * type inherits in silence. See the note in that block.
     */
    bar: { long: 1.6, thin: 0.183 },
    r: 30,
    hp: 180,
    density: 0.7, // a bar is mostly the space it sweeps
    speed: 40,
    accel: 130,
    restitution: 0.5,
    wobble: 0.8,
    armor: 0.15,
    color: '#c9e84a',
    /*
     * The colour is the kinetic family's, which is TOW's at dE 0.0 -- the
     * same collision SHOAL documented against MOTE one build ago, and kept
     * for the same two measured reasons: the palette has no well-separated
     * region left (the best colour in the whole HSL grid is a magenta at dE
     * 37.7) and the family is the point. The GLOW is separated instead, at
     * 13.4 from TOW's, and the silhouette does the rest -- a 96-unit bar
     * against a head on a cable is not a picture anybody confuses.
     */
    glow: '#7e9a14',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 5, // energy it leaves when it comes apart
  },
  {
    id: 'shoal',
    opens: 0,
    name: 'SHOAL',
    shape: 'dart',
    gait: 'flock',
    school: 14,
    r: 7,
    hp: 14,
    density: 0.6,
    speed: 96,
    accel: 300,
    restitution: 0.7,
    wobble: 0.6,
    color: '#7ef9ff',
    glow: '#00d4ff',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 1, // energy it leaves when it comes apart
  },
  {
    /*
     * FLINT: a plate on one face, and it keeps that face toward you.
     *
     * `plated` is the mechanism and `CFG.flint` carries the arithmetic,
     * including why the plate is bypassed by the five directionless damage
     * sources and why a static turret can never find its side.
     *
     * ---- THE FOURTH TYPE IN THIS GOLD, AND THAT IS NOW WORTH ASKING -----
     *
     * `docs/objects.html` puts it in the `edge` family, which is `#ffd166` --
     * NEEDLE's body colour, GLUT's, and SHRIKE's since build 317. Four types
     * in one hex is past where the silhouette ruling was meant to stretch,
     * and CLAUDE.md is explicit that picking a new category colour is a
     * decision to be ASKED about rather than taken, so the tone is kept and
     * the question is recorded. What is done in the meantime is the half that
     * needs no permission: its wave pairs it with PRISM, so none of the other
     * three golds is ever on the field beside it.
     */
    id: 'flint',
    opens: 0,
    name: 'FLINT',
    gait: 'march',
    shape: 'flint',
    plated: true, // see CFG.flint -- the armour is on the front face only
    r: 16,
    hp: 120,
    density: 1,
    speed: 44,
    accel: 150,
    restitution: 0.4,
    wobble: 0.8,
    armor: 0.55,
    color: '#ffd166',
    glow: '#c8811a',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 3, // energy it leaves when it comes apart
  },
  {
    /*
     * SHRIKE: fast on the run, slow on the way back.
     *
     * The `dive` gait is the whole object and `CFG.shrike` carries the
     * arithmetic, including why it passes the machine rather than through it.
     *
     * ---- THE THIRD TYPE IN THIS GOLD, AND THE RULING IS BUILD 314'S ------
     *
     * `docs/objects.html` gives the `edge` family `#ffd166`, which is
     * NEEDLE's body colour and GLUT's. That is the same collision SHOAL had
     * with MOTE and SPINDLE with TOW, and the same answer: the family is what
     * the colour means, the palette has no well-separated region left, and
     * the SILHOUETTE carries the distinction -- a swept dart on a long spine
     * against a sliver and against a fat disc. What is NOT done is put two
     * of the three golds in one wave: the band-2 entry pairs it with LURCHER
     * and MOTE rather than with the NEEDLE that wears its exact tone.
     * The GLOW is separated instead, which is the half that was free.
     */
    id: 'shrike',
    opens: 0,
    name: 'SHRIKE',
    shape: 'shrike',
    gait: 'dive',
    r: 14,
    hp: 70,
    density: 0.7,
    speed: 40,
    accel: 340,
    restitution: 0.5,
    /*
     * Nearly none, which is a decision and not a default, and the number is
     * set by the PAYLOAD rather than by taste. `wobble` is the clumsy wander
     * `drive` adds around the true bearing, and the grip this object exists
     * to deliver depends on holding a corridor `CFG.shooter.grabPad` = 2
     * units wide -- so the wander is the thing that decides whether a pass
     * lands at all. Measured over eighteen bodies per setting: at 0.7 the
     * lane drifted so far the pass never entered the band; at 0.12 and at
     * 0.06 five passes in six landed, with the misses reading a closest
     * approach of 42.5 to 43.5 against a band of 42; at 0.03 **eighteen of
     * eighteen** landed, every closest approach inside the band, and the
     * scrape fell to 0-1 of 70 health. A precise flyer is also what a
     * diving dart should be.
     */
    wobble: 0.03,
    color: '#ffd166',
    glow: '#ff7a1c',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 3, // energy it leaves when it comes apart
  },
  {
    /*
     * LATCH: it is not coming for you.
     *
     * The `ride` gait is the whole object, and most of it was already in the
     * game -- a SEED has hunted the biggest body on the field and ridden it
     * as a shootable ball since SCION shipped. What LATCH adds is a SECOND
     * kind of rider with its own numbers, which is why `grow`, `tough`,
     * `regen`, `hp`, `life` and `hunt` came off `CFG.graft` and onto the
     * type: see the note there, and `ridesOf` in enemies.js, which throws
     * for a `ride` type that declares none.
     *
     * ---- IT IS A HOSTILE, NOT `harmless`, AND THAT IS A DECISION ----------
     *
     * SEED is `harmless` and a LATCH could have been: neither breaches the
     * turret and neither corrupts the feed. It is not, for three reasons
     * that all come off rules this repo already wrote down.
     *
     *  - `harmless` weighs ZERO in `threatOf`, so the whole band would carry
     *    a problem it never paid for. Builds 307-311 used that deliberately
     *    for five pieces of scenery; this is not scenery.
     *  - `harmless` is a refusal FIVE damage paths honour (build 234): a
     *    mine will not trigger for one, WIRE will not cut one, a `Patch`
     *    will not bite one, LANCE's sweep skips it and WARD's arc skips it.
     *    The counter here is "shoot the tick", so four of the five things
     *    that could take a tick off before it boards would refuse to.
     *  - `scaleToTier` returns on its first line for a harmless body, so the
     *    ball's health would be 40 at rung 15 and 40 at rung 49 against a
     *    gun the tree has multiplied by six.
     *
     * What it costs is that a LATCH with nothing to ride counts against
     * `standing()` and the build-291 release gate while it wanders. That is
     * what `rides.life` bounds, and it is the reason the clock is not
     * optional -- a hostile that comes to rest outside `autoTarget`'s cone
     * with no way to expire is build 312's `tumble` finding verbatim.
     *
     * ---- THE FOURTH VIOLET, AND THE GUIDE'S OWN HEX IS LURCHER'S ---------
     *
     * `docs/objects.html` gives the `strange` family `#b98cff`, which is
     * LURCHER's body colour at dE 0.0 in CIELAB, and YOKE's -- the same
     * collision SHOAL had with MOTE, SPINDLE with TOW and SHRIKE with
     * NEEDLE. Here it was avoidable rather than merely survivable, because
     * the family is a whole region and only one point in it is taken: swept
     * over the violet band against every field tone in the roster, `#bf5fff`
     * is 11.8 off the nearest (SEED's GLOW, a halo rather than a
     * silhouette), 14.8 off LURCHER's and SCION's glow and 29.1 off
     * LURCHER's body, while reading as plainly violet. The glow is 27.3
     * clear. For the record the best-separated violet available is `#4000ff`
     * at 46.0 and it is refused for reading as blue at the lightness a
     * 9-unit body needs -- a body is mostly its outline (build 199) -- and
     * the best-separated colour anywhere is a dark green at 43.5, which
     * means energy. LURCHER is also kept out of LATCH's own wave, which is
     * build 317's ruling applied where it still bites.
     */
    id: 'latch',
    opens: 0,
    name: 'LATCH',
    shape: 'latch',
    gait: 'ride',
    r: 9,
    hp: 40,
    density: 0.6,
    speed: 160,
    accel: 320,
    restitution: 0.5,
    /*
     * None: `hunt` is a beeline and does not read `wobble` at all -- the
     * clumsy wander `drive` adds around a true bearing is a property of
     * marching, and this thing does not march. Written out at 0 rather than
     * omitted so the value is a statement and not an absence, which is the
     * same reason SHRIKE's is written out above.
     */
    wobble: 0,
    color: '#bf5fff',
    glow: '#9b2fff',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 1, // energy it leaves when it comes apart
    /*
     * What it gives the host, and it is all of what the object does.
     *
     * `armor` and `regen` are the guide's two numbers. `grow` and `tough`
     * are ZERO because the guide names neither: a LATCH does not make its
     * host bigger and does not raise its ceiling, it holds the ceiling shut
     * -- the 14 a second is spent closing a wound rather than adding health
     * that was never there. That also keeps `MAX_BODY_R` where SEED left it.
     *
     * `hp` 40 is the body's own health, deliberately: a tick costs the same
     * to shoot in the air as it does on the flank, so "shoot the tick" is
     * one price rather than two, and it climbs with the rung like any other
     * hostile's because this type is not `harmless`.
     *
     * `hunt` 900 clears the era-1 column (963 units floor to rim), so a
     * LATCH released from the portal can see a host anywhere below it rather
     * than wandering until it happens to come within SEED's 480. `life` 20
     * is a little over three times the 6.0s crossing at its own cruise, so
     * a wave that gives it a host leaves it time to reach one and a wave
     * whose hosts are all dead takes it off the field instead of parking it.
     */
    rides: {
      life: 20,
      hunt: 900,
      grow: 0,
      tough: 0,
      armor: 0.2,
      regen: 14,
      hp: 40,
    },
  },
  {
    /*
     * CHAFF: the one thing on the field that makes AUTO AIM worse than a
     * thumb.
     *
     * `CFG.chaff` carries the arithmetic and the two measurements the whole
     * object rests on -- that the guide's version of it does nothing, and
     * that a radial hop is invisible to the gun. Read that block first; this
     * one is only the body.
     *
     * ---- THE THIRD TYPE IN THIS CYAN, AND THE FAMILY HAD ROOM -----------
     *
     * `docs/objects.html` gives the `swarm` family `#7ef9ff`, which is MOTE's
     * body colour and SHOAL's -- dE 0.0 in CIELAB against both, the same
     * collision SHOAL had with MOTE, SPINDLE with TOW, SHRIKE with NEEDLE and
     * LATCH with LURCHER. The standing ruling is that the family is what the
     * colour means and the silhouette carries the distinction; the rider build
     * 322 added to it is to ask whether the family has ROOM before accepting a
     * dE-0.0 collision, because a family is a region and only one point in it
     * was taken.
     *
     * It has. Swept across the cyan band against every field tone in the
     * roster: `#00b0e6` is 15.8 off the nearest (MOTE's and SHOAL's GLOW, a
     * halo rather than a silhouette), 22.1 off LANTERN's glow and 14.8 off
     * MOTE's own body, which is inside the 15-23 this repo documents as a
     * working separation. The glow is 20.3 clear. For the record the
     * best-separated point anywhere in that band is `#33997c` at 40.1 and it
     * is refused for being a desaturated teal -- green means energy -- and
     * every other saturated cyan sits 1.7 to 5.2 from MOTE's glow.
     *
     * And the wave keeps both sharers out: see the CHAFF entry in WAVES, which
     * pairs it with LURCHER rather than with the MOTE that prices identically.
     */
    id: 'chaff',
    opens: 0,
    name: 'CHAFF',
    shape: 'chaff',
    gait: 'hop',
    /*
     * The picture is oriented to the WORLD: two arcs with their gaps at fixed
     * bearings, which is what the object guide draws. Without this
     * `Enemy.draw` rotates by `this.angle` -- a random spawn roll with a
     * random `av` on top -- which is the fault build 310 found in EMBER's
     * trail and LANTERN's bail, both of whose docstrings claimed an
     * orientation the drawing did not have.
     */
    upright: true,
    r: 13,
    hp: 60,
    density: 0.6,
    speed: 70,
    accel: 260,
    restitution: 0.5,
    /*
     * None. `wobble` is the clumsy heading wander `drive` adds around a true
     * bearing, and it is a property of MARCHING: this body does not march, it
     * sits still and then crosses a hundred units in three frames. Written
     * out at 0 rather than omitted so the value is a statement and not an
     * absence, the same reason SHRIKE's and LATCH's are.
     */
    wobble: 0,
    color: '#00b0e6',
    glow: '#0096c7',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 2, // energy it leaves when it comes apart
  },
  {
    /*
     * REMNANT: a kill that is not a kill until the second one.
     *
     * `CFG.remnant` carries the arithmetic and the three measurements this
     * object rests on -- that the second arrival is not a threat, that "one
     * or two" is about twenty, and that what survives is the ACCOUNTING.
     * Read that block first; this one is only the body.
     *
     * ---- THE FIRST OBJECT IN FIVE WHOSE COLOUR HAD REAL ROOM -------------
     *
     * `docs/objects.html` gives the `strange` family `#b98cff`, which is
     * LURCHER's body colour and YOKE's -- dE 0.0 against both, the same
     * collision SHOAL had with MOTE, SPINDLE with TOW, SHRIKE with NEEDLE and
     * LATCH with LURCHER. Build 322's rider to that ruling is to ask whether
     * the family has ROOM before accepting it, and LATCH found `#bf5fff` at
     * 11.8 from its nearest neighbour.
     *
     * Swept again, this time against the roster AND every tone the tree and
     * the ability bar paint -- 99 colours, near-white ink dropped, which is
     * the sweep build 322's could not do and which build 223's worst
     * collision (a tree tone) is the reason for. `#f81fff` is **30.1** off
     * its nearest (LATCH's own body), 34.2 off the ability bar's magenta and
     * 36.2 off PARITY's glow: two and a half times the separation LATCH
     * settled for, at the far violet end of the family rather than outside
     * it. The glow is 22.3 clear and sits 16.9 from the body, so the halo
     * reads as a deeper version of the same colour the way every other pair
     * does.
     *
     * Refused, with reasons, so the next sweep need not repeat them: a pure
     * magenta at h300 reaches 33.5 and is the register `#ff6beb` already
     * holds; and the blue-violet end (`#4000ff`, the best-separated violet
     * build 322 found) is refused for reading as BLUE, which is that build's
     * recorded judgement and is only softened here by REMNANT being r 30
     * rather than r 9.
     */
    id: 'remnant',
    opens: 0,
    name: 'REMNANT',
    gait: 'march',
    shape: 'remnant',
    /*
     * MARCH, written out -- and build 338 OVERTURNED build 324's ruling here
     * deliberately, so the argument is worth keeping.
     *
     * REMNANT is the first of the objects since HUSK that needs no new gait:
     * the whole object happens at its death and after it, so the body walks
     * in like anything else. Build 324's first draft wrote `gait: 'march'` out
     * on build 224's reasoning -- a defaulted value indistinguishable from a
     * chosen one is the shape this repo keeps paying for -- `check-build`
     * refused it, and the rule was narrowed to "write out a value that could
     * have been different, and do not invent a name for the default".
     *
     * Both halves of that are answered rather than ignored.
     *
     * The refusal was CIRCULAR: the guard refused `march` because it was not
     * in `GAITS`, and it was not in `GAITS` because the guard refused it. It
     * is a row now, exempt from the reader test with the test's own argument
     * (a type naming march and getting the march is correct), and held by the
     * stronger rule instead -- every loose type declares one and `gaitOf`
     * throws for one that does not.
     *
     * And `march` is not an INVENTED name: this file already uses the word
     * fifteen times in prose -- "the ordinary march", "the closing march",
     * "this body does not march" -- so it was the name of the thing all
     * along and simply was not a value. What settles it is the cost of the
     * absence, which this paragraph WAS: fifteen lines at one site saying
     * "the correct absence rather than an omission", and nothing like it at
     * the other twenty-four, so a reader could not tell a FLINT that was
     * considered and found to march from one nobody had asked about. A rule
     * that needs a paragraph per site to distinguish a chosen absence from an
     * oversight is a rule making the omission expensive instead of
     * impossible -- which is exactly what build 220 tried for `levels` before
     * 224 removed the default.
     *
     * The precedent is two fields along, on this same roster: LATCH's and
     * CHAFF's `wobble: 0` are "written out at 0 rather than omitted so the
     * value is a statement and not an absence". Same field shape, same
     * majority default, opposite ruling -- and the only thing that had made
     * `gait` different was a guard.
     */
    /*
     * The picture is a ring with pieces missing, at fixed bearings, so the
     * gaps mean something -- without this `Enemy.draw` turns it by a random
     * spawn roll and the "pieces gone" reads as a body that is simply spinning.
     * Build 310's EMBER-trail fault.
     */
    upright: true,
    r: 30,
    hp: 300,
    density: 1.1,
    speed: 36,
    accel: 120,
    armor: 0.12,
    restitution: 0.4,
    wobble: 0.5,
    color: '#f81fff',
    glow: '#c400d6',
    weight: 0, // authored into its wave, never rolled by the ordinary spawn
    drops: 6,
    /*
     * ---- what makes it a remnant, and why it is a TYPE FIELD -------------
     *
     * Its presence is what `Enemy.destroy` dispatches on, the way `detonate`,
     * `splits`, `tows`, `beads`, `school` and `pair` already are.
     *
     * ---- AND THE NAME IS `respawn` BECAUSE THE BOSSES OWN THE OTHER TWO ---
     *
     * The first draft called it `reform`, and `Boss.reform` has existed since
     * the bosses did (boss.js:585 -- rebuild a shell to a health fraction,
     * used by AMPLITUDE, DYNAMO and ORDINAL's TALLY), as has `Boss.revive`
     * (boss.js:401 -- bring one dead segment back). Both mean a version of
     * "bring it back", so the boss modules own that vocabulary and a type
     * field sharing a word with it is a reader's trap. Build 298's rule is
     * the same one a step further along: grep a new field against the boss
     * modules FIRST.
     *
     * It also blinded a guard. `check-build`'s dead-field sweep looks for the
     * key as `.key` or a quoted string anywhere in `src/` outside config.js,
     * and `reform` MATCHED -- on `this.reform(world, ...)` inside a boss -- so
     * a brand-new field that nothing read passed the sweep written to catch
     * exactly that. A guard that passes for a reason nobody chose, which is
     * build 314's finding about `school` and the body ceiling. `respawn` has
     * no other hit in `src/` or `scripts/`, so the sweep can see it.
     *
     * And the three NUMBERS are here rather than in `CFG.remnant`, which is
     * the correction build 322 paid for: a rider's numbers were one shared
     * block, so a second rider would have worn SEED's growth and healing in
     * total silence with no field to set and nothing to fail. The same is
     * true here -- a second type that came back on a different clock, at a
     * different share, would wear these. So a number about THIS BODY's
     * return is its own, `respawnOf` throws for a malformed block, and
     * `check-build` holds it in both directions. (The shared half of that
     * sentence named `CFG.remnant.mark`, which had no reader and came out at
     * build 337 -- what is genuinely shared is the MARK ITSELF, the idiom
     * that says a return is pending.) That is the fourth mandatory-field guard
     * after `levels` (224), `band` (303) and `beads`/`climb`/`rides`.
     */
    respawn: {
      back: 6, // seconds from the first death to the second arrival
      hp: 0.5, // ...the share of its health it comes back with
      quick: 1.4, // ...and the share of its speed it gains
    },
  },
  {
    /*
     * ---- ANVIL: the heaviest thing that has ever walked down this field ---
     *
     * Build 328, phase 6o, and the fifteenth of the twenty. Two mechanisms,
     * both refusals, and the object is what they add up to: it takes no arc
     * (`gait: 'creep'`) and no impulse in the game moves it (`planted`). So
     * there is no button that answers it and no angle that avoids it -- only
     * the gun and the time it takes to cross. `docs/objects.html`'s own
     * counter says exactly that: "the answer to ANVIL is a gun, not a
     * button".
     *
     * ---- WHAT `planted` REFUSES, AND WHERE --------------------------------
     *
     * Two sites, both of them doors everything already comes through, which
     * is why this is two lines rather than a sweep. `Enemy.applyDamage`
     * zeroes the `impulse` argument -- every round's knockback, PULSE, PILE,
     * HEAVE, HAIL, a DECOY's parting blast, WELL's knot and every
     * `applyBlast` caller, because a blast bills its push there too. And
     * `resolvePair` in physics.js gives it no share of either correction,
     * reusing `plow`'s own expression with the roles swapped: a hurled MASS
     * stops on it rather than driving it down the field.
     *
     * Measured, one 3000-impulse hit with `throwOff` -- the shape PULSE,
     * PILE, HEAVE and HAIL all carry: **0.00 u/s, against 91.45 for a BULWARK
     * and 643 for a LURCHER**, with the damage landing in all three. The
     * anvil is the heaviest of the three (`invMass` 0.016 against 0.031 and
     * 0.214), so the controls also say the zero is not merely mass.
     *
     * The DAMAGE is untouched, deliberately. A press that did nothing at all
     * would read as the ability being broken; the ring, the shake and the
     * sound are the ability's and still happen, and the number still lands.
     *
     * ---- THE GUIDE'S 18 u/s AND ITS 26 SECONDS CANNOT BOTH BE TRUE --------
     *
     * The guide authors `speed: 18` and a counter of "the twenty-six seconds
     * it takes to cross". Both cannot hold: the column a CLOSING body crosses
     * is the portal's rim to the mount, measured 671 world units at era 1 and
     * 1202 at era 2, so 18 u/s is 37 and 67 seconds -- and band 5 is era-2
     * territory, where a wave already has a 120-second cap that four of its
     * seven rungs miss (build 306).
     *
     * 26 seconds is the number that IS the design, so the speed is derived
     * from it the way EMBER's and LANTERN's were at build 308: 1202 / 26 is
     * 46.2. Measured, the delivered SPEED is **45.8** against the authored 46
     * -- `creep` is in `OWN_SPEED` and grosses the ask up by
     * `(k + damping) / k` -- and the crossing is **27.5s at era 2 and 15.8s
     * at era 1**, the same 1.54x every other body's clock stretches by
     * between the two fields.
     *
     * Those are longer than `column / speed` (26.0 and 14.5) by about a
     * second and a half, and the reason is worth stating rather than tuning
     * away: `accel` 40 is the slowest on the roster, so the body spends the
     * first two seconds getting up to 45.8 from a standing start. The clock
     * this object promises is the crossing, and the crossing is what was
     * measured.
     *
     * Note which column that is, because the first draft of this note used
     * the wrong one. Floor-to-rim is 963 and 1481 and is the figure every
     * RISE body's clock is derived from, since a rise body's journey ends at
     * the rim; a hostile's ends ON the machine, and a probe that waited for
     * the floor line timed out at 300 seconds with the body sitting on the
     * mount.
     *
     * That is the fourth guide figure this phase has had to correct against
     * the field it lands on -- EMBER's speed (307), LANTERN's clock (308),
     * SHRIKE's climb (317) -- and the rule is the one build 307 wrote down: a
     * number authored in a design document is a proposal.
     *
     * ---- WHAT IT COSTS BAND 5, WHICH IS THE OTHER DELIVERABLE -------------
     *
     * `budgetAt` is the mean threat of a band's own authored waves and
     * `threatOf` is health over `threatPerHp`, so 1400 health weighs 46.7
     * against band 5's mean of 33.0 -- there is no wave containing one anvil
     * that lands near that mean, and pretending otherwise would mean scaling
     * the health until the heaviest body in the game was not. So the band's
     * budget rises and the number is measured in one container either side
     * rather than estimated: **33.0 -> 34.1, +3.3%**, with the other four
     * bands identical. QUARRY paid +9.3% for band 4 on the same terms at
     * build 312.
     */
    id: 'anvil',
    /*
     * NO ENERGY GATE, like every other one of phase 6's objects, and the
     * reason is
     * worth writing down because the first draft carried `MB(4)` and the
     * build failed for it.
     *
     * `check-build`'s pre-180 migration guard requires every gated type's
     * `opens` to sit at or under its own old KILL gate times twelve, and that
     * table is frozen history -- a type that did not exist before build 180
     * is not in it, so `0 * 12000 < MB(4)` and the guard reads a re-lock. The
     * guard is right about its domain and the gate was the mistake: a pre-180
     * save never had an ANVIL to lose.
     *
     * And the gate would have done nothing anyway. The BAND is the gate for
     * all of them: this wave is authored into band 5, which is only
     * drawn at rungs 29-35, and a run standing there has banked orders of
     * magnitude more than any threshold worth writing.
     */
    opens: 0,
    name: 'ANVIL',
    shape: 'anvil',
    gait: 'creep',
    // The flange is the silhouette, so the picture is oriented to the world
    // and not to a spawn roll -- see `drawAnvil` and build 310's note.
    upright: true,
    /*
     * The mark itself. A capability read at two doors -- `applyDamage` and
     * `resolvePair` -- and `check-build` refuses a SECOND type declaring it,
     * because the two readers are written against this object's design and a
     * new type would inherit both refusals in silence. That is build 319's
     * `plated` guard and 322's `rides` guard applied to a third flag.
     */
    planted: true,
    /*
     * FIFTY-SIX IS THE WIDEST BODY IN THE GAME, AND IT MOVED THE GRID.
     *
     * Written down at build 329, one build late, because authoring this
     * number had a consequence nobody looked for. `MAX_BODY_R` takes the
     * largest `r` over this whole table and, for anything not `fixed`,
     * multiplies it by what graft can add -- so this 56 counts as
     * `56 * (1 + MAX_GRAFT_GROW * graft.stack)` = **89.6**, past a fully
     * grafted BULWARK's 72. `GRID_CELL` is derived from that, so the
     * broadphase cell went **144 -> 180** for every object in the game.
     *
     * Two measured consequences: the ORDINAL hash moved
     * `1213474222 -> -1334607133` (bisected to this type's presence in
     * `ENEMY_TYPES` -- 328's code against 327's config hashes identically,
     * and removing only the wave does not move it back), and a full 57-body
     * field costs **0.268 -> 0.387 ms an update**, best of five runs of 300.
     *
     * The widening is correct and stays -- a grafted anvil really is 89.6, so
     * a 144 cell would leave real pairs untested. It is the silence that was
     * wrong, and `check-build` now pins the cell at 180 against this id so
     * the next radius that moves it has to say so.
     */
    r: 56,
    hp: 1400,
    /*
     * Heavier than anything else on the field by a distance, and it is not
     * decoration: `mass` is `density * r * r` and the pair solver shares
     * every correction by inverse mass, so a body that meets an anvil is
     * moved by almost all of it even before `planted` takes the rest.
     */
    density: 3.4,
    // Derived from the crossing clock above, not authored -- see the note.
    speed: 46,
    accel: 40,
    restitution: 0.18,
    // No wander: the gait is the straight line, and `drive` reads this.
    wobble: 0,
    armor: 0.3,
    color: '#5d9cff',
    glow: '#2f6bd8',
    weight: 0, // authored into one wave, never rolled loose
    drops: 18,
  },
  /*
   * ---- VEIL: THE FIRST BODY THAT CHANGES WHAT MAY BE CHOSEN --------------
   *
   * Build 330, phase 6p, the sixteenth of the twenty. A membrane 104 units
   * across and twelve deep that goes wide before it comes down: nothing
   * behind it can be picked by the assist, by GEOMETRY rather than by a mark.
   *
   * Every rule this game has for what may be shot at is a FLAG on the body --
   * `staged` (shootable, not choosable), `spent` (drawn, not choosable, and
   * rounds pass through), `dissolved`, `harmless`, `shielded` -- and all of
   * them are properties of the thing being refused. This one is a property of
   * something ELSE: a mote behind a sheet is an ordinary mote and becomes
   * choosable again the moment the sheet is gone or has moved. So the object
   * is not a mark at all; it is the assist declining a shot it cannot make,
   * which is exactly the reading `shielded` already carries about the yard
   * wall ("aiming at one is the turret claiming reach it does not have").
   *
   * THE CONSISTENCY IS THE POINT AND IT IS MEASURABLE: a round fired at a
   * body behind the sheet really does stop on the sheet, because the sheet is
   * a body with a capsule hit profile sitting in the line of fire. The
   * chooser is agreeing with the physics rather than being told a rule.
   *
   * ---- AND IT CANNOT SILENCE THE GUN, WHICH IS A PROOF AND NOT A HOPE ----
   *
   * The hazard in an occlusion rule is a field where nothing is choosable:
   * `autoTarget` returns null, the gun goes quiet, the build-291 release gate
   * waits for a field that never thins, and the run cannot climb. It cannot
   * happen here. Occlusion is defined as "a NEARER sheet crosses the ray", so
   * it is a strict order by distance -- the nearest considered body has
   * nothing in front of it to be hidden by, and is therefore always
   * choosable. A sheet that has come all the way down to the mount occludes
   * the entire field and is itself the nearest thing on it, which is the
   * object's own sentence: shoot the sheet. It has 240 health and no armour.
   *
   * (The cone is convex -- half-angle about 80 degrees, under a right angle --
   * so a sheet on the segment between the muzzle and an in-cone body is
   * itself in the cone and inside the reach. The guarantee needs that.)
   *
   * ---- THE BAND AND THE WAVE ---------------------------------------------
   *
   * The guide gives it band 6, and bands 6 and 7 do not exist (`perBand` 7
   * covers rungs 1-35 and the deeper rungs redraw 4 and 5), so it ships into
   * band 5 the way ANVIL's band-7 entry did. `threatOf` derives 8.00 from its
   * 240 health, and `veil x3 + lurcher x2` weighs 36.34 against band 5's own
   * mean of 36.44 -- **-0.29%**, which is build 315's lever used on purpose.
   *
   * LURCHER is the partner for CHAFF's reason. The sheet costs you the
   * ASSIST, so what has to be behind it is something that closes and GRIPS:
   * the thing filling the glitch fuse is walking onto the mount while the gun
   * is busy with a membrane. A wave of sheets alone is scenery with health.
   *
   * ---- THE COLOUR HAD ROOM, WHICH IS THE SECOND TIME -------------------
   *
   * The guide's `heavy` family hex is `#5d9cff`, which is BULWARK's body
   * colour and ANVIL's -- dE 0.0 against a type shipped two builds ago and
   * into the SAME band. Swept the blue band against all 116 tones in the
   * roster: `#1f6bff` is **22.0** off the nearest LOOSE body's tone
   * (LURCHER's and SCION's glow) and **36.6** off ANVIL's and BULWARK's body,
   * inside the 15-23 this repo documents as working. Its nearest tone
   * anywhere is DYNAMO's glow at 3.0, and that is a BOSS: an aperture clears
   * the loose field on the way in, so the two are never on the screen
   * together. The pure blues score better (`#0000ff` at 29.3) and are refused
   * for build 322's reason -- relative luminance 0.072 against this 0.180, and
   * a body reads almost entirely as its outline. A family is a region; ask
   * whether it has room before accepting a collision.
   */
  {
    id: 'veil',
    // No energy gate, like all sixteen: the BAND is the gate. See ANVIL.
    opens: 0,
    name: 'VEIL',
    shape: 'sheet',
    gait: 'spread',
    /*
     * ---- THE CAPABILITY, AND THE ONE THING IT NEEDS ----------------------
     *
     * `sheet` says this body OCCLUDES: `Game.autoTarget` refuses anything
     * whose ray from the machine crosses it. It is meaningless without `bar`,
     * because what occludes is the capsule -- a disc of r 52 would hide a
     * cone of the field rather than a membrane, and the picture would be the
     * fiction. check-build holds the pairing.
     *
     * And unlike `plated` (319), `rides` (322), `respawn` (324) and `planted`
     * (328), there is NO refusal of a second type declaring it, deliberately:
     * every one of those four has readers that consult a SHARED block, so a
     * second type inherited a design it never chose. A sheet's readers consult
     * the BODY -- its own `bar` block, its own `angle`, its own position -- so
     * a second membrane of another size is covered by existing. The guard goes
     * on the flag when the flag's readers look somewhere else.
     */
    sheet: true,
    /*
     * 104 across and twelve deep at r 52, as multiples of `r` -- the guide's
     * own figures. The proportions are the TYPE's from build 330; in
     * `CFG.cartwheel`, where they used to live, this membrane would have been
     * tested as a 166-unit spindle.
     */
    bar: { long: 1.0, thin: 0.115 },
    /*
     * A sheet hangs LEVEL, and from build 330 `upright` is what makes that
     * true of the hit profile as well as of the picture: it pins `angle` and
     * `av` every frame, so the capsule `barHalf` lays along that angle is the
     * membrane that is drawn. Before that the flag meant only "the drawing
     * ignores `angle`" while the constructor rolled a random one -- inert for
     * the three bodies that had it and the fifth-door fault (build 315) for
     * the first one whose shape read it.
     */
    upright: true,
    r: 52,
    hp: 240,
    /*
     * LIGHT for its size, which is the whole of "weak": mass is
     * `density * r * r`, so this is 946 against a BLOOM's 1143 and an ANVIL's
     * 10,662 -- the biggest body on the field and one of the easiest to shove.
     * A membrane that took a shove like a wall would be a second ANVIL.
     */
    density: 0.35,
    speed: 26,
    accel: 90,
    restitution: 0.25,
    // Some sway, but it is crossing to a chosen column rather than wandering.
    wobble: 0.4,
    armor: 0,
    color: '#1f6bff',
    glow: '#0a3fd8',
    /*
     * ---- NEVER GROUPED, AND THE MEASUREMENT IS WHY ----------------------
     *
     * `solo` is read in `Director.load` and nowhere else (build 313): a wave
     * entry at or above `formAt` becomes ONE formation job, and a formation
     * is a SHAPE queued in the mouth at one x with its slots pitched at
     * `r * 2 + 8`. For a body 104 units wide that pitch is 112, so a
     * formation of sheets is an edge-to-edge wall arriving as a lattice --
     * and the lane choice, which is the gait, never gets to happen.
     *
     * Measured either way at rung 32 on the era-2 field, 30 seconds: as a
     * formation, 30 sheets were made and **ten came loose**, with thirty
     * standing staged in the throat against a field cap of 57 -- a queue the
     * assist cannot shoot at all, because `legal` refuses `staged`. With
     * `solo`, all thirty came loose and all thirty chose a lane. SCION's own
     * `solo` note is the same shape from the other end: a formation put five
     * of it on the screen at once the first time it was measured.
     */
    solo: true,
    weight: 0, // authored into one wave, never rolled loose
    drops: 6,
  },
  {
    id: 'quarry',
    opens: 0,
    name: 'QUARRY',
    shape: 'quarry',
    gait: 'roll',
    r: 40,
    hp: 420,
    density: 1.1,
    speed: 30,
    accel: 100,
    restitution: 0.7,
    wobble: 1.2,
    armor: 0.22,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 0, // never chosen by the ordinary spawn roll -- it is authored
    drops: 8, // energy it leaves when it comes apart
    splits: { type: 'quarry', count: 3, scale: 0.6, floor: 20 },
  },
  {
    // Hardens everything near it while it lives, and shows you exactly what it
    // is doing: threads out to whatever it is covering, and a shell on each of
    // them. Shoot the beacon, not the escort.
    id: 'herald',
    opens: kB(1400),
    name: 'HERALD',
    gait: 'march',
    shape: 'herald',
    r: 19,
    hp: 99,
    density: 0.8,
    speed: 44,
    accel: 150,
    restitution: 0.62,
    wobble: 1.2,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 9,
    drops: 4, // energy it leaves when it comes apart
    ward: { radius: 240, reduction: 0.62, max: 5 },
  },
  {
    // Eats the mess. Every fragment it touches makes it bigger, heavier and
    // harder, so a littered field is its food supply — kill it early or clear
    // the floor. It is the only object whose threat you control.
    id: 'glut',
    opens: kB(1100),
    name: 'GLUT',
    gait: 'march',
    shape: 'glut',
    r: 16,
    hp: 117,
    density: 1.1,
    speed: 30,
    accel: 105,
    restitution: 0.44,
    wobble: 1.6,
    color: '#ffd166',
    glow: '#e07a00',
    weight: 9,
    drops: 6, // energy it leaves when it comes apart
    eat: { reach: 26, growth: 3.1, hpPer: 26, maxR: 52 },
  },
  {
    // A head towing a heavy mass on a cable. The pair swings across the field
    // and shoves everything it catches; both halves are real bodies and both
    // count, so a TOW is two of the five hundred.
    id: 'tow',
    opens: kB(3400),
    name: 'TOW',
    /*
     * ---- DRAG, re-keyed off `type.hurl` in build 339 --------------------
     *
     * This is phase 2's second word and it went in the same way `lurch` did:
     * the mechanism was keyed on a FIELD only this type carried, so the word
     * and the behaviour could get out of step. Build 338 gave this body
     * `march` and wrote a note saying the declaration was INCOMPLETE rather
     * than false -- true of this body's own path, and silent about the fact
     * that `steer` calls `windUp` for it every frame and that what it drives
     * is a SECOND body. `drag` says both.
     *
     * A MODIFIER, not a replacer: `steer` is `drive` then `windUp`, so the
     * route branch still runs and this body arrives by its own arc like
     * anything else -- the same shape as `lurch`, `paired` and `cartwheel`.
     *
     * `type.hurl` STAYS, as the BLOCK it always was (range, wind, speed,
     * holdWind, partial, clear, shock, shockFor), read for its values at
     * three sites. Only the two FLAG-USES moved -- `steer`'s decision to wind
     * and the death path's decision to let go -- which is the shape
     * `rides`/`respawn`/`bond`/`lob` already have: a gait word that says
     * WHAT this body does, and a block that says with what numbers.
     *
     * The word is the HEAD's, and docs/objects.html uses it both ways (its
     * own table gives TOW `standoff . drag` and MASS `drag -> tumble`). The
     * roster's convention settles it: `ride` is on the RIDER and not the
     * host, `chain` on the beads and not on what they follow. `drag` is on
     * the body that does the dragging. Giving it to the MASS would be worse
     * than imprecise -- both flag-uses are `gait === 'drag' && this.tether`
     * and a MASS has a tether, so it would start calling `windUp`, which is
     * the head's method and reads the head's block.
     */
    gait: 'drag',
    shape: 'tow',
    r: 18,
    hp: 135,
    density: 0.8,
    speed: 52,
    accel: 175,
    restitution: 0.6,
    wobble: 1.1,
    // Lime, and the mass on its cable is a paler one: a hauled load reads as
    // hazard, and lime is the one hue nothing else on the field uses. It was
    // #9fb3c8 -- DRIFT's grey, on a body that drags a wrecking ball into you.
    color: '#c9e84a',
    glow: '#8fb100',
    weight: 5,
    drops: 5, // energy it leaves when it comes apart
    tows: { type: 'towMass', length: 132 },
    /*
     * ...and it does not carry it all the way in. Inside `range` the TOW winds
     * the load up for `wind` seconds -- the cable shortens and the mass comes
     * round harder every turn -- and then lets go of it.
     *
     * A thrown MASS is 280hp of armoured lump crossing the field at 620, which
     * is faster than anything else on it. It costs nothing to dodge and a lot
     * to eat: on the turret it lands as a `shock`, a spike of corruption in
     * its own right that decays over `shockFor`, on top of the grip it then
     * has on you like anything else that arrives.
     *
     * The head keeps coming, lighter and unencumbered, which is the second
     * half of the beat.
     *
     * ---- why `range` is 640 and `wind` is 0.78 (build 222) ----
     *
     * Because two TOWs in five never threw anything at all. Measured at tier 9
     * against a bought damage line, five pairs, from the distance the director
     * actually releases them at: a pair arrives 1065-1147 units out and took
     * 18.7 to 27.0 SECONDS to close to the old 430 -- most of a minute of
     * approach, under fire, on a head with 135 health. One head died at 7.2s
     * having never begun to wind. Another began at 27.0s, reached 0.97 of its
     * 1.15, and was knocked back out of range.
     *
     * `range` 640 starts the wind six to eight seconds earlier in that
     * approach, and `wind` 0.78 is a third off the hold. Both are the same
     * fix as `holdWind` below and as the death-throw in `Enemy.destroy`: the
     * type's whole picture is the load coming off the cable, and a TOW that is
     * shot down first is a body with an ability nobody has seen.
     */
    hurl: {
      range: 640,
      wind: 0.78,
      speed: 620,
      /*
       * What is left of the wind when the head is shoved back out of range.
       *
       * It used to be nothing -- `this.wind = 0`, a hard reset -- so a single
       * knockback at 0.9 of the way through cost the whole hold, and gunfire
       * shoves the head backwards continuously. That is the run above that
       * wound for four seconds across two attempts and threw nothing. It
       * bleeds off at this rate a second instead, so leaving range costs
       * ground rather than the attempt.
       */
      holdWind: 0.5,
      /*
       * The load comes off the cable whether or not the head lives to let go.
       *
       * `partial` is the least of the throw a head gets for dying with the
       * cable still on: a wind at 0 throws at 0.58 of `speed`, a full one at
       * 1.0, linearly between. So killing the head early is still worth doing
       * -- it buys a slower MASS, and slower is the difference between one you
       * cannot answer and one you can -- but it no longer erases the load.
       */
      partial: 0.58,
      // What the release shoves out of its own way, so a TOW that let go
      // inside a crowd throws a wrecking ball rather than a stuck one. See
      // `clearWay` in enemies.js.
      clear: { r: 108, impulse: 900 },
      shock: 0.62,
      shockFor: 1.8,
    },
  },
  {
    // The mass on the end of a TOW's cable. Never rolled for on its own.
    id: 'towMass',
    opens: 0,
    name: 'MASS',
    /*
     * MARCH -- and it is the WEAKEST declaration on the roster, so what it
     * leaves out is written down rather than left to be rediscovered. Phase
     * 2's `drag` is the truthful word and it is not a one-liner here: unlike
     * LURCHER, which had a `lurch: true` field to re-key, this body has no
     * motion field of its own, because it is the OBJECT of the TOW's
     * mechanism rather than the owner of one. FOUR things author its position
     * above its own steering:
     *
     *   Its own march delivers `speed * k / (k + damping)` = 26 x 0.6 / 1.15
     *   = 13.6 u/s, against the head's 39.6 -- so the cable drags it at 2.9
     *   times its own walking pace and the march is almost never what is
     *   moving it.
     *
     *   `solveTethers` writes its POSITION and its velocity every frame
     *   (`e.x += dx * push * (e.invMass / inv)`), the cable being a hard
     *   constraint at `tows.length` 132.
     *
     *   Inside `hurl.range` the head's `windUp` drives it sideways at 900
     *   u/s^2 directly, which is authorship and not steering.
     *
     *   And after `release` it is set to `hurl.speed` 620 with `thrown` 2.2,
     *   which is `drive`'s SECOND early return -- so for those 2.2 seconds
     *   the gait is not consulted at all.
     */
    gait: 'march',
    shape: 'mass',
    r: 27,
    hp: 280,
    density: 2.4,
    speed: 26,
    accel: 60,
    restitution: 0.36,
    wobble: 0.5,
    armor: 0.2,
    color: '#e2f28a',
    glow: '#a8c22e',
    weight: 0,
    drops: 8, // energy it leaves when it comes apart
    debris: 12, // inert wreckage thrown when it breaks up
  },
  /*
   * ---- ORDINAL's three ----
   *
   * None of these is ever rolled for, released by a wave or counted against
   * the five hundred: they arrive through the APERTURE and leave with it.
   * Magenta, which nothing else on the field uses -- when the sky goes over
   * to the boss substrate the only things in that hue are the boss and what
   * came with it.
   */
  {
    // One segment of a frame. Solid: a round stops in it, which is what makes
    // a hole a hole.
    id: 'tally',
    opens: 0,
    name: 'TALLY',
    shape: 'tally',
    r: 15,
    /*
     * 135 in Phase B, 165 after the Phase C audit.
     *
     * ORDINAL came out of Phase B at 224s against the other five's 238-253,
     * and it is the one fight with nowhere else for length to come from. Every
     * re-form it has is already at maximum -- TALLY puts all forty panels back
     * at full health, CONVERGENCE rebuilds both frames whole -- and a stage
     * boundary only re-partitions health the boss already had. The audit was
     * supposed to move thresholds and nothing else; on this boss there was no
     * threshold left to move, so the rule bent rather than the measurement.
     *
     * Raising the panel rather than the core because the frame is the fight:
     * the core is only reachable through a hole in it, so health added here is
     * health added to the thing the player is actually working on, and health
     * added to the core would only have lengthened the last stage.
     */
    hp: 165,
    fixed: true, // the boss places it; physics never moves it
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.15,
    wobble: 0,
    armor: 0.12,
    color: '#ff8ae0',
    glow: '#ff3fc0',
    weight: 0,
    drops: 2,
    debris: 5,
  },
  {
    // The core. It does not move, it does not steer, and it cannot be reached
    // except through the frames.
    id: 'ordinal',
    opens: 0,
    name: 'ORDINAL',
    shape: 'ordinal',
    r: 40,
    hp: 1900,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.2,
    color: '#ff5ec8',
    glow: '#ff1f9e',
    weight: 0,
    drops: 26,
    debris: 22,
  },
  {
    // The garrison. A sovereign object: once it is out it wants what every
    // other object wants, and nothing about the frame governs it any more.
    id: 'digit',
    opens: 0,
    name: 'DIGIT',
    gait: 'march',
    shape: 'digit',
    r: 11,
    hp: 82,
    density: 0.85,
    speed: 92,
    accel: 230,
    restitution: 0.72,
    wobble: 1.8,
    color: '#ffa8e8',
    glow: '#ff5fd0',
    weight: 0,
    drops: 3,
  },
  /*
   * ---- GNOMON's three ----
   *
   * Amber, and the whole cast is: a boss's colour is its identity, and every
   * body that comes through its way in wears it.
   */
  {
    // One arc of the dial. Solid, like a TALLY: a round stops in it, which is
    // what makes a hole a hole. Sized in CFG.gnomon so the arcs of the ring
    // meet -- a dial with gaps in it is not a dial.
    id: 'dial',
    opens: 0,
    name: 'DIAL',
    shape: 'dial',
    r: 30,
    hp: 150,
    fixed: true,
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.15,
    wobble: 0,
    armor: 0.12,
    color: '#ffb066',
    glow: '#ff8a3d',
    weight: 0,
    drops: 2,
    debris: 5,
  },
  {
    // The disc at the middle of the dial, and the thing the needle turns on.
    // It does not move until the last quarter, when it comes down.
    id: 'gnomon',
    opens: 0,
    name: 'GNOMON',
    shape: 'gnomon',
    r: 40,
    // Lower than ORDINAL's 1900 despite being the later fight, because the
    // shadow already takes a third of the turret's output off the table:
    // measured, the core absorbed under 6 damage a second through stage III.
    hp: 1500,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.2,
    color: '#ff8a3d',
    glow: '#ff6a1a',
    weight: 0,
    drops: 26,
    debris: 22,
  },
  {
    // A second, in the hours sense. Parked behind an arc until that arc is
    // gone, and a sovereign object from the moment it is out.
    id: 'second',
    opens: 0,
    name: 'SECOND',
    gait: 'march',
    shape: 'second',
    r: 10,
    hp: 76,
    density: 0.8,
    speed: 104,
    accel: 250,
    restitution: 0.72,
    wobble: 1.8,
    color: '#ffc98a',
    glow: '#ffa04d',
    weight: 0,
    drops: 3,
  },
  /*
   * ---- FRACTAL's three ----
   *
   * Acid green, and the same body three times at three sizes: that is the
   * whole idea of it, so the cast is one shape scaled rather than three
   * designs.
   */
  {
    // The smallest generation. Not solid -- it steers, it wants what every
    // other object wants -- but while it is in orbit it is in the way.
    id: 'mite',
    opens: 0,
    name: 'MITE',
    gait: 'march',
    shape: 'mite',
    r: 13,
    hp: 100,
    density: 0.8,
    speed: 108,
    accel: 250,
    restitution: 0.72,
    wobble: 1.9,
    color: '#b6ff8f',
    glow: '#8bff4d',
    weight: 0,
    drops: 2,
  },
  {
    // The middle generation, and the one the fight is really about: break it
    // and the three it was carrying stop being armour and start being loose.
    id: 'fraction',
    opens: 0,
    name: 'FRACTION',
    shape: 'fraction',
    r: 30,
    hp: 540,
    fixed: true, // the boss places it; it orbits rather than steers
    density: 5,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.1,
    color: '#8bff4d',
    glow: '#6ee02a',
    weight: 0,
    drops: 6,
    debris: 8,
  },
  {
    // The whole of it. In the last stages there are three of these and they
    // are each a third of the size, which is the point being made.
    id: 'fractal',
    opens: 0,
    name: 'FRACTAL',
    // The bulk of the fight. Three generations of shield sit between this
    // and the turret, but auto aim takes what is *nearest* rather than what
    // is outermost -- so a core at standoff is a legitimate target half the
    // time, and measured, it absorbed 52% of everything at 1450.
    shape: 'fractal',
    r: 64,
    hp: 7400,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.18,
    color: '#8bff4d',
    glow: '#5ce015',
    weight: 0,
    drops: 24,
    debris: 20,
  },
  /*
   * ---- AMPLITUDE's three ----
   *
   * Teal. The first boss whose body is laid out in *time* rather than around
   * a centre: the segments are a waveform, and where one is depends on when
   * you look.
   */
  {
    // One segment of the wave. Solid, like every other boss's structure --
    // and unlike every other boss's structure, it is somewhere different
    // every second without ever having moved of its own accord.
    id: 'crest',
    opens: 0,
    name: 'CREST',
    shape: 'crest',
    r: 16,
    hp: 300,
    fixed: true,
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.15,
    wobble: 0,
    armor: 0.1,
    color: '#5cf0d0',
    glow: '#2ee6c0',
    weight: 0,
    drops: 2,
    debris: 4,
  },
  {
    // The head. It rides its own wave, so the fight's one fixed installation
    // is not fixed at all -- it is periodic.
    id: 'amplitude',
    opens: 0,
    name: 'AMPLITUDE',
    shape: 'amplitude',
    r: 34,
    hp: 3400,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.18,
    color: '#2ee6c0',
    glow: '#12d4a8',
    weight: 0,
    drops: 24,
    debris: 20,
  },
  {
    // Thrown off the top of the wave. Sovereign from the moment it leaves.
    id: 'droplet',
    opens: 0,
    name: 'DROPLET',
    gait: 'march',
    shape: 'droplet',
    r: 10,
    hp: 88,
    density: 0.8,
    speed: 112,
    accel: 260,
    restitution: 0.78,
    wobble: 2.0,
    color: '#8ff5e0',
    glow: '#41ecc4',
    weight: 0,
    drops: 3,
  },
  /*
   * ---- DYNAMO's three ----
   *
   * Electric blue -- and deliberately not the cyan the interface is drawn in;
   * see the note on the gauge ramp in anomaly.js for how nearly that went
   * wrong.
   */
  {
    // A leg of the circuit. Solid, and while it stands it is carrying part of
    // what keeps the core armoured.
    id: 'pylon',
    opens: 0,
    name: 'PYLON',
    shape: 'pylon',
    r: 24,
    /*
     * Cheaper than it looks like it should be, on purpose. A pylon is a gate
     * rather than a wall: the fight's shape is I, II, III as the circuit
     * comes apart, and at 900 the second one took a hundred and twelve
     * seconds to fall -- by which time the core was already low enough for
     * stage IV, so stage III lasted a single frame. The legs have to come
     * down faster than the thing standing on them.
     *
     * Raised again once the core became unreachable inside the circuit: with
     * the pylons the only target there is, everything the turret produces
     * goes into them, and at 700 the whole circuit fell in twenty seconds.
     */
    hp: 1700,
    fixed: true,
    density: 7,
    speed: 0,
    accel: 0,
    restitution: 0.15,
    wobble: 0,
    armor: 0.12,
    color: '#7fb0ff',
    glow: '#4d8dff',
    weight: 0,
    drops: 8,
    debris: 10,
  },
  {
    /*
     * The core. It does not sit anywhere: it is *at* a pylon, and every few
     * seconds it is at a different one.
     *
     * `armor` here is only its floor, with nothing left standing. The boss
     * raises it while the circuit is closed -- see Dynamo.shield().
     */
    id: 'dynamo',
    opens: 0,
    name: 'DYNAMO',
    shape: 'dynamo',
    r: 36,
    hp: 4200,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.15,
    color: '#4d8dff',
    glow: '#2f6fff',
    weight: 0,
    drops: 24,
    debris: 20,
  },
  {
    // Rides the arc between two pylons and drops off it onto the field. The
    // circuit is visibly inhabited, which is the whole of why it is here.
    id: 'ion',
    opens: 0,
    name: 'ION',
    gait: 'march',
    shape: 'ion',
    r: 10,
    hp: 92,
    density: 0.8,
    speed: 118,
    accel: 270,
    restitution: 0.8,
    wobble: 2.1,
    color: '#a8c8ff',
    glow: '#61a0ff',
    weight: 0,
    drops: 3,
  },
  /*
   * ---- PARITY's three ----
   *
   * Violet, and everything comes in twos.
   */
  {
    // One mirror pane off a crescent's edge. It has a twin on the other half
    // and they break together -- see CFG.parity.
    id: 'pane',
    opens: 0,
    name: 'PANE',
    shape: 'pane',
    r: 17,
    hp: 330,
    fixed: true,
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.18,
    wobble: 0,
    armor: 0.1,
    color: '#c396ff',
    glow: '#a86bff',
    weight: 0,
    drops: 3,
    debris: 5,
  },
  {
    /*
     * A half. There are two, they share one bar, and only one of them is
     * real at a time -- the other is a wireframe standing where it would be.
     */
    id: 'parity',
    opens: 0,
    name: 'PARITY',
    shape: 'parity',
    r: 38,
    hp: 7600,
    fixed: true,
    density: 9,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.16,
    color: '#a86bff',
    glow: '#8b45ff',
    weight: 0,
    drops: 24,
    debris: 20,
  },
  {
    // Always two of these, mirrored across the line. Never one.
    id: 'echo',
    opens: 0,
    name: 'ECHO',
    gait: 'march',
    shape: 'echo',
    r: 11,
    hp: 90,
    density: 0.8,
    speed: 110,
    accel: 258,
    restitution: 0.76,
    wobble: 2.0,
    color: '#d3b3ff',
    glow: '#b581ff',
    weight: 0,
    drops: 3,
  },
  /*
   * ---- TERMINUS's three ----
   *
   * Crimson, and all three of them are about a line you are inside of.
   */
  {
    /*
     * One segment of the boundary. Thirty-two of these close a ring around
     * the turret; the fight is how many are left.
     *
     * r 30 is a floor rather than a taste: it is what closes a circle of
     * radius 250 with 32 bodies on it, and check-build holds it.
     */
    id: 'bound',
    opens: 0,
    name: 'BOUND',
    shape: 'bound',
    r: 30,
    hp: 260,
    fixed: true,
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.16,
    wobble: 0,
    armor: 0.08,
    color: '#ff8095',
    glow: '#ff4d6d',
    weight: 0,
    drops: 3,
    debris: 5,
  },
  {
    // The ninth. It tiles the ground between you and it, and a tile is ground
    // your rounds do not cross until you have taken it off.
    id: 'tessera',
    opens: 0,
    name: 'TESSERA',
    shape: 'tessera',
    r: 38,
    /*
     * 7800 until build 277, which is PARITY's 7600 -- and it was the wrong
     * comparison, because those seven put their health in structure that is
     * ON THE WAY to the core, so shooting it is progress. This one's slab is
     * a TAX: it stands in front of the core, it grows back, and every round
     * spent on it is a round the core never sees. Measured at stock, the
     * player splits 58 damage a second about 22/36 between core and ground,
     * so a core of 7800 is a 340-second fight -- outside the family's 219-278
     * and long enough for a single stage to brush the 150-second patience
     * clock and withdraw a boss that was being beaten.
     */
    hp: 5600,
    fixed: true,
    density: 10,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.2,
    /*
     * Deep violet-red, and dark for the reason AXIOM's gold is dark: the
     * anomalies past the change are a register of their own. Chroma 0.62.
     */
    color: '#8c2f5a',
    glow: '#5c1236',
    weight: 0,
    drops: 32,
    debris: 24,
  },
  {
    // A TILE. It does not chase and it does not hit you; it simply is where
    // you wanted to shoot.
    id: 'tile',
    opens: 0,
    name: 'TILE',
    shape: 'tile',
    r: 26,
    hp: 300,
    fixed: true,
    density: 6,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.06,
    color: '#c2477f',
    glow: '#8c2f5a',
    weight: 0,
    drops: 3,
    debris: 6,
  },
  {
    // A SHARD off a tile that has been taken: the only thing here that comes
    // at you, and it is what makes cutting the corridor cost something.
    id: 'shard',
    opens: 0,
    name: 'SHARD',
    gait: 'march',
    shape: 'shard',
    r: 10,
    hp: 78,
    density: 0.8,
    speed: 104,
    accel: 240,
    restitution: 0.75,
    wobble: 0.5,
    color: '#ff7ab0',
    glow: '#c2477f',
    weight: 0,
    drops: 2,
    debris: 3,
  },
  {
    // The eighth. It states a rule and holds you to it: while a CLAUSE stands
    // the button it names will not fire, and the core cannot be touched.
    id: 'axiom',
    opens: 0,
    name: 'AXIOM',
    shape: 'axiom',
    r: 40,
    hp: 7400,
    fixed: true,
    density: 10,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.18,
    /*
     * A DEEP gold, and the register is the point. The seven are all bright --
     * the tree paints them in a row and they read as one family -- and the hue
     * wheel is full at seven: the widest gap left is 43 degrees, which is not
     * enough to tell two bright colours apart at a glance. So the anomalies
     * past the change are dark where the others are light. Chroma 0.79, well
     * clear of the 0.28 the colour rule asks for.
     */
    color: '#d9b310',
    glow: '#9c7d05',
    weight: 0,
    drops: 30,
    debris: 24,
  },
  {
    // A CLAUSE: it holds one of your buttons shut and does nothing else.
    // Killing it is the only way to get that button back.
    id: 'clause',
    opens: 0,
    name: 'CLAUSE',
    shape: 'clause',
    r: 22,
    hp: 640,
    fixed: true,
    density: 5,
    speed: 0,
    accel: 0,
    restitution: 0.3,
    wobble: 0,
    armor: 0.1,
    color: '#f2cf3a',
    glow: '#c9a412',
    weight: 0,
    drops: 6,
    debris: 8,
  },
  {
    // A LEMMA: what a clause sends out to keep you off it.
    id: 'lemma',
    opens: 0,
    name: 'LEMMA',
    gait: 'march',
    shape: 'lemma',
    r: 11,
    hp: 96,
    density: 0.9,
    speed: 92,
    accel: 210,
    restitution: 0.7,
    wobble: 0.4,
    color: '#ffe98a',
    glow: '#d9b310',
    weight: 0,
    drops: 2,
    debris: 4,
  },
  {
    /*
     * The edge itself. It rides its own ring rather than sitting at the
     * middle of it, and it is only ever near you while it is mending.
     */
    id: 'terminus',
    opens: 0,
    name: 'TERMINUS',
    shape: 'terminus',
    r: 40,
    hp: 8000,
    fixed: true,
    density: 10,
    speed: 0,
    accel: 0,
    restitution: 0.2,
    wobble: 0,
    armor: 0.16,
    color: '#ff4d6d',
    glow: '#e01f45',
    weight: 0,
    drops: 28,
    debris: 22,
  },
  {
    // A LIMIT: it walks the frame's lines inward and does not stop.
    id: 'limit',
    opens: 0,
    name: 'LIMIT',
    gait: 'march',
    shape: 'limit',
    r: 12,
    hp: 105,
    density: 0.85,
    speed: 96,
    accel: 240,
    restitution: 0.7,
    wobble: 1.6,
    color: '#ffa8b6',
    glow: '#ff5f7d',
    weight: 0,
    drops: 3,
  },
  {
    id: 'prism',
    opens: kB(900),
    name: 'PRISM',
    gait: 'march',
    shape: 'prism',
    r: 20,
    hp: 88,
    density: 0.9,
    speed: 50,
    accel: 170,
    restitution: 0.96,
    wobble: 2.2,
    color: '#e0aaff',
    glow: '#c77dff',
    weight: 6,
    drops: 4, // energy it leaves when it comes apart
    /*
     * Glancing bolts bounce off instead of landing: a round lands only if the
     * cosine of its angle of incidence is above this, which is
     * |b| <= 0.6 * (e.r + p.r) -- the HIT aperture, not the body's own
     * radius, so the window widens with the round: 0.73r for a BOLT. Three
     * fifths of the aperture, and a bit under three quarters of the body's
     * visible width. (It used to say "0.6r ... a bit over a third of its
     * area": the radius is the wrong one, and an area fraction is not what a
     * one-dimensional impact parameter measures.)
     *
     * 0.8 from build 211, and the number moved because the TEST moved. What it
     * used to be compared against was not an incidence at all: `(hit - centre)`
     * divided by the RADIUS rather than by its own length, which reduces to
     * how far along its last step the round happened to stop. Measured on the
     * build before, firing real rounds from the turret at a pinned PRISM, 40
     * rounds at each offset: 0 of 40 landed dead centre, 5 of 40 at 0.2r, and
     * 0 of 40 at every offset beyond that. A PRISM was very nearly immune to
     * the gun from any angle, which is not what this line has ever said.
     *
     * With real geometry and the old 0.55 the same probe landed 40 of 40 from
     * dead centre out to 0.6r -- correct, and a very large swing for a body
     * that had been effectively bullet-proof. 0.8 is chosen rather than
     * inherited: it keeps PRISM a body you have to hit squarely, which is the
     * whole of its identity, without keeping it a body you cannot hit at all.
     */
    reflect: 0.8,
  },
];

/**
 * The largest a body can ever be: the biggest type in the table, carrying a
 * full stack of SCION balls.
 *
 * The physics broadphase buckets a body by its centre cell and then looks only
 * at the eight neighbours, which is exact only while a cell is at least twice
 * this — any two overlapping bodies are then at most one cell apart. Before
 * build 92 the biggest thing on the field was a BULWARK at 45 and the cell was
 * 96, which held with six units to spare. Grafts made a BULWARK 72, and two of
 * those overlap at 143 apart, which is two cells: the broadphase stopped
 * seeing the contact at all. `scripts/check-build.mjs` now asserts the cell
 * covers this, so growing an object cannot quietly break it again.
 */
/**
 * The most any ONE ball can grow the body it rides, over every type that can
 * arrive as one.
 *
 * Derived rather than written down, because `grow` moved off `CFG.graft` and
 * onto the rider's own `rides` block in build 322: SEED grows its host by a
 * fifth of its radius per ball and LATCH grows it by nothing, so a single
 * constant here would have to be one of the two and would be wrong for the
 * other the moment a third rider arrives. Asking the roster means a new
 * rider is covered by existing -- the same rule the boss sweeps follow by
 * asking `ANOMALIES.length` instead of counting to seven.
 *
 * Max and not sum: `CFG.graft.stack` balls of the SAME kind is the worst
 * case for one host, because `refreshGrafts` adds each ball's own share and
 * the biggest share repeated is the largest total a full ring can reach.
 */
export const MAX_GRAFT_GROW = Math.max(
  0,
  ...ENEMY_TYPES.filter((t) => t.rides).map((t) => t.rides.grow),
);

export const MAX_BODY_R = Math.max(
  /*
   * The graft allowance is only for bodies that can actually carry one.
   *
   * A `fixed` type is placed by a boss every frame and SCION's hunt refuses
   * it outright -- see the `e.type.fixed` guard in enemies.js -- so a boss
   * core was inflating the broadphase cell by sixty percent for a stack of
   * grafts it can never be given. FRACTAL's core is r 64 and, multiplied,
   * took MAX_BODY_R from 72 to 102 and the cell from 144 to 205: a coarser
   * grid, more pairs tested per body, for every object in the game, on a
   * phone. It also silently changed every fight that was already tuned,
   * which is how it was caught.
   *
   * Those two figures are the state of the table when this was written, and
   * they have since moved by exactly the mechanism they warn about: ANVIL's
   * r 56 counts at 89.6 and took the cell to 180 at build 328, silently
   * again, which is why check-build now PINS the cell rather than printing
   * it. Read 72/144 as history; the live numbers are in `check-build.mjs`
   * beside the pin, with the hash delta and the timing it cost.
   *
   * A fixed body still has to fit the guarantee, so it counts at its own
   * size -- the cell must be at least twice the largest thing on the field
   * whether or not that thing can grow.
   */
  ...ENEMY_TYPES.map((t) => (t.fixed ? t.r : t.r * (1 + MAX_GRAFT_GROW * CFG.graft.stack))),
);

/**
 * The broadphase cell, derived rather than chosen — see MAX_BODY_R above. It
 * lives here rather than in game.js so scripts/check-build.mjs can read the
 * real value instead of parsing it out of a file it cannot import.
 */
export const GRID_CELL = Math.max(96, Math.ceil(2 * MAX_BODY_R));

/*
 * The waves.
 *
 * `teach: true` marks the opening set. Those run first, in exactly this order,
 * exactly once — they are the tutorial, and they are hand-paced. Everything
 * else is shuffled, because past the opening the order genuinely does not
 * matter: each wave is a self-contained problem and meeting them in a
 * different sequence every run is the variety.
 *
 * A regular wave is eligible only once every type in it has unlocked, so the
 * reveal ladder built in build 63 still holds — the pool the shuffle draws
 * from simply grows as the run goes on. When the rotation is exhausted the
 * tutorial waves are dropped, the (now larger) pool is reshuffled, and it
 * begins again.
 *
 * Counts are what the wave *asks* for. The five-hundred allotment and the
 * field cap can both cut a wave short; neither is allowed to make one hang.
 */
export const WAVES = [
  // ---- the opening. Grey drift and almost nothing else, to begin with. ----
  // Grey and nothing else, and held there: the two opening lines about DRIFT
  // are read against a field with no enemies on it, which is the whole of what
  // makes "not an enemy" land. Without the dwell this wave ends the instant it
  // starts — it has no hostiles to clear — and the MOTEs arrive mid-sentence.
  { teach: true, of: [], drift: 4, dwell: 16 },
  { teach: true, of: [['mote', 2]], drift: 2 },
  { teach: true, of: [['needle', 2]], drift: 2 },
  { teach: true, of: [['mote', 3], ['needle', 1]], drift: 1 },
  { teach: true, of: [['lurcher', 1], ['mote', 2]], drift: 2 },
  { teach: true, of: [['needle', 3], ['mote', 3]], drift: 1 },
  { teach: true, of: [['lurcher', 2], ['needle', 3]], drift: 1 },
  { teach: true, of: [['splitter', 1], ['mote', 4], ['needle', 2]], drift: 2 },

  /*
   * ---- and then the rest, in whatever order they come out ----
   *
   * Every one of these names two or three types, never one. A wave of six
   * MOTEs is a quantity; six MOTEs with two NEEDLEs threading them is a
   * problem, because the two want different things from you at the same time
   * and neither on its own is hard. That is the whole brief: a light challenge
   * out of the combination, not out of the count. Totals stay at six to eight
   * bodies before the swell, which is what keeps a combination from becoming
   * a crowd.
   *
   * A wave is eligible only once *every* type in it has unlocked, so a
   * combination is gated by its latest member. That is why the first three are
   * MOTE and NEEDLE in different proportions -- before kill 18 there is
   * nothing else to combine them with.
   */
  /*
   * EMBER and HUSK ride along in `of` rather than in a channel of their own,
   * because a wave names what arrives on it. They are harmless, so they
   * weigh nothing in the budget, do not swell with it, and are not part of
   * the COMBINATION the two-or-three rule is about -- all three of which
   * check-build.mjs states directly. Four existing waves, so no band's
   * budget moves: the mean threat of a band's roster is what prices it, and
   * adding a body worth zero to a wave already in the roster changes neither
   * the roster nor the mean.
   */
  { of: [['mote', 5], ['needle', 3], ['ember', 4]], band: 1 },
  { of: [['needle', 5], ['mote', 3], ['ember', 5]], band: 1 },
  { of: [['mote', 4], ['needle', 4], ['filament', 1]], band: 1 },
  /*
   * ...and the SHOAL wave, which is the first thing in the game that cannot
   * be answered a body at a time. Paired with NEEDLEs rather than MOTEs on
   * purpose: MOTE wears the same cyan at dE 0.0 (see the type), and the
   * school should read as one thing the first time it is met rather than as
   * an unusual number of motes. A wave of one school plus three needles is
   * two hostile types, five PROBLEMS against the eleven-body ceiling, and
   * seventeen bodies -- which is the ruling check-build.mjs states.
   */
  { of: [['shoal', 1], ['needle', 3]], band: 1 },
  { of: [['lurcher', 3], ['needle', 3], ['husk', 1]], band: 2 },
  { of: [['lurcher', 2], ['mote', 4], ['husk', 1]], band: 2 },
  // ...and a BELL among the first bodies worth aiming past.
  { of: [['splitter', 2], ['needle', 4], ['bell', 1]], band: 2 },
  { of: [['splitter', 2], ['lurcher', 1], ['mote', 3]], band: 2 },
  { of: [['bloom', 2], ['mote', 4]], band: 3 },
  { of: [['bloom', 3], ['lurcher', 2]], band: 3 },
  // A beacon and the escort it exists to cover: the pairing the type was
  // designed around, and the one that teaches "kill the beacon".
  { of: [['herald', 1], ['lurcher', 3]], band: 4 },
  { of: [['herald', 2], ['splitter', 2]], band: 4 },
  { of: [['prism', 3], ['needle', 3]], band: 3 },
  { of: [['prism', 2], ['bloom', 2]], band: 3 },
  { of: [['warden', 2], ['mote', 3], ['lantern', 1]], band: 4 },
  { of: [['warden', 1], ['prism', 2], ['needle', 3]], band: 4 },
  { of: [['scion', 1], ['bloom', 2], ['lantern', 1]], band: 4 },
  { of: [['scion', 2], ['lurcher', 2]], band: 4 },
  // Seeds and something worth landing on. A WARDEN already carries plating;
  // a grafted one is the clearest read there is on what a SEED does.
  { of: [['scion', 1], ['warden', 2], ['needle', 3]], band: 4 },
  { of: [['quarry', 1], ['needle', 2]], band: 4 },
  { of: [['bulwark', 1], ['needle', 4]], band: 5 },
  { of: [['bulwark', 2], ['herald', 1]], band: 5 },
  { of: [['glut', 3], ['mote', 4]], band: 3 },
  { of: [['glut', 2], ['splitter', 2]], band: 3 },
  /*
   * ...and the SPINDLE wave, three of them against three MOTEs. The pairing
   * is what makes the object a decision: a MOTE is worth picking off one at a
   * time, so a player who waits for a broadside is choosing to let the small
   * stuff close. Weighed at 21.1 against band 3's own mean of 20.93, so this
   * wave re-prices the band by 0.1% -- a wave authored AT its band's mean
   * adds a problem without making every other wave in the band longer.
   */
  { of: [['spindle', 3], ['mote', 3]], band: 3 },
  /*
   * A TOW is two bodies -- the head and the MASS on its cable -- so these are
   * heavier than they read, and `check-build.mjs` counts them as two when it
   * measures a wave against the eleven-body ceiling.
   *
   * There were three of these and now there are seven, which is band 5's
   * largest single presence. The reason is not that the type was rare in the
   * table -- three of twenty-five is an ordinary share -- but that it was rare
   * on the FIELD: two pairs in five threw nothing at all before build 222 (see
   * tow.hurl), so half of what did arrive was a lime head with a lump behind
   * it and no beat. With the load coming off the cable reliably, the type has
   * a picture worth meeting, and one pair a wave is not enough of the band to
   * teach it.
   *
   * The old note said "never more than one pair alongside anything else". That
   * held while a MASS was a coin flip; three pairs is the point of the last two
   * here, and eleven bodies is still the ceiling.
   */
  { of: [['tow', 2], ['needle', 3]], band: 5 },
  /*
   * MIRE's wave. The BULWARK is the combination rather than ballast: 676
   * health behind 0.4 of armour is about fifteen seconds of barrel, so it
   * cannot be rushed -- and while those seconds run the two MIREs are laying
   * ground, and the BULWARK's own salvage falls wherever it happened to die.
   * That is the object's whole lesson made unavoidable: you do not get to
   * choose WHEN it dies, so you have to choose WHERE. The MOTEs make the
   * denial legible on the first pass, being small drops eaten at once.
   *
   * Weighs 35.27 against band 5's own mean of 36.30 -- a ratio of 0.971, so
   * it sits inside build 315's +-10% lever and re-prices the band by about
   * three tenths of a per cent. Priced by measuring the alternatives: two
   * MIREs and three SPLITTERs is 26.57 (0.73, outside), three and three MOTEs
   * 19.10 (0.53).
   */
  { of: [['mire', 2], ['bulwark', 1], ['mote', 2]], band: 5 },
  { of: [['tow', 1], ['bulwark', 1], ['mote', 4]], band: 5 },
  { of: [['tow', 1], ['prism', 2], ['needle', 3]], band: 5 },
  // A pair and a beacon: the HERALD is what keeps you looking away while the
  // load comes round.
  { of: [['tow', 2], ['herald', 1], ['mote', 2]], band: 5 },
  // Two pairs into a lane already full of splitting bodies, which is the case
  // the plow was written for -- a MASS that stops four bodies in is a dropped
  // ball, and this is the wave where you find out it does not.
  { of: [['tow', 2], ['splitter', 2]], band: 5 },
  // Three. Six of the eleven bodies are the pairs, and the loads do not arrive
  // together: each head winds on its own approach.
  { of: [['tow', 3], ['needle', 2]], band: 5 },
  { of: [['tow', 2], ['glut', 2], ['mote', 1]], band: 5 },
  /*
   * ...and the FLINT wave. Three flints and three PRISMs weighs 20.80 against
   * band 3's own mean of 20.9571, so it re-prices the band by -0.08% -- build
   * 315's lever. PRISM rather than the NEEDLE or GLUT that would price the
   * same, because both of those wear FLINT's exact gold.
   */
  { of: [['flint', 3], ['prism', 3]], band: 3 },

  /*
   * ...and the SHRIKE wave. Two shrikes, two LURCHERs and a MOTE weighs 18.03
   * against band 2's own mean of 17.875, so it re-prices the band by +0.18%
   * -- build 315's lever. Deliberately NOT paired with the NEEDLE that wears
   * SHRIKE's exact gold: three types share `#ffd166` and two of them in one
   * wave is the collision the silhouette should not have to carry.
   */
  { of: [['shrike', 2], ['lurcher', 2], ['mote', 1]], band: 2 },

  /*
   * ...and the YOKE wave. Six pairs and one GLUT weighs 33.9 against band
   * 5's own mean of 35.39, so it re-prices the band by -0.4% -- build 315's
   * lever used deliberately: a wave authored at its band's mean adds a
   * problem without lengthening every other wave in that band.
   */
  { of: [['yoke', 6], ['glut', 1]], band: 5 },

  /*
   * ...and the LOOM wave.
   *
   * The partner is a LURCHER on purpose, and the combination is the point
   * rather than either body: a LURCHER closes and GRIPS, so the thing
   * filling the glitch fuse walks on while the rounds meant for it stop on
   * the thread. A heavy partner would just be a second wall.
   *
   * Three pairs and two LURCHERs weighs 34.33 against band 5's own mean of
   * 36.44, so it re-prices the band by -0.41% -- build 315's lever, and the
   * counts were chosen by measuring rather than by eye: the first draft was
   * four pairs and three LURCHERs, which weighs 47.83, sits 31% OVER the mean
   * and would have lengthened every other wave in band 5 by 2.2%.
   *
   * Note `threatOf` sees 7.33 a pair -- 220 of health, both halves, because
   * LOOM declares no pool -- and still cannot see what the thread costs a
   * ROUND, which is the same blind spot it has for FLINT's armour, for what a
   * LATCH gives its host and for what CHAFF costs the assist.
   */
  { of: [['loom', 3], ['lurcher', 2]], band: 5 },

  /*
   * ...and the KITE wave.
   *
   * The partner is a BULWARK and the third body is a MOTE, and all three are
   * doing different jobs. The BULWARK is the combination: 676 of health
   * behind 0.4 of armour is fifteen seconds of barrel at close range, and
   * the whole of KITE is that it will not come and be shot while you are
   * busy. The MOTE is there so the difference is on the screen at once --
   * one round and it is gone, because it came to you.
   *
   * Three kites, a BULWARK and a MOTE weighs 36.567 against band 5's own
   * mean of 36.2857, a ratio of 1.0077 -- the closest to a band's mean any
   * of the nineteen has been authored at, and it re-prices the band by
   * **+0.052%**. Build 315's lever: a wave at its band's mean adds a problem
   * without lengthening every other wave in that band. The counts were
   * chosen by measuring the alternatives rather than by eye -- four kites
   * and a BULWARK is 1.0987 and moves the band +0.66%, three and two
   * LURCHERs is 0.6982 and moves it -2.01%.
   *
   * And `threatOf` prices a kite at 4.333 -- its 130 of health over
   * `threatPerHp` and nothing else. It cannot see that the body stands where
   * an unbought assist can only just reach it, which is the same blind spot
   * it has for FLINT's armour, for what a LATCH gives its host, for what
   * CHAFF costs the assist and for what LOOM's thread costs a round. Five
   * instances now; weighting threat by anything but health re-prices every
   * band in the game and belongs in a pacing pass.
   */
  { of: [['kite', 3], ['bulwark', 1], ['mote', 1]], band: 5 },

  /*
   * ...and the LATCH wave, which closes band 3.
   *
   * Three latches and two BLOOMs weighs 20.47 against band 3's own mean of
   * 20.9375, so it re-prices the band by -0.25% -- build 315's lever. Note
   * `threatOf` is health-only and so sees 1.33 a latch where the object
   * guide authors 4: what a LATCH does is to its HOST, and the budget cannot
   * see that any more than it can see FLINT's armour. Recorded rather than
   * fixed, for build 319's reason -- weighting threat by what a body does to
   * another body re-prices every band in the game and belongs in a pacing
   * pass, not in the build that adds the body.
   *
   * BLOOM is the host and is chosen rather than priced in: it is the biggest
   * thing band 3 opens (r 33 against SPLITTER's 29 and LURCHER's 24), so it
   * wins the hunt's `e.r * 1000 - dist` outright, and two of them at equal
   * radius means the tie goes to the CLOSER -- which fills one ring to
   * `CFG.graft.stack` = 3 and leaves the other BLOOM clean. That is the
   * object's own sentence ("three of them on one body is a different
   * fight") authored into the wave rather than left to chance.
   *
   * It is also NOT paired with LURCHER, which is in band 3's roster and
   * wears the violet the object guide gives LATCH: see the type.
   */
  { of: [['latch', 3], ['bloom', 2]], band: 3 },

  /*
   * ...and the CHAFF wave.
   *
   * Three chaff and three LURCHERs weighs 24.50 against band 4's own mean of
   * 24.8925, so it re-prices the band by -0.175% -- build 315's lever. Note
   * `threatOf` is health-only and so sees 2.00 a chaff where the object guide
   * authors 4: what CHAFF costs is the ASSIST, and the budget cannot see that
   * any more than it can see FLINT's armour or what a LATCH gives its host.
   * Recorded rather than fixed, for build 319's reason.
   *
   * LURCHER is the partner and it is chosen rather than priced in. Two
   * reasons, and the second is the object.
   *
   *  - MOTE prices almost identically and wears CHAFF's exact family colour
   *    (dE 0.0 against the guide's `#7ef9ff`), so pairing them would put two
   *    cyans on the field together -- build 317's ruling, that when a hue is
   *    shared you check the WAVE as well as the shape. SPLITTER prices closer
   *    still and is refused for the same reason one step removed: its four
   *    children are MOTEs, so its death paints the field cyan.
   *  - A LURCHER closes and GRIPS. So while the assist is spending itself on
   *    copies that cannot be shot, the thing that fills the glitch fuse is
   *    walking onto the mount -- which is the tension the object exists for.
   *    A wave of chaff alone is a curiosity; a wave of chaff and something
   *    arriving is the reason its counter is "aim it yourself".
   */
  { of: [['chaff', 3], ['lurcher', 3]], band: 4 },

  /*
   * ...and the REMNANT wave.
   *
   * Two remnants and six NEEDLEs weighs 35.20 against band 5's own mean of
   * 35.2367, so it re-prices the band by **-0.009%** -- the smallest move of
   * any wave added in phase 6, and build 315's lever used deliberately. The
   * threat counted is 15.00 a remnant and not 10.00: `threatOf` multiplies by
   * `1 + respawn.hp` because the health a player shoots is 300 plus 150. The
   * object guide authors 11, which is neither figure.
   *
   * NEEDLE is the partner and it is chosen for a reason that is not price.
   * Four pairings land inside 1% of the mean (`warden 4`, `mote 5`,
   * `splitter 1`, `warden 1` are the others), and SPLITTER and WARDEN both DO
   * SOMETHING WHEN THEY DIE -- four motes, and plates. REMNANT's whole
   * reading is "that death did not take", so a wave with three different
   * death behaviours in it is a wave where nobody can tell which body did
   * what. NEEDLE is a plain fast body: it dies and stays dead. That is build
   * 317's rule about checking the WAVE and not only the shape, applied to a
   * mechanism instead of a colour.
   *
   * And the counts are a PROPORTION: the budget swells this 9.5-10.2x at
   * band-5 rungs, so what is actually sent is about twenty remnants and sixty
   * needles. See `CFG.remnant`.
   */
  { of: [['remnant', 2], ['needle', 6]], band: 5 },
  /*
   * ---- ANVIL, band 5, and the counts are what keep it ONE thing ----------
   *
   * `count: 'one'` in the guide, and a wave's counts are a PROPORTION rather
   * than a number from build 301 -- so an authored 1 against a band-5 swell
   * of 9.5-10.2x is about ten anvils over the wave, arriving one at a time
   * down the middle. That is the object: not a crowd, a queue.
   *
   * MOTE is the partner, and it is chosen for what it is NOT. The
   * two-or-three-hostile rule exists because "the problem is a combination",
   * and the combination here is a thing that cannot be moved beside things
   * that are nothing but movement -- so the press that clears the motes off
   * the mount does nothing at all to the anvil behind them, which is the
   * decision the object exists to force. A heavy partner would just be two
   * walls.
   */
  { of: [['anvil', 1], ['mote', 3]], band: 5 },

  /*
   * ...and the VEIL wave.
   *
   * Three sheets and two LURCHERs, 36.34 against band 5's own mean of 36.44
   * (**-0.29%**) -- priced at the mean deliberately, so adding the sixteenth
   * object does not lengthen every other wave in the band. ANVIL could not be
   * priced that way (1400 health weighs 46.7 on its own) and paid +3.3%;
   * QUARRY paid +9.3% in band 4 and SHOAL +5.1% in band 1.
   *
   * The counts are the wave's SHAPE and not its size: `Director.load` scales
   * the whole thing to the band's budget, so at rung 32 this is about
   * twenty-eight sheets and nineteen lurchers queued behind a field capped at
   * 57. That is the object at scale rather than an accident -- a wall of
   * membrane with things arriving through it -- and what keeps the screen
   * from filling is `emit`, which HOLDS a release while the field is at
   * `maxEnemies` rather than dropping it.
   *
   * LURCHER is the partner because the sheet costs the ASSIST, so the thing
   * behind it has to be something that closes and grips -- CHAFF's reasoning
   * and CHAFF's partner, for the same reason.
   */
  { of: [['veil', 3], ['lurcher', 2]], band: 5 },

  /*
   * The bonus. Grey and nothing else: no hostiles, no risk, no cost to the
   * allotment, and about 220 ENERGY lying on the field if you take it.
   *
   * It is a wave you have to *play*, which is the point of putting it in the
   * rotation rather than just handing out energy. AUTO AIM does not target
   * DRIFT, so auto-fire does nothing here at all — the whole wave is you
   * aiming by hand, at things that cannot hurt you, for as long as you care
   * to. It is the one beat in the run where the assists are dead weight.
   *
   * Short on purpose. `dwell` is the quiet it buys; the drift itself does not
   * expire when the wave ends, so anything left is still there to sweep up
   * while the next wave comes down on top of it.
   *
   * Nothing announces it. A screen of grey with nothing hostile on it is the
   * announcement — see the note on waves never being named.
   */
  { of: [], drift: 22, dwell: 8, band: 1 },
];

/*
 * ---- what a body does when nothing has happened to it yet ---------------
 *
 * A GAIT, in the sense docs/objects.html means it: a property of the TYPE and
 * not a roll at spawn. Twenty-eight of the thirty-six loose bodies still draw
 * their approach from the same six march routes, which is why they read as one
 * crowd walking downhill; this is the vocabulary that lets a type say
 * otherwise. (It was thirty-six of thirty-six when this paragraph was
 * written, and the eight that have left are the objects of builds 307-335.
 * Derived: `ENEMY_TYPES.filter((t) => !t.fixed && !t.harmless)` is 36, and 8
 * of those declare a gait that replaces or offsets the route.)
 *
 * Only the ones with a live reader are in here. An entry with no reader is a
 * promise the table is making and the code is not keeping -- which is the
 * `kind: 'works'` fault verbatim -- so `scripts/check-build.mjs` requires
 * every id below to be read by name in src/enemies.js, and requires every
 * `gait` declared on a type to be one of these.
 *
 * ---- THE FIELD IS MANDATORY FROM BUILD 338, AND THERE IS NO DEFAULT ------
 *
 * It was optional, and 43 of the 61 types declared nothing: `march` was the
 * ABSENCE of a declaration, so a type that had never been thought about and a
 * type deliberately chosen to march were THE SAME TEXT. That is the fifth
 * instance of one fault in this repo -- `u.levels ?? 3` sold eight upgrade
 * nodes three times, an omitted `band` read as band 1 (9 kB against 4 MB), a
 * second `plated` type would have worn `CFG.flint`'s arc, a second `ride`
 * type `CFG.graft`'s growth -- and every one of them was fixed the same way:
 * not with a better comment, but by making the omission impossible to write.
 * `gaitOf` in enemies.js throws for a type that declares none or declares a
 * word not in here, and check-build fails the build for one.
 *
 * `fixed` TYPES ARE EXEMPT, and that is a decision rather than an oversight.
 * `drive`'s first statement is
 * `if (this.type.fixed && !this.isDrop) { vx = 0; vy = 0; return; }` -- a boss
 * core and its structure do not go anywhere, their position being the boss's
 * business -- so `fixed` ALREADY answers the question a gait would answer,
 * and declaring one would be a second source of truth for the same fact that
 * can get out of step with it. Eighteen types are fixed and none of them
 * declares a gait; the guard holds exactly that partition in both directions.
 *
 * ---- AND `march` IS EXEMPT FROM THE READER TEST, WITH THE REASON ---------
 *
 * The reader test exists because a type naming a gait nothing implements gets
 * the march it was trying not to take. That argument does not apply to march
 * itself: a type declaring march and getting the march is CORRECT, so there is
 * no site that needs to name it and adding one to satisfy a grep would be
 * exactly the dead field the test is there to catch. What holds march instead
 * is the mandatory rule above, which is the stronger guard -- every non-fixed
 * type declares a word, and march's implementation is the route branch at the
 * foot of `drive`'s chain.
 *
 * ---- THREE KINDS OF WORD LIVE IN THIS ONE TABLE -------------------------
 *
 * Worth knowing before phase 2, because docs/objects.html's plan does not
 * express it. That plan says each entry should be "a function with the
 * signature `drive` already has" and `march` "the present code moved
 * verbatim" -- which assumes every gait REPLACES the whole of `drive`. Read
 * against the code, the fourteen words below are three different things:
 *
 *   REPLACERS own the steering outright and the route branch never runs for
 *   them: roll, dive, creep, spread, standoff, flock, and hop while it is
 *   leaping. Each has its own arm in `drive`'s if/else chain.
 *
 *   WALKERS return from `drive` before the chain is reached at all: rise,
 *   tumble, chain and hover (the harmless switch), and ride (a rider goes for
 *   its host). These never touch a route.
 *
 *   MODIFIERS hold something on TOP of an ordinary march and the route branch
 *   still runs: paired, cartwheel and lurch, all three of which say so at
 *   their own site. `lurch` was a `lurch: true` FIELD until build 338 and is
 *   the reason this paragraph exists -- a modifier keyed on its own field
 *   rather than on the word is a second source of truth, and the type then
 *   declared `march`, naming the quieter half of what it does. Re-keyed onto
 *   the word it needs no vocabulary exemption either, because `drive` now
 *   dispatches on it.
 *
 * So the route branch at the foot of the chain is reached by march, by the
 * three modifiers, and by a handed-back hop -- NOT by march alone. A function
 * table keyed one-per-gait cannot say that, and turning the chain into one
 * would change what those bodies do. Phase 3 (a route allow-list per type)
 * lands inside this shape and owes this paragraph a re-read.
 *
 * ---- PHASE 2 IS DONE, AND TWO OF ITS THREE WORDS WERE REFUSED -----------
 *
 * The plan named `lurch`, `drag` and `wander`. Two of them were re-keys that
 * DELETED a field rather than adding a word, which is the shape worth having:
 * `lurch` (build 338, off `lurch: true`) and `drag` (build 339, off the
 * flag-use of `type.hurl`). Both were proved identical over the roster --
 * exactly one type carried the old field and exactly that type declares the
 * new word -- and neither moved the ORDINAL hash.
 *
 * `wander` IS REFUSED, and the guide says why in its own entry: `who:
 * 'nothing, now'`. DRIFT owned it until build 298 and `hover` has been the
 * word since; the `wander()` METHOD is what implements `hover`, at the
 * harmless switch's `case 'hover': default:` arm. So a `wander` row would be
 * a second name for a shipped behaviour with NO type declaring it, which is
 * the `kind: 'works'` fault -- a table entry making a promise the code is not
 * keeping. The method keeps its name because it is a good one; the vocabulary
 * does not need two words for one gait.
 *
 * `thrown` IS REFUSED TOO, and it is the more interesting refusal, because
 * the guide's vocabulary lists it (`who: 'MASS, and every knockback'`) and it
 * is genuinely "already in the game". It cannot be a gait for a reason that
 * is structural rather than a matter of taste: a gait is a property of the
 * TYPE, and `thrown` is a per-body COUNTDOWN. `this.thrown = 0` in the
 * constructor, written to 0.2 by an ability, 0.4-0.5 by four boss sites and
 * 2.2 by a TOW's release, and decremented in `drive`'s second early return --
 * NO type declares it, and none could, because what it describes is a state a
 * body passes through rather than what it does when nothing has happened to
 * it. A MASS spends 2.2 seconds of its life thrown and the rest marching on a
 * tether; that makes `thrown` the loudest second of its life, not its gait.
 */
export const GAITS = {
  march: 'the default and the base the rest are named against: one of six routes, swung wide at range and folded in as the body closes, with a heading wobble on top',
  hover: 'comes down to a band across the middle of the field and bobs there',
  rise: 'up-field, away from the machine, toward the rim -- ignore it and it leaves',
  tumble: 'thrown rather than steered: an arc, a spin, and no opinion about the machine',
  chain: 'follow the leader -- each body steers at the one ahead, so a cut leaves two snakes',
  roll: 'takes no lane at all: across the field, off the side walls, spinning as it comes',
  flock: 'no leader: each body steers at the school\'s own mean and off its nearest neighbour',
  drag: 'the ordinary march, plus a load on a tether that it winds and throws -- the word is the HEAD\'s, the thing doing the dragging, and the route branch still runs',
  lurch: 'the ordinary march, plus a shove forward every second or two instead of a glide -- the route branch still runs',
  cartwheel: 'comes down an ordinary lane end over end, so its profile against the barrel turns with it',
  paired: 'two bodies on a rigid link, turning about their midpoint while the midpoint advances -- held at a fixed length by a YOKE, walked apart by a LOOM',
  dive: 'holds height across the top, then runs down the edge of the machine and climbs back for another',
  ride: 'beelines at the biggest body on the field and rides it -- the thing to shoot is no longer the thing in front',
  hop: 'quantised: sits still, then crosses a hundred units sideways in three frames, leaving a copy of itself where it was',
  creep: 'the straight line and nothing else: no lane, no wobble, and no impulse in the game turns it',
  straight: 'one line, chosen at the rim and never revised: no lane and no wobble, at whatever the body\'s own blend delivers -- `creep` is this plus a speed the type NAMES, which is a different claim',
  serpent: 'weaves down the field, and the weave OPENS OUT as it closes -- the one lateral in the game that does not fold in, painting ground behind it that gets wider with it',
  spread: 'goes wide before it comes down, taking the emptiest lane it can find -- it is covering ground, not coming for you',
  standoff: 'closes to the far edge of what the assist can reach and holds it, sliding sideways -- it will not come to you',
};

export const TYPE_BY_ID = Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, t]));

/**
 * Minimum stroke width in world units that still resolves to a clean line on
 * screen once the camera scale is applied. Outlines should thin out as the
 * camera pulls back, but not below roughly one device pixel.
 *
 * That last sentence was the intent and not the arithmetic. A world unit is
 * `dpr * CFG.zoom` device pixels, so a fixed `1.25 / zoom` draws at 1.25 * dpr
 * -- 2.5 device pixels on a dpr-2 iPhone, two and a half times what it claims.
 * A floor is only supposed to stop a line vanishing; this one was setting the
 * weight for half the roster. Measured on build 198, EIGHTEEN of thirty-seven
 * types had `r * m.line` land under it, so a line ladder authored across 17.3x
 * was drawn across 4.2x, and the body with density 6.0 got the same outline as
 * the one at 0.55. A body reads almost entirely as its outline -- the fill is
 * 7-9% of its brightness -- so that is the type's weight deleted from the
 * channel carrying the image.
 *
 * It lives on CFG, and NOT as an `export let` that setHairline reassigns.
 * bundle.mjs gives each module its own scope and copies its exports into a
 * registry object once, at the end of the module body -- so a reassigned
 * export is a snapshot, and every importer keeps the value it had at load.
 * Measured: the module build halved the floor from dpr 1 to dpr 2 and the
 * bundle did not move it at all, which would have shipped this fix dead in the
 * Artifact and the home-screen install while working in the served build. A
 * property on an object that is itself never reassigned is live in both.
 */
/**
 * Called from Game.resize with the scale the canvas is actually drawn at --
 * device pixel ratio times the quality governor's own factor, since a governor
 * that shrinks the backing store makes every world unit fewer device pixels
 * and the floor has to rise to meet it. 1.25 DEVICE pixels rather than 1.25
 * CSS pixels: a shade over one, so a line does not fall between pixel centres
 * and disappear into the antialiasing.
 */
/*
 * ============================ THE CURRENCY ================================
 *
 * What a run banks is measured in BYTES, and it is written and read with the
 * base-10 SI storage prefixes: 1 kB is 1000 B, 1 MB is 1000 kB, and so on up.
 * Decimal, not binary -- kB and not KiB, by ruling.
 *
 * ---- one point of the old ENERGY is one KILOBYTE, exactly -----------------
 *
 * That is the whole conversion and it is chosen so this is a change of UNIT
 * and not of balance: every ratio in the economy is preserved to the digit, so
 * every measured number this repo has written down -- tiers.mjs's income
 * curve, plan C's affordability table, docs/pacing.md -- stays true. Only the
 * notation moves. See docs/bytes.md.
 *
 * The alternative was one point to one BYTE, and it is refused for a reason
 * worth keeping: it would put the whole game between 1 B and 174 kB, which is
 * two prefixes, and the ladder would never climb.
 *
 * ---- and the BYTE is a live unit, not a formality ------------------------
 *
 * `bank()` does not round -- what lands is `amount * intakeRate * dividend` --
 * so sub-kilobyte amounts already existed and were simply invisible. Measured
 * against this config: the smallest amount that can enter the purse is
 * `minValue * taxFloor`, which is 0.3 of a point and therefore 300 B. So B, kB
 * and MB are all reachable without one balance number moving, and GB arrives
 * on a long run's lifetime total.
 */
CFG.bytes = {
  step: 1000, // decimal, by ruling: 1 kB is 1000 B and not 1024
  /*
   * The whole ladder, in order. It runs past anything this game can reach on
   * purpose: a readout that falls off the end of its own unit table is a
   * readout that prints a raw number, and the top of it costs nothing.
   */
  units: ['B', 'kB', 'MB', 'GB', 'TB', 'PB'],
  sig: 3, // significant figures, never more
};

/**
 * An amount of bytes, as the player reads it.
 *
 * The ONE place in the game allowed to turn an amount into text. There was no
 * number formatter of any kind in this repo before it: every figure was
 * `String(n)`, `Math.floor(n)` or `Math.round(n)` interpolated into a
 * template, in eleven places.
 *
 * Three significant figures and never more -- `948 B`, `1.00 kB`, `21.7 MB`,
 * `1.08 GB` -- because the figure is read at a glance and a fourth digit is a
 * digit nobody uses. Below a kilobyte there is no fractional byte, so it is a
 * plain integer: `948 B`, not `948.0 B`.
 *
 * The widest string it can produce is seven characters (`1.08 GB`), against
 * the six of the widest raw figure it replaces. That one character is what
 * makes this a layout adjustment rather than a redesign -- see `Hud.fitBar`,
 * which has to be re-keyed because its digit-count signature gets SMALLER as
 * the string it stands for gets WIDER.
 */
/**
 * Which rung of the ladder an amount reads on. Exported for one caller: a
 * figure being TWEENED has to be formatted in a single unit for the length of
 * the tween, or it flickers its prefix as it crosses a decade -- see
 * `Menu.rollBank`, which picks the unit once from where the roll is going and
 * holds it.
 */
export function unitOf(n) {
  const C = CFG.bytes;
  let a = Math.abs(Number.isFinite(n) ? n : 0);
  let i = 0;
  while (a >= C.step && i < C.units.length - 1) { a /= C.step; i++; }
  return i;
}

export function fmtBytes(n, at) {
  const C = CFG.bytes;
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? '-' : '';
  let a = Math.abs(v);
  /*
   * Under one of the next unit, in the unit we are in -- unless a unit is
   * NAMED, in which case that one is used whatever the magnitude. A held unit
   * can legitimately print more than three significant figures ("1050 kB"
   * on the way down to "900 kB"), which is the cost of not flickering; it is
   * bounded because the only caller holds it for 260ms of a spend.
   */
  let i = 0;
  if (Number.isInteger(at) && at >= 0 && at < C.units.length) {
    for (; i < at; i++) a /= C.step;
  } else {
    while (a >= C.step && i < C.units.length - 1) { a /= C.step; i++; }
  }
  const unit = C.units[i];
  if (i === 0) return `${sign}${Math.round(a)} ${unit}`;
  /*
   * Three significant figures. `9.995` rounds to `10.0` and not to `9.99`,
   * which is why the decimal count is taken AFTER the rounding rather than
   * from the raw value -- the naive version prints "10.00 kB", four figures,
   * on exactly the values that cross a decade.
   */
  const dp = a < 9.995 ? 2 : a < 99.95 ? 1 : 0;
  return `${sign}${a.toFixed(dp)} ${unit}`;
}

/** ...and the same thing per second, which is what a throughput reads as. */
export function fmtRate(n) {
  return `${fmtBytes(n)}/s`;
}

export function setHairline(dpr) {
  CFG.hairline = 1.25 / (Math.max(dpr, 0.1) * CFG.zoom);
}

/**
 * The camera scale for an era, written where everything reads it.
 *
 * Called from `Game.resize` BEFORE `setHairline`, because the stroke floor is
 * derived from the zoom and would otherwise be one resize behind.
 *
 * It took a `sandbox` flag until build 262 and pinned the bench to era 1's
 * scale whatever era it was entered from. That went with the bench becoming
 * three rooms: an ASSAY tab per era, and era 2's room is the era-2 FIELD with
 * the second form standing on it, which is the whole point of having one. The
 * bench's era is `world.era` like everywhere else now -- `enterSandbox` sets
 * it, `exitSandbox` lets the restore put the run's own back -- so there is one
 * answer to "which era is this" and nothing to keep in step.
 */
export function setZoom(era) {
  CFG.zoom = CFG.ZOOMS[era] || CFG.ZOOMS[1];
  /*
   * ---- and everything the field's size implies ----
   *
   * `CFG.scale` is how much further everything turret-owned has to reach for
   * the machine to cover the same FRACTION of a field that got deeper. It is
   * DERIVED from the zoom rather than declared beside it, so the two cannot
   * drift, and it is exactly 1.0 in era 1 -- which is what makes "era 1 is
   * unchanged" true by construction instead of true by testing. Every site
   * that multiplies by it is a no-op in era 1, so the sweep can be applied
   * freely and a missed site is the only failure mode.
   *
   * Below it, the handful of constants with several readers each. They follow
   * `CFG.hairline`'s shape -- a base that is written down once and a live
   * value the game reads -- because wrapping four call sites in an expression
   * is four chances to miss one, and this is none.
   */
  CFG.scale = CFG.ZOOMS[1] / CFG.zoom;
  /*
   * ...and whether the machine wears its second form. Derived from the SAME
   * expression that makes era 1 a no-op, and never from `world.era`: both
   * bench doors carried the era across by hand until build 262 -- which is
   * why this paragraph reads as it does; the state it describes was real then.
   * The doors set the era now. Historically, `w.era === 2 && w.sandbox`
   * is a reachable state, and a shape gated on the era would draw the MK2 at
   * the MK1's radius in the one room a player pays 20,000 energy for. One
   * source, so the form and the size cannot disagree.
   */
  CFG.mk2 = CFG.scale > 1;
  /*
   * ...and what a round or a mine is worth on the new field. One number, one
   * writer, derived from the same expression as the scale and the form, so
   * era 1 is EXACTLY 1 and multiplying by it there is the identity.
   *
   * It is applied at `Enemy.applyDamage` -- the one door every one of the
   * seventeen already comes through under its own name -- and NOT at the
   * twenty-odd constants in this file, and not at `up.damage` and
   * `up.mineDamage` either. Those two reach ten and six sites between them and
   * WIRE is outside BOTH, on `up.wireDamage` of its own: a per-multiplier
   * change would have shipped one of the eight mines unboosted, which is the
   * "a CFG number read at a site the multiplier never reaches" fault this repo
   * has already paid for three times in one sweep.
   */
  CFG.power = CFG.scale > 1 ? CFG.era2Power : 1;
  for (const path of SCALED) setPath(path, BASE[path], CFG.scale);
}

/**
 * ---- every world distance the TURRET side owns ----
 *
 * One table rather than seventy edits, and that is the point: a reviewer can
 * read this list and say what is missing, where seventy scattered `* CFG.scale`
 * expressions can only be audited by grepping for the ones that are not there.
 * Each is captured at module load into `BASE` and rewritten by `setZoom`, so no
 * READ site anywhere in the game changes -- the same shape `CFG.hairline` has
 * had since build 199.
 *
 * What is deliberately NOT here, and why:
 *
 *   enemy speeds, cruise, accel, the boss standoffs   the user's ruling: only
 *       turret-owned variables follow the field. New faster bodies come later.
 *   `entrySpeed`                                      IS here, and is the one
 *       carve-out: it is a staging multiplier applied only while `staged`, not
 *       a field speed, and without it the march-in stops being free.
 *   angles -- `shotgun.spread`, `sliver.spread`, `aimClamp`, `ward.arc.reach`
 *       radians and ratios do not scale with a field.
 *   `shooter.r`                                       the turret's PHYSICAL
 *       radius, which the MK2 phase owns. Moving it here would change contact,
 *       the intake band and the attackers grab as a side effect of a camera
 *       change.
 *   times, damages, costs, healths                    not distances.
 */
/*
 * ---- THE YARD ----
 *
 * The enemy's side of the era-2 field: a building the whole ladder walks out
 * of, and a wall across the bottom of it. Era 2 only; `world.yard` is null at
 * era 1 and in the testbed, and every number below is a no-op there.
 *
 * All of it is a PICTURE rather than a machine, so all of it is in `SCALED`
 * and holds its size on the glass -- the building must not grow on a taller
 * phone. `gap` is the visible depth of the enemy's side, 43.4 CSS px at both
 * of the screens the suite measures.
 */
/*
 * ---- THE EVOLUTION ----
 *
 * Six acts, and `acts` is the mark each one OPENS on. Thirty seconds against
 * TERMINUS's 21.6, which is the longest thing in the game today.
 *
 *   0 -> 4.0   the field is taken. Nothing pays out.
 *   4.0 -> 9.0 the approach. The camera pushes to `close`, nearer than the
 *              game has ever been.
 *   9.0 -> 15.5 the unmaking, in the order the run was built (P8b).
 *   15.5 -> 19.0 the core. One point of light, held.
 *   19.0 -> 23.5 the ignition. The era flips HERE, so the new form is what
 *              builds outward.
 *   23.5 -> 30.0 the pull-back, out to the new field.
 *
 * `quick` is the reduced-motion span: the same acts in the same order at a
 * fifth of the length, rather than a different sequence nobody has watched.
 */
CFG.evolve = {
  span: 30,
  quick: 6,
  close: 1.1,
  skipAt: 1.5,
  /*
   * FIVE acts from build 258, not six. The old act IV was the bare core --
   * one point of light on an otherwise empty screen for three and a half
   * seconds, with the machine gone entirely -- and it was reported as a hole
   * in the piece: the machine is stripped part by part and then simply is not
   * there any more, so the new form arrives from nothing rather than out of
   * the old one. The unmaking now runs straight into the transformation, and
   * the bare MK1 is on screen until the moment it becomes the MK2.
   *
   *   I    0.0 - 4.0    the field is taken
   *   II   4.0 - 9.0    the approach
   *   III  9.0 - 15.5   the unmaking, in the order the run was built
   *   IV  15.5 - 22.0   the transformation: the bare machine draws light in,
   *                     the field turns over, the second form comes out of it
   *   V   22.0 - 30.0   the pull-back
   */
  acts: [0, 4.0, 9.0, 15.5, 22.0, 30],
  // How far into act IV the flip lands: the charge is everything before it and
  // the new form is everything after. 0.38 of 6.5s is a 2.5s wind-up.
  flipAt: 0.38,
  // One an act. Short on purpose: the band is 470 world units wide and the
  // shot is of the machine, not of the writing.
  /*
   * ---- what the room does, act by act ----
   *
   * `[base, cutoff, level, tc]`, one row an act, written onto the four params
   * `startDrone` has owned since `audio.init()`. Not a score: this game has no
   * way to schedule a note -- `tone()` reads `ctx.currentTime` at the moment it
   * is called and takes no time argument -- and no way to cancel one against a
   * skip that can land anywhere in the thirty seconds. A bed made of
   * destinations needs neither.
   *
   * The bed has also never stopped: `startDrone` starts six nodes at init and
   * nothing in the codebase ever stops them -- there is no `stopDrone` and no
   * `disconnect` anywhere in src/. The room has never once been quiet. So the
   * cheapest gesture available here is also the only unheard one, which is why
   * act IV's level is a hard 0 and why that is the point of the piece.
   *
   *   I    the substrate drains. Base HELD -- what changes is the room, not
   *        the machine -- and the cutoff takes a 41Hz sawtooth from about
   *        seven passed harmonics to three.
   *   II   the approach. Above era 1's own 0.05: the camera is nearer than
   *        the game has ever been, so the room is fuller.
   *   III  the unmaking, and it goes to ZERO. The seventeen existing thuds ARE
   *        the act -- their measured spacing is 362ms against a thud audible
   *        for about 58ms -- so the room emptying under them is the act's own
   *        shape, and it is what the ignition then arrives out of. This used
   *        to be a thinned 0.030 with the silence held in a separate act IV
   *        whose PICTURE was an empty screen; the silence was worth keeping
   *        and the empty screen was not, so the two were separated and the
   *        silence moved here. The time constant is long enough (1.9s of a
   *        6.5s act) that the room drains rather than cuts.
   *   IV   the transformation. Two rows would be right and only one is
   *        available, so this is the IGNITION -- a seventh of a time constant,
   *        so the era-2 bed appears out of the silence in about a quarter of
   *        a second, ON the flip. What happens before the flip is the room
   *        still empty from act III, which is exactly what a wind-up wants.
   *   V    the pull-back, slowly.
   *
   * ROW V MUST EQUAL `syncSky`'s era-2 triple, and that is an assertion and
   * not a comment: after `endEvolve` the era is already 2, so `setEra` does
   * not fire and NOTHING re-issues the bed for the rest of the run. Wherever
   * the last row leaves it is where era 2 lives.
   */
  bed: [
    [41, 150, 0.038, 1.0],
    [41, 260, 0.056, 1.6],
    [41, 90, 0, 1.9],
    [33, 420, 0.045, 0.25],
    [33, 420, 0.045, 1.0],
  ],
  /*
   * One voice, at the era flip. A triangle at 132 falling to 66 -- four times
   * and twice the new tonic, so it is locked to the bed it lands on and
   * timbrally apart from it, the bed being a sawtooth.
   *
   * Measured through a two-pole highpass at 200Hz, a crude model of what a
   * phone can actually reproduce: a pure 33Hz sine -- the obvious choice --
   * comes back 23.7 dB down on this and would have shipped inaudible. Band
   * energy here is 79% of a `boom`, and the peak with the drone under it is
   * -17.9 dBFS, under the compressor's -14 threshold.
   */
  spark: { type: 'triangle', f0: 132, f1: 66, gain: 0.18, attack: 0.02, dur: 2.4 },
  lines: [
    'The field is yours. All of it.',
    'Closer.',
    'Every part, in the order you built it.',
    'NEW FORM.',
    'And a field to put it on.',
  ],
};

/*
 * ---- the emplacements ----
 *
 * Six small auto-turrets, one per build lot, at era 2. See src/turrets.js for
 * what one is and why it is deliberately the simplest shooting thing in the
 * game; these are its numbers.
 *
 * `damage` 3.4 against BOLT's 26 and `interval` 0.55 against the machine's
 * 0.286 stock: about a twentieth of the machine's output each, so all six
 * standing and fully upgraded is a supporting line and never the main gun.
 * That ratio is the design -- what an emplacement buys is COVER, not damage.
 *
 * `r` 16 against the second form's 40, so it reads as a fixture beside the
 * machine rather than as a second player, and `range` 300 is a third of the
 * era-2 field's depth: enough to hold the ground it stands on and not enough
 * to hold the field from one corner of it.
 */
CFG.gun = {
  r: 16,
  bolt: 2.6, // the round's own radius -- BOLT's is 4.2
  range: 300,
  interval: 0.55, // seconds between rounds
  damage: 3.4,
  speed: 900,
  impulse: 26,
  life: 1.2,
  slew: 3.4, // radians a second the little barrel comes round at
  spread: 0.055, // VOLLEY's fan, per extra round
  /*
   * ---- THE EMPLACEMENT LINE IS OUT OF PLAY -----------------------------
   *
   * Every line of it is still here -- `turrets.js` entire, the two `gun` lots
   * in `yard.js`, the TURRETS tab in `menu.js`, the six upgrades in
   * `upgrades.js`, the `gun*` keys in `world.up`, the `guns`/`gunsOn` fields
   * in the save. What is gone is every DOOR into it, and this flag is the one
   * thing that shuts them:
   *
   *   yard.js    the two `gun` lots are not laid, so `gunLots()` is 0, `lotAt`
   *              can never return one and the price plate has nothing to draw
   *   game.js    `syncGuns`, `updateGuns`, `drawGuns` and `gunGlow` are not
   *              called at all, `pressLot` returns before it can refuse or
   *              teach, and a restore refunds anything already standing
   *   menu.js    the TURRETS tab is not in `GROUPS`, so it cannot be reached
   *              or unlocked, and the `gunsOn` switch goes with it
   *   tree.js    `DETACHED` is empty, so the six upgrades are in no tree, no
   *              `NODE_BY_ID` and no ledger replay
   *   turrets.js `buildGun` refuses at its first line, which nothing can now
   *              reach -- it is the backstop, not the gate
   *
   * Set it true and every one of those comes back with no other edit. The
   * suite asserts the whole list, so a door left open is a red case rather
   * than something a player finds.
   */
  inPlay: false,
  cost: MB(2.6), // flat, per lot -- see lotPrice
  /*
   * How long a gap in the shooting is a PAUSE rather than the end of it.
   *
   * With nothing to shoot an emplacement walks its barrel back to straight
   * up-field, because four of them each frozen on the bearing of a different
   * body that died a minute ago is what "the mini turrets look crooked" was.
   * Setting off on the first frame with no target is the other failure: a
   * body that wanders in and out of reach -- a DRIFT does exactly that --
   * costs a full slew back every time, and the bench measured it taking a
   * DRIFT from inside a twenty-second cap to outside it. Six tenths is longer
   * than any gap a body crossing the reach makes and shorter than a wait.
   */
  rest: 0.6,
};

/*
 * ---- the title screen's own field --------------------------------------
 *
 * `phase = 'boot'` runs a real arena behind the title panel, which is what
 * makes the readout on it telemetry rather than decoration. It was topped up
 * to `hold` drifters and NOTHING ever removed one, so the same seven wandered
 * for as long as the screen was open: measured over forty seconds, one
 * distinct value, and the panel's own "07 TRACKED" was that constant printed
 * beside a running clock. A number that cannot change is decoration wearing a
 * comment that says otherwise.
 *
 * So the field turns over. Every `every` seconds the oldest drifter is retired
 * -- through `fizzle`, which is the dissolve build 210 already has and which
 * `Enemy.destroy` refuses to cash in, so nothing is banked and nothing is
 * counted on a screen where neither would mean anything -- and the top-up
 * brings another in at the top. The picture breathes and the count is true.
 */
CFG.title = {
  hold: 7, // drifters the field is held at
  every: 4.5, // ...and how often the oldest of them is retired
};

/*
 * ---- the portal ----------------------------------------------------------
 *
 * Where everything the simulation sends comes through, at BOTH eras from
 * build 297. A rift lying in the far end of the field, drawn in the same
 * perspective the grid is: `rx` by `ry` world units, an ellipse foreshortened
 * about 2.2 to 1, with its lower rim ON the entry line -- see
 * `syncPortal` in portal.js for the one case where the line moves down to
 * keep the whole of it below the chrome.
 *
 * `rx`, `ry` and `pad` are in SCALED, so the picture is the same size on the
 * glass at either era: 159 x 72 CSS px on a 320-wide screen. `mouth` is the
 * fraction of `rx` births are spread across -- the outer fifth of an ellipse
 * is nearly level with its centre line, and a body born there is out of the
 * surface long before it clears the line. `spill` is how far the light pools
 * down the field at era 1; at era 2 it runs to the wall.
 */
CFG.portal = {
  rx: 128, ry: 58, pad: 16, mouth: 0.82, spill: 150,
  /*
   * ---- how a body comes THROUGH, from build 298 ----
   * `settle` is the seconds after birth over which a body's route lateral
   * blends in, so it leaves the rim on the heading it arrived with and
   * curves onto its own arc rather than turning on the frame it is born.
   * `instantiate` is how long the birth mark stays on the body. `skin` and
   * `refuse` are the one-way surface: a born body whose top edge comes back
   * within `skin` of the rim is pushed out at `refuse` u/s per unit it is in.
   */
  settle: 0.9, instantiate: 0.6, skin: 4, refuse: 4,
};

CFG.yard = {
  gap: 105, tooth: 34, clear: 24,
  // The four lots. Two works beside the machine and two emplacements in front
  // of it, measured off the turret so they hold their place on the glass at
  // either screen -- the field is 1.22x deeper at 390x844 and the interface
  // either side of them is not.
  /*
   * `lotSide` was 104 and `lotW` 40 until build 258. The second form paints
   * 102.3 world units at era 2 against 85.6 before it, and the works stood
   * 98.5 clear of the turret -- so the machine growing put them under it. The
   * works step back rather than the machine being held to the furniture's old
   * place: the works belong to the machine.
   *
   * Stepping back alone does not fit. At `lotSide` 118 with the old width the
   * OUTER edge lands on the quick strip's left column at 320x568, which the
   * clash sweep catches; the works are narrower as well as further out, so
   * they move away from the machine without moving into the interface.
   */
  lotSide: 118, lotW: 34, lotH: 30,
  /*
   * ---- the TWO ahead, and why they stand where the outer pair did --------
   *
   * There were four, and build 275 took two of them out. The history is worth
   * keeping because it is what fixes where the surviving pair goes.
   *
   * They were four boxes in one row at `lotStep` 70, which put the inner pair
   * 54 units either side of the turret's own column -- close enough that an
   * emplacement on each was two guns firing up the same lane, and the row read
   * as one object. Build 261 answered that twice over: `lotStep` 96 opened the
   * nearest pair to 144 apart AND `lotStagger` dropped the inner two 34 units
   * back into a shallow V. The step is what fixed the lane; the stagger just
   * made four fixtures sit crooked, and it went in 263.
   *
   * So the ONE thing that row had already been tuned for is lane separation,
   * and dropping to two must not undo it. `(i - 0.5) * lotStep` -- the obvious
   * arithmetic -- would have put the survivors at +/-48, which is 96 apart:
   * tighter than the inner pair build 261 widened, and back to two guns up one
   * lane. `lotSpread` is where the OUTER pair stood instead, 144 either side
   * and 288 apart, so the surviving two keep the separation the row was
   * measured with and every clash bound is one the outer pair already passed.
   *
   * `lotAhead` is pinned at 320x568, which is the screen that binds -- the
   * turret stands 250 units below the wall's hold line there and 934 below it
   * at 390x844. It cannot grow past about 142, or the top of a lot crosses the
   * hold line and the player has placed something above the wall. It is
   * asserted at both screens, and the outer pair was always the binding case
   * for the sideways clash too, which is why keeping their column costs
   * nothing to check.
   */
  lotAhead: 134, lotSpread: 144, gunW: 23, gunH: 20,
  /*
   * How much of a lot's half width the price plate may take. The type shrinks
   * to fit rather than the plate growing: at a flat size the byte price
   * ("2600000", seven characters where "2600" was four) plated out to 87
   * world units against a lot 46 wide. A fraction of the lot rather than a
   * character count, because what has to hold is that the label fits the
   * thing it labels, whatever the currency does next.
   */
  plateFit: 1.5,
};

const SCALED = [
  // the field's own shape, and the speed that keeps arriving free
  'entryDepth', 'entrySpeed',
  // the machine: where it stands, how far it sees, what it is held by
  'shooter.r', 'shooter.standoff', 'shooter.aimRange', 'shooter.gripLen', 'shooter.gripR',
  /*
   * `shooter.r` is here from build 247, and the value it lands on is not a
   * choice: `26 * (0.62 / 0.403)` is EXACTLY 40 in doubles, because
   * `26 * 0.62` and `40 * 0.403` are both 16.12 CSS px. The machine had been
   * shrinking as the camera pulled back -- measured, a median drawn radius of
   * 19.8 CSS px at era 2 against era 1's 26, the camera ratio precisely -- so
   * this is parity on the glass, and the FOLD is what makes it read bigger.
   *
   * NOTE: `shooter.grabPad` and `shooter.releasePad` are deliberately NOT
   * here. See the note beside them in the shooter block.
   */
  // the intake, which is a travel-time problem and nothing else
  'energy.pull', 'energy.pulse', 'drop.speed', 'drop.accel',
  // the thumb, which covers the same disc of GLASS whatever the scale
  'touchLift',
  // rounds: what they are, and what they leave behind
  'bolt.r', 'rounds.explosive.blast.r', 'rounds.arc.jumpRange',
  /*
   * HE's clover, found by P7's bench and NOT by P3's sweep. The sub-blast
   * RADIUS is scaled two lines up and the distance the sub centres sit at was
   * not, so at era 2 a 132-unit sub grew to 203 while its centre stayed 200
   * from the body -- and the clover stopped being self-similar. The docstring
   * at shooter.js's cluster block guarantees "the added single-target damage
   * stays 0" on exactly that geometry; measured, HE delivered 1.85x instead of
   * the 1.30 every other round did, which is CLUSTER silently doubling
   * single-target damage, the fault build 220 removed.
   */
  'rounds.explosive.cluster.out',
  'rounds.spine.shatter.r', 'rounds.spore.patch.r',
  /*
   * HAIL's airburst, on the same rule as HE's blast two lines up: a radius is
   * a length and has to cover the same fraction of a field 1.54x deeper.
   *
   * `hail.r` is deliberately NOT here, and that is a preserved inconsistency
   * rather than a decision: it was a literal at the call site and scaled with
   * nothing, so putting it in would change what HAIL does at era 2 as a side
   * effect of moving a number into a table.
   *
   * `hail.speed` is not here either and does not need to be: `fire()` scales
   * EVERY round's speed by `CFG.scale` at the muzzle
   * (`projectiles.js`, `const speed = (opts.speed ?? CFG.bolt.speed) *
   * CFG.scale`), so a speed in this table would be scaled twice. An earlier
   * version of this note said `bolt.speed` was unscaled for the same reason
   * and was simply wrong about the mechanism.
   */
  'hail.burst.r',
  // mines: the body, the default blast, and each kind's own reach
  'mines.r', 'mines.blast.r', 'mines.fizzle.r',
  'knell.r', 'knell.blast.r', 'snare.r', 'snare.trigger', 'snare.reach',
  'lode.r', 'lode.reach', 'thorn.r', 'thorn.patch.r',
  'spall.r', 'spall.trigger', 'spall.burst.r', 'void.r', 'void.trigger',
  'wire.r', 'wire.span', 'wire.width',
  // the bar
  'decoy.r', 'decoy.ahead', 'decoy.blast.r',
  'pile.r0', 'pile.r', 'ward.r', 'ward.heaveR', 'prism.r', 'prism.beamLen',
  // the portal and the yard, which are pictures and keep their size on the glass
  'portal.rx', 'portal.ry', 'portal.pad', 'portal.spill',
  'yard.gap', 'yard.tooth', 'yard.clear',
  // The emplacements, for the same reason everything turret-owned is here:
  // they stand on a field 1.54x deeper and have to cover the same fraction of
  // it. `interval`, `slew` and `spread` are NOT scaled -- a cadence and an
  // angular rate are not lengths.
  'gun.r', 'gun.bolt', 'gun.range', 'gun.speed',
  'yard.lotSide', 'yard.lotW', 'yard.lotH',
  'yard.lotAhead', 'yard.lotSpread', 'yard.gunW', 'yard.gunH',
];

function atPath(path) {
  let o = CFG;
  const bits = path.split('.');
  for (let i = 0; i < bits.length - 1; i++) o = o && o[bits[i]];
  return [o, bits[bits.length - 1]];
}

function setPath(path, base, k) {
  const [o, last] = atPath(path);
  if (!o) return;
  o[last] = Array.isArray(base) ? base.map((v) => v * k) : base * k;
}

/**
 * The era-1 value of everything in `SCALED`, captured once at module load
 * before anything can have written over it — so the numbers stay the ones
 * written in the tables above rather than a second copy that can drift.
 */
const BASE = {};
for (const path of SCALED) {
  const [o, last] = atPath(path);
  if (!o) throw new Error(`config: SCALED names "${path}", which is not in CFG`);
  /*
   * ---- and the LEAF, not just the parent object ------------------------
   *
   * This tested `!o` alone until build 275, and `o` is the object the leaf
   * hangs on -- so `yard.lotStep` still passed after `lotStep` was renamed to
   * `lotSpread`, because `CFG.yard` was still there. What happens then is
   * silent and total: `BASE[path]` is `undefined`, `setPath` writes
   * `undefined * scale` -- NaN -- into a key nothing reads, and the value that
   * WAS being scaled every resize simply stops being scaled. The lots kept
   * their era-1 spread at era 2 and nothing in the suite could see it, because
   * every arm about them asserts a floor the unscaled number still clears.
   *
   * A renamed entry is the likely way in, and it is exactly the shape of the
   * `export let` and `[hidden]` traps this repo already carries: a thing set,
   * and silently not applied one layer down. The leaf has to be a number or an
   * array of them -- `typeof undefined` is the whole of the check.
   */
  const v = o[last];
  const ok = Array.isArray(v) ? v.length > 0 && v.every((x) => typeof x === 'number')
    : typeof v === 'number';
  if (!ok) throw new Error(`config: SCALED names "${path}", which is ${JSON.stringify(v)} `
    + 'rather than a number -- a renamed or deleted entry stops being scaled silently');
  BASE[path] = Array.isArray(v) ? [...v] : v;
}

/**
 * How an object crosses the field. Every one picks a route at spawn, so two
 * lurchers released together take visibly different paths to the same turret.
 * `width` is the lateral offset in world units at long range; it decays as the
 * object closes, so every route still converges.
 */
export const ROUTES = [
  { id: 'direct', weight: 26, width: 0, weave: 0, commit: 1 },
  { id: 'sweep', weight: 20, width: 300, weave: 0, commit: 0.55 },
  { id: 'wide', weight: 14, width: 480, weave: 0, commit: 0.35 },
  { id: 'serpentine', weight: 16, width: 250, weave: 0.55, commit: 0.7 },
  { id: 'hook', weight: 14, width: 420, weave: 0, commit: 1.9 },
  { id: 'loiter', weight: 10, width: 180, weave: 0.25, commit: 0.5, dawdle: 0.55 },
];

/** Body mass from density and radius (area-proportional). */
export const massOf = (type, r = type.r) => type.density * r * r * 0.006;
