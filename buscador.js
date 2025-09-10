// Contiene toda la lógica de búsqueda, incluyendo scraping de YouTube y Spotify (sin API de Jina, solo proxy abierto).

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

/**
 * Función de reintento para peticiones fetch.
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
 */
async function scrapeYoutubeUrlOnly(query) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, { headers: { "Accept": "text/plain" } });
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
 */
async function scrapeYoutubeIdForNthResult(query, index = 0) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, { headers: { "Accept": "text/plain" } });
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
 * Realiza una búsqueda en YouTube y obtiene metadatos de los videos.
 */
async function scrapeYoutube(query, limit = 20) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, { headers: { "Accept": "text/plain" } });
        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        const html = await response.text();

        const ids = [...new Set(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))].slice(0, limit);
        if (!ids.length) return [];

        return await fetchVideoDetailsByIds(ids);
    });
}

/**
 * Obtiene los detalles de varios videos de YouTube por sus IDs usando noembed.com.
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
    const videoResults = await scrapeYoutube(query, 20);
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
 * Agrega los resultados al DOM.
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
