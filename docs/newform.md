# NEW FORM / NEW FIELD — the build plan

**Status: P1 (238), P2 (239), P3a (240), P3b (241) shipped. P4 is next.**

This file is the resumption mechanism. A session picking this up with no memory of the
conversation that produced it should be able to read this and know exactly what was
decided, what was checked, and what to do next.

## How this plan was made, and how far the review got

- **Six read-only audits** ran over the subsystems the change touches: the camera and
  every absolute distance, the spawn path, the turret, progression and persistence,
  the HUD furniture, and the existing set pieces. Their findings are folded in below
  and several of them changed the design.
- **One adversarial review** of five agents attacked the result — resumability, blast
  radius, the house rules in CLAUDE.md, the player's experience, and a completeness
  pass. **It found four load-bearing claims in the first draft to be false.** Those
  are corrected here; the draft is not preserved.
- **A second adversarial review was started and stopped** before any agent finished,
  on the user's instruction. So this plan has had one round of attack, not two. The
  lenses that did not get to run were: refute round one, cost each phase against the
  50-minute budget, play-test era 2 on paper, force the soft decisions, and attack the
  proposed cases as instruments. **Section 7 records what it was going to ask**, and
  those questions are still open.

## Verified by hand, not by an agent

Two structural decisions were checked directly against source and both came back
stronger than the plan claimed:

**The cinematic as a `world.phase` is a bigger win than "it stops the autosave".**
`world.phase` has 25 readers and only two values today; the dominant test is
`!== 'staging'`, which fails CLOSED. A third value makes every one of them do the
right thing unprompted — `Director.update` douses (`enemies.js:4501`), `openBoss`
refuses (`game.js:2006`), `syncGate` returns (`game.js:2045`), teaching stops
(`game.js:1558`), the story narrator stops advancing (`game.js:2328`), `openSheet`
refuses (`game.js:919`), the testbed door disables (`menu.js:387,417`), and
`SAVABLE` excludes the checkpoint. `Game.update` gates on `paused`, not `phase`, so
the cinematic's own clock still runs.

**`Director.glitchOut` really does shed nothing.** `fizzle` counts down to
`dead = true` (`enemies.js:896`) and never calls `destroy()`, and `destroy()`'s own
first guard (`enemies.js:1385`) refuses to cash in a fizzling body. Two refinements
the plan did not have:

- `glitchOut` **skips DRIFT** (`enemies.js:3758`) and walks `world.enemies` alone, so
  the six other list clears are genuinely needed on top.
- `fizzle` takes TIME — bodies fade rather than vanish. That is the show in act I of
  the cinematic and it is wrong for a debug era switch, where they should just be
  gone. **`setEra` needs both modes**, which no version of the plan has said.

---

# NEW FORM / NEW FIELD — build plan (revision 3)

Consolidated. Revisions 1 and 2 were a plan and a list of corrections to it; this is
the plan as it now stands, with the corrections folded in and the changelog dropped.

---

## 1. THE REQUEST, AND WHAT THE USER HAS RULED

A NEW FORM upgrade, unlocked by seven bosses AND a complete turret branch; bought;
then a banner; then a cinematic evolution into a larger, opaque turret; then a
permanently wider field with an enemy building, a wall, and six empty build lots.
+30% base damage. Ranges rescaled. Debug switching between forms/views, locked
together. Field changes clear everything and release no energy.

| ruling | |
|---|---|
| field scale | **×0.65**. `CFG.zoom` 0.62 → 0.403. Reach ×1.538. 390×844 goes 1361 → **2094** units deep, 629 → **968** wide. |
| the node | The existing **RECAST**, repriced to **seven REMAINDERs, zero energy**. |
| enemy speeds | **Do not scale.** Only turret-owned variables change. Faster enemies come later. |
| the testbed | **Not touched.** Era-1 zoom whatever the era. |
| boss standoffs | **Not touched.** Only matter on the old field. |
| past saves | **Not a concern.** |
| progression | **Run-level, one run, one save file.** RESET SIMULATION is the New Game equivalent and wipes the device. |
| +30% damage | **Era 2 only.** |

---

## 2. THE THING THAT WAS ALREADY THERE

`RECAST` is this feature, declared and waiting since before this request
(`upgrades.js:757`), under a docstring that says: *"What it will do is change what the
turret IS rather than what it has: every other purchase bolts something onto the
machine, and this one is meant to replace it."*

And `ULTIMATE` is the room for it (`menu.js:462`): *"A tier above the tree. Nothing
here opens yet; what goes in it is being built."* Already padlocked, already in
ARSENAL, already the 8 characters CLAUDE.md measured as the locked-tab ceiling.

Neither is new work. Both are work that was deferred with a note.

