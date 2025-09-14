/* =========================================================================
   SanaveraYou Pro - buscador.js (YouTube via App Android + NoEmbed)
   -------------------------------------------------------------------------
   - Usa tu app Android (HTTP en puerto 5000) para scrapear IDs de YouTube.
   - Completa metadatos con NoEmbed (título, autor, thumb).
   - No usa r.jina.ai ni otros proxys.
   - No re-declara helpers globales (cleanTitle, cleanAuthor, $, etc.)
   - Mantiene la UI actual: overlay de búsqueda, render de resultados.
   ========================================================================= */

/* ========= CONFIG EDITABLE ============================================== */

// ⇣⇣⇣ CAMBIÁ SOLO ESTA IP CUANDO CAMBIE TU IP PÚBLICA ⇣⇣⇣
const ANDROID_SCRAPER_HOST = 'http://191.85.26.215:5000';
// ⇡⇡⇡ CAMBIÁ SOLO ESTA IP CUANDO CAMBIE TU IP PÚBLICA ⇡⇡⇡

const MAX_RESULTS = 20; // cuántos videos mostrar
const NOEMBED_URL = 'https://noembed.com/embed?url=';

/* ========= ESTADO INTERNO ============================================== */

let searchAbort = null;
let items = [];
let paging = { query: "", loading: false };

/* ========= HELPERS MÍNIMOS (no pisan los tuyos) ======================== */

// Selección segura sin romper si no existe $
function $(sel, root) {
  try {
    return (root || document).querySelector(sel);
  } catch { return null; }
}

function $all(sel, root) {
  try {
    return Array.from((root || document).querySelectorAll(sel));
  } catch { return []; }
}

// Evita crashear si no existen helpers visuales en este build
function safe(fnName, fallback) {
  try {
    const fn = window[fnName];
    return typeof fn === 'function' ? fn : fallback;
  } catch { return fallback; }
}

// Toast opcional si lo tenés
const toast = (msg) => {
  const t = window.toast || window.showToast || null;
  if (typeof t === 'function') t(msg);
  else console.log('[toast]', msg);
};

// Mantener la home grid visible/oculta si existe esa lógica
function updateHomeGridVisibility() {
  try {
    const fn = window.updateHomeGridVisibility;
    if (typeof fn === 'function') fn();
  } catch {}
}

// Limpia autor/título si están disponibles globalmente
const _cleanTitle = (s) => (typeof window.cleanTitle === 'function' ? window.cleanTitle(s) : s || '');
const _cleanAuthor = (s) => (typeof window.cleanAuthor === 'function' ? window.cleanAuthor(s) : s || '');

/* ========= CORE: BUILD SEARCH URL (YouTube HTML) ======================= */

function buildYouTubeSearchURL(q) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/* ========= CORE: PEDIR IDs A TU APP ANDROID ============================ */

async function fetchIdsViaAndroid(searchUrl, signal) {
  const url = `${ANDROID_SCRAPER_HOST}/?url=${encodeURIComponent(searchUrl)}`;
  const r = await fetch(url, { signal, method: 'GET' });
  if (!r.ok) throw new Error(`Android scraper ${r.status}`);
  const text = await r.text();

  // Admite líneas con URL completa o solo ID
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const ids = [];
  for (const line of lines) {
    // URL con ?v=
    const m = line.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) { ids.push(m[1]); continue; }
    // ID pelado
    if (/^[a-zA-Z0-9_-]{11}$/.test(line)) ids.push(line);
  }
  // dedupe + recorte
  return [...new Set(ids)].slice(0, MAX_RESULTS);
}

/* ========= CORE: COMPLETAR METADATOS CON NOEMBED ======================= */

