// Contiene toda la lógica para gestionar las canciones favoritas.
let favs = [];
const LS_FAVS = "sanayera_favs_v1";

/**
 * Carga las canciones favoritas desde Firestore si el usuario está logueado.
 * De lo contrario, carga desde localStorage.
 */
async function loadFavs() {
    if (window.Session.status === 'logged') {
        try {
            const { listFavorites } = window.firebase;
            favs = await listFavorites();
        } catch (e) {
            console.error("Error al cargar favoritos de Firestore:", e);
            favs = [];
        }
    } else {
        try {
            favs = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
        } catch {
            favs = [];
        }
    }
}

/**
 * Agrega o quita una canción de la lista de favoritos.
 * @param {object} track - El objeto de la canción a agregar/quitar.
 */
async function toggleFav(track) {
    if (!canActivate('favorites')) return;

    if (!track || !track.id) {
        showToast("No se puede agregar a favoritos esta canción.", true);
        return;
    }
    
    if (isFav(track.id)) {
        try {
            const { removeFavorite } = window.firebase;
            await removeFavorite(favs.find(f => f.id === track.id)?.favId);
            showToast("Quitado de Favoritos");
        } catch(e) {
            showToast(e.message, true);
        }
    } else {
        try {
            const { addFavorite } = window.firebase;
            await addFavorite(track);
            showToast("Agregado a Favoritos");
        } catch (e) {
            showToast(e.message, true);
        }
    }
    // La renderización se actualizará con onSnapshot desde Firestore en firebase.js
}

/**
 * Comprueba si una canción ya está en favoritos.
 * @param {string} id - El ID de la canción.
 * @returns {boolean} - True si es favorita, false si no.
 */
function isFav(id) {
    if (!id) return false;
    return favs.some(f => f.id === id);
}

/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 */
function renderFavs() {
    const ul = $("#favList");
    if (!ul) return;
    ul.innerHTML = "";
    
    if (window.Session.status === 'guest') {
        ul.innerHTML = `<div class="empty muted">Regístrate o inicia sesión para guardar tus favoritos.</div>`;
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
