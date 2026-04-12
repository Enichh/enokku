import {
  MANGADEX_TAGS,
  TAG_DISPLAY_NAMES,
  GENRE_CATEGORIES,
  CONTENT_TYPES,
  CONTENT_TYPE_LANGUAGES,
  PUBLICATION_STATUS,
  SORT_OPTIONS,
  SORT_API_PARAMS,
  CONTENT_RATINGS,
} from "./tag-map.js";

import { getCoverUrl, findRelationship, getEnglishTitle } from "./api.js";
import { getPlaceholderImage, debounce } from "./utils.js";

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
  query: "",
  contentType: CONTENT_TYPES.ALL,
  genres: [],
  excludedGenres: [],
  year: null,
  status: [],
  contentRating: [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE],
  sortBy: SORT_OPTIONS.RELEVANCE,
  isExcludeMode: false,
};

const pagination = {
  limit: 30,
  offset: 0,
  total: 0,
  hasMore: true,
  isLoading: false,
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  activeFilters: document.getElementById("activeFilters"),
  resultsCount: document.getElementById("resultsCount"),
  resultsGrid: document.getElementById("resultsGrid"),
  loadingState: document.getElementById("loadingState"),
  emptyState: document.getElementById("emptyState"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  filterSidebar: document.getElementById("filterSidebar"),
  mobileFilterToggle: document.getElementById("mobileFilterToggle"),
  filterCloseBtn: document.getElementById("filterCloseBtn"),
};

// ============================================
// INITIALIZATION
// ============================================
export function initSearch() {
  // Ensure filter starts closed
  closeMobileFilters();

  loadFiltersFromURL();
  setupEventListeners();
  renderFilterUI();
  updateActiveFiltersPills();

  // Load initial data
  fetchResults();
}

function setupEventListeners() {
  // Search input with debounce
  const debouncedSearch = debounce((value) => {
    state.query = value;
    resetPagination();
    updateURL();
    fetchResults();
  }, 300);

  elements.searchInput?.addEventListener("input", (e) => {
    debouncedSearch(e.target.value.trim());
  });

  // Sort dropdown
  elements.sortSelect?.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    resetPagination();
    updateURL();
    fetchResults();
  });

  // Load more button
  elements.loadMoreBtn?.addEventListener("click", () => {
    if (!pagination.isLoading && pagination.hasMore) {
      fetchResults(true);
    }
  });

  // Mobile filter toggle
  elements.mobileFilterToggle?.addEventListener("click", () => {
    elements.filterSidebar?.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  // Filter close button
  elements.filterCloseBtn?.addEventListener("click", () => {
    closeMobileFilters();
  });

  // Infinite scroll
  setupInfiniteScroll();
}

function closeMobileFilters() {
  elements.filterSidebar?.classList.remove("active");
  if (document.body) {
    document.body.style.overflow = "";
  }
}

// ============================================
// URL MANAGEMENT
// ============================================
function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);

  state.query = params.get("q") || "";
  state.contentType = params.get("type") || CONTENT_TYPES.ALL;
  state.sortBy = params.get("sort") || SORT_OPTIONS.RELEVANCE;

  // Parse arrays from URL
  const genresParam = params.get("genres");
  state.genres = genresParam ? genresParam.split(",") : [];

  const excludedParam = params.get("excluded");
  state.excludedGenres = excludedParam ? excludedParam.split(",") : [];

  const statusParam = params.get("status");
  state.status = statusParam ? statusParam.split(",") : [];

  const ratingParam = params.get("rating");
  state.contentRating = ratingParam
    ? ratingParam.split(",")
    : [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE];

  state.year = params.get("year") ? parseInt(params.get("year")) : null;

  // Update UI inputs
  if (elements.searchInput) {
    elements.searchInput.value = state.query;
  }
  if (elements.sortSelect) {
    elements.sortSelect.value = state.sortBy;
  }
}

function updateURL() {
  const params = new URLSearchParams();

  if (state.query) params.set("q", state.query);
  if (state.contentType !== CONTENT_TYPES.ALL)
    params.set("type", state.contentType);
  if (state.sortBy !== SORT_OPTIONS.RELEVANCE) params.set("sort", state.sortBy);
  if (state.genres.length > 0) params.set("genres", state.genres.join(","));
  if (state.excludedGenres.length > 0)
    params.set("excluded", state.excludedGenres.join(","));
  if (state.status.length > 0) params.set("status", state.status.join(","));
  if (state.year) params.set("year", state.year.toString());

  // Always include content rating unless it's the default
  const defaultRating = [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE];
  if (JSON.stringify(state.contentRating) !== JSON.stringify(defaultRating)) {
    params.set("rating", state.contentRating.join(","));
  }

  const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
  window.history.replaceState({}, "", newUrl);
}

