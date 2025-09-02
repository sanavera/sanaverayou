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
let activeResolverJobUnsubscribe = null; // Para detener la escucha del job

let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

let ytPlayer = null, YT_READY = false, timer = null;
let db; // Instancia de Firestore

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
'UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU',
'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y',
'098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE',
'3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss',
'2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c'
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
  reggae: {
    ids: ['HNBCVM4KbUM', 'IT8XvzIfi4U', '69RdQFDuYPI', 'vdB-8eLEW8g', 'yv5xonFSC4c', 'oqVy6eRXc7Q', 'zXt56MB-3vc', 'f7OXGANW9Ic', 'MrHxhQPOO2c', 'ti2YCFgCoI', '_GZlJGERbvE', 'LfeIfiiBTfY'],
    title: 'Vibras de Reggae',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
  },
  pop: {
    ids: ['JGwWNGJdvx8', 'YQHsXMglC9A', '09R8_2nJtjg', 'OPf0YbXqDm0', 'nfWlot6h_JM', 'fHI8X4OXluQ', 'TUVcZfQe-Kw', 'DyDfgMOUjCI', 'CevxZvSJLk8', 'fRh_vgS2dFE', 'YykjpeuMNEk', '2vjPBrBU-TM'],
    title: 'Éxitos Pop',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
  },
  rock_int: {
    ids: ['1w7OgIMMRc4', 'rY0WxgSXdEE', 'fJ9rUzIMcZQ', 'eVTXPUF4Oz4', 'hTWKbfoikg', 'v2AC41dglnM', 'btPJPFnesV4', 'tAGnKpE4NCI', 'YlUKcNNmywk', '6Ejga4kJUts', 'lDK9QqIzhwk', 'kXYiU_JCYtU'],
    title: 'Himnos del Rock',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
  },
  bachata: {
    ids: ['QFs3PIZb3js', 'bdOXnTbyk0g', 'yC9u00F-NF0', '8iPcqtHoR3U', '0XCot42qTvA', 'z2pt4CN4rhc', 'XNGWDH-6yv8', 'foyH-TEs9D0', 'JNkTNAknE4I', 'h_fXySfFmM8', 'elGZbcpGzdU', '8Ei86cJIWlk'],
    title: 'Corazón de Bachata',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
  },
  international: {
    ids: ['djV11Xbc914', 'Zi_XLOBDo_Y', '3JWTaaS7LdU', 'n4RjJKxsamQ', 'vx2u5uUu3DE', 'PIb6AZdTr-A', '9jK-NcRmVcw', 'dQw4w9WgXcQ', 'FTQbiNvZqaY', 'rY0WxgSXdEE', 'YkAD0TPrJA', '0-EF60neguk'],
    title: 'Clásicos 70/80/90s',
    creator: 'Sebastián Sanavera',
    data: [],
    isRecommended: true
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

/* ========= API YouTube (Función Restaurada) ========= */
const YOUTUBE_API_KEYS = [
  "AIzaSyCLKvqx3vv4SYBrci4ewe3TbeWJ-wL2BsY", "AIzaSyB9CSgnqFP5xBuYil8zUuZ0nWGQMHBk_44",
  "AIzaSyD_WZVpBaXosHIzpHoS0JJcQFlB03jc9DE", "AIzaSyCiryC1WiODR0hisMRDeej5FPsTjF3MTTM",
  "AIzaSyC3-V6pED9HDjEYpgtU9Tcw8YcZem9pVM0", "AIzaSyDCjAPw7pG9GxRTsy-czuoRVF-u_Qu--hI",
  "AIzaSyDjcQqc8bL_bvO06OXIG_sR_LIUV0bX0cs", "AIzaSyB_alWAvGwiNWgowsZwf45tkR0Q9R04DJQ",
  "AIzaSyB_hGk25Hdpt6Q7jzOr8dR6h50m7lrJGNc", "AIzaSyAHjMoRWCpAuxp1hEb-nMxVPFdNAit_QnQ"
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
            console.error('YouTube API fetch chunk failed, retrying with next key:', e);
            return fetchChunk(chunk, retryCount + 1);
        }
    };
    const results = await Promise.all(chunks.map(chunk => fetchChunk(chunk)));
    return results.flat();
}

let searchAbort = null;

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view = $("#"+id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id !== 'view-player') {
      hideResolverModal();
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
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    switchView("view-search");
});

