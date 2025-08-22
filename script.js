/* ====== Utilidades ====== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* ====== Estado ====== */
let items = [];           // resultados
let favs  = [];           // favoritos
let idx   = -1;           // índice en items
let currentTrack = null;

let ytPlayer   = null;
let YT_READY   = false;
let wasPlaying = false;
let timer      = null;

let repeatOne  = false;

// cache y paginado simple
let searchCache = new Map();
let isLoadingMore = false;
let lastQuery = "";
let allIds = [];
let loadedIds = new Set();
const BATCH_SIZE = 8;
const INFINITE_BATCH_SIZE = 8;

/* ====== Búsqueda (scrape + batch) ====== */
async function searchYouTube(q, append=false){
  setCount(append ? `Cargando más… (${items.length})` : "Buscando…");

  if(!append){
    items = [];
    loadedIds.clear();
    $("#results").innerHTML = "";
  }else if(isLoadingMore){
    return;
  }else{
    isLoadingMore = true;
  }

  if(!append && searchCache.has(q)){
    items = searchCache.get(q);
    renderResults();
    setCount(`Resultados: ${items.length} (caché)`);
    return;
  }

  if(!append){
    lastQuery = q;
    const url = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    try{
      const html = await fetch(url, {headers:{Accept:"text/plain"}}).then(r=>r.text());
      allIds = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1])).slice(0,100);
    }catch(e){
      setCount("Error al conectar con YouTube");
      isLoadingMore = false;
      return;
    }
  }

  const idsToLoad = allIds.filter(id=>!loadedIds.has(id)).slice(0, append?INFINITE_BATCH_SIZE:BATCH_SIZE);
  if(idsToLoad.length===0){
    setCount(`Resultados: ${items.length}`);
    isLoadingMore = false;
    return;
  }

  for(const id of idsToLoad){
    try{
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      const track = {
        id,
        title: cleanTitle(meta.title || `Video ${id}`),
        thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        author: meta.author_name || "YouTube"
      };
      items.push(track);
      loadedIds.add(id);
      appendTrackToResults(track, items.length-1);
      setCount(`Resultados: ${items.length}`);
    }catch{
      const track = { id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"YouTube" };
      items.push(track);
      loadedIds.add(id);
      appendTrackToResults(track, items.length-1);
      setCount(`Resultados: ${items.length}`);
    }
  }

  if(!append) searchCache.set(q, [...items]);
  isLoadingMore = false;
}

function setCount(t){ const el=$("#resultsCount"); if(el) el.textContent=t||""; }

/* ====== Render ====== */
function appendTrackToResults(track, index){
  const root = $("#results");
  const li = document.createElement("article");
  li.className = "card";
  li.dataset.trackId = track.id;
  li.innerHTML = `
    <img class="thumb" loading="lazy" decoding="async" src="${track.thumb}" alt="">
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
    if(e.target.closest(".heart")){
      toggleFav(track);
      e.stopPropagation();
      return;
    }
    playIndex(index, true);
  });
  root.appendChild(li);
  refreshIndicators();
}

function renderResults(){
  const root = $("#results");
  root.innerHTML = "";
  items.forEach((it,i)=> appendTrackToResults(it,i));
}

/* ====== Favoritos ====== */
const LS_KEY = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_KEY, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)) favs = favs.filter(f=>f.id!==track.id);
  else favs.unshift(track);
  saveFavs();
  renderFavs();
  // reflejar estado en cards
  $$("#results .card").forEach(c=>{
    if(c.dataset.trackId===track.id){
      const btn=c.querySelector(".heart"); if(btn) btn.classList.toggle("active", isFav(track.id));
    }
  });
}
function removeFav(id){
  favs = favs.filter(f=>f.id!==id);
  saveFavs(); renderFavs();
}
function renderFavs(){
  const ul = $("#favList");
  ul.innerHTML = "";
  favs.forEach(it=>{
    const li=document.createElement("li");
    li.className="fav-item";
    li.dataset.trackId=it.id;
    li.innerHTML=`
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

/* ====== YouTube IFrame API ====== */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300, height:150, videoId:"",
    playerVars:{autoplay:0, controls:0, rel:0, playsinline:1},
    events:{ onReady:()=>{YT_READY=true}, onStateChange:onYTState }
  });
};
function onYTState(e){
  const st=e.data;
  const playing=(st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING);
  $("#btnPlay").classList.toggle("playing", playing);
  $("#btnPlayFav").classList.toggle("playing", playing);
  wasPlaying=playing;
  if(st===YT.PlayerState.ENDED){
    if(repeatOne){ ytPlayer.seekTo(0,true); ytPlayer.playVideo(); }
    else{ next(); }
  }
  refreshIndicators();
}

