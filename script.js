/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"")
  .replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "")
  .replace(/VEVO/gi, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*-\s*$/, "")
  .trim();
const dotsSvg = () => `
  <svg class="icon-dots" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
  </svg>`;

/* ========= Estado ========= */
let items = [];
let favs  = [];
let playlists = [];
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let viewingPlaylistId = null;

let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;

/* ========= Persistencia de Estado ========= */
const PLAYER_STATE_KEY = "sy_player_state_v2";
function savePlayerState() {
  if (!currentTrack) return;
  const state = {
    queue,
    queueType,
    qIdx,
    currentTime: ytPlayer?.getCurrentTime() || 0,
    isShuffle,
    repeatMode,
    timestamp: Date.now()
  };
  localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
}

function loadPlayerState() {
  const savedState = localStorage.getItem(PLAYER_STATE_KEY);
  if (!savedState) return null;

  try {
    const state = JSON.parse(savedState);
    // Considerar el estado como viejo si tiene más de 2 horas
    if (Date.now() - (state.timestamp || 0) > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(PLAYER_STATE_KEY);
      return null;
    }
    return state;
  } catch (e) {
    console.error("Error al cargar estado del reproductor:", e);
    return null;
  }
}

function restorePlayerState(state) {
  if (!state || !state.queue || state.qIdx < 0) return;

  queue = state.queue;
  queueType = state.queueType;
  qIdx = state.qIdx;
  currentTrack = queue[qIdx];
  isShuffle = state.isShuffle || false;
  repeatMode = state.repeatMode || 'none';

  if (YT_READY) {
    ytPlayer.loadVideoById({
      videoId: currentTrack.id,
      startSeconds: state.currentTime || 0,
      suggestedQuality: "auto"
    });
    ytPlayer.pauseVideo();
    updateUIOnTrackChange();
    startTimer();
    updateMiniNow();
  } else {
    // Si YT no está listo, intentarlo de nuevo cuando lo esté
    window.addEventListener('yt-ready', () => restorePlayerState(state), { once: true });
  }
}

/* ========= Tema (oscuro/clave por defecto) ========= */
const THEME_KEY = "sy_theme_v1";
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const tBtn = $("#themeToggle");
  if(tBtn){
    const isLight = theme === "light";
    tBtn.classList.toggle("is-light", isLight);
    tBtn.setAttribute("aria-label", isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta){
    const cssColor = getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim();
    meta.setAttribute("content", cssColor);
  }
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  $("#themeToggle")?.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}

