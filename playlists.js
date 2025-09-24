import { isFav } from './favoritos.js';
import { showToast, openActionSheet, switchView, setQueue, playCurrent, refreshIndicators, currentQueueTitle, queue, queueType, updateHero, canActivate, viewingPlaylistId, addMyPlaylistId, removeMyPlaylistId, isMyPlaylist } from './main.js';
import { $, $$, dotsSvg, favIconSvg, archiveLogoSvg, spotifyLogoSvg, cleanAuthor, getSession } from './utils.js';
import { scrapeYoutubeWithCustomServer } from './buscador.js';
import { communityPlaylists, startResolverJob } from './firebase.js';

// Manejo de playlists locales e importadas (Spotify/Archive), y la cola de reproducción.

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };


/**
 * Maneja la actualización en tiempo real de la playlist que se está viendo.
 * Se llama cuando Firestore detecta un cambio (ej: se encontró una nueva canción).
 * @param {object} newPlaylist - El objeto de la playlist actualizado desde Firestore.
 * @param {string} viewingPlaylistId - ID de la playlist que se está viendo.
 * @param {string} queueType - Tipo de la cola actual.
 * @param {Array} queue - La cola de reproducción actual.
 */
function handleRealtimeUpdate(newPlaylist, viewingPlaylistId, queueType, queue) {
    if (!newPlaylist || !window.renderQueue) return;

    // Reconstruye la lista visual combinando los tracks originales de Spotify
    // con los que ya se encontraron, para mostrar el estado actual completo.
    const tracksToShow = newPlaylist.spotifyTracks 
        ? newPlaylist.spotifyTracks.map((spotifyTrack, index) => 
            (newPlaylist.tracks && newPlaylist.tracks[index]) 
                ? newPlaylist.tracks[index] 
                : { ...spotifyTrack, id: null, thumb: spotifyTrack.thumb || newPlaylist.cover }
          )
        : (newPlaylist.tracks || []);

    // Actualiza la cola de reproducción real (solo con canciones encontradas)
    queue = tracksToShow.filter(t => t && t.id);

    // Vuelve a renderizar la lista de canciones en la interfaz del reproductor.
    window.renderQueue(tracksToShow, newPlaylist.name);
}

/**
 * --- LÓGICA DE RESOLUCIÓN MEJORADA ---
 * Resuelve una canción de Spotify a un video, usando exclusivamente YouTube Music
 * para obtener resultados de alta calidad.
 * @param {object} track - El objeto de la canción de Spotify ({ title, author }).
 * @returns {Promise<{videoId: string|null, backups: string[], error: string|null}>}
 */
async function resolveTrack(track) {
    const query = `${track.author} ${track.title}`;
    const ALLOW_YT_FALLBACK = false; // Desactivado por defecto como se solicitó.

    try {
        // 1. Intenta resolver usando YouTube Music
        const ytmUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYTM(query))}`;
        const ytmResponse = await fetch(ytmUrl, { cache: 'no-store', credentials: 'omit' });

        if (ytmResponse.ok) {
            let text = '';
            const contentType = ytmResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const wrap = await ytmResponse.json();
                text = wrap.contents || '';
            } else {
                text = await ytmResponse.text();
            }

            const ytmIds = [...new Set(text.split('\n').map(l => extractId(l.trim())).filter(Boolean))];

            if (ytmIds.length > 0) {
                const videoId = ytmIds[0];
                const backups = ytmIds.slice(1);
                return { videoId, backups, error: null };
            }
        }

        // 2. (Opcional) Fallback a YouTube estándar.
        if (ALLOW_YT_FALLBACK) {
            const ytUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYT(query))}`;
            const ytResponse = await fetch(ytUrl, { cache: 'no-store', credentials: 'omit' });

            if (ytResponse.ok) {
                let text = '';
                const contentType = ytResponse.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const wrap = await ytResponse.json();
                    text = wrap.contents || '';
                } else {
                    text = await ytResponse.text();
                }
                const ytIds = [...new Set(text.split('\n').map(l => extractId(l.trim())).filter(Boolean))];

                if (ytIds.length > 0) {
                    const videoId = ytIds[0];
                    const backups = ytIds.slice(1);
                    return { videoId, backups, error: null };
                }
            }
        }

        return { videoId: null, backups: [], error: "No se encontró video en las fuentes disponibles." };

    } catch (e) {
        console.error(`Error resolviendo la canción "${query}":`, e);
        return { videoId: null, backups: [], error: e.message };
    }
}


