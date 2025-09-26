// Manejo de playlists (locales, importadas) y la cola de reproducción.
import {
    currentUser,
    communityPlaylists,
    userPlaylists,
    isMyPlaylist,
    sy_services,
    processAndSavePlaylist,
    createNewPlaylist,
    addSongToPlaylist,
    createNewPlaylistFromSong,
    startResolverJob
} from './firebase.js';

import {
    showToast,
    openActionSheet,
    switchView,
    showAuthModal,
    $,
    $$
} from './main.js';

import {
    setQueue,
    playCurrent,
    renderQueue
} from './reproductor.js';

import { resolveTrack } from './buscador.js';

// --- Estado del Módulo ---
let trackToAdd = null; // Track que se está por agregar a una playlist
let viewingPlaylistId = null; // ID de la playlist que se está viendo en el reproductor


// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = {
    value: null,
    expires: 0
};

// =======================================================
// RENDERIZADO Y VISUALIZACIÓN
// =======================================================

/**
 * Renderiza la lista de playlists del usuario en la vista "Mis Playlists".
 */
export function renderPlaylists() {
    const grid = $("#plList"),
        empty = $("#plEmpty");
    if (!grid) return;
    grid.innerHTML = "";

    if (!userPlaylists || userPlaylists.length === 0) {
        empty?.classList.remove("hide");
        return;
    }
    empty?.classList.add("hide");

    userPlaylists.forEach(pl => {
        const card = document.createElement("article");
        card.className = "pl-item";
        card.dataset.plId = pl.id;
        const cover = pl.cover || pl.tracks?.[0]?.thumb || pl.spotifyTracks?.[0]?.thumb || "logo78.png";

        const total = pl.trackCount || 0;
        let statusText = `${total} temas`;
        if (pl.source === 'spotify') {
            const resolved = pl.resolvedCount || 0;
            if (pl.status === 'resolving') statusText = `Importando... (${resolved}/${total})`;
            else if (pl.status === 'partial' || (pl.status === 'resolved' && resolved < total)) statusText = `Parcial (${resolved}/${total})`;
        }
        
        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="Portada de ${pl.name}" onerror="this.src='logo78.png'">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more")?.addEventListener("click", (e) => {
            e.stopPropagation();
            openPlaylistOptionsMenu(pl);
        });
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more")) return;
            await showPlaylistInPlayer(pl.id);
        });
        grid.appendChild(card);
    });
}

/**
 * Muestra el contenido de una playlist en la vista del reproductor.
 * @param {string} plId - El ID de la playlist a mostrar.
 */
export async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId) || userPlaylists.find(p => p.id === plId);
    if (!pl) {
        showToast("No se pudo encontrar la playlist.", true);
        return;
    }
    viewingPlaylistId = pl.id;
    switchView('view-player');

    let tracksToShow = [];
    if (pl.source === 'spotify' && pl.spotifyTracks) {
        tracksToShow = pl.spotifyTracks.map((st, i) => (pl.tracks && pl.tracks[i]) ? pl.tracks[i] : { ...st, id: null, thumb: st.thumb || pl.cover });
    } else {
        tracksToShow = pl.tracks || [];
    }
    
    renderQueue(tracksToShow, pl.name);

    if (pl.source === 'spotify' && ['unresolved', 'partial'].includes(pl.status) && isMyPlaylist(pl.id)) {
        startResolverJob(plId);
    }
}


// =======================================================
// ACCIONES DE PLAYLIST (MENÚS, MODIFICACIONES)
// =======================================================

