import { onAuthChange, Session, communityPlaylists, getMyPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addFavorite, removeFavorite, addSongToPlaylist, getSystemPlaylists, getPublicPlaylists, isUserAuthenticated, signOutAll, signIn, signUp } from './firebase.js';
import { loadFavs, isFav, toggleFav } from './favoritos.js';

// Archivo principal: inicialización, manejo de vistas y conexión de módulos.
var currentSearchType = 'youtube'; // 'youtube' o 'archive' - Declarado como var para ser global
let activeSessions = []; 

// --- Listas de reproducción recomendadas (datos estáticos) ---
const recommendedPlaylists = {};

// --- Utils ---
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"").replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"").replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"").replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"").replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"").replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "").replace(/VEVO/gi, "").replace(/\s{2,}/g, " ").replace(/\s*-\s*$/, "").trim();
const dotsSvg = () => `<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const favIconSvg = (isFav) => isFav
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;
const youtubeLogoSvg = () => `<span class="source-logo youtube-logo" title="YouTube"><svg viewBox="0 0 28 20"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"/></svg></span>`;
const spotifyLogoSvg = () => `<span class="source-logo spotify-logo" title="Spotify"><svg viewBox="0 0 167.5 167.5"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"/></svg></span>`;
const youtubeMusicLogoSvg = () => `<span class="source-logo ytmusic-logo" title="YouTube Music"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg></span>`;
const archiveLogoSvg = () => `<span class="source-logo archive-logo" title="Archive.org"><svg viewBox="0 0 14 20"><path fill="currentColor" d="M7,0.21L0,4.91V6.28H14V4.91L7,0.21M1,7.22V18.59L7,15.25L13,18.59V7.22H1Z" /></svg></span>`;


// --- Navegación y Vistas ---
function switchView(id){
  $$(".view").forEach(v => v.classList.remove("active"));
  const view = $("#" + id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  updateHomeGridVisibility();
  heroScrollInvalidate();
}

// --- Lógica del Switch de Búsqueda ---
function initSearchTypeSwitch() {
    const switchContainer = $("#searchTypeSwitch");
    if (!switchContainer) return;

    switchContainer.addEventListener('click', (e) => {
        const clickedButton = e.target.closest('.switch-btn');
        if (!clickedButton) return;
        setSearchType(clickedButton.dataset.type);
    });

    // Cargar preferencia guardada al inicio
    const savedType = localStorage.getItem('sy_search_type') || 'youtube';
    setSearchType(savedType);
}

/**
 * Función centralizada para cambiar el tipo de búsqueda (estado y UI).
 * @param {string} searchType - 'youtube' o 'archive'.
 */
function setSearchType(searchType) {
    if (!searchType) return; // Permitir re-aplicar el estado
    currentSearchType = searchType;

    const switchContainer = $("#searchTypeSwitch");
    if (switchContainer) {
        // Lógica robusta: Quita 'active' de todos y lo pone solo en el correcto.
        switchContainer.querySelectorAll('.switch-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeButton = switchContainer.querySelector(`.switch-btn[data-type="${searchType}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    const placeholder = searchType === 'youtube' ? 'Buscar canciones...' : 'Buscar álbumes...';
    const searchInput = $("#overlaySearchInput");
    if (searchInput) {
        searchInput.placeholder = placeholder;
    }
    localStorage.setItem('sy_search_type', searchType);
}


// --- Lógica de la Interfaz de Usuario (UI) ---
function updateUIOnTrackChange() {
  updateHero(currentTrack);
  updateMiniNow();
  refreshIndicators();
  updateControlStates();
  updateMediaSession(currentTrack);
  updateAndroidNotification();
  
  const broadcastWrapper = $("#broadcastWrapper");
  if (broadcastWrapper) {
      broadcastWrapper.classList.toggle("broadcasting", liveState.mode === 'broadcasting');
  }
  const broadcastBtn = $("#broadcastBtn");
  if(broadcastBtn){
      broadcastBtn.title = liveState.mode === 'broadcasting' ? "Finalizar transmisión" : "Iniciar transmisión";
  }
}

function updateHero(track) {
  const t = track || currentTrack;
  const favHero = $("#favHero"), npHero  = $("#npHero");

  if (favHero) favHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  if ($("#favNowTitle")) $("#favNowTitle").textContent = t ? t.title : "—";
  if (npHero) npHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";

  const btnSaveAlbum = $("#btnSaveAlbum");
  if(btnSaveAlbum){
      const isArchiveAlbum = queueType === 'archive_album';
      btnSaveAlbum.classList.toggle('hide', !isArchiveAlbum);
  }

  const npTitle = $("#npTitle");
  if (npTitle) npTitle.textContent = t ? t.title : "Elegí una canción";

  let plName = "";
  if (queueType === 'playlist' && viewingPlaylistId) {
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    plName = pl ? pl.name : "";
  } else if (['recommended', 'youtube_playlist', 'archive_album'].includes(queueType)) {
    plName = currentQueueTitle;
  }
  let subText = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—");
  if (liveState.mode === 'listening' && liveState.sessionData) {
      subText = `Escuchando a: ${liveState.sessionData.name}`;
  } else if (liveState.mode === 'broadcasting') {
      subText = `Transmitiendo en vivo`;
  }
  if ($("#npSub")) $("#npSub").textContent = subText;
}

function updateMiniNow() {
  const hasTrack = !!currentTrack;
  const dock = $("#seekDock");
  if (dock) dock.classList.toggle("show", hasTrack);
  if (!hasTrack) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  let authorText = cleanAuthor(currentTrack.author) || "";
  if (liveState.mode === 'listening' && liveState.sessionData) {
      authorText = `De: ${liveState.sessionData.name}`;
  } else if (liveState.mode === 'broadcasting') {
      authorText = ''; 
  }
  $("#miniAuthor").textContent = authorText;
}

function refreshIndicators() {
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    let trackId = el.dataset.trackId;
    const isCurrentTrack = trackId === curId;
    el.classList.toggle("is-playing", isCurrentTrack);

    const cardPlay = el.querySelector(".card-play");
    if (cardPlay) cardPlay.classList.toggle("playing", isPlaying && isCurrentTrack);

    const favBtn = el.querySelector(".fav-btn");
    if (favBtn) {
        favBtn.innerHTML = favIconSvg(isFav(trackId));
        favBtn.classList.toggle('is-fav', isFav(trackId));
    }
  });

  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}

function updateControlStates() {
    const isListening = liveState.mode === 'listening';
    $("#btnShuffle")?.classList.toggle('active', isShuffle && !isListening);
    const repeatBtn = $("#btnRepeat");
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'none' && !isListening);
        repeatBtn.innerHTML = (repeatMode === 'one' && !isListening)
          ? `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>`
          : `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    }
}

// --- Home Grid ---
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    let trackCount = playlist.trackCount || playlist.tracks?.length || 0;
    if (playlist.isRecommended) trackCount = playlist.data.length;
    if (trackCount === 0) return;
    let covers = (playlist.tracks || playlist.data || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    
    let logo;
    switch(playlist.source) {
        case 'spotify': logo = spotifyLogoSvg(); break;
        case 'archive': logo = archiveLogoSvg(); break;
        default: logo = youtubeLogoSvg(); break;
    }
    
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id || playlist.title;
    const titleText = playlist.title || playlist.name;
    card.innerHTML = `<div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
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

function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0)));
    const allPlaylists = [ ...Object.values(recommendedPlaylists).filter(p => p.data.length > 0), ...publicCommunityPlaylists ];
    allPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    allPlaylists.forEach(p => renderPlaylistCard(p));
}

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
  if (!canActivate("playlists")) return;
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

