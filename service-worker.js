// Service Worker for caching images
const CACHE_NAME = 'blinkywink-images-v1';
const IMAGE_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Install event - cache images
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Fetch event - serve from cache if available
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache image requests
  if (event.request.destination === 'image' || 
      url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          // If cached and not expired, return cached version
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Otherwise fetch and cache
          return fetch(event.request).then((response) => {
            // Only cache successful responses
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            // If fetch fails and we have a cached version, use it
            return cachedResponse || new Response('Image not available', { status: 404 });
          });
        });
      })
    );
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});
