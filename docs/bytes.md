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
| the ASSAY | 20,000 | **20.0 MB** |
| everything buyable (156 levels) | 158,807 | **159 MB** |
| lifetime banked, long run | ~500,000+ | **500 MB → low GB** |

`bank()` does not round — `got = amount * intakeRate * dividend` — so
sub-kilobyte amounts already exist in the game today and are simply invisible.
Under the intake tax they become the thing the **B** unit is for. B, kB and MB
are all reachable without touching a single balance number; GB arrives on a
long run's lifetime total.

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

## 6. What could break, and the guard for each

| hazard | guard |
|---|---|
| `Hud.fitBar` is keyed on **digit counts** (CLAUDE.md: keying it on values forced 874 layouts in ten seconds). `21.7 MB` has a different width behaviour from `12500`. | Key it on the formatted string's **length**, which is the thing that actually changes, and keep the once-a-frame diff. |
| The chip gets one character wider at worst. | Measure the bar at 320×568 with the widest producible string and assert no clip — the `fitBar` case already exists to extend. |
| A price that is no longer a whole number of bytes. | `check-build.mjs`: every cost/step is an integer. |
| Sub-byte amounts accumulating invisibly. | `bank()` keeps its fractional accumulator; only the **display** floors. Assert that the purse and the displayed figure never disagree by a whole unit. |
| A pre-change save read as 1000× poorer. | The migration above, plus a case that loads a v4 file with no `unit` and asserts the purse and every `opens` gate survive. |
| A number printed raw somewhere the sweep does not look. | A regress case that walks every text node on the play screen, the menu and the title and fails on any bare integer of four digits or more in a currency slot. This is the case that makes the rename *complete* rather than mostly complete. |
| `tiers.mjs`'s `pay` columns (which once summed bounty *multipliers* and published a false finding). | Re-run it and check the shape of the curve is identical to the recorded one, since nothing about the economy should have moved. |

---

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
5. **The check.** Re-run `tiers.mjs` and the ORDINAL hash and confirm neither
   moved — which is the whole claim of §1.

Phase 1 is worth doing on its own and is safe to stop after.

---

## 8. What this deliberately does not do

- **No balance change.** Every ratio is preserved. If the game is to be
  re-priced as well as re-denominated, that is a separate pass with `tiers.mjs`
  behind it, and it should not ride along with a rename.
- **No binary prefixes.** kB is 1000 B, as asked. KiB/MiB are not used.
- **No change to REMAINDER.**
- **No renaming of object types.**
