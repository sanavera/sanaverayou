// Archivo principal: inicialización, manejo de vistas, autenticación y conexión de módulos.

// --- IMPORTACIÓN DE MÓDULOS ---
// Se importa la lógica de Firebase.
import {
    initFirebase,
    currentUser,
    communityPlaylists,
    userPlaylists,
    toggleFav,
    isFav,
    isMyPlaylist,
    addSongToPlaylist,
    createNewPlaylistFromSong,
    listenForLiveSessions,
    registerUser,
    loginUser,
    logoutUser
} from './firebase.js';

// Se importa la lógica del reproductor.
import {
    initPlayer,
    loadYTApi,
    currentTrack,
    queue,
    queueType,
    isShuffle,
    repeatMode,
    liveState,
    startBroadcasting,
    stopBroadcasting,
    startListening,
    stopListening,
    setQueue,
    playCurrent,
    togglePlay,
    getPlaybackState
} from './reproductor.js';

// Se importa la lógica de las playlists.
import {
    renderPlaylists,
    initPlaylistModals,
    openPlaylistSheet,
    showPlaylistInPlayer,
    removeFromPlaylist,
    renameTrackInPlaylist,
    reassignTrackSource,
    initSpotifyImportUI
} from './playlists.js';

// Se importa la lógica del buscador.
import {
    initSearch,
    startSearch,
    setSearchType,
    items as searchItems
} from './buscador.js';

// Se importa para asegurar que el código se ejecute y se registren los listeners.
import { userFavorites } from './firebase.js';
import { playFromFav } from './favoritos.js';


// --- VARIABLES GLOBALES ---
export let activeSessions = [];
let viewingPlaylistId = null; // Se mueve aquí para ser el estado central de la UI.

// --- UTILS (Exportadas para uso global) ---
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));
export const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60),
        ss = s % 60;
    return `${m}:${String(ss).padStart(2,'0')}`;
};
export const cleanTitle = t => (t || "").replace(/\[(official\s*)?(music\s*)?video.*?\]/ig, "").replace(/\((official\s*)?(music\s*)?video.*?\)/ig, "").replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig, "").replace(/\s{2,}/g, " ").trim();
export const cleanAuthor = a => (a || "").replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "").replace(/VEVO/gi, "").replace(/\s{2,}/g, " ").replace(/\s*-\s*$/, "").trim();
export const dotsSvg = () => `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
export const favIconSvg = (isFav) => isFav ?
    `<svg viewBox="0 0 24 24" fill="var(--accent-light)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>` :
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;


// --- NAVEGACIÓN Y VISTAS ---
export function switchView(id) {
    if (id === 'view-player') {
        // No hacer nada si no hay canción
        if (!currentTrack) {
             showToast("No hay nada en reproducción.", true);
             return;
        }
    }
    
    $$(".view").forEach(v => v.classList.remove("active"));
    const view = $("#" + id);
    if (view) view.classList.add("active");
    
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
    
    updateHomeGridVisibility();
    heroScrollInvalidate();
}

// --- HOME GRID ---
export function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0)));
    publicPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    publicPlaylists.slice(0, 20).forEach(p => renderPlaylistCard(p)); // Limitar a 20 para performance
}

function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;

    let cover = playlist.cover;
    if (!cover && playlist.tracks && playlist.tracks.length > 0) {
        cover = playlist.tracks[0].thumb;
    } else if (!cover && playlist.spotifyTracks && playlist.spotifyTracks.length > 0) {
        cover = playlist.spotifyTracks[0].thumb;
    } else {
        cover = "logo78.png"; // Placeholder
    }

    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id;
    card.innerHTML = `<div class="album-cover"><img src="${cover}" alt="Portada de ${playlist.name}" loading="lazy"></div>
        <div class="playlist-meta">
            <h4 class="playlist-title">${playlist.name}</h4>
            <div class="creator-line"><span>Por: ${playlist.creator}</span></div>
        </div>`;
    card.onclick = () => showPlaylistInPlayer(playlist.id);
    container.appendChild(card);
}

export function updateHomeGridVisibility() {
    const home = $("#homeSection");
    if (!home) return;
    const searchInput = $("#overlaySearchInput").value.trim();
    const shouldShow = searchInput.length === 0 && searchItems.length === 0 && !$(".loading-indicator");
    home.classList.toggle("hide", !shouldShow);
}


