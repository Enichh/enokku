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
  const limit = 100;
  const maxOffset = 500; // MangaDex feed endpoint limit

  // Helper to build params
  const buildParams = (offset, order) => {
    const params = new URLSearchParams();
    translatedLanguage.forEach((lang) => {
      params.append("translatedLanguage[]", lang);
    });
    params.append("contentRating[]", "safe");
    params.append("contentRating[]", "suggestive");
    params.append("contentRating[]", "erotica");
    params.append("contentRating[]", "pornographic");
    params.append("includeFutureUpdates", "0");
    params.append("includeUnavailable", "0");
    params.append("includeExternalUrl", "0");
    params.append("order[chapter]", order);
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());
    return params;
  };

  // Helper to fetch a page
  const fetchPage = async (offset, order) => {
    const params = buildParams(offset, order);
    const url = `${API_BASE_URL}/manga/${mangaId}/feed?${params}`;
    console.log(`[API] Feed URL (${order}, offset ${offset}): ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch manga feed: ${response.status}`);
    }
    return response.json();
  };

  // Fetch from beginning (ascending) - gets chapters 1-500
  try {
    let offset = 0;
    let hasMore = true;
    while (hasMore && offset < maxOffset) {
      const data = await fetchPage(offset, "asc");
      if (!data.data || !Array.isArray(data.data)) break;

      const validChapters = data.data.filter(
        (chapter) =>
          chapter.attributes &&
          chapter.attributes.pages > 0 &&
          !chapter.attributes.isUnavailable &&
          !chapter.attributes.externalUrl,
      );

      allChapters.push(...validChapters);

      if (data.data.length < limit || offset + limit >= maxOffset) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  } catch (error) {
    console.error(`[API] Error fetching ascending:`, error);
  }

  // Fetch from end (descending) - gets chapters 500+ to most recent
  try {
    let offset = 0;
    let hasMore = true;
    while (hasMore && offset < maxOffset) {
      const data = await fetchPage(offset, "desc");
      if (!data.data || !Array.isArray(data.data)) break;

      const validChapters = data.data.filter(
        (chapter) =>
          chapter.attributes &&
          chapter.attributes.pages > 0 &&
          !chapter.attributes.isUnavailable &&
          !chapter.attributes.externalUrl,
      );

      // Add chapters we don't already have
      const existingIds = new Set(allChapters.map((c) => c.id));
      const newChapters = validChapters.filter((c) => !existingIds.has(c.id));
      allChapters.push(...newChapters);

      if (data.data.length < limit || offset + limit >= maxOffset) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }
  } catch (error) {
    console.error(`[API] Error fetching descending:`, error);
  }

  console.log(
    `[API] Total chapters fetched before dedup: ${allChapters.length}`,
  );

  // Deduplicate chapters by chapter number, keeping the one with most pages
  const chapterMap = new Map();
  allChapters.forEach((chapter) => {
    const chapterNum = chapter.attributes?.chapter || "unknown";
    const existing = chapterMap.get(chapterNum);
    if (
      !existing ||
      (chapter.attributes?.pages || 0) > (existing.attributes?.pages || 0)
    ) {
      chapterMap.set(chapterNum, chapter);
    }
  });

  const dedupedChapters = Array.from(chapterMap.values());
  console.log(`[API] Total chapters after dedup: ${dedupedChapters.length}`);
  return { data: dedupedChapters };
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
  console.log(`[API] Fetching chapter pages from at-home for: ${chapterId}`);
  const response = await fetch(`${API_BASE_URL}/at-home/server/${chapterId}`);

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text().catch(() => "Unknown error");
    console.error(`[API] at-home server error ${status}:`, errorText);

    if (status === 404) {
      throw new Error(
        "Chapter pages unavailable - may be hosted externally or removed",
      );
    }
    throw new Error(`Failed to fetch chapter pages: ${status}`);
  }

  const data = await response.json();
  console.log(`[API] at-home response:`, JSON.stringify(data, null, 2));

  if (!data || typeof data !== "object") {
    throw new Error(
      "Invalid API response format: missing or invalid data object",
    );
  }

  if (
    !data.baseUrl ||
    !data.chapter?.hash ||
    !Array.isArray(data.chapter?.data)
  ) {
    console.error(`[API] Invalid at-home data structure:`, data);
    throw new Error("Invalid chapter pages data structure");
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
