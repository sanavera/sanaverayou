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
    <svg viewBox="0 0 28 20" fill="currentColor" height="1em" width="1em"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s-1.2 0-2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"></path></svg>
  </span>`;
const spotifyLogoSvg = () => `
  <span class="source-logo spotify-logo" title="Spotify">
    <svg viewBox="0 0 167.5 167.5" fill="currentColor" height="1em" width="1em"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"></path></svg>
  </span>`;

/* ========= Estado de la Aplicación ========= */
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
let currentImportController = null; // Para cancelar importaciones

const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

const recommendedPlaylists = {
  p1: { ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZN1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3VdoetCQ', '6NXnxTNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3VdoetCQ'], title: 'Melódicos en Inglés', creator: 'Luis Sanavera', data: [], isRecommended: true },
  p2: { ids: ['0qSif7B09N8', 'Ngi3rVx6kho', 'HhsXDJ1KeAI', 'MjgYsL3e3Mw', 'rsjGKU-qg3c', 'G6DbIQzCVBk', 'mdQW8ZLHpCU', 'MX-vrDW-A7I', 'uxZC1W6DHmI', 'WTlEED0_QcQ', 'ALA8ZDLQF9U', 'x1tWQNxJpY4', 'h2gj7Aap3iY', 'biXIrPcupuE', 'Vw5j10cBU78', 'Z5jQKzbOejY', 'ypg7ikDRhfg', '1gtJWFSWuYc', 'IhWGr-hTfHU', 'ZAKWI3mi14A', 'gy2hK11AKGE', 'fuYq32iJdIw', 'DzhxJkF7c9s', 'QqS4kWie8SA', 'sw6v-Q-2Is4', 'yXXheK7wYqo', 'xd-IwfDs7c4', 'HcWlkUKwjlc', 'pPoUVEcT0aU', 'N7m-0KXjKR0', 'OX2fVkdQYKg', 'AIIcEeQaWI0', 'WI0da9h-gcE', 'uxZC1W6DHmI', 'w09HG8_FAHQ', '_IqyVs9ObFA', 'auNa0nRPg3o', '46T65kU9Pw0', 'lsDSVZ10sY4', '4nztFNNeay0'], title: 'Cumbia estilo Santafesino', creator: 'Luis Sanavera', data: [], isRecommended: true },
  cumbia: { ids: ['UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU', 'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y', '098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE', '3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss', '2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c'], title: 'Cumbias del Recuerdo', creator: 'Luis Sanavera', data: [], isRecommended: true },
};

/* ========= Persistencia y Tema ========= */
const PLAYER_STATE_KEY = "sy_player_state_v2";
function getPlaybackState(){ if(!YT_READY||!ytPlayer)return"none";const s=ytPlayer.getPlayerState();return s===YT.PlayerState.PLAYING||s===YT.PlayerState.BUFFERING?"playing":s===YT.PlayerState.PAUSED?"paused":"none"}
function savePlayerState(){if(!currentTrack||!ytPlayer)return;const s={queue,queueType,qIdx,currentTime:ytPlayer.getCurrentTime()||0,isShuffle,repeatMode,wasPlaying:getPlaybackState()==="playing",timestamp:Date.now()};try{localStorage.setItem(PLAYER_STATE_KEY,JSON.stringify(s))}catch(t){console.error("Error al guardar estado:",t)}}
function loadPlayerState(){const s=localStorage.getItem(PLAYER_STATE_KEY);if(!s)return null;try{const t=JSON.parse(s);if(Date.now()-(t.timestamp||0)>72e5){localStorage.removeItem(PLAYER_STATE_KEY);return null}return t}catch(t){console.error("Error al cargar estado:",t);return null}}
function restorePlayerState(s){if(!s||!s.queue||s.qIdx<0)return;const t=()=>{queue=s.queue,queueType=s.queueType,qIdx=s.qIdx,currentTrack=queue[qIdx],isShuffle=!!s.isShuffle,repeatMode=s.repeatMode||"none",ytPlayer.loadVideoById({videoId:currentTrack.id,startSeconds:s.currentTime||0,suggestedQuality:"auto"}),ytPlayer.setVolume(100),s.wasPlaying?ytPlayer.playVideo():ytPlayer.pauseVideo(),updateUIOnTrackChange(),startTimer()};YT_READY?t():window.addEventListener("yt-ready",t,{once:!0})}
const THEME_KEY="sy_theme_v1";function applyTheme(s){document.documentElement.setAttribute("data-theme",s),localStorage.setItem(THEME_KEY,s);const t=$("#themeToggle");if(t){const e=s==="light";t.classList.toggle("is-light",e),t.setAttribute("aria-label",e?"Cambiar a modo oscuro":"Cambiar a modo claro"),t.title=t.getAttribute("aria-label")}const e=document.querySelector('meta[name="theme-color"]');if(e){const o=getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim();e.setAttribute("content",o||(s==="light"?"#ffffff":"#0b0a11"))}document.documentElement.style.colorScheme=s==="light"?"light":"dark"}
function initTheme(){const s=localStorage.getItem(THEME_KEY)||"dark";applyTheme(s),$("#themeToggle")?.addEventListener("click",()=>{const t=document.documentElement.getAttribute("data-theme")||"dark";applyTheme(t==="dark"?"light":"dark")})}

/* ========= API Spotify & Scraping ========= */
async function getSpotifyToken(){if(spotifyToken.value&&Date.now()<spotifyToken.expires)return spotifyToken.value;try{const s=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+btoa(SPOTIFY_CLIENT_ID+":"+SPOTIFY_CLIENT_SECRET)},body:"grant_type=client_credentials"});if(!s.ok)throw new Error("Falló la autenticación con Spotify");const t=await s.json();return spotifyToken={value:t.access_token,expires:Date.now()+t.expires_in*1e3-6e4},spotifyToken.value}catch(s){return console.error("Error obteniendo token de Spotify:",s),null}}
async function searchSpotify(s,t=10){const e=await getSpotifyToken();if(!e)return{tracks:[],playlists:[]};try{const o=new URL("https://api.spotify.com/v1/search");o.searchParams.append("q",s),o.searchParams.append("type","track,playlist"),o.searchParams.append("limit",t),o.searchParams.append("market","AR");const a=await fetch(o,{headers:{Authorization:`Bearer ${e}`}});if(!a.ok)throw new Error("No se pudo buscar en Spotify");const i=await a.json();const r=(i.tracks?.items||[]).map(c=>({source:"spotify",type:"spotify_track",id:c.id,title:c.name,author:c.artists.map(n=>n.name).join(", "),thumb:c.album.images?.[0]?.url||"https://i.imgur.com/gCa3j5g.png"})),l=(i.playlists?.items||[]).map(c=>({source:"spotify",type:"spotify_playlist",id:c.id,title:c.name,author:c.owner.display_name,thumb:c.images?.[0]?.url||"https://i.imgur.com/gCa3j5g.png"}));return{tracks:r,playlists:l}}catch(o){return console.error("Error en la búsqueda de Spotify:",o),{tracks:[],playlists:[]}}}

async function youtubeSearch(query, limit = 25) {
    try {
        const endpoint = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const responseText = await fetch(endpoint).then(r => r.text());
        
        const results = [];
        const scriptTagContent = responseText.match(/var ytInitialData = (.*?);<\/script>/);
        if (!scriptTagContent || !scriptTagContent[1]) {
            console.warn("ytInitialData not found. Falling back to regex.");
            // Fallback to simple regex if ytInitialData fails
            const ids = [...new Set(Array.from(responseText.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]))].slice(0, limit);
            if (!ids.length) return [];
            return await Promise.all(ids.map(async id => {
                const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r => r.json());
                return { source: 'youtube', type: 'youtube_video', id, title: cleanTitle(meta.title || `Video ${id}`), author: cleanAuthor(meta.author_name || "YouTube"), thumb: meta.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
            }));
        }

        const data = JSON.parse(scriptTagContent[1]);
        const contents = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
        
        for (const item of contents) {
            if (results.length >= limit) break;
            const video = item.videoRenderer;
            if (video && video.videoId) {
                results.push({
                    source: 'youtube',
                    type: 'youtube_video',
                    id: video.videoId,
                    title: cleanTitle(video.title.runs[0].text),
                    author: cleanAuthor(video.ownerText.runs[0].text),
                    thumb: video.thumbnail.thumbnails.slice(-1)[0].url
                });
            }
        }
        return results;

    } catch (e) {
        console.error("Scraping YouTube failed:", e);
        return [];
    }
}

async function findYoutubeEquivalent(s){if(!s||!s.title)return null;const t=`${s.author||""} - ${s.title}`.trim();try{const e=await youtubeSearch(t,5);if(!e||!e.length)return null;const o=s=>(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),a=o(s.author||""),i=o(s.title||"");let r=e[0],l=-1;for(const n of e){const c=o(n.title),d=o(n.author);let u=0;c.includes(i)&&(u+=3),c.includes(a)&&(u+=2),d.includes(a)&&(u+=2),/live|en vivo|karaoke|cover|letra|lyrics|tutorial|instrumental/i.test(c)&&(u-=5),/official video|video oficial/i.test(c)&&(u+=2),u>l&&(r=n,l=u)}return r?{...r,originalId:s.id,thumb:r.thumb||s.thumb}:e[0]}catch(e){return console.error(`Búsqueda en YouTube falló para "${t}":`,e),null}}
async function fetchVideoDetailsByIds(s){const t=[...new Set(s||[])];if(!t.length)return[];const e=await Promise.all(t.map(o=>fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${o}`).then(a=>a.json()).catch(()=>({error:!0,id:o}))));return e.filter(o=>!o.error).map(o=>({id:o.url.split("v=")[1],title:cleanTitle(o.title),author:cleanAuthor(o.author_name),thumb:o.thumbnail_url}))}

