/* ========= Utils ========= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmtTime = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const uniq = a => [...new Set(a)];
const esc  = s => String(s||'').replace(/"/g,'&quot;');

/* Limpia ruido típico de títulos de videos */
function cleanTitle(t){
  if(!t) return "";
  let s = " " + t + " ";
  // elimina ( [ { … } ] ) si contienen palabras de video
  s = s.replace(/[\[\(\{][^\]\)\}]*?(official|oficial|music\s*video|video\s*clip|videoclip|video|mv|lyric[s]?|lyrics|hd|4k)[^\]\)\}]*?[\]\)\}]/gi, " ");
  // corta sufijos tipo " - Official Video..."
  s = s.replace(/\s[-–|•]\s*(official|oficial|music\s*video|video\s*clip|videoclip|video|mv|lyric[s]?|lyrics|hd|4k)\b.*$/gi," ");
  // tags sueltos
  s = s.replace(/\b(official\s*video|video\s*oficial|music\s*video|videoclip|mv|lyrics?)\b/gi, " ");
  // espacios sobrantes y separadores residuales
  s = s.replace(/\s{2,}/g," ").replace(/\s[-–|•]\s*$/," ").trim();
  return s;
}

/* ========= Estado ========= */
let items=[], favs=[];
let ctx={ source:'search', index:-1 }; // 'search' | 'favorites'
let ytPlayer=null, YT_READY=false;
let timeTimer=null, wasPlaying=false, lastTime=0, visReloadCooldown=false;
let repeatMode='off';   // 'off' | 'all' | 'one'
let shuffleOn=false;

const FAVS_KEY='sy_favs_v3';

/* ========= Búsqueda + sugerencia Google ========= */
async function searchYouTube(q){
  setStatus("Buscando…", true);
  const endpoint = `https://r.jina.ai/http://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  const html = await fetch(endpoint,{headers:{'Accept':'text/plain'}}).then(r=>r.text()).catch(()=>null);
  if(!html){ setStatus("Sin respuesta de YouTube"); return []; }
  const ids = uniq(Array.from(html.matchAll(/watch\?v=([\w-]{11})/g)).map(m=>m[1])).slice(0,24);
  const out=[];
  for(const id of ids){
    try{
      const meta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`).then(r=>r.json());
      out.push({ id, title: cleanTitle(meta.title||`Video ${id}`), thumb: meta.thumbnail_url||`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author: meta.author_name||"Desconocido", url:`https://www.youtube.com/watch?v=${id}` });
    }catch{
      out.push({ id, title: cleanTitle(`Video ${id}`), thumb:`https://img.youtube.com/vi/${id}/hqdefault.jpg`, author:"Desconocido", url:`https://www.youtube.com/watch?v=${id}` });
    }
  }
  setStatus(`Resultados: ${out.length}`);
  return out;
}
function setStatus(t, loading=false){ const el=$("#status"); el.textContent=t||""; el.classList.toggle("loading",loading); }

/* Google Suggest (1 sugerencia) */
let sugTimer=null;
const suggBox = $("#suggest");
function showSuggest(text){
  if(!text){ suggBox.classList.add('hide'); return; }
  suggBox.textContent = text;
  suggBox.classList.remove('hide');
  suggBox.onclick = ()=>{ $("#q").value = text; suggBox.classList.add('hide'); $("#btnSearch").click(); };
}
$("#q").addEventListener("input", ()=>{
  clearTimeout(sugTimer);
  const val=$("#q").value.trim();
  if(val.length<3){ showSuggest(""); return; }
  sugTimer=setTimeout(async()=>{
    try{
      const url=`https://suggestqueries.google.com/complete/search?client=firefox&hl=es&q=${encodeURIComponent(val)}`;
      const res=await fetch(url).then(r=>r.json());
      const s=(res[1]||[]).find(x=>String(x).toLowerCase().startsWith(val.toLowerCase()));
      showSuggest(s && s.toLowerCase()!==val.toLowerCase() ? s : "");
    }catch{ showSuggest(""); }
  },180);
});

/* ========= Render búsqueda ========= */
function renderResults(){
  const root=$("#results"); root.innerHTML="";
  items.forEach((it,i)=>{
    const isCurrent = (ctx.source==='search' && ctx.index===i);
    const card=document.createElement("div");
    card.className="card" + (isCurrent ? " active-card" : "");
    card.innerHTML=`
      <div class="thumb" style="background-image:url('${it.thumb.replace(/'/g,"%27")}')"></div>
      <div class="meta">
        <div class="title">${isCurrent?'<span class="eq"><span></span><span></span><span></span></span>':''}${esc(it.title)}</div>
        <div class="subtitle">${it.author||""}</div>
      </div>
      <button class="heart ${isFav(it.id)?'active':''}" title="${isFav(it.id)?'Quitar de favoritos':'Agregar a favoritos'}" aria-label="Favorito">
        <svg><use href="${isFav(it.id)?'#ic-heart-fill':'#ic-heart'}"/></svg>
      </button>`;
    card.addEventListener('click',()=>playFrom('search',i,true));
    card.querySelector('.heart').addEventListener('click',ev=>{
      ev.stopPropagation(); toggleFav(it);
    });
    root.appendChild(card);
  });
}

