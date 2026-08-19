# SIMULATION 7749

A physics shooter for iPhone, played fullscreen from the home screen. One
stationary turret, five hundred objects falling in from above, and something
numbered that comes down last. Nothing you do ends the run early. You can only
be corrupted.

No build step, no dependencies, no network calls. Plain ES modules, one canvas.

---

## Play it on your phone

1. **Publish it.** In the GitHub repo: **Settings → Pages → Build and
   deployment → Source: *Deploy from a branch*** → pick the branch
   `claude/iphone-shooter-game-m6fccr`, folder `/ (root)` → **Save**.
   A minute later the site is live at
   `https://<your-username>.github.io/<repo-name>/`.
2. **Open that link in Safari on your iPhone** (it must be Safari — Chrome on
   iOS cannot install home-screen apps).
3. Tap the **Share** button → **Add to Home Screen** → **Add**.
4. Launch it from the new icon. It opens borderless: no address bar, no
   toolbars, full bleed into the notch and the home indicator.

It also works fine as a normal browser tab; it just has Safari's chrome around
it. After the first load it is cached by a service worker and runs offline.

*(Any static host works — Netlify drop, Vercel, `python3 -m http.server`.
It must be served over HTTP(S), not opened as a `file://` URL, because ES
modules and the service worker both require an origin.)*

---

## How it plays

**The lever is the main control.** A rod runs through the turret's pivot: the
grip hangs below it, the barrel sticks out above it. Grab the grip with your
thumb, swing it, and the barrel swings the opposite way — push the handle left
and you shoot right. It fires on its own for as long as you hold it. Let go
and it stays exactly where you left it; nothing recentres. Because your hand
stays *behind* the turret, it never covers the thing you are shooting at.

**Or tap anywhere ahead of the turret** and it fires there. There is no
tap-rate limit — tap as fast as your thumb allows, or hold and drag to sustain
fire. Both controls work at once, so you can drive the lever with one thumb
and tap with the other.

### The strip

**Eleven cells sit above the ability bar and never go away.** The four
**mines** stack at the left edge, the five kinds of **ammunition** stack at the
right edge, and the two things that **run on their own** sit side by side in
the middle. That is the whole of what you choose between, permanently on
screen, one tap each.

The stacks are at the edges because the middle of that band belongs to the
lever: the turret sits above it and the grip swings through it. Both stacks
grow upward from the floor line, into the part of the field that stays
emptiest.

```
                                                            [ BOLT ]
                                                            [  HE  ]
                                                            [ SHOT ]
[BLAST]                                                     [ ARC  ]
[SNARE]                                                     [RECUR ]
[WIRE ]
[KNELL]              [AUTO AIM][AUTO FIRE]
[ PULSE ][  FAN  ][ LANCE ][ WELL ][ PRISM ][ STASIS ][ DECOY ][ CHORUS ]
```

Every cell is bound on `pointerdown`, like the ability buttons are: a tap
registers the instant the thumb lands, the simulation never stops, the menu
never opens, and the tap never reaches the canvas — so changing rounds mid-wave
never costs you the shot you were about to take.

Ammunition is a radio button: exactly one is lit at all times, **BOLT** is a
cell of its own, and re-picking the loaded one leaves it loaded. (It used to
unload back to standard, which meant a fumbled double-tap silently dropped you
to the weakest round in the middle of a fight.) The mines are a radio button
too, but with no "none" cell — tapping the lit one stops laying them.

Only the middle pair has to fit the 46px band between the lever's grip at rest
and the ability bar, so only it is height-constrained; the stacks grow upward
along the edges instead. Measured at 320x480, 320x568 and 390x844: nothing
clipped, both stacks fully on screen and clear of the ability bar, and neither
reaching into the turret's column.

The whole thing is built from `ARSENAL` in `src/arsenal.js`. A new round or
mine is a table entry and no markup — it lands in its group's stack.

### The menu

One button in the top bar opens a sheet over the bottom of the screen, where
the thumb already is. **The simulation holds while it is open** — the field
stays drawn, nothing moves, and the interface keeps responding. Tap the scrim,
the ✕ or Escape to resume.

It explains rather than controls. Everything that gets chosen is chosen on the
strip, so the sheet carries the two records instead:

- **ARSENAL** — every round, mine and assist, with the one-line reason for
  reaching for it. It lights to match what is loaded right now and dims what
  has not been unlocked yet, but it is a reference: there is no second copy of
  a control in here.