/* ========= Lógica de Búsqueda y Navegación ========= */
let searchAbort=null;
function switchView(s){$$(".view").forEach(t=>t.classList.remove("active"));const t=$("#"+s);t&&t.classList.add("active"),$$(".nav-btn").forEach(e=>e.classList.toggle("active",e.dataset.view===s)),s==="view-search"&&updateHomeGridVisibility(),heroScrollInvalidate()}
$("#bottomNav").addEventListener("click",s=>{const t=s.target.closest(".nav-btn");t&&!t.classList.contains("active")&&switchView(t.dataset.view)});const searchOverlay=$("#searchOverlay"),overlayInput=$("#overlaySearchInput");function openSearch(){searchOverlay.classList.add("show"),setTimeout(()=>{overlayInput.focus(),overlayInput.select()},50)}
function closeSearch(){searchOverlay.classList.remove("show")}
$("#searchFab")?.addEventListener("click",openSearch),searchOverlay?.addEventListener("click",s=>{s.target===searchOverlay&&closeSearch()}),overlayInput?.addEventListener("keydown",async s=>{if(s.key!=="Enter")return;const t=overlayInput.value.trim();if(!t)return;closeSearch(),document.body.scrollTop=0,document.documentElement.scrollTop=0;const e=/https:\/\/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,o=t.match(e);switchView("view-search"),o&&o[1]?await handleSpotifyUrlImport(o[1]):await startSearch(t)});
async function startSearch(s){searchAbort&&searchAbort.abort(),searchAbort=new AbortController,items=[];const t=$("#results");t&&(t.innerHTML='<div class="loading-indicator"><h3>Buscando...</h3></div>'),updateHomeGridVisibility();try{const[e,o]=await Promise.all([youtubeSearch(s,20),searchSpotify(s,20)]);if(searchAbort.signal.aborted)return;let a=[...o.playlists,...e,...o.tracks];a.sort((l,n)=>{const c=l.type.includes("playlist"),d=n.type.includes("playlist");return c&&!d?-1:!c&&d?1:0}),t&&(t.innerHTML=""),a.length===0?(t&&(t.innerHTML='<div class="loading-indicator"><p>No se encontraron resultados.</p></div>'),void 0):(items=dedupeById(a),appendResults(items))}catch(e){console.error("Search failed:",e),t&&(t.innerHTML='<div class="loading-indicator"><p>Error en la búsqueda.</p></div>')}}
function dedupeById(s){const t=new Set(items.map(e=>e.id));return s.filter(e=>!e?.id||!t.has(e.id)?(t.add(e.id),!0):!1)}

