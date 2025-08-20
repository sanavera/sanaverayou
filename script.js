/* =========================
   SanaveraYou Pro - script.js
   ========================= */

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const cleanTitle = t =>
  (t || "")
    .replace(/\((official|video|videoclip|mv|lyric|audio|music|clip)[^)]+\)/ig, "")
    .replace(/\b(official|video|videoclip|mv|lyrics?|audio|music|clip|hd|4k)\b/ig, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/* ===== State ===== */
let searchItems = [];            // lista visible (búsqueda)
let searchItemsOriginal = [];    // para restaurar después del shuffle
let favItems = JSON.parse(localStorage.getItem('sana.favs') || '[]'); // {id,title,thumb,author}
let favOriginal = favItems.slice();

let activeList = 'search'; // 'search' | 'fav'
let idx = -1;

let ytPlayer = null;
let timeTimer = null;
let wasPlaying = false;
let lastTime = 0;

let repeatMode = 'off'; // 'off' | 'all' | 'one'
let shuffleOn = false;

let suggValue = ""; // sugerencia de Google (una)

/* ===== YouTube IFrame API ===== */
function loadYTApi() {
  if (window.YT && window.YT.Player) { onYouTubeIframeAPIReady(); return; }
  const s = document.createElement('script');
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('player', {
    width: 300, height: 150, videoId: '',
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: { onReady: () => {}, onStateChange: onYTState }
  });
};
function onYTState(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    startTimer(); $('#btnPlay').classList.add('playing'); wasPlaying = true;
  }
  if (e.data === YT.PlayerState.PAUSED) {
    stopTimer(); $('#btnPlay').classList.remove('playing'); wasPlaying = false;
  }
  if (e.data === YT.PlayerState.ENDED) {
    stopTimer();
    if (repeatMode === 'one') {
      ytPlayer.seekTo(0, true); ytPlayer.playVideo(); return;
    }
    next();
  }
}

/* ===== Search (no API key) ===== */
async function searchYouTube(q) {
  const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const html = await fetch(endpoint, { headers: { 'Accept': 'text/plain' } })
    .then(r => r.text()).catch(() => null);
  if (!html) return [];

  const ids = Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m => m[1]);
  const uniq = [...new Set(ids)].slice(0, 30);

  const out = [];
  for (const id of uniq) {
    try {
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
        .then(r => r.json());
      out.push({
        id,
        title: cleanTitle(meta.title || `Video ${id}`),
        thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: meta.author_name || "—"
      });
    } catch {
      out.push({
        id,
        title: `Video ${id}`,
        thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: "—"
      });
    }
  }
  return out;
}

/* ===== Google Suggest (1 sola) ===== */
async function fetchSuggestion(q) {
  if (!q || q.length < 2) { hideSugg(); return; }
  try {
    const url = `https://r.jina.ai/http://suggestqueries.google.com/complete/search?client=firefox&hl=es&q=${encodeURIComponent(q)}`;
    const txt = await fetch(url, { headers: { 'Accept': 'text/plain' } }).then(r => r.text());
    const data = JSON.parse(txt); // [q, [sugs]]
    const s = (data && data[1] && data[1][0]) ? data[1][0] : '';
    if (s) {
      suggValue = s;
      $('#useSuggestion').textContent = s;
      $('#suggestion').classList.remove('hide');
    } else hideSugg();
  } catch {
    hideSugg();
  }
}
function hideSugg() { suggValue = ""; $('#suggestion').classList.add('hide'); }

/* ===== Render ===== */
const eqHtml = () => `<span class="eq"><span></span><span></span><span></span></span>`;

