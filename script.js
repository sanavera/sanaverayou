/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"-MP3")
  .replace(/\((official\s*)?(music\s*)?video.*??\)/ig,"-MP3")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"-MP3")
  .replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"")
  .replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, " MP3")
  .replace(/VEVO/gi, " MP3")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*-\s*$/, "")
  .trim();
const dotsSvg = () => `
  <svg class="icon-dots" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
  </svg>
`;
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

/* ========= Data mockada (en un proyecto real sería una API) ========= */
let CURATED_VIDEOS = [];
const CURATED_RAW = [
  { id: "4-Q6A3bA3L4", title: "C. Tangana, Toquinho - Comiendo Sopa", author: "C. Tangana" },
  { id: "P2x-8-i23sM", title: "Aitana - Los Ángeles", author: "Aitana" },
  { id: "M7w462aD4F4", title: "Feid - FERXXO 100", author: "Feid" },
  { id: "l-hX8-zVjV4", title: "Bizarrap, Shakira - BZRP Music Sessions #53", author: "Bizarrap" },
  { id: "kJw-L8K-w_s", title: "Bad Bunny - Tití Me Preguntó", author: "Bad Bunny" },
  { id: "k-z60D9Dk2U", title: "Karol G, Shakira - TQG", author: "Karol G" },
  { id: "0-M8x9k9-Fw", title: "ROSALÍA - DESPECHÁ", author: "ROSALÍA" },
  { id: "H9QoO5K4q8c", title: "Rauw Alejandro - Lokera", author: "Rauw Alejandro" },
  { id: "h-g-e-o-o9U", title: "C. Tangana - Demasiadas Mujeres", author: "C. Tangana" },
  { id: "1-J_0j5d-fI", title: "Camilo - Ropa Cara", author: "Camilo" },
  { id: "Z-T8vPjXp6Q", title: "Sebastian Yatra, Myke Towers - Pareja del Año", author: "Sebastian Yatra" },
  { id: "5s5-G0-y3O8", title: "Tiago PZK, Tini - El Papi", author: "Tiago PZK" },
  { id: "D-kFwz_H9A4", title: "Duki - She Don't Give a FO", author: "Duki" },
  { id: "fJ9w9Nf8yXk", title: "Nathy Peluso - Ateo", author: "Nathy Peluso" },
  { id: "mJq_y4F10bE", title: "Trueno - Tierra Zanta", author: "Trueno" },
  { id: "j_t-aX6M-hI", title: "María Becerra - Animal", author: "María Becerra" },
  { id: "D-g8v-B8A6s", title: "Nicki Nicole - Wapo Traketero", author: "Nicki Nicole" },
  { id: "z-W7l-g4x7A", title: "L-Gante, Bizarrap - BZRP Music Sessions #38", author: "L-Gante" },
];

let favs = JSON.parse(localStorage.getItem("favs") || "[]");
let playlists = JSON.parse(localStorage.getItem("playlists") || "[]");

/* ========= Youtube Player State ========= */
let player;
let activeVideo = null;
let playerReady = false;
let isPlaying = false;
let playerViewIsActive = false;
let miniplayerState = {
  playing: false,
  visible: false,
};

/* ========= Vistas y Navegación ========= */
const views = $$(".view");
const navBtns = $$(".nav-btn");
const navBar = $("#navBar");
const miniplayerContainer = $("#miniplayer");

function showView(viewId) {
  const targetView = $(`#${viewId}`);
  if (targetView.classList.contains("active")) return;

  const currentView = $(".view.active");
  
  if (currentView) {
    currentView.classList.remove("active");
    currentView.classList.add("moving");
  }
  
  targetView.classList.add("active");
  
  setTimeout(() => {
    if (currentView) {
      currentView.classList.remove("moving");
    }
    document.body.dataset.viewActive = viewId;
  }, 400);

  $$(".nav-btn").forEach((btn) => {
    if (btn.dataset.view === viewId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  playerViewIsActive = viewId === "view-player";
  heroScrollTick();
}

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    showView(btn.dataset.view);
  });
});

/* ========= Player logic ========= */
function onYouTubeIframeAPIReady() {
  playerReady = true;
  player = new YT.Player("youtubePlayer", {
    height: "100%",
    width: "100%",
    videoId: "",
    playerVars: {
      autoplay: 0,
      modestbranding: 1,
      rel: 0,
      showinfo: 0,
      controls: 1,
      disablekb: 1,
      fs: 0,
    },
    events: {
      onStateChange: onPlayerStateChange,
    },
  });
}

function playVideo(video) {
  if (!playerReady) return;
  activeVideo = video;
  showView("view-player");
  player.loadVideoById(video.id);
  updateMiniplayer(video, true);
  updatePlayerHero(video);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updateMiniplayer(activeVideo, true);
  } else {
    isPlaying = false;
    updateMiniplayer(activeVideo, false);
  }
}

function updateMiniplayer(video, playing) {
  if (!video) {
    miniplayerState.visible = false;
    miniplayerContainer.classList.remove("active");
    return;
  }
  miniplayerState.visible = true;
  miniplayerState.playing = playing;
  miniplayerContainer.classList.add("active");
  miniplayerContainer.classList.toggle("playing", playing);
  $("#miniPlayerTitle").textContent = cleanTitle(video.title);
  $("#miniPlayerAuthor").textContent = cleanAuthor(video.author);
}

