// Contiene toda la lógica de búsqueda, optimizada para usar Jina.ai en modo JSON y descartar NoEmbed.

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

/**
 * Función de reintento mejorada con backoff exponencial.
 * @param {function} fn - La función a ejecutar.
 * @param {number} retries - El número de reintentos.
 * @param {number} delay - El tiempo de espera inicial entre reintentos.
 * @returns {Promise<any>}
 */
async function withRetry(fn, retries = 3, delay = 500) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.warn(`Reintento ${i + 1} de ${retries} falló:`, err);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
            }
        }
    }
    throw lastError;
}

/**
 * Extraer videoId de distintas formas de URL (incluyendo shorts).
 * @param {string} url - La URL de YouTube.
 * @returns {string|null} El ID del video.
 */
function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    
    try {
        // Patrones de URL de YouTube más comunes
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
            /youtube\.com\/shorts\/([^&\n?#]+)/,
            /^([a-zA-Z0-9_-]{11})$/ // ID directo
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // Fallback para URLs malformadas
        if (url.includes('watch?v=')) {
            const urlParts = url.split('watch?v=')[1];
            if (urlParts) {
                return urlParts.split('&')[0].split('#')[0];
            }
        }
        
    } catch (e) {
        console.warn("Error al extraer videoId:", e, "URL:", url);
    }
    
    return null;
}

/**
 * Limpia y formatea el título del video
 * @param {string} title - El título original
 * @returns {string} El título limpio
 */
function cleanTitle(title) {
    if (!title || typeof title !== 'string') return 'Video sin título';
    return title.trim().replace(/\s+/g, ' ').substring(0, 200);
}

/**
 * Limpia y formatea el nombre del autor
 * @param {string} author - El nombre del autor original
 * @returns {string} El nombre del autor limpio
 */
function cleanAuthor(author) {
    if (!author || typeof author !== 'string') return 'Autor desconocido';
    return author.trim().replace(/\s+/g, ' ').substring(0, 100);
}

/**
 * Scraping usando Jina.ai JSON (versión final y simplificada).
 * @param {string} query - La consulta de búsqueda.
 * @param {number} limit - El número máximo de resultados.
 * @returns {Promise<Array<object>>} Una lista de objetos de video.
 */
async function scrapeYoutubeWithDetails(query, limit = 20) {
    if (!query || typeof query !== 'string') {
        throw new Error('Query de búsqueda inválida');
    }

    return withRetry(async () => {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
        const endpoint = `https://r.jina.ai/${searchUrl}`;
        
        console.log('Buscando en:', endpoint);
        
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                "Accept": "application/json",
                "Authorization": "Bearer jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj",
                "X-No-Cache": "true"
            },
            signal: searchAbort?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error de respuesta:', response.status, errorText);
            throw new Error(`Proxy failed with status ${response.status}: ${errorText}`);
        }
        
        const jsonData = await response.json();
        console.log('Respuesta de Jina.ai:', jsonData);

        // Verificar estructura de respuesta
        if (!jsonData) {
            throw new Error('Respuesta vacía de Jina.ai');
        }

        let dataArray = [];
        
        // Intentar diferentes estructuras posibles
        if (jsonData.data && Array.isArray(jsonData.data)) {
            dataArray = jsonData.data;
        } else if (Array.isArray(jsonData)) {
            dataArray = jsonData;
        } else if (jsonData.content && Array.isArray(jsonData.content)) {
            dataArray = jsonData.content;
        } else {
            console.warn("Estructura inesperada de Jina.ai:", jsonData);
            return [];
        }

        const videoResults = [];
        
        for (const item of dataArray) {
            try {
                if (!item || typeof item !== 'object') continue;
                
                const videoId = extractVideoId(item.url || item.link || item.href);
                if (!videoId) continue;
                
                const title = item.title || item.name || item.text || `Video ${videoId}`;
                const author = item.author || item.channel || item.uploader || "YouTube";
                const thumbnail = item.thumbnail || item.image || item.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                
                const videoObj = {
                    id: videoId,
                    title: cleanTitle(title),
                    thumb: thumbnail,
                    author: cleanAuthor(author),
                    source: "youtube",
                    type: "youtube_video",
                    isTopic: /topic|music/i.test(author),
                    url: `https://www.youtube.com/watch?v=${videoId}`
                };
                
                videoResults.push(videoObj);
                
            } catch (itemError) {
                console.warn('Error procesando item:', itemError, item);
                continue;
            }
        }

        console.log(`Encontrados ${videoResults.length} videos válidos`);
        return videoResults.slice(0, limit);
        
    }, 3, 1000);
}

