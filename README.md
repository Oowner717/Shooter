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
count, the salvage, what has been unlocked, what is on the strip, which round
and mine are loaded, the two running toggles, the offer clocks and anything
queued — and not the field. The objects in the air, the barrel's angle, a mine
mid-flight: none of it is restored, because restoring a live field is a great
deal of machinery for a moment nobody is attached to. **You come back to your
count, your kit and your salvage, standing on clear ground.**

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
measured, one round through a cluster of six hit three of them for 57. It also gets **DOUBLE TAP** and, at its second level, **TRIPLE TAP** —
follow-up rounds that wait 0.06s at the muzzle rather than shortening the
cadence, which reads as one trigger pull with a stutter in it and not as a
faster gun. HE gets **CLUSTER**, four smaller bursts thrown out around the
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
- **SLUG** barely hurts anything and moves it a very long way — measured at 14
  damage and 100-plus units of travel on one shot. The field is a physics
  problem before it is a shooting one, and this is the round that treats it as
  one.
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
  it comes apart — 70 salvage against 20 for the same body unmarked — and the
  mark rides down onto the fragments, because that is where the salvage is. The
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

**The announcement is the moments, not the plate.** Until build 61 the
permanent chip was a noticeably larger slab carrying a second line —
"permanent · choose one" — on the argument that the size was the announcement.
The trouble is that everything else in that list is a moment and the plate is
not: it sits on the field for as long as the offer goes unclaimed, which is the
whole point of it and also why size was the wrong lever for saying "look at
this". It is now the same size as a top-up (103x29 against 84x25, the
difference being the count badge), told apart by gold and by the reminder pulse
rather than by area — down from 134x40, about a third of the footprint gone.
The second line went with it: the opening already says what an AMENDMENT is,
and the sheet it opens says "permanent · select one" across the top. Measured
clear of the turret at 414, 390, 375 and 320 wide.

- **ALLOCATION**, every 40 kills — about twelve in a counted run. Free tempo,
  gone in a minute.

  | | |
  |---|---|
  | **RESET** | Every ability ready right now. |
  | **HASTE** | Ability cooldowns halved for 45s. *Time stacks, effect does not.* |
  | **SURGE** | Double fire rate for 30s. *Time stacks, rate does not.* |
  | **YIELD** | +150 salvage. |
  | **SEED** | Lay 3 mines now — a random unlocked kind if none is selected. |
  | **SHAKE OFF** | Destroy everything gripping the turret. |

  **SURGE and HASTE carry a TIME STACKS, NOT EFFECT tag.** Both run on a clock
  and both effects are a switch the game reads as a boolean — a flat halving
  while the timer is above zero — so a second one cannot make the turret shoot
  four times as fast. What it does do is **add to the clock**: two SURGEs are
  sixty seconds of double rate, not thirty. The card says which of the two it
  is, because "double fire rate" on its own invites the wrong guess in either
  direction. Neither is capped, so a player who banks offers can hold one long
  window rather than several short ones — offers never expire, and that is the
  point of them.

  The permanent tier has non-stacking upgrades as well, but those are simply
  never offered twice, so the question never comes up; these two come round
  again and again.

  Each carries a mark, drawn the way the permanent ones are. A card is read in
  the two seconds before a tap and a shape lands before a name does; without
  them the small tier showed an empty box where the large tier showed a symbol,
  which read as something missing rather than something simpler.
- **AMENDMENT**, every 50 kills — ten in a counted run. Permanent for the run.
  Three cards, and while anything is still locked the first of them **opens
  something**, because that is the spine of a run: the turret arrives with a
  handful of things and everything else is a choice made on the way. The second is a
  **second charge** for an ability once there is an unlocked one worth
  doubling. The third is a stat, from one of three axes, so a pick is an
  identity rather than a number:
  **AMMO** sharpens what you shoot, **FIELD** is what happens without you, and
  **TURRET** is the machine itself.

  | AMMO | | FIELD | | TURRET | |
  |---|---|---|---|---|---|
  | HOLLOWPOINT | +25% damage | PAIRED CHARGE | +1 mine laid per throw | RATE | +20% fire rate |
  | THROUGH AND THROUGH | +2 spine pierces | BLOOM OUT | +35% patch size, +45% burn | | |
  | SLEDGE | +60% slug knockback | BUCKSHOT | +60% spall pellets | | |
  | DEEP FREEZE | +70% rime chill | REPULSOR | +40% lode reach and push | | |
  | LEVY | +50% tithe mark | | | | |
  | HOT LOAD | +15% fire rate | QUICK ARM | mines go live twice as fast | HANDS OFF | auto fire matches manual |
  | TRACER | +35% round speed | DEEP CHARGE | +35% mine blast radius | SLEW | +50% auto aim turn speed |
  | | | SALTED | a spent mine goes off | | |
  | | | SHRAPNEL | +45% mine blast damage | | |
  | | | DEAD WEIGHT | +65% snare hold | | |
  | | | HOT WIRE | +50% wire damage | | |
  | | | FOURTH BELL | +1 toll per knell | | |
  | RICOCHET | +1 wall bounce | WIDE MOUTH | +40% trigger range | OVERWATCH | +25% damage hands-off |
  | HEAVY | 2x knockback | SWEEP | blasts behind you every 20s | HARD CASING | 40 dmg/s to what touches you |
  | OVERPRESSURE | +40% HE radius | REFLEX | PULSE fires itself at 2+ grips | INSULATION | corruption costs half |
  | FIFTH LINK | ARC +1 jump | INTAKE | wreckage that lands on you is collected | SHRUG | throws objects off every 15s |
  | LIEN | TITHE marks run to 14 | STANDING ORDER | -20% ability cooldowns | | |
  | COMPOUND | +60% tithe mark bite | | | | |
  | SALVO | every 8th shot fires 3 | | | | |
  | OVERSTUFFED (x4) | BOLT rebounds off bodies | | | | |
  | DOUBLE / TRIPLE TAP (x2) | a second and third BOLT behind the first | | | | |
  | CLUSTER | HE throws four smaller bursts | | | | |
  | DOUBLE-O (x2) | +3 SHOT pellets | | | | |
  | LONG SHOT | +55% SHOT range | | | | |
  | SUPERCONDUCTOR | ARC links keep 95% | | | | |
  | LONG LEAD | +60% ARC jump range | | | | |
  | ANNEALED | SPINE keeps 92% per body | | | | |
  | RAILED | SPINE ignores armour | EVENT HORIZON | VOID takes what comes near | | |

