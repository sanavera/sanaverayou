/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const normalizeText = t => (t || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ').trim();
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
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;
let db; // Instancia de Firestore
let videoIdCache = new Map(); // Cache en memoria para resoluciones de scraping

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

// --- Control de scraping ---
const scrapedVideoIds = new Set();
let searchScrapeGenerator = null;

// --- Control de importación de Spotify ---
let importController = null;

// --- Listas de reproducción recomendadas (precargadas) ---
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
    'UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU', 'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y', '098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE', '3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss', '2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c'
    ],
    title: 'Cumbias del Recuerdo',
    creator: 'Luis Sanavera',
    data: [],
    isRecommended: true
  }
};

/* ========= Persistencia de Estado ========= */
const PLAYER_STATE_KEY = "sy_player_state_v3";
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

    if (currentTrack && !currentTrack.unresolved) {
        ytPlayer.loadVideoById({
          videoId: currentTrack.id,
          startSeconds: state.currentTime || 0,
          suggestedQuality: "auto"
        });
        ytPlayer.setVolume(100);

        if (state.wasPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    }

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
        if (!response.ok) throw new Error('Falló la autenticación con Spotify');
        const data = await response.json();
        spotifyToken = {
            value: data.access_token,
            expires: Date.now() + (data.expires_in * 1000) - 60000
        };
        return spotifyToken.value;
    } catch (e) {
        console.error("Error obteniendo token de Spotify:", e);
        return null;
    }
}

async function searchSpotifyPlaylists(query, limit = 20) {
    const token = await getSpotifyToken();
    if (!token) return [];

    try {
        const url = new URL('https://api.spotify.com/v1/search');
        url.searchParams.append('q', query);
        url.searchParams.append('type', 'playlist');
        url.searchParams.append('limit', limit);
        url.searchParams.append('market', 'AR');

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('No se pudo buscar en Spotify');
        const data = await response.json();

        return (data.playlists?.items || []).map(item => ({
            source: 'spotify',
            type: 'spotify_playlist',
            id: item.id,
            title: item.name,
            author: item.owner.display_name,
            thumb: item.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png',
            total: item.tracks.total
        }));

    } catch (e) {
        console.error("Error en la búsqueda de playlists de Spotify:", e);
        return [];
    }
}

async function fetchSpotifyPlaylist(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return null;
    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('No se pudo obtener la playlist de Spotify');
        const data = await response.json();

        return {
            id: data.id,
            name: data.name,
            author: data.owner.display_name,
            thumb: data.images?.[0]?.url || '',
            tracks: data.tracks.items.map(({track}) => track ? {
                key: `${normalizeText(track.artists.map(a => a.name).join(', '))} | ${normalizeText(track.name)}`,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || '',
                id: null, // videoId starts as null
                unresolved: true
            } : null).filter(Boolean)
        };
    } catch (e) {
        console.error("Error al buscar playlist en Spotify:", e);
        return null;
    }
}

/* ========= YouTube Scraping ========= */
async function fetchScrape(query) {
    const urls = [
        `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;

            const html = await response.text();
            const match = html.match(/var ytInitialData = (.*?);<\/script>/s);

            if (match && match[1]) {
                const data = JSON.parse(match[1]);
                const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

                if (contents && Array.isArray(contents)) {
                    const videos = contents
                        .map(item => item.videoRenderer)
                        .filter(Boolean)
                        .map(v => ({
                            id: v?.videoId,
                            title: v?.title?.runs?.[0]?.text,
                            author: v?.longBylineText?.runs?.[0]?.text || v?.shortBylineText?.runs?.[0]?.text,
                            thumb: `https://i.ytimg.com/vi/${v?.videoId}/hqdefault.jpg`,
                            context: JSON.stringify(v).toLowerCase()
                        }))
                        .filter(v => v.id && v.title && v.author);

                    if (videos.length > 0) {
                        return scoreAndSortScraped(videos);
                    }
                }
            }
        } catch (error) {
            console.warn(`Scraping failed for ${url}:`, error);
        }
    }

    console.error(`Scraping failed for all URLs for query: "${query}"`);
    return [];
}

