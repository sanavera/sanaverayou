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
let items = [];            // resultados
let favs  = [];            // favoritos
let playlists = [];        // [{id,name,tracks:[]}]
let queue = null;          // cola actual
let queueType = null;      // 'search'|'favs'|'playlist'
let qIdx = -1;
let currentTrack = null;

let ytPlayer = null, YT_READY = false, wasPlaying = false, timer = null;
let selectedTrack = null;        // para sheets desde cards/favs
let selectedPlaylistId = null;   // para sheet de playlists

/* ========= Búsqueda turbo ========= */
const FIRST_PAGE_SIZE = 8;   // primera “pinta” rápida
const PAGE_SIZE       = 12;  // siguientes páginas
const SCRAPE_META_CONC = 6;  // concurrencia para hidratar títulos
const RACE_TIMEOUT_MS = 3500;

const PIPED_MIRRORS = [
  "https://piped.video",
  "https://pipedapi.kavin.rocks",
  "https://piped.privacy.com.de"
];

let paging = { query:"", page:0, loading:false, hasMore:false, mode:"piped" };
let searchAbort = null;
let fastestMirror = null; // aprendemos el mirror más rápido
const pageCache = new Map();
const cacheKey = (q,p) => `sanyou:q=${q}:p=${p}`;
const storageGet = (k) => {
  try{
    const raw = sessionStorage.getItem(k); if(!raw) return null;
    const obj = JSON.parse(raw); if(Date.now()-obj.ts > 10*60*1000) return null;
    return obj.data;
  }catch{ return null; }
};
const storageSet = (k,data) => {
  try{ sessionStorage.setItem(k, JSON.stringify({ts:Date.now(), data})); }catch{}
};

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  switchView(btn.dataset.view);
});

/* ========= Buscar (UI) ========= */
$("#searchInput").addEventListener("keydown", async e=>{
  if(e.key!=="Enter") return;
  const q = e.target.value.trim(); if(!q) return;
  await startSearch(q);
});
function setCount(t){ $("#resultsCount").textContent = t||""; }

/* ========= Buscar (motor rápido) ========= */
function withTimeout(p, ms = RACE_TIMEOUT_MS){
  return Promise.race([
    p,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")), ms))
  ]);
}
function makeAbortableFetch(url, controller){
  return fetch(url, {signal: controller.signal, headers:{Accept:"application/json"}});
}
function mapPipedItems(arr, limit){
  return arr.slice(0, limit).map(it=>{
    const id = it.id || it.videoId || (it.url && new URL(it.url,"https://x").searchParams.get("v"));
    if(!id) return null;
    const thumb = it.thumbnail || (it.thumbnails && it.thumbnails[0] && it.thumbnails[0].url) || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    const author = it.uploader || it.uploaderName || it.author || "";
    const title = cleanTitle(it.title || it.name || `Video ${id}`);
    return { id, title, thumb, author };
  }).filter(Boolean);
}

/* Piped: arma promesa por mirror */
function pipedPagePromise(base, q, page, limit, c){
  const url = `${base}/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&filter=videos&region=AR`;
  const t0 = performance.now();
  return makeAbortableFetch(url, c)
    .then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(data=>{
      const arr = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      const out = mapPipedItems(arr, limit);
      const hasMore = arr.length >= limit;
      const dt = performance.now()-t0;
      return { items: out, hasMore, mode:"piped", used: base, dt };
    });
}

