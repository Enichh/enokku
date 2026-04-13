const PWA_CONFIG = {
  SW_PATH: "/sw.js",
  INSTALL_PROMPT_DELAY: 5000,
  ENGAGEMENT_THRESHOLD: 3,
  UPDATE_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
  VERSION_URL: "/version.json",
};

let deferredInstallPrompt = null;
let pageViewCount = parseInt(localStorage.getItem("enokku_page_views") || "0");

// Expose deferredInstallPrompt globally for settings page access
window.deferredInstallPrompt = deferredInstallPrompt;
let installPromptDismissed = localStorage.getItem("enokku_install_dismissed");
let lastUserActivity = Date.now();
let updateCheckInterval = null;

function initPWA() {
  registerServiceWorker();
  trackEngagement();
  setupOnlineOfflineListeners();
  setupInstallPrompt();
  setupUserActivityTracking();
  checkForVersionUpdate();
  startPeriodicUpdateCheck();
  restoreStateAfterUpdate();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("[PWA] Service workers not supported on", getPlatform());
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      PWA_CONFIG.SW_PATH,
    );
    console.log(
      "[PWA] Service worker registered on",
      getPlatform(),
      ":",
      registration.scope,
    );

    // Verify service worker is active on mobile
    if (getPlatform() !== "desktop") {
      setTimeout(async () => {
        const activeWorker = registration.active;
        if (activeWorker) {
          console.log(
            "[PWA] Service worker is active on mobile:",
            activeWorker.state,
          );
        } else {
          console.warn(
            "[PWA] Service worker not active on mobile, state:",
            registration.installing?.state,
          );
        }
      }, 1000);
    }

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
    console.error(
      "[PWA] Service worker registration failed on",
      getPlatform(),
      ":",
      error,
    );

    // On mobile, retry registration once after a delay
    if (getPlatform() !== "desktop") {
      console.log("[PWA] Retrying service worker registration on mobile...");
      setTimeout(async () => {
        try {
          await navigator.serviceWorker.register(PWA_CONFIG.SW_PATH);
          console.log("[PWA] Mobile retry registration successful");
        } catch (retryError) {
          console.error("[PWA] Mobile retry registration failed:", retryError);
        }
      }, 2000);
    }
  }
}

function trackEngagement() {
  pageViewCount++;
  localStorage.setItem("enokku_page_views", pageViewCount.toString());
}

function setupOnlineOfflineListeners() {
  window.addEventListener("online", () => {
    console.log("[PWA] Connection restored - Mobile detected:", getPlatform());
    document.body.classList.remove("offline");
    showConnectionStatus("online");
    syncReadingProgress();
  });

  window.addEventListener("offline", () => {
    console.log("[PWA] Connection lost - Mobile detected:", getPlatform());
    document.body.classList.add("offline");
    showConnectionStatus("offline");

    // Force navigation to offline.html on mobile when offline
    if (
      getPlatform() !== "desktop" &&
      !window.location.pathname.includes("offline.html")
    ) {
      console.log("[PWA] Redirecting to offline.html on mobile");
      window.location.href = "/offline.html";
    }
  });

  if (!navigator.onLine) {
    console.log("[PWA] Initially offline - Mobile detected:", getPlatform());
    document.body.classList.add("offline");

    // Force navigation to offline.html on mobile when initially offline
    if (
      getPlatform() !== "desktop" &&
      !window.location.pathname.includes("offline.html")
    ) {
      console.log(
        "[PWA] Redirecting to offline.html on mobile (initial state)",
      );
      window.location.href = "/offline.html";
    }
  }
}