async function openPlaylistOptionsMenu(pl) {
    const isOwner = isMyPlaylist(pl.id);
    let actions = [];
    if (isOwner) {
        actions.push({ id: "rename", label: "Renombrar" });
        actions.push({ id: "delete", label: "Eliminar playlist", danger: true });
        actions.push({ id: "toggle_privacy", label: pl.isPublic ? "Hacer Privada" : "Hacer Pública" });
    } else if (currentUser && pl.isPublic) {
        actions.push({ id: "save_copy", label: "Guardar una copia" });
    }
    actions.push({ id: "cancel", label: "Cancelar", ghost: true });

    openActionSheet({
        title: pl.name,
        actions: actions,
        onAction: async (act) => {
            const { getFirestore, doc, updateDoc, deleteDoc, serverTimestamp, addDoc, collection } = sy_services();
            const db = getFirestore();
            if (act === "rename" && isOwner) {
                const newName = prompt("Nuevo nombre para la playlist:", pl.name);
                if (newName && newName.trim()) {
                    await updateDoc(doc(db, "playlists", pl.id), { name: newName.trim(), updatedAt: serverTimestamp() });
                }
            }
            if (act === "delete" && isOwner) {
                openActionSheet({
                    title: `¿Eliminar "${pl.name}"?`,
                    actions: [{ id: "confirm_delete", label: "Sí, eliminar", danger: true }, { id: "cancel", label: "Cancelar", ghost: true }],
                    onAction: async (confirmAct) => { if (confirmAct === 'confirm_delete') await deleteDoc(doc(db, "playlists", pl.id)); }
                });
            }
            if (act === "toggle_privacy" && isOwner) {
                 await updateDoc(doc(db, "playlists", pl.id), { isPublic: !pl.isPublic });
                 showToast(pl.isPublic ? "Playlist ahora es privada." : "Playlist ahora es pública.");
            }
            if (act === "save_copy" && !isOwner && currentUser) {
                const newCreator = currentUser.displayName || currentUser.email.split('@')[0];
                const newPlaylistData = { ...pl,
                    name: `${pl.name} (Copia)`,
                    creator: newCreator, isPublic: false,
                    updatedAt: serverTimestamp(), ownerUserId: currentUser.uid,
                    originalOwnerId: pl.ownerUserId || null
                };
                delete newPlaylistData.id;
                await addDoc(collection(db, "playlists"), newPlaylistData);
                showToast("Copia guardada en tus playlists.");
            }
        }
    });
}

/**
 * Abre el "sheet" para agregar una canción a una playlist.
 * @param {object} track - La canción a agregar.
 */
export function openPlaylistSheet(track) {
    if (!currentUser) {
        showAuthModal('login');
        showToast("Inicia sesión para usar playlists.", true);
        return;
    }
    trackToAdd = track;
    const sheet = $("#playlistSheet");
    const choices = $("#plChoices");
    choices.innerHTML = "";
    userPlaylists.forEach(p => {
        choices.innerHTML += `<button class="sheet-item" data-id="${p.id}">${p.name}</button>`;
    });
    sheet.classList.add("show");
}

async function handleAddToPlaylist(playlistId) {
    if (!trackToAdd || !playlistId) return;
    const success = await addSongToPlaylist(playlistId, trackToAdd);
    if (success) showToast(`Agregado a ${userPlaylists.find(p=>p.id===playlistId)?.name || 'playlist'}.`);
    $("#playlistSheet").classList.remove("show");
    trackToAdd = null;
}

async function handleCreateAndAdd() {
    const name = $("#plNewNameFromSong").value.trim();
    if (!name || !trackToAdd) return;
    const creator = currentUser.displayName || currentUser.email.split('@')[0];
    const newPlId = await createNewPlaylistFromSong(name, creator, trackToAdd);
    if (newPlId) {
        showToast(`Playlist "${name}" creada y canción agregada.`);
        $("#plNewNameFromSong").value = "";
        $("#playlistSheet").classList.remove("show");
        trackToAdd = null;
    }
}


// =======================================================
// ACCIONES DE CANCIONES DENTRO DE UNA PLAYLIST
// =======================================================
export async function removeFromPlaylist(playlistId, trackId) {
    if (!isMyPlaylist(playlistId)) return;
    const pl = userPlaylists.find(p => p.id === playlistId);
    if (!pl) return;

    const updatedTracks = pl.tracks.filter(t => t && t.id !== trackId);

    const { doc, updateDoc, serverTimestamp } = sy_services();
    await updateDoc(doc(sy_services().getFirestore(), "playlists", playlistId), {
        tracks: updatedTracks,
        trackCount: updatedTracks.length,
        updatedAt: serverTimestamp()
    });
    showToast("Canción eliminada de la playlist.");
    // No es necesario llamar a renderQueue aquí, el listener de Firestore lo hará.
}

