const axios = require("axios");

const BASE_URL = "https://atsu.moe";

class AtsumaruScraper {
  constructor() {
    this.session = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: BASE_URL,
      },
      timeout: 30000,
    });
  }

  async searchManga(query, limit = 10) {
    console.log(`[Atsumaru] Searching for: "${query}"`);
    try {
      const searchUrl = `${BASE_URL}/api/search/page`;
      console.log(
        `[Atsumaru] Requesting: ${searchUrl}?query=${encodeURIComponent(query)}`,
      );
      const response = await this.session.get(searchUrl, {
        params: { query, limit },
      });

      console.log(`[Atsumaru] Response status: ${response.status}`);
      console.log(
        `[Atsumaru] Response data:`,
        JSON.stringify(response.data, null, 2)?.substring(0, 2000),
      );

      if (response.data?.hits) {
        return response.data.hits.map((item) => ({
          id: item.id,
          title: item.title,
          url: `${BASE_URL}/manga/${item.id}`,
          image: item.image ? `${BASE_URL}/${item.image}` : null,
          type: item.type,
          isAdult: item.isAdult,
          source: "atsumaru",
        }));
      }

      return [];
    } catch (error) {
      console.error("[Atsumaru] Search error:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaId) {
    console.log(`[Atsumaru] Getting manga details: ${mangaId}`);
    try {
      const url = `${BASE_URL}/api/manga/page?id=${mangaId}`;
      console.log(`[Atsumaru] Requesting: ${url}`);
      const response = await this.session.get(url);

      console.log(`[Atsumaru] Response status: ${response.status}`);
      console.log(
        `[Atsumaru] Response data:`,
        JSON.stringify(response.data, null, 2)?.substring(0, 2000),
      );

      const data = response.data?.mangaPage;
      if (!data) {
        console.log("[Atsumaru] No manga data found");
        return null;
      }

      let chapters = data.chapters || [];

      if (data.hasMoreChapters && data.totalChapterCount > chapters.length) {
        console.log(
          `[Atsumaru] Fetching remaining ${data.totalChapterCount - chapters.length} chapters...`,
        );
        const remainingUrl = `${BASE_URL}/api/manga/chapters?id=${mangaId}&skip=${chapters.length}`;
        console.log(`[Atsumaru] Requesting: ${remainingUrl}`);

        const remainingResponse = await this.session.get(remainingUrl);
        const remainingChapters = remainingResponse.data?.chapters || [];
        console.log(
          `[Atsumaru] Fetched ${remainingChapters.length} additional chapters`,
        );

        chapters = [...chapters, ...remainingChapters];
      }

      return {
        id: data.id,
        title: data.title,
        englishTitle: data.englishTitle,
        description: data.synopsis,
        type: data.type,
        status: data.status,
        isAdult: data.isAdult,
        image: data.poster?.image ? `${BASE_URL}/${data.poster.image}` : null,
        otherNames: data.otherNames || [],
        genres: data.genres?.map((g) => g.name) || [],
        chapters: chapters.map((ch) => ({
          id: ch.id,
          number: ch.number,
          title: ch.title,
          pageCount: ch.pageCount,
          createdAt: ch.createdAt,
        })),
        totalChapterCount: data.totalChapterCount,
        source: "atsumaru",
      };
    } catch (error) {
      console.error("[Atsumaru] Manga details error:", error.message);
      return null;
    }
  }

  async getChapterPages(mangaId, chapterId) {
    console.log(`[Atsumaru] Getting chapter pages: ${chapterId}`);
    try {
      const url = `${BASE_URL}/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`;
      console.log(`[Atsumaru] Requesting: ${url}`);
      const response = await this.session.get(url);

      console.log(`[Atsumaru] Response status: ${response.status}`);
      console.log(
        `[Atsumaru] Response data:`,
        JSON.stringify(response.data, null, 2)?.substring(0, 2000),
      );

      const data = response.data?.readChapter;
      if (!data) {
        console.log("[Atsumaru] No chapter data found");
        return null;
      }

      return {
        id: data.id,
        title: data.title,
        pages: data.pages.map((p) => ({
          ...p,
          image: p.image.startsWith("http") ? p.image : `${BASE_URL}${p.image}`,
        })),
      };
    } catch (error) {
      console.error("[Atsumaru] Chapter pages error:", error.message);
      return null;
    }
  }

  async findMangaByTitle(title) {
    console.log(`[Atsumaru] Finding manga by title: "${title}"`);

    // First try direct API search
    const searchResults = await this.searchManga(title, 5);

    if (searchResults.length > 0) {
      // Return best match
      const normalizedTitle = title.toLowerCase();
      for (const result of searchResults) {
        const resultTitle = result.title.toLowerCase();
        const englishTitle = (result.englishTitle || "").toLowerCase();

        if (
          resultTitle.includes(normalizedTitle) ||
          normalizedTitle.includes(resultTitle) ||
          englishTitle.includes(normalizedTitle)
        ) {
          console.log(`[Atsumaru] Found match: "${result.title}"`);
          return result;
        }
      }
      // Return first result if no exact match
      return searchResults[0];
    }

    console.log("[Atsumaru] No search results, trying explore page");

    // Fallback: Try to get from explore/availableFilters
    try {
      const response = await this.session.get(
        `${BASE_URL}/api/explore/availableFilters`,
      );
      const manga = response.data?.mangaPage;

      if (
        manga &&
        manga.otherNames?.some(
          (name) =>
            name.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(name.toLowerCase()),
        )
      ) {
        return {
          id: manga.id,
          title: manga.title,
          url: `${BASE_URL}/manga/${manga.id}`,
          image: manga.poster?.image
            ? `${BASE_URL}/${manga.poster.image}`
            : null,
          type: manga.type,
          isAdult: manga.isAdult,
          source: "atsumaru",
        };
      }
    } catch (error) {
      console.error("[Atsumaru] Explore page error:", error.message);
    }

    return null;
  }

  async getLibrary() {
    console.log("[Atsumaru] Getting library");
    try {
      const response = await this.session.get(`${BASE_URL}/api/read/library`);
      return response.data?.items || [];
    } catch (error) {
      console.error("[Atsumaru] Library error:", error.message);
      return [];
    }
  }
}

module.exports = AtsumaruScraper;
