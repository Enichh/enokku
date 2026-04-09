import {
  fetchChapterDetails,
  fetchChapterPages,
  fetchMangaFeed,
} from "./api.js";
import { getChapterPagesHybrid, getSourceStyle } from "./hybrid-api.js";
import { getUrlParam, getPlaceholderImage } from "./utils.js";

const chapterTitle = document.getElementById("chapterTitle");
const readerImages = document.getElementById("readerImages");
const pageIndicator = document.getElementById("pageIndicator");
const prevChapterBtn = document.getElementById("prevChapter");
const nextChapterBtn = document.getElementById("nextChapter");
const prevChapterBottomBtn = document.getElementById("prevChapterBottom");
const nextChapterBottomBtn = document.getElementById("nextChapterBottom");
const backToMangaBtn = document.getElementById("backToManga");

const chapterId = getUrlParam("id");
const mangaId = getUrlParam("manga");
const source = getUrlParam("source") || "mangadex";

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

if (!chapterId) {
  readerImages.innerHTML =
    '<div class="error"><p>No chapter ID provided</p></div>';
}

async function loadChapter() {
  console.log("[Reader] === loadChapter START ===");
  console.log(
    "[Reader] chapterId:",
    chapterId,
    "mangaId:",
    mangaId,
    "source:",
    source,
  );

  readerImages.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading chapter...</p>
    </div>
  `;

  try {
    await loadChapterBySource();

    await loadChapterNavigation();
    renderPages();
    updatePageIndicator();
    updateChapterButtons();
    initPageObserver();
    updateFloatingProgress(0, 1, pages.length);

    console.log("[Reader] === loadChapter SUCCESS ===");
  } catch (error) {
    console.error("[Reader] === loadChapter FAILED ===", error);
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadChapterBySource() {
  console.log(`[Reader] Loading chapter from source: ${source}`);

  const style = getSourceStyle(source);
  chapterTitle.textContent = `Chapter (${style.name})`;

  // Set fallback floating bar chapter info
  updateFloatingChapterInfo("?", "", false, false);

  // Get chapter data from URL params based on source
  const chapterData = {
    source: source,
    mangadexId: chapterId,
    mangaId: getUrlParam("mangaId"),
    chapterId: getUrlParam("chapterId"),
    mangaSlug: getUrlParam("mangaSlug"),
    chapterSlug: getUrlParam("chapterSlug"),
  };

  const pageUrls = await getChapterPagesHybrid(chapterData);

  if (!pageUrls || pageUrls.length === 0) {
    throw new Error(`No pages found from ${style.name}`);
  }

  pages = pageUrls.map((url, index) => ({
    url: `/api/proxy?imageUrl=${encodeURIComponent(url)}`,
    alt: `Page ${index + 1}`,
  }));

  chapterTitle.textContent = `Chapter (${style.name})`;
}

async function loadChapterNavigation() {
  console.log("[Reader] === loadChapterNavigation START ===");
  if (!mangaId) {
    console.log("[Reader] No mangaId, skipping navigation");
    return;
  }

  try {
    console.log("[Reader] Fetching manga feed for navigation");
    const { data: chapters } = await fetchMangaFeed(mangaId);

    allChapters = chapters.sort((a, b) => {
      const aNum = parseFloat(a.attributes?.chapter) || 0;
      const bNum = parseFloat(b.attributes?.chapter) || 0;
      if (aNum !== bNum) return aNum - bNum;
      return (
        new Date(a.attributes?.publishAt || 0) -
        new Date(b.attributes?.publishAt || 0)
      );
    });

    currentChapterIndex = allChapters.findIndex(
      (c) => c.id === chapterId,
    );
    console.log("[Reader] Current chapter index:", currentChapterIndex);

    // Update floating bar chapter info
    if (currentChapterIndex >= 0) {
      const chapter = allChapters[currentChapterIndex];
      const chapterNum = chapter.attributes?.chapter || "?";
      const chapterTitle = chapter.attributes?.title || "";
      const hasPrev = currentChapterIndex > 0;
      const hasNext = currentChapterIndex < allChapters.length - 1;
      updateFloatingChapterInfo(chapterNum, chapterTitle, hasPrev, hasNext);
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
    window.location.href = `reader.html?id=${prevChapter.id}&manga=${mangaId}`;
  }
}

function goToNext() {
  if (currentChapterIndex >= 0 && currentChapterIndex < allChapters.length - 1) {
    const nextChapter = allChapters[currentChapterIndex + 1];
    window.location.href = `reader.html?id=${nextChapter.id}&manga=${mangaId}`;
  }
}

prevChapterBtn.onclick = goToPrev;
nextChapterBtn.onclick = goToNext;
prevChapterBottomBtn.onclick = goToPrev;
nextChapterBottomBtn.onclick = goToNext;

function renderPages() {
  console.log("[Reader] === renderPages START, count:", pages.length);
  readerImages.innerHTML = "";

  pages.forEach((page, index) => {
    const img = document.createElement("img");
    img.src = page.url;
    img.alt = page.alt || `Page ${index + 1}`;
    img.loading = index < 3 ? "eager" : "lazy";
    img.dataset.page = index;
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      console.log(`[Reader] Page ${index + 1} loaded`);
    };

    img.onerror = () => {
      console.error(`[Reader] Failed to load image ${index + 1}:`, page.url);
      img.src = getPlaceholderImage(800, 1200, `Page ${index + 1} Failed`);
    };

    readerImages.appendChild(img);
  });

  console.log("[Reader] === renderPages COMPLETE ===");
}

function updatePageIndicator() {
  const style = getSourceStyle(source);
  pageIndicator.textContent = `${pages.length} pages (${style.name})`;
}

backToMangaBtn.addEventListener("click", () => {
  if (mangaId) {
    window.location.href = `manga.html?id=${mangaId}`;
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

function updateFloatingProgress(percent, currentPageNum, totalPages) {
  const percentText = `${Math.round(percent)}%`;
  const pageText = `${currentPageNum}/${totalPages}`;
  const fullText = `${percentText} ${pageText}`;

  if (floatProgressOnly) floatProgressOnly.textContent = fullText;
  if (floatProgressExpanded) floatProgressExpanded.textContent = fullText;

  currentProgress = { percent, current: currentPageNum, total: totalPages };
}

function updateFloatingChapterInfo(chapterNumber, chapterTitle, hasPrev, hasNext) {
  const displayTitle = chapterTitle && chapterTitle.trim() && chapterTitle !== `Chapter ${chapterNumber}`
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

window.addEventListener(
  "scroll",
  () => {
    if (floatingBar && !floatingBar.classList.contains("collapsed")) {
      collapseFloatingBar();
    }
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
          updateFloatingProgress(percent, index + 1, pages.length);
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
