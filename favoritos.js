// Contiene toda la lógica para gestionar las canciones favoritas, adaptada para usuarios.

/**
 * Comprueba si una canción ya está en favoritos.
 * @param {string} id - El ID de la canción.
 * @returns {boolean} - True si es favorita.
 */
function isFav(id) {
    if (!id) return false;
    return favs.some(f => f.id === id);
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * Guarda en Firestore para usuarios registrados y en LocalStorage para invitados.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
async function toggleFav(track) {
    if (!track || !track.id) {
        showToast("No se puede agregar esta canción a favoritos.", true);
        return;
    }

    const { currentUser, db, collection, doc, setDoc, deleteDoc, serverTimestamp } = sy_fs();
    const isCurrentlyFav = isFav(track.id);

    if (currentUser) {
        // --- USUARIO REGISTRADO (Firestore) ---
        const trackDocRef = doc(db, `users/${currentUser.uid}/favs`, track.id);
        try {
            if (isCurrentlyFav) {
                await deleteDoc(trackDocRef);
                showToast("Quitado de Favoritos");
            } else {
                await setDoc(trackDocRef, { ...track, addedAt: serverTimestamp() });
                showToast("Agregado a Favoritos");
            }
        } catch (e) {
            console.error("Error al actualizar favoritos en Firestore:", e);
            showToast("No se pudo actualizar favoritos.", true);
        }
    } else {
        // --- USUARIO INVITADO (LocalStorage) ---
        if (isCurrentlyFav) {
            favs = favs.filter(f => f.id !== track.id);
            showToast("Quitado de Favoritos");
        } else {
            favs.unshift(track); // Agrega al principio
            showToast("Agregado a Favoritos");
        }
        saveGuestFavs(); // Esta función está en firebase.js para guardar en LS
        // Para invitados, el renderizado debe ser manual
        renderFavs();
        refreshIndicators();
    }
    // Para usuarios registrados, el listener onSnapshot se encargará de re-renderizar.
}


/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 * Lee directamente de la variable global `favs`.
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
