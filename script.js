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
  reggae: {
    ids: ['HNBCVM4KbUM', 'IT8XvzIfi4U', '69RdQFDuYPI', 'vdB-8eLEW8g', 'yv5xonFSC4c', 'oqVy6eRXc7Q', 'zXt56MB-3vc', 'f7OXGANW9Ic', 'MrHxhQPOO2c', '1ti2YCFgCoI', '_GZlJGERbvE', 'LfeIfiiBTfY'],
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
    ids: ['djV11Xbc914', 'Zi_XLOBDo_Y', '3JWTaaS7LdU', 'n4RjJKxsamQ', 'vx2u5uUu3DE', 'PIb6AZdTr-A', '9jK-NcRmVcw', 'dQw4w9WgXcQ', 'FTQbiNvZqaY', 'rY0WxgSXdEE', 'YkADj0TPrJA', '0-EF60neguk'],
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

async function searchSpotify(query, limit = 20) {
    const token = await getSpotifyToken();
    if (!token) return { tracks: [], playlists: [] };

    try {
        const url = new URL('https://api.spotify.com/v1/search');
        url.searchParams.append('q', query);
        url.searchParams.append('type', 'track,playlist');
        url.searchParams.append('limit', limit);
        url.searchParams.append('market', 'AR');

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('No se pudo buscar en Spotify');
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
        console.error("Error en la búsqueda de Spotify:", e);
        return { tracks: [], playlists: [] };
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
                source: 'spotify',
                type: 'spotify_track',
                id: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean)
        };
    } catch (e) {
        console.error("Error al buscar playlist en Spotify:", e);
        return null;
    }
}

/* ========= API YouTube ========= */
let currentApiKeyIndex = 0;
const getRotatedApiKey = () => {
  const k = YOUTUBE_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % YOUTUBE_API_KEYS.length;
  return k;
};

async function youtubeSearch(query, pageToken = '', limit = 20, retryCount = 0){
  const MAX_RETRIES = YOUTUBE_API_KEYS.length;
  if(retryCount >= MAX_RETRIES) throw new Error('Todas las API keys de YouTube han fallado.');
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  const apiKey = getRotatedApiKey();
  url.searchParams.append('key', apiKey);
  url.searchParams.append('q', query);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('type', 'video,playlist');
  url.searchParams.append('maxResults', limit);
  if(pageToken) url.searchParams.append('pageToken', pageToken);
  try{
    const response = await fetch(url);
    if(!response.ok){
      if(response.status===403){
        console.warn(`API key de YouTube ${apiKey} 403 → rotando`);
        return youtubeSearch(query, pageToken, limit, retryCount+1);
      }
      throw new Error(`API error de YouTube: ${response.status}`);
    }
    const data = await response.json();
    const resultItems = data.items.map(item => {
        if (item.id.kind === 'youtube#video') {
            return {
                source: 'youtube',
                type: 'youtube_video',
                id: item.id.videoId,
                title: cleanTitle(item.snippet.title),
                author: cleanAuthor(item.snippet.channelTitle),
                thumb: item.snippet.thumbnails?.high?.url || ""
            };
        } else if (item.id.kind === 'youtube#playlist') {
            return {
                source: 'youtube',
                type: 'youtube_playlist',
                id: item.id.playlistId,
                title: cleanTitle(item.snippet.title),
                author: cleanAuthor(item.snippet.channelTitle),
                thumb: item.snippet.thumbnails?.high?.url || ""
            };
        }
        return null;
    }).filter(Boolean);
    return { items: resultItems, nextPageToken: data.nextPageToken, hasMore: !!data.nextPageToken };
  }catch(e){
    console.error('Fallo en búsqueda de YouTube:', e);
    return { items: [], hasMore:false, nextPageToken: null };
  }
}

async function findYoutubeEquivalent(track) {
    if (!track || !track.title) return null;
    const searchQuery = `${track.author} - ${track.title}`;
    const searchResult = await youtubeSearch(searchQuery, '', 1);
    const ytTrack = searchResult.items.find(item => item.type === 'youtube_video');
    
    return ytTrack ? {
        id: ytTrack.id,
        title: ytTrack.title,
        author: ytTrack.author,
        thumb: ytTrack.thumb || track.thumb,
        originalId: track.id,
        source: 'youtube'
    } : null;
}


