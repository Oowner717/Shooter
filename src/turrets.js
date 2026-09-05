/*
 * ============================ THE EMPLACEMENTS =============================
 *
 * Six small auto-turrets, one per build lot, on the era-2 field.
 *
 * The lots have stood empty since build 245 -- ground reserved, drawn, and
 * refusing every press with a line about not being built yet. This is what
 * they were reserved for.
 *
 * ---- what one is, and what it deliberately is not ----
 *
 * It is the SIMPLEST possible shooting thing: it points at the nearest object
 * in reach and fires on a timer. There is no aim mode, no ammunition slot, no
 * ability, no cooldown to manage and no decision to take once it is standing.
 * That is the whole design: the machine in the middle is where the decisions
 * are, and six more things asking to be steered would take the field away
 * from it. What an emplacement buys is COVER -- ground the player no longer
 * has to face -- and it is bought once, per lot, with energy.
 *
 * So: light damage, an ordinary cadence, a short reach, and a round that is
 * visibly not yours. Sixteen of the field's own units across against the
 * machine's forty, which reads at a glance as a fixture rather than a second
 * player.
 *
 * ---- why the guns are a LIST OF LOT INDICES and not objects ----
 *
 * `world.yard` is derived in `Game.resize` and thrown away on every rotation,
 * era change and bench door -- it is furniture, not state. A gun's PLACE is
 * therefore the lot's place and is re-derived with it; the only thing that is
 * a fact about the run is WHICH LOTS HAVE ONE, which is six bits. `world.guns`
 * is that: a sorted list of lot indices, saved with the run, and everything
 * else about a gun is recomputed from the lot it stands on.
 *
 * ---- why every upgrade is global ----
 *
 * Every scalar below is read off `world.up` at the point of use, so a node
 * bought after a gun is standing reaches it, and a gun built after a node is
 * bought arrives with it. There is no per-gun state to migrate, no order to
 * get wrong, and the ledger the save replays is the only record needed. The
 * alternative -- upgrades that attach to a gun -- would have made the sixth
 * lot worth less than the first, which is a trap rather than a decision.
 */

import { CFG } from './config.js';
import { TAU, clamp, rgba, angleDelta, drawGlow } from './util.js';
import { fire } from './projectiles.js';
import { shielded } from './yard.js';
import { spark } from './fx.js';

/**
 * The ammunition the emplacements carry, in the order MUNITION steps through.
 *
 * One rack for all six -- "they all shoot the same type of ammo" is the rule,
 * and it is what makes MUNITION a decision about the whole line rather than
 * six decisions. Each entry is a complete round: the numbers a gun fires with
 * and the form `drawProjectiles` gives it.
 *
 * ---- the colour, which is a rule and not a taste ----
 *
 * A DESATURATED STEEL BLUE, stepping up in luminance and size across the
 * three. Nothing else in this game is that: every saturated hue is spoken for
 * by a round, a mine, an ability or a root, and the emplacements are meant to
 * read as issued equipment beside a rack the player chose. The one thing it
 * must not be is `#8fa9c4` -- that is DRIFT's grey, and the colour rule
 * `check-build` enforces is that grey means harmless.
 *
 * All three keep the `tracer` form. `pellet` is SCATTER's, `dart` is HAIL's
 * and `slab` is SLUG's, and a fixture firing a shape the rack already owns is
 * the same confusion the tone is chosen to avoid. What separates the three is
 * SIZE as well as tone, so the step up is legible without colour.
 */
export const GUN_AMMO = [
  {
    key: 'bolt',
    name: 'STEEL BOLT',
    line: 'What an emplacement is issued with. Light, and there are six of them.',
    color: '#6f93c4', core: '#cfe0f2', form: 'tracer',
    damage: 1, speed: 1, r: 1,
  },
  {
    key: 'sabot',
    name: 'SABOT',
    line: 'A harder round in a lighter jacket: half again the damage, and it '
      + 'crosses the field a third faster.',
    color: '#8fb8e8', core: '#e4eefb', form: 'tracer',
    damage: 1.5, speed: 1.34, r: 1.15,
  },
  {
    key: 'ferrite',
    name: 'FERRITE',
    line: 'Twice the damage, and it carries through the first thing it kills. '
      + 'The line stops being chip damage.',
    color: '#b8d4f0', core: '#f2f8ff', form: 'tracer',
    damage: 2.1, speed: 1.15, r: 1.35, pierce: 1,
  },
];

/** Which round the line is carrying, from what MUNITION has been bought. */
export function gunAmmo(world) {
  const n = clamp((world.up && world.up.gunAmmo) | 0, 0, GUN_AMMO.length - 1);
  return GUN_AMMO[n];
}

/**
 * A gun's own numbers, read fresh every time.
 *
 * Not cached on the gun, and that is the point: a node bought while six of
 * them are standing has to reach all six on the next frame, and the cheapest
 * way to guarantee that is to have nothing to invalidate. It is six objects a
 * frame at era 2 and nothing at all at era 1.
 */
