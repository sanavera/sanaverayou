// Manejo de playlists, adaptado para usuarios registrados (Firestore) e invitados (LocalStorage).

let viewingPlaylistId = null;

// --- Credenciales y Estado de Spotify (sin cambios) ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };


// --- Lógica de Creación y Modificación de Playlists (Unificada) ---

/**
 * Crea una nueva playlist vacía.
 * @param {string} name - Nombre de la playlist.
 * @param {string} creator - Nombre del creador.
 */
async function createNewPlaylist(name, creator) {
    if (!name || !creator) {
        showToast("Por favor, completa el nombre de la playlist y del creador.", true);
        return;
    }

    const { currentUser, db, collection, addDoc, serverTimestamp } = sy_fs();
    
    const newPlaylistData = {
        name,
        creator,
        tracks: [],
        trackCount: 0,
        isPublic: !!currentUser, // Las playlists de invitados son siempre privadas
        source: 'native',
        updatedAt: serverTimestamp(),
    };

    if (currentUser) {
        // Usuario registrado: Guardar en Firestore
        try {
            newPlaylistData.ownerId = currentUser.uid;
            newPlaylistData.createdAt = serverTimestamp();
            await addDoc(collection(db, "playlists"), newPlaylistData);
            showToast(`Playlist "${name}" creada.`);
        } catch (e) {
            console.error("Error creating playlist in Firestore: ", e);
            showToast("Hubo un error al crear la playlist.", true);
        }
    } else {
        // Usuario invitado: Guardar en LocalStorage
        newPlaylistData.id = `guest_pl_${Date.now()}`; // ID local único
        newPlaylistData.updatedAt = new Date().toISOString(); // Simula timestamp
        userPlaylists.unshift(newPlaylistData);
        saveGuestPlaylists(userPlaylists);
        renderPlaylists();
        showToast(`Playlist "${name}" creada.`);
    }
}

/**
 * Crea una nueva playlist a partir de una canción.
 * @param {string} name - Nombre de la nueva playlist.
 * @param {string} creator - Nombre del creador.
 * @param {object} track - La canción para agregar a la nueva playlist.
 */
async function createNewPlaylistFromSong(name, creator, track) {
    const { currentUser, db, collection, addDoc, serverTimestamp } = sy_fs();

    const newPlaylistData = {
        name,
        creator,
        tracks: [track],
        trackCount: 1,
        isPublic: !!currentUser,
        source: 'native',
        updatedAt: serverTimestamp(),
    };

    if (currentUser) {
        try {
            newPlaylistData.ownerId = currentUser.uid;
            newPlaylistData.createdAt = serverTimestamp();
            await addDoc(collection(db, "playlists"), newPlaylistData);
            showToast(`Agregado a la nueva playlist "${name}"`);
        } catch (e) {
            console.error("Error creating playlist from song in Firestore: ", e);
            showToast("No se pudo crear la playlist.", true);
        }
    } else {
        newPlaylistData.id = `guest_pl_${Date.now()}`;
        newPlaylistData.updatedAt = new Date().toISOString();
        userPlaylists.unshift(newPlaylistData);
        saveGuestPlaylists(userPlaylists);
        renderPlaylists();
        showToast(`Agregado a la nueva playlist "${name}"`);
    }
}


/**
 * Agrega una canción a una playlist existente.
 * @param {string} playlistId - ID de la playlist.
 * @param {object} track - La canción a agregar.
 */
async function addSongToPlaylist(playlistId, track) {
    const { currentUser, db, doc, updateDoc, serverTimestamp } = sy_fs();
    
    const pl = userPlaylists.find(p => p.id === playlistId);
    if (!pl) return;

    // Evitar duplicados
    if (pl.tracks && pl.tracks.some(t => t && t.id === track.id)) {
        showToast("La canción ya está en esta playlist.");
        return;
    }

    const updatedTracks = [track, ...(pl.tracks || [])];

    if (currentUser) {
        // Usuario registrado: Actualizar en Firestore
        try {
            const plRef = doc(db, "playlists", playlistId);
            await updateDoc(plRef, { 
                tracks: updatedTracks, 
                trackCount: updatedTracks.length, 
                updatedAt: serverTimestamp() 
            });
            showToast(`Agregado a "${pl.name}"`);
        } catch (e) {
            console.error("Error adding song to Firestore playlist: ", e);
            showToast("No se pudo agregar la canción.", true);
        }
    } else {
        // Usuario invitado: Actualizar en LocalStorage
        pl.tracks = updatedTracks;
        pl.trackCount = updatedTracks.length;
        pl.updatedAt = new Date().toISOString();
        saveGuestPlaylists(userPlaylists);
        renderPlaylists(); // Para reflejar el cambio en el contador de temas
        showToast(`Agregado a "${pl.name}"`);
    }
}