// --- Lógica de UI para Transmisiones ---
function renderLiveSessions(sessions) {
    activeSessions = sessions; 
    const listEl = $("#sessionsList");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (sessions.length === 0) {
        listEl.innerHTML = `<div class="empty muted">No hay transmisiones activas.</div>`;
        return;
    }
    sessions.forEach(session => {
        const item = document.createElement("div");
        item.className = "session-item";
        item.dataset.sessionId = session.id;
        item.dataset.sessionName = session.name;
        item.innerHTML = `
            <div class="session-item-meta">
                <span class="session-item-name">${session.name}</span>
                <span class="session-item-genre">${session.genre}</span>
            </div>
            <div class="session-item-live-indicator">EN VIVO</div>
        `;
        item.addEventListener("click", () => {
            startListening(session.id, session.name);
            $("#sessionsSheet").classList.remove("show");
            $("#leaveStreamBtn").classList.remove("hide");
        });
        listEl.appendChild(item);
    });
}

function initLiveStreamsUI() {
    const startStreamSheet = $("#startStreamSheet");
    const sessionsSheet = $("#sessionsSheet");

    $("#broadcastBtn")?.addEventListener("click", () => {
        if (liveState.mode === 'broadcasting') {
            stopBroadcasting();
        } else {
            if (canActivate('cast')) {
                startStreamSheet.classList.add("show");
            }
        }
    });

    $("#startStreamCancel")?.addEventListener("click", () => startStreamSheet.classList.remove("show"));
    $("#startStreamConfirm")?.addEventListener("click", async () => {
        const name = $("#streamNameInput").value.trim();
        const genre = $("#streamGenreSelect").value;
        if (!name) {
            showToast("Por favor, ingresa un nombre para la transmisión.", true);
            return;
        }
        startStreamSheet.classList.remove("show");
        const success = await startBroadcasting(name, genre);
        if (!success) {
             showToast("No se pudo iniciar la transmisión.", true);
        }
    });

    $("#btnShowStreams")?.addEventListener("click", async () => {
        if (liveState.mode === 'broadcasting') {
            showToast("No puedes ver transmisiones mientras estás transmitiendo.");
            return;
        }
        sessionsSheet.classList.add("show");
        renderLiveSessions(activeSessions);
        $("#leaveStreamBtn").classList.toggle("hide", liveState.mode !== 'listening');
    });

    $("#closeSessions")?.addEventListener("click", () => sessionsSheet.classList.remove("show"));
    $("#leaveStreamBtn")?.addEventListener("click", () => {
        stopListening();
        sessionsSheet.classList.remove("show");
    });
}

