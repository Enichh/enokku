import { getReadingHistory, clearHistory } from "./reading-history.js";

const LIBRARY_STATE = {
  activeTab: "continue",
  favorites: JSON.parse(localStorage.getItem("enokku_favorites") || "[]"),
  bookmarks: JSON.parse(localStorage.getItem("enokku_bookmarks") || "[]"),
};

function initLibrary() {
  setupEventListeners();
  loadActiveTab();
  setupBottomNav();
}

function setupEventListeners() {
  const tabButtons = document.querySelectorAll(".library-tab");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      switchTab(tab);
    });
  });

  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", handleClearHistory);
  }
}

function switchTab(tab) {
  LIBRARY_STATE.activeTab = tab;

  document.querySelectorAll(".library-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".library-content").forEach((content) => {
    content.classList.toggle("active", content.dataset.content === tab);
  });

  loadTabContent(tab);
}

function loadActiveTab() {
  loadTabContent(LIBRARY_STATE.activeTab);
}

async function loadTabContent(tab) {
  switch (tab) {
    case "continue":
      await loadContinueReading();
      break;
    case "recent":
      await loadRecentHistory();
      break;
    case "favorites":
      loadFavorites();
      break;
    case "bookmarks":
      loadBookmarks();
      break;
  }
}

async function loadContinueReading() {
  const container = document.getElementById("continueReadingGrid");
  if (!container) return;

  try {
    const readingList = getReadingHistory();

    if (readingList.length === 0) {
      container.innerHTML = `
        <div class="library-empty">
          <div class="library-empty-icon"></div>
          <h3>No Reading History</h3>
          <p>Start reading manga to see your progress here</p>
          <a href="index.html" class="btn-primary">Browse Manga</a>
        </div>
      `;
      return;
    }

    container.innerHTML = readingList
      .map(
        (item) => `
      <div class="library-card" data-manga-id="${item.mangaId}" data-chapter-id="${item.chapterId}">
        <a href="reader.html?id=${item.chapterId}&manga=${item.mangaId}&source=${item.source || "mangadex"}" class="library-card-link">
          <div class="library-card-cover">
            <img src="${item.coverUrl || "assets/favicon.svg"}" alt="${item.mangaTitle}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
            ${
              item.scrollPercent > 0
                ? `
              <div class="library-card-progress">
                <div class="library-card-progress-bar" style="width: ${item.scrollPercent}%"></div>
              </div>
            `
                : ""
            }
          </div>
          <div class="library-card-info">
            <h4 class="library-card-title">${item.mangaTitle || "Unknown Manga"}</h4>
            <p class="library-card-chapter">Chapter ${item.chapterNumber || "?"}</p>
            <p class="library-card-meta">
              <span>${item.scrollPercent || 0}% read</span>
              <span>• ${formatRelativeTime(item.lastReadAt)}</span>
            </p>
          </div>
        </a>
        <button class="library-card-menu" onclick="showCardMenu('${item.mangaId}', '${item.chapterId}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>
      </div>
    `,
      )
      .join("");

    const clearBtn = document.getElementById("clearHistoryBtn");
    if (clearBtn) {
      clearBtn.style.display = readingList.length > 0 ? "flex" : "none";
    }
  } catch (error) {
    console.error("[Library] Failed to load continue reading:", error);
    container.innerHTML = `
      <div class="library-error">
        <p>Failed to load reading history</p>
        <button onclick="loadContinueReading()" class="btn-secondary">Retry</button>
      </div>
    `;
  }
}