/* ========= Lógica de Búsqueda de Canciones (Scraping) ========= */
async function scrapeYoutubeForVideo(query) {
    try {
        const response = await fetch(`https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Scraping failed with status: ${response.status}`);
        const html = await response.text();
        const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match && match[1]) {
            return match[1];
        }
        return null;
    } catch (error) {
        console.error(`Scraping error for query "${query}":`, error);
        return null;
    }
}

async function findYoutubeEquivalent(track) {
    if (!track || !track.title) return null;
    const searchQuery = `${track.author} - ${track.title}`;
    try {
        const videoId = await scrapeYoutubeForVideo(searchQuery);
        if (videoId) {
            return {
                id: videoId,
                title: track.title,
                author: track.author,
                thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                originalId: track.id,
                source: 'youtube'
            };
        }
        return null;
    } catch (error) {
        console.error(`Scraping failed for "${searchQuery}":`, error);
        return null;
    }
}

/* ========= Home grid, Favoritos, Playlists, etc. (Omitido por brevedad) ========= */
// Aquí iría el resto de las funciones que ya estaban correctas
// como renderPlaylistCard, updateHomeGridVisibility, loadFavs,
// renderFavs, isMyPlaylist, openPlaylistOptionsMenu, renderPlaylists, etc.
// ...

/* ========= LÓGICA CENTRAL DE RESOLUCIÓN DE PLAYLISTS (CORREGIDA) ========= */

async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;

    if (pl.source === 'spotify' && (pl.status !== 'resolved')) {
        await startResolverJob(pl);
    } else {
        if (!pl.tracks || pl.tracks.length === 0) {
            alert(`La playlist "${pl.name}" está vacía.`);
            return;
        }
        viewingPlaylistId = pl.id;
        setQueue(pl.tracks, 'playlist', 0);
        renderQueue(pl.tracks, pl.name);
        switchView('view-player');
        playCurrent(true);
    }
}

async function startResolverJob(pl) {
    const { doc, getDoc, setDoc, onSnapshot, serverTimestamp } = window.firebase;
    const jobId = `resolver_${pl.id}`;
    const jobRef = doc(db, "resolverJobs", jobId);
    
    if (activeResolverJobUnsubscribe) {
        activeResolverJobUnsubscribe();
    }

    let jobData;
    const jobDoc = await getDoc(jobRef);
    if (jobDoc.exists() && jobDoc.data().status !== 'canceled') {
        jobData = jobDoc.data();
    } else {
        jobData = {
            playlistId: pl.id,
            status: "queued",
            total: pl.spotifyTracks.length,
            done: pl.tracks?.length || 0,
            nextIndex: pl.tracks?.length || 0,
            lastUpdated: serverTimestamp()
        };
        await setDoc(jobRef, jobData);
    }

    activeResolverJobUnsubscribe = onSnapshot(jobRef, (snapshot) => {
        const job = snapshot.data();
        if (!job) return;
        updateResolverModal(job, pl.name);
        if (job.status === 'done') {
            const updatedPl = communityPlaylists.find(p => p.id === pl.id);
            if (updatedPl) {
                 renderQueue(updatedPl.tracks, updatedPl.name);
            }
        }
    });

    runResolverJob(jobRef, pl);
}