/* ========= Renderizado y Clicks de Resultados ========= */
function appendResults(s){const t=$("#results");if(!t)return;for(const e of s){const o=document.createElement("article");o.className="result-item",o.dataset.itemId=e.id,o.dataset.trackId=e.id;let a="",i=e.source==="spotify"?spotifyLogoSvg():youtubeLogoSvg();e.type.includes("playlist")&&(o.classList.add("playlist-result-item"),e.source==="spotify"&&o.classList.add("spotify-playlist-result-item"),a='<div class="playlist-indicator">LISTA</div>'),o.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${e.thumb}" alt="">
        ${a}
        ${e.type.includes("playlist")?"":`<button class="card-play" title="Play/Pause" aria-label="Play/Pause">
            <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>`}
      </div>
      <div class="meta">
        <div class="title-line">
          ${i}
          <span class="title-text">${e.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(e.author)||" "}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`,o.addEventListener("click",r=>handleResultClick(r,e));const r=o.querySelector(".card-play");r&&(r.onclick=l=>{l.stopPropagation(),handleResultClick(l,e,!0)}),t.appendChild(o)}refreshIndicators()}
async function handleResultClick(s,t,e=!1){if(s.target.closest(".more")||s.target.closest(".card-play")&&!e)return;switch(t.type){case"youtube_video":playFromSearch(t.id,!0);break;case"spotify_track":await playSpotifyTrack(t);break;case"spotify_playlist":await showPlaylistInPlayer(t.id, { isFromSearch: true });break;}}
async function playSpotifyTrack(s){const t=$("#results"),e=t.innerHTML;t.innerHTML=`<div class="loading-indicator"><h3>Buscando en YouTube...</h3><p>${s.author} - ${s.title}</p></div>`,updateHomeGridVisibility();const o=await findYoutubeEquivalent(s);t.innerHTML=e,o?(setQueue([o],"search",0),viewingPlaylistId=null,playCurrent(!0),switchView("view-player")):alert("No se pudo encontrar un video para esta canción.")}
async function handleSpotifyUrlImport(s){$("#results").innerHTML=`<div class="loading-indicator"><h3>Importando playlist de Spotify...</h3></div>`;const t=await fetchAllSpotifyPlaylistTracks(s);if(!t||t.length===0)return void alert("No se pudo cargar la playlist de Spotify o está vacía.");const e={id:s,name:t[0]?`${t[0].author} y más...`:"Playlist Importada",creator:"Spotify Link",source:"spotify",isTemporary:!0,spotifyTracks:t};await showPlaylistInPlayer(e.id,{isFromSearch:!0,tempPlaylist:e})}

/* ========= Lógica de Importación de Playlists ========= */
function showProgressModal(s,t){hideProgressModal();const e=$("#queuePanel");if(!e)return;const o=document.createElement("div");o.id="importProgressModal",o.className="import-progress",o.innerHTML=`<h3>${s}</h3><p>${t||"Por favor, espera..."}</p><button id="cancelImportBtn" class="pill danger">Cancelar</button>`,e.prepend(o),$("#cancelImportBtn").onclick=()=>{currentImportController&&currentImportController.abort(),hideProgressModal()}}
function updateProgressModal(s){const t=$("#importProgressModal p");t&&(t.textContent=s)}
function hideProgressModal(){const s=$("#importProgressModal");s&&s.remove()}

async function scrapeAndPopulatePlaylist(playlist) {
    if (currentImportController && !currentImportController.signal.aborted) {
        currentImportController.abort();
    }
    currentImportController = new AbortController();
    const { signal } = currentImportController;

    let existingTracks = playlist.tracks || [];
    const spotifyTracksToScrape = (playlist.spotifyTracks || []).slice(existingTracks.length);

    if (spotifyTracksToScrape.length === 0) return existingTracks;

    localStorage.setItem('sy_import_job', playlist.id);
    showProgressModal(`Convirtiendo "${playlist.name}"`, `Buscando ${spotifyTracksToScrape.length} canciones...`);

    const CONCURRENT_BATCH_SIZE = 5;
    
    try {
        for (let i = 0; i < spotifyTracksToScrape.length; i += CONCURRENT_BATCH_SIZE) {
            if (signal.aborted) throw new Error('Importación cancelada por el usuario.');
            
            const batch = spotifyTracksToScrape.slice(i, i + CONCURRENT_BATCH_SIZE);
            updateProgressModal(`Buscando lote ${existingTracks.length + 1}-${Math.min(existingTracks.length + CONCURRENT_BATCH_SIZE, playlist.spotifyTracks.length)} de ${playlist.spotifyTracks.length}...`);
            
            const foundInBatch = (await Promise.all(
                batch.map(track => findYoutubeEquivalent(track))
            )).filter(Boolean);
            
            if (signal.aborted) throw new Error('Importación cancelada por el usuario.');

            existingTracks.push(...foundInBatch);

            if (!playlist.isTemporary) {
                const { doc, updateDoc } = window.firebase;
                await updateDoc(doc(db, "playlists", playlist.id), { tracks: existingTracks });
            }

            if (viewingPlaylistId === playlist.id) {
                setQueue(existingTracks, 'playlist', qIdx);
                renderQueue(existingTracks, playlist.name);
            }
        }
    } catch (e) {
        console.warn(e.message);
    } finally {
        hideProgressModal();
        localStorage.removeItem('sy_import_job');
        currentImportController = null;
    }
    
    return existingTracks;
}

async function showPlaylistInPlayer(plId, options = {}) {
    let pl = communityPlaylists.find(p => p.id === plId) || options.tempPlaylist;

    if (!pl && options.isFromSearch) {
        const searchResultItem = items.find(i => i.id === plId);
        if (searchResultItem) {
             pl = {
                id: plId,
                name: searchResultItem.title,
                creator: searchResultItem.author,
                source: 'spotify',
                isTemporary: true,
                spotifyTracks: (await fetchAllSpotifyPlaylistTracks(plId))
            };
        }
    }

    if (!pl) return alert("Playlist no encontrada.");

    switchView('view-player');
    
    let tracksToPlay = pl.tracks || [];

    if (pl.source === 'spotify' && (pl.spotifyTracks?.length || 0) > tracksToPlay.length) {
        renderQueue(tracksToPlay, pl.name);
        tracksToPlay = await scrapeAndPopulatePlaylist(pl);
    }

    if (!tracksToPlay || tracksToPlay.length === 0) {
        alert(`La playlist "${pl.name}" está vacía o no se pudieron encontrar las canciones.`);
        if (queueType !== 'playlist') switchView(options.isFromSearch ? 'view-search' : 'view-playlists');
        return;
    }

    viewingPlaylistId = pl.id;
    setQueue(tracksToPlay, 'playlist', 0);
    renderQueue(tracksToPlay, pl.name);
    playCurrent(true);
}

/* ========= Home y Favoritos ========= */
function renderPlaylistCard(s){const t=$("#allPlaylistsContainer");if(!t)return;let e=s.isRecommended?s.data:s.tracks||[];if(e.length===0&&s.spotifyTracks)e=s.spotifyTracks.map(o=>({thumb:o.thumb}));if(!e||!e.length)return;let o=e.slice(0,4).map(a=>a.thumb).filter(Boolean);for(;o.length<4;)o.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");const a=s.isRecommended?youtubeLogoSvg():spotifyLogoSvg(),i=document.createElement("article");i.className="playlist-card",i.dataset.id=s.id||s.title,i.innerHTML=`
        <div class="collage-container">${o.map(r=>`<img src="${r}" alt="Album art collage">`).join("")}</div>
        <div class="playlist-meta">
            <h4 class="playlist-title">${s.title||s.name}</h4>
            <div class="creator-line">${a}<span>Creador: ${s.creator}</span></div>
        </div>`,i.onclick=async()=>{if(s.isRecommended){const r=s.data,l=s.title;setQueue(r,"recommended",0),viewingPlaylistId=null,renderQueue(r,l),switchView("view-player"),playCurrent(!0)}else await showPlaylistInPlayer(s.id)},t.appendChild(i)}
function updateHomeGridVisibility(){const s=$("#homeSection");s&&s.classList.toggle("hide",!(items.length===0&&!$(".loading-indicator")))}
const LS_FAVS="sanayera_favs_v1";function loadFavs(){try{favs=JSON.parse(localStorage.getItem(LS_FAVS)||"[]")}catch{favs=[]}}
function saveFavs(){localStorage.setItem(LS_FAVS,JSON.stringify(favs))}
function isFav(s){return favs.some(t=>t.id===s)}
function toggleFav(s){isFav(s.id)?favs=favs.filter(t=>t.id!==s.id):favs.unshift(s),saveFavs(),renderFavs(),refreshIndicators()}
function renderFavs(){const s=$("#favList");if(!s)return;s.innerHTML="";for(const t of favs){const e=document.createElement("li");e.className="fav-item",e.dataset.trackId=t.id,e.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${t.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(t.author)||" "}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`,e.addEventListener("click",o=>{o.target.closest(".more")||o.target.closest(".card-play")||playFromFav(t,!0)}),e.querySelector(".card-play").onclick=o=>{o.stopPropagation(),currentTrack?.id===t.id?togglePlay():playFromFav(t,!0)},s.appendChild(e)}updateHero(currentTrack),refreshIndicators()}