- **OBJECTS** — the glossary (below).
- **SYSTEM** — sound, reset, the debug panel, the controls, and the build
  number.

Both records are built from data — `ARSENAL` in `src/arsenal.js` and `CODEX` in
`src/codex.js` — so a new round or object is a table entry and no markup.

This replaced a rack of eight chips that sat permanently over the field in two
rows, and then a menu that held the same eight one layer down. The top bar used
to carry a loadout readout as well; with every cell permanently on screen it
was a copy of something already visible, so it is gone.

### The two that run on their own

**AUTO AIM** and **AUTO FIRE** sit in the middle of the strip, between the
mines and the ammunition, and they are marked apart from the seven around them
because they are not a choice between things — they are left on or left off.
Both are off by default.

### The mines

**Four kinds, one laid at a time**, and all four can be off at once — there is
no cell for "none", so tapping the lit one is how you stop. None of them is
aimed and none is thrown by you: they are lobbed onto a random patch every few
seconds, completely inert in flight — passing straight through anything in the
way — and none does anything until it has settled. Harmless drift never sets
one off.

Switching kinds mid-run leaves whatever is already on the field to run out its
own life rather than snatching it back.

- **BLAST** goes off on contact: one hard bang, damage and knockback.
- **SNARE** does not go off. It opens, hauls everything within 210 units into
  one pinned knot and holds it for three and a half seconds, wired visibly to
  whatever it has caught. It deals **zero** damage of its own — measured —
  because the damage is the objects grinding against each other on the way in,
  and whatever you choose to put into a pile that cannot move. It collapses a
  165-unit spread down to about one.
- **WIRE** is the only one that is not a point. It unspools a 300-unit line
  across the field and cuts whatever crosses it, 105 damage a second for as
  long as that thing stays on it, shoving it off rather than parking it in the
  beam. Nothing triggers it and nothing uses it up: it is a lane closed until
  it expires. Measured: a body on the line takes damage, a body 260 units off
  it takes none, and the wire is still there afterwards.
- **KNELL** does not wait to be touched. It counts, and then it goes off three
  times where it lies, each half again as wide as the last and worth 72% of its
  damage. BLAST punishes what walks into it; KNELL denies the ground whether
  anything is there or not — measured firing all three tolls with the field
  empty.

### The ammunition

Five kinds, one loaded at a time. Every one of them buys its trick with rate of
fire, so **BOLT** — nothing done to it — stays the right answer more often than
it looks.

- **HE** makes every round detonate on impact. It costs you better than half
  your rate of fire and the shells travel slower, so single targets are no
  easier — crowds are.
- **SHOT** loads five pellets a shot in a tight cone at a slower cadence. The
  pellets expire well short of the top of the field, so it is devastating up
  close and useless at range.
- **ARC** is the weakest round in the rack on impact and the strongest through
  a crowd: the hit jumps to the nearest thing it has not touched yet and on
  again, up to four links, each a little weaker than the last. It works at any
  range, which is the one thing neither HE nor SHOT does. Poor against anything
  standing on its own.
- **RECUR** is the shot that happens again. A tenth of a second after it lands
  it reappears a little further along the same line, still travelling the way it
  was, three times over and weaker each time — so one shot hits every rank of a
  column coming straight down. It cannot land on the same body twice, so a lone
  object cannot farm it, and ORDINAL is immune to the recurrence entirely:
  there is nothing behind it to reach.

The five kinds are exclusive: picking one clears whichever was loaded, and
picking the loaded one again is a no-op rather than a silent unload.

Your hands always win: while you are holding the lever or dragging, the
assists stop steering. Auto fire runs a shade slower than driving it yourself,
so playing actively is still worth it. The boss's INVERT power mirrors auto aim
too — it corrupts targeting, not just fingers.

**Eight abilities** sit along the very bottom, in the band your thumb already
rests on. One tap each, no cost, no upgrades, no unlocks. The first time you use one,
a caption explains it.

| | Ability | What it does | Cooldown |
|---|---|---|---|
| ◎ | **PULSE** | Shockwave from the turret; shoves everything away | 7 s |
| Ψ | **FAN** | 25 pellets in a tight cone | 5 s |
| ↑ | **LANCE** | Piercing beam, auto-locked to the biggest threat | 12 s |
| ✳ | **WELL** | Singularity — hauls everything into one grinding knot, then collapses | 38 s |
| ❄ | **STASIS** | Objects freeze for four seconds; your shots do not | 21 s |
| ▲ | **PRISM** | Fused shell that refracts — wide blast plus beams in every colour | 16 s |
| ⚲ | **DECOY** | A turret that is not yours, 300 units up-field. Everything walks at it instead | 24 s |
| ✷ | **CHORUS** | Ties the field together; whatever kills one hurts the rest | 15 s |

