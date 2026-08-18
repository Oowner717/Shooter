// Guards the one build literal that still has to be duplicated.
//
// src/config.js is the source of truth: main.js registers the worker as
// './sw.js?b=<BUILD>' and the worker derives its cache name from that. The
// only remaining copy is the inline escape hatch in index.html, which runs
// before any module can load and so cannot import anything.
//
// Run: node scripts/check-build.mjs
import { readFileSync, readdirSync } from 'node:fs';

const grab = (file, re) => {
  const m = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(re);
  if (!m) throw new Error(`no build literal found in ${file}`);
  return m[1];
};

const config = grab('src/config.js', /export const BUILD = '([^']+)'/);
const html = grab('index.html', /var BUILD = '([^']+)'/);

if (config !== html) {
  console.error(`build mismatch: src/config.js=${config} index.html=${html}`);
  process.exit(1);
}
console.log(`build ${config} consistent`);

// The worker's precache list is hand-written, so a new module can be shipped
// without being reachable offline. src/arsenal.js was added in build 21 and
// missed this list; the fetch handler would have papered over it for anyone
// who had already loaded the page online, and left a fresh install broken on
// a plane. Cheap to check, so it is checked.
const src = readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.js'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const missing = src.filter((f) => !sw.includes(`'./src/${f}'`));
if (missing.length) {
  console.error(`sw.js precache is missing: ${missing.map((f) => `src/${f}`).join(', ')}`);
  process.exit(1);
}
console.log(`sw.js precaches all ${src.length} modules`);
