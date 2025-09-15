// Contiene la inicialización de Firebase y toda la lógica de Firestore.

let db;
let communityPlaylists = [];
let resolverJobUnsubscribe = null; // Declaración ÚNICA de la variable.

// --- Helpers para IDs de playlists del usuario en Local Storage ---
const LS_USER_PLAYLIST_IDS = "sy_user_playlist_ids_v1";
function getMyPlaylistIds() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]"); } catch { return []; } }
function addMyPlaylistId(id) { const ids = getMyPlaylistIds(); if (!ids.includes(id)) { ids.push(id); localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids)); } }
function removeMyPlaylistId(id) { let ids = getMyPlaylistIds(); ids = ids.filter(pid => pid !== id); localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids)); }
function isMyPlaylist(id) { return getMyPlaylistIds().includes(id); }

/**
 * Proporciona acceso unificado a las funciones de Firestore.
 * @returns {object} - Objeto con instancias de funciones de Firestore.
 */
function sy_fs() {
  const f = (window.firebase || {});
  return {
    db: (typeof db !== 'undefined' ? db : window.db),
    doc: f.doc || window.doc,
    updateDoc: f.updateDoc || window.updateDoc,
    setDoc: f.setDoc || window.setDoc,
    deleteDoc: f.deleteDoc || window.deleteDoc,
    addDoc: f.addDoc || window.addDoc,
    collection: f.collection || window.collection,
    query: f.query || window.query,
    where: f.where || window.where,
    onSnapshot: f.onSnapshot || window.onSnapshot,
    getDocs: f.getDocs || window.getDocs,
    getDoc: f.getDoc || window.getDoc,
    serverTimestamp: f.serverTimestamp || window.serverTimestamp,
    increment: f.increment || window.increment,
  };
}


/**
 * Maneja la actualización en tiempo real de la playlist que se está viendo.
 * Se llama cuando Firestore detecta un cambio (ej: se encontró una nueva canción).
 * @param {object} newPlaylist - El objeto de la playlist actualizado desde Firestore.
 */
function handleRealtimeUpdate(newPlaylist) {
    if (!newPlaylist || typeof renderQueue !== 'function') return;

    // Reconstruye la lista visual combinando los tracks originales de Spotify
    // con los que ya se encontraron, para mostrar el estado actual completo.
    const tracksToShow = newPlaylist.spotifyTracks 
        ? newPlaylist.spotifyTracks.map((spotifyTrack, index) => {
            const resolvedTrack = (newPlaylist.tracks && newPlaylist.tracks[index]) ? newPlaylist.tracks[index] : null;
            return resolvedTrack ? { ...spotifyTrack, ...resolvedTrack } : { ...spotifyTrack, id: null, thumb: spotifyTrack.thumb || newPlaylist.cover };
          })
        : (newPlaylist.tracks || []).filter(Boolean);

    // Actualiza la cola de reproducción real (solo con canciones encontradas)
    const currentPlayingTrackId = currentTrack ? currentTrack.id : null;
    queue = tracksToShow.filter(t => t && t.id);

    // Si la canción que estaba sonando sigue en la cola, mantenla. Si no, no hagas nada.
    const newCurrentTrackIndex = queue.findIndex(t => t.id === currentPlayingTrackId);
    if(newCurrentTrackIndex === -1 && isPlaying) {
        // La canción que sonaba ya no está, pero por ahora solo actualizamos la UI.
    } else {
        currentIndex = newCurrentTrackIndex;
    }

    // Vuelve a renderizar la lista de canciones en la interfaz del reproductor.
    renderQueue(tracksToShow, newPlaylist.name);
}


/**
 * Inicializa la aplicación de Firebase y establece el listener principal para las playlists.
 */
async function initFirebase() {
    const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
    const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, increment } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
    
    window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, increment };
    
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
        const oldPlaylists = new Map(communityPlaylists.map(p => [p.id, p]));
        communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        communityPlaylists.forEach(newPl => {
            const oldPl = oldPlaylists.get(newPl.id);
            const playlistWasUpdated = oldPl && newPl.updatedAt && oldPl.updatedAt && newPl.updatedAt.seconds > oldPl.updatedAt.seconds;
            
            if (playlistWasUpdated && viewingPlaylistId === newPl.id && queueType === 'playlist') {
                handleRealtimeUpdate(newPl);
            }
        });

        renderPlaylists(); 
        renderAllHomePlaylists();
    });
}

/**
 * Cambia el estado de privacidad (pública/privada) de una playlist.
 * @param {string} playlistId - El ID de la playlist.
 * @param {boolean} isPublic - El nuevo estado de privacidad.
 */
async function handlePrivacyToggle(playlistId, isPublic) {
    try {
        const { doc, updateDoc } = sy_fs();
        await updateDoc(doc(db, "playlists", playlistId), { isPublic });
    } catch(e) {
        console.error("Error updating privacy:", e);
    }
}

/**
 * Guarda una copia de una playlist pública en las playlists del usuario.
 * @param {object} originalPlaylist - La playlist original a copiar.
 */
