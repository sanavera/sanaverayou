// favoritos.js
import { listenToFavorites, addFavorite, removeFavorite, Session } from './firebase.js';

let favs = [];

// --- Cargar favoritos según estado ---
function loadFavs() {
    if (Session.status === "logged") {
        listenToFavorites(newFavs => {
            favs = newFavs; // ya trae {id, trackId, ...}
            renderFavs();
            refreshIndicators();
        });
    } else {
        favs = [];
        renderFavs();
        refreshIndicators();
    }
}

// --- Verificar si un track está en favoritos ---
function isFav(trackId) {
    return favs.some(f => f.trackId === trackId);
}

// --- Alternar favorito ---
function toggleFav(track) {
    if (Session.status !== "logged") {
        showAlert("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
        return;
    }

    if (isFav(track.id)) {
        const favToRemove = favs.find(f => f.trackId === track.id);
        if (favToRemove) {
            removeFavorite(favToRemove.id);
            showToast("Quitado de Favoritos");
        }
    } else {
        addFavorite(track);
        showToast("Agregado a Favoritos");
    }
}

// --- Renderizar favoritos en la UI ---
function renderFavs() {
    const ul = $("#favList");
    if (!ul) return;
    ul.innerHTML = "";

    if (Session.status !== "logged") {
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
        <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito" aria-label="Agregar/Quitar Favorito">
            ${favIconSvg(isFav(it.trackId))}
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
                if (currentTrack?.id === it.trackId) {
                    togglePlay();
                } else {
                    playFromFav(it, true);
                }
            };
        }

        const favBtn = li.querySelector(".fav-btn");
        if (favBtn) {
            favBtn.onclick = (e) => {
                e.stopPropagation();
                toggleFav(it);
            };
        }

        ul.appendChild(li);
    });

    updateHero(currentTrack);
    refreshIndicators();
}

// --- Reproducir desde favoritos ---
function playFromFav(track, autoplay = false) {
    const i = favs.findIndex(f => f.trackId === track.trackId);
    setQueue(
        favs.map(f => ({
            id: f.trackId,
            title: f.title,
            author: f.artist,
            thumb: f.coverUrl,
            source: f.source
        })),
        "favs",
        Math.max(i, 0)
    );
    viewingPlaylistId = null;
    playCurrent(autoplay);
}

export { loadFavs, toggleFav, isFav };
