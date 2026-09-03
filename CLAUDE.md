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

`node scripts/bundle.mjs` is the single-file build — the form the Artifact and
the home-screen install are made of.

**It shipped a dead page from build 127 to build 180 and nothing noticed**,
because nothing ever loaded its own output. `wrap()` turns modules into plain
script with one regex per form it has been taught, and a form it has not been
taught passes through verbatim — a bare `export` or `import` in a classic
script is a SyntaxError that kills the entire bundle on load. There is no
partial failure: the page boots to its title screen and nothing else ever runs.
Three forms were missing. `export { BOSS_TONE } from './anomaly.js';` went into
upgrades.js in build 127. `import './terminus.js';` — the seven boss modules are
pulled in for their side effects alone — was neither transformed nor counted as
a dependency, so the entry module was resolved as `./terminus.js` instead of
`./main.js`. Fifty-three builds of artifacts and installs, all of them dead.

It parses its own output now and fails the build on any surviving module
statement. That guard is the load-bearing part: the transform will always be
one syntax away from incomplete, and the only defence is reading what came out.
Booting the bundle is worth doing by hand after touching it — serve it over
http (not `file://`, which blocks the module loads and the updater's own range
fetch) and check `window.__sim` exists. Not a build step for the game, which has
none: it exists because two places want the whole thing as one file and neither
can be handed a directory. It writes both forms to a temp dir (`--out DIR` to
put them elsewhere) and fails if the rev stamp it embeds lands outside the
first 2KB, because that stamp is the only thing keeping installed copies up to
date. It lived in /tmp for twenty builds and was rewritten from memory after
every container.

`node scripts/dps.mjs [n]` is the other half of `fight.mjs`: not what absorbed
the damage but what happened between the turret deciding to shoot and a body
losing health. Per stage it reports shots, damage per shot, target switches per
second, shots fired while the barrel was still slewing, frames with no legal
target, how often the nearest body was inside the assist's ±78° cone, and
where each stage's damage actually went. It
exists because build 134 made a fight 30% longer and three isolation runs could
not say why; the damage table only ever describes the symptom. It found that
every boss goes half-blind in stage IV and that TERMINUS changed target
forty-five times a second, which is what `CFG.shooter.aimStick` exists to stop.
The per-stage damage split went in at build 143, because the whole-fight table
cannot tell a stage that is long because the boss is tough from one that is
long because the turret spent it on minions -- DYNAMO's third stage was 46% of
a 324-second fight and two thirds of it was IONs.

**ORDINAL's canonical hash is `1796395127`** (seed 20260824, 9000 frames),
re-baselined at build 211's fix pass, which moved both of `integrate`'s
ceilings above the step they exist to bound. A cap applied after `x += vx * dt`
does not cap that step, so bodies had been committing the frame the excess
arrived on in full -- measured, 1.02% of substeps over their own limit, worst
3.6x -- and correcting it changes where they end up. Note the SPIN sign fix in
the same pass did NOT move it (it was re-run and came back identical), because
the spin is drawn and not steered. Before that it was `1831195238` from build
211, which gave a round's impulse a place to land: the spin is the impact
parameter rather than `spread(push * 0.02)`, and the hash mixes every body's
(x, y) every 300 frames. Before that it was `1272664316` from build 209,
which changed what the turret shoots in two ways at once: the gun is now silent through a boss's arrival and its death (the probe
runs from `openBoss` with auto-fire on, so the first two samples land inside a
14.4-second arrival that now has an empty barrel), and DOUBLE TAP moved off
BOLT onto SPINE, so the default round no longer carries a follow-up. Before
that it was `-960623607` from build 207, when the wave economy changed what a
body pays; `117409503` from build 145, when the Phase C audit raised
the panel's health; `917805618` from 141, when TALLY went in; `-1210682079`
from 137, when the assist gained its target memory; and `1109808491` from 127
to 136. Each move was a change to ORDINAL or to targeting, which is the hash
doing its job; a move without one is the bug it is there to catch.

**The 207 move widens that rule, and it was found five builds late.** The hash
mixes `w.energy`, so ANY change to what a body pays moves it -- and build 202
made bounty compound and put the depth dividend on every `bank()`. Proved
rather than argued: restoring build 201's payment (linear bounty, no dividend)
and re-running the same frames gives a different hash again, so the payment is
the channel and not something in the fight. The failure was process, not code:
the hash was run at 199 and then not again until 207, across six builds of
ladder and economy work. **Run it on any build that touches energy, not only
ones that touch ORDINAL or targeting**, and re-baseline in the same commit with
the reason. A canonical number nobody checks is a number that re-baselines
itself.

`node scripts/variance.mjs [n] [--runs 7]` is the third of the trio and
answers the one thing the other two cannot: **why the same fight takes a third
longer on one run than another.** The turret's cadence is a timer rather than a
decision, so `length = rounds / roundRate + held`, and a run that took longer
simply needed more rounds. Every round lands in one of five places: on the
boss, on a minion, into armour, past zero as overkill, or nowhere at all. The
probe partitions each run's rounds across those five by the round size it
measures from the run itself, so the terms sum to the total by construction,
adds a term for the cadence itself, and converts the difference between the
longest and shortest run into seconds term by term. Nothing is left over but
rounding.

It found that both loose fights vary for the same reason, and it is not
shooting: **the boss generates a different amount of work.** ORDINAL puts back
11.9k of health on a short run and 13.1k on a long one and spawns 8.3k of
DIGITs against 9.3k; GNOMON's minions swing 5.1k to 6.3k. Nothing else moves --
the round budget is the same shape run to run, to within a couple of points.

