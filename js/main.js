import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initMedia, findMatch, hangup, setMicGain, sendEffectUpdate, startDirectCall } from './webrtc.js';
import { sendChatMessage } from './chat.js';
import { 
    searchUserByInstaId, searchUserById, addFriend, removeFriend, 
    listenToFriends, initiateDirectCall, listenForCalls 
} from './friends.js';

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
const chatMessages = document.getElementById('chatMessages');
const remoteStatus = document.getElementById('remoteStatus');
const partnerSocial = document.getElementById('partnerSocial');
const onlineCountEl = document.getElementById('onlineCount');
const callTimerEl = document.getElementById('callTimer');
const timerValueEl = document.getElementById('timerValue');

// Friends UI Elements
const friendListBtn = document.getElementById('friendListBtn');
const friendListArea = document.getElementById('friendListArea');
const friendListInner = document.getElementById('friendListInner');
const friendSearchInput = document.getElementById('friendSearchInput');
const friendSearchBtn = document.getElementById('friendSearchBtn');
const chatHeaderTitle = document.getElementById('chatHeaderTitle');
const myIdDisplay = document.getElementById('myIdDisplay');
const copyIdBtn = document.getElementById('copyIdBtn');

// Webcam Controls Elements
const micToggleBtn = document.getElementById('micToggleBtn');
const micVolumeSlider = document.getElementById('micVolumeSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const mirrorToggleBtn = document.getElementById('mirrorToggleBtn');
const volumeSlider = document.getElementById('volumeSlider');
const remoteVolumeBtn = document.getElementById('remoteVolumeBtn');

const googleLoginBtn = document.getElementById('googleLoginBtn');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

const totalUsersEl = document.getElementById('totalUsers');
const onlineUsersEl = document.getElementById('onlineUsers');

// Gender Modal Elements
const genderModal = document.getElementById('genderModal');
const genderBtns = document.querySelectorAll('.gender-btn');
const confirmGenderBtn = document.getElementById('confirmGenderBtn');
let selectedGender = null;

// User Preferences
let myInfo = {
    gender: 'unspecified',
    prefGender: 'any',
    insta: '',
    whatsapp: '',
    name: 'Anonymous',
    photoUrl: '',
    showInfo: true
};

// State
let isMatched = false;
let isConnecting = false;
let isShowingFriends = false;
let unsubFriends = null;
let unsubCalls = null;
let isMicMuted = false;
let isMirrored = false;
let currentBrightness = 100;
let statusTimeout = null;
let callStartTime = null;
let callTimerInterval = null;

// Initialization
async function init() {
    await initMedia(localVideo);
    setupEventListeners();

    // ESC key listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isConnecting || autoMatchInterval) {
                stopAutoMatching();
                hangup();
                callbacks.onDisconnect();
                addSystemMessage("Matching cancelled.");
            }
        }
    });

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
                myIdDisplay.value = user.uid;
                myInfo.name = user.displayName;
                myInfo.photoUrl = user.photoURL;
            }

            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    Object.assign(myInfo, userSnap.data());
                    await updateDoc(userRef, { online: true, lastSeen: Date.now() });
                } else {
                    await setDoc(userRef, { ...myInfo, email: user.email || '', photoURL: myInfo.photoUrl || '', online: true, createdAt: Date.now(), lastSeen: Date.now() });
                }
                if (myInfo.gender === 'unspecified') genderModal.classList.add('active');
            } catch (err) {}
            
            loadSettingsToUI();
            if (unsubFriends) unsubFriends();
            unsubFriends = listenToFriends(updateFriendListUI);
            if (unsubCalls) unsubCalls();
            unsubCalls = listenForCalls(async (callData) => {
                if (isMatched || isConnecting) return;
                setStatus(`Incoming call from ${callData.callerName}...`, false);
                isConnecting = true;
                stopAutoMatching();
                await startDirectCall(remoteVideo, myInfo, callbacks, callData.roomId, false);
            });
        } else {
            signInAnonymously(auth).catch(console.error);
        }
    });

    const q = query(collection(db, 'users'), where('online', '==', true));
    onSnapshot(q, (snap) => {
        let activeCount = 0;
        const now = Date.now();
        snap.forEach(doc => { if (now - (doc.data().lastSeen || 0) < 120000) activeCount++; });
        if (onlineCountEl) onlineCountEl.textContent = activeCount;
    });

    setInterval(async () => {
        if (auth.currentUser) await updateDoc(doc(db, 'users', auth.currentUser.uid), { lastSeen: Date.now(), online: true }).catch(() => {});
    }, 30000);
}

