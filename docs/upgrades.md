# The upgrade menu

*Shipped, builds 152-154. What follows is the plan as written; the table
below is what it measured against afterwards.*

| | before | gate | **after** |
|---|---|---|---|
| screen above the first buyable thing | 305 of 664 | < 200 | 93 (the machine) |
| whole cards on screen, no scrolling | 0 | 2 + the turret | **2 + the turret** |
| text nodes in the default view | 460 | < 60 | **28** |
| type below 11px | 150 nodes | 0 | **0** |
| body-text contrast | 2.99:1 | >= 4.5:1 | **>= 4.5:1, swept** |
| icon size | 18px | 44px | 40px |
| first screen: 0 owned vs 63 owned | 0 differing pixels | must differ | **the machine, the count, five meters** |
| scroll to see everything owned | 3069px | one screen | **788px** (viewport 572) |
| taps to a purchase | up to 4 | 2, one target | **2, one target** |
| branch hues >= 60 deg apart | 2 of 4 | 4 of 4 | **4 of 4** |

Two gates were written wrong and are recorded as written. *Screen above the
first buyable thing* was set at 200px before the plan put a 150px machine at
the top of the panel; the machine IS the thing above it, and 93px of that is
the top of the machine itself. *Icon size* landed at 40 rather than 44 because
the card is a fixed height and 44 cost the stat its third line.

`17 OF 63` was wrong twice over: there are **136** levels in the tree, and a
run does not reach that, so the count shipped without a denominator. Risk 3
below called it and it was right.

Phase B shipped with phase D, because B is D's replacement and shipping the
branch grids on top of the tree would have left the panel with two
catalogues -- which is the complaint.

---

*The plan, as written before any of it was built:*

The brief was: it is not satisfying, it is too busy, it is too small, it makes
you focus too hard, and you do not want to be in there. Upgrading is a major
part of this game and it should be the part you look forward to.

The second brief was six questions. They are answered first, because they are
what the rest of this has to earn.

---

## The six questions

| | the menu today | the first plan | this plan |
|---|---|---|---|
| Does it look good? | no | **did not say** | section *The graphics* |
| Simple to understand? | no — 3 levels, 4 taps | partly — proposed 4 surfaces | one screen, one expansion |
| Do you want to be there? | no | no — efficient, not desirable | the turret, and big objects |
| Excited to click? | no | it was phase **D**, last | it is phase **A**, first |
| A sense of progression? | **none, measurably** | weak — a derived number | the machine, and `17 OF 63` |
| Buttons easy to use? | no | **re-broke a fixed bug** | one card, one target |

The first plan was a good diagnosis and a mediocre design. It counted things
and never said what any of it should look like — and the request was that
upgrading should feel *desirable*, which is not a thing you get from a smaller
node count. Three of its six answers were wrong. They are corrected below and
the reasons are kept, because two of them are traps worth not walking into
again.

---

## What is actually wrong, measured

Opened on a 390 x 664 phone.

### It is a list, and the list is a spreadsheet

| | now | should be |
|---|---|---|
| separate pieces of text | **460** | under 60 |
| text nodes at 10px or smaller | **434 of 460** | 0 |
| text nodes at 8.5px or smaller | **150** | 0 |
| smallest type | **5.5px** | Apple's floor is 11 |
| scroll height | **3069px — 5.6 screens** | one screen |
| rows fully on screen at once | **6** | — |
| buyable things | 63, in a 94-node tree | 63 |
| taps from opening to a purchase | **up to 4** | 2 |

### Half the phone is not the menu

`#menu` is `max-height: 74%`, so the sheet stops short and a dimmed, dead game
field sits above it. Then the title bar, then the tabs, then a sticky ENERGY
bar. Measured from the top of the screen:

| | y | share of a 664px screen |
|---|---|---|
| top of the sheet | 166 | 25% is dimmed field |
| top of the scroller | 240 | 36% gone |
| **top of the first row you can buy** | **305** | **46% gone** |

Six rows fit under that. Sixty-three things are for sale.

### It shows you nothing you have built

This is the one that matters, and it is not an opinion.

