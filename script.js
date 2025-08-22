/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s=Math.max(0,Math.floor(s||0)); const m=Math.floor(s/60), ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const cleanTitle = t => (t||"")
  .replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"")
  .replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"")
  .replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"")
  .replace(/\s{2,}/g," ").trim();

const HEART_SVG = `<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
const DotsSVG  = `<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const PlaySVG  = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;

/* ===== State ===== */
let items = [];        // search results (paged)
let favs  = [];
let playlists = [];    // {id,name,cover,items:[]}

let queue = [];
let qIndex = -1;
let current = null;

const LS_FAVS = "sanyou_favs_v1";
const LS_PLS  = "sanyou_pls_v1";

/* YouTube */
let ytPlayer=null, YT_READY=false, timer=null, wasPlaying=false;

/* Search paging */
const PAGE_SIZE = 10;
const PIPED_MIRRORS = ["https://piped.video","https://pipedapi.kavin.rocks","https://piped.privacy.com.de"];
let paging = { query:"", page:0, hasMore:false, loading:false, mode:"piped" };
let searchAbort = null;
const pageCache = new Map(), scrapeCache = new Map();

const cacheKey=(q,p)=>`sanyou:q=${q}:p=${p}`;
const cacheGet=(q,p)=> pageCache.get(cacheKey(q,p)) || (()=>{
  try{ const raw=sessionStorage.getItem(cacheKey(q,p)); if(!raw) return null;
       const o=JSON.parse(raw); if(Date.now()-o.ts>10*60*1000) return null; return o.data; }catch{return null}
})();
const cacheSet=(q,p,data)=>{ pageCache.set(cacheKey(q,p),data); try{ sessionStorage.setItem(cacheKey(q,p), JSON.stringify({ts:Date.now(),data})) }catch{} };

/* ===== Views ===== */
function switchView(id){
  $$('.view').forEach(v=>v.classList.toggle('active', v.id===id));
  $$('.tab').forEach(t=>t.classList.toggle('active', t.id.replace('tab','view-')===id));
  window.scrollTo({top:0, behavior:'instant'});
}
$('#tabSearch').onclick   = ()=>switchView('view-search');
$('#tabFavorites').onclick= ()=>{ renderFavs(); switchView('view-favorites'); };
$('#tabPlaylists').onclick= ()=>{ renderPlaylists(); switchView('view-playlists'); };
$('#tabPlayer').onclick   = ()=>{ renderQueue(); switchView('view-player'); };

/* ===== Load/save ===== */
function loadFavs(){ try{ favs = JSON.parse(localStorage.getItem(LS_FAVS)||'[]'); }catch{ favs=[]; } }
function saveFavs(){ localStorage.setItem(LS_FAVS, JSON.stringify(favs)); }
function loadPlaylists(){ try{ playlists = JSON.parse(localStorage.getItem(LS_PLS)||'[]'); }catch{ playlists=[]; } }
function savePlaylists(){ localStorage.setItem(LS_PLS, JSON.stringify(playlists)); }

/* ===== Search ===== */
function setCount(t){ $('#resultsCount').textContent = t||''; }

async function startSearch(q){
  if(searchAbort) try{ searchAbort.abort(); }catch{}
  searchAbort = new AbortController();

  paging = {query:q, page:0, hasMore:true, loading:false, mode:"piped"};
  items = []; $('#results').innerHTML=''; setCount('Buscando…');
  await loadNextPage();
}

async function loadNextPage(){
  if(paging.loading || !paging.hasMore) return;
  paging.loading = true;
  const next = paging.page+1; let chunk=[], hasMore=false;

  const cached = cacheGet(paging.query,next);
  if(cached){
    chunk=cached; hasMore=chunk.length>=PAGE_SIZE;
    appendResults(chunk); paging.page=next; paging.hasMore=hasMore; paging.loading=false;
    setCount(`🎵 ${items.length} canciones${paging.hasMore?' • Scroll para más':''}`); return;
  }

  try{
    const r = await fetchPiped(paging.query,next,searchAbort.signal);
    chunk=r.items; hasMore=r.hasMore; paging.mode="piped";
  }catch{
    const r2 = await fetchScrape(paging.query,next,PAGE_SIZE,searchAbort.signal);
    chunk=r2.items; hasMore=r2.hasMore; paging.mode="scrape";
  }

  cacheSet(paging.query,next,chunk);
  appendResults(chunk); paging.page=next; paging.hasMore=hasMore; paging.loading=false;
  setCount(`🎵 ${items.length} canciones${paging.hasMore?' • Scroll para más':''}`);
}