async function fetchNoEmbedBatch(ids, signal) {
  const results = [];
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const r = await fetch(`${NOEMBED_URL}https://www.youtube.com/watch?v=${id}`, { signal });
        const meta = await r.json();
        if (meta && !meta.error) {
          results.push({
            id,
            title: _cleanTitle(meta.title || `Video ${id}`),
            thumb: meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: _cleanAuthor(meta.author_name || 'YouTube'),
            source: 'youtube',
            type: 'youtube_video',
            isTopic: /topic/i.test(meta.author_name || '')
          });
        } else {
          results.push({
            id,
            title: `Video ${id}`,
            thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            author: 'YouTube',
            source: 'youtube',
            type: 'youtube_video',
            isTopic: false
          });
        }
      } catch {
        // fallback duro si noembed falla
        results.push({
          id,
          title: `Video ${id}`,
          thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          author: 'YouTube',
          source: 'youtube',
          type: 'youtube_video',
          isTopic: false
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker);
  await Promise.all(workers);
  return results;
}

/* ========= RENDER DE RESULTADOS (compat con tu UI) ===================== */

function youtubeLogoSvgSafe() {
  try {
    return typeof window.youtubeLogoSvg === 'function'
      ? window.youtubeLogoSvg()
      : '<span class="logo-pill">YT</span>';
  } catch {
    return '<span class="logo-pill">YT</span>';
  }
}
function youtubeMusicLogoSvgSafe() {
  try {
    return typeof window.youtubeMusicLogoSvg === 'function'
      ? window.youtubeMusicLogoSvg()
      : '<span class="logo-pill">YTM</span>';
  } catch {
    return '<span class="logo-pill">YTM</span>';
  }
}
function spotifyLogoSvgSafe() {
  try {
    return typeof window.spotifyLogoSvg === 'function'
      ? window.spotifyLogoSvg()
      : '<span class="logo-pill">SP</span>';
  } catch {
    return '<span class="logo-pill">SP</span>';
  }
}
function favIconSvgSafe(active) {
  try {
    return typeof window.favIconSvg === 'function'
      ? window.favIconSvg(active)
      : (active ? '★' : '☆');
  } catch {
    return active ? '★' : '☆';
  }
}
function isFavSafe(id) {
  try {
    return typeof window.isFav === 'function' ? !!window.isFav(id) : false;
  } catch { return false; }
}
function dotsSvgSafe() {
  try {
    return typeof window.dotsSvg === 'function' ? window.dotsSvg() : '⋮';
  } catch { return '⋮'; }
}

function appendResults(chunk){
  const root = $("#results");
  if(!root) return;

  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;

    // marca
    let logo = youtubeLogoSvgSafe();
    if (it.isTopic) {
      // si es topic, alterna visual (no afecta la lógica)
      logo = Math.random() < 0.5 ? spotifyLogoSvgSafe() : youtubeMusicLogoSvgSafe();
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
        <div class="subtitle">${_cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
            ${favIconSvgSafe(isFavSafe(it.id))}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvgSafe()}</button>
      </div>`;

    // comportamiento click tarjeta
    item.addEventListener("click", (e) => handleResultClick(e, it));

    // botón play en la tarjeta
    const cardPlayBtn = item.querySelector(".card-play");
    if (cardPlayBtn) {
      cardPlayBtn.onclick = (e) => {
        e.stopPropagation();
        handleResultClick(e, it, true);
      };
    }

    root.appendChild(item);
  }

  // refresco visual (si existe)
  try { if (typeof window.refreshIndicators === 'function') window.refreshIndicators(); } catch {}
}

async function handleResultClick(event, item, forcePlay = false) {
  // no interferir con menú ni fav
  if (event && (event.target.closest?.(".more") || event.target.closest?.(".fav-btn") || (event.target.closest?.(".card-play") && !forcePlay))) return;

  if (item.type === 'youtube_video') {
    // usa tu reproductor si está disponible
    if (typeof window.playFromSearch === 'function') {
      window.playFromSearch(item.id, true);
    } else {
      console.warn('[buscador] playFromSearch no disponible; ID:', item.id);
    }
  }
}

/* ========= BÚSQUEDA PRINCIPAL ========================================== */

async function startSearch(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  const { signal } = searchAbort;

  paging = { query, loading: true };
  items = [];

  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  updateHomeGridVisibility();

  try {
    // 1) URL HTML de YouTube
    const ytUrl = buildYouTubeSearchURL(query);

    // 2) IDs via App Android
    const ids = await fetchIdsViaAndroid(ytUrl, signal);
    if (signal.aborted) return;

    if (!ids.length) {
      if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
      paging.loading = false;
      return;
    }

    // 3) Metadatos con NoEmbed
    const enriched = await fetchNoEmbedBatch(ids, signal);
    if (signal.aborted) return;

    items = enriched;
    if (resultsEl) resultsEl.innerHTML = '';
    appendResults(items);
    updateHomeGridVisibility();

  } catch (e) {
    console.error('Search failed:', e);
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá.</p></div>`;
  } finally {
    paging.loading = false;
  }
}

/* ========= OVERLAY / UI DE BÚSQUEDA ==================================== */

function initSearch() {
  const searchOverlay = $("#searchOverlay");
  const overlayInput  = $("#overlaySearchInput");

  function openSearch() {
    searchOverlay?.classList.add("show");
    setTimeout(() => { overlayInput?.focus(); overlayInput?.select(); }, 50);
  }
  function closeSearch() { searchOverlay?.classList.remove("show"); }

  $("#searchFab")?.addEventListener("click", openSearch);
  searchOverlay?.addEventListener("click", e => { if(e.target === searchOverlay) closeSearch(); });
  overlayInput?.addEventListener("keydown", async e => {
    if (e.key !== "Enter") return;
    const q = overlayInput.value.trim();
    if (!q) return;

    closeSearch();
    // scroll top
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    // cambiar a vista de búsqueda (si existe)
    try { if (typeof window.switchView === 'function') window.switchView('view-search'); } catch {}

    await startSearch(q);
  });
}

/* ========= EXPONE PÚBLICO ============================================== */

window.Buscador = Object.freeze({
  initSearch,
  startSearch,
  // config runtime por si cambiás IP sin editar archivo:
  setAndroidScraperHost(host) {
    if (typeof host === 'string' && host.startsWith('http')) {
      // eslint-disable-next-line no-global-assign
      ANDROID_SCRAPER_HOST = host; // nota: si tu bundler no permite, cambiá manual arriba
    }
  }
});

// auto-init si el DOM ya está
document.addEventListener('DOMContentLoaded', () => {
  try { initSearch(); } catch (e) { console.warn('initSearch falló:', e); }
});
