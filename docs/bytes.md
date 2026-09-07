# Plan — ENERGY becomes BYTES

Nothing in this document is implemented. It is the proposal.

---

## 1. The decision that makes the rest cheap

**One old ENERGY point becomes exactly one kilobyte.** That single choice makes
this a *unit change and not a rebalance*: every ratio in the economy is
preserved to the digit, so every measured number this repo has written down —
`tiers.mjs`'s income curve, plan C's affordability table, the ORDINAL hash,
`docs/pacing.md` — stays true. Only the name and the notation move.

It is worth being explicit about the alternative and why it is refused. Making
one point equal one *byte* would put the whole game between 1 B and 159 kB: two
prefixes, and the ladder the request asks for would never climb. Re-authoring
the economy so it spans B → TB honestly would be a balance pass on a hundred
and fifty-six prices with no measurement behind it. The ×1000 is the version
where the metric is real and nothing else moves.

### And the byte is a live unit, not a formality

Measured against the current config, at 1 point = 1 kB:

| | old | new |
|---|---|---|
| smallest amount that can enter the purse (`minValue` × `taxFloor`) | 0.3 | **300 B** |
| a fragment off a MOTE | 1 | 1.00 kB |
| a DRIFT | 6 | 6.00 kB |
| cheapest tree node | 500 | 500 kB |
| an ability | 1,100 | 1.10 MB |
| an emplacement lot | 2,600 | 2.60 MB |
| the ASSAY (dearest single price) | 20,000 | **20.0 MB** |
| everything buyable | 174,400 | **174 MB** |
| lifetime banked, long run | ~500,000+ | **500 MB → low GB** |

`bank()` does not round — `got = amount * intakeRate * dividend` — so
sub-kilobyte amounts already exist in the game today and are simply invisible.
Under the intake tax they become the thing the **B** unit is for. B, kB and MB
are all reachable without touching a single balance number; GB arrives on a
long run's lifetime total.

> **Corrected after the inventory.** My first pass put the total at 158,807 by
> walking the tree. That misses the six emplacements, which are bought on the
> FIELD at `CFG.gun.cost` 2,600 each and are not tree nodes: 158,800 across 155
> levels plus 15,600 is **174,400**. It is the kind of miss this whole document
> exists to prevent, and it is recorded rather than quietly fixed.

---

## 2. The ladder, and one formatter

Base-10 SI, as asked — 1 kB = 1000 B, not 1024.

```
B  kB  MB  GB  TB  PB
```

`CFG.bytes.units` is that table, and **one** exported `fmtBytes(n)` is the only
thing in the game allowed to turn an amount into text. Rules:

- Pick the largest unit where the value is ≥ 1 of it.
- **Three significant figures, never more**: `948 B`, `1.00 kB`, `21.7 MB`,
  `1.08 GB`. Under 1 kB there is no fractional byte, so `948 B` not `948.0 B`.
- A hair space between figure and unit, and `font-variant-numeric: tabular-nums`
  (already on the chip) so columns line up.
- The widest string it can produce is `999 PB` / `1.08 GB` — **7 characters**,
  against today's widest raw figure of 6 (`158807`). One character wider, which
  is what makes the layout impact small rather than a redesign.

A second entry point, `fmtRate(n)`, for anything per second — the ASSAY's
counter and any income readout — which is the same formatter with `/s`. Bytes
per second is the one place this change makes a readout *more* natural than it
is now.

---

## 3. Where the amounts live, and how they are written

**Store bytes.** `world.energy` becomes `world.bytes` and holds a count of
bytes, so the internal number and the number on screen are the same number.
This repo has been bitten repeatedly by a value that is one thing in the code
and another on the glass (`export let` in the bundle, `[hidden]` under a
`display`, a renamed `SCALED` leaf); a currency whose stored value is 1000× its
displayed value would be the same trap with a hundred and fifty-six instances.

To keep the config readable at that scale, prices are authored through unit
helpers rather than as raw integers:

```js
cost: kB(500)      // reads as 500 kB, stores 500000
cost: MB(20)       // the ASSAY
cost: MB(1.1)      // an ability
```

This is strictly better than what is there now: `cost: 500` today does not say
what 500 *is*. `check-build.mjs` gains one assertion — every `cost`/`step` in
the tree is a whole number of bytes and was produced by a helper — so a raw
literal cannot creep back in.

---

## 4. The save, without a VERSION bump

`save.js` checks `d.v !== VERSION` and throws the file away on a mismatch, so
bumping it deletes every run currently open. It must not be bumped: the restore
**can** read its past, it just has to multiply.

- A file written before this change has no `unit` field. On load, every
  currency field in it is multiplied by 1000 and the run continues with the
  same purchasing power it had.
- A file written after carries `unit: 'B'` and is taken as-is.
- The fields that need it: `energy`, `earned`, and anything in the ledger or
  the wave record that holds an amount. The object-type `opens` gates are keyed
  on `earned`, so they move with it and **nothing re-locks** — which is the
  thing CLAUDE.md warns about for these gates specifically.

