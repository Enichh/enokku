import {
  getCacheStats,
  clearAppCache,
  checkForVersionUpdate,
  getDeferredInstallPrompt,
} from "./pwa.js";
import {
  getAllOfflineChapters,
  removeOfflineChapter,
  estimateStorageUsage,
  formatBytes,
  registerBackgroundSync,
} from "./offline-manager.js";
import { clearAllOfflineData } from "./db.js";
import { triggerInstall } from "./pwa.js";

const SETTINGS_DEFAULTS = {
  readingDirection: "rtl",
  imageQuality: "auto",
  preloadNextChapter: true,
  backgroundSync: true,
  readerBackground: "#0a0a0a",
  fontSize: "medium",
  hapticFeedback: true,
  cacheSizeLimit: 100,
};

let currentSettings = loadSettings();

function initSettings() {
  setupEventListeners();
  loadSettingsUI();
  updateCacheStats();
  setupBottomNav();

  // Register background sync if enabled
  if (currentSettings.backgroundSync) {
    registerBackgroundSync("sync-reading-progress").catch(console.warn);
  }
}

function loadSettings() {
  const stored = localStorage.getItem("enokku_settings");
  if (stored) {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(stored) };
  }
  return { ...SETTINGS_DEFAULTS };
}

function saveSettings() {
  localStorage.setItem("enokku_settings", JSON.stringify(currentSettings));
}

function setupEventListeners() {
  const readingDirection = document.getElementById("readingDirection");
  if (readingDirection) {
    readingDirection.value = currentSettings.readingDirection;
    readingDirection.addEventListener("change", (e) => {
      currentSettings.readingDirection = e.target.value;
      saveSettings();
      showSettingSaved("Reading direction updated");
    });
  }

  const imageQuality = document.getElementById("imageQuality");
  if (imageQuality) {
    imageQuality.value = currentSettings.imageQuality;
    imageQuality.addEventListener("change", (e) => {
      currentSettings.imageQuality = e.target.value;
      saveSettings();
      showSettingSaved("Image quality updated");
    });
  }

  const preloadNextChapter = document.getElementById("preloadNextChapter");
  if (preloadNextChapter) {
    preloadNextChapter.checked = currentSettings.preloadNextChapter;
    preloadNextChapter.addEventListener("change", (e) => {
      currentSettings.preloadNextChapter = e.target.checked;
      saveSettings();
      showSettingSaved("Preload setting updated");
    });
  }

  const readerBackground = document.getElementById("readerBackground");
  if (readerBackground) {
    readerBackground.value = currentSettings.readerBackground;
    readerBackground.addEventListener("change", (e) => {
      currentSettings.readerBackground = e.target.value;
      saveSettings();
      showSettingSaved("Reader background updated");
    });
  }

  const fontSize = document.getElementById("fontSize");
  if (fontSize) {
    fontSize.value = currentSettings.fontSize;
    fontSize.addEventListener("change", (e) => {
      currentSettings.fontSize = e.target.value;
      saveSettings();
      showSettingSaved("Font size updated");
    });
  }

  const hapticFeedback = document.getElementById("hapticFeedback");
  if (hapticFeedback) {
    hapticFeedback.checked = currentSettings.hapticFeedback;
    hapticFeedback.addEventListener("change", (e) => {
      currentSettings.hapticFeedback = e.target.checked;
      saveSettings();
      showSettingSaved("Haptic feedback updated");
    });
  }

  const backgroundSync = document.getElementById("backgroundSync");
  if (backgroundSync) {
    backgroundSync.checked = currentSettings.backgroundSync;
    backgroundSync.addEventListener("change", async (e) => {
      currentSettings.backgroundSync = e.target.checked;
      saveSettings();

      if (e.target.checked) {
        // Register background sync when enabled
        const success = await registerBackgroundSync("sync-reading-progress");
        if (success) {
          showSettingSaved("Background sync enabled");
        } else {
          showSettingSaved("Background sync not supported");
        }
      } else {
        showSettingSaved("Background sync disabled");
      }
    });
  }

  const cacheSizeLimit = document.getElementById("cacheSizeLimit");
  const cacheSizeValue = document.getElementById("cacheSizeValue");
  if (cacheSizeLimit && cacheSizeValue) {
    cacheSizeLimit.value = currentSettings.cacheSizeLimit;
    cacheSizeValue.textContent = `${currentSettings.cacheSizeLimit} MB`;
    cacheSizeLimit.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      cacheSizeValue.textContent = `${value} MB`;
      currentSettings.cacheSizeLimit = value;
      saveSettings();
    });
  }

  const clearCacheBtn = document.getElementById("clearCacheBtn");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", handleClearCache);
  }

  const exportDataBtn = document.getElementById("exportDataBtn");
  if (exportDataBtn) {
    exportDataBtn.addEventListener("click", exportUserData);
  }

  const importDataBtn = document.getElementById("importDataBtn");
  if (importDataBtn) {
    importDataBtn.addEventListener("click", () => {
      document.getElementById("importFileInput").click();
    });
  }

  const importFileInput = document.getElementById("importFileInput");
  if (importFileInput) {
    importFileInput.addEventListener("change", handleImportData);
  }

  // Offline management event handlers
  const manageOfflineBtn = document.getElementById("manageOfflineBtn");
  if (manageOfflineBtn) {
    manageOfflineBtn.addEventListener("click", toggleOfflineChaptersSection);
  }

  const clearAllOfflineBtn = document.getElementById("clearAllOfflineBtn");
  if (clearAllOfflineBtn) {
    clearAllOfflineBtn.addEventListener("click", handleClearAllOffline);
  }

  const installBtn = document.getElementById("installBtn");
  if (installBtn) {
    installBtn.addEventListener("click", triggerInstall);
  }
}

