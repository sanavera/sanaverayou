// Contiene la lógica del reproductor de YouTube, la cola de reproducción y los controles.
import { currentUser, sy_services, createLiveSession, updateLiveSession, deleteLiveSession, listenToSessionChanges, communityPlaylists, isFav } from './firebase.js';
import { $, fmt, cleanAuthor, showToast, favIconSvg, dotsSvg, switchView, showAuthModal } from './main.js';

// --- Estado del Reproductor ---
export let ytPlayer = null;
export let archivePlayer = null;
export let YT_READY = false;
let timer = null;
let mediaSessionHandlersSet = false;

// --- Estado de la Cola y Reproducción ---
export let queue = null;
export let queueType = null;
export let qIdx = -1;
export let currentTrack = null;
export let currentQueueTitle = "";

// --- Estado de los Controles ---
export let isShuffle = false;
export let repeatMode = 'none'; // 'none', 'one', 'all'

const PLAYER_STATE_KEY = "sy_player_state_v2";

// --- Estado de Transmisión en Vivo ---
export let liveState = {
    mode: 'none', // 'none', 'broadcasting', 'listening'
    sessionId: null,
    sessionData: null,
};
let sessionUnsubscribe = null;
let heartbeatInterval = null;

// =======================================================
// INICIALIZACIÓN Y MANEJO DE ESTADO
// =======================================================