/* ========= Curados estáticos (NO API) ========= */
const CURATED_RAW = [
  { "id": "bGmivknZTtM", "title": "RETRO MIX 80S & 90S EN ESPAÑOL #2", "author": "DJ GOBEA CANCUN,MX." },
  { "id": "ANo7dUx0nM4", "title": "POP DE LOS 80'S EN ESPAÑOL / EXITOS DEL RECUERDO VOL 1", "author": "coyomanidj" },
  { "id": "iRR3DQBI4wo", "title": "Pop en Español Megamix (1980 a 1984)", "author": "DJ Páez de México" },
  { "id": "TBTQcdhsfZU", "title": "Pop En Español De Los 80 Y 90 Mix", "author": "bavikon" },
  { "id": "wkavI9rIInk", "title": "Jenni Rivera - Joyas Prestadas Pop (Álbum Completo)", "author": "Jenni Rivera" },
  { "id": "f-WFYtcl3qE", "title": "ENGANCHADO CUMBIA SANTAFESINA, VOL. 4", "author": "Garra Records" },
  { "id": "5v7j-HMzW0Y", "title": "CUMBIA SANTAFESINA GRANDES EXITOS", "author": "Cumbia Santafesina" },
  { "id": "QhR3-XpTrp4", "title": "UN POCO DE RUIDO Enganchados de CUMBIA SANTAFESINA", "author": "Solo Enganchados" },
  { "id": "J_0LzitRCTg", "title": "ENGANCHADO CUMBIA SANTAFESINA 🎸 VOL. 1", "author": "DJ CHECA" },
  { "id": "O0aGMe8b3EU", "title": "Enganchados Cumbiones Santafesinos 7", "author": "Matias Crow" },
  { "id": "mxIAp4NdnH4", "title": "ROCK PARA EL ASADO - 5 Horas de Rock Argentino", "author": "Pelo Music Group" },
  { "id": "pUJW8NH_lX8", "title": "Lo Mejor del Rock Argentino (1º Parte)", "author": "HB Enganchados Musicales" },
  { "id": "U6SdrI6tzxY", "title": "ENGANCHADO ROCK NACIONAL 80 Y 90", "author": "DJMARGA2000" },
  { "id": "1ATkrsFDhpY", "title": "Rock Nacional Argentino", "author": "DJBazz" },
  { "id": "zeyUzQhl1HE", "title": "ROCK AND ROLL 50's, 60's EN ESPAÑOL", "author": "EMNA" },
  { "id": "PwmNExAF1zg", "title": "Soda Stereo - Soda Stereo (1984) (Álbum Completo)", "author": "Studio SC" },
  { "id": "jzLVaylmbJU", "title": "Soda Stereo - Canción Animal (1990) (Álbum Completo)", "author": "Studio SC" },
  { "id": "hb21DFZF7Pw", "title": "Soda Stereo - Sueño Stereo (1995) (Álbum Completo)", "author": "Studio SC" },
  { "id": "3TB0vkRalrQ", "title": "Soda Stereo - Doble Vida (1988) (Álbum Completo)", "author": "Studio SC" },
  { "id": "wEodOb2lSmo", "title": "Pericos & Friends - Los Pericos - Full Album Original", "author": "Music Brokers" },
  { "id": "pHJ0PVG_7z0", "title": "Los Pericos - Pura vida [FULL ALBUM, 2008]", "author": "PopArt Discos" },
  { "id": "S--kaiPI65Y", "title": "Los Pericos clasicos", "author": "Sanjo Music.2" },
  { "id": "_lufCQKPlC0", "title": "Los Fabulosos Cadillacs - Yo Te Avisé!! - Álbum Completo", "author": "El Skondite" },
  { "id": "RA1u-fYVZN0", "title": "Charly García-'Clics Modernos' 1983 Álbum Completo", "author": "Sebastián Cienfuegos" },
  { "id": "X3uLSS34pfQ", "title": "Charly Garcia-'La hija de la lágrima' 1994 Álbum completo", "author": "Sebastián Cienfuegos" },
  { "id": "AVmemTyiN2g", "title": "La Renga - Detonador De Sueños - Álbum Completo", "author": "La Renga" },
  { "id": "J7qwDEe8WS8", "title": "La Renga - Alejado de la Red (Álbum Completo)", "author": "La Renga" },
  { "id": "qxLGfwvHHl4", "title": "La Renga - Truenotierra - Álbum Completo - CD1", "author": "La Renga" },
  { "id": "A9pSfNeG5BI", "title": "La Renga - Pesados Vestigios - Álbum Completo", "author": "La Renga" },
  { "id": "G7eMBIQnpE0", "title": "La Renga - Algún Rayo - Álbum Completo", "author": "La Renga" },
  { "id": "yoPFiIAztEc", "title": "Greatest Hits Calle 13 álbum completo 2023", "author": "Best Popular Music" },
  { "id": "3TZX1b0RluU", "title": "Mix Calle 13 - Lo Mejor de Calle 13 #2", "author": "Juan Pariona" },
  { "id": "DXtmAumH3_4", "title": "Divididos. Se me llenó de hojas el bulín.", "author": "DIVIDIDOS" },
  { "id": "nc1nOmlACno", "title": "Enganchados de DIVIDIDOS (La Aplanadora del Rock)", "author": "Velo Marti" },
  { "id": "zbQoaFT-u6E", "title": "DIVIDIDOS - Audio y Agua - DVD Completo", "author": "Puro Rock" },
  { "id": "91H4zt0UeLg", "title": "Patricio Rey y sus Redonditos de Ricota - La Mosca y la Sopa (1991)", "author": "Patricio Rey y sus Redonditos de Ricota" },
  { "id": "zwDLbNTPvgA", "title": "Patricio Rey y sus Redonditos de Ricota - Gulp (1985)", "author": "Patricio Rey y sus Redonditos de Ricota" },
  { "id": "C1PDYt9b8AQ", "title": "Patricio Rey y sus Redonditos de Ricota - Un Baion Para el Ojo Idiota (1988)", "author": "Patricio Rey y sus Redonditos de Ricota" },
  { "id": "rQAm0OWeQZY", "title": "Patricio Rey y sus Redonditos de Ricota - Oktubre (1986)", "author": "Patricio Rey y sus Redonditos de Ricota" },
  { "id": "8czBUjD1L20", "title": "Patricio Rey y sus Redonditos de Ricota - ¡Bang! ¡Bang!... Estás Liquidado", "author": "Patricio Rey y sus Redonditos de Ricota" },
  { "id": "e7kuO5edHcg", "title": "SUMO - Llegando los Monos - Álbum Completo", "author": "Sumo" },
  { "id": "O8HEc1pGV8I", "title": "SUMO - Divididos por la Felicidad - Álbum Completo", "author": "Sumo" },
  { "id": "kRPjIK6YBOI", "title": "SUMO - After Chabon - Álbum completo", "author": "Sumo" },
  { "id": "BZJIZKpMzE0", "title": "SUMO ÉXITOS", "author": "Leandro Oscar Maciel" },
  { "id": "brwcqzmVRHw", "title": "Invisible - Invisible (1974) FULL ALBUM", "author": "Realidades Alternativas" },
  { "id": "oduoQVYTOfE", "title": "Luis Alberto Spinetta - MTV Unplugged - 1997", "author": "Spinettabootlegs" },
  { "id": "WnYhvVBDqm4", "title": "Luis Alberto Spinetta - Obras Cumbres (2006). Álbum Completo", "author": "Los Diaz de Juan" },
  { "id": "iA6JCPP1Ehs", "title": "Fito Páez - El amor después del amor (1992) (Álbum completo)", "author": "Capitán Fugitivo" },
  { "id": "3cJc-sxMTeE", "title": "Fito Páez - Euforia (1996) (Álbum Completo)", "author": "Capitán Fugitivo" },
  { "id": "hnIGIEYhOwY", "title": "Fito Paez - Grandes éxitos", "author": "Federico Peñaloza" },
  { "id": "dSgWyiKptVE", "title": "Fito Páez - Abre (1999) (Álbum completo)", "author": "Capitán Fugitivo" }
];
function extractVideoId(input){
  if(!input) return "";
  const s = String(input);
  const m = s.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?![0-9A-Za-z_-])/);
  return m ? m[1] : (s.length===11 ? s : "");
}
function mapCurated(raw){
  return raw
    .map((r,i)=>{
      const id = extractVideoId(r.id || r.url || r);
      if(!id) return null;
      return { id, title: r.title || `Mix ${i+1}`, author: r.author || "", thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    })
    .filter(Boolean);
}
let CURATED_VIDEOS = mapCurated(CURATED_RAW);
let HOME_QUEUE = [];

/* ========= API YouTube ========= */
const YOUTUBE_API_KEYS = [
  "AIzaSyCLKvqx3vv4SYBrci4ewe3TbeWJ-wL2BsY",
  "AIzaSyB9CSgnqFP5xBuYil8zUuZ0nWGQMHBk_44",
  "AIzaSyD_WZVpBaXosHIzpHoS0JJcQFlB03jc9DE",
  "AIzaSyCiryC1WiODR0hisMRDeej5FPsTjF3MTTM",
  "AIzaSyC3-V6pED9HDjEYpgtU9Tcw8YcZem9pVM0"
];
let currentApiKeyIndex = 0;
const getRotatedApiKey = () => {
  const k = YOUTUBE_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % YOUTUBE_API_KEYS.length;
  return k;
};

const BATCH_SIZE = 20;
let paging = { query:"", pageToken:"", loading:false, hasMore:true };
let searchAbort = null;

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id)?.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));

  if(id==="view-search") updateHomeGridVisibility();
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  switchView(btn.dataset.view);
});