/* Scrape: ids inmediatos + hidratación opcional */
async function scrapePage(q, page, limit, c, hydrate=true){
  const url = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const t0 = performance.now();
  const html = await fetch(url, {signal:c.signal, headers:{Accept:"text/plain"}}).then(r=>r.text());
  const idsAll = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1]));
  const slice = idsAll.slice((page-1)*limit, page*limit);

  // Pinta inmediata con título provisorio y thumb
  const items = slice.map(id=>({
    id,
    title: cleanTitle(`Video ${id}`),
    thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    author: ""
  }));

  const dt = performance.now()-t0;
  // Hidratación en 2º plano (no bloquea primera pinta)
  if(hydrate){
    (async()=>{
      const metas = await mapLimit(slice, SCRAPE_META_CONC, async (id)=>{
        try{
          const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`, {signal:c.signal}).then(r=>r.json());
          return { id, title: cleanTitle(meta.title||`Video ${id}`), author: meta.author_name||"", thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
        }catch{
          return { id, title: cleanTitle(`Video ${id}`), author:"", thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg` };
        }
      });
      // actualizo DOM si sigue visible
      metas.forEach(m=>{
        const node = document.querySelector(`[data-track-id="${m.id}"]`);
        if(node){
          const tt = node.querySelector(".title-text");
          const sub = node.querySelector(".subtitle");
          const img = node.querySelector(".thumb");
          if(tt) tt.textContent = m.title;
          if(sub) sub.textContent = m.author || "";
          if(img && img.src!==m.thumb) img.src = m.thumb;
        }
      });
    })();
  }

  return { items, hasMore: idsAll.length > page*limit, mode:"scrape", used:"scrape", dt };
}

async function mapLimit(arr, limit, worker){
  const out = new Array(arr.length); let i=0; const pool=new Set();
  async function fill(){
    while(i<arr.length && pool.size<limit){
      const idx=i++; const p=Promise.resolve(worker(arr[idx])).then(v=>out[idx]=v).finally(()=>pool.delete(p));
      pool.add(p);
    }
    if(!pool.size) return; await Promise.race(pool); return fill();
  }
  await fill(); await Promise.all([...pool]); return out;
}

/* Carrera: piped x3 + scrape -> primero que entregue */
async function raceSearchPage(q, page, limit, externalAbort){
  const localAbort = new AbortController();
  const onAbort = () => localAbort.abort();
  if(externalAbort) externalAbort.addEventListener?.("abort", onAbort, {once:true});

  const contenders = [];

  // Prioridad: si ya sabemos el mirror rápido, probalo dos veces (rápido y con timeout corto)
  if(fastestMirror){
    contenders.push(withTimeout(pipedPagePromise(fastestMirror, q, page, limit, localAbort)));
  }
  // Resto de mirrors en paralelo
  for(const base of PIPED_MIRRORS){
    if(base===fastestMirror) continue;
    contenders.push(withTimeout(pipedPagePromise(base, q, page, limit, localAbort)));
  }
  // Scrape también compite (da ids inmediatos)
  contenders.push(withTimeout(scrapePage(q, page, limit, localAbort, true)));

  try{
    const res = await Promise.any(contenders);
    // Cancelo el resto
    localAbort.abort();
    if(res.mode==="piped" && res.used) fastestMirror = res.used; // aprendemos mirror rápido
    return res;
  }catch(err){
    localAbort.abort();
    throw err;
  }
}

/* ========= API pública de búsqueda ========= */
async function startSearch(q){
  // cancelar búsqueda anterior
  if(searchAbort) try{ searchAbort.abort(); }catch{}
  searchAbort = new AbortController();

  paging = { query:q, page:0, loading:false, hasMore:true, mode:"piped" };
  items = [];
  $("#results").innerHTML = "";
  setCount("Buscando…");

  // ¿Cache?
  const ck = cacheKey(q, 1);
  const cached = storageGet(ck);
  if(cached){
    appendResults(dedupeById(cached.items));
    items = items.concat(cached.items);
    paging.page = 1; paging.hasMore = cached.hasMore; paging.mode = cached.mode || "piped";
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
    // Pre-carga silenciosa de página 2
    preloadNextPage();
    return;
  }

  // Carrera para la 1ª página con FIRST_PAGE_SIZE -> pinta rápido
  try{
    const res = await raceSearchPage(q, 1, FIRST_PAGE_SIZE, searchAbort);
    const clean = dedupeById(res.items);
    appendResults(clean);
    items = items.concat(clean);
    paging.page = 1; paging.hasMore = res.hasMore; paging.mode = res.mode;
    storageSet(ck, {items:clean, hasMore:res.hasMore, mode:res.mode});
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
    // Pre-carga silenciosa de página 2
    preloadNextPage();
  }catch(e){
    setCount("❌ Error al buscar. Intenta de nuevo.");
  }
}

