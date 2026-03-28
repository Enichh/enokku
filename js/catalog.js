import {
  fetchMangaList,
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

const mangaGrid = document.getElementById("mangaGrid");
const searchInput = document.getElementById("searchInput");

let currentOffset = 0;
let isLoading = false;
let lastLoadTime = 0;
const LOAD_COOLDOWN = 1000;

function renderMangaCard(manga) {
  const coverArt = findRelationship(manga, "cover_art");
  console.log(`[Cover] Manga ${manga.id}: coverArt =`, coverArt);

  const coverUrl = coverArt
    ? getCoverUrl(manga.id, coverArt, "256")
    : getPlaceholderImage(256, 384, "No Cover");
  console.log(`[Cover] Manga ${manga.id}: coverUrl =`, coverUrl);

  const title =
    manga.attributes.title?.en ||
    Object.values(manga.attributes.title)[0] ||
    "Unknown Title";

  const card = document.createElement("div");
  card.className = "manga-card";
  card.innerHTML = `
        <img src="${coverUrl}" alt="${title}" loading="lazy">
        <div class="info">
            <div class="title">${title}</div>
            <div class="meta">${manga.attributes.year || "N/A"} · ${manga.attributes.status || "Unknown"}</div>
        </div>
    `;

  const img = card.querySelector("img");
  img.addEventListener("load", () => {
    console.log(`[Cover] Loaded: ${coverUrl}`);
  });
  img.addEventListener("error", () => {
    console.error(`[Cover] Failed: ${coverUrl}, falling back to placeholder`);
    img.src = getPlaceholderImage(256, 384, "No Cover");
  });

  card.addEventListener("click", () => {
    window.location.href = `manga.html?id=${manga.id}`;
  });

  return card;
}

async function loadMangaList(searchQuery = null) {
  if (isLoading) return;
  isLoading = true;

  if (currentOffset === 0) {
    showLoading("mangaGrid");
  }

  try {
    let data;
    if (searchQuery) {
      data = await searchManga(searchQuery, 30);
    } else {
      data = await fetchMangaList({ offset: currentOffset });
    }

    if (currentOffset === 0) {
      mangaGrid.innerHTML = "";
    }

    if (!data.data || data.data.length === 0) {
      if (currentOffset === 0) {
        mangaGrid.innerHTML = '<div class="empty"><p>No manga found</p></div>';
      }
      return;
    }

    data.data.forEach((manga) => {
      mangaGrid.appendChild(renderMangaCard(manga));
    });

    currentOffset += 30;
  } catch (error) {
    showError("mangaGrid", error.message);
  } finally {
    isLoading = false;
    lastLoadTime = Date.now();
  }
}

const debouncedSearch = debounce((query) => {
  currentOffset = 0;
  loadMangaList(query || null);
}, 300);

searchInput?.addEventListener("input", (e) => {
  debouncedSearch(e.target.value.trim());
});

window.addEventListener("scroll", () => {
  if (
    window.innerHeight + window.scrollY >=
    document.body.offsetHeight - 1000
  ) {
    const timeSinceLastLoad = Date.now() - lastLoadTime;
    if (
      !searchInput?.value.trim() &&
      !isLoading &&
      timeSinceLastLoad >= LOAD_COOLDOWN
    ) {
      loadMangaList();
    }
  }
});

loadMangaList();
