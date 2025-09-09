// Manejo de playlists locales e importadas (Spotify), y la cola de reproducción.

let viewingPlaylistId = null;

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

// --- Cache para resolución de canciones ---
const trackCache = new Map();

/**
 * Obtiene un token de acceso de la API de Spotify.
 * @returns {Promise<string|null>} El token de acceso.
 */
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
        if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`);
        const data = await response.json();
        spotifyToken = {
            value: data.access_token,
            expires: Date.now() + (data.expires_in * 1000) - 60000
        };
        return spotifyToken.value;
    } catch (e) {
        console.error("Error getting Spotify token:", e);
        return null;
    }
}

/**
 * Obtiene todas las canciones de una playlist de Spotify, manejando paginación.
 * @param {string} playlistId - El ID de la playlist de Spotify.
 * @returns {Promise<Array<object>>} Una lista de objetos de canción.
 */
async function fetchAllSpotifyPlaylistTracks(playlistId) {
    const token = await getSpotifyToken();
    if (!token) return [];
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`;
    while (url) {
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Could not get songs from playlist');
            const data = await response.json();
            const tracks = data.items.map(({ track }) => track ? {
                spotifyId: track.id,
                title: track.name,
                author: track.artists.map(a => a.name).join(', '),
                thumb: track.album.images?.[0]?.url || ''
            } : null).filter(Boolean);
            allTracks = allTracks.concat(tracks);
            url = data.next;
        } catch (e) {
            console.error("Error fetching Spotify playlist tracks:", e);
            url = null;
        }
    }
    return allTracks;
}

/**
 * Normaliza un string para la búsqueda y comparación.
 * @param {string} str - El string a normalizar.
 * @returns {string} El string normalizado.
 */
function normalize(str) {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Crea una clave única para una canción basada en artista y título.
 * @param {string} artist - El artista.
 * @param {string} title - El título.
 * @returns {string} La clave generada.
 */
function getTrackKey(artist, title) {
    return `${normalize(artist)}|${normalize(title)}`;
}

/**
 * Resuelve una canción de Spotify a un video de YouTube.
 * @param {object} track - El objeto de la canción de Spotify.
 * @returns {Promise<{videoId: string|null, error: string|null}>}
 */
async function resolveTrack(track) {
    const trackKey = getTrackKey(track.author, track.title);
    if (trackCache.has(trackKey)) {
        return { videoId: trackCache.get(trackKey), error: null };
    }
    const query = `${track.author} ${track.title}`;
    try {
        const videoId = await scrapeYoutubeUrlOnly(query);
        if (videoId) {
            trackCache.set(trackKey, videoId);
            return { videoId: videoId, error: null };
        }
        return { videoId: null, error: "No video found via scraping" };
    } catch (e) {
        return { videoId: null, error: e.message };
    }
}

/**
 * Renderiza la lista de playlists del usuario en la vista "Mis Playlists".
 */
function renderPlaylists() {
    const grid = $("#plList"), empty = $("#plEmpty");
    if (!grid) return;
    grid.innerHTML = "";

    const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id));

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
        const resolved = pl.resolvedCount || 0;

        let statusText = `${resolved} / ${total} temas`;
        if (pl.status === 'resolving') statusText = `Importando... (${resolved}/${total})`;
        else if (pl.status === 'partial') statusText = `Parcial (${resolved}/${total})`;
        else if (pl.status === 'resolved' || pl.source !== 'spotify') statusText = `${total} temas`;

        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${pl.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
        card.querySelector('.pl-privacy-toggle input').addEventListener('change', (e) => { e.stopPropagation(); handlePrivacyToggle(pl.id, e.target.checked); });
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            await showPlaylistInPlayer(pl.id);
        });

        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

/**
 * Abre el menú de opciones para una playlist (renombrar, eliminar, etc.).
 * @param {object} pl - La playlist seleccionada.
 */
