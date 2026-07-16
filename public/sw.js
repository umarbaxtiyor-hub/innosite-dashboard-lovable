// Innosite service worker — NetworkFirst for HTML, cache-first for static assets.
const VERSION = 'v1';
const HTML_CACHE = `html-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => ![HTML_CACHE, ASSET_CACHE].includes(n)).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Don't cache API / auth / supabase paths
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth')) return;

  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(HTML_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/');
      }
    })());
    return;
  }

  // Static assets: cache-first
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(ASSET_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
  }
});
