I// Contiene toda la lógica de búsqueda, incluyendo scraping de YouTube y Spotify.

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
 * Obtiene solo la URL del video de YouTube a través de scraping.
 * @param {string} query - La consulta de búsqueda.
 * @returns {Promise<string|null>} El ID del video de YouTube.
 */
async function scrapeYoutubeUrlOnly(query) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
            headers: {
                "Accept": "text/plain",
                "Authorization": "Bearer jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj"
            }
        });
        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        const html = await response.text();
        
        const priorityRegex = /watch\?v=([\w-]{11})[^\s"'<]*" aria-label="[^"]*(official video|video oficial|music video)[^"]*/i;
        const priorityMatch = html.match(priorityRegex);
        if (priorityMatch) return priorityMatch[1];
        
        const genericMatch = html.match(/watch\?v=([\w-]{11})/);
        return genericMatch ? genericMatch[1] : null;
    });
}

/**
 * Obtiene el ID del video de YouTube para el enésimo resultado.
 * @param {string} query - La consulta de búsqueda.
 * @param {number} index - El índice del resultado a obtener (0-based).
 * @returns {Promise<string|null>} El ID del video.
 */
async function scrapeYoutubeIdForNthResult(query, index = 0) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
            headers: {
                "Accept": "text/plain",
                "Authorization": "Bearer jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj"
            }
        });
        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        const html = await response.text();
        const ids = [...new Set(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))];
        if (!ids || ids.length <= index) {
            console.warn(`Scraping for index ${index} failed, not enough results for query: "${query}"`);
            return null;
        }
        return ids[index];
    });
}

/**
 * NUEVO: Obtiene solo los IDs de los videos de la búsqueda.
 * @param {string} query - La consulta de búsqueda.
 * @param {number} limit - El número máximo de resultados.
 * @returns {Promise<Array<string>>} Una lista de IDs de video.
 */
async function scrapeYoutubeIds(query, limit = 20) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
            headers: {
                "Accept": "text/plain",
                "Authorization": "Bearer jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj"
            }
        });
        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        const html = await response.text();
        return [...new Set(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))].slice(0, limit);
    });
}

/**
 * NUEVO: Obtiene los detalles de un solo video de YouTube por su ID.
 * @param {string} id - El ID del video de YouTube.
 * @returns {Promise<object|null>} Un objeto con los metadatos del video.
 */
async function fetchVideoDetailsById(id) {
    try {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
        const meta = await response.json();
        if (meta.error) return null;
        return {
            id,
            title: cleanTitle(meta.title || `Video ${id}`),
            thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
            author: cleanAuthor(meta.author_name || "YouTube"),
            source: 'youtube', type: 'youtube_video', isTopic: /topic/i.test(meta.author_name || "")
        };
    } catch (e) {
        return {
            id, title: `Video ${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube", source: 'youtube', type: 'youtube_video', isTopic: false
        };
    }
}


/**
 * CORREGIDO: Inicia el proceso de búsqueda con renderizado progresivo.
 * @param {string} query - La consulta de búsqueda.
 */
async function startSearch(query) {
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = []; // Resetea la lista global de resultados
  
  const resultsEl = $("#results");
  if (resultsEl) {
      resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  }
  updateHomeGridVisibility();
  
  try {
    // 1. Obtiene todos los IDs de una vez
    const videoIds = await scrapeYoutubeIds(query, 20);
    if (searchAbort.signal.aborted) return;
    
    // 2. Limpia el mensaje de "Buscando..."
    if (resultsEl) resultsEl.innerHTML = "";

    if (videoIds.length === 0) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        paging.loading = false;
        return;
    }

    // 3. Pide y renderiza los detalles uno por uno
    for (const id of videoIds) {
        if (searchAbort.signal.aborted) break;
        const videoDetails = await fetchVideoDetailsById(id);
        if (videoDetails) {
            items.push(videoDetails); // Agrega a la lista global para la reproducción
            appendResults([videoDetails]); // Renderiza este resultado individual
        }
    }

  } catch (e) {
    console.error('Search failed:', e);
    // Muestra error solo si no se pudo renderizar ningún resultado
    if (resultsEl && items.length === 0) {
        resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá por favor.</p></div>`;
    }
  } finally {
    paging.loading = false;
  }
}

/**
 * Agrega los resultados de la búsqueda al DOM.
 * @param {Array<object>} chunk - Un array de objetos de video (en este caso, de un solo elemento).
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
