/* ====== Utilidades ====== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), ss = s % 60; return `${m}:${String(ss).padStart(2, '0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t || "")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig, "")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig, "")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig, "")
  .replace(/\s{2,}/g, " ").trim();

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* ====== Estado ====== */
let items = [];
let favs = [];
let idx = -1;
let currentTrack = null;
let ytPlayer = null;
let YT_READY = false;
let wasPlaying = false;
let timer = null;
let repeatOne = false;
let searchCache = new Map();
let isLoadingMore = false;
let lastQuery = "";
let allIds = [];
let loadedIds = new Set();
const BATCH_SIZE = 6;
const INFINITE_BATCH_SIZE = 6;
let suggestionTimeout = null;

/* ====== Búsqueda (sin API key) ====== */
async function searchYouTube(q, append = false) {
  console.log("searchYouTube: Iniciando búsqueda", { query: q, append });
  setCount("Buscando…");

  if (!append) {
    items = [];
    loadedIds.clear();
    $("#results").innerHTML = "";
    console.log("searchYouTube: Limpiando resultados previos");
  } else if (isLoadingMore) {
    console.log("searchYouTube: Ya está cargando más, saliendo");
    return;
  } else {
    isLoadingMore = true;
    setCount(`Cargando más… (${items.length} mostrados)`);
  }

  if (!append && searchCache.has(q)) {
    console.log("searchYouTube: Resultados desde caché", q);
    items = searchCache.get(q);
    renderResults();
    setCount(`Resultados: ${items.length} (desde caché)`);
    return;
  }

  if (!append) {
    lastQuery = q;
    console.log("searchYouTube: Solicitando a jina.ai", q);
    const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    try {
      const html = await fetch(endpoint, { headers: { Accept: "text/plain" } }).then(r => r.text());
      console.log("searchYouTube: Respuesta de jina.ai recibida", html.length);
      allIds = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m => m[1])).slice(0, 50);
      console.log("searchYouTube: IDs extraídos", allIds.length);
    } catch (e) {
      console.error("searchYouTube: Error en jina.ai", e);
      setCount("Error al conectar con YouTube");
      isLoadingMore = false;
      return;
    }
  }

  const idsToLoad = allIds
    .filter(id => !loadedIds.has(id))
    .slice(0, append ? INFINITE_BATCH_SIZE : BATCH_SIZE);

  console.log("searchYouTube: IDs a procesar", idsToLoad);

  if (idsToLoad.length === 0) {
    setCount(`Resultados: ${items.length} (no hay más)`);
    isLoadingMore = false;
    console.log("searchYouTube: No hay más IDs para cargar");
    return;
  }

  for (const id of idsToLoad) {
    console.log("searchYouTube: Procesando ID", id);
    try {
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
        .then(r => r.json());
      const track = {
        id,
        title: cleanTitle(meta.title || `Video ${id}`),
        thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: meta.author_name || "YouTube"
      };
      items.push(track);
      loadedIds.add(id);
      appendTrackToResults(track, items.length - 1);
      setCount(`Resultados: ${items.length}`);
      console.log("searchYouTube: Track añadido", track.title);
    } catch (e) {
      console.error("searchYouTube: Error al obtener metadatos", id, e);
      const track = {
        id,
        title: cleanTitle(`Video ${id}`),
        thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: "YouTube"
      };
      items.push(track);
      loadedIds.add(id);
      appendTrackToResults(track, items.length - 1);
      setCount(`Resultados: ${items.length}`);
    }
  }

  if (!append) searchCache.set(q, [...items]);
  isLoadingMore = false;
  setCount(`Resultados: ${items.length}`);
}