/* ========= Búsqueda (overlay flotante) ========= */
const searchOverlay = $("#searchOverlay");
const overlayInput  = $("#overlaySearchInput");

function openSearch(){
  searchOverlay.classList.add("show");
  overlayInput.value = "";
  setTimeout(()=> overlayInput.focus(), 0);
}
function closeSearch(){ searchOverlay.classList.remove("show"); }

$("#searchFab").onclick = openSearch;
searchOverlay.addEventListener("click", e=>{ if(e.target===searchOverlay) closeSearch(); });
overlayInput.addEventListener("keydown", async e=>{
  if(e.key!=="Enter") return;
  const q = overlayInput.value.trim(); if(!q) return;
  closeSearch();
  await startSearch(q);
  switchView("view-search");
});

/* ========= Motor de búsqueda ========= */
async function youtubeSearch(query, pageToken = '', limit = BATCH_SIZE, retryCount = 0){
  const MAX_RETRIES = YOUTUBE_API_KEYS.length;
  if(retryCount >= MAX_RETRIES) throw new Error('Todas las API keys han fallado.');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  const apiKey = getRotatedApiKey();
  url.searchParams.append('key', apiKey);
  url.searchParams.append('q', query);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('type', 'video');
  url.searchParams.append('videoCategoryId', '10');
  url.searchParams.append('maxResults', limit);
  if(pageToken) url.searchParams.append('pageToken', pageToken);

  try{
    const response = await fetch(url);
    if(!response.ok){
      if(response.status===403){
        console.warn(`API key ${apiKey} 403 → rota`);
        return youtubeSearch(query, pageToken, limit, retryCount+1);
      }
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    const resultItems = data.items.map(item=>({
      id: item.id.videoId,
      title: cleanTitle(item.snippet.title),
      author: cleanAuthor(item.snippet.channelTitle),
      thumb: item.snippet.thumbnails.high.url
    }));
    return { items: resultItems, nextPageToken: data.nextPageToken, hasMore: !!data.nextPageToken };
  }catch(e){
    console.error('YouTube API search failed:', e);
    return { items: [], hasMore:false };
  }
}

/* ========= Buscar ========= */
async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  paging = { query, pageToken:"", loading:false, hasMore:true };
  items = [];
  $("#results").innerHTML = "";

  updateHomeGridVisibility();

  try{
    const result = await youtubeSearch(query, '', 20);
    if(searchAbort.signal.aborted) return;
    if(result.items.length===0){ return; }

    const deduped = dedupeById(result.items);
    appendResults(deduped);
    items = deduped;

    paging.pageToken = result.nextPageToken;
    paging.hasMore   = result.hasMore;
  }catch(e){
    console.error('Search failed:', e);
  }
}

