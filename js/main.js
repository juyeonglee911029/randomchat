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
let isMicMuted = false;
let isMirrored = false;
let currentBrightness = 100;
let statusTimeout = null;

// Initialization
async function init() {
    // Attempt camera access immediately
    const success = await initMedia(localVideo);
    if (!success) {
        console.warn("Could not access camera/microphone.");
    }

    // Webcam Controls Event Listeners
    if (micToggleBtn) {
        micToggleBtn.addEventListener('click', () => {
            isMicMuted = !isMicMuted;
            setMicGain(isMicMuted ? 0 : 1);
            micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
            if (isMicMuted) {
                micVolumeSlider.value = 0;
            } else {
                micVolumeSlider.value = 1;
            }
        });
    }

    if (micVolumeSlider) {
        micVolumeSlider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            setMicGain(vol);
            isMicMuted = vol === 0;
            micToggleBtn.textContent = isMicMuted ? 'mic_off' : 'mic';
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            remoteVideo.volume = e.target.value;
            if (remoteVolumeBtn) {
                if (e.target.value == 0) remoteVolumeBtn.textContent = 'volume_off';
                else if (e.target.value < 0.5) remoteVolumeBtn.textContent = 'volume_down';
                else remoteVolumeBtn.textContent = 'volume_up';
            }
        });
    }

    if (mirrorToggleBtn) {
        mirrorToggleBtn.addEventListener('click', () => {
            isMirrored = !isMirrored;
            mirrorToggleBtn.classList.toggle('active', isMirrored);
            // Apply locally
            localVideo.style.transform = isMirrored ? 'scaleX(-1)' : 'none';
            // This affects how PARTNER sees me
            sendEffectUpdate({ mirror: isMirrored });
        });
    }

    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            currentBrightness = e.target.value;
            // Apply locally
            localVideo.style.filter = `brightness(${currentBrightness}%)`;
            // This affects how PARTNER sees me
            sendEffectUpdate({ brightness: currentBrightness });
        });
    }

    // Escape key listener for matching
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (autoMatchInterval) {
                stopAutoMatching();
                hangup();
                callbacks.onDisconnect();
                addSystemMessage("Matching cancelled.");
            }
        }
    });

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
    const q = query(collection(db, 'users'), where('online', '==', true));
    onSnapshot(q, (snap) => {
        let activeCount = 0;
        const now = Date.now();
        const activeThreshold = 2 * 60 * 1000;
        snap.forEach(doc => {
            const data = doc.data();
            if (now - (data.lastSeen || 0) < activeThreshold) activeCount++;
        });
        if (onlineUsersEl) onlineUsersEl.textContent = activeCount;
    });

    // Update lastSeen
    setInterval(async () => {
        if (auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { lastSeen: Date.now(), online: true });
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
    try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { gender: selectedGender });
        myInfo.gender = selectedGender;
        genderModal.classList.remove('active');
        loadSettingsToUI();
    } catch (err) {
        console.error("Error saving gender:", err);
        confirmGenderBtn.disabled = false;
    }
});

// Google Login
googleLoginBtn.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
});

userInfo.addEventListener('click', async () => {
    if(confirm("Logout?")) {
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
            prefGender: myInfo.prefGender, insta: myInfo.insta, whatsapp: myInfo.whatsapp, showInfo: myInfo.showInfo
        });
    }
    settingsModal.classList.remove('active');
}

function updateLocalSocialIcons() {
    const instaLink = document.getElementById('myInstaLink');
    const waLink = document.getElementById('myWhatsappLink');
    if(myInfo.insta) { instaLink.href = `https://instagram.com/${myInfo.insta}`; instaLink.style.display = 'flex'; }
    else instaLink.style.display = 'none';
    if(myInfo.whatsapp) { waLink.href = `https://wa.me/${myInfo.whatsapp.replace(/[^\d+]/g, '')}`; waLink.style.display = 'flex'; }
    else waLink.style.display = 'none';
}

// Auto Matching Logic
let autoMatchInterval = null;

function setStatus(msg, autoHide = true) {
    if (statusTimeout) clearTimeout(statusTimeout);
    remoteStatus.textContent = msg;
    remoteStatus.style.display = 'block';
    if (autoHide) {
        statusTimeout = setTimeout(() => {
            remoteStatus.style.display = 'none';
        }, 3000); // Auto hide after 3 seconds
    }
}

async function startAutoMatching() {
    if (autoMatchInterval) return;
    document.getElementById('matchingOverlay').style.display = 'flex';
    const attemptMatch = async () => {
        // Only attempt if not already matched AND not in the middle of a connection attempt
        if (isMatched || isConnecting) {
            console.log("Skipping match attempt: matched=" + isMatched + ", connecting=" + isConnecting);
            return;
        }
        
        isConnecting = true;
        console.log("Attempting to find match...");
        await findMatch(remoteVideo, myInfo, callbacks);
    };
    
    await attemptMatch();
    autoMatchInterval = setInterval(async () => {
        if (!isMatched && !isConnecting) await attemptMatch();
        else if (isMatched) stopAutoMatching();
    }, 5000); // Slightly increased interval for stability
}

function stopAutoMatching() {
    if (autoMatchInterval) { clearInterval(autoMatchInterval); autoMatchInterval = null; }
    isConnecting = false;
    document.getElementById('matchingOverlay').style.display = 'none';
}

