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
  return response.json();
}

async function fetchMangaFeed(mangaId, translatedLanguage = ["en"]) {
  const allChapters = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    translatedLanguage.forEach((lang) => {
      params.append("translatedLanguage[]", lang);
    });
    // Include all content ratings to get complete chapter list
    params.append("contentRating[]", "safe");
    params.append("contentRating[]", "suggestive");
    params.append("contentRating[]", "erotica");
    params.append("contentRating[]", "pornographic");
    // Include empty and future chapters
    params.append("includeEmptyPages", "1");
    params.append("includeFutureUpdates", "1");
    params.append("order[chapter]", "asc");
    params.append("order[createdAt]", "asc");
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());

    const response = await fetch(
      `${API_BASE_URL}/manga/${mangaId}/feed?${params}`,
    );
    if (!response.ok) throw new Error("Failed to fetch manga feed");
    const data = await response.json();

    allChapters.push(...data.data);

    if (data.data.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  return { data: allChapters };
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
  console.log(
    "[getCoverUrl] mangaId:",
    mangaId,
    "coverArt:",
    JSON.stringify(coverArt, null, 2),
  );
  if (!coverArt) {
    console.log("[getCoverUrl] coverArt is null/undefined");
    return null;
  }
  if (!coverArt.attributes) {
    console.log("[getCoverUrl] coverArt.attributes is missing");
    return null;
  }
  const filename = coverArt.attributes.fileName;
  console.log("[getCoverUrl] filename:", filename);
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
  fetchTopTrending,
  fetchTopManga,
  fetchTopManwha,
  fetchRecentlyUpdated,
  fetchMostFollowedManga,
  fetchMostFollowedManwha,
  fetchMangaDetails,
  fetchMangaFeed,
  fetchChapterDetails,
  fetchChapterPages,
  getCoverUrl,
  findRelationship,
};
