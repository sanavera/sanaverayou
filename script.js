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

async function searchSpotify(query, limit = 10) {
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
            thumb: item.album.images?.[0]?.url || ''
        }));

        const playlists = (data.playlists?.items || []).map(item => ({
            source: 'spotify',
            type: 'spotify_playlist',
            id: item.id,
            title: item.name,
            author: item.owner.display_name,
            thumb: item.images?.[0]?.url || ''
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
const YOUTUBE_API_KEYS = [
  "AIzaSyCLKvqx3vv4SYBrci4ewe3TbeWJ-wL2BsY",
  "AIzaSyB9CSgnqFP5xBuYil8zUuZ0nWGQMHBk_44",
  "AIzaSyD_WZVpBaXosHIzpHoS0JJcQFlB03jc9DE",
  "AIzaSyCiryC1WiODR0hisMRDeej5FPsTjF3MTTM",
  "AIzaSyC3-V6pED9HDjEYpgtU9Tcw8YcZem9pVM0",
  "AIzaSyDCjAPw7pG9GxRTsy-czuoRVF-u_Qu--hI",
  "AIzaSyDjcQqc8bL_bvO06OXIG_sR_LIUV0bX0cs",
  "AIzaSyB_alWAvGwiNWgowsZwf45tkR0Q9R04DJQ",
  "AIzaSyB_hGk25Hdpt6Q7jzOr8dR6h50m7lrJGNc",
  "AIzaSyAHjMoRWCpAuxp1hEb-nMxVPFdNAit_QnQ"
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
    
    const spotifyPlaylistRegex = /https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
    const match = q.match(spotifyPlaylistRegex);
    
    switchView("view-search");

    if (match && match[1]) {
        await handleSpotifyImport(match[1]);
    } else {
        await startSearch(q);
    }
});

/* ========= Importador de Spotify ========= */
async function handleSpotifyImport(playlistId) {
    const resultsContainer = $("#results");
    resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Importando desde Spotify...</h3><p>Esto puede tardar unos segundos.</p></div>`;
    updateHomeGridVisibility();

    try {
        const spotifyPlaylist = await fetchSpotifyPlaylist(playlistId);
        if (!spotifyPlaylist || spotifyPlaylist.tracks.length === 0) {
            throw new Error("No se pudo obtener la playlist o está vacía.");
        }
        
        const youtubeQueue = [];
        for (const track of spotifyPlaylist.tracks) {
            const ytEquivalent = await findYoutubeEquivalent(track);
            if (ytEquivalent) {
                youtubeQueue.push(ytEquivalent);
            }
        }
        
        if (youtubeQueue.length > 0) {
            resultsContainer.innerHTML = "";
            setQueue(youtubeQueue, 'youtube_playlist', 0);
            viewingPlaylistId = null;
            renderQueue(youtubeQueue, spotifyPlaylist.name);
            switchView('view-player');
            playCurrent(true);
        } else {
            throw new Error("No se encontraron equivalentes en YouTube para las canciones de la lista.");
        }

    } catch (error) {
        console.error("Error al importar desde Spotify:", error);
        resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Error al importar</h3><p>${error.message}</p></div>`;
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
        thumb: ytTrack.thumb || track.thumb, // Usar thumb de spotify como fallback
        originalId: track.id, // Guardar id original de spotify
        source: 'youtube' // La fuente final para reproducción es youtube
    } : null;
}


/* ========= Motor de búsqueda ========= */
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
    return { items: [], hasMore:false };
  }
}

