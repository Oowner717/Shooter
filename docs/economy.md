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

## Phase 1 — the number goes up

The whole point: salvage accumulates and is visible. Nothing to spend it on yet.

- `world.remainder` (name pending), and a chip in the top bar beside the count.
- Fragments carry a value set from the parent's mass at the moment they are
  made. Drift pays a small flat amount when destroyed.
- A constant slow pull on every fragment toward the turret.
- An intake radius; fragments reaching it bank and vanish.
- The corruption tax multiplies the intake rate, on the curve above.

Verify: the number climbs unattended; the tax curve measures 100/80/62/48/38/30
at zero through five attached; drift pays; a floor left alone fills to the cap
and income settles rather than stopping; hauling a crowd in with WELL banks
faster than waiting.

Risk: the pull runs over up to 128 bodies every frame. It is the same shape as
SNARE's grip, which measures at 0.02ms, so this is cheap — but it gets measured
rather than assumed.

## Phase 2 — abilities become charges

- Charges replace cooldowns: a per-ability cap, a slow regen toward that cap,
  and a use spends one.
- PULSE is exempt and stays as it is: always available, never lockable.
- Charge pips on each ability button.
- Salvage buys charges, from the menu at first.

Verify: charges bank while unattended and stop at the cap; an ability at zero
charges is unusable but recovers on its own; PULSE never runs dry and SUBTRACT
cannot take it; buying deducts and adds.

## Phase 3 — small events

- Fire on kill milestones. Persist until taken, never expire, stack without
  limit.
- Three cells, no pause, tapped or ignored.
- Contents: charges and instant effects only. Free.

Verify: several stack and can be taken in any order; nothing pauses; leaving
one untaken for a long run does not lose it.

## Phase 4 — large events and the upgrade tables

- A pending button rather than an interruption. Pressing it pauses and offers
  three, one from each axis.
- The tables live in data, the way ARSENAL does, so an upgrade is an entry.
- Effects are run-long and stack where marked repeatable.

Verify: an unattended game is never blocked; queued events survive; each axis
offers only its own; a taken upgrade measurably changes the thing it names and
survives to the boss.

## Phase 5 — the bargain, and tuning

- The third option is a trade: power now, paid for by ORDINAL arriving holding
  more. Never a loss, only a debt.
- A balance pass over the whole economy with real runs.

## Decide before phase 1

- The currency's name. REMAINDER or SALVAGE.
- Run-only or persistent across runs.
- Whether the count and salvage should ever be the same number.
