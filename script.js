/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"-MP3")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"-MP3")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"-MP3")
  .replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"")
  .replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, " MP3")
  .replace(/VEVO/gi, " MP3")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*-\s*$/, "")
  .trim();
const dotsSvg = () => `
  <svg class="icon-dots" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
  </svg>`;

/* ========= Estado ========= */
let items = [];
let favs  = [];
let playlists = [];        // {id,name,tracks:[{id,title,author,thumb}]}
let queue = null;
let queueType = null;      // 'search'|'favs'|'playlist'|'curated'
let qIdx = -1;
let currentTrack = null;
let viewingPlaylistId = null;

let ytPlayer = null, YT_READY = false, timer = null;

/* ========= Curados estáticos (NO API) ========= */
/* Reemplazá id: por el ID de YouTube o directamente url: con el link completo */
const CURATED_RAW = [
  { id: "ddN1Hu3Qm5s", title: "Pop enganchado (1h)",   author: "Mix Pop" },
  { id: "1ATkrsFDhpY", title: "Rock enganchado (1h)",  author: "Mix Rock" },
  { id: "8DIGGjaE5gg", title: "Cumbia enganchada",     author: "Mix Cumbia" },
  { id: "SROpyGwrStc", title: "Reggaetón Session",     author: "Mix Urbano" },
  { id: "sRIamUTkafg", title: "Latinos Old School",    author: "Mix Latino" },
  { id: "7CyKlAX5vXE", title: "Electrónica Non-Stop",  author: "Mix EDM" },
  { id: "f5U34t9KMjE", title: "Los Redondos",  author: "Sanavera Sebastian" },
  { id: "MsRzUfV8KXY", title: "Top 40 Rock",  author: "Sanavera Sebastian" },
  // podés seguir sumando…
];
function extractVideoId(input){
  if(!input) return "";
  const s = String(input);
  const m = s.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?![0-9A-Za-z_-])/);
  return m ? m[1] : (s.length===11 ? s : "");
}
function mapCurated(raw){
  return raw
    .map((r,i)=>{
      const id = extractVideoId(r.id || r.url || r);
      if(!id) return null;
      return {
        id,
        title: r.title || `Mix ${i+1}`,
        author: r.author || "",
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    })
    .filter(Boolean);
}
let CURATED_VIDEOS = mapCurated(CURATED_RAW);
let HOME_QUEUE = []; // subconjunto de 6 mostrado actualmente

/* ========= API YouTube ========= */
const YOUTUBE_API_KEYS = [
  "AIzaSyCLKvqx3vv4SYBrci4ewe3TbeWJ-wL2BsY",
  "AIzaSyB9CSgnqFP5xBuYil8zUuZ0nWGQMHBk_44",
  "AIzaSyD_WZVpBaXosHIzpHoS0JJcQFlB03jc9DE",
  "AIzaSyCiryC1WiODR0hisMRDeej5FPsTjF3MTTM",
  "AIzaSyC3-V6pED9HDjEYpgtU9Tcw8YcZem9pVM0"
];
let currentApiKeyIndex = 0;
const getRotatedApiKey = () => {
  const k = YOUTUBE_API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % YOUTUBE_API_KEYS.length;
  return k;
};

const BATCH_SIZE = 20;
let paging = { query:"", pageToken:"", loading:false, hasMore:true };
let searchAbort = null;

/* ========= Nav ========= */
function switchView(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));

  if(id==="view-search") updateHomeGridVisibility();
}
$("#bottomNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-btn"); if(!btn) return;
  switchView(btn.dataset.view);
});

/* ========= Búsqueda (overlay flotante) ========= */
const searchOverlay = $("#searchOverlay");
const overlayInput  = $("#overlaySearchInput");

function openSearch(){
  searchOverlay.classList.add("show");
  overlayInput.value = "";
  setTimeout(()=> overlayInput.focus(), 0);
}
function closeSearch(){ searchOverlay.classList.remove("show"); }

$("#searchFab").onclick = openSearch;
searchOverlay.addEventListener("click", e=>{ if(e.target===searchOverlay) closeSearch(); });
overlayInput.addEventListener("keydown", async e=>{
  if(e.key!=="Enter") return;
  const q = overlayInput.value.trim(); if(!q) return;
  closeSearch();
  await startSearch(q);
  switchView("view-search");
});

