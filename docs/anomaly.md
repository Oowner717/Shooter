# The six other apertures — plan

Not built yet. This is the plan for the six remaining bosses, one per
ANOMALY colour, created, reviewed and revised before any code. It is in the
repo so it survives the container; each phase below is one build-sized
request, and a future session should be able to pick any phase up from this
file alone.

Status: **Phase 0 shipped in build 127.** The engine holds seven bosses;
one of them (ORDINAL, boss I, magenta) is built, and it is the reference for
everything here. Phases 1–7 below are not started.

Phase 0 landed as planned, with two changes worth knowing:

- The gate became exact rather than statistical. `scripts/fight.mjs --seed
  --hash` is bit-reproducible once rAF is stubbed, the service worker is
  blocked and audio is absent (audio's white-noise buffer pulls ~50,000
  `Math.random()` draws at an unpredictable moment, which is what defeated a
  seeded run). 9000 frames of ORDINAL hashed identically before and after.
- `reconciled` is cleared by `reset()` and handed back by the restore, the
  same lifecycle as the ways in. RESET SIMULATION therefore clears it,
  because it throws the save away.

Two defects found by the new tooling and deliberately left, both out of
Phase 0's no-behaviour-change scope:

- ORDINAL's CONVERGENCE caption `IT IS NOT A WALL. IT NEVER WAS.` reads at
  **14.1 chars/sec** against law 4's ceiling of 13. One-line fix; it belongs
  with the balance pass or with Phase 1.
- Three banner rows at once sit under the alert stack. Unreachable until a
  second slot is buyable, so Phase 1 owns it.

## The seven

| # | Name | Tone | One line |
|---|-----------|-----------|--------------------------------------------------|
| I | ORDINAL | `#ff5ec8` magenta | The thing that counts. Shipped. |
| II | GNOMON | `#ff8a3d` amber | The thing that keeps the hours. A dial, a needle, and a shadow that sweeps. |
| III | FRACTAL | `#8bff4d` acid green | The thing that repeats itself. Every piece of it is the whole of it. |
| IV | AMPLITUDE | `#2ee6c0` teal | The thing that oscillates. A standing wave that comes up to full height. |
| V | DYNAMO | `#4d8dff` electric blue | The thing that draws current. Three pylons, a grid, and a core that blinks between them. |
| VI | PARITY | `#a86bff` violet | The thing with a twin. Two mirrored halves, only one of them ever real. |
| VII | TERMINUS | `#ff4d6d` crimson | The edge. It does not come to you — it closes the field around you. |

Each boss is built from its tone: core, segments and minions all live in its
colour family, the way ORDINAL's tally/core/digit all live in magenta. The
menu slot, the aperture banner, the boss bar, the arrival wormhole and the
background moods all take the same tone, so the colour is the identity from
the tree to the sky.

## Laws every fight obeys

These are ORDINAL's hard-won rules, promoted to laws. Every design below was
checked against them, and each ships with a regress case for the ones that
can be measured.

1. **Auto-aim finishes every fight.** The assist shoots what is nearest; a
   fight gates on geometry and time, never on manual aim. No boss may
   require a target the assist will not eventually pick.
2. **Everything mandatory comes inside 390 units.** Base `aimRange` is 400.
   Any body that must die spends enough of its time within 390 of the
   turret, at base range, with no upgrade assumed. (This killed the first
   drafts of DYNAMO's pylon spread and TERMINUS's edge ring — see Review.)
3. **Nothing can kill you.** Boss pressure is corruption, intake stalls and
   field control — the same currencies ORDINAL takes — never death.
4. **The arrival is a scene, on the raw clock.** Sky first, then the hole,
   then the thing, then the structure. Captions at ≤ 13 chars/sec, held on
   their own clock. Nothing takes damage until the arrival ends, pinned.
5. **The death is watched, on the raw clock.** Multi-beat, slow-motion via
   `timeScale`, wreck shed with `keep: true` so the corpse stays, salvage
   flows to the turret, exactly one REMAINDER rises and comes on its own.
6. **The wave the way opened on resumes.** Director frozen, not reset.
7. **Repairs are capped and pushed back into `world.enemies`.** Both the
   out-heal wall and the off-field resurrection were shipped bugs once each.
