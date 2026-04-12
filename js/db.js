const DB_NAME = "enokku-offline-v1";
const DB_VERSION = 1;

const STORES = {
  offlineChapters: "offlineChapters",
  mangaMetadata: "mangaMetadata",
  readingQueue: "readingQueue",
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.offlineChapters)) {
        const chapterStore = db.createObjectStore(STORES.offlineChapters, {
          keyPath: "chapterId",
        });
        chapterStore.createIndex("mangaId", "mangaId", { unique: false });
        chapterStore.createIndex("cachedAt", "cachedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.mangaMetadata)) {
        const mangaStore = db.createObjectStore(STORES.mangaMetadata, {
          keyPath: "mangaId",
        });
        mangaStore.createIndex("cachedAt", "cachedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.readingQueue)) {
        const queueStore = db.createObjectStore(STORES.readingQueue, {
          keyPath: "id",
          autoIncrement: true,
        });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });

  return dbPromise;
}

async function addOfflineChapter(chapterData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.offlineChapters], "readwrite");
    const store = transaction.objectStore(STORES.offlineChapters);

    const data = {
      ...chapterData,
      cachedAt: Date.now(),
    };

    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOfflineChapter(chapterId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.offlineChapters], "readonly");
    const store = transaction.objectStore(STORES.offlineChapters);
    const request = store.get(chapterId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteOfflineChapter(chapterId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.offlineChapters], "readwrite");
    const store = transaction.objectStore(STORES.offlineChapters);
    const request = store.delete(chapterId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getOfflineChaptersByManga(mangaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.offlineChapters], "readonly");
    const store = transaction.objectStore(STORES.offlineChapters);
    const index = store.index("mangaId");
    const request = index.getAll(mangaId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getAllOfflineChapters() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.offlineChapters], "readonly");
    const store = transaction.objectStore(STORES.offlineChapters);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function addMangaMetadata(metadata) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.mangaMetadata], "readwrite");
    const store = transaction.objectStore(STORES.mangaMetadata);

    const data = {
      ...metadata,
      cachedAt: Date.now(),
    };

    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getMangaMetadata(mangaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.mangaMetadata], "readonly");
    const store = transaction.objectStore(STORES.mangaMetadata);
    const request = store.get(mangaId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteMangaMetadata(mangaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.mangaMetadata], "readwrite");
    const store = transaction.objectStore(STORES.mangaMetadata);
    const request = store.delete(mangaId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function addToReadingQueue(queueItem) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.readingQueue], "readwrite");
    const store = transaction.objectStore(STORES.readingQueue);

    const data = {
      ...queueItem,
      timestamp: Date.now(),
      status: "pending",
    };

    const request = store.add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getPendingReadingQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.readingQueue], "readonly");
    const store = transaction.objectStore(STORES.readingQueue);
    const index = store.index("status");
    const request = index.getAll("pending");

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function updateQueueItemStatus(id, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.readingQueue], "readwrite");
    const store = transaction.objectStore(STORES.readingQueue);

    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const data = getRequest.result;
      if (data) {
        data.status = status;
        const putRequest = store.put(data);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function deleteQueueItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.readingQueue], "readwrite");
    const store = transaction.objectStore(STORES.readingQueue);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearAllOfflineData() {
  const db = await openDB();

  const stores = [STORES.offlineChapters, STORES.mangaMetadata, STORES.readingQueue];

  for (const storeName of stores) {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export {
  openDB,
  addOfflineChapter,
  getOfflineChapter,
  deleteOfflineChapter,
  getOfflineChaptersByManga,
  getAllOfflineChapters,
  addMangaMetadata,
  getMangaMetadata,
  deleteMangaMetadata,
  addToReadingQueue,
  getPendingReadingQueue,
  updateQueueItemStatus,
  deleteQueueItem,
  clearAllOfflineData,
  STORES,
};
