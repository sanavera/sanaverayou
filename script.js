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
const youtubeLogoSvg = () => `
  <span class="source-logo youtube-logo" title="YouTube">
    <svg viewBox="0 0 28 20" fill="currentColor" height="1em" width="1em"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"></path></svg>
  </span>`;
const spotifyLogoSvg = () => `
  <span class="source-logo spotify-logo" title="Spotify">
    <svg viewBox="0 0 167.5 167.5" fill="currentColor" height="1em" width="1em"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"></path></svg>
  </span>`;
const youtubeMusicLogoSvg = () => `
  <span class="source-logo ytmusic-logo" title="YouTube Music">
    <svg viewBox="0 0 24 24" fill="currentColor" height="1em" width="1em"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg>
  </span>`;

/* ========= Estado ========= */
let items = [];
let favs  = [];
let communityPlaylists = []; // Playlists de la comunidad (Firebase)
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let viewingPlaylistId = null;
let currentQueueTitle = "";

let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;
let db; // Instancia de Firestore
let resolverJobUnsubscribe = null; // Unsubscriber for the job listener

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };


// --- Listas de reproducción recomendadas ---
const recommendedPlaylists = {
  p1: {
    ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZN1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3VdoetCQ', '6NXnxTNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3VdoetCQ'],
    title: 'Melódicos en Inglés',
    creator: 'Luis Sanavera',
    data: [],
    isRecommended: true
  },
  p2: {
    ids: ['0qSif7B09N8', 'Ngi3rVx6kho', 'HhsXDJ1KeAI', 'MjgYsL3e3Mw', 'rsjGKU-qg3c', 'G6DbIQzCVBk', 'mdQW8ZLHpCU', 'MX-vrDW-A7I', 'uxZC1W6DHmI', 'WTlEED0_QcQ', 'ALA8ZDLQF9U', 'x1tWQNxJpY4', 'h2gj7Aap3iY', 'biXIrPcupuE', 'Vw5j10cBU78', 'Z5jQKzbOejY', 'ypg7ikDRhfg', '1gtJWFSWuYc', 'IhWGr-hTfHU', 'ZAKWI3mi14A', 'gy2hK11AKGE', 'fuYq32iJdIw', 'DzhxJkF7c9s', 'QqS4kWie8SA', 'sw6v-Q-2Is4', 'yXXheK7wYqo', 'xd-IwfDs7c4', 'HcWlkUKwjlc', 'pPoUVEcT0aU', 'N7m-0KXjKR0', 'OX2fVkdQYKg', 'AIIcEeQaWI0', 'WI0da9h-gcE', 'uxZC1W6DHmI', 'w09HG8_FAHQ', '_IqyVs9ObFA', 'auNa0nRPg3o', '46T65kU9Pw0', 'lsDSVZ10sY4', '4nztFNNeay0'],
    title: 'Cumbia estilo Santafesino',
    creator: 'Luis Sanavera',
    data: [],
    isRecommended: true
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
    data: [],
    isRecommended: true
},
  reggaeton: {
    ids: ['kJQP7kiw5Fk', 'TmKh7lAwnBI', 'tbneQDc2H3I', 'wnJ6LuUFpMo', '_I_D_8Z4sJE', 'DiItGE3eAyQ', 'VqEbCxg2bNI', '9jI-z9QN6g8', 'Cr8K88UcO0s', 'QaXhVryxVBk', 'ca48oMV59LU', '0VR3dfZf9Yg'],
    title: 'Noche de Reggaetón',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
  },
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
    console.error("Error saving player state:", e);
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
    console.error("Error loading player state:", e);
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
    tBtn.setAttribute("aria-label", isLight ? "Change to dark mode" : "Change to light mode");
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

/* ========= API Spotify ========= */
async function getSpotifyToken() {
    if (spotifyToken.value && Date.now() < spotifyToken.expires) {
        return spotifyToken.value;
    }

    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
            },
            body: 'grant_type=client_credentials'
        });
        if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`);
        const data = await response.json();
        spotifyToken = {
            value: data.access_token,
            expires: Date.now() + (data.expires_in * 1000) - 60000
        };
        return spotifyToken.value;
    } catch (e) {
        console.error("Error getting Spotify token:", e);
        return null;
    }
}

async function searchSpotify(query, type = 'track,playlist', limit = 10) {
    const token = await getSpotifyToken();
    if (!token) return { tracks: [], playlists: [] };

    try {
        const url = new URL('https://api.spotify.com/v1/search');
        url.searchParams.append('q', query);
        url.searchParams.append('type', type);
        url.searchParams.append('limit', limit);
        url.searchParams.append('market', 'AR');

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Could not search on Spotify: ${response.statusText}`);
        const data = await response.json();

        const tracks = (data.tracks?.items || []).map(item => ({
            source: 'spotify',
            type: 'spotify_track',
            id: item.id,
            title: item.name,
            author: item.artists.map(a => a.name).join(', '),
            thumb: item.album.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'
        }));

        const playlists = (data.playlists?.items || []).map(item => ({
            source: 'spotify',
            type: 'spotify_playlist',
            id: item.id,
            title: item.name,
            author: item.owner.display_name,
            thumb: item.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'
        }));

        return { tracks, playlists };
    } catch (e) {
        console.error("Spotify search error:", e);
        return { tracks: [], playlists: [] };
    }
}


