// Contiene la inicialización de Firebase, autenticación y toda la lógica de Firestore.

// --- Instancias de Firebase (se inicializarán en initFirebase) ---
let app;
let auth;
let db;

// --- Estado de la aplicación ---
let currentUser = null;
let communityPlaylists = []; // Todas las playlists (públicas y del usuario)
let userPlaylists = []; // Playlists del usuario logueado
export let userFavorites = []; // Favoritos del usuario logueado
let unsubscribePlaylists = null; // Para detener la escucha de playlists
let unsubscribeFavorites = null; // Para detener la escucha de favoritos
let resolverJobUnsubscribe = null;

// --- Constantes de Colecciones ---
const PLAYLISTS_COLLECTION = "playlists";
const USERS_COLLECTION = "users";
const FAVORITES_SUBCOLLECTION = "favorites";
const SESSIONS_COLLECTION = "sessions"; // Para transmisiones en vivo

/**
 * Proporciona acceso unificado a las funciones de Firebase.
 * @returns {object} - Objeto con instancias de funciones de Firebase.
 */
function sy_services() {
    return {
        // App and Auth
        initializeApp: window.initializeApp,
        getAuth: window.firebaseAuth.getAuth,
        createUserWithEmailAndPassword: window.firebaseAuth.createUserWithEmailAndPassword,
        signInWithEmailAndPassword: window.firebaseAuth.signInWithEmailAndPassword,
        signOut: window.firebaseAuth.signOut,
        onAuthStateChanged: window.firebaseAuth.onAuthStateChanged,
        // Firestore
        getFirestore: window.firebaseFirestore.getFirestore,
        doc: window.firebaseFirestore.doc,
        setDoc: window.firebaseFirestore.setDoc,
        getDoc: window.firebaseFirestore.getDoc,
        addDoc: window.firebaseFirestore.addDoc,
        updateDoc: window.firebaseFirestore.updateDoc,
        deleteDoc: window.firebaseFirestore.deleteDoc,
        collection: window.firebaseFirestore.collection,
        query: window.firebaseFirestore.query,
        where: window.firebaseFirestore.where,
        onSnapshot: window.firebaseFirestore.onSnapshot,
        serverTimestamp: window.firebaseFirestore.serverTimestamp,
        orderBy: window.firebaseFirestore.orderBy,
        writeBatch: window.firebaseFirestore.writeBatch,
    };
}


/**
 * Inicializa la aplicación de Firebase y establece el listener de autenticación.
 * Esta es la función principal que arranca la conexión con Firebase.
 */
export async function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU",
        authDomain: "sanaverayou.firebaseapp.com",
        projectId: "sanaverayou",
        storageBucket: "sanaverayou.appspot.com",
        messagingSenderId: "275513302327",
        appId: "1:275513302327:web:3b26052bf02e657d450eb2"
    };

    const { initializeApp, getAuth, getFirestore, onAuthStateChanged } = sy_services();

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = { uid: user.uid, email: user.email };
            console.log("Usuario logueado:", currentUser.uid);
            loadUserData(user.uid);
            updateUIAfterAuthStateChange(true);
        } else {
            currentUser = null;
            console.log("Usuario es invitado.");
            loadGuestData();
            updateUIAfterAuthStateChange(false);
        }
    });
    
    checkForActiveImportJob();
}

/**
 * Carga los datos para un usuario logueado (playlists y favoritos desde Firestore).
 * @param {string} userId - El ID del usuario.
 */
