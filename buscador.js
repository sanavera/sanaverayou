// Contiene toda la lógica para buscar canciones en YouTube y álbumes en Archive.org.

import { isFav } from './firebase.js';
import { cleanAuthor, cleanTitle, favIconSvg, dotsSvg, updateHomeGridVisibility, switchView, showToast } from './main.js';
import { setQueue, playCurrent, refreshIndicators, renderQueue } from './reproductor.js';

// --- Constantes del Scraper ---
const SCRAPER_HOST = "https://sy-scraper.onrender.com";
const scraperYTM = (q) => `${SCRAPER_HOST}/?ytm=${encodeURIComponent(q)}`;
const scraperYT = (q) => `${SCRAPER_HOST}/?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${q}`)}`;
const YT_ID_11 = /(?:v=|shorts\/|be\/)([a-zA-Z0-9_-]{11})/;
const extractId = (url) => {
    const m = String(url || '').match(YT_ID_11);
    return m ? m[1] : null;
};

// --- Estado del Módulo ---
export let items = [];
let currentSearchType = 'youtube'; // 'youtube' o 'archive'
let searchAbort = null;
let paging = { query: "", loading: false, page: 1 };
const ARCHIVE_PAGE_SIZE = 50;
const archiveSearchCache = new Map();

// --- Utilidades de Red ---
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
}

// --- Punto de Entrada Principal ---
export function setSearchType(type) {
    currentSearchType = type;
    document.querySelectorAll('#searchTypeSwitch .switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
}

export async function startSearch(query) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    paging = { query, loading: true, page: 1 };
    items = [];
    if(currentSearchType === 'archive') archiveSearchCache.clear();

    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando…</h3><p>Esto puede tardar un momento.</p></div>`;
    updateHomeGridVisibility();

    if (currentSearchType === 'archive') {
        await archiveSearchAlbums(query);
    } else {
        await searchYoutubeParallel(query);
    }
}

// --- Lógica de Búsqueda (YouTube) ---
async function parseScraperResponse(response) {
    if (!response.ok) return [];
    const text = await response.text();
    const ids = text.split('\n').map(line => extractId(line.trim())).filter(Boolean);
    return [...new Set(ids)];
}

async function searchYoutubeParallel(query) {
    const resultsEl = document.getElementById("results");
    
    const ytmPromise = fetchWithTimeout(scraperYTM(query), { signal: searchAbort.signal }).then(parseScraperResponse);
    const ytPromise = fetchWithTimeout(scraperYT(query), { signal: searchAbort.signal }).then(parseScraperResponse);

    try {
        const [ytmIds, ytIds] = await Promise.all([ytmPromise, ytPromise]);
        if (searchAbort.signal.aborted) return;

        const ytmIdSet = new Set(ytmIds);
        const uniqueYtIds = ytIds.filter(id => !ytmIdSet.has(id));
        const combinedIds = [...ytmIds, ...uniqueYtIds].slice(0, 40); // Limitar resultados

        if (combinedIds.length === 0) {
            resultsEl.innerHTML = `<div class="empty muted">No se encontraron resultados para "${query}".</div>`;
            updateHomeGridVisibility();
            return;
        }

        const videoDetails = await fetchVideoDetailsByIds(combinedIds);
        items = videoDetails.map(video => ({ ...video, sourceHint: ytmIdSet.has(video.id) ? 'ytm' : 'yt' }));
        
        renderYoutubeResults(items);

    } catch (e) {
        if (e.name !== 'AbortError') {
            resultsEl.innerHTML = `<div class="empty muted">Error en la búsqueda. Reintentá por favor.</div>`;
            updateHomeGridVisibility();
        }
    } finally {
        paging.loading = false;
    }
}

async function fetchVideoDetailsByIds(ids) {
    if (ids.length === 0) return [];
    // Usamos un endpoint que acepta múltiples IDs para eficiencia.
    const idsString = ids.join(',');
    try {
        const response = await fetchWithTimeout(`${SCRAPER_HOST}/?details=${idsString}`);
        if (!response.ok) throw new Error('Failed to fetch details');
        const details = await response.json();
        return ids.map(id => {
            const meta = details[id];
            if (!meta) return null;
            return {
                id,
                title: cleanTitle(meta.title),
                thumb: meta.thumb,
                author: cleanAuthor(meta.author),
                source: 'youtube',
                type: 'youtube_video'
            };
        }).filter(Boolean);
    } catch (e) {
        console.error("Error fetching video details:", e);
        return []; // Devolver vacío en caso de error para no romper la UI
    }
}

// --- Lógica de Búsqueda (Archive.org) ---
function getArchiveSortScore(title, query) {
    const normalizedTitle = title.toLowerCase().trim();
    const normalizedQuery = query.toLowerCase().trim();
    if (normalizedTitle === normalizedQuery) return 3;
    if (normalizedTitle.startsWith(normalizedQuery)) return 2;
    if (normalizedTitle.includes(normalizedQuery)) return 1;
    return 0;
}

