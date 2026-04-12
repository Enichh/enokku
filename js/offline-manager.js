import {
  addOfflineChapter,
  getOfflineChapter,
  deleteOfflineChapter,
  getOfflineChaptersByManga,
  getAllOfflineChapters,
  addMangaMetadata,
  getMangaMetadata,
} from "./db.js";

const PRELOAD_CONCURRENCY = 3;
const MAX_CACHED_CHAPTERS = 10;

// Cache name - must match service worker
const IMAGE_CACHE_NAME = "enokku-images";

function isOnline() {
  return navigator.onLine;
}

function showOfflineIndicator(message = "Reading offline") {
  const existing = document.querySelector(".offline-reading-indicator");
  if (existing) return;

  const indicator = document.createElement("div");
  indicator.className = "offline-reading-indicator";
  indicator.innerHTML = `
    <span class="offline-icon">📴</span>
    <span class="offline-text">${message}</span>
  `;

  document.body.appendChild(indicator);

  requestAnimationFrame(() => {
    indicator.classList.add("visible");
  });
}

function hideOfflineIndicator() {
  const indicator = document.querySelector(".offline-reading-indicator");
  if (indicator) {
    indicator.classList.remove("visible");
    setTimeout(() => indicator.remove(), 300);
  }
}

function showPreloadingIndicator(chapterNumber) {
  const existing = document.querySelector(".preloading-indicator");
  if (existing) existing.remove();

  const indicator = document.createElement("div");
  indicator.className = "preloading-indicator";
  indicator.innerHTML = `
    <span class="preload-icon">⬇️</span>
    <span class="preload-text">Downloading Chapter ${chapterNumber}...</span>
  `;

  document.body.appendChild(indicator);

  requestAnimationFrame(() => {
    indicator.classList.add("visible");
  });

  return indicator;
}

function hidePreloadingIndicator() {
  const indicator = document.querySelector(".preloading-indicator");
  if (indicator) {
    indicator.classList.remove("visible");
    setTimeout(() => indicator.remove(), 300);
  }
}

