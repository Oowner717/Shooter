/*
 * The seven ways in.
 *
 * ORDINAL was built as *the* boss: one aperture count, one constructor called
 * by name, a gauge that read ORDINAL's own config and assumed two frames, a
 * hand table of magentas for the bar, and its name written into the alerts.
 * Six more are planned, one per ANOMALY colour, and every one of those
 * assumptions is a place a second boss would have had to be special-cased.
 *
 * This is the table they all come out of. It holds no behaviour -- a boss is
 * a module, and it registers its constructor here on load -- only the facts
 * every surface needs to know about a boss it has never heard of: what it is
 * called, what colour it is, which upgrade sells the way in, and what its
 * sky and its gauge look like in that colour.
 *
 * The colour is the identity. A boss's core, structure and minions, its slot
 * in the tree, its banner, its bar, the hole it comes out of and the sky it
 * brings with it are all one hue, so a player who has seen amber once knows
 * what is arriving before it has finished arriving.
 *
 * Nothing here imports a boss. `boss.js` imports this, defines ORDINAL and
 * calls `registerAnomaly(1, ...)` at the bottom; `gnomon.js` will do the same
 * with 2. That way round there is no cycle, and a boss module is the only
 * place that knows how to build its own boss.
 */

/**
 * The seven, in order.
 *
 * `key` is the upgrade that sells the way in -- the tree owns the price and
 * the gating, this owns the identity. `cfg` names the CFG block the fight's
 * numbers live in, and `types` the enemy ids
 * that only ever come through this way in -- which is how the build check
 * knows they are not simply missing from the wave table. `built` is the
 * honest part: six of these are planned and
 * not written, and everything that lists bosses has to be able to tell the
 * difference without guessing from whether a constructor turned up.
 */
export const ANOMALIES = [
  { n: 1, key: 'aperture', name: 'ORDINAL', tone: '#ff5ec8', cfg: 'ordinal', built: true,
    types: ['ordinal', 'tally', 'digit'] },
  { n: 2, key: 'aperture2', name: 'GNOMON', tone: '#ff8a3d', cfg: 'gnomon', built: true,
    types: ['gnomon', 'dial', 'second'] },
  { n: 3, key: 'aperture3', name: 'FRACTAL', tone: '#8bff4d', cfg: 'fractal', built: true,
    types: ['fractal', 'fraction', 'mite'] },
  { n: 4, key: 'aperture4', name: 'AMPLITUDE', tone: '#2ee6c0', cfg: 'amplitude', built: true,
    types: ['amplitude', 'crest', 'droplet'] },
  { n: 5, key: 'aperture5', name: 'DYNAMO', tone: '#4d8dff', cfg: 'dynamo', built: true,
    types: ['dynamo', 'pylon', 'ion'] },
  { n: 6, key: 'aperture6', name: 'PARITY', tone: '#a86bff', cfg: 'parity', built: true,
    types: ['parity', 'pane', 'echo'] },
  { n: 7, key: 'aperture7', name: 'TERMINUS', tone: '#ff4d6d', cfg: 'terminus', built: true,
    types: ['terminus', 'bound', 'limit'] },
];

export const ANOMALY_BY_N = new Map(ANOMALIES.map((a) => [a.n, a]));
export const ANOMALY_BY_KEY = new Map(ANOMALIES.map((a) => [a.key, a]));

/**
 * Just the colours, in order. The tree paints ANOMALY's heading with all
 * seven at once, which is the one place in the game that says how many of
 * these there are going to be -- and it is the same list, not a copy of it.
 */
export const BOSS_TONE = ANOMALIES.map((a) => a.tone);

/** One of them, by number. */
export function anomalyOf(n) {
  return ANOMALY_BY_N.get(n) || null;
}

/** What a boss is called, for a surface that only has its number. */
export function nameOf(n) {
  const a = anomalyOf(n);
  return a ? a.name : 'ANOMALY';
}

