import {
  fetchChapterDetails,
  fetchChapterPages,
  fetchMangaFeed,
} from "./api.js";
import { getChapterPagesHybridAtsumaru } from "./atsumaru-api.js";
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
const atsumaruMangaId = getUrlParam("mangaId");
const atsumaruChapterId = getUrlParam("chapterId");
const mangadexId = getUrlParam("mangadexId");

let pages = [];
let currentPage = 0;
let allChapters = [];
let currentChapterIndex = -1;

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
    if (source === "atsumaru" && atsumaruMangaId && atsumaruChapterId) {
      await loadAtsumaruChapter();
    } else {
      await loadMangaDexChapter();
    }

    await loadChapterNavigation();
    renderPages();
    updatePageIndicator();
    updateChapterButtons();

    console.log("[Reader] === loadChapter SUCCESS ===");
  } catch (error) {
    console.error("[Reader] === loadChapter FAILED ===", error);
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadMangaDexChapter() {
  console.log("[Reader] Fetching MangaDex chapter:", chapterId);

  const chapter = mangadexId
    ? await fetchChapterDetails(mangadexId)
    : await fetchChapterDetails(chapterId);

  if (chapter.data?.attributes?.isUnavailable) {
    const externalUrl = chapter.data.attributes.externalUrl;
    if (externalUrl) {
      throw new Error(`Chapter hosted externally: ${externalUrl}`);
    }
    throw new Error("Chapter pages are unavailable");
  }

  const attrs = chapter.data?.attributes || chapter.attributes || {};
  const chapterNum = attrs.chapter || "?";
  const chapterTitleText = attrs.title || "";

  chapterTitle.textContent = `Chapter ${chapterNum}${chapterTitleText ? ` - ${chapterTitleText}` : ""}`;

  const pagesData = await fetchChapterPages(mangadexId || chapterId);
  const baseUrl = pagesData.baseUrl;
  const hash = pagesData.chapter.hash;
  const pageFiles = pagesData.chapter.data;

  pages = pageFiles.map((page) => ({
    url: `/api/proxy?imageUrl=${encodeURIComponent(`${baseUrl}/data/${hash}/${page}`)}`,
    alt: page,
  }));
}

async function loadAtsumaruChapter() {
  console.log("[Reader] Fetching Atsumaru chapter:", atsumaruChapterId);

  chapterTitle.textContent = `Chapter (Atsumaru)`;

  const chapterData = await getChapterPagesHybridAtsumaru({
    source: "atsumaru",
    mangaId: atsumaruMangaId,
    chapterId: atsumaruChapterId,
  });

  if (!chapterData || chapterData.length === 0) {
    throw new Error("No pages found on Atsumaru");
  }

  pages = chapterData.map((url, index) => ({
    url: `/api/proxy?imageUrl=${encodeURIComponent(url)}`,
    alt: `Page ${index + 1}`,
  }));

  chapterTitle.textContent = `Chapter (Atsumaru)`;
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
      (c) => c.id === (mangadexId || chapterId),
    );
    console.log("[Reader] Current chapter index:", currentChapterIndex);
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

  const goToPrev = () => {
    if (hasPrev) {
      const prevChapter = allChapters[currentChapterIndex - 1];
      window.location.href = `reader.html?id=${prevChapter.id}&manga=${mangaId}`;
    }
  };

  const goToNext = () => {
    if (hasNext) {
      const nextChapter = allChapters[currentChapterIndex + 1];
      window.location.href = `reader.html?id=${nextChapter.id}&manga=${mangaId}`;
    }
  };

  prevChapterBtn.onclick = goToPrev;
  nextChapterBtn.onclick = goToNext;
  prevChapterBottomBtn.onclick = goToPrev;
  nextChapterBottomBtn.onclick = goToNext;
}

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
  pageIndicator.textContent = `${pages.length} pages${source === "atsumaru" ? " (Atsumaru)" : ""}`;
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
