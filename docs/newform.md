# NEW FORM / NEW FIELD — the build plan

**Status: P1 (238) - P9b (255), builds 256-260's walls and transformation. The plan's structure is complete; P10 (the reveal pass) is what is left.**

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
- [x] P4a · the yard and the sky (build 242)
- [x] P4b · the aperture (build 243)
- [x] P4c · the wall's one-way rule (build 244)
- [ ] ~~P4~~ · the yard
- [x] P5 · the build lots (build 245)
- [x] P6a · the plumbing and the instruments (build 246)
- [x] P6b+c · the radius and the fold, in one build (build 247)
- [x] P7 · balance (build 248), era 2 only
- [x] P8a · the camera, the phase and the clock (build 249)
- [x] P8b · the acts: the unmaking, the core, the ignition (build 250)
- [x] P8c · audio and the smoke arm (251, 252). The banner is P9's.
- [x] P9a · the node, the gate, the save (build 253)
- [x] P9b · the ULTIMATE room and the banner (build 254). Two story lines left for P10.
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

## 15. P4 — the ruling, and P4a as built (build 242)

The phase brief demanded one line stating what the building and the wall ARE,
because the answer moves check-build guards. Six readers surveyed the type
table, the spawn path, the damage-and-mark family, the moods, the draw order
and the codex; three designs were written from different lenses and each was
attacked on four (era-1 safety, mark completeness, wall physics, shippability).
All three came back with fatals. Every decisive claim below was then
re-verified by hand, and two of the survey's were wrong.

### The one line

**The building and the wall are FIELD FURNITURE, not bodies: one derived plain
object at `world.yard`, built in `Game.resize`, null at era 1 and in the
testbed, living in no list that any damage source, chooser, sweep, broadphase,
spawn budget or codex walks.**

### Why — immunity by NON-MEMBERSHIP, not by a mark

The plan assumed a `penned` mark. It is the wrong tool, and the argument is
countable. All twenty-five damage sources reach health through exactly two
doors, `Enemy.applyDamage` and `Enemy.destroy`, and every path to those
iterates `world.enemies`, `world.drops`, `world.debris`, `world.effects` or
the per-frame `bodies` array. A thing in none of them needs **zero** guard
lines. A mark needs **nineteen** sites to keep agreeing with it forever — and
this repo has shipped a mark honoured by four paths out of five more than
once: the practice dummy wore `harmless` for its side effect and silently lost
five damage sources, and the three sites that decide what may be shot have
already drifted apart.

Non-membership also answers the thing a mark cannot: `Game.setEra` empties all
seven lists on its way in, so **a building in `world.enemies` is deleted by the
very switch that creates it.**

The case for it is therefore a **tripwire, not a measurement**, and is labelled
as one: it asserts the yard is in none of the six lists, has no `hp`,
`applyDamage`, `invMass`, `type` or `r`, and survives the era switch. An
assertion that a thing outside every list takes no damage would be vacuous.

### Three statements in the P4 brief were wrong. Struck.

- **"Three check-build guards move."** With this design **zero** move — the
  build reports 41 modules and every other line unchanged. Even for the
  `ENEMY_TYPE` route only `DERIVED` fails closed.
- **`smallestShell` is structurally unreachable**, not a risk:
  `Math.min(... Math.max(t.r + gap, CFG.wardShell.min))` is floored at 26 for
  *any* radius, against a threshold of `CFG.drop.max * 1.5 * 3` = 19.8. No
  fixture, large or small, can move it. The build prints "ward shell floor 26
  is 3.9x" and always will.
- **"The mouth sits below 360 world units"** — 360 came from a docstring
  claiming the interface reaches world y 234 when it reaches 261. The chrome
  reaches **402** at era 2.

### The mouth is ON the entry line, and that is the placement that costs nothing

`ENTRY_Y + CFG.entryDepth` is already three things: the bottom of the interface
(402 measured, against a mouth at 400), the line a body clears `staged` on, and
the end of the fast march `CFG.entrySpeed` exists for. Putting the door there
makes *"a body walks out"* and *"a body becomes live"* the same visible event
for free. **A mouth anywhere below the line quietly retires `entrySpeed` at
era 2** — a constant still threaded and no longer reachable, which is the
`world.endless` shape arriving three builds after the phase that scaled it.

### The codex ruling: no entry, no id, nothing moves

`codex.record` has exactly ONE production caller and it is reachable only past
`if (!e.dead) continue`, so an indestructible fixture can never be recorded —
the brief's premise is correct. The conclusion is avoidable, because the
denominator only becomes unreachable if someone *also writes the entry*.
`codex.total` stays 37, `FIELD_ENTRIES` stays 16, and the wall's rule will be
taught in P4c by a first-use line in `sim7749-lines`, which is this repo's
existing mechanism for a rule with no object (`ON_GLITCH` is the precedent).

### The gate is `era === 2 && !sandbox`, and the second term is load-bearing

`setZoom(era, sandbox)` pins the bench to era 1's *scale* without touching
`world.era`, and both bench doors carry the era across by hand — so
`era === 2 && sandbox === true` is a real, reachable state the suite already
makes the round trip of. A gate on the era alone paints a building and a wall
across the practice range, at era 1's scale, in the one room whose entire job
is measuring damage against a clean field.

### The sky: one derivation, five sites, and the era beats dawn

`Game.skyName()` / `Game.syncSky(snap)` replace the five ambient call sites —
three of which wrote `w.dawn ? 'dawn' : 'staging'` longhand. **`endBoss(7)`
sets `w.dawn` one line before it sets the sky**, and seven reconciled anomalies
is exactly the gate era 2 stands on, so the two arrive on the same frame every
run. Era wins: dawn is what the *old* field looks like once the ladder is
finished; era 2 is a different field, not a later hour of the same one.

**It snaps, and that is arithmetic.** The ease is `k = 1 - exp(-dt * 0.8)` =
0.0132 at 60Hz and `mixHex` rounds per channel, so a channel needs a distance
of 37.8 to move at all. Across the ambient family the largest gradient delta is
under that, so an eased era-2 sky would move the lattice and the accent and
leave the **entire gradient** where it was, while the nebula snapped regardless.
That fault also broke the first version of the case: the control read the sky
it was about to set as the sky it was replacing, because era-1 moods never
arrive either. The case snaps its own control by hand now.

**`setDroneMood` has its second caller, and its first was a no-op.** It has
had one caller since it was written, passing `(41, 320, 0.05)` — which restates
`startDrone`'s own three initial values (`gain 0.05`, `filt 320`, `osc 41`), so
it has never shifted anything and its docstring has never been true. Era 1's
triple is unchanged to the digit and is asserted as the audible identity; era 2
is `(33, 420, 0.045)`. Putting it in `syncSky` rather than in `setEra` closes a
hole all three designs left: leaving the bench goes through `resume()` →
`reset()`, and `setEra` refuses to re-fire for an era the world is already in,
so a bench visit at era 2 left the era-2 sky standing over the era-1 bed for
the rest of the run.

### The building had to be redrawn once, and the first version was invisible

It was filled `mixHex(mood.low, mood.line, 0.2)` — measured, within a few units
of the sky. The building was drawn, correctly placed, and **invisible**, with
only the doorway spill carrying it. A structure that size against a dark sky
reads as a *silhouette* with lit detail, which is also what it is. Screenshots
at both sizes are what found it; the geometry had been green the whole time.

Two instrument notes from that pass: the glitch shader tears the whole frame
and is useless for judging a drawing (the first 320×568 shot was unreadable),
and at 320×568 the visible face is only ~36 CSS px tall, so the ribs and the
door columns do most of their work in the strips between the rail's cells.

`CFG.yard.gap` went 70 → 105 off those shots: 43 CSS px of enemy side reads as
a stripe, 65 reads as a place.

### Split, and why

P4 is three builds, because the full diff is one new module, five CFG numbers,
five SCALED paths, ~14 source sites and eleven cases — against a phase budget
of one request and one suite run, and a user constraint that a credit wall
must leave a working game.

- **P4a (242, shipped)** — `src/yard.js`, `CFG.yard`, the SCALED paths, `sw.js`,
  the four wiring sites, the sky and the bed. Era 2 gains a visible enemy side
  with its own sky. Nothing about spawning or placement moves.
- **P4b** — the aperture: `throughMouth` and `mouthSlots`, and the three spawn
  sites. **The ORDINAL hash belongs to this build alone**, because it is the
  only one of the three that touches a `Math.random` call path `fight.mjs`
  exercises. `spawnFormation` rolls `cx` *before* it picks the type, so the
  mouth override must be applied after the pick and the two must not be
  reordered — that swaps two draws at era 1.
- **P4c** — the wall's one-way rule: `yardHold`/`holdBelow` and the three
  placement clamps (`landingSite`, DECOY, WELL), plus `ON_WALL`.
  `landingSite` needs **no** `x` hoist — the survey claimed one, and `top`
  involves no random draw.

