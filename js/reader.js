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
  readerImages.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading chapter...</p>
        </div>
    `;

  try {
    const { data: chapter } = await fetchChapterDetails(chapterId);
    const chapterNum = chapter.attributes.chapter || "?";
    const chapterTitleText = chapter.attributes.title || "";

    chapterTitle.textContent = `Chapter ${chapterNum}${chapterTitleText ? ` - ${chapterTitleText}` : ""}`;

    console.log("[Reader] Fetching pages for chapter:", chapterId);
    const pagesData = await fetchChapterPages(chapterId);
    console.log("[Reader] Pages data:", pagesData);

    baseUrl = pagesData.baseUrl;
    hash = pagesData.chapter.hash;
    pages = pagesData.chapter.data;

    console.log("[Reader] baseUrl:", baseUrl);
    console.log("[Reader] hash:", hash);
    console.log("[Reader] pages:", pages);

    await loadChapterNavigation();

    if (!pages || pages.length === 0) {
      readerImages.innerHTML =
        '<div class="error"><p>No pages available for this chapter</p></div>';
      return;
    }

    renderPages();
    updatePageIndicator();
    updateChapterButtons();
  } catch (error) {
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

async function loadChapterNavigation() {
  if (!mangaId) return;

  try {
    const { data: chapters } = await fetchMangaFeed(mangaId);

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
  } catch (error) {
    console.error("[Reader] Failed to load chapter navigation:", error);
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
  readerImages.innerHTML = "";

  pages.forEach((page, index) => {
    const img = document.createElement("img");
    // Proxy image through Netlify function to bypass CORS
    const originalUrl = `${baseUrl}/data/${hash}/${page}`;
    const imageUrl = `/api/image/${originalUrl.replace("https://", "")}`;
    console.log(`[Reader] Loading image ${index + 1}:`, imageUrl);
    img.src = imageUrl;
    img.alt = `Page ${index + 1}`;
    img.loading = index < 3 ? "eager" : "lazy";
    img.dataset.page = index;

    img.onerror = () => {
      console.error(`[Reader] Failed to load image:`, imageUrl);
      img.src = getPlaceholderImage(800, 1200, "Failed to load");
    };

    readerImages.appendChild(img);
  });
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

loadChapter();
