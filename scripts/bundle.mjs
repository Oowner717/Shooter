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

const deps = new Map();
for (const [k, src] of mods) {
  const d = new Set();
  for (const m of src.matchAll(IMPORT)) if (mods.has(m[2])) d.add(m[2]);
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
