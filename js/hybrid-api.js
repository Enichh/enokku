// Unified Multi-Source Hybrid API
// Tries multiple sources in order: MangaDex -> Atsumaru

const SOURCES = {
  MANGADEX: "mangadex",
  ATSUMARU: "atsumaru",
};

// Source priority order
const SOURCE_PRIORITY = [SOURCES.MANGADEX, SOURCES.ATSUMARU];

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
    console.error("[Atsumaru] Find error:", error);
    return null;
  }
}

// ============ Chapter Fetching ============

async function getAtsumaruChapters(mangaId) {
  try {
    const data = await fetchAtsumaru("/manga", { id: mangaId });
    return (data?.chapters || []).map((c) => ({
      id: `atsu-${c.id}`,
      chapter: c.number.toString(),
      title: c.title,
      source: SOURCES.ATSUMARU,
      mangaId: mangaId,
      chapterId: c.id,
      pageCount: c.pageCount,
    }));
  } catch (error) {
    console.error("[Atsumaru] Chapters error:", error);
    return [];
  }
}

// ============ Page Fetching ============

export async function getAtsumaruPages(mangaId, chapterId) {
  try {
    const data = await fetchAtsumaru("/chapter", { mangaId, chapterId });
    return data?.pages?.map((p) => p.image) || [];
  } catch (error) {
    console.error("[Atsumaru] Pages error:", error);
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
    console.error("[MangaDex] Pages error:", error);
    return [];
  }
}

// ============ Main Hybrid Function (Atsumaru-Only) ============

export async function getChaptersHybrid(mangaTitles, mangaDexChapters = []) {
  const titles = Array.isArray(mangaTitles) ? mangaTitles : [mangaTitles];
  console.log(
    `[Hybrid] Starting Atsumaru-only search with ${titles.length} titles`,
  );

  // Try Atsumaru only
  console.log(`[Hybrid] Searching Atsumaru...`);
  let atsumaruManga = null;
  for (const title of titles) {
    if (!title) continue;
    atsumaruManga = await findAtsumaruManga(title);
    if (atsumaruManga) {
      console.log(`[Hybrid] Atsumaru match: "${atsumaruManga.title}"`);
      break;
    }
  }

  if (!atsumaruManga) {
    console.log(`[Hybrid] No Atsumaru manga found for any title`);
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
    console.log(`[Hybrid] No chapters found on Atsumaru`);
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

  console.log(
    `[Hybrid] Final: ${atsumaruChapters.length} chapters from Atsumaru`,
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

export { SOURCES, SOURCE_PRIORITY, findAtsumaruManga, getAtsumaruChapters };
