// Bootstrap: sizing, the frame loop, iOS gesture suppression, service worker.

import { Game } from './game.js';
import { BUILD } from './config.js';
import { audio } from './audio.js';

const canvas = document.getElementById('stage');
const game = new Game(canvas);
window.__sim = game; // handy for the smoke test and for poking at a live run

// ------------------------------------------------------------------ layout

let resizeTimer = 0;
function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 120);
}
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 320));
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);

// --------------------------------------------------- iOS gesture suppression

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  // Going away: write the run down now. On iOS this is the last event the page
  // is guaranteed to get -- a backgrounded PWA can be killed without another
  // frame, a beforeunload or anything else, so a save on the way out is the
  // only one that can be relied on.
  if (document.hidden) { game.checkpoint(); return; }
  last = performance.now();
  audio.resume();
});
window.addEventListener('pagehide', () => game.checkpoint());

// -------------------------------------------------------------- frame loop

let last = performance.now();

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt > 0 ? dt : 1 / 60);
  game.draw();
  game.trackFrame(Math.min(dt * 1000, 60));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --------------------------------------------------------- service worker

if ('serviceWorker' in navigator) {
  // If a worker was already driving this page and a new one takes over, the
  // modules currently in memory are the old build. Reload once so the running
  // code and the cached code cannot disagree.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?b=${BUILD}`)
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}
