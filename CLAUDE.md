# SIMULATION 7749 — working notes

Keep this file SHORT (under 20 KB). The old 1.19 MB CLAUDE.md overflowed
session context and crashed sessions. It now lives at `CLAUDE-history.md`.
**Never read CLAUDE-history.md in full** — grep it, or `sed -n` a small range.
Do not append build diaries here; put long notes in `docs/` if at all.

## Deploy

- Live: https://oowner717.github.io/Shooter/ — GitHub Pages, deploy from
  branch `claude/iphone-shooter-game-m6fccr`, root. A push there is live in
  about a minute. Commit straight to that branch unless told otherwise.
- `node scripts/check-build.mjs --stamp` must be the LAST step before commit.
  It refreshes REV (content hash of served files). Without it installed
  copies never update.
- Bump `BUILD` in `src/config.js`; it is duplicated once in `index.html`
  (check-build guards both, and that the literal sits in the first 4096
  bytes of index.html).
- A new module in `src/` must be added to `ASSETS` in `sw.js`.

## Workflow (per request)

1. Make the change. 2. Verify only what it touches. 3. `check-build --stamp`,
commit, push. Say plainly what was skipped.

Default verification: `check-build.mjs --stamp`, ONE run of
`scripts/regress.mjs`, `node scripts/bundle.mjs` if a served file changed.
Skip smoke/tiers/dps/variance/contact unless asked. No multi-agent reviews
unless asked.

## Running the suite

```
cd /home/claude/shooter && http-server -p 8099 -c-1 --silent &   # serves CWD; ignores a path arg
NODE_PATH=/opt/node22/lib/node_modules \
CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
node scripts/regress.mjs 2>&1 | tail -40
```

- regress.mjs is 2 MB / ~45k lines: grep it, never read it whole. Pipe its
  output through `tail`/`grep`.
- Never `pkill -f <pattern>`: it matches its own shell. Find PIDs via `/proc`.

## Code map (src/)

- `config.js` (huge): every balance number, `BUILD`. Grep, don't read.
- `game.js`: world, run loop, energy banking (`bank()` is the only place
  energy enters a run; `world.earned` = lifetime banked).
- `hud.js`: DOM overlay, the strip (`buildStrip()` rebuilds cells on every
  purchase — re-assert any state written onto cells at its end).
- `menu.js`: the menu sheet; `GROUPS` defines tabs; `Menu.openTab(id)`.
- `upgrades.js` / `tree.js`: upgrade tree; check-build asserts every buyable
  id is covered by the tree.
- `enemies.js` (huge), `boss.js`, `shooter.js`, `projectiles.js`, `yard.js`.
- `save.js`: `VERSION` bump deletes every open save — avoid.
- `units.js` (build 398): the era-2 works (yard lots of kind 'works') are
  buildings; ten unit types; state in `world.squad` (an object, not an
  array, to stay out of FIELD_LISTS/RUN_LISTS). UI: `buildUnitCells`,
  `showUnits`, `renderUnits` in hud.js; `#unitSheet` pauses the game.

## Design rulings (build 398)

- The battlefield is the WIDE one (`ZOOMS[2]`) at every era: `setZoom`
  ignores the era for zoom/scale. Era 2 = turret second form (`CFG.mk2`),
  `era2Power`, the yard/wall and the buildings.
- Energy is collected on contact automatically from the start; INTAKE is
  gone (RIG_MAX 17).
- The strip is one even row across the bar: LOADOUT | TARGETING | UNITS.

## Design rulings (build 399)

- Bosses (anomalies) sit every 10th rung: `BOSS_EVERY` 10, ceiling 90, all 9
  gated. Every finished wave climbs exactly one rung (`score()`); the wave
  rail is hidden and tier/surge alerts are gone. The only progression the
  player sees is the APERTURE boss prompt. RECALL/OVERCLOCK are dormant.
- Units last `unitLife(q)` s (base 5) and send every `sendEvery(q)` s (base
  5), `sendCount(q)` per send; `SQUAD_UPS` in units.js, levels in
  `world.squad.ups`. `MAX_OUT` 12 per works is a guard only.

## Design rulings (build 400)

- SIEVE (driftaim) is gone: AUTO AIM is a toggle off <-> 'all' (grey and
  hostile) from the start. RIG_MAX 15. 'field'/'drift' still exist in the
  targeting code for tests only.
- Menus follow idle-shop rules: wallet and buy button stand out, locked
  ammo are small chips under LOCKED, codex shows one row of blanks plus a
  count, CONTROLS fold under HOW TO PLAY, unbought units show name+price.
  CSS block "Build 400: calmer menus" at the end of styles.css.
- Build 401: the portal fades out (P.fade, updatePortal) while `world.boss`
  is set, and back in after; throat bodies still draw at full strength.

## Gotchas that have shipped bugs

- Play controls bind on `pointerdown`; tests must dispatch `pointerdown` on
  the element, not call the method.
- `el.hidden = true` loses to any author `display` rule: add a
  `#thing[hidden] { display: none }` guard; assert on the rendered box.
- `#ui button { pointer-events: auto }` has id specificity.
- A regress case that stubs `world.director.update` must restore it.
- Keep command output small; read big files in chunks.
