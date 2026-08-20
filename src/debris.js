// Wreckage, as distinct from energy.
//
// Energy is the currency: small, bright, drawn to the turret, taken in by a
// PULSE. Debris is none of those things. It is the object's structure coming
// apart, and it does nothing at all — it cannot be collected, it cannot hurt
// you, and it is not counted. It bounces off whatever it meets and then it
// leaves the field.
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
import { TAU, rand, spread, rgba } from './util.js';

export class Chunk {
  constructor(x, y, vx, vy, r, color) {
    const D = CFG.debris;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    this.color = color;
    this.angle = rand(0, TAU);
    this.av = spread(D.spin);
    // Heavy for its size, so it shoulders energy aside rather than being
    // batted about by it, and light enough that the turret is not a wall.
    this.mass = r * r * 0.9;
    this.invMass = 1 / this.mass;
    this.restitution = 0.62;
    this.friction = 0.2;
    // Read by the contact solver: nothing a chunk touches takes damage, and
    // nothing it is touched by hurts it either.
    this.inert = true;
    // The speed ceiling in integrate() is a multiple of a body's cruise, and
    // a chunk is thrown far faster than it would ever travel under its own
    // power. This is that ceiling, not a speed it aims for.
    this.cruise = 160;
    this.thrown = 0;
    this.life = D.life;
    this.dead = false;
    // Four to seven sides, fixed at birth, so a chunk keeps its silhouette
    // as it tumbles.
    this.sides = 4 + ((Math.random() * 4) | 0);
    this.jag = [];
    for (let i = 0; i < this.sides; i++) this.jag.push(rand(0.62, 1));
  }

  /** The contact solver calls this on everything; a chunk simply shrugs. */
  applyDamage() {}

  /** Never steers. It was thrown, and that is the whole of its opinion. */
  steer(world, dt) {
    const d = Math.exp(-CFG.debris.drag * dt);
    this.vx *= d;
    this.vy *= d;
  }

  update(world, dt) {
    this.life -= dt;
    const D = CFG.debris;
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
export function shed(world, e, n) {
  if (!world.debris) return;
  const D = CFG.debris;
  for (let i = 0; i < n; i++) {
    if (world.debris.length >= D.max) break;
    const a = (i / n) * TAU + rand(0, TAU);
    const sp = rand(D.speed[0], D.speed[1]);
    const r = Math.min(D.cap, Math.max(D.min, e.r * rand(D.size[0], D.size[1])));
    world.debris.push(new Chunk(
      e.x + Math.cos(a) * e.r * 0.45,
      e.y + Math.sin(a) * e.r * 0.45,
      e.vx * 0.35 + Math.cos(a) * sp,
      e.vy * 0.35 + Math.sin(a) * sp,
      r,
      e.type.color,
    ));
  }
}
