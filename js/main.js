import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initMedia, findMatch, hangup, setMicGain, sendEffectUpdate, startDirectCall } from './webrtc.js';
import { sendChatMessage, setupChat, stopChat } from './chat.js';
import { 
    searchUserByInstaId, searchUserById, sendFriendRequest, removeFriend, 
    listenToFriends, initiateDirectCall, listenForCalls,
    listenToFriendRequests, acceptFriendRequest, declineFriendRequest
} from './friends.js';
import { adOptimizer } from './ads.js';
import { translations, getLanguage, updateMetaTags } from './i18n.js';

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

const googleLoginBtn = document.getElementById('googleLoginBtn');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

const onlineUsersEl = document.getElementById('onlineUsers');

// Gender Modal Elements
const genderModal = document.getElementById('genderModal');
const genderBtns = document.querySelectorAll('.gender-btn');
const confirmGenderBtn = document.getElementById('confirmGenderBtn');
let selectedGender = null;

// FREE PASS Elements
const freePassBtn = document.getElementById('freePassBtn');
const freePassModal = document.getElementById('freePassModal');
const payFreePassBtn = document.getElementById('payFreePassBtn');
const cancelFreePassBtn = document.getElementById('cancelFreePassBtn');

// User Preferences
let myInfo = {
    gender: 'unspecified',
    prefGender: 'any',
    insta: '',
    whatsapp: '',
    name: 'Anonymous',
    photoUrl: '',
    showInfo: true,
    freePass: false
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
let friendRequests = [];
let friendsList = [];
let currentLang = 'en';

// Initialization
async function init() {
    currentLang = getLanguage();
    updateMetaTags(currentLang);
    
    await initMedia(localVideo);
    setupEventListeners();
    applyTranslations();

    // ESC key listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isConnecting || autoMatchInterval) {
                stopAutoMatching();
                hangup();
                callbacks.onDisconnect();
                addSystemMessage(translations[currentLang].searching + " Cancelled.");
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
                if (myIdDisplay) myIdDisplay.value = user.uid;
                myInfo.name = user.displayName;
                myInfo.photoUrl = user.photoURL;
            }

            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    // Ensure freePass exists
                    if (data.freePass === undefined) {
                        await updateDoc(userRef, { freePass: false });
                        data.freePass = false;
                    }
                    Object.assign(myInfo, data);
                    await updateDoc(userRef, { online: true, lastSeen: Date.now() });
                } else {
                    // New User initialization
                    const newUser = { 
                        ...myInfo, 
                        email: user.email || '', 
                        photoURL: myInfo.photoUrl || '', 
                        online: true, 
                        createdAt: Date.now(), 
                        lastSeen: Date.now(),
                        freePass: false // Default to false
                    };
                    await setDoc(userRef, newUser);
                    Object.assign(myInfo, newUser);
                }
                updateFreePassUI();
                if (myInfo.gender === 'unspecified') genderModal.classList.add('active');
            } catch (err) {
                console.error("Auth state processing error:", err);
            }
            
            loadSettingsToUI();
            if (unsubFriends) unsubFriends();
            unsubFriends = listenToFriends((friends) => {
                friendsList = friends;
                updateFriendListUI();
            });
            
            listenToFriendRequests((requests) => {
                friendRequests = requests;
                if (requests.length > 0) {
                    addSystemMessage(`You have ${requests.length} new friend request(s).`);
                }
                updateFriendListUI();
            });

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
        if (onlineUsersEl) onlineUsersEl.textContent = activeCount;
    });

    setInterval(async () => {
        if (auth.currentUser) await updateDoc(doc(db, 'users', auth.currentUser.uid), { lastSeen: Date.now(), online: true }).catch(() => {});
    }, 30000);
}

