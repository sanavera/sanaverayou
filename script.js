/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();

/* ========= Estado ========= */
let items = [];            // resultados de búsqueda
let favs  = [];            // favoritos
let playlists = [];        // [{id,name,tracks:[]}]
let queue = null;          // cola actual
let queueType = null;      // 'search' | 'favs' | 'playlist'
let qIdx = -1;
let currentTrack = null;

let ytPlayer = null, YT_READY = false, wasPlaying = false, timer = null;

let selectedTrack = null;  // para el sheet (desde card o desde player)

/* ========= Paginación / búsqueda ========= */
const PAGE_SIZE = 12;
const PIPED_MIRRORS = [
  "https://piped.video",
  "https://pipedapi.kavin.rocks",
  "https://piped.privacy.com.de"
];
let paging = { query:"", page:0, loading:false, hasMore:false, mode:"piped" };
let searchAbort = null;
const pageCache = new Map();
const cacheKey = (q,p) => `sanyou:q=${q}:p=${p}`;

/* ========= Views & Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  switchView(btn.dataset.view);
});

/* ========= Buscar ========= */
$("#searchInput").addEventListener("keydown", async e=>{
  if(e.key!=="Enter") return;
  const q = e.target.value.trim(); if(!q) return;
  await startSearch(q);
  // Nos quedamos en Búsqueda
});

function setCount(t){ $("#resultsCount").textContent = t||""; }

async function startSearch(q){
  if(searchAbort) try{ searchAbort.abort(); }catch{}
  searchAbort = new AbortController();

  paging = { query:q, page:0, loading:false, hasMore:true, mode:"piped" };
  items = [];
  $("#results").innerHTML = "";
  setCount("Buscando…");

  await loadNextPage();
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore) return;
  paging.loading = true;
  const next = paging.page + 1;

  const ck = cacheKey(paging.query, next);
  if(pageCache.has(ck)){
    const chunk = pageCache.get(ck);
    appendResults(chunk);
    items = items.concat(chunk);
    paging.page = next;
    paging.hasMore = chunk.length >= PAGE_SIZE;
    paging.loading = false;
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
    return;
  }

  let chunk = [], hasMore = false, lastErr = null;

  // 1) Piped
  for(const base of PIPED_MIRRORS){
    const url = `${base}/api/v1/search?q=${encodeURIComponent(paging.query)}&page=${next}&filter=videos&region=AR`;
    try{
      const r = await fetch(url, {signal:searchAbort.signal, headers:{Accept:"application/json"}});
      if(!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      chunk = arr.slice(0, PAGE_SIZE).map(it=>{
        const id = it.id || it.videoId || (it.url && new URL(it.url,"https://x").searchParams.get("v"));
        if(!id) return null;
        const thumb = it.thumbnail || (it.thumbnails && it.thumbnails[0] && it.thumbnails[0].url) || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        const author = it.uploader || it.uploaderName || it.author || "";
        const title = cleanTitle(it.title || it.name || `Video ${id}`);
        return { id, title, thumb, author };
      }).filter(Boolean);
      hasMore = chunk.length >= PAGE_SIZE;
      paging.mode = "piped";
      break;
    }catch(e){ lastErr = e; continue; }
  }

  // 2) Fallback scrape
  if(!chunk.length){
    try{
      const html = await fetch(`https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(paging.query)}`, {signal:searchAbort.signal, headers:{Accept:"text/plain"}}).then(r=>r.text());
      const idsAll = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1]));
      const slice = idsAll.slice((next-1)*PAGE_SIZE, next*PAGE_SIZE);
      const metas = await mapLimit(slice, 6, async (id)=>{
        try{
          const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`, {signal:searchAbort.signal}).then(r=>r.json());
          return { id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"" };
        }catch{
          return { id, title: cleanTitle(`Video ${id}`), thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"" };
        }
      });
      chunk = metas; hasMore = idsAll.length > next*PAGE_SIZE; paging.mode = "scrape";
    }catch(e){ lastErr = e; }
  }

  if(!chunk.length && lastErr){
    setCount("❌ Error al buscar. Intenta de nuevo.");
    paging.loading = false; paging.hasMore = false; return;
  }

  pageCache.set(ck, chunk);
  appendResults(chunk);
  items = items.concat(chunk);
  paging.page = next;
  paging.hasMore = hasMore;
  paging.loading = false;
  setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
}

async function mapLimit(arr, limit, worker){
  const out = new Array(arr.length); let i=0; const pool=new Set();
  async function fill(){
    while(i<arr.length && pool.size<limit){
      const idx=i++; const p=Promise.resolve(worker(arr[idx])).then(v=>out[idx]=v).finally(()=>pool.delete(p)); pool.add(p);
    }
    if(!pool.size) return; await Promise.race(pool); return fill();
  }
  await fill(); await Promise.all([...pool]); return out;
}

/* ========= Render resultados ========= */
function appendResults(chunk){
  const root = $("#results");
  for(const it of chunk){
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.trackId = it.id;
    card.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${it.author||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones">
          <svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
        </button>
      </div>`;

    card.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    });

    card.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{
        const pos = items.findIndex(x=>x.id===it.id);
        playFromSearch(pos>=0?pos:0, true);
      }
      refreshIndicators();
    };

    card.querySelector(".more").onclick = (e)=>{
      e.stopPropagation(); selectedTrack = it; openMenuFor(selectedTrack);
    };

    card.style.opacity='0'; card.style.transform='translateY(10px)';
    root.appendChild(card);
    requestAnimationFrame(()=>{ card.style.transition='all .25s ease-out'; card.style.opacity='1'; card.style.transform='translateY(0)'; });
  }
  refreshIndicators();
}

