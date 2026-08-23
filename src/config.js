// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

/** Shown on the title screen and in the debug stats. Must match BUILD in sw.js. */
export const BUILD = '118';

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
export const REV = 'beccd67';

export const CFG = {
  // ---- run structure -------------------------------------------------
  killGoal: 500, // objects destroyed before the last one arrives
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
   * before EBB or an aura will touch it.
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

  // ---- frame / quality ------------------------------------------------
  maxDpr: 2,
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
    rest: [2.2, 3.8], // quiet between two regular waves
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
    // A wave is authored at its opening size and swells over the run, so the
    // same six-MOTE wave that is a gentle problem at kill 20 is fourteen of
    // them by the end. Without this the field peaked at nine objects and the
    // late run was thinner than the early one — waves bound the population by
    // construction, which is most of why they work and all of why they need
    // this. Tutorial waves never swell; they are authored at the size they
    // are meant to be.
    swell: [1, 2.4],
    swellKills: 320,
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
     * How far auto aim will reach for a target, in world units, before ARRAY.
     *
     * It used to have no limit at all: `autoTarget` walked every live object
     * in the cone and took the nearest, so the assist covered the whole field
     * corner to corner. At 390x844 the turret sits at y=996 of a 1361-unit
     * world and objects go live at y=260, which puts the far corner 800 units
     * away — auto aim held all of it, and the only thing that ever changed
     * about it was how fast the barrel got there.
     *
     * 400 is the near half: a little past the middle of the live field
     * straight up, and about two thirds of the way out to the top corners.
     * Anything further in is yours to shoot by hand until ARRAY is bought,
     * and two levels of it (x1.45 each) come to 841 — the whole field again,
     * with the corner inside it.
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
      // DOUBLE TAP / TRIPLE TAP. The follow-up rounds leave with the first
      // and wait at the muzzle, so they read as one trigger pull with a
      // stutter in it rather than as a faster cadence.
      tapGap: 0.06,
      tapFade: 0.6,
    },
    explosive: {
      rate: 2.1, // less than half the cadence
      speed: 1040, // and slower in the air
      damage: 15,
      blast: { r: 96, damage: 44, impulse: 420 },
      // CLUSTER. The burst throws four smaller ones outward, so HE stops
      // being a circle and becomes a patch of overlapping circles.
      cluster: { n: 4, out: 78, scale: 0.5 },
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
    // range, which is the one thing neither HE nor SHOT does.
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
      damage: 20,
      pierce: 3, // bodies it goes through after the first
      fade: 0.78, // and what it keeps of its damage each time
    },
    /*
     * SLUG. One slow, heavy round with an enormous shove behind it.
     *
     * It used to do almost no damage on purpose: the damage was supposed to
     * come from what you shoved it into. That is the one thing it is no longer
     * allowed to do — a body a SLUG has just hit does no collision damage to
     * anything it is driven through, and takes none from it, for `calm`
     * seconds. Everything else on the field still trades damage on impact;
     * only what a SLUG threw is exempt.
     *
     * That left it paying a 2.4x rate penalty for a shove and nothing else, so
     * it now hits hardest of anything per shot — 44, against SPINE's 20 and
     * BOLT's 26 — while staying under BOLT on sustained damage.
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
      patch: { r: 92, life: 4.5, dps: 46 },
    },
    /*
     * TITHE. It barely hurts on the first hit, and that is the point: every
     * hit on the same body deepens the mark, and a deeper mark takes more from
     * this round and pays more when it goes. Left on a single large thing it
     * ramps into real damage without ever changing ammunition, which is what a
     * long fight against one body needs.
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
    hp: 900,
    r: 24,
    ahead: 300, // world units up-field from the turret
    blast: { r: 260, damage: 150, impulse: 900 }, // what it leaves behind
  },

  // ---- chorus ---------------------------------------------------------
  // Your own wreckage, thrown back. Everything loose on the floor is dragged
  // in and fired out as a volley, so the more mess there is the harder it
  // hits — and a field you have just cleared has nothing to give.
  // CHORUS. Everything on the field is tied to everything else for a while,
  // and whatever kills one of them is felt by all the rest. On a thin field it
  // is a modest tick of damage; on a crowded one, one good shot takes the
  // whole thing apart in a cascade that runs on its own.
  chorus: {
    life: 6, // seconds the binding holds
    maxBound: 40,
    // The echo is self-amplifying: every death it causes echoes in turn, so
    // this number has a cliff in it. A third of full health took a maximum
    // field from 44 down to 4 — a bigger clear than anything else in the bar.
    // A fifth killed one thing, because the echo off a 20hp NEEDLE cannot kill
    // another NEEDLE and the chain never starts.
    //
    // The real fix was not a number. An echo that reaches every bound body at
    // once scales as the square of the crowd, so it is all or nothing: either
    // the first echo is too small to kill anything and the chain never starts,
    // or it kills the weakest and the field ends. So an echo only reaches the
    // few nearest instead, and CHORUS became a chain that travels — it runs as
    // far as the crowd is packed and stalls where it thins out, which is a
    // thing the player can arrange with WELL, with SNARE, or with the shot.
    //
    // Even as a chain it needed bounding: three seeds per death is a branching
    // process above one, so a packed field either fizzled at two kills or ran
    // the whole crowd. The echo now weakens by `falloff` at every hop and the
    // whole binding pays out at most `hops` of them, which makes it reliably a
    // handful and occasionally a lot, rather than two or forty.
    spread: 3, // survivors each death reaches, nearest first
    falloff: 0.62, // and each hop out from the first death lands softer
    hops: 10, // total echoes one binding will ever pay
    floor: 26, // always at least this, which is a MOTE and change
    share: 0.22, // ...plus this much of the dead one's full health
    cap: 62,
    link: 620, // and no echo jumps further than this
    reach: 1400, // effectively the whole field, but not the staged rows above it
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
    patch: { r: 104, dps: 34 },
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
    damage: 26,
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

  // ---- allocation boosts ------------------------------------------------
  // The small tier. Everything here is tempo: it changes the next minute and
  // nothing after it.
  boosts: {
    // CORONA. A burning shell on the turret. Replaced SHAKE OFF, which was a
    // dead card whenever nothing was attached — this one is worth taking
    // before the crowd arrives as well as after.
    corona: { seconds: 30, dps: 70, r: 150 },
    // SCOUR. The whole floor at once, and paid over the odds for it.
    scour: { bonus: 1.5 },
    // EBB. Everything hostile thrown back up the field. Velocity is set rather
    // than added, so a BULWARK goes as far as a MOTE — the point is that the
    // field is cleared off you, not that heavy things resist it.
    // `coast` is the window in which a thrown body does not steer. Without it
    // the throw was fought on the very next frame and a BULWARK travelled 95
    // units to a MOTE's 248 — which is the opposite of the point.
    ebb: { speed: 620, spread: 120, coast: 0.8 },
    // OVERDRAW. The next N shots leave as three. Counted in shots, not
    // seconds, so a slow round gets the same number of them as a fast one.
    overdraw: { shots: 12, fan: 0.09 },
  },

  // ---- offers ----------------------------------------------------------
  // Kills are the clock. Neither tier ever interrupts: they queue behind a
  // button and wait as long as it takes, because the point of this game is
  // that you can put it down.
  events: {
    small: 40, // kills between tempo offers — about twelve in a counted run
    // The first one comes early, so the opening has a real ALLOCATION waiting
    // on the button at the moment it explains what one is.
    smallFirst: 22,
    // Permanent ones. Fourteen things start locked and each AMENDMENT opens at
    // most one, so this is what decides how much of the turret a single run
    // can assemble: at fifty, about ten of the fourteen, and the rest is what
    // the next run is for.
    large: 50,
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
  mines: {
    /*
     * Three numbers govern every kind, and no upgrade may move any of them.
     * They are a contract with the player rather than a balance dial: five on
     * the field, fifteen seconds each, one thrown every fifteen seconds.
     *
     * Note what that arithmetic means. A throw every fifteen seconds and a
     * fifteen-second life is a steady state of one mine, laid as the last one
     * goes — so the cap is a backstop rather than a target, and reaching it
     * takes either a SEED offer, which lays three at once, or PAIRED CHARGE,
     * which lays more per throw without touching any of the three.
     */
    cap: 5,
    life: 15,
    throwEvery: 15, // one clock for every kind, not one each
    flight: 0.85, // seconds from turret to landing site
    arm: 0.4, // settling time before it can trigger
    r: 13,
    trigger: 26, // extra reach beyond the mine's own radius
    // Nerfed in build 49 from 140; SHRAPNEL is the way back past it.
    blast: { r: 168, damage: 95, impulse: 760 },
    fizzle: { r: 96, damage: 44, impulse: 300 }, // SALTED: what a spent one does
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
    reach: 210,
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
    damage: 72, // per second of contact, per body — was 105; see HOT WIRE
    shove: 150, // pushed off the line rather than held on it
  },

  // ---- knells ----------------------------------------------------------
  // The fourth kind. It does not wait to be touched — it counts, and then it
  // goes off three times where it lies, each wider and weaker than the last.
  // A blast mine punishes what walks into it; this one denies the ground.
  knell: {
    flight: 0.9,
    arm: 0.8,
    r: 13,
    tolls: 2, // was 3; FOURTH BELL buys the third back and a fourth beyond it
    gap: 1.15, // seconds between them
    blast: { r: 118, damage: 74, impulse: 430 },
    grow: 0.5, // each toll this much wider than the one before
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
    // ...and the ceiling for a body that has deliberately been thrown. The
    // ordinary clamp is relative to a body's own cruise, which is right for
    // stopping a chain reaction flinging something to infinity and wrong for
    // EBB: it clamped a BULWARK's throw on the first frame, so the heavy
    // things barely moved and the card read as doing nothing to them.
    thrownSpeed: 720,
    /*
     * How long an accumulated shove takes to bleed off, in seconds. See
     * Enemy.shoveFade() for what this is for and what it measured like
     * without it. Deliberate throws are exempt and use thrownSpeed above.
     */
    kickFade: 1.5,
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
    convergeRebuild: 0.8, // how much of each frame it puts back first
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
    repairCap: 0.45,
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
    endSlow: 0.12, // time scale it slams to
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
    slowFor: 3.6,
    pull: 900, // how hard the infall drags loose bodies
    pay: 900, // energy on the floor when it lets go
    // What it leaves behind. One per ORDINAL, and the only source there is.
    remainder: 1,
    riseFor: 2.1, // seconds the REMAINDER takes to reach the turret
    recast: 1, // REMAINDERs a RECAST costs
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
    shroud: 1.15, // shroud: radians of collar per level
    sight: 8, // sight: mast height per level
    feed: 7, // feed: belt housing depth
    dish: 20, // array: dish aperture, growing with the level
  },

  // ---- feel -----------------------------------------------------------
  glitch: {
    perAttacker: 0.34,
    max: 0.92,
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
export const ENEMY_TYPES = [
  {
    id: 'mote',
    unlock: 0,
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
    unlock: 0,
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
    unlock: 18,
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
    unlock: 45,
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
    unlock: 85,
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
    unlock: 285,
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
    unlock: 205,
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
    unlock: 0,
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
    unlock: 245,
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
    unlock: 0,
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
    unlock: 0,
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
    unlock: 125,
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
    unlock: 330,
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
    unlock: 380,
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
     */
    hurl: { range: 430, wind: 1.15, speed: 620, shock: 0.62, shockFor: 1.8 },
  },
  {
    // The mass on the end of a TOW's cable. Never rolled for on its own.
    id: 'towMass',
    unlock: 0,
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
    unlock: 0,
    name: 'TALLY',
    shape: 'tally',
    r: 15,
    hp: 135,
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
    unlock: 0,
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
    unlock: 0,
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
  {
    id: 'prism',
    unlock: 165,
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
    reflect: 0.55, // glancing bolts bounce off instead of landing
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
  ...ENEMY_TYPES.map((t) => t.r * (1 + CFG.graft.grow * CFG.graft.stack)),
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
  { of: [['mote', 5], ['needle', 3]] },
  { of: [['needle', 5], ['mote', 3]] },
  { of: [['mote', 4], ['needle', 4]] },
  { of: [['lurcher', 3], ['needle', 3]] },
  { of: [['lurcher', 2], ['mote', 4]] },
  { of: [['splitter', 2], ['lurcher', 1], ['mote', 3]] },
  { of: [['splitter', 2], ['needle', 4]] },
  { of: [['bloom', 2], ['mote', 4]] },
  { of: [['bloom', 3], ['lurcher', 2]] },
  // A beacon and the escort it exists to cover: the pairing the type was
  // designed around, and the one that teaches "kill the beacon".
  { of: [['herald', 1], ['lurcher', 3]] },
  { of: [['herald', 2], ['splitter', 2]] },
  { of: [['prism', 3], ['needle', 3]] },
  { of: [['prism', 2], ['bloom', 2]] },
  { of: [['warden', 2], ['mote', 3]] },
  { of: [['warden', 1], ['prism', 2], ['needle', 3]] },
  { of: [['scion', 1], ['bloom', 2]] },
  { of: [['scion', 2], ['lurcher', 2]] },
  // Seeds and something worth landing on. A WARDEN already carries plating;
  // a grafted one is the clearest read there is on what a SEED does.
  { of: [['scion', 1], ['warden', 2], ['needle', 3]] },
  { of: [['bulwark', 1], ['needle', 4]] },
  { of: [['bulwark', 2], ['herald', 1]] },
  { of: [['glut', 3], ['mote', 4]] },
  { of: [['glut', 2], ['splitter', 2]] },
  // A TOW is two bodies -- the head and the MASS on its cable -- so these are
  // heavier than they read. Never more than one pair alongside anything else.
  { of: [['tow', 2], ['needle', 3]] },
  { of: [['tow', 1], ['bulwark', 1], ['mote', 4]] },
  { of: [['tow', 1], ['prism', 2], ['needle', 3]] },

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
  { of: [], drift: 22, dwell: 8 },
];

export const TYPE_BY_ID = Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, t]));

/**
 * Minimum stroke width in world units that still resolves to a clean line on
 * screen once the camera scale is applied. Outlines should thin out as the
 * camera pulls back, but not below roughly one device pixel.
 */
export const HAIRLINE = 1.25 / CFG.zoom;

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
