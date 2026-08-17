// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

/** Shown on the title screen and in the debug stats. Must match BUILD in sw.js. */
export const BUILD = '16';

export const CFG = {
  // ---- run structure -------------------------------------------------
  killGoal: 500, // objects destroyed before the gate seals
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
  // Loadouts are mutually exclusive. Each buys its effect with rate of fire.
  rounds: {
    standard: { label: 'STD', rate: 1 },
    explosive: {
      label: 'HE',
      rate: 2.1, // less than half the cadence
      speed: 1040, // and slower in the air
      damage: 15,
      blast: { r: 96, damage: 44, impulse: 420 },
    },
    shotgun: {
      label: 'SHOT',
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
      label: 'ARC',
      rate: 1.35,
      speed: 1180,
      damage: 11, // the first hit is the weakest part of it
      jumps: 4,
      jumpRange: 210,
      jumpDamage: 25,
      falloff: 0.86, // each link a little weaker than the last
    },
    // Sinks in and keeps working. Nothing happens on impact, so it is wasted
    // on a mote — it is for the things that take a while: bulwarks, the gate,
    // ORDINAL itself.
    barb: {
      label: 'BARB',
      rate: 2.4, // the slowest thing in the rack
      speed: 900,
      damage: 6,
      tick: 0.28, // seconds between bites
      tickDamage: 20,
      duration: 4.2,
      maxPer: 4, // barbs one body will hold
    },
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

  // ---- projectiles ----------------------------------------------------
  bolt: {
    speed: 1520,
    r: 4.2,
    damage: 26,
    impulse: 90,
    life: 2.2,
    bounces: 1, // ricochets off the arena side walls
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

  // ---- gate -----------------------------------------------------------
  gate: {
    hp: 5200,
    closeTime: 1.6,
  },

  // ---- boss -----------------------------------------------------------
  boss: {
    hp: 16000,
    r: 130,
    approach: 13, // px/s of self-propulsion
    pushPerBolt: 5.6,
    contactGlitch: 2.6,
    jamInterval: 0.4, // forced delay between shots while JAM is up
    powerInterval: [13, 9.5], // seconds between powers, phase 1 -> phase 3

    // It keeps its distance. Closing all the way to the turret made the fight
    // about a shape sitting on top of the barrel; it now stops with a clear
    // gap and applies pressure by looming instead. The field between the wall
    // and the turret is only about 520 units deep, so the standoff has to
    // leave real travel in it — too large and it is pinned to the wall and
    // the loom never lifts.
    standoff: 150, // clear gap it will not close: ~124 units of open space
    loom: 90, // this near its floor, its presence rewrites the feed
    loomInterval: 5.2,

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