/* ========= Búsqueda Mixta con Scroll Infinito (CORREGIDO Y COMPLETO) ========= */
async function startSearch(query) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    
    paging = { query, ytPageToken: null, loading: true, hasMore: true };
    items = [];
    
    const resultsEl = $("#results");
    if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando en YouTube y Spotify...</h3></div>`;
    updateHomeGridVisibility();

    try {
        const [ytResult, spResult] = await Promise.all([
            youtubeSearch(query, '', 30),
            searchSpotify(query, 20)
        ]);

        if (searchAbort.signal.aborted) return;
        
        paging.ytPageToken = ytResult.nextPageToken;
        paging.hasMore = !!ytResult.nextPageToken;

        const combinedResults = [
            ...spResult.playlists,
            ...ytResult.items.filter(i => i.type === 'youtube_playlist'),
            ...spResult.tracks,
            ...ytResult.items.filter(i => i.type === 'youtube_video')
        ];

        if (resultsEl) resultsEl.innerHTML = "";

        if (combinedResults.length === 0 && !paging.hasMore) {
            if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron resultados.</p></div>`;
            return;
        }

        items = dedupeById(combinedResults);
        appendResults(items);
        
    } catch (e) {
        console.error('Falló la búsqueda inicial:', e);
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Ocurrió un error al buscar.</p></div>`;
    } finally {
        paging.loading = false;
    }
}

async function loadNextPage() {
    if (paging.loading || !paging.hasMore || !paging.ytPageToken) return;
    paging.loading = true;

    try {
        const result = await youtubeSearch(paging.query, paging.ytPageToken, 20);
        if (result.items.length > 0) {
            const newItems = dedupeById(result.items);
            appendResults(newItems);
            items = items.concat(newItems);
        }
        paging.ytPageToken = result.nextPageToken;
        paging.hasMore = result.hasMore;
    } catch (e) {
        console.error("Error cargando más resultados:", e);
        paging.hasMore = false;
    } finally {
        paging.loading = false;
    }
}

function dedupeById(arr) {
    const seen = new Set(items.map(i => i.id));
    return arr.filter(it => {
        if (!it?.id || seen.has(it.id)) return false;
        seen.add(it.id);
        return true;
    });
}


/* ========= Render Resultados (CORREGIDO) ========= */
function appendResults(chunk) {
    const root = $("#results");
    if (!root) return;
    for (const it of chunk) {
        const itemEl = document.createElement("article");
        itemEl.className = "result-item";
        itemEl.dataset.itemId = it.id;
        
        let indicator = '', logo = '';

        if (it.source === 'spotify') {
            logo = spotifyLogoSvg();
            if (it.type === 'spotify_playlist') {
                itemEl.classList.add("playlist-result-item");
                indicator = '<div class="playlist-indicator">LISTA</div>';
            }
        } else { // YouTube
            logo = youtubeLogoSvg();
            itemEl.dataset.trackId = it.id; // Clave para la reproducción
            if (it.type === 'youtube_playlist') {
                itemEl.classList.add("playlist-result-item");
                indicator = '<div class="playlist-indicator">LISTA</div>';
            }
        }

        itemEl.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
            ${indicator}
            ${it.type.includes('video') || it.type.includes('track') ? 
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
        itemEl.addEventListener("click", (e) => handleResultClick(e, it));
        const cardPlayBtn = itemEl.querySelector(".card-play");
        if(cardPlayBtn) cardPlayBtn.onclick = (e)=>{ e.stopPropagation(); if (currentTrack?.id === it.id && it.source === 'youtube') { togglePlay(); } else { handleResultClick(e, it, true); } };
        root.appendChild(itemEl);
    }
    refreshIndicators();
}


/* ========= Lógica de Clicks y Reproducción ========= */
async function handleResultClick(event, item, forcePlay = false) {
    if (event.target.closest(".more") || (event.target.closest(".card-play") && !forcePlay)) return;
    switch (item.type) {
        case 'youtube_video': playFromSearch(item.id, true); break;
        case 'youtube_playlist': handleYTPlaylistClick(item.id, item.title); break;
        case 'spotify_track': playSpotifyTrack(item); break;
        case 'spotify_playlist': handleSpotifyImport(item.id); break;
    }
}

async function playSpotifyTrack(track) {
    const resultsContainer = $("#results");
    const originalContent = resultsContainer.innerHTML;
    resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Buscando en YouTube...</h3><p>${track.author} - ${track.title}</p></div>`;
    
    const ytEquivalent = await findYoutubeEquivalent(track);
    
    if (ytEquivalent) {
        setQueue([ytEquivalent], "search", 0);
        playCurrent(true);
        switchView('view-player');
    } else {
        alert("No se pudo encontrar un video para esta canción.");
        resultsContainer.innerHTML = originalContent; 
    }
}

