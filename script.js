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
let communityPlaylists = [];
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let viewingPlaylistId = null;
let currentQueueTitle = "";

let isShuffle = false;
let repeatMode = 'none';

let ytPlayer = null, YT_READY = false, timer = null;
let db;
let resolverJobUnsubscribe = null;

const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };


const recommendedPlaylists = {
  p1: {
    ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZN1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3VdoetCQ', '6NXnxNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3VdoetCQ'],
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
'UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU', 'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y', '098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE', '3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss', '2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c'
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

/* ========= Lógica de Scraping de YouTube (Reemplazo de API) ========= */
const uniq = a => [...new Set(a)];

// <<-- CORREGIDO: Lógica de reintento con backoff exponencial para error 429
async function withRetry(fn, retries = 3, initialDelay = 500) {
    let delay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fn();
            // Si la respuesta es un objeto fetch Response, verificamos el status
            if (response instanceof Response) {
                if (response.ok) {
                    return response; // Éxito
                }
                if (response.status === 429) {
                    console.warn(`Scraping attempt ${i + 1} got 429. Retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2; // Duplica el delay para el siguiente reintento
                    continue; // Salta al siguiente ciclo del for
                }
                 // Otro tipo de error de HTTP
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Si no es un objeto Response, asumimos éxito si no lanza error
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

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view = $("#"+id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id!=="view-search") {
      updateHomeGridVisibility();
      $('#search-filters')?.classList.add('hide');
  } else {
      $('#search-filters')?.classList.remove('hide');
  }
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

/* ========= Búsqueda Mixta ========= */
let paging = { query:"", loading:false, hasMore:false };

function setupSearchFilters() {
    const view = $('#view-search');
    if (!view || $('#search-filters')) return;
    
    const filters = document.createElement('div');
    filters.id = 'search-filters';
    filters.className = 'search-filters-container hide';
    filters.innerHTML = `
        <button class="pill active" data-type="all">Todo</button>
        <button class="pill" data-type="video">Canciones</button>
        <button class="pill" data-type="playlist">Playlists</button>
    `;
    
    view.prepend(filters);

    filters.addEventListener('click', e => {
        const btn = e.target.closest('button.pill');
        if (!btn || btn.classList.contains('active')) return;
        
        $$('#search-filters .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSearchType = btn.dataset.type;
        
        if(paging.query) startSearch(paging.query);
    });
}

async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true, hasMore: false };
  items = [];
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando...</h3></div>`;
  updateHomeGridVisibility();
  $('#search-filters')?.classList.remove('hide');

  try {
    const promises = [];
    if (currentSearchType === 'all' || currentSearchType === 'video') {
        promises.push(scrapeYoutube(query, 30));
    }
    if (currentSearchType === 'all' || currentSearchType === 'playlist') {
        promises.push(searchSpotify(query, 'playlist', 20).then(r => r.playlists));
    }

    const results = await Promise.all(promises);
    if (searchAbort.signal.aborted) return;
    
    const combined = results.flat();
    
    combined.sort((a, b) => {
        const aIsPlaylist = a.type.includes('playlist');
        const bIsPlaylist = b.type.includes('playlist');
        if (aIsPlaylist && !bIsPlaylist) return -1;
        if (!aIsPlaylist && bIsPlaylist) return 1;
        return 0;
    });

    if (resultsEl) resultsEl.innerHTML = "";

    if (combined.length === 0) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron resultados.</p></div>`;
        return;
    }

    items = dedupeById(combined);
    appendResults(items);

  } catch (e) {
    console.error('Search failed:', e);
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda. Reintentá por favor.</p></div>`;
  } finally {
    paging.loading = false;
  }
}

function dedupeById(arr){
  const seen = new Set(items.map(i => i.id));
  return arr.filter(it=>{
    if(!it?.id || seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

/* ========= Render resultados ========= */
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
        if(it.source === 'spotify') item.classList.add("spotify-playlist-result-item");
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
        case 'youtube_video':
            playFromSearch(item.id, true);
            break;
        case 'spotify_track':
            playSpotifyTrack(item);
            break;
        case 'spotify_playlist':
            importPlaylistFromSearch(item);
            break;
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

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    
    let trackCount = playlist.trackCount || playlist.tracks?.length || playlist.spotifyTracks?.length || 0;
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
            viewingPlaylistId = null;
            renderQueue(playlist.data, playlist.title);
            switchView('view-player');
            playCurrent(true);
        } else {
             await showPlaylistInPlayer(playlist.id);
        }
    };
    container.appendChild(card);
}

// ... El resto del código (Favoritos, Playlists, UI, etc.) se mantiene igual
// ya que los cambios se centran en el sistema de importación (Resolver/Worker) ...
// Pegaré el resto del código sin modificar para mantener la integridad del archivo.

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

/* ========= Playlists (Firebase) ========= */
const LS_USER_PLAYLIST_IDS = "sy_user_playlist_ids_v1";
function getMyPlaylistIds() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]"); } catch { return []; } }
function addMyPlaylistId(id) { const ids=getMyPlaylistIds(); if(!ids.includes(id)){ ids.push(id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); } }
function removeMyPlaylistId(id) { let ids=getMyPlaylistIds(); ids=ids.filter(pid=>pid!==id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); }
function isMyPlaylist(id) { return getMyPlaylistIds().includes(id); }
async function handlePrivacyToggle(playlistId, isPublic) { try { const {doc,updateDoc}=window.firebase; await updateDoc(doc(db,"playlists",playlistId),{isPublic}); } catch(e){console.error("Error updating privacy:",e);} }

async function openPlaylistOptionsMenu(pl) {
  const isOwner = isMyPlaylist(pl.id);
  let actions = [];

  if (isOwner) {
      actions.push({ id: "rename", label: "Renombrar" });
      actions.push({ id: "delete", label: "Eliminar playlist", danger: true });
  }
  
  if (!isOwner && pl.isPublic) {
      actions.push({ id: "save_copy", label: "Guardar una copia" });
  }

  actions.push({ id: "cancel", label: "Cancelar", ghost: true });
  
  openActionSheet({
    title: pl.name,
    actions: actions,
    onAction: async (act) => {
      const { doc, updateDoc, deleteDoc, serverTimestamp } = window.firebase;
      
      if (act === "rename" && isOwner) {
        const plRef = doc(db, "playlists", pl.id);
        const newName = prompt("Nuevo nombre para la playlist:", pl.name);
        if (newName === null || newName.trim() === "") return;

        const newCreator = prompt("Nuevo nombre de creador (máx 20 caracteres):", pl.creator);
        if (newCreator === null || newCreator.trim() === "") return;

        try {
          await updateDoc(plRef, {
            name: newName.trim().substring(0, 50),
            creator: newCreator.trim().substring(0, 20),
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error renaming playlist:", e);
          showToast("No se pudo renombrar la playlist.", true);
        }
      }
      if (act === "delete" && isOwner) {
        openActionSheet({
            title: `¿Eliminar "${pl.name}"?`,
            actions: [
                {id: "confirm_delete", label: "Sí, eliminar", danger: true},
                {id: "cancel", label: "Cancelar", ghost: true}
            ],
            onAction: async (confirmAct) => {
                if(confirmAct === 'confirm_delete') {
                    try {
                        await deleteDoc(doc(db, "playlists", pl.id));
                        removeMyPlaylistId(pl.id);
                      } catch (e) {
                        console.error("Error deleting playlist:", e);
                        showToast("No se pudo eliminar la playlist.", true);
                      }
                }
            }
        });
      }
      if (act === "save_copy" && !isOwner) {
        savePlaylistCopy(pl);
      }
    }
  });
}

async function savePlaylistCopy(originalPlaylist) {
    let creator = localStorage.getItem('sy_creator_name');
    if (!creator) {
        creator = prompt("Para guardar una copia, ingresá tu nombre de creador:")?.trim();
        if (!creator) return;
        localStorage.setItem('sy_creator_name', creator);
    }
    showToast(`Guardando copia de "${originalPlaylist.name}"...`);
    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const newPlaylistData = {
            ...originalPlaylist,
            name: `${originalPlaylist.name} (Copia)`,
            creator: creator,
            isPublic: false,
            updatedAt: serverTimestamp(),
            originalOwnerId: originalPlaylist.ownerUserId || null,
            ownerUserId: 'current_user_id',
        };
        delete newPlaylistData.id;
        delete newPlaylistData.resolverJobId;
        
        const docRef = await addDoc(collection(db, "playlists"), newPlaylistData);
        addMyPlaylistId(docRef.id);
        showToast("Copia guardada en tus playlists.");
    } catch (e) {
        console.error("Error saving copy:", e);
        showToast("No se pudo guardar la copia.", true);
    }
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
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${pl.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
        card.querySelector('.pl-privacy-toggle input').addEventListener('change', (e) => { e.stopPropagation(); handlePrivacyToggle(pl.id, e.target.checked); });
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            await showPlaylistInPlayer(pl.id);
        });

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
        const { getFirestore, collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder' });
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
    
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

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
      if (!updatedTracks.some(t => t.id === track.id)) { updatedTracks.unshift(track); }
      
      const spotifyTracks = pl.spotifyTracks ? [...pl.spotifyTracks] : [];
      if (pl.source === 'spotify' && !spotifyTracks.some(t => t.id === track.originalId)) {
          spotifyTracks.unshift({ id: track.originalId || track.id, title: track.title, author: track.author, thumb: track.thumb, source: 'spotify' });
      }

      try {
        await updateDoc(plRef, { tracks: updatedTracks, spotifyTracks, updatedAt: serverTimestamp() });
        sheet.classList.remove("show");
      } catch(e) { console.error("Error adding song: ", e); showToast("No se pudo agregar la canción.", true); }
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
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [track], updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder' });
        addMyPlaylistId(docRef.id);
        $("#plNewNameFromSong").value = "";
        sheet.classList.remove("show");
    } catch (e) { console.error("Error creating playlist from song: ", e); showToast("Hubo un error al crear la playlist.", true); }
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
  updateAndroidNotification();
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
  } else if (['recommended', 'youtube_playlist'].includes(queueType)) {
    plName = currentQueueTitle;
  }

  $("#npSub") && ($("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—"));
}
function setQueue(srcArr, type, idx){
  let finalSrc = srcArr;
  if (isShuffle) {
    const currentItem = srcArr[idx];
    const others = srcArr.filter((item, index) => index !== idx);
    const shuffledOthers = others.sort(() => Math.random() - 0.5);
    finalSrc = [currentItem, ...shuffledOthers];
    idx = 0;
  }
  queue = finalSrc;
  queueType = type;
  qIdx = idx;
}
function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  if (!currentTrack || !currentTrack.id) {
    console.warn("Attempting to play invalid track, skipping to next.", currentTrack);
    next();
    return;
  }
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateUIOnTrackChange();
}
function playFromSearch(trackId, autoplay=false) {
    const videoItems = items.filter(it => it.source === 'youtube' && it.type === 'youtube_video');
    const videoIndex = videoItems.findIndex(v => v.id === trackId);

    if (videoIndex > -1) {
        setQueue(videoItems, "search", videoIndex);
        viewingPlaylistId = null;
        playCurrent(autoplay);
    }
}
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); viewingPlaylistId = null; playCurrent(autoplay);
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  
  const tracks = (pl.tracks || []).filter(t => t && t.id);
  if (tracks.length === 0) {
      showToast("Esta playlist no tiene canciones resueltas para reproducir.", true);
      return;
  }
  
  setQueue(tracks, "playlist", i);
  playCurrent(autoplay);
  renderPlaylists();
}
function playPlaylist(id){
  const pl = communityPlaylists.find(p=>p.id===id); if(!pl) return;
  const playableTracks = (pl.tracks || []).filter(t => t && t.id);
  if(!playableTracks.length) {
      showToast("Esta playlist no tiene canciones resueltas.", true);
      return;
  }
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
  
  const trackToRemove = pl.tracks.find(t => t.id === trackId);
  const updatedTracks = pl.tracks.filter(t => t.id !== trackId);
  const updatedSpotifyTracks = pl.spotifyTracks ? pl.spotifyTracks.filter(t => t.id !== trackToRemove?.originalId) : [];

  try { 
      await updateDoc(plRef, { 
          tracks: updatedTracks, 
          spotifyTracks: updatedSpotifyTracks,
          updatedAt: serverTimestamp() 
      }); 
  } catch (e) { 
      console.error("Error removing song: ", e); 
      showToast("No se pudo quitar la canción.", true); 
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
        navigator.mediaSession.setPositionState({ duration: dur||0, playbackRate: ytPlayer.getPlaybackRate(), position: cur||0 });
      }
    }catch(e) {}

    savePlayerState();
  }, 500);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ========= Shuffle / Repeat ========= */
