// Contiene la inicialización de Firebase y toda la lógica de Firestore.

let db;
let communityPlaylists = [];
let resolverJobUnsubscribe = null;

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
    serverTimestamp: f.serverTimestamp || window.serverTimestamp
  };
}

/**
 * Inicializa la aplicación de Firebase y establece el listener principal para las playlists.
 */
async function initFirebase() {
    const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
    const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
    
    window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc };
    
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

    checkForActiveImportJob();
}

/**
 * Cambia el estado de privacidad (pública/privada) de una playlist.
 * @param {string} playlistId - El ID de la playlist.
 * @param {boolean} isPublic - El nuevo estado de privacidad.
 */
async function handlePrivacyToggle(playlistId, isPublic) {
    try {
        const { doc, updateDoc } = window.firebase;
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
        const { collection, addDoc, serverTimestamp } = window.firebase;
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
        delete newPlaylistData.status;
        delete newPlaylistData.resolvedCount;
        
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
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), {
            name, creator, tracks: [], updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder'
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
        const { collection, addDoc, serverTimestamp } = window.firebase;
        const docRef = await addDoc(collection(db, "playlists"), {
            name, creator, tracks: [track], updatedAt: serverTimestamp(), isPublic: true, ownerUserId: 'current_user_id_placeholder'
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

    const { doc, updateDoc, serverTimestamp } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    
    const updatedTracks = [...pl.tracks];
    if (!updatedTracks.some(t => t.id === track.id)) { updatedTracks.unshift(track); }
    
    const spotifyTracks = pl.spotifyTracks ? [...pl.spotifyTracks] : [];
    if (pl.source === 'spotify' && !spotifyTracks.some(t => t.id === track.originalId)) {
        spotifyTracks.unshift({ id: track.originalId || track.id, title: track.title, author: track.author, thumb: track.thumb, source: 'spotify' });
    }

    try {
        await updateDoc(plRef, { tracks: updatedTracks, spotifyTracks, updatedAt: serverTimestamp() });
        return true;
    } catch(e) {
        console.error("Error adding song: ", e);
        showToast("No se pudo agregar la canción.", true);
        return false;
    }
}


// --- Funciones del Resolver de Spotify ---
async function checkForActiveImportJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;

    try {
        const { jobId, playlistId } = JSON.parse(activeJobInfo);
        if (!jobId) {
            localStorage.removeItem('sy_active_import_job');
            return;
        }
        console.log(`Resuming listener for job: ${jobId}`);
        viewingPlaylistId = playlistId;
        const { doc, onSnapshot } = window.firebase;
        const jobRef = doc(db, "resolverJobs", jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();

        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists()) {
                hideResolverModal();
                return;
            }
            const job = { id: docSnap.id, ...docSnap.data() };
            updateResolverModal(job);
            if (['canceled', 'done', 'error'].includes(job.status)) {
                hideResolverModal();
            }
        });
    } catch (e) {
        console.error("Failed to parse or resume active job:", e);
        localStorage.removeItem('sy_active_import_job');
    }
}

async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) { console.error("Playlist not found for resolver job:", playlistId); return; }
    const playlist = { id: plDoc.id, ...plDoc.data() };

    let jobId = playlist.resolverJobId;
    const jobDoc = jobId ? await getDoc(doc(db, "resolverJobs", jobId)) : null;
    
    if (jobDoc && jobDoc.exists()) {
        if (jobDoc.data().status === 'running') {
            localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
            return;
        }
    } else {
        jobId = `job_${playlistId}_${Date.now()}`;
        await updateDoc(plRef, { resolverJobId: jobId });
    }
    
    const jobRef = doc(db, "resolverJobs", jobId);
    const jobData = {
        playlistRef: plRef.path, status: 'queued', total: playlist.spotifyTracks.length,
        done: playlist.resolvedCount || 0, errors: [], lastUpdated: serverTimestamp()
    };
    await setDoc(jobRef, jobData, { merge: true });
    await updateDoc(jobRef, { status: 'running', lastUpdated: serverTimestamp() });
    await updateDoc(plRef, { status: 'resolving' });
    
    localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
    
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const job = { id: docSnap.id, ...docSnap.data() };
        updateResolverModal(job);
        if (['canceled', 'done', 'error'].includes(job.status)) hideResolverModal();
    });

    runJobBatch(playlistId, jobRef);
}

