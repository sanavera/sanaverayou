// Manejo de playlists locales e importadas (Spotify/Archive), y la cola de reproducción.

let viewingPlaylistId = null;
let currentResolverController = null; // Controlador para cancelar trabajos de importación
let resolverJobUnsubscribe = null; // Para el listener de Firestore

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

/**
 * --- LÓGICA DE RESOLUCIÓN REFACTORIZADA Y ROBUSTA ---
 * Resuelve una canción de Spotify a un video, manejando timeouts, reintentos y
 * asegurando que el proceso nunca se cuelgue.
 * @param {object} track - El objeto de la canción de Spotify ({ title, author }).
 * @param {AbortSignal} signal - La señal del AbortController para cancelar la petición.
 * @returns {Promise<{videoId: string|null, backups: string[], error: string|null}>}
 */
async function resolveTrack(track, signal) {
    const query = `${track.author} ${track.title}`;
    const ALLOW_YT_FALLBACK = false;
    const MAX_RETRIES = 1; // 1 reintento por canción
    const RETRY_DELAY = 1000; // 1 segundo de espera

    const performFetch = async (url) => {
        const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        // Asumo que fetchWithTimeout está definida en otro script (buscador.js)
        const response = await fetchWithTimeout(proxiedUrl, { signal });
        if (!response.ok) throw new Error(`La respuesta del scraper no fue exitosa (status: ${response.status})`);
        const text = await response.text();
        return [...new Set(text.split('\n').map(l => extractId(l.trim())).filter(Boolean))];
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1. Intento principal con YouTube Music
            const ytmIds = await performFetch(scraperYTM(query));
            if (ytmIds.length > 0) {
                return { videoId: ytmIds[0], backups: ytmIds.slice(1), error: null };
            }

            // 2. Fallback (si está activado)
            if (ALLOW_YT_FALLBACK) {
                const ytIds = await performFetch(scraperYT(query));
                if (ytIds.length > 0) {
                    return { videoId: ytIds[0], backups: ytIds.slice(1), error: null };
                }
            }
            // Si llega aquí, significa que no hubo resultados, no es un error de red.
            return { videoId: null, backups: [], error: "No se encontraron resultados de video." };

        } catch (e) {
            if (e.name === 'AbortError' || (signal && signal.aborted)) {
                return { videoId: null, backups: [], error: "Resolución cancelada por el usuario." };
            }
            if (attempt < MAX_RETRIES) {
                await new Promise(res => setTimeout(res, RETRY_DELAY));
            } else {
                console.error(`Error final resolviendo "${query}" después de ${MAX_RETRIES + 1} intentos:`, e);
                return { videoId: null, backups: [], error: e.message };
            }
        }
    }
     return { videoId: null, backups: [], error: "Error desconocido en el resolver." };
}


/**
 * Guarda el álbum de Archive.org que se está reproduciendo como una nueva playlist del usuario.
 */
