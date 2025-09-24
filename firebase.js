import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU",
    authDomain: "sanaverayou.firebaseapp.com",
    projectId: "sanaverayou",
    storageBucket: "sanaverayou.appspot.com",
    messagingSenderId: "275513302327",
    appId: "1:275513302327:web:3b26052bf02e657d450eb2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado de la sesión global y persistente
const LS_SESSION = "sy_session";
window.Session = {
    status: "guest",
    uid: "",
    email: "",
    username: ""
};

/**
 * Carga el estado de la sesión desde localStorage o lo inicializa por defecto.
 */
export function loadSession() {
    try {
        const savedSession = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
        if (savedSession) {
            window.Session = savedSession;
        }
    } catch (e) {
        console.error("Error loading session from localStorage:", e);
    }
}

/**
 * Guarda el estado actual de la sesión en localStorage.
 */
export function saveSession() {
    try {
        localStorage.setItem(LS_SESSION, JSON.stringify(window.Session));
    } catch (e) {
        console.error("Error saving session to localStorage:", e);
    }
}

/**
 * Sincroniza la sesión con el estado de autenticación de Firebase.
 * @param {function} cb Callback a ejecutar cuando el estado cambia.
 */
export function onAuthChange(cb) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Usuario logueado o registrado
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                window.Session = {
                    status: "logged",
                    uid: user.uid,
                    email: user.email,
                    username: docSnap.data().username
                };
            } else {
                // Usuario autenticado pero sin doc en Firestore (ej. registro incompleto)
                window.Session = {
                    status: "logged",
                    uid: user.uid,
                    email: user.email,
                    username: user.email // Fallback
                };
            }
        } else {
            // No hay usuario, forzar estado invitado
            window.Session = {
                status: "guest",
                uid: "",
                email: "",
                username: ""
            };
        }
        saveSession();
        if (cb) cb(window.Session);
    });
    // Iniciar de forma anónima si no hay sesión
    if (!localStorage.getItem(LS_SESSION)) {
        signInAnonymously(auth).catch(e => console.error("Anonymous sign-in failed", e));
    }
}

/**
 * Valida si la sesión tiene permisos de escritura.
 * @returns {boolean}
 */
function canWrite() {
    return window.Session.status === "logged";
}

// --- Helpers de Autenticación ---

/**
 * Inicia sesión con email y contraseña.
 * @param {string} email
 * @param {string} password
 */
export async function signIn(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (e) {
        console.error("Error signing in:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Crea un nuevo usuario.
 * @param {string} email
 * @param {string} password
 * @param {string} username
 */
export async function signUp(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), {
            username: username,
            createdAt: serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        console.error("Error signing up:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Cierra la sesión del usuario.
 */
export async function signOutAll() {
    try {
        await signOut(auth);
        // Firmar anónimamente después de cerrar sesión
        await signInAnonymously(auth);
        return { success: true };
    } catch (e) {
        console.error("Error signing out:", e);
        return { success: false, error: e.message };
    }
}

// --- Helpers de Firestore ---

/**
 * Lee las playlists del sistema.
 */
export async function getSystemPlaylists() {
    const q = query(collection(db, "system_playlists"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Lee las playlists públicas.
 */
export async function getPublicPlaylists() {
    const q = query(collection(db, "playlists"), where("public", "==", true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Crea una nueva playlist.
 * @param {object} data
 */
export async function createPlaylist(data) {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const playlistData = {
        ...data,
        owner: window.Session.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    try {
        const docRef = await addDoc(collection(db, "playlists"), playlistData);
        return { success: true, id: docRef.id };
    } catch (e) {
        return { success: false, error: "Error al crear la playlist." };
    }
}

/**
 * Actualiza una playlist.
 * @param {string} id
 * @param {object} data
 */
export async function updatePlaylist(id, data) {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const playlistRef = doc(db, "playlists", id);
    try {
        const docSnap = await getDoc(playlistRef);
        if (docSnap.exists() && docSnap.data().owner === window.Session.uid) {
            await updateDoc(playlistRef, { ...data, updatedAt: serverTimestamp() });
            return { success: true };
        } else {
            return { success: false, error: "No tenés permisos para modificar esta playlist." };
        }
    } catch (e) {
        return { success: false, error: "Error al actualizar la playlist." };
    }
}

/**
 * Elimina una playlist.
 * @param {string} id
 */
export async function deletePlaylist(id) {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const playlistRef = doc(db, "playlists", id);
    try {
        const docSnap = await getDoc(playlistRef);
        if (docSnap.exists() && docSnap.data().owner === window.Session.uid) {
            await deleteDoc(playlistRef);
            return { success: true };
        } else {
            return { success: false, error: "No tenés permisos para modificar esta playlist." };
        }
    } catch (e) {
        return { success: false, error: "Error al eliminar la playlist." };
    }
}

/**
 * Agrega una canción a favoritos.
 * @param {object} trackObj
 */
export async function addFavorite(trackObj) {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const favsCollectionRef = collection(db, `users/${window.Session.uid}/favorites`);
    try {
        // Usar una transacción para evitar duplicados y múltiples escrituras
        const q = query(favsCollectionRef, where("trackId", "==", trackObj.trackId));
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
            return { success: false, error: "Esta canción ya está en tus favoritos." };
        }

        const newFav = {
            ...trackObj,
            addedAt: serverTimestamp()
        };
        await addDoc(favsCollectionRef, newFav);
        return { success: true };
    } catch (e) {
        return { success: false, error: "Error al agregar a favoritos." };
    }
}

/**
 * Remueve una canción de favoritos.
 * @param {string} favId
 */
export async function removeFavorite(favId) {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const favRef = doc(db, `users/${window.Session.uid}/favorites`, favId);
    try {
        await deleteDoc(favRef);
        return { success: true };
    } catch (e) {
        return { success: false, error: "Error al quitar de favoritos." };
    }
}

/**
 * Lista las canciones favoritas.
 */
export async function listFavorites() {
    if (!canWrite()) {
        return { success: false, error: "Función disponible para usuarios registrados." };
    }
    const q = query(collection(db, `users/${window.Session.uid}/favorites`));
    const snapshot = await getDocs(q);
    return { success: true, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
}

export const Session = window.Session;
