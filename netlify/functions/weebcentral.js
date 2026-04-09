const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://weebcentral.com";

class WeebCentralScraper {
  constructor() {
    this.session = axios.create({
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeout: 30000,
    });
  }

  async searchManga(query, limit = 10) {
    try {
      const response = await this.session.get(`${BASE_URL}/search/data`, {
        params: {
          text: query,
          sort: "Best Match",
          order: "Descending",
          display_mode: "Full Display",
        },
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $("span.tooltip.tooltip-bottom").each((_, el) => {
        const $el = $(el);
        const title = $el.attr("data-tip");
        const link = $el.find("a").attr("href");

        if (title && link && results.length < limit) {
          results.push({
            title,
            url: link.startsWith("http") ? link : `${BASE_URL}${link}`,
            source: "weebcentral",
          });
        }
      });

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
              url: chapterLink.startsWith("http") ? chapterLink : `${BASE_URL}${chapterLink}`,
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
              url: mangaUrl.startsWith("http") ? mangaUrl : `${BASE_URL}${mangaUrl}`,
            },
            chapter: {
              number: chapterNum,
              title: chapterText,
              url: chapterUrl.startsWith("http") ? chapterUrl : `${BASE_URL}${chapterUrl}`,
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
    const searchResults = await this.searchManga(title, 5);

    for (const result of searchResults) {
      if (result.title.toLowerCase().includes(title.toLowerCase()) ||
          title.toLowerCase().includes(result.title.toLowerCase())) {
        return result;
      }
    }

    return searchResults[0] || null;
  }
}

module.exports = WeebCentralScraper;
