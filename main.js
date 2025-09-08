// Archivo principal: inicialización, manejo de vistas y conexión de módulos.

// --- Listas de reproducción recomendadas (datos estáticos) ---
const recommendedPlaylists = {
  p1: { ids: ['dTd2ylacYNU', 'Bx51eegLTY8', 'luwAMFcc2f8', 'J9gKyRmic20', 'izGwDsrQ1eQ', 'r3Pr1_v7hsw', 'k2C5TjS2sh4', 'YkgkThdzX-8', 'n4RjJKxsamQ', 'iy4mXZN1Zzk', 'RcZn2-bGXqQ', '1TO48Cnl66w', 'Zz-DJr1Qs54', 'TR3VdoetCQ', '6NXnxTNIWkc', 'YlUKcNNmywk', '6Ejga4kJUts', 'XFkzRNyygfk', 'TmENMZFUU_0', 'NMNgbISmF4I', '8SbUC-UaAxE', 'UrIiLvg58SY', 'IYOYlqOitDA', '7pOr3dBFAeY', '5anLPw0Efmo', 'zRIbf6JqkNc', '9BMwcO6_hyA', 'n4RjJKxsamQ', 'NvR60Wg9R7Q', 'BciS5krYL80', 'UelDrZ1aFeY', 'fregObNcHC8', 'GLvohMXgcBo', 'TR3VdoetCQ'], title: 'Grandes éxitos de los melodicos de los 70s, 80s y 90s para recordar', creator: 'Luis Sanavera', data: [], isRecommended: true },
  p2: { ids: ['0qSif7B09N8', 'Ngi3rVx6kho', 'HhsXDJ1KeAI', 'MjgYsL3e3Mw', 'rsjGKU-qg3c', 'G6DbIQzCVBk', 'mdQW8ZLHpCU', 'MX-vrDW-A7I', 'uxZC1W6DHmI', 'WTlEED0_QcQ', 'ALA8ZDLQF9U', 'x1tWQNxJpY4', 'h2gj7Aap3iY', 'biXIrPcupuE', 'Vw5j10cBU78', 'Z5jQKzbOejY', 'ypg7ikDRhfg', '1gtJWFSWuYc', 'IhWGr-hTfHU', 'ZAKWI3mi14A', 'gy2hK11AKGE', 'fuYq32iJdIw', 'DzhxJkF7c9s', 'QqS4kWie8SA', 'sw6v-Q-2Is4', 'yXXheK7wYqo', 'xd-IwfDs7c4', 'HcWlkUKwjlc', 'pPoUVEcT0aU', 'N7m-0KXjKR0', 'OX2fVkdQYKg', 'AIIcEeQaWI0', 'WI0da9h-gcE', 'uxZC1W6DHmI', 'w09HG8_FAHQ', '_IqyVs9ObFA', 'auNa0nRPg3o', '46T65kU9Pw0', 'lsDSVZ10sY4', '4nztFNNeay0'], title: 'Cumbia estilo Santafesino para disfrutar con amigos y familia', creator: 'Luis Sanavera', data: [], isRecommended: true },
  cumbia: { ids: [ 'UHWCB7D8XoI', 'OXunU0CJXtc', 'D-TrNF5V2jo', 'Wcb_gUU5LVA', 'bhyjF3t5XJQ', 'HHOsoZcJ-TY', 'eVHIQ4oxjwM', '9jbiAeXZKbw', 'dcy_B7oSIf8', 'UPnTZCTXHvw', 'v2FjIJUQPhU', 'fgTLwYJpbgQ', 'vHyZrsEuE2o', 'OU2KT7wlAGw', 'aRLPHz0zsUo', 'SE3oVXcppVc', 'P6W-c8y4j5w', 'yBco-h1QPPA', 'umLyS0-GXLQ', '01p-1kMosCI', 'h8emXFUHH0Y', '098YVg5RmkA', '7M6WsIKMtKg', '2aO4gdfkSc8', 'tJCK6y3gPfU', '1rwXkK3vWpg', 'rXuhQxo_Ebc', 'gfPmhcIIi90', 'biIRifuGPa4', 'ym3vG_UgLEA', 'sgIUGLFZ2sE', '3bkfEGlZNqQ', 'Gzo5UY3D7lE', 'CdGxWUu2lwU', 'NrbmqV7ah_c', 'PfnSKD5hgYk', 'NqxCPeG0R7Q', 'gOt1JFkEauU', 'vhSIFloIMxI', 'dWOEGMhOm9k', 'UGFBEUBEpss', '2wGDGtm8dwY', 'IfMujYwHOOE', '9X35iRX27B8', 'PsLVh10nF2w', 'SYQ6svFb8_0', '9UQSYNvA6NE', 'z-MrnGLyj28', 'xH_7932NfYU', 'PTqvL19p87c' ], title: 'Cumbias del Recuerdo', creator: 'Luis Sanavera', data: [], isRecommended: true },
  reggaeton: { ids: ['kJQP7kiw5Fk', 'TmKh7lAwnBI', 'tbneQDc2H3I', 'wnJ6LuUFpMo', '_I_D_8Z4sJE', 'DiItGE3eAyQ', 'VqEbCxg2bNI', '9jI-z9QN6g8', 'Cr8K88UcO0s', 'QaXhVryxVBk', 'ca48oMV59LU', '0VR3dfZf9Yg'], title: 'Noche de Reggaetón', creator: 'Sebastián Sanavera', data: [], isRecommended: true },
  reggae: { ids: ['HNBCVM4KbUM', 'IT8XvzIfi4U', '69RdQFDuYPI', 'vdB-8eLEW8g', 'yv5xonFSC4c', 'oqVy6eRXc7Q', 'zXt56MB-3vc', 'f7OXGANW9Ic', 'MrHxhQPOO2c', 'ti2YCFgCoI', '_GZlJGERbvE', 'LfeIfiiBTfY'], title: 'Vibras de Reggae', creator: 'Sebastián Sanavera', data: [], isRecommended: true },
  pop: { ids: ['JGwWNGJdvx8', 'YQHsXMglC9A', '09R8_2nJtjg', 'OPf0YbXqDm0', 'nfWlot6h_JM', 'fHI8X4OXluQ', 'TUVcZfQe-Kw', 'DyDfgMOUjCI', 'CevxZvSJLk8', 'fRh_vgS2dFE', 'YykjpeuMNEk', '2vjPBrBU-TM'], title: 'Éxitos Pop', creator: 'Sebastián Sanavera', data: [], isRecommended: true },
  rock_int: { ids: ['1w7OgIMMRc4', 'rY0WxgSXdEE', 'fJ9rUzIMcZQ', 'eVTXPUF4Oz4', 'hTWKbfoikg', 'v2AC41dglnM', 'btPJPFnesV4', 'tAGnKpE4NCI', 'YlUKcNNmywk', '6Ejga4kJUts', 'lDK9QqIzhwk', 'kXYiU_JCYtU'], title: 'Himnos del Rock', creator: 'Sebastián Sanavera', data: [], isRecommended: true },
  bachata: { ids: ['QFs3PIZb3js', 'bdOXnTbyk0g', 'yC9u00F-NF0', '8iPcqtHoR3U', '0XCot42qTvA', 'z2pt4CN4rhc', 'XNGWDH-6yv8', 'foyH-TEs9D0', 'JNkTNAknE4I', 'h_fXySfFmM8', 'elGZbcpGzdU', '8Ei86cJIWlk'], title: 'Corazón de Bachata', creator: 'Sebastián Sanavera', data: [], isRecommended: true },
  international: { ids: ['djV11Xbc914', 'Zi_XLOBDo_Y', '3JWTaaS7LdU', 'n4RjJKxsamQ', 'vx2u5uUu3DE', 'PIb6AZdTr-A', '9jK-NcRmVcw', 'dQw4w9WgXcQ', 'FTQbiNvZqaY', 'rY0WxgSXdEE', 'YkAD0TPrJA', '0-EF60neguk'], title: 'Clásicos 70/80/90s', creator: 'Sebastián Sanavera', data: [], isRecommended: true }
};