async function runResolverJob(jobRef, pl) {
    const { doc, getDoc, updateDoc, serverTimestamp } = window.firebase;
    
    await updateDoc(jobRef, { status: 'running', lastUpdated: serverTimestamp() });
    
    const spotifyTracks = pl.spotifyTracks;
    let resolvedTracks = pl.tracks || [];

    const jobSnapshot = await getDoc(jobRef);
    let job = jobSnapshot.data();
    let startIndex = job.nextIndex || 0;

    switchView('view-player');
    
    for (let i = startIndex; i < spotifyTracks.length; i++) {
        const currentJobDoc = await getDoc(jobRef);
        job = currentJobDoc.data();
        if (job.status !== 'running') {
            console.log("Job no está en ejecución. Deteniendo.");
            return;
        }

        const track = spotifyTracks[i];
        const ytEquivalent = await findYoutubeEquivalent(track);
        
        if (ytEquivalent) {
            resolvedTracks.push(ytEquivalent);
        }

        await updateDoc(jobRef, {
            done: i + 1,
            nextIndex: i + 1,
            lastUpdated: serverTimestamp()
        });
        
        if (i === startIndex && resolvedTracks.length > 0) {
            viewingPlaylistId = pl.id;
            setQueue(resolvedTracks, 'playlist', 0);
            renderQueue(resolvedTracks, pl.name);
            playCurrent(true);
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    await updateDoc(doc(db, "playlists", pl.id), {
        tracks: resolvedTracks,
        status: 'resolved',
        resolvedCount: resolvedTracks.length
    });
    await updateDoc(jobRef, { status: 'done', lastUpdated: serverTimestamp() });
}

/* ========= Mini-Modal de Progreso ========= */
function showResolverModal() {
    let modal = $('#sy-resolver-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sy-resolver-modal';
        modal.className = 'sy-resolver-modal';
        document.body.appendChild(modal);
    }
    modal.classList.add('show');
}

function updateResolverModal(job, playlistName) {
    if (job.status === 'done' || job.status === 'canceled') {
        hideResolverModal();
        return;
    }
    
    let modal = $('#sy-resolver-modal');
    if (!modal) {
        showResolverModal();
        modal = $('#sy-resolver-modal');
    }

    const progress = job.total > 0 ? (job.done / job.total) * 100 : 0;
    
    modal.innerHTML = `
        <div class="sy-resolver-content">
            <p class="sy-resolver-title">Importando "${playlistName}"</p>
            <div class="sy-resolver-progress-bar">
                <div style="width: ${progress}%"></div>
            </div>
            <span class="sy-resolver-count">${job.done} / ${job.total}</span>
            <button id="sy-resolver-cancel" class="sy-resolver-cancel-btn">Cancelar</button>
        </div>
    `;

    $('#sy-resolver-cancel').onclick = async () => {
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        await updateDoc(doc(db, "resolverJobs", `resolver_${job.playlistId}`), {
            status: 'canceled',
            lastUpdated: serverTimestamp()
        });
        await updateDoc(doc(db, "playlists", job.playlistId), { status: 'partial' });
    };
}

function hideResolverModal() {
    if (activeResolverJobUnsubscribe) {
        activeResolverJobUnsubscribe();
        activeResolverJobUnsubscribe = null;
    }
    const modal = $('#sy-resolver-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}


/* ========= Init y Boot ========= */
async function boot(){
  initTheme();

  const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, setDoc, getDoc, serverTimestamp, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, setDoc, getDoc, serverTimestamp, deleteDoc };
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  heroScrollInvalidate();
  document.title = "SanaveraYou Pro";
}

function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && (p.tracks?.length > 0 || p.spotifyTracks?.length > 0));
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => { 
        const dateA = a.updatedAt?.toDate() || new Date(0); 
        const dateB = b.updatedAt?.toDate() || new Date(0); 
        return dateB - dateA; 
    });
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

boot();
window.addEventListener('beforeunload', savePlayerState);
document.addEventListener('DOMContentLoaded', sy_initSpotifyImportUI);

/* ========== Spotify Import UI & Logic (SIN CAMBIOS) ========== */
function sy_initSpotifyImportUI() {
  const playlistsView = document.getElementById('view-playlists');
  if (!playlistsView) return;
  const header = playlistsView.querySelector('.section-head');
  const grid = playlistsView.querySelector('#plList');
  if (!grid || playlistsView.querySelector('#syBtnImportSpotify')) return;
  const bar = document.createElement('div');
  bar.className = 'sy-pl-toolbar';
  const btn = document.createElement('button');
  btn.id = 'syBtnImportSpotify';
  btn.className = 'pill accent';
  btn.type = 'button';
  btn.innerHTML = `<svg viewBox="0 0 167.5 167.5" fill="currentColor" height="1em" width="1em" style="margin-right: 8px;"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"></path></svg> Importar desde Spotify`;
  if (header && header.parentElement === playlistsView) {
    playlistsView.insertBefore(bar, header.nextElementSibling || grid);
  } else {
    playlistsView.insertBefore(bar, grid);
  }
  bar.appendChild(btn);
  btn.addEventListener('click', sy_openSpotifyImportModal);
}

function sy_openSpotifyImportModal() {
  if (document.getElementById('sySpotifyModal')) return sy_showModal('sySpotifyModal', true);

  const modal = document.createElement('div');
  modal.id = 'sySpotifyModal';
  modal.className = 'sy-modal';
  modal.innerHTML = `
    <div class="sy-modal__overlay" data-close="1"></div>
    <div class="sy-modal__card" role="dialog" aria-modal="true" aria-labelledby="sySmTitle">
      <div class="sy-modal__header">
        <h3 id="sySmTitle">Importar playlists desde Spotify</h3>
      </div>
      <div class="sy-modal__body" id="sySmBody">
        <p class="muted">Ingresá tu nombre de usuario de Spotify o pegá el enlace a tu perfil para buscar tus listas públicas.</p>
        <label class="sy-field">
          <span>Usuario o URL de perfil</span>
          <input id="sySmInput" type="text" placeholder="ej. luchosanavera o https://open.spotify.com/user/..." autocomplete="off">
        </label>
        <div class="sy-actions">
          <button class="btn" id="sySmCancel">Cancelar</button>
          <button class="btn accent" id="sySmFetch">Buscar Playlists</button>
        </div>
        <div class="sy-spinner" id="sySmSpinner" hidden>Cargando…</div>
        <div id="sySmResults" class="sy-pl-results" hidden></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e)=>{ if (e.target.dataset.close) sy_showModal('sySpotifyModal', false); });
  document.getElementById('sySmCancel').onclick = ()=> sy_showModal('sySpotifyModal', false);
  document.getElementById('sySmFetch').onclick = sy_fetchSpotifyUserPlaylists;
  
  sy_showModal('sySpotifyModal', true);
  setTimeout(()=> document.getElementById('sySmInput')?.focus(), 60);
}

function sy_showModal(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('show', !!show);
  document.body.classList.toggle('sy-modal-open', !!show);
}

function sy_parseSpotifyUserId(input) {
  if (!input) return null;
  const cleanedInput = input.trim().split('?')[0];
  const spotifyUserRegex = /open\.spotify\.com\/(?:user|profile)\/([a-zA-Z0-9]+)/;
  const match = cleanedInput.match(spotifyUserRegex);
  if (match && match[1]) {
    return match[1];
  }
  if (!cleanedInput.includes('/') && !cleanedInput.includes(':')) {
    return cleanedInput;
  }
  return null;
}

async function sy_fetchSpotifyUserPlaylists() {
  const input = document.getElementById('sySmInput').value.trim();
  const userId = sy_parseSpotifyUserId(input);
  const spinner = document.getElementById('sySmSpinner');
  const results = document.getElementById('sySmResults');
  results.hidden = true;
  results.innerHTML = '';
  spinner.hidden = false;

  if (!userId) {
    spinner.hidden = true;
    results.innerHTML = `<p class="muted">Formato de usuario o URL no válido. Por favor, intenta de nuevo.</p>`;
    results.hidden = false;
    return;
  }

  try {
    const token = await getSpotifyToken(); 
    let url = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists?limit=50`;
    const all = [];
    while (url) {
      const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token }});
      if (!r.ok) {
         if (r.status === 404) throw new Error(`Usuario <strong>${userId}</strong> no encontrado.`);
         throw new Error('Error de API de Spotify: ' + r.status);
      }
      const d = await r.json();
      all.push(...d.items);
      url = d.next;
    }
    if (all.length === 0) {
      results.innerHTML = `<p class="muted">No se encontraron playlists públicas para <strong>${userId}</strong>.</p>`;
      results.hidden = false; spinner.hidden = true; return;
    }
    sy_renderSpotifyPlaylistsSelection(userId, all);
  } catch (e) {
    results.innerHTML = `<div class="sy-error">No se pudieron obtener las playlists. <br><small>${e.message}</small></div>`;
    results.hidden = false;
  } finally {
    spinner.hidden = true;
  }
}

