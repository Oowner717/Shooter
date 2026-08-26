# Making the seven fights worth watching — plan

All seven bosses are built and none of them has been looked at as a *thing on
a screen*. This is that review, and the plan that comes out of it. Not built
yet; each phase below is one build-sized request.

Scope, as asked: little effort on story text, little on balance beyond
**every fight being the same length**, and every proposal has to say how it
adds *time* — because the other half of the ask is that these fights get
longer, and longer has to come from content rather than from health bars.

## Where they are now

Measured with `scripts/fight.mjs`, assists only, nothing bought.

| | boss | length | stages I/II/III/IV |
|---|---|---|---|
| I | ORDINAL | 220s | 16 / 22 / 24 / 25 |
| II | GNOMON | 198s | 16 / 34 / 15 / 21 |
| III | FRACTAL | 207s | 15 / 30 / 20 / 21 |
| IV | AMPLITUDE | 203s | 28 / 27 / 16 / 15 |
| V | DYNAMO | 249s | 27 / 10 / 22 / 30 |
| VI | PARITY | 237s | 33 / 23 / 17 / 15 |
| VII | TERMINUS | 419s | 22 / 17 / 15 / 37 |

I–VI span 198–249s, a 25% spread. **Target: I–VI at 290 ± 15s, VII at
430 ± 20s.**

### Where they are after build 137

The assist gained memory in Phase A, which raised effective damage and moved
every one of these. Re-measured, one run each:

| boss | 136 | 137 | |
|---|---|---|---|
| I ORDINAL | 220s | **174s** | −21% |
| II GNOMON | 198s | **215s** | +8% |
| III FRACTAL | 207s | **189s** | −9% |
| IV AMPLITUDE | 203s | **219s** | +8% |
| V DYNAMO | 249s | **222s** | −11% |
| VI PARITY | 237s | **226s** | −5% |
| VII TERMINUS | 419s | **377s** | −10% |

The spread tightened (174–226 against 198–249) and the mean fell about 8%, so
the length job is bigger than it was and the consistency job is smaller.

### How length actually works — the first draft of this plan had it wrong

That draft costed every proposal as "+40s for a new phase, +10s for a
setpiece, +25s for a re-form" and totted them up. **The first of those is
zero.** Length here is

> destructible health ÷ effective damage, plus whatever holds the fight

and a new stage does not add health — it re-partitions the health that was
already there. Measured across five threshold experiments on TERMINUS during
build 136, the stage split moved from 25/15/34/17 to 21/15/31/24 while the
total stayed between 407 and 430 seconds every time. Thresholds move time
between stages; they never create it.

The honest arithmetic:

- **A new phase: +0s.** It buys interest, not length. Worth doing for its own
  sake, never counted toward the target.
- **A setpiece: + its own duration.** A held beat is dead time and dead time
  is real time. 7–10s each.
- **A re-form at 40%: + 0.4 × structure health ÷ measured damage per second.**
  The only large lever. Worked example, measured: TERMINUS resurrects 44
  segments at 0.35 of a 260 bar — 4004 health — against about 65 damage a
  second, and its stage IV went from roughly 70 seconds to 132.
- **Raising effective damage: −5 to −21%,** as the table above shows. Every
  aim fix pays for itself in feel and charges for it in length.

So the target is reached by **re-forms and setpieces**, and every per-boss
number below is derived from that rather than asserted.

## What the probe found — the aim cone, and what it costs

`scripts/dps.mjs` was built to answer the DYNAMO question below and answered a
much larger one. It measures what happens *between* the turret deciding to
shoot and a body losing health, which is where three things live that no
damage table can see:

- **The cone.** `Game.autoTarget` only considers bodies within
  `CFG.shooter.aimClamp` — 1.36 radians, **78° either side of straight up**.
  Anything further round than that is not a target however near it is.
- **The slew.** Auto aim traverses at `autoTurnRate` 4.2 rad/s. A quarter turn
  takes most of a second.
- **The mid-sweep shot.** With auto fire on, the cadence does *not* wait for
  the barrel — `updateFiring` only holds fire on `aimError` when auto fire is
  **off**. Every shot taken during a slew is fired at where the last target
  was.

Measured, one run each. `shots/s` is a flat 3.3 in every stage of every
fight — so every difference below is *where the shots went*, not how many
there were.