export async function renameTrackInPlaylist(playlistId, trackId) {
    if (!isMyPlaylist(playlistId)) return;
    const pl = userPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    
    const trackIndex = pl.tracks.findIndex(t => t && t.id === trackId);
    if(trackIndex === -1) return;
    
    const currentTitle = pl.tracks[trackIndex].title;
    const newTitle = prompt("Nuevo nombre para la canción:", currentTitle);

    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
        const updatedTracks = [...pl.tracks];
        updatedTracks[trackIndex].title = newTitle.trim();
        const { doc, updateDoc, serverTimestamp } = sy_services();
        await updateDoc(doc(sy_services().getFirestore(), "playlists", playlistId), {
            tracks: updatedTracks,
            updatedAt: serverTimestamp()
        });
        showToast("Canción renombrada.");
    }
}

export async function reassignTrackSource(playlistId, trackId) {
    showToast("Función no implementada aún.", true);
    // Lógica futura:
    // 1. Obtener la canción actual.
    // 2. Pedir al usuario una nueva búsqueda (ej. "Artista - Título (Remix)").
    // 3. Llamar a startSearch del buscador.
    // 4. Mostrar resultados y permitir al usuario seleccionar uno.
    // 5. Actualizar el ID de la canción en la playlist en Firestore.
}