/* ========= Búsqueda Mixta (CORREGIDA) ========= */
async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, pageToken:"", loading:false, hasMore:true };
  items = [];
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando...</h3></div>`;
  updateHomeGridVisibility();

  try{
    const [ytResult, spResult] = await Promise.all([
        youtubeSearch(query, '', 15), // Pedimos más resultados
        searchSpotify(query, 15)      
    ]);

    if(searchAbort.signal.aborted) return;

    // Lógica de mezcla mejorada para intercalar resultados
    const combined = [];
    const ytPlaylists = ytResult.items.filter(i => i.type === 'youtube_playlist');
    const ytVideos = ytResult.items.filter(i => i.type === 'youtube_video');
    const spPlaylists = spResult.playlists;
    const spTracks = spResult.tracks;

    const maxLength = Math.max(ytPlaylists.length, ytVideos.length, spPlaylists.length, spTracks.length);

    for (let i = 0; i < maxLength; i++) {
        if (spPlaylists[i]) combined.push(spPlaylists[i]);
        if (ytPlaylists[i]) combined.push(ytPlaylists[i]);
        if (spTracks[i]) combined.push(spTracks[i]);
        if (ytVideos[i]) combined.push(ytVideos[i]);
    }
    
    if(resultsEl) resultsEl.innerHTML = "";
    if(combined.length === 0) {
        if(resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron resultados.</p></div>`;
        return;
    }

    const deduped = dedupeById(combined);
    appendResults(deduped);
    items = deduped;
    paging.hasMore = false; // La paginación simple no funciona bien con resultados mezclados
  }catch(e){ 
      console.error('Falló la búsqueda mixta:', e); 
      if(resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>Ocurrió un error al buscar.</p></div>`;
  }
}

function dedupeById(arr){
  const seen = new Set();
  return arr.filter(it=>{ if(!it?.id || seen.has(it.id)) return false; seen.add(it.id); return true; });
}

async function loadNextPage(){
  // Desactivado para la búsqueda mixta.
  return;
}

/* ========= Render resultados (CORREGIDO) ========= */
function appendResults(chunk){
  const root = $("#results"); if(!root) return;
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.itemId = it.id;
    
    let indicator = '';
    let logo = '';

    switch(it.type) {
        case 'youtube_video':
            logo = youtubeLogoSvg();
            item.dataset.trackId = it.id;
            break;
        case 'youtube_playlist':
            logo = youtubeLogoSvg();
            item.classList.add("playlist-result-item");
            indicator = '<div class="playlist-indicator">LISTA</div>';
            break;
        case 'spotify_track':
            logo = spotifyLogoSvg();
            item.dataset.trackId = it.id; // Usamos el id de spotify como referencia inicial
            break;
        case 'spotify_playlist':
            logo = spotifyLogoSvg();
            item.classList.add("playlist-result-item", "spotify-playlist-result-item");
            indicator = '<div class="playlist-indicator">LISTA</div>';
            break;
    }

    item.innerHTML = `
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
    item.addEventListener("click", (e) => handleResultClick(e, it));

    const cardPlayBtn = item.querySelector(".card-play");
    if(cardPlayBtn) {
        cardPlayBtn.onclick = (e)=>{
          e.stopPropagation();
          // Para videos de YT, podemos hacer toggle. Para spotify, siempre inicia la búsqueda.
          if (currentTrack?.id === it.id && it.source === 'youtube') {
             togglePlay(); 
          } else { 
            handleResultClick(e, it, true);
          }
        };
    }

    root.appendChild(item);
  }
  refreshIndicators();
}


/* ========= Manejo de Clicks en Resultados ========= */
async function handleResultClick(event, item, forcePlay = false) {
    if (event.target.closest(".more") || (event.target.closest(".card-play") && !forcePlay)) return;

    switch (item.type) {
        case 'youtube_video':
            playFromSearch(item.id, true);
            break;
        case 'youtube_playlist':
            handlePlaylistResultClick(item.id, item.title);
            break;
        case 'spotify_track':
            playSpotifyTrack(item);
            break;
        case 'spotify_playlist':
            handleSpotifyImport(item.id);
            break;
    }
}

async function playSpotifyTrack(track) {
    const resultsContainer = $("#results");
    resultsContainer.innerHTML = `<div class="loading-indicator"><h3>Buscando en YouTube...</h3><p>${track.author} - ${track.title}</p></div>`;
    updateHomeGridVisibility();

    const ytEquivalent = await findYoutubeEquivalent(track);
    if (ytEquivalent) {
        resultsContainer.innerHTML = ""; 
        setQueue([ytEquivalent], "search", 0);
        viewingPlaylistId = null;
        playCurrent(true);
        switchView('view-player');
    } else {
        resultsContainer.innerHTML = `<div class="loading-indicator"><h3>No se encontró</h3><p>No se pudo encontrar un video para esta canción.</p></div>`;
    }
}