### Open, and carried forward

- **The yard's depth is screen-anchored** at 65 CSS px on every phone, per
  P3b's picture rule. If the enemy's side should feel bigger on a bigger
  screen, `gap` becomes a fraction of `(floorY - mouthY)` — one line.
- **P4c will cost the era-2 mine field ground**, and the lever is
  `CFG.yard.gap`/`clear`, never `CFG.mines.keepTop`, which is a fraction of a
  screen-varying floor and would split the two phones.
- **Rounds fly through the building, deliberately.** A membrane at the mouth
  would make ~80 world units of every boss's frame unshootable — ORDINAL's
  core sits at y 468 at 320×568 era 2 with its outer ring reaching 318 — and
  would turn every missed HE into a burst on the staged queue, since
  `applyBlast` never tests `staged`.
- **The `newfield` hexes are provisional** and have not been swept in Lab
  against the other 45 tones. P10 owns the reveal pass.
- **`lull`, `breach` and `ending` are dead moods** — nothing in `src/` or
  `scripts/` passes any of them to `setMood`. Left alone: `breach` is authored
  for exactly the cinematic's act I. P8 or P10.

## 16. P4b, as built (build 243) — and the hash is not what it says it is

The aperture: `throughMouth` and `mouthSlots` in `yard.js`, and the three doors
that reach the field in a run — the director's single release, its formation
release, and the ambient drift. Splits, blooms and seeded hosts are exempt by
decision: they come off a parent already standing on the field, and the case
counts a birth only *above* the door and says so. `spawnGroup` is the debug
door and passes `here: true`.

**The y is untouched, and that was free.** A released body is `staged` from -50
down to `ENTRY_Y + entryDepth`, which *is* the mouth — and the interface covers
the field to within 36 CSS px of it. So the only part of the march anyone sees
is the last stretch, inside the doorway, drawn over the throat. The chrome does
the occlusion; no draw-order change, no spawn-y change.

**Drift needed the opposite treatment**, because it is the one thing that is
not `staged`: it appears exactly where it is put, so left alone it would have
gone on arriving from the top of the field while everything else walked out of
the door — the one case the requirement names by name. It is laid inside the
throat, keeping its caller's stagger as an offset.

**Formations arrive as rows through the door, and that is arithmetic.** At the
population ceiling the widest authored job is BLOOM ×12, whose `line` spans 995
world units against a 968-wide field. Clamping stacks bodies on the door edges
and the pair solver blows them apart on the next frame; scaling the offsets
crushes `gap` — the thing that exists to stop overlap — to a seventh of what
the body needs. The case measures **frame 2**, which is where a clamped layout
gives itself away.

### The two things this build found, neither of them in its own diff

**1. `fight.mjs`'s hash is a differential instrument and `1796395127` is not
reproducible.** Run on build **211 itself** — the build whose commit baselined
it — this container returns **`-1510979434`**. A number that cannot be
reproduced on its own build is not a property of the code. The probe runs
through `**`, `sin`, `cos`, `atan2`, `hypot` and `exp`, none of which IEEE-754
pins, so the hash is a property of the code *and the container*, and every
cross-session comparison against a written-down value is unsound. Measured
here: 211 → `-1510979434`; 229, 230, 233, 237, 238, 240 → `-1765830468`.
CLAUDE.md is rewritten to say take your own before-run in the session you are
working in, record the delta and its cause, and stop re-baselining.

**2. Build 241's P3b regression, which that discipline caught.** Extracting
`routeLateral` re-associated a floating-point product — `width * routeScale *
routeSide * reach * closing` became `(width * k * reach * closing) *
routeScale * routeSide` — the same value in exact arithmetic, a different one
in the last bit, compounding over 9000 frames, on the build whose entire claim
was that era 1 could not change. The two factors are passed in now so the
era-1 product is `drive`'s original order to the bit; `regress.mjs` asserts it
with `===` rather than to two decimal places, and the hash returned to
`-1765830468`. **A refactor that only reorders arithmetic is still a change.**

**3. The suite has been starving its own later cases.** Eighteen cases in the
damage-bench family write `w.director.update = () => {}` and `w.spawnLock =
1e9` and put neither back; `reset()` keeps the same Director object, so both
outlive every restart after them. This aperture case is the first since that
family to need a wave, and it measured **zero releases in forty seconds at
both eras** while passing in isolation. It sets both explicitly. Fixing the
eighteen is a separate pass and is recorded in CLAUDE.md.

## 17. P4c, as built (build 244) — P4 complete

**The wall is three placement clamps and a drawn line. It is in `physics.js`
nowhere.**

The rule is ONE-WAY, so the enemy half needs no mechanism at all: nothing stops
a body, so nothing is written, and *"enemy objects pass through"* is true by
construction — `drive`, `physicsStep`, `clampToArena` and the routes never
consult it. Only the friendly half is a rule, and it is a **placement** rule
because of a measured fact: **of every friendly summon in the game, exactly one
is a physics body, and it does not move.** The DECOY is pushed into the
broadphase with `invMass: 0`; mines fly a parametric arc in `world.mines`,
projectiles live in `world.projectiles`, and Patch/Front/Ward/Well live in
`world.effects` — `physics.js` can see none of them, and its only collision
test is `a.r + b.r`. A wall spanning the field would be twenty-odd circles,
each a body, each a slot of `CFG.maxEnemies`, to stop one stationary decoy.

The three sites: `landingSite` (one door, all eight mine kinds, `debugThrowMine`
included), the DECOY, and WELL. All three are `Math.max(existing, 0)` or an
identity at era 1, and no random draw moves — the hash came back
`-1765830468`, the value measured on this container at HEAD before the change.

**The rule is taught, not listed.** `codex.record` fires when a thing comes
apart, so an indestructible fixture could never be recorded and the OBJECTS
denominator could never be reached — the brief was right about the mechanism
and wrong about the conclusion, because the denominator only breaks if someone
*writes the entry*. `codex.total` stays 37 and `FIELD_ENTRIES` stays 16.
`ON_WALL` is a first-use line in `sim7749-lines`, keyed off
`world.yard.consulted` — the first time anything is put down at all, which is
when *"your things stop here"* is worth a sentence and not before. `ON_GLITCH`
is the precedent and the reason is identical: a mechanic you cannot look up.

**What it costs, stated rather than hidden.** At 320×568 the visible mine
ground goes 127 CSS px → 69.9 (a 45% cut); at 390×844 it is 24%. That is the
requirement doing what it says. If P7 wants ground back the lever is
`CFG.yard.gap`/`clear`, **never `CFG.mines.keepTop`**, which is a fraction of a
screen-varying floor while the wall is screen-anchored — touching it splits the
two phones.

### Two assertions I wrote wrong, and what they taught

- **A mine's flight legitimately dips into the clearance band.** I asserted the
  arc must stay below `hold`; measured, it peaks 22 units into that band at
  320×568. The band is *what the clearance is for* — the rule is that the arc
  must not cross the **wall**, and the landing must be at or below the hold.
  Two different lines, and the case now asserts them separately.
- **`consulted` is per-world and my pass-through arm reset it.** It asserted a
  flag that only a placement can set, in the one arm that places nothing.

### Deliberately not clamped, each for a stated reason

SPORE's and THORN's patches (residue of something already legally placed, and
sliding a patch away from the hit that made it is the worse failure); every
turret-anchored reach — PULSE at 574.6 fully bought, PRISM 300, PILE 240, WARD
150, LANCE, and STASIS which has no spatial term at all; and every projectile.
Those cross the wall the way rounds do, because a round is the gun's reach and
not a summon.

### The DECOY case asserts a model, not a movement

At 320×568 the wall binds it (wanted 386.6 against a floor of 644.4); at
390×844 it does not (wanted 1071.2, floor 644.4), because the turret sits 461
units further down a longer field. A case that only checked "it moved" would be
**vacuous on the large screen and would say so nowhere**, so the case asserts
`bound` explicitly and requires it true on one screen and false on the other.

## 18. P5, as built (build 245)

Two works beside the machine and four emplacements in front of it, drawn as
dashed empty boxes with a hairline ghost of what would stand there. They live
on `world.yard` — that object is everything the era-2 field puts on the ground,
theirs above the wall and yours below it — so they inherit the gate, the null
check, the single draw call and the non-membership that makes all of it free at
era 1.

**Sited off the TURRET, not off the field.** The field is 1.22× deeper at
390×844 than at 320×568 and the interface either side of it is not, so a lot
placed as a fraction of the field lands under the quick strip on one of the two
phones. Measured at era 2, the works land at x 175–299 and 495–619 on the
narrow screen against strip columns that end at 144 and begin at 650.

