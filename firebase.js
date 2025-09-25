// Contiene la inicialización de Firebase, la lógica de autenticación y de Firestore.

// Importaciones de Firebase, usando el esquema sin módulos del index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentSession = { status: "guest", uid: null, email: null, username: null };
const LS_SESSION_KEY = "sy_session_v1";

// --- Helpers para persistencia de la sesión en Local Storage ---
function saveSession() {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(currentSession));
}

function getSession() {
    try {
        const savedSession = JSON.parse(localStorage.getItem(LS_SESSION_KEY));
        if (savedSession) {
            currentSession = savedSession;
        }
    } catch (e) {
        console.error("Error loading session from localStorage:", e);
    }
    return currentSession;
}


// --- NUEVA LÓGICA DE FIREBASE AUTH ---
/**
 * Se registra un nuevo usuario con email, contraseña y nombre de usuario.
 * @param {string} email
 * @param {string} password
 * @param {string} username
 * @returns {Promise<void>}
 */
async function signUp(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            username: username,
            email: user.email,
            createdAt: serverTimestamp()
        });
        showToast("Registro exitoso. ¡Bienvenido!");
    } catch (error) {
        console.error("Error signing up:", error);
        throw error;
    }
}

/**
 * Inicia sesión con email y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function signIn(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Inicio de sesión exitoso.");
    } catch (error) {
        console.error("Error signing in:", error);
        throw error;
    }
}

/**
 * Cierra la sesión del usuario.
 * @returns {Promise<void>}
 */
async function signOutAll() {
    try {
        await signOut(auth);
        showToast("Sesión cerrada.");
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
}

/**
 * Listener principal del estado de autenticación.
 * @param {Function} callback - Función a llamar con el objeto de sesión.
 */
function onAuthChange(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentSession.uid = user.uid;
            currentSession.email = user.email;

            if (user.isAnonymous) {
                currentSession.status = "guest";
                currentSession.username = "Invitado";
            } else {
                currentSession.status = "logged";
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    currentSession.username = userDoc.data().username;
                } else {
                    currentSession.username = user.email.split('@')[0];
                }
            }
        } else {
            // Si el usuario se deslogueó, volvemos a modo invitado
            currentSession.status = "guest";
            currentSession.uid = null;
            currentSession.email = null;
            currentSession.username = null;
        }
        saveSession();
        callback(currentSession);
    });
    // Iniciar sesión anónima al inicio para el modo invitado
    signInAnonymously(auth);
}

// --- Lógica para Playlists y Favoritos en Firestore ---
const FAVS_COLLECTION = "favorites";
const PLAYLISTS_COLLECTION = "playlists";

/**
 * Obtiene las playlists del sistema.
 * @returns {Promise<Array>}
 */
async function getSystemPlaylists() {
    const q = query(collection(db, PLAYLISTS_COLLECTION), where("isSystem", "==", true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Obtiene las playlists marcadas como públicas.
 * @returns {Promise<Array>}
 */
async function getPublicPlaylists() {
    const q = query(collection(db, PLAYLISTS_COLLECTION), where("isPublic", "==", true), where("isSystem", "!=", true));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Guarda un favorito en Firestore para un usuario logueado.
 * @param {string} userId
 * @param {object} trackObj
 */
async function saveFavorite(userId, trackObj) {
    const favsCollectionRef = collection(db, "users", userId, FAVS_COLLECTION);
    const docRef = await addDoc(favsCollectionRef, {
        ...trackObj,
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

/**
 * Elimina un favorito de Firestore.
 * @param {string} userId
 * @param {string} favId
 */
async function deleteFavorite(userId, favId) {
    const favDocRef = doc(db, "users", userId, FAVS_COLLECTION, favId);
    await deleteDoc(favDocRef);
}

/**
 * Lista los favoritos de un usuario.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function listFavorites(userId) {
    const favsCollectionRef = collection(db, "users", userId, FAVS_COLLECTION);
    const q = query(favsCollectionRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Guarda una nueva playlist en Firestore.
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<string>}
 */
async function savePlaylist(userId, data) {
    const playlistsCollectionRef = collection(db, PLAYLISTS_COLLECTION);
    const docRef = await addDoc(playlistsCollectionRef, {
        ...data,
        ownerUserId: userId,
        updatedAt: serverTimestamp(),
        isPublic: data.isPublic || false
    });
    return docRef.id;
}

/**
 * Actualiza una playlist existente en Firestore.
 * @param {string} userId
 * @param {string} playlistId
 * @param {object} data
 */
async function updatePlaylist(userId, playlistId, data) {
    const playlistDocRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    await updateDoc(playlistDocRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

/**
 * Elimina una playlist de Firestore.
 * @param {string} userId
 * @param {string} playlistId
 */
async function deletePlaylist(userId, playlistId) {
    const playlistDocRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    await deleteDoc(playlistDocRef);
}

/**
 * Lista las playlists creadas por un usuario logueado.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function listMyPlaylists(userId) {
    const playlistsCollectionRef = collection(db, PLAYLISTS_COLLECTION);
    const q = query(playlistsCollectionRef, where("ownerUserId", "==", userId), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Se crea un namespace global para que los demás archivos puedan acceder a estas funciones.
window.syAuth = {
    auth,
    db,
    getSession,
    onAuthChange,
    signUp,
    signIn,
    signOutAll,
    getSystemPlaylists,
    getPublicPlaylists,
    saveFavorite,
    deleteFavorite,
    listFavorites,
    savePlaylist,
    updatePlaylist,
    deletePlaylist,
    listMyPlaylists,
    firestore: {
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
        orderBy,
        getDoc
    }
};





window.syAuth.onAuthChange((session) => {
    // Aquí puedes manejar la lógica de la sesión una vez que cambie.
    // Esto se gestionará principalmente en main.js.
    console.log("Estado de la sesión:", session);
});
