# The economy — decisions so far

Not built yet. This is the agreed shape, recorded so it survives a session.
A concrete implementation plan comes before any code.

## Standing context

- The game is expanding one step at a time. The story, the 500 count and the
  boss fight are all expected to change — the current run may end up being the
  tutorial section of a longer game. Nothing here should assume they are fixed.
- Target feel: an iOS idler. No-lose, always progressing, auto-aim and auto-fire
  doing the shooting. The player's job is choices, not survival.
- It must be possible to leave the game open all day. Progress continues while
  away; the rate is cut by whatever is stuck to the turret.

## Settled

**Ammunition stays infinite.** Rounds are never a resource.

**Abilities become charges instead of cooldowns.** Charges bank while the game
is unattended, which is strictly better for an idler than cooldowns, which
waste. Charges cap; the cap is an upgrade axis.

**PULSE is exempt.** It stays always-available and can never be locked by
ORDINAL's SUBTRACT. It is the designated get-off-me button — the answer to
anything that gets behind the turret, where the barrel cannot reach.

**Salvage is the currency.** Kills leave fragments; fragments carry value and
decay; the turret draws them in. Harmless drift pays too — income that never
touches the story counter.

**Corruption taxes income.** Every object stuck to the turret cuts the intake
rate — physically, they are sitting on the collection point. Scales across one
to five attached and floors there, so it never reaches zero:

| attached | 0 | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|---|
| intake | 100% | 80% | 62% | 48% | 38% | 30% |

`rate = max(0.30, 0.78 ** attackers)`. A clean turret earns 3.3x what a clogged
one does, which is the whole of the idle-vs-present balance.

**Small events.** Frequent, free, pick 1 of 3, no cost. Tempo rewards — charges,
instant effects. Never expire, no cap on how many stack up waiting.

**Large events.** A button appears rather than an interruption. Pressing it
pauses and shows three options. Permanent for the run. An away player is never
blocked by one.

**Three upgrade axes**, so a pick is an identity rather than a number:
AMMO (what you shoot) · FIELD (what happens without you) · TURRET (the machine).

**PULSE automation is a FIELD upgrade** — the turret clears behind itself on a
timer, bought rather than given.

## Open

- Run-only upgrades or persistent across runs. Reset is currently a clean slate
  on purpose.
- Scaling and prestige. Deferred deliberately.
- Whether large events should ever offer something aimed at the boss fight.
- Name for the currency. REMAINDER is the front-runner (fits ledger/tally/count);
  SALVAGE is the plain alternative.

## Salvage, in detail

- Fragments already exist (`world.debris`, capped at 128, 4–14 per object by
  size). They become the income, not a new entity.
- **Value** scales with the parent's mass. Drift pays a small flat amount.
- **Nothing decays.** A fragment is worth the same the moment it drops and an
  hour later. Rejected: value falling over time.
- **It just takes its time.** Fragments drift toward the turret on their own,
  slowly — slowly enough that a floor left alone is a visible backlog of
  unclaimed salvage, and fast enough that an unattended game always earns.
- **Intake**: a radius around the turret. Anything reaching it banks.
- **Active play does not earn more per kill — it earns sooner.** Every active
  verb is a way of shortening the wait: WELL hauls a crowd and its fragments
  in, SIPHON banks what it eats, mines and blasts shove debris toward you, and
  killing close drops fragments inside the radius to begin with.

This is the inverse of decay and the reason it is better. Decay punishes you
for being away. A backlog rewards you for coming back: the floor is covered in
money that is still worth exactly what it was, and sweeping it up is a lump
sum. Nothing is ever lost, which is the no-lose promise kept.

**The debris cap is the throttle.** The floor holds 128 fragments. Leave it and
it fills; a full floor means new kills leave nothing behind, so income settles
at whatever the intake drains. Clear it and the pipeline opens again.

## Sinks

1. Ability charges — buyable any time, so a banked idler always has something
   to spend on.
2. Large-event upgrades — permanent, three axes.

Small events stay free. They are the drip that makes the idle loop feel alive.

---

# Implementation plan

Five phases, each about one session. Each lands something playable and is
verified before the next starts. Nothing after phase 1 is worth building if
phase 1 does not feel good.

## Phase 1 — the number goes up — DONE, build 29

Salvage accumulates and is visible. Nothing to spend it on yet.

`world.salvage`, a chip in the top bar. A whole object's worth comes from its
mass and is split across the fragments it leaves — taken from the parent, not
from the chip, because a chip's own mass rounded every fragment in the game to
the same 1. Drift pays a flat 6. Fragments drift turret-ward and bank on
arrival, or bank whole if destroyed. Debris no longer expires.

Measured: the tax reads 1 / 0.78 / 0.608 / 0.475 / 0.37 / 0.30 across zero to
five attached and floors there. A bulwark leaves 14 fragments worth 8 each; all
14 survive 90 simulated seconds untouched; destroying one banks exactly its
worth; left alone from 600 units out, all 112 arrive in 21s with nothing lost.
Drift pays without touching the tally.