**They refuse; they do not swallow.** Four of the six sit exactly where the
thumb goes to shoot, so a lot that ate the press would cost a shot every time
you defended the ground it stands on — and this is a *disabled* control, which
is the weakest possible claim on a tap. The press pulses the lot, says
`ON_LOTS` once, and then goes on to aim and fire exactly as it always did. The
check runs before the grip/aim branch because the two works stand level with
the turret, on the grip side of it.

**Drawn in the language the interface already has for this.** A dashed box with
nothing in it is what the quick strip's empty slots look like; a second
vocabulary for "a place for a thing you do not have yet" is a second thing to
learn. They are the dimmest things on the field on purpose.

### The case measures against the interface, not against the design

The whole risk in P5 is spatial, so the overlap arm sweeps the **real**
`getBoundingClientRect()` of `#barChips`, `#waveRail`, `#abilityBar`, every
`.qGroup` and the menu button, converts them through `CFG.zoom`, and asserts no
lot rect intersects any of them — with a floor on the rect count, because zero
clashes over an empty list is exactly the vacuous pass the arm exists to avoid.
Clearance from the machine is measured against the **drawn rig** (`r * 2.4`),
not `r`: nearest lot 98 units against a rig of 62 at 320×568.

The press arm asserts four things at once — the lot refused, the purse did not
move, `world.ledger` did not grow, and a projectile *was* fired — plus a
control press on empty ground beside it that must refuse nothing and still fire.

Hash `-1765830468`, unmoved against the before-run taken on this container at
build 244. 496 green.

## 19. P6a, as built (build 246) — the plumbing, and three of P6's own instructions refuted

P6 changes a physical constant five subsystems read, against a 500-line drawing
with eight sockets, so it ships as two builds. **P6a moves no pixel at either
era.** It puts the instruments in place *before* the thing they measure — the
inversion of how build 210's ring case was written, which is why that one
passed against four substitute implementations.

### The parity number is exact, and that settles the radius question

`26 * (0.62 / 0.403) === 40` is **true in doubles, with a delta of exactly 0**.
So `shooter.r` joining `SCALED` in P6b+c gives 40.0 at era 2 — not a chosen
number, the parity number: `26 * 0.62` and `40 * 0.403` are both 16.12 CSS px.

Measured before the change: at era 2 the machine's median drawn radius is
**19.8 CSS px against era 1's 26** — the camera ratio exactly (0.762×), with
lit area confirming it (4232 → 2424, and 0.762² = 0.581). The turret is
currently 24% smaller on the glass than at era 1 while everything round it got
bigger. (The first version of that probe read *identical* reach at both eras,
because the furthest lit pixel is a HUD element that already holds its screen
size — the build-199 "widest line" trap again. A percentile of the lit mass
sees it; the maximum cannot.)

### Three of the phase's own instructions were wrong

**1. The proportional-hysteresis instruction is REFUTED, and following it would
re-open a fixed bug.** What sets a body's resting distance is `resolvePair`'s
positional correction, and neither term contains a radius: `pen = max(rr - d -
slop, 0)` with `slop` an absolute 0.4 and `correction` an absolute 0.72, and
the turret's `invMass` is 0 so the whole correction lands on the body. So
equilibrium is `e.r + s.r - slop` at every radius and both margins — 2.4 to
grab, 6.4 to release — are radius-free. `s.r` cancels. Proportional would put
release at +9.23 at r=40: three extra units of grip on a body PULSE has already
shoved clear, and `world.attackers` is what holds the glitch fuse lit, which is
the build-210 leak. The two offsets get CFG seats so the finding is machine
readable and the case can force a release.

**2. `contact.mjs` cannot be the "MK1 unchanged" instrument.** It has no
assertion and exits 0 whatever it draws — and its cell scale is
`(S * 0.17) / sh.r`, which divides by the very radius a change would move. It
is a sheet to look at. There is no golden-image mechanism anywhere in
`scripts/`, so an unchanged-claim needs a digest taken before and after in the
same container: the ORDINAL differential rule, applied to pixels.

**3. My own P5 lot case was measuring a proxy against an empty rig.** It
asserted clearance against `s.r * 2.4` — a constant measured once on a bare
machine — and `restart()` clears `w.ledger`, so it was measuring the smallest
version of the thing it was protecting. It forces the full rig now and measures
`Shooter.reach()`.

### `Shooter.reach()` and what it got wrong first

Computed from `drawMachine`'s own expressions, and validated against the
painted pixels: **38.38 against 38.33 bare, 63.03 against 62.51 fully rigged**.
The first version understated by 5% rigged and 19% bare, for two reasons worth
carrying: a stroke is centred on its path, so every filled part paints half a
line width outside its own geometry; and the barrel is a rounded rect laid
along the aim from `R * 0.16`, so its reach is the far **corner**, not the
axial tip.

### The band case took four instruments

Driving a body in and sampling per frame measured two things badly: the grab
distance swung ±0.6 because the body crosses 2–4 units a frame, and a *release*
was invisible because `checkContact` releases and re-grabs inside one call, so
the net state after `update` is always "attacking". A control at `releasePad =
0.2` didn't work either — the equilibrium sits 0.4 *inside* touching, so that
pad still holds. What works is geometry: place the body at an exact distance
and call the method. Four raw memberships per radius, two true and two false,
identical at r = 26, 40 and 52.

### Also in

The broadphase guard now walks the two static bodies (`Math.max(2 *
MAX_BODY_R, MAX_BODY_R + STATIC_R)` — a *max*, because `2 * MAX_BODY_R` is the
binding term for two grafted BULWARKs and replacing it outright would be
strictly weaker). The dead `DARK` local. The machine's header docstring, which
listed SIGHT — deleted at build 215, no `rig()` key, no node, nothing drawn —
and omitted SIEVE and PILE, both drawn.

Two flakes of mine were re-tuned: the era-1 aperture control asked for 15
bodies against a run-to-run swing of 13–22, and the wall-crossing arm gave a
LURCHER four seconds to cover ground needing 32 u/s. Both were margins set near
the truth rather than clear of it.

Hash `-1765830468`, unmoved. 498 green — though one run in four showed a single
failure I did not capture and could not reproduce in two further runs.

### P6b+c must ship as ONE build

