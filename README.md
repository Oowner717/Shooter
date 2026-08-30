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

**Nine cells sit above the ability bar and never go away.** Four **mine**
slots stack at the left edge, five **ammunition** slots stack at the right
edge, and the two things that **run on their own** sit side by side in
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
[SNARE]                                                     [SPINE ]
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
mine is a table entry and no markup.

### Saving a run

**The run writes itself down, and the title screen offers it back.** This is
played on a phone, in sittings, and a backgrounded PWA can be killed between
one glance and the next without ever being told. Losing a two-hundred-kill run
to that is not a difficulty setting.

It is a **checkpoint, not a snapshot**. What is kept is the progress — the
count, the energy, what has been unlocked, what is on the strip, which round
and mine are loaded, the two running toggles, the offer clocks and anything
queued — and not the field. The objects in the air, the barrel's angle, a mine
mid-flight: none of it is restored, because restoring a live field is a great
deal of machinery for a moment nobody is attached to. **You come back to your
count, your kit and your energy, standing on clear ground.**

The permanent tier is stored as **decisions rather than numbers**. `taken` is
the list of AMENDMENT ids accepted, in order, and `resume()` replays them
through `BY_ID` in `src/upgrades.js` to rebuild `world.up`, the ability charges
and the held counts from the one table that defines them. A saved figure would
go stale the moment an upgrade was retuned; a saved decision does not. `resume()`
runs a full `reset()` first and then overwrites what was kept, because a
resumed run and a new one differ in what has happened, not in how anything
works — every subsystem still wants its own reset before it is told where it is.

Written to `sim7749-run`, about 600 bytes. It saves every four seconds off the
world clock, immediately on taking a permanent card, and again on
`visibilitychange` and `pagehide` — on iOS that last one is the only event the
page is guaranteed to get on the way out. It is only ever written from
`staging` or `lull`: mid-boss and mid-ending are not places to be picked up
from. It is dropped on BEGIN, on RESET SIMULATION, and when ORDINAL falls.

A save from another build is **discarded rather than migrated**. The tables it
names — round keys, mine keys, upgrade ids — are exactly what changes between
builds, and half-restoring a run is worse than starting one. So is a save that
names a round no longer on the strip: the turret falls back to something it
actually has a cell for rather than loading a round it cannot see.

On the title screen a saved run gets **its own button**, carrying the count.
Two buttons rather than one that changes meaning, because the alternative is a
player tapping the only button on the screen and silently losing a run — and
they share one row, since at 320x568 the panel already ends level with the fold.

### The loadout

**The strip shows what you are carrying, not what you own.** Those were the
same list while there were exactly as many rounds as there were cells, and they
stop being the same list the moment there is a sixth round — so they are
separated: `world.unlocked` is everything bought, and `world.loadout` in
`src/loadout.js` is the handful of it the strip actually shows. Four mine cells
and five ammunition cells, and **that count is fixed**: it is how many fit in
the band between the lever's grip and the ability bar, and that band does not
grow because the arsenal did.

Two buttons sit between the stacks and the two that run on their own — one
beside each stack — and open the loadout screen for that kind. It lists every
round or every mine: the ones you own are rows you can tap on and off the
strip, and the ones you do not are greyed and hatched in the same language the
rest of the interface uses for locked things, so a stack with two things in it
says what the other two could be. The slots themselves are drawn across the top
of the sheet in strip order. An empty cell on the strip opens the same screen,
because an empty cell is a question and that screen is the answer.

**Every round and every mine is described the same way, in the same order.**
`src/arsenal.js` carries two short fields for each — `dmg`, which is the
number, and `fx`, which is the one thing it does that nothing else does — and
the loadout sheet, the ARSENAL tab and the card that hands the thing over all
render exactly those, from that one table. It used to be a paragraph each:
considered, quite good, and read by nobody choosing a loadout mid-fight. A
comparison is only useful if it can be made at a glance, and a glance is what
this screen gets.

**The slots across the top of the sheet are buttons.** Pressing one takes that
round or mine back off the strip, because the shortest way to undo a choice is
to press the choice. The same two rules apply as anywhere else: the last round
cannot be removed, and a refused press flashes rather than doing nothing.

**A newly bought round or mine takes a free cell by itself** — buying a thing
and watching nothing happen is not a reward. **If both its cells are full it
stays owned and off the strip**, because which four mines are under your thumb
is a decision and that is not the moment to make it for you; it waits in the
loadout screen with NO SLOT against it until you take something off.

Two rules keep the state sane: the turret always keeps at least one round, and
taking the loaded round off the strip moves it to whatever is left.

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

**Three numbers govern every kind, and no upgrade may move any of them.** They
are a contract with the player rather than a balance dial:

    five on the field · fifteen seconds each · one thrown every fifteen

One clock for all eight kinds, not one each. Note what that arithmetic means: a
throw every fifteen seconds against a fifteen-second life is a **steady state
of one mine**, laid as the last one goes — measured at throws on 0.2s, 15.2s,
30.2s and 45.2s with one on the field at the end. The cap is a backstop, not a
target.

Reaching it takes something that does not touch the three: a **SEED** offer,
which lays three at once, or **PAIRED CHARGE**, which lays more per throw.
Measured peaks: 2 with nothing taken, 4 with one PAIRED CHARGE, 5 with two —
and 5 with six, because five is five.

**A sixth pushes the oldest off**, and it goes the way its kind goes: a BLAST
bangs, a SPALL throws its fan, a KNELL rings out what it still owes. Being
crowded off the field is not the same as being wasted. With the clock and the
lifetime equal this should never come up by laying alone, which is the point of
setting them equal.

Switching kinds mid-run leaves what is already down to run out its own life.

**Each kind was cut a third in build 50, and each cut has an upgrade against
it.** The point is that a mine's power is now something a run assembles rather
than something it starts with:

  | | base was | base is | upgrade | back to |
  |---|---|---|---|---|
  | BLAST damage | 140 | 95 | SHRAPNEL | 138 |
  | SNARE hold | 3.6 s | 2.4 s | DEAD WEIGHT | 3.96 s |
  | WIRE damage/s | 105 | 72 | HOT WIRE | 108 |
  | KNELL tolls | 3 | 2 | FOURTH BELL | 3 |

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
  beam. Nothing triggers it, nothing uses it up and it does not expire: it is a
  lane closed for good. Measured: a body on the line takes damage, a body 260
  units off it takes none, and the wire is still there afterwards.

- **THORN** is not a charge. It opens into a patch of burning ground and stays
  open — nothing triggers it and nothing uses it up, and anything standing on
  it is being hurt the whole time it stands there. It shares its implementation
  with SPORE's patch, because they are the same object with different numbers.
- **LODE** does no damage and cannot be triggered. It pushes, constantly, and
  everything in reach is walking uphill — hardest at the centre and nothing at
  all at the rim, so the edge is somewhere a body can sit rather than a wall it
  bounces off. Measured: a body moves outward and loses no health at all. Its
  reach was cut 60% in build 53, from 235 to 94: at the old figure one mine
  closed most of a lane on its own, which made the placement of it uninteresting.
- **SPALL** is a claymore. It triggers like a BLAST and throws everything it
  has in one direction rather than all of them: measured at 14 pellets, every
  one of them up the field.
- **VOID** removes one thing, whatever it is, and is then spent. It does not
  care about armour or health or size — measured against a 99,999-hp body. Its
  mouth is deliberately small: 18 units of trigger, walked into rather than
  approached, which is small enough that a VOID often expires unused. **EVENT
  HORIZON** is the one upgrade that touches it and takes that to 39.6 — asked
  per kind rather than folded into WIDE MOUTH, so it widens nothing else.
- **KNELL** does not wait to be touched. It counts, and then it goes off three
  times where it lies, each half again as wide as the last and worth 72% of its
  damage. BLAST punishes what walks into it; KNELL denies the ground whether
  anything is there or not — measured firing all three tolls with the field
  empty.

### The ammunition

Nine kinds, one loaded at a time. Every one of them buys its trick with rate of
fire, so **BOLT** — nothing done to it — stays the right answer more often than
it looks.

Build 54 gave the five that had nothing of their own something to grow into.
BOLT gets **OVERSTUFFED** — three levels then, four as of build 60 — and stops
being a round that ends in the first thing it meets: it comes back off a body
the way it comes off a wall, keeping 70% of its damage each time, so one round
crosses up to five objects. Note the geometry it wants: a rebound mirrors about
the surface normal, so a shot fired dead-centre into a flat row comes straight
back the way it came and leaves. It pays in a pocket, not against a wall —
measured, one round through a cluster of six hit three of them for 57. It also gets **DOUBLE TAP** — a
follow-up round that waits 0.06s at the muzzle rather than shortening the
cadence, which reads as one trigger pull with a stutter in it and not as a
faster gun. It had a second level, TRIPLE TAP, until build 189: it was the
cadence cliff on its own, taking rounds a second from 7.6 to 25.9 across one
tier of income. HE gets **CLUSTER**, four smaller bursts thrown out around the
first, which turns a circle into a patch of overlapping circles: measured, four
bodies at 118 units that the plain burst does not reach at all. SHOT gets
**DOUBLE-O** twice over — 5 pellets to 8 to 11, filling the cone in rather than
widening it — and **LONG SHOT**, which moves the range cliff from a mean 467
units out to 735 without ever removing it. ARC gets **SUPERCONDUCTOR**, which
takes a link's falloff from 0.86 to 0.95 and keeps the far end of a chain
worth having, and **LONG LEAD**, +60% jump range, which is what makes it work
on a spread field rather than only a packed one. SPINE gets **ANNEALED**, 0.78
to 0.92 per body, and **RAILED**, which puts it through armour entirely —
measured at 13.2 to 20 against a BULWARK.

- **HE** makes every round detonate on impact. It costs you better than half
  your rate of fire and the shells travel slower, so single targets are no
  easier — crowds are.