async function loadSettingsUI() {
  const versionElement = document.getElementById("appVersion");
  if (versionElement) {
    try {
      const response = await fetch("version.json");
      const versionData = await response.json();
      versionElement.textContent = versionData.version || "1.0.0";
    } catch (error) {
      console.error("[Settings] Failed to load version:", error);
      versionElement.textContent = "1.0.0";
    }
  }

  const swStatus = document.getElementById("swStatus");
  if (swStatus) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(() => {
          swStatus.innerHTML = '<span class="status-dot active"></span> Active';
        })
        .catch(() => {
          swStatus.innerHTML = '<span class="status-dot"></span> Inactive';
        });
    } else {
      swStatus.innerHTML = '<span class="status-dot"></span> Not Supported';
    }
  }

  // Setup install button state
  updateInstallButtonState();
}

function updateInstallButtonState() {
  const installBtn = document.getElementById("installBtn");
  if (!installBtn) return;

  // Check if app is already installed
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isInstalled = localStorage.getItem("enokku_installed") === "true";

  if (isStandalone || isInstalled) {
    installBtn.textContent = "Already Installed";
    installBtn.disabled = true;
    installBtn.innerHTML = "Already Installed";
  } else {
    // Check if install prompt is available
    setTimeout(() => {
      if (getDeferredInstallPrompt()) {
        installBtn.disabled = false;
      } else {
        installBtn.textContent = "Install Unavailable";
        installBtn.disabled = true;
        installBtn.innerHTML = "<span>Install Unavailable";
      }
    }, 2000); // Wait a bit for install prompt to be captured
  }
}

async function updateCacheStats() {
  const usageElement = document.getElementById("storageUsage");

  try {
    // Get accurate offline storage usage from image cache
    const offlineStorage = await estimateStorageUsage();
    const offlineUsageMB = (offlineStorage.usage / 1024 / 1024).toFixed(1);

    // Get total storage quota from browser
    const totalStats = await getCacheStats();
    const quotaMB = (totalStats.quota / 1024 / 1024).toFixed(0);

    if (usageElement) {
      usageElement.textContent = `${offlineUsageMB} MB / ${quotaMB} MB (${offlineStorage.percentage}%)`;
    }
  } catch (error) {
    console.error("[Settings] Failed to get cache stats:", error);
    if (usageElement) usageElement.textContent = "Unable to calculate";
  }
}

async function handleClearCache() {
  if (
    !confirm(
      "Clear all cached data? This will remove offline content but keep your settings and reading history.",
    )
  ) {
    return;
  }

  try {
    await clearAppCache();
    await updateCacheStats();
    showSettingSaved("Cache cleared successfully");
  } catch (error) {
    console.error("[Settings] Failed to clear cache:", error);
    alert("Failed to clear cache. Please try again.");
  }
}