async function fetchPiped(q,page,signal){
  let last=null;
  for(const base of PIPED_MIRRORS){
    const url = `${base}/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&region=AR&filter=videos`;
    try{
      const r=await fetch(url,{signal,headers:{Accept:'application/json'}}); if(!r.ok){last=new Error(`HTTP ${r.status}`); continue;}
      const data=await r.json();
      const arr = Array.isArray(data) ? data : (Array.isArray(data.items)?data.items:[]);
      const out = arr.slice(0,PAGE_SIZE).map(it=>{
        const id=it.id || it.videoId || (it.url && new URL(it.url,'https://d').searchParams.get('v'));
        if(!id) return null;
        const thumb= it.thumbnail || (it.thumbnails && it.thumbnails[0]?.url) || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        const author=it.uploader || it.uploaderName || it.author || '';
        const title=cleanTitle(it.title || it.name || `Video ${id}`);
        return {id,title,thumb,author};
      }).filter(Boolean);
      return {items:out, hasMore:out.length>=PAGE_SIZE};
    }catch(e){ last=e; continue; }
  }
  throw last || new Error('Piped fail');
}
async function fetchScrape(q,page,pageSize,signal){
  if(!scrapeCache.has(q)){
    const html = await fetch(`https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {signal,headers:{Accept:"text/plain"}}).then(r=>r.text());
    const ids = uniq([...html.matchAll(/watch\?v=([\w-]{11})/g)].map(m=>m[1]));
    scrapeCache.set(q, ids);
  }
  const ids=scrapeCache.get(q); const start=(page-1)*pageSize; const slice=ids.slice(start,start+pageSize);
  const metas = await mapLimit(slice,6, async (id)=>{
    try{
      const meta=await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      return { id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"" };
    }catch{ return { id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"" }; }
  });
  return {items:metas, hasMore:start+pageSize<ids.length};
}
async function mapLimit(arr,limit,worker){
  const out=new Array(arr.length); let i=0; const pool=new Set();
  async function fill(){ while(i<arr.length && pool.size<limit){ const idx=i++; const p=Promise.resolve(worker(arr[idx])).then(res=>out[idx]=res).finally(()=>pool.delete(p)); pool.add(p); }
    if(pool.size===0) return; await Promise.race(pool); return fill(); }
  await fill(); await Promise.all([...pool]); return out;
}

/* ===== Render results ===== */
function appendResults(chunk){
  const root=$('#results');
  for(const it of chunk){
    items.push(it);
    const li=document.createElement('article'); li.className='card'; li.dataset.id=it.id;
    li.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" src="${it.thumb}" alt="">
        <div class="play-overlay"><button class="btn-playimg" title="Play">${PlaySVG}</button></div>
      </div>
      <div class="meta">
        <div class="title">${it.title}</div>
        <div class="sub">${it.author||''}</div>
        <div class="eq" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
      <div class="actions">
        <button class="icon-btn heart ${isFav(it.id)?'active':''}" title="Favorito">${HEART_SVG}</button>
        <button class="icon-btn menu-btn" title="Más">${DotsSVG}</button>
      </div>`;
    li.querySelector('.btn-playimg').onclick=(e)=>{e.stopPropagation(); playFromList(items, items.findIndex(x=>x.id===it.id), true);};
    li.querySelector('.heart').onclick=(e)=>{e.stopPropagation(); toggleFav(it); li.querySelector('.heart').classList.toggle('active', isFav(it.id));};
    li.querySelector('.menu-btn').onclick=(e)=>{e.stopPropagation(); openTrackMenu(it);};
    root.appendChild(li);
  }
  refreshIndicators();
}

/* ===== Favorites ===== */
function isFav(id){return favs.some(f=>f.id===id);}
function toggleFav(t){ if(isFav(t.id)) favs=favs.filter(f=>f.id!==t.id); else favs.unshift(t); saveFavs(); renderFavs(); }
function renderFavs(){
  const ul=$('#favList'); ul.innerHTML='';
  favs.forEach(t=>{
    const li=document.createElement('li'); li.className='row'; li.dataset.id=t.id;
    li.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <div class="play-overlay"><button class="btn-playimg">${PlaySVG}</button></div>
      </div>
      <div class="meta">
        <div class="title">${t.title}</div>
        <div class="sub">${t.author||''}</div>
        <div class="eq"><span></span><span></span><span></span></div>
      </div>
      <div class="actions">
        <button class="icon-btn menu-btn" title="Más">${DotsSVG}</button>
      </div>`;
    li.querySelector('.btn-playimg').onclick=(e)=>{e.stopPropagation(); playFromList(favs, favs.findIndex(x=>x.id===t.id), true);};
    li.querySelector('.menu-btn').onclick=(e)=>{e.stopPropagation(); openFavItemMenu(t);};
    ul.appendChild(li);
  });
  refreshIndicators();
}

/* ===== Playlists ===== */
function renderPlaylists(){
  const ul=$('#plList'); ul.innerHTML=''; $('#plEmpty').style.display=playlists.length?'none':'block';
  playlists.forEach(pl=>{
    const li=document.createElement('li'); li.className='pl-item'; li.dataset.id=pl.id;
    li.innerHTML=`
      <img class="cover" src="${pl.cover || 'https://i.imgur.com/0mKXo3T.png'}" alt="">
      <div class="meta" style="min-width:0">
        <div class="title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pl.name}</div>
        <div class="sub">${pl.items.length} temas</div>
      </div>
      <button class="icon-btn menu-btn" title="Opciones">${DotsSVG}</button>`;
    // Click card -> abrir directo
    li.addEventListener('click',(e)=>{ if(e.target.closest('.menu-btn')) return; openPlaylist(pl.id,{play:false}); switchView('view-player'); });
    li.querySelector('.menu-btn').onclick=(e)=>{e.stopPropagation(); openPlaylistMenu(pl);};
    ul.appendChild(li);
  });
}
$('#btnNewPlaylist').onclick=()=>{
  const name=prompt('Nombre de la nueva playlist:','Mi playlist'); if(!name) return;
  const id='pl_'+Math.random().toString(36).slice(2,9);
  playlists.unshift({id,name,cover:'',items:[]}); savePlaylists(); renderPlaylists();
};
function addTrackToPlaylist(track){
  if(!playlists.length){
    const ok=confirm('No hay playlists. ¿Crear una?'); if(!ok) return;
    $('#btnNewPlaylist').click(); if(!playlists.length) return;
  }
  const names=playlists.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
  const idx=parseInt(prompt(`Agregar a playlist:\n${names}\n\nEscribí el número:`),10)-1;
  if(isNaN(idx)||idx<0||idx>=playlists.length) return;
  const pl=playlists[idx]; if(!pl.items.some(x=>x.id===track.id)) pl.items.unshift(track);
  if(!pl.cover) pl.cover=track.thumb; savePlaylists(); renderPlaylists();
}
function openPlaylist(id,{play=false}={}){
  const pl=playlists.find(p=>p.id===id); if(!pl) return;
  queue=pl.items.slice(); qIndex=queue.length?0:-1; current=queue[qIndex]||null; $('#queueTitle').textContent=pl.name;
  renderQueue(); switchView('view-player'); if(play&&current) playFromList(queue,0,true);
}
function renderQueue(){
  const ul=$('#queueList'); ul.innerHTML='';
  queue.forEach((t,i)=>{
    const li=document.createElement('li'); li.className='row'; li.dataset.id=t.id;
    li.innerHTML=`
      <div class="thumb-wrap">
        <img class="thumb" src="${t.thumb}" alt="">
        <div class="play-overlay"><button class="btn-playimg">${PlaySVG}</button></div>
      </div>
      <div class="meta">
        <div class="title">${t.title}</div>
        <div class="sub">${t.author||''}</div>
        <div class="eq"><span></span><span></span><span></span></div>
      </div>
      <div class="actions"><button class="icon-btn menu-btn">${DotsSVG}</button></div>`;
    li.querySelector('.btn-playimg').onclick=(e)=>{e.stopPropagation(); playFromList(queue,i,true);};
    li.querySelector('.menu-btn').onclick=(e)=>{e.stopPropagation(); openTrackMenu(t);};
    ul.appendChild(li);
  });
  refreshIndicators();
}

/* ===== Menús (action sheet) ===== */
const sheet=$('#sheet'), sheetList=$('#sheetList');
$('#sheetCancel').onclick=closeSheet; sheet.querySelector('.sheet-backdrop').onclick=closeSheet;
function openSheetWith(actions){
  sheetList.innerHTML=''; actions.forEach(({label,fn,danger})=>{
    const li=document.createElement('li');
    li.innerHTML=`<button ${danger?'style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35)"':''}>${label}</button>`;
    li.firstChild.onclick=()=>{closeSheet(); setTimeout(fn,10);}; sheetList.appendChild(li);
  });
  sheet.classList.remove('hidden');
}
function closeSheet(){ sheet.classList.add('hidden'); }

function openTrackMenu(t){
  openSheetWith([
    {label: isFav(t.id)?'Quitar de favoritos':'Agregar a favoritos', fn:()=>toggleFav(t)},
    {label:'Agregar a playlist…', fn:()=>addTrackToPlaylist(t)},
    {label:'Abrir en reproductor', fn:()=>{queue=[t]; qIndex=0; current=t; renderQueue(); switchView('view-player'); playFromList(queue,0,true);}}
  ]);
}
function openFavItemMenu(t){
  openSheetWith([
    {label:'Eliminar de favoritos', fn:()=>{favs=favs.filter(x=>x.id!==t.id); saveFavs(); renderFavs();}, danger:true},
    {label:'Agregar a playlist…', fn:()=>addTrackToPlaylist(t)}
  ]);
}
function openPlaylistMenu(pl){
  openSheetWith([
    {label:'Abrir', fn:()=>{openPlaylist(pl.id,{play:false}); switchView('view-player');}},
    {label:'Reproducir', fn:()=>openPlaylist(pl.id,{play:true})},
    {label:'Renombrar', fn:()=>{const n=prompt('Nuevo nombre:',pl.name); if(n){pl.name=n; savePlaylists(); renderPlaylists();}}},
    {label:'Eliminar', fn:()=>{ if(confirm('¿Eliminar playlist?')){playlists=playlists.filter(p=>p.id!==pl.id); savePlaylists(); renderPlaylists();}}, danger:true}
  ]);
}

/* ===== Player ===== */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady=function(){
  ytPlayer=new YT.Player('player',{width:300,height:150,videoId:'',playerVars:{autoplay:0,controls:0,rel:0,playsinline:1},
    events:{onReady:()=>{YT_READY=true}, onStateChange:onYTState}});
};
function onYTState(e){
  const playing=(e.data===YT.PlayerState.PLAYING || e.data===YT.PlayerState.BUFFERING);
  $('#npToggle').classList.toggle('playing', playing); wasPlaying=playing;
  if(e.data===YT.PlayerState.ENDED){ if(qIndex+1<queue.length) playFromList(queue,qIndex+1,true); }
  refreshIndicators();
}
function playFromList(list,index,autoplay=false){
  if(!YT_READY || !list[index]) return;
  queue=list.slice(); qIndex=index; current=queue[qIndex];
  ytPlayer.loadVideoById({videoId:current.id,startSeconds:0,suggestedQuality:'auto'});
  if(!autoplay) ytPlayer.pauseVideo();
  renderQueue(); updateNowPlayingPill(); startTimer();
}
$('#npToggle').onclick=()=>{ if(!YT_READY) return; const st=ytPlayer.getPlayerState(); (st===YT.PlayerState.PLAYING)?ytPlayer.pauseVideo():ytPlayer.playVideo(); };
function startTimer(){ stopTimer(); timer=setInterval(()=>{ if(!YT_READY) return; const c=ytPlayer.getCurrentTime()||0,d=ytPlayer.getDuration()||0; $('#cur').textContent=fmt(c); $('#dur').textContent=fmt(d); $('#seek').value=d?Math.floor((c/d)*1000):0; refreshIndicators(); },250); }
function stopTimer(){ clearInterval(timer); timer=null; }
$('#seek').addEventListener('input', e=>{ if(!YT_READY) return; const d=ytPlayer.getDuration()||0; ytPlayer.seekTo((parseInt(e.target.value,10)/1000)*d,true); });
function refreshIndicators(){
  const playing = YT_READY && (ytPlayer.getPlayerState()===YT.PlayerState.PLAYING || ytPlayer.getPlayerState()===YT.PlayerState.BUFFERING);
  const curId=current?.id||'';
  $$('#results .card').forEach(c=>c.classList.toggle('is-playing', playing && c.dataset.id===curId));
  $$('#favList .row').forEach(c=>c.classList.toggle('is-playing', playing && c.dataset.id===curId));
  $$('#queueList .row').forEach(c=>c.classList.toggle('is-playing', playing && c.dataset.id===curId));
}
function updateNowPlayingPill(){ const has=!!current; $('#nowPlaying').classList.toggle('hidden', !has); if(!has) return; $('#npThumb').src=current.thumb; $('#npTitle').textContent=current.title; }

/* Keep playing on visibility change */
document.addEventListener('visibilitychange', ()=>{
  if(!YT_READY || !current) return;
  if(document.visibilityState==='hidden' && wasPlaying){
    const t=ytPlayer.getCurrentTime()||0; ytPlayer.loadVideoById({videoId:current.id,startSeconds:t,suggestedQuality:'auto'}); ytPlayer.playVideo();
  }
});

/* Infinite scroll */
const sentinel = $('#sentinel');
if('IntersectionObserver' in window){
  const io=new IntersectionObserver((entries)=>{entries.forEach(e=>{ if(e.isIntersecting) loadNextPage(); });}, {root:null, rootMargin:'1200px 0px 0px 0px', threshold:0});
  io.observe(sentinel);
}

/* Search input */
$('#searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ const q=$('#searchInput').value.trim(); if(!q) return; startSearch(q); switchView('view-search'); }});

/* Init */
loadFavs(); loadPlaylists(); renderFavs(); renderPlaylists(); renderQueue();
loadYTApi(); updateNowPlayingPill(); setCount('');