/* ========= Favoritos ========= */
const LS_FAVS = "sanayera_favs_v1";
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_FAVS)||"[]"); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_FAVS, JSON.stringify(favs)); }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(track){
  if(isFav(track.id)) favs = favs.filter(f=>f.id!==track.id);
  else favs.unshift(track);
  saveFavs();
  renderFavs();
}

function removeFav(id){ favs = favs.filter(f=>f.id!==id); saveFavs(); renderFavs(); }

function renderFavs(){
  const ul = $("#favList"); ul.innerHTML="";
  favs.forEach(it=>{
    const li = document.createElement("li");
    li.className = "fav-item"; li.dataset.trackId = it.id;
    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${it.author||""}</div>
      </div>
      <button class="remove-btn" title="Quitar">✕</button>`;

    // Reproducir (sin navegar al reproductor)
    li.addEventListener("click", e=>{
      if(e.target.closest(".remove-btn") || e.target.closest(".card-play")) return;
      playFromFav(it, true);
    });

    // Play/pause overlay
    li.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{ playFromFav(it, true); }
      refreshIndicators();
    };

    li.querySelector(".remove-btn").onclick = (e)=>{ e.stopPropagation(); removeFav(it.id); };

    ul.appendChild(li);
  });
  updateHero(currentTrack);
  refreshIndicators();
}

/* ========= Playlists ========= */
const LS_PL = "sanayera_playlists_v1";
function loadPlaylists(){ try{ playlists = JSON.parse(localStorage.getItem(LS_PL)||"[]"); }catch{ playlists=[]; } }
function savePlaylists(){ localStorage.setItem(LS_PL, JSON.stringify(playlists)); }

function renderPlaylists(){
  const list = $("#plList"), empty = $("#plEmpty"); list.innerHTML="";
  if(!playlists.length){ empty.classList.remove("hide"); return; }
  empty.classList.add("hide");
  playlists.forEach(pl=>{
    const li = document.createElement("li"); li.className="pl-item";
    const cover = pl.tracks[0]?.thumb || "https://picsum.photos/seed/pl/200";
    li.innerHTML = `
      <div class="pl-meta">
        <img class="pl-thumb" src="${cover}" alt="">
        <div>
          <div class="title-text">${pl.name}</div>
          <div class="subtitle">${pl.tracks.length} temas</div>
        </div>
      </div>
      <div class="pl-actions">
        <button class="pill ghost" data-act="rename">Renombrar</button>
        <button class="pill danger" data-act="delete">Eliminar</button>
        <button class="pill ghost" data-act="open">Abrir</button>
        <button class="pill" data-act="play">Reproducir</button>
      </div>`;
    li.querySelector('[data-act="open"]').onclick = ()=>{
      showPlaylistInPlayer(pl.id);
      switchView("view-player");
    };
    li.querySelector('[data-act="play"]').onclick = ()=>{
      playPlaylist(pl.id); switchView("view-player");
    };
    li.querySelector('[data-act="rename"]').onclick = ()=>{
      const name = prompt("Nuevo nombre:", pl.name)?.trim();
      if(!name) return; pl.name = name; savePlaylists(); renderPlaylists();
    };
    li.querySelector('[data-act="delete"]').onclick = ()=>{
      if(!confirm(`Eliminar playlist "${pl.name}"?`)) return;
      playlists = playlists.filter(p=>p.id!==pl.id); savePlaylists(); renderPlaylists();
    };
    list.appendChild(li);
  });
}

$("#btnNewPlaylist").onclick = ()=>{
  const name = prompt("Nombre de la playlist:")?.trim();
  if(!name) return;
  const id = "pl_"+Date.now().toString(36);
  playlists.unshift({id, name, tracks:[]});
  savePlaylists(); renderPlaylists();
};

/* ========= Menú 3 puntos (sheet) ========= */
function openMenuFor(track){
  $("#mFav").textContent = isFav(track.id) ? "Quitar de Favoritos" : "Añadir a Favoritos";
  $("#menuSheet").classList.add("show");
}
$("#npMenu").onclick = ()=>{ if(currentTrack){ selectedTrack = currentTrack; openMenuFor(currentTrack); } };
$("#mClose").onclick = ()=> $("#menuSheet").classList.remove("show");
$("#menuSheet").addEventListener("click", e=>{ if(e.target.id==="menuSheet") $("#menuSheet").classList.remove("show"); });

$("#mFav").onclick = ()=>{
  if(!selectedTrack) return;
  toggleFav(selectedTrack);
  $("#menuSheet").classList.remove("show");
};
$("#mPl").onclick = ()=>{
  if(!selectedTrack) return;
  $("#menuSheet").classList.remove("show");
  openPlaylistSheet(selectedTrack);
};

function openPlaylistSheet(track){
  const sheet = $("#playlistSheet"); sheet.classList.add("show");
  const list = $("#plChoices"); list.innerHTML="";
  playlists.forEach(pl=>{
    const btn = document.createElement("button");
    btn.className="sheet-item";
    btn.textContent = pl.name;
    btn.onclick = ()=>{
      if(!pl.tracks.some(t=>t.id===track.id)) pl.tracks.unshift(track);
      savePlaylists(); sheet.classList.remove("show"); renderPlaylists();
    };
    list.appendChild(btn);
  });
  $("#plCreate").onclick = ()=>{
    const name = $("#plNewName").value.trim(); if(!name) return;
    const id = "pl_"+Date.now().toString(36);
    const pl = {id, name, tracks:[track]};
    playlists.unshift(pl); savePlaylists(); renderPlaylists();
    $("#plNewName").value = ""; sheet.classList.remove("show");
  };
  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

/* ========= Reproducir ========= */
function updateHero(track){
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  $("#npSub").textContent = t ? (t.author||"—") : "—";
}

function setQueue(srcArr, type, idx){ queue = srcArr; queueType = type; qIdx = idx; }

function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateHero(currentTrack);
  refreshIndicators();
}

function playFromSearch(i, autoplay=false){ setQueue(items, "search", i); playCurrent(autoplay); }
function playFromFav(track, autoplay=false){
  const i = favs.findIndex(f=>f.id===track.id);
  setQueue(favs, "favs", Math.max(i,0)); playCurrent(autoplay);
}
function playFromPlaylist(plId, i, autoplay=false){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  setQueue(pl.tracks, "playlist", i); playCurrent(autoplay);
}

function playPlaylist(id){ const pl = playlists.find(p=>p.id===id); if(!pl||!pl.tracks.length) return; playFromPlaylist(pl.id, 0, true); }

function togglePlay(){
  if(!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
  const playing = !(st===YT.PlayerState.PLAYING);
  $("#npPlay").classList.toggle("playing", playing);
}
$("#npPlay").onclick = togglePlay;

function next(){ if(!queue) return; if(qIdx+1<queue.length){ qIdx++; playCurrent(true); } }
function prev(){ if(!queue) return; if(qIdx-1>=0){ qIdx--; playCurrent(true); } }
function seekToFrac(frac){ if(!YT_READY) return; const d = ytPlayer.getDuration()||0; ytPlayer.seekTo(frac*d,true); }
$("#seek").addEventListener("input", e=> seekToFrac(parseInt(e.target.value,10)/1000));

function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY) return;
    const cur = ytPlayer.getCurrentTime()||0, dur = ytPlayer.getDuration()||0;
    $("#cur").textContent = fmt(cur); $("#dur").textContent = fmt(dur);
    $("#seek").value = dur? Math.floor((cur/dur)*1000) : 0;
    const playing = ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING;
    $("#npPlay").classList.toggle("playing", playing);
    refreshIndicators();
  }, 250);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ========= Queue en Player (para playlists) ========= */
function showPlaylistInPlayer(plId){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  const panel = $("#queuePanel"); panel.classList.remove("hide");
  $("#queueTitle").textContent = pl.name;
  const ul = $("#queueList"); ul.innerHTML="";
  pl.tracks.forEach((t,i)=>{
    const li = document.createElement("li"); li.className="queue-item"; li.dataset.trackId=t.id;
    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${t.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${t.author||""}</div>
      </div>`;
    li.onclick = ()=> playFromPlaylist(pl.id, i, true);
    ul.appendChild(li);
  });
  refreshIndicators();
}
function hideQueuePanel(){ $("#queuePanel").classList.add("hide"); $("#queueList").innerHTML=""; }

