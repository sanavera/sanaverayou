// Archivo principal: inicialización, manejo de vistas, UI de autenticación y conexión de módulos.
import {
    initFirebase,
    currentUser,
    isFav,
    toggleFav,
    createNewPlaylist,
    addSongToPlaylist,
    isMyPlaylist,
    processAndSavePlaylist,
    communityPlaylists,
    sy_services
} from './firebase.js';

var currentSearchType = 'youtube'; // 'youtube' o 'archive'
let activeSessions = [];

// --- Listas de reproducción recomendadas (datos estáticos) ---
const recommendedPlaylists = {};

// --- Utils ---
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60),
        ss = s % 60;
    return `${m}:${String(ss).padStart(2,'0')}`;
};
const cleanTitle = t => (t || "").replace(/\[(official\s*)?(music\s*)?video.*?\]/ig, "").replace(/\((official\s*)?(music\s*)?video.*?\)/ig, "").replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig, "").replace(/\s{2,}/g, " ").trim();
const cleanAuthor = a => (a || "").replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "").replace(/VEVO/gi, "").replace(/\s{2,}/g, " ").replace(/\s*-\s*$/, "").trim();
const dotsSvg = () => `<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const favIconSvg = (isFav) => isFav ?
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>` :
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;
const youtubeLogoSvg = () => `<span class="source-logo youtube-logo" title="YouTube"><svg viewBox="0 0 28 20"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"/></svg></span>`;
const spotifyLogoSvg = () => `<span class="source-logo spotify-logo" title="Spotify"><svg viewBox="0 0 167.5 167.5"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"/></svg></span>`;
const archiveLogoSvg = () => `<span class="source-logo archive-logo" title="Archive.org"><svg viewBox="0 0 14 20"><path fill="currentColor" d="M7,0.21L0,4.91V6.28H14V4.91L7,0.21M1,7.22V18.59L7,15.25L13,18.59V7.22H1Z" /></svg></span>`;


// --- Navegación y Vistas ---
function switchView(id) {
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

    const savedType = localStorage.getItem('sy_search_type') || 'youtube';
    setSearchType(savedType);
}

function setSearchType(searchType) {
    if (!searchType) return;
    currentSearchType = searchType;

    $("#searchTypeSwitch .switch-btn").forEach(btn => btn.classList.remove('active'));
    $(`#searchTypeSwitch .switch-btn[data-type="${searchType}"]`)?.classList.add('active');

    const placeholder = searchType === 'youtube' ? 'Buscar canciones...' : 'Buscar álbumes...';
    $("#overlaySearchInput").placeholder = placeholder;
    localStorage.setItem('sy_search_type', searchType);
}

// =======================================================
// LÓGICA DE AUTENTICACIÓN Y UI DE USUARIO
// =======================================================
let authAction = 'login'; // 'login' o 'register'

function initAuthUI() {
    const userBtn = $("#userBtn");
    const userModal = $("#userModal");

    userBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        userModal.classList.toggle("show");
    });

    document.addEventListener("click", () => {
        userModal.classList.remove("show");
    });

    userModal.addEventListener("click", (e) => e.stopPropagation());

    userModal.querySelectorAll("[data-action]").forEach(el => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            const action = e.currentTarget.dataset.action;
            userModal.classList.remove("show");

            if (action === 'login' || action === 'register') {
                showAuthModal(action);
            } else if (action === 'logout') {
                handleLogout();
            } else if (action === 'theme') {
                const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
                applyTheme(currentTheme === "dark" ? "light" : "dark");
            }
        });
    });

    $("#authCancel").addEventListener("click", () => $("#authSheet").classList.remove("show"));
    $("#authSheet").addEventListener("click", e => { if (e.target.id === 'authSheet') $("#authSheet").classList.remove("show"); });
    $("#authForm").addEventListener("submit", (e) => {
        e.preventDefault();
        handleAuth();
    });
    $("#authConfirm").addEventListener("click", handleAuth);
    
    $("#authToggle a").addEventListener("click", (e) => {
        e.preventDefault();
        showAuthModal(e.currentTarget.dataset.action);
    });
}