**It got that wrong first, and the wrong answer is instructive.** The first
version counted `shooter.shoot()` calls and credited a shot with a hit if any
damage landed before the next one. A bolt crosses 380 units in a quarter second
against a shot every three tenths, so hits fell in the wrong window and it
reported GNOMON missing a third of everything -- a defect that did not exist,
stated with a number. `shoot()` also returns false when it cannot fire, so a
call is not a round. Measured properly -- distinct projectiles, and each one
watched until it leaves the field, times out, or is marked by the impact site
it caused -- every boss misses between 1% and 6%, and GNOMON is the best of
them. The rule this suite already had, that a measurement is only as good as
its instrument, cost a published finding to learn again.

`node scripts/tiers.mjs [--from 1] [--to 20] [--runs 3]` is the fourth, and the
only one pointed at the ordinary field rather than at a boss. Per tier it buys
what plan C says that tier's earnings can afford, in a fixed damage-line order,
then measures three things: the gun against a pinned wall (rounds and damage a
second), the time to kill each type the tier's band newly brings, and the time
to clear the band's heaviest authored wave at that tier's size. It exists
because the ladder shipped with three slopes in it and nothing watching what
they do.

What it found on build 177, before any of plan B: **single-body TTK is the
wrong wall.** The worst body in a band peaks at 2.8s (SPLITTER, tier 3) and
settles at about 1.0s from tier 9 to tier 20 — because health climbs 6% a tier
while the damage line climbs nineteenfold by tier 8 and then stops dead. The
tree plateaus: dps is 2,050 at tier 8 with 15k spent and still 2,050 at tier 20
with 117k spent. And **the cadence cliff is DOUBLE TAP, not FEED** — rounds a
second go 7.6 to 25.9 across one tier of income when TRIPLE TAP lands, where
FEED's two levels together are worth 1.56x.

TRIPLE TAP was removed in build 189 and the same probe measured it, A/B over
tiers 1-20 at three runs each. The cliff is what went: rounds a second step
6.1 to 13.6 at tier 6 instead of 6.1 to 20.4, and the top-end plateau falls
25.4 to 17.0. dps falls only 14% (1,438 to 1,236) because the third round
carried `tapFade²`, a quarter of one — a trigger pull went from 1.75 rounds'
worth to 1.5, and the measurement matched that to a tenth of a percent, which
is the instrument agreeing with the arithmetic rather than with itself.
Tiers 1-5 are untouched to the digit: DOUBLE TAP is not affordable until 6.
What it costs is the late wall — a BULWARK at tier 20 goes 13.9s to 15.6s,
and the heaviest wave of band 5 stops clearing inside the 120s cap.

Two instrument bugs cost a table each and are worth not repeating: a body
spawned 240 units above the *floor* is 30 units off the muzzle, dies inside one
frame, and takes its round and its damage with it — both counters watched state
*between* frames and saw neither, so it reported a NEEDLE dying to nothing in no
time. Rounds are counted at `projectiles.push` now and damage off a roster that
outlives the sweep. And a wave put down loose on the field can land level with
the turret, which is outside `autoTarget`'s 78° cone forever; waves march in
from the top here, the way the game sends them.

One case in it is worth knowing about because it wasted an afternoon: **the
HITBOXES floor line cannot be measured off the live canvas.** It is one world
unit wide, and on screen that is `dpr * world scale` — in the headless context,
1 x 0.62. Six tenths of a pixel over a floor band that is not black does not
survive a colour test, and the perf governor makes it worse, having taken the
canvas to 273x591 by the time the suite reaches it. So the case passed or failed
on how slow the cases before it had run. Pinning `fx.quality` does nothing on
its own (the backing store is only sized inside `resize()`); pinning and
resizing recovers the canvas but not the line; overriding `devicePixelRatio` and
resizing leaves `getImageData` reading zeros on every row. It renders to an
offscreen canvas at a scale it picks now, and asserts the button's wiring
separately — the same shape as the TURRET-parts case above it.

The clear column is genuinely noisy — the same wave swings five times on where
its bodies happen to arrive — so runs that disagree by more than double are
marked `~`. Read the tier, not the second.

The `pay` columns cost a published finding, again. `e.bounty` is a *multiplier*
on what a body's wreckage is worth, not the worth itself — the worth comes off
the body's mass through `CFG.energy.perMass` — so the first version summed
multipliers and reported a fortyfold collapse in income that did not exist.
Measured properly, off the purse and the floor: income *rises* from 4.3/s at
tier 1 to 54/s at tier 12, then falls away as the wall makes clears longer.
Which is the behaviour wanted, and it meant the bounty change build 179's notes
recommended was never needed.

`node scripts/contact.mjs [--out DIR]` is the only one that produces a picture
rather than a table: every image the tree draws, on one page. The marks are
24x24 SVGs in a module-private table in `upgrades.js` and the TURRET branch is
not marks at all -- its eight nodes are eighteen levels of structure on the
drawn machine -- so it renders the turret nine times out of a running game
(bare, each part alone at full levels, everything) and lays the marks beside
them grouped by branch. Nothing in the game shows a part on its own, which is
why the sheet immediately found five TURRET lines still describing the hung-on
gadgets build 150 replaced with structure: ARRAY had been selling a "scanning
dish" for sixty builds and drawing a flat fin. It writes ASCII-only HTML
because the page carries no charset of its own and a raw multiplication sign
came back as two characters.