Each carries its own mark, and the card says how far along it is. An offer is
read in the two seconds before a tap, and a shape is quicker to recognise than
a name — especially for the repeatable ones, where the question is "which is
the one I already have three of".

**Three kinds of ceiling, and the card says which.** An upgrade with no
`levels` field repeats without limit and its card counts what you hold: `x3`.
`levels: 1` is a switch, and a switch cannot be thrown twice. In between is an
upgrade with a shape to it — OVERSTUFFED runs to four, DOUBLE TAP to two —
and those cards count what is left instead: `LV 2/3`, because that is the
question a ceiling raises. A level may also be a **different card**: the second
DOUBLE TAP is not "DOUBLE TAP again", it is **TRIPLE TAP**, with its own name
and its own line, declared as a `tiers` entry on the same upgrade so the level
history stays one id.

Every one of them is a scalar on `world.up` read at the point of use — nothing
in `src/upgrades.js` reaches into a subsystem — so adding one is a table entry
and one place that reads it.

Two of them are worth calling out. **SWEEP** makes the turret clear behind
itself every twenty seconds, which is the one place the barrel cannot reach —
so the flank problem becomes something you buy your way out of. **REFLEX**
makes PULSE answer a crowd on the turret without being asked.

### Salvage

Every object leaves fragments, and a fragment is worth something from the
moment it drops until the moment it is collected. **Nothing decays.** What is on
the floor is a backlog, not a clock.

**A fragment is collected by being destroyed** — shot, blasted or crushed. An
object's worth comes from its mass and is split across the fragments it leaves,
so a bulwark pays about twenty-eight times what a mote does. The harmless drift
pays a flat six: income the tally never sees.

Auto-aim never targets debris, so clearing the floor is always a decision you
make with your own hand — barrel down, at the wreckage, and not up the field at
what is coming.
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
SALVAGE at object 2, ALLOCATION at object 20 with a real one waiting on the
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

### Wreckage, and being paid for it

Wreckage drifts turret-ward at `salvage.pull` and **lands on you**. It does not
stop, it does not fade, and — as of build 59 — it is not taken in when it
arrives. It sits there.

There used to be a **collection radius**: an unmarked circle at 190 units where
a fragment silently stopped existing and its salvage appeared in the corner.
Build 58 drew that circle and animated the pickup, which made the rule legible
but did not make it a decision. Build 59 removed the rule instead.

What is left is simpler and asks something of the player. **The way to bank a
fragment is to destroy it**, which costs the shots that were going up the field.
An uncleared floor is not an abstraction any more — it is a heap physically on
top of the turret, and it eats your own rounds. Measured against a
twenty-five-piece pile: **14 of 20 shots aimed straight up the field still got
through**, so it is a tax of roughly a third rather than a lockout, and the six
that were stopped banked wreckage instead of being wasted. The pile clears
itself as you fire into it.

**INTAKE** is the upgrade that ends the chore: with it, anything touching the
turret is taken in on contact — the same two-radii test contact uses for
everything else. It used to be "+50% pickup range", a number on a rule that no
longer exists; it is now the switch between wreckage being work and wreckage
being income, which is worth a card on its own. One level, and it never comes
round twice.

The opening says the rule, gated on the first kill so there is wreckage on the
floor to point at: *"Those pieces are wreckage, not enemies. They drift to you
on their own."*, then *"Shoot wreckage to cash it in. SALVAGE is the green
number."*

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
  below the line it is as aimless as it ever was. Measured from the entry line:
  the first one is in the field in under fourteen seconds — ahead of the first
  hostile at twenty-two — eight of them settle between 250 and 780 units above
  the turret, none is left above the top of the field, and one already in the
  band still spends about as many frames rising as falling.

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