function toggleShuffle() {
  isShuffle = !isShuffle;
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  if (currentTrack) {
    let currentQueueSource = queue || [];
    const originalIndex = currentQueueSource.findIndex(t => t.id === currentTrack.id);
    setQueue(currentQueueSource, queueType, Math.max(0, originalIndex));
    if ($("#queuePanel") && !$("#queuePanel").classList.contains('hide')) {
        renderQueue(queue, currentQueueTitle);
    }
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
    currentQueueTitle = title;
    
    if(!panel) return;
    panel.classList.remove("hide");
    
    panel.innerHTML = `
      <div class="section-head">
        <h3 id="queueTitle"></h3>
      </div>
      <ul id="queueList"></ul>
    `;

    const header = panel.querySelector(".section-head");
    const titleEl = header.querySelector('#queueTitle');
    if (titleEl) titleEl.textContent = title;
    
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
        <img class="thumb" src="${t.thumb}" alt="">
        ${isResolved ? `
        <button class="card-play" title="Play" aria-label="Play">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>` : `<div class="pending-indicator">Buscando...</div>`}
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${t.title}</span>
          ${isResolved ? `<span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>` : ''}
        </div>
        <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
      </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more") || e.target.closest(".card-play") || !isResolved) return;
            const resolvedQueue = queueItems.filter(item => item && item.id);
            const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
            if (resolvedIndex === -1) return;
            
            setQueue(resolvedQueue, queueType, resolvedIndex);
            playCurrent(true);
        };
        const playBtn = li.querySelector(".card-play");
        if(playBtn) {
            playBtn.onclick = (e) => {
                e.stopPropagation();
                 if(currentTrack?.id === t.id){ togglePlay(); return; }
                const resolvedQueue = queueItems.filter(item => item && item.id);
                const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
                if (resolvedIndex === -1) return;

                setQueue(resolvedQueue, queueType, resolvedIndex);
                playCurrent(true);
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

    if (pl.source === 'spotify' && pl.status !== 'resolved') {
        const tracksToShow = (pl.tracks?.length > 0 && pl.tracks.some(t => t)) ? pl.tracks.map((t, i) => t || { ...(pl.spotifyTracks[i] || {}), id: null, thumb: pl.spotifyTracks[i]?.thumb || pl.cover }) : (pl.spotifyTracks || []).map(st => ({...st, thumb: st.thumb || pl.cover, id: null}));
        renderQueue(tracksToShow, pl.name);
        
        if (pl.status !== 'resolving') {
            startResolverJob(pl.id);
        } else {
            console.log("Job is already running for this playlist. Attaching listener.");
            const { doc, onSnapshot } = window.firebase;
            if (!pl.resolverJobId) { console.error("Playlist is resolving but has no job ID"); return; }
            const jobRef = doc(db, "resolverJobs", pl.resolverJobId);
            if (resolverJobUnsubscribe) resolverJobUnsubscribe();
            resolverJobUnsubscribe = onSnapshot(jobRef, (doc) => {
                if (!doc.exists()) { hideResolverModal(); return; }
                const job = {id: doc.id, ...doc.data()};
                updateResolverModal(job);
                if (['canceled', 'done', 'error'].includes(job.status)) {
                    hideResolverModal();
                }
            });
        }
        return;
    }

    const tracksToPlay = (pl.tracks || []).filter(t => t && t.id);
    if (!tracksToPlay || tracksToPlay.length === 0) {
        if (pl.source === 'spotify') {
             showToast(`Playlist "${pl.name}" aún no tiene canciones importadas.`, true);
             startResolverJob(pl.id);
        } else {
             showToast(`La playlist "${pl.name}" está vacía.`, true);
        }
        return;
    }

    setQueue(tracksToPlay, 'playlist', 0);
    renderQueue(tracksToPlay, pl.name);
    playCurrent(true);
}

function hideQueuePanel(){ 
    $("#queuePanel")?.classList.add("hide"); 
    if ($("#queueList")) $("#queueList").innerHTML=""; 
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
    viewingPlaylistId=null; 
    renderPlaylists(); 
}

/* ========= Menú tres puntitos global ========= */
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".icon-btn.more");
    if (!btn) return;

    const itemEl = btn.closest(".result-item, .fav-item, .queue-item");
    if (!itemEl) return;

    let track;
    const trackId = itemEl.dataset.trackId;

    if (itemEl.classList.contains("result-item")) {
        const itemId = itemEl.dataset.itemId;
        const sourceTrack = items.find(x => x.id === itemId);
        if (!sourceTrack || sourceTrack.type.includes('playlist')) return;

        if (sourceTrack.type === 'spotify_track') {
            const ytEquivalent = await findYoutubeEquivalent(sourceTrack);
            if (!ytEquivalent) {
                showToast("No se pudo encontrar esta canción en YouTube para agregarla.", true);
                return;
            }
            track = ytEquivalent;
        } else {
            track = sourceTrack;
        }
    } else if (itemEl.classList.contains("fav-item")) {
        track = favs.find(f => f.id === trackId);
    } else if (itemEl.classList.contains("queue-item")) {
        track = queue.find(t => t.id === trackId);
    }

    if (!track) return;

    const actions = [
        { id: "fav", label: isFav(track.id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
        { id: "pl", label: "Agregar a playlist" }
    ];

    if (itemEl.classList.contains("queue-item") && queueType === 'playlist' && viewingPlaylistId && isMyPlaylist(viewingPlaylistId)) {
        actions.push({ id: "delete", label: "Eliminar de esta playlist", danger: true });
    }

    actions.push({ id: "cancel", label: "Cancelar", ghost: true });

    openActionSheet({
        title: track.title,
        actions: actions,
        onAction: (act) => {
            if (act === "fav") toggleFav(track);
            if (act === "pl") openPlaylistSheet(track);
            if (act === "delete") {
                removeFromPlaylist(viewingPlaylistId, track.id);
            }
        }
    });
});

/* ========= Indicadores ========= */
function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    let trackId = el.dataset.trackId;
    const isCurrentTrack = trackId === curId;
    el.classList.toggle("is-playing", isCurrentTrack);
    const cardPlay = el.querySelector(".card-play");
    if (cardPlay) cardPlay.classList.toggle("playing", isPlaying && isCurrentTrack);
  });

  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}