$("#miniPlayerToggle").addEventListener("click", () => {
  if (player && activeVideo) {
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }
});

$("#miniPlayerTrack").addEventListener("click", () => {
  if (activeVideo) {
    showView("view-player");
  }
});

$("#miniPlayerClose").addEventListener("click", () => {
  player.stopVideo();
  updateMiniplayer(null, false);
});

function updatePlayerHero(video) {
  if (video) {
    $("#npHeroTitle").textContent = cleanTitle(video.title);
    $("#npHeroAuthor").textContent = cleanAuthor(video.author);
  } else {
    $("#npHeroTitle").textContent = "";
    $("#npHeroAuthor").textContent = "";
  }
}

/* ========= Home Grid ========= */
const homeGrid = $("#homeGrid");

function mapCurated(data) {
  return data.map(v => ({
    id: v.id,
    title: v.title,
    author: v.author,
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
  }));
}

function renderHomeGrid() {
  homeGrid.innerHTML = CURATED_VIDEOS.map(v => `
    <div class="home-card" data-video-id="${v.id}" onclick="playVideo(CURATED_VIDEOS.find(v => v.id === '${v.id}'))">
      <img src="${v.thumb}" alt="${v.title}" loading="lazy" />
      <div class="home-meta">
        <h3 class="home-title-card">${cleanTitle(v.title)}</h3>
        <p class="home-author-card">${cleanAuthor(v.author)}</p>
      </div>
    </div>
  `).join("");
}

function updateHomeGridVisibility() {
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = 1;
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.2 });
  $$('.home-card').forEach(card => {
    card.style.opacity = 0;
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
  });
}

/* ========= Home Grid Shuffling ========= */
function bootHome() {
  CURATED_VIDEOS = mapCurated(CURATED_RAW);
  shuffleArray(CURATED_VIDEOS); // Aquí se agrega la rotación de videos
  renderHomeGrid();
  updateHomeGridVisibility();
}

/* ========= Search logic ========= */
const searchInput = $("#searchInput");
const searchResults = $("#searchResults");
const searchClearBtn = $("#search-clear-btn");
const searchFab = $("#searchFab");

searchFab.addEventListener("click", () => showView("view-search"));
searchClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchInput.focus();
});

const search = debounce((query) => {
  if (query.trim() === "") {
    searchResults.innerHTML = "";
    return;
  }
  // Lógica de búsqueda original, no modificada
  fetch(`https://invidious.snopyta.org/api/v1/search?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        searchResults.innerHTML = data.map(v => `
          <div class="search-card" data-video-id="${v.videoId}" onclick="playVideo({id: '${v.videoId}', title: '${v.title}', author: '${v.author}'})">
            <img src="${v.videoThumbnails[0].url}" alt="${v.title}" />
            <div class="search-meta">
              <h3 class="search-title">${cleanTitle(v.title)}</h3>
              <p class="search-author">${cleanAuthor(v.author)}</p>
            </div>
            <button class="dots-btn" aria-label="Opciones">${dotsSvg()}</button>
          </div>
        `).join("");
      } else {
        searchResults.innerHTML = "<p>No se encontraron resultados.</p>";
      }
    })
    .catch(err => {
      console.error(err);
      searchResults.innerHTML = "<p>Hubo un error en la búsqueda.</p>";
    });
}, 300);

searchInput.addEventListener("input", (e) => search(e.target.value));
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/* ========= Favoritos y Playlists (sin modificar) ========= */
function loadFavs() {
  // Lógica de favoritos
}
function loadPlaylists() {
  // Lógica de playlists
}
function renderFavs() {
  // Lógica de renderizado
}
function renderPlaylists() {
  // Lógica de renderizado
}
//... el resto de tu código original...

/* ========= Infinite scroll ========= */
const io = new IntersectionObserver((entries)=>{
  for(const en of entries){ if(en.isIntersecting){ loadNextPage(); } }
},{ root:null, rootMargin:"800px 0px", threshold:0 });
io.observe($("#sentinel"));

/* ========= HERO shrink en scroll ========= */
function heroScrollTick(){
  const active = document.querySelector(".view.active");
  if(!active) return;

  // Sólo en Favoritos y Reproductor
  const hero = active.id==="view-favs" ? $("#favHero")
             : active.id==="view-player" ? $("#npHero")
             : null;
  if(!hero) return;

  const viewTop = active.getBoundingClientRect().top + window.scrollY;
  const y = Math.max(0, window.scrollY - viewTop);    // desplazamiento dentro de la vista
  const DIST = 240;                                    // recorrido para colapsar del todo
  const t = Math.max(0, Math.min(1, y / DIST));        // 0→1
  hero.style.setProperty("--hero-t", t);
}
window.addEventListener("scroll", heroScrollTick, {passive:true});
window.addEventListener("resize", heroScrollTick);

/* ========= Init ========= */
loadFavs();
loadPlaylists();
renderFavs();
renderPlaylists();
loadYoutubeApi();

bootHome();
showView("view-home");
