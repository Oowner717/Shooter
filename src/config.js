// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

/** Shown on the title screen and in the debug stats. Must match BUILD in sw.js. */
export const BUILD = '231';

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
export const REV = 'e14a6b9';

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
  // World units per screen pixel. Below 1 the arena is drawn zoomed out, so
  // the field is physically larger than the display and objects read smaller
  // and further away. All game logic works in world units.
  zoom: 0.62,

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
  maxDrift: 10, // aimless, harmless bodies alive at once
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
    rest: [2.6, 4.2], // quiet between two regular waves, before `press.restPer`
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
    press: { open: 1.45, close: 0.6, restPer: 0.18, restCap: 2.6 },
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
      // Which band a tier draws from. Tier 1-2 is band 1, 3-4 band 2, and so
      // on: two tiers per band, so a band is met and then met again heavier
      // before anything new arrives.
      perBand: 2,
      pop: 0.1, // authored count x (1 + pop*n)
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
      hpStep: 1.085,
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
      bountyStep: 1.075, // energy x bountyStep^(tier-1), against hpStep 1.085
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
       * The ceiling on population growth. The field caps at CFG.maxEnemies
       * anyway, so past this the climb is carried by health and bounty alone
       * -- which is where plan B wants the wall to form.
       */
      popCap: 3,
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
       */
      gates: [6, 12, 18, 24, 30, 36, 42],
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
    // The next wave is allowed in once the field has thinned to a quarter of
    // what this one let out, floored at `clearTo`. Proportional rather than
    // fixed, or a fourteen-object wave would sit at the end of its patience
    // every time while a three-object one cleared instantly.
    thinFrac: 0.25,
    // Three or more of one type in a regular wave arrive together in formation
    // rather than filing in. Tutorial waves never do — they always file in.
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
  // taken back when the ball goes -- so `grow`, `tough` and `regen` below are
  // shares added per ball, not the multipliers they used to be.
  graft: {
    cap: 2, // SCIONs on the field at once
    apart: 320, // world units the second is kept from the first
    seeds: 3, // thrown when one is destroyed
    spread: 190, // how hard they are thrown clear before they start hunting
    life: 13, // seconds a seed has to find a host
    hunt: 480, // ...and how far it will look

    // ---- per ball, and all of it comes off with the ball ----
    stack: 3, // most that can ride one host
    grow: 0.2, // + this share of the host's own radius
    tough: 0.6, // + this share of its own health, and of its energy
    regen: 9, // health it closes per second
    hp: 26, // what the ball itself takes to shoot off
    orbit: 1.45, // where it rides, as a multiple of the host's radius
    ball: 9, // its radius
    spin: 0.9, // radians per second the ring turns
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
     * How the grey objects come down.
     *
     * Not a band. Builds 78 tried holding them in one a quarter of the way
     * down, pulled back from both sides, and a two-sided pull is a wall
     * however softly it is written — they could not get past it, and the
     * bottom two thirds of the field had no grey in it at all.
     *
     * It is a taper instead. The descent is quick at the top and eases off
     * with depth, and `crawl` is the fraction of it that never goes away: a
     * drift is always still coming down, just less and less urgently the
     * lower it gets. Nothing stops it, nothing sends it back, and it will
     * reach the turret eventually if it is left alone.
     */
    fall: 300, // downward speed at the very top of the screen
    taper: 420, // world units over which that eases off
    crawl: 0.05, // ...and what is always left of it, however deep
    sink: 0.95, // how much of the wander the descent overrules at full urge
  },

  // ---- shooter --------------------------------------------------------
  shooter: {
    r: 26,
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
   * Every mine that does damage was raised 10% in build 216: BLAST 95 -> 105,
   * SALTED's fizzle 44 -> 48, THORN's ground 34 -> 37/s, KNELL's toll 74 ->
   * 81, WIRE 72 -> 79/s, SPALL's pellet 26 -> 29. VOID, SNARE and LODE are
   * untouched because none of them has a damage number: VOID deletes, SNARE
   * holds, LODE pushes.
   */
  mines: {
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

  energy: {
    // How far PULSE reaches to take energy in. Its blast is 340; this is a
    // little wider, because a shockwave that damages a body ought to be able
    // to pull in the energy sitting just past it.
    pulse: 400,
    // A whole object's worth, from its mass, split across the motes it
    // leaves. Taken from the parent rather than the chip: a chip's own mass is
    // small enough that every fragment in the game rounded to the same 1.
    perMass: 3.6,
    minValue: 1,

    drift: 6, // flat, for the harmless ones — income the tally never sees
    // No collection radius. Build 59 took it out: wreckage drifts the whole
    // way in and lands on the turret, and banking it means destroying it --
    // unless INTAKE has been taken, which collects anything that touches.
    pull: 26, // units per second a fragment drifts turret-ward on its own
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
    cost: 100, // APERTURE, flat, always available
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
    pay: 900, // energy on the floor when it lets go
    recast: 1, // REMAINDERs a RECAST costs
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
    cost: 140,
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
    pay: 900,
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
    cost: 190,
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
    pay: 900,
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
    cost: 250,
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
    pay: 900,
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
    cost: 320,
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
    pay: 900,
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
    cost: 400,
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
    pay: 900,
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
    cost: 500,
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
    pay: 1400,
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
   * What the TURRET branch bolts on. Every node in it is a part you can see,
   * and its level is how much of that part there is — see Shooter.drawRig().
   * The names in the tree are the parts: FEED, GIMBAL, SIGHT, SPINES, SHROUD,
   * INTAKE.
   */
  rig: {
    flash: 0.9, // seconds the machine flares while a part goes on
    ring: 0.2, // gimbal: each level adds a ring this much further out
    spine: 9, // spines: length of each spike, in world units
    pile: 8, // pile: how far the weight travels in the deck, per level
    feed: 7, // feed: belt housing depth
    dish: 20, // array: dish aperture, growing with the level
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
    wobble: 0.8,
    color: '#ffd166',
    glow: '#ff9f1c',
    weight: 18,
    drops: 2, // energy it leaves when it comes apart
  },
  {
    id: 'lurcher',
    opens: 200,
    name: 'LURCHER',
    shape: 'hex',
    r: 24,
    hp: 185,
    large: true, // released more slowly, and worth more when it lands
    density: 1.35,
    speed: 38,
    accel: 120,
    restitution: 0.52,
    wobble: 2.6,
    lurch: true,
    color: '#b98cff',
    glow: '#8b5cf6',
    weight: 12,
    drops: 8, // energy it leaves when it comes apart
  },
  {
    id: 'splitter',
    opens: 500,
    name: 'SPLITTER',
    shape: 'blob',
    r: 29,
    hp: 159,
    large: true, // released more slowly, and worth more when it lands
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
    opens: 700,
    name: 'BLOOM',
    shape: 'bloom',
    r: 33,
    hp: 247,
    large: true, // released more slowly, and worth more when it lands
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
    opens: 2800,
    name: 'BULWARK',
    shape: 'plated',
    r: 45,
    hp: 676,
    large: true, // released more slowly, and worth more when it lands
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
    opens: 1700,
    name: 'WARDEN',
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
    opens: 2000,
    name: 'SCION',
    shape: 'scion',
    r: 34,
    hp: 390,
    large: true,
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
    harmless: true,
    r: 8,
    hp: 18,
    density: 0.5,
    speed: 150,
    accel: 200,
    restitution: 0.5,
    wobble: 0,
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
  {
    // Hardens everything near it while it lives, and shows you exactly what it
    // is doing: threads out to whatever it is covering, and a shell on each of
    // them. Shoot the beacon, not the escort.
    id: 'herald',
    opens: 1400,
    name: 'HERALD',
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
    opens: 1100,
    name: 'GLUT',
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
    opens: 3400,
    name: 'TOW',
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
    shape: 'mass',
    r: 27,
    hp: 280,
    large: true, // released more slowly, and worth more when it lands
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
    large: true,
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
    large: true,
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
    large: true,
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
    large: true,
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
    large: true,
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
    large: true,
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
    large: true,
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
    opens: 900,
    name: 'PRISM',
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
   * A fixed body still has to fit the guarantee, so it counts at its own
   * size -- the cell must be at least twice the largest thing on the field
   * whether or not that thing can grow.
   */
  ...ENEMY_TYPES.map((t) => (t.fixed ? t.r : t.r * (1 + CFG.graft.grow * CFG.graft.stack))),
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
  { of: [['mote', 5], ['needle', 3]], band: 1 },
  { of: [['needle', 5], ['mote', 3]], band: 1 },
  { of: [['mote', 4], ['needle', 4]], band: 1 },
  { of: [['lurcher', 3], ['needle', 3]], band: 2 },
  { of: [['lurcher', 2], ['mote', 4]], band: 2 },
  { of: [['splitter', 2], ['lurcher', 1], ['mote', 3]], band: 2 },
  { of: [['splitter', 2], ['needle', 4]], band: 2 },
  { of: [['bloom', 2], ['mote', 4]], band: 3 },
  { of: [['bloom', 3], ['lurcher', 2]], band: 3 },
  // A beacon and the escort it exists to cover: the pairing the type was
  // designed around, and the one that teaches "kill the beacon".
  { of: [['herald', 1], ['lurcher', 3]], band: 4 },
  { of: [['herald', 2], ['splitter', 2]], band: 4 },
  { of: [['prism', 3], ['needle', 3]], band: 3 },
  { of: [['prism', 2], ['bloom', 2]], band: 3 },
  { of: [['warden', 2], ['mote', 3]], band: 4 },
  { of: [['warden', 1], ['prism', 2], ['needle', 3]], band: 4 },
  { of: [['scion', 1], ['bloom', 2]], band: 4 },
  { of: [['scion', 2], ['lurcher', 2]], band: 4 },
  // Seeds and something worth landing on. A WARDEN already carries plating;
  // a grafted one is the clearest read there is on what a SEED does.
  { of: [['scion', 1], ['warden', 2], ['needle', 3]], band: 4 },
  { of: [['bulwark', 1], ['needle', 4]], band: 5 },
  { of: [['bulwark', 2], ['herald', 1]], band: 5 },
  { of: [['glut', 3], ['mote', 4]], band: 3 },
  { of: [['glut', 2], ['splitter', 2]], band: 3 },
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
export function setHairline(dpr) {
  CFG.hairline = 1.25 / (Math.max(dpr, 0.1) * CFG.zoom);
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
