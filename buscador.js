import { isFav } from './firebase.js';

// --- Constantes del Scraper (Editables) ---
const SCRAPER_HOST = "http://191-85-54-30.nip.io:5000";
const scraperYTM = (q) => `${SCRAPER_HOST}/?ytm=${encodeURIComponent(q)}`;
const scraperYT = (q) => `${SCRAPER_HOST}/?url=${encodeURIComponent(`https://www.youtube.com/results?search_query=${q}`)}`;
const YT_ID_11 = /(?:v=|shorts\/|be\/)([a-zA-Z0-9_-]{11})/;
const extractId = (url) => {
    const m = url.match(YT_ID_11);
    return m ? m[1] : null;
};
// --- Fin Constantes del Scraper ---

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
}

export let items = [];
let searchAbort = null;
let paging = { query: "", loading: false, page: 1 };
const ARCHIVE_PAGE_SIZE = 50;
const archiveSearchCache = new Map();

// --- Punto de Entrada Principal de Búsqueda ---
export async function startSearch(query) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    paging = { query, loading: true, page: 1 };
    items = [];
    archiveSearchCache.clear();

    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando…</h3></div>`;
    updateHomeGridVisibility();

    if (window.currentSearchType === 'archive') {
        await archiveSearchAlbums(query);
    } else {
        await searchYoutubeParallel(query);
    }
}

// --- Lógica de Búsqueda de Canciones (YouTube) ---
async function parseScraperResponse(response) {
    if (!response.ok) return [];
    const wrap = await response.json();
    const text = wrap.contents || '';
    const ids = text.split('\n').map(line => extractId(line.trim())).filter(Boolean);
    return [...new Set(ids)];
}

async function searchYoutubeParallel(query) {
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando en YouTube Music y YouTube…</h3></div>`;

    const proxiedYtmUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYTM(query))}`;
    const proxiedYtUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYT(query))}`;

    const ytmPromise = fetchWithTimeout(proxiedYtmUrl, { signal: searchAbort.signal, cache: 'no-store' }).then(parseScraperResponse);
    const ytPromise = fetchWithTimeout(proxiedYtUrl, { signal: searchAbort.signal, cache: 'no-store' }).then(parseScraperResponse);

    try {
        const [ytmIds, ytIds] = await Promise.all([ytmPromise, ytPromise]);
        if (searchAbort.signal.aborted) return;

        const ytmIdSet = new Set(ytmIds);
        const uniqueYtIds = ytIds.filter(id => !ytmIdSet.has(id));
        const combinedIds = [...ytmIds, ...uniqueYtIds];

        if (combinedIds.length === 0) {
            resultsEl.innerHTML = `<div class="empty muted">No se encontraron resultados para "${query}".</div>`;
            return;
        }

        const videoDetails = await fetchVideoDetailsByIds(combinedIds);
        const finalResults = videoDetails.map(video => ({ ...video, sourceHint: ytmIdSet.has(video.id) ? 'ytm' : 'yt' }));

        items = finalResults;
        renderYoutubeResults(items);
    } catch (e) {
        if (e.name !== 'AbortError') {
            resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá por favor.</p></div>`;
        }
    } finally {
        paging.loading = false;
    }
}

// --- Lógica de Búsqueda de Álbumnes (Archive.org) ---
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
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(archiveQuery)}&fl[]=identifier&fl[]=title&fl[]=creator&sort[]=downloads+desc&rows=${ARCHIVE_PAGE_SIZE}&page=${page}&output=json`;

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
            document.getElementById("results").innerHTML = `<div class="loading-indicator"><p>Error al buscar álbumes.</p></div>`;
        }
    } finally {
        paging.loading = false;
    }
}

function renderArchiveResults(albums) {
    const resultsEl = document.getElementById("results");
    if (paging.page === 1) {
        resultsEl.innerHTML = "";
        resultsEl.className = "results results-grid";
    }
    if (albums.length === 0 && paging.page === 1) {
        resultsEl.innerHTML = `<div class="empty muted">No se encontraron álbumes.</div>`;
        return;
    }
    const displayedCount = resultsEl.children.length;
    const newAlbumsToRender = albums.slice(displayedCount);
    newAlbumsToRender.forEach(album => {
        const card = document.createElement("article");
        card.className = "pl-item";
        card.innerHTML = `
            <img class="pl-thumb-bg" src="${album.thumb}" alt="Portada de ${album.title}" loading="lazy">
            <div class="pl-overlay">
                <div class="pl-meta"><div class="pl-title">${album.title}</div><div class="pl-creator">${album.author}</div></div>
            </div>
            <div class="card-play" style="opacity: 1; background: transparent;"><svg style="width: 48px; height: 48px; color: rgba(255,255,255,0.8);" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-2 13V8l6 4-6 4z"/></svg></div>`;
        card.addEventListener('click', () => openArchiveAlbum(album));
        resultsEl.appendChild(card);
    });
}

