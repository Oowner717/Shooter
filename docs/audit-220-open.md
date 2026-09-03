# Build 220 audit — the findings not yet acted on


Every round type and every mine kind was read end to end by a separate reader,
then each reader's claims were put to an adversarial pass. Nine of the twelve
passes ran; three -- the tree, the machine and the picture sweeps -- hit a
session limit and never adjudicated their reader's claims.

This file is what came out that has NOT been fixed. It is in the repo because
the reports themselves lived in a session directory that goes away with the
container, which is how 243 probe scripts were lost before build 101.

Ten commits of build 220 carry the fixes. Each was proved by reverting it and
watching a named case fail, so none of them is in this file:

  the THORN/LODE runaway (39 blasts a second, for ever, per expired mine)
  ARC's chain, SPORE's ground and THORN's ground outside the damage line
  TITHE's mark paying nothing from tier 15
  split children entering at tier-1 health and tier-1 pay
  VOID absorbed whole by ARMORED, and VOID deleting boss structure
  the spent/staged sweep across all six mine paths
  SLIVER splitting inside the body it was born in
  three uncapped count-nodes, six stale arsenal rows, four overshooting rings
  WIRE cutting where it was not yet drawn, PILE paying the shove fade
  "the oldest goes" evicting the newest, a SNARE snapping and not holding

What is left is below, in three parts. Read the severity, and check the claim
before acting: the nine completed passes refuted eleven claims between them.


## Confirmed by the adversarial pass, not yet fixed

### 1. [medium] OVERSTUFFED applies a third, undeclared effect: +1 arena ricochet per level, which is RICOCHET's whole product

**Where:** `src/upgrades.js:374-376 (node), src/shooter.js:771-773 (the three fields), src/shooter.js:506 (+ up.bounces), src/projectiles.js:154-157 (wall budget) vs src/projectiles.js:495-497 (body budget)`

**Evidence:** upgrades.js:375-376 — `line: 'BOLT bounces off bodies instead of stopping. +1 rebound, +30% life.',` / `apply: (u) => { u.boltRebound += 1; u.boltBounce += 1; u.boltLife *= 1.3; }` with `levels: 4` on the line above. Three scalars written, two stated.

The two counters are separate fields with separate consumers and neither decrements the other. Wall budget, projectiles.js:154 `if (p.bounces > 0) { p.bounces--; p.x = p.r; p.vx = -p.vx; ricochetFx(p); }` (and :157 for the right wall). Body budget, projectiles.js:495-497 `if (p.rebound > 0) {` / `p.rebound--;` / `p.damage *= p.reboundFade;`.

BOLT's branch feeds both at full count: shooter.js:772 `bounces: CFG.bolt.bounces + up.boltBounce,` and :773 `rebound: up.boltRebound,` — and shooter.js:506 then adds RICOCHET on top, `bounces: (opts.bounces ?? CFG.bolt.bounces) + up.bounces,`. So a BOLT's wall budget is `1 + up.boltBounce + up.bounces`; at OVERSTUFFED 4 that is 5 side-wall ricochets against a stock 1.

RICOCHET (upgrades.js:347) is `line: '+1 bounce off the arena edges.', apply: bump('bounces', 1)` with no `levels`, so the tree sells 3 (tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);`). Prices are `n.cost + (n.step||0) * have` (tree.js:345) off COST.upgrade 500 / COST.step 350, so RICOCHET's three levels cost 500+850+1200 = 2550 and OVERSTUFFED's four cost 500+850+1200+1550 = 4100. (The original claim's '500+350+700' is wrong; the substance is not.)

Both comments about it state a single shared budget that does not exist. shooter.js:760-761 — `// OVERSTUFFED rides on the bounce budget, so an extra ricochet is worth` / `// the same whether it comes off a wall or off a body.` It does not ride on it; it is handed both budgets at full count. And upgrades.js:32 — `boltBounce: 0, // extra ricochets, off walls and now off bodies` — `boltBounce` reaches walls only (shooter.js:772); bodies are `boltRebound` (upgrades.js:34). Nothing in regress.mjs asserts either field, so there is no test recording an intent.

**Consequence:** A player who buys OVERSTUFFED for the body rebound also gets up to four extra arena ricochets the row never mentions — a stock BOLT bounces once off a side wall, a bought-out one bounces five times — and RICOCHET, separately priced at 2550 in the same branch, is largely redundant for BOLT. Visible in one trigger pull: aim at the aim-clamp and watch the round come off the wall.

**Suggested fix:** Decide which one the node sells. Drop `u.boltBounce += 1;` from upgrades.js:376 (the row and the shooter.js:760 comment both become true), or keep it and say so in the row ('+1 rebound, +1 arena bounce, +30% life') and rewrite shooter.js:760-761, which is false either way. Fix upgrades.js:32's field comment to name walls only.

**Hash:** No. The canonical ORDINAL fight is a stock turret firing BOLT and PULSE, so `up.boltBounce` and `up.bounces` are both 0 and neither term is entered; the change is confined to freshUpgrades-driven scalars the probe leaves at their defaults.


### 2. [low] MINE — gunScale's 36-line docstring is orphaned: build 215 inserted `class Front` between it and the function, so it now documents the PILE wave

