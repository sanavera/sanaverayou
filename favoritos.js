// Contiene la lógica para renderizar y reproducir desde la vista de favoritos.
import { userFavorites, isFav } from './firebase.js';

/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 * Esta función es llamada por firebase.js cuando los datos de favoritos cambian.
 */
export function renderFavs() {
    const ul = document.getElementById("favList");
    if (!ul) return;
    ul.innerHTML = "";

    if (!userFavorites || userFavorites.length === 0) {
        ul.innerHTML = `<div class="empty muted">Aún no tienes favoritos. Agrega canciones con el ícono de corazón.</div>`;
        updateHero(null);
        return;
    }

    userFavorites.forEach(it => {
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
                if (window.currentTrack?.id === it.id) {
                    togglePlay();
                } else {
                    playFromFav(it, true);
                }
            };
        }
        ul.appendChild(li);
    });
    
    // Asumimos que updateHero y refreshIndicators son funciones globales disponibles
    if (typeof updateHero === 'function') updateHero(window.currentTrack);
    if (typeof refreshIndicators === 'function') refreshIndicators();
}

/**
 * Inicia la reproducción a partir de la lista de favoritos.
 * @param {object} track - La canción seleccionada para empezar a reproducir.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
export function playFromFav(track, autoplay = false) {
    const i = userFavorites.findIndex(f => f.id === track.id);
    if (i === -1) return;
    
    // Asumimos que setQueue y playCurrent son funciones globales
    if (typeof setQueue === 'function' && typeof playCurrent === 'function') {
        setQueue(userFavorites, "favs", i);
        window.viewingPlaylistId = null;
        playCurrent(autoplay);
    }
}
