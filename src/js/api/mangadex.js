const API_BASE_URL = "/api";
const COVER_BASE_URL = "https://uploads.mangadex.org/covers";

async function fetchMangaList(params = {}) {
  const defaultParams = {
    limit: 30,
    offset: 0,
    availableTranslatedLanguage: ["en"],
    hasAvailableChapters: "true",
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

async function fetchTopTrending(limit = 10) {
  return fetchMangaList({
    limit,
    order: { followedCount: "desc" },
  });
}

async function fetchTopManga(limit = 10) {
  return fetchMangaList({
    limit,
    originalLanguage: ["ja"],
    order: { rating: "desc" },
  });
}

async function fetchTopManwha(limit = 10) {
  return fetchMangaList({
    limit,
    originalLanguage: ["ko"],
    order: { rating: "desc" },
  });
}

async function fetchRecentlyUpdated(limit = 10) {
  return fetchMangaList({
    limit,
    order: { latestUploadedChapter: "desc" },
  });
}

async function fetchRecentlyAdded(limit = 10) {
  return fetchMangaList({
    limit,
    order: { createdAt: "desc" },
  });
}

async function fetchMostFollowedManga(limit = 10) {
  return fetchMangaList({
    limit,
    originalLanguage: ["ja"],
    order: { followedCount: "desc" },
  });
}

async function fetchMostFollowedManwha(limit = 10) {
  return fetchMangaList({
    limit,
    originalLanguage: ["ko"],
    order: { followedCount: "desc" },
  });
}

async function fetchMangaDetails(mangaId) {
  const response = await fetch(
    `${API_BASE_URL}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`,
  );
  if (!response.ok) throw new Error("Failed to fetch manga details");
  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid API response format: missing or invalid data object",
    );
  }
  return data;
}

// MangaDex feed API removed - chapters are Atsumaru-only now

function getCoverUrl(mangaId, coverArt, size = "256") {
  if (!coverArt?.attributes?.fileName) {
    return null;
  }
  const filename = coverArt.attributes.fileName;
  const directUrl = `${COVER_BASE_URL}/${mangaId}/${filename}.${size}.jpg`;
  return directUrl;
}

function findRelationship(item, type) {
  return item.relationships?.find((r) => r.type === type);
}

function getEnglishTitle(manga) {
  // First try the main title object
  if (manga.attributes.title?.en) {
    return manga.attributes.title.en;
  }

  // Then search through altTitles for English
  if (manga.attributes.altTitles?.length > 0) {
    const englishAlt = manga.attributes.altTitles.find((alt) => alt.en);
    if (englishAlt?.en) {
      return englishAlt.en;
    }
  }

  // Fall back to first available title
  const firstTitle = Object.values(manga.attributes.title)[0];
  if (firstTitle) {
    return firstTitle;
  }

  return "Unknown Title";
}

export {
  API_BASE_URL,
  COVER_BASE_URL,
  fetchMangaList,
  searchManga,
  fetchTopTrending,
  fetchTopManga,
  fetchTopManwha,
  fetchRecentlyUpdated,
  fetchRecentlyAdded,
  fetchMostFollowedManga,
  fetchMostFollowedManwha,
  fetchMangaDetails,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
};