`node scripts/regress.mjs` asserts the things this game has actually got wrong:
stale field reads (the class of bug that stopped the turret firing for three
builds), the trigger itself, every round/mine/ability/object type running once
without an error, a save surviving an app update while still refusing a
malformed one, each menu tab showing only its own panel, the volume surviving
mute-quit-return, the broadphase seeing every overlap of the biggest body, and
nothing a boss made still flying during its own outro, and nothing of the boss
left to shoot at either -- which walks all seven through their own deaths,
because the marks that make those work are applied at a spawn site in seven
files and in a death sequence two bosses keep private copies of, and a missed
one is invisible until somebody watches an ending.

The two marks are different on purpose. A minion can be destroyed when the boss
dies; the boss's own structure cannot, because the ending is made of it -- the
arrest snaps the frame off a piece at a time and the infall pulls the rest into
the core. So structure is marked `spent` instead: still drawn, skipped by
`autoTarget`, and rounds pass through it. Anything that decides what may be
shot has to honour it, including the assist's hysteresis, which kept a lock on
a spent body for eighteen percent of TERMINUS's outro because it tested `dead`,
`staged` and `harmless` and nothing else.
Add a case to it whenever something ships broken — that is the whole rule.

Before build 101 this section pointed at a session scratchpad. There were 243
probe scripts in it behind a hand-kept runner list; 21 of the 43 the list named
failed on build 100, every one of them because the probe named something
deleted in builds 81-99, and the lot died with the container. Nothing about
that was a suite.

## How an installed copy updates itself

The single-file build ships no `sw.js`, so `main.js`'s registration is switched
off in it and no service worker is ever involved — which means nothing pins it
and nothing updates it either. So the page does it: a rev stamp in the first
hundred bytes of the head, and a script that range-fetches its own first 2KB,
compares, and reloads once if it differs.

It asks **on load and on every return to the foreground**. It used to ask once
per session, guarded on its own rev — which reads as "once per launch" and is
not: a home-screen app's session survives backgrounding for days, so an install
that is never evicted checks on its first cold start and never again. That is
how a phone sat on build 113 while the server had 114, and why the updates that
*did* land were the ones where iOS had happened to evict the app.

The loop guard is on the incoming rev, not on the check, so it will reload at
most once for any given target and cannot spin.

## Repo facts worth not rediscovering

- No build step, no dependencies. Plain ES modules, one canvas, a DOM overlay.
- `src/config.js` holds every balance number and the `BUILD` literal, which is
  duplicated once in `index.html` and guarded by `scripts/check-build.mjs`.
- A new module must be added to the `ASSETS` list in `sw.js` or the game breaks
  offline. `check-build.mjs` fails if one is missing.
- Play-screen controls bind on `pointerdown`, not `click`, so a tap registers
  when the thumb lands. Tests must dispatch `pointerdown` to press them.
- A regress case that stubs `world.director.update` MUST put it back. `reset()`
  keeps the same Director object, so a stub outlives every restart after it and
  silently starves every later case of waves — three cases were written this
  way in one session, each one failing four unrelated cases downstream.
- Press controls through their handler, on the element, with `pointerdown`.
  A case that calls the method the handler calls tests the logic and not the
  control: the AUTO AIM row shipped unable to close because its case called
  `aimPressed()` once instead of pressing the cell twice.
- `buildStrip()` runs on every purchase and recreates every cell from the
  arsenal's defaults, so anything the interface has written onto a cell —
  AUTO AIM's mode label and tone — has to be re-asserted at the end of it, or
  buying anything silently resets the control while the world keeps doing what
  it was doing.
- `#barChips` is the shrinkable group but its chips are `white-space: nowrap`,
  so it never absorbed anything — it clipped. `Hud.fitBar` measures and drops
  labels (OBJECTS, then ENERGY) because the trigger is how many digits are in
  the purse, which no media query can see. Keyed on digit COUNTS: keyed on the
  values it forced 874 layouts in ten seconds, because energy changes every
  frame of a PULSE.
- Teaching lines queue. A first-use caption arriving while one is up waits its
  turn, and is marked said-on-this-device by the band when it *paints*, not by
  the caller. It used to be marked when asked for and the band clobbered
  whatever was up, so four controls pressed in a burst spent four captions and
  showed one. `PREFS.hints` turns the lot off, opening included.
- Object types are gated on `world.earned` — lifetime energy banked, fed from
  `bank()`, which is the only place energy enters a run. Not on kills, and not
  on the purse, which falls every time the tree is bought from. The thresholds
  live on each type as `opens` and are grouped by band; `check-build.mjs`
  asserts the grouping. The eight teach waves play from the authored order and
  never consult the gate, which is why LURCHER and SPLITTER are met before
  their thresholds.
- `save.js`'s `VERSION` is checked with `!==`, so bumping it deletes every run
  currently open — including the ones a migration was written to rescue, since
  the file is thrown away before the restore sees it. Only move it when the
  restore genuinely cannot read its own past.
- A flag that is never false grows readers that can never take their other
  branch. `world.endless` was written `true` in two places and nowhere else
  from build 81; by 185 it had four readers, and every one of them was a
  ternary or a guard with one dead arm -- `releasesLeft()` returned `Infinity`
  on every call it ever made, so `CFG.killGoal`, the director's release quota,
  the closing-speed bonus, `setKills`'s goal, `setPhase` and a `<span
  class="dim">` in the counter were all inert and all still being maintained.
  The lot went in build 186. The tell is a constant that is threaded rather
  than a branch that is taken: if nothing can set it false, delete the flag,
  not the branch.
- Dead CSS does not announce itself, so sweep for it: pull every `.class` and
  `#id` out of styles.css and grep each against `src/*.js` + `index.html`.
  Build 186's sweep found an entire orphaned widget (the `.fx*` timed-boost
  rail), the whole `#endScreen`/`#endText`/`#resetBtn`/`body.ending` family,
  and four loose rules. Two false-positive shapes to know: hex colours read as
  ids (`#a3b8ce`), and classes built by template -- `m_${mode}` in hud.js is
  why `.m_all` and `.m_drift` look dead and are not.
