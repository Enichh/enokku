const axios = require("axios");

const BASE_URL = "https://www.mangakakalot.gg";

class MangaKakalotScraper {
  constructor() {
    this.session = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: BASE_URL,
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Cache-Control": "max-age=0",
      },
      timeout: 30000,
    });
  }

  // Convert title to manga slug (basic implementation)
  titleToSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
  }

  async searchManga(query, limit = 10) {
    console.log(`[MangaKakalot] Searching for: "${query}"`);
    try {
      const slug = this.titleToSlug(query);
      const searchUrl = `${BASE_URL}/search/story/${slug}`;
      console.log(`[MangaKakalot] Requesting: ${searchUrl}`);

      const response = await this.session.get(searchUrl);

      console.log(`[MangaKakalot] Response status: ${response.status}`);
      console.log(
        `[MangaKakalot] Response preview:`,
        response.data?.substring(0, 500),
      );

      const html = response.data;
      const results = [];

      const itemRegex =
        /<div[^>]*class="[^"]*story_item[^"]*"[^>]*>.*?<a[^>]*href="([^"]*\/manga\/([^"]*))"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>.*?<h3[^>]*class="[^"]*story_name[^"]*"[^>]*>(.*?)<\/h3>/gis;
      let match;

      while (
        (match = itemRegex.exec(html)) !== null &&
        results.length < limit
      ) {
        const url = match[1];
        const id = match[2];
        const image = match[3];
        const titleMatch = match[4].match(/>([^<]*)</);
        const title = titleMatch ? titleMatch[1].trim() : query;

        results.push({
          id,
          title,
          slug: id,
          url,
          image: image.startsWith("http") ? image : `${BASE_URL}${image}`,
          source: "mangakakalot",
        });
      }

      if (results.length === 0) {
        const altRegex =
          /<a[^>]*href="([^"]*\/manga\/([^"\/]*))"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"/gi;
        while (
          (match = altRegex.exec(html)) !== null &&
          results.length < limit
        ) {
          const url = match[1];
          const id = match[2];
          const image = match[3];
          const title = match[4];

          if (!results.find((r) => r.id === id)) {
            results.push({
              id,
              title,
              slug: id,
              url,
              image: image.startsWith("http") ? image : `${BASE_URL}${image}`,
              source: "mangakakalot",
            });
          }
        }
      }

      return results;
    } catch (error) {
      console.error("[MangaKakalot] Search error:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaSlug) {
    console.log(`[MangaKakalot] Getting manga details: ${mangaSlug}`);
    try {
      // Get chapters with pagination
      const response = await this.session.get(
        `${BASE_URL}/api/manga/${mangaSlug}/chapters`,
        {
          params: { limit: 100, offset: 0 },
        },
      );

      if (!response.data?.success) {
        console.log("[MangaKakalot] API returned unsuccessful");
        return null;
      }

      const data = response.data.data;

      return {
        id: mangaSlug,
        slug: mangaSlug,
        title: mangaSlug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        chapters: (data.chapters || []).map((ch) => ({
          id: ch.chapter_slug,
          number: ch.chapter_num,
          title: ch.chapter_name,
          slug: ch.chapter_slug,
          updatedAt: ch.updated_at,
          views: ch.view,
        })),
        pagination: data.pagination,
        source: "mangakakalot",
      };
    } catch (error) {
      console.error("[MangaKakalot] Manga details error:", error.message);
      return null;
    }
  }

  async getChapterPages(mangaSlug, chapterSlug) {
    console.log(`[MangaKakalot] Getting chapter pages: ${chapterSlug}`);
    try {
      // MangaKakalot chapter pages are typically at:
      // /manga/{manga-slug}/{chapter-slug}
      // Need to scrape the HTML for image URLs
      const chapterUrl = `${BASE_URL}/manga/${mangaSlug}/${chapterSlug}`;
      const response = await this.session.get(chapterUrl);

      // Parse HTML for image URLs
      const html = response.data;
      const imageUrls = [];

      // Common patterns for manga images
      const imgRegex = /https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi;
      const matches = html.match(imgRegex);

      if (matches) {
        // Filter for likely manga page images
        imageUrls.push(
          ...matches.filter(
            (url) =>
              url.includes("chapter") ||
              url.includes("page") ||
              url.includes("manga") ||
              url.includes("mkkl"),
          ),
        );
      }

      return {
        chapterSlug,
        pages: [...new Set(imageUrls)], // Remove duplicates
      };
    } catch (error) {
      console.error("[MangaKakalot] Chapter pages error:", error.message);
      return null;
    }
  }

  async findMangaByTitle(title) {
    console.log(`[MangaKakalot] Finding manga by title: "${title}"`);

    const searchResults = await this.searchManga(title, 5);

    if (searchResults.length === 0) {
      console.log(`[MangaKakalot] No search results for: "${title}"`);
      return null;
    }

    const normalizedTitle = title.toLowerCase();

    for (const result of searchResults) {
      const resultTitle = result.title.toLowerCase();
      if (
        resultTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(resultTitle)
      ) {
        console.log(`[MangaKakalot] Found match: "${result.title}"`);
        return result;
      }
    }

    console.log(
      `[MangaKakalot] Returning first result: "${searchResults[0].title}"`,
    );
    return searchResults[0];
  }
}

module.exports = MangaKakalotScraper;
