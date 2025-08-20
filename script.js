// ========= Utils =========
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmtTime = s => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
};
function uniq(a) { return [...new Set(a)]; }

// ========= State =========
let items = []; // Search results
let favorites = JSON.parse(localStorage.getItem('favorites')) || []; // Favorites stored in localStorage
let idx = -1; // Current playing index
let currentList = 'search'; // 'search' or 'favorites'
let ytPlayer = null;
let timeTimer = null;
let wasPlaying = false;
let lastTime = 0;

// ========= Search (no API key) =========
async function searchYouTube(q) {
  setStatus("Buscando…", true);
  const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const html = await fetch(endpoint, { headers: { 'Accept': 'text/plain' } }).then(r => r.text()).catch(() => null);
  if (!html) {
    setStatus("Sin respuesta de YouTube");
    return [];
  }

  const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1])).slice(0, 12);
  const out = [];
  for (const id of ids) {
    try {
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r => r.json());
      out.push({
        id,
        title: meta.title || `Video ${id}`,
        thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: meta.author_name || "YouTube",
        url: `https://www.youtube.com/watch?v=${id}`
      });
    } catch (_) {
      out.push({
        id,
        title: `Video ${id}`,
        thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: "YouTube",
        url: `https://www.youtube.com/watch?v=${id}`
      });
    }
  }
  setStatus(`Resultados: ${out.length}`);
  return out;
}

function setStatus(t, loading = false) {
  const statusEl = $("#status");
  statusEl.textContent = t || "";
  statusEl.classList.toggle("loading", loading);
}

// ========= Render Functions =========
function renderResults() {
  const root = $("#results");
  root.innerHTML = "";
  items.forEach((it, i) => {
    const isFavorited = favorites.some(fav => fav.id === it.id);
    const card = document.createElement("button");
    card.className = `card ${i === idx && currentList === 'search' ? 'active' : ''}`;
    card.innerHTML = `
      <div class="thumb" style="background-image:url('${it.thumb.replace(/'/g, "%27")}')"></div>
      <div class="meta">
        <div class="title" title="${it.title.replace(/"/g, '&quot;')}">${it.title}</div>
        <div class="subtitle">${it.author || ""}</div>
      </div>
      <button class="fav-btn ${isFavorited ? 'favorited' : ''}" title="${isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}"></button>
    `;
    card.onclick = () => playIndex(i, true, 'search');
    card.querySelector('.fav-btn').onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(it);
      renderResults();
      renderFavorites();
    };
    root.appendChild(card);
  });
}

function renderFavorites() {
  const root = $("#favResults");
  root.innerHTML = "";
  favorites.forEach((it, i) => {
    const card = document.createElement("button");
    card.className = `card ${i === idx && currentList === 'favorites' ? 'active' : ''}`;
    card.innerHTML = `
      <div class="thumb" style="background-image:url('${it.thumb.replace(/'/g, "%27")}')"></div>
      <div class="meta">
        <div class="title" title="${it.title.replace(/"/g, '&quot;')}">${it.title}</div>
        <div class="subtitle">${it.author || ""}</div>
      </div>
      <button class="fav-btn remove-btn" title="Quitar de favoritos"></button>
    `;
    card.onclick = () => playIndex(i, true, 'favorites');
    card.querySelector('.remove-btn').onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(it);
      renderFavorites();
      renderResults();
    };
    root.appendChild(card);
  });
  updateFavCover();
}

function updateFavCover() {
  const favCover = $("#favCover");
  if (idx >= 0 && currentList === 'favorites' && favorites[idx]) {
    favCover.style.backgroundImage = `url('${favorites[idx].thumb.replace(/'/g, "%27")}')`;
  } else {
    favCover.style.backgroundImage = 'none';
  }
}

// ========= Favorites Management =========
function toggleFavorite(item) {
  const isFavorited = favorites.some(fav => fav.id === item.id);
  if (isFavorited) {
    favorites = favorites.filter(fav => fav.id !== item.id);
  } else {
    favorites.push(item);
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

// ========= YouTube IFrame API =========
let YT_READY = false;
function loadYTApi() {
  if (window.YT && window.YT.Player) {
    onYouTubeIframeAPIReady();
    return;
  }
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('player', {
    width: 300,
    height: 150,
    videoId: '',
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: {
      'onReady': () => { YT_READY = true; },
      'onStateChange': onYTState
    }
  });
};

function onYTState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    startTimer();
    $("#btnPlay").classList.add("playing");
    $("#pausedNotice").classList.remove("show");
    wasPlaying = true;
  }
  if (e.data === YT.PlayerState.PAUSED) {
    stopTimer();
    $("#btnPlay").classList.remove("playing");
    wasPlaying = false;
  }
  if (e.data === YT.PlayerState.ENDED) {
    stopTimer();
    next();
  }
}

