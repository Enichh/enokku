// Use build timestamp for cache versioning - changes with each deploy
// This ensures old caches are automatically invalidated on new deploys
const BUILD_TIMESTAMP = "__BUILD_TIMESTAMP__";
const CACHE_VERSION =
  BUILD_TIMESTAMP === "__BUILD_TIMESTAMP__" ? "v23" : BUILD_TIMESTAMP;

// Cache names - STATIC and API are versioned, IMAGE is persistent for offline reading
const STATIC_CACHE = `enokku-static-${CACHE_VERSION}`;
const API_CACHE = `enokku-api-${CACHE_VERSION}`;
const IMAGE_CACHE = "enokku-images"; // Static name - persists across deploys

// Cache size limits
const MAX_IMAGE_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_API_CACHE_SIZE = 10 * 1024 * 1024; // 10MB

// Cache expiration times (in milliseconds)
const API_CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

// Static assets to pre-cache
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/search.html",
  "/manga.html",
  "/reader.html",
  "/library.html",
  "/settings.html",
  "/offline.html",
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

// ============================================
// CACHE STRATEGIES
// ============================================

/**
 * Cache-First Strategy
 * Serve from cache immediately. If not cached, fetch from network and cache.
 * Best for: Static assets (CSS, JS, images) that rarely change
 */
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

/**
 * Network-First Strategy
 * Try network first, fall back to cache if offline.
 * Best for: HTML pages, API calls that need fresh data
 */
async function networkFirst(request, cacheName, timeout = 5000) {
  const cache = await caches.open(cacheName);

  try {
    // Race between network fetch and timeout
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout),
      ),
    ]);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed or timeout - try cache
    const cached = await cache.match(request);
    if (cached) {
      console.log(`[SW] Serving from cache (offline): ${request.url}`);
      return cached;
    }
    throw error;
  }
}

/**
 * Stale-While-Revalidate Strategy
 * Serve from cache immediately, then update cache in background.
 * Best for: API responses where immediate display is priority
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Check if cached response is expired
  const isExpired = cached ? isCacheEntryExpired(cached) : true;

  // Start background fetch to update cache
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        // Add timestamp header for expiration tracking
        const responseWithTimestamp = addCacheTimestamp(response);
        cache.put(request, responseWithTimestamp);
      }
      return response;
    })
    .catch((error) => {
      console.log(`[SW] Background fetch failed: ${request.url}`, error);
    });

  // Return cached immediately if available and not expired
  if (cached && !isExpired) {
    return cached;
  }

  // If no cache or expired, wait for network
  return fetchPromise;
}

/**
 * Network-Only Strategy
 * Always fetch from network, never cache.
 * Best for: Non-GET requests, real-time data
 */
async function networkOnly(request) {
  return fetch(request);
}

// ============================================
// CACHE UTILITY FUNCTIONS
// ============================================

/**
 * Add timestamp header to response for expiration tracking
 */
function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", Date.now().toString());

  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

/**
 * Check if a cached response has expired
 */
function isCacheEntryExpired(response) {
  const cachedAt = response.headers.get("x-sw-cached-at");
  if (!cachedAt) return true;

  const age = Date.now() - parseInt(cachedAt, 10);
  return age > API_CACHE_EXPIRATION;
}

/**
 * Calculate total size of a cache
 */
async function calculateCacheSize(cache) {
  const keys = await cache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return totalSize;
}

/**
 * Enforce size limit on cache using LRU eviction
 */
async function enforceCacheSizeLimit(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const size = await calculateCacheSize(cache);

  if (size <= maxSize) return;

  // Get all entries with their timestamps
  const keys = await cache.keys();
  const entries = [];

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const cachedAt = response.headers.get("x-sw-cached-at") || "0";
      entries.push({
        request,
        timestamp: parseInt(cachedAt, 10) || 0,
      });
    }
  }

  // Sort by timestamp (oldest first)
  entries.sort((a, b) => a.timestamp - b.timestamp);

  // Remove oldest entries until under limit
  let currentSize = size;
  for (const entry of entries) {
    if (currentSize <= maxSize) break;

    const response = await cache.match(entry.request);
    if (response) {
      const blob = await response.blob();
      currentSize -= blob.size;
      await cache.delete(entry.request);
      console.log(`[SW] Evicted from ${cacheName}:`, entry.request.url);
    }
  }
}

/**
 * Create fetch options for MangaDex images (no-referrer policy)
 */
function createMangaDexFetchOptions(request) {
  return {
    method: request.method,
    headers: request.headers,
    mode: "cors",
    credentials: "omit",
    referrer: "",
    referrerPolicy: "no-referrer",
  };
}