---

## 3. ARCHITECTURE — five decisions that shape every phase

**(a) One variable.** `world.era ∈ {1, 2}`. Form and field are the same fact, so they
are one field and cannot disagree. That is a stronger answer to "lock them together"
than two flags kept in sync.

**(b) The camera is the new subsystem and everything else is its user.** Today the
renderer is ONE transform (`game.js:2446`) with no offset, and the entire codebase
contains **three** scale compensations. The era zoom needs the scale to vary; the
cinematic needs scale AND a centre to animate. Build `world.view` once.

**(c) The cinematic is a `world.phase`, not a flag.** `SAVABLE = new Set(['staging'])`
then excludes it for free, and the six autosave writes that would otherwise land
mid-transformation stop existing. This is the single cheapest correctness win in the
plan.

**(d) The yard needs a new mark.** CLAUDE.md: *"`spent` is a rule for what may be
SHOT; `staged` is a rule for what may be CHOSEN"*, and `config.js` says `staged`
"never gated projectile collision". A body in the yard must be immune to both, so it
is a third mark, honoured by every damage path — the build-233 25-source sweep is the
instrument that proves it.

**(e) The clear-field primitive is `Director.glitchOut`, not `openAperture`.**
`openAperture` **pays out** (`boss.js:1919`: *"opening the way mid-wave banks the
wave"*), walks only `world.enemies`, skips `type.fixed`, and re-enters the field on
the way out. `glitchOut` marks `fizzle`/`spent`/`dissolved` instead of destroying, so
nothing banks and no motes shed; it clears `attackers` AND each `e.attacking`; and it
already pays the five things `score()` owes plus `grace`. The refusal door is
`Enemy.destroy`'s own `fizzle` guard, which is CLAUDE.md's rule verbatim.

---

## 4. THE PHASES

Every phase: green suite → `check-build.mjs --stamp` → `bundle.mjs` → commit → push.
`docs/newform.md` carries the checklist so a fresh session resumes from disk.

**The debug panel ships to every player** (`menu.js:1426`, an ungated cell in
SETTINGS, four taps). "Debug-only" is not a safety argument. The safety argument is
that **`world.era` is not written to the save until P9** — a stepper tap reverts on
reload.

### P0 · the plan on disk
`docs/newform.md`: the phases, the rulings, the trap catalogue, the checklist.
Nothing lost if abandoned.

### P1 · the era, the switch, and the reset convergence
- `world.era`, session-only (NOT in `captureRun` yet).
- `Game.setEra(n)` modelled on `glitchOut`: names all seven lists (`enemies`, `drops`,
  `debris`, `projectiles`, `effects`, `mines`, `pendingBlasts`), drains
  `pendingBlasts` LAST because a detonating body pushes one on its way out, and pays
  the five things `score()` owes plus `grace`.
- Debug: an ERA stepper and a stub evolution trigger.
- RESET SIMULATION calls `forgetPlayer()` — one true reset, the New Game equivalent.
- The `reconciled` docstring at `game.js:274` corrected: it claims to survive a reset
  and does not.
- **Cases**: era 2 by debug does NOT survive a reload; the switch leaves all seven
  lists empty and `w.energy`, `w.earned` and `w.drops.length` unchanged — an
  energy-only assertion passes while the floor fills with pickups.

### P2 · the camera
- `world.view` = scale + this game's first offset. All nine `CFG.zoom` readers
  repointed. Read through the object every time, never cached at module scope
  (`bundle.mjs` guards `export let` but not a module-local const).
- `resize()` called explicitly from `setEra`, `enterSandbox` and `exitSandbox` — none
  of the three calls it today, and `reset()` does not either.
- The governor pinned: `resize()` has three callers inside it and re-allocates the
  3.3 MB sky overlay.
- The testbed pinned to era-1 scale.
- **Cases**: era 1 unchanged to the digit; `world.width * world.scale === screen
  width` (the frame clear depends on it); the testbed's clearance case passes when
  entered FROM era 2.

### P3 · the constant sweep
Every turret-owned and screen-anchored distance, in three buckets, each verified
differently: reach ("same fraction of the field"), screen-anchored ("same CSS px"),
and the third bucket the completeness pass found — **every HUD-in-world literal**,
because only three scale compensations exist in the whole codebase and the eight
overlay elements are all bare literals that shrink 35%.
- **Named**: `entryDepth: 260` (→ 360+, or bodies die behind the chrome again),
  `shooter.standoff: 210`, `gripLen: 112`/`gripR: 24`, the narrator's wrap `470`,
  PULSE's literal `340`, `WELL_REACH = 430` + four literals, LANCE's `e.r + 26`,
  `decoy.ahead: 300` + `s.y - 120`, `pile.r0/r`, `arc.jumpRange: 210`,
  `landingSite`'s `shooter.y - 130`, `energy.pull: 26`, `drop.speed/accel`,
  `touchLift: 56`, the lattice's floorless `lineWidth = 1`, two `Math.min` caps that
  flip from fraction-wins to cap-wins.
- **SCATTER is the only round with an authored range** (`shotgun.life: 0.375`); the
  other eight ride `bolt.life: 2.2` and already over-cover the field twice. Scale
  `speed`, not `life` — `life` makes every round read 35% slower, a different game.
- **The energy economy is a travel-time problem**: motes drift the whole way in, so
  the 54%-longer column costs income against a hard `maxDrops: 128`, and `earned`
  gates every object type.
- **Cases**: era 1 unchanged; the mine blast ceiling and thumb-lift guards pinned to
  era-1 numbers before anything moves, because both derive from `CFG.zoom` and would
  wave the change through.

### P4 · the yard
Building, wall, the yard mark, one aperture, era 2's sky, era 2's drone.
- **State in one line what the building and wall ARE.** If `ENEMY_TYPE`s, three
  `check-build` guards move in the same commit: `DERIVED` exits 1 for a type no wave
  releases; grey requires `harmless` and chroma < 0.28 fails; `smallestShell` is a
  `Math.min` a small fixture drags under.
- The building's mouth sits **below 360 world units** — the chrome band.
- The sky is **five unconditional call sites**, not one, and contends with `dawn`,
  which every era-2 run has just set.
- `setDroneMood` gains a second caller or goes.
- **The wall rule has nowhere to be explained**: `codex.record` fires when a thing
  comes apart, so an indestructible fixture can never be recorded and the OBJECTS
  tab's denominator could never be reached. Decide here, not in polish.
- **Cases**: nothing spawns outside the aperture; nothing in the yard takes damage
  from any of the 25 sources; era 1 spawning unchanged.

### P5 · the build lots
Six boxes, drawn, tappable, refusing with a reason.
- **Cases**: inside the field at both screen sizes; no overlap with the turret, strip
  or ability bar; tapping cannot buy.

### P6 · the MK2 turret
- Fold the three hung-on pieces (SIEVE screens, FEED drums, ARRAY fins) into one
  silhouette. Everything else on the machine is already 0.97–0.99 alpha.
- `Menu.drawHero`'s bare `190` breaks; `contact.mjs`'s `(S*0.17)/sh.r` self-normalises
  and does not.
- `CFG.shooter.r` is the PHYSICAL radius — contact, INTAKE, the attackers grab, and
  the broadphase, which `check-build` guards by walking `ENEMY_TYPES` only. The
  release hysteresis is a fixed 4 units chosen against r=26 and must become
  proportional or a body on the rim chatters.
- Clean the stale SIGHT docstring and the dead `DARK` local while in there.
- **Cases**: MK1 unchanged (the contact sheet is the instrument); every socket drawn;
  the broadphase guard walks the shooter and the DECOY.

### P7 · balance
+30% base damage on every round and mine, **era 2 only**. ORDINAL re-baselined in the
same commit with the reason. ARC/SPORE/THORN are already inside the damage line.
- **Cases**: era 1 damage unchanged to the digit; each of the nine rounds and eight
  mines measured on a pinned wall, not read off the constant.

### P8 · the cinematic
The beat sheet in §5. A `world.phase`. `world.debug.noGlitch` already exists and is
the branch to reuse. Captions are `world.bossLine`, which makes the narrator's
stand-down free. A reduced-motion arm and a skip, because SCREEN SHAKE / OFF is a
real setting and eight `prefers-reduced-motion` blocks already exist. A `smoke.mjs`
arm, because it is the repo's only screenshotting probe and it cannot currently leave
era 1.

### P9 · the door, last
- ULTIMATE room filled: shut state with two live counters, open state with one
  button — the TESTBED room's two halves.
- **A new gate predicate**, because `needs` was deleted in build 228 and
  `Game.available` tests only `rung` and the parent chain. The two stale docstrings
  advertising `needs` die in the same commit.
- RECAST → **NEW FORM** on the row; `id: 'recast'` never changes.
- `repeat: true` **deleted** in the same edit as `levels: 1`, or the level count is
  dead text — `levelsOf` returns `Infinity` for a repeat node before the mandatory
  throw. check-build's printed line moves to `0 repeatable ()`; pin it.
- The gate is **the eight `parent.key === 'turret'` nodes, 18 levels** — defined as
  the hero readout reaching its own denominator, so requirement and readout are the
  same fact. `notALevel` covers TESTBED **and** RECAST.
- `era` joins `captureRun` here.
- The five discoverability sites: the ULTIMATE room, the row's line, `game.js:2404`
  (which becomes a lie for the first six bosses), `game.js:2143` (the seventh
  anomaly, the moment), and the hero readout. **Not** the title screen — a fourth
  tile breaks a measured wrap.
- **Cases**: `era === 2 ⇒ reconciled.length === 7`; the gate cannot be met early; the
  branch denominator equals `RIG_MAX`.

### P10 · the reveal pass
Story beat timing, a playthrough at both sizes, the bundle booted by hand, CLAUDE.md.

---

## 5. THE CINEMATIC

`world.ledger` is an **ordered** list of every purchase, so the machine comes apart
**in the order the player built it**. Free, and different for every run.

| act | t | what |
|---|---|---|
| I · the field is taken | 0 → 4.0 | Everything `fizzle`s and is hauled into the turret. Nothing pays out. The sky drains. |
| II · the approach | 4.0 → 9.0 | Camera pushes to ~1.1, closer than the game has ever been. The strip and ability bar retreat. |
| III · the unmaking | 9.0 → 15.5 | Eighteen sockets detach in ledger order, one every ~0.35s, each falling into the core. |
| IV · the core | 15.5 → 19.0 | One point of light. Held. Silence. |
| V · the ignition | 19.0 → 23.5 | The new form builds outward from the core as one shell. The sky turns over. |
| VI · the pull-back | 23.5 → 30.0 | Back through 0.62 and out to 0.403. The New Field arrives in view for the first time. |

30 seconds against TERMINUS's 21.6, the longest thing in the game today.

**Acceptance**: rendered offscreen at fixed times — the band-sweep instrument — each
act differing from the last by more than the animation's own noise; ledger order
honoured; the zoom passes 0.62 exactly once outbound; nothing on the field, in the
purse or in `earned` moves across the whole 30 seconds.

**Audio is unbuilt.** The longest cue in the game is 270ms and `boom()` is ungated, so
a 40-body clear on act I is 40 overlapping detonations. P8 owns a track or says it has
none.

---

## 6. OPEN

1. What the building and the wall ARE (`ENEMY_TYPE` or fixture) — decides three
   check-build guards and the codex question. Recommend: fixtures, not types.
2. Where the wall rule is explained, given `codex.record` fires on destruction.
3. Whether the cinematic can be skipped, and what the reduced-motion arm is.


---

## 7. What the second review was going to ask, and nobody has answered

It was stopped before any agent reported. These are still open and are the first
thing to run if the budget allows:

1. **Refute round one.** Its findings are load-bearing and unchecked by anyone but
   their author. Particularly: is `glitchOut` really enough (partly answered by hand
   above), was `needs` really deleted, is the ULTIMATE tab really unsealable at
   runtime, and does `entryDepth`'s scaling break the thing its own comment says
   `entrySpeed` compensates for.
2. **Cost each phase.** P3 "the constant sweep" is the most likely to be hand-waving —
   nobody has COUNTED the constants. Is it 20 or 200? And is P6 (the MK2 turret, in a
   500-line `drawMachine`) an edit or a fork?
3. **Play-test era 2 on paper.** Crossing times per body type, on-screen density at
   tier 10, what one aperture does to the shape of a wave, and how much dead time a
   2.37x-area field with unchanged enemy speeds actually produces.
4. **Force the soft decisions.** Every "probably" and "decide in Pn" in this document.
5. **Attack the cases as instruments.** CLAUDE.md is full of probes that measured the
   wrong thing; the cinematic's acceptance criterion is borrowed from the dummy band
   sweep and may not transfer — that sweep compares a STATIC rig at different values,
   while consecutive cinematic acts differ by design.

## Checklist

- [ ] P0 · this file
- [x] P1 · the era, the switch, the reset convergence — **build 238**
- [x] P2 · the camera — **build 239**
- [x] P3a · the scale, and the reach that makes era 2 playable — **build 240**
- [x] P3b · the rest of the sweep: the use-site literals (build 241)
- [ ] P4 · the yard
- [ ] P5 · the build lots
- [ ] P6 · the MK2 turret
- [ ] P7 · balance, era 2 only
- [ ] P8 · the cinematic
- [ ] P9 · the door
- [ ] P10 · the reveal pass

---

## 8. Second review — three lenses, run after the plan was committed

Play-test, instruments, and refutation. Everything below is measured against source.

### 8.1 THE FINDING THAT CHALLENGES THE PREMISE: the rescale buys ZERO screen

Measured live at 320x568: `#alerts` bottom is 162px, `#quickBar` top is 289px. The
unobstructed play band is **127 CSS px — at BOTH eras.**

| | era 1 (z 0.62) | era 2 (z 0.403) |
|---|---|---|
| chrome bottom | 261 wu | **402 wu** |
| quickBar top | 466 wu | 717 wu |
| clear band | 205 wu | 315 wu |
| **clear band in CSS px** | **127** | **127** |

The chrome and the strip are CSS-anchored, so scaling the world does not open the
window — it only shrinks what is drawn in it. "See the full battlefield" is entirely
a matter of every body being drawn 35% smaller in the same space, and the yard, the
building, the wall and the six lots have to fit in that same 127px on the binding
screen. **This needs a decision from the user before P2 starts.**

### 8.2 `CFG.entrySpeed` is the number that makes era 2 work, and no version of the plan named it

Its docstring: *"the march in runs this much faster than the object's own cruise, so
the extra 260 units cost the run no time."* Scale `entryDepth` and leave `entrySpeed`
and the march-in stops being free. **It is a staging multiplier applied only while
`staged` (`enemies.js:825`), not a field speed — so the "speeds do not scale" ruling
does not forbid it.**

`entrySpeed: 2.6 -> 4.0`, and 4.0 is exact rather than fitted: 400/(4c) = 260/(2.6c).

Why it matters more than it looks: three ladder clocks are measured in the seconds it
controls — `surgeWithin: 3`, `cleanWithin: 12`, `patience: 26`. Era 2 as specified
spends **0.5s to 2.3s of pure travel inside a 3-second surge window**. A surge is +2
tiers and a stall is 0, so the ladder would climb slowest exactly where it must climb
fastest, and the alert would read IT TOOK TOO LONG on waves the player crushed.

### 8.3 `entryDepth` is 400, not 360 — my number came from a stale docstring

The comment says the interface reaches world y 234. It reaches **261** today. So
`entryDepth: 260` is already 1.3wu short rather than "just clear of all of it", and
the era-2 value is 162/0.403 = **402**, i.e. 260 x 1.5385 = 400. The 360 in the plan
was the stale 234 scaled, and lands 42wu ABOVE the chrome — reinstating the exact bug
the constant exists to kill.

### 8.4 Three blockers for the RECAST ruling

- **The purchase path is single-currency by construction**, in three places that each
  read `n.currency === 'remainder' ? w.remainder : w.energy` (`game.js:817`,
  `menu.js:1084`, `menu.js:1090`). One purse, one price, one deduction. "Energy plus
  seven REMAINDERs" is a change to all three plus `priceOf` plus the card's print.
- **`dormant` is a second live gate** already in the tree (`game.js:805`,
  `menu.js:796/1083/1209`, `tree.js:282`), documented as *"a slot that is not built
  stays dormant"*. P9's "a new gate predicate" overstates the work.
- **`noteRig` already computes the gate** (`game.js:854`) and stores `w.rigDone` — but
  `rigDone` is set only on a purchase and `resume()` replays the ledger without
  calling it, so **it is false after every reload of a completed turret.** A gate hung
  on the flag fails closed on resume. Use the recomputed `every()`.

### 8.5 The ULTIMATE tab already wraps, today, on a clean build

My "8 characters" was CLAUDE.md's THREE-tab measurement applied to ARSENAL's FOUR-tab
strip. Measured padlocked: AMMO/MINES 70.8px, UPGRADES/ULTIMATE 80.2px, and inside
the ULTIMATE tab **the padlock sits orphaned on its own line above the word**, at
both 320 and 390. 80.2 is min-content, so those two steal 4.7px each from their
siblings. P9 needs a shorter label, a `nowrap` + shrink strategy, or no padlock on
that tab — and CLAUDE.md's bullet should say *three-tab strip*.

### 8.6 The build-199 stroke regression returns, measured

`setHairline` divides by the era zoom, so at dpr 2 the world-unit floor goes
1.008 -> **1.551** while `r * m.line` is unchanged. Types clamped to the floor go
**11 -> 16 of 37**, and **4 -> 9 of the 16 field types** — DRIFT, TOW, GLUT, HERALD
and PRISM all fall under and get MOTE's outline, on top of reading 35% smaller.
Fix: multiply `line` in `materialOf` by 1/0.65 in era 2 and invalidate the `t._mat`
memo on the switch.

### 8.7 The aperture

**Three spawn sites, not one**: `emit` (`enemies.js:4649`), `spawnFormation`'s `cx`
(`:3379`), and ambient `spawnDrift` (`:3463`). P4's "nothing spawns outside the
aperture" fails on the drift trickle within seconds unless drift is exempted by
decision rather than by accident.

**It cannot be narrow.** A formation is laid out by `formationOffset` then clamped to
the FIELD, not the aperture: a mote x4 wave spans **570 units at tier 20 — 59% of the
968-wide field**. Either give `spawnFormation` the aperture bounds or force
`shape: 'column'` inside it.

**And below the entry line the aperture is invisible**: `ROUTES` fan bodies +/-300
units within a few hundred of travel, so from y~400 down the field looks as it does
today. `ROUTES[].width` is absolute, so every approach is also **35% straighter**.

**Auto-aim gets strictly better**: arrival bearing spread collapses ±21.2° -> ±7.6°,
traverse work falls to 36%, and `aimStick` plus every target-switch cost this game has
measured become inert.

### 8.8 The shape of era 2, in numbers

- Crossing times, weighted: **17.6s -> 27.4s**. BULWARK 32.6 -> 51.6. A LOITERer
  dawdles against a bare `dist > 260` (`enemies.js:838`) that did not scale: BULWARK
  46.1 -> **79.2s**.
- **Era 2 is exactly 2.00x more forgiving** — 1.54x longer inside a reach that also
  scaled, at 1.3x damage. At `hpStep 1.085` that is **8.5 tiers of headroom**.
- Density: the same ~11 bodies at tier 10 in 2.37x the area. Screen coverage by
  enemies falls to **42%**. Era 2 is not busier, it is **emptier**.
- Dead time is only **+1.1s** — not the problem. The emptiness is spatial.

---

## 9. The price, settled: seven REMAINDERs and no energy

`CFG.ordinal.recast: 1 -> 7`. One number. RECAST already declares
`currency: 'remainder'` and the whole purchase path already handles it, so the
single-currency blocker in 8.4 **disappears entirely** — no change to `game.js:817`,
`menu.js:1084`, `menu.js:1090` or `priceOf`, and no decision about what a card prints
when a thing has two costs.

**And the price is exactly affordable, by construction rather than by luck:**

- `remainder: 1` per boss (`config.js:2806`), granted when the collectible reaches the
  turret (`boss.js:129`).
- `withdrawBoss` reconciles nothing AND grants nothing — it only alerts
  (`game.js:2100-2117`).
- So **reconciled count and remainders granted move in lockstep**, and the gate stops
  RECAST being bought before the seventh boss, so none can be spent early.

Seven bosses beaten is exactly seven remainders held. The price IS the requirement,
stated in the currency the bosses pay in, and REMAINDER finally has something worth
saving for instead of a one-per-boss no-op.

**The case this rests on**, and it is the whole reason the price works:
*`world.reconciled.length` equals the number of remainders granted.* If those two ever
drift the gate becomes unreachable in that run, silently.

This also removes the energy half of the gate from P9: there is no purse test, and
`available()` needs only the boss count and the turret branch.

---

## 10. Settled: era 2 draws everything smaller

The 127px finding in 8.1 is accepted rather than mitigated. Era 2 does **not** reclaim
chrome; it shows a larger world in the same play band, with everything drawn 35%
smaller. NEEDLE 12.4px across becomes 8.1, BULWARK 55.8 becomes 36.3, and screen
coverage by enemies falls to 42%.

Three consequences follow, and one of them changes from optional to required.

**The stroke fix is now mandatory, not a nicety.** 8.6 measured the build-199
regression returning: at dpr 2 the world-unit floor goes 1.008 -> 1.551 while
`r * m.line` is unchanged, clamping 9 of the 16 field types instead of 4 — DRIFT, TOW,
GLUT, HERALD and PRISM all collapse onto MOTE's outline. If everything is also 35%
smaller, the outline is doing even more of the work, and CLAUDE.md's measurement is
that a body reads almost entirely as its outline with the fill at 7-9% of its
brightness. **`materialOf`'s `line` gets x1/0.65 in era 2, and `t._mat` is invalidated
on the switch.** Without it the roster stops being distinguishable.

**The six build lots have a screen-pixel budget, not a world-unit one.** They are
drawn into the same 127px band as everything else, so P5 sizes them in CSS px and
converts, rather than picking world units and hoping.

**The lever is fine, and this was worth checking.** `gripR: 24` is purely a DRAWN
radius: the grab test is `p.y > s.y - s.r` (`game.js:1032`), a half-plane, not a hit
circle on the knob. So the knob draws smaller while the grab zone stays "everywhere
below the turret", which is unchanged in screen terms because `shooter.standoff`
scales to hold the turret at the same CSS position. **No touch target regresses.**

That is the general rule for this ruling: it settles what is DRAWN. Anything that is
also *touched* needs checking separately — and the lever was the only candidate.

---

## 11. P1, as built (build 238)

- `world.era`, run-level, on the `reconciled` lifecycle: cleared by `reset()`,
  absent from `captureRun` until the door.
- `Game.setEra(n, { instant })` — the field taken without cashing anything in.
  Two modes, because `fizzle` gives a body seconds to dissolve (right for the
  evolution's first beat, wrong for a stepper).
- `Director.abandonWave(ran)` extracted from `glitchOut`, so the two callers
  cannot keep separate copies of what a wave owes the next one.
- RESET SIMULATION calls `forgetPlayer()` — one true reset.
- Debug: ERA → and a stubbed EVOLVE (P8), added now so `smoke.mjs`'s
  exact-text walk of the grid does not have to change later.
- The `reconciled` docstring corrected: it claimed to survive a reset.

**Both cases failed first, on one missing line, and it was the trap the audit had
already named.** `reset()` did not clear `era`, so `setEra(2)` on a world already at
2 returned early and cleared nothing, and `resume()` handed back an era the save does
not carry. The audit's list of "what `reset()` does NOT clear" is where this feature
lives; anything added to the world belongs on that list or on a written reason why
not.

---

## 12. P2, as built (build 239)

The scale is per era and lives where every reader already looks. `CFG.ZOOMS` is
`[0, 0.62, 0.403]` and `setZoom(era, sandbox)` writes `CFG.zoom` on every resize,
exactly the way `setHairline` writes the stroke floor. That shape was chosen over a
`world.view` object for one reason: `CFG.zoom` is a property on `CFG` written by a
function, which is the form `bundle.mjs` cannot silently snapshot. All nine readers
work unchanged.

`setZoom` runs BEFORE `setHairline` in `resize()`, because the floor is derived from
the zoom and would otherwise be one resize behind.

**Three real bugs, all caught by the new cases:**

1. **`reset()` cleared the era but re-derived nothing**, leaving the world at era 2's
   width, height, floor and turret position while claiming era 1.
2. **Leaving the testbed un-evolved the run.** Both doors go through `resume()`, which
   is `reset()` plus the file; `reset()` clears the era and the file does not carry it
   yet. Carried across by hand, with a note that the restore takes over at the door.
3. **The first fix was too broad and broke an unrelated case.** An unconditional
   `resize()` in `reset()` also re-derives the backing store from `fx.quality`, so a
   plain `restart()` began applying a quality some earlier caller had left low — two
   consecutive draws stopped being identical. That is CLAUDE.md's governor note from
   the other side. It is conditional on the scale actually being stale now, so a
   same-era restart is untouched.

**Era 2 is now visually correct and mechanically wrong**, which is expected and is why
P3 exists: the field is 1.54x deeper with era-1 reach. It is debug-only and reverts on
reload. Shipping the zoom before the constants is deliberate — it makes P3's sweep
measurable rather than a guess.

---

## 13. P3a, as built (build 240)

**`CFG.scale` is derived, not declared**: `CFG.ZOOMS[1] / CFG.zoom`, written by
`setZoom`. It is exactly 1.0 in era 1, which is the whole design — every site that
multiplies by it is a no-op there, so "era 1 is unchanged" is true by CONSTRUCTION
and a missed site is the only way the sweep can be wrong.

Constants with several readers follow `CFG.hairline`'s shape — a `BASE` table
captured at module load and a live value the game reads — because wrapping four call
sites in an expression is four chances to miss one, and this is none.

| | era 1 | era 2 |
|---|---|---|
| `entryDepth` | 260 | **400** (the interface reaches world y 402) |
| `entrySpeed` | 2.6 | **4.0** (exact: 400/4c = 260/2.6c) |
| `shooter.standoff` | 210 | 323.1 |
| `aimRange` | 400 | 615.4 |

**`entrySpeed` is the carve-out from the "speeds do not scale" ruling**, and it is a
real one: it is a staging multiplier applied only while `staged`, not a field speed,
and its own note says it exists so the extra depth costs the run no time. Left at 2.6
the march-in stops being free — and the ladder's three clocks (`surgeWithin` 3s,
`cleanWithin` 12s, `patience` 26s) are all measured in the seconds it controls, so era
2 would have spent up to 2.3s of a 3s surge window on travel and reported IT TOOK TOO
LONG on waves the player crushed.

**One line covered every round in the game**: `fire()` is the shared muzzle for the
turret and the abilities, so scaling the speed there carries all nine. SPEED and not
`life` — same range by arithmetic, different game to look at, because a round drawn at
65% scale travelling 1.538x faster crosses the SCREEN at exactly the pace it always
did. It is also the only round-range fix era 2 needed: eight rounds ride `bolt.life`
which over-covers even era 2 twice, and SCATTER is the one with an authored range.

**The stroke ladder is held against a floor that moved.** `materialOf`'s `line` is
x`CFG.scale` and the memo is keyed on the scale. Measured at dpr 2: without it era 2
clamps 16 of 37 types instead of 11 — DRIFT, TOW, GLUT, HERALD and PRISM all collapse
onto MOTE's outline, on a roster already drawn 35% smaller. With it, 11 at both eras.

## 14. P3b, as built (build 241)

P3a took everything that lives in `CFG`, via the `SCALED` table that throws on
a path CFG does not have. P3b is what is left: distances written as literals
at the site that uses them, where no table can reach them and nothing can
enumerate what was missed.

**The rule the sweep was run against**, and it is the whole of P3b: *a distance
that is part of the MACHINE keeps its world size; a distance that is part of
the PICTURE keeps its size on the glass.* A body's radius, a mine's body, the
clearance a formation needs either side of itself — machine, left alone. An
aim ray, a cone tick, a lock bracket, a story line's wrap, the substrate's own
lattice — picture, multiplied by `CFG.scale`.

Six sites moved:

| site | was | why |
|---|---|---|
| `enemies.js` `routeLateral` | `width`, `d/520`, `(d-170)/210` | the shape of an approach |
| `enemies.js` LOITER dawdle | `dist > 260` | a depth threshold, not a capability |
| `shooter.js` aim ray | `300 + gripGlow * 320` | a readout that says where you point |
| `shooter.js` cone tick | `reach ± 14` | an annotation on the assist arc |
| `game.js` `drawAutoLock` | `+16 + (1 - converged) * 42` | HUD brackets drawn in world |
| `game.js` narrator wrap | `min(W - 70, 470)` | a screen width, in world units |
| `background.js` lattice | `lineWidth = 1` | the substrate's own stroke |

**`routeLateral` was extracted rather than patched in place.** Four numbers
decide the shape of every approach in the game and all four were inline in
`drive`, where nothing could measure them. It is now one exported pure
function, and the case reads it at four screen-equivalent ranges: a body
`D * CFG.scale` world units out is at the same point on the glass at either
era, so the swing it holds there in CSS px is the shape the player sees.
Measured, SWEEP: 186, 186, 119.19, 15.71, 0 — identical at both eras. Left
alone it would have been 121 CSS px against 186 at long range, with the
fold-in happening across 153 px instead of 236: **every route flattening 35%
toward DIRECT**, on the one field a wider view exists to show off.

**The lattice was nearly fixed the wrong way and the wrong way was greener.**
The first edit was `Math.max(1, CFG.hairline)` — the floor everything else on
the field already uses, and it does fix era 2. It also changes **era 1 at dpr
1**, where `CFG.hairline` is 2.016 world units against the 1 written there:
twice as thick, on a field this pass promised not to touch. It is `1 *
CFG.scale` instead, which is bit-identical at era 1 by construction and holds
0.62 CSS px at era 2. *A floor and a scale agree at the era you are looking at
and disagree at the one you are not.*

**And that edit did not compile — `background.js` had no `CFG` import.**
`node --check` passed it, because an undefined identifier is not a syntax
error; it would have thrown on the first frame. The import was added. The
suite would have caught it, but only because the suite draws.

**Two things were checked and deliberately left:**

- **`spawnFormation` / `spawnGroup`'s `Math.min(world.width * 0.22, 190)`.**
  The fraction wins at era 1 (138 on a 390-wide phone) and the cap wins at
  era 2 (213 vs 190), which reads like a bug and is not: the margin exists to
  leave room for the SHAPE, the shape is sized `type.r * 2.5 + 8` and does not
  scale, so the world-unit cap is the term that is actually right. Machine,
  not picture.
- **The two regress guards that read `CFG.zoom` live** — the mine-blast
  ceiling (`innerWidth / CFG.zoom`) and the thumb radius (`44 / CFG.zoom`).
  Both were on the P3b list to be pinned to era-1 numbers and neither needs
  it: every radius they compare against is in `SCALED`, so numerator and
  denominator move by exactly the same factor and the ratios are
  era-invariant by construction. They are era-1-only cases either way, since
  the suite restarts at era 1.

Two cases, 480 green. `an approach keeps its shape on the glass at either
scale` (with a liveness control — the first version asserted the closest
sample was 0 at D=200, where `closing` is 0.143, so it failed on a working
build and the control was the thing that was wrong) and `...and so does the
substrate, which has no config entry to scale`, which records `lineWidth` off
the real `drawLattice` through a proxy ctx rather than reading it back off the
canvas — a 0.62 CSS px line under a colour test is the HITBOXES floor trap
verbatim.

**Not done, and not needed:** no ORDINAL hash. P3b touches no energy, no
targeting and no boss; `CFG.scale` is exactly 1 at era 1 and `fight.mjs` runs
at era 1, so every multiplication in this build is a no-op on the frames the
hash mixes. The two cases above are the proof that the sites are live.