function renderResults() {
  const root = $('#results'); root.innerHTML = '';
  searchItems.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb" style="background-image:url('${it.thumb.replace(/'/g,"%27")}')"></div>
      <div class="meta">
        <div class="title">${it.title}${activeList==='search' && i===idx ? ' ' + eqHtml() : ''}</div>
        <div class="subtitle">${it.author || ''}</div>
      </div>
      <div class="actions">
        <button class="heart-btn ${isFav(it.id) ? 'active' : ''}" title="Favorito">
          <svg class="ic" viewBox="0 0 24 24"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"/></svg>
        </button>
      </div>`;
    card.addEventListener('click', e => {
      if (e.target.closest('.heart-btn')) return; // no reproducir si tocaron el corazón
      activeList = 'search'; playIndex(i, true);
    });
    card.querySelector('.heart-btn').addEventListener('click', e => {
      e.stopPropagation(); toggleFav(it); renderResults();
    });
    root.appendChild(card);
  });
  $('#results-count').textContent = searchItems.length ? `Resultados: ${searchItems.length}` : '';
}

function renderFavs() {
  const cur = getActiveArray()[idx] || {};
  $('#favHero').style.backgroundImage = cur.thumb ? `url('${cur.thumb.replace(/'/g,"%27")}')` : 'none';
  $('#favNowTitle').textContent = cur.title || '—';

  const root = $('#favList'); root.innerHTML = '';
  favItems.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = `playlist-item ${activeList==='fav' && i===idx ? 'active' : ''}`;
    row.innerHTML = `
      <img src="${it.thumb}" alt="">
      <div class="info">
        <h3>${it.title}${activeList==='fav' && i===idx ? ' ' + eqHtml() : ''}</h3>
        <p>${it.author || ''}</p>
      </div>
      <button class="remove" title="Quitar">
        <svg class="ic" viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>
      </button>`;
    row.addEventListener('click', e => {
      if (e.target.closest('.remove')) return;
      activeList = 'fav'; playFavIndex(i, true);
    });
    row.querySelector('.remove').addEventListener('click', e => {
      e.stopPropagation(); removeFav(it.id); renderFavs();
    });
    root.appendChild(row);
  });
}

/* ===== Favoritos (LS) ===== */
function isFav(id) { return favItems.some(f => f.id === id); }
function toggleFav(it) {
  if (isFav(it.id)) favItems = favItems.filter(f => f.id !== it.id);
  else favItems.push(it);
  favOriginal = favItems.slice();
  localStorage.setItem('sana.favs', JSON.stringify(favItems));
  if ($('#favModal').classList.contains('show')) renderFavs();
}
function removeFav(id) {
  favItems = favItems.filter(f => f.id !== id);
  favOriginal = favItems.slice();
  localStorage.setItem('sana.favs', JSON.stringify(favItems));
}

/* ===== Playback ===== */
function getActiveArray() { return activeList === 'fav' ? favItems : searchItems; }

