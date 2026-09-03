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

## The default is FAST (build 225 onward)

Builds 220-224 each ran a full audit's worth of verification for a handful of
requests, and it made shipping anything slow. The user asked for the review
process to be lighter, with **full audits every few sessions instead of every
build**. So the ceiling below is the default, and anything above it is opt-in:

**A normal change gets, in total:**
- `node scripts/check-build.mjs --stamp` — always, it is the cheapest guard
  in the repo and REV goes stale on every source edit.
- **ONE** run of `scripts/regress.mjs`.
- `node scripts/bundle.mjs` if a served file changed.

**That is the whole list.** Not per change — per REQUEST.

**Skip by default, and say so in the reply rather than doing them:**
- The ORDINAL hash, unless the change touches energy, targeting or the boss.
  (That rule is unchanged and is the one exception worth keeping: a canonical
  number nobody checks re-baselines itself.)
- `smoke.mjs`, `tiers.mjs`, `dps.mjs`, `variance.mjs`, `contact.mjs`.
- Revert-and-fail proofs on new cases. Worth it for a subtle mechanism the
  case could pass without; not worth it for a removal, a config number, a
  colour, or anything whose case would obviously fail without the change.
- Re-running the suite to chase a known flake. Note it and move on.
- Bespoke measurement probes. Reach for one when a number is genuinely
  unknown and the answer changes the design -- not to confirm something the
  code already says plainly.

**Still non-negotiable, because each has cost a shipped bug:**
- One green suite run before pushing.
- A case for anything that ships broken.
- `--stamp` last, or installed copies never update.

## Do not, unless asked

- Adversarial review workflows or multi-agent fan-outs. They are the single
  largest cost and are almost never what the request needed.
- Reviewing parts of the app the change did not touch.

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

**Re-measured at build 227's audit** (tiers 1-20, two runs), because the two
paragraphs above are dated 177 and 189 and read as current if you are
skimming. Three cadence nodes have gone since -- TRIPLE TAP (189), HOT LOAD
(193), DOUBLE TAP (225) -- and the shape is different:

- **dps plateaus at 423**, from about tier 6 to tier 20, against the 2,050 of
  build 177. Rounds a second tops out at **4.8**, against 25.9 with TRIPLE TAP
  and 17.0 after it went. The whole cadence ladder is one FEED at 1.11x.
- **The late wall is back and is the worst body, not the wave.** BULWARK's TTK
  climbs 6.4s at tier 9 to **21.0s at tier 20**; a TOW's head goes 3.3s to
  10.8s. Build 177's finding was that single-body TTK settled at about 1.0s
  and was therefore the wrong wall to watch. It is the right one again.
- The heaviest band-5 wave does **not** clear inside the 120s cap at tiers 16,
  17, 19 and 20. That is the documented plateau and the arsenal is the answer
  to it -- SPORE cleared it in 64s against BOLT's 160 at build 195 -- but the
  BOLT column is now failing at four of the top five rungs rather than one.
- Spend caps at **109,550 for 135 buys**, which is the whole tree.

That reading is what build 229's rebalance answered, and the table above is
now history -- kept because it is the measurement the change was made against.
**HOLLOWPOINT went 3 levels at 1.5 to 5 at 1.32** (the same x4.00, arriving
four cost-steps further up the ladder, because at three levels the whole
damage curve was affordable by about tier 6 and every rung above that was
health climbing against a gun that had stopped), **`hpStep` 1.12 -> 1.085**
and **`bountyStep` 1.10 -> 1.075**. Re-measured, worst body in the band: 4.0s
at tier 9, 4.3s at 10, 6.2s at 14, 10.3s at 20, 25.6s at 32 -- which is plan
B's 2-4s through about tier 10 and past 6s by about 14 -- and waves start
missing the 120s cap at tier 22 rather than 16. The full derivation and both
tables are in `docs/pacing.md` under build 229.

