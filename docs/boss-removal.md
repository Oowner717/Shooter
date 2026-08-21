# Removing ORDINAL

Build 81 made every run endless. The boss, the count, the lull and the ending
are all unreachable from play, but the code is still on disk. This is the plan
for taking it out.

## The size of it, honestly

An earlier estimate of "322 references across a dozen files, a third of the
codebase" was wrong. It came from a case-insensitive grep for
`boss|ordinal|ledger|reclaim`, which swept 70 comment lines and a lot of
unrelated prose ("shrug off", "cleared the floor", "the field is cleared").

The real surface:

| | |
|---|---|
| `src/boss.js` | 1,233 lines, **1 export** (`Boss`), **1 importer** (`game.js`) |
| live references to the boss object, outside `boss.js` | **89**, across 6 files |
| files needing any edit at all | **9** source + 2 support |

One export and one importer is about as clean a seam as a 1,200-line module
gets. Most of the 89 are self-contained `if (world.boss && …) { … }` guards
that come out whole.

## Order of work

Each step leaves the game running. Do them in this order and `smoke` passes
after every one.

### 1. The guards in the hot paths (33 refs, no behaviour change)

Purely `if (world.boss …)` blocks. Nothing else in these files knows the boss
exists.

- `src/enemies.js` — 12. RECALL retarget in `steer`; the boss and echo arms of
  `applyBlast`.
- `src/abilities.js` — 13. LANCE and the beam hitting the boss/echo; the
  `world.boss` branch of the ability target helper.
- `src/projectiles.js` — 8. RECALL bending shots; the `boss`, `bossShield` and
  `echo` cases of `resolveSegment`, and their `bestKind` branches.
- `src/shooter.js` — 1. `world.bossContact`, and the `bossContact` timer in
  `game.js`.

### 2. The phase machine (`src/game.js`)

Already dead: `phase = 'lull'` is set nowhere and read twice; `'boss'`,
`'ending'` and `'frozen'` are each set once, all on unreachable paths.

- Delete `onLull`, `beginBoss`, `onBossArrived`, `onBossDead`, `freeze`.
- Delete the `lull` and `ending` arms of `updatePhase`, `endStage`, `endTimer`,
  `endFade`, `lullTimer`, `snapshot`.
- Delete `import { Boss }` and `w.boss`, `w.bossContact`, `w.veil*` if the veil
  is boss-only (**check** — VEIL is a boss power but the mask may be shared).
- `phase` collapses to `'boot' | 'staging'`. Consider whether it earns keeping.

### 3. The ledger

`world.ledger` and `world.reclaimed` are **only** written by `boss.js`
(`spend`/`reclaim`). Nothing else feeds them. Remove both, their `reset` and
`restore` lines, and the `save.js` fields. `world.counted` goes with them — it
is set nowhere since build 81.

### 4. The four status effects that were only ever ORDINAL's

This is the part that is easy to miss. `veil`, `invert`, `jam` and `chrono` are
written **only** by `boss.js` — they are boss powers, not general mechanics —
so every consumer of them dies with it. `lockout` is set only by `freeze`.

| status | what it did | consumers outside `boss.js` |
|---|---|---|
| `veil` | darkened the field around you | 13, plus an 11-line `veilMask` / `veilCtx` / `veilFade` render path |
| `invert` | reversed the aim lever | 11 |
| `jam` | sealed the ability strip | 5 |
| `chrono` | slowed your bolts | 5 |
| `lockout` | froze input on the ending | 4 |

**`stasis` is not one of them.** It is the player's STASIS ability
(`abilities.js:720`) and must survive. It sits on the same reset line as the
other five, which is exactly how it would get deleted by accident.

The `veilMask` half-resolution canvas is allocated on every resize and composited
every frame; removing it is the one place where taking the boss out makes the
running game measurably cheaper rather than merely smaller.

### 5. The interface

- `src/hud.js` — `setBoss`, `setLedger`, `setLedgerMode`, `bossCaption`,
  `showEnding`, `hideEnding`, and the `resetBtn` handler.
- `index.html` — `#bossBar`, `#bossTitle`, `#bossSub`, `#bossFill`,
  `#bossCaption`, `#resetBtn`, and the ending overlay.
- `styles.css` — the rules for all of the above.
- `src/menu.js` — `codexCell.boss` class, and the `.boss` codex styling.

### 6. The rest

- `src/narrative.js` — `ENDING` and the ending renderer. **Keep `STORY`**: it
  runs on the kill count and is the game's only voice.
- `src/glitch.js` — the `'boss'` mode, which nothing sets any more, and
  `'frozen'`, set only by `freeze()`. **Keep `'normal'`**, which is the
  corruption you get from contact and the core damage feedback.
- `src/config.js` — the `boss:` block (80 lines) and `lull`. **Keep
  `killGoal`**: `releasesLeft` still reads it on the non-endless path, and
  `debugAddKills` uses it. If that path is going too, `killGoal` goes with it.
- `src/codex.js` — the vestigial `cleared` / `markCleared` / `forgetCleared`.
  The localStorage key is on players' devices; leaving the reader costs
  nothing and removing it strands them.
- `sw.js` — drop `./src/boss.js` from `ASSETS`. `check-build.mjs` enforces
  this both ways, so it will tell you.
- `scripts/smoke.mjs` — already rewritten in build 81; no boss steps left.

## What must not be taken by accident

- `applyBlast` lives in `enemies.js`, not `boss.js`. Abilities and mines need it.
- `Patch` (`patch.js`) is SPORE and THORN, not boss-only.
- `Enemy` and `ENTRY_Y` are imported *by* `boss.js`, not the other way round.
- `glitch` corruption on contact is the core damage feedback. Only the `boss`
  mode goes.
- The narrator. Ten lines on the count, and build 81 already had to rescue them
  once from a gate that would have silenced the game.
- `world.stasis`. See step 4 — it shares a reset line with five things that all
  do go, and it is the STASIS ability.

## Checks

`node scripts/check-build.mjs --stamp` after every step — any source change
makes `REV` stale, and it also guards the `sw.js` precache list. Then
`node scripts/smoke.mjs` and eslint. The three of them together catch the two
failure modes that matter here: a module removed from the worker's list, and a
reference left pointing at something deleted.
