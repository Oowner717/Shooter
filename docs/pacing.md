# The three clocks

Wave pacing, damage pacing, energy pacing — one plan each, written to lock
together. Nothing here is implemented; this is the document to argue with.

## What is true today (measured, build 176)

| fact | number | instrument |
|---|---|---|
| BOLT, stock | 3.4 rounds/s | 10 driven seconds against a dummy |
| BOLT, FEED×2 + TRIPLE TAP | 16.2 rounds/s | same |
| ...plus HOT LOAD | **18.2 rounds/s (5.4× stock)** | same |
| tree, bought out | 119,451 energy, 84 buyables | tree walk |
| prices | arms 900 · abilities 1100 · charges 1400 · leaves 500 + 350/level | COST table |
| income, assist floor | ~30–60 energy/min early | 300s driven stock run |
| wave order | **shuffled** — no difficulty direction after the opening 8 | Director.shuffle |
| wave growth | authored size × swell(1→2.4 over 320 kills) × 1.3 | CFG.waves |
| run arc | 500 releases, then endless = unbounded quota | releasesLeft |
| pressure signal A | director.wait — hit its 26s patience cap even in a stock run | the 300s run |
| pressure signal B | contact-seconds — attackers on the turret, already tracked per frame | same |

Two design facts fall out. First, the game currently has **no ladder**: past
the opening, waves arrive in arbitrary order and difficulty only moves via the
swell, which is a slow global volume knob, not a step anyone can stand on.
Second, the game **already measures being overwhelmed** — a player who is
keeping up clears the field before the director's patience runs out and keeps
things off the mount; a player who is drowning trips both instruments. Turret
health is not needed. The failure signal exists; nothing reads it.

---

## Plan A — waves: the ladder

**Replace the shuffled rotation with numbered TIERS.** A tier is a recipe, not
a list: a *band* of authored wave shapes it may draw from, plus multipliers.

```
tier n:
  shapes      band(n) — the 25 authored waves, banded 1..5 by menace
              (1: mote/needle/drift · 2: +lurcher/splitter · 3: +bloom/warden/
               plate · 4: +herald/glut/scion · 5: +tow/bulwark), tier draws
              from its band and one band below
  population  authored × (1 + 0.10·n)      — replaces the kills-driven swell
  health      type hp × (1 + 0.06·n)       — the damage-pacing knob, see B
  bounty      energy × (1 + 0.15·n)        — the energy-pacing knob, see C
```

Unbounded n. Every run finds its wall — that is the point.

**The player's hand.** The FIELD chip in the top bar becomes the tier chip:
`TIER 7` with a small hold toggle. Auto-advance is the default — clear a
tier's wave cleanly and the next wave is tier n+1. HOLD pins the tier; two
taps on the chip open a one-row control: `‹ back · HOLD · auto ›`. No new
screen, no pause.

**Auto step-back — the part with no health bar.** A wave is scored when it
ends, from the two instruments that already run:

```
failed(wave) =
     contact-seconds during it ≥ 6        (things reached you and sat there)
  or director.wait hit patience           (the field never thinned)
  or alive-at-end ≥ 60% of asked          (the wave out-lived its welcome)
```

One failed wave: nothing — a bad wave is allowed. **Two consecutive: step back
one tier**, announced in the alert language the game already has (`THE FIELD
RELENTS · TIER 6`). Hysteresis on the way back up: one *clean* wave at the
lower tier re-opens auto-advance. This is the same shape as the aim assist's
target memory — commit, don't flap.

**What survives.** Kill-gated unlocks, boss apertures and the codex are
untouched — the ladder replaces the released-500 arc and the swell, nothing
else. The opening 8 teach-waves stay exactly as authored, as tier 0.

## Plan B — damage pacing

**The nerf first.** Max cadence is 5.4× stock, and it is three multipliers
stacking: FEED×2 (0.64), HOT LOAD (0.85), TAPs (×3 rounds). Options, with the
measured result of each:

| option | change | max BOLT rps | notes |
|---|---|---|---|
| B1 (recommended) | FEED 2 levels → 1 | 18.2 → **14.6** | your "remove one level"; trims every round's cadence, not just BOLT |
| B2 | FEED per-level 0.8 → 0.88 | 18.2 → 15.1 | gentler, keeps two purchases |
| B3 | + tapFade 0.6 → 0.5 | damage −8% on taps | BOLT-specific, stacks with B1 or B2 |