/* ========= YouTube API & Media Session ========= */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300, height:150, videoId:"",
    playerVars:{autoplay:0, controls:0, rel:0, playsinline:1},
    events:{
      onReady:()=>{ YT_READY=true; window.dispatchEvent(new Event('yt-ready')); },
      onStateChange:(e)=>{
        const st = e.data;
        if(st===YT.PlayerState.ENDED){ next(); }
        try{ if('mediaSession' in navigator){ navigator.mediaSession.playbackState = (st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING) ? 'playing' : (st===YT.PlayerState.PAUSED ? 'paused' : 'none'); } }catch{}
        refreshIndicators();
      }
    }
  });
};
let mediaSessionHandlersSet = false;
function updateMediaSession(track){
  if(!('mediaSession' in navigator)||!track)return;
  navigator.mediaSession.metadata=new MediaMetadata({title:track.title||'Reproduciendo',artist:cleanAuthor(track.author)||'—',album:queueType==='playlist'?(communityPlaylists.find(p=>p.id===viewingPlaylistId)?.name||''):'',artwork:[{src:track.thumb,sizes:'512x512',type:'image/jpeg'}]});
  if(!mediaSessionHandlersSet){
    mediaSessionHandlersSet=true;
    const s=fn=>()=>{try{fn()}catch(e){console.error("Media Session Action Error:", e)}};
    navigator.mediaSession.setActionHandler('play',s(()=>togglePlay()));
    navigator.mediaSession.setActionHandler('pause',s(()=>togglePlay()));
    navigator.mediaSession.setActionHandler('previoustrack',s(()=>prev()));
    navigator.mediaSession.setActionHandler('nexttrack',s(()=>next()));
    navigator.mediaSession.setActionHandler('seekto',s(d=>{if(YT_READY&&d&&typeof d.seekTime==='number')ytPlayer.seekTo(d.seekTime,true)}));
  }
}

