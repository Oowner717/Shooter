// Wreckage, as distinct from energy.
//
// Energy is the currency: small, bright, drawn to the turret, taken in by a
// PULSE. Debris is none of those things. It cannot be collected, it cannot
// hurt you, and it is not counted. It bounces off whatever it meets and then
// it leaves the field.
//
// It can, however, be shot. A chunk of any size comes apart on one hit — into
// smaller pieces if there is enough of it to break, and into nothing if there
// is not. That is destructible scenery, not a health pool: the cascade comes
// from size, so a big plate is worth three volleys and a splinter is worth
// one. Nothing pays for it, because wreckage is not the currency and paying
// for it would undo the whole distinction.
//
// A round is never stopped by wreckage, and auto-aim never picks it. It breaks
// what it passes through on the way to whatever it was actually aimed at, so
// a field of chunks is a light show rather than cover.
//
// It exists because a BULWARK breaking into two dozen glowing collectables
// reads as a payout, and a BULWARK breaking into two dozen tumbling plates
// reads as a BULWARK breaking. Only four objects shed it and they shed a lot,
// so it is occasional and unmistakable rather than a constant litter.
//
// A chunk is deliberately not an Enemy. It has no health, no steering and no
// value, and giving it those in order to reuse the class is how a thing that
// should never be shootable ends up shootable.

import { CFG } from './config.js';
import { TAU, clamp, rand, randInt, spread, rgba, mixHex } from './util.js';
import { spark, ring } from './fx.js';
import { audio } from './audio.js';

export class Chunk {
  constructor(x, y, vx, vy, r, color, keep = false) {
    const D = CFG.debris;
    /*
     * A chunk that stays. Ordinary wreckage is occasional and clears itself,
     * which is right for a BULWARK breaking mid-wave; what ORDINAL leaves is
     * supposed to still be lying there afterwards. A keep never times out and
     * settles harder, so the field it dies on keeps the shape of it.
     */
    this.keep = keep;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    /*
     * Grey means harmless -- see the rule above ENEMY_TYPES in config.js.
     *
     * A chunk is harmless from the instant it exists, but it came off
     * something that was not, and a BULWARK bursting into sixteen grey flecks
     * would not read as that BULWARK breaking. So it arrives wearing the
     * colour of the body it came off and loses it over CFG.debris.fade
     * seconds: the break is legible, and what is left is plainly over.
     */
    this.born = color;
    this.color = color;
    this.age = 0;
    this.angle = rand(0, TAU);
    this.av = spread(D.spin);
    // Heavy for its size, so it shoulders energy aside rather than being
    // batted about by it, and light enough that the turret is not a wall.
    this.mass = r * r * 0.9;
    this.invMass = 1 / this.mass;
    this.restitution = 0.62;
    this.friction = 0.2;
    // Read by the contact solver: nothing a chunk touches takes damage, and
    // no amount of being shoved around breaks it. Only fire does that.
    this.inert = true;
    // The speed ceiling in integrate() is a multiple of a body's cruise, and
    // a chunk is thrown far faster than it would ever travel under its own
    // power. This is that ceiling, not a speed it aims for.
    this.cruise = 160;
    this.thrown = 0;
    this.life = keep ? Infinity : D.life;
    // Not breakable for the first instant of its existence: see CFG.debris.grace.
    this.grace = D.grace;
    this.dead = false;
    // Four to seven sides, fixed at birth, so a chunk keeps its silhouette
    // as it tumbles.
    this.sides = 4 + ((Math.random() * 4) | 0);
    this.jag = [];
    for (let i = 0; i < this.sides; i++) this.jag.push(rand(0.62, 1));
  }

  /**
   * The contact solver calls this on everything; a chunk simply shrugs. Being
   * shoulder-barged is not what breaks wreckage — see `shatter`, which is
   * called by fire and only by fire.
   */
  applyDamage() {}

  /** Never steers. It was thrown, and that is the whole of its opinion. */
  steer(world, dt) {
    // A keep settles: it is scenery, and scenery that is still sliding about
    // a minute later reads as something the game forgot to finish.
    const d = Math.exp(-CFG.debris.drag * (this.keep ? 3.2 : 1) * dt);
    this.vx *= d;
    this.vy *= d;
  }