| | stage IV: dmg/shot | mid-sweep shots | target switches/s | nearest body in cone |
|---|---|---|---|---|
| I ORDINAL | 17.2 | 54% | 1.5 | 21% |
| II GNOMON | 14.6 | 58% | 1.3 | 3% |
| III FRACTAL | 10.7 | 36% | **4.7** | 13% |
| IV AMPLITUDE | 14.0 | 44% | **5.3** | 0% |
| V DYNAMO | 8.2 | 21% | 0.3 | 5% |
| VI PARITY | 22.4 | 19% | 0.4 | 78% |
| VII TERMINUS | 18.9 | 37% | **15.4** | 8% |

Against 20–33 damage per shot in the early stages of every fight. Three things
fall out of it:

**Every fight goes half-blind in its last stage.** Stage IV is where bosses
come close and orbit, which puts them at high angular velocity and often past
the turret's shoulder. DYNAMO's propeller spends **52% of stage IV with no
legal target on the field at all** — the finale is unshootable for half its
length. GNOMON's stage IV has its nearest body inside the cone 3% of the time.
This is the same finding as "the last stage is the emptiest" seen from the
other side, and it is worse: the finale is not merely sparse, it is often not
aimable.

**TERMINUS changes target forty-five times a second in stage I.** Thirty-two
segments at *exactly* the same distance means the nearest one flips on
floating-point noise every frame, so the barrel never settles and **74% of its
shots are fired mid-sweep**. The "every segment is the same distance" property
the whole fight is built on is actively pathological for the assist. FRACTAL's
divided core and AMPLITUDE's wave do a smaller version of the same thing.

**AMPLITUDE's nearest body is inside the cone 0% of the time** in stages II,
III and IV, with 24–44% of frames having nothing legal to shoot. A wide wave
puts its ends past the shoulder. This is why that fight feels like nothing is
happening: often nothing is.

### The fix this implies, and its gate

`autoTarget` picks strictly by score with no memory. **Give it hysteresis** —
the current target keeps its lock unless something beats it by a margin — and
TERMINUS's forty-five switches a second become nearly none. Five lines in one
function.

It is also a change to how the whole game aims rather than to a boss, so it
does not ship on a hunch: `dps.mjs` and `fight.mjs` across all seven before and
after, plus a wave-clearing run. It goes in Phase A and gets measured like a
fight.

The cone itself should probably stay — it is what the reach upgrades sell
against, and widening it is a balance change to the whole game. What can change
is the *bosses*. A fight that ends up behind your shoulder is a fight that made
a geometry mistake, and there is now a number for it.

## Six things wrong with all of them

These came out of screenshotting every fight at stage II and stage IV. They
are worth fixing once, centrally, rather than seven times.

**1. Every fight's last stage is its emptiest.** At stage IV: ORDINAL has 2
of 40 panels standing, GNOMON 0 of 16 arcs, FRACTAL 0 orbit, AMPLITUDE 4 of
14 segments, PARITY one crescent and no mirror. The structure *is* the boss —
the frames, the dial, the wave, the mirror — and it is consumed exactly when
the fight is supposed to peak. Every finale is a single glowing object over
an empty field. TERMINUS solved this in build 136 by resurrecting its
boundary for the last stage; the same move works for all seven.

**2. Every fight has exactly one setpiece and it lands at the midpoint.**
NOON, RECURSION, RESONANCE, SURGE, MERGE, ECLIPSE. So the back half of every
fight has no beat of its own, which is precisely the complaint TERMINUS got.

**3. Nothing in any fight moves the camera or touches the field.** The
background has `setFocus`, `setDread`, `surge` and moods, and that is the
whole vocabulary. No fight rolls, zooms, inverts or stops the world. The one
exception is TERMINUS's dawn sky, which is the most-remarked thing in the
game and is four hex values.

**4. Six of seven minions are "spawn, then fly at the turret."** Only
DYNAMO's IONs have a delivery — they ride a visible arc between pylons and
drop off it, and it is the only minion in the game that tells you where it
will be before it is there.

**5. All seven arrivals are the same shape** — hole opens, parts unfold in
index order, four captions. TERMINUS has six captions and the same shape.

**6. All seven deaths are the same four beats** — arrest, infall, detonate,
remainder. PARITY restores its panes first and TERMINUS changes the sky;
otherwise they are interchangeable.

## Phase A — the shared machinery · **shipped, build 137**

Everything in Phase B is cheaper because these exist. Two of them change every
fight on their own, which is why this shipped as its own build rather than
riding along with ORDINAL.

