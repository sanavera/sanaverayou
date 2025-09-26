// Contiene la lógica del reproductor de YouTube, la cola de reproducción y los controles.
import {
  //  currentUser,
  //  sy_services,
    // createLiveSession,
   // updateLiveSession,
 //   deleteLiveSession,
  //  listenToSessionChanges,
  //  addSongToPlaylist,
   // createNewPlaylist
} from './firebase.js';

export let ytPlayer = null;
export let archivePlayer = null;
export let YT_READY = false;
let timer = null;
let mediaSessionHandlersSet = false;

// Estado de la cola y reproducción
export let queue = null;
export let queueType = null;
export let qIdx = -1;
export let currentTrack = null;
export let currentQueueTitle = "";

// Estado de los controles
export let isShuffle = false;
export let repeatMode = 'none'; // 'none', 'one', 'all'

const PLAYER_STATE_KEY = "sy_player_state_v2";

// Estado de Transmisión en Vivo
let liveState = {
    mode: 'none',
    sessionId: null,
    sessionData: null,
};
let sessionUnsubscribe = null;
let heartbeatInterval = null;

export function loadYTApi() {
    if (window.YT && window.YT.Player) {
        onYouTubeIframeAPIReady();
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
        width: 300,
        height: 150,
        videoId: "",
        playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            playsinline: 1
        },
        events: {
            onReady: () => {
                YT_READY = true;
                window.dispatchEvent(new Event('yt-ready'));
            },
            onStateChange: (e) => {
                const state = e.data;
                if (state === YT.PlayerState.ENDED && liveState.mode !== 'listening') {
                    next();
                }
                if ('mediaSession' in navigator) {
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
    if (!YT_READY || !ytPlayer) return "none";
    const state = ytPlayer.getPlayerState();
    return (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) ? "playing" : (state === YT.PlayerState.PAUSED) ? "paused" : "none";
}

function savePlayerState() {
    if (!currentTrack || liveState.mode !== 'none') return;
    let currentTime = 0;
    if (currentTrack.source === 'archive') {
        currentTime = archivePlayer.currentTime || 0;
    } else if (ytPlayer) {
        currentTime = ytPlayer.getCurrentTime() || 0;
    }
    const state = {
        queue,
        queueType,
        qIdx,
        currentTime,
        isShuffle,
        repeatMode,
        wasPlaying: getPlaybackState() === "playing",
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Error saving player state:", e);
    }
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
    } catch (e) {
        console.error("Error loading player state:", e);
        return null;
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

        if (currentTrack.source === 'archive') {
            archivePlayer.src = currentTrack.urls?.mp3 || '';
            archivePlayer.currentTime = state.currentTime || 0;
            if (state.wasPlaying) archivePlayer.play();
        } else {
            ytPlayer.loadVideoById({
                videoId: currentTrack.id,
                startSeconds: state.currentTime || 0
            });
            ytPlayer.setVolume(100);
            if (state.wasPlaying) ytPlayer.playVideo();
            else ytPlayer.pauseVideo();
        }
        updateUIOnTrackChange();
        startTimer();
    };

    if (YT_READY) restore();
    else window.addEventListener('yt-ready', restore, {
        once: true
    });
}

export function setQueue(srcArr, type, idx) {
    if (liveState.mode === 'listening') return;
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

export function playCurrent(autoplay = false) {
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

    const startPlayback = () => {
        if (currentTrack.source === 'archive') {
            archivePlayer.play().catch(e => console.error("Error al reproducir audio de Archive:", e));
        } else {
            ytPlayer.playVideo();
        }
    };

    if (currentTrack.source === 'archive') {
        if (YT_READY) ytPlayer.stopVideo();
        if (!currentTrack.urls?.mp3) {
            next();
            return;
        }
        archivePlayer.src = currentTrack.urls.mp3;
        archivePlayer.load();
    } else {
        archivePlayer.pause();
        archivePlayer.src = "";
        if (!YT_READY || !currentTrack.id) {
            next();
            return;
        }
        ytPlayer.loadVideoById({
            videoId: currentTrack.id,
            startSeconds: 0,
            suggestedQuality: "auto"
        });
    }

    if (autoplay) {
        if (liveState.mode === 'broadcasting') {
            setTimeout(startPlayback, 1000);
        } else {
            startPlayback();
        }
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
        currentTrack = null;
        if (YT_READY) ytPlayer.stopVideo();
        if (archivePlayer) archivePlayer.pause();
        if (liveState.mode === 'broadcasting') {
            updateLiveSession(liveState.sessionId, {
                isPlaying: false,
                currentTrack: null
            });
        }
        updateUIOnTrackChange();
    }
}

export function prev() {
    if (liveState.mode === 'listening' || !queue) return;
    const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : ytPlayer.getCurrentTime();

    if (currentTime > 3) {
        if (currentTrack.source === 'archive') archivePlayer.currentTime = 0;
        else ytPlayer.seekTo(0, true);
        if (liveState.mode === 'broadcasting') {
            updateLiveSession(liveState.sessionId, {
                currentTime: 0,
                stateChangeTimestamp: sy_services().serverTimestamp()
            });
        }
    } else if (qIdx - 1 >= 0) {
        qIdx--;
        playCurrent(true);
    }
}

function toggleShuffle() {
    if (liveState.mode !== 'none') return;
    isShuffle = !isShuffle;
    updateControlStates();
    if (currentTrack) {
        let currentQueueSource = queue || [];
        const originalIndex = currentQueueSource.findIndex(t => t.id === currentTrack.id);
        setQueue(currentQueueSource, queueType, Math.max(0, originalIndex));
        if (document.getElementById("queuePanel") && !document.getElementById("queuePanel").classList.contains('hide')) {
            renderQueue(queue, currentQueueTitle);
        }
    }
}

function cycleRepeat() {
    if (liveState.mode !== 'none') return;
    const modes = ['none', 'all', 'one'];
    const currentModeIdx = modes.indexOf(repeatMode);
    repeatMode = modes[(currentModeIdx + 1) % modes.length];
    updateControlStates();
}

function seekToFrac(frac) {
    if (liveState.mode !== 'none' || !currentTrack) return;
    if (currentTrack.source === 'archive') {
        if (!isNaN(archivePlayer.duration)) archivePlayer.currentTime = frac * archivePlayer.duration;
    } else {
        if (!YT_READY) return;
        const duration = ytPlayer.getDuration() || 0;
        ytPlayer.seekTo(frac * duration, true);
    }
}

function startTimer() {
    stopTimer();
    timer = setInterval(() => {
        if (!currentTrack || (liveState.mode === 'listening')) return;
        let cur = 0,
            dur = 0;
        if (currentTrack.source === 'archive') {
            cur = archivePlayer.currentTime || 0;
            dur = archivePlayer.duration || 0;
        } else if (YT_READY) {
            cur = ytPlayer.getCurrentTime() || 0;
            dur = ytPlayer.getDuration() || 0;
        }
        const progress = dur ? Math.floor((cur / dur) * 1000) : 0;
        document.getElementById("cur").textContent = fmt(cur);
        document.getElementById("dur").textContent = fmt(dur);
        document.getElementById("seek").value = progress;
        document.getElementById("miniCur").textContent = fmt(cur);
        document.getElementById("miniDur").textContent = fmt(dur);
        document.getElementById("miniSeek").value = progress;
        if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
            navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
                position: cur
            });
        }
        savePlayerState();
    }, 500);
}