Screenshot the menu with **nothing bought**. Screenshot it again after buying
**every one of the 63 upgrades** — every turret part, every round, every mine,
every ability. Diff the two below the ENERGY bar:

> **0 differing pixels.**

The first screen of the upgrade menu is identical for a player who owns
nothing and a player who owns everything. The only thing on it that has moved
is the wallet number in the header, and that is a measure of what you have
*not* spent.

Worse, the direction is backwards. A bought row **greys out and gets a small
tick**. Colour is how the menu says "for sale"; grey is how it says "yours". So
the reward for completing the tree is that the tree goes dim. Progression is
currently rendered as *fading*.

And the first screen of a panel called UPGRADES contains **no upgrades**: it is
RECAST, which is bought with a currency you do not have yet, followed by seven
ANOMALY apertures, which are consumable ways in to a boss. The two things that
are not upgrades are the two things at the top.

### The graphics are not doing any work

- **The icons are good and they are 18px.** The game has a bespoke SVG mark
  for every round, mine and ability, drawn on a 24-unit grid. They render at
  18 x 18. That is a thumbnail of an asset that was drawn to be looked at.
- **Six branch colours exist and one of them is legible.** `--tone` is defined
  per branch and spent on a 1px rail at **26%** opacity, an 18px icon, and a
  price border at **30%**. At arm's length the whole panel is one colour.
- **Two of the four branch colours are the same colour.** TURRET is `#59e0ff`
  and AMMUNITION is `#bff4ff` — twenty degrees of hue apart, one of them almost
  white.
- **The descriptions fail contrast and size at once.** `.treeLine` is `#4d5f74`
  on `#060c16`: **2.99:1**, against a 4.5:1 floor — at **8px**. The prices are
  `#45566a`: **2.6:1**.
- **The level meter is three 6px hollow squares.** The clearest progression
  signal in the whole system, drawn at the size of a full stop.
- **The sticky ENERGY bar is 96% opaque**, so rows scroll visibly through it.
  It reads as a rendering fault, because it looks exactly like one.

### Every row is the same row

Icon, name, two lines of grey prose, a price box. Seven turret upgrades in a
column, all identical in weight, **all priced 500**. Nothing is bigger than
anything else, so nothing is more wanted than anything else. There is nothing
to scan, so you read; there are 63 of them, so you stop.

---

## What phone games that get this right actually do

| game | shape | taps to buy | things visible | text per thing |
|---|---|---|---|---|
| Vampire Survivors | full-screen draft | **0** — it comes to you | 3–5 | name + one line |
| Slay the Spire | 3 cards, take one | 0 | 3 | the card |
| Archero, Survivor.io | 3 huge cards | 0 | 3 | name + one line |
| Hades | 3 boons | 0 | 3 | name + effect |
| Balatro | a counter with 2–4 items | 0 | 2–4 | name + price |
| Clash Royale | grid of tiles → detail sheet | 2 | ~12 | name + level bar |
| Brawl Stars | character → 2–3 items | 2 | 2–3 | name + one line |
| idle ladders | one flat ladder of buy rows | 1 | ~8 | name + price + count |

Three things they share, and none of them is a matter of taste:

1. **Nobody browses a catalogue.** The satisfying ones show **three to twelve
   things** and ask for **nought to two taps**. Not one opens on a directory.
2. **Where there IS a big catalogue, it is a flat grid of equal tiles.** Clash
   Royale has a hundred cards and never draws the hierarchy it certainly has.
3. **The thing being upgraded is on the screen while you upgrade it.** Clash
   Royale shows the card. Brawl Stars shows the brawler. Hades shows Zagreus.
   You watch the object get better. **This game shows you a list about a turret
   you cannot see.**

**This game already owns the good pattern.** ALLOCATION — three offered, one
taken — is a Vampire Survivors draft and it is the part of the upgrade system
that already works. The tree is the second, browsing-based path, and it is the
one carrying all sixty-three items and all the unpleasantness.

---

## The principle

> **The default view answers "what can I buy right now" — and shows what you
> have already built.**

