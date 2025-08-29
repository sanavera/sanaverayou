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
let communityPlaylists = []; // Playlists de la comunidad (Firebase)
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let viewingPlaylistId = null;

let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;
let db; // Instancia de Firestore

// --- Listas de reproducción recomendadas ---
const recommendedPlaylists = {
  p1: {
    ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZ1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3Vdo5etCQ', '6NXnxTNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3Vdo5etCQ'],
    title: 'Melódicos en Inglés',
    creator: 'Luis Sanavera',
    data: []
  },
  p2: {
    ids: ['0qSif7B09N8', 'Ngi3rVx6kho', 'HhsXDJ1KeAI', 'MjgYsL3e3Mw', 'rsjGKU-qg3c', 'G6DbIQzCVBk', 'mdQW8ZLHpCU', 'MX-vrDW-A7I', 'uxZC1W6DHmI', 'WTlEED0_QcQ', 'ALA8ZDLQF9U', 'x1tWQNxJpY4', 'h2gj7Aap3iY', 'biXIrPcupuE', 'Vw5j10cBU78', 'Z5jQKzbOejY', 'ypg7ikDRhfg', '1gtJWFSWuYc', 'IhWGr-hTfHU', 'ZAKWI3mi14A', 'gy2hK11AKGE', 'fuYq32iJdIw', 'DzhxJkF7c9s', 'QqS4kWie8SA', 'sw6v-Q-2Is4', 'yXXheK7wYqo', 'xd-IwfDs7c4', 'HcWlkUKwjlc', 'pPoUVEcT0aU', 'N7m-0KXjKR0', 'OX2fVkdQYKg', 'AIIcEeQaWI0', 'WI0da9h-gcE', 'uxZC1W6DHmI', 'w09HG8_FAHQ', '_IqyVs9ObFA', 'auNa0nRPg3o', '46T65kU9Pw0', 'lsDSVZ10sY4', '4nztFNNeay0'],
    title: 'Cumbia estilo Santafesino',
    creator: 'Luis Sanavera',
    data: []
  },
  cumbia: {
ids: [
'UHWCB7D8XoI', // Nacarita - Los Diferentes (Cover)
'OXunU0CJXtc', // Cuando era jovencito - Grupo Nobel
'D-TrNF5V2jo', // Amor desesperado - Los Tiranos
'Wcb_gUU5LVA', // El Gran Varon - Grupo Bor
'bhyjF3t5XJQ', // Ojitos Hechiceros - Grupo Imagen
'HHOsoZcJ-TY', // Dario y su grupo Angora - Secretaria
'eVHIQ4oxjwM', // Dario y su grupo Angora - el rosario de mi madre
'9jbiAeXZKbw', // Amar Azul - Niña
'dcy_B7oSIf8', // Amar Azul - Tormenta de Nieve
'UPnTZCTXHvw', // Grupo Red - No podre olvidarme de ti
'v2FjIJUQPhU', // Grupo Red - Amor de adolescentes
'fgTLwYJpbgQ', // Grupo Green - Solitario
'vHyZrsEuE2o', // Grupo Green - Solo estoy
'OU2KT7wlAGw', // Tambo Tambo - La Cumbita
'aRLPHz0zsUo', // Tambo Tambo - El Campanero
'SE3oVXcppVc', // Los Charros - que nos entierren juntos
'P6W-c8y4j5w', // Los Charros - Me bebi tu recuerdo
'yBco-h1QPPA', // Los Lamas - Siempre soñando contigo
'umLyS0-GXLQ', // Los Lamas - que hermosa noche
'01p-1kMosCI', // Los del Bohio - del vals una más
'h8emXFUHH0Y', // Los del Bohio - MR robinson
'098YVg5RmkA', // Gilda - No me arrepiento de este amor
'7M6WsIKMtKg', // La Nueva Luna - Y ahora te vas
'2aO4gdfkSc8', // Sombras - La ventanita
'tJCK6y3gPfU', // Ráfaga - Mentirosa
'1rwXkK3vWpg', // Los Palmeras - El Bombón Asesino
'rXuhQxo_Ebc', // Leo Mattioli - Llorarás más de diez veces
'gfPmhcIIi90', // Rodrigo - Lo mejor del amor
'biIRifuGPa4', // Antonio Rios - Nunca me faltes
'ym3vG_UgLEA', // Damas Gratis - Se te ve la tanga
'sgIUGLFZ2sE', // Pibes Chorros - Duraznito
'3bkfEGlZNqQ', // Yerba Brava - La Cumbia de los Trapos
'Gzo5UY3D7lE', // Los cadiz - Si un amor se va
'CdGxWUu2lwU', // Los Chakales - Vete de mi lado
'NrbmqV7ah_c', // Malagata - Noche de luna
'PfnSKD5hgYk', // Siete Lunas - Prende el fuego
'NqxCPeG0R7Q', // Los Dinos - Ingrata
'gOt1JFkEauU', // Grupo Trinidad - Ya no es una nenita
'vhSIFloIMxI', // Los del Fuego - Jurabas tu
'dWOEGMhOm9k', // Commanche - Tonta
'UGFBEUBEpss', // Volcan - Esa malvada
'2wGDGtm8dwY', // Gladys La Bomba Tucumana - La pollera amarilla
'IfMujYwHOOE', // Karicia - Quinceañera
'9X35iRX27B8', // Los Avilas - te amo en silencio
'PsLVh10nF2w', // Los Mirlos - La danza de los mirlos
'SYQ6svFb8_0', // Los mirlos - por dinero por amor
'9UQSYNvA6NE', // Siete lunas - Loco corazón
'z-MrnGLyj28', // Grupo Lagrimas - Tu perfume
'xH_7932NfYU', // Grupo imagen - Pio pio
'PTqvL19p87c'  // Amar azul - cuentame
],
title: 'Cumbias del Recuerdo',
creator: 'Luis Sanavera',
data: []
},
    
  reggaeton: {
    ids: ['kJQP7kiw5Fk', 'TmKh7lAwnBI', 'tbneQDc2H3I', 'wnJ6LuUFpMo', '_I_D_8Z4sJE', 'DiItGE3eAyQ', 'VqEbCxg2bNI', '9jI-z9QN6g8', 'Cr8K88UcO0s', 'QaXhVryxVBk', 'ca48oMV59LU', '0VR3dfZf9Yg'],
    title: 'Noche de Reggaetón',
    creator: 'Sebastián Sanavera',
    data: []
  },
  reggae: {
    ids: ['HNBCVM4KbUM', 'IT8XvzIfi4U', '69RdQFDuYPI', 'vdB-8eLEW8g', 'yv5xonFSC4c', 'oqVy6eRXc7Q', 'zXt56MB-3vc', 'f7OXGANW9Ic', 'MrHxhQPOO2c', '1ti2YCFgCoI', '_GZlJGERbvE', 'LfeIfiiBTfY'],
    title: 'Vibras de Reggae',
    creator: 'Sebastián Sanavera',
    data: []
  },
  pop: {
    ids: ['JGwWNGJdvx8', 'YQHsXMglC9A', '09R8_2nJtjg', 'OPf0YbXqDm0', 'nfWlot6h_JM', 'fHI8X4OXluQ', 'TUVcZfQe-Kw', 'DyDfgMOUjCI', 'CevxZvSJLk8', 'fRh_vgS2dFE', 'YykjpeuMNEk', '2vjPBrBU-TM'],
    title: 'Éxitos Pop',
    creator: 'Sebastián Sanavera',
    data: []
  },
  rock_int: {
    ids: ['1w7OgIMMRc4', 'rY0WxgSXdEE', 'fJ9rUzIMcZQ', 'eVTXPUF4Oz4', 'hTWKbfoikg', 'v2AC41dglnM', 'btPJPFnesV4', 'tAGnKpE4NCI', 'YlUKcNNmywk', '6Ejga4kJUts', 'lDK9QqIzhwk', 'kXYiU_JCYtU'],
    title: 'Himnos del Rock',
    creator: 'Sebastián Sanavera',
    data: []
  },
  bachata: {
    ids: ['QFs3PIZb3js', 'bdOXnTbyk0g', 'yC9u00F-NF0', '8iPcqtHoR3U', '0XCot42qTvA', 'z2pt4CN4rhc', 'XNGWDH-6yv8', 'foyH-TEs9D0', 'JNkTNAknE4I', 'h_fXySfFmM8', 'elGZbcpGzdU', '8Ei86cJIWlk'],
    title: 'Corazón de Bachata',
    creator: 'Sebastián Sanavera',
    data: []
  },
  international: {
    ids: ['djV11Xbc914', 'Zi_XLOBDo_Y', '3JWTaaS7LdU', 'n4RjJKxsamQ', 'vx2u5uUu3DE', 'PIb6AZdTr-A', '9jK-NcRmVcw', 'dQw4w9WgXcQ', 'FTQbiNvZqaY', 'rY0WxgSXdEE', 'YkADj0TPrJA', '0-EF60neguk'],
    title: 'Clásicos 70/80/90s',
    creator: 'Sebastián Sanavera',
    data: []
  }
};