export function loadYTApi() {
    if (window.YT && window.YT.Player) {
        window.onYouTubeIframeAPIReady();
        return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
}

function initAudioPlayers() {
    archivePlayer = document.createElement('audio');
    archivePlayer.id = 'archivePlayer';
    archivePlayer.addEventListener('ended', () => {
        if (liveState.mode !== 'listening' && repeatMode !== 'one') next();
        else if (repeatMode === 'one') playCurrent(true);
    });
    const onStateChange = () => {
        refreshIndicators();
        updateAndroidNotification();
    };
    archivePlayer.addEventListener('play', onStateChange);
    archivePlayer.addEventListener('pause', onStateChange);
}

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player("player", {
        width: 1, height: 1, videoId: "",
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
        events: {
            onReady: () => {
                YT_READY = true;
                window.dispatchEvent(new Event('yt-ready'));
            },
            onStateChange: (e) => {
                if (e.data === YT.PlayerState.ENDED && liveState.mode !== 'listening') {
                    next();
                }
                if ('mediaSession' in navigator) {
                    const state = e.data;
                    navigator.mediaSession.playbackState = (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? 'playing' : (state === YT.PlayerState.PAUSED ? 'paused' : 'none');
                }
                refreshIndicators();
                updateAndroidNotification();
            }
        }
    });
};

export function getPlaybackState() {
    if (!currentTrack) return "none";
    if (currentTrack.source === 'archive') {
        if (!archivePlayer) return "none";
        return archivePlayer.paused ? "paused" : "playing";
    }
    if (!YT_READY || !ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return "none";
    const state = ytPlayer.getPlayerState();
    return (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? "playing" : (state === YT.PlayerState.PAUSED) ? "paused" : "none";
}

function savePlayerState() {
    if (!currentTrack || liveState.mode !== 'none') return;
    let currentTime = 0;
    if (currentTrack.source === 'archive') {
        currentTime = archivePlayer.currentTime || 0;
    } else if (YT_READY && typeof ytPlayer.getCurrentTime === 'function') {
        currentTime = ytPlayer.getCurrentTime() || 0;
    }
    const state = {
        queue, queueType, qIdx, currentTime, isShuffle, repeatMode,
        wasPlaying: getPlaybackState() === "playing",
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Error saving player state:", e);
    }
}

function restorePlayerState(state) {
    if (!state || !state.queue || state.qIdx < 0) return;
    const restore = () => {
        queue = state.queue;
        queueType = state.queueType;
        qIdx = state.qIdx;
        currentTrack = queue[qIdx];
        isShuffle = !!state.isShuffle;
        repeatMode = state.repeatMode || 'none';

        setQueue(queue, queueType, qIdx);
        playCurrent(state.wasPlaying, state.currentTime);
        if(!state.wasPlaying){
             setTimeout(() => {
                if (currentTrack.source === 'archive') { archivePlayer.pause(); }
                else if (YT_READY) { ytPlayer.pauseVideo(); }
            }, 200);
        }
    };

    if (YT_READY) restore();
    else window.addEventListener('yt-ready', restore, { once: true });
}

export function initPlayer() {
    initAudioPlayers();
    $("#npPlay")?.addEventListener("click", togglePlay);
    $("#miniPlay")?.addEventListener("click", togglePlay);
    $("#btnNext")?.addEventListener("click", next);
    $("#btnPrev")?.addEventListener("click", prev);
    $("#btnShuffle")?.addEventListener("click", toggleShuffle);
    $("#btnRepeat")?.addEventListener("click", cycleRepeat);
    $("#seek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    $("#miniSeek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    $("#btnSaveAlbum")?.addEventListener('click', saveCurrentArchiveAlbumAsPlaylist);

    const savedState = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || "null");
    if (savedState) restorePlayerState(savedState);

    window.addEventListener('beforeunload', () => {
        savePlayerState();
        if (canUseAndroidBridge()) AndroidBridge.stopNotification();
    });
}

// =======================================================
// LÓGICA DE REPRODUCCIÓN
// =======================================================

export function setQueue(srcArr, type, idx) {
    if (liveState.mode === 'listening') return;
    let finalSrc = [...srcArr];
    queueType = type;
    
    if (isShuffle) {
        const currentItem = finalSrc[idx];
        const others = finalSrc.filter((_, index) => index !== idx);
        const shuffledOthers = others.sort(() => Math.random() - 0.5);
        finalSrc = [currentItem, ...shuffledOthers];
        idx = 0;
    }
    queue = finalSrc;
    qIdx = idx;
}

export function playCurrent(autoplay = false, startTime = 0) {
    if (liveState.mode === 'listening' || !queue || qIdx < 0 || qIdx >= queue.length) return;

    currentTrack = queue[qIdx];

    if (liveState.mode === 'broadcasting') {
        updateLiveSession(liveState.sessionId, {
            currentTrack: currentTrack,
            isPlaying: autoplay,
            currentTime: 0,
            stateChangeTimestamp: sy_services().serverTimestamp()
        });
    }

    if (currentTrack.source === 'archive') {
        if (YT_READY) ytPlayer.stopVideo();
        if (!currentTrack.urls?.mp3) { next(); return; }
        archivePlayer.src = currentTrack.urls.mp3;
        archivePlayer.currentTime = startTime;
        if(autoplay) archivePlayer.play().catch(e => console.error("Playback error:", e));
    } else {
        if(archivePlayer) archivePlayer.pause();
        if (!YT_READY || !currentTrack.id) { next(); return; }
        ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: startTime });
        if(autoplay) ytPlayer.playVideo();
    }
    
    startTimer();
    updateUIOnTrackChange();
}

export function togglePlay() {
    if (liveState.mode === 'listening' || !currentTrack) return;
    const isCurrentlyPlaying = getPlaybackState() === 'playing';

    if (currentTrack.source === 'archive') {
        isCurrentlyPlaying ? archivePlayer.pause() : archivePlayer.play();
    } else {
        if (!YT_READY) return;
        isCurrentlyPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }

    if (liveState.mode === 'broadcasting') {
        const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : ytPlayer.getCurrentTime();
        updateLiveSession(liveState.sessionId, {
            isPlaying: !isCurrentlyPlaying,
            currentTime: currentTime || 0,
            stateChangeTimestamp: sy_services().serverTimestamp()
        });
    }
}

function getNextIndex() {
    if (!queue) return -1;
    if (repeatMode === 'one') return qIdx;
    let nextIdx = qIdx + 1;
    if (nextIdx >= queue.length) {
        return (repeatMode === 'all') ? 0 : -1;
    }
    return nextIdx;
}

export function next() {
    if (liveState.mode === 'listening') return;
    const nextIdx = getNextIndex();
    if (nextIdx !== -1) {
        qIdx = nextIdx;
        playCurrent(true);
    } else {
        stopPlayback();
    }
}

export function prev() {
    if (liveState.mode === 'listening' || !queue) return;
    const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : (ytPlayer?.getCurrentTime() || 0);

    if (currentTime > 3) {
        seekToFrac(0);
        if (liveState.mode === 'broadcasting') {
            updateLiveSession(liveState.sessionId, { currentTime: 0, stateChangeTimestamp: sy_services().serverTimestamp() });
        }
    } else if (qIdx - 1 >= 0) {
        qIdx--;
        playCurrent(true);
    }
}

function stopPlayback() {
     currentTrack = null;
    if (YT_READY) ytPlayer.stopVideo();
    if (archivePlayer) archivePlayer.pause();
    if (liveState.mode === 'broadcasting') {
        updateLiveSession(liveState.sessionId, { isPlaying: false, currentTrack: null });
    }
    updateUIOnTrackChange();
    stopTimer();
}

// =======================================================
// CONTROLES DEL REPRODUCTOR (SHUFFLE, REPEAT, SEEK)
// =======================================================

function toggleShuffle() {
    if (liveState.mode !== 'none') return;
    isShuffle = !isShuffle;
    updateControlStates();
    if (currentTrack) {
        const originalIndex = queue.findIndex(t => t.id === currentTrack.id);
        setQueue(queue, queueType, Math.max(0, originalIndex));
        if ($("#queuePanel") && !$("#queuePanel").classList.contains('hide')) {
            renderQueue(queue, currentQueueTitle);
        }
    }
    showToast(`Modo aleatorio ${isShuffle ? 'activado' : 'desactivado'}.`);
}

function cycleRepeat() {
    if (liveState.mode !== 'none') return;
    const modes = ['none', 'all', 'one'];
    const currentModeIdx = modes.indexOf(repeatMode);
    repeatMode = modes[(currentModeIdx + 1) % modes.length];
    updateControlStates();
    const modeTexts = { none: 'No repetir', all: 'Repetir todo', one: 'Repetir canción' };
    showToast(modeTexts[repeatMode]);
}

function seekToFrac(frac) {
    if (liveState.mode === 'listening' || !currentTrack) return;
    if (currentTrack.source === 'archive') {
        if (!isNaN(archivePlayer.duration)) archivePlayer.currentTime = frac * archivePlayer.duration;
    } else {
        if (!YT_READY || typeof ytPlayer.getDuration !== 'function') return;
        const duration = ytPlayer.getDuration() || 0;
        ytPlayer.seekTo(frac * duration, true);
    }
}

// =======================================================
// ACTUALIZACIÓN DE UI Y TIMERS
// =======================================================

function startTimer() {
    stopTimer();
    timer = setInterval(() => {
        if (!currentTrack || (liveState.mode === 'listening')) return;
        let cur = 0, dur = 0;
        if (currentTrack.source === 'archive') {
            cur = archivePlayer.currentTime || 0;
            dur = archivePlayer.duration || 0;
        } else if (YT_READY && typeof ytPlayer.getCurrentTime === 'function') {
            cur = ytPlayer.getCurrentTime() || 0;
            dur = ytPlayer.getDuration() || 0;
        }
        if(isNaN(dur)) dur = 0;
        
        const progress = dur ? Math.floor((cur / dur) * 1000) : 0;
        $("#cur").textContent = fmt(cur);
        $("#dur").textContent = fmt(dur);
        $("#seek").value = progress;
        $("#miniCur").textContent = fmt(cur);
        $("#miniDur").textContent = fmt(dur);
        $("#miniSeek").value = progress;

        if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
            try {
                navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: cur });
            } catch(e) { /* Ignore errors */ }
        }
        
    }, 500);
}