/* ========= Motor de búsqueda ========= */
async function youtubeSearch(query, pageToken = '', limit = BATCH_SIZE, retryCount = 0){
  const MAX_RETRIES = YOUTUBE_API_KEYS.length;
  if(retryCount >= MAX_RETRIES) throw new Error('Todas las API keys han fallado.');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  const apiKey = getRotatedApiKey();
  url.searchParams.append('key', apiKey);
  url.searchParams.append('q', query);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('type', 'video');
  url.searchParams.append('videoCategoryId', '10');
  url.searchParams.append('maxResults', limit);
  if(pageToken) url.searchParams.append('pageToken', pageToken);

  try{
    const response = await fetch(url);
    if(!response.ok){
      if(response.status===403){
        console.warn(`API key ${apiKey} 403 → rota`);
        return youtubeSearch(query, pageToken, limit, retryCount+1);
      }
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    const resultItems = data.items.map(item=>({
      id: item.id.videoId,
      title: cleanTitle(item.snippet.title),
      author: cleanAuthor(item.snippet.channelTitle),
      thumb: item.snippet.thumbnails.high.url
    }));
    return { items: resultItems, nextPageToken: data.nextPageToken, hasMore: !!data.nextPageToken };
  }catch(e){
    console.error('YouTube API search failed:', e);
    return { items: [], hasMore:false };
  }
}

/* ========= Buscar ========= */
async function startSearch(query){
  if(searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  paging = { query, pageToken:"", loading:false, hasMore:true };
  items = [];
  $("#results").innerHTML = "";

  updateHomeGridVisibility(); // ocultar grilla cuando empieza una búsqueda

  try{
    const result = await youtubeSearch(query, '', 20);
    if(searchAbort.signal.aborted) return;
    if(result.items.length===0){ return; }

    const deduped = dedupeById(result.items);
    appendResults(deduped);
    items = deduped;

    paging.pageToken = result.nextPageToken;
    paging.hasMore   = result.hasMore;
  }catch(e){
    console.error('Search failed:', e);
  }
}

function dedupeById(arr){
  const seen = new Set();
  return arr.filter(it=>{ if(!it?.id || seen.has(it.id)) return false; seen.add(it.id); return true; });
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore || !paging.query) return;
  paging.loading = true;
  try{
    const result = await youtubeSearch(paging.query, paging.pageToken, BATCH_SIZE);
    if(result.items.length===0){ paging.hasMore=false; paging.loading=false; return; }
    const newItems = dedupeById(result.items);
    appendResults(newItems);
    items = items.concat(newItems);
    paging.pageToken = result.nextPageToken;
    paging.hasMore   = result.hasMore;
    paging.loading   = false;
  }catch(e){
    paging.loading=false; paging.hasMore=false;
  }
}

/* ========= Render resultados ========= */
function appendResults(chunk){
  const root = $("#results");
  for(const it of chunk){
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;
    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;

    item.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    });
    item.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    };

    root.appendChild(item);
  }
  refreshIndicators();
}

