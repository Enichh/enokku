const API_BASE_URL = "/api";
const COVER_BASE_URL = "https://uploads.mangadex.org/covers";

async function fetchMangaList(params = {}) {
  const defaultParams = {
    limit: 30,
    offset: 0,
    availableTranslatedLanguage: ["en"],
    includes: ["cover_art", "author"],
    order: { rating: "desc" },
    ...params,
  };

  const queryString = new URLSearchParams();
  Object.entries(defaultParams).forEach(([key, value]) => {
    if (typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([subKey, subValue]) => {
        queryString.append(`${key}[${subKey}]`, subValue);
      });
    } else if (Array.isArray(value)) {
      value.forEach((item) => queryString.append(`${key}[]`, item));
    } else {
      queryString.append(key, value);
    }
  });

  const response = await fetch(`${API_BASE_URL}/manga?${queryString}`);
  if (!response.ok) throw new Error("Failed to fetch manga list");
  return response.json();
}

async function searchManga(title, limit = 30) {
  return fetchMangaList({
    title,
    limit,
    order: { relevance: "desc" },
  });
}

async function fetchMangaDetails(mangaId) {
  const response = await fetch(
    `${API_BASE_URL}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
  );
  if (!response.ok) throw new Error("Failed to fetch manga details");
  return response.json();
}

async function fetchMangaFeed(mangaId) {
  const params = new URLSearchParams();
  params.append("translatedLanguage[]", "en");
  params.append("order[chapter]", "asc");
  params.append("limit", "100");

  const response = await fetch(
    `${API_BASE_URL}/manga/${mangaId}/feed?${params}`,
  );
  if (!response.ok) throw new Error("Failed to fetch manga feed");
  return response.json();
}

async function fetchChapterDetails(chapterId) {
  const response = await fetch(`${API_BASE_URL}/chapter/${chapterId}`);
  if (!response.ok) throw new Error("Failed to fetch chapter details");
  return response.json();
}

async function fetchChapterPages(chapterId) {
  const response = await fetch(`${API_BASE_URL}/at-home/server/${chapterId}`);
  if (!response.ok) throw new Error("Failed to fetch chapter pages");
  return response.json();
}

function getCoverUrl(mangaId, coverArt, size = "256") {
  if (!coverArt || !coverArt.attributes) return null;
  const filename = coverArt.attributes.fileName;
  return `${COVER_BASE_URL}/${mangaId}/${filename}.${size}.jpg`;
}

function findRelationship(item, type) {
  return item.relationships?.find((r) => r.type === type);
}

export {
  API_BASE_URL,
  COVER_BASE_URL,
  fetchMangaList,
  searchManga,
  fetchMangaDetails,
  fetchMangaFeed,
  fetchChapterDetails,
  fetchChapterPages,
  getCoverUrl,
  findRelationship,
};
