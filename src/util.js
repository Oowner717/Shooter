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