// ============================================
// API INTEGRATION
// ============================================
function buildApiParams() {
  const params = new URLSearchParams();

  // Basic params
  params.set("limit", pagination.limit.toString());
  params.set("offset", pagination.offset.toString());

  // Search query
  if (state.query) {
    params.set("title", state.query);
  }

  // Content type (originalLanguage)
  if (state.contentType !== CONTENT_TYPES.ALL) {
    const languages = CONTENT_TYPE_LANGUAGES[state.contentType];
    languages?.forEach((lang) => params.append("originalLanguage[]", lang));
  }

  // Included genres
  state.genres.forEach((genreId) => {
    params.append("includedTags[]", genreId);
  });

  // Excluded genres
  state.excludedGenres.forEach((genreId) => {
    params.append("excludedTags[]", genreId);
  });

  // Year
  if (state.year) {
    params.set("year", state.year.toString());
  }

  // Status
  state.status.forEach((s) => {
    params.append("status[]", s);
  });

  // Content rating
  state.contentRating.forEach((rating) => {
    params.append("contentRating[]", rating);
  });

  // Sorting
  const sortParams = SORT_API_PARAMS[state.sortBy];
  Object.entries(sortParams).forEach(([key, value]) => {
    params.set(`order[${key}]`, value);
  });

  // Always include cover art
  params.append("includes[]", "cover_art");

  return params;
}

async function fetchResults(append = false) {
  if (pagination.isLoading) return;

  pagination.isLoading = true;
  showLoading(append);

  try {
    const params = buildApiParams();
    // console.log("[Search] Fetching with params:", params.toString());

    const response = await fetch(`/api/manga?${params.toString()}`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();

    pagination.total = data.total || 0;
    pagination.hasMore = data.data?.length === pagination.limit;
    pagination.offset += data.data?.length || 0;

    updateResultsCount();

    if (data.data?.length === 0 && !append) {
      showEmpty();
    } else {
      hideEmpty();
      renderResults(data.data, append);
    }

    updateLoadMoreButton();
  } catch (error) {
    console.error("[Search] Results fetch error:", error);
    if (!append) {
      showEmpty();
    }
  } finally {
    pagination.isLoading = false;
    hideLoading();
  }
}

// ============================================
// RENDERING
// ============================================
function renderResults(mangaList, append = false) {
  if (!elements.resultsGrid) return;

  const cardsHtml = mangaList
    .map((manga, index) => {
      const coverArt = findRelationship(manga, "cover_art");
      const coverUrl = coverArt
        ? getCoverUrl(manga.id, coverArt, "256")
        : getPlaceholderImage(256, 384, "No Cover");

      const title = getEnglishTitle(manga);
      const status = manga.attributes.status || "Unknown";

      // Determine badge
      let badge = "";
      const lang = manga.attributes.originalLanguage;
      if (lang === "ko") badge = '<span class="manga-card-badge">Manhwa</span>';
      else if (lang === "zh")
        badge = '<span class="manga-card-badge">Manhua</span>';

      return `
        <div class="manga-card" data-manga-id="${manga.id}" style="animation-delay: ${index * 50}ms">
          <div class="manga-card-cover">
            <img src="${coverUrl}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='${getPlaceholderImage(256, 384, "No Cover")}'">
            <div class="manga-card-overlay"></div>
            ${badge}
          </div>
          <div class="manga-card-content">
            <h4 class="manga-card-title">${title}</h4>
            <div class="manga-card-meta">${status}</div>
          </div>
        </div>
      `;
    })
    .join("");

  if (append) {
    elements.resultsGrid.insertAdjacentHTML("beforeend", cardsHtml);
  } else {
    elements.resultsGrid.innerHTML = cardsHtml;
  }

  // Add click handlers
  elements.resultsGrid.querySelectorAll(".manga-card").forEach((card) => {
    card.addEventListener("click", () => {
      const mangaId = card.dataset.mangaId;
      window.location.href = `manga.html?id=${mangaId}`;
    });
  });

  // Trigger animations
  setupIntersectionObserver();
}

// ============================================
// FILTER UI RENDERING
// ============================================
function renderFilterUI() {
  renderContentTypeTabs();
  renderGenreChips();
  renderYearOptions();
  renderStatusOptions();
  renderContentRatingOptions();
  renderExcludeModeToggle();
}

function renderContentTypeTabs() {
  const container = document.getElementById("contentTypeTabs");
  if (!container) return;

  const types = [
    { id: CONTENT_TYPES.ALL, label: "All" },
    { id: CONTENT_TYPES.MANGA, label: "Manga" },
    { id: CONTENT_TYPES.MANHWA, label: "Manhwa" },
    { id: CONTENT_TYPES.MANHUA, label: "Manhua" },
  ];

  container.innerHTML = types
    .map(
      (type) => `
      <button class="content-type-tab ${state.contentType === type.id ? "active" : ""}" 
              data-type="${type.id}">
        <span>${type.label}</span>
      </button>
    `,
    )
    .join("");

  // Add click handlers
  container.querySelectorAll(".content-type-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.contentType = tab.dataset.type;
      resetPagination();
      updateURL();
      renderContentTypeTabs();
      fetchResults();
      updateActiveFiltersPills();
    });
  });
}

