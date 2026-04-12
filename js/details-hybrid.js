import {
  fetchMangaDetails,
  fetchMangaFeed,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
  searchManga,
} from "./api.js";
import {
  getChaptersHybrid,
  findAtsumaruManga,
  getAtsumaruChapters,
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
import {
  cacheMangaMetadata,
  getCachedMangaMetadata,
  isOnline,
  isChapterCached,
  preloadChapter,
  getOfflineChapterCount,
  MAX_CACHED_CHAPTERS,
} from "./offline-manager.js";

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
let downloadAllInProgress = false;
let pendingDownloads = new Set();

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

  // Check if offline and try to load from cache
  if (!isOnline()) {
    console.log("[Details] Offline - attempting to load from cache");
    const cachedMetadata = await getCachedMangaMetadata(mangaId);

    if (cachedMetadata) {
      console.log(
        `[Details] Using cached metadata for: ${cachedMetadata.title}`,
      );
      renderMangaDetailsHTML(
        cachedMetadata.title,
        cachedMetadata.coverUrl || getPlaceholderImage(512, 768, "No Cover"),
        null, // author not cached
        null, // year not cached
        "Cached", // status
        cachedMetadata.description || "No description available (offline)",
        "", // tags not cached
        [],
      );

      // Render cached chapters if available
      if (cachedMetadata.chapterList && cachedMetadata.chapterList.length > 0) {
        renderCachedChapters(cachedMetadata.chapterList);
      } else {
        chapterListContainer.innerHTML = `
          <div class="empty">
            <p>You're offline. Chapters you've previously loaded are available in the reader.</p>
          </div>
        `;
      }
      return;
    }

    mangaDetailsContainer.innerHTML = `
      <div class="error">
        <p>Manga details not available offline. Please connect to the internet.</p>
      </div>
    `;
    return;
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

  // Cache manga metadata for offline access
  cacheMangaMetadata(manga.id, {
    title,
    coverUrl,
    description,
    chapterList: [], // Will be populated after loading chapters
  }).catch((err) => {
    console.log("[Details] Metadata caching failed (non-critical):", err);
  });

  await loadChapters(allTitles);
}

function renderCachedChapters(cachedChapters) {
  console.log(`[Details] Rendering ${cachedChapters.length} cached chapters`);

  let html = `
    <div class="chapter-header">
      <div class="offline-indicator">
        <span class="offline-icon">You're offline</span>
      </div>
      <span id="chapterCount" class="chapter-count">${cachedChapters.length} cached chapters</span>
    </div>
    <h2>Chapters (Cached)</h2>
    <div class="chapter-items">
  `;

  cachedChapters.forEach((chapter) => {
    const chapterNum = chapter.number || chapter.chapter || "?";
    const chapterTitle = chapter.title || "";

    html += `
      <div class="chapter-item cached-chapter" 
           data-chapter-id="${chapter.id}" 
           data-source="${chapter.source}">
        <div>
          <div class="chapter-title">
            Chapter ${chapterNum}${chapterTitle ? ` - ${chapterTitle}` : ""}
          </div>
          <div class="chapter-source">${chapter.source}</div>
        </div>
      </div>
    `;
  });

  html += "</div>";

  chapterListContainer.innerHTML = html;

  // Add event listeners for cached chapters
  cachedChapters.forEach((chapter) => {
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
        if (chapter.chapterId) params.set("chapterId", chapter.chapterId);
      }

      window.location.href = `reader.html?${params.toString()}`;
    });
  });
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
      <img id="mangaCoverImg" src="${coverUrl}" alt="${title}" referrerpolicy="no-referrer" crossorigin="anonymous">
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

    // Show download all container when chapters are loaded
    const downloadContainer = document.querySelector(".download-all-container");
    if (downloadContainer) {
      downloadContainer.style.display = "block";
      console.log("[Details] Download container shown");
    }

    // Cache the chapter list for offline access
    await cacheMangaMetadata(mangaId, {
      title: document.querySelector("h1")?.textContent || "Unknown",
      coverUrl: document.querySelector("#mangaCoverImg")?.src,
      description: document.querySelector(".description")?.textContent,
      chapterList: allChapters.map((ch) => ({
        id: ch.id,
        number: ch.chapter,
        title: ch.title,
        source: ch.source,
        chapterId: ch.chapterId, // for Atsumaru
      })),
    }).catch((err) => {
      console.log("[Details] Chapter list caching failed (non-critical):", err);
    });
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
  // Check if offline and try to load from cache
  if (!isOnline()) {
    console.log(
      "[Details] Offline - attempting to load Atsumaru-only from cache",
    );
    const cachedMetadata = await getCachedMangaMetadata(mangaId);

    if (cachedMetadata) {
      console.log(
        `[Details] Using cached Atsumaru metadata for: ${cachedMetadata.title}`,
      );
      renderMangaDetailsHTML(
        cachedMetadata.title || "Manga",
        cachedMetadata.coverUrl || getPlaceholderImage(512, 768, "No Cover"),
        null, // author not cached
        null, // year not cached
        "Cached (Atsumaru)", // status
        cachedMetadata.description || "No description available (offline)",
        "", // tags not cached
        [],
      );

      // Render cached chapters if available
      if (cachedMetadata.chapterList && cachedMetadata.chapterList.length > 0) {
        renderCachedChapters(cachedMetadata.chapterList);
      } else {
        chapterListContainer.innerHTML = `
          <div class="empty">
            <p>You're offline. No cached chapters available for this Atsumaru manga.</p>
          </div>
        `;
      }
      return;
    }

    mangaDetailsContainer.innerHTML = `
      <div class="error">
        <p>Atsumaru manga details not available offline. Please connect to the internet.</p>
      </div>
    `;
    return;
  }

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

    // Cache the chapter list for offline access
    await cacheMangaMetadata(mangaId, {
      title: "Manga",
      coverUrl: getPlaceholderImage(512, 768, "No Cover"),
      description: "Atsumaru manga",
      chapterList: allChapters.map((ch) => ({
        id: ch.id,
        number: ch.chapter,
        title: ch.title,
        source: ch.source,
        chapterId: ch.chapterId, // for Atsumaru
      })),
    }).catch((err) => {
      console.log(
        "[Details] Atsumaru chapter list caching failed (non-critical):",
        err,
      );
    });
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
        <div class="chapter-actions">
          <button class="btn-download-chapter" data-chapter-id="${chapterId}" data-chapter-number="${chapterNum}">
            <span class="download-icon"></span>
            <span class="download-text">Download</span>
          </button>
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
    el.addEventListener("click", () => {
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

  // Update download button states
  await updateChapterDownloadStatus();
}

async function updateChapterDownloadStatus() {
  const chapterItems = document.querySelectorAll(".chapter-item");
  for (const item of chapterItems) {
    const chapterId = item.dataset.chapterId;
    const btn = item.querySelector(".btn-download-chapter");
    if (!btn) continue;

    const isCached = await isChapterCached(chapterId);
    if (isCached) {
      btn.classList.add("downloaded");
      btn.querySelector(".download-text").textContent = "Downloaded";
      btn.disabled = true;
    } else {
      // Reset in case it was previously marked downloading
      btn.classList.remove("downloaded", "downloading");
      btn.querySelector(".download-text").textContent = "Download";
      btn.disabled = false;
    }
  }
}

function getChapterDataFromList(chapterId) {
  return allChapters.find((ch) => ch.id === chapterId);
}

// Add event listener for download buttons
chapterListContainer.addEventListener("click", async (e) => {
  const downloadBtn = e.target.closest(".btn-download-chapter");
  if (!downloadBtn) return;

  e.stopPropagation(); // Prevent navigating to reader

  const chapterId = downloadBtn.dataset.chapterId;
  const chapterNumber = downloadBtn.dataset.chapterNumber;
  const chapterData = getChapterDataFromList(chapterId);

  if (!chapterData) {
    console.error("Chapter not found");
    return;
  }

  if (
    downloadBtn.classList.contains("downloaded") ||
    downloadBtn.classList.contains("downloading")
  ) {
    return;
  }

  // Mark as downloading
  downloadBtn.classList.add("downloading");
  downloadBtn.querySelector(".download-text").textContent = "Downloading...";
  downloadBtn.disabled = true;

  try {
    const { getChapterPagesHybrid } = await import("./hybrid-api.js");
    const pageUrls = await getChapterPagesHybrid({
      source: chapterData.source,
      mangadexId:
        chapterData.source === "mangadex"
          ? chapterData.mangadexId || chapterData.id
          : null,
      mangaId: hybridInfo?.atsumaruId || atsumaruIdParam,
      chapterId:
        chapterData.source === "atsumaru"
          ? chapterData.chapterId || chapterData.id.replace("atsu-", "")
          : null,
    });

    const processedUrls =
      chapterData.source === "atsumaru"
        ? pageUrls.map(
            (url) => `/api/proxy?imageUrl=${encodeURIComponent(url)}`,
          )
        : pageUrls;

    const success = await preloadChapter(chapterId, mangaId, processedUrls, {
      chapterNumber: chapterData.chapter,
      chapterTitle: chapterData.title,
    });

    if (success) {
      downloadBtn.classList.remove("downloading");
      downloadBtn.classList.add("downloaded");
      downloadBtn.querySelector(".download-text").textContent = "Downloaded";
    } else {
      throw new Error("Download failed");
    }
  } catch (error) {
    console.error("Download error:", error);
    downloadBtn.classList.remove("downloading");
    downloadBtn.querySelector(".download-text").textContent = "Retry";
    downloadBtn.disabled = false;
  }
});

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

  // If offline, check if we have cached chapters
  if (!isOnline()) {
    const cachedMetadata = await getCachedMangaMetadata(mangaId);
    if (
      !cachedMetadata ||
      !cachedMetadata.chapterList ||
      cachedMetadata.chapterList.length === 0
    ) {
      console.error(
        "[Details] No cached chapters available for offline reading",
      );
      mangaDetailsContainer.innerHTML = `
        <div class="error">
          <p>No cached chapters available for offline reading. Please connect to the internet to download chapters.</p>
        </div>
      `;
      return;
    }

    // For offline mode, find the first cached chapter or use saved progress
    const progressKey = `reading_progress_${mangaId}`;
    const savedProgress = localStorage.getItem(progressKey);
    let targetChapter = null;

    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);
        targetChapter = cachedMetadata.chapterList.find(
          (ch) =>
            ch.id === progress.chapterId ||
            (ch.source === "atsumaru" && ch.chapterId === progress.chapterId) ||
            (ch.source === "mangadex" && ch.mangadexId === progress.mangadexId),
        );
      } catch (error) {
        console.error("[Details] Error parsing saved progress:", error);
      }
    }

    if (!targetChapter) {
      targetChapter = cachedMetadata.chapterList[0];
    }

    if (!targetChapter) {
      console.error("[Details] No cached chapters available");
      return;
    }

    // Check if the specific chapter is cached
    const isChapterAvailable = await isChapterCached(targetChapter.id);
    if (!isChapterAvailable) {
      console.error(
        "[Details] Selected chapter is not cached for offline reading",
      );
      mangaDetailsContainer.innerHTML = `
        <div class="error">
          <p>This chapter is not available offline. Please connect to the internet to download it.</p>
        </div>
      `;
      return;
    }

    // Navigate to the reader
    const params = new URLSearchParams({
      id: targetChapter.id,
      manga: mangaId,
      source: targetChapter.source,
    });

    if (targetChapter.source === "atsumaru" && targetChapter.chapterId) {
      params.set("chapterId", targetChapter.chapterId);
    }

    window.location.href = `reader.html?${params.toString()}`;
    return;
  }

  // Online mode - proceed with normal flow
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

