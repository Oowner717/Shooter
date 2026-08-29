/*
 * The single-file build.
 *
 * The game ships as ES modules loaded by the browser and has no build step;
 * this is not one. It exists because two places want the whole thing as one
 * file — the Artifact viewer, and a phone's home screen — and neither can be
 * handed a directory. Same source, no transpiling, no renaming, no minifying:
 * each module is wrapped in its own scope behind a six-line registry and they
 * are evaluated in dependency order.
 *
 * It lived in /tmp for twenty builds, which meant it died with every container
 * and was rewritten from memory each time. That is why it is here now.
 *
 *   node scripts/bundle.mjs            -> writes both forms to a temp dir
 *   node scripts/bundle.mjs --out DIR  -> ...or wherever you say
 *
 * Two forms come out:
 *
 *   sim7749.html             the body only. The Artifact host supplies the
 *                            doctype, head and body around it.
 *   sim7749-standalone.html  a whole document, with the manifest and icons
 *                            inlined, for hosting anywhere. This is the one
 *                            that can go borderless, because here the <head>
 *                            is ours.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const outFlag = process.argv.indexOf('--out');
const OUT = outFlag > -1 && process.argv[outFlag + 1]
  ? path.resolve(process.argv[outFlag + 1])
  : path.join(tmpdir(), 'sim7749-build');
mkdirSync(OUT, { recursive: true });

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// ---------------------------------------------------------------- bundling

const SRC = path.join(ROOT, 'src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.js'));
const mods = new Map();
for (const f of files) mods.set(`./${f}`, readFileSync(path.join(SRC, f), 'utf8'));

const IMPORT = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;?[ \t]*$/gm;
/*
 * `import './terminus.js';` -- imported for its side effects alone. The seven
 * boss modules arrive this way: nothing is bound, they simply have to run.
 *
 * It was not in the dependency graph either, so the modules that exist only to
 * register themselves were ordered by luck as well as being left as bare
 * `import` statements in a classic script. See the guard at the bottom.
 */
const SIDE_IMPORT = /^[ \t]*import\s*'([^']+)'\s*;?[ \t]*$/gm;

const deps = new Map();
for (const [k, src] of mods) {
  const d = new Set();
  for (const m of src.matchAll(IMPORT)) if (mods.has(m[2])) d.add(m[2]);
  for (const m of src.matchAll(SIDE_IMPORT)) if (mods.has(m[1])) d.add(m[1]);
  deps.set(k, [...d]);
}
const order = [];
const mark = new Map();
const visit = (k) => {
  if (mark.get(k)) return;
  mark.set(k, 1);
  for (const d of deps.get(k) || []) visit(d);
  order.push(k);
};
for (const k of mods.keys()) visit(k);

/** Counter for generated re-export bindings; see the rule inside wrap(). */
let reexports = 0;

/** One module -> one function body with its own scope and an exports object. */
function wrap(key, src) {
  const exported = [];
  let out = src;

  /*
   * Imports become destructuring off the registry. `import { a, b as c }`
   * becomes `const { a, b: c }`: destructuring renames with a colon, not with
   * `as`, and getting that wrong produces a syntax error half a megabyte in.
   */
  out = out.replace(IMPORT, (m, names, from) => {
    const bound = names.split(',').map((n) => {
      const t = n.trim();
      if (!t) return '';
      const mm = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      return mm ? `${mm[1]}: ${mm[2]}` : t;
    }).filter(Boolean).join(', ');
    return `const {${bound}} = __req(${JSON.stringify(from)});`;
  });

  // `import './m.js';` -- run it, bind nothing. The seven boss modules are
  // pulled in this way and were being left verbatim.
  out = out.replace(SIDE_IMPORT, (m, from) => `__req(${JSON.stringify(from)});`);

  /*
   * `export { a, b as c } from './m.js';` -- a re-export.
   *
   * MUST come before the plain `export { ... }` rule below, whose pattern
   * requires the line to end at the brace and so leaves this one untouched --
   * a bare `export` in a script that is no longer a module, which is a syntax
   * error that takes the whole bundle with it. upgrades.js has re-exported
   * BOSS_TONE since build 127 and every single-file build from 127 to 180
   * booted to a dead page because of this one line. The guard at the bottom of
   * this file exists so that can never be true again.
   *
   * The module is pulled in under a generated name rather than destructured,
   * because the same file frequently imports the same binding under another
   * name a line later -- upgrades.js takes BOSS_TONE as TONES -- and two const
   * declarations of one name is the next syntax error along.
   */
  out = out.replace(
    /^[ \t]*export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2\s*;?[ \t]*$/gm,
    (m, names, q, from) => {
      const tmp = `__rx${reexports++}`;
      for (const n of names.split(',')) {
        const t = n.trim().split(/\s+as\s+/);
        if (!t[0]) continue;
        exported.push([(t[1] || t[0]).trim(), `${tmp}.${t[0].trim()}`]);
      }
      return `const ${tmp} = __req(${JSON.stringify(from)});`;
    },
  );

  // `export { a, b };`
  out = out.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (m, names) => {
    for (const n of names.split(',')) {
      const t = n.trim().split(/\s+as\s+/);
      if (t[0]) exported.push([(t[1] || t[0]).trim(), t[0].trim()]);
    }
    return '';
  });

  // `export const/let/var/function/class NAME`
  out = out.replace(/^([ \t]*)export\s+(const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm,
    (m, ws, kind, name) => { exported.push([name, name]); return `${ws}${kind} ${name}`; });

  const tail = exported.map(([as, local]) => `  __ex[${JSON.stringify(as)}] = ${local};`).join('\n');
  return `__def(${JSON.stringify(key)}, function (__ex, __req) {\n${out}\n${tail}\n});`;
}

