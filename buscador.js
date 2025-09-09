// buscador.js — versión sin NoEmbed, usando Jina AI (JSON) para metadatos
// Requiere: cleanTitle, cleanAuthor, youtubeLogoSvg, youtubeMusicLogoSvg, spotifyLogoSvg,
//           appendResults, updateHomeGridVisibility, playFromSearch, isFav (desde main.js)
// No redefine utilidades existentes en main.js.

// -------------------- Estado de búsqueda --------------------
let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

// -------------------- Configuración Jina --------------------
const JINA_API_KEY = "jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj"; // tu key
const JINA_BASE = "https://r.jina.ai";
const JINA_HEADERS_TEXT = {
  "Accept": "text/plain",
  "Authorization": `Bearer ${JINA_API_KEY}`,
};
const JINA_HEADERS_JSON = {
  "Accept": "application/json",
  "Authorization": `Bearer ${JINA_API_KEY}`,
};

// -------------------- Helpers --------------------
async function withRetry(fn, retries = 2, delay = 300) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries) { console.error("Scraping failed after retries:", e); throw e; }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function unique(list) { return [...new Set(list)]; }

function extractIdsFromSearchHTML(html, limit = 20) {
  // Captura IDs únicos de watch?v=XXXXXXXXXXX
  const ids = Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]);
  return unique(ids).slice(0, limit);
}

function pickTitleFromJinaJSON(j) {
  // Intentos comunes en la estructura de Jina:
  // j.data?.title, j.title, OpenGraph/meta extraídos
  return (
    j?.data?.title ||
    j?.title ||
    j?.data?.["og:title"] ||
    j?.data?.ogTitle ||
    ""
  ).toString().trim();
}

function pickAuthorFromJinaJSON(j) {
  // Intentos comunes: channel/owner/author
  const cand = (
    j?.data?.author ||
    j?.data?.channelTitle ||
    j?.data?.owner ||
    j?.data?.channel?.name ||
    j?.author ||
    ""
  ).toString().trim();
  return cand || "YouTube";
}

function looksLikeTopic(authorStr) {
  return /\btopic\b/i.test(authorStr || "");
}

// -------------------- Scraping de resultados --------------------
async function scrapeYoutubeIds(query, limit = 20) {
  const url = `${JINA_BASE}/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return withRetry(async () => {
    const resp = await fetch(url, { headers: JINA_HEADERS_TEXT });
    if (!resp.ok) throw new Error(`Search proxy error ${resp.status}`);
    const html = await resp.text();
    return extractIdsFromSearchHTML(html, limit);
  });
}

// -------------------- Metadatos por ID (Jina JSON) --------------------
async function fetchVideoMetaById(id) {
  const url = `${JINA_BASE}/https://www.youtube.com/watch?v=${id}`;
  return withRetry(async () => {
    const resp = await fetch(url, { headers: JINA_HEADERS_JSON });
    if (!resp.ok) throw new Error(`Meta proxy error ${resp.status} for id ${id}`);

    // Algunos proxies de Jina devuelven text/plain aunque sea JSON.
    // Intentamos json() y, si falla, tratamos como texto sin romper.
    let data;
    try { data = await resp.json(); }
    catch (_) {
      // Fallback muy defensivo (no debería ocurrir con Accept: application/json)
      const text = await resp.text();
      // No hay forma confiable de parsear; devolvemos mínimos.
      return {
        id,
        title: `Video ${id}`,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        author: "YouTube",
        source: "youtube",
        type: "youtube_video",
        isTopic: false,
      };
    }

    const title = cleanTitle(pickTitleFromJinaJSON(data) || `Video ${id}`);
    const rawAuthor = pickAuthorFromJinaJSON(data) || "YouTube";
    const author = (typeof cleanAuthor === "function") ? cleanAuthor(rawAuthor) : rawAuthor;

    return {
      id,
      title,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      author,
      source: "youtube",
      type: "youtube_video",
      isTopic: looksLikeTopic(rawAuthor),
    };
  });
}

// -------------------- Detalles por lote (reemplaza NoEmbed) --------------------
async function fetchVideoDetailsByIds(ids) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return [];

  // Concurrencia moderada para no saturar el proxy
  const CONCURRENCY = 6;
  const out = [];
  let index = 0;

  async function worker() {
    while (index < uniqueIds.length) {
      const i = index++;
      const id = uniqueIds[i];
      try {
        const meta = await fetchVideoMetaById(id);
        if (meta) out.push(meta);
      } catch (e) {
        // Fallback mínimo si falló metadata
        out.push({
          id,
          title: `Video ${id}`,
          thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          author: "YouTube",
          source: "youtube",
          type: "youtube_video",
          isTopic: false,
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, uniqueIds.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

// -------------------- Búsqueda principal --------------------
async function scrapeYoutube(query, limit = 20) {
  const ids = await scrapeYoutubeIds(query, limit);
  if (!ids.length) return [];
  return await fetchVideoDetailsByIds(ids);
}

async function startSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];

  const resultsEl = document.querySelector("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  if (typeof updateHomeGridVisibility === "function") updateHomeGridVisibility();

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
    console.error("Search failed:", e);
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá por favor.</p></div>`;
  } finally {
    paging.loading = false;
  }
}

// -------------------- Render de resultados --------------------
function appendResults(chunk) {
  const root = document.querySelector("#results");
  if (!root) return;

  for (const it of chunk) {
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;

    let logo = (typeof youtubeLogoSvg === "function") ? youtubeLogoSvg() : "";
    if (it.isTopic) {
      // Aleatorio entre Spotify y YT Music para “Topic”
      if (typeof spotifyLogoSvg === "function" && typeof youtubeMusicLogoSvg === "function") {
        logo = Math.random() < 0.5 ? spotifyLogoSvg() : youtubeMusicLogoSvg();
      }
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
        <div class="subtitle">${(typeof cleanAuthor === "function" ? cleanAuthor(it.author) : it.author) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
          ${typeof isFav === "function" ? ( (isFav(it.id) ? 
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' :
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>'
          )) : "" }
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">
          <svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
        </button>
      </div>
    `;

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

  if (typeof refreshIndicators === "function") refreshIndicators();
}

// -------------------- Click de resultado --------------------
async function handleResultClick(event, item, forcePlay = false) {
  if (event.target.closest(".more") || event.target.closest(".fav-btn") || (event.target.closest(".card-play") && !forcePlay)) return;
  if (item.type === "youtube_video" && typeof playFromSearch === "function") {
    playFromSearch(item.id, true);
  }
}

// -------------------- Overlay & entrada --------------------
function initSearch() {
  const searchOverlay = document.querySelector("#searchOverlay");
  const overlayInput  = document.querySelector("#overlaySearchInput");

  function openSearch() {
    searchOverlay.classList.add("show");
    setTimeout(() => { overlayInput.focus(); overlayInput.select(); }, 50);
  }
  function closeSearch() { searchOverlay.classList.remove("show"); }

  document.querySelector("#searchFab")?.addEventListener("click", openSearch);
  searchOverlay?.addEventListener("click", e => { if (e.target === searchOverlay) closeSearch(); });
  overlayInput?.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    const q = overlayInput.value.trim();
    if (!q) return;

    closeSearch();
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    if (typeof switchView === "function") switchView("view-search");
    await startSearch(q);
  });
}

// Exponer initSearch si el proyecto lo espera en window (por compat)
if (typeof window !== "undefined") {
  window.initSearch = initSearch;
  window.startSearch = startSearch;
  // También exponemos estas si otras partes las usan:
  window.fetchVideoDetailsByIds = fetchVideoDetailsByIds;
}
