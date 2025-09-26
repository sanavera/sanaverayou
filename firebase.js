// Contiene la inicialización de Firebase, autenticación y toda la lógica de Firestore.

// Se importan funciones de otros módulos para hacer las dependencias explícitas.
// Estos archivos también serán corregidos para exportar estas funciones.
import { renderPlaylists } from './playlists.js';
import { renderFavs } from './favoritos.js';
import { renderAllHomePlaylists, showToast, showResolverModal, hideResolverModal, updateResolverModal, updateUIAfterAuthStateChange } from './main.js';
import { refreshIndicators } from './reproductor.js';
import { resolveTrack } from './buscador.js';


// --- Instancias de Firebase (se inicializarán en initFirebase) ---
let app;
let auth;
let db;

// --- Estado de la aplicación ---
export let currentUser = null;
export let communityPlaylists = []; // Todas las playlists (públicas y del usuario)
export let userPlaylists = []; // Playlists del usuario logueado
export let userFavorites = []; // Favoritos del usuario logueado
let unsubscribePlaylists = null; // Para detener la escucha de playlists
let unsubscribeFavorites = null; // Para detener la escucha de favoritos
let resolverJobUnsubscribe = null;

// --- Constantes de Colecciones ---
const PLAYLISTS_COLLECTION = "playlists";
const USERS_COLLECTION = "users";
const FAVORITES_SUBCOLLECTION = "favorites";
const SESSIONS_COLLECTION = "sessions";
const RESOLVER_JOBS_COLLECTION = "resolverJobs";


/**
 * Proporciona acceso unificado a las funciones de Firebase.
 * @returns {object} - Objeto con instancias de funciones de Firebase.
 */