function showSettingSaved(message) {
  const toast = document.createElement("div");
  toast.className = "settings-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function exportUserData() {
  // Warn about offline content not being backed up
  const includeOffline = confirm(
    "Note: Downloaded chapters and images will NOT be included in the backup due to their large size. Only your settings, reading history, favorites, and bookmarks will be exported.\n\nDo you want to continue?",
  );

  if (!includeOffline) {
    return;
  }

  const data = {
    version: 1,
    exportedAt: Date.now(),
    settings: currentSettings,
    readingHistory: JSON.parse(
      localStorage.getItem("enokku_reading_history_v2") || "[]",
    ),
    favorites: JSON.parse(localStorage.getItem("enokku_favorites") || "[]"),
    bookmarks: JSON.parse(localStorage.getItem("enokku_bookmarks") || "[]"),
    note: "Downloaded chapters and images are not included in this backup",
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enokku-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showSettingSaved("Data exported successfully");
}

function handleImportData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (
        !data.version ||
        !confirm("Import will overwrite current data. Continue?")
      ) {
        return;
      }

      if (data.settings) {
        currentSettings = { ...SETTINGS_DEFAULTS, ...data.settings };
        saveSettings();
      }

      if (data.readingHistory) {
        localStorage.setItem(
          "enokku_reading_history_v2",
          JSON.stringify(data.readingHistory),
        );
      }

      if (data.favorites) {
        localStorage.setItem(
          "enokku_favorites",
          JSON.stringify(data.favorites),
        );
      }

      if (data.bookmarks) {
        localStorage.setItem(
          "enokku_bookmarks",
          JSON.stringify(data.bookmarks),
        );
      }

      showSettingSaved("Data imported successfully");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("[Settings] Import failed:", error);
      alert("Failed to import data. Please check the file format.");
    }
  };
  reader.readAsText(file);

  event.target.value = "";
}

// ============================================
// MANUAL UPDATE CONTROLS
// ============================================

window.checkForUpdatesManual = async () => {
  const statusEl = document.getElementById("updateStatus");
  if (!statusEl) return;

  statusEl.innerHTML =
    '<span class="update-checking">Checking for updates...</span>';

  try {
    await checkForVersionUpdate();

    // Check if we got an update notification
    const hasNotification = document.querySelector(".update-notification");
    if (!hasNotification) {
      statusEl.innerHTML =
        '<span class="update-current">App is up to date</span>';

      // Clear status after 3 seconds
      setTimeout(() => {
        statusEl.innerHTML = "";
      }, 3000);
    } else {
      statusEl.innerHTML =
        '<span class="update-available">Update available! Click "Update Now" above.</span>';
    }
  } catch (error) {
    console.error("Manual update check failed:", error);
    statusEl.innerHTML =
      '<span class="update-error">Check failed. Try again.</span>';

    setTimeout(() => {
      statusEl.innerHTML = "";
    }, 3000);
  }
};

// Clear cache only (preserve service worker)
window.clearAppCache = async () => {
  const statusEl = document.getElementById("updateStatus");
  if (!statusEl) return;

  statusEl.innerHTML = '<span class="update-checking">Clearing cache...</span>';

  try {
    await clearAppCache();

    statusEl.innerHTML = '<span class="update-success">Cache cleared!</span>';

    // Update cache stats
    setTimeout(() => {
      updateCacheStats();
    }, 1000);
  } catch (error) {
    console.error("Cache clear failed:", error);
    statusEl.innerHTML =
      '<span class="update-error">Clear failed. Try manually clearing browser cache.</span>';
  }
};

// Reset app (clear cache + unregister service worker + reload)
window.resetApp = async () => {
  const statusEl = document.getElementById("updateStatus");
  if (!statusEl) return;

  if (
    !confirm(
      "Reset app? This will clear all cached data, unregister the service worker, and reload the page. Your settings and reading history will be preserved.",
    )
  ) {
    return;
  }

  statusEl.innerHTML = '<span class="update-checking">Resetting app...</span>';

  try {
    await clearAppCache();

    // Unregister service worker
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
    }

    statusEl.innerHTML =
      '<span class="update-success">App reset! Reloading...</span>';

    // Reload after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error("App reset failed:", error);
    statusEl.innerHTML =
      '<span class="update-error">Reset failed. Try manually clearing browser cache.</span>';
  }
};

