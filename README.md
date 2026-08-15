# SIMULATION 7749

A physics shooter for iPhone, played fullscreen from the home screen. One
stationary turret, five hundred objects, a wall with a gate, and a god behind
it. You cannot lose. You can only be corrupted.

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

**Tap anywhere ahead of the turret** and it fires there. There is no tap-rate
limit — tap as fast as your thumb allows. **Hold and drag** to sustain fire at
a steady cadence while you sweep the field.

**Five abilities** sit along the bottom, in the strip your thumb already rests
on. One tap each, no cost, no upgrades, no unlocks. The first time you use one,
a caption explains it.

| | Ability | What it does | Cooldown |
|---|---|---|---|
| ◎ | **PULSE** | Shockwave from the turret; shoves everything away | 7 s |
| Ψ | **FAN** | 22 pellets in a wide spray | 5 s |
| ↑ | **LANCE** | Piercing beam, auto-locked to the biggest threat | 12 s |
| ✳ | **WELL** | Singularity — drags objects together so they break each other | 19 s |
| ❄ | **STASIS** | Objects freeze for four seconds; your shots do not | 21 s |

**Contact does not kill you.** When an object touches the turret the feed
corrupts — slice tearing, chroma ghosting, block noise — and *stays* corrupted
until that specific object is destroyed. The offender is ringed in red and
starts hunting you harder, so the corruption is always clearable. More
attackers, worse corruption.

### The run

1. **STAGING** — objects pour out of the gate. Destroy 500.
2. **GATE** — the doors slam shut. Now the gate is the target. Break it.
3. **BOSS** — **MNEMOSYNE** comes through the breach, slowly. It cannot hurt
   you. It takes things from you instead: your sight, your aim, your rate of
   fire. Shooting pushes it back; stop shooting and it keeps walking.
4. **END** — ending text, then the frame freezes mid-corruption and
   **RESET SIMULATION** appears.

A typical run is about fifteen minutes.

### The objects

Eight kinds, each with its own mass, speed, restitution and way of dying.
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

Everything leaves **debris**: smaller bodies that are themselves destructible,
pushable, and dangerous to each other.

### The physics

Impulse-based circle dynamics: restitution, tangential friction (which is why
things spin when they scrape), positional correction, and a uniform-grid
broadphase. Mass is `density × area`, so heavy objects genuinely shrug off
what light ones can't.

**Collision damage is live.** Impacts above a threshold hurt *both* bodies in
proportion to reduced mass and closing speed. Punting a mote into a lurcher
hurts the lurcher. A WELL that slams six objects together kills most of them
without you firing once.

### The story

Ten sentences, one per fifty objects destroyed. They share a single word. They
appear below the turret, drawn *behind* every entity so they can never hide
something you need to shoot, and they corrupt away after a few seconds.

---

## Debug

The **DBG** chip (top right) opens a panel: skip to the gate, skip to the boss,
kill the boss, +50 kills, advance the story, force a boss power, spawn a
formation, fill the field, clear the field, trigger a glitch, jump to the end
screen, restart — plus toggles for cooldowns, corruption, slow motion,
hitboxes, a live stats readout, and an invulnerable gate.

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
  projectiles.js        swept-collision bolts
  shooter.js            the turret
  gate.js               wall + gate states
  boss.js               MNEMOSYNE
  abilities.js          the five abilities and their effects
  narrative.js          the ten sentences, and how they decay
  hud.js                DOM interface
scripts/
  make-icons.mjs        regenerates icons/  (node scripts/make-icons.mjs)
  smoke.mjs             headless run through every phase (see below)
```

## Tuning

`src/config.js` is the only file you need for balance. The knobs that move run
length most: `bolt.damage`, `shooter.holdFireInterval`, `gate.hp`, `boss.hp`,
`popStart`/`popEnd`, and `spawnInterval`.

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