function stopTimer() {
    clearInterval(timer);
    timer = null;
}

export function updateUIOnTrackChange() {
    if (currentTrack) {
        $("#seekDock").classList.add("show");
        $("#npTitle").textContent = currentTrack.title;
        $("#npSub").textContent = cleanAuthor(currentTrack.author);
        $("#npHero").style.backgroundImage = `url(${currentTrack.thumb})`;
        $("#miniTitle").textContent = currentTrack.title;
        $("#miniAuthor").textContent = cleanAuthor(currentTrack.author);
        $("#miniThumb").src = currentTrack.thumb;
        document.title = `${currentTrack.title} - SanaveraYou`;

        updateMediaSession(currentTrack);
        updateAndroidNotification();
        
        const isArchiveAlbum = queueType === 'archive_album';
        $("#btnSaveAlbum").classList.toggle('hide', !isArchiveAlbum);

    } else {
        $("#seekDock").classList.remove("show");
        $("#npTitle").textContent = "Elegí una canción";
        $("#npSub").textContent = "-";
        $("#npHero").style.backgroundImage = 'none';
        $("#queuePanel").classList.add("hide");
        document.title = "SanaveraYou Pro";
    }
    
    refreshIndicators();
    updateControlStates();
}

export function refreshIndicators() {
    const isPlaying = getPlaybackState() === 'playing';
    $("#npPlay").classList.toggle("playing", isPlaying);
    $("#miniPlay").classList.toggle("playing", isPlaying);

    document.querySelectorAll(".result-item, .fav-item, .queue-item").forEach(el => {
        const isCurrent = el.dataset.trackId === currentTrack?.id;
        el.classList.toggle("is-playing", isCurrent);
        const playBtn = el.querySelector(".card-play");
        if(playBtn) {
            playBtn.classList.toggle("playing", isCurrent && isPlaying);
        }
    });
    
    document.querySelectorAll('.fav-btn').forEach(btn => {
        const trackId = btn.closest('[data-track-id]')?.dataset.trackId;
        if(trackId) btn.innerHTML = favIconSvg(isFav(trackId));
    });
}