// ============================================
// ROUTE CLASSIFICATION
// ============================================

/**
 * Determine which caching strategy to use based on request
 */
function getStrategyForRequest(request, url) {
  const { pathname, hostname } = url;

  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:" || url.protocol === "chrome:") {
    return "skip";
  }

  // Non-GET requests always use network-only
  if (request.method !== "GET") {
    return "network-only";
  }

  // Navigation requests (HTML pages)
  if (request.mode === "navigate") {
    return "network-first";
  }

  // API requests - Stale-while-revalidate
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/atsumaru/") ||
    hostname === "api.mangadex.org"
  ) {
    return "stale-while-revalidate";
  }

  // Static assets - Cache-first
  if (
    pathname.startsWith("/css/") ||
    pathname.startsWith("/js/") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".ttf")
  ) {
    return "cache-first-static";
  }

  // Image requests - Cache-first with LRU
  // Includes MangaDex CDN images (uploads.mangadex.org)
  const isImage =
    request.destination === "image" ||
    pathname.match(/\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i) ||
    hostname === "uploads.mangadex.org";

  if (isImage) {
    return "cache-first-image";
  }

  // Default to network-first for safety
  return "network-first";
}

// ============================================
// SERVICE WORKER EVENTS
// ============================================

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

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Only delete versioned caches that don't match current version
              // Preserve unversioned image cache (enokku-images)
              const isVersioned =
                cacheName.includes("-v") || /-v\d+$/.test(cacheName);
              const isOldVersion =
                cacheName.startsWith("enokku-") &&
                !cacheName.includes(CACHE_VERSION) &&
                isVersioned;
              return isOldVersion;
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Get strategy for this request
  const strategy = getStrategyForRequest(request, url);

  // Skip certain requests
  if (strategy === "skip") {
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

  // Apply the appropriate strategy
  switch (strategy) {
    case "cache-first-static":
      event.respondWith(
        cacheFirst(request, STATIC_CACHE).catch(() => {
          return new Response("Resource not available offline", {
            status: 503,
            statusText: "Service Unavailable",
          });
        }),
      );
      break;

    case "cache-first-image":
      event.respondWith(
        handleImageRequest(request, url).catch(() => {
          return new Response("", { status: 404 });
        }),
      );
      break;

    case "stale-while-revalidate":
      event.respondWith(
        staleWhileRevalidate(request, API_CACHE).catch(() => {
          return new Response(
            JSON.stringify({ error: "Offline - Data not available" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }),
      );
      break;

    case "network-first":
      event.respondWith(
        handleNavigation(request).catch((error) => {
          console.log(
            "[SW] Network-first failed, falling back to offline.html:",
            error,
          );
          return caches.match("/offline.html");
        }),
      );
      break;

    case "network-only":
    default:
      // Let browser handle normally
      break;
  }
});

// ============================================
// REQUEST HANDLERS
// ============================================

/**
 * Handle image requests with cache-first and LRU eviction
 */
async function handleImageRequest(request, url) {
  const cache = await caches.open(IMAGE_CACHE);

  // Create clean URL for caching (strip query params for MangaDex)
  const isMangaDex = url.hostname.includes("mangadex.org");
  const cleanUrl = isMangaDex ? `${url.origin}${url.pathname}` : request.url;
  const cacheKey = new Request(cleanUrl);

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch with appropriate options
  const fetchOptions = isMangaDex
    ? createMangaDexFetchOptions(request)
    : { method: request.method, headers: request.headers, mode: "cors" };

  const networkResponse = await fetch(request.url, fetchOptions);

  // Accept both successful and opaque responses for MangaDex images
  if (networkResponse.ok || networkResponse.type === "opaque") {
    // Enforce size limit before adding new entry
    await enforceCacheSizeLimit(IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE);

    // Add timestamp and cache
    const responseWithTimestamp = addCacheTimestamp(networkResponse);
    await cache.put(cacheKey, responseWithTimestamp);
  }

  return networkResponse;
}

/**
 * Handle navigation requests (HTML pages)
 */
async function handleNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);
  const url = new URL(request.url);

  try {
    // Try network first with shorter timeout for mobile
    const timeout = url.pathname.includes("mangadex.org") ? 3000 : 5000;
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout),
      ),
    ]);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log(
      "[SW] Network failed for navigation:",
      request.url,
      error.message,
    );

    // For mobile browsers, immediately try offline page if network fails
    if (
      error.message === "timeout" ||
      error.message.includes("Failed to fetch")
    ) {
      console.log(
        "[SW] Network timeout/failure detected, checking offline page",
      );
    }
  }

  // Fall back to cache
  const cached = await cache.match(request);
  if (cached) {
    console.log("[SW] Serving from cache:", request.url);
    return cached;
  }

  // Ultimate fallback to offline page
  const offlinePage = await cache.match("/offline.html");
  if (offlinePage) {
    console.log("[SW] Serving offline page for:", request.url);
    return offlinePage;
  }

  // If offline.html not cached, try to fetch it
  try {
    const offlineResponse = await fetch("/offline.html");
    if (offlineResponse.ok) {
      await cache.put("/offline.html", offlineResponse.clone());
      console.log("[SW] Cached and serving offline page");
      return offlineResponse;
    }
  } catch (offlineError) {
    console.error("[SW] Failed to fetch offline.html:", offlineError);
  }

  throw new Error("No cached response available");
}