**DECOY** is the one defensive ability. It plants a hollow copy of your turret
up-field; `Enemy.steer` picks it over you, so a scattered field becomes one pile
somewhere that is not on top of you. It is a static physics body, so things heap
up against it rather than drifting through, and it takes the collision damage of
everything it catches — 900 hit points, nine seconds, and a 260-unit blast when
it finally goes. Only one at a time; casting again detonates the old one.

**CHORUS** is the only ability that does nothing on its own. It binds every
hostile on the field for six seconds — no damage, no hold — and from then on,
whenever one of them comes apart, the few nearest bound bodies feel it. It is
the payoff for what the player does next.

Getting the numbers right took three passes, and the mechanic changed rather
than the constants. An echo that reached *every* bound body scaled as the
square of the crowd, so it was all or nothing: at a third of full health one
death took a maximum field from 44 objects to 4, and at a fifth the first echo
could not kill a NEEDLE and the chain never started. Reaching only the nearest
`spread` makes it a chain that **travels** — as far as the crowd is packed,
stalling where it thins — which is a thing the player can arrange, with WELL,
with SNARE, or just with where they shoot. Three seeds per death is still a
branching process above one, so the echo weakens by `falloff` at every hop and
one binding pays at most `hops` of them. It lands at a handful most times and a
lot occasionally, off a single seeded death; in play the player is killing
things throughout the six seconds, so the real reach is higher.

**Contact does not kill you.** When an object touches the turret the feed
corrupts — slice tearing, chroma ghosting, block noise — and *stays* corrupted
until that specific object is destroyed. The offender is ringed in red and
starts hunting you harder, so the corruption is always clearable. More
attackers, worse corruption.

### The run

0. **THE OPENING** — the field starts completely empty and stays that way for
   fifteen seconds while a four-line tutorial plays: the lever, the tap, where
   the buttons are, what the run is. Nothing is falling, so the first thing you
   do is try the controls rather than react to something.
1. **STAGING** — objects come down from off the top of the screen, across the
   whole width. Exactly five hundred glitch-causing objects exist across a whole
   run, splitter children included; the director stops releasing once the quota
   is spent, so the field drains toward the end and the last stragglers close in
   faster. When the five hundredth dies there are no hostiles left on screen at
   all — only harmless drift.
2. **THE LULL** — a few seconds of empty field with the light going wrong. No
   wall, no doors, no fight: the run simply stops.
3. **BOSS** — **ORDINAL** comes down last, slowly. It cannot hurt
   you. It takes things from you instead: your sight, your aim, your rate of
   fire. Shooting pushes it back; stop shooting and it keeps walking. See
   *The fight* below — it is not a health bar.
4. **END** — ending text on its own plate, with the turret dissolving
   underneath it, then the frame freezes mid-corruption and **RESET
   SIMULATION** appears. Reset is a clean session: the strip goes back to
   STANDARD with nothing running on its own.

A typical run is about fifteen minutes.

**And then it stops being that game.** Beating ORDINAL is remembered, and every
run after it is endless: no five hundred, no lull, no boss, no ending. The
counter loses its denominator and just climbs, the phase reads FIELD, and the
field keeps coming. The counted run is the tutorial for the game underneath it.
Nothing carries over — salvage starts at zero every time.

### Offers

**Nothing in this game ever interrupts you.** Both kinds of offer queue behind a
button that only exists while something is waiting, and opening it is what
holds the world — a choice you made, not one made for you. An offer left
untaken for eight hours is still there.

Not interrupting is not the same as being quiet. A **top-up gets a chime** and
a small green chip, because it is tempo and it will keep. A **permanent one is
the loudest thing the interface does**: a three-note fanfare, a gold frame
around the whole screen, a pill that says PERMANENT UPGRADE, and a plate that
blooms out of the corner and then keeps pulsing for as long as it is unclaimed
— an offer that never expires is otherwise very easy to forget about ten
minutes after the one moment it announced itself. A permanent one also **jumps
the queue**: the top-ups it steps in front of lose nothing by waiting, and the
button can then say AMENDMENT and mean it.

