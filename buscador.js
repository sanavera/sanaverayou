// Contiene toda la lógica de búsqueda, usando AllOrigins para obtener el HTML de YouTube

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

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

function extractVideoId(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.searchParams.has("v")) {
            return parsed.searchParams.get("v");
        }
        const pathnameParts = parsed.pathname.split('/');
        if (pathnameParts.includes("shorts")) {
            return pathnameParts[pathnameParts.length - 1];
        }
    } catch (e) {
        if (url.includes("watch?v=")) {
            try {
                return new URLSearchParams(url.split('?')[1]).get('v');
            } catch (err) {
                 console.warn("No se pudo parsear la URL:", url);
                 return null;
            }
        }
    }
    return null;
}

function extractVideoData(videoRenderer) {
    if (!videoRenderer || !videoRenderer.videoId) return null;
    
    let title = 'Sin título';
    if (videoRenderer.title) {
        if (videoRenderer.title.runs && videoRenderer.title.runs[0]) {
            title = videoRenderer.title.runs[0].text;
        } else if (videoRenderer.title.simpleText) {
            title = videoRenderer.title.simpleText;
        }
    }
    
    let channel = 'Sin canal';
    if (videoRenderer.ownerText && videoRenderer.ownerText.runs && videoRenderer.ownerText.runs[0]) {
        channel = videoRenderer.ownerText.runs[0].text;
    } else if (videoRenderer.longBylineText && videoRenderer.longBylineText.runs && videoRenderer.longBylineText.runs[0]) {
        channel = videoRenderer.longBylineText.runs[0].text;
    }
    
    let thumbnail = null;
    if (videoRenderer.thumbnail && videoRenderer.thumbnail.thumbnails && videoRenderer.thumbnail.thumbnails.length > 0) {
        thumbnail = videoRenderer.thumbnail.thumbnails[0].url;
    }
    
    return {
        id: videoRenderer.videoId,
        title: cleanTitle(title),
        thumb: thumbnail || `https://i.ytimg.com/vi/${videoRenderer.videoId}/hqdefault.jpg`,
        author: cleanAuthor(channel),
        source: "youtube",
        type: "youtube_video",
        isTopic: /topic/i.test(channel)
    };
}

function findVideosInData(data) {
    const videosFound = [];
    
    function findVideosRecursive(obj, depth = 0, maxDepth = 4) {
        if (depth > maxDepth || !obj || typeof obj !== 'object') return;
        
        if (obj.videoRenderer) {
            const video = extractVideoData(obj.videoRenderer);
            if (video) videosFound.push(video);
        }
        
        if (obj.itemSectionRenderer && obj.itemSectionRenderer.contents) {
            for (const content of obj.itemSectionRenderer.contents) {
                if (content.videoRenderer) {
                    const video = extractVideoData(content.videoRenderer);
                    if (video) videosFound.push(video);
                }
            }
        }
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                findVideosRecursive(obj[key], depth + 1, maxDepth);
            }
        }
    }
    
    findVideosRecursive(data);
    return videosFound;
}

async function scrapeYoutubeWithDetails(query, limit = 20) {
    return withRetry(async () => {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl, {
            signal: searchAbort?.signal
        });

        if (!response.ok) {
            throw new Error(`AllOrigins falló: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Usar el mismo patrón que funciona en el HTML de test
        const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
        if (!scriptMatch) {
            throw new Error("No se encontró ytInitialData en el HTML");
        }
        
        const data = JSON.parse(scriptMatch[1]);
        
        // Usar la misma función que funciona en el HTML de test
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
            
            // Recursivamente buscar en objetos y arrays
            for (let key in obj) {
                if (obj.hasOwnProperty(key)) {
                    findVideos(obj[key]);
                }
            }
        }
        
        findVideos(data);
        
        return videosFound.slice(0, limit);
    });
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

async function startSearch(query) {
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];
  
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere (puede tardar unos segundos)</h3></div>`;
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

async function handleResultClick(event, item, forcePlay = false) {
    if (event.target.closest(".more") || event.target.closest(".fav-btn") || (event.target.closest(".card-play") && !forcePlay)) return;

    if (item.type === 'youtube_video') {
        playFromSearch(item.id, true);
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
}