function stopTimer() {
    clearInterval(timer);
    timer = null;
}

function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'Reproduciendo',
            artist: cleanAuthor(track.author) || '—',
            album: queueType === 'playlist' ? (communityPlaylists.find(p => p.id === viewingPlaylistId)?.name || '') : currentQueueTitle,
            artwork: [{
                src: track.thumb,
                sizes: '512x512',
                type: 'image/jpeg'
            }]
        });
    } catch (e) {
        console.error("Media Session Error:", e)
    }

    if (!mediaSessionHandlersSet) {
        mediaSessionHandlersSet = true;
        const s = fn => () => {
            if (liveState.mode === 'listening') return;
            try {
                fn()
            } catch (e) {
                console.error("Media Session Action Error:", e)
            }
        };
        try {
            navigator.mediaSession.setActionHandler('play', s(togglePlay));
            navigator.mediaSession.setActionHandler('pause', s(togglePlay));
            navigator.mediaSession.setActionHandler('previoustrack', s(prev));
            navigator.mediaSession.setActionHandler('nexttrack', s(next));
            navigator.mediaSession.setActionHandler('seekto', s(d => {
                if (typeof d.seekTime === 'number') seekToFrac(d.seekTime / (currentTrack.source === 'archive' ? archivePlayer.duration : ytPlayer.getDuration()));
            }));
        } catch (e) {
            console.error("Error setting Media Session handlers:", e)
        }
    }
}

