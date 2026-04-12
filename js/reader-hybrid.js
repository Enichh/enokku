import {
  fetchChapterDetails,
  fetchChapterPages,
  fetchMangaFeed,
  fetchMangaDetails,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
  searchManga,
} from "./api.js";
import { getChapterPagesHybrid, getSourceStyle } from "./hybrid-api.js";
import { getUrlParam, getPlaceholderImage, debounce } from "./utils.js";
import { saveReadingProgress } from "./reading-history.js";

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
  // console.log("[Reader] === loadChapter START ===");
  // console.log(
  //   "[Reader] chapterId:",
  //   chapterId,
  //   "mangaId:",
    mangaId,
    "source:",
    source,
  );

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
    await loadChapterNavigation();
    renderPages();
    updatePageIndicator();
    updateChapterButtons();
    initPageObserver();
    initDebouncedSave();
    updateFloatingProgress(0);
    saveProgressToHistory(0);

    // console.log("[Reader] === loadChapter SUCCESS ===");
  } catch (error) {
    console.error("[Reader] === loadChapter FAILED ===", error);
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadMangaDetailsForHistory() {
  const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;
  if (!navigationMangaId) return;

  try {
    if (source === "atsumaru") {
      // Fetch Atsumaru manga details from Atsumaru API
      // console.log(
      //   `[Reader] Fetching Atsumaru manga details for: ${navigationMangaId}`,
      // );
      const response = await fetch(`/atsumaru/manga?id=${navigationMangaId}`);
      if (response.ok) {
        const data = await response.json();
        // console.log(
      //   "[Reader] Atsumaru API response:",
      //   JSON.stringify(data, null, 2),
      // );
        if (data) {
          mangaTitleForHistory =
            data.title || data.englishTitle || `Manga ${navigationMangaId}`;

          // Also search MangaDex by title to get canonical ID and proper cover
          try {
            const searchResults = await searchManga(mangaTitleForHistory, 5);
            if (searchResults?.data?.length > 0) {
              // Find best match by chapter count (prefer main series over doujinshi)
              const bestMatch = searchResults.data.reduce((best, current) => {
                const bestChapters =
                  parseInt(best.attributes?.lastChapter) || 0;
                const currentChapters =
                  parseInt(current.attributes?.lastChapter) || 0;
                return currentChapters > bestChapters ? current : best;
              });
              // Store canonical MangaDex UUID
              canonicalMangaDexId = bestMatch.id;
              // console.log(
      //   `[Reader] Found canonical MangaDex ID: ${canonicalMangaDexId}`,
      // );

              const coverArt = findRelationship(bestMatch, "cover_art");
              if (coverArt) {
                coverUrlForHistory = getCoverUrl(bestMatch.id, coverArt, "256");
                // console.log(`[Reader] Using MangaDex cover for history`);
              } else {
                coverUrlForHistory = getPlaceholderImage(256, 384, "No Cover");
              }
            } else {
              canonicalMangaDexId = "";
              coverUrlForHistory = getPlaceholderImage(256, 384, "No Cover");
            }
          } catch (searchError) {
            console.error("[Reader] MangaDex search failed:", searchError);
            canonicalMangaDexId = "";
            coverUrlForHistory = getPlaceholderImage(256, 384, "No Cover");
          }

          // console.log(`[Reader] Set history title: "${mangaTitleForHistory}"`);
          // console.log(`[Reader] Set history cover: "${coverUrlForHistory}"`);
        }
      } else {
        console.error(`[Reader] Atsumaru API failed: ${response.status}`);
      }
    } else {
      // Fetch MangaDex manga details
      const mangaData = await fetchMangaDetails(navigationMangaId);
      if (mangaData?.data) {
        mangaTitleForHistory = getEnglishTitle(mangaData.data);
        const coverArt = findRelationship(mangaData.data, "cover_art");
        coverUrlForHistory = coverArt
          ? getCoverUrl(mangaData.data.id, coverArt, "256")
          : getPlaceholderImage(256, 384, "No Cover");
      }
    }
  } catch (error) {
    console.error("[Reader] Failed to load manga details for history:", error);
  }
}

async function loadChapterBySource() {
  // console.log(`[Reader] Loading chapter from source: ${source}`);

  chapterTitle.textContent = "Chapter";

  // Set fallback floating bar chapter info
  updateFloatingChapterInfo("?", "", false, false);

  // Get chapter data from URL params based on source
  // For Atsumaru, strip the atsu- prefix from chapterId for API calls
  const rawChapterId =
    source === "atsumaru" && chapterId?.startsWith("atsu-")
      ? chapterId.replace("atsu-", "")
      : chapterId;

  const chapterData = {
    source: source,
    mangadexId: source === "mangadex" ? chapterId : null,
    mangaId: atsumaruMangaId,
    chapterId: rawChapterId, // Use raw ID for Atsumaru API
    mangaSlug: getUrlParam("mangaSlug"),
    chapterSlug: getUrlParam("chapterSlug"),
  };

  const pageUrls = await getChapterPagesHybrid(chapterData);

  if (!pageUrls || pageUrls.length === 0) {
    throw new Error(`No pages found from ${style.name}`);
  }

  pages = pageUrls.map((url, index) => ({
    url,
    alt: `Page ${index + 1}`,
  }));

  chapterTitle.textContent = "Chapter";
}

async function loadChapterNavigation() {
  // console.log("[Reader] === loadChapterNavigation START ===");
  // console.log("[Reader] mangaId:", mangaId);
  // console.log("[Reader] chapterId:", chapterId);
  // console.log("[Reader] source:", source);
  // console.log("[Reader] atsumaruMangaId:", atsumaruMangaId);

  // Use correct manga ID based on source
  const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;
  // console.log("[Reader] navigationMangaId:", navigationMangaId);

  if (!navigationMangaId) {
    // console.log("[Reader] No navigationMangaId, skipping navigation");
    return;
  }

  try {
    if (source === "atsumaru") {
      // For Atsumaru, we need to fetch chapters differently
      // console.log("[Reader] Fetching Atsumaru chapters for navigation");
      // Use the Atsumaru API to get chapters
      const response = await fetch(`/atsumaru/manga?id=${navigationMangaId}`);
      const data = await response.json();
      const chapters = data?.chapters || [];
      // console.log("[Reader] Fetched Atsumaru chapters count:", chapters.length);

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
    } else {
      // For MangaDex, use existing logic
      // console.log("[Reader] Fetching MangaDex feed for navigation");
      const { data: chapters } = await fetchMangaFeed(navigationMangaId);
      // console.log(
      //   "[Reader] Fetched MangaDex chapters count:",
      //   chapters?.length || 0,
      // );

      allChapters = chapters.sort((a, b) => {
        const aNum = parseFloat(a.attributes?.chapter) || 0;
        const bNum = parseFloat(b.attributes?.chapter) || 0;
        if (aNum !== bNum) return aNum - bNum;
        return (
          new Date(a.attributes?.publishAt || 0) -
          new Date(b.attributes?.publishAt || 0)
        );
      });
    }

    // console.log(
    currentChapterIndex = allChapters.findIndex((c) => c.id === chapterId);
    console.log("[Reader] Current chapter index:", currentChapterIndex);
    console.log("[Reader] Total chapters:", allChapters.length);

    if (currentChapterIndex >= 0) {
      const chapter = allChapters[currentChapterIndex];
      const chapterNum = chapter.attributes?.chapter || "?";
      const chapterTitleText = chapter.attributes?.title || "";
      const hasPrev = currentChapterIndex > 0;
      const hasNext = currentChapterIndex < allChapters.length - 1;
      // console.log(
      //   "[Reader] Navigation state - hasPrev:",
      //   hasPrev,
      //   "hasNext:",
      //   hasNext,
      // );
      // Update header title with chapter number
      chapterTitle.textContent = `Chapter ${chapterNum}`;
      updateFloatingChapterInfo(chapterNum, chapterTitleText, hasPrev, hasNext);
    } else {
      // console.log("[Reader] Chapter not found in chapters array!");
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

  // console.log("[Reader] updateChapterButtons:");
  // console.log("  currentChapterIndex:", currentChapterIndex);
  // console.log("  allChapters.length:", allChapters.length);
  // console.log("  hasPrev:", hasPrev, "hasNext:", hasNext);

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
    const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;

    if (source === "atsumaru") {
      // Keep atsu- prefix in URL for consistent ID matching
      window.location.href = `reader.html?id=${prevChapter.id}&manga=${navigationMangaId}&source=atsumaru&mangaId=${atsumaruMangaId}`;
    } else {
      window.location.href = `reader.html?id=${prevChapter.id}&manga=${navigationMangaId}&source=mangadex`;
    }
  }
}

function goToNext() {
  if (
    currentChapterIndex >= 0 &&
    currentChapterIndex < allChapters.length - 1
  ) {
    const nextChapter = allChapters[currentChapterIndex + 1];
    const navigationMangaId = source === "atsumaru" ? atsumaruMangaId : mangaId;

    if (source === "atsumaru") {
      // Keep atsu- prefix in URL for consistent ID matching
      window.location.href = `reader.html?id=${nextChapter.id}&manga=${navigationMangaId}&source=atsumaru&mangaId=${atsumaruMangaId}`;
    } else {
      window.location.href = `reader.html?id=${nextChapter.id}&manga=${navigationMangaId}&source=mangadex`;
    }
  }
}

prevChapterBtn.onclick = goToPrev;
nextChapterBtn.onclick = goToNext;
prevChapterBottomBtn.onclick = goToPrev;
nextChapterBottomBtn.onclick = goToNext;

function renderPages() {
  // console.log("[Reader] === renderPages START, count:", pages.length);
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
      // console.log(`[Reader] Page ${index + 1} loaded`);
    };

    img.onerror = () => {
      console.error(`[Reader] Failed to load image ${index + 1}:`, page.url);
      img.src = getPlaceholderImage(800, 1200, `Page ${index + 1} Failed`);
    };

    readerImages.appendChild(img);
  });

  // console.log("[Reader] === renderPages COMPLETE ===");
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
  // console.log(
  //   "[Reader] Continue Reading payload:",
  //   JSON.stringify(payload, null, 2),
  // );
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
