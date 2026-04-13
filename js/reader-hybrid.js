import { getChapterPagesHybrid, SOURCES } from "./hybrid-api.js";
import { getUrlParam, getPlaceholderImage, debounce } from "./utils.js";
import { saveReadingProgress, getLastReadChapter } from "./reading-history.js";

const chapterTitle = document.getElementById("chapterTitle");
const readerImages = document.getElementById("readerImages");
const pageIndicator = document.getElementById("pageIndicator");
const prevChapterBtn = document.getElementById("prevChapter");
const nextChapterBtn = document.getElementById("nextChapter");
const prevChapterBottomBtn = document.getElementById("prevChapterBottom");
const nextChapterBottomBtn = document.getElementById("nextChapterBottom");
const backToMangaBtn = document.getElementById("backToManga");
const readerFooter = document.querySelector(".reader-footer");

const chapterId = getUrlParam("id");
const mangaId = getUrlParam("manga");
const source = getUrlParam("source") || "mangadex";
const atsumaruMangaId = getUrlParam("mangaId"); // For Atsumaru source

// Floating reader bar elements
const floatingBar = document.getElementById("floatingReaderBar");
const floatProgressOnly = document.getElementById("floatProgressText");
const floatProgressExpanded = document.getElementById("floatProgressExpanded");
const floatChapterDisplay = document.getElementById("floatChapterDisplay");
const floatPrevBtn = document.getElementById("floatPrevChapter");
const floatNextBtn = document.getElementById("floatNextChapter");
const floatBackToTopBtn = document.getElementById("floatBackToTop");

let pages = [];
let currentPage = 0;
let allChapters = [];
let currentChapterIndex = -1;
let collapseTimer = null;
let currentProgress = { percent: 0, current: 0, total: 0 };
let currentChapterInfo = { number: "?", title: "" };

// Reading history tracking
let mangaTitleForHistory = "";
let coverUrlForHistory = "";
let canonicalMangaDexId = ""; // MangaDex UUID for canonical identification
let debouncedSaveProgress = null;

if (!chapterId) {
  readerImages.innerHTML =
    '<div class="error"><p>No chapter ID provided</p></div>';
}