function dedupeById(arr){
  const seen = new Set();
  return arr.filter(it=>{ if(!it?.id || seen.has(it.id)) return false; seen.add(it.id); return true; });
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore || !paging.query) return;
  paging.loading = true;
  try{
    const result = await youtubeSearch(paging.query, paging.pageToken, BATCH_SIZE);
    if(result.items.length===0){ paging.hasMore=false; paging.loading=false; return; }
    const newItems = dedupeById(result.items);
    appendResults(newItems);
    items = items.concat(newItems);
    paging.pageToken = result.nextPageToken;
    paging.hasMore   = result.hasMore;
    paging.loading   = false;
  }catch(e){
    paging.loading=false; paging.hasMore=false;
  }
}

/* ========= Render resultados ========= */
function appendResults(chunk){
  const root = $("#results");
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;
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
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;

    item.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    });
    item.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      const pos = items.findIndex(x=>x.id===it.id);
      if (currentTrack?.id === it.id) {
          togglePlay();
      } else {
          playFromSearch(pos >= 0 ? pos : 0, true);
      }
    };

    root.appendChild(item);
  }
  refreshIndicators();
}

/* ========= Grilla estática (Inicio) ========= */
function shuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function renderHomeGrid(){
  const grid = $("#homeGrid"); if(!grid) return;
  grid.innerHTML = "";
  const source = shuffle(CURATED_VIDEOS);
  HOME_QUEUE = source;
  source.forEach((it, i)=>{
    const card = document.createElement("article");
    card.className = "home-card";
    card.style.animationDelay = `${i * 50}ms`;
    card.innerHTML = `
      <img loading="lazy" decoding="async" src="${it.thumb}" alt="">
      <div class="home-meta">
        <p class="home-title-text">${it.title}</p>
        <p class="home-subtitle">${it.author||"Mix"}</p>
      </div>`;
    card.onclick = ()=>{
      setQueue(HOME_QUEUE, "curated", i);
      playCurrent(true);
    };
    grid.appendChild(card);
  });
}
function updateHomeGridVisibility(){
  const home = $("#homeSection");
  if(!home) return;
  const shouldShow = (!paging.query && items.length===0);
  home.classList.toggle("hide", !shouldShow);
}