function showAuthModal(action) {
    authAction = action;
    const sheet = $("#authSheet");
    const title = $("#authTitle");
    const confirmBtn = $("#authConfirm");
    const toggleLink = $("#authToggle a");
    const toggleText = $("#authToggle");
    const errorBox = $("#authError");

    errorBox.style.display = 'none';
    errorBox.textContent = '';
    
    if (action === 'register') {
        title.textContent = 'Registrarse';
        confirmBtn.textContent = 'Crear Cuenta';
        toggleText.childNodes[0].nodeValue = '¿Ya tienes cuenta? ';
        toggleLink.textContent = 'Inicia sesión';
        toggleLink.dataset.action = 'login';
    } else {
        title.textContent = 'Iniciar Sesión';
        confirmBtn.textContent = 'Confirmar';
        toggleText.childNodes[0].nodeValue = '¿No tienes cuenta? ';
        toggleLink.textContent = 'Regístrate';
        toggleLink.dataset.action = 'register';
    }
    
    sheet.classList.add("show");
}

async function handleAuth() {
    const {
        getAuth,
        createUserWithEmailAndPassword,
        signInWithEmailAndPassword
    } = sy_services();
    const auth = getAuth();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value.trim();
    const errorBox = $("#authError");

    if (!email || !password) {
        errorBox.textContent = 'Por favor, completa ambos campos.';
        errorBox.style.display = 'block';
        return;
    }
    
    errorBox.style.display = 'none';

    try {
        if (authAction === 'register') {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        $("#authSheet").classList.remove("show");
        $("#authForm").reset();
    } catch (error) {
        console.error(`Error de autenticación (${authAction}):`, error);
        errorBox.textContent = getFirebaseErrorMessage(error);
        errorBox.style.display = 'block';
    }
}

async function handleLogout() {
    const { getAuth, signOut } = sy_services();
    try {
        await signOut(getAuth());
        showToast("Sesión cerrada con éxito.");
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
        showToast("No se pudo cerrar la sesión.", true);
    }
}

window.updateUIAfterAuthStateChange = function(isLoggedIn) {
    const loginItem = $("[data-action='login']");
    const registerItem = $("[data-action='register']");
    const logoutItem = $("[data-action='logout']");
    const importSpotifyBtn = $("#syBtnImportSpotify");

    if (isLoggedIn) {
        loginItem.style.display = 'none';
        registerItem.style.display = 'none';
        logoutItem.style.display = 'block';
        importSpotifyBtn.style.display = 'inline-block';
        showToast(`Bienvenido/a ${currentUser.email}`);
    } else {
        loginItem.style.display = 'block';
        registerItem.style.display = 'block';
        logoutItem.style.display = 'none';
        importSpotifyBtn.style.display = 'none';
    }
}

function getFirebaseErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email':
            return 'El formato del correo electrónico no es válido.';
        case 'auth/user-not-found':
            return 'No se encontró ningún usuario con este correo.';
        case 'auth/wrong-password':
            return 'La contraseña es incorrecta.';
        case 'auth/email-already-in-use':
            return 'Este correo electrónico ya está registrado.';
        case 'auth/weak-password':
            return 'La contraseña debe tener al menos 6 caracteres.';
        default:
            return 'Ocurrió un error. Por favor, intenta de nuevo.';
    }
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
    $("#broadcastBtn").title = liveState.mode === 'broadcasting' ? "Finalizar transmisión" : "Iniciar transmisión";
}