const callbacks = {
    onStatus: (msg) => {
        console.log("Status update:", msg);
        if (msg === "Connected!") {
            setStatus(msg, true);
            isMatched = true;
            isConnecting = false;
            stopAutoMatching();
            const transitionOverlay = document.getElementById('transitionOverlay');
            if (transitionOverlay) {
                transitionOverlay.style.display = 'flex';
                setTimeout(() => { transitionOverlay.style.display = 'none'; }, 1500);
            }
            hangupBtn.disabled = false;
            findMatchBtn.disabled = true;
            messageInput.disabled = false;
            sendBtn.disabled = false;
            addSystemMessage("Connected to a stranger.");
            
            // Sync initial effects on connect
            sendEffectUpdate({ mirror: isMirrored, brightness: currentBrightness });
        } else {
            setStatus(msg, true);
        }
    },
    onDisconnect: () => {
        console.log("Disconnected callback triggered");
        isMatched = false;
        isConnecting = false;
        stopAutoMatching();
        remoteVideo.srcObject = null;
        remoteVideo.style.filter = 'none';
        remoteVideo.style.transform = 'none';
        setStatus("Stranger has disconnected.", true);
        const partnerInfo = document.getElementById('partnerInfo');
        if (partnerInfo) partnerInfo.style.display = 'none';
        partnerSocial.style.display = 'none';
        hangupBtn.disabled = true;
        findMatchBtn.disabled = false;
        messageInput.disabled = true;
        sendBtn.disabled = true;
        addSystemMessage("Stranger has disconnected.");
        hangup();
    },
    onMessage: (msg) => addChatMessage(msg.text, msg.isMe),
    onPartnerSocial: (instaId, whatsappNum) => {
        const partnerInfoDiv = document.getElementById('partnerInfo');
        const partnerInstaIdTop = document.getElementById('partnerInstaIdTop');
        const partnerSocialDiv = document.getElementById('partnerSocial');
        if (instaId) {
            document.getElementById('partnerInstaLink').href = `https://instagram.com/${instaId}`;
            document.getElementById('partnerInstaLink').style.display = 'flex';
            if (partnerInfoDiv) { partnerInfoDiv.style.display = 'block'; partnerInstaIdTop.textContent = instaId; }
        }
        if (whatsappNum) {
            document.getElementById('partnerWhatsappLink').href = `https://wa.me/${whatsappNum.replace(/[^\d+]/g, '')}`;
            document.getElementById('partnerWhatsappLink').style.display = 'flex';
        }
        partnerSocialDiv.style.display = (instaId || whatsappNum) ? 'flex' : 'none';
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

findMatchBtn.addEventListener('click', async () => {
    if (myInfo.gender === 'unspecified') { genderModal.classList.add('active'); return; }
    findMatchBtn.disabled = true;
    hangupBtn.disabled = false;
    chatMessagesInner.innerHTML = '';
    addSystemMessage("Searching...");
    startAutoMatching();
});

hangupBtn.addEventListener('click', () => { stopAutoMatching(); hangup(); callbacks.onDisconnect(); });
settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
closeBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
saveSettingsBtn.addEventListener('click', saveSettings);

function addSystemMessage(text) {
    const div = document.createElement('div'); div.className = 'system-message'; div.textContent = text;
    chatMessagesInner.appendChild(div); chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}

function addChatMessage(text, isMe) {
    const div = document.createElement('div'); div.className = `message ${isMe ? 'me' : 'them'}`; div.textContent = text;
    chatMessagesInner.appendChild(div); chatMessagesInner.scrollTop = chatMessagesInner.scrollHeight;
}

async function handleSend() {
    const text = messageInput.value.trim();
    if (!text || !isMatched) return;
    messageInput.value = '';
    await sendChatMessage(text);
}

sendBtn.addEventListener('click', handleSend);
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });

// Draggable Local Video Logic
let isDragging = false;
let currentX = 0, currentY = 0, initialX, initialY, xOffset = 0, yOffset = 0;

localVideoContainer.addEventListener("mousedown", dragStart);
localVideoContainer.addEventListener("touchstart", dragStart, {passive: false});
document.addEventListener("mouseup", dragEnd);
document.addEventListener("touchend", dragEnd);
document.addEventListener("mousemove", drag);
document.addEventListener("touchmove", drag, {passive: false});

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
        
        let targetX = clientX - initialX;
        let targetY = clientY - initialY;

        // Boundary restriction logic
        const container = document.querySelector('.video-container');
        const wrapper = localVideoContainer;
        
        if (container && wrapper) {
            const containerRect = container.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            // Calculate the initial position relative to the container
            // Since .local-wrapper has bottom: 20px; right: 20px;
            // The transform (currentX, currentY) is added to this initial position.
            
            // We need to ensure that:
            // containerRect.left <= wrapperRect.left + deltaX
            // containerRect.right >= wrapperRect.right + deltaX
            // containerRect.top <= wrapperRect.top + deltaY
            // containerRect.bottom >= wrapperRect.bottom + deltaY

            // However, a simpler way is to clamp the absolute position and then convert back to relative transform.
            // But even simpler: just clamp currentX and currentY based on available space.
            
            // The wrapper's position without transform:
            const initialLeft = containerRect.right - wrapperRect.width - 20;
            const initialTop = containerRect.bottom - wrapperRect.height - 20;

            // Min and Max transform values
            const minX = containerRect.left - initialLeft;
            const maxX = containerRect.right - (initialLeft + wrapperRect.width);
            const minY = containerRect.top - initialTop;
            const maxY = containerRect.bottom - (initialTop + wrapperRect.height);

            targetX = Math.min(Math.max(targetX, minX), maxX);
            targetY = Math.min(Math.max(targetY, minY), maxY);
        }

        currentX = targetX;
        currentY = targetY;
        xOffset = currentX;
        yOffset = currentY;
        localVideoContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
}

init();