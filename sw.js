// Use build timestamp for cache versioning - changes with each deploy
// This ensures old caches are automatically invalidated on new deploys
const BUILD_TIMESTAMP = "__BUILD_TIMESTAMP__";
const CACHE_VERSION =
  BUILD_TIMESTAMP === "__BUILD_TIMESTAMP__" ? "v23" : BUILD_TIMESTAMP;

// Single cache for static assets only
const STATIC_CACHE = `enokku-static-${CACHE_VERSION}`;

// Static assets to pre-cache
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/search.html",
  "/manga.html",
  "/reader.html",
  "/library.html",
  "/settings.html",
  "/version.json",
  "/css/reset.css",
  "/css/variables.css",
  "/css/base.css",
  "/css/utilities.css",
  "/css/cards.css",
  "/css/hero.css",
  "/css/sections.css",
  "/css/tabs.css",
  "/css/details.css",
  "/css/reader.css",
  "/css/search.css",
  "/css/responsive.css",
  "/css/bottom-nav.css",
  "/js/api.js",
  "/js/utils.js",
  "/js/home.js",
  "/js/catalog.js",
  "/js/details-hybrid.js",
  "/js/reader-hybrid.js",
  "/js/reading-history.js",
  "/js/search.js",
  "/js/hybrid-api.js",
  "/js/atsumaru-api.js",
  "/js/tag-map.js",
  "/js/pwa.js",
  "/js/library.js",
  "/js/settings.js",
  "/assets/favicon.svg",
];

// Cache-first strategy for static assets
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error(`[SW] Cache-first failed for ${request.url}:`, error);
    throw error;
  }
}

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error);
      }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Only delete old versioned caches
              const isVersioned =
                cacheName.startsWith("enokku-") &&
                cacheName !== STATIC_CACHE &&
                cacheName.includes("-v");
              return isVersioned;
            })
            .map((cacheName) => {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }),
        );
      })
      .then(() => {
        return self.clients.claim();
      }),
  );
});

// Fetch event - handle requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:" || url.protocol === "chrome:") {
    return;
  }

  // Never cache version.json - always fetch fresh
  if (url.pathname === "/version.json") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => {
        return caches.match(request);
      }),
    );
    return;
  }

  // Static assets - cache-first
  const isStaticAsset =
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".ttf");

  if (isStaticAsset) {
    event.respondWith(
      cacheFirst(request, STATIC_CACHE).catch(() => {
        return new Response("Resource not available", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }),
    );
    return;
  }

  // Navigation requests (HTML pages) - cache-first for shell
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.match(request, { ignoreSearch: true }))
        .then((cached) => {
          if (cached) {
            return cached;
          }
          // Fetch from network if not cached
          return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              // Cache with clean path
              const cleanRequest = new Request(url.origin + url.pathname);
              caches
                .open(STATIC_CACHE)
                .then((cache) =>
                  cache.put(cleanRequest, networkResponse.clone()),
                );
            }
            return networkResponse;
          });
        })
        .catch(() => {
          // Network failed and no cache - return basic offline response
          return new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Offline - Enokku</title></head>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1>You're Offline</h1>
                <p>Please check your internet connection to use Enokku.</p>
                <a href="/">Try Again</a>
              </body>
            </html>`,
            {
              status: 200,
              headers: { "Content-Type": "text/html" },
            },
          );
        }),
    );
    return;
  }

  // All other requests (API, images) - let browser handle normally
});

// Message handling for skip waiting
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
