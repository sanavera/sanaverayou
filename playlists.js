// Manejo de playlists locales e importadas (Spotify/Archive), y la cola de reproducción.

let viewingPlaylistId = null;

// --- Credenciales y Estado de Spotify ---
const SPOTIFY_CLIENT_ID = "459588d3183647799c670169de916988";
const SPOTIFY_CLIENT_SECRET = "2cd0ccd3a63441068061c2b574090655";
let spotifyToken = { value: null, expires: 0 };

/**
 * Obtiene un token de acceso para la API de Spotify usando Client Credentials.
 * @returns {Promise<string>} El token de acceso.
 */
async function getSpotifyToken() {
  if (spotifyToken.value && spotifyToken.expires > Date.now()) { return spotifyToken.value; }
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
    spotifyToken = { value: data.access_token, expires: Date.now() + (data.expires_in * 1000) - 60000 };
    return spotifyToken.value;
  } catch (e) {
    console.error("Error getting Spotify token:", e);
    return null;
  }
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
            const contentType = ytmResponse.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await ytmResponse.json();
                text = data.contents;
            } else {
                text = await ytmResponse.text();
            }

            const ytmId = extractId(text);
            if (ytmId) {
                return { videoId: ytmId, backups: [], error: null };
            }
        }

        // 2. Si YTM falla, usa el fallback a YouTube normal si está habilitado.
        if (ALLOW_YT_FALLBACK) {
            const ytUrl = `https://api.allorigins.win/get?disableCache=true&t=${Date.now()}&url=${encodeURIComponent(scraperYT(query))}`;
            const ytResponse = await fetch(ytUrl, { cache: 'no-store', credentials: 'omit' });
            if (ytResponse.ok) {
                let text = '';
                const contentType = ytResponse.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await ytResponse.json();
                    text = data.contents;
                } else {
                    text = await ytResponse.text();
                }

                const ytId = extractId(text);
                if (ytId) {
                    return { videoId: ytId, backups: [], error: null };
                }
            }
        }
        return { videoId: null, backups: [], error: "No se encontraron resultados de alta calidad." };
    } catch (e) {
        console.error("Error al resolver la canción:", e);
        return { videoId: null, backups: [], error: "Error de red o del scraper." };
    }
}


/**
 * @param {string} playlistId
 * @returns {Promise<Array<object>>}
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
      console.error(e);
      return allTracks;
    }
  }
  return allTracks;
}

// --- Lógica de la interfaz de importación de Spotify ---
function initSpotifyImportUI() {
  const sm = $("#sySpotifyModal");
  if (!sm) return;
  $("#smImportPlaylistBtn").onclick = () => sm.classList.add("show");
  $("#sySmInputUrl").addEventListener('keydown', e => { if (e.key === 'Enter') $("#sySmFetch").click(); });

  $("#sySmFetch").onclick = async () => {
    const input = $("#sySmInputUrl").value.trim();
    if (!input) return;

    const playlistId = extractSpotifyPlaylistId(input);
    if (!playlistId) {
      showToast("URL de Spotify no válida.", true);
      return;
    }

    sm.classList.remove("show");
    
    // Iniciar el proceso de importación
    await importSpotifyPlaylist(playlistId);
  };
}

/**
 * Extrae el ID de una URL de Spotify.
 * @param {string} url - La URL o ID de Spotify.
 * @returns {string|null} El ID de la playlist o null si no se encuentra.
 */
function extractSpotifyPlaylistId(url) {
  const regex = /(?:playlist\/|user\/.*playlist\/|)([a-zA-Z0-9]{22})/;
  const match = url.match(regex);
  if (match) {
    return match[1];
  } else if (url.length === 22) {
    // Si la entrada ya es un ID, lo devolvemos
    return url;
  }
  return null;
}

/**
 * Importa una playlist de Spotify.
 * @param {string} playlistId - El ID de la playlist de Spotify.
 */
async function importSpotifyPlaylist(playlistId) {
  if (!window.syAuth.isLoggedIn()) {
    showToast("Por favor, inicia sesión para importar playlists.", true);
    return;
  }

  const allTracks = await fetchAllSpotifyPlaylistTracks(playlistId);
  if (allTracks.length === 0) {
    showToast("No se encontraron canciones en la playlist.", true);
    return;
  }

  const playlistName = `Importada de Spotify (${new Date().toLocaleDateString()})`;
  const newPlaylistId = await window.syAuth.createPlaylist(playlistName, "Spotify", window.syAuth.currentUserId);
  if (!newPlaylistId) {
      showToast("Error al crear la playlist en Firestore.", true);
      return;
  }

  const resolverModal = $("#resolver-modal");
  const resolverTitle = $("#resolver-title");
  const resolverProgressText = $("#resolver-progress-text");
  const resolverProgress = $("#resolver-progress");
  const resolverCancel = $("#resolver-cancel");
  resolverModal.classList.remove('hide');
  
  let isCanceled = false;
  resolverCancel.onclick = () => {
      isCanceled = true;
      resolverModal.classList.add('hide');
  };

  resolverTitle.textContent = `Importando ${allTracks.length} canciones`;
  resolverProgressText.textContent = `0 / ${allTracks.length}`;

  const resolvedTracks = [];
  for (let i = 0; i < allTracks.length; i++) {
      if (isCanceled) break;
      const track = allTracks[i];
      const result = await resolveTrack(track);

      resolverProgressText.textContent = `${i + 1} / ${allTracks.length}`;
      resolverProgress.style.width = `${((i + 1) / allTracks.length) * 100}%`;

      if (result.videoId) {
          const ytTrack = {
              id: result.videoId,
              title: track.title,
              author: track.author,
              source: 'youtube_music',
              thumb: track.thumb,
              isResolved: true
          };
          resolvedTracks.push(ytTrack);
          await window.syAuth.addSongToPlaylist(newPlaylistId, ytTrack);
      }
  }

  resolverModal.classList.add('hide');
  if (resolvedTracks.length > 0) {
    showToast(`Se importaron ${resolvedTracks.length} canciones de Spotify.`);
  } else {
    showToast("No se pudo importar ninguna canción.", true);
  }
}

