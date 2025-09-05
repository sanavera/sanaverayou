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
            expires: Date.now() + (data.expires_in * 1000) - 60000 // Refresh 1 min before expiry
        };
        return spotifyToken.value;
    } catch (e) {
        console.error("Error getting Spotify token:", e);
        return null;
    }
}

async function fetchSpotifyPlaylist(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return null;

    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Could not get Spotify playlist: ${response.statusText}`);
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
        console.error("Error fetching Spotify playlist:", e);
        return null;
    }
}

/* ========= Lógica de Scraping de YouTube (Reemplazo de API) ========= */
const uniq = a => [...new Set(a)];

// Función de reintento para peticiones fetch
async function withRetry(fn, retries = 2, delay = 300) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries) {
                 console.error("Scraping failed after all retries.", e);
                 throw e;
            }
            console.warn(`Scraping attempt ${i + 1} failed. Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// NUEVA FUNCIÓN: Solo para obtener la URL de YouTube para el importador de Spotify
async function scrapeYoutubeUrlOnly(query) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const html = await fetch(endpoint, { headers: { 'Accept': 'text/plain' } }).then(r => {
            if (!r.ok) throw new Error(`Proxy failed with status ${r.status}`);
            return r.text();
        });
        
        // Prioritize official music videos or similar content
        const priorityRegex = /watch\?v=([\w-]{11})[^\s"'<]*" aria-label="[^"]*(official video|video oficial|music video)[^"]*/i;
        const priorityMatch = html.match(priorityRegex);
        if (priorityMatch) return priorityMatch[1];
        
        const genericMatch = html.match(/watch\?v=([\w-]{11})/);
        return genericMatch ? genericMatch[1] : null;
    });
}


