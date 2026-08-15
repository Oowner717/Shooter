// Generates the PWA / home-screen icons procedurally (no image dependencies).
// Run: node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The turret's sigil: a sealed gate seen head-on, ringed like the boss. */
function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const R = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / R;
      const dy = (y + 0.5 - c) / R;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);

      // deep field
      let r = 4 + 10 * (1 - clamp(d, 0, 1.6));
      let g = 6 + 18 * (1 - clamp(d, 0, 1.6));
      let b = 14 + 34 * (1 - clamp(d, 0, 1.6));

      // outer tick ring
      const tick = Math.pow(Math.abs(Math.cos(a * 18)), 26);
      const ticks = tick * smooth(0.86, 0.9, d) * smooth(1.06, 1.0, d);
      r += ticks * 255; g += ticks * 214; b += ticks * 138;

      // spokes
      const spoke = Math.pow(Math.max(0, Math.cos(a * 12)), 10)
        * smooth(0.52, 0.62, d) * smooth(0.94, 0.72, d);
      r += spoke * 255; g += spoke * 243; b += spoke * 196;

      // halo ring
      const halo = Math.exp(-((d - 0.66) ** 2) / 0.006);
      r += halo * 255; g += halo * 179; b += halo * 71;

      // iris
      const iris = smooth(0.46, 0.3, d) * (0.6 + 0.4 * Math.pow(Math.abs(Math.cos(a * 30)), 3));
      r += iris * 190; g += iris * 120; b += iris * 255;

      // pupil
      const pupil = smooth(0.2, 0.17, d);
      r *= 1 - pupil * 0.94; g *= 1 - pupil * 0.94; b *= 1 - pupil * 0.9;
      const rim = Math.exp(-((d - 0.19) ** 2) / 0.00035);
      r += rim * 255; g += rim * 250; b += rim * 240;

      const i = (y * size + x) * 4;
      buf[i] = clamp(r, 0, 255);
      buf[i + 1] = clamp(g, 0, 255);
      buf[i + 2] = clamp(b, 0, 255);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  writeFileSync(join(OUT, name), encodePng(size, size, render(size)));
  console.log('wrote', name, size);
}
