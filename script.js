/* ====== Utilidades ====== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s=Math.max(0,Math.floor(s||0)); const m=Math.floor(s/60), ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ")
  .trim();

/* SVG helper para corazón en lista */
const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* ====== Estado ====== */
let items = [];
let favs = [];
let idx = -1;
let ytPlayer = null;
let wasPlaying = false;
let timer = null;

let repeatOne = false;
let shuffleOn = false;
let originalOrder = [];

/* ====== Búsqueda (sin API key) ====== */
async function searchYouTube(q){
  setCount("Buscando…");
  const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const html = await fetch(endpoint,{headers:{Accept:"text/plain"}}).then(r=>r.text()).catch(()=>null);
  if(!html){ setCount("Sin respuesta de YouTube"); return []; }

  const ids = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1])).slice(0,24);
  const out = [];
  for(const id of ids){
    try{
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      out.push({ id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"YouTube" });
    }catch{
      out.push({ id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"YouTube" });
    }
  }
  setCount(`Resultados: ${out.length}`);
  return out;
}
function setCount(t){ $("#resultsCount").textContent = t||""; }

/* ====== Render ====== */
function renderResults(){
  const root = $("#results");
  root.innerHTML = "";
  items.forEach((it, i)=>{
    const li = document.createElement("article");
    li.className = "card";
    li.dataset.trackId = it.id;
    li.innerHTML = `
      <img class="thumb" src="${it.thumb}" alt="" />
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${it.author||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn heart ${isFav(it.id)?'active':''}" title="Favorito">${HEART_SVG}</button>
      </div>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".heart")){
        toggleFav(it);
        e.stopPropagation();
        return;
      }
      playIndex(i, true);
    });
    root.appendChild(li);
  });
  refreshIndicators();
}

function renderFavs(){
  const ul = $("#favList");
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
      <button class="remove-btn" title="Quitar">✕</button>
    `;
    li.addEventListener("click", e=>{
      if(e.target.closest(".remove-btn")){
        removeFav(it.id);
        e.stopPropagation();
        return;
      }
      const pos = items.findIndex(x=>x.id===it.id);
      if(pos === -1){
        items.unshift(it);
        originalOrder = items.slice();
        renderResults();
        playIndex(0, true);
      }else{
        playIndex(pos, true);
      }
    });
    ul.appendChild(li);
  });
  const current = items[idx];
  $("#favHero").style.backgroundImage = current ? `url(${current.thumb})` : "none";
  $("#favNowTitle").textContent = current ? current.title : "—";
  refreshIndicators();
}

/* ====== Favoritos ====== */
const LS_KEY = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_KEY, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  favs = favs.filter(f=>f.id!==track.id);
  favs.unshift(track);
  saveFavs();
  renderResults();
  renderFavs();
}
function removeFav(id){
  favs = favs.filter(f=>f.id!==id);
  saveFavs();
  renderFavs();
  renderResults();
}

/* ====== YouTube IFrame API ====== */
let YT_READY = false;
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
  $("#btnPlay").classList.toggle("playing", playing);
  $("#btnPlayFav").classList.toggle("playing", playing);
  wasPlaying = playing;
  if(st===YT.PlayerState.ENDED){
    if(repeatOne){ ytPlayer.seekTo(0,true); ytPlayer.playVideo(); }
    else{ next(); }
  }
  refreshIndicators();
}