export function updateControlStates() {
    $("#btnShuffle")?.classList.toggle('active', isShuffle);
    const repeatBtn = $("#btnRepeat");
    if(repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'none');
        repeatBtn.dataset.mode = repeatMode; // Para styling a futuro
    }
}

// =======================================================
// INTEGRACIÓN CON SISTEMA (MEDIA SESSION, ANDROID)
// =======================================================

function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Reproduciendo',
            artist: cleanAuthor(track.author) || '—',
            album: queueType === 'playlist' ? (communityPlaylists.find(p => p.id === window.viewingPlaylistId)?.name || currentQueueTitle) : currentQueueTitle,
            artwork: [{ src: track.thumb, sizes: '512x512', type: 'image/jpeg' }]
        });
    } catch (e) { console.error("Media Session Error:", e) }

    if (!mediaSessionHandlersSet) {
        mediaSessionHandlersSet = true;
        const s = fn => () => { if (liveState.mode === 'listening') return; try { fn() } catch (e) { console.error("Media Session Action Error:", e) } };
        try {
            navigator.mediaSession.setActionHandler('play', s(togglePlay));
            navigator.mediaSession.setActionHandler('pause', s(togglePlay));
            navigator.mediaSession.setActionHandler('previoustrack', s(prev));
            navigator.mediaSession.setActionHandler('nexttrack', s(next));
            navigator.mediaSession.setActionHandler('seekto', s(d => {
                if (typeof d.seekTime === 'number') seekToFrac(d.seekTime / (currentTrack.source === 'archive' ? archivePlayer.duration : ytPlayer.getDuration()));
            }));
        } catch (e) { console.error("Error setting Media Session handlers:", e) }
    }
}

function canUseAndroidBridge() {
    try { return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification); } 
    catch (e) { return false; }
}

function updateAndroidNotification() {
    if (!canUseAndroidBridge()) return;
    const isPlaying = getPlaybackState() === 'playing';
    if (!currentTrack) {
        AndroidBridge.stopNotification();
        return;
    }
    AndroidBridge.updateNotification(currentTrack.title || '', cleanAuthor(currentTrack.author || ''), currentTrack.thumb || '', !!isPlaying);
}

window.handleNativeControl = function(control) {
    const action = String(control || '').toLowerCase();
    if (liveState.mode === 'listening') return;
    if (action === 'action_play' || action === 'action_pause') togglePlay();
    if (action === 'action_next') next();
    if (action === 'action_prev') prev();
};

