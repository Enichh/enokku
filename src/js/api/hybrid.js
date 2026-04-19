// Unified Multi-Source Hybrid API
// Tries multiple sources in order: MangaDex -> Atsumaru

const SOURCES = {
  MANGADEX: "mangadex",
  ATSUMARU: "atsumaru",
};

// Source priority order
const SOURCE_PRIORITY = [SOURCES.MANGADEX, SOURCES.ATSUMARU];

// ============ Helper Functions ============

function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
}

// ============ Source API Clients ============

async function fetchAtsumaru(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `/atsumaru${endpoint}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Atsumaru API error: ${response.status}`);
  return response.json();
}

// ============ Source Search Functions ============

async function findAtsumaruManga(title) {
  try {
    const data = await fetchAtsumaru("/find", { title });
    return data.result;
  } catch (error) {
    return null;
  }
}

async function searchAtsumaru(query, limit = 30) {
  try {
    const data = await fetchAtsumaru("/search", { q: query, limit });
    return data?.results || [];
  } catch (error) {
    return [];
  }
}

// ============ Hybrid Search ============

export async function searchMangaHybrid(query, limit = 30) {
  const { searchManga } = await import("./api.js");

  // Fetch from both sources in parallel
  const [mangaDexResults, atsumaruResults] = await Promise.all([
    searchManga(query, limit).catch(() => ({ data: [] })),
    searchAtsumaru(query, limit),
  ]);

  const seenTitles = new Map();
  const mergedResults = [];

  // Process MangaDex results first (priority for metadata)
  for (const manga of mangaDexResults.data || []) {
    const title = manga.attributes?.title?.en || "";
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) continue;

    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.set(normalizedTitle, {
        manga,
        atsumaruId: null,
      });
      mergedResults.push({
        ...manga,
        atsumaruId: null,
      });
    }
  }

  // Process Atsumaru results, add if not seen or merge Atsumaru ID
  for (const manga of atsumaruResults) {
    const title = manga.title || "";
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) continue;

    if (!seenTitles.has(normalizedTitle)) {
      // New title from Atsumaru, add to results
      seenTitles.set(normalizedTitle, {
        manga: null,
        atsumaruId: manga.id,
      });
      mergedResults.push({
        id: manga.id,
        type: "manga",
        attributes: {
          title: { en: manga.title },
          altTitles: manga.otherNames || [],
          description: { en: manga.description || "" },
          year: null,
          status: manga.status || "unknown",
        },
        relationships: [],
        atsumaruId: manga.id,
      });
    } else {
      // Title already exists from MangaDex, store Atsumaru ID for chapters
      const existing = seenTitles.get(normalizedTitle);
      if (existing.atsumaruId === null) {
        existing.atsumaruId = manga.id;
        // Update the merged result with Atsumaru ID
        const mergedItem = mergedResults.find(
          (m) =>
            normalizeTitle(m.attributes?.title?.en || "") === normalizedTitle,
        );
        if (mergedItem) {
          mergedItem.atsumaruId = manga.id;
        }
      }
    }
  }

  return { data: mergedResults };
}

// ============ Chapter Fetching ============

async function getAtsumaruChapters(mangaId) {
  try {
    const data = await fetchAtsumaru("/manga", { id: mangaId });
    const rawChapters = data?.chapters || [];

    // Deduplicate by chapter number, preferring higher page count (older/higher resolution format)
    const chapterMap = new Map();

    for (const c of rawChapters) {
      const chapterNum = c.number;
      const existing = chapterMap.get(chapterNum);

      if (!existing) {
        // First occurrence, add to map
        chapterMap.set(chapterNum, c);
      } else {
        // Duplicate exists, prefer higher page count (older higher resolution format)
        if (c.pageCount > existing.pageCount) {
          chapterMap.set(chapterNum, c);
        } else if (c.pageCount === existing.pageCount) {
          // Same page count, prefer older timestamp
          if (c.createdAt < existing.createdAt) {
            chapterMap.set(chapterNum, c);
          }
        }
      }
    }

    const deduplicatedChapters = Array.from(chapterMap.values());

    return deduplicatedChapters.map((c) => ({
      id: `atsu-${c.id}`,
      chapter: c.number.toString(),
      title: c.title,
      source: SOURCES.ATSUMARU,
      mangaId: mangaId,
      chapterId: c.id,
      pageCount: c.pageCount,
    }));
  } catch (error) {
    return [];
  }
}

