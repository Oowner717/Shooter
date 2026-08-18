# SIMULATION 7749

A physics shooter for iPhone, played fullscreen from the home screen. One
stationary turret, five hundred objects, a wall with a gate, and something
numbered behind it. Nothing you do ends the run early. You can only be corrupted.

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

**Nine cells sit above the ability bar and never go away.** The two **mines**
stack at the left edge, the five kinds of **ammunition** stack at the right
edge, and the two things that **run on their own** sit side by side in the
middle. That is the whole of what you choose between, permanently on screen,
one tap each.

The stacks are at the edges because the middle of that band belongs to the
lever: the turret sits above it and the grip swings through it. Both stacks
grow upward from the floor line, into the part of the field that stays
emptiest.

```
                                                            [ STD  ]
                                                            [  HE  ]
                                                            [ SHOT ]
[BLAST]                                                     [ ARC  ]
[SNARE]              [AUTO AIM][AUTO FIRE]                  [ BARB ]
[ PULSE ][  FAN  ][ LANCE ][ WELL ][ PRISM ][ STASIS ][ DECOY ][ SIPHON ]
```

Every cell is bound on `pointerdown`, like the ability buttons are: a tap
registers the instant the thumb lands, the simulation never stops, the menu
never opens, and the tap never reaches the canvas — so changing rounds mid-wave
never costs you the shot you were about to take.

Ammunition is a radio button: exactly one is lit at all times, **STD** is a
cell of its own, and re-picking the loaded one leaves it loaded. (It used to
unload back to standard, which meant a fumbled double-tap silently dropped you
to the weakest round in the middle of a fight.) The mines are independent
toggles — either, both or neither.

Only the middle pair has to fit the 46px band between the lever's grip at rest
and the ability bar, so only it is height-constrained. Measured at 320, 375,
390 and 430 wide: nothing clipped, every stack fully on screen, the middle pair
6–8px clear of the grip.

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
  reaching for it. It lights to match what is loaded right now, but it is a
  reference: there is no second copy of a control in here.
- **OBJECTS** — the glossary (below).
- **SYSTEM** — sound, reset, the debug panel, the controls, and the build
  number.

Both records are built from data — `ARSENAL` in `src/arsenal.js` and `CODEX` in
`src/codex.js` — so a new round or object is a table entry and no markup.

This replaced a rack of eight chips that sat permanently over the field in two
rows, and then a menu that held the same eight one layer down. The top bar used
to carry a loadout readout as well; with all nine cells permanently on screen it
was a copy of something already visible, so it is gone.

### The two that run on their own

**AUTO AIM** and **AUTO FIRE** sit in the middle of the strip, between the
mines and the ammunition, and they are marked apart from the seven around them
because they are not a choice between things — they are left on or left off.
Both are off by default.

### The mines

Both off by default. Neither is aimed and neither is thrown by you:

- **AUTO MINE** (BLAST) lobs a mine onto a random patch of the field every few
  seconds. It is completely inert in flight — it passes straight through
  anything in the way — and only arms once it has settled. Drift never sets one
  off; only something that could actually corrupt your feed does. One hard bang
  when it goes.
- **AUTO SNARE** (SNARE) lays the other kind of mine, and it does not go off. It opens,
  hauls everything within 210 units into one pinned knot and holds it for three
  and a half seconds, wired visibly to whatever it has caught. It deals **zero**
  damage of its own — measured — because the damage is the objects grinding
  against each other on the way in, and whatever you choose to put into a pile
  that cannot move. Slower to lay, three at a time, and it collapses a
  165-unit spread down to about one.

### The ammunition

Five kinds, one loaded at a time. Every one of them buys its trick with rate of
fire, so **STD** — nothing done to it — stays the right answer more often than
it looks.

- **HE** makes every round detonate on impact. It costs you better than half
  your rate of fire and the shells travel slower, so single targets are no
  easier — crowds are.
- **SHOT** loads five pellets a shot in a tight cone at a slower cadence. The
  pellets expire well short of the wall, so it is devastating up close and
  useless at range.
- **ARC** is the weakest round in the rack on impact and the strongest through
  a crowd: the hit jumps to the nearest thing it has not touched yet and on
  again, up to four links, each a little weaker than the last. It works at any
  range, which is the one thing neither HE nor SHOT does. Poor against anything
  standing on its own.
- **BARB** does almost nothing when it lands — it sinks in and starts biting,
  20 damage every 0.28 s for four seconds, and a body will hold four of them at
  once. It has the slowest cadence of anything you can load, so it is wasted on
  a mote and made for the things that take a while: bulwarks, the gate, ORDINAL
  itself. The spines stick visibly out of whatever is wearing them.

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
| ✳ | **WELL** | Singularity — hauls everything into one grinding knot, then collapses | 19 s |
| ❄ | **STASIS** | Objects freeze for four seconds; your shots do not | 21 s |
| ▲ | **PRISM** | Fused shell that refracts — wide blast plus beams in every colour | 16 s |
| ⚲ | **DECOY** | A turret that is not yours, 300 units up-field. Everything walks at it instead | 24 s |
| ✷ | **SIPHON** | Hauls every loose fragment in and throws it back as a volley | 15 s |