function canActivate(feature) {
  if (Session.status === "guest") {
    showAlert("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    return false;
  }
  return true;
}

function showAlert(msg) {
  let toast = document.getElementById('sy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'show';
    toast.classList.add('error');
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 5000);
}

// --- Arranque de la App ---
async function boot(){
  initTheme();
  
  onAuthChange(session => {
    // Re-render UI based on auth state
    const isLogged = session.status === "logged";
    $("#userMenuLogged").classList.toggle("hide", !isLogged);
    $("#userMenuGuest").classList.toggle("hide", isLogged);
    if(isLogged) {
      $("#loggedUserEmail").textContent = session.email;
      $("#loggedUsername").textContent = session.username;
    }
    loadFavs();
    renderPlaylists();
    renderAllHomePlaylists();
  });
  
  // Set up auth form handlers
  $("#loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value;
    const pass = $("#loginPass").value;
    const user = await signIn(email, pass);
    if (!user) showAlert("Credenciales inválidas.");
  });
  
  $("#registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#regEmail").value;
    const pass = $("#regPass").value;
    const username = $("#regUsername").value;
    const user = await signUp(email, pass, username);
    if (!user) showAlert("Error al registrar el usuario.");
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await signOutAll();
    $("#userMenu").classList.add("hide");
    showToast("Sesión cerrada.");
  });

  $("#userMenuBtn")?.addEventListener("click", () => {
    $("#userMenu").classList.toggle("hide");
  });

  $("#userMenu")?.addEventListener("click", (e) => {
    if (e.target.id === "userMenu") {
      $("#userMenu").classList.add("hide");
    }
  });

  $$("#userMenuGuest .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("#userMenuGuest .tab-btn").forEach(b => b.classList.remove("active"));
      $$("#userMenuGuest .form-container").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      $(`[data-tab-content="${btn.dataset.tab}"]`).classList.add("active");
    });
  });

  listenForLiveSessions(renderLiveSessions);
  initSearchTypeSwitch();

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
  initSpotifyImportUI();
  initLiveStreamsUI();

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
    const itemEl = e.target.closest("[data-track-id]");
    if (!itemEl) return;

    const trackId = itemEl.dataset.trackId;
    let track = items.find(x => x.id === trackId) || favs.find(f => f.trackId === trackId) || queue?.find(t => t.id === trackId);
    
    if (!track && viewingPlaylistId) {
        const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
        if (pl && pl.tracks) {
            track = pl.tracks.find(t => t && t.id === trackId);
        }
    }
    if (!track) return;

    if (e.target.closest(".fav-btn")) {
        e.stopPropagation();
        if (canActivate('favorites')) {
            toggleFav(track);
        }
        return;
    }

    if (e.target.closest(".icon-btn.more")) {
        if(liveState.mode === 'listening') return;
        
        const actions = [];
        if (Session.status === "logged") {
            actions.push({ id: "pl", label: "Agregar a playlist" });
        }

        if (track.source !== 'archive') { 
            actions.push({ id: "artist_albums", label: "Ver Álbumes de este Artista" });
        }
        
        const isOwner = viewingPlaylistId && isMyPlaylist(viewingPlaylistId);
        const isFromYoutube = track.source !== 'archive';

        if (itemEl.classList.contains("queue-item") && isOwner) {
            if (isFromYoutube) {
                actions.push({ id: "rename", label: "Renombrar canción" });
                actions.push({ id: "reassign", label: "Reasignar fuente" });
            }
            actions.push({ id: "delete", label: "Eliminar de la playlist", danger: true });
        }
        
        actions.push({ id: "cancel", label: "Cancelar", ghost: true });

        openActionSheet({
            title: track.title,
            actions: actions,
            onAction: (act) => {
                if (act === "pl") openPlaylistSheet(track);
                if (act === "artist_albums") {
                    setSearchType('archive');
                    switchView('view-search');
                    $("#overlaySearchInput").value = track.author;
                    startSearch(track.author);
                }
                if (act === "rename") renameTrackInPlaylist(viewingPlaylistId, track.id);
                if (act === "delete") removeFromPlaylist(viewingPlaylistId, track.id);
                if (act === "reassign") reassignTrackSource(viewingPlaylistId, track.id);
            }
        });
    }
  });

  window.addEventListener("scroll", heroScrollInvalidate, { passive:true });
  window.addEventListener("resize", heroScrollInvalidate, { passive:true });
}

document.addEventListener('DOMContentLoaded', boot);