/**
 * Función de compatibilidad para main.js (carga de playlists recomendadas).
 * @param {Array<string>} ids - Una lista de IDs de videos de YouTube.
 * @returns {Promise<Array<object>>} Una lista de objetos con los metadatos de los videos.
 */
async function fetchVideoDetailsByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    
    const uniqueIds = [...new Set(ids.filter(id => id && typeof id === 'string'))];
    if (uniqueIds.length === 0) return [];
    
    console.log(`Obteniendo detalles para ${uniqueIds.length} videos`);
    
    const metadataPromises = uniqueIds.map(async (id) => {
        try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`, {
                timeout: 5000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const meta = await response.json();
            
            if (meta.error) {
                throw new Error(meta.error);
            }
            
            return {
                id,
                title: cleanTitle(meta.title || `Video ${id}`),
                thumb: meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                author: cleanAuthor(meta.author_name || "YouTube"),
                source: 'youtube',
                type: 'youtube_video',
                isTopic: /topic|music/i.test(meta.author_name || ""),
                url: `https://www.youtube.com/watch?v=${id}`
            };
            
        } catch (error) {
            console.warn(`Error obteniendo metadata para ${id}:`, error);
            return {
                id,
                title: `Video ${id}`,
                thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                author: "YouTube",
                source: 'youtube',
                type: 'youtube_video',
                isTopic: false,
                url: `https://www.youtube.com/watch?v=${id}`
            };
        }
    });
    
    const results = await Promise.all(metadataPromises);
    return results.filter(Boolean);
}

/**
 * Inicia el proceso de búsqueda.
 * @param {string} query - La consulta de búsqueda.
 */