/* ====== Sugerencias ====== */
async function fetchSuggestion(query) {
  console.log("fetchSuggestion: Solicitando sugerencia para", query);
  const suggestionEl = $("#suggestion");
  if (!suggestionEl) {
    console.error("fetchSuggestion: #suggestion no encontrado");
    return;
  }

  if (query.length < 2) {
    suggestionEl.textContent = "";
    suggestionEl.classList.remove("visible");
    console.log("fetchSuggestion: Consulta demasiado corta, ocultando");
    return;
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://suggestqueries.google.com/complete/search?hl=es&ds=yt&client=youtube&hjson=t&cp=1&q=${encodedQuery}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    console.log("fetchSuggestion: Respuesta recibida", response.status);
    if (response.ok) {
      const json = await response.json();
      const suggestions = json[1].map(item => item[0]);
      const suggestion = suggestions[0] || ""; // Tomar solo la primera sugerencia
      suggestionEl.textContent = suggestion;
      suggestionEl.classList.toggle("visible", suggestion !== "");
      console.log("fetchSuggestion: Sugerencia establecida", suggestion);
    } else {
      console.error("fetchSuggestion: Error HTTP", response.status);
      suggestionEl.textContent = "";
      suggestionEl.classList.remove("visible");
    }
  } catch (e) {
    console.error("fetchSuggestion: Error", e);
    suggestionEl.textContent = "";
    suggestionEl.classList.remove("visible");
  }
}

/* ====== Render ====== */
function setCount(t) {
  console.log("setCount:", t);
  const countEl = $("#resultsCount");
  if (countEl) {
    countEl.textContent = t || "";
  } else {
    console.error("setCount: #resultsCount no encontrado");
  }
}

function appendTrackToResults(track, index) {
  console.log("appendTrackToResults: Añadiendo track", track.title, index);
  const root = $("#results");
  if (!root) {
    console.error("appendTrackToResults: #results no encontrado");
    return;
  }
  const li = document.createElement("article");
  li.className = "card";
  li.dataset.trackId = track.id;
  li.innerHTML = `
    <img class="thumb" src="${track.thumb}" alt="" />
    <div class="meta">
      <div class="title-line">
        <span class="title-text">${track.title}</span>
        <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
      <div class="subtitle">${track.author || ""}</div>
    </div>
    <div class="actions">
      <button class="icon-btn heart ${isFav(track.id) ? 'active' : ''}" title="Favorito">${HEART_SVG}</button>
    </div>`;
  li.addEventListener("click", e => {
    if (e.target.closest(".heart")) {
      toggleFav(track);
      e.stopPropagation();
      return;
    }
    playIndex(index, true);
  });
  root.appendChild(li);
  refreshIndicators();
}

function renderResults() {
  console.log("renderResults: Renderizando todos los resultados", items.length);
  const root = $("#results");
  if (!root) {
    console.error("renderResults: #results no encontrado");
    return;
  }
  root.innerHTML = "";
  items.forEach((it, i) => appendTrackToResults(it, i));
}

function renderFavs() {
  console.log("renderFavs: Renderizando favoritos", favs.length);
  const ul = $("#favList");
  if (!ul) {
    console.error("renderFavs: #favList no encontrado");
    return;
  }
  ul.innerHTML = "";
  favs.forEach((it) => {
    const li = document.createElement("li");
    li.className = "fav-item";
    li.dataset.trackId = it.id;
    li.innerHTML = `
      <img class="thumb" src="${it.thumb}" alt="">
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${it.author || ""}</div>
      </div>
      <button class="remove-btn" title="Quitar">✕</button>
    `;
    li.addEventListener("click", e => {
      if (e.target.closest(".remove-btn")) {
        removeFav(it.id);
        e.stopPropagation();
        return;
      }
      playFromFav(it, true);
    });
    ul.appendChild(li);
  });
  updateHero(currentTrack);
  refreshIndicators();
}