export function gunStats(world) {
  const G = CFG.gun;
  const up = world.up || {};
  const ammo = gunAmmo(world);
  return {
    ammo,
    range: G.range * (up.gunRange || 1),
    interval: G.interval * (up.gunRate || 1),
    slew: G.slew * (up.gunSlew || 1),
    damage: G.damage * (up.gunDamage || 1) * ammo.damage,
    speed: G.speed * ammo.speed,
    salvo: 1 + ((up.gunSalvo | 0) || 0),
  };
}

/**
 * Reconcile the standing guns with the lots under them.
 *
 * Called from `Game.resize` after `syncYard`, so a rotation moves the guns
 * with the ground they stand on. A gun keeps its aim and its cooldown across
 * this -- they are about the gun, not about the lot.
 */
export function syncGuns(world) {
  const a = world.yard;
  if (!a) { world.gunAt = []; return; }
  const owned = world.guns || [];
  const was = world.gunAt || [];
  const out = [];
  for (const i of owned) {
    const l = a.lots[i];
    if (!l) continue;
    const had = was.find((g) => g.lot === i);
    out.push({
      lot: i,
      x: l.x,
      y: l.y,
      r: CFG.gun.r,
      aim: had ? had.aim : -Math.PI / 2,
      cool: had ? had.cool : 0,
      recoil: had ? had.recoil : 0,
      target: null,
    });
  }
  world.gunAt = out;
}

/**
 * What a lot costs. Flat, and every lot the same: "each lot is a single
 * purchase for one small auto turret", so there is no ladder to climb and no
 * reason to prefer one emplacement over another. A rising price would make
 * the sixth a worse deal than the first for no reason the field expresses.
 */
export function lotPrice() {
  return CFG.gun.cost;
}

/**
 * Build one. Returns 'ok', 'poor', 'built' or 'no' -- the same vocabulary
 * `Game.buy` uses, so the press site can report either the same way.
 */
export function buildGun(world, i) {
  const a = world.yard;
  if (!a || i < 0 || !a.lots[i]) return 'no';
  const owned = world.guns || (world.guns = []);
  if (owned.includes(i)) return 'built';
  const price = lotPrice();
  if (world.energy < price) return 'poor';
  world.energy -= price;
  owned.push(i);
  owned.sort((p, q) => p - q);
  syncGuns(world);
  return 'ok';
}

/**
 * What an emplacement will shoot at: the nearest object in reach.
 *
 * "Auto shoot all objects" is the whole rule, so grey is NOT skipped -- the
 * machine's own assist has three aim modes and SIEVE to sell, and giving a
 * fixture the same choice would be selling the same decision twice. What IS
 * skipped is what nothing may shoot: the dead, the staged, a boss's spent
 * frame, a dissolving body, and anything the wall is standing in front of.
 */
function pick(world, g, range) {
  let best = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    if (e.dead || e.staged || e.spent || e.fizzle) continue;
    if (shielded(world, e)) continue;
    const dx = e.x - g.x;
    const dy = e.y - g.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  return best;
}

/**
 * Run the line.
 *
 * `world.gunsOn` is the enable/disable switch and it stops the FIRING, not the
 * existence: a disabled gun still stands, still slews to nothing, and still
 * draws -- switched off is a state you can see, and a gun that vanished when
 * you turned it off would read as sold rather than as idle.
 */
export function updateGuns(world, dt) {
  const guns = world.gunAt;
  if (!guns || !guns.length) return;
  const on = world.gunsOn !== false;
  const st = gunStats(world);
  for (const g of guns) {
    g.recoil = Math.max(0, g.recoil - dt * 6);
    g.cool = Math.max(0, g.cool - dt);
    const t = on ? pick(world, g, st.range) : null;
    g.target = t;
    if (!t) continue;
    /*
     * Aimed at where it will BE, the same lead the machine's assist takes --
     * without it a fixture with a 0.55s cadence spends most of its rounds
     * behind a body walking across it, and the reason would be invisible.
     */
    const flight = Math.hypot(t.x - g.x, t.y - g.y) / Math.max(1, st.speed);
    const want = Math.atan2(t.y + t.vy * flight - g.y, t.x + t.vx * flight - g.x);
    const d = angleDelta(g.aim, want);
    const step = st.slew * dt;
    g.aim += clamp(d, -step, step);
    if (g.cool > 0) continue;
    // Off target, and it does not fire blind: half a body's width of error at
    // the target's own distance is the tolerance.
    if (Math.abs(angleDelta(g.aim, want)) > 0.18) continue;
    g.cool = st.interval;
    g.recoil = 1;
    shoot(world, g, st);
  }
}