  /**
   * Shot, or caught in a blast. One hit is one break, always — there is no
   * health here, only size: a chunk wider than `split` comes apart into
   * smaller ones, and anything at or below it has nothing left to break.
   *
   * `dirx`,`diry` is the direction the break is travelling, so the burst
   * throws forward off the shot rather than puffing symmetrically.
   *
   * `pieces` is false for a shockwave, which pulverises rather than splits —
   * a PULSE that turned one plate into three near the turret would be adding
   * clutter exactly where it was meant to be clearing it.
   */
  shatter(world, dirx = 0, diry = 0, pieces = true) {
    if (this.dead || this.grace > 0) return;
    this.dead = true;
    const D = CFG.debris;
    const breaks = pieces && this.r > D.split;
    // Wreckage is drawn unlit, so a break has to be the one moment it lights
    // up — sparks in its own colour would be as dim as the chunk was. Every
    // third is near-white, which is what makes the burst read at all against
    // the background.
    //
    // Fewer, larger when it splits, because the pieces are the event. More,
    // smaller, and with a ring when it does not, because that burst is the
    // whole of what is left of it.
    const n = breaks ? 7 : 12;
    for (let i = 0; i < n; i++) {
      spark(
        this.x, this.y,
        spread(230) + dirx * 140, spread(230) + diry * 140,
        i % 3 === 0 ? '#e8f2ff' : this.color,
        rand(0.2, 0.38), breaks ? 2.3 : 1.8,
      );
    }
    if (!breaks) ring(this.x, this.y, this.r * 0.4, this.r * 2.6, 0.22, '#cfe0f2', 1.4);
    // Gated inside audio, so a round cutting through a dozen chunks is one
    // sound rather than a dozen.
    audio.crack(this.r / D.cap);
    if (!breaks) return;

    const count = randInt(D.pieces[0], D.pieces[1]);
    for (let i = 0; i < count; i++) {
      if (world.debris.length >= D.max) break;
      const a = (i / count) * TAU + rand(0, TAU);
      const sp = rand(D.speed[0], D.speed[1]) * 0.45;
      const c = new Chunk(
        this.x + Math.cos(a) * this.r * 0.4,
        this.y + Math.sin(a) * this.r * 0.4,
        this.vx * 0.6 + Math.cos(a) * sp + dirx * 70,
        this.vy * 0.6 + Math.sin(a) * sp + diry * 70,
        Math.max(D.min, this.r * D.keep),
        this.color,
      );
      c.life = Math.min(c.life, this.life * D.wane);
      // Carries on greying from where its parent had got to. Restarting the
      // fade would have a splinter off a nearly-grey plate come out bright.
      c.born = this.born;
      c.age = this.age;
      world.debris.push(c);
    }
  }

  update(world, dt) {
    if (this.grace > 0) this.grace -= dt;
    this.life -= dt;
    const D = CFG.debris;
    this.age += dt;
    this.color = mixHex(this.born, D.grey, clamp(this.age / D.fade, 0, 1));
    const out = D.out;
    // Off the field is gone. This is the one body in the game that is allowed
    // to leave, which is why it is not clamped to the arena.
    if (this.life <= 0
      || this.x < -out || this.x > world.width + out
      || this.y > world.floorY + out || this.y < -world.stageHeight - out) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const t = Math.min(1, this.life / 2.2); // only the last couple of seconds fade
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Outline only, unlit, and desaturated toward the background: energy
    // glows and this does not, which is the whole of telling them apart.
    ctx.strokeStyle = rgba(this.color, 0.5 * t);
    ctx.fillStyle = rgba('#0a1622', 0.7 * t);
    ctx.lineWidth = Math.max(0.9, this.r * 0.13);
    ctx.beginPath();
    for (let i = 0; i < this.sides; i++) {
      const a = (i / this.sides) * TAU;
      const rr = this.r * this.jag[i];
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Break an object up. `n` chunks, thrown outward, and then left alone. */
export function shed(world, e, n, opts = {}) {
  if (!world.debris) return;
  const D = CFG.debris;
  // A keep is allowed past the ordinary ceiling: it is a one-off, and being
  // silently dropped because a wave happened to be shedding at the time is
  // how a boss leaves no wreck at all.
  const cap = opts.keep ? D.max + 90 : D.max;
  for (let i = 0; i < n; i++) {
    if (world.debris.length >= cap) break;
    const a = (i / n) * TAU + rand(0, TAU);
    const sp = rand(D.speed[0], D.speed[1]);
    const r = Math.min(D.cap, Math.max(D.min, e.r * rand(D.size[0], D.size[1])));
    world.debris.push(new Chunk(
      e.x + Math.cos(a) * e.r * 0.45,
      e.y + Math.sin(a) * e.r * 0.45,
      e.vx * 0.35 + Math.cos(a) * sp,
      e.vy * 0.35 + Math.sin(a) * sp,
      r * (opts.size || 1),
      e.type.color,
      !!opts.keep,
    ));
  }
}