async function loadChapter() {
  // Check initial floating bar visibility
  updateFloatingBarVisibility();

  readerImages.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading chapter...</p>
    </div>
  `;

  try {
    await loadChapterBySource();
    await loadMangaDetailsForHistory();

    // Try to load navigation, but don't fail if offline
    try {
      await loadChapterNavigation();
    } catch (navError) {
      console.warn("[Reader] Navigation unavailable, using cached metadata");
      allChapters = [];
      currentChapterIndex = -1;
    }

    renderPages();
    updatePageIndicator();
    updateChapterButtons();
    initPageObserver();
    initDebouncedSave();
    updateFloatingProgress(0);
    saveProgressToHistory(0);
    restoreScrollPosition();
  } catch (error) {
    console.error("[Reader] === loadChapter FAILED ===", error);
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadMangaDetailsForHistory() {
  const navigationMangaId = atsumaruMangaId;
  if (!navigationMangaId) return;

  try {
    const response = await fetch(`/atsumaru/manga?id=${navigationMangaId}`);
    if (response.ok) {
      const data = await response.json();
      if (data) {
        mangaTitleForHistory =
          data.title || data.englishTitle || `Manga ${navigationMangaId}`;
        coverUrlForHistory =
          data.image || getPlaceholderImage(256, 384, "No Cover");
        canonicalMangaDexId = mangaId; // Use the mangaId from URL as canonical
      }
    } else {
      console.error(`[Reader] Atsumaru API failed: ${response.status}`);
    }
  } catch (error) {
    console.error("[Reader] Failed to load manga details for history:", error);
  }
}

async function loadChapterBySource() {
  chapterTitle.textContent = "Chapter";

  // Set fallback floating bar chapter info
  updateFloatingChapterInfo("?", "", false, false);

  // Atsumaru-only: strip the atsu- prefix from chapterId for API calls
  const rawChapterId = chapterId?.startsWith("atsu-")
    ? chapterId.replace("atsu-", "")
    : chapterId;

  const chapterData = {
    source: SOURCES.ATSUMARU,
    mangaId: atsumaruMangaId,
    chapterId: rawChapterId,
  };

  const pageUrls = await getChapterPagesHybrid(chapterData);

  if (!pageUrls || pageUrls.length === 0) {
    throw new Error("No pages found from Atsumaru");
  }

  pages = pageUrls.map((url, index) => ({
    url: `/api/proxy?imageUrl=${encodeURIComponent(url)}`,
    alt: `Page ${index + 1}`,
  }));

  chapterTitle.textContent = "Chapter";
}

async function loadChapterNavigation() {
  // Atsumaru-only navigation
  const navigationMangaId = atsumaruMangaId;

  if (!navigationMangaId) {
    return;
  }

  try {
    const response = await fetch(`/atsumaru/manga?id=${navigationMangaId}`);
    const data = await response.json();
    const chapters = data?.chapters || [];

    allChapters = chapters
      .map((ch) => ({
        id: `atsu-${ch.id}`,
        attributes: {
          chapter: ch.number,
          title: ch.title,
          publishAt: ch.createdAt,
        },
      }))
      .sort((a, b) => {
        const aNum = parseFloat(a.attributes?.chapter) || 0;
        const bNum = parseFloat(b.attributes?.chapter) || 0;
        return aNum - bNum;
      });

    currentChapterIndex = allChapters.findIndex((c) => c.id === chapterId);
    console.log("[Reader] Current chapter index:", currentChapterIndex);
    console.log("[Reader] Total chapters:", allChapters.length);

    if (currentChapterIndex >= 0) {
      const chapter = allChapters[currentChapterIndex];
      const chapterNum = chapter.attributes?.chapter || "?";
      const chapterTitleText = chapter.attributes?.title || "";
      const hasPrev = currentChapterIndex > 0;
      const hasNext = currentChapterIndex < allChapters.length - 1;
      chapterTitle.textContent = `Chapter ${chapterNum}`;
      updateFloatingChapterInfo(chapterNum, chapterTitleText, hasPrev, hasNext);
    }

    console.log("[Reader] === loadChapterNavigation SUCCESS ===");
  } catch (error) {
    console.error("[Reader] === loadChapterNavigation FAILED ===", error);
  }
}

function updateChapterButtons() {
  const hasPrev = currentChapterIndex > 0;
  const hasNext =
    currentChapterIndex >= 0 && currentChapterIndex < allChapters.length - 1;

  prevChapterBtn.disabled = !hasPrev;
  nextChapterBtn.disabled = !hasNext;
  prevChapterBottomBtn.disabled = !hasPrev;
  nextChapterBottomBtn.disabled = !hasNext;
  if (floatPrevBtn) floatPrevBtn.disabled = !hasPrev;
  if (floatNextBtn) floatNextBtn.disabled = !hasNext;
}

function goToPrev() {
  if (currentChapterIndex > 0) {
    const prevChapter = allChapters[currentChapterIndex - 1];
    window.location.href = `reader.html?id=${prevChapter.id}&manga=${mangaId}&source=atsumaru&mangaId=${atsumaruMangaId}`;
  }
}

function goToNext() {
  if (
    currentChapterIndex >= 0 &&
    currentChapterIndex < allChapters.length - 1
  ) {
    const nextChapter = allChapters[currentChapterIndex + 1];
    window.location.href = `reader.html?id=${nextChapter.id}&manga=${mangaId}&source=atsumaru&mangaId=${atsumaruMangaId}`;
  }
}

prevChapterBtn.onclick = goToPrev;
nextChapterBtn.onclick = goToNext;
prevChapterBottomBtn.onclick = goToPrev;
nextChapterBottomBtn.onclick = goToNext;

function renderPages() {
  readerImages.innerHTML = "";

  pages.forEach((page, index) => {
    const img = document.createElement("img");
    img.src = page.url;
    img.alt = page.alt || `Page ${index + 1}`;
    img.loading = index < 3 ? "eager" : "lazy";
    img.dataset.page = index;
    img.referrerPolicy = "no-referrer";
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Page loaded
    };

    img.onerror = () => {
      console.error(`[Reader] Failed to load image ${index + 1}:`, page.url);
      img.src = getPlaceholderImage(800, 1200, `Page ${index + 1} Failed`);
    };

    readerImages.appendChild(img);
  });
}

function updatePageIndicator() {
  pageIndicator.textContent = `${pages.length} pages`;
}

backToMangaBtn.addEventListener("click", () => {
  // Use canonical MangaDex ID as primary, fallback to original IDs
  const navigationId = canonicalMangaDexId || mangaId || atsumaruMangaId;
  const title = mangaTitleForHistory || "Unknown";
  if (navigationId) {
    window.location.href = `manga.html?id=${navigationId}&title=${encodeURIComponent(title)}&source=${source}&atsumaruId=${atsumaruMangaId || ""}`;
  } else {
    window.location.href = "index.html";
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" && !prevChapterBtn.disabled) {
    prevChapterBtn.click();
  } else if (e.key === "ArrowRight" && !nextChapterBtn.disabled) {
    nextChapterBtn.click();
  }
});

// ===== Floating Reader Bar Functions =====

function updateFloatingProgress(percent) {
  const percentText = `${Math.round(percent)}%`;
  const chapterText =
    currentChapterIndex >= 0 && allChapters.length > 0
      ? `${currentChapterIndex + 1}/${allChapters.length}`
      : "?/?";
  const fullText = `${percentText} ${chapterText}`;

  if (floatProgressOnly) floatProgressOnly.textContent = fullText;
  if (floatProgressExpanded) floatProgressExpanded.textContent = fullText;

  currentProgress = {
    percent,
    current: currentChapterIndex + 1,
    total: allChapters.length,
  };
}

function updateFloatingChapterInfo(
  chapterNumber,
  chapterTitle,
  hasPrev,
  hasNext,
) {
  const displayTitle =
    chapterTitle &&
    chapterTitle.trim() &&
    chapterTitle !== `Chapter ${chapterNumber}`
      ? `Chapter ${chapterNumber} - ${chapterTitle}`
      : `Chapter ${chapterNumber}`;

  if (floatChapterDisplay) floatChapterDisplay.textContent = displayTitle;
  if (floatPrevBtn) floatPrevBtn.disabled = !hasPrev;
  if (floatNextBtn) floatNextBtn.disabled = !hasNext;

  currentChapterInfo = { number: chapterNumber, title: chapterTitle };
}

function expandFloatingBar() {
  if (!floatingBar) return;
  floatingBar.classList.remove("collapsed");
  resetCollapseTimer();
}

function collapseFloatingBar() {
  if (!floatingBar) return;
  floatingBar.classList.add("collapsed");
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

function resetCollapseTimer() {
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    collapseFloatingBar();
  }, 3000);
}

function handleFloatingBarTap(e) {
  if (e.target.closest("button")) return;

  if (floatingBar.classList.contains("collapsed")) {
    expandFloatingBar();
  } else {
    collapseFloatingBar();
  }
}

// ===== Floating Bar Event Listeners =====

if (floatingBar) {
  floatingBar.addEventListener("click", handleFloatingBarTap);
}

function updateFloatingBarVisibility() {
  if (!floatingBar || !readerFooter) return;

  const footerRect = readerFooter.getBoundingClientRect();
  const windowHeight = window.innerHeight;

  // Hide floating bar when footer is visible (within 100px of bottom)
  const isFooterVisible = footerRect.top < windowHeight + 100;

  if (isFooterVisible) {
    floatingBar.style.opacity = "0";
    floatingBar.style.pointerEvents = "none";
  } else {
    floatingBar.style.opacity = "1";
    floatingBar.style.pointerEvents = "auto";
  }
}

window.addEventListener(
  "scroll",
  () => {
    if (floatingBar && !floatingBar.classList.contains("collapsed")) {
      collapseFloatingBar();
    }
    updateFloatingBarVisibility();
  },
  { passive: true },
);

document.addEventListener("click", (e) => {
  if (
    floatingBar &&
    !floatingBar.contains(e.target) &&
    !floatingBar.classList.contains("collapsed")
  ) {
    collapseFloatingBar();
  }
});

if (floatBackToTopBtn) {
  floatBackToTopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

if (floatPrevBtn) {
  floatPrevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!floatPrevBtn.disabled) {
      goToPrev();
    }
  });
}

if (floatNextBtn) {
  floatNextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!floatNextBtn.disabled) {
      goToNext();
    }
  });
}

// ===== Page Tracking with IntersectionObserver =====

let pageObserver = null;

function initPageObserver() {
  if (pageObserver) {
    pageObserver.disconnect();
  }

  const images = readerImages.querySelectorAll("img");
  if (images.length === 0) return;

  let maxVisibleIndex = 0;

  pageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.dataset.page, 10);
          if (index > maxVisibleIndex) {
            maxVisibleIndex = index;
          }
          const percent = ((index + 1) / pages.length) * 100;
          updateFloatingProgress(percent);
          if (debouncedSaveProgress) {
            debouncedSaveProgress(percent);
          }
        }
      });
    },
    {
      root: null,
      rootMargin: "0px",
      threshold: 0.5,
    },
  );

  images.forEach((img) => pageObserver.observe(img));
}

// ===== End of Floating Reader Bar =====

// ===== Scroll Position Restoration =====

function restoreScrollPosition() {
  const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;
  const canonicalId = canonicalMangaDexId || mangaId;

  if (!navigationMangaId || !chapterId || !canonicalId) return;

  try {
    const savedEntry = getLastReadChapter(canonicalId);
    if (!savedEntry || savedEntry.chapterId !== chapterId) return;

    const savedPercent = savedEntry.scrollPercent;
    if (!savedPercent || savedPercent <= 0) return;

    console.log(`[Reader] Restoring scroll position: ${savedPercent}%`);

    // Wait for all images to load before restoring scroll
    const images = readerImages.querySelectorAll("img");
    let loadedImages = 0;

    const onImageLoad = () => {
      loadedImages++;
      if (loadedImages === images.length) {
        // All images loaded, now restore scroll position
        setTimeout(() => {
          const documentHeight = document.documentElement.scrollHeight;
          const windowHeight = window.innerHeight;
          const maxScroll = documentHeight - windowHeight;
          const targetScroll = (maxScroll * savedPercent) / 100;

          console.log(
            `[Reader] Scrolling to position: ${targetScroll}px (${savedPercent}%)`,
          );
          window.scrollTo({
            top: targetScroll,
            behavior: "instant", // Use instant to avoid smooth scroll animation on load
          });
        }, 100); // Small delay to ensure layout is complete
      }
    };

    // Check if images are already loaded
    images.forEach((img) => {
      if (img.complete) {
        onImageLoad();
      } else {
        img.addEventListener("load", onImageLoad);
        img.addEventListener("error", onImageLoad); // Count errors as loaded to avoid infinite wait
      }
    });

    // Handle case with no images or all already loaded
    if (images.length === 0) {
      setTimeout(() => {
        const documentHeight = document.documentElement.scrollHeight;
        const windowHeight = window.innerHeight;
        const maxScroll = documentHeight - windowHeight;
        const targetScroll = (maxScroll * savedPercent) / 100;

        window.scrollTo({
          top: targetScroll,
          behavior: "instant",
        });
      }, 100);
    }
  } catch (error) {
    console.error("[Reader] Failed to restore scroll position:", error);
  }
}

// ===== Reading History Functions =====

function initDebouncedSave() {
  debouncedSaveProgress = debounce((percent) => {
    saveProgressToHistory(percent);
  }, 500);
}

function saveProgressToHistory(percent) {
  const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;
  if (!navigationMangaId || !chapterId) return;

  const currentChapter = allChapters[currentChapterIndex];
  const chapterNumber =
    currentChapter?.attributes?.chapter || currentChapterInfo.number || "?";
  const chapterTitleText =
    currentChapter?.attributes?.title || currentChapterInfo.title || "";

  // Use canonical MangaDex UUID as primary mangaId if available
  // This ensures Continue Reading works correctly across sources
  const canonicalId = canonicalMangaDexId || mangaId;

  const payload = {
    mangaId: canonicalId, // Always store MangaDex UUID as canonical ID
    mangaTitle:
      mangaTitleForHistory || `Manga ${navigationMangaId.slice(0, 8)}`,
    coverUrl: coverUrlForHistory || getPlaceholderImage(256, 384, "No Cover"),
    chapterId: chapterId,
    chapterNumber: chapterNumber,
    chapterTitle: chapterTitleText,
    scrollPercent: Math.round(percent),
    source: source,
    atsumaruMangaId: atsumaruMangaId, // Keep Atsumaru ID for chapter fetching
  };
  saveReadingProgress(payload);
}

// =====

const backToTopBtn = document.getElementById("backToTop");

window.addEventListener("scroll", () => {
  if (window.scrollY > 500) {
    backToTopBtn?.classList.add("visible");
  } else {
    backToTopBtn?.classList.remove("visible");
  }
});

backToTopBtn?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

loadChapter();