// Función de scraping para el buscador principal (usa noembed)
async function scrapeYoutube(query, limit = 20) {
    return withRetry(async () => {
        const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const html = await fetch(endpoint, { headers: { 'Accept': 'text/plain' } }).then(r => {
            if (!r.ok) throw new Error(`Proxy failed with status ${r.status}`);
            return r.text();
        });

        const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1])).slice(0, limit);
        if (!ids.length) return [];
        
        const metadataPromises = ids.map(id => 
            fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
                .then(r => r.json())
                .then(meta => {
                    if (meta.error) return null;
                    return {
                        id,
                        title: cleanTitle(meta.title || `Video ${id}`),
                        thumb: (meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
                        author: cleanAuthor(meta.author_name || "YouTube"),
                        source: 'youtube', type: 'youtube_video', isTopic: /topic/i.test(meta.author_name || "")
                    };
                })
                .catch(() => ({ // Fallback si noembed falla
                    id, title: `Video ${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                    author: "YouTube", source: 'youtube', type: 'youtube_video', isTopic: false
                }))
        );
        
        return (await Promise.all(metadataPromises)).filter(Boolean);
    });
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

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const view = $("#"+id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id!=="view-search") {
      updateHomeGridVisibility();
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
    await startSearch(q);
});

/* ========= Búsqueda (Lógica Principal) ========= */
let paging = { query:"", loading:false };

async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  paging = { query, loading: true };
  items = [];
  const resultsEl = $("#results");
  if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><h3>Buscando… espere</h3></div>`;
  updateHomeGridVisibility();
  $('#search-filters')?.classList.add('hide'); // Ocultar filtros siempre

  try {
    const videoResults = await scrapeYoutube(query, 20);
    if (searchAbort.signal.aborted) return;
    
    if (resultsEl) resultsEl.innerHTML = "";

    if (videoResults.length === 0) {
        if (resultsEl) resultsEl.innerHTML = `<div class="loading-indicator"><p>No se encontraron videos.</p></div>`;
        return;
    }

    items = videoResults;
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

    let logo = youtubeLogoSvg();
    if (it.isTopic) {
        logo = Math.random() < 0.5 ? spotifyLogoSvg() : youtubeMusicLogoSvg();
    }
    
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

    if (item.type === 'youtube_video') {
        playFromSearch(item.id, true);
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
        thumb: track.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'youtube',
        type: 'youtube_video',
        isTopic: false, 
        originalId: track.id || track.spotifyId,
    };
}

/* ========= Home grid ========= */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    
    let trackCount = playlist.trackCount || playlist.tracks?.length || playlist.spotifyTracks?.length || 0;
    if (playlist.isRecommended) {
        trackCount = playlist.data.length;
    }
    if (trackCount === 0) return;

    let covers = (playlist.tracks || playlist.data || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) {
        covers.push(playlist.cover);
    }
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
            originalOwnerId: originalPlaylist.ownerUserId || null, // Optional reference
            ownerUserId: 'current_user_id', // Replace with actual user ID if auth exists
        };
        // Do not copy resolver state fields
        delete newPlaylistData.id;
        delete newPlaylistData.resolverJobId;
        delete newPlaylistData.status;
        delete newPlaylistData.resolvedCount;
        
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
        
        const total = pl.trackCount || pl.spotifyTracks?.length || pl.tracks?.length || 0;
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

        card.querySelector(".more").addEventListener("click", (e) => {
            e.stopPropagation();
            openPlaylistOptionsMenu(pl);
        });

        card.querySelector('.pl-privacy-toggle input').addEventListener('change', (e) => {
            e.stopPropagation();
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

async function removeFromPlaylist(plId, trackId) {
const pl = (typeof communityPlaylists !== 'undefined' && Array.isArray(communityPlaylists))
  ? communityPlaylists.find(p => p && p.id === plId)
  : null;
if (!pl) return;

const { db, doc, updateDoc, setDoc, serverTimestamp } = sy_fs();
if (!db || !doc || (!updateDoc && !setDoc)) {
  console.error('Firestore no disponible: faltan funciones doc/updateDoc/setDoc');
  if (typeof showToast === 'function') showToast('No se pudo quitar la canción. Falta Firestore.', true);
  return;
}

// Build new tracks without the removed one
const updatedTracks = (pl.tracks || []).filter(t => t && t.id !== trackId);

const payload = {
  tracks: updatedTracks,
  resolvedCount: updatedTracks.length,
  updatedAt: serverTimestamp ? serverTimestamp() : Date.now()
};

// Keep consistency for spotify-backed lists
if (pl.source === 'spotify' && Array.isArray(pl.spotifyTracks)) {
  const removed = (pl.tracks || []).find(t => t && t.id === trackId);
  if (removed && removed.originalId) {
    const updatedSpotifyTracks = pl.spotifyTracks.filter(st => st.spotifyId !== removed.originalId);
    payload.spotifyTracks = updatedSpotifyTracks;
    payload.trackCount = updatedSpotifyTracks.length;
  } else {
    const baseCount = (typeof pl.trackCount === 'number') ? pl.trackCount : (pl.spotifyTracks ? pl.spotifyTracks.length : 0);
    payload.trackCount = Math.max(0, baseCount - 1);
  }
}

// 1) Real-time sync (UI + queue + player)
sy_syncRemovalRealtime(plId, trackId);

try {
  const plRef = doc(db, 'playlists', plId);
  if (typeof updateDoc === 'function') {
    await updateDoc(plRef, payload);
  } else {
    await setDoc(plRef, payload, { merge: true });
  }
  if (typeof showToast === 'function') showToast('Canción eliminada.');
} catch (e) {
  console.error('Error removing song:', e);
  if (typeof showToast === 'function') showToast('No se pudo quitar la canción.', true);
  // Soft rollback visuals
  if (typeof renderPlaylists === 'function') renderPlaylists();
  if (typeof queueType !== 'undefined' && typeof viewingPlaylistId !== 'undefined' && queueType === 'playlist' && viewingPlaylistId === plId) {
    const plNow = (typeof communityPlaylists !== 'undefined' && Array.isArray(communityPlaylists))
      ? communityPlaylists.find(p => p && p.id === plId)
      : null;
    if (plNow && typeof renderQueue === 'function') renderQueue((plNow.tracks || []).filter(t => t && t.id), plNow.name || '');
    if (typeof refreshIndicators === 'function') refreshIndicators();
  }
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
    
    if ((queueType === 'youtube_playlist' || queueType === 'spotify_playlist_unresolved') && queue?.length > 0) {
        const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
        if (pl && !isMyPlaylist(pl.id)) {
            const saveBtn = document.createElement('button');
            saveBtn.id = 'btnSavePlaylist';
            saveBtn.className = 'pill';
            saveBtn.textContent = 'Guardar Copia';
            saveBtn.onclick = () => savePlaylistCopy(pl);
            header.appendChild(saveBtn);
        }
    }
    
    const ul = $("#queueList");
    if (!ul) return;
    ul.innerHTML = "";

    const isUserPlaylist = queueType === 'playlist';
    if (!isUserPlaylist && queueType !== 'spotify_playlist_unresolved') viewingPlaylistId = null;

    (queueItems || []).forEach((t, i) => {
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
        </button>` : `<div class="pending-indicator">Pendiente</div>`}
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
        const tracksToShow = (pl.tracks?.length > 0 && pl.tracks.some(t => t)) ? pl.tracks.map((t, i) => t || { ...pl.spotifyTracks[i], id: null, thumb: pl.spotifyTracks[i].thumb || pl.cover }) : pl.spotifyTracks.map(st => ({...st, thumb: st.thumb || pl.cover, id: null}));
        renderQueue(tracksToShow, pl.name);
        
        if (pl.status !== 'resolving') {
            startResolverJob(plId);
        } else {
            console.log("Job is already running for this playlist. Attaching listener.");
            const { doc, onSnapshot } = window.firebase;
            const jobRef = doc(db, "resolverJobs", pl.resolverJobId);
            if (resolverJobUnsubscribe) resolverJobUnsubscribe();
            resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
                if (!docSnap.exists()) return;
                const job = { id: docSnap.id, ...docSnap.data() };
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
             startResolverJob(pl.id); // Offer to start job
        } else {
             showToast(`La playlist "${pl.name}" está vacía.`, true);
        }
        switchView('view-playlists');
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
        track = items.find(x => x.id === trackId);
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
  try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title||'Reproduciendo',artist:cleanAuthor(track.author)||'—',album:queueType==='playlist'?(communityPlaylists.find(p=>p.id===viewingPlaylistId)?.name||''):'',artwork:[{src:track.thumb,sizes:'512x512',type:'image/jpeg'}]});}catch(e){ console.error("Media Session Error:", e)}
  if(!mediaSessionHandlersSet){
    mediaSessionHandlersSet=true;
    const s=fn=>()=>{try{fn()}catch(e){console.error("Media Session Action Error:", e)}};
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
    }catch(e){console.error("Error setting Media Session handlers:", e)}
}  try{const st=getPlaybackState(); navigator.mediaSession.playbackState=(st==='playing'?'playing':(st==='paused'?'paused':'none'));}catch(e){}
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
  const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
  window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc };
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
    const oldPlaylists = new Map(communityPlaylists.map(p => [p.id, p]));
    communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    communityPlaylists.forEach(newPl => {
        const oldPl = oldPlaylists.get(newPl.id);
        // Check if the playlist was meaningfully updated
        const playlistWasUpdated = oldPl && newPl.updatedAt && oldPl.updatedAt && newPl.updatedAt.seconds > oldPl.updatedAt.seconds;
        
        // BUG FIX: This is the new, robust real-time update logic
        if (playlistWasUpdated && viewingPlaylistId === newPl.id && queueType === 'playlist') {
            console.log(`Playlist '${newPl.name}' updated in real-time.`);

            // 1. Get new state from Firestore data
            const newPlayableTracks = (newPl.tracks || []).filter(t => t && t.id);
            const currentTrackId = currentTrack ? currentTrack.id : null;

            // 2. Immediately update the visual queue for the user
            // We construct a list that includes unresolved tracks for visual consistency
            let tracksToShow = newPl.tracks || [];
            if (newPl.source === 'spotify') {
                tracksToShow = (newPl.tracks || Array(newPl.spotifyTracks.length).fill(null)).map((track, index) => {
                    if (track) return track;
                    if (newPl.spotifyTracks && newPl.spotifyTracks[index]) {
                        const spotifyTrack = newPl.spotifyTracks[index];
                        return { ...spotifyTrack, id: null, thumb: spotifyTrack.thumb || newPl.cover };
                    }
                    return null;
                }).filter(Boolean);
            }
            renderQueue(tracksToShow, newPl.name);

            // 3. Handle playback and internal state logic

            // Edge Case: Playlist is now empty
            if (newPlayableTracks.length === 0) {
                console.log("Playlist is now empty. Stopping playback.");
                if (ytPlayer) ytPlayer.stopVideo();
                currentTrack = null;
                queue = [];
                qIdx = -1;
                updateUIOnTrackChange();
                // No more work to do, move to the next playlist in the loop
                return; 
            }

            // Check if a track was playing and if it was removed
            const wasPlayingTrackRemoved = currentTrackId && !newPlayableTracks.some(t => t.id === currentTrackId);

            if (wasPlayingTrackRemoved) {
                console.log("Currently playing track was removed.");
                // The song that was playing has been deleted. Play the next logical song.
                // This is usually the song that now occupies the deleted song's index.
                let nextIndex = qIdx;

                // If the deleted song was the last one, the index might be out of bounds.
                if (nextIndex >= newPlayableTracks.length) {
                    nextIndex = newPlayableTracks.length - 1;
                }

                // Set the new queue and play the new song at `nextIndex`
                setQueue(newPlayableTracks, 'playlist', nextIndex);
                playCurrent(true); // Autoplay the new track

            } else {
                // The current track is still present, or no track was playing.
                // We just need to silently update the internal queue state.
                // Playback should not be interrupted if it's ongoing.
                let newCurrentIndex = qIdx; // Default to old index
                if (currentTrackId) {
                    newCurrentIndex = newPlayableTracks.findIndex(t => t.id === currentTrackId);
                }

                // Update the queue. If a song was playing, its index might have changed.
                // `setQueue` handles updating both the queue array and the current index (qIdx).
                setQueue(newPlayableTracks, 'playlist', newCurrentIndex);
                console.log("Internal queue state updated silently.");
            }
        }
    });

    renderPlaylists(); 
    renderAllHomePlaylists();
  });

  checkForActiveImportJob();

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
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    
    const publicCommunityPlaylists = communityPlaylists.filter(p => 
        p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0))
    );
    
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
window.addEventListener('beforeunload', function(){ if (canUseAndroidBridge()) AndroidBridge.stopNotification(); });

/* ========== Spotify Import & Resolver Logic ========== */

const trackCache = new Map();

function normalize(str) {
  if (!str) return '';
  return str
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTrackKey(artist, title) {
    return `${normalize(artist)}|${normalize(title)}`;
}

async function resolveTrack(track) {
    const trackKey = getTrackKey(track.author, track.title);
    if (trackCache.has(trackKey)) {
        return { videoId: trackCache.get(trackKey), error: null };
    }

    const query = `${track.author} ${track.title}`;
    try {
        const videoId = await scrapeYoutubeUrlOnly(query);
        if (videoId) {
            trackCache.set(trackKey, videoId);
            return { videoId: videoId, error: null };
        }
        return { videoId: null, error: "No video found via scraping" };
    } catch (e) {
        return { videoId: null, error: e.message };
    }
}

async function checkForActiveImportJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;

    try {
        const { jobId, playlistId } = JSON.parse(activeJobInfo);
        if (!jobId) {
            localStorage.removeItem('sy_active_import_job');
            return;
        }

        console.log(`Resuming listener for job: ${jobId}`);
        viewingPlaylistId = playlistId;

        const { doc, onSnapshot } = window.firebase;
        const jobRef = doc(db, "resolverJobs", jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();

        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists()) {
                hideResolverModal(); // Also removes from localStorage
                return;
            }
            const job = { id: docSnap.id, ...docSnap.data() };
            updateResolverModal(job);
            if (['canceled', 'done', 'error'].includes(job.status)) {
                hideResolverModal(); // Also removes from localStorage
            }
        });
    } catch (e) {
        console.error("Failed to parse or resume active job:", e);
        localStorage.removeItem('sy_active_import_job');
    }
}

async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) {
        console.error("Playlist not found for resolver job:", playlistId);
        return;
    }
    const playlist = { id: plDoc.id, ...plDoc.data() };

    let jobId = playlist.resolverJobId;
    let jobData;
    const jobDoc = jobId ? await getDoc(doc(db, "resolverJobs", jobId)) : null;
    
    if (jobDoc && jobDoc.exists()) {
        jobData = jobDoc.data();
        if (jobData.status === 'running') {
            console.log("Job already running, listener will handle it.");
            localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
            return;
        }
    } else {
        jobId = `job_${playlistId}_${Date.now()}`;
        await updateDoc(plRef, { resolverJobId: jobId });
    }
    
    const jobRef = doc(db, "resolverJobs", jobId);
    
    jobData = {
        playlistRef: plRef.path,
        status: 'queued',
        total: playlist.spotifyTracks.length,
        done: playlist.resolvedCount || 0,
        errors: [],
        lastUpdated: serverTimestamp()
    };
    await setDoc(jobRef, jobData, { merge: true });
    
    await updateDoc(jobRef, { status: 'running', lastUpdated: serverTimestamp() });
    await updateDoc(plRef, { status: 'resolving' });
    
    localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
    
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const job = { id: docSnap.id, ...docSnap.data() };
        updateResolverModal(job);
        if (['canceled', 'done', 'error'].includes(job.status)) {
            hideResolverModal();
        }
    });

    runJobBatch(playlistId, jobRef);
}

async function runJobBatch(playlistId, jobRef) {
    const { doc, getDoc, updateDoc, serverTimestamp } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    
    const jobDoc = await getDoc(jobRef);
    if (!jobDoc.exists() || jobDoc.data().status !== 'running') {
        console.log("Job stopped or cancelled.");
        if (jobDoc.data()?.status !== 'canceled') {
           hideResolverModal();
        }
        return;
    }
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) return;

    const playlist = plDoc.data();
    const job = jobDoc.data();
    const BATCH_SIZE = 3; // Max 3 scrapers at a time
    
    const tracksArray = playlist.tracks || Array(playlist.spotifyTracks.length).fill(null);
    const unresolvedIndices = [];
    for (let i = 0; i < tracksArray.length && unresolvedIndices.length < BATCH_SIZE; i++) {
        if (tracksArray[i] === null) {
            unresolvedIndices.push(i);
        }
    }
    
    if (unresolvedIndices.length === 0) {
        const finalStatus = playlist.resolvedCount === playlist.spotifyTracks.length ? 'resolved' : 'partial';
        await updateDoc(plRef, { status: finalStatus });
        await updateDoc(jobRef, { status: 'done', done: playlist.resolvedCount, lastUpdated: serverTimestamp() });
        const message = finalStatus === 'resolved' 
            ? `Importación completa: ${playlist.name}`
            : `Importación incompleta: ${playlist.resolvedCount} de ${playlist.spotifyTracks.length} resueltos.`;
        showToast(message, finalStatus === 'partial');
        // Refresh final state if user is on this playlist
        try {
            const plIndex = communityPlaylists.findIndex(p => p && p.id === playlistId);
            if (plIndex >= 0) {
                const memPl = communityPlaylists[plIndex];
                const hydrated = (memPl.spotifyTracks || []).map((st, i) => memPl.tracks?.[i] && memPl.tracks[i].id ? memPl.tracks[i] : {
                    id: null,
                    title: st.title,
                    author: st.author,
                    thumb: st.thumb || memPl.cover || '',
                    source: 'youtube',
                    originalId: st.spotifyId
                });
                if (typeof viewingPlaylistId !== 'undefined' && viewingPlaylistId === playlistId) {
                    if (typeof renderQueue === 'function') renderQueue(hydrated, memPl.name || '');
                    if (typeof refreshIndicators === 'function') refreshIndicators();
                }
            }
        } catch(e){ console.warn('Final UI refresh error:', e); }

        return;
    }

    const tracksToProcess = unresolvedIndices.map(index => playlist.spotifyTracks[index]);
    const promises = tracksToProcess.map(track => resolveTrack(track));
    const results = await Promise.all(promises);

    const currentPlDoc = await getDoc(plRef);
    const currentPlaylist = currentPlDoc.data();
    let updatedTracks = [...(currentPlaylist.tracks || Array(currentPlaylist.spotifyTracks.length).fill(null))];
    let errorsInBatch = [];

    results.forEach((result, i) => {
        const originalIndex = unresolvedIndices[i];
        if (result.videoId) {
            const spotifyTrack = playlist.spotifyTracks[originalIndex];
            updatedTracks[originalIndex] = {
                id: result.videoId,
                title: spotifyTrack.title,
                author: spotifyTrack.author,
                thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`,
                source: 'youtube',
                originalId: spotifyTrack.spotifyId 
            };
        } else if (result.error) {
            errorsInBatch.push(`Track ${originalIndex}: ${result.error}`);
        }
    });
    
    const newResolvedCount = updatedTracks.filter(t => t && t.id).length;
    
    await updateDoc(plRef, { tracks: updatedTracks, resolvedCount: newResolvedCount });
    // === Real-time hydration: actualizar memoria y UI sin salir de la vista ===
    try {
        const plIndex = (typeof communityPlaylists !== 'undefined' && Array.isArray(communityPlaylists))
            ? communityPlaylists.findIndex(p => p && p.id === playlistId)
            : -1;
        if (plIndex >= 0) {
            // merge into in-memory playlist
            const memPl = communityPlaylists[plIndex];
            memPl.tracks = updatedTracks;
            memPl.resolvedCount = newResolvedCount;
            memPl.status = (newResolvedCount >= (memPl.spotifyTracks?.length || newResolvedCount)) ? 'resolved' : 'resolving';

            // if user is viewing this playlist, re-render queue mixing resolved and pendientes
            const sameView = (typeof queueType !== 'undefined' && typeof viewingPlaylistId !== 'undefined'
                              && viewingPlaylistId === playlistId);
            if (sameView) {
                const hydrated = (memPl.spotifyTracks || []).map((st, i) => {
                    const t = updatedTracks[i];
                    if (t && t.id) return t;
                    // pending item uses Spotify metadata and cover
                    return {
                        id: null,
                        title: st.title,
                        author: st.author,
                        thumb: st.thumb || memPl.cover || '',
                        source: 'youtube',
                        originalId: st.spotifyId
                    };
                });
                if (typeof renderQueue === 'function') renderQueue(hydrated, memPl.name || '');
                // mantener el mini-now y controles en coherencia
                if (typeof refreshIndicators === 'function') refreshIndicators();
            }
        }
    } catch (e) {
        console.warn('Hydration UI error:', e);
    }

    await updateDoc(jobRef, { 
        done: newResolvedCount,
        lastUpdated: serverTimestamp(),
        errors: [...(job.errors || []), ...errorsInBatch]
    });

    setTimeout(() => runJobBatch(playlistId, jobRef), 1000);
}


async function cancelResolverJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;
    
    try {
        const { playlistId, jobId } = JSON.parse(activeJobInfo);
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        const jobRef = doc(db, "resolverJobs", jobId);
        const plRef = doc(db, "playlists", playlistId);
        
        await updateDoc(jobRef, { status: 'canceled', lastUpdated: serverTimestamp() });
        await updateDoc(plRef, { status: 'partial' });
        
        showToast("Importación cancelada.", true);
        hideResolverModal(); // Also clears localStorage
    } catch(e) {
        console.error("Error cancelling job:", e);
        hideResolverModal();
    }
}


/* ========== Resolver Mini Modal ========== */
function updateResolverModal(job) {
    let modal = document.getElementById('resolver-modal');
    if (!job || !['running', 'paused', 'queued'].includes(job.status)) {
        hideResolverModal();
        return;
    }

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resolver-modal';
        document.body.appendChild(modal);
        modal.innerHTML = `
            <div class="resolver-content">
                <p>Importando playlist...</p>
                <div class="resolver-progress-bar">
                    <div class="resolver-progress"></div>
                </div>
                <span class="resolver-counter"></span>
                <button class="resolver-cancel">Cancelar</button>
            </div>
        `;
        modal.querySelector('.resolver-cancel').onclick = cancelResolverJob;
    }

    const playlistPath = job.playlistRef;
    const playlistId = playlistPath.split('/').pop();
    const pl = communityPlaylists.find(p => p.id === playlistId);

    const resolved = job.done || 0;
    const total = job.total || 0;
    if (total === 0) return;
    
    const progress = (resolved / total) * 100;
    
    modal.querySelector('p').textContent = `Importando: ${pl ? pl.name : 'playlist'}...`;
    modal.querySelector('.resolver-progress').style.width = `${progress}%`;
    modal.querySelector('.resolver-counter').textContent = `${resolved} / ${total}`;
}

function hideResolverModal() {
    const modal = document.getElementById('resolver-modal');
    if (modal) {
        modal.remove();
    }
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
    localStorage.removeItem('sy_active_import_job');
}

/* ========== Spotify Import UI & Logic (Optimizado) ========== */
function sy_initSpotifyImportUI() {
  const playlistsView = document.getElementById('view-playlists');
  if (!playlistsView) return;
  const header = playlistsView.querySelector('.section-head');
  const grid = playlistsView.querySelector('#plList');
  if (!grid) return;
  if (playlistsView.querySelector('#syBtnImportSpotify')) return;
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
      for (const it of (d.items||[])) {
        all.push(it);
      }
      url = d.next;
    }
    if (all.length === 0) {
      results.innerHTML = `<p class="muted">No se encontraron playlists públicas para <strong>${userId}</strong>.</p>`;
      results.hidden = false; spinner.hidden = true; return;
    }
    sy_renderSpotifyPlaylistsSelection(userId, all);
  } catch (e) {
    console.error("Error fetching user playlists:", e);
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
      showToast('No seleccionaste ninguna playlist para importar.', true);
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

            const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", "current_user_id_placeholder")); // Scope to user
            const snapshot = await getDocs(q);
            
            const isDuplicate = communityPlaylists.some(p => p.spotifyId === pl.spotifyId && isMyPlaylist(p.id));
            if (!snapshot.empty || isDuplicate) {
                 // Playlist already exists, update it.
                const docId = snapshot.docs[0]?.id || communityPlaylists.find(p => p.spotifyId === pl.spotifyId && isMyPlaylist(p.id)).id;
                const existingDocRef = doc(db, 'playlists', docId);
                 await updateDoc(existingDocRef, {
                    name: pl.name,
                    spotifyTracks: spotifyTracks,
                    trackCount: spotifyTracks.length,
                    updatedAt: serverTimestamp()
                });
                updatedCount++;
                continue;
            }


            if (snapshot.empty) {
                const docRef = await addDoc(col, {
                    name: pl.name,
                    creator: pl.creator,
                    isPublic: false,
                    cover: pl.cover || null,
                    source: 'spotify',
                    spotifyId: pl.spotifyId,
                    spotifyTracks: spotifyTracks,
                    trackCount: spotifyTracks.length,
                    tracks: Array(spotifyTracks.length).fill(null), // Initialize with nulls
                    status: 'unresolved',
                    resolvedCount: 0,
                    updatedAt: serverTimestamp(),
                    ownerUserId: "current_user_id_placeholder"
                });
                addMyPlaylistId(docRef.id);
                importedCount++;
            } else {
                const docId = snapshot.docs[0].id;
                const existingData = snapshot.docs[0].data();
                const existingDocRef = doc(db, 'playlists', docId);
                
                const oldTracksByKey = new Map();
                if(existingData.tracks) {
                    existingData.tracks.forEach(t => {
                        if (t && t.id) oldTracksByKey.set(getTrackKey(t.author, t.title), t);
                    });
                }
                
                let resolvedCount = 0;
                const newTracksPayload = spotifyTracks.map(st => {
                    const key = getTrackKey(st.author, st.title);
                    if (oldTracksByKey.has(key)) {
                        resolvedCount++;
                        return oldTracksByKey.get(key);
                    }
                    return null; // Dejar como nulo para que el resolver lo procese
                });

                await updateDoc(existingDocRef, {
                    name: pl.name,
                    spotifyTracks: spotifyTracks,
                    tracks: newTracksPayload,
                    trackCount: spotifyTracks.length,
                    resolvedCount: resolvedCount,
                    status: resolvedCount === spotifyTracks.length ? 'resolved' : 'partial',
                    updatedAt: serverTimestamp()
                });
                addMyPlaylistId(docId);
                updatedCount++;
            }
        }
        
        resultsContainer.innerHTML = `<div class="sy-success">¡Proceso completado!<br>${importedCount} playlists importadas.<br>${updatedCount} playlists actualizadas.</div>`;
        setTimeout(() => sy_showModal('sySpotifyModal', false), 2500);

    } catch (e) {
        console.error("Massive error importing/updating playlists: ", e);
        resultsContainer.innerHTML = `<div class="sy-error">Ocurrió un error durante el proceso. Intenta de nuevo.</div>`;
    } finally {
      if (importButton) {
        importButton.disabled = false;
        importButton.textContent = 'Importar / Actualizar';
      }
    }
}


