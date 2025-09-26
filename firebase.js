// Contiene la inicialización de Firebase y toda la lógica de Firestore y Autenticación.

// --- Declaraciones Globales de Datos ---
// Estos arrays serán la única fuente de verdad para toda la aplicación.
let db;
let favs = [];
let userPlaylists = []; // Playlists del usuario actual (invitado o registrado)
let communityPlaylists = []; // Playlists públicas de la comunidad
let authUnsubscribe = null; // Para limpiar el listener de autenticación
let playlistsUnsubscribe = null; // Para limpiar listeners de playlists
let favsUnsubscribe = null; // Para limpiar listeners de favoritos

// --- CONSTANTES ---
const LS_GUEST_FAVS = "sy_guest_favs_v1";
const LS_GUEST_PLAYLISTS = "sy_guest_playlists_v1";

/**
 * Proporciona acceso unificado a las funciones de Firebase.
 * @returns {object} - Objeto con instancias de funciones de Firebase.
 */
function sy_fs() {
  const f = (window.firebase || {});
  return {
    // Instancias
    db: (typeof db !== 'undefined' ? db : window.db),
    auth: f.auth,
    // Funciones
    doc: f.doc, updateDoc: f.updateDoc, setDoc: f.setDoc, deleteDoc: f.deleteDoc,
    addDoc: f.addDoc, collection: f.collection, query: f.query, where: f.where,
    onSnapshot: f.onSnapshot, getDocs: f.getDocs, serverTimestamp: f.serverTimestamp,
    orderBy: f.orderBy,
    // Auth
    createUserWithEmailAndPassword: f.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: f.signInWithEmailAndPassword,
    signOut: f.signOut,
    onAuthStateChanged: f.onAuthStateChanged,
    // Propiedades
    get currentUser() { return f.auth ? f.auth.currentUser : null; }
  };
}


// --- LÓGICA DE AUTENTICACIÓN ---

/**
 * Inicializa Firebase y el listener principal de estado de autenticación.
 */