function cleanArchiveTrackTitle(rawTitle) {
    if (!rawTitle) return "Canción sin título";
    let title = rawTitle.replace(/\.(mp3|flac|wav|ogg|m4a)$/i, '');
    if (title.includes('/')) title = title.substring(title.lastIndexOf('/') + 1);
    title = title.replace(/^[\[(]?\s*\d{1,3}\s*[.)\]-]?\s*/, '');
    const parts = title.split(' - ');
    if (parts.length > 1) title = parts[parts.length - 1];
    return title.trim();
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
        window.viewingPlaylistId = null;
        window.currentQueueTitle = album.title;
        setQueue(tracks, 'archive_album', 0);
        switchView('view-player');
        renderQueue(tracks, album.title);
        playCurrent(true);
    } catch (e) {
        showToast("No se pudo cargar el álbum.", true);
    }
}

// --- Renderizado y Acciones ---
function renderYoutubeResults(videos) {
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = "";
    resultsEl.className = "results";
    if (videos.length === 0) {
        resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }
    appendSongResults(videos);
}

function appendSongResults(chunk) {
    const root = document.getElementById("results");
    if (!root) return;
    for (const it of chunk) {
        const item = document.createElement("article");
        item.className = "result-item";
        item.dataset.trackId = it.id;
        let logo = it.sourceHint === 'ytm' ? youtubeMusicLogoSvg() : youtubeLogoSvg();
        item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>
      </div>
      <div class="meta">
        <div class="title-line">${logo}<span class="title-text">${it.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito">${favIconSvg(isFav(it.id))}</button>
        <button class="icon-btn more" title="Opciones">${dotsSvg()}</button>
      </div>`;
        item.addEventListener("click", (e) => {
            if (e.target.closest(".more, .fav-btn, .card-play")) return;
            playFromSearch(it.id, true);
        });
        item.querySelector(".card-play").onclick = (e) => {
            e.stopPropagation();
            playFromSearch(it.id, true);
        };
        root.appendChild(item);
    }
    refreshIndicators();
}

function playFromSearch(trackId, autoplay = false) {
    const videoItems = items.filter(it => it.type === 'youtube_video');
    const videoIndex = videoItems.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(videoItems, "search", videoIndex);
        window.viewingPlaylistId = null;
        playCurrent(autoplay);
    }
}

export function initSearch() {
    const searchOverlay = document.getElementById("searchOverlay");
    const overlayInput = document.getElementById("overlaySearchInput");
    const openSearch = () => {
        searchOverlay.classList.add("show");
        setTimeout(() => {
            overlayInput.focus();
            overlayInput.select();
        }, 50);
    }
    const closeSearch = () => searchOverlay.classList.remove("show");
    document.getElementById("searchFab")?.addEventListener("click", openSearch);
    searchOverlay?.addEventListener("click", e => {
        if (e.target === searchOverlay) closeSearch();
    });
    overlayInput?.addEventListener("keydown", async e => {
        if (e.key !== "Enter") return;
        const q = overlayInput.value.trim();
        if (!q) return;
        closeSearch();
        document.body.scrollTop = document.documentElement.scrollTop = 0;
        switchView("view-search");
        await startSearch(q);
    });
    const sentinel = document.getElementById("sentinel");
    const observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && window.currentSearchType === 'archive' && !paging.loading && items.length >= ARCHIVE_PAGE_SIZE) {
            paging.loading = true;
            paging.page += 1;
            await archiveSearchAlbums(paging.query);
        }
    });
    if (sentinel) observer.observe(sentinel);
}

export async function fetchVideoDetailsByIds(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const metadataPromises = uniqueIds.map(id =>
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
        .then(r => r.ok ? r.json() : Promise.reject(`noembed failed for ${id}`))
        .then(meta => {
            if (meta.error) return null;
            return {
                id,
                title: cleanTitle(meta.title || `Video ${id}`),
                thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
                author: cleanAuthor(meta.author_name || "YouTube"),
                source: 'youtube',
                type: 'youtube_video'
            };
        })
        .catch(() => ({
            id,
            title: `Video ${id}`,
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube",
            source: 'youtube',
            type: 'youtube_video'
        }))
    );
    return (await Promise.all(metadataPromises)).filter(Boolean);
}