/* ========= Persistencia de Estado ========= */
const PLAYER_STATE_KEY = "sy_player_state_v2";
function getPlaybackState(){
  if(!YT_READY || !ytPlayer) return "none";
  const st = ytPlayer.getPlayerState();
  return (st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING) ? "playing"
       : (st===YT.PlayerState.PAUSED) ? "paused"
       : "none";
}
function savePlayerState() {
  if (!currentTrack || !ytPlayer) return;
  const state = {
    queue,
    queueType,
    qIdx,
    currentTime: ytPlayer.getCurrentTime() || 0,
    isShuffle,
    repeatMode,
    wasPlaying: getPlaybackState()==="playing",
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Error al guardar estado del reproductor:", e);
  }
}
function loadPlayerState() {
  const savedState = localStorage.getItem(PLAYER_STATE_KEY);
  if (!savedState) return null;
  try {
    const state = JSON.parse(savedState);
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
  const restore = () => {
    queue = state.queue;
    queueType = state.queueType;
    qIdx = state.qIdx;
    currentTrack = queue[qIdx];
    isShuffle = !!state.isShuffle;
    repeatMode = state.repeatMode || 'none';

    ytPlayer.loadVideoById({
      videoId: currentTrack.id,
      startSeconds: state.currentTime || 0,
      suggestedQuality: "auto"
    });
    ytPlayer.setVolume(100);

    if (state.wasPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();

    updateUIOnTrackChange();
    startTimer();
  };
  if (YT_READY) restore();
  else window.addEventListener('yt-ready', restore, { once: true });
}

/* ========= Tema ========= */
const THEME_KEY = "sy_theme_v1";
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const tBtn = $("#themeToggle");
  if(tBtn){
    const isLight = theme === "light";
    tBtn.classList.toggle("is-light", isLight);
    tBtn.setAttribute("aria-label", isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
    tBtn.title = tBtn.getAttribute("aria-label");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta){
    const cssColor = getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim();
    meta.setAttribute("content", cssColor || (theme==="light" ? "#ffffff" : "#0b0a11"));
  }
  document.documentElement.style.colorScheme = (theme==="light"?"light":"dark");
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  $("#themeToggle")?.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}

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

async function fetchVideoDetailsByIds(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    const CHUNK_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        chunks.push(uniqueIds.slice(i, i + CHUNK_SIZE));
    }

    const fetchChunk = async (chunk, retryCount = 0) => {
        const MAX_RETRIES = YOUTUBE_API_KEYS.length;
        if (retryCount >= MAX_RETRIES) {
            console.error(`Todas las API keys han fallado para el chunk: ${chunk.join(',')}`);
            return [];
        }

        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        const apiKey = getRotatedApiKey();
        url.searchParams.append('key', apiKey);
        url.searchParams.append('part', 'snippet');
        url.searchParams.append('id', chunk.join(','));

        try {
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 403) {
                    console.warn(`API key ${apiKey} 403 → rotando`);
                    return fetchChunk(chunk, retryCount + 1);
                }
                throw new Error(`API error: ${response.status}`);
            }
            const data = await response.json();
            return data.items.map(item => ({
                id: item.id,
                title: cleanTitle(item.snippet.title),
                author: cleanAuthor(item.snippet.channelTitle),
                thumb: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || ""
            }));
        } catch (e) {
            console.error('YouTube API fetch chunk failed:', e);
            return fetchChunk(chunk, retryCount + 1);
        }
    };
    
    const results = await Promise.all(chunks.map(chunk => fetchChunk(chunk)));
    return results.flat();
}