At r=40 with MK1's barrel proportions the flashed envelope is 101.45 against a
build-lot inner edge of 98.46 — **the radius alone is red**. The fold is what
pays for it: the MK2 grows *inboard*, its envelope falling from 2.393r to about
2.010r, which is also what keeps `s.r * 2.4`, the fuse ring's `2.35 + filled *
0.55`, the contact cell's 2.94r and the hero card's 190 all meaning what they
mean. Splitting them would land a red build.

## 20. P6b+c, as built (build 247) — the MK2

Shipped as one build, because the two halves are not independent: at r=40 with
MK1's barrel proportions the machine reaches into a build lot, and the fold is
what pays for the radius.

### The radius is parity, and parity is exact

`shooter.r` joins `SCALED`. `26 * (0.62 / 0.403) === 40` **in doubles, delta
exactly 0** — `26 * 0.62` and `40 * 0.403` are both 16.12 CSS px. Not a chosen
number. The machine had been shrinking as the camera pulled back (measured, a
median drawn radius of 19.8 CSS px at era 2 against era 1's 26), and this puts
it back; the fold is what makes it read *bigger*.

`SCALED` moves the TABLE and `new Shooter` reads `CFG.shooter.r` once, with
`reset()` never re-reading it — so `Game.resize` writes the running machine's
radius, and `resize` is the single funnel every door goes through.

### The gate is `CFG.mk2 = CFG.scale > 1`, never `world.era`

One writer in `setZoom`, on the line after `CFG.scale`, so the form and the
size come from the same expression and cannot disagree. This is not tidiness:
both bench doors carry the era across by hand while `setZoom` pins the bench to
era 1's scale, so `w.era === 2 && w.sandbox` is reachable — and a shape gated
on the era would draw the MK2 at the MK1's radius in the one room a player pays
20,000 energy for.

### What folded, and why alpha was not the answer

The plan said to fold three "hung-on" pieces and that everything else is
already 0.97–0.99 alpha. **The alpha premise is half wrong**: ARRAY fills at
0.99, the same as the hull. What makes ARRAY and SIEVE read as bolted on is
GEOMETRY — they are seated at `R * 0.8`, *inside* a hull that reaches 1.32R,
with absolute extents floating in half a radius of air that nothing joins. So
the MK2 seats them on the outer plate at `R * 1.08` and sizes them off the
machine.

Alongside: the hull goes `1.0 + 0.16i` → `1.10 + 0.20i` with the per-plate
twist cut from 0.26 to 0.08, so three separately rotated rings become one
bevelled mass; the race recesses to `1.14 + 0.12i`; and the barrel becomes a
siege gun — two thirds the length, more than twice the width.

**Measured: the painted envelope falls from 2.404r to 2.14r.** Bigger
absolutely (62.5 → 85.6 world units) and tighter per radius, which is exactly
what buys the clearance: **12.88 units to the build lot, identical at 320×568
and 390×844**.

### How "MK1 is unchanged" was actually established

There is no golden-image mechanism in this repo and `contact.mjs` cannot fail,
so the claim rests on a **before/after digest taken in this container**: ten
ledgers (bare, each of the eight sockets alone at full levels, everything),
rendered through `drawMachine` directly with spin, heat, recoil, aim, grip,
rigFlash, pileT, attackers, time and the hairline all pinned. **All ten
byte-identical before and after.** Every substitution is a ternary selecting
between two literal expressions — never a re-association, which is what moved
the hash at build 241.

In the suite the falsifiable version is different and needs no golden data:
each era is rendered into the same cell at a scale derived from **its own
envelope**, so size is divided out — the very self-normalising that makes
`contact.mjs` blind here, used deliberately. Revert the fold and the two frames
become the same picture and the case reads its own control (which must be
exactly 0).

### `reach()` and the pad, twice wrong

The allowance for what a part paints outside its own geometry was a flat 1.2,
which understated MK1 by 5% rigged and 19% bare; then a flat 3.4, which covered
MK1 and not MK2, whose barrel is more than twice as wide. It is `MK ? R * 0.115
: 3.4` now — MK2's ornament is proportional to the machine so its allowance is
too. **Fitting one number to whatever the day's render measured is how a
ceiling stops being a ceiling**; it is asserted against painted pixels at both
eras, bare and fully rigged.

One note corrected in the same commit: a draft claimed the hull had become the
furthest thing on the MK2. It has not — the barrel still is, by about four
units.

Hash `-1765830468`, unmoved. 501 green.

## 21. P7, as built (build 248)

+30% on every round and every mine, era 2 only. `CFG.power` is written by
`setZoom` off the same expression as `CFG.scale` and `CFG.mk2`, so it is
**exactly 1** at era 1 and multiplying by it there is the identity.

### One door, not twenty

It is applied at `Enemy.applyDamage` — the one place all seventeen already
arrive under their own name — and **not** at the twenty-odd damage constants,
and not at `up.damage` / `up.mineDamage` either. Those two reach ten and six
sites between them, and **WIRE is outside both**, on `up.wireDamage` of its
own: a per-multiplier change would have shipped one of the eight mines
unboosted. The source set is derived from `ARSENAL`, so a new round or mine is
in it by existing.

Two details that matter: the guard is `CFG.power !== 1` *first*, because
`applyDamage` runs tens of thousands of times in a boss fight and era 1 must
cost a comparison and nothing else; and `ARSENAL` carries **nineteen** entries,
not seventeen — AUTO AIM and AUTO FIRE live in the same table under
`kind: 'auto'` and neither is a weapon.

### The bench found a real gap in P3's sweep

**`rounds.explosive.cluster.out` was not in `SCALED` while the sub-blast radius
was.** So at era 2 a 132-unit sub grew to 203 while its centre stayed 200 units
from the body, and HE's clover stopped being self-similar — the cluster block's
own docstring guarantees "the added single-target damage stays 0" on exactly
that geometry. Measured, HE delivered **1.85×** against every other round's
1.30: CLUSTER silently doubling single-target damage, which is the fault build
220 removed. It is in `SCALED` now.

That is what "measure it, don't read it off the constant" is for. Reading the
constants would have reported +30% and shipped it.

### Three faults in the instrument, all mine

- **`ledger.total` is not the source's damage.** PILE fires on its own clock
  onto the same wall, and the total credited LODE and VOID with 117.7 each —
  two mines that mostly do none. The source's own **row** is the measure.
- **A fixed world distance is not a fixed geometry.** Every blast radius is in
  `SCALED`, so a target held 300 world units out sits relatively closer to the
  centre of an era-2 burst. The wall stands at `300 * CFG.scale` now.
- **...and neither is a fixed target size.** The rig's radius is era-1's by
  ruling, so a near-miss that fell short at era 1 reaches it at era 2. SPALL
  read 1.52 until the bench scaled the target too.

Also corrected: a build-231 note says SNARE, LODE and VOID all book nothing by
design. On this build **only SNARE does** — the other two book, and book 1.30×.
The case treats "books nothing" as an outcome it reports rather than an
assumption it asserts.

And the window went 8s → 16s for rounds: a heavy round fires few enough times
in eight seconds that one round either way is 8% of the reading, and SLUG swung
1.14 to 1.31 between runs. A band set against a sample too small to hold it.

Median across all sixteen live sources: **1.300** against a configured 1.3.
Hash `-1765830468` unmoved, MK1's ten machine digests still byte-identical,
503 green over two consecutive runs.

## 22. P8a, as built (build 249)

The camera, the phase and the clock. No art: what this build claims is that the
thing runs for thirty seconds, takes the field without paying for it, moves
nothing that belongs to the run, lands on the new field, and can be skipped
into exactly the state it would otherwise have reached.

### It is a `world.phase`, and that does most of the work

`world.phase = 'evolve'` and two dozen readers whose dominant test is
`!== 'staging'` **all fail closed**: the director stops releasing, the story
stops, the menu's tier controls disable, the bench refuses its door, and
`SAVABLE` is `new Set(['staging'])` — so **not one autosave is written across
the whole thirty seconds**, which is six of them that would otherwise have
captured a half-evolved run.

What `phase` does *not* stop only tests `'boot'`: firing, mines and abilities.
Those are handled by the evolution owning the frame — `update` runs
`updateEvolve` and returns, so no physics, no steering, no intake, no mine
clock and no fuse advance. That is what lets the case assert the purse,
`earned`, the kill count and all seven lists are untouched from the first frame
to the last.

### The camera is a VIEW multiplier and touches nothing else

`world.camera` never writes `CFG.zoom`, `world.width`, `world.floorY` or
`CFG.scale`. Writing an arbitrary zoom would drag every one of the fifty-odd
`SCALED` paths continuously and **flip `CFG.mk2` the instant it crossed 0.62** —
a different game every frame of the push-in. At `camera === 1` the draw
transform is the one this game has always had, to the digit.

Measured through a run: view 0.62 → 0.829 → **1.1 by act III**, held through the
unmaking and the core, and **still exactly 1.1 across the era flip** at act V —
`0.62 × 1.7742` and `0.403 × 2.7295` are the same number, so the picture does
not jump on the frame the field changes — then out to 0.403. It crosses era 1's
own 0.62 exactly once, outbound, which the case asserts: twice would be the
push and the pull sharing a path, never would mean the flip jumped.

The clear had to move to the device. At camera > 1 the world box no longer
spans the screen, and a `fillRect(0, 0, world.width, world.height)` leaves the
last frame around the edges.

### `takeField` extracted rather than copied

`setEra` already had the clear that names all seven lists and drains
`pendingBlasts` last. The cinematic needs the same thing without the era
switch, so it is one method now with one caller each. A second copy naming
three of the seven under a comment about needing a clean field is this repo's
own scar.

### The skip and the reduced-motion arm

A tap anywhere skips, refused for the first 1.5s so a tap still in flight when
the banner was pressed cannot eat the thing the player just asked for — and a
skip lands in *exactly* the end state, asserted against the full run's.
Reduced motion runs the same acts in the same order at a fifth of the length
rather than a different sequence nobody has watched; it triggers on
`prefers-reduced-motion` **or** SCREEN SHAKE / OFF, which is a multiplier whose
OFF is `0` and not `false`.

### An instrument note

The first filmstrip was read wrong: the page's own rAF loop advances the clock
between the step and the screenshot, so `film-17.png` was not t=17. That is
CLAUDE.md's "judging an effect off live screenshots measures the frame loop"
verbatim. The numbers above come from reading the state at the step; the
picture comes from freezing `g.paused` before the shot.

Three cases, 506 green, hash `-1765830468` unmoved.

**P8b owns**: the unmaking in ledger order, the core, the ignition, the sky
turnover, the captions through `world.bossLine`, and the DOM chrome retreating
through act II — it is still at full opacity in the shot above.

## 23. P8b, as built (build 250)

All six acts, on the clock P8a built.

### The unmaking is free, and different every run

`world.ledger` is already ordered, so the machine comes apart **in the order
this player built it**. It is done by truncating the effective ledger from the
front of its turret entries: `rig()` caches on `world.rigAt === ledger.length`,
so a shorter list is enough to redraw the machine with one fewer part — and
`drawMachine` never learns the cinematic exists, which is what keeps P6's ten
byte-identical MK1 digests meaningful.

The case asserts the survivors are the **tail** of the build order, not merely
a subset of it: a set comparison could not tell "in the order you built it"
from any other order. Measured mid-act-III: 11 of 18 shed, 7 left, tail
confirmed, rig no longer full — and everything the player bought is back by the
ignition and whole at the end.

### The core, and the form building out of it

Acts IV and V are done at the **call site** in `Game.draw`, not inside
`drawMachine`: the machine's own drawing carries the MK1-unchanged promise, and
a cinematic has no business in there. A scale about the turret and one point of
light are both things the caller can do from outside.

### `takeField(false)`, not `true`

Act I is the field being *taken*, and a cut to an empty arena is not that. The
bodies fizzle and are hauled into the turret; `takeField` marks each `spent`
and `dissolved` first, so none pays, counts or can be shot on the way out. The
P8a case had asserted an empty list on the frame after the press — true of the
instant clear, and not the beat — so it now asserts the lists are empty **by
the end of act I**, and that bodies were still fizzling one frame in.

### Two things reused rather than built

`breach` — authored for exactly "everything drains out of the substrate" and
with **no caller anywhere in the codebase** until now — is act I's sky. And
`UNDER` is exported from `tree.js` so the socket list has one home; a second
copy of the eight ids is a second thing to keep in step.

Moods **snap** at act boundaries rather than easing, because `mixHex` cannot
move a channel closer than 37.8 and an eased mood arrives two thirds of the way
and stops. A cut is honest; a stalled dissolve is a rendering fault.

### An instrument note, again

Two probes were wrong before they were right. Sharing one page across five
shots let the live rAF loop advance the clock between the step and the
screenshot, so the readings stopped matching the marks they claimed — one page
load per shot fixed it. And the chrome's retreat is CSS, which runs on
wall-clock while the acts run on game time, so a probe that compresses 17
game-seconds into milliseconds catches the fade half-done. Neither was a fault
in the game.

Four cases, 507 green over three consecutive runs, hash `-1765830468` unmoved.

**P8c owns**: audio (the longest cue in the game is 270ms and `boom()` is
ungated, so act I would be forty overlapping detonations if it used what
exists), the banner that starts it, and `smoke.mjs`'s era-2 arm.

## 24. P8c part one, as built (build 251)

**`smoke.mjs` can leave era 1.** It is the repo's only screenshotting probe and
it could not, which meant the new field — the building, the wall, the six lots
and the MK2 — had never been photographed by the game's own instrument, only by
throwaway probes that died with the session.

It buys the machine, presses the evolution, runs the **first seconds under the
real frame loop** (t=6.7, act 1, view 0.889 — that is what a smoke test is
for), then steps the remainder by hand rather than spending thirty wall-clock
seconds, and shoots the arrival. And it **asserts**: era 2, camera 1, phase
staging, `evolve` null, a yard with six lots, `shooter.r === 40` — pushed onto
`errors`, so the exit code carries it. This file's own comment is about a
readout that went wrong and stayed green for fifty-three builds; a screenshot
with nothing behind it is that again.

**The glitch is off for the animation, which was an explicit requirement and
was not met.** `Director.douse()` puts out the FUSE; `glitch` is the shader the
fuse drives, and it decays over seconds — so entering the evolution off a
breached turret carried a screenful of tearing into act I, whose whole point is
that the field is already gone. `beginEvolve` resets the shader and clears
`world.shock`.

**A note I nearly wrote the wrong way round.** The captions in the smoke shots
come out scrambled, and the obvious reading is that the glitch is tearing them.
It is not: `Narrator.draw` scrambles a line on its way OUT by design
(`narrative.js:150`), so a caption caught mid-fade is *meant* to look like
that. I had already written the docstring blaming the glitch before checking.
The fix is right for its own reason; the reason I first gave for it was wrong.

507 green, hash `-1765830468` unmoved.

### Open: the audio

Still unanswered, and it is a real decision rather than a task: the longest cue
in the game is 270ms, `boom()` is ungated, and the plan says P8 "owns a track or
says it has none". A survey and design pass is running; whatever it concludes —
including a reasoned refusal — belongs here as a decision with its reasons, not
as a silent omission.

## 25. P8c part two, as built (build 252) — the audio, decided

**BUILD, but the bed and not a score — and the commit does not call it one.**

The refusal case died on a measurement. Driving the real cinematic with a
wrapper on the audio bed gave **one event in thirty seconds** — a single
`setDroneMood(33, 420, 0.045)` at t=19, and that a side effect of `syncSky`
rather than a cue — plus 17 thuds. That is the entire soundtrack of the payoff
of seven boss fights.

**It does not become a score either, and that is an engineering fact.** Three
things a score needs are absent: `tone()` and `noise()` read
`this.ctx.currentTime` at the moment they are called and take no time
argument, so **nothing in this game can be placed ahead of itself**; there is
no cancel of any kind against a skip that can land anywhere in [1.5, 30]; and
`reset()` did not clear `world.evolve`, so a queue would have outlived its own
run. A bed made of `setTargetAtTime` destinations on params that have been
running since `audio.init()` needs none of the three — no queue, nothing
pending, nothing to cancel.

**And the one gesture available is the only unheard one.** `startDrone` starts
six nodes at init and *nothing in the codebase ever stops them* — there is no
`stopDrone`, and no `disconnect` anywhere in `src/`. **The room has never once
been quiet.** Every other sound this piece could make has been heard hundreds
of times. So act IV's level is a hard `0`, and the render reaches **exactly 0
RMS and 0 peak** inside the act, at full span and at reduced motion both.

**Row VI must equal what `syncSky` puts on era 2, and that is an assertion.**
After `endEvolve` the era is already 2, so `setEra` does not fire and nothing
re-issues the bed for the rest of the run: wherever the last row leaves the
room is where era 2 lives. The case reads both off the wire rather than
comparing the table with itself.

**One voice, and a triangle rather than the obvious low sine.** Measured
through a two-pole highpass at 200 Hz — a crude model of what a phone can
reproduce — a 33 Hz sine comes back **23.7 dB down** on a triangle at 132→66
and would have shipped inaudible. 132 and 66 are four and two times the new
tonic, so it is locked to the bed and timbrally apart from it. Peak with the
drone under it is −17.9 dBFS, under the compressor's −14.

### The bug this found rather than shipped

**`reset()` never cleared `world.evolve`** — `endEvolve` was its only writer. A
restart taken mid-cinematic left the clock standing on a fresh run: `update`
kept returning early and the new run flipped *itself* to era 2 when the old
one's thirty seconds were up. Same shape as the `world.era` fault P1 shipped,
and for the same reason — `reset()` is where a run's state is put back, and a
field only its own happy path clears is a field that survives.

### Engine cost: one optional parameter

`setDroneMood(base, cutoff, level, tc = 1.4)`. Its two call sites both pass
three arguments and both get exactly what they got before; the default is
**asserted**, not assumed, so it cannot be quietly retuned. No new module, so
`sw.js` is untouched. Not one byte of any of the twelve cues changes, `boom()`
stays ungated, and the ordinary game sounds identical.

The existing drone case had to widen its spy from three arguments to four — a
three-argument spy would have recorded the era-1 and era-2 triples correctly
and been **blind to the whole of the bed**.

### What the piece is, honestly

One bed shaped across six acts, about two and a half seconds of true silence at
the core, one modulation, one voice, and the seventeen thuds the unmaking
already made. A complete gesture at its own scale. Not a soundtrack.

511 green, hash `-1765830468` unmoved, smoke clean.

## 26. P9a, as built (build 253) — the node, the gate and the save

**RECAST is NEW FORM, and `id: 'recast'` never changes.** A saved run writes
bought ids into `world.ledger`, so renaming the id takes a paid-for node away
from everyone who has it — the same reason the testbed is still `sandbox` in
three places after two renames.

**`repeat: true` and `levels: 1` moved together**, which they had to:
`levelsOf` returns `Infinity` for a repeat node *before* it reaches the
mandatory-levels throw, so a level count beside a `repeat` is dead text.
check-build's line went `1 repeatable (recast)` → **`0 repeatable ()`**, and the
ladder 108/54 → **109/55**.

**Seven REMAINDERs, no energy** — one per anomaly, so the price *is* the
ladder. It cannot be farmed, cannot be saved up early, and cannot be paid in
the currency everything else takes. The boss's own alert now reads
`n OF 7 · NEW FORM, IN THE TREE`: the count is the progress bar.

**`needs` is a predicate, and it is not the `needs` build 228 deleted** — that
one was a node id, this is a function of the world. The gate is `rigDone() &&
reconciled.length >= 7`, and `rigDone` is defined as *the hero readout reaching
its own denominator*, so the requirement and the thing that displays it are the
same fact and cannot drift apart.

**`era` joins the save here and not before.** While the only way to era 2 was a
debug stepper, writing it to disk would have stranded a run in an unfinished
era across every reload. The restore also has to `resize()`: `reset()` puts the
world at era 1, the restore sets it back, and nothing between them re-derives
the scale, the form, the yard or the lots — and `setEra` *cannot* do it,
because the world is already at the era it needs to be at and it refuses.

### Three faults this build found

**1. `tree.js` copies an EXPLICIT field list.** `available()` consulted
`n.needs` while `n.needs` was undefined, so NEW FORM was buyable with one
REMAINDER out of seven — gate written, gate never consulted. Anything a node
needs has to be named in that builder.

**2. `debugBuyAll` was handing out the NEW FORM for free.** The loop calls
`apply` and pushes the ledger **directly** — it never consults `available()`
and never spends the currency. It skipped `repeat` nodes for exactly this
reason ("handing out ways in is not what MAX UPGRADES means"), and the moment
NEW FORM stopped being one it started being granted, silently, with the button
still saying "+N upgrades". It skips anything gated or on its own currency now,
stated as the rule rather than as an id, so the next one is covered by
existing. **The BUILT readout is therefore still 136** — I had already written
137 into the case before finding this.

**3. Two of my own cases were asserting the old design**, correctly, and had to
be inverted rather than patched: P1's *"era 2 does not survive a reload"* is
now *"era 2 is bought, so it survives"*, and *"RECAST is the only thing that
spends it"* is now *"one REMAINDER is not a NEW FORM"*. A third was measuring
its own noise — it counted every `tone()` in thirty seconds as the ignition,
including fifty-five purchase sounds.

The gate case tests each half **alone**: a gate only ever tested with both
halves missing cannot tell an AND from an OR.

514 green, hash `-1765830468` unmoved.

## 27. P9b, as built (build 254)

**The ULTIMATE room is two states in one panel**, the shape the testbed's room
already uses. Shut, it names what is behind the door and **counts both halves
of the gate** — `THE MACHINE FINISHED · n of 18` and `EVERY ANOMALY RECONCILED
· n of 7` — because a locked door that does not say how far off it is, is a
locked door nobody saves for, and both halves move on their own while you play.
The counters are read off the same facts `rigDone()` and the price are, so the
room cannot say ready while the tree says locked. Open, it is one button.

**The banner is up only between buying the NEW FORM and taking it**, and
pressing it is the door. It sits over the middle of the field rather than in
the top furniture on purpose: `Hud.pillCap` measures the gap up there and can
legitimately return 0 on a 568-tall screen, so anything added to that column
costs a teaching line.

Its case asserts the **rendered box**, never `hidden` — `[hidden] { display:
none }` is the user agent's, at one class of specificity, and loses to any
author rule on an id, so the property flips and the element stays on screen
taking taps. Builds 185–186 verbatim. And it is pressed **through its handler,
on the element, with `pointerdown`**.

### Two things the cases caught

**1. A selector another thing already owns.** My BEGIN button was
`className = 'sbEnter'` — the class the testbed's door owns — and
`buildUltimate` runs *before* `buildSandbox`, so the testbed's own case, which
reaches for a bare `document.querySelector('.sbEnter')`, silently got my button
instead. It pressed BEGIN, started a thirty-second cinematic, never entered the
room, and died on a dummy that was never placed. It is `ufEnter` now and the
case is scoped to its panel.

**2. The banner could appear over the field it had already changed.** Forcing
`newForm = 'armed'` at era 2 showed it — and `beginEvolve` refuses there, so it
would have been a visible button that does nothing. Its condition IS
`beginEvolve`'s own now.

### Not done, and why

The two story lines the plan lists — `game.js`'s "there is nothing above the
tree" and the seventh-anomaly moment — are **left for P10**. They are prose
about a thing that now exists, which is exactly what a reveal pass is for, and
writing them now would mean writing them twice.

516 green, hash `-1765830468` unmoved, smoke clean.

## 28. Build 255 — the banner stayed on screen, and its case said it did not

Reported from play: the button does not go away when you press it. It was true,
and it was true for the whole thirty seconds.

**The cause.** `Hud.syncNewForm` is called from a HUD block that sits *below*
`update`'s early return for the `evolve` phase. For thirty seconds the
evolution owns the frame and returns before that block, so nothing syncs the
banner at all — it was hidden only when the cinematic ended and the ordinary
update path resumed. Measured through the real loop: shown at the press frame,
at 1s, at 10s and at 25s.

**Why the case did not catch it, which is the part worth keeping.** It called
`g.hud.syncNewForm(w)` by hand after each step and read the result. That tests
the function; the game never called it. The case's own comment quoted
CLAUDE.md's rule about pressing controls through their handler — and then broke
the same rule one level up, on the *sync* rather than on the press.

**The fix is in two places and both are needed.** `beginEvolve` hides it on the
frame it is pressed, because a banner that goes on the *next* frame is one the
player sees flash under their thumb; and the evolve branch names
`syncNewForm` explicitly, because anything that must stay right across those
thirty seconds has to be named there — the block that normally owns it is
unreachable.

**The case now touches no sync at all.** Every reading comes out of `g.update`,
off the rendered box, sampled at the press frame and at four points across the
acts. Reverted, it fails with exactly the reported symptom:
`{"frame1":true,"act2":true,"act3":true,"act6":true}`.

517 green, hash `-1765830468` unmoved.

## 29. Build 256 — the walls nothing could see

Reported from play: things bounce off nothing at the edges of the screen, and
it is not clear why. The field has always been a box with hard sides and
nothing has ever drawn them.

**The answer is not to draw them.** Four permanent lines round a field whose
whole look is open space is a worse picture than the question it answers. So
the walls are invisible until they are touched, and then only the stretch that
was touched, for about half a second: `fx.edges` and `edgeHit(x, y, power,
axis, color)` in fx.js. A gradient perpendicular to the edge, fading along it,
plus a short brighter line at the point of contact — a bruise on the air rather
than a line, because the moment it looks like a wall it has answered the wrong
question.

Three things about the emitter are load-bearing:

- **Marks MERGE rather than stack.** A body resting against a wall is clamped
  every frame and a round can ricochet twice inside one step. Without the
  26-unit merge, sustained contact composites dozens of marks in one place and
  reads as a painted wall. The case fires twelve rounds into the same stretch
  and asserts the result is one to three marks, not twelve.
- **It draws FIRST, under everything.** A wall painted over the round that just
  bounced off it reads as the round going behind the wall.
- **Sides only.** The floor is drawn and always has been, so a body landing on
  it stops against something visible and has nothing to explain —
  `clampToArena` returns the same impact for both, and taking the floor branch
  out is the whole difference between answering the question and decorating.

**Era 1 keeps its open top.** A round leaving through the top goes through
`endProjectile(..., false)` — no burst — and lights nothing. That was already
true; the case pins it, because it is the one edge of the box that is
deliberately not a wall.

**Era 2's wall is the opposite rule and it is now enforced from both ends.**

- A round that reaches `yard.wallY` moving up is ABSORBED: `endProjectile(...,
  false)`, so an HE is swallowed rather than detonating against it. `resolveSegment`
  runs first in the same step, so a body leaning down through the line is still
  hit before the absorption is considered.
- `shielded(world, e)` in yard.js is the other half of `holdBelow`: true for a
  body with no pixel past the wall's bottom line (`e.y + e.r <= wallY`), and
  false the moment `world.yard` is absent, so era 1 and the testbed pay one
  property read.
- The guard sits in `Enemy.applyDamage`, before the power multiplier, before
  ARMORED and before the impulse. That one door covers every round, mine,
  patch, beam and blast in the game.
- The four things that do NOT come through that door — LODE's push, SNARE's
  grip, WELL's knot and STASIS — honour it themselves, because each writes
  `vx`/`vy` by hand. So do the choosers: `autoTarget`, `bestTarget`,
  `densestPoint` and the mine trigger, because holding a lock on something that
  cannot be hurt is the turret aiming at nothing.
- `applyBlast` lights the wall where a shockwave reaches it. Nothing past it is
  touched, but the blast plainly stopped against something.

**The guard is written as the COMPLEMENT of the player's sources.** `ENEMY_SRC`
is `contact` and `bloom` — two bodies grinding, and a BLOOM taking its
neighbours with it. A hand-kept list of PLAYER sources is the shape CLAUDE.md
warns about: the next round or ability added would be absent from it and would
therefore be the one thing able to shoot through a wall. Enumerating what is
not the player's fails the other way, where the worst a miss can do is stop
something that should have been allowed.

**The case failed first, and it failed for the right reason.** The autoTarget
arm put both bodies on the turret's own column and asked the assist to choose:
the wall stands 1061 units off the machine on the tall screen against a stock
assist reach of 615, so BOTH arms returned null and the arm would have passed
on a build with no guard in it at all. It buys ARRAY (`w.up.aimRange = 4`) and
asserts the reach covers both distances, which is the arm proving it can see a
one before it is allowed to report a zero.

`burst` is the assertion for "no HE explosion" rather than a ring count: it is
the callback `endProjectile` invokes when `impacted` is true, so a round
absorbed with `impacted: false` cannot call it whatever the effect pool happens
to be doing that frame.

523 green, hash `-1765830468` before and after in this container.

## 30. Build 257 — the assist stops at the wall

Reported from play: "have auto-aim stop at enemy wall; the turret should not be
able to target anything beyond the enemy wall." Build 256 had put `shielded`
into `autoTarget`'s main loop and nowhere else, which left both halves of that
half done.

**The function was half done, in the shape this repo has been caught by twice.**
`autoTarget`'s hysteresis block is the same legality question asked a second
time, and the second copy did not get the new rule — exactly as it did not get
`spent` in build 219 until a boss had held a lock through 18% of its own outro.
`heldLive` is set before the loop's `continue`s, so a body shoved back behind
the wall still reached that block, passed every test it applied, and kept the
lock. Reverted and measured: **90 of 90 frames still locked, 0 damage taken** —
the barrel slewing to it, the gun firing, the reticle painting, every round
swallowed at the line. Three ordinary things push a straddler over: a bolt's own
knockback, a PULSE (340 unscaled, 53 units past the wall), and LODE's repel.

Both callers take one `legal` predicate now:
`(e) => !e.dead && !e.staged && !e.spent && !shielded(w, e)`. `harmless` is
deliberately outside it — the loop applies it by aim mode and the hysteresis
applies a flat version, and folding those would be a behaviour change dressed
as a tidy-up. **A rule that has to be written twice is a rule that will be
applied once.**

**The picture was not done at all, and the obvious fix was the wrong one.**
Measured at 320x568 era 2: the wall stands 286.6 units above the turret and the
STOCK reach is 615.4, so with nothing bought the dashed arc ran 328.8 units into
the enemy's half, through their building, both cone ticks inside the yard.

Clipping the RADIUS — `min(reach, y - wallY)` — was checked and rejected on
arithmetic, not taste: **reach is a radius and the wall is a line.** At 286.6
against 615.4 it throws away the whole lower-outer cone, and a body 392 units
out at 1.18 rad off vertical is 724 deep, well past the line, a target the
assist takes and the gun kills. It would also make both levels of ARRAY buy
nothing on that screen — the `world.endless` shape, a bought node still threaded
and no longer reachable — and make the card a lie in the one direction that
cannot be defended.

So the boundary is drawn as what it is. `wallPhi = acos(up / reach)` is the
half-angle inside which the wall is nearer than the reach: outside it the
boundary is the arc, inside it the boundary is the wall itself, and the two
meet. At 320x568 stock that is a dashed run along the wall turning down into
two short arc stubs at the cone edges. At era 1 `wallLine` is null, `wallPhi` is
0, and it is the single `ctx.arc` it has always been.

One trap inside it: **`ctx.arc` draws a line from the current point to where the
sweep STARTS**, so the `moveTo` has to be the low angle and not the near one. On
the left shoulder those are opposite ends, and the difference is a chord laid
across the cone.

**Three more one-liners on the same promise.** The aim ray is clipped at the
wall (bearing is still the player's — manual aim may point into the yard, and a
body leaning down through the line is a legitimate manual shot; the reach the
line draws is not). `drawTouchAid`'s per-body ring skips a shielded body — it is
the topmost mark on the frame and `touchLift` is 86 units at era 2, so a thumb
well inside the play band can put the crosshair on the wall. And `applyBlast`
skips a shielded body in the blast loop, because the graft loop calls `hitGraft`
directly five lines before the guarded `applyDamage` call.

**A round's whole STEP stops at the wall now, not just its end.** Build 256
absorbed the round after `resolveSegment` had swept the entire frame step — 26
units at 60Hz, 426 at `CFG.maxFrameDelta` — so the sweep reached across the line.
`applyDamage` refuses the damage, but three things sit above that guard and were
reached anyway: `hitShard` and `hitGraft`, which take no world and have no guard
of their own, and PRISM's `reflect`, which answers a hit before any damage is
computed. Clipping the step is the class rather than the three. The era-1
expressions are untouched and nothing in the clip runs there.

**What is deliberately NOT clipped away**: a WARDEN's shards ride at
`orbitR + SHARD_R`, well outside its own radius. Measured, one shard hung **2.7
units past the wall** and was taken while the body it belongs to lost nothing.
That is the rule the wall states, applied to a body that is not a circle.

**The instrument had to be rebuilt once.** A whole-frame diff of the live canvas
reported 123 changed pixels above the wall for a readout that provably draws
none: the arc is a hairline at 0.12 alpha over a lattice that is already blue, so
the band that has to be read is the whole top half of the field rather than the
one row the build-109 case gets away with — and after five hundred cases that
band is full of things the toggle did not put there. The drawing arms render to
an OFFSCREEN canvas instead and count LIT PIXELS ABOVE THE WALL, which is a
reading and not a difference. The first version of the lock arm was wrong too:
it put its challenger 420 units up, which on the short screen is itself behind
the wall, so the arm asked nothing. `challengerLegal` is asserted now.

**Reverted, both mechanisms fail loudly**: the lock arm reports `STALE` and 90 of
90 frames held, and the arc puts 267 lit pixels past the wall at stock reach and
76 at one ARRAY. (At two ARRAY the arc leaves the top of the frame entirely and
reads 0 — the low multipliers are what carry that proof.)

### Recorded and deliberately not built

An audit of every path found more than the request covers. These are real,
measured, and left alone on purpose:

- **STASIS's freeze is global.** `world.stasis` has eleven readers in
  enemies.js with no per-body test; the `shielded` guard build 256 added covers
  only the one-off damp on the press frame. Its drawn brackets (`drawStasis`'s
  `mark`) have no wall test either.
- **SNARE's drawn wires and LODE's reach ring** paint past the wall to bodies
  neither of them is acting on — 221 and 189 units past it — eight hundred lines
  from a docstring saying the picture must be the set `grip` actually takes.
- **WARD's surface loop** (abilities.js:741) reports cutting a body the wall
  protects; the arcs loop eight lines below it does carry the guard.
- **ARC's chain** jumps to a shielded body: no damage lands, but the jump is
  spent and drawn, and `lastHit` is written.
- **PILE's front** writes `thrown` before the guarded `applyDamage` call.
- **`aimLead` uses `CFG.bolt.speed` raw**, missing both `up.speed` and
  `CFG.scale` — 0.023 rad of lead error at era 2. Not a wall bug at all.
- **AUTO FIRE keeps firing at the last bearing** when a lock is dropped, wall or
  otherwise, and `up.slew` silently stops applying the moment `autoSteering`
  goes false.

### The era-2 boss landmine, which is why `wallLine` consults `world.boss`

Measured at 320x568 era 2: the wall is at 561.5 and the turret at 848.1, so the
open field between them is **287 units**, while boss standoffs are 340-380 and
are NOT in `SCALED`. ORDINAL, GNOMON, FRACTAL and TERMINUS all place their core
above the line (ORDINAL 53.4 clear of it, TERMINUS 118.5), and TERMINUS's ring
alone is 500 across. Under the build-256 guard those four are untargetable and
unkillable: `autoTarget` returns null and every round is swallowed.

It cannot happen in the shipped game — `Director.heldBy` returns 0 once an
anomaly is reconciled, era 2 is gated on all seven being reconciled, so
`syncGate` never lights another aperture and there is no door onto a boss at
era 2. `wallLine` returns null while `world.boss` is up anyway, because a boss
does not FIT behind the wall and the wall belongs to the wave field. **Anyone
adding an era-2 anomaly should read this paragraph first.**

529 green, hash `-1765830468` before and after in this container, bundle booted
by hand over http for the first `shooter.js -> yard.js` edge.

## 31. Build 258 — the transformation, and a second form worth arriving at

Reported from play, with a screenshot: three and a half seconds of an empty
black field with one dot of light in the middle of it.

**That was act IV.** "What is left is the idea of a machine" — the turret was
not drawn AT ALL for the whole act, and the new form was then scaled up from
zero out of an empty frame. The machine is stripped part by part and then
simply is not there, so the second form arrives from nothing rather than out of
the first one.

**Five acts now, not six.** The unmaking runs straight into the transformation:

    I    0.0 - 4.0    the field is taken
    II   4.0 - 9.0    the approach
    III  9.0 - 15.5   the unmaking, in the order the run was built
    IV  15.5 - 22.0   the transformation
    V   22.0 - 30.0   the pull-back

Act IV is one act with a SEAM in it rather than two acts with a hole between
them. `CFG.evolve.flipAt` is 0.38, so the wind-up is 2.5s and the arrival is
4.0s, and the two cannot drift apart. Before the seam the bare MK1 is on screen
drawing light into itself — motes hauled in on a clock that tightens as the
seam approaches, through the same emitter act I uses to take the field. At the
seam the field turns over. After it the second form comes out of the first at
`0.86 + 0.14 * form` rather than from zero: **at 0 it reads as a new object
arriving, and at 0.86 it reads as the same object opening out**, which is what
the piece is about.

**The silence was worth keeping and the empty screen was not**, so the two were
separated. The old act IV's bed row was a hard 0 whose PICTURE was the hole;
the zero moved onto the unmaking, where the seventeen thuds already are, and
the ignition still arrives out of nothing.

**The seam's own frame** is `Game.evolveFlash`: three rings at three sizes and
three lifetimes so the front does not read as one hoop, forty sparks thrown
outward against the motes that were being hauled in a frame earlier, a ripple
the background grid answers, a flash and a boom. `shake` is a multiplier the
player already owns, so somebody who has turned it off gets none of it.

### The background ease, which has been broken since it was written

`background.update` ran `mixHex(this.mood[key], this.target[key], k)` with `k`
about 0.013 at 60Hz, and `mixHex` rounds to whole channels every step — so a
channel closer than about 38 to its target moved by less than half a unit,
rounded back to itself, and **never arrived**. Measured before the fix,
staging → sandbox sat at its starting colour for twelve seconds. Every mood in
the game was affected; the ones that appeared to work were arriving on their
few far-apart channels only, which is why so much of this game SNAPS its moods.

The state is carried as floats (`background.moodF`) and rounded only on the way
out. `mixHex` is untouched — it has other callers and it is not wrong, it is
just not a place to keep state.

Three things follow from it, and all three were previously impossible:
`beginEvolve` eases the breach over act I instead of cutting to it; `syncSky`
no longer forces `newfield` to snap, so `setEra(2, { sky: 'ease' })` from
inside the cinematic crosses the sky over about 2.5s; and every ordinary
transition in the game — staging, the lull, all four boss skies — now actually
completes. **That last one is a visible change to the rest of the game** and it
is the one this was always going to cost.

`regress.mjs` asserts a mood is PART WAY after a second and ARRIVED after
eight. An arm that only checked the end state would pass on a build that cut.

### The MK2, and a reversal

The old case asserted that the second form grew INBOARD — 2.14r against MK1's
2.404r — because that is what bought clearance from the build lots. **The
consequence nobody had measured is that it was then 11% smaller ON THE GLASS
than a fully rigged first form.** The radius is at parity by construction
(26 × 0.62 and 40 × 0.403 are the same 16.1 CSS px) and everything hung on it
was tighter, so the reward for the whole evolution was a machine that looked
like less.

It paints 102.3 world units now against 85.6, which is **41.2 CSS px against a
rigged MK1's 38.8** — 6.4% bigger where the player actually compares them, and
19.5% bigger than the MK2 was. What is new on it:

- **A vented collar** in the gap between the deck and the first hull plate, so
  it is visible whatever is bought — structure, not an upgrade, and what a
  stripped MK2 has that a stripped MK1 does not.
- **Six buttresses** rooted in the deck's corners out to 1.29R, each with a lit
  spine so it reads as a rib rather than a flap.
- A wider deck (1.02R against 0.92R), a heavier barrel, a deeper race, and
  bolts that are proportional instead of a flat 1.5 world units — a speck on a
  machine 1.54× deeper.

**The colour goes one way only: colder.** `#8fdcff` against `#59e0ff` is dE
12.7 in CIELAB — far enough to read as a different grade of light beside the
old machine, near enough to be obviously the same machine. Nothing gets a new
hue, because every saturated hue in this game is already spoken for; the
upgrade is carried by temperature and luminance, which is also the one axis a
colourblind player still receives. The rim goes `#bfe6ff` → `#e8fbff` and the
structure under it goes deeper and bluer.

