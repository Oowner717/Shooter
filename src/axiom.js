/*
 * ============================== AXIOM (VIII) ===============================
 *
 * The eighth anomaly, and the first that only exists past the change: its gate
 * is rung 48, above the era ceiling at 42, so the first form can never meet it.
 *
 * ---- what it does that the seven do not ----
 *
 * Every one of them is answered by shooting the right part of it. This one is
 * answered by shooting the right part of it WITH LESS THAN YOU BROUGHT.
 *
 * Five CLAUSES stand in a ring, and each one holds one of your ability buttons
 * shut for as long as it stands. Break a clause and that button comes back for
 * the rest of the fight. The core is `spent` -- drawn, skipped by the assist,
 * rounds passing through it -- until the last clause is gone, so there is
 * nothing else to shoot at and no way to skip the argument.
 *
 * The fight is therefore a question about ORDER: which of your five held
 * buttons you want back first, bought with the only two things the ring leaves
 * you, the gun and PULSE.
 *
 * ---- PULSE is never taken ----
 *
 * `essential` on the ability, and ORDINAL's rule: it is "the answer to
 * something sitting on the mount where the barrel cannot reach". A boss that
 * could take it is a boss that can pin you against your own machine with no
 * way out. `CFG.axiom.holds` names the five it does take and PULSE is not in
 * it; `check-build` asserts that rather than trusting the table.
 *
 * ---- and it brings the ability lock back, deliberately ----
 *
 * `Abilities.lockRandom` was deleted in build 219 for having no writer and
 * five readers that could never take their other branch -- the `world.endless`
 * shape CLAUDE.md records, whose rule is "delete the flag rather than maintain
 * the branch". The rule is not "never lock a button", it is "do not keep a
 * mechanism nothing drives". This drives one, and the state it drives is a SET
 * OF IDS on the world rather than a countdown on a slot: what holds a button
 * here is a body standing on the field, and the honest model of "until that
 * thing is dead" is the thing itself, not a timer that has to be kept in step
 * with it.
 */

import { CFG, TYPE_BY_ID } from './config.js';
import { clamp, rand, rgba, TAU, drawGlow } from './util.js';
import { ring, ripple, spark, shake, flash } from './fx.js';
import { audio } from './audio.js';
import { background } from './background.js';
import { registerAnomaly, dressOf } from './anomaly.js';
import { Enemy } from './enemies.js';
import { Boss } from './boss.js';

const A = () => CFG.axiom;

/*
 * It announces itself as a statement rather than as a shape: three lines of
 * something being asserted about you, and then its name.
 */
const ARRIVAL = [
  { text: 'A RULE IS BEING STATED.', hold: 3.0 },
  { text: 'IT IS ABOUT WHAT YOU ARE ALLOWED TO CARRY.', hold: 4.6 },
  { text: 'IT DOES NOT ARGUE. IT HOLDS.', hold: 3.8 },
  { text: 'AXIOM', hold: 2.8 },
];

const OUTRO = [
  { text: 'THE RULE IS WITHDRAWN.', hold: 2.8 },
  { text: 'EVERYTHING IT WAS HOLDING IS YOURS AGAIN.', hold: 4.0 },
  { text: 'IT WAS NEVER TRUE. IT WAS ONLY ENFORCED.', hold: 3.6 },
];

/*
 * Deep gold. The seven above are bright and read as one family in the tree's
 * heading; these are dark, which is the register the anomalies past the change
 * share -- see the note beside the tone in anomaly.js for why it is register
 * and not hue.
 */
const MOODS = [
  { top: '#100c02', mid: '#2b2205', low: '#060401', line: '#8f7305', neb: ['#54430a', '#3e3206', '#463806'], accent: '#d9b310' },
  { top: '#1a1403', mid: '#433408', low: '#0a0801', line: '#c29a0c', neb: ['#756008', '#54430a', '#605009'], accent: '#f2cf3a' },
  { top: '#261e04', mid: '#61490c', low: '#0f0c02', line: '#e0b512', neb: ['#a08010', '#756008', '#8a6e0c', ], accent: '#ffe98a' },
  { top: '#3a2d06', mid: '#9c7d05', low: '#1a1403', line: '#ffe98a', neb: ['#d4aa0c', '#a08010', '#bc9610'], accent: '#ffffff' },
];