/* ========= Favoritos ========= */
const LS_FAVS = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_FAVS)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_FAVS, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)) favs = favs.filter(f=>f.id!==track.id);
  else favs.unshift(track);
  saveFavs(); renderFavs(); refreshIndicators();
}

function renderFavs(){
  const ul = $("#favList"); ul.innerHTML="";
  favs.forEach(it=>{
    const li = document.createElement("li");
    li.className = "fav-item"; li.dataset.trackId = it.id;
    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      playFromFav(it, true);
    });
    li.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{ playFromFav(it, true); }
      refreshIndicators();
    };
    ul.appendChild(li);
  });
  updateHero(currentTrack);
  refreshIndicators();
}

/* ========= Playlists ========= */
const LS_PL = "sanayera_playlists_v1";
function loadPlaylists(){ try{ playlists = JSON.parse(localStorage.getItem(LS_PL)||"[]"); }catch{ playlists=[]; } }
function savePlaylists(){ localStorage.setItem(LS_PL, JSON.stringify(playlists)); }

function renderPlaylists(){
  const list = $("#plList"), empty = $("#plEmpty"); list.innerHTML="";
  if(!playlists.length){ empty.classList.remove("hide"); return; }
  empty.classList.add("hide");
  playlists.forEach(pl=>{
    const li = document.createElement("li"); li.className="pl-item"; li.dataset.plId = pl.id;
    const cover = pl.tracks[0]?.thumb || "https://picsum.photos/seed/pl/200";
    li.innerHTML = `
      <div class="pl-meta">
        <img class="pl-thumb" src="${cover}" alt="">
        <div>
          <div class="title-text">${pl.name}</div>
          <div class="subtitle">${pl.tracks.length} temas</div>
        </div>
      </div>
      <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;
    li.addEventListener("click", (e)=>{
      if(e.target.closest(".more")) return;
      showPlaylistInPlayer(pl.id);
      switchView("view-player");
    });
    li.classList.toggle("is-playing", viewingPlaylistId === pl.id);
    list.appendChild(li);
  });
}
$("#btnNewPlaylist").onclick = ()=>{
  const name = prompt("Nombre de la playlist:")?.trim();
  if(!name) return;
  const id = "pl_"+Date.now().toString(36);
  playlists.unshift({id, name, tracks:[]});
  savePlaylists(); renderPlaylists();
};

/* ========= Acción sheet ========= */
function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet");
  sheet.innerHTML = `
    <div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`
        <button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">
          ${a.label}
        </button>`).join("")}
    </div>`;
  sheet.classList.add("show");
  sheet.onclick = (e)=>{
    if(e.target===sheet){ sheet.classList.remove("show"); return; }
    const btn = e.target.closest(".sheet-item"); if(!btn) return;
    const id = btn.dataset.id;
    sheet.classList.remove("show");
    if(id) onAction(id);
  };
}

function openPlaylistSheet(track){
  const sheet = $("#playlistSheet"); sheet.classList.add("show");
  const list = $("#plChoices"); list.innerHTML="";
  playlists.forEach(pl=>{
    const btn = document.createElement("button");
    btn.className="sheet-item";
    btn.textContent = pl.name;
    btn.onclick = ()=>{
      if(!pl.tracks.some(t=>t.id===track.id)) pl.tracks.unshift(track);
      savePlaylists(); sheet.classList.remove("show"); renderPlaylists();
    };
    list.appendChild(btn);
  });
  $("#plCreate").onclick = ()=>{
    const name = $("#plNewName").value.trim(); if(!name) return;
    const id = "pl_"+Date.now().toString(36);
    const pl = {id, name, tracks:[track]};
    playlists.unshift(pl); savePlaylists(); renderPlaylists();
    $("#plNewName").value=""; sheet.classList.remove("show");
  };
  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

/* ========= YouTube player / reproducción ========= */
function updateUIOnTrackChange() {
    updateHero(currentTrack);
    updateMiniNow();
    refreshIndicators();
    updateControlStates();
}

function updateHero(track){
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  const plName = viewingPlaylistId ? (playlists.find(p=>p.id===viewingPlaylistId)?.name || "") : "";
  $("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName?` • ${plName}`:""}` : (plName || "—");
}
function setQueue(srcArr, type, idx){
    let finalSrc = srcArr;
    if (isShuffle && type !== 'curated') {
        finalSrc = shuffle(srcArr.slice());
        const currentItem = srcArr[idx];
        const newIdx = finalSrc.findIndex(item => item.id === currentItem.id);
        if (newIdx > -1) {
             // Mover el item actual al principio para que suene primero
            finalSrc.splice(newIdx, 1);
            finalSrc.unshift(currentItem);
            idx = 0;
        }
    }
    queue = finalSrc;
    queueType = type;
    qIdx = idx;
}
function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateUIOnTrackChange();
}
function playFromSearch(i, autoplay=false){ setQueue(items, "search", i); playCurrent(autoplay); }
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); playCurrent(autoplay);
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  setQueue(pl.tracks, "playlist", i); viewingPlaylistId = plId; playCurrent(autoplay);
}
function playPlaylist(id){
  const pl = playlists.find(p=>p.id===id); if(!pl||!pl.tracks.length) return;
  viewingPlaylistId = id;
  playFromPlaylist(pl.id, 0, true);
  renderPlaylists();
}
function togglePlay(){
  if(!YT_READY || !currentTrack) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
$("#npPlay").onclick = togglePlay;
$("#miniPlay").onclick = togglePlay;

/* Eliminar tema de playlist */
function removeFromPlaylist(plId, trackId){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  const idx = pl.tracks.findIndex(t=>t.id===trackId); if(idx<0) return;
  const removingIsCurrent = (queueType==="playlist" && viewingPlaylistId===plId && queue && queue[qIdx]?.id===trackId);

  pl.tracks.splice(idx,1);
  savePlaylists();

  if(queueType==="playlist" && viewingPlaylistId===plId){
    queue = pl.tracks;
    if(idx < qIdx) qIdx--;
    if(removingIsCurrent){
      if(qIdx >= queue.length) qIdx = queue.length-1;
      if(qIdx >= 0) playCurrent(true); else { currentTrack=null; updateHero(null); }
    }
  }
  renderPlaylists();
  showPlaylistInPlayer(plId);
}

/* Mini reproductor */
function updateMiniNow(){
  const has = !!currentTrack;
  const dock = $("#seekDock");
  dock.classList.toggle("show", has);
  if(!has) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  $("#miniAuthor").textContent = cleanAuthor(currentTrack.author) || "";
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  $("#miniPlay").classList.toggle("playing", playing);
}

function getNextIndex() {
    if (!queue) return -1;
    if (repeatMode === 'one') return qIdx;
    
    // Si es shuffle, busca un índice aleatorio que no sea el actual
    if (isShuffle) {
        if (queue.length <= 1) return 0;
        let nextIdx;
        do {
            nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === qIdx);
        return nextIdx;
    }

    // Normal
    let next = qIdx + 1;
    if (next >= queue.length) {
        return (repeatMode === 'all') ? 0 : -1;
    }
    return next;
}

function next(){
    const nextIdx = getNextIndex();
    if (nextIdx !== -1) {
        qIdx = nextIdx;
        playCurrent(true);
    } else {
        // Fin de la cola
        ytPlayer.stopVideo();
        currentTrack = null;
        updateUIOnTrackChange();
    }
}

function prev(){
    if (!queue) return;
    if (isShuffle) { // En shuffle, 'prev' también es aleatorio
        next();
        return;
    }
    if (ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0, true);
    } else if (qIdx - 1 >= 0) {
        qIdx--;
        playCurrent(true);
    }
}
$("#btnNext").onclick = next;
$("#btnPrev").onclick = prev;

