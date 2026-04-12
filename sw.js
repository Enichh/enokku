const CACHE_VERSION = "v7";
const STATIC_CACHE = `enokku-static-${CACHE_VERSION}`;
const API_CACHE = `enokku-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `enokku-images-${CACHE_VERSION}`;
const MAX_IMAGE_CACHE_SIZE = 50 * 1024 * 1024;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/search.html",
  "/manga.html",
  "/reader.html",
  "/library.html",
  "/settings.html",
  "/offline.html",
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
              return (
                cacheName.startsWith("enokku-") &&
                !cacheName.includes(CACHE_VERSION)
              );
            })
            .map((cacheName) => {
              // console.log("[SW] Deleting old cache:", cacheName);
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

  // console.log(
  //   "[SW] Fetch:",
  //   request.method,
  //   url.pathname,
  //   "destination:",
  //   request.destination,
  // );

  // Skip chrome-extension requests (can't be cached)
  if (url.protocol === "chrome-extension:" || url.protocol === "chrome:") {
    // console.log("[SW] Skipping chrome-extension request");
    return;
  }

  // Skip MangaDex images - let browser handle directly with img referrerpolicy
  if (url.hostname === "uploads.mangadex.org") {
    // console.log("[SW] Skipping MangaDex image:", url.hostname);
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isAPIRequest(url)) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request, event));
    return;
  }

  event.respondWith(handleStaticRequest(request));
});

function isAPIRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/atsumaru/") ||
    url.hostname === "api.mangadex.org"
  );
}

function isImageRequest(request) {
  const acceptHeader = request.headers.get("Accept") || "";
  return (
    request.destination === "image" ||
    acceptHeader.includes("image/") ||
    request.url.includes("uploads.mangadex.org")
  );
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
    // console.log("[SW] Network failed, serving from cache:", request.url);
  }

  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  return caches.match("/offline.html");
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
    console.error("[SW] Failed to fetch static resource:", request.url);
    return new Response("Resource not available offline", { status: 503 });
  }
}

async function handleAPIRequest(request) {
  // console.log("[SW] handleAPIRequest:", request.url);
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // console.log("[SW] API cache hit:", request.url);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    // console.log("[SW] API fetch status:", networkResponse.status, request.url);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      // console.log("[SW] API cached:", request.url);
    }
    return networkResponse;
  } catch (error) {
    console.error("[SW] API request failed:", request.url, error);
    return new Response(
      JSON.stringify({ error: "Offline - Data not available" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function handleImageRequest(request, event) {
  // console.log("[SW] handleImageRequest:", request.url);
  const cache = await caches.open(IMAGE_CACHE);

  // Create a clean URL without query params for caching
  const url = new URL(request.url);
  const isMangaDex = url.hostname.includes("mangadex.org");
  const cleanUrl = isMangaDex ? `${url.origin}${url.pathname}` : request.url;
  const cacheKey = new Request(cleanUrl);
  // console.log("[SW] Image cache key:", cleanUrl, "isMangaDex:", isMangaDex);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    // console.log("[SW] Image cache hit:", cleanUrl);
    return cachedResponse;
  }
  // console.log("[SW] Image cache miss:", cleanUrl);

  try {
    // For MangaDex: use no-referrer to bypass hotlink protection
    // For other images: use the original request
    const fetchOptions = isMangaDex
      ? {
          method: request.method,
          headers: request.headers,
          mode: "cors",
          credentials: "omit",
          referrer: "",
          referrerPolicy: "no-referrer",
        }
      : {
          method: request.method,
          headers: request.headers,
          mode: "cors",
          credentials: "omit",
        };

    const modifiedRequest = new Request(request.url, fetchOptions);

    const networkResponse = await fetch(modifiedRequest);
    if (networkResponse.ok) {
      await enforceCacheSizeLimit(cache);
      // Cache using the clean URL (without query params)
      cache.put(cacheKey, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // console.log("[SW] Image not cached:", request.url);
    return new Response("", { status: 404 });
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
    // console.log("[SW] Evicted oldest image from cache");
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-reading-progress") {
    event.waitUntil(syncReadingProgress());
  }
});

async function syncReadingProgress() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => {
    client.postMessage({ type: "SYNC_READING_PROGRESS" });
  });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
