// Unified Multi-Source Hybrid API
// Tries multiple sources in order: MangaDex -> Atsumaru -> MangaKakalot

const SOURCES = {
  MANGADEX: "mangadex",
  ATSUMARU: "atsumaru",
  MANGAKAKALOT: "mangakakalot",
};

// Source priority order
const SOURCE_PRIORITY = [SOURCES.MANGADEX, SOURCES.ATSUMARU, SOURCES.MANGAKAKALOT];

// ============ Source API Clients ============

async function fetchAtsumaru(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `/atsumaru${endpoint}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Atsumaru API error: ${response.status}`);
  return response.json();
}

async function fetchMangaKakalot(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `/mangakakalot${endpoint}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MangaKakalot API error: ${response.status}`);
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

async function findMangaKakalotManga(title) {
  try {
    const data = await fetchMangaKakalot("/find", { title });
    return data.result;
  } catch (error) {
    console.error("[MangaKakalot] Find error:", error);
    return null;
  }
}

// ============ Chapter Fetching ============

async function getAtsumaruChapters(mangaId) {
  try {
    const data = await fetchAtsumaru("/manga", { id: mangaId });
    return (data?.chapters || []).map(c => ({
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

async function getMangaKakalotChapters(mangaSlug) {
  try {
    const data = await fetchMangaKakalot("/manga", { slug: mangaSlug });
    return (data?.chapters || []).map(c => ({
      id: `mk-${c.slug}`,
      chapter: c.number.toString(),
      title: c.title,
      source: SOURCES.MANGAKAKALOT,
      mangaSlug: mangaSlug,
      chapterSlug: c.slug,
    }));
  } catch (error) {
    console.error("[MangaKakalot] Chapters error:", error);
    return [];
  }
}

// ============ Page Fetching ============

export async function getAtsumaruPages(mangaId, chapterId) {
  try {
    const data = await fetchAtsumaru("/chapter", { mangaId, chapterId });
    return data?.pages?.map(p => p.image) || [];
  } catch (error) {
    console.error("[Atsumaru] Pages error:", error);
    return [];
  }
}

export async function getMangaKakalotPages(mangaSlug, chapterSlug) {
  try {
    const data = await fetchMangaKakalot("/chapter", { mangaSlug, chapterSlug });
    return data?.pages || [];
  } catch (error) {
    console.error("[MangaKakalot] Pages error:", error);
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
        page => `${baseUrl}/data/${chapterData.hash}/${page}`
      );
    }
    return [];
  } catch (error) {
    console.error("[MangaDex] Pages error:", error);
    return [];
  }
}

// ============ Main Hybrid Function ============

export async function getChaptersHybrid(mangaTitles, mangaDexChapters = []) {
  const titles = Array.isArray(mangaTitles) ? mangaTitles : [mangaTitles];
  console.log(`[Hybrid] Starting multi-source search with ${titles.length} titles`);

  // Start with MangaDex chapters
  const combinedChapters = mangaDexChapters.map(c => ({
    id: c.id,
    chapter: c.attributes?.chapter,
    title: c.attributes?.title || `Chapter ${c.attributes?.chapter}`,
    source: SOURCES.MANGADEX,
    mangadexId: c.id,
  }));

  const mangadexChapterNums = new Set(mangaDexChapters.map(c => parseFloat(c.attributes?.chapter)));
  const sourcesUsed = [SOURCES.MANGADEX];
  const missingCounts = { [SOURCES.MANGADEX]: 0 };

  // Try Atsumaru
  console.log(`[Hybrid] Trying Atsumaru...`);
  let atsumaruManga = null;
  for (const title of titles) {
    if (!title) continue;
    atsumaruManga = await findAtsumaruManga(title);
    if (atsumaruManga) {
      console.log(`[Hybrid] Atsumaru match: "${atsumaruManga.title}"`);
      break;
    }
  }

  if (atsumaruManga) {
    const atsumaruChapters = await getAtsumaruChapters(atsumaruManga.id);
    const missingAtsumaru = atsumaruChapters.filter(
      ac => !mangadexChapterNums.has(parseFloat(ac.chapter))
    );
    
    if (missingAtsumaru.length > 0) {
      console.log(`[Hybrid] Atsumaru added ${missingAtsumaru.length} new chapters`);
      combinedChapters.push(...missingAtsumaru);
      sourcesUsed.push(SOURCES.ATSUMARU);
      missingCounts[SOURCES.ATSUMARU] = missingAtsumaru.length;
    }
  }

  // Try MangaKakalot
  console.log(`[Hybrid] Trying MangaKakalot...`);
  let mangakakalotManga = null;
  for (const title of titles) {
    if (!title) continue;
    mangakakalotManga = await findMangaKakalotManga(title);
    if (mangakakalotManga) {
      console.log(`[Hybrid] MangaKakalot match: "${mangakakalotManga.title}"`);
      break;
    }
  }

  if (mangakakalotManga) {
    const mkChapters = await getMangaKakalotChapters(mangakakalotManga.slug);
    const currentChapterNums = new Set(combinedChapters.map(c => parseFloat(c.chapter)));
    const missingMK = mkChapters.filter(
      mkc => !currentChapterNums.has(parseFloat(mkc.chapter))
    );
    
    if (missingMK.length > 0) {
      console.log(`[Hybrid] MangaKakalot added ${missingMK.length} new chapters`);
      combinedChapters.push(...missingMK);
      sourcesUsed.push(SOURCES.MANGAKAKALOT);
      missingCounts[SOURCES.MANGAKAKALOT] = missingMK.length;
    }
  }

  // Sort by chapter number descending
  combinedChapters.sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));

  const isHybrid = sourcesUsed.length > 1;
  const totalMissing = Object.values(missingCounts).reduce((a, b) => a + b, 0) - missingCounts[SOURCES.MANGADEX];

  console.log(`[Hybrid] Final: ${combinedChapters.length} chapters from ${sourcesUsed.join(" + ")}`);

  return {
    source: isHybrid ? "hybrid" : SOURCES.MANGADEX,
    chapters: combinedChapters,
    sources: sourcesUsed,
    missingCount: totalMissing,
    missingBySource: missingCounts,
    atsumaruId: atsumaruManga?.id || null,
    mangakakalotSlug: mangakakalotManga?.slug || null,
  };
}

export async function getChapterPagesHybrid(chapter) {
  switch (chapter.source) {
    case SOURCES.ATSUMARU:
      return getAtsumaruPages(chapter.mangaId, chapter.chapterId);
    
    case SOURCES.MANGAKAKALOT:
      return getMangaKakalotPages(chapter.mangaSlug, chapter.chapterSlug);
    
    case SOURCES.MANGADEX:
    default:
      return getMangaDexPages(chapter.mangadexId);
  }
}

// Source styling helpers
export function getSourceStyle(source) {
  const styles = {
    [SOURCES.MANGADEX]: { color: "#ff6740", icon: "📖", name: "MangaDex" },
    [SOURCES.ATSUMARU]: { color: "#10b981", icon: "📚", name: "Atsumaru" },
    [SOURCES.MANGAKAKALOT]: { color: "#3b82f6", icon: "🗂️", name: "MangaKakalot" },
  };
  return styles[source] || { color: "#888", icon: "❓", name: source };
}

export { SOURCES, SOURCE_PRIORITY };
