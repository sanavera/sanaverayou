// Contiene la lógica de los reproductores (YouTube y Audio), la cola de reproducción y los controles.

let ytPlayer = null;
let audioPlayer = null;
let YT_READY = false;
let timer = null;
let mediaSessionHandlersSet = false;

// Estado de la cola y reproducción
let queue = null;
let queueType = null;
let qIdx = -1;
let currentTrack = null;
let currentQueueTitle = "";
let currentAudioSource = 'youtube'; // 'youtube' o 'archive'
let currentArchiveFormats = [];
let currentAudioFormat = 'mp3';


// Estado de los controles
let isShuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

const PLAYER_STATE_KEY = "sy_player_state_v2";

// --- AJUSTADO: Estado de Transmisión en Vivo ---
let liveState = {
    mode: 'none', // 'none', 'broadcasting', 'listening'
    sessionId: null,
    sessionData: null,
};
let sessionUnsubscribe = null;
let heartbeatInterval = null;

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
    height: 150, width: 300, videoId: "",
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
    events: {
      onReady: () => {
        YT_READY=true;
        window.dispatchEvent(new Event('yt-ready'));
      },
      onStateChange: (e) => {
        const state = e.data;
        if (state === YT.PlayerState.ENDED && liveState.mode !== 'listening') { next(); }
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
 * Obtiene el estado actual del reproductor activo.
 * @returns {'playing'|'paused'|'none'}
 */
function getPlaybackState(){
  if (currentAudioSource === 'archive' && audioPlayer) {
    return audioPlayer.paused ? 'paused' : 'playing';
  }
  if (currentAudioSource === 'youtube' && YT_READY && ytPlayer) {
    const state = ytPlayer.getPlayerState();
    return (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? "playing"
         : (state === YT.PlayerState.PAUSED) ? "paused"
         : "none";
  }
  return "none";
}

// --- Lógica de reproducción de Archive.org ---

async function playArchiveAlbum(albumId) {
    showToast("Cargando álbum desde Archive.org...");
    switchView('view-player');
    
    // Pausar y ocultar el reproductor de YouTube
    if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();

    try {
        const response = await fetch(`https://archive.org/metadata/${albumId}`);
        if (!response.ok) throw new Error(`Error al cargar metadatos: ${response.status}`);
        const data = await response.json();

        const metadata = data.metadata || {};
        const files = data.files || [];

        const albumTitle = Array.isArray(metadata.title) ? metadata.title[0] : metadata.title || 'Álbum Desconocido';
        const albumArtist = Array.isArray(metadata.creator) ? metadata.creator.join(', ') : metadata.creator || 'Artista Desconocido';
        const cover = `https://archive.org/services/img/${albumId}`;

        const audioFormats = ['mp3', 'flac', 'wav', 'ogg'];
        const audioFiles = files.filter(f => audioFormats.some(ext => f.name.toLowerCase().endsWith(`.${ext}`)));
        
        if (audioFiles.length === 0) {
            showToast("Este álbum no contiene archivos de audio compatibles.", true);
            return;
        }

        const tracksByTitle = {};
        audioFiles.forEach(file => {
            const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
            const format = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
            
            if (!tracksByTitle[baseName]) {
                tracksByTitle[baseName] = {
                    id: `${albumId}/${file.name}`,
                    title: baseName.replace(/_/g, ' '),
                    author: albumArtist,
                    thumb: cover,
                    source: 'archive',
                    urls: {}
                };
            }
            tracksByTitle[baseName].urls[format] = `https://archive.org/download/${albumId}/${encodeURIComponent(file.name)}`;
        });
        
        const newQueue = Object.values(tracksByTitle);
        currentArchiveFormats = [...new Set(audioFiles.map(f => f.name.substring(f.name.lastIndexOf('.') + 1).toLowerCase()))];
        
        setQueue(newQueue, 'archive', 0);
        renderQueue(newQueue, albumTitle);
        updateQualitySelector();
        
        playCurrent(true);

    } catch (e) {
        console.error("Error al reproducir álbum de Archive.org:", e);
        showToast("No se pudo cargar el álbum.", true);
    }
}

function loadArchiveTrack(index, autoplay = false) {
    if (index < 0 || index >= queue.length) return;
    qIdx = index;
    currentTrack = queue[qIdx];
    
    const url = currentTrack.urls[currentAudioFormat] || currentTrack.urls['mp3'];
    if (!url) {
        showToast(`Formato ${currentAudioFormat.toUpperCase()} no disponible para esta canción.`, true);
        next();
        return;
    }

    audioPlayer.src = url;
    updateUIOnTrackChange();

    if (autoplay) {
        audioPlayer.play().catch(e => console.error("Audio play failed:", e));
    }
}

function updateQualitySelector() {
    const container = $("#qualitySelectorContainer");
    const selector = $("#qualitySelector");
    if (!container || !selector) return;

    if (currentAudioSource === 'archive' && currentArchiveFormats.length > 0) {
        selector.innerHTML = currentArchiveFormats
            .map(format => `<option value="${format}" ${format === currentAudioFormat ? 'selected' : ''}>${format.toUpperCase()}</option>`)
            .join('');
        container.classList.remove('hide');
    } else {
        container.classList.add('hide');
    }
}


// --- Lógica de reproducción de YouTube ---

function playCurrent(autoplay=false){
  if (liveState.mode === 'listening') return;
  if(!queue || qIdx<0 || qIdx>=queue.length) return;
  
  currentTrack = queue[qIdx];
  if (!currentTrack) { next(); return; }

  currentAudioSource = currentTrack.source;

  stopTimer();

  if (currentAudioSource === 'archive') {
      audioPlayer.pause();
      if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
      loadArchiveTrack(qIdx, autoplay);
  } else { // youtube
      audioPlayer.pause();
      if(!YT_READY) return;
      ytPlayer.loadVideoById({videoId: currentTrack.id, startSeconds:0, suggestedQuality:"auto"});
      if(autoplay) ytPlayer.playVideo();
  }
  
  startTimer();
  updateUIOnTrackChange();
  updateQualitySelector();
}


/**
 * Establece la cola de reproducción.
 */
function setQueue(srcArr, type, idx){
  if (liveState.mode === 'listening') return;
  let finalSrc = srcArr;
  if (isShuffle && type !== 'archive') {
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
 * Alterna entre reproducir y pausar.
 */
function togglePlay(){
  if (liveState.mode === 'listening') return;
  if(!currentTrack) return;

  if (currentAudioSource === 'archive') {
      if (audioPlayer.paused) audioPlayer.play();
      else audioPlayer.pause();
  } else if (currentAudioSource === 'youtube' && YT_READY) {
      const state = ytPlayer.getPlayerState();
      (state === YT.PlayerState.PLAYING) ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
  }
}

/**
 * Calcula el índice de la siguiente canción a reproducir.
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
  if (liveState.mode === 'listening') return;
  const nextIdx = getNextIndex();
  if (nextIdx !== -1) {
    qIdx = nextIdx;
    playCurrent(true);
  } else {
    if (currentAudioSource === 'youtube') ytPlayer.stopVideo();
    else audioPlayer.pause();
    currentTrack = null;
    updateUIOnTrackChange();
  }
}

/**
 * Reproduce la canción anterior o reinicia la actual.
 */
function prev(){
  if (liveState.mode === 'listening') return;
  if (!queue) return;
  
  const currentTime = (currentAudioSource === 'youtube') ? ytPlayer.getCurrentTime() : audioPlayer.currentTime;

  if (currentTime > 3) {
      if (currentAudioSource === 'youtube') ytPlayer.seekTo(0, true);
      else audioPlayer.currentTime = 0;
  } else if (qIdx - 1 >= 0) {
    qIdx--;
    playCurrent(true);
  }
}

/**
 * Alterna el modo aleatorio (shuffle).
 */
function toggleShuffle() {
  if (liveState.mode !== 'none') return;
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
  if (liveState.mode !== 'none') return;
  const modes = ['none', 'all', 'one'];
  const currentModeIdx = modes.indexOf(repeatMode);
  repeatMode = modes[(currentModeIdx + 1) % modes.length];
  updateControlStates();
}

/**
 * Adelanta o retrocede la reproducción.
 */
function seekToFrac(frac){
  if (liveState.mode !== 'none') return;
  if (currentAudioSource === 'youtube' && YT_READY) {
      const duration = ytPlayer.getDuration() || 0;
      ytPlayer.seekTo(frac * duration, true);
  } else if (currentAudioSource === 'archive' && audioPlayer.duration) {
      audioPlayer.currentTime = frac * audioPlayer.duration;
  }
}

/**
 * Inicia el temporizador para actualizar la barra de progreso.
 */
function startTimer(){
  stopTimer();
  timer = setInterval(()=>{
    if(!currentTrack || (liveState.mode === 'listening')) return;

    let cur = 0, dur = 0;

    if (currentAudioSource === 'youtube' && YT_READY) {
        cur = ytPlayer.getCurrentTime() || 0;
        dur = ytPlayer.getDuration() || 0;
    } else if (currentAudioSource === 'archive') {
        cur = audioPlayer.currentTime || 0;
        dur = audioPlayer.duration || 0;
    }
    
    const progress = dur ? Math.floor((cur/dur)*1000) : 0;

    $("#cur").textContent = fmt(cur);
    $("#dur").textContent = fmt(dur);
    $("#seek").value = progress;

    $("#miniCur").textContent = fmt(cur);
    $("#miniDur").textContent = fmt(dur);
    $("#miniSeek").value = progress;

    if (currentAudioSource === 'youtube') savePlayerState();
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
    const s = fn => () => { if(liveState.mode === 'listening') return; try { fn() } catch(e) { console.error("Media Session Action Error:", e) } };
    try {
        navigator.mediaSession.setActionHandler('play', s(togglePlay));
        navigator.mediaSession.setActionHandler('pause', s(togglePlay));
        navigator.mediaSession.setActionHandler('previoustrack', s(prev));
        navigator.mediaSession.setActionHandler('nexttrack', s(next));
    } catch(e) { console.error("Error setting Media Session handlers:", e) }
  }
}

function canUseAndroidBridge(){
    try { return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification); } catch(e){ return false; }
}

function updateAndroidNotification(){
    if (!canUseAndroidBridge()) return;
    const isPlaying = getPlaybackState() === 'playing';
    if (!currentTrack) { AndroidBridge.stopNotification(); return; }
    AndroidBridge.updateNotification( currentTrack.title || '', cleanAuthor(currentTrack.author || ''), currentTrack.thumb || '', !!isPlaying );
}

window.handleNativeControl = function(control){
    const action = String(control || '').toLowerCase();
    if(liveState.mode === 'listening') return;
    if(action === 'action_play' || action === 'action_pause') { togglePlay(); return }
    if(action === 'action_next') { next(); return }
    if(action === 'action_prev') { prev(); return }
};

/**
 * Inicializa los listeners para los controles del reproductor.
 */
function initPlayer() {
    audioPlayer = $("#audioPlayer");

    $("#npPlay")?.addEventListener("click", togglePlay);
    $("#miniPlay")?.addEventListener("click", togglePlay);
    $("#btnNext")?.addEventListener("click", next);
    $("#btnPrev")?.addEventListener("click", prev);
    $("#btnShuffle")?.addEventListener("click", toggleShuffle);
    $("#btnRepeat")?.addEventListener("click", cycleRepeat);
    $("#seek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    $("#miniSeek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    
    // Listeners para el reproductor de audio
    audioPlayer.addEventListener('play', () => refreshIndicators());
    audioPlayer.addEventListener('pause', () => refreshIndicators());
    audioPlayer.addEventListener('ended', () => { if (liveState.mode !== 'listening') next(); });

    // Listener para el selector de calidad
    $("#qualitySelector")?.addEventListener('change', (e) => {
        currentAudioFormat = e.target.value;
        const wasPlaying = getPlaybackState() === 'playing';
        loadArchiveTrack(qIdx, wasPlaying);
    });

    window.addEventListener('beforeunload', () => { if (currentAudioSource === 'youtube') savePlayerState(); });
}

// --- Lógica de persistencia (solo YouTube) ---
function savePlayerState() {
  if (!currentTrack || !ytPlayer || liveState.mode !== 'none' || currentAudioSource !== 'youtube') return;
  const state = { queue, queueType, qIdx, currentTime: ytPlayer.getCurrentTime() || 0, isShuffle, repeatMode, wasPlaying: getPlaybackState()==="playing", timestamp: Date.now() };
  try { localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state)); } catch (e) { console.error("Error saving player state:", e); }
}

function loadPlayerState() {
  const savedState = localStorage.getItem(PLAYER_STATE_KEY);
  if (!savedState) return null;
  try {
    const state = JSON.parse(savedState);
    if (Date.now() - (state.timestamp || 0) > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(PLAYER_STATE_KEY);
      return null;
    }
    return state;
  } catch (e) { return null; }
}

function restorePlayerState(state) {
  if (!state || !state.queue || state.qIdx < 0 || state.queueType === 'archive') return;
  const restore = () => {
    queue = state.queue; queueType = state.queueType; qIdx = state.qIdx; currentTrack = queue[qIdx];
    isShuffle = !!state.isShuffle; repeatMode = state.repeatMode || 'none';
    ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: state.currentTime || 0, suggestedQuality: "auto" });
    if (state.wasPlaying) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    updateUIOnTrackChange(); startTimer();
  };
  if (YT_READY) restore();
  else window.addEventListener('yt-ready', restore, { once: true });
}

// El resto de la lógica de transmisiones (startBroadcasting, stopBroadcasting, startListening, etc.) se mantiene igual
// ... (código de transmisiones omitido por brevedad, no tiene cambios)
async function startBroadcasting(name, genre) {
    try {
        const sessionId = await createLiveSession(name, genre);
        liveState.mode = 'broadcasting';
        liveState.sessionId = sessionId;
        showToast(`Iniciaste la transmisión: ${name}`);

        heartbeatInterval = setInterval(() => {
            if(liveState.sessionId) updateLiveSession(liveState.sessionId, { lastSeen: sy_fs().serverTimestamp() });
        }, 15000);

        window.addEventListener('beforeunload', stopBroadcasting);

        if (currentTrack) {
            updateLiveSession(sessionId, {
                currentTrack,
                isPlaying: getPlaybackState() === 'playing',
                currentTime: ytPlayer.getCurrentTime() || 0,
                stateChangeTimestamp: sy_fs().serverTimestamp()
            });
        }
        return true;
    } catch (e) {
        console.error("Error starting broadcast:", e);
        return false;
    }
}

async function stopBroadcasting() {
    if (liveState.mode !== 'broadcasting' || !liveState.sessionId) return;

    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    window.removeEventListener('beforeunload', stopBroadcasting);

    showToast("Transmisión finalizada.");
    await updateLiveSession(liveState.sessionId, { status: 'ended' });
    setTimeout(() => deleteLiveSession(liveState.sessionId), 2000);

    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;
    updateUIOnTrackChange();
}

function startListening(sessionId, sessionName) {
    if (sessionUnsubscribe) sessionUnsubscribe();

    liveState.mode = 'listening';
    liveState.sessionId = sessionId;
    document.body.classList.toggle('is-listening', true);
    showToast(`Conectado a la transmisión de ${sessionName}`);

    window.addEventListener('beforeunload', stopListening);

    sessionUnsubscribe = listenToSessionChanges(sessionId, handleSessionUpdate);
}

function stopListening() {
    if (liveState.mode !== 'listening') return;
    if (sessionUnsubscribe) {
        sessionUnsubscribe();
        sessionUnsubscribe = null;
    }
    window.removeEventListener('beforeunload', stopListening);

    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;
    document.body.classList.toggle('is-listening', false);
    ytPlayer.pauseVideo();
    showToast("Te desconectaste de la transmisión.");
    updateUIOnTrackChange();
}

function handleSessionUpdate(sessionData) {
    if (liveState.mode !== 'listening' || !YT_READY) return;

    if (!sessionData || sessionData.status === 'ended') {
        showToast("La transmisión finalizó.", true);
        stopListening();
        currentTrack = null;
        updateUIOnTrackChange();
        return;
    }

    liveState.sessionData = sessionData;
    const remoteTrack = sessionData.currentTrack;
    const remoteTime = sessionData.currentTime || 0;
    const remoteTimestamp = sessionData.stateChangeTimestamp;

    if (!remoteTrack) {
        ytPlayer.pauseVideo();
        currentTrack = null;
        updateUIOnTrackChange();
        return;
    }

    const isNewTrack = remoteTrack.id !== currentTrack?.id;

    if (isNewTrack) {
        currentTrack = remoteTrack;
        updateUIOnTrackChange();

        let startSeconds = remoteTime;
        if (remoteTimestamp && sessionData.isPlaying) {
            const elapsed = (Date.now() - remoteTimestamp.toDate().getTime()) / 1000;
            startSeconds += elapsed;
        }

        ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: Math.max(0, startSeconds) });
        if (sessionData.isPlaying) {
            setTimeout(() => ytPlayer.playVideo(), 1500);
        }

    } else {
        const isPlayingRemotely = sessionData.isPlaying;
        const isPlayingLocally = getPlaybackState() === 'playing';

        if (isPlayingRemotely && !isPlayingLocally) {
            ytPlayer.playVideo();
        } else if (!isPlayingRemotely && isPlayingLocally) {
            ytPlayer.pauseVideo();
        }
    }
}
