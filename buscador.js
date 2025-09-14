// Contiene la lógica de búsqueda para YouTube (canciones) y Archive.org (álbumes).

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false, page: 1 };
const ARCHIVE_PAGE_SIZE = 50;
const archiveSearchCache = new Map();

// --- Punto de Entrada Principal de Búsqueda ---

async function startSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  
  paging = { query, loading: true, page: 1 };
  items = [];
  archiveSearchCache.clear(); 

  const resultsEl = $("#results");
  resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando…</h3></div>`;
  updateHomeGridVisibility();

  if (currentSearchType === 'archive') {
    await archiveSearchAlbums(query);
  } else {
    await searchYoutube(query);
  }
}

// =======================================================
// LÓGICA DE BÚSQUEDA DE CANCIONES (YOUTUBE) - FINAL
// =======================================================

/**
 * Extrae el ID de un video de una URL de YouTube.
 * @param {string} url - La URL completa de YouTube.
 * @returns {string|null} - El ID del video o null si no se encuentra.
 */
function extractVideoId(url) {
    if (!url) return null;
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname === 'youtu.be') {
            return parsedUrl.pathname.slice(1);
        }
        if (parsedUrl.searchParams.has("v")) {
            return parsedUrl.searchParams.get("v");
        }
        const pathnameParts = parsedUrl.pathname.split('/');
        if (pathnameParts.includes("shorts")) {
            return pathnameParts[pathnameParts.length - 1];
        }
    } catch (e) {
        const match = url.match(/(?:watch\?v=|youtu\.be\/|shorts\/)([\w-]{11})/);
        return match ? match[1] : null;
    }
    return null;
}

/**
 * Usa el servidor personal (a través de un proxy CORS) para obtener IDs y luego noembed para los metadatos.
 * @param {string} query - La consulta de búsqueda.
 * @param {number} limit - El número máximo de resultados.
 * @returns {Promise<Array<object>>} - Una lista de objetos de canción.
 */
async function scrapeYoutubeWithCustomServer(query, limit = 20) {
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const customServerUrl = `http://191.85.26.215:5000/?url=${encodeURIComponent(youtubeSearchUrl)}`;
    
    // --- CORRECCIÓN FINAL: Se envuelve la llamada al servidor en un proxy para evitar el error de "Mixed Content" ---
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(customServerUrl)}`;

    const response = await fetch(proxyUrl, { signal: searchAbort?.signal });
    if (!response.ok) {
        throw new Error(`El proxy o el servidor de scraping fallaron con el estado: ${response.status}`);
    }
    
    const textResponse = await response.text();
    const urls = textResponse.split('\n').filter(url => url.trim() !== '');

    if (!Array.isArray(urls)) {
        throw new Error("La respuesta del servidor de scraping no se pudo procesar como un array de URLs.");
    }

    const videoIds = urls.map(url => extractVideoId(url)).filter(Boolean);
    const uniqueIds = [...new Set(videoIds)];

    return fetchVideoDetailsByIds(uniqueIds.slice(0, limit));
}


async function searchYoutube(query) {
  try {
    const videoResults = await scrapeYoutubeWithCustomServer(query, 20);
    if (searchAbort.signal.aborted) return;
    items = videoResults;
    renderYoutubeResults(items);
  } catch (e) {
    console.error('Falló la búsqueda de canciones:', e);
    $("#results").innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda de canciones. Reintentá por favor.</p></div>`;
  } finally {
    paging.loading = false;
  }
}

// =======================================================
// LÓGICA DE BÚSQUEDA DE ÁLBUMES (ARCHIVE.ORG) - SIN CAMBIOS
// =======================================================

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
        const response = await fetch(url, { signal: searchAbort?.signal });
        if (!response.ok) throw new Error(`La API de Archive.org respondió con el estado ${response.status}`);
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
        if (e.name !== 'AbortError') {
            console.error('Falló la búsqueda de álbumes:', e);
            if (page === 1) $("#results").innerHTML = `<div class="loading-indicator"><p>Error al buscar álbumes. Intenta de nuevo.</p></div>`;
        }
    } finally {
        paging.loading = false;
    }
}