The `remainder` (◆) is **not** touched. It is a count of tokens, not a quantity
of storage, and NEW FORM is priced in it deliberately.

---

## 5. The words

Renaming the currency changes the vocabulary around it. The fiction improves:
this is a simulation counting objects, and an object's worth is already
computed from its **mass** — so a bigger object is more data, which is exactly
what `perMass` now means.

| now | becomes | why |
|---|---|---|
| ENERGY (the chip label) | *nothing* | The unit suffix says it. `fitBar` already drops this word first, and CLAUDE.md notes it "says nothing the green number does not" — with `21.7 MB` on the chip it is fully redundant. |
| "energy buys them" | "bytes buy them" | |
| "Broken objects leave ENERGY" | "Broken objects leave DATA" | DATA for the stuff on the floor, BYTES for the amount — the distinction the game already makes between wreckage and its worth. |
| bank / banked | **written** | "written to the run" is the right verb for storage and keeps `world.earned` honest as a lifetime total. |
| income | **throughput** | And it is now literally B/s. |
| salvage | **recovered** | |
| intake | *unchanged* | Still exactly right. |
| bounty, toll, dividend, tithe, levy | *unchanged* | All work as-is on a quantity. |
| MOTE, DRIFT and every type name | *unchanged* | They are names, not units. |

Sites confirmed by grep so far — the full inventory is being swept and will be
appended before any code is written:

- `src/tutorial.js` — five teaching captions plus the PULSE first-use line.
- `src/narrative.js:185` — the UPGRADES control row.
- `src/codex.js:213` — DRIFT's glossary entry states "Worth 10 ENERGY against a
  MOTE's 4"; both figures move to kB **and the 10 is already wrong** against
  `CFG.energy.drift: 6`, so it gets corrected in the same pass.
- `src/upgrades.js` — LEVY, INTAKE and SHROUD name energy in their lines.
- `src/menu.js:810` — the tree's ENERGY heading; every card price; the
  affordability pip.
- `src/game.js` — the emplacement alerts and `debugGiveEnergy`.
- `src/hud.js` — the chip, the resume note, the debug grid's `+10000 ENERGY`.
- `index.html:109` — `<em>ENERGY</em><span id="energyNum">`.

Ids and classes (`#energyNum`, `#energyBuys`, `#energyChip`) are renamed to
`#bytesNum` etc. **only after** checking `smoke.mjs`, which finds controls by
exact text, and the suite, which finds elements by id.

---

## 6. What would break — measured, not guessed

A four-surface sweep found **378 distinct sites** and 53 hazards. The ones that
change the plan:

**`priceOf` is ADDITIVE.** `cost + step * have` — so scaling `cost` alone and
leaving `step` silently changes the *shape* of every ladder, not just its
level. Both scale together, or the second level of everything gets cheaper
relative to the first. This is the single easiest way to get the change wrong.

**`world.energy | 0` truncates to 32 bits.** `menu.js:1905` uses it as the diff
key that decides whether the chip badge is recomputed at all. Today the purse
is in the hundreds of thousands and the cast is invisible; in bytes a late run
reaches billions, and `2147483648 | 0` is negative. It becomes `Math.floor`,
and every other `| 0` on currency is swept at the same time.

**`CFG.energy` is not all currency.** `pulse: 400` is a *radius*, `pull: 26` a
*speed*, and `tax`/`taxFloor`/`taxCap` are *multipliers*. A blanket multiply
over that object corrupts four values that are not money. Worse, renaming the
block breaks two `SCALED` path strings — which is exactly the fault build 275
fixed and wrote a guard for. Rename the block only with that guard watching.

**The chip's label is written by JavaScript, not markup.** `hud.js:1085`
rewrites that `<em>` on every `setEnergy`, swapping between the word and the
`×1.24` dividend multiplier. Changing `index.html` alone leaves the old word
live the first time the purse moves — and the slot already has two jobs, so the
unit cannot simply move into it. Compounding that: `styles.css:3161` drops the
`<em>` entirely below 372px, so a unit living in the label is a unit a narrow
phone never sees. **The unit belongs in the figure**, not the label.

**`fitBar` fails silently in the direction that clips.** It is keyed on digit
*counts*: `12500` is 5 digits and 5 characters, `12.5 MB` is 3 digits and 7.
The string gets **wider** while the key gets **smaller**, so the guard stops
re-measuring exactly when it needs to, into a group that is `overflow: hidden`.
Re-key on the rendered strings' length — never on the values, which cost 874
forced layouts in ten seconds.