// ========= Playback Controls =========
function playIndex(i, autoplay = false, list = currentList) {
  if (!YT_READY || !getCurrentList()[i]) return;
  idx = i;
  currentList = list;
  const it = getCurrentList()[i];
  $("#pCover").style.backgroundImage = `url('${it.thumb.replace(/'/g, "%27")}')`;
  $("#pTitle").textContent = it.title;
  ytPlayer.loadVideoById({
    videoId: it.id,
    startSeconds: 0,
    suggestedQuality: 'auto'
  });
  ytPlayer.setVolume(parseInt($("#vol").value, 10) || 100);
  if (!autoplay) {
    ytPlayer.pauseVideo();
  }
  renderResults();
  renderFavorites();
}

function togglePlay() {
  if (!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  if (st === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function prev() {
  if (idx > 0) {
    playIndex(idx - 1, true, currentList);
  }
}

function next() {
  if (idx + 1 < getCurrentList().length) {
    playIndex(idx + 1, true, currentList);
  }
}

function getCurrentList() {
  return currentList === 'search' ? items : favorites;
}

function seekToFrac(frac) {
  if (!YT_READY) return;
  const d = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(frac * d, true);
}

function startTimer() {
  stopTimer();
  timeTimer = setInterval(() => {
    if (!YT_READY) return;
    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    $("#cur").textContent = fmtTime(cur);
    $("#dur").textContent = fmtTime(dur);
    $("#seek").value = dur ? Math.floor((cur / dur) * 1000) : 0;
  }, 250);
}

function stopTimer() {
  clearInterval(timeTimer);
  timeTimer = null;
}

// ========= Fullscreen Toggle =========
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.error("Error al entrar en pantalla completa:", err));
  } else {
    document.exitFullscreen();
  }
}

// ========= Handle Visibility Change =========
function handleVisibilityChange() {
  if (!YT_READY || idx < 0 || !getCurrentList()[idx]) return;
  if (document.visibilityState === "hidden" && wasPlaying) {
    lastTime = ytPlayer.getCurrentTime() || 0;
    const it = getCurrentList()[idx];
    ytPlayer.loadVideoById({
      videoId: it.id,
      startSeconds: lastTime,
      suggestedQuality: 'auto'
    });
    ytPlayer.setVolume(parseInt($("#vol").value, 10) || 100);
    $("#pausedNotice").classList.remove("show");
  } else if (document.visibilityState === "visible") {
    $("#pausedNotice").classList.remove("show");
  }
}

// ========= Tab Switching =========
function toggleTab() {
  const searchTab = $("#searchTab");
  const results = $("#results");
  const favorites = $("#favorites");
  const fab = $("#fab");

  if (currentList === 'search') {
    currentList = 'favorites';
    searchTab.classList.add('hide');
    results.classList.add('hide');
    favorites.classList.add('active');
    fab.textContent = 'Buscar';
  } else {
    currentList = 'search';
    searchTab.classList.remove('hide');
    results.classList.remove('hide');
    favorites.classList.remove('active');
    fab.textContent = 'Favoritos';
  }
  renderFavorites();
}

// ========= Wire UI =========
$("#btnSearch").addEventListener("click", async () => {
  const q = $("#q").value.trim();
  if (!q) return;
  setStatus("Buscando…", true);
  items = await searchYouTube(q);
  idx = -1;
  renderResults();
});

$("#q").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    $("#btnSearch").click();
  }
});

$("#btnPlay").onclick = togglePlay;
$("#btnPrev").onclick = prev;
$("#btnNext").onclick = next;
$("#btnFullscreen").onclick = toggleFullscreen;
$("#seek").addEventListener("input", e => {
  const v = parseInt(e.target.value, 10) / 1000;
  seekToFrac(v);
});
$("#vol").addEventListener("input", e => {
  if (YT_READY) ytPlayer.setVolume(parseInt(e.target.value, 10));
});
$("#fab").addEventListener("click", toggleTab);

// Handle visibility changes
document.addEventListener("visibilitychange", handleVisibilityChange);

// Init
loadYTApi();
renderFavorites();