function renderArchiveResults(albums) {
    const resultsEl = $("#results");
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
                <div class="pl-meta">
                    <div class="pl-title">${album.title}</div>
                    <div class="pl-creator">${album.author}</div>
                </div>
            </div>
            <div class="card-play" style="opacity: 1; background: transparent;">
                 <svg style="width: 48px; height: 48px; color: rgba(255,255,255,0.8);" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-2 13V8l6 4-6 4z"/></svg>
            </div>`;
        card.addEventListener('click', () => openArchiveAlbum(album));
        resultsEl.appendChild(card);
    });
}

function cleanArchiveTrackTitle(rawTitle) {
    if (!rawTitle) return "Canción sin título";
    let title = rawTitle;
    title = title.replace(/\.(mp3|flac|wav|ogg|m4a)$/i, '');
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
        const response = await fetch(url);
        if (!response.ok) throw new Error("No se pudo obtener la metadata del álbum.");
        const data = await response.json();
        const AUDIO_FORMATS = ['mp3', 'flac', 'wav', 'ogg', 'm4a'];
        const audioFiles = (data.files || []).filter(f => AUDIO_FORMATS.some(ext => new RegExp(`\\.${ext}$`, 'i').test(f.name || '')));
        if (audioFiles.length === 0) {
            showToast("Este álbum no contiene canciones de audio válidas.", true);
            return;
        }
        const tracks = audioFiles.map(file => {
            const format = (file.name.match(/\.(\w+)$/i) || [])[1]?.toLowerCase();
            return {
                id: `${album.id}/${file.name}`,
                title: cleanArchiveTrackTitle(file.title || file.name),
                author: album.author,
                thumb: album.thumb,
                source: 'archive',
                type: 'archive_track',
                urls: { [format]: `https://archive.org/download/${album.id}/${encodeURIComponent(file.name)}` }
            };
        });
        tracks.forEach(t => {
            if (!t.urls.mp3) {
                const availableFormat = Object.keys(t.urls)[0];
                t.urls.mp3 = t.urls[availableFormat];
            }
        });
        viewingPlaylistId = null; 
        currentQueueTitle = album.title;
        setQueue(tracks, 'archive_album', 0);
        switchView('view-player');
        renderQueue(tracks, album.title);
        playCurrent(true);
    } catch (e) {
        showToast("No se pudo cargar el álbum.", true);
        console.error("Error al abrir álbum de Archive:", e);
    }
}

// =======================================================
// FUNCIONES COMUNES Y DE YOUTUBE (SIN CAMBIOS)
// =======================================================

function renderYoutubeResults(videos) {
    const resultsEl = $("#results");
    resultsEl.innerHTML = "";
    resultsEl.className = "results";
    if (videos.length === 0) {
        resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }
    appendSongResults(videos);
}

function appendSongResults(chunk){
  const root = $("#results"); if(!root) return;
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;
    let logo = it.source === 'archive' ? '' : (it.isTopic ? (Math.random() < 0.5 ? spotifyLogoSvg() : youtubeMusicLogoSvg()) : youtubeLogoSvg());
    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          ${logo}
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
            ${favIconSvg(isFav(it.id))}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    item.addEventListener("click", (e) => {
        if (e.target.closest(".more") || e.target.closest(".fav-btn") || e.target.closest(".card-play")) return;
        if (it.type === 'youtube_video') playFromSearch(it.id, true);
    });
    const cardPlayBtn = item.querySelector(".card-play");
    if (cardPlayBtn) {
        cardPlayBtn.onclick = (e) => {
            e.stopPropagation();
            if (it.type === 'youtube_video') playFromSearch(it.id, true);
        };
    }
    root.appendChild(item);
  }
  refreshIndicators();
}

function initSearch() {
    const searchOverlay = $("#searchOverlay");
    const overlayInput  = $("#overlaySearchInput");
    function openSearch() {
        searchOverlay.classList.add("show");
        setTimeout(() => { overlayInput.focus(); overlayInput.select(); }, 50);
    }
    function closeSearch() { searchOverlay.classList.remove("show"); }
    $("#searchFab")?.addEventListener("click", openSearch);
    searchOverlay?.addEventListener("click", e => { if(e.target === searchOverlay) closeSearch(); });
    overlayInput?.addEventListener("keydown", async e => {
        if (e.key !== "Enter") return;
        const q = overlayInput.value.trim();
        if (!q) return;
        closeSearch();
        document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
        switchView("view-search");
        await startSearch(q);
    });
    const sentinel = $("#sentinel");
    const observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && currentSearchType === 'archive' && !paging.loading && items.length >= ARCHIVE_PAGE_SIZE) {
            paging.loading = true;
            paging.page += 1;
            await archiveSearchAlbums(paging.query);
        }
    });
    if(sentinel) observer.observe(sentinel);
}

async function fetchVideoDetailsByIds(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const metadataPromises = uniqueIds.map(id => 
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
            .then(r => r.ok ? r.json() : Promise.reject(`noembed failed for ${id}`))
            .then(meta => {
                if (meta.error) return null;
                return {
                    id, title: cleanTitle(meta.title || `Video ${id}`),
                    thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
                    author: cleanAuthor(meta.author_name || "YouTube"),
                    source: 'youtube', type: 'youtube_video', isTopic: /topic/i.test(meta.author_name || "")
                };
            })
            .catch(() => ({
                id, title: `Video ${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                author: "YouTube", source: 'youtube', type: 'youtube_video', isTopic: false
            }))
    );
    return (await Promise.all(metadataPromises)).filter(Boolean);
}