/**
 * Renderiza la lista de playlists del usuario en la vista "Mis Playlists".
 */
function renderPlaylists() {
    const grid = $("#plList"), empty = $("#plEmpty");
    if (!grid) return;
    grid.innerHTML = "";

    if (userPlaylists.length === 0) {
        empty?.classList.remove("hide");
        return;
    }
    empty?.classList.add("hide");

    userPlaylists.forEach(pl => {
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

        const isOwner = isMyPlaylist(pl);
        const { currentUser } = sy_fs();

        card.innerHTML = `
            <img class="pl-thumb-bg" src="${cover}" alt="">
            <div class="pl-overlay">
                <div class="pl-meta">
                    <div class="pl-title">${pl.name}</div>
                    <div class="pl-creator">por ${pl.creator || 'Anónimo'}</div>
                    <div class="pl-subtitle">${statusText}</div>
                </div>
                ${isOwner && currentUser ? `
                <div class="pl-privacy-toggle">
                    <label class="switch">
                        <input type="checkbox" ${pl.isPublic ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <span>Pública</span>
                </div>` : ''}
            </div>
            ${isOwner ? `<button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>` : ''}
            `;

        if (isOwner) {
            card.querySelector(".more")?.addEventListener("click", (e) => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
            card.querySelector('.pl-privacy-toggle input')?.addEventListener('change', (e) => { e.stopPropagation(); handlePrivacyToggle(pl.id, e.target.checked); });
        }
        
        card.addEventListener("click", async (e) => {
            if (e.target.closest(".more") || e.target.closest('.pl-privacy-toggle')) return;
            await showPlaylistInPlayer(pl.id);
        });

        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

/**
 * Abre el menú de opciones para una playlist (renombrar, eliminar).
 * @param {object} pl - La playlist seleccionada.
 */
async function openPlaylistOptionsMenu(pl) {
    const actions = [
        { id: "rename", label: "Renombrar" },
        { id: "delete", label: "Eliminar playlist", danger: true },
        { id: "cancel", label: "Cancelar", ghost: true }
    ];

    openActionSheet({
        title: pl.name,
        actions: actions,
        onAction: async (act) => {
            if (act === "rename") await renamePlaylist(pl);
            if (act === "delete") await confirmAndDeletePlaylist(pl);
        }
    });
}

/**
 * Renombra una playlist.
 * @param {object} pl - La playlist a renombrar.
 */
async function renamePlaylist(pl) {
    const newName = prompt("Nuevo nombre para la playlist:", pl.name);
    if (!newName || newName.trim() === "") return;
    
    const newCreator = prompt("Nuevo nombre de creador:", pl.creator);
    if (!newCreator || newCreator.trim() === "") return;

    const { currentUser, db, doc, updateDoc, serverTimestamp } = sy_fs();

    if (currentUser) {
        await updateDoc(doc(db, "playlists", pl.id), { 
            name: newName.trim(), 
            creator: newCreator.trim(), 
            updatedAt: serverTimestamp() 
        });
    } else {
        const playlistToUpdate = userPlaylists.find(p => p.id === pl.id);
        if (playlistToUpdate) {
            playlistToUpdate.name = newName.trim();
            playlistToUpdate.creator = newCreator.trim();
            playlistToUpdate.updatedAt = new Date().toISOString();
            saveGuestPlaylists(userPlaylists);
            renderPlaylists();
        }
    }
}

/**
 * Pide confirmación y luego elimina una playlist.
 * @param {object} pl - La playlist a eliminar.
 */
async function confirmAndDeletePlaylist(pl) {
    openActionSheet({
        title: `¿Eliminar "${pl.name}"?`,
        actions: [{ id: "confirm_delete", label: "Sí, eliminar", danger: true }, { id: "cancel", label: "Cancelar", ghost: true }],
        onAction: async (confirmAct) => {
            if (confirmAct === 'confirm_delete') {
                const { currentUser, db, doc, deleteDoc } = sy_fs();
                if (currentUser) {
                    await deleteDoc(doc(db, "playlists", pl.id));
                } else {
                    userPlaylists = userPlaylists.filter(p => p.id !== pl.id);
                    saveGuestPlaylists(userPlaylists);
                    renderPlaylists();
                }
            }
        }
    });
}


async function removeFromPlaylist(plId, trackId) {
    const pl = userPlaylists.find(p => p.id === plId);
    if (!pl) return;
    const updatedTracks = (pl.tracks || []).filter(t => t && t.id !== trackId);
    
    const { currentUser, db, doc, updateDoc, serverTimestamp } = sy_fs();

    if (currentUser) {
        try {
            await updateDoc(doc(db, 'playlists', plId), { 
                tracks: updatedTracks, 
                trackCount: updatedTracks.length, 
                resolvedCount: updatedTracks.filter(Boolean).length, 
                updatedAt: serverTimestamp() 
            });
            showToast('Canción eliminada.');
        } catch (e) { 
            console.error('Error removing song:', e); 
            showToast('No se pudo quitar la canción.', true); 
        }
    } else {
        pl.tracks = updatedTracks;
        pl.trackCount = updatedTracks.length;
        pl.updatedAt = new Date().toISOString();
        saveGuestPlaylists(userPlaylists);
        showToast('Canción eliminada.');
        // Re-render la cola si la estamos viendo
        if (viewingPlaylistId === plId) {
            renderQueue(updatedTracks, pl.name);
        }
    }
}

// ... (El resto de funciones como renameTrackInPlaylist, reassign, playFromSearch, etc., se mantienen,
// pero adaptando las operaciones de escritura para que también funcionen con invitados/localStorage
// si es necesario, aunque la mayoría de estas ya operan sobre la UI o datos en memoria que
// se guardan con las funciones anteriores.)


// --- Lógica de Cola de Reproducción y Visualización (mayormente sin cambios) ---

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
  const pl = [...userPlaylists, ...communityPlaylists].find(p=>p.id===plId); if(!pl) return;
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
            const currentPl = [...userPlaylists, ...communityPlaylists].find(p=>p.id === viewingPlaylistId);
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
    const pl = [...userPlaylists, ...communityPlaylists].find(p => p.id === plId);
    if (!pl) return;
    viewingPlaylistId = pl.id;
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
        const creator = $("#newPlCreator").value.trim() || (sy_fs().currentUser ? sy_fs().currentUser.email.split('@')[0] : 'Invitado');
        await createNewPlaylist(name, creator);
        $("#newPlName").value = ""; 
        $("#newPlCreator").value = ""; 
        $("#createPlaylistSheet").classList.remove("show");
    };
}

// --- Lógica de Importación de Spotify (sin cambios mayores) ---
// (Se asume que esta funcionalidad requiere estar logueado, ya que crea playlists en la BD)
function initSpotifyImportUI() {
    // ... (sin cambios)
}
async function handleSpotifyImport() {
    // ... (sin cambios)
}
// ... (resto de funciones de spotify sin cambios)
async function getSpotifyToken() { if (spotifyToken.value && Date.now() < spotifyToken.expires) { return spotifyToken.value; } try { const response = await fetch("https://accounts.spotify.com/api/token", { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) }, body: 'grant_type=client_credentials' }); if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`); const data = await response.json(); spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 }; return spotifyToken.value; } catch (e) { console.error("Error getting Spotify token:", e); return null; } }
async function fetchAllSpotifyPlaylistTracks(playlistId) { const token = await getSpotifyToken(); if (!token) return []; let allTracks = []; let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`; while (url) { try { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not get songs from playlist'); const data = await response.json(); const tracks = data.items.map(({ track }) => track ? { spotifyId: track.id, title: track.name, author: track.artists.map(a => a.name).join(', '), thumb: track.album.images?.[0]?.url || '' } : null).filter(Boolean); allTracks = allTracks.concat(tracks); url = data.next; } catch (e) { console.error("Error fetching Spotify playlist tracks:", e); url = null; } } return allTracks; }

async function processAndSavePlaylist(pl) {
    const { currentUser, db, collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = sy_fs();
    if (!currentUser) {
        showToast("Debes iniciar sesión para importar playlists de Spotify.", true);
        return;
    }
    const col = collection(db, 'playlists');
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    const playlistData = {
        name: pl.name,
        creator: pl.creator,
        cover: pl.cover || null,
        spotifyTracks: pl.spotifyTracks,
        trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null),
        status: 'unresolved',
        resolvedCount: 0,
        updatedAt: serverTimestamp(),
        ownerId: currentUser.uid
    };
    if (snapshot.empty) {
        const docRef = await addDoc(col, { ...playlistData, isPublic: false, source: 'spotify', spotifyId: pl.spotifyId, createdAt: serverTimestamp() });
        startResolverJob(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        const existingDocRef = doc(db, 'playlists', docId);
        await updateDoc(existingDocRef, playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
        startResolverJob(docId);
    }
}
