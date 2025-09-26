// Archivo principal: inicialización, manejo de vistas, autenticación y conexión de módulos.
import {
    initFirebase,
    auth,
    currentUser,
    communityPlaylists,
    userPlaylists,
    toggleFav,
    isFav,
    isMyPlaylist,
    addSongToPlaylist,
    createNewPlaylist,
    listenForLiveSessions
} from './firebase.js';
import {
    initSearch,
    startSearch,
    setSearchType,
    items as searchItems
} from './buscador.js';
import {
    initPlayer,
    loadYTApi,
    currentTrack,
    queue,
    queueType,
    viewingPlaylistId,
    liveState,
    startBroadcasting,
    stopBroadcasting,
    startListening,
    stopListening,
    updateUIOnTrackChange,
    refreshIndicators,
    updateControlStates,
    getPlaybackState
} from './reproductor.js';
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
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// --- Variables Globales ---
export let activeSessions = [];

// --- Utils (Definición centralizada) ---
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
export const dotsSvg = () => `<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
export const favIconSvg = (isFav) => isFav ?
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>` :
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;

// --- Navegación y Vistas ---
export function switchView(id) {
    $$(".view").forEach(v => v.classList.remove("active"));
    const view = $("#" + id);
    if (view) view.classList.add("active");
    $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
    updateHomeGridVisibility();
    heroScrollInvalidate();
}

// --- Home Grid ---
export function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0)));
    publicPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    publicPlaylists.forEach(p => renderPlaylistCard(p));
}

