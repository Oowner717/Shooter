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

## Phase 2 withdrawn: the rounds were already fixed, in build 166

The claim was "nine rounds read as one white streak". Two measurements, and
neither supports it.

**Each of the nine is distinct at the size it actually flies.** Rendered
offscreen at `dpr 2 x zoom 0.62` = 1.24, over the field's own ground, with the
same additive compositing `draw()` uses:

| round | ink | white% | sat | hue | declares | along/across |
|---|---|---|---|---|---|---|
| BOLT | 945 | 8 | 0.34 | 204 | 190 | 2.17 |
| SCATTER | 498 | 0 | 0.23 | 31 | 36 | 3.78 |
| HE | 2521 | 2 | 0.34 | 348 | 25 | 1.82 |
| ARC | 1773 | 2 | 0.39 | 247 | 266 | 2.21 |
| SPINE | 640 | 10 | 0.28 | 293 | 320 | 10.00 |
| SLUG | 2873 | 14 | 0.28 | 216 | 214 | 1.56 |
| RIME | 1541 | 1 | 0.48 | 203 | 195 | 3.45 |
| SPORE | 917 | 2 | 0.41 | 133 | 95 | 3.94 |
| TITHE | 1222 | 2 | 0.47 | 170 | 145 | 3.39 |

No pair is within 25 degrees of hue AND 25% of shape. The additive `lighter`
compositing does not wash them out either -- the most blown-out is SLUG at 14%,
and SLUG declares a near-white core on purpose. The shape signature spans
1.56 (SLUG, blunt) to 10.0 (SPINE, a flechette). Build 166's forms hold.

**And they do not smear together in flight.** With the whole tree bought,
firing on a held target, sampling every frame with two or more rounds actually
in the air (the muzzle excluded -- a DOUBLE TAP pair still sitting on it has
not left yet):

| round | frames sampled | median gap | overlapping |
|---|---|---|---|
| standard | 807 | 317u | 18% |
| explosive | 30 | 23u | 100% |
| shotgun | 434 | 9u | 91% |
| spine | 105 | 63u | 100% |

Read the frame counts, not the percentages. BOLT is the only round whose
cadence puts two in the air for any length of time, and its median gap is 317
units against a drawn length of 98 -- three times clear. Every other round
manages 30-105 frames out of 900, because at their cadence there is normally
one in the air; the only time two coexist is the DOUBLE TAP pair just off the
muzzle, which `config.js` designs to "read as one trigger pull with a stutter
in it rather than as a faster cadence". SCATTER's 91% is thirty-four pellets
from a shotgun.

**Two instrument mistakes on the way**, both the same shape as ever. The first
counted connected components at a threshold that admitted the faint outer glow
halo, so it reported 3 rounds making 1 blob -- touching halos are not one
streak. The second picked the frame with the MOST rounds in it, which is always
the launch instant, and reported a closest pair of 0 units: rounds stacked at
the muzzle by design. Measure the thing you are claiming, at the moment the
claim is about.

## Phase 4 landed early: the stroke floor was setting the weight (build 199)

Phase 1 measured that a body reads almost entirely as its outline -- the
brightest tenth runs 4-5:1 against the fill, which contributes 7-9%. So
whatever the outline carries is what the body says. `enemies.js` authors that:

    lineWidth = max(HAIRLINE, r * (0.062 + heavy * 0.072))

`heavy` comes off density, so the roster is authored with a line ladder across
**17.29x**. The floor deleted most of it. HAIRLINE was `1.25 / CFG.zoom` and a
world unit is `dpr * CFG.zoom` device pixels, so it drew at **1.25 * dpr** --
2.5 device pixels on a dpr-2 iPhone. Its own docstring said "not below roughly
one device pixel"; nobody had asked it what it evaluates to.

| device | floor, device px | clamped | drawn spread | distinct weights |
|---|---|---|---|---|
| dpr 1 | 1.25 | 18/37 | 4.25x | 16 |
| dpr 2 (198) | **2.50** | **18/37** | **4.25x** | **16** |
| dpr 2 (199) | 1.25 | 11/37 | 8.51x | 23 |

Eighteen of thirty-seven types were drawn at the floor. The pair that makes it
concrete: type 15 has density 6.00 and lands at `r * m.line` = 2.01, a
hundredth under the floor, so it was drawn at **exactly the same width** as
type 9 at density 0.50 -- 1.00x, identical outlines on the two ends of the
material scale. It is 1.99x now.

dpr 1 is unchanged to the digit (18/37, 4.25x, 16 weights), which is the point:
1.25 device pixels is what a low-dpr display was already getting. Only the
retina scales were over-clamped, and those are the ones the game is for.

**The fix nearly shipped dead in the artifact.** It began as `export let
HAIRLINE` reassigned by `setHairline`. `bundle.mjs` gives each module its own
scope, copies its exports into a registry object ONCE at the end of the module
body, and has each importer destructure that object -- two snapshots. In a real
ES module `export let` is a live binding; in the bundle it is the value it had
at load. Measured side by side: the module build halved the floor from dpr 1 to
dpr 2 (1.411 -> 0.706) and the bundle did not move it at all (1.411 -> 1.411).
Green suite either way, because the suite runs against the modules.

So the floor lives on `CFG` -- a property of an object nobody reassigns, which
is live through a snapshotted reference in both builds. Both now read
1.411 -> 0.706. And `bundle.mjs` fails the build on any `export let` or
`export var`, because that is a form it parses perfectly and still gets wrong,
which is worse than one it cannot parse: the bundle builds clean, boots clean,
and is quietly a different game.

**One instrument mistake here too**, and it reported the opposite of the truth
in both directions. The first version recorded the WIDEST line drawn, which is
BULWARK at 6.03 -- far above the floor at any scale, so it could not move
whatever the binding did. It read "frozen" on the live module build. The floor
only shows on a body whose own `r * m.line` lands under it; the number to
watch is the THINNEST line on the field.
