/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmtTime = s => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const uniq = a => [...new Set(a)];

/* ========= Estado ========= */
let items = [];            // resultados de búsqueda
let favs  = [];            // favoritos persistentes
let ctx   = { source: 'search', index: -1 }; // 'search' | 'favorites'
let ytPlayer = null, YT_READY = false;
let timeTimer = null, wasPlaying = false, lastTime = 0;
let visReloadCooldown = false;

const FAVS_KEY = 'sy_favs_v1';

/* ========= Búsqueda sin API key ========= */
async function searchYouTube(q){
  setStatus("Buscando…", true);
  const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const html = await fetch(endpoint, { headers: { 'Accept': 'text/plain' } }).then(r=>r.text()).catch(()=>null);
  if (!html){ setStatus("Sin respuesta de YouTube"); return []; }
  const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m=>m[1])).slice(0, 24);
  const out = [];
  for (const id of ids){
    try {
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      out.push({
        id,
        title: meta.title || `Video ${id}`,
        thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: meta.author_name || "YouTube",
        url: `https://www.youtube.com/watch?v=${id}`
      });
    } catch {
      out.push({ id, title:`Video ${id}`, thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"YouTube", url:`https://www.youtube.com/watch?v=${id}` });
    }
  }
  setStatus(`Resultados: ${out.length}`);
  return out;
}
function setStatus(t, loading=false){
  const el = $("#status");
  el.textContent = t || "";
  el.classList.toggle("loading", loading);
}

/* ========= Render: Búsqueda ========= */
function renderResults(){
  const root = $("#results");
  root.innerHTML = "";
  items.forEach((it, i) => {
    const card = document.createElement("div");
    card.className = "card";
    if (ctx.source==='search' && ctx.index===i) card.classList.add("active-card");
    card.innerHTML = `
      <div class="thumb" style="background-image:url('${it.thumb.replace(/'/g, "%27")}')"></div>
      <div class="meta">
        <div class="title" title="${escapeAttr(it.title)}">${it.title}</div>
        <div class="subtitle">${it.author || ""}</div>
      </div>
      <button class="heart ${isFav(it.id)?'active':''}" title="${isFav(it.id)?'Quitar de favoritos':'Agregar a favoritos'}" aria-label="Favorito">
        <svg><use href="${isFav(it.id)?'#ic-heart-fill':'#ic-heart'}"/></svg>
      </button>`;
    card.addEventListener('click', () => playFrom('search', i, true));
    card.querySelector('.heart').addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleFav(it);
    });
    root.appendChild(card);
  });
}

/* ========= Render: Favoritos ========= */
function renderFavs(){
  const box = $("#favList");
  box.innerHTML = "";
  if (!favs.length){
    const empty = document.createElement('div');
    empty.className = "subtitle";
    empty.style.padding = "18px";
    empty.textContent = "Aún no tenés favoritos. Agregá con el corazón desde Búsqueda.";
    box.appendChild(empty);
  } else {
    favs.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = "fav-row";
      if (ctx.source==='favorites' && ctx.index===i) row.classList.add('active-card');
      row.innerHTML = `
        <div class="fav-thumb" style="background-image:url('${it.thumb.replace(/'/g, "%27")}')"></div>
        <div class="fav-meta">
          <div class="fav-title" title="${escapeAttr(it.title)}">${it.title}</div>
          <div class="fav-sub">${it.author || ""}</div>
        </div>
        <div class="fav-actions">
          <button class="btn-x" title="Quitar" aria-label="Quitar">
            <svg><use href="#ic-close"/></svg>
          </button>
        </div>`;
      row.addEventListener('click', (e) => {
        // Evitar que el click en la X reproduzca
        if (e.target.closest('.btn-x')) return;
        playFrom('favorites', i, true);
      });
      row.querySelector('.btn-x').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFav(it.id);
      });
      box.appendChild(row);
    });
  }
  // Header cover y título
  const cur = getCurrentItem();
  $("#favHeaderCover").style.backgroundImage = cur ? `url('${cur.thumb.replace(/'/g, "%27")}')` : "";
  $("#favNowTitle").textContent = cur ? cur.title : "—";
}