function updateFreePassUI() {
    if (!freePassBtn) return;
    if (myInfo.freePass) {
        freePassBtn.classList.remove('freepass-off');
        freePassBtn.classList.add('freepass-on');
        freePassBtn.querySelector('.btn-text').textContent = 'FREE PASS (ON)';
        freePassBtn.querySelector('i').textContent = 'stars';
    } else {
        freePassBtn.classList.remove('freepass-on');
        freePassBtn.classList.add('freepass-off');
        freePassBtn.querySelector('.btn-text').textContent = 'FREE PASS (OFF)';
        freePassBtn.querySelector('i').textContent = 'star_outline';
    }
}

function applyTranslations() {
    const t = translations[currentLang];
    if (findMatchBtn) {
        const span = findMatchBtn.querySelector('.btn-text');
        if (span) span.textContent = t.find_stranger;
    }
    if (hangupBtn) {
        const span = hangupBtn.querySelector('.btn-text');
        if (span) span.textContent = t.stop;
    }
    if (friendListBtn) friendListBtn.title = t.friends;
    if (settingsBtn) settingsBtn.title = t.settings;
    if (chatHeaderTitle) chatHeaderTitle.textContent = isShowingFriends ? t.friends.toUpperCase() : 'CHAT';
    
    const prefGenderSelect = document.getElementById('prefGender');
    if (prefGenderSelect) {
        prefGenderSelect.options[0].textContent = t.everyone;
        prefGenderSelect.options[1].textContent = t.male_only;
        prefGenderSelect.options[2].textContent = t.female_only;
    }
}

function setupEventListeners() {
    // FREE PASS listeners
    freePassBtn?.addEventListener('click', () => {
        if (!myInfo.freePass) {
            freePassModal.classList.add('active');
        } else {
            alert("Your FREE PASS is currently active!");
        }
    });

    cancelFreePassBtn?.addEventListener('click', () => {
        freePassModal.classList.remove('active');
    });

    payFreePassBtn?.addEventListener('click', () => {
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
            alert("Please login with Google to purchase FREE PASS.");
            return;
        }
        // Revolut Checkout Link (Placeholder)
        const revolutLink = "https://revolut.me/juyeonglee"; // User should replace with actual Revolut Pay link
        window.open(revolutLink, '_blank');
        
        // For testing purposes, we add a way to simulate successful payment
        if (confirm("Did you complete the payment? (Simulation)")) {
            updateDoc(doc(db, 'users', auth.currentUser.uid), { freePass: true }).then(() => {
                myInfo.freePass = true;
                updateFreePassUI();
                freePassModal.classList.remove('active');
                alert("FREE PASS Activated! Enjoy premium features.");
            });
        }
    });

    micToggleBtn?.addEventListener('click', () => {
        isMicMuted = !isMicMuted;
        setMicGain(isMicMuted ? 0 : 1);
        micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
        if (micVolumeSlider) micVolumeSlider.value = isMicMuted ? 0 : 1;
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
        
        // FREE PASS check for gender filtering
        if (myInfo.prefGender !== 'any' && !myInfo.freePass) {
            freePassModal.classList.add('active');
            return;
        }

        findMatchBtn.disabled = true; hangupBtn.disabled = false;
        chatMessagesInner.innerHTML = '';
        addSystemMessage(translations[currentLang].searching);
        startAutoMatching();
    });
    hangupBtn.addEventListener('click', () => { stopAutoMatching(); hangup(); callbacks.onDisconnect(); });
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    
    const settingsClose = settingsModal.querySelector('.close-btn');
    settingsClose?.addEventListener('click', () => settingsModal.classList.remove('active'));
    
    saveSettingsBtn.addEventListener('click', saveSettings);
    sendBtn.addEventListener('click', handleSend);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    friendListBtn?.addEventListener('click', toggleFriendList);
    document.getElementById('blogBtn')?.addEventListener('click', () => {
        window.open('/blog', '_blank');
    });
    friendSearchBtn?.addEventListener('click', handleFriendSearch);
    copyIdBtn?.addEventListener('click', () => {
        if (myIdDisplay) {
            myIdDisplay.select();
            document.execCommand('copy');
            alert("ID Copied!");
        }
    });
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
    const chatInputArea = document.querySelector('.chat-input-area');
    if (chatMessages) chatMessages.style.display = isShowingFriends ? 'none' : 'block';
    if (chatInputArea) chatInputArea.style.display = isShowingFriends ? 'none' : 'flex';
    if (friendListArea) friendListArea.style.display = isShowingFriends ? 'flex' : 'none';
    if (chatHeaderTitle) chatHeaderTitle.textContent = isShowingFriends ? translations[currentLang].friends.toUpperCase() : 'CHAT';
    
    if (isShowingFriends) updateFriendListUI();
}

