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

**ORDINAL's hash is a DIFFERENTIAL instrument, not a canonical number, and the
absolute value below is not reproducible.** Build 243 ran `fight.mjs --seed
20260824 --hash 9000` on build **211 itself** -- the build whose own commit
baselined `1796395127` -- and got **`-1510979434`**. The number cannot be
reproduced on the build it was taken on, so it is not a property of the code:
it is a property of the code *and the container*. The probe's arithmetic runs
through `**`, `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot` and
`Math.exp`, none of which IEEE-754 pins to the bit, and V8 changes them between
versions.

So **every cross-container comparison against a written-down hash is unsound**,
including the "run it on any build that touches energy" rule as it was
practised: a fresh container reports a move that is not there, and cannot
report one that is. Measured in this container, builds 229 through 240 all give
`-1765830468` and build 211 gives `-1510979434`; the eighteen builds between
them include the 229 rebalance, three mine passes and the whole ledger, so the
"one number, carried forward" reading of the history below is fiction.

**How to use it now: take the before yourself, in the session you are working
in.** Run the hash on `HEAD` before your change and again after it, in the same
container. A move you did not intend is still the bug it was always there to
catch -- that is how build 241's regression below was found -- but the
reference is the run you just took, never a number from a previous session.
Re-baselining is therefore meaningless and should stop; record the DELTA and
its cause instead.

**Build 241 moved it and the cause was arithmetic, not behaviour.** Extracting
`routeLateral` out of `drive` re-associated a product: `width * routeScale *
routeSide * reach * closing` became `(width * k * reach * closing) *
routeScale * routeSide`, which is the same value in exact arithmetic and a
different one in the last bit, compounding over 9000 frames -- on the one build
whose entire claim was that era 1 could not change. The two factors are passed
INTO the helper now so the era-1 product is formed in `drive`'s original order
to the bit, `regress.mjs` asserts that with `===` rather than to two decimal
places, and the hash came back to `-1765830468`. **A refactor that only reorders
arithmetic is still a change**, and "to two places" cannot see it.

The history below is kept because each entry names a real change and its reason,
which is still worth reading; the numbers in it are not comparable to anything
you will measure. The old baseline text follows.

**ORDINAL's canonical hash was recorded as `1796395127`** (seed 20260824, 9000 frames),
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

**It has no assertion and exits 0 whatever it draws**, so it is a sheet to look
at and NOT an instrument. Build 246's plan named it as the guard for "the MK1
turret is unchanged"; it cannot be one -- and worse, its cell scale is
`(S * 0.17) / sh.r`, which divides by the very radius a change would move, so a
turret twice the size produces a very similar sheet. There is no golden-image
mechanism anywhere in `scripts/`: every visual instrument in this repo compares
two renders inside ONE process. An "unchanged" claim across a change therefore
needs a digest taken before it and again after, in the same container -- the
same differential rule the ORDINAL hash now carries.

**And a case that asserts a PROXY cannot see the thing it is a proxy for
moving.** Two cases and one design decision were each restating `s.r * 2.4` as
"how far the machine paints" -- a constant somebody measured once, on a BARE
machine, when the fully rigged one paints 2.393r. `Shooter.reach(world)` is
computed from `drawMachine`'s own expressions and is asserted against the
painted pixels to be a tight upper bound. Two things that version got wrong and
that any similar helper will: a stroke is centred on its path, so every filled
part paints half a line width outside its own geometry (5% fully rigged, 19%
bare); and the barrel is a rounded rect laid along the aim from `R * 0.16`, so
its reach is the far CORNER, not the axial tip.

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

