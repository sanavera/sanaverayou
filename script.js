/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?_?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial|full album|full song|cover|audio|hd)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"")
  .replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "")
  .replace(/VEVO/gi, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*-\s*$/, "")
  .trim();
const dotsSvg = () => `
  <svg class="icon-dots" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
  </svg>`;
const shuffleArray = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/* ========= DOM ELEMENTS ========= */
const $playerView     = $("#view-player");
const $playerControls = $(".player-controls");
const $playerClose    = $(".player-close");
const $miniPlayer     = $(".mini-player");
const $miniPlay       = $("#miniPlay");
const $miniTitle      = $("#miniTitle");
const $miniArtist     = $("#miniArtist");
const $miniCover      = $("#miniCover");
const $playerPlay     = $("#playerPlay");
const $playerTitle    = $("#npTitle");
const $playerAuthor   = $("#npAuthor");
const $playerCover    = $("#npCover");
const $playerTime     = $("#playerTime");
const $playerDuration = $("#playerDuration");
const $searchBox      = $("#searchBox");
const $searchGrid     = $("#searchGrid");
const $favsList       = $("#favsList");
const $playlistsGrid  = $("#playlistsGrid");
const $homeGrid       = $("#homeGrid");
const $navBtns        = $$(".nav-btn");
const $themeToggle    = $("#themeToggle");
const $searchFab      = $("#searchFab");

/* ========= App state ========= */
let IS_PLAYING = false;
let CURRENT_VIDEO = null;
let SEARCH_TERM = "";
let SEARCH_PAGE = 1;
let IS_SEARCHING = false;
let SEARCH_RESULTS = [];
let FAVORITES = JSON.parse(localStorage.getItem("sanavera-favs")) || [];
let PLAYLISTS = JSON.parse(localStorage.getItem("sanavera-playlists")) || [];
const PLAYER = new Audio();
let CURATED_RAW = [
  {"id":"w_8b056F1fQ","title":"Los Bunkers - La exiliada del Sur (Video Oficial)","author":"Los Bunkers"},
  {"id":"8n2_w7_1gY4","title":"Los Bunkers - Pobre Corazón (En Vivo)","author":"Los Bunkers"},
  {"id":"U2f14jWfFjw","title":"The Black Keys - Fever [Official Music Video]","author":"The Black Keys"},
  {"id":"dD9P6eT0q4s","title":"Gorillaz - Feel Good Inc. (Official Video)","author":"Gorillaz"},
  {"id":"K2I4H2WqW9U","title":"Daft Punk - One More Time (Official Video)","author":"Daft Punk"},
  {"id":"eYcKxQzKq8M","title":"Muse - Supermassive Black Hole [Official Video]","author":"Muse"},
  {"id":"p-Z3te811Hw","title":"Korn - Freak on a Leash (Official Music Video)","author":"Korn"},
  {"id":"3-Z3te811Hw","title":"Rage Against The Machine - Killing In The Name (Official HD Video)","author":"Rage Against The Machine"},
  {"id":"G-L8-d5sK6w","title":"Arctic Monkeys - Do I Wanna Know? (Official Video)","author":"Arctic Monkeys"},
  {"id":"C-u5o1VfDSo","title":"Radiohead - Creep","author":"Radiohead"},
  {"id":"eLgQhB1KzD0","title":"Depeche Mode - Enjoy the Silence (Official Video)","author":"Depeche Mode"},
  {"id":"t-fK5WfJtM0","title":"Queen - Bohemian Rhapsody (Official Video)","author":"Queen"},
  {"id":"v2y3J2N3FfI","title":"Led Zeppelin - Stairway to Heaven (Official Audio)","author":"Led Zeppelin"}
];
let CURATED_VIDEOS = [];

/* ========= App Logic ========= */
const mapCurated = (list) => list.map(v => ({
  id: v.id,
  title: cleanTitle(v.title),
  author: cleanAuthor(v.author),
  thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
}));

const renderHomeGrid = () => {
  $homeGrid.innerHTML = "";
  CURATED_VIDEOS.forEach(v => {
    const card = document.createElement("div");
    card.className = "home-card";
    card.dataset.id = v.id;
    card.innerHTML = `
      <img src="${v.thumb}" alt="${v.title}" />
      <div class="home-meta">
        <div class="home-title-meta">${v.title}</div>
        <div class="home-artist-meta">${v.author}</div>
      </div>
    `;
    card.onclick = () => playVideo(v);
    $homeGrid.appendChild(card);
  });
};

const playVideo = (video, time = 0) => {
  CURRENT_VIDEO = video;
  const url = `https://sanavera-youtube-api.vercel.app/api?id=${video.id}`;
  PLAYER.src = url;
  PLAYER.currentTime = time;
  PLAYER.play();
  IS_PLAYING = true;
  updateMiniPlayer();
  updatePlayerView();
  $miniPlayer.classList.add("active");
  $playerView.classList.add("active");
  window.scrollTo(0, 0);
  document.body.style.overflow = "hidden";
};