async function preloadImage(url) {
  try {
    // Open the image cache
    const cache = await caches.open(IMAGE_CACHE_NAME);

    // Check if already cached
    const cached = await cache.match(url);
    if (cached) {
      return true;
    }

    // Fetch and cache the image using no-cors for MangaDex
    const response = await fetch(url, {
      mode: "no-cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });

    // Accept both successful and opaque responses
    if (response.ok || response.type === "opaque") {
      await cache.put(url, response);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[OfflineManager] Failed to preload: ${url}`, error);
    return false;
  }
}

async function preloadChapter(chapterId, mangaId, imageUrls, metadata = {}) {
  if (!isOnline()) {
    console.log("[OfflineManager] Cannot preload while offline");
    return false;
  }

  const existing = await getOfflineChapter(chapterId);
  if (existing) {
    console.log(`[OfflineManager] Chapter ${chapterId} already cached`);
    return true;
  }

  const chapterNum = metadata.chapterNumber || "?";
  const indicator = showPreloadingIndicator(chapterNum);

  try {
    console.log(
      `[OfflineManager] Preloading ${imageUrls.length} images for chapter ${chapterId}`,
    );

    const results = await preloadImagesConcurrently(imageUrls);
    const successCount = results.filter((r) => r.success).length;

    console.log(
      `[OfflineManager] Preloaded ${successCount}/${imageUrls.length} images`,
    );

    if (successCount > 0) {
      await addOfflineChapter({
        chapterId,
        mangaId,
        pageCount: imageUrls.length,
        imageUrls,
        cachedAt: Date.now(),
        chapterNumber: metadata.chapterNumber,
        chapterTitle: metadata.chapterTitle,
      });

      hidePreloadingIndicator();
      return true;
    }

    hidePreloadingIndicator();
    return false;
  } catch (error) {
    console.error(
      `[OfflineManager] Failed to preload chapter ${chapterId}:`,
      error,
    );
    hidePreloadingIndicator();
    return false;
  }
}

async function preloadImagesConcurrently(urls) {
  const results = [];
  const queue = [...urls];

  async function processNext() {
    while (queue.length > 0) {
      const url = queue.shift();
      const success = await preloadImage(url);
      results.push({ url, success });
    }
  }

  const workers = Array(PRELOAD_CONCURRENCY).fill(null).map(processNext);
  await Promise.all(workers);

  return results;
}

async function isChapterCached(chapterId) {
  const chapter = await getOfflineChapter(chapterId);
  if (!chapter) return false;

  const cache = await caches.open(IMAGE_CACHE_NAME);
  let cachedCount = 0;

  for (const url of chapter.imageUrls || []) {
    const cached = await cache.match(url);
    if (cached) cachedCount++;
  }

  const isAvailable = cachedCount > 0;
  console.log(
    `[OfflineManager] Chapter ${chapterId}: ${cachedCount}/${chapter.pageCount} pages cached`,
  );

  return isAvailable;
}

async function getOfflineChaptersForManga(mangaId) {
  return await getOfflineChaptersByManga(mangaId);
}

async function removeOfflineChapter(chapterId) {
  const chapter = await getOfflineChapter(chapterId);
  if (!chapter) return;

  const imageCache = await caches.open(IMAGE_CACHE_NAME);

  for (const url of chapter.imageUrls || []) {
    await imageCache.delete(url);
  }

  await deleteOfflineChapter(chapterId);
  console.log(
    `[OfflineManager] Removed chapter ${chapterId} from offline storage`,
  );
}

async function preloadNextChapter(
  currentChapterId,
  mangaId,
  allChapters,
  currentIndex,
) {
  if (!isOnline()) return;
  if (currentIndex >= allChapters.length - 1) return;

  const offlineCount = await getOfflineChapterCount();
  if (offlineCount >= MAX_CACHED_CHAPTERS) {
    await cleanupOldestChapters(offlineCount - MAX_CACHED_CHAPTERS + 1);
  }

  const nextChapter = allChapters[currentIndex + 1];
  if (!nextChapter) return;

  const isCached = await isChapterCached(nextChapter.id);
  if (isCached) return;

  console.log(
    `[OfflineManager] Auto-preloading next chapter: ${nextChapter.id}`,
  );

  const chapterData = {
    source: nextChapter.source || "mangadex",
    mangadexId:
      nextChapter.source === "mangadex"
        ? nextChapter.mangadexId || nextChapter.id
        : null,
    mangaId: nextChapter.atsumaruMangaId,
    chapterId:
      nextChapter.source === "atsumaru"
        ? nextChapter.chapterId || nextChapter.id.replace("atsu-", "")
        : null,
  };

  try {
    const { getChapterPagesHybrid } = await import("./hybrid-api.js");
    const pageUrls = await getChapterPagesHybrid(chapterData);

    if (pageUrls && pageUrls.length > 0) {
      const processedUrls =
        nextChapter.source === "atsumaru"
          ? pageUrls.map(
              (url) => `/api/proxy?imageUrl=${encodeURIComponent(url)}`,
            )
          : pageUrls;

      await preloadChapter(nextChapter.id, mangaId, processedUrls, {
        chapterNumber: nextChapter.chapter || nextChapter.attributes?.chapter,
        chapterTitle: nextChapter.title || nextChapter.attributes?.title,
      });
    }
  } catch (error) {
    console.error("[OfflineManager] Failed to preload next chapter:", error);
  }
}

async function getOfflineChapterCount() {
  const chapters = await getAllOfflineChapters();
  return chapters.length;
}

async function cleanupOldestChapters(count) {
  const chapters = await getAllOfflineChapters();
  chapters.sort((a, b) => a.cachedAt - b.cachedAt);

  const toRemove = chapters.slice(0, count);
  for (const chapter of toRemove) {
    await removeOfflineChapter(chapter.chapterId);
  }

  console.log(`[OfflineManager] Cleaned up ${toRemove.length} oldest chapters`);
}

async function cacheMangaMetadata(mangaId, metadata) {
  await addMangaMetadata({
    mangaId,
    title: metadata.title,
    coverUrl: metadata.coverUrl,
    description: metadata.description,
    chapterList: metadata.chapterList,
    cachedAt: Date.now(),
  });
}

async function getCachedMangaMetadata(mangaId) {
  return await getMangaMetadata(mangaId);
}

async function estimateStorageUsage() {
  if ("storage" in navigator && "estimate" in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentage: estimate.quota
        ? Math.round((estimate.usage / estimate.quota) * 100)
        : 0,
    };
  }

  const imageCache = await caches.open(IMAGE_CACHE_NAME);
  const keys = await imageCache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const response = await imageCache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return {
    usage: totalSize,
    quota: 50 * 1024 * 1024,
    percentage: Math.round((totalSize / (50 * 1024 * 1024)) * 100),
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function registerBackgroundSync(tag) {
  if (
    "serviceWorker" in navigator &&
    "sync" in window.ServiceWorkerRegistration.prototype
  ) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(tag);
      console.log(`[OfflineManager] Background sync registered: ${tag}`);
      return true;
    } catch (error) {
      console.error(
        `[OfflineManager] Failed to register background sync ${tag}:`,
        error,
      );
      return false;
    }
  } else {
    console.log("[OfflineManager] Background sync not supported");
    return false;
  }
}

async function registerSyncViaServiceWorker(tag) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    return new Promise((resolve) => {
      const handleMessage = (event) => {
        if (event.data.type === "SYNC_REGISTERED" && event.data.tag === tag) {
          navigator.serviceWorker.removeEventListener("message", handleMessage);
          resolve(event.data.success);
        }
      };

      navigator.serviceWorker.addEventListener("message", handleMessage);

      // Send registration request to service worker
      navigator.serviceWorker.controller.postMessage({
        type: "REGISTER_SYNC",
        tag: tag,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener("message", handleMessage);
        resolve(false);
      }, 5000);
    });
  } else {
    console.log("[OfflineManager] Service worker not active");
    return false;
  }
}

export {
  isOnline,
  showOfflineIndicator,
  hideOfflineIndicator,
  preloadChapter,
  isChapterCached,
  getOfflineChaptersForManga,
  removeOfflineChapter,
  preloadNextChapter,
  getOfflineChapterCount,
  getAllOfflineChapters,
  cacheMangaMetadata,
  getCachedMangaMetadata,
  estimateStorageUsage,
  formatBytes,
  registerBackgroundSync,
  registerSyncViaServiceWorker,
  MAX_CACHED_CHAPTERS,
  IMAGE_CACHE_NAME,
};
