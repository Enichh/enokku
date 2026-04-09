import {
  fetchMangaDetails,
  fetchMangaFeed,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
} from "./api.js";
import { getChaptersHybrid } from "./hybrid-api.js";
import {
  getUrlParam,
  formatDate,
  truncateText,
  showLoading,
  showError,
  getPlaceholderImage,
} from "./utils.js";
import { debounce } from "./utils.js";

const mangaDetailsContainer = document.getElementById("mangaDetails");
const chapterListContainer = document.getElementById("chapterList");
const searchInput = document.getElementById("searchInput");

const mangaId = getUrlParam("id");
let allChapters = [];
let currentPage = 0;
const chaptersPerPage = 50;
let hybridInfo = null;
let currentSortOrder = 'asc'; // 'asc' or 'desc'

if (!mangaId) {
  showError("mangaDetails", "No manga ID provided");
}

async function loadMangaDetails() {
  showLoading("mangaDetails");

  try {
    const { data: manga } = await fetchMangaDetails(mangaId);

    const coverArt = findRelationship(manga, "cover_art");
    const author = findRelationship(manga, "author");

    const coverUrl = coverArt
      ? getCoverUrl(mangaId, coverArt, "512")
      : getPlaceholderImage(512, 768, "No Cover");

    const title = getEnglishTitle(manga);

    const allTitles = [
      title,
      ...(manga.attributes.altTitles?.map((t) => Object.values(t)[0]) || []),
      manga.attributes.title?.ja || "",
      manga.attributes.title?.["ja-ro"] || "",
      manga.attributes.title?.ko || "",
      manga.attributes.title?.["ko-ro"] || "",
    ].filter(Boolean);

    const altTitles = allTitles.slice(1).join(", ") || "";
    const description =
      manga.attributes.description?.en ||
      Object.values(manga.attributes.description || {})[0] ||
      "No description available";

    const tags =
      manga.attributes.tags
        ?.map((tag) => {
          const tagName = tag.attributes?.name?.en || "";
          return tagName ? `<span class="status">${tagName}</span>` : "";
        })
        .join(" ") || "";

    mangaDetailsContainer.innerHTML = `
      <div class="manga-cover">
        <img id="mangaCoverImg" src="${coverUrl}" alt="${title}" referrerpolicy="no-referrer">
        <button id="startReadingBtn" class="start-reading-btn">
          <span class="btn-text">▶ Start Reading</span>
          <span class="btn-text-mobile">▶ Read</span>
        </button>
      </div>
      <div class="manga-info">
        <h1>${title}</h1>
        ${altTitles ? `<div class="alt-titles">${truncateText(altTitles, 100)}</div>` : ""}
        <div class="status">${manga.attributes.status || "Unknown"} · ${author?.attributes?.name || "Unknown Author"}</div>
        <div style="margin: 0.5rem 0;">${tags}</div>
        <div class="description">${truncateText(description, 500)}</div>
      </div>
    `;

    const img = mangaDetailsContainer.querySelector("#mangaCoverImg");
    img.addEventListener("error", () => {
      img.src = getPlaceholderImage(512, 768, "No Cover");
    });

    await loadChapters(allTitles);
  } catch (error) {
    showError("mangaDetails", error.message);
  }
}

async function loadChapters(allTitles) {
  console.log(`[Details] Loading chapters for manga: ${mangaId}`);
  console.log(`[Details] Trying titles:`, allTitles);
  chapterListContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading chapters from MangaDex...</p>
    </div>
  `;

  try {
    const response = await fetchMangaFeed(mangaId);
    const mangadexChapters = response.data || [];

    console.log(`[Details] Found ${mangadexChapters.length} MangaDex chapters`);

    chapterListContainer.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Checking alternative sources for chapters...</p>
      </div>
    `;

    const hybrid = await getChaptersHybrid(allTitles, mangadexChapters);
    allChapters = hybrid.chapters;
    hybridInfo = hybrid;

    console.log(
      `[Details] Hybrid result: ${hybrid.source}, ${allChapters.length} total chapters`,
    );

    if (allChapters.length === 0) {
      chapterListContainer.innerHTML = `
        <div class="empty">
          <p>No chapters available</p>
        </div>
      `;
      return;
    }

    renderChapterPage(0, hybrid.source, hybrid.missingCount || 0);
  } catch (error) {
    console.error(`[Details] Error loading chapters:`, error);
    chapterListContainer.innerHTML = `
      <div class="error">
        <p>Error loading chapters: ${error.message}</p>
      </div>
    `;
  }
}