/* ========= Playlists (Firebase) ========= */
const LS_USER_PLAYLIST_IDS="sy_user_playlist_ids_v1";function getMyPlaylistIds(){try{return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS)||"[]")}catch{return[]}}
function addMyPlaylistId(s){const t=getMyPlaylistIds();t.includes(s)||t.push(s),localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(t))}
function removeMyPlaylistId(s){let t=getMyPlaylistIds();t=t.filter(e=>e!==s),localStorage.setItem(LS_USER_PLAYLIST_IDS,JSON.stringify(t))}
function isMyPlaylist(s){return getMyPlaylistIds().includes(s)}
async function handlePrivacyToggle(s,t){try{const{doc:e,updateDoc:o}=window.firebase;await o(e(db,"playlists",s),{isPublic:t})}catch(e){console.error("Error al actualizar privacidad:",e)}}
async function openPlaylistOptionsMenu(s){openActionSheet({title:s.name,actions:[{id:"rename",label:"Renombrar"},{id:"delete",label:"Eliminar playlist",danger:!0},{id:"cancel",label:"Cancelar",ghost:!0}],onAction:async t=>{const{doc:e,updateDoc:o,deleteDoc:a,serverTimestamp:i}=window.firebase,r=e(db,"playlists",s.id);if(t==="rename"){const l=prompt("Nuevo nombre para la playlist:",s.name);if(l===null||l.trim()==="")return;const n=prompt("Nuevo nombre de creador (máx 20 caracteres):",s.creator);if(n===null||n.trim()==="")return;try{await o(r,{name:l.trim().substring(0,50),creator:n.trim().substring(0,20),updatedAt:i()})}catch(c){console.error("Error al renombrar playlist:",c),alert("No se pudo renombrar la playlist.")}}t==="delete"&&openActionSheet({title:`¿Eliminar "${s.name}"?`,actions:[{id:"confirm_delete",label:"Sí, eliminar",danger:!0},{id:"cancel",label:"Cancelar",ghost:!0}],onAction:async l=>{if(l==="confirm_delete")try{await a(r),removeMyPlaylistId(s.id)}catch(n){console.error("Error al eliminar playlist:",n),alert("No se pudo eliminar la playlist.")}}})}})}
function renderPlaylists(){const s=$("#plList"),t=$("#plEmpty");if(!s)return;s.innerHTML="";const e=communityPlaylists.filter(i=>isMyPlaylist(i.id));if(e.length===0)return void t?.classList.remove("hide");t?.classList.add("hide");for(const i of e){const o=document.createElement("article");o.className="pl-item",o.dataset.plId=i.id;const a=(i.tracks&&i.tracks.length?i.tracks[0]?.thumb:i.cover)||"https://i.imgur.com/gCa3j5g.png";o.innerHTML=`
            <img class="pl-thumb-bg" src="${a}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${i.name}</div>
                    <div class="pl-creator">por ${i.creator||"Anónimo"}</div>
                    <div class="pl-subtitle">${i.spotifyTracks?.length||i.tracks.length} temas</div>
                </div>
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${i.isPublic?"checked":""}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`,o.querySelector(".more").addEventListener("click",r=>{r.stopPropagation(),openPlaylistOptionsMenu(i)}),o.querySelector(".pl-privacy-toggle input").addEventListener("change",r=>{handlePrivacyToggle(i.id,r.target.checked)}),o.addEventListener("click",async r=>{r.target.closest(".more")||r.target.closest(".pl-privacy-toggle")||await showPlaylistInPlayer(i.id)}),o.classList.toggle("is-playing",viewingPlaylistId===i.id&&queueType==="playlist"),s.appendChild(o)}}
$("#btnNewPlaylist")?.addEventListener("click",()=>{$("#createPlaylistSheet").classList.add("show")}),$("#createPlCancel").onclick=()=>$("#createPlaylistSheet").classList.remove("show"),$("#createPlaylistSheet").addEventListener("click",s=>{s.target.id==="createPlaylistSheet"&&$("#createPlaylistSheet").classList.remove("show")}),$("#createPlConfirm").onclick=async()=>{const s=$("#newPlName").value.trim(),t=$("#newPlCreator").value.trim();if(!s||!t)return void alert("Por favor, completa nombre de playlist y creador.");try{const{getFirestore:e,collection:o,addDoc:a,serverTimestamp:i}=window.firebase,r=await a(o(db,"playlists"),{name:s,creator:t,tracks:[],updatedAt:i(),isPublic:!0});addMyPlaylistId(r.id),$("#newPlName").value="",$("#newPlCreator").value="",$("#createPlaylistSheet").classList.remove("show")}catch(e){console.error("Error creando playlist: ",e),alert("Hubo un error al crear la playlist.")}};

/* ========= Menús y Sheets ========= */
function openActionSheet({title:s="Opciones",actions:t=[],onAction:e=()=>{}}){const o=$("#menuSheet");if(!o)return;o.innerHTML=`
    <div class="sheet-content">
      <div class="sheet-title">${s}</div>
      ${t.map(a=>`
        <button class="sheet-item ${a.ghost?"ghost":""} ${a.danger?"danger":""}" data-id="${a.id}">
          ${a.label}
        </button>`).join("")}
    </div>`,o.classList.add("show"),o.onclick=a=>{if(a.target===o)return void o.classList.remove("show");const i=a.target.closest(".sheet-item");if(!i)return;const r=i.dataset.id;o.classList.remove("show"),r&&e(r)}}
