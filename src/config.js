// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

/** Shown on the title screen and in the debug stats. Must match BUILD in sw.js. */
export const BUILD = '35';

export const CFG = {
  // ---- run structure -------------------------------------------------
  killGoal: 500, // objects destroyed before the last one arrives
  // Seconds of empty field at the start of a run, and again after the last
  // object falls, before the next thing happens. The field starts with nothing
  // in it: the first beat is the interface, not a reaction.
  openingGrace: 15,
  lull: 4.5, // the pause between the five hundredth kill and the arrival
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
  maxEnemies: 44,
  maxDebris: 128,
  maxDrift: 10, // aimless, harmless bodies alive at once
  maxParticles: 620,
  popStart: 13,
  popEnd: 30, // population target ramps between these over the run
  popRampKills: 320,
  spawnInterval: [1.05, 0.52], // seconds between spawn attempts, start -> end
  formationChance: 0.42,

  // ---- shooter --------------------------------------------------------
  shooter: {
    r: 26,
    standoff: 210, // world units between the turret and the ability strip
    holdFireInterval: 0.2, // sustained-fire cadence; tapping faster is always allowed
    aimClamp: 1.36, // radians away from straight up that the barrel allows
    turnRate: 26, // rad/s barrel slew under your own hand
    autoTurnRate: 4.2, // rad/s while auto aim traverses between targets

    // The lever. A rod runs through the turret's pivot: the grip hangs below
    // it, the barrel sticks out above it, and pushing one swings the other
    // the opposite way. Holding the grip fires on its own.
    gripLen: 112, // world units from pivot to grip
    gripR: 24, // grip knob radius
    gripFireInterval: 0.2,
    autoFireInterval: 0.22, // hands-off cadence; a shade behind driving it yourself
  },

  // ---- rounds ---------------------------------------------------------
  // Mutually exclusive; each buys its effect with rate of fire. Names, marks
  // and descriptions live in src/arsenal.js — this table is behaviour only.
  rounds: {
    standard: { rate: 1 },
    explosive: {
      rate: 2.1, // less than half the cadence
      speed: 1040, // and slower in the air
      damage: 15,
      blast: { r: 96, damage: 44, impulse: 420 },
    },
    shotgun: {
      rate: 1.55,
      pellets: 5,
      spread: 0.3,
      speed: [1120, 1420],
      damage: 12,
      life: 0.5,
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
    recur: {
      rate: 1.9,
      speed: 1240,
      damage: 18,
      repeats: 3, // times it happens again after the first hit
      hold: 0.11, // seconds it waits at the impact point before going on
      falloff: 0.8, // each recurrence a little weaker
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

  // ---- siphon ---------------------------------------------------------
  // Your own wreckage, thrown back. Everything loose on the floor is dragged
  // in and fired out as a volley, so the more mess there is the harder it
  // hits — and a field you have just cleared has nothing to give.
  siphon: {
    gather: 0.5, // seconds of hauling before it fires
    maxTake: 40,
    reach: 900,
    spread: 0.5, // radians of the outgoing fan — a jet, not a shrug
    speed: [1180, 1600],
    damagePer: 21,
    minShots: 6, // it always finds something to throw
  },

  // ---- offers ----------------------------------------------------------
  // Kills are the clock. Neither tier ever interrupts: they queue behind a
  // button and wait as long as it takes, because the point of this game is
  // that you can put it down.
  events: {
    small: 40, // kills between tempo offers — about twelve in a counted run
    large: 125, // kills between permanent ones — four in a counted run
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
    interval: 4.6, // seconds between throws while armed
    max: 5,
    flight: 0.85, // seconds from turret to landing site
    arm: 0.4, // settling time before it can trigger
    life: 26,
    r: 13,
    trigger: 26, // extra reach beyond the mine's own radius
    blast: { r: 168, damage: 140, impulse: 760 },
  },

  // ---- snares ---------------------------------------------------------
  // The other kind of mine. It does not go off: it opens, hauls everything
  // near it into one pinned knot, and holds. No damage of its own — the
  // damage is the objects grinding against each other, and whatever you
  // choose to put into the pile while it cannot move.
  snare: {
    interval: 7.4, // slower to lay than a blast mine
    max: 3,
    flight: 0.9,
    arm: 0.6, // takes longer to settle
    life: 30,
    r: 14,
    trigger: 34, // a wider mouth, because it wants a crowd
    hold: 3.6, // seconds it keeps hold once it opens
    reach: 210,
    pull: 300, // inward speed it drives what it catches
  },

  // ---- wires -----------------------------------------------------------
  // The third kind, and the only one that is not a point. It lands, unspools a
  // taut line to either side of itself, and everything that crosses the line
  // is cut for as long as it stays on it. Nothing triggers it and nothing
  // consumes it: it is a lane closed for as long as it lasts.
  wire: {
    interval: 8.6,
    max: 2,
    flight: 0.95,
    arm: 0.5,
    life: 22,
    r: 11,
    span: 150, // half-length of the line, world units
    open: 0.55, // seconds to unspool once it has settled
    width: 8, // contact half-width
    damage: 105, // per second of contact, per body
    shove: 150, // pushed off the line rather than held on it
  },

  // ---- knells ----------------------------------------------------------
  // The fourth kind. It does not wait to be touched — it counts, and then it
  // goes off three times where it lies, each wider and weaker than the last.
  // A blast mine punishes what walks into it; this one denies the ground.
  knell: {
    interval: 9.4,
    max: 2,
    flight: 0.9,
    arm: 0.8,
    life: 20,
    r: 13,
    tolls: 3,
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
  salvage: {
    // A whole object's worth, from its mass, split across the fragments it
    // leaves. Taken from the parent rather than the chip: a chip's own mass is
    // small enough that every fragment in the game rounded to the same 1.
    perMass: 3.6,
    minValue: 1,
    drift: 6, // flat, for the harmless ones — income the tally never sees
    intake: 190, // world units; anything this close is banked
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
    maxSpeedFactor: 6, // hard clamp relative to a body's own cruise speed
    collisionDamage: 0.42, // damage per unit of (impact speed * reduced mass)
    collisionThreshold: 62, // impact speed below this is a harmless bump
  },


  // ---- boss -----------------------------------------------------------
  boss: {
    hp: 16000,
    r: 130,
    // Only ever used to close a gap the player opened, so it can be brisk
    // without ever becoming a creep.
    approach: 22,
    // A bolt has to be able to shift it. At the old 5.6 three seconds of
    // sustained fire moved it 28 units against a 110-unit band, which is the
    // "cannot push it away fast enough" this model exists to fix.
    pushPerBolt: 14,
    contactGlitch: 2.6,
    jamInterval: 0.4, // forced delay between shots while JAM is up
    powerInterval: [13, 9.5], // seconds between powers, phase 1 -> phase 3

    // It does not advance. It holds a station and returns to it — the only
    // reason it ever moves toward the turret is to close a gap the player
    // opened by shooting it. It can never be nearer than `hold`, so the fight
    // is never about a shape sitting on the barrel, and there is no creep to
    // out-race.
    // Centre to centre; ~254 units of open space at its closest, against the
    // 124 the old creep-to-the-barrel model ended at.
    //
    // These three numbers have to fit inside the field. The top edge stops its
    // centre at about 232 and the turret sits at about 706, so the whole
    // range it can occupy is roughly 474 units — a station of 360 leaves ~107
    // units of travel, and a band wider than that would be one it could never
    // push out of, which is the trap this is here to avoid. At 360 the gap
    // from its hull to the turret's is about 204 units.
    hold: 360,
    // Push it further than this and its presence stops rewriting the feed.
    // Let it settle back onto station and the corruption resumes on a timer,
    // so the pressure is "keep it off you", not "it is arriving regardless".
    pushBand: 30,
    loomInterval: 7,

    // The flow of objects is held right back at the start of the fight, so
    // the opening is the player and ORDINAL and nothing else, then thickens.
    spawnInterval: 7.5,
    firstSpawn: 24, // seconds after it arrives before the first emission
    earlySpawnScale: 1.75, // interval multiplier at aspect 1, easing to 1 by aspect 3

    // The ledger. ORDINAL walks in wearing the player's five hundred. While
    // it holds them they absorb damage for it, so the opening is armoured and
    // the fight accelerates as the count comes back — no timing, no window,
    // just a number that is worth attacking. Everything it spends is armour
    // it no longer has, and every hit takes some back.
    ledger: {
      armour: 0.76, // damage reduction at a full ledger; none at an empty one
      reclaimPerDamage: 0.12, // count returned per point of damage that lands
      power: 18,
      emit: 5,
      reprise: 34,
      echo: 55,
      tithe: 46, // taken BACK off the player when it can afford nothing else
      titheAbove: 0.62, // only below this fraction of the original count
      spentApproach: 2.4, // it stops conserving once there is nothing left
      spentPowerScale: 0.5,
    },

    // Taking a button away. It cannot damage the player, so it removes
    // options instead — the spec the whole boss is built on.
    subtract: 11,

    // Kills coming apart backwards: debris on the field flies together and
    // becomes whole objects again.
    reprise: { objects: [3, 6], gather: 1.2, reach: 640, perObject: 7 },

    // A copy of your own turret, firing back. Its rounds cannot hurt you —
    // they corrupt the feed and knock the barrel — and they can be shot down.
    echo: {
      life: 26, // it now outlives its welcome unless you deal with it
      hp: 460, // and it can be dealt with: destroy the copy
      bodyR: 26, // hit radius, matching the player's own turret
      interval: 1.45,
      speed: 300,
      r: 9,
      intercept: 17,
      glitch: 1.5,
      knock: 0.42, // radians the barrel is thrown by a hit
    },
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
// -----------------------------------------------------------------------
export const ENEMY_TYPES = [
  {
    id: 'mote',
    unlock: 0, // kills before this type enters the rotation
    name: 'MOTE',
    shape: 'shard',
    r: 12,
    hp: 24,
    density: 0.85,
    speed: 56,
    accel: 190,
    restitution: 0.78,
    wobble: 2.1,
    color: '#7ef9ff',
    glow: '#00d4ff',
    weight: 22,
    debris: 4,
  },
  {
    id: 'needle',
    unlock: 0, // kills before this type enters the rotation
    name: 'NEEDLE',
    shape: 'needle',
    r: 10,
    hp: 20,
    density: 0.7,
    speed: 104, // the quick one
    accel: 330,
    restitution: 0.5,
    wobble: 0.8,
    color: '#ffd166',
    glow: '#ff9f1c',
    weight: 14,
    debris: 2,
  },
  {
    id: 'lurcher',
    unlock: 0, // kills before this type enters the rotation
    name: 'LURCHER',
    shape: 'hex',
    r: 24,
    hp: 98,
    density: 1.35,
    speed: 38,
    accel: 120,
    restitution: 0.52,
    wobble: 2.6,
    lurch: true,
    color: '#b98cff',
    glow: '#8b5cf6',
    weight: 20,
    debris: 8,
  },
  {
    id: 'splitter',
    unlock: 25, // kills before this type enters the rotation
    name: 'SPLITTER',
    shape: 'blob',
    r: 29,
    hp: 84,
    density: 1.0,
    speed: 46,
    accel: 150,
    restitution: 0.86,
    wobble: 1.8,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 12,
    debris: 4,
    splits: { type: 'mote', count: 4 },
  },
  {
    id: 'bloom',
    unlock: 55, // kills before this type enters the rotation
    name: 'BLOOM',
    shape: 'bloom',
    r: 33,
    hp: 132,
    density: 1.05,
    speed: 33,
    accel: 110,
    restitution: 0.62,
    wobble: 1.4,
    color: '#ff5d8f',
    glow: '#ff2d6f',
    weight: 10,
    debris: 6,
    detonate: { radius: 132, damage: 96 },
  },
  {
    id: 'bulwark',
    unlock: 145, // kills before this type enters the rotation
    name: 'BULWARK',
    shape: 'plated',
    r: 45,
    hp: 360,
    density: 2.7,
    speed: 23,
    accel: 90,
    restitution: 0.32,
    wobble: 0.9,
    armor: 0.34, // flat damage reduction
    color: '#9fb3c8',
    glow: '#5f7fa6',
    weight: 8,
    debris: 14,
  },
  {
    id: 'warden',
    unlock: 115, // kills before this type enters the rotation
    name: 'WARDEN',
    shape: 'warden',
    r: 22,
    hp: 118,
    density: 1.15,
    speed: 41,
    accel: 140,
    restitution: 0.66,
    wobble: 1.6,
    color: '#ff9f1c',
    glow: '#ff6b00',
    weight: 8,
    debris: 6,
    shards: 3, // orbiting plates that eat incoming bolts
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
    hp: 30,
    density: 0.55,
    speed: 34,
    accel: 95,
    restitution: 0.92,
    wobble: 0,
    color: '#8fa9c4',
    glow: '#4f6f92',
    weight: 0, // never chosen by the ordinary spawn roll
    debris: 2,
  },
  {
    // Hardens everything near it while it lives, and shows you exactly what it
    // is doing: threads out to whatever it is covering, and a shell on each of
    // them. Shoot the beacon, not the escort.
    id: 'herald',
    unlock: 70,
    name: 'HERALD',
    shape: 'herald',
    r: 19,
    hp: 76,
    density: 0.8,
    speed: 44,
    accel: 150,
    restitution: 0.62,
    wobble: 1.2,
    color: '#7cffb2',
    glow: '#22d37a',
    weight: 9,
    debris: 4,
    ward: { radius: 240, reduction: 0.62, max: 5 },
  },
  {
    // Eats the mess. Every fragment it touches makes it bigger, heavier and
    // harder, so a littered field is its food supply — kill it early or clear
    // the floor. It is the only object whose threat you control.
    id: 'glut',
    unlock: 175,
    name: 'GLUT',
    shape: 'glut',
    r: 16,
    hp: 90,
    density: 1.1,
    speed: 30,
    accel: 105,
    restitution: 0.44,
    wobble: 1.6,
    color: '#ffd166',
    glow: '#e07a00',
    weight: 9,
    debris: 6,
    eat: { reach: 26, growth: 3.1, hpPer: 26, maxR: 52 },
  },
  {
    // A head towing a heavy mass on a cable. The pair swings across the field
    // and shoves everything it catches; both halves are real bodies and both
    // count, so a TOW is two of the five hundred.
    id: 'tow',
    unlock: 210,
    name: 'TOW',
    shape: 'tow',
    r: 18,
    hp: 104,
    density: 0.8,
    speed: 52,
    accel: 175,
    restitution: 0.6,
    wobble: 1.1,
    color: '#9fb3c8',
    glow: '#59e0ff',
    weight: 8,
    debris: 5,
    tows: { type: 'towMass', length: 132 },
  },
  {
    // The mass on the end of a TOW's cable. Never rolled for on its own.
    id: 'towMass',
    unlock: 0,
    name: 'MASS',
    shape: 'mass',
    r: 27,
    hp: 150,
    density: 2.4,
    speed: 26,
    accel: 60,
    restitution: 0.36,
    wobble: 0.5,
    armor: 0.2,
    color: '#c8d6e5',
    glow: '#7f9bb5',
    weight: 0,
    debris: 8,
  },
  {
    id: 'prism',
    unlock: 85, // kills before this type enters the rotation
    name: 'PRISM',
    shape: 'prism',
    r: 20,
    hp: 68,
    density: 0.9,
    speed: 50,
    accel: 170,
    restitution: 0.96,
    wobble: 2.2,
    color: '#e0aaff',
    glow: '#c77dff',
    weight: 6,
    debris: 4,
    reflect: 0.55, // glancing bolts bounce off instead of landing
  },
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
