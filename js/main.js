import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initMedia, findMatch, hangup, setMicGain, sendEffectUpdate, startDirectCall } from './webrtc.js';
import { sendChatMessage, setupChat, stopChat } from './chat.js';
import { 
    searchUserByInstaId, searchUserById, sendFriendRequest, removeFriend, blockUser,
    listenToFriends, initiateDirectCall, listenForCalls,
    listenToFriendRequests, acceptFriendRequest, declineFriendRequest
} from './friends.js';
import { adOptimizer } from './ads.js';
import { translations, getLanguage, updateMetaTags } from './i18n.js';

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const findMatchBtn = document.getElementById('findMatchBtn');
const hangupBtn = document.getElementById('hangupBtn');
const settingsBtn = document.getElementById('settingsBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessagesInner = document.getElementById('chatMessages');
const onlineCountEl = document.getElementById('onlineCount');
const friendListBtn = document.getElementById('friendListBtn');
const friendListArea = document.getElementById('friendListArea');
const friendListInner = document.getElementById('friendListInner');
const localVideoContainer = document.getElementById('localVideoContainer');

let myInfo = { gender: 'unspecified', freePass: false, name: 'Anonymous' };
let isMatched = false;
let isConnecting = false;
let isShowingFriends = false;
let currentLang = 'en';

async function init() {
    await initMedia(localVideo);
    setupEventListeners();
    setupDraggableLocalVideo();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userRef = doc(db, 'users', user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                myInfo = { ...myInfo, ...snap.data() };
            } else {
                await setDoc(userRef, { gender: 'unspecified', online: true, lastSeen: Date.now(), freePass: false });
            }
            updateFreePassUI();
            
            listenToFriends((friends) => updateFriendListUI(friends));
        } else {
            signInAnonymously(auth);
        }
    });

    onSnapshot(query(collection(db, 'users'), where('online', '==', true)), (snap) => {
        if (onlineCountEl) onlineCountEl.textContent = snap.size;
    });
}

function setupDraggableLocalVideo() {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        if (e.target === localVideo || e.target === localVideoContainer) {
            isDragging = true;
        }
    };

    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };

    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            // Boundary checks
            const container = document.querySelector('.video-container');
            const rect = localVideoContainer.getBoundingClientRect();
            const parentRect = container.getBoundingClientRect();
            
            // On mobile, keep it above the chat container
            let minBottom = 0;
            if (window.innerWidth <= 768) {
                minBottom = 280; // Height of mobile chat container
            }

            const maxX = parentRect.width - rect.width;
            const maxY = parentRect.height - rect.height - minBottom;

            // Constrain
            xOffset = Math.min(Math.max(currentX, -parentRect.width + rect.width + 20), 20); // Relative to initial position (bottom-right 20px)
            // Wait, simpler: use direct positioning or transform. 
            // Let's stick to xOffset/yOffset for transform.
            
            setTranslate(currentX, currentY, localVideoContainer);
        }
    };

    function setTranslate(xPos, yPos, el) {
        // Simple boundary check relative to viewport/container
        const rect = el.getBoundingClientRect();
        const parent = document.querySelector('.video-container').getBoundingClientRect();
        const chatHeight = window.innerWidth <= 768 ? 280 : 0;

        let finalX = xPos;
        let finalY = yPos;

        // Ensure it doesn't go off screen
        // (This part is tricky with relative offsets, better to use absolute positioning logic)
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    // Better implementation of dragging
    let active = false;
    let offset = [0,0];

    localVideoContainer.addEventListener("mousedown", (e) => {
        active = true;
        offset = [
            localVideoContainer.offsetLeft - e.clientX,
            localVideoContainer.offsetTop - e.clientY
        ];
    }, true);

    document.addEventListener("mouseup", () => {
        active = false;
    }, true);

    document.addEventListener("mousemove", (event) => {
        if (active) {
            event.preventDefault();
            let mousePosition = { x : event.clientX, y : event.clientY };
            let newLeft = mousePosition.x + offset[0];
            let newTop = mousePosition.y + offset[1];
            
            const parent = document.querySelector('.video-container').getBoundingClientRect();
            const rect = localVideoContainer.getBoundingClientRect();
            const chatHeight = window.innerWidth <= 768 ? 280 : 0;

            // Boundaries
            if (newLeft < parent.left) newLeft = parent.left;
            if (newLeft + rect.width > parent.right) newLeft = parent.right - rect.width;
            if (newTop < parent.top) newTop = parent.top;
            if (newTop + rect.height > parent.bottom - chatHeight) newTop = parent.bottom - chatHeight - rect.height;

            localVideoContainer.style.left = newLeft + 'px';
            localVideoContainer.style.top = newTop + 'px';
            localVideoContainer.style.bottom = 'auto';
            localVideoContainer.style.right = 'auto';
        }
    }, true);

    // Touch support
    localVideoContainer.addEventListener("touchstart", (e) => {
        active = true;
        offset = [
            localVideoContainer.offsetLeft - e.touches[0].clientX,
            localVideoContainer.offsetTop - e.touches[0].clientY
        ];
    }, true);

    document.addEventListener("touchend", () => {
        active = false;
    }, true);

    document.addEventListener("touchmove", (e) => {
        if (active) {
            let touchPosition = { x : e.touches[0].clientX, y : e.touches[0].clientY };
            let newLeft = touchPosition.x + offset[0];
            let newTop = touchPosition.y + offset[1];
            
            const parent = document.querySelector('.video-container').getBoundingClientRect();
            const rect = localVideoContainer.getBoundingClientRect();
            const chatHeight = window.innerWidth <= 768 ? 280 : 0;

            if (newLeft < parent.left) newLeft = parent.left;
            if (newLeft + rect.width > parent.right) newLeft = parent.right - rect.width;
            if (newTop < parent.top) newTop = parent.top;
            if (newTop + rect.height > parent.bottom - chatHeight) newTop = parent.bottom - chatHeight - rect.height;

            localVideoContainer.style.left = newLeft + 'px';
            localVideoContainer.style.top = newTop + 'px';
            localVideoContainer.style.bottom = 'auto';
            localVideoContainer.style.right = 'auto';
        }
    }, { passive: false });
}