/* ====== Favoritos ====== */
const LS_KEY = "sanayera_favs_v1";
function loadFavs() { try { favs = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { favs = []; } console.log("loadFavs:", favs.length); }
function saveFavs() { localStorage.setItem(LS_KEY, JSON.stringify(favs)); console.log("saveFavs:", favs.length); }
function isFav(id) { return favs.some(f => f.id === id); }
function toggleFav(track) {
  if (isFav(track.id)) { favs = favs.filter(f => f.id !== track.id); }
  else { favs.unshift(track); }
  saveFavs();
  renderResults();
  renderFavs();
}
function removeFav(id) {
  favs = favs.filter(f => f.id !== id);
  saveFavs();
  renderFavs();
  renderResults();
}

/* ====== YouTube IFrame API ====== */
function loadYTApi() {
  if (window.YT && window.YT.Player) { onYouTubeIframeAPIReady(); return; }
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
  console.log("loadYTApi: Cargando YouTube API");
}
window.onYouTubeIframeAPIReady = function () {
  console.log("onYouTubeIframeAPIReady: YouTube API lista");
  ytPlayer = new YT.Player("player", {
    width: 300, height: 150, videoId: "",
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: { onReady: () => { YT_READY = true; console.log("YouTube Player listo"); }, onStateChange: onYTState }
  });
};
function onYTState(e) {
  const st = e.data;
  const playing = (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING);
  $("#btnPlay").classList.toggle("playing", playing);
  $("#btnPlayFav").classList.toggle("playing", playing);
  wasPlaying = playing;
  if (st === YT.PlayerState.ENDED) {
    if (repeatOne) { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); }
    else { next(); }
  }
  refreshIndicators();
}

/* ====== Reproducción ====== */
function updateHero(track) {
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
}

function playIndex(i, autoplay = false) {
  if (!YT_READY || !items[i]) return;
  idx = i;
  currentTrack = items[i];
  ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: 0, suggestedQuality: "auto" });
  if (!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(currentTrack);
  refreshIndicators();
}

function playFromFav(track, autoplay = false) {
  if (!YT_READY || !track) return;
  currentTrack = track;
  idx = items.findIndex(x => x.id === track.id);
  ytPlayer.loadVideoById({ videoId: track.id, startSeconds: 0, suggestedQuality: "auto" });
  if (!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(track);
  refreshIndicators();
}

function togglePlay() {
  if (!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st === YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
function prev() {
  if (idx >= 0 && idx - 1 >= 0) { playIndex(idx - 1, true); return; }
  const pos = favs.findIndex(f => f.id === currentTrack?.id);
  if (pos > 0) playFromFav(favs[pos - 1], true);
}
function next() {
  if (idx >= 0 && idx + 1 < items.length) { playIndex(idx + 1, true); return; }
  const pos = favs.findIndex(f => f.id === currentTrack?.id);
  if (pos >= 0 && pos + 1 < favs.length) playFromFav(favs[pos + 1], true);
}
function seekToFrac(frac) {
  if (!YT_READY) return;
  const d = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(frac * d, true);
}
function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    if (!YT_READY) return;
    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    $("#cur").textContent = fmt(cur);
    $("#dur").textContent = fmt(dur);
    $("#seek").value = dur ? Math.floor((cur / dur) * 1000) : 0;
    $("#curFav").textContent = fmt(cur);
    $("#durFav").textContent = fmt(dur);
    $("#seekFav").value = $("#seek").value;
    refreshIndicators();
  }, 250);
}
function stopTimer() { clearInterval(timer); timer = null; }

/* ====== Indicadores (EQ) ====== */
function refreshIndicators() {
  const playing = YT_READY && (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";
  $$("#results .card").forEach(card => {
    card.classList.toggle("is-playing", playing && card.dataset.trackId === curId);
  });
  $$("#favList .fav-item").forEach(li => {
    li.classList.toggle("is-playing", playing && li.dataset.trackId === curId);
  });
}

/* ====== Visibilidad (truco recarga) ====== */
document.addEventListener("visibilitychange", () => {
  if (!YT_READY || !currentTrack) return;
  if (document.visibilityState === "hidden" && wasPlaying) {
    const t = ytPlayer.getCurrentTime() || 0;
    ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: t, suggestedQuality: "auto" });
    ytPlayer.playVideo();
  }
});

