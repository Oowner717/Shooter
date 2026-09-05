// Bootstrap: sizing, the frame loop, iOS gesture suppression, service worker.

import { Game } from './game.js';
import { dividend } from './enemies.js';
import { BUILD } from './config.js';
import { audio } from './audio.js';

const canvas = document.getElementById('stage');
const game = new Game(canvas);
window.__sim = game; // handy for the smoke test and for poking at a live run
// The yield probe reads the depth dividend the same way it reads everything
// else -- off the live game rather than by recomputing the formula, so the
// two cannot drift apart and quietly disagree about what was measured.
game.__dividend = dividend;

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
  // Two numbers, not one: the interval says whether the frame landed on time,
  // the work says how much of it we spent. The governor needs both -- see
  // Game.trackFrame for why either alone is blind to a real kind of slowness.
  const started = performance.now();
  game.update(dt > 0 ? dt : 1 / 60);
  game.draw();
  game.trackFrame(Math.min(dt * 1000, 60), performance.now() - started);
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
  // How much of index.html the foreground check reads, and what it looks for
  // in it. `check-build.mjs` asserts the literal lands inside the window.
  const PROBE_BYTES = 4096;
  const PROBE_RE = /var BUILD = '([^']+)'/;
  let asking = false;
  let lastAsk = 0;
  let reloadFor = null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?b=${BUILD}`)
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
    askServer();
  });

  /*
   * ---- ...and it has to ASK AGAIN, on every return to the foreground ----
   *
   * Everything above this fires on `load`, and so does index.html's own cache
   * escape hatch. That is once per COLD START, which is not once per launch:
   * a home-screen app's session survives backgrounding for days, so an install
   * iOS never evicts registers its worker on its first launch and never checks
   * again. Reported from a phone sitting on build 257 with 258 live and the
   * Pages deploy green: the app had simply never been loaded again.
   *
   * This is the build-113 fault verbatim, and the fix is the one the SINGLE
   * FILE build already has. It was written there, in the page's own head,
   * because the bundle has no worker to lean on -- and the served build, which
   * is what the home-screen link actually is, never got it. Two update paths,
   * one of them fixed.
   *
   * It reads the build out of the first `PROBE_BYTES` of index.html rather
   * than fetching the page: the literal sits at byte 2197 and the whole file
   * is 18kB, so a range request is a tenth of the traffic on a check that runs
   * every time the app comes forward. `check-build.mjs` fails the build if that
   * literal ever moves outside the window -- the same guard, and the same
   * reason, as the rev stamp bundle.mjs pins inside its own first 2kB.
   *
   * The loop guard is on the INCOMING build and not on the check, so it will
   * reload at most once for any given target and cannot spin.
   */
  function askServer() {
    const now = Date.now();
    if (asking || reloading || now - lastAsk < 4000) return;
    asking = true;
    lastAsk = now;
    /*
     * The worker is nudged and NOT waited on. `registration.update()` settles
     * when the browser has finished fetching and comparing the worker script,
     * which is a network round trip it is entitled to take its time over --
     * and chaining the check behind it means a single slow or hung update
     * leaves `asking` true for the rest of the session and the app never
     * checks again. That is the same failure this whole function exists to
     * fix, one level down. Fire it, forget it, and go and ask.
     */
    navigator.serviceWorker.getRegistration()
      .then((reg) => { if (reg) reg.update().catch(() => {}); })
      .catch(() => {});
    fetch('./index.html', {
      cache: 'no-store',
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
    })
      // 206 if the host honoured the range, 200 if it ignored it. Either
      // carries the literal; a host that does neither is offline and there is
      // nothing to update to.
      .then((res) => (res && res.ok ? res.text() : null))
      .then((text) => {
        const m = text && PROBE_RE.exec(text);
        if (!m || m[1] === BUILD || reloadFor === m[1]) return;
        reloadFor = m[1];
        reloading = true;
        window.location.reload();
      })
      .catch(() => {})
      .then(() => { asking = false; });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) askServer();
  });
  // ...and a bfcache restore, which does not fire `visibilitychange` at all.
  window.addEventListener('pageshow', () => askServer());
}
