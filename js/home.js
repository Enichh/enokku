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
    <img src="${coverUrl}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">
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

function showRowLoading(rowElement) {
  rowElement.innerHTML = `
    <div class="loading-small">
      <div class="spinner-small"></div>
    </div>
  `;
}

function showRowError(rowElement, message) {
  rowElement.innerHTML = `<div class="error-small">${message}</div>`;
}

async function loadSection(fetchFn, rowElement, sectionName) {
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

loadAllSections();
