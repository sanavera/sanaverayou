// Contiene la inicialización de Firebase y toda la lógica de Firestore.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const __app_id = "sanaverayou";
const __firebase_config = '{"apiKey":"AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU","authDomain":"sanaverayou.firebaseapp.com","projectId":"sanaverayou","storageBucket":"sanaverayou.appspot.com","messagingSenderId":"275513302327","appId":"1:275513302327:web:3b26052bf02e657d450eb2"}';
const firebaseConfig = JSON.parse(__firebase_config);

let app = null;
let db = null;
let auth = null;
let communityPlaylists = [];
let resolverJobUnsubscribe = null;

// --- Gestor de Sesión ---
const SESSION_KEY = "app_session";
const DEFAULT_SESSION = { status: "guest", uid: "", email: "", username: "" };

/**
 * Clase para manejar el estado de la sesión, persistiendo en localStorage.
 */
class SessionManager {
    constructor() {
        this.data = this.load();
        this.callbacks = new Set();
    }

    load() {
        try {
            const stored = localStorage.getItem(SESSION_KEY);
            return stored ? { ...DEFAULT_SESSION, ...JSON.parse(stored) } : DEFAULT_SESSION;
        } catch (e) {
            console.error("Error loading session from localStorage:", e);
            return DEFAULT_SESSION;
        }
    }

    save() {
        localStorage.setItem(SESSION_KEY, JSON.stringify(this.data));
    }

    set(newData) {
        this.data = { ...this.data, ...newData };
        this.save();
        this.callbacks.forEach(cb => cb(this.data));
    }

    get() {
        return this.data;
    }

    onUpdate(callback) {
        this.callbacks.add(callback);
    }
}

export const Session = new SessionManager();
window.Session = Session;

// --- Helpers para IDs de playlists del usuario en Local Storage ---
const LS_USER_PLAYLIST_IDS = `sy_user_playlist_ids_v1_${Session.get().uid}`;
function getMyPlaylistIds() { try { return JSON.parse(localStorage.getItem(LS_USER_PLAYLIST_IDS) || "[]"); } catch { return []; } }
function addMyPlaylistId(id) { const ids = getMyPlaylistIds(); if (!ids.includes(id)) { ids.push(id); localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids)); } }
function removeMyPlaylistId(id) { let ids = getMyPlaylistIds(); ids = ids.filter(pid => pid !== id); localStorage.setItem(LS_USER_PLAYLIST_IDS, JSON.stringify(ids)); }
export function isMyPlaylist(id) { return getMyPlaylistIds().includes(id); }

/**
 * Proporciona acceso unificado a las funciones de Firestore.
 * @returns {object} - Objeto con instancias de funciones de Firestore.
 */
function sy_fs() {
  const f = (window.firebase || {});
  return {
    db: db || f.db,
    doc: doc || f.doc,
    updateDoc: updateDoc || f.updateDoc,
    setDoc: setDoc || f.setDoc,
    deleteDoc: deleteDoc || f.deleteDoc,
    addDoc: addDoc || f.addDoc,
    collection: collection || f.collection,
    query: query || f.query,
    where: where || f.where,
    onSnapshot: onSnapshot || f.onSnapshot,
    getDocs: getDocs || f.getDocs,
    serverTimestamp: serverTimestamp || f.serverTimestamp
  };
}