function setupEventListeners() {
    micToggleBtn?.addEventListener('click', () => {
        isMicMuted = !isMicMuted;
        setMicGain(isMicMuted ? 0 : 1);
        micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
        micVolumeSlider.value = isMicMuted ? 0 : 1;
    });
    micVolumeSlider?.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        setMicGain(vol);
        isMicMuted = vol === 0;
        micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
    });
    volumeSlider?.addEventListener('input', (e) => { remoteVideo.volume = e.target.value; });
    mirrorToggleBtn?.addEventListener('click', () => {
        isMirrored = !isMirrored;
        mirrorToggleBtn.classList.toggle('active', isMirrored);
        localVideo.style.transform = isMirrored ? 'scaleX(-1)' : 'none';
        sendEffectUpdate({ mirror: isMirrored });
    });
    brightnessSlider?.addEventListener('input', (e) => {
        currentBrightness = e.target.value;
        localVideo.style.filter = `brightness(${currentBrightness}%)`;
        sendEffectUpdate({ brightness: currentBrightness });
    });
    findMatchBtn.addEventListener('click', () => {
        if (myInfo.gender === 'unspecified') { genderModal.classList.add('active'); return; }
        findMatchBtn.disabled = true; hangupBtn.disabled = false;
        chatMessagesInner.innerHTML = '';
        addSystemMessage("Searching for a partner...");
        startAutoMatching();
    });
    hangupBtn.addEventListener('click', () => { stopAutoMatching(); hangup(); callbacks.onDisconnect(); });
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    saveSettingsBtn.addEventListener('click', saveSettings);
    sendBtn.addEventListener('click', handleSend);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    friendListBtn?.addEventListener('click', toggleFriendList);
    friendSearchBtn?.addEventListener('click', handleFriendSearch);
    copyIdBtn?.addEventListener('click', () => { myIdDisplay.select(); document.execCommand('copy'); alert("ID Copied!"); });
    genderBtns.forEach(btn => btn.addEventListener('click', () => {
        genderBtns.forEach(b => b.classList.remove('selected')); btn.classList.add('selected');
        selectedGender = btn.getAttribute('data-gender'); confirmGenderBtn.disabled = false;
    }));
    confirmGenderBtn.addEventListener('click', async () => {
        if (!selectedGender || !auth.currentUser) return;
        confirmGenderBtn.disabled = true;
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { gender: selectedGender });
            myInfo.gender = selectedGender; genderModal.classList.remove('active'); loadSettingsToUI();
        } catch (err) { confirmGenderBtn.disabled = false; }
    });
    googleLoginBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(console.error));
    userInfo.addEventListener('click', () => { if(confirm("Logout?")) signOut(auth).then(() => location.reload()); });
}

function toggleFriendList() {
    isShowingFriends = !isShowingFriends;
    chatMessages.style.display = isShowingFriends ? 'none' : 'block';
    friendListArea.style.display = isShowingFriends ? 'block' : 'none';
    chatHeaderTitle.textContent = isShowingFriends ? 'FRIENDS' : 'CHAT';
}

function updateFriendListUI(friends) {
    friendListInner.innerHTML = '';
    if (friends.length === 0) { friendListInner.innerHTML = '<div class="system-message">No friends yet. Search by ID to add!</div>'; return; }
    friends.forEach(f => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        const online = f.online && (Date.now() - (f.lastSeen || 0) < 120000);
        item.innerHTML = `<img src="${f.photoURL || 'https://via.placeholder.com/40'}" class="friend-avatar"><div class="friend-info"><div class="friend-name">${f.name}</div><div class="friend-status">${online ? 'Online' : 'Offline'}</div></div><div class="friend-actions"><button class="friend-action-btn call-direct" title="Call"><i class="material-icons">videocam</i></button><button class="friend-action-btn delete" title="Remove"><i class="material-icons">person_remove</i></button></div>`;
        item.querySelector('.call-direct').onclick = async () => {
            const pw = prompt("Password (Optional):");
            const rid = await initiateDirectCall(f.id, pw);
            if (rid) { toggleFriendList(); isConnecting = true; addSystemMessage(`Calling ${f.name}...`); await startDirectCall(remoteVideo, myInfo, callbacks, rid, true); }
        };
        item.querySelector('.delete').onclick = () => { if(confirm("Remove friend?")) removeFriend(f.id); };
        friendListInner.appendChild(item);
    });
}