document.addEventListener('DOMContentLoaded', sy_initSpotifyImportUI);
window.addEventListener('hashchange', sy_initSpotifyImportUI);
document.addEventListener('click', (e)=>{ if (e.target.closest('[data-view="view-playlists"]')) setTimeout(sy_initSpotifyImportUI, 50); });


// === helper: unified firestore access ===
function sy_fs() {
  const f = (window.firebase || {});
  return {
    db: (typeof db !== 'undefined' ? db : window.db),
    doc: f.doc || window.doc,
    updateDoc: f.updateDoc || window.updateDoc,
    setDoc: f.setDoc || window.setDoc,
    serverTimestamp: f.serverTimestamp || window.serverTimestamp
  };
}


// === helper: sync removal in realtime (queue + UI) ===
function sy_syncRemovalRealtime(plId, removedTrackId) {
  try {
    const pl = (typeof communityPlaylists !== 'undefined' && Array.isArray(communityPlaylists))
      ? communityPlaylists.find(p => p && p.id === plId)
      : null;
    if (!pl) return;

    // Remove from in-memory playlist
    pl.tracks = (pl.tracks || []).filter(t => t && t.id !== removedTrackId);
    pl.resolvedCount = (pl.tracks || []).length;

    // If current view is that playlist, rebuild queue
    const sameView = (typeof queueType !== 'undefined' && typeof viewingPlaylistId !== 'undefined'
                      && queueType === 'playlist' && viewingPlaylistId === plId);

    if (sameView) {
      const wasCurrent = (typeof currentTrack !== 'undefined' && currentTrack && currentTrack.id === removedTrackId);
      const newQueue = (pl.tracks || []).filter(t => t && t.id);
      if (typeof queue !== 'undefined') queue = newQueue;

      if (!wasCurrent) {
        if (typeof currentTrack !== 'undefined' && currentTrack) {
          const newIdx = newQueue.findIndex(t => t.id === currentTrack.id);
          if (typeof qIdx !== 'undefined') qIdx = newIdx >= 0 ? newIdx : 0;
        } else {
          if (typeof qIdx !== 'undefined') qIdx = newQueue.length ? 0 : -1;
        }
      } else {
        try { if (typeof ytPlayer !== 'undefined' && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } catch (_) {}
        if (typeof currentTrack !== 'undefined') currentTrack = null;
        if (typeof qIdx !== 'undefined') qIdx = newQueue.length ? 0 : -1;
      }

      // Refresh UI pieces if available
      if (typeof renderQueue === 'function') renderQueue(newQueue, pl.name || '');
      if (typeof updateUIOnTrackChange === 'function') updateUIOnTrackChange();

      if ((!newQueue || !newQueue.length) && typeof hideQueuePanel === 'function') {
        hideQueuePanel();
      }
    } else {
      // Update playlists grid if present
      if (typeof renderPlaylists === 'function') renderPlaylists();
    }

    if (typeof refreshIndicators === 'function') refreshIndicators();
  } catch (err) {
    console.error('sy_syncRemovalRealtime error:', err);
  }
}