export class Axiom extends Boss {
  constructor(world) {
    super(world, 8);
    const C = A();
    this.x = world.shooter.x;
    this.y = world.shooter.y - C.standoff;
    this.arriving = C.arrive;

    this.turn = 0; // where the ring has got to
    this.lemmaT = C.lemma.every;
    this.opened = false; // the ring has been broken all the way open

    this.core = this.body('axiom', this.x, this.y);
    /*
     * `spent` from the frame it is made. It is the mark a dying boss's own
     * structure wears -- still drawn, skipped by `autoTarget` and by its
     * hysteresis, and rounds pass through it -- which is exactly "you cannot
     * touch this yet" and is already honoured by every damage path in the
     * game. The alternative, a guard inside `applyDamage`, would be a ninth
     * thing for every area effect to remember.
     */
    this.core.spent = true;
    world.enemies.push(this.core);

    /*
     * The clauses, and each one NAMES what it holds. The id is carried on the
     * body so that whatever kills it -- a round, a mine, a blast, the outro --
     * hands back the right button without anything having to remember which
     * clause was which.
     */
    /*
     * ---- and WHAT it holds is what this run actually owns ---------------
     *
     * `C.holds` is the order of preference, not the answer. Four of the five
     * ids in it -- LANCE, WELL, PRISM, STASIS -- are in `LOCKABLE.abilities`
     * and have to be bought; only HAIL is free. So a run that reached rung 48
     * having spent its energy on rounds, mines and the machine met a boss
     * whose entire identity is "it takes your buttons away" and lost exactly
     * ONE button: the other four clauses held ids that were sealed already,
     * which is to say they held nothing at all while looking like they did.
     *
     * So the pool is what the run has: the table's order first, then anything
     * else it owns, and PULSE never (it is `essential`, and `isHeld` refuses
     * it at the reader anyway -- a boss that could take PULSE can pin you
     * against your own machine). A clause past the end of the pool holds
     * NOTHING and is plain structure, which is honest: there was nothing left
     * to take.
     */
    const owns = (id) => id === 'fan' || world.unlocked.has(id);
    const pool = C.holds.filter(owns);
    for (const slot of world.abilities.slots) {
      const id = slot.def.id;
      if (slot.def.essential || pool.includes(id) || !owns(id)) continue;
      pool.push(id);
    }

    this.clauses = [];
    for (let i = 0; i < C.clauses; i++) {
      const p = this.body('clause', this.x, this.y);
      p.holds = pool[i] || null;
      p.at = (i / C.clauses) * TAU;
      this.clauses.push(p);
    }
    this.place(0);
    this.hold0 = this.clauses.map((p) => p.holds);
    /*
     * Filled rather than replaced. `world.abilityHold` is declared in
     * `newWorld` and the interface reads it by that reference every frame, so
     * assigning a new Set over it would leave the bar reading the old one for
     * as long as nothing re-read the world -- the `export let` snapshot in
     * miniature.
     */
    world.abilityHold.clear();
    // ...and a clause that holds NOTHING puts nothing in the set. `hold0` can
    // carry nulls now (see the pool above), and a null in here is an entry
    // `freed` can never match and `isHeld` can never be asked about -- a hold
    // that nothing can ever release.
    for (const id of this.hold0) if (id) world.abilityHold.add(id);

    background.setFocus(this.x, this.y);
    background.setDread(1, 0);
    background.surge(2);
  }

  // -------------------------------------------------------------- shape

  parts() {
    return this.clauses;
  }

  /** How much of the ring is still standing. */
  shellFrac() {
    return this.clauses.filter((p) => !p.dead).length / this.clauses.length;
  }

  gauge() {
    const C = A();
    const arriving = this.arriving > 0;
    const d = dressOf(8);
    return {
      title: d.name,
      phase: arriving ? 'ARRIVING' : ['I', 'II', 'III', 'IV'][this.stage - 1] || 'IV',
      arriving,
      core: arriving ? 1 : this.coreFrac,
      shells: [{ label: 'CLAUSES', seg: this.clauses.length, frac: this.shellFrac() }],
      marks: [
        { at: C.stageCore, past: !arriving && this.coreFrac <= C.stageCore },
        { at: C.stageOpen, past: !arriving && this.coreFrac <= C.stageOpen },
      ],
      bar: d.bar[Math.min(arriving ? 0 : this.stage, d.bar.length - 1)],
    };
  }