/**
 * Guarda el álbum de Archive.org que se está reproduciendo como una nueva playlist del usuario.
 */
async function saveCurrentArchiveAlbumAsPlaylist() {
    if (!canActivate('createPlaylist')) return;

    if (queueType !== 'archive_album' || !queue || queue.length === 0) {
        showToast("No hay un álbum de Archive.org para guardar.", true);
        return;
    }

    let creator = window.Session.username;

    const albumData = {
        title: currentQueueTitle,
        description: "",
        public: false,
        tracks: queue,
        trackCount: queue.length,
        source: 'archive',
    };

    try {
        showToast(`Guardando "${albumData.title}"...`);
        const result = await window.firebase.createPlaylist(albumData);
        if (result.success) {
            addMyPlaylistId(result.id);
            showToast("Álbum guardado en 'Mis Playlists'.");
            const btnSave = $("#btnSaveAlbum");
            if(btnSave) btnSave.classList.add('hide');
        } else {
            showToast(result.error, true);
        }

    } catch (e) {
        console.error("Error al guardar el álbum de Archive.org:", e);
        showToast("No se pudo guardar el álbum.", true);
    }
}

/**
 * Renderiza la lista de playlists del usuario en la vista "Mis Playlists".
 */
function renderPlaylists() {
    const grid = $("#plList"), empty = $("#plEmpty");
    if (!grid) return;
    grid.innerHTML = "";

    const myPlaylists = communityPlaylists.filter(p => p.owner === window.getSession().uid);

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
        let statusText = `${total} temas`;
        if (pl.source === 'spotify') {
            const resolved = pl.resolvedCount || 0;
            if (pl.status === 'resolving') statusText = `Importando... (${resolved}/${total})`;
            else if (pl.status === 'partial') statusText = `Parcial (${resolved}/${total})`;
            else if (pl.status !== 'resolved') statusText = `Pendiente (${resolved}/${total})`;
        }

        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.title}</div>
                    <div class="pl-creator">por ${pl.owner === window.getSession().uid ? window.getSession().username : 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${pl.public ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
        card.querySelector('.pl-privacy-toggle input').addEventListener('change', async (e) => {
            e.stopPropagation();
            const result = await window.firebase.updatePlaylist(pl.id, { public: e.target.checked });
            if (!result) {
                showToast("Error al cambiar la privacidad.", true);
                // Revertir el estado del checkbox si la operación falla
                e.target.checked = !e.target.checked;
            }
        });
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            await showPlaylistInPlayer(pl.id);
        });

        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

async function openPlaylistOptionsMenu(pl) {
  const isOwner = pl.owner === window.getSession().uid;
  let actions = [];
  if (isOwner) {
      actions.push({ id: "rename", label: "Renombrar" });
      actions.push({ id: "delete", label: "Eliminar playlist", danger: true });
  }
  if (!isOwner && pl.public) {
      actions.push({ id: "save_copy", label: "Guardar una copia" });
  }
  actions.push({ id: "cancel", label: "Cancelar", ghost: true });

  openActionSheet({
    title: pl.title,
    actions: actions,
    onAction: async (act) => {
      if (act === "rename" && isOwner) {
        const newTitle = prompt("Nuevo nombre para la playlist:", pl.title);
        if (newTitle && newTitle.trim() !== "") {
            const result = await window.firebase.updatePlaylist(pl.id, { title: newTitle.trim() });
            if (!result) showToast("Error al renombrar.", true);
        }
      }
      if (act === "delete" && isOwner) {
        openActionSheet({
            title: `¿Eliminar "${pl.title}"?`,
            actions: [{id: "confirm_delete", label: "Sí, eliminar", danger: true}, {id: "cancel", label: "Cancelar", ghost: true}],
            onAction: async (confirmAct) => {
                if(confirmAct === 'confirm_delete') {
                    const result = await window.firebase.deletePlaylist(pl.id);
                    if (!result) showToast("Error al eliminar.", true);
                }
            }
        });
      }
      if (act === "save_copy" && !isOwner) { savePlaylistCopy(pl); }
    }
  });
}

async function removeFromPlaylist(plId, trackId) {
    if (!canActivate('editPlaylist')) return;
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    const updatedTracks = (pl.tracks || []).filter(t => t && t.id !== trackId);
    try {
        const result = await window.firebase.updatePlaylist(plId, { tracks: updatedTracks, trackCount: updatedTracks.length, resolvedCount: updatedTracks.filter(Boolean).length });
        if (result) {
            showToast('Canción eliminada.');
        } else {
            showToast("Error al eliminar la canción.", true);
        }
    } catch (e) { console.error('Error removing song:', e); showToast('No se pudo quitar la canción.', true); }
}