// Download All functionality
const downloadAllBtn = document.getElementById("downloadAllChaptersBtn");
console.log("[Details] Download button found:", downloadAllBtn);
if (downloadAllBtn) {
  console.log("[Details] Attaching click listener to download button");
  downloadAllBtn.addEventListener("click", async (e) => {
    console.log("[Details] Download All button clicked");
    e.preventDefault();
    e.stopPropagation();
    if (downloadAllInProgress) {
      console.log("[Details] Download already in progress, ignoring click");
      return;
    }

    // Check storage limit
    const currentCount = await getOfflineChapterCount();
    const chaptersToDownload = allChapters.filter((ch) => {
      // Skip already cached chapters
      const btn = document.querySelector(
        `.btn-download-chapter[data-chapter-id="${ch.id}"]`,
      );
      return btn && !btn.classList.contains("downloaded");
    });

    if (chaptersToDownload.length === 0) {
      document.getElementById("downloadAllStatus").textContent =
        "All chapters already downloaded!";
      return;
    }

    if (currentCount + chaptersToDownload.length > MAX_CACHED_CHAPTERS) {
      const proceed = confirm(
        `Downloading ${chaptersToDownload.length} chapters will exceed the ${MAX_CACHED_CHAPTERS}-chapter cache limit. ` +
          `The oldest downloaded chapters will be automatically removed. Continue?`,
      );
      if (!proceed) return;
    }

    downloadAllInProgress = true;
    const statusEl = document.getElementById("downloadAllStatus");
    const container = document.querySelector(".download-all-container");
    if (container) container.style.display = "block";

    // beforeunload warning
    const beforeUnloadHandler = (e) => {
      if (downloadAllInProgress) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);

    let completed = 0;
    for (const chapter of chaptersToDownload) {
      const btn = document.querySelector(
        `.btn-download-chapter[data-chapter-id="${chapter.id}"]`,
      );
      if (btn) {
        statusEl.textContent = `Downloading ${completed + 1}/${chaptersToDownload.length} - Chapter ${chapter.chapter || "?"}`;
        btn.click(); // Trigger individual download
        // Wait for download to complete
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (
              btn.classList.contains("downloaded") ||
              btn.classList.contains("downloading") === false
            ) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 200);
        });
        completed++;
      }
      // Delay between chapters
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    downloadAllInProgress = false;
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    statusEl.textContent = "All downloads completed!";
    setTimeout(() => (statusEl.textContent = ""), 3000);
  });
}

loadMangaDetails();