async function fetchPlaylistItems(playlistId, retryCount = 0) {
    const MAX_RETRIES = YOUTUBE_API_KEYS.length;
    if (retryCount >= MAX_RETRIES) {
        console.error(`Todas las API keys han fallado para la playlist ${playlistId}`);
        return [];
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    const apiKey = getRotatedApiKey();
    url.searchParams.append('key', apiKey);
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('playlistId', playlistId);
    url.searchParams.append('maxResults', 50);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 403) {
                console.warn(`API key 403 para playlistItems, rotando...`);
                return fetchPlaylistItems(playlistId, retryCount + 1);
            }
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        return data.items.map(item => ({
            id: item.snippet.resourceId.videoId,
            title: cleanTitle(item.snippet.title),
            author: cleanAuthor(item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle),
            thumb: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || ""
        })).filter(track => track.id);
    } catch (e) {
        console.error('Fallo al buscar items de la playlist:', e);
        return fetchPlaylistItems(playlistId, retryCount + 1);
    }
}

async function handlePlaylistResultClick(playlistId, playlistTitle) {
  try {
    const tracks = await fetchPlaylistItems(playlistId);
    if (tracks.length > 0) {
        setQueue(tracks, 'youtube_playlist', 0);
        viewingPlaylistId = null;
        renderQueue(tracks, playlistTitle);
        switchView('view-player');
        playCurrent(true);
    } else {
        alert("Esta lista de reproducción está vacía o es privada.");
    }
  } catch (e) {
    console.error("No se pudo cargar la playlist:", e);
    alert("No se pudo cargar la lista de reproducción.");
  }
}

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;

    const tracks = playlist.isRecommended ? playlist.data : playlist.tracks;
    if (!tracks || tracks.length === 0) return;

    const covers = tracks.slice(0, 4).map(track => track.thumb).filter(Boolean);
    while (covers.length < 4) {
        covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    }
    
    const logo = playlist.isRecommended ? youtubeLogoSvg() : spotifyLogoSvg();

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
                ${logo}
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
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${pl.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;
        
        card.querySelector('.pl-privacy-toggle input').addEventListener('change', (e) => {
            handlePrivacyToggle(pl.id, e.target.checked);
        });
        
        card.addEventListener("click", (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            showPlaylistInPlayer(pl.id);
            switchView("view-player");
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
    if (!name || !creator) { alert("Por favor, completa ambos campos."); return; }
    try {
        const { getFirestore, collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        $("#newPlName").value = ""; $("#newPlCreator").value = ""; $("#createPlaylistSheet").classList.remove("show");
    } catch (e) { console.error("Error creando playlist: ", e); alert("Hubo un error al crear la playlist."); }
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
      if (!updatedTracks.some(t => t.id === track.id)) { updatedTracks.unshift(track); }
      try {
        await updateDoc(plRef, { tracks: updatedTracks, updatedAt: serverTimestamp() });
        sheet.classList.remove("show");
      } catch(e) { console.error("Error agregando canción: ", e); alert("No se pudo agregar la canción."); }
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
    } catch (e) { console.error("Error creando playlist desde canción: ", e); alert("Hubo un error al crear la playlist."); }
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
  try { await updateDoc(plRef, { tracks: updatedTracks, updatedAt: serverTimestamp() }); } catch (e) { console.error("Error quitando canción: ", e); alert("No se pudo quitar la canción."); }
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
    panel && panel.classList.remove("hide");

    const header = panel.querySelector(".section-head");
    if (header) {
        let saveBtn = header.querySelector('#btnSavePlaylist');
        if (saveBtn) saveBtn.remove();
        
        const titleEl = header.querySelector('#queueTitle');
        if (titleEl) titleEl.textContent = title;

        if (queueType === 'youtube_playlist') {
            saveBtn = document.createElement('button');
            saveBtn.id = 'btnSavePlaylist';
            saveBtn.className = 'pill';
            saveBtn.textContent = 'Guardar Lista';
            saveBtn.onclick = saveCurrentQueueAsPlaylist;
            header.appendChild(saveBtn);
        }
    }

    const ul = $("#queueList");
    if (!ul) return;
    ul.innerHTML = "";

    const isUserPlaylist = queueType === 'playlist';
    if (!isUserPlaylist) viewingPlaylistId = null;

    (queueItems || []).forEach((t, i) => {
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
            qIdx = i; // Actualizamos el índice global
            setQueue(queueItems, queueType, i);
            playCurrent(true);
        };
        li.querySelector(".card-play").onclick = (e) => {
            e.stopPropagation();
            qIdx = i;
            setQueue(queueItems, queueType, i);
            playCurrent(true);
        };
        ul.appendChild(li);
    });
    refreshIndicators();
}

async function saveCurrentQueueAsPlaylist() {
    if (!queue || queue.length === 0 || queueType !== 'youtube_playlist') {
        alert("No hay una lista de reproducción válida para guardar."); return;
    }
    let creator = localStorage.getItem('sy_creator_name');
    if (!creator) {
        creator = prompt("Para guardar, ingresá tu nombre de creador:")?.trim();
        if (!creator) return; 
        localStorage.setItem('sy_creator_name', creator);
    }
    const btn = $('#btnSavePlaylist');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    try {
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), { name: currentQueueTitle, creator, tracks: queue, updatedAt: serverTimestamp(), isPublic: true });
        addMyPlaylistId(docRef.id);
        if (btn) { btn.textContent = 'Guardada ✔'; }
    } catch (e) {
        console.error("Error guardando la playlist: ", e); alert("Hubo un error al guardar la playlist.");
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar Lista'; }
    }
}