Two jobs: wanting, and having. The first plan only had the first one, which is
why it came out efficient and cold. A shop you enjoy being in is one where the
shelf is short *and* the room is full of what you already own.

---

## The design

One screen. One expansion. One kind of object.

```
  0  ┌──────────────────────────────────┐
     │  ×                    ENERGY 6000│   36   close, and the wallet
 36  ├──────────────────────────────────┤
     │                                  │
     │          [ THE TURRET ]          │  164   live, drawn, ~150 tall
     │                                  │
200  │   17 OF 63 BUILT · TURRET 8/17   │   26   what you have made
226  ├──────────────────────────────────┤
     │  NEXT                            │   22
248  │  ┌─────────────┐ ┌─────────────┐ │
     │  │    ICON     │ │    ICON     │ │
     │  │   SIGHT     │ │  HOTLOAD    │ │  168   two cards, 177 x 168
     │  │   +25% DMG  │ │  +18% DMG   │ │
     │  │   ▓▓▓░      │ │  ░░░        │ │
     │  │     500     │ │     500     │ │
     │  └─────────────┘ └─────────────┘ │
416  ├──────────────────────────────────┤
     │  YOUR MACHINE                    │   22
438  │  ▣ TURRET       ▓▓▓▓▓▓░░   8/17  │   44
     │  ▣ AMMUNITION   ▓▓░░░░░░   4/21  │   44
     │  ▣ MINES        ░░░░░░░░   0/14  │   44
     │  ▣ ABILITIES    ▓░░░░░░░   2/10  │   44
     │  ▣ ANOMALY      ▓▓▓░░░░░    3/7  │   44
664  └──────────────────────────────────┘   ~40px scrolls off
```

That is the whole default view: **the machine, two things to buy, and five
meters**. About **40 pieces of text**, against 460. One screen and a nudge,
against 5.6 screens.

### 1. THE TURRET — the top of the menu, and the point of it

About 150px tall, live, drawn by `drawMachine` from your actual rig. It is not
decoration and it is not a logo: **it is the progress bar.** Every TURRET
purchase bolts a part onto it while you watch. `RIG_MAX` is 17 and `rig().filled`
already drives the growth, so the machine to do this with is built.

Under it, one line that never goes down: **`17 OF 63 BUILT`**, and the branch
you last bought from. Blunt, true, needs no derivation. The first plan invented
a number called OUTPUT for this job; this one is already in the save file.

A slow idle keeps it alive — the barrel tracking a shallow sine, the gimbal
ring turning a few degrees a second, on the same faint grid as the field.
**Redraw on change plus a cheap idle, not a 60fps loop over a running game.**
See the risks.

### 2. NEXT — the shelf

The two cheapest things you can afford, as full cards. Nothing else. If you can
afford nothing, one card shows the cheapest thing there is with how far off you
are, and the shelf is honest about being empty rather than hiding.

Buy one and **the shelf re-deals**: the bought card leaves, the next-cheapest
arrives. You are never looking at an empty counter and never navigating to find
the next purchase. That loop is the whole hook, and it is the reason NEXT is
above the branches and not below them.

RECAST belongs here and nowhere else — it is one item, bought with a currency
nothing else uses, and it should appear on the shelf on the run you have
REMAINDER to spend and be absent otherwise. It is currently a permanent row at
the top of the menu saying *not yet built*.

### 3. THE CARD — the only object in the menu

**177 x 168.** One size, used by the shelf and by every branch grid, so the
menu contains exactly one kind of thing.

| | |
|---|---|
| icon | **44px**, full branch tone, on a 12% tone plate |
| name | **16px** |
| one stat | **12px** — `+25% DMG`, `×2 USES`, `2 → 3`. A number, never a sentence |
| meter | a 4px bar in the tone, segmented by level |
| price | **19px**, tabular, as a filled block along the bottom edge |

Cut corners top-right and bottom-left — the same polygonal language as every
other surface in the game, at three times the scale.

**The whole card is one tap target.** Not the price box, not the body: the
card. This is the trap the first plan fell into — it proposed *tap the body for
detail, tap the price to buy*, which is exactly the two-targets-on-one-row
mistake `menu.js` already identifies and fixes in its own comments: *"One tap
does one thing."* Re-breaking a bug the codebase has a paragraph about was the
worst thing in that draft.

