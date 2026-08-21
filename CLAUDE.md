# Working agreement

Session budget is roughly 50 minutes. Scope is the lever that keeps it there,
so these are the defaults unless the request says otherwise.

## Per request

1. Make the change.
2. Verify **only what the change touches**.
3. Commit, push, stop.

Then say plainly what was skipped, so nothing is silently unverified.

If a request looks like it will blow the budget, say so up front and propose
phases rather than spending it.

"Quick" on a request means the minimum viable verification and nothing else.

## Do not, unless asked

- Adversarial review workflows or multi-agent fan-outs. They are the single
  largest cost and are almost never what the request needed.
- Reviewing parts of the app the change did not touch.
- Running the full regression suite. Run it when asked, or before publishing.

## The suite, for when it is wanted

`node scripts/check-build.mjs` guards the build literal, the worker's precache
list, and `REV` — a content hash of every served file, shown next to BUILD in
the menu. **Changing any source file makes REV stale**, so the last step of any
change is `node scripts/check-build.mjs --stamp`; the plain run then passes.
REV exists because two installs can both say BUILD 75 and be different code,
and there was no way to tell from inside the game. `node scripts/smoke.mjs` walks every phase headlessly. The
per-feature tests live in the session scratchpad, not the repo; they need
`NODE_PATH=/opt/node22/lib/node_modules` and a static server on :8099.

## Repo facts worth not rediscovering

- No build step, no dependencies. Plain ES modules, one canvas, a DOM overlay.
- `src/config.js` holds every balance number and the `BUILD` literal, which is
  duplicated once in `index.html` and guarded by `scripts/check-build.mjs`.
- A new module must be added to the `ASSETS` list in `sw.js` or the game breaks
  offline. `check-build.mjs` fails if one is missing.
- Play-screen controls bind on `pointerdown`, not `click`, so a tap registers
  when the thumb lands. Tests must dispatch `pointerdown` to press them.
- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.