function renderChapterPage(page, source = "mangadex", missingCount = 0) {
  console.log(`[Details] Rendering chapter page ${page}`);
  currentPage = page;
  const totalPages = Math.ceil(allChapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, allChapters.length);
  const pageChapters = allChapters.slice(startIndex, endIndex);

  let html = `
    <div class="chapter-header">
      <div class="sort-controls">
        <button id="sortAscBtn" class="sort-btn ${currentSortOrder === 'asc' ? 'active' : ''}" title="Sort ascending (oldest first)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
          </svg>
          Ascending
        </button>
        <button id="sortDescBtn" class="sort-btn ${currentSortOrder === 'desc' ? 'active' : ''}" title="Sort descending (newest first)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/>
          </svg>
          Descending
        </button>
      </div>
      <span id="chapterCount" class="chapter-count">${allChapters.length} chapters</span>
    </div>
    <h2>Chapters</h2>
    <div class="chapter-pagination">
      <button onclick="goToChapterPage(${page - 1})" ${page === 0 ? "disabled" : ""}>Previous</button>
      <span class="page-info">Page ${page + 1} of ${totalPages}</span>
      <button onclick="goToChapterPage(${page + 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
    </div>
    <div class="chapter-items">
  `;

  pageChapters.forEach((chapter) => {
    const chapterNum = chapter.chapter || "?";
    const chapterTitle = chapter.title || "";

    html += `
      <div class="chapter-item" 
           data-chapter-id="${chapter.id}" 
           data-source="${chapter.source}">
        <div>
          <div class="chapter-title">
            Chapter ${chapterNum}${chapterTitle ? ` - ${chapterTitle}` : ""}
          </div>
        </div>
      </div>
    `;
  });

  html += "</div>";

  if (totalPages > 1) {
    html += `
      <div class="chapter-pagination bottom">
        <button onclick="goToChapterPage(${page - 1})" ${page === 0 ? "disabled" : ""}>Previous</button>
        <span class="page-info">Page ${page + 1} of ${totalPages}</span>
        <button onclick="goToChapterPage(${page + 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
      </div>
    `;
  }

  chapterListContainer.innerHTML = html;

  // Add event listeners for sort buttons
  const sortAscBtn = document.getElementById('sortAscBtn');
  const sortDescBtn = document.getElementById('sortDescBtn');
  
  if (sortAscBtn) {
    sortAscBtn.addEventListener('click', () => {
      if (currentSortOrder !== 'asc') {
        currentSortOrder = 'asc';
        sortChapters();
      }
    });
  }
  
  if (sortDescBtn) {
    sortDescBtn.addEventListener('click', () => {
      if (currentSortOrder !== 'desc') {
        currentSortOrder = 'desc';
        sortChapters();
      }
    });
  }

  // Add event listener for Start Reading button
  const startReadingBtn = document.getElementById('startReadingBtn');
  if (startReadingBtn) {
    startReadingBtn.addEventListener('click', startReading);
  }

  pageChapters.forEach((chapter) => {
    const el = chapterListContainer.querySelector(
      `[data-chapter-id="${chapter.id}"]`,
    );
    el.addEventListener("click", () => {
      const params = new URLSearchParams({
        id: chapter.id,
        manga: mangaId,
        source: chapter.source,
      });

      // Add source-specific parameters
      if (chapter.source === "atsumaru") {
        if (chapter.mangaId) params.set("mangaId", chapter.mangaId);
        if (chapter.chapterId) params.set("chapterId", chapter.chapterId);
      } else if (chapter.source === "mangadex") {
        if (chapter.mangadexId) params.set("mangadexId", chapter.mangadexId);
      }

      window.location.href = `reader.html?${params.toString()}`;
    });
  });
}

window.goToChapterPage = function (page) {
  const totalPages = Math.ceil(allChapters.length / chaptersPerPage);
  if (page < 0 || page >= totalPages) return;
  renderChapterPage(page);
  chapterListContainer.scrollIntoView({ behavior: "smooth" });
};

function sortChapters() {
  console.log(`[Details] Sorting chapters: ${currentSortOrder}`);
  
  // Sort chapters based on current sort order
  allChapters.sort((a, b) => {
    const aChapter = parseFloat(a.chapter) || 0;
    const bChapter = parseFloat(b.chapter) || 0;
    
    if (currentSortOrder === 'asc') {
      return aChapter - bChapter;
    } else {
      return bChapter - aChapter;
    }
  });
  
  // Re-render from first page
  renderChapterPage(0, hybridInfo?.source, hybridInfo?.missingCount || 0);
}

function startReading() {
  console.log(`[Details] Start Reading clicked`);
  
  // Check for reading progress in localStorage
  const progressKey = `reading_progress_${mangaId}`;
  const savedProgress = localStorage.getItem(progressKey);
  
  let targetChapter = null;
  
  if (savedProgress) {
    try {
      const progress = JSON.parse(savedProgress);
      // Find the saved chapter in the current list
      targetChapter = allChapters.find(ch => 
        ch.id === progress.chapterId || 
        (ch.source === 'atsumaru' && ch.chapterId === progress.chapterId) ||
        (ch.source === 'mangadex' && ch.mangadexId === progress.mangadexId)
      );
      
      if (targetChapter) {
        console.log(`[Details] Found saved progress: Chapter ${targetChapter.chapter}`);
      }
    } catch (error) {
      console.error('[Details] Error parsing saved progress:', error);
    }
  }
  
  // If no saved progress, use the first chapter from the sorted list
  if (!targetChapter && allChapters.length > 0) {
    targetChapter = allChapters[0];
    console.log(`[Details] No saved progress, using first chapter: Chapter ${targetChapter.chapter}`);
  }
  
  if (!targetChapter) {
    console.error('[Details] No chapters available for reading');
    return;
  }
  
  // Navigate to the reader
  const params = new URLSearchParams({
    id: targetChapter.id,
    manga: mangaId,
    source: targetChapter.source,
  });

  // Add source-specific parameters
  if (targetChapter.source === "atsumaru") {
    if (targetChapter.mangaId) params.set("mangaId", targetChapter.mangaId);
    if (targetChapter.chapterId) params.set("chapterId", targetChapter.chapterId);
  } else if (targetChapter.source === "mangadex") {
    if (targetChapter.mangadexId) params.set("mangadexId", targetChapter.mangadexId);
  }

  window.location.href = `reader.html?${params.toString()}`;
}

const debouncedSearch = debounce((query) => {
  if (query) {
    window.location.href = `index.html?search=${encodeURIComponent(query)}`;
  }
}, 500);

searchInput?.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

loadMangaDetails();
