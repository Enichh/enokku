import {
  fetchTopTrending,
  fetchTopManga,
  fetchTopManwha,
  fetchRecentlyUpdated,
  fetchMostFollowedManga,
  fetchMostFollowedManwha,
  searchManga,
  getCoverUrl,
  findRelationship,
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
const mostFollowedMangaRow = document.getElementById("mostFollowedMangaRow");
const mostFollowedManwhaRow = document.getElementById("mostFollowedManwhaRow");
const searchResultsSection = document.getElementById("searchResultsSection");
const searchResultsRow = document.getElementById("searchResultsRow");
const searchInput = document.getElementById("searchInput");
const homeSections = document.getElementById("homeSections");

function renderMangaCard(manga) {
  const coverArt = findRelationship(manga, "cover_art");
  const coverUrl = coverArt
    ? getCoverUrl(manga.id, coverArt, "256")
    : getPlaceholderImage(256, 384, "No Cover");

  const title =
    manga.attributes.title?.en ||
    Object.values(manga.attributes.title)[0] ||
    "Unknown Title";

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

loadAllSections();