- **ALLOCATION**, every 40 kills — about twelve in a counted run. Free tempo,
  gone in a minute.

  | | |
  |---|---|
  | **RESET** | Every ability ready right now. |
  | **HASTE** | Ability cooldowns halved for 45s. |
  | **SURGE** | Double fire rate for 30s. |
  | **YIELD** | +150 salvage. |
  | **SEED** | Lay 3 mines now — a random unlocked kind if none is selected. |
  | **SHAKE OFF** | Destroy everything gripping the turret. |

  Each carries a mark, drawn the way the permanent ones are. A card is read in
  the two seconds before a tap and a shape lands before a name does; without
  them the small tier showed an empty box where the large tier showed a symbol,
  which read as something missing rather than something simpler.
- **AMENDMENT**, every 50 kills — ten in a counted run. Permanent for the run.
  Three cards, and while anything is still locked the first of them **opens
  something**, because that is the spine of a run: the turret arrives with two
  things and everything else is a choice made on the way. The second is a
  **second charge** for an ability once there is an unlocked one worth
  doubling. The third is a stat, from one of three axes, so a pick is an
  identity rather than a number:
  **AMMO** sharpens what you shoot, **FIELD** is what happens without you, and
  **TURRET** is the machine itself.

  | AMMO | | FIELD | | TURRET | |
  |---|---|---|---|---|---|
  | HOLLOWPOINT | +25% damage | DEEP MAGAZINE | +1 mine on the field | RATE | +20% fire rate |
  | HOT LOAD | +15% fire rate | QUICK LAY | +30% lay speed | HANDS OFF | auto fire matches manual |
  | TRACER | +35% round speed | LONG FUSE | +50% mine lifetime | SLEW | +50% auto aim turn speed |
  | RICOCHET | +1 wall bounce | WIDE MOUTH | +40% trigger range | OVERWATCH | +25% damage hands-off |
  | HEAVY | 2x knockback | SWEEP | blasts behind you every 20s | HARD CASING | 40 dmg/s to what touches you |
  | OVERPRESSURE | +40% HE radius | REFLEX | PULSE fires itself at 2+ grips | INSULATION | corruption costs half |
  | FIFTH LINK | ARC +1 jump | INTAKE | +50% pickup range | SHRUG | throws objects off every 15s |
  | FOURTH TIME | RECUR +1 repeat | STANDING ORDER | -20% ability cooldowns | | |
  | SALVO | every 8th shot fires 3 | | | | |

Each carries its own mark, and the card shows how many of it you already hold.
An offer is read in the two seconds before a tap, and a shape is quicker to
recognise than a name — especially for the repeatable ones, where the question
is "which is the one I already have three of".

Every one of them is a scalar on `world.up` read at the point of use — nothing
in `src/upgrades.js` reaches into a subsystem — so adding one is a table entry
and one place that reads it. The four that cannot sensibly stack are never
offered twice.

Two of them are worth calling out. **SWEEP** makes the turret clear behind
itself every twenty seconds, which is the one place the barrel cannot reach —
so the flank problem becomes something you buy your way out of. **REFLEX**
makes PULSE answer a crowd on the turret without being asked.

### Salvage

Every object leaves fragments, and a fragment is worth something from the
moment it drops until the moment it is collected. **Nothing decays.** What is on
the floor is a backlog, not a clock.

A fragment is collected by reaching the intake around the turret, or by being
destroyed — shot, blasted, or crushed. An object's worth comes from its
mass and is split across the fragments it leaves, so a bulwark pays about
twenty-eight times what a mote does. The harmless drift pays a flat six: income
the tally never sees.

Auto-aim never targets debris, and that is the whole of the active-versus-idle
gap. Leave the game running and fragments drift in on their own — measured, 112
salvage arriving from 600 units out in twenty-one seconds with nothing lost.
Sit down and play and you can turn the barrel on the floor and cash it now, at
the cost of the shots that are not going into what is coming down.

**Corruption taxes the intake.** Whatever is stuck to the turret is sitting on
the collection point:

| attached | 0 | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|---|
| intake | 100% | 78% | 61% | 47% | 37% | 30% |

It floors at five and never reaches zero, so an unattended game always earns —
just at up to a third of the rate. The salvage chip goes red when something is
on the intake; it is the only place the corruption costs a number.

### The fight

ORDINAL has no more hit points than it ever did, and none of what follows asks
anything of your hands.

