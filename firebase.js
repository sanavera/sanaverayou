import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Tu configuración de Firebase
const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };

let db;
let auth;
let Session = { status: "guest", uid: "", email: "", username: "" };
const sessionKey = "app_session";
let onAuthChangeCallback = null;
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
 * Inicializa la aplicación de Firebase.
 */
async function initFirebase() {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    window.firebase = {
        getAuth, getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc,
        signIn, signUp, signOutAll, getSystemPlaylists, getPublicPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addFavorite, removeFavorite, listFavorites,
        createLiveSession, updateLiveSession, deleteLiveSession, listenToSessionChanges, listenForLiveSessions,
        Session, getSession, setSession, onAuthChange
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const username = userDoc.exists() ? userDoc.data().username : "";
            setSession({ status: "logged", uid: user.uid, email: user.email, username: username });
        } else {
            setSession({ status: "guest", uid: "", email: "", username: "" });
        }
    });

    checkForActiveImportJob();
}

/**
 * Manejador de estado de sesión.
 * @param {object} newSession - El nuevo objeto de sesión.
 */
function setSession(newSession) {
    Session = newSession;
    localStorage.setItem(sessionKey, JSON.stringify(Session));
    if (onAuthChangeCallback) onAuthChangeCallback(Session);
}

/**
 * Obtiene el estado de sesión actual.
 * @returns {object} - El objeto de sesión.
 */
function getSession() {
    return Session;
}

/**
 * Establece un callback para cuando cambie el estado de la autenticación.
 * @param {Function} callback - El callback a ejecutar.
 */
function onAuthChange(callback) {
    onAuthChangeCallback = callback;
}

/**
 * Inicia sesión con correo y contraseña.
 * @param {string} email
 * @param {string} pass
 */
async function signIn(email, pass) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const username = userDoc.exists() ? userDoc.data().username : "";
        setSession({ status: "logged", uid: user.uid, email: user.email, username: username });
        return true;
    } catch (e) {
        console.error("Login failed:", e);
        return false;
    }
}

/**
 * Crea un nuevo usuario con correo y contraseña, y guarda su información en Firestore.
 * @param {string} email
 * @param {string} pass
 * @param {string} username
 */
async function signUp(email, pass, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), {
            username,
            createdAt: serverTimestamp()
        });
        setSession({ status: "logged", uid: user.uid, email: user.email, username: username });
        return true;
    } catch (e) {
        console.error("Sign up failed:", e);
        return false;
    }
}

/**
 * Cierra la sesión del usuario actual.
 */
async function signOutAll() {
    await signOut(auth);
    setSession({ status: "guest", uid: "", email: "", username: "" });
}

/**
 * Obtiene las playlists del sistema.
 */
async function getSystemPlaylists() {
    const q = query(collection(db, "system_playlists"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Obtiene las playlists públicas.
 */
async function getPublicPlaylists() {
    const q = query(collection(db, "playlists"), where("isPublic", "==", true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Crea una nueva playlist.
 * @param {object} playlistData
 */
async function createPlaylist(playlistData) {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    return addDoc(collection(db, "playlists"), {
        ...playlistData,
        owner: session.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

/**
 * Actualiza una playlist.
 * @param {string} id
 * @param {object} data
 */
async function updatePlaylist(id, data) {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    const playlistRef = doc(db, "playlists", id);
    const playlistDoc = await getDoc(playlistRef);
    if (!playlistDoc.exists() || playlistDoc.data().owner !== session.uid) {
        throw new Error("No tenés permisos para modificar esta playlist.");
    }

    return updateDoc(playlistRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

/**
 * Elimina una playlist.
 * @param {string} id
 */
async function deletePlaylist(id) {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    const playlistRef = doc(db, "playlists", id);
    const playlistDoc = await getDoc(playlistRef);
    if (!playlistDoc.exists() || playlistDoc.data().owner !== session.uid) {
        throw new Error("No tenés permisos para modificar esta playlist.");
    }

    return deleteDoc(playlistRef);
}

/**
 * Agrega un favorito.
 * @param {object} trackObj
 */
async function addFavorite(trackObj) {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    return addDoc(collection(db, "users", session.uid, "favorites"), {
        ...trackObj,
        addedAt: serverTimestamp()
    });
}

/**
 * Elimina un favorito.
 * @param {string} favId
 */
async function removeFavorite(favId) {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    return deleteDoc(doc(db, "users", session.uid, "favorites", favId));
}

/**
 * Lista los favoritos del usuario.
 */
async function listFavorites() {
    const session = getSession();
    if (session.status !== "logged") throw new Error("Requiere registro");

    const q = query(collection(db, "users", session.uid, "favorites"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


// --- Funciones del Resolver de Spotify ---
function showResolverModal(job, playlistName = 'Importando...', playlistCover = '') {
    const modal = $('#resolver-modal');
    if (!modal) return;

    $('#resolver-title').textContent = playlistName;
    $('#resolver-thumb').src = playlistCover;

    modal.classList.remove('hide');
    updateResolverModal(job); // Initial update
}

function updateResolverModal(job) {
    const progress = (job.done / job.total) * 100;
    $('#resolver-progress').style.width = `${progress}%`;
    $('#resolver-progress-text').textContent = `${job.done} / ${job.total}`;
}

function hideResolverModal() {
    const modal = $('#resolver-modal');
    if (modal) {
        modal.classList.add('hide');
    }
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
        const { doc, onSnapshot, getDoc } = sy_fs();

        const pl = communityPlaylists.find(p => p.id === playlistId) || (await getDoc(doc(db, "playlists", playlistId))).data();
        if (!pl) {
            hideResolverModal();
            return;
        }

        const jobRef = doc(db, "resolverJobs", jobId);
        if (resolverJobUnsubscribe) resolverJobUnsubscribe();

        resolverJobUnsubscribe = onSnapshot(jobRef, (docSnap) => {
            if (!docSnap.exists() || ['canceled', 'done', 'error'].includes(docSnap.data().status)) {
                hideResolverModal();
                return;
            }
            const job = { id: docSnap.id, ...docSnap.data() };
            updateResolverModal(job);
        });
    } catch (e) {
        console.error("Failed to parse or resume active job:", e);
        localStorage.removeItem('sy_active_import_job');
    }
}

async function startResolverJob(playlistId) {
    const { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } = sy_fs();
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
    const { doc, getDoc, updateDoc, serverTimestamp } = sy_fs();
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
    const BATCH_SIZE = 1; // Bajado de 3 a 1 para no saturar el servidor de scraping.

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
        const spotifyTrack = playlist.spotifyTracks[originalIndex];
        if (result.videoId) {
            updatedTracks[originalIndex] = {
                id: result.videoId,
                title: spotifyTrack.title,
                author: spotifyTrack.author,
                thumb: spotifyTrack.thumb || `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`,
                source: 'youtube',
                originalId: spotifyTrack.spotifyId,
                backupUrls: result.backups,
                reassignIndex: 0
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
        const { doc, updateDoc, serverTimestamp } = sy_fs();
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

export { initFirebase, Session, getSession, setSession, onAuthChange, signIn, signUp, signOutAll, getSystemPlaylists, getPublicPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addFavorite, removeFavorite, listFavorites, createLiveSession, updateLiveSession, deleteLiveSession, listenToSessionChanges, listenForLiveSessions, communityPlaylists, checkForActiveImportJob, startResolverJob, sy_fs, isMyPlaylist };