function updateHero(track) {
    const t = track || currentTrack;
    $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
    $("#favNowTitle").textContent = t ? t.title : "—";
    $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";

    $("#btnSaveAlbum").classList.toggle('hide', queueType !== 'archive_album');

    $("#npTitle").textContent = t ? t.title : "Elegí una canción";

    let plName = "";
    if (queueType === 'playlist' && viewingPlaylistId) {
        const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
        plName = pl ? pl.name : "";
    } else if (['recommended', 'archive_album'].includes(queueType)) {
        plName = currentQueueTitle;
    }

    let subText = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—");
    if (liveState.mode === 'listening' && liveState.sessionData) {
        subText = `Escuchando a: ${liveState.sessionData.name}`;
    } else if (liveState.mode === 'broadcasting') {
        subText = `Transmitiendo en vivo`;
    }
    $("#npSub").textContent = subText;
}


function updateMiniNow() {
    const hasTrack = !!currentTrack;
    $("#seekDock").classList.toggle("show", hasTrack);
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

window.refreshIndicators = function() {
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
        repeatBtn.innerHTML = (repeatMode === 'one' && !isListening) ?
            `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>` :
            `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    }
}

// --- Home Grid ---
window.renderAllHomePlaylists = function() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";

    const publicPlaylists = communityPlaylists.filter(p => p.isPublic && (p.trackCount || 0) > 0);
    const recommended = Object.values(recommendedPlaylists).filter(p => p.data.length > 0);
    const allPlaylists = [...recommended, ...publicPlaylists];

    allPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    allPlaylists.forEach(p => renderPlaylistCard(p));
}


function renderPlaylistCard(playlist) {
    let trackCount = playlist.trackCount || playlist.tracks?.length || playlist.data?.length || 0;
    if (trackCount === 0) return;

    let covers = (playlist.tracks || playlist.data || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");

    let logo = playlist.source === 'spotify' ? spotifyLogoSvg() : (playlist.source === 'archive' ? archiveLogoSvg() : youtubeLogoSvg());

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
    $("#allPlaylistsContainer").appendChild(card);
}


function updateHomeGridVisibility() {
    const home = $("#homeSection");
    if (!home) return;
    const shouldShow = (items.length === 0 && !$(".loading-indicator"));
    home.classList.toggle("hide", !shouldShow);
}

// --- Sheets, Toasts & Menús ---
window.showToast = function(message, isError = false) {
    let toast = document.getElementById('sy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'show';
    if (isError) toast.classList.add('error');
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

function openActionSheet({
    title = "Opciones",
    actions = [],
    onAction = () => {}
}) {
    const sheet = $("#menuSheet");
    if (!sheet) return;
    sheet.innerHTML = `<div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`<button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">${a.label}</button>`).join("")}
    </div>`;
    sheet.classList.add("show");
    sheet.onclick = (e) => {
        if (e.target === sheet) {
            sheet.classList.remove("show");
            return;
        }
        const btn = e.target.closest(".sheet-item");
        if (!btn) return;
        sheet.classList.remove("show");
        onAction(btn.dataset.id);
    };
}

async function openPlaylistSheet(track) {
    if (!currentUser) {
        showToast("Inicia sesión para agregar canciones a tus playlists.", true);
        showAuthModal('login');
        return;
    }
    
    const sheet = $("#playlistSheet");
    sheet.classList.add("show");
    const list = $("#plChoices");
    list.innerHTML = "";
    
    // Usamos las playlists del usuario cargadas en firebase.js
    const { userPlaylists } = await import('./firebase.js');

    userPlaylists.forEach(pl => {
        const btn = document.createElement("button");
        btn.className = "sheet-item";
        btn.textContent = pl.name;
        btn.onclick = async () => {
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
        // Importamos la función de firebase.js
        const { createNewPlaylistFromSong } = await import('./firebase.js');
        if (await createNewPlaylistFromSong(name, creator, track)) {
            $("#plNewNameFromSong").value = "";
            sheet.classList.remove("show");
            showToast(`Agregado a la nueva playlist "${name}"`);
        }
    };
    $("#plCancel").onclick = () => sheet.classList.remove("show");
    sheet.addEventListener("click", e => { if (e.target.id === "playlistSheet") sheet.classList.remove("show"); }, { once: true });
}

// --- Tema ---
const THEME_KEY = "sy_theme_v1";
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim());
    document.documentElement.style.colorScheme = theme;
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(saved);
}


// --- Efecto Hero Scroll ---
let rafPending = false,
    lastScrollY = 0,
    targetT = 0,
    currentT = 0;

function heroScrollTickRaf() {
    rafPending = false;
    const activeView = $(".view.active");
    if (!activeView) return;
    const viewTop = activeView.getBoundingClientRect().top + window.scrollY;
    const y = Math.max(0, lastScrollY - viewTop);
    targetT = Math.min(1, y / 200);
    currentT += (targetT - currentT) * 0.25;
    if (Math.abs(targetT - currentT) < 0.001) currentT = targetT;
    const hero = activeView.querySelector("#favHero, .fav-hero, #npHero, .np-hero, .player-header-sticky");
    if (hero) hero.style.setProperty("--hero-t", currentT);
    if (Math.abs(targetT - currentT) >= 0.001) {
        requestAnimationFrame(heroScrollTickRaf);
        rafPending = true;
    }
}

function heroScrollInvalidate() {
    lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(heroScrollTickRaf);
    }
}

// --- Lógica de UI para Transmisiones ---
// (Esta lógica se mantiene, pero las funciones de backend vienen de firebase.js)

// --- Arranque de la App ---
async function boot() {
    initTheme();
    await initFirebase(); // Inicia Firebase y el listener de auth
    initAuthUI(); // Inicializa la UI del menú de usuario

    initSearchTypeSwitch();

    // El resto de la inicialización
    const playlistKeys = Object.keys(recommendedPlaylists);
    const fetchPromises = playlistKeys.map(key => fetchVideoDetailsByIds(recommendedPlaylists[key].ids));
    const results = await Promise.all(fetchPromises);
    playlistKeys.forEach((key, index) => {
        recommendedPlaylists[key].data = results[index] || [];
    });

    updateHomeGridVisibility();

    initPlayer();
    loadYTApi();
    initSearch();
    initPlaylistModals();
    initSpotifyImportUI();
    // initLiveStreamsUI();

    const savedState = loadPlayerState();
    if (savedState) restorePlayerState(savedState);

    heroScrollInvalidate();
    document.title = "SanaveraYou Pro";

    // Event Listeners globales
    $("#bottomNav").addEventListener("click", e => {
        const btn = e.target.closest(".nav-btn");
        if (!btn || btn.classList.contains('active')) return;
        switchView(btn.dataset.view);
    });

    document.addEventListener("click", async (e) => {
        const itemEl = e.target.closest("[data-track-id]");
        if (!itemEl) return;

        const trackId = itemEl.dataset.trackId;
        let track = items.find(x => x.id === trackId) || userFavorites.find(f => f.id === trackId) || queue?.find(t => t.id === trackId);

        if (!track && viewingPlaylistId) {
            const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
            if (pl && pl.tracks) {
                track = pl.tracks.find(t => t && t.id === trackId);
            }
        }
        if (!track) return;

        if (e.target.closest(".fav-btn")) {
            e.stopPropagation();
            toggleFav(track); // Usa la función de firebase.js
            return;
        }

        if (e.target.closest(".icon-btn.more")) {
            if (liveState.mode === 'listening') return;

            const actions = [{
                id: "pl",
                label: "Agregar a playlist"
            }];

            if (track.source !== 'archive') {
                actions.push({
                    id: "artist_albums",
                    label: "Ver Álbumes de este Artista"
                });
            }

            const isOwner = viewingPlaylistId && isMyPlaylist(viewingPlaylistId);
            if (itemEl.classList.contains("queue-item") && isOwner) {
                // ... (acciones de renombrar, reasignar, etc.)
            }

            actions.push({
                id: "cancel",
                label: "Cancelar",
                ghost: true
            });

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
                }
            });
        }
    });

    window.addEventListener("scroll", heroScrollInvalidate, {
        passive: true
    });
    window.addEventListener("resize", heroScrollInvalidate, {
        passive: true
    });
}

document.addEventListener('DOMContentLoaded', boot);
