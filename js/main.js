import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initMedia, findMatch, hangup } from './webrtc.js';
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
const chatMessages = document.getElementById('chatMessages');
const remoteStatus = document.getElementById('remoteStatus');
const partnerSocial = document.getElementById('partnerSocial');

const googleLoginBtn = document.getElementById('googleLoginBtn');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

const totalUsersEl = document.getElementById('totalUsers');
const onlineUsersEl = document.getElementById('onlineUsers');

// User Preferences
let myInfo = {
    gender: 'unspecified',
    prefGender: 'any',
    insta: '',
    name: 'Anonymous',
    photoUrl: ''
};

// State
let isMatched = false;

// Initialization
async function init() {
    // Attempt camera access immediately as requested
    const success = await initMedia(localVideo);
    if (!success) {
        alert("Could not access camera/microphone. Please allow permissions.");
    }

    // Auth State Listener
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (user.isAnonymous) {
                // Anonymous user
                googleLoginBtn.style.display = 'flex';
                userInfo.style.display = 'none';
                myInfo.name = 'Anonymous';
            } else {
                // Google user is signed in
                googleLoginBtn.style.display = 'none';
                userInfo.style.display = 'flex';
                userName.textContent = user.displayName;
                userAvatar.src = user.photoURL || 'https://via.placeholder.com/32';
                
                myInfo.name = user.displayName;
                myInfo.photoUrl = user.photoURL;
            }

            // Save to Firestore
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    myInfo.gender = data.gender || 'unspecified';
                    myInfo.prefGender = data.prefGender || 'any';
                    myInfo.insta = data.insta || '';
                    
                    // Keep presence
                    await updateDoc(userRef, { online: true, lastSeen: Date.now() });
                } else {
                    await setDoc(userRef, {
                        name: myInfo.name,
                        email: user.email || '',
                        photoURL: myInfo.photoUrl || '',
                        gender: 'unspecified',
                        prefGender: 'any',
                        insta: '',
                        online: true,
                        createdAt: Date.now(),
                        lastSeen: Date.now()
                    });
                }
            } catch (err) {
                console.warn("Firestore user sync skipped (likely anonymous user missing rules):", err.message);
            }
            
            // Set disconnect hook for presence (best effort in Firestore without cloud functions)
            window.addEventListener('beforeunload', () => {
                if (auth.currentUser) {
                    navigator.sendBeacon(`https://firestore.googleapis.com/v1/projects/${db.app.options.projectId}/databases/(default)/documents/users/${user.uid}?updateMask.fieldPaths=online`, 
                    JSON.stringify({ fields: { online: { booleanValue: false } } }));
                }
            });

            loadSettingsToUI();
        } else {
            // User is completely signed out, sign in anonymously
            try {
                await signInAnonymously(auth);
            } catch(e) {
                console.error("Anonymous auth failed", e);
            }
        }
    });

    // Mock/Listen to Stats
    // Since complex aggregation requires Cloud Functions, we'll simulate a dynamic number for UI demo
    // or just fetch all users and count (expensive for large scale, but fine for now)
    onSnapshot(collection(db, 'users'), (snap) => {
        totalUsersEl.textContent = snap.size;
        let onlineCount = 0;
        snap.forEach(doc => {
            if (doc.data().online) onlineCount++;
        });
        onlineUsersEl.textContent = onlineCount > 0 ? onlineCount : Math.floor(Math.random() * 10) + 1; // Fallback demo
    });
}

// Google Login
googleLoginBtn.addEventListener('click', async () => {
    if (window.location.protocol === 'file:') {
        alert("Authentication Error:\nYou are opening this file directly (file://). Firebase Auth requires a web server (http://localhost or https://). Please run a local server or use Firebase Hosting.");
        return;
    }
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login Error:", error);
        alert("Google Login Failed.\nError: " + error.message + "\n\n1. Ensure Google Sign-In is enabled in Firebase Authentication.\n2. Ensure your current domain (" + window.location.hostname + ") is added to the 'Authorized domains' list in the Firebase Console Settings.");
    }
});

userInfo.addEventListener('click', async () => {
    if(confirm("Do you want to logout?")) {
        if (auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { online: false });
            await signOut(auth);
        }
    }
});

// Settings logic
function loadSettingsToUI() {
    const myGenderEl = document.getElementById('myGender');
    myGenderEl.value = myInfo.gender;
    myGenderEl.disabled = true; // Google user, prevent manual change as requested
    
    document.getElementById('prefGender').value = myInfo.prefGender;
    document.getElementById('myInsta').value = myInfo.insta;
}

async function saveSettings() {
    myInfo.prefGender = document.getElementById('prefGender').value;
    myInfo.insta = document.getElementById('myInsta').value;
    
    if (auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            prefGender: myInfo.prefGender,
            insta: myInfo.insta
        });
    }
    
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
        const partnerInfoDiv = document.getElementById('partnerInfo');
        if(partnerInfoDiv) partnerInfoDiv.style.display = 'none';
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
    onPartnerInfo: (info) => {
        const partnerInfoDiv = document.getElementById('partnerInfo');
        const partnerNameEl = document.getElementById('partnerName');
        const partnerGenderEl = document.getElementById('partnerGender');
        if(partnerInfoDiv) {
            partnerInfoDiv.style.display = 'block';
            partnerNameEl.textContent = info.name || 'Anonymous';
            partnerGenderEl.textContent = info.gender || 'unspecified';
        }
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

// Draggable Local Video Logic
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

localVideoContainer.addEventListener("mousedown", dragStart);
document.addEventListener("mouseup", dragEnd);
document.addEventListener("mousemove", drag);

function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === localVideoContainer || e.target === localVideo) {
        isDragging = true;
    }
}

function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, localVideoContainer);
    }
}

function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0) scale(1.05)`; 
    // Keep scale to match hover state while dragging
}

localVideoContainer.addEventListener('mouseleave', () => {
    if(!isDragging) {
        localVideoContainer.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
    }
});
localVideoContainer.addEventListener('mouseenter', () => {
    if(!isDragging) {
        localVideoContainer.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0) scale(1.05)`;
    }
});

// Start the app
init();