- **SHOT** loads five pellets a shot in a tight cone at a slower cadence. Range
  is `speed x life` and nothing else, and life was cut a quarter in build 47:
  measured, a pellet now covers about **474 units against a 1206-unit field**,
  where a BOLT crosses 1267. It reaches a third of the way up, so it is
  devastating up close and useless at anything else.
- **SPINE** does not stop at the first thing. No chaining and no repeating: it
  carries straight out the far side, a little weaker each time. Measured
  through a column of three at 13, 10 and 8.
- **SLUG** hits harder than anything else per shot and moves what it hits a very
  long way — measured at 44 damage and 100-plus units of travel on one shot. It
  used to do 14, on the theory that the damage would come from whatever you
  shoved it into. It is now the one round on the field that *cannot* do that —
  see the note on the SLUG mark under **The physics** — so the 2.4× rate penalty
  had to buy something real. It is the biggest single hit available and still
  under BOLT on sustained damage, because it still brings the shove.
- **RIME** drags whatever it touches to a crawl for a few seconds — measured
  taking a body from 200 units a second to about 13. It kills nothing by
  itself; it buys the time for everything else to.
- **SPORE** bursts into a patch of ground that keeps burning after the shot is
  over: 14 damage on impact and 75 by the time the patch has finished. The one
  round you fire where something is going to be rather than where it is.
- **TITHE** barely hurts on the first hit, and every hit after it hurts more.
  Each one deepens the mark, up to eight, and the mark is read at the moment of
  impact rather than at the muzzle: 5.3 damage on the first hit and 19.8 on the
  sixth, measured on one body. A marked body also pays several times over when
  it comes apart — 70 energy against 20 for the same body unmarked — and the
  mark rides down onto the motes, because that is where the energy is. The
  ramp is what makes it an answer to one large thing without ever changing
  ammunition, which is what a long fight against a single body needs. **LIEN**
  raises the ceiling from eight marks to fourteen: measured, a sixteenth hit
  goes from 28.5 to 45.9 on the same body.
- **ARC** is the weakest round in the rack on impact and the strongest through
  a crowd: the hit jumps to the nearest thing it has not touched yet and on
  again, up to four links, each a little weaker than the last. It works at any
  range, which is the one thing neither HE nor SHOT does. Poor against anything
  standing on its own.

**Build 55 scrapped two of them.** HALO — the round that orbited the turret —
went one build after it arrived: it answered a problem the rest of the rack
answers, and a round that is not aimed is a round that does not play. SUNDER
went with it, and nothing replaced it; opening a body's plating so that
*everything else* lands harder is a setup round, and a setup round wants a
second hand on the lever that this game does not have. Removing SUNDER took
the whole mechanic with it — no body carries a plating timer any more — rather
than leaving a multiplier in `applyDamage` that nothing could ever set.

The kinds are exclusive: picking one clears whichever was loaded, and picking
the loaded one again is a no-op rather than a silent unload.

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
Nothing carries over — energy starts at zero every time.

**The run is saved, and it is saved on a wave.** `save.js` writes a checkpoint
on a slow timer and again the instant the page is hidden — on a phone that is
the last event anything reliably gets. What is kept is progress, not the field:
the count, the loadout, the permanent cards taken, and the wave rotation with
the position in it. Coming back puts you on **the wave you left, restarted from
the top of it**; half a wave is not a place anyone remembers being. A run that
quit before its first wave ever started is left exactly as a fresh one, opening
grace and tutorial waves and all.

**Nothing is said twice.** A tooltip seen once is seen. The teaching ladder
resumes at the step it reached rather than replaying from the top, and every
first-use hint already shown stays shown. Setting `teaching = false` outright,
which is what resume did until build 71, also silently cancelled the rest of
the opening for anyone who quit four lines into it — so a run that closed the
tab during the tutorial never got the other fifteen lines either.

### There are no Offers, and no AMENDMENT

This section used to describe a card system: **ALLOCATION** every 40 kills for
free tempo, **AMENDMENT** every 50 for something permanent, both queued behind a
button that held the world when you opened it. **None of it exists.** AMENDMENT
went in build 83, the offer pool went with it, and everything permanent is
bought from the tree with energy now — one currency, one screen, and no roll.
The `.fx*` rail that showed SURGE and HASTE counting down was deleted as dead
CSS in build 186, twenty-odd builds after the last thing that could set it.

It is recorded rather than quietly cut because the reasoning underneath it is
still the game's, and two of the rules it arrived with outlived it:

**Nothing in this game ever interrupts you.** Whatever holds the world is
opened by the player — the menu, the loadout, the aperture banner, the wave
sheet. That rule is older than the tree and survived the system that produced
it.

**`grantCharge` refuses a third use.** The roll had always offered each charge
once; that made it true of the granting as well rather than only of the
offering. The tree sells the second charge now and the guard still holds.

**Three kinds of ceiling, and the card says which.** An upgrade with no `levels`
field repeats without limit and counts what you hold: `x3`. `levels: 1` is a
switch, and a switch cannot be thrown twice. In between is one with a shape to
it, and those count what is left — `LV 2/3` — because that is the question a
ceiling raises. Note the default is **three**, not one: `tree.js` reads
`u.levels ?? 3`, so a node the author never capped is sold three times. Check
the tree's number, not the upgrade's.

**Every effect is a scalar on `world.up`, read at the point of use.** Nothing in
`src/upgrades.js` reaches into a subsystem, so adding an upgrade is a table
entry and one place that reads it.

**Each carries its own mark.** A shape is quicker to recognise than a name,
especially for the repeatable ones where the question is "which is the one I
already have three of".

**There is deliberately no list of the upgrades here.** There was one — three
tables, sixty-odd rows, kept by hand — and by build 206 it still advertised
HOT LOAD (removed in 193), TRIPLE TAP (189) and REFLEX (190). A mirror of the
tree drifts from the tree, and a stale list is worse than no list because it
reads as authority. `src/upgrades.js` is the table; `src/tree.js` places it;
`scripts/check-build.mjs` fails the build if a single buyable thing is missing
or placed twice.

### Energy on the floor

Every object leaves energy, and a mote is worth something from the moment it
drops until the moment it is taken in. **Nothing decays.** What is on the floor
is a backlog, not a clock. An object's worth comes from its mass and is split
across the motes it leaves, so a BULWARK pays about twenty-eight times what a
MOTE does. The harmless drift pays a flat six: income the tally never sees.

**Energy is drawn small, whatever it came off.** A mote's radius, and an
explosion shard's, were both a fraction of the parent's — so a BULWARK dropped
pieces 16.7px across, a grafted one 22.7px, and its burst threw spiky shards
bigger still. A live NEEDLE is 12.4px and the smallest body in the game is
9.9px, so the floor and the flash were full of things that read as bodies and
were not.

`CFG.drop` caps both. Every mote now draws 2.1–5.5px, and explosion shards get
a looser ceiling (`drop.burst`) because they live under a second and a big
object should still come apart bigger than a small one: 3.8px from a MOTE,
7.9px from a BULWARK. The ceiling is a *drawn* value rather than a fixed one,
because a flat clamp pinned every piece off anything large to exactly the
maximum and a floor of identical pieces reads as tiling.

**Corruption taxes the intake.** Whatever is stuck to the turret is sitting on
the collection point:

| attached | 0 | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|---|
| intake | 100% | 78% | 61% | 47% | 37% | 30% |

It floors at five and never reaches zero, so an unattended game always earns —
just at up to a third of the rate. The energy chip goes red when something is
on the intake; it is the only place the corruption costs a number.

How energy is actually collected — PULSE, INTAKE and SCOUR — is under
**Energy, and how it is taken in**, further down.

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
  objects again. It prefers real energy near the assembly point and only makes
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
is issued with **BOLT, PULSE and FAN** — one round, one way to shove a crowd
off, and one way to remove it — plus **AUTO AIM and AUTO FIRE**, both switched
off. Those two are not power: they are the difference between playing this with
a thumb on the lever and leaving it running, and which of those a session is
should be the player's to choose in the first minute rather than something the
offers eventually get round to.

The four other rounds, all four mines and six of the eight abilities start
locked — drawn on the strip and the bar from the first frame. A press on one
nudges and does nothing.

There are **three states, not two**, and the middle one used to be missing. A
cell you can press but have not selected looked all but identical to one you
have not unlocked — both a grey outline with a grey label — so an AMENDMENT
that opened SHOT changed almost nothing on screen. Anything unsealed now
carries its own tone in the border, the icon and the label; `.on` is a further
step up from there rather than the only step; and a locked cell is fully
greyscaled and hatched, so it reads as scenery rather than as a dim button.
(Hatched rather than dashed: the cells are clip-pathed, and a dashed outline
breaks at the cut corner.)

**And the one that just opened says so.** The offer sheet covers the screen
while the card is being chosen and then closes, so without it the only sign of
which of fourteen locked things had become yours was one cell somewhere
stopping being grey while you were looking at a card. It blooms and then holds
a glow for five seconds — long enough to be found after the sheet is gone.

Every one of them is a **permanent upgrade**, bought from the AMENDMENT tier of
the offer system. The shape of what a turret could become is on screen from the
start, which is what makes a card that hands you WIRE mean something after ten
minutes of looking at its cell.

Four lines run over the empty field — the grip, the shot, that PULSE can never
be taken, and that what is coming cannot kill you — and then it stops talking.
Four more are spread across the count for the three things the run gives back:
ENERGY at object 2, ALLOCATION at object 20 with a real one waiting on the
button, AMENDMENT at object 44, and a reminder at 120 that everything not in
hand is still out there.

**Everything else explains itself the first time it is used**, which is minutes
after it was bought and only if the player reaches for it. The one exception is
the issued round: BOLT is loaded from the first frame, so by the time anyone
taps its cell they have been shooting it for minutes, and its caption is marked
spent before the run starts. Re-picking whichever round is already loaded is
silent for the same reason — a first-use line is about a change, and nothing
changed. `FIRST_USE` in
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
front of the opening field indefinitely. It is thinner still for the first
`teachKills` objects, capped at `teachPop`. LURCHER is held back to object 10,
so the first things down are MOTEs and NEEDLEs and nothing else. Endless runs
skip the warm-up entirely.