function sy_renderSpotifyPlaylistsSelection(userId, list) {
  const results = document.getElementById('sySmResults');
  results.hidden = false;
  
  const checks = list.map((p) => {
    const cover = p.images?.[0]?.url || '';
    const tracks = p.tracks?.total || 0;
    const id = p.id;
    const name = p.name || 'Playlist sin nombre';
    return `
      <label class="sy-pl-row">
        <input type="checkbox" class="sy-pl-check" data-plid="${id}" data-plname="${String(name).replace(/"/g,'&quot;')}" data-tracks="${tracks}" data-cover="${String(cover).replace(/"/g,'&quot;')}" checked>
        <img src="${cover}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="sy-pl-meta">
          <div class="sy-pl-name">${name}</div>
          <div class="sy-pl-sub">${tracks} temas</div>
        </div>
      </label>`;
  }).join('');

  results.innerHTML = `
    <div class="sy-pl-head">
      <label class="sy-checkall">
        <input type="checkbox" id="syPlAll" checked>
        <span>Seleccionar todo (${list.length})</span>
      </label>
    </div>
    <div class="sy-pl-list">
      ${checks}
    </div>
    <div class="sy-actions">
      <button class="btn" id="syPlCancel">Cerrar</button>
      <button class="btn accent" id="syPlImport">Importar / Actualizar</button>
    </div>
  `;

  document.getElementById('syPlCancel').onclick = ()=> sy_showModal('sySpotifyModal', false);
  document.getElementById('syPlAll').onchange = (e)=> {
    document.querySelectorAll('#sySmResults .sy-pl-check').forEach(ch => ch.checked = e.target.checked);
  };
  document.getElementById('syPlImport').onclick = async ()=> {
    const btn = document.getElementById('syPlImport');
    btn.disabled = true;
    btn.textContent = 'Importando...';

    const selected = Array.from(document.querySelectorAll('#sySmResults .sy-pl-check:checked'));
    if (selected.length === 0) { 
      alert('No seleccionaste ninguna playlist para importar.');
      btn.disabled = false;
      btn.textContent = 'Importar / Actualizar';
      return; 
    }
    const payload = selected.map(ch => ({
      spotifyId: ch.dataset.plid,
      name: ch.dataset.plname,
      creator: userId,
      cover: ch.dataset.cover || '',
    }));
    await sy_processAndSavePlaylists(payload, results);
  };
}

