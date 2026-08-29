# Visuals — what has been measured

Notes for the five-phase visual pass. Everything here is measured; where a
thing was believed and then disproved, both are kept, because the wrong
belief is what the next person will arrive with too.

## The field is evenly lit, not hollow

**Phase 1 was withdrawn. Its premise was wrong.**

The claim was that the composition has a hole in the middle — bodies cluster
at the top, the turret sits at the bottom, and half the screen is empty
gradient. It was judged off one synthetic screenshot: a static spawn of
twenty bodies, dropped in a clump, with nothing shooting and nothing dying.
That is not a picture the game ever produces.

Measured properly, over **29 real play screenshots** from a phone, sampling
the field only (below the top furniture, above the strip) in twelve bands and
counting pixels meaningfully brighter than the substrate:

| band | % lit | | band | % lit |
|---|---|---|---|---|
| 1 (top) | 4.2 | | 7 | 7.6 |
| 2 | 4.9 | | 8 | 7.5 |
| 3 | 7.3 | | 9 | 8.2 |
| 4 | 7.4 | | 10 | 6.0 |
| 5 | 7.1 | | 11 | 7.6 |
| 6 | 6.8 | | 12 (turret) | 4.8 |

Top third **6.5%**, middle **7.2%**, just above the turret **6.1%**. The
middle is not emptier than anywhere else — it is marginally *busier*. There
is no hole to fill, and filling one would have made an already uniform screen
more uniform.

## What is true instead: no hierarchy, and it is drawn in outlines

Two things came out of that measurement and its follow-ups.

**The field is uniformly sparse.** Around 7% of it carries anything at any
moment, everywhere, with no peak. Nothing draws the eye, because nothing on
screen is louder than anything else.

**A body reads almost entirely as its outline.** Sampling one body's own
pixels against the substrate beside it, the brightest tenth — the edge — sits
at **4.0–5.0:1** contrast at every distance from the turret, while the fill
contributes so little that removing 45% of it moved the whole body by 7–9%,
inside the noise of the measurement. The game is drawn in line, not in mass.

## Depth by distance was tried and does not work

Brightness falling with distance from the turret was the obvious way to build
hierarchy. Three versions were measured and none of them earned its place:

- **Fill and glow dimmed, outline held.** Worth ×0.91–0.93 on a distant body.
  Too small to see, and inside the run-to-run noise of the instrument.
- **Outline dimmed too.** Builds a visible hierarchy and costs identification:
  a distant LURCHER's contrast against the substrate goes 2.6:1 → **2.1:1**,
  under the 3:1 that non-text contrast is usually held to.
- **Outline weight falling with distance** rather than its alpha. The
  instrument could not resolve it at all: the sampled region grows with
  distance and is dominated by glow and background, so pixel counts moved the
  wrong way.

All of it was reverted. It is recorded because the next attempt at depth
should start from *the fill is nearly invisible* rather than rediscover it.

## Two instrument traps, both of which passed a broken build

Worth knowing before measuring anything on this canvas.

**Peak luminance is not brightness.** A max over a region is decided by
whichever pixel saturated, which for a large body is the additive glow core,
and it does not move when the alpha under it does. Measured with the lighting
on and off, peak said a BULWARK was 0.70 of itself at distance and 0.71 —
a statistic that could not see the thing it was pointed at.

**A body is already dimmer at distance with flat lighting** — 0.67 of its
near brightness — because the substrate darkens with height. So any threshold
loose enough to pass with the lighting on was loose enough to pass with it
off. A case asserting "the far one is dimmer" passed a build with the feature
switched off, twice, for those two different reasons. There is no threshold
that separates them: a case here has to A/B the feature against itself.

## Frames

`smoke.mjs` reports 31–45 fps run to run on the same build in this
environment, so **fps here cannot resolve anything smaller than about a third**.
The reliable signal is the quality governor: it sits pinned at `q 0.45` on a
busy field, and since `game.js` multiplies the device pixel ratio by it, the
whole game renders at 45% resolution and is upscaled. That, rather than any
effect, is the largest thing standing between this game and how it could
look.

## Phase 1: the governor was a one-way ratchet (build 198)

The note above was half right. `q 0.45` on a busy field is real and the whole
game does render at reduced resolution because of it — but the reason was not
that the device is slow. **The governor was fed the frame INTERVAL and judged
it against absolute milliseconds: drop above 20.5, recover below 13.5.** A
vsync-locked 60Hz display cannot produce an interval under 16.67ms, so on the
phone this game is for, the recovery door was one that never opened.

Six timing models, each a device state the game actually meets, driven through
`trackFrame` directly — synthetic because a headless software rasteriser has
no vsync and no GPU and cannot produce any of them:

| timing model | build 197 | build 198 | should be |
|---|---|---|---|
| 60Hz, healthy | 1.00 | 1.00 | 1.00 |
| 60Hz, one stall, then healthy | **0.70** | 1.00 | 1.00 |
| 120Hz, one stall, then healthy | 1.00 | 1.00 | 1.00 |
| 30Hz low-power, no stall | **0.45** | 1.00 | 1.00 |
| 60Hz, GPU-bound (misses every other vsync) | 0.45 | 0.45 | 0.45 |
| 60Hz, CPU-bound (uniformly 33ms of work) | 0.45 | 0.45 | 0.45 |

Two findings the table makes plain and nothing else could:

**A 120Hz iPhone recovered and a 60Hz one did not.** Same stall, same game,
opposite outcome — which is the threshold testing the refresh rate rather
than the performance. One transient stall pinned a 60Hz phone at reduced
resolution until iOS evicted the app.

**Rows 4 and 6 have IDENTICAL interval sequences** — 33.3ms throughout — and
differ only in what the game spent inside them. Build 197 answers both with
0.45 because from the interval alone they cannot be told apart, and one of
them is a player who turned on low-power mode and got their game quietly
halved for it. Build 198 answers 1.00 and 0.45.

So the interval is judged against the display's own cadence now — the tenth
percentile of the window, because the fastest frames are the ones that landed
on a vsync, and a percentile rather than the outright minimum keeps one
spurious back-to-back callback from declaring a 500Hz display — and work is
measured alongside it. Both are needed, and the last two rows are why:
canvas calls are queued rather than executed, so a GPU-bound frame returns
from `draw()` in a millisecond and still misses its vsync, which only the
interval sees; while a uniformly half-rate game is invisible to the interval
and only the work separates it from a 30Hz display.

**The residual hole, stated rather than papered over.** A game that is
uniformly GPU-bound at exactly half rate is still indistinguishable from a
30Hz display: identical intervals, low work in both. Closing it needs a
baseline cadence latched from startup, and a latched baseline that ever
latches wrong is a false degradation with no way back — the exact bug class
being removed here. The work clause catches the CPU-bound form, which for a
game drawn in hairlines and a few hundred particles is the likelier one.

**What was not calibrated, and why.** The first plan was to feed the governor
work alone and set thresholds from measured work. That was dropped: headless
software raster reports ~10ms of `draw()` for an *empty* field, which is the
rasteriser and not any phone's GPU. Thresholds picked from that number would
have been picked from the wrong instrument. The ratio against the device's
own cadence needs no device measurement, which is why it is the design.

`smoke.mjs` now prints `work` beside `q` in the debug stats, and the deep
field reads `q 0.45  work 24.2ms` here — the work clause firing correctly,
because this environment genuinely cannot render that field in a 60Hz budget.