/* ========= Favoritos (persistencia) ========= */
function loadFavs(){ try { return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch { return []; } }
function saveFavs(){ try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch {} }
function isFav(id){ return favs.some(f => f.id === id); }
function toggleFav(item){ isFav(item.id) ? removeFav(item.id) : addFav(item); }
function addFav(item){
  if (isFav(item.id)) return;
  favs.push(item); saveFavs();
  renderResults(); renderFavs();
}
function removeFav(id){
  favs = favs.filter(f => f.id !== id); saveFavs();
  if (ctx.source==='favorites'){
    // Reacomodar índice si borramos por delante
    if (ctx.index >= favs.length) ctx.index = favs.length - 1;
  }
  renderResults(); renderFavs();
}

/* ========= Player (YouTube IFrame API) ========= */
function loadYTApi(){
  if (window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s = document.createElement('script'); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player('player', {
    width: 300, height: 150, videoId: '',
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: { 'onReady': () => { YT_READY = true; }, 'onStateChange': onYTState }
  });
};
function onYTState(e){
  if (e.data === YT.PlayerState.PLAYING){
    startTimer();
    switchPlayIcon(true);
    $("#pausedNotice").classList.remove("show");
    wasPlaying = true;
  }
  if (e.data === YT.PlayerState.PAUSED){
    stopTimer();
    switchPlayIcon(false);
    wasPlaying = false;
  }
  if (e.data === YT.PlayerState.ENDED){
    stopTimer();
    next();
  }
}
function switchPlayIcon(isPlaying){
  const use = $("#btnPlayIcon use");
  use.setAttribute('href', isPlaying ? '#ic-pause' : '#ic-play');
}

/* ========= Controles ========= */
function getList(source){ return source==='favorites' ? favs : items; }
function getCurrentItem(){
  const list = getList(ctx.source);
  return (ctx.index >= 0 && ctx.index < list.length) ? list[ctx.index] : null;
}
function playFrom(source, index, autoplay=true, startSeconds=0){
  if (!YT_READY) return;
  const list = getList(source);
  if (!list[index]) return;
  ctx.source = source; ctx.index = index;

  const it = list[index];
  $("#pCover").style.backgroundImage = `url('${it.thumb.replace(/'/g, "%27")}')`;
  $("#pTitle").textContent = it.title;

  ytPlayer.loadVideoById({ videoId: it.id, startSeconds, suggestedQuality:'auto' });
  ytPlayer.setVolume(parseInt($("#vol").value, 10) || 100);
  if (!autoplay) { ytPlayer.pauseVideo(); }

  // Marcar activos
  renderResults();
  renderFavs();
}
function togglePlay(){
  if (!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st === YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
function prev(){
  const list = getList(ctx.source);
  if (!list.length) return;
  const i = (ctx.index > 0) ? ctx.index - 1 : list.length - 1;
  playFrom(ctx.source, i, true);
}
function next(){
  const list = getList(ctx.source);
  if (!list.length) return;
  const i = (ctx.index + 1) % list.length;
  playFrom(ctx.source, i, true);
}
function seekToFrac(frac){
  if (!YT_READY) return;
  const d = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(frac * d, true);
}
function startTimer(){
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
function stopTimer(){ clearInterval(timeTimer); timeTimer = null; }

/* ========= Fullscreen ========= */
function toggleFullscreen(){
  if (!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen();
  }
}

/* ========= Hack: continuar en segundo plano =========
   Al perder foco y si estaba reproduciendo, recarga el MISMO video en el tiempo exacto. */
function handleVisibilityChange(){
  const curItem = getCurrentItem();
  if (!YT_READY || !curItem) return;

  if (document.visibilityState === "hidden" && wasPlaying){
    if (visReloadCooldown) return; // evita spam si el evento dispara varias veces
    visReloadCooldown = true;
    setTimeout(()=>{ visReloadCooldown = false; }, 1500);

    lastTime = ytPlayer.getCurrentTime() || 0;
    ytPlayer.loadVideoById({ videoId: curItem.id, startSeconds: lastTime, suggestedQuality: 'auto' });
    ytPlayer.setVolume(parseInt($("#vol").value, 10) || 100);
    $("#pausedNotice").classList.remove("show");
  } else if (document.visibilityState === "visible"){
    $("#pausedNotice").classList.remove("show");
  }
}

/* ========= Helpers ========= */
function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

/* ========= Wire UI ========= */
document.addEventListener('DOMContentLoaded', () => {
  // Cargar favoritos
  favs = loadFavs();
  renderFavs();

  // Búsqueda
  $("#btnSearch").addEventListener("click", async ()=>{
    const q = $("#q").value.trim(); if (!q) return;
    setStatus("Buscando…", true);
    items = await searchYouTube(q);
    ctx.source = 'search'; ctx.index = -1;
    renderResults();
  });
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnSearch").click(); });

  // Player controls
  $("#btnPlay").onclick = togglePlay;
  $("#btnPrev").onclick = prev;
  $("#btnNext").onclick = next;
  $("#btnFullscreen").onclick = toggleFullscreen;
  $("#seek").addEventListener("input", e => { const v = parseInt(e.target.value,10)/1000; seekToFrac(v); });
  $("#vol").addEventListener("input", e => { if (YT_READY) ytPlayer.setVolume(parseInt(e.target.value,10)); });

  // FAB / Favoritos
  const favsModal = $("#favsModal");
  const fab = $("#fab");
  const fabIcon = $("#fabIcon");
  const closeFavs = $("#closeFavs");

  function openFavs(){
    favsModal.classList.add('show');
    fabIcon.setAttribute('href', '#ic-grid'); // icono para volver a búsqueda
    fab.setAttribute('title','Búsqueda'); fab.setAttribute('aria-label','Ir a búsqueda');
    renderFavs();
  }
  function closeFavsModal(){
    favsModal.classList.remove('show');
    fabIcon.setAttribute('href', '#ic-list'); // icono de favoritos
    fab.setAttribute('title','Favoritos'); fab.setAttribute('aria-label','Abrir favoritos');
  }
  fab.addEventListener('click', ()=>{
    favsModal.classList.contains('show') ? closeFavsModal() : openFavs();
  });
  $("#favsModal .modal-backdrop").addEventListener('click', closeFavsModal);
  closeFavs.addEventListener('click', closeFavsModal);

  // Visibilidad
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Iniciar YouTube API
  loadYTApi();
});