/* ========= Lógica de Scraping de YouTube ========= */
const uniq = a => [...new Set(a)];

async function withRetry(fn, retries = 3, initialDelay = 500) {
    let delay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fn();
            if (response instanceof Response) {
                if (response.ok) return response;
                if (response.status === 429) {
                    console.warn(`Scraping attempt ${i + 1} got 429. Retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                    continue;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (e) {
            if (i === retries - 1) {
                 console.error("Scraping failed after all retries.", e);
                 throw e;
            }
             console.warn(`Scraping attempt ${i + 1} failed. Retrying in ${delay}ms...`, e.message);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
}

async function scrapeYoutube(query, limit = 1) {
    const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await withRetry(() => fetch(endpoint, {
            headers: { 'Accept': 'text/plain' },
            signal: controller.signal
        }));
        
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
        const html = await response.text();

        const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1])).slice(0, limit);
        if (!ids.length) return [];
        
        const metadataPromises = ids.map(id => 
            fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
                .then(r => r.ok ? r.json() : Promise.reject('Noembed fetch failed'))
                .then(meta => {
                    if (meta.error) return null;
                    return {
                        id,
                        title: cleanTitle(meta.title || `Video ${id}`),
                        thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
                        author: cleanAuthor(meta.author_name || "YouTube"),
                        source: 'youtube', type: 'youtube_video'
                    };
                })
                .catch(() => ({
                    id, title: `Video ${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                    author: "YouTube", source: 'youtube', type: 'youtube_video'
                }))
        );
        return (await Promise.all(metadataPromises)).filter(Boolean);
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') console.warn(`Scraping timed out for query: ${query}`);
        throw error;
    }
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
                };
            })
            .catch(() => ({
                id, title: `Video ${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, author: "YouTube"
            }))
    );
    return (await Promise.all(metadataPromises)).filter(Boolean);
}

let searchAbort = null;
let currentSearchType = 'all';

/* ========= Nav & Búsqueda ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view = $("#"+id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  if (btn.classList.contains('active')) return;
  switchView(btn.dataset.view);
});

const searchOverlay = $("#searchOverlay");
const overlayInput  = $("#overlaySearchInput");
function openSearch(){
    searchOverlay.classList.add("show");
    setTimeout(()=> {
        overlayInput.focus();
        overlayInput.select();
    }, 50);
}
function closeSearch(){ searchOverlay.classList.remove("show"); }
$("#searchFab")?.addEventListener("click", openSearch);
searchOverlay?.addEventListener("click", e=>{ if(e.target===searchOverlay) closeSearch(); });
overlayInput?.addEventListener("keydown", async e=>{
    if (e.key !== "Enter") return;
    const q = overlayInput.value.trim();
    if (!q) return;
    closeSearch();
    document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
    switchView("view-search");
    await startSearch(q);
});

let paging = { query:"", loading:false, hasMore:false };
async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true, hasMore: false };
  items = [];
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando...</h3></div>`;
  
  try {
    const ytPromise = scrapeYoutube(query, 30);
    const spPromise = searchSpotify(query, 'playlist', 20).then(r => r.playlists);
    const [ytResults, spResults] = await Promise.all([ytPromise, spPromise]);

    if (searchAbort.signal.aborted) return;
    
    const combined = [...spResults, ...ytResults];
    if (resultsEl) resultsEl.innerHTML = "";
    if (combined.length === 0) {
      if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron resultados.</p></div>`;
      return;
    }
    items = combined;
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
    item.dataset.itemId = it.id;
    item.dataset.trackId = it.id;

    let indicator = '';
    let logo = '';

    if (it.source === 'spotify') logo = spotifyLogoSvg();
    else logo = youtubeLogoSvg();

    if (it.type.includes('playlist')) {
        item.classList.add("playlist-result-item");
        indicator = '<div class="playlist-indicator">LISTA</div>';
    }

    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
        ${indicator}
        ${!it.type.includes('playlist') ?
          `<button class="card-play" title="Play/Pause" aria-label="Play/Pause">
            <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>` : ''}
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
    if (event.target.closest(".more") || (event.target.closest(".card-play") && !forcePlay)) return;

    switch (item.type) {
        case 'youtube_video': playFromSearch(item.id, true); break;
        case 'spotify_track': playSpotifyTrack(item); break;
        case 'spotify_playlist': importPlaylistFromSearch(item); break;
    }
}

async function playSpotifyTrack(track) {
    showToast("Buscando en YouTube...");
    const ytEquivalent = await findYoutubeEquivalent(track);
    if (ytEquivalent) {
        setQueue([ytEquivalent], "search", 0);
        viewingPlaylistId = null;
        playCurrent(true);
        switchView('view-player');
    } else {
        showToast("No se pudo encontrar un video para esta canción.", true);
    }
}

async function findYoutubeEquivalent(track) {
    if (!track || !track.title) return null;
    const { videoId } = await resolveTrack(track);
    if (!videoId) return null;

    return {
        id: videoId,
        title: track.title,
        author: track.author,
        thumb: track.thumb || `https://i.imgur.com/gCa3j5g.png`,
        source: 'youtube',
        type: 'youtube_video',
        originalId: track.id || track.spotifyId,
    };
}

/* ========= El resto de la App (Playlists, Player, etc.) ========= */
// A partir de aquí, el código es el mismo que el de la versión anterior y funcional.
// Se incluye completo para asegurar que no falte nada.

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    
    let trackCount = playlist.trackCount || playlist.tracks?.length || 0;
    if (playlist.isRecommended) trackCount = playlist.data.length;
    if (trackCount === 0) return;

    let covers = (playlist.tracks || playlist.data || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length > 0 && covers.length < 4) covers.push(covers[0]);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    
    const logo = playlist.isRecommended ? youtubeLogoSvg() : (playlist.source === 'spotify' ? spotifyLogoSvg() : youtubeLogoSvg());
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id || playlist.title;
    card.innerHTML = `
        <div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
        <div class="playlist-meta">
            <h4 class="playlist-title">${playlist.title || playlist.name}</h4>
            <div class="creator-line">${logo}<span>Creador: ${playlist.creator}</span></div>
        </div>`;
    card.onclick = async () => {
        if (playlist.isRecommended) {
            setQueue(playlist.data, 'recommended', 0);
            renderQueue(playlist.data, playlist.title);
            switchView('view-player');
            playCurrent(true);
        } else {
             await showPlaylistInPlayer(playlist.id);
        }
    };
    container.appendChild(card);
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
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>
      </div>
      <div class="meta">
        <div class="title-line"><span class="title-text">${it.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions"><button class="icon-btn more" title="Opciones">${dotsSvg()}</button></div>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".more, .card-play")) return;
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
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); playCurrent(autoplay);
}

/* ========= Playlists (Firebase) ========= */
const LS_USER_PLAYLIST_IDS = "sy_user_playlist_ids_v1";
function getMyPlaylistIds() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]"); } catch { return []; } }
function addMyPlaylistId(id) { const ids=getMyPlaylistIds(); if(!ids.includes(id)){ ids.push(id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); } }
function removeMyPlaylistId(id) { let ids=getMyPlaylistIds(); ids=ids.filter(pid=>pid!==id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); }
function isMyPlaylist(id) { return getMyPlaylistIds().includes(id); }

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
        const cover = pl.cover || pl.tracks?.[0]?.thumb || pl.spotifyTracks?.[0]?.thumb || "https://i.imgur.com/gCa3j5g.png";
        const total = pl.trackCount || pl.spotifyTracks?.length || 0;
        const resolved = pl.resolvedCount || 0;
        let statusText = `${resolved} / ${total} temas`;
        if (pl.status === 'resolving') statusText = `Importando... (${resolved}/${total})`;
        else if (pl.status === 'partial') statusText = `Parcial (${resolved}/${total})`;
        else if (pl.status === 'resolved' || pl.source !== 'spotify') statusText = `${total} temas`;
        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
            </div>`;
        card.addEventListener("click", () => showPlaylistInPlayer(pl.id));
        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

$("#btnNewPlaylist")?.addEventListener("click", () => { $("#createPlaylistSheet").classList.add("show"); });
$("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
$("#createPlaylistSheet").addEventListener("click", e => { if (e.target.id === 'createPlaylistSheet') $("#createPlaylistSheet").classList.remove("show"); });
$("#createPlConfirm").onclick = async () => {
    const name = $("#newPlName").value.trim();
    const creator = $("#newPlCreator").value.trim();
    if (!name || !creator) { showToast("Por favor, completa nombre de playlist y creador.", true); return; }
    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: false, ownerUserId: 'current_user_id_placeholder' });
        addMyPlaylistId(docRef.id);
        $("#newPlName").value = ""; $("#newPlCreator").value = ""; $("#createPlaylistSheet").classList.remove("show");
    } catch (e) { console.error("Error creating playlist: ", e); showToast("Hubo un error al crear la playlist.", true); }
};

/* ========= Sheets & Toasts ========= */
function showToast(message, isError = false) {
    let toast = document.getElementById('sy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'show';
    if(isError) toast.classList.add('error');
    setTimeout(() => toast.className = toast.className.replace('show', ''), 3000);
}

/* ========= YouTube / reproducción ========= */
function updateUIOnTrackChange() {
  updateHero(currentTrack);
  updateMiniNow();
  refreshIndicators();
  updateMediaSession(currentTrack);
}
function updateHero(track){
  const t = track || currentTrack;
  const npHero  = $("#npHero");
  if (npHero) npHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  let plName = "";
  if (queueType === 'playlist' && viewingPlaylistId) {
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    plName = pl ? pl.name : "";
  }
  $("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—");
}
function setQueue(srcArr, type, idx){
  let finalSrc = srcArr.filter(t => t && t.id);
  if (isShuffle) {
    const currentItem = finalSrc[idx];
    const others = finalSrc.filter((_, index) => index !== idx);
    finalSrc = [currentItem, ...others.sort(() => Math.random() - 0.5)];
    idx = 0;
  }
  queue = finalSrc;
  queueType = type;
  qIdx = idx;
}
function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  if (!currentTrack || !currentTrack.id) { next(); return; }
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateUIOnTrackChange();
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  const tracks = (pl.tracks || []).filter(t => t && t.id);
  if (tracks.length === 0) { showToast("Esta playlist no tiene canciones listas.", true); return; }
  setQueue(tracks, "playlist", i);
  playCurrent(autoplay);
  renderPlaylists();
}
function togglePlay(){
  if(!YT_READY || !currentTrack) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
$("#npPlay")?.addEventListener("click", togglePlay);
$("#miniPlay")?.addEventListener("click", togglePlay);

function getNextIndex() {
  if (!queue) return -1;
  if (repeatMode === 'one') return qIdx;
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
  if (ytPlayer.getCurrentTime() > 3) ytPlayer.seekTo(0, true);
  else if (qIdx - 1 >= 0) { qIdx--; playCurrent(true); }
}
$("#btnNext")?.addEventListener("click", next);
$("#btnPrev")?.addEventListener("click", prev);

function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY || !currentTrack || getPlaybackState() !== 'playing') return;
    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur").textContent = fmt(cur); $("#dur").textContent = fmt(dur); $("#seek").value = dur ? (cur/dur)*1000 : 0;
    $("#miniCur").textContent = fmt(cur); $("#miniDur").textContent = fmt(dur); $("#miniSeek").value = dur ? (cur/dur)*1000 : 0;
  }, 500);
}
function stopTimer(){ clearInterval(timer); timer=null; }
$("#seek")?.addEventListener("input", e=> ytPlayer.seekTo(ytPlayer.getDuration() * (parseInt(e.target.value,10)/1000),true));
$("#miniSeek")?.addEventListener("input", e=> ytPlayer.seekTo(ytPlayer.getDuration() * (parseInt(e.target.value,10)/1000),true));

/* Mini reproductor */
function updateMiniNow(){
  const has = !!currentTrack;
  $("#seekDock").classList.toggle("show", has);
  if(!has) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  $("#miniAuthor").textContent = cleanAuthor(currentTrack.author) || "";
}

/* ========= Shuffle / Repeat ========= */
function toggleShuffle() {
  isShuffle = !isShuffle;
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
}
function cycleRepeat() {
  const modes = ['none', 'all', 'one'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
  const btn = $("#btnRepeat");
  if(btn) btn.classList.toggle('active', repeatMode !== 'none');
}
$("#btnShuffle")?.addEventListener("click", toggleShuffle);
$("#btnRepeat")?.addEventListener("click", cycleRepeat);

/* ========= Cola (Player) ========= */
function renderQueue(queueItems, title) {
    const panel = $("#queuePanel");
    currentQueueTitle = title;
    if(!panel) return;
    panel.classList.remove("hide");
    panel.innerHTML = `<div class="section-head"><h3 id="queueTitle"></h3></div><ul id="queueList"></ul>`;
    $("#queueTitle").textContent = title;
    const ul = $("#queueList");
    if (!ul) return;
    ul.innerHTML = "";
    (queueItems || []).forEach((t) => {
        if (!t) return;
        const li = document.createElement("li");
        li.className = "queue-item";
        li.dataset.trackId = t.id || `spotify_${t.spotifyId}`;
        const isResolved = !!t.id;
        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb || 'https://i.imgur.com/gCa3j5g.png'}" alt="">
            ${isResolved ? `<button class="card-play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>` : `<div class="pending-indicator">Buscando...</div>`}
          </div>
          <div class="meta">
            <div class="title-line"><span class="title-text">${t.title}</span>${isResolved ? `<span class="eq"><span></span><span></span><span></span></span>` : ''}</div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".card-play") || !isResolved) return;
            const resolvedQueue = queueItems.filter(item => item && item.id);
            const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
            if (resolvedIndex !== -1) { setQueue(resolvedQueue, queueType, resolvedIndex); playCurrent(true); }
        };
        const playBtn = li.querySelector(".card-play");
        if(playBtn) {
            playBtn.onclick = (e) => {
                e.stopPropagation();
                 if(currentTrack?.id === t.id){ togglePlay(); return; }
                const resolvedQueue = queueItems.filter(item => item && item.id);
                const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
                if (resolvedIndex !== -1) { setQueue(resolvedQueue, 'playlist', resolvedIndex); playCurrent(true); }
            };
        }
        ul.appendChild(li);
    });
    refreshIndicators();
}
async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    viewingPlaylistId = pl.id;
    switchView('view-player');
    const tracksToShow = (pl.tracks?.length && pl.tracks.some(t=>t)) ? pl.tracks.map((t, i) => t || { ...(pl.spotifyTracks[i] || {}), id: null }) : (pl.spotifyTracks || []).map(st => ({...st, id: null}));
    renderQueue(tracksToShow, pl.name);
    if (pl.source === 'spotify' && pl.status !== 'resolved' && pl.status !== 'resolving') {
        startResolverJob(pl.id);
    }
}