async function saveCurrentArchiveAlbumAsPlaylist() {
    if (queueType !== 'archive_album' || !queue || queue.length === 0) {
        showToast("No hay un álbum de Archive.org para guardar.", true);
        return;
    }

    let creator = localStorage.getItem('sy_creator_name');
    if (!creator) {
        creator = prompt("Para guardar el álbum, por favor ingresa tu nombre de creador:")?.trim();
        if (!creator) return; 
        localStorage.setItem('sy_creator_name', creator);
    }
    
    const albumData = {
        name: currentQueueTitle,
        creator: creator,
        cover: queue[0].thumb,
        tracks: queue,
        trackCount: queue.length,
        source: 'archive',
        isPublic: false,
        ownerUserId: 'current_user_id_placeholder',
        updatedAt: sy_fs().serverTimestamp()
    };

    try {
        showToast(`Guardando "${albumData.name}"...`);
        const { collection, addDoc } = sy_fs();
        const docRef = await addDoc(collection(db, "playlists"), albumData);
        addMyPlaylistId(docRef.id);
        showToast("Álbum guardado en 'Mis Playlists'.");
        const btnSave = $("#btnSaveAlbum");
        if(btnSave) btnSave.classList.add('hide');

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
      const { doc, updateDoc, deleteDoc, serverTimestamp } = sy_fs();
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

async function removeFromPlaylist(plId, trackId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    const { doc, updateDoc, serverTimestamp } = sy_fs();
    const updatedTracks = (pl.tracks || []).filter(t => t && t.id !== trackId);
    try {
        await updateDoc(doc(db, 'playlists', plId), { tracks: updatedTracks, trackCount: updatedTracks.length, resolvedCount: updatedTracks.filter(Boolean).length, updatedAt: serverTimestamp() });
        showToast('Canción eliminada.');
    } catch (e) { console.error('Error removing song:', e); showToast('No se pudo quitar la canción.', true); }
}

async function renameTrackInPlaylist(playlistId, trackId) {
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
        const { doc, updateDoc, serverTimestamp } = sy_fs();
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        if (queueType === 'playlist' && viewingPlaylistId === playlistId) {
            const queueIndex = queue.findIndex(t => t.id === trackId);
            if (queueIndex !== -1) {
                queue[queueIndex] = updatedTrack;
                renderQueue(queue, currentQueueTitle);
                if (currentTrack && currentTrack.id === trackId) {
                    currentTrack = updatedTrack;
                    updateUIOnTrackChange();
                }
            }
        }
        showToast("Canción renombrada.");
    } catch (e) { console.error('Error renaming track:', e); showToast('No se pudo renombrar la canción.', true); }
}

async function reassignTrackSource(playlistId, oldTrackId) {
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
            const { doc, updateDoc, serverTimestamp } = window.firebase;
            await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
            return;
        }
    }
    if (newVideoId) {
        const updatedTrack = { ...track, id: newVideoId, reassignIndex: currentReassignIndex + 1 };
        const updatedTracks = [...pl.tracks];
        updatedTracks[trackIndex] = updatedTrack;
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
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
        const isResolved = !!(t && (t.id || t.urls));
        
        let statusIndicator = `<div class="pending-indicator">Pendiente</div>`;
        if (!isResolved && t && t.error) {
            statusIndicator = `<div class="pending-indicator error" title="${t.error}">Error</div>`;
        }

        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb}" alt="">
            ${isResolved ? `<button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>` : statusIndicator}
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
    viewingPlaylistId = pl.id;
    switchView('view-player');
    
    // --- FIX: Correctly select and filter tracks for rendering ---
    const tracksToShow = pl.spotifyTracks 
        ? pl.spotifyTracks.map((st, i) => (pl.tracks && pl.tracks[i]) ? { ...st, ...pl.tracks[i] } : { ...st, id: null, thumb: st.thumb || pl.cover }) 
        : (pl.tracks || []).filter(Boolean); // Filter out any null/undefined entries for local lists

    renderQueue(tracksToShow, pl.name);
    
    if (pl.source === 'spotify' && ['unresolved', 'partial'].includes(pl.status)) {
        startResolverJob(plId);
    }
}

