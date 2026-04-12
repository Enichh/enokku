import { getCacheStats, clearAppCache, checkForVersionUpdate } from "./pwa.js";

const SETTINGS_DEFAULTS = {
  readingDirection: "rtl",
  imageQuality: "auto",
  preloadNextChapter: true,
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
}

function loadSettingsUI() {
  const versionElement = document.getElementById("appVersion");
  if (versionElement) {
    versionElement.textContent = "1.0.0";
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
    installBtn.textContent = "✓ Already Installed";
    installBtn.disabled = true;
    installBtn.innerHTML = "<span>✓</span> Already Installed";
  } else {
    // Check if install prompt is available
    setTimeout(() => {
      if (window.deferredInstallPrompt) {
        installBtn.disabled = false;
      } else {
        installBtn.textContent = "⏳ Install Unavailable";
        installBtn.disabled = true;
        installBtn.innerHTML = "<span>⏳</span> Install Unavailable";
      }
    }, 2000); // Wait a bit for install prompt to be captured
  }
}

async function updateCacheStats() {
  const usageElement = document.getElementById("storageUsage");
  const dataSavedElement = document.getElementById("dataSaved");

  try {
    const stats = await getCacheStats();

    if (usageElement) {
      const usageMB = (stats.usage / 1024 / 1024).toFixed(1);
      const quotaMB = (stats.quota / 1024 / 1024).toFixed(0);
      usageElement.textContent = `${usageMB} MB / ${quotaMB} MB (${stats.percentage}%)`;
    }

    if (dataSavedElement) {
      const saved = localStorage.getItem("enokku_data_saved") || "0";
      const savedMB = (parseInt(saved) / 1024 / 1024).toFixed(1);
      dataSavedElement.textContent = `${savedMB} MB`;
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
  const data = {
    version: 1,
    exportedAt: Date.now(),
    settings: currentSettings,
    readingHistory: JSON.parse(
      localStorage.getItem("enokku_reading_history_v2") || "[]",
    ),
    favorites: JSON.parse(localStorage.getItem("enokku_favorites") || "[]"),
    bookmarks: JSON.parse(localStorage.getItem("enokku_bookmarks") || "[]"),
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
    '<span class="update-checking">🔄 Checking for updates...</span>';

  try {
    await checkForVersionUpdate();

    // Check if we got an update notification
    const hasNotification = document.querySelector(".update-notification");
    if (!hasNotification) {
      statusEl.innerHTML =
        '<span class="update-current">✅ App is up to date</span>';

      // Clear status after 3 seconds
      setTimeout(() => {
        statusEl.innerHTML = "";
      }, 3000);
    } else {
      statusEl.innerHTML =
        '<span class="update-available">🔄 Update available! Click "Update Now" above.</span>';
    }
  } catch (error) {
    console.error("Manual update check failed:", error);
    statusEl.innerHTML =
      '<span class="update-error">❌ Check failed. Try again.</span>';

    setTimeout(() => {
      statusEl.innerHTML = "";
    }, 3000);
  }
};

window.clearAppCacheManual = async () => {
  const statusEl = document.getElementById("updateStatus");
  if (!statusEl) return;

  statusEl.innerHTML =
    '<span class="update-checking">🧹 Clearing cache...</span>';

  try {
    await clearAppCache();

    // Also try to unregister service worker
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
    }

    statusEl.innerHTML =
      '<span class="update-success">✅ Cache cleared! Reloading...</span>';

    // Reload after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error("Cache clear failed:", error);
    statusEl.innerHTML =
      '<span class="update-error">❌ Clear failed. Try manually clearing browser cache.</span>';
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

window.handleClearCache = handleClearCache;
window.exportUserData = exportUserData;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}

export { getSetting, setSetting, SETTINGS_DEFAULTS, exportUserData };
