// Contiene la lógica del reproductor de YouTube, la cola de reproducción y los controles.

let ytPlayer = null;
let YT_READY = false;
let timer = null;
let mediaSessionHandlersSet = false;

// Estado de la cola y reproducción
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let currentQueueTitle = "";

// Estado de los controles
let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

const PLAYER_STATE_KEY = "sy_player_state_v2";

/**
 * Carga la API de IFrame de YouTube.
 */
function loadYTApi(){
  if(window.YT && window.YT.Player){ 
    onYouTubeIframeAPIReady(); 
    return; 
  }
  const tag = document.createElement("script"); 
  tag.src="https://www.youtube.com/iframe_api"; 
  document.head.appendChild(tag);
}

/**
 * Función de callback que se ejecuta cuando la API de YouTube está lista.
 */
window.onYouTubeIframeAPIReady = function(){
  ytPlayer = new YT.Player("player",{
    width: 300, height: 150, videoId: "",
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: {
      onReady: () => { 
        YT_READY=true; 
        window.dispatchEvent(new Event('yt-ready')); 
      },
      onStateChange: (e) => {
        const state = e.data;
        if (state === YT.PlayerState.ENDED) { next(); }
        try {
            if('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? 'playing' : (state === YT.PlayerState.PAUSED ? 'paused' : 'none');
            }
        } catch {}
        refreshIndicators();
        updateAndroidNotification();
      }
    }
  });
};

/**
 * Obtiene el estado actual del reproductor.
 * @returns {'playing'|'paused'|'none'}
 */