function updateFreePassUI() {
    const freePassBtn = document.getElementById('freePassBtn');
    if (!freePassBtn) return;
    if (myInfo.freePass) {
        freePassBtn.className = 'btn secondary freepass-on';
        freePassBtn.innerHTML = '<i class="material-icons">stars</i> <span>FREE PASS ON</span>';
    } else {
        freePassBtn.className = 'btn secondary freepass-off';
        freePassBtn.innerHTML = '<i class="material-icons">star_outline</i> <span>FREE PASS OFF</span>';
    }
}

function setupEventListeners() {
    findMatchBtn.onclick = async () => {
        await adOptimizer.trackClick(myInfo.freePass);
        if (myInfo.gender === 'unspecified') { document.getElementById('genderModal').classList.add('active'); return; }
        findMatchBtn.disabled = true; hangupBtn.disabled = false;
        startAutoMatching();
    };

    hangupBtn.onclick = async () => {
        stopAutoMatching(); hangup(); onDisconnect();
    };

    friendListBtn.onclick = async () => {
        toggleFriends();
    };

    if (settingsBtn) {
        settingsBtn.onclick = async () => {
            // open settings logic
        };
    }

    sendBtn.onclick = handleSend;
    messageInput.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };

    document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.onclick = async () => {
            const g = btn.dataset.gender;
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { gender: g });
            myInfo.gender = g;
            document.getElementById('genderModal').classList.remove('active');
        };
    });
}

function toggleFriends() {
    isShowingFriends = !isShowingFriends;
    document.getElementById('chatMessages').style.display = isShowingFriends ? 'none' : 'flex';
    friendListArea.style.display = isShowingFriends ? 'flex' : 'none';
    document.getElementById('chatHeaderTitle').textContent = isShowingFriends ? 'FRIENDS' : 'CHAT';
}

function updateFriendListUI(friends) {
    if (!friendListInner) return;
    friendListInner.innerHTML = '';
    friends.forEach(f => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            <img src="${f.photoURL || 'https://via.placeholder.com/40'}" class="friend-avatar">
            <div class="friend-info">
                <div class="friend-name">${f.name}</div>
                <div class="friend-status">${f.online ? 'Online' : 'Offline'}</div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn chat-direct" title="Chat"><i class="material-icons">chat</i></button>
                <button class="call-btn" title="Call"><i class="material-icons">videocam</i></button>
                <button class="delete-btn" title="Remove"><i class="material-icons">delete</i></button>
            </div>
        `;
        
        // "Chat" button switches back to chat view
        div.querySelector('.chat-direct').onclick = () => toggleFriends();
        
        div.querySelector('.call-btn').onclick = async () => {
            await adOptimizer.trackClick(myInfo.freePass);
            const rid = await initiateDirectCall(f.id);
            if (rid) await startDirectCall(remoteVideo, myInfo, callbacks, rid, true);
        };
        div.querySelector('.delete-btn').onclick = async () => {
            await adOptimizer.trackClick(myInfo.freePass);
            if(confirm(`Remove ${f.name} from friends?`)) {
                await removeFriend(f.id);
            }
        };
        friendListInner.appendChild(div);
    });
}

let autoMatchInterval = null;
function startAutoMatching() {
    document.getElementById('matchingOverlay').style.display = 'flex';
    const attempt = async () => {
        if (isMatched || isConnecting) return;
        isConnecting = true;
        await findMatch(remoteVideo, myInfo, callbacks);
    };
    attempt();
    autoMatchInterval = setInterval(attempt, 5000);
}

function stopAutoMatching() {
    if (autoMatchInterval) clearInterval(autoMatchInterval);
    autoMatchInterval = null;
    document.getElementById('matchingOverlay').style.display = 'none';
    isConnecting = false;
}

const callbacks = {
    onStatus: (msg) => {
        if (msg === "Connected!") {
            isMatched = true; isConnecting = false; stopAutoMatching();
            messageInput.disabled = false;
            addSystemMessage("Connected!");
        }
    },
    onDisconnect: () => onDisconnect(),
    onMessage: (msg) => addChatMessage(msg.text, msg.isMe),
    onPartnerSocial: (insta) => {
        const pInfo = document.getElementById('partnerInfo');
        const pInstaId = document.getElementById('partnerInstaIdTop');
        if (insta && pInfo) {
            pInfo.style.display = 'flex';
            if (pInstaId) pInstaId.textContent = insta;
        }
    }
};

function onDisconnect() {
    isMatched = false; isConnecting = false; stopAutoMatching();
    remoteVideo.srcObject = null;
    messageInput.disabled = true;
    addSystemMessage("Disconnected.");
    if (document.getElementById('partnerInfo')) document.getElementById('partnerInfo').style.display = 'none';
}

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
    // Auto-scroll to bottom
    chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}

async function handleSend() {
    const text = messageInput.value.trim();
    if (text && isMatched) {
        messageInput.value = '';
        await sendChatMessage(text);
    }
}

init();