async function handleFriendSearch() {
    const id = friendSearchInput.value.trim(); if (!id) return;
    addSystemMessage(`Searching for user: ${id}...`);
    try {
        let user = await searchUserByInstaId(id) || await searchUserById(id);
        if (user) {
            friendListInner.innerHTML = '';
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <img src="${user.photoURL || 'https://via.placeholder.com/40'}" class="friend-avatar">
                <div class="friend-info">
                    <div class="friend-name">${user.name || 'Anonymous'}</div>
                    <div class="friend-status">Found by ID</div>
                </div>
                <button class="btn primary add-btn">Add Friend</button>
            `;
            item.querySelector('.add-btn').onclick = async () => {
                await addFriend(user);
                friendSearchInput.value = '';
            };
            friendListInner.appendChild(item);
        } else alert("User not found. Make sure the ID is correct.");
    } catch (e) { console.error("Search error:", e); alert("Search failed."); }
}

function startCallTimer() {
    stopCallTimer();
    callStartTime = Date.now();
    if (callTimerEl) callTimerEl.style.display = 'flex';
    callTimerInterval = setInterval(updateCallTimer, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    if (callTimerEl) callTimerEl.style.display = 'none';
    if (timerValueEl) timerValueEl.textContent = '00:00';
}

function updateCallTimer() {
    if (!callStartTime) return;
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    if (timerValueEl) timerValueEl.textContent = `${mins}:${secs}`;
}

function loadSettingsToUI() {
    document.getElementById('myGenderDisplay').value = myInfo.gender.toUpperCase();
    document.getElementById('prefGender').value = myInfo.prefGender;
    document.getElementById('myInsta').value = myInfo.insta;
    document.getElementById('myWhatsapp').value = myInfo.whatsapp;
    document.getElementById('showInfo').checked = myInfo.showInfo;
    updateLocalSocialIcons();
}

async function saveSettings() {
    myInfo.prefGender = document.getElementById('prefGender').value;
    myInfo.insta = document.getElementById('myInsta').value;
    myInfo.whatsapp = document.getElementById('myWhatsapp').value;
    myInfo.showInfo = document.getElementById('showInfo').checked;
    updateLocalSocialIcons();
    if (auth.currentUser) await updateDoc(doc(db, 'users', auth.currentUser.uid), { prefGender: myInfo.prefGender, insta: myInfo.insta, whatsapp: myInfo.whatsapp, showInfo: myInfo.showInfo });
    settingsModal.classList.remove('active');
}

function updateLocalSocialIcons() {
    const instaLink = document.getElementById('myInstaLink');
    const waLink = document.getElementById('myWhatsappLink');
    if(myInfo.insta) { instaLink.href = `https://instagram.com/${myInfo.insta}`; instaLink.style.display = 'flex'; } else instaLink.style.display = 'none';
    if(myInfo.whatsapp) { waLink.href = `https://wa.me/${myInfo.whatsapp.replace(/[^\d+]/g, '')}`; waLink.style.display = 'flex'; } else waLink.style.display = 'none';
}

let autoMatchInterval = null;
function setStatus(msg, autoHide = true) {
    if (statusTimeout) clearTimeout(statusTimeout);
    remoteStatus.textContent = msg; remoteStatus.style.display = 'block';
    if (autoHide) statusTimeout = setTimeout(() => { remoteStatus.textContent = ''; remoteStatus.style.display = 'none'; }, 3000);
}

async function startAutoMatching() {
    if (autoMatchInterval) return;
    document.getElementById('matchingOverlay').style.display = 'flex';
    const attemptMatch = async () => {
        if (isMatched || isConnecting) return;
        isConnecting = true;
        try { await findMatch(remoteVideo, myInfo, callbacks); } catch (e) { isConnecting = false; }
    };
    await attemptMatch();
    autoMatchInterval = setInterval(async () => {
        if (!isMatched && !isConnecting) await attemptMatch();
        else if (isMatched) stopAutoMatching();
    }, 5000);
}

function stopAutoMatching() { if (autoMatchInterval) { clearInterval(autoMatchInterval); autoMatchInterval = null; } isConnecting = false; document.getElementById('matchingOverlay').style.display = 'none'; }

const callbacks = {
    onStatus: (msg) => {
        if (msg.includes("Error") || msg.includes("denied") || msg.includes("failed")) isConnecting = false;
        setStatus(msg, true);
        if (msg === "Connected!") {
            isMatched = true; isConnecting = false; stopAutoMatching(); startCallTimer();
            const transitionOverlay = document.getElementById('transitionOverlay');
            if (transitionOverlay) { transitionOverlay.style.display = 'flex'; setTimeout(() => { transitionOverlay.style.display = 'none'; }, 1500); }
            hangupBtn.disabled = false; findMatchBtn.disabled = true; messageInput.disabled = false; sendBtn.disabled = false;
            addSystemMessage("Connected."); sendEffectUpdate({ mirror: isMirrored, brightness: currentBrightness });
        }
    },
    onDisconnect: () => {
        isMatched = false; isConnecting = false; stopAutoMatching(); stopCallTimer();
        remoteVideo.srcObject = null; remoteVideo.style.filter = 'none'; remoteVideo.style.transform = 'none';
        setStatus("Disconnected.");
        document.getElementById('partnerInfo').style.display = 'none'; partnerSocial.style.display = 'none';
        hangupBtn.disabled = true; findMatchBtn.disabled = false; messageInput.disabled = true; sendBtn.disabled = true;
        addSystemMessage("Disconnected."); hangup();
    },
    onMessage: (msg) => addChatMessage(msg.text, msg.isMe),
    onPartnerSocial: (insta, wa) => {
        const pInfo = document.getElementById('partnerInfo');
        const pInstaId = document.getElementById('partnerInstaIdTop');
        if (insta || wa) {
            if (pInfo) { pInfo.style.display = 'block'; if (pInstaId) pInstaId.textContent = insta || 'Stranger'; }
            partnerSocial.style.display = 'flex';
            const instLink = document.getElementById('partnerInstaLink');
            const waLink = document.getElementById('partnerWhatsappLink');
            if (instLink) { instLink.href = `https://instagram.com/${insta}`; instLink.style.display = insta ? 'flex' : 'none'; }
            if (waLink) { waLink.href = `https://wa.me/${wa.replace(/[^\d+]/g, '')}`; waLink.style.display = wa ? 'flex' : 'none'; }
        }
    },
    onPartnerEffect: (data) => {
        if (data.mirror !== undefined) remoteVideo.style.transform = data.mirror ? 'scaleX(-1)' : 'none';
        if (data.brightness !== undefined) remoteVideo.style.filter = `brightness(${data.brightness}%)`;
    }
};

function addSystemMessage(text) {
    const div = document.createElement('div'); div.className = 'system-message'; div.textContent = text;
    chatMessagesInner.appendChild(div); chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}
function addChatMessage(text, isMe) {
    const div = document.createElement('div'); div.className = `message ${isMe ? 'me' : 'them'}`; div.textContent = text;
    chatMessagesInner.appendChild(div); chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}
async function handleSend() { const text = messageInput.value.trim(); if (!text || !isMatched) return; messageInput.value = ''; await sendChatMessage(text); }

// Draggable Logic
let isDragging = false, currentX = 0, currentY = 0, initialX, initialY, xOffset = 0, yOffset = 0;
localVideoContainer.addEventListener("mousedown", dragStart); localVideoContainer.addEventListener("touchstart", dragStart, {passive: false});
document.addEventListener("mouseup", dragEnd); document.addEventListener("touchend", dragEnd);
document.addEventListener("mousemove", drag); document.addEventListener("touchmove", drag, {passive: false});
function dragStart(e) {
    const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    initialX = clientX - xOffset; initialY = clientY - yOffset;
    if (localVideoContainer.contains(e.target)) isDragging = true;
}
function dragEnd() { initialX = currentX; initialY = currentY; isDragging = false; }
function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        let targetX = clientX - initialX, targetY = clientY - initialY;
        const container = document.querySelector('.video-container');
        if (container && localVideoContainer) {
            const containerRect = container.getBoundingClientRect(), wrapperRect = localVideoContainer.getBoundingClientRect();
            const initialLeft = containerRect.right - wrapperRect.width - 20, initialTop = containerRect.bottom - wrapperRect.height - 20;
            const minX = containerRect.left - initialLeft, maxX = containerRect.right - (initialLeft + wrapperRect.width);
            const minY = containerRect.top - initialTop, maxY = containerRect.bottom - (initialTop + wrapperRect.height);
            targetX = Math.min(Math.max(targetX, minX), maxX); targetY = Math.min(Math.max(targetY, minY), maxY);
        }
        currentX = targetX; currentY = targetY; xOffset = currentX; yOffset = currentY;
        localVideoContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
}
init();