function dedupeById(arr){
  const seen = new Set(); const out = [];
  for(const it of arr){ if(!it?.id || seen.has(it.id)) continue; seen.add(it.id); out.push(it); }
  return out;
}

async function preloadNextPage(){
  const q = paging.query; const next = 2;
  const ck2 = cacheKey(q, next);
  if(storageGet(ck2)) return;
  try{
    const res = await raceSearchPage(q, next, PAGE_SIZE, searchAbort);
    const clean = dedupeById(res.items);
    storageSet(ck2, {items:clean, hasMore:res.hasMore, mode:res.mode});
  }catch{}
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore) return;
  paging.loading = true;
  const next = paging.page + 1;

  const ck = cacheKey(paging.query, next);
  const cached = storageGet(ck);
  if(cached){
    const clean = dedupeById(cached.items);
    appendResults(clean);
    items = items.concat(clean);
    paging.page = next; paging.hasMore = cached.hasMore; paging.loading = false;
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
    // Pre-carga siguiente
    preloadPage(next+1);
    return;
  }

  try{
    // para páginas siguientes: intentamos mirror más rápido primero; si falla, carrera
    let res;
    if(fastestMirror){
      try{
        res = await withTimeout(pipedPagePromise(fastestMirror, paging.query, next, PAGE_SIZE, searchAbort));
      }catch{
        res = await raceSearchPage(paging.query, next, PAGE_SIZE, searchAbort);
      }
    }else{
      res = await raceSearchPage(paging.query, next, PAGE_SIZE, searchAbort);
    }
    const clean = dedupeById(res.items);
    storageSet(ck, {items:clean, hasMore:res.hasMore, mode:res.mode});
    appendResults(clean);
    items = items.concat(clean);
    paging.page = next; paging.hasMore = res.hasMore; paging.mode = res.mode;
    paging.loading = false;
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • baja para más':''}`);
    preloadPage(next+1);
  }catch(e){
    paging.loading=false; paging.hasMore=false;
    setCount("❌ Error al cargar más.");
  }
}
async function preloadPage(p){
  const q=paging.query; const ck = cacheKey(q,p);
  if(storageGet(ck)) return;
  try{
    const res = await raceSearchPage(q, p, PAGE_SIZE, searchAbort);
    const clean = dedupeById(res.items);
    storageSet(ck, {items:clean, hasMore:res.hasMore, mode:res.mode});
  }catch{}
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

    // Tap en card -> reproducir pero quedarse en Búsqueda
    card.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    });

    // Play/Pause overlay
    card.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{
        const pos = items.findIndex(x=>x.id===it.id);
        playFromSearch(pos>=0?pos:0, true);
      }
      refreshIndicators();
    };

    // Menú 3 puntos (track)
    card.querySelector(".more").onclick = (e)=>{
      e.stopPropagation(); selectedTrack = it;
      openActionSheet({
        title: "Opciones",
        actions: [
          { id:"fav", label: isFav(it.id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
          { id:"pl",  label:"Agregar a playlist" },
          { id:"cancel", label:"Cancelar", ghost:true }
        ],
        onAction: (id)=>{
          if(id==="fav"){ toggleFav(it); }
          if(id==="pl"){ openPlaylistSheet(it); }
        }
      });
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
  saveFavs(); renderFavs(); refreshIndicators();
}

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
      <div class="actions">
        <button class="icon-btn more" title="Opciones">
          <svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
        </button>
      </div>`;

    // Tap -> reproducir en favoritos (sin navegar)
    li.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      playFromFav(it, true);
    });

    // Play/Pause overlay
    li.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{ playFromFav(it, true); }
      refreshIndicators();
    };

    // Menú 3 puntos (favorito)
    li.querySelector(".more").onclick = (e)=>{
      e.stopPropagation(); selectedTrack = it;
      openActionSheet({
        title: it.title,
        actions: [
          { id:"remove", label:"Quitar de Favoritos" },
          { id:"pl",     label:"Agregar a playlist" },
          { id:"cancel", label:"Cancelar", ghost:true }
        ],
        onAction:(id)=>{
          if(id==="remove"){ toggleFav(it); }
          if(id==="pl"){ openPlaylistSheet(it); }
        }
      });
    };

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
      <button class="icon-btn more" title="Opciones">
        <svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
      </button>`;

    // Tocar el card abre la playlist en el Reproductor (como "Abrir")
    li.addEventListener("click", (e)=>{
      if(e.target.closest(".more")) return;
      showPlaylistInPlayer(pl.id);
      switchView("view-player");
    });

    li.querySelector(".more").onclick = ()=>{
      selectedPlaylistId = pl.id;
      openActionSheet({
        title: pl.name,
        actions:[
          { id:"open",   label:"Abrir" },
          { id:"play",   label:"Reproducir" },
          { id:"rename", label:"Renombrar" },
          { id:"delete", label:"Eliminar" , danger:true },
          { id:"cancel", label:"Cancelar", ghost:true }
        ],
        onAction:(id)=>{
          const P = playlists.find(p=>p.id===pl.id);
          if(!P) return;
          if(id==="open"){ showPlaylistInPlayer(P.id); switchView("view-player"); }
          if(id==="play"){ playPlaylist(P.id); switchView("view-player"); }
          if(id==="rename"){
            const name = prompt("Nuevo nombre:", P.name)?.trim();
            if(name){ P.name=name; savePlaylists(); renderPlaylists(); }
          }
          if(id==="delete"){
            if(confirm(`Eliminar playlist "${P.name}"?`)){
              playlists = playlists.filter(x=>x.id!==P.id); savePlaylists(); renderPlaylists();
            }
          }
        }
      });
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

/* ========= Sheets genéricos ========= */
function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet");
  sheet.innerHTML = `
    <div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`
        <button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">
          ${a.label}
        </button>
      `).join("")}
    </div>`;
  sheet.classList.add("show");
  sheet.onclick = (e)=>{
    if(e.target===sheet){ sheet.classList.remove("show"); return; }
    const btn = e.target.closest(".sheet-item"); if(!btn) return;
    const id = btn.dataset.id;
    sheet.classList.remove("show");
    if(id) onAction(id);
  };
}

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
    $("#plNewName").value=""; sheet.classList.remove("show");
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
  updateMiniNow(); // sincronizar mini reproductor
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
  $("#miniPlay").classList.toggle("playing", playing);
}
$("#npPlay").onclick = togglePlay;

/* Mini reproductor: sincronización */
function updateMiniNow(){
  const has = !!currentTrack;
  const wrap = $("#miniNow");
  if(!wrap) return;
  wrap.classList.toggle("hide", !has);
  if(!has) return;
  $("#miniThumb").src = currentTrack.thumb;
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  $("#miniPlay").classList.toggle("playing", playing);
}
$("#miniPlay").onclick = togglePlay;

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
    $("#miniPlay").classList.toggle("playing", playing);
    refreshIndicators();
  }, 250);
}
function stopTimer(){ clearInterval(timer); timer=null; }

/* ========= Queue en Player ========= */
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
        <button class="card-play" title="Play">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
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

/* ========= Indicadores ========= */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";

  $$("#results .card").forEach(c=>{
    const isCur = c.dataset.trackId===curId;
    c.classList.toggle("is-playing", playing && isCur);
    const btn = c.querySelector(".card-play");
    if(btn) btn.classList.toggle("playing", playing && isCur);
  });

  $$("#favList .fav-item").forEach(li=>{
    const isCur = li.dataset.trackId===curId;
    li.classList.toggle("is-playing", playing && isCur);
    const btn = li.querySelector(".card-play");
    if(btn) btn.classList.toggle("playing", playing && isCur);
  });

  $$("#queueList .queue-item").forEach(li=>{
    li.classList.toggle("is-playing", playing && li.dataset.trackId===curId);
  });
}

/* ========= Visibilidad ========= */
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
        $("#miniPlay").classList.toggle("playing", playing);
        wasPlaying = playing;
        if(st===YT.PlayerState.ENDED){ next(); }
        refreshIndicators();
      }
    }
  });
};

/* ========= Infinite scroll (usa el motor nuevo) ========= */
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
