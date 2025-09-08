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

/**
 * Reproduce una canción de los resultados de búsqueda.
 * @param {string} trackId - ID de la canción.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
function playFromSearch(trackId, autoplay=false) {
    const videoItems = items.filter(it => it.source === 'youtube' && it.type === 'youtube_video');
    const videoIndex = videoItems.findIndex(v => v.id === trackId);
    if (videoIndex > -1) {
        setQueue(videoItems, "search", videoIndex);
        viewingPlaylistId = null;
        playCurrent(autoplay);
    }
}

/**
 * Reproduce una canción desde una playlist.
 * @param {string} plId - ID de la playlist.
 * @param {number} i - Índice de la canción en la playlist.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
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

/**
 * Inicia la reproducción de una playlist desde la primera canción.
 * @param {string} id - ID de la playlist.
 */
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

/**
 * Renderiza la cola de reproducción en el panel del reproductor.
 * @param {Array<object>} queueItems - Las canciones a mostrar.
 * @param {string} title - El título de la cola/playlist.
 */
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
            <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito" ${!isResolved ? 'disabled' : ''}>
                ${favIconSvg(isFav(t.id))}
            </button>
            <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more") || e.target.closest(".fav-btn") || e.target.closest(".card-play") || !isResolved) return;
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

/**
 * Muestra una playlist en la vista del reproductor y comienza la reproducción.
 * @param {string} plId - El ID de la playlist a mostrar.
 */
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

/**
 * Oculta el panel de la cola de reproducción.
 */
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

/**
 * Inicializa los listeners para la creación de playlists.
 */
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

/* ========== Spotify Import UI & Logic (CORREGIDO) ========== */
function initSpotifyImportUI() {
    const playlistsView = document.getElementById('view-playlists');
    if (!playlistsView) return;
    const header = playlistsView.querySelector('.section-head');
    if (!header || playlistsView.querySelector('#syBtnImportSpotify')) return;

    const btn = document.createElement('button');
    btn.id = 'syBtnImportSpotify';
    btn.className = 'pill';
    btn.innerHTML = `${spotifyLogoSvg()} Importar de Spotify`;
    btn.style.cssText = 'display:flex; align-items:center; gap:8px;';
    
    const actionsDiv = header.querySelector('.pl-actions');
    if (actionsDiv) actionsDiv.prepend(btn);
    else header.appendChild(btn);

    btn.addEventListener('click', openSpotifyImportModal);
}

function openSpotifyImportModal() {
    if (document.getElementById('sySpotifyModal')) {
        document.getElementById('sySpotifyModal').classList.add('show');
        return;
    }
    const modal = document.createElement('div');
    modal.id = 'sySpotifyModal';
    modal.className = 'sheet';
    modal.innerHTML = `
        <div class="sheet-content">
            <div class="sheet-title">Importar playlists de Spotify</div>
            <div id="sySmBody">
                <p class="muted" style="margin: 8px 0 16px;">Ingresá tu nombre de usuario de Spotify o pegá el enlace a tu perfil para buscar tus listas públicas.</p>
                <div class="sheet-form">
                    <input id="sySmInput" type="text" placeholder="ej. luchosanavera o https://open.spotify.com/user/..." autocomplete="off">
                </div>
                <div class="sheet-actions">
                    <button id="sySmCancel" class="sheet-item ghost">Cancelar</button>
                    <button id="sySmFetch" class="sheet-item pill">Buscar Playlists</button>
                </div>
                <div id="sySmResults" style="margin-top: 16px;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('show');
    
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
    modal.querySelector('#sySmCancel').onclick = () => modal.classList.remove('show');
    modal.querySelector('#sySmFetch').onclick = fetchSpotifyUserPlaylists;
}

function parseSpotifyUserId(input) {
  if (!input) return null;
  const cleanedInput = input.trim().split('?')[0];
  const spotifyUserRegex = /open\.spotify\.com\/(?:user|profile)\/([a-zA-Z0-9]+)/;
  const match = cleanedInput.match(spotifyUserRegex);
  if (match && match[1]) return match[1];
  if (!cleanedInput.includes('/') && !cleanedInput.includes(':')) return cleanedInput;
  return null;
}

async function fetchSpotifyUserPlaylists() {
    const input = document.getElementById('sySmInput').value.trim();
    const userId = parseSpotifyUserId(input);
    const results = document.getElementById('sySmResults');
    const fetchBtn = document.getElementById('sySmFetch');
    
    if (!userId) {
        showToast("Formato de usuario o URL no válido.", true);
        return;
    }

    results.innerHTML = `<div class="loading-indicator" style="padding: 20px 0;">Buscando...</div>`;
    fetchBtn.disabled = true;

    try {
        const token = await getSpotifyToken();
        let url = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists?limit=50`;
        const allPlaylists = [];
        while (url) {
            const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
            if (!response.ok) {
                if (response.status === 404) throw new Error(`Usuario <strong>${userId}</strong> no encontrado.`);
                throw new Error('Error de API de Spotify: ' + response.status);
            }
            const data = await response.json();
            allPlaylists.push(...data.items);
            url = data.next;
        }

        if (allPlaylists.length === 0) {
            results.innerHTML = `<p class="muted">No se encontraron playlists públicas para <strong>${userId}</strong>.</p>`;
            return;
        }
        renderSpotifyPlaylistsSelection(userId, allPlaylists);
    } catch (e) {
        console.error("Error fetching user playlists:", e);
        results.innerHTML = `<p class="muted" style="color: var(--accent-light);">${e.message}</p>`;
    } finally {
        fetchBtn.disabled = false;
    }
}