function setupBottomNav() {
  const currentPage =
    window.location.pathname.split("/").pop().replace(".html", "") || "index";
  const navItems = document.querySelectorAll(".bottom-nav-item");

  navItems.forEach((item) => {
    const page = item.dataset.page;
    if (page === "settings") {
      item.classList.add("active");
    }
  });
}

function getSetting(key) {
  return currentSettings[key] ?? SETTINGS_DEFAULTS[key];
}

function setSetting(key, value) {
  currentSettings[key] = value;
  saveSettings();
}

// Offline Management Functions
function toggleOfflineChaptersSection() {
  const section = document.getElementById("offlineChaptersSection");
  const btn = document.getElementById("manageOfflineBtn");

  if (section.style.display === "none") {
    section.style.display = "block";
    btn.innerHTML = "<span>Hide Chapters</span> Manage";
    loadOfflineChapters();
  } else {
    section.style.display = "none";
    btn.innerHTML = "<span>Downloaded Chapters</span> Manage";
  }
}

async function loadOfflineChapters() {
  const listContainer = document.getElementById("offlineChaptersList");

  try {
    const chapters = await getAllOfflineChapters();

    if (chapters.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No downloaded chapters found.</p>
          <p>Chapters you read will be automatically cached for offline reading.</p>
        </div>
      `;
      return;
    }

    // Group chapters by manga
    const chaptersByManga = {};
    chapters.forEach((chapter) => {
      if (!chaptersByManga[chapter.mangaId]) {
        chaptersByManga[chapter.mangaId] = [];
      }
      chaptersByManga[chapter.mangaId].push(chapter);
    });

    let html = "";
    for (const [mangaId, mangaChapters] of Object.entries(chaptersByManga)) {
      html += `
        <div class="offline-manga-group">
          <h4 class="offline-manga-title">Manga ${mangaId.slice(0, 8)}...</h4>
          <div class="offline-chapter-items">
      `;

      mangaChapters.forEach((chapter) => {
        const cachedAt = new Date(chapter.cachedAt).toLocaleDateString();
        const size = formatBytes(chapter.pageCount * 500 * 1024); // Estimate 500KB per page

        html += `
          <div class="offline-chapter-item">
            <div class="offline-chapter-info">
              <div class="offline-chapter-title">
                Chapter ${chapter.chapterNumber || "?"}
                ${chapter.chapterTitle ? ` - ${chapter.chapterTitle}` : ""}
              </div>
              <div class="offline-chapter-meta">
                Cached: ${cachedAt} | Est. ${size}
              </div>
            </div>
            <button class="btn-remove-chapter" data-chapter-id="${chapter.chapterId}">
              Remove
            </button>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    listContainer.innerHTML = html;

    // Add event listeners to remove buttons
    listContainer.querySelectorAll(".btn-remove-chapter").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const chapterId = e.target.dataset.chapterId;
        if (confirm("Remove this chapter from offline storage?")) {
          await removeOfflineChapter(chapterId);
          loadOfflineChapters(); // Refresh the list
          updateCacheStats(); // Update storage usage
          showSettingSaved("Chapter removed from offline storage");
        }
      });
    });
  } catch (error) {
    console.error("[Settings] Failed to load offline chapters:", error);
    listContainer.innerHTML = `
      <div class="error-state">
        <p>Failed to load downloaded chapters.</p>
      </div>
    `;
  }
}

async function handleClearAllOffline() {
  if (
    !confirm(
      "Remove all downloaded chapters? This will free up storage space but you'll need an internet connection to read these chapters again.",
    )
  ) {
    return;
  }

  try {
    // Clear IndexedDB data
    await clearAllOfflineData();

    // Also clear the image cache to remove orphaned images
    if ("caches" in window) {
      await caches.delete("enokku-images");
    }

    loadOfflineChapters(); // Refresh the list
    updateCacheStats(); // Update storage usage
    showSettingSaved("All offline chapters and images removed");
  } catch (error) {
    console.error("[Settings] Failed to clear offline data:", error);
    alert("Failed to clear offline chapters. Please try again.");
  }
}

window.handleClearCache = handleClearCache;
window.exportUserData = exportUserData;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}

export { getSetting, setSetting, SETTINGS_DEFAULTS, exportUserData };