/* ========= Render favoritos ========= */
function renderFavs(){
  const list=$("#favList"); list.innerHTML="";
  if(!favs.length){
    const empty=document.createElement('div'); empty.className="subtitle"; empty.style.padding="18px";
    empty.textContent="Aún no tenés favoritos. Agregá con el corazón desde Búsqueda.";
    list.appendChild(empty);
  }else{
    favs.forEach((it,i)=>{
      const isCurrent = (ctx.source==='favorites' && ctx.index===i);
      const row=document.createElement('div');
      row.className="fav-row"+(isCurrent?' is-current':'');
      row.innerHTML=`
        <div class="fav-thumb" style="background-image:url('${it.thumb.replace(/'/g,"%27")}')"></div>
        <div class="fav-meta">
          <div class="fav-title">${isCurrent?'<span class="eq"><span></span><span></span><span></span></span>':''}${esc(it.title)}</div>
          <div class="fav-sub">${it.author||""}</div>
        </div>
        <div class="fav-actions"><button class="btn-x" title="Quitar"><svg><use href="#ic-close"/></svg></button></div>`;
      row.addEventListener('click',e=>{
        if(e.target.closest('.btn-x')) return;
        playFrom('favorites',i,true);
      });
      row.querySelector('.btn-x').addEventListener('click',e=>{
        e.stopPropagation(); removeFav(it.id);
      });
      list.appendChild(row);
    });
  }

  const cur=getCurrentItem();
  const header=$("#favHeader");
  if(cur){
    header.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.75)), url('${cur.thumb.replace(/'/g,"%27")}')`;
    $("#favNowTitle").textContent = cur.title;
  }else{
    header.style.backgroundImage = "";
    $("#favNowTitle").textContent = "—";
  }
}

/* ========= Favoritos (localStorage) ========= */
function loadFavs(){ try{return JSON.parse(localStorage.getItem(FAVS_KEY)||'[]')}catch{return[]} }
function saveFavs(){ try{localStorage.setItem(FAVS_KEY, JSON.stringify(favs))}catch{} }
function isFav(id){ return favs.some(f=>f.id===id); }
function toggleFav(item){ isFav(item.id)?removeFav(item.id):addFav(item); }
function addFav(item){ if(isFav(item.id))return; favs.push(item); saveFavs(); renderResults(); renderFavs(); }
function removeFav(id){
  favs=favs.filter(f=>f.id!==id); saveFavs();
  if(ctx.source==='favorites' && ctx.index>=favs.length) ctx.index=favs.length-1;
  renderResults(); renderFavs();
}