function updateFriendListUI() {
    if (!friendListInner) return;
    friendListInner.innerHTML = '';
    const t = translations[currentLang];

    if (friendRequests.length > 0) {
        const reqHeader = document.createElement('div');
        reqHeader.className = 'system-message';
        reqHeader.style.padding = '10px';
        reqHeader.textContent = t.pending_requests;
        friendListInner.appendChild(reqHeader);

        friendRequests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            const photo = req.fromPhoto || 'https://via.placeholder.com/40';
            item.innerHTML = `
                <img src="${photo}" class="friend-avatar">
                <div class="friend-info">
                    <div class="friend-name">${req.fromName}</div>
                    <div class="friend-status">Pending Request</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept" title="Accept" style="color: #4CAF50;"><i class="material-icons">check</i></button>
                    <button class="friend-action-btn decline" title="Decline" style="color: #f44336;"><i class="material-icons">close</i></button>
                </div>`;
            item.querySelector('.accept').onclick = () => acceptFriendRequest(req);
            item.querySelector('.decline').onclick = () => declineFriendRequest(req.id);
            friendListInner.appendChild(item);
        });
    }

    if (friendsList.length > 0) {
        const friendsHeader = document.createElement('div');
        friendsHeader.className = 'system-message';
        friendsHeader.style.padding = '10px';
        friendsHeader.textContent = t.my_friends;
        friendListInner.appendChild(friendsHeader);

        friendsList.forEach(f => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            const online = f.online && (Date.now() - (f.lastSeen || 0) < 300000);
            const photo = f.photoURL || f.photoUrl || 'https://via.placeholder.com/40';
            item.innerHTML = `
                <img src="${photo}" class="friend-avatar">
                <div class="friend-info">
                    <div class="friend-name">${f.name}</div>
                    <div class="friend-status">${online ? 'Online' : 'Offline'}</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn chat-direct" title="Chat"><i class="material-icons" style="font-size:18px;">chat</i></button>
                    <button class="friend-action-btn call-direct" title="Call"><i class="material-icons" style="font-size:18px;">videocam</i></button>
                    <button class="friend-action-btn delete" title="Remove"><i class="material-icons" style="font-size:18px;">person_remove</i></button>
                </div>`;
            item.querySelector('.chat-direct').onclick = () => toggleFriendList();
            item.querySelector('.call-direct').onclick = async () => {
                const pw = prompt("Password (Optional):");
                const rid = await initiateDirectCall(f.id, pw);
                if (rid) { toggleFriendList(); isConnecting = true; addSystemMessage(`Calling ${f.name}...`); await startDirectCall(remoteVideo, myInfo, callbacks, rid, true); }
            };
            item.querySelector('.delete').onclick = () => { if(confirm("Remove friend?")) removeFriend(f.id); };
            friendListInner.appendChild(item);
        });
    }

    if (friendRequests.length === 0 && friendsList.length === 0) {
        friendListInner.innerHTML = `<div class="system-message" style="padding:20px;">${t.no_friends}</div>`;
    }
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
            const photo = user.photoURL || user.photoUrl || 'https://via.placeholder.com/40';
            item.innerHTML = `<img src="${photo}" class="friend-avatar"><div class="friend-info"><div class="friend-name">${user.name}</div><div class="friend-status">User Found</div></div><button class="btn primary add-btn" style="padding: 5px 10px; font-size: 0.8rem;">Add</button>`;
            item.querySelector('.add-btn').onclick = async () => {
                await sendFriendRequest(user);
                friendSearchInput.value = '';
                adOptimizer.showRewardedAd();
            };
            friendListInner.appendChild(item);
        } else alert("User not found.");
    } catch (e) { alert("Search failed."); }
}