**The hash did not move and did not need to.** Both slopes are
`step ^ (tier - 1)`, exactly 1 at tier 1, and `fight.mjs` runs at tier 1 --
re-run and identical at 1796395127. That is the one shape of energy change
the "run it on any build that touches energy" rule above will legitimately
show nothing for; run it anyway, because knowing it did not move is the point.

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
- **The menu is two menus in one sheet from build 226.** ARSENAL (AMMO,
  MINES, UPGRADES, ULTIMATE) and SYSTEM (OBJECTS, SETTINGS); `GROUPS` in
  menu.js is the whole definition. The loadout sheet (`#loadout`, `#loadScrim`,
  `body.loadoutOpen`, `Hud.showLoadout/hideLoadout`) is gone -- it is the
  first two tabs, with one set of slots/list/door per group (`#loadSlots_ammo`
  etc.) and `Game.loadoutOpen` is a getter off the menu. Doors: hamburger ->
  SYSTEM, energy chip -> UPGRADES, the strip's AMMO/MINES -> that tab,
  `Menu.openTab(id)` for all of them; `openTo(branch)` is still the tree-branch
  jump. The panel swipes sideways through all six (`swipeTabs` in swipe.js,
  bound on `#menuPanels` so the sheet's own down-swipe never sees it) and
  crosses menus at the edge. ULTIMATE is `sealed` on purpose: a locked tab
  that looks locked, with a room that says so.
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
- **Fire rate and DOUBLE TAP are both gone from the tree.** HOT LOAD went in
  193, TRIPLE TAP in 189, and DOUBLE TAP in 225 -- so `up.rate` on a fully
  bought turret is 0.9, the whole cadence ladder is worth 1.11x, and nothing
  in the game multiplies rounds a pull any more. DOUBLE TAP was the largest of
  them by far at a flat 1.5 rounds a trigger pull, larger than every fire-rate
  node put together, and it was on ONE round of nine. `regress.mjs` asserts
  the absence of any node whose id ends in `tap` as well as the product, which
  is what catches a replacement arriving under a new name.
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
- **`levels` is mandatory from build 224, and there is no default.** This was
  `u.levels ?? 3` in `tree.js`, so a node the author never capped was sold
  three times.
  Caught three times now: HOT LOAD (193), BUCKSHOT (217), then REPULSOR and
  STANDING ORDER together in 219 — the latter being the one node that touches
  all eight ability buttons, at 0.8³ = 0.512 against a row saying "-20%".
  `regress.mjs` pins the level TOTAL and asserts each ladder as a product
  (`up.rate`, `up.cooldown`), which is what catches a new node arriving as
  well as an old one taking its default back.
  **The source of it was upgrades.js's own docstring**, which said in as many
  words that "`levels` absent means without limit" and named HOLLOWPOINT as
  the example -- one of the uncapped nodes. EIGHT shipped that way in the end.
  Build 220 corrected the paragraph and asked for the number to be written
  out, and **that was not enough, which is the lesson**: correcting the
  documentation left the SILENCE in place, so a node relying on the default
  and a node deliberately set to three were still the same text, the mistake
  was still invisible, and DEEP CHARGE shipped uncapped three builds later.
  Build 224 removed the default instead. `tree.js` exports `levelsOf`, which
  throws on a node that declares none (or declares zero, a negative or a
  fraction); `check-build.mjs` fails the build for one, which also catches an
  upgrade written but not yet hung on the tree -- one `leaf()` never sees and
  so can never throw for. The fifteen nodes that had been living on the
  default now write `levels: 3` out, so the ladder was unchanged by that pass:
  106 levels across 54 upgrade nodes at the time, pinned by its own case as
  well as by the BUILT readout. Build 229's rebalance is the only thing that
  has moved it since, by exactly the two levels it put on HOLLOWPOINT -- 108
  across 54, and a BUILT readout of 135.
  **A defaulted value that is indistinguishable from a chosen one is the
  shape to watch for**, whatever the field. The fix is never a better comment;
  it is making the omission impossible to write.
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
- **Two flakes were run down in build 226, and both were the TOW case's
  disease from 223.** "ORDINAL can be fought on the assists alone" passed 14
  of 14 in isolation and failed about one run in fifteen in the suite: it
  called `restart()` and assumed that was a clean world, and a hundred cases
  run before it. Its setup now sets the round, the tree, the aim mode, the
  time scale and every field list explicitly. "EBB sends the wreckage the
  other way" opened its window on the frame of the body's death and measured
  the EXPLOSION -- wreckage leaves at 70-240 u/s in every direction -- so the
  untraited baseline read 741 -> 744, three units OUT on motes whose whole
  job is to come in. It waits three quarters of a second for the throw to
  spend itself now. The rule both share: **a case that fails one run in N and
  passes alone is inheriting state, and `restart()` is not a reset of
  everything a case can leave behind.** Set what the question depends on.
  The third flicker, "the debris is thrown along lobes", is a randomised
  burst pattern and has not been run down.
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
- **A redundant `export` hides dead code from the sweep that would find it.**
  Thirteen symbols were exported with no consumer outside their own file and
  none in the suite, and one of them -- `mineScale` -- had no caller at all
  while `drawMines` restated its arithmetic inline. Exporting for the suite is
  a real and stated reason; exporting because the symbol happened to be at the
  top of the file is how a dead function survives a grep. Two sweeps that came
  back CLEAN in build 220 and need not be repeated soon: every key in the
  `world.up` defaults table has a writer and a reader, and styles.css has no
  dead selectors beyond the two documented false-positive shapes.
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
- **Continuous damage has to run on a CLOCK, not on the frame.**
  `applyDamage` floors every hit at `Math.max(1, dmg * (1 - plate) * (1 -
  ward))`, and `Patch` ticks four times a second for exactly that reason. Two
  other sources did not: WIRE's cut at 79/s is 1.32 a frame at 60Hz, which
  floors on anything with armour over 0.24, and 0.66 at 120Hz, which floors on
  EVERYTHING -- 120 a second against a rated 79, armour ignored. HARD CASING
  was the same. A per-frame IMPULSE is worse and runs the other way: it pays
  the repeated-hit fade once a frame, so a second on the wire took `kicked` to
  9.7 at 60Hz and 14.2 at 120 against the 4.25 sustained gunfire settles at --
  the shove delivered a sixth of nominal, more of it the slower the display,
  and then scaled down every later shove on that body for twenty seconds.
  `CFG.wire.tick` is the shared rate. Never fix this by touching the floor or
  the fade: they are on every damage path and that route re-baselines ORDINAL.
- **Three instruments for one measurement, and two of them were tautologies.**
  Measuring that fault: healing the body each frame and reading `start - hp`
  is zero by construction; summing the `dmg` ARGUMENT at the door is `79 * dt`
  and therefore rate-independent whatever the code does, because the floor is
  applied INSIDE `applyDamage`. Only delivered health, on a body given enough
  to survive the window, measures it. And buy ONE level of the upgrade: at
  three the bite clears the floor at both rates and a fully bought turret
  cannot see the fault at all.
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
- **A shove is `impulse * invMass`, so the WITNESS's mass is the instrument.**
  Build 221's HEAVE case put a BULWARK inside the shell to be sure "what moves
  it is the shove and not its own legs" and reported 16.5 u/s as a failure on a
  working build. BULWARK's invMass is 0.030 against 0.20-2.38 for every other
  body in the game -- an order of magnitude down, and the one body a shove
  barely moves. Measured against a fully-bought PULSE on the SAME body: 24.2.
  HEAVE was already 68% of the largest shove in the game. The ordinary attacker
  carries the assertion now and the heavy one gets an arm asserting the mass
  dependence, which is the thing worth pinning anyway.
- **A fit measured in a frame the size of the frame is measured through the
  clipping it exists to correct.** The glossary's icons are drawn into a square
  and two of them (NEEDLE at 2.24x its own radius, TOW) already ran past the
  edge, so a scratch canvas the size of the cell recorded a reach the frame had
  truncated and computed a correction far too small -- they clipped again, by
  less. Measure in a scratch twice the box and the reach is the shape's.
- **A flat amplitude on a radius-scaled shape is not an amplitude.** PILE's
  crest was authored at 4.5 units, which is 2.7% of a 168-unit front: invisible,
  and it read as WARD at a different radius. Anything that has to be SEEN on a
  shape whose size varies has to scale with it (`rr * 0.052` here, measured at
  8.9%), with a flat term only as the floor for the small end.
- **A rotation convention copied without its FRAME turns the drawing ninety
  degrees.** The turret draws its barrel along local +x and turns it by `aim`,
  which is `-PI/2` for straight up. The DECOY draws its along local -y -- which
  is already up -- and then applied the same `-PI/2` on top, and
  `rotate(-PI/2)` sends local -y to world -x. So the stand-in for the turret
  stood there aiming across the field, for every build it has existed. Measured
  in two equal windows the same distance out from the mount: 16 lit pixels
  above and 70 to the left. Nobody saw it in sixty builds because a hexagon with
  a stub on it reads as a turret whichever way the stub points.
- **...and it was found only because it fouled a different measurement.** The
  case for the decoy's life reads the six sides of its mount, and one of them --
  the left edge -- would not dim at any life however far the clock ran down. It
  was the barrel lying along that chord. A probe precise enough to have one
  outlier is a probe that can find something you were not looking for; a probe
  that sums the whole frame cannot. Which is the same lesson from the other
  side: **the first version of that case summed every lit pixel** and read a 13%
  drop across two thirds of a life, because `drawGlow` at 3.4 radii is by far
  the brightest thing in the frame and does not depend on the clock at all.
- **A hold that RESETS on leaving its range is a hold that never completes under
  fire.** A TOW winds its load for a fixed time inside `hurl.range` and
  `windUp` set `this.wind = 0` the moment the head drifted back out -- and
  gunfire shoves the head backwards continuously. Measured at tier 9 over five
  pairs released the way the director releases them: **two of the five threw
  nothing at all**, one of them having wound for four seconds across two
  attempts. It bleeds at `holdWind` a second now, so leaving range costs ground
  rather than the attempt. The same measurement is why `range` went 430 to 640
  (a pair arrives 1065-1147 units out and took 18.7-27.0 SECONDS to close to
  430) and why the head lets go as it dies.
- **A body that takes its share of every contact cannot cross a crowd.** A
  hurled MASS is the fastest thing on the field and `resolvePair` shares `j` by
  inverse mass, so it was slowed by every MOTE it clipped: measured, nine bodies
  in the way and it stopped 323 units short of a turret it reaches in 0.70s
  across an empty field. `plow` marks a body that takes no share at all. Two
  guards make it safe and both are load-bearing: it applies only against a body
  with `invMass > 0`, so the turret and the DECOY -- static, the two things it
  must never pass through -- stop it dead; and what it throws is marked
  `thrown`, because the whole impulse now lands on one side and `integrate`
  would otherwise clip the struck body back inside the plow's radius, where a
  contact that cannot separate bills `impactDamage` to both every frame. Before
  that line, a MASS and the BULWARK it hit deleted each other in four frames.
- **Removing a readout means finding its other readers.** The per-wave per-cent
  came off the OBJECTS chip and `Director.cleared` stayed, because three other
  things draw it: the rail's third bar, AUDIT's CLEARED row, and `score`, which
  is the wave verdict itself. What did have to move was `fitBar` -- it is keyed
  on the digit counts of three numbers and had NO caller for the kill count,
  having been re-run by accident all this time through the sibling that was
  just deleted.
- **A `dead` guard written for one branch covered the branch beside it.**
  `checkContact` skipped `e.dead` for the whole loop, and physics runs before
  it -- the pair solver bills `impactDamage` to both sides, so a MASS arriving
  at 620 with 280 health routinely destroys itself on the turret inside the
  frame it arrives and was already dead when the contact loop looked. The
  corruption spike is the entire reason a thrown MASS is a different event from
  something walking into you, and it fired only when the load SURVIVED: the
  harder it hit you, the less likely it was to register. Measured, four of
  eight releases landed at 52 units against a 55-unit band and did nothing.
  The spike is exempt from the guard now; becoming an ATTACKER is not, because
  a dead body in `world.attackers` is an entry nothing ever releases.
- **...and the obvious fix for that was not the bug, which is why it was
  reverted.** The first read said the contact test was a point test sampled
  once a frame against a body moving 10.3 units a frame, so it was rewritten to
  sweep the step the way `resolveSegment` sweeps a projectile. It took the
  probe from 4/8 to 8/8 and was still wrong: a 620 u/s body cannot tunnel a
  55-unit DISC -- it is inside for ten frames -- and the case written to prove
  the tunnelling failed, reporting the body sampled inside every time. It only
  helped by catching the load one frame earlier and thereby racing the death.
  A fix that improves the number without the mechanism being real is a
  coincidence; write the case that would fail if it were not.
- **A case that fails one run in three can be two faults, and here it was.**
  The death ordering above, and the case clearing half the field it said it was
  clearing -- it emptied `enemies`, `effects` and `mines` under a comment about
  needing a clean field, and left `drops`, `debris`, `projectiles` and a fully
  bought `world.up` from the hundred cases that run before it. Fix the code
  fault and the instrument fault separately, or neither is shown.
- **Every saturated hue in this game is spoken for, so tell things apart by
  REGISTER.** The tree's ALL MINES group wore `ROOT_TONE.mines` `#ffb347` and
  BLAST wears `#ffb247`: **dE 0.6 in CIELAB**, which is not "similar", it is
  the same colour, and `Menu.toneOf` walks up to the nearest tone so every row
  under ALL MINES inherited it. Cyan, azure, mint, teal, periwinkle, violet,
  magenta, rose, red, amber, gold and three greens are all taken by an arm, an
  ability or a root, so the three ALL-X groups took the one register left -- a
  warm unsaturated bone against a palette of saturated colour plus two COLD
  neutrals -- and a `.univ` class carries the same distinction structurally,
  because a rule that lives only in a hue is one a colourblind player never
  receives. Measure hex pairs in Lab; two strings that look different in a
  diff can be the same colour on a screen.
- **A fan spawned at the point of impact opens BACKWARDS.** `contactAt` hands
  over a point on the NEAR face (`e.x + nx * e.r`), so SLIVER's arc was
  created in the space the round had already crossed and covered nothing new.
  The exit is not in the hit and has to be derived: the closest point on the
  round's line to the centre is `centre + perp * b`, and the chord's half
  length is `sqrt(r^2 - b^2)` -- clamped at zero, because |b| runs up to
  `e.r + p.r` and a graze legitimately has no chord. `b` is the only component
  of the contact that is exact; see the build-211 note above.
- **The GATE is the only way to meet an anomaly, and it already was.** The
  tree's ANOMALY branch went in build 227 -- seven repeatable nodes, 100 to
  500 energy each, gated `needs` on the boss before -- because an aperture was
  the only thing in the tree that was not an upgrade to anything: it competed
  for energy with the machine you would meet the boss with. What is left is
  `CFG.waves.tier.gates` (index n-1) and `Game.syncGate`, which has lit the
  banner at no cost since build 203.
  **The removal nearly shipped a second granter.** Build 227 added `at:` rungs
  to `ANOMALIES` and a `grantApertures` called from `onTier`, keyed 3/6/10/14
  /19/25/32 -- against authored gates of 6/12/18/24/30/36/42. It would have
  handed ORDINAL's way in at rung 3 while the ladder was still held at 6, and
  it broke `syncGate`'s "topped up to one rather than added to" invariant,
  which is what makes the gate un-farmable and what makes it come back after a
  withdrawal. It was reverted before the suite ever ran it. **Before building a
  mechanism, grep for the one that already does it** -- the README described
  the gates in full, three sections down from where the change started.
- **The title screen has one primary button, and RESET asks for a word.**
  NEW RUN sat beside CONTINUE doing the destructive thing -- `Game.start`
  calls `forgetRun` -- with the quieter label of the two. It is gone: the
  primary is CONTINUE when there is a run on disk and BEGIN SIMULATION when
  there is not (CSS hides the other), and starting over is a small RESET
  SIMULATION at the foot that only exists when there is a save and asks you to
  type DELETE. Everything on that panel is held to 11px and 4.5:1 by the
  suite's own sweep -- **and that sweep read only the no-save state until
  build 227**, so the record tiles, the resume line, the reset and its box were
  never measured. It runs twice now. The tile labels are one word each for the
  same reason: two words wrap in a third of a 390-wide panel at 11px.
- **`ROOT_TONE.mines` is still BLAST's colour, and that is known.** Measured
  at build 227's audit across all 45 tones in the game: `#ffb347` against
  BLAST's `#ffb247` is **dE 0.6**. Build 223 fixed the ALL MINES *group* by
  giving the three ALL-X headings their own bone register; the MINES *root*
  heading was not part of that and still matches the first arm under it. Left
  alone deliberately -- the warm band is full (SCATTER 15.7, LANCE 16.7,
  GNOMON 22.6 away), and the same heading-matches-a-child shape is deliberate
  for TURRET, whose root IS PULSE's `#59e0ff` at dE 0. Do not "fix" it by
  picking a new category colour without asking; the only well-separated
  regions left are greens, and green means energy.
- **A readout with no assertion behind it can go wrong and stay green, and
  two did in one build.** `smoke.mjs` printed the whole title footer under
  "running build:" because 227 moved the build number into a child element,
  and the title's own "07 TRACKED" was pinned at seven forever because
  `Game.update` holds the boot field at seven drifters and nothing kills
  drift -- both shipped, both exited 0, and one of them carried a comment
  calling itself live telemetry. If a probe or a panel prints a number, either
  assert it or expect it to rot.
- **A wave has an arc from build 229, and it lives in `CFG.waves.press`.**
  Every release used to be a flat draw from `gap` and every wave ended on a
  flat draw from `rest`, so the seam between two waves was the only pacing the
  game had. `emit()` now scales the gap from `press.open` on a wave's first
  release to `press.close` on its last, linearly in how much of the wave has
  been sent -- measured 2.0s down to 1.0s at tiers 3, 8, 14 and 20 -- and the
  rest earns `restPer` a body on top of `rest`, capped at `restCap`, so a long
  wave buys a longer breath (about 5.0s). Two things it must not touch: teach
  waves are exempt (they are authored beats and the arc fights them), and
  `overclockGap` still multiplies on top, so an armed wave reads as a squeeze
  against the arc rather than against a flat line. The progress term needs
  `jobsAt` -- the job count captured in `load()` -- because `jobs` is consumed
  as it goes and a wave cannot say how far through itself it is from what is
  left alone.
- **A blast radius is a product, and cutting one term of it three builds
  running does not hold.** BLAST and KNELL were reported as filling the screen
  at builds 223, 227 and 229. 223 capped DEEP CHARGE's levels, 227 took 30%
  off both base radii, and the complaint came back both times, because the
  maximum is `base x toll growth x DEEP CHARGE` and each fix moved one term
  while the other two went on multiplying: measured on a 414-point phone,
  KNELL's last toll was **113% of the screen width** and BLAST 64%. Build 230
  takes the other two -- `knell.grow` (an unbounded `1 + i * grow`, so FOURTH
  BELL's two extra tolls were bought PAST the end of the ladder) is now
  `knell.spread`, the ratio of the last toll to the first with however many
  tolls there are spread evenly between, so the widest ring is
  `r * spread * mineBlast` whatever is owned; and DEEP CHARGE is 1.22 a level
  rather than 1.35, because a node selling RADIUS is quadratic in what it
  gives and +35% a level was +82% of the area. Both mines now top out at 156,
  half a 390-point screen.
  **The guard was as wrong as the numbers, and had been green through the
  complaint twice.** `regress.mjs` asserted four hand-typed ceilings, each set
  to whatever the value of the day was -- `knell < 400` under a comment saying
  "a radius over 315 is a circle wider than the screen. Every one of these is
  now inside that". It states the rule now, against `innerWidth / CFG.zoom`:
  a blast is read from its EDGE and gets half the screen; a standing reach
  (SNARE 168, LODE 147, THORN 190) is read from its CONTENTS and gets two
  thirds. A ceiling written to fit the current number is not a ceiling.
  For the record, the biggest circles in the game are not mines: PULSE is
  **575 fully bought (172% of the screen)**, PRISM 300, DECOY's death blast
  260, PILE's top front 240, WELL 210. Those are deliberate presses on a
  cooldown, centred on the machine, one at a time -- a mine is one of five,
  scattered, going off on its own -- which is the whole reason the mine
  ceiling is lower. If an ability is ever reported the same way, the numbers
  are here.
- **A mine that ends itself has to be asked how long it LASTS.** Seven kinds
  sit on the field for the whole of `CFG.mines.life` and a KNELL was gone
  **2.85 seconds** after it was thrown, against 15.9 for every other kind and
  a throw clock of 15 -- a live mine 19% of the time, and it spent that 19%
  in the window before a wave had reached the ground it was denying. Measured
  on a lane bodies actually walk down, it delivered **zero**; the player's
  report was "KNELL doesn't do damage" and the mine's own docstring said it
  "denies the ground whether anything is there or not". The cause was
  arithmetic nobody had done: a knell dies on its LAST toll and `gap` was a
  flat 1.15s, so two tolls were over in under three seconds. `knell.span` is
  the window now -- first toll to last, with however many tolls there are
  spread evenly inside it, the same shape `spread` gives the radius -- so
  FOURTH BELL makes the bell ring more OFTEN rather than for longer, and the
  mine denies its ground for about four fifths of its life either way.
  `regress.mjs` lays one of each kind on an empty field and asserts none is
  spent inside two thirds of its life, which is the one line that would have
  caught it.
- **Mines are benched three ways and each bench lies differently.** A pinned
  crowd gives a duration mine fifteen seconds on stationary targets, so THORN
  read 31,379 against BLAST's 2,899 -- an eleven-fold gap that is mostly the
  instrument. A moving lane fixes that and under-samples the instant mines
  instead: six bodies over a 550-unit lane means one ring of 105 units
  catches nobody, and BLAST read **-16** on a run the static bench scores at
  458. Pack the lane to a real wave's density and body-on-body grinding
  becomes a control of 518 that swamps the signal. Read them together, and
  always subtract a control run of the same crowd with no mine: bodies 46
  apart with a radius of 24 OVERLAP, and `resolvePair` billed impactDamage
  every frame -- which is how LODE, a mine with no damage at all, first
  measured 1,207.
  Where build 231 left them, static crowd, control-subtracted, stock/bought:
  BLAST 653/4,211 · KNELL 442/3,917 · SPALL 456/4,274 · THORN 4,386/24,673 ·
  WIRE 5,234/18,024 · VOID one kill whatever its health · SNARE and LODE zero
  by design (SNARE's damage is the knot grinding: 32,932/91,019 loose).
- **The SANDBOX is the instrument, and `ledger.js` is why it can be believed.**
  Build 232. A tree node (20,000, one level, beside RECAST above the four
  categories, because it is not an upgrade to anything) opens a SANDBOX tab
  under SYSTEM. Inside: no waves, no energy, no salvage, no rules, no glitch
  fuse, no checkpoint, a flat slate sky, and the run's own kit. What may be
  put down is `codex.seen` -- what this device has destroyed at least once --
  and that gates the anomalies too. Entering checkpoints the run and leaving
  `resume()`s it, so both directions are the restore the game already had.
  **`checkpoint()` refuses from inside**, or the bench would overwrite the run
  it is standing on.
  The counter is `ledger.note(src, real, over)` called from ONE place --
  inside `Enemy.applyDamage`, past ARMORED's discard, past the plate, past a
  HERALD's ward and past the `Math.max(1, ...)` floor -- so what it books is
  what the body lost. Recording the ARGUMENT instead would be recording what
  the caller asked for, which is the instrument fault build 231 already paid
  for. Sources are ARSENAL keys and ABILITIES ids so the panel takes its
  labels from the same tables the rest of the interface does; the handful that
  are neither are in `SRC_EXTRA`. It is armed only in the sandbox and `note`
  returns on its first line otherwise, because `applyDamage` runs tens of
  thousands of times in a boss fight.
  The case that matters asserts the ledger's total equals the health a body
  actually lost, for four rounds -- BOLT plus the three whose damage does not
  come out of the muzzle (HE's blast, ARC's chain, SPINE's splinters), because
  a counter that is right for BOLT and wrong for those is the failure worth
  guarding against.
- **A total that adds up does not mean the table is right.** Build 233 swept
  all 25 damage sources -- 9 rounds, 8 mines, 8 abilities -- against a pinned
  wall and found FOUR mis-booked, every one of which passed the total-only
  check build 232 shipped with, because a nameless hit still adds up. PULSE's
  blast carried no source at all and went to `unattributed`; **HAIL's darts
  and PRISM's shell fell through `fire`'s default to `world.round`**, so
  pressing either read as the gun; and a BLOOM taking its neighbours with it
  was nameless. The tell is the `unattributed` row, and the assertion that
  catches it is WHICH ROWS EXIST, not a share of the total -- a share moves
  with the window, because PILE fires on a clock of its own and lands on the
  same wall (PULSE owned 58% of six seconds and 41% of twelve). The rule the
  suite states: the source's own row is not empty, and no row exists that is
  not the source, PILE or contact.
  Two sources legitimately book no damage and both would read as broken
  without saying so: SNARE's damage is the crowd grinding against itself, and
  **VOID has no damage at all** -- it removes a body through `Enemy.destroy`,
  which never reaches `applyDamage`, so `ledger.kill()` books it as a kill and
  the panel prints "1 kill" where the rate would be. It also refuses a
  practice dummy, which would otherwise be the one thing on the field able to
  end a measurement.
- **The sandbox picker is the FIELD, and a boss is summoned whole.** It listed
  every ENEMY_TYPE at first -- 37 chips including seven boss cores and the
  fourteen pieces they make -- so a bare ORDINAL core with none of its frame
  could be put down, and a DIGIT with no ORDINAL to have come off. It is
  `FIELD_ENTRIES` now, which is the glossary's own split (`CODEX` minus every
  id any anomaly puts on the field), so a new boss or minion is excluded by
  existing rather than by being added to a list.
- **A mood transition does not actually ease, and has not for a long time.**
  `background.update` runs `mixHex(this.mood[key], this.target[key], k)` with
  `k = 1 - exp(-dt * 0.8)` -- about 0.013 at 60Hz -- and `mixHex` rounds to
  whole channels every step. So a channel closer than about 38 to its target
  moves by less than half a unit, rounds back to itself, and NEVER ARRIVES:
  measured, staging -> sandbox sat at the starting colour for twelve seconds
  and moved only when `background.update(1)` was called by hand. Every mood in
  the game is affected, and the ones that appear to work are arriving on their
  few far-apart channels only. Build 232 did NOT fix it -- the fix changes the
  look of staging, the lull and all four boss skies and is its own decision --
  and added `setMood(name, snap)` instead, which the sandbox uses because a
  mode change should be instant anyway.
- **A rate needs a window on it, and a readout needs a cadence.** The
  sandbox's counter was one three-second window redrawn every frame: a weapon
  fired 1.5 times a second moves a three-second window by a third on every
  round, and at 60Hz that is a four-digit number flickering continuously.
  `ledger` keeps ONE ring, thirty seconds deep, and `rate(win)` reads any
  window off it (walked backwards from the newest entry, so the 3s rate the
  dummy is driven from is not a scan of thirty seconds of history). Three are
  used -- 3s drives the dummy, 10s is the bar, 30s is for comparing -- plus
  the run average, which is the one that cannot be gamed by choosing when to
  look. The bar refreshes 4 times a second. **The denominator is
  `min(win, elapsed)`**: with less history than the window, the 30s rate and
  the run average are the same number by design, and a case that reads them
  one second in gets the burst divided by one second, not by three.
- **The practice dummy is a readout, not a target** (build 234, `dummy.js`).
  Two channels that must not drown each other: a MARK per hit (ring, spark
  fan and a plated damage number at the struck face, sized by the delivered
  damage) drawn after the rig so it survives a busy frame, and five BANDS of
  sustained state driven by the 3s rate. Each band arrives as a different
  ELEMENT -- lit ticks on a 24-tick rev counter, brackets, a counter-rotating
  broken ring, arcs, a ground bloom -- and not as more of the same one,
  because a state that lives only in a hue is a state a colourblind player
  never receives. Band 3 originally arrived as a colour change alone and had
  to be given the broken ring.
  Both halves are measured rather than eyeballed: `regress.mjs` drives real
  weapons at a real dummy to prove a fully bought turret reaches every band
  (stock BOLT 1, bought BOLT 3, SCATTER 4, TITHE 5, everything at once 4,700
  dps), and renders the rig to an offscreen canvas at each band to prove each
  differs from the one below by lit pixels or by reach outside the rim -- not
  by colour. Rendering it live would measure the frame loop instead.
  **The radius ceiling is 72**: `GRID_CELL` is twice the largest body and
  `check-build.mjs` asserts the broadphase covers it, so the dummy is 68.
- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.