8. **Fixed bodies stay under the broadphase.** No boss body over r 72
   without accepting a global `GRID_CELL` bump, which costs everyone.
9. **Boss bodies are off the ledger.** `counts = false` everywhere; a hole
   taking the field is not a kill.
10. **The fight escalates the sky.** Four background moods per boss, dread
    driven by measured progress through the fight, `setFocus` follows the
    thing that matters (which is not always a fixed point any more).

## Phase 0 — the boss engine (one build, no new boss)

ORDINAL is currently *the* boss: `world.aperture` is one integer,
`openAperture` constructs `Ordinal` by name, `syncBoss` reads `CFG.ordinal`
and assumes exactly two shell gauges, `endBoss` says "ORDINAL RECONCILED",
and the bar's stage colours are a hand table of magentas. Phase 0
generalizes all of it with **zero behaviour change** for ORDINAL — the
existing 44-case suite must pass untouched, which is the phase's whole
acceptance test.

- **Registry.** `src/boss.js` keeps the shared kit — `Remainder`, `say()`,
  `body()`, the arrival scaffold, `openAperture(world, n)` — plus
  `ANOMALIES`, a table keyed 1–7: `{ n, name, tone, cfgKey, types, make }`.
  Each new boss is its own module (`src/gnomon.js`, …), added to `sw.js`
  ASSETS (check-build already guards that). ORDINAL stays where it is.
- **Purse.** `world.aperture` (int) stays as boss I's count — **no save
  VERSION bump**; v4 saves must keep working, and `readSlot` refuses any
  other version, so a bump would silently wipe every install's run. New
  fields are additive: `world.apertures = {2: n, …}` and
  `world.reconciled = [n, …]` (which bosses have been broken at least once,
  ever — it is progression, so it saves and survives updates).
- **Banner.** One `#apertureBar` row per *distinct* aperture held, each in
  its boss's tone, labelled `<NAME> APERTURE HELD xN`; tapping a row opens
  that boss. One held type — today's case — looks exactly as it does now.
- **Boss bar.** The boss exposes a descriptor:
  `gauge() → { phase, core, shells: [fracs], marks: [{at, past}], tone: [c, lit] }`.
  `syncBoss` consumes only that. Shell rows are built to match
  `shells.length` (GNOMON has one frame, DYNAMO's "shell" is three pylon
  pips, TERMINUS has two rings). Stage tones derive from the boss tone —
  the lit ramp ORDINAL's `BOSS_BAR` table hand-authored becomes
  `barRamp(tone)` and ORDINAL's output is asserted equal to the old table.
- **Backgrounds.** `bossMoods(tone)` re-hues ORDINAL's four authored moods
  onto a new tone (HSL rotate, keep the lightness/saturation curve), with a
  hand-override table for the ones the generator gets wrong. Known wrong in
  advance: FRACTAL (acid green sky camouflages energy salvage — its moods
  stay near-black olive with the *boss* carrying the green), and TERMINUS
  (crimson sky vs damage flashes — its moods run dark wine, the boss and
  beams carry the red).
- **endBoss / alerts.** `<NAME> RECONCILED`, `<NAME> LEFT A REMAINDER`,
  driven from the registry. Shared timings (`after`, `endSlow`, `slowFor`)
  move to `CFG.boss`; `CFG.ordinal` keeps only ORDINAL's own numbers, with
  the old keys aliased until the last phase deletes them.
- **The measuring stick.** ORDINAL's tuning took three builds of headless
  driven fights. Promote that probe into `scripts/fight.mjs`: drive an
  assists-only loadout against boss N, report per-stage seconds, DPS
  absorbed by each part, time-in-range per body class, and captions
  chars/sec. Every boss phase below ends with its `fight.mjs` numbers in
  the commit message.
- **check-build.** The DERIVED set (types produced outside the wave table)
  and the geometry guards become per-boss tables the new modules feed.
  ORDINAL's frame-closure and price guards keep passing unchanged.
- **Regress.** New cases: v4 save with no new fields still loads; apertures
  survive a save round-trip; the banner names the right boss; `gauge()`
  drives the bar for ORDINAL identically to before (DOM-level diff).

## The six fights