function scoreAndSortScraped(videos) {
    const scored = videos.map(video => {
        let score = 0;
        const ctx = video.context;
        const title = video.title.toLowerCase();

        if (ctx.includes('topic')) score += 10;
        if (ctx.includes('vevo')) score += 8;
        if (ctx.includes('provided to youtube by')) score += 12;
        if (title.includes('audio')) score += 5;

        if (title.includes('karaoke')) score -= 20;
        if (title.includes('cover')) score -= 15;
        if (title.includes('lyrics')) score -= 10;
        if (title.includes('live') || title.includes('vivo')) score -= 10;
        if (title.includes('tutorial')) score -= 30;
        if (title.includes('reaccion')) score -= 30;

        video.score = score;
        return video;
    });
    return scored.sort((a, b) => b.score - a.score);
}

async function scrapeVideoDetails(videoId) {
    try {
        const url = `https://r.jina.ai/https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const html = await response.text();
        const match = html.match(/var ytInitialPlayerResponse = ({.*?});/s);
        if (match && match[1]) {
            const data = JSON.parse(match[1]);
            const details = data?.videoDetails;
            if (details) {
                return {
                    id: details.videoId,
                    title: cleanTitle(details.title),
                    author: cleanAuthor(details.author),
                    thumb: details.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${details.videoId}/hqdefault.jpg`,
                    type: 'youtube_video',
                    source: 'youtube'
                };
            }
        }
        return null;
    } catch (e) {
        console.error(`Error scraping details for ${videoId}:`, e);
        return null;
    }
}


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
const searchModeSwitch = $("#searchModeSwitch");

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

    const searchMode = searchModeSwitch.checked ? 'playlists' : 'songs';
    
    closeSearch();
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    switchView("view-search");
    await startSearch(q, searchMode);
});

/* ========= Lógica de Búsqueda y Scroll Infinito ========= */
const BATCH_SIZE = 15;

async function* createSearchGenerator(query) {
    const variants = [
        query,
        `${query} topic`,
        `${query} audio`,
        `${query} "provided to youtube by"`
    ];
    for (const variant of variants) {
        try {
            const results = await fetchScrape(variant);
            const newVideos = results.filter(v => !scrapedVideoIds.has(v.id));
            newVideos.forEach(v => scrapedVideoIds.add(v.id));
            if (newVideos.length > 0) {
                yield newVideos.map(v => ({...v, type: 'youtube_video', source: 'youtube'}));
            }
        } catch (e) {
            console.error(`Error en scraping para variante "${variant}":`, e);
        }
    }
}

async function startSearch(query, mode = 'songs') {
    items = [];
    scrapedVideoIds.clear();
    searchScrapeGenerator = null;
    const resultsEl = $("#results");
    const sentinel = $("#sentinel");
    if (sentinel) sentinel.innerHTML = '';
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando...</h3></div>`;
    updateHomeGridVisibility();

    try {
        if (mode === 'songs') {
            searchScrapeGenerator = createSearchGenerator(query);
            await loadNextPage();
        } else {
            const spotifyPlaylists = await searchSpotifyPlaylists(query, 40);
            if (resultsEl) resultsEl.innerHTML = "";
            if (spotifyPlaylists.length === 0) {
                resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron playlists.</p></div>`;
                return;
            }
            items = spotifyPlaylists;
            appendResults(items);
        }
    } catch (e) {
        console.error('Search failed:', e);
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda.</p></div>`;
    }
}

async function loadNextPage(){
  if (!searchScrapeGenerator) {
      if (items.length > 0) { // Only show if there were prior results
        const sentinel = $("#sentinel");
        if (sentinel) sentinel.innerHTML = '<h4>No hay más resultados</h4>';
      }
      return;
  }

  const resultsEl = $("#results");
  if (items.length === 0) resultsEl.innerHTML = "";
  
  const { value: newItems, done } = await searchScrapeGenerator.next();

  if (done || !newItems || newItems.length === 0) {
    if (items.length === 0) {
        resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron resultados.</p></div>`;
    }
    searchScrapeGenerator = null;
    const sentinel = $("#sentinel");
    if (sentinel && items.length > 0) sentinel.innerHTML = '<h4>No hay más resultados</h4>';
    return;
  }
  
  const uniqueNewItems = newItems.filter(it => !items.some(existing => existing.id === it.id));
  appendResults(uniqueNewItems);
  items.push(...uniqueNewItems);
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

    if (it.source === 'spotify') {
      logo = spotifyLogoSvg();
    } else {
      logo = youtubeLogoSvg();
    }

    if (it.type.includes('playlist')) {
        item.classList.add("playlist-result-item");
        indicator = `<div class="playlist-indicator">LISTA${it.total ? ` • ${it.total}` : ''}</div>`;
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
        case 'spotify_playlist':
            handlePlaylistResultClick(item);
            break;
    }
}

