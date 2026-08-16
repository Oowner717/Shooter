// Central tuning table. Everything balance-related lives here so the game can
// be re-tuned without touching behaviour code.

export const CFG = {
  // ---- run structure -------------------------------------------------
  killGoal: 500, // objects destroyed before the gate seals
  storyEvery: 50, // one story line per this many kills (10 lines total)

  // ---- camera ---------------------------------------------------------
  // World units per screen pixel. Below 1 the arena is drawn zoomed out, so
  // the field is physically larger than the display and objects read smaller
  // and further away. All game logic works in world units.
  zoom: 0.76,

  // ---- frame / quality ------------------------------------------------
  maxDpr: 2,
  fixedStep: 1 / 120, // physics substep
  maxSubsteps: 4,
  maxFrameDelta: 0.1, // clamp huge tab-switch deltas

  // ---- population -----------------------------------------------------
  maxEnemies: 44,
  maxDebris: 64,
  maxParticles: 620,
  popStart: 13,
  popEnd: 30, // population target ramps between these over the run
  popRampKills: 320,
  spawnInterval: [1.05, 0.52], // seconds between spawn attempts, start -> end
  formationChance: 0.42,

  // ---- shooter --------------------------------------------------------
  shooter: {
    r: 26,
    standoff: 168, // world units between the turret and the ability strip
    holdFireInterval: 0.2, // sustained-fire cadence; tapping faster is always allowed
    aimClamp: 1.36, // radians away from straight up that the barrel allows
    turnRate: 26, // rad/s barrel slew

    // The lever. A rod runs through the turret's pivot: the grip hangs below
    // it, the barrel sticks out above it, and pushing one swings the other
    // the opposite way. Holding the grip fires on its own.
    gripLen: 104, // world units from pivot to grip
    gripFireInterval: 0.2,
    gripReturn: 6.5, // rad/s spring back to neutral on release
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
    r: 108,
    approach: 13, // px/s of self-propulsion
    pushPerBolt: 5.6,
    contactGlitch: 2.6,
    jamInterval: 0.4, // forced delay between shots while JAM is up
    powerInterval: [13, 9.5], // seconds between powers, phase 1 -> phase 3
    spawnInterval: 7.5,
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
    debris: 2,
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
    debris: 1,
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
    debris: 4,
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
    debris: 2,
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
    debris: 3,
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
    debris: 7,
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
    debris: 3,
    shards: 3, // orbiting plates that eat incoming bolts
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
    debris: 2,
    reflect: 0.55, // glancing bolts bounce off instead of landing
  },
];

export const TYPE_BY_ID = Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, t]));

/** Body mass from density and radius (area-proportional). */
export const massOf = (type, r = type.r) => type.density * r * r * 0.006;
