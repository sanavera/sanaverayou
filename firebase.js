// firebase.js
// Inicialización de Firebase y lógica de Auth/Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
  getFirestore, 
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
  orderBy, 
  arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIG DE TU PROYECTO FIREBASE ---
const firebaseConfig = { 
  apiKey: "AIzaSyBojG3XoEmxcxWhpiOkL8k8EvoxIeZdFrU", 
  authDomain: "sanaverayou.firebaseapp.com", 
  projectId: "sanaverayou", 
  storageBucket: "sanaverayou.appspot.com", 
  messagingSenderId: "275513302327", 
  appId: "1:275513302327:web:3b26052bf02e657d450eb2" 
};
    
// --- Inicialización ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Session ---
const Session = {
  status: "guest",
  uid: null,
  email: null,
  username: null,
  _key: "app_session",

  get() {
    try {
      const saved = localStorage.getItem(this._key);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.status = parsed.status;
        this.uid = parsed.uid;
        this.email = parsed.email;
        this.username = parsed.username;
      }
    } catch (e) {
      console.error("Error cargando session:", e);
    }
    return this;
  },

  set(data) {
    this.status = data.status || "guest";
    this.uid = data.uid || null;
    this.email = data.email || null;
    this.username = data.username || null;
    localStorage.setItem(this._key, JSON.stringify(this));
    listeners.forEach(cb => cb(this));
  },

  clear() {
    this.set({status:"guest", uid:null, email:null, username:null});
  }
};
Session.get();

let listeners = [];

export function onAuthChange(cb) {
  if (typeof cb === "function") {
    listeners.push(cb);
    cb(Session);
  }
}

// --- Auth Helpers ---
export async function signIn(email, pass) {
  const { user } = await signInWithEmailAndPassword(auth, email, pass);
  return user;
}

export async function signUp(email, pass, username) {
  const { user } = await createUserWithEmailAndPassword(auth, email, pass);
  await setDoc(doc(db, "users", user.uid), {
    username,
    email,
    createdAt: serverTimestamp()
  });
  return user;
}

export async function signOutAll() {
  await signOut(auth);
  Session.clear();
}

// --- Firestore Helpers ---
export async function getSystemPlaylists() {
  const q = query(collection(db, "system_playlists"), where("public", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

export async function getPublicPlaylists() {
  const q = query(collection(db, "playlists"), where("public", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

export async function getMyPlaylists() {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  const q = query(collection(db, "playlists"), where("owner", "==", Session.uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({id: d.id, ...d.data()}));
}

export async function createPlaylist({title, description, public: isPublic, tracks}) {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  return await addDoc(collection(db, "playlists"), {
    title,
    description,
    public: isPublic,
    tracks: tracks || [],
    owner: Session.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updatePlaylist(id, data) {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  const ref = doc(db, "playlists", id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().owner !== Session.uid) {
    throw new Error("No tenés permisos para modificar esta playlist.");
  }
  await updateDoc(ref, {...data, updatedAt: serverTimestamp()});
}

export async function deletePlaylist(id) {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  const ref = doc(db, "playlists", id);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().owner !== Session.uid) {
    throw new Error("No tenés permisos para borrar esta playlist.");
  }
  await deleteDoc(ref);
}

// --- Agregar canción a una playlist ---
export async function addSongToPlaylist(playlistId, trackObj) {
  if (Session.status !== "logged") throw new Error("Requiere registro");

  const ref = doc(db, "playlists", playlistId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("La playlist no existe.");
  }
  if (snap.data().owner !== Session.uid) {
    throw new Error("No tenés permisos para modificar esta playlist.");
  }

  await updateDoc(ref, {
    tracks: arrayUnion({
      id: trackObj.id,
      title: trackObj.title,
      artist: trackObj.author,
      coverUrl: trackObj.thumb,
      source: trackObj.source,
      addedAt: serverTimestamp()
    })
  });
}

// --- Favoritos ---
export async function addFavorite(trackObj) {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  return await addDoc(collection(db, "users", Session.uid, "favorites"), {
    trackId: trackObj.id,
    title: trackObj.title,
    artist: trackObj.author,
    coverUrl: trackObj.thumb,
    source: trackObj.source,
    addedAt: serverTimestamp()
  });
}

export async function removeFavorite(favId) {
  if (Session.status !== "logged") throw new Error("Requiere registro");
  await deleteDoc(doc(db, "users", Session.uid, "favorites", favId));
}

export function listenToFavorites(cb) {
  if (Session.status !== "logged") return () => {};
  const q = query(
    collection(db, "users", Session.uid, "favorites"),
    orderBy("addedAt", "desc")
  );
  return onSnapshot(q, snap => {
    const favs = snap.docs.map(d => ({id: d.id, ...d.data()}));
    cb(favs);
  });
}

// --- Inicializar Auth State ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    let username = "Usuario";
    if (snap.exists()) {
      username = snap.data().username || "Usuario";
    }
    Session.set({status:"logged", uid:user.uid, email:user.email, username});
  } else {
    Session.clear();
  }
});

export { Session };