async function handlePlaylistResultClick(playlistData) {
    const resultsContainer = $("#results");
    resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Importando desde Spotify...</h3><p>${playlistData.title}</p></div>`;
    updateHomeGridVisibility();

    try {
        const fullPlaylist = await fetchSpotifyPlaylist(playlistData.id);
        if (!fullPlaylist || fullPlaylist.tracks.length === 0) {
            throw new Error("No se pudo obtener la playlist o está vacía.");
        }
        
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), {
            name: fullPlaylist.name,
            creator: fullPlaylist.author,
            isPublic: false,
            cover: fullPlaylist.thumb,
            source: 'spotify',
            spotifyId: fullPlaylist.id,
            tracks: fullPlaylist.tracks,
            updatedAt: serverTimestamp(),
            status: 'pending'
        });
        addMyPlaylistId(docRef.id);
        
        await showPlaylistInPlayer(docRef.id);

    } catch (error) {
        console.error("Error al importar desde Spotify:", error);
        resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Error al importar</h3><p>${error.message}</p></div>`;
    }
}

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;

    const isRec = !!playlist.isRecommended;
    const tracks = isRec ? playlist.data : (playlist.tracks || []);
    let trackCount = tracks.length;
    if (trackCount === 0) return;

    let covers = tracks.slice(0, 4).map(track => track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) {
        covers.push(playlist.cover);
    }
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    
    const logo = isRec ? youtubeLogoSvg() : (playlist.source === 'spotify' ? spotifyLogoSvg() : youtubeLogoSvg());
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id || playlist.title; // Rec playlists don't have an ID
    card.innerHTML = `
        <div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
        <div class="playlist-meta">
            <h4 class="playlist-title">${playlist.title || playlist.name}</h4>
            <div class="creator-line">${logo}<span>Creador: ${playlist.creator}</span></div>
        </div>`;
    card.onclick = async () => {
        if (isRec) {
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


function updateHomeGridVisibility(){
  const home = $("#homeSection"); if(!home) return;
  const shouldShow = (items.length===0 && !$(".loading-indicator"));
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

/* ========= Playlists (Firebase) ========= */
const LS_USER_PLAYLIST_IDS = "sy_user_playlist_ids_v1";
function getMyPlaylistIds() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]"); } catch { return []; } }
function addMyPlaylistId(id) { const ids=getMyPlaylistIds(); if(!ids.includes(id)){ ids.push(id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); } }
function removeMyPlaylistId(id) { let ids=getMyPlaylistIds(); ids=ids.filter(pid=>pid!==id); localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(ids)); }
function isMyPlaylist(id) { return getMyPlaylistIds().includes(id); }
async function handlePrivacyToggle(playlistId, isPublic) { try { const {doc,updateDoc}=window.firebase; await updateDoc(doc(db,"playlists",playlistId),{isPublic}); } catch(e){console.error("Error al actualizar privacidad:",e);} }

async function openPlaylistOptionsMenu(pl) {
  openActionSheet({
    title: pl.name,
    actions: [
      { id: "rename", label: "Renombrar" },
      { id: "delete", label: "Eliminar playlist", danger: true },
      { id: "cancel", label: "Cancelar", ghost: true }
    ],
    onAction: async (act) => {
      const { doc, updateDoc, deleteDoc, serverTimestamp } = window.firebase;
      const plRef = doc(db, "playlists", pl.id);

      if (act === "rename") {
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
          console.error("Error al renombrar playlist:", e);
          showToast("No se pudo renombrar la playlist.", "error");
        }
      }
      if (act === "delete") {
        openActionSheet({
            title: `¿Eliminar "${pl.name}"?`,
            actions: [
                {id: "confirm_delete", label: "Sí, eliminar", danger: true},
                {id: "cancel", label: "Cancelar", ghost: true}
            ],
            onAction: async (confirmAct) => {
                if(confirmAct === 'confirm_delete') {
                    try {
                        await deleteDoc(plRef);
                        removeMyPlaylistId(pl.id);
                        showToast(`Playlist "${pl.name}" eliminada.`);
                      } catch (e) {
                        console.error("Error al eliminar playlist:", e);
                        showToast("No se pudo eliminar la playlist.", "error");
                      }
                }
            }
        });
      }
    }
  });
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
        const cover = pl.cover || pl.tracks?.[0]?.thumb || "https://i.imgur.com/gCa3j5g.png";

        let trackCount = pl.tracks?.length || 0;

        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${trackCount} temas</div>
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

        card.querySelector(".more").addEventListener("click", (e) => {
            e.stopPropagation();
            openPlaylistOptionsMenu(pl);
        });

        card.querySelector('.pl-privacy-toggle input').addEventListener('change', (e) => {
            handlePrivacyToggle(pl.id, e.target.checked);
        });

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
    if (!name || !creator) { showToast("Por favor, completa nombre de playlist y creador.", "error"); return; }
    try {
        const { getFirestore, collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        $("#newPlName").value = ""; $("#newPlCreator").value = ""; $("#createPlaylistSheet").classList.remove("show");
        showToast("Playlist creada.");
    } catch (e) { console.error("Error creando playlist: ", e); showToast("Hubo un error al crear la playlist.", "error"); }
};

/* ========= Sheets & Toasts ========= */
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
      try {
        await updateDoc(plRef, { tracks: updatedTracks, updatedAt: serverTimestamp() });
        sheet.classList.remove("show");
        showToast(`Agregado a "${pl.name}"`);
      } catch(e) { console.error("Error agregando canción: ", e); showToast("No se pudo agregar la canción.", "error"); }
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
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [track], updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        $("#plNewNameFromSong").value = "";
        sheet.classList.remove("show");
        showToast(`Playlist "${name}" creada.`);
    } catch (e) { console.error("Error creando playlist desde canción: ", e); showToast("Hubo un error.", "error"); }
  };

  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

