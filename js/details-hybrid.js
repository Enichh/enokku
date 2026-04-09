import {
  fetchMangaDetails,
  fetchMangaFeed,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
} from "./api.js";
import { getChaptersHybridAtsumaru } from "./atsumaru-api.js";
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
let atsumaruId = null;

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
        <p>Checking Atsumaru for additional chapters...</p>
      </div>
    `;

    const hybrid = await getChaptersHybridAtsumaru(allTitles, mangadexChapters);
    allChapters = hybrid.chapters;
    atsumaruId = hybrid.atsumaruId;

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

  let sourceBadge = "";
  if (source === "hybrid") {
    sourceBadge = `<span class="badge" title="${missingCount} chapters from Atsumaru">Hybrid Source</span>`;
  } else if (atsumaruId) {
    sourceBadge = `<span class="badge">MangaDex</span>`;
  }

  let html = `
    <h2>Chapters (${allChapters.length} total) ${sourceBadge}</h2>
    <div class="chapter-pagination">
      <button onclick="goToChapterPage(${page - 1})" ${page === 0 ? "disabled" : ""}>Previous</button>
      <span class="page-info">Page ${page + 1} of ${totalPages}</span>
      <button onclick="goToChapterPage(${page + 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
    </div>
    <div class="chapter-items">
  `;

  pageChapters.forEach((chapter) => {
    const isAtsumaru = chapter.source === "atsumaru";
    const chapterNum = chapter.chapter || "?";
    const chapterTitle = chapter.title || "";
    const sourceIcon = isAtsumaru ? " 📚" : "";

    html += `
      <div class="chapter-item ${isAtsumaru ? "atsumaru" : ""}" 
           data-chapter-id="${chapter.id}" 
           data-source="${chapter.source}"
           ${chapter.mangaId ? `data-manga-id="${chapter.mangaId}"` : ""}
           ${chapter.chapterId ? `data-chapter-id-atsu="${chapter.chapterId}"` : ""}>
        <div>
          <div class="chapter-title">
            Chapter ${chapterNum}${chapterTitle ? ` - ${chapterTitle}` : ""}${sourceIcon}
          </div>
          <div class="chapter-meta">${isAtsumaru ? "Source: Atsumaru" : "Source: MangaDex"}</div>
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

      if (chapter.mangaId) {
        params.set("mangaId", chapter.mangaId);
      }
      if (chapter.chapterId) {
        params.set("chapterId", chapter.chapterId);
      }

      if (chapter.mangadexId) {
        params.set("mangadexId", chapter.mangadexId);
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

const debouncedSearch = debounce((query) => {
  if (query) {
    window.location.href = `index.html?search=${encodeURIComponent(query)}`;
  }
}, 500);

searchInput?.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

loadMangaDetails();