async function archiveSearchAlbums(query) {
    const page = paging.page;
    const cacheKey = `${query.toLowerCase().trim()}|${page}`;

    if (page === 1 && archiveSearchCache.has(cacheKey)) {
        items = archiveSearchCache.get(cacheKey);
        renderArchiveResults(items);
        paging.loading = false;
        return;
    }

    const archiveQuery = `(creator:"${query}" OR title:"${query}") AND mediatype:audio`;
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(archiveQuery)}&fl[]=identifier,title,creator&sort[]=downloads+desc&rows=${ARCHIVE_PAGE_SIZE}&page=${page}&output=json`;

    try {
        const response = await fetchWithTimeout(url, { signal: searchAbort?.signal });
        if (!response.ok) throw new Error(`API de Archive.org respondió con ${response.status}`);
        const data = await response.json();
        if (searchAbort.signal.aborted) return;

        const docs = data.response?.docs || [];
        let newAlbums = docs.map(doc => ({
            id: doc.identifier,
            title: doc.title || 'Sin título',
            author: Array.isArray(doc.creator) ? doc.creator.join(', ') : (doc.creator || 'Desconocido'),
            thumb: `https://archive.org/services/img/${doc.identifier}`,
            source: 'archive',
            type: 'archive_album'
        }));

        if (page === 1) {
            newAlbums.sort((a, b) => getArchiveSortScore(b.title, query) - getArchiveSortScore(a.title, query));
            items = newAlbums;
            archiveSearchCache.set(cacheKey, items);
        } else {
            items = [...items, ...newAlbums];
        }
        renderArchiveResults(items);
    } catch (e) {
        if (e.name !== 'AbortError' && page === 1) {
            document.getElementById("results").innerHTML = `<div class="empty muted">Error al buscar álbumes.</div>`;
        }
    } finally {
        paging.loading = false;
        updateHomeGridVisibility();
    }
}

async function openArchiveAlbum(album) {
    showToast(`Cargando álbum: ${album.title}...`);
    try {
        const url = `https://archive.org/metadata/${album.id}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error("No se pudo obtener la metadata.");
        const data = await response.json();
        const AUDIO_FORMATS = ['mp3', 'flac', 'wav', 'ogg', 'm4a'];
        const audioFiles = (data.files || []).filter(f => AUDIO_FORMATS.some(ext => new RegExp(`\\.${ext}$`, 'i').test(f.name || '')));
        if (audioFiles.length === 0) {
            showToast("Este álbum no contiene canciones válidas.", true);
            return;
        }
        const tracks = audioFiles.map(file => ({
            id: `${album.id}/${file.name}`,
            title: cleanArchiveTrackTitle(file.title || file.name),
            author: album.author,
            thumb: album.thumb,
            source: 'archive',
            type: 'archive_track',
            urls: { mp3: `https://archive.org/download/${album.id}/${encodeURIComponent(file.name)}` }
        }));
        
        setQueue(tracks, 'archive_album', 0);
        switchView('view-player');
        renderQueue(tracks, album.title);
        playCurrent(true);
    } catch (e) {
        showToast("No se pudo cargar el álbum.", true);
    }
}

function cleanArchiveTrackTitle(rawTitle) {
    if (!rawTitle) return "Canción sin título";
    let title = rawTitle.replace(/\.(mp3|flac|wav|ogg|m4a)$/i, '');
    if (title.includes('/')) title = title.substring(title.lastIndexOf('/') + 1);
    title = title.replace(/^[\[(]?\s*\d{1,3}\s*[.)\]-]?\s*/, '');
    const parts = title.split(' - ');
    if (parts.length > 1) title = parts.slice(1).join(' - ');
    return title.trim();
}

// --- RENDERIZADO Y ACCIONES ---
function renderYoutubeResults(videos) {
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = "";
    resultsEl.className = "results"; // Reset to list view
    if (videos.length === 0) {
        resultsEl.innerHTML = `<div class="empty muted">No se encontraron videos.</div>`;
        return;
    }
    appendSongResults(videos);
    updateHomeGridVisibility();
}

function renderArchiveResults(albums) {
    const resultsEl = document.getElementById("results");
    if (paging.page === 1) {
        resultsEl.innerHTML = "";
        resultsEl.className = "results results-grid"; // Set to grid view
    }
    if (albums.length === 0 && paging.page === 1) {
        resultsEl.innerHTML = `<div class="empty muted">No se encontraron álbumes.</div>`;
        return;
    }
    const displayedCount = resultsEl.children.length;
    const newAlbumsToRender = albums.slice(displayedCount);
    newAlbumsToRender.forEach(album => {
        const card = document.createElement("article");
        card.className = "pl-item"; // Usamos la misma clase que las playlists para consistencia
        card.innerHTML = `
            <img class="pl-thumb-bg" src="${album.thumb}" alt="Portada de ${album.title}" loading="lazy" onerror="this.src='logo78.png'">
            <div class="pl-overlay">
                <div class="pl-meta"><div class="pl-title">${album.title}</div><div class="pl-creator">${album.author}</div></div>
            </div>`;
        card.addEventListener('click', () => openArchiveAlbum(album));
        resultsEl.appendChild(card);
    });
}