async function startSearch(query) {
    if (!query || typeof query !== 'string' || !query.trim()) {
        console.warn('Query de búsqueda inválida');
        return;
    }
    
    // Cancelar búsqueda anterior
    if (searchAbort) {
        searchAbort.abort();
    }
    
    searchAbort = new AbortController();
    paging = { query: query.trim(), loading: true };
    items = [];
    
    const resultsEl = document.getElementById("results");
    if (resultsEl) {
        resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando "${query.trim()}"… espere</h3></div>`;
    }
    
    // Asegurar que la función existe
    if (typeof updateHomeGridVisibility === 'function') {
        updateHomeGridVisibility();
    }
    
    try {
        console.log('Iniciando búsqueda para:', query.trim());
        const videoResults = await scrapeYoutubeWithDetails(query.trim(), 20);
        
        // Verificar si la búsqueda fue cancelada
        if (searchAbort.signal.aborted) {
            console.log('Búsqueda cancelada');
            return;
        }
        
        if (resultsEl) {
            resultsEl.innerHTML = "";
        }
        
        if (videoResults.length === 0) {
            if (resultsEl) {
                resultsEl.innerHTML = `
                    <div class="loading-indicator">
                        <p>No se encontraron videos para "${query.trim()}".</p>
                        <p>Intenta con otros términos de búsqueda.</p>
                    </div>`;
            }
            return;
        }

        items = videoResults;
        console.log(`Mostrando ${items.length} resultados`);
        appendResults(items);

    } catch (error) {
        console.error('Error en la búsqueda:', error);
        
        if (searchAbort.signal.aborted) {
            console.log('Búsqueda cancelada por el usuario');
            return;
        }
        
        if (resultsEl) {
            resultsEl.innerHTML = `
                <div class="loading-indicator">
                    <p>Error en la búsqueda: ${error.message}</p>
                    <p>Por favor, reintenta en unos momentos.</p>
                </div>`;
        }
    } finally {
        paging.loading = false;
    }
}

/**
 * Agrega los resultados de la búsqueda al DOM.
 * @param {Array<object>} chunk - Un array de objetos de video.
 */
function appendResults(chunk) {
    const root = document.getElementById("results");
    if (!root || !Array.isArray(chunk)) return;
    
    for (const item of chunk) {
        if (!item || !item.id) continue;
        
        try {
            const article = document.createElement("article");
            article.className = "result-item";
            article.dataset.trackId = item.id;

            // Obtener logo según el tipo
            let logo = '';
            if (typeof youtubeLogoSvg === 'function') {
                logo = youtubeLogoSvg();
                if (item.isTopic && Math.random() < 0.5) {
                    if (typeof spotifyLogoSvg === 'function') {
                        logo = spotifyLogoSvg();
                    } else if (typeof youtubeMusicLogoSvg === 'function') {
                        logo = youtubeMusicLogoSvg();
                    }
                }
            }
            
            article.innerHTML = `
                <div class="thumb-wrap">
                    <img class="thumb" loading="lazy" decoding="async" 
                         src="${item.thumb}" 
                         alt="${item.title}"
                         onerror="this.src='https://i.ytimg.com/vi/${item.id}/hqdefault.jpg'">
                    <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
                        <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                    </button>
                </div>
                <div class="meta">
                    <div class="title-line">
                        ${logo}
                        <span class="title-text">${item.title}</span>
                        <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
                    </div>
                    <div class="subtitle">${item.author}</div>
                </div>
                <div class="actions">
                    <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
                        ${typeof favIconSvg === 'function' && typeof isFav === 'function' 
                            ? favIconSvg(isFav(item.id)) 
                            : '★'}
                    </button>
                    <button class="icon-btn more" title="Opciones" aria-label="Opciones">
                        ${typeof dotsSvg === 'function' ? dotsSvg() : '⋯'}
                    </button>
                </div>`;
            
            // Event listener para el artículo completo
            article.addEventListener("click", (e) => handleResultClick(e, item));

            // Event listener específico para el botón de play
            const cardPlayBtn = article.querySelector(".card-play");
            if (cardPlayBtn) {
                cardPlayBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    handleResultClick(e, item, true);
                });
            }
            
            root.appendChild(article);
            
        } catch (error) {
            console.error('Error creando elemento de resultado:', error, item);
        }
    }
    
    // Actualizar indicadores si la función existe
    if (typeof refreshIndicators === 'function') {
        refreshIndicators();
    }
}

/**
 * Maneja el clic en un resultado de búsqueda.
 * @param {Event} event - El evento de clic.
 * @param {object} item - El objeto del video.
 * @param {boolean} forcePlay - Si se debe forzar la reproducción.
 */
async function handleResultClick(event, item, forcePlay = false) {
    // Evitar manejar clics en botones específicos
    if (event.target.closest(".more") || 
        event.target.closest(".fav-btn") || 
        (event.target.closest(".card-play") && !forcePlay)) {
        return;
    }

    if (item.type === 'youtube_video' && item.id) {
        console.log('Reproduciendo video:', item.title);
        
        // Llamar a la función de reproducción si existe
        if (typeof playFromSearch === 'function') {
            playFromSearch(item.id, true);
        } else if (typeof playVideo === 'function') {
            playVideo(item.id);
        } else {
            console.warn('No se encontró función de reproducción disponible');
            // Fallback: abrir en nueva pestaña
            window.open(`https://www.youtube.com/watch?v=${item.id}`, '_blank');
        }
    }
}

/**
 * Inicializa los listeners para la búsqueda (overlay, etc.).
 */
function initSearch() {
    const searchOverlay = document.getElementById("searchOverlay");
    const overlayInput = document.getElementById("overlaySearchInput");
    const searchFab = document.getElementById("searchFab");
    
    if (!searchOverlay || !overlayInput) {
        console.warn('Elementos de búsqueda no encontrados en el DOM');
        return;
    }
    
    function openSearch() {
        searchOverlay.classList.add("show");
        setTimeout(() => {
            overlayInput.focus();
            overlayInput.select();
        }, 50);
    }
    
    function closeSearch() {
        searchOverlay.classList.remove("show");
    }

    // Event listener para abrir búsqueda
    if (searchFab) {
        searchFab.addEventListener("click", openSearch);
    }
    
    // Event listener para cerrar búsqueda al hacer clic fuera
    searchOverlay.addEventListener("click", (e) => {
        if (e.target === searchOverlay) {
            closeSearch();
        }
    });
    
    // Event listener para buscar al presionar Enter
    overlayInput.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return;
        
        const query = overlayInput.value.trim();
        if (!query) return;

        closeSearch();
        
        // Scroll al inicio
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;

        // Cambiar vista si la función existe
        if (typeof switchView === 'function') {
            switchView("view-search");
        }
        
        await startSearch(query);
    });
    
    console.log('Sistema de búsqueda inicializado correctamente');
}

// Inicializar búsqueda cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
} else {
    initSearch();
}
