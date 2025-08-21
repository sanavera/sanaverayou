/* ====== Utilidades ====== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s=Math.max(0,Math.floor(s||0)); const m=Math.floor(s/60), ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();

const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* ====== Estado ====== */
let items = [];               // resultados (buscador)
let favs = [];                // favoritos
let idx = -1;                 // índice en items
let currentTrack = null;      // canción actual (puede venir de búsqueda o de favoritos)

let ytPlayer = null;
let YT_READY = false;
let wasPlaying = false;
let timer = null;

let repeatOne = false;

/* ====== Paginación / búsqueda ====== */
const PAGE_SIZE = 24;
const PIPED_MIRRORS = [
  "https://piped.video",
  "https://pipedapi.kavin.rocks",
  "https://piped.privacy.com.de"
];

let paging = { query:"", page:0, loading:false, hasMore:false, mode:"piped" };
let searchAbort = null;
const scrapeCache = new Map();        // query -> ids[]
const pageCache = new Map();          // cache en memoria (rápida)

function cacheKey(q, page){ return `sanyou:q=${q}:p=${page}`; }
function cacheGet(q, page){
  // primero memoria
  const k = cacheKey(q,page);
  if(pageCache.has(k)) return pageCache.get(k);
  // sessionStorage con TTL
  try{
    const raw = sessionStorage.getItem(k);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(Date.now()-obj.ts > 10*60*1000) return null; // 10 min
    return obj.data;
  }catch{ return null; }
}
function cacheSet(q, page, data){
  const k = cacheKey(q,page);
  pageCache.set(k, data);
  try{ sessionStorage.setItem(k, JSON.stringify({ts:Date.now(), data})) }catch{}
}

async function startSearch(q){
  // cancelar búsqueda anterior
  if(searchAbort) try{ searchAbort.abort(); }catch{}
  searchAbort = new AbortController();

  paging = { query:q, page:0, loading:false, hasMore:true, mode:"piped" };
  items = []; idx = -1; currentTrack = currentTrack && currentTrack.from==="fav" ? currentTrack : null;

  $("#results").innerHTML = "";
  setCount("Buscando…");
  // primer batch
  await loadNextPage();
  setCount(`Resultados: ${items.length}${paging.hasMore?'…':''}`);
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore) return;
  paging.loading = true;
  const nextPage = paging.page + 1;

  // cache por página
  const cached = cacheGet(paging.query, nextPage);
  if(cached){
    appendResults(cached);
    items = items.concat(cached);
    paging.page = nextPage;
    paging.hasMore = cached.length > 0;
    paging.loading = false;
    keepSentinelAtEnd();
    setCount(`Resultados: ${items.length}${paging.hasMore?'…':''}`);
    return;
  }

  let chunk = [];
  let hasMore = false;

  // 1) PIPED con mirrors
  try{
    const res = await fetchPiped(paging.query, nextPage, searchAbort.signal);
    chunk = res.items; hasMore = res.hasMore;
    paging.mode = "piped";
  }catch{
    // 2) fallback scrape (una sola descarga grande por query y paginamos localmente)
    const res2 = await fetchScrape(paging.query, nextPage, PAGE_SIZE, searchAbort.signal);
    chunk = res2.items; hasMore = res2.hasMore;
    paging.mode = "scrape";
  }

  cacheSet(paging.query, nextPage, chunk);
  appendResults(chunk);
  items = items.concat(chunk);
  paging.page = nextPage;
  paging.hasMore = hasMore && chunk.length>0;
  paging.loading = false;
  keepSentinelAtEnd();
  setCount(`Resultados: ${items.length}${paging.hasMore?'…':''}`);
}

