// Manejo de playlists (locales, importadas) y la cola de reproducción.
import {
    currentUser,
    communityPlaylists,
    userPlaylists,
    isMyPlaylist,
    sy_services,
    processAndSavePlaylist,
    createNewPlaylist
} from './firebase.js';

let viewingPlaylistId = null;

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = {
    value: null,
    expires: 0
};

/**
 * Resuelve una canción de Spotify a un video de YouTube.
 * @param {object} track - El objeto de la canción de Spotify.
 * @returns {Promise<object>}
 */
async function resolveTrack(track) {
    const query = `${track.author} ${track.title}`;
    try {
        const ytmUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYTM(query))}`;
        const ytmResponse = await fetch(ytmUrl, {
            cache: 'no-store',
            credentials: 'omit'
        });
        if (ytmResponse.ok) {
            const wrap = await ytmResponse.json();
            const text = wrap.contents || '';
            const ytmIds = [...new Set(text.split('\n').map(l => extractId(l.trim())).filter(Boolean))];
            if (ytmIds.length > 0) {
                return {
                    videoId: ytmIds[0],
                    backups: ytmIds.slice(1),
                    error: null
                };
            }
        }
        return {
            videoId: null,
            backups: [],
            error: "No se encontró video."
        };
    } catch (e) {
        return {
            videoId: null,
            backups: [],
            error: e.message
        };
    }
}

/**
 * Renderiza la lista de playlists del usuario en la vista "Mis Playlists".
 */
export function renderPlaylists() {
    const grid = document.getElementById("plList"),
        empty = document.getElementById("plEmpty");
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
        const cover = pl.cover || pl.tracks?.[0]?.thumb || pl.spotifyTracks?.[0]?.thumb || "https://i.imgur.com/gCa3j5g.png";

        const total = pl.trackCount || 0;
        let statusText = `${total} temas`;
        if (pl.source === 'spotify') {
            const resolved = pl.resolvedCount || 0;
            if (pl.status === 'resolving') statusText = `Importando... (${resolved}/${total})`;
            else if (pl.status === 'partial') statusText = `Parcial (${resolved}/${total})`;
        }

        const privacyToggleHTML = currentUser && isMyPlaylist(pl.id) ? `
            <div class="pl-privacy-toggle">
                <label class="switch">
                    <input type="checkbox" ${pl.isPublic ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <span>Pública</span>
            </div>` : '';

        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
                ${privacyToggleHTML}
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more")?.addEventListener("click", (e) => {
            e.stopPropagation();
            openPlaylistOptionsMenu(pl);
        });
        card.querySelector('.pl-privacy-toggle input')?.addEventListener('change', (e) => {
            e.stopPropagation();
            handlePrivacyToggle(pl.id, e.target.checked);
        });
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            await showPlaylistInPlayer(pl.id);
        });
        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && window.queueType === 'playlist');
        grid.appendChild(card);
    });
}

async function handlePrivacyToggle(playlistId, isPublic) {
    if (!currentUser || !isMyPlaylist(playlistId)) return;
    try {
        const {
            doc,
            updateDoc,
            getFirestore
        } = sy_services();
        await updateDoc(doc(getFirestore(), "playlists", playlistId), {
            isPublic
        });
        showToast(isPublic ? "Playlist ahora es pública." : "Playlist ahora es privada.");
    } catch (e) {
        console.error("Error updating privacy:", e);
    }
}

async function openPlaylistOptionsMenu(pl) {
    const isOwner = isMyPlaylist(pl.id);
    let actions = [];
    if (isOwner) {
        actions.push({
            id: "rename",
            label: "Renombrar"
        });
        actions.push({
            id: "delete",
            label: "Eliminar playlist",
            danger: true
        });
    } else if (currentUser && pl.isPublic) {
        actions.push({
            id: "save_copy",
            label: "Guardar una copia"
        });
    }
    actions.push({
        id: "cancel",
        label: "Cancelar",
        ghost: true
    });

    openActionSheet({
        title: pl.name,
        actions: actions,
        onAction: async (act) => {
            const {
                getFirestore,
                doc,
                updateDoc,
                deleteDoc,
                serverTimestamp,
                addDoc,
                collection
            } = sy_services();
            const db = getFirestore();
            if (act === "rename" && isOwner) {
                const newName = prompt("Nuevo nombre para la playlist:", pl.name);
                if (newName && newName.trim()) {
                    await updateDoc(doc(db, "playlists", pl.id), {
                        name: newName.trim(),
                        updatedAt: serverTimestamp()
                    });
                }
            }
            if (act === "delete" && isOwner) {
                openActionSheet({
                    title: `¿Eliminar "${pl.name}"?`,
                    actions: [{
                        id: "confirm_delete",
                        label: "Sí, eliminar",
                        danger: true
                    }, {
                        id: "cancel",
                        label: "Cancelar",
                        ghost: true
                    }],
                    onAction: async (confirmAct) => {
                        if (confirmAct === 'confirm_delete') await deleteDoc(doc(db, "playlists", pl.id));
                    }
                });
            }
            if (act === "save_copy" && !isOwner && currentUser) {
                const newCreator = prompt("Tu nombre de creador para esta copia:", currentUser.email.split('@')[0]);
                if (!newCreator) return;
                const newPlaylistData = { ...pl,
                    name: `${pl.name} (Copia)`,
                    creator: newCreator,
                    isPublic: false,
                    updatedAt: serverTimestamp(),
                    ownerUserId: currentUser.uid,
                    originalOwnerId: pl.ownerUserId || null
                };
                delete newPlaylistData.id;
                await addDoc(collection(db, "playlists"), newPlaylistData);
                showToast("Copia guardada en tus playlists.");
            }
        }
    });
}

function playFromPlaylist(plId, i, autoplay = false) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    viewingPlaylistId = plId;
    const tracks = (pl.tracks || []).filter(t => t && (t.id || t.urls));
    if (tracks.length === 0) {
        showToast("Esta playlist no tiene canciones para reproducir.", true);
        return;
    }
    setQueue(tracks, "playlist", i);
    playCurrent(autoplay);
    renderPlaylists();
}

window.renderQueue = function(queueItems, title) {
    const panel = document.getElementById("queuePanel");
    window.currentQueueTitle = title;
    if (!panel) return;
    panel.classList.remove("hide");
    panel.innerHTML = `<div class="section-head"><h3 id="queueTitle"></h3></div><ul id="queueList"></ul>`;
    panel.querySelector('#queueTitle').textContent = title;
    const ul = document.getElementById("queueList");
    ul.innerHTML = "";
    (queueItems || []).forEach((t, i) => {
        const li = document.createElement("li");
        li.className = "queue-item";
        li.dataset.trackId = t.id;
        const isResolved = !!(t.id || t.urls);
        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb}" alt="">
            ${isResolved ? `<button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>` : `<div class="pending-indicator">Pendiente</div>`}
          </div>
          <div class="meta">
            <div class="title-line"><span class="title-text">${t.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>
          <div class="actions">
             <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito">${favIconSvg(isFav(t.id))}</button>
             <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more,.fav-btn,.card-play") || !isResolved) return;
            playFromPlaylist(viewingPlaylistId, i, true);
        };
        li.querySelector(".card-play")?.addEventListener("click", (e) => {
            e.stopPropagation();
            playFromPlaylist(viewingPlaylistId, i, true)
        });
        ul.appendChild(li);
    });
    refreshIndicators();
}


async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    viewingPlaylistId = pl.id;
    switchView('view-player');
    const tracksToShow = (pl.source === 'spotify' && pl.spotifyTracks) ? pl.spotifyTracks.map((st, i) => (pl.tracks && pl.tracks[i]) ? pl.tracks[i] : { ...st,
        id: null,
        thumb: st.thumb || pl.cover
    }) : (pl.tracks || []);
    renderQueue(tracksToShow, pl.name);
    if (pl.source === 'spotify' && ['unresolved', 'partial'].includes(pl.status) && isMyPlaylist(pl.id)) {
        startResolverJob(plId);
    }
}

function hideQueuePanel() {
    const qp = document.getElementById("queuePanel");
    if (qp) qp.classList.add("hide");
    if (window.resolverJobUnsubscribe) {
        window.resolverJobUnsubscribe();
        window.resolverJobUnsubscribe = null;
    }
    viewingPlaylistId = null;
    renderPlaylists();
}

function initPlaylistModals() {
    document.getElementById("btnNewPlaylist")?.addEventListener("click", () => {
        if (!currentUser) {
            showToast("Inicia sesión para crear playlists.", true);
            showAuthModal('login');
            return;
        }
        document.getElementById("createPlaylistSheet").classList.add("show");
    });
    document.getElementById("createPlCancel").onclick = () => document.getElementById("createPlaylistSheet").classList.remove("show");
    document.getElementById("createPlaylistSheet").addEventListener("click", e => {
        if (e.target.id === 'createPlaylistSheet') document.getElementById("createPlaylistSheet").classList.remove("show");
    });
    document.getElementById("createPlConfirm").onclick = async () => {
        const name = document.getElementById("newPlName").value.trim();
        const creator = document.getElementById("newPlCreator").value.trim();
        if (await createNewPlaylist(name, creator)) {
            document.getElementById("newPlName").value = "";
            document.getElementById("newPlCreator").value = "";
            document.getElementById("createPlaylistSheet").classList.remove("show");
        }
    };
}

function initSpotifyImportUI() {
    document.getElementById("syBtnImportSpotify")?.addEventListener('click', () => {
        if (!currentUser) {
            showToast("Inicia sesión para importar desde Spotify.", true);
            showAuthModal('login');
            return;
        }
        document.getElementById("sySpotifyModal").classList.add('show')
    });
    document.getElementById("sySmFetch")?.addEventListener('click', handleSpotifyImport);
    document.getElementById("spotifyImportBackBtn")?.addEventListener('click', () => {
        document.getElementById("sySmInputUrl").value = "";
        switchView('view-playlists');
    });
    document.getElementById("spotifyImportConfirmBtn").onclick = async () => {
        const grid = document.getElementById("spotifyUserPlaylistsGrid");
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
    const input = document.getElementById("sySmInputUrl").value.trim();
    if (!input) return;
    const fetchBtn = document.getElementById("sySmFetch");
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Buscando...';
    try {
        const {
            type,
            id
        } = parseSpotifyLink(input);
        let playlists = [];
        if (type === 'playlist') {
            const token = await getSpotifyToken();
            const response = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
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
            document.getElementById("sySpotifyModal").classList.remove('show');
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
    const cleanedInput = input.trim().split('?')[0];
    const playlistRegex = /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
    const userRegex = /open\.spotify\.com\/user\/([a-zA-Z0-9]+)/;
    let match = cleanedInput.match(playlistRegex);
    if (match && match[1]) return {
        type: 'playlist',
        id: match[1]
    };
    match = cleanedInput.match(userRegex);
    if (match && match[1]) return {
        type: 'user',
        id: match[1]
    };
    if (!cleanedInput.includes(".") && !cleanedInput.includes("/")) return {
        type: 'user',
        id: cleanedInput
    };
    return {
        type: null,
        id: null
    };
}

async function fetchUserPlaylists(userId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allPlaylists = [];
    let url = `https://api.spotify.com/v1/users/${userId}/playlists?limit=50`;
    while (url) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('No se pudo obtener las playlists.');
            const data = await response.json();
            allPlaylists = allPlaylists.concat(data.items);
            url = data.next;
        } catch (e) {
            return [];
        }
    }
    return allPlaylists;
}

