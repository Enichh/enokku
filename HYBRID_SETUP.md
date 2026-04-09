# Enokku Manga Reader - Hybrid Setup

This setup adds **Weeb Central** as a fallback chapter source alongside **MangaDex**.

## Files Added/Modified

### Netlify Functions
- `netlify/functions/weebcentral.js` - Core scraper for Weeb Central
- `netlify/functions/weebcentral-handler.js` - API endpoints for Weeb Central

### Frontend
- `js/weebcentral-api.js` - Frontend API client for Weeb Central
- `js/details-hybrid.js` - Manga details page with hybrid chapter loading
- `js/reader-hybrid.js` - Reader page supporting both sources
- `manga-hybrid.html` - Manga details page (uses hybrid script)
- `reader-hybrid.html` - Reader page (uses hybrid script)

### Config
- `netlify.toml` - Added `/weebcentral/*` redirect
- `package.json` - Added axios and cheerio dependencies
- `css/style.css` - Added Weeb Central chapter styling

## How It Works

1. When viewing a manga, the app first loads chapters from **MangaDex**
2. Then searches **Weeb Central** for the same manga by title
3. If found, fetches Weeb Central chapters and identifies any **missing** from MangaDex
4. Combines both sources: MangaDex chapters + missing Weeb Central chapters
5. Displays chapters with visual indicators showing source (🌐 = Weeb Central)

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

| Endpoint | Description |
|----------|-------------|
| `/weebcentral/search?q={query}` | Search manga on Weeb Central |
| `/weebcentral/find?title={title}` | Find manga by title match |
| `/weebcentral/manga?url={url}` | Get manga details |
| `/weebcentral/chapters?url={url}` | Get chapter list |
| `/weebcentral/pages?url={url}` | Get chapter page URLs |
| `/weebcentral/latest?limit={n}` | Get latest updates |

## Usage

### Hybrid Chapter Loading

The `getChaptersHybrid()` function in `weebcentral-api.js` automatically handles combining sources:

```javascript
import { getChaptersHybrid } from "./weebcentral-api.js";

const result = await getChaptersHybrid("One Piece", mangadexChapters);
// result.source = "hybrid" | "mangadex"
// result.chapters = combined array
// result.weebCentralUrl = Weeb Central URL if found
// result.missingCount = number of Weeb Central chapters added
```

### Reading Chapters

The hybrid reader automatically handles both sources:
- Pass `source=weebcentral` and `chapterUrl={url}` for Weeb Central chapters
- Pass `source=mangadex` (or omit) for MangaDex chapters

## Visual Indicators

- **Blue left border** on chapter items = Weeb Central source
- **🌐 icon** = Weeb Central chapter
- **"Hybrid Source" badge** in chapter list header (when both sources used)
- Hover tooltip shows how many chapters came from Weeb Central

## Important Notes

1. **Scraping can be slow** - Weeb Central responses take 2-5 seconds
2. **Rate limiting** - Be mindful of request frequency
3. **Legal considerations** - Weeb Central hosts copyrighted content
4. **Fallback behavior** - If Weeb Central fails, falls back to MangaDex only

## Switching from Original to Hybrid

To use the hybrid version:

1. Rename `manga.html` to `manga-original.html`
2. Rename `manga-hybrid.html` to `manga.html`
3. Rename `reader.html` to `reader-original.html`
4. Rename `reader-hybrid.html` to `reader.html`

Or update links in `home.js` to point to `-hybrid.html` files.