// --- Utils ---
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"").replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"").replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"").replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"").replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"").replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "").replace(/VEVO/gi, "").replace(/\s{2,}/g, " ").replace(/\s*-\s*$/, "").trim();
const dotsSvg = () => `<svg class="icon-dots" viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const youtubeLogoSvg = () => `<span class="source-logo youtube-logo" title="YouTube"><svg viewBox="0 0 28 20"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"/></svg></span>`;
const spotifyLogoSvg = () => `<span class="source-logo spotify-logo" title="Spotify"><svg viewBox="0 0 167.5 167.5"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"/></svg></span>`;
const youtubeMusicLogoSvg = () => `<span class="source-logo ytmusic-logo" title="YouTube Music"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg></span>`;

// --- Navegación y Vistas ---
function switchView(id){
  $$(".view").forEach(v => v.classList.remove("active"));
  const view = $("#" + id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  if (id !== "view-search") {
      updateHomeGridVisibility();
  }
  heroScrollInvalidate();
}

// --- Lógica de la Interfaz de Usuario (UI) ---

/**
 * Actualiza la UI (reproductor principal y mini-reproductor) cuando cambia la canción.
 */
function updateUIOnTrackChange() {
  updateHero(currentTrack);
  updateMiniNow();
  refreshIndicators();
  updateControlStates();
  updateMediaSession(currentTrack);
  updateAndroidNotification();
}

/**
 * Actualiza el "hero" (imagen grande) en las vistas de Favoritos y Reproductor.
 * @param {object} track - La canción actual.
 */
function updateHero(track) {
  const t = track || currentTrack;
  const favHero = $("#favHero");
  const npHero  = $("#npHero");
  
  if (favHero) favHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  if ($("#favNowTitle")) $("#favNowTitle").textContent = t ? t.title : "—";
  if (npHero) npHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  if ($("#npTitle")) $("#npTitle").textContent = t ? t.title : "Elegí una canción";

  let plName = "";
  if (queueType === 'playlist' && viewingPlaylistId) {
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    plName = pl ? pl.name : "";
  } else if (['recommended', 'youtube_playlist'].includes(queueType)) {
    plName = currentQueueTitle;
  }

  if ($("#npSub")) $("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—");
}

/**
 * Actualiza el mini-reproductor en la parte inferior.
 */
function updateMiniNow() {
  const hasTrack = !!currentTrack;
  const dock = $("#seekDock");
  if (dock) dock.classList.toggle("show", hasTrack);
  if (!hasTrack) return;
  
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  $("#miniAuthor").textContent = cleanAuthor(currentTrack.author) || "";
}

/**
 * Refresca los indicadores visuales de reproducción (equalizer, botón de play/pause).
 */
function refreshIndicators() {
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

/**
 * Actualiza el estado visual de los botones de shuffle y repeat.
 */
function updateControlStates() {
    $("#btnShuffle")?.classList.toggle('active', isShuffle);
    const repeatBtn = $("#btnRepeat");
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'none');
        repeatBtn.innerHTML = (repeatMode === 'one')
          ? `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>`
          : `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    }
}

// --- Home Grid ---

/**
 * Renderiza una tarjeta de playlist en la cuadrícula principal.
 * @param {object} playlist - El objeto de la playlist.
 */
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    
    let trackCount = playlist.trackCount || playlist.tracks?.length || 0;
    if (playlist.isRecommended) trackCount = playlist.data.length;
    if (trackCount === 0) return;

    let covers = (playlist.tracks || playlist.data || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    
    const logo = playlist.isRecommended ? youtubeLogoSvg() : (playlist.source === 'spotify' ? spotifyLogoSvg() : youtubeLogoSvg());
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id || playlist.title;
    const titleText = playlist.title || playlist.name;

    card.innerHTML = `
        <div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
        <div class="playlist-meta">
            <div class="playlist-title-wrapper"><h4 class="playlist-title">${titleText}</h4></div>
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

/**
 * Renderiza todas las playlists (recomendadas y de la comunidad) en la página de inicio.
 */
function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0)));
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

