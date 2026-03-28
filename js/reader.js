import {
  fetchChapterDetails,
  fetchChapterPages,
  fetchMangaFeed,
} from "./api.js";
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

let pages = [];
let baseUrl = "";
let currentPage = 0;
let hash = "";
let allChapters = [];
let currentChapterIndex = -1;

if (!chapterId) {
  readerImages.innerHTML =
    '<div class="error"><p>No chapter ID provided</p></div>';
}

async function loadChapter() {
  console.log("[Reader] === loadChapter START ===");
  console.log("[Reader] chapterId:", chapterId, "mangaId:", mangaId);

  readerImages.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading chapter...</p>
        </div>
    `;

  try {
    console.log("[Reader] Fetching chapter details for:", chapterId);
    const { data: chapter } = await fetchChapterDetails(chapterId);
    console.log("[Reader] Chapter data:", JSON.stringify(chapter, null, 2));

    // Check if chapter is unavailable
    if (chapter.attributes?.isUnavailable) {
      console.warn("[Reader] Chapter is unavailable:", chapterId);
      const externalUrl = chapter.attributes?.externalUrl;
      if (externalUrl) {
        readerImages.innerHTML = `
          <div class="error">
            <p>Chapter hosted externally</p>
            <p><a href="${externalUrl}" target="_blank" rel="noopener">Read on external site</a></p>
          </div>`;
      } else {
        readerImages.innerHTML = `
          <div class="error">
            <p>Chapter pages are unavailable</p>
            <p>This chapter may have been removed or is not hosted on MangaDex.</p>
          </div>`;
      }
      return;
    }

    const chapterNum = chapter.attributes.chapter || "?";
    const chapterTitleText = chapter.attributes.title || "";

    chapterTitle.textContent = `Chapter ${chapterNum}${chapterTitleText ? ` - ${chapterTitleText}` : ""}`;

    console.log("[Reader] Fetching pages for chapter:", chapterId);
    const pagesData = await fetchChapterPages(chapterId);
    console.log("[Reader] Pages data:", JSON.stringify(pagesData, null, 2));

    baseUrl = pagesData.baseUrl;
    hash = pagesData.chapter.hash;
    pages = pagesData.chapter.data;

    console.log("[Reader] baseUrl:", baseUrl);
    console.log("[Reader] hash:", hash);
    console.log("[Reader] pages count:", pages?.length);
    console.log("[Reader] pages:", pages);

    await loadChapterNavigation();

    if (!pages || pages.length === 0) {
      console.error("[Reader] No pages available for chapter:", chapterId);
      readerImages.innerHTML =
        '<div class="error"><p>No pages available for this chapter</p></div>';
      return;
    }

    renderPages();
    updatePageIndicator();
    updateChapterButtons();
    console.log("[Reader] === loadChapter SUCCESS ===");
  } catch (error) {
    console.error("[Reader] === loadChapter FAILED ===", error);
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadChapterNavigation() {
  console.log("[Reader] === loadChapterNavigation START ===");
  if (!mangaId) {
    console.log("[Reader] No mangaId, skipping navigation");
    return;
  }

  try {
    console.log(
      "[Reader] Fetching manga feed for navigation, mangaId:",
      mangaId,
    );
    const { data: chapters } = await fetchMangaFeed(mangaId);
    console.log("[Reader] Raw chapters count:", chapters?.length);
    console.log(
      "[Reader] First chapter sample:",
      chapters?.[0] ? JSON.stringify(chapters[0], null, 2) : "none",
    );

    allChapters = chapters.sort((a, b) => {
      const aNum = parseFloat(a.attributes.chapter) || 0;
      const bNum = parseFloat(b.attributes.chapter) || 0;
      if (aNum !== bNum) return aNum - bNum;
      return (
        new Date(a.attributes.publishAt) - new Date(b.attributes.publishAt)
      );
    });

    currentChapterIndex = allChapters.findIndex((c) => c.id === chapterId);
    console.log(
      "[Reader] Current chapter index:",
      currentChapterIndex,
      "of",
      allChapters.length,
    );
    console.log(
      "[Reader] Chapter IDs list:",
      allChapters.map((c) => ({ id: c.id, chapter: c.attributes.chapter })),
    );
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
    // Construct image URL: {baseUrl}/data/{hash}/{page}
    const imageUrl = `${baseUrl}/data/${hash}/${page}`;
    // Proxy through Netlify function using query parameter
    const proxyUrl = `/api/proxy?imageUrl=${encodeURIComponent(imageUrl)}`;

    console.log(`[Reader] Page ${index + 1}/${pages.length}:`, {
      imageUrl,
      proxyUrl,
    });

    img.src = proxyUrl;
    img.alt = `Page ${index + 1}`;
    img.loading = index < 3 ? "eager" : "lazy";
    img.dataset.page = index;
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      console.log(`[Reader] Page ${index + 1} loaded successfully`);
    };

    img.onerror = () => {
      console.error(`[Reader] Failed to load image ${index + 1}:`, proxyUrl);
      img.src = getPlaceholderImage(800, 1200, `Page ${index + 1} Failed`);
    };

    readerImages.appendChild(img);
  });
  console.log("[Reader] === renderPages COMPLETE ===");
}

function updatePageIndicator() {
  pageIndicator.textContent = `${pages.length} pages`;
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
    backToTopBtn.classList.add("visible");
  } else {
    backToTopBtn.classList.remove("visible");
  }
});

backToTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

loadChapter();
