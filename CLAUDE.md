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

Three scripts, all in the repo. The last two need
`NODE_PATH=/opt/node22/lib/node_modules` and a static server on :8099.

`node scripts/check-build.mjs` is the static one and takes no server. It guards
the build literal, the worker's precache list, the tree's coverage of every
buyable id, the colour rule (grey means harmless), the broadphase cell against
the largest body, and `REV` — a content hash of every served file, shown next
to BUILD in the menu. **Changing any source file makes REV stale**, so the last
step of any change is `node scripts/check-build.mjs --stamp`; the plain run
then passes. REV exists because two installs can both say BUILD 75 and be
different code, and there was no way to tell from inside the game.

`node scripts/smoke.mjs` walks a long run headlessly and screenshots it.

`node scripts/regress.mjs` asserts the things this game has actually got wrong:
stale field reads (the class of bug that stopped the turret firing for three
builds), the trigger itself, every round/mine/ability/object type running once
without an error, a save surviving an app update while still refusing a
malformed one, each menu tab showing only its own panel, the volume surviving
mute-quit-return, and the broadphase seeing every overlap of the biggest body.
Add a case to it whenever something ships broken — that is the whole rule.

Before build 101 this section pointed at a session scratchpad. There were 243
probe scripts in it behind a hand-kept runner list; 21 of the 43 the list named
failed on build 100, every one of them because the probe named something
deleted in builds 81-99, and the lot died with the container. Nothing about
that was a suite.

## Repo facts worth not rediscovering

- No build step, no dependencies. Plain ES modules, one canvas, a DOM overlay.
- `src/config.js` holds every balance number and the `BUILD` literal, which is
  duplicated once in `index.html` and guarded by `scripts/check-build.mjs`.
- A new module must be added to the `ASSETS` list in `sw.js` or the game breaks
  offline. `check-build.mjs` fails if one is missing.
- Play-screen controls bind on `pointerdown`, not `click`, so a tap registers
  when the thumb lands. Tests must dispatch `pointerdown` to press them.
- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.