function showToast(message, type = 'info', duration = 3000) {
    const container = $('#toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, duration);
    }, 10);
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
  } else if (queueType === 'search') {
    plName = "Resultados de búsqueda";
  } else if (queueType === 'recommended') {
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

  if (currentTrack.unresolved || !currentTrack.id) {
    ytPlayer.stopVideo();
    showToast(`"${currentTrack.title}" no se pudo encontrar.`, 'error');
  } else {
    ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
    if(autoplay) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
  }
  startTimer();
  updateUIOnTrackChange();
}
function playFromSearch(trackId, autoplay=false) {
    const videoIndex = items.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(items, "search", videoIndex);
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

async function removeFromPlaylist(plId, trackKey){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  const { doc, updateDoc, serverTimestamp } = window.firebase;
  const plRef = doc(db, "playlists", plId);
  const updatedTracks = pl.tracks.filter(t => (t.key || t.id) !== trackKey);
  try { await updateDoc(plRef, { tracks: updatedTracks, updatedAt: serverTimestamp() }); } catch (e) { console.error("Error quitando canción: ", e); showToast("No se pudo quitar la canción.", "error"); }
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
    const originalIndex = currentQueueSource.findIndex(t => (t.id || t.key) === (currentTrack.id || currentTrack.key));
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

    const titleEl = panel.querySelector('#queueTitle');
    if (titleEl) titleEl.textContent = title;

    const ul = $("#queueList");
    if (!ul) return;
    ul.innerHTML = "";

    const isUserPlaylist = queueType === 'playlist';
    if (!isUserPlaylist) viewingPlaylistId = null;

    (queueItems || []).forEach((t, i) => {
        const li = document.createElement("li");
        li.className = "queue-item";
        li.dataset.trackId = t.id || t.key;
        if(t.unresolved) li.classList.add('unresolved');
        li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <button class="card-play" title="Play" aria-label="Play" ${t.unresolved ? 'disabled':''}>
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
        ${t.unresolved ? '<span class="unresolved-tag">Sin resolver</span>' : `<button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`}
      </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more") || e.target.closest(".card-play") || t.unresolved) return;
            qIdx = i;
            setQueue(queueItems, queueType, i);
            playCurrent(true);
        };
        li.querySelector(".card-play").onclick = (e) => {
            e.stopPropagation();
            if(t.unresolved) return;
            qIdx = i;
            setQueue(queueItems, queueType, i);
            playCurrent(true);
        };
        ul.appendChild(li);
    });
    refreshIndicators();
}

