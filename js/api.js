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
  const data = await response.json();
  if (!data || !Array.isArray(data)) {
    throw new Error(
      "Invalid API response format: missing or invalid data array",
    );
  }
  return data;
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
  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid API response format: missing or invalid data object",
    );
  }
  return data;
}

async function fetchMangaFeed(mangaId, translatedLanguage = ["en"]) {
  console.log(`[API] Fetching manga feed for: ${mangaId}`);
  const allChapters = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  let iterations = 0;
  const MAX_ITERATIONS = 50; // Safety limit: max 5000 chapters

  while (hasMore && iterations < MAX_ITERATIONS) {
    iterations++;
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
    // Include unavailable chapters (important for complete listing)
    params.append("includeUnavailable", "1");
    // Include external URL chapters
    params.append("includeExternalUrl", "1");
    params.append("order[chapter]", "asc");
    params.append("order[createdAt]", "asc");
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());

    const url = `${API_BASE_URL}/manga/${mangaId}/feed?${params}`;
    console.log(`[API] Feed URL: ${url}`);

    try {
      const response = await fetch(url);
      console.log(`[API] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API] Error response: ${errorText}`);
        throw new Error(`Failed to fetch manga feed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[API] Response data:`, {
        result: data.result,
        total: data.total,
        dataLength: data.data?.length,
      });

      if (!data.data || !Array.isArray(data.data)) {
        console.error(`[API] Invalid data format:`, data);
        throw new Error(
          "Invalid API response format: missing or invalid data array",
        );
      }

      allChapters.push(...data.data);

      if (data.data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (error) {
      console.error(`[API] Fetch error:`, error);
      throw error;
    }
  }

  console.log(`[API] Total chapters fetched: ${allChapters.length}`);
  return { data: allChapters };
}

async function fetchChapterDetails(chapterId) {
  const response = await fetch(`${API_BASE_URL}/chapter/${chapterId}`);
  if (!response.ok) throw new Error("Failed to fetch chapter details");
  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid API response format: missing or invalid data object",
    );
  }
  return data;
}

async function fetchChapterPages(chapterId) {
  const response = await fetch(`${API_BASE_URL}/at-home/server/${chapterId}`);
  if (!response.ok) throw new Error("Failed to fetch chapter pages");
  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid API response format: missing or invalid data object",
    );
  }
  return data;
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
  fetchMostFollowedManga,
  fetchMostFollowedManwha,
  fetchMangaDetails,
  fetchMangaFeed,
  fetchChapterDetails,
  fetchChapterPages,
  getCoverUrl,
  findRelationship,
  getEnglishTitle,
};