function playIndex(i, autoplay = false) {
  const arr = searchItems;
  if (!arr[i] || !ytPlayer) return;
  idx = i; activeList = 'search';
  const it = arr[i];
  ytPlayer.loadVideoById({ videoId: it.id, startSeconds: 0, suggestedQuality: 'auto' });
  if (!autoplay) ytPlayer.pauseVideo();
  updateUI();
}
function playFavIndex(i, autoplay = false) {
  const arr = favItems;
  if (!arr[i] || !ytPlayer) return;
  idx = i; activeList = 'fav';
  const it = arr[i];
  ytPlayer.loadVideoById({ videoId: it.id, startSeconds: 0, suggestedQuality: 'auto' });
  if (!autoplay) ytPlayer.pauseVideo();
  updateUI();
}
function togglePlay() {
  if (!ytPlayer) return;
  const st = ytPlayer.getPlayerState();
  if (st === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}
function prev() {
  const arr = getActiveArray(); if (arr.length === 0) return;
  if (idx > 0) idx--; else idx = (repeatMode === 'all' ? arr.length - 1 : 0);
  activeList === 'fav' ? playFavIndex(idx, true) : playIndex(idx, true);
}
function next() {
  const arr = getActiveArray(); if (arr.length === 0) return;
  if (idx < arr.length - 1) idx++;
  else {
    if (repeatMode === 'all') idx = 0;
    else { ytPlayer.pauseVideo(); return; }
  }
  activeList === 'fav' ? playFavIndex(idx, true) : playIndex(idx, true);
}
function seekToFrac(frac) {
  const d = ytPlayer?.getDuration?.() || 0;
  ytPlayer?.seekTo?.(frac * d, true);
}
function startTimer() {
  stopTimer();
  timeTimer = setInterval(() => {
    const cur = ytPlayer.getCurrentTime?.() || 0;
    const dur = ytPlayer.getDuration?.() || 0;
    $('#cur').textContent = fmt(cur);
    $('#dur').textContent = fmt(dur);
    $('#seek').value = dur ? Math.floor((cur / dur) * 1000) : 0;
  }, 250);
}
function stopTimer() { clearInterval(timeTimer); timeTimer = null; }
function updateUI() {
  renderResults();
  if ($('#favModal').classList.contains('show')) renderFavs();
}

/* ===== Repeat / Shuffle ===== */
$('#btnRepeat').addEventListener('click', () => {
  repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
  $('#btnRepeat').classList.toggle('active', repeatMode !== 'off');
  if (repeatMode === 'one') $('#btnRepeat').classList.add('repeat-one');
  else $('#btnRepeat').classList.remove('repeat-one');
});

$('#btnShuffle').addEventListener('click', () => {
  const listName = (activeList === 'fav') ? 'fav' : 'search';
  const current = getActiveArray()[idx]?.id;

  if (listName === 'search') {
    if (!shuffleOn) {
      searchItemsOriginal = searchItems.slice();
      searchItems = shuffleArray(searchItems);
      shuffleOn = true;
    } else {
      searchItems = searchItemsOriginal.slice();
      shuffleOn = false;
    }
    // reubicar idx para mantener el tema actual
    if (current) idx = searchItems.findIndex(x => x.id === current);
    renderResults();
  } else {
    if (!shuffleOn) {
      favOriginal = favItems.slice();
      favItems = shuffleArray(favItems);
      shuffleOn = true;
    } else {
      favItems = favOriginal.slice();
      shuffleOn = false;
    }
    if (current) idx = favItems.findIndex(x => x.id === current);
    renderFavs();
  }
});
function shuffleArray(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ===== Visibility hack: recarga en el mismo tiempo ===== */
document.addEventListener('visibilitychange', () => {
  if (!ytPlayer || idx < 0) return;
  if (document.visibilityState === 'hidden' && wasPlaying) {
    lastTime = ytPlayer.getCurrentTime?.() || 0;
    const arr = getActiveArray();
    const it = arr[idx];
    // recarga inmediata en el mismo timestamp
    ytPlayer.loadVideoById({ videoId: it.id, startSeconds: lastTime, suggestedQuality: 'auto' });
  }
});

/* ===== UI wiring ===== */
$('#q').addEventListener('input', (e) => { fetchSuggestion(e.target.value.trim()); });
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const base = e.target.value.trim();
    const value = (suggValue && suggValue.toLowerCase().startsWith(base.toLowerCase())) ? suggValue : base;
    if (!value) return;
    doSearch(value);
  }
});
$('#useSuggestion').addEventListener('click', () => {
  const v = suggValue; if (!v) return;
  $('#q').value = v; hideSugg(); doSearch(v);
});

async function doSearch(q) {
  hideSugg();
  $('#results-count').textContent = 'Buscando…';
  searchItems = await searchYouTube(q);
  searchItemsOriginal = searchItems.slice();
  idx = -1; activeList = 'search';
  renderResults();
  $('#results-count').textContent = `Resultados: ${searchItems.length}`;
}

/* Controles */
$('#btnPlay').addEventListener('click', togglePlay);
$('#btnPrev').addEventListener('click', prev);
$('#btnNext').addEventListener('click', next);
$('#seek').addEventListener('input', e => {
  const v = parseInt(e.target.value, 10) / 1000;
  seekToFrac(v);
});

/* FABs + Modal Favoritos */
const favModal = $('#favModal');
const controlsDock = $('#controlsDock');
const favContent = $('.modal-content');

$('#fabFavorites').addEventListener('click', () => {
  // mover la botonera dentro del modal para que siempre esté visible
  favContent.appendChild(controlsDock);
  favModal.classList.add('show');
  document.body.classList.add('modal-open');
  activeList = 'fav';
  renderFavs();
});
$('#fabBackToSearch').addEventListener('click', closeFavModal);
$('#closeFav').addEventListener('click', closeFavModal);

function closeFavModal() {
  // devolver botonera a la vista principal
  document.body.appendChild(controlsDock);
  favModal.classList.remove('show');
  document.body.classList.remove('modal-open');
  activeList = 'search';
  renderResults();
}

/* ===== Init ===== */
loadYTApi();
renderResults();
renderFavs();