async function handleYTPlaylistClick(playlistId, title) {
    try {
        const tracks = await fetchYTPlaylistItems(playlistId);
        if (tracks.length > 0) {
            setQueue(tracks, 'youtube_playlist', 0);
            renderQueue(tracks, title);
            switchView('view-player');
            playCurrent(true);
        } else { alert("Esta lista de reproducción está vacía o es privada."); }
    } catch (e) { console.error("No se pudo cargar la playlist:", e); alert("No se pudo cargar la lista de reproducción."); }
}

async function fetchYTPlaylistItems(playlistId, retryCount = 0) {
    const MAX_RETRIES = YOUTUBE_API_KEYS.length;
    if (retryCount >= MAX_RETRIES) { console.error(`Fallo total de keys para playlist ${playlistId}`); return []; }
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    const apiKey = getRotatedApiKey();
    url.searchParams.append('key', apiKey);
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('playlistId', playlistId);
    url.searchParams.append('maxResults', 50);
    try {
        const r = await fetch(url);
        if (!r.ok) {
            if (r.status === 403) { console.warn(`API key 403 para playlistItems, rotando...`); return fetchYTPlaylistItems(playlistId, retryCount + 1); }
            throw new Error(`API error: ${r.status}`);
        }
        const d = await r.json();
        return d.items.map(item => ({ id: item.snippet.resourceId.videoId, title: cleanTitle(item.snippet.title), author: cleanAuthor(item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle), thumb: item.snippet.thumbnails?.high?.url || "" })).filter(t => t.id);
    } catch (e) { console.error('Fallo al buscar items de la playlist:', e); return fetchYTPlaylistItems(playlistId, retryCount + 1); }
}

