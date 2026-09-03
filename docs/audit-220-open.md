# Build 220 audit — the findings not yet acted on


Every round type and every mine kind was read end to end by a separate reader,
then each reader's claims were put to an adversarial pass. This file is what
came out that has NOT been fixed, kept in the repo because the reports
themselves lived in an ephemeral container.

Nine commits of build 220 already carry the fixes: the THORN/LODE runaway, the
three secondary-damage holes (ARC's chain, SPORE's ground, THORN's ground),
TITHE's decaying floor, VOID against ARMORED, the `spent`/`staged` sweep, the
three uncapped count-nodes, the six stale arsenal rows, four overshooting
rings, WIRE's span and PILE's fade. Each of those was proved by reverting it
and watching a case fail; none of them is in this file.

What IS here is the remainder: things confirmed by the adversarial pass but
left alone, and things no reader has adjudicated yet because the pass had not
reached them. Nothing here is urgent -- the one runaway the audit found is
already fixed. Read the severity, and check the claim before acting on it:
the pass refuted about a third of what it was given.


## Adjudicated: confirmed by the adversarial pass, not yet fixed

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


### 2. [medium] MINE — the gun's own header quotes HOLLOWPOINT at 1.25 a level when it is 1.5, and two downstream comments call the boss ceiling inert when it binds on every bought fight

**Where:** `src/shooter.js:43 (stale term) vs src/upgrades.js:343; src/config.js:2485; scripts/regress.mjs:11977; src/boss.js:199`

**Evidence:** shooter.js:43 — ` * tree's hundred-odd: HOLLOWPOINT at 1.25 a level over three, SALVO's every` — in the header that exists to say what `gunScale` is made of.

HOLLOWPOINT is 1.5 a level and has been since build 215 (the same commit, 166930e, that wrote this header). upgrades.js:343 — `{ id: 'hollowpoint', name: 'HOLLOWPOINT', line: '+50% damage.', apply: scale('damage', 1.5) , icon: MARK.hollowpoint },` — no `levels`, so the tree sells 3 and `up.damage` = 1.5³ = 3.375, not 1.25³ = 1.953.

The live product (shooter.js:324-329, `up.damage * (up.salvo ? 1 + 2 / up.salvo : 1) / (up.rate || 1)`) with SALVO 8 (upgrades.js:425, `set('salvo', 8)`, levels 1) and FEED 0.9 (upgrades.js:564-566, `quicken('rate', 0.9)`, levels 1) is 3.375 × 1.25 / 0.9 = 4.6875. regress.mjs:11955 already pins exactly that: `const want = 1.5 ** 3 * 1.25 / 0.9;`, and its own comment at :11953 says 'HOLLOWPOINT (1.5 a level from build 215)'.

Two consumers of the stale figure are wrong in a way that inverts the conclusion:
  config.js:2485 — ` * A ceiling rather than the raw product (which reaches 5.30) because the` — the raw product reaches 4.6875. 5.30 is the pre-215 number (1.25³ HOLLOWPOINT × 1.25³ SIGHT × 1.25 / 0.9 = 5.30).
  regress.mjs:11977 — ` * product fell from 5.30 to 2.71, so the ceiling stopped binding.` — 2.71 is 1.25³ × 1.25 / 0.9, i.e. the product HOLLOWPOINT would give if it were still 1.25. The real product is 4.6875 against `temper: 4.2` (config.js:2492), so boss.js:199 `this.hard = Math.min(gunScale(world), CFG.boss.temper);` returns the CEILING, not the product, for every fully bought turret. The ceiling did not stop binding; it is the only thing setting a bought boss's core and structure health. The case itself is correct — regress.mjs:11985 `const cap = Math.min(want, r.cap);` — only its prose is wrong.

**Consequence:** No player-visible defect today: the code computes the right number. But the three comments a tuner reads before touching `CFG.boss.temper` say the cap is 21% above a product it is actually 11% below, and say in as many words that it 'stopped binding'. Acting on that — raising or deleting the cap as inert — changes every bought anomaly's health by 4.6875/4.2 = 1.116x.

**Suggested fix:** shooter.js:43: 'HOLLOWPOINT at 1.5 a level over three'. config.js:2485: the raw product reaches 4.69. regress.mjs:11977: the product fell from 5.30 to 4.69 and the ceiling still binds (4.2 < 4.69). No code change.

**Hash:** No — comments only, and `temper` cannot reach the canonical fight in any case: the hash probe opens ORDINAL with a stock turret, where regress asserts `hard === 1` exactly (regress.mjs:11878-11880) and the multiply is an identity.


### 3. [low] MINE — gunScale's 36-line docstring is orphaned: build 215 inserted `class Front` between it and the function, so it now documents the PILE wave

**Where:** `src/shooter.js:29-64 (the header), :65-77 (a second header), :78 `export class Front {`, :324 `export function gunScale(world) {``

**Evidence:** shooter.js:29-64 opens ` * What the tree has done to the gun, as one number, 1 at stock.` and runs 36 lines through the seven measured boss fights, the four terms, and 'Asserted as a PRODUCT in regress.mjs rather than node by node'. Line 65 immediately opens a SECOND docstring — ` * The wave a PILE sends out through the floor.` — and line 78 is `export class Front {`. Two block comments back to back is the tell: the first documents nothing.

`gunScale` is 260 lines below with no header at all: shooter.js:322-324 is `}` / blank / `export function gunScale(world) {`.

Cause, from history rather than guessed: at build 214 (`git show 574c668:src/shooter.js`) the header was line 30 and `export function gunScale` was line 63 — directly beneath it. Build 215 (166930e, 'PILE replaces SIGHT') added `Front` between them and left the header where it was. This is the `windAt`/`rateAt` shape CLAUDE.md records, on a docstring rather than a function.

**Consequence:** None at runtime. A reader opening shooter.js is told that the PILE shock front is 'what the tree has done to the gun', and the one function the boss temper depends on carries no explanation of itself — which is how the stale 1.25 in that same block has gone unread for five builds.

**Suggested fix:** Move shooter.js:29-64 down to sit immediately above `export function gunScale` at :324, leaving :65-77 as `Front`'s own header.

**Hash:** No. Comment movement only.


### 4. [low] CFG.bolt.life (2.2s) is unreachable on every viewport the game runs at, so the '+30% life' third of OVERSTUFFED's row buys nothing observable in straight flight

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


### 5. [low] hitGraft is handed no surface normal and hard-codes (0, -1), so every SCION ball sprays straight up whatever direction it was shot from

**Where:** `src/projectiles.js:522 (call) vs :517 (the shard branch, fixed); src/enemies.js:991, :995; src/fx.js:421`

**Evidence:** projectiles.js:436 computes the real contact for all three hit kinds — `const c = contactAt(HIT, hx, hy, dirx, diry, p.r);` with `HIT.r` set to `CFG.graft.ball` for this case (:381) — and the shard branch uses it: :517 `bestTarget.enemy.hitShard(bestTarget.shard, p.damage, c.x, c.y, c.nx, c.ny);`. The graft branch throws it away: :522 `bestTarget.enemy.hitGraft(bestTarget.graft, p.damage, c.x, c.y);` — position only.

enemies.js:991 `hitGraft(s, dmg, hx, hy) {` and :995 `hitBurst(hx, hy, 0, -1, '#d9c2ff');`.

hitBurst sprays in a cone about the vector it is given — fx.js:421 `const a = Math.atan2(ny, nx) + spread(1.1);` — so (0, -1) is straight up, always. This is the same defect enemies.js:1093-1099 records fixing for bodies in build 211 ('a rim graze and a centre punch sprayed identically'); the shard path was swept and the graft path was not.

Secondary, same call: neither `hitShard` nor `hitGraft` is told `p.form`, so every round in the rack lands on a plate or a ball wearing BOLT's generic burst.

**Consequence:** Shooting a ball off a grafted host from the side throws its non-lethal spark burst upward instead of off the surface. Cosmetic, and only on bodies carrying SCION grafts.

**Suggested fix:** Pass `c.nx, c.ny` at projectiles.js:522 and use them at enemies.js:995, mirroring :517/:974. Keep a (0,-1) default for the other caller, enemies.js:4543 (`e.hitGraft(g, damage * (0.35 + gf * 0.65), gx, gy);` inside applyBlast), which genuinely has no travel direction.

**Hash:** No. `hitBurst`'s draw count is `(5 * fx.quality) | 0` regardless of direction, particles are not hashed, and ORDINAL has no grafts (SCION is a field type and the director is off during a fight).


### 6. [low] endProjectile's `impacted` parameter is true at all six call sites and its docstring names a path that never goes through the function

**Where:** `src/projectiles.js:107-110 (docstring and guard); calls at :121, :155, :158, :513, :518, :523; the field-exit path at :160`

**Evidence:** projectiles.js:107 — `/** End a projectile. \`impacted\` is false only when it simply leaves the field. */` — and :110 `if (impacted && p.burst) p.burst(world, x, y);`.

Every call site, grepped from the whole tree (the function is module-private, no other file references it): :121 `endProjectile(world, p, p.x, p.y, true);`, :155 `else endProjectile(world, p, p.x, p.y, true);`, :158 same, :513 `endProjectile(world, p, c.x, c.y, true);`, :518 same, :523 same. Six of six true.

The case the docstring names does not call it: :160 `if (p.y < -world.stageHeight || p.y > world.floorY + 60) p.dead = true;` sets the flag directly. So the false arm of the guard cannot be taken, and the parameter is a constant threaded through six call sites — the `world.endless` shape CLAUDE.md records ('if nothing can set it false, delete the flag, not the branch').

**Consequence:** None today: the field-exit path reaches the same end state (dead, burst uncalled) by a different route. It is a maintenance trap — the next person adding a burst-carrying round reads the docstring, believes the parameter is live, and gets no help from it.

**Suggested fix:** Either drop the parameter and the guard (the burst always fires when this is called), or route :160 through `endProjectile(world, p, p.x, p.y, false)` so the branch becomes real and the docstring true. The second is behaviour-identical and leaves one exit door.

**Hash:** No. Both fixes end at `p.dead = true` with `p.burst` uncalled, exactly as now.


### 7. [cosmetic] PRISM's reflect docstring states the landing window on the wrong radius and describes it as an area fraction the 2-D geometry cannot produce

**Where:** `src/config.js:3546-3548 and :3565; src/physics.js:238-243, :260; src/enemies.js:1065`

**Evidence:** config.js:3546-3548 — ` * Glancing bolts bounce off instead of landing: a round lands only if the` / ` * cosine of its angle of incidence is above this, which is |b| < 0.6r --` / ` * three fifths of the width of the disc, a bit over a third of its area.` with `reflect: 0.8` at :3565.

The test is enemies.js:1065 `if (this.type.reflect && c.incidence < this.type.reflect) {`, and incidence is physics.js:260 `incidence: depth / R,` with :243 `const depth = Math.sqrt(Math.max(0, R * R - b * b));` and :238 `const R = (e.r || 1) + pr;`. So incidence = sqrt(1 - (b/R)^2) and a round lands iff |b| <= sqrt(1 - 0.8^2) * R = 0.6 * R — where R is `e.r + p.r`, not `e.r`.

PRISM `r: 20` (config.js), BOLT `r: 4.2` (config.js:1150) -> R = 24.2, so the window is |b| <= 14.52 = 0.726 * e.r, 21% wider than the '0.6r' the comment states. And because R carries the ROUND's radius the window moves with the round: SCATTER pellet (r 3.2, shooter.js:522) lands out to 0.696 * e.r, SPINE dart (r 3.4) to 0.702, SLUG (r 7.2, shooter.js:599) to 0.816, the PRISM ability shell (r 8, abilities.js:1036) to 0.84. A fatter round is measurably more likely to land at the same offset.

'a bit over a third of its area' is 0.6^2 = 0.36, the area ratio of a concentric disc — the wrong quantity for a 2-D game. The impact parameter is one-dimensional, so of the aperture that can be hit at all (|b| <= R) exactly 60% lands, and of the body's visible width 72.6% lands for a BOLT.

**Consequence:** None to the code — the geometry is right and the regress case ('a square-on shot always lands on a PRISM, and a graze always bounces') is measuring the right thing. The cost is to the next person retuning `reflect` off this comment, who will be aiming at a window a fifth narrower than the real one and an area fraction half the real one — which is exactly how 0.55 came to be fitted to a broken test before build 211.

**Suggested fix:** Rewrite as: a round lands iff |b| <= 0.6 * (e.r + p.r) — 0.73 * r for a BOLT, and it widens with the round's own radius; 60% of the hit aperture, 73% of the body's visible width. Drop the area clause.

**Hash:** No. Comment only.


### 8. [cosmetic] SPIRAL leftovers in the fire path: a `slow` constant multiplied into all nine rounds, a dead `scale` parameter, and an orphaned docstring in the Projectile constructor

**Where:** `src/shooter.js:495 and the nine multiplications at :536, :550, :564, :592, :613, :631, :645, :662, :688, :770; :489 and :492 and :504; src/projectiles.js:26-30`

**Evidence:** shooter.js:495 — `const slow = 1;` — declared inside `shoot()`, never reassigned, and multiplied into every round's speed including BOLT's (`speed: CFG.bolt.speed * slow,`). Ten call sites, one value, always 1.

shooter.js:489 — ` * @param scale a multiplier on the round's damage. SPIRAL fires mid-sweep` — and :492 `shoot(world, scale = 1) {`, reaching damage at :504 `damage: (opts.damage ?? CFG.bolt.damage) * up.damage * scale,`. Every `.shoot(` in src/ and scripts/ passes one argument: game.js:924, :934, :976, :1399 and every probe. SPIRAL was removed in build 217 (CLAUDE.md, 'Nothing in the bar takes the barrel any more').

projectiles.js:26-30 is a five-line block opening ` * Thrown by SPIRAL's sweep rather than aimed...` with NO field under it — line 31 opens a second block documenting `this.form`. The field it described went with the ability; its docstring did not. Same shape as `windAt`/`rateAt`, and the same shape as the gunScale header reported above.

**Consequence:** None — both terms are x1. It is dead weight in the hottest authoring surface in the game, and the orphaned comment actively misleads: it reads as documentation for `this.form`.

**Suggested fix:** Delete `slow` and its ten multiplications, drop the `scale` parameter and the `* scale` at :504, delete projectiles.js:26-30. The same sweep catches the other stranded SPIRAL comments at shooter.js:341 ('1 while SPIRAL is sweeping' above `this.gripHeld`), game.js:177 and game.js:425-435.

**Hash:** No. `x * 1` is exact in IEEE754, so removing both multiplications leaves every number bit-identical; the rest is text.


### 9. [cosmetic] BOLT's arsenal row says 'Nothing done to it' while BOLT is the only round in the rack that ricochets off the arena

**Where:** `src/arsenal.js:153; src/config.js:1154; src/shooter.js:772 vs :526, :539, :553, :581, :619, :637, :651, :705`

**Evidence:** arsenal.js:153 — `dmg: '26', fx: 'The fastest cadence there is. Nothing done to it.',`. The damage matches config.js:1152 (`damage: 26`) and the cadence claim is right (`rate: 1` for standard is the lowest in the table: HE 2.1, SCATTER 1.55, ARC 1.35, SPINE 1.45, SLUG 2.4, RIME 1.7, SPORE 2.0, TITHE 1.5).

But config.js:1154 is `bounces: 1, // ricochets off the arena side edges`, reached through projectiles.js:21 `this.bounces = opts.bounces ?? CFG.bolt.bounces;`, and BOLT is the only round that lets it through: every other branch of `shoot()` passes `bounces: 0` explicitly (shooter.js:526, 539, 553, 581, 619, 637, 651, 705), as do the two ability rounds (abilities.js:904, :1040) and SPALL's pellets (mines.js:443). BOLT's branch passes `bounces: CFG.bolt.bounces + up.boltBounce` (shooter.js:772). So the stock BOLT carries a mechanic no other stock round has, on the row that says it has none — and it is observable: at the aim clamp the round reaches a side wall in about 0.21s and comes off it.

**Consequence:** Small. A player reading the loadout sheet, the strip caption or the tree row (tree.js:150-155 renders `Damage ${a.dmg}. ` plus this text) is told BOLT is the plain one, and it is the only plain one that bounces off the walls.

**Suggested fix:** Say it — 'The fastest cadence there is, and it comes off the arena walls once.' Setting `bounces: 0` instead is a balance change, not a copy change.

**Hash:** Wording, no. Setting `CFG.bolt.bounces` to 0 WOULD move it: ORDINAL is fought with BOLT, rounds do reach the side walls at the clamp, and a round that dies at the wall instead of crossing back is a round that no longer lands. Re-baseline in the same commit if that route is taken.


### 10. [medium] CLUSTER's "the same total on one body" holds only at OVERPRESSURE 0, and reaches x2.28 at OVERPRESSURE 3 — with the sub-rings unset at exactly the levels the damage arrives

**Where:** `src/shooter.js:1558-1582; src/config.js:602`

**Evidence:** Re-derived and CONFIRMED, with one framing correction. shooter.js:1558-1560 `// CLUSTER. Four smaller ones thrown out around the first, so HE stops being / // a circle and becomes a patch of overlapping circles — the same total on / // one body, and a great deal more across a line of them.` config.js:602 `cluster: { n: 4, out: 78, scale: 0.5 },`. shooter.js:1565 `const cx = x + Math.cos(a) * c.out;` — `out` is never multiplied by `world.up.blastR`, while the sub radius at 1569 (`r: r * c.scale`) is, because `r` is `b.r * world.up.blastR` (1556). OVERPRESSURE has no `levels` (upgrades.js:349) so tree.js:205 `const levels = u.repeat ? Infinity : (u.levels ?? 3);` sells three, and heFx's own docstring agrees (shooter.js:1598-1599 "runs from 96 units stock to 263 fully bought"). The burst is centred on the shot body's SURFACE — projectiles.js:513 `endProjectile(world, p, c.x, c.y, true);` with physics.js:257 `x: e.x + nx * (e.r || 1),` — so for that body d = e.r exactly. applyBlast (enemies.js:4519-4521, 4546): `if (d2 > r2) continue;` … `const falloff = 1 - d / r;` … `e.applyDamage(world, damage * (0.35 + falloff * 0.65), …)`. For a 20-radius body, r = 96·1.4^L, sub r = 0.5r, four sub centres 78 from the burst point: L0 r=96 main 38.04, cluster +0.00 (x1.00); L1 r=134.4 main 39.74, +16.16 (x1.41); L2 r=188.16 main 40.96, +39.79 (x1.97); L3 r=263.42 main 41.83, +53.55 (x2.28). I checked the reader's implicit assumption of a vertical arrival: with the round arriving along a diagonal instead (sub distances 58 / 80.5 / 80.5 / 98 rather than 65.4 / 65.4 / 93.2 / 93.2) the L3 total is 53.6 — identical, because the fan has four-fold symmetry. It is not a small-body artefact either: a BULWARK (r 45, config.js:2730) at L3 takes 39.1 + 51.0 = x2.30. Draw guard, shooter.js:1582 `if (c.out + r * c.scale > r * 1.02) heFx(cx, cy, r * c.scale, true);` ⟺ 78 > 0.52r ⟺ r < 150, so rings are drawn at 96 and 134.4 and dropped at 188.16 and 263.42.

**Consequence:** CORRECTION to the reader's consequence: the player-facing row is NOT contradicted — upgrades.js:389-390 says only 'An HE burst throws four smaller ones outward', which is true. What is contradicted is the source comment and the design it records: CLUSTER is a x1.00 single-target node with no OVERPRESSURE and a x2.28 one with three, taking HE from 15+41.8 = 56.8 damage a round to 15+95.4 = 110.4 — a near-doubling of the round that no text anywhere accounts for, arriving as a side effect of a different node. The picture does not lie about WHERE the damage lands (every sub-blast is inside the drawn circle at L>=2, which is what the guard is for) but from L2 on it is pixel-identical to an HE with CLUSTER unbought.

**Suggested fix:** Scale the offset with the radius: `const cx = x + Math.cos(a) * c.out * world.up.blastR;` (and cy, and the guard). I verified this does what the reader says: with `out` self-similar the sub centres sit at 200-245 units from a 20-radius body's centre against a 131.7 sub radius at L3, so the added single-target damage stays 0.0 at every level, and the guard stays true at every level because 78·blastR > 0.52·96·blastR reduces to 78 > 49.9. It also invalidates the 'clover 252 units across' figure at shooter.js:1579. The honest alternative is to strike 'the same total on one body' from 1559-1560 and say CLUSTER is a damage node above one OVERPRESSURE level.

**Hash:** No. heBurst runs only for HE; the canonical ORDINAL probe fires BOLT and PULSE with nothing bought, so `up.cluster` is false and `up.blastR` is 1.


### 11. [low] TRACER is a bigger SCATTER range node (x1.82) than LONG THROW (x1.55), and puts the pellet past the reach config.js deliberately cut — but the reader's field geometry is wrong

**Where:** `src/shooter.js:503, 536-540; src/config.js:660-665; src/upgrades.js:346, 400-402`

**Evidence:** CONFIRMED on the arithmetic, with the premise corrected. config.js:660-665 `// Range is speed x life and nothing else, so this is the whole of it: / // 0.5 reached 560-710 units, which was most of the way up the field for / // a round whose whole trade is being murderous up close. A quarter off.` then `life: 0.375,`. shooter.js:536 `speed: rand(g.speed[0], g.speed[1]) * slow,` passes through the shared helper at 503 `speed: (opts.speed || CFG.bolt.speed) * up.speed,`; life at 540 `life: g.life * up.shotRange,`. `updateProjectiles` (projectiles.js:113-168) applies no drag, so range is exactly speed x life. TRACER (upgrades.js:346, `levels: 2`, `scale('speed', 1.35)`) gives up.speed = 1.8225; LONG THROW (upgrades.js:400-402, `levels: 1`, `scale('shotRange', 1.55)`). Stock 420-533; TRACER alone 765-971; LONG THROW alone 651-825; both 1186-1504. CORRECTION: the reader's 'ENTRY_Y 260 … ~736 units' is wrong — enemies.js:18 is `export const ENTRY_Y = 0;` and has been since 'Remove the wall and the gate'. At 390x844 (zoom 0.62, game.js:855-859, shooterY = floorY - 210) the turret is at y=996.4 and the live column above it is 996 units, not 736. That does not save the claim: 765-971 still sits above the 560-710 band the author explicitly cut, and both nodes together (1186-1504) outrange the whole column. `up.speed` is invisible on the rest of the rack — SCATTER and BOLT are the only two rounds in `shoot()` that set a `life` at all (shooter.js:540 and 748), and BOLT's is 1520x2.2 = 3344 units, far past the field either way.

**Consequence:** arsenal.js:171 `dmg: '12 x 5', fx: 'A tight cone that dies short. Close range only.'` and LONG THROW's 'The cone still ends, but further out' are both false on a bought gun: the cliff SCATTER is designed around is removed by a whole-rack node that says nothing about range and does more of it (x1.82) than the node authored for it (x1.55). This is the weakest of my confirms — a speed node lengthening a life-limited round is arguably inherent, and the author knew range = speed x life. What makes it reportable is that they wrote 'so this is the whole of it' next to the one lever that is not the whole of it.

**Suggested fix:** Take up.speed out of the pellet's reach rather than its speed — in the shotgun branch pass `life: g.life * up.shotRange / up.speed` — or give the pellet a distance budget instead of a life. Either keeps TRACER's 'arrives sooner' and leaves the cliff where LONG THROW puts it. If instead the interaction is wanted, the arsenal line has to stop saying 'close range only'.

**Hash:** No. SCATTER is never loaded in the canonical fight and TRACER is never bought (up.speed = 1); a change confined to the `world.round === 'shotgun'` branch cannot reach the BOLT path.


### 12. [low] HEAVY is worth x1.89 on an HE round, not x4: the blast impulse is the one term in heBurst the tree does not reach

**Where:** `src/shooter.js:1557, 1571 vs src/shooter.js:505; src/upgrades.js:348`

**Evidence:** CONFIRMED, and I re-ran the simulation. shooter.js:1557 `applyBlast(world, { x, y, r, damage: b.damage * world.up.damage, impulse: b.impulse });` — damage takes the tree, impulse does not; same at 1570-1571 (`damage: b.damage * c.scale * world.up.damage,` / `impulse: b.impulse * c.scale,`). The shell itself does take it, shooter.js:505 `impulse: (opts.impulse ?? CFG.bolt.impulse) * up.impulse,` on the HE branch's `impulse: 70`. upgrades.js:348 `{ id: 'heavy', name: 'HEAVY', levels: 2, line: '2x knockback on every hit.', apply: scale('impulse', 2) }` → up.impulse = 4. `up.impulse` has exactly ONE consumer in the whole codebase (grep: shooter.js:505). On a quiet 20-radius body at stock radius the blast delivers 420·(1-20/96) = 332.5 against the shell's 70, and the shove fade (enemies.js:1186 `const fade = throwOff ? 1 : 1 / (1 + (this.kicked || 0));`) charges the shell 1.0 and the blast 0.5: 236.3 unbought against 446.3 with two HEAVYs = x1.89. My own 10-second simulation at the stock HE cadence (0.286 x rate 2.1 = 0.6006s, kickFade 1.5, config.js:1222) gives 1944 → 3113 = x1.601, reproducing the reader's x1.60 to within rounding.

**Consequence:** On the one round whose knockback is 83% blast, the ammo branch's knockback node buys 60% more shove where its row promises 300%. I am less sure than the reader that this is a defect rather than a convention: NO blast anywhere takes up.impulse (mines.js:291 and 464, abilities.js:692 all pass a raw impulse), and PULSE has `pulsePush` of its own where HE's blast has nothing. But nothing states the convention, and 'on every hit' is what the row says.

**Suggested fix:** Either `impulse: b.impulse * world.up.impulse` at 1557 and `b.impulse * c.scale * world.up.impulse` at 1571 — note this is a real buff, x4 on the dominant term of HE's shove, and would want the ladder case re-run — or amend HEAVY's row to say the round and not its blast. Do not extend it to mines or abilities, which have their own nodes.

**Hash:** No. heBurst runs only for HE, which the canonical fight never loads; and up.impulse is 1 with nothing bought, so even moving the multiply inside applyBlast (which PULSE does use) leaves the arithmetic identical.


### 13. [cosmetic] Three clamp arms in the HE burst that no radius the game can produce will ever reach

**Where:** `src/config.js:643; src/shooter.js:1586, 1607, 1697`

**Evidence:** CONFIRMED, and there is a third the reader missed. config.js:643 `cap: 2.2, // the most any of those counts may be multiplied by`; shooter.js:1607 `const size = Math.min(F.cap, Math.sqrt(r / R));`. `blastR` is written by one node only (grep 'blastR': upgrades.js:26, upgrades.js:349, shooter.js:1556), so max r = 96 x 1.4^3 = 263.42 and size = sqrt(2.744) = 1.6565. For the Math.min to bind, r would have to reach 96 x 2.2^2 = 464.6. heFx's other callers are shooter.js:1582 (r x 0.5, smaller) and 1585 — nothing else in src calls it. Second: shooter.js:1697 `ripple(x, y, clamp(r / R, 0.7, 2), r * 3);` sits below `if (light) return;` (1678), so it only ever runs for a main burst where r/R is 1, 1.4, 1.96 or 2.744 — the 0.7 floor is unreachable (the upper arm 2 IS taken at OVERPRESSURE 3). MINE, same function: shooter.js:1586 `shake(clamp(r * 0.045, 2.4, 7));` — r x 0.045 runs 4.32 to 11.85 over the same four radii, so the 2.4 floor needs r < 53.3 and is equally dead, while the 7 ceiling binds from OVERPRESSURE 2 (8.47).

**Consequence:** None visible. Three guards that have never fired, and a docstring (shooter.js:1600-1602, 'The counts scale with the square root of that rather than with the area, and are capped') describing protection that is not in force — the counts are bounded by the ladder's three levels, not by the cap. The cap becomes live and silently raises every particle count 33% the day a fourth OVERPRESSURE level or a second blast-radius node lands.

**Suggested fix:** Either give `cap` a value the ladder can reach (1.7 makes it a real ceiling with headroom over today's 1.6565) or delete it and say the counts are bounded by blastR's three levels. Same for the 0.7 in the ripple clamp and the 2.4 in the shake clamp.

**Hash:** No. Drawing and screen shake only, HE only, and no rand() draws added or removed.


### 14. [cosmetic] `front`'s config comment still describes the ring the build-211 fix removed

**Where:** `src/config.js:634; src/shooter.js:1625`

**Evidence:** CONFIRMED. config.js:634 `front: 0.13, // seconds the leading ring takes to reach the blast radius` against shooter.js:1625 `ring(x, y, r, r * 1.1, F.front, '#fff0e2', 4.4);`. fx.js:235 is `export function ring(x, y, r0, r1, life, color, w = 3, fill = 0, a0 = 0, span = TAU)`, so r0 = r: the ring is AT the blast radius on frame one and 0.13 is its whole life, over which it drifts out a tenth. The source comment eleven lines above the call says so in as many words (shooter.js:1614-1620, 'It starts at `r` rather than expanding into it, and that is the whole point'), and the config block at 614-620 records the pre-211 semantics as the bug — so the key's own comment is the only place the old model survives.

**Consequence:** None in play; the fix itself is correct and intact. The next author raising `front` to make the ring reach further will make it live longer at the same radius.

**Suggested fix:** `front: 0.13, // life of the leading ring, drawn AT the blast radius and drifting out a tenth`.

**Hash:** No. A comment.


### 15. [cosmetic] The 'about 210 units' that justifies dropping the sub-blast rings is 156, and the guard actually written cuts at 150

**Where:** `src/shooter.js:1574-1582; README.md:1884-1887`

**Evidence:** CONFIRMED. shooter.js:1575-1576 `* fixed 78 units and is not scaled by OVERPRESSURE, so once the main / * radius passes about 210 every sub-blast is entirely inside it`. Entirely inside means out + r·scale <= r ⟺ 78 <= 0.5r ⟺ r >= 156. The guard is shooter.js:1582 `if (c.out + r * c.scale > r * 1.02) heFx(cx, cy, r * c.scale, true);` ⟺ 78 > 0.52r ⟺ drawn only while r < 150. OVERPRESSURE's four states are 96, 134.4, 188.16, 263.42, so the rings stop at level 2 — 'about 210' sits between 188 and 263 and reads as though level 2 still draws them. README.md:1885-1886 repeats it: `so past about a 210-unit main radius every sub-blast is entirely inside it and`.

**Consequence:** None on screen. It is the number a deliberate design decision is recorded with in two places, and it puts the change one whole OVERPRESSURE level later than it happens.

**Suggested fix:** Replace 'about 210' with 156 (or 'from the second OVERPRESSURE level') in the source comment and the README, and note the guard's own cut is 150 because of the 1.02 margin.

**Hash:** No. Comments.


### 16. [cosmetic] 'Up to forty-five' per trigger pull is 33 — and all three sites say forty-five, including the one the reader called correct

**Where:** `src/projectiles.js:555, 773; src/fx.js:298`

**Evidence:** CONFIRMED, with a correction that makes it slightly worse. projectiles.js:773 `// A pellet is one of up to forty-five in the same trigger pull;` and fx.js:298 `// Up to forty-five of these land per salvo`. The reader cites projectiles.js as 'already correct' — it is not: 555 reads `* SCATTER. Up to forty-five of these can be in the air at once (DOUBLE-O / * pellets across a SALVO fan)`, and 'DOUBLE-O pellets across a SALVO fan' IS the per-pull number, which is 33: shooter.js:530 `const pellets = g.pellets + up.shotPellets;` with `pellets: 5` (config.js:658) and DOUBLE-O (upgrades.js:392-394, `levels: 2`, `bump('shotPellets', 3)`) → 11, times the three of shooter.js:523 `const fan = salvo ? [-SALVO_FAN, 0, SALVO_FAN] : [0];`. In the air is a different number and is 44, not 45: interval = 0.286 x 1.55 x up.rate(0.9) = 0.399s against life = 0.375 x 1.55 = 0.581s, so one previous 11-pellet pull overlaps a 33-pellet salvo pull; two do not (0.798 > 0.581), and SALVO is `set('salvo', 8)` at one level (upgrades.js:425) so two salvo pulls can never be adjacent.

**Consequence:** None. Two figures a future 'can we afford a richer pellet?' decision would be made against, 36% high per pull. Worth noting the form is now shared: mines.js:457 gives SPALL's fan `form: 'pellet'` too, and that fan is 36 at full BUCKSHOT, so fx.js:298's sentence now covers a second source it does not mention.

**Suggested fix:** 33 per trigger pull, 44 in the air, in all three places — and say the form is shared with SPALL's fan.

**Hash:** No. Comments.


### 17. [low] Two dead numbers threaded through every round the turret fires: `scale` and `slow`

**Where:** `src/shooter.js:492, 495 (and 504, 536, 551, 593, 614, 649, 663, 717, 768)`

**Evidence:** CONFIRMED. shooter.js:492 `shoot(world, scale = 1) {` — every caller in the game passes one argument (game.js:924 `s.shoot(w);`, :934, :976 `this.world.shooter.shoot(this.world);`, :1399), so `scale` is never anything but 1, and it reaches HE's and SCATTER's damage at 504 `damage: (opts.damage ?? CFG.bolt.damage) * up.damage * scale,`. Its docstring at 490 still reads 'SPIRAL fires mid-sweep at less than a placed shot is worth' and SPIRAL went in build 217 (`grep -rn chrono src/` and `grep -rn SPIRAL src/` return nothing but this comment family). shooter.js:495 `const slow = 1;` is multiplied into nine round speeds and cannot change any of them. canFire's header at 472 also still explains SPIRAL zeroing the cooldown.

**Consequence:** None at runtime. It is the `windAt`/`rateAt` shape CLAUDE.md records from SPIRAL's removal, except the dead value is threaded through every branch of the fire path rather than sitting in a private function, so it reads as a live knob.

**Suggested fix:** Delete `slow` and its nine `* slow`, drop the `scale` parameter and its `* scale`, and strike the SPIRAL sentences from the `shoot` and `canFire` headers.

**Hash:** No — both are identity multiplications and neither adds nor removes a rand() draw, so the default BOLT path stays byte-for-byte, which is the property projectiles.js:762-771 says is load-bearing.


### 18. [low] MINE: `Shooter.cooldown` can never be non-zero, so canFire's cadence guard has one arm that is never taken

**Where:** `src/shooter.js:351, 368, 446, 483`

**Evidence:** MINE — found in the same two functions as claim 10, which the reader read and did not follow through. `grep -n cooldown src/shooter.js` and `grep -rn '\.cooldown =' src/` return, in the whole codebase: shooter.js:351 `this.cooldown = 0;`, :368 `this.cooldown = 0;`, :446 `this.cooldown = Math.max(0, this.cooldown - dt);`, and one read at :483 `return this.cooldown <= 0;`. Nothing anywhere assigns it a positive value — `shoot()` does not set it, and the cadence lives entirely in `Game.fireTimer` (game.js:1391-1399). So line 446 is `Math.max(0, 0 - dt)` every frame, and canFire reduces to `!(world.boss && world.boss.sequencing())`. Its header at 466-472 justifies the field by SPIRAL, which 'zeroes the cooldown to bypass the cadence' — SPIRAL was removed in build 217.

**Consequence:** None visible, and the always-true reading is the documented behaviour ('Tapping faster than this is still always allowed', config.js:531). It is exactly the `world.endless` / `wardLife` shape CLAUDE.md names twice: a field nothing can set, with a reader that can never take its other branch, kept alive by a comment about a deleted feature. It also means 'up to forty-five in the air' has no cadence bound at all against a fast tapper.

**Suggested fix:** Delete `cooldown` and its three writes, make canFire `return !(world && world.boss && world.boss.sequencing());`, and keep the boss half of the header — that half is live and load-bearing.

**Hash:** No. The canonical probe drives auto-fire through `Game.updateFiring`, which never consults the field's value beyond the always-true test.


### 19. [low] MINE: the aimRange design note is written against an ENTRY_Y of 260 that has been 0 for many builds, and DEEP ARRAY's row inherits the error

**Where:** `src/config.js:554-563; src/enemies.js:18; src/upgrades.js:621-624`

**Evidence:** MINE — this is the stale number that produced the reader's wrong premise in claim 2, so it is worth killing. config.js:555 `* world and objects go live at y=260, which puts the far corner 800 units`, :559 `* 400 is the near half: a little past the middle of the live field`, :562 `* and two levels of it (x1.45 each) come to 841 — the whole field again,` / `* with the corner inside it.` But enemies.js:18 is `export const ENTRY_Y = 0;` ('The top of the visible field, in world units'), and has been since commit 2d901b8 'Remove the wall and the gate'. At the note's own device (390x844, CFG.zoom 0.62, game.js:857 `world.floorY = (sh - (safeBottom + barH + 22)) / z;`, game.js:820-822 `return this.world.floorY - CFG.shooter.standoff;`) the turret is at y=996.4 — which the note gets right — so the live column above it is 996 units, not 736, the far corner is sqrt(314.5^2 + 996.4^2) = 1045 units and not 800, 400 is 40% of the column rather than 'a little past the middle', and ARRAY's 841 leaves the corner 204 units outside it.

**Consequence:** The reach numbers themselves (400, 841) are right; what is wrong is every statement about how much field they cover — and one of those is player-facing. upgrades.js:623 sells DEEP ARRAY as '+45% again, on top of ARRAY. A second fin, and the sweep reaches the top of the field.' At 390x844 it reaches y=155 of a field whose top is y=0, so the top 16% of the column is out of reach with the node fully bought; at 430x932 it is 297 units short. The row is only true on short screens (at 320x568 the turret is at y=551 and 841 covers the whole column and both corners), which is the worst kind of true.

**Suggested fix:** Re-derive the paragraph off ENTRY_Y = 0 at a stated screen size, and either reword DEEP ARRAY's line ('reaches the top of the field on a short screen' is not sellable — 'most of the way up the field' is) or raise the ladder so 841 clears the tallest supported column.

**Hash:** No if only the comment and the row string change. Raising aimRange WOULD move it — the canonical probe runs with auto-fire and the assist on, so what the turret can point at is exactly the channel build 209's re-baseline went through.


### 20. [low] A SLIVER fragment re-enters and re-splits inside the body it was born in — measured, a BULWARK takes 3 hits from one dart at SLIVER 1 and up to 8 at SLIVER 2

**Where:** `/home/user/Shooter/src/shooter.js:307-313 (the stated intent), /home/user/Shooter/src/projectiles.js:92 and :122 (the implementation)`

**Evidence:** The intent is written out at shooter.js:307-312: "It must not split on the body it was BORN in. `fire` puts it at the contact point, inside the thing the parent was passing through, so without this every fragment would immediately hit that same body and come apart again on the frame it appeared" — implemented one line down as `      ignore: e,` (shooter.js:313).

That cover is a fixed TIME, not a distance:
  projectiles.js:92 — `    this.ignoreT = opts.ignore ? 0.06 : 0;`
  projectiles.js:122 — `    if (p.ignoreT > 0) p.ignoreT -= dt; else p.ignore = null;`
The test precedes the decrement, so the cover survives ceil(0.06/dt) sweeps = 0.0667 s at 60 Hz (and 0.0667 s at 120 Hz — 8 sweeps of half the length).

Geometry. `sliverOn` is handed `c.x, c.y` (projectiles.js:479 `if (p.onHit) p.onHit(world, e, c.x, c.y, p);`), which physics.js:258-259 puts on the body's own radius: `    x: e.x + nx * (e.r || 1),`. `nx, ny` is the outward normal at the ENTRY point, so a fragment is born on the near face and must cross the whole body. For an on-axis fragment the exit-the-hit-circle distance is 2*e.r + p.r; the hit test is `const rr = e.r + p.r;` (projectiles.js:391) and the fragment's r is 2.6 (shooter.js:292).

Arithmetic. Fragment speed = parent speed * S.speed (shooter.js:291 `      speed: sp * S.speed,`), S.speed 0.82 (config.js:742), stock SPINE speed 1560 (config.js:690) => 1279.2 u/s. Cover = 1279.2 * 0.0667 = 85.3 units. BULWARK r 45 (config.js:2730) needs 2*45 + 2.6 = 92.6. 85.3 < 92.6, so the cover lapses with the fragment still inside.

Measured, not argued. I drove the real modules headless (config + upgrades + enemies + projectiles + Shooter.shoot, world.round = 'spine', one BULWARK, takeHit counted, 40 frames at 1/60), pinned and unpinned, and the result is the same:
  SLIVER 1, no TRACER: 3 takeHit calls on the BULWARK from one dart (34.00, then 23.80 and 23.80 — two of the three fragments come back into it). Eight repeats: 3,3,2,3,3,3,3,3.
  SLIVER 2, no TRACER: 5 to 8 calls. One run logged, with spawn sites:
    hit #1 dmg=34.00 hitpoint y=366.9 t=0.0833
    spawn at (449.8, 355.0) dmg=23.80 splits=1   x3
    hit #2 dmg=23.80 hitpoint y=440.3 t=0.1667
    spawn at (449.8, 355.0) dmg=16.66 splits=0   x3
    hit #3/#4/#5 dmg=16.66 t=0.2500
  The body centre is y=400, so the grandchildren are created at y=355 — the NEAR face — while the fragment that made them was at y≈440, past the centre. The arc appears 85 units behind the thing that threw it, on the entry side.
  SLIVER 1 with ONE level of TRACER (x1.35, cover 115.1 > 92.6): 1 call. Two levels: 1 call. So the fault exists only before TRACER is bought.
  Every other ordinary type is clear: LURCHER (r 24), SPLITTER (29), NEEDLE (10), MOTE (12) all 1 call.

The reader under-counted the reach. A GLUT fed to its ceiling is r 52 (config.js:2925 `    eat: { reach: 26, growth: 3.1, hpPer: 26, maxR: 52 },` — enemies.js:957 `      this.r = Math.min(cfg.maxR, this.r + cfg.growth);`) and measures 4 calls at SLIVER 1. FRACTAL's core is r 64 (config.js:3209), 130.6 units to clear, past even one TRACER level.

The projectile COUNT is unaffected, which is why regress.mjs stays green: the ceiling is held by the `splits` budget (shooter.js:280-281 `  const left = p.splits;` / `  p.splits = 0;` and :305 `      splits: left - 1,`), not by the ignore.

**Consequence:** On the game's heaviest ordinary body, and only before TRACER: one SPINE dart hits a BULWARK two or three times instead of once, each re-hit spending one of the fragment's pierces inside the body it was already in. At SLIVER 2 the visible half is worse — the fragment comes apart inside the BULWARK and the ring plus three grandchildren are drawn at the body's ENTRY face, ~85 units behind where the fragment actually is, so an arc authored to open out the far side appears behind the body instead. Damage is quietly higher than authored on exactly the type the round is least meant to beat by brute force.

**Suggested fix:** Make the cover a distance rather than a fixed time. `ignoreT` is not currently an opt (projectiles.js:92 derives it from `opts.ignore`), so add one and pass it from `sliverOn` only: `ignoreT: (2 * (e.r || 1) + 2.6) / (sp * S.speed)`. Keep it local to `sliverOn` — changing the 0.06 default at projectiles.js:92 also moves a pierce's re-arm (projectiles.js:487 `        p.ignoreT = 0.06;`) and OVERSTUFFED's rebound, which is a much wider blast radius. Note the required time is per-body, so it cannot be a single constant: BULWARK needs 0.0724 s at stock speed, a fed GLUT 0.0833 s.

**Hash:** No. The canonical run fires BOLT and PULSE only, so SPINE never comes apart in it; the change adds no `Math.random` draw on any path the run takes, moves no body and changes no energy. A change to the constructor default at projectiles.js:92 would touch BOLT's pierce/rebound re-arm — but the canonical run is unbought (`rebound` 0, `pierce` 0), so even that would not move it. Keep it local anyway.


### 21. [cosmetic] SLUG's config header still compares itself to SPINE's pre-218 damage of 20

**Where:** `/home/user/Shooter/src/config.js:774`

**Evidence:** config.js:774 — `     * it now hits hardest of anything per shot — 44, against SPINE's 20 and`
SPINE has been 34 since build 218: config.js:705 `      damage: 34,` under a header (config.js:692-704) that says "34 from build 218, up from 20". So the sentence's own point — that SLUG hits hardest per shot — survives (44 > 34), but the comparison number is two builds stale. This is the surviving half of the reader's claim 1; the player-facing half of that claim is refuted below.

**Consequence:** None to the player. It is a comment. The cost is to the next reader, who is being told SPINE is 20 by a file whose other header says it is 34 — the same shape as the orphaned `windAt`/`rateAt` header CLAUDE.md records.

**Suggested fix:** config.js:774 → "against SPINE's 34 and". Nothing else in the paragraph needs to move.

**Hash:** No. Comment only.


### 22. [cosmetic] MINE: `chainFrom`'s own header does the ARC arithmetic wrong — the chain is 80.89, not 84, and the two figures it derives from that are both ~3.4% high

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



## Adjudicated: refuted, recorded so it is not re-reported

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


## Not yet adjudicated — raw reader claims, unverified


The adversarial pass had covered three of twelve readers when this was written.
Everything below is a single reader's claim with no second opinion on it, and
some of it is certainly wrong -- the three completed passes refuted eleven
claims between them, four of which were 'already fixed' and three of which
were design preferences dressed as defects. Treat these as leads.


### The STANDARD round (BOLT, CFG.rounds.standard / CFG.bolt) and the shared projectile machinery — src/projectiles.js, src/physics.js contactAt, src/fx.js impactFx, and the fire/draw switches

- **[medium] OVERSTUFFED silently sells a fourth thing: +1 arena ricochet per level, which is RICOCHET's whole node**  
  `src/upgrades.js:370-372; src/shooter.js:701-703, 713-714; src/upgrades.js:32,34; src/projectiles.js:63,154-158`  
  A player who buys OVERSTUFFED for the body rebound also gets four extra wall ricochets they were never told about — BOLT goes from 1 side-wall bounce to 5 — and RICOCHET, a separately-priced node in the same branch, is largely redundant for the round OVERSTUFFED is filed under. Visible immediately: fire at the arena edge before and after.  
  _Fix:_ Decide which one the node sells. Either drop `u.boltBounce += 1` from the apply (the row and the shooter comment then both become true), or keep it and say so in the line ('+1 rebound, +1 arena bounce, +30% life') and delete the shooter.js 'rides on the bounce budget' comment, which is false either way.

- **[medium] CFG.bolt.life (2.2s) cannot bind on any phone viewport, at any upgrade level — so a third of OVERSTUFFED's row buys nothing**  
  `src/config.js:1153 (`life: 2.2,`); src/shooter.js:712 (`life: CFG.bolt.life * up.boltLife,`); src/projectiles.js:20,121,160; src/upgrades.js:371-372`  
  '+30% life' is one of the three things OVERSTUFFED's row advertises and, on a phone, it changes nothing a player can observe at any level — the round always leaves the field or runs out of wall bounces first. The only path that could ever reach the timer is a body rebound turning a round back down-field, which is the same node's other effect.  
  _Fix:_ Either say what the extra life is actually for (it lengthens a rebounding round's total path, not its straight flight) or replace that third of the node with something reachable. `CFG.bolt.life` itself is fine as a backstop; it is the row selling a multiplier on it that is misleading.

- **[medium] SPALL's 14–36 pellets name no `form`, so each one pays the default muzzle arm — the exact bug documented and fixed on HAIL one file over**  
  `src/mines.js:405-412 (no `form:` key); src/projectiles.js:766-771 (the default arm); src/abilities.js:983-1003 (HAIL's fix and its note)`  
  A SPALL going off puts 42 (up to 108 with BUCKSHOT) muzzle particles on the mine's own position, which is the brightest thing in the effect and is not what the mine was drawn to look like; on a busy field it can eat most of the particle budget and starve the authored effects. The pellets also fly as BOLT tracers rather than as the hot-metal pellet form SCATTER's identical shot uses, in the identical colour (#ffd9a0).  
  _Fix:_ Add `form: 'pellet',` to the mines.js:405 fire() options. The pellet arm is one spark with computed velocities (projectiles.js:738-740) and the pellet impact is one spark (fx.js), which is what SCATTER and HAIL already get.

- **[low] `endProjectile`'s `impacted` parameter is `true` at all six call sites, and its docstring describes a path that bypasses the function**  
  `src/projectiles.js:107-111, 121, 155, 158, 475, 480, 485, 160`  
  None today — the field-exit path reaches the same end state (dead, no burst) by a different route, so behaviour is correct. It is a maintenance trap: the next person to add a burst-carrying round reads the docstring, believes the parameter is live, and gets no help from it.  
  _Fix:_ Either drop the parameter and the guard (the burst always fires when this is called), or route projectiles.js:160 through `endProjectile(world, p, p.x, p.y, false)` so the branch is real and the docstring true. The second is behaviour-identical and keeps one exit door.

- **[low] `hitGraft` is handed no surface normal and hard-codes `0, -1` — the build-211 fault, still live on the graft path**  
  `src/projectiles.js:484; src/enemies.js:983-990 (`hitGraft`), 987; compare src/enemies.js:1098-1099`  
  Shooting a SCION ball off a host from the side sprays upward instead of off the surface. Cosmetic, and only on grafted bodies.  
  _Fix:_ Pass `c.nx, c.ny` from projectiles.js:484 and use them in enemies.js:987, mirroring the shard branch at :479.

- **[low] `contactAt` is computed twice per body hit, with identical inputs, against a comment saying it is not**  
  `src/projectiles.js:290-298, 398, 407-408; src/enemies.js:1042; src/physics.js:224,248-261`  
  None visible. Twice the arithmetic and twice the allocation on the hottest damage path in the game.  
  _Fix:_ Have `takeHit` take the precomputed contact as an argument (resolveSegment is its only caller), or leave it and correct the comment so the next reader is not told the duplication was removed.

- **[low] PRISM's `reflect` docstring misstates the landing window by ~2x and by a factor that depends on the round's own radius**  
  `src/config.js:3545-3565; src/physics.js:238-243, 260; src/enemies.js:1057-1060`  
  None to the code — the geometry is right and the regress case ('a square-on shot always lands on a PRISM, and a graze always bounces') passes. But anyone retuning `reflect` off this comment will be aiming at a number twice the size of the real one, which is how 0.55 was fitted to a broken test in the first place.  
  _Fix:_ Rewrite as: lands iff |b| ≤ 0.6·(e.r + p.r), which is 0.73·r for a BOLT and moves with the round's radius; 60% of the hit aperture, 73% of the body's visible width. Drop 'a bit over a third of its area'.

- **[cosmetic] Three of the eight named flight forms have no muzzle arm, so RIME, SPORE and TITHE leave the barrel wearing BOLT's flash**  
  `src/projectiles.js:723-772 (the muzzle switch: cases pellet, shell, slab, arc, dart, default); src/fx.js:296-320+ (impactFx: pellet, shell, arc, dart, slab, flake, pod, tithe); src/projectiles.js:515-711 (the draw switch: all eight plus default)`  
  Three of nine rounds are identifiable at the barrel only by colour, where the other six have a shape. Purely a picture gap; nothing about damage or the hash.  
  _Fix:_ Either add three arms (a cold glint, a rising puff, a ledger ring — the same vocabulary impactFx already uses for those forms), or soften the header to say which forms have their own and why the rest share BOLT's. The added arms must use computed velocities only, per the block's own second rule.

- **[low] SPIRAL leftovers in the BOLT fire path: a `slow` constant threaded through all nine rounds, a dead `scale` parameter, and an orphaned docstring in the Projectile constructor**  
  `src/shooter.js:480 and 521,535,549,577,598,616,630,673,708; src/shooter.js:471-478 (`shoot(world, scale = 1)`) and :489; src/projectiles.js:25-30`  
  None — both are ×1. It is dead weight in the hottest authoring surface in the game, and the orphaned comment actively misleads: it reads as documentation for `this.form`.  
  _Fix:_ Delete `slow` and its nine multiplications, drop the `scale` parameter and the `* scale` at :489, and delete projectiles.js:25-30. (The same sweep would catch the other stranded SPIRAL comments now attached to unrelated fields at game.js:177, game.js:425-435 and shooter.js:341.)

- **[medium] Six arsenal rows still quote pre-build-216/218 damage — the loadout sheet, the strip and the first-use caption all read them**  
  `src/arsenal.js:90, 99, 103, 107, 116, 164; against src/config.js:1002-1006, 1037, 903, 1065, 1079, 930, 700`  
  Every place the game states a number for these six is wrong, by 10% on five mines and by 70% on SPINE — the one round whose whole build-218 justification was that its old number made it not worth carrying. A player comparing SPINE (20) against BOLT (26) on the loadout sheet is reading the case for a decision that was reversed a build ago.  
  _Fix:_ Update the six `dmg` strings to 105, 79/s, '81, twice', 37/s, '29 x 14', '34, fading'. Better: have `check-build.mjs` assert each `dmg` that is a bare quantity against its config number, the way it already asserts the tree's coverage — this is the second balance pass to leave the table behind.

- **[cosmetic] drawFx still ends two particle branches on a bare `ctx.globalAlpha = 1`, the form the same file's own comment calls forbidden**  
  `src/fx.js:551, 558, 585, 593; compare src/fx.js:567-573 and src/util.js:106-125`  
  None today. It is the trap CLAUDE.md records costing four separate fixes before build 210's fizzle would fade — a property set at the call site and silently overwritten one layer down — left standing two lines from the note about it.  
  _Fix:_ `const was = ctx.globalAlpha; ctx.globalAlpha = was * …; … ctx.globalAlpha = was;` in both branches, matching the `fill` branch above them.


### EXPLOSIVE (HE) and SHOTGUN (SCATTER), end to end — config keys, geometry, picture vs damage, guards, tree, arsenal rows, particle cost, DOUBLE TAP / SALVO / ability bar

- **[medium] CLUSTER stops being "the same total on one body" the moment OVERPRESSURE is bought — and stops being drawn at exactly the levels where it doubles single-target damage**  
  `src/shooter.js:1499-1523; src/config.js:602`  
  CLUSTER is sold as an area/line node ("the same total on one body") and is in fact a ×2.28 single-target blast-damage node once the HE line is finished — and the two levels where it more than doubles the damage inside the front ring are precisely the two where it draws nothing extra, so the picture is identical to an HE with no CLUSTER at all.  
  _Fix:_ Scale the offset with the radius — `const cx = x + Math.cos(a) * c.out * world.up.blastR;` (same for cy, and in the draw guard) — which keeps the clover proportional, restores "the same total on one body" at every level, and keeps the sub-rings drawn because `out·blastR + 0.5r > 1.02r` holds for all L. Failing that, rewrite the comment and the row to say CLUSTER is a damage node above one OVERPRESSURE level.

- **[medium] TRACER is a larger SCATTER range upgrade than LONG THROW, and puts the reach back past the value config.js deliberately cut**  
  `src/shooter.js:489, src/shooter.js:521-525; src/config.js:660-665; src/upgrades.js:346, :396`  
  "A tight cone that dies short. Close range only." (arsenal.js:157) and "The cone still ends, but further out." (upgrades.js:397) are both false on a bought gun: the cliff the round is built around is gone, and it is a whole-rack node with no SCATTER wording that removed it.  
  _Fix:_ Take up.speed out of the pellet's reach rather than out of its speed — e.g. in the shotgun branch pass `life: g.life * up.shotRange / up.speed`, so TRACER makes pellets arrive sooner (which is what its row sells) without making them travel further. Alternatively give the pellet a distance budget instead of a life.

- **[medium] HEAVY is worth ×1.6 on HE, not ×4: the blast impulse is the one term in heBurst that does not take the tree, while the blast damage does**  
  `src/shooter.js:1498, src/shooter.js:1512; src/upgrades.js:348`  
  On the one round whose knockback is 83% blast, the ammo branch's knockback node buys 60% more shove where its row promises 300% more. Nothing on screen or in the tree says the blast is exempt.  
  _Fix:_ `impulse: b.impulse * world.up.impulse` at shooter.js:1498 and `b.impulse * c.scale * world.up.impulse` at :1512 (mines and abilities have their own impulse nodes and should stay as they are), or amend HEAVY's row to "on every hit" meaning the round and not its blast.

- **[low] `fx.cap` is a ceiling no blast radius in the game can reach, and the ripple's lower clamp arm is likewise unreachable**  
  `src/config.js:643; src/shooter.js:1548, src/shooter.js:1639`  
  None visible. It is a guard that has never fired and a comment ("scaled by size, and capped", config.js:640) describing protection that is not in force — the counts are bounded by the ladder, not by the cap. It becomes live and silently raises every count 33% the day a fourth OVERPRESSURE level or a second blast-radius node lands.  
  _Fix:_ Either set `cap` to a value the ladder can reach (1.66 is today's top, so 1.7 makes it a real ceiling with headroom) or delete it and say the counts are bounded by blastR's three levels. Same for the 0.7 in the ripple clamp.

- **[low] The "about 210 units" figure that justifies dropping the sub-blast rings is 156, and the code's own cutoff is 150**  
  `src/shooter.js:1515-1523; README.md:1884-1887`  
  None on screen; it is the number the design decision is recorded with in two places, and it puts the change one whole level later than it happens.  
  _Fix:_ Replace "about 210" with 156 (or with "from the second OVERPRESSURE level") in both the source comment and the README.

- **[cosmetic] "Up to forty-five per trigger pull" is 33; 45 is only reachable as "in the air at once", and only with LONG THROW bought**  
  `src/projectiles.js:735; src/fx.js:298 (cf. src/projectiles.js:516-518, which states it correctly)`  
  None. Two of the three sites quote a per-pull figure 36% above the real one, which is the figure a future "can we afford a richer pellet?" decision would be made against.  
  _Fix:_ Say 33 per trigger pull, 44 in the air, in all three places — or reference the one at projectiles.js:517 which is already correct.

- **[low] The arsenal's "15 + 44 blast" is a figure no body ever takes, and the rack comparison that set SPINE's damage is measured against it**  
  `src/arsenal.js:142; src/enemies.js:4501-4528; src/physics.js:258; src/config.js:694-695`  
  HE's row overstates the delivered blast by 6% on the smallest bodies and 43% on the largest, where BOLT's "26" is delivered whole. And the rack table that justified raising SPINE to 34 compares it against two numbers neither of the other rounds actually delivers.  
  _Fix:_ Either state the blast as "44 at the centre, less further out" on the row, or re-take the rack figures at a stated range and body size and record that in the SPINE note.

- **[low] SPINE's arsenal row still says 20 against a config of 34 (out of scope, same table, four surfaces)**  
  `src/arsenal.js:164; src/config.js (rounds.spine.damage = 34, build-218 note at :694-706)`  
  Every surface in the game tells the player SPINE does 20 damage; it does 34. The pierce half of the row is still correct.  
  _Fix:_ `dmg: '34, fading'`.

- **[low] Two dead numbers in the fire path both rounds go through: `scale` and `slow`**  
  `src/shooter.js:477, src/shooter.js:480 (and :489, :521, :535)`  
  None at runtime. It is the shape CLAUDE.md records from SPIRAL's removal one layer up — `windAt`/`rateAt` sat with no caller for two builds — except here the dead value is threaded through every round rather than sitting in a private function, so it reads as a live knob.  
  _Fix:_ Delete `slow` and the nine `* slow`, drop the `scale` parameter and its `* scale`, and strike the SPIRAL sentences from the `shoot` and `canFire` headers.

- **[low] BUCKSHOT does not touch SCATTER at all, and the fan it does multiply is drawn with the expensive form SCATTER's exists to avoid**  
  `src/upgrades.js:487; src/mines.js:391-405; src/projectiles.js:515-523 vs :702-708`  
  SPALL's fully-bought fan costs roughly double the draw calls of the same number of SCATTER pellets, and 36 identical BOLT tracers read as a volley of bolts rather than as the "wall of shot" arsenal.js:117 promises. No damage consequence.  
  _Fix:_ Add `form: 'pellet'` to the `fire()` options in mines.js:396 — the colour (#ffd9a0) and radius (3.4 against 3.2) already match SCATTER's pellet.


### ARC (CFG.rounds.arc) and SPINE (CFG.rounds.spine), end to end: chain logic, FIFTH LINK, SLIVER/SPLINTER budget, THROUGH AND THROUGH, DOUBLE TAP, and what the tree's rows claim

- **[high] SPINE's card still says DMG 20. Build 218 made it 34.**  
  `/home/user/Shooter/src/arsenal.js:164 (also /home/user/Shooter/src/config.js:705, /home/user/Shooter/src/config.js:774)`  
  The row a player reads before spending 900 energy on SPINE understates the round by 41% and, against the rest of the rack shown beside it in the same sheet, still ranks SPINE last — which is the judgement build 218 existed to reverse. The purchase decision is made on a number the round has not had for two builds.  
  _Fix:_ `dmg: '34, fading'` at arsenal.js:164, and fix the SPINE figure in SLUG's header at config.js:774 while you are there.

- **[high] ARC's chain damage never sees `up.damage` — 88% of the round is immune to the whole AMMO damage line**  
  `/home/user/Shooter/src/projectiles.js:187 and /home/user/Shooter/src/projectiles.js:208 (contrast /home/user/Shooter/src/shooter.js:489, :694, :1498, :1511)`  
  A player who loads ARC and buys the AMMO damage line gets 1.6x where the tree's rows promise 3.4x. Worse, `gunScale` (shooter.js:311 — `const out = up.damage * (up.salvo ? 1 + 2 / up.salvo : 1) / (up.rate || 1);`) is what boss.js:199 scales boss health by, so buying HOLLOWPOINT makes every boss 3.375x tougher while making an ARC round 1.63x stronger. ARC is the one round in the rack that gets punished for buying damage.  
  _Fix:_ projectiles.js:187 → `let damage = g.jumpDamage * up.damage;`. If the flat chain is deliberate, it needs a comment saying so, because the three comparable sites in shooter.js all say the opposite.

- **[low] `chainFrom` is a damage path with no `spent` guard, in the same file as the sweep that has one**  
  `/home/user/Shooter/src/projectiles.js:195 (contrast /home/user/Shooter/src/projectiles.js:308)`  
  Small and time-boxed: for 0.9 s after a glitch-out, ARC's links are drawn to visibly dissolving bodies and land damage that cannot be cashed in (`Enemy.destroy` refuses at enemies.js:1256 — `if (this.fizzle > 0) { this.dead = true; return; }`), while each corpse consumed by `seen` (projectiles.js:203) is a link the live body beside it does not get. A corpse whose remaining hp is under the link damage also pops out of existence mid-dissolve rather than finishing the fade, since `destroy` returns before `explode`.  
  _Fix:_ projectiles.js:195 → `if (e.dead || e.spent || seen.has(e)) continue;`. Do NOT add `staged` — config.js says staged never gated projectile collision, and a chooser's rule on a damage path is the build-219 mistake.

- **[low] A body killed by an ARC jump does not die "earthed" — only the one the round physically touched does**  
  `/home/user/Shooter/src/projectiles.js:208, /home/user/Shooter/src/enemies.js:1063, /home/user/Shooter/src/fx.js:378-386`  
  Player-visible but quiet: the round whose whole identity is the discharge shows the discharge death on the one body the dart touched and not on the four it earthed. Picture disagrees with damage.  
  _Fix:_ In `chainFrom`, before projectiles.js:208: `best.lastHit = 'arc'; best.lastHitT = world.time;`

- **[cosmetic] The chain is drawn in the pale blue build 209 took off ARC's flight**  
  `/home/user/Shooter/src/projectiles.js:206 and :248 (contrast /home/user/Shooter/src/shooter.js:554-561, /home/user/Shooter/src/arsenal.js:159, /home/user/Shooter/src/fx.js:382)`  
  The round's chip, its dart and its deaths are violet; the lightning between bodies is cyan. Same mismatch build 209 fixed, on the larger half of the effect. I am flagging rather than asserting — an author could reasonably want electricity blue — but three of the round's four visuals moved and this one did not.  
  _Fix:_ `glow: '#a37bff', hot: '#e6d4ff'` on the Arc bolt and `'#c79bff'` on the link sparks, or a comment at projectiles.js:248 saying the blue is deliberate.

- **[low] SLIVER's row says the same thing at both pips, and the second level is the multiplicative one**  
  `/home/user/Shooter/src/upgrades.js:412-414, /home/user/Shooter/src/menu.js:420 and :435`  
  The player has no way to tell what the second SLIVER level buys. Every other multi-level node whose second step is qualitatively different carries the difference in its header, not its row, but SLIVER is the one where the second step is worth more than the first.  
  _Fix:_ Give the row the second level, e.g. 'A spine comes apart into an arc of fragments through the first body it hits. Again, at the second level.' — or split the ladder into two named nodes.

- **[low] A SLIVER fragment can come apart inside the body it was born in — on a BULWARK, without TRACER**  
  `/home/user/Shooter/src/shooter.js:292-297, /home/user/Shooter/src/projectiles.js:92, /home/user/Shooter/src/projectiles.js:122`  
  On a BULWARK only, and only before TRACER is bought: one extra fragment hit and one pierce spent inside the birth body, and an arc that was meant to open out the far side opening inside it instead. No count blowup — the budget holds.  
  _Fix:_ Make the cover a distance rather than a fixed 0.06 s: pass `ignoreT: (2 * e.r + 8) / (sp * S.speed)` from `sliverOn`. Keep it in `sliverOn`'s opts, not in the constructor default at projectiles.js:92, which OVERSTUFFED's rebound also uses.

- **[low] THROUGH AND THROUGH has no `levels` and the tree sells it three times: +6 pierce, ten bodies**  
  `/home/user/Shooter/src/upgrades.js:362, /home/user/Shooter/src/tree.js:205`  
  None that contradicts a row. It is a balance question, not a defect: SPINE's stated identity is "3 more bodies behind the first" and a fully bought one goes through nine.  
  _Fix:_ A decision, not a patch: leave it, or `levels: 2` (+4, seven bodies). If it is capped, regress.mjs's `=== 134` level total moves by the number of levels removed.

- **[cosmetic] Orphaned header above COMPOUND, left behind when COUNTERSPIN went in build 217**  
  `/home/user/Shooter/src/upgrades.js:358-360`  
  None to the player. It is the `windAt`/`rateAt` shape CLAUDE.md records: a header explaining something that no longer exists, now attached to something it misdescribes, and the next reader capping COMPOUND on its authority.  
  _Fix:_ Delete upgrades.js:358-360. (Whether COMPOUND itself should be three levels is a separate question outside this audit.)


### SLUG (CFG.rounds.slug) and RIME (CFG.rounds.rime), end to end — build 219

- **[high] SLUG's shove is clipped by the cruise×6 speed cap on 21 of 23 mobile types, and SLEDGE's whole ladder (and HEAVY's) buys those types nothing**  
  `src/shooter.js:601, src/enemies.js:1113 + 1178-1181, src/physics.js:116, src/upgrades.js:363`  
  SLEDGE ("+60% slug knockback", 3 levels, 500+850+1200 = 2550 energy on top of SLUG's 900) does literally nothing to MOTE, NEEDLE, SEED, DRIFT, GLUT, PLATE, TOW, HERALD, PRISM, SPLITTER, LURCHER and every boss minion — the bodies the player actually shoves. HEAVY's ×4 on top of it is equally inert on them. The round the config calls "an enormous shove" delivers 12-23% of its rated impulse to the light half of the roster; the two types that do feel the ladder are the two the player least wants to move.  
  _Fix:_ Give the SLUG round the same opt-in PULSE already has: carry a `throwOff: true` on the projectile (src/shooter.js:595-612), thread it through `resolveSegment` → `takeHit` → `applyDamage` as a parameter defaulting to false, so the shove pays neither the `kicked` fade nor the cruise×6 clamp (it gets `thrownSpeed` 720 and `CFG.pile.thrown` instead, which is what PULSE gets). Do NOT raise the cap globally and do NOT change `applyDamage`'s default — either would change what BOLT does. Note the ladder will then be live and SLEDGE/HEAVY need a balance look for the first time.

- **[medium] The RIME chill's own comment claims a mass dependence the code does not have, and names the wrong direction**  
  `src/enemies.js:856-863`  
  None on screen — the chill works, just not for the reason written next to it. The cost is to the next change: this is the one paragraph a reader consults before touching RIME, and it points at mass, which is the one quantity that cannot affect it. CLAUDE.md's `world.endless` and `(hit - centre)` entries are both this shape — a name that reads like a mechanism and is not one.  
  _Fix:_ Correct the comment: the drag is a pure velocity multiplier and is mass-independent by construction; what varies between bodies is `accel`, because steering re-accelerates toward cruise every substep and the equilibrium is accel/(accel + 446) of cruise. If mass-dependence is actually wanted, it has to be a force (`v -= v̂ · F · invMass · dt`), not a multiply.

- **[medium] RIME does not chill to "a crawl": the steering puts back three quarters of what the drag takes, and it is weakest against the fastest bodies**  
  `src/config.js:785-793, src/arsenal.js:187, src/enemies.js:859-863 vs src/enemies.js:786-787`  
  A player who reads "barely moves" and fires RIME at the fast light bodies gets roughly a halving, not a stop — and gets the best result on the slow heavy ones that were never the problem. Whether that is a bug or an unwritten trade is a judgement call I cannot make from the code; what is certainly wrong is that no surface says so, and `drag: 0.02` reads as an effective 98% removal that never happens against anything that steers.  
  _Fix:_ Either (a) leave the mechanic and fix the words — say the chill halves-to-quarters a body's pace and that its bite depends on the body's own `accel` — or (b) make the chill a term the steering answers to, the way STASIS is (`const slow = world.stasis > 0 ? 0.12 : 1` at enemies.js:738, 372, 432, 511), so `cruise` and `k` are both scaled while chilled and the number in config is the number delivered. (b) is the one that makes `drag: 0.02` honest, and it is what the STASIS precedent in this codebase already does.

- **[low] Neither SLUG's `slugged` nor RIME's `chill` is drawn: two multi-second status rules with no on-screen tell at all**  
  `src/enemies.js:246 and :288 (the only writes outside shooter.js/game.js); no reader in any draw path`  
  The player cannot see why a body driven through a crowd sometimes does 300 damage and sometimes none, nor which bodies are chilled and for how long. It is not a wrong picture, it is an absent one — but the SLUG case is the one rule the round's whole cost is justified by.  
  _Fix:_ A cheap persistent tint would do: an outline shift toward `#b8c6d8` while `slugged > 0` and toward `#8fe3ff` while `chill > 0`, multiplied into whatever alpha the caller set and put back (never `= 1` on the way out — see CLAUDE.md's `drawGlow` entry).

- **[low] `calm` spreads on contact, so "only what a SLUG threw is exempt" is not what the code does**  
  `src/config.js:770-771 vs src/game.js:1590-1599`  
  One SLUG into a crowd switches off collision damage across the whole touching component of that crowd for up to 2.4s, including impacts the SLUG had nothing to do with — a WELL knot or a BLOOM detonation landing inside a slugged pile trades nothing. Also protects a DECOY, which is otherwise designed to be worn down by the pile it collects. Bounded and short, so I do not think it is a defect; the stated rule is what is wrong.  
  _Fix:_ Amend config.js:770-771 to say what game.js does: the mark spreads on contact at its remaining time, so what is exempt is the SLUG's chain, not only the body it hit. (Or, if the narrower rule is what is wanted, mark the recipient at a fraction of the remaining time so a second hop is visibly weaker — but that is a balance change, not a correction.)

- **[cosmetic] config.js's SLUG rationale quotes SPINE at 20; SPINE has been 34 since build 218**  
  `src/config.js:774, against src/config.js:705`  
  None in play. It is a comment; but it is the comment that justifies SLUG's damage number, and the next person tuning SLUG will read "SPINE's 20" as the floor it has to clear.  
  _Fix:_ Change "SPINE's 20" to "SPINE's 34" at config.js:774.

- **[low] "Chills for 3.2s" is the base value; a fully bought DEEP FREEZE makes it 15.72s**  
  `src/arsenal.js:187, src/upgrades.js:364, src/tree.js:63 + :205`  
  The loadout sheet understates RIME's duration by 4.9× once the node is fully bought. Low, because the chill is refreshed by the next shot 0.486s later anyway — DEEP FREEZE only matters when you switch targets or switch rounds — but the number on screen is wrong for anyone who bought it.  
  _Fix:_ Either render the effective value (`CFG.rounds.rime.chill * world.up.chill`) in the row, or reword to "Chills for 3.2s, longer with DEEP FREEZE". Note that a concurrent change landing during this audit added a regress case (`says('rime', CFG.rounds.rime.chill)`) that pins this string to the BASE value, so any fix has to move that assertion with it.


### SPORE (CFG.rounds.spore) and TITHE (CFG.rounds.tithe), end to end: build 212's cap + node rework, build 214's AoE visuals, and TITHE's damage ramp and money path

- **[high] TITHE's mark is a FLOOR on e.bounty, not a multiplier — so it pays less and less as the ladder climbs, and nothing at all from tier 15**  
  `src/shooter.js:696; src/enemies.js:2947; src/enemies.js:3465; src/config.js:218; src/config.js:828`  
  Player-visible. TITHE's whole economic identity — the reason to carry a round that "barely hurts on the first hit" — silently decays across the ladder and is worth exactly zero energy from tier 15 up (tier 7 on an OVERCLOCK wave). A player who marks a body at tier 20 sees the mark drawn on it (enemies.js:1441) and banks not one point more than if they had shot it with BOLT.  
  _Fix:_ Make it a multiplier applied once per body rather than a floor: give Enemy a `tithed` flag and do `if (!e.tithed) { e.tithed = true; e.bounty *= g.bounty * w.up.bounty; }`. That keeps the authored 3.5x at every tier and keeps OVERCLOCK and the tier step stacking, which is what enemies.js:3116-3120 already claims happens. If 3.5x compounding on top of the tier is too much late, retune `CFG.rounds.tithe.bounty` — a number that is at least reachable.

- **[medium] "each mark ... pays more" is false: the payment is set in full on the first hit and never deepens**  
  `src/arsenal.js:195; src/config.js:818-822; src/shooter.js:693-696; src/enemies.js:1428-1430`  
  Player-visible in the sense that the stated reward for staying on one body does not exist: one TITHE hit buys the entire payout, and the other thirteen buy only damage. No regress case asserts the payment (the TITHE case at regress.mjs:5005-5065 measures only the drawn mark's green pixels).  
  _Fix:_ Either scale the bounty with depth at the site that owns the ramp — `const deep = e.marks / (g.marks + w.up.titheMarks); e.bounty = ... * (1 + (g.bounty - 1) * deep)` applied as a multiplier per the finding above — or, if a flat mark is what is wanted, correct arsenal.js:195, config.js:820 and enemies.js:1429 to say so. Whichever is chosen, it needs a case: `marks` is currently the only ramp in the game with no assertion on its payout side.

- **[medium] Nothing in the game raises a SPORE patch's damage — including HOLLOWPOINT, which reaches only 11% of the round**  
  `src/shooter.js:643; src/upgrades.js:47-48; src/shooter.js:489; src/projectiles.js:191-204 (working tree)`  
  Player-visible: a SPORE build gets 1.27x out of the AMMO damage line where every other round gets 3.375x, and there is no node anywhere in the tree that makes burning ground burn harder. Note it also cuts the other way through build 214's `gunScale()` (shooter.js:309-315), which tempers boss health by `up.damage * salvo / up.rate` — a SPORE player pays the full temper for damage the round never received.  
  _Fix:_ Either `dps: g.patch.dps * w.up.damage` at shooter.js:643 (and `T.patch.dps * world.up.damage` at mines.js:565 for THORN, which has the identical hole), or restore a dedicated ladder. Build 212 removed `patchDps` because BLOOM OUT was selling radius AND burn at three uncapped levels; the fix for that was capping the node, not removing the quantity from the damage line. If it is scaled, re-run the cap arithmetic in config.js:804-814 — 3 x 46 x 3.375 = 466/s single-target is above the 362 the cap was introduced to remove.

- **[medium] A SPORE patch is drawn smaller than the circle it burns for two thirds of its life, and the rim band — "the only thing marking where the damage stops" — is gone for 56% of it**  
  `src/patch.js:245-251; src/patch.js:185-186; src/patch.js:236-244; src/patch.js:232`  
  Player-visible and exactly the defect patch.js:241-243 says was fixed: for most of a patch's life the burning ground is drawn well inside the ground that is burning, with no boundary marker at all after 1.96s. It matters most in the case the round is designed for — a patch placed ahead of something and then left alone, which lives the full 4.5s. Under sustained fire the cap retires patches at ~1.7s old so the worst of it is masked.  
  _Fix:_ Exempt the rim band from the die-back (`if (!sp.rim && sp.d > reach) continue;`), so the boundary stays drawn and only the interior grain thins — the die-back still reads as a timer. Or move the floor and the slope so full extent covers the first two thirds: `Math.min(1.14, 0.6 + left * 0.72)` holds reach >= 1 to left = 0.556 and never falls below 0.6. Either way, correct the "Full extent until the last third" sentence.

- **[low] `retire()`'s `this.max = Math.max(this.max, this.life)` is a statement that can never do anything, and it defeats the comment above it**  
  `src/patch.js:133; src/patch.js:118-127; src/patch.js:214`  
  Cosmetic but real: the fourth shot makes the oldest patch pop to a third of its size on one frame rather than closing over 0.35s — the reading the retirement comment exists to prevent. Plus a dead statement that looks like a guard.  
  _Fix:_ `this.max = this.life;` — one character class of change, and it makes `left` run 1 -> 0 across the retirement so `reach` closes 1.14 -> 0.26 and `k` fades over the whole 0.35s, which is what the header describes.

- **[low] `Patch.rim()` and `this.edge` have had no caller since build 214 — a private method with a docstring describing two layers that were deleted**  
  `src/patch.js:195-207; src/patch.js:112-115`  
  None for the player. This is the `windAt`/`rateAt` shape CLAUDE.md records from build 217: dead private code with a header that documents a feature that no longer exists, which nothing in the suite or the bundle will ever fail on.  
  _Fix:_ Delete `rim()` and `this.edge` together with their comments. Nothing else reads either.

- **[medium] upgrades.js's own end-of-file docstring says "`levels` absent means without limit" — the opposite of tree.js's `u.levels ?? 3`, and it is the documentation the levels trap keeps being read out of**  
  `src/upgrades.js:797-805; src/tree.js:205; src/upgrades.js:792-796`  
  No direct player consequence; it is the root cause of a defect class that has shipped five times, two of them balance blowouts (HOT LOAD at 0.85^3, STANDING ORDER at 0.8^3 behind a row saying -20%).  
  _Fix:_ Rewrite the block to state the real rule ("absent means three, per tree.js's `u.levels ?? 3`; `repeat` is the only unbounded node") and re-attach it to something, or move it to `leaf()` in tree.js beside the line it describes. Deleting it outright is also better than leaving it.

- **[low] LEVY carries no `levels` and is sold three times (3.5 -> 11.8125), with no note; COMPOUND has just been given that note in the working tree and LEVY was not**  
  `src/upgrades.js:369; src/upgrades.js:365; src/tree.js:205; src/tree.js:67`  
  None today, if three is what was wanted. It is a level count nothing in the tree, the suite or a comment pins, on the two nodes that carry TITHE's entire identity — which is the state HOT LOAD and STANDING ORDER were in.  
  _Fix:_ Write `levels: 3` on both, or add the same one-line note LEVY's neighbour just got. If the level totals are being pinned in regress.mjs the way `up.rate` and `up.cooldown` are, add `up.bounty === 1.5 ** 3` and `up.titheStep === 1.6 ** 3` to that case.

- **[cosmetic] The SPORE row says "Three at a time" and stays saying it after SECOND GROWTH buys a fourth**  
  `src/arsenal.js:191; src/shooter.js:661; src/upgrades.js:477-479`  
  Trivial: the loadout sheet understates the round by one patch for a player who has bought SECOND GROWTH. Flagging it mainly because the row is one of the six that had just gone stale in the same file for the same reason.  
  _Fix:_ Either drop the sentence and let SECOND GROWTH's own row carry the count, or add `says('spore', CFG.rounds.spore.patch.cap)` to the new arsenal case so the base number cannot drift, and accept that the row describes the unbought round (which is what every other row does).


### BLAST and SNARE mines end to end (src/mines.js, CFG.mines / CFG.snare, and every tree node that touches them)

- **[medium] "The oldest goes" is not the oldest — updateMines swap-removes, so the eviction picks an arbitrary mine**  
  `src/mines.js:225-229, src/mines.js:635-637, README.md:235`  
  Player-visible on BLAST above all: the mine that bangs on eviction is not the fourteen-second-old one you had written off, it is (often) the one you just watched land. Same for SNARE: a snare that has been sitting armed on a lane gets skipped while a fresher one is spent. Reachable exactly where the config says the cap is reached — SEED's three-at-once (mines.js:222) and PAIRED CHARGE.  
  _Fix:_ Give each Mine a monotonic serial in the constructor and pick `world.mines.reduce(...)` on the lowest live serial, or splice instead of swap-remove at 636-637 (the list is at most 5 long, so order-preserving removal costs nothing).

- **[medium] A SNARE evicted by the cap plays its whole snap and then grips for zero frames**  
  `src/mines.js:357-358, src/mines.js:229, src/mines.js:289-296`  
  The eviction comment promises "nothing simply evaporates". A SNARE evicted this way emits the full 210-unit violet closing ring, a screen shake and the WELL sound, and holds nothing at all for zero of its 2.4 seconds. (The mirror case is quieter but also wrong: a snare evicted *while* gripping falls through to the bare `m.dead = true` at 358 and gets none of the release ring/sparks/`audio.pop(0.9)` that mines.js:602-605 gives a hold that ends normally.)  
  _Fix:_ Either drop the snare arm from `retire` (let an evicted snare die silently, like WIRE/THORN/LODE/VOID do) or make eviction lazy — mark the victim and let `updateMines` run its hold out — but a snap that is cancelled in the same statement should not be paid for with a ring and a shake.

- **[medium] The upgrade collar draws 7 marks for SNARE's 5 upgrades — `pips` re-derives a denominator that `mineGrade` already computed, and gets it wrong for six of eight kinds**  
  `src/mines.js:771, src/mines.js:121-145, src/mines.js:838-843`  
  The gauge over-reads by up to two marks on SNARE (and on VOID, KNELL, WIRE, LODE, THORN). This is the exact fault the `mineGrade` docstring at 100-108 was rewritten to stop — "A mine that grew because of something it cannot use is the readout lying about the machine" — fixed in the numerator and left in the denominator. BLAST is correct to the mark at every level.  
  _Fix:_ Have `mineGrade` return (or a sibling expose) the `of` it already computes, and use it: `pips = Math.round(gr * of)`. That is one number instead of a hand-kept 8/6/7 table that has to be re-audited every time a kind gains a node.

- **[low] DEAD WEIGHT is sold three times: a snare holds 10.8s, not the 3.96s the README documents, and outlives the 15-second "contract" by ten**  
  `src/upgrades.js:461, src/config.js:1048, README.md:250, src/config.js:1013-1015`  
  One of five cap slots is held for a quarter of a minute past the life that is advertised as a contract, and the documented ceiling on the hold is off by 2.7x. Uncertain whether the three levels are the trap or the intent: the level TOTAL is pinned at 134 by regress.mjs:495 and mines.js:373 reasons explicitly about "three DEEP CHARGEs", so the sibling defaults in FIELD look deliberate. What is not defensible either way is the README row and the life contract.  
  _Fix:_ Decide it explicitly and write `levels:` on the node either way (that is the whole point of the `?? 3` rule), then correct README.md:250 and README.md:256 ("holds it for three and a half seconds" — the base is 2.4). If three levels stay, `CFG.mines.life`'s contract comment needs the gripping exception spelled out.

- **[low] `mineGrade` credits SALTED to SNARE but not the two nodes that scale what SALTED does**  
  `src/mines.js:112-120, src/mines.js:126-132, src/mines.js:362-379`  
  None to the fight. It is the readout only: a SNARE build with SALTED + DEEP CHARGE + SHRAPNEL is measurably heavier than one with SALTED alone and reads identically, which is the same class of lie the block was written to remove. I am not certain this is unintended — a grade that changes shape depending on whether SALTED is owned is arguably worse — but the comment at 113-118 names `fizzle` and the code then excludes exactly the kinds that only reach it through `fizzle`.  
  _Fix:_ Either make the two conditional on SALTED (`if (bang || up.mineFizzle)`), or amend 113-118 to say `detonate` and `toll` and that `fizzle` is deliberately not counted.

- **[low] The snare's drawn wires walk `world.enemies` only; `grip` also hauls `world.drops`**  
  `src/mines.js:677-684, src/mines.js:330-331`  
  Energy motes inside the 210-unit reach are dragged into the knot with no wire drawn to them. Minor and in the safe direction (a hold that exists and is not drawn, rather than the reverse), but it is the stated invariant.  
  _Fix:_ Factor the pair of lists into one array and iterate it in both places.

- **[low] A SNARE snapped on a boss's frame draws wires to a knot it cannot move — `grip` never checks `type.fixed`**  
  `src/mines.js:304-331, src/mines.js:616-632, src/enemies.js:~528 (drive)`  
  The snare is spent — one of five slots and one of its two-to-ten seconds — on a body that cannot be hauled, and the draw block at 677-684 strings violet wires to it, which is precisely "the picture is drawing a hold the snare does not have". BLAST is unaffected: a blast on boss structure is legitimate damage.  
  _Fix:_ Add `|| e.type.fixed` to the trigger guard at 623 and to the two `grip`/draw guards at 318/680. Note this is not a `spent` question — the frame is live at the time.

- **[low] detonate's ring crosses the blast radius dimmer and thinner than the version its own comment says it replaced**  
  `src/mines.js:266-276, src/mines.js:370-378, src/mines.js:512-515, src/fx.js:588-594`  
  Small, and I want to be clear about why: each of the three pushes a `Shock` at exactly the true radius on the next line (275→277, 378→379, 515→516), and `Shock` opens to `this.r` and holds full for ~0.7s (fx.js:28-52). The Shock is what answers "how far did that reach", so the player is not misled — the ring's own peak just marks 131 instead of 168. The defect is in the claim, not the picture.  
  _Fix:_ Draw them the way `spall`'s pellet burst (mines.js:436) and `snap` (mines.js:292) already do — contracting, `ring(x, y, br, br * 0.4, …)` — so the brightest, widest frame is on the radius, and let it drift inward as it dies. Or delete the ring and leave the Shock, which is already doing the work.

- **[cosmetic] `mineScale` is exported and has no caller anywhere in the repo; `drawMines` re-implements it inline**  
  `src/mines.js:148-153, src/mines.js:770`  
  None today. It is the `windAt`/`rateAt` shape CLAUDE.md records from build 217-219 ("Nothing fails on dead private functions; bundle.mjs will happily ship them"), except this one is `export`ed, so even a dead-code sweep on module-private functions would miss it, and the duplicated 0.26 is a second place to forget.  
  _Fix:_ Delete it and leave line 770, or call it from 770 and keep one literal.

- **[cosmetic] `LAY_TONE` covers four of eight kinds; four are laid with BLAST's chime, and the module header still says "four kinds"**  
  `src/mines.js:216, src/mines.js:247, src/mines.js:1-18, src/mines.js:38`  
  Half the rack has no lay tone of its own and one of them is indistinguishable by ear from BLAST. Doc drift on top.  
  _Fix:_ Four more entries in the table, and one pass over the header, `laidCount`'s comment and README.md:212. (README.md:219-222 is separately stale: "one thrown every fifteen ... no upgrade may move any of them" against QUICK LAY, which config.js:1017 says is a dial now; and README.md:232's "5 with two [PAIRED CHARGE]" against `levels: 1` at upgrades.js:440.)

- **[cosmetic] Two inert writes on the snare path: `snap`'s `m.settle = 0`, and the `open` decay branch**  
  `src/mines.js:291, src/mines.js:538`  
  None. Listed because a write nothing can read and a branch nothing can take are the shape CLAUDE.md flags (`world.endless`), and the next reader of `snap` will assume the settle reset means something.  
  _Fix:_ Drop line 291, or comment it as belt-and-braces. Leave 538 — it is shared with seven other kinds.

- **[cosmetic] The drawn grip circle eases to the reach over ~0.31s while `grip` is at full 210 from the first frame**  
  `src/mines.js:538, src/mines.js:666-672, src/mines.js:306`  
  Minimal, and partly self-correcting: the wire bundle at 677-684 is drawn against the full `S.reach` from frame one, so the true reach is shown — just at `0.4 * m.open` alpha, i.e. faintly. The `snap` ring (292) also opens at exactly 210 at full brightness. So the reach is stated three ways and one of them lags.  
  _Fix:_ None needed; noting it so the next audit does not report the circle as the reach.


### WIRE and KNELL, end to end (src/mines.js)

- **[medium] KNELL's toll count is fixed at construction but its toll INDEX is read live, so buying FOURTH BELL mid-knell skips the loud rings**  
  `src/mines.js:179, src/mines.js:506, src/mines.js:356`  
  Buy FOURTH BELL with a knell already on the field and that knell loses its first, tightest, hardest toll: 100.3 centre damage instead of 139.3, drawn as a 177-unit ring where a 118-unit one was owed. The upgrade you just paid for makes the next knell weaker.  
  _Fix:_ Snapshot the count once: `this.tollsMax = K.tolls + world0.up.mineTolls` in the constructor, and `const i = m.tollsMax - m.tolls;` in `toll`. Fixes `retire`'s loop at the same time.

- **[medium] WIRE's cut is applied per FRAME, and applyDamage's `Math.max(1, ...)` floor turns it into frame-rate-dependent, armour-ignoring damage**  
  `src/mines.js:494, src/enemies.js:1155, src/patch.js:118-125`  
  The arsenal chip says `79/s` (arsenal.js:114). The wire does 79/s only on a 60Hz display against an unarmoured body. On a 120Hz phone it does at least 120/s, and at low HOT WIRE levels it largely ignores armour — the more armoured the target, the further the real number is from the rated one, in the target's disfavour.  
  _Fix:_ Tick it the way Patch does: accumulate `m.cutT += dt` in `cut` and apply `W.damage * world.up.wireDamage * TICK` every TICK (0.25s), with the same `dt`-scaled shove left per frame. Do NOT fix it by touching applyDamage's floor.

- **[medium] The drawn wire is shorter than the cutting wire for the whole 0.55s unspool — only the width ramps with `open`, not the length**  
  `src/mines.js:483, src/mines.js:488, src/mines.js:536, src/mines.js:725-727`  
  For the first 0.55s of every wire, a body near either end of the lane takes full cut damage and a `W.shove` push from a patch of empty ground. This is the first half-second after the mine goes live, which is exactly when the player is looking at it.  
  _Fix:_ Either interpolate the damaging endpoints in `cut` the same way the draw does (`ax = mx + (m.ax - mx) * m.open`), or stop shortening the drawn line and ramp only its alpha with `m.open` — one of the two, so the picture and the segment are the same segment.

- **[low] The upgrade collar draws more marks than the mine carries: WIRE shows two marks for one upgrade, KNELL seven for six**  
  `src/mines.js:771, src/mines.js:840, src/mines.js:110-145`  
  Cosmetic, but it is the one readout the mine has for "what you have put into it", and it miscounts for six of eight kinds — a WIRE with one upgrade wears two marks and a fully bought one wears seven. That is the fault mineGrade's own docstring says the accounting exists to prevent ("a mine that grew because of something it cannot use is the readout lying about the machine").  
  _Fix:_ Have `mineGrade` also expose its denominator (return `{ has, of }`, or add a `mineCount(world, kind)` that returns `has`) and draw `has` marks, instead of restating the count as a per-kind constant in the draw.

- **[low] `CFG.mines.cap` cannot be reached since PAIRED CHARGE was capped, so `retire()` — including KNELL's ring-everything-now path and WIRE's silent fallthrough — is dead in play**  
  `src/mines.js:225, src/mines.js:351-359, src/config.js:1024-1028, src/upgrades.js:439`  
  None visible today — but `cap: 5`, the eviction loop, `retire()`, its KNELL `while (!m.dead && m.tolls > 0) toll(...)` and its stale SEED comment are all unreachable code and a dead number, maintained as if live. The CLAUDE.md shape: a threshold nothing can reach is a door that never opens.  
  _Fix:_ Decide which it is: either lower `cap` (or restore a caller that lays more than two) so the backstop is real, or say in config.js that the cap is now unreachable and that `retire` is debug-only. If it is ever made reachable, `retire`'s fallthrough owes SALTED a `fizzle(world, m)` for wire/thorn/lode/void.

- **[low] A body standing on the WIRE is pinned at full hit-flash and drawn as a white blob**  
  `src/mines.js:494, src/enemies.js:1157, src/enemies.js:821, src/enemies.js:1425, src/enemies.js:1594`  
  Anything held on the wire is washed to a near-solid white disc — you cannot read what type it is or how hurt it is while it is being cut, which is exactly the moment you want to.  
  _Fix:_ Same tick as finding 2: one bite every 0.25s instead of one per frame lets flash decay between bites and the body reads normally.

- **[cosmetic] A body killed by the WIRE wears the wrong death, or none**  
  `src/mines.js:482-502, src/patch.js:188, src/enemies.js:1293`  
  A body finished by the wire either shows no death form at all, or shows whatever round happened to touch it inside the previous half second — a body cut in half by a wire dies as if a SPINE did it. Cosmetic only.  
  _Fix:_ Tag it in `cut` the way the patch does, with a form of its own (or the nearest existing one).

- **[low] `mineScale` is a dead export — no caller anywhere, and drawMines inlines the same expression**  
  `src/mines.js:149-153, src/mines.js:770`  
  None at runtime. It is the `windAt`/`rateAt` shape CLAUDE.md records from builds 217-219: a documented private helper with no caller that `bundle.mjs` will ship, and a duplicated constant that can drift.  
  _Fix:_ Either delete `mineScale` and leave the inline, or call it from drawMines (`const R = m.r * mineScale(world, m.kind)`) so the 0.26 has one home. It already recomputes `mineGrade`, so calling it costs nothing extra.

- **[cosmetic] Two comments still say a KNELL "goes off three times"; it goes off twice**  
  `src/mines.js:16-17, src/config.js:1070-1071`  
  None player-visible — the arsenal chip was updated and these two were not. It is the next reader of the file who pays.  
  _Fix:_ Change both to "twice" and note that FOURTH BELL takes it to four.


### THORN and LODE, end to end (src/mines.js, src/patch.js), audited against build 220 (0555081) plus an unrelated dirty tree in enemies/projectiles/shooter

- **[high] THORN and LODE are the only two mine kinds that never leave world.mines — their `continue` jumps past the splice**  
  `src/mines.js:575, src/mines.js:581, src/mines.js:635-638`  
  Player-visible and severe. Lay LODEs for a couple of minutes and the arena becomes a permanent repulsion field built from mines that expired long ago — light bodies are pinned at `integrate`'s cap and nothing closes on the turret; the field also fills with ghost LODE rings and THORN burrs that cannot be cleared, all of them costing draw time. `CFG.mines.cap`'s own comment calls 5 "a contract with the player"; the contract holds for what `laidCount` sees and for nothing else.  
  _Fix:_ Let both kinds reach the splice: replace the two `continue`s with a fall-through to the removal block, or (simplest, and it also fixes the fizzle re-entry) put `if (m.dead) { list[i] = list[list.length-1]; list.pop(); continue; }` immediately after `const m = list[i];` at 531. Removing a dead THORN must also take its `m.patch` with it, or the ground leaks instead of the mine — see the retired-THORN finding.

- **[high] `fizzle` has no idempotence guard, so an expired THORN or LODE fires SALTED's blast sixty times a second, forever**  
  `src/mines.js:362-385, src/mines.js:571-574, src/mines.js:580`  
  Game-breaking with SALTED owned and THORN or LODE selected. About fifteen seconds after the first mine expires the field becomes a grinder nothing survives, the audio layer is asked for sixty booms a second, and `world.effects` takes 2,400 Shocks a second. Without SALTED it is a permanent grey spark fountain at every site a THORN or LODE ever died, sixty frames a second.  
  _Fix:_ Two independent guards, both worth having: `if (m.dead) return;` as the first line of `fizzle` (matching `retire`'s 351), and the loop-head removal from the previous finding so the mine is gone after the first call. The guard alone stops the damage; only the removal stops the draw and the LODE push.

- **[medium] A THORN retired by the cap keeps its burning ground, against the comment saying it does not — and a THORN killed before it lands still lands and opens**  
  `src/mines.js:559-561, src/mines.js:351-358, src/mines.js:541-554`  
  More burning ground on the field than the mine cap allows, and it cannot be cleared by laying more (laying more is what creates it). A THORN cancelled before it ever armed still burns a 104-unit patch for fifteen seconds.  
  _Fix:_ Give `retire()` a thorn case that kills `m.patch` alongside `m.dead`, and skip the flight/arm work for an already-dead mine (the loop-head `if (m.dead)` removal covers the second half). Whether the ground should survive a cap eviction is a design call — but the comment at 560-561 and the code have to agree either way.

- **[medium] The pip collar over-reports: THORN draws six marks for four buyable upgrades, LODE seven for four**  
  `src/mines.js:771, src/mines.js:110-145, src/mines.js:838-843`  
  The gauge the mine wears reads high on six of eight kinds — for THORN and LODE, 50% high on the first purchase and never able to show a single mark. The drawn SIZE is correct (it is `gr` directly at 770), only the count is wrong, so the two halves of the same readout disagree.  
  _Fix:_ Have `mineGrade` return the pair, or export the denominator, rather than restating it at 771: e.g. `mineGrade` returns `{ has, of }` and `drawMines` uses `pips = has`. That makes the collar literally "one mark per upgrade" and cannot drift when a node is added to `own`.

- **[medium] `mineGrade` denies DEEP CHARGE and SHRAPNEL to THORN and LODE, but SALTED's fizzle reads both for exactly those kinds**  
  `src/mines.js:111-120, src/mines.js:126-128, src/mines.js:367-368`  
  Contradicts the docstring at 91-93 ("the reading is of what the mine can actually DO") in the same direction the comment says it was written to stop, just for a different pair of nodes. A player who has bought SALTED, DEEP CHARGE and SHRAPNEL has tripled what their THORN and LODE do when they expire and the mine shows nothing for it.  
  _Fix:_ Make `bang` and `hurts` depend on SALTED as well: `const bang = blast/knell/spall || up.mineFizzle;` and likewise for `hurts`. Note this changes `of` for five kinds and so has to land with the pip-denominator fix above, or the collar drifts further.

- **[low] `mineScale` is an exported function with no caller anywhere, and `drawMines` restates its arithmetic inline**  
  `src/mines.js:148-153, src/mines.js:770`  
  None today. The cost is the next person who edits `mineScale`'s 0.26 and sees no change on the field.  
  _Fix:_ Either call it (`const R = m.r * mineScale(world, m.kind)` — it recomputes `mineGrade`, so pass `gr` in or have it take the grade) or delete it and leave the constant at 770 with the docstring.

- **[low] `Patch.rim()` and the `edge` array it is the only reader of are dead code on THORN's ground**  
  `src/patch.js:196-207, src/patch.js:110-113`  
  None visible — a small per-patch allocation and a comment describing an outline the patch no longer draws.  
  _Fix:_ Delete `rim()` and `this.edge`, or use `rim()` for the haze so the ground is actually ragged as the comment claims.

- **[low] LODE pushes `world.enemies` only — not `world.drops` — where SNARE and WIRE both take the two lists**  
  `src/mines.js:465, src/mines.js:330-331, src/mines.js:500-501, src/arsenal.js:126`  
  Text overclaims; behaviour is the desirable one. No energy is stranded.  
  _Fix:_ Change the two lines of text rather than the code — or, if drops really should be pushed, do it only after the ghost-field leak is fixed, because 19 dead overlapping fields would otherwise sweep the floor clean.

- **[cosmetic] LODE and SNARE push grey `harmless` bodies; WIRE and the trigger test both refuse to touch them**  
  `src/mines.js:468, src/mines.js:318, src/mines.js:486, src/mines.js:623`  
  Grey drift is blown around by a LODE and hauled by a SNARE. Nothing is lost or gained; it is a picture question.  
  _Fix:_ If it is intentional, say so in the comment at 466-467 the way `cut` does. If not, add `|| e.harmless` to 468 and 318.

- **[cosmetic] `CFG.lode.push` is documented as an acceleration and used as a force**  
  `src/config.js:915, src/mines.js:476`  
  None in play. It matters when someone tunes 620 expecting heavy bodies to move.  
  _Fix:_ `push: 620, // outward force at the centre; the acceleration it gives is this x invMass`.


### SPALL and VOID mines, end to end (src/mines.js) — geometry, damage, upgrade wiring, mineGrade accounting, and picture-vs-damage

- **[high] ARMORED absorbs VOID's swallow in full — the mine is spent and the body is untouched**  
  `/home/user/Shooter/src/mines.js:455; /home/user/Shooter/src/enemies.js:1136-1140; /home/user/Shooter/src/enemies.js:264; /home/user/Shooter/src/config.js:940-942`  
  The player lays a VOID on an ARMORED wave, a body walks in, the collapse ring plays, the screen flashes, `audio.boom()` fires, the mine is gone — and the target is standing there at full health with no wreckage. It fails hardest in exactly the case VOID exists for: a heavy body the turret has not been shooting, whose plate is therefore always up.  
  _Fix:_ Do not route the swallow through the ARMORED gate. Cheapest correct form inside mines.js: in `swallow`, set `e.hp = 0` and call `e.destroy(world)` directly (destroy is the door that already refuses a fizzling body), or give `applyDamage` an opt-in `pierce`/`ignorePlate` argument defaulting false and pass it only here. Do NOT fix it by pre-clearing `e.plateT` — that hands the body a free plate on the next hit instead.

- **[medium] SPALL's wedge — "facing the way it will throw" — is drawn spinning, while the fan always leaves straight up**  
  `/home/user/Shooter/src/mines.js:857; /home/user/Shooter/src/mines.js:909-924; /home/user/Shooter/src/mines.js:170; /home/user/Shooter/src/mines.js:532; /home/user/Shooter/src/mines.js:390`  
  The only mine in the game whose damage is directional carries a direction indicator that is wrong essentially always, and turns a full revolution every 2.6 seconds. A player reading the wedge to decide whether the fan will catch something reads a random number.  
  _Fix:_ Draw the spall body outside the spin, or counter-rotate it: `ctx.rotate(-m.spin)` immediately inside the `spallM` branch (which leaves the seat, glow and pip collar spinning as before), or hoist the `ctx.rotate(m.spin)` at :857 into the branches that want it.

- **[medium] A VOID deletes a live boss core outright, in one frame, from a randomly-placed mine**  
  `/home/user/Shooter/src/mines.js:616-631; /home/user/Shooter/src/mines.js:455; /home/user/Shooter/src/boss.js:797; /home/user/Shooter/src/boss.js:289-297`  
  If it is not intended: a mine the player does not aim (mines.js:207-214, `rand` over the whole open field) can end a gate fight worth several minutes, at a rate set by dice rather than by a decision. Note the trigger loop's own comment at :620-622 shows the author thought about bosses here — but only about `spent` structure during the outro, not about the live core.  
  _Fix:_ If bosses are meant to be off-limits, the guard belongs in the trigger loop beside the existing four, on whatever already marks boss bodies (`e.ofBoss`, used by regress.mjs:5325) — skip them for `void` only, so BLAST/KNELL/SPALL keep hurting a boss normally. If it IS intended, say so in the VOID config note and in EVENT HORIZON's row, because nothing player-facing says a boss is a legal target.

- **[low] VOID's pip collar draws seven marks for five upgrades; the denominator is a hardcoded 7 against a computed `of` of 5**  
  `/home/user/Shooter/src/mines.js:771; /home/user/Shooter/src/mines.js:126-144; /home/user/Shooter/src/mines.js:838-843`  
  The collar — sold at mines.js:838-841 as the mine's version of the turret's eighteen sockets, "something you can look at and see what you have put into it" — over-reports on six of the eight kinds. On VOID it shows 3 marks after two purchases and 7 after five.  
  _Fix:_ Have `mineGrade` return `{ has, of }` (or export an `of` helper) and let the draw site use the real denominator, instead of the per-kind literal at :771. That also removes a second place to update when a kind gains a node.

- **[low] SPALL's trigger mouth is a full circle; its fan is a 51.6° cone, and the drawn mouth says otherwise**  
  `/home/user/Shooter/src/mines.js:611-631; /home/user/Shooter/src/mines.js:390; /home/user/Shooter/src/mines.js:404; /home/user/Shooter/src/mines.js:792-814`  
  A body that reaches the SPALL from the side or from below — anything the wave has already walked past, anything a PULSE or a LODE has shoved sideways — springs the whole claymore and takes nothing, and the only thing on screen that says where the fan goes is the wedge, which is wrong for the separate reason above. Likely authored ("throws everything it has in one direction", config.js:917-919); the fault is that the picture does not say so.  
  _Fix:_ Either draw SPALL's mouth as an arc rather than a full circle — `ring`/`ctx.arc` already take `a0`/`span` (fx.js:235, and the arc call at :813 could use `-π/2 ± 0.45`) — or gate the trigger on the bearing so the mine only springs on something it can actually hit. The first is the smaller change and keeps the mine's timing identical.

- **[low] `retire()` cannot run in shipped play: the cap is never reached, and the comment that justifies it names a caller that does not exist**  
  `/home/user/Shooter/src/mines.js:220-230; /home/user/Shooter/src/mines.js:351-359; /home/user/Shooter/src/mines.js:996-1004`  
  None today — the branch cannot be entered outside the debug panel. The cost is the `world.endless` shape CLAUDE.md records: a path nobody can take, with a comment maintaining a caller that was deleted, and two real bugs hidden inside it that will land the day anything lays a third mine per throw or shortens the clock below 7.9 s.  
  _Fix:_ Decide which it is. If the cap is still meant to be reachable, delete the stale SEED sentence, route `retire`'s fall-through through `fizzle(world, m)` so SALTED pays, and pick the victim by lay order (a monotonic id on the Mine, or push-order preserved by splicing instead of swap-popping). If it is not, say so where the cap is defined and keep `retire` only as the debug path it actually is.

- **[cosmetic] `mineGrade`'s comment names three readers of `up.mineDamage`; there are four, and two of them are SPALL**  
  `/home/user/Shooter/src/mines.js:113-118; /home/user/Shooter/src/mines.js:402; /home/user/Shooter/src/mines.js:408`  
  None to the player. It is the comment that carries the rule for anyone adding a kind, so a reader following it would exclude SHRAPNEL from a new pellet-ish mine that does read `mineDamage`.  
  _Fix:_ Say five reads in four functions — detonate, fizzle, toll and spall (twice, the pellet and its burst).

- **[low] VOID's collapse ring is drawn on the mine while the body vanishes up to 165 units away, and EVENT HORIZON makes it worse**  
  `/home/user/Shooter/src/mines.js:449-453; /home/user/Shooter/src/mines.js:615`  
  With the VOID branch bought out, the swallow reads as two unrelated events: a ring closing over an empty patch of floor, and a body popping into sparks somewhere else. It is the mine's only feedback that it did anything.  
  _Fix:_ Draw the collapse ring at the body — `ring(e.x, e.y, e.r * 2.2, 6, …)` — or add a second short stroke from `m` to `e` so the two ends read as one event.

- **[cosmetic] SPALL draws a 150-unit expanding ring for a mine that has no radial damage at all**  
  `/home/user/Shooter/src/mines.js:440`  
  The mine reads as having made a ~100-unit radial blast when it made a 51.6° cone. Compounds the wedge and the mouth-vs-fan findings above: all three of SPALL's on-screen cues point away from what it actually did.  
  _Fix:_ If it stays, shrink it to something SPALL owns — the mouth (`m.r + cfg.trigger * up.mineTrigger`) — or make it a cone: `ring` already takes `a0`/`span` (fx.js:235), so `ring(m.x, m.y, m.r, 120, 0.3, '#ff4d4d', 3, 0, -Math.PI/2 - 0.45, 0.9)` draws the fan it actually threw.

- **[cosmetic] SPALL and VOID both lay with BLAST's chime: `LAY_TONE` still holds only the original four kinds**  
  `/home/user/Shooter/src/mines.js:216; /home/user/Shooter/src/mines.js:247`  
  Laying a VOID and laying a BLAST sound identical. Minor, and only on the lay — everything after that is distinct.  
  _Fix:_ Give the four added kinds their own entries, or drop the `|| 300` fallback so a missing kind is silent rather than wrong.


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

- **[cosmetic] Two live comments say a KNELL rings three times; it rings twice**  
  `/home/user/Shooter/src/mines.js:15-16 and /home/user/Shooter/src/mines.js:534`  
  None to the player. It is a comment that will mislead the next reader into computing a KNELL's total off three tolls, which is how arsenal.js's own six stale `dmg` literals happened.  
  _Fix:_ "twice" and "one of two", or write them as `K.tolls` so they cannot drift again.

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