**Build 58 moved the opening earlier and made it wider, not faster.**
`openingGrace` went 27 → 22, because the fourth opening line is said at 20.6s
and reads for another 5.7 — "something is coming down now" — and at 27 it had
finished and gone before anything did. At 22 the first object arrives while
that sentence is still on the screen, which is the beat it was written for.
`warmPop` went 2 → 5 and `teachPop` 5 → 6: two objects is not a field, it is a
queue, and a player who wanted to try a mine or an ability had nothing to try
it on. **Both rate scalars are untouched** — `warmRate` 0.42 and `teachRate`
0.62 still hold spawn attempts to roughly one every four seconds through the
opening. More of them standing there; no faster a stream. Measured from a cold
start: nothing until 22s, three on the field by 26s, six by 36s, and the cap
holds at six until the opening finishes.

### Energy, and how it is taken in

**The currency is energy.** An object carries it, and when it comes apart the
energy is left behind as small bright motes in the object's own colour. They
drift toward the turret at `energy.pull` and land on it. That is as far as they
get on their own.

**PULSE is how you take it in.** The one ability that can never be taken from
you does three things at once: it hurts what is near you, it shoves it away,
and it draws in every mote within `energy.pulse` — 400 units, a little wider
than its own 340 blast, because a shockwave that damages a body ought to reach
the energy sitting just past it. So the ability you always have is also the
economy, and the loop is: break things, watch the energy gather on you, pulse.

**Energy is not a target.** It cannot be damaged and it cannot be destroyed — a
round passes straight through it to whatever is behind, and a blast shoves it
around without consuming it. It is not rubble to be broken up a second time; it
is the charge the object was carrying, and the only thing that can happen to it
is being taken in. That also means an uncollected floor no longer eats your own
rounds, which it did between builds 59 and 66, when the same objects were
wreckage and destroying each one was how you got paid.

**INTAKE automates it.** One permanent upgrade, one level: energy is taken in
on contact, no PULSE needed. **SCOUR**, a top-up, is the same verb with no
limit on the reach and +50% on the take.

It is drawn to look like energy rather than like rubble: a filled core inside a
pulsing halo, additive, at full brightness — it has no health to read, so
nothing dims it. Absorbing throws a streak per mote from where it lay into the
turret, accelerating and brightening as it arrives, so a PULSE that empties the
floor is visibly a stream going in rather than a number in the corner going up.

Every mote draws between 2.1 and 5.5px whatever it came off (`CFG.drop`), well
under the 9.9px of the smallest body, so nothing on the floor can be mistaken
for something alive. What a mote is worth comes from the parent's mass, split
across the motes it leaves — never read off its size.

**In the code** the currency is `world.energy`, the pieces on the floor are
`world.drops`, and a piece is `isDrop`. They are deliberately *not* called motes
in code, though that is the right word for them in prose: there is an enemy type
called MOTE, and two things of one name is how a reader gets hurt.

The opening says it, gated on the first kill so there is energy on the floor to
point at: *"Broken objects leave ENERGY. It is not an enemy. It drifts to you."*,
then *"PULSE takes in the energy near you. ENERGY is the green number."*

### Wreckage, which is not energy

Build 69 gave the largest objects a second thing to leave behind. **Debris** is
the structure coming apart: jagged unlit plates in the object's own colour that
tumble outward, bounce off whatever they meet, and drift off the field. It
cannot be collected, it cannot hurt you, and nothing it touches takes damage
from it — being shoulder-barged by a BULWARK does not chip it, and it does not
chip the BULWARK. `CFG.debris` holds the whole of it, and `Chunk` in
`src/debris.js` is deliberately *not* an `Enemy`: it has no health, no steering
and no value, and reusing the class to get them would drag in a dozen
behaviours nothing about wreckage wants.

**It can be shot, and that is the only thing that breaks it.** `applyDamage` is
a no-op — the contact solver cannot hurt a chunk — while `shatter` is called by
fire and only by fire. One hit is one break, always; there is no health pool
here, only size. A chunk wider than `debris.split` comes apart into two or three
pieces at `keep` of its radius, and anything at or below it has nothing left to
break and simply goes, in a ring and a puff. So a full-size plate is worth three
volleys (15 → 8.4 → 5 → gone) and a splinter is worth one. The ladder terminates
because a piece is floored at `debris.min` and `min` is under `split` — a floored
piece can never split again.

Nothing pays for it. Wreckage is not the currency, and paying for it would undo
build 67's whole distinction.

**A round is never stopped by wreckage.** `shatterAlong` runs *after* the
contest for the nearest hit and takes no part in it, so a chunk drifting in
front of a BULWARK cannot eat the round meant for the BULWARK — it comes apart
as the round goes past, and the BULWARK still takes the full 17. The sweep is
capped at the impact point, so nothing behind what the round stopped in is
touched. Auto-aim never picks wreckage either, because `autoTarget` reads
`world.enemies` and wreckage is not in it. A field of chunks is a light show,
never cover.

**A blast pulverises rather than splits** (`shatter(..., pieces = false)`). A
PULSE turning one plate into three next to the turret would be adding clutter
exactly where it was meant to be clearing it.

**A chunk cannot be broken for `debris.grace` after it appears.** Without it the
round that made the pieces is still travelling through them and breaks them
again the next frame, so one bolt pulverised a plate all the way down — and the
bolt that killed a BULWARK shattered all sixteen chunks before they had cleared
its body. A bolt covers about 180 units in that window, so by the time it lifts
the round that caused it is long gone.

**Only four objects shed it, and they shed a lot.** BULWARK 16, a TOW's mass 12,
SCION 11, BLOOM 9. That is the point — a BULWARK breaking into two dozen glowing
collectables reads as a payout, and a BULWARK breaking into two dozen tumbling
plates reads as a BULWARK breaking. Because the four are uncommon, wreckage is
an event rather than constant litter. Ninety chunks can be loose at once
(`debris.max`); a saturated debris field on top of a full enemy field costs
about four frames a second.

**It is drawn as the opposite of energy.** Energy is a filled core in a pulsing
halo, additive, at full brightness. A chunk is an outline-only polygon of four
to seven fixed sides, filled with the background colour and stroked at half
alpha, with no glow at all. One of them lights up and the other does not, and
that is the whole of telling them apart at a glance.

Which is also why a break has to be loud: sparks in the chunk's own colour are
as dim as the chunk was, so every third one is near-white. `audio.crack()` is
drier, higher and quieter than the `pop()` of something dying — a chunk coming
apart must not sound like a kill — and it is gated at 60ms, so a round cutting
through a dozen chunks is one crack rather than a dozen.

**It is the one body allowed to leave the arena.** In `physicsStep` the chunks
are appended past the end of the clamped run, so the edge pass simply stops
early — they collide with everything and are clamped by nothing. Off the field,
or fourteen seconds, whichever comes first.

### The tree

Everything permanent is bought from a tree with energy. AMENDMENTs are gone:
three cards, take one, and the other two never seen again made a run a sequence
of accidents. A tree makes it a plan — the whole machine is visible from the
first minute, and every energy banked is aimed at something chosen.

**ALLOCATIONs are untouched.** They are tempo, not progression, and a top-up is
exactly the kind of thing that should turn up rather than be shopped for.

**Four categories, and a category is never bought.** It is a heading.

| category | holds |
|---|---|
| **TURRET** | the machine — rate, hands off, slew, casing, sweep, intake |
| **AMMUNITION** | whole-rack upgrades, then BOLT (free) and the 8 bought rounds beside it |
| **MINES** | BLAST (900), and the mine doctrine and other 7 mines behind it |
| **ABILITIES** | cooldowns and reflex, then PULSE and FAN (free) and the 6 bought abilities beside them |

PULSE used to *be* the root of the ability branch, which made every other
ability read as something hanging off PULSE rather than as its equal. Same for
BOLT and the rack. A category fixes both: everything purchasable is an arm or a
leaf under a heading, and peers look like peers.

A node is available when its parent is owned, and bought with energy. That is
the whole rule: nothing rolled, nothing expired, nothing missed. BLAST is the
one arm that gates a whole tier, which is what makes taking the mines a
decision instead of a formality.

**Every arm says what it does.** A round, mine or ability row carries its own
damage-and-effect line from `ARSENAL`, or its hint from `ABILITIES` — a price
with no description is a thing you cannot decide about, and being able to read
the whole machine before committing is the entire advantage of a tree over a
card draw.

**Nothing is spent on one tap.** A row that is already yours opens and closes;
a row you could buy *arms* instead, shows `SURE?`, and only the second tap
spends. It lapses after four seconds, because an armed row left sitting is a
trap for the next tap. A row used to both open its branch and try to buy
itself, which meant looking inside a round was the same gesture as spending
nine hundred on it. RESET SIMULATION and REPLAY OPENING ask the same way —
there is no undo and they sit one tap from the volume control.

**80 nodes.** `src/tree.js` holds only the shape; what each node *does* still
lives in `upgrades.js` and is looked up by id, so there is one definition of an
upgrade and one definition of where it sits. `check-build.mjs` asserts every
buyable id is placed exactly once — 76 of them — which is what stops the two
drifting. A node left out of the tree would be content nobody could ever buy.

Purchases are recorded in `world.offers.taken`, the ledger the save already
keeps and already replays on restore, so the tree persists for free and there
is one answer to "what has this run got".

**Five row states, because three questions get asked of a row and each needs
its own answer.** *Is it mine? Is it finished? Can I afford it?*

| state | reads as |
|---|---|
| `locked` | behind something unbought — 34% opacity, still legible |
| `poor` | open and priced, out of reach right now |
| `afford` | open and buyable — the only state that invites a press |
| `part` | yours, levels left — lit in the branch tone, rail down the left, and **still priced** |
| `full` | yours and finished — lit, ticked, no longer asking |

`part` is the one that was missing in build 83: a node bought once out of three
looked exactly like one never bought at all. Anything owned now takes the
branch's colour and a 2px rail on its left edge, because the fastest read down
a long column is the rail rather than the row; a tick closes a node and a price
does not.