/**
 * Muestra el modal del importador de Spotify.
 */
function showSpotifyImporter() {
  const sm = $("#sySpotifyModal");
  if(sm) sm.classList.add("show");
}


// --- Lógica de la interfaz de playlists ---
function initPlaylistModals(){
    const newPlaylistModal = $("#newPlaylistModal");
    if(!newPlaylistModal) return;

    $("#btnCreatePlaylist").onclick = () => newPlaylistModal.classList.add("show");
    
    $("#newPlaylistModal").onclick = (e) => { if(e.target.id === "newPlaylistModal") newPlaylistModal.classList.remove("show"); };

    $("#createPlaylistCancel").onclick = () => newPlaylistModal.classList.remove("show");

    $("#createPlaylistConfirm").onclick = async () => {
        const name = $("#newPlaylistName").value.trim();
        if(!name) return;
        
        const newPlaylist = await window.syAuth.createPlaylist(name, window.syAuth.currentUsername);
        if (newPlaylist) {
            $("#newPlaylistName").value = "";
            newPlaylistModal.classList.remove("show");
            showToast(`Playlist "${name}" creada`);
        }
    };
}

/**
 * Agrega una canción a una playlist existente.
 * @param {string} playlistId - ID de la playlist.
 * @param {object} track - La canción a agregar.
 * @returns {boolean} True si se agregó correctamente.
 */
async function addSongToPlaylist(playlistId, track) {
    if (!window.syAuth.isLoggedIn()) {
        showToast("Por favor, inicia sesión para agregar canciones a una playlist.", true);
        return false;
    }
    
    if (await window.syAuth.addSongToPlaylist(playlistId, track)) {
        return true;
    }
    showToast("No se pudo agregar la canción.", true);
    return false;
}

/**
 * Crea una nueva playlist a partir de una canción.
 * @param {string} name - Nombre de la nueva playlist.
 * @param {string} creator - Nombre del creador.
 * @param {object} track - La primera canción de la playlist.
 */
async function createNewPlaylistFromSong(name, creator, track) {
    if (!window.syAuth.isLoggedIn()) {
        showToast("Por favor, inicia sesión para crear playlists.", true);
        return false;
    }
    
    const newPlaylist = await window.syAuth.createPlaylist(name, creator, window.syAuth.currentUserId, track);
    if (newPlaylist) {
        return true;
    }
    showToast("No se pudo crear la playlist.", true);
    return false;
}

/**
 * Carga y muestra una playlist en la vista del reproductor.
 * @param {string} id - El ID de la playlist.
 */
async function showPlaylistInPlayer(id) {
    const playlist = communityPlaylists.find(p => p.id === id);
    if (!playlist) {
        showToast("Playlist no encontrada.", true);
        return;
    }

    const tracks = await window.syAuth.getPlaylistTracks(id);
    if (tracks) {
        viewingPlaylistId = id;
        const shuffledTracks = window.syAuth.shuffleTracks(tracks);
        setQueue(shuffledTracks, 'playlist', 0);
        renderQueue(tracks, playlist.name);
        switchView("view-player");
    } else {
        showToast("No se pudieron cargar las canciones de la playlist.", true);
    }
}

/**
 * Elimina una canción de una playlist.
 * @param {string} playlistId - ID de la playlist.
 * @param {string} trackId - ID de la canción.
 */
async function removeFromPlaylist(playlistId, trackId) {
    await window.syAuth.removeSongFromPlaylist(playlistId, trackId);
    showToast("Canción eliminada de la playlist.");
}

/**
 * Renombra una canción en la playlist.
 * @param {string} playlistId - ID de la playlist.
 * @param {string} trackId - ID de la canción.
 */
async function renameTrackInPlaylist(playlistId, trackId) {
    const newName = prompt("Ingresa el nuevo nombre para la canción:");
    if (newName) {
        await window.syAuth.renameTrackInPlaylist(playlistId, trackId, newName);
        showToast("Canción renombrada.");
    }
}

/**
 * Reasigna la fuente de una canción.
 * @param {string} playlistId - ID de la playlist.
 * @param {string} trackId - ID de la canción.
 */
async function reassignTrackSource(playlistId, trackId) {
    const newSource = prompt("Ingresa el ID del nuevo video de YouTube:");
    if (newSource) {
        await window.syAuth.reassignTrackSource(playlistId, trackId, newSource);
        showToast("Fuente reasignada.");
    }
}
