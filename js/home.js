import {
  fetchTopTrending,
  fetchTopManga,
  fetchTopManwha,
  fetchRecentlyUpdated,
  fetchRecentlyAdded,
  fetchMostFollowedManga,
  fetchMostFollowedManwha,
  searchManga,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
} from "./api.js";
import {
  debounce,
  showLoading,
  showError,
  getPlaceholderImage,
} from "./utils.js";
import { getReadingHistory, clearHistory } from "./reading-history.js";

const trendingRow = document.getElementById("trendingRow");
const topMangaRow = document.getElementById("topMangaRow");
const topManwhaRow = document.getElementById("topManwhaRow");
const recentlyUpdatedRow = document.getElementById("recentlyUpdatedRow");
const recentlyAddedRow = document.getElementById("recentlyAddedRow");
const mostFollowedMangaRow = document.getElementById("mostFollowedMangaRow");
const mostFollowedManwhaRow = document.getElementById("mostFollowedManwhaRow");
const searchResultsSection = document.getElementById("searchResultsSection");
const searchResultsRow = document.getElementById("searchResultsRow");
const searchInput = document.getElementById("searchInput");
const homeSections = document.getElementById("homeSections");
const mobileMenuToggle = document.getElementById("mobileMenuToggle");
const navLinks = document.getElementById("navLinks");
const continueReadingSection = document.getElementById(
  "continueReadingSection",
);
const continueReadingRow = document.getElementById("continueReadingRow");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const mangaSections = [
  {
    row: mostFollowedMangaRow,
    section: mostFollowedMangaRow?.closest("section"),
  },
  { row: topMangaRow, section: topMangaRow?.closest("section") },
];

const manhwaSections = [
  {
    row: mostFollowedManwhaRow,
    section: mostFollowedManwhaRow?.closest("section"),
  },
  { row: topManwhaRow, section: topManwhaRow?.closest("section") },
];

const mixedSections = [
  { row: trendingRow, section: trendingRow?.closest("section") },
  { row: recentlyUpdatedRow, section: recentlyUpdatedRow?.closest("section") },
  { row: recentlyAddedRow, section: recentlyAddedRow?.closest("section") },
];

function renderMangaCard(manga) {
  const coverArt = findRelationship(manga, "cover_art");
  const coverUrl = coverArt
    ? getCoverUrl(manga.id, coverArt, "256")
    : getPlaceholderImage(256, 384, "No Cover");

  const title = getEnglishTitle(manga);

  const card = document.createElement("div");
  card.className = "manga-card";
  card.innerHTML = `
    <img src="${coverUrl}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
    <div class="info">
      <div class="title">${title}</div>
      <div class="meta">${manga.attributes.year || "N/A"} · ${manga.attributes.status || "Unknown"}</div>
    </div>
  `;

  const img = card.querySelector("img");
  img.addEventListener("error", () => {
    img.src = getPlaceholderImage(256, 384, "No Cover");
  });

  card.addEventListener("click", () => {
    window.location.href = `manga.html?id=${manga.id}`;
  });

  return card;
}

function renderHistoryCard(entry) {
  const card = document.createElement("div");
  card.className = "manga-card history-card";
  card.innerHTML = `
    <img src="${entry.coverUrl}" alt="${entry.mangaTitle}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous">
    <div class="info">
      <div class="title">${entry.mangaTitle}</div>
      <div class="meta">${entry.scrollPercent}% • Ch. ${entry.chapterNumber}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${entry.scrollPercent}%"></div>
      </div>
    </div>
  `;

  const img = card.querySelector("img");
  img.addEventListener("error", () => {
    img.src = getPlaceholderImage(256, 384, "No Cover");
  });

  card.addEventListener("click", () => {
    const mangaId = entry.mangaId;
    const chapterId = entry.chapterId;
    // After migration, always use MangaDex ID for navigation
    window.location.href = `reader.html?id=${chapterId}&manga=${mangaId}&source=mangadex`;
  });

  return card;
}

async function migrateOldHistoryEntry(entry) {
  // Check if entry has Atsumaru short ID instead of MangaDex UUID
  const isValidUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      entry.mangaId,
    );

  if (!isValidUUID && entry.source === "atsumaru" && entry.mangaTitle) {
    console.log(
      `[Home] Migrating old entry: ${entry.mangaTitle} (ID: ${entry.mangaId})`,
    );
    try {
      const searchResults = await searchManga(entry.mangaTitle, 5);
      if (searchResults?.data?.length > 0) {
        // Find best match by chapter count
        const bestMatch = searchResults.data.reduce((best, current) => {
          const bestChapters = parseInt(best.attributes?.lastChapter) || 0;
          const currentChapters =
            parseInt(current.attributes?.lastChapter) || 0;
          return currentChapters > bestChapters ? current : best;
        });

        // Update entry with canonical MangaDex UUID
        entry.mangaId = bestMatch.id;

        // Update cover to MangaDex cover (proxied)
        const coverArt = findRelationship(bestMatch, "cover_art");
        if (coverArt) {
          entry.coverUrl = getCoverUrl(bestMatch.id, coverArt, "256");
        }

        console.log(`[Home] Migrated to MangaDex ID: ${bestMatch.id}`);
        return entry;
      } else {
        // No MangaDex match found, remove entry from history
        console.log(`[Home] No MangaDex match, removing Atsumaru-only entry`);
        return null; // Return null to filter out
      }
    } catch (error) {
      console.error(`[Home] Failed to migrate entry:`, error);
      return null; // Remove on error
    }
  }
  return entry;
}