/* ====== Reproducción ====== */
function playIndex(i, autoplay=false){
  if(!YT_READY || !items[i]) return;
  idx = i;
  const it = items[i];
  ytPlayer.loadVideoById({videoId:it.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  $("#favHero").style.backgroundImage = `url(${it.thumb})`;
  $("#favNowTitle").textContent = it.title;
  refreshIndicators();
}
function togglePlay(){
  if(!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
function prev(){ if(idx>0) playIndex(idx-1,true); }
function next(){ if(idx+1<items.length) playIndex(idx+1,true); }
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
    $("#cur").textContent = fmt(cur);
    $("#dur").textContent = fmt(dur);
    $("#seek").value = dur ? Math.floor((cur/dur)*1000) : 0;
    $("#curFav").textContent = fmt(cur);
    $("#durFav").textContent = fmt(dur);
    $("#seekFav").value = $("#seek").value;
    refreshIndicators();
  },250);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ====== Indicadores (EQ) ====== */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const currentId = items[idx]?.id || "";
  $$("#results .card").forEach(card=>{
    card.classList.toggle("is-playing", playing && card.dataset.trackId===currentId);
  });
  $$("#favList .fav-item").forEach(li=>{
    li.classList.toggle("is-playing", playing && li.dataset.trackId===currentId);
  });
}

/* ====== Visibilidad (truco recarga) ====== */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || idx<0 || !items[idx]) return;
  if(document.visibilityState==="hidden" && wasPlaying){
    const t = ytPlayer.getCurrentTime()||0;
    const it = items[idx];
    ytPlayer.loadVideoById({videoId:it.id, startSeconds:t, suggestedQuality:"auto"});
    ytPlayer.playVideo();
  }
});

/* ====== UI ====== */
$("#searchInput").addEventListener("keydown", async e=>{
  if(e.key==="Enter"){
    const q = $("#searchInput").value.trim();
    if(!q) return;
    items = await searchYouTube(q);
    originalOrder = items.slice();
    idx = -1;
    renderResults();
  }
});

$("#fabFavorites").onclick = ()=> openFavs();
$("#fabBackToSearch").onclick = ()=> closeFavs();
$("#btnCloseFavs").onclick = ()=> closeFavs();

function openFavs(){ $("#favoritesModal").classList.add("show"); document.body.classList.add("modal-open"); renderFavs(); }
function closeFavs(){ $("#favoritesModal").classList.remove("show"); document.body.classList.remove("modal-open"); }

/* Controles búsqueda */
$("#btnPlay").onclick = togglePlay;
$("#btnPrev").onclick = prev;
$("#btnNext").onclick = next;
$("#btnRepeat").onclick = ()=>{
  repeatOne = !repeatOne;
  $("#btnRepeat").classList.toggle("active", repeatOne);
  $("#btnRepeatFav").classList.toggle("active", repeatOne);
};
$("#btnShuffle").onclick = ()=>{
  shuffleOn = !shuffleOn;
  $("#btnShuffle").classList.toggle("active", shuffleOn);
  $("#btnShuffleFav").classList.toggle("active", shuffleOn);
  if(shuffleOn){
    if(idx>=0){
      const current = items[idx];
      const rest = items.filter((_,i)=>i!==idx);
      for(let i=rest.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [rest[i],rest[j]]=[rest[j],rest[i]]; }
      items = [current, ...rest]; idx = 0;
    }else{
      for(let i=items.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [items[i],items[j]]=[items[j],items[i]]; }
    }
  }else{
    if(originalOrder.length){
      const currentId = items[idx]?.id;
      items = originalOrder.slice();
      idx = items.findIndex(it=>it.id===currentId);
    }
  }
  renderResults();
};
$("#seek").addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

/* Controles favoritos (espejo) */
$("#btnPlayFav").onclick = togglePlay;
$("#btnPrevFav").onclick = prev;
$("#btnNextFav").onclick = next;
$("#btnRepeatFav").onclick = ()=> $("#btnRepeat").click();
$("#btnShuffleFav").onclick = ()=> $("#btnShuffle").click();
$("#seekFav").addEventListener("input", e=> { $("#seek").value = e.target.value; $("#seek").dispatchEvent(new Event("input")); });

/* ====== Init ====== */
loadFavs();
renderFavs();
loadYTApi();

/* Bloquea scroll del body al abrir modal (estética) */
document.body.classList.toggle = document.body.classList.toggle; // no-op para evitar warnings en minificadores
