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
430 ± 20s.** That is +70 to +90 seconds each, all of it from new content.

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

## Phase A — the shared machinery (one build)

Everything in Phase B is cheaper if these exist first. Nothing here changes a
fight on its own, so it ships with the ORDINAL work rather than alone.

- **`Boss.reform(world, frac, opts)`** — resurrect this boss's dead parts at
  `frac` of a bar with a staged sweep, in ring or index order, with the flash
  and shake. TERMINUS's `lastClose` becomes three lines. This is the fix for
  finding 1 and the single biggest change in the plan. *Adds 20–30s per
  fight on its own*, because it puts structure back that has to be broken
  again.
- **`Boss.beat(world, name, seconds, step)`** — the setpiece harness: holds
  the stage ladder, owns the caption, runs `step(k)` from 0 to 1, returns
  true on the last frame. Every existing setpiece is hand-rolled; with this
  a second one per boss is ~20 lines instead of ~60.
- **Structure ghosts** — a shared draw helper that outlines a boss's *dead*
  parts where they would be. Proven in TERMINUS's ECLIPSE, where it turned
  six lonely survivors into a whole boundary. Applies to all seven and makes
  every late stage legible.
- **Camera verbs on `background`** — `roll(rad)`, `zoom(k)`, `invert(t)`.
  Three functions, and they unlock most of the cinema below.
- **A held breath on `enterStage`** — 0.5s of time dilation and silence.
  The engine already has `world.timeScale` and `world.bossSlow`; this is one
  call. *Adds ~2s per fight* and makes every stage land.
- **Per-boss arrival verbs** — replace the shared unfold with an
  `arriveShape(k)` hook the boss may override.

## Phase B — one build per boss

Each is: **one new phase** (the length), **one second setpiece** (the back
half), **one re-form** (the finale), **one draw upgrade** (the screenshot).

---

### I — ORDINAL · magenta · the counter

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

*Length: 220 → 220 + 40 + 10 + 25 = ~295s.*

---

### II — GNOMON · amber · the clock

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

*Length: 198 → 198 + 40 + 10 + 25 = ~275s. Add ~15s of hour-holds.*

---

### III — FRACTAL · green · self-similarity

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

*Length: 207 → 207 + 40 + 10 + 25 = ~282s.*

---

### IV — AMPLITUDE · teal · the wave

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

- **Re-attempt the blink gap, with a harness first.** Build a per-stage DPS
  probe before touching the module — the previous attempt failed because
  "the fight got 30% longer" was the only signal available and it could not
  be attributed. This is the one item in the plan with known risk.
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
  four (then six) crimson wedges rather than lines.
- **New phase — HORIZON (between II and ECLIPSE, +40s).** The ring stops
  being a circle: it deforms into an ellipse and precesses, so the boundary
  is nearer on one side and the nearest segment changes as it turns. The one
  thing a ring centred on the turret has never done is have a near side.

*Length: 419 → ~445s. Already at target.*

## Phase C — the length audit (one build)

Re-measure all seven with `fight.mjs --runs 3`, and bring I–VI to 290 ± 15s
and VII to 430 ± 20s by moving stage thresholds only — no new content, no HP
changes beyond what a threshold implies. The stage split target is nothing
below 15% or above 35%.

## Rules this plan holds itself to

Learned the expensive way over builds 127–136, and every one of them cost a
build when it was broken:

1. **Geometry decides targeting, not intent.** Auto aim takes the nearest
   thing and cannot be told what a thing *is*. Anything meant as armour must
   be physically nearer; anything meant to be unreachable must be further
   away or off the field entirely.
2. **Measure before and after every change**, with `fight.mjs` and the
   corruption audit. Six of seven bosses shipped a first draft where the
   minions absorbed 40–65% of the turret's output, and every one of those was
   found by the damage table rather than by looking.
3. **A mechanic must run in a stage where its target is reachable.** Ask of
   every new phase: *in which stages is this both running and actionable?*
4. **Corruption is a beat, not weather.** Anything above ~25% of frames in a
   stage is a screen effect rather than a mechanic. TERMINUS's squeeze was at
   95% and is now at 10%.
5. **Nothing crosses the middle.** In any fight arranged about a centre,
   interpolate in polar — a straight line between two points around a centre
   passes through where the player is.
6. **Add a regress case for anything that ships broken.** That is the whole
   rule and it is why the suite is 95 cases.
