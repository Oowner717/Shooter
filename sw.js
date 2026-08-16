// Offline cache.
//
// Network-first for everything the app is made of. An earlier version served
// scripts cache-first against a cache name that never changed, which pinned
// players to whatever build they first loaded — new index.html, old modules.
// Correctness beats a few milliseconds of startup here: the cache exists so
// the game runs on a plane, not to save a round trip on every launch.
//
// BUILD must match CFG.build in src/config.js.
const BUILD = '5';
const CACHE = `sim7749-${BUILD}`;
const NET_TIMEOUT = 3500;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/game.js',
  './src/config.js',
  './src/util.js',
  './src/physics.js',
  './src/fx.js',
  './src/background.js',
  './src/glitch.js',
  './src/audio.js',
  './src/enemies.js',
  './src/projectiles.js',
  './src/shooter.js',
  './src/gate.js',
  './src/boss.js',
  './src/abilities.js',
  './src/narrative.js',
  './src/hud.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Reject rather than hang forever on a stalled connection. */
function fetchWithTimeout(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetchWithTimeout(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(
        (hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(new Error('offline'))),
      )),
  );
});
