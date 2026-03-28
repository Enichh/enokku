# Manga Reader

A static manga reader web application that uses the MangaDex API. Built with vanilla JavaScript, HTML, and CSS.

## Features

- **Catalog Page**: Browse and search manga from MangaDex
- **Details Page**: View manga information, description, and chapter list
- **Reader Page**: Read chapters with previous/next navigation
- **Dark Theme**: Easy on the eyes for long reading sessions

## Project Structure

```
├── index.html          # Catalog/Search page
├── manga.html          # Manga details page
├── reader.html         # Chapter reader page
├── css
│   └── style.css       # Global styles
├── js
│   ├── api.js          # MangaDex API functions
│   ├── utils.js        # Helper functions
│   ├── catalog.js      # Catalog page logic
│   ├── details.js      # Details page logic
│   └── reader.js       # Reader page logic
└── netlify.toml        # Netlify deployment config
```

## API Usage

This application uses the [MangaDex API](https://api.mangadex.org) to fetch manga data. No API key is required for public endpoints.

## Running Locally

Simply open `index.html` in your browser or use a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .
```

## Deployment

Deploy to Netlify by connecting this repository. The `netlify.toml` is already configured for static site deployment.

## Keyboard Shortcuts

- **Arrow Left**: Previous chapter
- **Arrow Right**: Next chapter

## Notes

- Only English-translated content is displayed
- Cover images and chapter pages are loaded directly from MangaDex
- Due to CORS restrictions, a local server is recommended for development