// ============ Page Fetching ============

export async function getAtsumaruPages(mangaId, chapterId) {
  try {
    const data = await fetchAtsumaru("/chapter", { mangaId, chapterId });
    return data?.pages?.map((p) => p.image) || [];
  } catch (error) {
    return [];
  }
}

export async function getMangaDexPages(chapterId) {
  try {
    const response = await fetch(`/api/at-home/server/${chapterId}`);
    const data = await response.json();
    if (data.baseUrl && data.chapter) {
      const { baseUrl, chapter: chapterData } = data;
      return chapterData.data.map(
        (page) => `${baseUrl}/data/${chapterData.hash}/${page}`,
      );
    }
    return [];
  } catch (error) {
    return [];
  }
}

// ============ Main Hybrid Function (Atsumaru-Only) ============

export async function getChaptersHybrid(mangaTitles, mangaDexChapters = []) {
  const titles = Array.isArray(mangaTitles) ? mangaTitles : [mangaTitles];

  // Try Atsumaru only
  let atsumaruManga = null;
  for (const title of titles) {
    if (!title) continue;
    atsumaruManga = await findAtsumaruManga(title);
    if (atsumaruManga) {
      break;
    }
  }

  if (!atsumaruManga) {
    return {
      source: SOURCES.ATSUMARU,
      chapters: [],
      sources: [SOURCES.ATSUMARU],
      missingCount: 0,
      missingBySource: { [SOURCES.ATSUMARU]: 0 },
      atsumaruId: null,
      error: "No Atsumaru manga found",
    };
  }

  const atsumaruChapters = await getAtsumaruChapters(atsumaruManga.id);

  if (atsumaruChapters.length === 0) {
    return {
      source: SOURCES.ATSUMARU,
      chapters: [],
      sources: [SOURCES.ATSUMARU],
      missingCount: 0,
      missingBySource: { [SOURCES.ATSUMARU]: 0 },
      atsumaruId: atsumaruManga.id,
      error: "No chapters found",
    };
  }

  // Sort by chapter number descending
  atsumaruChapters.sort(
    (a, b) => parseFloat(b.chapter) - parseFloat(a.chapter),
  );

  return {
    source: SOURCES.ATSUMARU,
    chapters: atsumaruChapters,
    sources: [SOURCES.ATSUMARU],
    missingCount: 0,
    missingBySource: { [SOURCES.ATSUMARU]: 0 },
    atsumaruId: atsumaruManga.id,
    atsumaruUrl: atsumaruManga.url,
  };
}

export async function getChapterPagesHybrid(chapter) {
  // Atsumaru-only chapter fetching
  if (chapter.source === SOURCES.ATSUMARU || !chapter.source) {
    return getAtsumaruPages(chapter.mangaId, chapter.chapterId);
  }

  throw new Error(`Unsupported chapter source: ${chapter.source}`);
}

// Source styling helpers
export function getSourceStyle(source) {
  const styles = {
    [SOURCES.MANGADEX]: { color: "#ff6740", name: "MangaDex" },
    [SOURCES.ATSUMARU]: { color: "#10b981", name: "Atsumaru" },
  };
  return styles[source] || { color: "#888", name: source };
}

export {
  SOURCES,
  SOURCE_PRIORITY,
  findAtsumaruManga,
  getAtsumaruChapters,
  fetchAtsumaru,
};
