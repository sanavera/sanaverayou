/* ===============================
   Buscador – YouTube + Archive.org
   (adaptado para usar scraper Android en puerto 5000)
   =============================== */

let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

/* Si querés sobreescribir la IP en index.html:
   <script>window.YT_SCRAPER_HOST = "http://TU_IP_PUBLICA:5000";</script>
   Si no está definida, usamos la de abajo como fallback.
*/
const DEFAULT_SCRAPER_HOST = "http://191.85.26.215:5000";

/* -------------------------------
   Utilidades (reintentos, helpers)
--------------------------------- */
async function withRetry(fn, retries = 3, delay = 500) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      console.warn(`Reintento ${i + 1}/${retries} falló:`, err);
      if (i < retries - 1) await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw lastError;
}

// Algunas funciones utilitarias se asumen globales en tu proyecto:
// - cleanTitle, cleanAuthor (están en main.js, NO las redefino)
// - $, switchView, updateHomeGridVisibility, refreshIndicators
// - isFav, favIconSvg, youtubeLogoSvg, youtubeMusicLogoSvg, spotifyLogoSvg, dotsSvg
// - handleResultClick/playFromSearch ya están en tu proyecto (no los toco)

/* ---------------------------------
   Archive.org – búsqueda de álbums
----------------------------------- */
async function archiveSearchAlbums(artistOrQuery, limit = 100) {
  const q = encodeURIComponent(artistOrQuery);
  const url = `https://archive.org/advancedsearch.php?q=${q}+mediatype%3A(audio)&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=publicdate&sort%5B%5D=downloads+desc&sort%5B%5D=&sort%5B%5D=&rows=${limit}&page=1&output=json`;

  const res = await fetch(url, { signal: searchAbort?.signal });
  if (!res.ok) throw new Error(`Archive.org falló: ${res.status}`);
  const data = await res.json();
  const docs = data?.response?.docs || [];

  // Transformo a cards de álbum (misma estructura que usás en resultados)
  const albums = docs.map(d => ({
    id: d.identifier,
    title: d.title || "Sin título",
    author: d.creator || "Desconocido",
    thumb: `https://archive.org/services/img/${d.identifier}`,
    source: "archive",
    type: "archive_album"
  }));

  // Orden preferente: coincidencia exacta al inicio del título
  const normQ = (artistOrQuery || "").toLowerCase().trim();
  const exactFirst = [];
  const others = [];
  for (const a of albums) {
    const t = (a.title || "").toLowerCase();
    if (t.startsWith(normQ)) exactFirst.push(a);
    else others.push(a);
  }
  return [...exactFirst, ...others];
}

/* -------------------------------------------------
   YouTube – scraping IDs vía servidor Android (5000)
   y enriquecimiento con NoEmbed
--------------------------------------------------- */
async function scrapeYoutubeWithDetails(query, limit = 20) {
  // === Android scraper endpoint (plain text list of YouTube URLs) ===
  const SCRAPER_HOST = (typeof window !== "undefined" && window.YT_SCRAPER_HOST) ? window.YT_SCRAPER_HOST : DEFAULT_SCRAPER_HOST;
  const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  const res = await fetch(`${SCRAPER_HOST}/?url=${encodeURIComponent(ytSearchUrl)}`, {
    signal: searchAbort?.signal
  });
  if (!res.ok) throw new Error(`Scraper falló: ${res.status}`);
  const text = await res.text();

  // El server devuelve líneas con URLs completas; extraemos IDs únicos (11 chars)
  const ids = Array.from(new Set(
    Array.from(text.matchAll(/([a-zA-Z0-9_-]{11})/g)).map(m => m[1])
  )).slice(0, limit);

  if (!ids.length) return [];

  // Enriquecemos con NoEmbed (título/autor/thumbnail) – fallback si falla
  const detailed = await fetchVideoDetailsByIds(ids);
  return detailed;
}