// --- SHEETS, TOASTS & MENÚS ---
export function showToast(message, isError = false) {
    let toast = $('#sy-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'show';
    if (isError) toast.classList.add('error');
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

export function openActionSheet({ title = "Opciones", actions = [], onAction = () => {} }) {
    const sheet = $("#menuSheet");
    if (!sheet) return;
    sheet.innerHTML = `<div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`<button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">${a.label}</button>`).join("")}
    </div>`;
    sheet.classList.add("show");
    
    const closeSheet = (e) => {
        if (e.target.closest(".sheet-item")) {
            const btn = e.target.closest(".sheet-item");
            onAction(btn.dataset.id);
        }
        sheet.classList.remove("show");
        sheet.removeEventListener('click', closeSheet);
    };
    sheet.addEventListener('click', closeSheet);
}

// --- TEMA ---
function initTheme() {
    const THEME_KEY = "sy_theme_v1";
    const applyTheme = (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem(THEME_KEY, theme);
    };
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(saved);
    
    $("#userMenuTheme")?.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(cur === "dark" ? "light" : "dark");
        $("#userModal").classList.remove("show");
    });
}

// --- EFECTO HERO SCROLL ---
let rafPending = false, lastScrollY = 0, targetT = 0, currentT = 0;
function heroScrollTickRaf() {
    rafPending = false;
    const activeView = $(".view.active");
    if (!activeView) return;
    const y = Math.max(0, activeView.scrollTop);
    targetT = Math.min(1, y / 200);
    currentT += (targetT - currentT) * 0.25;
    if (Math.abs(targetT - currentT) < 0.001) currentT = targetT;
    const hero = activeView.querySelector(".fav-hero, .player-header-sticky");
    if (hero) hero.style.setProperty("--hero-t", currentT);
    if (Math.abs(targetT - currentT) >= 0.001) {
        requestAnimationFrame(heroScrollTickRaf);
        rafPending = true;
    }
}
export function heroScrollInvalidate() {
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(heroScrollTickRaf);
    }
}

// --- UI DE AUTENTICACIÓN Y USUARIO ---
function initAuthUI() {
    const userBtn = $('#userBtn');
    const userModal = $('#userModal');
    const authSheet = $('#authSheet');

    userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userModal.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!userBtn.contains(e.target) && !userModal.contains(e.target)) {
            userModal.classList.remove('show');
        }
    });

    $('#userMenuRegister').addEventListener('click', () => showAuthModal('register'));
    $('#userMenuLogin').addEventListener('click', () => showAuthModal('login'));
    $('#userMenuLogout').addEventListener('click', handleLogout);
    
    authSheet.addEventListener('click', e => {
        if (e.target.id === 'authSheet') authSheet.classList.remove('show');
    });
    $('#authCancel').addEventListener('click', () => authSheet.classList.remove('show'));
    $('#authSwitch').addEventListener('click', (e) => {
        e.preventDefault();
        const isLogin = authSheet.dataset.mode === 'login';
        showAuthModal(isLogin ? 'register' : 'login');
    });

    $('#authSubmit').addEventListener('click', handleAuth);
    $('#authForm').addEventListener('submit', e => e.preventDefault());
}

export function showAuthModal(mode) {
    const authSheet = $('#authSheet');
    authSheet.dataset.mode = mode;
    const isLogin = mode === 'login';

    $('#authTitle').textContent = isLogin ? 'Iniciar Sesión' : 'Registrarse';
    $('#authNameWrapper').style.display = isLogin ? 'none' : 'block';
    $('#authSubmit').textContent = isLogin ? 'Iniciar Sesión' : 'Crear Cuenta';
    $('#authSwitch').textContent = isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión';
    $('#authError').textContent = '';
    $('#authError').style.display = 'none';
    $('#authForm').reset();
    authSheet.classList.add('show');
    $('#userModal').classList.remove('show');
}

async function handleAuth() {
    const name = $('#authNameInput').value.trim();
    const email = $('#authEmail').value;
    const password = $('#authPassword').value;
    const errorEl = $('#authError');
    const mode = $('#authSheet').dataset.mode;
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    try {
        if (mode === 'register') {
            if (!name) throw new Error("Por favor, ingresa tu nombre.");
            if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
            await registerUser(name, email, password);
        } else {
            await loginUser(email, password);
        }
        $('#authSheet').classList.remove('show');
        showToast(mode === 'register' ? '¡Cuenta creada!' : '¡Bienvenido de vuelta!');
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await logoutUser();
        $('#userModal').classList.remove('show');
        showToast("Sesión cerrada.");
    } catch (error) {
        showToast("Error al cerrar sesión.", true);
    }
}

export function updateUIAfterAuthStateChange(isLoggedIn) {
    const userModal = $('#userModal');
    if (!userModal) return;

    $('#userMenuRegister').style.display = isLoggedIn ? 'none' : 'block';
    $('#userMenuLogin').style.display = isLoggedIn ? 'none' : 'block';
    $('#userMenuLogout').style.display = isLoggedIn ? 'block' : 'none';

    if (isLoggedIn && currentUser) {
        $('#userName').textContent = currentUser.displayName || currentUser.email;
        $('#userInfo').style.display = 'block';
    } else {
        $('#userInfo').style.display = 'none';
    }
    document.body.classList.toggle('logged-in', isLoggedIn);
}

// --- LÓGICA DE UI PARA TRANSMISIONES ---
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
        item.innerHTML = `<div class="session-item-meta"><span class="session-item-name">${session.name}</span><span class="session-item-genre">${session.genre}</span></div><div class="session-item-live-indicator">EN VIVO</div>`;
        item.addEventListener("click", () => {
            startListening(session.id, session.name);
            $("#sessionsSheet").classList.remove("show");
        });
        listEl.appendChild(item);
    });
}

function initLiveStreamsUI() {
    $("#broadcastBtn")?.addEventListener("click", () => {
        if (liveState.mode === 'broadcasting') {
            openActionSheet({
                title: '¿Finalizar transmisión?',
                actions: [
                    { id: 'stop', label: 'Sí, finalizar', danger: true },
                    { id: 'cancel', label: 'Cancelar', ghost: true }
                ],
                onAction: (id) => { if(id === 'stop') stopBroadcasting(); }
            });
        } else {
            if (!currentUser) {
                showToast("Debes iniciar sesión para transmitir.", true);
                showAuthModal('login');
                return;
            }
            $('#streamNameInput').value = currentUser.displayName || '';
            $("#startStreamSheet").classList.add("show");
        }
    });

    $("#startStreamCancel")?.addEventListener("click", () => $("#startStreamSheet").classList.remove("show"));
    $("#startStreamConfirm")?.addEventListener("click", async () => {
        const name = $("#streamNameInput").value.trim() || (currentUser.displayName || "Usuario");
        const genre = $("#streamGenreSelect").value;
        if (!name) {
            showToast("El nombre de la transmisión no puede estar vacío.", true);
            return;
        }
        $("#startStreamSheet").classList.remove("show");
        await startBroadcasting(name, genre);
    });

    $("#btnShowStreams")?.addEventListener("click", () => {
        if (liveState.mode === 'broadcasting') {
            showToast("No puedes ver transmisiones mientras estás transmitiendo.", true);
            return;
        }
        $("#sessionsSheet").classList.add("show");
        $("#leaveStreamBtn").classList.toggle('hide', liveState.mode !== 'listening');
        renderLiveSessions(activeSessions);
    });

    $("#closeSessions")?.addEventListener("click", () => $("#sessionsSheet").classList.remove("show"));
    $("#leaveStreamBtn")?.addEventListener("click", () => {
        stopListening();
        $("#sessionsSheet").classList.remove("show");
    });
}


// --- ARRANQUE DE LA APP ---
async function boot() {
    initTheme();
    await initFirebase();
    initAuthUI();
    listenForLiveSessions(renderLiveSessions);
    initPlayer();
    loadYTApi();
    initSearch();
    initPlaylistModals();
    initSpotifyImportUI();
    initLiveStreamsUI();
    
    document.title = "SanaveraYou Pro";

    // Event Listeners globales
    $("#bottomNav").addEventListener("click", e => {
        const btn = e.target.closest(".nav-btn");
        if (!btn || btn.classList.contains('active')) return;
        switchView(btn.dataset.view);
    });
    
    $$('.view').forEach(view => view.addEventListener("scroll", heroScrollInvalidate, { passive: true }));

    document.addEventListener("click", async (e) => {
        const itemEl = e.target.closest("[data-track-id]");
        if (!itemEl) return;

        const trackId = itemEl.dataset.trackId;
        const allTracks = [...searchItems, ...userFavorites, ...(queue || []), ...(userPlaylists.flatMap(p => p.tracks)), ...(communityPlaylists.flatMap(p => p.tracks))];
        let track = allTracks.find(t => t && t.id === trackId);
        if (!track) return;

        if (e.target.closest(".fav-btn")) {
            e.stopPropagation();
            toggleFav(track);
            return;
        }

        if (e.target.closest(".icon-btn.more")) {
            e.stopPropagation();
            if (liveState.mode === 'listening') return;

            const actions = [{ id: "pl", label: "Agregar a playlist" }];
            if (track.source !== 'archive') {
                actions.push({ id: "artist_albums", label: "Ver Álbumes de este Artista" });
            }

            const isOwner = viewingPlaylistId && isMyPlaylist(viewingPlaylistId);
            if (itemEl.classList.contains("queue-item") && isOwner) {
                if (track.source !== 'archive') {
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
}

document.addEventListener('DOMContentLoaded', boot);
