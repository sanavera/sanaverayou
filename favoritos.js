// Contiene toda la lógica para gestionar las canciones favoritas,
// adaptándose si el usuario está registrado (Firestore) o es invitado (LocalStorage).

let favs = [];
const LS_GUEST_FAVS = "sy_favorites_v2"; // Nueva clave para evitar conflictos

// --- Funciones para Invitados (LocalStorage) ---

/**
 * Carga las canciones favoritas del invitado desde el Local Storage.
 * Esta función es llamada por firebase.js cuando se detecta que no hay usuario.
 */
function loadGuestFavorites() {
    try {
        favs = JSON.parse(localStorage.getItem(LS_GUEST_FAVS) || "[]");
    } catch {
        favs = [];
    }
    renderFavs();
}

/**
 * Guarda la lista actual de favoritos del invitado en el Local Storage.
 */
function saveGuestFavorites() {
    localStorage.setItem(LS_GUEST_FAVS, JSON.stringify(favs));
}

// --- Funciones para Usuarios Registrados (Firestore) ---

let favsUnsubscribe = null; // Para detener el listener al cerrar sesión

/**
 * Escucha en tiempo real los favoritos del usuario desde Firestore.
 * Esta función es llamada por firebase.js cuando un usuario inicia sesión.
 */
function loadUserFavorites() {
    const { currentUser, db, collection, query, onSnapshot, orderBy } = sy_fs();
    if (!currentUser) return;

    // Si hay un listener activo de un usuario anterior, lo detenemos
    if (favsUnsubscribe) favsUnsubscribe();

    const q = query(collection(db, "users", currentUser.uid, "favorites"), orderBy("addedAt", "desc"));

    favsUnsubscribe = onSnapshot(q, (snapshot) => {
        favs = snapshot.docs.map(doc => doc.data());
        renderFavs();
        refreshIndicators();
    });
}

/**
 * Guarda todos los favoritos en Firestore (usado al sincronizar).
 * @param {Array} favoritesArray - El array de favoritos a guardar.
 */
async function saveFavorites(favoritesArray) {
    const { currentUser, db, doc, setDoc, serverTimestamp } = sy_fs();
    if (!currentUser || !favoritesArray || favoritesArray.length === 0) return;

    const favCollectionRef = collection(db, "users", currentUser.uid, "favorites");
    for (const track of favoritesArray) {
        const trackWithTimestamp = { ...track, addedAt: serverTimestamp() };
        await setDoc(doc(favCollectionRef, track.id), trackWithTimestamp);
    }
}


// --- Lógica Unificada (Común para ambos tipos de usuario) ---

/**
 * Comprueba si una canción ya está en la lista de favoritos en memoria.
 * @param {string} id - El ID de la canción.
 * @returns {boolean}
 */
function isFav(id) {
    if (!id) return false;
    return favs.some(f => f.id === id);
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * Automáticamente decide si usar Firestore o LocalStorage.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
async function toggleFav(track) {
    if (!track || !track.id) {
        showToast("No se puede agregar esta canción a favoritos.", true);
        return;
    }
    
    const { currentUser, db, doc, setDoc, deleteDoc, serverTimestamp } = sy_fs();
    const isCurrentlyFav = isFav(track.id);

    if (currentUser) {
        // Lógica para usuario registrado (Firestore)
        const favDocRef = doc(db, "users", currentUser.uid, "favorites", track.id);
        try {
            if (isCurrentlyFav) {
                await deleteDoc(favDocRef);
                showToast("Quitado de Favoritos");
            } else {
                const trackWithTimestamp = { ...track, addedAt: serverTimestamp() };
                await setDoc(favDocRef, trackWithTimestamp);
                showToast("Agregado a Favoritos");
            }
        } catch (e) {
            console.error("Error al actualizar favoritos en Firestore:", e);
            showToast("No se pudo actualizar favoritos.", true);
        }
    } else {
        // Lógica para invitado (LocalStorage)
        if (isCurrentlyFav) {
            favs = favs.filter(f => f.id !== track.id);
            showToast("Quitado de Favoritos");
        } else {
            favs.unshift(track);
            showToast("Agregado a Favoritos");
        }
        saveGuestFavorites();
        renderFavs();
        refreshIndicators();
    }
}

/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 */
function renderFavs() {
    const ul = $("#favList");
    if (!ul) return;
    ul.innerHTML = "";

    if (favs.length === 0) {
        ul.innerHTML = `<div class="empty muted">Aún no tienes favoritos. Agrega canciones con el ícono de corazón.</div>`;
        updateHero(null);
        return;
    }

    favs.forEach(it => {
        const li = document.createElement("li");
        li.className = "fav-item";
        li.dataset.trackId = it.id;
        li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
            ${favIconSvg(isFav(it.id))}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
        
        li.addEventListener("click", e => {
            if (e.target.closest(".more") || e.target.closest(".fav-btn") || e.target.closest(".card-play")) return;
            playFromFav(it, true);
        });

        const cardPlayBtn = li.querySelector(".card-play");
        if (cardPlayBtn) {
            cardPlayBtn.onclick = (e) => {
                e.stopPropagation();
                if (currentTrack?.id === it.id) {
                    togglePlay();
                } else {
                    playFromFav(it, true);
                }
            };
        }
        ul.appendChild(li);
    });
    updateHero(currentTrack);
    refreshIndicators();
}

/**
 * Inicia la reproducción a partir de la lista de favoritos.
 * @param {object} track - La canción seleccionada para empezar a reproducir.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
function playFromFav(track, autoplay = false) {
    const i = favs.findIndex(f => f.id === track.id);
    setQueue(favs, "favs", Math.max(i, 0));
    viewingPlaylistId = null;
    playCurrent(autoplay);
}