/* ========= Indicadores y YouTube API ========= */
function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";
  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    const trackId = el.dataset.trackId;
    const isCurrent = trackId === curId;
    el.classList.toggle("is-playing", isCurrent);
    el.querySelector(".card-play")?.classList.toggle("playing", isPlaying && isCurrent);
  });
  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300, height:150, playerVars:{playsinline:1, controls:0, rel:0},
    events:{
      onReady:()=>{ YT_READY=true; window.dispatchEvent(new Event('yt-ready')); },
      onStateChange:(e)=>{
        if(e.data===YT.PlayerState.ENDED){ next(); }
        refreshIndicators();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = getPlaybackState();
      }
    }
  });
};

/* ========= Media Session API ========= */
function updateMediaSession(track){
  if(!('mediaSession' in navigator)||!track)return;
  navigator.mediaSession.metadata=new MediaMetadata({title:track.title, artist:cleanAuthor(track.author), artwork:[{src:track.thumb}]});
  navigator.mediaSession.setActionHandler('play', ()=>togglePlay());
  navigator.mediaSession.setActionHandler('pause',()=>togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack', ()=>prev());
  navigator.mediaSession.setActionHandler('nexttrack',()=>next());
}

/* ========= Init & Firebase Listeners ========= */
async function boot(){
  initTheme();
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, runTransaction, FieldValue } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
  window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, runTransaction, FieldValue };
  db = getFirestore(initializeApp(firebaseConfig));
  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    const oldPlaylists = new Map(communityPlaylists.map(p => [p.id, p]));
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const newPl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    if (newPl) {
        const oldPl = oldPlaylists.get(newPl.id);
        if (!oldPl || newPl.updatedAt?.toMillis() > oldPl.updatedAt?.toMillis()) {
            const tracksToShow = (newPl.tracks?.length) ? newPl.tracks.map((t, i) => t || { ...(newPl.spotifyTracks?.[i] || {}), id: null }) : (newPl.spotifyTracks || []).map(st => ({...st, id: null}));
            renderQueue(tracksToShow, newPl.name);
            if (currentTrack && queueType === 'playlist') {
                const newQueue = (tracksToShow || []).filter(t => t && t.id);
                const newIdx = newQueue.findIndex(t => t.id === currentTrack.id);
                if (newIdx !== -1) { queue = newQueue; qIdx = newIdx; }
            }
        }
    }
    renderPlaylists();
    renderAllHomePlaylists();
  });
  const playlistKeys = Object.keys(recommendedPlaylists);
  const results = await Promise.all(playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids)));
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });

  renderAllHomePlaylists();
  loadFavs(); renderFavs(); loadYTApi();
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
  sy_initSpotifyImportUI();
}