async function loadRecentHistory() {
  const container = document.getElementById("recentHistoryGrid");
  if (!container) return;

  try {
    const readingList = getReadingHistory();

    if (readingList.length === 0) {
      container.innerHTML = `
        <div class="library-empty">
          <div class="library-empty-icon"></div>
          <h3>No Recent History</h3>
          <p>Your recently read manga will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = readingList
      .slice(0, 20)
      .map(
        (item) => `
      <div class="library-card compact">
        <a href="manga.html?id=${item.mangaId}" class="library-card-link">
          <div class="library-card-cover">
            <img src="${item.coverUrl || "assets/favicon.svg"}" alt="${item.mangaTitle}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
          </div>
          <div class="library-card-info">
            <h4 class="library-card-title">${item.mangaTitle || "Unknown Manga"}</h4>
            <p class="library-card-chapter">Chapter ${item.chapterNumber || "?"}</p>
            <p class="library-card-meta">${formatRelativeTime(item.lastReadAt)}</p>
          </div>
        </a>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("[Library] Failed to load recent history:", error);
    container.innerHTML = `<div class="library-error"><p>Failed to load recent history</p></div>`;
  }
}

function loadFavorites() {
  const container = document.getElementById("favoritesGrid");
  if (!container) return;

  const favorites = LIBRARY_STATE.favorites;

  if (favorites.length === 0) {
    container.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">⭐</div>
        <h3>No Favorites Yet</h3>
        <p>Mark manga as favorites to see them here</p>
        <a href="search.html" class="btn-primary">Discover Manga</a>
      </div>
    `;
    return;
  }

  container.innerHTML = favorites
    .map(
      (item) => `
    <div class="library-card" data-manga-id="${item.mangaId}">
      <a href="manga.html?id=${item.mangaId}" class="library-card-link">
        <div class="library-card-cover">
          <img src="${item.coverUrl || "assets/favicon.svg"}" alt="${item.title}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
          <button class="library-card-favorite active" onclick="removeFavorite('${item.mangaId}', event)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <div class="library-card-info">
          <h4 class="library-card-title">${item.title || "Unknown Manga"}</h4>
          <p class="library-card-meta">Added ${formatRelativeTime(item.addedAt)}</p>
        </div>
      </a>
    </div>
  `,
    )
    .join("");
}

function loadBookmarks() {
  const container = document.getElementById("bookmarksGrid");
  if (!container) return;

  const bookmarks = LIBRARY_STATE.bookmarks;

  if (bookmarks.length === 0) {
    container.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon"></div>
        <h3>No Bookmarks</h3>
        <p>Bookmark specific pages while reading to see them here</p>
      </div>
    `;
    return;
  }

  container.innerHTML = bookmarks
    .map(
      (item) => `
    <div class="library-card compact" data-bookmark-id="${item.id}">
      <a href="reader.html?chapter=${item.chapterId}&manga=${item.mangaId}&page=${item.pageNumber}" class="library-card-link">
        <div class="library-card-cover">
          <img src="${item.coverUrl || "assets/favicon.svg"}" alt="${item.mangaTitle}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
          <div class="library-card-bookmark-indicator">
            <span>P. ${item.pageNumber}</span>
          </div>
        </div>
        <div class="library-card-info">
          <h4 class="library-card-title">${item.mangaTitle || "Unknown Manga"}</h4>
          <p class="library-card-chapter">Chapter ${item.chapterNumber || "?"}</p>
          <p class="library-card-meta">${formatRelativeTime(item.createdAt)}</p>
        </div>
      </a>
      <button class="library-card-remove" onclick="removeBookmark('${item.id}')">×</button>
    </div>
  `,
    )
    .join("");
}

async function handleClearHistory() {
  if (!confirm("Clear all reading history? This cannot be undone.")) return;

  try {
    clearHistory();
    loadContinueReading();
    loadRecentHistory();
  } catch (error) {
    console.error("[Library] Failed to clear history:", error);
    alert("Failed to clear history. Please try again.");
  }
}

function addToFavorites(mangaId, title, coverUrl) {
  const existing = LIBRARY_STATE.favorites.find((f) => f.mangaId === mangaId);
  if (existing) return;

  LIBRARY_STATE.favorites.push({
    mangaId,
    title,
    coverUrl,
    addedAt: Date.now(),
  });

  saveFavorites();
}

function removeFavorite(mangaId, event) {
  if (event) event.preventDefault();

  LIBRARY_STATE.favorites = LIBRARY_STATE.favorites.filter(
    (f) => f.mangaId !== mangaId,
  );
  saveFavorites();
  loadFavorites();
}

function saveFavorites() {
  localStorage.setItem(
    "enokku_favorites",
    JSON.stringify(LIBRARY_STATE.favorites),
  );
}

function addBookmark(
  mangaId,
  chapterId,
  chapterNumber,
  pageNumber,
  mangaTitle,
  coverUrl,
) {
  const bookmark = {
    id: `${mangaId}-${chapterId}-${pageNumber}-${Date.now()}`,
    mangaId,
    chapterId,
    chapterNumber,
    pageNumber,
    mangaTitle,
    coverUrl,
    createdAt: Date.now(),
  };

  LIBRARY_STATE.bookmarks.unshift(bookmark);

  if (LIBRARY_STATE.bookmarks.length > 50) {
    LIBRARY_STATE.bookmarks = LIBRARY_STATE.bookmarks.slice(0, 50);
  }

  saveBookmarks();
}

function removeBookmark(bookmarkId) {
  LIBRARY_STATE.bookmarks = LIBRARY_STATE.bookmarks.filter(
    (b) => b.id !== bookmarkId,
  );
  saveBookmarks();
  loadBookmarks();
}

function saveBookmarks() {
  localStorage.setItem(
    "enokku_bookmarks",
    JSON.stringify(LIBRARY_STATE.bookmarks),
  );
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Unknown";

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function setupBottomNav() {
  const currentPage =
    window.location.pathname.split("/").pop().replace(".html", "") || "index";
  const navItems = document.querySelectorAll(".bottom-nav-item");

  navItems.forEach((item) => {
    const page = item.dataset.page;
    if (page === currentPage || (currentPage === "index" && page === "home")) {
      item.classList.add("active");
    }
  });
}

function showCardMenu(mangaId, chapterId) {
  console.log("[Library] Show menu for", mangaId, chapterId);
}

window.switchTab = switchTab;
window.loadContinueReading = loadContinueReading;
window.handleClearHistory = handleClearHistory;
window.removeFavorite = removeFavorite;
window.removeBookmark = removeBookmark;
window.showCardMenu = showCardMenu;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLibrary);
} else {
  initLibrary();
}

export {
  addToFavorites,
  removeFavorite,
  addBookmark,
  removeBookmark,
  loadContinueReading,
};
