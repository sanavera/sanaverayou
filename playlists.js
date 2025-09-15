// Manejo de playlists locales e importadas (Spotify/Archive), y la cola de reproducción.

let viewingPlaylistId = null;
let currentResolverController = null; // Controlador para cancelar trabajos de importación

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

/**
 * Resuelve una canción de Spotify a un video.
 * @param {object} track - El objeto de la canción de Spotify ({ title, author }).
 * @param {AbortSignal} signal - La señal del AbortController para cancelar la petición.
 * @returns {Promise<{videoId: string|null, backups: string[], error: string|null}>}
 */
async function resolveTrack(track, signal) {
    const query = `${track.author} ${track.title}`;
    const MAX_RETRIES = 1;
    const RETRY_DELAY = 1000;

    const performFetch = async (url) => {
        const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxiedUrl, { signal }); // fetchWithTimeout from buscador.js
        if (!response.ok) throw new Error(`Scraper response not OK (status: ${response.status})`);
        const text = await response.text();
        return [...new Set(text.split('\n').map(l => extractId(l.trim())).filter(Boolean))];
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ytmIds = await performFetch(scraperYTM(query));
            if (ytmIds.length > 0) {
                return { videoId: ytmIds[0], backups: ytmIds.slice(1), error: null };
            }
            return { videoId: null, backups: [], error: "No se encontraron resultados de video." };
        } catch (e) {
            if (e.name === 'AbortError' || (signal && signal.aborted)) {
                return { videoId: null, backups: [], error: "Resolución cancelada." };
            }
            if (attempt < MAX_RETRIES) {
                await new Promise(res => setTimeout(res, RETRY_DELAY));
            } else {
                console.error(`Final error resolving "${query}":`, e);
                return { videoId: null, backups: [], error: e.message };
            }
        }
    }
     return { videoId: null, backups: [], error: "Error desconocido." };
}


/**
 * Guarda el álbum de Archive.org que se está reproduciendo como una nueva playlist.
 */
async function saveCurrentArchiveAlbumAsPlaylist() {
    if (queueType !== 'archive_album' || !queue || queue.length === 0) {
        showToast("No hay un álbum de Archive.org para guardar.", true);
        return;
    }
    let creator = localStorage.getItem('sy_creator_name') || prompt("Ingresa tu nombre de creador:")?.trim();
    if (!creator) return; 
    localStorage.setItem('sy_creator_name', creator);
    
    const albumData = {
        name: currentQueueTitle, creator, cover: queue[0].thumb, tracks: queue,
        trackCount: queue.length, source: 'archive', isPublic: false,
        ownerUserId: 'current_user_id_placeholder', updatedAt: sy_fs().serverTimestamp()
    };

    try {
        showToast(`Guardando "${albumData.name}"...`);
        const { collection, addDoc } = sy_fs();
        const docRef = await addDoc(collection(db, "playlists"), albumData);
        addMyPlaylistId(docRef.id);
        showToast("Álbum guardado en 'Mis Playlists'.");
        $("#btnSaveAlbum")?.classList.add('hide');
    } catch (e) {
        console.error("Error guardando álbum de Archive.org:", e);
        showToast("No se pudo guardar el álbum.", true);
    }
}