/* ========= Init ========= */
async function boot(){
  initTheme();
  setupSearchFilters();

  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, runTransaction, FieldValue } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  
  const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
  window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, runTransaction, FieldValue };
  
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    const oldPlaylists = new Map(communityPlaylists.map(p => [p.id, p]));
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // <<-- CORREGIDO: Lógica de actualización en tiempo real simplificada y robustecida
    const newPl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    if (newPl) {
        const oldPl = oldPlaylists.get(newPl.id);
        const playlistWasUpdated = !oldPl || newPl.updatedAt?.toMillis() > oldPl.updatedAt?.toMillis();

        if (playlistWasUpdated) {
            const tracksToShow = (newPl.tracks?.length > 0) 
                ? newPl.tracks.map((t, i) => t || { ...(newPl.spotifyTracks?.[i] || {}), id: null }) 
                : (newPl.spotifyTracks || []).map(st => ({...st, id: null}));
            
            renderQueue(tracksToShow, newPl.name);
            
            const currentTrackId = currentTrack?.id;
            if (currentTrackId && queueType === 'playlist') {
                const newQueue = (tracksToShow || []).filter(t => t && t.id);
                const newIdx = newQueue.findIndex(t => t.id === currentTrackId);
                
                if (newIdx !== -1) {
                    queue = newQueue;
                    qIdx = newIdx;
                }
            }
        }
    }
    renderPlaylists(); 
    renderAllHomePlaylists();
  });

  const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
  const results = await Promise.all(fetchPromises);
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });

  renderAllHomePlaylists();
  loadFavs();
  renderFavs();
  loadYTApi();
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
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
    if (trackCache.has(cacheKey)) {
        return { videoId: trackCache.get(cacheKey) };
    }

    const query = `${track.author} ${track.title}`;
    try {
        const results = await scrapeYoutube(query, 1);
        if (results && results[0] && results[0].id) {
            const videoId = results[0].id;
            trackCache.set(cacheKey, videoId);
            return { videoId };
        }
        return { error: "No video found via scraping" };
    } catch (e) {
        return { error: e.message };
    }
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
        await setDoc(jobRef, {
            playlistRef: plRef.path,
            status: 'running',
            total: (playlist.spotifyTracks || []).length,
            nextIndex: 0,
            errors: [],
            lastUpdated: serverTimestamp()
        });
    } else {
        await updateDoc(plRef, { status: 'resolving' });
        await updateDoc(jobRef, { status: 'running', lastUpdated: serverTimestamp(), nextIndex: playlist.resolvedCount || 0 });
    }
    
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (doc) => {
        if (!doc.exists()) { hideResolverModal(); return; }
        updateResolverModal({id: doc.id, ...doc.data()});
        if (['canceled', 'done', 'error'].includes(doc.data().status)) {
            hideResolverModal();
        }
    });

    // <<-- CORREGIDO: Workers más controlados
    const CONCURRENT_WORKERS = 3;
    for (let i = 0; i < CONCURRENT_WORKERS; i++) {
        setTimeout(() => worker(playlistId, jobRef.id), i * 250); // Staggered start
    }
}

