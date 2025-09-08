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
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET) },
            body: 'grant_type=client_credentials'
        });
        if (!response.ok) throw new Error(`Spotify auth failed: ${response.statusText}`);
        const data = await response.json();
        spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 };
        return spotifyToken.value;
    } catch (e) { console.error("Error getting Spotify token:", e); return null; }
}

/**
 * Busca una canción en Spotify para obtener sus metadatos correctos.
 * @param {string} title - El título de la canción.
 * @param {string} author - El artista de la canción.
 * @returns {Promise<object|null>} El primer resultado de la búsqueda o null.
 */
async function searchSpotifyTrack(title, author) {
    const token = await getSpotifyToken();
    if (!token) return null;
    const query = `track:${encodeURIComponent(title)} artist:${encodeURIComponent(author)}`;
    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const track = data.tracks?.items[0];
        if (track) {
            return {
                title: track.name,
                author: track.artists.map(a => a.name).join(', ')
            };
        }
        return null;
    } catch (e) {
        console.error("Spotify search failed:", e);
        return null;
    }
}

// ... (El resto de las funciones de Spotify, renderizado, etc., permanecen aquí sin cambios)

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

    const header = panel.querySelector(".section-head");
    const titleEl = header.querySelector('#queueTitle');
    if (titleEl) titleEl.textContent = title;

    // AÑADIDO: Botón para corregir nombres de toda la playlist
    if (queueType === 'playlist' && isMyPlaylist(viewingPlaylistId)) {
        const correctBtn = document.createElement('button');
        correctBtn.id = 'btnCorrectNames';
        correctBtn.className = 'pill';
        correctBtn.textContent = 'Corregir Nombres';
        correctBtn.onclick = () => correctPlaylistNames(viewingPlaylistId);
        header.appendChild(correctBtn);
    }
    
    const ul = $("#queueList");
    if (!ul) return;
    ul.innerHTML = "";

    (queueItems || []).forEach((t) => {
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
        
        const playBtn = li.querySelector(".card-play");
        const trackIndex = queueItems.findIndex(item => (item.id || item.spotifyId) === (t.id || t.spotifyId));

        li.onclick = (e) => {
            if (e.target.closest(".more, .fav-btn, .card-play") || !isResolved) return;
            const resolvedQueue = queueItems.filter(item => item && item.id);
            const resolvedIndex = resolvedQueue.findIndex(item => item.id === t.id);
            if (resolvedIndex === -1) return;
            setQueue(resolvedQueue, queueType, resolvedIndex);
            playCurrent(true);
        };
        if(playBtn) playBtn.onclick = (e) => { e.stopPropagation(); playFromPlaylist(viewingPlaylistId, trackIndex, true); };
        ul.appendChild(li);
    });
    refreshIndicators();
}


/**
 * Corrige automáticamente el nombre y artista de una canción usando Spotify.
 * @param {string} playlistId - El ID de la playlist.
 * @param {number} trackIndex - El índice de la canción en la playlist.
 */
async function correctTrackName(playlistId, trackIndex) {
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks[trackIndex]) return;

    const track = pl.tracks[trackIndex];
    showToast(`Buscando "${track.title}"...`);

    const spotifyData = await searchSpotifyTrack(track.title, track.author);
    if (!spotifyData) {
        showToast("No se encontró coincidencia en Spotify.", true);
        return;
    }

    if (spotifyData.title === track.title && spotifyData.author === track.author) {
        showToast("El nombre ya es correcto.");
        return;
    }

    const updatedTracks = [...pl.tracks];
    updatedTracks[trackIndex] = { ...track, title: spotifyData.title, author: spotifyData.author };

    try {
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        showToast("Nombre corregido.");
    } catch (e) {
        console.error("Error correcting track name:", e);
        showToast("Error al guardar la corrección.", true);
    }
}

/**
 * Permite al usuario renombrar manualmente una canción.
 * @param {string} playlistId - El ID de la playlist.
 * @param {number} trackIndex - El índice de la canción en la playlist.
 */
async function renameTrackManually(playlistId, trackIndex) {
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks[trackIndex]) return;

    const track = pl.tracks[trackIndex];
    const newTitle = prompt("Nuevo título:", track.title);
    if (newTitle === null || newTitle.trim() === "") return;

    const newAuthor = prompt("Nuevo artista:", track.author);
    if (newAuthor === null || newAuthor.trim() === "") return;

    const updatedTracks = [...pl.tracks];
    updatedTracks[trackIndex] = { ...track, title: newTitle.trim(), author: newAuthor.trim() };
    
    try {
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        showToast("Canción renombrada.");
    } catch (e) {
        console.error("Error renaming track:", e);
        showToast("Error al guardar los cambios.", true);
    }
}

/**
 * Corrige automáticamente los nombres de todas las canciones de una playlist.
 * @param {string} playlistId - El ID de la playlist a corregir.
 */
async function correctPlaylistNames(playlistId) {
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl || !pl.tracks || pl.tracks.length === 0) return;

    showToast("Corrigiendo nombres, por favor espera...");
    const correctionPromises = pl.tracks.map(track => searchSpotifyTrack(track.title, track.author));
    const spotifyResults = await Promise.all(correctionPromises);

    let changesCount = 0;
    const updatedTracks = pl.tracks.map((track, index) => {
        const spotifyData = spotifyResults[index];
        if (spotifyData && (spotifyData.title !== track.title || spotifyData.author !== track.author)) {
            changesCount++;
            return { ...track, title: spotifyData.title, author: spotifyData.author };
        }
        return track;
    });

    if (changesCount === 0) {
        showToast("Todos los nombres ya son correctos.");
        return;
    }

    try {
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        await updateDoc(doc(db, "playlists", playlistId), { tracks: updatedTracks, updatedAt: serverTimestamp() });
        showToast(`${changesCount} nombre(s) de canción corregido(s).`);
    } catch (e) {
        console.error("Error batch correcting names:", e);
        showToast("Error al guardar las correcciones.", true);
    }
}


// ... (El resto de las funciones de este archivo permanecen igual)
// ... (fetchAllSpotifyPlaylistTracks, normalize, getTrackKey, renderPlaylists, etc.)
// Asegúrate de incluir el resto de funciones del archivo `playlists.js` que te pasé previamente.
// Solo he mostrado las funciones nuevas y las modificadas para mantener la respuesta concisa.
// El contenido completo del archivo `playlists.js` anterior debe ser mantenido,
// añadiendo estas nuevas capacidades.
