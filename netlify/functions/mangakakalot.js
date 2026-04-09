const axios = require("axios");

const BASE_URL = "https://www.mangakakalot.gg";

class MangaKakalotScraper {
  constructor() {
    this.session = axios.create({
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": BASE_URL,
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
      // Try direct API with slugified title
      const slug = this.titleToSlug(query);
      const response = await this.session.get(`${BASE_URL}/api/manga/${slug}/chapters`, {
        params: { limit: 1, offset: 0 },
      });

      if (response.data?.success && response.data?.data?.chapters) {
        return [{
          id: slug,
          title: query,
          slug: slug,
          url: `${BASE_URL}/manga/${slug}`,
          source: "mangakakalot",
        }];
      }

      return [];
    } catch (error) {
      console.error("[MangaKakalot] Search error:", error.message);
      return [];
    }
  }

  async getMangaDetails(mangaSlug) {
    console.log(`[MangaKakalot] Getting manga details: ${mangaSlug}`);
    try {
      // Get chapters with pagination
      const response = await this.session.get(`${BASE_URL}/api/manga/${mangaSlug}/chapters`, {
        params: { limit: 100, offset: 0 },
      });

      if (!response.data?.success) {
        console.log("[MangaKakalot] API returned unsuccessful");
        return null;
      }

      const data = response.data.data;
      
      return {
        id: mangaSlug,
        slug: mangaSlug,
        title: mangaSlug.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        chapters: (data.chapters || []).map(ch => ({
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
        imageUrls.push(...matches.filter(url => 
          url.includes("chapter") || 
          url.includes("page") ||
          url.includes("manga") ||
          url.includes("mkkl")
        ));
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
    
    // Direct slug conversion approach
    const slug = this.titleToSlug(title);
    
    try {
      // Test if the manga exists by fetching chapters
      const response = await this.session.get(`${BASE_URL}/api/manga/${slug}/chapters`, {
        params: { limit: 1, offset: 0 },
      });

      if (response.data?.success && response.data?.data?.chapters?.length > 0) {
        console.log(`[MangaKakalot] Found manga: "${title}" (slug: ${slug})`);
        return {
          id: slug,
          title: title,
          slug: slug,
          url: `${BASE_URL}/manga/${slug}`,
          source: "mangakakalot",
        };
      }
    } catch (error) {
      console.error("[MangaKakalot] Find error:", error.message);
    }

    console.log(`[MangaKakalot] Manga not found: "${title}"`);
    return null;
  }
}

module.exports = MangaKakalotScraper;