B1 + B3: max BOLT lands at ~3.9× stock in rounds and ~3.3× in damage. The
tree loses one 850-energy purchase (prices in C absorb it).

**Then the actual pacing.** Damage pacing = **time-to-kill bands per tier**.
The target: a body from tier n's own band, under focused fire from a turret
that has spent what tier n expects (see C), dies in **2–4 seconds**; the wall
is where that band breaks upward by design.

```
P(n) = expected player DPS at tier n   — from expected spend, measured by probe
D(n) = band hp × (1 + 0.06·n)          — the tier health multiplier
TTK(n) = D(n) / P(n)                   — hold in [2, 4] through ~tier 10,
                                          let it pass 6 by ~tier 14: the wall
```

The 0.06 hp slope is the tuned number, not a guess to keep: a new probe
(`scripts/tiers.mjs`, the fourth sibling of fight/dps/variance) drives a
scripted loadout against each tier band and prints the TTK table. We tune the
slope until the table reads 2–4–wall. That probe is also the regression
instrument afterwards — the ladder's ORDINAL hash.

## Plan C — energy pacing

**Keep the price table. Move the income.** Repricing 84 items invites a month
of debate; one income knob does the same work. Prices stay (arms 900, leaves
500+350), and the tier bounty multiplier `×(1 + 0.15·n)` becomes the way a
run funds itself: pushing the ladder pays, holding pays steadily, stepping
back visibly costs income rather than progress.

**The targets** (what "an expected spend at tier n" means in plan B):

| by end of | expected bank earned | buys roughly |
|---|---|---|
| tier 2 | ~1,000 | first arm, or two turret leaves |
| tier 5 | ~5,000 | a loadout: 2–3 arms, first FEED, a damage leaf |
| tier 8 | ~15,000 | an ability + charge, half the turret rig |
| tier 12 | ~40,000 | most of one full branch — the wall region |
| full tree | 119k | aspirational; many runs, by design |

The 0.15 bounty slope is tuned against those rows with the same tiers.mjs
probe (it already counts income while it measures TTK). One probe, both dials.

**One price change worth making anyway:** the three-step ways-in (APERTURE
chain) and arms are priced flat regardless of when they become reachable.
Leave them — but FEED's removed level (B1) refunds 850 of expected spend, so
the tier-5 row assumes it.

---

## How the three lock

```
tier n ──population──▶ wave pressure ──contact-s / patience──▶ step-back
   │                                                              ▲
   ├───hp ×(1+0.06n)──▶ TTK band [2..4] ◀── P(n) = DPS(spend) ────┤ the wall:
   └───bounty ×(1+0.15n)──▶ income ──▶ spend ──▶ P(n)             │ D outruns P
                                                                  ▶ by design
```

Income buys damage; damage holds TTK against the tier's health; the tier's
population sets pressure; pressure trips the step-back when damage has fallen
behind — which is exactly when income has fallen behind too, so the ladder
self-corrects at the same point all three clocks agree on.

## Open questions before implementation

1. **Tier chip vs menu control** — plan says the FIELD chip becomes the tier
   control. Acceptable, or should hold/back live in the menu?
2. **Announced step-back** — `THE FIELD RELENTS` alert, or silent?
3. **Fail thresholds** — 6 contact-seconds / patience / 60% alive are opening
   bids for the tiers.mjs probe to calibrate, not convictions.
4. **Nerf choice** — B1+B3 recommended; B2+B3 if removing a purchase feels
   worse than weakening one.
5. **Does the 500-release arc die?** The ladder replaces it as the run's
   spine. Kills still gate unlocks and apertures. Confirm.
6. **Save shape** — tier, hold state, and fail streak all have to survive an
   app update; the save gains three fields.

## Probe caveats

Income was measured on the assist floor (no PULSE pressed, no aiming), and
that run spent 170 of its 300 seconds with a body parked on the turret taxing
the intake — real-player income is meaningfully higher. The 18.2 rps figure
is rounds, not damage: taps fade 40% per echo, so damage scales ~4.4× where
rounds scale 5.4×. Both numbers are good enough to rank options, not to be
quoted as balance truth.
