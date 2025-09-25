// Contiene toda la lógica para gestionar las canciones favoritas.

let favs = [];

/**
 * Carga las canciones favoritas desde Firestore a través de un listener.
 * Esta función es llamada una sola vez para inicializar el listener.
 * Los datos se actualizarán automáticamente.
 */
function initFavorites() {
    window.syAuth.onFavoritesChange(newFavs => {
        favs = newFavs;
        renderFavs();
        updateUIOnTrackChange(); // Asegura que los indicadores de favorito se actualicen
    });
}

/**
 * Comprueba si una canción ya está en favoritos, usando su ID único.
 * @param {string} id - El ID de la canción (de YouTube o Archive.org).
 * @returns {boolean} - True si es favorita, false si no.
 */
function isFav(id) {
    if (!id) return false;
    return favs.some(f => f.id === id);
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * Funciona tanto para canciones de YouTube como de Archive.org.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
async function toggleFav(track) {
    if (!track || !track.id) {
        showToast("No se puede agregar a favoritos esta canción.", true);
        return;
    }
    
    if (isFav(track.id)) {
        await window.syAuth.removeFavorite(track);
        showToast("Quitado de Favoritos");
    } else {
        await window.syAuth.addFavorite(track);
        showToast("Agregado a Favoritos");
    }
}

/**
 * Renderiza la lista de canciones favoritas en la vista de favoritos.
 */
function renderFavs() {
    const ul = $("#favsList");
    if (!ul) return;
    ul.innerHTML = "";

    if (favs.length === 0) {
        ul.innerHTML = `<div class="empty muted" style="margin-top: 24px;">
            Aún no tienes canciones favoritas.<br/>
            Puedes agregarlas desde los resultados de búsqueda o playlists.
        </div>`;
        return;
    }

    favs.forEach(it => {
        const li = document.createElement("li");
        li.className = "result-item fav-item";
        li.dataset.trackId = it.id;
        li.innerHTML = `
      <button class="card-play" aria-label="Reproducir">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </button>
      <img src="${it.thumb}" alt="Cover art">
      <div class="meta">
        <div class="title">${it.title}</div>
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
    setQueue(favs, "favorites", i);
    switchView("view-player");
    if (autoplay) playCurrent(true);
}
