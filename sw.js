// Service Worker for Maria's Art Admin PWA
const CACHE_NAME = 'maria-art-admin-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.css',
  '/admin.js',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
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
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
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

