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

`hp` becomes `hpStep ** (n - 1)` with **hpStep 1.17**. Two changes in one: it
compounds, and it is read off tier 1 rather than off zero, so **tier 1 is the
table exactly as authored** and every rung is 17% on the one below.

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

### The interlock this opened, for plan C

Health now compounds and bounty does not, so they pull apart as the ladder
climbs. `tiers.mjs` reports it directly — energy a wave offers per 1,000 health
it makes you chew through:

| tier | 1 | 5 | 10 | 15 | 20 |
|---|---|---|---|---|---|
| pay per 1k health | 40 | 4 | 1 | 1 | 0 |

Most of the fall from 40 to 4 is band composition rather than the slopes — band
2's types carry far more health per unit of bounty than band 1's. Inside band 5,
which is tiers 9 through 20, it is the slopes alone: bounty ×(1 + 0.15n) reaches
×4 while health reaches ×19.7, so a rung pays about a fifth of what it did per
unit of work.

That makes the wall a hard stop rather than a grind — you cannot earn your way
through it — which may well be the right answer for "progress until you cannot
any further". But it is now plan C's decision and it has a number on it: to hold
the ratio flat through band 5, bounty has to compound too, at roughly the same
1.17.

### Still outstanding

- Plan C in full: `world.earned`, energy-gated unlocks, bounty tuning.
- The demolition: `killGoal`, `releasesLeft`.