**`rollBank` animates the tree's figure**, tweening `Math.round(from + (to −
from) * e)` every frame for 260ms, and it carries a hard-coded magnitude that
decides whether it animates at all. A naively formatted roll flickers its
prefix as it crosses 1000. Roll the *number* and format once per frame at a
prefix chosen from the destination.

**`tabular-nums` stops four readouts jittering**, and a prefixed string breaks
that assumption — the digits align, the unit does not.

**The price is painted on the canvas** at `yard.js:578` onto a plate sized from
`measureText`, so a longer string changes *geometry*, not just text.

**`.shopPrice` has seven rules** at different type sizes, and the armed card
sets `content: attr(data-price)` at **30px** in a grid cell that stretches its
whole row. That is the largest type any currency figure appears in.

**Teaching captions are identified by a hash of their own text** (`idOf`).
Rewording the five ENERGY captions makes them five *new* lines, so every device
that has already been taught them is taught them again. That is a shipped
behaviour change and it belongs in the plan, not in a surprise.

**Two figures in player-facing prose are already wrong.** `codex.js:213` says
DRIFT is "Worth 10 ENERGY against a MOTE's 4": `CFG.energy.drift` is **6**, and
a MOTE's `drops: 4` is the *number of motes it sheds*, not an amount. A
mechanical noun-swap would ship a second falsehood on top of the first.

**A payout with no unit at all**: `MARGIN +${margin}` (`game.js:459`) does not
grep for "energy" and would be missed by any sweep that looks for the word.

**The ASSAY's numbers are not currency** — they are damage per second and a
lifetime damage odometer. A global re-unit sweep would wrongly prefix them.

**REMAINDER shares the price slot, the header and the affordability
comparison.** A careless sweep gives it byte prefixes and NEW FORM reads "7 B".

**The ten object gates are interlocked** with the pre-180 kill migration and
`check-build`'s frozen `KILL_GATES`; they key on `earned`, so they move with
the rescale and must be re-checked together, not one at a time.

**Nine `cost:` fields in the boss configs are dead** — nothing has read them
since build 227 removed the tree's ANOMALY branch. Rescaling them is wasted
work that *looks* like coverage. They should be deleted, and
`check-build.mjs:412` carries a stale comment promising to check them.

## 7. Phases

Each phase ends green, with the suite run and the build pushed.

1. **The unit and the formatter.** `CFG.bytes`, `fmtBytes`, `fmtRate`, the
   `B/kB/MB/GB` helpers, and their cases — including the sig-fig rules and the
   widest-string measurement. Nothing else changes; nothing calls them yet.
2. **The store and the migration.** `world.energy` → `world.bytes` in bytes,
   every price through a helper, `save.js`'s `unit` marker and the ×1000 load
   path. The economy is now in bytes and still prints raw.
3. **The displays.** Every site from §5 routed through `fmtBytes`. `fitBar`
   re-keyed. The bar measured at 320.
4. **The words.** Copy, captions, the glossary, the headings, the ids. The
   "no bare integer" sweep goes in here, because it is what proves phase 4 is
   finished.
5. **The check.** Re-run `tiers.mjs` and confirm the income curve's SHAPE is
   unchanged, which is the whole claim of §1.

   **The ORDINAL hash will move, and that is not a regression.** It mixes
   `w.energy` every 300 frames, so multiplying the purse by 1000 moves it by
   construction — I claimed otherwise in the first draft of this plan and was
   wrong. The procedure is the one CLAUDE.md already sets out for it: take the
   hash on HEAD before the change and again after, in the same container, and
   record the DELTA with its cause. What would be a real finding is the hash
   moving on a build that did *not* touch the purse.

Phase 1 is worth doing on its own and is safe to stop after.

---

## 8. What this deliberately does not do

- **No balance change.** Every ratio is preserved. If the game is to be
  re-priced as well as re-denominated, that is a separate pass with `tiers.mjs`
  behind it, and it should not ride along with a rename.
- **No binary prefixes.** kB is 1000 B, as asked. KiB/MiB are not used.
- **No change to REMAINDER.**
- **No renaming of object types.**

---

## 9. The inventory

A four-surface sweep, each surface checked by a second reader for what the
first missed. **378 distinct sites** across `src/`, `scripts/`, `index.html`
and `styles.css`:

| kind | count | what it means |
|---|---|---|
| LOGIC | 161 | arithmetic or a comparison a rescale could break |
| TEST | 144 | a case asserting a price, a payout, a label or a width |
| VALUE | 114 | a literal amount |
| DISPLAY | 88 | a place an amount becomes text |
| WORD | 80 | a user-visible "energy" |
| COMMENT | 78 | a docstring stating a number that would become false |
| FIELD | 59 | a variable, property or save key holding currency |

The full list is in the workflow journal at `wf_1313e22b-743`. The parts that
decide the design are in §6; the rest is execution.

**Two things the sweep confirmed rather than found**, and both are load-bearing
for §2 and §3:

- **There is no number formatter anywhere in the repo.** Every currency figure
  today is `String(n)`, `Math.floor(n)` or `Math.round(n)` interpolated into a
  template. So `fmtBytes` is genuinely new code and every call site is a site
  that has never had one.
- **The purse is a float and always has been.** `bank()` does not round, and
  every reader truncates on the way out. Bytes do not make it fractional; they
  make the existing fraction visible, which is the whole of §1.