async function resolveSingleTrack(track) {
    const trackKey = track.key;
    if (videoIdCache.has(trackKey)) {
        return { ...track, id: videoIdCache.get(trackKey), unresolved: false };
    }
    const query = `${track.author} ${track.title}`;
    const results = await fetchScrape(query);
    if (results.length > 0) {
        const bestResult = results[0];
        videoIdCache.set(trackKey, bestResult.id);
        return { ...track, id: bestResult.id, unresolved: false };
    }
    return track;
}

/* ========= Lógica de Importación y Resolución de Playlists de Spotify ========= */
async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;

    switchView('view-player');
    
    if (pl.source === 'spotify' && (pl.status === 'pending' || pl.status === 'partial')) {
        await resolveSpotifyPlaylist(plId);
    } else {
        viewingPlaylistId = pl.id;
        setQueue(pl.tracks, 'playlist', 0);
        renderQueue(pl.tracks, pl.name);
        playCurrent(true);
    }
}

async function resolveSpotifyPlaylist(playlistId) {
    if (importController && importController.playlistId === playlistId) return;

    const abortController = new AbortController();
    importController = { playlistId, abort: () => abortController.abort() };
    
    const { doc, updateDoc, serverTimestamp } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    let playlistData = communityPlaylists.find(p => p.id === playlistId);
    
    const progressToastId = `progress-${playlistId}`;
    showProgressToast(`Resolviendo "${playlistData.name}"...`, 0, playlistData.tracks.length, progressToastId);
    
    try {
        await updateDoc(plRef, { status: 'resolving' });
        
        let tracks = playlistData.tracks;
        let startIndex = playlistData.nextIndex || 0;
        let resolvedCount = playlistData.resolvedCount || 0;

        for (let i = startIndex; i < tracks.length; i++) {
            if (abortController.signal.aborted) throw new Error('cancelled');

            const track = tracks[i];
            if (!track.unresolved) {
                if (i < startIndex) resolvedCount++; // Recount already resolved ones
                continue;
            }

            const resolvedTrack = await resolveSingleTrack(track);
            tracks[i] = resolvedTrack;
            
            if (!resolvedTrack.unresolved) {
                resolvedCount++;
            }
            
            if (i % 3 === 0 || i === tracks.length - 1) {
                await updateDoc(plRef, { tracks, nextIndex: i + 1, resolvedCount });
            }
            
            updateProgressToast(resolvedCount, tracks.length, progressToastId);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        const finalStatus = resolvedCount === tracks.length ? 'resolved' : 'partial';
        await updateDoc(plRef, { status: finalStatus, nextIndex: null, updatedAt: serverTimestamp() });
        
        const message = finalStatus === 'resolved' ? '¡Lista resuelta!' : 'Resolución parcial completada.';
        updateProgressToast(resolvedCount, tracks.length, progressToastId, true, message);

    } catch (error) {
        if (error.message === 'cancelled') {
            showToast('Resolución cancelada.');
            await updateDoc(plRef, { status: 'partial' });
        } else {
            console.error("Error resolviendo playlist:", error);
            showToast('Error al resolver la playlist.', 'error');
            await updateDoc(plRef, { status: 'partial' });
        }
    } finally {
        importController = null;
        setTimeout(() => removeProgressToast(progressToastId), 3000);
    }
}

function showProgressToast(message, current, total, id) {
    const container = $('#toast-container');
    if (!container) return;
    let toast = document.getElementById(id);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = id;
        toast.className = 'toast toast-progress show';
        container.appendChild(toast);
    }
    toast.innerHTML = `
        <div class="progress-message">${message}</div>
        <div class="progress-bar">
            <div class="progress-bar-inner" style="width: ${total > 0 ? (current/total*100) : 0}%;"></div>
        </div>
        <div class="progress-label">${current} / ${total}</div>
        <button class="progress-cancel">&times;</button>
    `;
    toast.querySelector('.progress-cancel').onclick = () => {
        if (importController) importController.abort();
    };
}
function updateProgressToast(current, total, id, done = false, message = '') {
    const toast = document.getElementById(id);
    if (!toast) return;
    if (message) toast.querySelector('.progress-message').textContent = message;
    toast.querySelector('.progress-bar-inner').style.width = `${total > 0 ? (current/total*100) : 0}%`;
    toast.querySelector('.progress-label').textContent = `${current} / ${total}`;
    if(done) toast.querySelector('.progress-cancel').style.display = 'none';
}
function removeProgressToast(id) {
    const toast = document.getElementById(id);
    if (toast) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }
}

