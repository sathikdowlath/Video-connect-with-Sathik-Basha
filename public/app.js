const socket = typeof io !== "undefined" ? io() : null;

const welcomeModal = document.getElementById("welcomeModal");
const roomCodeInput = document.getElementById("roomCode");
const connectBtn = document.getElementById("connectBtn");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");

const muteBtn = document.getElementById("muteBtn");
const endCallBtn = document.getElementById("endCallBtn");
const localVideoFloat = document.getElementById("localVideoFloat");

let localStream = null;
let peerConnection = null;
let currentRoom = "";
let isMuted = false;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

async function initLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access camera or microphone.");
  }
}

function createPeerConnection() {
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
    if (event.candidate && socket) {
      socket.emit("ice-candidate", {
        room: currentRoom,
        candidate: event.candidate
      });
    }
  };

  return peerConnection;
}

async function joinRoom() {
  const roomValue = roomCodeInput.value.trim();

  if (!roomValue) {
    alert("Please enter the code number.");
    roomCodeInput.focus();
    return;
  }

  currentRoom = roomValue;

  if (!localStream) {
    await initLocalMedia();
  }

  if (!peerConnection) {
    createPeerConnection();
  }

  welcomeModal.classList.remove("active");

  if (socket) {
    socket.emit("join-room", currentRoom);
  }
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

  muteBtn.innerHTML = `
    <span class="control-icon">${isMuted ? "🔇" : "🎤"}</span>
    <span>${isMuted ? "Unmute" : "Mute"}</span>
  `;
});

endCallBtn.addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }

  remotePlaceholder.classList.remove("hidden");
  welcomeModal.classList.add("active");
});

if (socket) {
  socket.on("user-joined", async ({ isInitiator }) => {
    if (!peerConnection) createPeerConnection();

    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("offer", {
        room: currentRoom,
        offer
      });
    }
  });

  socket.on("offer", async ({ offer }) => {
    if (!peerConnection) createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", {
      room: currentRoom,
      answer
    });
  });

  socket.on("answer", async ({ answer }) => {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("ice-candidate", async ({ candidate }) => {
    if (!peerConnection || !candidate) return;
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("ICE candidate error:", err);
    }
  });

  socket.on("user-left", () => {
    remoteVideo.srcObject = null;
    remotePlaceholder.classList.remove("hidden");
  });
}

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
  await initLocalMedia();
});