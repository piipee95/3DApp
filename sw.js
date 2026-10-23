// KultiApp service worker: opens offline with the last version and keeps the app shell fresh.
// Supabase (data, auth, photos) is never cached: it always goes to the network.
const CACHE = 'kultiapp-v23-1';
const SHELL = [
  './',
  'index.html',
  'app.js',
  'styles.css',
  'favicon.svg',
  'manifest.webmanifest',
  'assets/kultiverso-pop-logo.webp',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png'
];
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fonts and the versioned Supabase library: cache first, they never change for a given URL.
  if (STATIC_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(CACHE).then(cache => cache.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if(url.pathname==='/subir.html'||url.pathname==='/subir.js')return;
  // App files: network first so every deploy arrives at once; cache only when offline.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: req.mode === 'navigate' })
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