Each boss below lists: shape, cast, stages, setpiece, finale, captions,
death, and what only it does. All HP and prices are **provisional** — the
user has said rebalancing comes later — but relative sizes are part of the
design. Fight-length targets: II–VI **200–260s**, VII **~420s** (assists
plus mid-tier upgrades, measured by `fight.mjs`, tuned like ORDINAL was:
196s shipped).

Shared cast pattern (ORDINAL's, kept): one **core** (`fixed`, large, the
health bar), one **structure** type (`fixed` segments the boss places every
frame), one **minion** type (sovereign once released — the parked-garrison
mechanism is reused everywhere something waits inside something else).

---

### II — GNOMON · amber · the reckoner of hours

**Shape.** A circular dial of 16 arc segments (`dial`, r ≈ 150) around a
disc core (`gnomon`, r 40) — the first round boss after ORDINAL's squares.
Out of the core, a single long **needle**: a line of six collinear fixed
segments (the engine's bodies are circles; ORDINAL's frames are already
built the same way) reaching past the dial, sweeping slowly. Behind the needle trails a 60° **shadow** wedge,
drawn as darkened sky: rounds crossing the shadow decay and die, and while
the shadow lies over the turret the intake stalls (the amber mirror of
ORDINAL's beams). The fight is ORDINAL's alignment problem inverted — the
frame's holes stand still and the *occlusion* moves.

**Cast.** `gnomon` (core), `dial` (segment), `second` (minion: tiny, fast,
amber; parked behind dial arcs, released through broken ones).

**Stages.**
- **I** — dial turns against the needle. Break arcs, mind the sweep.
- **NOON** (setpiece, at dial ≤ 50%): the needle spins to a blur, the
  shadow sweeps a full 360° once — every projectile on the field dies, all
  parked SECONDs release at once, the dial part-rebuilds. Caption: `NOON`.
- **II** — a second needle grows opposite the first: two shadows, and the
  safe arc between them is now the thing you learn. Repairs begin, capped.
- **III** (core ≤ 55%) — the dial cracks loose: arcs detach into eccentric
  orbits, so the holes precess. SECONDs burst from the core on a clock.
- **IV** (core ≤ 25%) — **THE NEEDLE COMES DOWN.** The needle detaches,
  falls, and plants beside the turret — its six segments now a fixed wall
  pulsing shadow rings; the core descends to 235 and the sky whites toward a flare.
  It never goes back up.

**Intro** (4 beats over ~14s — sunrise run backwards: the sky brightens
amber before the hole opens, the one arrival where the field gets *lighter*):
`THE LIGHT HERE HAS NEVER MOVED.` ·
`SOMETHING HAS BEEN TELLING TIME BY YOU.` ·
`IT HAS COME TO READ ITS SHADOW.` · `GNOMON`

**Stage lines.** II `THE DIAL IS CRACKED. IT RUNS FAST.` ·
III `IT HAS DECIDED THE HOUR.` · IV `THE NEEDLE COMES DOWN.`

**Death.** The shadow unwinds — a last full sweep that *heals* nothing and
harms nothing, purely light coming back — then the dial arrests arc by arc,
infall, detonation. The wreck is a broken circle with the needle still
planted where it fell. Outro:
`THE HOURS ARE LOOSE.` ·
`NOTHING HERE WILL BE MEASURED BY LIGHT AGAIN.` ·
`SOMETHING GREEN IS DIVIDING.`

**Screenshot.** The planted needle beside the turret under a flaring amber
sky, shadow rings crossing the field.

---

### III — FRACTAL · acid green · the self-similar

**Shape.** A Sierpinski body: three mid triangles (`fraction`, r 30) orbit
the vertices of one large core triangle (`fractal`, r 64), and three small
triangles (`mite`, r 13) orbit each mid — depth as armour. Shots meet the
smalls first, then the mids, then the core. Nothing here is a wall;
everything is a *generation*.

**Rule of the fight.** Killing a mid **splits** it: its three orbiting
smalls go feral (sovereign, attack), and the mid's mass pays out then. The
boss never gains bodies it didn't arrive with — the field pressure is the
same 12 smalls redistributed between "shield" and "loose", so the count
stays legible and the broadphase budget flat.

**Stages.**
- **I** — orbits are slow and concentric. Peel a mid.
- **RECURSION** (setpiece, first mid down): everything left — mids, smalls,
  ferals — collapses inward and reassembles into the full figure once, at
  60% health per rebuilt piece. `IT REMEMBERS ITS SHAPE.` The one heal of
  the fight, and it is a scene, not a drip.
- **II** — orbits go eccentric and counter-rotate per generation; the core
  spawns replacement smalls on a slow clock, capped at the arrival count.
- **III** (core ≤ 50%) — the core splits: it becomes three mids one last
  time (health divided three ways, bar shows the sum), each orbiting wide.
  `IT IS NOT SMALLER. THERE IS MORE OF IT.`
- **IV** (last piece) — the survivor takes the remaining bar, goes bright
  white-green, and orbits the *turret* at close radius, shedding mites.
  `EVERY PIECE IS STILL THE WHOLE.`

**Intro** — the hole opens as a triangle, and the beats subdivide it:
`ONE OF THE OBJECTS HAS BEEN REPEATING ITSELF.` ·
`EVERY PIECE OF IT IS THE WHOLE OF IT.` ·
`IT DOES NOT BELIEVE IN SMALLEST PARTS.` · `FRACTAL`

**Death.** The inverse of RECURSION: the last piece subdivides — triangle
into triangles into sparks — a full second of recursive shatter, each level
a shed of `keep: true` wreckage, so the corpse is a scattered Sierpinski
dust the next wave arrives into. Outro:
`IT HAS REACHED ITS SMALLEST PART.` ·
`THE PATTERN STOPS HERE.` ·
`SOMETHING IS MOVING IN LONG, SLOW WAVES.`

**Screenshot.** The mid-death cascade: one triangle becoming a pyramid of
smaller ones in acid green on a near-black field.

---

### IV — AMPLITUDE · teal · the standing wave

**Shape.** A serpent. Fourteen body segments (`crest`, r 16) placed each
frame along a travelling sine — the wave spans the field width at standoff
height, sweeping slowly left and right, so every segment passes through aim
range on its own schedule (law 2 by construction). The head is the core
(`amplitude`, r 34). Segments are solid and armoured; the body is the
frame, laid out in time instead of around a centre.

**Rule of the fight.** Breaking body segments *shortens* the wave, and a
shorter wave swings **higher**: amplitude grows as the body shrinks, so the
trough dips nearer the turret the better you do — the fight leans in
instead of petering out. Crests fling `droplet` minions on a clock, always
from whichever crest is currently topmost.

**Stages.**
- **I** — one wave, slow period.
- **II** (body ≤ 50%) — frequency doubles.
- **RESONANCE** (setpiece, entering II): the whole serpent sweeps down the
  field once, passing over the turret — contact is corruption, not damage —
  and back up, leaving a standing shimmer where it passed. `RESONANCE`
- **III** (core ≤ 50%) — the serpent splits into two shorter waves, out of
  phase, one high and one low. The pair inter-weaves; the safe lane between
  them breathes.
- **IV** (core ≤ 22%) — **the coil.** The remaining segments wrap a circle
  around the turret at r ≈ 200 and contract to a floor of ≈ 150 (pressure,
  never a crush — law 3), head orbiting the
  ring, everything firing outward from inside. The claustrophobic inverse
  of every fixed-installation fight before it.

**Intro** — the arrival is heard first: the substrate lattice itself starts
to ripple in rows before anything is drawn.
`THE FIELD HAS A FREQUENCY.` ·
`IT HAS BEEN OSCILLATING UNDER YOU THE WHOLE TIME.` ·
`IT IS COMING UP TO ITS FULL HEIGHT.` · `AMPLITUDE`

**Stage lines.** II `IT HAS DOUBLED ITS FREQUENCY.` ·
III `TWO WAVES. ONE PERIOD.` · IV `IT IS CLOSING ITS PERIOD AROUND YOU.`

**Death.** The coil unwinds, the wave stretches across the full field one
last time, and **flatlines** — segments arresting left to right in a single
horizontal line of teal that holds for a beat before the infall. The wreck
is that line, fallen where it flattened. Outro:
`THE WAVE IS FLAT.` ·
`WHAT IS LEFT OF IT WILL NOT CREST AGAIN.` ·
`SOMETHING HAS FINISHED CHARGING.`

**Screenshot.** The coil: a teal serpent wound around the turret. Or the
flatline across the whole field.

---

### V — DYNAMO · electric blue · the closed circuit

**Shape.** Three pylons (`pylon`, fixed, r 24) in a compact triangle —
every pylon inside 370 of the turret (law 2; the wide first draft failed
it) — linked pylon-to-pylon by visible arcs. The core (`dynamo`, r 36)
sits *at* one pylon and **blinks** to another every ~6 seconds with a 0.8s
telegraph (charge-up whine, arc brightens). The core is shielded while all
three links stand; each downed pylon removes a shield tier. The assist
retargets on every blink for free — a teleporting boss is the one archetype
that is *more* comfortable on auto-aim than manual.

**Cast.** `dynamo` (core), `pylon` (structure), `ion` (minion — and the
signature: IONs travel *along the link arcs*, riding the beams between
pylons before dropping onto the field, so the circuit is visibly inhabited).

**Stages.**
- **I** — three pylons, lazy blinks, IONs ride the rails.
- **II** (first pylon down) — the surviving links electrify: crossing arcs
  sweep once per blink, corruption on contact. Blinks quicken.
- **SURGE** (setpiece, second pylon down): the whole grid overloads — every
  arc whips 360° around its pylon once, the field strobes blue-white, all
  riding IONs drop at once. `SURGE`
- **III** — one pylon left. The core untethers and orbits the field slowly,
  trailing a live arc back to the last pylon like a leash — the arc is the
  hazard now, a moving line you watch instead of a wedge.
- **IV** (core ≤ 25%) — the last pylon collapses *into* the core: it
  becomes a spinning triad (core plus two dead-pylon husks on short arcs, a
  two-bladed propeller of lightning) and descends toward the turret.
  `IT NO LONGER NEEDS THE GROUND.`

**Intro** — the beats are strikes: each of the three pylons arrives as a
bolt from off-field, the core last, down the middle:
`THE SUBSTRATE CARRIES A CURRENT.` ·
`SOMETHING HAS BEEN DRAWING ON IT SINCE YOU ARRIVED.` ·
`IT HAS COME TO COLLECT THE CHARGE.` · `DYNAMO`

**Death.** The circuit grounds out: chained lightning jumps from the core
to every wreck and debris pile on the field — one strike each, walking
outward — then total dark for half a second (the only full blackout in the
game), then the detonation relights the field. Outro:
`THE CIRCUIT IS OPEN.` ·
`THE CHARGE IS YOURS. IT ALWAYS WAS.` ·
`SOMETHING IS STANDING IN ITS OWN REFLECTION.`

**Screenshot.** The triad descending — a lightning propeller over the
turret. Or the blackout frame with the field lit only by the core.

---

### VI — PARITY · violet · the balanced account

**Shape.** Two mirrored crescents (`parity`, r 38 each) orbiting the
standoff point 180° apart, sharing **one** health bar, each faced with
mirror-pane segments (`pane`) on its outer edge. Between them a thin
mirror-line through the centre, slowly rotating — pure drawing, but
everything obeys it.

**Rules of the fight.**
- **Panes break in pairs.** Shatter a pane and its mirror twin on the other
  crescent shatters with it — damage on the structure is doubled, which
  feels generous until:
- **Only the real half takes core damage.** The crescents alternate phase
  every ~5s with a clean tell — the real one solid, the phased one a
  wireframe that leaves `world.enemies` entirely (the parked-garrison
  mechanism, reused). The assist naturally swings to whichever half is
  real. Minion ECHOes spawn strictly in mirrored pairs.

**Stages.**
- **I** — slow orbit, slow swaps.
- **II** (panes ≤ 50%) — swap period halves; the mirror-line begins to
  precess, and the crescents' orbit follows it eccentrically.
- **MERGE** (setpiece, core ≤ 60%): the halves rush together and try to fuse
  — both fully real for three seconds, healing capped at the repair law,
  white-violet bloom at contact. It is a burst window dressed as a threat:
  the fight's one moment of double damage, spent well or wasted.
  `IT IS TRYING TO BE ONE THING.`
- **III** — post-merge, orbits desynchronize; the mirror-line spins up and
  panes reflect occasional shots (visual ricochet, no player harm — law 3).
- **IV** (core ≤ 20%) — **one crescent shatters for good.** The survivor
  takes the whole remaining bar, goes permanently solid, and descends,
  spinning its remaining panes as a flail. `IT HAS GIVEN UP ON SYMMETRY.`
  The asymmetry is the escalation — the fight's premise breaking is the
  final stage.

**Intro** — everything arrives twice: each beat draws on both sides of the
centre-line at once, and the fourth beat is the two halves failing to be
one thing:
`THERE ARE TWO OF EVERYTHING HERE.` ·
`ONE OF EACH HAS BEEN HIDDEN FROM YOU.` ·
`IT HAS COME TO BALANCE THE ACCOUNT.` · `PARITY`

**Death.** Every pane it ever lost reassembles in place — for one held
beat the full mirror stands restored, reflecting the field back at itself —
then the whole sheet shatters at once into violet glass rain, arrest,
infall, detonation. The wreck is two half-rings of glass. Outro:
`THE ACCOUNT IS ODD.` ·
`NOTHING HERE HAS A TWIN ANY MORE.` ·
`AT THE EDGE OF THE FIELD, SOMETHING HAS DRAWN A LINE.`

**Screenshot.** The restored mirror an instant before it shatters. Or the
MERGE bloom.

---

### VII — TERMINUS · crimson · the closed interval

The capstone, gated on all five others (see menus). Twice the length,
and the only boss that does not stand *in front of* the turret: it
surrounds it. An early draft quoted all six prior fights stage by stage;
the review cut that (see below) — TERMINUS is its own fight, and the
predecessors appear as *echoes*, not as levels.

**Shape.** A ring of 28 boundary segments (`bound`, r 15) encircling the
turret. It materializes at the field edge during the arrival — out of aim
range, deliberately untouchable, the threat legible before the fight is —
and contracts to r ≈ 360 by the arrival's end (law 2 restored the moment
damage is possible). The core (`terminus`, r 40) is not at the centre:
**it rides the ring**, patrolling, repairing gaps it passes. It is
armoured on patrol and opens only while repairing — and to repair it dips
*inward* off the ring, closer than everything else, so the assist picks it
exactly when it is vulnerable. The fight breathes: open gaps faster than
the patrol closes them, and meet the core at every gap it stops to mend.

