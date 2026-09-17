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
  and the ladder's AFFORDABILITY is a different claim. **IT PROVED NOTHING AND
  THE READING IS STRUCK -- see build 346.** It reported `buys` identical at all
  twenty rungs and the tier-20 loadout identical to the id; the probe funds a
  tier with the one line `w.bytes = spend`, build 286 renamed `world.energy` to
  `world.bytes`, and 283's `Game.buy` therefore reads a field that write never
  touches. Measured on a correctly served 283, that same probe reads **buys 0
  at every tier and pay 0 B**, so the 283 column was a table of `undefined`.
  What survives is the first half of the paragraph: a differential DOES need
  both builds in one container, and `--url` is still how.
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

- **THE SUITE MEASURED SEVERAL HUNDRED FIGURES A RUN AND THREW AWAY ALL BUT
  THE ONES THAT BROKE, WHICH IS WHY EVERY THRESHOLD FAULT COST AN
  INVESTIGATION.** `check()` stores `r.detail` for every case and the printer
  emitted it only on FAILURE. So to ask "is this margin near its own
  distribution?" you had to find the case, write a standalone probe, replicate
  its setup and sample it by hand -- builds 303, 305, 307, 309, 310, 315 and
  319 each paid that, and 319 paid it three times in one build. The figures
  were always there. `--json FILE` (build 320) writes the results array as it
  stands; off unless asked, because the human report is a list of names you
  scan for the word FAIL and a paragraph under each of six hundred passing
  lines would bury exactly that.
  **Two runs and a diff now answer the question.** Over three runs of one
  build, 694 arms partition: **562 byte-identical** (deterministic -- no
  fitted margin on one of those can ever flake), **123 whose figures move**
  (the entire population a margin can be wrong about) and **7 whose text
  SHAPE changes**. Of 665 assertion sites, 143 compare against a fitted
  decimal literal; intersected with the movers that is **52 arms** to rank,
  which is a reading list rather than a research project.
- **A MARGIN 6% FROM ITS OWN WORST DRAW, FOUND BY DUMPING THE FIGURES RATHER
  THAN BY WAITING FOR IT TO FAIL.** The yard wall's STASIS arm asserted
  `safeSpeed > cruise * 0.6` and the ratio drew 0.910, 0.970, 0.636 -- then
  0.633 on a later run, so two of six were within 6% of failing. The two
  bodies are measured in ONE run under ONE press at the same cruise, so the
  claim is their SEPARATION: **79x to 207x** over six runs against about 1x
  for either way of breaking it (shield ignored and both held; STASIS absent
  and both free). Bound 20 -- 4.0x clear of the worst draw and 20x clear of
  broken. The absolutes are KEPT and loosened to sanity floors, because they
  say what a ratio cannot: that one body is genuinely moving and the other
  genuinely stopped, rather than both drifting at a ratio of 20.
  Note the raw ratio can EXCEED 1 (1.44 measured) because `drive` is still
  accelerating the body when the window closes -- which is the tell that a
  floor expressed as a share of cruise was measuring the sampling moment.
- **WHEN A THRESHOLD IS CORRECTLY PLACED AND STILL FAILS, TIGHTEN THE
  DISTRIBUTION AND NOT THE NUMBER.** The ASSAY's AIRBURST bench has to fit a
  gap only 14% wide -- broken 0.98 to 1.03 (the burst too small to reach the
  rig's centre) against working 1.17 to 1.29 -- and its own note records it
  failing at 1.13. So 1.10 was in the right place and eight presses were too
  few. Sixteen: spread 0.12 -> 0.08, worst draw 1.17 -> 1.20, headroom above
  the bound 6% -> 9%, for about twenty seconds of synthetic time. Build 319's
  sibling arm took the same medicine (four presses to ten, spread 0.19 ->
  0.077). **Moving a threshold that is already in the gap makes it worse at
  one end.**
- **TWO MARGINS THAT READ AS FITTED ARE NOT, AND SAYING SO IS THE FIX.** The
  fuse arm's `|rose - want| < want * 0.1` is an IDENTITY taken off the config:
  the two track to 0.002 while their own absolutes swing 23%. And
  `stockCoreBand < 0.11` is a HARD bound -- `maxHp = round(hp * rand(0.92,
  1.1))` supports the deviation on [0, 0.100], so nothing can reach 0.11;
  widening `rand`'s range is the one edit that would make it wrong. Both now
  carry the derivation, because a correct bound that looks fitted is a bound
  the next reader "fixes".
- **AND ONE WAS LEFT ALONE ON PURPOSE.** The release gate's two ratios sit 9%
  and 19% from their bounds, which is the same signature -- but the effect
  size is proportional to a hold that swung **48.5s to 154.4s** across three
  runs, with the weakest separation on the shortest hold. That case has been
  re-sited on five consecutive builds and this file's own note says headroom
  beats sensitivity on it. Three samples is not a mandate to re-tune the one
  case with the worst history; recording the numbers is.
- **THE FAN-OUT SCORED ONE OF THREE, AND THE MEASUREMENT IS WHAT SAID SO.**
  Six read-only lenses over the 143 flagged margins returned three AT_RISK.
  One was the ASSAY bench -- independent agreement with a fault already found
  here, which is the useful kind. One claimed the banked-wreckage arm varies
  because "every input varies and nothing cancels", and six runs of
  BYTE-IDENTICAL detail refute it. And one flagged a SPALL/SPLINTER margin in
  a case that **does not run at all**: it sleeps behind `MINE_LINE`, because
  `CFG.mines.inPlay` is false. Plausible mechanism reasoning, wrong about
  whether it reaches the measured figure -- the rule this file already
  carries, now with an instrument to settle it in one query.
- **THIS INSTRUMENT ONLY SEES CASES THAT RUN, WHICH IS ITS BLIND SPOT.** The
  mine line's and the gun line's cases sleep behind their `inPlay` flags, so
  every margin inside them is UNMEASURED by a figure dump -- and would arrive
  unvalidated on the build that flips either flag back on. Build 289's note
  says turning a system back on should be a config flip rather than an edit to
  the guards; add to that, it is also a build whose thresholds have never been
  sampled. Run the dump with the flag on before believing that suite run.
- **A RELATIVE-SPREAD METRIC EXPLODES ON A QUANTITY THAT CROSSES ZERO.** The
  widest "mover" in the whole sweep was PULSE-against-ARMORED at 174%, which
  is `gunPlated` drawing -3.23 to 2.39 -- a range of 5.6 either side of zero,
  against a bound of 6.38 it has 2.7x of headroom on. Ranking by
  `(hi - lo) / max|value|` puts a perfectly safe arm at the top of the list.
  The ranking is a reading aid and the pairing of a literal to a figure in
  prose is fuzzy: it matched `0.3` in the STASIS case (enormous headroom)
  while the fault was on `0.6` in the same condition, and it matched HUSK's
  `0.5` against a number that is the mote control's own minimum quoted in the
  message. **Rank with the script, decide with your eyes.**

- **THREE RUNS OF A SUITE CANNOT SEE A REGIME THAT HAPPENS ONE RUN IN TEN, SO
  THE FIGURE DUMP RANKS BY THE WRONG THING.** Build 320's instrument ranks a
  margin by how few OBSERVED spread-widths separate it from its literal -- and
  observed is three draws. YOKE's delivered-rate arm was ranked **46 of 52**
  with 36 spread-widths of apparent headroom, because all three of its draws
  came from the same regime (probability 0.9^3 = 73%) and the spread looked
  like 3%. Measured properly, 20 releases: the rate spans **93.6% to 104.3%**
  of the authored spin against a window of [90, 105], and one draw in twenty
  came **0.7 points** from failing. So the dump narrows 143 candidates to 52
  and finds margins whose TYPICAL variation is near the bound; it is blind to
  the ones whose RARE regime crosses it. A targeted probe sampling the
  mechanism many times is the complement, not a luxury -- and the two together
  are what found this.
- **A GAIT THAT REPLACES THE ROUTE'S STEERING STILL INHERITS THE ROUTE'S
  SPEED, AND FOR A PAIR THAT MOVES AN AUTHORED ROTATION RATE.** `loiter` is
  the one route of six with a `dawdle` (0.55, weight 10 of 100) and `drive`
  applies it to its own local cruise past 260 units -- which lowers `flying`,
  lowers `authority`, and shrinks the `accel / 100` half of the `fight` term
  `pairOn`'s compensation treats as constant. Less fight than assumed is MORE
  delivered rotation: the two `loiter` draws of twenty were the top two, at
  99.8% and 104.3%. Build 318 recorded this shape for `dive` and put `dive`
  alone in `OWN_SPEED`, noting that `roll` and `flock` inherit it too but for
  them it is "a slower approach rather than a broken claim". For `paired` it
  is BOTH -- a slower approach, which is fine, and a perturbed rotation, which
  is an authored constant depending on a spawn roll.
  **Recorded and NOT acted on**, because the two fixes have different blast
  radii: adding `paired` to `OWN_SPEED` also makes the pair close faster
  (a balance change), and the mechanism-level fix is for `pairOn` to compute
  its `fight` from the cruise actually in play rather than assuming
  `accel / 100`. What the CASE does instead is pin the roll at the source.
- **PINNING `cruise` DOES NOT PIN THE DAWDLE, AND THAT WAS MEASURED RATHER
  THAN ASSUMED.** The obvious fix -- do what the three sibling arms do and set
  `cruise` on both halves -- reads 94.2% to 101.5% with `loiter` still the top
  draw, because `drive` multiplies its OWN copy of the cruise and never reads
  the field back. The roll has to be removed at the source
  (`release(..., { route })`), which reads 95.1% to 98.2% over 20 with the
  regime gone and the spread 10.7 points down to 3.1.
  **And the other obvious fix makes it worse.** Starting the window after the
  spin-up transient -- the reviewer's own second suggestion, and sound
  reasoning, since the 240-frame mean includes the rise from rest and biases
  low -- pushes the rate UP: 97.0% to 109.5% raw, i.e. straight through the
  105% ceiling. Two plausible remedies, both refuted by measuring them.
- **THE FAN-OUT EARNED ITS KEEP AND WAS WRONG ABOUT BOTH REMEDIES, WHICH IS
  THE RULE WORKING EXACTLY AS WRITTEN.** Six read-only lenses over 143 flagged
  margins returned three AT_RISK; an adversarial verifier then refuted two of
  them with real work (one modelled SPALL's pellet geometry closely enough to
  reproduce the recorded 35 and 62 to the unit) and could not refute the
  third, which it measured over 234 trials. That third is real and I had
  buried it at rank 46. But its named mechanism was the CRUISE roll and the
  driver is the ROUTE roll, and both of its proposed fixes fail when measured.
  **A fan-out's finding is a pointer to the right file; the mechanism and the
  remedy are still yours to measure** -- this is the clearest instance yet,
  because the finding was right, well-evidenced, and its remedies were wrong.

- **LATCH IS IN FROM BUILD 322, AND ALMOST ALL OF IT ALREADY EXISTED.** Phase
  6l, band 3, `gait: 'ride'` -- it ignores the machine, beelines at the
  biggest body on the field and rides it as a ball you can see and shoot.
  SEED has done exactly that since SCION shipped. What was new is that there
  are now TWO riders, and the rider's numbers were ONE shared block:
  `CFG.graft.grow` / `.tough` / `.regen` / `.hp` / `.life` / `.hunt`. So a
  second rider would have worn SEED's growth, toughening, healing and ball
  health in total silence, with no field to set and nothing to fail -- which
  is build 319's `plated` fault read FORWARDS (a second plated type would
  wear `CFG.flint`'s arc and slew rate) and build 224's `levels ?? 3` (eight
  nodes sold three times). The rule the split states: **a number about the
  RING is shared and a number about the RIDER is the type's**, because a host
  has one ring and two kinds can be standing on it. `ridesOf` throws for a
  `ride` type declaring none, all seven keys mandatory, and `check-build`
  holds it in both directions -- a `rides` block on a non-riding type is a
  field nothing reads, which is `kind: 'works'` again.
- **THE SPLIT HAD TO BE A NO-OP FOR SEED AND IS, TO THE BIT.**
  `refreshGrafts` sums each ball's own share where it multiplied a count, and
  for a ring of ONE KIND the sum is the old product exactly -- measured at
  n = 1, 2, 3, including the 1.7999999999999998 that `3 x 0.6` gives.
  Asserted with `===` on radius, ceiling, salvage and healing rather than to
  two decimal places, which is build 241's rule: a refactor that only
  reorders arithmetic is still a change and "to two places" cannot see it.
- **A BALL'S HEALTH HAS TO CLIMB WITH THE RUNG, AND THE FACTOR BELONGS WHERE
  THE GUARD IS.** `rides.hp` is what a tick costs at rung 1; `scaleToTier` is
  where the FOUR conditions live that decide whether anything is scaled (no
  director, harmless, fixed, a teach wave). So it writes `e.hpScale` and
  `graft` asks the rider BODY for it rather than restating those conditions
  -- a LATCH's ball is 40 at rung 1, 59 at 15 and 69 at 21 against a body of
  40/59/68, and a SEED's is exactly 26 at every rung because SEED is
  `harmless` and never scaled. That last part is why the whole split leaves
  SEED unchanged: the one number that could have moved cannot.
- **`drive`'S EARLY RETURNS ARE ORDERED, AND THE RIDER BRANCH SAT ABOVE THE
  STAGED MARCH.** Build 307's DRIFT finding verbatim, in a new branch, and it
  never mattered while SEED was the only rider: a SCION places its seeds
  mid-field and one is never `staged`. A LATCH comes down the portal, so
  without `&& !this.staged` it peels off at a host from the frame it appears,
  inside the throat. Proved by revert -- the guard is one `&&` and the arm
  could pass without it: reverted, a staged latch burns **2.0167s off its
  clock and drifts 58 units** toward a host it should not be able to see,
  against 0s and -12 of portal sway with the guard in. The harmless branch
  beside it has carried the same `!this.staged` since 307.
- **THE SALVAGE A RIDER LEAVES BEHIND WAS ITSELF A RIDER, AND IT GRAFTED.**
  `shed` builds every mote with `new Enemy(t, ...)` off the PARENT's type, so
  a mote off a LATCH inherits `gait: 'ride'` -- and a mote is not `staged`, so
  it went straight to `hunt`. Measured on a LATCH killed 160 units under a
  BLOOM: the mote climbed to it and **GRAFTED**, arming and healing the next
  body for free out of the salvage of the one you had just killed, `aboard` 1
  against 0 for a MOTE's and a LURCHER's motes dropped in the same geometry.
  Latent for the whole of SEED's life because SEED has `drops: 0` and has
  never shed one -- and it is build 307's finding with a far worse payload
  ("a mote off a DRIFT inherited `harmless` and wandered the band it was made
  in", the one object whose salvage you had to go and fetch). The harmless
  branch in `drive` has carried its own `!this.isDrop` since then for exactly
  this reason. The guard goes on the CAPABILITY (`type.gait === 'ride' &&
  !this.isDrop`) rather than at the branch, so a mote's clock is 0 and it is
  not offered as a host either. **Any new capability derived from a type owes
  the same question: what does a mote off this body inherit?**
- **A CASE THAT FAKES A CAPABILITY BY ASSIGNING FIELDS BREAKS SILENTLY WHEN
  THE CAPABILITY MOVES, AND ONE DID IN THIS BUILD.** The STASIS case's seed
  arm took a MOTE and wrote `seed.seed = true; seed.seedT = 99` onto it. Both
  fields were renamed here (`rides`, derived from the gait, and `rideT`), so
  the two writes became no-ops -- and the body under measurement was then an
  ordinary mote steering at the turret, which a STASIS also holds, so the
  RATIO still passed and the arm's entire subject was gone. Nothing failed.
  Spawn the body that HAS the capability (`debugSpawn('seed', ...)`) and
  assert the liveness beside the ratio: it is a rider, it is locked on the
  BULWARK it was given, and its own clock ran, in BOTH arms. Measured
  properly the real seed reads **94.9 u/s free against 1.4 held**, a factor of
  68 -- which is the "sixty-five times a held body" the note above that case
  has claimed since it was written, measured for the first time by the case
  that claims it. Same family as the build-318 grip counter: a proxy cannot
  see the thing it is a proxy for moving.
- **...AND NEITHER IS WHAT A RIDDEN BODY BREAKS INTO, WHICH IS OLDER THAN
  THIS BUILD.** `this.maxHp` and `this.armor` are what the ring has made of a
  body, and the promise of a ring is that shooting a ball off takes its share
  back -- so a QUARRY passing those to the three it fractures into is the
  share not coming back, permanently, out of a ring that no longer exists.
  Measured on a full ring: a SEED's three took the parent 459 to 1285 and
  each child from 118 health to **386**; a LATCH's three took the plate 0.22
  to 0.8 and each child from 0.121 to **0.44**; and the RADIUS is the third
  face of it -- a SEED-ridden QUARRY stands at 64 and its children came out
  at **38.4 against 24**, which is mass, hit size, salvage and one more
  generation before `splits.floor` stops the cascade. Health and radius have
  been leaking since QUARRY met a SEED in build 312 and the armour arrived
  with this build; all three are one expression: `graftBase*` is what the body was
  before any ball landed, taken after `scaleToTier`, which is exactly the
  figure a child should be a share of. Proved by revert (331 and 0.44 against
  118 and 0.121), and asserted against the parent's OWN pre-ring figures
  rather than against the unridden control, because `maxHp` carries a
  per-body 0.92-1.1 roll -- the arithmetic is exact that way and the control
  is what proves the expression itself. **A new field that feeds an existing
  derivation is the shape to sweep for**: this and the mote above are both
  `this.armor` / `gait` being read by code written before either could mean
  what it now means.
- **AN ARMOUR CEILING HAS TO BE REACHABLE OR IT IS A DOOR THAT NEVER OPENS.**
  `applyDamage` computes `dmg * (1 - plate)`, so flat armour from a ring is
  bounded or the body becomes unkillable: FLINT is the most armoured loose
  body at 0.55 and three latches at 0.2 reach **1.15**, every frontal hit cut
  to the `Math.max(1, ...)` floor. `CFG.graft.armorCap` 0.8 follows a stated
  rule (a fully ridden body still takes a fifth of what reaches it) rather
  than the day's arithmetic, and `check-build` asserts BOTH halves -- under 1,
  and the worst unclamped case over it. Build 198's rule: a clamp that can
  never clamp is a branch whose other arm is dead code. It bites at the
  SECOND latch on a FLINT, and measured on a BULWARK the delivered damage
  goes 66 / 46 / 26 / 20 of 100 across a ring of 0 to 3.
- **A MEASUREMENT THAT KILLS ITS OWN WITNESS MEASURES ONE SAMPLE.** The clamp
  arm hit a 676-health BULWARK for 1000 to read the armour off delivered
  damage. `applyDamage` returns on its first line for a dead body and `graft`
  refuses a dead host, so the armour column read **0.34 four times** and the
  damage column **660 / 0 / 0 / 0** -- a clean-looking table in which only
  the first cell was a measurement. Same family as the build-316 note about
  two bodies destroying each other inside one frame: isolate the mechanism
  instead of overwhelming it.
- **...AND A DIRECTIONAL PLATE IS THE WRONG WITNESS FOR AN OMNIDIRECTIONAL
  CLAIM.** The same arm was written on FLINT because FLINT sets the worst
  case, and FLINT is `plated`: whether a hit meets its armour at all depends
  on the angle between the damage and a face `Enemy.face` slews toward the
  machine. It read a 1000-point hit delivering **1000** through an armour
  field of 0.8 and was measuring the plate's direction. BULWARK is the most
  armoured body whose armour is all round, so what a hit takes away IS the
  number; FLINT's sequence is recorded off the field alone and `check-build`
  carries its arithmetic.
- **SAMPLE THE LAST FRAME THE STATE HELD -- build 301's rule, again.**
  `Enemy.update` clears `staged` on the frame the body passes the entry line
  and `drive` reads the flag inside the same frame, so the crossing frame is
  the first LOOSE frame however the two are ordered. The staged arm read
  **0.0167s** off the rider's clock -- one frame, on a build where the guard
  works perfectly -- until it counted only frames that were staged at BOTH
  ends, at which point it is exactly 0 and needs no tolerance.
- **A PINNED WAVE DOES NOT STAY PINNED -- build 310's rule, again, and it is
  now the second case to pay for it.** `Director.update` reshuffles its own
  order, so loading the LATCH wave and driving `g.update` measured whatever
  the rotation picked: the arm reported **drift, motes and SPINDLEs** for a
  wave of latches and BLOOMs, and both numbers looked plausible. The fix
  keeps the release and nothing else of the director
  (`d.update = function (w) { if (this.jobs.length) this.emit(w); }`), so the
  bodies still come through `emit` -> the portal, which is the door build
  309's EMBER fault lived entirely inside. Measured then: 7 latches and 5
  BLOOMs at rung 15, all 7 starting above the rim at 260 with `staged` true,
  rings of **3/3/1**, and no latch left loose.
- **THE GUIDE'S COUNTER WAS WRONG AGAIN AND THIS TIME IN THE OPPOSITE
  DIRECTION FROM FLINT'S.** Measured on a full ring of three, six seconds of
  auto-fire, host healed every frame so only balls can come off, three trials
  each: **BOLT 3->0, 3->1, 3->0; SCATTER 3->0 thrice; HE 3->0 thrice; one
  blast 3->0 thrice; SPINE 3->3, 3->1, 3->3; ARC 3->3 thrice.** So
  `docs/objects.html`'s "SPINE's splinters... take it off" is the one round
  measured here that does NOT -- its splinters are born at the exit and go
  outward from there, past a ring the round has already crossed. And my own
  first draft of the codex line was too PESSIMISTIC: it said the gun would
  not pick the tick for you, which is true of `autoTarget` and invites the
  reader to conclude ordinary fire is useless, when a round aimed at the host
  crosses the ring at 1.45r on the way in and clears it in about six seconds.
  What genuinely cannot touch a ball is ARC, because a chain jumps between
  BODIES and `hitGraft` is not on that path -- worth a sentence because it is
  a trap rather than an absence.
- **THE GUIDE'S COLOUR WAS LURCHER'S AT dE 0.0 AND THIS TIME IT WAS
  AVOIDABLE.** `#b98cff` is LURCHER's body colour exactly, and YOKE's. The
  standing ruling from builds 314, 315 and 317 is that the family is what the
  colour means and the palette has nothing well-separated left -- true, and
  it is why SHOAL wears MOTE's cyan and SPINDLE TOW's. But a FAMILY is a
  whole region and only one point in it was taken: swept over the violet band
  against every field tone in the roster, **`#bf5fff` is 11.8 off the nearest
  (SEED's GLOW, a halo rather than a silhouette), 14.8 off LURCHER's and
  SCION's glow and 29.1 off LURCHER's body**, and reads as plainly violet.
  Recorded because the sweep is the part worth not repeating: the
  best-separated violet available is `#4000ff` at 46.0 and is refused for
  reading as blue at the lightness a 9-unit body needs (a body is mostly its
  outline, build 199), and the best-separated colour anywhere is a dark green
  at 43.5, which means energy. **Before accepting a dE-0.0 collision, ask
  whether the family has room** -- three objects took the collision when at
  least this one did not have to.
- **A RENDER OF THE PLAY CANVAS IS THE rAF LOOP'S PICTURE, NOT YOURS.** The
  first sheet for this object drew bodies, called `g.draw()` and screenshotted
  the page: it came back with an empty field, because the page's own loop
  repainted between the draw and the shot. Same family as build 211's
  screenshot trap and build 298's free-running headless loop. Render into an
  offscreen canvas and `toDataURL` it, which is what every visual instrument
  in `scripts/` already does -- and then LOOK at it: the sheet is what said
  the hooked tick reads as a tick at r 9 and is nothing like SEED's plain
  disc, which no dE number can tell you.
- **`threatOf` CANNOT SEE WHAT A BODY DOES TO ANOTHER BODY.** A LATCH derives
  1.33 (its 40 health over `threatPerHp`) against the object guide's authored
  4, and the whole object is what it gives its HOST. That is FLINT's armour
  gap in a second costume and it is recorded rather than fixed, for build
  319's reason: weighting threat by anything but health re-prices every band
  in the game and belongs in a pacing pass, not in the build that adds the
  body. The wave is authored against band 3's own measured mean instead
  (20.47 against 20.9375, so -0.25%), which is build 315's lever.
- **A HOSTILE WITH NO TARGET NEEDS A CLOCK, AND THAT IS WHAT BEING A HOSTILE
  COSTS.** LATCH is deliberately not `harmless` -- `threatOf` weighs harmless
  at zero, five damage paths refuse a harmless body (so four of the five
  things that could take a tick off before it boards would refuse to), and
  `scaleToTier` returns on its first line for one, which would pin the ball
  at 40 health at every rung. The price is that a latch with nothing to ride
  counts against `standing()` and the build-291 release gate while it looks,
  and `wander` can leave it outside `autoTarget`'s cone -- build 312's
  `tumble` finding. `rides.life` bounds it: measured, 20.02s to expire with
  no host against 1.5s to board with one, which is the A/B that makes "it
  went away" mean something.
- **A TARGET SPEED IS NOT A SPEED, FOR THE FIFTH TIME -- and this one is
  deliberately NOT compensated.** `hunt` blends toward `cruise` at
  `k = accel / 100` against `integrate`'s damping, so a LATCH authored at 160
  delivers **136.4 against an arithmetic 136.5**. Builds 298, 308, 317 and
  318 all grossed theirs up; this one does not, because `hunt` is shared with
  SEED, nothing in the object's design is a clock or a ratio between two
  speeds, and compensating would move a body that has behaved this way for a
  hundred and fifty builds. The case RECORDS the arithmetic instead of
  asserting the ask. **The rule is not "always compensate", it is "know which
  number you are delivering"** -- the fault is a claim resting on a figure
  nobody measured.
- **THE RELEASE-GATE CASE HAS NOW BEEN REPAIRED ON SIX BUILDS AND THIS IS THE
  FIRST TIME THE CONFOUNDS WERE MEASURED RATHER THAN THE RUNG MOVED.** It
  failed build 322 -- whose content cannot reach it, proved by mechanism:
  `bandsFor(32)` is `[4, 5]`, `shuffle` replaces its candidate list with the
  in-band one, and the new wave is band 3, so the rotation and every
  `Math.random()` in it are untouched. Three things were wrong with the
  scenario and all three are the same rule.
  - **THE LOADED ROUND, which nothing set.** The case pinned the tree, the
    rung, the aim, the trigger and the fuse and left the AMMUNITION to
    whatever the six hundred cases upstream had selected -- and it is the
    largest single lever on whether the run needs rescuing at all. Swept, one
    round at a time, same everything else: **BOLT held 142.1s of 240 at a
    separation of 0.484, SCATTER 104.8s / 0.479, HE 81.5s / 0.715, SPINE
    64.4s / 0.625, TITHE 56.3s / 0.803.** The failing suite run read 53.5s
    and 0.954, which is off the TITHE end of that table: a gun that clears
    what arrives does not need the gate, the two arms converge, and the ratio
    walks to 1. The case's own docstring already required a build with
    "nothing that makes the gun hit harder".
  - **THE ROTATION, so the two arms played different waves.** `shuffle` draws
    its order with `Math.random`, and band 5's waves differ by a factor of
    two in what they weigh, so the A/B's two halves were not measuring the
    same field. Pinned to one deterministic order and asserted. Two wrong
    versions of that assertion first: requiring the two PLAYED lists to match
    fails outright, because playing fewer waves is the gate's whole effect
    (4 against 17); requiring the gated arm's to be a PREFIX of the loose
    arm's failed one run in four, because `begin()` goes through `admit()`,
    which splices the order it is walking. **What is assertable is the order
    the two arms were HANDED**, read at install time -- read out of `d.order`
    at the END of a run it disagrees four times in five, which is the
    rotation being consumed rather than being unfair.
  - **AND ONE RUN IS STILL A DRAW.** With all four pinned, five trials read
    0.674, 0.749, 0.532, 1.026 and 0.592 -- one in five over the ceiling.
    Three runs an arm, pooled, reads **0.530, 0.585, 0.626** over three
    trials against the same 0.95, and the per-run means are printed so the
    next reader sees the spread rather than inferring it. That is the rule
    this case has now been taught three times: measure a population, not a
    draw.
  **The general lesson is the diagnosis, not the fix.** Six builds of moving
  the rung were six builds of tuning a number; one afternoon of asking what
  the two arms actually differ in found three confounds, each bigger than the
  threshold's entire headroom. When an A/B flakes, enumerate what the two
  arms do NOT share.

- **CHAFF IS IN FROM BUILD 323, AND A COPY IS CHOOSABLE AND UNSHOOTABLE --
  WHICH NO MARK IN THIS GAME SAYS.** Phase 6m, band 4: it sits still, crosses
  a hundred units sideways in six substeps, and leaves a copy of itself
  standing where it was for a second and a half. That pair is the exact
  INVERSE of `staged` -- shootable but not choosable, and config.js says in as
  many words that it never gated projectile collision -- and a cousin of
  `spent`, which is drawn, unchoosable and has rounds pass through it. There
  is no combination of this game's existing marks that expresses it, because
  every mark it has takes a body out of the CHOOSER and the DAMAGE PATHS
  together.
  So a copy is not a body: `world.ghosts` is the eighth list. What
  `world.enemies` membership would have bought it, in one census -- the
  projectile sweep, `applyBlast` (HE, AIRBURST, PULSE, DECOY, PILE, WELL, two
  mines, a BLOOM's detonate), the mine trigger, WIRE, LANCE, WARD, a `Patch`,
  `checkContact` and `world.attackers`, the whole physics stack,
  `Enemy.update`, `Game.sweep` (which books the CODEX and the KILL),
  `hostileCount` and therefore the field cap and the release gate,
  `Director.standing` and therefore the wave verdict, `tagBody`, the STASIS
  brackets, `drawHitboxes` and the BELL's tick -- is a guard per entry, to be
  written and then maintained. Out of the list, none of them is: **the object
  is correct BY OMISSION**, and the one place in `src/` that reads the list
  for a decision is the second pass in `Game.autoTarget`. Measured, blast 0
  against 992.8 on a MOTE in the same place, a round 939 units past it for 0
  damage against stopping 74 short of a BULWARK for 17.2, every wave count 0
  and `Game.sweep` booking 0 kills.
- **THE OBJECT AS `docs/objects.html` SPECIFIES IT DOES NOTHING AT ALL, AND
  THAT WAS MEASURED BEFORE A LINE OF IT WAS WRITTEN.** The guide says the
  copies are read as targets and the assist "locks on, for the second and a
  half each one lasts". It does not: `autoTarget` scores
  `dist * (attacking ? 0.25 : 1)`, and a copy dropped where a CLOSING body
  used to be is strictly FURTHER from the machine than the body that dropped
  it -- over thousands of samples a copy was nearer than its own owner ZERO
  times, closest ratio 1.005. And the hysteresis makes it worse rather than
  better: `aimStick` protects the thing the gun is already on, which is the
  body that has just hopped AWAY (measured over 45 (offset, hop) arrangements
  in the real sequence, the copy took the lock in 3 of 45, all three on hops
  both strongly outward and flat, which a descending body does not make).
  So the copy INHERITS the lock at the instant of the leap, in the CHOOSER --
  `enemies.js` has no business knowing what the assist is holding, and each
  copy is offered it exactly once, on the first frame the assist looks. The
  A/B is that one line and it is as clean a switch as this repo has: same
  gait, same places, same clock, same `consider`, only `fresh` differs.
  Measured over six runs, 3 chaff and 3 LURCHERs, 330 frames: **0.280-0.358
  of locked frames and 0.250-0.375 of rounds at a copy, against EXACTLY ZERO
  with the inheritance off** and the copy population identical to within 7%.
  The control is an absolute zero rather than a margin: it is not that copies
  rarely win on distance, it is that they cannot.
- **...AND THE END-TO-END COST IS NOT DEMONSTRABLE, WHICH IS THE OTHER HALF OF
  THE FINDING.** The same six-body field cleared in 583.6 frames with the
  inheritance on and 570.8 with it off, twelve runs each, ranges 539-676
  against 466-683 -- +2.2% of means, straddling completely. The copies are
  only up during the hop phase and a whole clear is dominated by everything
  else, so a case asserting the clear time would be a threshold fitted to a
  draw. **The mechanism is unambiguous at the point of CHOICE and buried at
  the level of a clear**, and both halves of that are worth writing down
  rather than quoting the half that flatters the object.
- **A RADIAL HOP IS INVISIBLE TO THE GUN, so the slant is the object.**
  Measured, 100 rounds an arm, three trials, against a MARCH control moving at
  the hop's own mean speed: with the hop straight DOWN the field the miss
  share is **0.000 at 200, 300 and 450 units -- identical to the control** --
  because a quantised body's lead error then lies ALONG the line of fire and
  `resolveSegment` sweeps the round's whole step. Only the LATERAL component
  costs anything: at a lateral-to-drop slant of 0.6 the miss share is 0.107 at
  300 and 0.620 at 450, at 1.2 it is 0.240 and 0.797, at 2.0 it is 0.263 and
  0.770 and saturated. Hence `leap` is twice `drop`, and `check-build` refuses
  a slant under 1 with that measurement in its heading -- a gait the gun does
  not notice is not this object.
- **A CLOCK THAT MUST EXPIRE AFTER A FIXED NUMBER OF STEPS CANNOT BE A FLOAT.**
  `hopFor` counted down `leapT` seconds and every leap came out **130.44 units
  against an authored 111.80 -- exactly 7/6** -- because `0.05 - 6 * (1/120)`
  is 6.9e-18 rather than zero, so the burst lived a seventh substep. It counts
  SUBSTEPS as an integer now and the delivered displacement is `|dx|` 100.00
  and `dy` 50.00 on every leap at two update sizes. Two rules came out of it.
  The compensation has to be the **exact DISCRETE sum** -- `integrate` moves
  then damps, so a burst live for N substeps covers
  `v dt (1 - r^N) / (1 - r)`, and the continuous integral the other five
  compensations in this repo use is 0.23% out here, which would have been
  invisible. And the REST may stay a float, because half a substep of standing
  still costs half a substep; the distinction is measured, not stylistic.
  ("A target speed is not a speed" is now builds 298, 308, 316, 317, 318 and
  323, and the sixth is the first whose answer was an integral.)
- **A GUARD PLACED ABOVE A STATE MACHINE'S OWN EXIT IS A STATE ABANDONED.**
  The walk guard -- which refuses to start a leap near the machine, because a
  landing inside the overlap is fatal -- sat ABOVE the mid-leap branch. So a
  leap that crossed INTO the radius was abandoned rather than finished:
  `hopFor` stopped counting down, the raised cruise was never given back and
  the burst velocity was never zeroed, so the body coasted in at two thousand
  units a second under a speed cap of 2,268. Measured on the very first trace,
  **dead at frame 210 with `hopFor` frozen at 0.05 and `cruise` frozen at
  378** -- and the hand-back path had the same fault one field along, marching
  the body in at six times its own speed. Finish the leap first; the guard
  refuses to START one and its radius carries a whole leap's reach, so a leap
  that was legal to begin is legal to land.
- **A REVERT THAT DOES NOT REPRODUCE THE FAULT IS NOT A REVERT PROOF.**
  Cutting `walkPad` to minus one leap -- the guard reduced to the bare overlap
  -- leaves the body ALIVE, because the leap is twice as wide as it is deep and
  a body closing on the machine hops PAST it rather than onto it. The fault it
  was found by is in the ordering and cannot be reached from the config. What
  the case asserts instead is three absolutes (no leap STARTED inside the
  radius, no landing inside the overlap, the cruise handed back) plus the
  HAZARD measured on its own: a chaff put on the mount at the burst speed
  **dies in one frame** and the same body put there at its own 70 **lives on
  64 health**, which is the pair that says the speed is what kills it.
- **TWO CODEX LINES OFFERED A COUNTER OUT OF A SYSTEM WITH NO DOOR, AND ONE OF
  THEM WAS WRITTEN BY THE BUILD THAT WROTE THE RULE.** `CFG.mines.inPlay` has
  been false since build 289. SHRIKE's line (317) said "put a mine on the line
  it has already shown you" and FLINT's (319) said "a mine it walks squarely
  over included" -- and FLINT's own comment carries a paragraph refusing to
  name an emplacement for exactly that reason, one sentence above the mine.
  **A rule written down is not a rule applied**: the reasoning was on the
  screen and did not reach the two words beside it. Both corrected here, the
  measured finding behind FLINT's (a mine triggers up-field of the body and so
  always lands on the plate) kept in the comment rather than offered as an
  answer, and CHAFF's line names PULSE instead -- radial from the machine, so
  it never picks a target at all.
- **MEASURE THE LAST FRAME THE STATE HELD -- fourth time, fourth quantity.**
  The staged arm read ONE copy on a build where the guard works, because the
  loop exits on the frame `staged` went false, `Enemy.update` clears it before
  `physicsStep` runs `steer`, and the body's first loose hop had already
  happened. Sampled inside the window it is 0 copies and neither hop field
  written, with the same body once loose as the control.
- **A DETAIL STRING IS A DECLARATION.** The round arm asked whether the
  projectile vanished within 60 units of the target's CENTRE -- and a bolt
  stops on the near SURFACE of a 45-unit BULWARK a whole step out, so it read
  74 and the message printed "CROSSED" for a round that had just taken 17.2
  health off it. Test the DAMAGE and the minimum y reached. Same family as
  build 319's "still flocking" printing a count of the living.
- **THE HASH DID NOT MOVE AND THAT WAS THE PREDICTION**: `1213474222` either
  side, both taken in this container. It is the right instrument here and not
  a formality -- `Game.autoTarget` was refactored so the cone, the reach and
  the weight are one `consider` applied to two lists, and that runs on
  `fight.mjs`'s own hot path with the assists on. An unchanged hash is what
  "bodies are unchanged to the operation" looks like measured. The band-4 wave
  is invisible to it for build 318's corrected reason.
- **The wave costs band 4 nothing, deliberately.** Three chaff and three
  LURCHERs weighs 24.50 against that band's own mean of 24.8925, so the budget
  moves **-0.175%** -- build 315's lever used on purpose. LURCHER is the
  partner rather than the MOTE that prices identically, for two reasons: MOTE
  wears CHAFF's exact family colour (the guide's `#7ef9ff`, dE 0.0), and a
  LURCHER closes and GRIPS, so the thing filling the glitch fuse is walking on
  while the assist spends itself on copies. And `threatOf` is health-only, so
  it prices a chaff at 2.00 where the guide authors 4: what CHAFF costs is the
  ASSIST, which the budget can no more see than it can see FLINT's armour or
  what a LATCH gives its host. Recorded, not fixed.
- **The cyan family had ROOM, which is the rider build 322 added to the
  shared-hue ruling.** `docs/objects.html` gives the swarm family `#7ef9ff` --
  MOTE's body colour and SHOAL's, dE 0.0 against both. Swept across the cyan
  band against every field tone: `#00b0e6` is 15.8 off the nearest (MOTE's and
  SHOAL's GLOW), 14.8 off MOTE's body and 22.1 off LANTERN's glow, inside the
  15-23 this repo documents as working. The silhouette carries the rest,
  measured on the alpha channel alone: **121 from a MOTE, 135 from a SHOAL
  dart, 172 from a NEEDLE**. A family is a region and only one point in it was
  taken -- ask before accepting a dE-0.0 collision.
- **A COMPLETENESS COMMENT INVENTED A READER AND CREATED FOUR DEAD FIELDS IN
  THE SAME BREATH.** The copy object carried `hp`, `maxHp`, `angle` and
  `fizzle` under a paragraph calling the fields "deliberately complete" and
  naming `drawBearings` as the reader that would draw a non-finite path
  without `vx`/`vy`. **`drawBearings` iterates `world.enemies` and cannot see
  `world.ghosts` at all**, and nothing read the other four either. So that is
  `kind: 'works'` (eighteen builds) and `large: true` (fifteen types) arriving
  in brand-new code with an inaccurate comment on top -- and build 313's dead
  field sweep cannot see it, because that sweep is over `ENEMY_TYPES`. The fix
  is the rule this repo already has: enumerate the readers, delete what has
  none, and name each reader in the comment. What actually reads a copy is
  `consider` in `autoTarget`, `Game.aimLead` (through `target.vx || 0`),
  `Game.drawAutoLock` -- the reticle landing on a copy, which is the object
  made visible -- `updateGhosts`/`drawGhosts`, and the inheritance's own two
  fields. **Defensive completeness on a new kind of thing is how a dead field
  is born**, and it reads as care.
- **...and a copy has no health, so "it took zero damage" is not the
  assertion available.** The stronger one is: a 1000-point blast with 3,000 of
  impulse, centred ON a copy, leaves it identical in every field it has and
  still in the list, while the same blast kills a MOTE in the same place. A
  test written against a field that does not exist reads `undefined - undefined`
  and asserts `NaN === 0`.
- **RENDER IT AND LOOK -- and the first two renders showed NO COPIES on a
  working build.** Both ran a fixed number of frames and then screenshotted,
  and a chaff stops hopping when it reaches the walk radius: at 200 and 400
  frames the body was already walking and every copy had expired, so the
  probe reported the feature missing. Break on the CONDITION (`ghosts.length
  >= 2`), never on a frame count, when the thing you want on screen has a
  window. Same family as the end-of-window trap, on a screenshot.
  What the sheet then showed is that the picture is fine, measured off a
  offscreen canvas at the field's own scale: a copy peaks at **154 of 255 at
  birth, 129 / 99 / 67 / 39 at a quarter, a half, three quarters and 0.95 of
  its life, against the body's 230** -- visible, clearly the same shape, and
  clearly the fainter thing. The cluster of one real and three copies reads
  exactly as the object's sentence. A first crop read as "barely visible" and
  was a MOTE and the lock reticle sitting on top of the chaff.
- **A CONJUNCT AT A HARD BOUNDARY IS WORSE THAN ONE WITH A TIGHT MARGIN, AND
  THE ORDINAL ASSISTS CASE CARRIED ONE.** `r.inner < 1` requires the fight to
  have got past the outer frame and started on the SECOND one inside 85
  seconds -- and `shellFrac(1)` is exactly 1.00 until something touches that
  frame, so the reading is a boundary and not a margin. Measured standalone
  over six runs: **0.50 / 0.56 / 0.75 / 0.81 / 0.81 / 0.88, never 1**; in the
  suite it drew 0.75 on one run and **1.00 on the next**, on two builds whose
  only difference was two comments. The case's own docstring already records
  removing the identical fault from the CORE -- "asserting on the core here
  was asserting on the length of the fight by accident" -- so this is that
  paragraph's own lesson, one frame along, surviving beside it. What carries
  the claim is the outer frame (0.08-0.17 against a 0.4 ceiling, 2.4x), stage
  II being reached, and the garrison getting out 12 of 12; the inner frame and
  the core are reported.
  **The channel is not established and the fix does not need it.** Build 315's
  note says adding a wave re-rolls the whole suite's randoms and `restart()`
  here goes through `shuffle`, which is the likely cause -- but that is
  inference, and the suite's own rAF loop riding on top of synthetic steps is
  the other candidate (build 310 and 314). Either way a length claim does not
  belong in a progress case. **When a conjunct's quantity has a floor or a
  ceiling it can sit exactly on, it is not a threshold to tune -- ask what
  claim it is really making.**
- **A CEILING INSIDE THE WORKING DISTRIBUTION, AND WORSE, ONE THAT CANNOT TELL
  WORKING FROM BROKEN.** The FILAMENT station arm bounded the worst follow gap
  at five times the follow distance -- 150 units, set at build 310 against a
  worst of 95.6 over twelve standalone runs and called 1.57x clear. Build 323
  drew **153.7** in the suite, and sampling it properly says the tail is
  BIMODAL rather than merely wider: eleven readings across the suite and eight
  standalone runs are 41.4, 44.4, 47.7, 48.4, 49.1, 49.5, 50.0, 59.0 and then
  **134.8, 137.3, 153.7** -- three draws in eleven in a high mode that twelve
  runs happened to miss. Build 321's finding verbatim, on a different case.
  **And the serious half is that it did not discriminate.** Measured with
  `CFG.chain.grip` at 0 -- the correction cap off, the nearest thing to this
  controller broken that the config can express -- gapMax reads **83.3, 104.2,
  75.5, 96.4, i.e. BELOW the working build's own high mode**. So the bound
  could never have told the two apart, and the reason is mechanical:
  **velocity matching alone very nearly keeps station**, and the correction
  closes the last of it rather than holding the line. That is worth knowing
  about the mechanism and it is only visible from the broken end.
  Derived from the FIELD now, which is the scale the word "runaway" is about:
  a third of `world.floorY` is 408 against a worst working draw of 152-154,
  2.6x clear, while a follower that had stopped following crosses the whole
  963-unit column. Five trials green with the high mode present in the sample.
  It is NAMED as a sanity ceiling rather than trusted as a discriminator --
  build 319's rule about a conjunct that cannot fail for the reason the case
  is about -- and what carries the claim is the two absolutes beside it: no
  bead lost to the formation, and the health reading shown able to move.
  **Measure the broken end. A bound whose two populations you have never
  compared is a bound you do not know the meaning of**, however honestly the
  working side was sampled.
- **THREE PRE-EXISTING MARGINS FELL OUT OF THREE SUITE RUNS OF ONE BUILD, AND
  ALL THREE WERE SINGLE-DRAW QUANTITIES WHOSE OWN COMMENTS ALREADY RECORDED A
  RANGE.** The third was the ORDINAL salvage arm: it spawned ONE drop of each
  type and asserted it closed more than 45 units in a second and a half, and a
  drop is born with an outward velocity it has to shed first -- one random
  roll. Four runs read the mote at 139, 75, 124 and then **41**. The comment
  above it had already written the range down as "59 to 155" and lowered the
  floor from 60 to 45 in response, which is a population being described as a
  measurement and then answered by moving the number. Six of each and the
  MEAN: six trials read ordinal 109-122, tally 104-134, mote 105-123 against
  the same 45, with the per-drop spread (56-157) printed so the next reader can
  see why one was not enough. Build 309's HUSK control is the identical fix.
  **The pattern is the finding.** A build whose gameplay reach is a new body in
  band 4 turned up three arms on their own boundaries in three runs, one per
  run, each passing in the other three -- because adding a wave re-rolls every
  `Math.random` downstream of `shuffle` (build 315) and a single-draw arm is a
  coin toss the moment its stream moves. The tell they share is not a tight
  threshold: it is a claim about a BEHAVIOUR resting on ONE sample. Grep for an
  arm that spawns one body and asserts a distance, a speed or a share.
  Ranked the four runs' figure dumps afterwards: **147 of 706 arms move**, and
  going further than the three that actually failed is a margin-hardening pass
  rather than this build's business -- recorded so the next audit starts from
  the dumps rather than from a blind re-run.
- **THE PLAN SAID CHAFF "EARNS DEEP ARRAY AND OPEN SIEVE" AND IT IS FALSE, ONE
  OF THEM BACKWARDS.** Measured after build 323 shipped, three trials each, 3
  chaff and 3 LURCHERs over 330 frames -- the share of the assist's locked
  frames spent on a copy: stock 0.305 / 0.322 / 0.333; **DEEP ARRAY** (two
  levels, reach 400 -> 841) **0.358 / 0.397 / 0.367**, separated with no
  overlap and in the WRONG direction, because `aimRange` IS the `reach` in
  `consider`, so doubling it admits more copies along with more bodies;
  **OPEN SIEVE** 0.269 / 0.322 / 0.273, overlapping stock, because it lifts
  the `harmless` filter and a copy is not harmless. The ROUND share separates
  for neither at three trials, so only the frame share is claimed.
  Two things worth carrying. **A plan row that names a mechanism as
  load-bearing is a claim, not a design** -- this one says "three of them are
  load-bearing for other parts of this plan and should not be moved", and the
  linkage had never been measured. And the two upgrades DO exist, which an
  earlier note of mine had wrong: they are the level-2 TIER NAMES on
  `aimrange` (ARRAY) and `driftaim` (SIEVE), not ids -- `grep` for the id and
  you find nothing, which is how the wrong note got written.

- **REMNANT IS IN FROM BUILD 324, AND THE OBJECT IS THE ACCOUNTING RATHER THAN
  THE BODY.** Phase 6n, band 5, and the first of the twenty whose whole
  content is at its death and after it. Destroyed it pays nothing, counts
  nothing and leaves a mark where it died; six seconds later ONE body comes
  back out of the portal at half health and 1.4x speed, once, and that one
  pays double.
- **THE GUIDE'S COUNTER IS FALSE AND MEASUREMENT SAID SO BEFORE A LINE WAS
  WRITTEN.** `docs/objects.html` reads "the second arrival is the one to be
  standing ready for". Measured at the rungs band 5 is actually played on
  (29 / 32 / 35) with all 109 buys owned: a full REMNANT dies in
  **0.70 / 0.80 / 0.75s** and the re-formed body in **0.53 / 0.58 / 0.53** --
  almost all of which is the round's flight time, since 170 effective health
  is four hundredths of a second of the 4,700 dps a bought turret sustains.
  It arrives at HALF a dead body's health onto a field carrying 30-58 bodies
  (build 301's measurement), so the second arrival is strictly LESS of an
  event than the first. **And "one or two" is a PROPORTION, not a count**: a
  wave's counts are a budget from build 301 and band 5's own roster swells an
  authored entry 9.5x to 10.2x at rung 32, so `['remnant', 2]` is about
  TWENTY remnants in play -- any reading of this object that depends on there
  being one of them is a reading of a wave the game does not send. What
  survives is the sentence the guide leads with, a kill that is not a kill:
  `Director.standing` counts a pending return as a body still standing, so
  the wave cannot score while one is owed. That is a TEMPO cost rather than a
  damage one, and the twenty clocks run CONCURRENTLY, so it is bounded at
  about one `back` per wave however many are in it -- six seconds against a
  band-5 wave of 52 to 120, which is 5-10%. **The honest size of a mechanism
  is part of the mechanism**, and the codex line says it rather than
  inheriting the guide's sentence.
- **"PAYS FOR BOTH" IMPLEMENTED BY DOUBLING THE DROP COUNT PAYS EXACTLY
  1.0000x.** `shed` computes ONE `worth = max(n * q, round(mass * perMass / q)
  * q)` off the body's own mass and then divides it by `n`, so 6, 12 and 24
  motes all totalled **24,000 B to the byte**. `bounty` is the dial --
  `mote.bounty = this.bounty` and `destroy` banks `bytes * bounty` -- and
  `pay: 2` measures 48,000 B in six motes against a control's 24,000 in six,
  with 4.0000x at four. The tell is that the obvious implementation moves a
  COUNT where the quantity is a total; the same shape as `drops` being the
  only dial a light body has, from the other side.
- **A FIELD NAMED FOR A METHOD ON ANOTHER CLASS BLINDS THE DEAD-FIELD
  SWEEP.** The first name was `reform`, and `Boss.reform` and `Boss.revive`
  both exist -- build 313's sweep looks for `.key` or a quoted string
  anywhere in `src/` outside config.js, found `this.reform(...)`, and passed
  the build for a type field nothing read. Renamed `respawn`, which has zero
  other hits, and the sweep then failed the build correctly. That sweep errs
  toward PASSING by design, so **the shape to avoid is a field name that is
  also a method name anywhere in the tree** -- grep the candidate before
  declaring it, the way build 298's `bornFor` had to be grepped against the
  boss modules.
- **THE THREE NUMBERS ARE ON THE TYPE AND NOT IN `CFG.remnant`.** Build 319's
  `plated` fault and 322's `rides` fault read FORWARDS for once: a second
  type declaring the flag would have worn REMNANT's clock, health share and
  speed in total silence, with no field to set and nothing to fail. `back`,
  `hp` and `quick` are a `respawn` block on the type, `respawnOf` throws for
  a missing or malformed one (17 of 17 refused), and only the MARK stays
  shared -- because a mark is how this game says "a return is pending" and
  two types that came back should say it the same way.
- **`threatOf` HAD TO LEARN ABOUT IT, AND THAT IS THE THIRD INSTANCE OF ONE
  RULE.** The health a player actually shoots for one remnant is 300 plus
  150, so it weighs **15.00 against a nominal 10.00** -- the same rule as a
  TOW counting what it drags and a QUARRY counting what it becomes. A band
  that thinks it is buying 300 is a band paying for two thirds of what it
  gets. The wave is then authored at band 5's own mean (35.20 against
  35.2367, moving the budget **-0.0095%**), which is build 315's lever used
  deliberately.
- **A `const` DECLARED BELOW `threatOf` IS IN ITS TEMPORAL DEAD ZONE.**
  `RESPAWN_KEYS` went in under `respawnOf` beside the other helpers and the
  game did not boot: the tree's price sweep calls `threatOf` at MODULE LOAD,
  so the reference ran before the declaration was initialised. Exactly the
  trap `CFG`'s authoring helpers carry a note about (`const` arrows below a
  four-thousand-line object literal), on a different file and a different
  caller. Anything reached from module load has its dependencies above it.
- **BUILD 322 BOOKED A LATCH THAT RAN OUT OF CLOCK AS A KILL, AND IT WAS
  FOUND WHILE LOOKING AT SOMETHING ELSE.** `hunt` set `this.dead = true` when
  `rideT` expired and did NOT set `dissolved`, so `Game.sweep`'s
  `if (e.counts && !e.dissolved) registerKill(e)` counted a rider that never
  found a host -- inflating the kill count and the wave's own cleared share
  for a body that simply went away. `dissolved` is the mark for "eaten, not
  destroyed" and the two harmless gaits that leave the field have carried it
  since build 307. Fixed and measured: **0 kills against 1 for one that was
  shot and 0 for an EMBER that climbed out**, which is the pair that says the
  counter can read a one. **Any new way for a body to stop existing owes
  `Game.sweep` an answer about which of the two it is.**
- **A PENDING RETURN IS THE WORST THING A CASE CAN LEAVE BEHIND, because it
  holds an OLD WAVE SERIAL open.** `standing()` counts a promise by `wave`,
  so a stray entry can leave a later case's wave permanently one body short
  of ending -- worse than build 307's stray EMBER, which only sprang mines.
  `debugClearField`, `reset()`, `takeField()` and `glitchOut` all clear
  `world.respawns`, and the case clears it in its own setup as well. The
  ninth list on the world is the ninth thing that has to be on that list.
- **THE HASH DID NOT MOVE AND THAT WAS THE PREDICTION**: `1213474222` either
  side, both taken in this container. A band-5 wave is invisible to a rung-1
  fight for build 318's corrected reason, and the `destroy` rewrite is the
  IDENTITY for every type that does not come back -- `owing` is false, so the
  drop count is the old expression. An unchanged hash is what "the salvage
  path was rewritten and no existing body noticed" looks like measured, which
  is the same claim build 312 made about its own quantised share.

- **THE HOLE TAKING A REMNANT WAS A ROBBERY, AND `openAperture`'S OWN
  DOCSTRING IS THE THING IT CONTRADICTED.** That function takes everything
  loose the frame the way opens -- `e.counts = false; e.destroy(world);` --
  and says why in as many words: "it pays out its salvage exactly as shooting
  it would have. So it is not a robbery -- opening the way mid-wave banks the
  wave." Measured with an aperture granted and one body on the field, the hole
  took a REMNANT for **0 bytes in 0 motes** against a LURCHER's 16,000 in 8
  and a DRIFT's 4,000 in 2 -- and left a promise behind, which then froze for
  the whole fight. Revert-proved both ways. **`this.counts` is the clause that
  tells the two deaths apart**, borrowed for its MEANING rather than for a
  side effect (build 234's `harmless` distinction): the hole's own comment
  beside that assignment reads "you did not destroy it, the hole did", which
  is exactly the question the branch is asking, and the only other writers are
  boss minions and the practice dummy. Read before the write, or the shed
  block downstream sees the mutated value.
  **The general shape: a new death-time effect has to be run past every
  caller of `destroy` that is not a player shooting something.** There are
  three -- the glitch dissolve (covered by the existing `fizzle` guard on
  `destroy`'s first line), `debugClearField`, and the hole -- and only the
  first two were thought about. A green suite could not see it: nothing in
  seven hundred cases opens an aperture onto a field it put a body on.
- **A MOTE OFF A REMNANT INHERITS `type.respawn` AND CANNOT USE IT, AND THAT
  IS WORTH ASSERTING RATHER THAN REDISCOVERING.** `shed` builds every mote
  with `new Enemy(t, ...)` off the parent's type, which is build 322's LATCH
  fault -- so a mote carries `respawn` and `cameBack` false. `destroy` returns
  for `isDrop` forty-five lines above the branch, so it can never reach it,
  measured 0 promises from destroying one and from a blast over six of them.
  **Build 322's answer was a guard; this one is a door that was already
  shut** -- which is the better outcome and only knowable by checking.
- **THE SIX SECONDS ARE THE DIRECTOR'S CLOCK, AND THE FREEZE IS THE DESIGN
  RATHER THAN BUILD 210'S SCAR.** `updateRespawns` is called from
  `Director.update`, below its `if (world.phase !== 'staging' || world.boss)`
  guard -- so a promise freezes while a boss is up. Measured through the real
  door (`g.update` after a real `openBoss`): ten seconds of an ORDINAL fight
  with the clock at **0.00 of 6** and no body arriving, then the same promise
  landing **6.02s** after the withdrawal. The pair is what makes it an
  instrument -- a clock at zero is indistinguishable from a promise that was
  never going to arrive, so the same promise has to be carried past the
  withdrawal and land. It is right BECAUSE the promise is the director's and
  the director is frozen while a boss is up rather than reset, which is the
  doctrine `Game.openBoss` states about `jobs` and `at`. The alternative
  placement -- unconditional, beside `updateGhosts` -- re-forms a band-5
  hostile into an anomaly's field.
- **`patience` IS A SECOND WAY OUT OF A WAVE AND I WROTE A DOCSTRING THAT
  DENIED IT IN THE SAME BREATH AS NAMING IT.** `standing()`'s new term said "a
  return can never land after its own wave is scored, because its wave cannot
  score while it is pending" and then, two lines later, "`patience` (26s)
  bounds the wait". Both cannot be true: the wave-end test is
  `if (this.standing(world) > thinAt && this.wait < CFG.waves.patience)
  return;`, so at 26 seconds the wave scores WHATEVER is standing -- which is
  the whole purpose of that clause. Left as it is, and the reason is that
  build 291's leftover class is about bodies nothing bounds: this one is in
  `world.enemies`, so `hostileCount` sees it and the release gate holds the
  next wave exactly as for any other body, and what is actually lost is one
  `d.slain` credit on a wave already scored. Clearing the promise would be the
  robbery again; re-tagging the arrival would bill a wave for a body it never
  asked for, against `tagBody`'s own rule. **A paragraph that names its own
  bound and then claims the bound is never reached is two claims, and one of
  them is wrong** -- check a docstring's sentences against each other, not
  only against the code.
- **...AND THE SAME PARAGRAPH STATED A CEILING AS A COST.** "The clocks run
  CONCURRENTLY, so the cost is one `back` per wave however many remnants are
  in it" -- the clocks are concurrent and they START ON THEIR OWN DEATHS,
  which are spread across the wave, so what a wave pays is `back` after the
  LAST remnant death: at most one `back` and usually nothing. The arithmetic
  was right and the noun was wrong.
- **REMNANT DELIVERS 21.9 TO 28.0 u/s AGAINST AN AUTHORED 36, and it is
  deliberately NOT compensated.** Twelve samples over two runs, mean about 26,
  against an arithmetic steady state of 24.7 from
  `speed * k / (k + linearDamping)` with `k = accel / 100` -- the spread above
  the prediction being the route's lateral and `wobble`, which add to the
  speed's MAGNITUDE without adding closing speed. That is the seventh time
  this repo has met "a target speed is not a speed", and as with LATCH the
  answer is to know the delivered figure rather than to gross it up: nothing
  in this object is a clock or a ratio between two speeds. **The rule is not
  "always compensate", it is "know which number you are delivering"** -- and
  the corollary, learned here, is that the arithmetic is a STRAIGHT-LINE
  prediction and a body with a route and a wobble reads above it.
- **RECORDED AND NOT TUNED: the remnant wave is the longest in band 5.**
  Modelling a wave as release window plus slowest traverse plus the return
  tail -- inference on top of measurements, labelled as such -- the era-2
  1481-unit column at 26 u/s is about 57 seconds, which puts the wave over the
  120s cap at all three sampled rungs where the band's next-longest is under
  it. Band 5 already misses that cap at four of seven rungs on the era-2 field
  (build 306), so this is a small marginal worsening of a documented plateau
  and the lever, if it is ever wanted, is `speed`. Authoring a balance answer
  in the build that adds the body is the mistake build 304 deliberately did
  not make; the number is in `CFG.remnant` for the pacing pass.
- **A SCOUT FAN-OUT SCORED TWO REAL BLOCKERS OUT OF FIVE LENSES AND MISSED
  THE ONE THAT MATTERED MOST.** It called the `threatOf` under-pricing and the
  clock's placement before a line was written, both correctly and with the
  arithmetic. It did NOT find the hole -- which is the only one of the three
  that shipped wrong and the only one a green suite could not see -- and its
  wave lens asserted the opposite of what the shipped design does (that the
  wave scores with the second half owed), because it was reading a design that
  had not been built yet. **A pre-implementation fan-out is a pointer to the
  right files and a list of doors to check; the doors it does not name are
  still yours to find.**

- **THE MARK FADED AS THE RETURN CAME DUE, WHICH IS BUILD 211'S HE BURST IN A
  NEW COSTUME.** `drawRespawns` ran its alpha on `k = 1 - t / life` -- full at
  the death, gone by the arrival -- so the one moment the mark matters was the
  faintest frame of it. Rendered on an offscreen canvas at five points of the
  clock and measured on the ALPHA channel: peak **95 / 133 / 106 / 79 / 58**
  of 255 and lit area **359 / 782 / 1151 / 1245 / 0** -- at 0.95 of the life
  NOTHING on it cleared the threshold. Fixed (`due = t / life`, alpha
  `0.5 + 0.45 * due`, the ground ring's own alpha 0.5 -> 0.72) the same
  instrument reads **92 / 133 / 157 / 182 / 201** and **357 / 830 / 1318 /
  1822 / 2226**, monotone in both, and composited over the field's ground the
  peak goes 92 to 206. Nothing could fail for it -- the ring is drawn, the arc
  is drawn, both are the right colour -- and **only rendering it and looking
  finds it**, which is the fourth time in this build a fault lived somewhere
  seven hundred green cases cannot see.
- **AN INSTRUMENT THAT DIVIDES OUT THE QUANTITY THE CLAIM IS ABOUT READS THE
  SAME ON EVERY BUILD.** The arm's first version measured `max(r, g, b)` off a
  canvas with nothing painted behind it and reported **255 at every point of
  the clock** -- because a stroke composited against transparency comes back
  at full colour with low alpha. The claim is an ALPHA ramp and `globalAlpha`
  scales exactly that channel, so reading the alpha measures the claim and
  divides the tone out by construction, which is build 314's rule arriving on
  a new quantity. Either paint the ground you are compositing over or measure
  the channel that moves.
- **A DETAIL STRING THAT ASSERTS ITS OWN CONCLUSION CANNOT REPORT A FAILURE.**
  That arm printed "-- monotone in both" as literal text, so the FAIL line
  said the sequence was monotone while showing a sequence that was not. It
  prints the measured flags now. Build 319's "still flocking" printing a count
  of the living is the same fault; a detail string is a DECLARATION and it has
  to be derived like any other.

- **A BOSS TEARDOWN ENTERED THE BOSS IN THE GLOSSARY, AND THE TITLE SCREEN
  CALLED THAT A RECONCILIATION.** Build 325. `Game.sweep` is
  `if (!e.dissolved) noteDestroyed(e)` then
  `if (e.counts && !e.dissolved) registerKill(e)`, and `Boss.clear` -- the
  door `withdrawBoss`, `endBoss`, `reset()` and `openAperture`'s teardown ALL
  come through -- wrote a bare `dead = true` on every part, the core and the
  parked garrison. The TALLY was never at risk and that half is worth
  recording: structure carries `counts: false`, measured at **0 kills booked**
  for ORDINAL's 41 parts and TERMINUS's 29, so the hypothesis I opened with was
  refuted by the first probe. The GLOSSARY was the fault. Measured either way
  in one container with the record wiped first: a WITHDRAWAL left
  `world.reconciled` **empty** and the codex holding `ordinal` and `tally`; a
  WIN left `reconciled: [1]` and the codex holding the same core.
  Indistinguishable.
  **One reader made it player-visible.** The title screen's RECONCILED tile is
  `ANOMALIES.filter((a) => codex.has(a.types[0])).length`, under a docstring
  reading "having the core in the codex is having taken it apart" -- so it said
  1 RECONCILED on a device that had abandoned one fight, which is VERBATIM the
  sentence build 299 wrote that same docstring to stop. 299 moved the tile off
  any-anomaly-body onto the core; the core had the identical fault one door
  along. Revert-proved, and the revert is the real scale of it: withdrawing all
  nine anomalies recorded **NINETEEN ids** -- every core and every piece of
  structure on the roster, `terminus` included -- and would have read **9
  RECONCILED**.
  **The NEW FORM gate was never affected, and checking that first is what kept
  this a tile fix rather than a panic.** `menu.js` reads
  `w.reconciled.length`, which is honest run state; `game.js`'s own docstring
  had already recorded that the run-state answer and the device-level one
  "is a different number".
- **THE FIX IS AN IDIOM THIS FILE DID NOT HAVE AND THE REST OF THE GAME DID.**
  `Game.takeField` marks every body `spent` and `dissolved` "so none of them
  pays, counts or can be shot on the way out", and `Director.glitchOut` does
  the same. A boss teardown was the one removal in the game that did neither.
  `Boss.offField(e)` is that idiom named: `spent` (nothing may shoot it in the
  frame before the sweep), `dissolved` (the ONE flag `sweep` reads to tell the
  two deaths apart), `dead`. It deliberately does NOT touch `counts` -- that
  was never the fault and writing it would be a second claim, which is build
  234's rule about borrowing a flag for a side effect.
- **AND THE WIN GOES THROUGH THE SAME `clear`, so the record had to move to
  `endBoss`.** `endBoss`'s first statement was `w.boss.clear(w)`, so on a win
  the core's glossary entry came from the teardown too -- marking `dissolved`
  there and stopping would have taken the win's record away with the
  withdrawal's. `Game.endBoss` notes the core itself, one line above the
  clear, because it is the only one of the four callers that means the fight
  was finished. Measured after: withdrawal records **nothing**, win records
  `tally`, `digit`, `ordinal` -- identical to before the fix, to the id.
  The STRUCTURE needed nothing: `Boss.arrest` destroys each part as it snaps
  it off during the outro, well before `endBoss`, so `tally` is recorded by
  having been taken apart.
- **FIVE `clear` OVERRIDES, NOT TWO, AND ONLY ONE OF THEM IS A PRIVATE COPY.**
  CLAUDE.md said "a death sequence two bosses keep private copies of". Derived
  instead of restated: `axiom.js`, `dynamo.js`, `parity.js` and `terminus.js`
  all override `clear` and all four call `super.clear(world)`; **`Ordinal.clear`
  is the one that reimplements it**, so the mark is written out in exactly two
  places. And `Parity.parts()` returns the PANES only, so its two halves --
  which its own `clear` pushes back into `world.enemies` specifically so the
  sweep will find them -- are not reached by `super.clear` and needed the mark
  at their own site. A hand-counted number in this log was wrong again; the fix
  is the same as always, ask the structure.
- **WHAT MAKES IT ONE RULE RATHER THAN FIVE HOPES IS THE CASE, AND IT SWEEPS
  THE WHOLE ROSTER.** `regress.mjs` opens and withdraws all `ANOMALIES.length`
  anomalies and asserts the glossary did not move -- 9 of 9 opened with parts
  41/23/13/15/3/8/33/6/16 on the field, all three marks read back off a real
  part, swept to empty, `reconciled` still 0, glossary `[]`. A sixth override
  that forgets is caught by existing. **The win arm is the zero's liveness
  proof**: a zero from an instrument that has never read a one means nothing,
  and that is the same instrument reading three ids on a real 44-second
  ORDINAL death.
- **A NEW DEATH-TIME MARK COSTS SPARKS, AND THE ONLY WAY TO KNOW IS TO LOOK.**
  `sweep`'s `dissolved` branch throws four sparks a body, so a withdrawal now
  makes **164 particles in one frame** for ORDINAL's 41 parts (measured off
  `fx.particles.active`, and the pool grew to exactly 164 with nothing
  evicted). Rendered and looked at: it reads as the frame scattering as the
  boss is pulled back into its hole, which is what the beat already says --
  before the fix the frames simply vanished. An improvement rather than a
  regression, but it was a real change to the picture and the note is here
  because the next mark of this kind will have the same cost.
- **`this.ttl` WAS DEAD FOR YEARS UNDER A COMMENT ANNOUNCING IT.** `Enemy`
  declared `this.ttl = 0` beside "Debris used to expire after 22-30s. **It does
  not any more**", and the only other reference was its own expiry branch in
  `Enemy.update` -- the hottest per-body function in the game. Swept the whole
  tree for a property write, an options key, a quoted string and a destructured
  name: no writer anywhere, including the boss modules, the debug panel and the
  suite. Both are gone. **That is the fifth instance of this shape** after
  `kind: 'works'` (eighteen builds), `large: true` (fifteen types), nine
  anomaly `cost` fields (fifty-six builds) and CHAFF's four copy fields -- and
  the first one whose comment states, in as many words, that the mechanism was
  removed. Build 313's dead-field sweep cannot see it: that sweep walks keys
  any `ENEMY_TYPE` declares, and this was declared in the CONSTRUCTOR.
- **...AND `diveT` WAS WORSE THAN `ttl`, BECAUSE IT WAS YOUNGER AND STILL
  BEING MAINTAINED.** Build 318 found that SHRIKE's dwell clock counted time
  in the PHASE rather than time in the LANE, wrote `diveHeld` to replace it,
  and **left the old accumulator running**: one `this.diveT += dt` on
  `diveOn`'s hot path and three resets at the phase transitions, four
  maintained writes with **zero readers anywhere in the tree** -- src/,
  scripts/, index.html, sw.js. Build 318's own comment explaining why the
  clock was wrong sat eleven lines below it, in the past tense, about a field
  that was still there. **A field that is only written is dead code wearing
  state's clothes**, and the tell is the same as always: a name with writers
  and no supplier on the other side.
- **A THIRD SHAPE IN THE SAME SWEEP: a boss module writing its own meaning
  onto a field the class already owns.** `parity.js` did `q.host = h` on every
  pane it built -- and `host` is `Enemy`'s, the body a rider is standing on,
  written by `hunt`. `Boss.body` makes a pane with `new Enemy`, so this is
  build 298's collision shape exactly (`p.loose` on GNOMON's arc pieces, which
  threw). It was harmless because nothing read a pane's `host` back: all nine
  places PARITY needs a pane's half reach it through `h.panes`. Deleted, with
  the reason left at the site. **The rule build 298 stated -- grep a new field
  name against the boss modules -- runs the other way too**: a boss module
  owes the same grep against `Enemy`'s own constructor.
- **`Enemy.host` HAS NO READER IN `src/` AND NOW SAYS SO.** `hunt` re-picks
  its target from scratch every frame and writes `host` for the record; the
  only readers in the tree are two arms of `regress.mjs`. Keeping a field for
  the suite is a real and stated reason -- CLAUDE.md has said so since build
  220 -- and the correction is that it has to be STATED, at the declaration,
  or the next dead-field sweep deletes a field the suite needs. Left in place
  with the note.
- **THE DEAD-FIELD SWEEP HAS A DOMAIN, AND IT IS THE CONFIG AND NOT THE
  CLASS.** Build 313's guard walks `Object.keys(t)` over `ENEMY_TYPES` and
  greps each against `src/` outside config.js -- so it can only ever see a
  field the CONFIG declares about a body. `ttl`, `diveT` and `host` are
  declared in the `Enemy` CONSTRUCTOR and are outside its candidate set
  entirely; the guard was never going to find them and its passing said
  nothing about them. Two of the three had no reader and one had no reader in
  `src/`. **Ask what a guard's domain is before reading its green as
  coverage** -- and the cheap half of the gap is derivable: a field with
  writers and zero reads is a mechanical sweep over the same source the
  existing guard already reads.

- **`p.hp = 0` IS NOT A DEATH, AND BUILD 325'S OWN NEW ARM WAS DRIVEN BY
  ONE.** `hp <= 0` is converted into a death at exactly two sites, both
  inside `Enemy.applyDamage`, and nothing else in the game does it -- there
  is ONE boss death gate (`if (this.core.dead) this.die(world)`) and `dead`
  is only ever written by `Enemy.destroy`. So an arm that zeroed a boss's
  parts and core each frame was relying on something ELSE billing damage
  into an already-empty core: a DIGIT clipping it, which depends on where a
  burst happened to throw one. Measured, three runs each: **44.12 / 44.12 /
  44.08 seconds writing the number against 35.67 / 35.67 / 35.67 through the
  door**, and the door's figure is identical to the bit. The fix is one call
  with the arguments a round passes, plus an assertion that the core was
  ALIVE before it and DEAD after -- the door working, rather than the arm
  writing the flag itself.
- **`endBoss`'S CORE NOTE IS A BELT FOR EIGHT OF THE NINE AND THE WHOLE
  BRACE FOR ONE, AND THE ARM THAT SHIPPED WITH IT COULD NOT SEE THE ONE.**
  Every core dies through `destroy`, so for eight of them `Game.sweep`
  records the core on the frame it dies, tens of seconds before the outro
  ends -- build 325's line is a second idempotent note and its docstring's
  claim that "the win's record cannot come from there any more" was wrong
  about them. DYNAMO's core is the exception, measured as the only
  `inEnemies: false` of nine: it is spliced out of `world.enemies` by its
  first update and pushed back by `Dynamo.clear` itself, under a docstring
  reading "on the way out it has to be back in the world, or the wreck is
  not shed" -- so on build 324 the SWEEP recorded it and build 325's
  `offField` marks it `dissolved` in that same call. Proved by revert: with
  the line removed a won DYNAMO leaves the codex holding `pylon` and nothing
  else, while ORDINAL and TERMINUS still read their cores off the sweep. So
  the case wins ONE BOSS OF EACH CLASS, chosen off the roster reading rather
  than by index. **A belt and a brace look identical until you measure which
  one is holding.**
- **...AND THE BLOW HAS TO LAND TWO SECONDS IN, WHICH IS THE DIFFERENCE
  BETWEEN THAT ARM CATCHING THE FAULT AND NOT.** DYNAMO's core is spliced out
  by its FIRST update, not by its constructor -- so a core killed on the
  arrival frame is still on the list for all nine, the sweep records every
  one of them, and the arm passes with the note deleted. Measured: blow at
  f = 0, the reverted build is GREEN; blow at f = 120, a won DYNAMO leaves
  `pylon` alone and it fails. The guard is `onListAtKill`, asserted to agree
  with the class the roster sweep put that boss in -- or the arm is measuring
  the other one. Same family as sampling the last frame a state held.
- **THE TEARDOWN'S `dissolved` MARK BUYS A SPARK BURST, AND IT ARRIVED AS A
  SIDE EFFECT OF A GLOSSARY FIX.** `sweep`'s dissolved arm is four sparks a
  body. Measured either side in one container, every anomaly withdrawn:
  build 324 emitted **ZERO on all nine**, build 325 emits **164 for
  ORDINAL's 41 parts**, 132 for TERMINUS's 33, then 92 / 64 / 60 / 52 / 36 /
  24 / 16 -- against `CFG.maxParticles` 620, so the worst is 26% of one
  frame's budget at quality 1 and 59% at the governor's 0.45 floor. Bounded
  by construction (`spark()` returns null once `fx.budgetLeft` is spent) and
  one frame long. Kept, because the frame really is coming apart -- but a
  visual event nobody chose is a visual event nobody documented, and the
  right response is to decide it in the docstring rather than discover it.
- **THE SAME FAULT HAD A SECOND DOOR IN A DIFFERENT FILE, AND IT IS LIVE.**
  `Terminus.takeFrame` -- stage III, "it can only carry so much of itself,
  and what it cannot it drops" -- dropped ten pieces with a bare
  `p.dead = true`, so `Game.sweep` entered `bound` in the glossary and raised
  a `hud.noteCodex` for structure the player never touched. The tally was
  never at risk (`Boss.body` writes `counts = false`; measured 0 kills), so
  the leak is the OBJECTS tab's `known` mark, its section count and the
  notification. Build 325's own case could not see it: a withdrawal never
  reaches stage III. Fixed with the `offField` idiom that build exported, and
  revert-proved (0 of 10 marked and `bound` gained). **A fix is worth
  grepping for its own shape** -- the arrests and PARITY's mirror twin are
  the same three lines and are deliberately the other way, which nothing at
  those sites said either.
- **A CONTROL PLACED WHERE THE BOSS RESURRECTS ITS OWN STRUCTURE READS AN
  EMPTY DELTA ON A WORKING BUILD.** At stage III TERMINUS is GATHERING the
  boundary up: `takeFrame` calls `reform`, which raises dead pieces back to
  `frameHp` of their health. Measured -- a survivor killed there read
  `dead: true, hp: -2978` on the frame the damage landed and `dead: false,
  hp: 182 of 260` after the very next `g.update`, still in `world.enemies`,
  with nothing recorded: the boss revives it before `Game.sweep` ever walks
  it. So the control is taken on the CLIMB, at stage I, where nothing
  reforms. The first version put it after the drop and read `[]` for the one
  it was supposed to prove.
- **A DELTA AGAINST A DIRTY RECORD IS NOT A DELTA, and the first version of
  that arm could not fail.** It destroys a few outer segments through the
  damage door to bring the second ring -- and those are `bound` pieces too,
  so `bound` was already in the codex by the time the drop ran and the delta
  across the transition frame was empty whatever the drop did. The record is
  cleared on every stage-II frame now, so the transition starts from nothing.
  **Ask what is already in the accumulator before asserting that nothing was
  added to it.**
- **`Dynamo.collapse` OPENED WITH A LOOP THAT COULD NOT RUN, AND ITS
  DOCSTRING NAMED A MEASURED RULE THE LOOP WAS SUPPOSED TO KEEP.**
  `for (const p of this.live()) { p.dead = true; explode(...); ring(...); }`
  -- and the only call is
  `if (this.stage >= 4 && !this.triad && !this.live().length)
  this.collapse(world)`, so `live()` is EMPTY by construction every time the
  method is entered. Correct when the collapse fired at the stage boundary,
  dead from the moment the gate went in, which is the `world.endless` shape.
  What keeps the rule ("the legs have to actually go") is the GATE. Removing
  it took `explode` out of that file's imports, which is the tell that the
  branch really was the only one.
- **`openAperture` WAS NAMED AS A BOSS TEARDOWN DOOR IN FIVE PLACES AND IS
  NOT ONE.** Its second line is `if (world.boss) return false;` -- it has no
  boss teardown at all; what it clears is LOOSE bodies, and it pays for them.
  The real callers of `boss.clear` are exactly three (`reset`,
  `withdrawBoss`, `endBoss`), plus `Game.debugBoss` through the second. The
  claim started in one `clear` docstring and build 325 copied it into three
  more and a case. What it costs is precise: a reader auditing every door
  reads `openAperture`, finds nothing, and never looks at `debugBoss` --
  which is the one door of the real three a player can reach, from SETTINGS,
  ungated. And of the three, only TWO could ever have leaked the glossary:
  `reset()` empties `world.enemies` twenty-four lines before it calls
  `clear`, so its marks land on bodies nothing will ever sweep.
- **"SIX PLACES SET `dead` DIRECTLY" WAS WRONG IN BOTH DIRECTIONS, in four
  docstrings, with the list written out once.** `Game.sweep` was named and
  READS the flag; "the debug wipe" is `debugClearField`, which calls
  `e.destroy(w)` and never touches it. And the list omitted at least nine
  real writers -- the graft boarding, a GLUT's meal, `absorb`, `takeField`,
  the evolution's act I, PARITY's mirror twin, DYNAMO's collapse, TERMINUS's
  frame cull and both arrests. Derived instead of recounted:
  `grep -rn '\.dead\s*=\s*true' src/` finds forty-one statements, of which
  FIFTEEN are on a body in `world.enemies` or `world.drops`. **A number in a
  docstring saying how many of something there are is the shape this repo
  keeps paying for** -- name the grep that re-derives it, and say the list is
  the answer on the day it was run.
- **A CONJUNCT THAT READS `w.enemies[0]` AND A STRING THAT CALLS IT "A REAL
  PART".** The constructor pushes the core before `arriveStep` lands
  anything, so index 0 is the CORE for eight of the nine and a half (also the
  core) for PARITY -- the conjunct never once read a part, and
  `offField(this.core)` sits one line above `offField(p)` in both `clear`
  bodies, so it was very nearly vacuous. It reads all of `b.parts()` and the
  core now and prints `marked/parted` per boss. Third time in this repo that
  a detail string declared something the code was not measuring.
- **AND THE FAN-OUT SCORED FOUR OF FOUR THIS TIME, ON A BUILD I HAD ALREADY
  COMMITTED.** Four read-only lenses over build 325's own diff found the
  non-door driver, the spark burst, the TERMINUS leak and the unreachable
  DYNAMO loop -- all four real, none visible to 715 green cases, and two of
  them faults in code I had written that afternoon. The standing rule held
  anyway: its census figure for TERMINUS's part count disagreed with the
  suite's own output (33, not 29), its `openAperture` finding needed
  `reset()`'s ordering added to be complete, and every mechanism above was
  re-measured here rather than taken. **A review of the build you just
  shipped is the cheapest one there is**, because a red case then is
  unambiguously the case's fault.

- **A WAVE'S RULES BELONGED TO THE DIRECTOR AND NOTHING GAVE THEM BACK.**
  Build 327. `Director.load` is the ONLY writer of `traits` and `pairing`, and
  neither `score` nor `abandonWave` nor `recallWave` nor `glitchOut` cleared
  either -- so from the frame a wave was judged until the next one loaded, the
  director went on holding the rules of a wave that was over. Four things read
  that field and three were wrong for the window: the REMNANT return, the
  TETHERED pairing and the rail's glyphs.
- **THE RETURN WORE WHATEVER THE DIRECTOR HAPPENED TO BE HOLDING SIX SECONDS
  LATER.** `respawnBody` goes through `release` -> `spawnOne` ->
  `scaleToTier`, which stamps `e.traits = d.traits`. Measured with the seed
  pinned at rung 32, both directions: born under `swarm+mending` with the next
  wave untraited the return wore **NOTHING**; born untraited with the next wave
  `swarm+mending` it wore **BOTH** -- MENDING closing the health of a body
  whose entire design is that it comes back at half. The promise carries them
  now, which is the ownership `wave`, `hp`, `quick` and `pay` already had.
- **...AND THE ACCIDENT THAT HID IT IS WHY THE TWO HALVES HAVE TO SHIP
  TOGETHER.** A return landing in the REST read the right rules, because
  nothing had overwritten them yet -- so clearing at the wave's end WITHOUT
  the promise carrying them would have turned a correct case into a wrong one,
  stripping a return of rules it was entitled to. And stamping without
  clearing leaves the rail and the tether. Neither half is the fix; the pair
  is. **When a field has one writer and several readers, ask what each reader
  wants in the window where the writer is silent** -- two of them wanted
  opposite things.
- **A RETURN IN THE REST WAS STRUNG TO THE PREVIOUS WAVE'S ODD BODY.**
  `spawnGroup`'s TETHERED block pairs a new body with `d.pairing`, guarded
  only on that body being alive; `load` clears it, so the exposure is exactly
  the window before the next wave begins -- and the return is the one spawn in
  ordinary play that reaches it. Measured on the unfixed build: the return
  tethered to the odd LURCHER of the wave before, `oddNowTethered` true, the
  two of them sharing one pool across a wave boundary. Not a bounded window
  either: build 291's release gate holds the next wave until the field thins,
  which its own measurement says can be tens of seconds.
- **MY FIRST PROBE FOR THAT CONSUMED THE THING IT WAS MEASURING AND REPORTED
  THE FAULT ABSENT.** It released the odd LURCHER and then the REMNANT, so the
  two of them paired with each other, `d.pairing` went null, and the return
  had nothing to be strung to -- `partnerIsOldWaveBody: false` on a build where
  the fault is real. Reordering it (the remnant first, dead, and therefore
  REFUSED as a partner by `!waiting.dead`) leaves the lurcher genuinely odd
  and the fault reads immediately. **A probe that has to set up a queue can
  empty it**; check the state you meant to arrange before believing a zero.
- **THE RAIL'S REPAINT WAS KEYED ON THE RUN'S POSITION AND NOT ON WHAT IT
  PAINTS -- and the docstring three lines above it already said so about a
  different field.** `syncRail`'s whole cell loop sits inside
  `if (this._railAt !== n || this._railPeak !== peak || this._railTrial !==
  trial || this._railDone !== done)`, and the current rung's trait glyphs are
  written only in there. So the glyphs followed the rung: measured, a wave
  scored without moving the rung left its two glyphs up for the whole rest,
  and a wave that DID move repainted them onto the new rung -- the rules of a
  judged wave shown against the one about to be chosen. `done` was added to
  that predicate for the identical reason and its comment reads "the live path
  happens to move the tier a line later, which is exactly the kind of accident
  that holds until it does not". The comparison that makes it a fault rather
  than a quibble is the sibling: `syncRailBars` runs every frame and empties
  its meters on `dir.resting`. Keyed on the STRING now, plus the offer's count,
  because that is what reaches the DOM and `railGlyphs` cannot see the offer.
- **A CLEAR IN `score` GOES ABOVE THE PROBE BRANCH, WHICH RETURNS EARLY.** A
  trial is scored too and its rules have to go as well, so the two lines sit
  with `contact`, `hitPatience` and `take` -- the wave-scoped clears that were
  already on every path -- rather than at the end of the function where the
  ladder work happens.
- **A CONJUNCT THAT FAILS FOR THE OTHER HALF OF YOUR OWN BUILD IS A CONJUNCT
  IN THE WRONG ARM.** The return arm's control originally asserted
  `alone.holding === '-'`, which is only true because the wave-end clear ran --
  so reverting the CLEARS failed the arm about the STAMP. Removed with the
  reason at the site, and the revert matrix is clean: the stamp's revert fails
  arms 1 and 3, the clears' fails 2 and 3, the rail predicate's fails 2 alone.
  **Prove each mechanism separately and check the attribution**, or a red arm
  names the wrong fix.
- **`restart()` RE-ROLLS `world.runSeed`, SO TRAIT SETS ARE NOT REPRODUCIBLE
  ACROSS A RESET.** `traitsFor` is seeded off it, and the first two runs of
  this build's probe drew different sets for the same wave indices -- which
  reads as the mechanism being unstable. Pinned in the probe and in the case,
  which is also what lets the case pick two waves whose sets are known to
  differ. A case that needs two DIFFERENT trait sets and does not pin the seed
  may be comparing one set with itself.
- **`laneOffer` is cleared in `Director.restore` now, and it is a belt.**
  `captureRun` writes eleven wave keys and `laneOffer` is not among them, so
  there is nothing to restore it FROM and the question is purely about
  clearing; `restore` is only ever reached through `Game.reset`, which has
  already built a fresh Director. One line for a door that cannot be opened
  today and would hand over a free trait lane for `laneFor` rungs if it ever
  could.

- **ANVIL IS IN FROM BUILD 328, AND BOTH HALVES OF IT ARE REFUSALS.** Phase
  6o, the fifteenth of the twenty, band 5. `gait: 'creep'` takes no arc and
  `planted` takes no impulse, and the object is what they add up to: no button
  answers it and no angle avoids it. Five to go -- VEIL, GYRE, LOOM, MIRE,
  KITE.
- **EVERY SHOVE IN THE GAME ARRIVES THROUGH TWO DOORS, WHICH IS WHY THE
  REFUSAL IS TWO LINES.** `Enemy.applyDamage` zeroes the `impulse` argument
  for a planted body -- that is a round's knockback, PULSE, PILE, HEAVE, HAIL,
  a DECOY's parting blast, WELL's knot and every `applyBlast` caller, because
  a blast bills its push there too -- and `resolvePair` gives it no share of
  either correction. Measured with a 3000-impulse hit carrying `throwOff`, the
  shape a pressed ability takes: **0.00 u/s against a BULWARK's 91.45 and a
  LURCHER's 643**, with the damage still landing so the zero is a refusal of
  the SHOVE and not of the hit. The anvil is the heaviest of the three
  (`invMass` 0.016 against 0.031 and 0.214), so the controls also say the zero
  is not just mass.
- **`planted` IS `plow`'S ARITHMETIC WITH THE ROLES SWAPPED, and reusing the
  expression is the point.** `resolvePair` already had `ia = aPlow ? 0 :
  a.invMass` -- a body that takes no share of a contact -- so a planted body
  is the same line, and `invSum <= 0` then covers planted-against-static for
  free. The other half is the plow's own guard read forwards: `b.invMass > 0`
  disables a plow against something that cannot be moved, and a planted body
  is something that cannot be moved, so **a hurled MASS stops on an anvil
  instead of driving it down the field** -- measured, the anvil moved 0.2
  units under a 620 u/s plowing body and the MASS ended dead at -102.
- **THE GUARD GOES ON THE FLAG, FOR THE FOURTH TIME.** Neither reader asks the
  type anything, so a second `planted` type would inherit the whole of ANVIL's
  design in silence -- `plated` (319), `rides` (322), `respawn` (324) and
  `levels ?? 3` (224) are the same shape. `check-build` refuses a second one
  and holds the pairing (`planted` without `creep` is a body nothing can move
  that still takes an evasive arc, which is half an object).
- **AN `opens` ON A NEW TYPE FAILS THE PRE-180 MIGRATION GUARD, AND THE GUARD
  IS RIGHT.** The first draft carried `opens: MB(4)`; `check-build` requires
  every gated type's threshold to sit under its own old KILL gate times
  twelve, and that table is frozen history, so a type that did not exist
  before build 180 reads as `0 * 12000 < MB(4)` and the build stops. The gate
  was the mistake and it would have done nothing anyway: **the BAND is the
  gate for all of the twenty** -- band 5 is only drawn at rungs 29-35, and a
  run standing there has banked orders of magnitude more than any threshold
  worth writing. All fifteen shipped objects carry `opens: 0`.
- **THE GUIDE'S SPEED AND ITS CLOCK COULD NOT BOTH HOLD, FOR THE FOURTH TIME
  THIS PHASE.** `docs/objects.html` authors `speed: 18` and a counter of "the
  twenty-six seconds it takes to cross". The column a CLOSING body crosses is
  the portal's rim to the MOUNT -- 671 units at era 1 and 1202 at era 2 -- so
  18 u/s is 37 and 67 seconds against a band-5 wave that already has a
  120-second cap four of its seven rungs miss. The clock is the design, so the
  speed is derived from it (1202 / 26 = 46.2), and `creep` joins `dive` in
  `OWN_SPEED` so a dawdling route cannot make an authored clock a spawn roll.
  Delivered **45.8 u/s, 27.5s at era 2 and 15.8s at era 1**. EMBER's speed
  (307), LANTERN's clock (308) and SHRIKE's climb (317) were the other three.
- **...AND THE COLUMN A RISE BODY CROSSES IS NOT THE COLUMN A HOSTILE
  CROSSES.** Floor-to-rim is 963 and 1481 and is what every `rise` clock is
  derived from, because a rise body's journey ends at the rim. A hostile's
  ends ON the machine, 671 and 1202. The first draft of ANVIL's note used the
  rise figures, and the first version of the crossing probe waited for the
  floor line and **timed out at 300 seconds with the body sitting on the
  mount**. Ask where the journey ends before dividing by a column.
- **A TARGET SPEED IS NOT A SPEED, EIGHTH TIME, AND `accel` 40 MAKES IT THE
  WORST CASE YET.** The steady state is `cruise * k / (k + damping)` with
  `k = accel / 100`, so ANVIL's 40 delivers **0.42 of the ask** -- the largest
  discount of any gait that has met this. Compensated in the gait branch the
  way `dive` does it, overwriting `cruise` outright rather than scaling what
  the constructor rolled, because a crossing time quoted as a number cannot be
  14% either side of itself.
- **"IT DOES NOT STEER" IS ABOUT THE ARC, NOT ABOUT THE COLUMN, and reading it
  the other way is build 312's `tumble` fault.** A hostile that stops steering
  at the machine comes to rest wherever it stopped, and a body at floor level
  out to one side is outside `autoTarget`'s 78-degree cone for ever -- which
  with build 291's release gate is a run that can never climb again. So
  `creep` still closes; what it declines to add is the route's lateral.
- **MEASURING "STRAIGHT" AGAINST A LINE YOU BUILD YOURSELF MEASURES YOUR
  LINE.** The first version of that arm asserted zero lateral movement and
  failed at 69 units on a working build, because a body released off to one
  side MUST converge on the machine. The second built the start-to-mount line
  and read 20 units -- mostly the body's slow turn onto its own heading from a
  standing start -- while a routed BULWARK read 3, i.e. **the control came out
  straighter than the subject**. What works is intrinsic: path length over
  chord, which needs no knowledge of where `drive` aims. Anvil **1.0089**
  against a LURCHER on each of the six routes at 1.085 / 1.102 / 1.190 /
  1.177 / 1.147 / 1.086 -- and the control is all six rather than one, because
  `route` is a per-body roll and the six differ by a factor of two in how far
  they swing.
- **THE BAND'S BUDGET IS THE OTHER DELIVERABLE, AND IT CANNOT BE TUNED AWAY.**
  `threatOf` is health over `threatPerHp`, so 1400 health weighs 46.7 against
  band 5's mean of 33.0 -- there is no wave containing one anvil that lands
  near that mean, and scaling the health until it does would mean the heaviest
  body in the game is not. Measured either side in one container: band 5
  **33.0 -> 34.1, +3.3%**, and the other four bands identical. QUARRY paid
  +9.3% for band 4 on the same terms at build 312.
- **...AND A CONJUNCT ON HOW LITTLE A WAVE MOVES ITS BAND IS A CONJUNCT ON THE
  WHOLE ROSTER.** REMNANT's arm asserted `|moved| < 0.05` %, which was the
  measured -0.0095% when it was written -- and ANVIL's wave joining band 5 at
  49.8 against a mean of 35.2 took the mean this wave is compared against to
  36.6 and its own contribution to **-0.3095%**. One red case for a reason
  that has nothing to do with REMNANT. The durable claim is that THIS wave was
  priced at its band's mean (within 10%, build 315's lever) and re-prices the
  band by under half a per cent; a sibling arriving heavy does not make that
  false. Count-of-the-roster, wearing a decimal.
- **MOTE IS THE PARTNER BECAUSE OF WHAT IT IS NOT.** The two-or-three-hostile
  rule exists because "the problem is a combination", and the combination here
  is a thing that cannot be moved beside things that are nothing but movement:
  the press that clears the motes off the mount does nothing at all to the
  anvil behind them. A heavy partner would just be two walls.
- **THE CODEX LINE WAS MEASURED BEFORE IT WAS WRITTEN, which is build 319's
  correction applied in advance.** FLINT's line named two counters that did not
  work; ANVIL's names the gun and the clock and nothing else, with the clock
  as a comparison rather than a figure -- the speed is derived and a quoted
  number would rot. It deliberately does not name a mine
  (`CFG.mines.inPlay` false since 289) and does not invite the player to look
  for a face: `armor` here is ordinary all-round armour, not FLINT's plate,
  and suggesting otherwise would be FLINT's fault in reverse.
- **THE CONTAINER WAS REPROVISIONED MID-BUILD AND TOOK THE WHOLE WORKING TREE
  WITH IT, INCLUDING THE SCRATCHPAD.** Build 328 was fully measured and
  case-green when `/home/user/Shooter` came back with nothing in it but
  `.git`, itself freshly initialised -- no HEAD, no objects -- and
  `/tmp/claude-0` gone, so the two `.keep` copies of the edited sources died
  with it. `git fetch origin <branch>` then `git checkout <branch>` recovered
  build 327 from the remote and every edit was retyped from the transcript,
  which cost a session's worth of context for no new knowledge. **Commit the
  source edits the moment the mechanism measures, before writing the case**:
  the environment note at the top of every session says anything worth keeping
  has to be committed and pushed, and a build is at its most expensive to lose
  exactly when the measuring is done and the writing has not started. A local
  `.keep` copy is not a backup -- it is in the same container as the thing it
  is backing up.

- **BUILD 329 SHIPS NO GAMEPLAY: IT IS THE READING BUILD 328 OWED.** 328's
  commit message said no hash reading was needed because the build touched no
  physics. That was wrong, and the correction belongs here rather than in a
  footnote: **the ORDINAL hash moved `1213474222` -> `-1334607133`** at 328,
  and the cause was a radius. 329 attributes it, prices it, judges it and pins
  it, and moves nothing itself -- re-read at `-1334607133`, to the bit, after
  the pin and the notes went in, which is the only claim a comments-and-guard
  build is entitled to make.
- **`r: 56` IS A GLOBAL EDIT WEARING A LOCAL ONE'S CLOTHES.** `MAX_BODY_R` is
  the largest `r` in `ENEMY_TYPES`, multiplied for anything not `fixed` by
  what graft can add, and `GRID_CELL` is `max(96, ceil(2 * MAX_BODY_R))`. So
  ANVIL's 56 counts as **89.6**, past a fully grafted BULWARK's 72, and the
  broadphase cell went **144 -> 180 for every object in the game**. Nothing in
  the diff said "grid"; the widest radius in the table is a load-bearing
  number and authoring it is not a local decision. `MAX_BODY_R`'s own
  docstring had already written the warning -- "it also silently changed every
  fight that was already tuned, which is how it was caught" -- about a
  previous time.
- **THE CHANNEL WAS BISECTED, NOT GUESSED, AND THE OBVIOUS SUSPECT WAS
  INNOCENT.** Two candidate causes, both plausible: 328's edits to
  `resolvePair` and `drive`, or the config. Served a 327 worktree on :8098
  beside the live tree on :8099 and swapped files: 328's `physics.js` and
  `enemies.js` against **327's config gives `1213474222` to the bit**, so the
  `planted` arithmetic is an identity for every non-planted body -- which is
  what the code claimed and is now measured. 328's config with **the wave
  removed still gives `-1334607133`**, so it is the type's presence in
  `ENEMY_TYPES`, not the roster it joins. Then `MAX_BODY_R` by reading. Three
  readings settle what any amount of staring at a diff would not.
  (Bisect-worktree trap, third time: **match the BUILD literal in both
  `src/config.js` and `index.html` in the served copy**, or the updater
  reloads the page mid-run and Playwright reports "Execution context was
  destroyed".)
- **A WIDER CELL COSTS EVERY OBJECT IN THE GAME, AND THE PRICE IS SMALL BUT
  WORTH KNOWING.** A full 57-body field: **0.268 -> 0.387 ms an update**, best
  of five runs of 300 updates each. 1.44x the update cost for 1.56x the cell
  area, about 2.3% of a 60Hz frame. Measured because "it moved the hash" says
  nothing about whether it hurt; the answer happens to be no, and the next
  radius that widens the cell will be judged against this number rather than
  against a shrug.
- **THE WIDENING IS CORRECT AND STAYS -- THE SILENCE WAS THE FAULT.** A
  grafted anvil really does reach 89.6, so a 144 cell would leave real pairs
  untested, which is a hole in the guarantee the narrow-cell guard exists to
  make. Nothing about the body is wrong. What was missing is anything that
  made somebody LOOK, and the distinction matters: the fix for a silent
  correct change is a pin, not a revert.
- **A `console.log` IN A GUARD SCRIPT IS NOT A GUARD.** `check-build` printed
  the cell on every run, 144 for dozens of builds and 180 since 328, in a
  block of thirty lines of other true statements. A number that only ever
  gets printed is only ever read by somebody already looking for it.
  `check-build` now carries `CELL_PIN = 180` and `CELL_BY = 'anvil'` and exits
  1 on any move, naming the widest body, quoting the hash delta and the
  0.268 -> 0.387, and telling the author to take the hash either side and move
  the pin in the same commit. The existing guard refuses a cell too NARROW
  (`2 * (MAX_BODY_R + STATIC_R)` must fit); it cannot refuse one that is
  legitimately wider, because wider is arithmetic. **Both halves of a derived
  global need saying: not too small is correctness, not silently different is
  everything else.**
- **THE PIN IS WRITTEN AGAINST THE BODY THAT SETS IT, and that is the part
  that survives.** `CELL_BY = 'anvil'` and a note on ANVIL's own `r: 56`
  pointing back at it, so the next person to author a radius past 56, or to
  delete this type, meets the consequence at both ends instead of reading a
  bare number. The `plated`/`rides`/`respawn`/`planted` guards all put the
  refusal on the flag; this puts the price on the field.
- **AND THE OLD NUMBER WAS STILL WRITTEN DOWN IN THREE PLACES AS THOUGH IT
  WERE CURRENT, which is the same silence one step further out.** Grepping for
  what claimed to know the largest body found: `src/dummy.js` stating the
  practice rig's hard ceiling is **72** (the rig is an enemy in `w.enemies`
  whose radius is `DUMMY.r` and NOT a roster entry, so `MAX_BODY_R` cannot see
  it and nothing derives the cell from it -- the ceiling is half the cell, 72
  when written and **90** now, and `DUMMY.r` 68 clears both, which is the only
  reason that note did not become a bug); SPINDLE's `hitReach` note quoting
  "inside MAX_BODY_R 72", where the claim holds and the figure does not; and
  `MAX_BODY_R`'s own docstring recording FRACTAL's 72 -> 102 and 144 -> 205 in
  a way that now reads as the live state. All three marked with what they were
  and when. **A derived number quoted in prose is a copy, and copies go stale
  in silence -- when one moves, grep for who was quoting it.**

- **VEIL IS IN FROM BUILD 330, AND THE RULE IT WAS BUILT FOR CHANGES
  NOTHING.** Phase 6p, the sixteenth of the twenty, band 5. A membrane 104 x
  12 that goes wide before it comes down; nothing behind it can be picked by
  the assist. Four to go -- GYRE, LOOM, MIRE, KITE.
- **THE OCCLUSION IS TRUE OF HALF THE FIELD AND DECIDES NONE OF IT, AND BOTH
  HALVES OF THAT ARE THE FINDING.** Measured on the SAME field in two chooser
  configurations on every frame -- `TYPE_BY_ID.veil.sheet` flipped between two
  `autoTarget()` calls, so nothing diverges -- over 1,348 frames of the real
  wave at rung 32 with a fully bought turret: **42.8% of candidates occluded
  every frame** (2,698 of 6,305, mean 8.2 sheets up, worst 24 of 21.9) and
  **the pick differed on ZERO of them**. The reason is arithmetic rather than
  luck: `autoTarget` scores by distance, so the body it picks is the nearest
  one, and the nearest body has nothing in front of it to be hidden by. The
  guide's "exactly the decision it exists to force" is a decision the gun
  already makes for you. So the object's cost was measured instead: **63% of
  every point of damage the turret delivered went into membrane** (13,555 of
  21,620 at rung 32, 62% at rung 35), because a round aimed at anything behind
  a sheet stops in it. That is what shipped in the codex line, and the
  occlusion is stated as a correctness rule -- the assist declining a shot it
  cannot make -- rather than as the difficulty.
- **...AND THE FIRST VERSION OF THAT RULE WAS VACUOUS FOR A DIFFERENT AND
  WORSE REASON.** It skipped any sheet whose CENTRE was further from the
  machine than the candidate, which reads as the conservative choice ("only
  what is in front can hide it") and deletes the one case that could ever
  bind: a nearer body can only be hidden by a sheet crossing the ray near one
  of its ends, which is exactly a sheet whose centre is off to the side and
  further away. Both configurations then read zero, which is how it was
  caught. The test is `segSeg`'s own parameter along the ray -- within `barR`
  AND at `t < 1` -- which is the geometric statement of "behind it" and the
  one the ROUND already obeys. **When a guard and the mechanism it guards are
  about the same quantity, check that the guard does not exclude the
  mechanism.**
- **THE INSTRUMENT HAD THE IDENTICAL FAULT, WRITTEN INDEPENDENTLY, WHICH IS
  WHY THE FIRST READING LOOKED LIKE A CONFIRMATION.** The probe that asked
  "was the assist ever aimed at something behind a sheet" carried its own
  `dv >= de` centre-distance guard and its own sampling bug (it took the
  minimum over `t` up to and including 1, i.e. at the body). So it read 0 with
  the rule on and 0 with it off -- the right answer for the wrong reason,
  agreeing with a broken mechanism. Suspect the instrument before the code,
  and then suspect it AGAIN when it agrees with you: two independent
  derivations of the same geometry made the same mistake because they were
  written by the same reasoning.
- **A THREE-WAY ARENA IS WHAT LETS AN OCCLUSION CLAIM BE SEEN AT ALL.** A
  sheet is the nearest thing on the field, so it wins on distance and no
  arrangement of one sheet and one body can show the rule working -- the first
  probe's "past the end" arms both read "veil picked" and were measuring the
  scoring. What discriminates is TWO bodies, both marked `attacking` so the
  0.25 weight puts them ahead of the sheet, one nearer and hidden and one
  further and clear: **a LURCHER at 260 is refused for one at 414**, and with
  the sheet removed the nearer one wins. The boundary is the capsule's own
  span (a ray 38 off the axis is hidden, one at 71 is not, against 58).
- **`upright` MEANT "THE DRAWING IGNORES `angle`" AND NOW MEANS WHAT IT
  SAYS.** One reader, in `Enemy.draw`, while the constructor went on rolling
  `rand(0, TAU)` and build 211's impact spin went on writing `av` -- so an
  upright body's angle drifted for ever and was simply unread. Inert for the
  three that had the flag (EMBER, LANTERN, ANVIL) and NOT inert for the first
  one whose SHAPE reads that angle: `barHalf` lays a capsule along it, so a
  membrane would have hung at a random tilt under a picture drawn level, which
  is build 315's fifth door with the disagreement pointing the other way. It
  pins `angle` and `av` every frame now, for `Enemy.face`'s reason -- a
  round's lever writes `av` on any frame -- and the ORDINAL hash is what says
  the three existing bodies did not move.
- **A SHAPE SHARED BY GAIT IS A SHAPE THE NEXT TYPE INHERITS IN SILENCE.**
  `CFG.cartwheel.long` / `.thin` held the BAR's proportions, and its own
  docstring was right about everything except whose the shape is: VEIL's
  1.0r x 0.115r membrane would have been tested as a 166-unit spindle, with no
  field to set and nothing to fail. The block is the type's now (`bar: { long,
  thin }`) and `CFG.cartwheel` keeps the spin, which really is the gait's.
  That is the fifth instance after `plated` (319), `rides` (322), `respawn`
  (324) and `planted` (328), and the first where the shared block was found
  BEFORE it did any damage -- because the new type was authored against it.
  **A number about the GAIT is shared; a number about the BODY is the
  type's.** Proved a no-op for SPINDLE: 96x11, reach 53.5, to the digit.
- **...AND THIS ONE DELIBERATELY DOES NOT GET A SECOND-TYPE REFUSAL.** The
  four guards above all refuse a second type declaring the flag, because their
  readers consult a shared block. A `sheet`'s readers consult the BODY -- its
  own `bar` block, its own `angle`, its own position -- so a second membrane
  of another size is covered by existing. What check-build holds instead is
  the two things `sheet` does not declare and cannot work without: `bar`
  (without it `barHalf` is NaN, `occluded` compares `NaN <= 36` and the whole
  mechanism is off with no error) and `upright`, which is what the no-silent-
  gun argument rests on. **The guard goes on the flag when the flag's readers
  look somewhere else.**
- **THE GUARANTEE THAT AN OCCLUSION RULE CANNOT SILENCE THE GUN IS A DEPTH
  ORDER, AND IT NEEDS THE SHEETS LEVEL.** Two horizontal capsules cannot each
  cross the other's ray first -- one is nearer the machine -- so there is no
  cycle in which two sheets hide each other, and the lowest sheet in the cone
  is always choosable. A TILTED sheet can cross another in an X and leave
  neither pickable, which is why `sheet` requires `upright` rather than it
  being a drawing preference. Measured as well as argued: 0 null picks over 40
  randomised fields of 3-6 sheets, and 0 frames where the rule took the last
  thing the gun could have shot.
- **...and the null count has to be measured AGAINST THE RULE-OFF FIELD, not
  against "something is standing".** The first version of that arm read 99
  nulls of 546 and every one was the era-2 YARD WALL: `shielded` makes a body
  above the line unshootable, which is not this rule's business. Comparing the
  two configurations is what makes the claim about the rule. (The same arm also
  read 546 of 546 until the assist's REACH was raised -- the base 400 does not
  span the era-2 field, so an unbought run has nothing in reach and every
  frame is null, which reads exactly like an occlusion rule refusing
  everything.)
- **`spread` IS THE THIRTEENTH GAIT, AND "0.34 OF THE WIDTH OVER 0.2 OF THE
  DEPTH" IS NOT A SLANT OF 1.7.** The field is nearly twice as deep as it is
  wide, so the guide's own path for this gait is 214 units sideways against
  245 down -- **0.87**, and reading the two fractions as a ratio would have
  made the traverse twice as flat as the design. A fraction of a field is not
  a distance. The aim point is `max(look, gap / slant)` below the body: the
  slant while there is a gap to cross, and SHRIKE's `look` floor (build 318)
  once there is not, because a body steering at a point far down its own
  column has almost no lateral authority.
- **A LANE RULE IS FARTHEST-POINT, AND THE MACHINE'S COLUMN IS OCCUPIED
  GROUND.** Candidates are seven columns across the band `edgeEase` leaves
  (`rollOn`'s derivation, so the gait and the wall rule agree rather than
  argue), and the pick maximises the distance to the nearest occupied one --
  where occupied is every other sheet's lane AND the machine's own column.
  That last term is the whole of "it is trying to cover ground, not reach
  you": the first sheet takes a wall, the second the other wall, the rest fill
  between, and the middle is taken last. **The first version made the
  machine's column the TIE-BREAK instead** -- on the sound argument that
  occlusion is angular, so a sheet nearer the middle of the cone hides more --
  and measured to read as the wrong object: bodies come through the mouth at
  the machine's own x, so the first sheet's gap to its lane was **80 units of
  a 968-wide field** and it walked straight down the middle. A gait called
  `spread` whose first body does not move sideways is a gait that is not
  there.
- **...and a body still in the THROAT is not standing anywhere.** The lane
  search first counted a sheet with no lane yet at its `x`, which seemed the
  conservative reading: a formation queues its bodies at ONE x, so the first
  sheet to come loose found the middle "occupied" by twenty-nine staged
  siblings and was sent to the far wall -- lanes 426 and 481 of a 629-wide
  field with nothing standing in the middle at all. The set is sheets that
  have CHOSEN.
- **A FORMATION OF SHEETS IS A LATTICE, AND THE COUNT IS WHY IT HAD TO BE
  REFUSED.** `spawnFormation` pitches its slots at `r * 2 + 8`, which for a
  body 104 units wide is 112 -- an edge-to-edge wall arriving as a shape, with
  the lane choice never happening. Measured either way at rung 32 on the era-2
  field over 30 seconds: as a formation, 30 sheets were made and **ten came
  loose**, with thirty standing staged in the throat against a field cap of 57
  -- a queue the assist cannot shoot at all, because `legal` refuses `staged`.
  With `solo: true`, all thirty came loose and all thirty chose a lane.
  `solo` is read in `Director.load` and nowhere else (build 313), which is
  what keeps the COUNT while refusing the shape.
- **A GAIT THAT REPLACES THE ROUTE STILL HAS TO ARRIVE, AND THE GUIDE'S OWN
  PATH FOR THIS ONE DOES NOT.** Its illustrative path ends at 0.8 of the width
  and 0.9 of the depth -- on the floor, out to one side -- which is build
  312's `tumble` fault: a body there is outside `autoTarget`'s cone for ever
  and, with the build-291 release gate, a run that can never climb. So the
  chosen column folds onto the machine's across the last stretch, using the
  identical `(d - 170k) / 210k` the route arm scales its lateral off by.
  Measured: released at x 436 with a lane at 148, it closes a 288-unit gap to
  19 and ends ON the machine.
- **A TARGET SPEED IS NOT A SPEED, NINTH TIME, AND THIS ONE IS DELIBERATELY
  NOT COMPENSATED.** `accel` 90 against `linearDamping` 0.55 delivers
  `26 * 0.9 / 1.45` = **16.1 u/s, measured 16.2-16.8** -- 0.62 of the ask, and
  an 85-second crossing of the era-2 column. Nothing in this object is a clock
  or a ratio between two speeds (the guide gives it no crossing time), so the
  rule is LATCH's and REMNANT's: know which number you are delivering rather
  than grossing it up. A membrane that hangs about is in character; the figure
  is recorded so the next reader does not have to re-derive it.
- **ITS SILHOUETTE IS SPINDLE'S, WHICH IS THE SHARED-HUE PROBLEM INVERTED.**
  104 x 12 against 96 x 11 -- 8% longer, 9% thicker, an aspect ratio of 8.67
  against 8.73. Two builds' worth of notes say that when a HUE is shared the
  silhouette carries the distinction; here the silhouette is shared and the
  distinction is carried by the other two registers: **dE 166.6** between the
  two body colours (about as far apart as this palette goes) and the MOTION --
  SPINDLE cartwheels at two thirds of a revolution a second and a sheet is
  pinned level. Recorded rather than fixed: the guide's 104 x 12 is the design
  and the alternative is inventing a different body.
- **AND THE COLOUR HAD ROOM, SECOND TIME.** The guide's `heavy` family hex is
  `#5d9cff` -- BULWARK's body colour and ANVIL's, dE 0.0, and ANVIL shipped
  two builds ago into the SAME band. Swept the blue band against all 116 tones
  in the roster: `#1f6bff` is **22.0** off the nearest loose body's tone and
  **36.6** off ANVIL's and BULWARK's, inside the 15-23 this repo documents as
  working. Its nearest tone anywhere is DYNAMO's GLOW at 3.0, and that is a
  boss -- an aperture clears the loose field on the way in, so the two are
  never on the screen together. The pure blues score better (`#0000ff` at
  29.3) and are refused for build 322's reason: relative luminance 0.072
  against this 0.180, and a body reads almost entirely as its outline.
- **A PRESS THROWS A MEMBRANE, WHICH IS ANVIL'S REFUSAL INVERTED AND THE
  CODEX LINE'S COUNTER.** Same 3,000-impulse hit carrying `throwOff` that
  build 328 measured: **VEIL 528.32 u/s and 365 units**, against a LURCHER's
  643, a BULWARK's 91.45 and an ANVIL's **0.00** -- mass 946 against 10,662,
  the lightest thing on the field for its size and the heaviest, both band 5,
  both in the same blue family. A blast takes it whole (119.6 of 120).
- **...and a peak velocity sampled over a SECOND is the body's own walking.**
  The first reading of that table gave the anvil 27.87 u/s, which contradicts
  build 328's measured zero -- because `creep` overwrites `this.cruise` every
  frame, so an anvil with its cruise zeroed re-arms itself and walks. The
  shove is the velocity the impulse left, read BEFORE anything steps; with
  that it reproduces 0.00 exactly.
- **AND THE NEW WAVE RE-ROLLED THE SUITE'S RANDOMS, WHICH TOOK OUT A
  SINGLE-DRAW MARGIN IN BUILD 322'S LATCH CASE.** 727 of 728 on the first
  run, and the one red arm was the salvage control: a MOTE's mote closed
  **91.2** units on the turret against a floor of 100, on a build that cannot
  touch a rider. `w.drops[0]` is ONE body and a drop is born with an outward
  velocity it has to shed first, so the distance it closes in a 2.5-second
  window is a random roll -- build 323's ORDINAL salvage arm paid for exactly
  this, on exactly this quantity, and the fix is the same: every mote the body
  shed, and the MEAN. The floor came down to 20 as well, because the controls'
  job in that arm is VACUITY (an instrument that can see a mote going to the
  gun) and the discriminating claim is `aboard`, which reverting the guard
  reads as 1 -- a distance floor set near a control's own distribution is
  build 319's fault wearing a control's clothes. Build 315's rule again:
  **adding a wave is a re-roll of the whole suite's randoms, so expect the
  arms with tight margins to be the ones that fail.**
- **THE CLEAR IS COMFORTABLE, which is the arm most worth having.** The wave,
  fully bought, era 2: **42.1s at rung 29, 58.4s at 32, 77.3s at 35** against
  a 120-second cap, with everything asked for delivered and the field never
  stuck. Sheets die in about a twentieth of a second to a bought turret, so
  the wall is a tempo cost rather than a stall -- and `emit`'s hold, not the
  gait, is what keeps thirty of them off the screen at once.

- **GYRE IS WITHDRAWN FROM BUILD 331, AND EVERY CLAUSE OF IT WAS MEASURED
  EMPTY RATHER THAN ARGUED AWAY.** `docs/objects.html` authored twenty
  objects; nineteen is what phase 6 will ship. GYRE was an orbiting body
  swinging a weighted arm that "does not damage you -- it MOVES YOUR THINGS: a
  mine it passes is dragged out of its lane, a DECOY is shoved off its mark",
  countered by "lay for it". Four readings, none of them close:
  - **MINES have no door.** `CFG.mines.inPlay` false since build 289, so the
    first half of the `what` and the WHOLE of the `counter` are about a system
    a player cannot reach. Builds 317 and 319 each shipped a codex LINE
    offering a mine as an answer and 323 had to correct both; this is that
    fault at the scale of a whole object, and the guide's counter is the same
    two words ("lay for it").
  - **The DECOY is optional and intermittent.** It is in `LOCKABLE.abilities`,
    so it is a purchase, and `life` 9 against `cooldown` 24 is **37.5% duty**
    for a player pressing it the instant it recharges and **0%** for one who
    never bought it. An object whose only live target is that is the
    `world.endless` shape -- a reader whose other branch is almost never
    taken.
  - **SALVAGE moves and costs nothing.** `collectData` accelerates every drop
    at `energy.pull` 26 u/s^2 toward the machine, and drops do not expire --
    build 325 deleted the `ttl` that used to end them -- so a mote flung 100 /
    200 / 300 units out is back in **2.8 / 3.9 / 4.8 seconds** with none of it
    lost. A delay in income is not a payload; it is invisible.
  - **And the GAIT cannot carry it alone, which is what settled it.** The
    obvious re-spec is "the body your barrel cannot keep up with", and the
    arithmetic refuses it before any code: delivered speed is
    `44 * 1.6 / 2.15` = **32.7 u/s**, so at radius 300 the bearing moves 0.109
    rad/s against `shooter.autoTurnRate` 4.2 -- **2.6% of the barrel's slew**,
    5.2% at radius 150. Circling this machine is not a tracking problem.
- **...AND AN ORBIT FIGHTS TWO RULES THIS REPO HAS ALREADY PAID FOR.**
  `autoTarget`'s cone is `aimClamp + 0.04` = +-80.2 degrees, so **45% of a
  full circle is inside it**: an orbiting HOSTILE is unchoosable for more than
  half of a **58-second** orbit while `Director.standing` and `hostileCount`
  hold the wave and the build-291 release gate open -- build 312's `tumble`
  finding, on a body whose spec says "never arrives, never leaves". And the
  arena clamps it: era 1's mount stands **210 units** above the floor (1012.6
  against 1223), so a 300-radius circle passes 90 units UNDER the field. The
  fix for both is an ARC derived from the cone, the way `roll` takes its turn
  from `edgeEase` and `dive` its lane from `grabPad` -- which with the mine
  line back is a different object and wants a fresh spec. **Both halves come
  back together or not at all**, and that is written where the roster lives
  rather than left for the next reader to re-derive.
- **A WITHDRAWAL IS A DENOMINATOR MOVING, WHICH IS BUILD 329'S RULE OWED A
  GREP.** "A derived number quoted in prose is a copy, and copies go stale in
  silence -- when one moves, grep for who was quoting it." `grep -rn "the
  twenty"` over src/, scripts/ and docs/ found **38** hits, most of them other
  twenties (twenty-one upgrades, twenty-five damage sources, the twenty pieces
  the bosses make, ANVIL's twenty-six seconds). The LIVE claims about THIS
  roster were **thirteen**, counted off the diff rather than by eye: 3 in
  `config.js`, 2 in `enemies.js`, 4 in the guide and 4 in the plan. Fixed by
  making them
  say what they are about ("phase 6's objects", "every other one of them")
  rather than restating a count -- the same correction `LOTS` and
  `ANOMALIES.length` got. The DATED ordinals ("Build 328, phase 6o, and the
  fifteenth of the twenty") are left alone: they are records of the count as
  it stood when each object shipped, and rewriting them would be rewriting
  history rather than correcting a copy.
- **AND THE REMOVAL FOUND A HAND-KEPT LIST NAMING THE ROW IT DELETED.**
  `docs/objects.html`'s `HERO_GAITS` is a literal array of eight gait ids used
  to pick which cards get the big treatment, and `'orbit'` was one of them --
  so deleting the gait's table entry left a list asking for a row that no
  longer exists. Both doc pages were loaded headlessly afterwards and checked
  for a thrown error rather than assumed: no `pageerror` on either, 19 objects
  and 21 gaits in the guide's own arrays, `Orbit` gone from the rendered text.
  **A removal is the cheapest way to find out which of your lists were really
  assumptions** -- build 290 recorded that about taking a system out of play,
  and it holds for one row of one table.
- **A FRAME COUNT IS A THRESHOLD, AND BUILD 330'S OWN NEW ARM HAD ONE AT THE
  EDGE OF ITS DRAW.** The VEIL gait arm ran a flat **7000 frames (116.7s)**
  and waited for the sheet to reach the machine -- and this build, which
  changes no executable line, failed it at y 1431 with 127 units still to go,
  about three seconds short. Measured standalone, six releases arrive in
  **79.4 to 99.8 seconds**: the spread is the MOUTH's own x jitter, which sets
  the gap to the chosen lane anywhere from 264 to 336, and a sheet delivering
  16.14 u/s spends that difference. So the cap was 17% clear of its own worst
  draw, and the suite -- where synthetic steps ride on the page's rAF loop --
  crossed it. **A loop bound is a fitted margin wearing a `for` statement's
  clothes**, and the tell is the same as always: a number chosen once, near
  the truth, against a quantity that rolls.
  It is DERIVED now, set on the frame the body comes loose from the depth it
  actually has left and the speed its own type delivers, times 2.5 -- the
  traverse lengthens the path by at most `sqrt(1 + slant^2)` = 1.32 and the
  fold eases the last of it. That reads 184-186s against arrivals at 79-86s,
  2.2x clear, it moves with the era instead of being right at one, and the
  detail prints BOTH figures so the next reader can see the headroom without
  writing a probe (build 320's whole point).
- **The hash was NOT run and does not need to be.** This build changes no
  executable line: a withdrawal from a design document, four count statements
  in comments, and one literal array in a doc page. CLAUDE.md's rule is that
  the hash is owed by a change to energy, targeting or the boss, and there is
  no change at all here -- which is also why the suite is the only instrument
  that had anything to say.

- Develop on `claude/iphone-shooter-game-m6fccr`. No pull requests unless asked.

- **LOOM IS IN FROM BUILD 332, AND ITS THREAD IS THE FIRST THING IN THIS GAME
  THAT STOPS A ROUND ANYWHERE BUT AT THE EDGES OF THE FIELD.** Phase 6q, band
  5, the seventeenth object to ship. A pair that walks apart stringing a
  bright thread between them; a round that meets the thread is ABSORBED --
  `impacted` false, so an HE does not even go off against it -- and delivers
  nothing to whatever it was aimed at. Two to go: MIRE and KITE.
- **THE GUIDE'S ANALOGY IS EXACT AND I NEARLY SHIPPED A NOTE SAYING IT WAS
  FALSE.** `docs/objects.html` says "our rounds stop on the thread the way
  they stop on the era-two wall", and my first reading -- from a grep of
  `shielded`, which refuses the CHOOSER and the damage path -- was that rounds
  pass straight through the wall and the analogy pointed at nothing. It does
  not: `updateProjectiles` CLIPS the round's step at `wallLine` and takes it
  there with `impacted` false, a hundred lines above the `shielded` call, and
  that is the precedent the thread is built on. The docstring was corrected
  before it shipped. **A mechanism named by a design document is worth
  grepping for in the file that would implement it, not only in the file whose
  name matches the words.**
- **`CFG.yoke` WAS FIVE NUMBERS ABOUT ONE PAIR READ BY NAME IN FOUR PLACES,
  AND THAT IS THE SIXTH INSTANCE OF THE SHARED-BLOCK FAULT.** `pairOn`,
  `pourPool`, `drawYoke` and `pairOf` all read it, so LOOM -- the second
  `paired` type -- would have worn YOKE's beam length, rotation rate, grip,
  pool share and survivor speed in total silence, with no field to set and
  nothing to fail. `plated` reading `CFG.flint` (319), `ride` reading
  `CFG.graft` (322), `respawn` (324), `planted` (328) and `bar` reading
  `CFG.cartwheel` (330) are the same shape, and this is the SECOND found
  before it did any damage, because the new type was authored against the
  block. Each pair type carries its own `bond` block now, `pairOf` throws for
  a malformed one, and `check-build` calls it for every pair type at build
  time. The no-op is asserted rather than argued: YOKE's five numbers to the
  digit, one pool still shared, the beam still 60, the share still snapping,
  and `threatOf(yoke) === 5` exactly.
- **...AND `pool` IS WHAT MAKES THE TWO PAIRS DIFFERENT OBJECTS, IN ONE
  FIELD.** A YOKE is two bodies of ONE 150 and where you aim decides what you
  are left holding; a LOOM is two bodies of 110 EACH, and the thread is up
  while both are, which is the whole of "either end drops it". So `spawnPair`
  shares the ceiling only when the bond says to, `pourPool` does not run at
  all for an unpooled pair -- and `threatOf` had to learn the difference:
  **a pair with two pools counts BOTH halves** (7.33 for a LOOM against 5.00
  for a YOKE), the same rule that makes a TOW count what it drags, a QUARRY
  what it becomes and a REMNANT what comes back. `many` reads
  `school || beads || 1` and a pair is one, which is why nothing had to change
  when YOKE shipped and something did now.
- **THE THREAD'S BLOCKING SPAN IS `d - 2r`, AND THAT DERIVES THE GUIDE'S OWN
  "THE FIRST FOUR SECONDS ARE FREE".** The link's ends are AT the two centres,
  so a thread drawn all the way to them would eat a round arriving at a spool
  from the side a unit short of the body it was aimed at -- and "either end
  drops it" is the only way in to the object. Inset by each body's own radius
  and the spools are always shootable, whatever the pair has grown to; the
  blocking span is then 16 units at release and 150 at full span, so the free
  opening falls out of the geometry instead of being a fitted delay. Same
  idiom as `roll` taking its turn from `edgeEase`, `dive` its lane from
  `grabPad` and `sheetLaneFor` its band from `edgeEase`: **before adding a
  rule about where a thing reaches, use the one that already says where it
  must not.**
- **A ROTATING SEGMENT CANNOT JOIN `occluders`, AND THE GUARANTEE IS WHY.**
  Build 330 shipped an argument that an occlusion rule can never leave the gun
  with nothing to shoot, and its first clause is that a sheet is LEVEL, so
  "in front of" is a strict order by depth and no two sheets can hide each
  other. A thread turns about its midpoint: two crossed threads could hide
  each other's spools, `autoTarget` returns null, and a silent gun plus the
  build-291 release gate is a run that cannot climb. So the thread is
  deliberately NOT in `occluders` -- and the second reason is the object
  itself, because what LOOM costs is rounds and an assist that declined the
  shot would refuse to pay it. The asymmetry with VEIL is a decision and is
  written at the type.
- **A RIGID CONSTRAINT DELIVERS ITS ASK, WHICH IS THE FIRST TIME THIS PHASE
  SOMETHING DID.** "A target speed is not a speed" is in here nine times
  (298, 308, 316, 317, 318, 322, 323, 324, 330) and every one of them was a
  velocity BLEND fighting `linearDamping` and `drive`. The growth here is
  positional -- `solveTethers` corrects the pair to `tether.len` and `pairOn`
  grows the number -- so the measured separation is **75.0 / 94.2 / 132.5 /
  189.9 / 190.0 at 2/4/8/14/18s against an authored 75.1 / 94.3 / 132.6 /
  190.0 / 190.0**, worst 0.19% out. The case asserts 2%, which nothing steered
  in this game could manage. **Ask whether the quantity is steered or
  constrained before compensating it.**
- **THE OBJECT'S A/B IS ONE FLAG AND THE RESULT IS AN ABSOLUTE.** Same body,
  same place, same round, `beam` up and down: **0 damage against 26**. No
  margin, no threshold, and the switch is inside the mechanism rather than
  around it -- which is the shape build 314's serial A/B established and the
  cheapest kind of case this suite has. The blast counter is the same:
  **88.2 of 90** delivered to a body 40 units behind a full-span thread,
  because `applyBlast` measures centre to centre. PULSE is the press every run
  owns (`essential`, so no purchase and no hold can take it) and it is radial
  from the machine, so it never picks a target at all.
- **A MOTE OFF A LOOM CARRIES THE `bond` BLOCK AND CANNOT CARRY A THREAD, AND
  THE DOOR WAS ALREADY SHUT.** `shed` builds every mote with `new Enemy(t,
  ...)` off the PARENT's type -- build 322's LATCH fault, where a mote
  inherited `gait: 'ride'` and grafted onto the next body for free. Here the
  inherited field is inert because `beam` has exactly one writer
  (`spawnPair`), so `threadSpan` refuses on its first property read: measured,
  3 motes with `bond` true, `beam` false and no thread. **Build 322's answer
  was a guard and this one is a door that was already shut, which is the
  better outcome and only knowable by checking** -- the case asserts it rather
  than leaving it to be rediscovered.
- **TWO INSTRUMENT FAULTS IN THE CASE'S FIRST RUN, AND BOTH WERE MINE RATHER
  THAN THE BUILD'S.** The survivor-speed arm read the multiplier as **x0 on a
  build where it works**, because the helper that lays a pair PINS it still --
  `cruise` 0, and `0 * alone` is 0. It sets a cruise of 100 and reads 140 now.
  And the threat arm compared two `toFixed(4)` copies at a tolerance of 1e-9
  (7.3333 against 3.6667 x 2 = 7.3334), which is build 313's own rule --
  **round for the message, divide the raw** -- broken by the build that quotes
  it. Both were caught by running the case through the standalone harness
  BEFORE the suite, which is thirteen minutes an arm cheaper than finding out
  afterwards.
- **RENDER IT AND LOOK, AND THE PICTURE WAS RIGHT FOR ONCE.** Measured off an
  offscreen canvas at world scale: the thread paints **922 lit pixels of which
  906 are green and ZERO carry the harmless grey's signature** (`g` the mean of
  `r` and `b`), peaking at 209 of 255 in a band 10 units deep -- which is
  `stops * 2` = 6 for the core plus the weave's ticks at +-1.6 `stops`, so
  what you see is the width a round has to miss. Build 316's fault (a hostile
  pair strung together in `#8fa9c4`, the game's one grey, which the colour
  rule promises means harmless) is the one this could most easily have
  repeated, and the drawn PNG says it reads as two reels paying out a ladder.
  The core is stroked at exactly `stops * 2` on purpose: the picture is the
  rule rather than a sign for it.
- **THE COST PROXY WAS NOT DELIVERABLE AND IS RECORDED AS THIN RATHER THAN
  QUOTED.** VEIL's build measured 63% of delivered damage going into membrane,
  and the equivalent here would be the share of the assist's locked frames
  whose shot cannot land. Measured over the real wave at rung 32 it read
  **0 of 1,373 locked frames blocked** -- and the run only ever had ONE pair
  and one thread loose in 31 seconds, because the probe's director stub drained
  its jobs before the wave filled. So the zero is a measurement of an empty
  field and not of the mechanism, and it is written down that way. What the
  case carries instead is the controlled A/B, which is an absolute. **A number
  from a scenario that did not happen is worse than no number**, and the tell
  was in the same output: `maxLooms: 2`.
- **BAND 6 DOES NOT EXIST, AND STANDING ONE UP FOR ONE OBJECT WOULD BE WORSE
  THAN THE BAND IT HAS.** The guide puts LOOM, MIRE and KITE in bands 6 and 7
  at rungs 36-49; `CFG.waves.perBand` is 7, so the five authored bands cover
  rungs 1-35 and everything above draws bands 4-5. `budgetAt` is the mean
  threat of a band's OWN roster and `shuffle` filters to the in-band waves, so
  a band 6 holding a single wave would play that one wave at every rung from
  36 to 42. **A band wants a roster, not a member.** Band 5 is where the
  deepest authored play actually is and that is where this went, with the
  guide's rungs recorded rather than quietly honoured.
- **THE WAVE'S COUNTS WERE CHOSEN BY MEASURING AND THE FIRST DRAFT WAS 31%
  OVER.** `[['loom', 4], ['lurcher', 3]]` weighs 47.83 against band 5's own
  mean of 36.44 and would have lengthened every other wave in the band by
  2.2%; `[['loom', 3], ['lurcher', 2]]` weighs 34.33, a ratio of 0.942, and
  re-prices the band by -0.41%. Build 315's lever, used by arithmetic rather
  than by eye -- and the arm asserts THIS wave's ratio to its band's other
  waves, never the band's absolute move, because build 328 already paid for a
  conjunct on how little a wave moves its band (a sibling arriving heavy makes
  it false with nothing about the wave changing).
- **FOUR ARMS FAILED IN THE SUITE AND PASSED STANDALONE, AND IT WAS INHERITED
  WAVE TRAITS: ARMORED DISCARDS A HIT, AND EVERY MEASUREMENT IN THE CASE WAS
  ONE HIT.** Zero damage from a round with the thread down, zero from both
  spools, zero of a 90-point blast, and a YOKE that would not snap -- which
  reads exactly like the object being dead. `Director.load` seeds `d.traits`,
  only `score` clears it (build 327), `scaleToTier` stamps it onto every body
  spawned afterwards, and ARMORED's own rule is that **the first hit each
  second does not happen**. A case whose every arm is a single round, a single
  blast or a single `applyDamage` call is maximally exposed to it. One line
  (`w.director.traits = []`) and the arms assert it, because a zero from a
  world that cannot be hurt is not a measurement. Build 316's note already
  said a case that loads a real wave carries that wave's traits for the rest
  of its life; what is new is that the case that PAYS may be one that never
  loaded a wave at all.
- **...AND MY FIRST DIAGNOSIS WAS THE ERA, WHICH A PROBE CONFIRMED BECAUSE THE
  PROBE DID NOT CONTAIN THE FAULT.** The suite leaves the world at era 2
  (mount 1558 against 1012.6) and `shielded` refuses the damage path above the
  yard wall, so the case's absolute `y 600` was a plausible cause; I made the
  geometry relative to the mount, reproduced era 2 standalone, and it passed.
  It passed because that run had no traits in force. **Two reverts settled it
  in eighty seconds**: restore the traits and the SAME FOUR arms fail in the
  same order; keep the absolute `y` with the traits cleared and all seven
  pass. The era was never a cause. The relative geometry stays as robustness
  and the notes say so rather than claiming a fix.
  **Verify a fix in a world that contains the fault**, which is build 330's
  "the instrument had the identical fault" and build 305's "a probe built on
  the wrong reader agrees with itself" arriving through a third door -- and
  the cheap discipline that catches all three is to reproduce the failure
  BEFORE changing anything.
  **And the liveness conjunct is what turned this into a red case rather than
  a green one**: the A/B's control has to deliver a whole round, so a world
  where nothing can be hurt fails instead of passing empty. An absolute-zero
  arm with no live control would have shipped.
- **THE SUITE IS A READER, AND A GREP THAT STOPS AT `src/` PLUS
  `check-build.mjs` MISSES IT.** `CFG.yoke` had three LIVE reads in
  `regress.mjs`'s own YOKE case (`CFG.yoke.spin`, `.len` twice) and I moved
  the block without them: `CFG.yoke` is undefined afterwards, so
  `CFG.yoke.spin` is a TypeError inside `page.evaluate` -- **which kills the
  runner with no case output at all**, the failure build 310 already paid for
  with `WAVES[-1]`. Caught by grepping again while the suite was running, for
  a reason unrelated to it, and the run was killed and restarted rather than
  read. Thirteen minutes. When a symbol moves, the reader set is
  `grep -rn "SYMBOL" src/ scripts/ index.html sw.js docs/` -- all of it, once,
  before the suite is launched and not after.
- **THE ORDINAL HASH DID NOT MOVE, AND IT WAS WORTH RUNNING RATHER THAN
  ARGUING.** `-1334607133` either side, both readings taken in this container
  per the differential rule, with build 331 served from a worktree on :8098.
  This build puts a NEW DOOR in `resolveSegment` -- the one place a round is
  tested against anything -- on `fight.mjs`'s own hot path, rewires the whole
  `paired` gait onto a different object, and adds a multiplicative term to
  `threatOf`. Every one of those reduces to the identity for a body that is
  not a LOOM, by inspection: the thread loop's first condition is `!e.beam`
  and `beam` has one writer, `pairOn` and `pourPool` are reached by pair types
  alone, and the new `halves` factor is 1 for everything else. **Build 329's
  lesson is that an argument from inspection is exactly what this repo does
  not accept**, and an unchanged hash is what "a collision-model change that
  provably did not touch any existing body" looks like measured -- the same
  claim build 315's capsule made and the only instrument that can make it.
- **The LOOM case leaves `w.up.damage` at 1, deliberately and on the record.**
  Its A/B is a known round rather than a kill, and it is the LAST case in the
  file, so nothing downstream inherits it today; `reset()` rebuilds `world.up`
  from its defaults table, so any case that calls `restart()` clears it
  anyway. Anything appended after it owes itself a damage value, which is the
  same rule the eighteen damage-bench cases already carry about the director
  stub and `spawnLock`.
- **The partner is a LURCHER because the combination is the object.** A
  LURCHER closes and GRIPS, so the thing filling the glitch fuse walks on
  while the rounds meant for it stop on the thread. A heavy partner would just
  be a second wall, and the two-or-three-type rule exists because the problem
  is meant to be a combination.

- **BUILD 333 IS A REVIEW OF THE BUILD BEFORE IT, AND THE BIGGEST THING IT
  FOUND WAS NOT IN THE DIFF: NINE BAND-5 WAVES HAD BEEN DELIVERING 1-3% OF
  THEIR AUTHORED TOW AND PAIR BODIES.** `Director.emit` takes the whole job
  off the list with `shift()`, and two paths past that point release less than
  the job asked for and drop the rest:
  - a type it REFUSES to form up (`tows`, `pair`) fell through to one release
  - a formation LARGER than the field's headroom released `room` and returned
  Measured at rung 32, era 2, driving `load` then `emit` with the field held
  empty so nothing but the job list decides -- authored bodies against arrived:
  **tow+needle 1 of 96 · tow+bulwark+mote 1 of 18 · tow+prism+needle 1 of 32 ·
  tow+herald+mote 1 of 88 · tow+splitter 1 of 76 · tow+needle 1 of 50 ·
  tow+glut+mote 1 of 40 · yoke+glut 2 of 126 · loom+lurcher 2 of 62**, while
  every OTHER type in those waves arrived in full (prism 32 of 32, glut 20 of
  20). The mote job of the one wave that carries both faults read 57 of 70 --
  the field cap exactly, with the other 13 gone.
- **IT COST NOTHING VISIBLE, WHICH IS WHY IT LASTED.** No verdict goes down
  (`score`'s three are surge/clean/stall and the glitch timer is the only way
  down), and `cleared()`'s denominator counts what is still QUEUED -- so the
  denominator fell with the dropped job and the bar read fine. The only symptom
  was that band 5, the deepest authored band, was quietly cheaper than its own
  prices: `load` scales an entry until the wave's threat meets `budgetAt`, and
  `threatOf` counts a TOW's load and both halves of an unpooled pair, so the
  budget had bought bodies `emit` then threw away. **A fault with no failing
  signal needs somebody to ask the door what came out of it**, and what made me
  ask was noticing that build 332 never measured its own wave's CLEAR -- the
  arm build 330 called "the one most worth having".
- **THE FIX IS ONE PREDICATE AND ONE RE-QUEUE, AND BUILD 313 HAD ALREADY
  WRITTEN BOTH HALVES DOWN.** Three sites decided whether a count may arrive as
  a shape and all three answered differently: `!solo` in `Director.load`,
  `!tows && !pair` in `emit`, `!tows && !solo` in `spawnFormation` -- so a pair
  was grouped by the first and refused by the second, and `spawnFormation`'s own
  filter had never heard of a pair at all. `formable(type)` is the one function
  now and all three read it. And the partial formation re-queues its remainder,
  which is the rule the gate TWENTY LINES ABOVE IT states in as many words:
  "hold the job rather than dropping it: a wave is a group, and losing half of
  it to a cap the player is about to clear would make waves quietly
  inconsistent." **A rule written down is not a rule applied** -- that gate
  keeps it, and the branch one screen down broke it.
- **A JOB THAT CAN GO BACK ON THE LIST BREAKS AN ARITHMETIC THAT ASSUMED IT
  COULD NOT.** `press`'s progress term is `1 - (jobs.length - 1) / (jobsAt -
  1)` off the count captured at `load`, and a re-queue can make `jobs.length`
  exceed `jobsAt` -- which sends `done` negative and extrapolates the gap ramp
  past its own opening value instead of interpolating inside it. Clamped.
  **Anything that makes a monotone quantity non-monotone owes every reader of
  it a re-read**, which is the same shape as build 301's closed seam breaking a
  case whose window was shorter than the old gap.
- **THE PRICE IS MEASURED AND THE LADDER STAYS INSIDE ITS CAP.** Heaviest
  ordinary wave of each band, at that band's own middle rung, fully bought,
  everything delivered, nothing left standing: **band 1 5.0s (18 bodies) ·
  band 2 9.1s (15) · band 3 9.6s (37) · band 4 31.8s (60) · band 5 46.2s
  (137)** against the 120s cap, and band 5's three pair/TOW waves at rungs
  29/32/35 read 25.6 to 68.0s. Before the fix the same band-5 waves cleared in
  17.6-41.2s, so the deepest waves now cost about twice the seconds -- which is
  the budget being delivered rather than a nerf, and it is recorded here
  because build 306 already owns the sentence about band 5 and the cap.
- **THE GUARD IS ON THE THREE SITES STILL READING ONE FUNCTION, not on a
  value.** `check-build` finds each site by its own source line and fails the
  build if it tests anything but `formable(` -- build 314's idiom, which read
  the multiplicity list out of `release`'s own source rather than keeping a
  list beside it. **Proved able to fail**: reverting `emit`'s site to
  `!t.tows && !t.pair` in a copy of the tree exits 1 with
  "Director.emit forms up tests `!t.tows && !t.pair` instead of calling
  formable()". A fourth multiplicity field is then one edit rather than three
  that can be made two at a time.
- **...AND THE CASE ASKS THE DIRECTOR FOR EVERY WAVE, WHICH IS WHAT CAUGHT THE
  SECOND DROP.** Its first version asked only the waves carrying a type that
  cannot form up -- and it caught the partial-formation drop BY ACCIDENT,
  through the one TOW wave that also carries a mote job of 70 against a cap of
  57. Widened to all 41 ordinary waves it reads 41 of 41 delivering every body
  they asked for, worst ask 304, and it costs 3.3 seconds because it drives
  `load` and `emit` with the field cleared rather than playing anything.
  **A guard scoped to where you found the fault will only find that fault**;
  the vacuity terms are the roster's own (there are types that cannot form up,
  waves that carry them, and 27 of 41 asks larger than the field cap).
- **STASIS HELD A LOOM'S ROTATION AND NOT ITS THREAD, WHICH IS BUILD 319'S
  `Enemy.face` FAULT IN CODE ONE DAY OLD.** The growth clock sat one line
  ABOVE `const slow = this.frozen(world) ? 0.12 : 1`. Measured over six
  seconds of a pinned field, with the unheld run as the control: the rotation
  delivered **0.031 rad/s against 0.288 free** -- the factor working -- and the
  thread widened **57.4 units either way, to the tenth**, 30% of its whole
  span, while the body was to all appearances stopped. The one press a player
  has against this object did not touch the only thing it does. `dt * slow`,
  and the arm asserts the growth is held by THE SAME factor as the rotation
  rather than quoting 0.12 -- which is written out in five places in
  enemies.js with no `CFG.stasis` to read it from, so a sixth copy in the
  suite would be the hand-kept-list shape. Measured after: 0.120 against
  0.128, one factor, both mechanisms.
- **`drawHitboxes` COULD NOT SHOW THE ONE THING IN THE GAME THAT STOPS A ROUND
  MID-FIELD, AND THAT IS THE THIRD TIME.** Build 315 had to teach that overlay
  SPINDLE's capsule and 319 FLINT's arc, and both notes say in as many words
  that it is the only place the hit profile can be SEEN -- then 332 added a hit
  boundary that is not attached to a body at all and did not teach it. It draws
  the thread from `threadSpan`, the same function the sweep tests against, so
  the picture cannot drift from the rule (319's correction to `drawFlint`'s
  arcs). Measured: **484 overlay pixels along the thread with the link up
  against 0 without it**, in a band 4 units either side of the axis against a
  thread radius of 3 -- what is drawn is the width a round has to miss.
- **THE ROTATION RATE WAS UNASSERTED, AND MEASURING IT IS HOW I FOUND THE REST
  OF THIS BUILD.** YOKE's case has had an arm on its delivered rate since 316
  ("the case is on the delivered rate, never on the expression that asks for
  it") and LOOM shipped without one, on a gait whose ask SCALES with a
  separation that grows 3.4x over the body's life. It is fine -- **0.281 to
  0.316 rad/s across four separation bins against an authored 0.3**, against
  0.189 for the same blend uncompensated -- and the arm now says so with the
  uncompensated figure as its discriminator. The probe that measured it is what
  turned up the crossing (31.9s at era 1, 52.3s at era 2, closing 21-22 u/s)
  and then the clear, and the clear is what turned up the drop.
- **RECORDED, NOT FIXED: a LOOM at a side wall is squeezed to 55% of its
  span.** `edgeEase` pushes anything within 96 units of an edge back at 300
  u/s^2 and the rigid link gives way: measured, a pair forced to its full 190
  and released at `r + 24` from the wall settled at **104.6**, so the blocking
  span there is 65 units rather than 150, with no damage and no jitter (the
  link's length held between 104.6 and 190 and neither half died). The wall
  rule winning is the documented precedence -- `edgeEase`'s own docstring is
  about exactly this -- and in a real wave it costs nothing: over the whole
  band-5 wave at three rungs the mean separation read 115-150 with a max of
  190, so the pair reaches its full width where it matters.
- **THE TETHERED TRAIT SHARED HEALTH ACROSS ANY TETHER IN THE GAME, AND A TOW
  WAS BEING HEALED BY IT.** The trait's block in
  `spawnGroup` strings two unpaired bodies together and `applyDamage` then
  poured one half's `hp` onto whatever `this.tether.other` happened to be --
  and `tether` is written by THREE things, only one of which is a health pool.
  Measured with the trait rolled: a TOW's head hit for 50 wrote its health
  onto the MASS it drags, taking the mass from **126 to 254** (it is the
  heavier half, so the assignment is a heal), and a LOOM pair became ONE pool
  -- hit one half for 50 and the other read the same, which is the difference
  between the two pair types collapsed by a wave rule. The fix is one field:
  the trait marks its OWN link `shared: true` and the share tests it, so
  `spawnTow`'s cable and `spawnPair`'s beam are untouched. YOKE still shares,
  through `bond.pool` in `pairOn`, which is where a pool belongs.
  **A field read for what it IMPLIES rather than for what it SAYS** is build
  234's `harmless` lesson (borrowed for a side effect) from the other side: a
  tether says two bodies are joined, not that they are one body.
- **ONE CLOCK PER LINK, AND `staged` IS PER BODY.** `pairOn`'s docstring said
  a pair queued in the throat "arrives at its authored `len` however long the
  mouth held it" because `drive` refuses the method for a `staged` body. It
  does not: `staged` clears per HALF, so the half born first ran the growth
  clock while its partner was still marching, and each half wrote its own
  `tether.len`. `solveTethers` reads whichever half is currently LEFTMOST and
  a rotating pair swaps that twice a revolution, so the constraint's target
  flipped between two diverging numbers. Measured on the real wave at rung 32,
  era 2, three runs: the halves clear `staged` up to **147 frames** apart, and
  the separation on the frame both are loose read **55.9 to 79.0, mean 61-62,
  worst +41%** -- so the blocking span the whole object opens with ("16 units
  at `len` 56", quoted in three places) measured **15.9 to 39.0, up to 2.4x**.
  `Math.min(this.bondT, o.bondT)` is the pair's age since the LATER half came
  loose: symmetric, monotone, and the honest reading. Re-measured the same
  way: **55.94 to 56.53, mean 56.07-56.13**, blocking 15.9 to 16.5.
- **...AND `e.staged = true` FROM OUTSIDE IS NOT A HOLD, WHICH COST THE ARM
  TWO ATTEMPTS.** `Enemy.update` clears the flag inside the same `g.update`
  that a probe sets it in -- on the frame `y - r` passes `entryLine` -- and
  `drive`, where `pairOn` is called from, runs AFTER it in `physicsStep`. So
  re-asserting it before every step held it for **0 of 60 frames** and both
  clocks read 3.000: no stagger at all, on a build where the mechanism works.
  What produces one is the geometry the throat produces -- the pair STRADDLES
  the entry line, lower half born and upper half still marching -- which is
  held by the line itself and needs nothing to fight. 71 to 92 frames of
  stagger, and reverted to a per-body clock the two records read **132.57 and
  117.90**, 14.7 units apart. **A flag with one writer cannot be driven from
  outside it; arrange the state that writer is about.**
- **A CASE WHOSE EVERY ARM WRITES `staged = false` ON BOTH HALVES IN ONE
  STATEMENT IS A CASE THAT CANNOT SEE A PER-BODY CLOCK.** Build 332's growth
  arm read the ramp as 0.19% out while the figure was 41% out in play, because
  the one arrangement a per-body clock is right for is the one the case set
  up. The general shape: **a setup that normalises the very asymmetry the
  mechanism is about measures the symmetric case and reports it as the
  mechanism.** The two records now differ by one SUBSTEP of the ramp (0.08 of
  the 0.16 a frame is worth, because the halves run in series and the second
  one's `min` has already seen the first one's increment) -- a bounded lag,
  asserted off the ramp rather than off the day's value.
- **`span` ALSO SETS THE STANDOFF AT THE MACHINE, AND THAT WAS SILENT.** Both
  halves steer at the mount and the link is rigid, so a pair that survives its
  transit parks STRADDLING the machine at `span / 2` = 95 -- against a grab
  distance of `r + s.r + grabPad` = 48. Measured over ninety seconds with
  nothing shooting: closest approach 71.2 and 84.9, settling at 99 / 91, **zero
  grip frames and `world.attackers` empty**, where a YOKE (half-link 30
  against a grab of 54) grips on arrival and holds 4,142 frames of 5,400. So a
  LOOM never bills `impactDamage` and never feeds the contact half of the
  glitch fuse. Both behaviours are defensible -- a LOOM is a wall that costs
  rounds, and its wave pairs it with a LURCHER, which is the half that grips --
  so this is build 329's broadphase cell one field along: **the coupling is
  correct and the silence was the fault, and the fix for a silent correct
  change is a pin, not a revert.** `check-build` prints the standoff and which
  side of the grab band each pair sits on, deliberately without refusing
  either, because which side is a design decision.
- **TWO OF THE NEW PAIR GUARD'S THREE CLAUSES COULD NOT FAIL.** `pairOf`
  throws unless `bond.len > 2r` (which IS "the insets leave a thread") and
  unless `bond.span > bond.len` (which IS "growing widens it"), and
  `check-build` builds its pair list BY CALLING `pairOf` -- so a type that
  broke either never reached the loop. Gone, with the reason at the site:
  a clause that is counted and cannot fail is worse than a missing one. What
  is left is the arithmetic nobody else does, that a thread `2 * stops` thick
  fits between the insets at `len`, which is the narrowest the link ever is.
- **AND THE GLOSSARY DREW ONE TYPE'S ICON FROM ANOTHER TYPE'S BLOCK.**
  `case 'yoke': drawYoke(..., TYPE_BY_ID.yoke.bond.len / 2)` inside
  `drawSpecimen`, whose switch already has the type in scope as `t`. Latent
  today because one type declares `shape: 'yoke'` -- and it is the exact fault
  this build spent itself on (a number about the BODY read from a shared
  place), one draw call along, written by the build that moved the block.
- **THE HASH WAS RUN AND DID NOT MOVE -- `-1334607133` EITHER SIDE, both
  readings taken in this container with 332 served from a worktree on :8097.**
  It is not the instrument for the WAVE half of this build and that is
  structural rather than a shrug: `fight.mjs` opens from `openBoss` and
  `Game.update` is `if (w.boss) {...} else { director.update() }`, so the
  director never releases and the engine is invisible to it -- builds 300,
  301, 307 and 318 all recorded that, and 318 corrected the one reading that
  had claimed otherwise. What it IS the instrument for is the tether share,
  because that is a new condition on `applyDamage`, which is the door every
  hit in a boss fight comes through. No boss module writes a `tether`, so the
  narrowing is unreachable there by structure -- and build 329's lesson is
  that an argument from inspection is exactly what this repo does not accept.
  An unchanged hash is what "a change on the damage path provably did not
  reach anything already using it" looks like measured, which is the same
  claim build 332 made about `resolveSegment` and 315 about the capsule.
  The instruments with something to say about the rest are the census (asked
  against arrived, per wave) and the clear table, and both are above.

- **BUILD 334 IS 333'S SUITE RUN, AND THE ONE RED CASE WAS 333'S OWN FIX
  HOLLOWING OUT A 332 CONTROL.** 740 of 741, and the failure was the YOKE
  formation arm reporting its pair half perfect (60 releases, 2-2 bodies, 120
  of 120 halves beamed, 0 beams off, 0 overlap) with **the control missing
  entirely** -- its detail printed `?` for the type and `?-?` for the count,
  which is the arm's own message saying the comparison never happened.
  Measured rather than guessed. `Director.load` refuses to group a type that
  cannot form up (333's `formable`), so the authored `['yoke', 6]` swells to
  **64 at rung 32 and is pushed as sixty-four jobs of ONE** where it used to
  be one job of 64 -- and `load` then Fisher-Yates SHUFFLES the list, so the
  wave's single `glut x11` job lands at a uniform index in 0..64. A census
  that stops at sixty releases misses it whenever it lands past 60: five
  indices of sixty-five, **about one run in thirteen**. Before 333 the yoke
  entry was one job and the control was hit in the first two iterations,
  always.
  So a correctness fix turned a case's `for` bound into a 7.7% flake, which is
  build 331's finding verbatim -- **a loop bound is a fitted margin wearing a
  `for` statement's clothes** -- and the fix is the same: load once, drive
  until the jobs DRAIN, bound the loop off the wave's own job count as a
  backstop, and assert `jobs left === 0` so the control cannot go quiet again.
  Reads 63 releases, GLUT 11-11, 64 jobs asked and 0 left, three runs of
  three. **Anything that changes the SHAPE of a list owes a re-read to every
  case that walks it a fixed number of times.**
- **THE ONE SIGNAL THAT A ROUND WAS EATEN VANISHED EXACTLY ON THE FIELD THE
  OBJECT IS PLAYED ON.** Build 332's thread absorb threw three `spark`s and
  nothing else, and `spark` returns null on its first line once
  `fx.budgetLeft` is spent -- which is `maxParticles * quality -
  active.length`, and a crowded band-5 wave with a bought turret spends it
  every frame (build 325 measured a single boss teardown making 164 particles
  in one frame of a 620 budget, 279 at the governor's 0.45 floor). Measured on
  the same shot either way: a clear field adds **7 particles** and a field
  whose frame budget is spent adds **ZERO**, with the round still absorbed and
  **no ring to fall back on**. The mechanic was perfect and the player was
  told nothing. Nothing could fail for it: every arm in the case measures the
  DAMAGE, and the damage was right.
  `ring` has its own pool and is not budget-gated, so the mark is a ring now
  and the sparks are what the budget adds when it can. Three existing rules
  shaped it: FILLED and small, because `ring`'s `fill` term is a `drawGlow`
  under `lighter` and overlapping outlines scribble while overlapping glows
  add (build 330's AIRBURST); drawn AT the radius it means rather than
  expanding into it, because `drawFx` fades and thins a ring as it grows
  (211); and sized off `bond.stops`, the half-thickness a round has to miss,
  so it claims no reach it does not have (330's rule about HAIL's held
  circle). Rendered and looked at, zoomed x4 off an offscreen canvas: one
  absorb reads as a bright ring with a glow core sitting ON the thread, and
  three SCATTER volleys into one thread ADD into one brighter mark rather
  than scribbling. Revert-proved: with the ring taken out the arm reads 0
  rings both ways.
  **The general shape: an effect whose whole feedback goes through a BUDGETED
  pool has no feedback in the state it is about.** Grep for a mechanic whose
  only mark is `spark` or `dot` -- both gate on `budgetLeft` -- and ask what
  the field looks like when it matters.
- **AND THE INSTRUMENT FOR THAT HAD TO STARVE THE FIELD THE WAY ONE ARRIVES.**
  Writing `fx.quality` does not do it: the governor floors it at 0.45 and
  `resize()` owns the backing store, which is the trap build 198's governor
  case already records. Filling the pool with real sparks until
  `budgetLeft <= 0` is the honest reproduction, and the arm asserts the pair
  -- `starved.budget === 0` and `free.budget > 0`, `free.parts >= 3` and
  `starved.parts === 0` -- because without it the case is two identical runs
  agreeing with each other. And the first version of the probe wrote
  `fx.particles.active = 0`: `active` is an ARRAY, so the next `spawn()` threw
  `this.active.push is not a function` and the probe reported the game broken.
- **`pgrep -f` MATCHES ITS OWN WAITER, AND THAT COST FORTY MINUTES OF
  WAITING.** `while pgrep -f 'regress.mjs --json' >/dev/null; do sleep 30;
  done` never exits, because the `bash -c` running the loop has that pattern
  in its own command line -- so three separate background waiters sat forever
  and I went on reporting the suite as running when it had finished. It was
  found by `ps`: load average 0.18 and no node process. CLAUDE.md already
  records the destructive half of this (build 310: `pkill -f` killing its own
  shell, exit 144) and the read-only half from the same note; what is new is
  that the read-only half does not error -- it just never finishes, and it
  looks exactly like a long run. **Watch the OUTPUT FILE, not the process
  name**: the runner writes its summary and its `--json`, and `ls -la` on
  those answers the question in one command.
- **BUMPING THE BUILD LITERAL WHILE A SUITE IS RUNNING KILLS THE SUITE, AND
  THE UPDATER IS DOING ITS JOB.** `regress.mjs` drives the SERVED tree on
  :8099 with `-c-1`, and `main.js`'s `askServer()` range-fetches the first
  4096 bytes of index.html and reloads the page when the build literal it
  reads differs from its own. So editing `index.html` and `src/config.js`
  mid-run -- which is the last step of every build -- makes the page reload
  itself and the runner dies with **"page.evaluate: Execution context was
  destroyed, most likely because of a navigation"**, thirteen minutes in, with
  ten lines of stack and no case output at all. CLAUDE.md already recorded
  this from the other direction (build 329: match the literal in BOTH files
  in a bisect worktree, or the same thing happens); the live tree has the same
  exposure and it is the one edit every build makes. **Bump the literal before
  the run or after it, never during** -- and if a run dies with that message,
  check `curl -s -r 0-4096 .../index.html` against the page's own build before
  looking for anything else.
- **Recorded for the next object rather than acted on here: EVERY RANGED
  ATTACK ALREADY IN THIS GAME IS COSMETIC.** KITE, one of the two objects
  left in phase 6, is specified as "the first body in the game that attacks
  from outside contact range". That claim is false and the existing instances
  are the warning. Verified by grep: `world.shock` is written at TEN sites --
  `amplitude.js:373`, `boss.js:1590` (the lash), `dynamo.js:384/574/759`,
  `gnomon.js:348/361`, `parity.js:359`, `terminus.js:482/794` -- and its only
  readers are `game.js:3863` (decay at `dtRaw / tow.hurl.shockFor`) and
  `game.js:3872`, where it is one term of `glitch.level`, the compositing
  shader. So nine boss ranged attacks deliver a look and nothing else, and
  `CFG.glitch.perAttacker` is 0.34 against TERMINUS's beam at 0.30: **one
  LURCHER touching the machine is worth more shader than every ranged boss
  attack in the game, and unlike them it also fills the fuse, taxes the intake
  and scores the wave.**
  What that means for the object: there is no turret health at all (the
  `Shooter` constructor declares no `hp`, no `applyDamage`, and `game.js`'s
  pair solver bills `impactDamage` behind `if (a.applyDamage)`, which is false
  for it), so a bolt cannot do damage and a bolt that only sets `world.shock`
  is the tenth empty payload -- which is what GYRE was withdrawn for at 331.
  The two channels that ARE live and reachable from range, both verified by
  reading: the fuse's CROWD half, which a standing body already feeds through
  `hostileCount` and the build-291 release gate with no new code; and salvage
  denial, which `Enemy.feed` (a GLUT eating `world.drops`, marking them `dead`
  and `dissolved` so they pay nothing) already does from the floor. The intake
  tax is NOT reachable as written -- `intakeRate` reads `world.attackers.size`
  and nothing else, and `checkContact` re-tests and evicts every frame, so a
  body at range cannot be in that set. And `Game.watchGlitch` is
  `burn === 'crowd' ? ON_CROWD : ON_GLITCH`, a two-way ternary, so **a third
  cause would silently be captioned "clear the turret"** -- which is exactly
  the fault build 293 wrote `burnFrom` to fix.

- **KITE IS IN FROM BUILD 335, AND WHAT SHIPS IS THE STATION: THE BOLT IS
  336.** Phase 6r, band 5, the eighteenth object of the nineteen. It closes
  to a station derived from the machine's own reach and holds it, drifting
  sideways in ranks, and never comes closer. One to go -- MIRE, which
  `docs/objects.html` itself says wants a re-spec before it is built.
- **THE GUIDE'S 420 IS NOT A DISTANCE, IT IS ONE ERA'S ANSWER TO A
  DERIVATION, AND IT FAILS FOUR WAYS.** "Holds 420 units and never comes
  closer" is 0.326 to 1.366 of the rim-to-mount column depending on the
  screen and the era -- a 4.2x spread in what one sentence means. Measured
  off the running game at all six cells: at 320x568 era 1 the station is
  **112.6 units ABOVE the portal rim**, so the body drives back up to a place
  it cannot legally stand and nothing removes it (`rise`'s gone-above check
  is gait-specific); at 320x568 era 2 its leading edge is **68.5 units behind
  the yard wall**, where `shielded` refuses every damage path the player owns
  -- build 318's recorded SHRIKE fault on a body that does not move; and
  **`420 - r` is 400.00, which is `CFG.shooter.aimRange` to the digit**, so at
  era 1 the margin against an unbought assist's reach is ZERO on every
  viewport. That last one is also the READING of the whole number: 420 is
  "the far edge of what the assist can reach, plus the body's radius" -- the
  derivation already, evaluated at era 1 and written down as a distance. So
  the station is derived (`standWall`), and the object's fairness is then a
  theorem rather than a tuning: measured, the reach margin is exactly **two
  radii** in the four cells where the reach binds, and the floor binds in the
  other two.
- **...AND A CLAIM ABOUT A RANGE CANNOT BE DERIVED AS A HEIGHT.** The first
  version took the station straight down the machine's own column, which is
  right for one body directly above the mount and wrong for every other
  moment: `autoTarget` measures `hypot(dx, dy) - r`, and the body DRIFTS.
  Measured with a single body at era 2, the reach margin at the station read
  **4.8 units** instead of the 40 the derivation promises, and at the wall's
  outer column it would have been outside the stock reach altogether. It is
  taken on the CIRCLE of radius `reach - r` at `dxMax` -- the lateral offset
  the outermost body actually reaches at the extreme of the drift -- so every
  body is inside the stock reach at every moment. The guide's own words for
  the gait are "closes to its own RANGE and holds it"; the noun was the
  specification. **Proved by revert: restoring the straight-down version
  fails two of the case's five arms.**
- **A SINUSOID THE BODY CHASES IS A STATION THE BODY CANNOT REACH.** The
  slide was first authored as `sway` radians a second across an amplitude of
  `slide * halfWidth`: 0.42 x 314 x 0.55 is a target point moving at **72.6
  u/s against a body delivering 25.9**, so the "slide" would have been a lag
  and the amplitude unreachable. `sway` is a SHARE OF THE BODY'S OWN CRUISE
  now and the rate is derived from the amplitude (`omega = sway * speed /
  amp`), which makes the peak of the drift's own speed exactly that share by
  construction. That is "a target speed is not a speed" from the other side:
  ten times this repo has grossed up a number the body under-delivers, and
  this is the first time the authored number was one the body could not
  deliver at all. The approach itself IS compensated and measured **35.2 to
  37.2 delivered against an authored 36**, where the uncompensated arithmetic
  gives 25.9 -- the rule being already in the file is why that was right on
  the first run.
- **THE RANKS WERE JUSTIFIED AGAINST A STATION THAT NO LONGER EXISTS, AND
  THAT IS THE MOST GENERAL THING THIS BUILD FOUND.** Every body of a type
  derives the same station and build 301 made a wave's counts a budget, so an
  authored three is 17 bodies at rung 20 and 43 to 57 at rung 35 on a line
  that holds six. Measured, the excess went where `resolvePair` could put it
  -- DOWN, onto the machine, `|y - station|` 97 to 181 mean and the worst body
  PAST the mount -- so a standing body takes a SLOT, a column and a rank, and
  `CFG.ranks` was written with that table in its docstring. Then correcting
  the station onto the reach circle moved it 102 units further out, and
  **re-measured, ranks against one rank at rungs 29/32/35, neither piles onto
  the machine any more**: grip 0 either way, deepest 202-358 clear against
  290-327. The ranks are still worth having for smaller and different reasons
  (the allocator needs a slot space wider than one rank, or every body past
  the eleventh is sent to a place another body holds; and the crowd comes out
  wider and shallower, y spread 148-219 against 182-259) and they are NOT
  what keeps the promise. **The fix for the fault a docstring describes can
  be the thing that makes the docstring wrong**, and the docstring then reads
  as current. Corrected in place with both measurements rather than rewritten.
- **THE CASE'S ZERO IS ABOUT THE GAIT AND THE CONTROL IS A BULWARK.** With
  kites alone on the field, over four cells of era and rung: **zero grip
  frames**, 181 to 358 units of clearance and zero shared slots. With the
  whole wave: 172 to 11,332 grip frames and the deepest kite past the grab
  line -- all of it the BULWARK ploughing through the line, which costs the
  kite (contact bills `impactDamage` both ways) and is physics rather than
  the gait. A zero from an instrument that has never read a one means
  nothing; that second arm is what makes the first one a fact.
- **ONE PRESS CLEARS THE WHOLE STANDING LINE, and it is the counter the codex
  line names.** KITE is the lightest body in the game (mass 1, tied with a
  MOTE at half its radius), so a 3000-impulse press leaves it at **713 u/s
  against a `thrownSpeed` cap of 720** -- the fastest anything can be thrown
  -- displacing the line 434 units and buying **14 to 16 seconds**, with all
  six surviving. Time bought, not a kill. The control is an ANVIL at 0.00.
  PULSE is `essential`, so no purchase and no anomaly can take it.
- **THE GUIDE'S COUNTER IS STRUCK, for the reason FLINT's was.** "Close the
  distance: it has no answer to something already inside its range" -- there
  is no such move. The turret is static with `invMass` 0 and no `hp`, and
  `CFG.gun.inPlay` has been false since build 289, so the player cannot push
  up-field at all. What the line names instead is the gun and the REACH (it
  stands at 90% of what an unbought assist can see, so this is the one body
  worth buying ARRAY for -- the complement of build 323's finding that DEEP
  ARRAY makes CHAFF *worse*), the press, and the shove.
- **THE FAMILY HEX IN THE GUIDE IS BLOOM'S AT dE 0.00, AND MY OWN COMMENT
  CLAIMING OTHERWISE CHECKED THE WRONG ROSTER.** `docs/objects.html` gives
  the volatile family `#ff5d8f`; that is BLOOM's body colour and `#ff2d6f` is
  BLOOM's glow, byte-identical, and BLOOM is a loose hostile in five waves --
  four band 3, one band 4 -- while `bandsFor` returns `[hi - 1, hi]`, so every
  rung from 29 up draws bands 4 and 5 together. It is also the AMMUNITION
  branch root in the tree and BLOOM BLAST's row in the ledger. The type
  shipped for one afternoon under a comment reading "this is the first body
  to wear it, so there is no collision to answer yet" -- **false, and the
  mistake in it is worth more than the colour: it checked the GUIDE's family
  roster (MIRE, KITE) instead of the LIVE one.** Nothing in `check-build`
  tests uniqueness (the colour guard is grey-means-harmless plus a chroma
  floor, and 0.635 passes), so it would have shipped in silence. Swept the
  rose band against all 120 roster tones and all 556 distinct hex literals in
  the tree on a dE76 instrument validated first against five figures recorded
  above: `#fa003a` is **40.4 from BLOOM's body**, 26.6 from its glow, and has
  nothing within 12 of it anywhere. Build 322's rule applied rather than
  quoted: before accepting a dE-0.00 collision, ask whether the family has
  room.
- **THE TYPE'S BLOCK IS NOT CALLED `standoff`, AND THAT IS BUILD 324's TRAP
  ONE FIELD ALONG.** It was, for an afternoon. `standoff` appears **43 times
  in `src/` outside config.js** -- `Sandbox.standoff`, `CFG.ordinal.standoff`
  and a `C.standoff` in five boss modules -- so build 313's dead-field sweep,
  which asks whether a key any type declares appears as `.key` or as a quoted
  string anywhere in `src/`, would have passed it whatever read it. Exactly
  `reform` colliding with `Boss.reform`. `lob` has zero other hits and is the
  guide's own noun. That sweep errs toward PASSING by design, so **the shape
  to avoid is a field name that is also a name anywhere in the tree** -- grep
  the candidate before declaring it.
- **THE WALL MAY NOT SUBTEND MORE THAN 45 DEGREES, AND THAT BOUND CANNOT BITE
  ON A PHONE.** Without it a wide enough field takes `dxMax` past the reach
  radius, `span` goes to zero and the station collapses onto the CEILING --
  one rank sitting on the grab band, the object inverted, in total silence.
  Bounded, a wide field narrows the WALL instead. It bites past a field of
  about 1471 world units, roughly a 592-point screen at era 2 -- wider than
  any phone and inside what a tablet hands over -- and all six supported
  cells are unchanged to the digit (`dxMax` 108 to 363 against a bound of 269
  and 421). Build 198's rule from the safe side: a threshold no supported
  device can reach is still worth writing when the device that CAN reach it
  exists.
- **THE WAVE IS THE CLOSEST TO A BAND'S OWN MEAN ANY OF THE NINETEEN HAS
  BEEN.** `[kite 3, bulwark 1, mote 1]` weighs 36.567 against band 5's mean
  of 36.2857, a ratio of **1.0077**, re-pricing the band by **+0.052%** --
  build 315's lever, and the counts were chosen by measuring the alternatives
  (four kites and a BULWARK is 1.0987 and +0.66%; three and two LURCHERs is
  0.6982 and -2.01%). The BULWARK is the combination -- 676 of health behind
  0.4 of armour is fifteen seconds of barrel at close range, and the whole of
  KITE is that it will not come and be shot while you are busy -- and the
  MOTE is there so the difference is on the screen at once. And `threatOf`
  prices a kite at 4.333, its health over `threatPerHp` and nothing else: it
  cannot see that the body stands at the edge of the reach, which is the
  FIFTH instance of that blind spot after FLINT's armour, LATCH's host,
  CHAFF's assist and LOOM's thread.
- **THE CLEAR IS THE LONGEST IN BAND 5 AND STRADDLES THE 120-SECOND CAP.**
  Fully bought, era 2: 44.8s at rung 29, 40.6s at 32, and **116 to 128s at
  rung 35** against siblings at 55.7, 61.1 and 88.8 on the same rung. Same
  shape as REMNANT's wave and for the same reason -- the body's own transit,
  and `Director.standing` counts a kite until it dies, so the tempo cost is
  real with nothing being thrown. Band 5 already misses that cap at four of
  seven rungs on the era-2 field (build 306), so this is a marginal worsening
  of a documented plateau: **recorded, not tuned**, which is build 304's rule.
- **`applyDamage` TAKES POSITIONAL ARGUMENTS, AND AN OPTIONS OBJECT BECOMES
  THE IMPULSE.** `e.applyDamage(w, 1, 0, 0, { impulse: 3000, throwOff: true })`
  is legal JavaScript: the object lands in `impulse`, the velocity goes NaN,
  the body is lost for the run and nothing throws. The signature is
  `(world, dmg, nx, ny, impulse, shred, lever, throwOff, src)`. The tell was
  a column of `null` in a JSON dump where every other cell had a number --
  and the one type that read 0.00 was the ANVIL, which is `planted` and skips
  the impulse block, so the ONE correct cell was the one measuring nothing.
- **A PROBE THAT RELEASES BODIES ABOVE THE PORTAL SURFACE GETS `entrySpeed`
  IN FULL AND THEY KILL EACH OTHER.** Six kites laid at `40 - i * 90`, i.e.
  down to y -410, are all above the surface where `portalDepth <= 0`, so the
  march multiplier applies whole: they arrived at 2.6x cruise, piled, and
  **6 of 6 were dead at 50 seconds** -- which reads exactly like the gait
  being broken. Released at one y, spread in x, the same code stands 6 of 6.
  The same family as build 192's body spawned 240 units above the floor.
- **THE READ-ONLY FAN-OUT FOUND BOTH SILENT COLLISIONS AND WAS REVIEWING THE
  WRONG TREE.** Six lenses plus an adjudicator over committed HEAD, while the
  type sat uncommitted in the working tree -- so every lens reviewed build 334
  and the adjudicator had to say so in its first paragraph. It still scored
  the two things that would have shipped in silence (BLOOM's colour, the
  `standoff` name) and independently reproduced the station's four failure
  modes to the decimal. The standing rule held as well: its wall-clearance
  figure for era 2 at 320x568 was right and one lens's was stale, its
  candidate-wave threats were computed with an injected `hp` because
  `threatOf` returns 0 for an unknown id, and its recommended rank
  justification is the one this build then measured away. **A fan-out's
  finding is a pointer to the right file; the mechanism is still yours to
  measure** -- and if the tree it reviewed is not the tree you are shipping,
  say which is which.
- **AND A STALE DERIVED FIGURE FOUND ON THE WAY PAST: `yard.js`'s docstring
  says "the wall stands at 561.5 and the turret at 848.1, so the open field
  between them is 287 units".** Measured live, the turret is at **873** and
  the open field is **311.5**: 848.1 is the pre-build-292 figure at
  `--bar-h: 74`, which is 64 now. The claim the paragraph makes still holds
  (the boss standoffs are 340-380 and do not fit), so this is a copy going
  stale rather than a rule breaking -- build 329's rule, and the grep it asks
  for.

- **`pkill -f` MATCHED ITS OWN SHELL AGAIN, AND THIS TIME THE PATTERN CAME
  FROM A HEREDOC.** CLAUDE.md has recorded the read-only half (`pgrep -f`
  matching its own shell) and the destructive half (exit 144) twice. The new
  way in: the command wrote a probe file with `cat > f <<EOF` whose CONTENT
  contained the browser's path, so the shell's own `args` contained the
  pattern -- and the `pkill -9 -f "pw-browsers/chromium"` at the front of the
  same command killed that shell before the `cat` ran. Exit 1, no output, and
  the probe file simply did not exist, which reads as the heredoc failing.
  The same self-match makes `pgrep -cf regress.mjs` answer **1 on a clear
  machine**. What is safe is a listing that excludes the wrapper:
  `ps -eo pid,args --no-headers | grep -E PAT | grep -v "bash -c"`, or a
  pattern that cannot appear in the invoking command.
- **A NODE RUNNER DRIVING A BROWSER USES ALMOST NO CPU OF ITS OWN, SO `ps`
  CPU TIME IS NOT A LIVENESS SIGNAL FOR `regress.mjs`.** The work is in the
  chromium RENDERER; the node process spends the run awaiting CDP round
  trips. Measured: **0:03 of CPU after eighteen minutes of wall clock on a
  healthy run**, which I read as a stall and killed -- and the stack it then
  printed (`page.evaluate: Target page, context or browser has been closed`)
  was my own kill, not the fault I thought I was diagnosing. It cost a full
  thirteen-minute re-run. Two signals that are real: the chromium renderer's
  own CPU, and patience -- the suite writes NOTHING until the end because
  stdout to a file is block-buffered, so an empty log is the expected state
  for the whole run. On a loaded box (other probes running alongside) the run
  stretches well past thirteen minutes, so elapsed time is not a signal
  either.

- **KITE'S BOLT IS WITHDRAWN AT BUILD 336, AND EVERY CLAUSE OF IT WAS
  MEASURED EMPTY RATHER THAN ARGUED AWAY.** Build 335 shipped the station and
  its own docstring promised "the bolt it throws from there is build 336".
  This is GYRE's ruling (331) a second time, and a stronger case than GYRE's
  because four independent clauses fail, not three:
  - **THERE IS NOTHING AT RANGE TO ATTACK.** The `Shooter` declares no `hp`
    and no `applyDamage`, and the pair solver bills `impactDamage` behind
    `if (a.applyDamage)`, which is false for it. A ranged attack in this game
    cannot do damage, whatever it hits. Build 334's note already recorded the
    consequence -- every ranged attack in the game is cosmetic -- and the
    thing to take from it is that **the object was specified against a
    mechanic the engine does not have**.
  - **`world.shock` IS THE SHADER AND IT SATURATES AT THREE BODIES.** Eleven
    writers -- **ten boss sites** (nine attacks; GNOMON's shadow writes it at
    two ranges) plus a hurled MASS landing (`game.js:3318`,
    `tow.hurl.shock` **0.62**, the largest in the game against 0.30-0.50 for
    every boss) -- and **every one of them is `Math.max`**, so the channel
    does not accumulate. A twelfth `Math.max` at `game.js:3864` is the decay
    and it is **constant rather than proportional** -- `shock -= dtRaw /
    shockFor`, 0.556 shock-units a second -- so a write of V drains in
    `V * shockFor` and the channel is pinned once
    **`N >= every / (V * shockFor)`**, which at the TOW's 0.62 is 1.116s and
    **three kites**. The formula and not the three is the durable form,
    because a bolt's own V was never authored: whatever it were set to, the
    count that pins the channel is a small integer against a delivered count
    of 16 to 57. **My first derivation said 0.56/s and got the right answer
    for the wrong reason** -- 0.556 is the DECAY rate in units a second, not
    a rate of landings, and the landing rate needed is 1/1.116 = 0.896/s.
    At the guide's `every: 3.2` that is **three kites**. The TOW is also the
    precedent for the shape: it is the only swelled-count body in the game
    with a ranged action and its answer to the crowd is to have no cadence at
    all (`this.hurled = true; // spent: it never gets another one`).
  - **THE GUIDE'S COUNTER IS ARITHMETICALLY UNAVAILABLE AT EVERY RUNG.** A
    fully bought turret fires `1 / (holdFireInterval * up.rate)` =
    **3.885 rounds a second**. `bandsFor` returns `[hi - 1, hi]`, so band 5
    is drawn at every rung from 29 to the ceiling, and the budget swells the
    authored three kites to **16 at rung 29, 29 at 32, 43 at 35, 67 at 42 and
    104 at 49** -- measured, SWARM divided out -- held at `maxEnemies` **57**
    from about rung 38. So the field lobs **5.0 to 17.8 bolts a second**, and
    shooting them down (one round one kill, gun doing nothing else, no slew at
    all) is short by **1.29x at the lightest rung** and 4.58x at the cap, with
    SWARM doubling it about half the time.
    **My first figure was 32 at rung 29 and it was 16 x SWARM**, which is
    build 314's rule verbatim -- `asked` includes SWARM, which is a TRAIT and
    not a slope, so divide it out and say so. The corrected number is the
    weaker margin at the lightest rung and the stronger SENTENCE: with no
    trait at all, at the very first rung band 5 is played on, the field
    already out-lobs the best gun the tree sells.
  - **AND A SHOOTABLE BOLT TAKES THE GUN FOR ITS WHOLE FLIGHT.** Measured on
    a live field over 300s at rungs 29/32/35, fully bought, nothing stubbed:
    the assist's best score has a median of **630-876 units** and something
    is gripping only **0-4%** of the time, so a synthetic bolt scored into
    the same `consider` wins **80-100% of frames** at 445, 346, 247, 148, 74
    and 25 units out. A bolt is strictly nearer the machine than the kite
    that fired it and it closes -- **the exact inverse of build 323's CHAFF
    finding**, where a copy was nearer than its own owner ZERO times, closest
    ratio 1.005. CHAFF needed an explicit line to give a ghost the lock; a
    bolt needs an explicit refusal, and with build 291's release gate waiting
    for the field to thin, 15 to 57 permanently-nearest targets is a run that
    cannot climb.
- **TWO CHANNELS ARE LIVE, AND THE FUSE'S BRACKET IS EMPTY, WHICH IS THE
  FINDING WORTH KEEPING.** Salvage denial is the other one -- a GLUT eating
  `world.drops` is a shipped precedent with a codex line -- and it has no
  middle: near the machine the salvage is already gone (the ground inside the
  mount is empty on **76-99% of samples** at rungs 29/35, so eating on impact
  is invisible), while a patch that LINGERS takes 1.25-1.46 drops a second
  worth **66-69% of everything banked**, which is a wave ending rather than an
  attack; and income is not reproducible run to run (2-7x swings at one rung),
  so nothing between the two could have been tuned against a measurement.
  The glitch fuse is the other reachable payload that is not cosmetic:
  visible, clamped at 1, and `Director.burnFrom` (build 293)
  exists precisely so a third cause can be NAMED rather than silently
  captioned "clear the turret". It fails on arithmetic in both directions at
  once. `waves.glitch.fuse` is 14s, contact fills at rate 1 (7.14%/s) and
  recovery drains at 0.6 (**4.29%/s**). Measured through the real director at
  rungs 29/32/35, era 2: kites reach their stations spread over **154 to 190
  seconds** with a mean gap of **3.5 to 5.3s** and a worst three-second burst
  of **4 to 10** arrivals.
  - ONE-SHOT (the TOW's idiom): at a ~4s mean gap the fuse drains **17%**
    between bolts, so a bolt worth less than that can never accumulate and is
    invisible; a bolt worth that much puts a burst of ten at **170% of the
    fuse** and discharges it instantly, repeatedly.
  - REPEATING at 3.2s: ONE kite lobbing has to be worth
    `recover / fuse * every` = **13.7% of the fuse** just to outrun the drain,
    which is legible. FORTY-THREE of them need **13.7 / 43 = 0.32%** each to
    do exactly the same thing -- and 0.32% of a 14-second fuse is **45
    milliseconds** of contact, a thirty-third of what one gripping body does
    during its arming delay alone.
  **So the per-bolt value that survives the crowd is 1/43 of the value that
  makes one bolt legible, and the factor between them is EXACTLY the delivered
  count -- which is the budget's and not the author's.** A per-body cadence is the
  wrong parameterisation of the design, and that is not something a number
  can be tuned to. The general rule: **before authoring a per-body rate, ask
  what the budget does to the count** -- build 301 made a wave's counts a
  budget, so "two or three" in a design document is 32 to 57 in play, and any
  payload whose aggregate is linear in that count has to be bounded at the
  TYPE and not at the body.
- **...AND THE COUNT CANNOT BE TUNED EITHER, BECAUSE THE BUDGET IS
  SELF-CORRECTING.** `swell = budgetAt(tier, band) / threatOfWave(wave)`, so
  taking kites out makes the wave lighter and the swell bigger: cutting the
  authored count by two thirds cuts the delivered count by **58%**, and at
  one kite the wave sits 22% under its band's mean -- outside build 315's
  +-10% lever -- while still delivering 18 of them. Adding ballast re-prices
  band 5 **upward by 4-8%**, which is build 328's fault by name (ANVIL's wave
  took that band's mean up and turned REMNANT's `|moved| < 0.05%` arm red for
  a reason having nothing to do with REMNANT), on the band build 306 already
  measured missing the 120s cap at four of seven rungs. Removing the wave
  entirely moves band 5 by **-0.05%**, which is the floor of the option space
  and worth knowing.
  If it ever comes back it needs a re-spec and not a number: a payload that
  is not the shader, and a bound that is not per body -- the TOW's budget of
  throws, or `laneBusy`'s exclusion generalised to "at most k in flight for
  the whole type", derived from `maxEnemies` the way `leaveGhost`'s cap is.
  Both halves together or not at all, which is GYRE's ruling.
- **THE WALL OVERFLOWS ITS SLOTS ON A SMALL SCREEN, AND THE OVERFLOW IS THE
  COMMON CASE RATHER THAN AN EDGE.** `standSlotFor`'s fallback was
  `return n - 1` under a comment reading "more bodies than the wall has room
  for", i.e. an overflow guard for an unlikely case. It is not unlikely: the
  slot count is `cols * rows` off the FIELD and the kite count is the
  BUDGET's, so the two have nothing to do with each other. Measured at
  **320x568 era 2 the wall has 32 slots (8 x 4) and rung 35 stands 57 kites
  in it**, so **26 of them shared one point** -- and the same 57 at 390x844
  have 99 slots and fit. Clean A/B over the same controlled lay: worst slot
  **26 before, 2 after**, top five `[26,1,1,1,1]` against `[2,2,2,2,2]`, and
  the 390x844 cell identical either way, which is the no-op claim. It cost no
  HEALTH (0.306-0.385 of the pool worst, at both viewports and both ways --
  the settling, not the doubling); it cost the PICTURE, which is the object.
  Least-occupied rather than `i % n`, because the count is the same read the
  first pass already does, so a body that dies out of a doubled slot gives
  its place back -- the hole-where-it-falls rule one level up, and it needs
  no roster and no ordering.
- **A CASE THAT LAYS BODIES ON A WRAPPING MODULO LAYS THEM ON TOP OF EACH
  OTHER.** The first version of that arm used
  `x = 60 + (i * 53) % (width - 120)`, which wraps, so bodies shared a
  column; ninety seconds of settling then killed **eight to twelve of them**,
  a died-out slot freed itself, and `distinct === alive` went soft -- correct
  behaviour reading as a failure. Two fixes and both are the same rule: lay
  on a GRID at the wall's own pitch, and read after **half a second**,
  because a slot is claimed on the body's first loose frame and never again,
  so the question needs no settling at all. The arm asserts every body it
  laid is alive and holding a slot, or the two counts it cares about are
  measuring the instrument.
- **A PROBE THAT PINS `runSeed` PINS THE TRAITS IT ROLLS, INCLUDING SWARM.**
  `restart()` re-rolls `world.runSeed` and `traitsFor` is seeded off it, so
  the first census read 43 kites asked and the pinned re-run read 86 --
  exactly 2x, which is SWARM halving health and doubling the count. Build
  333's note says to pin the seed for reproducibility and this is the other
  half of it: **pinning a seed is choosing a trait roll**, so a probe that
  pins one owes the reader the traits it drew. 20260824 rolls SWARM+MENDING.
- **AND A WAVE CENSUS THAT RELEASES EVERY JOB MEASURES THE JOB ORDER.**
  `load` shuffles the job list and `emit` refuses to release while
  `hostileCount >= maxEnemies`, so which jobs get out before the cap is hit
  is seed-dependent: the same wave read `arrived: 1` on one seed and 29 on
  another, for the type under test, with nothing about it changed. A question
  about ONE type's bodies wants those bodies laid, not a wave played --
  which is also what makes the A/B above clean.
- **TWO STALE COPIES FOUND ON THE WAY PAST, AND BOTH ARE BUILD 329'S RULE.**
  `CFG.energy.pull`'s inline comment said "units per second" and it is an
  ACCELERATION: its one reader is `collectData`'s
  `e.vx += (dx / d) * S.pull * dt`, i.e. u/s^2. `CFG.snare`'s own `pull`
  beside it IS a target speed, which is how the wrong unit read as plausible
  -- **the same field name meaning two different quantities in two blocks**.
  And `yard.js`'s docstring said "the wall stands at 561.5 and the turret at
  848.1, so the open field between them is 287 units"; measured live it is
  **873 and 311.5**, the 848.1 being the pre-292 mount at `--bar-h: 74`
  against 64 now. The claim it supports still holds, so this is a copy going
  stale rather than a rule breaking -- which is exactly why nothing could
  fail for it.
- **A SCOUT FAN-OUT DIED WITH TWO LENSES IN FLIGHT AND ONE OF THEM PAID FOR
  THE WHOLE RUN.** The workflow was killed by a context compaction with 2 of
  6 agents started and no result written; its journal and per-agent
  transcripts survive under `subagents/workflows/<runId>/`, and the cadence
  lens's last message held the `Math.max` saturation, the TOW precedent, the
  bolts-a-second table and the self-correcting-budget table -- none of which
  I had. **Read the transcripts of a fan-out that died before re-running
  it**: `journal.jsonl` says which agents started, and the final assistant
  text block of each `agent-*.jsonl` is the work. The standing rule held
  anyway -- its census of the shock writers said eleven where I verified
  eleven, and its two proposed bounds are recorded above as a re-spec rather
  than taken as a design.
- **AND BUILD 335'S OWN KITE ARM PROVED ITS LIVENESS BY PLAYING A WHOLE WAVE
  AND HOPING, WHICH IS A COIN TOSS ABOUT ONE RUN IN FIVE.** The absolute is
  that kites alone never grip the machine, and a zero means nothing unless
  the counter has been shown to read a one -- so the arm proved that with
  `play(false)`, the same wave WITH its BULWARKs, on the argument that a
  heavy body ploughing through the line shoves a kite over the grab band. It
  does, and **intermittently**: measured over five draws the crowd run reads
  **182, 1084, 161, 700 and ZERO** grip frames, the zero being a run whose
  deepest kite finished **33 units short** of the band. THREE seed-dependent
  things are chained into that one conjunct -- the job shuffle, `emit`'s
  release gate, and the wave's trait roll (the same run stands 29 kites or
  57 depending on SWARM) -- and it turned red on build 336, whose content is
  a withdrawal, a comment sweep and a KITE-only allocator that cannot reach
  it.
  **And the obvious deliberate form does not reproduce it**, which is why
  this is a restructure rather than a re-site: ONE BULWARK laid at the centre
  and walked down the line moves the deepest kite about 40 units and grips
  nothing, 3 of 3. It takes the wave's ten to twenty of them, which is the
  crowd the release gate and the trait roll decide.
  What replaced it is the counter tested DIRECTLY: a kite put four units
  inside the band is counted (**25 frames of 30**) and the same kite put 120
  clear of it is not (**0**). No wave, no shuffle, no roll. The mechanism is
  REPORTED with its five-draw spread beside it and asserted by nothing.
  **A liveness conjunct is an assertion like any other, and "the scenario
  usually produces one" is not a proof that the instrument can see one** --
  test the instrument, and report the scenario.
- **A CONJUNCT CAN BE MADE FALSE BY A FIX ELSEWHERE IN THE SAME BUILD.** That
  same arm asserted `r.alone.dupes === 0` -- no two kites sharing a slot --
  which was an absolute while the overflow piled every excess body on slot
  `n - 1` and 335's own arm never reached the overflow at the suite's
  viewport. With the spread it is only true while the wall has ROOM, so it is
  `dupes === 0 || stood > slots` now and the sharing claim belongs to the new
  arm. The tell was in the fix rather than in the failure: **when a change
  makes a previously-impossible state legal, grep the suite for arms that
  assert it is impossible** -- the suite's green would otherwise have been
  luck about a viewport.
- **`Director.burnFrom` IS AN EXTENSIBLE FIELD WITH TWO INEXTENSIBLE READERS,
  AND MY OWN WITHDRAWAL NOTE ASSERTED THE OPPOSITE.** Build 293 added the
  field under the rule that "a signal with TWO causes needs a field saying
  which", and build 336's first draft wrote that it "exists precisely so a
  third cause can be NAMED rather than silently captioned 'clear the
  turret'". True of the field; **false of both readers**, which are two-way
  ternaries whose else arm is the CONTACT answer:
  `game.js:3352` is `burn === 'crowd' ? ON_CROWD : ON_GLITCH` and
  `enemies.js:8832` is `cause === 'crowd' ? 'THE FIELD OVERRAN' : 'THE FEED
  GAVE OUT'`. **And the caption half is worse than mis-keyed, it is silent**:
  `sayOnce` opens `if (lineSeen(l.id)) continue` and `markLine` persists per
  DEVICE, so a one-element array whose line has already been read says
  nothing ever -- a third cause would be silent on any device that has met
  contact and would spend the wrong line on a fresh one. Build 293 fixed the
  VALUE and left the SHAPE, and the form that cannot regress is one
  `{ contact, crowd, ... } -> { line, reason }` table rather than a third
  ternary. **A field being extensible is not the same as the code that reads
  it being extensible**, and the sentence claiming otherwise was load-bearing
  for the only future work the withdrawal invites -- which is exactly the
  kind of prose nothing can fail for.
- **TWO DOCSTRINGS NAMED FUNCTIONS THAT DO NOT EXIST, one of them mine.**
  `config.js` said "`standoffOf` throws for a type that declares none" from
  build 335 -- the function is `lobOf`, and the paragraph FOUR LINES BELOW
  names it correctly. And `tutorial.js:146` said "See Game.watchGlitch";
  `grep -rn watchGlitch src/ scripts/ index.html` returns that comment and
  nothing else, the reader being inside `Game.checkContact`. Both were found
  by a reviewer grepping the names rather than reading past them, which is
  the cheapest sweep there is: **grep every identifier a docstring names.**
- **KITE ARRIVING AS A FORMATION WAS RAISED AS THE BIGGEST LIVE FINDING AND
  IT IS MEASURED CLEAN.** `formable(kite)` is true (no `solo`) while VEIL --
  the other choose-a-place-and-hold gait -- carries `solo: true`, and build
  330 measured 30 sheets arriving as a formation leaving **20 of 30 staged in
  the throat**. Measured for KITE through the real `Director.emit`, four
  cells of viewport and rung: **`staged: 0` in every one**, 32 of 32 arriving
  at rung 29 and 57 of 57 at the cap. The difference is the BODY, not the
  gait: `spawnFormation` pitches slots at `r * 2 + 8`, which is 48 for an
  r-20 kite and 216 for a 104-unit sheet, so a formation of sheets is an
  edge-to-edge wall and a formation of kites is an ordinary shape. **A
  structural analogy is a reason to measure, not a finding** -- the same rule
  as a fan-out's pointer.
- **THE RELEASE-GATE FUSE ARM DREW `held: 0` IN THE SUITE AND 25.4s STANDALONE
  ON THE SAME TREE, AND ALL FOUR OF BUILD 322'S CONFOUNDS ARE ALREADY
  PINNED.** Build 336's second suite run turned it red at
  "held 0s of 300 ... 0 waves of wait", on a build whose executable content is
  a KITE-only slot allocator thirty thousand lines further down the file and
  a band the fuse arm's rung does not draw. Run standalone on the same tree,
  minutes later: **held 25.4s, the fuse rose 1.251 against the 1.254 the
  identity predicts (0.24% out), 24.7s of WAIT against 5.2s of contact, and
  all three arms green.** So this is a draw, and the recorded distribution
  for `held` now runs **0, 1.4, 13.6, 15.7, 25.4, 29.1, 37.5, 39.4, 42.5,
  50.8, 54.3 and up to 154.4** seconds across the builds that have measured
  it -- a floor of 10 on ONE draw of that.
  What is NOT the cause: the loaded round, the rotation, the rung and the
  tree are all pinned inside `play()` (build 322), and the detail string
  proves it run by run. **The candidate left is the TRAIT ROLL** --
  `traitsFor` is seeded off `world.runSeed`, which `restart()` re-rolls, so
  SWARM doubles the bodies and MENDING heals them, and at rung 28 whether the
  field drowns at all turns on that. Not run down here, because the window is
  300 seconds an arm and this is the case CLAUDE.md already records as six
  builds of tuning a number instead of finding it. **The next person to touch
  it should pin the seed and pool three runs, the way the sibling arm's field
  channel already does** -- and should note that a liveness floor is the one
  conjunct in it that has never been pooled.

- **BUILD 337 IS A REMOVAL PASS, AND ITS SEED IS THE OLDEST ORPHAN THIS REPO
  HAS FOUND: `Projectile.hold`, DEAD SINCE BUILD 225 AND READ ON EVERY FRAME
  FOR EVERY ROUND.** `this.hold = opts.hold ?? 0` under a comment reading
  "DOUBLE TAP: the follow-up round waits this long at the muzzle before it
  sets off", with the branch
  `if (!p.dead && p.hold > 0) { p.hold -= dt; dot(...); continue; }` in
  `updateProjectiles` -- the hottest loop in the game. Zero suppliers: ONE
  `new Projectile` call site, seven `fire()` callers, and no `hold:` anywhere
  in shooter.js, abilities.js, mines.js or turrets.js.
  **And the removing commit named the two numbers it took out.**
  `git log -S "hold:" -- src/shooter.js` dates the orphan to `056d365`
  "Build 225: DOUBLE TAP comes out", whose diff deletes
  `hold: t * g.tapGap` and `damage: g.damage * g.tapFade ** t` -- and build
  225 also deleted `tapGap` and `tapFade` from `CFG` and wrote a paragraph
  naming both, which is still there. **So the removal pass documented exactly
  which config values it deleted and left the field they were written into.**
  The lesson is not "sweep harder": it is that
  `git show <commit> -- <file>` on the removing commit IS the sweep, and it
  takes one command.
  **The ORDINAL hash is the right instrument and it did not move** --
  `-1334607133` either side, both readings in this container. A branch removed
  from the round update loop that provably touched nothing is a claim only
  that instrument can make.
- **TEN MORE OF THE SAME SHAPE, ALL VERIFIED BY GREP BEFORE ACTING.** A
  read-only fan-out pointed at the shape rather than at a file, and every one
  of these was then confirmed here with a property grep showing ZERO reads:
  - **`Ordinal.gaze`** (boss.js) -- `Math.atan2` on every frame of stage IV,
    read by nothing, duplicating an identical atan2 fourteen lines below.
    The commit that removed it was "Replace the gaze with worn armour": it
    took the drawing and left the field. TWO false comments promised the
    visual -- "// the eye tracks you" and `config.js`'s "the core's eye
    tracking the turret" -- in the one paragraph a reader goes to in order to
    learn what that stage looks like, and the beams turning in the same
    sentence is what made it survive a skim.
  - **`Hud._bossArriving`** -- a repaint memo written twice a fight and read
    nowhere, among three siblings (`_bossTitle`, `_bossGhost`,
    `_bossShells`) that ARE read as guards. Deliberately NOT "fixed" by
    wiring the guard: `classList.toggle` is idempotent and the unguarded
    `recede(0.5)` is documented as deliberate, so a test there would be a
    behaviour change dressed as a tidy-up.
  - **`Game.resetShown`** -- write-only since build **82**, i.e. **254
    builds**, more than twice `Projectile.hold`. It was the end screen's
    state; build 82 deleted its reader and its partner `endTimer`, build
    186's dead-CSS sweep took the `#endScreen`/`#endText`/`#resetBtn`/
    `body.ending` family it drove, and the JS half was never swept. It
    carried NO COMMENT, which is why it read as a live reset between the two
    live ones either side of it.
  - **`Fractal.recalled`** -- and this one is `diveT`'s shape rather than a
    stale constant: a `back` accumulator maintained across a nested loop, one
    declaration and three increments, into a field nothing read. The bodies
    really are revived; only the count was thrown away. It also sat one
    letter from the live `recall()` method, which is build 324's
    `reform`/`Boss.reform` collision -- the shape that blinds a grep sweep.
  - **`Background.nebula`** -- an empty array that has never had a reader in
    any build; the live bloom is cached in `deep`/`deepCtx`.
  - **FOUR OF `CFG.rig`'S SIX KEYS.** `CFG.rig` is accessed at exactly four
    sites tree-wide (three for `flash`, one for `pile`), so `ring`, `spine`,
    `feed` and `dish` shipped in the bundle and were read by nothing --
    and **`dish` is build 150's deleted ARRAY gadget BY NAME**, the same
    removal CLAUDE.md already records as leaving five TURRET lines "still
    describing the hung-on gadgets... ARRAY had been selling a scanning dish
    for sixty builds". The prose was fixed at 150; the numbers behind it were
    not. Its docstring was wrong three ways: every key is "a part you can
    see" (true of two of six), it named `Shooter.drawRig()` (no such function
    anywhere), and it listed SIGHT as current five builds after shooter.js
    recorded SIGHT as gone.
  - **`CFG.remnant.mark`** -- MINE, from build 324, and the most instructive
    of the ten. Documented as "how long the mark it leaves stands, as a share
    of `back`", and `enemies.js` writes `life: rs.back` with **no
    multiplier**. Its value being the identity is the only reason nothing
    could tell: **authoring `mark: 0.8` to shorten the mark would have
    changed nothing, in silence, on a field whose entire docstring is about
    that share.** Deleted rather than wired, because the paragraph's own
    argument is the reason to delete it -- the mark is the clock made
    visible, there is one object and one owner, and a second number that can
    drift out of step with the clock is the thing it was arguing against.
  - **`Hud.setKills`'s `fitBar()` call** -- build 222's fault EXACTLY
    INVERTED. 222 had three signature terms and no caller for the kill count,
    "re-run by accident through a sibling that had been deleted"; 295 removed
    the term and left the caller. Its justifying paragraph says the count "is
    one of the three digit runs `fitBar` is keyed on" while `fitBar`'s own
    docstring, forty lines below in the same file, says "the kill count came
    OUT of this signature in build 295" -- **two paragraphs in one file
    saying opposite things about the same three numbers.** The rule that
    catches both directions is `fitBar`'s own: a signature term owes the box
    a chip, and a caller owes the signature a term.
  - **`sheetRung`, a third copy of a 10 the game never reads** -- and the
    suite's guard was calibrated against it. `upgrades.js` authored
    `rung: 10` on RECALL and on OVERCLOCK, `CFG.waves.tier.sheetRung` said
    10, and the ONLY reader of the constant was `regress.mjs`. So editing the
    nodes correctly reddened the case, and editing the constant ALONE also
    reddened it -- reporting the nodes as mis-sealed when nothing about the
    seal had moved. The nodes read the constant now.
  - **`body.loadoutOpen` in `ladder-probe.mjs`** -- no writer since build
    226, so the 'loadout' arm of its ternary could never be taken, and its
    live neighbour covered for it (the loadout IS a menu tab now, so
    `menu.toggle()` closes it). What it cost was diagnostic: a run stalled
    behind AMMO or MINES reported 'menu'. `Game.loadoutOpen` is the getter
    build 226 wrote for exactly this.
- **THE PATTERN ACROSS ALL ELEVEN IS ONE SENTENCE: A REMOVAL PASS DELETES
  THE CONFIG AND THE PROSE AND MISSES THE CODE THAT READ THEM.** Builds 82,
  150, 186, 222, 225, 226, 295 and 324 each left exactly one of these, and
  every one was invisible to build 313's dead-field sweep **because that
  sweep's domain is keys declared on `ENEMY_TYPES`** -- not `CFG` blocks, not
  class constructors, not HUD fields, not probe scripts. Its green has never
  said anything about any of them. **Ask what a guard's domain is before
  reading its green as coverage**, and for a removal, grep the removing
  commit's own diff.
- **AND `FIELD_LISTS` IS THE DERIVATION, BECAUSE FIVE PLACES HAD WRITTEN THE
  SAME LIST OUT AND EVERY ONE OF THEM WAS WRONG.** `world` carries **fifteen
  arrays** -- measured, not counted: nine that are the field (enemies,
  ghosts, respawns, drops, debris, projectiles, effects, mines, pendingBlasts)
  and six that are run state (apertures, gunAt, guns, ledger, offered,
  reconciled), plus three Sets outside both (attackers, abilityHold,
  unlocked). `takeField` empties exactly the nine and keeps exactly the six.
  What was there before:
  - `takeField`'s **docstring** said "three of the seven lists" and its
    **body comment** said "the six lists that are not `enemies`", while the
    body drained **eight** -- two wrong counts in a paragraph whose whole
    subject is wrong counts ("a clear that names three of them under a
    comment about needing a clean field is this repo's own scar").
  - the era-switch arm's `out.lists` named **seven**, omitting `ghosts` and
    `respawns`, and it is asserted with `every((n) => n === 0)` -- so the one
    arm whose entire subject is that every list is empty **could not see a
    leak in either of them.**
  - the evolution's `out.tookField` named **eight** and omitted `respawns`,
    which build 324 added to the same `takeField` that line asserts the
    completeness of, under a comment calling `ghosts` "the eighth list, which
    build 323 added" -- a count right at 323 and wrong from 324.
  - two `inNoList` furniture sweeps named **seven** under a comment reading
    "setEra empties all seven".
  One exported constant now, `takeField` iterates it, all four suite sites
  read it. **`pendingBlasts` IS LAST AND THE ORDER IS LOAD-BEARING** -- a
  body coming apart in the enemies pass pushes a blast on its way out -- so
  reordering the array is a behaviour change and says so at the site.
- **...AND A CONSTANT IS A NINTH COPY UNLESS SOMETHING ASSERTS THE PARTITION
  IS TOTAL.** The guard that makes it a derivation: every array on a fresh
  world is EITHER a field list or named run state, so a tenth of either kind
  fails until somebody classifies it. **Proved able to read a one, twice** --
  planting a `zzzNewList` reads `unclassified: ['zzzNewList']`, and leaving a
  field list non-empty after the clear reads `fieldLeft: ['respawns']`. And
  the second arm FILLS all fifteen before clearing, because without the fill
  it passes on a world that was already empty, **which is what four of the
  five hand-written versions of this list were doing.**
- **`PREFS.hints` DID NOT TURN THE LOT OFF, AND CLAUDE.md HAS SAID IT DID
  SINCE THE BAND WAS WRITTEN.** `game.js`'s contact line was the ONE ungated
  `sayOnce` in the game: six siblings all carry `this.hintsAllowed` and this
  one carried nothing, with no comment saying why -- so a player who turned
  the captions off still got the first and most important one. Gated now, and
  what that changes is narrower than it looks, which is why the gate is the
  answer rather than a risk: `hintsAllowed` is
  `pref('hints') && phase === 'staging'`, contact first happens during the
  eight teach waves, which ARE staging; and it was never spending the line on
  the title screen, because `phase` is 'boot' there and the grab loop skips
  `e.harmless` so the boot field's drifters cannot grip. What it removes is
  the hints-OFF case, which is the promise. **If the site is ever wanted
  exempt -- and there is an argument, since it names the one tool that
  answers a body on the mount -- the exemption has to be written there**,
  because a missing gate and a chosen exemption are otherwise the same text.
  Revert-proved: with the gate removed the hints-off arm says the line TWICE
  while `hintsAllowed` reads false.
- **`hints` IS 0/1 AND NOT BOOLEAN, AND `setPref` CLAMPS A VALUE IT DOES NOT
  RECOGNISE TO THE DEFAULT.** So `setPref('hints', false)` silently turns
  hints **ON** (`def: 1`), and the first version of that case measured two
  identical arms and reported the gate missing on a build that has it. The
  arm throws if the pref refuses rather than trusting it. **A setter that
  falls back to a default swallows a wrong-typed argument in silence** --
  same family as `levels ?? 3` and an omitted `band` reading as band 1, on
  the setter side instead of the author side.

- **PHASE 1 OF THE GAIT PLAN IS IN FROM BUILD 338: `gait` IS MANDATORY AND
  THERE IS NO DEFAULT.** It was optional and **43 of the 61 types declared
  nothing**, with the absence MEANING march -- so a type nobody had asked
  about and a type deliberately chosen to march were THE SAME TEXT. That is
  the fifth instance of one fault: `u.levels ?? 3` sold eight upgrade nodes
  three times, an omitted `band` read as band 1 (9 kB against 4 MB), and a
  second `plated`/`ride`/`respawn`/`planted`/`bar` type would have worn the
  first one's shared block. Every one was fixed the same way -- not with a
  better comment, but by making the omission impossible to write. `march` is a
  row in `GAITS`, `gaitOf` in enemies.js throws for a type declaring none or
  declaring a word not in the table, and `check-build` walks all 61 through it
  at build time (a throw from inside the rAF loop is build 288's freeze rather
  than an error anybody reads).
  **The ORDINAL hash came back identical to the bit** -- `-1334607133` either
  side, both readings in this container -- which is the assertion this phase
  owed and the only instrument that can make it: a field added to all 43 loose
  types, read eleven times per body per frame on `drive`'s hot path, and
  provably no body noticed. Verified alongside it that none of the three gait
  Sets (`OWN_SPAWN`, `OWN_SPEED`, `FACES_TRAVEL`) contains `march`, so
  `.has(undefined)` and `.has('march')` are both false, and that `laneBusy`'s
  cohort test pools the 43 the same way either side.
- **IT OVERTURNS BUILD 324'S RULING, DELIBERATELY, AND THAT REFUSAL WAS
  CIRCULAR.** REMNANT's first draft wrote `gait: 'march'` out on build 224's
  reasoning, `check-build` refused it, and the rule was narrowed to *"write out
  a value that could have been different, and do not invent a name for the
  default"*. Both halves are answered rather than ignored. The refusal was
  circular -- the guard refused `march` because it was not in `GAITS`, and it
  was not in `GAITS` because the guard refused it -- and `march` is not an
  INVENTED name, the word appearing fifteen times in config.js's own prose
  ("the ordinary march", "this body does not march") before it was ever a
  value. What settles it is the COST of the absence, which was that ruling's
  own paragraph: **fifteen lines at one site** saying "the correct absence
  rather than an omission", and nothing like it at the other twenty-four, so a
  reader could not tell a FLINT that was considered and found to march from
  one nobody had asked about. A rule that needs a paragraph per site to
  distinguish a chosen absence from an oversight is a rule making the omission
  expensive instead of impossible, which is what build 220 tried for `levels`
  before 224 removed the default. The precedent is two fields along on the same
  roster: LATCH's and CHAFF's `wobble: 0` are "written out at 0 rather than
  omitted so the value is a statement and not an absence" -- same field shape,
  same majority default, opposite ruling, and the only thing that had made
  `gait` different was a guard.
- **`fixed` TYPES ARE EXEMPT AND THAT IS THE POINT RATHER THAN A HOLE.**
  `drive`'s first statement is `if (this.type.fixed && !this.isDrop) { vx = 0;
  vy = 0; return; }` -- a boss core and its structure do not go anywhere --
  so `fixed` ALREADY answers what a gait would answer, and declaring one would
  be a second source of truth for the same fact that can get out of step with
  it. Eighteen types are fixed and `gaitOf` throws for one that declares a
  gait as well as for a loose one that does not, so the partition is held in
  BOTH directions and a nineteenth fixed type is covered by existing. 61 = 18
  fixed + 36 loose hostile + 7 harmless.
- **THE READER TEST COULD NOT SEE AN IMPLEMENTATION THAT HAD BEEN DELETED, AND
  THAT IS PROVED BY REVERT.** It was `new RegExp(`'${g}'`).test(gaitSrc)` over
  the whole of enemies.js, which is two holes: a word named only in a COMMENT
  satisfied it (the thing being guarded against is a word with a description
  and no implementation, and a description IS a comment), and a word named in a
  MEMBERSHIP SET satisfied it too. `'dive'` has seven code occurrences of which
  four are the unrelated `divePhase` machinery. Measured: replacing `dive`'s
  ONE real arm and `flock`'s with `else if (false)` left the old predicate
  reporting **nothing muted in both cases** -- the guard could not see a gait
  whose entire steering had gone. Narrowed rather than widened: a word must
  appear as `gait === 'x'` or `case 'x':`, the only two forms anything
  dispatches in, which is exactly one arm for each of the fourteen and zero for
  march. Both reverts now fire, and so do a stale exemption and one naming a
  non-word.
- **AND THE `march` EXEMPTION IS SELF-POLICING, because a hand-kept exemption
  list is how `world.apertures` came to be sized 8 against 9 anomalies.**
  March is exempt by the test's own argument: the test exists because a type
  naming a gait nothing implements gets the march it was trying not to take,
  and a type naming MARCH and getting the march is correct -- `'march'` appears
  zero times in enemies.js, comments included, and adding a site to satisfy a
  grep would be exactly the dead field the test hunts. So an exempt word that
  turns out to HAVE a dispatch arm **fails the build**, and one naming a word
  not in `GAITS` fails too. Phase 2's `lurch`, `drag` and `wander` are all
  fall-throughs or on-top modifiers and will want the same exemption; if the
  list reaches three or four, mark the fall-through words in `GAITS` itself and
  have the guard ask the structure instead of restating it.
- **THE ARMOUR CEILING SELECTED BODIES BY THE ABSENCE OF A GAIT, AND IT WAS
  LATENT RATHER THAN LIVE.** `worstBody` filtered `!t.fixed && !t.gait`, which
  meant "an ordinary field body" when the only declarers were the new objects
  -- so with the field mandatory the filter matches NOTHING and the ring is
  measured against a bare body. A rule whose selector stops matching reads as
  a rule that holds. Two things worth the sentences: it was **latent**, because
  FLINT at 0.55 is the worst loose body either way and the term happened never
  to exclude the maximum (it did exclude ANVIL 0.30, QUARRY 0.22 and SPINDLE
  0.15, all under it); and it would have failed **LOUDLY** rather than
  silently, since an empty filter gives a ring of 0.60 against a cap of 0.80
  and the reachability arm fires. `!t.fixed` alone is what the claim needs -- a
  ring lands on any loose body and `fixed` is the only thing it cannot land on.
- **THE HARMLESS SWITCH'S `default:` WOULD HAVE SWALLOWED `march`, AND IT IS
  THE ONE VALUE THAT CANNOT BE TRUE OF A HARMLESS BODY.** `drive`'s early
  returns are ORDERED and a harmless body reaches its own switch long before
  the route branch; that switch handles `rise`, `tumble`, `chain` and `hover`,
  and its `default:` is `wander`. So a harmless type declaring any other word
  silently gets the hover band with both gait guards passing -- the
  `shape`-with-no-case fault, where five shapes fell through to `drawChip` for
  fourteen builds. It matters specifically because `march` is legal now: before
  that, a harmless type could only reach the default arm by naming a replacer,
  which is visibly wrong at the site, whereas `gait: 'march'` on a harmless
  body **looks like the most ordinary declaration in the file**. `check-build`
  refuses it, and the legal set is DERIVED from the branch order rather than
  chosen -- the two branches above the harmless one also return, so `ride`
  (SEED is harmless and rides) and `hop` reach their own code first. `hop` is
  admitted and flagged rather than refused, because `hopOn` hands the body back
  for the last stretch and a harmless hopper would fall to the hover band then:
  half-honoured, legal, and worth knowing before something declares it.
- **THERE ARE THREE KINDS OF WORD IN THE ONE TABLE, AND THE PLAN'S MODEL DOES
  NOT FIT THEM.** `docs/objects.html` says each entry should be "a function
  with the signature `drive` already has" and `march` "the present code moved
  verbatim", which assumes every gait REPLACES the whole of `drive`. Read
  against the code the fifteen words are three different things. REPLACERS own
  the steering and the route branch never runs (roll, dive, creep, spread,
  standoff, flock, and hop while leaping). WALKERS return before the chain is
  reached at all (rise, tumble, chain, hover, ride). MODIFIERS hold something
  on TOP of an ordinary march and the route branch still runs (paired,
  cartwheel) -- and `type.lurch` is a fourth modifier that is not a gait word
  at all but its own field applied below the chain, which is why a LURCHER
  declares `march` and still lurches. **So the route branch at the foot of the
  chain is reached by march, by the two modifiers and by a handed-back hop, not
  by march alone**, and a function table keyed one-per-gait cannot say that --
  turning the chain into one would change what those three bodies do. Phases 2
  and 3 both land inside this shape.
- **`nothing reads a field that does not exist` HAS A DOMAIN OF TWO OBJECTS,
  AND THE FIELD IT COULD NOT SEE IS THIS ONE.** The ghost Proxy is installed
  over `world` and `world.up` and nothing else, so a TYPE's fields are outside
  it -- and `this.type.gait` was an undefined-property read on 43 of the 61
  types for the whole of the field's optional life. The one case whose NAME is
  exactly about undefined-property reads could not see any of them; had it
  covered `ENEMY_TYPES` it would have been red the whole time and made this
  change unnecessary. Its name says the domain now. Wrapping `TYPE_BY_ID`'s
  values is the real coverage and is its own piece of work. Build 325's rule:
  **ask what a guard's domain is before reading its green as coverage** -- and
  note that guard and build 313's key sweep have complementary domains and
  neither covers a type-level absence read at runtime.
- **MY OWN NEW CASE HAD ITS DETAIL INVERTED, AND RUNNING IT STANDALONE FIRST IS
  WHAT CAUGHT IT.** The arm collects what `gaitOf` LET THROUGH and the field
  was called `refused`, so the assertion read `refused.length === 3` -- it
  demanded three failures and would have passed only on a broken build. It read
  `refused: []` on a working one. **A detail string is a declaration and so is
  a field name** (build 319's "still flocking" printing a count of the living),
  and thirteen minutes of suite is the price of finding it afterwards instead.
  It now reports both the count CAUGHT and the list LET THROUGH, plus the two
  acceptance arms -- a good word accepted and a fixed type answered `null` --
  because an empty miss list means nothing from a function that throws
  unconditionally.
- **THE GUIDE'S HERO DIAGRAM HAD SEVEN LANES DRAWN IN SHIFTED COLOURS, TWO OF
  THEM IDENTICAL, AND THE REMOVAL THAT DID IT LEFT A COMMENT SAYING SO.**
  `HERO_GAITS` and `HERO_COL` were two parallel arrays read at the same index.
  Build 331 withdrew GYRE and removed `'orbit'` from the gait list -- **at
  index 1, the SECOND entry** -- and left the colours untouched, so every
  colour from index 1 on shifted up by one: standoff took orbit's `#c9e84a`,
  paired took tumble's, **the two lanes came out the same colour**, and the
  eighth was orphaned. Nothing could fail for it -- seven lanes are drawn and
  seven swatches are drawn, and the legend AGREED with the diagram because both
  read the same wrong index. They are one array of `[gait, colour]` rows now; a
  row cannot lose half of itself. Recovered the intended pairing from
  `git show` of the commit before the removal rather than guessing it.
- **FIVE COUNTS IN THE GUIDE'S PROSE WERE COPIES OF NUMBERS AN ARRAY ALREADY
  OWNED.** "Twenty" in the `<title>`, the `<h1>`, the standfirst and one step's
  heading, and "eight gaits" in a heading and the canvas's `aria-label`, all
  reading as current after build 331 took the roster to nineteen and the hero's
  list to seven. `#mastN` and `#heroN` are filled from `NEW.length` and
  `HERO.length` now, so they cannot rot again. Two more corrected in place:
  "Thirty-six field bodies currently draw their approach from the same six
  routes" is **twenty-eight of thirty-six** (the eight that left are the
  objects of builds 307-335), and the Phase 4 row said **eleven** re-gaitings
  where the table beside it holds **ten** bodies taking a new gait word -- the
  other three keep the march and only lose routes, which is phase 3, and three
  more were already right. A count written out beside the table that owns it.
- **AND `march` WAS THE WEAKEST DECLARATION ON THE ROSTER FOR ONE TYPE, SO
  `lurch` ARRIVED HERE INSTEAD OF IN PHASE 2.** A LURCHER's own steady closing
  speed is `speed * k / (k + damping)` = 38 x 1.2 / 1.75 = **26.1 u/s**,
  against a burst whose mean is **65** arriving every 1.1-2.4s -- two and a
  half times the whole cruise, up to 3.4x. So `march` named the quieter
  component and was silent about the louder one, on the one type
  docs/objects.html calls "the only type that already owned its motion", while
  the roster's own convention is that a MODIFIER whose route branch still runs
  is declared as the gait (YOKE `paired`, SPINDLE `cartwheel`). Re-keying it
  **deleted a field rather than adding a word** -- the burst was
  `if (this.type.lurch)` against a `lurch: true` only this type carried, so the
  word and the behaviour could get out of step -- and it gives `lurch` a real
  dispatch arm, so it needs no vocabulary exemption. **And the hash cannot see
  this half of the change, which is worth saying rather than letting
  `-1334607133` stand as the proof.** `fight.mjs` opens from `openBoss` and
  `Game.update` is `if (w.boss) {...} else { director.update() }`, so the
  director never releases and **no LURCHER is ever on that field** -- build
  318's correction. The hash proves the FIELD addition reached nothing; what
  proves the re-key is that the two predicates are identical over the roster,
  which is checkable directly: `lurch: true` was on exactly one type at HEAD
  (`lurcher`) and `gait: 'lurch'` is on exactly that type now, with zero live
  `lurch: true` fields left. A LURCHER is genuinely reachable at the rung the
  suite's release-gate case runs (four band-3/4 waves carry one), so the suite
  is the instrument for it and the hash is not. `drag` and `wander` are still
  phase 2's and neither is a one-liner: `drag` has no single field to re-key,
  and `wander` is what the harmless switch's default
  arm already does.
- **WHAT `march` LEAVES OUT IS WRITTEN AT THE TWO SITES WHERE IT LEAVES OUT
  MOST.** A towed MASS is the weakest declaration left and the note says why,
  with the figures: its own march delivers **13.6 u/s** against the head's
  39.6, so the cable drags it at 2.9x its own walking pace; `solveTethers`
  writes its POSITION every frame; `windUp` drives it sideways at 900 u/s^2
  inside `hurl.range`, which is authorship and not steering; and after
  `release` it is `hurl.speed` **620** with `thrown` 2.2, which is `drive`'s
  SECOND early return -- so for those 2.2 seconds the gait is not consulted at
  all. The TOW head's march really is its own path (nothing excludes it from
  the route branch, and `windUp` only BLEEDS its wind out of range rather than
  holding it), so its note is the narrower one: the declaration is INCOMPLETE
  rather than false, because the part of `drag` that is not a march belongs to
  the pair. **A declaration that is true and partial is worth a note; one that
  is false is worth a different word.**
- **THE HARMLESS LEGAL SET IS DERIVED FROM `drive`'S OWN SOURCE, and it was a
  hand-kept list in THREE copies for one afternoon -- two of them parallel, in
  the object literal of the case I had just written.** The message printed one
  copy while the assertion ran against the other, so editing either would have
  made the case report a legal set it had not tested against, with nothing to
  read back. **That is `HERO_GAITS`/`HERO_COL` exactly, in the same build that
  fixed it in the guide** -- which is a sharper lesson than either instance:
  diagnosing a fault does not inoculate you against writing it. `check-build`
  slices `drive` from its own signature to `if (this.harmless`, harvests the
  `case 'x':` labels out of the harmless switch and the `gait === 'x'` tests
  above it, and **traces a branch keyed on a CAPABILITY field back to the line
  that derives it** -- `this.rides = type.gait === 'ride'` is in the
  CONSTRUCTOR, so a slice of `drive` alone derived [rise tumble chain hover
  hop] and failed the build on SEED. Proved in four directions: removing a
  `case` from the switch, breaking the capability derivation, gutting the
  switch entirely (it throws rather than deriving an empty set, so the guard
  cannot go vacuous), and a harmless BELL declaring `march` -- which is the one
  the dispatch guard cannot catch, because march is exempt from it.
- **THE READ-ONLY FAN-OUT SCORED SEVERAL THINGS I HAD NOT AND WAS WRONG ABOUT
  NONE, WHICH IS UNUSUAL ENOUGH TO RECORD.** Four lenses over the gait field's
  readers, launched before the change and landing during it. Two independently
  reproduced the three faults I had already found -- one of them by copying the
  tree to a scratchpad and running check-build against a one-row GAITS -- which
  is the useful kind of agreement. What they added: the harmless switch's
  `default:` swallowing `march`; the reader test being satisfiable by a
  MEMBERSHIP SET, **proved by revert**, since gutting `dive`'s and `flock`'s
  only dispatch arm left the old predicate reporting nothing muted; the LURCHER
  and MASS declarations above; the hand-kept list in my own case; and the ghost
  Proxy's domain. One lens also REFUTED the example my own brief had named as
  the likely breakage (a regress arm asserting a mote's gait), correctly, on the
  ground that LATCH declares `ride` at HEAD and still does. The standing rule
  held anyway: every mechanism above was re-measured here, and one lens's
  recommendation for the MASS -- a note rather than a word -- is the one I took
  precisely because it had done the arithmetic for why `drag` is not a
  one-liner.
- **THE RELEASE-GATE FUSE ARM'S LIVENESS FLOOR IS A ONE-IN-THREE COIN TOSS,
  MEASURED, AND IT IS POOLED BY RETRY NOW.** It drew `held: 0` on build 336
  and again on 338 -- two builds whose executable content cannot reach it --
  and build 336's note had already asked for exactly this: *"the next person to
  touch it should pin the seed and pool three runs... and should note that a
  liveness floor is the one conjunct in it that has never been pooled."*
  Measured rather than inferred, three trials of the identical scenario on one
  tree with nothing else changed: **held 25.9, 3.7 and 23.9 seconds**. The two
  that held read a rise of 1.057 and 1.054, the fuse filling more than once
  over; the one that did not also had `contactS` 6.0 against `crowdS` 3.7, so
  it would have failed the CAUSE conjunct as well.
  **Pooled by RETRY rather than by averaging, and the distinction is the
  claim.** This conjunct asks whether the scenario ARISES, not how often, so a
  300-second window in which the release was never held is a window in which
  the mechanism never ran -- not evidence against it. Averaging the holds
  answers a question nobody asked and pays for three windows every run;
  attempting up to three times and measuring the first that produced a hold
  costs 1.5 windows on average and leaves about a 4% chance of a spurious red.
  What keeps it honest is REPORTING the attempts in the detail: if it ever
  starts needing all three every run, the scenario has stopped reproducing and
  that is the signal to re-site it rather than to raise the count.
  **Pinning the seed was the other candidate and is refused.** The remaining
  unpinned confound is genuinely the trait roll -- `traitsFor` is seeded off
  `world.runSeed`, which `restart()` re-rolls, and at rung 28 whether the field
  drowns at all turns on SWARM and MENDING -- but pinning a seed is CHOOSING a
  roll, and choosing the roll that makes the case pass is what this case's
  six-build history is a catalogue of.
- **WHAT PHASE 1 DELIBERATELY DID NOT DO.** It adds a field and a guard and
  moves no behaviour: `drive`'s if/else chain is untouched, which is why the
  hash can be the assertion. Phase 2 (lifting `lurch`, `drag` and `wander` out
  of `drive`, `wander` and the TOW code into the table) and phase 3 (a route
  allow-list per type, still `this.route = opts.route || weightedPick(ROUTES)`
  with no per-type filter) are separate builds and share phase 1's test. Phase
  4's ten re-gaitings are a balance change as well as a mechanical one -- the
  guide asks for a measured before and after of how long a wave takes to clear
  for GLUT's forage and HERALD's standoff -- and `forage` and `straight` are
  not words in `GAITS` at all yet. Shipping phase 1 and phase 2 together would
  have destroyed the one useful property of a pure field addition, which is
  that green means nothing but a field arrived: build 284's rule about a rename
  and a rescale in the same build.

- **PHASE 2 IS DONE FROM BUILD 339, AND TWO OF ITS THREE WORDS WERE REFUSED.**
  The plan named `lurch`, `drag` and `wander`. Two were re-keys that DELETED a
  field rather than adding a word, which is the shape worth having; one is a
  second name for a shipped behaviour and one of the guide's other words turns
  out not to be a gait at all.
  **`drag` is the re-key.** The mechanism was keyed on `type.hurl`, a field
  only TOW carried, and build 338 gave that body `march` with a note calling
  the declaration INCOMPLETE rather than false — true of its own path, silent
  about `steer` calling `windUp` for it every frame and about what it drives
  being a SECOND body. Exactly TWO of the five `type.hurl` reads are
  FLAG-USES — `steer`'s decision to wind and the death path's decision to let
  go — and only those moved; the other three reach into the block for its
  values, and `type.hurl` STAYS as the block. That is the shape
  `rides`/`respawn`/`bond`/`lob` already have: a gait word saying WHAT the
  body does, and a block saying with what numbers. Proved identical over the
  roster (exactly one type carried the field, exactly that type declares the
  word) and the hash came back `-1334607133`.
  **The word is the HEAD's, and the guide uses it both ways** — its own table
  gives TOW `standoff · drag` and MASS `drag → tumble`. The roster's
  convention settles it: `ride` is on the rider and not the host, `chain` on
  the beads and not on what they follow. And giving it to the MASS would be
  worse than imprecise: both flag-uses are `gait === 'drag' && this.tether`
  and a MASS HAS a tether, so it would start calling `windUp`, which is the
  head's method reading the head's block.
  **A mote off a TOW carries `drag` and cannot use it, and that door was
  already shut** — measured, not asserted: 5 motes shed, all with
  `gait: 'drag'`, **0 with a tether and 0 that ever wound** over three
  seconds. `this.tether` is the second conjunct and `shed` never sets one.
  Build 332's LOOM `beam` finding again, and the better outcome — but only
  knowable by checking.
- **`wander` IS REFUSED, AND THE GUIDE'S OWN ENTRY SAYS WHY: `who: 'nothing,
  now'`.** DRIFT owned it until build 298 and `hover` has been the word since;
  the `wander()` METHOD is what implements `hover`, at the harmless switch's
  `case 'hover': default:` arm. So a `wander` row would be a second name for a
  shipped behaviour with NO type declaring it — the `kind: 'works'` fault, a
  table entry making a promise the code is not keeping. The method keeps its
  name because it is a good one; the vocabulary does not need two words for
  one gait.
- **`thrown` IS REFUSED TOO, AND IT IS THE MORE INTERESTING REFUSAL.** The
  guide's vocabulary lists it (`who: 'MASS, and every knockback'`) and it is
  genuinely "already in the game", which is exactly what makes it tempting. It
  cannot be a gait for a STRUCTURAL reason: a gait is a property of the TYPE,
  and `thrown` is a per-body COUNTDOWN — `this.thrown = 0` in the constructor,
  written to 0.2 by an ability, 0.4–0.5 by four boss sites and 2.2 by a TOW's
  release, decremented in `drive`'s second early return, and **no type
  declares it or could**. What it describes is a state a body passes through,
  not what it does when nothing has happened to it. A MASS spends 2.2 seconds
  of its life thrown and the rest marching on a tether, which makes `thrown`
  the loudest second of its life and not its gait. **"Already in the game" is
  an argument for a word only if what is already there is a property of the
  type.**
- **MIRE IS RE-SPECced AT BUILD 339, AND ALL THREE OF ITS PAYLOAD CLAUSES
  MEASURED EMPTY.** It is the one object of the nineteen that is not built and
  the guide says it wants a re-spec first. The body, the gait and the counter
  are kept; the payload is replaced. This is GYRE's method (331) and KITE's
  bolt's (336) a third time.
  - **"a mine takes twice as long to arm"** — `CFG.mines.inPlay` false since
    build 289. A payload on a system with no door, which is what GYRE was
    withdrawn for.
  - **"a DECOY decays"** — the DECOY is in `LOCKABLE.abilities`, so it is a
    purchase, and `life` 9 against a cooldown of 24 is **37.5% duty** for a
    player pressing it the instant it recharges and **0%** for one who never
    bought it. GYRE's clause verbatim.
  - **"the intake pulls at half rate" has THREE readings and all three are
    dead**, which is why the ambiguity was worth resolving rather than
    guessing. `intakeRate()` reads `world.attackers.size` and nothing else, and
    a body at range cannot be in that set. `world.up.intake` banks a drop that
    TOUCHES the machine. And `CFG.energy.pull` — the 26 u/s² `collectData`
    applies — is **measurably inert**, because drops are STEERED as well as
    pulled (`physicsStep` calls `steer` on `world.drops`) and a mote's own
    `accel` 300 does essentially all the work. Measured, mean distance closed
    in three seconds over eight bodies' salvage: **268.1 at the full pull,
    248.5 at half, and 265.9 at ZERO.** Turning it off entirely changes
    nothing, and the half reading is BELOW the zero reading — three draws
    inside each other's noise.
- **WHAT REPLACED IT IS SALVAGE, AND THE PRIMITIVE IS SHIPPED.** A ground
  effect needs a channel that is always on, needs no purchase, has no duty
  cycle and costs no health — that last one because "it does no damage at all"
  is the object's core rather than a detail. `Enemy.feed` is it: a GLUT walking
  `world.drops`, marking each one `dead` and `dissolved` under the comment
  "eaten, not destroyed: it must not score", paying nothing. MIRE's ground is
  that at a different site, and it makes the counter LITERALLY true — a short
  trail eats less.
- **THE GAIT IS GENUINELY NEW, AND MY FIRST READING WAS WRONG.** `ROUTES`
  already contains a `serpentine` (width 250, weave 0.55), so "grep for the
  mechanism that already does it" looked like it had an answer. It does not:
  `routeLateral` scales its offset by `reach = (d / 520k) ** commit` and
  `closing = (d - 170k) / 210k`, **both of which go to zero as the body
  closes**, so every route in the game FOLDS IN — and `serpent`'s whole
  picture is an amplitude that GROWS with depth. No combination of
  `width`/`weave`/`commit` can invert a monotone factor. Caught before it was
  written down, which is the only reason it is a note rather than a bug.
- **AND BAND 6 DOES NOT EXIST, SO THE SPEC'S BAND AND THREAT BOTH MOVED.**
  `perBand` is 7 against a `ceiling` of 49, so the five authored bands cover
  rungs 1–35 and everything above CLAMPS to band 5 — and build 332's rule is
  that a band wants a roster, not a member. MIRE is band 5 (rungs 29–35), and
  band 5's mean threat is **36.30**, so its wave has to weigh **32.67–39.93**
  to stay inside build 315's ±10% lever. Its authored `threat: 7` became 5,
  because `threatOf` is `hp / threatPerHp` = 160/30 = **5.33** and the budget
  cannot see a payload — the same blind spot FLINT's armour, LATCH's host,
  CHAFF's assist, LOOM's thread and KITE's station all sit in.
- **AND THE RE-SPEC NEARLY SHIPPED AS TWO DEAD FIELDS IN THE ONE DOCUMENT
  THAT IS ABOUT DEAD FIELDS.** The prose went into the data as `respec` and
  `notes`, and the plate renderer reads exactly seventeen keys —
  `name band levels threat fam r hp speed accel armor drops gait count
  counter what harmless mods` — and neither of those. Caught by grepping the
  renderer for what it actually reads rather than assuming a data file is
  read; both render now, as two further sections on the card. **A field added
  to a table is a claim that something reads it**, and the cheapest check is
  one grep of the reader.

- **THE ORDINAL HASH COMMAND AS THIS FILE DOCUMENTS IT HAS BEEN MEASURING THE
  WRONG FIGHT, AND THE FIGURE `-1334607133` IS NOT ORDINAL'S.** `fight.mjs`
  took its anomaly number as `argv.find((a) => /^\d+$/.test(a))` — the first
  bare number in the arguments — and the documented invocation is
  `node scripts/fight.mjs --seed 20260824 --hash 9000`, with no positional at
  all. So `find` returned **20260824**, the seed's own value, and the probe ran
  "ANOMALY 20260824" instead of ORDINAL. **It printed that in its own heading
  every time**, which is how long this can survive when nobody reads the
  heading.
  Measured on build 339: the documented command reports `ANOMALY 20260824 ...
  hash -1334607133` with nine bodies on the field, while `fight.mjs 1` reports
  `ANOMALY 1` with **39/31/26/10/41** bodies across its five samples and a hash
  of **1664149562**. The parser is fixed — the positional is now the first bare
  number that is NOT the value of a preceding `--flag` — and the documented
  command reads `ANOMALY 1, hash 1664149562`.
  **It still worked as a DIFFERENTIAL, which is exactly why it survived.** The
  degenerate number is stable and reproduced across builds 337, 338 and 339, so
  every "the hash did not move" conclusion in those builds is still TRUE — and
  the real fight agrees: taken on the fixed probe, build 339 and build 340's
  working tree both read `1664149562`, and an independent reading of 338 against
  339 came back identical on all six intermediate marks. **A differential
  instrument that is measuring the wrong thing still looks like it is working.**
  What it could not do is see anything that needs a boss on the field, which is
  most of what the hash is for.
  Builds 338's and 339's entries above quote the old figure. They are left as
  written, because the conclusion each drew is sound and rewriting them would
  hide that this happened; **`1664149562` is the number to compare against from
  build 340 on**, and a reading that disagrees with it should be checked against
  the probe's own ANOMALY heading before anything else.
- **MIRE IS IN FROM BUILD 340, AND IT IS THE NINETEENTH AND LAST OF THE OBJECT
  GUIDE'S ROSTER.** It does no damage at all; what it takes is the PAY. It
  weaves down the field — the one lateral in this game that OPENS OUT as it
  closes — laying ground behind it that grows with the weave, and salvage that
  comes to rest in that ground is eaten: marked `dead` and `dissolved`, so it
  never counts and never reaches the purse. Build 339 re-specced it before it
  was built because all three of its authored payloads measured empty; this is
  that re-spec built.
- **THE GAIT IS THE INVERSE OF EVERY ROUTE, AND THAT IS WHY IT NEEDED A WORD.**
  `routeLateral` scales its offset by `reach = (d / 520k) ** commit` and
  `closing = (d - 170k) / 210k`, both monotone in `d` and both ZERO at the
  machine, so every one of the six routes folds in. No combination of
  `width`/`weave`/`commit` inverts a monotone factor. Measured on one body, the
  widest offset reached in the top third of the crossing against the bottom
  third: **15 against 131, a ratio of 8.4**, against **15 against 17 (1.1)**
  for the same body with `ampFloor` pinned to `ampRim`.
- **AND THE WEAVE RATE IS DERIVED FROM THE AMPLITUDE, WHICH IS KITE'S LESSON
  APPLIED IN ADVANCE.** `sway` is the peak speed of the lateral TARGET as a
  share of the body's own cruise, so `omega = sway * cruise / amp` — a wider
  weave turns more slowly for the same target speed, which is the correct
  dependency and the one a fitted constant would hide. **The number was swept,
  not chosen**: 0.5/1.0/1.6/2.4/3.2 give 1/2/3/4/5 half-cycles across a
  crossing and widest offsets of 144/187/142/108/85. **1.0 is both ends of the
  answer at once** — it is where the swing is widest, past which the body can no
  longer track the target and the lag eats the amplitude, and it is the guide's
  own cycle count, its illustrative path being `sin(7t)`, which is 7 radians and
  therefore about 1.1 full cycles. At the 0.5 I authored first, the body
  completed ONE half-cycle in a 39-second crossing, which reads as a drift.
- **THE GROUND IS A NEW CLASS AND NOT A `Patch` WITH `dps: 0`, AND THAT CLASS'S
  OWN DOCSTRING IS WHY.** `Patch.retire()` records the trap: `applyDamage`
  floors a hit at `Math.max(1, ...)`, so a patch on zero damage **still takes a
  point off everything standing in it four times a second** — stopping it needs
  `next = Infinity`, at which point every one of Patch's damage fields is inert.
  And its picture is a spore print: specks seeded by area, a rim band, a rising
  mote cloud, two tints of one green. **A class whose every field is switched
  off is not the class you wanted.** What `Stain` reuses is the CONTRACT —
  `update`/`dead`/`draw` in `world.effects`, plus `ground` so it paints under
  the bodies — and the module, because "ground that rides in world.effects" is
  one concept. Measured: a BULWARK standing four seconds in a stain loses
  **0**, on bare ground **0**, and in a `Patch` of the same radius **99**.
- **`theirs` IS THE OTHER HALF OF THE GROUND, AND IT IS LOAD-BEARING AT ERA 2.**
  `Game.draw`'s ground pass ran inside `Game.ours`, which clips to below the
  yard wall — correct for a SPORE patch, because our mines and rounds may not
  cross that line. A stain is THEIRS: MIRE comes through the portal at the rim
  and the wall is below it, so a stain laid on the way down would have been
  clipped away for the first part of every crossing — and band 5 at rungs 29-35
  against an `eraGate` of 28 means era 2 is the ONLY field MIRE is played on.
  The flag splits that one pass in two, their ground under ours (the stain is
  the floor; a patch burns on top of it), and it **adds no `clip` call**, which
  is what build 263's count case asserts.
- **THE WAVE WAS PRICED BY MEASURING THE ALTERNATIVES.** `[mire 2, bulwark 1,
  mote 2]` weighs **35.27 against band 5's own mean of 36.30** — a ratio of
  0.971, inside build 315's ±10% lever. Two MIREs and three SPLITTERs is 26.57
  (0.73, outside); three MIREs and three MOTEs is 19.10 (0.53). The BULWARK is
  the combination and not ballast: 676 health behind 0.4 of armour is about
  fifteen seconds of barrel, so it cannot be rushed, and while those seconds run
  the stains are being laid and its own salvage falls wherever it happened to
  die. **You do not get to choose WHEN it dies, so you have to choose WHERE** —
  which is the object's lesson made unavoidable rather than explained.
- **THREE FAULTS IN MY OWN NEW CASE, AND ALL THREE WERE CAUGHT BY RUNNING IT
  STANDALONE FIRST.** (1) The kill-booking arm asserted an absolute zero and
  read **1** on a working build — the body killed to MAKE the drops is itself a
  kill and is swept in the same window. It is the difference between the two
  A/B arms now, which is the only honest form: four eaten drops would show as a
  difference of four, and both arms read 1. (2) The no-damage arm used the
  GLITCH FUSE as its instrument and read **0.000 for MIRE and 0.000 for a
  LURCHER** — a dead control that would have passed, because the glitch timer
  runs from `Director.update`, which every arm in the case stubs. Replaced with
  the ground A/B above, whose control reads 99. (3) The weave control asserted
  the flat run stayed under 1.5x and it read **2.6** — with the amplitude
  constant the body still reaches wider low down, because it starts at the
  centre and needs time to build any swing. The two RATIOS are compared against
  each other now.
- **THE HIGHLIGHTS ON THE BODY READ AS EYES, AND ONLY RENDERING IT FOUND IT.**
  Two round pale discs on the dome, meant as specular highlights, turned the one
  body whose whole subject is corrupted matter into a friendly blob. Nothing
  could fail for it. A single off-centre crescent says "wet surface" instead,
  which is what a highlight was for. And the colour is not the guide's
  `#ff5d8f`, which is BLOOM's body colour at **dE 0.0** — the same collision
  KITE answered at build 335. Swept across the rose band against all 89 roster
  tones: `#bc1aa7` is **21.3** from its nearest, inside the 15-23 this repo
  documents as working. The best-separated colour in that band is a pure red at
  24.6 and is refused: red is the glitch and alert register and is spoken for by
  MEANING rather than by distance.
- **AND TWO GUARDS THE AUDIT FOUND MISSING, ONE OF THEM FOR CODE I HAD JUST
  WRITTEN.** A `drag` type with no `hurl` or no `tows` block throws on `steer`'s
  hot path — reproduced: `TypeError: Cannot read properties of undefined
  (reading 'range')` at `windUp`'s `const H = this.type.hurl`. And it is
  REACHABLE without a probe, because a `drag` type with no `tows` is not
  intercepted by `release`'s `if (type.tows) return spawnTow(...)` and falls
  into the TETHERED trait block, which writes `e.tether` — the second conjunct
  of both flag-uses. Guarded both ways, and the message names the other thing a
  second dragger has to know: `spawnTow` takes no type argument and hard-keys
  `TYPE_BY_ID.tow`. Separately, `stainOf` shipped for an hour with **no caller
  at build time** while its own docstring said check-build called it for every
  serpent type — a thrower nothing calls is a promise the code is not keeping,
  and the first version of the guard was spliced ABOVE its own import and failed
  with "Cannot access 'stainOf' before initialization".
- **A FORECAST LEFT IN THE PRESENT TENSE READS AS GUIDANCE, AND MINE WAS
  TWO-THIRDS WRONG.** Build 338's `NO_ARM` comment predicted that phase 2's
  `lurch`, `drag` and `wander` would all want the same reader-test exemption.
  Both words that landed came in with a REAL dispatch arm instead, so `NO_ARM`
  is still `['march']` and the advice was never taken — and following it would
  have been the mechanism by which a word slipped the one guard that can see a
  missing implementation. Worth knowing the OTHER way past that test, which the
  audit measured rather than reasoned: `case 'wander':` added beside the
  existing `case 'hover':` on the harmless switch's shared `default:` arm
  satisfies the dispatch pattern while implementing nothing new. **The pattern
  can see an ABSENT arm; it cannot see an arm that does nothing, and nothing
  static can.**

- **BUILD 341 IS 340'S SUITE RUN, AND ONE MISORDERED ARGUMENT TOOK OUT A CASE
  NINETY-SIX CASES LATER.** 754 of 757 with a page error, and the three
  failures were two faults, not three.
  **`drawGlow(ctx, COLOUR, x, y, r, alpha)` takes the colour SECOND**, and
  `Stain.draw` passed it fifth at both of its calls -- so the colour was `0`
  and `rgba` went straight into `hex.slice is not a function`. That is build
  309's misordered-argument fault (a DRIFT specimen drawn with three arguments
  against a four-argument signature) with the opposite failure mode: 309's was
  SILENT, because canvas draws nothing for a non-finite path, and this one
  throws.
  **And the throw is why an unrelated layout case failed.** It fired at case
  #5, the subsystem drive that spawns every `ENEMY_TYPE` -- so MIRE laid a
  stain, the stain drew, and the throw killed the rAF LOOP. Case #101, "a
  fight takes the rail out of the bar", then read the QUIET state in both of
  its arms: `rail 44px, boss at 0, alerts 76` against `rail 0px, boss at 76,
  alerts 140` on builds 338 and 339, which is the fight state never applying
  at all. Build 288 records the mechanism -- "a throw inside the rAF loop kills
  the loop, the last painted frame stays on the glass, and the report is the
  boss screen freezes" -- and what is new is the DIAGNOSTIC shape: **one throw
  in a draw path degrades every later case that depends on the loop rather
  than on synthetic steps**, so a failure list is not a list of independent
  faults. Check the earliest page error before reading anything below it, and
  diff the detail against a previous run's `--json` to see which arms simply
  stopped being driven.
- **AND MY OWN WEAVE ARM SPAWNED AT AN ABSOLUTE `y`, WHICH IS A CLAIM ABOUT
  THE ERA.** It read 15 -> 131 standalone and 5 -> 20 in the suite, and the
  suite leaves the world at era 2: there the portal's rim is BELOW 240, so the
  body started above it, `serpentOn`'s `down` clamped to 0 for the whole first
  stretch, and the amplitude sat pinned at `ampRim`. The gait derives its depth
  from `entryLine`, so the arm releases relative to the same line now -- 27 ->
  193 against the control's 8 -> 24.
  **The assertion moved with it, from a within-run ratio to a between-run
  comparison at the SAME DEPTH.** Widest in the bottom third against widest in
  the bottom third is what the switch actually changes, and the switch is one
  config value with the same body, spawn, route and speed either side:
  measured 193/24, 131/17 and 137/17, i.e. 5x to 8x. The within-run ratio is
  the noisier reading and is reported rather than bounded tightly -- the
  control still carries `ampRim` of amplitude, and how wide it gets low down
  depends on where in the sine the body happens to be, measured at 0.67, 1.13,
  2.6 and 3.0 for the same code. **A tight ceiling on that is a threshold on a
  draw**, and the first version had one at 1.5.
  **The suite already had the right instrument and it worked**, which is worth
  saying plainly: case #5 drives the REAL rAF loop with every `ENEMY_TYPE` on
  the field and reported the page error on its first run. What was missing was
  running it before pushing. Every standalone probe used for MIRE stepped the
  world with synthetic `g.update` calls and drew nothing, so none of them could
  see a fault in a draw path -- the same blindness build 288 recorded when six
  hundred boss cases drove `g.update` and none painted. **A new draw routine
  owes one probe that lets the page's own loop paint it**, and the cheap form
  is: spawn every type, wait two seconds of wall clock, open a boss, and assert
  `world.time` advanced and no `pageerror` fired.

- **PHASE 3 IS IN FROM BUILD 342: A TYPE NAMES WHICH MARCH ROUTES IT MAY DRAW
  FROM.** The route was the only part of the approach that was never a property
  of the type -- every body rolled from all six, which is why a BULWARK
  serpentined and a NEEDLE bowed. `routesOf(type)` is the pool, `weightedPick`
  takes it, and three types name a subset, which is the guide's own content for
  this phase: SPLITTER `wide`, WARDEN `hook`, SCION `loiter`.
- **WHAT AN ALLOW-LIST REMOVES IS VARIANCE, NOT TIME, and that reframing is
  the finding.** Measured, every type on all six routes, crossing time and
  widest lateral offset, then weighted by the routes' OWN weights:

  | type | weighted mean | sd | range | pinned | delta | sd after |
  |---|---|---|---|---|---|---|
  | SPLITTER | 16.5s | 2.73 | 14.9-24.4 | 17.3s | +5% | 0 |
  | WARDEN | 18.8s | 2.43 | 16.1-24.3 | 20.8s | +11% | 0 |
  | SCION | 36.2s | 3.33 | 32.5-43.8 | 43.8s | +21% | 0 |

  So a SPLITTER was anywhere from 14.9 to 24.4 seconds depending on a roll and
  is now always 17.3. The widest offset is the other half of it and moves the
  right way for the two the guide describes as flanking: SPLITTER 88 -> 205
  ("comes in from the flank"), WARDEN 76 -> 133 ("comes round the side").
- **SCION IS THE ONE RESTRICTION WITH A REAL COST, AND ITS LATERAL IS NOT WHAT
  IT BUYS.** `loiter` is the only route in the table with a `dawdle` (0.55),
  which `drive` applies to the local cruise beyond 260 units -- so "hangs back
  at mid range before committing" is delivered by that and nothing else. Its
  widest offset on `loiter` is **18**, against 166 on `wide`, because
  `loiter`'s width is 180: this route gives a body this slow almost no arc at
  all. What it gives is **+21% on the slowest body in the game**, and
  `Director.standing` counts a SCION until it dies, so its waves run about
  seven seconds longer. Bounded by `solo: true` (build 313) -- one at a time,
  authored at 1 or 2 across three band-4 waves -- and recorded as the price of
  the guide's rationale rather than tuned, because inventing a balance answer
  in a build whose content is a mechanism is build 304's mistake.
- **THE FIELD IS OPTIONAL, AND THAT IS NOT BUILD 324 AGAIN.** Build 338 made
  `gait` mandatory on the rule that a value inherited in silence is
  indistinguishable from one that was chosen, and overturned 324 to do it. This
  goes the other way deliberately, and the distinction is what ABSENCE MEANS.
  An omitted `gait` meant a specific behaviour -- the march -- that the author
  may never have considered, so the silence could hide a body doing something
  nobody chose. An omitted `routes` means all six, which is the STATUS QUO: a
  type that should have been restricted and was not behaves exactly as it does
  today. There is no state the silence can hide, only a restriction not yet
  made. What a DECLARED list still owes is validation, and it gets the
  precedents' treatment: every id exists, non-empty, no duplicates, and not on
  a type whose gait replaces the route.
- **`weightedPick` NEEDS NO RE-NORMALISING FOR A SUBSET, and an empty list
  returns `undefined`.** It sums the weights of whatever it is handed, so the
  relative weights inside a subset are preserved by construction and a
  one-element list returns that element -- asserted as an identity (a
  one-route subset's total equals that route's own weight) rather than by
  sampling. The empty case falls off its last line as `items[items.length - 1]`
  and is why the guard refuses one.
- **AND A SINGLE-ROUTE TYPE STILL VARIES, WHICH IS WHAT MAKES ONE ROUTE
  SURVIVABLE.** `routeSide` is a per-body coin flip and `routeScale` is
  `rand(0.7, 1.25)`, both rolled in the constructor independently of the route
  -- so three SPLITTERs on `wide` split left and right and differ by up to
  1.8x in amplitude. Checked before choosing single-route restrictions, because
  if side and scale had been properties of the ROUTE the guide's three would
  have arrived as identical arcs.
- **THE DERIVED REPLACER SET CAME BACK SHORT, AND ONLY READING THE READOUT
  SHOWED IT.** The guard refuses a `routes` list on a type whose gait replaces
  the route, and derives that set from `drive`'s own chain rather than
  restating it. The first regex was `else if \(!this\.staged && ...gait ===
  'x'\)` and derived **six** -- silently dropping `roll`, whose arm is the
  FIRST of the chain and therefore a bare `if (`. It reads seven now. **A
  derivation that comes back short is worse than a written-out list, because it
  looks derived**, and the only thing that shows it is reading the number the
  guard prints. Both slice anchors also throw rather than deriving an empty
  set, so the guard cannot go vacuous.
- **THE HASH DID NOT MOVE, AND THE GUIDE SAID IT WOULD.** `1664149562` either
  side. docs/objects.html's phase 3 row reads "it is the one that will move the
  hash for a real reason", and that is the structural blindness builds 300,
  301, 307 and 314 recorded and 318 corrected: `fight.mjs` opens from
  `openBoss` with the director frozen, so the only types on that field are
  ORDINAL, TALLY and DIGIT, none of which names a subset. And `weightedPick`
  makes exactly ONE `Math.random()` call whichever pool it is handed, so the
  stream is untouched and even a body that DID restrict would not shift
  anything downstream of it. The right instrument is the crossing table above.
  **The guide's prose for this phase also names two effects its own table
  achieves in phase 4** -- "a BULWARK stops serpentining, a NEEDLE stops
  bowing" -- and both of those rows are re-gaitings (`creep` and `straight`),
  not route restrictions. Corrected on the page.
- **AND THE SAME INVERTED try/catch AS BUILD 340, ONE BUILD LATER.** The new
  case collected what `routesOf` LET THROUGH into a field called `refused` and
  asserted `refused.length === 3` -- demanding three failures, passing only on
  a broken build, reading `[]` on a working one. Build 340's MIRE case had the
  identical fault. **Twice in two builds is not a slip, it is a shape I reach
  for**: a try/catch whose non-throwing path returns a value reads as "collect
  the successes" and collects the opposite. The fix both times was the NAME --
  `missed`, asserted at zero, with the count caught reported beside it.

- **PHASE 4a IS IN FROM BUILD 343, AND IT IS ONE ROW OF THE GUIDE'S TEN.**
  NEEDLE takes `straight`; five of the other nine are REFUSED and four are
  deferred, each for a reason measured or read rather than argued. The ORDINAL
  hash MOVES, `1664149562` -> `-954811922`, and the cause is the wobble fix
  and nothing else -- see build 344, which is the reading this build owed and
  got wrong twice before getting it right. The `straight` arm and the NEEDLE
  re-gaiting are identities for that fight: build 343 with ONLY `?? 1`
  reverted to `|| 1` reads `1664149562` to the bit, which is build 342's own
  figure. **Every sentence in this build's own commit message about the hash
  drifting, and the instrument note that was appended below it, is WRONG and
  is corrected under build 344.**
- **`straight` AND `creep` DIFFER IN EXACTLY ONE THING, AND IT IS A CLAIM
  RATHER THAN A MECHANISM.** Both aim at the machine and add no lateral --
  `tx, ty` already hold the mount and both arms only decline to offset it.
  `creep` GROSSES THE CRUISE UP so the body arrives at the number its type
  names, because ANVIL's crossing time is quoted to the player. Nothing about
  NEEDLE is a clock -- the guide calls it "the fast one" and names no seconds
  -- so `straight` writes no cruise at all. **So `type.speed` means
  "delivered" for a marcher and "asked" for a compensated gait, and which of
  the two a body gets is now a word rather than an accident.**
- **A MARCH BODY HAS NEVER DELIVERED ITS AUTHORED `speed`, SO RE-GAITING ONE
  ONTO A COMPENSATED GAIT IS A SILENT SPEED-UP OF ITS OWN PER-BODY FACTOR.**
  The blend against `linearDamping` gives `speed * k / (k + 0.55)` with
  `k = accel / 100`, and the factor VARIES by body -- measured across the
  phase-4 roster: NEEDLE **1.167x**, MOTE and PLATE 1.289, TOW 1.314, PRISM
  1.324, HERALD 1.367, BLOOM 1.500, GLUT 1.524, **BULWARK 1.611**, steepest
  on the slowest bodies. So the guide's "STRAIGHT, TUMBLE and CREEP first,
  they remove behaviour and cannot surprise" is true of STRAIGHT and false of
  CREEP: BLOOM -> `creep` is a 1.50x speed buff and BULWARK -> `creep` a
  1.61x one, on the two heaviest bodies, arriving inside what that row calls
  a change that cannot surprise. Both are deferred as BALANCE decisions.
  **Before re-gaiting anything onto `creep`, `dive` or `standoff`, compute
  that body's own factor** -- it is not a uniform buff and it is not visible
  in the diff.
- **`OWN_SPEED` GATES THE DAWDLE AND NOT THE COMPENSATION, which is why
  `straight` is in it while writing no cruise.** The compensation is written
  inline per arm; the set's one job is `route.dawdle`. Without it a NEEDLE
  that rolled `loiter` -- one body in ten -- crossed in **14.45s against 7.67
  on `direct`**, so the body whose entire identity is being fast was nearly
  half speed on a spawn roll. Build 318 recorded this shape for `dive` and
  noted `roll` and `flock` inherit it too; for them it is a slower approach,
  and for NEEDLE it was a broken claim. **And the set gates the MULTIPLIER
  only**: `this.route.dawdle` is the first term of that guard, so it is
  dereferenced for every gait in the set -- a replacer still needs a route
  OBJECT, and an empty pool throws there as well as in `routeLateral`, which
  is the second reason `routesOf` refuses an empty list.
- **THE CLAIM IS THE PATH AND THE READING IS INTRINSIC.** Path length over
  chord needs no knowledge of where `drive` aims, which is build 328's
  correction to measuring "straight" against a line you build yourself.
  Measured on the same body, same spawn, same pinned route/side/scale, the
  GAIT as the only switch: **straight 1.013-1.016 (span 0.002) against march
  1.014-1.268 (span 0.255)** -- a hundredfold tighter -- and the widest
  lateral offset 20-47 against 26-231. The control is the SAME SIX DRAWS with
  the gait put back, so the comparison cannot be about which routes were
  sampled, and a flat reading means nothing unless the instrument has been
  shown to read a bent one.
- **THE RESIDUAL TIME SPREAD IS THE CONSTRUCTOR'S OWN ROLL, AND `straight`
  KEEPS IT DELIBERATELY.** After the change the crossing still runs 7.45 to
  9.23s (1.24x), which sits inside `rand(0.86, 1.14)` = 1.33x -- the per-body
  `speedScale`. `creep` overwrites `cruise` outright and therefore DROPS that
  roll (ANVIL reads 15.65/15.67 on two routes); `straight` writes no cruise,
  so the roll survives. **The object is one line, not one speed**, so the
  ratio carries the claim and the time is reported.
- **BOTH REVERT PROOFS FIRE AND EACH ON ITS OWN CONJUNCT, which is what says
  the case is measuring two things rather than one.** Taking `straight` out of
  `OWN_SPEED` reads loiter **12.78s against direct 9.43 (1.36x)** and fails
  the dawdle arm with the ratio still flat -- correctly, because a dawdle is a
  speed and not a path. Giving the arm creep's gross-up reads **103.8 u/s
  against an asked 104** and fails the speed arm alone. So the case would
  catch somebody "fixing" this arm into a copy of creep's, which is the +17%
  above.
- **AND MY DETAIL STRING ASSERTED ITS OWN CONCLUSION, FOR THE FOURTH TIME IN
  THIS FILE'S HISTORY.** It printed "-- uncompensated, which is what makes it
  straight and not creep" as LITERAL TEXT, so revert B's FAIL line said
  "uncompensated" while showing 103.8 against a prediction of 89.1. Build
  319's "still flocking", build 324's "-- monotone in both" and build 323's
  "CROSSED" are the same fault; it is derived now. **A detail string is a
  declaration and it has to be computed like any other assertion** -- and
  writing it a fourth time immediately after fixing the third is the sharper
  half: diagnosing a fault does not inoculate you against writing it.
- **FIVE OF THE NINE ARE REFUSED, AND FOUR OF THE FIVE ARE STRUCTURAL.**
  - **PLATE -> `tumble`** and **MASS -> `tumble`**: `tumble` is in
    `OWN_SPAWN`, so a tumble type PLACES ITSELF from a side wall instead of
    coming through the portal -- and build 312 already measured that a hostile
    which coasts to a halt rests outside `autoTarget`'s cone for ever, which
    is the whole reason `roll` exists as a fifth word rather than a second
    meaning for `tumble`.
  - **TOW -> `standoff . drag`** and **MASS -> `drag -> tumble`**: `gaitOf`
    returns ONE string and there is no handover mechanism. Two gaits in one
    life is a feature to build, not a re-gaiting.
  - **BULWARK -> `creep . planted`**: `planted` is refused for a second type
    by an explicit guard whose own message names what has to move first
    (build 328), and `creep` alone is the 1.61x above.
  - **PRISM -> `cartwheel`** is the interesting one, because it is BUILDABLE
    and its rationale is false. The capsule hit profile keys on `type.bar`
    and not on the gait (`hitCircleAt` returns `this` for a body with no
    bar), so a spinning PRISM stays a disc -- but `incidence` is `depth / R`
    off the impact parameter with **no angular term anywhere**, so PRISM's
    reflection is rotationally symmetric and turning the body cannot make the
    mechanic visible. The guide's reason is "Its reflection depends on the
    angle a round meets its face. Turning the body makes the mechanic
    visible"; the first half is about WHERE on the disc the round lands and
    the second half does not follow. A spin that advertises a rule the body
    does not have is build 319's readout of nothing, so the row is refused
    until the mechanic reads the angle -- which is a balance change of its
    own.
- **AND THE FOUR DEFERRED ONES EACH NEED A MECHANISM RATHER THAN A WORD.**
  BLOOM and BULWARK -> `creep` are the speed factors above. **MOTE ->
  `flock`** needs a per-release SERIAL: `flockOn` groups by `e.shoal !==
  this.shoal` and the only writer of `shoal` is `spawnSchool`, so
  `undefined === undefined` means a serial-less MOTE would flock with EVERY
  un-serialled body on the field -- steering at the centroid of the whole
  wave and separating off a BULWARK. Giving MOTE a `school` field instead
  changes `release`'s dispatch, `threatOf`'s `many` factor, `formable` and
  build 314's one-school-per-wave ceiling. **HERALD -> `standoff`** needs its
  own `lob` block (the shared-block rule) plus the 1.37x, and the guide
  itself asks for a measured before-and-after clear. **GLUT -> `forage`** is
  a new word and a new steering target.
- **AND `straight` IS NOW THE UNCOMPENSATED OPTION THOSE ROWS WANT, WHICH IS
  THE ACTIONABLE HALF OF THIS BUILD.** The guide asks for BULWARK to lose its
  lateral and wobble ("a 2.7-density body should not have a lateral or a
  wobble. It arrives") and reaches for `creep` to do it -- which buys a 1.61x
  speed-up nobody asked for. `straight` is that request with no speed change
  at all, and the same holds for BLOOM. **It is still a balance change and
  still not this build's**, because removing the lateral SHORTENS the path and
  therefore the crossing: NEEDLE's mean fell when its lateral went, and doing
  that to band 5's heaviest body moves a clear time the 120s cap already
  fails at four of seven rungs (build 306). What the next build needs is the
  clear table either side, not another gait word.
- **AND A REFUTED ALARM OF MY OWN, WHICH IS THE MOST USEFUL THING IN THIS
  BUILD.** Chasing a fan-out claim that CHAFF spends 80% of its run WALKING,
  I measured a chaff released at the rim with the gun off: the hand-back
  fired **zero** times on four independent columns, the body settled ~180
  units BELOW the mount, spent **96%** of its life there and was picked by
  `autoTarget` on **1.2%** of frames. That is build 312's cone ruling, live,
  in a shipped object -- and it is not real. Measured through the DOOR
  instead, with the gun on: the chaff is picked on **97.5%** of frames and is
  **dead at frame 158**, never going below the mount, against a LURCHER at
  147 and a MOTE at 72. **The below-the-mount drift is a property of a probe
  with the gun switched off, which is a state the game never produces**, and
  my own cone arithmetic was the wrong instrument where `g.autoTarget(w)` was
  available. Build 322's rule from the other side: a case for a rescue
  mechanism has to be set up in the state that needs it, and I set up a state
  that needs nothing and read a catastrophe out of it.
  **What survives is narrower and worth keeping.** The walk radius is
  `r + s.r + grabPad + walkPad + span` = 13 + 26 + 2 + 8 + 111.8 = **160.8**,
  against a measured closest approach of **183** -- so the branch is live
  with 22 units to spare and is not taken on any natural approach, because
  the body passes the machine rather than closing on it. `hopOn`'s docstring
  says it hands back "for the last stretch in front of the machine", which
  describes a path measured at zero on every column and one the body is dead
  long before reaching anyway. **A comment that describes a branch as routine
  owes the same measurement a threshold owes its floor.**
  And the fan-out's own figure (3847 of 4800 frames) reproduced nowhere: 0 of
  24,000 on four columns. **A fan-out's finding is a pointer to the right
  file; the mechanism is still yours to measure** -- and this run is the
  clearest instance yet, because the pointer was right (the comment IS wrong)
  and the number was wrong and my own first reading of the same file was
  wrong in a third direction.
- **The phase-3 audit returned NO blockers, nothing silent and nothing
  refuted**, and independently reproduced the readers enumeration, the
  `weightedPick` subset identity and the hash blindness. Three of its four
  lenses died on a session limit, so it is one lens's sweep rather than a
  panel -- worth saying, because "the audit found nothing" reads as four
  agreements and is one.
- **A DECLARED `wobble: 0` WAS DISCARDED BY `|| 1`, AND THAT IS THE SIXTH
  INSTANCE OF THIS SHAPE -- FOUND IN MY OWN BUILD'S PATH.** `drive` read
  `(this.type.wobble || 1)` and `0` is falsy, so a type that EXPLICITLY
  declared the wobble off got the fallback meant for one that declares
  nothing. This is worse than `levels ?? 3` or an omitted `band` reading as
  band 1: there the silence hid an unconsidered value, and here a value
  somebody chose and wrote out was overwritten one layer down.
  **The fallback had no legitimate consumer at all.** Measured: **ZERO of the
  44 loose types omit the field**, so `|| 1` could only ever overwrite a
  chosen zero -- which is the derivation that says correcting it cannot have
  changed a body relying on it, and the case asserts that partition in both
  directions rather than sampling the day's roster.
  **Three shipped types were affected and each has a docstring saying the
  wobble is off**: ANVIL (`creep` -- "the wobble goes with the arc... and the
  type authors 0", build 328), LATCH (`ride`) and MIRE (`serpent`), all three
  reaching the line because their gait arms are `else if`s in the chain
  rather than returns. The other nine zero-declarers are safe for a reason
  worth knowing: the seven HARMLESS ones (DRIFT, SEED, EMBER, HUSK, LANTERN,
  FILAMENT, BELL) hit `if (this.harmless ...)`, whose switch ends in
  `return;` twenty lines above the wobble; and CHAFF reaches it only on a
  hand-back this same build measured at zero.
  What they were getting is not a corner value: the declared range across the
  loose hostiles is **0.03 (SHRIKE) to 2.6 (LURCHER)**, so a factor of 1 sits
  mid-table between BULWARK's 0.9 and TOW's 1.1.
- **AND BUILD 328'S OWN INSTRUMENT COULD NOT SEE IT, WHICH IS THE HALF WORTH
  KEEPING.** That build proved `creep` straight with path length over chord
  -- 1.0089 against a routed LURCHER's 1.085 to 1.190 -- and a SYMMETRIC sine
  wander adds under 1% of path length, so the ratio proved the LATERAL was
  gone and was **blind to the WANDER**. Measured on ANVIL either side, mean
  and worst heading deviation from the true bearing to the mount:
  **6.59 / 12.37 degrees against 0.00 / 0.00**, with the ratio 1.0084 ->
  1.0000 exactly and the crossing 15.65s -> 15.42s. So the fault was inside
  the thing a green case had already measured, and the reading that sees it is
  the heading deviation, which nothing had ever taken. **Ask what quantity a
  passing measurement is insensitive to** -- the same rule as build 320's
  figure dump, one level in.
- **IT WAS FOUND BY GREPPING THE READERS OF A FIELD I HAD JUST AUTHORED, NOT
  BY A TEST.** Build 343 wrote `wobble: 0` onto NEEDLE with a comment saying
  the word excludes the wander, and one `grep -rn "\.wobble" src/` to confirm
  the field had a single reader showed `|| 1` in that reader. **Without it
  this build would have shipped NEEDLE's wobble going 0.8 -> 1, i.e. MORE
  wander, under a comment claiming it was off** -- a regression wearing a
  removal's clothes. The discipline that caught it is the cheap one this file
  already asks for: when you author a value, read its reader.
  The fix is one character (`??`), it is a CORRECTNESS fix rather than a
  balance choice because every affected type's own docstring states the
  intent, and its cost is 1.5% of ANVIL's crossing -- inside the spread that
  type's own note already records.
- **THE SUITE WAS KILLED SIX MINUTES IN RATHER THAN LET FINISH, DELIBERATELY.**
  A run validates the tree it is running against, and that tree was about to
  change in a way that moves the very numbers the new case measures. Killing
  it cost six minutes and saved a second full run; one green run on the tree
  that ships is what the rule actually asks for. Killed BY PID (`kill 2003`),
  never `pkill -f`, which this file records matching its own shell three
  times over.
- **BUILD 344 IS THE READING BUILD 343 OWED, AND 343 GOT IT WRONG TWICE
  BEFORE GETTING IT RIGHT.** `http-server` IN THIS CONTAINER SERVES ITS OWN
  CWD AND IGNORES A TRAILING PATH ARGUMENT.** That is the whole of it, and it
  is the same class of fault as build 340's positional parser: an instrument
  confidently measuring the wrong thing.
  `--url` exists so a differential can be taken properly -- serve the old
  commit from a `git worktree`, read both sides back to back. Build 343 did
  that and every "old build" reading was the LIVE TREE, because
  `http-server -p 8096 -c-1 --silent /tmp/w342` launched from the repo serves
  the repo. Proved off `/proc` rather than guessed: every one of those
  processes has an **empty cmdline** (so `ps | grep -- "-p 8096"` matches
  nothing, which is also why none of them could be killed) and
  `cwd=/home/user/Shooter`. The ONE that worked had `cwd=/tmp/w343`, because
  that command happened to `cd` first.
  **The invocation that actually serves a worktree is
  `cd <worktree> && http-server -p N -c-1 --silent` with NO path.**
  **And the way to find and stop one is `/proc`, not `ps`.** Because the
  cmdline is empty, no pattern match reaches these processes -- which is the
  same family as `pgrep -f` matching its own shell, from the other side: there
  the pattern matched too much, here it matches nothing. What works, and what
  cleared seven strays while leaving the live server up:
  `for pid in $(pgrep -x http-server); do readlink /proc/$pid/cwd; done` to
  see which tree each one is serving, then `kill` the ones whose cwd is not
  the one you want. A dead worktree shows as `cwd=/tmp/xxx (deleted)`, which
  is itself the tell that a server outlived the directory it was serving.
- **SO THE CHAIN OF WRONG CONCLUSIONS RAN: right prediction, wrong
  refutation, wrong instrument story -- and the prediction was right all
  along.** 343 predicted the hash would move and named the channel in advance
  (a mote off ORDINAL or TALLY carries `type.wobble: 0`, is `isDrop`, so it
  skips every gait guard AND the harmless `return`, and reaches `wob`; those
  salvage paths straighten and change when the purse banks). Then a
  path-argument server "refuted" it. Then, finding that even build 342 read
  the new figure, I wrote a note claiming the instrument drifts within a
  session and that builds 338-342's readings were suspect. **All of that was
  one bug.** Measured properly: 342 served with the cwd right reads
  `1664149562` with all six marks matching its record, and 343 with only
  `?? 1` reverted reads `1664149562` too. The move is real, it is the wobble
  fix, and no other part of 343 touches that fight.
- **AND THE CURL CHECK THAT SHOULD HAVE CAUGHT IT PASSED, BECAUSE IT DID NOT
  DISCRIMINATE.** I did verify the served tree -- `curl .../src/enemies.js |
  grep -c "wobble || 1"` returned 1, which I read as "the revert is being
  served". The live tree returned 1 as well, because **the build's own new
  comment quotes that string in prose**. A verification that a comment can
  satisfy is not a verification. Parse the EXPRESSION
  (`grep -oE 'this\.type\.wobble (\|\||\?\?) 1'`) or read a constant, never
  match a string that documentation can also contain -- which is the same
  rule as a detail string being a declaration, on the instrument side.
- **`fight.mjs` NOW SAYS WHICH TREE IT READ, AND `--expect NNN` REFUSES A
  MISMATCH.** It fetches the served `config.js`, parses BUILD and REV and
  prints them in the heading every run; with `--expect` a disagreement exits
  1 and the message names the `cd`-first remedy. Printing alone is build
  329's rule ("a `console.log` in a guard script is not a guard"), so the
  refusal is the load-bearing half. `check-build.mjs` reads `fight.mjs`'s
  source and fails the build if the fetch, the print or the refusal goes --
  the `formable()` idiom, so it survives a reword -- and it is revert-proved:
  stubbing the fetch out exits 1 with "missing: reads the served tree".
- **WHICH RECORDED DIFFERENTIALS ARE AT RISK, AND THE TELL THAT SEPARATES
  THEM.** Five probes take `--url` (`fight`, `tiers`, `dps`, `variance`,
  `contact`) and the other four are still unguarded -- named in
  `check-build`'s readout rather than failed, because adding the check to
  them is its own change. Builds 287, 329, 332 and 333 all recorded
  worktree-served differentials, and whether each was valid depends on a
  command nobody wrote down. **The tell is the direction of the result: a
  `--url` differential that reports a MOVE proves the two trees really
  differed and is sound; one that reports NO MOVE is exactly what a stale
  serve produces and cannot be distinguished from it.** So build 329's
  bisect is safe (its file swap produced two different hashes) and every
  "identical either side" reading taken through a second server is worth
  re-taking with `--expect`.
  **Build 342 is the worked example and it survives, but not on its
  measurement.** Its message says "1664149562 either side", and a correctly
  served 342 does read `1664149562` -- confirmed here. But if its OTHER side
  was served the compromised way it was reading the live 342 tree, so the two
  figures would have agreed BY ARTEFACT. The conclusion holds anyway because
  it rests on a structural argument rather than on the number: only ORDINAL,
  TALLY and DIGIT are on that field and none of them names a route subset, so
  a route allow-list cannot reach it. **That is the shape to aim for -- a
  differential is worth most when it CONFIRMS an argument you could already
  make, and worth least when it is the only thing holding the claim up.**

- **BUILD 345 RE-TAKES THE TWO AT-RISK HASH DIFFERENTIALS AND BOTH CLAIMS
  HOLD, WHICH IS THE OUTCOME THAT WAS LEAST INFORMATIVE AND STILL WORTH
  HAVING.** Build 344's own recorded debt was that builds 332 and 333 both
  reported "`-1334607133` either side" through a second server, and that by
  344's own tell a NO-MOVE reading is exactly what a stale serve produces and
  cannot be told apart from it -- with a second, independent reason to void
  them, which is that both predate 340's positional-parser fix and so were
  reading the degenerate "ANOMALY 20260824" fight rather than ORDINAL.
  Re-taken properly -- `cd <worktree> && http-server` with no path, the
  CURRENT `fight.mjs`, and `--expect NNN` confirming the served BUILD in the
  probe's own heading every run -- **builds 331 through 338 all read
  `1664149562`, with all six intermediate marks, all six body counts and the
  final hash identical to the digit.** So build 332's new door in
  `resolveSegment` (the one place a round is tested against anything, on
  `fight.mjs`'s own hot path) and build 333's new condition on `applyDamage`
  (the door every hit in a boss fight comes through) both provably touched no
  existing body, and 337's removal of a branch from `updateProjectiles` and
  338's mandatory `gait` field read eleven times per body per frame did too.
  **The conclusions were all sound and none of the readings were**, which is
  the distinction worth keeping: a differential instrument measuring the wrong
  thing still looks like it is working, and the only way to find out is to
  make it say which tree it read.
  **Measure the whole window rather than its ends.** The cheap version of this
  was 331 against 332 and 332 against 333, and it would have left 334-338
  resting on the degenerate figure with 339 established only by 340's own
  reading. Eight builds at ~40 seconds each closes it outright, and agreeing
  on SIX MARKS across eight builds is a stronger claim than agreeing on the
  final hash, which could in principle hide two offsetting moves. The
  unbroken run is now 331 -> 343, where the wobble fix moved it to
  `-954811922`.
  Rolled through ONE worktree with `git checkout` between runs rather than
  eight worktrees and eight servers -- `-c-1` disables caching, so the server
  serves whatever is on disk, and `--expect` is what confirms each checkout
  took. That is also what kept the container clean: build 344's session left
  seven strays because they could not be killed by pattern.
- **THE SERVED-TREE CHECK IS ONE HELPER FROM BUILD 345, NOT FIVE COPIES.**
  344 wrote it inside `fight.mjs` and NAMED the other four `--url` probes as
  sharing the exposure and lacking it (`contact.mjs`, `dps.mjs`, `tiers.mjs`,
  `variance.mjs`) -- deliberately, because adding it was its own change. All
  five read it out of `scripts/served.mjs` now, called immediately after the
  `--url` flag resolves and BEFORE any browser launches, so `abort` is a
  plain exit and the helper never has to know what the caller opened.
  **Five copies would have been the hand-kept-list fault, and the guard is
  where it would have bitten**: `check-build` would have had to name five
  sites and would have gone stale at the sixth. It asks the DIRECTORY instead
  -- every `scripts/*.mjs` containing a `flag('url'` call must import
  `checkServed`, call it, and exit on its verdict -- which is the
  `formable()` idiom and `ANOMALIES.length`'s. Proved in five directions
  against a scratch copy: a probe losing the import, importing and never
  calling, calling and not exiting, `served.mjs` losing its fetch, and the
  VACUITY arm, where renaming `flag('url'` away makes the probe list empty
  and the guard fails rather than passing with nothing to assert.
  Both live paths proved on all five probes as well, because a guard on the
  source says nothing about the runtime: pointed at build 338 with
  `--expect 344` each one refuses, names itself and quotes the `cd`-first
  remedy, and exits before launching a browser; pointed at the live tree with
  `--expect 344` none refuses and each prints `build 344`. And an unreachable
  server warns that the reading is of an UNKNOWN tree rather than claiming
  one.
- **`contact.mjs` GETS THE CHECK TOO, AND IT IS THE ONE THAT NEEDS IT
  LEAST.** It has no assertion and exits 0 whatever it draws, so a sheet of
  the wrong tree's marks is not a false measurement in the way a hash is.
  It is in because the guard asks the directory: an exemption would be a
  hand-kept list of one, and the next probe to arrive would inherit the
  argument for being left out. **A derived guard is worth a little
  over-coverage.**
- **AND ADDING A NUMERIC FLAG EXPOSED BUILD 340'S POSITIONAL FAULT IN TWO
  MORE PROBES, WHERE IT HAD BEEN REACHABLE ALL ALONG.** 340 found
  `fight.mjs` reading its anomaly number as
  `argv.find((a) => /^\d+$/.test(a))`, so the documented
  `--seed 20260824 --hash 9000` ran "ANOMALY 20260824" -- and fixed the one
  file. `dps.mjs` and `variance.mjs` carried the identical line, and
  **`--runs 3` was enough to trigger it**: with no positional the first bare
  number in the arguments is the flag's value, so `variance.mjs --runs 3` ran
  anomaly 3 and said so in a heading nobody reads. Measured on the shipped
  code before the fix, `dps.mjs --expect 345` printed **`ANOMALY 345`** and
  carried on. After it: no positional gives ANOMALY 1 on both, `dps.mjs 5
  --expect 345` gives 5.
  **The new flag did not create the fault, it made it obvious** -- which is
  the argument for adding one: `--expect` is a numeric flag on five probes,
  so any probe that confuses a flag value for a positional now does it on the
  very invocation a careful differential uses. A latent fault reachable only
  by a combination nobody types is a fault that waits; make the common
  invocation hit it.
  `check-build` derives the probes that read a bare-number positional and
  refuses the `find`-the-first-number form outright (it cannot skip a flag's
  value by construction) as well as a loop missing the skip. Three revert
  proofs plus the vacuity arm. **This is the third place that parser has been
  written**, which is why the guard derives the set rather than naming it.
- **THE GUARD'S OWN REGEX SOURCE MATCHED THE GUARD'S OWN FILE, WHICH IS
  `pgrep -f` IN A FOURTH COSTUME.** `check-build.mjs` searches every
  `scripts/*.mjs` for the broken parser's pattern -- and its own source
  contains that pattern as a regex literal, so the first run failed the build
  naming `check-build.mjs` itself. This repo has recorded the same self-match
  three times on the process side (`pgrep -f` matching its own shell and
  looking like a respawning process, `pkill -f` ending the turn's command at
  exit 144, and a heredoc whose CONTENT carried the pattern). A sweep over
  source has it too. The skip is `import.meta.url.split('/').pop()` rather
  than the filename written out, because an exemption list of one is still a
  list. **Any sweep that greps for a pattern has to exclude the file
  containing the pattern, and the honest way to do that is to derive which
  file that is.**
- **REMAINING DEBT, NOT TAKEN AT 345: build 287's `tiers.mjs`
  differential.** It compared build 283 on :8098 against 287 on :8099 across
  the byte migration and reported `buys` identical at all twenty rungs and
  the tier-20 loadout identical to the id. That is a NO-MOVE reading taken
  through a second server, so by 344's own tell it cannot be told apart from
  a stale serve -- and the currency magnitudes differ by x1000 between those
  two builds, so a stale serve would have produced exactly the reported
  agreement. `tiers.mjs` has the `--expect` refusal now, so re-taking it is
  mechanical; what makes it a separate build is the cost, two full
  twenty-rung runs, against a claim that is about affordability rather than
  about physics. Flagged rather than spent, which is the rule about a request
  that will blow the budget.
  **BOTH SENTENCES WERE WRONG AND BUILD 346 SETTLED IT.** It is not
  "indistinguishable from a stale serve" -- it is positively PROVED to have
  been one, from git alone before anything was run. And re-taking it is not
  mechanical: the probe cannot read a pre-286 purse at all, so the reading is
  void rather than pending. The debt is closed by striking the claim, not by
  spending two twenty-rung runs on it.
- **THE CURRENT ORDINAL FIGURE IS `-954811922`, and build 340's note saying
  `1664149562` "is the number to compare against from build 340 on" went
  stale three builds later.** That number was right for 340 through 342 and
  is the unbroken figure for 331-338 measured at 345; build 343's wobble fix
  moved it, which 343's own entry records. Measured on the shipping 345 tree
  through the extracted helper, with the served BUILD confirmed in the
  heading: **`-954811922`**, marks `-549790228 / 2055604435 / -1731762476 /
  355215982 / 437007875`. This build changes no `src/` file but the BUILD
  literal, so the reading is there to say the extraction did not break the
  probe rather than to clear a change -- and it is build 329's rule arriving
  on this file's own prose: a derived number quoted in a note is a copy, and
  when it moves, grep for who was quoting it.

- **BUILD 346 CLOSES 345'S DEBT BY DISPROVING THE CLAIM RATHER THAN
  RE-TAKING IT, AND THE PROOF COST NOTHING BUT `git show`.** Build 344's tell
  was that a `--url` differential reporting NO MOVE cannot be told apart from
  a stale serve. For build 287's phase-5 `tiers.mjs` reading it is stronger
  than that: **the 283 column is positively impossible.** The probe funds each
  tier with ONE line -- `0bb3cfa:scripts/tiers.mjs:292`, `w.bytes = spend` --
  and build 286 renamed `world.energy` to `world.bytes`, so
  `1fab593:src/game.js` has `const purse = ... : w.energy;` where
  `8bacf56` has `: w.bytes;`. On 283's tree that write lands on a property
  `buy()` never consults, the purse stays where `reset()` left it, and every
  purchase is refused for lack of funds. The record says `buys` 1, 2, 3, 5, 5,
  8, 12, 16, 25, 33, 15, 24, 38, 58, 82, 111, 141... on BOTH sides.
  **Then measured rather than argued, which is build 329's rule.** That exact
  probe (`0bb3cfa`, the commit that ran the differential, with its own local
  `src/` so its prices match) against a 283 served the correct way: **buys 0,
  0, 0 at tiers 1-3, dps flat at 86 -- the stock gun -- and pay 0 B**. What
  that PROVES is that the column labelled 283 was not build 283's tree; that
  it was specifically the live tree is the inference on top, from build 344's
  finding that this container's `http-server` serves its own CWD. Either way
  "the same purchases are still affordable at the same tiers" was never
  measured. It is struck in place in
  the 287 block above rather than deleted, because the paragraph's first half
  (a differential needs both builds in one container) is still right.
- **`--expect` ANSWERS "WHICH TREE" AND NOT "CAN THE PROBE READ IT", AND THAT
  IS A SECOND, INDEPENDENT HOLE.** Build 345 shipped the first; this is the
  one that actually bit 287. A `--url` differential reaches back tens of
  builds and crosses renames, and the failure is SILENT in the worst way --
  a write to a dead property and a read of `undefined`, on exactly the side
  that was pointed there deliberately. `requireWorld(page, ['bytes'], who)`
  in `served.mjs` refuses a served tree that lacks a field the probe's
  figures come off. Proved in both directions on all six callers: pointed at
  283 each one refuses at boot, names itself and explains the rename;
  pointed at the shipping tree each prints `world has .bytes` and proceeds.
- **AND IT TURNED A CONFUSING LATE THROW INTO A NAMED EARLY REFUSAL, which is
  worth more than the refusal itself.** Before the check, the CURRENT
  `tiers.mjs` against 283 died 200 lines into the measurement with
  `TypeError: threatOfWave is not a function` -- a function build 301 added,
  eighteen builds after 283. So the current probe cannot run against that
  tree at all, and it says so loudly by luck; the purse fault in the same run
  would have been silent. **A probe reaching back far enough is reading an
  API as well as a tree**, and the loud failure and the silent one live one
  line apart.
- **A THIRD HOLE, RECORDED AT 346 AND CLOSED AT 347: the probes import the
  LOCAL tree while driving the SERVED game.** `tiers.mjs:65-66` imports `WAVES`,
  `ENEMY_TYPES`, `CFG`, `kB`, `fmtBytes`, `NODES` and `priceOf` from
  `../src/`, so under `--url` the price table, the wave roster, the type
  roster and every config number are HEAD's and only the GAME is the old
  build. For a differential across a PRICE or CURRENCY change -- which is
  exactly what phase 5 was -- both sides therefore share one price table.
  That is a third reason the 287 reading could not have been about 283's
  economy. **CLOSED AT BUILD 347, and not the way this paragraph guessed**:
  fetching the served module graph would mean serialising `priceOf` across the
  boundary, and the true statement is narrower -- such a probe may only be
  aimed at a tree that IS its own checkout, so it refuses a mismatch and names
  the worktree remedy. It also reaches only TWO probes, not five: `fight.mjs`,
  `dps.mjs`, `variance.mjs` and `ladder-probe.mjs` import nothing from
  `../src/`, which is what makes build 345's re-take sound.
- **THE DETECTION IS DERIVED AND THE LIST IS DECLARED, because `w` names two
  different objects in one file.** Harvesting the fields from the probe's own
  source was tried first and cannot work: `w.requestAnimationFrame` is the
  WINDOW and `w.bytes` is the WORLD, in the same file, so a harvest collects
  both and would refuse for fields the world was never meant to have. So each
  probe DECLARES what its numbers depend on -- a claim, which this repo
  accepts when stated at the site -- and what is derived is WHO has to make
  it: any probe that reads the purse AND can be aimed at a caller-chosen
  base. `check-build` holds that, with five revert proofs plus the vacuity
  arm.
- **...AND THE FIRST DETECTION NAMED A SYMPTOM, WHICH ITS OWN FIRST RUN
  SHOWED.** It asked only "does this read the purse" and failed the build for
  `regress.mjs` and `ladder-probe.mjs`. Both DO read it -- and both can be
  aimed elsewhere too (`--port`, and a positional `baseUrl` at `argv[5]`), so
  they share the exposure and are WIRED rather than excused, which took the
  guard from four probes to six. What is not exposed is a purse-reading probe
  against a hard-coded server, and there is none. **A guard's detection has
  to name the exposure, not a symptom of it** -- the exposure is being
  aimable at a tree that might not have the field.
- **`contact.mjs` IS OUT BY A FACT ABOUT ITSELF RATHER THAN BY AN
  EXEMPTION.** It takes `--url` and touches no currency at all, so the
  conjunction excludes it with nothing written down -- and build 345's
  opposite ruling still holds for the `--expect` check, which it DOES get,
  because there the detection is `flag('url'` and over-coverage is cheap.
  Two guards, two detections, each matching its own exposure.
- **BUILD 345'S OWN GUARD FIRED WITH A FALSE MESSAGE, AND THAT IS THE COST OF
  PINNING A LINE INSTEAD OF A FACT.** It tested
  `/import \{ checkServed \} from '\.\/served\.mjs'/` -- the whole statement
  -- so adding `requireWorld` to the same import failed the build for four
  probes with "does not import checkServed" **while they did**. Loosened to
  match inside the braces. A guard that fires for the wrong reason is worse
  than one that does not fire: the message sends the next reader at the wrong
  file.
- **AND MY OWN INSERTION PUT THE NEW GUARD INSIDE A LOOP BODY THAT NEVER
  RUNS, caught because the REVERT PROOF'S BASELINE printed nothing.** The
  anchor string `skip a flag's value`);` occurs twice -- once in a
  `posBad.push(...)` inside the `for`, once in the block's closing
  `console.log` -- and the first match is the one inside the loop. So fifty-nine
  lines of guard sat in an `else if` arm that only runs when a probe already
  fails, `node --check` passed, `check-build` exited 0, and all five revert
  proofs read EMPTY. **A revert proof whose baseline prints nothing has not
  measured the revert; it has measured a guard that is not running** -- so
  print the baseline first and read it, which is the same rule as a zero from
  an instrument never shown to read a one.

- **BUILD 347 CLOSES THE THIRD HOLE, AND THE FIRST THING IT ESTABLISHED IS
  THAT BUILD 345'S RE-TAKE IS SOUND.** 346 recorded that the probes import
  their constants from the LOCAL `src/` while driving the SERVED game, and
  left it open. The obvious worry was that it reached `fight.mjs` and
  therefore the eight-build hash re-take; measured by grep, **`fight.mjs`
  imports nothing from `../src/` at all** -- its entire import list is
  `node:module` and `./served.mjs`, and every figure it prints is read out of
  the page. So are `dps.mjs`, `variance.mjs` and `ladder-probe.mjs`. The
  exposure is exactly TWO probes: `tiers.mjs` (`WAVES`, `ENEMY_TYPES`, `CFG`,
  `kB`, `fmtBytes`, `fmtRate`, `NODES`, `priceOf`) and `contact.mjs`
  (`NODES`). **Check the blast radius before designing the fix** -- the fix
  for two probes is not the fix for six, and the answer here turned out to be
  a dozen lines rather than a refactor.
- **THE FIX IS A REFUSAL RATHER THAN A REFACTOR, AND THE REFUSAL TEACHES THE
  METHOD.** Reading the constants out of the page instead would mean
  serialising `priceOf` -- a FUNCTION -- across the boundary, and would leave
  the probe silently mixing two trees for every symbol somebody forgot to
  move. What is actually true is narrower and checkable: for such a probe a
  differential is sound only when the CHECKOUT IS the served commit, which
  means running it FROM the worktree (`cd <worktree>/scripts && node
  tiers.mjs --url ...`). That is exactly how build 346's phase-5
  reproduction was taken, and why that reproduction was valid where the
  original was not. `requireSameTree(served, BUILD, who)` compares the served
  BUILD against the probe's own imported one and refuses a mismatch, reusing
  the `served` object `checkServed` already fetched rather than asking twice.
- **AND THE ASYMMETRY IS THE POINT, WHICH IS WHY IT IS DERIVED FROM THE
  IMPORTS.** The four self-contained probes deliberately do NOT get the
  refusal -- aiming them at any tree is sound, and saying so is what makes
  345's re-take a fact rather than luck. `check-build` derives both families
  from `from '../src/` crossed with aimability and PRINTS BOTH, so a probe
  that grows its first local import inherits the refusal and one that sheds
  its last is let out. Four revert proofs plus the vacuity arm, whose message
  says what to do if it ever fires honestly: if every probe really has become
  self-contained, delete the guard rather than keep it green.
- **THE THREE GUARDS NOW ANSWER THREE DIFFERENT QUESTIONS AND NONE OF THEM
  SUBSTITUTES FOR ANOTHER.** `--expect` (345): which tree was served.
  `requireWorld` (346): whether the probe can READ that tree. `requireSameTree`
  (347): whose CONSTANTS the probe is printing. Phase 5's reading was wrong on
  all three counts at once -- stale serve, a purse it could not read, and a
  price table from the other tree -- which is why one guard was never going to
  be enough and why each has its own detection: `flag('url'` for the first,
  purse-and-aimable for the second, local-import-and-aimable for the third.
  **A composite failure needs a guard per component**; a single check placed
  anywhere in that chain would have passed the other two faults through.
- **A READOUT PREFIX IS A NAMESPACE, AND MINE COLLIDED ON ITS FIRST RUN.**
  The new block printed under `tree:` -- which `check-build` has already used
  for the buyable-coverage line ("tree places all 95 buyable things exactly
  once") since long before. Two unrelated readouts sharing a prefix in a
  thirty-line block is how build 329's broadphase cell got skim-read past for
  dozens of builds. Renamed to `constants:`. Cheap to fix and worth fixing at
  the moment it appears, because the next reader greps the prefix.
- **AND `contact.mjs` ALREADY IMPORTED `BUILD` DYNAMICALLY, 250 LINES BELOW
  WHERE THE REFUSAL NEEDED IT.** `const { BUILD } = await import('../src/
  config.js')` sat just above the render, so a static import at the top was a
  redeclaration and `node --check` caught it immediately. The dynamic one is
  gone and the static one serves both readers -- which is strictly better,
  because a value the probe refuses on and a value it PRINTS in the sheet
  ought to be the same read. Two reads of one constant is the shape that lets
  a heading disagree with a guard.

- **BUILD 348 IS THE AUDIT BUILD 323 ASKED FOR, RUN OFF DUMPS ALREADY IN
  HAND, AND ITS FIRST RESULT IS REASSURING.** 323 recorded "147 of 706 arms
  move... the next audit starts from the dumps rather than from a blind
  re-run". Builds 345, 346 and 347 each shipped a green `--json` dump, and
  all three changed **nothing in `src/` but the BUILD literal** -- so the
  three together are a "nothing changed" population across three BUILDS
  rather than three runs of one, which is stronger: it also measures whether
  the script-side changes reached the game. They did not. **599 of 760 arms
  are numerically identical across all three**, 3 change the SHAPE of their
  message and 158 have figures that move, with 0 failures in each run. That
  is the claim builds 346 and 347 each made from inspection ("no src change
  but the build literal"), measured.
- **AND THE THREE SHAPE-CHANGERS ARE ALL BENIGN AND ALL SELF-EXPLAINING**,
  which is worth knowing because a shape change is the one thing a numeric
  diff cannot rank: the fuse arm's retry list (`holds 5, 3.1, 40` against
  `holds 38.5`), the LATCH ring arm's ring list (7 latches against **14**,
  which is SWARM doubling the count and visible in its own message), and the
  hop arm printing `dy 50` against `dy 50/50.01`. None is a defect and each
  says why in the line itself.
- **THE FUSE ARM'S RETRY BUDGET WAS PRICED OFF THREE TRIALS AND IS
  MEASURABLY THIN, WHICH THE DUMPS SETTLE FOR FREE.** Build 338 set
  `TRIES = 3` from p = 2/3 and predicted "about a 4% chance of a spurious
  red". Pooling its three trials (25.9 / 3.7 / 23.9) with the six attempts
  the three dumps print (5, 3.1, 40 | 38.5 | 2.5, 18.2) gives **9 attempts,
  5 clearing the `held > 10` floor, p = 0.556** -- so three attempts are
  **8.8%** spurious, not 4%, and this session's three runs needed 3, 1 and 2
  attempts. `TRIES = 5` is **1.7%** for 0.127 of an extra window on average
  (1.769 against 1.642); six would be 0.8% and is not worth the wall clock.
  **Confirmed on this build's own run**, which is the tenth attempt in the
  pool: it cleared first time at 47.2s, taking the pool to 6 of 10 and
  p = 0.60, and it printed "attempt 1 of 5" -- so the denominator really is
  read off `TRIES` rather than from the literal it replaced.
  **A retry budget is a fitted margin like any other**, and the figures to
  fit it to were sitting in three dumps nobody had subtracted.
- **...AND 338'S OWN RE-SITE CRITERION IS THE RIGHT SHAPE WITH THE WRONG
  NUMBER.** It says to re-site if the case "ever starts needing all three
  every run" -- at p = 0.556 a run legitimately needs all three 8.8% of the
  time, so spending the whole budget once is not a signal at all. The signal
  is the FLOOR'S OWN CLEAR RATE falling; the budget is downstream of it.
- **AND THE FLOOR WAS WRITTEN TWICE, WHICH WOULD HAVE FAILED IN A CONFUSING
  DIRECTION.** The retry loop broke on `held > 10` and the assertion tested
  `r.fuseOn.held > 10` -- two copies, so tuning one leaves the retry
  stopping on a hold the check then rejects, with the remaining budget
  UNSPENT and the message reporting "attempt 1 of 5" for a scenario that had
  four more goes. One `HOLD_FLOOR`, read by both. The printed denominator was
  the same shape in three characters (`of 3` beside a `TRIES` it could not
  see) and is `r.fuseMax` now.
- **RECORDED AND DELIBERATELY NOT RE-TUNED: the release-gate FIELD arm's
  separation is proportional to how long the release was held, and its own
  message has been printing both numbers all along.** Across four dumps:
  hold **171.5s -> separation 0.508**, **117.8s -> 0.767**, **81.6s -> 0.807**,
  **53.7s -> 0.855** -- monotone inverse on all FOUR, against a 0.95 ceiling,
  so the worst draw has **10% of headroom** and the trend points AT the
  ceiling rather than away from it. Pooled with build 322's three (0.530,
  0.585, 0.626) that is seven readings spanning 0.508 to 0.855.
  **And its liveness floor cannot protect it, which is the sharp end.** The
  arm accepts any `held > 3` -- three seconds -- while the four observed
  per-run holds are 53.7 to 171.5s, so the floor sits eighteen times below the
  smallest hold ever measured and has never once bound. The regime those four
  points extrapolate into is exactly the one it admits. Its sibling the fuse
  arm floors the same quantity at 10 AND retries for it; this one floors at 3
  and pools three runs, which averages the regime in rather than refusing it.
  This is the shape build
  305 fixed for the FUSE arm ("when a reading has a ceiling, divide by the
  thing that drives it") arriving on the field arm, and nothing in this file
  had connected the two numbers for it.
  Not acted on, and each candidate refused for a stated reason: **tightening**
  is refused by build 320's ruling that headroom beats sensitivity on the one
  case with the worst history; **pinning `runSeed`** is refused by build 338's
  ruling that choosing a roll is what six builds of re-siting were made of;
  **pooling more than three runs an arm** costs a 240-second window each and
  four builds of three-run pools already span 0.508 to 0.855, so it would not
  collapse. What this note buys is the next failure's diagnosis and the fix to
  reach for: when it draws 0.96, read the HOLD in the same line before
  touching the rung, and the candidate is the SIBLING'S shape -- a floor that
  makes a four-second hold inadmissible rather than a ceiling loosened to
  survive one. Left for its own build, because changing what this case admits
  is a change to what it measures, and four points with 10% of headroom is a
  reason to write the mechanism down rather than to re-site the case a seventh
  time in the same session that found it.
- **AND THE RANKING METHOD HAS TWO FAULTS WORTH NOT REPEATING, both found by
  reading its output rather than by it failing.** Pairing a moving figure
  against any `x.y` literal in the same message ranks **measured values
  against their own printed copies** -- eighteen arms at "0.0 spread-widths",
  every one of them a figure beside itself. The fix is in the data and needs
  no regex opinion: across runs of an unchanged tree a position that HOLDS
  STILL is a candidate constant and one that MOVES is a measurement, so pair
  movers against stills. And **a comma thousands separator breaks numeric
  tokenising** -- `20,075` reads as `20` and `075`, which is how "SPORE
  clears 20,075 of band-5 health" was ranked as an 18..22 range against a
  held 20. Even corrected the ranking is a READING AID: build 320 said "rank
  with the script, decide with your eyes", and of the twenty it put at the top
  here, two were real.

- **BUILD 349 TAKES THE CEILINGS OFF THE RELEASE-GATE FIELD ARM, BECAUSE A
  SEPARATION PROPORTIONAL TO THE HOLD IS A BOUND ON HOW MUCH TROUBLE THE RUN
  HAPPENED TO BE IN.** Build 348's audit found both of that arm's channels
  tracking the hold monotonically across four consecutive dumps -- held
  171.5s -> separation 0.508 and pinned ratio 0.06, 117.8 -> 0.767 / 0.45,
  81.6 -> 0.807 / 0.50, 53.7 -> 0.855 / 0.80 -- against ceilings of 0.95 and
  0.85. So the shortest hold left 10% of headroom on the mean and **six per
  cent on the pinned share**, with the trend pointing AT both rather than away
  from them. The reading is a product of how hard the gate worked and how long
  it worked for, and only the second term was ever in the bound. Loosening a
  number like that buys one build.
- **MEASURED AT BOTH ENDS, WHICH NEITHER CEILING EVER WAS -- AND THE TWO WAYS
  OF BREAKING IT SEPARATE ON TWO DIFFERENT CONJUNCTS.** Three populations,
  240s runs at rung 32, pooled in threes the way the arm pools:

  | | duty | (1 - sep) / duty | (1 - pin) / duty |
  |---|---|---|---|
  | working (4 dumps + 2 fresh pools) | 0.22-0.71 | 0.475 to 0.745 | 0.893 to 1.471 |
  | the hold recorded, the wave let out anyway | 0.58-0.64 | 0.013 to 0.045 | 0.059 to 0.170 |
  | the `return` deleted | **0.000** | held **0.0s in 6 of 6** | -- |

  Delete the gate's refusal and `held` is ZERO, so the LIVENESS floor catches
  it. Record the hold and release anyway and the duty is as large as ever
  while the effect is gone, so the OUTCOME floor catches it. Neither conjunct
  can see the other's failure, which is why the arm needs both -- and why a
  single ceiling on the separation was covering half the ground it looked like
  it covered.
- **THE FLOOR BUILD 348 CALLED "NEVER BOUND" WAS THE STRONG DISCRIMINATOR ALL
  ALONG, AND NEVER-BOUND IS WHAT A THREE-ORDER MARGIN LOOKS LIKE.** It read
  `held > 3` against working holds of 53.7 to 171.5 -- eighteen times below
  the smallest ever measured -- and 348's note treated that as the fault. It
  is the fact: the broken population reads 0.0, so the floor separates the two
  by three orders of magnitude and is the one conjunct in the arm that could
  never be a draw. It is 20s now, which is 2.7x under the worst working pool
  and still unreachable from the broken one. **A conjunct that has never bound
  is either vacuous or enormous, and which one it is comes off the broken
  end** -- not off the working distribution, which is all build 348 had.
- **AND BOTH CANDIDATE FIXES I HAD IN HAND WERE REFUTED BY MEASURING THEM,
  WHICH IS THE WHOLE VALUE OF HAVING WRITTEN THEM DOWN.** Build 348
  recommended the SIBLING'S shape -- the fuse arm's floor-and-retry, "a floor
  that makes a four-second hold inadmissible rather than a ceiling loosened to
  survive one". Applied here it selects on effect size: all four observed holds
  are runs where the gate DID act, so a floor high enough to help (about 60s)
  rejects the 53.7s run, which is the one with the worst separation. That is
  choosing the roll that makes the case pass, which build 338 refused by name.
  And my own answer -- build 305's rule, divide by the thing that drives it,
  `(1 - sep) / duty` -- is build 320's exploding relative-spread fault in a
  second costume: the denominator legitimately reaches zero on the build the
  bound exists to catch, and the gateless population prints **4,000,000** for
  a quantity whose working range is 0.475 to 0.745. The product form
  `1 - sep >= 0.2 * duty` is the same claim and is finite everywhere.
  **A quotient and a product are the same rule only where the denominator
  cannot vanish, and a guard's denominator vanishes exactly on the broken
  build.**
- **...AND THE PRODUCT SUBSUMES THE CEILINGS RATHER THAN DROPPING THEM.** At
  the observed duties it implies a separation under 0.88 at duty 0.62 and
  under 0.96 at duty 0.22 -- so it sits about where the old 0.95 was exactly
  where that ceiling was thinnest, and much tighter wherever the gate did
  more. A ceiling that tightens with the evidence is not one somebody has to
  keep loosening. The raw ratios are still PRINTED, so build 348's dump
  subtraction keeps working across the change.
- **A WAVE MAY BE BEGUN FROM ONE PLACE AND THAT PLACE IS BEHIND THE GATE, AND
  THE GUARD FOR IT BELONGS IN `check-build` RATHER THAN IN A 240-SECOND ARM.**
  The gate is a refusal inside `Director.update`: while the field is thicker
  than the last wave was required to leave it, `holdFor` accumulates and the
  function RETURNS, so `begin` is never reached. The thing that quietly undoes
  that is a SECOND DOOR, which is this repo's most expensive recurring shape
  (`setTier` stepping past the gate `climbTo` had just answered,
  `Director.restore` writing `tier` and `peak` by hand, build 272's era
  ceiling walking over itself) -- and **the runtime arm cannot see one**: a
  second door would weaken the field separation slightly, inside the spread
  the arm already tolerates. So it is static, it costs a millisecond instead
  of six 240-second windows, and it pins the gate's SHAPE as well as the call
  count: the `return` is the refusal, and `hostileCount` is deliberately not
  `standing` (build 291's rule that a wave ENDS on its own bodies and the next
  one WAITS on the field). Four revert proofs plus the vacuity arm, whose
  baseline was printed first for build 346's reason.
  Worth knowing it is a TAUTOLOGY today -- `begin` has exactly one caller and
  it is the gate -- and that is the point: it is a guard against the second
  door, not a measurement, and it says so.
- **THE HARNESS FOR A REWRITTEN ASSERTION IS THE ASSERTION ITSELF, SLICED OUT
  OF THE FILE.** There is no way to run one case of this suite, so a rewritten
  expression is normally read twice and then waited on for thirteen minutes --
  and a hand-copied harness is a copy that can disagree with what ships, which
  is the `HERO_GAITS`/`HERO_COL` fault and the one I wrote into my own case at
  build 338. The check's text and the three derived figures are `indexOf`-cut
  out of `regress.mjs` and run through `new Function` against the ten measured
  pools, with `check` a spy. Six working pools PASS, four broken FAIL, and the
  message is printed so the FAIL line can be read before anything is pushed.
  Cost: seconds, and it is what caught the printed quotient reading
  "4,000,000 a unit of duty" on the exact population the arm is meant to fail.
- **AND THE PER-RUN HOLDS ARE PRINTED NOW, WHICH IS WHERE THE SPREAD WAS
  HIDING.** This build's own green run reads `held 102.8s a run [179.8 86.2
  42.3]` -- a **4.3x spread inside one suite run**, on the quantity the whole
  arm turns out to be proportional to. Build 348's audit had one (hold,
  separation) pair a run out of an arm that already ran three, so the four
  points it could subtract cost four builds to accumulate; the arm printed
  three a run all along and averaged them away. That reading is the seventh
  working pool and it sits at the top of the range: duty 0.428, thinned 0.319
  = **0.745 a unit of duty** against the 0.2 floor, unpinned 0.541 = 1.264
  against 0.35. **If a case pools N runs, print the N figures** -- the pooled
  one is the assertion and the N are the next reader's population.
- **AND MY FIRST BROKEN SIMULATION WAS UNFAITHFUL AND TURNED OUT TO BE THE
  MORE USEFUL OF THE TWO.** To break the gate from a probe it forces
  `d.begin(w)` on the frames the gate would have held -- and the real path
  zeroes `holdFor` on the line ABOVE `begin`, which the patch does not, so the
  hold accumulated monotonically and the duty read 0.75 instead of the ~0 a
  real build with the `return` deleted gives. That is the wrong simulation of
  the fault I meant and the RIGHT simulation of a different one, and it is the
  population that prices the outcome floor: without it the only broken reading
  is duty 0, which the liveness floor already catches and which says nothing
  about what the hold has to buy. Both are measured now (`broken` and
  `broken0` in the probe). **When a simulated fault does not behave as
  predicted, find out which fault you actually built before discarding it.**
- **Not run and why: the ORDINAL hash.** This build changes
  `scripts/regress.mjs`, `scripts/check-build.mjs` and the BUILD literal, and
  nothing executable in `src/` -- so there is no change for it to measure, the
  way builds 345 to 348 had none. What had something to say is the suite and
  the ten-population harness above, and both are green.

- **BUILD 350 CLOSES `audit-266-open.md` ITEM 5 BY MEASURING IT AND REFUSING
  IT, AND THE GENERAL RULE IS THAT A SHARE IS NOT A COST.** That item has read
  as a live fault for eighty-four builds: "HAIL's particle spend is ~4.7x what
  it was and none of it scales with `fx.quality`. On the device the governor
  exists for, one press asks for about 60% of the reduced budget." The
  unscaledness is real. The figure and the consequence are not.
  **The ask is 24%, not 60%** -- 66 particles of the 279 a 0.45 governor
  leaves, or 31-33% counting AIRBURST's wall. And it is FOUR presses rather
  than one, which the item did not say: PULSE 6.6% -> 14.7%, HAIL 10.6% ->
  23.7%, STASIS 3.5% -> 7.9%, PRISM 0.5% -> 1.1%, each doubling its share as
  the governor closes, against `explode(r40)`'s 8.9% -> 8.6%. The other four
  abilities spend no particles at all -- they spend RINGS, which are a
  separate pool and not budget-gated (build 334).
  **What refuses the fix is the other side of the ledger, which nobody had
  measured: what the FIELD leaves.** A real band-5 wave at rung 32, fully
  bought, 2,700 sampled frames at each quality: `budgetLeft` has a p1 of 423
  at quality 1 and **120** at the floor, and the share of frames leaving less
  than even HAIL's 66 is **0.0% and 0.04%** -- one frame of 2,700. The press
  lands 66 of 66 and starves no frame after it. So scaling the four would have
  thinned the two loudest presses in the game -- PULSE is `essential`, so
  every run has it -- to buy a per-frame saving that no frame needed. That is
  the ruling GYRE (331), KITE's bolt (336) and three of MIRE's clauses (339)
  already carry, arriving for the first time on a PERFORMANCE claim rather
  than a gameplay one.
  **The rule to take: a source taking twice the share of a budget is a fault
  only if something else wanted that budget.** A share is one of two numbers
  and it is the cheap one to measure; the headroom the rest of the frame
  leaves is the one that decides. Ask for it before fixing a share.
- **AND THE CONVENTION STOPPED WHERE IT DID FOR A REASON THE FILE MAKES
  VISIBLE: `abilities.js` DOES NOT IMPORT `fx`.** Scaling by quality is done
  in exactly three files and all three import `fx` directly -- `fx.js` (`explode`,
  and the spawner at `:474`), `patch.js` (twice, with a `Math.max(0.45, q)`
  floor) and `shooter.js:2205` (`Math.max(3, round(base * size * q))`).
  `abilities.js` imports `{ spark, dot, ring, ripple, shake, flash, Shock }`
  and not the object, so the whole ability bar could not have scaled without a
  line nobody had reason to add. **A convention that stops at a file boundary
  is worth checking against that file's imports before calling it an
  oversight** -- and it is why the revert proof below was a ReferenceError
  first.
- **THE BOUND IS ON THE PEAK AND NOT THE CAST, BECAUSE THE PRESS IS NOT THE
  WHOLE SPEND.** With AIRBURST owned, `endProjectile` bursts every pellet on
  EXPIRY as well as on impact, so a dot and two sparks a pellet arrive about a
  tenth of a second after the cast -- 66 becomes a concurrent peak of 85 to 93,
  and it is a DRAW rather than a constant because the lives are jittered
  (`life * rand(0.88, 1)`, build 335's fix for the wall arriving in one tick).
  Measured four times: 85, 86, 91, 93. So the arm bounds the peak at half the
  reduced budget (139.5), which sits between the worst press and the 120 of p1
  headroom the field actually leaves -- a bound derived from two measurements
  rather than fitted to one.
- **THE FLOOR IS DRIVEN THROUGH `Game.trackFrame` AND NOT WRITTEN DOWN.**
  `0.45` is a literal in that method and the arm's whole subject is the budget
  at that quality, so restating it would be build 329's copy going stale. Sixty
  late frames at a time with `qualityCooldown` cleared walks quality 1 -> 0.7
  -> 0.45, which is also build 198's rule that a governor case has to be
  synthetic: a headless software rasteriser produces none of the six timings
  that matter. **Proved able to fail by raising the floor past 1** so quality
  can never drop -- the arm then reads `floor 1, budget 620` and fails its
  vacuity clause, which is what stops the whole case passing on a build where
  the governor never moves.
- **TWO INSTRUMENT FAULTS, BOTH MINE, BOTH THE SAME SHAPE AS THE FAULTS THIS
  FILE ALREADY RECORDS.** `explode(x, y, r, color, glow, power)` takes the
  COLOUR fourth, and the control run passed `explode(400, 600, 40, 1,
  '#ffffff')` -- so `color` was `1`, `rgba` went into `hex.slice is not a
  function`, and the page threw from inside the rAF loop. That is build 341's
  `drawGlow` argument order verbatim, in a probe rather than in the game, and
  it read as a live bug for the ten minutes it took to isolate: **check the
  signature before believing a throw you caused.** The COUNTS were unaffected
  (they do not depend on colour), so the control table stands. And the revert
  proof that scales a press by `fx.quality` threw a ReferenceError until the
  import went in, which is the finding above arriving as a broken probe.
- **THE SEED HAD TO BE PINNED OR THE TWO QUALITIES MEASURED DIFFERENT
  FIELDS.** The first field reading compared quality 1 against 0.45 and the
  two arms had **55 bodies and 11** -- because each arm calls `restart()`,
  which re-rolls `world.runSeed`, and `traitsFor` is seeded off it, so one arm
  drew SWARM and the other did not. A budget comparison against a field a
  fifth the size is not a budget comparison. Pinned, both arms read 51-58
  bodies and the answer inverted in the useful direction: the field at the
  FLOOR peaks at **277 of a 279 budget** on its own, where at quality 1 it
  peaks at 282 of 620. That is the state the governor is actually about -- a
  full field on a reduced budget -- and the unpinned pair never produced it.
  Build 336's rule from the other side: pinning a seed is choosing a trait
  roll, so a probe that pins one owes the reader the roll it drew, and one
  that does not owes the reader the body counts.
- **AND THE CASE LEFT THE DIRECTOR STUBBED, WHICH IS THIS FILE'S OWN RULE
  BROKEN FOR THE FOURTH TIME, BY THE BUILD THAT QUOTES IT.** The first suite
  run was **758 of 762**, and the four reds were the wave-figure family four
  hundred lines downstream: "opened at 0%, highest 0% across an arrival that
  put **0 bodies** on the field" against build 349's 8, and "no splitter wave
  found". The case pins `w.director.update = () => {}` and `w.spawnLock = 1e9`
  so nothing releases into its particle count, restored `fx.quality` and
  `g.resize()` (build 198's rule, which I did follow) and put neither of the
  other two back -- and `reset()` keeps the same Director object, so the stub
  outlived every `restart()` after it. CLAUDE.md records this in THREE places,
  one of them as an instruction to new cases in as many words.
  **Diagnosing a fault does not inoculate you against writing it** -- which is
  the note build 338 wrote about a hand-kept list it duplicated in the same
  build that fixed one, and build 343's fourth self-asserting detail string.
  The durable half is that the restore is now ASSERTED rather than performed:
  `putBack` reads that `update` is a function AND not an own property of the
  director, so a future `= undefined` (which shadows the prototype's method
  and starves the suite exactly as a stub does) fails the case that left it.
  Verified by slicing the shipped `page.evaluate` body out of `regress.mjs`
  and driving a real wave after it -- 47 bodies and 32 released, against 0
  before the fix -- which is build 349's harness idiom reused for a different
  question.
- **AND THEN THE CASE FAILED WITH EVERY PRINTED FIGURE CORRECT, WHICH NAMES
  THE ONE CONJUNCT THE MESSAGE DID NOT CARRY.** Second run, 761 of 762: floor
  0.45, pool 620 -> 279, 4 of 8 spenders, all 4 unscaled, 0 clipped, the
  director put back -- and red. The failing clause was `restored === 1`, the
  only one whose figure the detail string did not print. It asserts a VALUE
  where it means a RESTORATION: standalone `wasQ` is 1 because nothing has
  driven the governor, and in the suite fourteen thousand lines of cases run
  first, so it read 0.7 and the arm rejected a perfect restore. `restored ===
  wasQ`, with both printed. **A detail string is a declaration (builds 319,
  323, 324, 343) and this is the same rule one step on: a conjunct whose
  figure the message does not carry cannot be diagnosed from its own FAIL
  line.** The tell was that every number in the line was right -- which is
  not a confusing failure, it is a POINTER, and it should be read as one:
  when a FAIL prints nothing wrong, the fault is in what it does not print.
- **AND ONE PRE-EXISTING MARGIN DREW BADLY, WITH THE POPULATION IN HAND SO THE
  NEXT SESSION NEED NOT RE-MEASURE IT.** "Every type in the wave table is met
  in over 50% of runs that climb" read **LOOM 42%** on the third run of this
  build. It is a sampling draw and not this build's: the arm is at
  `regress.mjs:1188`, THIRTEEN THOUSAND LINES BEFORE the only code this build
  inserts, and the same tree read LOOM at 92% on both of the other two runs.
  Across seven dumps the figure is **75, 83, 83, 92, 92, 92 and then 42**
  against a floor of 50 -- so six of seven sit 1.5x to 1.8x clear and the
  seventh is under.
  **The parameter is the SAMPLE SIZE and not the floor**, which is build 348's
  ruling: the arm plays 12 runs of 14 wave loads at one rung per band, and
  LOOM is in exactly ONE band-5 wave (build 332), so 42% is 5 of 12 rather
  than a behaviour. Moving the floor down would be fitting a number to the
  worst draw; raising the loads per band is what tightens the distribution,
  and it costs suite seconds. Left for its own build with the seven readings
  written down, which is the whole point of build 320's dump.