const updateMiniPlayer = () => {
  if (CURRENT_VIDEO) {
    $miniTitle.textContent = CURRENT_VIDEO.title;
    $miniArtist.textContent = CURRENT_VIDEO.author;
    $miniCover.src = CURRENT_VIDEO.thumb;
    $miniPlay.classList.add("active");
  } else {
    $miniTitle.textContent = "No hay música";
    $miniArtist.textContent = "";
    $miniCover.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-12h2v6h-2v-6zm3 0h2v6h-2v-6zm-6 0h2v6h-2v-6z'/></svg>";
    $miniPlay.classList.remove("active");
  }
};

const updatePlayerView = () => {
  if (CURRENT_VIDEO) {
    $playerTitle.textContent = CURRENT_VIDEO.title;
    $playerAuthor.textContent = CURRENT_VIDEO.author;
    $playerCover.src = CURRENT_VIDEO.thumb;
    $playerPlay.classList.add("active");
  } else {
    $playerTitle.textContent = "Sin canción";
    $playerAuthor.textContent = "";
    $playerCover.src = "";
    $playerPlay.classList.remove("active");
  }
};

const togglePlayback = () => {
  if (IS_PLAYING) {
    PLAYER.pause();
    IS_PLAYING = false;
  } else {
    PLAYER.play();
    IS_PLAYING = true;
  }
  $miniPlay.classList.toggle("active", IS_PLAYING);
  $playerPlay.classList.toggle("active", IS_PLAYING);
};

const seek = (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = x / rect.width;
  PLAYER.currentTime = percentage * PLAYER.duration;
};

const formatTime = (time) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const loadFavs = () => {
  FAVORITES.forEach(v => {
    v.isFavorite = true;
  });
  renderFavs();
};

const toggleFav = (video) => {
  const index = FAVORITES.findIndex(v => v.id === video.id);
  if (index > -1) {
    FAVORITES.splice(index, 1);
  } else {
    FAVORITES.push(video);
  }
  localStorage.setItem("sanavera-favs", JSON.stringify(FAVORITES));
  renderFavs();
};

const renderFavs = () => {
  $favsList.innerHTML = "";
  FAVORITES.forEach(v => {
    const card = document.createElement("li");
    card.className = "track-card";
    card.dataset.id = v.id;
    card.innerHTML = `
      <div class="track-card-cover">
        <img src="${v.thumb}" alt="${v.title}" />
      </div>
      <div class="track-card-meta">
        <h3>${v.title}</h3>
        <div>${v.author}</div>
      </div>
      <button class="dots-btn add-to-favs">
        ${dotsSvg()}
      </button>
    `;
    card.onclick = () => playVideo(v);
    $favsList.appendChild(card);
  });
};

const loadPlaylists = () => {
  renderPlaylists();
};

const renderPlaylists = () => {
  // Aquí se renderizarían las listas de reproducción, en este momento es un placeholder
};

const searchYouTube = async (query, pageToken = "") => {
  IS_SEARCHING = true;
  try {
    const response = await fetch(`https://sanavera-youtube-api.vercel.app/api/search?q=${query}&pageToken=${pageToken}`);
    const data = await response.json();
    const results = data.results.map(v => ({
      id: v.videoId,
      title: cleanTitle(v.title),
      author: cleanAuthor(v.channelTitle),
      thumb: v.thumbnails.high.url
    }));
    SEARCH_RESULTS = [...SEARCH_RESULTS, ...results];
    renderSearchResults(results);
    SEARCH_PAGE = data.nextPageToken || null;
  } catch (err) {
    console.error("Error en la búsqueda:", err);
  }
  IS_SEARCHING = false;
};

const renderSearchResults = (results) => {
  if (SEARCH_PAGE === 1) $searchGrid.innerHTML = "";
  results.forEach(v => {
    const card = document.createElement("div");
    card.className = "search-card";
    card.dataset.id = v.id;
    card.innerHTML = `
      <div class="search-card-cover">
        <img src="${v.thumb}" alt="${v.title}" />
      </div>
      <div class="search-card-meta">
        <h3>${v.title}</h3>
        <div>${v.author}</div>
      </div>
      <button class="dots-btn add-to-favs">
        ${dotsSvg()}
      </button>
    `;
    card.onclick = () => playVideo(v);
    card.querySelector(".add-to-favs").onclick = (e) => {
      e.stopPropagation();
      toggleFav(v);
    };
    $searchGrid.appendChild(card);
  });
};

const loadNextPage = () => {
  if (IS_SEARCHING || !SEARCH_PAGE) return;
  searchYouTube(SEARCH_TERM, SEARCH_PAGE);
};