/* ========= Grilla estática (Inicio) ========= */
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function renderHomeGrid(){
  const grid = $("#homeGrid"); if(!grid) return;
  grid.innerHTML = "";
  const source = shuffle(CURATED_VIDEOS); // sin .slice
  HOME_QUEUE = source;

  source.forEach((it, i)=>{
    const card = document.createElement("article");
    card.className = "home-card";
    card.innerHTML = `
      <img loading="lazy" decoding="async" src="${it.thumb}" alt="">
      <div class="home-meta">
        <p class="home-title-text">${it.title}</p>
        <p class="home-subtitle">${it.author||"Mix"}</p>
      </div>`;
    card.onclick = ()=>{
      // reproducir y armar cola con los 6 de HOME_QUEUE
      setQueue(HOME_QUEUE, "curated", i);
      playCurrent(true);
    };
    grid.appendChild(card);
  });
}
function updateHomeGridVisibility(){
  const home = $("#homeSection");
  if(!home) return;
  const shouldShow = (!paging.query && items.length===0);
  home.classList.toggle("hide", !shouldShow);
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
        <button class="card-play" title="Play/Pause" aria-label="Play/Pause">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${it.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(it.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    li.addEventListener("click", e=>{
      if(e.target.closest(".more") || e.target.closest(".card-play")) return;
      playFromFav(it, true);
    });
    li.querySelector(".card-play").onclick = (e)=>{
      e.stopPropagation();
      if(currentTrack?.id === it.id){ togglePlay(); }
      else{ playFromFav(it, true); }
      refreshIndicators();
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
    const li = document.createElement("li"); li.className="pl-item"; li.dataset.plId = pl.id;
    const cover = pl.tracks[0]?.thumb || "https://picsum.photos/seed/pl/200";
    li.innerHTML = `
      <div class="pl-meta">
        <img class="pl-thumb" src="${cover}" alt="">
        <div>
          <div class="title-text">${pl.name}</div>
          <div class="subtitle">${pl.tracks.length} temas</div>
        </div>
      </div>
      <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>`;
    li.addEventListener("click", (e)=>{
      if(e.target.closest(".more")) return;
      showPlaylistInPlayer(pl.id);
      switchView("view-player");
    });
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

/* ========= Acción sheet ========= */
function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet");
  sheet.innerHTML = `
    <div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`
        <button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">
          ${a.label}
        </button>`).join("")}
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

/* ========= YouTube player / reproducción ========= */
function updateHero(track){
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  const plName = viewingPlaylistId ? (playlists.find(p=>p.id===viewingPlaylistId)?.name || "") : "";
  $("#npSub").textContent = t ? `${cleanAuthor(t.author)}${plName?` • ${plName}`:""}` : (plName || "—");
  updateMiniNow();
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
  setQueue(pl.tracks, "playlist", i); viewingPlaylistId = plId; playCurrent(autoplay);
}
function playPlaylist(id){
  const pl = playlists.find(p=>p.id===id); if(!pl||!pl.tracks.length) return;
  viewingPlaylistId = id;
  playFromPlaylist(pl.id, 0, true);
}
function togglePlay(){
  if(!YT_READY) return;
  const st = ytPlayer.getPlayerState();
  (st===YT.PlayerState.PLAYING)? ytPlayer.pauseVideo() : ytPlayer.playVideo();
  const playing = !(st===YT.PlayerState.PLAYING);
  $("#npPlay").classList.toggle("playing", playing);
  $("#miniPlay").classList.toggle("playing", playing);
}
$("#npPlay").onclick = togglePlay;

/* Eliminar tema de playlist */
function removeFromPlaylist(plId, trackId){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  const idx = pl.tracks.findIndex(t=>t.id===trackId); if(idx<0) return;
  const removingIsCurrent = (queueType==="playlist" && viewingPlaylistId===plId && queue && queue[qIdx]?.id===trackId);

  pl.tracks.splice(idx,1);
  savePlaylists();

  if(queueType==="playlist" && viewingPlaylistId===plId){
    queue = pl.tracks;
    if(idx < qIdx) qIdx--;
    if(removingIsCurrent){
      if(qIdx >= queue.length) qIdx = queue.length-1;
      if(qIdx >= 0) playCurrent(true); else { currentTrack=null; updateHero(null); }
    }
  }
  renderPlaylists();
  showPlaylistInPlayer(plId);
}

/* Mini reproductor */
function updateMiniNow(){
  const has = !!currentTrack;
  const wrap = $("#miniNow"); if(!wrap) return;
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

/* ========= Cola (Player) ========= */
function showPlaylistInPlayer(plId){
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  viewingPlaylistId = plId;

  const panel = $("#queuePanel"); panel.classList.remove("hide");
  $("#queueTitle").textContent = pl.name;

  const ul = $("#queueList"); ul.innerHTML="";
  pl.tracks.forEach((t,i)=>{
    const li = document.createElement("li"); li.className="queue-item"; li.dataset.trackId=t.id;
    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <button class="card-play" title="Play" aria-label="Play">
          <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <svg class="i-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
      </div>
      <div class="meta">
        <div class="title-line">
          <span class="title-text">${t.title}</span>
          <span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="subtitle">${cleanAuthor(t.author)||""}</div>
      </div>
      <div class="actions">
        <button class="icon-btn more" title="Opciones" aria-label="Opciones">${dotsSvg()}</button>
      </div>`;
    li.onclick = (e)=>{ if(e.target.closest(".more") || e.target.closest(".card-play")) return; playFromPlaylist(pl.id, i, true); };
    li.querySelector(".card-play").onclick = (e)=>{ e.stopPropagation(); playFromPlaylist(pl.id, i, true); };
    ul.appendChild(li);
  });
  refreshIndicators();
}
function hideQueuePanel(){ $("#queuePanel").classList.add("hide"); $("#queueList").innerHTML=""; viewingPlaylistId=null; }

/* ========= Delegación global de los 3 puntitos ========= */
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".icon-btn.more");
  if(!btn) return;

  const resultItem = btn.closest(".result-item");
  const favItem    = btn.closest(".fav-item");
  const queueItem  = btn.closest(".queue-item");
  const plItem     = btn.closest(".pl-item");

  if(resultItem){
    const id = resultItem.dataset.trackId;
    const it = items.find(x=>x.id===id);
    if(!it) return;
    openActionSheet({
      title: it.title,
      actions: [
        { id:"fav", label: isFav(id) ? "Quitar de Favoritos" : "Agregar a Favoritos" },
        { id:"pl",  label:"Agregar a playlist" },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="fav") toggleFav(it);
        if(act==="pl")  openPlaylistSheet(it);
      }
    });
    return;
  }

  if(favItem){
    const id = favItem.dataset.trackId;
    const it = favs.find(x=>x.id===id);
    if(!it) return;
    openActionSheet({
      title: it.title,
      actions: [
        { id:"removeFav", label:"Quitar de Favoritos", danger:true },
        { id:"pl", label:"Agregar a playlist" },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="removeFav") toggleFav(it);
        if(act==="pl") openPlaylistSheet(it);
      }
    });
    return;
  }

  if(queueItem && viewingPlaylistId){
    const trackId = queueItem.dataset.trackId;
    openActionSheet({
      title: "Opciones",
      actions: [
        { id:"removeFromPl", label:"Eliminar de esta playlist", danger:true },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction: (act)=>{
        if(act==="removeFromPl") removeFromPlaylist(viewingPlaylistId, trackId);
      }
    });
    return;
  }

  if(plItem){
    const plId = plItem.dataset.plId;
    const P = playlists.find(p=>p.id===plId);
    if(!P) return;
    openActionSheet({
      title: P.name,
      actions:[
        { id:"open",   label:"Abrir" },
        { id:"play",   label:"Reproducir" },
        { id:"rename", label:"Renombrar" },
        { id:"delete", label:"Eliminar", danger:true },
        { id:"cancel", label:"Cancelar", ghost:true }
      ],
      onAction:(id)=>{
        if(id==="open"){ showPlaylistInPlayer(P.id); switchView("view-player"); }
        if(id==="play"){ playPlaylist(P.id); switchView("view-player"); }
        if(id==="rename"){
          const name = prompt("Nuevo nombre:", P.name)?.trim();
          if(name){ P.name=name; savePlaylists(); renderPlaylists(); }
        }
        if(id==="delete"){
          if(confirm(`Eliminar playlist "${P.name}"?`)){
            playlists = playlists.filter(x=>x.id!==P.id); savePlaylists(); renderPlaylists();
            if(viewingPlaylistId===P.id){ hideQueuePanel(); viewingPlaylistId=null; }
          }
        }
      }
    });
  }
});

/* ========= Indicadores ========= */
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId = currentTrack?.id || "";

  $$("#results .result-item").forEach(c=> c.classList.toggle("is-playing", playing && c.dataset.trackId===curId));
  $$("#favList .fav-item").forEach(li=> li.classList.toggle("is-playing", playing && li.dataset.trackId===curId));
  $$("#queueList .queue-item").forEach(li=> li.classList.toggle("is-playing", playing && li.dataset.trackId===curId));
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
        if(st===YT.PlayerState.ENDED){ next(); }
        refreshIndicators();
      }
    }
  });
};

/* ========= Infinite scroll ========= */
const io = new IntersectionObserver((entries)=>{
  for(const en of entries){ if(en.isIntersecting){ loadNextPage(); } }
},{ root:null, rootMargin:"800px 0px", threshold:0 });
io.observe($("#sentinel"));

/* ========= Init ========= */
function bootHome(){
  CURATED_VIDEOS = mapCurated(CURATED_RAW); // por si editaste IDs/URLs
  renderHomeGrid();
  updateHomeGridVisibility();
}
loadFavs();
loadPlaylists();
renderFavs();
renderPlaylists();
loadYTApi();
bootHome();

document.title = "SanaveraYou";