- **`el.hidden = true` does nothing to an element the stylesheet gives a
  `display` to.** `[hidden] { display: none }` is the user agent's, at one
  class of specificity, and loses to any author rule written on an id or a
  class -- so the property flips, every test that reads it back agrees, and
  the element stays on the screen taking taps. That is the whole of build
  185-186's "the AUTO AIM menu will not collapse", reported three times and
  green every time. Twenty selectors in styles.css already carry a
  `#thing[hidden] { display: none }` guard; `#aimModes` and `.aimMode` were
  the two that did not. Anything that sets `display` on an element it also
  hides by attribute owes that element a guard, and the assertion has to be
  on the rendered box -- `getBoundingClientRect().height > 0` -- never on the
  property.
- `#ui button { pointer-events: auto }` carries an id, so nothing built out of
  classes can turn a control back off. `body.menuOpen #quickBar` and
  `body.loadoutOpen #quickBar` both say `pointer-events: none` and neither had
  ever disabled a button: the strip went to 25% and stayed live under the
  sheet covering it. A deliberate disable has to name an id of its own.
  `getComputedStyle(el).pointerEvents` is how you find out; `elementFromPoint`
  will not tell you, because it skips whatever is already off.
- **A custom property is substituted where it is DEFINED, not where it is
  used.** `--under-rail: calc(var(--rail-t) + var(--rail-h))` on `:root`
  resolves against `:root`'s `--rail-h` and inherits down already computed, so
  redefining `--rail-h` on `body.bossUp` moved nothing. The boss bar shifted
  and the alerts column did not. A state class has to redefine the *derived*
  property, not the term inside it.
- The top furniture is three absolutely-positioned bands sharing one column
  (`--rail-t`, then `--under-rail`, then `#alerts` at `+ --boss-h`), and the
  thing that decides whether a design fits is `Hud.pillCap()`: it measures the
  gap between the alerts column and the teaching band and can legitimately
  return 0, at which point every pill queues and none is ever shown. On a
  568-tall screen there is room for exactly one. The wave rail was drawn as
  two rows (69px) and cost that slot; one row (44px) plus a boss-bar
  reservation only made during a fight keeps it. Measure `pillCap()` at
  320x568 before adding anything to the top of the screen.
- **Nothing in this game casts an ability.** REFLEX fired PULSE for you once
  two things had hold of the turret; it went in build 190 along with the node,
  because an upgrade that spends a charge unasked is a charge you do not have
  when you need it. The telling was never the automation's: `.ab.urgent`
  breathes on the PULSE button for as long as anything is attached, bought or
  not. `regress.mjs` holds the rule with the whole tree owned.
- The counter behind that rule took **four** versions and every wrong one
  reported a clean bar through a turret firing itself twice a second. Hooking
  `Game.useAbility` caught nothing and was never shown to catch anything.
  Diffing `charges` either side of the window caught nothing, because a
  cooldown puts a charge back inside it. Counting per frame but only after
  letting the bodies settle caught nothing, because the automation fires on
  the frame they land. And sharing the counter with the case's own vacuity
  press reported one unasked cast on a clean build — the case catching itself.
  A zero means nothing until the instrument has been shown to read a one.
- **Nothing in the bar takes the barrel any more.** SPIRAL owned the aim, the
  cadence and the round for three seconds; WARD replaced it in build 217 and
  is a shell round the machine that the gun goes on firing through. What the
  removal left behind is the shape to watch for: `CFG.spiral` went, the class
  went, and `windAt`/`rateAt` — the trapezoid that shaped its sweep — sat in
  `abilities.js` for two builds with no caller and a forty-line header
  explaining an ability that no longer existed. Nothing fails on dead private
  functions; `bundle.mjs` will happily ship them. They came out in 219.
- **An upgrade with no `levels` silently gets three.** `tree.js` reads
  `u.levels ?? 3`, so a node the author never capped is sold three times.
  Caught three times now: HOT LOAD (193), BUCKSHOT (217), then REPULSOR and
  STANDING ORDER together in 219 — the latter being the one node that touches
  all eight ability buttons, at 0.8³ = 0.512 against a row saying "-20%".
  `regress.mjs` pins the level TOTAL and asserts each ladder as a product
  (`up.rate`, `up.cooldown`), which is what catches a new node arriving as
  well as an old one taking its default back.
  **The source of it was upgrades.js's own docstring**, which said in as many
  words that "`levels` absent means without limit" and named HOLLOWPOINT as
  the example -- one of the uncapped nodes. Seven have now shipped that way.
  Build 220 corrected the paragraph and asked for the number to be written
  out: a dial that genuinely wants three is one word longer, and a node with
  no `levels` is indistinguishable from one whose author forgot.
  HOT LOAD was 0.85³ on the fire interval — 1.63× on rounds a second, larger
  than the FEED nerf of build 178, which capped FEED for exactly that reason
  and stopped one node short. Check the tree's number, not the upgrade's,
  when asking how much of something is for sale.
- **Fire rate is not something the tree sells any more.** HOT LOAD went in
  build 193 and FEED was halved to ×0.9 in the same build, so `up.rate` on a
  fully bought turret is 0.9 and the whole cadence ladder is worth 1.11× —
  3.5 pulls a second stock against 3.9 bought. It was 2.54× before 178.
  `regress.mjs` asserts the product rather than the nodes, which is what
  catches a new rate upgrade arriving as much as an old one coming back.