function canUseAndroidBridge() {
    try {
        return !!(window.AndroidBridge && AndroidBridge.updateNotification && AndroidBridge.stopNotification);
    } catch (e) {
        return false;
    }
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
    if (action === 'action_play' || action === 'action_pause') {
        togglePlay();
        return
    }
    if (action === 'action_next') {
        next();
        return
    }
    if (action === 'action_prev') {
        prev();
        return
    }
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
    const creator = currentUser.displayName || currentUser.email.split('@')[0];
    const success = await createNewPlaylist(currentQueueTitle, creator, queue);
    if (success) {
        showToast(`Álbum "${currentQueueTitle}" guardado en 'Mis Playlists'.`);
        const btnSave = document.getElementById("btnSaveAlbum");
        if (btnSave) btnSave.classList.add('hide');
    }
}


export function initPlayer() {
    initAudioPlayers();
    document.getElementById("npPlay")?.addEventListener("click", togglePlay);
    document.getElementById("miniPlay")?.addEventListener("click", togglePlay);
    document.getElementById("btnNext")?.addEventListener("click", next);
    document.getElementById("btnPrev")?.addEventListener("click", prev);
    document.getElementById("btnShuffle")?.addEventListener("click", toggleShuffle);
    document.getElementById("btnRepeat")?.addEventListener("click", cycleRepeat);
    document.getElementById("seek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    document.getElementById("miniSeek")?.addEventListener("input", e => seekToFrac(parseInt(e.target.value, 10) / 1000));
    document.getElementById("btnSaveAlbum")?.addEventListener('click', saveCurrentArchiveAlbumAsPlaylist);

    const savedState = loadPlayerState();
    if (savedState) restorePlayerState(savedState);

    window.addEventListener('beforeunload', savePlayerState);
    window.addEventListener('beforeunload', function() {
        if (canUseAndroidBridge()) AndroidBridge.stopNotification();
    });
}

// --- LÓGICA DE TRANSMISIONES ---

function setPlayerControlsDisabled(disabled) {
    const controls = ['#npPlay', '#miniPlay', '#btnNext', '#btnPrev', '#btnShuffle', '#btnRepeat', '#seek', '#miniSeek'];
    controls.forEach(sel => {
        const el = document.querySelector(sel);
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
        heartbeatInterval = setInterval(() => {
            if (liveState.sessionId) updateLiveSession(liveState.sessionId, {
                lastSeen: sy_services().serverTimestamp()
            });
        }, 15000);
        window.addEventListener('beforeunload', stopBroadcasting);
        if (currentTrack) {
            const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : ytPlayer.getCurrentTime();
            updateLiveSession(sessionId, {
                currentTrack,
                isPlaying: getPlaybackState() === 'playing',
                currentTime: currentTime || 0,
                stateChangeTimestamp: sy_services().serverTimestamp()
            });
        }
        updateUIOnTrackChange();
        return true;
    } catch (e) {
        console.error("Error starting broadcast:", e);
        return false;
    }
}

export async function stopBroadcasting() {
    if (liveState.mode !== 'broadcasting' || !liveState.sessionId) return;
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    window.removeEventListener('beforeunload', stopBroadcasting);
    showToast("Transmisión finalizada.");
    await updateLiveSession(liveState.sessionId, {
        status: 'ended'
    });
    setTimeout(() => deleteLiveSession(liveState.sessionId), 2000);
    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;
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
    updateUIOnTrackChange();
}

function handleSessionUpdate(sessionData) {
    if (liveState.mode !== 'listening') return;

    if (!sessionData || sessionData.status === 'ended') {
        showToast("La transmisión finalizó.", true);
        stopListening();
        currentTrack = null;
        updateUIOnTrackChange();
        return;
    }

    liveState.sessionData = sessionData;
    const remoteTrack = sessionData.currentTrack;

    if (!remoteTrack) {
        if (YT_READY) ytPlayer.pauseVideo();
        if (archivePlayer) archivePlayer.pause();
        currentTrack = null;
        updateUIOnTrackChange();
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
            ytPlayer.loadVideoById({
                videoId: currentTrack.id,
                startSeconds: Math.max(0, startSeconds)
            });
            if (sessionData.isPlaying) {
                setTimeout(() => ytPlayer.playVideo(), 500);
            }
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