**Three states, and owned is the brightest:**

| | edge | icon | price block | glow |
|---|---|---|---|---|
| affordable | tone 100% | tone 100% | tone-tinted | 14px, tone at 30% |
| too dear | tone 30% | tone 45% | dim | none |
| **owned** | **tone 100%** | **tone 100%** | **replaced by a full meter** | soft inner |

Same size in all three. Never hide, never shrink — dim is legible, gone is not.
And the inversion is the point: **today a bought row goes grey and gets a tick.
A tick is a receipt. A lit part is a trophy.**

### 4. YOUR MACHINE — the branches

Five rows, 44px, each with its icon, its name, a meter in its own colour, and
its fraction: `8/17`. That is the whole of the tree's structure, five lines,
readable from across a room.

Tap one and it **expands in place** into that branch's cards, two across. One
branch open at a time; opening another closes the last. So you are never more
than one screen from the top and there is no second view to be lost in.

The first plan put the full item detail in a **bottom sheet**, which is a modal
on top of a modal on a phone. Dropped. The card carries a name, a number and a
price; that is enough to decide with. The prose that currently sits on 63 rows
does not move somewhere else — **it is deleted.**

Order and colour do the work indentation used to: a round's mods sit directly
after the round, in its tone, carrying its icon. That is what Clash Royale does
with a much larger catalogue.

---

## The graphics

The brief said *spend time on graphics as a whole*. The menu's problem is not
only where things sit. It is that the things themselves have no presence.

### G1 — Show the art at the size it was drawn for

Every round, mine and ability has a hand-drawn SVG mark on a 24-unit grid.
They are rendered at 18px. **Show them at 44.** Same assets, no new work, two
and a half times the presence, and the icon becomes the thing you recognise a
card by instead of the name you have to read.

### G2 — Four branch colours that are four colours

TURRET `#59e0ff` and AMMUNITION `#bff4ff` are twenty degrees apart and the
second is nearly white. Green is spoken for by energy; the spectrum is spoken
for by ANOMALY. So:

| | now | proposed | why |
|---|---|---|---|
| TURRET | `#59e0ff` | keep | cyan, 190° |
| AMMUNITION | `#bff4ff` | **`#ff5d8f`** | rose, 340° — already in the palette |
| MINES | `#ffb347` | keep | amber, 35° |
| ABILITIES | `#c9a7ff` | keep | violet, 265° |

One line of config. Then spend them: the icon, the card edge, the meter fill,
the price glow, the branch bar — at **full strength**, not at 26%.

### G3 — A type scale with a floor

Nothing below 11px, and nothing that is *content* below 12. Small type is legal
for a letter-spaced label and illegal for anything a decision depends on.

| | size |
|---|---|
| section label (`NEXT`, `YOUR MACHINE`) | 11, `0.2em` |
| built count | 13 |
| card stat | 12 |
| branch fraction | 13, tabular |
| branch name | 14 |
| card name | **16** |
| card price | **19**, tabular |
| energy | 20, tabular |

And a contrast pass: everything that is read clears **4.5:1**. `#4d5f74` at
2.99:1 does not, and it is currently on all 63 rows.

### G4 — The meter replaces the pip

Three 6px hollow squares become one 4px bar in the branch tone, segmented by
level, running the width of the card. Reads as fullness at arm's length; reads
as nothing at all today.

### G5 — Four beats of motion, and no more

All under 400ms, all skipped under `prefers-reduced-motion`:

1. **The part lands.** A 220ms flare in the branch tone at the new part's
   position on the turret. This is the one that carries the feeling — you
   bought a thing and the machine changed in front of you.
2. **The energy rolls down** over 260ms rather than jumping.
3. **The card fills** — price block to full meter, 180ms, left to right.
4. **The shelf re-deals** — 200ms slide, the next thing arriving.

Nothing else moves. Scattered animation is how a menu reads as busy, and busy
is the complaint.

### G6 — Kill the two visual faults

- `max-height: 74%` → full height. The dimmed field behind it is not doing
  anything except taking 25% of the screen.