function renderSpotifyPlaylistsSelection(userId, list) {
    const resultsContainer = document.getElementById('sySmResults');
    const sheetBody = document.getElementById('sySmBody');
    sheetBody.querySelector('.sheet-form').style.display = 'none';
    sheetBody.querySelector('.sheet-actions').style.display = 'none';

    const checks = list.map(p => `
        <label class="sheet-item" style="display: flex; align-items: center; gap: 12px; margin: 4px 0;">
            <input type="checkbox" class="sy-pl-check" data-plid="${p.id}" data-plname="${p.name.replace(/"/g,'&quot;')}" data-cover="${p.images?.[0]?.url || ''}" checked>
            <img src="${p.images?.[0]?.url || 'https://i.imgur.com/gCa3j5g.png'}" alt="" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
            <div style="flex: 1; min-width: 0;">
                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</div>
                <small class="muted">${p.tracks.total} temas</small>
            </div>
        </label>
    `).join('');

    resultsContainer.innerHTML = `
        <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="syPlAll" checked>
                <span>Seleccionar todo (${list.length})</span>
            </label>
        </div>
        <div class="sheet-list" style="max-height: 40vh;">${checks}</div>
        <div class="sheet-actions" style="display: flex; margin-top: 16px;">
            <button id="syPlCancel" class="sheet-item ghost">Volver</button>
            <button id="syPlImport" class="sheet-item pill">Importar / Actualizar (${list.length})</button>
        </div>
    `;

    const importBtn = resultsContainer.querySelector('#syPlImport');
    const selectAllCheckbox = resultsContainer.querySelector('#syPlAll');
    const allCheckboxes = [...resultsContainer.querySelectorAll('.sy-pl-check')];

    const updateTotal = () => {
        const selectedCount = allCheckboxes.filter(cb => cb.checked).length;
        importBtn.textContent = `Importar / Actualizar (${selectedCount})`;
        importBtn.disabled = selectedCount === 0;
    };

    selectAllCheckbox.onchange = (e) => {
        allCheckboxes.forEach(cb => cb.checked = e.target.checked);
        updateTotal();
    };

    allCheckboxes.forEach(cb => cb.onchange = () => {
        if (!cb.checked) selectAllCheckbox.checked = false;
        updateTotal();
    });

    resultsContainer.querySelector('#syPlCancel').onclick = () => {
        sheetBody.querySelector('.sheet-form').style.display = 'block';
        sheetBody.querySelector('.sheet-actions').style.display = 'flex';
        resultsContainer.innerHTML = '';
    };

    importBtn.onclick = async () => {
        importBtn.disabled = true;
        importBtn.textContent = 'Importando...';
        const selected = allCheckboxes.filter(cb => cb.checked);
        const payload = selected.map(ch => ({
            spotifyId: ch.dataset.plid,
            name: ch.dataset.plname,
            creator: userId,
            cover: ch.dataset.cover || '',
        }));
        await processAndSavePlaylists(payload, importBtn);
    };
}

async function processAndSavePlaylists(list, button) {
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = window.firebase;
    let importedCount = 0, updatedCount = 0;

    for (let i = 0; i < list.length; i++) {
        const pl = list[i];
        if (button) button.textContent = `Procesando ${i + 1}/${list.length}...`;
        const spotifyTracks = await fetchAllSpotifyPlaylistTracks(pl.spotifyId);
        if (spotifyTracks.length === 0) continue;

        const q = query(collection(db, 'playlists'), where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", "current_user_id_placeholder"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            const docRef = await addDoc(collection(db, 'playlists'), {
                name: pl.name, creator: pl.creator, isPublic: false, cover: pl.cover, source: 'spotify',
                spotifyId: pl.spotifyId, spotifyTracks: spotifyTracks, trackCount: spotifyTracks.length,
                tracks: Array(spotifyTracks.length).fill(null), status: 'unresolved', resolvedCount: 0,
                updatedAt: serverTimestamp(), ownerUserId: "current_user_id_placeholder"
            });
            addMyPlaylistId(docRef.id);
            importedCount++;
        } else {
            const docId = snapshot.docs[0].id;
            await updateDoc(doc(db, 'playlists', docId), {
                name: pl.name, creator: pl.creator, cover: pl.cover, spotifyTracks: spotifyTracks,
                trackCount: spotifyTracks.length, updatedAt: serverTimestamp()
            });
            updatedCount++;
        }
    }
    showToast(`${importedCount} playlists importadas, ${updatedCount} actualizadas.`);
    if (document.getElementById('sySpotifyModal')) document.getElementById('sySpotifyModal').classList.remove('show');
}
