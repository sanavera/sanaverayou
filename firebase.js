// Contiene la inicialización de Firebase y toda la lógica de Auth y Firestore.

// --- Instancias de Firebase ---
let db;
let auth;
let currentUser = null; // Almacena el objeto de usuario actual o null si es invitado

// --- Datos en memoria ---
let communityPlaylists = []; // Playlists públicas de la comunidad
let userPlaylists = []; // Playlists del usuario logueado
let resolverJobUnsubscribe = null;
let userPlaylistsUnsubscribe = null; // Para desuscribirse de las playlists del usuario al cerrar sesión

// --- Helpers para Local Storage (usado por invitados) ---
const LS_USER_PLAYLISTS = "sy_user_playlists_v2";
function getGuestPlaylists() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLISTS) || "[]"); } catch { return []; } }
function saveGuestPlaylists(playlists) { localStorage.setItem(LS_USER_PLAYLISTS, JSON.stringify(playlists)); }
function isMyPlaylist(playlist) {
    if (currentUser) {
        return playlist.ownerId === currentUser.uid;
    } else {
        // Para invitados, la comprobación se hará en playlists.js comparando con las playlists en memoria.
        const guestPlaylists = getGuestPlaylists();
        return guestPlaylists.some(p => p.id === playlist.id);
    }
}


/**
 * Proporciona acceso unificado a las funciones de Firebase.
 * @returns {object} - Objeto con instancias de funciones.
 */
function sy_fs() {
  const f = (window.firebase || {});
  return {
    db, auth, currentUser,
    doc: f.doc, updateDoc: f.updateDoc, setDoc: f.setDoc, deleteDoc: f.deleteDoc,
    addDoc: f.addDoc, collection: f.collection, query: f.query, where: f.where,
    onSnapshot: f.onSnapshot, getDocs: f.getDocs, serverTimestamp: f.serverTimestamp,
    // Auth
    createUserWithEmailAndPassword: f.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: f.signInWithEmailAndPassword,
    signOut: f.signOut
  };
}


// --- Lógica de Autenticación ---