// =======================================================
// INICIALIZACIÓN DE UI
// =======================================================
export function initPlaylistModals() {
    $("#btnNewPlaylist")?.addEventListener("click", () => {
        if (!currentUser) {
            showAuthModal('login');
            showToast("Inicia sesión para crear playlists.", true);
            return;
        }
        $("#createPlaylistSheet").classList.add("show");
    });

    $("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
    $("#createPlaylistSheet").addEventListener("click", e => { if (e.target.id === 'createPlaylistSheet') $("#createPlaylistSheet").classList.remove("show"); });
    $("#createPlConfirm").onclick = async () => {
        const name = $("#newPlName").value.trim();
        const creator = currentUser.displayName || currentUser.email.split('@')[0];
        if (await createNewPlaylist(name, creator)) {
            $("#newPlName").value = "";
            $("#createPlaylistSheet").classList.remove("show");
        }
    };
    
    // Listeners para el sheet de "Agregar a playlist"
    const plSheet = $("#playlistSheet");
    plSheet?.addEventListener('click', e => {
        if (e.target === plSheet || e.target.id === 'plCancel') {
            plSheet.classList.remove("show");
            return;
        }
        const choice = e.target.closest('.sheet-item');
        if (choice) handleAddToPlaylist(choice.dataset.id);
    });
    $("#plCreateFromSong")?.addEventListener('click', handleCreateAndAdd);
}


// =======================================================
// LÓGICA DE IMPORTACIÓN DE SPOTIFY
// =======================================================
export function initSpotifyImportUI() {
    $("#syBtnImportSpotify")?.addEventListener('click', () => {
        if (!currentUser) {
            showAuthModal('login');
            showToast("Inicia sesión para importar desde Spotify.", true);
            return;
        }
        $("#sySpotifyModal").classList.add('show')
    });
    $("#sySmFetch")?.addEventListener('click', handleSpotifyImport);
    $("#spotifyImportBackBtn")?.addEventListener('click', () => {
        $("#sySmInputUrl").value = "";
        switchView('view-playlists');
    });
    $("#spotifyImportConfirmBtn").onclick = async () => {
        const grid = $("#spotifyUserPlaylistsGrid");
        const selectedPlaylists = Array.from(grid.querySelectorAll(".spotify-pl-card.selected")).map(card => card.playlistData);
        if (selectedPlaylists.length === 0) {
            showToast("Selecciona al menos una playlist.", true);
            return;
        }
        switchView('view-playlists');
        showToast(`Importando ${selectedPlaylists.length} playlist(s)...`);
        for (const pl of selectedPlaylists) {
            await fetchAndImportSinglePlaylist(pl);
        }
    };
}

async function handleSpotifyImport() {
    const input = $("#sySmInputUrl").value.trim();
    if (!input) return;
    const fetchBtn = $("#sySmFetch");
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Buscando...';
    try {
        const { type, id } = parseSpotifyLink(input);
        let playlists = [];
        if (type === 'playlist') {
            const token = await getSpotifyToken();
            const response = await fetch(`https://api.spotify.com/v1/playlists/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('No se pudo obtener la playlist.');
            playlists = [await response.json()];
        } else if (type === 'user') {
            playlists = await fetchUserPlaylists(id);
        } else {
            showToast("URL o ID de usuario no válido.", true);
            return;
        }
        if (playlists.length > 0) {
            showUserPlaylistsSelectionView(playlists);
            $("#sySpotifyModal").classList.remove('show');
        } else {
            showToast("No se encontraron playlists públicas.", true);
        }
    } catch (e) {
        showToast("Ocurrió un error. Verifica el enlace o ID.", true);
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Buscar';
    }
}

function parseSpotifyLink(input) {
    try {
      const url = new URL(input);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'playlist') return { type: 'playlist', id: pathParts[1] };
      if (pathParts[0] === 'user') return { type: 'user', id: pathParts[1] };
    } catch (e) {
      // No es una URL, puede ser un ID de usuario
      if (!input.includes(".") && !input.includes("/")) return { type: 'user', id: input };
    }
    return { type: null, id: null };
}

async function fetchUserPlaylists(userId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allPlaylists = [], url = `https://api.spotify.com/v1/users/${userId}/playlists?limit=50`;
    while (url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('No se pudo obtener las playlists.');
            const data = await response.json();
            allPlaylists = allPlaylists.concat(data.items);
            url = data.next;
        } catch (e) { return []; }
    }
    return allPlaylists;
}

function showUserPlaylistsSelectionView(playlists) {
    const grid = $("#spotifyUserPlaylistsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    playlists.forEach(pl => {
        const card = document.createElement("div");
        card.className = "spotify-pl-card";
        card.dataset.playlistId = pl.id;
        card.playlistData = pl;
        card.innerHTML = ` <img class="spotify-pl-card-thumb" src="${pl.images?.[0]?.url || 'logo78.png'}" alt="Cover de ${pl.name}"> <div class="spotify-pl-card-meta"> <div class="spotify-pl-card-title">${pl.name}</div> <div class="spotify-pl-card-count">${pl.tracks.total} canciones</div> </div> <div class="spotify-pl-card-checkbox"> <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> </div> `;
        card.addEventListener('click', () => card.classList.toggle('selected'));
        grid.appendChild(card);
    });
    switchView('view-spotify-import-selection');
}

async function fetchAndImportSinglePlaylist(plData) {
    const spotifyTracks = await fetchAllSpotifyPlaylistTracks(plData.id);
    if (spotifyTracks.length === 0) {
        showToast(`La playlist "${plData.name}" está vacía.`, true);
        return;
    }
    await processAndSavePlaylist({
        spotifyId: plData.id,
        name: plData.name,
        creator: plData.owner.display_name,
        cover: plData.images?.[0]?.url || '',
        spotifyTracks: spotifyTracks,
    });
}

async function getSpotifyToken() {
    if (spotifyToken.value && Date.now() < spotifyToken.expires) return spotifyToken.value;
    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) },
            body: 'grant_type=client_credentials'
        });
        if (!response.ok) throw new Error('Spotify auth failed');
        const data = await response.json();
        spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 };
        return spotifyToken.value;
    } catch (e) { return null; }
}

async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allTracks = [], url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`;
    while (url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Could not get songs');
            const data = await response.json();
            const tracks = data.items.map(({ track }) => track ? {
                spotifyId: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean);
            allTracks = allTracks.concat(tracks);
            url = data.next;
        } catch (e) { url = null; }
    }
    return allTracks;
}
