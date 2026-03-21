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
const friendListInner = document.getElementById('friendListInner');
const localVideoContainer = document.getElementById('localVideoContainer');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const userInfo = document.getElementById('userInfo');

let myInfo = { gender: 'unspecified', freePass: false, name: 'Anonymous' };
let isMatched = false;
let isConnecting = false;
let isShowingFriends = false;

async function init() {
    await initMedia(localVideo);
    setupEventListeners();
    setupDraggableLocalVideo();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userRef = doc(db, 'users', user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                myInfo = { ...myInfo, ...snap.data(), id: user.uid };
            } else {
                myInfo = { gender: 'unspecified', online: true, lastSeen: Date.now(), freePass: false, name: user.displayName || 'Anonymous', id: user.uid };
                await setDoc(userRef, myInfo);
            }
            updateAuthUI(user);
            updateFreePassUI();
            listenToFriends((friends) => updateFriendListUI(friends));
        } else {
            // Prevent auto-anonymous if user just logged out or is trying to use Google
            if (!auth.currentUser) {
                signInAnonymously(auth).catch(console.error);
            }
        }
    });

    onSnapshot(query(collection(db, 'users'), where('online', '==', true)), (snap) => {
        if (onlineCountEl) onlineCountEl.textContent = snap.size;
    });
}

function updateAuthUI(user) {
    if (!user || user.isAnonymous) {
        if (googleLoginBtn) googleLoginBtn.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
    } else {
        if (googleLoginBtn) googleLoginBtn.style.display = 'none';
        if (userInfo) {
            userInfo.style.display = 'flex';
            document.getElementById('userName').textContent = user.displayName || 'User';
            document.getElementById('userAvatar').src = user.photoURL || 'favicon.svg';
            const myIdDisplay = document.getElementById('myIdDisplay');
            if (myIdDisplay) {
                // If it's an input in HTML
                if (myIdDisplay.tagName === 'INPUT') {
                    myIdDisplay.value = user.uid;
                } else {
                    myIdDisplay.textContent = `ID: ${user.uid.substring(0,8)}...`;
                }
                myIdDisplay.onclick = () => {
                    navigator.clipboard.writeText(user.uid);
                    alert("ID Copied!");
                };
            }
        }
    }
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
    if (findMatchBtn) {
        findMatchBtn.onclick = async () => {
            await adOptimizer.trackClick(myInfo.freePass);
            if (myInfo.gender === 'unspecified') { document.getElementById('genderModal').classList.add('active'); return; }
            findMatchBtn.disabled = true; hangupBtn.disabled = false;
            startAutoMatching();
        };
    }

    if (hangupBtn) {
        hangupBtn.onclick = async () => {
            stopAutoMatching(); hangup(); onDisconnect();
        };
    }

    if (googleLoginBtn) {
        googleLoginBtn.onclick = async () => {
            try {
                await signInWithPopup(auth, provider);
            } catch (e) {
                console.error("Google Login Error:", e);
            }
        };
    }

    if (friendListBtn) {
        friendListBtn.onclick = () => {
            isShowingFriends = !isShowingFriends;
            const chatMessages = document.getElementById('chatMessages');
            const friendArea = document.getElementById('friendListArea');
            if (chatMessages) chatMessages.style.display = isShowingFriends ? 'none' : 'flex';
            if (friendArea) friendArea.style.display = isShowingFriends ? 'flex' : 'none';
            document.getElementById('chatHeaderTitle').textContent = isShowingFriends ? 'FRIENDS' : 'CHAT';
        };
    }

    if (settingsBtn) {
        settingsBtn.onclick = () => {
            document.getElementById('settingsModal').classList.add('active');
        };
    }

    if (sendBtn) sendBtn.onclick = handleSend;
    if (messageInput) messageInput.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };

    document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.onclick = async () => {
            const g = btn.dataset.gender;
            if (auth.currentUser) {
                await updateDoc(doc(db, 'users', auth.currentUser.uid), { gender: g });
                myInfo.gender = g;
                document.getElementById('genderModal').classList.remove('active');
            }
        };
    });

    // Close Modals
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.remove('active');
        }
    };
    const closeBtns = document.querySelectorAll('.close-btn');
    if (closeBtns) {
        closeBtns.forEach(b => b.onclick = () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    }
}

function setupDraggableLocalVideo() {
    if (!localVideoContainer) return;
    let active = false;
    let offset = [0,0];

    const startDrag = (e) => {
        active = true;
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        offset = [
            localVideoContainer.offsetLeft - clientX,
            localVideoContainer.offsetTop - clientY
        ];
    };

    const endDrag = () => { active = false; };

    const drag = (e) => {
        if (!active) return;
        e.preventDefault();
        const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        
        let newLeft = clientX + offset[0];
        let newTop = clientY + offset[1];
        
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
    };

    localVideoContainer.addEventListener("mousedown", startDrag);
    localVideoContainer.addEventListener("touchstart", startDrag, {passive: false});
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchend", endDrag);
    document.addEventListener("mousemove", drag);
    document.addEventListener("touchmove", drag, {passive: false});
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
                <button class="call-btn" title="Call"><i class="material-icons">videocam</i></button>
                <button class="delete-btn" title="Remove"><i class="material-icons">delete</i></button>
            </div>
        `;
        
        div.querySelector('.call-btn').onclick = async () => {
            const rid = await initiateDirectCall(f.id);
            if (rid) await startDirectCall(remoteVideo, myInfo, callbacks, rid, true);
        };
        div.querySelector('.delete-btn').onclick = async () => {
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
