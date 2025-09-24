// Contiene la inicialización de Firebase y toda la lógica de Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, setDoc, deleteDoc, addDoc, collection, query, where, onSnapshot, getDocs, serverTimestamp, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables for Firebase configuration, pre-injected by the environment.
const firebaseConfig = JSON.parse(__firebase_config);
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Firebase instances and session state
let app, auth, db;
let communityPlaylists = [];
let favs = [];
let resolverJobUnsubscribe = null;
const favsCollectionName = "favorites";
let sessionListeners = [];

const Session = {
    status: "guest",
    uid: null,
    email: null,
    username: null,
    
    _sessionKey: "app_session",

    get() {
        if (!this.uid) {
            try {
                const saved = localStorage.getItem(this._sessionKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    this.status = parsed.status;
                    this.uid = parsed.uid;
                    this.email = parsed.email;
                    this.username = parsed.username;
                }
            } catch (e) {
                console.error("Failed to load session from localStorage:", e);
                this.set({status: "guest", uid: null});
            }
        }
        return this;
    },

    set(data) {
        this.status = data.status || "guest";
        this.uid = data.uid || null;
        this.email = data.email || null;
        this.username = data.username || null;
        localStorage.setItem(this._sessionKey, JSON.stringify(this));
        
        sessionListeners.forEach(cb => cb(this));
    },

    clear() {
        this.set({status: "guest", uid: null, email: null, username: null});
    }
};

let isAuthenticated = false;

// --- onAuthChange helper for external modules ---
export function onAuthChange(cb) {
    if (typeof cb === 'function') {
        sessionListeners.push(cb);
        // Execute immediately if we already have a session state
        if (Session.uid !== null) {
            cb(Session);
        }
    }
}

// --- Firestore Helpers ---
function sy_fs() {
  return {
    auth,
    db,
    doc,
    updateDoc,
    setDoc,
    deleteDoc,
    addDoc,
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    serverTimestamp,
    getDoc,
    runTransaction,
  };
}

/**
 * Checks if the current user is authenticated.
 * @returns {boolean}
 */
export function isUserAuthenticated() {
    return isAuthenticated;
}

// --- Auth Helpers ---
export async function signIn(email, pass) {
    try {
        const { user } = await signInWithEmailAndPassword(auth, email, pass);
        // onAuthStateChanged will handle setting the session
        return user;
    } catch (e) {
        console.error("Login failed:", e);
        return null;
    }
}

export async function signUp(email, pass, username) {
    try {
        const { user } = await createUserWithEmailAndPassword(auth, email, pass);
        // Create user document
        const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
        await setDoc(userRef, {
            username: username,
            email: email,
            createdAt: serverTimestamp()
        });
        // onAuthStateChanged will handle setting the session
        return user;
    } catch (e) {
        console.error("Registration failed:", e);
        return null;
    }
}

export async function signOutAll() {
    try {
        await signOut(auth);
        Session.clear();
    } catch (e) {
        console.error("Sign out failed:", e);
    }
}

// --- Firestore Functions ---
export async function getSystemPlaylists() {
    const { collection, query, where, getDocs } = sy_fs();
    const q = query(collection(db, 'system_playlists'), where('public', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPublicPlaylists() {
    const { collection, query, where, getDocs } = sy_fs();
    const q = query(collection(db, 'playlists'), where('public', '==', true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getMyPlaylists() {
    if (Session.status !== "logged") {
        throw new Error("Requiere registro");
    }
    const { collection, query, where, getDocs } = sy_fs();
    const q = query(collection(db, 'playlists'), where('owner', '==', Session.uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPlaylist({ title, description, isPublic, tracks }) {
    if (Session.status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    const { addDoc, collection, serverTimestamp } = sy_fs();
    const newPlaylist = {
        title,
        description,
        isPublic,
        tracks: tracks || [],
        owner: Session.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    return await addDoc(collection(db, 'playlists'), newPlaylist);
}

export async function updatePlaylist(id, data) {
    if (Session.status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    const { doc, updateDoc, getDoc, serverTimestamp } = sy_fs();
    const playlistRef = doc(db, 'playlists', id);
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists() || playlistSnap.data().owner !== Session.uid) {
        throw new Error("No tenés permisos para modificar esta playlist.");
    }

    await updateDoc(playlistRef, { ...data, updatedAt: serverTimestamp() });
}

export async function deletePlaylist(id) {
    if (Session.status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    const { doc, deleteDoc, getDoc } = sy_fs();
    const playlistRef = doc(db, 'playlists', id);
    const playlistSnap = await getDoc(playlistRef);

    if (!playlistSnap.exists() || playlistSnap.data().owner !== Session.uid) {
        throw new Error("No tenés permisos para modificar esta playlist.");
    }

    await deleteDoc(playlistRef);
}

// --- Favorites functions ---
export async function addFavorite(trackObj) {
    if (Session.status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    const { collection, addDoc, serverTimestamp } = sy_fs();
    const fav = {
        trackId: trackObj.id,
        title: trackObj.title,
        artist: trackObj.author,
        coverUrl: trackObj.thumb,
        source: trackObj.source,
        addedAt: serverTimestamp()
    };
    return await addDoc(collection(db, 'artifacts', appId, 'users', Session.uid, favsCollectionName), fav);
}

export async function removeFavorite(favId) {
    if (Session.status !== "logged") {
        throw new Error("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
    }
    const { doc, deleteDoc } = sy_fs();
    await deleteDoc(doc(db, 'artifacts', appId, 'users', Session.uid, favsCollectionName, favId));
}

export function listenToFavorites(callback) {
    if (Session.status !== "logged") {
        console.warn("User not logged in, cannot listen to favorites.");
        return () => {}; // Return a no-op function
    }
    const { collection, onSnapshot, query, orderBy } = sy_fs();
    const q = query(collection(db, 'artifacts', appId, 'users', Session.uid, favsCollectionName), orderBy('addedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
        favs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(favs);
    });
}

export function isFav(trackId) {
    if (!trackId) return false;
    return favs.some(f => f.trackId === trackId);
}

// --- Main initialization ---
async function initFirebase() {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            let username = 'Usuario';
            if(userDocSnap.exists()) {
                username = userDocSnap.data().username || 'Usuario';
            }
            Session.set({ status: "logged", uid: user.uid, email: user.email, username });
            isAuthenticated = true;
        } else {
            Session.clear();
            isAuthenticated = false;
        }
    });

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

    // Use a custom token if provided
    if (initialAuthToken) {
        try {
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (e) {
            console.error("Failed to sign in with custom token:", e);
        }
    }
}

initFirebase();

export { Session, communityPlaylists, favs };
