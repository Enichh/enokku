const PWA_CONFIG = {
  SW_PATH: "/sw.js",
  INSTALL_PROMPT_DELAY: 5000,
  ENGAGEMENT_THRESHOLD: 3,
};

let deferredInstallPrompt = null;
let pageViewCount = parseInt(localStorage.getItem("enokku_page_views") || "0");
let installPromptDismissed = localStorage.getItem("enokku_install_dismissed");

function initPWA() {
  registerServiceWorker();
  trackEngagement();
  setupOnlineOfflineListeners();
  setupInstallPrompt();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    // console.log('[PWA] Service workers not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      PWA_CONFIG.SW_PATH,
    );
    // console.log('[PWA] Service worker registered:', registration.scope);

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            showUpdateNotification();
          }
        });
      }
    });
  } catch (error) {
    console.error("[PWA] Service worker registration failed:", error);
  }
}

function trackEngagement() {
  pageViewCount++;
  localStorage.setItem("enokku_page_views", pageViewCount.toString());
}

function setupOnlineOfflineListeners() {
  window.addEventListener("online", () => {
    // console.log('[PWA] Connection restored');
    document.body.classList.remove("offline");
    showConnectionStatus("online");
    syncReadingProgress();
  });

  window.addEventListener("offline", () => {
    // console.log('[PWA] Connection lost');
    document.body.classList.add("offline");
    showConnectionStatus("offline");
  });

  if (!navigator.onLine) {
    document.body.classList.add("offline");
  }
}

function showConnectionStatus(status) {
  const existingIndicator = document.querySelector(".connection-indicator");
  if (existingIndicator) {
    existingIndicator.remove();
  }

  const indicator = document.createElement("div");
  indicator.className = `connection-indicator ${status}`;
  indicator.innerHTML =
    status === "online"
      ? "<span>📡</span> Back online"
      : "<span>⚠️</span> Offline mode";

  document.body.appendChild(indicator);

  requestAnimationFrame(() => {
    indicator.classList.add("visible");
  });

  setTimeout(() => {
    indicator.classList.remove("visible");
    setTimeout(() => indicator.remove(), 300);
  }, 2000);
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;

    if (shouldShowInstallPrompt()) {
      setTimeout(showCustomInstallPrompt, PWA_CONFIG.INSTALL_PROMPT_DELAY);
    }
  });

  window.addEventListener("appinstalled", () => {
    // console.log('[PWA] App installed');
    deferredInstallPrompt = null;
    hideInstallBanner();
    localStorage.setItem("enokku_installed", "true");
  });
}

function shouldShowInstallPrompt() {
  if (installPromptDismissed) {
    const dismissedTime = parseInt(installPromptDismissed);
    const daysSinceDismissed =
      (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < 7) return false;
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isStandalone) return false;

  const isInstalled = localStorage.getItem("enokku_installed") === "true";
  if (isInstalled) return false;

  return pageViewCount >= PWA_CONFIG.ENGAGEMENT_THRESHOLD;
}

function showCustomInstallPrompt() {
  if (document.querySelector(".install-banner")) return;

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.innerHTML = `
    <span class="install-banner-text">📱 Install Enokku for offline reading</span>
    <button class="install-banner-btn" onclick="triggerInstall()">Install</button>
    <button class="install-banner-close" onclick="dismissInstall()">×</button>
  `;

  document.body.appendChild(banner);

  window.triggerInstall = async () => {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("[PWA] User accepted install");
    } else {
      console.log("[PWA] User dismissed install");
      dismissInstall();
    }

    deferredInstallPrompt = null;
  };

  window.dismissInstall = () => {
    localStorage.setItem("enokku_install_dismissed", Date.now().toString());
    hideInstallBanner();
  };
}

function hideInstallBanner() {
  const banner = document.querySelector(".install-banner");
  if (banner) {
    banner.classList.add("hidden");
    setTimeout(() => banner.remove(), 300);
  }
}

function showUpdateNotification() {
  const notification = document.createElement("div");
  notification.className = "update-notification";
  notification.innerHTML = `
    <span>🔄 Update available</span>
    <button onclick="updateApp()">Update</button>
    <button onclick="this.parentElement.remove()">Later</button>
  `;

  document.body.appendChild(notification);

  window.updateApp = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };
}

async function syncReadingProgress() {
  if (!("sync" in navigator)) {
    console.log("[PWA] Background sync not supported");
    return;
  }

  try {
    await navigator.serviceWorker.ready;
    await navigator.serviceWorker.sync.register("sync-reading-progress");
    console.log("[PWA] Reading progress sync registered");
  } catch (error) {
    console.error("[PWA] Sync registration failed:", error);
  }
}

function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((persistent) => {
      if (persistent) {
        console.log("[PWA] Persistent storage granted");
      } else {
        console.log("[PWA] Persistent storage denied");
      }
    });
  }
}

function getCacheStats() {
  return new Promise((resolve) => {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      navigator.storage.estimate().then((estimate) => {
        resolve({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentage: estimate.quota
            ? Math.round((estimate.usage / estimate.quota) * 100)
            : 0,
        });
      });
    } else {
      resolve({ usage: 0, quota: 0, percentage: 0 });
    }
  });
}

async function clearAppCache() {
  if (!("caches" in window)) return;

  const cacheNames = await caches.keys();
  const enokkuCaches = cacheNames.filter((name) => name.startsWith("enokku-"));

  await Promise.all(enokkuCaches.map((name) => caches.delete(name)));
  console.log("[PWA] App caches cleared");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPWA);
} else {
  initPWA();
}

export {
  initPWA,
  syncReadingProgress,
  requestPersistentStorage,
  getCacheStats,
  clearAppCache,
  showConnectionStatus,
};