**The substrate turns over.** ORDINAL does not just recolour the sky. The
lattice's vanishing point leaves the top of the field and migrates onto the
boss, following it; the rings reverse, hauled inward instead of emitted
outward; the glyph rain cross-fades from characters to numerals — the substrate
stops muttering and starts counting; and three spokes turn out of the vanishing
point with a ring closing on it, both accelerating as its ledger empties. All of
it rises over about three seconds and drains away over four when it dies. The
background is a readout of how the fight is going, without a word of text.

**The arrival.** The lull does not end in a fight. The substrate drains to
black, ORDINAL is hauled down over eleven seconds in four beats — each with its
own sound, shock and caption — and *nothing else falls for another twenty-four
seconds after that*. The opening of the fight is you and it and an empty
field.

> THAT WAS THE LAST OF THE SIMPLE WORK.
> IT HAS BEEN HOLDING YOUR FIVE HUNDRED SINCE THE FIRST ONE.
> IT WILL NOT GIVE THEM BACK. TAKE THEM.
> ORDINAL · FIRST OF ——

**It wears your count.** The five hundred are its armour. While it holds all of
them, **76%** of every hit is soaked; at an empty ledger, none is. Twenty bolts
into a full ledger do **130** damage; the same twenty at an empty one do
**494**. Every hit that lands takes some count back, and everything it spends
on its own powers is armour it no longer has — so the fight opens hard and
accelerates as the number comes home. There is no window to hit and no timing
to learn: the number on the chip *is* the shield, and shooting it is what
brings it down. A ring of tally marks around its body thins as it goes, so the
state is readable on the thing you are shooting rather than only in the HUD.

Measured end to end, holding fire on it and nothing else: the armour phase
lasts **58 s**, the whole fight **162 s**, and of the five hundred you take
back 400 while it burns 100.

**It does not advance.** It holds a station 360 units out — **204 units of open
space** between its edge and yours — and it can never be nearer than that. The
only reason it ever moves toward you is to close a gap *you* opened by shooting
it: push it off station and it eases back over about ten seconds, then stops.
Left alone for a minute it does not gain a single unit.

While it is on station its presence rewrites the feed every seven seconds. Two
seconds of sustained fire moves it 39 units, which clears the 30-unit band and
stops the corruption. That is the whole exchange: keep it pushed clear, or wear
it. There is no creep to out-race.

The three numbers have to fit the field: the top edge stops its centre at about
46 and the turret sits at about 706, so the entire range it can occupy is
roughly 474 units. A station of 360 leaves ~107 units of travel, and a band
wider than that would be one it could never push out of.

**The reversal.** Three of its powers run the game backwards.

- **REPRISE** un-kills. Fragments of things you already destroyed lift out of
  the simulation, fly back together along visible seams, and land as whole
  objects again. It prefers real debris near the assembly point and only makes
  up the shortfall from itself, so on a littered field you watch your own work
  undone.
- **ECHO** stands a copy of *your* turret across the field and shoots back with
  it. Its rounds cannot hurt you — nothing can — but they corrupt the feed and
  throw your barrel off aim when they land. They travel slowly and **can be
  shot down**, which makes your own rounds the counter to your own turret. The
  copy itself is **destructible**: 460 hit points, a ring around it that empties
  as you break it, and about eighteen bolts to finish. Killing it takes whatever
  it had in the air with it. Blasts reach it too, so abilities are not the one
  thing on the field that cannot touch it.
- **TITHE** reaches back and takes some of what you reclaimed. It only does
  this once you are meaningfully ahead, and never once the ledger is spent.

**SUBTRACT** takes one of the six ability buttons away for eleven seconds — it
prefers one that is actually *ready*, because removing something already on
cooldown would cost you nothing. The button goes dark and struck through. It
still cannot damage you; it can only leave you with fewer options.

**Nothing in the fight is captioned.** There used to be a row of sticky status
pills naming every effect, plus a banner for each power as it fired; between
them they covered the boss completely. Both are gone, and so is the row they
lived in. Every state is legible from the screen instead: the tally shell thins,
the background turns over on each aspect, a withheld button goes dark, the
clone wears its own health ring, and the two effects that would otherwise read
as a broken control get a mark on the gun rather than a caption over the boss —
a cross across the muzzle for a throttled feed, and a pair of arrows facing
inward for a mirrored axis. The only words in the whole fight are the four
arrival captions, which are over before it starts.

