import { Session, getSession, initFirebase, onAuthChange, signOutAll, signIn, signUp, getSystemPlaylists, getPublicPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addFavorite, removeFavorite, listFavorites, createLiveSession, updateLiveSession, deleteLiveSession, listenToSessionChanges, listenForLiveSessions, communityPlaylists, checkForActiveImportJob, startResolverJob, sy_fs, isMyPlaylist } from './firebase.js';
import { $, $$, fmt, cleanTitle, cleanAuthor, dotsSvg, favIconSvg, youtubeLogoSvg, spotifyLogoSvg, youtubeMusicLogoSvg, archiveLogoSvg } from './utils.js';
import { playCurrent, setQueue, updateMediaSession, updateAndroidNotification, loadYTApi, initPlayer, togglePlay, next, prev, getPlaybackState, savePlayerState, loadPlayerState, restorePlayerState, isShuffle, repeatMode, liveState, cycleRepeat, toggleShuffle, seekToFrac, currentTrack, currentQueueTitle, queueType, queue, viewingPlaylistId, handleNativeControl, stopBroadcasting, startBroadcasting, stopListening, startListening } from './reproductor.js';
import { isFav, loadFavs, renderFavs } from './favoritos.js';
import { renderPlaylists, showPlaylistInPlayer, renderQueue, hideQueuePanel, initPlaylistModals, initSpotifyImportUI, openPlaylistOptionsMenu, removeFromPlaylist, renameTrackInPlaylist, reassignTrackSource, playFromPlaylist } from './playlists.js';
import { items, startSearch, initSearch, fetchVideoDetailsByIds, playFromSearch } from './buscador.js';


var currentSearchType = 'youtube';
let activeSessions = [];
let recommendedPlaylists = {};