**Stages.**
- **I** — one ring, slow rotation, slow contraction (floor r 260 — law 3;
  it presses, it never crushes).
- **II** (ring ≤ 60%) — a second, sparser ring spawns inside,
  counter-rotating: two lattices of moving gaps, ORDINAL's alignment
  problem at field scale.
- **ECLIPSE** (setpiece, core ≤ 60%): the rings contract hard to the floor
  and hold — a tight double circle around the turret — and for one beat
  each segment flashes one of the six prior tones in sequence, magenta to
  violet, before everything is thrown back out to full radius. The one
  explicit echo of the other six, and it is a scene, not a stage.
  `EVERYTHING YOU BROKE WAS MEASURING YOU FOR THIS.`
- **III** — the core abandons patrol for the centre-top, drags the
  surviving segments into a double square frame — ORDINAL's silhouette in
  crimson, the first boss quoted by the last — and turns four beams out of
  itself. `LIMIT` minions walk the ring lines inward.
- **IV** (core ≤ 12%) — the frames break orbit and everything left spirals
  slowly inward together, the whole remaining boss converging on the
  turret as the core goes bare. All-out, both sides.

**Intro** (6 beats, ~20s, the longest): the sky does not darken — it
*closes*: the background visibly contracts, edges crushing inward, the six
prior tones flickering at the rim before crimson takes it:
`THE COUNT WAS NEVER THE POINT.` ·
`EVERYTHING YOU BROKE WAS MEASURING YOU FOR THIS.` ·
`IT IS NOT COMING TO YOU. IT IS THE EDGE.` ·
`THE SIMULATION ENDS AT ITS SKIN.` · `TERMINUS`