async function renameTrackInPlaylist(playlistId, trackId) {
    if (!canActivate('editPlaylist')) return;
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks) return;
    const trackIndex = pl.tracks.findIndex(t => t && t.id === trackId);
    if (trackIndex === -1) return;
    const track = pl.tracks[trackIndex];
    if (track.source === 'archive') {
        showToast("Las canciones de álbumes de Archive.org no se pueden renombrar.", true);
        return;
    }
    const newTitle = prompt("Nuevo nombre para la canción:", track.title);
    if (!newTitle || newTitle.trim() === "") return;
    const newAuthor = prompt("Nuevo autor para la canción:", track.author);
    if (!newAuthor || newAuthor.trim() === "") return;
    const updatedTrack = { ...track, title: newTitle.trim(), author: newAuthor.trim() };
    const updatedTracks = [...pl.tracks];
    updatedTracks[trackIndex] = updatedTrack;
    try {
        const result = await window.firebase.updatePlaylist(playlistId, { tracks: updatedTracks });
        if (result) {
            if (queueType === 'playlist' && viewingPlaylistId === playlistId) {
                const queueIndex = queue.findIndex(t => t.id === trackId);
                if (queueIndex !== -1) {
                    queue[queueIndex] = updatedTrack;
                    renderQueue(queue, currentQueueTitle);
                    if (currentTrack && currentTrack.id === trackId) {
                        currentTrack = updatedTrack;
                        playCurrent(true);
                    }
                }
            }
            showToast("Canción renombrada.");
        } else {
            showToast("Error al renombrar la canción.", true);
        }
    } catch (e) { console.error('Error renaming track:', e); showToast('No se pudo renombrar la canción.', true); }
}

async function reassignTrackSource(playlistId, oldTrackId) {
    if (!canActivate('editPlaylist')) return;
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks) return;
    const trackIndex = pl.tracks.findIndex(t => t && t.id === oldTrackId);
    if (trackIndex === -1) return;
    const track = pl.tracks[trackIndex];
    if (track.source === 'archive') {
        showToast("No se puede reasignar la fuente para canciones de Archive.org.", true);
        return;
    }
    const backups = track.backupUrls || [];
    const currentReassignIndex = track.reassignIndex || 0;
    let newVideoId = null;
    if (currentReassignIndex < backups.length) {
        newVideoId = backups[currentReassignIndex];
        showToast("Reasignando a fuente de respaldo...");
    } else {
        showToast("Buscando nueva fuente online...");
        const newResults = await scrapeYoutubeWithCustomServer(`${track.author} ${track.title}`, backups.length + 2);
        if (newResults.length > backups.length + 1) {
            newVideoId = newResults[backups.length + 1].id;
        } else {
            showToast("No se encontraron más versiones.", true);
            const updatedTrack = { ...track, reassignIndex: 0 };
            const updatedTracks = [...pl.tracks];
            updatedTracks[trackIndex] = updatedTrack;
            const result = await window.firebase.updatePlaylist(playlistId, { tracks: updatedTracks });
            if (!result) showToast("Error al actualizar la canción.", true);
            return;
        }
    }
    if (newVideoId) {
        const updatedTrack = { ...track, id: newVideoId, reassignIndex: currentReassignIndex + 1 };
        const updatedTracks = [...pl.tracks];
        updatedTracks[trackIndex] = updatedTrack;
        const result = await window.firebase.updatePlaylist(playlistId, { tracks: updatedTracks });
        if (result) {
            if (queueType === 'playlist' && viewingPlaylistId === playlistId) {
                const queueIndex = queue.findIndex(t => t.id === oldTrackId);
                if (queueIndex !== -1) {
                    queue[queueIndex] = updatedTrack;
                    renderQueue(queue, currentQueueTitle);
                    if (currentTrack && currentTrack.id === oldTrackId) {
                        currentTrack = updatedTrack;
                        playCurrent(true);
                    }
                }
            }
            showToast("Fuente reasignada.");
        } else {
            showToast("Error al reasignar la fuente.", true);
        }
    }
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