**DECOY** is the one defensive ability. It plants a hollow copy of your turret
up-field; `Enemy.steer` picks it over you, so a scattered field becomes one pile
somewhere that is not on top of you. It is a static physics body, so things heap
up against it rather than drifting through, and it takes the collision damage of
everything it catches — 900 hit points, nine seconds, and a 260-unit blast when
it finally goes. Only one at a time; casting again detonates the old one.

**SIPHON** is the one ability whose strength you build up yourself. It drags
every fragment within 900 units into the muzzle and fires them back out in a
fan across whatever arc the barrel is covering — one shot per fragment, so a
littered floor is a wall of fire and a floor you have just cleared gives you the
six-shot minimum. It also competes with a GLUT for the same food.

**Contact does not kill you.** When an object touches the turret the feed
corrupts — slice tearing, chroma ghosting, block noise — and *stays* corrupted
until that specific object is destroyed. The offender is ringed in red and
starts hunting you harder, so the corruption is always clearable. More
attackers, worse corruption.

### The run

1. **STAGING** — objects pour out of the gate. Exactly five hundred
   glitch-causing objects exist across a whole run, splitter children
   included; the director stops releasing once the quota is spent, so the
   field drains toward the end and the last stragglers close in faster. When
   the five hundredth dies there are no hostiles left on screen at all — only
   harmless drift.
2. **GATE** — the doors slam shut. Now the gate is the target. Every round
   damages it, and blasts reach it at half weight.
3. **BOSS** — **ORDINAL** comes through the breach, slowly. It cannot hurt
   you. It takes things from you instead: your sight, your aim, your rate of
   fire. Shooting pushes it back; stop shooting and it keeps walking. See
   *The fight* below — it is not a health bar.
4. **END** — ending text on its own plate, with the turret dissolving
   underneath it, then the frame freezes mid-corruption and **RESET
   SIMULATION** appears. Reset is a clean session: the strip goes back to
   STANDARD with nothing running on its own.

A typical run is about fifteen minutes.

### The fight

ORDINAL has no more hit points than it ever did, and none of what follows asks
anything of your hands.

**The arrival.** Breaking the gate does not start a fight. The substrate drains
to black, ORDINAL is hauled through the breach over eleven seconds in four
beats — each with its own sound, shock and caption — and *nothing comes out of
the gate for another twenty-four seconds after that*. The opening of the fight
is you and it and an empty field.

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

**It does not advance.** It holds a station 410 units out — **254 units of open
space** between its edge and yours — and it can never be nearer than that. The
only reason it ever moves toward you is to close a gap *you* opened by shooting
it: push it off station and it eases back over about ten seconds, then stops.
Left alone for a minute it does not gain a single unit.

While it is on station its presence rewrites the feed every seven seconds. Two
seconds of sustained fire moves it 39 units, which clears the 30-unit band and
stops the corruption. That is the whole exchange: keep it pushed clear, or wear
it. There is no creep to out-race.

The three numbers have to fit the field: the wall stops its centre at about 232
and the turret sits at about 706, so the entire range it can occupy is roughly
474 units. A station of 410 leaves ~57 units of travel, and a band wider than
that would be one it could never push out of.

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
  slow random walk, drifts back out through the gate as often as in, never
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
and the thing behind the gate is a lock rather than a finish line.

---

## Debug

The **DBG** chip (top right) opens a panel: skip to the gate, skip to the boss,
kill the boss, +50 kills, advance the story, force a boss power, force a
reprise, raise an echo, force a tithe or a subtract, drain the ledger to the
spent endgame, skip the arrival, spawn a formation, fill the field, clear the field, trigger a glitch, throw either kind
of mine, jump to the end screen, restart — plus toggles for cooldowns, corruption, slow motion,
hitboxes, a live stats readout, and an invulnerable gate.

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
  gate.js               wall + gate states
  boss.js               ORDINAL: arrival, worn ledger, reprise, echo, tithe
  abilities.js          the eight abilities and their effects
  narrative.js          the ten sentences, and how they decay
  hud.js                DOM interface, incl. the nine-cell strip
  arsenal.js            rounds, mines and assists: icons, notes, strip order
  menu.js               the menu sheet, built from data
  codex.js              the glossary, and what has been recorded
scripts/
  make-icons.mjs        regenerates icons/  (node scripts/make-icons.mjs)
  smoke.mjs             headless run through every phase (see below)
```

## Tuning

`src/config.js` is the only file you need for balance. The knobs that move run
length most: `bolt.damage`, `shooter.gripFireInterval`, `gate.hp`, `boss.hp`,
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
                                        # gate, boss, powers, ending, restart
```
The smoke test drives the game through every phase in an iPhone-sized viewport,
writes screenshots to `/tmp/sim7749-shots`, and exits non-zero on any console
error. It needs Playwright available (`NODE_PATH` may need to point at a global
install).