async function fetchVideoDetailsByIds(ids) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];

  const metadataPromises = uniqueIds.map(id =>
    fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
      .then(r => r.json())
      .then(meta => {
        if (meta.error) {
          return {
            id,
            title: `Video ${id}`,
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: "YouTube",
            source: 'youtube',
            type: 'youtube_video',
            isTopic: false
          };
        }
        return {
          id,
          title: cleanTitle(meta.title || `Video ${id}`),
          thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
          author: cleanAuthor(meta.author_name || "YouTube"),
          source: 'youtube',
          type: 'youtube_video',
          isTopic: /topic/i.test(meta.author_name || "")
        };
      })
      .catch(() => ({
        id,
        title: `Video ${id}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        author: "YouTube",
        source: 'youtube',
        type: 'youtube_video',
        isTopic: false
      }))
  );

  return (await Promise.all(metadataPromises)).filter(Boolean);
}

/* -------------------------------------------------
   Búsqueda principal (Canciones/Álbumes)
--------------------------------------------------- */
async function startSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];

  const resultsEl = $("#results");
  if (resultsEl) {
    resultsEl.innerHTML = `
      <div class="loading-indicator">
        <h3>Buscando… espere (puede tardar unos segundos)</h3>
      </div>`;
  }
  updateHomeGridVisibility?.();

  try {
    // Modo seleccionado en tu UI.
    // Asumo que existe getSearchMode() -> 'songs' | 'albums'
    const mode = (typeof getSearchMode === "function") ? getSearchMode() : 'songs';

    if (mode === 'albums') {
      const albums = await archiveSearchAlbums(query, 120);
      if (searchAbort.signal.aborted) return;
      if (resultsEl) resultsEl.innerHTML = "";
      if (!albums.length) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron álbumes.</p></div>`;
        return;
      }
      items = albums;
      appendResults(items);
      return;
    }

    // Canciones (YouTube)
    const videoResults = await scrapeYoutubeWithDetails(query, 24);
    if (searchAbort.signal.aborted) return;

    if (resultsEl) resultsEl.innerHTML = "";
    if (!videoResults.length) {
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

/* -------------------------------------------------
   Render de resultados (cards)
--------------------------------------------------- */
function appendResults(chunk) {
  const root = $("#results"); if (!root) return;
  for (const it of chunk) {
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;

    let logo = youtubeLogoSvg?.();
    if (it.source === "archive") {
      // Podrías usar un ícono propio para Archive si lo tenés
      logo = spotifyLogoSvg?.(); // placeholder si ya lo usabas
    } else if (it.isTopic) {
      logo = youtubeMusicLogoSvg?.();
    }

    const sub = it.source === "archive"
      ? (it.author || "")
      : (cleanAuthor(it.author) || "");

    const thumb = it.thumb || (it.source === "archive"
      ? `https://archive.org/services/img/${it.id}`
      : `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg`);

    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          ${logo || ""}
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${sub}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
          ${favIconSvg?.(isFav?.(it.id))}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg?.()}</button>
      </div>`;

    // Clicks
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
  refreshIndicators?.();
}

async function handleResultClick(event, item, forcePlay = false) {
  // Respetar tus botones internos
  if (event.target.closest(".more") || event.target.closest(".fav-btn") || (event.target.closest(".card-play") && !forcePlay)) return;

  if (item.type === 'youtube_video') {
    // Reusar tu lógica de reproducción desde resultados
    playFromSearch?.(item.id, true);
  } else if (item.type === 'archive_album') {
    // Abrir álbum en reproductor (tu lógica debe existir ya)
    openArchiveAlbumInPlayer?.(item.id, item.title, item.author);
  }
}

/* -------------------------------------------------
   Overlay / Input de búsqueda (UI existente)
--------------------------------------------------- */
function initSearch() {
  const searchOverlay = $("#searchOverlay");
  const overlayInput = $("#overlaySearchInput");

  function openSearch() {
    searchOverlay.classList.add("show");
    setTimeout(() => { overlayInput.focus(); overlayInput.select(); }, 50);
  }
  function closeSearch() { searchOverlay.classList.remove("show"); }

  $("#searchFab")?.addEventListener("click", openSearch);
  searchOverlay?.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
  overlayInput?.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    const q = overlayInput.value.trim();
    if (!q) return;

    closeSearch();
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    switchView?.("view-search");
    await startSearch(q);
  });
}

// Export/Inicializar si corresponde
try { initSearch(); } catch (_) {}