async function registerUser(email, password) {
    try {
        await sy_fs().createUserWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

async function loginUser(email, password) {
    try {
        await sy_fs().signInWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

async function logoutUser() {
    try {
        await sy_fs().signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}


/**
 * Inicializa la aplicación de Firebase y establece los listeners principales.
 */
async function initFirebase() {
    const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
    
    // --- Importaciones Modulares ---
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
    const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
    const { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js");

    window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut };
    
    // --- Inicialización ---
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    // --- Listener de Playlists Públicas (para el Home) ---
    onSnapshot(query(collection(db, "playlists"), where("isPublic", "==", true), orderBy("updatedAt", "desc")), (snapshot) => {
        communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAllHomePlaylists();
    });

    // --- Listener de Estado de Autenticación ---
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateUserUI(user); // Actualiza la UI del menú de usuario

        if (user) {
            // Usuario está logueado
            console.log("Usuario conectado:", user.uid);
            await syncLocalDataToFirestore();
            loadUserFavorites(); 
            listenToUserPlaylists();
        } else {
            // Usuario es invitado o cerró sesión
            console.log("Modo invitado activo.");
            if (userPlaylistsUnsubscribe) userPlaylistsUnsubscribe(); // Deja de escuchar playlists anteriores
            userPlaylists = [];
            loadGuestData(); // Carga favs y playlists de localStorage
        }
    });

    checkForActiveImportJob();
}

/**
 * Migra los datos de localStorage a Firestore cuando un usuario inicia sesión.
 */
async function syncLocalDataToFirestore() {
    if (!currentUser) return;

    const guestFavs = getGuestFavorites();
    if (guestFavs.length > 0) {
        await saveFavorites(guestFavs);
        localStorage.removeItem("sy_favorites_v2");
        showToast(`${guestFavs.length} favoritos sincronizados.`);
    }

    const guestPlaylists = getGuestPlaylists();
    if (guestPlaylists.length > 0) {
        for (const pl of guestPlaylists) {
            const newPlaylistData = {
                ...pl,
                ownerId: currentUser.uid,
                isPublic: false, // Las playlists importadas son privadas por defecto
                createdAt: sy_fs().serverTimestamp(),
                updatedAt: sy_fs().serverTimestamp()
            };
            delete newPlaylistData.id; // Firestore generará un nuevo ID
            await sy_fs().addDoc(collection(db, "playlists"), newPlaylistData);
        }
        localStorage.removeItem(LS_USER_PLAYLISTS);
        showToast(`${guestPlaylists.length} playlists sincronizadas.`);
    }
}


/**
 * Carga los datos locales para el usuario invitado.
 */
function loadGuestData() {
    loadGuestFavorites();
    userPlaylists = getGuestPlaylists();
    renderPlaylists(); 
}

/**
 * Escucha en tiempo real las playlists del usuario logueado.
 */
function listenToUserPlaylists() {
    if (!currentUser) return;
    if (userPlaylistsUnsubscribe) userPlaylistsUnsubscribe();

    const q = query(collection(db, "playlists"), where("ownerId", "==", currentUser.uid), orderBy("updatedAt", "desc"));
    
    userPlaylistsUnsubscribe = onSnapshot(q, (snapshot) => {
        const oldPlaylists = new Map(userPlaylists.map(p => [p.id, p]));
        userPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        userPlaylists.forEach(newPl => {
            const oldPl = oldPlaylists.get(newPl.id);
            const playlistWasUpdated = oldPl && newPl.updatedAt && oldPl.updatedAt && newPl.updatedAt.seconds > oldPl.updatedAt.seconds;
            
            if (playlistWasUpdated && viewingPlaylistId === newPl.id && queueType === 'playlist') {
                handleRealtimeUpdate(newPl);
            }
        });

        renderPlaylists();
    });
}


/**
 * Cambia el estado de privacidad (pública/privada) de una playlist.
 * @param {string} playlistId - El ID de la playlist.
 * @param {boolean} isPublic - El nuevo estado de privacidad.
 */
async function handlePrivacyToggle(playlistId, isPublic) {
    if (!currentUser) {
        showToast("Debes iniciar sesión para hacer una playlist pública.", true);
        // Revertir el switch visualmente
        const input = document.querySelector(`.pl-item[data-pl-id="${playlistId}"] .pl-privacy-toggle input`);
        if(input) input.checked = !isPublic;
        return;
    }
    try {
        await sy_fs().updateDoc(doc(db, "playlists", playlistId), { isPublic });
        showToast(`Playlist ahora es ${isPublic ? 'pública' : 'privada'}.`);
    } catch(e) {
        console.error("Error updating privacy:", e);
        showToast("No se pudo cambiar la privacidad.", true);
    }
}


/**
 * Guarda una copia de una playlist pública en las playlists del usuario.
 * @param {object} originalPlaylist - La playlist original a copiar.
 */
async function savePlaylistCopy(originalPlaylist) {
    if (!currentUser) {
        showToast("Inicia sesión para guardar una copia.", true);
        return;
    }

    let creator = currentUser.displayName || currentUser.email.split('@')[0];

    showToast(`Guardando copia de "${originalPlaylist.name}"...`);
    try {
        const newPlaylistData = {
            ...originalPlaylist,
            name: `${originalPlaylist.name} (Copia)`,
            creator: creator,
            isPublic: false,
            updatedAt: sy_fs().serverTimestamp(),
            createdAt: sy_fs().serverTimestamp(),
            originalOwnerId: originalPlaylist.ownerId || null,
            ownerId: currentUser.uid,
        };
        delete newPlaylistData.id;
        delete newPlaylistData.resolverJobId;
        
        await sy_fs().addDoc(collection(db, "playlists"), newPlaylistData);
        showToast("Copia guardada en tus playlists.");
    } catch (e) {
        console.error("Error saving copy:", e);
        showToast("No se pudo guardar la copia.", true);
    }
}


// Todas las demás funciones como createNewPlaylist, addSongToPlaylist, etc.,
// se moverán a `playlists.js` y `favoritos.js` para usar `sy_fs()` y determinar
// si deben operar en Firestore (si `currentUser` existe) o en localStorage.

// El resto de las funciones de `firebase.js` relacionadas con el resolver de Spotify,
// las transmisiones, etc., se mantienen sin cambios significativos en su lógica interna,
// ya que operan sobre colecciones públicas de Firestore.

// --- (El resto de funciones como handleRealtimeUpdate, resolver, transmisiones, etc. se mantienen aquí) ---

function handleRealtimeUpdate(newPlaylist) {
    if (!newPlaylist || typeof renderQueue !== 'function') return;
    const tracksToShow = newPlaylist.spotifyTracks 
        ? newPlaylist.spotifyTracks.map((spotifyTrack, index) => 
            (newPlaylist.tracks && newPlaylist.tracks[index]) 
                ? newPlaylist.tracks[index] 
                : { ...spotifyTrack, id: null, thumb: spotifyTrack.thumb || newPlaylist.cover }
          )
        : (newPlaylist.tracks || []);
    queue = tracksToShow.filter(t => t && t.id);
    renderQueue(tracksToShow, newPlaylist.name);
}

function showResolverModal(job, playlistName = 'Importando...', playlistCover = '') {
    const modal = document.getElementById('resolver-modal');
    if (!modal) return;
    document.getElementById('resolver-title').textContent = playlistName;
    document.getElementById('resolver-thumb').src = playlistCover;
    modal.classList.remove('hide');
    updateResolverModal(job);
}

function updateResolverModal(job) {
    const progress = (job.done / job.total) * 100;
    document.getElementById('resolver-progress').style.width = `${progress}%`;
    document.getElementById('resolver-progress-text').textContent = `${job.done} / ${job.total}`;
}

function hideResolverModal() {
    const modal = document.getElementById('resolver-modal');
    if (modal) modal.classList.add('hide');
    if (resolverJobUnsubscribe) {
        resolverJobUnsubscribe();
        resolverJobUnsubscribe = null;
    }
    localStorage.removeItem('sy_active_import_job');
}

async function checkForActiveImportJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;
    try {
        const { jobId, playlistId } = JSON.parse(activeJobInfo);
        const pl = communityPlaylists.find(p => p.id === playlistId) || userPlaylists.find(p => p.id === playlistId) || (await sy_fs().getDoc(doc(db, "playlists", playlistId))).data();
        if (!pl) { hideResolverModal(); return; }
        const jobRef = doc(db, "resolverJobs", jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();
        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) { hideResolverModal(); return; }
            const job = { id: docSnap.id, ...docSnap.data() };
            showResolverModal(job, pl.name, pl.cover);
        });
    } catch (e) {
        console.error("Failed to resume active job:", e);
        localStorage.removeItem('sy_active_import_job');
    }
}

