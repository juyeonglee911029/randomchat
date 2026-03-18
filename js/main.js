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

let myInfo = { gender: 'unspecified', freePass: false, name: 'Anonymous' };
let isMatched = false;
let isConnecting = false;
let isShowingFriends = false;
let currentLang = 'en';

async function init() {
    await initMedia(localVideo);
    setupEventListeners();

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
        await adOptimizer.trackClick(myInfo.freePass);
        stopAutoMatching(); hangup(); onDisconnect();
    };

    friendListBtn.onclick = async () => {
        await adOptimizer.trackClick(myInfo.freePass);
        toggleFriends();
    };

    if (settingsBtn) {
        settingsBtn.onclick = async () => {
            await adOptimizer.trackClick(myInfo.freePass);
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