  /** Where the ring stands, and how fast it turns. */
  place(dt) {
    const C = A();
    this.turn += dt * C.spin * this.stage;
    const rr = this.stage >= 2 ? C.ringII : C.ring;
    for (const p of this.clauses) {
      if (p.dead) continue;
      const a = this.turn + p.at;
      p.x = this.x + Math.cos(a) * rr;
      p.y = this.y + Math.sin(a) * rr;
      p.vx = 0;
      p.vy = 0;
      p.angle = a + Math.PI / 2;
    }
  }

  /**
   * A clause has gone: hand its button back, and say which.
   *
   * Driven off the BODIES rather than from a death hook, because a clause can
   * be killed by anything -- a round, a blast, a mine, the outro's own arrest
   * -- and a hook would have to be applied at every one of those sites. What
   * is true is "this body is dead", and that is read here.
   */
  freed(world) {
    const held = world.abilityHold;
    if (!held || !held.size) return;
    for (const p of this.clauses) {
      if (!p.dead || !p.holds || !held.has(p.holds)) continue;
      held.delete(p.holds);
      const name = (world.abilities.slots.find((s) => s.def.id === p.holds) || {}).def;
      world.bossLine = `${(name && name.name) || 'IT'} IS YOURS AGAIN.`;
      this.lineFor = 2.4;
      ring(p.x, p.y, 8, 170, 0.5, TYPE_BY_ID.clause.color, 3);
      for (let k = 0; k < 12; k++) {
        const a = rand(0, TAU);
        spark(p.x, p.y, Math.cos(a) * rand(120, 420), Math.sin(a) * rand(120, 420),
          '#ffe98a', 0.42, 2.2);
      }
      audio.chime(720);
    }
    /*
     * ...and the core is only reachable once the whole ring is gone. `spent`
     * comes off here and nowhere else, so "the argument is finished" and "the
     * core can be shot" are the same event by construction.
     */
    /*
     * ...and it is the RING being gone, not the SET being empty. Those were
     * the same thing only while every clause held something -- and once the
     * pool above can be shorter than the ring, a run owning two abilities
     * would have opened the core after two clauses and fought a shorter boss
     * for being worse equipped, which is backwards. The clauses are the
     * argument; the argument is finished when there is none of it left.
     */
    if (!this.opened && this.clauses.every((p) => p.dead)) {
      this.opened = true;
      this.core.spent = false;
      this.enterStage(world, 2);
    }
  }

  /** What a clause sends out to keep you off it. */
  sendLemma(world) {
    const C = A();
    const live = this.clauses.filter((p) => !p.dead);
    if (!live.length) return;
    for (let i = 0; i < C.lemma.n; i++) {
      const from = live[(Math.random() * live.length) | 0];
      /*
       * `claim(new Enemy(...))` and NOT `this.body(...)`: `body` builds
       * STRUCTURE, with `invMass 0`, no cruise and no accel, and it does not
       * mark `ofBoss` -- so a minion made that way cannot steer, cannot be
       * shoved, and is not taken by the ending. See the same note in
       * tessera.js, where the suite caught it.
       */
      const e = this.claim(new Enemy(TYPE_BY_ID.lemma, from.x, from.y,
        { staged: false, spawnIn: 0.2 }));
      const a = Math.atan2(world.shooter.y - from.y, world.shooter.x - from.x) + rand(-0.5, 0.5);
      e.vx = Math.cos(a) * 60;
      e.vy = Math.sin(a) * 60;
      world.enemies.push(e);
      spark(from.x, from.y, e.vx, e.vy, '#ffe98a', 0.3, 2);
    }
  }

  enterStage(world, n) {
    this.stage = n;
    this.flare = 1;
    background.setMood(n >= 4 ? 'boss4' : n >= 3 ? 'boss3' : 'boss2');
    world.bossLine = n >= 4 ? 'THE RULE IS DOWN TO ONE WORD.'
      : n >= 3 ? 'IT IS RESTATING ITSELF WITH LESS.'
        : 'THE ARGUMENT IS OVER. WHAT IS LEFT IS THE CLAIM.';
    this.lineFor = n >= 4 ? 4.2 : 3.4;
    ring(this.x, this.y, 20, 500, 0.7, TYPE_BY_ID.axiom.glow, 6);
    ripple(this.x, this.y, 2.2, 620);
    shake(16);
    background.surge(2);
    audio.boom();
    world.bossStage = n;
  }

  // -------------------------------------------------------------- frame

