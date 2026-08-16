// Auto-laid mines. The turret lobs one onto a random patch of ground; it is
// inert for the whole flight — passing straight through anything in the way —
// and only arms once it has settled. Harmless drift never sets one off.

import { CFG, HAIRLINE } from './config.js';
import { TAU, rand, spread, rgba, drawGlow } from './util.js';
import { applyBlast } from './enemies.js';
import { spark, ring, ripple, shake, flash } from './fx.js';
import { audio } from './audio.js';

const M = CFG.mines;

class Mine {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.x = x0;
    this.y = y0;
    this.r = M.r;
    this.t = 0; // flight progress, 0..1
    this.settle = 0; // seconds since landing
    this.life = M.life;
    this.dead = false;
    this.spin = rand(0, TAU);
  }

  get landed() {
    return this.t >= 1;
  }

  get armed() {
    return this.landed && this.settle >= M.arm;
  }
}

/** Somewhere in the open field, clear of the wall and of the turret itself. */
function landingSite(world) {
  const top = world.wall.y + world.wall.thickness + 70;
  const bottom = world.shooter.y - 130;
  return {
    x: rand(60, world.width - 60),
    y: rand(top, Math.max(top + 80, bottom)),
  };
}

export function throwMine(world) {
  const s = world.shooter;
  const site = landingSite(world);
  world.mines.push(new Mine(s.x, s.y - 20, site.x, site.y));
  audio.chime(300);
}

function detonate(world, m) {
  m.dead = true;
  applyBlast(world, { x: m.x, y: m.y, r: M.blast.r, damage: M.blast.damage, impulse: M.blast.impulse });
  ring(m.x, m.y, m.r, M.blast.r * 1.5, 0.4, '#ffb347', 5);
  ring(m.x, m.y, 0, M.blast.r * 0.7, 0.24, '#ffffff', 2);
  ripple(m.x, m.y, 1.4, M.blast.r * 4);
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU);
    spark(m.x, m.y, Math.cos(a) * rand(200, 620), Math.sin(a) * rand(200, 620), '#ffd166', rand(0.2, 0.5), 2.6);
  }
  flash(0.16, '#ffd9a0');
  shake(9);
  audio.boom();
}

export function updateMines(world, dt) {
  const list = world.mines;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.spin += dt * (m.armed ? 2.4 : 0.8);

    if (!m.landed) {
      // Inert arc. No collision at all until it comes to rest.
      m.t = Math.min(1, m.t + dt / M.flight);
      const e = m.t;
      m.x = m.x0 + (m.x1 - m.x0) * e;
      m.y = m.y0 + (m.y1 - m.y0) * e - Math.sin(e * Math.PI) * 120;
      if (m.landed) {
        for (let k = 0; k < 8; k++) {
          spark(m.x, m.y, spread(120), spread(120), '#9fb3c8', 0.3, 1.6);
        }
        audio.gateHit();
      }
      continue;
    }

    m.settle += dt;
    m.life -= dt;
    if (m.life <= 0) {
      // Expired rather than triggered: fizzles out without a bang.
      m.dead = true;
      for (let k = 0; k < 6; k++) spark(m.x, m.y, spread(50), spread(50), '#6d829a', 0.5, 1.4);
    } else if (m.armed) {
      const reach = m.r + M.trigger;
      for (const e of world.enemies) {
        // Only things that could corrupt the feed can set a mine off.
        if (e.dead || e.harmless || e.staged) continue;
        const rr = reach + e.r;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= rr * rr) {
          detonate(world, m);
          break;
        }
      }
    }

    if (m.dead) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

export function drawMines(ctx, world) {
  for (const m of world.mines) {
    const flying = !m.landed;
    const armed = m.armed;
    const accent = armed ? '#ff9f1c' : '#9fb3c8';

    ctx.save();
    ctx.translate(m.x, m.y);

    if (armed) {
      // trigger radius, so you can read where it will catch something
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 4 + m.spin);
      ctx.strokeStyle = rgba(accent, 0.14 + pulse * 0.16);
      ctx.lineWidth = HAIRLINE;
      ctx.setLineDash([HAIRLINE * 4, HAIRLINE * 6]);
      ctx.beginPath();
      ctx.arc(0, 0, m.r + M.trigger, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, accent, 0, 0, m.r * (flying ? 2.6 : 3.4), flying ? 0.3 : 0.24 + (armed ? 0.3 : 0));
    ctx.globalCompositeOperation = 'source-over';

    ctx.rotate(m.spin);
    ctx.fillStyle = 'rgba(10,16,26,0.94)';
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = HAIRLINE * 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * m.r;
      const y = Math.sin(a) * m.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // spikes appear once it is live
    if (armed) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.5;
        ctx.moveTo(Math.cos(a) * m.r, Math.sin(a) * m.r);
        ctx.lineTo(Math.cos(a) * m.r * 1.5, Math.sin(a) * m.r * 1.5);
      }
      ctx.stroke();
    }

    ctx.fillStyle = rgba(armed ? '#ff2d55' : '#59e0ff', flying ? 0.5 : 0.4 + 0.6 * Math.abs(Math.sin(world.time * 5)));
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** Cadence for the AUTO MINE toggle. Returns the next timer value. */
export function mineCadence(world, timer, dt) {
  if (!world.autoMine || world.phase === 'ending' || world.phase === 'boot') return timer;
  const next = timer - dt;
  if (next > 0) return next;
  if (world.mines.length < M.max) throwMine(world);
  return M.interval * rand(0.85, 1.15);
}
