import { auth } from './firebase-config.js';
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { initMedia, findMatch, hangup } from './webrtc.js';
import { sendChatMessage } from './chat.js';

// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const findMatchBtn = document.getElementById('findMatchBtn');
const hangupBtn = document.getElementById('hangupBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeBtn = document.querySelector('.close-btn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const remoteStatus = document.getElementById('remoteStatus');
const partnerSocial = document.getElementById('partnerSocial');

// User Preferences
let myInfo = {
    gender: 'unspecified',
    prefGender: 'any',
    insta: ''
};

// State
let isMatched = false;

// Initialization
async function init() {
    try {
        await signInAnonymously(auth);
        console.log("Authenticated anonymously", auth.currentUser.uid);
        
        const success = await initMedia(localVideo);
        if (!success) {
            alert("Could not access camera/microphone. Please allow permissions.");
        }
        
        loadSettings();
    } catch (e) {
        console.error("Auth error:", e);
    }
}

// Settings logic
function loadSettings() {
    const saved = localStorage.getItem('randomchat_settings');
    if (saved) {
        myInfo = JSON.parse(saved);
        document.getElementById('myGender').value = myInfo.gender;
        document.getElementById('prefGender').value = myInfo.prefGender;
        document.getElementById('myInsta').value = myInfo.insta;
    }
}

function saveSettings() {
    myInfo = {
        gender: document.getElementById('myGender').value,
        prefGender: document.getElementById('prefGender').value,
        insta: document.getElementById('myInsta').value
    };
    localStorage.setItem('randomchat_settings', JSON.stringify(myInfo));
    settingsModal.classList.remove('active');
}

// Callbacks for WebRTC/Chat
const callbacks = {
    onStatus: (msg) => {
        remoteStatus.textContent = msg;
        remoteStatus.style.display = 'block';
        if (msg === "Connected!") {
            remoteStatus.style.display = 'none';
            isMatched = true;
            hangupBtn.disabled = false;
            findMatchBtn.disabled = true;
            messageInput.disabled = false;
            sendBtn.disabled = false;
            addSystemMessage("You're now chatting with a stranger. Say hi!");
        }
    },
    onDisconnect: () => {
        isMatched = false;
        remoteVideo.srcObject = null;
        remoteStatus.textContent = "Stranger has disconnected.";
        remoteStatus.style.display = 'block';
        partnerSocial.style.display = 'none';
        hangupBtn.disabled = true;
        findMatchBtn.disabled = false;
        messageInput.disabled = true;
        sendBtn.disabled = true;
        addSystemMessage("Stranger has disconnected.");
        hangup();
    },
    onMessage: (msg) => {
        addChatMessage(msg.text, msg.isMe);
    },
    onPartnerSocial: (instaUrl) => {
        if (instaUrl) {
            partnerSocial.style.display = 'flex';
            partnerSocial.innerHTML = `
                <a href="${instaUrl}" target="_blank">
                    <i class="material-icons">camera_alt</i> Instagram
                </a>
            `;
        }
    }
};

// UI Handlers
findMatchBtn.addEventListener('click', async () => {
    findMatchBtn.disabled = true;
    hangupBtn.disabled = false;
    chatMessages.innerHTML = '';
    partnerSocial.style.display = 'none';
    addSystemMessage("Searching for a stranger...");
    await findMatch(remoteVideo, myInfo, callbacks);
});

hangupBtn.addEventListener('click', () => {
    hangup();
    callbacks.onDisconnect();
});

settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
closeBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
saveSettingsBtn.addEventListener('click', saveSettings);

// Chat Handlers
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatMessage(text, isMe) {
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'them'}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || !isMatched) return;
    
    messageInput.value = '';
    await sendChatMessage(text);
}

sendBtn.addEventListener('click', handleSend);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Start the app
init();
