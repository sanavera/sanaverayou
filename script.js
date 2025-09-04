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
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;
let db; 
let resolverJobUnsubscribe = null; 

// --- Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };
let featuredPlaylists = [];
let newReleases = [];
let recommendedSongs = [];


// --- Listas de reproducción locales ---
const recommendedPlaylists = {
  p1: { ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZN1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3VdoetCQ', '6NXnxTNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3VdoetCQ'], title: 'Éxitos Melódicos 70s-90s', creator: 'Luis Sanavera', data: [], isRecommended: true, type: 'playlist' },
  p2: { ids: ['0qSif7B09N8', 'Ngi3rVx6kho', 'HhsXDJ1KeAI', 'MjgYsL3e3Mw', 'rsjGKU-qg3c', 'G6DbIQzCVBk', 'mdQW8ZLHpCU', 'MX-vrDW-A7I', 'uxZC1W6DHmI', 'WTlEED0_QcQ', 'ALA8ZDLQF9U', 'x1tWQNxJpY4', 'h2gj7Aap3iY', 'biXIrPcupuE', 'Vw5j10cBU78', 'Z5jQKzbOejY', 'ypg7ikDRhfg', '1gtJWFSWuYc', 'IhWGr-hTfHU', 'ZAKWI3mi14A', 'gy2hK11AKGE', 'fuYq32iJdIw', 'DzhxJkF7c9s', 'QqS4kWie8SA', 'sw6v-Q-2Is4', 'yXXheK7wYqo', 'xd-IwfDs7c4', 'HcWlkUKwjlc', 'pPoUVEcT0aU', 'N7m-0KXjKR0', 'OX2fVkdQYKg', 'AIIcEeQaWI0', 'WI0da9h-gcE', 'uxZC1W6DHmI', 'w09HG8_FAHQ', '_IqyVs9ObFA', 'auNa0nRPg3o', '46T65kU9Pw0', 'lsDSVZ10sY4', '4nztFNNeay0'], title: 'Cumbia Santafesina', creator: 'Luis Sanavera', data: [], isRecommended: true, type: 'playlist' },
  cumbia: { ids: ['UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU', 'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y', '098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE', '3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss', '2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c'], title: 'Cumbias del Recuerdo', creator: 'Luis Sanavera', data: [], isRecommended: true, type: 'playlist' },
  reggaeton: { ids: ['kJQP7kiw5Fk', 'TmKh7lAwnBI', 'tbneQDc2H3I', 'wnJ6LuUFpMo', '_I_D_8Z4sJE', 'DiItGE3eAyQ', 'VqEbCxg2bNI', '9jI-z9QN6g8', 'Cr8K88UcO0s', 'QaXhVryxVBk', 'ca48oMV59LU', '0VR3dfZf9Yg'], title: 'Noche de Reggaetón', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' },
  reggae: { ids: ['HNBCVM4KbUM', 'IT8XvzIfi4U', '69RdQFDuYPI', 'vdB-8eLEW8g', 'yv5xonFSC4c', 'oqVy6eRXc7Q', 'zXt56MB-3vc', 'f7OXGANW9Ic', 'MrHxhQPOO2c', 'ti2YCFgCoI', '_GZlJGERbvE', 'LfeIfiiBTfY'], title: 'Vibras de Reggae', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' },
  pop: { ids: ['JGwWNGJdvx8', 'YQHsXMglC9A', '09R8_2nJtjg', 'OPf0YbXqDm0', 'nfWlot6h_JM', 'fHI8X4OXluQ', 'TUVcZfQe-Kw', 'DyDfgMOUjCI', 'CevxZvSJLk8', 'fRh_vgS2dFE', 'YykjpeuMNEk', '2vjPBrBU-TM'], title: 'Éxitos Pop', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' },
  rock_int: { ids: ['1w7OgIMMRc4', 'rY0WxgSXdEE', 'fJ9rUzIMcZQ', 'eVTXPUF4Oz4', 'hTWKbfoikg', 'v2AC41dglnM', 'btPJPFnesV4', 'tAGnKpE4NCI', 'YlUKcNNmywk', '6Ejga4kJUts', 'lDK9QqIzhwk', 'kXYiU_JCYtU'], title: 'Himnos del Rock', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' },
  bachata: { ids: ['QFs3PIZb3js', 'bdOXnTbyk0g', 'yC9u00F-NF0', '8iPcqtHoR3U', '0XCot42qTvA', 'z2pt4CN4rhc', 'XNGWDH-6yv8', 'foyH-TEs9D0', 'JNkTNAknE4I', 'h_fXySfFmM8', 'elGZbcpGzdU', '8Ei86cJIWlk'], title: 'Corazón de Bachata', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' },
  international: { ids: ['djV11Xbc914', 'Zi_XLOBDo_Y', '3JWTaaS7LdU', 'n4RjJKxsamQ', 'vx2u5uUu3DE', 'PIb6AZdTr-A', '9jK-NcRmVcw', 'dQw4w9WgXcQ', 'FTQbiNvZqaY', 'rY0WxgSXdEE', 'YkAD0TPrJA', '0-EF60neguk'], title: 'Clásicos 70/80/90s', creator: 'Sebastián Sanavera', data: [], isRecommended: true, type: 'playlist' }
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
    queue, queueType, qIdx,
    currentTime: ytPlayer.getCurrentTime() || 0,
    isShuffle, repeatMode,
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
    ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: state.currentTime || 0 });
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
    if (spotifyToken.value && Date.now() < spotifyToken.expires) return spotifyToken.value;
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
        spotifyToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 - 60000 };
        return spotifyToken.value;
    } catch (e) { console.error("Error getting Spotify token:", e); return null; }
}

async function spotifyApiFetch(endpoint) {
    const token = await getSpotifyToken();
    if (!token) return null;
    try {
        const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Spotify API error: ${response.statusText}`);
        return response.json();
    } catch (e) { console.error(`Error fetching ${endpoint}:`, e); return null; }
}

async function fetchFeaturedPlaylists() {
    const data = await spotifyApiFetch('browse/featured-playlists?country=AR&locale=es_AR&limit=10');
    return data?.playlists?.items.map(p => ({
        id: p.id,
        name: p.name,
        author: p.owner.display_name,
        thumb: p.images?.[0]?.url || '',
        type: 'playlist',
        source: 'spotify'
    })) || [];
}

async function fetchNewReleases() {
    const data = await spotifyApiFetch('browse/new-releases?country=AR&limit=10');
    return data?.albums?.items.map(a => ({
        id: a.id,
        name: a.name,
        author: a.artists.map(art => art.name).join(', '),
        thumb: a.images?.[0]?.url || '',
        type: 'album',
        source: 'spotify'
    })) || [];
}

async function fetchRecommendations() {
    const data = await spotifyApiFetch('recommendations?seed_genres=latin,cumbia,rock-nacional,reggaeton&limit=10&market=AR');
    return data?.tracks?.map(t => ({
        id: t.id,
        title: t.name,
        author: t.artists.map(a => a.name).join(', '),
        thumb: t.album.images?.[0]?.url || '',
        source: 'spotify',
        type: 'track'
    })) || [];
}

/* ========= Lógica de Scraping de YouTube ========= */
const uniq = a => [...new Set(a)];
async function withRetry(fn, retries = 2, delay = 300) {
    for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (e) {
            if (i === retries) { console.error("Scraping failed.", e); throw e; }
            await new Promise(res => setTimeout(res, delay));
        }
    }
}
async function scrapeYoutubeUrlOnly(query) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const html = await fetch(endpoint).then(r => r.text());
        const genericMatch = html.match(/watch\?v=([\w-]{11})/);
        return genericMatch ? genericMatch[1] : null;
    });
}
async function scrapeYoutubeIdForNthResult(query, index = 0) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const html = await fetch(endpoint).then(r => r.text());
        const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]));
        return (ids && ids.length > index) ? ids[index] : null;
    });
}
async function scrapeYoutube(query, limit = 20) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const html = await fetch(endpoint).then(r => r.text());
        const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1])).slice(0, limit);
        if (!ids.length) return [];
        return await fetchVideoDetailsByIds(ids);
    });
}
async function fetchVideoDetailsByIds(ids) {
    const metadataPromises = [...new Set(ids)].map(id => 
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
            .then(r => r.json())
            .then(meta => meta.error ? null : {
                id,
                title: cleanTitle(meta.title),
                thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
                author: cleanAuthor(meta.author_name || "YouTube"),
                source: 'youtube', type: 'youtube_video'
            }).catch(() => null)
    );
    return (await Promise.all(metadataPromises)).filter(Boolean);
}
let searchAbort = null;

/* ========= Nav & Búsqueda ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id)?.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id !== "view-search") updateHomeGridVisibility();
  heroScrollInvalidate();
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn");
  if(btn && !btn.classList.contains('active')) switchView(btn.dataset.view);
});
const searchOverlay = $("#searchOverlay"), overlayInput = $("#overlaySearchInput");
function openSearch(){ searchOverlay.classList.add("show"); setTimeout(()=> overlayInput.focus(), 50); }
function closeSearch(){ searchOverlay.classList.remove("show"); }
$("#searchFab")?.addEventListener("click", openSearch);
searchOverlay?.addEventListener("click", e=>{ if(e.target===searchOverlay) closeSearch(); });
overlayInput?.addEventListener("keydown", e=>{
    if (e.key !== "Enter") return;
    const q = overlayInput.value.trim();
    if(q) { closeSearch(); switchView("view-search"); startSearch(q); }
});

/* ========= Lógica de Búsqueda Principal ========= */
async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  items = [];
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando…</h3></div>`;
  updateHomeGridVisibility();
  try {
    items = await scrapeYoutube(query, 20);
    if (searchAbort.signal.aborted) return;
    if (resultsEl) resultsEl.innerHTML = "";
    if (items.length === 0) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }
    appendResults(items);
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Error en la búsqueda.</p></div>`;
  }
}

/* ========= Render Resultados y Home ========= */
function appendResults(chunk){
  const root = $("#results"); if(!root) return;
  chunk.forEach(it => root.appendChild(createSongCard(it, false)));
  refreshIndicators();
}
function createSongCard(it, isCard = false) {
    const item = document.createElement("article");
    item.className = "result-item" + (isCard ? " as-card" : "");
    item.dataset.id = it.id;
    item.dataset.type = it.type;
    item.dataset.source = it.source;

    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" src="${it.thumb}" alt="">
        <button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>
      </div>
      <div class="meta">
        <div class="title-line"><span class="title-text">${it.title || it.name}</span><span class="eq"><span></span><span></span><span></span></span></div>
        <div class="subtitle">${cleanAuthor(it.author)}</div>
      </div>
      <div class="actions"><button class="icon-btn more" title="Opciones">${dotsSvg()}</button></div>`;
    return item;
}
async function findYoutubeEquivalent(track) {
    if (!track || !track.title) return null;
    const { videoId } = await resolveTrack(track);
    if (!videoId) return null;
    return { ...track, id: videoId, source: 'youtube', type: 'youtube_video' };
}
function updateHomeGridVisibility(){
  const home = $("#allPlaylistsContainer");
  if(home) home.style.display = (items.length === 0 && !$(".loading-indicator")) ? 'block' : 'none';
}

/* ========= Home (Inicio) ========= */
function renderSection(title, items, renderFn) {
    if (!items || items.length === 0) return '';
    return `
        <section class="home-category">
            <header class="home-head"><h3 class="home-title">${title}</h3></header>
            <div class="home-grid">${items.map(item => renderFn(item)).join('')}</div>
        </section>`;
}

function renderPlaylistCard(p) {
    const logo = p.source === 'spotify' ? spotifyLogoSvg() : youtubeLogoSvg();
    const coverHtml = p.type === 'album' || !p.tracks
        ? `<img class="album-cover" src="${p.thumb}" alt="Cover">`
        : `<div class="collage-container">${(p.tracks.slice(0,4).map(t => t.thumb)).map(src => `<img src="${src}" alt="">`).join('')}</div>`;

    return `
        <article class="playlist-card" data-id="${p.id}" data-type="${p.type}" data-source="${p.source}">
            ${coverHtml}
            <div class="playlist-meta">
                <div class="playlist-title-wrapper"><h4 class="playlist-title">${p.name}</h4></div>
                <div class="creator-line">${logo}<span>${p.author || p.creator}</span></div>
            </div>
        </article>`;
}

function renderSongCard(track) {
    return `
        <article class="result-item as-card" data-id="${track.id}" data-type="${track.type}" data-source="${track.source}">
            <div class="thumb-wrap"><img class="thumb" loading="lazy" src="${track.thumb}" alt=""><button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button></div>
            <div class="meta"><div class="title-line"><span class="title-text">${track.title}</span></div><div class="subtitle">${cleanAuthor(track.author)}</div></div>
        </article>`;
}

async function handleHomeCardClick(e) {
    const card = e.target.closest('[data-id]');
    if (!card) return;

    const { id, type, source } = card.dataset;
    if (e.target.closest('.card-play') || type === 'track' || type === 'youtube_video' || (type === 'playlist' && source === 'youtube')) {
        e.stopPropagation();
    }
    
    if (type === 'track') {
        const track = recommendedSongs.find(t => t.id === id);
        if (track) playSpotifyTrack(track);
    } else if (type === 'playlist' && source === 'youtube') {
        const key = Object.keys(recommendedPlaylists).find(k => recommendedPlaylists[k].title === card.querySelector('.playlist-title').textContent);
        if (key) {
            const pl = recommendedPlaylists[key];
            setQueue(pl.data, 'recommended', 0);
            currentQueueTitle = pl.title;
            renderQueue(pl.data, pl.title);
            switchView('view-player');
            playCurrent(true);
        }
    } else if ((type === 'playlist' || type === 'album') && source === 'spotify') {
        const item = [...featuredPlaylists, ...newReleases].find(i => i.id === id);
        if (item) playSpotifyPlaylistOrAlbum(item);
    } else if (type === 'playlist' && source !== 'spotify') {
        await showPlaylistInPlayer(id);
    }
}

async function playSpotifyTrack(track) {
    showToast("Buscando en YouTube...");
    const ytEquivalent = await findYoutubeEquivalent(track);
    if (ytEquivalent) {
        setQueue([ytEquivalent], "spotify_track", 0);
        viewingPlaylistId = null;
        currentQueueTitle = "Canción";
        renderQueue([ytEquivalent], currentQueueTitle);
        switchView('view-player');
        playCurrent(true);
    } else {
        showToast("No se encontró video para esta canción.", true);
    }
}

async function playSpotifyPlaylistOrAlbum(item) {
    showToast(`Cargando "${item.name}"...`);
    const endpoint = item.type === 'album' ? `albums/${item.id}/tracks` : `playlists/${item.id}/tracks`;
    const data = await spotifyApiFetch(endpoint);
    let tracks = data?.items;
    if(!tracks) { showToast("No se pudo cargar la playlist.", true); return; }

    if(item.type === 'playlist') tracks = tracks.map(t => t.track);
    
    const formattedTracks = tracks.map(t => ({
        id: t.id, title: t.name, author: t.artists.map(a => a.name).join(', '),
        thumb: (item.type === 'album' ? item.thumb : t.album?.images?.[0]?.url) || item.thumb,
        source: 'spotify', type: 'track'
    }));

    const resolvePromises = formattedTracks.map(findYoutubeEquivalent);
    const resolvedTracks = (await Promise.all(resolvePromises)).filter(Boolean);

    if(resolvedTracks.length === 0) {
        showToast("No se encontraron videos para esta lista.", true);
        return;
    }

    setQueue(resolvedTracks, "spotify_playlist", 0);
    viewingPlaylistId = item.id;
    currentQueueTitle = item.name;
    renderQueue(resolvedTracks, currentQueueTitle);
    switchView('view-player');
    playCurrent(true);
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
  ul.innerHTML= favs.map(it => createSongCard(it, false).outerHTML).join('');
  ul.querySelectorAll('.result-item').forEach((li, i) => {
    li.addEventListener('click', e => {
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      playFromFav(favs[i], true);
    });
    li.querySelector(".card-play").onclick = e => { e.stopPropagation(); playFromFav(favs[i], true); };
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

async function openPlaylistOptionsMenu(pl) {
  const isOwner = isMyPlaylist(pl.id);
  let actions = isOwner ? [{ id: "rename", label: "Renombrar" }, { id: "delete", label: "Eliminar", danger: true }] : [];
  actions.push({ id: "cancel", label: "Cancelar", ghost: true });
  
  openActionSheet({ title: pl.name, actions, onAction: async (act) => {
      const {doc, updateDoc, deleteDoc, serverTimestamp} = window.firebase;
      if (act === "rename" && isOwner) {
        const newName = prompt("Nuevo nombre:", pl.name);
        if (newName?.trim()) await updateDoc(doc(db, "playlists", pl.id), { name: newName.trim() });
      }
      if (act === "delete" && isOwner) {
        if (confirm(`¿Eliminar "${pl.name}"?`)) {
          await deleteDoc(doc(db, "playlists", pl.id));
          removeMyPlaylistId(pl.id);
        }
      }
    }
  });
}

function renderPlaylists() {
    const grid = $("#plList"), empty = $("#plEmpty");
    if (!grid || !empty) return;
    grid.innerHTML = "";
    const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id));

    if (myPlaylists.length === 0) { empty.classList.remove("hide"); return; }
    empty.classList.add("hide");

    myPlaylists.forEach(pl => {
        const card = document.createElement("article");
        card.className="pl-item"; card.dataset.id = pl.id;
        const cover = pl.cover || pl.tracks?.[0]?.thumb || "https://i.imgur.com/gCa3j5g.png";
        const total = pl.trackCount || pl.tracks?.length || 0;
        let statusText = `${total} temas`;
        if (pl.status === 'resolving') statusText = `Importando...`;

        card.innerHTML = `<img class="pl-thumb-bg" src="${cover}" alt=""><div class="pl-overlay"><div class="pl-meta"><div class="pl-title">${pl.name}</div><div class="pl-creator">por ${pl.creator}</div><div class="pl-subtitle">${statusText}</div></div></div><button class="icon-btn more" title="Opciones">${dotsSvg()}</button>`;
        card.querySelector(".more").addEventListener("click", e => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
        card.addEventListener("click", () => showPlaylistInPlayer(pl.id));
        card.classList.toggle("is-playing", viewingPlaylistId === pl.id);
        grid.appendChild(card);
    });
}
$("#btnNewPlaylist")?.addEventListener("click", () => $("#createPlaylistSheet").classList.add("show"));
$("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
$("#createPlConfirm").onclick = async () => {
    const name = $("#newPlName").value.trim();
    const creator = $("#newPlCreator").value.trim();
    if (!name || !creator) { showToast("Completa nombre y creador.", true); return; }
    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        $("#newPlName").value = ""; $("#newPlCreator").value = "";
        $("#createPlaylistSheet").classList.remove("show");
    } catch (e) { showToast("Error al crear la playlist.", true); }
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
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}
function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet"); if(!sheet) return;
  sheet.innerHTML = `<div class="sheet-content"><div class="sheet-title">${title}</div>${actions.map(a=>`<button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">${a.label}</button>`).join("")}</div>`;
  sheet.classList.add("show");
  sheet.onclick = e => {
    if(e.target===sheet){ sheet.classList.remove("show"); return; }
    const btn = e.target.closest(".sheet-item"); if(!btn) return;
    sheet.classList.remove("show");
    onAction(btn.dataset.id);
  };
}
async function openPlaylistSheet(track){
  const sheet = $("#playlistSheet"); if(!sheet) return;
  sheet.classList.add("show");
  const list = $("#plChoices"); list.innerHTML="";
  const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id));
  myPlaylists.forEach(pl=>{
    const btn = document.createElement("button");
    btn.className="sheet-item"; btn.textContent = pl.name;
    btn.onclick = async ()=>{
      const { doc, updateDoc, serverTimestamp } = window.firebase;
      const updatedTracks = [...pl.tracks];
      if (!updatedTracks.some(t => t.id === track.id)) updatedTracks.unshift(track);
      try {
        await updateDoc(doc(db, "playlists", pl.id), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        sheet.classList.remove("show");
      } catch(e) { showToast("No se pudo agregar la canción.", true); }
    };
    list.appendChild(btn);
  });
  $("#plCreateFromSong").onclick = async () => {
    const name = $("#plNewNameFromSong").value.trim(); if (!name) return;
    const creator = prompt("Tu nombre (creador):")?.trim(); if (!creator) return;
    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [track], updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        $("#plNewNameFromSong").value = ""; sheet.classList.remove("show");
    } catch (e) { showToast("Error al crear la playlist.", true); }
  };
  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
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
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  $("#npSub").textContent = t ? `${cleanAuthor(t.author)}${currentQueueTitle ? ` • ${currentQueueTitle}` : ""}` : (currentQueueTitle || "—");
}
function setQueue(srcArr, type, idx){
  let finalSrc = srcArr;
  if (isShuffle) {
    const currentItem = srcArr[idx];
    const others = srcArr.filter((_, index) => index !== idx);
    finalSrc = [currentItem, ...others.sort(() => Math.random() - 0.5)];
    idx = 0;
  }
  queue = finalSrc; queueType = type; qIdx = idx;
}
function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  if (!currentTrack || !currentTrack.id) { next(); return; }
  ytPlayer.loadVideoById({videoId: currentTrack.id});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateUIOnTrackChange();
}
function playFromSearch(trackId, autoplay=false) {
    const videoIndex = items.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(items, "search", videoIndex);
        viewingPlaylistId = null;
        currentQueueTitle = "Resultados de Búsqueda";
        renderQueue(items, currentQueueTitle);
        playCurrent(autoplay);
    }
}
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); 
  viewingPlaylistId = null; 
  currentQueueTitle = "Favoritos";
  renderQueue(favs, currentQueueTitle);
  playCurrent(autoplay);
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  const tracks = (pl.tracks || []).filter(t => t && t.id);
  if (tracks.length === 0) { showToast("Esta playlist no tiene canciones para reproducir.", true); return; }
  setQueue(tracks, "playlist", i);
  currentQueueTitle = pl.name;
  renderQueue(tracks, currentQueueTitle);
  playCurrent(autoplay);
}
function togglePlay(){
  if(!YT_READY || !currentTrack) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
$("#npPlay")?.addEventListener("click", togglePlay);
$("#miniPlay")?.addEventListener("click", togglePlay);
function updateMiniNow(){
  const has = !!currentTrack;
  $("#seekDock")?.classList.toggle("show", has);
  if(!has) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  $("#miniAuthor").textContent = cleanAuthor(currentTrack.author);
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
function seekToFrac(frac){ if(YT_READY) ytPlayer.seekTo(frac * (ytPlayer.getDuration()||0), true); }
$("#seek")?.addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));
$("#miniSeek")?.addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));
function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY || !currentTrack || ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) return;
    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur").textContent = fmt(cur); $("#dur").textContent = fmt(dur);
    $("#seek").value = dur ? Math.floor((cur/dur)*1000) : 0;
    $("#miniCur").textContent = fmt(cur); $("#miniDur").textContent = fmt(dur);
    $("#miniSeek").value = dur ? Math.floor((cur/dur)*1000) : 0;
    savePlayerState();
  }, 500);
}
function stopTimer(){ clearInterval(timer); }
function toggleShuffle() {
  isShuffle = !isShuffle;
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  if (currentTrack) {
    const originalIndex = queue.findIndex(t => t.id === currentTrack.id);
    setQueue(queue, queueType, Math.max(0, originalIndex));
    if (!$("#queuePanel").classList.contains('hide')) renderQueue(queue, currentQueueTitle);
  }
}
function cycleRepeat() {
  const modes = ['none', 'all', 'one'];
  repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
  const btn = $("#btnRepeat");
  if(btn) {
    btn.classList.toggle('active', repeatMode !== 'none');
    btn.innerHTML = (repeatMode === 'one') ? `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>` : `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
  }
}
function updateControlStates() {
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  $("#btnRepeat")?.classList.toggle('active', repeatMode !== 'none');
}
$("#btnShuffle")?.addEventListener("click", toggleShuffle);
$("#btnRepeat")?.addEventListener("click", cycleRepeat);
function renderQueue(queueItems, title) {
    const panel = $("#queuePanel"); if(!panel) return;
    panel.classList.remove("hide");
    panel.querySelector('#queueTitle').textContent = title;
    const ul = panel.querySelector("#queueList");
    ul.innerHTML = (queueItems || []).map(t => createSongCard(t, false).outerHTML).join('');
    ul.querySelectorAll('.result-item').forEach((li, i) => {
        li.onclick = e => {
            if (e.target.closest(".more") || e.target.closest(".card-play")) return;
            setQueue(queueItems, queueType, i);
            playCurrent(true);
        };
        li.querySelector(".card-play").onclick = e => { e.stopPropagation(); setQueue(queueItems, queueType, i); playCurrent(true); };
    });
    refreshIndicators();
}
async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId); if (!pl) return;
    viewingPlaylistId = pl.id; switchView('view-player');
    const tracksToPlay = (pl.tracks || []).filter(t => t && t.id);
    if (!tracksToPlay.length) { showToast(`La playlist "${pl.name}" está vacía.`, true); switchView('view-playlists'); return; }
    setQueue(tracksToPlay, 'playlist', 0);
    renderQueue(tracksToPlay, pl.name);
    playCurrent(true);
}
document.addEventListener("click", async e => {
    const btn = e.target.closest(".icon-btn.more"); if (!btn) return;
    const itemEl = btn.closest("[data-id]"); if (!itemEl) return;
    let track = [...items, ...favs, ...(queue||[])].find(x => x.id === itemEl.dataset.id);
    if (!track) return;
    const actions = [ { id: "fav", label: isFav(track.id) ? "Quitar de Favoritos" : "Añadir a Favoritos" }, { id: "pl", label: "Añadir a playlist" } ];
    if (itemEl.closest('.queue-item') && queueType === 'playlist' && isMyPlaylist(viewingPlaylistId)) {
        actions.push({ id: "reassign", label: "Reasignar fuente" }, { id: "delete", label: "Eliminar de playlist", danger: true });
    }
    actions.push({ id: "cancel", label: "Cancelar", ghost: true });
    openActionSheet({ title: track.title, actions, onAction: act => {
            if (act === "fav") toggleFav(track);
            if (act === "pl") openPlaylistSheet(track);
            if (act === "delete") removeFromPlaylist(viewingPlaylistId, track.id);
            if (act === "reassign") reassignTrackSource(viewingPlaylistId, track.id);
        }
    });
});
function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing', curId = currentTrack?.id;
  $$(".result-item, .fav-item, .queue-item, .playlist-card, .as-card").forEach(el => {
    const isCurrent = el.dataset.id === curId;
    el.classList.toggle("is-playing", isCurrent);
    el.querySelector(".card-play")?.classList.toggle("playing", isPlaying && isCurrent);
  });
  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}

/* ========= YouTube, Media Session & Init ========= */
function loadYTApi(){ if(window.YT?.Player) onYouTubeIframeAPIReady(); else { const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s); } }
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{ playerVars:{playsinline:1}, events:{ onReady:()=>{ YT_READY=true; window.dispatchEvent(new Event('yt-ready')); }, onStateChange: e => { if(e.data===YT.PlayerState.ENDED) next(); refreshIndicators(); } } });
};
function updateMediaSession(track){
  if(!('mediaSession' in navigator)||!track)return;
  navigator.mediaSession.metadata=new MediaMetadata({title:track.title, artist:cleanAuthor(track.author), album:currentQueueTitle, artwork:[{src:track.thumb,sizes:'512x512'}]});
  navigator.mediaSession.setActionHandler('play',()=>togglePlay());
  navigator.mediaSession.setActionHandler('pause',()=>togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack',()=>prev());
  navigator.mediaSession.setActionHandler('nexttrack',()=>next());
}
async function boot(){
  initTheme();
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, orderBy } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  window.firebase = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  const app = initializeApp({ projectId: "sanaverayou" }); // Simplified config
  db = getFirestore(app);
  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), snap => {
    communityPlaylists = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderPlaylists(); 
    renderHomePageContent();
  });
  const [featured, releases, recs, ...localResults] = await Promise.all([
      fetchFeaturedPlaylists(),
      fetchNewReleases(),
      fetchRecommendations(),
      ...Object.values(recommendedPlaylists).map(p => fetchVideoDetailsByIds(p.ids))
  ]);
  featuredPlaylists = featured; newReleases = releases; recommendedSongs = recs;
  Object.keys(recommendedPlaylists).forEach((key, i) => { recommendedPlaylists[key].data = localResults[i] || []; });
  renderHomePageContent();
  updateHomeGridVisibility();
  loadFavs(); renderFavs(); loadYTApi();
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
}
function renderHomePageContent() {
    const container = $("#allPlaylistsContainer"); if (!container) return;
    const publicCommunity = communityPlaylists.filter(p => p.isPublic && p.tracks?.length > 0);
    const localPlaylists = Object.values(recommendedPlaylists).filter(p => p.data.length > 0);
    let html = '';
    html += renderSection('Para ti desde Spotify', featuredPlaylists, renderPlaylistCard);
    html += renderSection('Nuevos Lanzamientos', newReleases, renderPlaylistCard);
    html += renderSection('Playlists de la Comunidad', publicCommunity, renderPlaylistCard);
    html += renderSection('Nuestras Playlists', localPlaylists, renderPlaylistCard);
    html += renderSection('Canciones Recomendadas', recommendedSongs, renderSongCard);
    container.innerHTML = html || '<div class="loading-indicator"><p>No hay contenido para mostrar.</p></div>';
    container.removeEventListener('click', handleHomeCardClick);
    container.addEventListener('click', handleHomeCardClick);
    
    // Lógica para marquesina
    $$('.playlist-title-wrapper').forEach(wrapper => {
      const title = wrapper.querySelector('.playlist-title');
      if (title.scrollWidth > wrapper.clientWidth) {
          wrapper.classList.add('is-overflowing');
          title.innerHTML = `<span>${title.textContent}</span><span aria-hidden="true">${title.textContent}</span>`;
      }
    });
}
boot();
window.addEventListener('beforeunload', savePlayerState);