**Death** (the longest, ~8s): the ring arrests segment by segment in both
directions from the last gap you opened; the core falls to the centre;
infall takes the *background* with it — the sky visibly drains toward the
point — detonation, and then the one thing no other death does: the mood
does not return to `staging`, it lands on a new `dawn` mood, the darkness
gone slightly grey-gold for the rest of the run. The edge broke, and the
field looks like it. Outro:
`THE EDGE IS BROKEN.` ·
`THE FIELD DOES NOT END WHERE ANYTHING SAYS IT DOES.` ·
`NOTHING ELSE IS COUNTING.` ·
`SIMULATION 7749 IS YOURS.`

**Screenshot.** ECLIPSE — the six-colour double ring closed around the
turret. Or the dawn field after.

---

## The narrative thread

Each outro's last line names the next boss without naming it — ORDINAL's
shipped `SOMETHING ELSE IS ALREADY COUNTING.` already does this by
accident and needs no change. The chain: counting → light/time → division →
waves → charge → reflection → the line at the edge. TERMINUS's outro is the
only four-liner and closes the set. `narrative.js` gains one waiting-line
per reconciled boss (same once-ever mechanism as the opening), so the story
acknowledges progress between fights.

## Menus and surfaces

- **Tree slots.** Each phase unseals its slot: `dormant` removed, renamed
  boss-first per the ORDINAL convention — `GNOMON APERTURE`,
  `FRACTAL APERTURE`, `AMPLITUDE APERTURE`, `DYNAMO APERTURE`,
  `PARITY APERTURE`, `TERMINUS APERTURE` — tones already assigned, icons
  get a per-boss variant of the aperture mark (dial/triangle/wave/bolt/
  twin/ring worked into the ring glyph).
