// Contiene toda la lógica para gestionar las canciones favoritas.

let favs = [];
const LS_FAVS = "sanayera_favs_v1";

/**
 * Carga las canciones favoritas desde el Local Storage.
 */
function loadFavs() {
    try {
        favs = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
    } catch {
        favs = [];
    }
}

/**
 * Guarda la lista actual de favoritos en el Local Storage.
 */
function saveFavs() {
    localStorage.setItem(LS_FAVS, JSON.stringify(favs));
}

/**
 * Comprueba si una canción ya está en favoritos.
 * @param {string} id - El ID de la canción.
 * @returns {boolean} - True si es favorita, false si no.
 */
function isFav(id) {
    return favs.some(f => f.id === id);
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
function toggleFav(track) {
    if (isFav(track.id)) {
        favs = favs.filter(f => f.id !== track.id);
        showToast("Quitado de Favoritos");
    } else {
        favs.unshift(track);
        showToast("Agregado a Favoritos");
    }
    saveFavs();
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