function seekToFrac(frac){ if(!YT_READY) return; const d = ytPlayer.getDuration()||0; ytPlayer.seekTo(frac*d,true); }
$("#seek").addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY) return;
    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur").textContent = fmt(cur); $("#dur").textContent = fmt(dur);
    $("#seek").value = dur? Math.floor((cur/dur)*1000) : 0;
    const playing = ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING;
    $("#npPlay").classList.toggle("playing", playing);
    $("#miniPlay").classList.toggle("playing", playing);
    refreshIndicators();

    // Guardar estado periódicamente
    if (playing) {
      savePlayerState();
    }
  }, 500);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ========= Controles Adicionales (Shuffle, Repeat, Volume) ========= */
function toggleShuffle() {
    isShuffle = !isShuffle;
    $("#btnShuffle").classList.toggle('active', isShuffle);
    // Re-crear la cola si se activa shuffle, manteniendo la canción actual
    if (currentTrack) {
        const currentQueueSource = (queueType === 'search') ? items : (queueType === 'favs') ? favs :
                                   (queueType === 'playlist') ? playlists.find(p=>p.id===viewingPlaylistId)?.tracks || [] : HOME_QUEUE;
        setQueue(currentQueueSource, queueType, currentQueueSource.findIndex(t => t.id === currentTrack.id));
    }
}

function cycleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentModeIdx = modes.indexOf(repeatMode);
    repeatMode = modes[(currentModeIdx + 1) % modes.length];
    
    const btn = $("#btnRepeat");
    btn.classList.toggle('active', repeatMode !== 'none');
    
    if (repeatMode === 'one') {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>`; // Repeat One icon
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`; // Repeat icon
    }
}
function updateControlStates() {
    $("#btnShuffle").classList.toggle('active', isShuffle);
    $("#btnRepeat").classList.toggle('active', repeatMode !== 'none');
}

$("#btnShuffle").onclick = toggleShuffle;
$("#btnRepeat").onclick = cycleRepeat;
$("#volumeSeek").addEventListener("input", e => {
    if(YT_READY) ytPlayer.setVolume(e.target.value);
});


/* ========= Cola (Player) ========= */
function showPlaylistInPlayer(plId){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;

  const panel = $("#queuePanel"); panel.classList.remove("hide");
  $("#queueTitle").textContent = pl.name;

  const ul = $("#queueList"); ul.innerHTML="";
  pl.tracks.forEach((t,i)=>{
    const li = document.createElement("li"); li.className="queue-item"; li.dataset.trackId=t.id;
    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <button class="card-play" title="Play" aria-label="Play">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${t.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(t.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    li.onclick = (e)=>{ if(e.target.closest(".more") || e.target.closest(".card-play")) return; playFromPlaylist(pl.id, i, true); };
    li.querySelector(".card-play").onclick = (e)=>{ e.stopPropagation(); playFromPlaylist(pl.id, i, true); };
    ul.appendChild(li);
  });
  refreshIndicators();
}
function hideQueuePanel(){ $("#queuePanel").classList.add("hide"); $("#queueList").innerHTML=""; viewingPlaylistId=null; renderPlaylists(); }

/* ========= Delegación global de los 3 puntitos ========= */
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".icon-btn.more");
  if(!btn) return;

  const resultItem = btn.closest(".result-item");
  const favItem    = btn.closest(".fav-item");
  const queueItem  = btn.closest(".queue-item");
  const plItem     = btn.closest(".pl-item");

  if(resultItem){
    const id = resultItem.dataset.trackId;
    const it = items.find(x=>x.id===id);
    if(!it) return;
    openActionSheet({
      title: it.title,
      actions: [
        { id:"fav", label: isFav(id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
        { id:"pl",  label:"Agregar a playlist" },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="fav") toggleFav(it);
        if(act==="pl")  openPlaylistSheet(it);
      }
    });
    return;
  }

  if(favItem){
    const id = favItem.dataset.trackId;
    const it = favs.find(x=>x.id===id);
    if(!it) return;
    openActionSheet({
      title: it.title,
      actions: [
        { id:"removeFav", label:"Quitar de Favoritos", danger:true },
        { id:"pl", label:"Agregar a playlist" },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="removeFav") toggleFav(it);
        if(act==="pl") openPlaylistSheet(it);
      }
    });
    return;
  }

  if(queueItem && viewingPlaylistId){
    const trackId = queueItem.dataset.trackId;
    const it = playlists.find(p=>p.id===viewingPlaylistId)?.tracks.find(t=>t.id===trackId);
    if(!it) return;
    openActionSheet({
      title: it.title,
      actions: [
        { id:"removeFromPl", label:"Eliminar de esta playlist", danger:true },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="removeFromPl") removeFromPlaylist(viewingPlaylistId, trackId);
      }
    });
    return;
  }

  if(plItem){
    const plId = plItem.dataset.plId;
    const P = playlists.find(p=>p.id===plId);
    if(!P) return;
    openActionSheet({
      title: P.name,
      actions:[
        { id:"open",   label:"Abrir" },
        { id:"play",   label:"Reproducir" },
        { id:"rename", label:"Renombrar" },
        { id:"delete", label:"Eliminar", danger:true },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction:(id)=>{
        if(id==="open"){ showPlaylistInPlayer(P.id); switchView("view-player"); }
        if(id==="play"){ playPlaylist(P.id); switchView("view-player"); }
        if(id==="rename"){
          const name = prompt("Nuevo nombre:", P.name)?.trim();
          if(name){ P.name=name; savePlaylists(); renderPlaylists(); }
        }
        if(id==="delete"){
          if(confirm(`Eliminar playlist "${P.name}"?`)){
            playlists = playlists.filter(x=>x.id!==P.id); savePlaylists(); renderPlaylists();
            if(viewingPlaylistId===P.id){ hideQueuePanel(); }
          }
        }
      }
    });
  }
});