const parts = order.map((k) => {
  let src = mods.get(k);
  /*
   * The single-file build ships no sw.js, so registering one only produces a
   * 404 in the console. The guard is flipped off rather than the block
   * deleted, so this stays a one-line difference from the real source — and
   * it is why the single-file build is never pinned by a service worker and
   * has to look after its own updating. See the updater below.
   */
  if (k === './main.js') src = src.replace("if ('serviceWorker' in navigator) {", 'if (false) {');
  return wrap(k, src);
});

const runtime = `
/* SIMULATION 7749 — single-file build.
 * The game normally ships as ES modules loaded by the browser. This wraps each
 * one in its own scope behind a tiny registry so the whole thing is one file:
 * same source, no bundler, no renaming, and no chance of two modules' private
 * names colliding. Evaluated in dependency order (the graph is acyclic), so
 * every import is resolved before the module that wants it runs.
 */
(function () {
  var __defs = {}, __cache = {};
  function __def(k, fn) { __defs[k] = fn; }
  function __req(k) {
    if (__cache[k]) return __cache[k];
    var ex = __cache[k] = {};
    var fn = __defs[k];
    if (!fn) throw new Error('missing module ' + k);
    fn(ex, __req);
    return ex;
  }
`;
const boot = `
  ${order.map((k) => `__req(${JSON.stringify(k)});`).join('\n  ')}
})();
`;
const js = runtime + parts.join('\n\n') + boot;

// ------------------------------------------------------------------- page

let html = read('index.html');
const css = read('styles.css');

// body only: the Artifact host supplies doctype/head/body around the file.
const body = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
let inner = body.replace(/^<body[^>]*>/, '');
// the module script goes; the bundle replaces it
inner = inner.replace(/<script type="module"[^>]*><\/script>/, '');

const head = html.slice(0, html.indexOf('<body'));
const title = (head.match(/<title>([^<]*)<\/title>/) || [, 'SIMULATION 7749'])[1];
const viewport = (head.match(/<meta name="viewport"[^>]*>/) || [''])[0];

const cfg = read('src/config.js');
const rev = (cfg.match(/REV = '([^']+)'/) || [, '?'])[1];
const build = (cfg.match(/BUILD = '([^']+)'/) || [, '?'])[1];

const dataURI = (p) => `data:image/png;base64,${readFileSync(path.join(ROOT, p)).toString('base64')}`;
const ICON192 = dataURI('icons/icon-192.png');
const ICON512 = dataURI('icons/icon-512.png');
const TOUCH = dataURI('icons/apple-touch-icon.png');

/*
 * Borderless. iOS reads these from the <head> of the top-level document, so
 * they only do anything when this file *is* the document — self-hosted, or on
 * Pages. Inside the Artifact viewer the page is framed by claude.ai's own
 * document and these sit inertly in its body; that is why the Artifact link
 * can never lose Safari's chrome.
 *
 * The manifest is inlined as a data: URI so the single file installs as a real
 * standalone app on its own, with no sibling files to serve alongside it.
 */