const BATCH_SIZE = 20;
let paging = { query:"", pageToken:"", loading:false, hasMore:true };
let searchAbort = null;

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view = $("#"+id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id==="view-search") updateHomeGridVisibility();
  heroScrollInvalidate();
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  if (btn.classList.contains('active')) return;
  switchView(btn.dataset.view);
});

/* ========= Búsqueda (overlay) ========= */
const searchOverlay = $("#searchOverlay");
const overlayInput  = $("#overlaySearchInput");
function openSearch(){ searchOverlay.classList.add("show"); overlayInput.value=""; setTimeout(()=> overlayInput.focus(), 0); }
function closeSearch(){ searchOverlay.classList.remove("show"); }
$("#searchFab")?.addEventListener("click", openSearch);
searchOverlay?.addEventListener("click", e=>{ if(e.target===searchOverlay) closeSearch(); });
overlayInput?.addEventListener("keydown", async e=>{
  if(e.key!=="Enter") return;
  const q = overlayInput.value.trim(); if(!q) return;
  closeSearch();
  document.body.scrollTop = 0; 
  document.documentElement.scrollTop = 0;
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
      thumb: item.snippet.thumbnails?.high?.url || ""
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
  $("#results") && ($("#results").innerHTML = "");
  updateHomeGridVisibility();
  try{
    const result = await youtubeSearch(query, '', 20);
    if(searchAbort.signal.aborted) return;
    if(result.items.length===0) return;
    const deduped = dedupeById(result.items);
    appendResults(deduped);
    items = deduped;
    paging.pageToken = result.nextPageToken;
    paging.hasMore   = result.hasMore;
  }catch(e){ console.error('Search failed:', e); }
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
  }catch(e){ paging.loading=false; paging.hasMore=false; }
}