async function saveCurrentArchiveAlbumAsPlaylist() {
    if (queueType !== 'archive_album' || !queue || queue.length === 0) {
        showToast("No hay un álbum de Archive.org para guardar.", true);
        return;
    }
    if (!currentUser) {
        showToast("Inicia sesión para guardar álbumes como playlists.", true);
        showAuthModal('login');
        return;
    }
    const { createNewPlaylist } = await import('./firebase.js');
    const creator = currentUser.displayName || currentUser.email.split('@')[0];
    const success = await createNewPlaylist(currentQueueTitle, creator, queue);
    if (success) {
        showToast(`Álbum "${currentQueueTitle}" guardado en 'Mis Playlists'.`);
        const btnSave = $("#btnSaveAlbum");
        if (btnSave) btnSave.classList.add('hide');
    }
}

// =======================================================
// LÓGICA DE LA COLA DE REPRODUCCIÓN (MOVIDA DESDE PLAYLISTS.JS)
// =======================================================

export function renderQueue(queueItems, title) {
    const panel = $("#queuePanel");
    currentQueueTitle = title;
    if (!panel) return;
    panel.classList.remove("hide");
    panel.innerHTML = `<header class="section-head"><h3 id="queueTitle"></h3></header><ul id="queueList" class="fav-list"></ul>`;
    panel.querySelector('#queueTitle').textContent = title;
    const ul = $("#queueList");
    ul.innerHTML = "";
    (queueItems || []).forEach((t, i) => {
        if (!t) return;
        const li = document.createElement("li");
        li.className = "queue-item";
        li.dataset.trackId = t.id;
        const isResolved = !!(t.id || t.urls);
        li.innerHTML = `
          <div class="thumb-wrap">
            <img class="thumb" src="${t.thumb}" alt="">
            ${isResolved ? `<button class="card-play" title="Play"><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>` : `<div class="pending-indicator">Pendiente</div>`}
          </div>
          <div class="meta">
            <div class="title-line"><span class="title-text">${t.title}</span><span class="eq"><span></span><span></span><span></span></span></div>
            <div class="subtitle">${cleanAuthor(t.author) || ""}</div>
          </div>
          <div class="actions">
             <button class="icon-btn fav-btn" title="Agregar/Quitar Favorito">${favIconSvg(isFav(t.id))}</button>
             <button class="icon-btn more" title="Opciones" ${!isResolved ? 'disabled' : ''}>${dotsSvg()}</button>
          </div>`;
        li.onclick = (e) => {
            if (e.target.closest(".more,.fav-btn,.card-play") || !isResolved) return;
            qIdx = i;
            playCurrent(true);
        };
        li.querySelector(".card-play")?.addEventListener("click", (e) => {
            e.stopPropagation();
            qIdx = i;
            playCurrent(true);
        });
        ul.appendChild(li);
    });
    refreshIndicators();
}

// =======================================================
// LÓGICA DE TRANSMISIONES
// =======================================================

function setPlayerControlsDisabled(disabled) {
    const controls = ['#npPlay', '#miniPlay', '#btnNext', '#btnPrev', '#btnShuffle', '#btnRepeat', '#seek', '#miniSeek'];
    controls.forEach(sel => {
        const el = $(sel);
        if (el) el.disabled = disabled;
    });
    document.body.classList.toggle('is-listening', disabled);
}

export async function startBroadcasting(name, genre) {
    try {
        const sessionId = await createLiveSession(name, genre);
        liveState.mode = 'broadcasting';
        liveState.sessionId = sessionId;
        showToast(`Iniciaste la transmisión: ${name}`);
        
        $('#broadcastWrapper').classList.add('broadcasting');
        $('#broadcastWrapper .broadcast-label').textContent = 'Transmitiendo';

        heartbeatInterval = setInterval(() => {
            if (liveState.sessionId) updateLiveSession(liveState.sessionId, { lastSeen: sy_services().serverTimestamp() });
        }, 15000);

        window.addEventListener('beforeunload', stopBroadcasting);

        if (currentTrack) {
            const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : (ytPlayer?.getCurrentTime() || 0);
            updateLiveSession(sessionId, {
                currentTrack, isPlaying: getPlaybackState() === 'playing',
                currentTime: currentTime || 0,
                stateChangeTimestamp: sy_services().serverTimestamp()
            });
        }
        updateUIOnTrackChange();
        return true;
    } catch (e) {
        console.error("Error starting broadcast:", e);
        showToast("No se pudo iniciar la transmisión.", true);
        return false;
    }
}

