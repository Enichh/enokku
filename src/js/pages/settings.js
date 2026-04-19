const SETTINGS_DEFAULTS = {
  readingDirection: "rtl",
  imageQuality: "auto",
  readerBackground: "#0a0a0a",
  fontSize: "medium",
  hapticFeedback: true,
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
}

async function updateCacheStats() {
  const usageElement = document.getElementById("storageUsage");

  try {
    if (usageElement) {
      usageElement.textContent = "N/A (PWA disabled)";
    }
  } catch (error) {
    console.error("[Settings] Failed to get cache stats:", error);
    if (usageElement) usageElement.textContent = "Unable to calculate";
  }
}

async function handleClearCache() {
  alert(
    "Cache clearing is disabled (PWA removed). Please clear your browser cache manually.",
  );
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