**The clearance is bought by the works stepping back**, not by the machine
staying small: `lotSide` 104 → 118 and `lotW` 40 → 34. Stepping back alone does
not fit — at 118 with the old width the outer edge lands on the quick strip's
left column at 320×568, which the clash sweep catches — so the works are
narrower as well as further out.

### `reach()` was understating the machine on exactly the device that struggles

The envelope assumed a nominal stroke. The widest structural stroke is
`CFG.hairline * 2.6`, and `CFG.hairline` is set on every resize from the scale
the canvas is really drawn at — the quality governor's factor included. So it
GROWS when the governor shrinks the backing store.

Measured at era 2, fully rigged: at quality 1 the hairline is 3.10 world units
and the machine paints 90.27; at quality 0.5 it is 4.43 and it paints 91.76,
against a fixed envelope of 91.39. **The bound held on a fast device and failed
on a slow one**, which is the worst shape a clearance rule can have. `reach()`
carries `CFG.hairline * 1.3` on the structural terms now — and only those: the
barrel's far corner already pays `pad` twice and its painted extent is
identical at both qualities, at both eras, bare and rigged.

### The debug panel

Every action closes it. Two exceptions: SPAWN GROUP is a door, and closing the
panel would shut the screen it just opened; and the toggles, whose `on` class
IS the readout, so closing on one hides the state you just set and turning two
on would cost two reopenings. Asserted off the RENDERED BOX, not the `hidden`
property.