function renderGenreChips() {
  const container = document.getElementById("genreChips");
  if (!container) return;

  let html = "";

  // Genres category
  html += '<div class="genre-category-title">Genres</div>';
  html += '<div class="genre-grid">';
  GENRE_CATEGORIES.GENRES.forEach((tagId) => {
    const isActive = state.genres.includes(tagId);
    const isExcluded = state.excludedGenres.includes(tagId);
    const displayName = TAG_DISPLAY_NAMES[tagId];

    html += `
      <button class="genre-chip ${isActive ? "active" : ""} ${isExcluded ? "excluded" : ""}" 
              data-genre-id="${tagId}">
        <span>${displayName}</span>
      </button>
    `;
  });
  html += "</div>";

  // Demographics category
  html += '<div class="genre-category-title">Demographics</div>';
  html += '<div class="genre-grid">';
  GENRE_CATEGORIES.DEMOGRAPHICS.forEach((tagId) => {
    const isActive = state.genres.includes(tagId);
    const isExcluded = state.excludedGenres.includes(tagId);
    const displayName = TAG_DISPLAY_NAMES[tagId];

    html += `
      <button class="genre-chip ${isActive ? "active" : ""} ${isExcluded ? "excluded" : ""}" 
              data-genre-id="${tagId}">
        <span>${displayName}</span>
      </button>
    `;
  });
  html += "</div>";

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll(".genre-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const genreId = chip.dataset.genreId;
      toggleGenre(genreId);
    });
  });
}

function renderYearOptions() {
  const container = document.getElementById("yearOptions");
  if (!container) return;

  const years = [2024, 2023, 2022, 2021, 2020, null]; // null = all years
  const labels = ["2024", "2023", "2022", "2021", "2020", "All"];

  container.innerHTML = years
    .map((year, index) => {
      const isActive =
        state.year === year || (year === null && state.year === null);
      return `
        <button class="year-chip ${isActive ? "active" : ""}" data-year="${year || ""}">
          ${labels[index]}
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".year-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const yearValue = chip.dataset.year;
      state.year = yearValue ? parseInt(yearValue) : null;
      resetPagination();
      updateURL();
      renderYearOptions();
      fetchResults();
      updateActiveFiltersPills();
    });
  });
}

function renderStatusOptions() {
  const container = document.getElementById("statusOptions");
  if (!container) return;

  const statuses = [
    { id: PUBLICATION_STATUS.ONGOING, label: "Ongoing" },
    { id: PUBLICATION_STATUS.COMPLETED, label: "Completed" },
    { id: PUBLICATION_STATUS.HIATUS, label: "Hiatus" },
    { id: PUBLICATION_STATUS.CANCELLED, label: "Cancelled" },
  ];

  container.innerHTML = statuses
    .map((status) => {
      const isActive = state.status.includes(status.id);
      return `
        <button class="status-chip ${isActive ? "active" : ""}" data-status="${status.id}">
          ${status.label}
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".status-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const statusId = chip.dataset.status;
      toggleStatus(statusId);
    });
  });
}