Progress is a row of **filled pips**, not "1/3" — pips read as progress where a
fraction reads as a label — and a single-level node has no meter at all,
because there is nothing to be part-way through.

**The layout is an indented outline, not a drawn graph.** Eighty nodes on a
390px screen is the constraint, and an outline is the shape that survives it: a
row reads at a glance, the rail down the left says what hangs off what, and a
closed branch costs one line instead of fourteen. A bought arm opens to show
its own upgrades; an unbought one is a single priced line. Four row states —
owned (lit in the branch's tone, ✓), affordable (green price), open but out of
reach (dimmed, still priced), and behind something unbought (34% opacity, still
legible, because a tree you cannot read the far side of is a fog rather than a
plan).

Prices are flat per depth — 900 a round or mine, 1100 an ability, 1400 a second
charge, 500 a leaf and 350 more per level after the first. Pacing is not what
this is for yet; one number to move when it is.

### The phone kept an old build

An iOS home-screen web app caches the document indefinitely, and a static page
has no header it can send to stop it — so a republish to the same URL simply
does not arrive. A phone sat on build 84 while the server had 85.

The single-file build now checks. One same-origin fetch of itself with a
cache-buster on the query, a look at the `REV` in the reply, and one reload if
it differs. `sessionStorage` holds the REV already checked, so it runs once per
launch and cannot loop. Measured against a local server: one load on a normal
visit, two when a newer build is waiting, and the game boots either way.

That fixes it going forward. A page already stuck needs a fresh URL once,
because the stale copy is what would be doing the checking.

### The bug that made the game unplayable

Build 82 deleted `world.lockout` along with the rest of ORDINAL. It left one
line behind:

```js
canFire(world) { return this.cooldown <= 0 && world.lockout <= 0; }
```

`undefined <= 0` is **false**. So `canFire()` returned false on every frame of
builds 82, 83 and 84 and the turret could not fire a single round. Everything
downstream followed: no kills, no energy, and a brand-new upgrade tree in which
nothing could ever be afforded — which reads, reasonably, as the menu being
broken too.

Three things about it are worth keeping:

- **Deleting a world field leaves every comparison against it silently
  answering the wrong way.** `undefined > 0` is false and harmless;
  `undefined <= 0` is false and lethal. The same sweep found
  `world.chrono > 0` and `world.jam > 0` in the same file, both benign, both
  now gone.
- **The suite stayed green through it.** `smoke.mjs` walks the whole game with
  debug spawns and debug kills, and nothing in it had ever pulled an actual
  trigger. It now asserts a trigger pull produces a round, first, before
  anything else is measured.
- **A tree with no energy looks broken.** The header names the gap now —
  `392 more for the next`, or `6 within reach` — so an early panel reads as
  early rather than as dead.

### ORDINAL is gone

Build 82 deleted it. `src/boss.js` (1,233 lines), the ledger, the ending, the
four status effects that were only ever boss powers, and the interface that
served them. **1,920 lines out, 49 in, across 15 files.**

Taken with it, because nothing else ever used them: `veil`, `invert`, `jam` and
`chrono` and all their consumers, including the half-resolution `veilMask`
canvas that was allocated on every resize and composited every frame — the one
place where removing the boss made the running game cheaper rather than just
smaller. Also `world.ledger`, `world.reclaimed`, `world.counted`, the `lull`,
`boss`, `ending` and `frozen` phases, the glitch `boss` and `frozen` modes, the
end screen and its reset button, `CFG.boss` (80 lines), `CFG.lull`, and
`audio.bossPower`.

`world.stasis` survived, which was the one real trap: it is the player's STASIS
ability and it sat on the same reset line as five things that all went.

The plan is `docs/boss-removal.md`, written before any of it was cut. It holds
up: one export, one importer, 89 live references across six files. What it
called a clean seam was a clean seam.

### There is no count, and no ORDINAL

Every run is endless as of build 81. There is no five hundred to reach, no
lull, no boss and no ending — the field keeps coming and the run is however
long you keep playing it. `world.endless` is simply `true` at reset; it used to
be `cleared()`, the state a player earned by beating the boss once, and that
path was already written and already exercised, so the switch is one line and
the behaviour it selects is not new code.

What that turns off, all of it through gates that already existed: the `/500`
on the counter, the `STAGING` phase tag (it reads `FIELD`), the lull, ORDINAL's
arrival, the ending sequence, and the release quota — `releasesLeft` returns
`Infinity`, so the director never runs out of objects. Verified from the first
frame: `endless: true`, tag `FIELD`, counter `0 OBJECTS`, and `released`
climbing past the old goal with `boss: false` throughout.

The ten story lines used to be gated on the counted run, which would have left
the game with no voice at all; they run on the count regardless now. Two of
them described a shape the game no longer has — "Halfway, and not once have you
looked behind you" and "Nothing sent down so far has looked at you. The last
one will" — and are rewritten. ORDINAL is out of the glossary, and the debug
panel has lost SKIP → COUNT, SKIP → BOSS, KILL BOSS, BOSS POWER, REPRISE, ECHO
and TOGGLE ENDLESS along with the methods behind them.

**`src/boss.js` is still on disk and is now unreachable.** So are `ENDING`, the
ledger HUD, the boss glitch modes and the `cleared` flag. That is 1,233 lines
and roughly 322 references across a dozen files — a third of the codebase —
and pulling it out is its own job rather than a rider on this one.

### The glossary reveals on the kill, and only on the kill

16 entries, 16 object types, no gaps in either direction. An entry is recorded
in `sweep()` — `if (!e.dead) continue;` then `noteDestroyed(e)` — so it takes a
body that is actually dead. Anything removed rather than destroyed sets
`dissolved` (a SEED expiring, a GLUT eating a fragment, a debug clear) and is
excluded from both the glossary and the tally.

Measured from an empty codex: spawning five types and leaving them alive
reveals **nothing**; killing one PRISM reveals **`prism` and nothing else**;
collecting energy reveals nothing on its own.

**Every object type can reach the field.** All twelve rollable types are named
in the wave table; the four that are not (`plate`, `seed`, `drift`, `towMass`)
arrive by their own routes — split from a WARDEN, thrown by a SCION, the drift
trickle, towed by a TOW. No orphans, so the glossary is completable.

The distribution is deliberately uneven, matching the reveal schedule: MOTE and
NEEDLE appear in 11 waves each, LURCHER 7, SPLITTER 5, BLOOM 4, and the late
arrivals — WARDEN, SCION, GLUT, TOW — in 2 apiece.

### FIELD and STAGING were not two versions

The phase tag reads `STAGING` on a counted run and `FIELD` on an endless one,
and `world.endless` is set from `cleared()` — a `localStorage` flag written the
first time ORDINAL is beaten. Every run after that first clear is endless: no
count, no boss, no ending. Because `localStorage` is per-origin, **the same
build reports different things on two devices**: a phone that has beaten the
boss shows `FIELD` and a bare object count, while a fresh browser on the same
build shows `STAGING`, `0 / 500` and a boss at the end.

That looks exactly like a version mismatch and is not one. `TOGGLE ENDLESS` in
the debug panel calls `forgetCleared()` and restarts, which puts a device back
onto a counted run. REV above is how to actually tell two versions apart.

### Waves

The field arrives in waves. Builds 63 to 70 ran a rolling cohort — a working
set of three types that a timer drew from, rotating one out every so often.
That got the *variety* right and the *shape* wrong: objects arrived one at a
time forever, so nothing ever finished and nothing ever started. **A wave has a
beginning and an end, which is what makes the quiet between two of them feel
earned.**

`CFG.WAVES` is the table. A wave is a list of `[type, count]` pairs and nothing
else; the runner in `Director` turns it into releases.

- **A wave ends when everything in it is out *and* the field has thinned** — to
  a quarter of what the wave released, floored at `waves.clearTo`. Proportional
  rather than fixed, or a fourteen-object wave would sit at the end of its
  patience every time while a three-object one cleared instantly. `patience`
  caps the wait at 26 s regardless, because one object loitering out of reach
  must never be able to stall a run.
- **Three or more of one type in a regular wave arrive in formation.** Six
  MOTEs in a wedge is a wave; six MOTEs filing in one at a time is a queue.
  Tutorial waves never form up — they always file in, one object at a time,
  which is most of what makes the opening readable.
- **Waves swell.** Each entry is authored at its opening size and scales by
  `waves.swell` over `swellKills`, so the six-MOTE wave that is a gentle
  problem at kill 20 is fourteen of them by the end. Without it the field
  peaked at nine objects and the late run was thinner than the early one —
  waves bound the population by construction, which is most of why they work
  and all of why they need this.

**The base rate of fire is 30% slower.** 0.2 and 0.22 second cadences became
0.286 and 0.314. The turret is meant to be a thing you improve, and a base rate
that already felt fast left the rate upgrades with nothing to give.

**RATE has two levels instead of one**, the second called RUNAWAY. It used to
declare no `levels`, which means `Infinity` here — it could be taken over and
over for the same 20% every time, which is a stack rather than a ladder. Both
levels do the same thing, because `apply` is handed `(world.up, world)` and
never the level: tiers change what the card says, not what it does. Two takes
come to 0.64 of the interval, more than the 30% that came off the base, so a
turret that invests in cadence ends up faster than it ever was.

**There is a soft wall inside the hard one.** `clampToArena` is a hard stop
with a bounce: a body that reaches the side is pinned to it and, if it is still
steering inward-and-down, it rolls along the edge until it gets past. That reads
as the simulation running out of room rather than as an object moving. Measured
over 5,384 frames, **25.3% of all body-samples were touching a wall** and 34.5%
were within 8 units of one — a quarter of every object's life spent against an
edge.

`physics.edgeEase` (96 units) is a second, invisible boundary in from each side,
and `edgePush` nudges anything inside it back toward the middle. The falloff is
squared, so it is nothing at the outer limit and firmest at the wall: the
correction reads as the object choosing to come away rather than as a force
acting on it. It is applied between steering and integration, to every body the
arena holds — hostiles, drift and energy alike. Debris is excluded, being the
one thing that is meant to leave.

After: **0% touching, 0.24% within 8 units, and a minimum gap of 5 units across
5,379 frames** — nothing reached a wall at all. Throughput is unchanged (162
kills against 161). The hard clamp stays as the backstop for anything thrown at
a wall faster than the nudge can answer.

**DRIFT comes down fast, decelerates, and never stops.** Not a band. Build 78
held them in one a quarter of the way down, pulled back from both sides, and a
two-sided pull is a wall however softly it is written: measured median depth
0.229, p90 0.334, and **nothing at all in the bottom two thirds of the field**.

It is a taper instead. The descent runs at `fall` (300) at the very top and
eases off over `taper` (420 units) with depth; `crawl` is the fraction of it
that never goes away, so a drift is forever still coming down — just less and
less urgently — and will reach the turret if left alone. A single one tracked
from the top: 111 units/s at 0.01 depth, 65 at 0.25, 35 at 0.77.

That exposed a second wall. Once one had finished coming down it settled onto
the bottom edge and sat there — **fifteen unbroken seconds of `vy` exactly 0**,
which is the one thing a thing that never stops must not do. So `edgeEase` now
covers the floor as well as the sides (`physics.floorEase`, 84 — shallower,
because the turret sits just above it and nothing should be shoved off its own
approach).

| | build 77 | build 78 | build 80 |
|---|---|---|---|
| median depth | 0.391 | 0.229 | **0.649** |
| p90 depth | 0.571 | 0.334 | **0.837** |
| touching floor | — | — | **0%** |
| touching a side | — | — | **0%** |
| effectively still | — | — | 3.4% (wander turnarounds) |

**One wave is grey and nothing else.** No hostiles, no risk, nothing taken from
the five hundred, and about 220 ENERGY on the field if you take it — 22 DRIFT
at 10 each, against roughly 11 an object for a normal wave.

It earns its place in the rotation by being a wave you have to *play*. AUTO AIM
does not target DRIFT, so during this one the assists do nothing at all: the
whole wave is you aiming by hand at things that cannot hurt you, for as long as
you care to. It is the only beat in the run where auto-fire is dead weight, and
it is the payoff for the two opening lines that say so.

`dwell: 8` is the quiet it buys, not a timer on the drift — the objects do not
expire when the wave ends, so anything left is still there to sweep while the
next wave comes down on top of it. `waves.driftCap` (26) is the ceiling for
drift a wave places deliberately; `maxDrift` (10) still caps the ambient
trickle, which simply pauses until the field is back under it.

Measured: 22 placed at once, **0 hostiles on the field for the whole wave**,
auto-aim returns no target throughout, the wave hands over in about 9 s, the
sweep banks 260 (26 objects, including ambient drift already there), and
`world.released` does not move.

**None of it is ever named on screen.** No wave counter, no "WAVE 4" card, no
between-wave banner. The pacing is meant to be felt; a number would turn a
rhythm into a score.

**The order.** The eight `teach: true` waves run first, in exactly the authored
order, exactly once. Everything after that is shuffled, because past the
opening the order genuinely does not matter — each wave is a self-contained
problem and meeting them in a different sequence every run *is* the variety. A
regular wave is eligible only once every type in it has unlocked, so the reveal
schedule below still holds and the pool the shuffle draws from simply grows.
When the rotation is exhausted the tutorial waves are dropped for good, the
larger pool is reshuffled, and it begins again.

**The reveal schedule is unchanged** and still gates eligibility: 0, 0, 18, 45,
85, 125, 165, 205, 245, 285, 330, 380, so the last type arrives with a hundred
and twenty kills still to go. (It was 0, 0, 10, 25, 55, 70, 85, 115, 145, 175,
210 before build 63 — everything the run had by kill 210, less than half way.)

**The opening.** Eight tutorial waves, 29 hostiles and 15 grey drift between
them, at `teachGap` seconds a release and `teachRest` between waves. Measured
hands-off from a cleared store: **the tutorial ends at 133 s and 33 kills**,
and throughput returns to normal immediately after — 30 kills at 120 s, 100 by
200 s. The old opening was a 22-second grace and then a rate-throttled trickle
that reached 26 kills in roughly 104 s; this is longer, slower per object, and
made of discrete pieces instead of a curve.

The population ramp, warm-up rate and teaching throttle that used to run all of
this — `popStart`/`popEnd`/`popRampKills`, `spawnInterval`, `warmPop`/
`warmKills`/`warmSeconds`/`warmRate`, `teachPop`/`teachRate`/`teachKills`,
`cohort`/`cohortEvery`, `formationChance` — are all gone. How thin the opening
is, is now a property of which waves come first rather than of a curve applied
to a trickle.

### The ladder played a band it had already left (build 200)

Four defects, all of them invisible from inside a run and all of them measured
by `scripts/ladder-probe.mjs`, which is new: it plays the game with real taps
at a fixed skill and writes one record per wave.

**The band window lasted exactly one wave.** `shuffle()` builds a rotation from
the tier's own two bands, and then `admit()` spliced in every eligible wave
that was not already in it — which is precisely the out-of-band ones — and
`admit()` runs from `begin()`. Logged at tier 40, straight after a shuffle:

    T T T T T T T T 4 5 4 5 5 4 4 4 4 5 5 4

and one wave later:

    T T T 2 T T T 1 2 T 3 T 4 3 5 2 4 5 5 3

Tier 40 played five MOTEs and three NEEDLEs as often as a TOW and a BULWARK.
`admit()` honours the window now, and `begin()` drops un-played entries the
tier has since climbed away from — a cycle is twenty-odd waves long, so a run
climbing through one was still playing band 1 several rungs after leaving it.
Neither ever empties the rotation: out-of-band unlocks are what the next
`shuffle()` is for, and the regress case that guards late unlocks now asserts
reachability rather than immediate splicing.

Measured after, 180 s at the max profile: every scored wave at rung ≥ 9 came
from bands 4–5 — 7 of 7 starting at rung 20, 10 of 10 starting at rung 12,
against 0 of 7 before.

**The verdict leaked between waves.** `score()` returns early for a teach wave
*before* clearing `contact` and `hitPatience`, and `load()` never cleared them,
so an unscored wave's seconds on the turret were charged to whichever wave was
scored next. `load()` clears all three now — it is the guarantee, and `score()`
still clears them too.

**The drift-only bonus wave was scored.** `{ of: [], drift: 22 }` is not marked
`teach`, and with `asked === 0` there is nothing that could fail it, so it was
a free rung every cycle — observed climbing 15 to 16 for shooting nothing.

**The opening replayed, tier-scaled.** It led every cycle-0 rotation whatever
the tier, and `spawnOne` gave it the tier's health multiplier, so a run
starting at rung 40 was taught what DRIFT is by a 29-second "needle ×2" that
could not move the ladder either way. It plays once now, at rung 1, and a
teach wave is never scaled — asserted as a ratio against the same type under a
regular wave, because the `Enemy` constructor rolls every body through
`rand(0.92, 1.1)` and one body against one body reads that roll as a defect.

### Four verdicts, and a rung you can ask for (build 201)

There were two verdicts, and both ways of failing were *slow* rather than *in
danger*. A maxed run parked where waves took 28-37 s with about 2.6 s of
contact, climbing +1 a wave and falling -1 per two — so a fall cost six times a
climb. The wave now reports three numbers and the table reads them:

- **`t`** — seconds from the **last release** to the field thinning. Infinite
  if `patience` ended the wave. Measured from the last release rather than from
  the top of the wave on purpose: a wave is not slow because it was big, it is
  slow because it would not die, and only the second is the player's business.
- **`k`** — seconds anything spent on the turret.
- **`c`** — the fraction of what was asked for that did not survive.

| verdict | when | move |
|---|---|---|
| `surge` | `t ≤ 3` and `k < 2` | **+2** |
| `clean` | `t ≤ 12` and `k < 6` | +1 |
| `stall` | otherwise, `c ≥ 0.4` and `k < 12` | 0, two in a row → −1 |
| `rout` | `c < 0.4` or `k ≥ 12` | −1 at once |

Any step back arms one wave of **grace** that cannot climb. Without it the
ladder ping-pongs: the rung below a wall is by construction one you can clear,
so a drop was always followed by an immediate climb back into what caused it.
`HOLD` still pins the climb and not the relief.

**The arrow at the ceiling arms a trial.** It used to be simply disabled there
— the rule working, and reading as a dead control. Now it stands the run three
rungs up on a rung it has *not* earned, for one wave: cleared, that becomes the
ceiling; anything else and the run drops straight back having lost the wave and
nothing else. A button still never raises `peak` — the wave does. The rung is
drawn dashed and lit: stood on, not yours yet.

Measured with `scripts/ladder-probe.mjs`, 180 s a run, two browsers at a time
on four cores:

| profile | rung | scored | verdicts | median wave | median contact |
|---|---|---|---|---|---|
| max | 10 | 11 | S2 C5 T4 R0 | 8.5 s | 0 s |
| max | 20 | 9 | S1 C2 T6 R0 | **15.7 s** | 0 s |
| mid | 10 | 8 | S0 C6 T2 R0 | 13.1 s | 0 s |
| bare | 1 | 3 | S2 C1 T0 R0 | 5.3 s | 0 s |

Against 28-37 s before. Three things the table says that the brief's targets
did not expect:

**At equilibrium a maxed run is stall-limited, not contact-limited.** Median
contact is 0 s in every `max` run — the turret is simply never touched — and
the ladder holds the run at rung 20 through *stalls*: six of nine waves, no
routs. That is the `t` term doing the work, and the old contact-only scheme
could not have seen it, because there is no contact to see. The brief's 1-4 s
contact band is met only where a profile is being overrun.

**A run dropped above its ceiling is falling, not settled.** `bare` at 20 and
30, and `mid` at 20 and 30, are every-wave routs — the ladder shoving them back
down, which is the machine working. Their 27 s medians are the duration of a
wave that is beating them, not an equilibrium.

**A fall still costs 4.2x a climb**, against a target of 2x and about 6x
before. The cause is visible in the numbers: falling runs at 19-27 s a rung,
which is the wave duration itself, and a losing wave runs to `patience` (26 s).
A fall is bounded below by how long a bad wave is allowed to last, so closing
the rest of that gap means either `patience` or a rout worth more than one
rung — a decision, not a tuning pass.

### A rung that pays for itself (build 202)

Bounty was linear — `1 + 0.15 * tier` — against health compounding at
`hpStep`. Exponential cost and linear pay has one outcome: **energy per point
of damage at rung 40 was 0.08 of rung 1**, so the best-paying place on the
whole ladder was near the bottom of it, and every hour spent climbing was an
hour spent earning less. Three changes, and each is asserted on its own because
they compose:

- **Bounty compounds too**, at `bountyStep` 1.10 against health's 1.12. Still a
  shade under, so a rung stays harder than the one below it — but the decline
  per point of damage is 2x across 39 rungs instead of 12x, **six times better**.
- **A surge pays the margin**: half again on what that wave was worth, in one
  lump at the turret. Accumulated *raw* — before the intake tax and before the
  dividend — because it is banked back through the same function, and banking
  the netted figure would tax and multiply it a second time.
- **The depth dividend**, `min(1.6, 1 + 0.01·peak + 0.05·anomalies)`, on
  everything banked. Off the **peak** rather than the current rung, so stepping
  back to breathe does not also cost you the rate you climbed for. It feeds
  `earned` as well as the purse on purpose: `earned` is the one clock, and
  depth ought to move it.

Measured with `scripts/ladder-probe.mjs --hold`, which pins the ladder at the
rung it was jumped to — without it a run dropped above its ceiling spends the
window falling, and what gets reported as "energy per second at rung 30" is the
energy of a run being shoved back to 26.

| profile | rung 1 | rung 10 | rung 20 | rung 30 | rung 40 |
|---|---|---|---|---|---|
| bare | **4.85** | 11.33 † | 6.16 † | 1.83 † | 2.58 † |
| mid | **4.71** | **15.03** | 12.72 † | 2.99 † | 1.72 † |
| max | **5.01** | **20.05** | **23.37** | 20.48 † | 12.29 † |

Bold is a rung the profile held; † fell off it. On every held rung, energy per
second is **strictly increasing** — max goes 5.01 → 20.05 → 23.37 — which is
the acceptance. Against build 197's 8.9/s maxed at rungs 12-19, 3.4/s at rung
40 and 5.8/s un-upgraded at the bottom, **holding low is now the worse choice
at every profile**.

Note the two answers point opposite ways and both are right: *per point of
damage* a deep rung still pays a little less, because bounty is deliberately
under health. *Per second* it pays far more, because the wave grows as well.
The second is the one a player experiences.

### The anomalies go on the ladder (build 203)

All seven were built and none of them was on it. Past band 5 nothing new was
ever introduced, and the only way to meet an anomaly was to buy an APERTURE out
of the tree — so a run could climb to rung 40 having never seen one.

Seven rungs are **gates**: 6 ORDINAL, 12 GNOMON, 18 FRACTAL, 24 AMPLITUDE,
30 DYNAMO, 36 PARITY, 42 TERMINUS. A gate rung is an ordinary rung for waves;
the ladder simply **will not climb past it** until its anomaly is in
`world.reconciled`. Standing on one lights the banner at no energy cost —
topped up to one rather than added to, so it cannot be farmed and so it comes
back on its own after a withdrawal. Nothing holds the world: the way is opened
when the player opens it. A surge steps **on** to a gate rather than over it,
and stalls and routs still push down past one, because going back was never the
thing that had to be earned. Beating a gate hands over the rung it was standing
in front of.

**Withdrawal.** A gate that cannot be passed is a run that cannot continue, and
the ladder has no other way round. An anomaly that stands for `CFG.boss.patience`
(90 s) without losing a stage stops counting and goes: the field comes back, the
gate stays lit, nothing is reconciled.

The brief specified this against `Boss.stageT` — **which is dead state.** It is
set to 0 in the constructor and again in `enterStage`, and nothing in the
codebase has ever incremented it. All seven bosses do write `world.bossStage` on
a stage change, so the watcher is in `Game` instead and works identically for
every one of them, without depending on which subclasses call `super.update`.

Measured. A bare turret parked on rung 6 with the way opened, three runs:

| run | lit | stood for | longest stage | arrival | withdrew | reconciled | still lit | rung |
|---|---|---|---|---|---|---|---|---|
| 1–3 | yes | 104.4 s | **90.0 s** | 14.4 s | yes | no | yes | 6 |

Exactly patience, every time. The first version of that probe read 104.4 s and
called it a failure: it counted the arrival, which `watchBoss` deliberately does
not, because a boss that is still arriving is not a boss that is standing.

And a max profile answering gates as it reaches them:

| from | ORDINAL | GNOMON | FRACTAL | ended on | energy/s |
|---|---|---|---|---|---|
| rung 6 | 35.8 s → 7 | 108.7 s → 13 | **209.9 s → 19** | rung 20 | 74.1 |
| rung 1 | 217.7 s → 7 | 296.6 s → 13 | — | rung 13 | 41.1 |

Three gates in 210 s from rung 6, inside the five-minute target. From rung 1 it
is two, and the cause is not the gates: **the first scored wave is at 162.6 s**,
because build 200 confined the opening to rung 1 and a fresh run spends over
half of a five-minute session being taught. That is the tutorial working as
specified, and it is worth knowing before reading any from-rung-1 timing.

### The waves start asking a different question (build 204)

Past band 5 the ladder introduced nothing new: the climb was carried by
population, health and bounty, which are three ways of saying *more of the
same*. A **trait** is the fourth thing — the same wave, answered differently.
`src/traits.js` holds five:

| trait | rule |
|---|---|
| **ARMORED** | the first hit an object takes each second does nothing |
| **SWARM** | twice as many, half the health |
| **MENDING** | it closes 4%/s unless hit twice inside a second |
| **TETHERED** | pairs share one pool of health |
| **EBB** | wreckage goes the other way |

Three rules hold the file together. **Grey is harmless** — DRIFT and energy are
never traited, which is why the stamp sits inside the same guard as the tier
multiplier. **A trait never recolours a type** — the roster's colours already
mean something, and two meanings on one channel is one too many; the rail says
it instead. **Seeded, not stored** — the trait is a pure function of
`world.runSeed`, the cycle and the wave's index, so the rail can say what is in
play, a save carries one integer instead of a list, and two runs of one seed are
the same run. No `Math.random` on the per-wave path: a decorative roll there
moved ORDINAL's canonical hash once already.

None below rung 10, one from there, two from 25. Never the opening, never the
drift-only bonus wave. Passing a gate leaves **two traits offered on the rail**;
tapping one fixes it for six rungs. Nothing is held and nothing is asked — the
default is to leave it and let the seed keep deciding.

Measured, max profile pinned at rung 12 for 240 s — **20 scored waves, none
untraited**:

| trait | verdicts | median wave |
|---|---|---|
| tethered | 3 surge, 3 clean, 1 stall | 5.0 s |
| mending | 1 surge, 3 clean | 6.7 s |
| armored | 1 clean | 7.9 s |
| swarm | 4 clean, 1 stall | 7.9 s |
| ebb | 3 clean | 9.2 s |

The distribution genuinely differs, and **neither SWARM nor ARMORED produced a
single surge**, which is the acceptance. TETHERED is the soft one for a maxed
turret — a shared pool is half the health of two bodies — and is worth a look
before it goes near a balance pass.

**Two names in the brief were already taken and one field was dead.** EBB is
documented in this README as an Offer, and the Offers reward pool
(SURGE/HASTE/CORONA/OVERDRAW/SCOUR/EBB/SEED/VOLLEY) **no longer exists in the
code** — there is no pool, no implementation, and `hud.offerResume` is the
title screen's *resume your run*. The name was free, so the trait keeps it, but
that README section and three `EBB:` comments in `enemies.js`/`config.js` are
stale. Worth knowing before Phase 5, which specifies a sheet that "holds the
world the way Offers do": there is nothing there to copy.

**Three of my own cases needed the traits to exist before they were correct**,
which is the phase's own hazard showing up in its tests. The teach-wave health
ratio read 13.3x against 26.7x whenever the seed rolled SWARM at rung 30. The
TETHERED case read "the other one did not drop" on a working build, because
rung 30 carries *two* traits and ARMORED turned the test hit away entirely —
`applyDamage` returns before the mirroring. And the climb case's margin sat on
exactly rung 10, the trait threshold, making it a coin flip by construction.
A case about one rule has to survive the other.

### The wave sheet (build 205)

Tapping the rung the run is standing on opens a sheet: what the wave is, how it
is going, and the two things that may be done about it. It **holds the world**
while it is up, the way the menu and the loadout do — nothing in this game opens
a modal by itself.

- **AUDIT** — free, always. The roster, what is still up, its health, the wave's
  traits, and the three meters the verdict is read from: contact toward 6 s,
  time since the last release toward 12 s, and cleared fraction. The verdict is
  legible before it is announced rather than arriving as a surprise.
- **RECALL** — end the wave now and take what is cleared. Three quarters counts
  as the clean it was going to be; less is a **stall**, not the rout the table
  would have given it. That is what the charge buys.
- **OVERCLOCK** — the next wave arrives twice as fast, pays double, and gets a
  six-second surge window instead of three (a wave arriving twice as fast is
  over sooner, and three seconds would be a surge handed out for the arming
  rather than for the answering).

Both are tree nodes, sealed until the run has stood on rung 10 — on `peak`, so
stepping back down to breathe does not re-seal what has been earned.

**Where they sit took three tries and check-build caught two of them.** TURRET
is the natural home and is wrong twice over: every node there fills a socket on
the drawn turret (`RIG_MAX` is 18 and the branch would have sold 20 — the build
refused), and neither of these is a part you bolt on. ABILITIES is wrong too:
`UNDER.abilities` is the *ALL ABILITIES* group, "applies to everything you
hold", which these do not. They ended up at the top of the tree beside RECAST,
under a **THE WAVE** heading, for exactly the reason the comment above RECAST
already gives: there is no category they are a member of.

**`score()` gained one parameter and no second copy of the table.** RECALL names
its own verdict — that is the whole of what the charge buys — and everything a
verdict *means* (the move, the grace, the peak, the margin, the streak) stays in
`score()`. Delegating entirely was the first attempt and it cannot work: the
table says `c < 0.4` is a rout, so a 30%-cleared RECALL scored −1 instead of the
promised stall.

**The brief's reference does not exist.** It specifies a sheet that "holds the
world the way Offers do". The Offers reward pool
(SURGE/HASTE/CORONA/OVERDRAW/SCOUR/EBB/SEED/VOLLEY) is documented in this README
and is **not in the codebase** — no pool, no implementation; `hud.offerResume`
is the title screen's *resume your run*. `Game.paused` is what actually holds a
run, so the sheet joins the menu and the loadout there, and a case asserts the
field freezes and moves again, because a modal that does not stop the field is
one you get killed behind.

**What is measured and what is not.** The bounty multiplier is exactly ×2 and
the release gap is halved — 0.63 s armed against 1.27 s plain over 24 samples,
against an authored range of [0.85, 1.7]. The brief also asks for OVERCLOCK to
raise a wave's energy by roughly ×2 end to end, and **that is not confirmed**:
measured on a maxed turret pinned at rung 20, plain waves alone paid 51, 93 and
189 for the same nominal wave, so the between-wave spread is larger than the
effect being looked for and the instrument cannot resolve it. Two earlier
versions of it reported ×1.54 and ×0.55; neither is a finding. A wave's energy
is banked when its wreckage is *collected*, which lags the wave and does not
respect its boundaries — measuring it properly needs a probe that follows the
motes rather than the clock.

### The readout, and the sheet held properly (build 206)

**The sheet is held the way the menu and the loadout are**, which is what it
should have been designed from in the first place — `Game.paused` alone stops
the world but leaves everything under the sheet pressable.

`#ui button { pointer-events: auto }` carries an id, so nothing built out of
classes can turn a control back off. This file already records that
`body.menuOpen #quickBar { pointer-events: none }` and its loadout twin have
**never disabled a single button**. `body.sheetOpen` therefore does both halves:
the class rules dim the strip, the abilities and the rail to 25%, and the
id-carrying rule beside the menu's own is what actually lands. Measured on the
rendered style, never on the class — the class is what was already there and
wrong. It closes on Escape like the other two, and never outlives its opener: a
restart or an anomaly arriving takes it down, because a held state whose opener
is gone is a paused world with no visible way out.

**The rail says how it is going.** The rung the run is standing on carries the
same three meters AUDIT shows — contact toward 6 s, time since the last release
toward 12 s, cleared fraction — as three hairline bars, so the verdict is
legible before it is announced and the sheet is where you go for the detail
rather than for the news. They are stepped in tenths, because a width in per
cent that changes on the third decimal is a layout every frame. Nothing is drawn
between waves.

**A gate is marked on the rung it stands on, at any distance** — unlike a trait,
which belongs to a wave that may not have been chosen yet, and so is only ever
shown on the rung in play. That distinction is the whole of what the rail may
honestly say about a rung ahead.

**Every move says why.** `STEPPED BACK · 9 S ON THE TURRET · TIER 13`,
`SURGE · CLEARED BEFORE THE LAST ONE LANDED · TIER 15`, `TIER 12 · THE FIELD
CAME BACK`, `PROVEN 17`, `HELD AT THE GATE · ORDINAL`. The last is announced
even though the ladder did not move: a run standing still with a wave it just
cleared is the one case where nothing changing *is* the news.

**One real bug came out of writing the case for it.** `syncRail` repaints only
when the tier, the ceiling or the trial changes — so reconciling an anomaly
without moving left its rung drawn shut. The live path happens to call
`setTier(tier + 1)` a line earlier, so it never showed; that is the kind of
accident that holds until it does not. The cache key counts `reconciled` now.

At 320×568 with the meter row the rail is 48px, still clears the top bar, and
`pillCap()` is 3 — so the readout costs no teaching-line slot.

### SCION, and what a graft does

A large body worth more to the field dead than alive.

Kill a SCION and it does not simply come apart: it throws three **SEED**s, and
a seed goes looking for something to join. What it finds is **grafted** — 35%
bigger, 90% more health, and it closes its own wounds at `graft.regen` a
second. Nothing else in this game heals, so a graft is the one thing that
punishes spreading fire around. The host keeps its own shape, colour and
behaviour and gains a turning violet ring, because *that BLOOM is now a
problem* is a far better read than *a new object appeared*.

It grafts onto **anything except another SCION**. A SCION is the largest body
on the field and a seed takes the largest thing in reach, so it would win the
pick nearly every time — and a SCION whose seeds reinforce the next SCION is a
loop, not a decision. The object exists to give the ability away.

**The counterplay is the seeds.** They are slow, they have 14 health, and they
are in the air for several seconds before they land. Shoot them and nothing is
grafted; ignore them and you fight something you made. One caveat worth knowing:
a seed is a harmless body, and auto-aim does not target harmless bodies — so
answering a SCION is something you do with your own hand.

**Two on the field, never three**, and the second is released at least
`graft.apart` from the first: two arriving together would seed the same host
twice and read as one event rather than two decisions. The cap is enforced on
the field rather than in the roll, and `solo: true` keeps it out of formations.

Seeds cost nothing from the run's allotment of five hundred — a SCION costs one
whatever it does on the way out — and a graft creates no new body, so neither
one moves the count.

### Large objects

**Fewer, and each one worth more.** Build 63 cut the roll weight of everything
carrying `large: true` and raised its health to match: LURCHER 98 → 142,
SPLITTER 84 → 122, BLOOM 132 → 190, BULWARK 360 → 520, a TOW's MASS 150 → 215.
The small types took the weight the large ones gave up. Large objects are now
31% of the roll by weight, and the smallest of them out-healths the largest
thing that is not one. The point is a field with fewer big bodies in it, none
of which is a pushover.

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
slightly greyer, and SUBTRACT is ORDINAL's whole character. PULSE is never on
the table either, so a turret that has opened nothing can only lose FAN.

### The objects

Twelve kinds, each with its own mass, speed, restitution and way of dying.
They unlock progressively as the count climbs.

- **MOTE** — small, light, gets punted across the arena by a single bolt.
- **NEEDLE** — the fast one. Thin, fragile, arrives early.
- **LURCHER** — heavy hexagon that shoves itself forward in bursts.
- **SPLITTER** — bursts into four motes that inherit its momentum.
- **BLOOM** — detonates on death and takes its neighbours with it. Chains.
- **BULWARK** — armoured, enormous mass. Bolts barely move it; PULSE does.
- **WARDEN** — three orbiting PLATEs that eat bolts. Strip them first, because
  the ones still on it when the core dies come off as bodies and come at you.
  Half as common as it was (weight 8 → 4), since one WARDEN is now up to four
  objects and each PLATE takes a place in the tally.
- **PRISM** — reflects glancing shots. Hit it square, or bank the ricochet
  into something else.
- **HERALD** — a beacon. It hardens the nearest few hostiles around it, and
  shows you it is doing so: a thread out to each one and a shell on each of
  them. Covered objects take 62% less. Kill the beacon, not the escort — the
  cover lapses a frame after it dies. **A beacon never covers another beacon**,
  as of build 70: five HERALDs drifting together spent eighteen of their
  twenty-five cover slots on each other, webbing the screen green and making a
  knot of them near-unkillable — the exact opposite of the line above. The
  filter is on `type.ward` rather than on the id, so it holds for any beacon
  added later.
- **GLUT** — eats the mess. Every mote it touches makes it bigger, heavier
  and tougher, one visible seam per mouthful, from 16 units up to 52 and from
  90 hit points up to 350. A littered field is its food supply, so it is the
  only object whose threat you control.
- **TOW** — a head dragging a heavy mass on a cable. Both halves are real
  bodies under a distance constraint, so the pair swings across the field and
  shoves whatever it catches, and both count — a TOW is **two** of the five
  hundred. Cut either end and the cable goes slack.
- **DRIFT** — harmless. No goal, no destination, no threat: it wanders on a
  slow random walk, never breaches the turret, never triggers a mine, is never
  auto-targeted and does not count toward the tally. It is there to be shot at
  and shoved around, and it is the first thing a run meets.

  **It sinks, as of build 60.** Aimless is not the same as absent: on a pure
  random walk a body released at the entry line is exactly as likely to wander
  up out of the field as down into it, and nothing removes one — so they
  collected against the top edge, half off the screen, where no shot could
  reach and nothing could be learned from them. The first thing a run meets was
  meeting it from off-camera. So while a drift is above its band
  (`drift.band` above the turret) the walk is overruled toward straight down by
  `drift.sink` and it descends at `drift.fall` rather than at its wander speed;
  below the line it is as aimless as it ever was.

  **Build 67 fixed the descent, which had never worked as measured.** The sink
  eased off over `reach: 460` — further than the whole descent — so it was
  strongest at the entry line and had faded to almost nothing by the time the
  body neared the line it was meant to cross. A *lone* drift dithered above the
  band for anywhere between 17 and 47 seconds. Build 60's "under fourteen
  seconds" was timed on eight released together, where they shove each other
  down; that is not how the spawner releases them, and the figure was not
  representative. It eases over `ease: 130` now and falls at 260: measured on
  sixteen lone drifts, **median 4.3 seconds**, with the occasional straggler
  that wanders sideways first. Since drift spawns every 3.5–6.5s from
  `driftStart: 7`, the field reliably has some well before the first hostile at
  22. Eight of them settle between 250 and 780 units above the turret, none is
  left above the top of the field, and one already in the band still spends
  about as many frames rising as falling.

Every object picks a **route** when it spawns — direct, sweeping, wide,
serpentine, hooking or loitering — as a lateral offset that folds in as it
closes. Two of the same type released together arrive by visibly different
arcs, and all of them still arrive.

Everything leaves **energy**: small bright bodies that are themselves
destructible, pushable, and dangerous to each other. Up to 128 can be loose at
once, and a bulwark alone sheds fourteen. The four largest also leave
**wreckage**, which is inert and is not budgeted at all — see *Wreckage, which
is not energy*.

Drift and energy are budgeted **separately** from hostiles — `hostileCount()`
is what the spawn director measures against `popStart`/`popEnd`, so the amount
of harmless matter floating around can be changed freely without touching the
pace of the run.

### The physics

Impulse-based circle dynamics: restitution, tangential friction (which is why
things spin when they scrape), positional correction, a uniform-grid
broadphase, and distance constraints for TOW cables, solved after the contact
pass so a towed pair cannot be pulled apart by whatever it just shoved. Mass is `density × area`, so heavy objects genuinely shrug off
what light ones can't.

**Collision damage is live**, and has been since the beginning. An impact above
a threshold hurts *both* bodies in proportion to reduced mass and closing speed.
Punting a mote into a lurcher hurts the lurcher. WELL is built on it: it drags
everything within reach into one spinning knot and most of the kills happen on
the way in, before the collapse goes off at all.

**With exactly one exception: SLUG.** A body a SLUG has hit is marked for
`rounds.slug.calm` seconds, and while the mark is live it neither deals nor
takes collision damage. SLUG is the round that puts things where you want them,
and it is not allowed to be a damage round by proxy — its 44 has to be the
damage it does. Everything else on the field trades on impact exactly as it
always has.

The mark travels with the shove and never refreshes: when a marked body meets an
unmarked one, the unmarked one inherits whatever time is *left*, so a chain runs
down instead of propagating for ever. Without that, a slugged BULWARK driven
through a MOTE would leave that MOTE flying into whatever was behind it at full
damage — still the SLUG doing it, one body further along.

Build 70 removed collision damage from *everything*, which was a misreading:
WELL had to be given its own crush to replace the grinding, and DECOY became
unkillable because the pile could no longer wear it down. Build 72 put all of
that back and scoped the removal to SLUG, which is what it should always have
been. Measured: two LURCHERs closing at 2800 units a second take 300 each; the
identical collision with one side marked takes zero on both, and the mark
spreads to the other body.

**Objects enter the field 260 units down, not at the top edge.** `CFG.entryDepth`
is how far below the top an object has to come before it is loose in the arena
— before auto-aim will take it, before a HERALD will cover it, before EBB or an
aura touches it.

It used to be zero. An object went live the instant its lower edge cleared the
top of the screen, at a measured median of **y=13** out of 1361, and auto-fire
killed it there: median death at **y=65**, with **100%** of kills landing above
y=234 — the band the status chips occupy. Objects arrived and died in the one
strip of the field you cannot watch. At 260 they go live at a median **y=275**
and die at **y=336**, a quarter of the way down, with 18% above the HUD line.

Nothing about being *shot* changed. `staged` never gated projectile collision,
so a manual round has always been able to reach something on its way in and
still can; this only holds the assists back until their target is somewhere
visible. `entrySpeed` runs the march in at 2.6× the object's own cruise so the
extra distance costs the run time rather than adding it — measured march is 2 s
before and 4 s after. Kill rate across one run each way was 14.5/min and 11/min,
which a single run either side cannot separate from noise; an earlier pair ran
13 and 14.5 the other way up.

**BUILD says what this claims to be; REV says what it actually is.** Two
installs both reporting BUILD 75 can be different code — a stale cache, a
different host, an older deploy — and nothing inside the game could tell them
apart. `REV` is a seven-character hash of every served file (all of `src/`,
`styles.css`, `index.html`, `sw.js`), stamped into `config.js` by
`node scripts/check-build.mjs --stamp` and guarded by the plain run of the same
script. It appears next to BUILD in the menu footer and in the debug stats, so
two screens showing the same pair are running the same bytes.

config.js's own REV line is blanked before hashing — it is an input to itself
otherwise and could never be stable. **Any source change makes REV stale**, so
`--stamp` is the last step of any change.

**The opening names DRIFT, and says the two things about it that are not
guessable.** The grey objects were never explained: they look like the harmless
scenery they are, but nothing told you that AUTO AIM will not touch them or
that they are the best energy on the field for the damage. Two lines now do,
and they are in `OPENING` rather than `NOTES` on purpose — NOTES are gated on
the count and a DRIFT does not raise it, so a player who only ever shot drift
would never reach them.

They are read against an empty field. `CFG.WAVES[0]` is grey and nothing else,
and it now carries `dwell: 16` — the least time a wave may last however fast it
clears. Without it that wave ends the instant it starts, having no hostiles to
clear, and the first MOTEs arrive mid-sentence. Measured hands-off: the lines
land at t=27.1 s and t=33.6 s, both at **wave 0 with zero hostiles on the
field**, which is the whole of what makes "not an enemy" land.

All three claims are checked against the running game rather than asserted:
auto-aim returns no target with five DRIFT on the field (`autoTarget` filters
`harmless`); a DRIFT banks **10** energy against a MOTE's 4; and destroying
five of them leaves the count at zero (`counts` is forced false for anything
harmless).

**Volume is a level, not a switch.** The menu had SOUND on/off and nothing
else. It is now a six-segment row under SYSTEM: `audio.VOLUME_STEPS` scaled
against `FULL_GAIN`, ramped with `setTargetAtTime` so a change never clicks,
and written to `sim7749-volume` — the run is saved, so a volume that reset on
every return would be the only setting in the game that did not.

The first segment is off, so mute is a *position on the scale* rather than a
second control that can disagree with it; `audio.enabled` is derived from
`volume > 0` rather than stored beside it. Off gets its own colour (red, not an
unlit segment) so a muted game says so instead of merely failing to say
anything. `setEnabled` survives for the quick mute and remembers the level to
come back to.

It is six tap targets rather than an `<input type=range>` on purpose: a thumb
on a 6px track is a worse control on a phone than five marks you can hit
without looking, and the rest of the interface already reads in segments. The
marks rise left to right so the row reads as a level at a glance; the tap area
is the full 30px row height, not the mark.

**Every ability's border carries its own colour, cold or ready.** It used to be
plain grey until `usable()` went true. Every ability is owned from the first
frame and the charge pips only draw above one charge, so a single-charge ability
on cooldown — WELL, PRISM and STASIS, if nothing had bought them a second charge
— had no colour, no dots and no glow anywhere on it, and read as a button you
did not own rather than one recharging. The cold border is now `currentColor` at
36% and ready is 80%, so readiness is still the loud step and identity never
goes away.

`syncAbilities` also had the readiness check nested inside its cooldown-fraction
diff, so `ready` was only ever recomputed when the bar moved. `readyFraction` is
1 whenever the cooldown is clear, which means anything that changes usability
*without* moving the bar — ORDINAL locking a button, most obviously — left the
border showing the old state. It is checked on its own now.

**WELL bends the substrate.** The lattice is the only thing drawn in the same
space as the field but not *of* it, so a well that visibly drags it is the
difference between an ability that happens on top of the world and one that
happens to it. `Well.wellField()` publishes `{x, y, reach, strength}` each
frame; `game.js` collects whatever is live into one list and hands it to
`background.setWells()`, so the background never holds a reference to an effect
that has ended.

`Background.warp()` pulls each lattice point toward the well and rotates what
is left of its radius as it falls — the twist is what makes it read as an
accretion spiral rather than a dent. Rays are two points each while nothing is
pulling on them and subdivided into eleven only while something is, since a
straight line cannot bend and paying for that all run to cover the three
seconds a WELL lasts would be paying for it all run. Rings go from 26 segments
to 44 for the same reason. Reach is `WELL_REACH × 2.4` — well past the tractor
beam's own — because the strongest part of the bend sits under the well's own
glow at anything tighter, and the visible half of the effect is all out beyond
it. Measured cost while a well is up: **60 fps to about 51**, back to the cheap
path the instant it ends.

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
  physics.js            grid broadphase, impulse solver, arena clamp
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

## House-keeping

A cleanup pass in build 66 fixed six things worth not letting back in:

- **One inline-SVG helper, not three.** `arsenal.js`, `events.js` and
  `upgrades.js` each carried their own copy; two were byte-identical. It lives
  in `util.js` as `svgMark` now. The arsenal's marks are drawn a hair heavier
  and keep that by passing a width, which is the only difference there ever was.
- **One `pick`, or two clearly different names.** `util.js` exports `pick`,
  which returns `undefined` on an empty array, and `upgrades.js` had a local
  `pick` returning `null` — two functions of one name giving different answers
  to the same question. The local one is `pickOrNone` now, which is what every
  caller in that file tests for.
- **`.fx-corona` and `.fx-overdraw` had no tone.** Build 65 added two chips to
  the timed readout and styled neither, so both fell back to the default green
  and read as the same thing. Every entry in `events.TIMED` needs a line in
  `styles.css`, and the suite now checks that no two share a tone.
- **A stale duplicate doc block.** `CFG.rounds.tithe` carried two comments, the
  first describing the round as it behaved before build 53 — no ramp, just a
  energy mark. Gone.
- **A dead branch.** `opt.stacks === false` was checked in `showOffer` and set
  by nothing since the level system landed; `levels === 1` covers it.
- **Dead exports.** `save.hasRun`, `loadout.ownedOf` and the `rollSmallFor`
  pass-through wrapper are gone; `enemies.spawnTow` and `loadout.slotOf` are
  used only inside their own files and are no longer exported.

What a dead-export scan still flags — `UPGRADES`, `AXES`, `UNLOCKS`, `CHARGES`,
`ALL_UPGRADES`, `events.rollSmall`, `save.captureRun` — is exported for the
test suite, which lives in the session scratchpad rather than the repo. There
is a note at each site saying so, because deleting them on the strength of a
scan would take the tests with them.