At zero the chip reads **SPENT** and it stops rationing entirely: it walks 2.4×
faster and casts twice as often, and nothing absorbs anything any more.

The background turns over with it — near-black through the arrival, then gold,
violet and crimson as it moves through its three aspects.

### The glossary

Every object has an entry in **OBJECTS**, and an entry unlocks the first time
you destroy one of that kind — the boss included. Until then the name is blocks
and the portrait is empty. The portraits are drawn with the field's own shape
routines, so the glossary can never drift out of step with the thing itself,
and each description is a field note in the same voice as the story.

The record is kept in `localStorage` and **survives a reset**, because it was
never yours: it belongs to whoever has been counting. Harmless DRIFT and a
TOW's MASS both count for the glossary even though neither counts toward the
five hundred — the record is of what has been destroyed, not of what was owed.

A new entry says so without a word: the menu button pulses and its count goes
up. An alert would have been text over the boss the moment ORDINAL emitted
something new.

### The opening

Almost nothing is said up front, because almost nothing is in hand. The turret
is issued with **BOLT and PULSE** and nothing else. The four other rounds, all
four mines, both of the ones that run on their own and seven of the eight
abilities start locked — drawn on the strip and the bar from the first frame,
greyed and inert. A press on one nudges and does nothing.

Every one of them is a **permanent upgrade**, bought from the AMENDMENT tier of
the offer system. The shape of what a turret could become is on screen from the
start, which is what makes a card that hands you WIRE mean something after ten
minutes of looking at its cell.

Four lines run over the empty field — the grip, the shot, that PULSE can never
be taken, and that what is coming cannot kill you — and then it stops talking.
Four more are spread across the count for the three things the run gives back:
SALVAGE at object 2, ALLOCATION at object 20 with a real one waiting on the
button, AMENDMENT at object 44, and a reminder at 120 that everything not in
hand is still out there.

**Everything else explains itself the first time it is used**, which is minutes
after it was bought and only if the player reaches for it. `FIRST_USE` in
`src/tutorial.js` holds one sentence per thing, and the unlock card carries the
same sentence — so the card that hands you a round and the caption that greets
you using it say the same thing, and neither has to be read twice.

`holdFor()` sizes every line to itself — a beat to notice it, then about 180
words a minute — and the band keeps `STACK` of them, the older pushed up and
dimmed rather than taken away. The lines sit on a plate; they land among lit
objects and two text-shadows were not enough to hold grey 12px type apart from
that.

**RESET SIMULATION does not bring the opening back**, on purpose. **REPLAY
OPENING**, in the menu's SYSTEM tab, does: it clears the flag and restarts, and
it works on a cleared save too. **UNLOCK ALL**, in the debug panel, hands over
every round, mine and ability at once.

### The first minute

Nothing hostile is released for `openingGrace` seconds. Harmless **drift**
starts at `driftStart`, well inside that, so there is something to shoot at
while the field is still safe.

And then it arrives gently. The population target and the spawn rate climb from
`warmPop` to normal over `warmKills` objects **or** `warmSeconds` — whichever
comes first, because on kills alone a player who shoots nothing would sit in
front of two objects indefinitely. It is thinner still for the first
`teachKills` objects, capped at `teachPop`. LURCHER is held back to object 10,
so the first things down are MOTEs and NEEDLEs and nothing else. Endless runs
skip the warm-up entirely.

### Charges

An ability holds one use and behaves as a plain cooldown, and nothing extra is
drawn on it. A **second use is a permanent upgrade**, one ability at a time,
and only then do pips appear on that button — an empty slot for a thing you
have not bought is a nag, not a readout. Charges refill one per cooldown, so a
two-charge ability takes two cooldowns to come all the way back, and the button
reads ready while there is still one in hand.

A charge is only ever offered for an ability that has actually been unlocked.
**SUBTRACT only takes one that has been unlocked too** — taking away a button
never bought costs the player nothing and reads as a greyed button going
slightly greyer, and SUBTRACT is ORDINAL's whole character. Measured: with only
PULSE open it takes nothing at all, because PULSE is never on the table.

### The objects

Twelve kinds, each with its own mass, speed, restitution and way of dying.
They unlock progressively as the count climbs.