async function openPlaylistSheet(s){const t=$("#playlistSheet");if(!t)return;t.classList.add("show");const e=$("#plChoices");e.innerHTML="";const o=communityPlaylists.filter(i=>isMyPlaylist(i.id));for(const i of o){const a=document.createElement("button");a.className="sheet-item",a.textContent=i.name,a.onclick=async()=>{const{doc:r,updateDoc:l,serverTimestamp:n}=window.firebase,c=r(db,"playlists",i.id),d=[...i.tracks];d.some(u=>u.id===s.id)||d.unshift(s);try{await l(c,{tracks:d,updatedAt:n()}),t.classList.remove("show")}catch(u){console.error("Error agregando canción: ",u),alert("No se pudo agregar la canción.")}},e.appendChild(a)}$("#plCreateFromSong").onclick=async()=>{const i=$("#plNewNameFromSong").value.trim();if(!i)return;const a=prompt("Tu nombre (creador):")?.trim();if(!a)return;try{const{collection:r,addDoc:l,serverTimestamp:n}=window.firebase,c=await l(r(db,"playlists"),{name:i,creator:a,tracks:[s],updatedAt:n(),isPublic:!0});addMyPlaylistId(c.id),$("#plNewNameFromSong").value="",t.classList.remove("show")}catch(r){console.error("Error creando playlist desde canción: ",r),alert("Hubo un error al crear la playlist.")}},$("#plCancel").onclick=()=>t.classList.remove("show"),t.addEventListener("click",i=>{i.target.id==="playlistSheet"&&t.classList.remove("show")},{once:!0})}

