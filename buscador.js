// Contiene la lógica de búsqueda para YouTube y Archive.org

let items = [];
let searchAbort = null;
let currentSearchSource = 'youtube'; // 'youtube' o 'archive'

async function withRetry(fn, retries = 3, delay = 500) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.warn(`Reintento ${i + 1} de ${retries} falló:`, err);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay * (i + 1)));
            }
        }
    }
    throw lastError;
}

// --- Búsqueda en YouTube ---

async function scrapeYoutubeWithDetails(query, limit = 20) {
    return withRetry(async () => {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, { signal: searchAbort?.signal });
        if (!response.ok) throw new Error(`AllOrigins falló: ${response.status}`);
        
        const html = await response.text();
        const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
        if (!scriptMatch) throw new Error("No se encontró ytInitialData en el HTML");
        
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
                        source: "youtube",
                        type: "youtube_video",
                        isTopic: /topic/i.test(video.ownerText ? video.ownerText.runs[0].text : '')
                    });
                }
            }
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) findVideos(obj[key]);
            }
        }
        
        findVideos(data);
        return videosFound.slice(0, limit);
    });
}

async function startYoutubeSearch(query) {
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  currentSearchSource = 'youtube';
  items = [];
  
  const resultsEl = $("#results");
  resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando en YouTube…</h3></div>`;
  $("#homeSection")?.classList.add("hide");
  
  try {
    const videoResults = await scrapeYoutubeWithDetails(query, 20);
    if (searchAbort.signal.aborted) return;
    
    resultsEl.innerHTML = "";
    if (videoResults.length === 0) {
        resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }

    items = videoResults;
    appendYoutubeResults(items);

  } catch (e) {
    console.error('Search failed:', e);
    resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda de YouTube. Reintentá por favor.</p></div>`;
  }
}

function appendYoutubeResults(chunk){
  const root = $("#results"); if(!root) return;
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;
    item.dataset.source = 'youtube';

    let logo = youtubeLogoSvg();
    if (it.isTopic) {
        logo = Math.random() < 0.5 ? spotifyLogoSvg() : youtubeMusicLogoSvg();
    }
    
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
    root.appendChild(item);
  }
  refreshIndicators();
}


// --- Búsqueda en Archive.org ---

async function searchArchiveAlbums(query) {
    if(searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    currentSearchSource = 'archive';
    items = []; // Limpiamos los resultados de YouTube

    const resultsEl = $("#results");
    resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando álbumes en Archive.org…</h3></div>`;
    $("#homeSection")?.classList.add("hide");

    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:audio+AND+NOT+collection:librivoxaudio&fl=identifier,title,creator,publicdate&rows=100&page=1&output=json&sort[]=downloads+desc`;

    try {
        const response = await fetch(url, { signal: searchAbort.signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        const docs = data.response?.docs || [];
        resultsEl.innerHTML = "";
        
        if (docs.length === 0) {
            resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron álbumes para "${query}" en Archive.org.</p></div>`;
            return;
        }

        const albums = docs.map(d => ({
            id: d.identifier,
            title: Array.isArray(d.title) ? d.title[0] : d.title || 'Sin Título',
            author: Array.isArray(d.creator) ? d.creator.join(', ') : d.creator || 'Desconocido',
            thumb: `https://archive.org/services/img/${d.identifier}`,
            year: d.publicdate ? new Date(d.publicdate).getFullYear() : '',
            source: 'archive',
            type: 'archive_album'
        }));

        appendArchiveResults(albums);
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error en búsqueda de Archive.org:', e);
        resultsEl.innerHTML = `<div class="loading-indicator"><p>Error al buscar en Archive.org.</p></div>`;
    }
}

function appendArchiveResults(albums) {
    const root = $("#results");
    if (!root) return;
    root.innerHTML = ''; // Limpiamos resultados previos
    
    const grid = document.createElement('div');
    grid.className = 'pl-grid'; // Reutilizamos el estilo de grid

    for (const album of albums) {
        const item = document.createElement("article");
        item.className = "playlist-card"; // Reutilizamos el estilo de tarjeta
        item.dataset.albumId = album.id;
        item.dataset.source = 'archive';
        
        item.innerHTML = `
            <div class="album-cover">
                <img src="${album.thumb}" alt="Cover de ${album.title}" loading="lazy">
            </div>
            <div class="playlist-meta">
                <div class="playlist-title-wrapper">
                    <h4 class="playlist-title">${album.title}</h4>
                </div>
                <div class="creator-line">
                    <span style="font-size: 16px; margin-right: 4px;">💿</span>
                    <span>${album.author} ${album.year ? `(${album.year})` : ''}</span>
                </div>
            </div>`;
        grid.appendChild(item);
    }
    root.appendChild(grid);
}

// --- Manejo de Clicks y Navegación ---

document.addEventListener("click", (e) => {
    const resultItem = e.target.closest(".result-item, .playlist-card");
    if (!resultItem) return;
    
    // Si es un resultado de YouTube
    if (resultItem.dataset.source === 'youtube') {
        if (e.target.closest(".more") || e.target.closest(".fav-btn")) return;
        const trackId = resultItem.dataset.trackId;
        const track = items.find(it => it.id === trackId);
        if (track) {
            const forcePlay = !!e.target.closest(".card-play");
            playFromSearch(track.id, forcePlay);
        }
    }

    // Si es un resultado de Archive.org
    if (resultItem.dataset.source === 'archive') {
        const albumId = resultItem.dataset.albumId;
        if (albumId) {
            playArchiveAlbum(albumId);
        }
    }
});


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
        await startYoutubeSearch(q); // La búsqueda por defecto es en YouTube
    });
}