async function openPlaylistOptionsMenu(pl) {
  const isOwner = isMyPlaylist(pl.id);
  let actions = [];
  if (isOwner) {
      actions.push({ id: "rename", label: "Renombrar" });
      actions.push({ id: "delete", label: "Eliminar playlist", danger: true });
  }
  if (!isOwner && pl.isPublic) {
      actions.push({ id: "save_copy", label: "Guardar una copia" });
  }
  actions.push({ id: "cancel", label: "Cancelar", ghost: true });
  
  openActionSheet({
    title: pl.name,
    actions: actions,
    onAction: async (act) => {
      const { doc, updateDoc, deleteDoc, serverTimestamp } = window.firebase;
      if (act === "rename" && isOwner) {
        const newName = prompt("Nuevo nombre para la playlist:", pl.name);
        if (newName && newName.trim() !== "") {
            const newCreator = prompt("Nuevo nombre de creador:", pl.creator);
            if(newCreator && newCreator.trim() !== ""){
                await updateDoc(doc(db, "playlists", pl.id), { name: newName.trim(), creator: newCreator.trim(), updatedAt: serverTimestamp() });
            }
        }
      }
      if (act === "delete" && isOwner) {
        openActionSheet({
            title: `¿Eliminar "${pl.name}"?`,
            actions: [{id: "confirm_delete", label: "Sí, eliminar", danger: true}, {id: "cancel", label: "Cancelar", ghost: true}],
            onAction: async (confirmAct) => { if(confirmAct === 'confirm_delete') { await deleteDoc(doc(db, "playlists", pl.id)); removeMyPlaylistId(pl.id); } }
        });
      }
      if (act === "save_copy" && !isOwner) { savePlaylistCopy(pl); }
    }
  });
}

/**
 * Elimina una canción de una playlist.
 * @param {string} plId - El ID de la playlist.
 * @param {string} trackId - El ID de la canción a eliminar.
 */
async function removeFromPlaylist(plId, trackId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;

    const { doc, updateDoc, serverTimestamp } = sy_fs();
    const updatedTracks = (pl.tracks || []).filter(t => t && t.id !== trackId);
    
    sy_syncRemovalRealtime(plId, trackId);

    try {
        await updateDoc(doc(db, 'playlists', plId), { tracks: updatedTracks, resolvedCount: updatedTracks.length, updatedAt: serverTimestamp() });
        showToast('Canción eliminada.');
    } catch (e) {
        console.error('Error removing song:', e);
        showToast('No se pudo quitar la canción.', true);
    }
}

/**
 * Busca una fuente de video alternativa para una canción en una playlist.
 * @param {string} playlistId - El ID de la playlist.
 * @param {string} oldTrackId - El ID de la canción a reasignar.
 */
async function reassignTrackSource(playlistId, oldTrackId) {
    showToast("Buscando nueva fuente...");
    try {
        const pl = communityPlaylists.find(p => p.id === playlistId);
        if (!pl || !pl.tracks) return;

        const trackIndex = pl.tracks.findIndex(t => t && t.id === oldTrackId);
        if (trackIndex === -1) return;

        const track = pl.tracks[trackIndex];
        const currentReassignIndex = track.reassignIndex || 0;
        const nextReassignIndex = currentReassignIndex + 1;
        const newVideoId = await scrapeYoutubeIdForNthResult(`${track.author} ${track.title}`, nextReassignIndex);

        if (newVideoId) {
            const updatedTrack = { ...track, id: newVideoId, reassignIndex: nextReassignIndex };
            const updatedTracks = [...pl.tracks];
            updatedTracks[trackIndex] = updatedTrack;

            const { doc, updateDoc, serverTimestamp } = window.firebase;
            await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });

            if (queueType === 'playlist' && viewingPlaylistId === playlistId) {
                const queueIndex = queue.findIndex(t => t.id === oldTrackId);
                if (queueIndex !== -1) {
                    queue[queueIndex] = updatedTrack;
                    if (currentTrack && currentTrack.id === oldTrackId) {
                        currentTrack = updatedTrack;
                        playCurrent(true);
                    }
                }
            }
            showToast("Fuente reasignada. Reproduciendo nueva versión.");
        } else {
            showToast("No se encontraron más versiones.", true);
            const updatedTrack = { ...track, reassignIndex: 0 };
            const updatedTracks = [...pl.tracks];
            updatedTracks[trackIndex] = updatedTrack;
            const { doc, updateDoc, serverTimestamp } = window.firebase;
            await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        }
    } catch (e) {
        console.error("Error en la reasignación de fuente:", e);
        showToast("Error al reasignar la fuente.", true);
    }
}