- **`debugSpawn` gives you half a TOW.** It calls `spawnOne`, which makes the
  head alone; the pair — head plus the MASS it drags, tethered — comes from
  `release()`, which is what `debugSpawnGroup` goes through. A probe that
  builds a TOW the first way is measuring 135hp against the 415 the game
  actually sends, and a build-192 note published exactly that mistake as a
  finding.
- **A time-to-kill bench has to HOLD the body at the range it claims.**
  `tiers.mjs` put one down at 300 units and let it walk, so a TOW pair — which
  climbs away — crossed the turret's 841-unit reach at about 6.6s, and every
  `>45s` in that column was the probe waiting out its cap for something the
  gun could no longer point at. Not a time: a target that left. The same
  disease as the loose wave spawn above, on distance instead of angle — if a
  probe lets the thing it is measuring move, find out where it went before
  believing the number.
- **...and the fix for that is a ball of slack, not a nail.** Holding a body
  at a fixed point breaks PRISM — `reflect: 0.55` means whether a bolt lands
  depends on how it meets the surface, and a body that cannot move presents
  the same face for ever, so tier 5 went 1.5s to >45s. Holding only its
  distance lets a TOW swing out of the 78° cone instead. `tiers.mjs` holds
  each body within `--slack` (80 units) of where it was put and never touches
  its velocity. A probe that immobilises what it measures has changed the
  thing it is measuring.
- **A flaky case is a case measured at the wrong moment or against the wrong
  margin, and both showed up in one sitting.** "A body under sustained fire
  still closes" gave a LURCHER 26s to arrive when it takes 16-17s quiet and
  17-22s under fire -- a window set near the truth rather than clear of it,
  failing about one run in ten; each body sizes its own budget off its own
  quiet crossing now. And "nothing on the bar goes off by itself" read
  `.ab.urgent` once at the end of its window, where HARD CASING -- which the
  case itself buys -- had sometimes just killed the last gripper; it samples
  the light on frames where something is actually attached now. If a case
  fails intermittently, measure what it is really asking for before touching
  its number.
- **A control that refuses is not the same as a rule that holds.** The wave
  rail's tiers are gated on `peak` from build 196: `Director.reach()` is the
  player's setter and clamps, `setTier()` is the machinery's (restore, probes,
  debug) and unlocks as it goes. The first case for it pressed the arrow and
  passed with the gate missing entirely, because `railUp.disabled` swallowed
  the presses. Assert the model as well as the button, or the next caller
  walks straight through.
- **A threshold that a device cannot physically reach is a door that never
  opens.** The quality governor was fed the frame INTERVAL and judged it
  against absolute milliseconds -- drop above 20.5, recover below 13.5 -- and
  a vsync-locked 60Hz display cannot produce an interval under 16.67ms. One
  transient stall pinned the game at reduced resolution for the rest of the
  session; a 120Hz iPhone recovered from the same stall and a 60Hz one never
  did, which is the threshold testing the refresh rate rather than the game.
  The same test could not tell iOS low-power mode (rAF throttled to 30Hz, no
  extra work) from a game spending 30ms a frame -- identical intervals -- and
  answered both by halving quality. Build 198 judges the interval against the
  display's OWN cadence (the tenth percentile of the window: the fastest
  frames are the ones that landed on a vsync, and a percentile rather than the
  minimum survives one spurious back-to-back callback) and measures work
  alongside it. Both are needed: canvas calls are queued, so a GPU-bound frame
  returns from `draw()` in a millisecond and still misses its vsync -- only
  the interval sees that -- while a uniformly half-rate game is invisible to
  the interval and only the work tells it from a 30Hz display. Anything
  comparing a measurement against a constant owes an answer to "can this
  device produce that number at all".
- A governor case has to be **synthetic**: a headless software rasteriser has
  no vsync and no GPU, so a live run cannot produce any of the six timings
  that matter. Drive `trackFrame` directly -- and put `fx.quality` back where
  it was found, because the backing store is sized inside `resize()` and a
  case that leaves it on the floor charges every later case for it.
- **A floor is meant to stop a line vanishing, not to set its weight.**
  `HAIRLINE` was `1.25 / CFG.zoom` and a world unit is `dpr * CFG.zoom` device
  pixels, so it drew at `1.25 * dpr` -- 2.5 device pixels on a dpr-2 iPhone,
  against a docstring that said "roughly one". Eighteen of thirty-seven types
  had `r * m.line` land under it, so a line ladder authored across 17.3x was
  drawn across 4.2x and a body of density 6.0 got the same outline as one at
  0.55 -- and a body reads almost entirely as its outline, the fill being 7-9%
  of its brightness. It is `CFG.hairline` from build 199, set on every resize
  off the scale the canvas is actually drawn at (the governor's factor
  included). dpr 1 is unchanged to the digit; only the retina scales were
  over-clamped. Note `CFG.maxDpr` caps the canvas at 2, so dpr 3 is a unit test
  of `setHairline` and not a device the game runs at.
- **`export let` is a live binding in a module and a SNAPSHOT in the bundle.**
  `wrap()` gives each module its own scope, copies its exports into the
  registry once at the end of the module body, and has importers destructure
  that object -- so a reassigned export changes only in the served build.
  Measured on build 199's first attempt: the modules halved the stroke floor
  from dpr 1 to dpr 2 and the bundle did not move it at all. Green suite both
  ways, because the suite runs against the modules. This is worse than a form
  `wrap()` cannot parse -- that one dies loudly on load; this one builds clean,
  boots clean, and is quietly a different game. A value that has to change
  belongs on an object nobody reassigns (`CFG`), read through that reference.
  `bundle.mjs` now fails the build on `export let` / `export var`.
