// KILL SWITCH.
//
// An earlier cache-first service worker kept serving stale files, so code changes
// were invisible until caches were cleared by hand. The browser always re-checks
// THIS file on navigation, so it is the one thing that can reach a device already
// running the old worker. It installs, wipes every cache, unregisters itself and
// reloads open tabs. It deliberately has NO fetch handler, so nothing is intercepted.
//
// Offline support can return once the app settles — reinstate a versioned,
// network-first worker then and re-register it from app.js.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* tab may be closed */ }
    }
  })());
});