function hideQueuePanel(){ $("#queuePanel")?.classList.add("hide"); $("#queueList") && ($("#queueList").innerHTML=""); viewingPlaylistId=null; renderPlaylists(); }

/* ========= Menú tres puntitos global ========= */
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".icon-btn.more");
    if (!btn) return;

    const itemEl = btn.closest(".result-item, .fav-item, .queue-item");
    if (!itemEl) return;

    let track;
    const trackId = itemEl.dataset.trackId;

    if (itemEl.classList.contains("result-item")) {
        track = items.find(x => x.id === trackId);
    } else if (itemEl.classList.contains("fav-item")) {
        track = favs.find(f => f.id === trackId);
    } else if (itemEl.classList.contains("queue-item")) {
        track = queue.find(t => (t.id || t.key) === trackId);
    }

    if (!track || track.type?.includes('playlist') || track.unresolved) return;

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
                removeFromPlaylist(viewingPlaylistId, track.key || track.id);
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
    const isCurrentTrack = curId && (trackId === curId);
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

/* ========= YouTube Iframe API Loader ========= */
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
        updateAndroidNotification();
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
let rafPending = false; let lastScrollY = 0; let targetT = 0, currentT = 0; const EPS = 0.001; const DIST = 200;
function applyHeroT(t){ const tSnap=Math.round(t*1000)/1000; const a=document.querySelector(".view.active"); if(!a)return; const fav=a.querySelector("#favHero, .fav-hero"); const np=a.querySelector("#npHero, .np-hero, .player-header-sticky"); if(fav)fav.style.setProperty("--hero-t", tSnap); if(np)np.style.setProperty("--hero-t",tSnap); }
function heroScrollTickRaf(){ rafPending=false; const a=document.querySelector(".view.active"); if(!a){applyHeroT(0);return;} const vT=a.getBoundingClientRect().top+window.scrollY; const y=Math.max(0,lastScrollY - vT); targetT=Math.min(1,y/DIST); currentT+=(targetT-currentT)*0.25; if(Math.abs(targetT-currentT)<EPS)currentT=targetT; applyHeroT(currentT); if(Math.abs(targetT-currentT)>=EPS){requestAnimationFrame(heroScrollTickRaf);rafPending=true;} }
function heroScrollInvalidate(){ lastScrollY=window.scrollY||document.documentElement.scrollTop||0; if(!rafPending){rafPending=true;requestAnimationFrame(heroScrollTickRaf);} }
window.addEventListener("scroll", heroScrollInvalidate, { passive:true }); window.addEventListener("resize", heroScrollInvalidate, { passive:true });