- **Measure the thing you are claiming, at the moment the claim is about.**
  Three probes in one session reported the opposite of the truth by watching
  the wrong quantity: connected components at a threshold that admitted the
  faint glow HALO said three rounds were one streak (touching halos are not);
  picking the frame with the MOST rounds in it always picks the launch instant,
  where a DOUBLE TAP pair is stacked at the muzzle by design; and recording the
  WIDEST line on the field to test a stroke FLOOR watched BULWARK's 6.03, which
  is far above the floor at any scale and could not move whatever the code did
  -- it reported "frozen" on a demonstrably live build.
- **`world.attackers` used to mean "has ever touched you and is not dead
  yet".** A body entered on contact and left exactly one way -- by dying --
  and `e.attacking` was never written false anywhere outside the constructor,
  so a LURCHER shoved clear by a PULSE and left alive counted as attached from
  across the field for the rest of its life. Four things read that set (the
  intake tax, the screen effect, the turret's breached accent, the ladder's
  contact clock) and all four were reading the wrong thing. Survivable while
  it only tinted things; not survivable under build 210's glitch timer, whose
  whole answer is shoving the thing off. `checkContact` releases as well as
  fills now, iterating the SET rather than `world.enemies` -- three bosses
  splice live bodies out of that list, and a body released only by walking it
  leaks forever and holds the fuse lit for the rest of the run. The release
  radius is four units wider than the grab, or a body resting on the rim
  chatters in and out every frame and each entry fires `audio.glitchOn()`.
- **A wave-end verdict is a bad instrument for "you were in trouble".** The
  rout added up contact across a wave and cashed it in once the wave was over,
  so the punishment landed up to a minute after the thing that earned it, could
  not be seen coming, and could not be answered once owed. It is a live clock
  from build 210 (`Director.burn` / `glitchOut`, `CFG.waves.glitch`) and the
  verdict table has no way down at all -- asserted by sweeping all 168 cells of
  it, not by sampling. Anything that adds a way down owes that sweep an update
  and the user a reason, because "the glitch timer is the only involuntary way
  down" is a promise the game now makes.
- **A path that ends a wave without `score()` owes the next wave five things by
  hand.** `overclock.armed` and `laneOffer` are cleared in `score()` and
  NOWHERE else; `contact`, `hitPatience` and `take` are cleared there and in
  `load()`. And `grace` has ONE writer in the whole codebase -- forget it and
  it becomes a flag that can never be non-zero with four readers that can never
  take their other branch, which is the `world.endless` shape from build 186
  all over again. `resting = true` before anything else, or `update()` falls
  into the end-of-wave block next frame and scores the same wave twice.
- **`up.damage` is applied at the MUZZLE, so anything a round leaves behind or
  chains to is outside the damage line.** Three rounds had this and all three
  were found in one sweep: ARC's chain (25 a jump against a dart of 11, so
  88% of the round was immune and the ladder read x2.28 where BOLT's is
  x4.74), SPORE's burning ground (46 a second against a round of 10 -- x1.78),
  and THORN's, which `mineGrade` had been crediting to SHRAPNEL the whole time
  so the mine grew a mark for an upgrade that touched nothing in it. The tell
  is a `CFG` number read at a site the multiplier never reaches; the fix is to
  multiply it there. Measure it: a per-round bench on a pinned wall makes the
  odd one out obvious in a single table.
- **A chain round measured against ONE body has its mechanism switched off.**
  The first bench of ARC reported it the weakest round in the game at both
  ends. It had nothing to jump to. Two bodies is the minimum honest instrument
  and the ratio to assert is the chain's SHARE of the round, which is
  dimensionless and cannot be flattered by a longer reach.
- **A `Math.max` floor decays to nothing against a compounding ladder.**
  TITHE's mark was `Math.max(e.bounty, 3.5)`, and a body's own bounty is
  `bountyStep ^ (tier - 1)` = 1.10^(tier-1) -- which reaches 3.45 at tier 14,
  so from tier 15 the mark on the round whose whole point is that it pays was
  worth exactly nothing. The floor was there to stop eight marks compounding;
  a flag plus a multiplier keeps the "once" and keeps the value.
- **A branch that ends on `continue` skips whatever the bottom of the loop
  does.** THORN and LODE were the two kinds of eight whose arm of
  `updateMines` ended on one, and the only thing past it is the splice that
  takes a dead mine off `world.mines`. So they never left the list, were
  re-entered every frame with `life` already past zero, and called `fizzle`
  again each time -- with SALTED bought that is a blast, a ring, a Shock and
  an `audio.boom()` sixty times a second, for the rest of the run, per expired
  mine. Measured 39 blasts in the second after one expired. Anything that can
  be called twice needs to read its own `dead` back.
- **ARMORED does not reduce a hit, it DISCARDS it** -- "the hit did not
  happen", before the plate and before the ward. So no amount of damage kills
  through it: VOID sent `hp + 1e6` through `applyDamage` and an armoured body
  walked onto the mine, spent it, and walked off untouched, against a row that
  says "one kill... whatever its health". Anything that must not be survivable
  goes through `Enemy.destroy`, which is the door everything else uses.
