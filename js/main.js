import { auth, db, provider } from './firebase-config.js';
import { signInWithPopup, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
const chatMessagesInner = document.getElementById('chatMessagesInner');
const remoteStatus = document.getElementById('remoteStatus');
const partnerSocial = document.getElementById('partnerSocial');

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

// Initialization
async function init() {
    // Attempt camera access immediately
    const success = await initMedia(localVideo);
    if (!success) {
        console.warn("Could not access camera/microphone.");
    }

    // Auth State Listener
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

            // Sync User Data
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    myInfo.gender = data.gender || 'unspecified';
                    myInfo.prefGender = data.prefGender || 'any';
                    myInfo.insta = data.insta || '';
                    myInfo.whatsapp = data.whatsapp || '';
                    myInfo.showInfo = data.showInfo !== undefined ? data.showInfo : true;
                    
                    // Mark as online
                    await updateDoc(userRef, { online: true, lastSeen: Date.now() });
                } else {
                    // New user
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
                    myInfo.gender = 'unspecified';
                }

                // Force gender selection if unspecified
                if (myInfo.gender === 'unspecified') {
                    genderModal.classList.add('active');
                } else {
                    genderModal.classList.remove('active');
                }
            } catch (err) {
                console.error("Firestore error:", err);
            }
            
            loadSettingsToUI();
        } else {
            // Auto sign in anonymously if no user
            signInAnonymously(auth).catch(e => console.error("Anon auth failed", e));
        }
    });

    // Activity-based online counter
    // We count users who have been seen in the last 2 minutes and have online: true
    const q = query(collection(db, 'users'), where('online', '==', true));
    onSnapshot(q, (snap) => {
        let activeCount = 0;
        const now = Date.now();
        const activeThreshold = 2 * 60 * 1000; // 2 minutes
        
        snap.forEach(doc => {
            const data = doc.data();
            if (now - (data.lastSeen || 0) < activeThreshold) {
                activeCount++;
            }
        });
        
        onlineUsersEl.textContent = activeCount;
        totalUsersEl.textContent = snap.size; // Total registered online users
    });

    // Update lastSeen every 1 minute if user is active
    setInterval(async () => {
        if (auth.currentUser) {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, { lastSeen: Date.now(), online: true });
        }
    }, 60000);
}

// Gender Modal Logic
genderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        genderBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedGender = btn.getAttribute('data-gender');
        confirmGenderBtn.disabled = false;
    });
});

confirmGenderBtn.addEventListener('click', async () => {
    if (!selectedGender || !auth.currentUser) return;
    
    confirmGenderBtn.disabled = true;
    confirmGenderBtn.textContent = 'Saving...';
    
    try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, { gender: selectedGender });
        myInfo.gender = selectedGender;
        genderModal.classList.remove('active');
        loadSettingsToUI();
    } catch (err) {
        console.error("Error saving gender:", err);
        confirmGenderBtn.disabled = false;
        confirmGenderBtn.textContent = 'Confirm Selection';
    }
});

// Google Login
googleLoginBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login Error:", error);
    }
});

userInfo.addEventListener('click', async () => {
    if(confirm("Do you want to logout?")) {
        if (auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { online: false });
            await signOut(auth);
            window.location.reload();
        }
    }
});

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
    
    if (auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            prefGender: myInfo.prefGender,
            insta: myInfo.insta,
            whatsapp: myInfo.whatsapp,
            showInfo: myInfo.showInfo
        });
    }
    settingsModal.classList.remove('active');
}

function updateLocalSocialIcons() {
    const instaLink = document.getElementById('myInstaLink');
    const waLink = document.getElementById('myWhatsappLink');
    
    if(myInfo.insta) {
        instaLink.href = `https://instagram.com/${myInfo.insta}`;
        instaLink.style.display = 'flex';
    } else {
        instaLink.style.display = 'none';
    }
    
    if(myInfo.whatsapp) {
        const waClean = myInfo.whatsapp.replace(/[^\d+]/g, '');
        waLink.href = `https://wa.me/${waClean}`;
        waLink.style.display = 'flex';
    } else {
        waLink.style.display = 'none';
    }
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
            addSystemMessage("Connected to a stranger.");
        }
    },
    onDisconnect: () => {
        isMatched = false;
        remoteVideo.srcObject = null;
        remoteStatus.textContent = "Stranger has disconnected.";
        remoteStatus.style.display = 'block';
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
    onPartnerInfo: (info) => {
        // No longer showing name/gender in webcam overlay as per request
    },
    onPartnerSocial: (instaId, whatsappNum) => {
        const partnerSocialDiv = document.getElementById('partnerSocial');
        const partnerInstaLink = document.getElementById('partnerInstaLink');
        const partnerWaLink = document.getElementById('partnerWhatsappLink');
        
        const partnerInfoDiv = document.getElementById('partnerInfo');
        const partnerInstaIdTop = document.getElementById('partnerInstaIdTop');
        
        let hasSocial = false;
        if (instaId) {
            partnerInstaLink.href = `https://instagram.com/${instaId}`;
            partnerInstaLink.style.display = 'flex';
            if (partnerInfoDiv && partnerInstaIdTop) {
                partnerInfoDiv.style.display = 'block';
                partnerInstaIdTop.textContent = instaId;
            }
            hasSocial = true;
        } else {
            partnerInstaLink.style.display = 'none';
            if (partnerInfoDiv) partnerInfoDiv.style.display = 'none';
        }
        
        if (whatsappNum) {
            const waClean = whatsappNum.replace(/[^\d+]/g, '');
            partnerWaLink.href = `https://wa.me/${waClean}`;
            partnerWaLink.style.display = 'flex';
            hasSocial = true;
        } else {
            partnerWaLink.style.display = 'none';
        }
        partnerSocialDiv.style.display = hasSocial ? 'flex' : 'none';
    }
};

findMatchBtn.addEventListener('click', async () => {
    if (myInfo.gender === 'unspecified') {
        genderModal.classList.add('active');
        return;
    }
    findMatchBtn.disabled = true;
    hangupBtn.disabled = false;
    chatMessagesInner.innerHTML = '';
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
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Draggable Local Video Logic with Boundary Constraints
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

localVideoContainer.addEventListener("mousedown", dragStart);
localVideoContainer.addEventListener("touchstart", dragStart, {passive: false});

document.addEventListener("mouseup", dragEnd);
document.addEventListener("touchend", dragEnd);

document.addEventListener("mousemove", drag);
document.addEventListener("touchmove", drag, {passive: false});

function dragStart(e) {
    if (e.type === "touchstart") {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
    } else {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
    }
    
    if (e.target === localVideoContainer || e.target === localVideo || localVideoContainer.contains(e.target)) {
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
        
        let clientX, clientY;
        if (e.type === "touchmove") {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        currentX = clientX - initialX;
        currentY = clientY - initialY;

        // Constraint within viewport
        const rect = localVideoContainer.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        // Use translate relative to initial position
        // For simplicity, we just allow free movement as requested
        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, localVideoContainer);
    }
}

function setTranslate(xPos, yPos, el) {
    const scale = el.classList.contains('hovered') || isDragging ? 'scale(1.05)' : 'scale(1)';
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0) ${scale}`;
}

// Handle Hover Scale independently
localVideoContainer.addEventListener('mouseenter', () => {
    localVideoContainer.classList.add('hovered');
    setTranslate(xOffset, yOffset, localVideoContainer);
});
localVideoContainer.addEventListener('mouseleave', () => {
    localVideoContainer.classList.remove('hovered');
    if (!isDragging) {
        setTranslate(xOffset, yOffset, localVideoContainer);
    }
});

init();