function renderContentRatingOptions() {
  const container = document.getElementById("contentRatingOptions");
  if (!container) return;

  const ratings = [
    { id: CONTENT_RATINGS.SAFE, label: "Safe" },
    { id: CONTENT_RATINGS.SUGGESTIVE, label: "Suggestive" },
    { id: CONTENT_RATINGS.EROTICA, label: "Erotica" },
    { id: CONTENT_RATINGS.PORNOGRAPHIC, label: "Pornographic" },
  ];

  container.innerHTML = ratings
    .map((rating) => {
      const isChecked = state.contentRating.includes(rating.id);
      return `
        <label class="rating-option">
          <div class="rating-checkbox ${isChecked ? "checked" : ""}" data-rating="${rating.id}"></div>
          <span class="rating-label">${rating.label}</span>
        </label>
      `;
    })
    .join("");

  container.querySelectorAll(".rating-option").forEach((option) => {
    option.addEventListener("click", () => {
      const checkbox = option.querySelector(".rating-checkbox");
      const ratingId = checkbox.dataset.rating;
      toggleContentRating(ratingId);
    });
  });
}

function renderExcludeModeToggle() {
  const container = document.getElementById("excludeModeToggle");
  if (!container) return;

  container.innerHTML = `
    <div class="exclude-mode-toggle ${state.isExcludeMode ? "active" : ""}">
      <input type="checkbox" id="excludeModeCheckbox" ${state.isExcludeMode ? "checked" : ""}>
      <label for="excludeModeCheckbox">Exclude Mode (Click genres to exclude)</label>
    </div>
  `;

  const checkbox = container.querySelector("#excludeModeCheckbox");
  checkbox?.addEventListener("change", (e) => {
    state.isExcludeMode = e.target.checked;
    renderExcludeModeToggle();
    renderGenreChips();
  });
}

// ============================================
// FILTER ACTIONS
// ============================================
function toggleGenre(genreId) {
  if (state.isExcludeMode) {
    // Exclude mode
    const index = state.excludedGenres.indexOf(genreId);
    if (index > -1) {
      state.excludedGenres.splice(index, 1);
    } else {
      // Remove from included if present
      const includedIndex = state.genres.indexOf(genreId);
      if (includedIndex > -1) {
        state.genres.splice(includedIndex, 1);
      }
      state.excludedGenres.push(genreId);
    }
  } else {
    // Include mode
    const index = state.genres.indexOf(genreId);
    if (index > -1) {
      state.genres.splice(index, 1);
    } else {
      // Remove from excluded if present
      const excludedIndex = state.excludedGenres.indexOf(genreId);
      if (excludedIndex > -1) {
        state.excludedGenres.splice(excludedIndex, 1);
      }
      state.genres.push(genreId);
    }
  }

  resetPagination();
  updateURL();
  renderGenreChips();
  fetchResults();
  updateActiveFiltersPills();
}

function toggleStatus(statusId) {
  const index = state.status.indexOf(statusId);
  if (index > -1) {
    state.status.splice(index, 1);
  } else {
    state.status.push(statusId);
  }

  resetPagination();
  updateURL();
  renderStatusOptions();
  fetchResults();
  updateActiveFiltersPills();
}

function toggleContentRating(ratingId) {
  const index = state.contentRating.indexOf(ratingId);
  if (index > -1) {
    state.contentRating.splice(index, 1);
  } else {
    state.contentRating.push(ratingId);
  }

  resetPagination();
  updateURL();
  renderContentRatingOptions();
  fetchResults();
  updateActiveFiltersPills();
}

// ============================================
// ACTIVE FILTERS PILLS
// ============================================
function updateActiveFiltersPills() {
  if (!elements.activeFilters) return;

  const pills = [];

  // Content type
  if (state.contentType !== CONTENT_TYPES.ALL) {
    pills.push({
      type: "type",
      value: state.contentType,
      label: state.contentType,
    });
  }

  // Genres
  state.genres.forEach((genreId) => {
    pills.push({
      type: "genre",
      value: genreId,
      label: TAG_DISPLAY_NAMES[genreId],
    });
  });

  // Excluded genres
  state.excludedGenres.forEach((genreId) => {
    pills.push({
      type: "excluded",
      value: genreId,
      label: `Not ${TAG_DISPLAY_NAMES[genreId]}`,
    });
  });

  // Year
  if (state.year) {
    pills.push({
      type: "year",
      value: state.year.toString(),
      label: state.year.toString(),
    });
  }

  // Status
  state.status.forEach((status) => {
    pills.push({ type: "status", value: status, label: status });
  });

  // Content rating (only show if different from default)
  const defaultRating = [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE];
  if (JSON.stringify(state.contentRating) !== JSON.stringify(defaultRating)) {
    pills.push({
      type: "rating",
      value: "custom",
      label: `${state.contentRating.length} ratings`,
    });
  }

  elements.activeFilters.innerHTML = pills
    .map(
      (pill) => `
      <div class="active-filter-pill" data-type="${pill.type}" data-value="${pill.value}">
        <span>${pill.label}</span>
        <span class="filter-remove">&times;</span>
      </div>
    `,
    )
    .join("");

  // Add remove handlers
  elements.activeFilters
    .querySelectorAll(".active-filter-pill")
    .forEach((pill) => {
      const removeBtn = pill.querySelector(".filter-remove");
      removeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFilter(pill.dataset.type, pill.dataset.value);
      });
    });
}

