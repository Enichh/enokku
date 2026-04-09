const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://weebcentral.com";

class WeebCentralScraper {
  constructor() {
    this.session = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeout: 30000,
    });
  }

  async searchManga(query, limit = 10) {
    console.log(`[WeebCentral] searchManga called with query: "${query}"`);
    try {
      const searchUrl = `${BASE_URL}/search/data`;
      console.log(`[WeebCentral] Searching URL: ${searchUrl}`);

      const response = await this.session.get(searchUrl, {
        params: {
          text: query,
          sort: "Best Match",
          order: "Descending",
          display_mode: "Full Display",
        },
      });

      console.log(`[WeebCentral] Response status: ${response.status}`);

      const $ = cheerio.load(response.data);
      const results = [];

      // Try multiple selectors for search results
      // Primary: links in search results that go to /series/ paths
      $("a[href*='/series/']").each((_, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const link = $el.attr("href");

        if (title && link && results.length < limit) {
          // Avoid duplicates
          const exists = results.find(
            (r) => r.url === link || r.title === title,
          );
          if (!exists) {
            results.push({
              title,
              url: link.startsWith("http") ? link : `${BASE_URL}${link}`,
              source: "weebcentral",
            });
          }
        }
      });

      console.log(`[WeebCentral] Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error("[WeebCentral] Search error:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaUrl) {
    try {
      const response = await this.session.get(mangaUrl);
      const $ = cheerio.load(response.data);

      const title = $("h1").first().text().trim();
      const description = $("p").first().text().trim();
      const cover = $("img").first().attr("src");

      const chapters = await this.getChapters(mangaUrl);

      return {
        title,
        description,
        cover,
        chapters,
        source: "weebcentral",
        url: mangaUrl,
      };
    } catch (error) {
      console.error("[WeebCentral] Manga details error:", error.message);
      return null;
    }
  }

  async getChapters(mangaUrl) {
    try {
      const response = await this.session.get(mangaUrl);
      const $ = cheerio.load(response.data);

      const chapters = [];

      $("article").each((_, el) => {
        const $el = $(el);
        const links = $el.find("a");

        if (links.length >= 2) {
          const chapterLink = $(links[1]).attr("href");
          const chapterText = $(links[1]).text().trim();

          const chapterMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
          const chapterNum = chapterMatch ? chapterMatch[1] : null;

          if (chapterNum && chapterLink) {
            chapters.push({
              chapter: parseFloat(chapterNum),
              title: chapterText,
              url: chapterLink.startsWith("http")
                ? chapterLink
                : `${BASE_URL}${chapterLink}`,
              source: "weebcentral",
            });
          }
        }
      });

      return chapters.sort((a, b) => b.chapter - a.chapter);
    } catch (error) {
      console.error("[WeebCentral] Chapters error:", error.message);
      return [];
    }
  }

  async getChapterPages(chapterUrl) {
    try {
      const response = await this.session.get(chapterUrl);
      const $ = cheerio.load(response.data);

      const pages = [];

      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && (src.includes("weebcentral") || src.includes("mangasee"))) {
          pages.push(src);
        }
      });

      return [...new Set(pages)];
    } catch (error) {
      console.error("[WeebCentral] Pages error:", error.message);
      return [];
    }
  }

  async getLatestUpdates(limit = 20) {
    try {
      const response = await this.session.get(`${BASE_URL}/latest-updates/1`);
      const $ = cheerio.load(response.data);

      const updates = [];

      $("article").each((_, el) => {
        if (updates.length >= limit) return false;

        const $el = $(el);
        const mangaName = $el.attr("data-tip");
        const links = $el.find("a");

        if (links.length >= 2 && mangaName) {
          const mangaUrl = $(links[0]).attr("href");
          const chapterUrl = $(links[1]).attr("href");
          const chapterText = $(links[1]).text().trim();

          const chapterMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
          const chapterNum = chapterMatch ? parseFloat(chapterMatch[1]) : null;

          updates.push({
            manga: {
              title: mangaName,
              url: mangaUrl.startsWith("http")
                ? mangaUrl
                : `${BASE_URL}${mangaUrl}`,
            },
            chapter: {
              number: chapterNum,
              title: chapterText,
              url: chapterUrl.startsWith("http")
                ? chapterUrl
                : `${BASE_URL}${chapterUrl}`,
            },
            source: "weebcentral",
          });
        }
      });

      return updates;
    } catch (error) {
      console.error("[WeebCentral] Latest updates error:", error.message);
      return [];
    }
  }

  async findMangaByTitle(title) {
    console.log(`[WeebCentral] findMangaByTitle called with: "${title}"`);

    const searchResults = await this.searchManga(title, 5);
    console.log(
      `[WeebCentral] Search returned ${searchResults.length} results`,
    );

    if (searchResults.length === 0) {
      console.log(`[WeebCentral] No search results found`);
      return null;
    }

    // Search API already returns relevant results sorted by relevance
    // Return the first (best match) result
    console.log(
      `[WeebCentral] Returning first result: "${searchResults[0].title}"`,
    );
    return searchResults[0];
  }
}

module.exports = WeebCentralScraper;