function showUserPlaylistsSelectionView(playlists) {
    const grid = document.getElementById("spotifyUserPlaylistsGrid");
    if (!grid) return;
    grid.innerHTML = "";
    playlists.forEach(pl => {
        const card = document.createElement("div");
        card.className = "spotify-pl-card";
        card.dataset.playlistId = pl.id;
        card.playlistData = pl;
        card.innerHTML = ` <img class="spotify-pl-card-thumb" src="${pl.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'}" alt="Cover de ${pl.name}"> <div class="spotify-pl-card-meta"> <div class="spotify-pl-card-title">${pl.name}</div> <div class="spotify-pl-card-count">${pl.tracks.total} canciones</div> </div> <div class="spotify-pl-card-checkbox"> <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> </div> `;
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
        if (!response.ok) throw new Error('Spotify auth failed');
        const data = await response.json();
        spotifyToken = {
            value: data.access_token,
            expires: Date.now() + (data.expires_in * 1000) - 60000
        };
        return spotifyToken.value;
    } catch (e) {
        return null;
    }
}
async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`;
    while (url) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Could not get songs');
            const data = await response.json();
            const tracks = data.items.map(({
                track
            }) => track ? {
                spotifyId: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean);
            allTracks = allTracks.concat(tracks);
            url = data.next;
        } catch (e) {
            url = null;
        }
    }
    return allTracks;
}