function loadSettingsToUI() {
    if (document.getElementById('myGenderDisplay')) document.getElementById('myGenderDisplay').value = myInfo.gender.toUpperCase();
    if (document.getElementById('prefGender')) document.getElementById('prefGender').value = myInfo.prefGender;
    if (document.getElementById('myInsta')) document.getElementById('myInsta').value = myInfo.insta;
    if (document.getElementById('myWhatsapp')) document.getElementById('myWhatsapp').value = myInfo.whatsapp;
    if (document.getElementById('showInfo')) document.getElementById('showInfo').checked = myInfo.showInfo;
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
    if(myInfo.insta) { if (instaLink) { instaLink.href = `https://instagram.com/${myInfo.insta}`; instaLink.style.display = 'flex'; } } else if (instaLink) instaLink.style.display = 'none';
    if(myInfo.whatsapp) { if (waLink) { waLink.href = `https://wa.me/${myInfo.whatsapp.replace(/[^\d+]/g, '')}`; waLink.style.display = 'flex'; } } else if (waLink) waLink.style.display = 'none';
}

let autoMatchInterval = null;
function setStatus(msg, autoHide = true) {
    if (statusTimeout) clearTimeout(statusTimeout);
    if (remoteStatus) {
        remoteStatus.textContent = msg; remoteStatus.style.display = 'block';
        if (autoHide) statusTimeout = setTimeout(() => { remoteStatus.textContent = ''; remoteStatus.style.display = 'none'; }, 3000);
    }
}