**Eighteen cases in the damage-bench family leave the director stubbed and
`spawnLock` pinned, and nothing puts either back.** They write
`w.director.update = () => {}` and `w.spawnLock = 1e9` (the first is from
regress.mjs's own line ~13908 onward), and `reset()` keeps the same Director
object, so both outlive every restart after them. The earlier cases that do
this all save and restore; this family does not. Build 243's aperture case was
the first since to actually need a wave and measured **zero releases in forty
seconds at both eras** while passing in isolation. It sets both explicitly now.
Until the family is fixed, **any new case downstream of it that needs the
director must `delete w.director.update` and clear `spawnLock` itself** —
`restart()` is not a reset of everything a case can leave behind.

Before build 101 this section pointed at a session scratchpad. There were 243
probe scripts in it behind a hand-kept runner list; 21 of the 43 the list named
failed on build 100, every one of them because the probe named something
deleted in builds 81-99, and the lot died with the container. Nothing about
that was a suite.

## How an installed copy updates itself

**There are TWO installs and they update by different mechanisms.** Getting one
right and leaving the other alone is how the same bug shipped twice.

**The single-file build** ships no `sw.js`, so `main.js`'s registration is
switched off in it and no service worker is ever involved — which means nothing
pins it and nothing updates it either. So the page does it: a rev stamp in the
first hundred bytes of the head, and a script that range-fetches its own first
2KB, compares, and reloads once if it differs.

**The served build** — GitHub Pages off this branch, which is what the phone's
home-screen link actually is — has `sw.js`, which is network-first with a cache
name derived from BUILD, plus an escape hatch inline in index.html's head. Both
of those are correct and both fire on `load`.

**`load` is once per COLD START, which is not once per launch.** A home-screen
app's session survives backgrounding for days, so an install that is never
evicted checks on its first launch and never again. That is how a phone sat on
build 113 while the server had 114 — and, five builds' worth of "fixed" later,
how a phone sat on **257** with 258 live and the Pages deploy green, because the
build-113 fix went into the bundle and nothing put it into the served build.

So both ask **on load and on every return to the foreground**. The served build
does it in `main.js`'s `askServer()`: a range request for the first
`PROBE_BYTES` (4096) of index.html, the build literal read out of it, reload if
it differs. `check-build.mjs` fails the build if that literal ever drifts
outside the window — without it the check silently stops finding anything and
the app silently stops updating, which is the same class of failure as the rev
stamp bundle.mjs pins inside its own first 2KB.

The loop guard is on the incoming rev/build, not on the check, so it will reload
at most once for any given target and cannot spin.

**A fix to one of these two paths is half a fix.** Ask which install the report
came from before believing the other one covers it.

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
- **Nothing in this game spends a CHARGE unasked** -- which is narrower than
  the rule that stood from build 190 to 274, and is the thing that was
  actually wrong. REFLEX fired PULSE for you once two things had hold of the
  turret and went through `Abilities.trigger`, which spends `s.charges`,
  starts `s.cd` and sets `s.used`. Build 275's FLINCH and DEADBOLT put the
  behaviour back and call `def.run(world)` instead: the effect happens, with
  every ring, spark, shake and `audio.ability(...)` it carries, and the
  button is untouched. The telling is unchanged and is still not the
  automation's: `.ab.urgent` breathes on the PULSE button for as long as
  anything is attached, bought or not. `regress.mjs` holds the charge rule
  with the whole tree owned, and holds the other half separately -- that the
  two nodes DO fire, counted as arrivals in `world.effects` against a control
  of the same window with both flags off.
- **Calling `run()` instead of `trigger()` means closing three doors by hand,
  and all three fail silently.** SEALED: WARD is in `LOCKABLE.abilities` and
  nothing about owning DEADBOLT owns WARD, so an unconditional `run` stands up
  a shell the run has not bought -- and a ledger replay pushes ids in without
  consulting the tree. HELD: `world.abilityHold` is AXIOM's, and a cast that
  ignored it is a second door through the eighth anomaly's whole mechanic
  (`isHeld` refuses `essential` at the reader, so PULSE is exempt on purpose).
  BUSY: `run` pushes a NEW `Ward` every time and nothing refuses a duplicate,
  so two shells at one radius cut and arc the same bodies twice -- which never
  mattered while the only caller was a button on an 18s cooldown against a 6s
  life. `wardStanding(world)` is exported for that rather than a
  `constructor.name` test at the call site, which survives a rename and
  quietly stops matching.
- **A clock reset by the condition it answers is not a cooldown.** FLINCH's
  and DEADBOLT's were zeroed whenever `world.attackers` emptied, so the first
  grab of a wave was answered instantly -- and these two upgrades are what
  CLEARS the mount, so the mount is empty a lot and the clock re-armed
  continuously. Measured: a WARD standing for 100% of twenty-six seconds of
  being gripped, a permanent wall bought with one level. A cooldown runs down
  ALWAYS and the condition only decides when it is spent, which still answers
  the first grab immediately because the clock ran out during the quiet. And
  for a STATE ability the clock is held at full while its own effect stands,
  or `every` equal to `life` is 100% duty by construction: 6 up and 6 down is
  what "6 second cooldown" has to mean when the thing lasts 6 seconds.
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
- **`setTier` is the machinery's setter and does not gate.** `climbTo` is where
  every ordinary climb is refused, and `endBoss` steps past the gate it just
  answered with `setTier`, which never consults it -- so a new gate written
  into `climbTo` alone is a gate with a second door standing open. Build 272's
  era ceiling walked straight over itself that way: reconcile the seventh at
  rung 42 and the run was at 43. A TRIAL is already safe, and says so in a
  comment: `Director.arm` runs its target through `climbTo`.
- **`sayOnce` DROPS a line it cannot say; it does not queue.** It refuses while
  another line is still being read, so a once-only trigger that calls it loses
  the line outright if the moment is busy -- and arriving anywhere interesting
  is a busy moment, because a wave has just been scored. Offer it every frame
  until `lineSeen` agrees; the line marks itself said when it PAINTS, so that
  is self-limiting. And a case for one has to `forgetLines()` if anything
  upstream of it called `debugTeachAll`, which marks every line said on the
  DEVICE.
- **`drive()`'s early returns are ORDERED, and the harmless one sat above the
  staged one.** Every harmless body went to `wander()` from the frame it
  appeared, whatever its state -- so DRIFT alone fanned out INSIDE the era-2
  doorway while every hostile went straight down and opened up only past the
  gate. Zeroing its spawn velocity did nothing: `wander` put the lateral back
  on the next frame, which is the tell that a spawn-site fix is treating a
  symptom. The march and the wander are different states and the guard has to
  say so.
- **A lateral held for later belongs on the BODY, declared in the constructor.**
  `e.fan` is applied on the frame `staged` goes false, beside the release that
  already existed -- not sprung into existence at the spawn site, for the same
  reason `placed`, `fizzle` and `ignoreT` are declared where they are.
- **Everything a mine measures comes off `m.r`, so one factor moves the picture
  and the rule together.** `CFG.mines.era2` is applied where a mine takes its
  radius rather than to the eight `CFG` entries the kinds read, so a ninth kind
  is covered by existing -- and the trigger reach (`m.r + cfg.trigger`) and the
  ring that DRAWS that reach both follow it, which a factor on the drawing
  alone would have split.
- **ARMORED discards a HIT, and a THROW is not a hit.** Its branch in
  `applyDamage` returned before the impulse block, so with the plate up a
  PULSE delivered nothing at all -- no damage, which is the trait working, and
  no shove, which is the trait reaching something it was never about. PULSE is
  the game's ONE answer to a body sitting on the mount where the barrel cannot
  reach; pressing it and watching nothing happen was the report. Anything with
  `throwOff` (PULSE, PILE, HEAVE, HAIL -- all buttons with clocks) now keeps
  its impulse through that return, and the `isDrop` branch four lines above
  had been doing exactly this, and saying why, since it was written. Ordinary
  gunfire is untouched: no `throwOff`, so a plated round is still a round that
  did not happen.
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
  ELEMENT -- lit ticks on a 24-tick encoder scale, then vents cracking open,
  then the shutters closing across the face, then the cracks, then light
  pooling on the deck and the top shutter jamming -- and not as more of the
  same one, because a state that lives only in a hue is a state a colourblind
  player never receives.
  Both halves are measured rather than eyeballed: `regress.mjs` drives real
  weapons at a real dummy to prove a fully bought turret reaches every band
  (stock BOLT 1, bought BOLT 3, SCATTER 4, TITHE 5, everything at once 4,700
  dps), and renders the rig to an offscreen canvas at each band to prove each
  draws a different picture with the colour divided out -- see the note on
  that instrument below, which took five tries. Rendering it live would
  measure the frame loop instead.
  **The radius ceiling is 72**: `GRID_CELL` is twice the largest body and
  `check-build.mjs` asserts the broadphase covers it, so the dummy is 68.
- **`harmless` is "scenery", and a practice dummy is not scenery.** The dummy
  wore it from build 232 to 234 purely to stop it walking at the turret, and
  `harmless` is a refusal that FIVE damage paths honour: `updateMines` will
  not trigger a mine for one, WIRE will not cut one, a `Patch` will not bite
  one, LANCE's sweep skips it and WARD's arc skips it. So the one room in the
  game whose entire job is measuring damage was silently missing five sources
  -- and the player's report was "have Dummy trigger mines", which is the
  visible corner of it. It is an ordinary body now: `dummyHome` is where it
  was put and `updateDummy` writes `x`/`y` back to it every frame, because
  the moment it stopped being harmless `drive()` started steering it at the
  turret. **A flag borrowed for its side effect brings the rest of its
  meaning with it**; buy the side effect you actually want.
- **A readout drawn over the thing it reads is not a readout.** The bench's
  panel sat 208px over the rig at 320x568 -- the whole point of the room is
  watching the dummy while the number moves, and it could not be done. Three
  things fixed it and all three are load-bearing: the bar moved up to
  `--hud-t` and `#barChips`/`#waveRail` are hidden inside the room (there is
  no wave and no purse), a `@media (max-height: 660px)` compaction, and
  `standoff()` -- which measures the panel's own `getBoundingClientRect()
  .bottom`, converts through `CFG.zoom`, and stands the dummy clear of it
  rather than at a constant. A hand-picked distance is right on the phone it
  was picked on.
- **A band that is entered on the instantaneous rate flashes.** The dummy's
  five bands were read straight off the 3s rate, so a weapon whose rate
  crosses a boundary between rounds repainted the whole rig at 9Hz --
  measured. It rises instantly (a hit that takes you into a band is answered
  on the frame it lands) and falls one band per `DWELL` 0.7s, and only once
  the rate is `MARGIN` 0.12 of that band's own width UNDER its floor. The
  drawing then follows `dummyBandF`, a continuous position eased toward the
  held band, so every element fades in over the half second the position
  takes to cross rather than appearing between two frames. Worst one-frame
  colour step measured 7.5 of 441 crossing a boundary, against 9.3 for the
  jitter it replaced.
- **Three instruments for "does each band draw a different picture" and all
  three were flat.** Lit area, reach outside the rim and the lit box's aspect
  each watch ONE element, so each reads nothing for the two or three bands
  whose arrival it cannot see -- and the aspect reading was worse than flat,
  returning exactly 1.00 six times because the core glow lights every pixel
  inside the rig and the box was measuring the GLOW's circle rather than the
  silhouette. Two more candidates were tried and thrown away for being
  unstable: a vertical/horizontal ratio in the gimbal ring's annulus swings
  0.57 to 2.73 on the ring's roll phase alone, and the lit-tick count cannot
  be read off the picture at all because the halo floods the scale.
  What works is comparing the WHOLE picture with the colour divided out:
  greyscale, divided by the frame's own 98th percentile, clipped, then a mean
  absolute difference. A repaint then cancels **exactly** -- the case asserts
  that, feeding itself the same frame scaled 0.62 and 1.55 and requiring 0,
  which is the instrument proving it is blind to the thing the case is about
  rather than the author asserting it. The other control is the animation:
  the same band eleven frames on differs by 3.2 to 26.1, and every band step
  is 56 to 110, so the threshold is a multiple of the rig's own movement
  (2.5x, against a measured worst case of 3.4x) and not a number fitted to
  the day's output.
- **The bench is the RANGE, and its ids are still `sandbox`.** Renamed in
  build 235 because it stopped being a sandbox -- the object and boss picker
  is gone and there is one dummy in there -- but `RANGE_NAME` is the only
  place the word lives: the tree node id, the tab id, `Game.enterSandbox` and
  the save's own record of what has been bought all still say `sandbox`,
  because a save on a player's phone stores the node id and renaming it
  would silently un-buy a 20,000-energy node.
- **A record is not a run, and the run file cannot hold one.** The testbed's
  lifetime damage total lives in `sim7749-soak`, its own localStorage key,
  because `sim7749-run` is deleted by starting over, by `Game.restart` and by
  the title screen's RESET SIMULATION -- and because `captureRun` refuses to
  write from anywhere but `staging` while `Game.checkpoint` refuses outright
  from inside the room, so a number that only moves in the testbed could not
  be written from there at all. Every device-level fact in this game is
  already shaped this way (`sim7749-codex`, `sim7749-lines`, the prefs, the
  volume): loaded once at module load, bounded on read, written only when it
  has changed, and cleared by `forgetPlayer()` and nothing else -- which is
  the one function that means "the next launch is a first launch". `add` is
  called once per delivered hit and a bought turret lands dozens a second, so
  it is flushed on a clock and from `Game.checkpoint`, above that function's
  own bench guard.
- **"One bead per X damage" and "a very high maximum" are the same request
  pulling in opposite directions, and an odometer is the answer.** One bead
  per thousand and a fully bought turret fills any honest ceiling in four
  minutes; one per million and the stock gun earns its first after four
  hours. `SOAK_SHELLS` is five shells of twenty, each shell's bead worth TEN
  TIMES the one inside it: the first costs 1k (17 seconds of stock BOLT) and
  a full set costs 222,220,000, which is 13.1 hours of the 4,700 dps a fully
  bought turret sustains. Three quarters of the beads are earned inside the
  first eight minutes and the last twenty take hours, which is the shape a
  "very high maximum" actually wants.
- **A sphere projected to 2D fills the DISC, not a ring.** The literal reading
  of "wrapped in spheres" puts half the beads on top of the head -- the one
  thing in the room you aim at and read. The shell is five concentric RINGS of
  twenty instead, one per decade of the ladder, filling clockwise from twelve
  o'clock and 43% larger in the bead each ring out. The first version stippled
  all hundred across one annulus by golden angle, which fills more evenly and
  is prettier and cannot be READ -- the decade is the whole point of an
  odometer and a stipple hides it. Radial separation does not carry it alone
  either: 6.1 units between rings is 3.8 CSS px at this zoom, so the size
  ladder says the same thing a second way. A closed ring gets a joining circle
  and a partial one does not, so shutting a decade is a visible event.
- **A record does not move, and that is not only a taste argument.** The shell
  is in the rig's FIXED register with the collar and the encoder scale -- lit
  from below instead, the lower half at twice the alpha, matching band 5's
  deck pool. Debris moves; the one thing a record must never be mistaken for
  is debris. It also keeps it out of the band sweep's way: `regress.mjs`
  compares whole normalised frames against a control of the same band eleven
  frames apart, and a hundred rotating dots would inflate that control for a
  reason unrelated to bands -- and inflate it MORE the longer the device had
  been played, so the sweep's headroom would shrink as the player played. The
  case pins `soak.total = 0` for the same reason.
- **A `Float32Array` never compares equal to the literal you put in it.**
  `BEAD_S[i]` held the bead's alpha and the draw loop skipped on
  `BEAD_S[i] !== lit` against a literal `0.66` -- true for every bead, because
  what comes back is the float32 nearest 0.66 and not the double. So NO beads
  were drawn at any total, and the joining circles still were, which is why it
  looked like a finished feature: five clean empty rings, and the count they
  exist to show invisible. Typed arrays hold flags as integers, or the
  comparison is against the array's own element.
- **The rig's furthest hard geometry is 1.20R and the docstring said 1.14R.**
  The trunnions are `rect(-RR - R * 0.08, ...)` with `RR = 1.12R`, so their
  corner is at 1.201R. And `Game.drawAutoLock` -- which is not in dummy.js at
  all -- puts four arcs at `e.r + 16` = 1.24R once converged, in the same
  annulus. Anything added round the rig has to be checked against BOTH files;
  the shell starts at 1.30R for that reason.
- **A panel measured before it is filled is measured short.** `standoff` runs
  from `enter()` and stood the rig clear of a panel whose rows were still
  empty -- it grew 10px on the first `syncStats` and landed on the rig. It
  syncs first now. Two more of the same shape in one sitting: it measured the
  ACTIONS ROW's bottom without the panel's own bottom padding, which at
  `CFG.zoom` is the entire 12-unit `clear`, so the rig came out flush against
  the glass; and it had been measuring the PANEL, whose bottom is 62dvh away
  when the source table is open -- so pressing DUMMY with the table open drove
  `far` to zero and parked the rig at `nearest` permanently, because folding
  the table again does not put it back.
- **The clearance is a case now, at 320x568 and 390x844, on entry and once
  the numbers are in.** This promise has been broken four times by four
  different mechanisms and nothing ever failed, because `standoff` always
  returned a number -- it just silently clamped. A guard that watches the
  measured gap is the only thing that can see it.
- **`getBoundingClientRect()` on a `display: none` element is all zeros, and
  the room is `display: none` at the exact moment you enter it.**
  `body.menuOpen #sandbox { display: none }`, and the ENTER button called
  `enterSandbox()` and THEN `setOpen(false)` -- so `standoff` measured a
  panel of no height and stood the rig at its preferred distance under a
  212px readout. Reported from a phone, on a build whose own case claimed
  55px of clearance, **because the case called `enterSandbox()` directly and
  never had the menu open**. That is the CLAUDE.md rule about pressing
  controls through their handler, on a path nobody thought of as a control:
  the door is a control. The sheet closes first now, `standoff` returns
  `null` rather than a number it cannot stand behind, and `update` re-places
  the rig on the first tick the panel is actually rendered.
- **The default is ONE ROW.** Four tiles, a caption, a session line, the
  record and two buttons is 212px on a 414x896 phone -- a quarter of the
  screen, permanently, in a room whose whole point is watching the thing the
  numbers are about. What is up by default is the ten-second rate and how far
  round the record has got; everything else is behind a chevron. And
  `standoff` measures THAT ROW, not the panel, so the fold is allowed to cover
  the field the way the source table always has and the target does not move
  when you open it. Expand to read, fold to shoot. The thing `standoff`
  measures has to be the part that cannot change size -- three earlier
  versions each measured something that grows.
- **A readout that cannot move is not a readout.** The testbed's sub line
  carried "n DESTROYED · n% OVERKILL", and both are pinned at zero there by
  construction: the dummy has a billion health and is healed every frame,
  VOID refuses it, and there is nothing else on the field because there are
  no waves. The 27 characters they cost took the line to 304px inside a 280px
  box at 320, where it WRAPPED, took the panel 12px taller and landed it on
  the rig -- on the first hit, after `standoff` had already measured.
- **A sweep with a hand-kept list will miss whatever is added after it was
  written.** `regress.mjs`'s menu contrast sweep enumerates its tabs by name
  and `sandbox` was not among them for four builds, under a comment reading
  "a floor that applies to one tab is not a floor". Measured once it was
  added: the room's LAST SESSION labels ran at 7.5px -- the DEBUG panel's
  floor, in a room a player buys for 20,000 energy -- and its headings at
  9.5px. The room's own CSS header had claimed the 11px floor the whole time.
  Note the sweep also needs the room POPULATED: `.sbLast` is hidden with no
  session, so adding the tab alone would have measured three text nodes and
  passed.
- **Two dead fields in `ledger.js` were each costing a window walk.**
  `peak` was written on every `tick` and read by nothing (the rig's peak flag
  is `e.dummyPeak`, a decayed maximum of the STRAIN, and always was), and
  `table()` called `liveBy(BAR_WINDOW)` -- a second walk plus a `Map` -- four
  times a second to fill a `live` column the panel does not draw. The tell for
  both is the same: a field on a returned object with no reader.
- **The menu tab strip is 8 characters while a tab is LOCKED**, measured:
  302px of strip, three tabs, 4px padding a side, 11px at 0.22em = 9.022px a
  character, and the padlock takes 14 of it. The failure mode is not a clip --
  `.menuTab` has no `white-space: nowrap`, so an over-long label wraps and
  makes the whole strip 12px taller, and past 10 characters it steals width
  from its siblings. Nothing flips a property a test can read back. Design to
  the LOCKED width: a 20,000-energy tab is padlocked for most of a run, and
  that is exactly the state its label most needs to read in.
- **The room is the ASSAY, and the ids are still `sandbox`.** It was SANDBOX
  for three builds, THE RANGE for one and TESTBED for twenty-six, and the id
  has never moved through any of it, because a saved run writes bought ids
  into `world.ledger` and renaming this one takes a 20,000-energy node away
  from everyone who has bought it. `regress.mjs` pins the name in all THREE
  places it is written FROM A CONSTANT -- the bar from `RANGE_NAME`, the tab
  from `GROUPS`, the card from the tree -- because those three live in three
  files and each of the three previous renames moved a subset of them. Note
  the name is ALSO typed out by hand in four more user-visible places that
  nothing pins: `menu.js`'s sealed heading, its open heading and its ENTER
  button, and `index.html`'s `aria-label`. A fifth rename has to sweep for the
  string, not just re-run the case. Comments and docs that say
  "the testbed" are history and are left alone; the NAME is one constant.
- **The assay is three rooms and each room is an ERA, not a scale.** Until
  build 262 the bench pinned era 1's scale without touching `world.era`:
  `setZoom(era, sandbox)` took a second argument and both doors carried the
  era across by hand. `setZoom(era)` reads the era and nothing else now, and
  the tabs are era 1 (old field, r 26, Dummy), era 2 (new field, r 40, D2)
  and a padlocked era 3. Neither room has a yard -- the gate is still
  `era === 2 && !sandbox`, because a building nothing comes out of and a wall
  nothing crosses explain rules that do not apply where there are no waves.
  **It is entered on the era you are standing in, by DEFAULT.** Remembering
  the last tab reads as a kindness and is not: a run at era 2 whose last visit
  ended on ERA I came back to era 1's field, silently, in the one room whose
  whole job is measuring. From build 264 the ASSAY tab carries the same
  three-way control and `enterSandbox(era)` takes an argument, so the door can
  NAME a room -- the era you are standing in is what it falls back to, and a
  pick lasts only as long as the sheet is up. From 266 era 2 is shut until the
  NEW FORM is owned (`eraShut`), and from 268 the room's own row is positioned
  and can actually be pressed.
- **Per-era state is a STATE SWAP, not a facade.** `ledger.select(era)`
  snapshots the live counter into `store[era]` and assigns the incoming one
  over itself, because `ledger` is read by name in five files and one missed
  forward would read era 1's number in era 2's room forever. `on` is
  deliberately not per era -- it means "the counter is armed", which is a
  property of being in the room. `soak.select(era)` flushes before swapping
  between three keys, and **era 1 keeps the original `sim7749-soak`**: a new
  key for it would quietly reset the one record in this game that takes
  thirteen hours to fill. `forget()` removes all three.
- **A module cycle is invisible until `bundle.mjs` orders the files.** It
  walks the graph acyclically, so two modules that import each other put one
  ahead of its own dependency in the single-file build -- green suite, clean
  build, different game in the form the phone installs, which is the `export
  let` snapshot all over again. `dummy.js` HANDS the band reading to
  `drawD2(ctx, e, {...})` rather than importing anything back, and a glyph
  both files want (LOCK) lives in the LOWER one.
- **A mark that is only ever ADDED is a mark that can never come off.** Era
  3's padlock could be written into `innerHTML` at build time because that room
  is shut for ever; era 2's room opens MID-RUN on the frame NEW FORM is bought,
  so its lock is always in the markup and shown by a class. `.sbEra:not(.shut)
  .sbEraLock` is three classes against the one on `.sbEraLock` and wins;
  written the other way round -- a `.shut` rule alone -- it loses to the base
  rule and every cell wears a padlock. The case reads the row, buys the node,
  reads it again, and asserts the buttons are the SAME DOM nodes with the mark
  gone.
- **The NEW FORM node's id is `recast`.** There is no `newform` id -- that is
  the name of the `world.newForm` FLAG (`null` / `'armed'` / `'done'`), which
  is a different thing. A probe that pushed `newform` into the ledger had it
  silently dropped by the restore (`BY_ID.get(id)` misses and the `continue`
  skips the `ledger.push` as well), and the state was gone by the time the
  room opened, which reads exactly like the feature being broken. Anything
  that needs NEW FORM owned writes `recast` into the LEDGER -- that is what
  survives the checkpoint-and-resume `enterSandbox` does -- and sets the flag.
- **A case that NAVIGATES has to check that it arrived.** The D2 case's
  `rigOf(era)` called `setBenchEra` and read whatever rig was on the field; a
  refused switch hands back the rig you were already looking at, so once era 2
  was gated it compared era 1's rig with itself and reported a difference of
  exactly 0 -- a case whose whole subject is that the two look nothing alike,
  reporting them identical, and not erroring. It throws on anything but 'ok'
  or 'here' now, and asserts `world.era` actually moved.
- **The ASSAY's rig is r 68, larger than every BASE body, so the room that
  measures damage under-reports anything centred on a surface.** (Only a fully
  grafted BULWARK, at 72, is bigger; the largest base body is the FRACTAL core
  at 64.) AIRBURST at
  58 measured x1.5 to x1.9 in the field and 1140 -> 1170 in the bench, which is
  zero inside the noise: a player buys the node, takes it to the room whose
  whole job is telling them what a source is worth, and the room says nothing
  happened. Anything that must be legible THERE needs a radius past 68 --
  74 clears the rig, the FRACTAL core at 64 and a fully grafted BULWARK at 72.
  Bench a new damage source in the assay as well as on a body, or the number
  the player will actually read is the one nobody measured.
- **A probe that mutates a `SCALED` value must do it AFTER the last resize on
  its path.** `setZoom` rewrites every entry from `BASE`, and `enterSandbox`,
  `setBenchEra`, `setEra` and `restart` all resize -- so a tuning probe that
  set `CFG.hail.burst.r` and then entered the room measured the ORIGINAL value
  for every variant and produced a table of noise that looked like a result.
- **Skipping a bad entry is not the same as removing it.** Build 263 made
  `syncGuns` skip a gun standing on a works lot; the index stayed in
  `world.guns`, which is what the save writes, what `gunCount` returns and what
  unlocks the TURRETS tab -- so a pre-263 run counted two emplacements for ever
  that it could not build and could not sell. A list that is persisted and
  counted has to be PRUNED, and a purchase that can no longer be delivered is a
  refund rather than a quiet deletion.
- **`applyBlast` measures CENTRE TO CENTRE, so a blast smaller than the body it
  went off against cannot touch that body.** A round's burst fires where the
  round STOPPED, which is on the far body's surface, so a blast of radius R
  centred there reaches that body's own centre only if R exceeds its radius.
  AIRBURST shipped at 34 for one afternoon: measured on a pinned BULWARK
  (r 45), four bursts delivered **exactly zero, twice, to the decimal**, while
  the pellets that carried them delivered 118.8. A number that looks
  conservative can be inert. Bodies run to r 72 and the assay's rig is 68, so
  anything meant to hurt what it hits needs a radius past those; anything at
  58 or under is a NEIGHBOUR effect, which is a legitimate design and has to
  be said out loud rather than discovered.
- **`endProjectile` bursts a round on EXPIRY as well as on impact.** Only
  leaving the field is exempt (`impacted` false); `if (p.life <= 0)
  endProjectile(..., true)` is the same door HE goes through. So "make this
  round explosive" also buys a blast at the end of every MISS, at
  `speed * life` out -- and with a fixed `life` every round of a volley does it
  on the SAME FRAME. HAIL's thirty-four were thirty-four rings and sixty-eight
  embers in one tick, gone before they read as anything; the lives are
  jittered 12% so the wall arrives over a tenth of a second.
- **An untagged hit pays AND ACCUMULATES the repeated-shove fade, so a
  multi-projectile ability taxes itself.** `applyDamage` scales impulse by
  `1 / (1 + kicked)` and then adds to `kicked` -- per pellet. HAIL's
  twenty-five landing together meant the second was worth half the first and
  the tenth a tenth of it: **the harder it connected the less each pellet
  pushed**, which is the opposite of what a fan is for. `throwOff` skips the
  fade and lifts the ceiling to `physics.thrownSpeed`, and it is earned by
  CADENCE -- PULSE, PILE, HEAVE and now HAIL, all buttons with clocks on them;
  SLUG at 1.5 rounds a second is still refused it.
  **The control for a throw needs no build without it.** With the exemption a
  body may exceed its OWN un-exempt ceiling (`cruise * maxSpeedFactor`), which
  is arithmetically impossible otherwise -- measured, a LURCHER at 333 u/s
  against a cap of 220. Assert against the witness's own cap, not a number.
- **A recovery assertion that races a variable throw is a flake.** "The body is
  back inside where it started within eight seconds" is a race between a
  recovery walk of about 35 u/s and however far that press happened to throw
  it -- 408 units on one run and 455 on the next, because which pellets land is
  not fixed. Assert the SHAPE: closing on every sample, and most of the ground
  given back. The same disease as the LURCHER window in build 226.
- **A WRAP in a grid row is invisible to a raggedness test.** "ERA III" plus
  its padlock is 82px against a 73px cell at 320, and it wrapped. The cells are
  grid items, so the row stretched ALL THREE to the taller height together: the
  picture is not ragged, no property flips, and a case comparing the three
  heights passes. Proved rather than argued -- run against the pre-fix CSS
  every cell went 32px to 44px, difference zero, green. What works is a
  differential against a CLONE of the longest cell forced to one line (one line
  by construction, so it cannot go vacuous) with the computed `white-space`
  asserted beside it: delete the guard and the twin catches it, override the
  guard with `!important` and only the computed property does. And it has to be
  measured at 320, where the suite does not run.
- **A control that walks home on the first idle frame re-acquires worse than
  one that never walks home.** Build 263 gave an emplacement a rest bearing
  because four of them frozen on dead bodies' bearings is what "crooked" was;
  setting off on the first frame with no target then cost a full slew back
  every time a DRIFT wandered out of reach and back, and the bench measured it
  taking a DRIFT from inside a twenty-second cap to outside it. `CFG.gun.rest`
  is the dwell: longer than any gap a body crossing the reach makes, shorter
  than a wait.
- **A held reach RING belongs to an ability that reaches in a circle, and
  nothing else.** PULSE's `Shock` is honest because PULSE is a circle. The same
  thing on HAIL -- 334 units, which is `speed * life * 0.55` and not
  `speed * life` (that is 608-769) -- claims the 254
  degrees the 106-degree wedge does not reach, INCLUDING THE GROUND BEHIND THE
  TURRET, and rendered it was the loudest thing in the frame by a distance: a
  dashed hoop most of the screen wide over embers a fifth as bright. The reach
  of a directional press is drawn by what crosses it. `regress.mjs` asserts
  ZERO held circles on HAIL, with the reason, because this is the kind of thing
  that reads well in a diff.
- **Overlapping OUTLINES scribble; overlapping GLOWS add.** AIRBURST's pop was
  a 58-unit ring and thirty-four of them go off along one line: rendered, it
  was a lattice of hoops laid over the bodies rather than anything exploding.
  A filled dot at the radius the damage is applied at reads as a string of
  detonations. Anything that fires in NUMBERS has to be drawn as something
  that composites, and the only way to know is to render it and look.
- **A `kind` field that nothing reads is a promise the field is making and the
  code is not keeping.** The six build lots have carried `kind: 'works'` /
  `'gun'` since build 245 and the lot drawing has honoured it the whole time --
  a squat block on the two beside the machine, a barrel on the four ahead --
  while `buildGun` took an index and checked only that a lot existed. Eighteen
  builds of putting an emplacement on a slot drawn as a building. The guard
  belongs in `buildGun` AND in `syncGuns`: the first because `buildGun` is
  reachable from a restore and the debug panel, the second because a save
  written before the guard can legitimately carry a gun on a works lot and
  `syncGuns` is the one place every gun passes through on its way to the
  screen.
- **A fixture that only writes its aim when it has a target never recovers
  one.** Four emplacements each frozen on the bearing of a different body that
  died a minute ago is what "the mini turrets look crooked" was. Anything that
  tracks needs a REST bearing and a way home, slewed at the tracking rate so
  it reads as finished rather than snapped.
- **A price charged in silence reads as free.** An emplacement has cost 2600
  since it existed and the purse was correctly debited; the only time the
  number was ever spoken was in the refusal you got for being too poor to pay
  it, so a player who could afford one was told the price precisely never.
  Reported as "have energy cost to place turret" on a build that already did.
  A cost belongs where the decision is taken -- on the lot, under the thumb --
  and the transaction owes a receipt.
- **The six emplacement upgrades are NOT in the tree**, and that is deliberate:
  their only door is the TURRETS tab, which is locked until a gun is standing,
  and the tree's gates are rungs and parents. They are ordinary nodes in every
  other respect -- `tree.js`'s `DETACHED` builds them with `leaf`, they are in
  `NODE_BY_ID` (which is `[...NODES, ...DETACHED]`, and was `NODES` alone for
  one build, which made all six unbuyable), and `ELSEWHERE` is what stops
  `check-build` calling them content nobody can buy. `priceOf` is ADDITIVE --
  `cost + step * have` -- so a `step` written as a multiplier prices the second
  level at `cost + 1.55`.
- **Anything of OURS that is drawn at era 2 goes through `Game.ours(ctx, fn)`**,
  which clips to below the wall. Mines, effects, rounds, fx -- three scopes in
  `Game.draw`. A new draw routine belongs inside one of them, not beside them;
  the case counts `clip` calls per frame and fails on any other number. Theirs
  (bodies, drops, wreckage, the yard) and the touch aid are deliberately
  outside it.
- **An odd-by-odd grid centred on a point has a cell ON that point.** TESSERA's
  lattice is `cols: 5` by `rows: 3` and was laid centred on the core, so the
  middle berth landed at (0, 0) -- a tile inside the boss, invisible behind a
  core of radius 38, and the first thing any round up the centre line met. It
  looked right for a whole day's work, because a tile drawn under a core reads
  as the core. `CFG.tessera.ahead` pushes the slab down the field instead, and
  the case asserts it off the tiles' own laid positions against the two radii
  rather than off the constant: a berth closer than `coreR + tile.r` is a tile
  inside the boss whatever arithmetic put it there.
- **A test whose setup gives the mechanism no choice cannot see the choice.**
  The first arm for TESSERA's "re-laid nearest the machine first" opened TWO
  lanes and asserted the near one came back -- and `lay.n` is 2, so both did,
  on any ordering whatsoever. It opens the whole slab and runs one pass now, so
  the pass has to CHOOSE and what it chose is the assertion. The same shape as
  the chain-round bench that measured ARC against one body: if the setup makes
  every implementation agree, the case is measuring nothing.
- **A count of the roster is a maintenance trap; assert the SHARE.** The
  stroke-floor sweep pinned `clamped <= 12` of 40 types and failed the moment
  the ninth anomaly took the roster to 43, without one stroke changing. Its own
  neighbour carried a note saying exactly this, about the same field at dpr 1,
  and was fixed only there. Anything keyed on how many things exist rots when
  something is added; the claim in that case's name is "half the roster", so
  the rule is a fraction.
- **A renamed entry in `SCALED` stops being scaled, silently and totally.**
  `yard.lotStep` became `lotSpread` and `SCALED` still named the old path. The
  module-load guard tested `!o` -- the PARENT object -- and `CFG.yard` was
  still there, so it passed: `BASE[path]` is `undefined`, `setPath` writes
  `undefined * scale` (NaN) into a key nothing reads, and a value that had been
  scaled on every resize simply is not any more. The two era-2 lots kept their
  era-1 spread and NO arm in the suite could see it, because every assertion
  about them is a floor the unscaled number still clears. The guard checks the
  LEAF now and requires a number. Same shape as the `export let` snapshot and
  the `[hidden]` trap: a thing set, and silently not applied one layer down.
- **`harmless` is a refusal FIVE paths honour, and one of them was a chooser
  in the wrong clothes.** WIRE's cut, a `Patch`'s bite, LANCE's sweep and
  WARD's arc are damage and still refuse it; the mine TRIGGER was refusing it
  under a comment reading "only things that could corrupt the feed can set a
  mine off", which makes a mine a weapon aimed at a threat. It is ground that
  goes off when something stands on it. Build 275 took `harmless` out of that
  one line, so a DRIFT springs a mine. What it costs was measured BEFORE the
  change: at tier 1, five of six mines have a DRIFT inside their trigger reach
  within a median 6.8s of a 15s life, against a field of ten drifters and no
  hostiles -- so an early mine now mostly pays out in DRIFT, which is worth
  energy, rather than sitting inert. Two of four by tier 8.
- **A mine case needs a control, because a mine ends by itself.** `life` is 15
  and "the mine is gone" is true of a working build and of one where nothing
  changed. The arm is the same mine over the same frames with an empty field,
  still standing.
- **The lot count was written out in four places and the fix is a table.** A
  `length === 6` guard, two loop bounds and a `(i - 1.5)` centring term that
  only made sense for four. `LOTS` in yard.js is the count now. And where two
  survivors STAND is a real decision, not arithmetic: `(i - 0.5) * lotStep` is
  the obvious way to centre two and puts them 96 apart, which is back inside
  the two-guns-up-one-lane fault build 261 widened that row to fix. They keep
  the OUTER pair's column, so every clash bound is one that pair already
  passed.
- **An array indexed by a roster must be SIZED off that roster.**
  `world.apertures` was eight zeroes written out by hand against nine
  anomalies, so AXIOM and TESSERA had no slot. `syncGate` extends the array by
  writing past its end, which works for the whole session -- and `load()`
  bounds its restore loop by `w.apertures.length` on the FRESH world, so the
  way in was silently dropped on the next launch. A hand-written length is the
  same trap as a hand-kept list; `new Array(ANOMALIES.length + 1).fill(0)`.
- **A flag two types share is not an id.** `spawnGroup` branched on
  `type.harmless` to route DRIFT through `spawnDrift` -- and SEED is harmless
  too, while `spawnDrift` opens with `TYPE_BY_ID.drift` and ignores what it was
  reached for. So the debug picker's SEED chip put down five DRIFTs and the
  panel said "+5 SEED", which is the one thing that alert's comment says it
  exists to prevent. Branch on the id when the branch is about one type.
- **A debug panel any player can open owes the destructive buttons a second
  tap.** DEBUG is in SETTINGS ungated, `Game.restart` calls `forgetRun` (which
  removes the save AND the backup behind it) and `debugCodexWipe` clears what
  the device has ever destroyed. Both were one tap in a grid where everything
  else is additive -- the same shape as the NEW RUN button build 227 took off
  the title screen. Arming is enough here; a typed word is for RESET.
- **The era and `world.newForm` are one state and both doors have to move
  both.** `eraHeld` returns the rung-42 ceiling unless the flag is 'done', so a
  debug era step to 2 left the run past the ceiling with the ladder still
  holding it at 42 -- and left at 'done' coming back DOWN, the ceiling build
  272 exists to enforce is off for ever and the NEW FORM banner can never be
  offered again. Up sets 'done'; down sets 'armed'.
- **A boss teardown is `withdrawBoss`, and there are four copies of it.** The
  one for a fight that ends WITHOUT being won already exists; a hand-rolled
  copy drops `bossStageT`/`bossStageWas` -- the patience clock, which is on the
  Game and not on the boss -- so the next boss inherits a clock most of the way
  to withdrawing it.
- **A sweep that enumerates selectors misses the screen added after it.** The
  debug press-everything case walked `#dbgGrid` and `#dbgSpawn`; the BOSS FIGHT
  screen's ten controls, the only path to `debugBoss`, were pressed by nothing.
  Its floors were `>= 20` against a grid of 24, so a third of the panel could
  stop being built and it would stay green -- a floor set well under the truth
  is a floor that cannot see anything.
- **`!world.boss` is not "the boss was beaten", and that hid an unwinnable
  fight for three builds.** A WITHDRAWAL clears it too. `world.reconciled`
  is the only honest test, and measured with it: TESSERA withdrew at 164s with
  its core on FULL, having taken zero damage all fight, and TERMINUS does not
  finish at stock at all. Any probe that asks "did it die" has to ask
  `reconciled.includes(n)`.
- **Structure that REGROWS in front of a core is a tax, not a health bar.**
  The other seven put their health in structure that is on the way to the core,
  so shooting it is progress; TESSERA's slab stands `ahead` of its core and is
  re-laid for ever, so every round spent on it is a round the core never sees.
  Two numbers have to be checked against each other and neither is obvious:
  what the player CUTS a second (76 dps stock, one 300hp tile per 3.9s) against
  what the boss LAYS (two per 5.2s was one per 2.6s). The boss won 1.5 to 1 and
  the corridor could never open. And a cut berth needs a COOLDOWN before it is
  re-laid, or the front of a lane comes back on the next pass -- a corridor you
  cannot stand in is a door.
- **`staged` is the mark for a body that must be SHOT THROUGH rather than shot
  at.** It gates the choosers and never gated projectile collision, which is
  exactly the pair a wall-of-bodies design needs: without it the assist prefers
  the nearer body every time, and TESSERA's core took 189 of 8,218 while its
  tiles took 16,618. Re-assert it every frame from wherever the body's state is
  owned -- `Enemy.update` clears `staged` on the frame a body passes the entry
  line, and structure is laid well below it.
- **An upgrade id in a boss's config is a preference, not a fact.** AXIOM held
  five ability ids of which FOUR are in `LOCKABLE.abilities` and have to be
  bought, so a run that arrived at rung 48 having spent elsewhere lost exactly
  one button to a boss whose whole identity is taking them -- the other four
  clauses held sealed ids, which is holding nothing while looking like it. Pick
  from what the run OWNS and let a clause hold nothing when there is nothing
  left to take; and never put a null in the hold set, which is a hold nothing
  can ever release.
- **`Boss.arriveStep` is what puts structure on the field, so a boss pushes
  only its CORE from the constructor.** It walks `parts()` and pushes anything
  not yet `landed` into `world.enemies`. TESSERA lays its opening slab in the
  constructor and pushed each tile there too, so all fifteen were entered
  TWICE -- drawn twice, updated twice, and DAMAGED twice by every blast, mine
  and PULSE, because those walk the list. A tile re-laid mid-fight was pushed
  once, so half the slab was quietly a different body. Count ENTRIES
  (`enemies.filter((x) => x === e).length`), not bodies: the entry count is
  what the damage paths iterate.
- **`clear` is the door every boss teardown comes through; `hush` is not.**
  `Game.withdrawBoss`, `reset()` and `openAperture`'s teardown all call
  `clear`. AXIOM released `world.abilityHold` in `hush` alone, under a
  docstring saying that was the withdrawal path -- so a patience timeout, a
  restart mid-fight or a second aperture left five ability buttons dead for
  the rest of the run, with the only writer of that Set gone from the field.
  The suite was green because its case drove `boss.hush(w)` by hand: the
  method, not the door. Anything a boss must give back belongs in `clear`.
- **A `shape` with no case in the draw switch is a silent fallback, not an
  error.** `axiom`, `clause`, `lemma`, `tessera` and `tile` all declared one
  and all five fell through to `drawChip` on the field and `drawShard` in the
  glossary -- a TILE, which is laid ground, drawn as an irregular blob, and
  six codex entries sharing one generic icon. `regress.mjs` reads the source
  and requires every declared shape to have a case, AND renders each against
  `drawChip` to catch a case that exists and calls the same generic function.
- **A loop that destructures more fields than its table has is a dead branch,
  not a default.** `buildSystem`'s cell loop read `[label, sub, run, ask]` from
  rows of three, so `ask` was `undefined` for every cell and twenty lines of
  arm-to-confirm behind it could never run -- while the identical twelve lines
  sat live seventy lines below on the wipe cell. Nothing fails on it and
  `bundle.mjs` ships it; the tell is a destructured name with no supplier.
- **A lamp whose only writer is one of its own readers goes stale silently.**
  A debug toggle's `.on` class was written by that cell's handler and by
  nothing else, so a restore, a probe or the suite putting `world.debug.*` back
  left the cell lit for a state that was no longer true. `syncDebugToggles()`
  re-reads each from the flag it is a lamp for -- and the case proves it is an
  instrument by asserting ZERO lit BEFORE the sync, or "2 after" would only be
  showing the cells had followed the flag anyway.
- **A verdict sampled at the end of a window is whatever happened last, not
  what the claim is about.** "A turret that cannot cope is set down BY THE
  GLITCH TIMER" asserted `lastVerdict === 'glitch'` and failed reporting
  "tier 9 -> 1, 8 step-backs, last verdict stall" -- the mechanism working
  eight times over, then the run bottoming out at tier 1 where the fuse stops
  catching it. Assert the verdict that accompanied the EVENT, not the one left
  on the floor afterwards.
- **A readout is only telemetry if the thing behind it can change.** The title
  screen's "NN TRACKED" printed `world.enemies.length` off a real field -- and
  `Game.update` topped that field up to seven drifters while NOTHING removed
  one, so it was seven for as long as the screen was open: measured over forty
  seconds at 60Hz, one distinct value. Noticing in a docstring is not fixing
  it; the comment beside it had already settled for calling the number "honest
  about being a ceiling", which is a sentence the player cannot read under a
  number that looks live. The field turns over now, through `fizzle` -- the
  dissolve `Enemy.destroy` refuses to cash in -- so nothing is banked into
  `world.earned` or counted on a screen where neither would mean anything.
  The same sweep found "SHALLOWS OPEN" beside it: a literal in the markup with
  no writer, in the same live green.
- **A probe that samples on a clock can alias against the thing it watches.**
  The first version of that case sampled every five seconds against a
  4.5-second turnover and reported ONE distinct value on a working build. A
  readout that changes for 0.9s in every 4.5 is invisible to it. Sample every
  frame, and carry a control that is known to move -- forty distinct clock
  readings beside one count is a bug; one of each is a dead probe.
- **A flex row whose children have no `white-space` wraps the TEXT, not the
  row.** `.bootStatus` did that at every phone width -- three line boxes, and
  at 320 the readout hung 32px off the right edge, on the first line of the
  first screen. Nothing could see it: the panel's sweep walks font sizes and
  contrast, and a wrap flips no property and clips nothing a colour test can
  read. `nowrap` on each part plus `flex-wrap` on the row is one clean line
  where there is room and two where there is not. And count rows by each
  child's vertical CENTRE, not its top -- `align-items: center` puts a 6px dot
  at a different top from the text beside it, and counting tops reported three
  rows for a clean two-row band.
- **A contrast sweep that reads the declared colour is blind to `opacity`.**
  `#wipeGo[disabled]` was `opacity: 0.35` over `#8fa9c4`, which composites to
  1.92:1 -- and the sweep recorded the uncomposited 8.08 and passed. Express a
  disabled state as a real colour. (And compute the candidate against the
  ground the sweep actually uses: the first replacement was picked against the
  wrong one and came in at 3.63.)
- **`ANOMALY_ENTRIES` is every id an anomaly puts on the field**, core plus
  structure plus minion, because it is `CODEX` filtered by
  `ANOMALIES.flatMap((a) => a.types)`. The title screen's RECONCILED tile
  counted it, so one destroyed TALLY -- which ORDINAL sheds by the dozen in
  its first stage -- read as an anomaly reconciled. `types[0]` is the core,
  and having the core is having taken it apart.
- **A case that runs downstream of the title screen being dismissed measures
  all-zero boxes.** The suite presses BEGIN in its first two hundred lines and
  `hideBoot` sets `#boot.hidden`; nothing ever put it back. So the layout case
  six thousand lines later read `{0,0,0,0}` for every box and two of its three
  arms could not fail -- `overlap` needed `shown`, `off` filtered on `shown`,
  and `start.b <= vh` was `0 <= 844`. The RESET case found NEW RUN with an
  `offsetParent` filter, and `offsetParent` is null throughout a `display:
  none` subtree, so the one arm about the button being GONE answered 0 whether
  it was there or not. Put the panel up, measure, put it back -- and carry a
  liveness guard, or the case agrees with itself.
- **`maxlength` constrains a thumb and not a script, so a case that assigns
  `.value` can assert a tolerance nobody can reach.** The RESET field was
  capped at 6 against the word DELETE, while the handler documented forgiving
  a leading or trailing space -- which cannot be typed into a field that is
  already full. Type one character at a time with the attribute in force, and
  assert the field has room for what the handler forgives.
- **A contrast sweep that reads the declared colour is blind to `opacity`, and
  the fix belongs in the SWEEP.** Build 281 changed the one control that was
  dimmed that way; 282 made the walk accumulate the opacity chain into the
  foreground's alpha, up the same ancestors the backgrounds already walk --
  because dimming with `opacity` is the cheapest thing in the stylesheet and
  the next one would have been invisible again.
- **An absolute zero can be a claim about the whole suite's leftovers.** "A
  title-screen retirement banks nothing" passed alone and failed in the suite
  at exactly 6, which is `CFG.energy.drift` to the digit; clearing every list
  and switch did not stop it. The honest form is an A/B -- the same window with
  the mechanism on and off -- so whatever else is banking banks the same in
  both, with a vacuity guard that the two windows differ in what they did.
- **A destructive control has to name what it destroys.** RESET SIMULATION said
  "wipe the saved run" and called `forgetPlayer` as well, taking the glossary,
  the taught lines and the ASSAY's thirteen-hour record -- while `showRecord`'s
  docstring said twice that the glossary survives a reset, which stopped being
  true in build 238. The tiles it destroys are two hundred pixels above the
  field where the word is typed.
- **A ratio against a baseline that can reach zero is not a bound.** The
  corruption-feed case measured the glitched frame's near-white against the
  clean frame's, and the clean frame is whatever six hundred cases upstream
  left on the field: over six field states it runs 0% to 0.35%, so the ratio
  runs 1.65x to INFINITY -- an empty field is 0% near-white and any feed at all
  divides by zero. The absolute it replaced was no better, having been set
  BELOW its own baseline (`worst < 2.5` while the clean frame measured 2.95),
  so the case asked the glitched frame to be dimmer than the un-glitched one.
  What holds still is the thing the claim is actually about: the feed's OWN
  contribution, 0.01 to 0.39 points of near-white and 9.5 to 11.1 of mean
  whatever it is drawn over. **Bound the delta, and set the ceiling at a
  multiple of the worst you MEASURED** -- not at the day's value, and not at a
  ratio whose denominator is inherited state.
- **A ratio between two single random draws is a coin toss with extra steps.**
  The DRIFT march case compared one held body's lateral against one hostile's
  at 1.5x and lost about one run in eight to the draw (20 against 13). Sample a
  population on both sides and compare the means; the claim was always about
  the two behaviours, never about two bodies.
- **A currency has ONE formatter and the store has no unit.** `CFG.bytes` is
  base-10 by ruling (1 kB is 1000 B, per SI and per the box a disk comes in),
  `fmtBytes` is the only thing that turns a number into a string, and
  `B/kB/MB/GB` are how a price is AUTHORED -- `MB(20)` stored as `20000000`.
  A unit field on the stored value is a second source of truth that can get out
  of step with the number beside it. And the formatter's WIDEST output is a
  measured constraint, not a taste one: three significant figures tops out at 7
  characters against the raw number's 6, and `Hud.fitBar` is keyed on digit
  COUNTS -- a formatter that could produce nine characters silently re-shapes
  the top of the screen.
- **A threshold compared against a currency literal is a unit-bearing constant,
  and rescaling the currency without it deletes the threshold in silence.**
  Three of them in build 284's byte migration, and each failed in a different
  direction: `bank()` drew its little mote for anything worth `>= 1`, which was
  real work (the smallest bankable amount is `minValue * taxFloor`, three
  tenths of a point) and would have become one BYTE, true of every bank there
  has ever been; `rollBank`'s `from - to > 100000` refuses to animate a drop
  too big to be a purchase, and at a hundred thousand BYTES -- less than the
  cheapest node in the tree -- nothing in the game would ever have rolled
  again; the title screen's resume note printed the purse only at `>= 1`. The
  tell is a bare number on the other side of a comparison from an amount. Grep
  for the comparison, not for the word.
- **`CFG.energy` is not all currency, and four of its seven fields are not.**
  `pulse` is a RADIUS (400), `pull` a SPEED (26), and `tax`/`taxFloor`/`taxCap`
  are MULTIPLIERS; only `perMass`, `minValue` and `drift` are amounts. A
  blanket multiply over that object corrupts four values that are not money,
  two of which are named in `SCALED`. The same trap one level out: a type's
  `drops: 4` is the NUMBER of motes it sheds and `bounty: 3.5` is a multiplier
  on their worth, so neither moves when the currency does.
- **A currency migration belongs at the one door every file comes through.**
  `readSlot` is that door in `save.js` -- the current file and the backup
  behind it both pass through it -- so `toBytes` there migrates a backup
  written from an old file on the read that finds it, and the title screen's
  resume note, which reads that object directly, quotes the same purse the run
  will come back with. In `Game.restore` it would have covered neither. And
  `unit: 'B'` is a MARKER rather than a version bump: `readSlot` refuses a file
  whose `v` it does not know, so bumping VERSION throws away the very runs the
  migration was written to rescue, which is the trap `save.js` has carried a
  comment about since build 180.
- **A `const` arrow cannot be called from inside the `CFG` literal.** `CFG` is
  one object literal four thousand lines long, so a helper declared below it is
  in its temporal dead zone while it is being evaluated -- `cost: kB(500)` five
  hundred lines up throws on the module's first line of work and the game does
  not boot. The authoring helpers live above `CFG`; `CFG.bytes` can stay below,
  because nothing reads it until something is formatted.
- **Rescaling a dead field is work that looks like coverage.** Every anomaly
  config carried a `cost`, ORDINAL's checked against the tree's ANOMALY branch
  -- and build 227 removed that branch, so for fifty-six builds nine numbers
  sat there with no reader while `check-build.mjs` carried a comment promising
  to check them. They were deleted in the byte migration rather than
  multiplied. When a sweep reaches a value nothing reads, the edit is `git rm`,
  not `x1000`.
- **Do not ship a rename and a rescale in the same build.** `world.energy` ->
  `world.bytes` reaches about 250 sites and its failure mode is a silent
  `undefined`; the x1000 is a change of value the suite catches by arithmetic.
  Together, a red case could mean either, and the one useful property of a pure
  rename -- that green means nothing but names moved -- is exactly what mixing
  them destroys.
- **An A/B cancels a RATE, not an EVENT.** Build 282's "a title-screen
  retirement banks nothing" was made an A/B because something six hundred cases
  upstream was banking one drifter's worth; it failed again in 284 at 6,060
  against 0 -- `CFG.energy.drift` once, times the depth dividend, to the digit.
  A single stray death lands in whichever of the two windows catches it and
  cancels in neither. The fix is to state the claim per unit of the thing being
  measured: a retirement does not pay a body's bounty, 757 a body against the
  6,060 a cashed-in one is worth, which is an eight-fold margin and equal
  numbers if the mechanism were broken.
- **A save migration keyed on a marker protects the FORWARD direction only,
  and build 284 cannot be reverted with a plain `git revert`.** A file this
  build writes still satisfies build 283's `readSlot` -- same `v`, same fields,
  and 283 has never heard of `unit` -- so it reads 500,000,000 bytes as
  500,000,000 POINTS and hands the player the whole tree; then its next
  checkpoint writes the file back unmarked at byte magnitude, and coming
  forward multiplies it again. Inherent to migrating without a VERSION bump,
  and the bump is definitely worse (it throws away the very runs the migration
  rescues), so it is written down in `save.js` rather than defended against.
  Reverting past a unit change needs a companion fix in the build being
  reverted TO.
- **A preview of a conversion has to be deleted on the build that performs
  it.** Build 283's widest-figure case wrapped every tree price in `kB()`,
  correctly, because prices were still points and it was showing what they
  WOULD read as. Build 284 made them bytes and the wrapper became a second
  conversion: the ASSAY measured as 20.0 GB, the raw baseline was still
  written out as six characters for a game whose widest figure is nine, and
  **the case went on passing** -- measuring a magnitude the game cannot
  produce, as the guard a later phase's layout claim was meant to rest on. A
  green case against a preview is worse than a red one.
- **A unit change makes every ROUNDING a thousand times finer, and that is a
  balance change wearing a unit change's clothes.** `shed()` rounds a body's
  worth and each mote's share, and in points those landed on 1, 2, 3, 5, 8.
  Under a straight x1000 they land on whole BYTES -- which is not the old
  number scaled, it is the old rounding error REMOVED: measured against an
  exact x1000, HERALD -22%, MITE -27%, PLATE -15%, TOW +12%, LEMMA +17.6%. The
  quantum is written down now (`CFG.energy.minValue`) and rounding to a
  multiple of it reproduces the old payout for all 126 (type, radius) pairs to
  the byte. Anywhere a `Math.round`, a `Math.floor`, a `toFixed` or an integer
  cast sits on a value whose unit is changing, ask what it was quantising to
  and say so explicitly -- and measure the before against the after per type,
  because an aggregate hides a swing that cancels.
- **A count written out by hand instead of asked of the thing that owns it,
  again -- this time in a document.** `docs/bytes.md` put everything buyable at
  174,400 by adding SIX emplacements at `CFG.gun.cost`. There are TWO: `LOTS`
  in `yard.js` has been `works, works, gun, gun` since build 275 and
  `gunLots()` returns 2. The real figure is 164,000. That is the third time
  this exact shape has cost something -- `world.apertures` sized 8 against 9
  anomalies, the lot count written out in four places before 275 made it a
  table -- and the first time it got as far as a commit message. A number in a
  doc that says how many of something there are should be derived, and a claim
  in a commit message is worth the one command it takes to check.
- **The ORDINAL hash's own `mix` is `Math.round(v * 64) | 0`, so any channel
  that passes 33,554,432 aliases mod 2^32.** The byte migration took the purse
  straight past that -- the one channel the "run it on any build that touches
  energy" rule exists for -- and it would have gone on producing a
  deterministic number with a third of its resolution gone. `fight.mjs` mixes
  `w.energy / 1000` now, which is both the unit the recorded history was taken
  in and a magnitude the cast survives. Anything else added to that mix owes
  the same question: can this value exceed 33 million?
- **...and a unit change that is genuinely only a unit change has a signature:
  the hash comes back.** Build 284 moved it to `-1730800834` and the divide put
  it back to `-1765830468` TO THE BIT. Thirty samples over 9,000 frames mix
  every body, the boss's stage, core fraction and position, and the purse --
  so a purse that hashes identically at a thousandth means every payout, toll
  and dividend across a whole fight is exactly one thousandth of what it was.
  Get the salvage quantisation wrong by one byte on one body and the number is
  different. When a change claims to preserve a ratio, find the instrument that
  would notice a single digit and make it agree.
- **A tweened figure has to be formatted in ONE unit for the length of the
  tween.** `rollBank` runs a spend over 260ms, and formatted per frame on its
  own magnitude the prefix flickers across a decade -- 1.05 MB, 1.02 MB, 999
  kB, 1.00 MB, 950 kB -- which reads as the readout being broken rather than as
  money being spent. The unit is picked once from where the roll is GOING, so
  the last frame is exactly `fmtBytes(to)`. Holding it can print four
  significant figures on the way down, which is the cost of not flickering.
  And the case for it needs a control: the same roll formatted the naive way
  must show more than one unit, or the spend chosen never crossed a decade and
  the case is proving nothing.
- **A whole display change can pass a 618-case suite because nothing asserts a
  string.** Build 285 routed every amount in the game through `fmtBytes` and
  was green on its first run with no case reading a single figure. If a panel
  prints a number, either assert it or expect it to rot -- and assert the
  RENDERED BOX for anything that is meant to disappear, never the text or the
  property.
- **The chip's unit belongs in the FIGURE, not in the label slot beside it.**
  That slot already carries the depth dividend, and the
  `@media (max-width: 372px)` rule drops it entirely -- so a unit living there
  is a unit the smallest screens never see. Emptying it is not enough either:
  it is a flex item with a 5px gap in front of it, so it needs `display: none`
  written with the id AND a class, because `#barChips.tighter #energyChip em`
  already sets `display` on the same element.
- **A save file's KEY is a wire format and does not follow the field it came
  from.** `world.energy` became `world.bytes` in build 286 and the file still
  writes `energy`, because `readSlot` refuses a file it cannot read that field
  out of -- so renaming the key throws away every open run for a change that
  moves no value at all. The names inside the program are ours to change; the
  names in the file are not. `CFG.energy` stayed for a different reason worth
  knowing: it is the salvage system rather than the money, `CFG.bytes` is
  already the formatter's table, and two of its leaves are `SCALED` path
  strings where a rename stops the scaling in silence.
- **The ORDINAL hash is the right instrument for a RENAME, and the expected
  result is that it does not move.** Build 286 renamed about 250 sites and the
  hash came back identical -- which is what "nothing but names moved" looks
  like measured instead of asserted. A rename that moves it has done something
  else as well.
- **A rename sweep needs TWO instruments, because half the sites have no words
  in them.** Build 287 took ENERGY out of every player-facing string, and a
  price slot painting `500000` would have passed that sweep untouched -- it
  contains no word to find. The pair is a word sweep over every string table
  plus a FIGURE sweep asserting every rendered amount matches the shapes the
  interface is allowed to paint. And enumerate the tables by SHAPE, not by
  name: `tutorial.js` exports six line tables and there will be a seventh.
- **A teaching line reworded is a NEW line, and that is the intended
  behaviour.** `idOf` hashes the text, so every device that has been told the
  old one is told the new one -- which `tutorial.js` has said beside `idOf`
  since it was written: the reason to change the wording was that the old one
  said something else. Declare it in the notes rather than discovering it.
- **A figure quoted in prose rots, so quote the RATIO.** DRIFT's glossary entry
  said "Worth 10 ENERGY against a MOTE's 4" and both numbers were false --
  `CFG.energy.drift` had been 6 for years, and the MOTE's "4" was its `drops`,
  the NUMBER of motes it sheds rather than what they are worth. Two fresh
  numbers would rot the same way; "worth more than twice a MOTE" is what the
  sentence was always about and it follows the config.
- **A differential across a change needs BOTH builds served in one container,
  and `--url` is what makes that possible.** Phase 5 of the byte migration ran
  `tiers.mjs` against build 283 on :8098 and build 287 on :8099 -- a git
  worktree at the old commit plus a second `http-server` -- because the
  recorded tables in `docs/pacing.md` are from another container and are not
  comparable, the same rule the ORDINAL hash already carries. What it proved is
  the thing the hash cannot see: the hash is one fight at tier 1 with no tree,
  and the ladder's AFFORDABILITY is a different claim. `buys` identical at all
  twenty rungs, and the tier-20 loadout identical to the id, is what "the same
  purchases are still affordable at the same tiers" looks like measured.
- **A column width is a unit-bearing constant too.** `tiers.mjs` padded `spend`
  to 9 characters and `pay` to 6, both sized for point-magnitude figures, so at
  byte magnitudes the band ran into the spend and the pay into the pay/s --
  while the probe went on exiting 0 with a table nobody could parse. Anything
  that pads or truncates a figure owes the same question a threshold does: what
  is the widest value this can now hold? The fix is to format rather than to
  widen, so the bench prints what the game prints.
- **A THROW in the draw path reads as a freeze, and nothing in this suite could
  see one.** `Axiom.draw` passed `this.t` where `Boss.drawHole(ctx, C, T,
  arriving)` wants the TYPE, so `rgba(undefined, ...)` threw on `.slice` every
  frame of the arrival; a throw inside the rAF loop kills the loop, the last
  painted frame stays on the glass, and the report is "boss screen freezes".
  TESSERA had the identical line. Both shipped in builds 273-274 and the two
  fights were unreachable for fourteen builds, because **no boss case in the
  suite ever called `g.draw()`** -- six hundred cases drive `g.update` and none
  of them paints, so a fault living entirely in a draw path is invisible to all
  of them. Two further doors were open on the same bug: both boss sweeps were
  bounded `n <= 7`, written when there were seven, and every boss case sets
  `b.arriving = 0`, which is the one window `drawHole` runs in. When a report
  says "freezes", look for a throw before looking for a loop.
- **Taking a system out of play is shutting its DOORS, not deleting it, and
  the doors are never all in one file.** The emplacement line had five --
  `yard.js` lays the ground, `game.js` presses it and steps and draws the
  guns, `menu.js` carries the tab and its switch, `tree.js` places the six
  upgrades, `turrets.js` takes the money -- and shutting four of them leaves a
  system that is still reachable by the fifth. `CFG.gun.inPlay` is the one
  flag; the case that walks every door is what makes it one flag rather than
  five hopes. Write that case to hold in BOTH directions and prove it by
  running the suite with the flag set each way (633 green on, 623 off), or
  turning the thing back on is an edit to the guards as well as to the code.
- **A case about a switched-off system sleeps behind the same flag; it is not
  deleted and it is not left passing for free.** `if (GUN_LINE) { ... }` round
  the block, and no consolation `check(..., true, ...)` in the else -- a green
  arm that asserts nothing is worse than a missing one, because it is counted.
  What holds while they sleep is the door case, which is a different claim.
- **A press that explains a system the game no longer has is worse than a
  press that does nothing.** `pressLot` returns before `refuseLot` and before
  `ON_WORKS`, which names emplacements in as many words. The lot is scenery
  now, and the half of the old case that still matters -- the press still aims
  and still fires -- is the half that was always the point.
- **When a whole branch leaves the tree, DERIVE the list that excuses it.**
  `coverage()` fails the build for an id that is authored and in no branch, and
  `ELSEWHERE` is the escape hatch -- but a hand-written list of the mine line's
  twenty-one ids is wrong the first time a mine upgrade is added. The MINES
  root is BUILT and thrown away, and its own ids are the list. Same shape as
  the boss sweeps asking `ANOMALIES.length`: ask the structure, never restate
  it.
- **Taking a system out of play breaks every hand-kept list that named it, and
  they CRASH rather than fail.** Build 290 found five in one pass -- the shop
  floor walked eight tab names (`createTreeWalker(null)` throws), the
  arm-heading case listed three branches, the panel case six tabs, the tab
  walk was a literal, and the strip's contrast sweep had a vacuity floor of
  `seen >= 20` that started reporting the strip as missing once four cells
  went. Every one of them should have asked the DOM or the config. A removal
  is the cheapest way to find out which of your lists were really assumptions.
- **A panel with no tab is not a shut door, it is a door frame.** Build 289
  took TURRETS out of `GROUPS` and left `buildGuns()` running, so the panel sat
  in the DOM reachable by nothing -- found only because a case reads the sheet's
  tabs off its panels. Whatever builds the content has to be gated with
  whatever offers it.
- **`#quickBar` is `space-between`, so an emptied band is not the same as a
  removed one.** The mine stack's two bands are still created and simply not
  filled: dropping them lets the middle group -- AIM and FIRE, the cells placed
  where the thumb rests -- walk to the left edge. Assert it as geometry, not as
  a class.
- **A wave ENDS on its own bodies; whether the next one may START is a
  question about the FIELD.** `standing()` counts the wave that ran, which is
  right -- a wave is judged on what it did rather than on the mess it
  inherited -- but until build 291 nothing counted the mess. Each wave was
  allowed to leave a quarter of itself (`thinAt`) or to time out at `patience`
  leaving whatever it liked, and the next arrived on top, so leftovers
  compounded with no bound: measured, ten to twenty-nine hostiles standing
  permanently on a run that had climbed past its gun. The release waits for
  the field to be as thin as the last wave was required to leave it. Keep the
  two questions apart or the old bug -- a wave flattered by a messy field --
  comes back.
- **AUTOMATION THAT BREAKS CONTACT STARVES ANYTHING THAT MEASURES CONTACT.**
  The glitch fuse read unbroken grip, and FLINCH and DEADBOLT exist to break
  grip. Measured either side of those two upgrades, same tier and gun over
  seven minutes: without them the mount was gripped 22.3% of the time, the
  fuse blew SIX times and the ladder walked 20 down to 14; with them, 10.2%,
  ONE discharge, and the run pinned at 20 with the field permanently full. The
  safety net was being held just out of reach by the player's own defences.
  Anything that rescues a losing position has to read a signal the game's own
  mitigation does not suppress.
- **A case for a rescue mechanism has to be set up in the state that needs
  it.** The first version of the release-gate case turned the turret off -- and
  with nothing shooting, contact fills the fuse every fourteen seconds and each
  discharge disarms the gate before it engages. The field peaked at 21 with the
  gate on and 21 with it off: a clean pass for a mechanism that had not run.
  Reproduce the REPORT, not a simpler thing near it.
- **A RESERVATION and the thing it reserves for are two numbers, and only one
  of them tends to get measured.** `--rail-h` is what `--under-rail` is derived
  from, so everything below the rail starts at `--rail-t + --rail-h` whatever
  the rail actually measures -- and it reserved 52 over a band of 44 for as
  long as the rail has existed. That is where the slack was; the ROW was not,
  and taking it to 38 to save four more pixels broke a 44px tap target the
  suite has asserted since the rail went in. Measure the band before shaving
  the control.
- **`#quickBar` is `space-between`, so the middle band is centred only when the
  bands on each side of it weigh the same.** They never did: measured at
  320x568 the centre of AIM and FIRE was **49px left** of the strip's, and 22
  after the ammunition was split across the two edge bands, because the mine
  line's config band is empty and the ammunition's was 44 wide. Emptying that
  one too -- the AMMO door moved to the foot of the near column -- makes the
  strip `[column, 0, AIM/FIRE, 0, column]` and the offset 0. Nothing flips a
  property for a test to read; assert the offset from the strip's own centre.
- **A CONTROL in a stack costs a whole ROW, and which side carries it is the
  measurement.** The chevron on the same side as the larger half of the slots
  made the split 121 against 59, which is most of what splitting the stack was
  worth. Counted in rows, and by height rather than by count -- a door is 38
  tall against a slot's 28 -- the chevron goes on the far column and the door
  on the near one with the SMALLER half: 121 against 100. It is the taller
  column that decides where the field ends.
- **`.qGroup.folded > .qc:not(.fold)` folds every cell that is not the
  chevron**, so a door that moves into a stack becomes a tab reachable only by
  unfolding first. The selector spares `.cfg` from build 292: the fold hides
  slots, not doors. And a case that counts `.qc` flat then reads the door as a
  slot that will not fold -- count slots and controls apart.
- **A LAYOUT change can move a BALANCE measurement, and the ORDINAL hash will
  not see it.** `world.floorY` is derived from the same three numbers as the
  strip's bottom, so build 292's `--bar-h` 74 -> 64 lengthened the field by
  sixteen world units and every body now takes longer to arrive. Build 291's
  release-gate case failed at tier 20 on a build that changed no gameplay
  number at all: the fuse peaked at **0.87 of 1** and never blew, where before
  it did. Anything that moves the floor line owes the wave cases a re-run.
- **A discharge count cannot report a near miss.** 0.87 of a fuse and 0.2 of a
  fuse are both "0 blows", so the case that failed above could not say whether
  the mechanism was broken or the scenario had gone soft. Record the PEAK of
  anything that fills, beside the count of times it filled.
- **`Hud.pillCap()` is a measurement of what the screen happens to be showing**,
  so a case that reads it inherits six hundred cases' worth of leftovers: it
  read 0 in the suite and 2 on a page of its own, because `#abilityHint` was
  still up with a long caption in it and the cap is the gap ABOVE that band.
  Pin the band, the boss caption and the alerts column, or the number is about
  the suite rather than about the layout.
- **A signal with TWO causes needs a field saying which**, or the one sentence
  that explains it names whichever cause was there first. The glitch ring got
  its second cause in build 291 (a held release) and `ON_GLITCH` went on saying
  "clear the turret" for both, so a run drowning with a CLEAR MOUNT was told to
  clear the mount and the discharge posted THE FEED GAVE OUT either way.
  `Director.burnFrom` is the cause, taken off the same comparison that already
  picks the rate, and it is null while the fuse drains so a caption keyed on it
  speaks only while something is happening. Adding a channel to a mechanism is
  half the change; the other half is every readout that described the old one.
- **A teaching line is held to its PARTNER's width, and the band already
  wraps.** `#abilityHint` is `pre-line` in a 300px band at 320, so every line
  in it wraps there and always has -- the thing to match is the line box COUNT
  of the line it pairs with. Build 293's first draft was five characters over
  and took a fourth box at 390 where its pair takes three. Measure a one-line
  twin of the longest half against the band's own width.
- **`burn()` refuses a teach wave on its first line, and `restart()` puts the
  run back on the opening -- which IS one.** So any case that wants the fuse to
  fill has to stop the director reaching `begin()`, or the fuse reads 0 through
  a window that looks otherwise perfect. Build 293's crowd arm only worked
  because its own gate was holding `begin()` off; the contact arm, which
  switches that gate off deliberately, loaded the opening and measured nothing.
  Pinning `timer` is enough -- `burn` runs above the timer branch in `update`.
- **A body pinned against the turret does not survive being healed once a
  frame.** The pair solver bills `impactDamage` every frame on top of whatever
  is shooting it, so a mount held for thirty seconds is empty by the end.
  Top the mount UP to the count you want rather than healing what is on it --
  and sample the window rather than its last frame, or the reading is "the
  turret won", which is the end-of-window trap again.
- **A boundary arm set one frame short of the boundary can only fail in one
  direction.** Build 293's discharge test set `glitch = 0.999` and stepped one
  frame: that is 0.00119 of the fuse from contact and 0.000595 from crowd, so
  it blew for one cause and returned null for the other, and the null read as
  the feature being broken. Sit ON the boundary (`glitch = 1`) when the arm is
  about what happens after it, not about reaching it.
- **`world.floorY` does not include `#quickBar`, so every pixel of that band
  sits on playable ground.** `floorY = (sh - (safeBottom + barH + 22)) / z`
  reads `--bar-h`, which is the ABILITY bar; the strip above it is pure
  overlay. Measured at 320x568 the floor line is y 482 and the strip spanned
  361..482 -- 121px of buttons over field, to display a choice made about once
  a wave. Shrinking the strip does not move the arena, it UNCOVERS it, and
  that is the metric to quote: 242px of visible field to 325.
- **A permanent column showing a set-once choice is the thing to look for
  first.** Nine rounds, one loaded, eight read past. It is one cell naming the
  loaded round now, with the slots in a spanning row it opens -- `#aimModes`'
  pattern, which this bar has used for the assist since build 185. Reach for
  the interaction the interface already has before inventing a second one for
  the same gesture.
- **A READOUT does not belong in `this.strip`.** That list is things which can
  be ON, diffed per frame against world state; the round cell is a statement
  of which of them is. Nothing else was going to keep it honest, which is why
  it shipped blank for one frame and stale for another: `syncRound` ran only
  from `syncLoadout`. It is filled at the end of `buildStrip` AND written from
  `toggleRound`, on the same pass as the `setToggle` loop that gives the cells
  beside it their immediate feedback. A readout written only by the frame loop
  is a readout that is wrong on the frame that matters.
- **Equal edge bands beat a measured centring.** `#quickBar` is
  `space-between`, so the middle band is centred only while the bands either
  side weigh the same. Build 292 achieved that by emptying a 44px band to
  match an empty one -- arithmetic any later edit breaks by putting something
  in a band. 294's two edges are both `.qc.wide`, so the widths are equal BY
  CONSTRUCTION and the case asserts the offset is 0 rather than under a
  tolerance.
- **A band count written out is the hand-kept-list trap in three characters.**
  `r.bands === 5` failed the moment the strip went to three bands with no
  geometry changing. Ask the config (`MINE_LINE ? 5 : 3`), the same way the
  boss sweeps ask `ANOMALIES.length`.
- **A vacuity denominator has to count what was MEASURED, not what was
  found.** The strip's contrast sweep has now been broken twice in five
  builds: `seen >= 20` was sized for a strip with the mine stack on it (290
  took four cells and it reported the strip as missing), and its replacement
  counted every cell the QUERY returned -- so when 294 moved nine slots into a
  row that is `display: none` while shut, eleven words over seventeen cells
  failed a guard wanting fifteen, with the loop having skipped six on purpose.
  Count the cells the loop did not `continue` past. And where the hidden thing
  is a real control, OPEN it and sweep it: the slots are nine labels read over
  a boss sky while choosing.
- **A case about a mechanism whose subject has gone sleeps behind the flag.**
  The fold is a STACK mechanism and from 294 the ammunition has no stack, so
  the fold case is `if (MINE_LINE) { ... }` with nothing in the else -- the
  same rule the gun line's cases already follow. What holds in its place is
  the round-cell case, which is a different claim.
- **THE TOP IS ONE BAR from build 295, and the numbers are why.** At 320 there
  are 304 points: MENU 46, the purse 44 rising to 79 at the widest figure
  `fmtBytes` can make, OBJECTS 103, and the rail 300 on its own. All of it is
  528 against 304, so a merge is not a layout question, it is a question of
  what leaves. What left is the rail's CONTROL SURFACE -- the two arrows, the
  skip and the AUTO switch, into `#waveSheet` beside RECALL and OVERCLOCK --
  plus the OBJECTS counter, which AUDIT already prints. The rail's own
  docstring had said which half to move since it was written: "the nodes are a
  readout and not a control... the three buttons are the control surface and
  they are sized for the hand." What is left is 169 for five nodes, 30.6px
  each against 33.3. `--rail-h` is 0 and `--rail-t` is the bar's own bottom;
  both names are kept because `--under-rail` is derived from them and five
  things read it.
  Field across the four builds, 320x568: 167px (29.4%) at 291, 242 at 292,
  325 at 294, **372 (65.5%)** at 295. `pillCap()` 1 -> 3.
- **The bar's GROWING element must not be the flexible one.** `#barChips` was
  `flex: 1 1 auto` when it was the only readout; with the rail sharing the row
  that would let a climbing purse squeeze the nodes. The rail takes the slack
  (`1 1 auto`) and the purse sizes to content (`0 1 auto`) -- it can still
  shrink from the inside, which is what `tight`/`tighter` do, but it cannot
  claim room the ladder needs.
- **A control moved into a sheet is measured WITH THE SHEET OPEN.**
  `getBoundingClientRect()` on a `display: none` subtree is all zeros, so the
  rail's four seats read `0px hit=false` the moment they moved -- the same trap
  the ASSAY door paid for in build 240, on a different element. And a
  containment claim replaces a separation one: "sits clear of the bar above it"
  became "rides IN the bar", with the overflow measured against the PURSE's own
  left edge rather than a constant, because the purse is the thing that grows.
- **A geometry case that compares two elements breaks silently when they become
  the same element.** "A fight takes the slot back" asserted the boss bar's top
  equals the rail's top; once the rail was the bar those are 28 and 76. Assert
  against the derived LINE (`--under-rail`, read off a probe element) that the
  thing is actually positioned from, not against a sibling that happens to
  share it.
- **A rule whose selector stops matching reads as a rule that holds.**
  `body.sheetOpen #waveRail button { pointer-events: none }` was correct while
  the arrows sat in a band outside the sheet, and after 295 it matches nothing
  -- while its case asserted `none` and would have gone on asserting it. Worse,
  the behaviour it described is now backwards: the arrows ARE the sheet's
  controls and must stay live. Delete the rule and restate the claim; a dead
  selector does not announce itself.
- **`fitBar`'s signature owes every term a chip in the box.** It was keyed on
  the purse string, the buys and the KILL COUNT -- and 295 moved the OBJECTS
  chip out of `#barChips`, so that term forces a re-measure for a number no
  longer in the group. Build 222 hit the same fault from the other side: three
  terms, no caller for the kill count, re-run by accident through a sibling
  that had been deleted. Check the terms against the box whenever a chip moves.
- **`g.update(1/60)` DOES NOT ADVANCE CSS ANIMATION TIME.** The browser's
  animation clock is wall time and the game's is a synthetic `dt`, so a probe
  that steps ninety frames and samples computed styles reads ONE state on a
  working build. Build 296's first measurement did exactly that. It is the
  build-211 screenshot trap from the other side: there real time aged a canvas
  effect the probe meant to freeze, here frozen time hid a CSS animation the
  probe meant to watch. For a DOM animation the instruments are
  `getAnimations()` and `anim.currentTime = t` -- SEEK it and read the computed
  style at each point, which is deterministic and needs no clock at all.
- **...and asserting the animation NAME is build 210's spy test again.** A
  name check proves a class was added, not that anything is drawn differently
  -- the ring case counted arcs and passed against four wrong implementations.
  Find the animation by name, then seek it and assert the RENDERED style moves
  between points and lands where the design says. Build 296 asserts the lost
  rung ends `border-style: dashed` on the ahead-outline and the band's
  translateX returns to identity, both read off `getComputedStyle`.
- **A class cleared on a TIMER is still on the DOM when the next arm runs.**
  Build 296's floor control armed a rung-1 discharge straight after the real
  step's seeks and counted THREE marks -- the rung-9 classes, which
  `markStep` clears at 700ms and which `syncRail` does not touch. It was
  reading the leftovers and calling them the floor's. Wait the timer out
  first; that wait is both the "nothing sticks" assertion and the clean slate
  the control needs, so the order is free.
- **THE GLITCH DISCHARGE IS THE ONE INVOLUNTARY WAY DOWN, and until build 296
  the ladder said nothing about it.** Shake, red flash, `audio.glitchOn()`, a
  narrator line, a 5s alert and a 0.9s field dissolve -- and the rail went from
  one state to the next between two frames, measured at one distinct state over
  ninety frames. `onTier` even had the rung it came from and discarded it
  (`void from;`); `syncRail` has already repainted by the time the glitch
  branch runs, so the old rung cannot be read back off the DOM and has to come
  from the payload. `Hud.markStep(from, to)` marks the rung lost, the rung
  landed and the band, in three channels rather than three shades of one.
  Only on `moved < 0`: at rung 1 the wave resets and there is no rung to hand
  back, so marking one would be the readout claiming something that did not
  happen.
- **A `transform` is the only safe way to move something that shares a flex
  row.** The rail's knock is `translateX`, because from build 295 it sits in
  the top bar beside the purse and the door and anything that reflowed the row
  would shove both. And the distance is MEASURED: the nodes are `1fr` of what
  the purse leaves, so one node is about 30px at 320 and 43 at 414 -- a
  constant would be right on one phone.
- **A MAX over one run against a MAX over one run is a coin toss, even when
  the probe already holds the whole population.** Build 291's release-gate case
  reduced 240 one-a-second samples of the standing field to `Math.max` and
  failed on build 296 -- whose only change was a CSS animation -- reporting the
  GATED field peaking at 51 against the loose run's 36. Measured three runs
  each: max is gated [47, 24, 46] against loose [44, 40, 55] and overlaps,
  while the MEAN is gated [13.3, 11.2, 15.6] against loose [23.3, 21.4, 22.4]
  and does not. The claim was always that the gate keeps the field THINNER,
  never that it lowers its worst second. Ceiling set at 0.85 against a measured
  worst separation of 0.73, which still fails at the 1.0 equal means would
  give. When a case reduces a sample to one number, ask whether the claim is
  about that number.
- **The entry line is the PORTAL'S RIM from build 297, and it is derived.**
  `entryLine(world, ENTRY_Y)` in portal.js is the one reader: the rim is
  `max(ENTRY_Y + entryDepth, chrome + pad + 2 ry)`, so it is the old 260/400
  wherever the whole ellipse fits under the top bar (the suite's viewports)
  and lower by the notch where it does not. Anything that used to add
  `ENTRY_Y + CFG.entryDepth` goes through it -- the staged march, the frame
  `staged` clears on, the debug picker's floor, the yard's mouth. The chrome's
  end comes off `#safeProbe`'s `margin-top` (`--under-rail` resolved), because
  `#topbar`'s box is all zeros while the title screen is up, which is when
  the constructor first resizes. A layout change at the top of the screen can
  now move a balance quantity, the way `--bar-h` already could at the bottom.
- **A staged body is the portal's to draw, and `Game.draw` paints it once.**
  `drawPortal` takes the throat's bodies and paints each in three clipped
  passes -- nowhere above the centre line, ghosted inside the ellipse, whole
  below it once its leading edge is past the rim -- and the plain loop skips
  that set. A new draw of a body belongs in `Enemy.draw`, which both paths
  call; a second loop over `world.enemies` in `Game.draw` paints the throat
  twice. And the ghost pass is the first thing in the game to draw a body at
  less than full alpha, which is how two `ctx.globalAlpha = ...` assignments
  in the body helpers were found: multiply in, always.
- **The ORDINAL hash moved on 297 and was expected to:** 1849733424 to
  1299530142 in this container. `throughMouth` is no longer the identity at
  era 1 and drift is staged through the portal, so every spawn x lands
  somewhere else; the `Math.random` call order is untouched. Both numbers
  were taken in one session, per the differential rule above.
- **The headless rAF loop free-runs at about three times wall time, so a
  live screenshot of a sub-second effect is a screenshot of its tail.**
  Build 298's birth mark lasts 0.6 s; an 80 ms wait after the birth was a
  quarter second of game and every frame captured showed it nearly faded.
  Hold `world.timeScale = 0`, call `g.draw()`, then shoot. And a mark can be
  THERE and invisible: read off the live buffer the first version's stroke
  was (147, 208, 224) at the corner -- a half-covered CSS pixel -- while a
  bright-pixel threshold of 600 reported zero. Measure the pixel, then ask
  whether an eye would.
- **A speed ramp on the steering TARGET is not a speed ramp on the body.**
  `drive` blends velocity toward `dx * cruise` at `k = accel / 100`, a time
  constant near two seconds for a LURCHER, so easing the target from 2.6x
  to 1x across the portal's 116 units changed nothing measurable: 88 u/s at
  the rim before and after. Inside the surface the brake is a wall (the
  velocity is scaled down to the ramp's cruise), and the case asserts the
  crossing speed against the body's own cruise with a no-portal control that
  still reads the fast one.
- **A new field on `Enemy` has to be grepped against the BOSS modules
  first.** They write their own fields onto the bodies they make, and
  `Enemy.update` runs on those bodies too. Build 298's seconds-since-birth
  counter was named `loose` for one suite run; GNOMON keeps `p.loose` on its
  arc pieces (null, then an object), `null < 10` is true, `null + dt` is a
  number, and the boss threw on `p.loose.a` -- the suite died at the first
  GNOMON case with no case output at all. `grep -n "\.NAME\b" src/*.js`
  before declaring; the field is `bornFor` now.
- **The stage ceiling is for what is LOOSE; a formation queued through the
  mouth is a stack and it can be tall.** `mouthSlots` builds rows upward
  from the mouth, and eight BULWARKs two abreast reach 445 above the field
  (900 at era 1's one-wide mouth) against `STAGE_HEIGHT` 320 -- so the
  arena clamp snapped the top row 200 units onto the row below and the pair
  solver shoved the pair sideways, out of the mouth. Shipped in 297 and hidden
  by the row jitter until one run of 298's suite. A staged body skips the
  ceiling now. And a case for a stack that "fits" has to read the SNAP --
  units down in two frames -- not only the shove it may or may not cause.
- **The portal's surface is one-way, and `born` is the key.** `portalBirth`
  is the one writer of `born` and `bornFor`; `edgeEase` pushes a born body
  back out of the rim it came through, and nothing else is refused -- a
  boss's minion, a debug placement and a field spawn never came through.
  DRIFT lives in a band across the middle of the field from 298
  (`CFG.drift.band`/`bandHalf`), which reverses build 78's ruling against a
  band by request; the hash moved (1299530142 to 1831189433) for the drift's walk
  and the surface brake, both expected.
- **The ladder is a SPACING and a DEPTH from build 299, and the gate table is
  derived from them.** `CFG.waves.tier.bossEvery` (7) and `ceiling` (49) are
  authored; `gates` is `rungsEvery(bossEvery, ceiling)` = 7, 14, 21, 28, 35,
  42, 49. Written out it was a hand-kept list, which is the shape that has
  already cost this repo `world.apertures` sized 8 against 9 anomalies, the
  emplacement lot count restated in four places, and a case pinning
  `gates.length === 9` that failed the moment the table was truncated without
  one rung moving. `check-build.mjs` asserts the derivation, that no gate
  names an anomaly that does not exist, and that the last gate IS the ceiling.
- **SEVEN gates against NINE anomalies is how AXIOM and TESSERA are deferred,
  and the deferral is the table alone.** Nothing declares a rung on itself, so
  an anomaly with no entry has no door: `gateAt` returns 0 on every rung, no
  banner ever lights, and `load()` bounds its aperture restore by the roster
  rather than by the table, so an aperture stored by an older file is inert.
  `regress.mjs` stands on every rung from 1 to the ceiling and asserts neither
  lights. Putting them back is a deeper `ceiling` and nothing else.
  **`anomalyEra` had to learn about it**: `undefined > eraGate` is false, so an
  ungated anomaly answered ERA 1 -- and `debugBoss` is the only way to reach
  either and SETS the era off that answer, which would have put an era-2 fight
  on an era-1 field with the first machine standing in it, the exact thing that
  function's docstring says nothing else enforces. A fight nothing can climb to
  is past a ceiling that is itself past `eraGate`.
- **A CEILING NEEDS ALL THREE DOORS, not the two build 272 found.** `climbTo`
  refuses, `setTier` clamps -- and `Director.restore` writes `tier` and `peak`
  by hand and goes through neither, so a file written by a build with a deeper
  ladder puts a run above a rung that does not exist and nothing brings it back
  down. A stored TRIAL above the ceiling is refused rather than clamped:
  clamping leaves `probe.to` and `tier` disagreeing about the question and
  `settle` then answers the wrong one. The fourth path is `endBoss`, which
  steps past the gate it has just answered with `setTier` -- and the last gate
  IS the ceiling, so that is the one place in ordinary play where the two rules
  meet. Driven through `openBoss`/`endBoss` in the case, because the step is
  not a control.
- **`recast` was one ruling with two writers, and the derived table turned that
  into a deadlock.** `CFG.ordinal.recast` was the REMAINDER price and
  `upgrades.js` held a separate literal `7` for the reconciled count. Seven
  slots to a ceiling of 49 puts only SIX gates under `eraGate` 42, so the run
  is held at 42 having answered six and the way through the hold needed the
  seventh -- which stands at 49, on the far side of the hold. Both halves read
  the constant now and it is 4; `check-build.mjs` fails the build if it ever
  exceeds the number of gates at or below `eraGate`, which is the arithmetic
  nobody does by hand.
- **`sayOnce` DROPS what it cannot say, so a case about a line has to free the
  BAND and not just the record.** `forgetLines()` un-marks the OPENING too, and
  the opening then owns the band: measured, thirty seconds of game time and the
  script had said six lines about the grip and not finished. Mark every line
  said EXCEPT the one under test -- walking `tutorial.js` by SHAPE (a string
  `id` beside a string `text`), never by name, because that file exports
  several tables and there will be another.
- **A teaching line is held to LINE BOXES, not characters, and the band is
  300px at 320 where the suite does not run.** Counted off
  `Range.getClientRects()` on the real element with its width forced to 300,
  with the partner's own count as the vacuity guard -- two lines both
  measuring 1 box means the element was not laid out at all.
- **The rail's window is clamped at BOTH ends.** Unclamped at rung 49 it is
  47..51 and two of those rungs do not exist, drawn `locked` -- which is the
  mark for "never reached" and reads as somewhere the run may yet go. The
  ceiling cell wears `end`: a trebled solid right edge, structure rather than a
  shade so it survives a player who receives no hue, asserted off
  `getComputedStyle(...).borderRightWidth` because a class going on is not a
  picture changing.
- **What a hold SAYS is as much of it as what it refuses, and the three holds
  say different things.** An aperture is answered by fighting, the era by
  becoming, and the floor by nothing -- so the floor's line is not an
  instruction, it is the run being told this is an end and not a fault. The
  load-bearing half is the second one: the field holds, the feed keeps paying,
  the tree can still be finished. The pill carries the rung READ OUT OF THE
  CONFIG and the band carries no figure at all, because a number quoted in
  prose rots. Fired on ARRIVAL and not on the verdict that would have climbed:
  `railUp` goes dead the instant the run stands on the ceiling, so a message
  waiting for the next wave leaves a dead control unexplained for the whole of
  it -- which is the complaint `syncEraCap` was written to answer.
- **A once-per-arrival pill has to be counted at the CALL, not on the screen.**
  `Hud.alert` refreshes an identical line instead of appending one, so a
  second, third and twentieth call are all invisible to anything reading the
  column. The case spies `hud.alert`, scores twenty further waves, and asserts
  the count is still one.
- **QUANTITY CARRIES THE CLIMB FROM BUILD 300, AND FOUR SLOPES MOVED AS ONE.**
  `hpStep` 1.085 -> 1.028 (x50.2 at rung 49 -> x3.83), `bountyStep` 1.075 ->
  1.045, `pop` replaced by `popStep` 1.0655 (x21.0) and `flow`, a table of
  releases-a-second read by `Director.flowAt` (x5.56). Health is now the
  GENTLEST of the three that climb, which is the whole of the phase stated as
  a comparison -- and the case asserts that comparison rather than the three
  constants, because a case pinning 3.83/21.0/8.27 goes red the first time any
  of them is tuned while still saying nothing about the shape. A half-applied
  version of it is a game nobody should measure: health alone is a late game
  that collapses, population alone is a wave twenty-one times as long at one
  tempo, rate alone is the same wave over in a fifth of the time.
- **`pop` now compounds off rung 1 like the other three, and that is a fix as
  well as a rescale.** It was `1 + pop * tier`, so tier 1 was itself 1.1x the
  authored table -- a slope that starts by moving the thing it is measured
  against, in the one place (`hpStep`'s own docstring) the repo promises "tier
  1 is the table exactly as authored". All four are `x^(n-1)` now and the case
  asserts all four are EXACTLY 1 at rung 1, not within a tolerance.
- **`popCap` is GONE rather than raised.** It capped population at x3, reached
  at rung 20, so the last thirty rungs were pure health. With `popStep` at
  1.0655 and the ladder's `ceiling` at 49 the curve tops out at x21.0 by
  construction, so any cap at or above that is a bound nothing can reach --
  the `world.endless` shape build 186 spent a pass removing. What bounds the
  FIELD is not a cap on the ask: `emit` refuses to release while
  `hostileCount >= maxEnemies` and HOLDS the job rather than dropping it, so
  the wave lengthens and the screen does not fill.
- **...so `check-build`'s field guard had to be turned round.** It refused a
  wave whose ask exceeded `maxEnemies`, under a comment reading "the field cap
  must never be the thing doing the balancing" -- and the field cap IS what
  holds the crowd down now, with an ask of 231 against a field of 57 as the
  design. What replaced it is the pair of claims that can still go wrong: the
  two slopes move together (bodies over arrivals-a-second is the wave's LENGTH
  IN SECONDS, x3.8 and bounded at x8), and a release can never land inside two
  frames (the tightest, with OVERCLOCK armed at the ceiling, is 46ms).
- **A slope table is AUTHORED when every smooth fit misses its own anchors.**
  `flow` is seven numbers, one per boss band at that band's middle rung, and
  `Director.flowAt` interpolates. A geometric ramp with the same endpoints
  sags 21% under the middle anchors and a straight line overshoots them by
  13% -- a fit that misses by a fifth is a different game wearing the plan's
  numbers. Interpolated rather than stepped because a cliff in the arrival
  rate lands on a band edge, which is exactly where a boss already stands, and
  the case asserts the worst one-rung step against the mean.
- **An ORDERING is a proxy, and a proxy says the wrong thing the moment the
  thing it stood for stops being true.** `bounty < hp` held from build 202
  under a comment about a rung staying "harder than the one below it"; salvage
  is FASTER than health from 300, because a rung is harder for sending x21 the
  bodies rather than tougher ones. What build 202 actually cared about --
  energy per point of damage must not FALL as you climb -- is asserted
  directly now and rises x2.2 by rung 49. The companion arm comparing against
  the retired LINEAR bounty was deleted rather than retuned: with health
  nearly flat the linear scheme would also rise (x2.03), so the arm reported
  compounding as slightly worse than the thing it replaced. A comparison
  against a scheme nobody runs is worth keeping only while it separates them.
- **`Director.wave` IS A GETTER off `order[at]`, so `d.wave = WAVES[i]` is a
  silent no-op.** The assignment takes, the read-back disagrees, nothing
  throws. Build 300's teach-exemption arm did exactly that and measured the
  AMBIENT wave: 0.14s against the 3.4s it was asking about, which looks
  exactly like a missing exemption on a build that has one. Select a wave the
  way every other case does -- `d.order = [i]; d.at = 0;` -- and carry an arm
  asserting the two waves really are a teach and a non-teach, or the case is
  comparing one wave with itself. Same family as the `[hidden]` trap and the
  `export let` snapshot.
- **`load`'s `asked` includes SWARM, which is a TRAIT and not a slope.** It
  doubles the body count and traits are seeded from `traitFrom` 10 up, so a
  rung-49 against rung-1 ratio read x39.8 where the swell is x19.9 -- exactly
  twice, half of it a rule the rung happened to roll. Divide it out and say
  so. Worth recording on its own: a SWARM wave at the ceiling queues 438
  bodies against a field of 57.
- **A WAVE'S COUNTS ARE A BUDGET FROM BUILD 301, AND THE AUTHORED NUMBERS ARE
  PROPORTIONS.** `load` scales a wave until its total threat meets
  `Director.budgetAt(tier, band)` = the band's own mean threat x
  `popStep^(tier-1)` x `population` x a walk across the band. So a wave of
  three BULWARKs and one of twelve MOTEs weigh the same at the same rung and
  length follows strength by construction. Two exemptions, each otherwise a
  divide by zero or a tutorial that speeds up: a TEACH wave is scaled by
  nothing, and a wave with no HOSTILES weighs zero (the bonus wave is 22
  drifters and `of: []`).
- **`threatOf` is DERIVED from health and nothing else**, `hp / threatPerHp`,
  because a per-mechanism term is 43 hand-authored numbers -- the shape that
  has already cost this repo `world.apertures` sized 8 against 9 anomalies and
  a lot count restated in four places. Measured against the plan's anchors it
  is close (MOTE 1.03 against 1, BLOOM 8.2 against 7, SCION 13.0 against 12,
  BULWARK 22.5 against 20); LURCHER derives 6.2 against a rough 4 and is left
  diverging. Two rules make it honest: `harmless` weighs ZERO, which is what
  lets the drift mortar thicken a field without spending a budget, and a body
  that TOWS counts what it drags, because `release` makes the pair.
- **A BAND'S BUDGET IS DERIVED FROM ITS OWN ROSTER**, the mean threat of its
  authored waves, so adding a wave re-prices that band by existing. The MEAN
  and not the max, because the walk averages exactly 1 -- the band's middle
  rung is the band as authored and the ends are spread either side of it.
  `check-build.mjs` fails the build if the walk's mean is not 1, because a
  walk that averages anything else is a global nerf or buff wearing a
  distribution's clothes.
- **`perBand` 2 -> 7, and the authored table stops running out at rung 9.**
  The five bands now cover rungs 1-35 against 1-10, and rungs 36-49 still draw
  band 4-5 because bands 6-7 want the twenty objects of phase 6. It also gives
  `budget.open`/`close` six rungs to walk across: a ramp over two rungs is a
  step.
- **`admit()`'s starvation branch was reachable, and `begin()`'s call order is
  why.** `begin` runs `admit` BEFORE the spent check, so on the very frame the
  order runs out with every in-band wave already in it, the fallback spliced
  the out-of-band ones in and the reshuffle never happened -- exactly the fault
  build 199 fixed, arriving again through a different door, under a comment
  reading "this should be unreachable". Latent at `perBand: 2` (a sixteen-wave
  window at rung 20); at `perBand: 7` the window is ten and the case measured
  37 of 82 waves still to play out of band. Deleted rather than guarded,
  because `shuffle` already carries that fallback properly: two fallbacks for
  one rule is how they disagree. The out-of-band list it collected went with
  it -- written and never read is how `mineScale` survived two builds.
- **THE SEAM IS CLOSED (`rest` 2.6-4.2 -> 0.4-1.1, `restCap` 2.6 -> 1.4), and
  a case was resting on the old length.** The fizzle case pins
  `director.timer = 1e9` in its setup and `glitchOut` RE-ARMS that timer from
  `CFG.waves.rest` -- harmless while the seam was longer than the case's own
  1.3s observation window, and not once it was shorter: the next wave began
  inside the window and the arm counted four bodies that had just arrived as
  four that had failed to dissolve. **Anything that closes a gap owes every
  case whose window is shorter than the old gap a re-read**, and the fix is to
  assert the quiet rather than assume it (`world.released` did not move).
- **A speed sampled on the frame a state CLEARS is sampled one frame past the
  thing being measured.** `drive`'s portal brake is inside `if (this.staged)`
  and `Enemy.update` clears `staged` on the frame the body passes the entry
  line, so the crossing-speed arm read whichever order the two ran in: 2.25x
  the body's own cruise on one suite run and under 1.2x on the next, with
  nothing about the portal changed. Sample the LAST frame the state held, not
  the first frame after it.
- **The release-gate scenario has now been re-sited on three consecutive
  builds, and its two claims want different rungs.** The FIELD arm needs a
  rung where the gate thins the field and the FUSE arm one where the fuse
  fills; build 301's engine pushed 28 into saturation for the first, where both
  arms sit near `maxEnemies` and the CAP does the gate's work. Measured with
  the fuse pinned, 150s: separations of 0.87/0.883/0.874/0.871 at rungs
  14/18/21/24 -- four draws inside a 1.4% band -- against 0.626 at 28, which
  then read 1.01 in the suite. Field arm at 24 (three full runs: 0.779, 0.759,
  0.434, worst separation 0.861, ceiling 0.93), fuse arm at 28. **Two claims in
  one scenario is one scenario too few.**
- **`tiers.mjs` grew THE STREAM table, and the first version measured the field
  cap.** With the gun cold the field fills to `maxEnemies` in seconds,
  `emit`'s gate refuses every release, and the arrival rate collapses to
  `maxEnemies / window` -- 0.12 to 0.76 a second against an authored 0.9 to
  5.0, with ONE wave started in 120s at six of seven rungs. That is a
  measurement of a constant. A fully bought turret is what makes the field
  turn over, and it is the honest FLOOR on the standing column.
- **...and the finding it produced is that the authored flow is not delivered
  past about rung 18.** Measured, fully bought, 120s a rung: arrivals 1.04 /
  2.55 / 2.42 / 1.98 / 2.37 / 2.74 / 0.82 a second at rungs 4/11/18/25/32/39
  /46, against an authored 0.9 / 1.4 / 2.0 / 2.7 / 3.4 / 4.2 / 5.0. Rung 4
  tracks; from 25 the stream is throttled by the field cap and the release
  gate because the best turret the tree can buy cannot clear 30-58 bodies fast
  enough. The standing field still climbs 2.7 -> 34 (x11.3) and the wave
  lengthens x12, so the DESIGN reads through -- but `CFG.maxEnemies` at 57 is
  a target from rung 25 on and not the guard the plan calls it. The answer is
  the turret, which is phase 4's re-priced tree, not a bigger cap.
- **The ORDINAL hash is STRUCTURALLY BLIND to the wave engine, and that is now
  twice.** It did not move for build 300's four slopes (all `x^(n-1)`, so all
  1 at rung 1) and did not move for 301's budget, seam, band width or mortar
  either -- `fight.mjs` is one fight at rung 1 opened from `openBoss`, and
  `Game.update` is `if (w.boss) {...} else { director.update() }`, so the
  director never releases and none of the engine runs. The plan predicted "the
  hash will move, and by a lot" for phase 3; it cannot. Run it anyway -- an
  unchanged hash is the proof that a wave-engine change did not reach the
  physics -- but the instrument for these phases is `tiers.mjs` across rungs.
- **THE DAMAGE LINE IS DEEPER FROM BUILD 302, AND THE PER-LEVEL STEP IS
  SMALLER.** HOLLOWPOINT 5 levels at 1.32 (x4.00) -> 8 at 1.26 (x6.353), and
  a new CORE, 4 levels at 1.35, dormant behind `needs: (g) =>
  g.owned('recast') > 0` -- so the whole product is x21.101, x23.42 with the
  cadence and x30.45 with `era2Power`. The shape is the one build 229 already
  reached for and stopped short of: the same ladder arriving further up, so a
  rung above the old plateau still has something to buy. It is the direct
  answer to build 301's measurement that the authored flow is not delivered
  past about rung 18 because the best turret the tree sold could not clear
  30-58 bodies.
- **A HAND-WRITTEN PASS COUNT IS THE HAND-KEPT-LIST TRAP WEARING A LOOP'S
  CLOTHES.** Three cases bought the tree with `for (let p = 0; p < 4; p++)`,
  which is enough passes for a five-level node and not for an eight-level one:
  the dummy-band case measured x2.52 on build 302 against x3.04 on 301, so
  **deepening the damage line made a fully-bought turret read WEAKER**, and
  the failure named a band rather than a ladder. Loop until a pass buys
  nothing (`let any = false; ... if (!any) break;`), the same way the boss
  sweeps ask `ANOMALIES.length` instead of counting to seven. And a dormant
  node moves the BUILT readout, so the two pinned counts (142/107 nodes,
  116/59 and 92/46 levels) are what catch a node arriving without its gate.
- **A RESCUE MECHANISM'S CASE CANNOT BE SITED BY RUNG, BECAUSE THE THING IT
  RESCUES FROM IS THE GUN.** The release-gate case has now failed on four
  consecutive builds and the rung was never the parameter: 302's stronger line
  means the old scenario simply does not drown any more (measured, the mount
  gripped 0.1-16s of 100 where it used to be held continuously). What holds
  across a tree change is a build that deliberately OWNS none of the damage
  line -- `['rate', 'open_ward', 'flinch', 'deadbolt']` -- at a rung where the
  run is genuinely behind, and TWO channels, because `emit`'s `maxEnemies`
  gate truncates the mean: the standing field's mean and the SHARE of samples
  pinned at 90% of the cap. Measured at rung 20 the mean read 1.164/0.792
  /0.726 and the pinned share 2.16/1.394/0.43 -- neither separated; at rung 32
  mean 0.741/0.742/0.888 and pinned 0.685/0.328/0.634, both separated on every
  run. **A case whose scenario is re-sited every build is a case measuring the
  wrong quantity**, and the quantity here is how far behind the gun is, not
  which rung the run stands on.
- **PRICE IS A BAND FROM BUILD 303, AND THE FLAT PRICE WAS MEASURED RATHER
  THAN ARGUED TO BE THE FAULT.** `BAND_PRICE` is 9 kB at band 1 rising to
  4 MB at band 7 and each level after the first costs 60% of the band price
  MORE than the last, so `priceOf` is untouched -- it already computes
  `cost + step * have`. The evidence for the change: `tiers.mjs` on build 302
  bought the WHOLE tree by rung 17 of 49, with `buys` pinned at 109, spend
  capped at 119 MB and dps flat at 741 from rung 17 to 20. A flat price
  (`500 kB + 350 kB` a leaf, whatever it did and whenever it was meant to be
  bought, under a comment saying pacing "is not what this is for yet") cannot
  say "this is an early thing", so nothing in the tree was late. The spread is
  now 444x and band 7 alone carries 56% of the tree.
- **The curve is ADDITIVE and the plan's own table says so in a digit.** Its
  level-3 column is 2.2x and not 2.56x, and its spend formula is
  `price * (1 + (k % per) * 0.6)`. "Each level costs 60% more than the last"
  reads as compounding and is not: 1.6^7 is 27 band-prices for an 8-level node
  against the additive 24.8. Reading it the other way would have wanted a new
  function as well as a different game -- and the tell was one cell of the
  plan's own arithmetic, not its prose.
- **`bandOf` THROWS and there is no default, which is build 224's rule applied
  to a second mandatory field.** `levels` was `u.levels ?? 3` for forty-six
  builds and eight nodes shipped sold three times because a node relying on the
  default and a node deliberately capped at three were the same text. A band
  has the same failure mode and a worse blast radius: an omitted band reads as
  band 1, and band 1 is 9 kB against band 7's 4 MB, so the node is handed over
  rather than sold. `bands()` checks the table in BOTH directions -- a node
  with no band, and a band left behind for an id the tree does not offer, which
  reads as coverage and is not -- plus the one ordering rule, that a leaf may
  not be priced for an earlier band than the arm it hangs off.
- **A system out of play still needs its prices.** The mine line's twenty-one
  ids are banded although `CFG.mines.inPlay` is false, for two reasons:
  `rootNode('mines')` is still BUILT and thrown away to derive `ELSEWHERE`, so
  `leaf()` runs for all of them and `bandOf` would throw at module load; and
  build 289's lesson is that turning a system back on should be a config flip
  rather than an edit to the guards. They are unmeasured and say so.
- **Three angles, and the aggregation is the finding.** The table was made
  three times independently -- the plan's named roster read as law, each node's
  mechanism read off its own `line`, and the affordability arithmetic worked
  forwards from the prices -- and the shipped table is their majority: 31 of 66
  unanimous, 31 by two of three, 4 the median where all three differed. **No
  parent violation had to be repaired**, which is the part worth trusting:
  three angles that never spoke to each other never once priced a leaf for an
  earlier band than its arm. Whole tree 137.6 MB against the plan's 116 MB;
  the gap is the plan modelling 107 levels where the real tree has 112, and
  five extra levels in the dear bands cost about 20 MB.
- **The plan's band table is not all of the plan.** CORE's band is named in
  PROSE only -- "the four levels of CORE are priced for band 5 and affordable
  inside it" -- as are RECALL's and OVERCLOCK's ("under the new curve they are
  band-2 nodes"), and none of the three appears in the `BANDS` array every
  other assignment was read off. A document that draws its own arithmetic still
  keeps decisions in its sentences; grep the prose as well as the table.
- **HOLLOWPOINT's band is the largest single entry in the table** -- eight
  levels, so it moves 223 kB to 2.03 MB -- and it is band 3. Measured against
  the plan's own income model: band 1 finishes the whole x6.35 damage spine by
  rung 4 to 10, which is build 177's plateau rebuilt; band 2 by rungs 9 to 16;
  band 3 at 15 to 23, which leaves CORE's x3.32 to land at 28 to 35. Two spaced
  steps across forty-nine rungs rather than one early one. Band 2 was the
  instinct and two of the three angles said 3.
- **`tiers.mjs`'s asserted earned curve CANNOT SEE this phase, and the
  arithmetic says by how much.** Bands 1-3 together cost 1-2% of what that
  curve says the run holds by the rung they end on, and the curve reaches the
  whole tree at rung 17 of 49 -- so past 17 it measures a fully bought turret
  whatever the prices are. Its own docstring already calls the targets "about
  four times too rich"; against the plan's income model (441 kB banked by rung
  7, 200 MB over a whole run) it is nearer twenty-five times at rung 7. What it
  can still show is the loadout over rungs 1-16. Re-anchoring that curve is its
  own piece of work and would move every row of the historical table.
- **THE RELEASE-GATE CASE WAS COMPARING RUNGS, NOT THE GATE, AND THAT IS WHY
  IT HAD BEEN RE-SITED ON FIVE CONSECUTIVE BUILDS.** The gate changes how many
  waves are SCORED -- measured, 5 against 19 over the same 240 seconds -- and a
  scored wave is what walks the ladder, so the two arms ended up at different
  rungs while the rung is what sets the field's SIZE. On one run the loose arm
  spent its window at a mean tier of 34.3 against the gated arm's 32.1, a
  harder rung with a thicker field, which flatters the gate; on a run that tips
  the other way it INVERTS, which is what build 303's suite caught at 1.06 on a
  build whose only change was a price table -- and the case's own scenario buys
  four fixed ids from a 500 MB purse, so it cannot depend on a price at all.
  With the rung pinned through `setTier` the same two channels read mean 0.542
  and 0.329 against 0.841 and 0.786 unpinned, and the pinned share 0.01 and
  0.079 against 0.634 and 0.68. **The margins were tight because a confound was
  eating the signal**, and five builds of re-siting were five builds of tuning
  a number instead of finding it. The ceilings are deliberately NOT tightened
  onto the new figures -- headroom is worth more than sensitivity on a case
  with this history -- and the rung is asserted, so the arms can never silently
  compare rungs again.
- **A case that passes alone and fails in the suite is not always inherited
  state.** That is the reading CLAUDE.md already records and it was the wrong
  one here: the gate case separated cleanly three times out of three in
  isolation (0.714, 0.766, 0.719) and read 1.06 in the suite, which is the
  classic signature -- and the cause was a confound present in BOTH, bistable
  either way, that the suite's timing happened to tip. Before clearing state,
  check whether the two arms of an A/B are still measuring the same thing.
- **The differential, same asserted curve, rungs 1 to 20:** `buys` goes 1 to 7
  at rung 1, 3 to 25 at rung 3, 5 to 38 at rung 5 and 12 to 39 at rung 7, and
  dps at rung 5 goes 251 to 796. At rung 1 a player buys `hollowpointx3 rate
  slewx2 aimrange` where a flat tree bought one level of one node. Past rung 17
  nothing moves -- 109 buys either way, one rung later -- which is the curve and
  not the prices. **The magnitude of the early figures is the curve's too**: at
  rung 1 the probe hands over 500 kB where the plan's income model says a run
  has banked about 63 kB, so "7 buys" is the direction measured honestly and
  the number inflated by the same factor. What wants watching is that the early
  rungs did get materially stronger, because what was one 500 kB node is now a
  dozen at 9 to 23 kB.
- **A PREREQUISITE THAT IS NOT A TREE EDGE IS A PREREQUISITE NO STRUCTURAL
  GUARD CAN SEE, and build 303 shipped one with a green suite.** `rigDone()`
  requires every LEVEL of every node under the `turret` root; `recast` (NEW
  FORM) gates on `rigDone()`; `core` gates on owning `recast`. So the whole
  machine is a transitive prerequisite of the damage line's second half -- and
  303 priced `insulation` at band 7 (19.20 MB) and `pile` at band 6 (7.68 MB),
  putting the branch at **27.88 MB against the 15.20 MB a run has banked by
  rung 28** on the plan's own income model, 218% with CORE counted. NEW FORM
  and CORE were both behind a price the run could not meet at the rung the plan
  offers them at. `bands()`'s parent rule passed **66 of 66**, because the
  turret nodes hang off a root with no band and the chain runs through two
  `needs` predicates rather than through `children`. Both are band 4 now, the
  branch is 3.40 MB, and `bands().gateBad` holds the rule -- derived from
  `UNDER.turret` and CORE's own band rather than written out, so a ninth turret
  socket is covered by existing. **Fixing it also fixed the overshoot**: the
  tree is 113.1 MB against the plan's 116, where 303 was 137.6.
- **Anything gated on a PREDICATE rather than on a parent owes the price table
  the same question.** There is exactly one such chain in the game today and it
  cost a build to find. The tell is a `needs` that calls a function which
  iterates `NODES` -- `rigDone()` is the only one -- and the rule it implies is
  that everything the function counts must be priced no later than the thing
  the gate opens. Grep `needs:` for a call rather than a field before pricing
  anything.
- **A fan-out converging on a finding is not the same as the fan-out having
  measured it.** All five review lenses named `pile` at band 6 and FOUR OF FIVE
  missed that `insulation` at band 7 was the larger half of the identical fault
  -- 19.20 MB against 7.68. The convergence was right and the arithmetic
  incomplete, and the full extent came from computing the branch cost here
  rather than reading it off the findings. Treat a unanimous verdict as a
  pointer to the right file, not as the measurement.
- **...and they were reviewing a table that never shipped.** The lenses were
  handed the workflow's adjudicated merge (99.7 MB, band 7 at 6 nodes/8 levels
  against the plan's 9/13) while what shipped was the three-way MAJORITY
  (137.6 MB, and by one lens's own reckoning a level-count deviation of 7
  against the adjudicated table's 21). So their band-7-is-empty and
  tree-is-too-cheap findings were about the wrong artefact, and only the
  `rigDone()` one carried over -- more severely, because they had costed
  `insulation` at the band their own adjudication had already moved it to.
  **If a review is run against a candidate, say which candidate shipped.**
- **The additive curve spreads ONE node across bands, which is the answer to
  "one price cannot hold a three-band spread".** HOLLOWPOINT at band 3 is
  82 kB at level 1 -- affordable inside band 1 -- and 492 kB at level 8, which
  is a band-5 purchase. That is the mechanism the plan means when it says a
  flat price cannot express when a thing is for, and it is why a node whose
  levels the plan names in two different bands can still take one band: the
  ladder does the rest. The corroborating figure is the plan's own sizing note,
  that ORDINAL at rung 7 is met "against a turret that has bought perhaps nine
  levels" -- which an 8-level band-1 HOLLOWPOINT (223 kB of band 1's 441 kB
  income) breaks outright by handing the whole x6.35 line over before the first
  boss.
- Two pacing findings recorded and deliberately NOT acted on, because a
  judgement does not belong in a bug fix: `compound` is the dearest node in the
  tree at 19.2 MB for a three-level dial on TITHE, and TITHE's subtree is about
  31 MB -- a third of the tree -- behind one optional arm.
- **THE CHANGE IS THE MIDDLE OF THE GAME FROM BUILD 305, NOT ITS LAST ACT.**
  `eraGate` 42 -> 28. It was 42 from build 272, which is six of the seven
  gates and five sixths of the ladder spent as the first machine; the run
  becomes something else at 28 now, having answered four anomalies, and meets
  three on the far side. One constant, and `anomalyEra` derives the rest.
- **THE ANOMALY STANDING ON THE HOLD RUNG IS STILL FIGHTABLE, and that is the
  whole reason this is not a deadlock.** AMPLITUDE's gate IS 28 and NEW FORM
  asks for four reconciled, so if the hold refused that rung's aperture as
  well as the climb there would be no way through -- build 299's `recast: 7`
  deadlock arriving through a different door. It does not, because the two are
  different questions asked by different functions: `syncGate` lights off
  `heldBy`, which reads the ANOMALY gate alone, while `eraHeld` refuses only
  the CLIMB. **I read `eraHeld` first and concluded the opposite**, wrote an
  arithmetic probe on that assumption, and it "confirmed" a deadlock that does
  not exist -- a probe built on the wrong reader agrees with itself. Reading
  `heldBy` is what settled it. `check-build.mjs` counts gates at or BELOW the
  hold on exactly that basis and its `<=` is correct; `regress.mjs` asserts
  the pair now, with the anomaly answered as the control, because the existing
  era-hold case arms with EVERY anomaly reconciled and therefore could not see
  it.
- **DYNAMO and PARITY are era-2 fights now, and both got SHORTER.** Measured
  either side in one container, assists only: DYNAMO 275.8s -> 252.1s and
  PARITY 242.1s -> 237.9s, stage shapes unchanged to a couple of points, both
  still reconciled. The cause is `era2Power` 1.3 on the gun against two bosses
  whose health was authored for era 1 -- so the era move is a 2-9% discount on
  the two fights it relocates, which is phase 7's business (boss health
  authored per slot) and not a fault. Worth knowing that a real run meets them
  with a BOUGHT tree as well as the 1.3, so the discount in play is larger
  than the probe's.
- **A literal pinning a derived string has now been red three times and never
  once because the thing it describes was wrong.** The debug panel's era
  string was `'111111122'` until build 299 truncated the gate table,
  `'111111222'` until 305 moved the hold, and it sat one line below an arm
  already asserting that every entry is DERIVED from the gates. The rule that
  holds for any hold rung: exactly the anomalies gated at or below it are the
  first form's, so the COUNT matches `gates.filter(r => r <= eraGate).length`
  and the string is `/^1*2*$/` -- a 1 above a 2 would be a fight the first
  form can reach past the rung its ladder ends on. Assert the relation; the
  string was never the claim.
- **A SATURATED reading cannot carry an absolute floor, and that is what made
  the fuse arm flake.** It failed 305 at 0.31 against a floor of 0.5, and the
  hold had just moved to 28 -- which is that arm's own rung, so it read as
  causal. It is not: measured two runs each at rungs 24/28/32 the gated peak
  is 1.0, 1.0, 1.0, 0.46, 1.0, 1.0 -- bimodal at EVERY rung -- and the one low
  run held the release 23.8s against 38.6 to 48.5. The fuse is CENSORED at 1,
  so a run that holds 40 seconds hits the ceiling and one that holds 24 cannot,
  and `held` is the noisy half by this case's own note (9.3s to 120.3s across
  nine runs). The uncensored quantity is the RATE: fuse risen per second of
  hold reads 0.019 to 0.034 over the same six runs, a 1.8x band where the peak
  is a coin toss. **When a reading has a ceiling, divide by the thing that
  drives it before setting a floor** -- and check the neighbouring rungs before
  believing a failure that lands on the rung you just changed.
- **Four docstrings named rung 42 or 48 and three were ALREADY stale.** Build
  299 deferred AXIOM and TESSERA by truncating the gate table, so they have no
  gate at all -- but `axiom.js`, `config.js`'s axiom block and `anomaly.js` all
  still said "its gate is rung 48, above the era ceiling at 42", and
  `config.js`'s own `eraGate` docstring called 42 "TERMINUS's own gate" when
  TERMINUS stands at 49 and PARITY at 42. A constant that moves is the moment
  to grep for its old value in PROSE as well as in code: the numbers were
  wrong for six builds and nothing could fail for it.
- **`tiers.mjs` NEVER SET THE ERA, and build 305 turned that from almost-right
  into wrong for every row past rung 28.** The probe called `g.restart()` and
  measured on whatever field that left -- era 1, always. While `eraGate` was 42
  that was nineteen of its twenty rows correct by accident; 305 moved the hold
  to 28, and since `perBand` is 7 the whole of band 5 (rungs 29-35) became
  era-2 territory. So the one instrument pointed at the ordinary field was
  measuring band 5 on a field the game no longer sends it to. It derives the
  era from `eraGate` now and PRINTS it as a column, because a table that does
  not say which field a row was measured on cannot be read six builds later.
- **The switch has to be FORCED, and the reason is the flag and not the
  geometry.** `setEra` refuses a switch to the era it is already in and
  `reset()` writes `w.era = 1`, so after an era-2 row the next `restart()`
  leaves the flag at 1 and `setEra(1)` is a no-op that runs neither
  `takeField` nor the sky. Writing the opposite era first makes it real. **The
  first version of that note claimed a resize bug that is not there** --
  `reset()` re-derives the geometry by comparing `CFG.zoom` against
  `CFG.ZOOMS[era]` and resizing if they disagree (game.js, inside `reset`).
  Checked rather than asserted, and the note corrected before it shipped: an
  inaccurate comment is the thing this repo keeps paying for.
- **BAND 5 IS 2-3x LONGER TO CLEAR ON THE ERA-2 FIELD, AND THE GUN IS NOT THE
  REASON.** Measured either side in one container, same rungs, same asserted
  spend, `eraGate` temporarily at 49 for the era-1 half. Clear times 23 -> 52,
  20 -> 63, 45 -> 59, 34 -> >120, 34 -> 73, 42 -> >120, >120 -> >120 at rungs
  29 to 35: cap failures go from ONE of seven to THREE of seven. And the gun
  got BETTER over the same rows -- dps 741-796 to 968-1039 on `era2Power`, and
  the worst body in the band falls 2.5-3.8s to 1.9-2.4s -- so the extra time
  is not spent killing anything. Income per second follows the clock down to
  **0.27 to 0.77 of era 1** (median about 0.48): the same `pay` spread over two
  to three times the seconds.
- **...and depth alone does not account for it, which is worth saying rather
  than rounding off.** A loose crossing is 1481 world units at era 2 against
  962 at era 1, a factor of 1.54, while the clears moved 1.31x, 2.15x, 2.26x,
  3.15x and twice past the cap. The reading -- inference beyond the
  measurement, and labelled as such -- is that travel and the release gate
  compound: `emit` refuses to release while the field is at `maxEnemies`, and
  bodies that are in transit for half again as long keep it there for half
  again as long, so the wave stretches by more than the ground does. Build
  301's finding was the same mechanism seen from the other end.
- **This is phase 6 and 7's input, and it is deliberately NOT tuned here.**
  Nothing about band 5's authored waves changed in 305 or 306; what changed is
  the field they are played on, and the answer the plan already has for it is
  the twenty objects (phase 6) and boss health per slot (phase 7). Inventing a
  balance fix in a build whose whole content is an instrument correction is the
  mistake build 304 deliberately did not make. What IS recorded is the number
  the next phase has to beat: three of band 5's seven rungs do not clear their
  heaviest authored wave inside 120 seconds, and the run's income halves
  exactly where the tree's dearest bands begin.
- **THE FIRST TWO OF THE TWENTY ARE IN FROM BUILD 307, AND BOTH OF THEM
  LEAVE.** Phase 6a: EMBER (band 1, `rise`) and HUSK (band 2, `tumble`), the
  two objects `docs/objects.html` says need no new rule. Every body in this
  game until now either reached the machine or was destroyed; these two have a
  way off the field of their own, through `fizzle` + `dissolved` -- the
  dissolve `Enemy.destroy` refuses to cash in -- so leaving pays nothing and
  counts nothing, which is what "gone with whatever it was carrying" has to
  mean. Eighteen of the twenty are NOT in: the object guide's own phases 1-4
  (a full `GAITS` table with march as one row of it, and the eleven
  re-gaitings) are not shipped either, and that guide's subtitle still reads
  "not scheduled".
- **A `gait` is the TYPE's, a `route` is the BODY's, and that distinction is
  the whole of why the field reads as one crowd.** `this.route =
  opts.route || weightedPick(ROUTES)` is in the constructor, so a 45-unit
  BULWARK and a 10-unit NEEDLE draw from the same six routes with the same
  weights. `GAITS` in config.js is the vocabulary a type declares from instead, and
  `check-build.mjs` holds it in BOTH directions: a type naming a gait nothing
  implements gets the march it was trying not to take (the `shape`-with-no-
  case fault verbatim, which shipped five times over fourteen builds), and an
  entry in the table with no reader is a promise the table is making and the
  code is not keeping (`kind: 'works'`, eighteen builds). The second half is a
  source read for the quoted id, which is why `hover` is written out as the
  default arm of the dispatch rather than left implied.
- **MORTAR is exempt from three bounds at once, so it needs one of its own.**
  A harmless entry in a wave's `of` weighs nothing (`threatOf`), is skipped by
  `standing`, refused by `tagBody`, and invisible to `hostileCount` -- which
  is what `maxEnemies` gates the release on. So it cannot take the budget's
  MULTIPLIER either: four EMBERs authored in a band-1 wave would be forty at a
  deep rung, scenery scaled by a difficulty it does not pay into. Nor does it
  count toward `asked`, which is the verdict's denominator and the guard that
  keeps the drift-only bonus wave from being scored, nor toward `cleared()`'s
  queued total, where it would have put bodies in the denominator that can
  never come out of it. Drift was already outside all of this by living in
  `wave.drift` rather than in `of` at all; `CFG.waves.mortarCap` is the bound
  for everything else, and `check-build.mjs` also had to learn that the
  two-or-three rule and the eleven-body ceiling are about HOSTILE types -- the
  first is about the problem being a combination and the second about that
  combination not becoming a crowd.
- **Adding a harmless body to an EXISTING wave moves no band's budget by a
  byte**, which is what made this phase measurable. `budgetAt` is the mean
  threat of a band's own authored waves, so adding a WAVE re-prices that band
  by existing -- but adding a body worth zero to a wave already in the roster
  changes neither the roster nor the mean. Four existing waves, four numbers
  in the config, and nothing else in the ladder moved.
- **`driftCount` counted every harmless body and both its callers are about
  one type.** They gate `spawnDrift` -- the ambient trickle against `maxDrift`
  and a wave's own placement against `driftCap` -- so it was already wrong for
  SEED (a SCION's three quietly suppressed the grey) and would have been wrong
  again for every one of the twenty: five EMBERs on the floor would have
  stopped drift arriving at all. Branched on the id now, the same correction
  build 275 made to `spawnGroup`.
- **A spin handed over at a spawn site DECAYS.** `integrate` damps angular
  velocity on every substep (`CFG.physics.angularDamping`), so HUSK's "end
  over end" measured **0.27 of a turn over eleven seconds** against the 2.6
  its rate asks for -- a body that stopped turning a second in. `tumble`
  holds it as a FLOOR rather than writing it, so a round's own impact spin
  (build 211's impact parameter) still adds on top instead of being
  overwritten sixty times a second, and the direction comes off the way the
  body is travelling so one that comes off a wall rolls back the other way.
  One owner for the number: the spawn site sets no `av` at all.
- **A state entered ONCE has to say so, because `steer` runs from
  `physicsStep` and not from `update`.** Both new gaits end by setting
  `fizzle`, and both conditions stay true afterwards -- so the first version
  re-armed the dissolve clock sixty times a second and the body dissolved for
  ever. `if (this.fizzle > 0) return;` at the top of each. Build 210's lesson
  from the other side: a state that stops a body moving has to be honoured in
  both.
- **"It went UP" cannot tell a gait that LEAVES from one that arrives
  somewhere, and the first version of the EMBER case lost about one run in two
  to it.** A DRIFT laid on the floor legitimately climbs to its own band at
  `CFG.drift.climb` -- measured, 496 to 548 units against the ember's 1008 to
  1013, so a 2x margin straddles the truth. What separates them is the RIM and
  the dissolve, and both are absolute: eight of eight past the rim and gone
  against zero of eight. Same disease as the DRIFT-march case's 1.5x ratio
  between two single draws.
- **The guide's authored speed for EMBER was never measured against the field
  it climbs.** `docs/objects.html` gives it 40 u/s, and era 1's column from
  the floor to the portal's rim is 962 world units -- a TWENTY-FOUR SECOND
  climb for the one object whose whole promise is "free salvage if you are
  quick". At 90 it is about eleven seconds, which is the clock that same page
  gives LANTERN for a climb it calls a timer you may answer or not, and still
  slower than the NEEDLE that is meant to be the fast one. A number authored
  in a design document is a proposal; the field it lands in is the
  measurement.
- **The ORDINAL hash came back identical (`1831189433`) and that is the
  result this phase wanted.** The object guide says to expect a move on any
  phase that touches `drive` -- and this one touches `drive` only by NAMING
  what it already did, so an unchanged hash is the proof that naming it moved
  nothing. Two new bodies cannot reach a rung-1 boss fight either: `fight.mjs`
  opens from `openBoss` and `Game.update` is `if (w.boss) {...} else {
  director.update() }`, which is the structural blindness builds 300 and 301
  already recorded.
- **THE FUSE ARM'S "GAP" WAS THE HOLD DURATION IN DISGUISE, AND THAT IS THREE
  BUILDS OF FALSE CAUSATION.** Build 305 correctly replaced its censored floor
  with the RATE and then kept `gatedPeak > loosePeak + 0.15`, calling that
  "the claim's own comparison". It is the same censored quantity: below the
  ceiling the peak is just `rate * held`, and measured across nine runs either
  side of build 307 the rate is 0.018 to 0.034 (a 1.9x band) while `held` is
  1.4, 13.6, 15.7, 29.1, 37.5, 39.4, 42.5, 50.8 and 54.3 seconds. So the arm
  needed a hold of about twenty-five seconds to clear 0.15 and failed on the
  three shortest draws -- on builds whose change was a price table (303), an
  era ceiling (305) and two harmless bodies (307). **Every one of those looked
  causal and none was.**
  What replaced it was available from build 293 and this case had never read
  it: `Director.burnFrom`, added under the note that a signal with two causes
  needs a field saying which -- in the one case whose entire subject is the
  second cause. Four arms now: it RAN (a liveness floor on the hold, which the
  old arm had none of, which is why a 1.4-second hold read as the mechanism
  failing rather than as the window missing it); the ARITHMETIC; the CAUSE,
  that most of the filling is the WAIT and not contact, which is not vacuous
  because the original report is a run fed by contact alone that never got
  there; and the CONTROL, that contact alone does not get there (gate-off peak
  0.03 to 0.19 over seven runs, ceiling 0.5). The gate-off run's own crowd
  count is zero BY CONSTRUCTION -- `play` writes `holdFor = 0` every frame
  when the gate is off -- so it is reported and deliberately NOT asserted. The
  window also went 150s to 300s, so the liveness floor is clear of the draw
  rather than near it.
- **...and the RATE was the same censoring one level down, which the longer
  window then exposed.** `gPeak / held` is only a rate while the fuse never
  saturates: `glitch` is clamped at 1 and zeroed by every discharge, so the
  first 300-second run read **1/84 = 0.0119** against a floor of 0.012 for a
  fuse that had risen more than twice over -- a perfect run of the mechanism,
  failing. What holds is the gross rise summed frame by frame against what
  those seconds are WORTH: a crowd frame rises `crowd / fuse` a second and a
  contact frame `1 / fuse`, so `rose === (crowdS * crowd + contactS) / fuse`
  is an IDENTITY taken off the config, not a floor fitted to a measurement.
  **A peak is not a quantity when the thing that fills it has a ceiling and a
  noisy duration**, and dividing a censored numerator by a noisy denominator
  is not a fix -- ask what the number is a product of, then assert the
  product.
- **AN EMBER SPRINGS A MINE, WHICH IS WHY A NEW-OBJECT CASE HAS TO CLEAR THE
  WHOLE FIELD.** Build 275 took `harmless` out of the mine trigger -- ground
  goes off when something stands on it -- so the eight harmless bodies this
  case puts on the floor can be caught by whatever six hundred cases upstream
  left lying there. Measured: 7 of 8 in the suite against 8 of 8 three times
  in isolation, which is the inherited-state signature exactly. It clears
  `enemies`, `drops`, `debris`, `projectiles`, `mines` and `effects`, and puts
  `timeScale` and `stasis` back -- the same list build 226's note says the
  half-clearing version of an earlier case got wrong. And the eight are laid
  SPREAD across the width rather than rolled, so eight bodies of radius 7
  cannot touch: the claim is that each takes the gait its type declares, and
  eight independent climbs say that where eight bodies shoving each other off
  the floor say something about the pair solver. With both, 8 of 8 in 15 to
  16 seconds, three runs out of three, on a field deliberately dirtied first.
- **A RISE BODY AUTHORS ITS CLOCK AND THE SPEED IS DERIVED, FROM BUILD 308.**
  LANTERN joins EMBER on `rise` (band 4, the plan's load-bearing object: the
  first one that costs you something for ignoring it). `climb` is seconds and
  `spawnByGait` derives the cruise from the column the body is actually on --
  measured off its own start and its own dissolve line, so the spawn jitter
  cannot shorten it. Build 307 authored the SPEED and it was wrong twice over:
  `docs/objects.html`'s own 40 u/s is a twenty-four-second climb at era 1, and
  the 90 that replaced it measured **12.3s at era 1 and 20.3s at era 2**,
  because the floor-to-rim column is 963 units against 1481 and a fixed speed
  stretches 1.54x with the field. So the one object whose promise is "free
  salvage if you are quick" got slower on the new field, silently. Derived:
  **10.83 / 10.85 and 8.62 / 8.78** across the two eras. `climbOf` throws for
  a `rise` type with no clock (build 224's `levels` rule, build 303's `band`
  rule, applied to a third mandatory field) and `check-build.mjs` catches it at
  the TABLE rather than at spawn, because a throw at spawn is a throw in the
  rAF loop and build 288 records that reading as a freeze rather than an error.
- **A TARGET SPEED IS NOT A SPEED, AND THIS REPO HAS NOW WALKED INTO IT
  TWICE.** CLAUDE.md already recorded it from build 298, about the portal's
  own ramp, and the clock was still handed over raw. `rise` blends toward its
  target at `k = accel / 100` while `integrate` damps every substep at
  `CFG.physics.linearDamping` 0.55, so the steady state is
  `target * k / (k + damping)` and NOT the target: EMBER wanted 11s and took
  **13.47** (k 2.2, ratio 0.80, predicted 13.4 -- arithmetic and measurement
  agreeing to a hundredth) and LANTERN wanted 9 and took **18.9** (k 0.8,
  ratio 0.59). The spawn site grosses the target up by `(k + damping) / k`,
  derived from the two terms rather than fitted -- so a slower `accel` needs a
  higher target for the same clock, which is the correct dependency and the
  one a fitted constant would have hidden. And the CASE is on the DURATION,
  never on the cruise: the cruise is an implementation of the clock.
- **`scaleToTier` RETURNS EARLY ON `e.harmless`, so a harmless body's bounty
  is 1 for ever.** The estimate of what ignoring a LANTERN costs was built on
  `bountyStep ^ 27` = 3.28x at rung 28 and came out at 72 kB -- **three times
  too high**, because the line that scales bounty sits below
  `if (!d || e.harmless || type.fixed || d.wave?.teach) return e;`. Measured
  instead, by destroying one and reading the purse: **22,220 B at every rung**,
  against 0 for one left to reach the rim, which is about 9% of a band-4
  level. Two arithmetic errors in one estimate and both were caught by the
  cheapest possible instrument -- spawn it, kill it, read the number.
- **`drops` IS THE ONLY DIAL A LIGHT BODY HAS, and the density is not one.**
  `shed` takes `max(n * minValue, mass * perMass quantised)`, so for anything
  under a mass of **4.44** the first term wins and every mote is worth exactly
  `minValue` -- measured, a LANTERN at r 20 pays 16 kB at densities 0.4, 0.55,
  0.8 and 1.2 alike, and it would need a density of 1.85 (heavier than a
  LURCHER) to move at all. So "sixteen motes' worth" IS a true description of
  `drops: 16`, and a harmless body pays that PLUS the flat `CFG.energy.drift`
  the `else if (this.harmless)` arm of `destroy` hands over.
- **...and build 307's HUSK line shipped a figure that was false.** It said
  "the largest single payout on the floor", copied from the object guide.
  Measured: a HUSK is 12 + 6 = 18 kB against a BULWARK's **112 kB** and a boss
  core's 264 to 792. It is the largest among the HARMLESS bodies and only
  until LANTERN's 22. Corrected to the comparison the sentence was always
  about, which is the same fix DRIFT's old "worth 10 ENERGY against a MOTE's
  4" needed. **A figure quoted in prose rots, and one copied out of a design
  document was never measured in the first place.**
- **A RISE BODY SPAWNED AT THE MACHINE'S X STARTS INSIDE THE TURRET.** The
  clock probe put one at `width * 0.5`, which is `world.shooter.x`, so an r-20
  LANTERN began overlapping a static body and the pair solver charged it two
  seconds: 11.23s at era 1 and 14.25 at era 2 against an authored 9, with the
  era spread reading exactly like the compensation being wrong. Spawned at
  `width * 0.22` the same code gives 8.62 and 8.78. The rule this repo already
  has -- suspect the instrument before the code -- and the same family as the
  build-192 note about a body spawned 240 units above the floor dying inside
  one frame.
- **`speed` and `climb` are two numbers for one fact, so they are pinned by
  arithmetic.** `type.speed` is still read by `scaleToTier` and by everything
  that expects a type to have one, but a rise body does not climb at it. The
  guard is that `speed * climb` IS the era-1 column, so every rise type's
  product must agree with every other's to within 3% -- they all cross the
  same field. Measured, ember 88x11 = 968 and lantern 107x9 = 963. A second
  source of truth that cannot be deleted can at least be made unable to drift
  in silence.
- **Phase 6 is sub-phased and 6b is two objects short of the inert five.**
  FILAMENT (a seven-bead chain with promotion-on-death) and BELL (a ring that
  marks every body on the field for two seconds) are each a new MECHANISM
  rather than a new body, and 6a already blew a session on two objects of
  which only one needed a new gait. What 6b ships instead is the object that
  needed no new gait at all plus the correction its clock forced, which also
  fixed EMBER at era 2. Sixteen of the twenty to go.
- **`Director.emit` REACHES FOR A FORMATION BEFORE IT ASKS THE GAIT, AND THAT
  HID EMBER FOR TWO BUILDS.** `if (job.n > 1 && !t.tows) { ... spawnFormation;
  return; }` sits above the `spawnByGait` dispatch, and EMBER is authored
  `['ember', 4]` and `['ember', 5]` -- so every EMBER in real play came down
  out of the portal instead of up off the floor. Measured through the real
  director on the real wave: start y **-70 to -77 with `staged` true**, against
  a floor at 1223, and a cruise of 83-93 against the 110 build 308's clock
  derives. The object's entire picture -- "the only thing on the field that
  starts where you are" -- was a body that arrived from the top, turned round
  at the rim and climbed back out, and build 308's clock never touched it.
  A formation is a SHAPE COMING THROUGH THE MOUTH; a self-placing gait does
  not come through the mouth at all, so it is asked first now, and `OWN_SPAWN`
  is one set shared by the dispatch and by `emit` rather than two lists.
  HUSK and LANTERN were authored at 1 and so were never affected -- which is
  the shape of the thing: a latent fault that fires on a COUNT, invisible in
  every wave that happens to author one.
- **...and the case could not see it because it called the dispatch DIRECTLY.**
  Build 307's arm is `spawnByGait(w, TYPE_BY_ID[id], x)` -- and that case's own
  docstring quotes the rule it broke: *a case that calls the method the handler
  calls tests the logic and not the control*. The control here is
  `Director.emit`, and nothing in the suite went through it. The replacement
  drives `Director.load` and `Game.update` and reads where the body actually
  started, with a hostile out of the SAME WAVE as the control -- 5/5 embers off
  the floor at a mean y of 1197 against 18/18 hostiles through the portal at
  -74, so the case is shown able to tell the two spawn paths apart before it is
  believed about either. Proved by revert: the formation branch restored reads
  **0/5 off the floor, mean y -81, cruise 90**.
- **A MISSING ARGUMENT IS LEGAL JAVASCRIPT AND A NaN PATH IS A LEGAL NO-OP.**
  `case 'drift': drawDrift(ctx, r, 0)` against `drawDrift(ctx, r, phase, time)`
  left `time` undefined for the life of the glossary, so
  `Math.sin(time * 1.3 + phase)` is NaN and **seven of DRIFT's path arguments
  were non-finite** -- the pulse ring's radius and both coordinates of all
  three orbiting dots. Canvas silently draws nothing for a non-finite path, so
  the icon was its dashed outline and nothing else, and no pixel test could
  tell that from a design choice.
  **The expensive part was that it broke a CONTROL.** Every grey the suite
  renders is compared against that specimen, so build 308's LANTERN arm was
  measuring against a DRIFT missing the two features `drawLantern`'s own
  docstring names it by. A broken control reads as a passing case. Swept now
  over all 45 shapes with a recording context, with the recorder shown to
  catch 2 of 2 planted NaNs -- because a zero from an instrument that has
  never caught anything means nothing -- plus a static arity guard in
  `check-build.mjs`. One instance in 45 helpers, which is exactly why it
  wanted a sweep rather than a grep.
- **A recording context needs real ACCESSOR PAIRS, not write-only stubs.**
  Four helpers (`drawGnomon` and `drawTri`'s three callers) read
  `ctx.strokeStyle` back and hand it to `rgba(hex, a)`, which calls
  `hex.slice` -- so a recorder with `set strokeStyle(v) {}` and no getter
  throws `hex.slice is not a function` and reports four defects that are its
  own. The style fields are plain data properties on the recorder.
- **The read-only fan-out earned its keep this time, and it found both of
  these.** The note under build 308 is that a six-way scout on a four-CPU box
  is a two-way one with queueing and contributed nothing to that build; the
  same run's later readers found the formation pre-emption and the NaN
  specimen, neither of which I would have looked for. **I doubted the first
  one and the measurement vindicated the scout** -- my own probe's born/floor
  split was sampled at first sight, where a staged body is not yet `born`, so
  it read 5 of 5 "from the floor" and refuted a real bug. The reading that
  settled it was the start Y. Two rules, both already in here: suspect the
  instrument before the code, and a fan-out's finding is a pointer to the
  right file rather than the measurement.
- **The shape guard harvests `case` labels across the WHOLE FILE into one flat
  set**, so `case 'rise':` in `drive`'s gait switch is in the same set as the
  draw switches' shape labels. Nothing is affected today because no shape
  shares a name with a gait -- but a future `shape: 'chain'` beside a
  `case 'chain':` in the gait switch would read as covered while drawing
  nothing, which is the build-273 fallback again. Worth knowing before
  FILAMENT, whose gait is `chain`.
- **THE HUSK CASE'S CONTROL WAS ONE MOTE, WHICH IS ONE ROUTE DRAW.** It
  failed on build 309 -- a build that touched neither bodies nor routes -- with
  the control mote closing 0.38 of its distance against a floor of 0.5.
  Measured across runs it reads 0.38, 0.48, 0.65, 0.68, 0.71, 0.73, 0.75,
  0.79, 0.83, because `this.route = weightedPick(ROUTES)` and a wide route
  with a slow fold-in is still 60% out at fourteen seconds. Six motes and the
  MEAN now, with the spread printed in the detail so the next reader can see
  why one was not enough. CLAUDE.md already carried this rule from the DRIFT
  march case and a case written four builds later repeated it: **the claim was
  always about the two BEHAVIOURS, never about two bodies.**
- **...and fixing the DRIFT specimen made every grey's separation WIDER**,
  which is the tell that the control had been crippling the measurement
  rather than flattering it: ember 113 -> 117, husk 93 -> 102, lantern
  118 -> 124 against the same ceiling of 40.
- **FILAMENT IS IN FROM BUILD 310, AND A CHAIN IS SEVEN BODIES WITH ONE
  REFERENCE EACH.** `release()` dispatches on a TYPE FIELD -- `if (type.beads)
  return spawnChain(...)`, one line above the `tows` it is modelled on, which
  is this repo's only mechanism for "a type that is more than one body". Seven
  `spawnOne` pushes, one entry each in `world.enemies` (counted as ENTRIES,
  because fifteen tiles pushed twice is what tessera.js paid for), and an
  array back for the callers that count.
- **THE PROMOTION IS A PULL, NOT A PUSH, AND THAT IS WHY IT CANNOT BE MISSED.**
  A follower whose lead is gone notices on its own next frame and drops the
  reference. A hook in `Enemy.destroy` would have been the obvious place and
  would have been wrong: `destroy` is the one door every DAMAGE death comes
  through and NOT the one door every `dead = true` comes through -- six places
  set it directly, so a fizzle running out, a boss teardown, the glitch
  dissolve and `Game.sweep` would all have left a snake following a corpse. It
  tests `fizzle` as well as `dead`, because `physicsStep` skips `steer` for a
  dissolving body while `integrate` keeps moving it. And there is NO roster:
  a field chain has no owner to prune one, which is the 53-entries-for-15-berths
  fault. Measured: cut the middle bead and it is 6 bodies under 2 heads, 0
  following a corpse, all 6 still moving three seconds on.
  **A `while` walk past the corpse would have been the wrong fix**, and the
  scout's plan recommended one: re-linking to the bead two ahead heals the
  snake, and the whole object is that a cut SPLITS it. A promotion rule and a
  repair rule look identical in code and are opposite designs.
- **`beads` throws and the shape is not called `chain`.** `beadsOf` refuses an
  absent, zero, one, negative, fractional or string count -- the third
  mandatory field after `levels` (224) and `band` (303). And the shape id is
  `bead`, because the shape guard harvests every `case 'x':` label across the
  WHOLE of enemies.js into one flat set: a `shape: 'chain'` would have been
  read as covered by the GAIT switch's own `case 'chain':` while drawing
  nothing, which is build 273's silent fallback with a new door.
- **THE FOLLOW DISTANCE IS DERIVED AND THE CEILING IS ON THE WHOLE ASK.**
  `chainGap(type) = 2r + CFG.chain.clear`, because `resolvePair` corrects any
  overlap with no `harmless` exemption and a constant that suited r 9 would
  stop suiting the first bead of another size. And the controller matches the
  LEAD'S VELOCITY plus a signed correction toward a station `gap` behind it --
  the first version scaled a cruise by distance-to-the-lead with a positive
  floor, so every term pointed at the lead and nothing pushed a bead that had
  closed up back out. (`mouthSlots` also uses `r * 2 + 8`; that is the LATERAL
  pitch between bodies abreast. Same form, different axis -- do not tie them.)
- **CHASING ONE FLAKY ARM FOUND TWO INSTRUMENT FAULTS AND ONE HARMLESS
  BEHAVIOUR, IN THAT ORDER, AND THE ARM WAS WRONG TO EXIST.** It began as
  "the worst gap clears `2r + slop`" and failed two runs in six (worst gap
  18.0, 18.1, 18.4, 18.8, 18.8, 22.3 against a floor of 18.4). The floor was
  a PROXY: `impactDamage` returns 0 below a relative
  `CFG.physics.collisionThreshold` of 62, so touching costs nothing. Asserting
  the cost instead failed four in six -- and the causes were (1) the wave's
  own four MOTEs and four NEEDLEs still on the field, and a NEEDLE at 104 into
  a bead at 44 clears 62 easily; (2) the correction capped at `cruise * grip`
  ON TOP of the lead's velocity, letting a bead ask for about twice its
  cruise. Both instrument-side. What is left is real and harmless: when the
  head REVERSES its weave the bead behind is still going the old way, so their
  relative speed crosses 62 and the solver bills a point or two -- 4 to 11% of
  22 health over five seconds, against an eighteen-second life. So the arm
  asserts the ABSOLUTE (no bead is lost to the formation) and the stable mean,
  and reports the health fraction without asserting it. **Three margins in a
  row could not be defended; the absolute could.**
- **AN UPRIGHT PICTURE IS A TYPE PROPERTY, AND TWO OF MINE CLAIMED IT WITHOUT
  IT.** `Enemy.draw` rotated by `this.angle` unconditionally, and `angle` is
  `rand(0, TAU)` with a random `av` on top -- so EMBER's trail ("two ticks
  BELOW it") and LANTERN's bail ("a hook over the top") pointed wherever the
  spawn roll left them and turned as the body drifted, for builds 307 to 310,
  with both docstrings asserting the opposite in as many words. `upright` on
  the type is what `draw` now checks; HUSK deliberately does not carry it,
  because "end over end" is the whole of that object. The case renders ONE
  body at two angles and requires an upright type to be identical and HUSK to
  differ -- and the first version of THAT called `debugSpawn` per angle, so it
  compared two different `phase` rolls and reported LANTERN differing by 61 on
  a build where the flag worked. **One body rendered twice, not two bodies
  rendered once.**
- **A PINNED WAVE DOES NOT STAY PINNED.** `d.order = [at]; d.at = 0;` is a race
  the probe loses: `Director.update` reshuffles `order` on its own schedule, so
  build 309's ember case was overwritten on its first frame and measured
  whichever ember wave the rotation picked -- which is why it reported
  "authored 4" while FIVE embers arrived, and nobody noticed because both
  numbers looked plausible. `Director.wave` being a getter is only half that
  trap; the other half is that the thing you pinned does not stay pinned. Load
  the wave and drive `emit` until its jobs drain -- deterministic, still the
  door under test, and the authored count read off the same object that was
  loaded. It reads 4 of 4 now.
- **A harmless body pays `drops * minValue` plus the flat `energy.drift`, so
  seven beads are 49 kB -- and that is UNREMARKABLE.** A bead is 7 kB, the
  same as an EMBER and less than a DRIFT's 10; a snake is 5.4 band-1 levels
  against the bonus wave's twenty-two drifters at 220 kB, or 24.4 levels, which
  has shipped for years. The scout that found the 49 kB called it "the richest
  ignorable thing in the game" and it is not close -- **a number without the
  comparison it belongs in is half a finding**, and acting on that one would
  have added a `bounty` divisor nothing needed. Note also that no ENEMY_TYPE
  declares a `bounty` and the constructor hard-codes `this.bounty = 1`, so a
  type-level bounty would have been a field with no reader.
- **A CASE THAT PREDICATES ON THE ROSTER ROTS WHEN THE ROSTER CHANGES, AND
  THIS ONE TOOK THE WHOLE SUITE DOWN.** The wave-progress case's `pose` helper
  looked for a regular wave whose types are ALL mote or needle -- and build
  310 added a harmless FILAMENT to the one wave that matched. `findIndex`
  returned -1, `WAVES[-1]` is `undefined`, and `Director.load` read `.teach`
  off it: **a throw inside `page.evaluate` kills the runner with no case output
  at all**, so the suite reported a stack trace instead of 638 results. Two
  fixes, and the second is the durable one: the predicate filters to HOSTILE
  types (the distinction build 307 taught check-build's own two-or-three rule),
  and `pose` THROWS on a missing wave rather than passing `undefined` down --
  a case that navigates has to check that it arrived, which CLAUDE.md already
  records from the D2 rig.
- **A PROBE'S SYNTHETIC STEPS RIDE ON TOP OF THE PAGE'S OWN rAF LOOP, so a
  timing-dependent quantity is not reproducible under load.** The FILAMENT
  station arm asserted the mean gap within 35% of the derived one: it read
  32-37 alone and **41-49 with the suite running alongside**, failing four runs
  in six with nothing about the chain changed. The head's weave runs off
  `world.time`, and extra updates of unknown size advance it. What a broken
  follower actually does is stream away without limit, and that is
  bound-checkable however much time passed -- `gapMax < gap * 5` is 150 units
  against a measured worst of 95.6 over twelve runs, while a stopped follower
  would cross the field's whole 963-unit depth. Four times (120) was tried
  first and left 1.25x, which is not a margin on a quantity with this spread.
  **Assert the runaway, report the mean.**
- **`pkill -f` matches the shell running it, and that cost two restarts.**
  `pkill -f "scripts/regress.mjs"` kills the bash process whose own command
  line contains the pattern -- exit 144, and the command after the `&&` never
  runs. CLAUDE.md already records the read-only half of this (`pgrep -f`
  matching its own shell and looking like a respawning process); the
  destructive half ends the turn's command. Resolve to a PID first.
- **THE PORTAL-BRAKE CASE CARRIED A RATIO BETWEEN TWO SINGLE DRAWS TOO, and
  build 310 tripped it.** `loose.atRim / loose.cruise >= (ramp.atRim /
  ramp.cruise) * 1.8` compares two DIFFERENT BODIES, each with its own `route`
  roll and `speedScale`. In isolation the separation is 2.1 to 5.0; the suite
  drew 0.99 braked against 1.77 loose -- a separation of 1.79, failing by
  0.7%. The clause is gone and the claim is carried by the two ABSOLUTES
  either side of it, which is how build 298's own note states it: the braked
  crossing is at or under the body's own cruise, and the no-portal control
  still reads the fast one. They guarantee 1.25x rather than 1.8x and both sit
  clear of every draw measured (0.68-0.99 against a 1.2 ceiling, 1.77-3.53
  against a 1.5 floor), with the separation reported in the detail. **That is
  the third margin this session that could not be defended and the fourth
  single-draw ratio in the file's history** -- when a case compares two rolled
  bodies, the comparison is the roll.
- **BELL IS IN FROM BUILD 311, AND ITS WHOLE TECHNICAL CONTENT IS WHERE IT IS
  DRAWN.** Shoot one and for `CFG.bell.ring` seconds every moving body carries
  a bearing tick -- a short line out of it along its own travel. It completes
  the object guide's inert five (EMBER, HUSK, LANTERN, FILAMENT, BELL).
  **Everything in `Game.draw` goes into `this.buffer`, which `glitch.present`
  copies to the glass while tearing it** -- a base pass jittered up to 4.5
  device pixels sideways plus up to twenty displaced slices -- so a readout
  drawn with the field is torn exactly when the field is hardest to read. That
  is the fault CLAUDE.md already records about the glitch counter, and this
  object's promise is that it works "through the corruption shader". So
  `drawBearings` paints onto the REAL canvas after `present`, and the world
  matrix is **captured** off the context that drew the bodies
  (`ctx.getTransform()`, shake included) rather than recomputed from `dpr`,
  `scale` and `camera` -- a second derivation would drift the first time the
  camera moved. Measured by revert: the tick holds **0.991** of its pixels
  under the shader drawn after it and **0.665** drawn into the buffer.
- **A POSITIONAL CLAIM NEEDS A THIN CONTROL.** The tick's pixels are found by
  DIFFERENCE -- lit with the bell ringing, dark without it, on a world held at
  `timeScale = 0` so two draws of one frame differ by nothing else -- and then
  those exact pixels are re-checked with the shader at full. The first control
  was the field's lit pixels generally and held 0.879, because a four-pixel
  jitter leaves a SOLID REGION still lit: it would have read as a passing
  control for a shader doing nothing. The control is thin pixels now (lit,
  with two of four neighbours dark), which is the same kind of feature as a
  tick and the kind a shift actually moves. And the arm requires the control
  to LOSE some (`fieldHold < 0.95`), or the comparison is empty.
- **`rings` is a capability on the type and `destroy` is the right door.** A
  hover body never leaves the field, so being shot is the only way a BELL ever
  goes -- and `destroy`'s own `fizzle` guard means one taken by the glitch
  dissolve rings for nobody, which is correct: nobody shot it. Both controls
  are in the case, because "it rings" is otherwise satisfied by a build that
  rings on any death at all. Topped up rather than added to, so two bells are
  two seconds of instrument and not four -- the same invariant `syncGate` has.
- **A bearing is a DIRECTION, so a body going nowhere has none.** Asserted as
  an absolute: with every velocity zeroed a ringing bell lights zero extra
  pixels. Without it the tick could be an arbitrary mark drawn at an arbitrary
  angle and the case could not tell.
- **THE FIRST HOSTILE OF THE TWENTY WEIGHS SOMETHING, WHICH IS A DIFFERENCE
  IN KIND.** Builds 307-311 could drop EMBER, HUSK, LANTERN, FILAMENT and
  BELL into waves already in the roster and move no band's budget by a byte,
  because `threatOf` returns 0 on its first line for `harmless`. QUARRY
  (build 312, band 4) cannot: `budgetAt` is the mean threat of a band's own
  waves, so a hostile re-prices the whole band by existing. Measured across
  both builds in ONE container, per the differential rule: band 4 **21.32 ->
  23.30, +9.3%**, and bands 1, 2, 3 and 5 identical to the digit. That number
  is the deliverable of the change as much as the body is -- every other
  band-4 wave is 9.3% longer now.
- **A body that FRACTURES counts what it becomes, the way a TOW counts what
  it drags.** `splits.type` naming the parent's own id makes the generation
  the body's RADIUS instead of a field on it: r 40 -> three at 24 -> nine at
  14.4, stopped by `splits.floor`, out of one type, one drawing, one codex
  entry and one band entry. So the health a player actually shoots is
  `hp * (1 + p + p^2)` for `p = count * hpAt` -- x2.71, i.e. 37.9 threat
  against the 14 its own `hp` alone would say. Left to the author that is a
  second source of truth for the same number, and the failure mode is a band
  that thinks it can afford three of them.
- **A recursive field needs its termination checked, because the failure is
  the game not booting.** `fractureDepth` throws on a `scale` at or above 1
  (or a floor at or below 0) rather than defaulting, for `levelsOf`'s and
  `bandOf`'s reason -- and proved rather than argued: with `scale: 1.2` the
  build dies inside the module graph at `check-build.mjs`'s FIRST import,
  because `threatOf` is reached from the tree's own price sweep at load.
- **The children's numbers come off the PARENT and AFTER `scaleToTier`, or
  the rung is applied twice.** A kid made with `opts.hp = parent.maxHp * 0.3`
  would then be multiplied by `k.hp` again inside `spawnOne`'s scaler --
  parent's `maxHp` already carries it. The arm that can see this has to run
  at a rung where `k.hp` is not 1: at rung 22 it is 1.786, so the fault reads
  0.54 where the authored share is 0.30. At rung 1 the case cannot fail.
- **A fracture is paid for ONCE, by the pieces that cannot break.** `shed`
  values a mote off the body's own MASS and three children at 0.6 of the
  radius carry `3 * 0.36 = 1.08` of their parent's area, so the mass is
  conserved across a generation and paying at each one pays for the same rock
  three times. A body that broke into its own kind sheds nothing; the nine
  that cannot shed one mote each, their COUNT derived from the radius --
  `(14.4 / 40)^2` of eight is 1. Measured 0, 0 and 9 motes across the three
  generations.
- **THE GUIDE'S `tumble` CANNOT BE GIVEN TO A HOSTILE, and the reason is two
  rules meeting.** HUSK's tumble is ballistic -- thrown from a side wall with
  no propulsion -- and `CFG.physics.linearDamping` 0.55 makes the throw 11%
  of itself four seconds in. Scenery may coast to a halt because it dissolves
  at `life`; a hostile that coasts to a halt comes to rest wherever it
  stopped, and a body at floor level out to one side is outside
  `autoTarget`'s 78-degree cone FOR EVER -- which, with build 291's release
  gate waiting for the field to thin, is a run that can never climb again.
  `roll` is the gait that keeps the closing march and replaces the ROUTE, and
  it is a fifth word in `GAITS` rather than a second meaning for `tumble`,
  because `OWN_SPAWN` is keyed on the gait and a hostile has to come through
  the portal like everything else.
- **A crossing gait cannot be built out of the route idiom, and the factor
  saturating is the tell.** `routeLateral` hands `drive` a perpendicular
  offset to the bearing AT THE MACHINE, and perpendicular to that bearing is
  TANGENTIAL -- a tangential heading holds the body's distance from the mount
  and wraps round it rather than crossing the field. Measured, sweeping the
  factor 0.75 / 1.1 / 1.3 / 1.6 / 2.0 moved the crossing 187, 200, 202, 207,
  205 units of a 629-wide field. **A factor the picture does not respond to
  is a factor on the wrong term.** What works is steering at a point
  displaced in WORLD X from whatever the body was aiming at, by the remaining
  depth times the factor: high up that point is outside the field, so the
  body really drives at the wall; at the floor line the term is zero and it
  converges on the machine, which is the fold every route already does across
  its last stretch.
- **...and it turns at `edgeEase`'s BAND, not at the wall, which is why the
  first two versions turned nowhere.** There is already a global rule against
  a body reaching a side wall -- `CFG.physics.edgeEase` pushes anything within
  96 units of an edge back at 300 u/s^2, under a docstring naming the very
  thing a roller does ("could otherwise end up rolling along a wall"). So a
  roller's reachable column is 106 to 522 of 629 and a turn point at
  `r + 14` = 54 is a hundred units outside anywhere the body can be: a branch
  nothing can take, which is the `world.endless` shape again. Derived from the
  rule it would otherwise fight, the two agree and the turn fires at exactly
  136 and 493. **Before adding a rule about where a body may go, find the one
  that already says where it may not.**
- **A new gait's cost is measured in TURNS against ARRIVAL.** `CFG.roll.slant`
  was chosen off the sweep, not by eye: 0.75 gives 0-1 turns and arrives in
  42-44s, 1.1 gives 1 and 55s, 1.3 gives 1-2 and 61-68s, 2.0 gives 3 and
  76-94s. It is scale-invariant across the two eras by construction, because
  the displacement goes with the column and the field's width goes with the
  same zoom -- so the zig-zag count is the same at era 2 and only the clock
  stretches, x1.54, like every other body's.
- **A CLEAR THAT SNAPSHOTS DOES NOT CLEAR ANYTHING WHOSE DEATH MAKES
  BODIES.** `debugClearField` took `[...w.enemies]` and destroyed what was in
  it, with a comment explaining that the snapshot is needed because a destroy
  appends DROPS -- and four things append BODIES: a SPLITTER's four motes, a
  WARDEN's plates, a SCION's seeds and now a QUARRY's three. They land after
  the snapshot, so the helper every case uses to get a clean field left a
  whole generation standing on it, and has since SPLITTER existed. Found from
  the other end: the HEAVE arm read a body leaving the shell at 76.5 u/s with
  the node unbought, against a ceiling of a fifth of 183.3 -- and 0.6 to 0.8
  over six runs on a page of its own, which is the inherited-state signature
  exactly. It repeats until the field is empty now (bounded as a backstop,
  since every one of those chains terminates), and the case carries the
  one-pass version as its control at 3 bodies.
- **A one-frame velocity reading depends on everything that can deliver an
  impulse, not only on bodies.** The same HEAVE arm calls `debugClearField`,
  which takes bodies and salvage and nothing else -- so a mine, a projectile
  or an effect left by any of six hundred arms upstream is inside its
  measurement. It clears all three itself now. `restart()` is not a reset of
  everything a case can leave behind, and neither is a field clear.
- **A ratio between a ROUNDED number and a full-precision one is not the
  ratio.** The budget arm compared `budgetAt / mean` across bands to pin the
  walk without hard-coding it, and read the budgets off a `toFixed(2)` copy
  kept for the message: two bands disagreed at 2e-4 on a build where they
  agree to the bit. Round for the message, divide the raw.
- **`budgetAt` is the band's mean times the WALK, and comparing it against a
  raw mean understates a change.** The first version of the budget arm read
  band 4 rising 2.3% where the differential across the two builds in one
  container was 9.3%: 0.936 is the walk at rung 1 and it was being counted as
  part of the rise. The arm takes the walk off ANOTHER band at the same rung
  rather than writing 0.936 down, so it ties the budget to the roster without
  pinning a constant a tuning pass would move.
- **The ORDINAL hash was worth running for this one, because the SALVAGE
  expression moved.** `destroy`'s drop count went from `t.drops || 0` to a
  quantised share that a fracture suppresses, and that reduces to the
  identity for every type in the game that does not break into its own kind
  -- by inspection, which is exactly the argument this repo does not accept.
  Measured instead, both builds in one container: `1831189433` either side,
  to the bit. An unchanged hash is the proof that an expression rewritten on
  the energy path did not reach anything that was already using it.
- **`large: true` is on fifteen types and NOTHING reads it**, under a comment
  claiming it makes a body "released more slowly, and worth more when it
  lands". Found while authoring QUARRY, deliberately NOT acted on in the same
  build -- a dead field is `git rm`, and a removal sweep does not belong in a
  build whose measurement is a band's budget. Same shape as `kind: 'works'`
  (eighteen builds) and the anomaly `cost` fields (fifty-six).
- **THE DEAD-FIELD SWEEP IS A GUARD FROM BUILD 313, AND IT FOUND TWO.** Every
  key any `ENEMY_TYPE` declares has to appear as `.key` or as a quoted string
  somewhere in `src/` outside config.js -- declaring a field is not reading
  it. `large: true` on fifteen types went (a comment claiming it made a body
  "released more slowly, and worth more when it lands"), and `solo: true` on
  SCION turned out not to be decoration at all. This is the third and fourth
  instance of the same shape: `kind: 'works'` shipped dead for eighteen
  builds and nine anomaly `cost` fields for fifty-six, and both were found by
  hand. Proved by planting `zzzdead: true` on a type: the build exits 1 and
  names the type. **The sweep errs toward PASSING** -- a short key like `r` or
  `hp` matches something unrelated in a hundred places -- and that is the
  right direction: it can tell you a field is definitely dead, never that one
  is live.
- **A DEAD FIELD WHOSE COMMENT NAMES A RULE IS THAT BUG, SHIPPED.** SCION's
  `solo` carried "never part of a formation... a formation releases three to
  six of one type in one go -- which is how five of them ended up on the
  screen at once the first time this was measured", and nothing read it. So
  the fix for a dead field is `git rm` OR the rule, and which one it is comes
  off the comment beside it. **And build 301 made it three times worse than
  when it was written**: a wave's counts are a budget now, so the authored
  `['scion', 1]` swells with the rung and anything from `formAt` up was
  grouped. Measured either side in one container, one wave, one release: 3
  scions at rung 22, **SIXTEEN at rung 28** and 12 at rung 35 in a single
  formation, against 3, 8 and 12 releases of exactly one each after. A
  phase-3 change re-opened a fault whose own comment recorded it, because the
  number the comment was about stopped being the number in play.
- **...and THE SECOND DOOR WAS THE WRONG PLACE TO PUT THE GUARD**, which is a
  twist on the rule this file already carries. `emit`'s formation branch is
  where the crowd is made and it looks like the site: it is not, because that
  branch has already `shift`ed the job and returns -- skipping the formation
  falls through to ONE release and silently drops the other n-1 bodies, which
  is a worse bug than the one being fixed. `Director.load` is where the
  GROUPING decision is taken, so refusing to group there keeps the count (n
  singles). The other half of the rule is in `spawnFormation`, which rolls its
  own type out of a list and already dropped TOWs on the same line. Two sites,
  one rule, and they cannot disagree: a caller that NAMES the type goes
  through `load`'s half and a caller that hands over a LIST goes through the
  roll's. **Ask what each door actually does with a refusal before adding
  one.**
- **`spawnFormation`'s single-kind fallback is deliberate and is now
  asserted.** `kinds.filter(...)` then `weightedPick(single.length ? single :
  kinds)` means a list of one solo kind still puts that kind up -- the source
  calls it the belt to a pair of braces. What stops the director ever making
  that call is `load`'s half, so the case asserts the fallback as a recorded
  decision rather than leaving it as a hole for somebody to find.
- **SHOAL IS IN FROM BUILD 314, AND A SCHOOL IS ONE SERIAL AND NO ROSTER.**
  Fourteen darts, band 1, `gait: 'flock'`, and `school` is the third
  multiplicity field `release()` dispatches on after `tows` (2) and `beads`
  (7). `spawnSchool` stamps one serial on the fourteen it makes and every
  body finds its schoolmates by reading it -- so nothing owns the school and
  nothing has to prune it when a body dies, which is build 310's chain rule
  and tessera.js's 53 entries for 15 berths is why it matters. Band 1's
  budget moved **7.11 -> 7.47 (+5.1%)**, measured in one container, and the
  other four bands cannot have moved because the type is authored into band 1
  only.
- **SEPARATION CANNOT BE A HEADING WHEN EVERYTHING CONVERGES ON ONE POINT.**
  The flock was built the way `roll` is -- an offset to the aim point -- and
  the cohesion half works that way. The separation half did nothing at all,
  and the SWEEP is what said so: over eighteen combinations of the three
  factors the closest pair in the school measured 13.2 to 14.2 units in EVERY
  cell, which is `2r - slop`, the distance `resolvePair` parks two touching
  bodies at. **A factor the picture does not respond to is a factor on the
  wrong term** (build 312, again). The reason is geometric: every body is
  steering at the same mount, so a tilt away from a neighbour is spent long
  before contact -- two bodies converging on one point arrive together
  whatever their headings did on the way. It is `edgeEase`'s idiom instead,
  whose own docstring says why ("a nudge on the velocity rather than a change
  of heading"), and the same sweep then reads 13.9 to 25.7 monotonically.
- **THE A/B IS THE SERIAL, WHICH IS AS CLEAN AS AN A/B GETS.** The same
  fourteen bodies either way: sharing one serial they are a school, given
  fourteen distinct ones each is a school of one and `flockOn` finds nothing.
  Not the type, not the count, not the gait, not the field -- nothing else
  differs. Separation reads 25.5 against 13.8; cohesion, laid 150 units wide,
  reads a cloud closing to 112 against strangers spreading to 227. Reach for
  the switch that is inside the mechanism before building a scenario around
  it.
- **AN A/B THAT SWITCHES OFF TWO TERMS WITH OPPOSITE EFFECTS MEASURES
  NEITHER.** The serial A/B is the cleanest switch in the mechanism and it
  cannot see cohesion: fourteen distinct serials disable BOTH halves of the
  flock at once, and cohesion draws the cloud in while separation pushes it
  out, so the difference is their sum and reads as nothing -- measured, one
  school laid 150 wide came in to 167 against strangers' 157, the wrong way
  round on a build where cohesion demonstrably works. With the serial shared
  and `cohere` alone taken to zero, the same five depths read 72 (worst 84)
  against 107 (worst 152). **Vary the TERM, not the switch that happens to
  disable everything.** And a term that cannot be shown to do anything is a
  term to delete, which is what this arm was written to decide.
- **A WINDOW COUNTED IN FRAMES IS NOT A WINDOW when the quantity depends on
  distance travelled.** The cohesion reading was sampled over seven seconds
  of synthetic steps, and a probe's steps ride on TOP of the page's own rAF
  loop -- so inside the suite the school had reached the mount inside the
  window and what was measured was a pile against the turret. It read 112
  against 227 alone and 219 against 188 in the suite, inverted, on identical
  code. Sampled at five DEPTHS FALLEN instead, both arms are compared at the
  same five distances and extra frames only make the run finish sooner.
  Build 310's chain case paid for this on the same quantity; this is the
  second time.
- **MEASURE A FLOCK IN TRANSIT: a school at the mount is a pile.** The first
  reading watched twelve seconds and reported the school collapsing -- 27.7
  apart falling to 13.5 -- which is fourteen bodies all trying to occupy the
  mount, and 13.5 is what any fourteen bodies do there. The window is the
  crossing now. Same shape as the HEAVE arm's one-frame reading and build
  305's censored fuse: ask what the number is a property of before believing
  it moved.
- **THE GUIDE'S SWARM COLOUR IS MOTE'S, AT dE 0.0, AND THE PALETTE IS FULL.**
  `docs/objects.html` gives the swarm family `#7ef9ff`, which is MOTE's body
  colour exactly -- the collision build 223 had to fix between ALL MINES and
  BLAST. Searched rather than guessed: over the whole HSL grid against all 75
  tones in the roster the best-separated colour left in the game is a pure
  magenta at **dE 37.7** and nothing else clears 31, against a working
  separation this repo documents at 15-23. It is KEPT, because the two are
  the same family of problem and because changing a category colour is
  explicitly a decision to ask about rather than take -- and what carries the
  distinction instead is the register the six greys already rely on. Measured
  on the ALPHA channel alone, so colour is divided out by construction:
  SHOAL's silhouette is **104** from a MOTE's. The nearest alternative inside
  the family is `#00b0e6` at dE 15.8 and it is written down in the type.
- **...and the drawing had to be re-drawn once for the same reason.** A dart
  built as an arrowhead is a cyan DELTA, and MOTE's icon is a cyan triangle:
  two sizes of the same picture. Rendered side by side before it shipped and
  replaced with a slender spindle and a forked tail. When a hue is shared the
  silhouette is load-bearing, and the only way to know is to render it and
  look.
- **`drawSpecimen` TAKES A TYPE ID, AND 'bead' IS A SHAPE.** Build 310's
  FILAMENT arm read `shot('bead')` for four builds; `TYPE_BY_ID.bead` is
  undefined, so it rendered the unknown-id FALLBACK -- a spiky ringed disc --
  and compared that against five real specimens. It passed every run and had
  never measured `drawBead` once. Found by rendering the sheet by hand while
  drawing the dart, which is exactly how build 309's NaN DRIFT was found: **a
  broken control reads as a passing case.** The type's id is `filament`; with
  it the closest pair is bead against DRIFT at 60, so the arm's own threshold
  of 40 still holds.
- **THE ORDINAL HASH MOVED FOR A WAVE IN BAND 1, AND THAT IS WHY BAND 4 DID
  NOT.** 314 took it 1831189433 -> **1213474222**, which was not expected --
  `fight.mjs` is one rung-1 boss fight opened from `openBoss` and the
  director never releases, which is the structural blindness builds 300, 301
  and 307 all recorded. Proved rather than argued: with ONLY the new wave
  removed and everything else in the build left alone, the hash comes back to
  `1831189433` to the bit. The channel is `Director.shuffle`, which draws
  randoms in proportion to the CURRENT BAND's roster -- so inserting a wave
  into band 1 shifts every `Math.random()` in the fight that follows, and the
  positions of every body in it. Build 312 added a wave to BAND 4 and the
  hash did not move, for the same reason: at rung 1 the shuffle never sees
  band 4. **So the rule for phase 6 is: a wave added to band 1 moves it and a
  wave added to any other band does not**, and neither is a behavioural
  change -- it is build 241's re-association fault wearing a table's clothes.
  **THAT MECHANISM IS WRONG AND THE RULE DOES NOT HOLD -- corrected at build
  318.** Measured at 317 with controls: `Director.shuffle` and `Director.load`
  are called **zero** times across the whole 9000-frame fight, `order.length`
  stays 0 and `world.earned` stays 0, because `fight.mjs` never calls
  `restart()` -- it sets the assist flags and calls `openBoss(1)`, and
  `Game.update` is `if (w.boss) {...} else { director.update() }`. The shuffle
  channel is SHUT, so the hash is blind to the wave table in EVERY band and
  not merely outside band 1. Proved rather than argued: a guaranteed-eligible
  band-1 wave (`[['mote', 5]]`, `opens` 0) does not move it either -- and
  moving SHRIKE's own wave into band 1 is not even a valid control, because
  `shuffle` filters on `eligible()` first and that wave carries a LURCHER at
  `opens: kB(200)`, ineligible at `earned` 0 in any band. Build 314's wave WAS
  the cause of its move (that half was proved by revert); the MECHANISM
  attributed to it was inference and is not there. **Do not cite the band
  rule** -- for a wave-table change the honest expectation is no move at all,
  and the instrument to reach for is `tiers.mjs`.
- **A SCHOOL COUNTS AS ONE PROBLEM AGAINST THE ELEVEN-BODY CEILING, AND THAT
  IS A RULING.** The ceiling is "a combination must not become a crowd" and
  it was written when every hostile entry was independent bodies. Counted as
  fourteen, band 1's school wave is 22 against 11 and the honest choices are
  to double the allowance for every wave in the game or to ship a school of
  six, which is not the object. So the ceiling counts PROBLEMS, a school is
  bounded separately at one per wave (the way `mortarCap` bounds the thing
  three ceilings are blind to), and what bounds the bodies is `maxEnemies` --
  which build 300 deliberately made the thing that holds the crowd down.
  **Note the guard ALREADY PASSED before the ruling was written**, because
  `school` was a field it did not read: a guard that passes for a reason
  nobody chose is the `undefined > eraGate` shape, so the body count is
  printed now beside the problem count.
- **...and the rounded-ratio rule was broken by the build that wrote it.**
  Build 313 recorded "round for the message, divide the raw" about a budget
  arm, and 314's threat arm then asserted `threat === one * 14` with `one`
  rounded to two places -- 0.47 x 14 is 6.58 against a true 6.53, failing by
  0.05 on a correct build. A rule written down is not a rule applied; when an
  arm multiplies a reported figure, check which copy it took.
- **A FACING is the GAIT's business, not the type's.** `upright` means "this
  picture is oriented to the world" and a dart's is oriented to its own
  travel, so SHOAL declares no drawing field at all: `Enemy.update` writes
  `angle` from the velocity for a `flock` type and zeroes `av` so `integrate`
  has nothing to fight it with. It is in `update` rather than in `flockOn`
  because the flock branch never runs for a STAGED body -- a school would
  have marched in pointing wherever fourteen spawn rolls left it, which is
  build 310's EMBER-trail fault with a different picture.
- **The multiplicity list is read out of `release`'s own source.** `if
  (type.X) return` is the dispatch, so the roster of multiplicity fields is
  the code rather than a list beside it -- which a hand-kept list of two
  would have fallen behind the moment `school` was added, silently, because
  every assertion in that guard is about the fields it happens to name. Held
  in both directions, the shape the gait vocabulary already uses.
- **SPINDLE IS IN FROM BUILD 315, AND IT IS THE ONE BODY THAT IS NOT A CIRCLE
  TO A ROUND.** A capsule: a bar 96 long and 11 thick lying along its own
  `angle`, cartwheeling at two thirds of a revolution a second. Measured with
  one round fired straight up the field at a lateral offset, the spin pinned
  off and the body held at a known angle, it connects out to **57 broadside,
  43 at 45 degrees and 9 edge-on** -- against an arithmetic 57.69, 43.63 and
  9.69, to the unit, a factor of **6.3** -- while the control, a GLUT of
  radius 16, is 20 at both angles. That table is the object.
- **THE SCOPE IS THE ROUND, AND SAYING SO IS HALF THE DESIGN.** `r` is still
  30 and the physics still uses it: the pair solver, the arena clamp, the
  mass, every blast, every beam, every chooser and `checkContact` all see an
  ordinary disc. Three doors read the bar and no others -- `resolveSegment`
  (the one place a ROUND is tested against a body), `hitReach` (which is what
  tells the sweep to look outside `r` at all) and `hitCircleAt` (the circle
  the contact geometry is derived on). A capsule everywhere would be a
  different build: `pen = rr - d - slop` is in five places in the pair solver
  alone, and `checkContact`'s grab and release band is pinned four units
  apart with a comment explaining that `s.r` cancels exactly -- a body whose
  half-extent varied with rotation would flip in and out of
  `world.attackers` every 0.75s and fire `audio.glitchOn()` each time.
- **`hitReach` IS THE DOOR THAT WOULD HAVE SWALLOWED THE WHOLE FEATURE.** The
  sweep rejects a body whose reach does not cover the round's step BEFORE the
  shape test runs, so a bar with `hitReach` left at `r` is unhittable along
  exactly the 23.5 units of itself that stick out -- and hittable in the
  middle, which reads as the profile working. Broadside it now connects at 57
  against `r + p.r` of 34.2, so 22.8 units of the bar are past anything the
  old test could reach.
- **A CAPSULE IS THE SET OF CIRCLES ALONG ITS AXIS, WHICH IS WHY IT COST THE
  GEOMETRY NOTHING.** `resolveSegment` already records the circle its hit
  test used (`hitX/hitY/hitR`) because a round can stop on a body, a WARDEN
  plate or a SCION ball, each with its own centre and radius. For a bar the
  circle is centred at the closest point on the axis with radius `barR` -- so
  the impact parameter, the outward normal, the incidence PRISM reads, the
  spin's lever and SLIVER's chord all come out exact against the real surface
  with NO change to `contactAt`. `segSeg` returns the mutually-closest pair,
  so the axis point the sweep records and the one `hitCircleAt` derives from
  the hit point are the same point by construction rather than by agreement.
- **...and `takeHit` WAS THE FIFTH DOOR, recomputing the contact against the
  BODY.** `const c = contactAt(this, hx, hy, ...)` -- identical to the
  sweep's own derivation for every round in the game, computed twice, and
  quietly wrong the moment a body stopped being a circle. Proved by revert: a
  broadside hit near the tip imparts **|av| 1.81** with the body's circle and
  **0** with the capsule's, because on the real surface that hit is square-on
  and has no lever at all. The control is an edge-on graze at 0.42 either
  way, which is what says the zero is the geometry and not a blind
  instrument. One owner, called from both, and from `exitPoint` -- where the
  chord would otherwise be computed on r 30 against a 5.5-thick bar and
  every SPINE splinter born up to 24 units past the far face, in open space.
- **A DEBUG OVERLAY THAT DRAWS THE WRONG SHAPE CANNOT SHOW THE BUG IT EXISTS
  FOR.** `drawHitboxes` is the only place in the game the hit profile can be
  SEEN, and it drew `arc(e.x, e.y, e.r)` for everything. It draws the capsule
  for a bar now, with the physics disc behind it -- both, because for that
  body the disc is the fiction and the capsule is what a round meets.
- **A GAIT THAT HOLDS A SPIN MAKES "at 90 degrees" MEANINGLESS IN A CASE.**
  The cartwheel holds `av` every substep, so `e.av = 0` in a probe is
  overwritten inside the same update -- the first profile sweep read the
  edge-on width as 13 units against an arithmetic 9.7, because the bar had
  turned 160 degrees during the forty frames it waited for the round.
  Pinning `CFG.cartwheel.spin = 0` switches the floor off (`av * routeSide <
  0` is false at av 0) and the angle is then the one the case put there. A
  held quantity cannot be held still by writing it once.
- **A WAVE AUTHORED AT ITS BAND'S OWN MEAN RE-PRICES THE BAND BY NOTHING.**
  `budgetAt` is the mean threat of a band's roster, so the cost of adding a
  wave is how far it sits from that mean: SPINDLE's weighs 21.10 against band
  3's 20.93 and the budget moves 19.59 -> 19.62, **+0.15%**. Band 4 paid
  +9.3% for QUARRY and band 1 +5.1% for SHOAL because those waves were
  heavier than their bands. It is a real lever for adding a problem without
  lengthening every other wave, and it is the reason to compute the band's
  mean before choosing an entry's counts.
- **THE HASH DID NOT MOVE, AND THAT WAS THE PREDICTION.** 1213474222 either
  side, in one container. Build 314's finding said a wave added to band 1
  moves it and a wave added to any other band does not, because
  `Director.shuffle` draws in proportion to the CURRENT band's roster and
  `fight.mjs` runs at rung 1 -- this build's wave is band 3, so the rule was
  a prediction before it was a measurement. The rest of the change is
  identity for a body that is a circle: `hitCircleAt` returns `this`, so
  `takeHit`'s contact is unchanged to the bit, `hitReach` is the old
  expression and the sweep's new branch is skipped. **A collision-model
  change that provably did not touch any existing body** is the kind of claim
  only this instrument can make.
- **A FLOOR SET NEAR THE TRUTH FAILS WHEN THE RANDOM STREAM RE-ROLLS.**
  AIRBURST's arm asserted the single-body gain at `> 1.3x` and read x1.26 on
  this build, whose only relevant change is a new wave -- which re-rolls
  every `Math.random` downstream of the shuffle and so re-rolls which of
  HAIL's thirty-odd jittered pellets land on a pinned body. CLAUDE.md's own
  note on the node already said the single-body gain is small and variable
  (1140 -> 1170 in the assay), so a 30% floor on it was a margin straddling
  the draw. The claim in the arm's NAME is the crowd, so the crowd carries it
  now: the three-abreast ratio must beat the single-body one by 30%, which is
  two numbers from the same run rather than a threshold on one. **Adding a
  wave is a re-roll of the whole suite's randoms**, so expect the arms with
  tight margins to be the ones that fail.
- **THREE INSTRUMENTS FOR COHESION AND NONE OF THEM HELD STILL, so the term
  is asserted and the picture is reported.** By SERIAL it cannot be seen (the
  two halves of the flock have opposite effects on the cloud and cancel). By
  FRAME COUNT it read 112 against 227 alone and 219 against 188 in the suite,
  inverted. By DEPTH FALLEN -- the honest clock for a quantity that depends
  on distance travelled -- it read 72 against 107 alone and 106 against 93 in
  the suite, inverted again. What is left is that fourteen bodies converging
  on one mount make a cloud whose radius is dominated by the run's own
  conditions. So the arm asserts `flockOn`'s own arithmetic instead, laid out
  four wide so the separation nudge provably cannot fire: the offset is
  `(centroid - me) * cohere` to 1e-6, zero at cohere 0, zero for a body with
  a serial of its own. **A narrower claim that holds beats a picture that
  inverts** -- and the cloud figures are in the message for the next reader.
- **The guide's kinetic colour is TOW's, at dE 0.0, and the ruling is build
  314's.** Same as SHOAL against MOTE: the family is the point, the palette
  has nothing well-separated left, and the silhouette carries it -- a 96-unit
  capsule against a head on a cable, measured on the alpha channel alone. The
  GLOW is separated instead (13.4 from TOW's), which is the half that was
  free.
- **A YOKE IS TWO BODIES AND ONE POOL FROM BUILD 316, WHICH IS A FIRST: HEALTH
  THAT IS NOT A PROPERTY OF A BODY.** Phase 6i, band 5, gait `paired`, `pair: 2`
  -- the fourth multiplicity `release()` dispatches on and the first that is
  NOT more health. A TOW is two bodies with two pools so `threatOf` counts the
  head plus what it drags; a chain and a school are N bodies of N times the
  health. A pair is two bodies of ONE 150, so it weighs 5 and not 10, and
  nothing in `threatOf` had to change for that -- `many` reads
  `school || beads || 1` and a pair is one. The band-5 wave is authored at
  33.9 against that band's own mean of 35.39, so it re-prices the band by
  **-0.4%**, which is build 315's lever used deliberately.
- **THE GUIDE'S THREE SENTENCES CANNOT ALL HOLD LITERALLY, AND `snap` IS THE
  READING THAT MAKES THEM.** `docs/objects.html` says they "share one pool of
  150 health. Kill one and the beam breaks -- and the survivor keeps the whole
  remaining pool". If every point drains one shared pool then draining it kills
  both and there is no remaining pool for anyone to keep. `CFG.yoke.snap` (0.5)
  is the share of the pool that, landed on ONE half, takes that half off the
  beam: spread your fire and the pool empties with neither half having absorbed
  that share, so both go together; put half into one and it comes off with the
  rest standing in a single body at `alone` (1.9x) speed. Measured, the total
  damage to clear the pair is **0.993 to 1.006 of the pool either way** -- what
  focusing buys is what you are left facing, never a shorter fight.
  The knife edge falls the right way by one guard: `pourPool` tests
  `this.hp > 0` before snapping, so perfectly even fire -- where each half
  absorbs exactly the share on the hit that empties the pool -- kills both.
- **A TARGET RATE IS NOT A RATE, FOR THE THIRD TIME.** Build 298 (the portal
  ramp) and 308 (the rise clock) are already in here and the number was handed
  over raw again anyway. `grip` blends the tangential velocity toward `spin`
  and TWO terms pull it back every frame: `integrate`'s `linearDamping`, and
  `drive`'s own blend, which steers both halves at nearly the same march target
  and therefore erases the part of the velocity that DIFFERS between them.
  Steady state is `want * grip / (grip + damping + accel/100)` = 0.59, measured
  **0.692 rad/s against an authored 1.2**. Grossed up by those two terms rather
  than by a fitted constant -- the correct dependency as well as the honest
  one, since a heavier `accel` fights the rotation harder -- and delivered
  1.143 to 1.172 over three runs. `drive`'s `authority` clamp can only reduce
  its term, so the compensation is an upper bound and the rate lands at or
  just under the ask. **The case is on the delivered rate, never on the
  expression that asks for it.**
- **...and `cur` has to be measured RELATIVE TO THE MIDPOINT or it is not a
  rotation rate at all.** The pair's march is a translation both halves share,
  and counting it as rotation reads the beam as turning fastest whenever it
  happens to lie across the field.
- **`emit` REACHES FOR A FORMATION BEFORE IT ASKS THE TYPE, AND A PAIR IS
  BUILD 309'S FAULT IN NEW ARITHMETIC.** `spawnFormation` lays its slots at
  `r * 2 + 8` -- 60 for an r-26 half -- and a pair spans `r + len + r` = 112,
  so the slots are pitched for one body and each pair is nearly two of them
  wide. Measured through the real director on the real wave at rung 32: 114
  bodies, every beam intact at exactly 60, and a worst overlap between halves
  of DIFFERENT pairs of **51.9 of a possible 52** -- two bodies with their
  centres a tenth of a unit apart. A formation of pairs is a lattice, not a
  shape. The exclusion is written beside `tows`, whose own comment has said
  "a shape made of towed pairs is a traffic jam rather than a formation, they
  file in" since it was written. `beads` and `school` reach that branch too
  once the budget swells their count, and neither was touched here.
- **The control for that arm is the wave's OTHER entry.** 60 releases through
  `Director.emit`, every one of them exactly 2 bodies with both halves beamed
  to a partner that arrived with them, 0 beams off 60 and 0 overlap -- against
  the same wave's GLUT job, which forms up 20 at a time. A spawn-path claim
  needs a probe shown able to tell the two paths apart before it is believed
  about either.
- **...and an overlap measured with the CADENCE BYPASSED is the probe's own
  pile-up.** Forcing `lastRelease = -1e9` and emitting eight times in one
  frame put eight pairs through the mouth at once and read a worst overlap of
  48 on the fixed build. The gap between releases is what separates them; the
  overlap claim belongs to ONE release.
- **`rigid` is load-bearing and the rotation alone cannot show it.** A pure
  rotation does not compress a beam, so with or without the flag the length
  held 60.00-60.01 for four seconds -- a flag with a reader whose other branch
  is never taken, which is the `world.endless` shape. Before believing a
  constraint flag, find the force that would violate it.
- **...and THE FORCE CANNOT BE A SHOVE, because two bodies driven into contact
  destroy each other inside one frame.** The first version kicked the halves
  inward at 400 six times over: they met at a relative speed far over
  `collisionThreshold`, `resolvePair` billed `impactDamage` to both, and the
  window was EMPTY -- `Math.min` over no samples is `Infinity`, which the case
  duly reported as the rope "collapsing to Infinity". Healing every frame does
  not save them: one frame's bill is more than the whole pool. And the
  standalone run of the same arm had read "52.15, and it stays there" off a
  window of exactly ONE sample, with `lo === hi === mean` as the tell -- a
  number I wrote into these notes as a behaviour. **A min and a max that agree
  to the digit are a sample size of one until proven otherwise.**
  What works is a PRESS: put the halves closer than the beam, at rest, and let
  the constraint answer. No velocities, no contact, `hurt` asserted at zero.
  Pressed to 45 of 60 the beam is back to **60.00 within twenty frames** and
  the rope is still at **52.43**, which is the pair solver's own overlap floor
  of 52.4 rather than anything the link did. Isolate the mechanism instead of
  overwhelming it.
- **A damage bench on a pair has to keep it clear of the mount.** The first
  run read a survivor at 64.87 of a pool of 141 against an expected 66, and
  non-integer damage on a bench firing integers is the tell: the pair had
  marched into the turret and `resolvePair` was billing `impactDamage` on top
  of the probe's own hits. The totals arm zeroes `cruise`; the snap arm stops
  on the frame the beam breaks. The turret is off too (`autoAim`/`autoFire`),
  which is worth 5 of 150 on its own.
- **A pool compared across two `lay()` calls is two different pools.** The
  constructor rolls `maxHp` at `rand(0.92, 1.1)`, so the focused and spread
  runs are 140 and 164 on the same build -- the two-single-draws trap, on a
  quantity that looks like a constant. Both arms divide by their own pool.
- **`Enemy.draw` IS THE ONLY TETHER READER IN THE DRAW PATH, AND IT DREW A
  TOW'S CABLE FOR ANY TETHER AT ALL.** So a YOKE's beam was painted twice --
  once by the half that carries it, and once as a slack cable in `#8fa9c4`,
  **the game's ONE grey, which the colour rule promises means harmless**. A
  hostile pair strung together in the harmless colour is the palette's only
  promise broken by a draw call, and `check-build`'s colour guard reads TYPE
  colours and cannot see it. `rigid` is the distinction and already existed: a
  cable is slack and is drawn as a link between two bodies, a beam holds its
  length and is part of each half's own picture. Counted on that grey's own
  signature -- its green channel is exactly the mean of its red and blue,
  which the violet's is not -- the fixed build reads **0**, the flag removed
  reads **80**, and a TOW, which must keep its cable, reads **154**.
  **Nothing but rendering it and looking was going to find this**, which is
  the rule this repo already has about area effects and about the DECOY's
  barrel: a new body inherits every draw path that keys on a field it happens
  to declare, and a tether is a field.
- **A case that loads a real wave has that wave's TRAITS for the rest of its
  life.** `Director.load` seeds `d.traits` and nothing clears it, so the YOKE
  case's arm 1 -- which loads the band-5 wave at rung 32 to measure what
  `emit` releases -- left SWARM rolled on, and SWARM halves `maxHp`: every
  later `release` in the case made a pool of 79 and 74 against the authored
  150. **Every arm was a ratio of the pool, so they all passed**, which is
  the worse outcome -- a case measuring a body the wave engine handed it
  rather than the one the type declares. `d.traits = []` beside the
  `setTier`, and the arms print the pool.
- **A SURVIVOR COUNT CANNOT TELL THE TWO DEATHS APART, and a bench that goes
  on firing finishes at zero either way.** The first version of the snap arm
  asserted "focused leaves 1 standing, spread leaves 0" against a bench whose
  whole job is to land the WHOLE pool -- so it kept firing at the survivor and
  read 0 for both. What distinguishes them is what is LEFT STANDING on the
  frame the pair becomes one body: focused, half the pool behind the half that
  came off; spread, nothing, because the pool emptied. Same count, opposite
  events. Measure the state at the event, not the state at the end -- which is
  the end-of-window trap in a third costume.
- **SHRIKE IS IN FROM BUILD 317, AND THE GUIDE'S "THROUGH THE MACHINE" IS
  PHYSICALLY IMPOSSIBLE IN THIS ENGINE.** Phase 6j, band 2, gait `dive`: hold
  height across the top, pick a lane, run down it at 210, overshoot to the
  floor, climb back out. `docs/objects.html` says it "runs straight down
  THROUGH the machine" and nothing can: the turret is static with `invMass` 0,
  so `resolvePair` separates positionally and `impactDamage`'s reduced mass
  against a static body is `1 / invSum` = the body's WHOLE mass, with the
  result clamped at 300. That is death for anything under 300 health at any
  speed over the 62 threshold. Measured, a 70-health body driven down the
  turret's own column at 210: **dead at frame 83**, every time, and never past
  the mount. `plow` does not help and says so in its own guards, which name
  the turret as one of the two things it must never pass through. Slowed under
  the threshold it survives and is **stopped dead 36 units above the mount** --
  so there is no speed at which the literal reading works.
- **...SO THE LANE IS DERIVED FROM THE TWO RULES IT WOULD OTHERWISE FIGHT.**
  `laneFor` is the one place it is computed: the overlap `e.r + s.r` it must
  not enter, plus `CFG.shooter.grabPad`, where `checkContact` still takes
  hold. Swept across lanes 0/38/40/41/42/44/48/56 with the body's x held: 0
  dies, **38 to 42 grip and lose nothing**, and 44 and out pass the machine
  and never grip at all. So the dive goes PAST the machine at the edge of its
  own grip band, which is the only column where both rules are satisfied, and
  a dive body of another size is covered by existing. Same shape as build
  312's roll turning at `edgeEase`'s band: before adding a rule about where a
  body may go, find the one that already says where it may not.
- **A LANE IS NOT HELD BY BEING AIMED AT ONCE.** The first version committed
  when the body was within `r` (14) of the lane, and a target straight down
  the lane corrects laterally more weakly the closer it gets -- so it dived up
  to fourteen units wide, closest approach **59.5 against a band of 42, and
  ZERO frames of grip**. The object's entire payload ("does its damage on the
  pass") was not delivered, on a build whose dive speed and survival both
  measured perfectly. Two fixes, both derived: commit within `grabPad` rather
  than within `r` -- the pad is the width of the thing the lane exists to
  reach, so it is the width the commitment is worth -- and `wobble` 0.7 ->
  0.12, because `drive`'s clumsy heading wander is ±10 degrees and a dart on a
  committed run does not wander. Then 19 frames of grip at a closest approach
  of 40.4.
- **...and the corridor is `grabPad` = TWO UNITS WIDE, so a pass scrapes.**
  Recorded rather than guarded: a real body cannot hold two units to the unit,
  minGap lands at 40.4 against an overlap of 40, and each pass costs a
  measured **11 of 70 health** -- six passes' worth, against a cycle the
  player has about eleven seconds of to answer. It is a consequence of the
  geometry rather than a balance choice, and it means a SHRIKE left alone
  eventually pays for its own runs.
- **A TARGET RATE IS NOT A RATE, FOR THE FOURTH TIME -- AND THE SECOND PHASE
  IS THE ONE THAT GETS MISSED.** The dive was compensated from the start
  (`(k + damping) / k`, k = `accel / 100`) and measured **209.9 against an
  authored 210** on the first run. The CLIMB was authored as a share of cruise
  and handed over raw, and measured **26.6 against a wanted 30.9** -- 0.861,
  which is `k / (k + damping)` exactly. One rule now covers both phases, and
  the climb measures 80.0 against 80. **When a mechanism has two speeds,
  compensate both or neither**; the one nobody thought about is the one that
  quietly runs at six-sevenths of what the config says.
- **A CYCLE HAS TO BE FAST ENOUGH TO BE A THREAT, AND THE ARITHMETIC IS THE
  COLUMN.** `climb` as 0.75 of a 41 u/s walk is 26.6 delivered against an
  858-unit column from the floor to the hold band: a **thirty-second climb**,
  ONE dive in forty seconds, and a body that is very nearly scenery. Authored
  as an absolute 80 instead it is about eleven seconds against a four-second
  dive -- x2.6, two dives in forty seconds, and most of the cycle spent in the
  phase the counter says to kill it in. The two speeds are independent
  quantities and the object is the RATIO, so expressing one as a share of the
  other's walk hid the thing being designed.
- **A FACING IS THE GAIT'S BUSINESS, and now there are two gaits that need
  one.** `upright` means "this picture is oriented to the world"; a dart and a
  shrike are oriented to their own TRAVEL, which is a different claim and
  cannot be a type flag -- a SHRIKE points down on the run and up on the
  climb. `FACES_TRAVEL` is the set, read in `Enemy.update` rather than in
  either gait, because neither gait's branch runs for a STAGED body and a
  school marching in pointing wherever fourteen spawn rolls left it is build
  310's EMBER-trail fault.
- **THE THIRD TYPE IN ONE GOLD, and the answer is the wave and not the hue.**
  `#ffd166` is NEEDLE's body colour AND GLUT's, so SHRIKE is the third -- the
  same collision SHOAL had with MOTE and SPINDLE with TOW, and the same ruling
  (the family is what the colour means, the palette has nothing
  well-separated left, the silhouette carries it). What is new is that the
  obvious band-2 partner WAS one of the other two: the wave is
  `[shrike 2, lurcher 2, mote 1]` at 18.03 against band 2's own mean of
  17.875, **+0.18%**, rather than the `needle` pairing that priced identically
  and would have put two of the three golds on the field together. When a hue
  is shared, check the wave as well as the shape.
- **A NEW GAIT'S CONFIG NEEDS A GUARD FOR THE CORRIDOR EXISTING AT ALL.**
  `grabPad` is a shooter constant with nothing to do with SHRIKE, and at zero
  or below there is no lane that grips without overlapping -- the gait would
  either kill the body or deliver nothing, with no third option and nothing
  failing. `check-build` asserts the pad is positive, that the dive is faster
  than the climb (equal numbers are a body with three phases and one speed),
  and that `swing` clears the pad, because a climb back up the dive lane would
  spend the one vulnerable phase gripping the machine.
- **BUILD 318 IS 317'S OBJECT AFTER A REVIEW PASS, AND FIVE GREEN ARMS WERE
  HAPPY WITH FOUR FAULTS.** The fan-out was asked for and earned its keep far
  more decisively than build 308's: three read-only lenses (state-machine
  lifecycle, geometry and interaction, dead code and test vacuity) over one
  commit. **And the rule about fan-outs held again**: all three converged on
  "two shrikes fight for one lane and neither commits", which is NOT what
  happens -- measured, both commit and both die in the corridor. A fan-out's
  finding is a pointer to the right file; the mechanism is still yours to
  measure.
- **A LANE ON THE WALL OF ITS CORRIDOR IS A PAYLOAD DECIDED BY WOBBLE.**
  `checkContact` grips on `dist <= e.r + s.r + grabPad`, so a lane at exactly
  that offset passes the test at ONE point and the body's own heading wander
  decides whether the pass delivers anything. Measured over one 40-second run:
  **18 grip frames at `wobble` 0.12 and 439 at `wobble` 0** -- a
  twenty-four-fold swing on a term with nothing to do with the mechanism,
  which is the tell that the payload was luck. Half a pad inside
  (`grabPad / 2`) the corridor has a unit either side: 9 frames at 0.12 and 85
  at 0, both non-zero, so the grip is earned by the derivation instead of by
  the noise. `check-build` asserts the offset is strictly inside the corridor
  now, which is the claim its own heading was already making.
- **A TWO-UNIT CORRIDOR HAS NO ROOM FOR A PER-BODY OFFSET, SO THE SEPARATION
  HAS TO BE IN TIME.** Every body on a side derives the SAME lane by
  construction. Measured on the shipped wave, which authors two: both dived,
  met in the corridor at a relative 300 u/s, and **both were dead at 27.8
  seconds** at 3.3 and 23.1 of 70 health. `laneBusy` makes the DIVE exclusive
  per side -- holding and climbing are outside the lane by construction and
  must not block each other -- and the same wave then reads **2 of 2 alive,
  dives 3 and 2, health floors 46.3 and 65.6**, visibly taking turns (one
  commits on the frame the other's dive ends). Three bodies: 3 of 3 alive
  against 1 of 3. `scionLane` exists one rung down for the same reason.
- **...and the case laid ONE body, so the shipped configuration was the
  untested one.** A case that lays fewer bodies than the wave it is about is
  a case about a different wave.
- **A CLOCK THAT COUNTS TIME IN THE PHASE IS NOT A CLOCK THAT COUNTS TIME IN
  THE LANE.** `dwell` claims to be "seconds it holds a chosen lane before
  committing"; `diveT` counted seconds in the HOLD PHASE, and the body arrives
  from the climb 150 units away, so the traverse alone is about 4.8 seconds
  against a 1.4-second dwell. Measured at the commit frame: **4.84 and 4.94**.
  The position term always bound, the clock decided nothing, `check-build`
  guarded a value with no effect, and the telegraph the counter depends on
  ("stand a mine on the line it is going to use") did not exist. `diveHeld`
  counts time inside the lane instead. **The declared meaning of a field and
  the quantity it measures are two different things to check.**
- **MY OWN PROBE READ THE POST-RESET VALUE AND PROVED NOTHING.** The first
  attempt logged `diveT` at the hold->dive transition -- after the branch that
  zeroes it -- and read 0.00/0.01 on every dive, which looks exactly like a
  dwell that is working. Sample the frame BEFORE a transition when the
  quantity is what the transition consumes.
- **AN ARM THAT ASSERTS SOMETHING ITS OWN RUN DISPROVES.** 317 asserted
  `minGap > overlap` -- that the body never enters the radius the pair solver
  bills across -- while the same case measured 11 of 70 health lost, which can
  ONLY come from `impactDamage`, which only fires inside that radius. And
  `minGap` is sampled after `g.update`, i.e. after the positional correction,
  so it could never have seen the entry. Two units cannot be held to the unit;
  the honest claim is that the scrape is BOUNDED, and that is what is asserted.
- **A GRIP COUNTER WITH NO PHASE GUARD LEFT `swing` WITH NO FAILING TEST
  ANYWHERE.** Set it to 3: `check-build` passed (`> 0`), the climb returned up
  inside the grip band, the grip count went UP, and the arm passed more
  easily -- while the climb's entire justification is that it delivers
  nothing. Counted per phase now, with the climb AND the hold asserted at
  zero, which is the only thing that gives that constant a way to fail.
- **A CONJUNCT WHOSE VARIABLE CANCELS IS A TAUTOLOGY, AND IT WAS NAMED AS A
  CONTROL IN THE COMMIT MESSAGE.** `Math.abs(dive * naive / dive - 1) > 0.03`
  reduces to `0.139 > 0.03` -- true on every build, including one with
  `diveOn` deleted. What replaced it compares the measurements against each
  other: each delivered figure must be at least three times closer to the
  authored number than to the uncompensated prediction, with that prediction
  computed from `accel` and `linearDamping` rather than carried as the literal
  0.861 the first version hard-coded.
- **Two conjuncts that were true by construction.** `phases[0] === 'hold'`
  cannot be otherwise (`diveOn` writes 'hold' whenever the field is falsy) and
  `includes('dive')` is implied by the dive count beside it. Both gone.
- **A DIVIDE WITH NO FLOOR ON A FIELD WITH NO DEFAULT.** `gross` divides by
  `accel / 100` and `accel` has no default on a type, so a dive body authored
  without one gets a NaN cruise and is lost for the run without throwing. The
  rise clock's copy of the same arithmetic already carried that floor; this one
  did not. Three literal copies of `(k + damping) / k` now exist and are
  deliberately NOT extracted: the callers form the product in different orders
  and build 241 records what re-associating one costs.
- **THE DECOY IS THE FIELD'S OTHER STATIC BODY AND IT CLEARED BY
  COINCIDENCE.** It stands at exactly `shooter.x` with `r` 24, against a lane
  at 41 and a sum of radii of 38 -- three units, held only by
  `decoy.r < shooter.r`. Raise it past `shooter.r + grabPad / 2` and every
  diving body dies on it ABOVE the mount, in a phase whose exit is
  position-only and which therefore never ends. `check-build` ties those two
  numbers together now; nothing else in the repo did.
- **Four faults are RECORDED AND NOT FIXED, each with its reason.** (1) At era
  2 the hold band is behind the yard wall (`holdY + r` = rim + 104 against a
  wall at rim + 161), so a held body is unshootable, unminable and
  un-STASIS-able -- LATENT only, because SHRIKE is band 2 and `eraGate` is 28,
  so its wave is always era 1. (2) On a viewport under about 443 tall the hold
  band lands at or below the turret and the object delivers nothing at all;
  `sh` is floored at 420, so a short window reaches it. (3) Writing `cruise`
  per phase inverts `thrown`'s documented purpose -- during a dive the
  ordinary ceiling is 1465 against `thrownSpeed` 720, so a PULSE HALVES a
  diving body's cap. (4) `checkContact` sets `attacking` and `drive` then
  multiplies cruise by 1.3, so the grip frames run about 30% faster than the
  authored dive; the delivered-speed samples are taken clear of the mount and
  the claim is stated that way rather than silently averaged. Each wants its
  own measurement and none is a fault in what the object does at the rungs it
  is actually played on.
- **A GAIT THAT REPLACES THE ROUTE'S STEERING STILL INHERITS THE ROUTE'S
  SPEED, AND THAT MADE AN AUTHORED SPEED DEPEND ON A SPAWN ROLL.** `drive`
  applies `route.dawdle` to any loose body beyond 260 units, and `dive` sets
  `this.cruise` per phase -- so the object whose whole claim is "210 units a
  second" delivered **209.9 on a body that rolled a direct route and 185.9 on
  one that rolled a dawdling one**, with the climb 80.0 against 51.6. Nothing
  about the geometry differed: era, width, floor, both radii, `grabPad`, the
  lane and `accel` were identical in both runs. `OWN_SPEED` is the exemption
  and it names `dive` only -- `roll` and `flock` replace the steering too and
  still inherit the dawdle, which for them is a slower approach rather than a
  broken claim, so changing it is a balance decision and not this build's.
- **...AND IT WAS `g.restart()` THAT FOUND IT, NOT THE SUITE.** The case
  failed in the suite and passed in three standalone probes, which is the
  classic inherited-state signature -- and it was not that. The only
  difference that mattered was the case calling `g.restart()`, which moves the
  random stream and therefore re-rolls the body's route. Reproduced in one
  minute by running the same window with and without the restart: 185.9/51.6
  against 209.9/80.0, the suite's figures to the decimal. **Before clearing
  state, check whether the two runs are drawing the same randoms** -- build
  303 recorded the same correction about an A/B and this is its single-run
  cousin.
- **A HOLD THAT RESETS ON LEAVING ITS RANGE IS A HOLD THAT NEVER COMPLETES,
  for the second time in this repo.** The in-lane clock zeroed on every
  excursion, and `drive`'s heading wobble carries the body across a two-unit
  gate constantly: measured, both bodies of the shipped wave recorded ZERO
  dives in sixty seconds. The TOW's `holdWind` note records this exact fault
  and its fix, and the fix is the same -- the clock BLEEDS, so leaving the
  lane costs ground rather than the attempt.
- **A COMMIT TOLERANCE IS A STEERING QUANTITY, NOT A GEOMETRIC ONE.**
  `grabPad` was used because it is the corridor's width, and a body whose
  heading wobbles cannot hold two units for `dwell` even with the clock
  bleeding. `CFG.shrike.gate` is a share of the body's own radius instead,
  and what makes the loose gate safe is the other half: **the dive aims at a
  point AHEAD on the lane rather than at the far floor.** Aiming at the floor
  makes `dx/|d|` vanishingly small and lateral error is never corrected --
  build 317 committed within 14 units and the pass measured an error of 17,
  i.e. it diverged. With `look` at 150 the body has real lateral authority for
  the whole 660 units above the mount.
- **MEASURE A POPULATION, NOT A DRAW -- and this is the fourth time this file
  has said it and the first time it caught me mid-build.** Three consecutive
  "fixes" each looked right on one body and then read differently on the next
  roll: dives [2] then [0,0] then [2,3,3] on the same code. Eight independent
  solo trials and five pair trials settle it: **209.9/80.0 in 13 of 13**,
  dives 2 and 3+3 in 13 of 13, every body alive, scrape 0-9 of 70.
- **...and the GRIP is bimodal at about four passes in five.** 15 of 18 bodies
  gripped; the three that did not read a closest approach of 43.6 against a
  band of 42. The corridor is `grabPad` = 2 units against a lateral error of
  one to three, so this is the geometry and not a bug -- a pass grazes, and
  sometimes misses. The arm asserts 2 of 3 bodies over one window rather than
  one body over one window, because on one body it flakes about one run in
  six.
- **A FLINT IS PLATED ON ONE FACE FROM BUILD 319, AND THE CODEX LINE I WROTE
  FOR IT NAMED THE WORST ANSWER AVAILABLE AS THE ANSWER.** `armor` 0.55 across
  a +-53.1 degree arc that the body slews to keep on the barrel, so the gun --
  which is static -- can never find a side. The line then told the player to
  "take it with ground it walks over, something that goes off behind it, or a
  round that arrives bent", and **two of those three are false**, both for the
  same reason and both measurable in one probe. `applyBlast` passes the
  direction from its own centre to the body, so anything sited between the
  body and the machine is a FRONTAL hit. Measured, a 111-point blast at 60
  units: **49.9 on the near face, 111 up-field, 111 off to one side, 149.3 on
  the centre** (where there is no direction to take and no falloff either).
  - A mine triggers at `m.r + trigger + e.r` -- 55 units -- so it ALWAYS goes
    off while the body is still up-field of it. Ground it walks squarely over
    is worth about half of the same ground laid aside: the counter is
    inverted, and the more squarely it walks over the mine the less the mine
    does.
  - A blast genuinely behind it is full damage and **cannot be aimed there**.
    HE and AIRBURST burst at the contact on the near face, PULSE is radial
    from the machine, DECOY's parting blast sits between the two, and WELL --
    the only one that can land up-field -- is sited at `densestPoint`, which
    the player does not choose.
  What is left, and what the line names now: a mine laid OFF the line, the
  five directionless sources (contact, ARC's chain, a Patch's bite, HARD
  CASING, TITHE -- all pass `0, 0`, both verified in source), and SPINE's
  shred, which zeroes the plate before the gate is reached. **A counter named
  in prose is a promise, and this one had never been measured.**
- **A DIRECTIONAL MECHANISM MAKES EVERY EXISTING DAMAGE SOURCE'S GEOMETRY
  LOAD-BEARING, AND THE SUITE CANNOT SEE THAT.** 693 of 693 green on code
  whose player-facing promise was backwards, because every arm measured the
  PLATE -- the same hit from four directions -- and not one of them measured a
  SOURCE. The arm that would have caught it is the one that asks where a real
  blast actually sits, and it is four lines. When a change makes direction
  matter, the cases to write are about the things that deliver damage, not
  about the thing that receives it.
- **NOTHING IN THIS GAME CAN SPIN A PLATED BODY, so the window the config sold
  does not exist.** `CFG.flint.turn`'s docstring said the window left "after
  something spins or shoves it is the only way the gun ever sees a side".
  `Enemy.face` writes `av = 0` for a plated body on every frame, one call
  above `integrate` in the same loop, so build 211's impact spin never reaches
  `angle` at all -- a bolt at maximum lever moved a flint **0.0000 radians**.
  Nor does a shove open one: PULSE's impulse is radial from the machine, which
  changes the range and not the bearing. And the tracking a marching body
  demands is `v_perp / d`, at most **0.21 rad/s** at the 210-unit standoff
  against an authored 1.6 -- seven times what the job costs. What the number
  really governs is the ARRIVAL: the constructor rolls a random `angle`, so a
  loose flint takes up to `PI / turn` = 1.96s to come round, spent at the top
  of the field outside `aimRange`. **A docstring that names a window owes it
  the same measurement a threshold owes its floor.**
- **`Enemy.face`'s plated branch ignored `frozen`, alone among every rotation
  in the file.** Three others (`:826`, `:889`, `:1832`) scale by 0.12 under
  STASIS and this one did not, so the ability held the body and not the plate:
  0.8 rad in half a second against 0.096. A new rotation inherits none of the
  rules the old ones learned; grep the file for the state before writing one.
- **A CLOSED RING IS A CLAIM ABOUT THE WHOLE BODY.** `materialOf(t).plate` is
  `!!t.armor`, and the armour liner -- whose own docstring says it exists
  because "armour is the one property that changes how you fight a body" and
  it "was invisible" -- drew a **complete circle** at `r * 0.7` for the one
  body in the game whose entire identity is armour on ONE face, underneath its
  own directional arcs. The marker said the opposite of the truth about the
  only body it is the whole point of, and nothing could fail for it: the ring
  is drawn, the arcs are drawn, both are the right colour. A type that says
  which WAY its armour faces draws its own; the general ring is for armour
  that really is all round.
- **A DRAWN ARC THAT IS NOT THE DAMAGE ARC IS A READOUT OF NOTHING.**
  `drawFlint`'s plate arcs were centred at `-0.7r` rather than on the body, so
  they subtended **+-94.8 / 89.5 / 85.3 degrees** against a rule of +-53.1 --
  the player reads which way the plate points off the picture, and the picture
  was nearly twice as wide as the mechanism. Centred on the body the drawn arc
  IS the damage arc. Same family as the DECOY's barrel and the HITBOXES
  overlay below: a shape that stands for a rule has to be derived from that
  rule.
- **`drawHitboxes` IS THE ONLY PLACE THE HIT PROFILE CAN BE SEEN, AND IT DREW
  A CIRCLE FOR EVERYTHING.** The one overlay that exists to show what a round
  actually meets could not show the build-315 capsule or the 319 plate. It
  draws both now, the physics disc behind the true profile -- both, because
  for those bodies the disc is the fiction.
- **A SECOND `plated` TYPE WOULD WEAR FLINT'S NUMBERS IN SILENCE.** Both
  readers are hard-wired to one block -- `frontal` reads `CFG.flint.front` and
  `face` reads `CFG.flint.turn` -- so a new type declaring the flag gets a
  53-degree arc slewing at 1.6 rad/s whatever its own design said, with no
  field to set and nothing to fail. `check-build` refuses a second one and
  names what has to move. Exactly `levels` defaulting to 3 (eight nodes sold
  three times) and an omitted `band` reading as band 1: **a value inherited in
  silence is indistinguishable from a value that was chosen.**
- **The FLINT specimen pointed sideways, under the comment explaining why
  SHRIKE's does not.** `case 'flint'` was added directly beneath the block
  written two builds earlier to explain the `+PI/2` correction for this exact
  fault, without the correction and splitting that comment off its own case.
  Second time in three builds; `drawFlint` and `drawShrike` both draw along
  local +x and every other specimen is upright.
- **A CONTROL THE LIVE GAME CANNOT PRODUCE IS STILL THE RIGHT CONTROL, BUT ONLY
  FOR THE CLAIM IT DISCRIMINATES.** The plate arm holds a flint side-on by
  rewriting `angle` every frame, which `face` would never allow -- and that is
  correct for "the plate is directional", because the same body at two angles
  is the only pair that divides the geometry out. It is NOT evidence about
  what a player can do, and reading it as such is how the codex line survived.
  Say which of the two a control is for.
- **`threatOf` IS HEALTH-ONLY, SO THE BUDGET CANNOT SEE ARMOUR -- AND FLINT IS
  THE LARGEST INSTANCE OF THAT GAP.** Weighting each body by `1 / (1 - armor)`
  ranks `flint x3 + prism x3` at **x1.705**, the top of the whole roster --
  ahead of `bulwark + herald` at x1.480 and `bulwark + needle` at x1.446, both
  band 5, and `quarry + needle` at x1.251 in band 4. Armour
  has never been counted for anyone, so this is not a new rule broken; it is
  the biggest case of an old one, and the only body whose armoured face is
  always the face the gun sees. Recorded, NOT acted on: weighting threat by
  armour re-prices every band in the game and belongs in a pacing pass.
  Note `docs/objects.html` also authors `threat: 5` for FLINT where its own
  hp/30 convention gives 4, and nothing compares the guide against the
  derivation. Measured: at the derived 4 the wave weighs 20.80 against band
  3's mean of 20.9571, which is 0.75% under it and moves the band's budget
  -0.094%; at the guide's 5 it would weigh 23.80, 13.6% OVER the mean. Those
  are two different ratios and it is easy to quote one for the other.
- **It clears comfortably, which is the arm of a review worth having most.**
  Front-effective health is `120 / 0.45` = 266.7, so 10.3 stock bolts at
  0.286s = 2.93s a body; `thinAt` is 2 of 6, so the worst case is 4 kills =
  **9.8s of on-target fire against `patience` 26** -- and HOLLOWPOINT's eight
  band-3 levels land at the wave's own rungs, so real damage there is x1.26 to
  x6.35 of that. A stall is bounded and self-clearing anyway (`hitPatience`,
  the 291 release gate, the crowd term lighting the fuse, `glitchOut`
  fizzling the field). A body that reads as brutal on paper is worth costing
  before tuning it.

- **THE SHOAL CUT ARM ASSERTED A CLOUD RADIUS AT 200 AND DREW 201, ON A BUILD
  WHOSE CHANGES CANNOT REACH A DART.** 319's remediation is six draw-path and
  string edits plus a `frozen` factor on plated bodies; none of them touches
  SHOAL, the random stream or any physics. The quantity is the survivors'
  cloud radius after five seconds of MARCHING, so it is a distance-travelled
  reading, and a probe's synthetic steps ride on the page's own rAF loop --
  the instability build 310 and 314 both recorded, on this same quantity.
  Measured standalone, 22 trials: **68 to 191**, a 2.8x spread with the old
  ceiling 5% above its worst draw.
  **And it was not DISCRIMINATING either, which is the better reason to stop
  asserting it**: build 315's note measured fourteen STRANGERS at 152 to 227
  on the same reading, because every body steers at the same mount whether it
  flocks or not. So the ceiling straddled the draw AND the two populations
  overlap -- a bound that can neither hold still nor separate anything.
  What carries the claim instead is four ABSOLUTES, and the arm had been
  missing the two that matter: it printed "13 still flocking" while computing
  `left.length`, which is only "13 ALIVE". A school finds its members by
  SERIAL with no roster and no owner, so what a cut must not do is orphan
  anybody or leave a corpse in the set -- `held` (bodies on the field carrying
  the serial) and `mates` (what each survivor finds scanning) say that
  directly, and both read 13/12 in 6 of 6 runs while `far` swung 85 to 180 in
  those same six. `far` is a RUNAWAY bound at 420, about 2.2x the worst
  reading, and is reported rather than asserted tightly.
  **Proven to read a one, twice**, because a zero from an instrument that has
  never caught anything means nothing: push the destroyed body back into
  `world.enemies` and `corpse` reads 1; clear one survivor's serial and
  `held` reads 12 with `mates` at 0. The clean trial beside them reads
  13/12/0.
- **A CASE THAT PRINTS ONE QUANTITY AND ASSERTS ANOTHER IS A CASE NOBODY CAN
  READ.** That message said "still flocking" for a count of the living, so the
  arm looked like it was checking membership and was checking a death. The
  same shape as `kind: 'works'` and the `dive` dwell clock: **the declared
  meaning of a field and the quantity it measures are two different things**,
  and a detail string is a declaration.
- **AND `tail -45` ON A SUITE RUN THROWS AWAY THE ONE LINE YOU NEED.** The
  runner prints each case as it goes and the summary last, so piping through
  `tail` keeps the count and loses the FAIL. That cost a full 13-minute re-run
  to recover a single line. Redirect the whole run to a file and grep it;
  the count is worthless without the name beside it.

- **A THRESHOLD BELONGS IN THE GAP BETWEEN WORKING AND BROKEN, AND AIRBURST'S
  HAS NOW STRADDLED ITS OWN DRAW TWICE.** Build 315 replaced a single-body
  floor that straddled the draw (`oneAir > one * 1.3`, read 1.26) with a
  SEPARATION that straddled the draw (`crowd/single > 1.3`), and it failed
  again on 319 at **1.291** -- on a build whose changes cannot reach a pellet.
  Both ends measured this time, ten presses, three trials each: **working
  1.314 to 1.427** against **broken 0.942 to 1.032**, broken being the same
  arm with the burst radius gutted. The old 1.3 had 1.2% of headroom on the
  working side and 27% on the broken side, which is a threshold measuring the
  draw. 1.15 is 11% above the worst broken reading and 14% below the worst
  working one. **Measure the broken end too -- a ceiling fitted to the working
  distribution is fitted to the day's value, however honestly it was derived.**
- **...AND IT IS WORTH KNOWING WHICH HALF OF A RATIO IS THE NOISY ONE.** Over
  sixteen trials the CROWD ratio -- the thing the arm is named for -- reads
  2.025 to 2.038, and every bit of the movement is the single-body
  DENOMINATOR (1.417 to 1.644 at four presses). So a separation built to
  escape the noisy single-body reading put that same reading underneath it as
  a divisor. Four presses to ten takes the separation's spread from 0.19 to
  0.077, the 1/sqrt(n) the averaging exists for. **When a ratio flakes, ask
  which term is moving before averaging both.**
- **A CONJUNCT THAT CANNOT FAIL FOR THE REASON THE CASE IS ABOUT IS WORTH
  NAMING RATHER THAN TRUSTING.** That arm's `oneAir.took > one.took * 1.05`
  is documented as "the single body only has to gain something at all" -- and
  a gutted burst drew **1.062** on one of three trials, so it passes on a
  build where the node does nothing. Not the failing conjunct and not
  removed, because it is a cheap liveness floor; but the comment now says it
  does not discriminate, which is the difference between a belt and a belt
  somebody thinks is a brace. Same family as build 318's
  `dive * naive / dive` tautology, one degree less severe.
- **TWO MARGIN FAULTS IN ONE SUITE RUN, AND NEITHER WAS THE BUILD.** 319's
  content is a FLINT and a batch of draw-path corrections; the two cases it
  turned red were a SHOAL cloud radius and an AIRBURST separation, both set
  at the edge of their own distributions by earlier builds. That is what a
  change with no gameplay reach is FOR -- it is the one condition under which
  a red case is unambiguously the case's fault -- so the right response is to
  fix the margins properly rather than re-run for a green draw. Both were
  measured against their own broken readings before the thresholds moved.

- **THE PORTAL-BRAKE ARM'S HIDDEN FLOOR WAS AN ABSOLUTE, AND THE SUITE
  DEPRESSES IT BY MORE THAN SAMPLING EXPLAINS.** `hiddenMax >= cruise * 1.8`
  drew **1.755** on build 319, whose changes cannot reach a LURCHER; measured
  standalone over twelve releases the same ratio is **2.727 to 4.043**. That
  gap is too big to be the draw, so it was tested: driving the identical probe
  three and six frames per sample takes it 3.13-3.90 to 2.72-3.30, the right
  direction and not the whole distance. Something in five hundred cases of
  inherited state is slowing the spit-out and it was NOT run down.
  What made that unnecessary is dropping the absolute. `hiddenMax` and
  `atRim` come off the SAME body on the SAME run through the same sampling,
  and their ratio IS the arm's own name -- it slowed through the surface.
  Measured 3.05 to 5.55 standalone at every sampling rate tried and **2.47**
  on the suite run that failed, against about 1.0 for a surface that does not
  brake. **A within-body ratio survives whatever is scaling both terms; an
  absolute has to be right about the whole environment.** Third margin of
  this build's suite runs and the third one an earlier build had set at the
  edge of its own distribution.
- **`null <= x` IS TRUE IN JAVASCRIPT, so the conjunct about the rim passed
  for a body that never reached it.** `atRim` is initialised `null` and the
  arm read `atRim <= cruise * 1.2`, which `null` coerces to `0 <= 50` and
  satisfies -- so a release that never recorded a rim crossing passed the one
  test that is about the crossing. Both arms carry `atRim !== null` now. The
  same shape as `undefined > eraGate` answering ERA 1: a comparison against a
  missing value is a comparison that succeeds quietly.

- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.
