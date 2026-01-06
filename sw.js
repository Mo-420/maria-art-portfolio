// Service Worker for Maria's Art Admin PWA
const CACHE_NAME = 'maria-art-admin-v5';

// Keep the precache list minimal to avoid pinning old app code.
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Activate new SW immediately
  self.skipWaiting();
});

// Fetch event:
// - Network-first for HTML/CSS/JS (so deploys take effect)
// - Cache-first for images/fonts (speed)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always bypass SW cache for API requests to ensure fresh data
  if (
    url.hostname.endsWith('workers.dev') ||
    url.pathname === '/artworks' ||
    url.pathname === '/poetry' ||
    url.pathname === '/site-content'
  ) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  const accept = req.headers.get('accept') || '';
  const isHtml = req.mode === 'navigate' || accept.includes('text/html');
  const isCss = url.pathname.endsWith('.css');
  const isJs = url.pathname.endsWith('.js');
  const isAsset =
    url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i);

  if (isHtml || isCss || isJs) {
    // Network-first
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          // Update cache in background for offline
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (isAsset) {
    // Cache-first for heavy assets
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        });
      })
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(caches.match(req).then(r => r || fetch(req)));
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Handle background sync for offline artwork submissions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Handle offline submissions when connection is restored
  return new Promise((resolve) => {
    // Check for pending submissions in localStorage
    const pendingSubmissions = JSON.parse(localStorage.getItem('pendingSubmissions') || '[]');
    
    if (pendingSubmissions.length > 0) {
      // Process pending submissions
      pendingSubmissions.forEach(submission => {
        // Sync with server when online
        console.log('Syncing pending submission:', submission);
      });
      
      // Clear pending submissions
      localStorage.removeItem('pendingSubmissions');
    }
    
    resolve();
  });
}

