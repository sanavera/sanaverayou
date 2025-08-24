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

/* ========= Búsqueda ultra rápida con API oficial ========= */
// ¡IMPORTANTE! Reemplazá 'TU_API_KEY' con tu clave de API de YouTube
const YOUTUBE_API_KEY = "AIzaSyCLKvqx3vv4SYBrci4ewe3TbeWJ-wL2BsY";
const BATCH_SIZE = 20;

let paging = { query:"", pageToken:"", loading:false, hasMore:true };
let searchAbort = null;

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

/* ========= Motor de búsqueda (con API) ========= */
async function youtubeSearch(query, pageToken = '', limit = BATCH_SIZE) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('key', YOUTUBE_API_KEY);
  url.searchParams.append('q', query);
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('type', 'video');
  url.searchParams.append('videoCategoryId', '10'); // Categoría Música
  url.searchParams.append('maxResults', limit);
  if (pageToken) {
    url.searchParams.append('pageToken', pageToken);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if(response.status === 403){
        console.error('API Error: Posiblemente la clave de API sea incorrecta o no esté habilitada.');
      }
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();

    const resultItems = data.items.map(item => ({
      id: item.id.videoId,
      title: cleanTitle(item.snippet.title),
      author: item.snippet.channelTitle,
      thumb: item.snippet.thumbnails.high.url
    }));

    return {
      items: resultItems,
      nextPageToken: data.nextPageToken,
      hasMore: !!data.nextPageToken
    };

  } catch (error) {
    console.error('YouTube API search failed:', error);
    return { items: [], hasMore: false };
  }
}

/* ========= API pública de búsqueda ========= */
async function startSearch(query) {
  // Cancelar anterior
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  // Reset estado
  paging = { query, pageToken: "", loading: false, hasMore: true };
  items = [];
  $("#results").innerHTML = "";
  setCount("🔍 Buscando...");

  try {
    const result = await youtubeSearch(query, '', 20); // Más resultados de golpe
    if (searchAbort.signal.aborted) return;

    if (result.items.length === 0) {
      setCount("❌ No se encontraron resultados");
      return;
    }

    // Mostrar resultados
    const deduped = dedupeById(result.items);
    appendResults(deduped);
    items = deduped;

    paging.pageToken = result.nextPageToken;
    paging.hasMore = result.hasMore;

    setCount(`🎵 ${items.length} canciones${paging.hasMore ? ' • desliza para más' : ''}`);

  } catch (error) {
    console.error('Search failed:', error);
    setCount("❌ Error en la búsqueda. Intenta de nuevo.");
  }
}

function dedupeById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function loadNextPage() {
  if (paging.loading || !paging.hasMore || !paging.query) return;

  paging.loading = true;

  try {
    const result = await youtubeSearch(paging.query, paging.pageToken, BATCH_SIZE);

    if (result.items.length === 0) {
      paging.hasMore = false;
      paging.loading = false;
      return;
    }

    const newItems = dedupeById(result.items);
    appendResults(newItems);
    items = items.concat(newItems);

    paging.pageToken = result.nextPageToken;
    paging.hasMore = result.hasMore;
    paging.loading = false;

    setCount(`🎵 ${items.length} canciones${paging.hasMore ? ' • desliza para más' : ''}`);

  } catch (error) {
    paging.loading = false;
    paging.hasMore = false;
    setCount(`🎵 ${items.length} canciones • Error cargando más`);
  }
}

/* ========= Render resultados ========= */
function appendResults(chunk){
  const root = $("#results");
  for(const it of chunk){
    // CAMBIO: Ahora usamos 'result-item' en vez de 'card'
    const item = document.createElement("article");
    item.className = "result-item";
    item.dataset.trackId = it.id;
    item.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" loading="lazy" decoding="async" src="${it.thumb}" alt="">
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

    // CAMBIO: Tap en item, no en card
    item.addEventListener("click", e=>{
      if(e.target.closest(".more")) return;
      const pos = items.findIndex(x=>x.id===it.id);
      playFromSearch(pos>=0?pos:0, true);
    });

    // CAMBIO: El botón de play del overlay ya no existe en la lista
    // En su lugar, el tap en el item lo reproduce
    
    // Menú 3 puntos (track)
    item.querySelector(".more").onclick = (e)=>{
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

    // Animación de entrada
    item.style.opacity='0'; 
    item.style.transform='translateY(5px)';
    root.appendChild(item);
    requestAnimationFrame(()=>{
      item.style.transition='all .2s ease-out'; 
      item.style.opacity='1'; 
      item.style.transform='translateY(0)';
    });
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

/* ========= Sheets ========= */
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

/* ========= Reproducir ========= */
function updateHero(track){
  const t = track || currentTrack;
  $("#favHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#favNowTitle").textContent = t ? t.title : "—";
  $("#npHero").style.backgroundImage = t ? `url(${t.thumb})` : "none";
  $("#npTitle").textContent = t ? t.title : "Elegí una canción";
  $("#npSub").textContent = t ? (t.author||"—") : "—";
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

/* Mini reproductor */
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

/* ========= Cola en Player ========= */
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

  // CAMBIO: Ahora buscamos `.result-item` en lugar de `.card`
  $$("#results .result-item").forEach(c=>{
    const isCur = c.dataset.trackId===curId;
    // CAMBIO: Usamos `is-playing` para el estilo de card
    c.classList.toggle("is-playing", playing && isCur);
    // CAMBIO: El botón de play solo se muestra si el item está seleccionado
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

/* ========= Infinite scroll ========= */
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