- ✅ **`Boss.reform(world, frac, opts)`** — resurrects this boss's dead parts
  at `frac` of a bar, in list order, staggered across a `sweep` so they come
  back as a wave rather than all at once. TERMINUS's `lastClose` is three
  lines now. The fix for finding 1, and the only lever in the plan that
  reliably makes a fight longer.
- **`Boss.beat(world, name, seconds, step)`** — the setpiece harness: holds
  the stage ladder, owns the caption, runs `step(k)` from 0 to 1, returns
  true on the last frame. Every existing setpiece is hand-rolled; with this
  a second one per boss is ~20 lines instead of ~60.
- ✅ **`Boss.drawGhosts(ctx, colour, alpha)`** — outlines a boss's *dead*
  parts where they would be, so a structure with holes in it still reads as a
  structure. TERMINUS draws them for the whole fight now, not only during
  ECLIPSE. One caveat for Phase B: it only works for a boss that keeps
  *placing* its dead parts. TERMINUS does that deliberately; the others will
  each need a line in `place()`.
- ⏸ **Camera verbs on `background`** — `roll(rad)`, `zoom(k)`, `invert(t)`.
  Deferred to the builds that need them: GNOMON wants `roll`, FRACTAL wants
  `zoom`. Writing them now would be three functions against no caller.
- ✅ **`Boss.hold(world, secs)`** — a held breath: dilation and quiet so a
  beat lands. The engine already had the mechanism and nothing but the death
  sequence had ever used it. TERMINUS holds 0.45s on every stage change.
- ⏸ **Per-boss arrival verbs** — deferred for the same reason. The hook is
  trivial; everything it is worth is in the seven overrides.
- ✅ **Target hysteresis in `autoTarget`** (`CFG.shooter.aimStick` 1.15) — the
  current target keeps its lock unless something beats it by 15%. Measured:
  **TERMINUS's stage I went from 45.5 target changes a second to 0.3, and from
  74% of its shots fired mid-sweep to 12%.**

  It shipped with a bug worth remembering. `!held.dead` is not the test for
  "still shootable": ORDINAL's garrison, DYNAMO's core, PARITY's phased
  crescent and TERMINUS's second ring are all hidden by splicing them out of
  `world.enemies` and leaving them alive, so a target that had just phased kept
  the lock. Measured with it wrong, PARITY ran 19% longer with the assist
  holding a reflection. Two regress cases cover it now.

## Phase B — one build per boss

Each is: **one new phase** (the interest), **one second setpiece** (the back
half), **one re-form** (the length), **one draw upgrade** (the screenshot).

**Order: III, II, IV, I, VI, V, VII** — biggest visual win per unit of work
first. FRACTAL leads because its whole idea is invisible and the fix is one
drawing function; DYNAMO is late because it is the one with a known length
risk; TERMINUS is last because it has had two builds already.

**Shipped: III (138), II (139), IV (140), I (141). Left: VI, V, VII.** Four
of four have come in short of the 290s target — 249, 246, 241, 221 — which is
not four misses, it is the target being wrong. See Phase C.

### What "done" means, per boss

Three gates, all of them measurable, checked before the build is called
finished:

1. **A stage IV screenshot that could not be any other boss.** The structure
   is on screen, in its own colour, doing its own thing. This is the whole
   point and it is the one the eye checks in a second.
2. **`dps.mjs` shows no type past the shoulder** — nothing mandatory legal to
   shoot less than half the time it is on the field — and no stage above 20%
   blind or above 2 target switches a second.
3. **`fight.mjs` inside 290 ± 15s** (430 ± 20 for TERMINUS), three runs, with
   no stage below 15% or above 35%.

### What must not break

The standing gate for every build in this plan: the regress suite green,
ORDINAL's seeded hash reproducible within the build (it may *change*, but it
must be recorded when it does), `check-build --stamp` run last, and a
`smoke.mjs` walk with zero console errors. Every one of those has caught
something at least once.

---

### I — ORDINAL · magenta · the counter · **shipped, build 141**

**As built: 221s (from 174), stages 14/27/21/27.** No type past the shoulder,
and **stage IV's blind frames went from 20% to 5%** — the gate boundary to
clear of it. Canonical hash re-baselined to `917805618`.

What shipped, and what it cost:

