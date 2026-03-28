import { fetchChapterDetails, fetchChapterPages } from "./api.js";
import { getUrlParam, getPlaceholderImage } from "./utils.js";

const chapterTitle = document.getElementById("chapterTitle");
const readerImages = document.getElementById("readerImages");
const pageIndicator = document.getElementById("pageIndicator");
const prevChapterBtn = document.getElementById("prevChapter");
const nextChapterBtn = document.getElementById("nextChapter");
const backToMangaBtn = document.getElementById("backToManga");

const chapterId = getUrlParam("id");
const mangaId = getUrlParam("manga");

let pages = [];
let baseUrl = "";
let currentPage = 0;
let hash = "";

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

    const pagesData = await fetchChapterPages(chapterId);
    baseUrl = pagesData.baseUrl;
    hash = pagesData.chapter.hash;
    pages = pagesData.chapter.data;

    if (!pages || pages.length === 0) {
      readerImages.innerHTML =
        '<div class="error"><p>No pages available for this chapter</p></div>';
      return;
    }

    renderPages();
    updatePageIndicator();

    prevChapterBtn.disabled = !chapter.attributes.prevChapter;
    nextChapterBtn.disabled = !chapter.attributes.nextChapter;

    prevChapterBtn.onclick = () => {
      if (chapter.attributes.prevChapter) {
        window.location.href = `reader.html?id=${chapter.attributes.prevChapter}&manga=${mangaId}`;
      }
    };

    nextChapterBtn.onclick = () => {
      if (chapter.attributes.nextChapter) {
        window.location.href = `reader.html?id=${chapter.attributes.nextChapter}&manga=${mangaId}`;
      }
    };
  } catch (error) {
    readerImages.innerHTML = `<div class="error"><p>Error loading chapter: ${error.message}</p></div>`;
  }
}

function renderPages() {
  readerImages.innerHTML = "";

  pages.forEach((page, index) => {
    const img = document.createElement("img");
    img.src = `${baseUrl}/data/${hash}/${page}`;
    img.alt = `Page ${index + 1}`;
    img.loading = index < 3 ? "eager" : "lazy";
    img.dataset.page = index;

    img.onerror = () => {
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
