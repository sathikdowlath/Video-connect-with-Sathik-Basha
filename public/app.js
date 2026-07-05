const socket = io();

const welcomeModal = document.getElementById("welcomeModal");
const roomCodeInput = document.getElementById("roomCode");
const roomError = document.getElementById("roomError");
const connectBtn = document.getElementById("connectBtn");

const videoStage = document.getElementById("videoStage");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");
const roomBadge = document.getElementById("roomBadge");

const muteBtn = document.getElementById("muteBtn");
const muteBtnText = document.getElementById("muteBtnText");
const muteIcon = document.getElementById("muteIcon");
const endCallBtn = document.getElementById("endCallBtn");
const callControls = document.getElementById("callControls");
const switchCameraBtn = document.getElementById("switchCameraBtn");

let localStream = null;
let peerConnection = null;
let currentRoom = "";
let isMuted = false;
let isMakingOffer = false;
let currentFacingMode = "user";
let controlsTimer = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function clearRoomError() {
  roomCodeInput.classList.remove("error");
  roomError.classList.add("hidden");
}

function showRoomError() {
  roomCodeInput.classList.add("error");
  roomError.classList.remove("hidden");
}

function showConnectedCode(code) {
  roomBadge.textContent = `You are connected through code: ${code}`;
  roomBadge.classList.remove("hidden");
}

function resetRemoteView() {
  remoteVideo.srcObject = null;
  remotePlaceholder.classList.remove("hidden");
}

function cleanupPeerConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }
}

function showControlsTemporarily() {
  callControls.classList.remove("hidden");

  if (controlsTimer) {
    clearTimeout(controlsTimer);
  }

  controlsTimer = setTimeout(() => {
    callControls.classList.add("hidden");
  }, 5000);
}

async function initLocalMedia(facingMode = currentFacingMode) {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  const videoConstraints = isMobileDevice()
    ? { facingMode }
    : true;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraints,
    audio: true
  });

  localVideo.srcObject = localStream;
  currentFacingMode = facingMode;

  if (isMobileDevice()) {
    switchCameraBtn.classList.remove("hidden");
  }
}

function stopLocalMedia() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
}

function createPeerConnection() {
  cleanupPeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    remotePlaceholder.classList.add("hidden");
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoom) {
      socket.emit("ice-candidate", currentRoom, event.candidate);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "failed" || state === "disconnected" || state === "closed") {
      resetRemoteView();
    }
  };

  return peerConnection;
}

async function createAndSendOffer() {
  if (!peerConnection) createPeerConnection();
  if (isMakingOffer) return;

  try {
    isMakingOffer = true;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", currentRoom, offer);
  } finally {
    isMakingOffer = false;
  }
}

async function replaceVideoTrack() {
  if (!peerConnection || !localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");

  if (sender && videoTrack) {
    await sender.replaceTrack(videoTrack);
  }
}

async function switchCamera() {
  const nextFacingMode = currentFacingMode === "user" ? "environment" : "user";
  await initLocalMedia(nextFacingMode);
  await replaceVideoTrack();
  showControlsTemporarily();
}

async function joinRoom() {
  const roomValue = roomCodeInput.value.trim();

  if (!roomValue) {
    showRoomError();
    roomCodeInput.focus();

    setTimeout(() => {
      roomCodeInput.blur();
    }, 150);

    return;
  }

  clearRoomError();
  currentRoom = roomValue;

  await initLocalMedia();
  createPeerConnection();

  showConnectedCode(currentRoom);
  welcomeModal.classList.remove("active");
  roomCodeInput.blur();

  socket.emit("join", currentRoom);
  showControlsTemporarily();
}

function leaveCall() {
  if (currentRoom) {
    socket.emit("leave");
  }

  cleanupPeerConnection();
  resetRemoteView();
  stopLocalMedia();

  roomBadge.classList.add("hidden");
  welcomeModal.classList.add("active");
  callControls.classList.add("hidden");

  isMuted = false;
  muteIcon.textContent = "🎤";
  muteBtnText.textContent = "Mute";
}

connectBtn.addEventListener("click", joinRoom);

roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

roomCodeInput.addEventListener("input", clearRoomError);

muteBtn.addEventListener("click", () => {
  if (!localStream) return;

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  muteIcon.textContent = isMuted ? "🔇" : "🎤";
  muteBtnText.textContent = isMuted ? "Unmute" : "Mute";
  showControlsTemporarily();
});

endCallBtn.addEventListener("click", () => {
  leaveCall();
});

switchCameraBtn.addEventListener("click", async () => {
  await switchCamera();
});

videoStage.addEventListener("click", (event) => {
  if (
    event.target.closest(".control-btn") ||
    event.target.closest(".switch-camera-btn")
  ) return;

  showControlsTemporarily();
});

socket.on("ready", async () => {
  if (!localStream) return;
  await createAndSendOffer();
});

socket.on("offer", async (offer) => {
  if (!localStream) {
    await initLocalMedia();
  }

  if (!peerConnection) {
    createPeerConnection();
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", currentRoom, answer);
});

socket.on("answer", async (answer) => {
  if (!peerConnection) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async (candidate) => {
  if (!peerConnection || !candidate) return;

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("ICE candidate error:", error);
  }
});

socket.on("peer-left", () => {
  resetRemoteView();
  cleanupPeerConnection();

  if (localStream) {
    createPeerConnection();
  }
});