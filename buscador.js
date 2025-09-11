// Contiene toda la lógica de búsqueda para YouTube (canciones) y Archive.org (álbumes).

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false, page: 1 };
const ARCHIVE_PAGE_SIZE = 50; // Cantidad de álbumes a cargar por vez.

// --- Búsqueda en YouTube (Canciones) ---

async function searchYoutube(query) {
    try {
        const videoResults = await scrapeYoutubeWithDetails(query, 20);
        if (searchAbort.signal.aborted) return;
        
        items = videoResults;
        renderYoutubeResults(items);

    } catch (e) {
        console.error('Search failed:', e);
        $("#results").innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda de canciones. Reintentá por favor.</p></div>`;
    } finally {
        paging.loading = false;
    }
}

function renderYoutubeResults(videos) {
    const resultsEl = $("#results");
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    resultsEl.className = "results"; // Asegura el layout de lista

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
        if (it.type === 'youtube_video') {
            playFromSearch(it.id, true);
        }
    });

    const cardPlayBtn = item.querySelector(".card-play");
    if (cardPlayBtn) {
        cardPlayBtn.onclick = (e) => {
            e.stopPropagation();
            if (it.type === 'youtube_video') {
                playFromSearch(it.id, true);
            }
        };
    }
    root.appendChild(item);
  }
  refreshIndicators();
}

// --- Búsqueda en Archive.org (Álbumes) ---

function relevance(doc, q){
    const t = (doc.title || '').toLowerCase();
    const c = (doc.creator || doc.artist || '').toLowerCase();
    const qq = (q||'').toLowerCase();
    let r=0; 
    if(t===qq) r+=300; 
    else if(t.includes(qq)) r+=150; 
    if(c.includes(qq)) r+=50; 
    return r;
}

async function searchArchive(query, page = 1) {
    const { doc, getDoc, setDoc, serverTimestamp } = sy_fs();
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, '_');
    const cacheRef = doc(db, "archive_searches", normalizedQuery);

    // Si es la primera página, intenta cargar desde el caché de Firestore.
    if (page === 1) {
        try {
            const docSnap = await getDoc(cacheRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Considerar el caché válido por 24 horas.
                const cacheAge = Date.now() - data.timestamp.toMillis();
                if (cacheAge < 24 * 60 * 60 * 1000) {
                    showToast("Resultados cargados desde caché.");
                    items = data.albums;
                    renderArchiveResults(items);
                    paging.loading = false;
                    return;
                }
            }
        } catch (e) {
            console.error("Error al leer caché de Firestore:", e);
        }
    }
    
    // Si no está en caché, o es una página > 1, busca en Archive.org
    const sortParam = encodeURIComponent("downloads desc");
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:audio+AND+NOT+access-restricted-item:true&fl=identifier,title,creator&rows=${ARCHIVE_PAGE_SIZE}&page=${page}&output=json&sort[]=${sortParam}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
        const response = await fetch(proxyUrl, { signal: searchAbort?.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        const albums = (data.response?.docs || []).map(d => ({
            id: d.identifier,
            title: d.title || 'Sin título',
            artist: Array.isArray(d.creator) ? d.creator.join(', ') : (d.creator || 'Desconocido'),
            thumb: `https://archive.org/services/img/${d.identifier}`,
            relevance: relevance(d, query),
            type: 'archive_album'
        }));
        
        // Ordenar solo la primera página por relevancia, las demás vienen por descargas.
        if (page === 1) {
            albums.sort((a,b) => b.relevance - a.relevance);
        }
        
        if (page === 1) {
            items = albums;
            // Guardar en Firestore el resultado de la primera página.
            await setDoc(cacheRef, { albums: items, timestamp: serverTimestamp() });
        } else {
            items = [...items, ...albums];
        }

        renderArchiveResults(items);
        paging.page = page;

    } catch (e) {
         console.error('Error en búsqueda de álbumes:', e);
         if (page === 1) {
            $("#results").innerHTML = `<div class="loading-indicator"><p>Error al buscar álbumes. Intenta de nuevo.</p></div>`;
         }
    } finally {
        paging.loading = false;
    }
}


function renderArchiveResults(albums) {
    const resultsEl = $("#results");
    if (!resultsEl) return;
    
    // Si es la primera vez que se renderizan álbumes, limpiar y preparar la grilla.
    if (!resultsEl.classList.contains('results-grid')) {
        resultsEl.innerHTML = "";
        resultsEl.className = "results results-grid";
    }

    if (albums.length === 0) {
        resultsEl.innerHTML = `<div class="empty muted">No se encontraron álbumes.</div>`;
        return;
    }

    // Mostrar solo los nuevos álbumes para el lazy loading
    const displayedCount = resultsEl.children.length;
    const newAlbums = albums.slice(displayedCount);
    
    newAlbums.forEach(album => appendAlbumCard(album));
}

