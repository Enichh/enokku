const ATSUMARU_BASE = "/atsumaru";

async function fetchAtsumaru(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${ATSUMARU_BASE}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Atsumaru API error: ${response.status}`);
  }
  return response.json();
}

export async function searchAtsumaru(query, limit = 10) {
  const data = await fetchAtsumaru("/search", { q: query, limit });
  return data.results || [];
}

export async function findAtsumaruManga(title) {
  const data = await fetchAtsumaru("/find", { title });
  return data.result;
}

export async function getAtsumaruMangaDetails(id) {
  return fetchAtsumaru("/manga", { id });
}

export async function getAtsumaruChapterPages(mangaId, chapterId) {
  return fetchAtsumaru("/chapter", { mangaId, chapterId });
}

export async function getAtsumaruLibrary() {
  const data = await fetchAtsumaru("/library");
  return data.items || [];
}

export async function getChaptersHybridAtsumaru(
  mangaTitles,
  mangaDexChapters = [],
) {
  const titles = Array.isArray(mangaTitles) ? mangaTitles : [mangaTitles];

  try {
    let atsumaruManga = null;
    let matchedTitle = null;

    for (const title of titles) {
      if (!title) continue;
      atsumaruManga = await findAtsumaruManga(title);
      if (atsumaruManga) {
        matchedTitle = title;
        break;
      }
    }

    if (!atsumaruManga) {
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    const mangaDetails = await getAtsumaruMangaDetails(atsumaruManga.id);

    if (
      !mangaDetails ||
      !mangaDetails.chapters ||
      mangaDetails.chapters.length === 0
    ) {
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    const atsumaruChapters = mangaDetails.chapters;

    // Find missing chapters
    const mangadexChapterNums = new Set(
      mangaDexChapters.map((c) => parseFloat(c.attributes?.chapter)),
    );
    const missingChapters = atsumaruChapters.filter(
      (ac) => !mangadexChapterNums.has(ac.number),
    );

    const combinedChapters = [
      ...mangaDexChapters.map((c) => ({
        id: c.id,
        chapter: c.attributes?.chapter,
        title: c.attributes?.title || `Chapter ${c.attributes?.chapter}`,
        source: "mangadex",
        mangadexId: c.id,
      })),
      ...missingChapters.map((c) => ({
        id: `atsu-${c.id}`,
        chapter: c.number.toString(),
        title: c.title,
        source: "atsumaru",
        mangaId: atsumaruManga.id,
        chapterId: c.id,
        pageCount: c.pageCount,
      })),
    ].sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));

    return {
      source: "hybrid",
      chapters: combinedChapters,
      atsumaruId: atsumaruManga.id,
      atsumaruUrl: atsumaruManga.url,
      missingCount: missingChapters.length,
    };
  } catch (error) {
    return {
      source: "mangadex",
      chapters: mangaDexChapters,
      error: error.message,
    };
  }
}

export async function getChapterPagesHybridAtsumaru(chapter) {
  if (chapter.source === "atsumaru" && chapter.mangaId && chapter.chapterId) {
    const data = await getAtsumaruChapterPages(
      chapter.mangaId,
      chapter.chapterId,
    );
    return data?.pages?.map((p) => p.image) || [];
  }

  if (chapter.mangadexId) {
    const response = await fetch(`/api/at-home/server/${chapter.mangadexId}`);
    const data = await response.json();

    if (data.baseUrl && data.chapter) {
      const { baseUrl, chapter: chapterData } = data;
      return chapterData.data.map(
        (page) => `${baseUrl}/data/${chapterData.hash}/${page}`,
      );
    }
  }

  throw new Error("Unable to fetch chapter pages");
}