async function savePlaylistCopy(originalPlaylist) {
    let creator = localStorage.getItem('sy_creator_name');
    if (!creator) {
        creator = prompt("Para guardar una copia, ingresá tu nombre de creador:")?.trim();
        if (!creator) return;
        localStorage.setItem('sy_creator_name', creator);
    }
    showToast(`Guardando copia de "${originalPlaylist.name}"...`);
    try {
        const { collection, addDoc, serverTimestamp } = sy_fs();
        const newPlaylistData = {
            ...originalPlaylist,
            name: `${originalPlaylist.name} (Copia)`,
            creator: creator,
            isPublic: false,
            updatedAt: serverTimestamp(),
            originalOwnerId: originalPlaylist.ownerUserId || null,
            ownerUserId: 'current_user_id', // Placeholder
        };
        delete newPlaylistData.id;
        delete newPlaylistData.resolverJobId;
        
        const docRef = await addDoc(collection(db, "playlists"), newPlaylistData);
        addMyPlaylistId(docRef.id);
        showToast("Copia guardada en tus playlists.");
    } catch (e) {
        console.error("Error saving copy:", e);
        showToast("No se pudo guardar la copia.", true);
    }
}

/**
 * Crea una nueva playlist vacía en Firestore.
 * @param {string} name - El nombre de la playlist.
 * @param {string} creator - El nombre del creador.
 * @returns {Promise<boolean>} - True si se creó con éxito, false en caso contrario.
 */
async function createNewPlaylist(name, creator) {
    if (!name || !creator) {
        showToast("Por favor, completa nombre de playlist y creador.", true);
        return false;
    }
    try {
        const { collection, addDoc, serverTimestamp } = sy_fs();
        const docRef = await addDoc(collection(db, "playlists"), {
            name, creator, tracks: [], trackCount: 0, updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder'
        });
        addMyPlaylistId(docRef.id);
        return true;
    } catch (e) {
        console.error("Error creating playlist: ", e);
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}

/**
 * Crea una nueva playlist a partir de una canción.
 * @param {string} name - Nombre de la nueva playlist.
 * @param {string} creator - Nombre del creador.
 * @param {object} track - La canción para agregar a la nueva playlist.
 * @returns {Promise<boolean>} - True si se creó con éxito.
 */
async function createNewPlaylistFromSong(name, creator, track) {
    try {
        const { collection, addDoc, serverTimestamp } = sy_fs();
        const docRef = await addDoc(collection(db, "playlists"), {
            name, creator, tracks: [track], trackCount: 1, updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder'
        });
        addMyPlaylistId(docRef.id);
        return true;
    } catch (e) {
        console.error("Error creating playlist from song: ", e);
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}

/**
 * Agrega una canción a una playlist existente.
 * @param {string} playlistId - ID de la playlist.
 * @param {object} track - La canción a agregar.
 * @returns {Promise<boolean>} - True si se agregó con éxito.
 */
async function addSongToPlaylist(playlistId, track) {
    const pl = communityPlaylists.find(p => p.id === playlistId);
    if (!pl) return false;

    const { doc, updateDoc, serverTimestamp } = sy_fs();
    const plRef = doc(db, "playlists", playlistId);
    
    // Evita agregar duplicados
    const trackExists = (pl.tracks || []).some(t => t && t.id === track.id);
    if (trackExists) {
        showToast("La canción ya está en la playlist.");
        return false;
    }

    const updatedTracks = [track, ...(pl.tracks || [])];

    try {
        await updateDoc(plRef, { 
            tracks: updatedTracks, 
            trackCount: updatedTracks.length, 
            updatedAt: serverTimestamp() 
        });
        return true;
    } catch(e) {
        console.error("Error adding song: ", e);
        showToast("No se pudo agregar la canción.", true);
        return false;
    }
}


// --- Funciones para Transmisiones (Sin cambios) ---
const SESSIONS_COLLECTION = "sessions";

async function createLiveSession(name, genre) {
    const { addDoc, collection, serverTimestamp } = sy_fs();
    const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), {
        name,
        genre,
        status: "active",
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        stateChangeTimestamp: null,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
    });
    return docRef.id;
}

async function updateLiveSession(sessionId, data) {
    if (!sessionId) return;
    const { doc, updateDoc } = sy_fs();
    try {
        await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
    } catch(e) {
        console.warn("Could not update session, it might have been deleted.", e.message);
    }
}

async function deleteLiveSession(sessionId) {
    if (!sessionId) return;
    const { doc, deleteDoc } = sy_fs();
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
}

function listenToSessionChanges(sessionId, callback) {
    const { doc, onSnapshot } = sy_fs();
    return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => {
        callback(doc.data());
    });
}

function listenForLiveSessions(callback) {
    const { collection, query, where, onSnapshot } = sy_fs();
    const q = query(collection(db, SESSIONS_COLLECTION), where("status", "==", "active"));
    
    return onSnapshot(q, (snapshot) => {
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;

        const sessions = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(session => {
                if (!session.lastSeen) return false;
                const lastSeenTime = session.lastSeen.toDate().getTime();
                return lastSeenTime > thirtySecondsAgo;
            });
            
        callback(sessions);
    }, (error) => {
        console.error("Error listening to live sessions:", error);
        callback([]);
    });
}