async function handleSpotifyImport(playlistId) {
    switchView('view-search');
    const resultsContainer = $("#results");
    resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Importando desde Spotify...</h3><p>Esto puede tardar unos segundos...</p></div>`;
    try {
        const spPlaylist = await fetchSpotifyPlaylist(playlistId);
        if (!spPlaylist || spPlaylist.tracks.length === 0) throw new Error("Playlist vacía o no encontrada.");
        const ytQueue = (await Promise.all(spPlaylist.tracks.map(findYoutubeEquivalent))).filter(Boolean);
        if (ytQueue.length > 0) {
            setQueue(ytQueue, 'youtube_playlist', 0);
            renderQueue(ytQueue, spPlaylist.name);
            switchView('view-player');
            playCurrent(true);
        } else { throw new Error("No se encontraron canciones en YouTube."); }
    } catch (error) { console.error("Error importando de Spotify:", error); alert(error.message); startSearch(paging.query || ""); }
}


/* ========= Nav, UI, Player, etc. (Código completo) ========= */
// (Se incluye el resto del código que ya funcionaba correctamente)

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
    const spotifyPlaylistRegex = /https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
    const match = q.match(spotifyPlaylistRegex);
    switchView("view-search");
    if (match && match[1]) {
        await handleSpotifyImport(match[1]);
    } else {
        await startSearch(q);
    }
});

function updateHomeGridVisibility(){
  const home = $("#homeSection"); if(!home) return;
  const shouldShow = (items.length===0 && !$(".loading-indicator"));
  home.classList.toggle("hide", !shouldShow);
}

function playFromSearch(trackId, autoplay=false) {
    const allVideos = items.filter(it => it.type === 'youtube_video' || it.source === 'youtube');
    const videoIndex = allVideos.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(allVideos, "search", videoIndex);
        playCurrent(autoplay);
    }
}

function setQueue(srcArr, type, idx){
  let finalSrc = srcArr;
  if (isShuffle) {
    const currentItem = srcArr[idx];
    const others = srcArr.filter((_, i) => i !== idx);
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
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(autoplay) ytPlayer.playVideo();
  startTimer();
  updateUIOnTrackChange();
}

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
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  $("#npSub").textContent = t ? cleanAuthor(t.author) : "—";
}

function updateMiniNow(){
  const has = !!currentTrack;
  $("#seekDock").classList.toggle("show", has);
  if(!has) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  $("#miniAuthor").textContent = cleanAuthor(currentTrack.author);
}

function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";
  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    let elTrackId = el.dataset.trackId;
    if (currentTrack?.originalId && el.dataset.itemId === currentTrack.originalId) {
        elTrackId = currentTrack.id;
    }
    const isCurrent = elTrackId === curId;
    el.classList.toggle("is-playing", isCurrent);
    const playBtn = el.querySelector(".card-play");
    if (playBtn) playBtn.classList.toggle("playing", isPlaying && isCurrent);
  });
  $("#npPlay").classList.toggle("playing", isPlaying);
  $("#miniPlay").classList.toggle("playing", isPlaying);
}

function updateControlStates() {
  $("#btnShuffle")?.classList.toggle('active', isShuffle);
  $("#btnRepeat")?.classList.toggle('active', repeatMode !== 'none');
}

function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY || !currentTrack || getPlaybackState() !== 'playing') return;
    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur").textContent = fmt(cur); $("#dur").textContent = fmt(dur); $("#seek").value = dur ? (cur/dur)*1000 : 0;
    $("#miniCur").textContent = fmt(cur); $("#miniDur").textContent = fmt(dur); $("#miniSeek").value = dur ? (cur/dur)*1000 : 0;
  }, 500);
}

function stopTimer(){ clearInterval(timer); }

function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('player', {
        height: '150', width: '300',
        playerVars: { 'playsinline': 1, 'controls': 0, 'rel': 0 },
        events: {
            'onReady': () => { YT_READY = true; window.dispatchEvent(new Event('yt-ready')); },
            'onStateChange': (event) => {
                if (event.data === YT.PlayerState.ENDED) next();
                refreshIndicators();
            }
        }
    });
}

const sentinel = $("#sentinel");
if (sentinel){
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadNextPage();
  }, { rootMargin: "800px" });
  observer.observe(sentinel);
}

function next() {
    if (!queue || queue.length === 0) return;
    if (repeatMode === 'one') {
        playCurrent(true);
        return;
    }
    let nextIndex = qIdx + 1;
    if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
            nextIndex = 0;
        } else {
            ytPlayer.stopVideo();
            currentTrack = null;
            updateUIOnTrackChange();
            return;
        }
    }
    qIdx = nextIndex;
    playCurrent(true);
}

function prev() {
    if (!queue || queue.length === 0) return;
    if (ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0, true);
    } else {
        qIdx = (qIdx - 1 + queue.length) % queue.length;
        playCurrent(true);
    }
}

function togglePlay() {
    if (!ytPlayer || !currentTrack) return;
    const state = getPlaybackState();
    if (state === 'playing') ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
}

$("#btnNext").addEventListener("click", next);
$("#btnPrev").addEventListener("click", prev);
$("#npPlay").addEventListener("click", togglePlay);
$("#miniPlay").addEventListener("click", togglePlay);
$("#seek").addEventListener("input", e => ytPlayer.seekTo(ytPlayer.getDuration() * (e.target.value / 1000)));
$("#miniSeek").addEventListener("input", e => ytPlayer.seekTo(ytPlayer.getDuration() * (e.target.value / 1000)));
$("#btnShuffle").addEventListener("click", () => { isShuffle = !isShuffle; updateControlStates(); });
$("#btnRepeat").addEventListener("click", () => {
    const modes = ['none', 'all', 'one'];
    repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    updateControlStates();
});


function renderQueue(queueItems, title) {
    $("#queuePanel").classList.remove('hide');
    $("#queueTitle").textContent = title;
    const list = $("#queueList");
    list.innerHTML = '';
    queueItems.forEach((track, index) => {
        const item = document.createElement('li');
        item.className = 'queue-item';
        item.dataset.trackId = track.id;
        item.innerHTML = `
            <div class="thumb-wrap">
                <img class="thumb" src="${track.thumb}" alt="">
            </div>
            <div class="meta">
                <div class="title-text">${track.title}</div>
                <div class="subtitle">${cleanAuthor(track.author)}</div>
            </div>
        `;
        item.onclick = () => {
            qIdx = index;
            playCurrent(true);
        };
        list.appendChild(item);
    });
    refreshIndicators();
}
//... Y el resto de funciones que estaban en el original
// (Firebase, Favoritos, etc)

async function boot(){
  initTheme();
  
  const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  window.firebase = { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc };
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // renderPlaylists();
    // renderAllHomePlaylists();
  });

    const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
  const results = await Promise.all(fetchPromises);
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });
  
  // renderAllHomePlaylists();
  updateHomeGridVisibility();

  loadFavs();
  // renderFavs();
  loadYTApi();
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
  // heroScrollInvalidate();
  document.title = "SanaveraYou Pro";
}

let heroScrollInvalidate = () => {};

document.addEventListener('DOMContentLoaded', () => {
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
    
    heroScrollInvalidate = () => {
        lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        if(!rafPending){
            rafPending = true;
            requestAnimationFrame(heroScrollTickRaf);
        }
    };
    
    window.addEventListener("scroll", heroScrollInvalidate, { passive:true });
    window.addEventListener("resize", heroScrollInvalidate, { passive:true });
    heroScrollInvalidate();
});
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_FAVS)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_FAVS, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)) favs = favs.filter(f=>f.id!==track.id);
  else favs.unshift(track);
  saveFavs(); renderFavs(); refreshIndicators();
}

function updateMediaSession(track){ /* ... */ }
function updateAndroidNotification(){ /* ... */ }

boot();
