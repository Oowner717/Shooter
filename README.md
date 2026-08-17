# SIMULATION 7749

A physics shooter for iPhone, played fullscreen from the home screen. One
stationary turret, five hundred objects, a wall with a gate, and something
numbered behind it. You cannot lose. You can only be corrupted.

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

**Five toggles** sit in a rack just above the ability bar, all off by default:

- **AUTO FIRE** keeps shooting wherever the barrel happens to point. With no
  hand on the lever the barrel rests straight up, so this alone is a fountain.
- **AUTO AIM** tracks the nearest object currently corrupting your feed — a
  marked breacher outranks anything four times closer — leads the shot for
  flight time, and fires on it. It *traverses* between targets at its own
  slower rate, easing off as it arrives, and holds fire until the barrel has
  come round; brackets tighten on the target while it swings. With no target
  it stops shooting and leaves the barrel where it is.

- **AUTO MINE** lobs a mine onto a random patch of the field every few
  seconds. It is completely inert in flight — it passes straight through
  anything in the way — and only arms once it has settled. Drift never sets one
  off; only something that could actually corrupt your feed does.
- **HE** makes every round detonate on impact. It costs you better than half
  your rate of fire and the shells travel slower, so single targets are no
  easier — crowds are.
- **SHOT** loads five pellets a shot in a tight cone at a slower cadence. The
  pellets expire well short of the wall, so it is devastating up close and
  useless at range.

HE and SHOT are exclusive: choosing one clears the other, and tapping the lit
one returns you to standard rounds.

Your hands always win: while you are holding the lever or dragging, the
assists stop steering. Auto fire runs a shade slower than driving it yourself,
so playing actively is still worth it. The boss's INVERT power mirrors auto aim
too — it corrupts targeting, not just fingers.

**Six abilities** sit along the bottom, in the strip your thumb already rests
on. One tap each, no cost, no upgrades, no unlocks. The first time you use one,
a caption explains it.

| | Ability | What it does | Cooldown |
|---|---|---|---|
| ◎ | **PULSE** | Shockwave from the turret; shoves everything away | 7 s |
| Ψ | **FAN** | 25 pellets in a tight cone | 5 s |
| ↑ | **LANCE** | Piercing beam, auto-locked to the biggest threat | 12 s |
| ✳ | **WELL** | Singularity — hauls everything into one grinding knot, then collapses | 19 s |
| ❄ | **STASIS** | Objects freeze for four seconds; your shots do not | 21 s |
| ▲ | **PRISM** | Fused shell that refracts — wide blast plus beams in every colour | 16 s |

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
4. **END** — ending text, then the frame freezes mid-corruption and
   **RESET SIMULATION** appears. Reset is a clean session: the toggle rack
   clears back to standard rounds and no assists.

A typical run is about fifteen minutes.

### The fight

ORDINAL has no more hit points than it ever did. It is harder for three other
reasons.

**The gaze.** It is an eye, so it is only open to you while it is looking at
you. A bolt that lands while it is looking elsewhere does **4.2** damage; one
that lands while it holds your eye does **49.4** — the same round, an 11.8×
swing. Its pupil visibly tracks around the socket and a sightline is drawn out
along whatever it is watching, so the tell is always readable even when the
body is crowded up against the wall. There is a wind-up before it comes round
to you, a green **EYE OPEN · FIRE NOW** pill for the window, and shots that
glance ricochet with a different sound.

Measured against the old fight: a player who simply holds the trigger does
**0.80×** the damage, and a player who waits for the beat does **1.90×**.
Harder if you ignore it, faster if you engage with it, and not one extra hit
point either way. Abilities are deliberately *not* gated — all six land in
full whenever you press them, so the timing game is about the turret only.

**The ledger.** Everything ORDINAL does is paid for out of your own tally. The
moment it arrives, the counter you have watched climb for the whole run turns
red, relabels itself **RECLAIMED**, and starts falling: 18 for a power, 5 per
object it emits, 34 for a reprise, 55 for an echo. Powers it can no longer
afford drop out of its rotation, so the fight thins as its reserve runs down.
At zero the chip reads **SPENT**, it stops rationing — it walks 2.4× faster,
casts twice as often, and can no longer close its eye at all. Roughly two and
a half minutes of spending, and it is a second health bar that you spent
thirteen minutes filling on its behalf.

**The reversal.** Two of its powers run the game backwards.

- **REPRISE** un-kills. Fragments of things you already destroyed lift out of
  the simulation, fly back together along visible seams, and land as whole
  objects again. It prefers real debris near the assembly point and only makes
  up the shortfall from itself, so on a littered field you watch your own work
  undone.
- **ECHO** stands a copy of *your* turret at the far end of the room and
  shoots back with it. Its rounds cannot hurt you — nothing can — but they
  corrupt the feed and throw your barrel off aim when they land. They travel
  slowly and **can be shot down**, which makes your own rounds the counter to
  your own turret.

### The objects

Nine kinds, each with its own mass, speed, restitution and way of dying.
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
things spin when they scrape), positional correction, and a uniform-grid
broadphase. Mass is `density × area`, so heavy objects genuinely shrug off
what light ones can't.

**Collision damage is live.** Impacts above a threshold hurt *both* bodies in
proportion to reduced mass and closing speed. Punting a mote into a lurcher
hurts the lurcher. WELL is built entirely on this: it drags everything within
reach into one spinning knot and most of the kills happen on the way in,
before the collapse goes off at all.

### The story

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
reprise, raise an echo, drain the ledger to the spent endgame, spawn a
formation, fill the field, clear the field, trigger a glitch, jump to the end
screen, restart — plus toggles for cooldowns, corruption, slow motion,
hitboxes, a live stats readout, and an invulnerable gate.

With **STATS** on, the boss fight adds three lines: the ledger and what has
been spent, the gaze (`0.00 shut x0.16` … `1.00 OPEN x1.90`), and how many
reprises and echo rounds are live.

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
  mines.js              inert-in-flight auto mines
  shooter.js            the turret
  gate.js               wall + gate states
  boss.js               ORDINAL: the gaze, the ledger, reprise, echo
  abilities.js          the six abilities and their effects
  narrative.js          the ten sentences, and how they decay
  hud.js                DOM interface
scripts/
  make-icons.mjs        regenerates icons/  (node scripts/make-icons.mjs)
  smoke.mjs             headless run through every phase (see below)
```

## Tuning

`src/config.js` is the only file you need for balance. The knobs that move run
length most: `bolt.damage`, `shooter.gripFireInterval`, `gate.hp`, `boss.hp`,
`popStart`/`popEnd`, and `spawnInterval`.

The boss fight is tuned entirely under `boss.gaze`, `boss.ledger`,
`boss.reprise` and `boss.echo` — `gaze.closed`/`gaze.open` set how much the
timing game is worth, `gaze.hold`/`gaze.away` set how often the window comes
round, and the `ledger.*` costs set how long the reserve lasts. Reach for those
before `boss.hp`: raising hit points makes the fight longer, not harder.

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
