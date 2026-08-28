# The three clocks — v3

Wave pacing, damage pacing, energy pacing. v1 was the proposal; the six open
questions came back answered; v2 folded them in; this is v3, after a review
pass over v2 found five holes. Still a plan — nothing implemented.

## Decisions now locked

| # | question | decision |
|---|---|---|
| 1 | tier control | the FIELD chip becomes the tier chip, in the top bar |
| 2 | step-back | announced: `THE FIELD RELENTS · TIER n` |
| 3 | fail thresholds | chosen below; tiers.mjs calibrates them |
| 4 | RoF nerf | **B1 + B3**: FEED 2 levels → 1, tapFade 0.6 → 0.5 |
| 5 | progression clock | **energy earned** gates unlocks; apertures stay energy purchases; the 500-release arc dies; the ladder is unbounded |
| 6 | save shape | four new fields, chosen below |

## What is true today (measured, build 176)

| fact | number |
|---|---|
| BOLT stock / fully fed | 3.4 → **18.2 rounds/s (5.4×)** |
| tree, bought out | 119,451 energy · 84 buyables |
| income, assist floor | ~30–60 energy/min early |
| wave order | shuffled; only the swell (1→2.4 over 320 kills) moves difficulty |
| type unlocks today | kill counts: 18, 45, 85, 125, 205, 245, 285, 330, 380 |
| apertures today | already pure energy purchases — no kill gate exists |
| overwhelm signals | director.wait (patience 26s) and contact-seconds, both already tracked per frame |
| lifetime earnings | **not tracked** — bank() feeds the spendable purse only |

---

## Plan A — waves: the ladder

A tier is a recipe: a band of the 25 authored wave shapes, plus multipliers.

```
tier n:
  shapes      band(n) ∩ unlocked, falling down-band when the economy
              has not met a band's types yet (see the unlock clock, C)
              band 1: mote/needle/drift    band 2: +lurcher/splitter
              band 3: +bloom/plate/glut    band 4: +warden/herald/scion
              band 5: +tow/bulwark
  population  authored × (1 + 0.10·n)   — replaces the swell entirely
  health      type hp × (1 + 0.06·n)
  bounty      energy × (1 + 0.15·n)
```

Unbounded n; the field cap (57) naturally stops population growing past
roughly authored×3, after which health and bounty carry the climb alone —
which is the wall forming exactly where plan B wants it.

**The chip.** `TIER 7 ▸` where FIELD sits today. One tap opens a one-row
control: `‹ back · HOLD · auto ›`. Auto-advance on a cleanly cleared wave is
the default. *(Review fix: `#phaseTag` is hidden under 431px today — the tier
chip is a control, not a readout, and must survive every width. That CSS rule
dies with the phase tag.)*

**Fail score** — chosen (question 3), calibration owned by tiers.mjs:

```
failed(wave) =
     contact-seconds during it ≥ 6
  or director.wait reached patience (26s)
  or alive-at-end ≥ 60% of what it asked
clean(wave) = none of the three
```

Two consecutive fails → step back one tier, announced. One clean wave at the
lower tier re-arms auto-advance. **Step-back fires under HOLD too** — the pin
holds the climb, not the relief; a player who wants to drown can climb right
back, but the game never leaves someone pinned above their head. (Flagged
reviewable — say the word if HOLD should mean "let me drown".)