// ----------------------------------------------------------- constructors

const MAKERS = new Map();

/**
 * A boss module saying "this is how you build me". Called once, at module
 * load, from the bottom of the module that defines the class.
 */
export function registerAnomaly(n, make) {
  MAKERS.set(n, make);
}

/** ...and the way back out. Null for one that is planned but not written. */
export function makerOf(n) {
  return MAKERS.get(n) || null;
}

// ---------------------------------------------------------------- colour

/*
 * Small hex/HSL pair, local because this is the only thing in the game that
 * needs to move a colour round the wheel rather than mix two of them.
 */
function toHsl(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function toHex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const at = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(at(h + 1 / 3))}${to(at(h))}${to(at(h - 1 / 3))}`;
}

/** Hue of a hex, as a turn (0..1). */
const hueOf = (hex) => toHsl(hex)[0];

/**
 * Rotate one colour by the distance between two hues, keeping everything
 * else about it. This is how a sky authored in magenta is worn in amber: the
 * lightness curve and the saturation are the design and stay put; only where
 * it sits on the wheel changes.
 */
function rotate(hex, turn) {
  const [h, s, l] = toHsl(hex);
  // A near-grey has no hue worth turning, and turning it invents one.
  if (s < 0.06) return hex;
  return toHex(h + turn, s, l);
}

/**
 * The gauge's colour per stage: arriving, then I to IV.
 *
 * It follows the sky -- see the moods below -- so the bar is hotter by the
 * end rather than one colour for two hundred seconds. Each entry is the
 * track's colour and the lit companion that goes on top of it.
 *
 * ORDINAL does not use this: its entry carries the table that was authored
 * by hand for it, and this is what the other six get. That is deliberate --
 * a generator that had to reproduce a hand-authored ramp exactly would be a
 * generator fitted to one boss.
 */
export function barRamp(tone) {
  const [h, s, l] = toHsl(tone);
  /*
   * Hotter is brighter and more saturated, and stays where it is on the
   * wheel. The first version of this escalated by turning the hue -- which
   * is what ORDINAL's hand table does, magenta walking toward red -- and
   * that is only safe when nothing else owns red.
   *
   * Something else does. Generated with a hue walk, every boss ended its
   * fight wearing the next one's identity: amber finished on crimson,
   * teal on green, violet on blue, crimson on magenta, and DYNAMO's blue
   * finished on the cyan the whole interface is drawn in. The colour is the
   * identity, so the colour is the one thing a stage may not change.
   */
  const step = [
    [s * 0.58, l * 0.7], // arriving: drained, and darker
    [s, l],
    [Math.min(1, s * 1.08), Math.min(0.78, l * 1.06)],
    [Math.min(1, s * 1.16), Math.min(0.82, l * 1.12)],
    [Math.min(1, s * 1.22), Math.min(0.86, l * 1.2)], // IV: nearly white-hot
  ];
  return step.map(([ss, ll]) => [
    toHex(h, ss, ll),
    toHex(h, Math.min(1, ss * 0.72), Math.min(0.94, ll + 0.3)),
  ]);
}

/*
 * The four skies a fight brings with it, authored in ORDINAL's magenta.
 *
 * I  the ground goes out from under the blue and a violet comes up through
 *    it; II is hotter and closer; III is nearly white at the horizon, which
 *    is what a thing about to come apart looks like; IV has come down off the
 *    top of the field and the sky has come with it -- no ground left, the
 *    horizon lit from underneath.
 *
 * Every other boss wears these rotated onto its own hue, which keeps the
 * escalation -- the part that was actually designed -- and changes only the
 * colour. Where that reads badly the anomaly carries its own `moods` instead;
 * two of the planned six already know they will need to.
 */
export const ORDINAL_MOODS = [
  { top: '#0a0410', mid: '#2a0a33', low: '#050109', line: '#a03fb0', neb: ['#4d0a5c', '#2e0a4a', '#3d0630'], accent: '#ff8ae0' },
  { top: '#12031a', mid: '#48083f', low: '#08010c', line: '#d64ab0', neb: ['#7a0a5c', '#4d0a5c', '#5c0630'], accent: '#ff6ad5' },
  { top: '#1c0320', mid: '#6b0a4a', low: '#0d0110', line: '#ff5ec8', neb: ['#a80c66', '#7a0a5c', '#8c0640'], accent: '#ffc2f0' },
  { top: '#2e0526', mid: '#9c0f55', low: '#1a0214', line: '#ff9ee0', neb: ['#d41a72', '#a80c66', '#c0106a'], accent: '#ffffff' },
];

const ORDINAL_HUE = hueOf('#ff5ec8');

/** ORDINAL's four skies, worn in another colour. */
export function bossMoods(tone) {
  const turn = hueOf(tone) - ORDINAL_HUE;
  return ORDINAL_MOODS.map((m) => ({
    top: rotate(m.top, turn),
    mid: rotate(m.mid, turn),
    low: rotate(m.low, turn),
    line: rotate(m.line, turn),
    neb: m.neb.map((c) => rotate(c, turn)),
    accent: rotate(m.accent, turn),
  }));
}

/**
 * Everything a surface needs to dress itself for one boss, worked out once.
 *
 * An anomaly may carry `bar` or `moods` of its own and they win; otherwise
 * they are generated from the tone. ORDINAL carries both, because its were
 * authored before there was anything to generate them from and reproducing
 * them by formula is not worth pretending to.
 */
const DRESS = new Map();
export function dressOf(n) {
  if (DRESS.has(n)) return DRESS.get(n);
  const a = anomalyOf(n);
  const tone = a ? a.tone : '#ff5ec8';
  const d = {
    n,
    name: a ? a.name : 'ANOMALY',
    tone,
    bar: (a && a.bar) || barRamp(tone),
    // The hotter, deeper companion to the tone: what the banner and the
    // arrival glow with. A tone at full saturation and a little darker.
    glow: (a && a.glow) || (() => {
      const [h, , l] = toHsl(tone);
      return toHex(h - 0.02, 1, Math.max(0.34, l * 0.86));
    })(),
    moods: (a && a.moods) || bossMoods(tone),
  };
  DRESS.set(n, d);
  return d;
}

/*
 * ORDINAL's own, as authored. See barRamp and ORDINAL_MOODS above for why
 * these are written down rather than derived.
 */
ANOMALY_BY_N.get(1).bar = [
  ['#a03fb0', '#e6a8ff'], // arriving
  ['#ff5ec8', '#ffb8ee'], // I
  ['#ff3fb0', '#ffc2f0'], // II
  ['#ff2f8f', '#ffd0e6'], // III
  ['#ff5470', '#ffe0e6'], // IV — it is coming down
];
ANOMALY_BY_N.get(1).moods = ORDINAL_MOODS;
ANOMALY_BY_N.get(1).glow = '#ff2f9e';

// ------------------------------------------------------------- the purse

/**
 * How many ways in to boss `n` are held right now.
 *
 * `world.apertures` is the one store, indexed by anomaly number.
 * `world.aperture` is boss I's slot in it under its old name -- see the
 * accessor in Game.newWorld(), which is what keeps the save format, the
 * upgrade's apply and every existing test reading the same integer rather
 * than a second copy of it.
 */
export function heldOf(world, n) {
  const a = world.apertures;
  return a ? (a[n] | 0) : 0;
}

/** Every way in currently held, in anomaly order. What the banner lists. */
export function heldList(world) {
  const out = [];
  for (const a of ANOMALIES) {
    const held = heldOf(world, a.n);
    if (held > 0) out.push({ n: a.n, name: a.name, tone: a.tone, held, glow: dressOf(a.n).glow });
  }
  return out;
}