function getPlaybackState(){
  if(!YT_READY || !ytPlayer) return "none";
  const state = ytPlayer.getPlayerState();
  return (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? "playing"
       : (state === YT.PlayerState.PAUSED) ? "paused"
       : "none";
}

/**
 * Guarda el estado actual del reproductor en el Local Storage.
 */
function savePlayerState() {
  if (!currentTrack || !ytPlayer) return;
  const state = {
    queue,
    queueType,
    qIdx,
    currentTime: ytPlayer.getCurrentTime() || 0,
    isShuffle,
    repeatMode,
    wasPlaying: getPlaybackState()==="playing",
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Error saving player state:", e);
  }
}

/**
 * Carga el estado del reproductor desde el Local Storage.
 * @returns {object|null}
 */
function loadPlayerState() {
  const savedState = localStorage.getItem(PLAYER_STATE_KEY);
  if (!savedState) return null;
  try {
    const state = JSON.parse(savedState);
    // Expira después de 2 horas
    if (Date.now() - (state.timestamp || 0) > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(PLAYER_STATE_KEY);
      return null;
    }
    return state;
  } catch (e) {
    console.error("Error loading player state:", e);
    return null;
  }
}

/**
 * Restaura el estado del reproductor a partir de un estado guardado.
 * @param {object} state - El estado guardado a restaurar.
 */
function restorePlayerState(state) {
  if (!state || !state.queue || state.qIdx < 0) return;
  const restore = () => {
    queue = state.queue;
    queueType = state.queueType;
    qIdx = state.qIdx;
    currentTrack = queue[qIdx];
    isShuffle = !!state.isShuffle;
    repeatMode = state.repeatMode || 'none';

    ytPlayer.loadVideoById({
      videoId: currentTrack.id,
      startSeconds: state.currentTime || 0,
      suggestedQuality: "auto"
    });
    ytPlayer.setVolume(100);

    if (state.wasPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();

    updateUIOnTrackChange();
    startTimer();
  };

  if (YT_READY) restore();
  else window.addEventListener('yt-ready', restore, { once: true });
}

/**
 * Establece la cola de reproducción.
 * @param {Array<object>} srcArr - El array de canciones.
 * @param {string} type - El tipo de cola (search, favs, playlist, etc.).
 * @param {number} idx - El índice de la canción a reproducir.
 */
function setQueue(srcArr, type, idx){
  let finalSrc = srcArr;
  if (isShuffle) {
    const currentItem = srcArr[idx];
    const others = srcArr.filter((item, index) => index !== idx);
    const shuffledOthers = others.sort(() => Math.random() - 0.5);
    finalSrc = [currentItem, ...shuffledOthers];
    idx = 0;
  }
  queue = finalSrc;
  queueType = type;
  qIdx = idx;
}

/**
 * Reproduce la canción actual en la cola.
 * @param {boolean} autoplay - Si debe empezar a reproducir automáticamente.
 */
function playCurrent(autoplay=false){
  if(!YT_READY || !queue || qIdx<0 || qIdx>=queue.length) return;
  currentTrack = queue[qIdx];
  if (!currentTrack || !currentTrack.id) {
    console.warn("Attempting to play invalid track, skipping to next.", currentTrack);
    next();
    return;
  }
  ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
  if(!autoplay) ytPlayer.pauseVideo();
  startTimer();
  updateUIOnTrackChange();
}

/**
 * Alterna entre reproducir y pausar.
 */
function togglePlay(){
  if(!YT_READY || !currentTrack) return;
  const state = ytPlayer.getPlayerState();
  (state === YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
}

/**
 * Calcula el índice de la siguiente canción a reproducir.
 * @returns {number} - El índice de la siguiente canción o -1 si no hay más.
 */
function getNextIndex() {
  if (!queue) return -1;
  if (repeatMode === 'one') return qIdx;
  let nextIdx = qIdx + 1;
  if (nextIdx >= queue.length) {
      return (repeatMode === 'all') ? 0 : -1;
  }
  return nextIdx;
}

/**
 * Reproduce la siguiente canción de la cola.
 */
function next(){
  const nextIdx = getNextIndex();
  if (nextIdx !== -1) { 
    qIdx = nextIdx; 
    playCurrent(true); 
  } else { 
    ytPlayer.stopVideo(); 
    currentTrack = null; 
    updateUIOnTrackChange(); 
  }
}

/**
 * Reproduce la canción anterior o reinicia la actual.
 */
function prev(){
  if (!queue) return;
  if (ytPlayer.getCurrentTime() > 3) {
    ytPlayer.seekTo(0, true);
  } else if (qIdx - 1 >= 0) { 
    qIdx--; 
    playCurrent(true); 
  }
}

/**
 * Alterna el modo aleatorio (shuffle).
 */
function toggleShuffle() {
  isShuffle = !isShuffle;
  updateControlStates();
  if (currentTrack) {
    let currentQueueSource = queue || [];
    const originalIndex = currentQueueSource.findIndex(t => t.id === currentTrack.id);
    setQueue(currentQueueSource, queueType, Math.max(0, originalIndex));
    if ($("#queuePanel") && !$("#queuePanel").classList.contains('hide')) {
        renderQueue(queue, currentQueueTitle);
    }
  }
}

/**
 * Cambia el modo de repetición (none, all, one).
 */
function cycleRepeat() {
  const modes = ['none', 'all', 'one'];
  const currentModeIdx = modes.indexOf(repeatMode);
  repeatMode = modes[(currentModeIdx + 1) % modes.length];
  updateControlStates();
}

/**
 * Adelanta o retrocede la reproducción a una fracción de la duración total.
 * @param {number} frac - Fracción de la duración (0 a 1).
 */
function seekToFrac(frac){
  if(!YT_READY) return;
  const duration = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(frac * duration, true);
}

/**
 * Inicia el temporizador para actualizar la barra de progreso.
 */
function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!YT_READY || !currentTrack || getPlaybackState() !== 'playing') return;

    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    const progress = dur ? Math.floor((cur/dur)*1000) : 0;
    
    $("#cur").textContent = fmt(cur);
    $("#dur").textContent = fmt(dur);
    $("#seek").value = progress;
    
    $("#miniCur").textContent = fmt(cur);
    $("#miniDur").textContent = fmt(dur);
    $("#miniSeek").value = progress;

    try {
      if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
        navigator.mediaSession.setPositionState({ duration: dur, playbackRate: ytPlayer.getPlaybackRate(), position: cur });
      }
    } catch(e) {}

    savePlayerState();
  }, 500);
}