function shoot(world, g, st) {
  const A = st.ammo;
  const muzzle = g.r * 1.9;
  /*
   * VOLLEY is a fan and not a burst: two rounds down the same bearing at the
   * same instant are one round that looks like a bug. The spread is fixed and
   * small -- it is more metal, not less accuracy.
   */
  const half = (st.salvo - 1) * CFG.gun.spread * 0.5;
  for (let i = 0; i < st.salvo; i++) {
    const a = g.aim - half + i * CFG.gun.spread;
    fire(world, g.x + Math.cos(a) * muzzle, g.y + Math.sin(a) * muzzle, a, {
      speed: st.speed,
      damage: st.damage,
      impulse: CFG.gun.impulse,
      r: CFG.gun.bolt * A.r,
      life: CFG.gun.life,
      bounces: 0,
      color: A.color,
      core: A.core,
      form: A.form,
      pierce: A.pierce || 0,
      pierceFade: 0.6,
      // Its own name in the bench's ledger. Every emplacement books to the one
      // row, because the question the row answers is "what is the line worth",
      // not "which of the six".
      src: 'gun',
    });
  }
  /*
   * A mark and NO SOUND, deliberately. Six fixtures on an ordinary cadence is
   * about twelve reports a second on top of the machine's own, which is not a
   * line of guns, it is a wall of noise -- and the one cue in this game that
   * has to stay legible is the machine firing. The muzzle spark is the whole
   * of what an emplacement announces.
   */
  spark(g.x + Math.cos(g.aim) * muzzle, g.y + Math.sin(g.aim) * muzzle,
    Math.cos(g.aim) * 90, Math.sin(g.aim) * 90, A.core, 0.1, 1.4);
}

/**
 * Draw the line.
 *
 * Deliberately the same VOCABULARY as the machine -- a hexagonal deck, a
 * barrel, a lit core -- at a third the size and in a colder, flatter steel,
 * so it reads as issued equipment beside a machine the player has built. It
 * carries no upgrade sockets: what it is worth is in the numbers, and six
 * fixtures each growing parts would be six more things competing with the
 * thing in the middle.
 */
export function drawGuns(ctx, world) {
  const guns = world.gunAt;
  if (!guns || !guns.length) return;
  const on = world.gunsOn !== false;
  const A = gunAmmo(world);
  const hl = CFG.hairline;
  for (const g of guns) {
    const R = g.r;
    ctx.save();
    ctx.translate(g.x, g.y);

    // the pad it is bolted to, which is what makes it read as built rather
    // than as parked
    ctx.strokeStyle = rgba('#5d7086', on ? 0.5 : 0.28);
    ctx.lineWidth = hl * 1.4;
    ctx.beginPath();
    ctx.rect(-R * 1.5, -R * 1.15, R * 3, R * 2.3);
    ctx.stroke();

    ctx.rotate(g.aim + Math.PI / 2);
    // the barrel, under the deck so the deck's outline stays the silhouette
    const bl = R * (1.5 + g.recoil * -0.18);
    ctx.fillStyle = on ? 'rgb(22,34,50)' : 'rgb(16,22,32)';
    ctx.strokeStyle = rgba(on ? '#9fb8d4' : '#4b5a6c', on ? 0.85 : 0.5);
    ctx.lineWidth = hl * 1.6;
    ctx.beginPath();
    ctx.rect(-R * 0.26, -bl, R * 0.52, bl);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-(g.aim + Math.PI / 2));

    // the deck
    ctx.fillStyle = on ? 'rgb(18,30,46)' : 'rgb(14,20,30)';
    ctx.strokeStyle = rgba(on ? '#9fb8d4' : '#4b5a6c', on ? 0.9 : 0.5);
    ctx.lineWidth = hl * 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /*
     * The core, in the ROUND's colour and not the machine's. It is the one
     * thing on a fixture that changes when MUNITION is bought, so the whole
     * line visibly re-arms on the frame the node lands -- which is the only
     * way "it applies to all of them" is ever seen rather than believed.
     */
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, A.color, 0, 0, R * (1.1 + g.recoil * 0.7), 0.3 + g.recoil * 0.35);
      ctx.restore();
    }
    ctx.fillStyle = rgba(on ? A.core : '#3a4756', on ? 0.9 : 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.24, 0, TAU);
    ctx.fill();

    // ...and switched off says so, with a shape and not only a dimming.
    if (!on) {
      ctx.strokeStyle = rgba('#7d93ad', 0.55);
      ctx.lineWidth = hl * 1.6;
      ctx.beginPath();
      ctx.moveTo(-R * 0.5, -R * 0.5);
      ctx.lineTo(R * 0.5, R * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The muzzle marks, drawn with the rest of the field's own effects rather than
 * with the guns: they are events, and the guns are furniture.
 */
export function gunGlow(ctx, world) {
  const guns = world.gunAt;
  if (!guns || !guns.length || world.gunsOn === false) return;
  const A = gunAmmo(world);
  for (const g of guns) {
    if (g.recoil <= 0.02) continue;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const m = g.r * 1.9;
    drawGlow(ctx, A.core, g.x + Math.cos(g.aim) * m, g.y + Math.sin(g.aim) * m,
      g.r * 1.2 * g.recoil, 0.5 * g.recoil);
    ctx.restore();
  }
}

/** How many are standing. Read by the menu's lock and by the HUD. */
export function gunCount(world) {
  return (world.guns || []).length;
}
