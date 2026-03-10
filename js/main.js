import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initMedia, findMatch, hangup, setMicGain, sendEffectUpdate } from './webrtc.js';
import { sendChatMessage } from './chat.js';

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localVideoContainer = document.getElementById('localVideoContainer');
const findMatchBtn = document.getElementById('findMatchBtn');
const hangupBtn = document.getElementById('hangupBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeBtn = document.querySelector('.close-btn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessagesInner = document.getElementById('chatMessagesInner');
const remoteStatus = document.getElementById('remoteStatus');
const partnerSocial = document.getElementById('partnerSocial');
const matchingOverlay = document.getElementById('matchingOverlay');
const transitionOverlay = document.getElementById('transitionOverlay');

// Webcam Controls
const micToggleBtn = document.getElementById('micToggleBtn');
const micVolumeSlider = document.getElementById('micVolumeSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const mirrorToggleBtn = document.getElementById('mirrorToggleBtn');
const remoteVolumeBtn = document.getElementById('remoteVolumeBtn');
const volumeSlider = document.getElementById('volumeSlider');

const googleLoginBtn = document.getElementById('googleLoginBtn');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

const onlineUsersEl = document.getElementById('onlineUsers');
const genderModal = document.getElementById('genderModal');
const genderBtns = document.querySelectorAll('.gender-btn');
const confirmGenderBtn = document.getElementById('confirmGenderBtn');

// State
let selectedGender = null;
let isMatched = false;
let autoMatchInterval = null;
let statusTimeout = null;
let isMicMuted = false;
let isMirrored = false;

let myInfo = {
    gender: 'unspecified',
    prefGender: 'any',
    insta: '',
    whatsapp: '',
    name: 'Anonymous',
    photoUrl: '',
    showInfo: true
};

async function init() {
    await initMedia(localVideo);

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (user.isAnonymous) {
                googleLoginBtn.style.display = 'flex';
                userInfo.style.display = 'none';
                myInfo.name = 'Anonymous';
            } else {
                googleLoginBtn.style.display = 'none';
                userInfo.style.display = 'flex';
                userName.textContent = user.displayName;
                userAvatar.src = user.photoURL || 'https://via.placeholder.com/32';
                myInfo.name = user.displayName;
                myInfo.photoUrl = user.photoURL;
            }

            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const data = userSnap.data();
                Object.assign(myInfo, {
                    gender: data.gender || 'unspecified',
                    prefGender: data.prefGender || 'any',
                    insta: data.insta || '',
                    whatsapp: data.whatsapp || '',
                    showInfo: data.showInfo !== undefined ? data.showInfo : true
                });
                await updateDoc(userRef, { online: true, lastSeen: Date.now() });
            } else {
                await setDoc(userRef, {
                    name: myInfo.name,
                    email: user.email || '',
                    photoURL: myInfo.photoUrl || '',
                    gender: 'unspecified',
                    prefGender: 'any',
                    insta: '',
                    whatsapp: '',
                    showInfo: true,
                    online: true,
                    createdAt: Date.now(),
                    lastSeen: Date.now()
                });
            }

            if (myInfo.gender === 'unspecified') genderModal.classList.add('active');
            loadSettingsToUI();
        } else {
            signInAnonymously(auth);
        }
    });

    // Online counter
    const q = query(collection(db, 'users'), where('online', '==', true));
    onSnapshot(q, (snap) => {
        let activeCount = 0;
        const now = Date.now();
        snap.forEach(doc => {
            if (now - (doc.data().lastSeen || 0) < 120000) activeCount++;
        });
        if (onlineUsersEl) onlineUsersEl.textContent = activeCount;
    });

    setInterval(async () => {
        if (auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { lastSeen: Date.now(), online: true });
        }
    }, 60000);
}

// Webcam Controls Listeners
micToggleBtn.addEventListener('click', () => {
    isMicMuted = !isMicMuted;
    setMicGain(isMicMuted ? 0 : micVolumeSlider.value);
    micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
    micToggleBtn.style.color = isMicMuted ? 'var(--danger)' : 'var(--primary)';
});

micVolumeSlider.addEventListener('input', (e) => {
    if (!isMicMuted) setMicGain(e.target.value);
});

brightnessSlider.addEventListener('input', (e) => {
    localVideo.style.filter = `brightness(${e.target.value}%)`;
    sendEffectUpdate({ brightness: e.target.value });
});

mirrorToggleBtn.addEventListener('click', () => {
    isMirrored = !isMirrored;
    localVideo.style.transform = isMirrored ? 'scaleX(-1)' : 'none';
    mirrorToggleBtn.classList.toggle('active', isMirrored);
    sendEffectUpdate({ mirror: isMirrored });
});

volumeSlider.addEventListener('input', (e) => {
    remoteVideo.volume = e.target.value;
    remoteVolumeBtn.textContent = e.target.value == 0 ? 'volume_off' : (e.target.value < 0.5 ? 'volume_down' : 'volume_up');
});

function showStatus(msg, autoHide = true) {
    if (statusTimeout) clearTimeout(statusTimeout);
    remoteStatus.textContent = msg;
    remoteStatus.style.display = 'block';
    if (autoHide) {
        statusTimeout = setTimeout(() => {
            remoteStatus.style.display = 'none';
        }, 3000);
    }
}