// --- Lógica de reproducción desde playlists ---

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
  const tracks = (pl.tracks || []).filter(t => t && t.id);
  if (tracks.length === 0) {
      showToast("Esta playlist no tiene canciones para reproducir.", true);
      return;
  }
  setQueue(tracks, "playlist", i);
  playCurrent(autoplay);
  renderPlaylists();
}

function playPlaylist(id){
  const pl = communityPlaylists.find(p=>p.id===id); if(!pl) return;
  const playableTracks = (pl.tracks || []).filter(t => t && t.id);
  if(!playableTracks.length) {
      showToast("Esta playlist no tiene canciones resueltas.", true);
      return;
  }
  playFromPlaylist(pl.id, 0, true);
}


// --- Manejo de la UI de la cola de reproducción ---

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
        li.dataset.trackId = t.id || `spotify_${t.spotifyId}`;
        const isResolved = !!t.id;

        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb}" alt="">
            ${isResolved ? `<button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>` : `<div class="pending-indicator">Pendiente</div>`}
          </div>
          <div class="meta">
            <div class="title-line">
              <span class="title-text">${t.title}</span>
              ${isResolved ? `<span class="eq"><span></span><span></span><span></span></span>` : ''}
            </div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>
          <div class="actions">
            <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more") || e.target.closest(".card-play") || !isResolved) return;
            const resolvedQueue = queueItems.filter(item => item && item.id);
            const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
            if (resolvedIndex === -1) return;
            setQueue(resolvedQueue, queueType, resolvedIndex);
            playCurrent(true);
        };
        const playBtn = li.querySelector(".card-play");
        if(playBtn) playBtn.onclick = (e) => { e.stopPropagation(); playFromPlaylist(viewingPlaylistId, i, true); };
        ul.appendChild(li);
    });
    refreshIndicators();
}

async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;

    viewingPlaylistId = pl.id;
    switchView('view-player');

    if (pl.source === 'spotify' && pl.status !== 'resolved') {
        const tracksToShow = (pl.tracks?.length > 0) ? pl.tracks.map((t, i) => t || { ...pl.spotifyTracks[i], id: null, thumb: pl.spotifyTracks[i].thumb || pl.cover }) : pl.spotifyTracks.map(st => ({...st, thumb: st.thumb || pl.cover, id: null}));
        renderQueue(tracksToShow, pl.name);
        if (pl.status !== 'resolving') startResolverJob(plId);
        return;
    }

    const tracksToPlay = (pl.tracks || []).filter(t => t && t.id);
    if (!tracksToPlay || tracksToPlay.length === 0) {
        showToast(`La playlist "${pl.name}" está vacía o no tiene canciones resueltas.`, true);
        switchView('view-playlists');
        return;
    }

    setQueue(tracksToPlay, 'playlist', 0);
    renderQueue(tracksToPlay, pl.name);
    playCurrent(true);
}

function hideQueuePanel(){ 
    $("#queuePanel")?.classList.add("hide"); 
    if ($("#queueList")) $("#queueList").innerHTML=""; 
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
    viewingPlaylistId=null; 
    renderPlaylists(); 
}