async function initFirebaseAuth() {
    const firebaseConfig = { apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", authDomain: "sanaverayou.firebaseapp.com", projectId: "sanaverayou", storageBucket: "sanaverayou.appspot.com", messagingSenderId: "275513302327", appId: "1:275513302327:web:3b26052bf02e657d450eb2" };
    
    // Importaciones modulares de Firebase
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js");
    const { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");
    const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js");
    
    // Poner funciones en el objeto global para fácil acceso
    window.firebase = { getFirestore, collection, onSnapshot, query, where, getDocs, orderBy, doc, updateDoc, addDoc, serverTimestamp, deleteDoc, getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged };
    
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);
    window.firebase.auth = auth;

    // Listener principal que reacciona a los cambios de sesión
    if(authUnsubscribe) authUnsubscribe(); // Limpiar listener anterior si existe
    authUnsubscribe = onAuthStateChanged(auth, user => {
        cleanUpListeners(); // Limpiar listeners de datos anteriores antes de cargar nuevos
        if (user) {
            // --- USUARIO REGISTRADO ---
            console.log("Usuario registrado:", user.uid);
            loadDataForRegisteredUser(user.uid);
            updateUIAfterLogin(user);
        } else {
            // --- USUARIO INVITADO ---
            console.log("Usuario es invitado.");
            loadDataForGuest();
            updateUIAfterLogout();
        }
    });
}

function cleanUpListeners() {
    if (playlistsUnsubscribe) playlistsUnsubscribe();
    if (favsUnsubscribe) favsUnsubscribe();
    console.log("Listeners de datos limpios.");
}

async function register(email, password) {
    const { auth, createUserWithEmailAndPassword } = sy_fs();
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logIn(email, password) {
    const { auth, signInWithEmailAndPassword } = sy_fs();
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logOut() {
    const { auth, signOut } = sy_fs();
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
}


// --- CARGA DE DATOS (CENTRALIZADA) ---

/**
 * Carga todas las playlists públicas y las del usuario desde Firestore.
 * @param {string} userId - ID del usuario actual.
 */
function loadDataForRegisteredUser(userId) {
    const { db, collection, query, where, onSnapshot, orderBy } = sy_fs();
    
    // 1. Cargar playlists del usuario y públicas
    const q = query(collection(db, "playlists"), 
                    where("ownerId", "==", userId));
    
    playlistsUnsubscribe = onSnapshot(q, (snapshot) => {
        userPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPlaylists();
        
        // Cargar playlists públicas después de las del usuario para evitar duplicados
        loadPublicPlaylists(userId);
    });

    // 2. Cargar favoritos del usuario
    const favsQuery = query(collection(db, `users/${userId}/favs`), orderBy("addedAt", "desc"));
    favsUnsubscribe = onSnapshot(favsQuery, (snapshot) => {
        favs = snapshot.docs.map(doc => doc.data());
        renderFavs();
        refreshIndicators();
    });
}

/**
 * Carga las playlists públicas, excluyendo las del usuario actual que ya se cargaron.
 * @param {string} userId - ID del usuario actual para excluir sus playlists.
 */
function loadPublicPlaylists(userId) {
     const { db, collection, query, where, onSnapshot, orderBy } = sy_fs();
     const publicQuery = query(collection(db, "playlists"), where("isPublic", "==", true));
     
     onSnapshot(publicQuery, (snapshot) => {
        communityPlaylists = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(pl => pl.ownerId !== userId); // Excluir las propias
        renderAllHomePlaylists();
     });
}


/**
 * Carga los datos del invitado desde LocalStorage.
 */
function loadDataForGuest() {
    try {
        favs = JSON.parse(localStorage.getItem(LS_GUEST_FAVS) || "[]");
        userPlaylists = JSON.parse(localStorage.getItem(LS_GUEST_PLAYLISTS) || "[]");
    } catch {
        favs = [];
        userPlaylists = [];
    }
    // Los invitados no tienen playlists comunitarias por ahora, solo públicas
    loadPublicPlaylists(null); // Carga todas las públicas
    renderFavs();
    renderPlaylists();
}

// --- FUNCIONES DE ESCRITURA PARA INVITADOS ---
function saveGuestFavs() {
    localStorage.setItem(LS_GUEST_FAVS, JSON.stringify(favs));
}
function saveGuestPlaylists() {
    localStorage.setItem(LS_GUEST_PLAYLISTS, JSON.stringify(userPlaylists));
}


const SESSIONS_COLLECTION = "sessions";
async function createLiveSession(name, genre) { const docRef = await sy_fs().addDoc(collection(db, SESSIONS_COLLECTION), { name, genre, status: "active", currentTrack: null, isPlaying: false, currentTime: 0, stateChangeTimestamp: null, createdAt: sy_fs().serverTimestamp(), lastSeen: sy_fs().serverTimestamp() }); return docRef.id; }
async function updateLiveSession(sessionId, data) { if (!sessionId) return; try { await sy_fs().updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), data); } catch(e) { console.warn("Could not update session", e.message); } }
async function deleteLiveSession(sessionId) { if (!sessionId) return; await sy_fs().deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId)); }
function listenToSessionChanges(sessionId, callback) { return onSnapshot(doc(db, SESSIONS_COLLECTION, sessionId), (doc) => { callback(doc.data()); }); }
function listenForLiveSessions(callback) { const q = query(collection(db, SESSIONS_COLLECTION), where("status", "==", "active")); return onSnapshot(q, (snapshot) => { const now = Date.now(); const thirtySecondsAgo = now - 30000; const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(session => (session.lastSeen?.toDate().getTime() || 0) > thirtySecondsAgo); callback(sessions); }, (error) => { console.error("Error listening to live sessions:", error); callback([]); }); }
