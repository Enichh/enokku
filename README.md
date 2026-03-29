# Enokku

A modern manga and manhwa reader web application powered by the MangaDex API. Built with vanilla JavaScript, featuring an MSI-inspired red and black aesthetic.

![Enokku](assets/favicon.svg)

## Features

- **Home Page**: Browse trending, top-rated, and recently updated manga/manhwa with category filtering (All/Manga/Manhwa)
- **Search**: Real-time search with debounced input
- **Manga Details**: View comprehensive manga info, descriptions, tags, and paginated chapter lists
- **Chapter Reader**: Read chapters with smooth scrolling, keyboard navigation (Arrow keys), and chapter-to-chapter navigation
- **MSI Red Theme**: Sleek dark interface with red accents and glow effects
- **Responsive Design**: Works on desktop and mobile devices
- **Accessibility**: Skip links, ARIA labels, semantic HTML

## Project Structure

```
enokku/
├── index.html              # Home page with category tabs and manga sections
├── manga.html              # Manga details page with chapter listing
├── reader.html             # Chapter reader with page viewer
├── css/
│   └── style.css           # Global MSI-inspired red/black theme styles
├── js/
│   ├── api.js              # MangaDex API wrapper functions
│   ├── utils.js            # Helper utilities (debounce, formatting, etc.)
│   ├── home.js             # Home page logic with category filtering
│   ├── catalog.js          # Catalog/grid view with infinite scroll
│   ├── details.js          # Manga details and chapter pagination
│   └── reader.js           # Chapter reader and navigation
├── assets/
│   └── favicon.svg         # Enokku branded favicon
├── netlify/
│   └── functions/
│       └── api.js          # Netlify function for API proxy and image proxy
├── netlify.toml            # Netlify deployment configuration
└── README.md               # This file
```

## File Descriptions

### HTML Pages

| File          | Purpose                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`  | Main entry point. Features hero section, category tabs (All/Manga/Manhwa), and multiple manga sections (Trending, Top Rated, Recently Updated, etc.) |
| `manga.html`  | Manga detail page. Shows cover, title, description, tags, author info, and paginated chapter list (50 chapters per page)                             |
| `reader.html` | Chapter reader. Displays manga pages with previous/next chapter navigation and keyboard shortcuts                                                    |

### JavaScript Modules

| File            | Purpose                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/api.js`     | API layer. Functions: `fetchMangaList`, `searchManga`, `fetchMangaDetails`, `fetchMangaFeed` (with bidirectional pagination for 500+ chapters), `fetchChapterPages`, `getCoverUrl`, `getEnglishTitle` |
| `js/utils.js`   | Utility functions: `debounce`, `formatDate`, `truncateText`, `getUrlParam`, `showLoading`, `showError`, `getPlaceholderImage`                                                                         |
| `js/home.js`    | Home page controller. Manages category tabs (All/Manga/Manhwa filtering), loads multiple manga sections, handles search                                                                               |
| `js/catalog.js` | Catalog view with infinite scroll pagination (30 items per load). Grid layout for browsing manga                                                                                                      |
| `js/details.js` | Manga details controller. Loads manga info, fetches chapters with deduplication, renders paginated chapter list                                                                                       |
| `js/reader.js`  | Reader controller. Loads chapter pages from MangaDex@Home, handles navigation between chapters, keyboard shortcuts                                                                                    |

### Styles & Assets

| File                       | Purpose                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `css/style.css`            | Complete MSI-themed stylesheet with CSS variables for theming. Features red accent (#ff0000), dark backgrounds, glow effects, responsive grid layouts |
| `assets/favicon.svg`       | Vector favicon with stylized "E" and red gradient glow                                                                                                |
| `netlify/functions/api.js` | Serverless function that proxies MangaDex API requests and handles image proxying with proper headers                                                 |
| `netlify.toml`             | Deployment config with security headers and API redirect rules                                                                                        |

## API Architecture

### Client-Side API (`js/api.js`)

The application uses a local API base URL (`/api`) that gets redirected to the Netlify function:

- **Manga Listing**: `GET /api/manga` - Browse/search with filters
- **Manga Details**: `GET /api/manga/:id` - Get full manga info
- **Manga Feed**: `GET /api/manga/:id/feed` - Get chapters (handles bidirectional pagination for 500+ chapter manga)
- **Chapter Pages**: `GET /api/at-home/server/:chapterId` - Get image URLs from MangaDex@Home
- **Image Proxy**: `GET /api/proxy?imageUrl=` - Proxy images through Netlify to avoid CORS

### Bidirectional Chapter Fetching

MangaDex API has a 500 result limit on feed endpoints. For manga with 500+ chapters:

1. First fetch: Ascending order (gets chapters 1-500)
2. Second fetch: Descending order (gets latest chapters)
3. Merge and deduplicate by chapter ID
4. Deduplicate by chapter number (keeps version with most pages)

### Netlify Function (`netlify/functions/api.js`)

Proxies requests to `api.mangadex.org` with:

- CORS headers for cross-origin access
- User-Agent header for API compliance
- Image proxy capability for chapter pages
- 15-minute URL validity handling

## Theming

The MSI-inspired theme uses CSS custom properties:

```css
--bg-primary: #0a0a0a; /* Deep black background */
--bg-secondary: #141414; /* Card backgrounds */
--bg-tertiary: #1f1f1f; /* Input/elevated surfaces */
--accent: #ff0000; /* MSI red */
--accent-hover: #cc0000; /* Darker red */
--accent-glow: rgba(255, 0, 0, 0.3); /* Glow effects */
```

Features:

- Red glow on hover for interactive elements
- Gradient text effects in hero section
- Red scrollbar styling
- Glowing active tab indicator

## Category Filtering

The home page supports three category views:

| Tab        | Visible Sections                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| **All**    | Trending, Recently Updated, Recently Added, Most Followed Manga, Most Followed Manhwa, Top Rated Manga, Top Rated Manhwa |
| **Manga**  | Most Followed Manga, Top Rated Manga (Japanese content only)                                                             |
| **Manhwa** | Most Followed Manhwa, Top Rated Manhwa (Korean content only)                                                             |

Mixed sections (Trending, Recently Updated) are hidden when filtering.

## Keyboard Shortcuts

| Key               | Action           |
| ----------------- | ---------------- |
| `←` (Arrow Left)  | Previous chapter |
| `→` (Arrow Right) | Next chapter     |

## Deployment

### Netlify (Recommended)

1. Connect repository to Netlify
2. `netlify.toml` is pre-configured with:
   - API redirects to serverless functions
   - Security headers (CSP, XSS protection, etc.)
   - Static site publishing

### Local Development

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000`

## Technical Notes

- **No API Key Required**: Uses MangaDex public endpoints
- **English Only**: All content filtered to English translations
- **Chapter Deduplication**: Multiple scanlation groups uploading same chapter number - keeps highest quality (most pages)
- **Image Proxying**: Chapter images proxied through Netlify to handle CORS and authentication header stripping
- **15-Minute URL Validity**: MangaDex@Home URLs expire; reader doesn't currently auto-refresh (would need re-implementation for very long reading sessions)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers with ES6 module support

## License

This project is for educational purposes. Manga content is provided by MangaDex. Respect their Terms of Service and rate limits.

---

Powered by [MangaDex API](https://api.mangadex.org) | Built with ❤️ and ☕