- **TALLY (III→IV).** The setpiece the back half did not have. The count
  stops, the ghosts of every panel you broke light in slot order at an
  accelerating tick — a till printing a receipt — and then the frames re-form
  at full health. It is the only thing in this build that adds time, and it
  adds most of the 47 seconds: a stage re-partitions health the boss already
  had, so `repairCap` 0.45 → 0.75 and `convergeRebuild` 0.8 → 1 did the rest.
  Gated on `frac <= tallyAt` (0.34), fires once, and is abandoned outright if
  the core dies mid-count — that guard is not cosmetic, it is what stops the
  receipt sitting between ORDINAL and its own death.
- **The number, but one of them.** The plan said "number the panels", and a
  first pass did exactly that: forty small numerals over forty slabs that
  already carry tick marks. At phone scale it was clutter, not information,
  and none of it was legible in a screenshot. What shipped is **one large
  count at the core** — the thing that is doing the counting — over a disc of
  the arena's own dark so it reads against the dial's ticks, plus **the index
  of each panel you have taken, drawn in the gap it left**. The frame becomes
  a receipt rather than a wall with bites out of it, and the figure moves
  every time you take a panel and climbs back during TALLY.
- **Not shipped: ALIGNMENT.** +40s of counter-rotating frames, still the best
  idea in this section, and no longer needed for length. Deferred whole.
- **Not shipped: death in counting order.** Cosmetic, and the arrest is
  already the strongest death of the seven.

Three regress cases came out of it: the ladder cannot skip TALLY, the count
it reads back equals the number of panels actually gone, and the frames come
back. The second failed twice before it held — once because the harness kept
breaking panels *during* the count, and once because forty panels going up
beside a core parked on 1hp splashed it to death about one run in four.

---

### I — ORDINAL · magenta · the counter — original plan

*Now:* two concentric square frames of panels around a core, a garrison of
DIGITs parked behind the panels, a burst in III, the core descends in IV.

*Wrong with it:* the fight is named for counting and there is no number
anywhere on screen. The panels are forty identical marks. Stage IV is a lone
core over a field with two panels left in it.

- **Draw: number the panels.** Each panel carries its index and draws it.
  The gauge already counts them; make the field count them too. Every
  screenshot of this fight then says what the fight is about.
- **New phase — ALIGNMENT (between II and III, +40s).** The two frames
  counter-rotate. When their corners line up the core is sealed; at 45° there
  is a lane through to it. The fight becomes about waiting for the lane,
  which is the mechanic ORDINAL's shape has always implied and never had.
- **Second setpiece — TALLY (III→IV, +10s).** The core stops dead and counts
  back every panel you broke: each one redrawn as a ghost in order, one per
  tick, accelerating, and then the frames **re-form at 40%**. It is the boss
  reading your receipt to you.
- **Death:** the frames should come apart *in counting order*, one panel per
  tick, rather than the generic arrest.
- **Probe:** stage IV fires **54% of its shots mid-sweep** with the nearest
  body inside the cone 21% of the time. The descending core orbits the turret;
  hold it above the shoulder.

*Length: 220 → 220 + 40 + 10 + 25 = ~295s.*

---

### II — GNOMON · amber · the clock · **shipped, build 139**

**As built: 246s (from 215), stages 16/27/21/29.** Every stage inside the
band, no type past the shoulder, and **stage IV's corruption went from 0.4%
to 14.5%.**

- ✅ **The planted needle still throws a shadow.** This was the real defect.
  The wedge is the best pressure mechanic in the game — 30–34% of stages II
  and III — and it stopped dead the moment the needle came down, so the
  finale of the fight whose entire subject is a moving shadow had no moving
  shadow in it. It sweeps out of the *plant* now rather than out of the core,
  which is what a gnomon is: the shadow's origin moves next to you for the
  last stage.
- ✅ **MIDNIGHT** (III→IV): the counterpart to NOON. Both needles to twelve,
  the dial put back whole, then one revolution at speed — and every arc the
  sweep passes goes dark for the rest of the fight. Still solid, still in the
  way, no longer lit. The clock running down rather than round. This is where
  the fight's added length comes from.
- ✅ **The face has hours.** Twelve ticks, four of them long, and the gaps in
  the ring outlined where they were. The fight is named for a sundial, its
  mechanic is a shadow on a clock, and for ten builds a screenshot of it was
  a ring of amber slabs with a stick through them.
- ✅ **NOON moved from half a dial to a third**, because stage I measured at
  11% of the fight — under the floor. Its regress case now reads the
  threshold from config rather than repeating the number.
- ✅ **The ladder could skip stage IV**, where the needle plants. One stage at
  a time now, with a case.
- ⏸ **The background roll** in IV — still wants `background.roll`, still
  deferred. The planted shadow sweeping the whole field turned out to deliver
  most of what the roll was for.