/* ====== Reproducción ====== */
function updateHero(track){
  const t=track||currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
}
function playIndex(i, autoplay=false){
  if(!YT_READY || !items[i]) return;
  idx=i; currentTrack=items[i];
  ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer(); updateHero(currentTrack); refreshIndicators();
}
function playFromFav(track, autoplay=false){
  if(!YT_READY || !track) return;
  currentTrack=track; idx = items.findIndex(x=>x.id===track.id);
  ytPlayer.loadVideoById({videoId:track.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer(); updateHero(track); refreshIndicators();
}
function togglePlay(){
  if(!YT_READY) return;
  const st=ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}
function prev(){
  if(idx>=0 && idx-1>=0){ playIndex(idx-1,true); return; }
  const p=favs.findIndex(f=>f.id===currentTrack?.id); if(p>0) playFromFav(favs[p-1],true);
}
function next(){
  if(idx>=0 && idx+1<items.length){ playIndex(idx+1,true); return; }
  const p=favs.findIndex(f=>f.id===currentTrack?.id); if(p>=0 && p+1<favs.length) playFromFav(favs[p+1],true);
}
function seekToFrac(frac){
  if(!YT_READY) return; const d=ytPlayer.getDuration()||0; ytPlayer.seekTo(frac*d,true);
}
function startTimer(){
  stopTimer();
  timer=setInterval(()=>{
    if(!YT_READY) return;
    const cur=ytPlayer.getCurrentTime()||0, dur=ytPlayer.getDuration()||0;
    $("#cur").textContent=fmt(cur); $("#dur").textContent=fmt(dur);
    $("#seek").value = dur ? Math.floor((cur/dur)*1000) : 0;
    $("#curFav").textContent=fmt(cur); $("#durFav").textContent=fmt(dur);
    $("#seekFav").value=$("#seek").value;
    refreshIndicators();
  },250);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ====== Indicadores (EQ) ====== */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";
  $$("#results .card").forEach(card=> card.classList.toggle("is-playing", playing && card.dataset.trackId===curId));
  $$("#favList .fav-item").forEach(li => li.classList.toggle("is-playing", playing && li.dataset.trackId===curId));
}

/* ====== Visibilidad ====== */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || !currentTrack) return;
  if(document.visibilityState==="hidden" && wasPlaying){
    const t=ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:t, suggestedQuality:"auto"});
    ytPlayer.playVideo();
  }
});

/* ====== UI ====== */
function setupSearchInput(){
  const inp=$("#searchInput");
  inp.addEventListener("keydown", async e=>{
    if(e.key==="Enter"){
      const q=inp.value.trim();
      if(!q) return;
      await searchYouTube(q,false);
    }
  });
}

/* Botones dentro del cajón de controles */
const openFavBtn = $("#btnGoFavorites");
const backSearchBtn = $("#btnGoSearch");
const closeX = $("#btnCloseFavs");

openFavBtn?.addEventListener("click", ()=> openFavs());
backSearchBtn?.addEventListener("click", ()=> closeFavs());
closeX?.addEventListener("click", ()=> closeFavs());

function openFavs(){ $("#favoritesModal").classList.add("show"); document.body.classList.add("modal-open"); renderFavs(); }
function closeFavs(){ $("#favoritesModal").classList.remove("show"); document.body.classList.remove("modal-open"); }

/* Controles (búsqueda) */
$("#btnPlay").onclick = togglePlay;
$("#btnPrev").onclick = prev;
$("#btnNext").onclick = next;
$("#btnRepeat").onclick = ()=>{
  repeatOne=!repeatOne;
  $("#btnRepeat").classList.toggle("active", repeatOne);
  $("#btnRepeatFav").classList.toggle("active", repeatOne);
};
$("#seek").addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

/* Controles (favoritos) */
$("#btnPlayFav").onclick = togglePlay;
$("#btnPrevFav").onclick = prev;
$("#btnNextFav").onclick = next;
$("#btnRepeatFav").onclick = ()=> $("#btnRepeat").click();
$("#seekFav").addEventListener("input", e=>{ $("#seek").value=e.target.value; $("#seek").dispatchEvent(new Event("input")); });

/* ====== Scroll infinito con IntersectionObserver ====== */
function setupInfinite(){
  const sentinel = $("#sentinel");
  const io = new IntersectionObserver((entries)=>{
    const ent = entries[0];
    if(ent.isIntersecting && lastQuery && !isLoadingMore){
      searchYouTube(lastQuery, true);
    }
  }, {root:null, rootMargin:"600px 0px 600px 0px", threshold:0});
  io.observe(sentinel);
}

/* ====== Init ====== */
loadFavs();
renderFavs();
loadYTApi();
setupSearchInput();
setupInfinite();