Two things the plan had wrong, both caught before they shipped: debris carried
a 22-30s expiry, which was the rejected decay hiding in the engine, and
`releasesLeft` gated the director on the kill goal, which would have stopped an
endless run dead.

## Also in build 29 — the endless run

Beating ORDINAL once is remembered the way the glossary is. Every run after it
has no five hundred, no lull, no boss and no ending — the counter loses its
denominator, the phase reads FIELD, the story beats stay put, and the director
never runs out of quota. Nothing carries over: salvage starts at zero.

## Also in build 29 — the boss substrate

Not a palette swap; the palette already eased between moods on its own. A
`dread` scalar rises over about three seconds when ORDINAL arrives and falls
over about four when it dies, and everything below is scaled by it:

- the lattice's vanishing point migrates from the sky to ORDINAL and follows it
- the rings reverse — emitted outward normally, hauled inward under dread,
  crossing through zero rather than snapping
- the glyph rain cross-fades from characters to numerals: the substrate stops
  muttering and starts counting
- three spokes turn out of the vanishing point and a ring closes on it, both
  faster the emptier its ledger gets — the background is a readout of how the
  fight is going without a word of text

## Phase 2 — abilities become charges — DONE, build 30

Every ability but PULSE holds charges instead of running a cooldown. A use
spends one; one comes back every `cooldown` seconds up to a cap; the cap is
what stops eight hours away becoming five hundred of everything.

| | FAN | LANCE | WELL | PRISM | STASIS | DECOY | SIPHON |
|---|---|---|---|---|---|---|---|
| cap | 6 | 4 | 2 | 3 | 3 | 2 | 3 |
| salvage per charge | 110 | 260 | 820 | 350 | 460 | 520 | 330 |

A run starts with one of each, so the shop has a job from the first minute.

PULSE is exempt in both directions: it keeps its cooldown, it is never a
resource, and SUBTRACT can no longer take it. It is the answer to something
sitting on the turret where the barrel cannot reach, so it has to be there.

Charges show as pips along the bottom edge of each button, in the ability's own
colour. An empty button dims rather than disappearing — it is coming back.

Buying lives in the menu's ARSENAL tab, above the ammunition. It is the one
thing in the sheet that acts rather than explains, and it is not a second copy
of anything: there is nowhere else to buy a charge, and nowhere else with room
for a price.

Measured: eight hours of unattended regen puts every ability exactly at its
cap and no higher; a use spends exactly one and zero refuses to fire but
recovers on its own; PULSE fired 40 times out of 40 and survived 200 SUBTRACT
draws that took all seven others; buying refuses when short, deducts exactly
the price, and refuses at the cap without charging for it.

Prices are a first guess against an unmeasured income. They are the first thing
to re-tune once a full run has been played.

## Phases 3 and 4 — offers — DONE, build 31

Both tiers ended up sharing one surface, which is better than the two the plan
described. Neither ever interrupts: they queue behind a button that only exists
while something is waiting, and opening it is what holds the world — a choice
the player made, not one made for them.

- **ALLOCATION**, every 40 kills — twelve in a counted run. Tempo, free:
  RESTOCK, PAIR, SPREAD, YIELD, SURGE, SEED.
- **AMENDMENT**, every 125 kills — four in a counted run. Permanent for the
  run, one option from each of AMMO, FIELD and TURRET.

Twenty-four upgrades in `src/upgrades.js`, nine/eight/seven across the axes.
Every one is a scalar on `world.up` read at the point of use; nothing in that
file reaches into a subsystem, so adding one is an entry plus one place that
reads it. The four that cannot stack are not offered twice.

Measured: 500 kills queues exactly twelve small and four large, each with three
options; sixteen stacked at once and nothing paused on its own; opening holds
the world and taking applies, closes and resumes; every one of the 24 changes
`world.up`; HOLLOWPOINT moves a bolt from 26 to 32.5; SWEEP damages something
behind the turret where the barrel cannot reach; HARD CASING hurts what is
holding on; INSULATION takes one attacker's tax from 0.78 to 0.89.

The buy menu is gone — salvage has no sink for now, deliberately.

## Phase 5 — the bargain, and tuning

- The third option is a trade: power now, paid for by ORDINAL arriving holding
  more. Never a loss, only a debt.
- A balance pass over the whole economy with real runs.

## Decided

- **SALVAGE** is the name.
- **Nothing carries over.** A reset is a clean slate: salvage to zero,
  upgrades gone.
- **The count stays for the first run**, and the first run is the only one that
  has it. Beat ORDINAL once and every run after it is endless: no five hundred,
  no lull, no boss, no ending. Just the field, the salvage and the choices.
  That makes the current run the tutorial for the game underneath it.

## How a fragment banks

A fragment carries its value from the moment it drops until the moment it is
collected. It is collected by **reaching the intake**, or by **being destroyed** —
shot, blasted, or eaten by SIPHON. It is never lost and it never expires.

Auto-aim does not target debris. That is the whole active-versus-idle gap and
it costs nothing to build: an unattended turret banks only what drifts in, and
a present player can turn the barrel on the floor and cash it instantly, at the
cost of the shots they are not putting into what is coming down.

