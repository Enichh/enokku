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
    try {
      const searchUrl = `${BASE_URL}/api/search/page`;
      const response = await this.session.get(searchUrl, {
        params: { query, limit },
      });

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
      return [];
    }
  }

  async getMangaDetails(mangaId) {
    try {
      const url = `${BASE_URL}/api/manga/page?id=${mangaId}`;
      const response = await this.session.get(url);

      const data = response.data?.mangaPage;
      if (!data) {
        return null;
      }

      let chapters = data.chapters || [];

      if (data.hasMoreChapters && chapters.length < data.totalChapterCount) {
        const allChaptersUrl = `${BASE_URL}/api/manga/allChapters?mangaId=${mangaId}`;

        const allChaptersResponse = await this.session.get(allChaptersUrl);
        const allChaptersData = allChaptersResponse.data;

        if (allChaptersData?.chapters) {
          chapters = allChaptersData.chapters;
        } else {
        }
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
      return null;
    }
  }

  async getChapterPages(mangaId, chapterId) {
    try {
      const url = `${BASE_URL}/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`;
      const response = await this.session.get(url);

      const data = response.data?.readChapter;
      if (!data) {
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
      return null;
    }
  }

  async findMangaByTitle(title) {
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
          return result;
        }
      }
      // Return first result if no exact match
      return searchResults[0];
    }

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
    } catch (error) {}

    return null;
  }

  async getLibrary() {
    try {
      const response = await this.session.get(`${BASE_URL}/api/read/library`);
      return response.data?.items || [];
    } catch (error) {
      return [];
    }
  }
}

module.exports = AtsumaruScraper;
