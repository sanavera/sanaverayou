// buscador.js
// Búsqueda por scraping usando Jina.ai (JSON). Sin NoEmbed.
// Mantiene la interfaz usada por el proyecto original y NO redefine cleanTitle.

// ===================== Config ======================
const JINA_KEY = "jina_6c98eab8c1b34747848a9acec3fa46da1c2tzg6SrvB9zUWtnvt4nY2ytOzj";
const JINA_BASE = "https://r.jina.ai"; // funciona con Accept: application/json

// ===================== Estado ======================
let items = [];
let searchAbort = null;
let paging = { query: "", loading: false };

// ===================== Utils =======================
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

function extractVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.pathname.startsWith("/watch/")) return u.pathname.split("/watch/")[1];
    if (u.pathname.includes("/shorts/")) return u.pathname.split("/shorts/")[1];
  } catch {
    // ignore
  }
  const m = url.match(/watch\?v=([\w-]{11})/);
  return m ? m[1] : null;
}

function cleanAuthor(author) {
  if (!author) return "YouTube";
  return author.replace(/ - Topic$/, "").trim();
}

// ================== Core Jina fetchers =================
async function jinaFetchJSON(urlPath) {
  const url = `${JINA_BASE}/${urlPath}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${JINA_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Jina fetch JSON failed: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Unexpected content-type for JSON: ${ct}`);
  }
  return res.json();
}

async function jinaFetchText(urlPath) {
  const url = `${JINA_BASE}/${urlPath}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "text/plain",
      "Authorization": `Bearer ${JINA_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Jina fetch TEXT failed: ${res.status}`);
  return res.text();
}

// ================== Parsers ============================
function parseJinaResultsJSON(jsonData, limit = 20) {
  if (!jsonData?.data || !Array.isArray(jsonData.data)) return [];
  const out = [];
  for (const it of jsonData.data) {
    const id = extractVideoId(it.url || "");
    if (!id) continue;
    out.push({
      id,
      // cleanTitle viene de main.js
      title: typeof cleanTitle === "function" ? cleanTitle(it.title || `Video ${id}`) : (it.title || `Video ${id}`),
      thumb: it.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      author: cleanAuthor(it.author || "YouTube"),
      source: "youtube",
      type: "youtube_video",
      isTopic: /topic/i.test(it.author || "")
    });
    if (out.length >= limit) break;
  }
  return out;
}

function parseJinaResultsFromHTML(html, limit = 20) {
  const ids = [...new Set(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))];
  const out = [];
  for (const id of ids.slice(0, limit)) {
    out.push({
      id,
      title: typeof cleanTitle === "function" ? cleanTitle(`Video ${id}`) : `Video ${id}`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      author: "YouTube",
      source: "youtube",
      type: "youtube_video",
      isTopic: false
    });
  }
  return out;
}

// ================== Public search API ===================
async function scrapeYoutube(query, limit = 20) {
  return withRetry(async () => {
    const q = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    // 1) Intentar JSON
    try {
      const jsonData = await jinaFetchJSON(q);
      const parsed = parseJinaResultsJSON(jsonData, limit);
      if (parsed.length) return parsed;
    } catch (e) {
      console.warn("JSON path failed or empty, falling back to TEXT", e);
    }

    // 2) Fallback a TEXT
    const html = await jinaFetchText(q);
    const parsed = parseJinaResultsFromHTML(html, limit);
    return parsed;
  });
}

// Mantener helpers de URL-only/posición (usan JSON y caen a TEXT)
async function scrapeYoutubeUrlOnly(query) {
  return withRetry(async () => {
    const q = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    try {
      const json = await jinaFetchJSON(q);
      const list = parseJinaResultsJSON(json, 1);
      return list[0]?.id || null;
    } catch {
      const html = await jinaFetchText(q);
      const priority = html.match(/watch\?v=([\w-]{11})[^\s"'<]*" aria-label="[^"]*(official video|video oficial|music video)[^"]*/i);
      if (priority) return priority[1];
      const generic = html.match(/watch\?v=([\w-]{11})/);
      return generic ? generic[1] : null;
    }
  });
}

async function scrapeYoutubeIdForNthResult(query, index = 0) {
  return withRetry(async () => {
    const q = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    try {
      const json = await jinaFetchJSON(q);
      const list = parseJinaResultsJSON(json, index + 1);
      return list[index]?.id || null;
    } catch {
      const html = await jinaFetchText(q);
      const ids = [...new Set(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))];
      return ids[index] || null;
    }
  });
}

// ================== UI glue (igual que antes) ==========
async function startSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];

  const resultsEl = $("#results");
  if (resultsEl) {
    resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  }
  updateHomeGridVisibility?.();

  try {
    const videoResults = await scrapeYoutube(query, 20);
    if (searchAbort.signal.aborted) return;

    if (resultsEl) resultsEl.innerHTML = "";
    if (!videoResults.length) {
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

function appendResults(chunk) {
  const root = $("#results"); if (!root) return;
  for (const it of chunk) {
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;

    let logo = youtubeLogoSvg?.() || "";
    if (it.isTopic) {
      logo = Math.random() < 0.5 ? (spotifyLogoSvg?.() || "") : (youtubeMusicLogoSvg?.() || "");
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
        <div class="subtitle">${cleanAuthor(it.author) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
          ${typeof favIconSvg === "function" ? favIconSvg(isFav?.(it.id)) : ""}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${typeof dotsSvg === "function" ? dotsSvg() : "⋯"}</button>
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
  refreshIndicators?.();
}

async function handleResultClick(event, item, forcePlay = false) {
  if (
    event.target.closest(".more") ||
    event.target.closest(".fav-btn") ||
    (event.target.closest(".card-play") && !forcePlay)
  ) return;

  if (item.type === "youtube_video") {
    playFromSearch?.(item.id, true);
  }
}

function initSearch() {
  const searchOverlay = $("#searchOverlay");
  const overlayInput = $("#overlaySearchInput");

  function openSearch() {
    searchOverlay.classList.add("show");
    setTimeout(() => { overlayInput.focus(); overlayInput.select(); }, 50);
  }
  function closeSearch() {
    searchOverlay.classList.remove("show");
  }

  $("#searchFab")?.addEventListener("click", openSearch);
  searchOverlay?.addEventListener("click", (e) => {
    if (e.target === searchOverlay) closeSearch();
  });
  overlayInput?.addEventListener("keydown", async (e) => {
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

// Export opcional para módulos
if (typeof module !== "undefined") {
  module.exports = {
    startSearch,
    initSearch,
    scrapeYoutube,
    scrapeYoutubeUrlOnly,
    scrapeYoutubeIdForNthResult
  };
}
```0
