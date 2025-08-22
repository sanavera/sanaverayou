/* ===== Utilidades ===== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s=Math.max(0,Math.floor(s||0)); const m=Math.floor(s/60), ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* ===== Estado global ===== */
let items = [];            // resultados búsqueda
let favs  = [];            // favoritos
let playlists = [];        // [{id,name,items:[track]}]
let idx = -1;              // índice en items
let currentTrack = null;   // canción actual (puede venir de búsqueda, fav o playlist)

let ytPlayer = null;
let YT_READY = false;
let wasPlaying = false;
let timer = null;
let repeatOne = false;

/* ===== Cache / búsqueda simple ===== */
let lastQuery = "";
let allIds = [];
let loadedIds = new Set();
const BATCH_SIZE = 6;
const INFINITE_BATCH = 6;

function setCount(t){ const el=$("#resultsCount"); if(el) el.textContent=t||""; }

/* ====== Búsqueda (scrape + noembed) ====== */
async function searchYouTube(q, append=false){
  if(!append){
    setCount("Buscando…");
    lastQuery = q;
    items = [];
    loadedIds.clear();
    $("#results").innerHTML = "";
    // scrape ids
    const url = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    try{
      const html = await fetch(url,{headers:{Accept:"text/plain"}}).then(r=>r.text());
      allIds = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1])).slice(0,60);
    }catch{
      setCount("Error al conectar con YouTube");
      return;
    }
  }

  const chunk = allIds.filter(id=>!loadedIds.has(id)).slice(0, append?INFINITE_BATCH:BATCH_SIZE);
  if(!chunk.length){ setCount(`Resultados: ${items.length}`); return; }

  for(const id of chunk){
    try{
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      const t = { id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"YouTube" };
      items.push(t); loadedIds.add(id); appendResultCard(t, items.length-1);
      setCount(`Resultados: ${items.length}`);
    }catch{
      const t = { id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"YouTube" };
      items.push(t); loadedIds.add(id); appendResultCard(t, items.length-1);
    }
  }
}

/* ===== Render Resultados ===== */
function appendResultCard(track, i){
  const root = $("#results"); if(!root) return;
  const li = document.createElement("article");
  li.className = "card";
  li.dataset.trackId = track.id;
  li.innerHTML = `
    <img class="thumb" src="${track.thumb}" alt="">
    <div class="meta">
      <div class="title-line">
        <span class="title-text">${track.title}</span>
        <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
      <div class="subtitle">${track.author||""}</div>
    </div>
    <div class="actions">
      <button class="icon-btn heart ${isFav(track.id)?'active':''}" title="Favorito">${HEART_SVG}</button>
    </div>`;
  li.addEventListener("click", e=>{
    if(e.target.closest(".heart")){ toggleFav(track); e.stopPropagation(); return; }
    playIndex(i, true);
  });
  root.appendChild(li);
  refreshIndicators();
}

function renderResults(){ const root=$("#results"); if(!root) return; root.innerHTML=""; items.forEach((t,i)=>appendResultCard(t,i)); }

/* ===== Favoritos ===== */
const LS_FAVS = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_FAVS)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_FAVS, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)) favs = favs.filter(f=>f.id!==track.id);
  else favs.unshift(track);
  saveFavs();
  renderFavs();
  // reflejo corazón en tarjetas pintadas
  $$("#results .card").forEach(c=>{
    if(c.dataset.trackId===track.id){ c.querySelector(".heart")?.classList.toggle("active", isFav(track.id)); }
  });
}
function removeFav(id){ favs = favs.filter(f=>f.id!==id); saveFavs(); renderFavs(); }