function showPlaylistInPlayer(plId){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;
  queueType = 'playlist';
  setQueue(pl.tracks, 'playlist', qIdx > -1 ? qIdx : 0);
  renderQueue(pl.tracks, pl.name);
}
function hideQueuePanel(){ $("#queuePanel")?.classList.add("hide"); $("#queueList") && ($("#queueList").innerHTML=""); viewingPlaylistId=null; renderPlaylists(); }

/* ========= Menú tres puntitos global ========= */
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".icon-btn.more");
    if (!btn) return;

    const resultItemEl = btn.closest(".result-item");
    if (resultItemEl) {
        const id = resultItemEl.dataset.itemId;
        const it = items.find(x => x.id === id);
        if (!it) return;

        let trackForActions = { ...it }; // Clonar item

        // Si es de Spotify, necesitamos su equivalente de YT para agregarlo
        if (it.source === 'spotify' && it.type === 'spotify_track') {
            const ytEquivalent = await findYoutubeEquivalent(it);
            if (!ytEquivalent) {
                alert("No se pudo encontrar esta canción en YouTube para agregarla a tus listas.");
                return;
            }
            trackForActions = ytEquivalent;
        }
        
        // No se puede agregar una playlist a otra playlist
        if (it.type.includes('playlist')) {
             // Podríamos ofrecer "Reproducir" o "Importar" en el futuro
            return;
        }

        openActionSheet({
            title: trackForActions.title,
            actions: [
                { id: "fav", label: isFav(trackForActions.id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
                { id: "pl", label: "Agregar a playlist" },
                { id: "cancel", label: "Cancelar", ghost: true }
            ],
            onAction: (act) => {
                if (act === "fav") toggleFav(trackForActions);
                if (act === "pl") openPlaylistSheet(trackForActions);
            }
        });
        return;
    }
    // ... El resto del código para favItem, queueItem, plItem (sin cambios)
});