/* ========= Indicadores / EQ ========= */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";

  // tarjetas de búsqueda
  $$("#results .card").forEach(c=>{
    const isCur = c.dataset.trackId===curId;
    c.classList.toggle("is-playing", playing && isCur);
    const btn = c.querySelector(".card-play");
    if(btn) btn.classList.toggle("playing", playing && isCur);
  });
  // favoritos
  $$("#favList .fav-item").forEach(li=>{
    const isCur = li.dataset.trackId===curId;
    li.classList.toggle("is-playing", playing && isCur);
    const btn = li.querySelector(".card-play");
    if(btn) btn.classList.toggle("playing", playing && isCur);
  });
  // queue en player
  $$("#queueList .queue-item").forEach(li=>{
    li.classList.toggle("is-playing", playing && li.dataset.trackId===curId);
  });
}

/* ========= Visibilidad (truco recarga) ========= */
document.addEventListener("visibilitychange", ()=>{
  if(!YT_READY || !currentTrack) return;
  if(document.visibilityState==="hidden" && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING)){
    const t = ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds:t, suggestedQuality:"auto" });
    ytPlayer.playVideo();
  }
});

/* ========= YouTube API ========= */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement("script"); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width:300, height:150, videoId:"",
    playerVars:{autoplay:0, controls:0, rel:0, playsinline:1},
    events:{
      onReady:()=>{ YT_READY=true; },
      onStateChange:(e)=>{
        const st=e.data, playing=(st===YT.PlayerState.PLAYING || st===YT.PlayerState.BUFFERING);
        $("#npPlay").classList.toggle("playing", playing);
        wasPlaying = playing;
        if(st===YT.PlayerState.ENDED){ next(); }
        refreshIndicators();
      }
    }
  });
};

/* ========= Infinite scroll con sentinel ========= */
const io = new IntersectionObserver((entries)=>{
  for(const en of entries){ if(en.isIntersecting){ loadNextPage(); } }
},{ root:null, rootMargin:"800px 0px", threshold:0 });
io.observe($("#sentinel"));

/* ========= Init ========= */
loadFavs();
loadPlaylists();
renderFavs();
renderPlaylists();
loadYTApi();
