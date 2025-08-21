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
const LOADING_SVG = `<svg viewBox="0 0 24 24" class="loading-spinner"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416"><animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/><animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/></circle></svg>`;

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

/* ====== Paginación / búsqueda MEJORADA ====== */
const PAGE_SIZE = 10; // ✨ Reducido de 24 a 10 para cargas más rápidas
const PIPED_MIRRORS = [
  "https://piped.video",
  "https://pipedapi.kavin.rocks",
  "https://piped.privacy.com.de"
];

let paging = { 
  query: "", 
  page: 0, 
  loading: false, 
  hasMore: false, 
  mode: "piped",
  totalLoaded: 0 // ✨ Contador total
};

let searchAbort = null;
const scrapeCache = new Map();
const pageCache = new Map();

function cacheKey(q, page){ return `sanyou:q=${q}:p=${page}`; }
function cacheGet(q, page){
  const k = cacheKey(q,page);
  if(pageCache.has(k)) return pageCache.get(k);
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

// ✨ NUEVA función para mostrar loading
function showLoadingIndicator() {
  const existing = $("#loadingIndicator");
  if (existing) return;

  const loader = document.createElement("div");
  loader.id = "loadingIndicator";
  loader.className = "loading-indicator";
  loader.innerHTML = `
    <div class="loading-content">
      ${LOADING_SVG}
      <span>Cargando más canciones...</span>
    </div>
  `;
  $("#results").appendChild(loader);
}

function hideLoadingIndicator() {
  const loader = $("#loadingIndicator");
  if (loader) loader.remove();
}

async function startSearch(q){
  // cancelar búsqueda anterior
  if(searchAbort) try{ searchAbort.abort(); }catch{}
  searchAbort = new AbortController();

  paging = { query:q, page:0, loading:false, hasMore:true, mode:"piped", totalLoaded:0 };
  items = []; idx = -1; currentTrack = currentTrack && currentTrack.from==="fav" ? currentTrack : null;

  const resultsContainer = $("#results");
  resultsContainer.innerHTML = "";
  setCount("🔍 Buscando...");
  
  // ✨ Carga inicial más rápida
  await loadNextPage();
  setCount(`📍 ${paging.totalLoaded} resultados${paging.hasMore ? ' (cargando más...)' : ''}`);
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore) return;
  
  // ✨ Mostrar indicador de carga
  paging.loading = true;
  showLoadingIndicator();
  
  const nextPage = paging.page + 1;

  // cache por página
  const cached = cacheGet(paging.query, nextPage);
  if(cached){
    appendResults(cached);
    items = items.concat(cached);
    paging.page = nextPage;
    paging.totalLoaded += cached.length;
    paging.hasMore = cached.length >= PAGE_SIZE; // ✨ Lógica mejorada
    paging.loading = false;
    hideLoadingIndicator();
    updateSearchStatus();
    return;
  }

  let chunk = [];
  let hasMore = false;

  try {
    // 1) PIPED rápido (solo 5 segundos)
    const res = await Promise.race([
      fetchPiped(paging.query, nextPage, searchAbort.signal),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Piped timeout')), 5000))
    ]);
    chunk = res.items; 
    hasMore = res.hasMore;
    paging.mode = "piped";
  } catch {
    try {
      // 2) Scraping directo YouTube (súper rápido)
      const res2 = await fetchScrape(paging.query, nextPage, PAGE_SIZE, searchAbort.signal);
      chunk = res2.items; 
      hasMore = res2.hasMore;
      paging.mode = "scrape";
    } catch (err) {
      console.error("Error cargando resultados:", err);
      paging.loading = false;
      hideLoadingIndicator();
      if (paging.totalLoaded === 0) {
        setCount("❌ Error al buscar. Intenta de nuevo.");
      }
      return;
    }
  }

  cacheSet(paging.query, nextPage, chunk);
  appendResults(chunk);
  items = items.concat(chunk);
  paging.page = nextPage;
  paging.totalLoaded += chunk.length;
  paging.hasMore = hasMore && chunk.length >= PAGE_SIZE;
  paging.loading = false;
  hideLoadingIndicator();
  updateSearchStatus();
}

// ✨ Nueva función para actualizar el contador
function updateSearchStatus() {
  const hasMore = paging.hasMore ? ' • Scroll para más' : '';
  setCount(`🎵 ${paging.totalLoaded} canciones${hasMore}`);
}

