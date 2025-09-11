// Archivo principal: inicialización, manejo de vistas y conexión de módulos.
let activeSessions = []; // Variable global para guardar las sesiones

// --- Utils ---
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = s => { s = Math.max(0, Math.floor(s||0)); const m = Math.floor(s/60), ss = s%60; return `${m}:${String(ss).padStart(2,'0')}`; };
const cleanTitle = t => (t||"").replace(/\[(official\s*)?(music\s*)?video.*?\]/ig,"").replace(/\((official\s*)?(music\s*)?video.*?\)/ig,"").replace(/\b(videoclip|video oficial|lyric video|lyrics|mv|oficial)\b/ig,"").replace(/\s{2,}/g," ").trim();
const cleanAuthor = a => (a||"").replace(/\s*[-–—]?\s*\(?Topic\)?\b/gi, "").replace(/VEVO/gi, "").replace(/\s{2,}/g, " ").replace(/\s*-\s*$/, "").trim();
const dotsSvg = () => `<svg viewBox="0 0 24 24"><path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>`;
const favIconSvg = (isFav) => isFav
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.54 0 3.04.81 4 2.09C11.46 4.81 12.96 4 14.5 4 17 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;
const youtubeLogoSvg = () => `<span class="source-logo youtube-logo" title="YouTube"><svg viewBox="0 0 28 20"><path d="M27.5 3.1s-.3-2.2-1.3-3.2C25.2-.1 24-.1 24-.1h-20s-1.2 0-2.2 1C.8 2 .5 3.1.5 3.1S.2 5.6.2 8v4c0 2.4.3 4.9.3 4.9s.3 2.2 1.3 3.2c1 .9 2.2 1 2.2 1h20s1.2 0 2.2-1c.9-1 1.3-3.2 1.3-3.2s.3-2.5.3-4.9v-4c0-2.4-.3-4.9-.3-4.9zM11.2 14V6l7.5 4-7.5 4z"/></svg></span>`;
const spotifyLogoSvg = () => `<span class="source-logo spotify-logo" title="Spotify"><svg viewBox="0 0 167.5 167.5"><path d="M83.7 0C37.5 0 0 37.5 0 83.7c0 46.3 37.5 83.7 83.7 83.7 46.3 0 83.7-37.5 83.7-83.7S130 0 83.7 0zM122 120.8c-1.4 2.5-4.4 3.2-6.8 1.8-19.3-11-43.4-14-71.4-7.8-2.8.6-5.5-1.2-6-4-.6-2.8 1.2-5.5 4-6 31-6.8 57.4-3.2 79.2 9.2 2.5 1.4 3.2 4.4 1.8 6.8zm7-23c-1.8 3-5.5 4-8.5 2.2-22-12.8-56-16-83.7-8.8-3.5 1-7-1-8-4.4-1-3.5 1-7 4.4-8 30.6-8 67.4-4.5 92.2 10.2 3 1.8 4 5.5 2.2 8.5zm8.5-23.8c-26.5-15-70-16.5-97.4-9-4-.8-8.2-3.5-9-7.5s3.5-8.2 7.5-9c31.3-8.2 79.2-6.2 109.2 10.2 4 2.2 5.2 7 3 11-2.2 4-7 5.2-11 3z"/></svg></span>`;
const youtubeMusicLogoSvg = () => `<span class="source-logo ytmusic-logo" title="YouTube Music"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg></span>`;

// --- Navegación y Vistas ---
function switchView(id){
  $$(".view").forEach(v => v.classList.remove("active"));
  const view = $("#" + id);
  if (view) view.classList.add("active");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  if (id !== "view-search") {
      updateHomeGridVisibility();
  }
  heroScrollInvalidate();
}

// --- Lógica de la Interfaz de Usuario (UI) ---
function updateUIOnTrackChange() {
  updateHero(currentTrack);
  updateMiniNow();
  refreshIndicators();
  updateControlStates();
  updateMediaSession(currentTrack);
  updateAndroidNotification();
  
  const broadcastWrapper = $("#broadcastWrapper");
  if (broadcastWrapper) {
      broadcastWrapper.classList.toggle("broadcasting", liveState.mode === 'broadcasting');
  }
  const broadcastBtn = $("#broadcastBtn");
  if(broadcastBtn){
      broadcastBtn.title = liveState.mode === 'broadcasting' ? "Finalizar transmisión" : "Iniciar transmisión";
  }
}