function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && (p.tracks?.length > 0 || p.spotifyTracks?.length > 0));
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

boot();
window.addEventListener('pagehide', savePlayerState);

/* ========== Spotify Import & Resolver Logic ========== */
const trackCache = new Map();
function getTrackKey(artist, title) {
    const n = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${n(artist)}|${n(title)}`;
}
async function resolveTrack(track) {
    const cacheKey = track.spotifyId || getTrackKey(track.author, track.title);
    if (trackCache.has(cacheKey)) return { videoId: trackCache.get(cacheKey) };
    const query = `${track.author} ${track.title}`;
    try {
        const results = await scrapeYoutube(query, 1);
        if (results && results[0] && results[0].id) {
            const videoId = results[0].id;
            trackCache.set(cacheKey, videoId);
            return { videoId };
        }
        return { error: "No video found" };
    } catch (e) { return { error: e.message }; }
}

async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) return;
    const playlist = { id: plDoc.id, ...plDoc.data() };
    trackCache.clear();
    let jobId = playlist.resolverJobId;
    const jobRef = doc(db, "resolverJobs", jobId || `job_${playlistId}_${Date.now()}`);
    if (!jobId || !(await getDoc(jobRef)).exists()) {
        jobId = jobRef.id;
        await updateDoc(plRef, { resolverJobId: jobId, status: 'resolving' });
        await setDoc(jobRef, { status: 'running', total: (playlist.spotifyTracks || []).length, nextIndex: 0, lastUpdated: serverTimestamp() });
    } else {
        await updateDoc(plRef, { status: 'resolving' });
        await updateDoc(jobRef, { status: 'running', nextIndex: playlist.resolvedCount || 0, lastUpdated: serverTimestamp() });
    }
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (doc) => {
        if (doc.exists()) updateResolverModal({id: doc.id, ...doc.data()});
    });
    const CONCURRENT_WORKERS = 3;
    for (let i = 0; i < CONCURRENT_WORKERS; i++) {
        setTimeout(() => worker(playlistId, jobRef.id), i * 300);
    }
}

async function worker(playlistId, jobId) {
    const { doc, getDoc, updateDoc, runTransaction, FieldValue, serverTimestamp } = window.firebase;
    const jobRef = doc(db, "resolverJobs", jobId);
    const plRef = doc(db, "playlists", playlistId);
    while (true) {
        let currentIndex = -1;
        try {
            await new Promise(res => setTimeout(res, 600 + Math.random() * 400));
            currentIndex = await runTransaction(db, async (t) => {
                const jobDoc = await t.get(jobRef);
                if (!jobDoc.exists() || jobDoc.data().status !== 'running') return -1;
                const current = jobDoc.data().nextIndex;
                if (current >= jobDoc.data().total) return -1;
                t.update(jobRef, { nextIndex: current + 1 });
                return current;
            });
            if (currentIndex === -1) break;
            const plDoc = await getDoc(plRef);
            if (!plDoc.exists()) break;
            const trackToProcess = plDoc.data().spotifyTracks[currentIndex];
            if (!trackToProcess) continue;
            const result = await resolveTrack(trackToProcess);
            const updatePayload = { updatedAt: serverTimestamp() };
            if (result.videoId) {
                updatePayload[`tracks.${currentIndex}`] = { ...trackToProcess, id: result.videoId, source: 'youtube', originalId: trackToProcess.spotifyId };
                updatePayload.resolvedCount = FieldValue.increment(1);
            }
            await updateDoc(plRef, updatePayload);
        } catch (e) {
            if (e.message.includes("Job stopped") || e.message.includes("Job finished")) break;
        }
    }
    const finalJobDoc = await getDoc(jobRef);
    if (finalJobDoc.exists() && finalJobDoc.data().nextIndex >= finalJobDoc.data().total && finalJobDoc.data().status === 'running') {
        await updateDoc(jobRef, { status: 'done' });
        const finalPl = (await getDoc(plRef)).data();
        await updateDoc(plRef, { status: finalPl.resolvedCount === finalPl.trackCount ? 'resolved' : 'partial' });
    }
}

function updateResolverModal(job) {
    if (!job || job.status !== 'running') { hideResolverModal(); return; }
    let modal = document.getElementById('resolver-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resolver-modal';
        modal.className = 'sy-modal-resolver';
        modal.innerHTML = `<div class="resolver-content"><p>Asignando URLs...</p><div class="resolver-progress-bar"><div class="resolver-progress"></div></div><span class="resolver-counter">0 / 0</span><button class="resolver-cancel">Cancelar</button></div>`;
        modal.querySelector('.resolver-cancel').onclick = cancelResolverJob;
        document.body.appendChild(modal);
        setTimeout(()=> modal.classList.add('show'), 10);
    }
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    const resolved = pl?.resolvedCount || 0;
    const total = job.total || pl?.trackCount || 0;
    if (total === 0) return;
    modal.querySelector('.resolver-progress').style.width = `${(resolved / total) * 100}%`;
    modal.querySelector('.resolver-counter').textContent = `${resolved} / ${total}`;
}

function hideResolverModal() {
    const modal = document.getElementById('resolver-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
    if (resolverJobUnsubscribe) { resolverJobUnsubscribe(); resolverJobUnsubscribe = null; }
}

async function cancelResolverJob() {
    if (!viewingPlaylistId) return;
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    if (!pl || !pl.resolverJobId) return;
    const { doc, updateDoc, serverTimestamp, getDoc } = window.firebase;
    const jobRef = doc(db, "resolverJobs", pl.resolverJobId);
    const plRef = doc(db, "playlists", pl.id);
    await updateDoc(jobRef, { status: 'canceled', lastUpdated: serverTimestamp() });
    const finalPl = (await getDoc(plRef)).data();
    const finalStatus = (finalPl.resolvedCount || 0) > 0 ? 'partial' : 'unresolved';
    await updateDoc(plRef, { status: finalStatus });
    showToast("Importación cancelada.", true);
    hideResolverModal();
}

/* ========== Spotify Import UI & Logic ========== */
async function importPlaylistFromSearch(playlistItem) {
    showToast(`Importando "${playlistItem.title}"...`);
    const { collection, query, where, getDocs, addDoc, serverTimestamp } = window.firebase;
    const playlistsCol = collection(db, 'playlists');
    const q = query(playlistsCol, where("spotifyId", "==", playlistItem.id), where("ownerUserId", "==", "current_user_id_placeholder"));
    const existingSnapshot = await getDocs(q);
    if (!existingSnapshot.empty) {
        showToast("Playlist encontrada en tu librería.");
        await showPlaylistInPlayer(existingSnapshot.docs[0].id);
    } else {
        try {
            const spotifyTracks = await fetchAllSpotifyPlaylistTracks(playlistItem.id);
            if (spotifyTracks.length === 0) { showToast("Esta playlist de Spotify está vacía o es privada.", true); return; }
            const newPlaylist = { name: playlistItem.title, creator: playlistItem.author, isPublic: false, cover: playlistItem.thumb, source: 'spotify', spotifyId: playlistItem.id, spotifyTracks, trackCount: spotifyTracks.length, tracks: Array(spotifyTracks.length).fill(null), status: 'unresolved', resolvedCount: 0, updatedAt: serverTimestamp(), ownerUserId: "current_user_id_placeholder" };
            const docRef = await addDoc(playlistsCol, newPlaylist);
            addMyPlaylistId(docRef.id);
            showToast("Playlist agregada. Iniciando asignación de URLs...");
            await showPlaylistInPlayer(docRef.id);
        } catch (e) { console.error("Error al importar playlist desde la búsqueda:", e); showToast("No se pudo importar la playlist.", true); }
    }
}

async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`;
    while (url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Could not get songs from playlist');
            const data = await response.json();
            const tracks = data.items.map(({ track }) => track ? { spotifyId: track.id, title: track.name, author: track.artists.map(a => a.name).join(', '), thumb: track.album.images?.[0]?.url || '' } : null).filter(Boolean);
            allTracks = allTracks.concat(tracks);
            url = data.next;
        } catch (e) { console.error("Error fetching Spotify playlist tracks:", e); url = null; }
    }
    return allTracks;
}

