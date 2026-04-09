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
  console.log(`[findWeebCentralManga] Searching for title: "${title}"`);
  try {
    const data = await fetchWeebCentral("/find", { title });
    console.log(`[findWeebCentralManga] API response:`, data);
    return data.result;
  } catch (error) {
    console.error(`[findWeebCentralManga] Error:`, error);
    return null;
  }
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

export async function getChaptersHybrid(mangaTitles, mangaDexChapters = []) {
  const titles = Array.isArray(mangaTitles) ? mangaTitles : [mangaTitles];
  console.log(
    `[Hybrid] Starting hybrid search with ${titles.length} titles:`,
    titles,
  );

  try {
    let weebCentralManga = null;
    let matchedTitle = null;

    for (const title of titles) {
      if (!title) continue;
      console.log(`[Hybrid] Trying title: "${title}"`);
      weebCentralManga = await findWeebCentralManga(title);
      if (weebCentralManga) {
        matchedTitle = title;
        console.log(`[Hybrid] Found match with title: "${title}"`);
        break;
      }
    }

    if (!weebCentralManga) {
      console.log(`[Hybrid] No Weeb Central manga found for any title`);
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    console.log(
      `[Hybrid] Found Weeb Central manga: ${weebCentralManga.title} at ${weebCentralManga.url}`,
    );
    console.log(`[Hybrid] Fetching chapters from Weeb Central...`);

    const weebCentralChapters = await getWeebCentralChapters(
      weebCentralManga.url,
    );
    console.log(
      `[Hybrid] Weeb Central returned ${weebCentralChapters.length} chapters`,
    );

    if (weebCentralChapters.length === 0) {
      console.log(`[Hybrid] No chapters found on Weeb Central`);
      return { source: "mangadex", chapters: mangaDexChapters };
    }

    const mangadexChapterNums = new Set(
      mangaDexChapters.map((c) => parseFloat(c.attributes?.chapter)),
    );
    console.log(`[Hybrid] MangaDex chapter numbers:`, [...mangadexChapterNums]);
    console.log(
      `[Hybrid] Weeb Central chapter numbers:`,
      weebCentralChapters.map((c) => c.chapter),
    );

    const missingChapters = weebCentralChapters.filter(
      (wc) => !mangadexChapterNums.has(wc.chapter),
    );
    console.log(
      `[Hybrid] Missing chapters from Weeb Central: ${missingChapters.length}`,
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
        id: `wc-${c.chapter}`,
        chapter: c.chapter.toString(),
        title: c.title,
        source: "weebcentral",
        url: c.url,
      })),
    ].sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));

    console.log(
      `[Hybrid] Final result: ${combinedChapters.length} total chapters (${mangaDexChapters.length} MD + ${missingChapters.length} WC)`,
    );

    return {
      source: "hybrid",
      chapters: combinedChapters,
      weebCentralUrl: weebCentralManga.url,
      missingCount: missingChapters.length,
    };
  } catch (error) {
    console.error("[Hybrid] Error fetching WeebCentral chapters:", error);
    console.error("[Hybrid] Stack trace:", error.stack);
    return {
      source: "mangadex",
      chapters: mangaDexChapters,
      error: error.message,
    };
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
        (page) => `${baseUrl}/data/${chapterData.hash}/${page}`,
      );
    }
  }

  throw new Error("Unable to fetch chapter pages");
}