- **MOTE** — small, light, gets punted across the arena by a single bolt.
- **NEEDLE** — the fast one. Thin, fragile, arrives early.
- **LURCHER** — heavy hexagon that shoves itself forward in bursts.
- **SPLITTER** — bursts into four motes that inherit its momentum.
- **BLOOM** — detonates on death and takes its neighbours with it. Chains.
- **BULWARK** — armoured, enormous mass. Bolts barely move it; PULSE does.
- **WARDEN** — three orbiting plates that eat bolts. Strip them first.
- **PRISM** — reflects glancing shots. Hit it square, or bank the ricochet
  into something else.
- **HERALD** — a beacon. It hardens the nearest few hostiles around it, and
  shows you it is doing so: a thread out to each one and a shell on each of
  them. Covered objects take 62% less. Kill the beacon, not the escort — the
  cover lapses a frame after it dies.
- **GLUT** — eats the mess. Every fragment it touches makes it bigger, heavier
  and tougher, one visible seam per mouthful, from 16 units up to 52 and from
  90 hit points up to 350. A littered field is its food supply, so it is the
  only object whose threat you control.
- **TOW** — a head dragging a heavy mass on a cable. Both halves are real
  bodies under a distance constraint, so the pair swings across the field and
  shoves whatever it catches, and both count — a TOW is **two** of the five
  hundred. Cut either end and the cable goes slack.
- **DRIFT** — harmless. No goal, no destination, no threat: it wanders on a
  slow random walk, wanders back up the field as often as down, never
  breaches the turret, never triggers a mine, is never auto-targeted and does
  not count toward the tally. It is there to be shot at and shoved around.

Every object picks a **route** when it spawns — direct, sweeping, wide,
serpentine, hooking or loitering — as a lateral offset that folds in as it
closes. Two of the same type released together arrive by visibly different
arcs, and all of them still arrive.

Everything leaves **fragments**: smaller bodies that are themselves
destructible, pushable, and dangerous to each other. Up to 128 can be loose at
once, and a bulwark alone sheds fourteen.

Drift and fragments are budgeted **separately** from hostiles — `hostileCount()`
is what the spawn director measures against `popStart`/`popEnd`, so the amount
of harmless matter floating around can be changed freely without touching the
pace of the run.

### The physics

Impulse-based circle dynamics: restitution, tangential friction (which is why
things spin when they scrape), positional correction, a uniform-grid
broadphase, and distance constraints for TOW cables, solved after the contact
pass so a towed pair cannot be pulled apart by whatever it just shoved. Mass is `density × area`, so heavy objects genuinely shrug off
what light ones can't.

**Collision damage is live.** Impacts above a threshold hurt *both* bodies in
proportion to reduced mass and closing speed. Punting a mote into a lurcher
hurts the lurcher. WELL is built entirely on this: it drags everything within
reach into one spinning knot and most of the kills happen on the way in,
before the collapse goes off at all.

### The story

It is never called a room. Where a noun is unavoidable it is *the shallows* —
open, shallow, and with something deeper past it — and most lines avoid naming
the place at all.

Ten sentences, one per fifty objects destroyed, then six more at the end.
They appear in the mid-field, drawn *behind* every entity so they can never
hide something you need to shoot, and they corrupt away after a few seconds.
They are the only place the game says what it thinks it is about, and they
never quite say it — the shapes are simple on purpose, someone is counting,
and the thing that comes down last is a lock rather than a finish line.

---

## Debug

The menu's SYSTEM tab opens the debug panel: skip to the count, skip to the boss,
kill the boss, +50 kills, advance the story, force a boss power, force a
reprise, raise an echo, force a tithe or a subtract, drain the ledger to the
spent endgame, skip the arrival, spawn a formation, fill the field, clear the field, trigger a glitch, throw either kind
of mine, jump to the end screen, restart — plus toggles for cooldowns, corruption, slow motion,
hitboxes, and a live stats readout.

With **STATS** on, the boss fight adds four lines: the ledger with how much
has been reclaimed and how much burnt, the current armour multiplier and
arrival progress, how many reprises and echo rounds are live, and how many
ability buttons are withheld.

---

## Layout