function showConnectionStatus(status) {
  const existingIndicator = document.querySelector(".connection-indicator");
  if (existingIndicator) {
    existingIndicator.remove();
  }

  const indicator = document.createElement("div");
  indicator.className = `connection-indicator ${status}`;
  indicator.innerHTML = status === "online" ? "Back online" : "Offline mode";

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
    window.deferredInstallPrompt = deferredInstallPrompt; // Update global reference

    if (shouldShowInstallPrompt()) {
      setTimeout(showCustomInstallPrompt, PWA_CONFIG.INSTALL_PROMPT_DELAY);
    }
  });

  window.addEventListener("appinstalled", () => {
    // console.log('[PWA] App installed');
    deferredInstallPrompt = null;
    window.deferredInstallPrompt = deferredInstallPrompt; // Update global reference
    hideInstallBanner();
    localStorage.setItem("enokku_installed", "true");
  });
}

// Define triggerInstall as local function for export
async function triggerInstall() {
  if (!deferredInstallPrompt) {
    console.log("[PWA] No install prompt available");
    return;
  }

  try {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("[PWA] User accepted install");
    } else {
      console.log("[PWA] User dismissed install");
    }

    deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;
  } catch (error) {
    console.error("[PWA] Install prompt failed:", error);
  }
}

// Make install functions globally available even when banner isn't shown
window.triggerInstall = triggerInstall;

// Getter function for deferred prompt state
export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