/* ========= Render resultados ========= */
function appendResults(chunk){
  const root = $("#results"); if(!root) return;
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
      if (currentTrack?.id === it.id) { togglePlay(); }
      else { playFromSearch(pos >= 0 ? pos : 0, true); }
    };
    root.appendChild(item);
  }
  refreshIndicators();
}

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;

    const tracks = playlist.isRecommended ? playlist.data : playlist.tracks;
    if (!tracks || tracks.length === 0) return;

    // Usar las últimas 4 canciones agregadas
    const covers = tracks.slice(0, 4).map(track => track.thumb);
    while (covers.length < 4) {
        covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    }

    let logoSvg;
    if (playlist.isRecommended) {
        const isLuis = playlist.creator === 'Luis Sanavera';
        logoSvg = isLuis 
            ? `<svg class="spotify-logo" viewBox="0 0 167.5 167.5" fill="currentColor" height="1em" width="1em"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"></path></svg>`
            : `<svg class="youtube-logo" viewBox="0 0 28 20" fill="currentColor" height="1em" width="1em"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"></path></svg>`;
    } else {
        logoSvg = `
            <svg class="spotify-logo" viewBox="0 0 167.5 167.5" fill="currentColor" height="1em" width="1em"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"></path></svg>
            <svg class="youtube-logo" viewBox="0 0 28 20" fill="currentColor" height="1em" width="1em"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"></path></svg>
        `;
    }

    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id || playlist.title;

    card.innerHTML = `
        <div class="collage-container">
            ${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}
        </div>
        <div class="playlist-meta">
            <h4 class="playlist-title">${playlist.title || playlist.name}</h4>
            <div class="creator-line">
                ${logoSvg}
                <span>Creador: ${playlist.creator}</span>
            </div>
        </div>
    `;

    card.onclick = () => {
        const queueTracks = playlist.isRecommended ? playlist.data : playlist.tracks;
        const queueId = playlist.isRecommended ? null : playlist.id;
        const queueTitle = playlist.isRecommended ? playlist.title : playlist.name;
        
        setQueue(queueTracks, playlist.isRecommended ? 'recommended' : 'playlist', 0);
        viewingPlaylistId = queueId;
        renderQueue(queueTracks, queueTitle);
        switchView('view-player');
        playCurrent(true);
    };
    
    container.appendChild(card);
}


function updateHomeGridVisibility(){
  const home = $("#homeSection"); if(!home) return;
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
  const ul = $("#favList"); if(!ul) return;
  ul.innerHTML="";
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
    };
    ul.appendChild(li);
  });
  updateHero(currentTrack);
  refreshIndicators();
}

/* ========= Playlists (Ahora con Firebase) ========= */
const LS_USER_PLAYLIST_IDS = "sy_user_playlist_ids_v1";

function getMyPlaylistIds() {
    try {
        return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]");
    } catch {
        return [];
    }
}

function addMyPlaylistId(id) {
    const ids = getMyPlaylistIds();
    if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids));
    }
}

function removeMyPlaylistId(id) {
    let ids = getMyPlaylistIds();
    ids = ids.filter(pid => pid !== id);
    localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids));
}

function isMyPlaylist(id) {
    return getMyPlaylistIds().includes(id);
}

