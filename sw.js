const CACHE_NAME = 'enhanced-pong-v1.7.0';
const urlsToCache = [
  './',
  './index.html',
  './enhanced-pong.html',
  './pong.html',
  './achievement-system.js',
  './leaderboard-system.js',
  './version-manager.js',
  './version-config.json',
  './manifest.json',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './apple-touch-icon.png',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'})));
      })
      .catch((error) => {
        console.error('Service Worker: Error caching files', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }

        console.log('Service Worker: Fetching from network', event.request.url);
        return fetch(event.request).then((response) => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response as it can only be consumed once
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, show a generic offline page
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
  );
});

// Handle background sync for analytics (when connection is restored)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'analytics-sync') {
    event.waitUntil(syncAnalytics());
  }
});

// Handle push notifications (for future features)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received', event);
  
  const options = {
    body: event.data ? event.data.text() : 'New achievement unlocked!',
    icon: './icon-192x192.png',
    badge: './icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Play Now',
        icon: './icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: './icon-192x192.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Enhanced Pong', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received', event);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('./enhanced-pong.html')
    );
  }
});

// Sync analytics data when connection is restored
async function syncAnalytics() {
  try {
    // Get stored analytics data from IndexedDB or localStorage
    const analyticsData = await getStoredAnalytics();
    
    if (analyticsData && analyticsData.length > 0) {
      console.log('Service Worker: Syncing analytics data', analyticsData.length, 'entries');
      
      // In a real app, you would send this to your analytics service
      // For now, we'll just log it and clear the stored data
      console.log('Service Worker: Analytics data synced successfully');
      await clearStoredAnalytics();
    }
  } catch (error) {
    console.error('Service Worker: Error syncing analytics', error);
  }
}

// Helper functions for analytics storage
async function getStoredAnalytics() {
  try {
    return JSON.parse(localStorage.getItem('pendingAnalytics') || '[]');
  } catch (error) {
    console.error('Service Worker: Error getting stored analytics', error);
    return [];
  }
}

async function clearStoredAnalytics() {
  try {
    localStorage.removeItem('pendingAnalytics');
  } catch (error) {
    console.error('Service Worker: Error clearing stored analytics', error);
  }
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: CACHE_NAME});
  }
});