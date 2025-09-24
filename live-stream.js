import { showToast, updateUIOnTrackChange } from './main.js';
import { getPlaybackState, playCurrent } from './reproductor.js';
import { getSession } from './firebase.js';

let liveState = {
    mode: 'none',
    sessionId: null,
    sessionData: null,
};
let sessionUnsubscribe = null;
let heartbeatInterval = null;

function canActivate(feature) {
    if (getSession().status === "guest") {
        showAlert("Función disponible para usuarios registrados. Abrí el botón de la esquina y registrate o iniciá sesión.");
        return false;
    }
    return true;
}

function showAlert(msg) {
    const alertModal = document.getElementById("alertModal");
    const alertMsg = document.getElementById("alertMsg");
    if (alertModal && alertMsg) {
        alertMsg.textContent = msg;
        alertModal.classList.add("show");
    }
}

function setPlayerControlsDisabled(disabled) {
    const controls = ['#npPlay', '#miniPlay', '#btnNext', '#btnPrev', '#btnShuffle', '#btnRepeat', '#seek', '#miniSeek'];
    controls.forEach(sel => {
        const el = $(sel); if (el) el.disabled = disabled;
    });
    document.body.classList.toggle('is-listening', disabled);
}

async function startBroadcasting(name, genre) {
    if (!canActivate('cast')) return false;
    
    try {
        const sessionId = await window.firebase.createLiveSession(name, genre);
        liveState.mode = 'broadcasting';
        liveState.sessionId = sessionId;
        showToast(`Iniciaste la transmisi\u00f3n: ${name}`);
        heartbeatInterval = setInterval(async () => {
            if(liveState.sessionId) await window.firebase.updateLiveSession(liveState.sessionId, { lastSeen: window.firebase.serverTimestamp() });
        }, 15000);
        window.addEventListener('beforeunload', stopBroadcasting);
        if (currentTrack) {
            const currentTime = currentTrack.source === 'archive' ? archivePlayer.currentTime : ytPlayer.getCurrentTime();
            await window.firebase.updateLiveSession(sessionId, { currentTrack, isPlaying: getPlaybackState() === 'playing', currentTime: currentTime || 0, stateChangeTimestamp: window.firebase.serverTimestamp() });
        }
        return true;
    } catch (e) { console.error("Error starting broadcast:", e); showToast("No se pudo iniciar la transmisi\u00f3n. Reintent\u00e1 por favor.", true); return false; }
}

async function stopBroadcasting() {
    if (liveState.mode !== 'broadcasting' || !liveState.sessionId) return;
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    window.removeEventListener('beforeunload', stopBroadcasting);
    showToast("Transmisi\u00f3n finalizada.");
    await window.firebase.updateLiveSession(liveState.sessionId, { status: 'ended' });
    setTimeout(() => window.firebase.deleteLiveSession(liveState.sessionId), 2000);
    liveState.mode = 'none';
    liveState.sessionId = null;
    liveState.sessionData = null;
    updateUIOnTrackChange();
}

function startListening(sessionId, sessionName) {
    if (sessionUnsubscribe) sessionUnsubscribe();
    liveState.mode = 'listening';
    liveState.sessionId = sessionId;
    setPlayerControlsDisabled(true);
    showToast(`Conectado a la transmisi\u00f3n de ${sessionName}`);
    window.addEventListener('beforeunload', stopListening);
    sessionUnsubscribe = window.firebase.listenToSessionChanges(sessionId, handleSessionUpdate);
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
    setPlayerControlsDisabled(false);
    if(YT_READY) ytPlayer.pauseVideo();
    if(archivePlayer) archivePlayer.pause();
    showToast("Te desconectaste de la transmisi\u00f3n.");
    updateUIOnTrackChange();
}

function handleSessionUpdate(sessionData) {
    if (liveState.mode !== 'listening') return;
    
    if (!sessionData || sessionData.status === 'ended') {
        showToast("La transmisi\u00f3n finaliz\u00f3.", true);
        stopListening();
        currentTrack = null;
        updateUIOnTrackChange();
        return;
    }
    
    liveState.sessionData = sessionData;
    const remoteTrack = sessionData.currentTrack;

    if (!remoteTrack) {
        if(YT_READY) ytPlayer.pauseVideo();
        if(archivePlayer) archivePlayer.pause();
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
        
        if(currentTrack.source === 'archive') {
            if(YT_READY) ytPlayer.stopVideo();
            archivePlayer.src = currentTrack.urls.mp3;
            archivePlayer.currentTime = Math.max(0, startSeconds);
            if(sessionData.isPlaying) archivePlayer.play();

        } else { // Es YouTube
            if(archivePlayer) archivePlayer.pause();
            ytPlayer.loadVideoById({ videoId: currentTrack.id, startSeconds: Math.max(0, startSeconds) });
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


export { canActivate, showAlert, liveState, setPlayerControlsDisabled, startBroadcasting, stopBroadcasting, startListening, stopListening, handleSessionUpdate };