/* ========= Lógica del Reproductor ========= */
function updateUIOnTrackChange(){updateHero(currentTrack),updateMiniNow(),refreshIndicators(),updateControlStates(),updateMediaSession(currentTrack),updateAndroidNotification()}
function updateHero(s){const t=s||currentTrack,e=$("#favHero"),o=$("#npHero");e&&(e.style.backgroundImage=t?`url(${t.thumb})`:"none"),$("#favNowTitle")&&($("#favNowTitle").textContent=t?t.title:"—"),o&&(o.style.backgroundImage=t?`url(${t.thumb})`:"none"),$("#npTitle")&&($("#npTitle").textContent=t?t.title:"Elegí una canción");let a="";queueType==="playlist"&&viewingPlaylistId?(a=communityPlaylists.find(r=>r.id===viewingPlaylistId)?.name||""):["recommended","youtube_playlist"].includes(queueType)&&(a=currentQueueTitle),$("#npSub")&&($("#npSub").textContent=t?`${cleanAuthor(t.author)}${a?` • ${a}`:""}`:a||"—")}
function setQueue(s,t,e){let o=s;if(isShuffle){const a=s[e],i=s.filter((r,l)=>l!==e),l=i.sort(()=>Math.random()-.5);o=[a,...l],e=0}queue=o,queueType=t,qIdx=e}
function playCurrent(s=!1){if(!YT_READY||!queue||qIdx<0||qIdx>=queue.length)return;currentTrack=queue[qIdx],ytPlayer.loadVideoById({videoId:currentTrack.id,startSeconds:0,suggestedQuality:"auto"}),s||ytPlayer.pauseVideo(),startTimer(),updateUIOnTrackChange()}
function playFromSearch(s,t=!1){const e=items.filter(i=>i.source==="youtube"&&i.type==="youtube_video"),o=e.findIndex(i=>i.id===s);o>-1&&(setQueue(e,"search",o),viewingPlaylistId=null,playCurrent(t))}
function playFromFav(s,t=!1){const e=favs.findIndex(o=>o.id===s.id);setQueue(favs,"favs",Math.max(e,0)),viewingPlaylistId=null,playCurrent(t)}
function playFromPlaylist(s,t,e=!1){const o=communityPlaylists.find(a=>a.id===s);o&&(viewingPlaylistId=s,setQueue(o.tracks,"playlist",t),playCurrent(e),renderPlaylists())}
function playPlaylist(s){const t=communityPlaylists.find(e=>e.id===s);t&&t.tracks.length&&playFromPlaylist(t.id,0,!0)}
function togglePlay(){if(!YT_READY||!currentTrack)return;const s=ytPlayer.getPlayerState();s===YT.PlayerState.PLAYING?ytPlayer.pauseVideo():ytPlayer.playVideo()}
$("#npPlay")?.addEventListener("click",togglePlay),$("#miniPlay")?.addEventListener("click",togglePlay);async function removeFromPlaylist(s,t){const e=communityPlaylists.find(a=>a.id===s);if(!e)return;const{doc:o,updateDoc:a,serverTimestamp:i}=window.firebase,r=o(db,"playlists",s),l=e.tracks.filter(n=>n.id!==t);try{await a(r,{tracks:l,updatedAt:i()})}catch(n){console.error("Error quitando canción: ",n),alert("No se pudo quitar la canción.")}}
function updateMiniNow(){const s=!!currentTrack,t=$("#seekDock");t&&t.classList.toggle("show",s),s&&($("#miniThumb")&&($("#miniThumb").src=currentTrack.thumb),$("#miniTitle")&&($("#miniTitle").textContent=currentTrack.title),$("#miniAuthor")&&($("#miniAuthor").textContent=cleanAuthor(currentTrack.author)||""))}
function getNextIndex(){if(!queue)return-1;if(repeatMode==="one")return qIdx;let s=qIdx+1;return s>=queue.length?repeatMode==="all"?0:-1:s}
function next(){const s=getNextIndex();s!==-1?(qIdx=s,playCurrent(!0)):(ytPlayer.stopVideo(),currentTrack=null,updateUIOnTrackChange())}
function prev(){if(queue)ytPlayer.getCurrentTime()>3?ytPlayer.seekTo(0,!0):qIdx-1>=0&&(qIdx--,playCurrent(!0))}
$("#btnNext")?.addEventListener("click",next),$("#btnPrev")?.addEventListener("click",prev);function seekToFrac(s){if(!YT_READY)return;const t=ytPlayer.getDuration()||0;ytPlayer.seekTo(s*t,!0)}
$("#seek")?.addEventListener("input",s=>seekToFrac(parseInt(s.target.value,10)/1e3)),$("#miniSeek")?.addEventListener("input",s=>seekToFrac(parseInt(s.target.value,10)/1e3));function startTimer(){stopTimer(),timer=setInterval(()=>{if(!YT_READY||!currentTrack)return;const s=ytPlayer.getPlayerState();if(s!==YT.PlayerState.PLAYING&&s!==YT.PlayerState.BUFFERING)return;const t=ytPlayer.getCurrentTime()||0,e=ytPlayer.getDuration()||0;$("#cur")&&($("#cur").textContent=fmt(t)),$("#dur")&&($("#dur").textContent=fmt(e)),$("#seek")&&($("#seek").value=e?Math.floor(t/e*1e3):0),$("#miniCur")&&($("#miniCur").textContent=fmt(t)),$("#miniDur")&&($("#miniDur").textContent=fmt(e)),$("#miniSeek")&&($("#miniSeek").value=e?Math.floor(t/e*1e3):0);try{"mediaSession"in navigator&&typeof navigator.mediaSession.setPositionState=="function"&&navigator.mediaSession.setPositionState({duration:e||0,playbackRate:ytPlayer.getPlaybackRate(),position:t||0})}catch(o){}savePlayerState()},500)}
function stopTimer(){clearInterval(timer),timer=null}
function toggleShuffle(){isShuffle=!isShuffle,$("#btnShuffle")?.classList.toggle("active",isShuffle),currentTrack&&(setQueue(queue||[],queueType,Math.max(0,(queue||[]).findIndex(s=>s.id===currentTrack.id))),$("#queuePanel")&&!$("#queuePanel").classList.contains("hide")&&renderQueue(queue,currentQueueTitle))}
function cycleRepeat(){const s=["none","all","one"],t=s.indexOf(repeatMode);repeatMode=s[(t+1)%s.length];const e=$("#btnRepeat");e&&e.classList.toggle("active",repeatMode!=="none"),e&&(e.innerHTML=repeatMode==="one"?'<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>':'<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>')}
function updateControlStates(){$("#btnShuffle")?.classList.toggle("active",isShuffle),$("#btnRepeat")?.classList.toggle("active",repeatMode!=="none")}
$("#btnShuffle")?.addEventListener("click",toggleShuffle),$("#btnRepeat")?.addEventListener("click",cycleRepeat);function renderQueue(s,t){const e=$("#queuePanel");if(currentQueueTitle=t,!e)return;e.classList.contains("hide")&&e.classList.remove("hide");let o=e.querySelector(".section-head");o||(o=document.createElement("div"),o.className="section-head",o.innerHTML='<h3 id="queueTitle"></h3>',e.prepend(o));let a=e.querySelector("#queueList");a||(a=document.createElement("ul"),a.id="queueList",e.appendChild(a));const i=o.querySelector("#queueTitle");i&&(i.textContent=t);let r=o.querySelector("#btnSavePlaylist");r&&r.remove(),(queueType==="youtube_playlist"||queueType==="spotify_playlist")&&queue?.length>0&&(r=document.createElement("button"),r.id="btnSavePlaylist",r.className="pill",r.textContent="Guardar Lista",r.onclick=saveCurrentQueueAsPlaylist,o.appendChild(r));if(!a)return;a.innerHTML="";const l=queueType==="playlist";l||(viewingPlaylistId=null);for(const[n,c]of(s||[]).entries()){const d=document.createElement("li");d.className="queue-item",d.dataset.trackId=c.id,d.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" src="${c.thumb}" alt="">
        <button class="card-play" title="Play" aria-label="Play">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${c.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(c.author)||" "}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`,d.onclick=u=>{u.target.closest(".more")||u.target.closest(".card-play")||(qIdx=n,setQueue(s,queueType,n),playCurrent(!0))},d.querySelector(".card-play").onclick=u=>{u.stopPropagation(),qIdx=n,setQueue(s,queueType,n),playCurrent(!0)},a.appendChild(d)}refreshIndicators()}
async function saveCurrentQueueAsPlaylist(){if(!queue||queue.length===0)return void alert("No hay una lista de reproducción válida para guardar.");let s=localStorage.getItem("sy_creator_name");if(!s){const i=prompt("Para guardar, ingresá tu nombre de creador:")?.trim();if(!i)return;localStorage.setItem("sy_creator_name",i),s=i}const t=$("#btnSavePlaylist");t&&(t.disabled=!0,t.textContent="Guardando...");try{const{collection:i,addDoc:e,serverTimestamp:o}=window.firebase,a=await e(i(db,"playlists"),{name:currentQueueTitle,creator:s,tracks:queue,updatedAt:o(),isPublic:!0});addMyPlaylistId(a.id),t&&(t.textContent="Guardada ✔")}catch(i){console.error("Error guardando la playlist: ",i),alert("Hubo un error al guardar la playlist."),t&&(t.disabled=!1,t.textContent="Guardar Lista")}}
function hideQueuePanel(){$("#queuePanel")?.classList.add("hide"),$("#queueList")&&($("#queueList").innerHTML=""),viewingPlaylistId=null,renderPlaylists()}
document.addEventListener("click",async s=>{const t=s.target.closest(".icon-btn.more");if(!t)return;const e=t.closest(".result-item, .fav-item, .queue-item");if(!e)return;let o;const a=e.dataset.trackId;if(e.classList.contains("result-item")){const i=e.dataset.itemId,r=items.find(l=>l.id===i);if(!r)return;if(r.type.includes("playlist"))return;if(r.type==="spotify_track"){const l=await findYoutubeEquivalent(r);if(!l)return void alert("No se pudo encontrar esta canción en YouTube para agregarla.");o=l}else o=r}else e.classList.contains("fav-item")?o=favs.find(i=>i.id===a):e.classList.contains("queue-item")&&(o=queue[Array.from(e.parentNode.children).indexOf(e)]);if(!o)return;const i=[{id:"fav",label:isFav(o.id)?"Quitar de Favoritos":"Agregar a Favoritos"},{id:"pl",label:"Agregar a playlist"}];e.classList.contains("queue-item")&&queueType==="playlist"&&viewingPlaylistId&&isMyPlaylist(viewingPlaylistId)&&i.push({id:"delete",label:"Eliminar de esta playlist",danger:!0}),i.push({id:"cancel",label:"Cancelar",ghost:!0}),openActionSheet({title:o.title,actions:i,onAction:r=>{r==="fav"&&toggleFav(o),r==="pl"&&openPlaylistSheet(o),r==="delete"&&removeFromPlaylist(viewingPlaylistId,o.id)}})});

/* ========= Sistema base y arranque ========= */
function refreshIndicators(){const s=getPlaybackState()==="playing",t=currentTrack?.id||"";$$(".result-item, .fav-item, .queue-item").forEach(e=>{let o=e.dataset.trackId;const a=o===t;e.classList.toggle("is-playing",a);const i=e.querySelector(".card-play");i&&i.classList.toggle("playing",s&&a)}),$("#npPlay")?.classList.toggle("playing",s),$("#miniPlay")?.classList.toggle("playing",s)}
document.addEventListener("visibilitychange",()=>{if(!YT_READY||!currentTrack||document.visibilityState!=="hidden"||ytPlayer.getPlayerState()!==YT.PlayerState.PLAYING)return;const s=ytPlayer.getCurrentTime()||0;ytPlayer.loadVideoById({videoId:currentTrack.id,startSeconds:s,suggestedQuality:"auto"}),ytPlayer.playVideo()});function loadYTApi(){(window.YT&&window.YT.Player?onYouTubeIframeAPIReady:void 0)===void 0&&(s=document.createElement("script"),s.src="https://www.youtube.com/iframe_api",document.head.appendChild(s));var s}
window.onYouTubeIframeAPIReady=function(){ytPlayer=new YT.Player("player",{width:300,height:150,videoId:"",playerVars:{autoplay:0,controls:0,rel:0,playsinline:1},events:{onReady:()=>{YT_READY=!0,window.dispatchEvent(new Event("yt-ready"))},onStateChange:s=>{const t=s.data;t===YT.PlayerState.ENDED&&next();try{"mediaSession"in navigator&&(navigator.mediaSession.playbackState=t===YT.PlayerState.PLAYING||t===YT.PlayerState.BUFFERING?"playing":t===YT.PlayerState.PAUSED?"paused":"none")}catch(e){}refreshIndicators(),updateAndroidNotification()}}})};let rafPending=!1,lastScrollY=0,targetT=0,currentT=0;const EPS=.001,DIST=200;function applyHeroT(s){const t=Math.round(s*1e3)/1e3,e=document.querySelector(".view.active");if(!e)return;const o=e.querySelector("#favHero, .fav-hero"),a=e.querySelector("#npHero, .np-hero, .player-header-sticky");o&&o.style.setProperty("--hero-t",t),a&&a.style.setProperty("--hero-t",t)}
function heroScrollTickRaf(){rafPending=!1;const s=document.querySelector(".view.active");if(!s)return void applyHeroT(0);const t=s.getBoundingClientRect().top+window.scrollY,e=Math.max(0,lastScrollY-t);targetT=Math.min(1,e/DIST),currentT+=(targetT-currentT)*.25,Math.abs(targetT-currentT)<EPS&&(currentT=targetT),applyHeroT(currentT),Math.abs(targetT-currentT)>=EPS&&(requestAnimationFrame(heroScrollTickRaf),rafPending=!0)}
function heroScrollInvalidate(){lastScrollY=window.scrollY||document.documentElement.scrollTop||0,rafPending||(rafPending=!0,requestAnimationFrame(heroScrollTickRaf))}
window.addEventListener("scroll",heroScrollInvalidate,{passive:!0}),window.addEventListener("resize",heroScrollInvalidate,{passive:!0});let mediaSessionHandlersSet=!1;function updateMediaSession(s){if(!("mediaSession"in navigator)||!s)return;try{navigator.mediaSession.metadata=new MediaMetadata({title:s.title||"Reproduciendo",artist:cleanAuthor(s.author)||"—",album:queueType==="playlist"?communityPlaylists.find(t=>t.id===viewingPlaylistId)?.name||"":"",artwork:[{src:s.thumb,sizes:"512x512",type:"image/jpeg"}]})}catch(t){}if(!mediaSessionHandlersSet){mediaSessionHandlersSet=!0;const t=e=>()=>e();try{navigator.mediaSession.setActionHandler("play",t(()=>togglePlay())),navigator.mediaSession.setActionHandler("pause",t(()=>togglePlay())),navigator.mediaSession.setActionHandler("previoustrack",t(()=>prev())),navigator.mediaSession.setActionHandler("nexttrack",t(()=>next())),navigator.mediaSession.setActionHandler("seekbackward",t(e=>{const o=e.seekOffset||10;YT_READY&&ytPlayer.seekTo(Math.max(0,(ytPlayer.getCurrentTime()||0)-o),!0)})),navigator.mediaSession.setActionHandler("seekforward",t(e=>{const o=e.seekOffset||10;YT_READY&&ytPlayer.seekTo((ytPlayer.getCurrentTime()||0)+o,!0)})),navigator.mediaSession.setActionHandler("seekto",t(e=>{!YT_READY||!e||typeof e.seekTime!="number"||ytPlayer.seekTo(e.seekTime,!0)}))}catch(e){}}try{const e=getPlaybackState();navigator.mediaSession.playbackState=e==="playing"?"playing":e==="paused"?"paused":"none"}catch(t){}}
function canUseAndroidBridge(){try{return!!(window.AndroidBridge&&AndroidBridge.updateNotification&&AndroidBridge.stopNotification)}catch(s){return!1}}
function updateAndroidNotification(){if(!canUseAndroidBridge())return;const s=typeof getPlaybackState=="function"?getPlaybackState()==="playing":YT_READY&&ytPlayer&&(ytPlayer.getPlayerState()===YT.PlayerState.PLAYING||ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);!currentTrack?AndroidBridge.stopNotification():AndroidBridge.updateNotification(currentTrack.title||"",cleanAuthor(currentTrack.author||""),currentTrack.thumb||"",!!s)}
window.handleNativeControl=function(s){const t=String(s||"").toLowerCase();t==="action_play"?YT_READY&&ytPlayer&&ytPlayer.playVideo():t==="action_pause"?YT_READY&&ytPlayer&&ytPlayer.pauseVideo():t==="action_next"?next():t==="action_prev"&&prev()};

/* ========= Spotify Importación Masiva UI & Logic ========== */
function initSpotifyImportUI() {
    const playlistsView = $('#view-playlists');
    if (!playlistsView || $('#syBtnImportSpotify')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'sy-pl-toolbar';
    toolbar.innerHTML = `<button id="syBtnImportSpotify" class="pill accent">${spotifyLogoSvg().replace(/1em/g, '1.2em')} Importar desde Spotify</button>`;
    
    playlistsView.querySelector('.view-header').after(toolbar);
    
    $('#syBtnImportSpotify').addEventListener('click', openSpotifyImportModal);
    
    const style = document.createElement('style');
    style.textContent = `
        .sy-pl-toolbar { padding: 0 16px 12px; }
        .sy-pl-toolbar .pill { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;}
        .sy-modal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: all .2s ease; backdrop-filter: blur(4px); }
        .sy-modal.show { opacity: 1; visibility: visible; }
        .sy-modal__overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
        .sy-modal__card { position: relative; background: var(--sheet-bg); color: var(--text-primary); border-radius: 12px; width: min(500px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); }
        .sy-modal__header { padding: 16px; border-bottom: 1px solid var(--border-color); }
        .sy-modal__body { padding: 16px; overflow-y: auto; }
        .sy-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .sy-field input { padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--app-bg-deep); color: var(--text-primary); }
        .sy-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .sy-pl-results { margin-top: 16px; }
        .sy-pl-list { max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; margin-top: 8px; }
        .sy-pl-row { display: flex; align-items: center; gap: 12px; padding: 8px; cursor: pointer; border-bottom: 1px solid var(--border-color); }
        .sy-pl-row:last-child { border-bottom: 0; }
        .sy-pl-row:hover { background: var(--bg-hover); }
        .sy-pl-row img { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
        .sy-pl-meta { flex: 1; min-width: 0; }
        .sy-pl-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sy-pl-sub { font-size: 0.8em; color: var(--text-secondary); }
    `;
    document.head.appendChild(style);
}

function openSpotifyImportModal() {
    let modal = $('#sySpotifyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sySpotifyModal';
        modal.className = 'sy-modal';
        modal.innerHTML = `
            <div class="sy-modal__overlay"></div>
            <div class="sy-modal__card">
                <div class="sy-modal__header"><h3>Importar playlists de Spotify</h3></div>
                <div class="sy-modal__body">
                    <p style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 16px;">Ingresá tu nombre de usuario de Spotify o pegá el enlace a tu perfil para buscar tus listas públicas.</p>
                    <div class="sy-field">
                        <input id="sySmInput" type="text" placeholder="ej. tu_usuario_spotify">
                    </div>
                    <div class="sy-actions">
                        <button class="pill" id="sySmCancel">Cancelar</button>
                        <button class="pill accent" id="sySmFetch">Buscar Playlists</button>
                    </div>
                    <div id="sySmResults" style="margin-top: 16px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.classList.remove('show');
        modal.querySelector('.sy-modal__overlay').onclick = closeModal;
        $('#sySmCancel').onclick = closeModal;
        $('#sySmFetch').onclick = fetchSpotifyUserPlaylists;
    }
    
    modal.classList.add('show');
    $('#sySmInput').focus();
}