function appendAlbumCard(album) {
    const resultsEl = $("#results");
    const card = document.createElement("article");
    card.className = "pl-item"; // Usamos la misma clase que las playlists para el estilo
    card.innerHTML = `
        <img class="pl-thumb-bg" src="${album.thumb}" alt="Portada de ${album.title}" loading="lazy">
        <div class="pl-overlay">
            <div class="pl-meta">
                <div class="pl-title">${album.title}</div>
                <div class="pl-creator">${album.artist}</div>
            </div>
        </div>
        <div class="card-play" style="opacity: 1; background: transparent;">
             <svg style="width: 48px; height: 48px; color: rgba(255,255,255,0.8);" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a9 9 0 100 18A9 9 0 0012 3zm-2 13V8l6 4-6 4z"/></svg>
        </div>`;
    card.addEventListener('click', () => openArchiveAlbum(album));
    resultsEl.appendChild(card);
}

async function openArchiveAlbum(album) {
    showToast(`Cargando álbum: ${album.title}...`);
    try {
        const tracks = await fetchAlbumTracks(album.id);
        if (tracks.length === 0) {
            showToast("Este álbum no contiene canciones de audio válidas.", true);
            return;
        }

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


async function fetchAlbumTracks(albumId) {
    const url = `https://archive.org/metadata/${albumId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("No se pudo obtener la metadata del álbum.");
    const data = await response.json();
    
    const AUDIO_FORMATS = ['mp3', 'flac', 'wav', 'ogg'];
    const audioFiles = (data.files || []).filter(f => AUDIO_FORMATS.some(ext => new RegExp(`\\.${ext}$`, 'i').test(f.name || '')));

    const tracksMap = new Map();
    const artist = Array.isArray(data.metadata?.creator) ? data.metadata.creator.join(', ') : (data.metadata?.creator || data.metadata?.artist || 'Desconocido');

    audioFiles.forEach(file => {
        const baseName = (file.name || '').replace(/\.[^/.]+$/, "").toLowerCase();
        if (!tracksMap.has(baseName)) {
            tracksMap.set(baseName, {
                id: `${albumId}/${file.name}`, // ID único para la canción
                title: file.title || cleanTitle(file.name.replace(/_/g, ' ')),
                author: artist,
                thumb: `https://archive.org/services/img/${albumId}`,
                source: 'archive',
                type: 'archive_track',
                urls: {}
            });
        }
        const format = (file.name.match(/\.(\w+)$/i) || [])[1]?.toLowerCase();
        if (format) {
            tracksMap.get(baseName).urls[format] = `https://archive.org/download/${albumId}/${encodeURIComponent(file.name)}`;
        }
    });

    return Array.from(tracksMap.values());
}



// --- Lógica Principal de Búsqueda y Renderizado ---

async function startSearch(query) {
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true, page: 1 };
  items = [];
  
  const resultsEl = $("#results");
  resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando…</h3></div>`;
  updateHomeGridVisibility();
  
  if (currentSearchType === 'youtube') {
      await searchYoutube(query);
  } else {
      await searchArchive(query, 1);
  }
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
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;

        switchView("view-search");
        await startSearch(q);
    });
    
    // Lazy loading para álbumes
    const sentinel = $("#sentinel");
    const observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && currentSearchType === 'archive' && !paging.loading && items.length > 0) {
            paging.loading = true;
            await searchArchive(paging.query, paging.page + 1);
        }
    });
    if(sentinel) observer.observe(sentinel);
}


// --- Funciones de scraping de YouTube (se mantienen como estaban) ---
async function scrapeYoutubeWithDetails(query, limit = 20) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, { signal: searchAbort?.signal });
    if (!response.ok) throw new Error(`AllOrigins falló: ${response.status}`);
    const html = await response.text();
    const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
    if (!scriptMatch) throw new Error("No se encontró ytInitialData");
    const data = JSON.parse(scriptMatch[1]);
    const videosFound = [];
    function findVideos(obj) {
        if (typeof obj !== 'object' || obj === null) return;
        if (obj.videoRenderer) {
            const video = obj.videoRenderer;
            if (video.videoId && video.title) {
                videosFound.push({
                    id: video.videoId,
                    title: cleanTitle(video.title.runs ? video.title.runs[0].text : video.title.simpleText || 'Sin título'),
                    thumb: video.thumbnail ? video.thumbnail.thumbnails[0].url : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
                    author: cleanAuthor(video.ownerText ? video.ownerText.runs[0].text : 'Sin canal'),
                    source: "youtube", type: "youtube_video", isTopic: /topic/i.test(video.ownerText ? video.ownerText.runs[0].text : '')
                });
            }
        }
        for (let key in obj) { if (obj.hasOwnProperty(key)) findVideos(obj[key]); }
    }
    findVideos(data);
    return videosFound.slice(0, limit);
}

async function fetchVideoDetailsByIds(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const metadataPromises = uniqueIds.map(id => 
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
            .then(r => r.json())
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