function appendSongResults(chunk) {
    const root = document.getElementById("results");
    if (!root) return;
    for (const it of chunk) {
        const item = document.createElement("article");
        item.className = "result-item";
        item.dataset.trackId = it.id;
        const logo = `<div class="source-logo ${it.sourceHint}-logo">${it.sourceHint === 'ytm' ? youtubeMusicLogoSvg() : youtubeLogoSvg()}</div>`;
        item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
      </div>
      <div class="meta">
        <div class="title-line">${logo}<span class="title-text">${it.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
        <div class="subtitle">${it.author}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito">${favIconSvg(isFav(it.id))}</button>
        <button class="icon-btn more" title="Opciones">${dotsSvg()}</button>
      </div>`;
        item.addEventListener("click", (e) => {
            if (e.target.closest(".more, .fav-btn, .card-play")) return;
            playFromSearch(it.id, true);
        });
        const cardPlay = item.querySelector(".card-play");
        cardPlay.onclick = (e) => {
            e.stopPropagation();
            playFromSearch(it.id, true);
        };
        root.appendChild(item);
    }
    refreshIndicators();
}

function playFromSearch(trackId, autoplay = false) {
    const videoIndex = items.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(items, "search", videoIndex);
        playCurrent(autoplay);
    }
}

export function initSearch() {
    const searchOverlay = document.getElementById("searchOverlay");
    const overlayInput = document.getElementById("overlaySearchInput");
    
    const openSearch = () => {
        searchOverlay.classList.add("show");
        setTimeout(() => overlayInput.focus(), 50);
    };
    const closeSearch = () => searchOverlay.classList.remove("show");

    document.getElementById("searchFab")?.addEventListener("click", openSearch);
    searchOverlay?.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
    
    overlayInput?.addEventListener("keydown", async e => {
        if (e.key !== "Enter") return;
        const q = overlayInput.value.trim();
        if (!q) return;
        closeSearch();
        document.body.scrollTop = document.documentElement.scrollTop = 0;
        switchView("view-search");
        await startSearch(q);
    });

    document.getElementById('searchTypeSwitch')?.addEventListener('click', e => {
        const btn = e.target.closest('.switch-btn');
        if (btn) setSearchType(btn.dataset.type);
    });

    const sentinel = document.getElementById("sentinel");
    const observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && currentSearchType === 'archive' && !paging.loading && items.length >= (paging.page * ARCHIVE_PAGE_SIZE)) {
            paging.loading = true;
            paging.page += 1;
            await archiveSearchAlbums(paging.query);
        }
    });
    if (sentinel) observer.observe(sentinel);
}

// --- RESOLVER (Exportado para Firebase) ---
/**
 * Resuelve una canción de Spotify a un video de YouTube.
 * @param {object} track - El objeto de la canción de Spotify { title, author }.
 * @returns {Promise<object>} { videoId, backups, error }
 */
export async function resolveTrack(track) {
    const query = `${track.author} ${track.title}`;
    try {
        const ytmIds = await fetchWithTimeout(scraperYTM(query)).then(parseScraperResponse);
        if (ytmIds.length > 0) {
            return { videoId: ytmIds[0], backups: ytmIds.slice(1), error: null };
        }
        // Fallback a YouTube normal si YTM no devuelve nada
        const ytIds = await fetchWithTimeout(scraperYT(query)).then(parseScraperResponse);
        if (ytIds.length > 0) {
            return { videoId: ytIds[0], backups: ytIds.slice(1), error: null };
        }
        return { videoId: null, backups: [], error: "No results found" };
    } catch (e) {
        return { videoId: null, backups: [], error: e.message };
    }
}


// --- SVGs ---
const youtubeLogoSvg = () => `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#FF0000" d="M21.58 7.19c-.23-.86-.9-1.52-1.76-1.75C18.25 5 12 5 12 5s-6.25 0-7.82.44c-.86.23-1.52.9-1.75 1.75C2 8.75 2 12 2 12s0 3.25.43 4.81c.23.86.9 1.52 1.75 1.75C5.75 19 12 19 12 19s6.25 0 7.82-.44c.86-.23 1.52-.9 1.76-1.75C22 15.25 22 12 22 12s0-3.25-.42-4.81zM9.5 15.5V8.5l6 3.5-6 3.5z"/></svg>`;
const youtubeMusicLogoSvg = () => `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="#FF0000" d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-2 13V8l6 4-6 4z"/></svg>`;
