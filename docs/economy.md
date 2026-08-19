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
rate. Physically: they are sitting on the collection point. Never reaches zero.

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
- **Decay**: value falls over a fragment's life, so income rewards killing near
  the turret without punishing anyone who is away.
- **Intake**: an always-on radius around the turret. Upgradeable — radius, pull,
  decay resistance.
- **Idle floor, active ceiling.** Away: auto-aim kills, fragments fall inside the
  radius sometimes, drift trickles in. Present: kill close, use WELL to haul a
  crowd onto the intake, use SIPHON — which already eats debris and now has to
  choose between eating it and banking it.

## Sinks

1. Ability charges — buyable any time, so a banked idler always has something
   to spend on.
2. Large-event upgrades — permanent, three axes.

Small events stay free. They are the drip that makes the idle loop feel alive.