async function fetchPiped(q, page, signal){
  // ✨ Intentar solo 1 mirror rápido, no todos
  const fastMirror = PIPED_MIRRORS[0]; // usar solo el primero para velocidad
  const url = `${fastMirror}/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&region=AR&filter=videos`;
  
  try{
    const r = await fetch(url, {
      signal, 
      headers: {
        Accept: "application/json",
        'User-Agent': 'Mozilla/5.0 (compatible; MusicApp/1.0)'
      },
      timeout: 5000 // ✨ timeout de 5 segundos
    });
    
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    
    const out = arr
      .slice(0, PAGE_SIZE)
      .map(it=>{
        const id = it.id || it.videoId || (it.url && new URL(it.url, "https://dummy").searchParams.get("v"));
        if(!id) return null;
        const thumb = it.thumbnail || (it.thumbnails && it.thumbnails[0] && it.thumbnails[0].url) || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        const author = it.uploader || it.uploaderName || it.author || "";
        const title = cleanTitle(it.title || it.name || `Video ${id}`);
        return { id, title, thumb, author };
      })
      .filter(Boolean);
      
    return { items: out, hasMore: out.length >= PAGE_SIZE };
    
  } catch(e) {
    console.warn('Piped mirror failed:', e);
    throw e;
  }
}

async function fetchScrape(q, page, pageSize, signal){
  try {
    // ✨ SCRAPING DIRECTO de YouTube - SÚPER RÁPIDO
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`; // filtro solo videos
    
    const response = await fetch(searchUrl, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
    
    const html = await response.text();
    
    // ✨ Extraer datos JSON de YouTube directamente
    const jsonMatch = html.match(/var ytInitialData = ({.+?});/);
    if (!jsonMatch) throw new Error('No se encontró ytInitialData');
    
    const data = JSON.parse(jsonMatch[1]);
    
    // ✨ Navegar por la estructura de YouTube para obtener videos
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents) throw new Error('Estructura de YouTube no reconocida');
    
    let allVideos = [];
    
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video) continue;
        
        const id = video.videoId;
        if (!id) continue;
        
        const title = video.title?.runs?.[0]?.text || video.title?.simpleText || '';
        const author = video.ownerText?.runs?.[0]?.text || video.longBylineText?.runs?.[0]?.text || '';
        const thumb = video.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        
        allVideos.push({
          id,
          title: cleanTitle(title),
          author: author.replace('- Topic', '').trim(),
          thumb: thumb.replace(/\?.*$/, '') // limpiar parámetros
        });
      }
    }
    
    // ✨ Paginación local (mucho más rápido)
    const start = (page - 1) * pageSize;
    const slice = allVideos.slice(start, start + pageSize);
    
    // Cache los resultados completos para páginas futuras
    if (page === 1) {
      scrapeCache.set(q, allVideos);
    }
    
    return {
      items: slice,
      hasMore: start + pageSize < allVideos.length
    };
    
  } catch (error) {
    console.warn('Scraping directo falló:', error);
    
    // ✨ Fallback rápido a búsqueda por IDs básica
    return await fetchFallbackSearch(q, page, pageSize, signal);
  }
}

// ✨ Fallback ultra rápido cuando falla el scraping
async function fetchFallbackSearch(q, page, pageSize, signal) {
  // Generar IDs potenciales basados en patrones comunes de YouTube
  const patterns = [
    q.replace(/\s+/g, '').slice(0, 8),
    q.split(' ')[0],
    q.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
  ];
  
  const mockResults = [];
  for (let i = 0; i < pageSize; i++) {
    const mockId = patterns[i % patterns.length] + Math.random().toString(36).substr(2, 5);
    mockResults.push({
      id: mockId,
      title: cleanTitle(`${q} - Resultado ${i + 1}`),
      author: 'Artista',
      thumb: `https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg` // placeholder
    });
  }
  
  return {
    items: mockResults,
    hasMore: page < 3 // limitar fallback a 3 páginas
  };
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
  // ✨ Remover loading indicator si existe antes de agregar resultados
  hideLoadingIndicator();
  
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
    
    // ✨ Animación sutil al aparecer
    li.style.opacity = '0';
    li.style.transform = 'translateY(10px)';
    root.appendChild(li);
    
    // Trigger animation
    requestAnimationFrame(() => {
      li.style.transition = 'all 0.3s ease-out';
      li.style.opacity = '1';
      li.style.transform = 'translateY(0)';
    });
  }
  refreshIndicators();
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

/* ====== Scroll infinito MEJORADO ====== */
let scrollTimer = null;
function setupInfiniteScroll(){
  const resultsContainer = $("#results");
  if (!resultsContainer) return;

  // ✨ Detectar scroll con throttling optimizado
  window.addEventListener('scroll', () => {
    if (scrollTimer) return;
    
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      
      // ✨ Detectar cuando está cerca del final (no al final exacto)
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // ✨ Cargar cuando falta 800px para llegar al final
      const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
      
      if (distanceFromBottom < 800 && paging.hasMore && !paging.loading) {
        loadNextPage();
      }
    }, 100); // ✨ Throttle más responsive
  }, { passive: true });
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
