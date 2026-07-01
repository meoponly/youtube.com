// Ewtube Service Worker — Cache-first for static assets, network-first for API calls
const CACHE_NAME = 'ewtube-v1';

// Resources to pre-cache on install (app shell)
const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js',
];

// Domains that should NEVER be cached (live API data)
const NO_CACHE_DOMAINS = [
  'googleapis.com/youtube',
  'firebasedatabase.app',
  'suggestqueries',
];

// Domains that should be cached aggressively (fonts, icons, images)
const CACHE_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com/firebasejs',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Pre-cache critical resources, ignore failures (some may 404 on first run)
      return Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Delete old cache versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET requests
  if(e.request.method !== 'GET') return;

  // Skip API calls — always go to network, never cache
  if(NO_CACHE_DOMAINS.some(d => url.includes(d))) return;

  // YouTube thumbnails — cache for 1 day (they don't change)
  if(url.includes('i.ytimg.com') || url.includes('yt3.ggpht') || url.includes('yt3.googleusercontent')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(response => {
            if(response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Fonts and Firebase SDK — cache-first (these never change)
  if(CACHE_DOMAINS.some(d => url.includes(d))) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(response => {
            if(response.ok) cache.put(e.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // The HTML file itself — network-first with cache fallback (so updates deploy)
  if(url.endsWith('.html') || url.endsWith('/') || url === self.location.origin + '/') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if(response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  // Everything else — try cache, fall back to network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Listen for messages from the page (e.g. cache a specific thumbnail)
self.addEventListener('message', e => {
  if(e.data?.type === 'CACHE_URLS') {
    caches.open(CACHE_NAME).then(cache => {
      (e.data.urls || []).forEach(url => {
        fetch(url).then(r => { if(r.ok) cache.put(url, r); }).catch(() => {});
      });
    });
  }
});