- **Gating.** Slot N is buyable once boss N−1 is in `world.reconciled`
  (TERMINUS: all of II–VI). Until then the slot stays dormant with a
  telling line that names both the gate and a hint of the prize:
  `Sealed behind ORDINAL. Something in here keeps the hours.` /
  `Sealed behind DYNAMO. In here, the account is still balanced.` etc. —
  the same voice, but the player is told plainly what opens it.
  ORDINAL's slot never changes.
- **Prices** (provisional, rebalance later): II 140 · III 190 · IV 250 ·
  V 320 · VI 400 · VII 500 energy. All repeatable, like ORDINAL's.
- **Aperture banner.** Boss-named and boss-toned per held type (Phase 0).
- **Boss bar.** Name, phase numeral, shells and marks all from `gauge()`;
  the bar wears each boss's tone ramp (Phase 0).
- **Codex.** Three entries per boss (core, structure, minion), 18 new
  entries, unlocked on first destruction like everything else. The boss
  core entries carry the fight's epitaph line.
- **Alerts.** `<NAME> RECONCILED`, `<NAME> LEFT A REMAINDER` — registry-fed.
- **REMAINDER & RECAST.** Unchanged: every boss leaves exactly one
  REMAINDER; RECAST stays the only sink. Seven bosses ≈ seven REMAINDERs a
  cycle, which is the economy headroom RECAST was priced for.