function hideQueuePanel(){ 
    $("#queuePanel")?.classList.add("hide"); 
    if ($("#queueList")) $("#queueList").innerHTML=""; 
    
    // Aborta cualquier trabajo de resolución en curso al salir de la vista
    if (currentResolverController) {
        currentResolverController.abort();
        currentResolverController = null;
    }

    if (typeof resolverJobUnsubscribe === 'function') {
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

function initSpotifyImportUI() {
    $("#syBtnImportSpotify")?.addEventListener('click', () => $("#sySpotifyModal").classList.add('show'));
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
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = sy_fs();
    const col = collection(db, 'playlists');
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", "current_user_id_placeholder"));
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
    };
    if (snapshot.empty) {
        const docRef = await addDoc(col, { ...playlistData, isPublic: false, source: 'spotify', spotifyId: pl.spotifyId, ownerUserId: "current_user_id_placeholder" });
        addMyPlaylistId(docRef.id);
        startResolverJob(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        const existingDocRef = doc(db, 'playlists', docId);
        await updateDoc(existingDocRef, playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
        startResolverJob(docId);
    }
}

/**
 * --- LÓGICA DE IMPORTACIÓN POR LOTES CORREGIDA Y ROBUSTA ---
 * Inicia el proceso de búsqueda de videos para una playlist de Spotify.
 * @param {string} playlistId - El ID del documento de la playlist en Firestore.
 */
async function startResolverJob(playlistId) {
    if (currentResolverController && currentResolverController.playlistId === playlistId) return;
    if (currentResolverController) currentResolverController.abort();

    currentResolverController = new AbortController();
    currentResolverController.playlistId = playlistId;
    const signal = currentResolverController.signal;

    const { doc, getDoc, updateDoc, serverTimestamp } = sy_fs();
    const plRef = doc(db, 'playlists', playlistId);

    try {
        const plDoc = await getDoc(plRef);
        if (!plDoc.exists()) throw new Error("Playlist no encontrada");

        const pl = plDoc.data();
        const tracksToResolve = pl.spotifyTracks
            .map((st, i) => ({ ...st, originalIndex: i }))
            .filter((_, i) => !pl.tracks[i] || !pl.tracks[i].id);

        if (tracksToResolve.length === 0) return;

        await updateDoc(plRef, { status: 'resolving', updatedAt: serverTimestamp() });

        const CONCURRENT_REQUESTS = 5;
        for (let i = 0; i < tracksToResolve.length; i += CONCURRENT_REQUESTS) {
            if (signal.aborted) break;

            const batch = tracksToResolve.slice(i, i + CONCURRENT_REQUESTS);
            showToast(`Importando ${i + batch.length} de ${pl.trackCount}...`);

            const promises = batch.map(trackInfo =>
                resolveTrack({ title: trackInfo.title, author: trackInfo.author }, signal)
            );

            const results = await Promise.allSettled(promises);

            if (signal.aborted) break;

            // --- FIX: Atomic update process ---
            const currentPlDoc = await getDoc(plRef); // Get latest version before writing
            if (!currentPlDoc.exists()) break;

            const currentData = currentPlDoc.data();
            const updatedTracks = [...currentData.tracks];

            results.forEach((result, index) => {
                const trackInfo = batch[index];
                const { originalIndex } = trackInfo;

                if (result.status === 'fulfilled') {
                    const { videoId, backups, error } = result.value;
                    if (videoId) {
                        updatedTracks[originalIndex] = {
                            id: videoId, title: trackInfo.title, author: trackInfo.author,
                            thumb: trackInfo.thumb, source: 'youtube', type: 'youtube_video',
                            backupUrls: backups || []
                        };
                    } else {
                        updatedTracks[originalIndex] = { id: null, title: trackInfo.title, author: trackInfo.author, thumb: trackInfo.thumb, error: error || "No encontrado." };
                    }
                } else {
                    updatedTracks[originalIndex] = { id: null, title: trackInfo.title, author: trackInfo.author, thumb: trackInfo.thumb, error: "Error de red." };
                }
            });

            const newResolvedCount = updatedTracks.filter(t => t && t.id).length;
            await updateDoc(plRef, {
                tracks: updatedTracks,
                resolvedCount: newResolvedCount,
                updatedAt: serverTimestamp()
            });
            // --- End of atomic update fix ---
        }
        
        if (!signal.aborted) {
            const finalDoc = await getDoc(plRef);
            const finalPl = finalDoc.data();
            const finalStatus = finalPl.resolvedCount === finalPl.trackCount ? 'resolved' : 'partial';
            await updateDoc(plRef, { status: finalStatus, updatedAt: serverTimestamp() });
            showToast(`Importación finalizada para "${finalPl.name}".`);
        }

    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error("Error en el trabajo de resolución:", e);
            showToast("Ocurrió un error durante la importación.", true);
            await updateDoc(plRef, { status: 'partial' }).catch(()=>{});
        }
    } finally {
        if (currentResolverController && currentResolverController.playlistId === playlistId) {
             currentResolverController = null;
        }
    }
}

async function getSpotifyToken() { if (spotifyToken.value && Date.now() < spotifyToken.expires) { return spotifyToken.value; } try { const response = await fetch("https://accounts.spotify.com/api/token", { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) }, body: 'grant_type=client_credentials' }); if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`); const data = await response.json(); spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 }; return spotifyToken.value; } catch (e) { console.error("Error getting Spotify token:", e); return null; } }
async function fetchAllSpotifyPlaylistTracks(playlistId) { const token = await getSpotifyToken(); if (!token) return []; let allTracks = []; let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`; while (url) { try { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not get songs from playlist'); const data = await response.json(); const tracks = data.items.map(({ track }) => track ? { spotifyId: track.id, title: track.name, author: track.artists.map(a => a.name).join(', '), thumb: track.album.images?.[0]?.url || '' } : null).filter(Boolean); allTracks = allTracks.concat(tracks); url = data.next; } catch (e) { console.error("Error fetching Spotify playlist tracks:", e); url = null; } } return allTracks; }