  update(world, dt) {
    const C = A();
    this.t += dt;
    this.tickCommon(world, dt);

    if (this.arriving > 0) {
      this.arriveStep(world, world.dtRaw || dt, C, ARRIVAL, MOODS);
      return;
    }
    this.settle(world);

    if (this.dying > 0) {
      this.dieStep(world, dt, C, OUTRO);
      return;
    }

    this.place(dt);
    this.freed(world);

    this.lemmaT -= dt;
    if (this.lemmaT <= 0) {
      this.lemmaT = C.lemma.every;
      this.sendLemma(world);
    }

    const frac = this.coreFrac;
    let want = this.stage;
    if (this.opened && frac <= C.stageCore && want < 3) want = 3;
    if (this.opened && frac <= C.stageOpen && want < 4) want = 4;
    if (want > this.stage) this.enterStage(world, want);

    const through = 1 - (this.shellFrac() * 0.4 + frac * 0.6);
    background.setDread(1, through);
    background.setFocus(this.x, this.y);

    if (this.core.dead) this.die(world, C);
  }

  /**
   * The ending: it lets go of everything at once.
   *
   * Whatever the ring was still holding is handed back on the first frame of
   * the outro rather than being left to the arrest to take one clause at a
   * time -- the rule is withdrawn, and a rule that is withdrawn is not
   * withdrawn in instalments. It also means a player who kills the core
   * through a still-standing clause (which cannot happen, but is the kind of
   * thing a later build makes possible) is never left holding a locked button
   * after the thing enforcing it has gone.
   */
  dieExtra(world) {
    if (world.abilityHold && world.abilityHold.size) {
      world.abilityHold.clear();
      flash(0.4, '#ffe98a');
      audio.chime(880);
    }
  }

  /**
   * Everything it holds is let go when it leaves by any door.
   *
   * `hush` is the base's "you are no longer the field's" -- it runs on the
   * withdrawal as well as on the death, and the withdrawal is the one that
   * matters here: a boss that gives up and leaves must not take five of your
   * buttons with it.
   */
  hush(world) {
    super.hush(world);
    if (world.abilityHold) world.abilityHold.clear();
  }

  // --------------------------------------------------------------- draw

  draw(ctx, world) {
    const C = A();
    const T = TYPE_BY_ID.axiom;
    const arriving = this.arriving > 0;
    const open = arriving ? 1 - clamp(this.arriving / C.arrive, 0, 1) : 1;
    const k = CFG.hairline;

    ctx.save();
    this.drawHole(ctx, C, this.t, arriving);

    /*
     * The ARGUMENT: a line from the core to every clause still standing. It is
     * the whole read of the fight in one shape -- five lines is a rule with
     * five parts, one line is a rule almost finished -- and it is drawn under
     * the bodies so the clauses sit on top of their own reasoning.
     */
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.clauses) {
      if (p.dead) continue;
      ctx.strokeStyle = rgba(T.color, (0.16 + 0.2 * open) * (0.6 + 0.4 * Math.sin(this.t * 2 + p.at)));
      ctx.lineWidth = k * (1.6 + this.flare * 2);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    /*
     * The seal. Two rings and a ledger of chords across it -- and the OUTER
     * one is drawn only while the ring stands, so the frame a clause count
     * reaches zero is the frame the core visibly stops being protected. That
     * is the same event as `spent` coming off, drawn.
     */
    const R = C.coreR * (1 + this.flare * 0.1);
    ctx.strokeStyle = rgba(T.color, 0.55 + 0.35 * open);
    ctx.lineWidth = k * 2.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, R * 0.72, 0, TAU);
    ctx.stroke();
    if (!this.opened) {
      ctx.setLineDash([7 * k, 6 * k]);
      ctx.strokeStyle = rgba(T.color, 0.3 + 0.3 * open);
      ctx.lineWidth = k * 1.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, R * 1.06, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = rgba(T.glow, 0.4 * open);
    ctx.lineWidth = k * 1.2;
    for (let i = 0; i < 4; i++) {
      const a = this.turn * 0.4 + (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(a) * R * 0.66, this.y + Math.sin(a) * R * 0.66);
      ctx.lineTo(this.x - Math.cos(a) * R * 0.66, this.y - Math.sin(a) * R * 0.66);
      ctx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, T.glow, this.x, this.y, R * (1.5 + this.flare), 0.26 + 0.3 * open);
    ctx.restore();

    this.drawGhosts(ctx, T.color);
    ctx.restore();
  }
}

registerAnomaly(8, (world) => new Axiom(world));
