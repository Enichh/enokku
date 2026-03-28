import { fetchMangaDetails, fetchMangaFeed, getCoverUrl, findRelationship } from './api.js';
import { getUrlParam, formatDate, truncateText, showLoading, showError } from './utils.js';
import { debounce } from './utils.js';

const mangaDetailsContainer = document.getElementById('mangaDetails');
const chapterListContainer = document.getElementById('chapterList');
const searchInput = document.getElementById('searchInput');

const mangaId = getUrlParam('id');

if (!mangaId) {
    showError('mangaDetails', 'No manga ID provided');
}

async function loadMangaDetails() {
    showLoading('mangaDetails');
    
    try {
        const { data: manga } = await fetchMangaDetails(mangaId);
        
        const coverArt = findRelationship(manga, 'cover_art');
        const author = findRelationship(manga, 'author');
        
        const coverUrl = coverArt 
            ? getCoverUrl(mangaId, coverArt, '512') 
            : 'https://via.placeholder.com/512x768?text=No+Cover';
        
        const title = manga.attributes.title?.en || 
                      Object.values(manga.attributes.title)[0] || 
                      'Unknown Title';
        
        const altTitles = manga.attributes.altTitles?.map(t => Object.values(t)[0]).join(', ') || '';
        const description = manga.attributes.description?.en || 
                         Object.values(manga.attributes.description || {})[0] || 
                         'No description available';
        
        const tags = manga.attributes.tags?.map(tag => {
            const tagName = tag.attributes?.name?.en || '';
            return tagName ? `<span class="status">${tagName}</span>` : '';
        }).join(' ') || '';
        
        mangaDetailsContainer.innerHTML = `
            <div class="manga-cover">
                <img src="${coverUrl}" alt="${title}" onerror="this.src='https://via.placeholder.com/512x768?text=No+Cover'">
            </div>
            <div class="manga-info">
                <h1>${title}</h1>
                ${altTitles ? `<div class="alt-titles">${truncateText(altTitles, 100)}</div>` : ''}
                <div class="status">${manga.attributes.status || 'Unknown'} · ${author?.attributes?.name || 'Unknown Author'}</div>
                <div style="margin: 0.5rem 0;">${tags}</div>
                <div class="description">${truncateText(description, 500)}</div>
            </div>
        `;
        
        loadChapters();
        
    } catch (error) {
        showError('mangaDetails', error.message);
    }
}

async function loadChapters() {
    try {
        const { data: chapters } = await fetchMangaFeed(mangaId);
        
        if (!chapters || chapters.length === 0) {
            chapterListContainer.innerHTML = '<div class="empty"><p>No chapters available</p></div>';
            return;
        }
        
        chapterListContainer.innerHTML = '<h2>Chapters</h2>';
        
        chapters.forEach(chapter => {
            const chapterNum = chapter.attributes.chapter || '?';
            const chapterTitle = chapter.attributes.title || '';
            const pages = chapter.attributes.pages || 0;
            const publishedAt = formatDate(chapter.attributes.publishAt);
            
            const chapterItem = document.createElement('div');
            chapterItem.className = 'chapter-item';
            chapterItem.innerHTML = `
                <div>
                    <div class="chapter-title">Chapter ${chapterNum}${chapterTitle ? ` - ${chapterTitle}` : ''}</div>
                    <div class="chapter-meta">${pages} pages · ${publishedAt}</div>
                </div>
            `;
            
            chapterItem.addEventListener('click', () => {
                window.location.href = `reader.html?id=${chapter.id}&manga=${mangaId}`;
            });
            
            chapterListContainer.appendChild(chapterItem);
        });
        
    } catch (error) {
        chapterListContainer.innerHTML = `<div class="error"><p>Error loading chapters: ${error.message}</p></div>`;
    }
}

const debouncedSearch = debounce((query) => {
    if (query) {
        window.location.href = `index.html?search=${encodeURIComponent(query)}`;
    }
}, 500);

searchInput?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value.trim());
});

loadMangaDetails();