```
index.html              markup + PWA meta
styles.css              all interface chrome
manifest.webmanifest    standalone display, portrait, icons
sw.js                   offline cache
icons/                  generated PNGs (see scripts/make-icons.mjs)
src/
  main.js               bootstrap, frame loop, gesture suppression
  game.js               world state, phase machine, physics stepping, render pipeline
  config.js             every balance number lives here
  util.js               math + canvas helpers
  physics.js            grid broadphase, impulse solver, impact damage
  fx.js                 pooled particles, shockwaves, screen shake, ripples
  background.js         the substrate: nebula, lattice, glyph rain, dust
  glitch.js             full-frame corruption compositor
  audio.js              WebAudio synth (no assets)
  enemies.js            object types, behaviour, death, spawn director
  projectiles.js        swept-collision bolts and bursting rounds
  mines.js              inert-in-flight mines: blast and snare
  shooter.js            the turret
  boss.js               ORDINAL: arrival, worn ledger, reprise, echo, tithe
  abilities.js          the eight abilities and their effects
  narrative.js          the ten sentences, and how they decay
  hud.js                DOM interface, incl. the nine-cell strip
  arsenal.js            rounds, mines and assists: icons, notes, strip order
  menu.js               the menu sheet, built from data
  codex.js              the glossary, and what has been recorded
  tutorial.js           the opening script: intro lines, unlock ladder, outro
scripts/
  make-icons.mjs        regenerates icons/  (node scripts/make-icons.mjs)
  smoke.mjs             headless run through every phase (see below)
```

## Tuning

`src/config.js` is the only file you need for balance. The knobs that move run
length most: `bolt.damage`, `shooter.gripFireInterval`, `openingGrace`, `boss.hp`,
`popStart`/`popEnd`, and `spawnInterval`.

`boss.hold`, `boss.pushBand` and `boss.pushPerBolt` are the three that decide
how the boss fight *feels* in the hand. They are coupled: the band must be
smaller than `topLimit − hold`, or it is a band the player can never leave.

The boss fight is tuned entirely under `boss.ledger`, `boss.reprise`,
`boss.echo`, `boss.standoff`/`boss.loom` and `boss.firstSpawn` —
`ledger.armour` sets how hard the opening is, `ledger.reclaimPerDamage` sets
how fast the count comes home, and the `ledger.*` costs set how much it burns
on its own account. Reach for those before `boss.hp`: raising hit points makes
the fight longer, not harder.

`zoom` is the camera. Everything in the game runs in *world units*; the whole
scene is drawn scaled by `zoom`, so lowering it pulls the camera back and
enlarges the arena without touching a single gameplay number. `shooter.standoff`
sets how far the turret sits above the ability strip, and `shooter.gripLen` is
the length of the lever's lower arm.

## Shipping a change

Bump the build number in **two** places, then run the guard:

1. `BUILD` in `src/config.js` — the source of truth, shown on the title screen
2. `BUILD` in the inline `<script>` at the top of `index.html`, which runs
   before any module can load and so cannot import it

```bash
node scripts/check-build.mjs   # fails if the two disagree
```

`sw.js` no longer holds a copy: `main.js` registers it as `./sw.js?b=<BUILD>`
and the worker derives its cache name from that query string. A hand-copied
constant there silently drifted across three releases before this.

The inline script is the recovery path: on a build change it unregisters every
worker, drops every cache and reloads once, so a device can never be pinned to
an old build. The worker itself is network-first with a cache fallback, so it
serves the newest code whenever there is a connection and the game still runs
offline. If the title screen shows an old build number, that is the signal
something is stale.

## Performance

Targets a stable 60 fps. Everything expensive is avoided by construction — no
`shadowBlur`, no `getImageData`, no per-frame gradient churn; glows are
pre-rendered sprites, the nebula and the scanline/vignette overlay are cached
layers, and particles are pooled. Physics runs on a fixed 1/120 s substep with
an accumulator. A quality governor watches the rolling frame time and steps
particle budget and device-pixel-ratio down (and back up) if a device
struggles.

Measured main-thread simulation cost with a full 44-object field is ~0.7 ms
per frame, leaving the rest of the 16.7 ms budget to rasterization. Actual
rasterization is GPU-side and cannot be measured meaningfully in the headless
harness (which falls back to software rendering), so the fill-rate work is
kept deliberately low rather than benchmarked: caching the nebula and overlay
layers and dropping per-projectile gradients cut software raster time roughly
in half.

## Verifying changes

```bash
npx http-server -p 8099 -c-1 .          # serve
node scripts/smoke.mjs                  # headless run: play, abilities,
                                        # lull, boss, powers, ending, restart
```
The smoke test drives the game through every phase in an iPhone-sized viewport,
writes screenshots to `/tmp/sim7749-shots`, and exits non-zero on any console
error. It needs Playwright available (`NODE_PATH` may need to point at a global
install).