/* ========= YouTube IFrame ========= */
function loadYTApi(){
  if(window.YT && window.YT.Player){ onYouTubeIframeAPIReady(); return; }
  const s=document.createElement('script'); s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady=function(){
  ytPlayer=new YT.Player('player',{
    width:300,height:150,videoId:'',
    playerVars:{autoplay:0,controls:0,rel:0,playsinline:1},
    events:{'onReady':()=>{YT_READY=true},'onStateChange':onYTState}
  });
};
function onYTState(e){
  if(e.data===YT.PlayerState.PLAYING){
    startTimer(); switchPlayIcon(true); $("#pausedNotice").classList.remove("show"); wasPlaying=true; $("#eqNow").classList.remove('hide');
  }
  if(e.data===YT.PlayerState.PAUSED){
    stopTimer(); switchPlayIcon(false); wasPlaying=false; $("#eqNow").classList.add('hide');
  }
  if(e.data===YT.PlayerState.ENDED){
    stopTimer();
    const list = getList(ctx.source);
    if(repeatMode==='one'){ ytPlayer.seekTo(0,true); ytPlayer.playVideo(); return; }
    if(shuffleOn && list.length>1){
      let r; do{ r = Math.floor(Math.random()*list.length); }while(r===ctx.index);
      playFrom(ctx.source, r, true); return;
    }
    if(ctx.index+1 < list.length){ next(); }
    else if(repeatMode==='all' && list.length){ playFrom(ctx.source, 0, true); }
  }
}
function switchPlayIcon(isPlaying){ $("#btnPlayIcon use").setAttribute('href', isPlaying?'#ic-pause':'#ic-play'); }

/* ========= Player Controls ========= */
function getList(source){ return source==='favorites' ? favs : items; }
function getCurrentItem(){ const list=getList(ctx.source); return (ctx.index>=0 && ctx.index<list.length) ? list[ctx.index] : null; }

function playFrom(source,index,autoplay=true,startSeconds=0){
  if(!YT_READY) return;
  const list=getList(source); if(!list[index]) return;
  ctx.source=source; ctx.index=index;

  const it=list[index];
  $("#pCover").style.backgroundImage=`url('${it.thumb.replace(/'/g,"%27")}')`;
  $("#pTitle").textContent=it.title;

  ytPlayer.loadVideoById({ videoId: it.id, startSeconds, suggestedQuality:'auto' });
  ytPlayer.setVolume(parseInt($("#vol").value,10)||100);
  if(!autoplay){ ytPlayer.pauseVideo(); }

  renderResults(); renderFavs();
}
function togglePlay(){ if(!YT_READY) return; const st=ytPlayer.getPlayerState(); (st===YT.PlayerState.PLAYING)?ytPlayer.pauseVideo():ytPlayer.playVideo(); }
function prev(){ const list=getList(ctx.source); if(!list.length) return; const i=(ctx.index>0)?ctx.index-1:list.length-1; playFrom(ctx.source,i,true); }
function next(){ const list=getList(ctx.source); if(!list.length) return; const i=(ctx.index+1)%list.length; playFrom(ctx.source,i,true); }
function seekToFrac(frac){ if(!YT_READY) return; const d=ytPlayer.getDuration()||0; ytPlayer.seekTo(frac*d,true); }
function startTimer(){
  stopTimer();
  timeTimer=setInterval(()=>{ if(!YT_READY) return;
    const cur=ytPlayer.getCurrentTime()||0, dur=ytPlayer.getDuration()||0;
    $("#cur").textContent=fmtTime(cur); $("#dur").textContent=fmtTime(dur);
    $("#seek").value = dur ? Math.floor((cur/dur)*1000) : 0;
  },250);
}
function stopTimer(){ clearInterval(timeTimer); timeTimer=null; }

/* ========= Hack de foco (recarga mismo video en el segundo actual) ========= */
function handleVisibilityChange(){
  const curItem=getCurrentItem();
  if(!YT_READY || !curItem) return;

  if(document.visibilityState==="hidden" && wasPlaying){
    if(visReloadCooldown) return;
    visReloadCooldown=true; setTimeout(()=>{visReloadCooldown=false},1500);

    lastTime=ytPlayer.getCurrentTime()||0;
    ytPlayer.loadVideoById({ videoId: curItem.id, startSeconds: lastTime, suggestedQuality:'auto' });
    ytPlayer.setVolume(parseInt($("#vol").value,10)||100);
    $("#pausedNotice").classList.remove("show");
  }else if(document.visibilityState==="visible"){
    $("#pausedNotice").classList.remove("show");
  }
}

/* ========= Wire UI ========= */
document.addEventListener('DOMContentLoaded', ()=>{
  favs=loadFavs(); renderFavs();

  $("#btnSearch").addEventListener("click", async()=>{
    const q=$("#q").value.trim(); if(!q) return;
    setStatus("Buscando…", true);
    items=await searchYouTube(q);
    ctx.source='search'; ctx.index=-1;
    renderResults();
  });
  $("#q").addEventListener("keydown", e=>{
    if(e.key==="Enter"){ $("#btnSearch").click(); }
  });

  // Controles
  $("#btnPlay").onclick=togglePlay;
  $("#btnPrev").onclick=prev;
  $("#btnNext").onclick=next;
  $("#seek").addEventListener("input", e=>{ const v=parseInt(e.target.value,10)/1000; seekToFrac(v); });
  $("#vol").addEventListener("input", e=>{ if(YT_READY) ytPlayer.setVolume(parseInt(e.target.value,10)); });

  // Repeat/Shuffle
  $("#btnRepeat").addEventListener('click', ()=>{
    repeatMode = (repeatMode==='off') ? 'all' : (repeatMode==='all') ? 'one' : 'off';
    $("#btnRepeat").classList.toggle('active', repeatMode!=='off');
    $("#btnRepeat").classList.toggle('repeat-one', repeatMode==='one');
  });
  $("#btnShuffle").addEventListener('click', ()=>{
    shuffleOn = !shuffleOn;
    $("#btnShuffle").classList.toggle('active', shuffleOn);
  });

  // FABs y modal
  const favsModal=$("#favsModal");
  const openFavs = ()=>{ document.body.classList.add('modal-open'); favsModal.classList.add('show'); renderFavs(); };
  const closeFavs= ()=>{ document.body.classList.remove('modal-open'); favsModal.classList.remove('show'); };
  $("#fabOpenFavs").addEventListener('click', openFavs);
  $("#fabBackToSearch").addEventListener('click', closeFavs);
  $("#closeFavs").addEventListener('click', closeFavs);
  $("#favsModal .modal-backdrop").addEventListener('click', closeFavs);

  document.addEventListener("visibilitychange", handleVisibilityChange);
  loadYTApi();
});