function renderFavs(){
  const ul = $("#favList"); if(!ul) return;
  ul.innerHTML = "";
  favs.forEach((it)=>{
    const li = document.createElement("li");
    li.className = "fav-item";
    li.dataset.trackId = it.id;
    li.innerHTML = `
      <img class="thumb" src="${it.thumb}" alt="">
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${it.author||""}</div>
      </div>
      <button class="remove-btn" title="Quitar">✕</button>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".remove-btn")){ removeFav(it.id); e.stopPropagation(); return; }
      playFromFav(it, true);
    });
    ul.appendChild(li);
  });
  updateHero(currentTrack);
  refreshIndicators();
}

/* ===== Playlists (storage simple) ===== */
const LS_PL = "sanayera_playlists_v1";
function loadPlaylists(){ try{ playlists = JSON.parse(localStorage.getItem(LS_PL)||"[]"); }catch{ playlists=[]; } }
function savePlaylists(){ localStorage.setItem(LS_PL, JSON.stringify(playlists)); }

function coverOf(list){ return list.items?.[0]?.thumb || "https://dummyimage.com/120x120/242731/ffffff&text=♪"; }

function renderPlaylists(){
  const wrap = $("#playlistsWrap"); if(!wrap) return;
  wrap.innerHTML = "";
  playlists.forEach(pl=>{
    const li = document.createElement("div");
    li.className = "pl-card";
    li.dataset.plId = pl.id;
    li.innerHTML = `
      <img class="pl-cover" src="${coverOf(pl)}" alt="">
      <div style="min-width:0">
        <div class="pl-name">${pl.name}</div>
        <div class="pl-info">${(pl.items?.length||0)} temas</div>
      </div>
      <div class="pl-actions">
        <button class="more-btn more" title="Más">
          <svg viewBox="0 0 24 24"><path d="M12 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4zm0 7a2 2 0 110-4 2 2 0 010 4z"/></svg>
        </button>
      </div>
    `;

    // 👉 Tap directo en la tarjeta = Abrir
    li.addEventListener("click", (e)=>{
      if(e.target.closest(".more")) return; // no interferir con menú
      showPlaylistInPlayer(pl.id);
      switchView("view-player");
    });

    // (tu menú de 3 puntos puede seguir igual aquí)
    wrap.appendChild(li);
  });
}

/* Lógica para mostrar una playlist en el reproductor */
function showPlaylistInPlayer(plId){
  const pl = playlists.find(p=>p.id===plId);
  if(!pl || !pl.items || !pl.items.length) return;
  // seteo la cola "items" con la playlist para navegar con prev/next
  items = pl.items.slice();
  idx = 0;
  playIndex(0, true);
}

/* ===== Player / YouTube ===== */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300,height:150,videoId:"",
    playerVars:{autoplay:0,controls:0,rel:0,playsinline:1},
    events:{ onReady:()=>{YT_READY=true}, onStateChange:onYTState }
  });
};
function onYTState(e){
  const st = e.data;
  const playing = (st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING);
  $("#btnPlay")?.classList.toggle("playing", playing);
  $("#btnPlayFav")?.classList.toggle("playing", playing);
  setMiniPlayingState(playing);
  wasPlaying = playing;
  if(st===YT.PlayerState.ENDED){
    if(repeatOne){ ytPlayer.seekTo(0,true); ytPlayer.playVideo(); }
    else{ next(); }
  }
  refreshIndicators();
}

function updateHero(track){
  const t = track || currentTrack;
  $("#favHero") && ($("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none");
  $("#favNowTitle") && ($("#favNowTitle").textContent = t ? t.title : "—");
  updateMiniNow(t);
}

function playIndex(i, autoplay=false){
  if(!YT_READY || !items[i]) return;
  idx = i;
  currentTrack = items[i];
  ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(currentTrack);
  refreshIndicators();
}
function playFromFav(track, autoplay=false){
  if(!YT_READY || !track) return;
  currentTrack = track;
  idx = items.findIndex(x=>x.id===track.id); // puede ser -1
  ytPlayer.loadVideoById({videoId:track.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(track);
  refreshIndicators();
}
function togglePlay(){
  if(!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
function prev(){
  if(idx>=0 && idx-1>=0){ playIndex(idx-1, true); return; }
  const pos = favs.findIndex(f=>f.id===currentTrack?.id);
  if(pos>0) playFromFav(favs[pos-1], true);
}
function next(){
  if(idx>=0 && idx+1<items.length){ playIndex(idx+1, true); return; }
  const pos = favs.findIndex(f=>f.id===currentTrack?.id);
  if(pos>=0 && pos+1<favs.length) playFromFav(favs[pos+1], true);
}
function seekToFrac(frac){
  if(!YT_READY) return;
  const d = ytPlayer.getDuration()||0;
  ytPlayer.seekTo(frac*d,true);
}
function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY) return;
    const cur = ytPlayer.getCurrentTime()||0;
    const dur = ytPlayer.getDuration()||0;
    $("#cur") && ($("#cur").textContent = fmt(cur));
    $("#dur") && ($("#dur").textContent = fmt(dur));
    $("#seek") && ($("#seek").value = dur ? Math.floor((cur/dur)*1000) : 0);
    $("#curFav") && ($("#curFav").textContent = fmt(cur));
    $("#durFav") && ($("#durFav").textContent = fmt(dur));
    $("#seekFav") && ($("#seekFav").value = $("#seek")?.value || 0);

    const playing = (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
    setMiniPlayingState(playing);
    refreshIndicators();
  },250);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* EQ badge */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";
  $$("#results .card").forEach(card=> card.classList.toggle("is-playing", playing && card.dataset.trackId===curId));
  $$("#favList .fav-item").forEach(li=> li.classList.toggle("is-playing", playing && li.dataset.trackId===curId));
}

/* Mantener playback al volver de background */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || !currentTrack) return;
  if(document.visibilityState==="hidden" && wasPlaying){
    const t = ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:t, suggestedQuality:"auto"});
    ytPlayer.playVideo();
  }
});

/* ===== Mini Now Playing (header) ===== */
function mountMiniNowPlaying(){
  const host = document.querySelector(".topbar");
  if(!host || $("#miniNow")) return;
  const bar = document.createElement("div");
  bar.id = "miniNow";
  bar.className = "mini-nowplaying hide";
  bar.innerHTML = `
    <img id="miniThumb" class="mini-thumb" alt="">
    <div class="mini-meta">
      <div id="miniTitle" class="mini-title">—</div>
      <div id="miniSub" class="mini-sub">—</div>
    </div>
    <button id="miniPlay" class="mini-btn" title="Play/Pausa">
      <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
    </button>
  `;
  host.appendChild(bar);
  $("#miniPlay").onclick = (e)=>{ e.stopPropagation(); togglePlay(); };
  bar.addEventListener("click",(e)=>{ if(e.target.closest("#miniPlay")) return; switchView("view-player"); });
}
function updateMiniNow(t){
  const bar = $("#miniNow"); if(!bar) return;
  if(!t){ bar.classList.add("hide"); return; }
  $("#miniThumb").src = t.thumb;
  $("#miniTitle").textContent = t.title || "—";
  $("#miniSub").textContent   = t.author || "—";
  bar.classList.remove("hide");
}
function setMiniPlayingState(playing){
  $("#miniPlay")?.classList.toggle("playing", !!playing);
}

/* ===== UI básica ===== */
function setupSearchInput(){
  const input = $("#searchInput"); if(!input) return;
  input.addEventListener("keydown", async e=>{
    if(e.key==="Enter"){
      const q = input.value.trim(); if(!q) return;
      await searchYouTube(q, false);
    }
  });
}
function setupInfiniteScroll(){
  const root = $("#results"); if(!root) return;
  window.addEventListener("scroll", throttle(()=>{
    const scrolled = (window.scrollY + window.innerHeight);
    if(scrolled > document.body.scrollHeight - 800){
      if(lastQuery) searchYouTube(lastQuery, true);
    }
  }, 120), {passive:true});
}
function throttle(fn,ms){ let t=null; return (...a)=>{ if(t) return; t=setTimeout(()=>{ t=null; fn(...a); }, ms); }; }

/* Cambiar de vista (si usás contenedores por ids) */
function switchView(id){
  $$(".view").forEach(v=> v.style.display = (v.id===id) ? "block" : "none");
}

/* ===== Init ===== */
loadFavs();
loadPlaylists();
renderFavs();
renderPlaylists();
loadYTApi();
setupSearchInput();
setupInfiniteScroll();
mountMiniNowPlaying();

/* Exponer algunos helpers si los necesitás en otros módulos */
window.app = { toggleFav, showPlaylistInPlayer, switchView };
