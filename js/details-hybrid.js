import {
  fetchMangaDetails,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
  searchManga,
} from "./api.js";
import {
  getChaptersHybrid,
  findAtsumaruManga,
  getAtsumaruChapters,
  fetchAtsumaru,
} from "./hybrid-api.js";
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
const sourceParam = getUrlParam("source") || "mangadex";
const titleParam = getUrlParam("title");
const atsumaruIdParam = getUrlParam("atsumaruId"); // Atsumaru ID for chapter fetching
let allChapters = [];
let currentPage = 0;
const chaptersPerPage = 50;
let hybridInfo = null;
let currentSortOrder = "asc"; // 'asc' or 'desc'

if (!mangaId) {
  showError("mangaDetails", "No manga ID provided");
}

// Check if ID is a valid MangaDex UUID (36 chars with hyphens) or Atsumaru short ID
function isValidMangaDexId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

async function loadMangaDetails() {
  showLoading("mangaDetails");

  // If atsumaruIdParam is present, fetch from Atsumaru API
  if (atsumaruIdParam) {
    console.log(`[Details] Manga from Atsumaru, ID: ${atsumaruIdParam}`);
    try {
      const atsumaruManga = await fetchAtsumaru("/manga", {
        id: atsumaruIdParam,
      });
      if (atsumaruManga) {
        await renderAtsumaruDetails(atsumaruManga);
        return;
      } else {
        console.error(`[Details] Atsumaru API returned null`);
        mangaDetailsContainer.innerHTML = `
          <div class="error">
            <p>Failed to load manga details from Atsumaru</p>
          </div>
        `;
        return;
      }
    } catch (error) {
      console.error(`[Details] Atsumaru API error:`, error);
      mangaDetailsContainer.innerHTML = `
        <div class="error">
          <p>Error loading manga details: ${error.message}</p>
        </div>
      `;
      return;
    }
  }

  // If ID is not a valid MangaDex UUID, try to find by title
  if (!isValidMangaDexId(mangaId) && titleParam) {
    console.log(
      `[Details] ID ${mangaId} is not MangaDex UUID, searching by title: ${titleParam}`,
    );
    try {
      const searchResults = await searchManga(
        decodeURIComponent(titleParam),
        5,
      );
      if (searchResults?.data?.length > 0) {
        // Find the best match: prefer manga with highest chapter count
        const bestMatch = searchResults.data.reduce((best, current) => {
          const bestChapters = parseInt(best.attributes?.lastChapter) || 0;
          const currentChapters =
            parseInt(current.attributes?.lastChapter) || 0;
          return currentChapters > bestChapters ? current : best;
        });
        console.log(
          `[Details] Found MangaDex match: ${getEnglishTitle(bestMatch)} (Ch. ${bestMatch.attributes?.lastChapter || "?"})`,
        );
        await renderMangaDexDetails(bestMatch);
        return;
      }
    } catch (error) {
      console.error(`[Details] Title search failed:`, error);
    }
  }

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

    await renderMangaDexDetails(manga);
  } catch (error) {
    console.error(`[Details] Error loading manga details:`, error);
    mangaDetailsContainer.innerHTML = `
      <div class="error">
        <p>Error loading manga details: ${error.message}</p>
      </div>
    `;
  }
}

async function renderMangaDexDetails(manga) {
  const coverArt = findRelationship(manga, "cover_art");
  const author = findRelationship(manga, "author");

  const coverUrl = coverArt
    ? getCoverUrl(manga.id, coverArt, "512")
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

  renderMangaDetailsHTML(
    title,
    coverUrl,
    author?.attributes?.name,
    manga.attributes.year,
    manga.attributes.status,
    description,
    tags,
    allTitles,
  );

  await loadChapters(allTitles);
}