async function startResolverJob(playlistId) {
    const plRef = doc(db, "playlists", playlistId);
    const plDoc = await sy_fs().getDoc(plRef);
    if (!plDoc.exists()) { console.error("Playlist not found for resolver job:", playlistId); return; }
    const playlist = { id: plDoc.id, ...plDoc.data() };
    showResolverModal({ done: 0, total: playlist.spotifyTracks.length }, playlist.name, playlist.cover);
    let jobId = playlist.resolverJobId;
    const jobDoc = jobId ? await sy_fs().getDoc(doc(db, "resolverJobs", jobId)) : null;
    if (!jobDoc || !jobDoc.exists() || jobDoc.data().status !== 'running') {
        jobId = `job_${playlistId}_${Date.now()}`;
        await sy_fs().updateDoc(plRef, { resolverJobId: jobId });
    }
    const jobRef = doc(db, "resolverJobs", jobId);
    await sy_fs().setDoc(jobRef, { playlistRef: plRef.path, status: 'queued', total: playlist.spotifyTracks.length, done: 0, errors: [], lastUpdated: sy_fs().serverTimestamp() }, { merge: true });
    await sy_fs().updateDoc(jobRef, { status: 'running', lastUpdated: sy_fs().serverTimestamp() });
    await sy_fs().updateDoc(plRef, { status: 'resolving' });
    localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
        if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) { hideResolverModal(); return; }
        const job = { id: docSnap.id, ...docSnap.data() };
        updateResolverModal(job);
    });
    document.getElementById('resolver-cancel')?.addEventListener('click', cancelResolverJob);
    runJobBatch(playlistId, jobRef);
}