async function worker(playlistId, jobId) {
    const { doc, getDoc, updateDoc, runTransaction, FieldValue, serverTimestamp } = window.firebase;
    const jobRef = doc(db, "resolverJobs", jobId);
    const plRef = doc(db, "playlists", playlistId);

    while (true) {
        let currentIndex;
        try {
            await new Promise(res => setTimeout(res, 500 + Math.random() * 500)); // Pacing

            const nextIndex = await runTransaction(db, async (transaction) => {
                const jobDoc = await transaction.get(jobRef);
                if (!jobDoc.exists() || jobDoc.data().status !== 'running') return -1;
                
                const current = jobDoc.data().nextIndex;
                if (current >= jobDoc.data().total) return -1;

                transaction.update(jobRef, { nextIndex: current + 1 });
                return current;
            });
            
            if (nextIndex === -1) break; // Termina el worker
            currentIndex = nextIndex;

            const plDoc = await getDoc(plRef);
            if (!plDoc.exists()) break;
            const trackToProcess = plDoc.data().spotifyTracks[currentIndex];
            if (!trackToProcess) continue;

            const result = await resolveTrack(trackToProcess);
            
            const updatePayload = { updatedAt: serverTimestamp() }; // <<-- CORREGIDO: Siempre actualiza el timestamp
            if (result.videoId) {
                updatePayload[`tracks.${currentIndex}`] = { ...trackToProcess, id: result.videoId, source: 'youtube', originalId: trackToProcess.spotifyId };
                updatePayload.resolvedCount = FieldValue.increment(1);
            } else {
                console.warn(`Failed to resolve track ${currentIndex}: ${result.error}`);
            }
            await updateDoc(plRef, updatePayload);

        } catch (e) {
            console.error(`Worker error at index ${currentIndex}:`, e);
            if(e.message.includes("Job stopped") || e.message.includes("Job finished")) break;
        }
    }

    // Lógica de finalización del último worker
    const finalJobDoc = await getDoc(jobRef);
    if(finalJobDoc.exists() && finalJobDoc.data().nextIndex >= finalJobDoc.data().total) {
        if(finalJobDoc.data().status === 'running') {
            await updateDoc(jobRef, { status: 'done' });
            const finalPl = (await getDoc(plRef)).data();
            const finalStatus = finalPl.resolvedCount === finalPl.trackCount ? 'resolved' : 'partial';
            await updateDoc(plRef, { status: finalStatus });
        }
    }
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

/* ========== Resolver Mini Modal ========== */
function updateResolverModal(job) {
    let modal = document.getElementById('resolver-modal');
    if (!job || !['running', 'queued'].includes(job.status)) {
        hideResolverModal();
        return;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resolver-modal';
        modal.className = 'sy-modal-resolver';
        document.body.appendChild(modal);
        modal.innerHTML = `
            <div class="resolver-content">
                <p>Asignando URLs...</p>
                <div class="resolver-progress-bar">
                    <div class="resolver-progress"></div>
                </div>
                <span class="resolver-counter">0 / 0</span>
                <button class="resolver-cancel">Cancelar</button>
            </div>
        `;
        modal.querySelector('.resolver-cancel').onclick = cancelResolverJob;
        setTimeout(()=> modal.classList.add('show'), 10);
    }
    
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    const resolved = pl?.resolvedCount || 0;
    const total = job.total || pl?.trackCount || 0;

    if (total === 0) return;

    const progress = total > 0 ? (resolved / total) * 100 : 0;
    
    modal.querySelector('.resolver-progress').style.width = `${progress}%`;
    modal.querySelector('.resolver-counter').textContent = `${resolved} / ${total}`;
}

function hideResolverModal() {
    const modal = document.getElementById('resolver-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
}

/* ========== Spotify Import UI & Logic ========== */
// (El código de la interfaz de importación se mantiene igual)

async function importPlaylistFromSearch(playlistItem) {
    showToast(`Importando "${playlistItem.title}"...`);
    const { collection, query, where, getDocs, addDoc, serverTimestamp } = window.firebase;
    const playlistsCol = collection(db, 'playlists');

    const q = query(playlistsCol, where("spotifyId", "==", playlistItem.id), where("ownerUserId", "==", "current_user_id_placeholder"));
    const existingSnapshot = await getDocs(q);

    if (!existingSnapshot.empty) {
        const existingId = existingSnapshot.docs[0].id;
        showToast("Playlist encontrada en tu librería.");
        await showPlaylistInPlayer(existingId);
    } else {
        try {
            const spotifyTracks = await fetchAllSpotifyPlaylistTracks(playlistItem.id);
            if (spotifyTracks.length === 0) {
                showToast("Esta playlist de Spotify está vacía o es privada.", true);
                return;
            }

            const newPlaylist = {
                name: playlistItem.title,
                creator: playlistItem.author,
                isPublic: false,
                cover: playlistItem.thumb || null,
                source: 'spotify',
                spotifyId: playlistItem.id,
                spotifyTracks,
                trackCount: spotifyTracks.length,
                tracks: Array(spotifyTracks.length).fill(null),
                status: 'unresolved',
                resolvedCount: 0,
                updatedAt: serverTimestamp(),
                ownerUserId: "current_user_id_placeholder"
            };

            const docRef = await addDoc(playlistsCol, newPlaylist);
            addMyPlaylistId(docRef.id);
            showToast("Playlist agregada. Iniciando asignación de URLs...");
            await showPlaylistInPlayer(docRef.id);

        } catch (e) {
            console.error("Error al importar playlist desde la búsqueda:", e);
            showToast("No se pudo importar la playlist.", true);
        }
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
            const tracks = data.items.map(({ track }) => track ? {
                spotifyId: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean);
            allTracks = allTracks.concat(tracks);
            url = data.next;
        } catch (e) {
            console.error("Error fetching Spotify playlist tracks:", e);
            url = null;
        }
    }
    return allTracks;
}

// El resto de la UI de importación y el setup...
document.addEventListener('DOMContentLoaded', sy_initSpotifyImportUI);
function sy_initSpotifyImportUI() {
    const btn = document.createElement('button');
    // ... (código de la UI de importación se mantiene)
}
