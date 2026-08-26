// Small math / helper kit. No dependencies.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => (min + Math.random() * (max - min + 1)) | 0;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Random inside [-a, a]. */
export const spread = (a) => (Math.random() * 2 - 1) * a;

export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Weighted pick. `items` need a numeric `weight`. */
export function weightedPick(items) {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Shortest signed delta between two angles. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Closest point on segment AB to circle centre C, returned as the squared
 * distance plus the parametric position. Used for swept projectile hits.
 */
export function segClosest(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-9 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = ax + dx * t;
  const py = ay + dy * t;
  const ex = cx - px;
  const ey = cy - py;
  return { t, d2: ex * ex + ey * ey, px, py };
}

/** rgba() string from a #rrggbb hex plus alpha. Cached — called a lot. */
const _rgbaCache = new Map();
export function rgba(hex, a) {
  const key = hex + '|' + a;
  let out = _rgbaCache.get(key);
  if (out) return out;
  const n = parseInt(hex.slice(1), 16);
  out = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  if (_rgbaCache.size < 4096) _rgbaCache.set(key, out);
  return out;
}

/** Mix two #rrggbb hex colours. */
export function mixHex(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((na >> 16) & 255, (nb >> 16) & 255, t));
  const g = Math.round(lerp((na >> 8) & 255, (nb >> 8) & 255, t));
  const bl = Math.round(lerp(na & 255, nb & 255, t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Offscreen canvas helper (plain canvas — widest iOS support). */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Pre-rendered additive glow sprite. One 128px texture, tinted on draw via a
 * per-colour cache — far cheaper than shadowBlur, which murders iOS framerates.
 */
const _glowCache = new Map();
export function glowSprite(color) {
  let c = _glowCache.get(color);
  if (c) return c;
  const S = 128;
  c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.22, rgba(color, 0.55));
  grad.addColorStop(0.55, rgba(color, 0.12));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _glowCache.set(color, c);
  return c;
}

/** Draw a centred glow of the given radius. */
export function drawGlow(ctx, color, x, y, r, alpha = 1) {
  const s = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/**
 * An inline SVG mark, sized by whatever is drawing it and inheriting its
 * colour. Three files were each carrying their own copy of this — two of them
 * byte-identical — which is three places for a stroke width to drift.
 */
export const svgMark = (body, w = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/**
 * Deterministic noise for lightning, in -1..1.
 *
 * Not `Math.random`. The draw runs off the same stream the simulation does, so
 * a bolt that rerolled from it would also reroll the fight -- the seeded run in
 * `fight.mjs --hash` stops reproducing the moment anything is drawn. Hashed off
 * the point index, a per-bolt seed and a STEPPED clock: stepped because
 * lightning crackles rather than undulates, and a smooth function of time is a
 * wobble.
 */
export function jag(i, seed, tick) {
  const x = Math.sin(i * 127.1 + seed * 311.7 + tick * 74.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * The points of one bolt, jagged in proportion to how far it has to go.
 *
 * Both numbers were constants in the two places this used to live -- seven
 * segments and nine units of offset in DYNAMO's, one quadratic kink in the ARC
 * round's. Fixed, they are fine over a link between two pylons at a hundred and
 * ninety units and are a straight line over a nine-hundred-unit curtain: seven
 * segments of a hundred and twenty-eight units each, deviating by four degrees.
 *
 * So the segment count and the amplitude both scale with the span, and the
 * offset is two octaves rather than one: a long swing down the length with a
 * per-point jag on top of it. One octave of anything smooth is a rope; the
 * second octave is what makes it lightning. Points are displaced ALONG the run
 * as well as across it, which is the difference between lightning and a zigzag
 * -- evenly spaced points with only a sideways offset give every segment the
 * same length and the same cadence.
 */
export function boltPath(ax, ay, bx, by, seed, tick, amp = 1) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const n = clamp(Math.round(len / 26), 5, 30);
  const wide = clamp(len * 0.075, 6, 40) * amp;
  const pts = [ax, ay];
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const swing = jag(i, seed, tick) * 0.7 + jag(i * 4.3, seed + 9, tick) * 0.3;
    // Pinned at both ends, widest in the middle: a bolt starts and finishes
    // where it was aimed and does what it likes in between.
    const j = swing * wide * Math.sin(k * Math.PI) ** 0.55;
    const along = jag(i * 2.9, seed + 4, tick) * 0.42 / n;
    pts.push(ax + dx * (k + along) + px * j, ay + dy * (k + along) + py * j);
  }
  pts.push(bx, by);
  return pts;
}

/**
 * ...and one bolt, drawn: three passes down the same path, and forks.
 *
 * The three passes -- a wide haze, a body, a thin white core -- are what make a
 * stroke look hot rather than drawn, and they are why nothing needs to lay a
 * straight gradient over the top of its own jagged line. That straight band was
 * most of what the eye read.
 *
 * The forks are what say electricity. A line from one point to another and
 * nowhere else reads as a wire however jagged it is; these come off the middle
 * of the run, go a fraction of the way, and end in the air.
 */
export function drawBolt(ctx, ax, ay, bx, by, opts = {}) {
  const glow = opts.glow || '#7fb0ff';
  const hot = opts.hot || '#dceaff';
  const bright = opts.bright !== false;
  const alpha = opts.alpha ?? 1;
  const w = opts.width || 1;
  const seed = opts.seed || 0;
  const tick = opts.tick || 0;
  const pts = boltPath(ax, ay, bx, by, seed, tick, opts.amp);
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  const cap = ctx.lineCap;
  const join = ctx.lineJoin;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(glow, (bright ? 0.2 : 0.15) * alpha);
  ctx.lineWidth = (bright ? 11 : 6) * w;
  trace();
  ctx.strokeStyle = rgba(bright ? hot : glow, (bright ? 0.55 : 0.42) * alpha);
  ctx.lineWidth = (bright ? 4 : 2.2) * w;
  trace();
  ctx.strokeStyle = rgba('#ffffff', (bright ? 0.9 : 0.5) * alpha);
  ctx.lineWidth = (bright ? 1.6 : 1) * w;
  trace();

  const forks = opts.forks ?? (bright ? 2 : 0);
  for (let f = 0; f < forks; f++) {
    const at = 0.3 + jag(f * 17 + 3, seed, tick) * 0.12 + f * 0.22;
    const i = Math.max(2, Math.min(pts.length - 4, Math.round((pts.length / 2) * at) * 2));
    const fx = pts[i];
    const fy = pts[i + 1];
    const a = Math.atan2(by - ay, bx - ax)
      + (jag(f * 5 + 1, seed + 3, tick) > 0 ? 1 : -1)
      * (0.5 + Math.abs(jag(f * 11, seed + 7, tick)) * 0.5);
    const run = Math.hypot(bx - ax, by - ay)
      * (0.16 + Math.abs(jag(f, seed + 2, tick)) * 0.2);
    drawBolt(ctx, fx, fy, fx + Math.cos(a) * run, fy + Math.sin(a) * run, {
      glow, hot, bright: false, alpha: alpha * 0.8, width: w * 0.7,
      seed: seed + 31 + f * 13, tick, forks: 0,
    });
  }
  ctx.lineCap = cap;
  ctx.lineJoin = join;
}
