/*
 * A contact sheet of everything the tree draws.
 *
 * There are two bodies of upgrade imagery in this game and until build 209
 * neither had ever been looked at side by side.
 *
 *   THE MARKS   a 24x24 SVG per node, authored in the `MARK` table in
 *               src/upgrades.js and reaching the shop through `leaf()`. They
 *               are read in the two seconds before a tap, so what matters is
 *               whether one is distinguishable from its neighbours -- and
 *               neighbours is exactly what a shop grid never shows you all of.
 *
 *   THE RIG     the TURRET branch is not icons. Every one of its eight nodes
 *               is a part of the machine that is actually drawn -- see
 *               `drawMachine` and `RIG_MAX` in src/shooter.js -- so the only
 *               way to see what a node buys is to buy it and look. Eighteen
 *               levels across eight parts, and no screen in the game shows a
 *               part on its own.
 *
 * So: the marks straight out of the modules, grouped by the branch they hang
 * on, and the machine rendered nine times -- bare, each part alone at full
 * levels, and everything.
 *
 *   node scripts/contact.mjs [--out DIR] [--url URL]
 *
 * Needs the static server for the rig half (the marks half is pure node).
 * Writes contact-sheet.html, self-contained: the renders go in as data URIs.
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODES } from '../src/tree.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const OUT = flag('out', join(tmpdir(), 'sim7749-contact'));
const URL = flag('url', 'http://127.0.0.1:8099/index.html');

/** Where a node hangs, as a path of names. '' for the roots. */
const branchOf = (n) => {
  const a = [];
  for (let c = n.parent; c; c = c.parent) a.unshift(c.name || c.id);
  return a.join(' › ');
};

const TURRET = NODES.filter((n) => n.parent && n.parent.name === 'TURRET');

/* ------------------------------- the rig ------------------------------- */

async function renderRig() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME
      || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 20000 });
  await page.evaluate(() => window.__sim.start?.());
  await page.waitForTimeout(400);

  const shots = await page.evaluate((parts) => {
    const g = window.__sim;
    const w = g.world;
    const sh = w.shooter;
    // A still, in a known state. Everything the machine reads that is not the
    // ledger is pinned, so the only difference between two cells is the part.
    const keep = {
      ledger: w.ledger, rig: w.rig, rigAt: w.rigAt, rigFlash: w.rigFlash,
      autoAim: w.autoAim, time: w.time, aim: sh.aim, glow: sh.gripGlow,
      recoil: sh.recoil, attackers: w.attackers,
    };
    w.autoAim = false;         // else the assist's reach arc dwarfs the cell
    w.rigFlash = 0;
    w.time = 4;
    w.attackers = new Set();   // no breach: the accent stays cyan
    sh.aim = -Math.PI / 2;
    sh.gripGlow = 0;
    sh.recoil = 0;

    const S = 300;
    const cell = (ledger) => {
      w.ledger = ledger;
      w.rig = null;
      w.rigAt = -1;
      const c = document.createElement('canvas');
      c.width = S;
      c.height = S;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#080f18';
      ctx.fillRect(0, 0, S, S);
      // Place the turret's own origin at the middle of the cell, scaled so a
      // full rig (r * 1.34, plus the mantlet) still clears the edge.
      const s = (S * 0.17) / sh.r;
      // Down a little: the barrel points up, so the middle of the machine
      // is not the middle of what it draws.
      ctx.setTransform(s, 0, 0, s, S / 2 - sh.x * s, S * 0.56 - sh.y * s);
      sh.drawMachine(ctx, w, '#59e0ff', w.time, false);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return c.toDataURL('image/png');
    };

    const out = [];
    out.push({ id: '', name: 'BARE', levels: 0, png: cell([]) });
    for (const p of parts) {
      out.push({
        ...p,
        png: cell(Array.from({ length: p.levels }, () => p.id)),
      });
    }
    out.push({
      id: '',
      name: 'EVERY SOCKET',
      levels: parts.reduce((a, p) => a + p.levels, 0),
      png: cell(parts.flatMap((p) => Array.from({ length: p.levels }, () => p.id))),
    });

    Object.assign(w, {
      ledger: keep.ledger, rig: keep.rig, rigAt: keep.rigAt,
      rigFlash: keep.rigFlash, autoAim: keep.autoAim, time: keep.time,
      attackers: keep.attackers,
    });
    sh.aim = keep.aim;
    sh.gripGlow = keep.glow;
    sh.recoil = keep.recoil;
    return out;
  }, TURRET.map((n) => ({ id: n.id, name: n.name, levels: n.levels, line: n.line })));

  await browser.close();
  return shots;
}