// --- Bloqueo para invitados ---
function checkAuth() {
    if (Session.get().status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    return true;
}

// --- Helpers de Firestore (actualizados) ---

export async function getSystemPlaylists() {
    try {
        const { collection, query, where, getDocs, db } = sy_fs();
        const q = query(collection(db, "system_playlists"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error getting system playlists:", e);
        return [];
    }
}

export async function getPublicPlaylists() {
    try {
        const { collection, query, where, getDocs, db } = sy_fs();
        const q = query(collection(db, "playlists"), where("isPublic", "==", true));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error getting public playlists:", e);
        return [];
    }
}

export async function createPlaylist(data) {
    checkAuth();
    try {
        const { collection, addDoc, serverTimestamp, db } = sy_fs();
        const { uid } = Session.get();
        const docRef = await addDoc(collection(db, "playlists"), {
            ...data,
            owner: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            trackCount: data.tracks?.length || 0,
            resolvedCount: data.tracks?.length || 0
        });
        return docRef.id;
    } catch (e) {
        console.error("Error creating playlist:", e);
        throw new Error("No se pudo crear la playlist. Intente de nuevo.");
    }
}

export async function updatePlaylist(id, data) {
    checkAuth();
    try {
        const { doc, updateDoc, serverTimestamp, db } = sy_fs();
        const { uid } = Session.get();
        const plRef = doc(db, "playlists", id);
        const plDoc = await getDoc(plRef);
        if (!plDoc.exists() || plDoc.data().owner !== uid) {
            throw new Error("No tenés permisos para modificar esta playlist.");
        }
        await updateDoc(plRef, { ...data, updatedAt: serverTimestamp() });
        return true;
    } catch (e) {
        console.error("Error updating playlist:", e);
        throw e;
    }
}

export async function deletePlaylist(id) {
    checkAuth();
    try {
        const { doc, deleteDoc, getDoc, db } = sy_fs();
        const { uid } = Session.get();
        const plRef = doc(db, "playlists", id);
        const plDoc = await getDoc(plRef);
        if (!plDoc.exists() || plDoc.data().owner !== uid) {
            throw new Error("No tenés permisos para modificar esta playlist.");
        }
        await deleteDoc(plRef);
        return true;
    } catch (e) {
        console.error("Error deleting playlist:", e);
        throw e;
    }
}

export async function addFavorite(trackObj) {
    checkAuth();
    try {
        const { doc, setDoc, db } = sy_fs();
        const { uid } = Session.get();
        const favId = trackObj.id;
        const favRef = doc(db, `users/${uid}/favorites`, favId);
        await setDoc(favRef, { ...trackObj, addedAt: serverTimestamp() });
        return true;
    } catch (e) {
        console.error("Error adding favorite:", e);
        throw e;
    }
}

export async function removeFavorite(favId) {
    checkAuth();
    try {
        const { doc, deleteDoc, db } = sy_fs();
        const { uid } = Session.get();
        const favRef = doc(db, `users/${uid}/favorites`, favId);
        await deleteDoc(favRef);
        return true;
    } catch (e) {
        console.error("Error removing favorite:", e);
        throw e;
    }
}

export async function listFavorites() {
    checkAuth();
    try {
        const { collection, getDocs, db, orderBy, query } = sy_fs();
        const { uid } = Session.get();
        const q = query(collection(db, `users/${uid}/favorites`), orderBy("addedAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error listing favorites:", e);
        throw e;
    }
}

// --- Lógica de Auth ---
export async function signIn(email, pass) {
    try {
        const { user } = await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged se encargará de actualizar la sesión
    } catch (e) {
        console.error("Login failed:", e);
        throw new Error("Credenciales incorrectas. Verificá tu email y contraseña.");
    }
}

export async function signUp(email, pass, username) {
    try {
        const { user } = await createUserWithEmailAndPassword(auth, email, pass);
        const userRef = doc(db, `users/${user.uid}`);
        await setDoc(userRef, { username, email, createdAt: serverTimestamp() });
        // onAuthStateChanged se encargará de actualizar la sesión
    } catch (e) {
        console.error("Registration failed:", e);
        if (e.code === 'auth/email-already-in-use') {
            throw new Error("El email ya está en uso. Intentá con otro.");
        }
        throw new Error("Hubo un problema con el registro. Intente de nuevo.");
    }
}

export async function signOutAll() {
    await signOut(auth);
    // onAuthStateChanged se encargará de actualizar la sesión
}

// --- Inicialización y listeners ---
function initFirebase() {
    if (!app) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, `users/${user.uid}`);
                const userDoc = await getDoc(userRef);
                const username = userDoc.exists() ? userDoc.data().username : "Usuario";
                Session.set({ status: "logged", uid: user.uid, email: user.email, username });
            } catch (e) {
                console.error("Error fetching user data:", e);
                Session.set({ status: "logged", uid: user.uid, email: user.email, username: "Usuario" });
            }
        } else {
            Session.set({ status: "guest", uid: "", email: "", username: "" });
        }
    });

    onSnapshot(query(collection(db, "playlists"), orderBy("updatedAt", "desc")), (snapshot) => {
        communityPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (typeof window.renderPlaylists === 'function') window.renderPlaylists();
        if (typeof window.renderAllHomePlaylists === 'function') window.renderAllHomePlaylists();
    });

    onSnapshot(collection(db, "system_playlists"), (snapshot) => {
        const systemPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (typeof window.renderAllHomePlaylists === 'function') window.renderAllHomePlaylists(systemPlaylists);
    });

    window.firebase = { db, auth, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, orderBy };
}

initFirebase();

export function getSession() { return Session.get(); }
export function setSession(data) { Session.set(data); }
export function onAuthChange(cb) { Session.onUpdate(cb); }

// Funciones para Transmisiones (mantienen la misma lógica, solo se exportan)
const SESSIONS_COLLECTION = "sessions";
export async function createLiveSession(name, genre) {
    checkAuth();
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
        lastSeen: serverTimestamp(),
        owner: Session.get().uid
    });
    return docRef.id;
}

export async function updateLiveSession(sessionId, data) {
    checkAuth();
    if (!sessionId) return;
    const { doc, updateDoc, getDoc, db } = sy_fs();
    const { uid } = Session.get();
    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists() || sessionDoc.data().owner !== uid) {
        throw new Error("No tenés permisos para modificar esta transmisión.");
    }
    await updateDoc(sessionRef, data);
}

export async function deleteLiveSession(sessionId) {
    checkAuth();
    if (!sessionId) return;
    const { doc, deleteDoc, getDoc, db } = sy_fs();
    const { uid } = Session.get();
    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists() || sessionDoc.data().owner !== uid) {
        throw new Error("No tenés permisos para detener esta transmisión.");
    }
    await deleteDoc(sessionRef);
}

export function listenToSessionChanges(sessionId, callback) {
    if (!sessionId) return;
    const { doc, onSnapshot, db } = sy_fs();
    return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => {
        callback(doc.data());
    });
}

export function listenForLiveSessions(callback) {
    const { collection, query, where, onSnapshot, db } = sy_fs();
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