/* ========= EVENT LISTENERS ========= */
$navBtns.forEach(btn => {
  btn.onclick = (e) => {
    const view = e.currentTarget.dataset.view;
    $$(".view").forEach(v => v.classList.remove("active"));
    $$(".nav-btn").forEach(b => b.classList.remove("active"));
    $(`#${view}`).classList.add("active");
    e.currentTarget.classList.add("active");

    if (view === "view-player") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
      heroScrollTick();
    }
    if (view === "view-search" && SEARCH_TERM) {
      $searchFab.style.display = "none";
    } else {
      $searchFab.style.display = "flex";
    }
  };
});

$miniPlayer.onclick = () => {
  if (CURRENT_VIDEO) {
    $("#view-player").classList.add("active");
    document.body.style.overflow = "hidden";
  }
};
$playerClose.onclick = () => {
  $("#view-player").classList.remove("active");
  document.body.style.overflow = "auto";
};
$miniPlay.onclick = (e) => {
  e.stopPropagation();
  togglePlayback();
};
$playerPlay.onclick = togglePlayback;

PLAYER.ontimeupdate = () => {
  if (PLAYER.duration) {
    const percentage = (PLAYER.currentTime / PLAYER.duration) * 100;
    $("#trackProgress .track-progress-bar").style.width = `${percentage}%`;
    $("#trackProgressLarge .track-progress-bar").style.width = `${percentage}%`;
    $playerTime.textContent = fmt(PLAYER.currentTime);
    $playerDuration.textContent = fmt(PLAYER.duration);
  }
};

PLAYER.onended = () => {
  IS_PLAYING = false;
  $miniPlay.classList.remove("active");
  $playerPlay.classList.remove("active");
};

$("#trackProgressLarge").onclick = seek;
$("#trackProgress").onclick = seek;

$searchBox.onkeyup = (e) => {
  SEARCH_TERM = e.target.value.trim();
  if (SEARCH_TERM.length > 2) {
    SEARCH_PAGE = 1;
    SEARCH_RESULTS = [];
    searchYouTube(SEARCH_TERM);
  }
  $("#clearSearch").style.opacity = SEARCH_TERM.length > 0 ? 1 : 0;
};
$("#clearSearch").onclick = () => {
  $searchBox.value = "";
  SEARCH_TERM = "";
  $searchGrid.innerHTML = "";
  $("#clearSearch").style.opacity = 0;
};
$searchFab.onclick = () => {
  $navBtns[1].click();
};

/* ========= HERO shrink en scroll ========= */
function heroScrollTick(){
  const active = document.querySelector(".view.active");
  if(!active) return;
  const hero = active.id==="view-favs" ? $("#favHero")
             : active.id==="view-player" ? $("#npHero")
             : null;
  if(!hero) return;
  const scrollElement = active;
  const y = Math.max(0, scrollElement.scrollTop);
  const DIST = 240;
  const t = Math.max(0, Math.min(1, y / DIST));
  hero.style.setProperty("--hero-t", t);
}
$$(".view").forEach(v => {
  if (v.id === "view-favs" || v.id === "view-player") {
    v.addEventListener("scroll", heroScrollTick, {passive:true});
  }
});
window.addEventListener("resize", heroScrollTick);

/* ========= Init ========= */
function bootHome(){
  CURATED_VIDEOS = mapCurated(shuffleArray(CURATED_RAW));
  renderHomeGrid();
}

function restoreState() {
  const savedState = JSON.parse(localStorage.getItem('appState'));
  if (savedState) {
    if (savedState.view) {
      $navBtns.forEach(btn => {
        if (btn.dataset.view === savedState.view) {
          btn.click();
        }
      });
    }
    if (savedState.search.term) {
      $searchBox.value = savedState.search.term;
      SEARCH_TERM = savedState.search.term;
      SEARCH_RESULTS = savedState.search.results;
      renderSearchResults(SEARCH_RESULTS);
      $("#clearSearch").style.opacity = 1;
    }
    if (savedState.player.currentVideo) {
      playVideo(savedState.player.currentVideo, savedState.player.currentTime);
      if (!savedState.player.isPlaying) {
        PLAYER.pause();
        IS_PLAYING = false;
        $miniPlay.classList.remove("active");
        $playerPlay.classList.remove("active");
      }
    }
  }
}

function saveState() {
  const currentState = {
    view: document.querySelector(".view.active").id,
    player: {
      currentVideo: CURRENT_VIDEO,
      currentTime: PLAYER.currentTime,
      isPlaying: IS_PLAYING
    },
    search: {
      term: SEARCH_TERM,
      results: SEARCH_RESULTS
    }
  };
  localStorage.setItem('appState', JSON.stringify(currentState));
}

window.addEventListener('beforeunload', saveState);

bootHome();
loadFavs();
loadPlaylists();
document.addEventListener("DOMContentLoaded", restoreState);