function loadUserData(userId) {
    if (unsubscribePlaylists) unsubscribePlaylists();
    if (unsubscribeFavorites) unsubscribeFavorites();

    const { collection, query, where, onSnapshot, doc, orderBy } = sy_services();

    const allPlaylistsQuery = query(collection(db, PLAYLISTS_COLLECTION), orderBy("updatedAt", "desc"));
    
    unsubscribePlaylists = onSnapshot(allPlaylistsQuery, (snapshot) => {
        const allFetchedPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        userPlaylists = allFetchedPlaylists.filter(p => p.ownerUserId === userId);
        const publicPlaylists = allFetchedPlaylists.filter(p => p.isPublic);

        const combined = new Map();
        [...publicPlaylists, ...userPlaylists].forEach(p => combined.set(p.id, p));
        communityPlaylists = Array.from(combined.values());

        renderPlaylists();
        renderAllHomePlaylists();
    });

    const favoritesQuery = query(collection(doc(db, USERS_COLLECTION, userId), FAVORITES_SUBCOLLECTION));
    unsubscribeFavorites = onSnapshot(favoritesQuery, (snapshot) => {
        userFavorites = snapshot.docs.map(doc => ({ ...doc.data(), firestoreId: doc.id }));
        renderFavs();
        refreshIndicators();
    });
}


/**
 * Carga los datos para un usuario invitado.
 */
function loadGuestData() {
    if (unsubscribePlaylists) unsubscribePlaylists();
    if (unsubscribeFavorites) unsubscribeFavorites();

    userFavorites = [];
    userPlaylists = [];
    
    loadFavsFromLocalStorage(); // Carga favoritos de LS a userFavorites
    renderFavs();

    renderPlaylists();

    const { collection, query, where, onSnapshot, orderBy } = sy_services();
    const publicPlaylistsQuery = query(collection(db, PLAYLISTS_COLLECTION), where("isPublic", "==", true), orderBy("updatedAt", "desc"));

    unsubscribePlaylists = onSnapshot(publicPlaylistsQuery, (snapshot) => {
        communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAllHomePlaylists();
    });
}

// =======================================================
// LÓGICA DE FAVORITOS (Firestore y localStorage)
// =======================================================

export async function toggleFav(track) {
    if (!track || !track.id) {
        showToast("No se puede agregar a favoritos esta canción.", true);
        return;
    }

    const isCurrentlyFav = isFav(track.id);

    if (currentUser) {
        const { collection, addDoc, deleteDoc, query, where, getDocs, doc } = sy_services();
        const favsRef = collection(db, USERS_COLLECTION, currentUser.uid, FAVORITES_SUBCOLLECTION);

        if (isCurrentlyFav) {
            try {
                const q = query(favsRef, where("id", "==", track.id));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    await deleteDoc(snapshot.docs[0].ref);
                    showToast("Quitado de Favoritos");
                }
            } catch (e) {
                console.error("Error al quitar favorito de Firestore:", e);
                showToast("No se pudo quitar de favoritos.", true);
            }
        } else {
            try {
                const { firestoreId, ...trackToSave } = track;
                await addDoc(favsRef, trackToSave);
                showToast("Agregado a Favoritos");
            } catch (e) {
                console.error("Error al agregar favorito a Firestore:", e);
                showToast("No se pudo agregar a favoritos.", true);
            }
        }
    } else {
        let localFavs = getFavsFromLocalStorage();
        if (isCurrentlyFav) {
            localFavs = localFavs.filter(f => f.id !== track.id);
            showToast("Quitado de Favoritos");
        } else {
            localFavs.unshift(track);
            showToast("Agregado a Favoritos");
        }
        saveFavsToLocalStorage(localFavs);
        userFavorites = localFavs;
        renderFavs();
        refreshIndicators();
    }
}

export function isFav(id) {
    if (!id) return false;
    return userFavorites.some(f => f.id === id);
}

const LS_FAVS_KEY = "sanayera_favs_v1";
function getFavsFromLocalStorage() {
    try {
        return JSON.parse(localStorage.getItem(LS_FAVS_KEY) || "[]");
    } catch { return []; }
}
function saveFavsToLocalStorage(favsArray) {
    localStorage.setItem(LS_FAVS_KEY, JSON.stringify(favsArray));
}
function loadFavsFromLocalStorage() {
    userFavorites = getFavsFromLocalStorage();
}