/* ------------------------------- the page ------------------------------ */

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const times = (n) => (n === Infinity ? '∞' : `×${n}`);

function markCell(n) {
  return `<figure class="mark" style="--tone:${n.tone || '#9fb3c8'}">
  <div class="glyph">${n.icon}</div>
  <figcaption>
    <b>${esc(n.name)}</b>
    <span class="meta">${esc(n.id)} &middot; ${times(n.levels)} &middot; ${n.cost}</span>
    <span class="line">${esc(n.line || '')}</span>
  </figcaption>
</figure>`;
}

function build(rig) {
  const marks = NODES.filter((n) => n.kind === 'upgrade' && n.icon);
  const arms = NODES.filter((n) => (n.kind === 'arm' || n.kind === 'charge') && n.icon);
  const byBranch = new Map();
  for (const n of marks) {
    const b = branchOf(n) || 'ROOT';
    if (!byBranch.has(b)) byBranch.set(b, []);
    byBranch.get(b).push(n);
  }

  const rigCells = rig.map((r) => `<figure class="part">
  <img src="${r.png}" alt="the turret with ${esc(r.name)} fitted" width="300" height="300">
  <figcaption><b>${esc(r.name)}</b><span class="meta">${r.id ? `${esc(r.id)} &middot; ` : ''}${r.levels} level${r.levels === 1 ? '' : 's'}</span>${r.line ? `<span class="line">${esc(r.line)}</span>` : ''}</figcaption>
</figure>`).join('\n');

  const markSections = [...byBranch].map(([b, list]) => `<section class="branch">
  <h3>${esc(b)}<span class="count">${list.length}</span></h3>
  <div class="grid">${list.map(markCell).join('')}</div>
</section>`).join('\n');

  return `<title>7749 Parts Catalogue</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@300;400;600&family=Archivo:wght@500;700&display=swap">
<style>
:root {
  --ground: #070e17; --panel: #0d1826; --panel-2: #101f31;
  --rule: #1c3348; --ink: #cfe4f2; --dim: #7793ac; --accent: #59e0ff;
  --shadow: 0 1px 0 rgba(255,255,255,.03) inset;
}
:root:not([data-theme="dark"]) {
  --ground: #eef2f6; --panel: #ffffff; --panel-2: #f5f8fb;
  --rule: #d3dde6; --ink: #16293a; --dim: #5d7387; --accent: #0b6f96;
  --shadow: 0 1px 2px rgba(20,40,60,.06);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #070e17; --panel: #0d1826; --panel-2: #101f31;
    --rule: #1c3348; --ink: #cfe4f2; --dim: #7793ac; --accent: #59e0ff;
    --shadow: 0 1px 0 rgba(255,255,255,.03) inset;
  }
}
:root[data-theme="dark"] {
  --ground: #070e17; --panel: #0d1826; --panel-2: #101f31;
  --rule: #1c3348; --ink: #cfe4f2; --dim: #7793ac; --accent: #59e0ff;
  --shadow: 0 1px 0 rgba(255,255,255,.03) inset;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font: 400 14px/1.55 "Chivo Mono", ui-monospace, "SF Mono", Menlo, monospace;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 40px 20px 80px; }
header { border-bottom: 1px solid var(--rule); padding-bottom: 22px; margin-bottom: 34px; }
h1 {
  font-family: Archivo, system-ui, sans-serif; font-weight: 700;
  font-size: clamp(26px, 6vw, 40px); letter-spacing: -0.015em; margin: 0 0 6px;
  text-wrap: balance;
}
.sub { color: var(--dim); font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
.note { max-width: 62ch; color: var(--dim); font-size: 13px; margin: 16px 0 0; }
h2 {
  font-family: Archivo, system-ui, sans-serif; font-size: 13px; font-weight: 700;
  letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent);
  margin: 52px 0 4px; display: flex; align-items: baseline; gap: 12px;
}
h2::after { content: ""; flex: 1; height: 1px; background: var(--rule); }
h2 + p { color: var(--dim); font-size: 13px; margin: 0 0 22px; max-width: 62ch; }
h3 {
  font-size: 11px; font-weight: 400; letter-spacing: 0.2em; color: var(--dim);
  margin: 26px 0 10px; display: flex; align-items: center; gap: 10px;
}
.count {
  font-size: 10px; color: var(--dim); border: 1px solid var(--rule);
  border-radius: 999px; padding: 1px 7px;
}
.rig { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.part {
  margin: 0; background: var(--panel); border: 1px solid var(--rule);
  border-radius: 3px; overflow: hidden; box-shadow: var(--shadow);
}
.part img { display: block; width: 100%; height: auto; background: #080f18; }
.part figcaption, .mark figcaption { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px 12px; }
.part b, .mark b { font-family: Archivo, system-ui, sans-serif; font-size: 13px; letter-spacing: 0.06em; }
.meta { font-size: 10px; letter-spacing: 0.12em; color: var(--dim); font-variant-numeric: tabular-nums; }
.line { font-size: 11px; color: var(--dim); line-height: 1.4; }
.grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.mark {
  margin: 0; display: flex; gap: 12px; align-items: flex-start;
  background: var(--panel); border: 1px solid var(--rule); border-radius: 3px;
  padding: 12px; box-shadow: var(--shadow);
}
.mark .glyph {
  flex: 0 0 auto; width: 46px; height: 46px; display: grid; place-items: center;
  background: var(--panel-2); border: 1px solid var(--rule); border-radius: 3px;
  color: var(--tone);
}
.mark .glyph svg { width: 30px; height: 30px; }
.mark figcaption { padding: 0; min-width: 0; }
.mark .line { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
footer { margin-top: 60px; border-top: 1px solid var(--rule); padding-top: 16px; color: var(--dim); font-size: 11px; letter-spacing: 0.1em; }
</style>

<div class="wrap">
<header>
  <h1>Parts Catalogue</h1>
  <div class="sub">SIMULATION 7749 &middot; build ${BUILD} &middot; ${marks.length + arms.length} marks &middot; 18 sockets</div>
  <p class="note">Every image the upgrade tree draws, in one place. The machine
  is rendered from the game itself &mdash; each cell is the turret with one
  part fitted at full levels and nothing else &mdash; and the marks are pulled
  straight out of the tree, so this sheet cannot drift from what ships.</p>
</header>

<h2>The rig</h2>
<p>The TURRET branch is not icons. Each of its eight nodes is structure on the
drawn machine, and eighteen levels fill it. Cells below are the same turret,
same light, same angle; the only difference is what is fitted.</p>
<div class="rig">${rigCells}</div>

<h2>The marks</h2>
<p>One 24&times;24 mark per node, grouped by the branch it hangs on. Colour is
the branch tone the shop gives it.</p>
${markSections}

<h2>Rounds, mines and abilities</h2>
<p>The same iconography for the things an upgrade modifies &mdash; what the
tree calls arms and charges.</p>
<div class="grid">${arms.map(markCell).join('')}</div>

<footer>Generated by scripts/contact.mjs</footer>
</div>`;
}

/* --------------------------------- go ---------------------------------- */

const { BUILD } = await import('../src/config.js');
const rig = await renderRig();
mkdirSync(OUT, { recursive: true });
/*
 * ASCII on the way out.
 *
 * The page carries no charset of its own -- the artifact wrapper supplies one
 * and a `file://` open does not -- so a raw multiplication sign came out as
 * two characters in every levels column. Entities are the same bytes either
 * way.
 */
const html = build(rig).replace(/[^\x00-\x7F]/g, (c) => `&#${c.codePointAt(0)};`);
const path = join(OUT, 'contact-sheet.html');
writeFileSync(path, html);
console.log(`${rig.length} rig renders, ${NODES.filter((n) => n.icon).length} marks`);
console.log(`wrote ${path} (${(html.length / 1024).toFixed(0)} KB)`);