- **Story counter.** Boss kills stay off the tally (law 9); the 500-count
  and the bosses remain separate ladders.

## Phasing

| Phase | Ships | Gate to next |
|-------|-----------------------------|--------------|
| 0 | Boss engine, no new boss | 44/44 regress + new engine cases; ORDINAL's `fight.mjs` stage timings within noise of a pre-refactor baseline run |
| 1 | GNOMON (II) | `fight.mjs` 200–260s assists-only, all laws' cases green |
| 2 | FRACTAL (III) | same |
| 3 | AMPLITUDE (IV) | same |
| 4 | DYNAMO (V) | same |
| 5 | PARITY (VI) | same |
| 6 | TERMINUS (VII), mechanics | ring/patrol/ECLIPSE working, ~420s |
| 7 | TERMINUS cinematics + dawn, narrative lines, balance pass over all seven, full regression | everything |

One phase per request, in order, each ending: `check-build --stamp`,
regress, commit, push, bundle, artifact. Phases 1–5 are independent of each
other (any could ship next if priorities change); 6–7 need 1–5 for the
gating and the ECLIPSE tones to mean anything.

Per-boss verification template (added to regress in each phase):
1. Arrival ≥ its authored length; captions ≤ 13 chars/sec; nothing takes
   damage before it ends.
2. Assists-only completion inside the target window, via `fight.mjs`.
3. Every mandatory body's minimum distance over time ≤ 390 (law 2, measured).
4. Exactly one REMAINDER; wreck persists; wave resumes where it left off.
5. Repair/heal never exceeds its cap (law 7), and every revived body is in
   `world.enemies`.