async function fetchSpotifyUserPlaylists() {
    const input = $('#sySmInput').value.trim();
    const userId = input.match(/user\/([a-zA-Z0-9]+)/)?.[1] || input;
    const resultsDiv = $('#sySmResults');
    resultsDiv.innerHTML = `<div class="loading-indicator">Buscando...</div>`;

    if (!userId) {
        resultsDiv.innerHTML = `<p style="color: red;">Usuario o URL no válido.</p>`;
        return;
    }

    try {
        const token = await getSpotifyToken();
        let url = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists?limit=50`;
        const userPlaylists = [];
        while (url) {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Usuario no encontrado o API error (${res.status})`);
            const data = await res.json();
            userPlaylists.push(...data.items);
            url = data.next;
        }

        if (userPlaylists.length === 0) {
            resultsDiv.innerHTML = `<p>No se encontraron playlists públicas para este usuario.</p>`;
            return;
        }
        renderSpotifyPlaylistsSelection(userId, userPlaylists, resultsDiv);
    } catch (e) {
        resultsDiv.innerHTML = `<p style="color: red;">Error: ${e.message}</p>`;
    }
}

function renderSpotifyPlaylistsSelection(creator, playlists, container) {
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label><input type="checkbox" id="syPlAll" checked> Seleccionar todo</label>
        </div>
        <div class="sy-pl-list">${playlists.map(p => `
            <label class="sy-pl-row">
                <input type="checkbox" class="sy-pl-check" data-id="${p.id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-cover="${p.images?.[0]?.url || ''}" checked>
                <img src="${p.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'}" alt="">
                <div class="sy-pl-meta">
                    <div class="sy-pl-name">${p.name}</div>
                    <div class="sy-pl-sub">${p.tracks.total} temas</div>
                </div>
            </label>`).join('')}
        </div>
        <div class="sy-actions">
             <button class="pill accent" id="syPlImportBtn">Importar Seleccionadas</button>
        </div>`;

    $('#syPlAll').onchange = (e) => {
        container.querySelectorAll('.sy-pl-check').forEach(chk => chk.checked = e.target.checked);
    };
    $('#syPlImportBtn').onclick = () => processAndSavePlaylists(creator, container);
}

async function processAndSavePlaylists(creator, container) {
    const btn = $('#syPlImportBtn');
    btn.disabled = true;
    btn.textContent = 'Importando...';

    const selectedPlaylists = Array.from(container.querySelectorAll('.sy-pl-check:checked'));
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = window.firebase;
    
    let importedCount = 0;
    let updatedCount = 0;
    
    for (const [index, p_input] of selectedPlaylists.entries()) {
        btn.textContent = `Procesando ${index + 1}/${selectedPlaylists.length}...`;
        const spotifyId = p_input.dataset.id;
        
        const q = query(collection(db, 'playlists'), where("spotifyId", "==", spotifyId));
        const existing = await getDocs(q);

        const spotifyTracks = await fetchAllSpotifyPlaylistTracks(spotifyId);
        
        if (existing.empty) {
            const docRef = await addDoc(collection(db, 'playlists'), {
                name: p_input.dataset.name,
                creator,
                isPublic: false,
                cover: p_input.dataset.cover,
                source: 'spotify',
                spotifyId,
                spotifyTracks,
                tracks: [],
                updatedAt: serverTimestamp()
            });
            addMyPlaylistId(docRef.id);
            importedCount++;
        } else {
            const docRef = doc(db, 'playlists', existing.docs[0].id);
            await updateDoc(docRef, {
                spotifyTracks,
                tracks: [],
                updatedAt: serverTimestamp()
            });
            updatedCount++;
        }
    }
    
    container.innerHTML = `<p>¡Listo! Se importaron ${importedCount} y se actualizaron ${updatedCount} playlists.</p>`;
    setTimeout(() => $('#sySpotifyModal')?.classList.remove('show'), 2500);
}

async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
    while(url) {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }});
        if (!res.ok) { console.error(`Failed to fetch tracks for ${playlistId}`); break; }
        const data = await res.json();
        allTracks.push(...data.items.map(({track}) => track ? {
            source: 'spotify',
            id: track.id,
            title: track.name,
            author: track.artists.map(a => a.name).join(', '),
            thumb: track.album.images?.[0]?.url || ''
        } : null).filter(Boolean));
        url = data.next;
    }
    return allTracks;
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
    communityPlaylists = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPlaylists();
    renderAllHomePlaylists();
    if (viewingPlaylistId && queueType === 'playlist') {
      const updatedPlaylist = communityPlaylists.find(p => p.id === viewingPlaylistId);
      if(updatedPlaylist){
        const currentId=currentTrack?currentTrack.id:null; 
        if(JSON.stringify(queue) !== JSON.stringify(updatedPlaylist.tracks)) {
            renderQueue(updatedPlaylist.tracks,updatedPlaylist.name); 
            setQueue(updatedPlaylist.tracks,'playlist',qIdx); 
        }
        const newIdx=updatedPlaylist.tracks.findIndex(t=>t.id===currentId);
        if(newIdx!==-1){qIdx=newIdx}else{qIdx=Math.min(qIdx,updatedPlaylist.tracks.length-1);if(updatedPlaylist.tracks.length===0){currentTrack=null;ytPlayer.stopVideo()}else{currentTrack=queue[qIdx]} updateUIOnTrackChange()}
      }else{hideQueuePanel();if(queueType==='playlist'){currentTrack=null;queue=null;ytPlayer.stopVideo();updateUIOnTrackChange()}}
    }
  });
  
  const savedJob = localStorage.getItem('sy_import_job');
  if (savedJob) {
      const checkPlaylistsLoaded = setInterval(() => {
          const playlistToResume = communityPlaylists.find(p => p.id === savedJob);
          if (playlistToResume) {
              clearInterval(checkPlaylistsLoaded);
              showPlaylistInPlayer(savedJob);
          }
      }, 500);
      setTimeout(() => clearInterval(checkPlaylistsLoaded), 10000); 
  }

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
  initSpotifyImportUI();
}

function renderAllHomePlaylists(){
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks?.length > 0) || (p.spotifyTracks?.length > 0)));
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => { 
        const dateA = a.updatedAt?.toDate() || new Date(0); 
        const dateB = b.updatedAt?.toDate() || new Date(0); 
        return dateB - dateA; 
    });
    for(const p of allPlaylists) renderPlaylistCard(p);
}

boot();
window.addEventListener("beforeunload",savePlayerState);
window.addEventListener("beforeunload",function(){canUseAndroidBridge()&&AndroidBridge.stopNotification()});