### The one flake, and why the case was wrong rather than the code

"The evolution takes the field and pays nothing for it" summed `w.enemies.length`
across a 31-second window against a 30-second cinematic, so its claim was
"nothing is released during the evolution AND for a second afterwards". In
isolation the first wave after the cinematic arrives later than that; five
hundred cases in, with whatever the director has been left holding, it can
arrive inside the second. It counts only while `w.evolve` is set now. The
camera arms still need the full window, which is why it is 31 seconds.

534 green, hash `-1765830468` before and after in this container.

## 32. Build 260 — the wall is solid, and nothing of ours is drawn past it

Reported with four screenshots: PRISM's beams running up into the yard, WARD's
shell standing over the building, a mine's reach ring on their side of the
line, and the wall's own contact marks — "looks like shit". Mechanically the
wall was already refusing all of it (256, 257). The PICTURE said otherwise, and
the picture is what a player believes.

**One clip, at the call site.** `Game.ours(ctx, draw)` clips to below
`wallLine` and every draw of OURS goes through it — ground patches, mines and
effects, rounds and fx — three scopes in `Game.draw`. Not a wall test inside
twenty draw routines: the mechanism is that nothing of ours can be PAINTED
above the line, and a routine written next year is inside it by existing.
Theirs is not clipped, because theirs comes down through it; the touch aid is
not, because a thumb may point anywhere. At era 1 `wallLine` is null and it is
a call with nothing round it. The case floods the whole field through it and
counts lit pixels either side of the line, then spies `clip` across one real
frame at each era and requires era 2 to clip exactly three more times — any
other count is a group left outside.

