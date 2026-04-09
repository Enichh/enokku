import {
  fetchMangaDetails,
  fetchMangaFeed,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
} from "./api.js";
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

    const altTitles =
      manga.attributes.altTitles?.map((t) => Object.values(t)[0]).join(", ") ||
      "";
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

    loadChapters();
  } catch (error) {
    showError("mangaDetails", error.message);
  }
}

async function loadChapters() {
  console.log(`[Details] Loading chapters for manga: ${mangaId}`);
  try {
    const response = await fetchMangaFeed(mangaId);
    console.log(`[Details] Feed response:`, response);

    const chapters = response.data;
    console.log(`[Details] Chapters array:`, chapters);

    if (!chapters || chapters.length === 0) {
      console.warn(`[Details] No chapters found for manga: ${mangaId}`);
      chapterListContainer.innerHTML =
        '<div class="empty"><p>No chapters available</p></div>';
      return;
    }

    console.log(`[Details] Found ${chapters.length} chapters`);

    allChapters = chapters.sort((a, b) => {
      const aNum = parseFloat(a.attributes?.chapter) || 0;
      const bNum = parseFloat(b.attributes?.chapter) || 0;
      if (aNum !== bNum) return aNum - bNum;
      return (
        new Date(a.attributes?.publishAt || 0) -
        new Date(b.attributes?.publishAt || 0)
      );
    });

    console.log(`[Details] Sorted ${allChapters.length} chapters`);
    renderChapterPage(0);
  } catch (error) {
    console.error(`[Details] Error loading chapters:`, error);
    chapterListContainer.innerHTML = `<div class="error"><p>Error loading chapters: ${error.message}</p></div>`;
  }
}

function renderChapterPage(page) {
  console.log(`[Details] Rendering chapter page ${page}`);
  currentPage = page;
  const totalPages = Math.ceil(allChapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, allChapters.length);
  const pageChapters = allChapters.slice(startIndex, endIndex);

  console.log(
    `[Details] Showing chapters ${startIndex + 1} to ${endIndex} of ${allChapters.length}`,
  );

  let html = `
    <h2>Chapters (${allChapters.length} total)</h2>
    <div class="chapter-pagination">
      <button onclick="goToChapterPage(0)" ${page === 0 ? "disabled" : ""}>First</button>
      <button onclick="goToChapterPage(${page - 1})" ${page === 0 ? "disabled" : ""}>Previous</button>
      <span class="page-info">Page ${page + 1} of ${totalPages}</span>
      <button onclick="goToChapterPage(${page + 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
      <button onclick="goToChapterPage(${totalPages - 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Last</button>
    </div>
    <div class="chapter-items">
  `;

  pageChapters.forEach((chapter) => {
    const attrs = chapter.attributes || {};
    const chapterNum = attrs.chapter || "?";
    const chapterTitle = attrs.title || "";
    const pages = attrs.pages || 0;
    const publishedAt = formatDate(attrs.publishAt);

    html += `
      <div class="chapter-item" data-chapter-id="${chapter.id}">
        <div>
          <div class="chapter-title">Chapter ${chapterNum}${chapterTitle ? ` - ${chapterTitle}` : ""}</div>
          <div class="chapter-meta">${pages} pages · ${publishedAt}</div>
        </div>
      </div>
    `;
  });

  html += "</div>";

  html += `
    <div class="chapter-pagination bottom">
      <button onclick="goToChapterPage(0)" ${page === 0 ? "disabled" : ""}>First</button>
      <button onclick="goToChapterPage(${page - 1})" ${page === 0 ? "disabled" : ""}>Previous</button>
      <span class="page-info">Page ${page + 1} of ${totalPages}</span>
      <button onclick="goToChapterPage(${page + 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
      <button onclick="goToChapterPage(${totalPages - 1})" ${page >= totalPages - 1 ? "disabled" : ""}>Last</button>
    </div>
  `;

  chapterListContainer.innerHTML = html;

  pageChapters.forEach((chapter) => {
    const el = chapterListContainer.querySelector(
      `[data-chapter-id="${chapter.id}"]`,
    );
    el.addEventListener("click", () => {
      window.location.href = `reader.html?id=${chapter.id}&manga=${mangaId}`;
    });
  });

  console.log(`[Details] Rendered ${pageChapters.length} chapters`);
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
