const socket = io();

const welcomeModal = document.getElementById("welcomeModal");
const roomCodeInput = document.getElementById("roomCode");
const roomError = document.getElementById("roomError");
const connectBtn = document.getElementById("connectBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");
const roomBadge = document.getElementById("roomBadge");

const muteBtn = document.getElementById("muteBtn");
const muteBtnText = document.getElementById("muteBtnText");
const endCallBtn = document.getElementById("endCallBtn");
const localVideoFloat = document.getElementById("localVideoFloat");

let localStream = null;
let peerConnection = null;
let currentRoom = "";
let isMuted = false;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

async function initLocalMedia() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;
  return localStream;
}

function clearRoomError() {
  roomCodeInput.classList.remove("error");
  roomError.classList.add("hidden");
}

function showRoomError() {
  roomCodeInput.classList.add("error");
  roomError.classList.remove("hidden");
}

roomCodeInput.addEventListener("input", clearRoomError);

function showConnectedCode(code) {
  roomBadge.textContent = `You are connected through code: ${code}`;
  roomBadge.classList.remove("hidden");
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    remotePlaceholder.classList.add("hidden");
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", currentRoom, event.candidate);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (
      peerConnection.connectionState === "disconnected" ||
      peerConnection.connectionState === "failed" ||
      peerConnection.connectionState === "closed"
    ) {
      remoteVideo.srcObject = null;
      remotePlaceholder.classList.remove("hidden");
    }
  };

  return peerConnection;
}

async function makeOffer() {
  if (!peerConnection) createPeerConnection();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", currentRoom, offer);
}

async function joinRoom() {
  const roomValue = roomCodeInput.value.trim();

  if (!roomValue) {
    showRoomError();
    roomCodeInput.focus();
    return;
  }

  clearRoomError();
  currentRoom = roomValue;

  await initLocalMedia();

  if (!peerConnection) {
    createPeerConnection();
  }

  showConnectedCode(currentRoom);
  welcomeModal.classList.remove("active");

  socket.emit("join", currentRoom);
}

connectBtn.addEventListener("click", joinRoom);

roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

muteBtn.addEventListener("click", () => {
  if (!localStream) return;

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  muteBtn.querySelector(".control-icon").textContent = isMuted ? "🔇" : "🎤";
  muteBtnText.textContent = isMuted ? "Unmute" : "Mute";
});

endCallBtn.addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject = null;
  }

  remotePlaceholder.classList.remove("hidden");
  roomBadge.classList.add("hidden");
  welcomeModal.classList.add("active");
});

socket.on("ready", async () => {
  await makeOffer();
});

socket.on("offer", async (offer) => {
  if (!peerConnection) createPeerConnection();

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
    console.error("Error adding ICE candidate:", error);
  }
});

function makeDraggable(element) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const startDrag = (clientX, clientY) => {
    const rect = element.getBoundingClientRect();
    isDragging = true;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    element.classList.add("dragging");
  };

  const onDrag = (clientX, clientY) => {
    if (!isDragging) return;

    const parent = document.querySelector(".video-stage");
    const parentRect = parent.getBoundingClientRect();

    let left = clientX - parentRect.left - offsetX;
    let top = clientY - parentRect.top - offsetY;

    left = Math.max(0, Math.min(left, parentRect.width - element.offsetWidth));
    top = Math.max(0, Math.min(top, parentRect.height - element.offsetHeight));

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.right = "auto";
  };

  const stopDrag = () => {
    isDragging = false;
    element.classList.remove("dragging");
  };

  element.addEventListener("mousedown", (e) => {
    startDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    onDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", stopDrag);

  element.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    onDrag(touch.clientX, touch.clientY);
  }, { passive: true });

  window.addEventListener("touchend", stopDrag);
}

makeDraggable(localVideoFloat);

window.addEventListener("load", async () => {
  try {
    await initLocalMedia();
  } catch (error) {
    console.error("Media access error:", error);
  }
});