async function renderAtsumaruDetails(manga) {
  console.log("[Details] Atsumaru manga object:", manga);
  console.log("[Details] manga.image:", manga.image);
  const coverUrl = manga.image || getPlaceholderImage(512, 768, "No Cover");
  console.log("[Details] coverUrl:", coverUrl);
  const title = manga.title || manga.englishTitle || "Unknown Title";
  const description = manga.description || "No description available";
  const status = manga.status || "Unknown";
  const year = null;
  const authorName = "Unknown";
  const tags =
    manga.genres
      ?.map((genre) => `<span class="status">${genre}</span>`)
      .join(" ") || "";

  const allTitles = [title, ...(manga.otherNames || [])].filter(Boolean);

  renderMangaDetailsHTML(
    title,
    coverUrl,
    authorName,
    year,
    status,
    description,
    tags,
    allTitles,
  );

  await loadChapters(allTitles);
}

function renderMangaDetailsHTML(
  title,
  coverUrl,
  authorName,
  year,
  status,
  description,
  tags,
  allTitles,
) {
  const altTitles = allTitles?.slice(1).join(", ") || "";

  mangaDetailsContainer.innerHTML = `
    <div class="manga-cover">
      <img id="mangaCoverImg" src="${coverUrl}" alt="${title}" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="console.error('[Details] Image load error:', this.src);">
      <button id="startReadingBtn" class="start-reading-btn">
        <span class="btn-text">▶ Start Reading</span>
        <span class="btn-text-mobile">▶ Read</span>
      </button>
    </div>
    <div class="manga-info">
      <h1>${title}</h1>
      ${altTitles ? `<div class="alt-titles">${truncateText(altTitles, 100)}</div>` : ""}
      <div class="status">${status || "Unknown"} · ${authorName || "Unknown Author"}</div>
      <div style="margin: 0.5rem 0;">${tags}</div>
      <div class="description">${truncateText(description, 500)}</div>
    </div>
  `;

  const img = mangaDetailsContainer.querySelector("#mangaCoverImg");
  if (img) {
    img.addEventListener("error", () => {
      img.src = getPlaceholderImage(512, 768, "No Cover");
    });
  }
}