function removeFilter(type, value) {
  switch (type) {
    case "type":
      state.contentType = CONTENT_TYPES.ALL;
      renderContentTypeTabs();
      break;
    case "genre":
      state.genres = state.genres.filter((id) => id !== value);
      renderGenreChips();
      break;
    case "excluded":
      state.excludedGenres = state.excludedGenres.filter((id) => id !== value);
      renderGenreChips();
      break;
    case "year":
      state.year = null;
      renderYearOptions();
      break;
    case "status":
      state.status = state.status.filter((s) => s !== value);
      renderStatusOptions();
      break;
    case "rating":
      state.contentRating = [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE];
      renderContentRatingOptions();
      break;
  }

  resetPagination();
  updateURL();
  fetchResults();
  updateActiveFiltersPills();
}

// ============================================
// CLEAR ALL FILTERS
// ============================================
window.clearAllFilters = function () {
  state.query = "";
  state.contentType = CONTENT_TYPES.ALL;
  state.genres = [];
  state.excludedGenres = [];
  state.year = null;
  state.status = [];
  state.contentRating = [CONTENT_RATINGS.SAFE, CONTENT_RATINGS.SUGGESTIVE];
  state.sortBy = SORT_OPTIONS.RELEVANCE;
  state.isExcludeMode = false;

  // Reset UI
  if (elements.searchInput) elements.searchInput.value = "";
  if (elements.sortSelect) elements.sortSelect.value = SORT_OPTIONS.RELEVANCE;

  renderFilterUI();
  resetPagination();
  updateURL();
  fetchResults();
  updateActiveFiltersPills();
};

// ============================================
// PAGINATION & INFINITE SCROLL
// ============================================
function resetPagination() {
  pagination.offset = 0;
  pagination.hasMore = true;
}

function updateResultsCount() {
  if (!elements.resultsCount) return;

  if (pagination.total === 0) {
    elements.resultsCount.textContent = "No results found";
  } else {
    elements.resultsCount.innerHTML = `Showing <strong>${Math.min(pagination.offset, pagination.total)}</strong> of <strong>${pagination.total}</strong> manga`;
  }
}

function updateLoadMoreButton() {
  if (!elements.loadMoreBtn) return;

  elements.loadMoreBtn.disabled = !pagination.hasMore || pagination.isLoading;
  elements.loadMoreBtn.innerHTML = pagination.isLoading
    ? "<span>Loading...</span>"
    : pagination.hasMore
      ? "<span>Load More</span>"
      : "<span>No More Results</span>";
}

function setupInfiniteScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (
          entry.isIntersecting &&
          pagination.hasMore &&
          !pagination.isLoading
        ) {
          fetchResults(true);
        }
      });
    },
    { rootMargin: "200px" },
  );

  if (elements.loadMoreBtn) {
    observer.observe(elements.loadMoreBtn);
  }
}

function setupIntersectionObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "50px" },
  );

  elements.resultsGrid?.querySelectorAll(".manga-card").forEach((card) => {
    observer.observe(card);
  });
}

// ============================================
// LOADING & EMPTY STATES
// ============================================
function showLoading(append = false) {
  if (!append) {
    elements.resultsGrid.innerHTML = `
      <div class="search-loading">
        <div class="spinner"></div>
        <p>Searching manga...</p>
      </div>
    `;
  }
  updateLoadMoreButton();
}

function hideLoading() {
  const loadingEl = elements.resultsGrid?.querySelector(".search-loading");
  if (loadingEl && !pagination.offset) {
    loadingEl.remove();
  }
  updateLoadMoreButton();
}

function showEmpty() {
  elements.resultsGrid.innerHTML = `
    <div class="search-empty">
      <h3>No manga found</h3>
      <p>Try adjusting your filters or search query</p>
    </div>
  `;
  if (elements.resultsCount) {
    elements.resultsCount.textContent = "No results found";
  }
}

function hideEmpty() {
  const emptyEl = elements.resultsGrid?.querySelector(".search-empty");
  if (emptyEl) {
    emptyEl.remove();
  }
}

// ============================================
// INITIALIZE
// ============================================
initSearch();