function sy_initSpotifyImportUI() {
  const playlistsView = document.getElementById('view-playlists');
  if (!playlistsView || playlistsView.querySelector('#syBtnImportSpotify')) return;
  const bar = document.createElement('div');
  bar.className = 'sy-pl-toolbar';
  const btn = document.createElement('button');
  btn.id = 'syBtnImportSpotify';
  btn.className = 'pill accent';
  btn.innerHTML = `${spotifyLogoSvg().replace('class="source-logo spotify-logo"','style="height:1em;width:1em;margin-right:8px;"')} Importar desde Spotify`;
  bar.appendChild(btn);
  playlistsView.querySelector('.section-head').insertAdjacentElement('afterend', bar);
  btn.addEventListener('click', sy_openSpotifyImportModal);
}

function sy_openSpotifyImportModal() {
  if (document.getElementById('sySpotifyModal')) {
    document.getElementById('sySpotifyModal').remove();
  }
  const modal = document.createElement('div');
  modal.id = 'sySpotifyModal';
  modal.className = 'sy-modal';
  modal.innerHTML = `<div class="sy-modal__overlay"></div><div class="sy-modal__card"><div class="sy-modal__header"><h3>Importar desde Spotify</h3></div><div class="sy-modal__body"><p class="muted">Ingresá tu usuario o URL de perfil de Spotify.</p><label class="sy-field"><span>Usuario o URL</span><input id="sySmInput" type="text" placeholder="ej. luchosanavera"></label><div class="sy-actions"><button id="sySmCancel" class="btn">Cancelar</button><button id="sySmFetch" class="btn accent">Buscar</button></div><div id="sySmSpinner" class="sy-spinner" hidden>Cargando...</div><div id="sySmResults" class="sy-pl-results" hidden></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.sy-modal__overlay').onclick = () => modal.remove();
  modal.querySelector('#sySmCancel').onclick = () => modal.remove();
  modal.querySelector('#sySmFetch').onclick = sy_fetchSpotifyUserPlaylists;
  modal.classList.add('show');
}

async function sy_fetchSpotifyUserPlaylists() {
    const input = document.getElementById('sySmInput').value.trim();
    const userId = input.match(/user\/([^?]+)/)?.[1] || input;
    const spinner = document.getElementById('sySmSpinner');
    const results = document.getElementById('sySmResults');
    results.hidden = true; results.innerHTML = ''; spinner.hidden = false;
    
    try {
        const playlists = await searchSpotify(`user:${userId}`, 'playlist', 50);
        if (playlists.playlists.length === 0) {
            results.innerHTML = `<p class="muted">No se encontraron playlists públicas para este usuario.</p>`;
        } else {
            sy_renderSpotifyPlaylistsSelection(userId, playlists.playlists);
        }
    } catch(e) {
        results.innerHTML = `<p class="muted">Error al buscar playlists: ${e.message}</p>`;
    } finally {
        spinner.hidden = true;
        results.hidden = false;
    }
}

function sy_renderSpotifyPlaylistsSelection(userId, list) {
    const results = document.getElementById('sySmResults');
    const checks = list.map(p => `
      <label class="sy-pl-row">
        <input type="checkbox" class="sy-pl-check" data-plid="${p.id}" data-plname="${p.title.replace(/"/g,'&quot;')}" data-cover="${p.thumb.replace(/"/g,'&quot;')}" checked>
        <img src="${p.thumb}" alt="">
        <div class="sy-pl-meta"><div class="sy-pl-name">${p.title}</div></div>
      </label>`).join('');
    results.innerHTML = `
        <div class="sy-pl-list">${checks}</div>
        <div class="sy-actions"><button id="syPlCancel" class="btn">Cerrar</button><button id="syPlImport" class="btn accent">Importar</button></div>`;
    results.querySelector('#syPlCancel').onclick = () => document.getElementById('sySpotifyModal').remove();
    results.querySelector('#syPlImport').onclick = async () => {
        const selected = Array.from(results.querySelectorAll('.sy-pl-check:checked'));
        const payload = selected.map(ch => ({ spotifyId: ch.dataset.plid, name: ch.dataset.plname, creator: userId, cover: ch.dataset.cover }));
        document.getElementById('sySpotifyModal').remove();
        for(const pl of payload) {
            await importPlaylistFromSearch({ id: pl.spotifyId, title: pl.name, author: pl.creator, thumb: pl.cover });
        }
    };
}