async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
    while (url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('No se pudo obtener las canciones de la playlist');
            const data = await response.json();
            const tracks = data.items.map(({ track }) => track ? {
                source: 'spotify',
                id: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean);
            allTracks.push(...tracks);
            url = data.next;
        } catch (e) {
            console.error("Error buscando canciones de playlist de Spotify:", e);
            url = null;
        }
    }
    return allTracks;
}

async function sy_processAndSavePlaylists(list, resultsContainer) {
    if (!window.firebase || !db) {
        resultsContainer.innerHTML = '<div class="sy-error">Error: La base de datos no está disponible.</div>';
        return;
    }
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = window.firebase;
    const col = collection(db, 'playlists');
    let importedCount = 0;
    let updatedCount = 0;
    const importButton = document.getElementById('syPlImport');

    try {
        for (let i = 0; i < list.length; i++) {
            const pl = list[i];
            importButton.textContent = `Procesando ${i + 1}/${list.length}...`;

            const spotifyTracks = await fetchAllSpotifyPlaylistTracks(pl.spotifyId);
            if(spotifyTracks.length === 0) continue;

            const q = query(col, where("spotifyId", "==", pl.spotifyId));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                const docRef = await addDoc(col, {
                    name: pl.name,
                    creator: pl.creator,
                    isPublic: false,
                    cover: pl.cover || null,
                    source: 'spotify',
                    spotifyId: pl.spotifyId,
                    spotifyTracks: spotifyTracks,
                    tracks: [],
                    status: 'unresolved',
                    updatedAt: serverTimestamp()
                });
                addMyPlaylistId(docRef.id);
                importedCount++;
            } else {
                const docId = snapshot.docs[0].id;
                const existingDocRef = doc(db, 'playlists', docId);
                await updateDoc(existingDocRef, {
                    name: pl.name,
                    spotifyTracks: spotifyTracks,
                    tracks: [], 
                    status: 'unresolved',
                    updatedAt: serverTimestamp()
                });
                addMyPlaylistId(docId);
                updatedCount++;
            }
        }
        
        resultsContainer.innerHTML = `<div class="sy-success">¡Proceso completado!<br>${importedCount} playlists importadas.<br>${updatedCount} playlists actualizadas.</div>`;
        setTimeout(() => sy_showModal('sySpotifyModal', false), 2500);

    } catch (e) {
        console.error("Error masivo al importar/actualizar playlists: ", e);
        resultsContainer.innerHTML = `<div class="sy-error">Ocurrió un error durante el proceso. Intenta de nuevo.</div>`;
    } finally {
      if (importButton) {
        importButton.disabled = false;
        importButton.textContent = 'Importar / Actualizar';
      }
    }
}