function playFromPlaylist(plId, i, autoplay=false){
  const pl = communityPlaylists.find(p=>p.id===plId); if(!pl) return;
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

function renderQueue(queueItems, title) {
    const panel = $("#queuePanel");
    currentQueueTitle = title;
    if(!panel) return;
    panel.classList.remove("hide");
    panel.innerHTML = `<div class="section-head"><h3 id="queueTitle"></h3></div><ul id="queueList"></ul>`;
    const titleEl = panel.querySelector('#queueTitle');
    if (titleEl) titleEl.textContent = title;
    const ul = $("#queueList");
    if (!ul) return;
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
            <div class="title-line">
              <span class="title-text">${t.title}</span>
              <span class="eq"><span></span><span></span><span></span></span>
            </div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>
          <div class="actions">
             <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito">${favIconSvg(isFav(t.id))}</button>
             <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more") || e.target.closest(".fav-btn") || e.target.closest(".card-play") || !isResolved) return;
            const currentPl = communityPlaylists.find(p=>p.id === viewingPlaylistId);
            const sourceQueue = currentPl ? (currentPl.tracks || []) : (queueItems || []);
            const resolvedQueue = sourceQueue.filter(item => item && (item.id || item.urls));
            const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
            if (resolvedIndex === -1) return;
            setQueue(resolvedQueue, queueType, resolvedIndex);
            playCurrent(true);
        };
        const playBtn = li.querySelector(".card-play");
        if(playBtn && viewingPlaylistId) playBtn.onclick = (e) => { e.stopPropagation(); playFromPlaylist(viewingPlaylistId, i, true); };
        ul.appendChild(li);
    });
    refreshIndicators();
}

async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    window.viewingPlaylistId = pl.id;
    switchView('view-player');
    const tracksToShow = (pl.source === 'spotify' && pl.spotifyTracks) ? pl.spotifyTracks.map((st, i) => (pl.tracks && pl.tracks[i]) ? pl.tracks[i] : { ...st, id: null, thumb: st.thumb || pl.cover }) : (pl.tracks || []);
    renderQueue(tracksToShow, pl.name);
    if (pl.source === 'spotify' && ['unresolved', 'partial'].includes(pl.status)) {
        startResolverJob(plId);
    }
}

function hideQueuePanel(){
    $("#queuePanel")?.classList.add("hide");
    if ($("#queueList")) $("#queueList").innerHTML="";
    if (window.resolverJobUnsubscribe) {
        window.resolverJobUnsubscribe();
        window.resolverJobUnsubscribe = null;
    }
    window.viewingPlaylistId=null;
    renderPlaylists();
}

function initPlaylistModals() {
    $("#btnNewPlaylist")?.addEventListener("click", () => {
        if (!canActivate('createPlaylist')) return;
        $("#createPlaylistSheet").classList.add("show");
    });
    $("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
    $("#createPlaylistSheet").addEventListener("click", e => { if (e.target.id === 'createPlaylistSheet') $("#createPlaylistSheet").classList.remove("show"); });
    $("#createPlConfirm").onclick = async () => {
        const name = $("#newPlName").value.trim();
        const creator = $("#newPlCreator").value.trim();
        if (!name || !creator) {
            showToast("Por favor, completa nombre de playlist y creador.", true);
            return;
        }
        const result = await window.firebase.createPlaylist({
            title: name,
            description: "",
            public: false,
            tracks: [],
            trackCount: 0
        });
        if (result.id) {
            addMyPlaylistId(result.id);
            $("#newPlName").value = "";
            $("#newPlCreator").value = "";
            $("#createPlaylistSheet").classList.remove("show");
            showToast(`Playlist "${name}" creada.`);
        } else {
            showToast('Error al crear la playlist.', true);
        }
    };
}

function initSpotifyImportUI() {
    $("#syBtnImportSpotify")?.addEventListener('click', () => {
        if (!canActivate('importSpotify')) return;
        $("#sySpotifyModal").classList.add('show');
    });
    $("#sySmFetch")?.addEventListener('click', handleSpotifyImport);
    $("#spotifyImportBackBtn")?.addEventListener('click', () => {
        $("#sySmInputUrl").value = "";
        switchView('view-playlists');
    });

    $("#spotifyImportConfirmBtn").onclick = async () => {
        const grid = $("#spotifyUserPlaylistsGrid");
        const selectedPlaylists = Array.from(grid.querySelectorAll(".spotify-pl-card.selected"))
            .map(card => card.playlistData);
        if (selectedPlaylists.length === 0) {
            showToast("Selecciona al menos una playlist para importar.", true);
            return;
        }
        if (!canActivate('importSpotify')) return;

        switchView('view-playlists');
        showToast(`Importando ${selectedPlaylists.length} playlist(s)...`);
        for (const pl of selectedPlaylists) {
            await fetchAndImportSinglePlaylist(pl);
        }
    };
}

async function handleSpotifyImport() {
    if (!canActivate('importSpotify')) return;
    const input = $("#sySmInputUrl").value.trim();
    if (!input) return;
    const modal = $("#sySpotifyModal");
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
            modal.classList.remove('show');
        } else {
            showToast("No se encontraron playlists públicas.", true);
        }
    } catch (e) {
        console.error("Error en importación de Spotify:", e);
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
    if (match && match[1]) return { type: 'playlist', id: match[1] };
    match = cleanedInput.match(userRegex);
    if (match && match[1]) return { type: 'user', id: match[1] };
    if (!cleanedInput.includes(".") && !cleanedInput.includes("/")) return { type: 'user', id: cleanedInput };
    return { type: null, id: null };
}

