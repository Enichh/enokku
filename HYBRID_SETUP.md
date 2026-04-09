# Enokku Manga Reader - Hybrid Setup

This setup adds **Atsumaru** and **MangaKakalot** as fallback chapter sources alongside **MangaDex**.

## Files Added/Modified

### Netlify Functions

- `netlify/functions/atsumaru.js` - Core scraper for Atsumaru
- `netlify/functions/atsumaru-handler.js` - API endpoints for Atsumaru
- `netlify/functions/mangakakalot.js` - Core scraper for MangaKakalot
- `netlify/functions/mangakakalot-handler.js` - API endpoints for MangaKakalot

### Frontend

- `js/atsumaru-api.js` - Frontend API client for Atsumaru
- `js/hybrid-api.js` - Unified multi-source hybrid API
- `js/details-hybrid.js` - Manga details page with hybrid chapter loading
- `js/reader-hybrid.js` - Reader page supporting all sources
- `manga.html` - Manga details page (uses hybrid script)
- `reader.html` - Reader page (uses hybrid script)

### Config

- `netlify.toml` - Added `/atsumaru/*` and `/mangakakalot/*` redirects
- `package.json` - Added axios dependency
- `css/style.css` - Added source indicator styling

## How It Works

1. When viewing a manga, the app first loads chapters from **MangaDex**
2. Then searches **Atsumaru** for the same manga by title
3. If found, fetches Atsumaru chapters and identifies any **missing** from MangaDex
4. Then searches **MangaKakalot** as a final fallback
5. Combines all sources: MangaDex + Atsumaru + MangaKakalot chapters
6. Displays chapters with visual indicators showing source

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Test Locally

```bash
npm run dev
```

Or use Netlify CLI directly:

```bash
netlify dev
```

### 3. Deploy

```bash
netlify deploy --prod
```

## API Endpoints

| Endpoint                                                    | Description                  |
| ----------------------------------------------------------- | ---------------------------- |
| `/atsumaru/search?q={query}`                                | Search manga on Atsumaru     |
| `/atsumaru/find?title={title}`                              | Find manga by title match    |
| `/atsumaru/manga?id={id}`                                   | Get manga details            |
| `/atsumaru/chapter?mangaId={id}&chapterId={id}`             | Get chapter pages            |
| `/mangakakalot/search?q={query}`                            | Search manga on MangaKakalot |
| `/mangakakalot/find?title={title}`                          | Find manga by title match    |
| `/mangakakalot/manga?slug={slug}`                           | Get manga details            |
| `/mangakakalot/chapter?mangaSlug={slug}&chapterSlug={slug}` | Get chapter pages            |

## Usage

### Hybrid Chapter Loading

The `getChaptersHybrid()` function in `hybrid-api.js` automatically handles combining sources:

```javascript
import { getChaptersHybrid } from "./hybrid-api.js";

const result = await getChaptersHybrid(
  ["Solo Leveling", "Na Honjaman Level Up"],
  mangadexChapters,
);
// result.source = "hybrid" | "mangadex"
// result.chapters = combined array
// result.atsumaruId = Atsumaru ID if found
// result.mangakakalotSlug = MangaKakalot slug if found
// result.missingCount = number of additional chapters added
```

### Reading Chapters

The hybrid reader automatically handles all sources:

- `source=mangadex` - Uses MangaDex at-home server
- `source=atsumaru` - Uses Atsumaru image CDN
- `source=mangakakalot` - Scrapes MangaKakalot pages

## Visual Indicators

- **Orange left border** on chapter items = Atsumaru source
- **Blue left border** on chapter items = MangaKakalot source
- **📚 icon** = Atsumaru chapter
- **🗂️ icon** = MangaKakalot chapter
- **"Hybrid Source" badge** in chapter list header (when multiple sources used)
- Hover tooltip shows chapter counts per source

## Important Notes

1. **Atsumaru responses** - Usually fast (1-2 seconds), reliable API
2. **MangaKakalot** - May be blocked by Cloudflare (403 errors)
3. **Rate limiting** - Be mindful of request frequency
4. **Fallback behavior** - If sources fail, falls back to MangaDex only

## Source Priority

1. **MangaDex** (primary) - Official API, fastest
2. **Atsumaru** (secondary) - Good coverage, reliable
3. **MangaKakalot** (tertiary) - HTML scraping, may be blocked