/* ====== UI ====== */
function setupSearchInput() {
  const searchInput = $("#searchInput");
  if (!searchInput) {
    console.error("setupSearchInput: #searchInput no encontrado");
    return;
  }

  // Evento para búsqueda con Enter
  searchInput.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      console.log("searchInput: Enter presionado", q);
      if (!q) {
        console.log("searchInput: Búsqueda vacía, ignorando");
        return;
      }
      clearTimeout(suggestionTimeout);
      $("#suggestion").textContent = "";
      $("#suggestion").classList.remove("visible");
      await searchYouTube(q);
    } else if (e.key === "ArrowDown" && $("#suggestion").classList.contains("visible")) {
      e.preventDefault();
      const suggestion = $("#suggestion").textContent;
      if (suggestion) {
        searchInput.value = suggestion;
        searchInput.setSelectionRange(suggestion.length, suggestion.length);
        clearTimeout(suggestionTimeout);
        $("#suggestion").textContent = "";
        $("#suggestion").classList.remove("visible");
        await searchYouTube(suggestion);
      }
    }
  });

  // Evento para sugerencias mientras se escribe
  searchInput.addEventListener("input", () => {
    clearTimeout(suggestionTimeout);
    const query = searchInput.value.trim();
    suggestionTimeout = setTimeout(() => fetchSuggestion(query), 300);
  });

  // Evento para seleccionar la sugerencia con clic
  const suggestionEl = $("#suggestion");
  if (suggestionEl) {
    suggestionEl.addEventListener("click", () => {
      const suggestion = suggestionEl.textContent;
      if (suggestion) {
        searchInput.value = suggestion;
        searchInput.setSelectionRange(suggestion.length, suggestion.length);
        clearTimeout(suggestionTimeout);
        suggestionEl.textContent = "";
        suggestionEl.classList.remove("visible");
        searchYouTube(suggestion);
      }
    });
  } else {
    console.error("setupSearchInput: #suggestion no encontrado");
  }
}

/* Carga infinita al hacer scroll */
function setupScroll() {
  const root = $("#results");
  if (!root) {
    console.error("setupScroll: #results no encontrado");
    return;
  }
  root.addEventListener("scroll", async () => {
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 50 && !isLoadingMore) {
      console.log("setupScroll: Disparando carga infinita");
      await searchYouTube(lastQuery, true);
    }
  });
}

/* Controles favoritos y búsqueda */
$("#fabFavorites").onclick = () => openFavs();
$("#fabBackToSearch").onclick = () => closeFavs();
$("#btnCloseFavs").onclick = () => closeFavs();

function openFavs() {
  const modal = $("#favoritesModal");
  if (modal) {
    modal.classList.add("show");
    document.body.classList.add("modal-open");
    renderFavs();
  } else {
    console.error("openFavs: #favoritesModal no encontrado");
  }
}
function closeFavs() {
  const modal = $("#favoritesModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
  } else {
    console.error("closeFavs: #favoritesModal no encontrado");
  }
}

$("#btnPlay").onclick = togglePlay;
$("#btnPrev").onclick = prev;
$("#btnNext").onclick = next;
$("#btnRepeat").onclick = () => {
  repeatOne = !repeatOne;
  $("#btnRepeat").classList.toggle("active", repeatOne);
  $("#btnRepeatFav").classList.toggle("active", repeatOne);
};
$("#seek").addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));

$("#btnPlayFav").onclick = togglePlay;
$("#btnPrevFav").onclick = prev;
$("#btnNextFav").onclick = next;
$("#btnRepeatFav").onclick = () => $("#btnRepeat").click();
$("#seekFav").addEventListener("input", e => { $("#seek").value = e.target.value; $("#seek").dispatchEvent(new Event("input")); });

/* ====== Init ====== */
console.log("Inicializando aplicación");
loadFavs();
renderFavs();
loadYTApi();
setupSearchInput();
setupScroll();