**Where:** `src/shooter.js:29-64 (the header), :65-77 (a second header), :78 `export class Front {`, :324 `export function gunScale(world) {``

**Evidence:** shooter.js:29-64 opens ` * What the tree has done to the gun, as one number, 1 at stock.` and runs 36 lines through the seven measured boss fights, the four terms, and 'Asserted as a PRODUCT in regress.mjs rather than node by node'. Line 65 immediately opens a SECOND docstring — ` * The wave a PILE sends out through the floor.` — and line 78 is `export class Front {`. Two block comments back to back is the tell: the first documents nothing.

`gunScale` is 260 lines below with no header at all: shooter.js:322-324 is `}` / blank / `export function gunScale(world) {`.

Cause, from history rather than guessed: at build 214 (`git show 574c668:src/shooter.js`) the header was line 30 and `export function gunScale` was line 63 — directly beneath it. Build 215 (166930e, 'PILE replaces SIGHT') added `Front` between them and left the header where it was. This is the `windAt`/`rateAt` shape CLAUDE.md records, on a docstring rather than a function.

**Consequence:** None at runtime. A reader opening shooter.js is told that the PILE shock front is 'what the tree has done to the gun', and the one function the boss temper depends on carries no explanation of itself — which is how the stale 1.25 in that same block has gone unread for five builds.

**Suggested fix:** Move shooter.js:29-64 down to sit immediately above `export function gunScale` at :324, leaving :65-77 as `Front`'s own header.

**Hash:** No. Comment movement only.


### 3. [low] CFG.bolt.life (2.2s) is unreachable on every viewport the game runs at, so the '+30% life' third of OVERSTUFFED's row buys nothing observable in straight flight

**Where:** `src/config.js:1153 `life: 2.2,`; src/shooter.js:771 `life: CFG.bolt.life * up.boltLife,`; src/projectiles.js:121, 154-158, 160; src/upgrades.js:375`

**Evidence:** A BOLT ends three ways: the timer (projectiles.js:121 `if (p.life <= 0) endProjectile(world, p, p.x, p.y, true);`), the wall budget (projectiles.js:154/157), or leaving the field (projectiles.js:160 `if (p.y < -world.stageHeight || p.y > world.floorY + 60) p.dead = true;`). It dies at the min of the three.

Geometry, derived from the code rather than sampled: `world.floorY = (sh - (safeBottom + barH + 22)) / z` (game.js:857) with `zoom: 0.62` (config.js:70) and `--bar-h` 74; `shooterY = floorY - CFG.shooter.standoff` with `standoff: 210` (config.js:527); muzzle is `r * 1.42` out at `r: 26` (shooter.js:435-441, config.js:526); `STAGE_HEIGHT = 320` (game.js:40); `aimClamp: 1.36` (config.js:533); `speed: 1520` (config.js:1149).

At 390x844 (the viewport regress.mjs:66 uses): world 629.0 wide, floorY 1206.5, turret 996.5, muzzle 959.5. Vertical run to the top exit D = 1279.5. Horizontal run to exhaust B bounces H(B) = 310 + B*620 (centre to a wall, then B full crossings). Both budgets are consumed at 1520 u/s along their own axis, so the longest possible flight is at the angle where the two run out together — tan(theta) = H/D — and at that angle the flight is exactly sqrt(H^2 + D^2)/1520. No sweep needed:
  n=0  B=1  H=930    max 1.041s  vs life 2.200  (ratio 2.11)
  n=1  B=2  H=1550   max 1.318s  vs life 2.860  (2.17)
  n=2  B=3  H=2170   max 1.655s  vs life 3.718  (2.25)
  n=3  B=4  H=2790   max 2.018s  vs life 4.833  (2.39)
  n=4  B=5  H=3410   max 2.395s  vs life 6.283  (2.62)
Every crossing angle is inside the clamp (the worst, n=4, is atan(3410/1279.5) = 1.213 < 1.36). Same conclusion at 430x932 (1.154s stock) and even at iPad 1024x1366 (2.139s against 2.20). The gap WIDENS with every level bought, because 1.3 per level beats the sqrt of a linear bounce budget.

**Consequence:** '+30% life' is one of the three things OVERSTUFFED's row advertises and it changes nothing a player can see in straight flight at any level: the round always leaves the field or runs out of wall bounces first, by a factor of at least 2.1. The one path that could reach the timer is a body rebound turning a round back down-field, which is the same node's other half — so the third clause is at best an invisible support for the first. Note the limit of my own measurement: I bounded straight flight and wall bounces analytically and did NOT bound a path that rebounds off bodies, where 4 rebounds plus 5 wall bounces could in principle chain enough segments to reach 6.28s; I believe that is not reachable in play but I have not proved it.

**Suggested fix:** Cheapest honest fix is the row: say what the extra life is for (it lengthens a REBOUNDING round's total path, not its straight flight), or drop the clause. `CFG.bolt.life` itself is a sound backstop and should stay — the rounds that need a short life set their own (shooter.js:525 `life: g.life * up.shotRange` for SCATTER; mines.js:446 `life: 0.85` for SPALL pellets).

**Hash:** No, for a row-wording or `boltLife` change. It WOULD be worth re-running if anyone lowered `CFG.bolt.life` far enough to bind, since the canonical fight would then start expiring rounds — though for BOLT `p.burst` is null, so a life expiry and a field exit reach the same end state.


### 4. [low] endProjectile's `impacted` parameter is true at all six call sites and its docstring names a path that never goes through the function

**Where:** `src/projectiles.js:107-110 (docstring and guard); calls at :121, :155, :158, :513, :518, :523; the field-exit path at :160`

**Evidence:** projectiles.js:107 — `/** End a projectile. \`impacted\` is false only when it simply leaves the field. */` — and :110 `if (impacted && p.burst) p.burst(world, x, y);`.

Every call site, grepped from the whole tree (the function is module-private, no other file references it): :121 `endProjectile(world, p, p.x, p.y, true);`, :155 `else endProjectile(world, p, p.x, p.y, true);`, :158 same, :513 `endProjectile(world, p, c.x, c.y, true);`, :518 same, :523 same. Six of six true.

The case the docstring names does not call it: :160 `if (p.y < -world.stageHeight || p.y > world.floorY + 60) p.dead = true;` sets the flag directly. So the false arm of the guard cannot be taken, and the parameter is a constant threaded through six call sites — the `world.endless` shape CLAUDE.md records ('if nothing can set it false, delete the flag, not the branch').

**Consequence:** None today: the field-exit path reaches the same end state (dead, burst uncalled) by a different route. It is a maintenance trap — the next person adding a burst-carrying round reads the docstring, believes the parameter is live, and gets no help from it.

**Suggested fix:** Either drop the parameter and the guard (the burst always fires when this is called), or route :160 through `endProjectile(world, p, p.x, p.y, false)` so the branch becomes real and the docstring true. The second is behaviour-identical and leaves one exit door.

**Hash:** No. Both fixes end at `p.dead = true` with `p.burst` uncalled, exactly as now.


### 5. [cosmetic] PRISM's reflect docstring states the landing window on the wrong radius and describes it as an area fraction the 2-D geometry cannot produce

**Where:** `src/config.js:3546-3548 and :3565; src/physics.js:238-243, :260; src/enemies.js:1065`

**Evidence:** config.js:3546-3548 — ` * Glancing bolts bounce off instead of landing: a round lands only if the` / ` * cosine of its angle of incidence is above this, which is |b| < 0.6r --` / ` * three fifths of the width of the disc, a bit over a third of its area.` with `reflect: 0.8` at :3565.

The test is enemies.js:1065 `if (this.type.reflect && c.incidence < this.type.reflect) {`, and incidence is physics.js:260 `incidence: depth / R,` with :243 `const depth = Math.sqrt(Math.max(0, R * R - b * b));` and :238 `const R = (e.r || 1) + pr;`. So incidence = sqrt(1 - (b/R)^2) and a round lands iff |b| <= sqrt(1 - 0.8^2) * R = 0.6 * R — where R is `e.r + p.r`, not `e.r`.

PRISM `r: 20` (config.js), BOLT `r: 4.2` (config.js:1150) -> R = 24.2, so the window is |b| <= 14.52 = 0.726 * e.r, 21% wider than the '0.6r' the comment states. And because R carries the ROUND's radius the window moves with the round: SCATTER pellet (r 3.2, shooter.js:522) lands out to 0.696 * e.r, SPINE dart (r 3.4) to 0.702, SLUG (r 7.2, shooter.js:599) to 0.816, the PRISM ability shell (r 8, abilities.js:1036) to 0.84. A fatter round is measurably more likely to land at the same offset.

'a bit over a third of its area' is 0.6^2 = 0.36, the area ratio of a concentric disc — the wrong quantity for a 2-D game. The impact parameter is one-dimensional, so of the aperture that can be hit at all (|b| <= R) exactly 60% lands, and of the body's visible width 72.6% lands for a BOLT.

**Consequence:** None to the code — the geometry is right and the regress case ('a square-on shot always lands on a PRISM, and a graze always bounces') is measuring the right thing. The cost is to the next person retuning `reflect` off this comment, who will be aiming at a window a fifth narrower than the real one and an area fraction half the real one — which is exactly how 0.55 came to be fitted to a broken test before build 211.

**Suggested fix:** Rewrite as: a round lands iff |b| <= 0.6 * (e.r + p.r) — 0.73 * r for a BOLT, and it widens with the round's own radius; 60% of the hit aperture, 73% of the body's visible width. Drop the area clause.

**Hash:** No. Comment only.


### 6. [cosmetic] SPIRAL leftovers in the fire path: a `slow` constant multiplied into all nine rounds, a dead `scale` parameter, and an orphaned docstring in the Projectile constructor

**Where:** `src/shooter.js:495 and the nine multiplications at :536, :550, :564, :592, :613, :631, :645, :662, :688, :770; :489 and :492 and :504; src/projectiles.js:26-30`

**Evidence:** shooter.js:495 — `const slow = 1;` — declared inside `shoot()`, never reassigned, and multiplied into every round's speed including BOLT's (`speed: CFG.bolt.speed * slow,`). Ten call sites, one value, always 1.

shooter.js:489 — ` * @param scale a multiplier on the round's damage. SPIRAL fires mid-sweep` — and :492 `shoot(world, scale = 1) {`, reaching damage at :504 `damage: (opts.damage ?? CFG.bolt.damage) * up.damage * scale,`. Every `.shoot(` in src/ and scripts/ passes one argument: game.js:924, :934, :976, :1399 and every probe. SPIRAL was removed in build 217 (CLAUDE.md, 'Nothing in the bar takes the barrel any more').

projectiles.js:26-30 is a five-line block opening ` * Thrown by SPIRAL's sweep rather than aimed...` with NO field under it — line 31 opens a second block documenting `this.form`. The field it described went with the ability; its docstring did not. Same shape as `windAt`/`rateAt`, and the same shape as the gunScale header reported above.

**Consequence:** None — both terms are x1. It is dead weight in the hottest authoring surface in the game, and the orphaned comment actively misleads: it reads as documentation for `this.form`.

**Suggested fix:** Delete `slow` and its ten multiplications, drop the `scale` parameter and the `* scale` at :504, delete projectiles.js:26-30. The same sweep catches the other stranded SPIRAL comments at shooter.js:341 ('1 while SPIRAL is sweeping' above `this.gripHeld`), game.js:177 and game.js:425-435.

**Hash:** No. `x * 1` is exact in IEEE754, so removing both multiplications leaves every number bit-identical; the rest is text.


### 7. [medium] CLUSTER's "the same total on one body" holds only at OVERPRESSURE 0, and reaches x2.28 at OVERPRESSURE 3 — with the sub-rings unset at exactly the levels the damage arrives

**Where:** `src/shooter.js:1558-1582; src/config.js:602`

**Evidence:** Re-derived and CONFIRMED, with one framing correction. shooter.js:1558-1560 `// CLUSTER. Four smaller ones thrown out around the first, so HE stops being / // a circle and becomes a patch of overlapping circles — the same total on / // one body, and a great deal more across a line of them.` config.js:602 `cluster: { n: 4, out: 78, scale: 0.5 },`. shooter.js:1565 `const cx = x + Math.cos(a) * c.out;` — `out` is never multiplied by `world.up.blastR`, while the sub radius at 1569 (`r: r * c.scale`) is, because `r` is `b.r * world.up.blastR` (1556). OVERPRESSURE has no `levels` (upgrades.js:349) so tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);` sells three, and heFx's own docstring agrees (shooter.js:1598-1599 "runs from 96 units stock to 263 fully bought"). The burst is centred on the shot body's SURFACE — projectiles.js:513 `endProjectile(world, p, c.x, c.y, true);` with physics.js:257 `x: e.x + nx * (e.r || 1),` — so for that body d = e.r exactly. applyBlast (enemies.js:4519-4521, 4546): `if (d2 > r2) continue;` … `const falloff = 1 - d / r;` … `e.applyDamage(world, damage * (0.35 + falloff * 0.65), …)`. For a 20-radius body, r = 96·1.4^L, sub r = 0.5r, four sub centres 78 from the burst point: L0 r=96 main 38.04, cluster +0.00 (x1.00); L1 r=134.4 main 39.74, +16.16 (x1.41); L2 r=188.16 main 40.96, +39.79 (x1.97); L3 r=263.42 main 41.83, +53.55 (x2.28). I checked the reader's implicit assumption of a vertical arrival: with the round arriving along a diagonal instead (sub distances 58 / 80.5 / 80.5 / 98 rather than 65.4 / 65.4 / 93.2 / 93.2) the L3 total is 53.6 — identical, because the fan has four-fold symmetry. It is not a small-body artefact either: a BULWARK (r 45, config.js:2730) at L3 takes 39.1 + 51.0 = x2.30. Draw guard, shooter.js:1582 `if (c.out + r * c.scale > r * 1.02) heFx(cx, cy, r * c.scale, true);` ⟺ 78 > 0.52r ⟺ r < 150, so rings are drawn at 96 and 134.4 and dropped at 188.16 and 263.42.

**Consequence:** CORRECTION to the reader's consequence: the player-facing row is NOT contradicted — upgrades.js:389-390 says only 'An HE burst throws four smaller ones outward', which is true. What is contradicted is the source comment and the design it records: CLUSTER is a x1.00 single-target node with no OVERPRESSURE and a x2.28 one with three, taking HE from 15+41.8 = 56.8 damage a round to 15+95.4 = 110.4 — a near-doubling of the round that no text anywhere accounts for, arriving as a side effect of a different node. The picture does not lie about WHERE the damage lands (every sub-blast is inside the drawn circle at L>=2, which is what the guard is for) but from L2 on it is pixel-identical to an HE with CLUSTER unbought.

**Suggested fix:** Scale the offset with the radius: `const cx = x + Math.cos(a) * c.out * world.up.blastR;` (and cy, and the guard). I verified this does what the reader says: with `out` self-similar the sub centres sit at 200-245 units from a 20-radius body's centre against a 131.7 sub radius at L3, so the added single-target damage stays 0.0 at every level, and the guard stays true at every level because 78·blastR > 0.52·96·blastR reduces to 78 > 49.9. It also invalidates the 'clover 252 units across' figure at shooter.js:1579. The honest alternative is to strike 'the same total on one body' from 1559-1560 and say CLUSTER is a damage node above one OVERPRESSURE level.

**Hash:** No. heBurst runs only for HE; the canonical ORDINAL probe fires BOLT and PULSE with nothing bought, so `up.cluster` is false and `up.blastR` is 1.


### 8. [low] TRACER is a bigger SCATTER range node (x1.82) than LONG THROW (x1.55), and puts the pellet past the reach config.js deliberately cut — but the reader's field geometry is wrong

**Where:** `src/shooter.js:503, 536-540; src/config.js:660-665; src/upgrades.js:346, 400-402`

**Evidence:** CONFIRMED on the arithmetic, with the premise corrected. config.js:660-665 `// Range is speed x life and nothing else, so this is the whole of it: / // 0.5 reached 560-710 units, which was most of the way up the field for / // a round whose whole trade is being murderous up close. A quarter off.` then `life: 0.375,`. shooter.js:536 `speed: rand(g.speed[0], g.speed[1]) * slow,` passes through the shared helper at 503 `speed: (opts.speed || CFG.bolt.speed) * up.speed,`; life at 540 `life: g.life * up.shotRange,`. `updateProjectiles` (projectiles.js:113-168) applies no drag, so range is exactly speed x life. TRACER (upgrades.js:346, `levels: 2`, `scale('speed', 1.35)`) gives up.speed = 1.8225; LONG THROW (upgrades.js:400-402, `levels: 1`, `scale('shotRange', 1.55)`). Stock 420-533; TRACER alone 765-971; LONG THROW alone 651-825; both 1186-1504. CORRECTION: the reader's 'ENTRY_Y 260 … ~736 units' is wrong — enemies.js:18 is `export const ENTRY_Y = 0;` and has been since 'Remove the wall and the gate'. At 390x844 (zoom 0.62, game.js:855-859, shooterY = floorY - 210) the turret is at y=996.4 and the live column above it is 996 units, not 736. That does not save the claim: 765-971 still sits above the 560-710 band the author explicitly cut, and both nodes together (1186-1504) outrange the whole column. `up.speed` is invisible on the rest of the rack — SCATTER and BOLT are the only two rounds in `shoot()` that set a `life` at all (shooter.js:540 and 748), and BOLT's is 1520x2.2 = 3344 units, far past the field either way.

**Consequence:** arsenal.js:171 `dmg: '12 x 5', fx: 'A tight cone that dies short. Close range only.'` and LONG THROW's 'The cone still ends, but further out' are both false on a bought gun: the cliff SCATTER is designed around is removed by a whole-rack node that says nothing about range and does more of it (x1.82) than the node authored for it (x1.55). This is the weakest of my confirms — a speed node lengthening a life-limited round is arguably inherent, and the author knew range = speed x life. What makes it reportable is that they wrote 'so this is the whole of it' next to the one lever that is not the whole of it.

**Suggested fix:** Take up.speed out of the pellet's reach rather than its speed — in the shotgun branch pass `life: g.life * up.shotRange / up.speed` — or give the pellet a distance budget instead of a life. Either keeps TRACER's 'arrives sooner' and leaves the cliff where LONG THROW puts it. If instead the interaction is wanted, the arsenal line has to stop saying 'close range only'.

**Hash:** No. SCATTER is never loaded in the canonical fight and TRACER is never bought (up.speed = 1); a change confined to the `world.round === 'shotgun'` branch cannot reach the BOLT path.


### 9. [low] HEAVY is worth x1.89 on an HE round, not x4: the blast impulse is the one term in heBurst the tree does not reach

**Where:** `src/shooter.js:1557, 1571 vs src/shooter.js:505; src/upgrades.js:348`

**Evidence:** CONFIRMED, and I re-ran the simulation. shooter.js:1557 `applyBlast(world, { x, y, r, damage: b.damage * world.up.damage, impulse: b.impulse });` — damage takes the tree, impulse does not; same at 1570-1571 (`damage: b.damage * c.scale * world.up.damage,` / `impulse: b.impulse * c.scale,`). The shell itself does take it, shooter.js:505 `impulse: (opts.impulse ?? CFG.bolt.impulse) * up.impulse,` on the HE branch's `impulse: 70`. upgrades.js:348 `{ id: 'heavy', name: 'HEAVY', levels: 2, line: '2x knockback on every hit.', apply: scale('impulse', 2) }` → up.impulse = 4. `up.impulse` has exactly ONE consumer in the whole codebase (grep: shooter.js:505). On a quiet 20-radius body at stock radius the blast delivers 420·(1-20/96) = 332.5 against the shell's 70, and the shove fade (enemies.js:1186 `const fade = throwOff ? 1 : 1 / (1 + (this.kicked || 0));`) charges the shell 1.0 and the blast 0.5: 236.3 unbought against 446.3 with two HEAVYs = x1.89. My own 10-second simulation at the stock HE cadence (0.286 x rate 2.1 = 0.6006s, kickFade 1.5, config.js:1222) gives 1944 → 3113 = x1.601, reproducing the reader's x1.60 to within rounding.

**Consequence:** On the one round whose knockback is 83% blast, the ammo branch's knockback node buys 60% more shove where its row promises 300%. I am less sure than the reader that this is a defect rather than a convention: NO blast anywhere takes up.impulse (mines.js:291 and 464, abilities.js:692 all pass a raw impulse), and PULSE has `pulsePush` of its own where HE's blast has nothing. But nothing states the convention, and 'on every hit' is what the row says.

**Suggested fix:** Either `impulse: b.impulse * world.up.impulse` at 1557 and `b.impulse * c.scale * world.up.impulse` at 1571 — note this is a real buff, x4 on the dominant term of HE's shove, and would want the ladder case re-run — or amend HEAVY's row to say the round and not its blast. Do not extend it to mines or abilities, which have their own nodes.

**Hash:** No. heBurst runs only for HE, which the canonical fight never loads; and up.impulse is 1 with nothing bought, so even moving the multiply inside applyBlast (which PULSE does use) leaves the arithmetic identical.


### 10. [cosmetic] Three clamp arms in the HE burst that no radius the game can produce will ever reach

**Where:** `src/config.js:643; src/shooter.js:1586, 1607, 1697`

**Evidence:** CONFIRMED, and there is a third the reader missed. config.js:643 `cap: 2.2, // the most any of those counts may be multiplied by`; shooter.js:1607 `const size = Math.min(F.cap, Math.sqrt(r / R));`. `blastR` is written by one node only (grep 'blastR': upgrades.js:26, upgrades.js:349, shooter.js:1556), so max r = 96 x 1.4^3 = 263.42 and size = sqrt(2.744) = 1.6565. For the Math.min to bind, r would have to reach 96 x 2.2^2 = 464.6. heFx's other callers are shooter.js:1582 (r x 0.5, smaller) and 1585 — nothing else in src calls it. Second: shooter.js:1697 `ripple(x, y, clamp(r / R, 0.7, 2), r * 3);` sits below `if (light) return;` (1678), so it only ever runs for a main burst where r/R is 1, 1.4, 1.96 or 2.744 — the 0.7 floor is unreachable (the upper arm 2 IS taken at OVERPRESSURE 3). MINE, same function: shooter.js:1586 `shake(clamp(r * 0.045, 2.4, 7));` — r x 0.045 runs 4.32 to 11.85 over the same four radii, so the 2.4 floor needs r < 53.3 and is equally dead, while the 7 ceiling binds from OVERPRESSURE 2 (8.47).

**Consequence:** None visible. Three guards that have never fired, and a docstring (shooter.js:1600-1602, 'The counts scale with the square root of that rather than with the area, and are capped') describing protection that is not in force — the counts are bounded by the ladder's three levels, not by the cap. The cap becomes live and silently raises every particle count 33% the day a fourth OVERPRESSURE level or a second blast-radius node lands.

**Suggested fix:** Either give `cap` a value the ladder can reach (1.7 makes it a real ceiling with headroom over today's 1.6565) or delete it and say the counts are bounded by blastR's three levels. Same for the 0.7 in the ripple clamp and the 2.4 in the shake clamp.

**Hash:** No. Drawing and screen shake only, HE only, and no rand() draws added or removed.


### 11. [cosmetic] `front`'s config comment still describes the ring the build-211 fix removed

**Where:** `src/config.js:634; src/shooter.js:1625`

**Evidence:** CONFIRMED. config.js:634 `front: 0.13, // seconds the leading ring takes to reach the blast radius` against shooter.js:1625 `ring(x, y, r, r * 1.1, F.front, '#fff0e2', 4.4);`. fx.js:235 is `export function ring(x, y, r0, r1, life, color, w = 3, fill = 0, a0 = 0, span = TAU)`, so r0 = r: the ring is AT the blast radius on frame one and 0.13 is its whole life, over which it drifts out a tenth. The source comment eleven lines above the call says so in as many words (shooter.js:1614-1620, 'It starts at `r` rather than expanding into it, and that is the whole point'), and the config block at 614-620 records the pre-211 semantics as the bug — so the key's own comment is the only place the old model survives.

**Consequence:** None in play; the fix itself is correct and intact. The next author raising `front` to make the ring reach further will make it live longer at the same radius.

**Suggested fix:** `front: 0.13, // life of the leading ring, drawn AT the blast radius and drifting out a tenth`.

**Hash:** No. A comment.


### 12. [cosmetic] The 'about 210 units' that justifies dropping the sub-blast rings is 156, and the guard actually written cuts at 150

**Where:** `src/shooter.js:1574-1582; README.md:1884-1887`

**Evidence:** CONFIRMED. shooter.js:1575-1576 `* fixed 78 units and is not scaled by OVERPRESSURE, so once the main / * radius passes about 210 every sub-blast is entirely inside it`. Entirely inside means out + r·scale <= r ⟺ 78 <= 0.5r ⟺ r >= 156. The guard is shooter.js:1582 `if (c.out + r * c.scale > r * 1.02) heFx(cx, cy, r * c.scale, true);` ⟺ 78 > 0.52r ⟺ drawn only while r < 150. OVERPRESSURE's four states are 96, 134.4, 188.16, 263.42, so the rings stop at level 2 — 'about 210' sits between 188 and 263 and reads as though level 2 still draws them. README.md:1885-1886 repeats it: `so past about a 210-unit main radius every sub-blast is entirely inside it and`.

**Consequence:** None on screen. It is the number a deliberate design decision is recorded with in two places, and it puts the change one whole OVERPRESSURE level later than it happens.

**Suggested fix:** Replace 'about 210' with 156 (or 'from the second OVERPRESSURE level') in the source comment and the README, and note the guard's own cut is 150 because of the 1.02 margin.

**Hash:** No. Comments.


### 13. [low] Two dead numbers threaded through every round the turret fires: `scale` and `slow`

**Where:** `src/shooter.js:492, 495 (and 504, 536, 551, 593, 614, 649, 663, 717, 768)`

**Evidence:** CONFIRMED. shooter.js:492 `shoot(world, scale = 1) {` — every caller in the game passes one argument (game.js:924 `s.shoot(w);`, :934, :976 `this.world.shooter.shoot(this.world);`, :1399), so `scale` is never anything but 1, and it reaches HE's and SCATTER's damage at 504 `damage: (opts.damage ?? CFG.bolt.damage) * up.damage * scale,`. Its docstring at 490 still reads 'SPIRAL fires mid-sweep at less than a placed shot is worth' and SPIRAL went in build 217 (`grep -rn chrono src/` and `grep -rn SPIRAL src/` return nothing but this comment family). shooter.js:495 `const slow = 1;` is multiplied into nine round speeds and cannot change any of them. canFire's header at 472 also still explains SPIRAL zeroing the cooldown.

**Consequence:** None at runtime. It is the `windAt`/`rateAt` shape CLAUDE.md records from SPIRAL's removal, except the dead value is threaded through every branch of the fire path rather than sitting in a private function, so it reads as a live knob.

**Suggested fix:** Delete `slow` and its nine `* slow`, drop the `scale` parameter and its `* scale`, and strike the SPIRAL sentences from the `shoot` and `canFire` headers.

**Hash:** No — both are identity multiplications and neither adds nor removes a rand() draw, so the default BOLT path stays byte-for-byte, which is the property projectiles.js:762-771 says is load-bearing.


### 14. [low] MINE: `Shooter.cooldown` can never be non-zero, so canFire's cadence guard has one arm that is never taken

**Where:** `src/shooter.js:351, 368, 446, 483`

**Evidence:** MINE — found in the same two functions as claim 10, which the reader read and did not follow through. `grep -n cooldown src/shooter.js` and `grep -rn '\.cooldown =' src/` return, in the whole codebase: shooter.js:351 `this.cooldown = 0;`, :368 `this.cooldown = 0;`, :446 `this.cooldown = Math.max(0, this.cooldown - dt);`, and one read at :483 `return this.cooldown <= 0;`. Nothing anywhere assigns it a positive value — `shoot()` does not set it, and the cadence lives entirely in `Game.fireTimer` (game.js:1391-1399). So line 446 is `Math.max(0, 0 - dt)` every frame, and canFire reduces to `!(world.boss && world.boss.sequencing())`. Its header at 466-472 justifies the field by SPIRAL, which 'zeroes the cooldown to bypass the cadence' — SPIRAL was removed in build 217.

**Consequence:** None visible, and the always-true reading is the documented behaviour ('Tapping faster than this is still always allowed', config.js:531). It is exactly the `world.endless` / `wardLife` shape CLAUDE.md names twice: a field nothing can set, with a reader that can never take its other branch, kept alive by a comment about a deleted feature. It also means 'up to forty-five in the air' has no cadence bound at all against a fast tapper.

**Suggested fix:** Delete `cooldown` and its three writes, make canFire `return !(world && world.boss && world.boss.sequencing());`, and keep the boss half of the header — that half is live and load-bearing.

**Hash:** No. The canonical probe drives auto-fire through `Game.updateFiring`, which never consults the field's value beyond the always-true test.


### 15. [low] MINE: the aimRange design note is written against an ENTRY_Y of 260 that has been 0 for many builds, and DEEP ARRAY's row inherits the error

**Where:** `src/config.js:554-563; src/enemies.js:18; src/upgrades.js:621-624`

**Evidence:** MINE — this is the stale number that produced the reader's wrong premise in claim 2, so it is worth killing. config.js:555 `* world and objects go live at y=260, which puts the far corner 800 units`, :559 `* 400 is the near half: a little past the middle of the live field`, :562 `* and two levels of it (x1.45 each) come to 841 — the whole field again,` / `* with the corner inside it.` But enemies.js:18 is `export const ENTRY_Y = 0;` ('The top of the visible field, in world units'), and has been since commit 2d901b8 'Remove the wall and the gate'. At the note's own device (390x844, CFG.zoom 0.62, game.js:857 `world.floorY = (sh - (safeBottom + barH + 22)) / z;`, game.js:820-822 `return this.world.floorY - CFG.shooter.standoff;`) the turret is at y=996.4 — which the note gets right — so the live column above it is 996 units, not 736, the far corner is sqrt(314.5^2 + 996.4^2) = 1045 units and not 800, 400 is 40% of the column rather than 'a little past the middle', and ARRAY's 841 leaves the corner 204 units outside it.

**Consequence:** The reach numbers themselves (400, 841) are right; what is wrong is every statement about how much field they cover — and one of those is player-facing. upgrades.js:623 sells DEEP ARRAY as '+45% again, on top of ARRAY. A second fin, and the sweep reaches the top of the field.' At 390x844 it reaches y=155 of a field whose top is y=0, so the top 16% of the column is out of reach with the node fully bought; at 430x932 it is 297 units short. The row is only true on short screens (at 320x568 the turret is at y=551 and 841 covers the whole column and both corners), which is the worst kind of true.

**Suggested fix:** Re-derive the paragraph off ENTRY_Y = 0 at a stated screen size, and either reword DEEP ARRAY's line ('reaches the top of the field on a short screen' is not sellable — 'most of the way up the field' is) or raise the ladder so 841 clears the tallest supported column.

**Hash:** No if only the comment and the row string change. Raising aimRange WOULD move it — the canonical probe runs with auto-fire and the assist on, so what the turret can point at is exactly the channel build 209's re-baseline went through.


### 16. [cosmetic] MINE: `chainFrom`'s own header does the ARC arithmetic wrong — the chain is 80.89, not 84, and the two figures it derives from that are both ~3.4% high

**Where:** `/home/user/Shooter/src/projectiles.js:196-206`

**Evidence:** projectiles.js:199-201 — `   * ARC's dart scaled with the AMMO line and its four jumps did not -- and`
`   * the jumps are 88% of the round: 11 on the dart against 25 x (1 + 0.86 +`
`   * 0.86^2 + 0.86^3) = 84 down the chain.`
0.86^2 = 0.7396 and 0.86^3 = 0.636056, so the bracket is 3.235656 and 25 x 3.235656 = 80.891, not 84. (The 88% in the same sentence is right — 80.891 / 91.891 = 88.0% — so the sum is a slip, not a different model.)
The two figures the header then quotes both inherit the slip: projectiles.js:202-203 `   * ARC's damage per round from 95 to 121, a factor of 1.27 against the` / `   * 3.375 its rows promise`. 11 + 84 = 95 and 11*3.375 + 84 = 121.1, which is where they come from. The correct pair is 11 + 80.891 = 91.89 stock and 37.125 + 80.891 = 118.02 fully bought, a factor of 1.284.
Constants checked: config.js:673-677 `      damage: 11,` / `      jumps: 4,` / `      jumpRange: 210,` / `      jumpDamage: 25,` / `      falloff: 0.86,`. HOLLOWPOINT is 3 levels of x1.5 in the tree (verified by importing tree.js: `hollowpoint 3`), so 1.5^3 = 3.375 is right.

**Consequence:** None. The code on the line below the comment (projectiles.js:207 `  let damage = g.jumpDamage * up.damage;`) is correct; only the numbers in the prose are. Worth fixing because this is the header the next person will quote when they re-derive ARC's share.

**Suggested fix:** projectiles.js:201 → "= 80.9 down the chain"; :202-204 → "from 92 to 118, a factor of 1.28". Leave the 88% and the measured dps figures (18 stock, 86 bought) alone — the share is right and the dps numbers are measurements, not derivations.

**Hash:** No. Comment only.


### 17. [low] RIME's own comment credits the chill with a mass dependence it cannot have, and names the ordering backwards

**Where:** `src/enemies.js:864-871`

**Evidence:** src/enemies.js:864-866 reads `// RIME wears off on its own. The chill is a drag rather` / `// than a speed cap, so a heavy body coasts further out of it than a light` / `// one — which is the same physics everything else here obeys.` The code under it is src/enemies.js:867-871: `if (this.chill > 0) {` / `this.chill -= dt;` / `const k = CFG.rounds.rime.drag ** dt;` / `this.vx *= k;` / `this.vy *= k;` — a bare velocity multiplier. No `invMass`, no `mass`, no force term. Coasting distance under it is the integral of v0*exp(-lambda*t) with lambda = -ln(0.02) = 3.912/s, i.e. 0.2556*v0 for every body on the field. I re-measured rather than argued: three bodies chilled and held with `thrown` so `drive()` early-returns, each handed vy = -200, stepped 30 frames of g.update(1/60) — MOTE (mass 0.734) travelled 38.805 units, BULWARK (mass 32.805) 38.805, NEEDLE (mass 0.420) 38.805. Unchilled control, same setup: 87.629 for all three. Identical to three decimals across a 78x mass range. The comment's LAST clause is correct — src/physics.js:128-130 `const d = Math.exp(-P.linearDamping * dt);` / `b.vx *= d;` is the same mass-independent form — which is what makes the middle clause read as deliberate and land as false. The ordering it names is also inverted for bodies that steer: measured sustained kept-fraction (chilled pace / quiet pace, body pinned so the bearing is constant, mean over the last 2s of a 6s run) is BULWARK 0.318, GLUT 0.302, DRIFT 0.284 — the heavy, low-`accel` types are held HARDEST — against NEEDLE 0.488 and ION 0.43-0.51. The term that decides it is `accel`, through `const k = (this.accel / 100) * authority * slow;` at src/enemies.js:792 feeding src/enemies.js:794 `this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);`.

**Consequence:** None on screen — the chill works, it just does not work for the reason written beside it. The cost is to the next change: this is the paragraph a reader consults before touching RIME and it points at the one quantity that provably cannot affect it. Same shape as the orphaned COMPOUND header the project already deleted at src/upgrades.js:359-365 ("the comment said the opposite of what was true of the node it had come to sit above").

**Suggested fix:** Rewrite src/enemies.js:864-866. The drag is a pure per-second velocity multiplier and is mass-independent by construction; what varies between bodies is `accel`, because steering re-accelerates toward cruise every substep and the steady state is (accel/100)*cruise / (accel/100 + 3.912 + 0.55). If a mass dependence is actually wanted it has to be written as a force (`v -= vhat * F * invMass * dt`), not as a multiply.

**Hash:** No — comment only. Even a code change here would not move it: nothing writes `chill` in a fight that fires BOLT and PULSE, so the `if (this.chill > 0)` block never executes in the canonical 9000 frames.


### 18. [low] RIME does not chill "to a crawl": steering puts back a third to a half of the pace, and three surfaces quote a number measured on a body that was not steering

**Where:** `src/config.js:785, src/arsenal.js:187, README.md:343-344 against src/enemies.js:867-871 + src/enemies.js:794`

**Evidence:** Three surfaces make the same overstatement. src/config.js:785 `* RIME. Drags whatever it touches to a crawl for a few seconds. It kills`; src/arsenal.js:187 `dmg: '16', fx: 'Chills for 3.2s. What it touches barely moves.'`; README.md:343-344 `- **RIME** drags whatever it touches to a crawl for a few seconds — measured` / `taking a body from 200 units a second to about 13.` The 0.02 at src/config.js:793 `drag: 0.02, // velocity kept per second while chilled` is only what a COASTING body keeps. The chill runs once per frame in `Enemy.update` (src/enemies.js:867-871); steering runs separately from `physicsStep` (src/game.js:1549 `b.steer(w, dt);`) at CFG.fixedStep = 1/120, and re-accelerates the body every substep: src/enemies.js:794 `this.vx += (dx * cruise - this.vx) * clamp(k * dt, 0, 1);`. For any body below its own cruise, `flying` at src/enemies.js:790 clamps to 1 and `along` is +1, so `authority` is 1 and k = accel/100. Steady state is v* = k*cruise/(k + lambda + linearDamping) with lambda = 3.912 and linearDamping = 0.55 (src/config.js:1159), i.e. a kept fraction of (k+0.55)/(k+4.462). Measured, one RIME hit's worth (chill set to CFG.rounds.rime.chill) on a body already settled at its quiet pace, position pinned each frame so the bearing is constant and velocity untouched: NEEDLE 98.5 -> 50.8 u/s, reached inside 0.5s and flat until the chill expires at 3.2s (52% kept; model 0.496). MOTE 38.4 -> 15.5 (40%; model 0.385). BULWARK 8.7 -> 2.5 (29%; model 0.270). A nine-type sweep gives kept fractions from 0.28 (DRIFT) to 0.51 (ION). Two independent instruments — the closed form derived from the code, and the live run — agree to a few points on every row. The README's "200 units a second to about 13" is exactly the coasting case and nothing else: 200 * 0.02**0.7 = 12.9. NOTE on the reader's table: their MOTE row (74% kept) is wrong — it disagrees with their own model and with my measurement (38-40%); every other row of theirs holds.

**Consequence:** A chilled NEEDLE at 50.8 u/s is still faster than an unchilled MOTE (38.4) and about the pace of an unchilled LURCHER (53.5). The round genuinely buys time — roughly a doubling of crossing time while the chill is up, which is what "it buys the time for everything else to" promises — but a player who reads "barely moves" and fires it at the fast light bodies gets a halving, and gets the best result (29%) on the slow heavy ones that were never the problem. `drag: 0.02` reads as a 98% removal that never happens to anything that steers.

**Suggested fix:** Correct the three sentences, and only those. Say the chill roughly halves-to-quarters a body's pace while it is up, that the bite depends on the body's own `accel`, and re-take the README's measured figure on a steering body. Do NOT make the chill a term the steering answers to (the STASIS route at src/enemies.js:746 `const slow = world.stasis > 0 ? 0.12 : 1;`) on the strength of this finding — that would make `drag: 0.02` honest and would also be a large silent balance change to a round that currently works; it needs its own pass.

**Hash:** No — words only. Nothing writes `chill` in a fight that fires BOLT and PULSE, so neither the drag block nor any new chill term inside `drive` is reachable in the canonical 9000 frames, provided any such term stays gated on `if (this.chill > 0)` rather than being computed unconditionally.


### 19. [cosmetic] config.js states the SLUG exemption as "only what a SLUG threw"; the mark spreads on contact — and on ANY contact, not only damaging ones

**Where:** `src/config.js:770-771 against src/game.js:1590-1600`

**Evidence:** src/config.js:770-771: `* seconds. Everything else on the field still trades damage on impact;` / `* only what a SLUG threw is exempt.` The code is src/game.js:1590-1600 inside `grid.eachPair`: `if (a.slugged > 0 || b.slugged > 0) {` ... `const t = Math.max(a.slugged || 0, b.slugged || 0);` / `if (typeof a.slugged === 'number') a.slugged = t;` / `if (typeof b.slugged === 'number') b.slugged = t;` / `return;`. So anything that touches a marked body inherits the mark at its remaining time and is itself exempt from all collision damage in both directions until it runs out — not only what the SLUG threw. The propagation is deliberate and its reason is written at src/game.js:1591-1595; the sentence in config.js is the one that was never updated, and README.md:2213-2216 already describes the spread correctly, so config.js is the sole out-of-date surface. CORRECTION to the reader's version of this claim: they wrote that the spread happens "on every contact above `collisionThreshold`". It does not. The guard at src/game.js:1590 sits ABOVE `const dmg = impactDamage(a, b, impact);` at src/game.js:1601, and `collisionThreshold` is only consulted inside `impactDamage` (src/physics.js:265 `if (impact <= P.collisionThreshold) return 0;`). The only gate the spread passes is `if (impact <= 0) return;`, so a body drifting into a marked one at 5 u/s — a bump that could never have done damage — still inherits a full remaining exemption. The chain is still bounded: every member decays at dt per frame from the same value, so nothing can outlive 2.4s from the original hit.

**Consequence:** One SLUG into a crowd switches collision damage off across the whole touching component of that crowd for up to `calm` 2.4s, including impacts the SLUG had nothing to do with, and the entry price is any contact at all rather than a damaging one. Bounded and short, so the behaviour is defensible; the stated rule is what is wrong.

**Suggested fix:** Amend src/config.js:770-771 to say what src/game.js:1590-1600 does: the mark travels on contact at its remaining time, so what is exempt is the SLUG's chain and not only the body it hit, and it runs down rather than propagating for ever. Do not narrow the code to match the comment — the reason for the spread (a slugged BULWARK must not launch a MOTE at full damage) is sound and is written at the site.

**Hash:** No — comment only. Even a change to the propagation would not move it: SLUG is never fired in the canonical fight, so `slugged` is 0 on every body and the branch at src/game.js:1590 is never taken.


### 20. [cosmetic] config.js's SLUG rationale quotes SPINE at 20; SPINE has been 34 since build 218

**Where:** `src/config.js:774 against src/config.js:705`

**Evidence:** src/config.js:773-775: `* That left it paying a 2.4x rate penalty for a shove and nothing else, so` / `* it now hits hardest of anything per shot — 44, against SPINE's 20 and` / `* BOLT's 26 — while staying under BOLT on sustained damage.` src/config.js:705 is `damage: 34,` in the `spine` block, and its own header at src/config.js:700-709 spells out the move ("At 34 it is 82 a second on one body, just under BOLT"). BOLT is unchanged at src/config.js:1151 `damage: 26,`. So one of the three figures in that sentence is stale and the margin it argues from has narrowed from 24 to 10. ADJACENT AND LOWER CONFIDENCE, flagged rather than asserted: the same sentence's "hits hardest of anything per shot" is arguable against HE, which is src/config.js:598-599 `damage: 15,` plus `blast: { r: 96, damage: 44, impulse: 420 },` — a body at the burst centre takes `damage * (0.35 + falloff * 0.65)` (src/enemies.js:4546) which is the full 44 at falloff 1, on top of the 15, so 59 reaches the struck body per trigger pull. Whether "a hit" means the projectile alone is a reading call I cannot settle from the code, so I am not claiming it as a defect.

**Consequence:** None in play. It is the comment that justifies SLUG's damage number, so the next person tuning SLUG reads "SPINE's 20" as the floor it has to clear when the floor is now 34.

**Suggested fix:** Change "SPINE's 20" to "SPINE's 34" at src/config.js:774.

**Hash:** No — comment only.


### 21. [low] A SPORE patch's grain is drawn well inside the 92-unit circle it burns, and the header sentence describing the die-back is backwards

**Where:** `src/patch.js:237 (the die-back), :181-182 (the damage circle), :232-233 (the sentence), :84-85 / :91-92 / :240-242 (three claims that the rim band marks the boundary)`

**Evidence:** The damage circle never moves: patch.js:181-182 `const reach = rr + e.r;` / `if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > reach * reach) continue;`, with `rr = this.r` = 92 (config.js:815 `patch: { r: 92, life: 4.5, dps: 46, cap: 3 },`).

The picture does move: patch.js:237 `const reach = Math.min(1.14, 0.26 + left * 1.1);` and :239 `if (sp.d > reach) continue;`, with `left = Math.max(0, this.life / this.max)` (:206). Speck radii are patch.js:103 `const d = rim ? rand(0.88, 1) : Math.sqrt(rand(0, 1)) * 0.9;`.

Re-derived on the authored 4.5s life:
  reach >= 1.00 <=> left >= 0.74/1.1 = 0.67273 <=> t <= 1.473s — the FIRST 32.7% of life.
  reach <  0.88 <=> left < 0.62/1.1 = 0.56364 <=> t > 1.964s — so the entire rim band is gone for the last 2.54s, 56.4% of the patch's life.
  Full-alpha rim: `edge = Math.min(1, (reach - sp.d) * 8)` (:243), so a rim speck at the mean d = 0.94 needs reach >= 1.065, i.e. t <= 1.207s (26.8%). At reach = 1.00 that same speck is drawn at 0.48 of its alpha.
  At t = 3.0s (left = 1/3): reach = 0.6267, so the outermost drawn grain sits at 57.7 units against a burn circle of 92 — 1.60x in radius, 2.55x in area.
The sentence at :232-233 reads `used to do, at the cost of a second hard outline. Full extent until the` / `last third:` — full extent covers the FIRST third, not everything up to the last one.

CORRECTION to the reader's arithmetic, which overstated this: they compared 57.7 against 92 + 24 = 116 for a LURCHER (config.js:2672 `r: 24,`) and reported 2.01x / 4.05x. Folding the body's own radius in is not a drawing error — `rr + e.r` is ordinary overlap geometry and no effect draws a body's radius into its own footprint. The honest comparison is grain radius against the patch's own 92, i.e. 1.60x / 2.55x.

The haze does not stand in for the missing boundary. patch.js:224 `drawGlow(ctx, this.dark, this.x, this.y, R * 0.98, 0.44 * k * (0.4 + left * 0.6));` gives base alpha 0.264 at left = 1/3 (k = 1 there), and util.js:95-98 stops the sprite at `0.55 -> rgba(color, 0.12)` and `1 -> rgba(color, 0)`, so the composited alpha is 0.0254 at 0.627R and 0.0058 at 0.9R, of a tone already `mixHex(this.tone, '#0a1408', 0.42)` (patch.js:80). I did the gradient arithmetic; I did not render it.

What is NOT a defect: the die-back itself is authored on purpose as the timer (patch.js:229-231, "They die back from the rim inward ... so the area visibly closes rather than dimming in place"). The defect is that the file states three separate times that the rim band is the boundary marker — :84-85 "it is the only thing telling the player where the damage stops now that there is no outline", :91-92 "the boundary is the one thing about this effect the player has to be able to find: everything standing inside it is being hurt", :240-242 "the rim band -- the only thing marking where the damage stops" — while the die-back removes it for 56% of the life and the boundary it marks has not moved at all.

**Consequence:** Player-visible: from about two seconds in, a SPORE patch left alone has no drawn edge and burns bodies standing outside its visible grain — 1.6x further out in radius by t=3s. Worst in the case the round is designed for, a patch placed ahead of something and left to burn its full 4.5s; masked under sustained fire, where the cap at shooter.js:730 retires patches at about 1.7s old.

**Suggested fix:** Exempt the rim band from the die-back so the boundary survives and only the interior grain thins: tag the rim specks at patch.js:96-110 and make :239 `if (!sp.rim && sp.d > reach) continue;`. Alternatively move the floor and the slope so full extent really does cover the first two thirds — `Math.min(1.14, 0.6 + left * 0.72)` holds reach >= 1 to left = 0.556 and never falls below 0.6. Either way, correct "Full extent until the last third" at patch.js:232-233.

**Hash:** No — draw-only, and no Patch is constructed in the canonical BOLT+PULSE ORDINAL run (`new Patch` has exactly two callers, shooter.js:641 and mines.js:621).


### 22. [cosmetic] `retire()`'s `this.max = Math.max(this.max, this.life)` can never select its second argument, and the patch it is meant to soften collapses to a third of its size on one frame

**Where:** `src/patch.js:129, against :27, :128 and :157`

**Evidence:** patch.js:124-130:
  `retire() {`
  `  if (this.retired) return;`
  `  this.retired = true;`
  `  this.next = Infinity;`
  `  this.life = Math.min(this.life, RETIRE);`
  `  this.max = Math.max(this.max, this.life);`
  `}`
`this.max` is written once, at :27 `this.max = this.life;`, and nowhere else in the file or in either caller. `this.life` only ever decreases — :157 `this.life -= dt;` and the `Math.min` on the line immediately above. So `this.life > this.max` is unreachable and the `Math.max` always returns `this.max`: a dead statement wearing the shape of a guard.

What it costs, arithmetic on the SPORE cap under continuous fire (config.js:806 gives the interval as `0.286 * 2.0 = 0.572s`, cap 3, life 4.5): the fourth shot lands 1.716s after the first, and the first patch is retired. Immediately before: life 2.784, left 0.6187, reach = 0.26 + 0.6806 = 0.9406 (grain to 86.5 units), k = min(1, 1.716/0.25) * min(1, 2.784/0.8) = 1. Immediately after: life 0.35, left 0.35/4.5 = 0.0778, reach = 0.3456 (grain to 31.8 units), k = 0.4375. One frame: drawn radius -63%, haze alpha 0.339 -> 0.086.

CORRECTION to the reader, who claimed this "defeats the comment above it": it does not defeat all of it. The comment at :120-122 asks for the ground to be "seen going out", and the going-out is carried by `k = ... * Math.min(1, this.life / 0.8)` at :203, which runs 0.4375 -> 0 over the full 0.35s either way. What is lost is only the extent, which jumps once and then crawls 0.346 -> 0.26.

Also note, against the reader's proposed one-line fix: `this.max = this.life;` makes left = 1 at the retire instant, so reach jumps min(1.14, 1.36) = 1.14 — the extent pops OUTWARD from 0.9406 to full before closing. Smaller and in the better direction, but it is a pop, so check it on screen rather than assuming the line is free.

**Consequence:** Cosmetic: the oldest burning patch snaps to a third of its drawn size on the frame the fourth shot lands, which is the reading the retirement was written to prevent, plus a statement in the code that cannot do anything.

**Suggested fix:** `this.max = this.life;` at patch.js:129, so `left` runs 1 -> 0 across the 0.35s retirement and the extent closes with the alpha instead of jumping. Verify the outward pop at the retire instant on screen; if it reads badly, clamp `left` to what it was rather than resetting it.

**Hash:** No — draw-only state, and no SPORE patch exists in the canonical BOLT+PULSE run.


### 23. [low] A gripping SNARE holds a cap slot for up to 26.7s, against config's "none of them outlives its quarter minute"

**Where:** `src/mines.js:669 vs src/mines.js:679, src/config.js:1013-1015, src/config.js:1048, src/upgrades.js:461`

**Evidence:** The else-if chain in `updateMines` puts the hold ahead of the life: mines.js:669 `} else if (m.gripping) {` comes before mines.js:679 `} else if (m.life <= 0) {`, so `m.life` running out can never end a grip. `m.life -= dt` still runs (mines.js:617), it simply has no reader once `m.hold > 0`.

config.js:1013-1015: "`cap` and `life` are still a contract with the player rather than a balance dial: nothing may move either, so the most that can ever be standing is five and none of them outlives its quarter minute."

Arithmetic: `snap` sets `m.hold = S.hold * world.up.mineHold` (mines.js:316) off config.js:1048 `hold: 2.4, // seconds it keeps hold once it opens — was 3.6; see DEAD WEIGHT`. `mineHold` comes only from upgrades.js:461 `{ id: 'deadweight', name: 'DEAD WEIGHT', line: '+65% snare hold time.', apply: scale('mineHold', 1.65) ... }`, which carries no `levels`, so tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);` sells it three times: 1.65^3 = 4.4921, hold = 10.781s. Total field presence = flight 0.9 (config.js:1044) + life 15 + hold 10.781 = **26.68s**, every second of it counted by `laidCount` (mines.js:282-286, `if (!m.dead) n++`). Even at one level of DEAD WEIGHT it is 0.9 + 15 + 3.96 = 19.9s, so the contract is broken independently of how many levels the node has.

This is also what makes the two findings above reachable. upgrades.js:429-438 argues the cap is unreachable by laying — "At one level a throw lays two, two throws leave four, and the cap is still the backstop it was authored as" — and that arithmetic is right for mines that die at 15s (throws at 0 / 8.44 / 16.875s with QUICK LAY x2 and PAIRED CHARGE x1 give a steady state of 4). Snares that outlive their life break it: two laid at t=0 and still gripping at t=16.875 make 4 on the field before the throw, and the second of the two new mines hits `laidCount >= 5` and evicts.

**Consequence:** One of five cap slots is held for up to a quarter-minute past the life that config.js calls a contract; a player who bought DEAD WEIGHT is silently running a smaller effective cap. The knock-on is that the eviction path (findings 1 and 2) becomes reachable in ordinary play on a SNARE build, which the tree's own reasoning says it should not be.

**Suggested fix:** Decide which half is true and make it so. Either clamp the grip to the remaining life (`m.hold = Math.min(m.hold, m.life)` in `snap`, or test `m.life <= 0` before the gripping arm at 669 and end the hold with the release effects of 673-678), or amend config.js:1013-1015 to say `life` bounds the trigger and not the hold, and correct README.md:250/256 with it. Note the second option leaves the cap reachable by laying and so leaves findings 1 and 2 live.

**Hash:** no — no mine is laid in the canonical run


### 24. [low] A SNARE snaps on boss structure and strings wires to a body `drive` re-zeroes every frame

**Where:** `src/mines.js:700 (trigger guard), src/mines.js:318 (grip guard), src/mines.js:762 (draw guard), src/enemies.js:634`

**Evidence:** The trigger loop's guard is mines.js:700 `        if (e.dead || e.harmless || e.staged || e.spent) continue;` and the only `fixed` exemption below it is VOID's: mines.js:708 `          if (m.kind === 'void' && e.type.fixed) continue;`. Boss structure is pushed straight into `world.enemies` (boss.js:389, 409, 797, 1041, 1178, 1460, and the same in dynamo.js / amplitude.js) carrying config.js:3021 `fixed: true, // the boss places it; physics never moves it`, and it is not `harmless`. So mines.js:709 `if (m.kind === 'snare') snap(world, m);` fires on a boss panel.

`grip`'s guard is mines.js:318 `      if (e.dead || e.spent || e.fizzle) continue;` — no `fixed` — so it writes `e.vx`/`e.vy` onto the panel. enemies.js:634 `    if (this.type.fixed && !this.isDrop) { this.vx = 0; this.vy = 0; return; }` runs from `steer` (enemies.js:541) which `physicsStep` calls at game.js:1549 BEFORE `integrate` at 1554 — and `physicsStep` (game.js:1508) runs before `updateMines` (game.js:1518). So every velocity `grip` writes is zeroed on the next frame before anything integrates it.

The draw block repeats the same guard, mines.js:762 `        if (e.dead || e.spent || e.fizzle) continue;`, under a comment at 761-762 that states the invariant: "The same set `grip` takes, or the picture is drawing a hold the snare does not have."

Mines are laid throughout a fight: `mineCadence` is called at game.js:1515, outside the `if (w.boss) { ... } else { ... }` at game.js:1489-1502. SNARE's mouth is `m.r + S.trigger * up.mineTrigger` = 14 + 34 = 48 units unbought (config.js:1046-1047).

**Consequence:** During a boss fight a snare that lands near the frame opens on it and draws violet wires to a segment that visibly does not move — the picture asserting a hold the physics has already thrown away. The snap itself is not wasted (the grip still takes every non-fixed body and every drop in the 210-unit reach), so this is a picture-vs-physics disagreement rather than a lost mine.

**Suggested fix:** Add `|| e.type.fixed` to the snare's grip guard (mines.js:318) and to the matching draw guard (mines.js:762). Do NOT add it to the shared trigger guard at mines.js:700, which the reader proposed: that guard is shared by BLAST, SPALL and KNELL, whose damage on boss structure is legitimate and is the reason VOID needed its own line at 708. If the snap itself should not fire on structure alone, it wants a snare-specific test beside 708, not a change to 700.

**Hash:** no — the writes it removes are zeroed by `drive` before anything integrates them, and the canonical run lays no mine


### 25. [cosmetic] The snare's drawn wires walk world.enemies only; grip also hauls world.drops

**Where:** `src/mines.js:760-767 (draw), src/mines.js:330-331 (grip)`

**Evidence:** `grip` ends mines.js:330-331 `  take(world.enemies);` / `  take(world.drops);`, while the draw loop opens at mines.js:760 `      for (const e of world.enemies) {` and never touches `world.drops`. The guards match to the character (`if (e.dead || e.spent || e.fizzle) continue;` at 318 and 762) and the radius matches (`S.reach * S.reach`, 306 and 763) — only the list does not. The comment immediately above the draw loop, mines.js:761-762, states the invariant it breaks: "The same set `grip` takes, or the picture is drawing a hold the snare does not have."

**Consequence:** Energy motes inside the 210-unit reach are dragged into the knot with no wire drawn to them. Small, and in the safe direction — a hold that exists and is not drawn rather than the reverse — but it is the stated invariant, and it is the only place in the file where the two lists disagree (`cut`, mines.js:355-356, takes both).

**Suggested fix:** Iterate both lists in the draw block, or hoist the pair into one array walked by both. If the omission is deliberate (a dozen wires to motes would be clutter), say so in the comment at 761-762 instead of claiming the sets are identical.

**Hash:** no — draw only


### 26. [cosmetic] LAY_TONE covers four of eight kinds, and the four that fall through get BLAST's own chime

**Where:** `src/mines.js:242, src/mines.js:273, src/mines.js:38`

**Evidence:** mines.js:242 `const LAY_TONE = { blast: 300, snare: 240, wire: 380, knell: 200 };` and mines.js:273 `  audio.chime(LAY_TONE[kind] || 300);` against mines.js:38 `const KIND = { blast: M, snare: S, wire: W, knell: K, thorn: T, lode: L, spall: P, void: V };`. THORN, LODE, SPALL and VOID all take the `|| 300` fallback, and 300 is BLAST's own entry — so half the rack has no lay tone of its own and four kinds are indistinguishable by ear from BLAST at the moment of the throw. `audio.chime` (audio.js:336-340) is a pure two-partial sine on `f`, so the frequency is the entire distinction.

**Consequence:** With one clock for all eight kinds (mines.js:1074-1079) and the kind switched from the strip, the throw sound is the only per-kind cue at lay time, and it is wrong for four of eight. No mechanical effect.

**Suggested fix:** Four more entries in the table at 242, and pick a fallback that is not another kind's value. The stale module header at mines.js:1 ("Auto-laid mines, in four kinds", documenting only those four) and `laidCount`'s stacked stale docstrings at mines.js:276-281 ("How many of one kind are on the field" / "Nothing expires now" / "switch round the four") belong in the same pass.

**Hash:** no


### 27. [cosmetic] snap()'s `m.settle = 0` is a write nothing can read

**Where:** `src/mines.js:317`

**Evidence:** mines.js:316-317 `  m.hold = S.hold * world.up.mineHold;` / `  m.settle = 0;`. `S.hold` is 2.4 (config.js:1048) and `up.mineHold` is >= 1, so `m.gripping` (mines.js:222-224, `return this.hold > 0;`) is true from the instant `snap` returns.

Every reader of `m.settle` is then unreachable for that mine: `armed` (mines.js:218) requires `this.hold <= 0`; the thorn/lode/knell/wire arms are gated on kind; `cutting` is wire-only; and `retire`'s `m.settle < m.cfg.arm` test (mines.js:379) reaches the same `m.dead = true` outcome as the fall-through at 384 for a gripping snare, so it cannot be distinguished either. On the frame `m.hold` reaches 0 the mine sets `m.dead = true` in the same branch (mines.js:673-674) and is spliced out at 718, so `armed` never comes back.

**Consequence:** None. Listed because a write with no reachable reader is the `world.endless` shape CLAUDE.md flags, and the next reader of `snap` will assume the reset means something.

**Suggested fix:** Delete line 317, or annotate it as deliberate belt-and-braces. Line 564 (`m.open += ((m.gripping ? 1 : 0) - m.open) * clamp(dt * 7, 0, 1);`) is NOT dead and should be left alone — the zero arm is shared with the seven non-snare kinds, for which `gripping` is always false.

**Hash:** no


### 28. [cosmetic] MINE (missed by the reader): the README's mines section contradicts config in six independent places, including its own two-line-apart kind count

**Where:** `README.md:212, 219-222, 230-233, 249, 251, 252, 264-265`

**Evidence:** The reader named two of these; there are six, and three are numeric.
- README.md:212 "**Four kinds, one laid at a time**" against README.md:224 "One clock for all eight kinds" twelve lines later, and mines.js:38's eight-entry `KIND`.
- README.md:219-222 "**Three numbers govern every kind, and no upgrade may move any of them.** ... five on the field · fifteen seconds each · one thrown every fifteen" against config.js:1017 "`throwEvery` was the third of those until build 214 and is a dial now" (QUICK LAY, upgrades.js:451-453, two levels of x0.75 -> 8.44s).
- README.md:230-231 "a **SEED** offer, which lays three at once" — no such thing exists. `throwMine` has exactly two callers, `mineCadence` (mines.js:1086) and `debugThrowMine` (game.js:2756). The same ghost is cited as the justification for the eviction loop at mines.js:247-248.
- README.md:232-233 "5 with two [PAIRED CHARGE]" against upgrades.js:440 `levels: 1`.
- README.md:249 `| BLAST damage | 140 | 95 | SHRAPNEL | 138 |` against config.js:1034 `blast: { r: 168, damage: 105, impulse: 760 }` — the base is 105, not 95, and SHRAPNEL has no `levels` so the ladder is 1.45^3 = 3.048, i.e. 320, not 138. README.md:251 `| WIRE damage/s | 105 | 72 | HOT WIRE | 108 |` against config.js:1065 `damage: 79` and HOT WIRE at three levels (1.5^3 = 3.375 -> 267). README.md:252 `| KNELL tolls | 3 | 2 | FOURTH BELL | 3 |` against config.js:1077 `tolls: 2, // was 3; FOURTH BELL buys the third back and a fourth beyond it` plus upgrades.js:471 `levels: 2` -> 4.
- README.md:264-265 WIRE "nothing uses it up and it does not expire: it is a lane closed for good" against mines.js:659 `      if (m.life <= 0) fizzle(world, m);`, and mines.js:657's own comment "it runs out its life".

The in-game copy is correct where the README is not: arsenal.js:105 `dmg: '105'`, arsenal.js:110 `fx: 'Pins a whole crowd where it stands, for 2.4s.'`, arsenal.js:114 `dmg: '79/s'`, arsenal.js:118 `dmg: '81, twice'` — and arsenal.js:99-100 says regress.mjs checks that table against `CFG`. The README has no such check.

**Consequence:** None in the game — the player-facing arsenal cards are right. It matters because the README is where the next reader goes for the mine doctrine, and it is currently the source for two wrong numbers (95, 72) and one non-existent feature (the SEED offer) that has already been copied into a code comment at mines.js:247-248.

**Suggested fix:** One pass over README.md:210-266 against `CFG.mines` / `CFG.snare` / `CFG.wire` / `CFG.knell` and the FIELD block of upgrades.js, and delete the SEED-offer sentence from both README.md:230 and mines.js:247-248 (the eviction loop is still needed — PAIRED CHARGE lays two per throw — it just needs the true reason).

**Hash:** no


### 29. [medium] WIRE's cut is applied once per FRAME, so applyDamage's `Math.max(1, …)` floor makes its damage frame-rate-dependent and partly armour-blind (claim 2, confirmed with one correction)

**Where:** `src/mines.js:552, src/enemies.js:1160, src/game.js:1518, src/game.js:1661`

**Evidence:** src/mines.js:552 — `      e.applyDamage(world, W.damage * world.up.wireDamage * dt, nx, ny, W.shove * dt);` — inside `cut(world, m, dt)`, which is called once per frame from `updateMines` (src/mines.js:658 `      if (m.cutting) cut(world, m, dt);`). src/enemies.js:1160 — `    const real = Math.max(1, dmg * (1 - plate) * (1 - ward));`.

The dt is the raw frame delta, not a fixed step. src/main.js:51 `  const dt = (now - last) / 1000;` -> src/game.js:1421 `    const real = Math.min(dtRaw, CFG.maxFrameDelta);` (config.js:100 `  maxFrameDelta: 0.1,`) -> src/game.js:1518 `    updateMines(w, dt);`. The game HAS a fixed step — config.js:98 `  fixedStep: 1 / 120,` — and src/game.js:1507-1511 runs `physicsStep(CFG.fixedStep)` on it; `updateMines` is outside that accumulator.

Arithmetic, CFG.wire.damage = 79 (config.js:1065 `    damage: 79, // per second of contact, per body — was 105; see HOT WIRE`), wireDamage = 1:
- 60 Hz: dmg/frame = 79/60 = 1.31667. Unarmoured real = 1.31667 -> 79.0/s, correct.
- The floor binds whenever 1.31667*(1-plate) < 1, i.e. plate > 0.2405. In the current roster that is BULWARK (config.js:2738 `    armor: 0.34, // flat damage reduction`) -> 1.31667*0.66 = 0.869 -> floored to 1 -> 60/s against a rated 52.14/s (+15.1%); and boss patrol structure (config.js:2219 `    armorPatrol: 0.55,`) -> 0.5925 -> 1 -> 60/s against 35.55/s (+68.8%). Every other armour value in the roster (0.08-0.20) is below the binding point, so 60 Hz is otherwise honest.
- 120 Hz (ProMotion, the branch's own target device): 79/120 = 0.65833 -> floored to 1 on EVERY body -> 120/s against a rated 79/s, +51.9%, with armour ignored entirely. One level of HOT WIRE does not lift it off the floor either: 79*1.5/120 = 0.9875.

CORRECTION to the claim as filed: 'WIRE is the one continuous damage source that never got the tick' is false. src/game.js:1661 — `        if (!e.dead) e.applyDamage(w, up.casing * dt);` — SPINES/HARD CASING is also per-frame (70 a level, three levels in the tree, verified by importing tree.js). At 60 Hz one level gives 70/60 = 1.1667/frame, which floors against BULWARK (0.77 -> 1 -> 60/s against a rated 46.2/s) and against everything at 120 Hz. So the pattern has two instances, not one. The claim's own arithmetic for WIRE is otherwise correct to the digit and I reproduced all of it. patch.js is the only continuous source that ticks (patch.js:31 `    this.tick = opts.tick ?? 0.25;`) and its docstring at patch.js:118-124 states this exact floor as the reason.

**Consequence:** The arsenal chip says `79/s` (src/arsenal.js:114 `    dmg: '79/s', fx: 'A line across the field. It cuts what crosses.',`) and a regress case pins that string against CFG. The wire delivers 79/s only on a 60 Hz display against a body with armour <= 0.24. On a 120 Hz phone it delivers at least 120/s against everything and armour stops mattering; on a 60 Hz phone a BULWARK takes 15% more than rated and a boss's armoured structure 69% more. The rated number is right for one refresh rate and one half of the roster.

**Suggested fix:** Give `cut` the tick Patch already has: accumulate `m.cutT += dt` on the mine and apply `W.damage * world.up.wireDamage * TICK` once every TICK (0.25s to match Patch), leaving the shove per-frame or moving it with the bite (see the next finding — it wants the same tick). Do NOT fix it by touching `Math.max(1, …)` in applyDamage: that line is on every damage path in the game. Fix SPINES the same way at game.js:1661, or accept it as a separate item.

**Hash:** No, if the fix is confined to `cut` in mines.js — `world.mine` is null by default (game.js:195 `      mine: null, // the one kind of mine being laid, or none`) and scripts/fight.mjs contains no reference to mine, wire or knell, so no mine is laid in the canonical ORDINAL run. YES if fixed by changing applyDamage's floor or its fade, which are on every damage path; that route re-baselines ORDINAL and should not be taken.


### 30. [medium] MINE — WIRE is the only per-frame IMPULSE in the game, and the repeated-shove fade eats 83% of it, makes it frame-rate-dependent, and then pins every later shove on that body for ~20 seconds

**Where:** `src/mines.js:552, src/enemies.js:1186-1187, src/enemies.js:1029, src/config.js:1066`

**Evidence:** This is mine, not the reader's; it is the second half of the same line the reader's claim 2 is about.

The impulse: src/mines.js:552 `      e.applyDamage(world, W.damage * world.up.wireDamage * dt, nx, ny, W.shove * dt);` — `W.shove * dt`, applied every frame. src/config.js:1066 — `    shove: 150, // pushed off the line rather than held on it`. The function header at src/mines.js:485-489 states the intent in as many words: 'Everything touching the line is cut for as long as it stays on it, and shoved off the way it was leaning — so a body crossing takes a slice rather than being parked in the beam and ground to nothing.'

The fade: src/enemies.js:1186 `      const fade = throwOff ? 1 : 1 / (1 + (this.kicked || 0));` and :1187 `      if (!throwOff) this.kicked = (this.kicked || 0) + fade;`, bleeding off at src/enemies.js:1029 `    if (this.kicked > 0) this.kicked = Math.max(0, this.kicked - dt / CFG.physics.kickFade);` with config.js:1222 `    kickFade: 1.5,`. The wire passes no `throwOff`, so it pays the fade. Frame order is decay-then-apply: `e.update` (which calls shoveFade) is game.js:1465, `updateMines` is game.js:1518.

Simulated exactly that loop (decay dt/1.5, then fade = 1/(1+k), k += fade, v += 150*dt*invMass*fade), one second of unbroken contact, Δv per unit invMass:
  30 Hz -> k = 6.53, Δv = 35.88
  60 Hz -> k = 9.69, Δv = 25.86
  120 Hz -> k = 14.18, Δv = 18.56
against 150 for the same total impulse delivered in one clean application. So at 60 Hz the wire delivers 17.2% of its nominal shove, and the delivered shove is 1.93x larger on a 30 Hz display than on a 120 Hz one — the shove runs the OPPOSITE way from the damage, which the same frame rate inflates. Two seconds: 60 Hz gives 37.68 against 300 nominal, 12.6%. A tick of 0.25s on the same total gives 74.9 in one second — 2.9x what the per-frame form delivers.

The lingering half: `kicked` reaches 9.69 after one second on the wire and 13.75 after two, and bleeds at 1/1.5 = 0.667 per second — so it takes 14.5s to return to zero from one second of contact and 20.6s from two. Every non-`throwOff` shove on that body in that window is scaled by 1/(1+k): rounds' knockback, and every mine blast, since detonate/toll/fizzle call `applyBlast` with no `throwOff` and enemies.js:4546-4547 passes `!!blast.throwOff`. A KNELL toll landing on a body two seconds off a wire lands at 1/14.75 = 6.8% of its 430 impulse. This is precisely the fault the header at enemies.js:1165-1178 records for PULSE ('Under ordinary fire `kicked` settles at 4.25, the fade is 0.19') — and 9.69-13.75 is two to three times worse than the 'ordinary fire' figure that header calls the problem.

WIRE is the ONLY per-frame impulse in the game. I checked every applyDamage caller: patch.js:186 `      e.applyDamage(world, bite, 0, 0, 0);` and game.js:1661 pass impulse 0; abilities.js:567 is gated by `P.recut`, :593 by `P.arc.every`, :708 and :996 are one-shot events; shooter.js:185 and enemies.js:4546 are blasts.

**Consequence:** A body on the wire is not 'pushed off the line' — at 60 Hz a mid-weight body (density 1.5, r 20 -> massOf = 1.5*400*0.006 = 3.6, invMass 0.278) gains 7.2 u/s over a full second of contact where the config's 150 would give 41.7. It is 'parked in the beam', which is the outcome the function's own header says the shove exists to prevent. And the wire then quietly disarms the knockback on that body — including the mine blasts a mine loadout is built around — for up to twenty seconds after it has left the line, on a mechanism the player has no way to see.

**Suggested fix:** Apply the shove on the same tick as the damage: one bite of `W.shove * TICK` every TICK inside `cut`, so `kicked` climbs at 4/s instead of at the refresh rate. That fixes the frame-rate dependence, restores the shove to roughly half its nominal, and stops a wire from pinning a body's `kicked` at three times what sustained gunfire produces. Do not fix it by exempting the wire with `throwOff` — that also lifts the speed ceiling, which is the build-110 failure CLAUDE.md and enemies.js:1188-1197 both record for SLUG.

**Hash:** No, if confined to `cut` in mines.js — no mine is laid in the canonical ORDINAL run (world.mine defaults to null, game.js:195; scripts/fight.mjs never sets it). YES if fixed by changing `shoveFade`, `kickFade` or the `fade` expression in applyDamage, which are on every impulse in the game.


### 31. [low] KNELL's toll COUNT is snapshotted at construction but its toll INDEX is read live, so buying FOURTH BELL with a knell on the field skips that knell's first, tightest, hardest ring (claim 1, confirmed — at low, not medium)

**Where:** `src/mines.js:205 and src/mines.js:564`

**Evidence:** src/mines.js:205 — `    this.tolls = kind === 'knell' ? K.tolls + world0.up.mineTolls : 0;` (constructed from `new Mine(kind, s.x, s.y - 20, site.x, site.y, world)`, mines.js:265). src/mines.js:564 — `  const i = (K.tolls + world.up.mineTolls) - m.tolls;`. One is a snapshot, the other a live read, and `i` is their difference, so any increase in `up.mineTolls` after the mine is built shifts every remaining toll's index up by that increase.

The window is real: src/game.js:725 `    def.apply(w.up, w);` mutates `w.up` in place the instant a node is bought, and FOURTH BELL is `{ id: 'fourthbell', name: 'FOURTH BELL', levels: 2, line: '+1 toll on every knell.', apply: bump('mineTolls', 1) …}` (upgrades.js:471; I confirmed the TREE's number is 2 by importing tree.js, not the node's line). The menu freezes the world (game.js:1408 `    if (this.paused) {`) but mines are not touched while it is up, so the knell resumes with the new count. A knell is alive for flight 0.9 + arm 0.8 + gap 1.15 = 2.85s per throw (config.js:1073-1078), against a throw every 8.44s fully bought — roughly a fifth to a third of the time.

Arithmetic with K.tolls = 2, grow = 0.5, fade = 0.72, blast = { r: 118, damage: 81 }, mineBlast = mineDamage = 1:
- Untouched: i = 0 -> r 118, damage 81; i = 1 -> r 177, damage 58.32. Centre total 139.32.
- Buy one level with the knell already down (m.tolls = 2, up.mineTolls = 1): toll 1 gets i = 3-2 = 1 -> r 177, damage 58.32; toll 2 gets i = 3-1 = 2 -> r 236, damage 41.99; m.tolls hits 0 and mines.js:584 `  if (m.tolls <= 0) m.dead = true;` kills it. Total 100.31 — 28.0% less, delivered as a 177-unit ring where a 118-unit one was owed.
- Buy both levels: i = 2 then 3 -> 41.99 + 30.24 = 72.23, 48.2% less.
Direction is one-way: `bump` only increases, so the error always makes the knell weaker and wider, never the reverse.

src/mines.js:382 `  if (m.kind === 'knell') { while (!m.dead && m.tolls > 0) toll(world, m); return; }` reads the same live expression, so `retire` inherits it. (It still terminates — `m.tolls` decrements every call.)

I am recording this at LOW rather than the claim's MEDIUM: the trigger is a single purchase landing inside a 2.85s window, at most twice a run, and the damage is a one-off. The logic error is real and the numbers are exact; the exposure is not medium-sized.

**Consequence:** Buy FOURTH BELL while a knell is on the field and that knell loses its first ring: 100.3 centre damage instead of 139.3, drawn 50% wider than it should be. The upgrade you have just paid for makes the mine you are watching weaker. The countdown marks drawn at mines.js:869-874 (`for (let k = 0; k < m.tolls; k++)`) still show the right COUNT, so nothing on screen contradicts it.

**Suggested fix:** Snapshot once. In the constructor add `this.tollsMax = K.tolls + world0.up.mineTolls;` beside line 205, and make line 564 `  const i = m.tollsMax - m.tolls;`. That fixes `retire`'s loop at the same time, and leaves a mid-knell purchase adding its ring at the END of the sequence, which is what '+1 toll on every knell' says.

**Hash:** No — no mine is laid in the canonical ORDINAL run (world.mine is null by default, game.js:195; scripts/fight.mjs contains no reference to mine/wire/knell), and the change touches nothing outside `Mine`/`toll`.


### 32. [low] `retire()` gives four of the eight kinds nothing at all — against its own docstring, and it costs SALTED its blast on every one of them

**Where:** `src/mines.js:374-384`

**Evidence:** This is the one half of the reader's claim 5 that survives; the headline does not (see refuted).

src/mines.js:374 — the docstring: ` * one needed its place. It goes off the way its kind goes off, so being pushed` / 'off the field is not the same as being wasted.' The function:
```
function retire(world, m) {
  if (m.dead) return;
  if (!m.landed || m.settle < m.cfg.arm) { m.dead = true; return; }
  if (m.kind === 'blast') { detonate(world, m); return; }
  if (m.kind === 'spall') { spall(world, m); return; }
  if (m.kind === 'knell') { while (!m.dead && m.tolls > 0) toll(world, m); return; }
  if (m.kind === 'snare' && !m.gripping) { snap(world, m); return; }
  m.dead = true;
}
```
WIRE, THORN, LODE and VOID fall through to the bare `m.dead = true`. Every one of those four ends its ordinary life through `fizzle` — mines.js:645 (thorn), :655 (lode), :659 (wire), :679 (the generic arm void uses) — and `fizzle` is the ONLY door SALTED's blast comes through (mines.js:390-405, `if (world.up.mineFizzle) { applyBlast(…f.damage * world.up.mineDamage…) }`). SALTED's row is `{ id: 'salted', name: 'SALTED', line: 'A spent mine goes off instead of fizzling.', levels: 1, apply: set('mineFizzle', true) }` (upgrades.js:459). So an evicted WIRE/THORN/LODE/VOID silently pays the player nothing for a node they bought, and `tally` (mines.js:141-143) counts SALTED toward all four kinds' grade — the mine is drawn heavier for an upgrade that, on this path, does nothing.

Reachability, which the claim denied: the eviction loop is `while (laidCount(world) >= M.cap)` (mines.js:250-254) with `cap: 5`. The claim's occupancy model — `flight + M.life` — is wrong for SNARE, and SNARE is the exception that makes the cap reachable. In `updateMines` the arm `} else if (m.gripping) {` (mines.js:670) sits ABOVE `} else if (m.life <= 0) {` (mines.js:679), while `m.life -= dt` (mines.js:615) runs unconditionally — so a gripping snare skips the life check entirely and lives flight + grip-time + hold. `m.hold = S.hold * world.up.mineHold` (mines.js:315) with `hold: 2.4` (config.js:1047) and DEAD WEIGHT at the tree's THREE levels (verified by importing tree.js; upgrades.js:461 has no `levels`) is 2.4 * 1.65^3 = 10.78s. A snare that grips at settle 10s dies at settle 20.8, i.e. 21.7s on the field, against the 16.875s that three throws span at the fully-bought cadence (15 * 0.75^2 = 8.4375s) and two mines a throw. Three throws x 2 = 6 >= 5. Even at base hold the ceiling is 0.9 + 15 + 2.4 = 18.3s, still past 16.875s. Derived from the update order rather than measured in a live run, so treat the exact frequency as unverified — but the loop is not dead code.

**Consequence:** With SALTED owned, evicting a WIRE, THORN, LODE or VOID gives no blast, no ring, not even the six grey sparks the un-SALTED `fizzle` draws (mines.js:404) — the mine simply vanishes mid-field. That is 'wasted', which the docstring says explicitly must not happen.

**Suggested fix:** Give the fallthrough `fizzle(world, m);` instead of `m.dead = true;` — `fizzle` guards on `m.dead` at its first line (mines.js:396) so it cannot double-fire, and it is already what those four kinds do at end of life. Fix the SEED comment above the loop at the same time (see the cosmetic finding).

**Hash:** No — mines.js only, and no mine is laid in the canonical ORDINAL run.


### 33. [cosmetic] A body standing on the WIRE is pinned at full hit-flash and drawn as a near-white disc (claim 6, confirmed at cosmetic, and it is not WIRE's alone)

**Where:** `src/mines.js:552, src/enemies.js:1162, src/enemies.js:829, src/enemies.js:1420, src/enemies.js:1589`

**Evidence:** Every applyDamage call adds src/enemies.js:1162 `    this.flash = Math.min(1, this.flash + 0.5 + real / 260);` and the only decay is src/enemies.js:829 `    this.flash = Math.max(0, this.flash - dt * 4.5);`, run once per frame from `Enemy.update` (game.js:1465), i.e. -0.075 a frame at 60 Hz. The wire adds +0.5 + 1.31667/260 = +0.50506 every frame. Stepping it: frame 1 -> 0.50506, frame 2 -> 0.43006 + 0.50506 = 0.93512, frame 3 -> 0.86012 + 0.50506 -> clamped to 1, and it never leaves 1 while contact holds (the increment is 6.7x the decay).

Drawn at src/enemies.js:1420 `      drawGlow(ctx, t.glow, 0, 0, this.r * 2.1, 0.24 + this.flash * 0.5);` — alpha 0.74 against a resting 0.24, 3.08x — plus src/enemies.js:1589 `      ctx.globalAlpha = was * clamp(this.flash, 0, 1) * 0.7;` filling a white disc of radius `this.r * 0.92` under `globalCompositeOperation = 'lighter'` (enemies.js:1588, :1592-1594).

Patch does not have this because it bites four times a second (patch.js:31 `    this.tick = opts.tick ?? 0.25;`), leaving 0.25*4.5 = 1.125 of decay between bites — more than enough to clear the flash.

CORRECTION to the claim: this is not WIRE-only. SPINES/HARD CASING (game.js:1661, 70 a level x3 levels) adds +0.5045 a frame the same way, so a body held on the turret with SPINES bought is pinned white too. Same root cause, same fix.

**Consequence:** Anything held on the wire washes out to a solid white disc under an inflated halo, so its type outline and its health dimming (`const dim = 0.45 + hpFrac * 0.55;`, enemies.js:1424) are unreadable for exactly as long as it is being cut. Cosmetic only — no damage, targeting or economy consequence.

**Suggested fix:** Falls out of the 0.25s tick proposed for the damage: one bite every quarter second lets `flash` decay 1.125 between bites and the body reads normally, with a visible pulse per bite instead of a constant blank. No change to the flash system itself.

**Hash:** No.


### 34. [cosmetic] Two files still say the mine cap binds, against the arithmetic the node that changed it wrote down; and `throwMine`'s ceiling comment names a caller that does not exist

**Where:** `src/config.js:1024, src/mines.js:886-887, src/mines.js:247-248`

**Evidence:** This is the part of the reader's claim 5 that holds, with its headline removed.

src/config.js:1024 — `     * on top the cap is what you actually run into.` (the sentence runs from :1022, 'At 8.4s it is a steady 1.8, and with PAIRED CHARGE / on top the cap is what you actually run into.')
src/mines.js:886-887 — `       * It does not breathe any more either. Five mines is the ordinary` / `       * steady state once QUICK LAY and PAIRED CHARGE are owned…` — and this one is load-bearing for a drawing decision: it is the stated reason the trigger ring stopped pulsing.

Both were written when PAIRED CHARGE was uncapped. Build 220 capped it and wrote the correct arithmetic in its own docstring, src/upgrades.js:437 — `     * At one level a throw lays two, two throws leave four, and the cap is` / 'still the backstop it was authored as.' I re-derived it: cadence 15 * 0.75^2 = 8.4375s (upgrades.js:451-453, QUICK LAY 2 levels), occupancy flight + life = 15.85-15.95s, so two throws overlap and never three; 2 throws x 2 mines = 4. `paired` is 1 level in the tree (verified by import). So the ordinary steady state is 4, not 5.

Separately, src/mines.js:247-248 — `  // The ceiling is enforced here rather than at the clock, because a SEED` / `  // offer lays three at once and does not go through the clock at all.` There is no SEED offer. `throwMine` has exactly two callers — `mineCadence` (mines.js:1086) and `Game.debugThrowMine` (game.js:2756) — and grepping SEED across src/ finds only the enemy type (config.js:2839, codex.js:205) and its graft behaviour. The stated reason for where the ceiling lives is a mechanism that does not exist.

**Consequence:** None at runtime. Three comments in three files disagree about a number a reader will use to reason about the field, and one of them is offered as the justification for a drawing choice. Two audits in a row have now reached for the cap and got a different answer depending on which comment they read.

**Suggested fix:** Correct config.js:1022-1024 and mines.js:886-887 to four (and, if the trigger ring's no-pulse decision was argued from five, restate it on four — four dashed circles is still the argument). Replace the SEED sentence with what is actually true: the ceiling is enforced in `throwMine` because PAIRED CHARGE lays more than one per tick.

**Hash:** No — comments only.


### 35. [low] SALTED's blast is scaled by DEEP CHARGE and SHRAPNEL on every kind, but the collar credits neither to the kinds that only get a blast through SALTED

**Where:** `src/mines.js:123 and :135 (the `bang`/`hurts` tests in `tally`), against src/mines.js:397-402 (`fizzle`'s blast) — reached by THORN at :639 and LODE at :655`

**Evidence:** `tally` decides which of the shared six a kind may count:

  123:   const bang = kind === 'blast' || kind === 'knell' || kind === 'spall'; // DEEP CHARGE
  135:   const hurts = bang || kind === 'thorn';                               // SHRAPNEL
  146:   if (bang) { of++; if (up.mineBlast > 1) has++; }
  147:   if (hurts) { of++; if (up.mineDamage > 1) has++; }

but SALTED is credited to every kind unconditionally eight lines above, with a comment saying why:

  141:   // SALTED gives a spent mine a blast, so it reaches even the kinds that have
  142:   // none of their own -- it is the one that gives a LODE something to do.
  143:   of++;
  144:   if (up.mineFizzle) has++;

and that blast is scaled by BOTH excluded nodes:

  400:       x: m.x, y: m.y, r: f.r * world.up.mineBlast,
  401:       damage: f.damage * world.up.mineDamage, impulse: f.impulse,

Neither node carries `levels` (upgrades.js:454 deepcharge, :460 shrapnel), so `tree.js:205`'s `u.levels ?? 3` sells three of each: 1.35^3 = 2.460 on radius, 1.45^3 = 3.049 on damage. Measured on the current files (stub world, real `mineGrade`/`mineMarks`, `CFG.mines.fizzle` = { r: 96, damage: 48 }):

  LODE, four of four (PAIRED + QUICK LAY + SALTED + REPULSOR)
      marks 4  grade 1.00  | its only blast: r 96.0   damage 48.0
  ...plus DEEP CHARGE x3 + SHRAPNEL x3
      marks 4  grade 1.00  | its only blast: r 236.2  damage 146.3

So a LODE already reads "fully bought" — 4 of 4, grade 1.00, `mineScale` 1.26, the largest it can be drawn — while two further owned nodes are quietly tripling the only damage it ever does. Same shape, smaller, for WIRE, SNARE and VOID (both nodes) and for THORN (DEEP CHARGE only: `hurts` now includes thorn, `bang` does not, and a SALTED THORN's fizzle radius still goes 96 -> 236.2).

This is the mirror of the fault the function's own header says it exists to prevent (mines.js:118-121, "A mine that grew because of something it cannot use is the readout lying about the machine") and of the docstring's promise that the reading is "of what the mine can actually DO" (mines.js:90-92). NOTE: the audited reader's version of this claim named THORN and SHRAPNEL, which is stale — build 220 part seven added `|| kind === 'thorn'` to :135 and put `up.mineDamage` on the patch at :632. Only the SALTED-conditional half survives, and it is readout-only: no damage or radius changes either way. I am flagging that it is arguable whether this is worth fixing — the exclusion may be a deliberate refusal to make the denominator depend on another purchase.

**Consequence:** Player-visible but cosmetic: with SALTED owned, the collar and the drawn size of a LODE, WIRE, SNARE or VOID (and a THORN's, for DEEP CHARGE) stop moving while two more upgrades go on scaling what the mine does when it expires. A bought-out LODE reads 4 of 4 at 96/48 and at 236/146 alike.

**Suggested fix:** Make the two tests depend on SALTED as well, in src/mines.js:123 and :135: `const bang = kind === 'blast' || kind === 'knell' || kind === 'spall' || !!up.mineFizzle;` and `const hurts = bang || kind === 'thorn';`. Grades do not regress when SALTED is bought (a LODE on 2 of 4 goes to 3 of 6, both 0.5) and the collar follows automatically because `drawMines:855` already reads `mineMarks`. If instead the exclusion is deliberate, say so in the comment at :141-142, which currently argues the opposite.

**Hash:** No. `w.mine` is null on a fresh world (game.js:195, :487) and `mineCadence` returns the timer untouched when it is falsy (mines.js:1082), so the canonical ORDINAL run lays no mine and nothing in mines.js executes. `tally` is read only by `drawMines`.


### 36. [low] The mine cap is never reached in play, so `throwMine`'s eviction loop and all of `retire()` are unreachable — and config.js says the opposite

**Where:** `src/config.js:1023-1024 (the comment), src/mines.js:251-256 (the eviction loop) and src/mines.js:377-385 (`retire`)`

**Evidence:** config.js promises the cap bites once PAIRED CHARGE is owned:

  1022:      * mine, laid as the last one goes, so the cap was a backstop nobody
  1023:      * reached by laying. At 8.4s it is a steady 1.8, and with PAIRED CHARGE
  1024:      * on top the cap is what you actually run into.

The arithmetic says it cannot. PAIRED CHARGE is `levels: 1` (upgrades.js:440) so a throw lays `1 + up.mineSalvo` = 2 (mines.js:1085); QUICK LAY is `levels: 2` at 0.75 (upgrades.js:451-453) so the wait is `15 * 0.5625` = 8.4375s (mines.js:1087); life is 15s (config.js:1027) and starts only after the flight, which is 0.85-0.95s. A mine therefore occupies the field for at most 15.95s, and 15.95 / 8.4375 = 1.89, so at most TWO throws — four mines — can ever be alive at once, against `cap: 5`.

Measured, driving the real `mineCadence`/`updateMines` for 300 simulated seconds at 1/60 with `mineSalvo: 1, mineEvery: 0.5625`, kind THORN: peak mines on field 4, cap 5, peak patches 4, eviction never fired. regress.mjs already knows: its case at scripts/regress.mjs:13554-13557 asserts `afterTwo === 4` "against a cap of 5" and its comment at :13515-13516 says "Two throws, because one cannot reach the cap."

`throwMine` is called from exactly two places — `mineCadence` (mines.js:1086) and `Game.debugThrowMine` (game.js:2755) — and the debug panel offers only THROW MINE/SNARE/WIRE/KNELL (hud.js:1553-1556). So `while (laidCount(world) >= M.cap)` at :251 and every arm of `retire` (detonate, spall, the knell drain, snap, and the bare `m.dead = true`) are dead in play, and unreachable for THORN and LODE by any route inside the game.

That is what disposes of the audited reader's claim 3, and it also leaves a latent gap worth recording: `retire` (377-385) has no thorn arm and never touches `m.patch`, against the comment at mines.js:618-619 ("one is opened the moment it settles and kept in step with the mine, so killing the mine takes the ground with it"). Forced by hand — one armed THORN, then five more thrown in the same frame — I measured 6 live patches against 5 live mines, the orphan still carrying 12.9s of its 14.5s. It cannot happen in play today; it will the moment anything reaches the cap.

**Consequence:** None a player can see today. The cost is that a contract the config calls load-bearing ("the most that can ever be standing is five") is enforced by a path nothing exercises, and the next change to QUICK LAY, PAIRED CHARGE, `life` or `throwEvery` switches that path on with a known bug in it (an evicted THORN's burning ground outliving the mine by up to 14.5s).

**Suggested fix:** Two independent edits. (1) config.js:1023-1024: delete or correct the last sentence — measured peak is 4 of 5, which is what upgrades.js:437-439 and regress.mjs already say. (2) Give `retire` a thorn arm before the fall-through at mines.js:384, using the fade that already exists for SPORE's cap: `if (m.kind === 'thorn') { if (m.patch) m.patch.retire(); m.dead = true; return; }` — `Patch.retire()` (patch.js:124-130) stops the clock with `next = Infinity` and cuts the life to 0.35s so the ground is seen going out, which is what SPORE's cap uses and what a bare `m.patch.dead = true` would not give.

**Hash:** No. Nothing in mines.js runs in the canonical fight: `w.mine` is null (game.js:195/487) and `mineCadence` (mines.js:1082) returns early.


### 37. [cosmetic] `CFG.lode.push` is documented as an acceleration and used as a force

**Where:** `src/config.js:915, consumed at src/mines.js:522`

**Evidence:**   config.js:915:     push: 620, // acceleration outward, per second, at the centre

  mines.js:522:     const f = (1 - d / reach) * L.push * world.up.lodePush * dt * e.invMass;
  mines.js:523:     e.vx += (dx / d) * f;

`dv = 620 * invMass * dt`, so 620 is a force and the acceleration it produces is `620 * invMass`. With `massOf = type.density * r * r * 0.006` (config.js:3765) and `invMass = 1 / mass` (enemies.js:200-201), measured off the real types: DRIFT r 17 d 0.55 -> invMass 1.049 -> 650 u/s^2; MOTE 1.362 -> 844; NEEDLE 2.381 -> 1476; LURCHER 0.214 -> 133; BULWARK 0.030 -> 18.9. A 78-fold spread against a comment that states one number. The contrast the claim draws is also correct: `grip` blends toward `S.pull` as a target velocity with no invMass term (mines.js:345-347), so SNARE genuinely is mass-independent and LODE is not.

**Consequence:** None in play — the mass scaling is the same convention every impulse in the game uses (enemies.js:1131-1132). It matters only when someone retunes 620 expecting heavy bodies to move: at the centre a BULWARK gets 18.9 u/s^2 of it.

**Suggested fix:** src/config.js:915 -> `push: 620, // outward force at the centre; the acceleration is this x invMass (650 on a DRIFT, 18.9 on a BULWARK)`.

**Hash:** No — comment only, and no mine is laid in the canonical run.


### 38. [cosmetic] mines.js carries four stacked or stranded docstrings, two of which state the opposite of the code beneath them

**Where:** `src/mines.js:276-281, :1068-1073, :247-250, :367-371, :80-96`

**Evidence:** The file's habit is to write a new docstring ABOVE the old one rather than replace it, and two of the survivors are from build 48 ("mines never expire, one field-wide cap of ten"):

  276: /** How many of one kind are on the field. */
  277: /**
  278:  * Everything on the field, of any kind. Nothing expires now, so the ceiling
  279:  * has to be field-wide: counting per kind would let a player switch round the
  280:  * four and hold four caps at once.

  1068: /**
  1069:  * Cadence for whichever kind is selected. One kind is laid at a time, so there
  1071:  * field, since nothing expires: the cap is field-wide, so laying a new kind

Everything expires: `life: 15` (config.js:1027), whose own comment calls it a contract — "none of them outlives its quarter minute" (config.js:1015) — and `m.life -= dt` at mines.js:615 with a `life <= 0` arm on every one of the eight kinds. "The four" is also two builds stale; there are eight kinds.

  247:   // The ceiling is enforced here rather than at the clock, because a SEED
  248:   // offer lays three at once and does not go through the clock at all.

No such caller exists. `throwMine` has exactly two callers: `mineCadence` (mines.js:1086, `n = 1 + up.mineSalvo`, max 2) and `Game.debugThrowMine` (game.js:2755, one). SEED is an enemy type (config.js:2839).

  367: /**
  368:  * WIRE. Everything touching the line is cut for as long as it stays on it...
  371:  */
  372: /**
  373:  * A mine reaching the end of it...

That WIRE docstring sits above `retire` (:377); `cut`, which it describes, is at :528 with no docstring at all.

And mines.js:80-96, the old `mineGrade` header now sitting above `tally`, says "Six of these are shared by every kind" — contradicted by the very next comment (":116 The shared six, MINUS the ones this kind cannot use") and by the measured denominators: blast 6, knell 6, snare 5, thorn 5, void 5, wire 4, lode 4, spall 8.

**Consequence:** None player-visible. The cost is the next reader: two of these say in as many words that mines never expire, in the file whose whole update loop is an expiry clock, and one names a caller that does not exist.

**Suggested fix:** Delete the superseded halves: mines.js:276 (superseded by 277-281, which then needs "Nothing expires now" -> "Nothing is per-kind"), the "since nothing expires" clause at :1071, the SEED sentence at :247-248, and move :367-371 down to `cut` at :528. In :80-96, drop the "Six of these are shared by every kind" sentence.

**Hash:** No — comments only.


### 39. [medium] SPALL's wedge — "facing the way it will throw" — is drawn spinning while the fan always leaves straight up

**Where:** `/home/user/Shooter/src/mines.js:941, :994-1007, :423, :590, :196`

**Evidence:** CONFIRMED, and re-measured at both ends.

mines.js:941 — `ctx.rotate(m.spin);` sits above the whole per-kind if/else chain.
mines.js:994 — `      // a wedge, facing the way it will throw` — and the shape it introduces is drawn in LOCAL coordinates pointing up-screen: :997 `ctx.lineTo(R * 0.5, -R * 0.9);`, and the three spines at :1004-1006 `ctx.moveTo(i * R * 0.45, -R * 0.9); ctx.lineTo(i * R * 0.7, -R * 1.7);`.
mines.js:196 — `this.spin = rand(0, TAU);` (a random start), :590 — `m.spin += dt * (m.armed ? 2.4 : 0.8);`.
mines.js:423 — `  const base = -Math.PI / 2;` — the fan's direction, a constant, with nothing reading `m.spin` anywhere in `spall()`.

MEASURED (playwright, headless, rAF stubbed, mine forced landed+armed at canvas centre).
(a) The fan does not move. Spawning a body on the mouth at four spins and reading `atan2(p.vy, p.vx)` of the 14 pellets `spall()` creates:
  spin 0deg   -> mean -90.23, range -117.0..-62.5
  spin 90deg  -> mean -90.09, range -114.4..-63.2
  spin 180deg -> mean -90.48, range -116.0..-65.4
  spin 270deg -> mean -89.78, range -116.2..-64.7
(b) The picture does move. `drawMines` rendered to a 200x200 offscreen canvas, luminance centroid of the annulus r=14..42:
  spin 0 -> -94.3deg | 45 -> -51.8 | 90 -> -5.3 | 135 -> +44.7 | 180 -> +95.3 | 225 -> +141.9 | 270 -> -175.8 | 315 -> -135.6
That is drawn = -94.3 + spin, slope 1.00. Instrument check: the same measurement on VOID (a rotationally symmetric disc) returns -136.93deg at all four spins, bit-identical, so the centroid is reading a real orientation and not noise.
(c) Spin rate measured live off a landed armed SPALL over 120 frames: 2.4000 rad/s exactly — one revolution every 2.618 s. The picture and the damage therefore agree only at spin === 0 (mod 2pi), which has measure zero; mean absolute error over a uniform spin is 90deg.

The wedge is the ONLY directional cue the mine has: the trigger mouth at :687-697 is a circle, drawn as a full `ctx.arc(0, 0, ..., 0, TAU)`, and the pip collar at :868-878 is anchored at -pi/2 regardless of spin.

**Consequence:** Player-visible. The one mine in the game whose damage is directional carries a direction indicator that is wrong essentially always and turns a full revolution every 2.6 s. arsenal.js:131 tells the player the shot goes "straight up the field" — so the words are right and the object on the field contradicts them. A player reading the wedge to judge whether the fan will catch something reads a random number.

**Suggested fix:** Counter-rotate inside the branch: `ctx.rotate(-m.spin);` as the first line of the `} else if (spallM) {` arm at mines.js:993. That leaves the seat, glow, dashed mouth and pip collar spinning exactly as they do now (they are all drawn before :941), and it does not disturb `m.spin`'s other reader, the dash offset at :888 `ctx.lineDashOffset = -world.time * 6 - m.spin * 20;`, which is computed before the rotate. Alternative: hoist :941 into the branches that want it.

**Hash:** No. Draw-only, inside mines.js, and the canonical ORDINAL fight lays no mines (`fight.mjs` never sets `world.mine`, and `mineCadence` returns at its first guard `if (!kind || world.phase === 'boot') return timer;`).


### 40. [low] `retire()` skips `fizzle` on four kinds and does not pick the oldest, and its comment names a caller that does not exist

**Where:** `/home/user/Shooter/src/mines.js:247-256, :377-385, :719-720`

**Evidence:** PARTIALLY CONFIRMED — the three concrete sub-defects hold; the reader's "dead code, the `world.endless` shape" framing does not (see refuted list).

(1) The comment names a caller that does not exist. mines.js:247-248 — `  // The ceiling is enforced here rather than at the clock, because a SEED` / `  // offer lays three at once and does not go through the clock at all.` `throwMine` has exactly two callers in the tree: `mineCadence` at mines.js:1086 (`for (let i = 0; i < n; i++) throwMine(world, kind);`) and `Game.debugThrowMine` at game.js:2756. Nothing named SEED lays a mine — SEED is an enemy type (config.js:2841) and there is no mine offer anywhere.

(2) The fall-through does not fizzle, against the comment two lines above it. mines.js:249-250 — `  // oldest goes, and it goes the way its kind goes — a blast mine bangs, a` / `  // spall throws, a void closes — so nothing simply evaporates.` But mines.js:377-385:
```
function retire(world, m) {
  if (m.dead) return;
  if (!m.landed || m.settle < m.cfg.arm) { m.dead = true; return; }
  if (m.kind === 'blast') { detonate(world, m); return; }
  if (m.kind === 'spall') { spall(world, m); return; }
  if (m.kind === 'knell') { while (!m.dead && m.tolls > 0) toll(world, m); return; }
  if (m.kind === 'snare' && !m.gripping) { snap(world, m); return; }
  m.dead = true;
}
```
There is no `fizzle(world, m)`, so void, thorn, lode, wire and a gripping snare evaporate — and SALTED (upgrades.js:459, "A spent mine goes off instead of fizzling") pays nothing on them. A VOID retired does not "close".
MEASURED (SALTED bought, five armed mines of one kind laid, then one more throw to force the eviction; `fizzle` is the only path that pushes a `Shock` onto `world.effects`):
  blast  effects +1 (detonate's Shock)   spall  projectiles +14 (the fan)
  void   +0   thorn +0   lode +0   wire +0

(3) The victim is not the oldest. mines.js:252 — `    const oldest = world.mines.find((x) => !x.dead);` against the compaction at mines.js:719-720 — `      list[i] = list[list.length - 1];` / `      list.pop();`. Swap-pop, so index 0 is whoever was last moved there, not the first laid. The comment at :249 says "The oldest goes".

**Consequence:** None today. Measured over 400 s of live cadence with PAIRED CHARGE and QUICK LAY x2 (the maximum: `paired` is levels 1, `quicklay` returns "maxed" on the third buy), letting `Game.update` lay the mines: concurrent count is 2 or 4 and never 5, for void, spall, blast and thorn alike — `laidCount(world) >= M.cap` is never true, so `retire` runs only from the debug panel. The cost is a comment maintaining a caller that was deleted and two real bugs parked behind a backstop that has exactly one unit of margin.

**Suggested fix:** Delete the SEED sentence at :247-248. Route the fall-through at :384 through `fizzle(world, m)` instead of `m.dead = true` (fizzle sets `m.dead` itself and is already guarded against a second call at :392). Pick the victim by lay order — a monotonic id on `Mine`, or preserve push order by splicing at :719 instead of swap-popping.

**Hash:** No. mines.js only, and the canonical fight lays no mines.


### 41. [low] VOID's collapse ring is sized off the body but centred on the mine, and WIDE MOUTH opens the two apart

**Where:** `/home/user/Shooter/src/mines.js:482, :687, :697`

**Evidence:** CONFIRMED, with the reader's attribution corrected.
mines.js:482 — `  ring(m.x, m.y, e.r * 2.2, 6, 0.42, '#7383ff', 3);` — centred on the MINE, radius taken from the BODY. The sparks at :483-486 are on the body (`spark(e.x, e.y, ...)`), so the two ends of the effect are drawn from different anchors.
The trigger at mines.js:687 — `      const reach = m.r + m.cfg.trigger * world.up.mineTrigger * own;` — and :697 `        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= rr * rr) {` with `rr = reach + e.r`, so the body's centre can be `reach + e.r` from the mine.
ARITHMETIC (V.r = 12, V.trigger = 18 at config.js:952):
  stock                     reach = 12 + 18            = 30
  EVENT HORIZON (x2.2, levels: 1, upgrades.js:456-458)  = 12 + 18*2.2      = 51.6
  + WIDE MOUTH (no `levels` -> 3, 1.4^3 = 2.744)        = 12 + 18*2.744*2.2 = 120.66  (measured `up.mineTrigger` = 2.744)
The ring covers the body only when `e.r * 2.2 >= reach + e.r`, i.e. `e.r >= reach / 1.2`. At stock that is `e.r >= 25` — already false for most of the roster, but the gap is a few units and reads as contiguous. Fully bought it is `e.r >= 100.6`, which nothing in the game satisfies:
  BULWARK (r 45): body centre up to 165.66 from the mine, near edge at 120.66, ring 99 — 21.7 units of blank floor between the ring and the body.
  a 12-unit body: centre up to 132.66, near edge 120.66, ring 26.4 — 94 units.
Note the reader blamed EVENT HORIZON; EH alone leaves 51.6+45 = 96.6 against a 99 ring, i.e. still overlapping for a BULWARK. WIDE MOUTH is what opens it, and WIDE MOUTH is a shared node that also has no explicit `levels`.
`ring` contracts here (r0 = e.r*2.2 -> r1 = 6) and drawFx strokes at `alpha = t*0.95` / `width = max(0.4, w*t)` (fx.js:586-587) with t running 1 -> 0, so the brightest, widest frame is the largest circle — the frame at which the mismatch is most visible.

**Consequence:** Cosmetic, and only once the branch is bought. The swallow reads as two unrelated events: a bright ring closing over empty floor where the mine was, and a body bursting into sparks up to 130 units away. Nothing joins them.

**Suggested fix:** Draw the collapse at the body — `ring(e.x, e.y, e.r * 2.2, 6, 0.42, '#7383ff', 3)` — or keep it on the mine and add a short stroke from `(m.x, m.y)` to `(e.x, e.y)` so the two ends read as one event.

**Hash:** No. Draw-only.


### 42. [cosmetic] SPALL and VOID both lay with BLAST's chime: `LAY_TONE` still holds only the original four kinds

**Where:** `/home/user/Shooter/src/mines.js:242, :273`

**Evidence:** CONFIRMED by reading; the premise is exact.
mines.js:242 — `const LAY_TONE = { blast: 300, snare: 240, wire: 380, knell: 200 };`
mines.js:273 — `  audio.chime(LAY_TONE[kind] || 300);`
`KIND` at mines.js:137 has eight entries — `{ blast: M, snare: S, wire: W, knell: K, thorn: T, lode: L, spall: P, void: V }` — so thorn, lode, spall and void all fall to the `|| 300` default, which is not a neutral tone but BLAST's own entry. audio.js:336-340 `chime(f)` plays f and f*1.5, so the four are byte-identical to a BLAST being laid.
The file's build-217 colour header at mines.js:40-67 spends 27 lines arguing that a mine's identity has to be readable at a glance because several may be down at once for fifteen seconds each; the audio channel says "blast" for half of them.

**Consequence:** Minor, and only at the moment of laying — everything after the lay (arming, trigger, detonation) is distinct per kind.

**Suggested fix:** Give the four added kinds their own entries in LAY_TONE, or drop the `|| 300` so a missing kind is silent rather than wrong.

**Hash:** No. Audio only, and no mine is laid in the canonical fight.


### 43. [cosmetic] MINE: a stale block comment survives directly above the comment that corrects it, inside `tally`

**Where:** `/home/user/Shooter/src/mines.js:124-131 (stale) against :132-134 (correct)`

**Evidence:** MY FINDING — the reader's claim 7 described the old text, which has been superseded; what they missed is that BOTH comments are now in the file, adjacent, saying opposite things.
mines.js:124-131:
```
  /*
   * SHRAPNEL is `up.mineDamage`, and `up.mineDamage` is read in exactly three
   * places: `detonate`, `fizzle` and `toll`. THORN's patch takes
   * `T.patch.dps` raw and WIRE's cut takes `W.damage * up.wireDamage` and no
   * more -- so crediting either of them here is the readout lying about the
   * machine, ...
   */
```
mines.js:132-134, immediately below it:
```
  // SHRAPNEL is `up.mineDamage`. It is read by `detonate`, `fizzle`, `toll`,
  // SPALL's pellets and their bursts, and -- since build 220 -- THORN's
  // ground. Not by WIRE's cut, which has `up.wireDamage` of its own.
```
mines.js:135 — `  const hurts = bang || kind === 'thorn';                               // SHRAPNEL`
The second is correct and the first is not. `up.mineDamage` has six reads in five functions: :291 (detonate), :401 (fizzle), :435 and :441 (spall's burst and pellet), :566 (toll), :633 (`dps: T.patch.dps * world.up.mineDamage`, THORN's ground, added in build 220). The stale block asserts THORN takes `T.patch.dps` raw, which :633 falsifies, and asserts crediting THORN "is the readout lying" — which is exactly what line :135 now deliberately does, correctly.

**Consequence:** None to the player. But this comment is the rule anyone adding a mine kind will follow, and it now argues against the line it sits on. CLAUDE.md records that this same accounting has been miscounted twice already.

**Suggested fix:** Delete mines.js:124-131. The three-line comment below it is correct and complete.

**Hash:** No. Comment only.


### 44. [cosmetic] MINE: config.js says the mine cap "is what you actually run into"; measured, it is 4 of 5

**Where:** `/home/user/Shooter/src/config.js:1023-1024 against /home/user/Shooter/src/upgrades.js:437-438`

**Evidence:** MY FINDING — turned up while re-deriving the reader's claim 6.
config.js:1023-1024 — `     * mine, laid as the last one goes, so the cap was a backstop nobody` / `     * reached by laying. At 8.4s it is a steady 1.8, and with PAIRED CHARGE` / `     * on top the cap is what you actually run into.`
upgrades.js:437-438, the PAIRED CHARGE note, says the opposite: `     * At one level a throw lays two, two throws leave four, and the cap is` / `     * still the backstop it was authored as.`
ARITHMETIC: `throwEvery` 15 (config.js:1028) x `mineEvery` 0.75^2 = 8.4375 s between throws; `mineSalvo` 1 so two per throw; `life` 15 counted from landing (`m.life -= dt` at mines.js:583 sits below the `if (!m.landed) { ... continue; }` at :601-616), plus `flight` 0.85-1.0, so a mine exists 15.85-16.0 s. 15.85 / 8.4375 = 1.88, so at most two generations coexist: 4.
MEASURED, 400 s of live cadence per kind with PAIRED CHARGE + QUICK LAY x2 bought and the mines laid by `Game.update` itself (my first attempt called `mineCadence` by hand as well and double-laid, reporting a spurious max of 5 — the instrument, not the game):
  void 2 for 3037 frames, 4 for 20963, max 4 | spall/blast 2:3451, 4:20549, max 4 | thorn 2:3267, 4:20733, max 4
upgrades.js is right and config.js is stale.

**Consequence:** None to the player. Two comments in the same codebase give opposite answers about the same number, and the wrong one sits on the constant itself.

**Suggested fix:** Amend config.js:1024 to match the measurement and the PAIRED CHARGE note: a steady 3.6, peaking at 4, against a cap of 5.

**Hash:** No. Comment only.



## Refuted, recorded so it is not re-reported

- claim 3 (SPALL's pellets name no `form`) — ALREADY FIXED in the working tree, and the fix carries the very note the claim says is missing. mines.js:457 is `form: 'pellet',` inside the `spall()` fan, directly under a comment at :447-456 reading 'The same form SCATTER and HAIL use, and for the same reason: this fan is fourteen at zero upgrades and thirty-six with BUCKSHOT... every one of them was falling to `fire`'s DEFAULT muzzle arm, two sparks and a dot apiece, which is up to a hundred and eight particles on one point... Exactly the fault build 219 fixed on HAIL, one file over.' The claim's cited lines (mines.js:405-412) are stale; the current fan is at mines.js:437-471. The pellet arm at projectiles.js:776-780 is one computed spark, and the landing goes through impactFx's pellet case, exactly as the claim's own proposed fix asks. Nothing to do.

- claim 6 (contactAt computed twice, 'against a comment saying it is not') — the headline does not hold. The comment does not say it is computed once; it names the second call explicitly. projectiles.js:328-336: 'A round can stop on three different things -- a body, a WARDEN plate, a SCION ball -- and each has its own centre and radius. Keeping them here means one contactAt below covers all three, instead of the body case computing it twice (ONCE IN TAKEHIT, once per bounce) and the other two not computing it at all.' The parenthetical is the claim's own finding, written down at the site. The observation underneath is true and I verified it — projectiles.js:436 `const c = contactAt(HIT, hx, hy, dirx, diry, p.r);` with HIT set to `e.x, e.y, e.r` (:395-397 for the enemy case) and enemies.js:1050 `const c = contactAt(this, hx, hy, dirx, diry, pr);` with the same five inputs, so the outputs are bit-identical — but there is no defect: no player-visible consequence (the claim says so itself), no wrong number, and the duplication is forced by `takeHit`'s signature, which deliberately takes the raw hit point plus the travel direction (enemies.js:1037-1043 is a header explaining why it must NOT be handed anything shaped like a normal) and is exercised directly by three regress cases (regress.mjs:10941, :10968, :10984). Threading a precomputed contact through the hottest damage path to save one object literal per landed round, on a project whose canonical hash rules make any change there expensive to verify, is a worse trade than the allocation.

- claim 8 (RIME, SPORE and TITHE have no muzzle arm) — the facts are right and the verdict is a preference, not a defect. I verified all three switches: the draw switch (projectiles.js:561-745) covers pellet, shell, arc, dart, slab, flake, pod, tithe plus a default; impactFx (fx.js:296-350) covers the same eight plus a default; the muzzle (projectiles.js:775-806) covers pellet, shell, slab, arc, dart and then `default:`. So flake, pod and tithe do share BOLT's flash. But nothing claims otherwise: the block's header is 'The muzzle, per form.' — a description of the dispatch, not a promise of coverage — and it carries an authored `default:` that its own first rule makes load-bearing ('the default path is byte-for-byte what it always was, including its two rand() draws -- ORDINAL's canonical hash is taken with BOLT and PULSE and nothing else, so the default's draw count is load-bearing'). Three of nine rounds sharing a default flash is a polish gap somebody may want to close; it is not behaviour contradicting a stated claim, and reporting it as a fault puts a feature request in the same list as the OVERSTUFFED row.

- claim 11 (six arsenal rows quote pre-216/218 damage) — ALREADY FIXED, all six, and with a guard. Current arsenal.js: :127 `dmg: '105'` (BLAST), :136 `dmg: '79/s'` (WIRE), :140 `dmg: '81, twice'` (KNELL), :144 `dmg: '37/s'` (THORN), :152 `dmg: '29 x 14'` (SPALL), :168 `dmg: '34, fading'` (SPINE) — each matching config.js:1037, :1065, :1079, :903, :930 and :700 respectively. A header at arsenal.js:88-101 records the pass ('Every `dmg` here is a literal, and six of them had gone stale... `regress.mjs` checks every one of them against `CFG` now. If you retune a number in config.js, this table is the second half of that change.'). The claim's cited lines (90, 99, 103, 107, 116, 164) are stale by about 37 lines.

- claim 12 (drawFx ends two particle branches on a bare `ctx.globalAlpha = 1`) — ALREADY FIXED, and in exactly the form the claim proposes. fx.js:524 captures `const enter = ctx.globalAlpha;` under a header at :518-523 naming the trap ('the same one CLAUDE.md records costing four separate fixes before build 210's fizzle fade would come out at all. Harmless today because `Game.draw` enters at 1; it is the next caller that pays.'). The shard branch is :545 `ctx.globalAlpha = enter * clamp(t * 1.3, 0, 1);` / :561 `ctx.globalAlpha = enter;`; the dot/ember branch is :566 `ctx.globalAlpha = enter * clamp(t, 0, 1) * p.glow;` / :568 `ctx.globalAlpha = enter;`; the ring fill at :576-579 does the same with its own `was`; and the function exits at :594 `ctx.globalAlpha = enter;`. There is no bare `= 1` anywhere in drawFx. The claim's cited lines (551, 558, 585, 593) do not contain what it quotes.

- Claim 8 (the arsenal's '15 + 44 blast' is a figure no body ever takes). REFUTED as a defect, though its arithmetic is sound. The row is not free to say anything else: build 220 added a deliberate rule that the arsenal's numbers ARE the config's numbers, with a regress case that pulls every digit out of every `dmg` string and compares it (scripts/regress.mjs:13558-13605, `explosive: [CFG.rounds.explosive.damage, CFG.rounds.explosive.blast.damage]`), written precisely because six of these strings had drifted from config and were wrong on three surfaces at once. Falloff is universal to every blast in the game — enemies.js:4546 `e.applyDamage(world, damage * (0.35 + falloff * 0.65), …)` is the same line PULSE, BLAST, KNELL, SPALL and FIZZLE all go through — and not one of their rows mentions it either; naming HE's alone would make it the odd row out. The numbers check out (a 20-radius body takes 38.0 of the 44, a BULWARK 30.6, FRACTAL's core 24.9) but that is the blast model working as documented, not a wrong number. The claim also mis-attributes its own figure: '43% on the largest' is BULWARK at r 45, while the FRACTAL core it cites in the same sentence is 77%. The secondary half — that config.js:694-695's rack line ('BOLT is 90.9, SCATTER 135.3 and HE 98.2') computes HE at an unreachable falloff of 1.0 — is factually true and I verified it (the honest single-target figure is 88.3 on a 20-radius body), but it changes nothing it was drawn for: SPINE at 34 is 82.0 a second, still 'just under BOLT' at 90.9, and still above HE either way. No consequence, and no defect in the row.

- Claim 9 (SPINE's arsenal row still says 20 against a config of 34). REFUTED — already fixed at HEAD, and the reader was reading a stale copy. src/arsenal.js:179 is `dmg: '34, fading', fx: 'Punches through 3 more bodies behind the first.',`. It was corrected in commit 0555081 'Build 220, part two: ARC's chain never took the damage line', along with BLAST 95→105, WIRE 72→79, KNELL 74→81, THORN 34→37 and SPALL 26→29, under a new header at arsenal.js:87-101 explaining the drift — and it is now pinned by the regress case at scripts/regress.mjs:13572-13605, which would fail on any recurrence. There is nothing left to fix.

- Claim 11 (SPALL's fan is drawn with the expensive default form). REFUTED — already fixed at HEAD, in the same commit, and the file even carries the reader's own reasoning. src/mines.js:457 is `form: 'pellet',`, under a header at 446-456: `The same form SCATTER and HAIL use, and for the same reason: this fan is fourteen at zero upgrades and thirty-six with BUCKSHOT … and every one of them was falling to `fire`'s DEFAULT muzzle arm … Exactly the fault build 219 fixed on HAIL, one file over.` The first half of the claim is not a defect at all: BUCKSHOT's row is '+60% spall pellets' (upgrades.js:491) and `spallPellets` has exactly one consumer, mines.js:424 `const n = Math.round(P.pellets * world.up.spallPellets);` — 14 x 1.6^2 = 35.8 → 36 — so the node does precisely what it says. That it does not touch SCATTER is what its own name and row promise.

- Claim 1 (SPINE's card still says DMG 20) — the premise is false in the working tree, and the file:line does not exist as quoted. The card is at arsenal.js:179, not :164, and reads `    dmg: '34, fading', fx: 'Punches through 3 more bodies behind the first.',` — 34, matching config.js:705 `      damage: 34,`. All four render sites the claim lists therefore render 34. It is also now guarded: scripts/regress.mjs has an "the arsenal's numbers are the config's numbers" section whose header names this exact staleness — "build 218 took SPINE from 20 to 34, and neither pass came back to the table ... SPINE 20 against 34" — and pulls every number out of every `dmg` string to check it against CFG. The only thing that survives is the comment at config.js:774, which is comment-only and is listed above as cosmetic rather than as the high-severity player-facing defect claimed.

- Claim 2 (ARC's chain never sees `up.damage`) — already fixed, with the fix and its measurement written into the file. projectiles.js:207 reads `  let damage = g.jumpDamage * up.damage;`, under an eleven-line header at :196-206 that states the defect the claim describes ("...and HOLLOWPOINT reaches the chain, which it never has"), the 88% share, and the before/after dps on a pinned wall. CLAUDE.md records the same sweep — "`up.damage` is applied at the MUZZLE... ARC's chain (25 a jump against a dart of 11, so 88% of the round was immune...)" — as build 220 work. The claim's arithmetic on the OLD code was sound; it is auditing a tree that no longer exists. (The gunScale/boss-health consequence it derives is likewise moot.)

- Claim 3 (`chainFrom` is a damage path with no `spent` guard) — already fixed. projectiles.js:218 reads `        if (e.dead || e.spent || seen.has(e)) continue;`, and carries a comment at :215-217 giving the same reason the sweep 90 lines below gives: "`spent` for the reason the sweep a hundred lines below this one gives: a boss's frame through its outro is drawn and nothing else. A round could not HIT one and the chain could jump into it." The claim's glitchOut reachability construction was correct reasoning; the guard is in.

- Claim 4 (a body killed by an ARC jump does not die earthed) — already fixed. projectiles.js:239-240 read `    best.lastHit = 'arc';` and `    best.lastHitT = world.time;`, immediately before `    best.applyDamage(world, damage);` at :241, under a comment at :230-237 that states exactly the defect claimed ("a body killed by a jump had none and took the generic death -- the round whose whole identity is the discharge showed the discharge on the one body the dart touched and on none of the four it earthed"). Note the fix is confined to `chainFrom`, so the claim's own warning about `deathFx('arc')` moving the seeded stream does not apply.

- Claim 5 (the chain is drawn in the pale blue build 209 took off ARC's flight) — already fixed, and by the constant the claim asked for. projectiles.js:176 declares `const TONE_ARC = '#c79bff';` under a header naming the cause: "The round's violet, shared by the dart, the chain, the sparks and the earthed death. One constant, because build 209 moved three of the four and the fourth stayed cyan for eleven builds." The link sparks use it (:229 `      spark(best.x, best.y, spread(180), spread(180), TONE_ARC, 0.2, 2);`) and so does the lightning (:286 `      glow: TONE_ARC, hot: '#eadcff', alpha: k, width: 0.7,`). Neither `#59e0ff` nor `#9be7ff` appears in the file.

- Claim 6 (SLIVER's row says the same thing at both pips) — a copy preference dressed as a defect, and it names no false statement. The row at upgrades.js:417 ('A spine comes apart into an arc of fragments through the first body it hits.') is true at 1/2 and true at 2/2; nothing in it is a number that has gone stale and nothing contradicts the code. The 'one line plus a pip meter, no per-level text' shape is the tree's universal convention, not something SLIVER is being singled out by: menu.js:420 `const max = n.repeat ? 0 : (n.levels || 1);` and :435 `<span class="shopMeter${max < 2 ? ' none' : ''}">${'<i></i>'.repeat(max)}</span>` render every multi-level node that way — HOLLOWPOINT x3, RICOCHET x3, TRACER x2, HEAVY x2, OVERSTUFFED x4. Wanting the copy to describe the second step differently is a legitimate design ask; it is not a fault of the kind this audit is for. The mechanism itself checks out: I confirmed the 1/4/13 ceiling in a live run (parent splits 2 -> three fragments at splits 1 -> nine grandchildren at splits 0), so the header's "three fragments become nine" is accurate.

- Claim 8 (THROUGH AND THROUGH has no `levels` and is sold three times) — the claim concedes its own case: "None that contradicts a row. It is a balance question, not a defect." The tree level is real (I imported tree.js and printed it: `throughandthrough 3`, against `fifthlink 1`, `sliver 2`, `annealed 1`, `railed 1`, `doubletap 1`), but the row at upgrades.js:366 reads `+2 bodies a spine pierces.` — which is per-LEVEL accurate, is what the pip meter counts, and is the same shape as HOLLOWPOINT's '+50% damage' and RICOCHET's '+1 bounce off the arena edges' at the same default. This is not the `u.levels ?? 3` trap: that trap is a node whose line names an absolute the extra levels overshoot (FIFTH LINK's fifth link, STANDING ORDER's -20%), and a dial has no such number to overshoot. One arithmetical correction: the claim's "It is added twice over" (shooter.js:602 `            pierce: g.pierce + up.pierce,` and :300 `      pierce: S.pierce + world.up.pierce,`) is not a double-count — those are two different projectiles, each with its own budget, exactly as config.js's `pierce: 1, // ...and what a fragment carries on through, before `pierce`` says.

- Claim 9 (orphaned COUNTERSPIN header above COMPOUND) — already fixed, and the replacement text names the orphan explicitly. upgrades.js:358-364 now read: "The header that used to sit here explained a node that added a second ARM and argued it down to one level. COMPOUND is a percentage dial on TITHE's bite and IS on the default three, so the comment said the opposite of what was true of the node it had come to sit above. It was orphaned by a deletion, the way `windAt`/`rateAt` were in build 217." The old three lines the claim quotes are gone from the file.

- CLAIM 1 (SLUG's shove is clipped by the cruise x6 cap, SLEDGE and HEAVY buy nothing, give SLUG `throwOff`) — REFUTED. The arithmetic is broadly right and the codebase already says so in its own words; the VERDICT is wrong, and the proposed fix is the exact change build 220 tried, measured, reverted, and then pinned with a test. (a) The reader cites src/shooter.js:601 `impulse: g.impulse * up.slug,` and appears not to have read the 26-line comment that begins on the very next line, src/shooter.js:604-630: `* ...and NOT a throw, which is the one thing about this round that` / `* looks wrong and is not. SLUG's 1500 is clipped by \`integrate\` to` / `* \`(cruise || 60) * 6\` -- 137 u/s against a BULWARK -- so SLEDGE's` / `* ladder and HEAVY's do multiply a number the physics discards, and` / `* the arithmetic says to lift the ceiling the way PULSE lifts it.` ... `* Measured, that reopens build 110.` (b) The same argument is repeated at the other end, src/enemies.js:1191-1198: `* Only a deliberate, one-press clear lifts the ceiling. Build 220 tried` / `* giving SLUG the same exemption on the grounds that its whole identity` / `* is the impulse and \`(cruise || 60) * 6\` clips it to 137 u/s against a` / `* BULWARK -- true arithmetic, and it reopens build 110`. (c) scripts/regress.mjs:1099-1190 is a shipped case, `check('SLUG-s shove is bounded by what it hits, and a throw-s ceiling is higher', ...)`, asserting `x.peak <= x.cap * 1.3`, whose header says in as many words "That reads like a defect and build 220's audit reported it as one. It is not." (d) CLAUDE.md:577-586 records the rule: "A throw has two halves and they are earned by CADENCE, not by weight." (e) I re-ran the A/B myself rather than taking the note on trust. Shipped build, HEAVY x2, auto-fire on an unkillable LURCHER for 25s: peak travel 228 u/s against a cap of 229, furthest 804 units from the turret. With `applyDamage` monkeypatched so a SLUG impulse passes `throwOff`: peak 718 u/s against `thrownSpeed` 720, furthest 1298 units — which is build 110 verbatim and matches the 1293 the comment records against an 817-unit field. The regress assertion goes red on the patched build (718 > 229*1.3 = 298). (f) The evidence also contains two factual errors that are probably what produced the verdict: "grep -rn throwOff src/*.js returns exactly one caller: abilities.js:829" is wrong — there are three sites, src/abilities.js:829 (PULSE sets it on a blast), src/enemies.js:4547 `0, 0, !!blast.throwOff);` (`applyBlast` threading it through), and src/shooter.js:185-186 `e.applyDamage(world, P.damage * (0.35 + f * 0.65), nx, ny, P.impulse * f,` / `0, 0, true);` (PILE, passing it positionally). SLUG's absence from that list is a decision that was made three times, not an oversight. What survives is only the residual the project already accepts and documents: the SLEDGE row sells a ladder the ceiling discards on the light half of the roster. That is knowingly left open at scripts/regress.mjs:1104-1113 and is not a new find.

- CLAIM 4 (neither `slugged` nor `chill` is drawn — two multi-second status rules with no on-screen tell at all) — REFUTED as a defect; the premise is half right and the conclusion is a feature request. The grep is correct: no draw path reads either flag (`slugged` at src/enemies.js:246, :830, src/game.js:1590-1598, src/shooter.js:643; `chill` at src/enemies.js:288, :867-871, src/shooter.js:657, src/upgrades.js:46/:368). But "nothing on screen at all" is not what ships. Both rounds have their own impact AND their own death: src/fx.js:325-327 gives SLUG's 'slab' a concussion ring plus three slow dust dots; src/fx.js:330-336 gives RIME's 'flake' four ice shards and a glint; src/fx.js:363-370 gives 'flake' a six-shard icy death with a #8fe3ff ring and src/fx.js:396-400 gives 'slab' four heavy dots plus `ripple(x, y, 1.2, r * 6)`, both fired from src/enemies.js:1288-1289 when the kill is within half a second of the hit. A slugged collision is also visibly distinct from a damaging one: src/game.js:1599 `return;` sits above the three `spark(mx, my, ...)` calls at src/game.js:1605-1607, so a slugged impact throws no impact sparks where an ordinary one throws three. More decisively, nothing in the code, config, arsenal row, README or teaching line promises a persistent status indicator for either mark, so there is no statement for the behaviour to contradict — this is a proposal for a new visual, which the brief classes as a design preference rather than a fault. The reader's own framing ("It is not a wrong picture, it is an absent one") says the same thing.

- CLAIM 7 ("Chills for 3.2s" is the base value; a fully bought DEEP FREEZE makes it 15.72s) — REFUTED. The arithmetic is right (src/tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);`, src/upgrades.js:368 `scale('chill', 1.7)` with no `levels`, 3.2 * 1.7**3 = 15.72) and the reader correctly declines to call the three levels a defect. But the conclusion that the arsenal string is wrong does not hold, because stating the ROUND's own number and letting upgrades move it is the table's convention throughout, and RIME is not singled out: src/arsenal.js:179 SPINE says `'Punches through 3 more bodies behind the first.'` against THROUGH AND THROUGH (src/upgrades.js:367, `bump('pierce', 2)` with no `levels`, so +6 — nine bodies bought against three quoted); src/arsenal.js:175 ARC says `'The hit jumps to 4 more nearby'` against FIFTH LINK; src/arsenal.js:191 SPORE says `'for 4.5s. Three at a time.'` against SECOND GROWTH. All four understate a fully bought build by the same construction. And the convention is deliberate and pinned: scripts/regress.mjs:13614-13630 holds every one of those strings to the CONFIG value — `says('rime', CFG.rounds.rime.chill);` at :13621 sits beside `says('spine', CFG.rounds.spine.pierce);` and `says('arc', CFG.rounds.arc.jumps);`, under a case named "...and the sentences beside them still describe the same machine". Rendering effective values would break that case for five rows at once and change the whole table's contract; it is a design decision about the loadout sheet, not a RIME fault.

- OK LIST (not one of the reader's claims — things I checked in this code and found correct, so the next audit need not re-report them). (1) `Math.max(e.chill, ...)` at src/shooter.js:657 lacks the `|| 0` that SLUG's mark has at :643, which would make `chill` NaN on any body without the field. It cannot: I opened all seven bosses through `openBoss`, ran each to stage III for 30s and walked every body in `world.enemies` — every one is an `Enemy` instance with numeric `chill` and `slugged` (Enemy/ordinal+tally+digit, gnomon+dial+second, fractal+fraction+mite, amplitude+crest+droplet, pylon+ion, pane+parity+echo, terminus+bound+limit), and src/projectiles.js:396 only ever sets `bestKind = 'enemy'` off `test(world.enemies)`. No NaN path. (2) The `slugged` chain is genuinely bounded: every member decays by dt in the same `Enemy.update` (src/enemies.js:830) from the same value, so `Math.max` can only propagate a non-increasing number and nothing outlives 2.4s from the original hit. (3) The Decoy (src/abilities.js:306-325) has no `slugged` field, so `typeof a.slugged === 'number'` never marks it — it is protected from a slugged body's collision damage by the stated "takes none from it" rule, not by the propagation, contrary to the reader's aside. (4) SLUG's impulse does take HEAVY as well as SLEDGE: src/shooter.js:504 `impulse: (opts.impulse ?? CFG.bolt.impulse) * up.impulse,` multiplies `g.impulse * up.slug` from :601, so the ladder is 1500 * up.slug * up.impulse as the reader assumed. (5) Debris cannot inherit the mark — `if (a.inert || b.inert) return;` at src/game.js:1584 runs before the slugged guard. (6) The chill's `drag ** dt` is frame-rate independent by construction and its per-second constant is exactly `CFG.rounds.rime.drag`. (7) src/config.js:774's BOLT figure (26) still matches src/config.js:1151.

- CLAIM 1 (TITHE's mark is a floor, worth nothing from tier 15) — ALREADY FIXED, and the fix is committed, not sitting in a working tree. `git status --porcelain` is empty; commit ff1da74 is "Build 220, part six: a TITHE mark paid nothing from tier 15". shooter.js:752-755 now reads `if (!e.tithed) {` / `e.tithed = true;` / `e.bounty *= g.bounty * w.up.bounty;` / `}` — the `Math.max` is gone, replaced by exactly the flag-plus-multiplier the claim proposed, with the crossover arithmetic recorded in the comment above it at shooter.js:739-751. The flag is declared in the constructor (enemies.js:297 `this.tithed = false;`, with a note at :291-296 explaining why it is declared rather than sprung into existence), and Enemy objects are never pooled (`new Enemy` at every site), so it cannot be inherited. A regress case pins it at both ends of the ladder: scripts/regress.mjs:13805-13871, `check('a TITHE mark multiplies what a body was worth, at every tier', ...)`, asserting `gain` = `CFG.rounds.tithe.bounty` to within 0.01 at tier 1 and tier 18. Nothing in the claim survives against the current file. (The one thing the fix did NOT do is make the tier bounty reach split children — that is my confirmed finding above.)

- CLAIM 2 ("each mark ... pays more" is false) — REFUTED AS STATED. Its primary evidence no longer exists: arsenal.js:195 does not say `fx: 'Marks a body: each mark hurts it more and pays more.'` It says `fx: 'Marks a body: each mark hurts it more, and all of them pay 3.5x.'`, which is an accurate description of a flat multiplier applied once. And the behaviour is not an oversight to be argued about: shooter.js:739-751 states the design in as many words — a multiplier applied once, with the reason the floor existed at all ("eight marks must not compound to 3.5^8") — and scripts/regress.mjs:13805 pins it. Making the payout ramp with depth, as the claim proposes, would be a balance change to a deliberately flat number, not a bug fix. What genuinely survives is two stale internal comments (config.js:819-820, enemies.js:1446-1447); I have carried those forward as their own cosmetic finding rather than crediting the claim, because the claim's own remedy and its player-facing evidence are both wrong against the current tree.

- CLAIM 3 (nothing raises a SPORE patch's damage; HOLLOWPOINT reaches only 11% of the round) — ALREADY FIXED, in both places the claim named. Commit e863acd is "Build 220, part seven: burning ground takes the damage line, and VOID deletes". shooter.js:643 is now `dps: g.patch.dps * w.up.damage,` under a header at :634-642 that carries the same measurement the claim did ("SPORE went 89 dps to 158 with the whole tree bought, a ladder of x1.78 where every other round in the rack is x4.7 to x19"). THORN's patch was fixed too, and better than the claim proposed: mines.js:634 is `dps: T.patch.dps * world.up.mineDamage,` — the MINE damage line (SHRAPNEL), not the ammo line, which is the correct ladder for a mine and is explained at mines.js:624-632. A regress case went in with it at scripts/regress.mjs:13873+. The claim's own worry about the cap does not land either: config.js:804-814 justifies `cap: 3` explicitly in STOCK terms ("362 damage a second stock against SCATTER's 135 and BOLT's 91"), and those stock numbers are unchanged — 3 x 46 = 138/s stock, as before.

- CLAIM 6 (`Patch.rim()` and `this.edge` have had no caller since build 214) — ALREADY FIXED. Both are gone. patch.js:191-199 is now a tombstone comment in their place: `* \`rim()\` and the \`edge\` array it was the only reader of came out in build` / `* 220. Its docstring said "shared by the fill and the edge", and build 214` / `* replaced both of those layers...`. `grep -n "rim(\|this.edge" src/patch.js` returns nothing but that comment and the `rim` boolean on a speck (:97, :103, :106-107), which is a different thing entirely and is live. The 18 `rand()` draws the claim objected to are gone with it.

- CLAIM 7 (upgrades.js's end-of-file docstring says "`levels` absent means without limit") — ALREADY FIXED. Commit f82b5c8 is "Build 220, part five: the documentation the levels trap keeps being read out of". upgrades.js:800-802 now reads `* **\`levels\` absent means THREE.** \`tree.js\` reads \`u.levels ?? 3\`, and the` / `* only thing that means "without limit" is \`repeat\`. This paragraph said the` / `* opposite for a long time...`, followed by the roll of seven nodes that shipped uncapped and a closing instruction ("Write the number"). It matches tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);` exactly.

- CLAIM 8 (LEVY carries no `levels` and is sold three times, with no note) — REFUTED as a defect. The premise is true and the consequence is not. Verified live: `NODE_BY_ID.get('levy').levels` prints 3, so `up.bounty` reaches 1.5^3 = 3.375. But nothing anywhere mis-states it: upgrades.js:369 `{ id: 'levy', name: 'LEVY', line: '+50% tithe energy mark.', apply: scale('bounty', 1.5), icon: MARK.levy },` sells +50% a level and delivers +50% a level, which is what its card says at each level. It is one of SIXTEEN nodes with no explicit `levels` — hollowpoint, ricochet, overpressure, compound, throughandthrough, sledge, deepfreeze, levy, deepcharge, widemouth, shrapnel, deadweight, hotwire, slew, casing, insulation — every one of them a plain percentage dial for which three is the documented default, and HOLLOWPOINT's own header at upgrades.js:334-336 does the 1.5^3 arithmetic on purpose. The nodes the `levels` trap has actually caught were all nodes NAMED AFTER A COUNT they then overshot (FIFTH LINK making seven jumps, FOURTH BELL, BUCKSHOT's pellets, STANDING ORDER's "-20%" delivering 0.512); LEVY is not that shape. Singling it out of sixteen because its neighbour happened to get a comment in the same commit is a style preference, not a defect. The claim's own text concedes it ("Both are probably intended", "None today, if three is what was wanted").

- CLAIM 9 (the SPORE row says "Three at a time" and stays saying it after SECOND GROWTH) — REFUTED. Every row in arsenal.js describes the UNBOUGHT round, and the suite enforces exactly that: scripts/regress.mjs:13576-13594 pins each row's numbers to bare `CFG` values (`spore: [CFG.rounds.spore.damage, CFG.rounds.spore.patch.dps]`), and :13617-13621 pins the counted sentences the same way — `says('arc', CFG.rounds.arc.jumps)` holds ARC at 4 jumps although FIFTH LINK sells a fifth, and `says('spine', CFG.rounds.spine.pierce)` holds SPINE although THROUGH AND THROUGH sells +2. "10 + 46/s" on the same SPORE row is likewise the unbought number and HOLLOWPOINT now multiplies it. Making "Three at a time" alone reflect an upgrade would make it the one inconsistent row in the file. One true observation buried in the claim, which is not the claim: the count is spelled as a word, so `says('spore', CFG.rounds.spore.patch.cap)` cannot be added without rewriting the string, and `patch.cap` is the only quoted count in the table that nothing pins. That is a test-coverage gap worth closing (change the row to "3 at a time" and add the assertion), not a defect in the game.

- claim 3 (pips draws 7 marks for SNARE's 5) — ALREADY FIXED in the working tree, and the fix is the one the claim proposes. There is no `Math.round(gr * (m.kind === 'spall' ? 8 : ...))` anywhere in mines.js. The denominator was extracted into `tally(world, kind)` (mines.js:110-162), which returns `{ has, of }`; `mineGrade` (164-166) is the ratio and `mineMarks` (169-171) is the numerator, and `drawMines` reads mines.js:855 `    const pips = mineMarks(world, m.kind);`. The docstring at mines.js:99-108 records the exact defect claimed, in the past tense: "`drawMines` was reconstructing it as `round(grade * denominator)` off a denominator written out by hand -- `spall ? 8 : blast || thorn ? 6 : 7` ... It disagreed for six of the eight kinds, so a SNARE with five upgrades available drew seven marks and a WIRE with one drew two. There is one denominator now and it is this one." Verified for SNARE: `mouth = !!S.trigger` (34) is true, `bang` false, `hurts` false, so `of = 2 + 1 (SALTED) + 1 (mouth) + 1 (own: deadweight) = 5` and `pips = has <= 5`. The reader's own table of `of` values matches `tally` exactly — they audited a revision behind HEAD (their line numbers run ~25 low throughout).

- claim 9 (`mineScale` is exported with no caller) — ALREADY FIXED, same refactor. mines.js:854 reads `    const R = m.r * mineScale(world, m.kind);` under the comment at mines.js:852-853: "Through `mineScale`, which existed and had no caller: this restated its arithmetic inline, so the exported one was dead and the two could drift." The duplicated 0.26 literal the claim objects to exists in exactly one place, mines.js:178.

- claim 5 (mineGrade credits SALTED to SNARE but not DEEP CHARGE / SHRAPNEL) — the premise is quoted from the stale half of a stacked pair of comments, and the proposed fix would make a mine SHRINK when you buy an upgrade. The comment the claim cites (mines.js:126-132, "read in exactly three places") is superseded by the one directly above the line it describes, mines.js:133-135: "SHRAPNEL is `up.mineDamage`. It is read by `detonate`, `fizzle`, `toll`, SPALL's pellets and their bursts, and -- since build 220 -- THORN's ground", and the code matches THAT: mines.js:136 `  const hurts = bang || kind === 'thorn';`. More decisively, the denominator is deliberately a property of the KIND and not of the build, and the claim's fix (`if (bang || up.mineFizzle)`) makes it a property of the build: a SNARE owning PAIRED CHARGE, QUICK LAY, WIDE MOUTH and DEAD WEIGHT reads 4/5 = 0.80 today; under the fix, buying SALTED takes it to 5/7 = 0.714, so `mineScale` (mines.js:175-179, `1 + grade * 0.26`) drops from 1.208 to 1.186 and the mine gets visibly smaller the moment you buy something for it. A conditional denominator is a worse readout than the one-directional understatement it removes, and the reader concedes as much ("arguably worse"). The stacked stale comment at 126-132 is real doc drift and is folded into my README/doc-drift finding.

- claim 8 (detonate's ring crosses the blast radius dimmer than the version it replaced) — the arithmetic is right and the conclusion is not a defect. Verified: `ring(x, y, r0, r1, life, color, w)` (fx.js:235-243) sets `vr = (r1-r0)/life`, and `drawFx` strokes at `ctx.strokeStyle = rgba(g.color, t * 0.95)` / `ctx.lineWidth = Math.max(0.4, g.w * t)` with `t = g.life/g.max` running 1->0 (fx.js:576, 586-587). mines.js:301 `ring(m.x, m.y, br * 0.78, br * 1.06, 0.4, '#ffb347', 5)` reaches `br` at elapsed (1-0.78)/(1.06-0.78) = 0.7857, i.e. t = 0.214, alpha 0.204, width 1.07px — the reader's numbers to three digits. But the true radius is not left to that ring: mines.js:303 `world.effects.push(new Shock(m.x, m.y, br, '#ffb347'));` opens to exactly `br` over 0.3s and holds `a = 1` until t = 0.70 (fx.js:46-52, `left = clamp((this.life - this.t) / 0.45, 0, 1)` with `life = 1.15`), stroked at 0.75 alpha, 2.4px, dashed and turning, with four axis ticks — so `br` is marked at full brightness for roughly four tenths of a second against the ring's 1/50th-second crossing. The pairing is systematic, not lucky: every expanding ring in the file has a Shock on the very next line (301/303, 411/412, 573/574) and the only two rings drawn contracting are exactly the two with no Shock behind them (`snap`, mines.js:318, and SPALL's per-pellet burst, mines.js:469, where 36 Shocks would be the clutter the comment there says it is avoiding). The comment's own headline is "At the radius, not half again past it" — the overshoot, which the change did fix (1.5br -> 1.06br). The reader states the player-visible consequence is nil and that "the defect is in the claim, not the picture"; by this audit's own rule that makes it a note, not a finding.

- claim 4's headline ("DEAD WEIGHT is sold three times", framed as an instance of the `levels ?? 3` trap) — true as arithmetic, not a defect in itself. DEAD WEIGHT is one of FIVE uncapped percentage dials in the FIELD branch (upgrades.js:454 DEEP CHARGE, 455 WIDE MOUTH, 460 SHRAPNEL, 461 DEAD WEIGHT, 462 HOT WIRE), and three levels is the acknowledged value for them elsewhere in the codebase: mines.js:407-408 reasons about "At three DEEP CHARGEs the blast reaches 236" and mines.js:631 records BLAST's SHRAPNEL ladder as x3.10 (1.45^3 = 3.048). The tree's level TOTAL is pinned at 134 by regress.mjs:495 with a fifteen-line changelog above it, and that 134 includes these three. The seven nodes CLAUDE.md and upgrades.js:801-812 list as having shipped uncapped by ACCIDENT are all named after the number they were supposed to produce (FIFTH LINK, FOURTH BELL, PAIRED CHARGE, TRIPLE TAP) or contradict their own row text (STANDING ORDER's "-20%" at 0.8^3); DEAD WEIGHT's row says "+65% snare hold time" and is silent on how many times, exactly like its four siblings. The README row it is measured against (README.md:250) is one of four rows in a table where EVERY row is one-level-stale — BLAST 105 not 95 and 320 not 138, WIRE 79 not 72 and 267 not 108, KNELL 4 tolls not 3 — so nothing about that row is specific to DEAD WEIGHT. What does survive from claim 4 is the second consequence, the hold outliving `life`, which I have confirmed above as its own finding and which holds at one level as much as at three.

- claim 12 (the drawn grip circle lags the reach) — the claim itself concludes "None needed", so there is no defect to confirm, and one of its two numbers is wrong. With `m.open += ((m.gripping ? 1 : 0) - m.open) * clamp(dt * 7, 0, 1)` (mines.js:564) at dt = 1/60 the per-frame factor is 7/60 = 0.11667 and `open_n = 1 - 0.88333^n`. After 6 frames that is 1 - 0.4751 = **0.525** (circle at 110 units), not the 0.47 the claim reports — 0.4751 is 0.88333^6, the remaining GAP, taken from the wrong side. (The 19-frame figure, 0.905, is right.) In any case the reach is announced correctly twice on the frame it opens: `snap`'s ring is `ring(m.x, m.y, S.reach, m.r * 2, ...)` (mines.js:318), drawn contracting from a full-brightness 210, and the wire bundle at mines.js:760-767 is tested against the full `S.reach` from frame one. Nothing here is wrong with the game.

- claim 3 (the drawn wire is shorter than the cutting wire during the 0.55s unspool) — ALREADY FIXED in the working tree, in exactly the form the claim proposes, and the fix carries the claim's own reasoning. src/mines.js:537-540: `  const mx = (m.ax + m.bx) / 2;` / `  const ax = mx + (m.ax - mx) * m.open;` / `  const bx = mx + (m.bx - mx) * m.open;`, and the sweep on the next lines uses them: `      const hit = segClosest(ax, m.ay, bx, m.by, e.x, e.y);` (mines.js:545). The header directly above at mines.js:530-536 states the defect and its measurement verbatim: 'm.open ramped the WIDTH and nothing else, so the line cut its whole 300-unit span from the first frame while being drawn creeping out of the middle over W.open -- 0.55 seconds -- and on the first frame drawn at no length at all. A body 140 units from the spool was cut by a wire that was not there yet. Same lerp as the draw, off the same open.' The draw at mines.js:806-809 computes the identical `mx`/`ax`/`bx`. It landed in commit 332fb3b, 'Build 220, part eight: a WIRE cut where it was not yet drawn, and PILE paid the fade'. The claim's cited lines (483, 488, 536, 725-727) are stale by ~50 lines; the reader was auditing a tree that no longer exists. (I checked the inverse mismatch that survives — `reach = W.width * m.open` at mines.js:529 ramps the half-width while the drawn stroke widths are constant with only alpha ramping — and it is not worth a finding: W.width is 8 units against `rr = reach + e.r` with body radii of 10-45, so the ramp moves the contact band by at most a sixth of its size, in the direction that draws more than it cuts.)

- claim 4 (the upgrade collar draws more marks than the mine carries: WIRE two for one, KNELL seven for six) — ALREADY FIXED, and the fix is the exact one the claim asks for. The hand-written per-kind denominator is gone: src/mines.js:855 now reads `    const pips = mineMarks(world, m.kind);`, and `mineMarks` is `export function mineMarks(world, kind) { return tally(world, kind).has; }` (mines.js:170-172) — the numerator itself, not a ratio restated against a constant. `tally` (mines.js:109-161) returns `{ has, of }` and `mineGrade` (mines.js:164-167) is now the ratio over the same computation. The claim's proposed fix is 'have mineGrade also expose its denominator (return { has, of }) … and draw has marks'; that is line-for-line what is in the file. The header at mines.js:97-107 even records the claim's own numbers: 'drawMines was reconstructing it as round(grade * denominator) off a denominator written out by hand -- spall ? 8 : blast || thorn ? 6 : 7 -- against the one this function actually computes. It disagreed for six of the eight kinds, so a SNARE with five upgrades available drew seven marks and a WIRE with one drew two. There is one denominator now and it is this one.' I re-derived WIRE's denominator independently (mouth false — CFG.wire has no `trigger` key, config.js:1058-1067; bang false; hurts false; so of = 2 + 1 + 1 = 4: PAIRED CHARGE, QUICK LAY, SALTED, HOT WIRE) and it matches the claim, but there is nothing left to fix.

- claim 5's headline (`CFG.mines.cap` cannot be reached, so `retire()` is dead code in play) — REFUTED on two independent grounds, though a residue survives and I have confirmed it separately. (1) The behaviour is authored, deliberately, with a stated reason and a measurement, in the docstring of the very node that made it so: src/upgrades.js:429-439, 'ONE level, because the mine cap eats the rest. … Uncapped this node laid FOUR mines a throw against a fully bought QUICK LAY interval of 8.4 seconds and a 15-second life -- measured, two throws put eight on the field and left five, so three were retired before they had armed. The player pays for the third level and watches it evicted. At one level a throw lays two, two throws leave four, and the cap is still the backstop it was authored as.' A backstop the common case does not reach is what a backstop IS; config.js:1013-1016 calls `cap` 'a contract with the player rather than a balance dial: nothing may move it', which is a ceiling, not a promise that play presses against it. Reporting a deliberately unreached ceiling as a dead number is the `s.locked` shape inverted. (2) The claim's occupancy model is wrong, and its simulation inherits the error: it assumes every kind lives `flight + M.life`, but SNARE does not. In `updateMines` the arm `} else if (m.gripping) {` (mines.js:670) sits ABOVE `} else if (m.life <= 0) {` (mines.js:679) while `m.life -= dt` (mines.js:615) runs unconditionally, so a gripping snare skips the life check entirely and lives flight + grip-time + `S.hold * up.mineHold` — 10.78s of hold at DEAD WEIGHT's three tree levels (2.4 * 1.65^3; upgrades.js:461 has no `levels` and I confirmed the tree's number by import). A snare gripping at settle 10s is on the field 21.7s, past the 16.875s three throws span, which puts six mines down against a cap of 5. Even at base hold the ceiling is 18.3s, still past it. Nothing else can kill a gripping snare: `.life` appears only at mines.js:194, 615, 623, 638, 655, 659, 668, 679. So `retire` is reachable. The claim's two genuine observations — that `retire` gives WIRE (and THORN, LODE, VOID) nothing against its own docstring, and that the SEED comment names a caller that does not exist — are real, and I have confirmed both above rather than dismissing them with the headline.

- claim 7 (a body killed by the WIRE wears the wrong death, or none) — the facts are right and the verdict is a design preference, the same shape as this audit's already-refuted 'RIME, SPORE and TITHE have no muzzle arm'. `cut` does not set `lastHit`, correctly observed. But WIRE is not being singled out by anything: the complete set of `lastHit` writers is enemies.js:1071-1072 (the projectile path, `this.lastHit = form;`), patch.js:184-185 (`e.lastHit = 'pod';`) and projectiles.js:239-240 (`best.lastHit = 'arc';`) — so no mine blast, no KNELL toll, no SPALL pellet burst, no VOID swallow, no PULSE, no PRISM, no LANCE, no WELL and no SPINES sets one either. `deathFx` (fx.js:360) switches on round FORMS — flake, shell, arc, dart, slab, pod, tithe — and `Enemy.destroy` describes it as exactly that: 'the death wears what killed it, if the kill is fresh: frozen through, burned out, earthed, bisected, crushed, gone to spores, or paid in full' (enemies.js:1283-1286). That is an enumeration of round identities, not a promise of universal coverage, and every death already gets the universal `explode(this.x, this.y, this.r, t.color, t.glow, …)` at enemies.js:1282. The 'wrong death' half is likewise not WIRE's: the 0.5s freshness guard at enemies.js:1288 is the authored answer to a stale tag, it applies identically to a body finished by a KNELL toll 0.4s after a SPINE hit, and the same header names that case as the reason the window exists ('a body tagged by RIME a while ago and finished by a PULSE did not die of ice'). Giving the wire a death form is a legitimate polish ask; it is not behaviour contradicting a stated claim.

- claim 8 (`mineScale` is a dead export with no caller, and drawMines inlines the same expression) — ALREADY FIXED, and by the caller the claim asks for. src/mines.js:854 reads `    const R = m.r * mineScale(world, m.kind);`, under a comment at :852-853 naming the claim's own reasoning: 'Through `mineScale`, which existed and had no caller: this restated its arithmetic inline, so the exported one was dead and the two could drift.' `grep -rn mineScale src/ scripts/ *.html` now returns four lines: the definition at :175, its body at :178, the comment at :852 and the call at :854. The 0.26 has one home. Nothing to do.

- ALSO CHECKED AND FOUND CORRECT (not a claim; recorded so the next audit does not re-report it): (a) `cut`'s guard is right per the CLAUDE.md rule — mines.js:544 `      if (e.dead || e.spent || e.harmless) continue;` — a damage path honouring `spent`, skipping `staged`, and leaving `fizzle` alone exactly as `applyBlast` does; the neighbouring steering paths correctly do the opposite (`grip` at mines.js:344 and `repel` at mines.js:513 both test `e.dead || e.spent || e.fizzle`, and the trigger CHOOSER at mines.js:691 correctly adds `staged`). (b) KNELL's toll goes through `applyBlast`, which honours `spent` (enemies.js:4515). (c) Neither ring in this code has the fade-and-thin fault: `toll` draws `ring(m.x, m.y, r * 0.76, r * 1.06, 0.42, '#ff61f2', 4)` (mines.js:576) and `fizzle` draws `ring(m.x, m.y, fr * 0.72, fr * 1.06, 0.32, '#ffb347', 3)` off `fr = f.r * world.up.mineBlast` (mines.js:401-402) — both land at the damage radius and both take the DEEP CHARGE scalar the blast takes. (d) WIRE's drawn extent matches its damaging extent for length (see refuted claim 3) and its widest drawn pass, `W.width * 2` = 16 across, matches the 8-unit contact half-width. (e) The knell's countdown arc and per-toll marks (mines.js:857-874) read `m.tolls`, the snapshot, so they cannot disagree with the mine even under the index bug above. (f) `up.wireDamage` has exactly one consumer (mines.js:552) and HOT WIRE's row '+50% wire damage' is per-level accurate at the tree's three levels. (g) One thing I noticed and deliberately did NOT report: `tally` does not credit DEEP CHARGE or SHRAPNEL to WIRE/SNARE/LODE/VOID, yet with SALTED owned `fizzle` scales its blast by both (`r: f.r * world.up.mineBlast, damage: f.damage * world.up.mineDamage`, mines.js:399-400). That is the inverse of the fault the docstring names ('a mine that grew because of something it cannot use'), it is conditional on a node the tally has no way to make the denominator depend on, and crediting it would make `of` vary with ownership and break the ratio. Worth a decision, not a defect.

- Claim 1 (high) — "THORN and LODE never leave world.mines; their `continue` jumps past the splice". REFUTED: fixed in the working tree at commit cf9f65b, "Build 220, part four: a spent THORN or LODE went off sixty times a second, for ever" (tree is clean, HEAD 5d3f2a3). There is no `continue` in either arm: mines.js:617 `if (m.kind === 'thorn') {` and :653 `} else if (m.kind === 'lode') {` are arms of the same else-if chain the other six kinds are in, and mines.js:642-652 is a comment recording the exact fault the claim describes ("...and NO `continue`. This branch and LODE's below it both ended on one"). The splice at mines.js:718-721 is reached by all eight kinds. Measured on the current files (stub world, real throwMine/updateMines, dt 1/60, 25s against a 15s life, SALTED owned): world.mines.length 0 for blast, thorn, lode, wire, knell, snare, spall and void — the claim's "thorn in list after 40s: 1, dead=true, life=-24.1" does not reproduce. Its three consequences follow it: `drawMines` cannot draw a ghost that is not in the list, `repel` cannot push after death because the lode arm is spliced in the same iteration that kills it, and `fizzle` cannot be re-entered. The 6-space indent at mines.js:614 the claim cites as its tell is still there and is cosmetic.

- Claim 2 (high) — "`fizzle` has no idempotence guard, so an expired THORN or LODE fires SALTED's blast sixty times a second". REFUTED: the guard is present, with a comment naming this defect. mines.js:388-396: `function fizzle(world, m) {` ... `389: /* Once. It sets `m.dead` on its first line and had no guard reading it, so 391: anything that could call it twice got two blasts -- and THORN and LODE 392: could call it every frame forever. */` `395: if (m.dead) return;` `396: m.dead = true;`. Measured with `audio.boom` counted over 25s per kind, SALTED owned: 1 boom for blast/thorn/lode/wire/snare/spall/void and 2 for knell (its two tolls, then no fizzle because `!m.dead` at :668 is false). Not 546. The arithmetic built on top of it (40 blasts a frame, 351,360 damage a second, 240 grey sparks a frame) has no premise left.

- Claim 3 (medium) — "a THORN retired by the cap keeps its burning ground, and a THORN killed before it lands still lands and opens". REFUTED as stated, in both halves. (a) The flight half is simply false. The `!m.landed` arm (mines.js:601-612) does end on `continue`, so a dead mine is not spliced DURING flight — but it lands within `cfg.flight` (0.9s), and on the next frame it falls through to :614 with `m.settle` = one frame (0.0167s) against `T.arm` = 0.5 (config.js:901), so `!m.patch && m.settle >= T.arm` at :620 fails and the bottom-of-loop splice at :718 removes it before it can ever arm. Measured (set `m.dead` the frame after `throwMine`, which is exactly what `retire` does at :379, then run 3s): in list 0, patches opened 0. The claim's "landed true, patch opened: true, patch alive: true" does not reproduce. (b) The cap half is true as code — `retire` (mines.js:377-385) has no thorn arm and never touches `m.patch` — but its measurement requires reaching the cap, and the cap cannot be reached: peak on-field is 4 of 5 (measured over 300 simulated seconds at the fastest cadence the tree sells, and asserted by scripts/regress.mjs:13554-13557), while the only other caller of `throwMine` is a debug panel that offers no THORN or LODE button (hud.js:1553-1556). So "ten patches at 37 dps each on a field whose mine cap is five" is not a state the game can enter. I have carried the latent code gap, with the forced measurement (6 patches against 5 mines) and a fix, into a confirmed finding of my own rather than leaving it as a claim about play.

- Claim 4 (medium) — "the pip collar over-reports: THORN draws six marks for four buyable upgrades, LODE seven for four". REFUTED: fixed. The hand-written denominator the claim quotes (`m.kind === 'spall' ? 8 : ... ? 6 : 7`) no longer exists; mines.js:97-107 is the comment recording its removal ("It disagreed for six of the eight kinds... There is one denominator now and it is this one"). `drawMines` now reads the numerator from the same function that computes the denominator: mines.js:855 `const pips = mineMarks(world, m.kind);`, and `mineMarks` (:170-172) returns `tally(world, kind).has`. Measured with exactly one node owned, every kind draws exactly one mark: blast 1 of 6, snare 1 of 5, wire 1 of 4, knell 1 of 6, thorn 1 of 5, lode 1 of 4, spall 1 of 8, void 1 of 5. The claim's "THORN of = 4" is stale too — it is 5, because SHRAPNEL is now credited to THORN at mines.js:135.

- Claim 6 (low) — "`mineScale` is an exported function with no caller, and `drawMines` restates its arithmetic inline". REFUTED: fixed, and the fix carries the claim's own reasoning. mines.js:852-854: `// Through `mineScale`, which existed and had no caller: this restated its` / `// arithmetic inline, so the exported one was dead and the two could drift.` / `const R = m.r * mineScale(world, m.kind);`. The 0.26 is now written once, at mines.js:178.

- Claim 7 (low) — "`Patch.rim()` and the `edge` array are dead code". REFUTED: already removed. patch.js:191-199 is the comment recording it — "`rim()` and the `edge` array it was the only reader of came out in build 220... The `windAt`/`rateAt` shape CLAUDE.md records". Neither the method nor `this.edge` exists in the file; the constructor runs from `this.dark` (:80) straight to `this.specks` (:96), and there is no `Array.from({ length: 18 }, ...)` anywhere in it.

- Claim 8 (low) — "LODE pushes `world.enemies` only, not `world.drops`, where SNARE and WIRE take both". REFUTED as a defect, though the code reads as described (mines.js:511 against grip's :340-341 and cut's :553-554). The claim's own consequence line says the behaviour is the desirable one and asks only for a text edit, which makes it a wording preference, not a fault. And the wording is defensible: arsenal.js:127 `fx: 'Shoves everything near it away, and keeps on shoving.'` sits in a table of one-line contrasts — its neighbours read "The first thing to touch it is gone" and "It cuts what crosses" — so "everything" is contrasting with what triggers a mine, not enumerating world lists. Nothing is stranded either way: `applyBlast` takes `hit(world.drops)` (enemies.js:4551) and loose energy drifts turret-ward on its own (`CFG.energy.pull`). No player can observe a LODE failing to move a mote.

- Claim 9 (cosmetic) — "LODE and SNARE push grey `harmless` bodies where WIRE and the trigger test refuse to". REFUTED: the premise that grey is exempt from being moved is not a rule this game has. `applyBlast`, the game's main area effect, has no harmless guard at all — enemies.js:4515 `if (e.dead || e.spent || e === source) continue;` — so a PULSE both damages and shoves DRIFT. The contract at config.js:2565-2568 is explicitly about what grey does to YOU ("it cannot touch the turret, it cannot corrupt the feed") and names `Game.checkContact()` as its enforcement, not the physics. The asymmetry the claim finds unexplained is the CLAUDE.md rule applied correctly: `cut` (mines.js:562) is a damage path and skips harmless; the trigger test (:707) is a chooser and skips harmless plus `staged`; `repel` (:513) and `grip` (:334) only write velocity and skip `spent` and `fizzle`. The claimant states there is no consequence and there is none.

- Checked and found correct (not a claim — recorded so the next audit can skip it). THORN's patch is seeded `life: m.life` at arm (mines.js:623) and both clocks then take the same dt, so ground and mine end on the same frame — `if (m.patch) m.patch.dead = true` at :640 is belt-and-braces, not what keeps them in step. LODE's drawn reach ring uses the identical expression `repel` does (`L.reach * world.up.lodeReach`, :509 vs :774), so picture and push agree; REPULSOR scales reach and push together (upgrades.js:505, `levels: 2` -> 1.96 each) and `tally` counts it once (:158 `lode: [up.lodeReach > 1]`). THORN's ground takes the damage line (:632 `dps: T.patch.dps * world.up.mineDamage`) and SHRAPNEL is credited for it (:135). `Patch.update` skips `dead || spent || harmless` and not `staged` (patch.js:180) — a damage path, correct per the CLAUDE.md rule. `mineCadence` and `updateMines` are called outside game.js's `if (w.boss) { ... } else { director.update() }` (game.js:1513-1517), so mines do not freeze during a fight. `toggleMine` deliberately does not touch the throw clock (game.js:1156-1170), so tapping through the strip cannot buy a free mine. No `export let`/`export var` in mines.js or patch.js. Every mine kind's damage/trigger reach is drawn at the radius it acts at (the trigger ring at :898 uses the same `m.r + cfg.trigger * up.mineTrigger * own` as the test at :687), and both mine rings authored in build 220 are drawn contracting rather than expanding past the blast (:288-296, :403-410), so the "a ring fades and thins as it grows" trap is not present here.

- CLAIM 1 (high) — "ARMORED absorbs VOID's swallow in full; the mine is spent and the body is untouched." ALREADY FIXED in the working tree, and the quoted line does not exist. The reader cites `mines.js:455 — e.applyDamage(world, e.hp + 1e6, 0, 0, 0);`. There is no such line anywhere in the current mines.js. `swallow` now ends at mines.js:500-501 with `  e.hp = 0;` / `  e.destroy(world);`, under an 11-line comment at :489-499 that names exactly this fault ("No amount of damage can beat a rule that discards the hit; the answer is not to send a bigger number through the same door but to use the other one"). CLAUDE.md line 571-576 already records it as fixed, and commit e863acd is titled "Build 220, part seven: burning ground takes the damage line, and VOID deletes". MEASURED (playwright, VOID armed, LURCHER pinned on it, `e.traits = [TRAIT_BY_ID.armored]` from src/traits.js): plain hp 192 -> 0, dead, drops +8, kills +1 | armored with the plate UP (plateT 0) hp 194 -> 0, dead, drops +8, kills +1 | armored with the plate down (plateT 5) hp 181 -> 0, dead, drops +8, kills +1. Instrument check that ARMORED is still live and still discards: an ordinary 50-damage hit on the same body goes 189 -> 189 (discarded, plateT set to 1), and the next one goes 189 -> 139. So the trait works and VOID goes around it.

- CLAIM 3 (medium) — "A VOID deletes a live boss core outright, in one frame, from a randomly-placed mine." ALREADY FIXED, in the same commit. The trigger loop now carries a fifth guard the reader's quote omits: mines.js:708 — `          if (m.kind === 'void' && e.type.fixed) continue;` — under a comment at :700-707 that gives the reason ("Everything else here does damage, which a boss can be built to survive; this one cannot be survived"). MEASURED, an armed VOID pinned on the core with `b.arriving = 0; b.settle(w)`: ORDINAL 1784 -> 1784, GNOMON 1548 -> 1548, FRACTAL 8020 -> 8020, AMPLITUDE 3243 -> 3243, DYNAMO 3912 -> 3912, PARITY 8048 -> 8048, TERMINUS 7640 -> 7640 — every core alive, `coreDead: false`, and `mineDead: false`, so the mine is not even spent. Two checks that the fix is correctly scoped rather than over-broad: (a) all 14 `fixed` types are boss bodies (tally, ordinal, dial, gnomon, fraction, fractal, crest, amplitude, pylon, dynamo, pane, parity, bound, terminus) and the other 23 types are not, so no ordinary body lost VOID; (b) `continue` skips the body rather than the frame, and a non-fixed boss MINION spawned next to the same mine is still swallowed (dead: true, mineDead: true). The one thing the fix left undone is the player-facing row, which I have raised separately as a confirmed finding of my own.

- CLAIM 4 (low) — "VOID's pip collar draws seven marks for five upgrades; a hardcoded 7 against a computed `of` of 5." ALREADY FIXED. The quoted line — `const pips = Math.round(gr * (m.kind === 'spall' ? 8 : ...))` — is gone. `mineGrade`'s body has been split into `tally(world, kind)` at mines.js:109-160, which returns `{ has, of }`; `mineGrade` (:163-166) returns `has / of`; a new `mineMarks` (:169-171) returns `tally(world, kind).has`; and the draw site at mines.js:855 reads `    const pips = mineMarks(world, m.kind);`. The header at :98-107 records the exact defect the reader describes, in the past tense ("It disagreed for six of the eight kinds, so a SNARE with five upgrades available drew seven marks and a WIRE with one drew two. There is one denominator now and it is this one"). MEASURED, buying the FIELD branch one node at a time and reading `mineMarks` after each: void 0,1,2,2(quicklay maxed),3,4,4,4 and spall 0,1,2,2,3,4,4,4,5,5,5,6 — one mark per owned upgrade, exactly, on all eight kinds.

- CLAIM 5 (low) — "SPALL's trigger mouth is a full circle; its fan is a 51.6deg cone, and the drawn mouth says otherwise." The mechanic is real and I reproduced it, but it is authored deliberately, stated in config, AND disclosed to the player in as many words — so it is a design preference, not a defect. config.js:917-920: `   * SPALL. A claymore. It triggers like a BLAST but throws everything it has` / `   * in one direction instead of all of them — straight up the field, into` / `   * whatever is coming down it.` "Triggers like a BLAST" is an explicit statement that the mouth is omnidirectional; "in one direction" is an explicit statement that the fan is not. arsenal.js:130-131, the card the player actually reads, says `fx: 'Throws a wall of shot straight up the field on contact.'` — both halves again, in the player's own words. The dashed ring is a promise about where the mine will CATCH something (its own comment, mines.js:876-881) and it catches at every bearing, which is accurate. MEASURED for completeness (WARDEN r 22 pinned at d = 62, spin 0, nine bearings): -90deg 463 damage, -60deg 132, -45deg 33, -30deg 0, 0deg 0, +45deg 0, +90deg 0, +135deg 0, +180deg 0 — and `fired: true` at all nine. The falloff is the body's own angular half-width atan(22/62) = 19.5deg meeting the cone edge at -90 +/- 25.8deg, which is the arithmetic agreeing with itself rather than a defect. Note also that waves march down from the top toward a turret at the bottom, so the fan points at where bodies come FROM: the common case is the one that works. What is genuinely wrong here is the wedge, confirmed separately as claim 2 — that is a picture contradicting a stated rule, where this is a rule the game states twice.

- CLAIM 9 (cosmetic) — "SPALL draws a 150-unit expanding ring for a mine that has no radial damage at all... 2.4x the largest real number in the mine and 5.8x the authored one." The arithmetic is wrong, and wrong in the direction that reverses the conclusion. The reader inventories SPALL's numbers as "trigger mouth 30, pellet burst 26, or 62.47 with SPLINTER" and omits the fan's own travel, which is the mine's dominant dimension: config.js:927 `    speed: [900, 1240],` against `life: 0.85` at mines.js:432, i.e. 765-1054 units nominal. MEASURED, tracking every pellet of one fan to its farthest point from the mine: 1,011 units. So the ring at mines.js:473 — `  ring(m.x, m.y, m.r, 150, 0.3, '#ff4d4d', 3);` — reaches 15% of the distance the mine's shot actually covers. It under-states the mine's reach; it does not over-state it, and it is nowhere near "2.4x the largest real number". The ring's own decay numbers the reader gives are correct (fx.js:238 `g.vr = (r1 - r0) / life;` = 460 u/s; fx.js:586-587 `rgba(g.color, t * 0.95)` and `Math.max(0.4, g.w * t)`, so radius 75 at t 0.543, alpha 0.516, width 1.63px) — but a bright flash at the seat that dies inside a third of a second, well inside a fan that goes ten times further, is not the CLAUDE.md "ring authored to expand INTO a damage radius" trap. There is no damage radius here for it to fall short of. The reader flags their own uncertainty on this one and the uncertainty was warranted.

- CLAIM 6 (low), the FRAMING only — "`retire()` cannot run in shipped play... the `world.endless` shape CLAUDE.md records: a path nobody can take." The premise is right (I confirmed the cap is unreachable by measurement) but the diagnosis is not. CLAUDE.md's rule is about a flag NOTHING CAN SET, whose readers therefore have a permanently dead branch. This is a backstop that the author deliberately kept out of reach and said so, in the note on the very node that would otherwise breach it: upgrades.js:428-438, PAIRED CHARGE, `     * ONE level, because the mine cap eats the rest.` ... `     * At one level a throw lays two, two throws leave four, and the cap is` / `     * still the backstop it was authored as.` — 4 of 5, written out, with the measurement that produced it ("Uncapped this node laid FOUR mines a throw... two throws put eight on the field and left five"). A ceiling with one unit of margin, documented as such, is a safety net, not dead code; deleting it is how the next node that lays a third mine per throw ships unbounded. The three concrete sub-defects inside it (the SEED comment, `retire` not fizzling, `find` not picking the oldest) do stand and are confirmed separately.

- CLAIM 7 (cosmetic) — "`mineGrade`'s comment names three readers of `up.mineDamage`; there are four, and two of them are SPALL." Superseded, and the count is wrong in both directions. The comment the reader quotes still exists at mines.js:124-131, but a corrected one has been added immediately below it at :132-134 naming detonate, fizzle, toll, SPALL's pellets and their bursts, and THORN's ground. And the true count is not four: `up.mineDamage` is read at mines.js:291, :401, :435, :441, :566 and :633 — six reads in five functions. The reader's proposed fix ("Say five reads in four functions") would install a third wrong number. The live defect here is not the count but that the superseded block was never deleted, raised separately as a confirmed finding of my own.

- ALSO CHECKED AND FOUND CORRECT (short OK list, so the next audit does not re-report these). (a) `tally`'s exclusions are right per kind: `mouth = !!KIND[kind].trigger` (mines.js:121) correctly excludes THORN and LODE, which have no `trigger` key; `bang` (:122) covers blast/knell/spall, which are the three that read `up.mineBlast`; `hurts = bang || thorn` (:135) matches the six `up.mineDamage` reads. Denominators: void of=5, spall of=8, blast of=6 — all matching the measured mark counts. (b) The `spent`/`staged`/`fizzle` split is right in all four mine paths and matches the CLAUDE.md rule: `grip` (:337) and `repel` (:508) are steering and test `dead || spent || fizzle`; `cut` (:544) is damage and tests `dead || spent || harmless` with no `staged`; the trigger loop (:695) is a chooser and correctly DOES test `staged`. Each carries a comment saying which it is. (c) The SPALL pellet burst ring at :465 is drawn CONTRACTING (`ring(x, y, br, br * 0.4, ...)`), brightest at the radius that hurts — the correct form; likewise detonate at :300-301, fizzle at :407, toll at :572. (d) `fizzle` reads `f.r * world.up.mineBlast` for both the blast and the ring (:400, :406), so picture and damage share one number. (e) The trigger mouth is drawn from the same expression the trigger uses, EVENT HORIZON and WIDE MOUTH included (:687 vs :888). (f) No `export let`/`export var` in mines.js. (g) No bare `ctx.globalAlpha = 1` in mines.js; the one alpha manipulation in drawFx's ring path (fx.js:578-582) multiplies in and puts back. (h) `mineMarks`, `mineGrade` and `mineScale` are all live — no dead exports.


## Never adjudicated — the three passes that did not run


The tree, machine and picture readers' claims below have no second opinion on
them at all. Some are certainly wrong: of the nine passes that did run, four
of the eleven refutations were "already fixed" and three were design
preferences dressed as defects. Treat these as leads, not findings.


### TREE audit — the ROUNDS and MINES branches (src/upgrades.js, src/tree.js) and every world.up key they write or read

- **[high] SPORE's burning ground takes no part of the AMMO damage line — the ARC fault, one round over**  
  `/home/user/Shooter/src/shooter.js:660; /home/user/Shooter/src/patch.js:172; /home/user/Shooter/src/upgrades.js:343`  
  HOLLOWPOINT — the one node whose whole job is damage, sitting in the ALL ROUNDS group whose line reads "Applies to whatever is loaded, not to one round" — is worth x1.27 on SPORE against a row saying "+50% damage" three times. A SPORE build's only real damage dials are BLOOM OUT and SECOND GROWTH, both of which are placed under SPORE itself; 2,550 energy of HOLLOWPOINT buys it 41 dps out of 155.  
  _Fix:_ `dps: g.patch.dps * w.up.damage` at shooter.js:660. Do NOT do the same at mines.js:566 — THORN's patch is a mine and must keep taking `T.patch.dps` raw, which is exactly what mineGrade's comment at mines.js:113-118 already relies on. A regress case in the shape of the ARC one (assert the ground's SHARE of the round, `patch.dps * cap * interval / damage`, is invariant under `up.damage`) is what stops it drifting back.

- **[medium] DEEP CHARGE has no `levels`, and its unauthored third level puts a fully bought KNELL's last toll wider than the arena**  
  `/home/user/Shooter/src/upgrades.js:454; /home/user/Shooter/src/mines.js:506-508; /home/user/Shooter/src/game.js:855`  
  CFG.knell's own header calls it the mine that "denies the ground" against BLAST which "punishes what walks into it", and the arsenal row says it "Tolls where it lies". Fully bought it clears the arena's whole width four times in 4.6 seconds without being touched. The same node also takes a BLAST mine from 168 to 413.3 units — two thirds of a 390pt field — from a mine that goes off on contact.  
  _Fix:_ `levels: 2` on deepcharge (1.35^2 = 1.8225), the same call build 219 made for REPULSOR ("258 units ... At two it is 184, which is still the widest field any mine makes"). WIDE MOUTH and SHRAPNEL are the other two uncapped ALL MINES nodes and want a decision in the same pass.

- **[medium] upgrades.js's own header says an absent `levels` means "without limit" — the instruction that has now produced seven capped-after-the-fact nodes**  
  `/home/user/Shooter/src/upgrades.js:797-805; /home/user/Shooter/src/tree.js:205`  
  None at runtime. It is the standing instruction that shipped HOT LOAD (193), BUCKSHOT (217), REPULSOR and STANDING ORDER (219), and FIFTH LINK, PAIRED CHARGE and FOURTH BELL (220) — every one of them an author who read this paragraph and wrote no cap. The per-node comments in the same file now say the opposite in five separate places ("tree.js reads `u.levels ?? 3`, so an uncapped node is sold three times whatever the author intended", upgrades.js:344-345).  
  _Fix:_ Rewrite the paragraph to say absent = 3, and say it names a product not a per-level value. `regress.mjs`'s pinned level total (134) catches a node's cap being dropped, but only after the fact and only as one number out of 134; the header is what stops it being written that way.

- **[low] `mineGrade` credits DEEP CHARGE to SPALL, which reads `up.mineBlast` nowhere — the exact fault its own comment says it was rewritten to stop**  
  `/home/user/Shooter/src/mines.js:111, 120, 131; /home/user/Shooter/src/mines.js:388-402`  
  Cosmetic: the drawn size of a SPALL mine. But the whole purpose of `mineGrade` is that the drawn weight is a truthful readout of what the mine can do, and this is one slot in eight lying in both directions.  
  _Fix:_ Drop 'spall' from `bang`, and give the SALTED case its own term the way the SALTED `of++` at mines.js:97 already does — e.g. credit `up.mineBlast`/`up.mineDamage` to every kind once `up.mineFizzle` is owned, and to blast/knell/spall(-damage-only) unconditionally. Also correct the comment at mines.js:113-115: `up.mineDamage` is read in five places, not three (detonate 265, fizzle 368, spall 402 and 408, toll 508).

- **[low] BLOOM OUT is THORN's only dial and sits behind a 900-energy purchase in the AMMO branch, while THORN's own node list is empty**  
  `/home/user/Shooter/src/tree.js:66, 79; /home/user/Shooter/src/mines.js:141, 564`  
  A player who buys THORN and reads the MINES branch sees a mine with nothing to buy for it. The node that widens it 92 -> 167.7 units for SPORE and 104 -> 189.5 for THORN is filed under a round they may never load. tree.js:64-65 acknowledges the sharing ("which is SPORE's and THORN's alike ... It sits under the round because that is the one you meet first") but not the gate.  
  _Fix:_ Either move `bloomout` into the `mines_all` group with a line naming both grounds, or give THORN its own leaf and leave BLOOM OUT to SPORE. If it stays where it is, mines.js:141 should not count it as THORN's own.

- **[low] All six ALL MINES nodes are buyable with no mine owned — 10,000 energy of upgrades that do nothing**  
  `/home/user/Shooter/src/tree.js:74, 272-280; /home/user/Shooter/src/game.js:679-691; /home/user/Shooter/src/tutorial.js:224`  
  A player can spend 10,000 energy on the MINES branch and have laid nothing. Nothing in the row or the panel says the group needs a mine under it.  
  _Fix:_ Gate the `mines_all` group on owning at least one mine — e.g. give the group node an `owns` predicate `available()` can honour — or make the row say so. This is a rule about a category rather than a parent, which is why the parent walk cannot see it.

- **[low] `toll()` re-reads `up.mineTolls` live against a count fixed at lay time, so buying FOURTH BELL mid-peal mis-sizes every knell already on the field**  
  `/home/user/Shooter/src/mines.js:179, 506-508`  
  For up to 15 seconds after buying FOURTH BELL, every knell already down rings one ring too wide and one fade step too weak, and rings the old number of times. Transient and self-correcting on the next throw.  
  _Fix:_ Store the ladder position on the mine — `m.rung = 0` incremented in `toll()` — instead of deriving `i` from a live world value against a snapshot.

- **[low] DEAD WEIGHT lets a SNARE stand for up to 25.8s against a `life` the config calls a contract nothing may move**  
  `/home/user/Shooter/src/mines.js:290, 597-611; /home/user/Shooter/src/config.js:1011-1023`  
  A fully bought SNARE visibly outlives the fifteen seconds the config promises, by up to eleven. Whether that is a fault or the right behaviour (a grip should not be cut off halfway) is a design call — but the contract as written says it cannot happen.  
  _Fix:_ Either clamp `m.hold` to the life remaining, or amend the config comment to say a grip runs past the life by design and name the ceiling DEAD WEIGHT puts on it.

- **[low] OVERSTUFFED's row sells a rebound and a lifetime and quietly hands over four arena ricochets as well**  
  `/home/user/Shooter/src/upgrades.js:374-376; /home/user/Shooter/src/shooter.js:729-731; /home/user/Shooter/src/projectiles.js:63, 154`  
  The row understates the node. Nothing breaks — but a player comparing OVERSTUFFED against RICOCHET is reading a row that omits the larger of the two things it does to the arena edges.  
  _Fix:_ Say it on the row ("+1 rebound, +1 arena bounce, +30% life"), and correct the two comments so `boltBounce` = walls and `boltRebound` = bodies.

- **[low] gunScale's header — the argument for how a bought turret scales a boss — still prices HOLLOWPOINT at 1.25 a level**  
  `/home/user/Shooter/src/shooter.js:42-44; /home/user/Shooter/src/upgrades.js:334-343`  
  None at runtime. It is a wrong number in the paragraph the next person will read before touching boss scaling.  
  _Fix:_ Change 1.25 to 1.5 in the shooter.js header.


### Drawn-vs-done sweep of every round and every mine (build 220 tree, src/projectiles.js, src/mines.js, src/patch.js, src/fx.js, src/shooter.js round paths)

- **[medium] WIRE cuts along its whole 300-unit span from the first frame, while the picture is lerped by `m.open`**  
  `/home/user/Shooter/src/mines.js:512-524 (damage); /home/user/Shooter/src/mines.js:757-774 (drawing); /home/user/Shooter/src/mines.js:566 (the ramp)`  
  For the 0.55s after a WIRE arms, a body up to 150 units from the spool is being cut for 79-267 a second with nothing drawn anywhere near it — the wire visibly has not reached it yet. On the mine whose whole read is "where is the line", the line is in the wrong place exactly while it is being learned.  
  _Fix:_ Lerp the damage segment the same way the picture does — compute `ax/bx` from `mx +/- half * m.open` once and use those in both `cut()` and `drawMines`, or store them on the mine each frame. (Widening the drawn soft pass to `W.width * 2 * m.open` closes the other half.)

- **[medium] ARC's chain jumps into harmless DRIFT, which every other chooser in the game refuses**  
  `/home/user/Shooter/src/projectiles.js:218 (in `chainFrom`)`  
  Fire ARC into a crowd with a DRIFT nearer than the next live body and the chain spends its strongest jump putting 25 into a 39hp grey object, then walks its remaining links out from there. The card says "The hit jumps to 4 more nearby" and the assist will not even aim at the thing it jumps to.  
  _Fix:_ Add `|| e.harmless` to the scan guard at projectiles.js:218, matching abilities.js:537. (`staged` must stay out — this is a damage path.)

- **[medium] PILE pays the repeated-shove fade, so "what is closing gets thrown back" lands at a fifth of its rated impulse under fire**  
  `/home/user/Shooter/src/shooter.js:170-171 (Front.update); /home/user/Shooter/src/enemies.js:1186-1187 (the fade)`  
  A body on the mount while the turret is firing — the only situation PILE was given the mount for — is shoved at 19-35% of 900. It is not thrown back, it is nudged, and the glitch fuse keeps closing. Secondary: PILE also increments `kicked` (by `fade`), so each wave slightly weakens the next round's own knockback.  
  _Fix:_ Pass `true` as the eighth argument to `applyDamage` at shooter.js:171 and delete the hand-written `e.thrown` line above it — `applyDamage` sets `thrown` itself when `throwOff` is true (enemies.js:1190). If PILE is deliberately meant to pay the fade, say so in the comment, because both of its current comments claim only the cap.

- **[low] A patch's rim band — the only thing marking where the burn stops — is erased from a third of the way into its life, while the damage radius never moves**  
  `/home/user/Shooter/src/patch.js:237 and :103 (drawing); /home/user/Shooter/src/patch.js:181-182 (damage)`  
  For the back half of every SPORE and THORN patch, a body standing between the drawn grain and the true radius is burning with nothing under it. There is no other outline — build 214 removed it deliberately — so the rim band is the whole marker.  
  _Fix:_ Either hold the rim band at full extent for the patch's whole life and carry the burn-down timer on alpha alone, or shrink `this.r` with `reach` so the damage follows the picture. Do not do both halves independently.

- **[low] A SLIVER fragment's 0.06s `ignore` is shorter than the chord of the biggest bodies, so it hits and re-splits inside the body it was born in**  
  `/home/user/Shooter/src/projectiles.js:92 (`this.ignoreT = opts.ignore ? 0.06 : 0;`) and :122; /home/user/Shooter/src/shooter.js:290-296 (`ignore: e`)`  
  Firing SPINE with SLIVER dead-centre into a BULWARK or a boss core: the middle fragment re-hits that body once more for its full damage, spends one `pierce` there instead of on what is behind it, and at level 2 draws its split ring inside the body it started in. Small, and the split budget still terminates.  
  _Fix:_ Size the fragment's ignore window off the body it is inside — e.g. `ignoreT = (e.r + p.r) * 2 / speed + 2/60` at the `fire` call in `sliverOn` — rather than the flat 0.06 that `Projectile` gives every ignore.

- **[cosmetic] SPALL draws an omnidirectional 150-unit expanding ring for a mine whose entire effect is a fan up-field**  
  `/home/user/Shooter/src/mines.js:470`  
  A red circle briefly implies SPALL reaches 150 units all round it. The mine card and every other cue say "straight up the field", so the picture reads as a small BLAST for a third of a second.  
  _Fix:_ Replace with a wedge or an arc along the fan — `ring(m.x, m.y, m.r, 150, 0.3, '#ff4d4d', 3, 0, base - P.spread/2, P.spread)` uses the `a0`/`span` arguments `ring` has had since build 211 and costs nothing.

- **[cosmetic] The snare's drawn hold-wires claim parity with `grip` and skip the drops half of it**  
  `/home/user/Shooter/src/mines.js:712-719 (drawing) vs /home/user/Shooter/src/mines.js:353-354 (`grip`)`  
  Negligible visually, and probably the right call (a wire to every mote would be noise). The fault is that the comment asserts a parity the code does not have, which is the shape that hides the next real divergence.  
  _Fix:_ Either draw the drops' wires too, or change the comment to say drops are deliberately left out.

- **[cosmetic] PILE's front carries `staged` on a damage path, and the guard cannot be taken**  
  `/home/user/Shooter/src/shooter.js:130`  
  None today. It becomes a real "blast washes over a body and does nothing" the moment PILE's radius or the turret's standoff moves, and it is a third example of the rule being applied backwards after build 219 fixed three.  
  _Fix:_ Drop `e.staged` from shooter.js:130 and leave `dead / harmless / spent / fizzle`, which is the correct set for an automatic damage path.


### Mine machinery (src/mines.js) and the surfaces that present mines and rounds — arsenal, loadout sheet, quick bar, tree, audio, save, sw.js. Audited against HEAD ff1da74; src/mines.js at md5 d8a6b28 (the `tally`/`mineMarks` split landed on disk during the audit and all line numbers are against that version).

- **[medium] WIRE cuts its full 300-unit span from the first frame, while the line is still drawn unspooling (and on frame one, drawn not at all)**  
  `src/mines.js:513-521 (cut), src/mines.js:566 (open), src/mines.js:757-762 (draw)`  
  For the first ~0.55s of every WIRE, bodies well outside the drawn line lose health, and on the first frame they lose it to a line that is not on screen. The mine's whole selling point in arsenal.js is 'A line across the field. It cuts what crosses' — for half a second it cuts what is nowhere near it.  
  _Fix:_ Cut against the same segment that is drawn: derive `ax/bx` from `m.open` once and pass those to `segClosest`, or hold `m.ax/m.bx` at their eased values and let both the draw and the cut read them.

- **[medium] `specLine`'s `'none'` case can never be taken — the two mines it was written for say 'no damage', so the caption reads 'DMG no damage'**  
  `src/arsenal.js:210, src/arsenal.js:85, src/arsenal.js:109, src/arsenal.js:126`  
  Three surfaces show it. `FIRST_USE` (tutorial.js:209) makes the first-use caption "SNARE. DMG no damage. Pins a whole crowd where it stands, for 2.4s."; `specRows` (arsenal.js:229) renders a DMG row reading `no damage` on the loadout sheet and on the tree card. The one branch written to avoid exactly that phrasing is dead.  
  _Fix:_ Either change SNARE's and LODE's `dmg` to `'none'` (which the header already documents) or widen the test to `a.dmg === 'none' || a.dmg === 'no damage'`. If the string changes, `specRows` also needs the DMG row suppressed rather than printing the word.

- **[medium] A gripping SNARE outlives `CFG.mines.life`, which config calls a contract nothing may move — by up to 10.8s with DEAD WEIGHT**  
  `src/mines.js:632-641 (the gripping arm), src/mines.js:313 (snap), src/config.js:1017-1027`  
  A SNARE can sit on the field for over 26 seconds against a promise of 15, and it counts toward `laidCount` the whole time — which is also the only route by which `CFG.mines.cap` can ever be reached (see the cap finding).  
  _Fix:_ Bound the grip by the life that is left — `m.hold = Math.min(S.hold * up.mineHold, Math.max(0, m.life))` — or state in config that a grip is deliberately outside the life contract and say by how much.

- **[medium] The 'ALL MINES' group promises category-wide effect; three of its six nodes do nothing for half the kinds, and mines.js's own tally encodes that**  
  `src/tree.js:265-268, src/tree.js:74, src/mines.js:122-132, src/upgrades.js:454-460`  
  A player laying THORN, LODE, WIRE or KNELL buys WIDE MOUTH under a heading that says it applies to whatever they lay, and it does nothing at all. Same for DEEP CHARGE and SHRAPNEL on the five kinds with no blast, unless SALTED is also owned.  
  _Fix:_ Either move the three onto the arms that use them (the way DEAD WEIGHT, HOT WIRE, FOURTH BELL and REPULSOR already sit), or reword the group line and each row to name which kinds it reaches.

- **[medium] `tally` refuses DEEP CHARGE and SHRAPNEL to the five kinds with no blast — but SALTED gives every kind a blast that both of them scale**  
  `src/mines.js:124-132, src/mines.js:395-397, src/mines.js:138-140`  
  With SALTED owned, buying DEEP CHARGE or SHRAPNEL measurably changes what a WIRE, THORN, LODE, SNARE or VOID does at the end of its life and the mine on the field does not change at all — which is the exact fault ("the readout lying about the machine") this accounting was written to stop, inverted.  
  _Fix:_ Gate the two on `bang || up.mineFizzle` rather than on `bang` alone. Note the denominator then moves when SALTED is bought, which is correct — a kind gains an upgrade it can use.

- **[medium] `CFG.mines.cap = 5` cannot be reached by laying: the field peaks at 4, so `throwMine`'s eviction path is dead and config's claim about it is false**  
  `src/mines.js:243-252, src/config.js:1021-1026, scripts/regress.mjs:13517-13554`  
  None today, because the path cannot run — but the config comment tells the next balancer the cap is the live constraint when it is not, and the only route to reaching it is the SNARE life violation above.  
  _Fix:_ Either correct the config comment (peak is 4 of 5) or lower the cap so it binds; delete the SEED sentence; and give `retire` the four missing cases (fizzle for wire/thorn/lode, and something for void) if eviction is ever made reachable.

- **[medium] `LAY_TONE` covers four of the eight kinds; THORN, LODE, SPALL and VOID all lay with BLAST's exact chime**  
  `src/mines.js:239, src/mines.js:270`  
  Half the mine kinds announce themselves as BLAST. Since the lay chime is the only audio a THORN or a LODE ever makes (neither `repel` nor the THORN patch plays anything), it is their only sound and it is another mine's.  
  _Fix:_ Give the four their own frequencies and drop the fallback, or make the fallback a value no kind uses so a missing entry is audible rather than a lie. The same four-kinds staleness is in the debug panel: hud.js:1553-1556 has THROW buttons for blast/snare/wire/knell only.

- **[low] KNELL's row says '81, twice' and the second toll is 58; the module and config both still say 'three times' against `tolls: 2`**  
  `src/arsenal.js:118, src/mines.js:15-16, src/config.js:1070-1071, src/config.js:1078-1082`  
  A player comparing mines on the loadout sheet reads 162 damage from a KNELL and gets 139. The prose in two files describes a mine that rang three times two builds ago.  
  _Fix:_ '81 then 58' (or '81, fading, twice'), and add `says('knell', CFG.knell.tolls)`-style coverage for the count. Update the two 'three times' comments to two.

- **[low] The snare's drawn hold-wires walk `world.enemies` only, under a comment claiming they walk the same set `grip` does**  
  `src/mines.js:712-716, src/mines.js:352-353`  
  Energy motes hauled into the knot have no wire drawn to them — the inverse of the fault the comment names: the picture is missing a hold the snare does have. A SNARE dropped in a field of wreckage looks like it has caught less than it has.  
  _Fix:_ `for (const e of [...world.enemies, ...world.drops])`, or hoist the same `take`-style helper the update uses.

- **[low] `toll` reads the current FOURTH BELL total against a toll count stamped at construction, so buying it mid-run weakens the knell already on the field**  
  `src/mines.js:535-537, src/mines.js:199`  
  Buying the upgrade that adds tolls halves the first toll of any knell already lying on the field, and draws it at double radius. The window is short (a knell rings out ~2s after landing) but the menu is where you buy, and the field is frozen and visible while you do.  
  _Fix:_ Store the base on the mine at construction (`this.tollsMax = K.tolls + up.mineTolls`) and compute `i = this.tollsMax - m.tolls`.

- **[low] The wire's retract arm `-dt * 4` is a branch that can never run**  
  `src/mines.js:563-567, src/mines.js:227-229`  
  None visible. It is dead code that reads as a live retraction, and CLAUDE.md's rule is that a guard nothing can take is the thing to delete.  
  _Fix:_ `m.open = clamp(m.open + (m.cutting ? dt / W.open : 0), 0, 1)`, or delete the ternary.

- **[low] The first time a mine kind is picked, one is laid on the very next frame — and the regress case guarding this is titled the opposite of what it asserts**  
  `src/game.js:88, src/game.js:516, src/mines.js:1033-1039, scripts/regress.mjs:12352, scripts/regress.mjs:12400-12404`  
  Small and arguably desirable (immediate feedback), but it is the reported behaviour for the first click, and the case that is supposed to hold the line says in its own name that it does not happen.  
  _Fix:_ Either seed `mineTimer` to `M.throwEvery * up.mineEvery` at reset, or rename the case to what it actually asserts ('the clock is not reset by a switch'). Do not fix silently — the free first mine may be intended.

- **[low] Five FIELD nodes still take `u.levels ?? 3`, in a branch where every capped neighbour got an explicit level and a written reason in builds 212-219**  
  `src/upgrades.js:454, 455, 460, 461, 462; src/tree.js:205`  
  Uncertain — these five predate the audits and DEAD WEIGHT in particular looks deliberate (config.js:1052 nerfs `hold` 3.6 → 2.4 with the note 'see DEAD WEIGHT', which only makes sense against a large multiplier). Reporting it because CLAUDE.md's rule is to check the tree's number rather than the node's, and these are the only five in the branch that have never been written down.  
  _Fix:_ Write `levels` on each of the five even if the value stays 3, so the next reader cannot tell a default from a decision. `regress.mjs` already pins level totals and ladder products elsewhere; add these five.

- **[cosmetic] The pip collar's spacing denominator is a hardcoded 6, not the `of` that `tally` now computes**  
  `src/mines.js:881, src/mines.js:875-879, src/mines.js:143-158`  
  The body size says 'full' and the collar says 'two thirds'. Only noticeable if a player compares kinds; the collar is still an honest count of what is owned, which is what the comment above it promises.  
  _Fix:_ `Math.max(6, of)` — export `of` alongside `has` from `tally`, or space the marks over the kind's own denominator with a dimmed mark for each unowned slot.

- **[cosmetic] Stale module and comment prose: 'four kinds' throughout mines.js, and 'Nothing expires now' against a 15-second life**  
  `src/mines.js:1-4, src/mines.js:275, src/mines.js:1021-1024`  
  None at runtime. It is the documentation the next reader works from, and it currently describes a four-kind module in which mines are permanent.  
  _Fix:_ Rewrite the header for eight kinds, delete the superseded docstrings above `laidCount` and `mineCadence`, and drop 'Nothing expires now'.

- **[cosmetic] PAIRED CHARGE and SALTED wear marks named for nodes that no longer exist**  
  `src/upgrades.js:440, src/upgrades.js:459, src/upgrades.js:154, src/upgrades.js:195`  
  An ammunition magazine sits in the FIELD branch beside eight mine marks, and a fuse illustrates a node that is not about timing. This is the shape `scripts/contact.mjs` was written to find (ARRAY selling a scanning dish and drawing a flat fin) — flagging it rather than asserting it, since I have not rendered the sheet.  
  _Fix:_ Run `node scripts/contact.mjs` and look at the FIELD block; if the two read wrong, draw a paired-charge mark and a mark for a spent charge going off, and rename the table keys to the node ids.

