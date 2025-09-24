// Contiene toda la lógica para gestionar las canciones favoritas.

let favs = [];
const LS_FAVS = "sanayera_favs_v1";

/**
 * Carga las canciones favoritas desde el Local Storage si el usuario es invitado,
 * o desde Firestore si está logueado.
 */
async function loadFavs() {
    const session = Session.get();
    if (session.status === "guest") {
        try {
            favs = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
        } catch {
            favs = [];
        }
    } else {
        try {
            favs = await listFavorites();
        } catch (e) {
            console.error("Error cargando favoritos de Firestore:", e);
            favs = [];
        }
    }
}

/**
 * Comprueba si una canción ya está en favoritos, usando su ID único.
 * @param {string} id - El ID de la canción (de YouTube o Archive.org).
 * @returns {boolean} - True si es favorita, false si no.
 */
function isFav(id) {
    if (!id) return false;
    return favs.some(f => f.trackId === id || f.id === id);
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
async function toggleFav(track) {
    if (!canActivate("favorites")) return;

    if (!track || !track.id) {
        showAlert("No se puede agregar a favoritos esta canción.");
        return;
    }
    
    const isCurrentlyFav = isFav(track.id);

    try {
        if (isCurrentlyFav) {
            const favToRemove = favs.find(f => f.trackId === track.id || f.id === track.id);
            if (favToRemove) {
                await removeFavorite(favToRemove.id);
                showAlert("Quitado de Favoritos");
            }
        } else {
            const trackObj = {
                trackId: track.id,
                title: track.title,
                artist: track.author,
                coverUrl: track.thumb,
                source: track.source,
                addedAt: new Date().toISOString()
            };
            await addFavorite(trackObj);
            showAlert("Agregado a Favoritos");
        }
    } catch (error) {
        showAlert(error.message);
    }
    await loadFavs();
    renderFavs();
    refreshIndicators();
}

/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 */
function renderFavs() {
    const ul = $("#favList");
    if (!ul) return;
    ul.innerHTML = "";
    
    const session = Session.get();
    if (session.status === "guest") {
        ul.innerHTML = `<div class="empty muted">Registrate para guardar favoritos.</div>`;
        updateHero(null);
        return;
    }

    if (favs.length === 0) {
        ul.innerHTML = `<div class="empty muted">Aún no tienes favoritos. Agrega canciones con el ícono de corazón.</div>`;
        updateHero(null);
        return;
    }

    favs.forEach(it => {
        const li = document.createElement("li");
        li.className = "fav-item";
        li.dataset.trackId = it.trackId;
        li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${it.coverUrl}" alt="">
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
        <div class="subtitle">${cleanAuthor(it.artist) || ""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn fav-btn is-fav" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
            ${favIconSvg(true)}
        </button>
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
        
        li.addEventListener("click", async e => {
            if (e.target.closest(".more") || e.target.closest(".fav-btn") || e.target.closest(".card-play")) return;
            const trackToPlay = await getTrackDetailsForPlayback(it);
            if(trackToPlay) playFromFav(trackToPlay, true);
        });

        const cardPlayBtn = li.querySelector(".card-play");
        if (cardPlayBtn) {
            cardPlayBtn.onclick = async (e) => {
                e.stopPropagation();
                const trackToPlay = await getTrackDetailsForPlayback(it);
                if (!trackToPlay) return;

                if (currentTrack?.id === trackToPlay.id) {
                    togglePlay();
                } else {
                    playFromFav(trackToPlay, true);
                }
            };
        }
        ul.appendChild(li);
    });
    updateHero(currentTrack);
    refreshIndicators();
}

/**
 * Obtiene detalles adicionales de un track si es necesario para la reproducción.
 * @param {object} favTrack - El objeto de favorito de Firestore.
 * @returns {Promise<object|null>} - El objeto de la canción listo para reproducir.
 */
async function getTrackDetailsForPlayback(favTrack) {
    // Si la canción ya es de YT, no necesitamos hacer nada más.
    if (favTrack.source === "youtube") {
        return {
            id: favTrack.trackId,
            title: favTrack.title,
            author: favTrack.artist,
            thumb: favTrack.coverUrl,
            source: favTrack.source,
            type: 'youtube_video'
        };
    }
    // Lógica para otros tipos de fuente si fuera necesario, como Archive.org
    return null;
}

/**
 * Inicia la reproducción a partir de la lista de favoritos.
 * @param {object} track - La canción seleccionada para empezar a reproducir.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
function playFromFav(track, autoplay = false) {
    const i = favs.findIndex(f => f.trackId === track.id || f.id === track.id);
    setQueue(favs.map(f => {
        return {
            id: f.trackId,
            title: f.title,
            author: f.artist,
            thumb: f.coverUrl,
            source: f.source,
            type: (f.source === 'youtube') ? 'youtube_video' : f.source
        };
    }), "favs", Math.max(i, 0));
    viewingPlaylistId = null;
    playCurrent(autoplay);
}

// Escucha el cambio de estado de autenticación para recargar favoritos
onAuthChange(async (session) => {
    if (session.status === 'logged' && localStorage.getItem(LS_FAVS)) {
        // Migrar favoritos de localStorage a Firestore
        const localFavs = JSON.parse(localStorage.getItem(LS_FAVS));
        for (const fav of localFavs) {
            const trackObj = {
                trackId: fav.id,
                title: fav.title,
                artist: fav.author,
                coverUrl: fav.thumb,
                source: fav.source,
                addedAt: new Date().toISOString()
            };
            try {
                await addFavorite(trackObj);
            } catch (e) {
                console.error("Error migrando favorito:", e);
            }
        }
        localStorage.removeItem(LS_FAVS);
        showAlert("Tus favoritos locales se han sincronizado con tu cuenta.");
    }
    await loadFavs();
    renderFavs();
});