- **A throw has two halves and they are earned by CADENCE, not by weight.**
  `throwOff` lifts the speed ceiling (`cruise * 6` -> `thrownSpeed`) AND the
  repeated-shove fade. PULSE and PILE get both, because a press every seven or
  eight seconds is a deliberate clear. SLUG does not, and the arithmetic
  screams that it should -- 1500 impulse clipped to 137 u/s against a BULWARK,
  so SLEDGE and HEAVY multiply a number the physics discards. It was tried,
  lifting only the ceiling: a LURCHER under sustained SLUG with two HEAVYs
  went out to 1293 units of an 817-unit field and never came back, which is
  build 110 verbatim. A round fired 1.5 times a second cannot be exempt
  however heavy it is. `regress.mjs` pins the ceiling and records the argument.
- **`spent` is a rule for what may be SHOT; `staged` is a rule for what may be
  CHOSEN.** Build 219's audit got this backwards in three places at once and
  the distinction is the whole of it. `spent` (a boss's own frame through its
  outro) has to be honoured by anything that does damage — rounds and the
  assist always did, and `applyBlast`, PRISM's beams, LANCE's sweep and WELL's
  knot never had, so any area effect pressed inside a dying boss was taking
  the pieces the ending is made of. `staged` is the opposite: `config.js` says
  in as many words that it "never gated projectile collision", only the
  assists, so a body is shootable through most of its march in — and adding
  `staged` to a damage path makes a blast visibly wash over a body on screen
  and do nothing. Choosers (`autoTarget`, `bestTarget`, `densestPoint`) skip
  it; damage does not. `fizzle` splits the same way: build 210 made a
  dissolving body stop STEERING, not stop existing, so WELL's knot — which
  writes `vx`/`vy` by hand — has to honour it and a blast or a beam does not.
  `Enemy.destroy` is the door that refuses to cash it in, and that is enough.
- **`spent` has three readers and `dissolved` has one.** `spent` (autoTarget,
  its hysteresis, the projectile sweep) keeps rounds and the assist off a body;
  `dissolved` (the sweep) stops it paying and counting. Neither reaches blasts,
  mines, patches or any ability, all of which test `dead` alone -- so a body
  that must not be cashed in needs the guard inside `Enemy.destroy`, which is
  the one door they all come through. That is what build 210's fizzle does.
- **A probe that spawns a fresh body whenever the mount goes empty is measuring
  its own pile-up.** Bodies stack at the same point, shove each other off, and
  `Director.held` -- unbroken contact by design -- resets on every release, so
  the fuse pays a 1.5s re-arm each time. It reported the timer firing 1.6s late
  and the mount refusing to clear; both were the instrument. One body, pinned
  and healed each frame, is what makes "fourteen unbroken seconds" unbroken.
- **Reordering children inside `.qGroup` is safe; re-nesting them is not.**
  `.qGroup.folded > .qc:not(.fold)` is a direct-child selector, so wrapping the
  slots in a div to move the fold makes them grandchildren and folding silently
  stops hiding anything -- with no property flipped for a test to read back.
  And `.foldArrow` is a bare span that `.qc svg`'s `flex: 0 0 auto` does not
  reach, so it was the flex item that gave ground: measured 8px down to 3px at
  320 the moment the label beside it had text, clipped rather than scrolled,
  `scrollWidth === clientWidth`, nothing to read back.
- **Canvas alpha must be MULTIPLIED IN AND PUT BACK, never assigned and reset
  to 1.** `drawGlow` did the latter, and so did the hit-flash disc inside
  `Enemy.draw` and two of the shape helpers it calls, which threw away any
  alpha the caller had set for itself. Build 210's fizzle set the
  alpha one line before the ambient glow was drawn and every body dissolved at
  full opacity: measured off an offscreen canvas, peak 255 at fizzle 0.9 and
  255 at 0.02. The scale shrank, the fade did not exist, and nothing read wrong
  at the call site -- and four separate places had to be fixed before the fade
  came out, because each of them individually forced the alpha back to 1 for
  everything drawn after it. Same shape as the `[hidden]` trap: a property set,
  and silently overwritten one layer down. Anything inside a `save()/restore()`
  is fine; it is the bare `= 1` on the way out that is the bug.
- **`Game.update` is `if (w.boss) {...} else { director.update() }`**, so
  ANY guard written inside `Director.update` for the boss case is dead code.
  Build 210 put the glitch timer's douse there and it never ran: the fuse froze
  for a 224-second fight and came back nine tenths closed. The case was green,
  because it called `d.update` directly with a stub boss -- the one call the
  game never makes. Anything the director must do while a boss is up belongs on
  the boss side of that if/else, and its case has to go through `g.update` and
  a real `openBoss`.
- **Steering runs from `physicsStep`, not from `Enemy.update`.** A state that
  should stop a body moving has to be honoured in both: build 210's fizzle
  early-returned from `update` and the body went on driving at the turret
  through its own dissolve -- 1 to 20 u/s, eleven units closer.
- **A `Set` of bodies cleared without clearing the per-body flag locks them
  out for good.** `world.attackers.clear()` in the two boss sites left
  `e.attacking` true, and the grab loop skips anything already flagged, so a
  live body cleared mid-fight could never be re-grabbed. 472 frames of
  disagreement over one ORDINAL fight. Membership and flag come off together.
- **A pulse that multiplies ALPHA cannot be made to pass a contrast floor.**
  The glitch readout's red spent half its cycle under 3:1 and never reached 4.5
  against any ground the game uses, because `rgba(tone, 0.92 * beat)` composites
  it further into the field the dimmer it gets. Text that has to be read over
  arbitrary content needs a plate, not a brighter colour.