async function startAutoMatching() {
    if (autoMatchInterval) return;
    const overlay = document.getElementById('matchingOverlay');
    if (overlay) overlay.style.display = 'flex';
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

function stopAutoMatching() { 
    if (autoMatchInterval) { clearInterval(autoMatchInterval); autoMatchInterval = null; } 
    isConnecting = false; 
    const overlay = document.getElementById('matchingOverlay');
    if (overlay) overlay.style.display = 'none'; 
}

const callbacks = {
    onStatus: (msg) => {
        if (msg.includes("Error") || msg.includes("denied") || msg.includes("failed")) isConnecting = false;
        setStatus(msg, true);
        if (msg === "Connected!") {
            isMatched = true; isConnecting = false; stopAutoMatching();
            // Ad logic
            if (!myInfo.freePass) {
                adOptimizer.showAdAfterMatch();
            }
            const transitionOverlay = document.getElementById('transitionOverlay');
            if (transitionOverlay) { transitionOverlay.style.display = 'flex'; setTimeout(() => { transitionOverlay.style.display = 'none'; }, 1500); }
            hangupBtn.disabled = false; findMatchBtn.disabled = true; messageInput.disabled = false; sendBtn.disabled = false;
            addSystemMessage(translations[currentLang].connected); sendEffectUpdate({ mirror: isMirrored, brightness: currentBrightness });
        }
    },
    onDisconnect: () => {
        isMatched = false; isConnecting = false; stopAutoMatching();
        if (remoteVideo) { remoteVideo.srcObject = null; remoteVideo.style.filter = 'none'; remoteVideo.style.transform = 'none'; }
        setStatus(translations[currentLang].disconnected);
        if (document.getElementById('partnerInfo')) document.getElementById('partnerInfo').style.display = 'none'; 
        if (partnerSocial) partnerSocial.style.display = 'none';
        hangupBtn.disabled = true; findMatchBtn.disabled = false; messageInput.disabled = true; sendBtn.disabled = true;
        addSystemMessage(translations[currentLang].disconnected); hangup();
    },
    onMessage: (msg) => addChatMessage(msg.text, msg.isMe),
    onPartnerSocial: (insta, wa) => {
        const pInfo = document.getElementById('partnerInfo');
        const pInstaId = document.getElementById('partnerInstaIdTop');
        if (insta || wa) {
            if (pInfo) { pInfo.style.display = 'block'; if (pInstaId) pInstaId.textContent = insta || 'Stranger'; }
            if (partnerSocial) {
                partnerSocial.style.display = 'flex';
                const instLink = document.getElementById('partnerInstaLink');
                const waLink = document.getElementById('partnerWhatsappLink');
                if (instLink) { instLink.href = `https://instagram.com/${insta}`; instLink.style.display = insta ? 'flex' : 'none'; }
                if (waLink) { waLink.href = `https://wa.me/${wa.replace(/[^\d+]/g, '')}`; waLink.style.display = wa ? 'flex' : 'none'; }
            }
        }
    },
    onPartnerEffect: (data) => {
        if (remoteVideo) {
            if (data.mirror !== undefined) remoteVideo.style.transform = data.mirror ? 'scaleX(-1)' : 'none';
            if (data.brightness !== undefined) remoteVideo.style.filter = `brightness(${data.brightness}%)`;
        }
    }
};

function addSystemMessage(text) {
    if (!chatMessagesInner) return;
    const div = document.createElement('div'); div.className = 'system-message'; div.textContent = text;
    chatMessagesInner.appendChild(div); chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}
function addChatMessage(text, isMe) {
    if (!chatMessagesInner) return;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'them'}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
        <span class="message-text">${text}</span>
        <span class="message-time" style="font-size: 0.65rem; opacity: 0.7; margin-left: 8px; align-self: flex-end; display: inline-block;">${time}</span>
    `;
    chatMessagesInner.appendChild(div);

    const messages = chatMessagesInner.querySelectorAll('.message, .system-message');
    if (messages.length > 10) {
        for (let i = 0; i < messages.length - 10; i++) {
            messages[i].remove();
        }
    }

    chatMessagesInner.parentElement.scrollTop = chatMessagesInner.parentElement.scrollHeight;
}

async function handleSend() { const text = messageInput.value.trim(); if (!text || !isMatched) return; messageInput.value = ''; await sendChatMessage(text); }

let isDragging = false, currentX = 0, currentY = 0, initialX, initialY, xOffset = 0, yOffset = 0;
if (localVideoContainer) {
    localVideoContainer.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
            localVideoContainer.classList.toggle('expanded');
        }
    });
    localVideoContainer.addEventListener("mousedown", dragStart); localVideoContainer.addEventListener("touchstart", dragStart, {passive: false});
    document.addEventListener("mouseup", dragEnd); document.addEventListener("touchend", dragEnd);
    document.addEventListener("mousemove", drag); document.addEventListener("touchmove", drag, {passive: false});
}
function dragStart(e) {
    const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    initialX = clientX - xOffset; 
    initialY = clientY - yOffset;
    if (localVideoContainer.contains(e.target)) isDragging = true;
}
function dragEnd() { initialX = currentX; initialY = currentY; isDragging = false; }
function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        let targetX = clientX - initialX;
        let targetY = clientY - initialY;
        const container = document.querySelector('.video-container');
        if (container && localVideoContainer) {
            const containerRect = container.getBoundingClientRect();
            const wrapperRect = localVideoContainer.getBoundingClientRect();
            const nextRect = {
                left: wrapperRect.left + (targetX - xOffset),
                right: wrapperRect.right + (targetX - xOffset),
                top: wrapperRect.top + (targetY - yOffset),
                bottom: wrapperRect.bottom + (targetY - yOffset)
            };
            if (nextRect.left < containerRect.left) targetX = xOffset + (containerRect.left - wrapperRect.left);
            if (nextRect.right > containerRect.right) targetX = xOffset + (containerRect.right - wrapperRect.right);
            if (nextRect.top < containerRect.top) targetY = yOffset + (containerRect.top - wrapperRect.top);
            if (nextRect.bottom > containerRect.bottom) targetY = yOffset + (containerRect.bottom - wrapperRect.bottom);
        }
        currentX = targetX;
        currentY = targetY;
        xOffset = currentX;
        yOffset = currentY;
        localVideoContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
}
init();