// ============================================
// BACKGROUND SYNC
// ============================================

self.addEventListener("sync", (event) => {
  switch (event.tag) {
    case "sync-reading-progress":
      event.waitUntil(syncReadingProgress());
      break;
    case "sync-bookmarks":
      event.waitUntil(syncBookmarks());
      break;
    case "sync-reading-queue":
      event.waitUntil(syncReadingQueue());
      break;
    default:
      console.log(`[SW] Unknown sync tag: ${event.tag}`);
  }
});

async function syncReadingProgress() {
  console.log("[SW] Syncing reading progress...");

  try {
    // Get all clients and notify them to sync their reading progress
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      client.postMessage({ type: "SYNC_READING_PROGRESS" });
    });

    console.log("[SW] Reading progress sync completed");
    return true;
  } catch (error) {
    console.error("[SW] Reading progress sync failed:", error);
    return false;
  }
}

async function syncBookmarks() {
  console.log("[SW] Syncing bookmarks...");

  try {
    // Get all clients and notify them to sync bookmarks
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      client.postMessage({ type: "SYNC_BOOKMARKS" });
    });

    console.log("[SW] Bookmarks sync completed");
    return true;
  } catch (error) {
    console.error("[SW] Bookmarks sync failed:", error);
    return false;
  }
}

async function syncReadingQueue() {
  console.log("[SW] Processing reading queue...");

  try {
    // This would sync queued operations from IndexedDB
    // For now, notify clients to process their queues
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      client.postMessage({ type: "SYNC_READING_QUEUE" });
    });

    console.log("[SW] Reading queue sync completed");
    return true;
  } catch (error) {
    console.error("[SW] Reading queue sync failed:", error);
    return false;
  }
}

// ============================================
// MESSAGE HANDLING
// ============================================

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // Handle cache management messages from main thread
  if (event.data && event.data.type === "CLEAR_IMAGE_CACHE") {
    event.waitUntil(
      caches.delete(IMAGE_CACHE).then(() => {
        console.log("[SW] Image cache cleared");
        event.source.postMessage({ type: "CACHE_CLEARED", cache: IMAGE_CACHE });
      }),
    );
  }

  // Handle background sync registration requests
  if (event.data && event.data.type === "REGISTER_SYNC") {
    const tag = event.data.tag;
    if (tag) {
      event.waitUntil(
        (async () => {
          try {
            const registration = await self.registration.sync.register(tag);
            console.log(`[SW] Background sync registered: ${tag}`);
            event.source.postMessage({
              type: "SYNC_REGISTERED",
              tag: tag,
              success: true,
            });
          } catch (error) {
            console.error(
              `[SW] Failed to register background sync ${tag}:`,
              error,
            );
            event.source.postMessage({
              type: "SYNC_REGISTERED",
              tag: tag,
              success: false,
              error: error.message,
            });
          }
        })(),
      );
    }
  }

  // Handle storage usage requests
  if (event.data && event.data.type === "GET_STORAGE_USAGE") {
    event.waitUntil(
      (async () => {
        try {
          const imageCache = await caches.open(IMAGE_CACHE);
          const keys = await imageCache.keys();
          let totalSize = 0;

          for (const request of keys) {
            const response = await imageCache.match(request);
            if (response) {
              const blob = await response.blob();
              totalSize += blob.size;
            }
          }

          event.source.postMessage({
            type: "STORAGE_USAGE",
            usage: totalSize,
            cacheName: IMAGE_CACHE,
          });
        } catch (error) {
          console.error("[SW] Failed to get storage usage:", error);
          event.source.postMessage({
            type: "STORAGE_USAGE",
            usage: 0,
            error: error.message,
          });
        }
      })(),
    );
  }
});