- **A canvas readout drawn INSIDE the glitch shader is torn.** `drawGlitch`
  paints into the buffer `glitch.present` corrupts, which is the point -- but
  it means thin glyphs over a busy ground vanish exactly when the number
  matters. Plate them, and tune the shader's contribution against the WORST
  case (several attackers plus a full fuse), not against one attacker.
- **A "spy" test that records call NAMES proves almost nothing.** Build 210's
  ring case counted two arcs and regexp'd the digits, and passed against four
  substitute implementations -- including a ring that never closed and a clock
  that counted up. Record the ARGUMENTS and assert they move the right way.
- **The hit point a projectile hands over is not on the surface, and only one
  component of it means anything.** `resolveSegment` passes the closest point
  on the round's ONE-FRAME STEP to the body's centre, clamped to the ends of
  that step -- measured, a bolt fired dead-centre at a BULWARK reports a
  contact point 48 units short of the centre, three units OUTSIDE a 45-unit
  body, because its step ended there. The component ALONG the travel is
  sub-frame phase and nothing else. The component ACROSS it is the exact impact
  parameter and cannot be corrupted by the clamp, because the perpendicular
  distance from the centre to the round's line is the same for every point on
  that line. `contactAt` in physics.js derives everything from that one number;
  nothing else in the hit point is safe to use. And |b| exceeds `r` in normal
  play -- the hit test is against `e.r + p.r`, p90 measured at 1.055r -- so
  clamp before any `sqrt(r*r - b*b)` or a NaN velocity loses the body for the
  rest of the run without throwing.
- **Three separate things had already been written against that vector as
  though it were a normal**, and all three were wrong in the same way: the
  spin (`spread(push * 0.02)`, a scatter unrelated to where the round hit),
  PRISM's "only a square-on hit lands" (dividing by the RADIUS rather than by
  the offset's own length, so it reduced to sub-frame phase -- measured 0 of 40
  dead-centre rounds landing), and both ricochets (mirroring about the round's
  own line, so a square-on bounce went back the way it came). If a fourth thing
  ever needs a surface normal, it is `contactAt`, not `(hit - centre)`.
- **A cap applied after the step does not cap that step.** Both of
  `integrate`'s ceilings -- the speed one from the day it was written, the spin
  one added in build 211 -- sat below `x += vx * dt` and `angle += av * dt`, so
  each bounded every frame except the one it existed to bound: the frame the
  excess arrives on is committed in full and only then clipped. Measured, a
  body handed the textbook rim spin turned 55.9 degrees on its first substep
  against a cap that should have held it to 8.6, and bodies exceeded their own
  speed cap on 1.02% of substeps. Clamp the state, then integrate it.
- **A bounce that sets a position is overwritten by the caller.**
  `updateProjectiles` computes the end of the step from the velocity the round
  had BEFORE the sweep and then writes it unconditionally, so a reflected round
  was teleported back to the un-reflected end of its own step -- measured on a
  pinned PRISM, 16.2 to 16.9 units from the centre of a 20-unit body, i.e.
  inside the thing it had just bounced off, with the velocity turned perfectly
  correctly. `p.placed` is how a bounce says it has already chosen.
- **A hit test against `e.r + p.r` has its contact geometry on THAT circle**,
  not on `e.r`. Deriving the normal on the body's own radius under-turned every
  bounce (14.5 degrees at b = 0.6r, 27 at 0.9r) and, because |b| reaches
  `e.r + p.r`, flattened the outer fifth of the aperture to an incidence of
  exactly 0 -- so the grazing shots that need the geometry most got none of it.
- **A test that pins a SYMMETRY cannot see a SIGN.** Build 211's spin case
  asserted that two rim hits come out with opposite signs -- equally true of
  the correct model and of its mirror image -- and the mirror image is what
  shipped: every body on the field turned the wrong way, with the case green
  and a player noticing before the suite did. `L = r x J = -b*push` when the
  lever is measured along `perp = (-dir.y, dir.x)`; the two terms of the cross
  product carry the SAME sign there, which is the easy thing to get wrong by
  eye. Assert the direction somebody watching the screen would name, in every
  arrangement of travel and offset, not that two of them differ.
- **Canvas y runs down, so `ctx.rotate(+a)` is CLOCKWISE** and a body
  integrated as `angle += av * dt` turns clockwise for positive `av`. The 2D
  cross product written in these raw components is positive for a torque that
  appears clockwise. Every rotational sign in the game has to be derived in
  that frame, not in the one from a textbook.
- **An off-centre impulse does not reduce the linear shove.** All of J reaches
  the centre of mass wherever it lands; the lever arm adds angular momentum on
  top. So build 211's spin cost the knockback ladder nothing and HEAVY is worth
  exactly what it was worth -- which is also why the change is safe to make
  without a balance pass.
- **A ring fades and thins as it GROWS.** `drawFx` strokes it at `alpha = t`
  and `width = w * t`, both running from full at spawn to nothing at the end,
  so a ring authored to expand INTO a radius is at its dimmest and thinnest
  exactly where that radius is. HE's burst did that and then overshot by
  another 40% on top, which is why the frame the damage landed on was the
  least conspicuous frame of the effect. Draw the circle you mean at the radius
  you mean it, and let it drift outward as it dies.
- **Judging an effect off live screenshots measures the game's frame loop, not
  the effect.** The first read of build 211's HE burst said it was gone by
  frame 7; it was not, the rAF loop had aged the pool through the 90ms waits
  between screenshots. Step `updateFx` by hand onto an offscreen canvas and
  render a strip of frames -- and if something looks absent, measure the pixels
  before believing your eyes: the front ring read as missing in a PNG and was
  there at peak 246 of 255.
- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.