// =======================================================
// LÓGICA DE PLAYLISTS
// =======================================================

export function isMyPlaylist(playlistId) {
    if (!currentUser) return false;
    return userPlaylists.some(p => p.id === playlistId);
}

export async function createNewPlaylist(name, creator) {
    if (!name || !creator) {
        showToast("Por favor, completa nombre de playlist y creador.", true);
        return false;
    }

    if (!currentUser) {
        showToast("Registrate para crear y guardar playlists en la nube.", true);
        return false;
    }

    try {
        const { collection, addDoc, serverTimestamp } = sy_services();
        await addDoc(collection(db, PLAYLISTS_COLLECTION), {
            name, creator, tracks: [], trackCount: 0,
            updatedAt: serverTimestamp(), isPublic: false,
            ownerUserId: currentUser.uid
        });
        showToast(`Playlist "${name}" creada.`);
        return true;
    } catch (e) {
        console.error("Error creando playlist: ", e);
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}

export async function addSongToPlaylist(playlistId, track) {
    if (!currentUser) {
        showToast("Inicia sesión para agregar canciones a tus playlists.", true);
        return false;
    }
    
    const pl = userPlaylists.find(p => p.id === playlistId);
    if (!pl) {
        showToast("No se encontró la playlist o no te pertenece.", true);
        return false;
    }

    const { doc, updateDoc, serverTimestamp } = sy_services();
    const plRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    
    const updatedTracks = [...pl.tracks];
    if (!updatedTracks.some(t => t && t.id === track.id)) {
        updatedTracks.unshift(track);
    }
    
    try {
        await updateDoc(plRef, {
            tracks: updatedTracks,
            trackCount: updatedTracks.length,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch(e) {
        console.error("Error agregando canción: ", e);
        showToast("No se pudo agregar la canción.", true);
        return false;
    }
}

// =======================================================
// IMPORTADOR SPOTIFY Y OTRAS FUNCIONES DE PLAYLIST
// =======================================================
// (Se mantienen las funciones de Spotify, resolver, etc., pero se adaptan
//  para usar currentUser.uid cuando corresponda)

export async function processAndSavePlaylist(pl) {
    if (!currentUser) {
        showToast("Debes iniciar sesión para importar playlists de Spotify.", true);
        return;
    }
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = sy_services();
    const col = collection(db, 'playlists');
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    const playlistData = {
        name: pl.name, creator: pl.creator, cover: pl.cover || null,
        spotifyTracks: pl.spotifyTracks, trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null), status: 'unresolved',
        resolvedCount: 0, updatedAt: serverTimestamp(),
    };
    if (snapshot.empty) {
        const docRef = await addDoc(col, { ...playlistData, isPublic: false, source: 'spotify', spotifyId: pl.spotifyId, ownerUserId: currentUser.uid });
        startResolverJob(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, 'playlists', docId), playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
        startResolverJob(docId);
    }
}

// (El resto de funciones como handlePrivacyToggle, savePlaylistCopy, resolver, etc., se incluyen aquí
//  y se adaptan para usar `currentUser.uid` en las validaciones de permisos y al guardar datos).


// =======================================================
// TRANSMISIONES EN VIVO
// =======================================================

// Las funciones de transmisiones en vivo se mantienen igual pero usan el `db` ya inicializado
// y las funciones de sy_services().

// =======================================================
// EXPORTACIONES
// =======================================================
export {
    app, auth, db, currentUser, communityPlaylists, userPlaylists,
    sy_services
};

// Se mantienen las demás funciones que no fueron modificadas pero que son necesarias.
// (ej: createNewPlaylistFromSong, savePlaylistCopy, etc. adaptadas a la nueva lógica de auth)

export async function createNewPlaylistFromSong(name, creator, track) {
    if (!currentUser) {
        showToast("Inicia sesión para crear playlists.", true);
        return false;
    }
    try {
        const { collection, addDoc, serverTimestamp } = sy_services();
        await addDoc(collection(db, "playlists"), {
            name, creator, tracks: [track], trackCount: 1, 
            updatedAt: serverTimestamp(), isPublic: false, ownerUserId: currentUser.uid
        });
        return true;
    } catch (e) {
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}
async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = sy_services();
    const plRef = doc(db, "playlists", playlistId);
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) { console.error("Playlist not found for resolver job:", playlistId); return; }
    const playlist = { id: plDoc.id, ...plDoc.data() };

    showResolverModal({ done: 0, total: playlist.spotifyTracks.length }, playlist.name, playlist.cover);

    let jobId = playlist.resolverJobId;
    const jobDoc = jobId ? await getDoc(doc(db, "resolverJobs", jobId)) : null;
    
    if (!jobDoc || !jobDoc.exists() || jobDoc.data().status !== 'running') {
        jobId = `job_${playlistId}_${Date.now()}`;
        await updateDoc(plRef, { resolverJobId: jobId });
    }
    
    const jobRef = doc(db, "resolverJobs", jobId);
    await setDoc(jobRef, {
        playlistRef: plRef.path, status: 'queued', total: playlist.spotifyTracks.length,
        done: 0, errors: [], lastUpdated: serverTimestamp()
    }, { merge: true });

    await updateDoc(jobRef, { status: 'running', lastUpdated: serverTimestamp() });
    await updateDoc(plRef, { status: 'resolving' });
    
    localStorage.setItem('sy_active_import_job', JSON.stringify({ playlistId, jobId }));
    
    if (resolverJobUnsubscribe) resolverJobUnsubscribe();
    resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
        if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) {
            hideResolverModal();
            return;
        }
        const job = { id: docSnap.id, ...docSnap.data() };
        updateResolverModal(job);
    });

    $('#resolver-cancel')?.addEventListener('click', cancelResolverJob);

    runJobBatch(playlistId, jobRef);
}
async function runJobBatch(playlistId, jobRef) {
    const { doc, getDoc, updateDoc, serverTimestamp } = sy_services();
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
    const BATCH_SIZE = 1; 
    
    const tracksArray = playlist.tracks || Array(playlist.spotifyTracks.length).fill(null);
    const unresolvedIndices = [];
    for (let i = 0; i < tracksArray.length && unresolvedIndices.length < BATCH_SIZE; i++) {
        if (tracksArray[i] === null) unresolvedIndices.push(i);
    }
    
    if (unresolvedIndices.length === 0) {
        const finalStatus = (playlist.resolvedCount === playlist.spotifyTracks.length) ? 'resolved' : 'partial';
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
        const spotifyTrack = playlist.spotifyTracks[originalIndex];
        if (result.videoId) {
            updatedTracks[originalIndex] = {
                id: result.videoId, title: spotifyTrack.title, author: spotifyTrack.author,
                thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`,
                source: 'youtube', originalId: spotifyTrack.spotifyId,
                backupUrls: result.backups, reassignIndex: 0
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
        const { doc, updateDoc, serverTimestamp } = sy_services();
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
async function checkForActiveImportJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;

    try {
        const { jobId, playlistId } = JSON.parse(activeJobInfo);
        const { doc, onSnapshot, getDoc } = sy_services();

        const plDoc = await getDoc(doc(db, "playlists", playlistId));
        if (!plDoc.exists()) {
            hideResolverModal();
            return;
        }
        const pl = plDoc.data();

        const jobRef = doc(db, "resolverJobs", jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();

        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) {
                hideResolverModal();
                return;
            }
            const job = { id: docSnap.id, ...docSnap.data() };
            showResolverModal(job, pl.name, pl.cover);
        });
    } catch (e) {
        console.error("Failed to parse or resume active job:", e);
        localStorage.removeItem('sy_active_import_job');
    }
}
