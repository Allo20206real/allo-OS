// allo OS service worker: keeps the system and installed apps available offline.
const SHELL = 'allo-shell-v1';
const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'os/style.css', 'os/system.js', 'os/wallpapers.js',
  'sdk/allo.css', 'sdk/allo.js', 'apps/catalog.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('allo-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Serve from cache first (system files + installed app packages), then refresh
// system files in the background so updates arrive on the next launch.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: sameOrigin });
    const network = fetch(req).then(async res => {
      if (res.ok && sameOrigin) {
        // refresh whichever cache already holds this file
        for (const name of await caches.keys()) {
          const c = await caches.open(name);
          if (await c.match(req, { ignoreSearch: true })) { await c.put(req, res.clone()); }
        }
      }
      return res;
    });
    if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
    try { return await network; }
    catch (err) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html');
        if (shell && url.pathname.endsWith('/')) return shell;
      }
      throw err;
    }
  })());
});