**The mark was a third of the screen.** `edgeHit` reached 34 + 26p units into
the field and 30 + 34p either side, times era 2's scale, with p up to 3: a
bruise up to 172 × 406 world units in the round's own colour. It is 7 + 5p by
10 + 9p now, p capped at 1.5, alpha peak 0.32, life 0.3s. Measured, the hardest
mark paints under 60 × 30 world units and none of it above the line. A mark
that says "there is a wall here" is a few units lighting up under the thing
that touched it; anything the eye has to look AT has answered the wrong
question.

**The wall itself has a body now**: a dark 6-unit band under the line, a bright
near face, a short underglow into our half. With nothing able to cross it a
hairline was reading as a guide, not a thing.

**Four more things stop at it mechanically**, all from the build-257 audit's
backlog and each one line: STASIS's HOLD (`Enemy.frozen(world)` replaces the
eleven raw `world.stasis > 0` reads in the steering — the press already skipped
shielded bodies, the lasting effect did not, and the brackets in `drawStasis`
skip them too), ARC's chain (a jump into the yard was refused by the damage
guard and still spent the jump, drew the arc across the wall and marked the
body EARTHED), PILE's front (`thrown` is written before the guarded damage
call), and WARD's surface (the arcs loop eight lines below already had it).

**The MK2, two things.** Its hull plates were stacked with a 0.08 rad twist per
level — MK1's 0.26 twist is deliberate, MK2's read as a bent machine — and are
square to the deck now. And the pivot: MK1's port is nine ABSOLUTE units and
stays so to the digit; on a machine 1.54× deeper that was a dot at the root of
a barrel three times its width, the one part the barrel turns on and the
smallest thing on it. MK2's is proportional at 0.30R — an outer race with
sixteen teeth turning against the barrel, a recessed dish, the iris, and a core
that glows.

Not done: WARD's surface arm is not in the case. At 320×568 the shell reaches
231 against a wall 287 out even with WIDEN, so an arm for it would be vacuous
on every screen — the guard is in and asserted by inspection only.