async function loadContinueReading() {
  if (!continueReadingRow) return;

  let history = getReadingHistory();

  if (history.length === 0) {
    continueReadingSection?.classList.add("hidden");
    return;
  }

  // Migrate old entries with Atsumaru IDs in parallel
  const migratedHistory = await Promise.all(
    history.map((entry) => migrateOldHistoryEntry(entry)),
  );

  // Filter out null entries (Atsumaru-only manga with no MangaDex match)
  const filteredHistory = migratedHistory.filter((entry) => entry !== null);

  // Save filtered entries back to localStorage if any changed
  const hasChanges =
    filteredHistory.length !== history.length ||
    filteredHistory.some(
      (entry, index) =>
        entry.mangaId !== history[index].mangaId ||
        entry.coverUrl !== history[index].coverUrl,
    );

  if (hasChanges) {
    localStorage.setItem("reading_history", JSON.stringify(filteredHistory));
    console.log("[Home] Saved filtered reading history");
  }

  if (filteredHistory.length === 0) {
    continueReadingSection?.classList.add("hidden");
    return;
  }

  continueReadingRow.innerHTML = "";
  filteredHistory.forEach((entry) => {
    continueReadingRow.appendChild(renderHistoryCard(entry));
  });

  continueReadingSection?.classList.remove("hidden");
}

function handleClearHistory() {
  if (confirm("Clear all reading history? This cannot be undone.")) {
    clearHistory();
    continueReadingSection?.classList.add("hidden");
    if (continueReadingRow) continueReadingRow.innerHTML = "";
  }
}

function showRowLoading(rowElement) {
  if (!rowElement) return;
  rowElement.innerHTML = `
    <div class="loading-small">
      <div class="spinner-small"></div>
    </div>
  `;
}

function showRowError(rowElement, message) {
  if (!rowElement) return;
  rowElement.innerHTML = `<div class="error-small">${message}</div>`;
}

async function loadSection(fetchFn, rowElement, sectionName) {
  if (!rowElement) return;

  showRowLoading(rowElement);

  try {
    const data = await fetchFn(12);

    rowElement.innerHTML = "";

    if (!data.data || data.data.length === 0) {
      rowElement.innerHTML = `<div class="empty-small">No ${sectionName} found</div>`;
      return;
    }

    data.data.forEach((manga) => {
      rowElement.appendChild(renderMangaCard(manga));
    });
  } catch (error) {
    showRowError(rowElement, `Error: ${error.message}`);
  }
}

async function loadAllSections() {
  await Promise.all([
    loadSection(fetchTopTrending, trendingRow, "trending manga"),
    loadSection(fetchTopManga, topMangaRow, "top manga"),
    loadSection(fetchTopManwha, topManwhaRow, "top manwha"),
    loadSection(fetchRecentlyUpdated, recentlyUpdatedRow, "recently updated"),
    loadSection(fetchRecentlyAdded, recentlyAddedRow, "recently added"),
    loadSection(
      fetchMostFollowedManga,
      mostFollowedMangaRow,
      "most followed manga",
    ),
    loadSection(
      fetchMostFollowedManwha,
      mostFollowedManwhaRow,
      "most followed manwha",
    ),
  ]);
}

async function performSearch(query) {
  if (!query.trim()) {
    searchResultsSection.classList.add("hidden");
    homeSections.classList.remove("hidden");
    return;
  }

  searchResultsSection.classList.remove("hidden");
  homeSections.classList.add("hidden");
  showRowLoading(searchResultsRow);

  try {
    const data = await searchManga(query, 20);

    searchResultsRow.innerHTML = "";

    if (!data.data || data.data.length === 0) {
      searchResultsRow.innerHTML =
        '<div class="empty-small">No manga found</div>';
      return;
    }

    data.data.forEach((manga) => {
      searchResultsRow.appendChild(renderMangaCard(manga));
    });
  } catch (error) {
    showRowError(searchResultsRow, `Error: ${error.message}`);
  }
}

const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300);

searchInput?.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

function filterSections(filter) {
  mangaSections.forEach(({ section }) => {
    if (section) {
      section.style.display = filter === "manhwa" ? "none" : "";
    }
  });
  manhwaSections.forEach(({ section }) => {
    if (section) {
      section.style.display = filter === "manga" ? "none" : "";
    }
  });
  mixedSections.forEach(({ section }) => {
    if (section) {
      section.style.display = filter === "all" ? "" : "none";
    }
  });

  // Handle two-column layout - make single column when filtering
  const twoColumnContainers = document.querySelectorAll(".two-column-sections");
  twoColumnContainers.forEach((container) => {
    if (filter === "all") {
      container.style.gridTemplateColumns = "1fr 1fr";
    } else {
      container.style.gridTemplateColumns = "1fr";
    }
  });
}

const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;
    filterSections(target);
  });
});

// Mobile menu toggle
mobileMenuToggle?.addEventListener("click", () => {
  navLinks?.classList.toggle("active");
  mobileMenuToggle?.classList.toggle("active");
});

// Continue reading
clearHistoryBtn?.addEventListener("click", handleClearHistory);
loadContinueReading();

loadAllSections().catch((error) => {
  console.error("[home] Failed to load sections:", error);
});
