// Contiene toda la lógica de búsqueda, optimizada y robusta para manejar múltiples formatos de JSON de Jina.ai.

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

/**
 * Función de reintento para peticiones fetch.
 * @param {function} fn - La función a ejecutar.
 * @param {number} retries - El número de reintentos.
 * @param {number} delay - El tiempo de espera entre reintentos.
 * @returns {Promise<any>}
 */
async function withRetry(fn, retries = 2, delay = 300) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries) {
                 console.error("Scraping failed after all retries.", e);
                 throw e;
            }
            console.warn(`Scraping attempt ${i + 1} failed. Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

/**
 * Extrae el ID de un video de una URL de YouTube.
 * @param {string} url - La URL del video.
 * @returns {string|null} El ID del video o null si no se encuentra.
 */
function extractVideoId(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
            return urlObj.searchParams.get('v');
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * CORREGIDO: Realiza una única llamada a Jina.ai y maneja múltiples posibles estructuras de JSON.
 * @param {string} query - La consulta de búsqueda.
 * @param {number} limit - El número máximo de resultados.
 * @returns {Promise<Array<object>>} Una lista de objetos de video con todos sus detalles.
 */
async function scrapeYoutubeWithDetails(query, limit = 20) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
            headers: {
                "Accept": "application/json",
                "Authorization": "Bearer jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj",
                "X-Return-Format": "json" // Solicitamos un formato JSON más detallado
            }
        });

        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        
        const jsonData = await response.json();
        
        // Plan A: Intentar parsear la estructura detallada (ideal)
        let videoResults = [];
        if (jsonData?.data?.children && Array.isArray(jsonData.data.children)) {
            for (const child of jsonData.data.children) {
                const videoData = child.videoRenderer;
                if (videoData && videoData.videoId) {
                     videoResults.push({
                        id: videoData.videoId,
                        title: cleanTitle(videoData.title?.runs?.[0]?.text || ''),
                        thumb: `https://i.ytimg.com/vi/${videoData.videoId}/hqdefault.jpg`,
                        author: cleanAuthor(videoData.longBylineText?.runs?.[0]?.text || 'YouTube'),
                        source: 'youtube', type: 'youtube_video',
                        isTopic: /topic/i.test(videoData.longBylineText?.runs?.[0]?.text || "")
                    });
                }
            }
        } 
        // Plan B: Si la estructura detallada falla, intentar con la estructura simple
        else if (jsonData?.data && Array.isArray(jsonData.data)) {
             videoResults = jsonData.data.map(item => {
                const videoId = extractVideoId(item.url);
                if (!videoId) return null;
                return {
                    id: videoId,
                    title: cleanTitle(item.title || `Video ${videoId}`),
                    thumb: (item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
                    author: cleanAuthor(item.author || "YouTube"),
                    source: 'youtube', type: 'youtube_video',
                    isTopic: /topic/i.test(item.author || "")
                };
            }).filter(Boolean);
        } else {
            console.warn("Jina.ai returned an unrecognized JSON structure:", jsonData);
            return [];
        }
        
        return videoResults.slice(0, limit);
    });
}


/**
 * Función de compatibilidad para main.js (carga de playlists recomendadas).
 * @param {Array<string>} ids - Una lista de IDs de videos de YouTube.
 * @returns {Promise<Array<object>>} Una lista de objetos con los metadatos de los videos.
 */
async function fetchVideoDetailsByIds(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    
    const metadataPromises = uniqueIds.map(id => 
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
            .then(r => r.json())
            .then(meta => {
                if (meta.error) return null;
                return {
                    id,
                    title: cleanTitle(meta.title || `Video ${id}`),
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

/**
 * Inicia el proceso de búsqueda.
 * @param {string} query - La consulta de búsqueda.
 */
async function startSearch(query) {
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];
  
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  updateHomeGridVisibility();
  
  try {
    const videoResults = await scrapeYoutubeWithDetails(query, 20);
    if (searchAbort.signal.aborted) return;
    
    if (resultsEl) resultsEl.innerHTML = "";
    
    if (videoResults.length === 0) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }

    items = videoResults;
    appendResults(items);

  } catch (e) {
    console.error('Search failed:', e);
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá por favor.</p></div>`;
  } finally {
    paging.loading = false;
  }
}

/**
 * Agrega los resultados de la búsqueda al DOM.
 * @param {Array<object>} chunk - Un array de objetos de video.
 */
function appendResults(chunk){
  const root = $("#results"); if(!root) return;
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;

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
    item.addEventListener("click", (e) => handleResultClick(e, it));

    const cardPlayBtn = item.querySelector(".card-play");
    if (cardPlayBtn) {
        cardPlayBtn.onclick = (e) => {
            e.stopPropagation();
            handleResultClick(e, it, true);
        };
    }
    root.appendChild(item);
  }
  refreshIndicators();
}

/**
 * Maneja el clic en un resultado de búsqueda.
 * @param {Event} event - El evento de clic.
 * @param {object} item - El objeto del video.
 * @param {boolean} forcePlay - Si se debe forzar la reproducción.
 */
async function handleResultClick(event, item, forcePlay = false) {
    if (event.target.closest(".more") || event.target.closest(".fav-btn") || (event.target.closest(".card-play") && !forcePlay)) return;

    if (item.type === 'youtube_video') {
        playFromSearch(item.id, true);
    }
}

/**
 * Inicializa los listeners para la búsqueda (overlay, etc.).
 */
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
}