function renderPlaylists() {
    const grid = $("#plList"), empty = $("#plEmpty");
    if (!grid) return;
    grid.innerHTML = "";
    
    const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id));

    if (myPlaylists.length === 0) {
        empty?.classList.remove("hide");
        return;
    }
    empty?.classList.add("hide");

    myPlaylists.forEach(pl => {
        const card = document.createElement("article");
        card.className="pl-item";
        card.dataset.plId = pl.id;
        const cover = pl.tracks[0]?.thumb || "https://i.imgur.com/gCa3j5g.png";
        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-subtitle">${pl.tracks.length} temas</div>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;
        
        card.addEventListener("click", (e) => {
            if (e.target.closest(".more")) return;
            showPlaylistInPlayer(pl.id);
            switchView("view-player");
        });
        
        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

$("#btnNewPlaylist")?.addEventListener("click", () => {
    $("#createPlaylistSheet").classList.add("show");
});

$("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
$("#createPlaylistSheet").addEventListener("click", e => {
    if (e.target.id === 'createPlaylistSheet') $("#createPlaylistSheet").classList.remove("show");
});

$("#createPlConfirm").onclick = async () => {
    const name = $("#newPlName").value.trim();
    const creator = $("#newPlCreator").value.trim();
    if (!name || !creator) {
        alert("Por favor, completa ambos campos.");
        return;
    }
    
    try {
        const { getFirestore, collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), {
            name,
            creator,
            tracks: [],
            updatedAt: serverTimestamp()
        });
        addMyPlaylistId(docRef.id);
        $("#newPlName").value = "";
        $("#newPlCreator").value = "";
        $("#createPlaylistSheet").classList.remove("show");
    } catch (e) {
        console.error("Error creando playlist: ", e);
        alert("Hubo un error al crear la playlist.");
    }
};


/* ========= Sheets ========= */
function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet"); if(!sheet) return;
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
async function openPlaylistSheet(track){
  const sheet = $("#playlistSheet"); if(!sheet) return;
  sheet.classList.add("show");
  const list = $("#plChoices"); list.innerHTML="";
  
  const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id));

  myPlaylists.forEach(pl=>{
    const btn = document.createElement("button");
    btn.className="sheet-item";
    btn.textContent = pl.name;
    btn.onclick = async ()=>{
      const { doc, updateDoc, serverTimestamp } = window.firebase;
      const plRef = doc(db, "playlists", pl.id);
      const updatedTracks = [...pl.tracks];
      if (!updatedTracks.some(t => t.id === track.id)) {
          updatedTracks.unshift(track);
      }
      try {
        await updateDoc(plRef, {
            tracks: updatedTracks,
            updatedAt: serverTimestamp()
        });
        sheet.classList.remove("show");
      } catch(e) {
        console.error("Error agregando canción: ", e);
        alert("No se pudo agregar la canción.");
      }
    };
    list.appendChild(btn);
  });
  
  $("#plCreateFromSong").onclick = async () => {
    const name = $("#plNewNameFromSong").value.trim();
    if (!name) return;
    const creator = prompt("Tu nombre (creador):")?.trim();
    if (!creator) return;

    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), {
            name,
            creator,
            tracks: [track],
            updatedAt: serverTimestamp()
        });
        addMyPlaylistId(docRef.id);
        $("#plNewNameFromSong").value = "";
        sheet.classList.remove("show");
    } catch (e) {
        console.error("Error creando playlist desde canción: ", e);
        alert("Hubo un error al crear la playlist.");
    }
  };

  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