function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    let trackCount = playlist.trackCount || playlist.tracks?.length || 0;
    if (trackCount === 0) return;
    let covers = (playlist.tracks || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");

    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id;
    card.innerHTML = `<div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
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
    const shouldShow = (searchItems.length === 0 && !$(".loading-indicator"));
    home.classList.toggle("hide", !shouldShow);
}

// --- Sheets, Toasts & Menús ---
export function showToast(message, isError = false) {
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

export function openActionSheet({
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


// --- Tema ---
const THEME_KEY = "sy_theme_v1";

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(saved);
    $("#themeToggle")?.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(cur === "dark" ? "light" : "dark");
    });
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
    const hero = activeView.querySelector(".hero, .fav-hero, .player-header-sticky");
    if (hero) hero.style.setProperty("--hero-t", currentT);
    if (Math.abs(targetT - currentT) >= 0.001) {
        requestAnimationFrame(heroScrollTickRaf);
        rafPending = true;
    }
}

export function heroScrollInvalidate() {
    lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(heroScrollTickRaf);
    }
}

// --- UI de Autenticación y Usuario ---
function initAuthUI() {
    const userBtn = $('#userBtn');
    const userModal = $('#userModal');
    const authSheet = $('#authSheet');

    userBtn.addEventListener('click', () => {
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
    $('#userMenuTheme').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(cur === "dark" ? "light" : "dark");
    });

    $('#authSheet').addEventListener('click', e => {
        if (e.target.id === 'authSheet') authSheet.classList.remove('show');
    });
    $('#authClose').addEventListener('click', () => authSheet.classList.remove('show'));
    $('#authSwitch').addEventListener('click', () => {
        const isLogin = authSheet.dataset.mode === 'login';
        showAuthModal(isLogin ? 'register' : 'login');
    });

    $('#authForm').addEventListener('submit', handleAuth);
}

function showAuthModal(mode) { // mode: 'login' o 'register'
    const authSheet = $('#authSheet');
    authSheet.dataset.mode = mode;
    const isLogin = mode === 'login';

    $('#authTitle').textContent = isLogin ? 'Iniciar Sesión' : 'Registrarse';
    $('#authName').style.display = isLogin ? 'none' : 'block';
    $('#authSubmit').textContent = isLogin ? 'Iniciar Sesión' : 'Crear Cuenta';
    $('#authSwitch').textContent = isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión';
    $('#authError').textContent = '';
    $('#authForm').reset();
    authSheet.classList.add('show');
    $('#userModal').classList.remove('show');
}

async function handleAuth(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.authNameInput.value.trim();
    const email = form.authEmail.value;
    const password = form.authPassword.value;
    const errorEl = $('#authError');
    const mode = $('#authSheet').dataset.mode;
    errorEl.textContent = '';

    try {
        if (mode === 'register') {
            if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: name
            });
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        $('#authSheet').classList.remove('show');
    } catch (error) {
        errorEl.textContent = error.message.includes('auth/invalid-email') ? "Email inválido." : "Error. Verifica tus datos.";
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        $('#userModal').classList.remove('show');
    } catch (error) {
        showToast("Error al cerrar sesión.", true);
    }
}

export function updateUIAfterAuthStateChange(user) {
    const userModal = $('#userModal');
    if (!userModal) return;

    $('#userMenuRegister').style.display = user ? 'none' : 'block';
    $('#userMenuLogin').style.display = user ? 'none' : 'block';
    $('#userMenuLogout').style.display = user ? 'block' : 'none';

    if (user) {
        $('#userName').textContent = user.displayName || user.email;
        $('#userInfo').style.display = 'flex';
    } else {
        $('#userInfo').style.display = 'none';
    }
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
            stopBroadcasting();
        } else {
            if (!currentUser) {
                showToast("Debes iniciar sesión para transmitir.", true);
                showAuthModal('login');
                return;
            }
            $("#startStreamSheet").classList.add("show");
        }
    });

    $("#startStreamCancel")?.addEventListener("click", () => $("#startStreamSheet").classList.remove("show"));
    $("#startStreamConfirm")?.addEventListener("click", async () => {
        const name = $("#streamNameInput").value.trim() || (currentUser.displayName || "Usuario");
        const genre = $("#streamGenreSelect").value;
        $("#startStreamSheet").classList.remove("show");
        await startBroadcasting(name, genre);
    });

    $("#btnShowStreams")?.addEventListener("click", () => {
        if (liveState.mode === 'broadcasting') {
            showToast("No puedes ver transmisiones mientras estás transmitiendo.");
            return;
        }
        $("#sessionsSheet").classList.add("show");
        renderLiveSessions(activeSessions);
    });

    $("#closeSessions")?.addEventListener("click", () => $("#sessionsSheet").classList.remove("show"));
    $("#leaveStreamBtn")?.addEventListener("click", () => {
        stopListening();
        $("#sessionsSheet").classList.remove("show");
    });
}


// --- Arranque de la App ---
async function boot() {
    initTheme();
    initFirebase();
    initAuthUI();
    listenForLiveSessions(renderLiveSessions);
    initPlayer();
    loadYTApi();
    initSearch();
    initPlaylistModals();
    initSpotifyImportUI();
    initLiveStreamsUI();
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
        const allTracks = [...searchItems, ...userFavorites, ...(queue || []), ...(userPlaylists.flatMap(p => p.tracks)), ...(communityPlaylists.flatMap(p => p.tracks))];
        let track = allTracks.find(t => t && t.id === trackId);
        if (!track) return;

        if (e.target.closest(".fav-btn")) {
            e.stopPropagation();
            toggleFav(track);
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
                if (track.source !== 'archive') {
                    actions.push({
                        id: "rename",
                        label: "Renombrar canción"
                    });
                    actions.push({
                        id: "reassign",
                        label: "Reasignar fuente"
                    });
                }
                actions.push({
                    id: "delete",
                    label: "Eliminar de la playlist",
                    danger: true
                });
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
                    if (act === "rename") renameTrackInPlaylist(viewingPlaylistId, track.id);
                    if (act === "delete") removeFromPlaylist(viewingPlaylistId, track.id);
                    if (act === "reassign") reassignTrackSource(viewingPlaylistId, track.id);
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
