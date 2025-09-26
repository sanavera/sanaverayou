import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, query, where, orderBy, addDoc, setDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { renderFavs } from './favoritos.js';
import { renderPlaylists, startResolverJob, resolveTrack } from './playlists.js';
import { renderAllHomePlaylists, updateUIAfterAuthStateChange } from './main.js';
import { refreshIndicators } from './reproductor.js';

// --- Variables Globales del Módulo ---
export let db;
export let auth;
export let app;
export let currentUser = null;
export let userFavorites = [];
export let userPlaylists = [];
export let communityPlaylists = [];

const LS_FAVS = "sanayera_favs_v1";

// --- Inicialización y Autenticación ---
export function initFirebase() {
    const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth();

    onAuthStateChanged(auth, user => {
        currentUser = user;
        updateUIAfterAuthStateChange(user);
        if (user) {
            loadUserData(user.uid);
        } else {
            loadGuestData();
        }
    });
}

// --- Carga de Datos ---
let favsUnsubscribe = null;
let playlistsUnsubscribe = null;
let communityPlaylistsUnsubscribe = null;

function loadUserData(uid) {
    if (favsUnsubscribe) favsUnsubscribe();
    const favsQuery = query(collection(db, `users/${uid}/favorites`), orderBy("addedAt", "desc"));
    favsUnsubscribe = onSnapshot(favsQuery, snapshot => {
        userFavorites = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        renderFavs();
        refreshIndicators();
    });

    if (playlistsUnsubscribe) playlistsUnsubscribe();
    const playlistsQuery = query(collection(db, 'playlists'), where('ownerUserId', '==', uid));
    playlistsUnsubscribe = onSnapshot(playlistsQuery, snapshot => {
        userPlaylists = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        renderPlaylists();
    });
}

function loadGuestData() {
    if (favsUnsubscribe) favsUnsubscribe();
    if (playlistsUnsubscribe) playlistsUnsubscribe();

    try {
        userFavorites = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
    } catch {
        userFavorites = [];
    }
    renderFavs();
    refreshIndicators();

    userPlaylists = [];
    renderPlaylists();
}

if (communityPlaylistsUnsubscribe) communityPlaylistsUnsubscribe();
const publicPlaylistsQuery = query(collection(db, 'playlists'), where('isPublic', '==', true), orderBy("updatedAt", "desc"));
communityPlaylistsUnsubscribe = onSnapshot(publicPlaylistsQuery, snapshot => {
    communityPlaylists = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    renderAllHomePlaylists();
});


// --- Gestión de Datos (Favoritos y Playlists) ---
export function isFav(trackId) {
    if (!trackId) return false;
    return userFavorites.some(f => f.id === trackId);
}

export async function toggleFav(track) {
    if (!track || !track.id) return;
    const isCurrentlyFav = isFav(track.id);

    if (currentUser) {
        const favRef = doc(db, `users/${currentUser.uid}/favorites`, track.id);
        if (isCurrentlyFav) {
            await deleteDoc(favRef);
            showToast("Quitado de Favoritos");
        } else {
            await setDoc(favRef, { ...track, addedAt: serverTimestamp() });
            showToast("Agregado a Favoritos");
        }
    } else {
        if (isCurrentlyFav) {
            userFavorites = userFavorites.filter(f => f.id !== track.id);
            showToast("Quitado de Favoritos");
        } else {
            userFavorites.unshift(track);
            showToast("Agregado a Favoritos");
        }
        localStorage.setItem(LS_FAVS, JSON.stringify(userFavorites));
        renderFavs();
        refreshIndicators();
    }
}

export async function createNewPlaylist(name, creator, tracks = []) {
    if (!currentUser) {
        showToast("Debes iniciar sesión para crear playlists.", true);
        return false;
    }
    if (!name || !creator) {
        showToast("Por favor, completa nombre de playlist y creador.", true);
        return false;
    }
    try {
        await addDoc(collection(db, "playlists"), {
            name,
            creator,
            tracks,
            trackCount: tracks.length,
            ownerUserId: currentUser.uid,
            isPublic: false,
            updatedAt: serverTimestamp(),
            source: tracks.length > 0 ? tracks[0].source : 'manual'
        });
        showToast(`Playlist "${name}" creada.`);
        return true;
    } catch (e) {
        showToast("Hubo un error al crear la playlist.", true);
        return false;
    }
}

export function isMyPlaylist(playlistId) {
    if (!currentUser) return false;
    const playlist = [...userPlaylists, ...communityPlaylists].find(p => p.id === playlistId);
    return playlist && playlist.ownerUserId === currentUser.uid;
}

export async function processAndSavePlaylist(pl) {
    if (!currentUser) return;
    const col = collection(db, 'playlists');
    const q = query(col, where("spotifyId", "==", pl.spotifyId), where("ownerUserId", "==", currentUser.uid));
    const snapshot = await getDocs(q);

    const playlistData = {
        name: pl.name,
        creator: pl.creator,
        cover: pl.cover || null,
        spotifyTracks: pl.spotifyTracks,
        trackCount: pl.spotifyTracks.length,
        tracks: Array(pl.spotifyTracks.length).fill(null),
        status: 'unresolved',
        resolvedCount: 0,
        updatedAt: serverTimestamp(),
        ownerUserId: currentUser.uid,
        isPublic: false,
        source: 'spotify',
        spotifyId: pl.spotifyId,
    };

    if (snapshot.empty) {
        const docRef = await addDoc(col, playlistData);
        startResolverJob(docRef.id);
    } else {
        const docId = snapshot.docs[0].id;
        await updateDoc(doc(db, 'playlists', docId), playlistData);
        showToast(`Playlist "${pl.name}" actualizada.`);
        startResolverJob(docId);
    }
}

export async function addSongToPlaylist(playlistId, track) {
    const pl = [...userPlaylists, ...communityPlaylists].find(p => p.id === playlistId);
    if (!pl) return false;

    const plRef = doc(db, "playlists", playlistId);
    const updatedTracks = [...(pl.tracks || [])];
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
    } catch (e) {
        showToast("No se pudo agregar la canción.", true);
        return false;
    }
}

// --- Funciones de Transmisiones en Vivo ---
const SESSIONS_COLLECTION = "sessions";

export async function createLiveSession(name, genre) {
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

export async function updateLiveSession(sessionId, data) {
    if (!sessionId) return;
    try {
        await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data);
    } catch (e) {
        console.warn("No se pudo actualizar la sesión.", e.message);
    }
}

export async function deleteLiveSession(sessionId) {
    if (!sessionId) return;
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
}

export function listenToSessionChanges(sessionId, callback) {
    return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => {
        callback(doc.data());
    });
}

export function listenForLiveSessions(callback) {
    const q = query(collection(db, SESSIONS_COLLECTION), where("status", "==", "active"));
    return onSnapshot(q, (snapshot) => {
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;
        const sessions = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(session => {
                const lastSeenTime = session.lastSeen?.toDate().getTime();
                return lastSeenTime > thirtySecondsAgo;
            });
        callback(sessions);
    }, (error) => {
        callback([]);
    });
}
