const STORAGE_KEY = "enokku_reading_history_v2";
const MAX_HISTORY_ITEMS = 20;
const UI_DISPLAY_LIMIT = 12;

function getReadingHistory(limit = UI_DISPLAY_LIMIT) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const history = JSON.parse(data);
    return history.sort((a, b) => b.lastReadAt - a.lastReadAt).slice(0, limit);
  } catch (error) {
    console.error("[ReadingHistory] Failed to load history:", error);
    return [];
  }
}

function saveReadingProgress(entry) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    let history = data ? JSON.parse(data) : [];

    const existingIndex = history.findIndex(
      (item) => item.mangaId === entry.mangaId,
    );

    const newEntry = {
      ...entry,
      source: entry.source || "mangadex",
      atsumaruMangaId: entry.atsumaruMangaId || null,
      lastReadAt: Date.now(),
    };

    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }

    history.unshift(newEntry);

    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      handleStorageFull(entry);
      return true;
    }
    console.error("[ReadingHistory] Failed to save progress:", error);
    return false;
  }
}

function handleStorageFull(newEntry) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;

    let history = JSON.parse(data);
    history.sort((a, b) => a.lastReadAt - b.lastReadAt);
    history.shift();

    const newEntryWithTimestamp = {
      ...newEntry,
      lastReadAt: Date.now(),
    };
    history.push(newEntryWithTimestamp);
    history.sort((a, b) => b.lastReadAt - a.lastReadAt);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("[ReadingHistory] Failed to handle storage full:", error);
  }
}

function removeFromHistory(mangaId) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return false;

    let history = JSON.parse(data);
    history = history.filter((item) => item.mangaId !== mangaId);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error("[ReadingHistory] Failed to remove entry:", error);
    return false;
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("[ReadingHistory] Failed to clear history:", error);
    return false;
  }
}

function getLastReadChapter(mangaId) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const history = JSON.parse(data);
    return history.find((item) => item.mangaId === mangaId) || null;
  } catch (error) {
    console.error("[ReadingHistory] Failed to get last read:", error);
    return null;
  }
}

export {
  getReadingHistory,
  saveReadingProgress,
  removeFromHistory,
  clearHistory,
  getLastReadChapter,
};