function updateHero(track) {
  const t = track || currentTrack;
  const favHero = $("#favHero"), npHero  = $("#npHero");

  if (favHero) favHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  if ($("#favNowTitle")) $("#favNowTitle").textContent = t ? t.title : "—";
  if (npHero) npHero.style.backgroundImage = t ? `url(${t.thumb})` : "none";
  if ($("#npTitle")) $("#npTitle").textContent = t ? t.title : "Elegí una canción";

  let plName = "";
  if (queueType === 'playlist' && viewingPlaylistId) {
    const pl = communityPlaylists.find(p => p.id === viewingPlaylistId);
    plName = pl ? pl.name : "";
  } else if (queueType === 'archive' || queueType === 'recommended' || queueType === 'youtube_playlist') {
    plName = currentQueueTitle;
  }
  let subText = t ? `${cleanAuthor(t.author)}${plName ? ` • ${plName}` : ""}` : (plName || "—");
  if (liveState.mode === 'listening' && liveState.sessionData) {
      subText = `Escuchando a: ${liveState.sessionData.name}`;
  } else if (liveState.mode === 'broadcasting') {
      subText = `Transmitiendo en vivo`;
  }
  if ($("#npSub")) $("#npSub").textContent = subText;
}

function updateMiniNow() {
  const hasTrack = !!currentTrack;
  const dock = $("#seekDock");
  if (dock) dock.classList.toggle("show", hasTrack);
  if (!hasTrack) return;
  $("#miniThumb").src = currentTrack.thumb;
  $("#miniTitle").textContent = currentTrack.title;
  let authorText = cleanAuthor(currentTrack.author) || "";
  if (liveState.mode === 'listening' && liveState.sessionData) {
      authorText = `De: ${liveState.sessionData.name}`;
  } else if (liveState.mode === 'broadcasting') {
      authorText = ''; 
  }
  $("#miniAuthor").textContent = authorText;
}

function refreshIndicators() {
  const isPlaying = getPlaybackState() === 'playing';
  const curId = currentTrack?.id || "";

  $$(".result-item, .fav-item, .queue-item").forEach(el => {
    let trackId = el.dataset.trackId;
    const isCurrentTrack = trackId === curId;
    el.classList.toggle("is-playing", isCurrentTrack);

    const cardPlay = el.querySelector(".card-play");
    if (cardPlay) cardPlay.classList.toggle("playing", isPlaying && isCurrentTrack);

    const favBtn = el.querySelector(".fav-btn");
    if (favBtn) {
        favBtn.innerHTML = favIconSvg(isFav(trackId));
        favBtn.classList.toggle('is-fav', isFav(trackId));
    }
  });

  $("#npPlay")?.classList.toggle("playing", isPlaying);
  $("#miniPlay")?.classList.toggle("playing", isPlaying);
}