async function fetchUserPlaylists(userId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allPlaylists = [];
    let url = `https://api.spotify.com/v1/users/${userId}/playlists?limit=50`;
    while(url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('No se pudo obtener las playlists del usuario.');
            const data = await response.json();
            allPlaylists = allPlaylists.concat(data.items);
            url = data.next;
        } catch (e) {
            console.error("Error fetching user playlists:", e);
            showToast("No se pudo obtener las playlists del usuario.", true);
            return [];
        }
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
        card.innerHTML = ` <img class="spotify-pl-card-thumb" src="${pl.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'}" alt="Cover de ${pl.name}"> <div class="spotify-pl-card-meta"> <div class="spotify-pl-card-title">${pl.name}</div> <div class="spotify-pl-card-count">${pl.tracks.total} canciones</div> </div> <div class="spotify-pl-card-checkbox"> <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> </div> `;
        card.addEventListener('click', () => card.classList.toggle('selected'));
        grid.appendChild(card);
    });
    switchView('view-spotify-import-selection');
}

async function fetchAndImportSinglePlaylist(plData) {
    try {
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
    } catch(e) {
        console.error("Error importing spotify playlist:", e);
        showToast("Error al importar la playlist.", true);
    }
}

async function processAndSavePlaylist(pl) {
    const { collection, query, where, getDocs, addDoc, updateDoc, doc } = window.firebase;
    const col = collection(window.firebase.getFirestore(), 'playlists');
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("owner", "==", getSession().uid));
    const snapshot = await getDocs(q);
    const playlistData = {
        title: pl.name,
        description: "",
        public: false,
        source: 'spotify',
        spotifyId: pl.spotifyId,
        spotifyTracks: pl.spotifyTracks,
        trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null),
        status: 'unresolved',
        resolvedCount: 0
    };
    if (snapshot.empty) {
        const result = await window.firebase.createPlaylist(playlistData);
        if (result) {
            addMyPlaylistId(result.id);
            startResolverJob(result.id);
        } else {
            showToast('Error al crear la playlist.', true);
        }
    } else {
        const docId = snapshot.docs[0].id;
        const result = await window.firebase.updatePlaylist(docId, playlistData);
        if (result) {
            showToast(`Playlist "${pl.name}" actualizada.`);
            startResolverJob(docId);
        } else {
            showToast('Error al actualizar la playlist.', true);
        }
    }
}
async function getSpotifyToken() { if (spotifyToken.value && Date.now() < spotifyToken.expires) { return spotifyToken.value; } try { const response = await fetch("https://accounts.spotify.com/api/token", { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) }, body: 'grant_type=client_credentials' }); if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`); const data = await response.json(); spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 }; return spotifyToken.value; } catch (e) { console.error("Error getting Spotify token:", e); return null; } }
async function fetchAllSpotifyPlaylistTracks(playlistId) { const token = await getSpotifyToken(); if (!token) return []; let allTracks = []; let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`; while (url) { try { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not get songs from playlist'); const data = await response.json(); const tracks = data.items.map(({ track }) => track ? { spotifyId: track.id, title: track.name, author: track.artists.map(a => a.name).join(', '), thumb: track.album.images?.[0]?.url || '' } : null).filter(Boolean); allTracks = allTracks.concat(tracks); url = data.next; } catch (e) { console.error("Error fetching Spotify playlist tracks:", e); url = null; } } return allTracks; }

export { renderPlaylists, showPlaylistInPlayer, renderQueue, hideQueuePanel, initPlaylistModals, initSpotifyImportUI, openPlaylistOptionsMenu, removeFromPlaylist, renameTrackInPlaylist, reassignTrackSource, playFromPlaylist, handleRealtimeUpdate };