async function fetchPiped(q, page, signal){
  let lastErr = null;
  for(const base of PIPED_MIRRORS){
    const url = `${base}/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&region=AR&filter=videos`;
    try{
      const r = await fetch(url, {signal, headers:{Accept:"application/json"}});
      if(!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const data = await r.json();
      // algunos mirrors devuelven array directo, otros {items:[]}
      const arr = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      const out = arr
        .map(it=>{
          const id = it.id || it.videoId || (it.url && new URL(it.url, "https://dummy").searchParams.get("v"));
          if(!id) return null;
          const thumb = it.thumbnail || (it.thumbnails && it.thumbnails[0] && it.thumbnails[0].url) || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
          const author = it.uploader || it.uploaderName || it.author || "";
          const title = cleanTitle(it.title || it.name || `Video ${id}`);
          return { id, title, thumb, author };
        })
        .filter(Boolean);
      return { items: out, hasMore: out.length>0 };
    }catch(e){ lastErr = e; continue; }
  }
  throw lastErr || new Error("Piped falló");
}

async function fetchScrape(q, page, pageSize, signal){
  if(!scrapeCache.has(q)){
    const url = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const html = await fetch(url, {signal, headers:{Accept:"text/plain"}}).then(r=>r.text());
    const ids = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1]));
    scrapeCache.set(q, ids);
  }
  const ids = scrapeCache.get(q);
  const start = (page-1)*pageSize;
  const slice = ids.slice(start, start+pageSize);

  const metas = await mapLimit(slice, 6, async (id)=>{
    try{
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`, {signal}).then(r=>r.json());
      return { id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"" };
    }catch{
      return { id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"" };
    }
  });
  return { items: metas, hasMore: start+pageSize < ids.length };
}

async function mapLimit(arr, limit, worker){
  const out = new Array(arr.length);
  let i = 0;
  const pool = new Set();
  async function fill(){
    while(i < arr.length && pool.size < limit){
      const idx = i++;
      const p = Promise.resolve(worker(arr[idx])).then(res=>{ out[idx]=res; }).finally(()=>pool.delete(p));
      pool.add(p);
    }
    if(pool.size === 0) return;
    await Promise.race(pool);
    return fill();
  }
  await fill();
  await Promise.all([...pool]);
  return out;
}

/* ====== Render ====== */
function setCount(t){ $("#resultsCount").textContent = t||""; }

function appendResults(chunk){
  const root = $("#results");
  for(const it of chunk){
    const li = document.createElement("article");
    li.className = "card";
    li.dataset.trackId = it.id;
    li.innerHTML = `
      <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="" />
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
      const pos = items.findIndex(x=>x.id===it.id);
      playIndex(pos>=0?pos:0, true);
    });
    root.appendChild(li);
  }
  refreshIndicators();
}

function keepSentinelAtEnd(){
  const s = $("#scrollSentinel");
  if(s && s.parentElement !== document.body){
    // que quede después de la lista
    s.remove();
    $("#main").appendChild(s);
  }
}

/* ====== Favoritos ====== */
const LS_KEY = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_KEY, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)){ favs = favs.filter(f=>f.id!==track.id); }
  else{ favs.unshift(track); }
  saveFavs();
  renderFavs();
  // reflejar corazón en resultados ya pintados
  $$("#results .card").forEach(c=>{
    if(c.dataset.trackId===track.id){
      const btn = c.querySelector(".heart");
      if(btn) btn.classList.toggle("active", isFav(track.id));
    }
  });
}
function removeFav(id){
  favs = favs.filter(f=>f.id!==id);
  saveFavs();
  renderFavs();
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
      <button class="remove-btn" title="Quitar">✕</button>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".remove-btn")){
        removeFav(it.id);
        e.stopPropagation();
        return;
      }
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
function updateHero(track){
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
}

function playIndex(i, autoplay=false){
  if(!YT_READY || !items[i]) return;
  idx = i;
  currentTrack = {...items[i], from:"search"};
  ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(currentTrack);
  refreshIndicators();
}

function playFromFav(track, autoplay=false){
  if(!YT_READY || !track) return;
  currentTrack = {...track, from:"fav"};
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
  const curId = currentTrack?.id || "";
  $$("#results .card").forEach(card=>{
    card.classList.toggle("is-playing", playing && card.dataset.trackId===curId);
  });
  $$("#favList .fav-item").forEach(li=>{
    li.classList.toggle("is-playing", playing && li.dataset.trackId===curId);
  });
}

/* ====== Truco: seguir sonando al perder foco ====== */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || !currentTrack) return;
  if(document.visibilityState==="hidden" && wasPlaying){
    const t = ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({videoId:currentTrack.id, startSeconds:t, suggestedQuality:"auto"});
    ytPlayer.playVideo();
  }
});

/* ====== Scroll infinito ====== */
let io = null;
function setupInfiniteScroll(){
  const sentinel = $("#scrollSentinel");
  if(!sentinel) return;
  if(io) io.disconnect();
  io = new IntersectionObserver((entries)=>{
    for(const e of entries){
      if(e.isIntersecting){
        loadNextPage();
      }
    }
  }, { root: null, rootMargin: "800px", threshold: 0 });
  io.observe(sentinel);
}

/* ====== UI ====== */
$("#searchInput").addEventListener("keydown", async e=>{
  if(e.key==="Enter"){
    const q = $("#searchInput").value.trim();
    if(!q) return;
    await startSearch(q);
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
$("#seek").addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

/* Controles favoritos (espejo) */
$("#btnPlayFav").onclick = togglePlay;
$("#btnPrevFav").onclick = prev;
$("#btnNextFav").onclick = next;
$("#btnRepeatFav").onclick = ()=> $("#btnRepeat").click();
$("#seekFav").addEventListener("input", e=> { $("#seek").value = e.target.value; $("#seek").dispatchEvent(new Event("input")); });

/* ====== Init ====== */
loadFavs();
renderFavs();
loadYTApi();
setupInfiniteScroll();
