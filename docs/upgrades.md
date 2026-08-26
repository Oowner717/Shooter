# The upgrade menu

*A plan. Nothing here is built yet.*

The brief was: it is not satisfying, it is too busy, it is too small, it makes
you focus too hard, and you do not want to be in there. Upgrading is a major
part of this game and it should be the part you look forward to.

## What is actually wrong, measured

Opened on a 390-wide phone, the UPGRADES panel contains:

| | now | what it should be |
|---|---|---|
| separate pieces of text | **460** | under 80 |
| text nodes at 10px or smaller | **434 of 460** | 0 |
| text nodes at 8.5px or smaller | **150** | 0 |
| scroll height | **3069px — 5.6 screens** | first purchase on screen 1 |
| taps from opening to a purchase | **up to 4** | 1 |
| levels of nesting | 3 (branch → arm → leaf) | 1 |
| buyable things | 63, in a 94-node tree | 63, in a flat grid |

Four hundred and sixty pieces of text. Every row carries a title, a two-line
sentence, one or two stat labels, a level pip strip, an icon and a price, and
they are all roughly the same weight — so there is nothing to scan and the eye
has to read. **The smallest type in there is 5.5px.** Apple's own floor is 11.

The tree is the root of it. It is a data structure that has been made visible:
OPEN and CLOSE on every branch, indent rules down the left, and a thing you
want three levels below a thing you do not. That shape is right for a file
browser and wrong for a shop, because a shop's job is not to show you what
exists — it is to show you **what you can buy right now.**

And nothing in there tells you what you have built. You cannot see the turret
from inside the menu that upgrades it.

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
| idle games | one flat ladder of buy rows | 1 | ~8 | name + price + count |

Two things they all share, and neither is a matter of taste:

1. **Nobody browses a catalogue.** The most satisfying upgrade screens in
   mobile games show **three to twelve things** and ask for **nought to two
   taps**. Not one of them opens on a directory.
2. **Where there IS a big catalogue, it is a flat grid of equal tiles.** Clash
   Royale has over a hundred cards and shows them as one uniform grid sorted by
   what you can act on. It never draws the hierarchy it certainly has.

And the thing they never do: put a paragraph on a row you are meant to scan.

**This game already owns the good pattern.** ALLOCATION — three offered, one
taken — is a Vampire Survivors draft, and it is the part of the upgrade system
that already works. The tree is the second, browsing-based path, and it is the
one carrying all sixty-three items and all the unpleasantness.

## The principle

> **The default view answers "what can I buy right now", not "what exists".**

Everything below follows from that one sentence.

## The design

### 1. THE COUNTER — what opens when you press UPGRADES

- **The turret, live, at the top.** About 120px tall, drawn with your actual
  rig, from the same code the field uses. It is the thing you are building, so
  it is the first thing in the room. Buy a turret part and it appears in front
  of you rather than behind a closed menu. This is the single strongest move
  available and the machine to do it with already exists.
- **One number**: ENERGY, large. And beside the turret, one figure that only
  ever goes up — call it OUTPUT — derived honestly from the multipliers you
  own. A thing to grow.
- **AFFORDABLE NOW**: a two-up grid of big tiles, capped at eight, cheapest
  first. Nothing else. If you can afford nothing, one tile shows the cheapest
  thing there is and how far off you are.
- A **MORE** tile at the end is the only route to the catalogue.

That is the whole screen. No branches, no chevrons, no prose.

### 2. THE TILE — one item, at a glance

About 170 x 150. In order of weight:

- **icon**, 44px, in the branch's colour
- **NAME**, 17px — the size a name is on a Clash Royale card
- **one stat**, 13px: `+12% DMG`, `×2 uses`, `2 → 3`. A number, never a
  sentence
- **level pips** if it has levels
- **price**, 20px, as the tile's own footer and its own tap target

Owned items keep their tile and show their pips. Unaffordable items stay full
size and go dim — greying is legible, hiding is not.

### 3. THE CATALOGUE — where the tree used to be

- Six **branch chips** across the top as a segmented control: TURRET, AMMO,
  MINES, ABILITIES, ANOMALY, RECAST. Each carries its own count, `4/7`.
- Below, a **flat grid** of that branch's items. Sixty-three items across six
  branches is about ten each — one screenful, no nesting, no scrolling to find
  the start.
- A round's mods keep their relationship by **order and colour**: the round's
  tile, then its mods, tagged with its icon. Adjacency says what indentation
  used to, and costs nothing.

### 4. THE DETAIL — where all the prose goes

Tap a tile's body rather than its price and a sheet comes up: big icon, the
name, the full sentence, the real numbers, the pips, and one large BUY. Every
paragraph currently on the counter lives here instead, and you only meet it
when you have asked.

## The satisfaction layer

The brief was that buying should feel like something. Six things, in the order
they are worth doing:

1. **The turret gains the part in front of you.** Already possible.
2. **The energy number counts down rather than jumping.** A quarter of a second
   of ticking is most of the feeling.
3. **The tile turns over**: price → a check, a flash in the branch colour, a
   short shake, a sound. One beat, not an animation to sit through.
4. **The counter re-sorts and the next thing slides in.** You see what you can
   afford next without navigating. That is the whole hook.
5. **OUTPUT goes up, visibly**, with the delta shown for a moment: `+4%`.
6. **Branch chips fill.** `4/7` becoming `5/7` is a small, cheap, real reward.

## What gets deleted

Every one of these is currently on screen and none of them survives:

- the OPEN / CLOSE labels and their chevrons
- the accordion itself, and the indent rules down the left
- the DMG and FX label columns on every row
- the two-line description on every row — 63 of them
- the "48 within reach" line, which becomes a count on the MORE tile
- every type size below 12px

## Phases

- **A — the counter.** The turret, ENERGY, and the affordable grid. Self
  contained, and on its own it answers most of the brief.
- **B — the catalogue.** Branch chips and the flat grid. The tree comes out.
- **C — the detail sheet.** The prose moves.
- **D — the satisfaction layer.** The six above.

A is the one worth doing first even if nothing else follows it.

## How to tell whether it worked

The same way everything else here is decided — a probe opens the menu and
counts. These are the gates:

| | now | gate |
|---|---|---|
| text nodes in the default panel | 460 | **< 80** |
| type smaller than 12px | 150 nodes | **0** |
| taps from opening to a purchase | up to 4 | **1** |
| scroll before the first affordable thing | up to 5.6 screens | **0** |
| item name size | 10px | **17px** |
| touch target for a price | 348 x 51 | keep ≥ 44 tall |

And one that cannot be measured, so it has to be asked directly: **open it,
buy one thing, close it. Did that feel good?** If the answer is no, none of
the numbers above matter.

## The risk worth naming

Flattening loses what the nesting said: that OVERSTUFFED belongs to BOLT. The
mitigation is order and colour rather than indentation, and it is what Clash
Royale does with a much larger catalogue — but it is a real loss and it should
be checked on a real phone before the tree is deleted rather than after.