/* ========= YouTube / reproducción ========= */
function updateUIOnTrackChange() {
  updateHero(currentTrack);
  updateMiniNow();
  refreshIndicators();
  updateControlStates();
  updateMediaSession(currentTrack);
}
function updateHero(track){
  const t = track || currentTrack;
  const favHero = $("#favHero");
  const npHero  = $("#npHero");
  if (favHero) favHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle") && ($("#favNowTitle").textContent = t ? t.title : "—");
  if (npHero) npHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle") && ($("#npTitle").textContent = t ? t.title : "Elegí una canción");
  
  let plName = "";
  if (queueType === 'playlist' && viewingPlaylistId) {
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    plName = pl ? pl.name : "";
  } else if (queueType && recommendedPlaylists[queueType]) {
    plName = recommendedPlaylists[queueType].title;
  }
  
  $("#npSub") && ($("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—"));
}
function setQueue(srcArr, type, idx){
  let finalSrc = srcArr;
  if (isShuffle) {
    const currentItem = srcArr[idx];
    finalSrc = shuffle(srcArr.filter(item => item.id !== currentItem.id));
    finalSrc.unshift(currentItem);
    idx = 0;
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
function playFromSearch(i, autoplay=false){ setQueue(items, "search", i); viewingPlaylistId = null; playCurrent(autoplay); }
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); viewingPlaylistId = null; playCurrent(autoplay);
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  setQueue(pl.tracks, "playlist", i);
  playCurrent(autoplay);
  renderPlaylists();
}
function playPlaylist(id){
  const pl = communityPlaylists.find(p=>p.id===id); if(!pl||!pl.tracks.length) return;
  playFromPlaylist(pl.id, 0, true);
}
function togglePlay(){
  if(!YT_READY || !currentTrack) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
$("#npPlay")?.addEventListener("click", togglePlay);
$("#miniPlay")?.addEventListener("click", togglePlay);

async function removeFromPlaylist(plId, trackId){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  const { doc, updateDoc, serverTimestamp } = window.firebase;
  const plRef = doc(db, "playlists", plId);
  const updatedTracks = pl.tracks.filter(t => t.id !== trackId);

  try {
    await updateDoc(plRef, {
        tracks: updatedTracks,
        updatedAt: serverTimestamp()
    });
  } catch (e) {
      console.error("Error quitando canción: ", e);
      alert("No se pudo quitar la canción.");
  }
}

/* Mini reproductor */
function updateMiniNow(){
  const has = !!currentTrack;
  const dock = $("#seekDock");
  dock && dock.classList.toggle("show", has);
  if(!has) return;
  $("#miniThumb") && ($("#miniThumb").src = currentTrack.thumb);
  $("#miniTitle") && ($("#miniTitle").textContent = currentTrack.title);
  $("#miniAuthor") && ($("#miniAuthor").textContent = cleanAuthor(currentTrack.author) || "");
}

function getNextIndex() {
  if (!queue) return -1;
  if (repeatMode === 'one') return qIdx;
  if (isShuffle) {
    if (queue.length <= 1) return (repeatMode === 'all') ? 0 : -1;
    let nextIdx;
    do { nextIdx = Math.floor(Math.random() * queue.length); }
    while (queue.length > 1 && nextIdx === qIdx);
    return nextIdx;
  }
  let next = qIdx + 1;
  if (next >= queue.length) return (repeatMode === 'all') ? 0 : -1;
  return next;
}
function next(){
  const nextIdx = getNextIndex();
  if (nextIdx !== -1) { qIdx = nextIdx; playCurrent(true); }
  else { ytPlayer.stopVideo(); currentTrack = null; updateUIOnTrackChange(); }
}
function prev(){
  if (!queue) return;
  if (isShuffle) { next(); return; }
  if (ytPlayer.getCurrentTime() > 3) ytPlayer.seekTo(0, true);
  else if (qIdx - 1 >= 0) { qIdx--; playCurrent(true); }
}
$("#btnNext")?.addEventListener("click", next);
$("#btnPrev")?.addEventListener("click", prev);

function seekToFrac(frac){
  if(!YT_READY) return;
  const d = ytPlayer.getDuration()||0;
  ytPlayer.seekTo(frac*d,true);
}
$("#seek")?.addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));
$("#miniSeek")?.addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY || !currentTrack) return;
    const state = ytPlayer.getPlayerState();
    if(state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) return;

    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur") && ($("#cur").textContent = fmt(cur));
    $("#dur") && ($("#dur").textContent = fmt(dur));
    $("#seek") && ($("#seek").value = dur? Math.floor((cur/dur)*1000) : 0);
    $("#miniCur") && ($("#miniCur").textContent = fmt(cur));
    $("#miniDur") && ($("#miniDur").textContent = fmt(dur));
    $("#miniSeek") && ($("#miniSeek").value = dur? Math.floor((cur/dur)*1000) : 0);

    try{
      if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
        navigator.mediaSession.setPositionState({
          duration: dur || 0,
          playbackRate: 1.0,
          position: cur || 0
        });
      }
    }catch{}

    savePlayerState();
  }, 500);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ========= Shuffle / Repeat ========= */