function updateControlStates() {
    const isListening = liveState.mode === 'listening';
    $("#btnShuffle")?.classList.toggle('active', isShuffle && !isListening);
    const repeatBtn = $("#btnRepeat");
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'none' && !isListening);
        repeatBtn.innerHTML = (repeatMode === 'one' && !isListening)
          ? `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zM13 15V9h-1l-2 1v1h1.5v4H13z"/></svg>`
          : `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    }
}

// --- Home Grid ---
function renderPlaylistCard(playlist) {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    let trackCount = playlist.trackCount || playlist.tracks?.length || 0;
    if (trackCount === 0) return;
    
    let covers = (playlist.tracks || []).slice(0, 4).map(track => track && track.thumb).filter(Boolean);
    if (covers.length === 0 && playlist.cover) covers.push(playlist.cover);
    while (covers.length < 4) covers.push("data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=");
    
    const logo = (playlist.source === 'spotify' ? spotifyLogoSvg() : youtubeLogoSvg());
    
    const card = document.createElement("article");
    card.className = "playlist-card";
    card.dataset.id = playlist.id;
    
    card.innerHTML = `<div class="collage-container">${covers.map(src => `<img src="${src}" alt="Album art collage">`).join('')}</div>
        <div class="playlist-meta">
            <div class="playlist-title-wrapper"><h4 class="playlist-title">${playlist.name}</h4></div>
            <div class="creator-line">${logo}<span>${playlist.creator}</span></div>
        </div>`;
        
    card.onclick = () => showPlaylistInPlayer(playlist.id);
    container.appendChild(card);
}


function renderAllHomePlaylists() {
    const container = $("#allPlaylistsContainer");
    if (!container) return;
    container.innerHTML = "";
    const publicCommunityPlaylists = communityPlaylists.filter(p => p.isPublic && ((p.tracks && p.tracks.length > 0) || (p.spotifyTracks && p.spotifyTracks.length > 0)));
    publicCommunityPlaylists.sort((a, b) => (b.updatedAt?.toDate() || 0) - (a.updatedAt?.toDate() || 0));
    publicCommunityPlaylists.forEach(p => renderPlaylistCard(p));
}

function updateHomeGridVisibility(){
  const home = $("#homeSection"); if(!home) return;
  const shouldShow = (currentSearchSource === 'youtube' && items.length === 0 && !$(".loading-indicator"));
  home.classList.toggle("hide", !shouldShow);
}

// --- Sheets, Toasts & Menús ---
function showToast(message, isError = false) {
    let toast = document.getElementById('sy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'show';
    if(isError) toast.classList.add('error');
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

function openActionSheet({title="Opciones", actions=[], onAction=()=>{}}){
  const sheet = $("#menuSheet"); if(!sheet) return;
  sheet.innerHTML = `<div class="sheet-content">
      <div class="sheet-title">${title}</div>
      ${actions.map(a=>`<button class="sheet-item ${a.ghost?'ghost':''} ${a.danger?'danger':''}" data-id="${a.id}">${a.label}</button>`).join("")}
    </div>`;
  sheet.classList.add("show");
  sheet.onclick = (e)=>{
    if(e.target===sheet){ sheet.classList.remove("show"); return; }
    const btn = e.target.closest(".sheet-item"); if(!btn) return;
    sheet.classList.remove("show");
    onAction(btn.dataset.id);
  };
}

async function openPlaylistSheet(track){
  const sheet = $("#playlistSheet"); if(!sheet) return;
  sheet.classList.add("show");
  const list = $("#plChoices"); list.innerHTML="";
  const myPlaylists = communityPlaylists.filter(p => isMyPlaylist(p.id) && p.source !== 'spotify');
  myPlaylists.forEach(pl=>{
    const btn = document.createElement("button");
    btn.className="sheet-item";
    btn.textContent = pl.name;
    btn.onclick = async ()=>{
      if (await addSongToPlaylist(pl.id, track)) {
          sheet.classList.remove("show");
          showToast(`Agregado a "${pl.name}"`);
      }
    };
    list.appendChild(btn);
  });
  $("#plCreateFromSong").onclick = async () => {
    const name = $("#plNewNameFromSong").value.trim();
    if (!name) return;
    const creator = prompt("Tu nombre (creador):")?.trim();
    if (!creator) return;
    if (await createNewPlaylistFromSong(name, creator, track)) {
        $("#plNewNameFromSong").value = "";
        sheet.classList.remove("show");
        showToast(`Agregado a la nueva playlist "${name}"`);
    }
  };
  $("#plCancel").onclick = ()=> sheet.classList.remove("show");
  sheet.addEventListener("click", e=>{ if(e.target.id==="playlistSheet") sheet.classList.remove("show"); }, {once:true});
}

// --- Tema ---
const THEME_KEY = "sy_theme_v1";
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const tBtn = $("#themeToggle");
  if(tBtn) tBtn.classList.toggle("is-light", theme === "light");
  const meta = $('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--dock-bg").trim());
  document.documentElement.style.colorScheme = theme;
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
  $("#themeToggle")?.addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
}

// --- Efecto Hero Scroll ---
let rafPending = false, lastScrollY = 0, targetT = 0, currentT = 0;
function heroScrollTickRaf(){
    rafPending=false;
    const activeView = $(".view.active");
    if(!activeView) return;
    const viewTop = activeView.getBoundingClientRect().top + window.scrollY;
    const y = Math.max(0, lastScrollY - viewTop);
    targetT = Math.min(1, y / 200);
    currentT += (targetT - currentT) * 0.25;
    if (Math.abs(targetT-currentT) < 0.001) currentT = targetT;
    const hero = activeView.querySelector("#favHero, .fav-hero, #npHero, .np-hero, .player-header-sticky");
    if (hero) hero.style.setProperty("--hero-t", currentT);
    if (Math.abs(targetT-currentT) >= 0.001) { requestAnimationFrame(heroScrollTickRaf); rafPending=true; }
}
function heroScrollInvalidate(){
    lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (!rafPending) { rafPending = true; requestAnimationFrame(heroScrollTickRaf); }
}

// --- Arranque de la App ---
async function boot(){
  initTheme();
  await initFirebase();
  
  // listenForLiveSessions(renderLiveSessions); // Desactivado por ahora

  renderAllHomePlaylists();
  updateHomeGridVisibility();

  loadFavs();
  renderFavs();
  initPlayer();
  loadYTApi();
  initSearch();
  initPlaylistModals();
  initSpotifyImportUI();
  
  const savedState = loadPlayerState();
  if (savedState) restorePlayerState(savedState);

  heroScrollInvalidate();
  document.title = "SanaveraYou Pro";

  // --- Listener Global de Navegación y Acciones ---
  $("#bottomNav").addEventListener("click", e=>{
    const btn = e.target.closest(".nav-btn"); if(!btn || btn.classList.contains('active')) return;
    switchView(btn.dataset.view);
  });
  
  document.body.addEventListener("click", async (e) => {
    const itemEl = e.target.closest(".result-item, .fav-item, .queue-item");
    if (!itemEl) return;
    
    const moreBtn = e.target.closest(".icon-btn.more");
    if (moreBtn) {
        e.stopPropagation();
        
        const trackId = itemEl.dataset.trackId;
        const track = [...(items || []), ...(favs || []), ...(queue || [])].find(t => t && t.id === trackId);
        if (!track) return;

        if (liveState.mode === 'listening') return;
        
        const actions = [
            { id: "find_artist_archive", label: "Buscar este artista en Archive" },
            { id: "pl", label: "Agregar a playlist" }
        ];

        if (itemEl.classList.contains("queue-item") && queueType === 'playlist' && viewingPlaylistId && isMyPlaylist(viewingPlaylistId)) {
            actions.push({ id: "reassign", label: "Reasignar fuente" });
            actions.push({ id: "delete", label: "Eliminar de esta playlist", danger: true });
        }
        actions.push({ id: "cancel", label: "Cancelar", ghost: true });

        openActionSheet({
            title: track.title,
            actions: actions,
            onAction: (act) => {
                if (act === "pl") openPlaylistSheet(track);
                if (act === "delete") removeFromPlaylist(viewingPlaylistId, track.id);
                if (act === "reassign") reassignTrackSource(viewingPlaylistId, track.id);
                if (act === "find_artist_archive" && track.author) {
                    switchView('view-search');
                    searchArchiveAlbums(track.author);
                }
            }
        });
        return;
    }

    const favBtn = e.target.closest(".fav-btn");
    if (favBtn) {
        e.stopPropagation();
        const trackId = itemEl.dataset.trackId;
        // Buscamos la canción en todas las fuentes posibles (resultados, cola, favoritos)
        const track = [...(queue || []), ...(items || []), ...(favs || [])].find(t => t && t.id === trackId);
        if(track) toggleFav(track);
        return;
    }
  });

  window.addEventListener("scroll", heroScrollInvalidate, { passive:true });
  window.addEventListener("resize", heroScrollInvalidate, { passive:true });
}

document.addEventListener('DOMContentLoaded', boot);

