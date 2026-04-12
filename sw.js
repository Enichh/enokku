const CACHE_VERSION = 'v1';
const STATIC_CACHE = `enokku-static-${CACHE_VERSION}`;
const API_CACHE = `enokku-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `enokku-images-${CACHE_VERSION}`;
const MAX_IMAGE_CACHE_SIZE = 50 * 1024 * 1024;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/search.html',
  '/manga.html',
  '/reader.html',
  '/library.html',
  '/settings.html',
  '/offline.html',
  '/css/reset.css',
  '/css/variables.css',
  '/css/base.css',
  '/css/utilities.css',
  '/css/cards.css',
  '/css/hero.css',
  '/css/sections.css',
  '/css/tabs.css',
  '/css/details.css',
  '/css/reader.css',
  '/css/search.css',
  '/css/responsive.css',
  '/css/bottom-nav.css',
  '/js/api.js',
  '/js/utils.js',
  '/js/home.js',
  '/js/catalog.js',
  '/js/details-hybrid.js',
  '/js/reader-hybrid.js',
  '/js/reading-history.js',
  '/js/search.js',
  '/js/hybrid-api.js',
  '/js/atsumaru-api.js',
  '/js/tag-map.js',
  '/js/pwa.js',
  '/js/library.js',
  '/js/settings.js',
  '/assets/favicon.svg'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('enokku-') && 
                     !cacheName.includes(CACHE_VERSION);
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isAPIRequest(url)) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  event.respondWith(handleStaticRequest(request));
});

function isAPIRequest(url) {
  return url.pathname.startsWith('/api/') || 
         url.pathname.startsWith('/atsumaru/') ||
         url.hostname === 'api.mangadex.org';
}

function isImageRequest(request) {
  const acceptHeader = request.headers.get('Accept') || '';
  return request.destination === 'image' ||
         acceptHeader.includes('image/') ||
         request.url.includes('uploads.mangadex.org');
}

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Network failed, serving from cache:', request.url);
  }

  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  return caches.match('/offline.html');
}

async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Failed to fetch static resource:', request.url);
    return new Response('Resource not available offline', { status: 503 });
  }
}

async function handleAPIRequest(request) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(request, networkResponse);
        }
      })
      .catch(() => {});
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] API request failed:', request.url);
    return new Response(
      JSON.stringify({ error: 'Offline - Data not available' }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await enforceCacheSizeLimit(cache);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Image not cached:', request.url);
    return new Response('', { status: 404 });
  }
}

async function enforceCacheSizeLimit(cache) {
  const keys = await cache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  if (totalSize > MAX_IMAGE_CACHE_SIZE) {
    const oldestRequest = keys[0];
    await cache.delete(oldestRequest);
    console.log('[SW] Evicted oldest image from cache');
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reading-progress') {
    event.waitUntil(syncReadingProgress());
  }
});

async function syncReadingProgress() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_READING_PROGRESS' });
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