### II — GNOMON · amber · the clock — original plan

*Now:* a dial of 16 arcs, a needle of 6 segments sweeping, a shadow wedge
that kills projectiles and corrupts, NOON at the midpoint, the needle plants
beside the turret in IV.

*Wrong with it:* the shadow sweep is the best pressure mechanic in the game —
32–34% of stages II and III — and it **stops** when the needle plants, so
stage IV measures 0.4% and the finale is inert. The dial is gone by then. And
a clock face never shows a time.

- **Draw: give the dial hours.** Twelve marked positions, and the needle
  points at one. Stage changes happen *on the hour* with the face showing it.
- **New phase — SECOND HAND (between II and III, +40s).** A second, shorter
  needle sweeping the other way. Two shadows crossing, and the crossing point
  is the thing to avoid. The dial's own geometry doing the work.
- **Second setpiece — MIDNIGHT (III→IV, +10s).** The counterpart to NOON: the
  dial **re-forms at 40%**, both needles align at twelve, and then the sweep
  runs one full revolution at four times speed — every arc it passes goes
  permanently dark but stays solid. The clock running out.
- **IV — the field turns.** The planted needle becomes an axis and the
  *background rolls about it* (Phase A's `roll`). The one fight where the
  camera moves, and it is the fight about rotation.
- **Minion:** SECONDs flung off the needle's tip by its own sweep, tangential,
  so their speed is the needle's speed.
- **Probe:** the worst cone numbers in the game — the nearest body is inside
  it **21%** of stage III and **3%** of stage IV, with 58% of IV's shots fired
  mid-sweep. The needle sweeps a full circle and half of that circle is behind
  the turret's shoulder. Clamp the sweep, or accept that half of it is scenery
  and say so.

*Length: 198 → 198 + 40 + 10 + 25 = ~275s. Add ~15s of hour-holds.*

---

### III — FRACTAL · green · self-similarity · **shipped, build 138**

**As built: 249s (from 189), stages 17/24/23/26.** Every stage inside the
15–35% band, no type past the shoulder, and a stage I screenshot that is
unmistakably this boss and nothing else.

- ✅ **The figure is now the Sierpinski it always drew.** The diagnosis in the
  first draft was half wrong and worth correcting: `drawTri` has drawn a
  proper subdivision inside every body since the fight was written. What did
  not match was everything outside it. The middles orbited at 150 — eighty-six
  units past the core's own corner — each turned to face along its own orbit,
  with the smalls counter-spinning from the first frame. Three generations of
  triangle arranged as a solar system.

  Three changes, all geometry: middles at 96 so they sit **on** the core's
  corners, every generation wearing the **same rotation**, and the children
  placed at −90/30/150 so they land on the parent's drawn vertices rather than
  the middles of its sides. The bodies are now the same figure the core has
  inside it. From II they come apart, which the header always claimed and
  nothing ever showed.
- ✅ **DESCENT** (III→IV): the figure knots down and comes back one level
  *lower* — each core piece carrying its own middle and that middle its own
  three smalls, so the field holds three complete copies of the shape.
  Same verb as RECURSION, different sentence. Not one body more than it
  arrived with; the conservation rule is not bent for a setpiece.
- ✅ **RECURSION now waits for the whole middle generation** rather than the
  first one broken. At one middle it fired thirty seconds in and stage I was
  13% of the fight, under this plan's own floor.
- ✅ **Stage IV sweeps rather than orbits.** The pieces used to circle the
  turret, which took them behind the shoulder: 5% in-cone, 47% of shots
  mid-sweep, 16% of frames with nothing legal to shoot. They now swing ±1.2
  rad either side of straight up — inside the assist's 1.36 — and per-type
  reachability went from 46/56/62% to 68/78/84%.
- ✅ **The stage ladder could skip III.** `divide()` is gated on entering
  stage three and the ladder jumped to whatever was furthest along, so a fight
  crossing both thresholds on one frame never divided its core. One stage at a
  time now, with a case.
- ⏸ **SCALE** (the zoom phase) not built. It needs `background.zoom`, and a
  phase adds no length; it is worth doing for its own sake in a later pass.

**What this taught the model.** FRACTAL went 189 → 249s, and the model
predicted it almost exactly: two re-forms of a 2520-health structure at ~90
damage a second is 2 × 28 = 56 seconds, and the fight gained 60. It also
showed where the lever **stops**: raising the re-form fraction from 0.85 to
1.0 changed the length by nothing measurable. A re-form is worth
`frac × structure health ÷ damage`, and once `frac` is near 1 the only
remaining lever is the structure's own health — which is a balance pass, not
content, and belongs in Phase C across all seven at once rather than boss by
boss. **On that evidence the 290s target is likely to land nearer 260 for the
whole set; Phase C decides it with all seven measured, not this build.**

### III — FRACTAL · green · self-similarity — original plan

*Now:* three generations of one triangle, breaking a mid frees its mites,
RECURSION puts the figure back once, the core divides into three pieces
sharing one bar.

*Wrong with it:* **the self-similarity is invisible.** The pieces are small
outline triangles that do not read as nested at any size, so the one idea the
fight has never appears on screen. Stage IV is three small triangles on an
empty field. This is the least watchable fight in the game.

- **Draw: actually draw the fractal.** A FRACTION is a Sierpinski triangle
  whose subdivision depth equals its generation, and breaking one splits it
  **along its own subdivision lines**. This is the biggest single visual win
  available anywhere in this game and it is one drawing function.
- **New phase — SCALE (between II and III, +40s).** The whole figure zooms:
  every radius and orbit multiplied on a slow cycle, so the same shape
  appears at two sizes and you cannot tell which generation you are looking
  at. Pairs with Phase A's `zoom` for the background to breathe with it.
- **Second setpiece — DESCENT (III→IV, +10s).** The figure **re-forms at 40%**
  one level *deeper*: each of the three core pieces grows a full generation
  beneath it, and for one held beat the whole screen is one triangle made of
  triangles made of triangles. The screenshot this fight has never had.
- **Death:** collapse inward by generation — every mite, then every mid, then
  the core — rather than the generic arrest.
- **Probe:** stage IV thrashes at **4.7 target switches a second** — three
  divided core pieces at near-identical distances, so the assist cannot
  choose — and damage per shot falls to 10.7 against 33.4 in stage II.
  Separate the three pieces' radii, or let the hysteresis fix carry it.

*Length: 207 → 207 + 40 + 10 + 25 = ~282s.*

---

### IV — AMPLITUDE · teal · the wave · **shipped, build 140**

**As built: 241s (from 219), stages 21/22/28/17.** Every stage inside the
band, blindness gone, and the head always in reach.

- ✅ **The swing grows downward.** This was the real defect and it took the
  probe to see it. The amplitude is bought with the body — a broken wave
  whips harder — and for eleven builds it whipped *both* ways, which put the
  crests further away every time the player made progress. The far end at a
  crest sat **541 from the turret against an aim range of 400**, and stage III
  ran with **nothing legal to shoot on 47% of its frames**. The fight was not
  quiet; it was out of reach. Holding the crest and dropping the trough keeps
  the escalation and inverts what it costs: a whipping wave comes at you.
- ✅ **The head never leaves reach.** A wide sine cannot have all of itself
  inside 400 — the ends are 200 across, so anything above 346 out there is
  unreachable, and segments cycling in and out *is* the fight. The thing whose
  death ends it is not allowed to. It is pulled down its own vertical until it
  is inside `reach`. Legality 45% → **99%**, and blindness 47% → **0%**.
- ✅ **OCTAVE** (into III): the body comes back and the wave folds into **four
  strands** a quarter period apart across the same span. Two strands was a
  pair of lines; four is interference. `at()` takes any number of strands now.
  This is where the back half gets its length.
- ✅ **The coil is a real ring, and an arc.** It was capped at six of fourteen
  segments and read as four leaves; it takes the whole body back now. And it
  spans 1.2 rad either side of straight up rather than closing a full circle,
  because a closed ring puts a third of itself behind the shoulder.
- ⚠️ **DROPLETs are still past the shoulder** — legal 39% of the time, up from
  21%. They are flung from the far crest by design and they latch beside the
  turret. Not mandatory to kill, so the gate is met on the letter; recorded
  because it is the same shape of problem as the rest.
- ⏸ **STANDING WAVE** (the nodes-lock phase) not built. A phase adds no
  length and OCTAVE took the visual budget for this build.

### IV — AMPLITUDE · teal · the wave — original plan

*Now:* 14 segments on a travelling sine, the swing grows as the body shrinks,
RESONANCE comes down over the turret, two strands in III, a coil in IV.

*Wrong with it:* the wave is drawn as a hairline stroke with beads on it. The
coil — the whole point of stage IV — is four leaf shapes and reads as nothing.
The fight is also the quietest in the game (mean intake 0.99, mean attackers
0.04), which is a balance note but shows up as *nothing happening*.

- **Draw: the wave as a ribbon.** A filled band whose thickness varies with
  the local amplitude, with the segments riding inside it. Immediately the
  most striking thing on screen.
- **New phase — STANDING WAVE (between II and III, +40s).** It stops
  travelling. Nodes lock in place, antinodes pump, and the nodes are safe
  lanes while the antinodes sweep. Different geometry, same object, and it is
  the one thing a wave can do that this fight does not already show.
- **Second setpiece — OCTAVE (III→IV, +10s).** The body **re-forms at 40%**
  and the wave doubles its frequency and splits into four strands. The screen
  becomes a moiré.
- **IV — the coil is built from the re-formed body**, so it is a ring of a
  dozen segments rather than four, and it rotates and breathes rather than
  sitting.
- **Minion:** DROPLETs shed off the crests at the moment each crest passes its
  peak — thrown by the motion rather than spawned on a clock.
- **Probe:** the nearest body is inside the cone **0% of the time** in stages
  II, III and IV, and 24–44% of frames have nothing legal to shoot at all.
  `span` 460 puts the wave's ends past the shoulder. Narrow it, or bring the
  wave's centre up the field.

*Length: 203 → 203 + 40 + 10 + 25 = ~278s.*

---

### V — DYNAMO · blue · the circuit

*Now:* three pylons on a turning circuit, a core that shelters inside it and
blinks between them, an earthing discharge from II, SURGE on the second
pylon, a two-bladed propeller in IV.

*Wrong with it:* **the blink stops between SURGE and III** — one leg left,
one place to stand, `stops() < 2`, and measured, thirty-one seconds of stage
II produced a single blink. This is a known, filed defect: the fix (pacing
stations around the last pylon) was built in build 134 and rolled back
because it cost 30% of the fight length for reasons three isolation runs
never identified. Stage IV is a propeller hovering at a fixed distance.

- **The blink gap is affordable now — the harness has run.** The build-134
  rollback does not reproduce. Re-applied to build 136's module the pacing fix
  takes stage II from **2 blinks to 7** and costs +12% of fight length
  (224.6s → 251.5s), not the +32% that got it reverted; the earlier blowup
  belonged to the lances-array version of the module that was replaced in
  build 135 and no longer exists. What it does add is **variance** — two
  patched runs at 273s and 230s against a baseline of 225.1 and 224.2 — so it
  ships with a threshold retune rather than on its own.
- **The bigger defect is stage IV, and it is new.** The propeller orbits the
  turret, which takes it past the shoulder: **52% of stage IV has no legal
  target on the field**, the nearest body is inside the cone 5% of the time,
  and damage per shot collapses from ~20 to 8.2. Keep the orbit inside 78° of
  vertical, or bias the descent toward the top of the field.
- **New phase — LATTICE (between II and III, +40s).** The links between
  surviving pylons carry visible current, and the IONs *are* that current: a
  continuous stream riding every link, dropping off where the lattice is
  broken. The circuit should look energised rather than like three towers
  with lines between them.
- **Second setpiece — EARTH (III→IV, +10s).** The pylons **re-form at 40%**
  and the entire circuit discharges downward at once: every pylon earths on
  the same frame, a curtain of lightning down the whole field, and the field
  strobes white for three frames.
- **IV:** the propeller *chases* instead of hovering, and its blades leave a
  persistent arc trail — a drawn afterimage of the last half turn.

*Length: 249 → 249 + 40 + 10 + 25 = ~324s. Trim elsewhere to ~295s.*

---

### VI — PARITY · violet · the mirror

*Now:* two crescents orbiting a point 180° apart sharing one bar, only one
real at a time, panes break in pairs, MERGE, one crescent shatters in IV.

*Wrong with it:* stage IV **throws the premise away** — one crescent is not a
mirror — so the last stage of the mirror fight has no mirror in it. And the
swap is a cross-fade rather than an event.

- **Draw: the mirror should actually mirror.** Reflect the *field* across the
  seam — a ghosted, flipped copy of the turret and its projectiles on the far
  side of the line. One transform, and it is the most striking idea available
  in any of these seven fights.
- **New phase — FOUR (between II and III, +40s).** The pair becomes two
  pairs: four crescents on two axes, a second seam at 90° to the first. Two
  mirror lines crossing, four things of which two are pictures.
- **Second setpiece — INVERSION (III→IV, +10s).** The panes **re-form at 40%**
  and the halves swap *places* rather than reality: for one beat the phased
  one is real and the real one is the picture, while the seam sweeps a full
  turn.
- **IV — keep the mirror.** Rather than shattering one crescent, the survivor
  keeps a wireframe twin that mimics it exactly. The premise survives to the
  end; what changes is that the twin is now provably empty.

*Length: 237 → 237 + 40 + 10 + 25 = ~312s. Trim to ~295s.*

---

### VII — TERMINUS · crimson · the edge

*Now (build 136):* a ring of 32 boundary segments closed around the turret, a
core that rides outside it and dips inside to mend, ECLIPSE, a double square
frame in III, LAST CLOSE in IV with the core alternating between hanging over
the turret and retreating into the wall.

*Wrong with it:* stage III is now the weakest 15% of the fight — the frame is
a splash magnet and evaporates in about twenty seconds, and what is left is a
core with beams on it until IV starts.

- **III — make the frame close too.** A square boundary shrinking on the
  turret, the same idea as the ring in a different shape, rather than a
  distant object that happens to be square. *Adds nothing to length; makes
  the 15% worth its place.*
- **Colour: the resurrected boundary comes back wearing the six tones** and
  fades to crimson across stage IV — a slow echo of ECLIPSE rather than a
  second flash of it.
- **Beams widen** as the core loses health, so the last thirty seconds are
  crimson wedges rather than lines.
- **Probe — the worst number in the game.** Stage I changes target **45 times
  a second** and fires **74% of its shots mid-sweep**, because thirty-two
  segments at exactly the same distance flip the "nearest" on floating-point
  noise every frame. The fight's central elegance is what breaks the assist.
  Phase A's hysteresis is aimed squarely at this; failing that, give the
  segments a deliberate radius jitter of a few units so the ordering is
  stable.
- **New phase — HORIZON (between II and ECLIPSE, +40s).** The ring stops
  being a circle: it deforms into an ellipse and precesses, so the boundary
  is nearer on one side and the nearest segment changes as it turns. The one
  thing a ring centred on the turret has never done is have a near side.

*Length: 419 → ~445s. Already at target.*

## Phase C — the length audit (one build)

Re-measure all seven with `fight.mjs --runs 3`, and bring I–VI to one length
and VII to about 1.8× it by moving stage thresholds only — no new content, no
HP changes beyond what a threshold implies. The stage split target is nothing
below 15% or above 35%.

**The target is 250s, not 290.** Four builds of Phase B have landed at 249,
246, 241 and 221 without any of them being tuned toward a number: each was
"add the setpiece, add the re-form, measure". Four independent arrivals at
the same place is the honest length of a fight built this way, and 290 was a
figure picked before the length model was corrected. So Phase C's job is
**I to 250 and the other five held there**, VII at 450 ± 20.

## Rules this plan holds itself to

Learned the expensive way over builds 127–136, and every one of them cost a
build when it was broken:

1. **Geometry decides targeting, not intent.** Auto aim takes the nearest
   thing and cannot be told what a thing *is*. Anything meant as armour must
   be physically nearer; anything meant to be unreachable must be further
   away or off the field entirely.
2. **And nearest only counts inside 78° of straight up.** A body behind the
   turret's shoulder is not a target at any distance — which is how DYNAMO's
   finale ended up unaimable for half its length without anything saying so.
   Anything arranged *around* the turret rather than in front of it has to
   answer this.
3. **Ties are expensive.** Two bodies at the same distance make the assist
   switch every frame, and with auto fire on every shot taken during the slew
   goes where the last target was. Equal distances look elegant and measure
   terribly.
4. **Measure before and after every change**, with `fight.mjs`, `dps.mjs` and
   the corruption audit. Six of seven bosses shipped a first draft where the
   minions absorbed 40–65% of the turret's output, and every one of those was
   found by the damage table rather than by looking.
5. **A mechanic must run in a stage where its target is reachable.** Ask of
   every new phase: *in which stages is this both running and actionable?*
6. **Corruption is a beat, not weather.** Anything above ~25% of frames in a
   stage is a screen effect rather than a mechanic. TERMINUS's squeeze was at
   95% and is now at 10%.
7. **Nothing crosses the middle.** In any fight arranged about a centre,
   interpolate in polar — a straight line between two points around a centre
   passes through where the player is.
8. **Add a regress case for anything that ships broken.** That is the whole
   rule and it is why the suite is 95 cases.