function initPlaylistModals() {
    $("#btnNewPlaylist")?.addEventListener("click", () => { $("#createPlaylistSheet").classList.add("show"); });
    $("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
    $("#createPlaylistSheet").addEventListener("click", e => { if (e.target.id === 'createPlaylistSheet') $("#createPlaylistSheet").classList.remove("show"); });
    $("#createPlConfirm").onclick = async () => {
        const name = $("#newPlName").value.trim();
        const creator = $("#newPlCreator").value.trim();
        if (await createNewPlaylist(name, creator)) {
            $("#newPlName").value = ""; 
            $("#newPlCreator").value = ""; 
            $("#createPlaylistSheet").classList.remove("show");
        }
    };
}

/* ========== Lógica de Importación de Spotify (CORREGIDA Y AMPLIADA) ========== */

function initSpotifyImportUI() {
    const btn = $("#syBtnImportSpotify");
    if (btn) btn.addEventListener('click', openSpotifyImportModal);
}

function openSpotifyImportModal() {
    const modal = $("#sySpotifyModal");
    if(modal) {
        modal.classList.add('show');
        const input = $("#sySmInputUrl");
        if(input) input.value = "";
        const fetchBtn = $("#sySmFetch");
        if(fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Importar';
        }
    }
}

async function handleSpotifyImport() {
    const input = $("#sySmInputUrl").value.trim();
    if (!input) return;

    const modal = $("#sySpotifyModal");
    const fetchBtn = $("#sySmFetch");
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Buscando...';

    try {
        const { type, id } = parseSpotifyLink(input);

        if (type === 'playlist') {
            await fetchAndImportSinglePlaylist(id);
            modal.classList.remove('show');
        } else if (type === 'user') {
            const playlists = await fetchUserPlaylists(id);
            if (playlists.length > 0) {
                showUserPlaylistsModal(playlists);
                modal.classList.remove('show');
            } else {
                showToast("No se encontraron playlists públicas para este usuario.", true);
            }
        } else {
            showToast("URL o ID de usuario no válido. Intenta de nuevo.", true);
        }
    } catch (e) {
        console.error("Error en importación de Spotify:", e);
        showToast("Ocurrió un error. Verifica el enlace o ID.", true);
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Importar';
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
    
    // Si no es una URL, asumimos que es un ID de usuario
    if (!cleanedInput.includes(".")) return { type: 'user', id: cleanedInput };

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

function showUserPlaylistsModal(playlists) {
    const modal = $("#syUserPlaylistsModal");
    const listEl = $("#syUserPlaylistsList");
    if (!modal || !listEl) return;
    
    listEl.innerHTML = ""; // Limpiar lista anterior
    
    playlists.forEach(pl => {
        const item = document.createElement("div");
        item.className = "sheet-item-check";
        item.innerHTML = `
            <input type="checkbox" id="pl_${pl.id}" data-playlist-id="${pl.id}">
            <label for="pl_${pl.id}">${pl.name} <span class="muted">(${pl.tracks.total} temas)</span></label>
        `;
        listEl.appendChild(item);
    });

    modal.classList.add("show");

    $("#syUserPlImportBtn").onclick = async () => {
        const selectedIds = Array.from(listEl.querySelectorAll("input:checked")).map(input => input.dataset.playlistId);
        if (selectedIds.length === 0) {
            showToast("Selecciona al menos una playlist para importar.", true);
            return;
        }
        modal.classList.remove('show');
        showToast(`Importando ${selectedIds.length} playlist(s)...`);
        for (const id of selectedIds) {
            await fetchAndImportSinglePlaylist(id);
        }
    };
}

async function fetchAndImportSinglePlaylist(playlistId) {
    try {
        const token = await getSpotifyToken();
        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('No se pudo obtener la playlist.');
        const plData = await response.json();

        const spotifyTracks = await fetchAllSpotifyPlaylistTracks(playlistId);
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

        showToast(`Playlist "${plData.name}" importada.`);
    } catch(e) {
        console.error("Error importing spotify playlist:", e);
        showToast("Error al importar una playlist.", true);
    }
}

async function processAndSavePlaylist(pl) {
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = window.firebase;
    const col = collection(db, 'playlists');
    
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", "current_user_id_placeholder"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        const docRef = await addDoc(col, {
            name: pl.name,
            creator: pl.creator,
            isPublic: false,
            cover: pl.cover || null,
            source: 'spotify',
            spotifyId: pl.spotifyId,
            spotifyTracks: pl.spotifyTracks,
            trackCount: pl.spotifyTracks.length,
            tracks: Array(pl.spotifyTracks.length).fill(null),
            status: 'unresolved',
            resolvedCount: 0,
            updatedAt: serverTimestamp(),
            ownerUserId: "current_user_id_placeholder"
        });
        addMyPlaylistId(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        const existingDocRef = doc(db, 'playlists', docId);
        await updateDoc(existingDocRef, {
            name: pl.name,
            creator: pl.creator,
            cover: pl.cover,
            spotifyTracks: pl.spotifyTracks,
            trackCount: pl.spotifyTracks.length,
            updatedAt: serverTimestamp()
        });
        showToast(`Playlist "${pl.name}" actualizada.`);
    }
}