- The sticky ENERGY bar at 96% opacity → not sticky at all. The turret is at the
  top of the scroller and the wallet lives in the title bar, so there is nothing
  left to pin, and the ghosting goes with it.

---

## The purchase gesture

Today: one tap arms a row, a second buys, and it lapses after four seconds.
That exists for a good reason — nine hundred energy is most of an early run and
a thumb is not precise. The first plan's gate said *one tap to buy*, which
deletes a deliberate safety and calls it an improvement.

Keep two taps; make the first one worth something. **The first tap turns the
card over.** The face becomes the price, large, with a confirm across the whole
card and a cancel in the corner. Still two taps, still safe, but the second is
on a 177 x 168 target instead of a 52px box, and the state is unmistakable
because the card *changed*, not because a border changed hue.

---

## What gets deleted

- the OPEN / CLOSE labels and their chevrons
- the accordion, and the indent rails down the left
- depth 2 and depth 3 entirely
- the two-line description on every row — all 63 of them
- the DMG and FX label columns
- the grey ✓ owned state
- the 6px pip strip
- the sticky translucent ENERGY bar
- `max-height: 74%`
- every type size below 11px
- the "54 within reach" line — it becomes the shelf

---

## Phases

Reordered. The first plan put the satisfaction work in phase D, which was
backwards: it is the thing the brief actually asked for.

- **A — the room.** Full height, the turret hero, `17 OF 63`, the NEXT shelf
  with two cards, and beats 1, 2 and 4 of the motion. On its own this answers
  the whole brief: bigger, clearer, fewer things, and the machine visibly grows.
- **B — the branches.** Five meters, expand in place, the card at 177, icons at
  44, the four colours at full strength.
- **C — the polish.** The card flip, the level meters, the contrast pass, the
  sound.
- **D — the sweep.** Delete the tree, the prose, the pips, the ghosting, the
  74%.

A is the one worth doing first even if nothing else follows it.

---

## How to tell whether it worked

| | now | gate |
|---|---|---|
| screen above the first buyable thing | 305 of 664 — **46%** | **< 200 — 30%** |
| whole cards on screen without scrolling | 0 (6 rows) | **2, plus the turret** |
| text nodes in the default view | **460** | **< 60** |
| type below 11px | **150 nodes** | **0** |
| body-text contrast | **2.99:1** | **≥ 4.5:1** |
| icon size | **18px** | **44px** |
| **first screen: 0 owned vs 63 owned** | **0 differing pixels** | **the turret, the count and five meters all differ** |
| scroll to see everything owned | 3069px | one screen |
| taps to a purchase | up to 4 | **2, on one target** |
| distinct branch hues, ≥60° apart | 2 of 4 | **4 of 4** |

The pixel diff is the one to keep. It is the only gate here that measures
*progression* rather than tidiness, and it is the question the brief actually
asked: can you see what you have accomplished?

And one that cannot be measured, so it has to be asked: **open it, buy one
thing, close it. Did that feel good?** If the answer is no, none of the above
matters.

---

## The risks worth naming

1. **Flattening loses what the nesting said** — that OVERSTUFFED belongs to
   BOLT. Order and colour are the mitigation and it is what Clash Royale does
   at greater scale, but it is a real loss and it should be checked on a phone
   before the tree is deleted rather than after.

2. **The turret hero costs a canvas inside the menu**, drawn over a running
   game, on a phone. It must be a redraw-on-change plus a capped idle, not a
   60fps loop, or the best idea in this document becomes a frame-rate bug. Set
   the budget before building it, not after measuring it.

3. **`17 OF 63` invites completionism.** If a single run cannot reach 63, a
   permanent `17 OF 63` is a permanent failure state rather than a trophy. It
   may need to be per-branch, or per-run, or a smaller denominator. Flagged,
   not solved — it is a balance question, not a layout one.

4. **Two cards is fewer choices than the tree offered.** That is the intent, but
   it means the shelf's sort order is now a design decision doing real work.
   Cheapest-first is the honest default and it will bias buying toward whatever
   is cheap rather than whatever is good.