export function sy_services() {
    return {
        // App y Auth
        initializeApp: window.initializeApp,
        getAuth: window.firebaseAuth.getAuth,
        createUserWithEmailAndPassword: window.firebaseAuth.createUserWithEmailAndPassword,
        signInWithEmailAndPassword: window.firebaseAuth.signInWithEmailAndPassword,
        signOut: window.firebaseAuth.signOut,
        onAuthStateChanged: window.firebaseAuth.onAuthStateChanged,
        updateProfile: window.firebaseAuth.updateProfile,
        // Firestore
        getFirestore: window.firebaseFirestore.getFirestore,
        doc: window.firebaseFirestore.doc,
        setDoc: window.firebaseFirestore.setDoc,
        getDoc: window.firebaseFirestore.getDoc,
        getDocs: window.firebaseFirestore.getDocs,
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
            currentUser = { uid: user.uid, email: user.email, displayName: user.displayName };
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

// =======================================================
// LÓGICA DE AUTENTICACIÓN
// =======================================================
export async function registerUser(name, email, password) {
    const { createUserWithEmailAndPassword, updateProfile } = sy_services();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    return userCredential.user;
}

export async function loginUser(email, password) {
    const { signInWithEmailAndPassword } = sy_services();
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

export async function logoutUser() {
    const { signOut } = sy_services();
    await signOut(auth);
}


/**
 * Carga los datos para un usuario logueado (playlists y favoritos desde Firestore).
 * @param {string} userId - El ID del usuario.
 */
function loadUserData(userId) {
    if (unsubscribePlaylists) unsubscribePlaylists();
    if (unsubscribeFavorites) unsubscribeFavorites();

    const { collection, query, onSnapshot, doc, orderBy } = sy_services();

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
    
    loadFavsFromLocalStorage();
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
        const { collection, addDoc, deleteDoc, query, where, getDocs } = sy_services();
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
                const { firestoreId, ...trackToSave } = track; // Evita guardar el ID de firestore en el documento
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
        userFavorites = localFavs; // Actualiza el estado local
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
    if (!currentUser) {
        showToast("Registrate para crear y guardar playlists en la nube.", true);
        return false;
    }
    if (!name || !creator) {
        showToast("Por favor, completa nombre de playlist y creador.", true);
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

export async function createNewPlaylistFromSong(name, creator, track) {
    if (!currentUser) {
        showToast("Inicia sesión para crear playlists.", true);
        return false;
    }
    try {
        const { collection, addDoc, serverTimestamp } = sy_services();
        await addDoc(collection(db, PLAYLISTS_COLLECTION), {
            name, creator, tracks: [track], trackCount: 1, 
            updatedAt: serverTimestamp(), isPublic: false, ownerUserId: currentUser.uid
        });
        return true;
    } catch (e) {
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}


// =======================================================
// IMPORTADOR SPOTIFY Y RESOLVER
// =======================================================
export async function processAndSavePlaylist(pl) {
    if (!currentUser) {
        showToast("Debes iniciar sesión para importar playlists de Spotify.", true);
        return;
    }
    const { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } = sy_services();
    const col = collection(db, PLAYLISTS_COLLECTION);
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    
    const playlistData = {
        name: pl.name, creator: pl.creator, cover: pl.cover || null,
        spotifyTracks: pl.spotifyTracks, trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null), status: 'unresolved',
        resolvedCount: 0, updatedAt: serverTimestamp(), source: 'spotify', 
        spotifyId: pl.spotifyId, ownerUserId: currentUser.uid, isPublic: false
    };

    if (snapshot.empty) {
        const docRef = await addDoc(col, playlistData);
        startResolverJob(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, PLAYLISTS_COLLECTION, docId), playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
        startResolverJob(docId);
    }
}

export async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = sy_services();
    const plRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    
    const plDoc = await getDoc(plRef);
    if (!plDoc.exists()) { console.error("Playlist not found for resolver job:", playlistId); return; }
    const playlist = { id: plDoc.id, ...plDoc.data() };

    showResolverModal({ done: 0, total: playlist.spotifyTracks.length }, playlist.name, playlist.cover);

    let jobId = playlist.resolverJobId;
    const jobRef = doc(db, RESOLVER_JOBS_COLLECTION, jobId || `job_${playlistId}`);
    
    if(!jobId) {
        jobId = jobRef.id;
        await updateDoc(plRef, { resolverJobId: jobId });
    }
    
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
            if(resolverJobUnsubscribe) resolverJobUnsubscribe();
            localStorage.removeItem('sy_active_import_job');
            return;
        }
        const job = { id: docSnap.id, ...docSnap.data() };
        updateResolverModal(job);
    });

    document.getElementById('resolver-cancel')?.addEventListener('click', cancelResolverJob);

    runJobBatch(playlistId, jobRef);
}

export async function runJobBatch(playlistId, jobRef) {
    const { doc, getDoc, updateDoc, serverTimestamp } = sy_services();
    const plRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    
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
    for (let i = job.done || 0; i < tracksArray.length && unresolvedIndices.length < BATCH_SIZE; i++) {
        if (tracksArray[i] === null) unresolvedIndices.push(i);
    }
    
    if (unresolvedIndices.length === 0) {
        const resolvedCount = tracksArray.filter(t => t !== null).length;
        const finalStatus = (resolvedCount === playlist.spotifyTracks.length) ? 'resolved' : 'partial';
        await updateDoc(plRef, { status: finalStatus, resolvedCount });
        await updateDoc(jobRef, { status: 'done', done: resolvedCount, lastUpdated: serverTimestamp() });
        showToast(finalStatus === 'resolved' ? `Importación completa: ${playlist.name}` : `Importación incompleta: ${resolvedCount} de ${playlist.spotifyTracks.length} resueltos.`, finalStatus === 'partial');
        return;
    }

    const tracksToProcess = unresolvedIndices.map(index => playlist.spotifyTracks[index]);
    const results = await Promise.all(tracksToProcess.map(track => resolveTrack(track)));

    const currentPlDoc = await getDoc(plRef);
    const currentPlaylist = currentPlDoc.data();
    let updatedTracks = [...(currentPlaylist.tracks || Array(currentPlaylist.spotifyTracks.length).fill(null))];
    let errorsInBatch = job.errors || [];

    results.forEach((result, i) => {
        const originalIndex = unresolvedIndices[i];
        const spotifyTrack = playlist.spotifyTracks[originalIndex];
        if (result.videoId) {
            updatedTracks[originalIndex] = {
                id: result.videoId, title: spotifyTrack.title, author: spotifyTrack.author,
                thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`,
                source: 'youtube', originalId: spotifyTrack.spotifyId
            };
        } else if (result.error) {
            errorsInBatch.push(`Track ${originalIndex}: ${result.error}`);
        }
    });
    
    const newResolvedCount = updatedTracks.filter(t => t !== null).length;
    await updateDoc(plRef, { tracks: updatedTracks, resolvedCount: newResolvedCount });
    await updateDoc(jobRef, { 
        done: newResolvedCount, lastUpdated: serverTimestamp(),
        errors: errorsInBatch
    });

    setTimeout(() => runJobBatch(playlistId, jobRef), 1000);
}

export async function cancelResolverJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;
    
    try {
        const { playlistId, jobId } = JSON.parse(activeJobInfo);
        const { doc, updateDoc, serverTimestamp } = sy_services();
        const jobRef = doc(db, RESOLVER_JOBS_COLLECTION, jobId);
        const plRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
        
        await updateDoc(jobRef, { status: 'canceled', lastUpdated: serverTimestamp() });
        await updateDoc(plRef, { status: 'partial' });
        
        showToast("Importación cancelada.", true);
        hideResolverModal();
    } catch(e) {
        console.error("Error cancelling job:", e);
        hideResolverModal();
    }
}
export async function checkForActiveImportJob() {
    const activeJobInfo = localStorage.getItem('sy_active_import_job');
    if (!activeJobInfo) return;

    try {
        const { jobId, playlistId } = JSON.parse(activeJobInfo);
        const { doc, onSnapshot, getDoc } = sy_services();

        const plDoc = await getDoc(doc(db, PLAYLISTS_COLLECTION, playlistId));
        if (!plDoc.exists()) {
            hideResolverModal();
            return;
        }
        const pl = plDoc.data();

        const jobRef = doc(db, RESOLVER_JOBS_COLLECTION, jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();

        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) {
                hideResolverModal();
                if(resolverJobUnsubscribe) resolverJobUnsubscribe();
                localStorage.removeItem('sy_active_import_job');
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


// =======================================================
// TRANSMISIONES EN VIVO
// =======================================================

export async function createLiveSession(name, genre) {
    const { addDoc, collection, serverTimestamp } = sy_services();
    const sessionRef = await addDoc(collection(db, SESSIONS_COLLECTION), {
        name, genre,
        ownerId: currentUser.uid,
        ownerName: currentUser.displayName || currentUser.email,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        status: 'active',
        currentTrack: null,
        isPlaying: false
    });
    return sessionRef.id;
}

export async function updateLiveSession(sessionId, data) {
    const { doc, updateDoc } = sy_services();
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
}

export async function deleteLiveSession(sessionId) {
    const { doc, deleteDoc } = sy_services();
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
}

export function listenToSessionChanges(sessionId, callback) {
    const { doc, onSnapshot } = sy_services();
    return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => {
        callback(doc.data());
    });
}

export function listenForLiveSessions(callback) {
    const { collection, query, where, onSnapshot } = sy_services();
    const q = query(collection(db, SESSIONS_COLLECTION), where("status", "==", "active"));
    return onSnapshot(q, (snapshot) => {
        const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(sessions);
    });
}