export async function stopBroadcasting() {
    if (liveState.mode !== 'broadcasting' || !liveState.sessionId) return;
    const sid = liveState.sessionId;
    
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    window.removeEventListener('beforeunload', stopBroadcasting);
    
    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;

    $('#broadcastWrapper').classList.remove('broadcasting');

    await updateLiveSession(sid, { status: 'ended' });
    setTimeout(() => deleteLiveSession(sid), 5000); // Dar tiempo para que los oyentes vean el final

    showToast("Transmisión finalizada.");
    updateUIOnTrackChange();
}

export function startListening(sessionId, sessionName) {
    if (sessionUnsubscribe) sessionUnsubscribe();
    liveState.mode = 'listening';
    liveState.sessionId = sessionId;
    setPlayerControlsDisabled(true);
    showToast(`Conectado a la transmisión de ${sessionName}`);
    window.addEventListener('beforeunload', stopListening);
    sessionUnsubscribe = listenToSessionChanges(sessionId, handleSessionUpdate);
}

export function stopListening() {
    if (liveState.mode !== 'listening') return;
    if (sessionUnsubscribe) {
        sessionUnsubscribe();
        sessionUnsubscribe = null;
    }
    window.removeEventListener('beforeunload', stopListening);
    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;
    setPlayerControlsDisabled(false);
    
    if (YT_READY) ytPlayer.pauseVideo();
    if (archivePlayer) archivePlayer.pause();
    
    showToast("Te desconectaste de la transmisión.");
    
    // Restaurar la última canción que se estaba escuchando si existe
    const savedState = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || "null");
    if(savedState && savedState.currentTrack) {
       restorePlayerState(savedState);
    } else {
       stopPlayback();
    }
}

function handleSessionUpdate(sessionData) {
    if (liveState.mode !== 'listening') return;

    if (!sessionData || sessionData.status === 'ended') {
        showToast("La transmisión finalizó.", true);
        stopListening();
        return;
    }

    liveState.sessionData = sessionData;
    const remoteTrack = sessionData.currentTrack;

    if (!remoteTrack) {
        if(currentTrack) stopPlayback();
        return;
    }

    const isNewTrack = remoteTrack.id !== currentTrack?.id;

    if (isNewTrack) {
        currentTrack = remoteTrack;
        updateUIOnTrackChange();
        let startSeconds = sessionData.currentTime || 0;
        if (sessionData.stateChangeTimestamp && sessionData.isPlaying) {
            const elapsed = (Date.now() - sessionData.stateChangeTimestamp.toDate().getTime()) / 1000;
            startSeconds += elapsed;
        }
        if (currentTrack.source === 'archive') {
            if (YT_READY) ytPlayer.stopVideo();
            archivePlayer.src = currentTrack.urls.mp3;
            archivePlayer.currentTime = Math.max(0, startSeconds);
            if (sessionData.isPlaying) archivePlayer.play();
        } else {
            if (archivePlayer) archivePlayer.pause();
            ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: Math.max(0, startSeconds) });
            if (sessionData.isPlaying) setTimeout(() => ytPlayer.playVideo(), 500);
        }
    } else {
        const isPlayingRemotely = sessionData.isPlaying;
        const isPlayingLocally = getPlaybackState() === 'playing';
        if (isPlayingRemotely !== isPlayingLocally) {
            if (currentTrack.source === 'archive') {
                isPlayingRemotely ? archivePlayer.play() : archivePlayer.pause();
            } else {
                isPlayingRemotely ? ytPlayer.playVideo() : ytPlayer.pauseVideo();
            }
        }
    }
}