async function runJobBatch(playlistId, jobRef) {
    const jobDoc = await sy_fs().getDoc(jobRef);
    if (!jobDoc.exists() || jobDoc.data().status !== 'running') {
        if (jobDoc.data()?.status !== 'canceled') hideResolverModal();
        return;
    }
    const plRef = doc(db, "playlists", playlistId);
    const plDoc = await sy_fs().getDoc(plRef);
    if (!plDoc.exists()) return;
    const playlist = plDoc.data();
    const job = jobDoc.data();
    const BATCH_SIZE = 1;
    const tracksArray = playlist.tracks || Array(playlist.spotifyTracks.length).fill(null);
    const unresolvedIndices = [];
    for (let i = 0; i < tracksArray.length && unresolvedIndices.length < BATCH_SIZE; i++) {
        if (tracksArray[i] === null) unresolvedIndices.push(i);
    }
    if (unresolvedIndices.length === 0) {
        const finalStatus = playlist.resolvedCount === playlist.spotifyTracks.length ? 'resolved' : 'partial';
        await sy_fs().updateDoc(plRef, { status: finalStatus });
        await sy_fs().updateDoc(jobRef, { status: 'done', done: playlist.resolvedCount, lastUpdated: sy_fs().serverTimestamp() });
        showToast(finalStatus === 'resolved' ? `Importación completa: ${playlist.name}` : `Importación incompleta: ${playlist.resolvedCount} de ${playlist.spotifyTracks.length} resueltos.`, finalStatus === 'partial');
        return;
    }
    const tracksToProcess = unresolvedIndices.map(index => playlist.spotifyTracks[index]);
    const results = await Promise.all(tracksToProcess.map(track => resolveTrack(track)));
    const currentPlDoc = await sy_fs().getDoc(plRef);
    const currentPlaylist = currentPlDoc.data();
    let updatedTracks = [...(currentPlaylist.tracks || Array(currentPlaylist.spotifyTracks.length).fill(null))];
    let errorsInBatch = [];
    results.forEach((result, i) => {
        const originalIndex = unresolvedIndices[i];
        const spotifyTrack = playlist.spotifyTracks[originalIndex];
        if (result.videoId) {
            updatedTracks[originalIndex] = { id: result.videoId, title: spotifyTrack.title, author: spotifyTrack.author, thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`, source: 'youtube', originalId: spotifyTrack.spotifyId, backupUrls: result.backups, reassignIndex: 0 };
        } else if (result.error) {
            errorsInBatch.push(`Track ${originalIndex}: ${result.error}`);
        }
    });
    const newResolvedCount = updatedTracks.filter(t => t && t.id).length;
    await sy_fs().updateDoc(plRef, { tracks: updatedTracks, resolvedCount: newResolvedCount });
    await sy_fs().updateDoc(jobRef, { done: newResolvedCount, lastUpdated: sy_fs().serverTimestamp(), errors: [...(job.errors || []), ...errorsInBatch] });
    setTimeout(() => runJobBatch(playlistId, jobRef), 1000);
}

async function cancelResolverJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;
    try {
        const { playlistId, jobId } = JSON.parse(activeJobInfo);
        const jobRef = doc(db, "resolverJobs", jobId);
        const plRef = doc(db, "playlists", playlistId);
        await sy_fs().updateDoc(jobRef, { status: 'canceled', lastUpdated: sy_fs().serverTimestamp() });
        await sy_fs().updateDoc(plRef, { status: 'partial' });
        showToast("Importación cancelada.", true);
        hideResolverModal();
    } catch(e) { console.error("Error cancelling job:", e); hideResolverModal(); }
}

const SESSIONS_COLLECTION = "sessions";
async function createLiveSession(name, genre) { const docRef = await sy_fs().addDoc(collection(db, SESSIONS_COLLECTION), { name, genre, status: "active", currentTrack: null, isPlaying: false, currentTime: 0, stateChangeTimestamp: null, createdAt: sy_fs().serverTimestamp(), lastSeen: sy_fs().serverTimestamp() }); return docRef.id; }
async function updateLiveSession(sessionId, data) { if (!sessionId) return; try { await sy_fs().updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data); } catch(e) { console.warn("Could not update session", e.message); } }
async function deleteLiveSession(sessionId) { if (!sessionId) return; await sy_fs().deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId)); }
function listenToSessionChanges(sessionId, callback) { return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => { callback(doc.data()); }); }
function listenForLiveSessions(callback) { const q = query(collection(db, SESSIONS_COLLECTION), where("status", "==", "active")); return onSnapshot(q, (snapshot) => { const now = Date.now(); const thirtySecondsAgo = now - 30000; const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(session => (session.lastSeen?.toDate().getTime() || 0) > thirtySecondsAgo); callback(sessions); }, (error) => { console.error("Error listening to live sessions:", error); callback([]); }); }
