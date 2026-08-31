// Swipe an overlay away.
//
// Every panel in this game already closes by a button, a scrim or Escape. On a
// phone the cheapest gesture is the one you were already making: push the thing
// off the way it came in. One helper, bound per panel, so there is one place
// the awkward parts live -- and the awkward parts are the whole of this file.
//
// THREE THINGS THAT WILL BITE, in the order they will bite:
//
//   A LEAKED INLINE TRANSFORM IS AN OPEN PANEL PARKED OFF SCREEN. Inline style
//   beats `#menu.open { transform: none }`, so a drag that is abandoned without
//   cleaning up leaves a panel that is open, holds `Game.paused`, takes input,
//   and cannot be seen. Every exit clears it -- release, cancel, lost capture,
//   and a close arriving from somewhere else while a drag is live.
//
//   THE PANELS SCROLL. `#menuPanels`, `#loadList`, the debug panel and the
//   title screen are all scrollers, and `html, body { touch-action: none }`
//   means the browser pans them itself. A swipe that claims a drag the content
//   wanted is a panel that will not scroll.
//
//   HALF THESE CONTROLS FIRE ON POINTERDOWN. The aperture rows, the aim-mode
//   buttons and the sheet's three buttons have all acted before any movement
//   exists, so on those panels the gesture is only ever taken from the chrome.

/** Which way a panel leaves, as a unit vector plus the axis to watch. */
const DIRS = {
  up: { axis: 'y', sign: -1 },
  down: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
};

/**
 * Is anything between `target` and `el` still able to scroll the way the
 * content would have to travel for this drag?
 *
 * The browser pans a scroller with the same gesture, so claiming one is taking
 * the drag out of the player's hands. Walks up rather than testing `el` alone,
 * because the scroller is usually a child -- `#menuPanels` inside `#menu`.
 */
function canScroll(target, el, axis, sign) {
  let n = target;
  while (n && n !== el.parentNode) {
    if (n.nodeType === 1) {
      const over = axis === 'y'
        ? n.scrollHeight - n.clientHeight
        : n.scrollWidth - n.clientWidth;
      if (over > 1) {
        const at = axis === 'y' ? n.scrollTop : n.scrollLeft;
        // Dragging DOWN reveals content above, so it needs room above it.
        const room = sign > 0 ? at > 0 : at < over - 1;
        if (room) return true;
      }
    }
    if (n === el) break;
    n = n.parentNode;
  }
  return false;
}

/**
 * Bind swipe-to-dismiss to one element.
 *
 * @param el       the panel itself
 * @param dir      'up' | 'down' | 'left' | 'right' -- the way it leaves
 * @param onClose  the panel's OWN close path, never direct DOM. Those are what
 *                 own `body.menuOpen` and friends, `Game.paused`, and whatever
 *                 else the close is supposed to do.
 * @param base     a transform the element already carries and must keep. Not
 *                 decoration: `#waveSheet` is centred with `translateX(-50%)`
 *                 and clobbering it throws the sheet half a screen sideways.
 * @param canStart optional veto, for panels whose controls fire on pointerdown.
 */
export function swipeToDismiss(el, {
  dir = 'down', onClose, base = '', threshold = 64, slop = 12, canStart = null,
} = {}) {
  if (!el || !onClose) return () => {};
  const D = DIRS[dir] || DIRS.down;
  let id = null;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let live = false; // the drag has been claimed and is moving the panel

  const put = (d) => {
    const t = D.axis === 'y' ? `translateY(${d}px)` : `translateX(${d}px)`;
    el.style.transform = base ? `${base} ${t}` : t;
  };

  /** Everything that ends a drag comes through here, including a close. */
  const clear = () => {
    id = null;
    live = false;
    el.style.transform = '';
    el.classList.remove('swiping');
  };

  const down = (ev) => {
    if (id !== null) return;
    if (canStart && !canStart(ev)) return;
    id = ev.pointerId;
    x0 = ev.clientX;
    y0 = ev.clientY;
    t0 = performance.now();
    live = false;
    // Deliberately no preventDefault and no capture yet: the panel's own
    // controls are still allowed to take this press.
  };

  const move = (ev) => {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    const along = D.axis === 'y' ? dy : dx;
    const across = D.axis === 'y' ? dx : dy;
    if (!live) {
      if (Math.abs(along) < slop) return;
      // Wrong way, wrong axis, or the content wanted it.
      if (along * D.sign <= 0) { id = null; return; }
      if (Math.abs(across) > Math.abs(along)) { id = null; return; }
      if (canScroll(ev.target, el, D.axis, D.sign)) { id = null; return; }
      live = true;
      el.classList.add('swiping');
      // Throws NotFoundError when the pointer has already gone -- the same
      // guard the canvas needs, and for the same reason.
      try { el.setPointerCapture(ev.pointerId); } catch { /* already gone */ }
    }
    put(along);
    ev.preventDefault();
  };

  const up = (ev) => {
    if (ev.pointerId !== id) return;
    const along = (D.axis === 'y' ? ev.clientY - y0 : ev.clientX - x0) * D.sign;
    const speed = along / Math.max(1, performance.now() - t0);
    /*
     * A flick still has to have gone somewhere.
     *
     * Velocity alone dismisses on a twitch: divide any distance by a short
     * enough time and it is a flick, and the shorter the gesture the easier
     * that is to hit. Measured with synthetic pointers, which arrive in the
     * same millisecond -- a thirty-pixel nudge read as 30 px/ms and threw the
     * menu away. A real thumb can do the same thing more slowly. So the fast
     * path still owes three quarters of the distance -- enough that a nudge
     * cannot reach it however fast it is made.
     */
    const go = live && (along > threshold || (speed > 0.5 && along > threshold * 0.75));
    const was = live;
    clear();
    if (!go) return;
    if (was) {
      // A claimed drag must not also land as a tap on whatever is underneath.
      const eat = (e) => { e.stopPropagation(); e.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 0);
    }
    onClose();
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('lostpointercapture', clear);
  // ...and the caller gets a way to abandon a drag when the panel is closed
  // from somewhere else mid-gesture.
  return clear;
}