// --- Funciones de utilidad movidas aquí para evitar duplicación
function canActivate(feature) {
    if (getSession().status === "guest") {
        showAlert("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
        return false;
    }
    return true;
}

function showAlert(msg) {
    const alertModal = document.getElementById("alertModal");
    const alertMsg = document.getElementById("alertMsg");
    if (alertModal && alertMsg) {
        alertMsg.textContent = msg;
        alertModal.classList.add("show");
    }
}
function hideAlert() {
    const alertModal = document.getElementById("alertModal");
    if (alertModal) {
        alertModal.classList.remove("show");
    }
}


// --- Navegación y Vistas ---
function switchView(id){
  $$(".view").forEach(v => v.classList.remove("active"));
  const view = $("#" + id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  updateHomeGridVisibility();
  heroScrollInvalidate();
  if (id === 'view-playlists') renderPlaylists();
  if (id === 'view-favs') renderFavs();
  if (id === 'view-player') {
      if (queue?.length) renderQueue(queue, currentQueueTitle);
  } else {
      hideQueuePanel();
  }
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

    const savedType = localStorage.getItem('sy_search_type') || 'youtube';
    setSearchType(savedType);
}

function setSearchType(searchType) {
    if (!searchType) return;
    currentSearchType = searchType;

    const switchContainer = $("#searchTypeSwitch");
    if (switchContainer) {
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
  if (!canActivate('createPlaylist')) return;
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
    const creator = getSession().username || getSession().email.split('@')[0];
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
        if (!canActivate('cast')) return;
        if (liveState.mode === 'broadcasting') {
            stopBroadcasting();
        } else {
            startStreamSheet.classList.add("show");
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
        listenForLiveSessions(renderLiveSessions);
        $("#leaveStreamBtn").classList.toggle("hide", liveState.mode !== 'listening');
    });

    $("#closeSessions")?.addEventListener("click", () => sessionsSheet.classList.remove("show"));
    $("#leaveStreamBtn")?.addEventListener("click", () => {
        stopListening();
        sessionsSheet.classList.remove("show");
    });
}

// --- Arranque de la App ---
async function boot(){
  initTheme();
  await initFirebase();
  initUserMenu();
  initLiveStreamsUI();
  initSearchTypeSwitch();

  // Hardcoded playlists for now
  recommendedPlaylists['viejitos-pero-bonitos'] = {
      title: 'Viejitos pero bonitos',
      source: 'youtube',
      creator: 'SanaveraYou',
      isRecommended: true,
      data: [],
      ids: ["u9J62J_v_Wc", "e5u3Wz3g-yU", "qO3eT9l-mS8", "C_Cg8w-q-jM", "t-hBw2d64gM"]
  };
  recommendedPlaylists['rock-nacional'] = {
      title: 'Rock Nacional',
      source: 'youtube',
      creator: 'SanaveraYou',
      isRecommended: true,
      data: [],
      ids: ["L9qX22r0Y4c", "H8JjX0K_cSA", "k45T2I3X8aI", "F5b12D1fLgM"]
  };

  const playlistKeys = Object.keys(recommendedPlaylists);
  const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
  const results = await Promise.all(fetchPromises);
  playlistKeys.forEach((key, index) => { recommendedPlaylists[key].data = results[index] || []; });

  renderAllHomePlaylists();
  updateHomeGridVisibility();

  await loadFavs();
  renderFavs();
  initPlayer();
  loadYTApi();
  initSearch();
  initPlaylistModals();
  initSpotifyImportUI();

  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);

  heroScrollInvalidate();
  document.title = "SanaveraYou Pro";

  $("#bottomNav").addEventListener("click", e=>{
    const btn = e.target.closest(".nav-btn"); if(!btn || btn.classList.contains('active')) return;
    switchView(btn.dataset.view);
  });

  document.addEventListener("click", async (e) => {
    const itemEl = e.target.closest("[data-track-id]");
    if (!itemEl) return;

    const trackId = itemEl.dataset.trackId;
    let track = items.find(x => x.id === trackId) || favs.find(f => f.id === trackId) || queue?.find(t => t.id === trackId);
    
    if (!track && viewingPlaylistId) {
        const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
        if (pl && pl.tracks) {
            track = pl.tracks.find(t => t && t.id === trackId);
        }
    }
    if (!track) return;

    if (e.target.closest(".fav-btn")) {
        e.stopPropagation();
        toggleFav(track);
        return;
    }

    if (e.target.closest(".icon-btn.more")) {
        if(liveState.mode === 'listening') return;
        
        const actions = [{ id: "pl", label: "Agregar a playlist" }];

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

// Lógica del minimodal
function initUserMenu() {
    const userMenuBtn = $('#userMenuBtn');
    const userMenu = $('#userMenu');
    const minimodalContent = $('#minimodalContent');

    const renderMinimodal = (session) => {
        minimodalContent.innerHTML = '';
        if (session.status === 'guest') {
            minimodalContent.innerHTML = `
                <div class="user-menu-guest">
                    <div class="tabs">
                        <button class="tab-btn active" data-form="login">Iniciar sesión</button>
                        <button class="tab-btn" data-form="register">Registrarse</button>
                    </div>
                    <form id="loginForm" class="form-section active">
                        <h3>Iniciar sesión</h3>
                        <input id="loginEmail" type="email" placeholder="Email" required />
                        <input id="loginPass" type="password" placeholder="Contraseña" required />
                        <button id="loginSubmit" type="submit" class="pill">Entrar</button>
                    </form>
                    <form id="registerForm" class="form-section">
                        <h3>Registrarse</h3>
                        <input id="regEmail" type="email" placeholder="Email" required />
                        <input id="regPass" type="password" placeholder="Contraseña" required />
                        <input id="regUsername" type="text" placeholder="Nombre de usuario" required />
                        <button id="regSubmit" type="submit" class="pill">Registrarse</button>
                    </form>
                    <button id="themeToggle" class="pill pill-small theme-toggle-btn">
                      <span class="ico sun" aria-hidden="true"></span>
                      <span class="ico moon" aria-hidden="true"></span>
                      <span class="label"></span>
                    </button>
                </div>
            `;
            $('#loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = $('#loginEmail').value;
                const pass = $('#loginPass').value;
                const success = await signIn(email, pass);
                if (success) {
                    showToast('Sesión iniciada correctamente.');
                    userMenu.classList.remove('show');
                } else {
                    showAlert('Error al iniciar sesión. Verificá tus credenciales.');
                }
            });
            $('#registerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = $('#regEmail').value;
                const pass = $('#regPass').value;
                const username = $('#regUsername').value;
                const success = await signUp(email, pass, username);
                if (success) {
                    showToast('Registro exitoso. ¡Bienvenido/a!');
                    userMenu.classList.remove('show');
                } else {
                    showAlert('Error al registrar. El usuario puede ya existir.');
                }
            });
            $$('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    $$('.tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    $$('.form-section').forEach(f => f.classList.remove('active'));
                    $(`#${btn.dataset.form}Form`).classList.add('active');
                });
            });
        } else {
            minimodalContent.innerHTML = `
                <div class="user-menu-logged">
                    <p class="user-info">Conectado como:</p>
                    <p class="user-name">${session.username || session.email}</p>
                    <button id="logoutBtn" class="pill pill-small">Cerrar sesión</button>
                    <button id="themeToggle" class="pill pill-small theme-toggle-btn">
                      <span class="ico sun" aria-hidden="true"></span>
                      <span class="ico moon" aria-hidden="true"></span>
                      <span class="label"></span>
                    </button>
                </div>
            `;
            $('#logoutBtn').addEventListener('click', async () => {
                await signOutAll();
                showToast('Sesión cerrada.');
                userMenu.classList.remove('show');
            });
        }

        const themeToggleBtn = $('#themeToggle');
        if (themeToggleBtn) {
            const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            themeToggleBtn.classList.toggle('is-light', currentTheme === 'light');
            themeToggleBtn.querySelector('.label').textContent = `Tema ${currentTheme === 'dark' ? 'Oscuro' : 'Claro'}`;
            themeToggleBtn.onclick = () => {
                const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                applyTheme(newTheme);
                themeToggleBtn.classList.toggle('is-light', newTheme === 'light');
                themeToggleBtn.querySelector('.label').textContent = `Tema ${newTheme === 'dark' ? 'Oscuro' : 'Claro'}`;
            };
        }
    };

    userMenuBtn.addEventListener('click', () => {
        const isShown = userMenu.classList.toggle('show');
        if (isShown) {
            renderMinimodal(getSession());
        }
    });

    userMenu.addEventListener('click', (e) => {
        if (e.target.id === 'userMenu') {
            userMenu.classList.remove('show');
        }
    });

    onAuthChange(renderMinimodal);
}

document.addEventListener('DOMContentLoaded', boot);