window.dismissInstall = () => {
  localStorage.setItem("enokku_install_dismissed", Date.now().toString());
  hideInstallBanner();
};

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
    <span class="install-banner-text">Install Enokku for offline reading</span>
    <button class="install-banner-btn" onclick="triggerInstall()">Install</button>
    <button class="install-banner-close" onclick="dismissInstall()">×</button>
  `;

  document.body.appendChild(banner);
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
    <span>Update available</span>
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

// ============================================
// PWA UPDATE MANAGEMENT
// ============================================

function setupUserActivityTracking() {
  const activityEvents = [
    "scroll",
    "click",
    "touchstart",
    "keydown",
    "mousemove",
  ];
  activityEvents.forEach((event) => {
    window.addEventListener(
      event,
      () => {
        lastUserActivity = Date.now();
      },
      { passive: true },
    );
  });
}

async function checkForVersionUpdate() {
  try {
    const response = await fetch(PWA_CONFIG.VERSION_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.log("[PWA] Version check failed:", response.status);
      return;
    }

    const { version } = await response.json();
    const currentVersion = localStorage.getItem("enokku_app_version");

    if (currentVersion && currentVersion !== version) {
      console.log(`[PWA] Update available: ${currentVersion} -> ${version}`);
      showEnhancedUpdateNotification(version);
    } else {
      // Versions match or first time - ensure localStorage is synced
      if (currentVersion !== version) {
        console.log(
          `[PWA] Syncing localStorage version: ${currentVersion} -> ${version}`,
        );
      }
      localStorage.setItem("enokku_app_version", version);
    }
  } catch (error) {
    console.log("[PWA] Version check error:", error);
  }
}

function startPeriodicUpdateCheck() {
  updateCheckInterval = setInterval(async () => {
    // Only check if user hasn't been active recently (30 seconds)
    const timeSinceActivity = Date.now() - lastUserActivity;
    if (timeSinceActivity > 30000) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          console.log("[PWA] Periodic update check triggered");
        }
        // Also check version.json directly
        await checkForVersionUpdate();
      } catch (error) {
        console.log("[PWA] Periodic update check failed:", error);
      }
    }
  }, PWA_CONFIG.UPDATE_CHECK_INTERVAL);
}

function getPlatform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isPWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function saveStateBeforeUpdate() {
  // Save current path for restoration
  const currentPath = window.location.pathname + window.location.search;
  sessionStorage.setItem("enokku_return_path", currentPath);

  // Save scroll position
  sessionStorage.setItem("enokku_scroll_pos", window.scrollY.toString());

  // Save any form data if on a form page
  const forms = document.querySelectorAll("form");
  if (forms.length > 0) {
    const formData = {};
    forms.forEach((form, index) => {
      const inputs = form.querySelectorAll("input, textarea, select");
      formData[index] = {};
      inputs.forEach((input) => {
        if (input.name || input.id) {
          formData[index][input.name || input.id] = input.value;
        }
      });
    });
    sessionStorage.setItem("enokku_form_data", JSON.stringify(formData));
  }
}

function restoreStateAfterUpdate() {
  const returnPath = sessionStorage.getItem("enokku_return_path");
  const scrollPos = sessionStorage.getItem("enokku_scroll_pos");
  const formDataStr = sessionStorage.getItem("enokku_form_data");

  // If we were redirected from a different path, restore it
  if (
    returnPath &&
    returnPath !== window.location.pathname + window.location.search
  ) {
    sessionStorage.removeItem("enokku_return_path");
    window.location.href = returnPath;
    return;
  }

  // Restore scroll position
  if (scrollPos) {
    const scrollY = parseInt(scrollPos, 10);
    if (!isNaN(scrollY) && scrollY > 0) {
      // Wait for page to fully load before scrolling
      setTimeout(() => {
        window.scrollTo(0, scrollY);
      }, 100);
    }
    sessionStorage.removeItem("enokku_scroll_pos");
  }

  // Restore form data
  if (formDataStr) {
    try {
      const formData = JSON.parse(formDataStr);
      const forms = document.querySelectorAll("form");
      forms.forEach((form, index) => {
        if (formData[index]) {
          const inputs = form.querySelectorAll("input, textarea, select");
          inputs.forEach((input) => {
            const key = input.name || input.id;
            if (key && formData[index][key] !== undefined) {
              input.value = formData[index][key];
            }
          });
        }
      });
    } catch (e) {
      console.log("[PWA] Failed to restore form data:", e);
    }
    sessionStorage.removeItem("enokku_form_data");
  }
}

function showEnhancedUpdateNotification(newVersion) {
  // Remove existing notification
  const existing = document.querySelector(".update-notification");
  if (existing) existing.remove();

  const notification = document.createElement("div");
  notification.className = "update-notification";
  notification.dataset.version = newVersion; // Store version for applyUpdate

  const platform = getPlatform();
  const isMobileDevice = platform === "ios" || platform === "android";

  notification.innerHTML = `
    <div class="update-notification-content">
      <span>Update available (${newVersion})</span>
      <button class="update-btn-primary" onclick="applyUpdate()">Update Now</button>
      <button class="update-btn-secondary" onclick="dismissUpdate()">Later</button>
    </div>
  `;

  document.body.appendChild(notification);

  // Show with animation
  requestAnimationFrame(() => {
    notification.classList.add("visible");
  });

  // Auto-hide after 15 seconds if not interacted
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add("fading");
      setTimeout(() => notification.remove(), 500);
    }
  }, 15000);
}

window.applyUpdate = () => {
  // Save current state before reloading
  saveStateBeforeUpdate();

  // Update localStorage with the new version to prevent re-triggering update on reload
  const notification = document.querySelector(".update-notification");
  const newVersion = notification?.dataset?.version;
  if (newVersion) {
    localStorage.setItem("enokku_app_version", newVersion);
    console.log("[PWA] Updated localStorage version to:", newVersion);
  }

  // Trigger service worker update
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
  }

  // Show loading state
  if (notification) {
    notification.innerHTML = `
      <div class="update-notification-content">
        <span>⏳ Updating...</span>
      </div>
    `;
  }

  // Reload after short delay to let SW activate
  setTimeout(() => {
    window.location.reload();
  }, 1000);
};

window.dismissUpdate = () => {
  const notification = document.querySelector(".update-notification");
  if (notification) {
    notification.classList.add("fading");
    setTimeout(() => notification.remove(), 500);
  }
};

export {
  initPWA,
  syncReadingProgress,
  requestPersistentStorage,
  getCacheStats,
  clearAppCache,
  showConnectionStatus,
  checkForVersionUpdate,
  triggerInstall,
};