/* ========= Indicadores ========= */
function refreshIndicators(){
  const isPlaying = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
      const isCurrentTrack = el.dataset.trackId === curId;
      el.classList.toggle("is-playing", isPlaying && isCurrentTrack);
      
      const cardPlay = el.querySelector(".card-play");
      if (cardPlay) {
          cardPlay.classList.toggle("playing", isPlaying && isCurrentTrack);
      }
  });
}

/* ========= YouTube API ========= */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300, height:150, videoId:"",
    playerVars:{autoplay:0, controls:0, rel:0, playsinline:1},
    events:{
      onReady:()=>{
        YT_READY=true;
        window.dispatchEvent(new Event('yt-ready'));
      },
      onStateChange:(e)=>{
        const st=e.data;
        if(st===YT.PlayerState.ENDED){ next(); }
        updateMiniNow();
        refreshIndicators();
      }
    }
  });
};

/* ========= Infinite scroll ========= */
const io = new IntersectionObserver((entries)=>{
  for(const en of entries){ if(en.isIntersecting){ loadNextPage(); } }
},{ root:null, rootMargin:"800px 0px", threshold:0 });
io.observe($("#sentinel"));


/* ========= Init ========= */
function boot(){
  initTheme();
  CURATED_VIDEOS = mapCurated(CURATED_RAW);
  renderHomeGrid();
  updateHomeGridVisibility();

  loadFavs();
  loadPlaylists();
  renderFavs();
  renderPlaylists();

  const savedState = loadPlayerState();
  if (savedState) {
    // Retrasar la restauración para asegurar que la UI esté lista
    setTimeout(() => restorePlayerState(savedState), 100);
  }

  loadYTApi();
  document.title = "SanaveraYou";
}

// Iniciar la app
boot();

// Guardar estado al cerrar la página
window.addEventListener('beforeunload', savePlayerState);