const callbacks = {
    onStatus: (msg) => {
        if (msg === "Connected!") {
            remoteStatus.style.display = 'none';
            isMatched = true;
            stopAutoMatching();
            transitionOverlay.style.display = 'flex';
            setTimeout(() => transitionOverlay.style.display = 'none', 1500);
            hangupBtn.disabled = false;
            findMatchBtn.disabled = true;
            messageInput.disabled = false;
            sendBtn.disabled = false;
            addSystemMessage("Connected to a stranger.");
            // Sync current effects to partner
            sendEffectUpdate({ mirror: isMirrored, brightness: brightnessSlider.value });
        } else {
            showStatus(msg);
        }
    },
    onDisconnect: () => {
        isMatched = false;
        stopAutoMatching();
        remoteVideo.srcObject = null;
        remoteVideo.style.filter = 'none';
        remoteVideo.style.transform = 'none';
        showStatus("Stranger has disconnected.");
        partnerSocial.style.display = 'none';
        document.getElementById('partnerInfo').style.display = 'none';
        hangupBtn.disabled = true;
        findMatchBtn.disabled = false;
        messageInput.disabled = true;
        sendBtn.disabled = true;
        addSystemMessage("Stranger has disconnected.");
        hangup();
    },
    onMessage: (msg) => addChatMessage(msg.text, msg.isMe),
    onPartnerSocial: (instaId, whatsappNum) => {
        const partnerInfoOverlay = document.getElementById('partnerInfo');
        const partnerInstaIdTop = document.getElementById('partnerInstaIdTop');
        if (instaId) {
            document.getElementById('partnerInstaLink').href = `https://instagram.com/${instaId}`;
            document.getElementById('partnerInstaLink').style.display = 'flex';
            if (partnerInfoOverlay) {
                partnerInfoOverlay.style.display = 'block';
                partnerInstaIdTop.textContent = instaId;
            }
        }
        if (whatsappNum) {
            const waLink = document.getElementById('partnerWhatsappLink');
            waLink.href = `https://wa.me/${whatsappNum.replace(/[^\d+]/g, '')}`;
            waLink.style.display = 'flex';
        }
        partnerSocial.style.display = (instaId || whatsappNum) ? 'flex' : 'none';
    },
    onPartnerEffect: (data) => {
        if (data.mirror !== undefined) {
            remoteVideo.style.transform = data.mirror ? 'scaleX(-1)' : 'none';
        }
        if (data.brightness !== undefined) {
            remoteVideo.style.filter = `brightness(${data.brightness}%)`;
        }
    }
};

async function startAutoMatching() {
    if (autoMatchInterval) return;
    matchingOverlay.style.display = 'flex';
    const attemptMatch = async () => {
        if (!isMatched) await findMatch(remoteVideo, myInfo, callbacks);
    };
    await attemptMatch();
    autoMatchInterval = setInterval(attemptMatch, 4000);
}

function stopAutoMatching() {
    if (autoMatchInterval) clearInterval(autoMatchInterval);
    autoMatchInterval = null;
    matchingOverlay.style.display = 'none';
}

findMatchBtn.addEventListener('click', async () => {
    if (myInfo.gender === 'unspecified') return genderModal.classList.add('active');
    findMatchBtn.disabled = true;
    chatMessagesInner.innerHTML = '';
    addSystemMessage("Searching...");
    await startAutoMatching();
});

hangupBtn.addEventListener('click', () => {
    stopAutoMatching();
    hangup();
    callbacks.onDisconnect();
});

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    chatMessagesInner.appendChild(div);
    chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}

function addChatMessage(text, isMe) {
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'them'}`;
    div.textContent = text;
    chatMessagesInner.appendChild(div);
    chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}

async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || !isMatched) return;
    messageInput.value = '';
    await sendChatMessage(text);
}

sendBtn.addEventListener('click', handleSend);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });

// (Draggable logic remains same) ...
let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;
localVideoContainer.addEventListener("mousedown", dragStart);
localVideoContainer.addEventListener("touchstart", dragStart, {passive: false});
document.addEventListener("mouseup", dragEnd);
document.addEventListener("touchend", dragEnd);
document.addEventListener("mousemove", drag);
document.addEventListener("touchmove", drag, {passive: false});

function dragStart(e) {
    let clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    let clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    initialX = clientX - xOffset;
    initialY = clientY - yOffset;
    if (localVideoContainer.contains(e.target)) isDragging = true;
}
function dragEnd() { initialX = currentX; initialY = currentY; isDragging = false; }
function drag(e) {
    if (isDragging) {
        e.preventDefault();
        let clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        let clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        currentX = clientX - initialX;
        currentY = clientY - initialY;
        xOffset = currentX; yOffset = currentY;
        localVideoContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${localVideoContainer.classList.contains('hovered') ? 1.05 : 1})`;
    }
}

function loadSettingsToUI() {
    document.getElementById('myGenderDisplay').value = myInfo.gender.toUpperCase();
    document.getElementById('prefGender').value = myInfo.prefGender;
    document.getElementById('myInsta').value = myInfo.insta;
    document.getElementById('myWhatsapp').value = myInfo.whatsapp;
    document.getElementById('showInfo').checked = myInfo.showInfo;
}

settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
closeBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
saveSettingsBtn.addEventListener('click', async () => {
    myInfo.prefGender = document.getElementById('prefGender').value;
    myInfo.insta = document.getElementById('myInsta').value;
    myInfo.whatsapp = document.getElementById('myWhatsapp').value;
    myInfo.showInfo = document.getElementById('showInfo').checked;
    if (auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            prefGender: myInfo.prefGender, insta: myInfo.insta, whatsapp: myInfo.whatsapp, showInfo: myInfo.showInfo
        });
    }
    settingsModal.classList.remove('active');
});

init();