/**
 * Controla la visibilidad de la sección de inicio.
 */
function updateHomeGridVisibility(){
  const home = $("#homeSection"); if(!home) return;
  const shouldShow = (items.length===0 && !$(".loading-indicator"));
  home.classList.toggle("hide", !shouldShow);
}

// --- Sheets, Toasts & Menús ---

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
  sheet.innerHTML = `<div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`<button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">${a.label}</button>`).join("")}
    </div>`;
  sheet.classList.add("show");
  sheet.onclick = (e)=>{
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
    btn.className="sheet-item";
    btn.textContent = pl.name;
    btn.onclick = async ()=>{
      if (await addSongToPlaylist(pl.id, track)) {
          sheet.classList.remove("show");
          showToast(`Agregado a "${pl.name}"`);
      }
    };
    list.appendChild(btn);
  });

  $("#plCreateFromSong").onclick = async () => {
    const name = $("#plNewNameFromSong").value.trim();
    if (!name) return;
    const creator = prompt("Tu nombre (creador):")?.trim();
    if (!creator) return;
    if (await createNewPlaylistFromSong(name, creator, track)) {
        $("#plNewNameFromSong").value = "";
        sheet.classList.remove("show");
        showToast(`Agregado a la nueva playlist "${name}"`);
    }
  };

  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

// --- Tema ---
const THEME_KEY = "sy_theme_v1";
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const tBtn = $("#themeToggle");
  if(tBtn) tBtn.classList.toggle("is-light", theme === "light");
  const meta = $('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim());
  document.documentElement.style.colorScheme = theme;
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  $("#themeToggle")?.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}

// --- Efecto Hero Scroll ---
let rafPending = false, lastScrollY = 0, targetT = 0, currentT = 0;
function heroScrollTickRaf(){
    rafPending=false;
    const activeView = $(".view.active");
    if(!activeView) return;
    const viewTop = activeView.getBoundingClientRect().top + window.scrollY;
    const y = Math.max(0, lastScrollY - viewTop);
    targetT = Math.min(1, y / 200);
    currentT += (targetT - currentT) * 0.25;
    if (Math.abs(targetT-currentT) < 0.001) currentT = targetT;
    const hero = activeView.querySelector("#favHero, .fav-hero, #npHero, .np-hero, .player-header-sticky");
    if (hero) hero.style.setProperty("--hero-t", currentT);
    if (Math.abs(targetT-currentT) >= 0.001) { requestAnimationFrame(heroScrollTickRaf); rafPending=true; }
}
function heroScrollInvalidate(){
    lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (!rafPending) { rafPending = true; requestAnimationFrame(heroScrollTickRaf); }
}

// --- Arranque de la App ---
async function boot(){
  initTheme();
  await initFirebase();
  
  const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
  const results = await Promise.all(fetchPromises);
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });

  renderAllHomePlaylists();
  updateHomeGridVisibility();

  loadFavs();
  renderFavs();
  initPlayer();
  loadYTApi();
  initSearch();
  initPlaylistModals();

  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);
  
  heroScrollInvalidate();
  document.title = "SanaveraYou Pro";
  
  // Event Listeners globales
  $("#bottomNav").addEventListener("click", e=>{
    const btn = e.target.closest(".nav-btn"); if(!btn || btn.classList.contains('active')) return;
    switchView(btn.dataset.view);
  });
  
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".icon-btn.more");
    if (!btn) return;
    const itemEl = btn.closest(".result-item, .fav-item, .queue-item");
    if (!itemEl) return;

    let track;
    const trackId = itemEl.dataset.trackId;
    if (itemEl.classList.contains("result-item")) track = items.find(x => x.id === trackId);
    else if (itemEl.classList.contains("fav-item")) track = favs.find(f => f.id === trackId);
    else if (itemEl.classList.contains("queue-item")) track = queue.find(t => t.id === trackId);
    if (!track) return;

    const actions = [
        { id: "fav", label: isFav(track.id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
        { id: "pl", label: "Agregar a playlist" }
    ];
    if (itemEl.classList.contains("queue-item") && queueType === 'playlist' && viewingPlaylistId && isMyPlaylist(viewingPlaylistId)) {
        actions.push({ id: "reassign", label: "Reasignar fuente" });
        actions.push({ id: "delete", label: "Eliminar de esta playlist", danger: true });
    }
    actions.push({ id: "cancel", label: "Cancelar", ghost: true });

    openActionSheet({
        title: track.title,
        actions: actions,
        onAction: (act) => {
            if (act === "fav") toggleFav(track);
            if (act === "pl") openPlaylistSheet(track);
            if (act === "delete") removeFromPlaylist(viewingPlaylistId, track.id);
            if (act === "reassign") reassignTrackSource(viewingPlaylistId, track.id);
        }
    });
  });

  window.addEventListener("scroll", heroScrollInvalidate, { passive:true });
  window.addEventListener("resize", heroScrollInvalidate, { passive:true });
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', boot);