function toggleShuffle() {
  isShuffle = !isShuffle;
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  if (currentTrack) {
    let currentQueueSource = [];
    if (queueType === 'search') currentQueueSource = items;
    else if (queueType === 'favs') currentQueueSource = favs;
    else if (queueType === 'playlist') currentQueueSource = communityPlaylists.find(p => p.id === viewingPlaylistId)?.tracks || [];
    else if (recommendedPlaylists[queueType]) currentQueueSource = recommendedPlaylists[queueType].data;
    
    const originalIndex = currentQueueSource.findIndex(t => t.id === currentTrack.id);
    setQueue(currentQueueSource, queueType, Math.max(0, originalIndex));
  }
}
function cycleRepeat() {
  const modes = ['none', 'all', 'one'];
  const currentModeIdx = modes.indexOf(repeatMode);
  repeatMode = modes[(currentModeIdx + 1) % modes.length];
  const btn = $("#btnRepeat");
  btn && btn.classList.toggle('active', repeatMode !== 'none');
  if (btn){
    btn.innerHTML = (repeatMode === 'one')
      ? `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
  }
}
function updateControlStates() {
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  $("#btnRepeat")?.classList.toggle('active', repeatMode !== 'none');
}
$("#btnShuffle")?.addEventListener("click", toggleShuffle);
$("#btnRepeat")?.addEventListener("click", cycleRepeat);

/* ========= Cola (Player) ========= */
function renderQueue(queueItems, title) {
  const panel = $("#queuePanel");
  panel && panel.classList.remove("hide");
  $("#queueTitle") && ($("#queueTitle").textContent = title);
  const ul = $("#queueList");
  if (!ul) return;
  ul.innerHTML = "";
  
  const isUserPlaylist = queueType === 'playlist';
  if(!isUserPlaylist) viewingPlaylistId = null;

  queueItems.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.dataset.trackId = t.id;
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
        <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    li.onclick = (e) => {
      if (e.target.closest(".more") || e.target.closest(".card-play")) return;
      if(isUserPlaylist) playFromPlaylist(viewingPlaylistId, i, true);
      else { setQueue(queueItems, queueType, i); playCurrent(true); }
    };
    li.querySelector(".card-play").onclick = (e) => {
      e.stopPropagation();
      if(isUserPlaylist) playFromPlaylist(viewingPlaylistId, i, true);
      else { setQueue(queueItems, queueType, i); playCurrent(true); }
    };
    ul.appendChild(li);
  });
  refreshIndicators();
}

function showPlaylistInPlayer(plId){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  queueType = 'playlist';
  renderQueue(pl.tracks, pl.name);
}
function hideQueuePanel(){ $("#queuePanel")?.classList.add("hide"); $("#queueList") && ($("#queueList").innerHTML=""); viewingPlaylistId=null; renderPlaylists(); }

/* ========= Menú tres puntitos global ========= */
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
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    if (!pl || !isMyPlaylist(pl.id)) return; // Solo el creador puede editar

    const it = pl.tracks.find(t=>t.id===trackId);
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
    const P = communityPlaylists.find(p=>p.id===plId);
    if(!P || !isMyPlaylist(P.id)) return; // Solo el creador ve las opciones

    openActionSheet({
      title: P.name,
      actions:[
        { id:"open",   label:"Abrir" },
        { id:"play",   label:"Reproducir" },
        { id:"delete", label:"Eliminar", danger:true },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: async (id)=>{
        if(id==="open"){ showPlaylistInPlayer(P.id); switchView("view-player"); }
        if(id==="play"){ playPlaylist(P.id); switchView("view-player"); }
        if(id==="delete"){
          if(confirm(`¿Seguro que quieres eliminar la playlist "${P.name}"?`)){
            try {
                const { doc, deleteDoc } = window.firebase;
                await deleteDoc(doc(db, "playlists", P.id));
                removeMyPlaylistId(P.id);
            } catch (e) {
                console.error("Error eliminando playlist: ", e);
                alert("No se pudo eliminar la playlist.");
            }
          }
        }
      }
    });
  }
});

/* ========= Indicadores ========= */
function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    const isCurrentTrack = el.dataset.trackId === curId;
    el.classList.toggle("is-playing", isCurrentTrack);
    const cardPlay = el.querySelector(".card-play");
    if (cardPlay) cardPlay.classList.toggle("playing", isPlaying && isCurrentTrack);
  });

  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}

/* ========= Reproducción en segundo plano ========= */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || !currentTrack) return;
  if(document.visibilityState==="hidden" && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)){
    const t = ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds:t, suggestedQuality:"auto" });
    ytPlayer.playVideo();
  }
});

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
        const st = e.data;
        if(st===YT.PlayerState.ENDED){ next(); }
        try{
          if('mediaSession' in navigator){
            navigator.mediaSession.playbackState = (st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING) ? 'playing'
              : (st===YT.PlayerState.PAUSED ? 'paused' : 'none');
          }
        }catch{}
        refreshIndicators();
      }
    }
  });
};

/* ========= Infinite scroll ========= */
const sentinel = $("#sentinel");
if (sentinel){
  const io = new IntersectionObserver((entries)=>{
    for(const en of entries){ if(en.isIntersecting){ loadNextPage(); } }
  },{ root:null, rootMargin:"800px 0px", threshold:0 });
  io.observe(sentinel);
}

/* ========= HERO shrink con rAF ========= */
let rafPending = false;
let lastScrollY = 0;
let targetT = 0, currentT = 0;
const EPS = 0.001;
const DIST = 200;

function applyHeroT(t){
  const tSnap = Math.round(t*1000)/1000;
  const active = document.querySelector(".view.active");
  if(!active) return;
  const favHero = active.querySelector("#favHero, .fav-hero");
  const npHero  = active.querySelector("#npHero, .np-hero, .player-header-sticky");
  if (favHero) favHero.style.setProperty("--hero-t", tSnap);
  if (npHero)  npHero.style.setProperty("--hero-t", tSnap);
}

function heroScrollTickRaf(){
  rafPending = false;
  const active = document.querySelector(".view.active");
  if(!active){ applyHeroT(0); return; }

  const viewTop = active.getBoundingClientRect().top + window.scrollY;
  const y = Math.max(0, lastScrollY - viewTop);
  targetT = Math.min(1, y / DIST);

  currentT += (targetT - currentT) * 0.25;
  if (Math.abs(targetT - currentT) < EPS) currentT = targetT;

  applyHeroT(currentT);

  if (Math.abs(targetT - currentT) >= EPS) {
    requestAnimationFrame(heroScrollTickRaf);
    rafPending = true;
  }
}
function heroScrollInvalidate(){
  lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  if(!rafPending){
    rafPending = true;
    requestAnimationFrame(heroScrollTickRaf);
  }
}
window.addEventListener("scroll", heroScrollInvalidate, { passive:true });
window.addEventListener("resize", heroScrollInvalidate, { passive:true });

/* ========= Media Session API ========= */
let mediaSessionHandlersSet = false;
function updateMediaSession(track){
  if (!('mediaSession' in navigator) || !track) return;

  try{
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Reproduciendo',
      artist: cleanAuthor(track.author) || '—',
      album: queueType==='playlist' ? (communityPlaylists.find(p=>p.id===viewingPlaylistId)?.name || '') : '',
      artwork: [
        { src: track.thumb, sizes: '96x96',   type: 'image/jpeg' },
        { src: track.thumb, sizes: '128x128', type: 'image/jpeg' },
        { src: track.thumb, sizes: '256x256', type: 'image/jpeg' },
        { src: track.thumb, sizes: '512x512', type: 'image/jpeg' }
      ]
    });
  }catch(e){ /* metadata best-effort */ }

  if (!mediaSessionHandlersSet){
    mediaSessionHandlersSet = true;
    const safe = (fn)=>()=>{ try{ fn(); }catch{} };

    try{
      navigator.mediaSession.setActionHandler('play',  safe(()=> togglePlay()));
      navigator.mediaSession.setActionHandler('pause', safe(()=> togglePlay()));
      navigator.mediaSession.setActionHandler('previoustrack', safe(()=> prev()));
      navigator.mediaSession.setActionHandler('nexttrack',     safe(()=> next()));
      navigator.mediaSession.setActionHandler('seekbackward',  safe(()=>{
        if(!YT_READY) return; ytPlayer.seekTo(Math.max(0,(ytPlayer.getCurrentTime()||0)-10), true);
      }));
      navigator.mediaSession.setActionHandler('seekforward',   safe(()=>{
        if(!YT_READY) return; ytPlayer.seekTo((ytPlayer.getCurrentTime()||0)+10, true);
      }));
      navigator.mediaSession.setActionHandler('seekto', (details)=>{
        try{
          if(!YT_READY || !details || typeof details.seekTime!=='number') return;
          ytPlayer.seekTo(details.seekTime, true);
        }catch{}
      });
      navigator.mediaSession.setActionHandler('stop', safe(()=>{
        ytPlayer.stopVideo();
      }));
    }catch(e){ /* algunos navegadores no permiten todos los handlers */ }
  }

  try{
    const st = getPlaybackState();
    navigator.mediaSession.playbackState = (st==='playing'?'playing':(st==='paused'?'paused':'none'));
  }catch{}
}

/* ========= Init ========= */
async function boot(){
  initTheme();
  
  const firebaseConfig = {
    apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU",
    authDomain: "sanaverayou.firebaseapp.com",
    projectId: "sanaverayou",
    storageBucket: "sanaverayou.appspot.com",
    messagingSenderId: "275513302327",
    appId: "1:275513302327:web:3b26052bf02e657d450eb2"
  };
  
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  
  window.firebase = { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc };

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  const q = query(collection(db, "playlists"), orderBy("updatedAt", "desc"));
  onSnapshot(q, (querySnapshot) => {
      const playlists = [];
      querySnapshot.forEach((doc) => {
          playlists.push({ id: doc.id, ...doc.data() });
      });
      communityPlaylists = playlists;
      renderPlaylists();
      
      const allPlaylists = [
        ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0),
        ...communityPlaylists.filter(p => p.tracks && p.tracks.length > 0)
      ];
      
      allPlaylists.sort((a, b) => {
        const dateA = a.updatedAt?.toDate() || 0;
        const dateB = b.updatedAt?.toDate() || 0;
        if (a.isRecommended) return 1; // Siempre al final si no tienen fecha
        if (b.isRecommended) return -1;
        return dateB - dateA;
      });

      const container = $("#allPlaylistsContainer");
      if(container) container.innerHTML = "";
      allPlaylists.forEach(p => renderPlaylistCard(p));
  });

  const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key =>
    fetchVideoDetailsByIds(recommendedPlaylists[key].ids)
      .catch(error => {
        console.error(`Failed to fetch playlist '${key}':`, error);
        return [];
      })
  );
  
  const results = await Promise.all(fetchPromises);
  
  playlistKeys.forEach((key, index) => {
    recommendedPlaylists[key].data = results[index] || [];
  });
  
  updateHomeGridVisibility();

  loadFavs();
  renderFavs();
  
  loadYTApi();
  
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);

  heroScrollInvalidate();

  document.title = "SanaveraYou Pro";
}
boot();

window.addEventListener('beforeunload', savePlayerState);