6. Slot unseals on the right `reconciled` state and not before.
7. Boss-specific invariant in check-build (GNOMON dial closure, FRACTAL
   conservation of bodies, AMPLITUDE segment count vs broadphase, DYNAMO
   pylon distances, PARITY pane pairing, TERMINUS ring closure + floor
   radius).

## Review — what was found, and what it changed

The plan above is the improved version. Findings against the first draft,
kept here so the reasoning survives:

1. **Save wipe.** Draft bumped the save VERSION for per-boss apertures;
   `readSlot` refuses foreign versions, so that quietly deletes every
   install's run. → Additive fields on v4, no bump, and a regress case that
   a pre-Phase-0 save still loads.
2. **Aim range breaks two designs.** TERMINUS's edge ring (~800 from the
   turret) and DYNAMO's wide pylons (~430) both sat outside base
   `aimRange` 400 — un-startable fights on assists. → Law 2, the
   contraction-into-range arrival for TERMINUS, the compact pylon triangle,
   and a measured min-distance regress case for every boss.
3. **TERMINUS as a medley.** Draft gave it six stages quoting each prior
   boss — six bosses of code in one build, and a fight of reruns. → Cut to
   its own mechanic (the closing ring and the patrolling repairer) with the
   predecessors as *one* setpiece of colour (ECLIPSE) and *one* silhouette
   quote (stage III).
4. **Green on green.** FRACTAL's acid-green moods camouflaged energy
   salvage and the affordance green the whole UI uses. → Mood override
   table in Phase 0: FRACTAL's sky stays near-black, the boss carries the
   colour. Same review caught crimson-sky-vs-damage-flash for TERMINUS.
5. **Hardcoded bar.** Draft left `syncBoss` reading `CFG.ordinal` and two
   shell rows. GNOMON has one gauge, DYNAMO three pips, TERMINUS two rings.
   → The `gauge()` descriptor, with a DOM-diff case proving ORDINAL's bar
   unchanged.
6. **FRACTAL body inflation.** Draft split every kill into new bodies —
   count could triple mid-fight, wrecking both legibility and the enemy
   cap. → Conservation rule: splits only redistribute the arrival's
   bodies; check-build asserts the invariant.
7. **Tuning debt.** ORDINAL needed three builds of measured retunes; six
   bosses times that is the real schedule risk. → `fight.mjs` in Phase 0,
   stage timings in every commit, and length targets stated up front.
8. **Moving bosses vs the camera and sky.** `setFocus` assumed a fixed
   point; AMPLITUDE, DYNAMO-III and TERMINUS all move. → Focus follows the
   core every frame (already cheap); dread urgency stays tied to measured
   progress, not position.
9. **PARITY's phased half.** Draft left the wireframe crescent in
   `world.enemies` (untargetable flag) — new special case in every system.
   → Reuse the parked mechanism ORDINAL's garrison already proved: phased
   means *out of the world*, one code path, zero new flags.
10. **Blackout risk (DYNAMO death).** A full blackout frame reads as a
    crash if it lingers. → Hard-capped at 0.5s on the raw clock, with the
    core still glowing through it, and a regress case that draw calls
    continue through the beat.
11. **The needle was not a body.** GNOMON's draft needle was "a thin fixed
    body" — the physics has only circles. → Built as six collinear segments,
    the same way ORDINAL's frames are built from circles, so the planted
    needle in stage IV is a real wall with no new physics.
12. **The coil crushed.** AMPLITUDE's draft coil contracted to r 130,
    which effectively sits on the turret. → Floor raised to 150 and stated
    as a law-3 bound; TERMINUS's floor (260) was already stated.
13. **An impossible gate.** Phase 0's exit was "fight byte-identical" —
    fights roll `Math.random`. → Restated as stage timings within noise of
    a recorded pre-refactor baseline.
14. **Sealed slots hinted but never told.** The sealed lines teased the
    boss and hid the unlock rule, which reads as a bug ("why can't I buy
    this?"). → Every sealed line now opens with `Sealed behind <NAME>.`

## Open questions, deliberately deferred

- Final prices and HP (user: rebalance later). The `fight.mjs` numbers per
  phase are the input to that pass.
- Whether TERMINUS's dawn mood should persist across runs (cosmetic
  permanence) or per-run. Per-run until asked.
- Whether repeat kills of later bosses should ramp REMAINDER payout.
  One each until the RECAST sink grows.
