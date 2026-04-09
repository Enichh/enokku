const WEEBCENTRAL_BASE = "/weebcentral";

async function fetchWeebCentral(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${WEEBCENTRAL_BASE}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeebCentral API error: ${response.status}`);
  }
  return response.json();
}

export async function searchWeebCentral(query, limit = 10) {
  const data = await fetchWeebCentral("/search", { q: query, limit });
  return data.results || [];
}

export async function findWeebCentralManga(title) {
  const data = await fetchWeebCentral("/find", { title });
  return data.result;
}

export async function getWeebCentralManga(url) {
  return fetchWeebCentral("/manga", { url });
}

export async function getWeebCentralChapters(url) {
  const data = await fetchWeebCentral("/chapters", { url });
  return data.chapters || [];
}

export async function getWeebCentralPages(chapterUrl) {
  const data = await fetchWeebCentral("/pages", { url: chapterUrl });
  return data.pages || [];
}

export async function getWeebCentralLatest(limit = 20) {
  const data = await fetchWeebCentral("/latest", { limit });
  return data.updates || [];
}

export async function getChaptersHybrid(mangaTitle, mangaDexChapters = []) {
  try {
    const weebCentralManga = await findWeebCentralManga(mangaTitle);

    if (!weebCentralManga) {
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    const weebCentralChapters = await getWeebCentralChapters(weebCentralManga.url);

    if (weebCentralChapters.length === 0) {
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    const mangadexChapterNums = new Set(mangaDexChapters.map(c => parseFloat(c.attributes?.chapter)));
    const missingChapters = weebCentralChapters.filter(
      wc => !mangadexChapterNums.has(wc.chapter)
    );

    const combinedChapters = [
      ...mangaDexChapters.map(c => ({
        id: c.id,
        chapter: c.attributes?.chapter,
        title: c.attributes?.title || `Chapter ${c.attributes?.chapter}`,
        source: "mangadex",
        mangadexId: c.id,
      })),
      ...missingChapters.map(c => ({
        id: `wc-${c.chapter}`,
        chapter: c.chapter.toString(),
        title: c.title,
        source: "weebcentral",
        url: c.url,
      })),
    ].sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));

    return {
      source: "hybrid",
      chapters: combinedChapters,
      weebCentralUrl: weebCentralManga.url,
      missingCount: missingChapters.length,
    };
  } catch (error) {
    console.error("[Hybrid] Error fetching WeebCentral chapters:", error);
    return { source: "mangadex", chapters: mangaDexChapters };
  }
}

export async function getChapterPagesHybrid(chapter) {
  if (chapter.source === "weebcentral" && chapter.url) {
    return getWeebCentralPages(chapter.url);
  }

  if (chapter.mangadexId) {
    const response = await fetch(`/api/at-home/server/${chapter.mangadexId}`);
    const data = await response.json();

    if (data.baseUrl && data.chapter) {
      const { baseUrl, chapter: chapterData } = data;
      return chapterData.data.map(
        page => `${baseUrl}/data/${chapterData.hash}/${page}`
      );
    }
  }

  throw new Error("Unable to fetch chapter pages");
}