**Untouched:** the opening eight teach-waves (tier 0), boss behaviour, codex.
*(Review fix: the story beats stay on kills — they are narrative cadence, not
difficulty, and moving them to energy would make the opening lines arrive at
the pace of the player's purse.)*

## Plan B — damage pacing

**The nerf (locked):** FEED loses its second level (max cadence −20%, every
round, tree drops to 83 buyables) and tapFade 0.6 → 0.5 (BOLT's echoes fade
harder). Max BOLT lands at **~14.6 rounds/s, ~3.3× stock in damage** from
5.4× in rounds today.

**The bands:** TTK for a body from tier n's own band, at tier n's expected
spend (plan C's table), held in **2–4s through ~tier 10**, passing 6s by
~tier 14 — the wall. The 0.06 hp slope is the tuning knob;
`scripts/tiers.mjs` (fourth sibling of fight/dps/variance) drives a scripted
loadout per tier and prints the TTK table. It is the ladder's regression
instrument afterwards, the way ORDINAL's hash is the engine's.

## Plan C — energy: income, and now the unlock clock too

**Income:** prices stay; the tier bounty multiplier ×(1+0.15n) is the single
knob. Pushing pays, holding pays steadily, stepping back costs income.

**The unlock clock (decision 5).** A new counter, `world.earned` — lifetime
energy banked this run, only ever up, unaffected by spending. Type unlocks
move from kill counts to earned thresholds:

| type | kills today | earned threshold (opening bid: ×12, rounded) |
|---|---|---|
| lurcher | 18 | 220 |
| splitter | 45 | 550 |
| bloom | 85 | 1,000 |
| plate | 125 | 1,500 |
| warden | 205 | 2,500 |
| scion | 245 | 3,000 |
| herald | 285 | 3,400 |
| glut | 330 | 4,000 |
| tow | 380 | 4,600 |

The ×12 bid comes from measured floor income per kill (~4) tripled for real
play; tiers.mjs calibrates the column against plan C's earned-by-tier table
so band n's types unlock during tiers n−1..n. Apertures need no change — they
are already energy purchases behind nothing but their price and chain.

**Earned-by-tier targets** (unchanged from v1, now doing double duty as the
unlock calibration axis): ~1k by tier 2 · ~5k by tier 5 · ~15k by tier 8 ·
~40k by tier 12 · full tree 119k across many runs.

## The save (decision 6)

Four fields: `tier`, `hold` (0/1), `failStreak`, `earned`. *(Review fix —
the migration matters more than the fields: an old save has no `earned`, and
seeding it at 0 would re-lock TOW for a veteran with 380 kills. On restore,
`earned = max(d.earned ?? 0, kills × 12)` — the same conversion the
thresholds used, so nothing a run has met ever re-locks.)*

## Review findings folded into this version

1. **`earned` did not exist** — v2 assumed a lifetime counter; bank() feeds
   the purse only. New field, saved, migrated from kills.
2. **Old-save re-lock** — the migration seed above.
3. **The tier chip was hidden on small screens** — `#phaseTag{display:none}`
   under 431px dies; a control outranks a readout.
4. **Story beats stayed ambiguous in v2** — resolved: they keep kills.
5. **Band ∩ unlocked can be empty** when a player climbs tiers faster than
   the economy unlocks the band — resolved: fall down-band, never stall the
   director.

## Ripples priced in (implementation notes, not scope creep)

- swell/swellKills, killGoal and releasesLeft die; `endless` becomes the only
  mode; smoke's "past the old count" case and check-build's wave-stats line
  get rewritten.
- Tree count 84 → 83 (B1): the menu-room case's `137` literal and
  check-build's buyable count both move.
- The 26s patience and 57 field cap are now load-bearing pacing constants —
  they get names in CFG rather than staying incidental.
- Implementation order: **A first** (ladder + chip + fail score, swell still
  in place behind it), then tiers.mjs, then B and C tuned against its table,
  then the swell/killGoal demolition last — each step shippable.

---

## What was actually built, and what it measured

### Build 177 — plan A, the ladder

Shipped as specified: bands on all 25 regular waves, tiers with the three
slopes, the fail score off `director.wait` and contact-seconds, two-strike
step-back announced as `THE FIELD RELENTS`, the TIER chip and its row, four
save fields with migration from kills, six regress cases.

One thing the plan got wrong and the screen found: the chip was put inside
`#barChips`, the group that deliberately shrinks to absorb a growing purse, so
a six-figure ENERGY reading pushed the tier control behind the menu button. A
control is fixed furniture. Fixed the same build.

### Build 178 — plan B's B1 and B3

FEED went from two levels to one; `tapFade` from 0.6 to 0.5. `scripts/tiers.mjs`
was written first, so both are measured rather than asserted.

| | build 177 | build 178 |
|---|---|---|
| peak rounds/s | 32.9 | **25.4** (−23%) |
| peak dps | 2,050 | **1,438** (−30%) |
| worst TTK, tiers 9–20 | ~1.0s | **~1.4s** (+40%) |
| tiers 1–5 | unchanged | unchanged |

The last row is the shape a nerf here should have: a turret that has not bought
the taps pays nothing at all.

### ...and the thing the plan had wrong

**The wall plan B is written around did not exist, and could not be built out
of the health slope as it stood.** Measured across tiers 1–20, before and after
the nerf, the slowest member of a band peaked at 3.0s (SPLITTER, tier 3) and
then *fell*, settling at 1.2–1.6s from tier 9 all the way to 20.

Two measurements said why:

1. **The tree plateaus at about tier 8.** dps is 1,430 for 15k spent and still
   1,438 for 116k. Everything past the damage line — every round, mine and
   ability — buys nothing a single body can feel.
2. **`hp: 0.06` was linear and could not catch it.** ×2.2 at tier 20, against a
   damage line worth ×13 by tier 8 and flat after.

### Build 179 — the health slope compounds

`hp` becomes `hpStep ** (n - 1)` with **hpStep 1.17** — 1.12 from build 194,
where the cadence nerfs are paid for; see below. Two changes in one: it
compounds, and it is read off tier 1 rather than off zero, so **tier 1 is the
table exactly as authored** and every rung is a fixed ratio on the one below.

A linear slope steep enough to matter at fourteen would have needed 0.457,
which makes tier 2 nearly twice tier 1 — all early and no late. Compounding
puts the growth where the wall is wanted: ×1.17 at tier 2, ×1.87 at 5, ×4.1 at
10, ×7.7 at 14, ×19.7 at 20.

Measured, tiers 1–20, three runs:

| crossing | plan B wanted | measured |
|---|---|---|
| slowest band member past 2s | — | tier 3 |
| ...past 4s | — | tier 12 |
| ...past 6s | ~tier 14 | **tier 15** |
| ...past 10s | — | tier 19 |
| the band's heaviest wave uncleared in 120s | — | **tier 19** |

The wall is real and it is where it was asked for, within a rung. Tiers 9–11
sit at 3.0–3.4s, inside plan B's 2–4s band; the climb runs 4.4s at 12, 5.5s at
14, 6.3s at 15, 8.3s at 17, and by 19 a full wave cannot be cleared at all.
ORDINAL's hash is unmoved at `117409503` — the boss builds its DIGITs outside
`spawnOne`, so no tier multiplier has ever reached them, which this is the
first change to have actually checked.

**Where it does not hold: tiers 5–8 fall out of the band**, at 1.1–2.7s. That
is not the slope, it is the bands: a new band arrives every two tiers, and a
turret that has just grown meets it before the health has caught up. Levelling
that means re-banding waves or moving `perBand`, not touching this number.

### A correction: the interlock was not what it looked like

Build 179 reported a column called "pay per 1,000 health" falling from 40 to 0
across the ladder, and concluded that bounty had to compound at 1.17 alongside
health. **Both the number and the conclusion were wrong.** `e.bounty` is a
*multiplier* on what a body's wreckage is worth, not the worth itself — the
worth comes from the body's mass through `CFG.energy.perMass`. Summing bounty
produced a column with no units in it.

Measured properly — energy banked plus everything still on the floor, over the
seconds the wave took:

| tier | 1 | 2 | 5 | 8 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|
| energy the wave offers | 41 | 55 | 364 | 539 | 944 | 1,330 | 1,060 | 704 |
| ...per second | 4.3 | 5.7 | 15.9 | 38.7 | 51.5 | **54.0** | 19.6 | 5.9 |

Income *rises twelvefold* to tier 12 and then falls away, and the fall is the
wall rather than the bounty slope: clears take longer and longer, so the same
wave pays the same energy over more seconds. Which is the behaviour you want —
you cannot grind your way through the wall — and it arrives just as the tree
finishes (116,700 is reached at about tier 17).

So **bounty needs no change at all.** Plan C's income half was already true:
pushing pays (4.3/s to 54/s), holding pays steadily, stepping back costs income.

### Build 180 — the unlock clock

`world.earned`: every energy ever banked this run, fed from `bank()`, which is
the single place energy enters a run. It only goes up, and spending never
touches it.

Object types move off kill counts onto it, **and are regrouped by band**, which
the kill counts never were:

| band | wanted at tier | gates |
|---|---|---|
| 2 | 3 | lurcher 400, splitter 800 |
| 3 | 5 | bloom 1,800, prism 2,600, glut 3,400 |
| 4 | 7 | herald 5,500, warden 6,800, scion 8,000 |
| 5 | 9 | bulwark 11,000, tow 14,000 |

HERALD used to open fourth of ten and GLUT ninth — a band-4 type in hand two
bands early, and a band-3 type held back until well past its band.
`check-build.mjs` asserts the band ordering now.

A player who climbs faster than they earn falls down-band, which was already
built in build 177.

**The save is migrated, and `VERSION` is deliberately not bumped.** `readSlot`
refuses any file whose `v` does not match exactly, so a bump would delete every
run currently open — and the migration written to rescue those runs would never
execute, because the file is discarded before the restore sees it. On restore,
`earned = max(d.earned ?? 0, kills × 12)`. The ×12 is not arbitrary: a driven
run banks 12.8 energy a release over its first hundred.

`debugGiveEnergy` credits `earned` too. Without it a tester with 100,000 in the
purse would have opened the whole tree and still be fighting MOTEs.

### Build 181 — the thresholds, re-pitched against play

The first set of thresholds was three times higher, and wrong. They were
calibrated against the earned-by-tier targets above, and those targets were
blessed by `tiers.mjs`'s `pay/s` column — **which is not a run's income.** It
measures a band's heaviest wave, alone, cleared as fast as the turret can, with
energy still lying on the floor counted as collected. It reads 38.7/s at tier 8.

Fifteen minutes of actual play — assists on, PULSE when ready, no debug spawns,
no instant kills — reads about an eighth of that:

| minute | 0.5 | 1 | 2 | 4 | 6 | 10 | 14 |
|---|---|---|---|---|---|---|---|
| earned | 36 | 118 | 326 | 866 | 1,741 | 3,037 | 4,128 |

**4,417 in fifteen minutes, against a curve that assumed 15,000 by tier 8.**
So HERALD landed at nineteen minutes and TOW at forty-seven, and a ladder
sitting at tier 7–8 spent the entire run falling down-band because band 4 was
not open yet. Every gated type past GLUT was unreachable in a quarter of an
hour of play.

Re-pitched against that run:

| band | gates |
|---|---|
| 2 | lurcher 200, splitter 500 |
| 3 | bloom 700, prism 900, glut 1,100 |
| 4 | herald 1,400, warden 1,700, scion 2,000 |
| 5 | bulwark 2,800, tow 3,400 |

Measured again on a fresh run, all ten now arrive inside 12.7 minutes, in band
order: lurcher 79s, splitter 147s, bloom 217s, prism 281s, glut 312s, herald
365s, warden 520s, scion 599s, bulwark 728s, tow 760s. BULWARK and TOW land
within seconds of where the kill counts they replaced used to put them, which
is the check that says the re-pitch is right rather than merely lower.

Every threshold also sits below its own old kill gate × 12, the rate the save
migration converts at, so no run that had a type can lose it. `check-build.mjs`
asserts that now, against a frozen copy of the old kill gates — the only place
they still exist.

**The lesson, again: a measurement is only as good as its instrument.** `pay/s`
answers "which tier pays more", not "what does a run earn", and using it for the
second is what produced a spend curve four times too rich. `tiers.mjs` now says
so at the top of the file and under the column. The TTK table it prints is
priced off that same curve, so every loadout in it is richer than a real run
affords and every TTK is optimistic — **the wall is nearer than build 179's
table says, not further.**

### Not pacing, but found by rechecking this work

**The single-file build had been producing a dead page since build 127.**
`bundle.mjs` turns modules into plain script with one regex per export form it
knows, and it did not know `export { X } from './m.js'` (added to upgrades.js
in build 127) or bare side-effect `import './m.js'` (how the seven boss modules
are pulled in). Either one leaves a module statement in a classic script, which
is a SyntaxError that kills the whole page on load — it boots to the title
screen and nothing else runs. The side-effect imports were missing from the
dependency graph too, so the entry module resolved to `./terminus.js` rather
than `./main.js`.

Nothing caught it because nothing had ever loaded the bundle's output. It does
now: the build parses both forms it writes and fails on any surviving `export`
or `import`. Every artifact published between 127 and 180 was a broken page.

## Build 189 — TRIPLE TAP

Removed. It was DOUBLE TAP's second level and the single largest step in the
damage line: build 177's table had rounds a second going 7.6 to 25.9 across one
tier of income when it landed, which is not a rung, it is a cliff with the rest
of the tree at the bottom.

Measured A/B with `scripts/tiers.mjs --from 1 --to 20 --runs 3`, the same
build either side of the one change:

| | with TRIPLE TAP | without |
|---|---|---|
| rnd/s, tier 5 → 6 | 6.1 → 20.4 | 6.1 → 13.6 |
| rnd/s, plateau (8–20) | 25.4 | 17.0 |
| dps, plateau (8–20) | 1,438 | 1,236 |
| tiers 1–5 dps | 108 · 140 · 162 · 243 · 304 | identical |
| BULWARK at tier 20 | 13.9s | 15.6s |
| whole tree | 118,050 / 138 levels | 117,200 / 137 |

Three things worth keeping from that.

**dps falls a third less than cadence does**, and it should: the third round
carried `tapFade²` — a quarter of one — so a trigger pull went from 1 + 0.5 +
0.25 to 1 + 0.5, which is 14.3% off. The table says 14.0%. The instrument is
agreeing with the arithmetic and not with itself, which is the only kind of
agreement worth having.

**The early game did not move at all.** Tiers 1–5 come back digit for digit,
because the damage line does not reach DOUBLE TAP until tier 6 spends 8,333.
A nerf that lands only where the cliff was is the shape a nerf here should
have, and it is the same shape `tapFade` was chosen for in build 178.

**The late wall came in, and that is the cost.** A BULWARK at tier 20 takes
15.6s instead of 13.9s, and band 5's heaviest wave stops clearing inside the
probe's 120s cap. The plateau is still a plateau — 1,236 flat from tier 8 to
tier 20 on 15k of spend and then 117k of it — so this made the existing
problem shorter-tempered rather than causing a new one. `tapFade` back toward
0.6 is the cheap lever if it wants softening; the hp slope is the honest one.

## Build 192 — HOT LOAD

Capped at one level. It never had a `levels` of its own, so it was taking the
tree's default of three (`u.levels ?? 3`, tree.js:200) — 0.85³ = 0.614 on the
interval, or **1.63× on rounds a second**. That is larger than the FEED nerf
build 178 made for exactly this reason: FEED's two levels came to 1.56× and
were cut to one. The cadence pass capped the smaller multiplier and left the
bigger one sitting on a default nobody had chosen.

Measured A/B with `scripts/tiers.mjs --from 1 --to 20 --runs 3`, the same
build and the **same buy line** either side of the one change — the extra
HOT LOAD asks are skipped as `maxed`, which is what a real player's budget
does with them:

| | HOT LOAD ×3 | ×1 |
|---|---|---|
| rnd/s, plateau (8–20) | 17.0 | 13.0 |
| dps, plateau (8–20) | 1,236 | 940 |
| BULWARK at tier 20 | 16.5s | 22.7s |
| whole tree | 116,700 / 136 levels | 114,650 / 134 |

**It costs less than the arithmetic says, and the reason is the point.**
Removing two ×0.85 steps should multiply the interval by 1.384 and take
rounds a second to 12.3 and dps to 893. Measured: 13.0 and 940. The two
purchases that no longer exist free their budget, and the damage line spends
it on HOLLOWPOINT and SALVO instead — so part of what HOT LOAD was worth was
crowding out damage that pays better.

**The early ladder is reshuffled rather than lowered**, for the same reason.
Tier 5 goes 6.1 → 10.3 rnd/s and 304 → 380 dps; tier 7 goes 785 → 923 dps.
Tiers 4, 6 and 8 fall. This is not the flat-below, cut-above shape the TRIPLE
TAP removal had, because HOT LOAD is affordable from the very first band.

**One thing is unresolved and should not be read as a result.** The table's
`worst` column puts TOW at >45s from tier 19, against 8.4s before — a 5×
move where BULWARK's is 1.4×. Read BULWARK, which is consistent.

> **Resolved in build 195, and both of the guesses below were wrong.** The
> ">45s" was never a time: the TOW pair drifts out of the turret's reach and
> the probe waits out its cap. And the "direct measurement" this note
> originally leaned on — a lone TOW dying in 3.7s — was measuring half a
> body, because `debugSpawn` returns the head without its MASS. See build 195.

## Build 193 — HOT LOAD out, FEED halved

Both by request. HOT LOAD is gone from the tree; FEED goes from ×0.8 on the
interval to ×0.9, which is half the buff it was — its card said "+20% fire
rate" and now says +10%, in the same interval-reduction framing the rest of
the tree's cards use.

Measured A/B with `scripts/tiers.mjs --from 1 --to 20 --runs 3`, build 192 as
shipped against this:

| | 192 | 193 |
|---|---|---|
| rnd/s, plateau (8–20) | 13.0 | 9.6 |
| dps, plateau (8–20) | 940 | 717 |
| BULWARK at tier 17 | 13.2s | 18.2s |
| BULWARK at tier 20 | 22.4s | 27.3s |
| pay/s at tier 20 | 5.4 | **1.1** |
| whole tree | 114,650 / 134 levels | 114,150 / 133 |

**The cadence ladder is now worth 1.11× across the whole tree.** A stock
turret pulls 3.5 a second and a fully bought one pulls 3.9. It was 1.47× on
192, and 2.54× before build 178 when FEED had two levels and HOT LOAD three.
Fire rate has effectively stopped being something the tree sells; what it
sells is what a round is worth.

**The early ladder moves this time**, which the TRIPLE TAP removal did not.
FEED is in the damage line from tier 2, so tiers 2–3 lose about 10% of their
dps outright, and 4–6 get reshuffled by what the freed budget reaches first
(tier 4 rises 253 → 287, tier 5 falls 380 → 287).

**Two things at the top of the ladder are worth a decision.** A single
BULWARK at tier 20 is 27.3s, and band 5's heaviest wave stops clearing inside
the 120s cap from tier 17 rather than 19. And because income is measured over
the time a clear takes, `pay/s` at tier 20 falls from 5.4 to 1.1 — a fivefold
collapse at the top, on top of a ladder that already plateaus at tier 8. The
tier ladder will find its own level (it steps back after two failed waves),
so this is not a soft-lock; it does mean the reachable ceiling is now
materially lower, and that the last 100k of the tree buys even less than it
did.

TOW still reads >45s at high tiers in both columns, before and after, so it
is not this change — see build 192's note, and the outstanding item below.

## Build 194 — the health slope comes down to meet it

Builds 189–193 took the whole cadence tree apart: TRIPLE TAP, then HOT LOAD,
then FEED halved. The plateau went 1,438 dps → 717 — exactly half — and the
wall the ladder forms grew to match. `hpStep` goes 1.17 → **1.12**.

A compounding slope is the right instrument for this, because the damage cut
is flat and the health it was outrunning is not: at 1.17 the slowest body in
band 5 went from 13.9s at tier 20 to 27.3s, while tier 3 did not move at all.
The fix has to do nothing at the bottom and a great deal at the top, which is
what changing the base of an exponent does.

Chosen by sweeping, not by arithmetic, against the wall the game had before
any of the cadence work (build 188):

| tier | before the nerfs | at 1.17 | 1.13 | **1.12** | 1.11 |
|---|---|---|---|---|---|
| 12 | 4.1s | 8.9s | 5.9s | **5.1s** | 4.6s |
| 16 | 8.0s | 15.3s | 9.2s | **8.1s** | 7.5s |
| 17 | 8.7s | 18.2s | 9.7s | **9.2s** | 8.1s |
| 20 | 13.9s | 27.3s | 15.6s | **12.4s** | 11.3s |

1.11 undershoots — it leaves the top easier than it was before any of this.
1.13 leaves half the gap. 1.12 lands on the old wall to within the column's
own noise, and health at tier 20 is ×8.6 rather than ×19.7.

Two things recovered with it, and both were consequences of the nerfs rather
than of the slope:

- **The clear cap.** Band 5's heaviest wave was over 120s from tier 17; it is
  102s at tier 20 now, so the whole ladder clears again.
- **Top-end income.** `pay/s` at tier 20 was 1.1 against a mid-ladder 20-40,
  because income is measured over the time a clear takes. It is 12.4 now.

**And the TOW cliff moved with it.** At 1.17 the `worst` column read >45s at
tiers 18 and 20 and 43.0s at 19; at 1.12 those are 9.7s, 11.9s and 12.4s.

> **Read in build 195 with the instrument fixed, this is not what it looked
> like.** It is not a threshold in health-against-damage. A lighter pair
> simply dies before it has drifted out of the turret's reach, so the
> artefact stops firing. The slope change did not fix a TOW problem; it hid
> an instrument one. Build 194's choice of 1.12 stands on its own — it was
> made against BULWARK, which the artefact never touched, and it holds under
> the corrected bench.

## Build 195 — the TTK bench measures the gun again

The `worst` column claimed to be time-to-kill at 300 units. It was not. The
body was put down at 300 and then allowed to walk, so what it measured was as
much the pathing as the gun.

A TOW is where that showed, because a TOW is two bodies and the pair climbs
away. Measured over nine seconds at tier 18: head 307 → 682 → 754 → 1092, and
the MASS 431 → 636 → 840 → 996. The turret's reach with the whole tree bought
is **841**. At about 6.6s the MASS crosses it, `autoTarget` returns nothing
from then on, and the probe sits out its 45-second cap waiting for a body the
gun cannot point at. Every `>45s` in the TOW column was that: not a time, a
target that left.

The bench pins the body now, exactly as the gun bench already pinned its
wall. Same slope, same everything, only the pin:

| tier | unpinned | pinned |
|---|---|---|
| 16 | tow 8.3s | tow 8.4s |
| 17 | tow 17.1s | tow 9.2s |
| 18 | tow **>45s** | tow 11.8s |
| 19 | tow **43.0s** | tow 14.0s |
| 20 | tow **>45s** | tow 15.0s |

BULWARK is unchanged throughout, which is what says the pin fixed the
artefact rather than moving every number.

**Two earlier notes were wrong and are corrected above.** Build 192 claimed a
direct measurement disagreed with the table — a lone TOW dying in 3.7s. That
probe used `debugSpawn`, which returns the head *without* its MASS;
`debugSpawnGroup`, which the bench uses, returns the pair. It was comparing
half a body against a whole one. And build 194 read the cliff moving with the
health slope as evidence of a real threshold; it was a lighter pair dying
before it had drifted far enough to trigger the artefact.

Build 194's `hpStep` of 1.12 stands. It was chosen against BULWARK, which the
artefact never touched, and the pinned bench puts tier 16 at 8.1s and tier 20
at 12.6s — the same numbers the choice was made on.

### Still outstanding

- The `swell` remnants.
- Tiers 5–8 fall out of plan B's 2–4s band. That is band composition rather
  than the health slope — a new band lands every two tiers and a turret that
  has just grown meets it before the health has caught up. Re-banding waves or
  moving `perBand` is the lever, and neither is a tuning pass.
- The tree plateaus from tier 8. Removing TRIPLE TAP and capping HOT LOAD
  both lowered the plateau; neither made the last 100k of the tree buy
  anything.