/* ========= Media Session API ========= */
let mediaSessionHandlersSet = false;
function updateMediaSession(track){
  if(!('mediaSession' in navigator)||!track)return;
  try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title||'Reproduciendo',artist:cleanAuthor(track.author)||'—',album:queueType==='playlist'?(communityPlaylists.find(p=>p.id===viewingPlaylistId)?.name||''):'',artwork:[{src:track.thumb,sizes:'512x512',type:'image/jpeg'}]});}catch(e){}
  if(!mediaSessionHandlersSet){
    mediaSessionHandlersSet=true;
    const s=fn=>()=>{try{fn()}catch(e){}};
    try{
        navigator.mediaSession.setActionHandler('play',s(()=>togglePlay()));
        navigator.mediaSession.setActionHandler('pause',s(()=>togglePlay()));
        navigator.mediaSession.setActionHandler('previoustrack',s(()=>prev()));
        navigator.mediaSession.setActionHandler('nexttrack',s(()=>next()));
        navigator.mediaSession.setActionHandler('seekbackward',s(d=>{
            const o=d.seekOffset||10;
            if(!YT_READY)return;
            ytPlayer.seekTo(Math.max(0,(ytPlayer.getCurrentTime()||0)-o),true)
        }));
        navigator.mediaSession.setActionHandler('seekforward',s(d=>{
            const o=d.seekOffset||10;
            if(!YT_READY)return;
            ytPlayer.seekTo((ytPlayer.getCurrentTime()||0)+o,true)
        }));
        navigator.mediaSession.setActionHandler('seekto',s(d=>{
            if(!YT_READY||!d||typeof d.seekTime!=='number')return;
            ytPlayer.seekTo(d.seekTime,true)
        }));
    }catch(e){}
}  try{const st=getPlaybackState(); navigator.mediaSession.playbackState=(st==='playing'?'playing':(st==='paused'?'paused':'none'));}catch{}
}
/* ===== Android bridge (AIDE WebView) ===== */
function canUseAndroidBridge(){ try { return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification); } catch(e){ return false; } }
function updateAndroidNotification(){ if (!canUseAndroidBridge()) return; const isPlaying = (typeof getPlaybackState === 'function') ? (getPlaybackState() === 'playing') : (YT_READY && ytPlayer && (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING || ytPlayer.getPlayerState() === YT.PlayerState.BUFFERING)); if (!currentTrack) { AndroidBridge.stopNotification(); return; } AndroidBridge.updateNotification( currentTrack.title || '', cleanAuthor(currentTrack.author || ''), currentTrack.thumb || '', !!isPlaying ); }
window.handleNativeControl = function(c){ const a=String(c||'').toLowerCase(); if(a==='action_play'){if(YT_READY&&ytPlayer)ytPlayer.playVideo();return} if(a==='action_pause'){if(YT_READY&&ytPlayer)ytPlayer.pauseVideo();return} if(a==='action_next'){next();return} if(a==='action_prev'){prev();return} };


/* ========= Init ========= */
async function populateRecommendedPlaylists() {
    const playlistKeys = Object.keys(recommendedPlaylists);
    const allPromises = playlistKeys.map(key => {
        const playlist = recommendedPlaylists[key];
        return Promise.all(playlist.ids.map(id => scrapeVideoDetails(id)))
            .then(tracksData => {
                playlist.data = tracksData.filter(Boolean);
            });
    });
    await Promise.all(allPromises);
    renderAllHomePlaylists();
}

async function boot(){
  initTheme();

  const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc };
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPlaylists(); 
    renderAllHomePlaylists();
    
    if (viewingPlaylistId && queueType === 'playlist') {
        const updatedPlaylist = communityPlaylists.find(p => p.id === viewingPlaylistId);
        if (updatedPlaylist) {
            const currentKey = currentTrack ? (currentTrack.key || currentTrack.id) : null;
            renderQueue(updatedPlaylist.tracks, updatedPlaylist.name);
            setQueue(updatedPlaylist.tracks, 'playlist', qIdx);
            const newIdx = updatedPlaylist.tracks.findIndex(t => (t.key || t.id) === currentKey);

            if (newIdx !== -1) { qIdx = newIdx; } 
            else {
                qIdx = Math.min(qIdx, updatedPlaylist.tracks.length - 1);
                if (updatedPlaylist.tracks.length === 0) { currentTrack = null; ytPlayer.stopVideo(); } 
                else { currentTrack = queue[qIdx]; }
                updateUIOnTrackChange();
            }
        } else {
            hideQueuePanel();
            if (queueType === 'playlist') { currentTrack = null; queue = null; ytPlayer.stopVideo(); updateUIOnTrackChange(); }
        }
    }
  });

  populateRecommendedPlaylists();

  updateHomeGridVisibility();
  loadFavs();
  renderFavs();
  loadYTApi();
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
  heroScrollInvalidate();
  document.title = "SanaveraYou Pro";
}

function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    
    const recPlaylists = Object.values(recommendedPlaylists).filter(p => p.data && p.data.length > 0);
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && p.tracks?.length > 0);
    const allPlaylists = [...recPlaylists, ...publicCommunityPlaylists];
    
    allPlaylists.sort((a, b) => { 
        if (a.isRecommended && !b.isRecommended) return 1;
        if (!a.isRecommended && b.isRecommended) return -1;
        const dateA = a.updatedAt?.toDate() || new Date(0); 
        const dateB = b.updatedAt?.toDate() || new Date(0); 
        return dateB - dateA; 
    });
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

boot();

window.addEventListener('beforeunload', savePlayerState);
window.addEventListener('beforeunload', function(){ if (canUseAndroidBridge()) AndroidBridge.stopNotification(); });