const manifest = {
  name: 'SIMULATION 7749',
  short_name: 'SIM 7749',
  description: 'A physics shooter. The shallow end of something.',
  start_url: './',
  scope: './',
  display: 'standalone',
  display_override: ['fullscreen', 'standalone'],
  orientation: 'portrait',
  background_color: '#04050a',
  theme_color: '#04050a',
  icons: [
    { src: ICON192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: ICON512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
const MANIFEST_URI = `data:application/manifest+json;base64,${
  Buffer.from(JSON.stringify(manifest)).toString('base64')}`;

/*
 * The stamp the updater below reads, kept in the first few hundred bytes of
 * the document on purpose: it means a check costs a range request rather than
 * a re-download of the whole half-megabyte file.
 */
const stamp = `<meta name="sim7749-rev" content="${rev}">
<meta name="sim7749-build" content="${build}">`;

const shell = `<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SIM 7749">
<meta name="theme-color" content="#04050a">
<meta name="color-scheme" content="dark">`;

/*
 * The icons are ~0.9 MB of base64 and only the standalone form can use them —
 * inside the Artifact viewer nothing reads them, so that form does not carry
 * the weight.
 */
const art = `<link rel="apple-touch-icon" href="${TOUCH}">
<link rel="icon" type="image/png" href="${ICON192}">
<link rel="manifest" href="${MANIFEST_URI}">`;

/*
 * Self-update.
 *
 * An iOS home-screen web app caches the document indefinitely and there is no
 * header this page can send to stop it — a republish to the same URL simply
 * does not arrive. So the page asks: one fetch of itself with a cache-buster,
 * a look at the stamp in the reply, and one reload if it differs.
 *
 * It used to ask *once*, guarded by `sessionStorage['sim7749-checked'] === REV`
 * — which reads as "once per launch" and is not: a home-screen app's session
 * survives backgrounding for days, so an install that is never evicted checks
 * on its very first cold start and then never again. That is exactly how a
 * phone sat on build 113 while the server had 114, and why the builds that
 * *did* arrive were the ones where iOS had happened to evict the app.
 *
 * So it asks again every time the app comes back to the foreground, which is
 * the moment a player would want it to. The loop guard is now on the *target*
 * rather than on the check: it will reload at most once for any given incoming
 * rev, so a reload that somehow lands on the same bytes cannot spin. And the
 * request is a range over the first 2KB, so asking is cheap enough to do on
 * every resume — the stamp is in the head for that reason. A server that
 * ignores Range simply sends the whole file and the check still works.
 */
const updater = `
<script>
(function () {
  var REV = ${JSON.stringify(rev)};
  var KEY = 'sim7749-reload-for';
  var busy = false;
  function look() {
    if (busy) return;
    busy = true;
    var url = location.pathname + (location.search ? location.search + '&' : '?') + 'rev=' + Date.now();
    fetch(url, { cache: 'reload', headers: { Range: 'bytes=0-2047' } })
      .then(function (r) { return r.ok || r.status === 206 ? r.text() : null; })
      .then(function (t) {
        busy = false;
        if (!t) return;
        var m = t.match(/name="sim7749-rev" content="([a-z0-9]+)"/);
        if (!m || m[1] === REV) return;
        try {
          if (sessionStorage.getItem(KEY) === m[1]) return;
          sessionStorage.setItem(KEY, m[1]);
        } catch (e) { /* private mode: no loop guard, but the rev differs once */ }
        location.reload();
      })
      .catch(function () { busy = false; });
  }
  look();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') look();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) look(); });
})();
</script>`;

const headBits = `<title>${title}</title>
${stamp}
${viewport}
${shell}`;

/*
 * `preboot` lives on the root element in index.html, and the bundle keeps only
 * the body — so the single-file build has to put it on itself. First thing in
 * the document, before the inlined stylesheet, so the overlay is held back
 * from the first paint here too: one file still means the browser parses half
 * a megabyte of CSS, paints, and only then reaches the script that builds the
 * interface. Hud takes the class off, exactly as it does in the repo build.
 */
const guts = `<script>document.documentElement.classList.add('preboot');</script>
<style>
${css}
</style>
${inner}
${updater}
<script>
${js}
</script>
`;

// 1. Artifact form — no doctype/html/head of its own; the host supplies them.
const framed = `${headBits}\n${guts}`;
const framedPath = path.join(OUT, 'sim7749.html');
writeFileSync(framedPath, framed);

// 2. Standalone form — a whole document, for hosting anywhere.
const whole = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${headBits}
${art}
</head>
<body>
${guts}</body>
</html>
`;
const wholePath = path.join(OUT, 'sim7749-standalone.html');
writeFileSync(wholePath, whole);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`bundled ${order.length} modules, entry ${order[order.length - 1]}`);
console.log(`build ${build}  rev ${rev}`);
console.log(`  ${framedPath}  ${mb(framed.length)}`);
console.log(`  ${wholePath}  ${mb(whole.length)}`);
/*
 * The stamp has to be inside the range the updater asks for, or every check
 * silently reads no stamp and no device ever updates again. Guarded here
 * rather than assumed: it is two lines of head today and one careless
 * insertion from being on the wrong side of 2KB.
 */
const RANGE = 2048;
const at = [['artifact', framed.indexOf('sim7749-rev')], ['standalone', whole.indexOf('sim7749-rev')]];
const late = at.filter(([, i]) => i < 0 || i > RANGE - 64);
if (late.length) {
  console.error(`rev stamp out of range in the ${late.map(([n]) => n).join(' and ')} form `
    + `(${late.map(([, i]) => i).join(', ')} against a ${RANGE}-byte check) — `
    + 'the updater would never see it and nothing would ever update');
  process.exit(1);
}
console.log(`  rev stamp at byte ${at.map(([n, i]) => `${i} (${n})`).join(', ')}, `
  + `inside the ${RANGE}-byte check`);

/*
 * ---- nothing module-shaped survives into a script ----
 *
 * The whole job of wrap() is turning modules into plain script, and it does it
 * with a handful of regexes -- one per export form it has been taught. A form
 * it has NOT been taught passes through verbatim, and a bare `export` or
 * `import` in a classic script is a SyntaxError that kills the entire bundle
 * on load. There is no partial failure: the page boots to its title screen and
 * nothing else ever runs.
 *
 * That is not hypothetical. `export { BOSS_TONE } from './anomaly.js';` went
 * into upgrades.js in build 127 and every single-file build from 127 to 180
 * shipped dead -- the artifact and every home-screen install -- because
 * nothing here ever read its own output. Fifty-three builds.
 *
 * So the output is parsed rather than trusted. Cheap, total, and it fails the
 * build instead of the player's page.
 */
const leftovers = [];
for (const [name, text] of [['artifact', framed], ['standalone', whole]]) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/^[ \t]*(export|import)[\s{*]/.test(line)) leftovers.push(`${name}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
if (leftovers.length) {
  console.error(`${leftovers.length} module statement(s) survived into the bundle. `
    + 'A bare export or import in a classic script is a SyntaxError and the whole '
    + 'page dies on load — teach wrap() the form rather than shipping this:');
  for (const l of leftovers.slice(0, 8)) console.error(`  ${l}`);
  process.exit(1);
}
console.log('  no module statements left in either form');

/*
 * ---- and no export whose VALUE is expected to change ----
 *
 * The guard above catches a form wrap() cannot parse. This one catches a form
 * it parses perfectly and still gets wrong, which is worse, because the bundle
 * builds clean and boots clean and is simply a different game.
 *
 * Each module gets its own scope and an exports object filled ONCE, at the end
 * of the module body (`__ex.NAME = NAME`), and each importer DESTRUCTURES that
 * object. Both halves are snapshots. In a real ES module `export let X` is a
 * live binding -- reassign it in the exporter and every importer sees the new
 * value -- and here nobody ever sees anything but the value it had at load.
 *
 * Build 199 tried exactly that: a stroke floor recomputed per device on every
 * resize. Measured, the module build halved it from dpr 1 to dpr 2 and the
 * bundle did not move it at all -- so the fix worked when served and was inert
 * in the artifact and in every home-screen install, with a green suite either
 * way, because the suite runs against the modules.
 *
 * `export const` and `export function` are fine: nothing reassigns them. A
 * value that has to change belongs on an object that does not -- CFG.hairline
 * is the one this rule was written for. Reads through a snapshotted object
 * reference are live in both builds.
 */
const mutable = [];
for (const [name, src] of mods) {
  src.split('\n').forEach((line, i) => {
    const m = line.match(/^[ \t]*export\s+(let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m) mutable.push(`${name}:${i + 1}  export ${m[1]} ${m[2]}`);
  });
}
if (mutable.length) {
  console.error(`${mutable.length} reassignable export(s). wrap() snapshots exports at `
    + 'module end and importers destructure them, so a value that changes after load '
    + 'changes only in the served build — the bundle keeps the value it started with. '
    + 'Put it on an object (CFG) and read through that instead:');
  for (const l of mutable.slice(0, 8)) console.error(`  ${l}`);
  process.exit(1);
}
console.log('  no reassignable exports (a bundled `export let` is a snapshot)');