/**
 * Detiene el temporizador de la barra de progreso.
 */
function stopTimer(){ 
  clearInterval(timer); 
  timer = null; 
}

// --- Media Session & Android Bridge ---

/**
 * Actualiza la información de Media Session para controles nativos del SO.
 * @param {object} track - La canción actual.
 */
function updateMediaSession(track){
  if(!('mediaSession' in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Reproduciendo',
      artist: cleanAuthor(track.author) || '—',
      album: queueType === 'playlist' ? (communityPlaylists.find(p => p.id === viewingPlaylistId)?.name || '') : '',
      artwork: [{ src: track.thumb, sizes: '512x512', type: 'image/jpeg' }]
    });
  } catch(e) { console.error("Media Session Error:", e) }

  if(!mediaSessionHandlersSet){
    mediaSessionHandlersSet=true;
    const s = fn => () => { try { fn() } catch(e) { console.error("Media Session Action Error:", e) } };
    try {
        navigator.mediaSession.setActionHandler('play', s(togglePlay));
        navigator.mediaSession.setActionHandler('pause', s(togglePlay));
        navigator.mediaSession.setActionHandler('previoustrack', s(prev));
        navigator.mediaSession.setActionHandler('nexttrack', s(next));
        navigator.mediaSession.setActionHandler('seekto', s(d => { if(YT_READY && d && typeof d.seekTime === 'number') ytPlayer.seekTo(d.seekTime, true) }));
    } catch(e) { console.error("Error setting Media Session handlers:", e) }
  }
}

/**
 * Comprueba si el puente de Android para notificaciones está disponible.
 * @returns {boolean}
 */
function canUseAndroidBridge(){ 
    try { 
        return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification); 
    } catch(e){ 
        return false; 
    } 
}

/**
 * Actualiza la notificación nativa de Android.
 */
function updateAndroidNotification(){ 
    if (!canUseAndroidBridge()) return; 
    const isPlaying = getPlaybackState() === 'playing'; 
    if (!currentTrack) { 
        AndroidBridge.stopNotification(); 
        return; 
    } 
    AndroidBridge.updateNotification( currentTrack.title || '', cleanAuthor(currentTrack.author || ''), currentTrack.thumb || '', !!isPlaying ); 
}

/**
 * Maneja los controles de reproducción nativos de Android.
 * @param {string} control - La acción a ejecutar (play, pause, next, prev).
 */
window.handleNativeControl = function(control){ 
    const action = String(control || '').toLowerCase(); 
    if(action === 'action_play') { if(YT_READY && ytPlayer) ytPlayer.playVideo(); return } 
    if(action === 'action_pause') { if(YT_READY && ytPlayer) ytPlayer.pauseVideo(); return } 
    if(action === 'action_next') { next(); return } 
    if(action === 'action_prev') { prev(); return } 
};

/**
 * Inicializa los listeners para los controles del reproductor.
 */
function initPlayer() {
    $("#npPlay")?.addEventListener("click", togglePlay);
    $("#miniPlay")?.addEventListener("click", togglePlay);
    $("#btnNext")?.addEventListener("click", next);
    $("#btnPrev")?.addEventListener("click", prev);
    $("#btnShuffle")?.addEventListener("click", toggleShuffle);
    $("#btnRepeat")?.addEventListener("click", cycleRepeat);
    
    $("#seek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    $("#miniSeek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    
    document.addEventListener("visibilitychange", ()=>{
        if(!YT_READY || !currentTrack) return;
        if(document.visibilityState === "hidden" && getPlaybackState() === 'playing'){
            const t = ytPlayer.getCurrentTime() || 0;
            ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: t, suggestedQuality: "auto" });
            ytPlayer.playVideo();
        }
    });

    window.addEventListener('beforeunload', savePlayerState);
    window.addEventListener('beforeunload', function(){ if (canUseAndroidBridge()) AndroidBridge.stopNotification(); });
}