/* ========= Indicadores ========= */
function refreshIndicators(){
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    const trackId = el.dataset.trackId;
    const isCurrentTrack = trackId === curId;
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
  if(!mediaSessionHandlersSet){mediaSessionHandlersSet=true; const s=fn=>()=>{try{fn()}catch(e){}}; try{navigator.mediaSession.setActionHandler('play',s(()=>togglePlay())); navigator.mediaSession.setActionHandler('pause',s(()=>togglePlay())); navigator.mediaSession.setActionHandler('previoustrack',s(()=>prev())); navigator.mediaSession.setActionHandler('nexttrack',s(()=>next())); navigator.mediaSession.setActionHandler('seekbackward',s(d=>{const o=d.seekOffset||10;if(!YT_READY)return;ytPlayer.seekTo(Math.max(0,(ytPlayer.getCurrentTime()||0)-o),true)})); navigator.mediaSession.setActionHandler('seekforward',s(d=>{const o=d.seekOffset||10;if(!YT_READY)return;ytPlayer.seekTo((ytPlayer.getCurrentTime()||0)+o,true)})); navigator.mediaSession.setActionHandler('seekto',d=>{s(()=>{if(!YT_READY||!d||typeof d.seekTime!=='number')return;ytPlayer.seekTo(d.seekTime,true)})()});}catch(e){}}
  try{const st=getPlaybackState(); navigator.mediaSession.playbackState=(st==='playing'?'playing':(st==='paused'?'paused':'none'));}catch{}
}
/* ===== Android bridge (AIDE WebView) ===== */
function canUseAndroidBridge(){ try { return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification); } catch(e){ return false; } }
function updateAndroidNotification(){ if (!canUseAndroidBridge()) return; const isPlaying = (typeof getPlaybackState === 'function') ? (getPlaybackState() === 'playing') : (YT_READY && ytPlayer && (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING || ytPlayer.getPlayerState() === YT.PlayerState.BUFFERING)); if (!currentTrack) { AndroidBridge.stopNotification(); return; } AndroidBridge.updateNotification( currentTrack.title || '', cleanAuthor(currentTrack.author || ''), currentTrack.thumb || '', !!isPlaying ); }
window.handleNativeControl = function(c){ const a=String(c||'').toLowerCase(); if(a==='action_play'){if(YT_READY&&ytPlayer)ytPlayer.playVideo();return} if(a==='action_pause'){if(YT_READY&&ytPlayer)ytPlayer.pauseVideo();return} if(a==='action_next'){next();return} if(a==='action_prev'){prev();return} };


/* ========= Init ========= */
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
    renderPlaylists(); renderAllHomePlaylists();
    if (viewingPlaylistId && queueType === 'playlist') {
      const updatedPlaylist = communityPlaylists.find(p => p.id === viewingPlaylistId);
      if(updatedPlaylist){
        const currentId=currentTrack?currentTrack.id:null; renderQueue(updatedPlaylist.tracks,updatedPlaylist.name); setQueue(updatedPlaylist.tracks,'playlist',qIdx); const newIdx=updatedPlaylist.tracks.findIndex(t=>t.id===currentId);
        if(newIdx!==-1){qIdx=newIdx}else{qIdx=Math.min(qIdx,updatedPlaylist.tracks.length-1);if(updatedPlaylist.tracks.length===0){currentTrack=null;ytPlayer.stopVideo()}else{currentTrack=queue[qIdx]} updateUIOnTrackChange()}
      }else{hideQueuePanel();if(queueType==='playlist'){currentTrack=null;queue=null;ytPlayer.stopVideo();updateUIOnTrackChange()}}
    }
  });

  const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
  const results = await Promise.all(fetchPromises);
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });
  
  renderAllHomePlaylists();
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
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && p.tracks && p.tracks.length > 0);
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => { const dateA = a.updatedAt?.toDate() || new Date(0); const dateB = b.updatedAt?.toDate() || new Date(0); return dateB - dateA; });
    const container = $("#allPlaylistsContainer");
    if(container) container.innerHTML = "";
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

boot();

window.addEventListener('beforeunload', savePlayerState);
window.addEventListener('beforeunload', function(){ if (canUseAndroidBridge()) AndroidBridge.stopNotification(); });
