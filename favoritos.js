// Contiene la lógica para renderizar y reproducir desde la vista de favoritos.
import {
    userFavorites,
    isFav
} from './firebase.js';
import {
    cleanAuthor,
    favIconSvg,
    dotsSvg,
    $
} from './main.js';
import {
    setQueue,
    playCurrent,
    togglePlay,
    refreshIndicators,
    currentTrack
} from './reproductor.js';


/**
 * Actualiza el banner (hero) de la vista de favoritos.
 * @param {object|null} track - La canción actual para mostrar, o null.
 */
function updateHero(track) {
    const hero = $("#favHero");
    const title = $("#favNowTitle");
    if (!hero || !title) return;

    if (track && userFavorites.some(f => f.id === track.id)) {
        hero.style.backgroundImage = `url(${track.thumb})`;
        title.textContent = track.title;
    } else {
        const firstFav = userFavorites[0];
        hero.style.backgroundImage = firstFav ? `url(${firstFav.thumb})` : 'none';
        title.textContent = firstFav ? firstFav.title : 'Tus Canciones Favoritas';
    }
}


/**
 * Renderiza la lista de canciones favoritas en la vista "Favoritos".
 * Esta función es llamada por firebase.js cuando los datos de favoritos cambian.
 */
export function renderFavs() {
    const ul = $("#favList");
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
        <img class="thumb" src="${it.thumb}" alt="Miniatura de ${it.title}" onerror="this.src='logo78.png'">
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
            if (e.target.closest(".more, .fav-btn, .card-play")) return;
            playFromFav(it, true);
        });

        const cardPlayBtn = li.querySelector(".card-play");
        cardPlayBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentTrack?.id === it.id) {
                togglePlay();
            } else {
                playFromFav(it, true);
            }
        };
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
export function playFromFav(track, autoplay = false) {
    const i = userFavorites.findIndex(f => f.id === track.id);
    if (i === -1) return;

    setQueue(userFavorites, "favs", i);
    playCurrent(autoplay);
}