async function runJobBatch(playlistId, jobRef) {
    const { doc, getDoc, updateDoc, serverTimestamp } = window.firebase;
    const plRef = doc(db, "playlists", playlistId);
    
    const jobDoc = await getDoc(jobRef);
    if (!jobDoc.exists() || jobDoc.data().status !== 'running') {
        if (jobDoc.data()?.status !== 'canceled') hideResolverModal();
        return;
    }
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) return;

    const playlist = plDoc.data();
    const job = jobDoc.data();
    const BATCH_SIZE = 3;
    
    const tracksArray = playlist.tracks || Array(playlist.spotifyTracks.length).fill(null);
    const unresolvedIndices = [];
    for (let i = 0; i < tracksArray.length && unresolvedIndices.length < BATCH_SIZE; i++) {
        if (tracksArray[i] === null) unresolvedIndices.push(i);
    }
    
    if (unresolvedIndices.length === 0) {
        const finalStatus = playlist.resolvedCount === playlist.spotifyTracks.length ? 'resolved' : 'partial';
        await updateDoc(plRef, { status: finalStatus });
        await updateDoc(jobRef, { status: 'done', done: playlist.resolvedCount, lastUpdated: serverTimestamp() });
        showToast(finalStatus === 'resolved' ? `Importación completa: ${playlist.name}` : `Importación incompleta: ${playlist.resolvedCount} de ${playlist.spotifyTracks.length} resueltos.`, finalStatus === 'partial');
        return;
    }

    const tracksToProcess = unresolvedIndices.map(index => playlist.spotifyTracks[index]);
    const results = await Promise.all(tracksToProcess.map(track => resolveTrack(track)));

    const currentPlDoc = await getDoc(plRef);
    const currentPlaylist = currentPlDoc.data();
    let updatedTracks = [...(currentPlaylist.tracks || Array(currentPlaylist.spotifyTracks.length).fill(null))];
    let errorsInBatch = [];

    results.forEach((result, i) => {
        const originalIndex = unresolvedIndices[i];
        if (result.videoId) {
            const spotifyTrack = playlist.spotifyTracks[originalIndex];
            updatedTracks[originalIndex] = {
                id: result.videoId, title: spotifyTrack.title, author: spotifyTrack.author,
                thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`,
                source: 'youtube', originalId: spotifyTrack.spotifyId 
            };
        } else if (result.error) {
            errorsInBatch.push(`Track ${originalIndex}: ${result.error}`);
        }
    });
    
    const newResolvedCount = updatedTracks.filter(t => t && t.id).length;
    await updateDoc(plRef, { tracks: updatedTracks, resolvedCount: newResolvedCount });
    await updateDoc(jobRef, { 
        done: newResolvedCount, lastUpdated: serverTimestamp(),
        errors: [...(job.errors || []), ...errorsInBatch]
    });

    setTimeout(() => runJobBatch(playlistId, jobRef), 1000);
}

async function cancelResolverJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;
    
    try {
        const { playlistId, jobId } = JSON.parse(activeJobInfo);
        const { doc, updateDoc, serverTimestamp } = window.firebase;
        const jobRef = doc(db, "resolverJobs", jobId);
        const plRef = doc(db, "playlists", playlistId);
        
        await updateDoc(jobRef, { status: 'canceled', lastUpdated: serverTimestamp() });
        await updateDoc(plRef, { status: 'partial' });
        
        showToast("Importación cancelada.", true);
        hideResolverModal();
    } catch(e) {
        console.error("Error cancelling job:", e);
        hideResolverModal();
    }
}

// --- Funciones para Transmisiones ---
const SESSIONS_COLLECTION = "sessions";

async function createLiveSession(name, genre) {
    const { addDoc, collection, serverTimestamp } = sy_fs();
    const docRef = await addDoc(collection(db, SESSIONS_COLLECTION), {
        name,
        genre,
        status: "active",
        currentTrack: null,
        isPlaying: false,
        currentTime: 0, // Tiempo actual de la canción
        stateChangeTimestamp: null, // Momento del último cambio de estado
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