async function loadChapters(allTitles) {
  console.log(`[Details] Loading chapters from Atsumaru for manga: ${mangaId}`);
  console.log(`[Details] atsumaruIdParam: ${atsumaruIdParam}`);
  console.log(`[Details] Trying titles:`, allTitles);
  chapterListContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading chapters from Atsumaru...</p>
    </div>
  `;

  try {
    let atsumaruMangaId = null;

    // If atsumaruIdParam is provided, use it directly (from Continue Reading)
    if (atsumaruIdParam) {
      console.log(`[Details] Using provided Atsumaru ID: ${atsumaruIdParam}`);
      atsumaruMangaId = atsumaruIdParam;
    } else {
      // Find manga on Atsumaru using title search
      let atsumaruManga = null;
      for (const title of allTitles) {
        if (!title) continue;
        atsumaruManga = await findAtsumaruManga(title);
        if (atsumaruManga) {
          console.log(`[Details] Atsumaru match: "${atsumaruManga.title}"`);
          break;
        }
      }

      if (!atsumaruManga) {
        console.log(`[Details] No Atsumaru match found for any title`);
        chapterListContainer.innerHTML = `
          <div class="empty">
            <p>No chapters available on Atsumaru</p>
          </div>
        `;
        return;
      }

      atsumaruMangaId = atsumaruManga.id;
    }

    // Get chapters from Atsumaru
    const chapters = await getAtsumaruChapters(atsumaruMangaId);
    allChapters = deduplicateChapters(chapters);
    hybridInfo = { source: "atsumaru", atsumaruId: atsumaruMangaId };

    console.log(
      `[Details] Atsumaru result: ${chapters.length} chapters found, ${allChapters.length} unique`,
    );

    if (allChapters.length === 0) {
      chapterListContainer.innerHTML = `
        <div class="empty">
          <p>No chapters available</p>
        </div>
      `;
      return;
    }

    // Apply initial sort based on currentSortOrder (default asc)
    sortChapters();
    renderChapterPage(0);
  } catch (error) {
    console.error(`[Details] Error loading chapters:`, error);
    chapterListContainer.innerHTML = `
      <div class="error">
        <p>Error loading chapters: ${error.message}</p>
      </div>
    `;
    return;
  }
}

async function renderAtsumaruOnlyDetails() {
  // For Atsumaru-only, show minimal details and load chapters directly
  mangaDetailsContainer.innerHTML = `
    <div class="manga-cover">
      <img id="mangaCoverImg" src="${getPlaceholderImage(512, 768, "No Cover")}" alt="Manga Cover" referrerpolicy="no-referrer" crossorigin="anonymous">
      <button id="startReadingBtn" class="start-reading-btn">
        <span class="btn-text">Start Reading</span>
        <span class="btn-text-mobile">Read</span>
      </button>
    </div>
    <div class="manga-info">
      <h1 class="manga-title">Manga</h1>
      <div class="manga-meta">
        <span class="status">Atsumaru Source</span>
      </div>
      <p class="manga-description">Loading from Atsumaru...</p>
    </div>
  `;

  // Try to find Atsumaru manga by ID directly
  try {
    const chapters = await getAtsumaruChapters(mangaId);
    allChapters = deduplicateChapters(chapters);
    hybridInfo = { source: "atsumaru", atsumaruId: mangaId };

    if (allChapters.length === 0) {
      chapterListContainer.innerHTML = `
        <div class="empty">
          <p>No chapters available on Atsumaru</p>
        </div>
      `;
      return;
    }

    // Apply initial sort based on currentSortOrder (default asc)
    sortChapters();
    renderChapterPage(0);
  } catch (error) {
    console.error(`[Details] Error loading Atsumaru chapters:`, error);
    chapterListContainer.innerHTML = `
      <div class="error">
        <p>Error loading chapters: ${error.message}</p>
      </div>
    `;
  }
}

async function renderChapterPage(page) {
  console.log(`[Details] Rendering chapter page ${page}`);
  currentPage = page;
  const totalPages = Math.ceil(allChapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, allChapters.length);
  const pageChapters = allChapters.slice(startIndex, endIndex);

  let html = `
    <div class="chapter-header">
      <div class="sort-controls">
        <button id="sortAscBtn" class="sort-btn ${currentSortOrder === "asc" ? "active" : ""}" title="Sort ascending (oldest first)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
          </svg>
          Ascending
        </button>
        <button id="sortDescBtn" class="sort-btn ${currentSortOrder === "desc" ? "active" : ""}" title="Sort descending (newest first)">
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
    const chapterId = chapter.id;

    html += `
      <div class="chapter-item" data-chapter-id="${chapterId}" data-source="${chapter.source}">
        <div class="chapter-info">
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
  const sortAscBtn = document.getElementById("sortAscBtn");
  const sortDescBtn = document.getElementById("sortDescBtn");

  console.log(`[Details] Sort buttons found:`, {
    sortAscBtn: !!sortAscBtn,
    sortDescBtn: !!sortDescBtn,
  });

  if (sortAscBtn) {
    sortAscBtn.addEventListener("click", () => {
      console.log(
        `[Details] Asc button clicked, current order: ${currentSortOrder}`,
      );
      if (currentSortOrder !== "asc") {
        currentSortOrder = "asc";
        sortChapters();
      }
    });
  }

  if (sortDescBtn) {
    sortDescBtn.addEventListener("click", () => {
      console.log(
        `[Details] Desc button clicked, current order: ${currentSortOrder}`,
      );
      if (currentSortOrder !== "desc") {
        currentSortOrder = "desc";
        sortChapters();
      }
    });
  }

  // Add event listener for Start Reading button
  const startReadingBtn = document.getElementById("startReadingBtn");
  if (startReadingBtn) {
    startReadingBtn.addEventListener("click", startReading);
  }

  pageChapters.forEach((chapter) => {
    const el = chapterListContainer.querySelector(
      `[data-chapter-id="${chapter.id}"]`,
    );
    el.addEventListener("click", (e) => {
      const params = new URLSearchParams({
        id: chapter.id,
        manga: mangaId,
        source: chapter.source,
      });

      // Add source-specific parameters
      if (chapter.source === "atsumaru") {
        // Use hybridInfo.atsumaruId (from loadChapters) or atsumaruIdParam (from URL)
        const atsumaruMangaId = hybridInfo?.atsumaruId || atsumaruIdParam;
        if (atsumaruMangaId) params.set("mangaId", atsumaruMangaId);
        if (chapter.chapterId) params.set("chapterId", chapter.chapterId);
      } else if (chapter.source === "mangadex") {
        if (chapter.mangadexId) params.set("mangadexId", chapter.mangadexId);
      }

      window.location.href = `reader.html?${params.toString()}`;
    });
  });
}

function deduplicateChapters(chapters) {
  const seen = new Set();
  return chapters.filter((ch) => {
    const chapterNum = ch.chapter?.toString() || "0";
    if (seen.has(chapterNum)) return false;
    seen.add(chapterNum);
    return true;
  });
}

function sortChapters() {
  console.log(`[Details] Sorting chapters: ${currentSortOrder}`);
  console.log(
    `[Details] Chapters before sort:`,
    allChapters.map((c) => ({ id: c.id, chapter: c.chapter })),
  );

  // Sort chapters based on current sort order
  allChapters.sort((a, b) => {
    const aChapter = parseFloat(a.chapter) || 0;
    const bChapter = parseFloat(b.chapter) || 0;

    if (currentSortOrder === "asc") {
      return aChapter - bChapter;
    } else {
      return bChapter - aChapter;
    }
  });

  console.log(
    `[Details] Chapters after sort:`,
    allChapters.map((c) => ({ id: c.id, chapter: c.chapter })),
  );

  // Update button active states before re-rendering
  const sortAscBtn = document.getElementById("sortAscBtn");
  const sortDescBtn = document.getElementById("sortDescBtn");

  if (sortAscBtn && sortDescBtn) {
    if (currentSortOrder === "asc") {
      sortAscBtn.classList.add("active");
      sortDescBtn.classList.remove("active");
    } else {
      sortAscBtn.classList.remove("active");
      sortDescBtn.classList.add("active");
    }
    console.log(`[Details] Button states updated:`, {
      ascActive: sortAscBtn.classList.contains("active"),
      descActive: sortDescBtn.classList.contains("active"),
    });
  }

  // Re-render from first page
  renderChapterPage(0);
}

async function startReading() {
  console.log(`[Details] Start Reading clicked`);

  // Check for reading progress in localStorage
  const progressKey = `reading_progress_${mangaId}`;
  const savedProgress = localStorage.getItem(progressKey);

  let targetChapter = null;

  if (savedProgress) {
    try {
      const progress = JSON.parse(savedProgress);
      // Find the saved chapter in the current list
      targetChapter = allChapters.find(
        (ch) =>
          ch.id === progress.chapterId ||
          (ch.source === "atsumaru" && ch.chapterId === progress.chapterId) ||
          (ch.source === "mangadex" && ch.mangadexId === progress.mangadexId),
      );

      if (targetChapter) {
        console.log(
          `[Details] Found saved progress: Chapter ${targetChapter.chapter}`,
        );
      }
    } catch (error) {
      console.error("[Details] Error parsing saved progress:", error);
    }
  }

  // If no saved progress, use the first chapter from the sorted list
  if (!targetChapter && allChapters.length > 0) {
    targetChapter = allChapters[0];
    console.log(
      `[Details] No saved progress, using first chapter: Chapter ${targetChapter.chapter}`,
    );
  }

  if (!targetChapter) {
    console.error("[Details] No chapters available for reading");
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
    // Use hybridInfo.atsumaruId (from loadChapters) or atsumaruIdParam (from URL)
    const atsumaruMangaId = hybridInfo?.atsumaruId || atsumaruIdParam;
    if (atsumaruMangaId) params.set("mangaId", atsumaruMangaId);
    if (targetChapter.chapterId)
      params.set("chapterId", targetChapter.chapterId);
  } else if (targetChapter.source === "mangadex") {
    if (targetChapter.mangadexId)
      params.set("mangadexId", targetChapter.mangadexId);
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

// Expose function for pagination buttons
window.goToChapterPage = (page) => {
  if (page >= 0 && page < Math.ceil(allChapters.length / chaptersPerPage)) {
    renderChapterPage(page);
    // Scroll to chapter list
    chapterListContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

// Load manga details
loadMangaDetails();