/**
 * Renderiza la lista de playlists del usuario.
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
            </div>
            <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;

        card.querySelector(".more").addEventListener("click", (e) => { e.stopPropagation(); openPlaylistOptionsMenu(pl); });
        card.addEventListener("click", () => showPlaylistInPlayer(pl.id));
        card.classList.toggle("is-playing", viewingPlaylistId === pl.id && queueType === 'playlist');
        grid.appendChild(card);
    });
}

async function openPlaylistOptionsMenu(pl) {
  let actions = isMyPlaylist(pl.id)
    ? [{ id: "rename", label: "Renombrar" }, { id: "delete", label: "Eliminar playlist", danger: true }]
    : (pl.isPublic ? [{ id: "save_copy", label: "Guardar una copia" }] : []);
  actions.push({ id: "cancel", label: "Cancelar", ghost: true });
  
  openActionSheet({
    title: pl.name, actions,
    onAction: async (act) => {
      const { doc, updateDoc, deleteDoc, serverTimestamp } = sy_fs();
      if (act === "rename") {
        const newName = prompt("Nuevo nombre para la playlist:", pl.name)?.trim();
        if (newName) {
            await updateDoc(doc(db, "playlists", pl.id), { name: newName, updatedAt: serverTimestamp() });
        }
      } else if (act === "delete") {
        openActionSheet({
            title: `¿Eliminar "${pl.name}"?`,
            actions: [{id: "confirm_delete", label: "Sí, eliminar", danger: true}, {id: "cancel", label: "Cancelar", ghost: true}],
            onAction: async (confirmAct) => { if(confirmAct === 'confirm_delete') { await deleteDoc(doc(db, "playlists", pl.id)); removeMyPlaylistId(pl.id); } }
        });
      } else if (act === "save_copy") {
        savePlaylistCopy(pl);
      }
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
    const newTitle = prompt("Nuevo nombre para la canción:", track.title)?.trim();
    if (!newTitle) return;
    const newAuthor = prompt("Nuevo autor para la canción:", track.author)?.trim();
    if (!newAuthor) return;

    const updatedTrack = { ...track, title: newTitle, author: newAuthor };
    const updatedTracks = [...pl.tracks];
    updatedTracks[trackIndex] = updatedTrack;

    try {
        const { doc, updateDoc, serverTimestamp } = sy_fs();
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        showToast("Canción renombrada.");
    } catch (e) { console.error('Error renaming track:', e); showToast('No se pudo renombrar.', true); }
}

function playFromSearch(trackId, autoplay=false) {
    const videoItems = items.filter(it => it.type === 'youtube_video');
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
    $("#queueTitle").textContent = title;
    const ul = $("#queueList");
    ul.innerHTML = "";
    (queueItems || []).forEach((t, i) => {
        if(!t) return;
        const li = document.createElement("li");
        li.className = "queue-item";
        li.dataset.trackId = t.id;
        const isResolved = !!(t.id || t.urls);
        let statusIndicator = isResolved ? '' : `<div class="pending-indicator ${t.error ? 'error' : ''}" title="${t.error || ''}">${t.error ? 'Error' : 'Pendiente'}</div>`;
        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb}" alt="">
            ${isResolved ? `<button class="card-play" title="Play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>` : statusIndicator}
          </div>
          <div class="meta">
            <div class="title-line"><span class="title-text">${t.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>
          <div class="actions">
             <button class="icon-btn fav-btn" title="Favorito">${favIconSvg(isFav(t.id))}</button>
             <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        if (isResolved) {
            li.onclick = (e) => {
                if (e.target.closest(".more, .fav-btn, .card-play")) return;
                playFromPlaylist(viewingPlaylistId, i, true);
            };
        }
        ul.appendChild(li);
    });
    refreshIndicators();
}

async function showPlaylistInPlayer(plId) {
    const pl = communityPlaylists.find(p => p.id === plId);
    if (!pl) return;
    viewingPlaylistId = pl.id;
    switchView('view-player');
    
    const tracksToShow = pl.spotifyTracks 
        ? pl.spotifyTracks.map((st, i) => (pl.tracks && pl.tracks[i]) ? { ...st, ...pl.tracks[i] } : { ...st, id: null, thumb: st.thumb || pl.cover }) 
        : (pl.tracks || []).filter(Boolean);

    renderQueue(tracksToShow, pl.name);
    
    if (pl.source === 'spotify' && ['unresolved', 'partial'].includes(pl.status)) {
        startResolverJob(plId);
    }
}

function hideQueuePanel(){ 
    $("#queuePanel")?.classList.add("hide"); 
    if ($("#queueList")) $("#queueList").innerHTML=""; 
    if (currentResolverController) {
        currentResolverController.abort();
        currentResolverController = null;
    }
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
    viewingPlaylistId=null; 
    renderPlaylists(); 
}

function initPlaylistModals() {
    $("#btnNewPlaylist")?.addEventListener("click", () => $("#createPlaylistSheet").classList.add("show"));
    $("#createPlCancel").onclick = () => $("#createPlaylistSheet").classList.remove("show");
    $("#createPlConfirm").onclick = async () => {
        const name = $("#newPlName").value.trim();
        const creator = $("#newPlCreator").value.trim();
        if (await createNewPlaylist(name, creator)) {
            $("#newPlName").value = ""; $("#newPlCreator").value = ""; 
            $("#createPlaylistSheet").classList.remove("show");
        }
    };
}

function initSpotifyImportUI() {
    $("#syBtnImportSpotify")?.addEventListener('click', () => $("#sySpotifyModal").classList.add('show'));
    $("#sySmFetch")?.addEventListener('click', handleSpotifyImport);
    $("#spotifyImportBackBtn")?.addEventListener('click', () => switchView('view-playlists'));
    $("#spotifyImportConfirmBtn").onclick = async () => {
        const selectedPlaylists = Array.from($("#spotifyUserPlaylistsGrid").querySelectorAll(".spotify-pl-card.selected"))
            .map(card => card.playlistData);
        if (selectedPlaylists.length === 0) return showToast("Selecciona al menos una playlist.", true);
        
        switchView('view-playlists');
        showToast(`Importando ${selectedPlaylists.length} playlist(s)...`);
        for (const pl of selectedPlaylists) await fetchAndImportSinglePlaylist(pl);
    };
}

async function handleSpotifyImport() {
    const input = $("#sySmInputUrl").value.trim();
    if (!input) return;
    const fetchBtn = $("#sySmFetch");
    fetchBtn.disabled = true; fetchBtn.textContent = 'Buscando...';
    try {
        const { type, id } = parseSpotifyLink(input);
        let playlists = [];
        if (type === 'playlist') {
            const token = await getSpotifyToken();
            const response = await fetch(`https://api.spotify.com/v1/playlists/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('No se pudo obtener la playlist.');
            playlists.push(await response.json());
        } else if (type === 'user') {
            playlists = await fetchUserPlaylists(id);
        } else {
            throw new Error("URL o ID de usuario no válido.");
        }
        
        if (playlists.length > 0) {
            showUserPlaylistsSelectionView(playlists);
            $("#sySpotifyModal").classList.remove('show');
        } else {
            showToast("No se encontraron playlists públicas.", true);
        }
    } catch (e) {
        console.error("Error en importación de Spotify:", e);
        showToast(e.message, true);
    } finally {
        fetchBtn.disabled = false; fetchBtn.textContent = 'Buscar';
    }
}

function parseSpotifyLink(input) {
    const cleanedInput = input.trim().split('?')[0];
    const playlistRegex = /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
    const userRegex = /open\.spotify\.com\/user\/([a-zA-Z0-9]+)/;
    let match = cleanedInput.match(playlistRegex) || cleanedInput.match(userRegex);
    if (match && match[0].includes('playlist')) return { type: 'playlist', id: match[1] };
    if (match && match[0].includes('user')) return { type: 'user', id: match[1] };
    if (!cleanedInput.includes(".") && !cleanedInput.includes("/")) return { type: 'user', id: cleanedInput };
    return {};
}

async function fetchUserPlaylists(userId) {
    const token = await getSpotifyToken();
    let allPlaylists = [], url = `https://api.spotify.com/v1/users/${userId}/playlists?limit=50`;
    while(url) {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { showToast("No se pudo obtener playlists del usuario.", true); return []; }
        const data = await response.json();
        allPlaylists.push(...data.items);
        url = data.next;
    }
    return allPlaylists;
}

function showUserPlaylistsSelectionView(playlists) {
    const grid = $("#spotifyUserPlaylistsGrid");
    grid.innerHTML = "";
    playlists.forEach(pl => {
        const card = document.createElement("div");
        card.className = "spotify-pl-card";
        card.playlistData = pl;
        card.innerHTML = ` <img class="spotify-pl-card-thumb" src="${pl.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'}" alt=""> <div class="spotify-pl-card-meta"> <div class="spotify-pl-card-title">${pl.name}</div> <div class="spotify-pl-card-count">${pl.tracks.total} canciones</div> </div> <div class="spotify-pl-card-checkbox"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div> `;
        card.addEventListener('click', () => card.classList.toggle('selected'));
        grid.appendChild(card);
    });
    switchView('view-spotify-import-selection');
}

async function fetchAndImportSinglePlaylist(plData) {
    try {
        const spotifyTracks = await fetchAllSpotifyPlaylistTracks(plData.id);
        if (spotifyTracks.length === 0) return showToast(`Playlist "${plData.name}" está vacía.`, true);
        await processAndSavePlaylist({
            spotifyId: plData.id, name: plData.name, creator: plData.owner.display_name,
            cover: plData.images?.[0]?.url || '', spotifyTracks
        });
    } catch(e) { console.error("Error al importar playlist:", e); showToast("Error al importar.", true); }
}

async function processAndSavePlaylist(pl) {
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = sy_fs();
    const q = query(collection(db, 'playlists'), where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", "current_user_id_placeholder"));
    const snapshot = await getDocs(q);
    const playlistData = {
        name: pl.name, creator: pl.creator, cover: pl.cover || null,
        spotifyTracks: pl.spotifyTracks, trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null), status: 'unresolved',
        resolvedCount: 0, updatedAt: serverTimestamp(),
    };
    if (snapshot.empty) {
        const docRef = await addDoc(collection(db, 'playlists'), { ...playlistData, source: 'spotify', spotifyId: pl.spotifyId, ownerUserId: "current_user_id_placeholder" });
        addMyPlaylistId(docRef.id);
    } else {
        await updateDoc(doc(db, 'playlists', snapshot.docs[0].id), playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
    }
}

async function startResolverJob(playlistId) {
    if (currentResolverController) currentResolverController.abort();
    currentResolverController = new AbortController();
    currentResolverController.playlistId = playlistId;
    const signal = currentResolverController.signal;

    const { doc, getDoc, updateDoc, serverTimestamp, increment } = sy_fs();
    const plRef = doc(db, 'playlists', playlistId);

    try {
        await updateDoc(plRef, { status: 'resolving' });
        const plDoc = await getDoc(plRef);
        if (!plDoc.exists()) throw new Error("Playlist no encontrada");

        const pl = plDoc.data();
        const tracksToResolve = pl.spotifyTracks
            .map((st, i) => ({ ...st, originalIndex: i }))
            .filter((_, i) => !pl.tracks[i]?.id);
        if (tracksToResolve.length === 0) return await updateDoc(plRef, { status: 'resolved' });

        const CONCURRENT_REQUESTS = 5;
        for (let i = 0; i < tracksToResolve.length; i += CONCURRENT_REQUESTS) {
            if (signal.aborted) break;
            const batch = tracksToResolve.slice(i, i + CONCURRENT_REQUESTS);
            
            const promises = batch.map(trackInfo => resolveTrack(trackInfo, signal));
            const results = await Promise.allSettled(promises);
            if (signal.aborted) break;

            const updatePayload = {};
            let resolvedInBatch = 0;
            results.forEach((result, index) => {
                const trackInfo = batch[index];
                const { originalIndex } = trackInfo;
                if (result.status === 'fulfilled') {
                    const { videoId, backups, error } = result.value;
                    updatePayload[`tracks.${originalIndex}`] = videoId
                        ? { id: videoId, title: trackInfo.title, author: trackInfo.author, thumb: trackInfo.thumb, source: 'youtube', type: 'youtube_video', backupUrls: backups }
                        : { ...trackInfo, id: null, error: error || "No encontrado." };
                    if (videoId) resolvedInBatch++;
                } else {
                    updatePayload[`tracks.${originalIndex}`] = { ...trackInfo, id: null, error: "Error de red." };
                }
            });

            if (Object.keys(updatePayload).length > 0) {
                updatePayload.resolvedCount = increment(resolvedInBatch);
                updatePayload.updatedAt = serverTimestamp();
                await updateDoc(plRef, updatePayload);
            }
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
        if (currentResolverController?.playlistId === playlistId) currentResolverController = null;
    }
}

async function getSpotifyToken() { if (spotifyToken.value && Date.now() < spotifyToken.expires) { return spotifyToken.value; } try { const response = await fetch("https://accounts.spotify.com/api/token", { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) }, body: 'grant_type=client_credentials' }); if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`); const data = await response.json(); spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 }; return spotifyToken.value; } catch (e) { console.error("Error getting Spotify token:", e); return null; } }
async function fetchAllSpotifyPlaylistTracks(playlistId) { const token = await getSpotifyToken(); if (!token) return []; let allTracks = []; let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists(name),album(images))),next`; while (url) { try { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not get songs from playlist'); const data = await response.json(); const tracks = data.items.map(({ track }) => track ? { spotifyId: track.id, title: track.name, author: track.artists.map(a => a.name).join(', '), thumb: track.album.images?.[0]?.url || '' } : null).filter(Boolean); allTracks = allTracks.concat(tracks); url = data.next; } catch (e) { console.error("Error fetching Spotify playlist tracks:", e); url = null; } } return allTracks; }
